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

test('全量安装写入四种工具的文件', () => {
  const dir = tmp()
  const s = install({ tool: 'all', skills: null, dir, force: false })
  const n = listSkills().length
  assert.strictEqual(s.skipped.length, 0)
  assert.strictEqual(s.written.length, n * 4 + 1)
  const claude = fs.readFileSync(path.join(dir, '.claude/skills/thesis-writing/SKILL.md'), 'utf8')
  assert.match(claude, /^---\nname: thesis-writing\ndescription: .+\n---\n/)
  const mdc = fs.readFileSync(path.join(dir, '.cursor/rules/system-design.mdc'), 'utf8')
  assert.match(mdc, /^---\ndescription: .+\nglobs:\nalwaysApply: false\n---\n/)
  assert.ok(fs.existsSync(path.join(dir, '.trae/rules/defense-prep.md')))
  assert.ok(fs.existsSync(path.join(dir, '.agents/skills/code-to-thesis/SKILL.md')))
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
