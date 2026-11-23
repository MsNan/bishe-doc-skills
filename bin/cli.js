#!/usr/bin/env node
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')

const SKILLS_DIR = path.join(__dirname, '..', 'skills')
const TOOLS = ['claude', 'cursor', 'trae', 'codex']
const MARK = 'bishe-doc-skills'
const HELP = `bishe-doc-skills - 把毕设文档写作技能装进你的项目（开题报告/需求分析/系统设计/论文规范/测试/答辩）

用法:
  npx -y github:MsNan/bishe-doc-skills [选项]

选项:
  -t, --tool <名称>   claude | cursor | trae | codex | all（默认 all，可逗号分隔）
                      默认 all 会装 Claude/Trae/Codex；因 Cursor 会读取
                      .claude/skills 与 .agents/skills，不再重复写 .cursor/skills。
                      只需 Cursor 时请用 --tool cursor（写入 .cursor/skills，
                      源文件里的 globs 会转成官方 paths）。
  -s, --skills <列表> 只安装指定技能，逗号分隔（默认全部）
  -d, --dir <路径>    目标项目目录（默认当前目录）
  -g, --global        Claude 装到 ~/.claude/skills，Cursor 装到 ~/.cursor/skills，
                      Trae 装到 ~/.trae/skills（若只检测到国内版目录则用 ~/.trae-cn/skills）
  -f, --force         覆盖已存在文件
  -l, --list          列出所有技能
  -h, --help          显示帮助
`

class CliError extends Error {}

function parseArgs(argv, cwd = process.cwd()) {
  const o = { tool: 'all', skills: null, dir: cwd, global: false, force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined || v.startsWith('-')) throw new CliError(`参数 ${a} 缺少值`)
      return v
    }
    if (a === '-t' || a === '--tool') o.tool = next()
    else if (a === '-s' || a === '--skills') o.skills = next().split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '-d' || a === '--dir') o.dir = path.resolve(cwd, next())
    else if (a === '-g' || a === '--global') o.global = true
    else if (a === '-f' || a === '--force') o.force = true
    else if (a === '-l' || a === '--list') o.list = true
    else if (a === '-h' || a === '--help') o.help = true
    else throw new CliError('未知参数: ' + a)
  }
  return o
}

function unquote(v) {
  if (/^".*"$/.test(v)) { try { return JSON.parse(v) } catch { return v.slice(1, -1) } }
  return v
}

// YAML 双引号字符串（JSON 字符串是合法的 YAML），避免 description 里的 ": "、"#"、引号破坏 frontmatter
const yamlStr = v => JSON.stringify(String(v))

// Cursor 官方 SKILL.md 的 paths：YAML 列表，每项加引号。没有 globs 时不写该字段
// 见 https://cursor.com/docs/skills
function cursorPathsFrontmatter(globs) {
  const items = (globs || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!items.length) return ''
  return 'paths:\n' + items.map(g => '  - ' + JSON.stringify(g)).join('\n') + '\n'
}

function parseSkill(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const meta = {}
  if (m) for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = unquote(line.slice(i + 1).trim())
  }
  return { meta, body: m ? m[2] : raw }
}

function listSkills(dir = SKILLS_DIR) {
  return fs.readdirSync(dir).filter(n => fs.existsSync(path.join(dir, n, 'SKILL.md'))).sort()
}

function write(file, content, force, stats) {
  if (fs.existsSync(file) && !force) { stats.skipped.push(file); return }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
  stats.written.push(file)
}

// Trae 官方技能目录：项目为 .trae/skills/<name>/SKILL.md
// 全局：国际版 ~/.trae/skills（https://docs.trae.ai/ide/skills）；
// 国内版 ~/.trae-cn/skills（https://docs.trae.cn/ide_skills）。
// 只存在国内版配置目录时用 ~/.trae-cn/skills，否则默认 ~/.trae/skills。
function traeGlobalSkillsDir(home) {
  const cn = path.join(home, '.trae-cn')
  const intl = path.join(home, '.trae')
  if (fs.existsSync(cn) && !fs.existsSync(intl)) return path.join(cn, 'skills')
  return path.join(intl, 'skills')
}

