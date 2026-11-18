'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
const { parseArgs, install, listSkills, CliError } = require('../bin/cli')

const CLI = path.join(__dirname, '..', 'bin', 'cli.js')
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bishe-'))

test('parseArgs 解析参数并拒绝缺值/未知参数', () => {
  const o = parseArgs(['-t', 'claude,cursor', '-s', 'defense-prep', '-f', '-d', 'x'], '/base')
  assert.strictEqual(o.tool, 'claude,cursor')
  assert.deepStrictEqual(o.skills, ['defense-prep'])
  assert.strictEqual(o.force, true)
  assert.strictEqual(o.dir, path.resolve('/base', 'x'))
  assert.throws(() => parseArgs(['--tool']), CliError)
  assert.throws(() => parseArgs(['--tool', '--force']), CliError)
  assert.throws(() => parseArgs(['--nope']), CliError)
})

test('全量安装写入 Claude/Trae/Codex，不再重复写 Cursor 规则', () => {
  const dir = tmp()
  const s = install({ tool: 'all', skills: null, dir, force: false })
  const n = listSkills().length
  assert.strictEqual(s.skipped.length, 0)
  // Claude + Trae + Codex 技能文件，再加 AGENTS.md；Cursor 会读 .claude/.agents，不再写 .cursor/rules
  assert.strictEqual(s.written.length, n * 3 + 1)
  assert.strictEqual(s.cursorCompatSkip, true)
  const claude = fs.readFileSync(path.join(dir, '.claude/skills/thesis-writing/SKILL.md'), 'utf8')
  assert.match(claude, /^---\nname: thesis-writing\ndescription: .+\n---\n/)
  assert.ok(fs.existsSync(path.join(dir, '.trae/rules/defense-prep.md')))
  assert.ok(fs.existsSync(path.join(dir, '.agents/skills/code-to-thesis/SKILL.md')))
  assert.ok(!fs.existsSync(path.join(dir, '.cursor/rules')))
  assert.ok(!fs.existsSync(path.join(dir, '.cursor/skills')))
})

test('Cursor 技能写入 .cursor/skills；没有 globs 时不写 paths，有 globs 时转为官方 paths 列表', () => {
  const dir = tmp()
  const s = install({ tool: 'cursor', skills: ['system-design'], dir })
  assert.notStrictEqual(s.cursorCompatSkip, true)
  const skill = fs.readFileSync(path.join(dir, '.cursor/skills/system-design/SKILL.md'), 'utf8')
  assert.match(skill, /^---\nname: system-design\ndescription: ".+"\n---\n/)
  assert.doesNotMatch(skill, /^paths:/m)
  assert.ok(!fs.existsSync(path.join(dir, '.cursor/rules')))

  const src = tmp()
  fs.mkdirSync(path.join(src, 'demo-skill'))
  fs.writeFileSync(path.join(src, 'demo-skill', 'SKILL.md'), '---\nname: demo-skill\ndescription: 带 globs 的演示技能\nglobs: "**/*.md,docs/**/*.docx"\n---\n正文\n')
  const dir2 = tmp()
  install({ tool: 'cursor', skills: null, dir: dir2 }, { skillsDir: src })
  const withPaths = fs.readFileSync(path.join(dir2, '.cursor/skills/demo-skill/SKILL.md'), 'utf8')
  assert.match(withPaths, /^---\nname: demo-skill\ndescription: ".+"\npaths:\n  - "\*\*\/\*\.md"\n  - "docs\/\*\*\/\*\.docx"\n---\n/)
})

test('已存在文件默认跳过，--force 覆盖', () => {
  const dir = tmp()
  const f = path.join(dir, '.claude/skills/defense-prep/SKILL.md')
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, 'mine')
  let s = install({ tool: 'claude', skills: ['defense-prep'], dir, force: false })
  assert.deepStrictEqual(s.skipped, [f])
  assert.strictEqual(fs.readFileSync(f, 'utf8'), 'mine')
  s = install({ tool: 'claude', skills: ['defense-prep'], dir, force: true })
  assert.notStrictEqual(fs.readFileSync(f, 'utf8'), 'mine')
})

test('AGENTS.md 保留用户内容，重复安装只替换自己的区块', () => {
  const dir = tmp()
  const f = path.join(dir, 'AGENTS.md')
  fs.writeFileSync(f, '# 我的项目规则\n不要改 dist\n')
  install({ tool: 'codex', skills: ['thesis-proposal'], dir })
  install({ tool: 'codex', skills: ['thesis-proposal', 'test-chapter'], dir })
  const txt = fs.readFileSync(f, 'utf8')
  assert.ok(txt.startsWith('# 我的项目规则\n不要改 dist\n'))
  assert.strictEqual(txt.match(/bishe-doc-skills:start/g).length, 1)
  assert.match(txt, /test-chapter/)
})

