#!/usr/bin/env node
'use strict'
// 校验 skills/ 下每个技能：frontmatter 的 name 与目录一致、description 存在且足够具体、正文非空
// 同时校验 Cursor 官方插件清单（对照 cursor/plugins schemas，不引入 JSON Schema 依赖）
const fs = require('fs')
const path = require('path')
const { listSkills, parseSkill } = require('./cli')
const root = path.join(__dirname, '..')
const dir = path.join(root, 'skills')
const errors = []
const names = listSkills(dir)
if (!names.length) errors.push('skills/ 下没有技能')
for (const n of names) {
  const { meta, body } = parseSkill(path.join(dir, n, 'SKILL.md'))
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n)) errors.push(`${n}: 目录名必须是小写短横线格式`)
  if (meta.name !== n) errors.push(`${n}: frontmatter name (${meta.name}) 与目录名不一致`)
  if (!meta.description) errors.push(`${n}: 缺少 description`)
  else {
    if (meta.description.length < 20) errors.push(`${n}: description 太短，写清「什么时候用」`)
    if (meta.description.length > 1024) errors.push(`${n}: description 超过 1024 字符`)
    if (!/使用|时用/.test(meta.description)) errors.push(`${n}: description 需说明使用时机（包含「…时使用」）`)
  }
  if (body.trim().length < 200) errors.push(`${n}: 正文过短`)
}

const ID = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/
function loadJson(rel, extraKeys) {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) { errors.push(`缺少 ${rel}`); return null }
  let data
  try { data = JSON.parse(fs.readFileSync(p, 'utf8')) }
  catch { errors.push(`${rel}: JSON 无效`); return null }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(`${rel}: 必须是 JSON 对象`)
    return null
  }
  const unknown = Object.keys(data).filter((k) => !extraKeys.includes(k))
  if (unknown.length) errors.push(`${rel}: 含官方 schema 不允许的字段 ${unknown.join(', ')}`)
  return data
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const plugin = loadJson('.cursor-plugin/plugin.json', [
  'name', 'displayName', 'description', 'version', 'minClientVersions', 'author',
  'publisher', 'homepage', 'repository', 'license', 'logo', 'keywords', 'category',
  'tags', 'commands', 'agents', 'skills', 'rules', 'hooks', 'variables', 'mcpServers',
])
if (plugin) {
  if (!plugin.name) errors.push('.cursor-plugin/plugin.json: 缺少 name')
  else if (!ID.test(plugin.name)) errors.push('.cursor-plugin/plugin.json: name 必须是 kebab-case')
  if (plugin.name !== pkg.name) errors.push('.cursor-plugin/plugin.json: name 应与 package.json 一致')
  if (plugin.version && plugin.version !== pkg.version) errors.push('.cursor-plugin/plugin.json: version 应与 package.json 一致')
  if (plugin.author) {
    if (typeof plugin.author !== 'object' || Array.isArray(plugin.author) || !plugin.author.name) {
      errors.push('.cursor-plugin/plugin.json: author 必须是含 name 的对象')
    } else if (Object.keys(plugin.author).some((k) => k !== 'name' && k !== 'email')) {
      errors.push('.cursor-plugin/plugin.json: author 只能有 name / email')
    }
  }
  if (plugin.skills) errors.push('.cursor-plugin/plugin.json: 不要写 skills 路径，沿用默认的 skills/ 目录发现')
}

const market = loadJson('.cursor-plugin/marketplace.json', ['name', 'owner', 'metadata', 'plugins'])
if (market) {
  if (!market.name) errors.push('.cursor-plugin/marketplace.json: 缺少 name')
  if (!Array.isArray(market.plugins) || market.plugins.length !== 1) {
    errors.push('.cursor-plugin/marketplace.json: plugins 必须是只含 1 个插件的数组')
  } else {
    const entry = market.plugins[0]
    const extra = Object.keys(entry || {}).filter((k) => !['name', 'source', 'description', 'minClientVersions'].includes(k))
    if (extra.length) errors.push(`.cursor-plugin/marketplace.json: plugin 含不允许的字段 ${extra.join(', ')}`)
    if (!entry || !ID.test(entry.name || '')) errors.push('.cursor-plugin/marketplace.json: plugin name 必须是 kebab-case')
    if (plugin && entry.name !== plugin.name) errors.push('.cursor-plugin/marketplace.json: plugin name 必须与 plugin.json 一致')
    if (!entry || entry.source !== '.') errors.push('.cursor-plugin/marketplace.json: 单插件仓库的 source 应为 "."（技能仍在仓库根目录 skills/）')
  }
  if (market.owner) {
    if (typeof market.owner !== 'object' || !market.owner.name) {
      errors.push('.cursor-plugin/marketplace.json: owner 必须含 name')
    } else if (Object.keys(market.owner).some((k) => k !== 'name' && k !== 'email')) {
      errors.push('.cursor-plugin/marketplace.json: owner 只能有 name / email')
    }
  }
}

if (errors.length) { console.error(errors.map(e => '✗ ' + e).join('\n')); process.exit(1) }
console.log(`✓ ${names.length} 个技能校验通过`)
console.log('✓ .cursor-plugin 清单校验通过')