// 在 AGENTS.md 里找自己的区块：只认「整行就是标记」且不在 ``` / ~~~ 代码块里的行。
// 标记不成对（用户删了一半）、出现多个区块、顺序颠倒时不去猜，直接报错让用户处理，避免误删用户内容
function findAgentsBlock(text) {
  const start = `<!-- ${MARK}:start -->`, end = `<!-- ${MARK}:end -->`
  const lines = text.split('\n')
  const starts = [], ends = []
  let fence = null
  lines.forEach((raw, i) => {
    const line = raw.replace(/\r$/, '').trim()
    const f = line.match(/^(`{3,}|~{3,})/)
    if (f) { if (!fence) fence = f[1]; else if (line.startsWith(fence[0].repeat(fence.length)) && !line.slice(fence.length).replace(/[`~]/g, '').trim()) fence = null; return }
    if (fence) return
    if (line === start) starts.push(i)
    else if (line === end) ends.push(i)
  })
  if (!starts.length && !ends.length) return null
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) {
    throw new CliError(`AGENTS.md 里的 ${MARK} 标记不成对或出现了多次（start ${starts.length} 个，end ${ends.length} 个），为避免覆盖你的内容没有修改它。\n请手动删掉残留的标记行（或整个旧区块）后重试`)
  }
  return { lines, from: starts[0], to: ends[0] }
}

// 合并而不是覆盖：保留之前分批安装的技能条目（按技能名去重、排序）；内容不变时不写文件。返回是否写入
function upsertAgentsBlock(file, entries) {
  const start = `<!-- ${MARK}:start -->`, end = `<!-- ${MARK}:end -->`
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const eol = cur.includes('\r\n') ? '\r\n' : '\n'
  const found = findAgentsBlock(cur)
  const map = new Map()
  if (found) for (const l of found.lines.slice(found.from + 1, found.to)) {
    const m = l.replace(/\r$/, '').match(/^- `([^`]+)`.*$/)
    if (m) map.set(m[1], m[0])
  }
  for (const [n, line] of entries) map.set(n, line)
  const body = [start, '## 毕设文档技能', '写开题报告、论文章节、测试或答辩材料前，先阅读对应技能文件：', ...[...map.keys()].sort().map(k => map.get(k)), end]
  let next
  if (found) {
    // 按 \n 切行，CRLF 文件的每行末尾还带着 \r；新写的行沿用文件原来的换行风格
    const cr = eol === '\r\n' ? '\r' : ''
    const tail = found.lines[found.to].endsWith('\r') || found.to < found.lines.length - 1 ? cr : ''
    const ls = found.lines.slice()
    ls.splice(found.from, found.to - found.from + 1, ...body.slice(0, -1).map(l => l + cr), body[body.length - 1] + tail)
    next = ls.join('\n')
  } else {
    next = (cur ? cur.replace(/(\r?\n)*$/, eol + eol) : '') + body.join(eol) + eol
  }
  if (next === cur) return false
  fs.writeFileSync(file, next)
  return true
}

function install(o, { skillsDir = SKILLS_DIR, home = os.homedir() } = {}) {
  const all = listSkills(skillsDir)
  const names = o.skills || all
  const bad = names.filter(n => !all.includes(n))
  if (bad.length) throw new CliError('不存在的技能: ' + bad.join(', ') + '\n用 --list 查看')
  const tools = o.tool === 'all' ? TOOLS : [...new Set(o.tool.split(',').map(s => s.trim()).filter(Boolean))]
  const badT = tools.filter(t => !TOOLS.includes(t))
  if (!tools.length || badT.length) throw new CliError('不支持的工具: ' + (badT.join(', ') || o.tool))

  // 先检查 AGENTS.md 标记，出错时一个文件都不写
  if (tools.includes('codex')) { const f = path.join(o.dir, 'AGENTS.md'); if (fs.existsSync(f)) findAgentsBlock(fs.readFileSync(f, 'utf8')) }
  // Cursor 官方文档（https://cursor.com/docs/skills）：除 .cursor/skills 外，
  // 还会兼容加载 .claude/skills 与 .agents/skills。同时再写一份 .cursor/skills 会让同一套内容出现两次。
  const cursorCompatSkip = tools.includes('cursor') && (tools.includes('claude') || tools.includes('codex'))
  const stats = { written: [], skipped: [], tools, names, cursorCompatSkip, staleCursorRules: [], staleTraeRules: [] }
  const agentsLines = []
  for (const n of names) {
    const { meta, body } = parseSkill(path.join(skillsDir, n, 'SKILL.md'))
    const desc = meta.description || n
    const skillMd = `---\nname: ${n}\ndescription: ${yamlStr(desc)}\n---\n${body}`
    for (const t of tools) {
      if (t === 'claude') {
        const base = o.global ? path.join(home, '.claude', 'skills') : path.join(o.dir, '.claude', 'skills')
        write(path.join(base, n, 'SKILL.md'), skillMd, o.force, stats)
      } else if (t === 'cursor') {
        if (cursorCompatSkip) continue
        const base = o.global ? path.join(home, '.cursor', 'skills') : path.join(o.dir, '.cursor', 'skills')
        write(path.join(base, n, 'SKILL.md'), `---\nname: ${n}\ndescription: ${yamlStr(desc)}\n${cursorPathsFrontmatter(meta.globs)}---\n${body}`, o.force, stats)
      } else if (t === 'trae') {
        const base = o.global ? traeGlobalSkillsDir(home) : path.join(o.dir, '.trae', 'skills')
        write(path.join(base, n, 'SKILL.md'), skillMd, o.force, stats)
      } else if (t === 'codex') {
        write(path.join(o.dir, '.agents', 'skills', n, 'SKILL.md'), skillMd, o.force, stats)
        agentsLines.push([n, `- \`${n}\`：${desc}（详见 .agents/skills/${n}/SKILL.md）`])
      }
    }
  }
  // 旧版 --tool cursor 写入的 .mdc 规则仍会被 Cursor 加载，与新的 skills 重复；只提示不自动删除
  if (tools.includes('cursor')) {
    for (const n of names) {
      const stale = path.join(o.dir, '.cursor', 'rules', n + '.mdc')
      if (fs.existsSync(stale)) stats.staleCursorRules.push(stale)
    }
  }
  // 旧版 --tool trae 写入的 .trae/rules 仍会被 Trae 当规则加载，与官方技能目录重复；只提示不自动删除
  if (tools.includes('trae')) {
    for (const n of names) {
      const stale = path.join(o.dir, '.trae', 'rules', n + '.md')
      if (fs.existsSync(stale)) stats.staleTraeRules.push(stale)
    }
  }
  if (agentsLines.length) {
    const f = path.join(o.dir, 'AGENTS.md')
    if (upsertAgentsBlock(f, agentsLines)) stats.written.push(f)
  }
  return stats
}