test('--global 把 Claude 技能装到 home 目录', () => {
  const dir = tmp(), home = tmp()
  install({ tool: 'claude', skills: ['thesis-writing'], dir, global: true }, { home })
  assert.ok(fs.existsSync(path.join(home, '.claude/skills/thesis-writing/SKILL.md')))
  assert.ok(!fs.existsSync(path.join(dir, '.claude')))
})

test('非法技能/工具给出错误', () => {
  assert.throws(() => install({ tool: 'all', skills: ['nope'], dir: tmp() }), /不存在的技能/)
  assert.throws(() => install({ tool: 'vscode', dir: tmp() }), /不支持的工具/)
})

test('命令行：通过软链接调用也能运行（模拟 npx），错误时退出码为 1', () => {
  const dir = tmp()
  const link = path.join(tmp(), 'bishe-doc-skills')
  fs.symlinkSync(CLI, link)
  const out = execFileSync(process.execPath, [link, '-t', 'trae', '-d', dir], { encoding: 'utf8' })
  assert.match(out, /已写入 \d+ 个文件/)
  assert.ok(fs.existsSync(path.join(dir, '.trae/rules/thesis-proposal.md')))
  const r = spawnSync(process.execPath, [CLI, '--bad'], { encoding: 'utf8' })
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /未知参数/)
  assert.match(execFileSync(process.execPath, [CLI, '--list'], { encoding: 'utf8' }), /defense-prep/)
})

test('-s 分批安装：AGENTS.md 索引累积而不是被覆盖，内容不变时不重写', () => {
  const dir = tmp()
  const f = path.join(dir, 'AGENTS.md')
  install({ tool: 'codex', skills: ['thesis-proposal'], dir })
  install({ tool: 'codex', skills: ['test-chapter'], dir })
  let txt = fs.readFileSync(f, 'utf8')
  assert.match(txt, /`thesis-proposal`/)
  assert.match(txt, /`test-chapter`/)
  // 再装一次同样的技能（文件全部跳过）：AGENTS.md 不应被重写，也不计入 written
  const mtime = fs.statSync(f).mtimeMs
  fs.utimesSync(f, new Date(1000), new Date(1000))
  const s = install({ tool: 'codex', skills: ['test-chapter'], dir })
  assert.strictEqual(s.written.length, 0)
  assert.strictEqual(fs.statSync(f).mtimeMs, 1000)
  assert.ok(mtime > 1000)
  // 索引按技能名排序、每个技能只出现一次
  install({ tool: 'codex', skills: ['test-chapter', 'defense-prep'], dir, force: true })
  txt = fs.readFileSync(f, 'utf8')
  assert.strictEqual(txt.match(/`test-chapter`/g).length, 1)
  const order = [...txt.matchAll(/^- `([a-z-]+)`/gm)].map(m => m[1])
  assert.deepStrictEqual(order, [...order].sort())
  assert.strictEqual(order.length, 3)
})

test('description 以 YAML 双引号字符串写出，含冒号等特殊字符也能被正确解析', () => {
  const src = tmp(), dir = tmp()
  fs.mkdirSync(path.join(src, 'demo-skill'))
  fs.writeFileSync(path.join(src, 'demo-skill', 'SKILL.md'), '---\nname: demo-skill\ndescription: 用法: 写 "论文" #1 时使用\n---\n正文\n')
  // 分开装：同时指定 cursor+claude 时不再写 .cursor/skills（Cursor 会读 .claude/skills）
  install({ tool: 'claude', skills: null, dir }, { skillsDir: src })
  install({ tool: 'cursor', skills: null, dir }, { skillsDir: src })
  for (const f of ['.claude/skills/demo-skill/SKILL.md', '.cursor/skills/demo-skill/SKILL.md']) {
    const line = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').find(l => l.startsWith('description:'))
    assert.strictEqual(JSON.parse(line.slice('description:'.length).trim()), '用法: 写 "论文" #1 时使用')
  }
})

test('AGENTS.md 标记不成对时报错且一个文件都不写，用户内容保留', () => {
  const dir = tmp()
  const f = path.join(dir, 'AGENTS.md')
  fs.writeFileSync(f, '<!-- bishe-doc-skills:start -->\n- `x`：旧\n\n## 我的规则\n不要改 dist\n')
  assert.throws(() => install({ tool: 'codex', skills: ['test-chapter'], dir }), /不成对/)
  assert.match(fs.readFileSync(f, 'utf8'), /不要改 dist/)
  assert.ok(!fs.existsSync(path.join(dir, '.agents')))
})

test('代码块里和行内提到的标记不算区块', () => {
  const dir = tmp()
  const f = path.join(dir, 'AGENTS.md')
  const head = '# 项目\n别手改 `<!-- bishe-doc-skills:start -->` 之后的内容\n```md\n<!-- bishe-doc-skills:start -->\n示例\n<!-- bishe-doc-skills:end -->\n```\n'
  fs.writeFileSync(f, head)
  install({ tool: 'codex', skills: ['thesis-proposal'], dir })
  install({ tool: 'codex', skills: ['test-chapter'], dir })
  const txt = fs.readFileSync(f, 'utf8')
  assert.ok(txt.startsWith(head))
  assert.match(txt.slice(head.length), /thesis-proposal[\s\S]*test-chapter|test-chapter[\s\S]*thesis-proposal/)
})

