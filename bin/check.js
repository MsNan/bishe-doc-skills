#!/usr/bin/env node
'use strict'
// 校验 skills/ 下每个技能：frontmatter 的 name 与目录一致、description 存在且足够具体、正文非空
const path = require('path')
const { listSkills, parseSkill } = require('./cli')
const dir = path.join(__dirname, '..', 'skills')
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
if (errors.length) { console.error(errors.map(e => '✗ ' + e).join('\n')); process.exit(1) }
console.log(`✓ ${names.length} 个技能校验通过`)