function main(argv = process.argv.slice(2)) {
  try {
    const o = parseArgs(argv)
    if (o.help) return console.log(HELP)
    if (o.list) {
      for (const n of listSkills()) console.log(`  ${n.padEnd(24)} ${parseSkill(path.join(SKILLS_DIR, n, 'SKILL.md')).meta.description}`)
      return
    }
    const s = install(o)
    console.log(`✅ 已写入 ${s.written.length} 个文件（工具: ${s.tools.join(', ')}，技能: ${s.names.length} 个）`)
    if (s.skipped.length) console.log(`⏭️  跳过 ${s.skipped.length} 个已存在文件，加 --force 覆盖`)
    if (s.cursorCompatSkip) {
      console.log('ℹ️  未写入 .cursor/skills：按 Cursor 官方文档，Cursor 会从 .claude/skills/ 和 .agents/skills/ 加载技能（https://cursor.com/docs/skills）。只需 Cursor 时请用 --tool cursor。')
      if (s.tools.includes('claude') && s.tools.includes('codex')) {
        console.log('ℹ️  同时安装了 Claude 与 Codex 技能目录时，Cursor 可能把同一技能显示两次；主要用 Cursor 请改用 --tool cursor。')
      }
    }
    if (s.staleCursorRules && s.staleCursorRules.length) {
      console.log(`⚠️  检测到先前安装留下的 ${s.staleCursorRules.length} 个 .cursor/rules 文件，Cursor 还会从技能目录加载同一内容，建议删掉以免重复：`)
      for (const f of s.staleCursorRules) console.log('   ' + f)
    }
    if (s.staleTraeRules && s.staleTraeRules.length) {
      console.log(`⚠️  检测到先前安装留下的 ${s.staleTraeRules.length} 个 .trae/rules 文件，Trae 还会从 .trae/skills 加载同一内容，建议删掉以免规则和技能重复：`)
      for (const f of s.staleTraeRules) console.log('   ' + f)
    }
    console.log('☕ 觉得有用欢迎 Star: https://github.com/MsNan/bishe-doc-skills')
  } catch (e) {
    if (e instanceof CliError) { console.error(e.message); process.exitCode = 1 } else throw e
  }
}

module.exports = { parseArgs, parseSkill, listSkills, install, upsertAgentsBlock, findAgentsBlock, TOOLS, CliError }

// npx 下 bin 是软链接，需比较真实路径
if (require.main && fs.realpathSync(require.main.filename) === fs.realpathSync(__filename)) main()
