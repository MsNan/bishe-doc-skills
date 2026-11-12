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
  -s, --skills <列表> 只安装指定技能，逗号分隔（默认全部）
  -d, --dir <路径>    目标项目目录（默认当前目录）
  -g, --global        Claude Code 安装到 ~/.claude/skills（对所有项目生效）
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
  const stats = { written: [], skipped: [], tools, names }
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
        write(path.join(o.dir, '.cursor', 'rules', `${n}.mdc`), `---\ndescription: ${yamlStr(desc)}\nglobs:\nalwaysApply: false\n---\n${body}`, o.force, stats)
      } else if (t === 'trae') {
        write(path.join(o.dir, '.trae', 'rules', `${n}.md`), `<!-- ${desc} -->\n${body}`, o.force, stats)
      } else if (t === 'codex') {
        write(path.join(o.dir, '.agents', 'skills', n, 'SKILL.md'), skillMd, o.force, stats)
        agentsLines.push([n, `- \`${n}\`：${desc}（详见 .agents/skills/${n}/SKILL.md）`])
      }
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
    console.log('☕ 觉得有用欢迎 Star: https://github.com/MsNan/bishe-doc-skills')
  } catch (e) {
    if (e instanceof CliError) { console.error(e.message); process.exitCode = 1 } else throw e
  }
}

module.exports = { parseArgs, parseSkill, listSkills, install, upsertAgentsBlock, findAgentsBlock, TOOLS, CliError }

// npx 下 bin 是软链接，需比较真实路径
if (require.main && fs.realpathSync(require.main.filename) === fs.realpathSync(__filename)) main()
