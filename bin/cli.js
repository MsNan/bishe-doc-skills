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

function parseSkill(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const meta = {}
  if (m) for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')
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

function upsertAgentsBlock(file, lines) {
  const start = `<!-- ${MARK}:start -->`, end = `<!-- ${MARK}:end -->`
  const block = `${start}\n## 毕设文档技能\n写开题报告、论文章节、测试或答辩材料前，先阅读对应技能文件：\n${lines.join('\n')}\n${end}\n`
  let cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const re = new RegExp(`${start}[\\s\\S]*?${end}\\n?`)
  cur = re.test(cur) ? cur.replace(re, block) : (cur ? cur.replace(/\n*$/, '\n\n') : '') + block
  fs.writeFileSync(file, cur)
}

function install(o, { skillsDir = SKILLS_DIR, home = os.homedir() } = {}) {
  const all = listSkills(skillsDir)
  const names = o.skills || all
  const bad = names.filter(n => !all.includes(n))
  if (bad.length) throw new CliError('不存在的技能: ' + bad.join(', ') + '\n用 --list 查看')
  const tools = o.tool === 'all' ? TOOLS : [...new Set(o.tool.split(',').map(s => s.trim()).filter(Boolean))]
  const badT = tools.filter(t => !TOOLS.includes(t))
  if (!tools.length || badT.length) throw new CliError('不支持的工具: ' + (badT.join(', ') || o.tool))

  const stats = { written: [], skipped: [], tools, names }
  const agentsLines = []
  for (const n of names) {
    const { meta, body } = parseSkill(path.join(skillsDir, n, 'SKILL.md'))
    const desc = meta.description || n
    const skillMd = `---\nname: ${n}\ndescription: ${desc}\n---\n${body}`
    for (const t of tools) {
      if (t === 'claude') {
        const base = o.global ? path.join(home, '.claude', 'skills') : path.join(o.dir, '.claude', 'skills')
        write(path.join(base, n, 'SKILL.md'), skillMd, o.force, stats)
      } else if (t === 'cursor') {
        write(path.join(o.dir, '.cursor', 'rules', `${n}.mdc`), `---\ndescription: ${desc}\nglobs:\nalwaysApply: false\n---\n${body}`, o.force, stats)
      } else if (t === 'trae') {
        write(path.join(o.dir, '.trae', 'rules', `${n}.md`), `<!-- ${desc} -->\n${body}`, o.force, stats)
      } else if (t === 'codex') {
        write(path.join(o.dir, '.agents', 'skills', n, 'SKILL.md'), skillMd, o.force, stats)
        agentsLines.push(`- \`${n}\`：${desc}（详见 .agents/skills/${n}/SKILL.md）`)
      }
    }
  }
  if (agentsLines.length) {
    const f = path.join(o.dir, 'AGENTS.md')
    upsertAgentsBlock(f, agentsLines)
    stats.written.push(f)
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

module.exports = { parseArgs, parseSkill, listSkills, install, upsertAgentsBlock, TOOLS, CliError }

// npx 下 bin 是软链接，需比较真实路径
if (require.main && fs.realpathSync(require.main.filename) === fs.realpathSync(__filename)) main()
