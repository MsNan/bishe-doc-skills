<div align="center">

# bishe-doc-skills

**毕业设计文档 AI 技能包 · AI skills for Chinese CS graduation projects**

让 Claude Code / Cursor / Trae / Codex 按中国高校的格式规范，帮你写开题报告、需求分析、系统设计、测试章节和答辩材料——并且**不编造文献和测试数据**。

[![Test](https://github.com/MsNan/bishe-doc-skills/actions/workflows/test.yml/badge.svg)](https://github.com/MsNan/bishe-doc-skills/actions/workflows/test.yml) ![license](https://img.shields.io/badge/license-MIT-green) ![skills](https://img.shields.io/badge/skills-7-blue) ![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

[中文](#中文) · [English](#english)

</div>

## 中文

### 为什么需要它

直接让 AI 写毕设文档，常见问题是：

- 参考文献是编的，作者、期刊、页码都对不上
- 论文里写的功能，系统里根本没有，答辩被当场问住
- 测试用例全部「通过」，实际结果一栏从没跑过
- 图表编号、三线表、GB/T 7714 格式不符合学校要求
- 数据库设计凭空多出字段，和建表 SQL 不一致

这套技能把**格式规范 + 写作流程 + 红线**写成 AI 能读懂的说明，并要求 AI 先从你的真实代码里提取素材（`code-to-thesis`），让论文和系统保持一致。

### 一行安装

在毕设项目根目录执行（需要 Node.js >= 18）：

```bash
npx -y github:MsNan/bishe-doc-skills
```

只装给某个工具，或只装部分技能：

```bash
npx -y github:MsNan/bishe-doc-skills --tool claude --global          # 装到 ~/.claude/skills，所有项目可用
npx -y github:MsNan/bishe-doc-skills --tool cursor,trae --skills thesis-writing,test-chapter
npx -y github:MsNan/bishe-doc-skills --list                          # 查看全部技能
```

| 工具 | 安装位置 |
| --- | --- |
| Claude Code | `.claude/skills/<name>/SKILL.md` |
| Cursor | `.cursor/rules/<name>.mdc` |
| Trae | `.trae/rules/<name>.md` |
| Codex / 其他 Agent | `.agents/skills/<name>/SKILL.md` + `AGENTS.md` 索引 |

已存在的文件默认跳过，加 `--force` 覆盖；`AGENTS.md` 里你自己的内容会保留，重复安装只更新本工具的区块。

### 技能列表

| 技能 | 用途 |
| --- | --- |
| `thesis-proposal` | 开题报告、任务书：选题意义、研究现状、技术路线、进度表 |
| `requirements-analysis` | 可行性分析、角色与用例、用例描述表、功能/非功能需求 |
| `system-design` | 总体架构、功能模块图、E-R 图、三线表数据库设计、接口与时序图 |
| `code-to-thesis` | 从已有代码提取技术栈、模块清单、数据表、接口、核心代码片段、截图清单 |
| `thesis-writing` | 章节结构、摘要关键词、图表编号、GB/T 7714-2015 参考文献、正确对待重复率 |
| `test-chapter` | 测试环境、功能测试用例表（实际结果必须真实执行）、测试结论 |
| `defense-prep` | 答辩 PPT 提纲、讲稿与时间分配、演示脚本、常见提问、模拟答辩 |

### 用法示例

安装后直接对 AI 说：

- 「读一下这个项目，按 code-to-thesis 整理论文素材」
- 「根据 docs/thesis-materials.md 写第 4 章数据库设计」
- 「把这些参考文献整理成 GB/T 7714 格式」
- 「给登录和订单模块设计测试用例」
- 「扮演答辩老师，根据我的论文提问」

配合 [bishe-kit](https://github.com/MsNan/bishe-kit)（Vue3 后台 + uni-app + Express 毕设脚手架）使用效果更好。

### 原则

这套技能帮你**整理和表达自己做的工作**，不是代写工具：不编造文献、数据、测试结果和截图；不提供「降重技巧」。请遵守所在学校关于 AI 辅助写作的规定，最终内容由你本人审阅和改写。各校模板不同，以学校要求为准。

### 开发

```bash
npm test   # 校验技能 frontmatter + 运行安装器测试
```

欢迎 PR 补充更多学校通用的规范。新技能放在 `skills/<小写-短横线名>/SKILL.md`，frontmatter 需有 `name`（与目录一致）和说明使用时机的 `description`。

## English

**bishe-doc-skills** is a set of Chinese-language AI agent skills for writing computer-science graduation project ("毕设") documents in the format Chinese universities expect: thesis proposal, requirements analysis, system design (E-R diagrams, three-line tables), GB/T 7714-2015 references, test chapter, and defense preparation.

Install into any project for Claude Code, Cursor, Trae, or Codex (`AGENTS.md`):

```bash
npx -y github:MsNan/bishe-doc-skills                 # all tools, all skills
npx -y github:MsNan/bishe-doc-skills --tool claude --global
npx -y github:MsNan/bishe-doc-skills --list
```

The skills tell the AI to extract facts from your real code first (`code-to-thesis`), and never to invent references, test results, data, or screenshots. They are a writing aid for your own work, not a ghostwriting tool; follow your university's rules on AI-assisted writing.

## License

[MIT](LICENSE)