test('CRLF 的 AGENTS.md 更新后仍全是 CRLF', () => {
  const dir = tmp()
  const f = path.join(dir, 'AGENTS.md')
  install({ tool: 'codex', skills: ['thesis-proposal'], dir })
  fs.writeFileSync(f, ('# 项目\n' + fs.readFileSync(f, 'utf8')).replace(/\n/g, '\r\n'))
  install({ tool: 'codex', skills: ['test-chapter'], dir })
  const txt = fs.readFileSync(f, 'utf8')
  assert.strictEqual(/[^\r]\n/.test(txt), false)
  assert.match(txt, /test-chapter/)
})

test('同时装 Cursor 和 Claude/Codex 时不写 .cursor/skills；只和 Trae 一起装时仍写入', () => {
  const dir1 = tmp()
  const s1 = install({ tool: 'cursor,claude', skills: ['thesis-proposal'], dir: dir1 })
  assert.strictEqual(s1.cursorCompatSkip, true)
  assert.ok(fs.existsSync(path.join(dir1, '.claude/skills/thesis-proposal/SKILL.md')))
  assert.ok(!fs.existsSync(path.join(dir1, '.cursor')))

  const dir2 = tmp()
  const s2 = install({ tool: 'cursor,codex', skills: ['thesis-proposal'], dir: dir2 })
  assert.strictEqual(s2.cursorCompatSkip, true)
  assert.ok(fs.existsSync(path.join(dir2, '.agents/skills/thesis-proposal/SKILL.md')))
  assert.ok(!fs.existsSync(path.join(dir2, '.cursor')))

  const dir3 = tmp()
  const s3 = install({ tool: 'cursor,trae', skills: ['thesis-proposal'], dir: dir3 })
  assert.notStrictEqual(s3.cursorCompatSkip, true)
  assert.ok(fs.existsSync(path.join(dir3, '.cursor/skills/thesis-proposal/SKILL.md')))
  assert.ok(!fs.existsSync(path.join(dir3, '.cursor/rules')))
  assert.ok(fs.existsSync(path.join(dir3, '.trae/rules/thesis-proposal.md')))
})

test('同时装 Claude/Codex 时若已有旧的 .cursor/rules，列入 staleCursorRules 但不自动删除', () => {
  const dir = tmp()
  const stale = path.join(dir, '.cursor/rules/thesis-proposal.mdc')
  fs.mkdirSync(path.dirname(stale), { recursive: true })
  fs.writeFileSync(stale, 'old rule')
  const s = install({ tool: 'all', skills: ['thesis-proposal'], dir })
  assert.deepStrictEqual(s.staleCursorRules, [stale])
  assert.strictEqual(fs.readFileSync(stale, 'utf8'), 'old rule')
})

test('命令行 --tool all 会提示未写入 Cursor 技能', () => {
  const dir = tmp()
  const out = execFileSync(process.execPath, [CLI, '-t', 'all', '-s', 'thesis-proposal', '-d', dir], { encoding: 'utf8' })
  assert.match(out, /未写入 \.cursor\/skills/)
  assert.match(out, /cursor\.com\/docs\/skills/)
  assert.ok(!fs.existsSync(path.join(dir, '.cursor')))
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/thesis-proposal/SKILL.md')))
})

test('--global 把 Cursor 技能装到 ~/.cursor/skills，不写项目目录和旧规则格式', () => {
  const dir = tmp(), home = tmp()
  install({ tool: 'cursor', skills: ['system-design'], dir, global: true }, { home })
  const f = path.join(home, '.cursor/skills/system-design/SKILL.md')
  assert.ok(fs.existsSync(f))
  assert.match(fs.readFileSync(f, 'utf8'), /^---\nname: system-design\ndescription: ".+"\n---\n/)
  assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /^paths:/m)
  assert.ok(!fs.existsSync(path.join(dir, '.cursor')))
  assert.ok(!fs.existsSync(path.join(home, '.cursor/rules')))
})

test('只装 Cursor 时若已有旧的 .cursor/rules，列入 staleCursorRules 但不自动删除', () => {
  const dir = tmp()
  const stale = path.join(dir, '.cursor/rules/thesis-proposal.mdc')
  fs.mkdirSync(path.dirname(stale), { recursive: true })
  fs.writeFileSync(stale, 'old rule')
  const s = install({ tool: 'cursor', skills: ['thesis-proposal'], dir })
  assert.ok(fs.existsSync(path.join(dir, '.cursor/skills/thesis-proposal/SKILL.md')))
  assert.deepStrictEqual(s.staleCursorRules, [stale])
  assert.strictEqual(fs.readFileSync(stale, 'utf8'), 'old rule')
})
