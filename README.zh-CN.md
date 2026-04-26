# graphify

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

[![TypeScript CI](https://github.com/rhanka/graphify/actions/workflows/typescript-ci.yml/badge.svg?branch=main)](https://github.com/rhanka/graphify/actions/workflows/typescript-ci.yml)

**一个面向 AI 编码助手的技能。** 在 Claude Code、Gemini CLI、VS Code Copilot Chat、GitHub Copilot CLI、Aider、OpenCode、OpenClaw、Factory Droid、Trae、Kiro 或 Google Antigravity 中输入 `/graphify`，在 Codex 中输入 `$graphify`，它会读取你的文件、构建知识图谱，并把原本不明显的结构关系还给你。更快理解代码库，找到架构决策背后的“为什么”。

这个仓库是原始 Graphify 项目的受维护 TypeScript 版本。产品方向、工作流和最初实现来自 [Safi Shamsi](https://github.com/safishamsi/graphify) 的原始项目，这里保留了同样的知识图谱与 assistant-skill 交互模型。

graphify 是多模态的，而且这个 TypeScript 端口已经把 upstream Python Graphify `v4` 线闭合到了 `graphifyy@0.4.33`，同时也在以显式差异跟踪的方式继续吸收较小的 `v5` 仓库工作流能力。当前 TS runtime 覆盖代码、Markdown、MDX、HTML、PDF、Office 文档、截图、图表和其他图片。PDF 会先走本地 preflight：有可读文本层时用 `pdf-parse` 转成 Markdown，并在可用时回退到 `pdftotext`；扫描件或低文本 PDF 可通过 `mistral-ocr` 转成 Markdown + 图片。本地音频/视频检测使用 `yt-dlp` + `ffmpeg` + `faster-whisper-ts`；这些 transcript 和 PDF sidecar 都会并入同一条语义抽取流水线。代码 AST 侧通过 tree-sitter 支持 20 种语言（Python、JS、TS、Go、Rust、Java、C、C++、Ruby、C#、Kotlin、Scala、PHP、Swift、Lua、Zig、PowerShell、Elixir、Objective-C、Julia），并为 Vue、Svelte、Blade、Dart、Verilog/SystemVerilog、MJS 和 EJS 提供与 upstream 对齐的 fallback 支持。

## 分支模型

- `main` 是当前默认分支和受维护的 TypeScript 产品分支。
- `v3` 保留为原始 Python Graphify 的 upstream mirror / 对齐分支。
- TypeScript 产品线里的 `v4` parity 已在 `graphifyy@0.4.33` 收口；后续 upstream 变化以及 `v5` 差异通过 `UPSTREAM_GAP.md` 显式记录。
- npm 发布使用 GitHub Actions trusted publishing 保护。release tag 只有在 tag commit 已经进入默认分支且 tag 版本匹配 `package.json` 时才允许发布。

## 血统与对齐

| 来源 | 本仓库保留或改造的内容 | 对齐约定 |
|---|---|---|
| [Safi Shamsi](https://github.com/safishamsi/graphify) 的原始 Graphify | 核心产品思路：文件夹 -> 知识图谱、assistant-skill 工作流、graph/report/html 输出、provenance 标签、社区发现、多模态语料工作流。 | `v3` 保留 upstream Python Graphify 的历史镜像；`UPSTREAM_GAP.md` 跟踪已经闭合的 `v4` 线和正在进行的 `v5` 追平。 |
| 当前 TypeScript 端口 | npm 包、仓库根目录的 TypeScript runtime、`.graphify/` 状态、多助手安装器、MCP surface、git/worktree 生命周期，以及通过 TS 工具链完成的本地音频/视频转录。 | `main` 是受维护的默认分支；TS 特有行为会作为有意分叉记录，而不是伪装成 upstream parity。 |
| `code-review-graph` 参考项目 | 面向 review 的图投影：first-hop summary、review delta、review analysis、review evaluation、install preview，以及 advisory commit grouping 术语。 | 作为 Graphify 图上的增量 review surface 采用；Graphify 不转向 review-only，不默认采用 SQLite/embeddings，并继续保留多模态支持。 |

> Andrej Karpathy 会维护一个 `/raw` 文件夹，把论文、推文、截图和笔记都丢进去。graphify 就是在解决这类问题 —— 相比直接读取原始文件，每次查询的 token 消耗可降低 **71.5 倍**，结果还能跨会话持久保存，并且会明确区分哪些内容是实际发现的，哪些只是合理推断。

```bash
$graphify .                        # Codex
/graphify .                        # Claude Code / Gemini CLI / Copilot / Aider / OpenCode / OpenClaw / Droid / Trae / Kiro / Antigravity
```

```
.graphify/
├── graph.html       可交互图谱：可点节点、搜索、按社区过滤
├── GRAPH_REPORT.md  God nodes、意外连接、建议提问
├── graph.json       持久化图谱：数周后仍可查询，无需重新读原始文件
├── wiki/            可选的 LLM-readable wiki 页面
├── flows.json       可选的执行流 artifact
├── branch.json      本地 branch lifecycle state - ignored
├── worktree.json    本地 worktree lifecycle state - ignored
└── cache/           本地 SHA256 缓存 - ignored
```

`.graphify/` 分为可提交的 graph artifact 和本地 lifecycle state。`graph.json`、`GRAPH_REPORT.md`、`graph.html`、`flows.json`、`wiki/` 会用 repo-relative paths 写出，因此当项目希望 graph context 跟随 branch/worktree 时可以提交。提交前运行 `graphify portable-check .graphify`。不要提交 `.graphify/branch.json`、`.graphify/worktree.json`、`.graphify/needs_update`、cache、transcript、转换后的 PDF/OCR sidecar 或 profile runtime scratch；这些文件属于当前 worktree，本来就可能包含 absolute paths。

如果旧仓库里还有 `graphify-out/`，先运行 `graphify migrate-state --dry-run`。迁移会把本地状态复制到 `.graphify/`，不会删除旧目录；如果 `graphify-out` 已被 Git 跟踪，命令会打印建议的 `git mv -f graphify-out .graphify` 和 commit message，供你确认后再执行。

`graphify recommend-commits` 仅提供 advisory-only 建议：它会基于 Git 变更和图影响推荐分组与提交信息，但不会 stage 文件、创建 commit 或修改分支。

`graphify review-analysis` 增加面向 review 的 blast radius、bridge nodes、test-gap hints、impacted communities 和 multimodal/doc regression safety 视图。`graphify review-eval` 可用 JSON cases 衡量 token savings、impacted-file recall、review summary precision 和 multimodal regression safety。

## 选择输入范围

Graphify 现在区分代码/评审场景下的安全扫描，以及知识库场景下的全量递归扫描。

- 支持范围控制的命令默认使用 `--scope auto`。
- 在存在 `HEAD` 的 Git 仓库里，`auto` 会解析为已提交文件加上 `.graphify/memory/*`。
- `--scope tracked` 还会包含尚未提交但已经 staged 的新文件。
- `--all` 是 `--scope all` 的别名，会恢复完整的递归目录遍历。论文、笔记、截图、音视频语料或非 Git 目录应当使用它。
- `graphify scope inspect . --scope auto` 可以在真正重建前先看清楚会纳入哪些文件。
- 对于配置化项目，可以在 `graphify.yaml` 中固定默认范围：

```yaml
inputs:
  scope: all
```

当前输入范围会作用于 `detect`、`detect-incremental`、`update`、`watch`、`hook-rebuild` 以及配置化 profile dataprep。检测元数据会写入 `.graphify/scope.json`，并在 `GRAPH_REPORT.md` 中摘要展示。

## 工作原理

graphify 把确定性的结构提取和模型驱动的语义提取组合在一起，中间按需做本地预处理。代码文件先走无 LLM 的 AST 流水线，提取类、函数、导入、调用图、docstring 和 rationale 注释。文档、论文、Office 文件和图片会先被规范化成文本或多模态输入，再交给平台模型驱动的子代理抽取概念、关系和设计动机。PDF 会先经过本地 preflight；可读文本层用 `pdf-parse` 转成 Markdown，并在可用时回退到本地 `pdftotext`；扫描件或低文本 PDF 可在 `auto` 或 `always` 模式下调用 `mistral-ocr` 生成 Markdown + 图片。PDF 中抽出的图片如果承载图表、表格、示意图或嵌入文字，也会作为语义输入：默认由助手的视觉模型解读，或在配置时交给外部 OCR/视觉模型，同时保留 PDF provenance。本地音频/视频通过 TypeScript runtime 调用 `yt-dlp` + `ffmpeg` + `faster-whisper-ts` 做转录；生成出的 transcript 会和其他文档一起进入同一条语义抽取流水线。最终结果会合并到 Graphology 图里，用 Louvain 社区发现做聚类，并导出成可交互 HTML、可查询 JSON 和人类可读的审计报告。

**聚类是基于图拓扑完成的，不依赖 embeddings。** Louvain 按边密度发现社区。平台模型抽取出的语义相似边（`semantically_similar_to`，标记为 `INFERRED`）本来就存在于图中，所以会直接影响社区划分。图结构本身就是相似性信号，不需要额外的 embedding 步骤，也不需要向量数据库。

每条关系都会被标记为 `EXTRACTED`（直接在源材料中找到）、`INFERRED`（合理推断，并附带置信度分数）或 `AMBIGUOUS`（有歧义，需要复核）。所以你始终知道哪些是实际发现的，哪些是模型猜出来的。

## 安装

**要求：** Node.js 20+，并且使用以下平台之一：[Claude Code](https://claude.ai/code)、[Codex](https://openai.com/codex)、[Gemini CLI](https://github.com/google-gemini/gemini-cli)、VS Code Copilot Chat、[GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli)、[Aider](https://aider.chat)、[OpenCode](https://opencode.ai)、[OpenClaw](https://openclaw.ai)、[Factory Droid](https://factory.ai)、[Trae](https://trae.com)、[Cursor](https://cursor.com)、Hermes、Kiro 或 Google Antigravity

```bash
npm install -g graphifyy
graphify install
```

> npm 包当前暂时叫 `graphifyy`，因为 `graphify` 这个名字还在回收中。CLI 命令和 skill 命令仍然都是 `graphify`。

安装命令会在写文件前打印 mutation preview，列出将被修改的 assistant instruction 文件以及 hook/MCP/plugin 配置。

### 平台支持

| 平台 | 安装命令 |
|------|----------|
| Claude Code（Linux / Mac） | `graphify install` |
| Claude Code（Windows） | `graphify install`（自动检测）或 `graphify install --platform windows` |
| Codex | `graphify install --platform codex` |
| Gemini CLI | `graphify install --platform gemini` |
| GitHub Copilot CLI | `graphify install --platform copilot` |
| VS Code Copilot Chat | `graphify install --platform vscode` |
| Aider | `graphify install --platform aider` |
| OpenCode | `graphify install --platform opencode` |
| OpenClaw | `graphify install --platform claw` |
| Factory Droid | `graphify install --platform droid` |
| Trae | `graphify install --platform trae` |
| Trae CN | `graphify install --platform trae-cn` |
| Cursor | `graphify install --platform cursor` |
| Hermes | `graphify install --platform hermes` |
| Kiro | `graphify install --platform kiro` |
| Google Antigravity | `graphify install --platform antigravity` |

Codex 用户还需要在 `~/.codex/config.toml` 的 `[features]` 下打开 `multi_agent = true`，这样才能并行提取。Gemini CLI 会把 `/graphify` 作为自定义命令安装到 `~/.gemini/commands/graphify.toml`，项目级安装还会写入 `.gemini/settings.json`，让 Gemini 通过 `graphify serve` 访问 MCP。GitHub Copilot CLI 会安装全局 `~/.copilot/skills/graphify/SKILL.md`；VS Code Copilot Chat 会安装同一个全局 skill，并写入项目 `.github/copilot-instructions.md`。Aider 会安装全局 `~/.aider/graphify/SKILL.md`，但该平台上的语义抽取仍然是串行的。OpenCode 会写入 `.opencode/plugins/graphify.js`，并通过 `.opencode/opencode.json` 注册 `tool.execute.before` 插件。OpenClaw 和 Hermes 使用顺序提取。Kiro 会写入 `.kiro/skills/graphify/SKILL.md` 和常驻 `.kiro/steering/graphify.md`。Google Antigravity 会写入 `.agent/rules/graphify.md`、`.agent/workflows/graphify.md` 和全局 `~/.agent/skills/graphify/SKILL.md`。Trae 使用 Agent 工具进行并行子代理调度，**不支持** PreToolUse hook，因此 AGENTS.md 是其常驻机制。

然后打开你的 AI 编码助手，输入：

```bash
$graphify .                        # Codex
/graphify .                        # Claude Code / Gemini CLI / Copilot / Aider / OpenCode / OpenClaw / Droid / Trae / Kiro / Antigravity
```

### 让助手始终优先使用图谱（推荐）

图构建完成后，在项目里运行一次：

| 平台 | 命令 |
|------|------|
| Claude Code | `graphify claude install` |
| Codex | `graphify codex install` |
| Gemini CLI | `graphify gemini install` |
| GitHub Copilot CLI | `graphify copilot install` |
| VS Code Copilot Chat | `graphify vscode install` |
| Aider | `graphify aider install` |
| OpenCode | `graphify opencode install` |
| OpenClaw | `graphify claw install` |
| Factory Droid | `graphify droid install` |
| Trae | `graphify trae install` |
| Trae CN | `graphify trae-cn install` |
| Cursor | `graphify cursor install` |
| Hermes | `graphify hermes install` |
| Kiro | `graphify kiro install` |
| Google Antigravity | `graphify antigravity install` |

**Claude Code** 会做两件事：
1. 在 `CLAUDE.md` 中写入一段规则，告诉 Claude 在回答架构问题前先读 `.graphify/GRAPH_REPORT.md`
2. 安装一个 **PreToolUse hook**（写入 `settings.json`），在每次 `Glob` 和 `Grep` 前触发

如果知识图谱存在，Claude 会先看到：_"graphify: Knowledge graph exists. Read .graphify/GRAPH_REPORT.md for god nodes and community structure before searching raw files."_ —— 这样 Claude 会优先按图谱导航，而不是一上来就 grep 整个项目。

**Codex** 会把规则写进 `AGENTS.md`，并在 `.codex/hooks.json` 里安装 PreToolUse hook。
**Gemini CLI** 会写入项目根目录的 `GEMINI.md`，并在 `.gemini/settings.json` 中注册项目级 `graphify` MCP server。
**GitHub Copilot CLI** 依赖全局 `~/.copilot/skills/graphify/SKILL.md`，这个端口里没有单独的项目级 hook。
**VS Code Copilot Chat** 会安装全局 `graphify` skill，并写入 `.github/copilot-instructions.md`，因此仓库里的 Copilot Chat 会自动看到 graphify 规则。
**Aider** 会写入项目根目录的 `AGENTS.md`，并依赖全局 `~/.aider/graphify/SKILL.md`，但目前语义抽取仍是串行。
**OpenCode** 会写入 `AGENTS.md`，并在 `.opencode/plugins/graphify.js` 里安装项目级 `tool.execute.before` 插件，再通过 `.opencode/opencode.json` 注册。
**Cursor** 会写入 `.cursor/rules/graphify.mdc`，并设置 `alwaysApply: true`。
**Hermes** 会安装全局 `~/.hermes/skills/graphify/SKILL.md`，并使用同样的 `/graphify` 显式 skill 约定。
**Kiro** 会写入 `.kiro/skills/graphify/SKILL.md`、`.graphify_version` 和带 `inclusion: always` 的 `.kiro/steering/graphify.md`。
**Google Antigravity** 会写入 `.agent/rules/graphify.md`、`.agent/workflows/graphify.md` 和全局 `~/.agent/skills/graphify/SKILL.md`。
**OpenClaw、Factory Droid、Trae、Trae CN** 会把规则写进项目根目录的 `AGENTS.md`，这些平台没有 Claude/Codex 风格的 PreToolUse hook，所以 `AGENTS.md` 是常驻机制。

卸载时使用对应平台的 uninstall 命令即可（例如 `graphify claude uninstall`）。

**常驻模式和显式触发有什么区别？**

常驻 hook 会优先暴露 `GRAPH_REPORT.md` —— 这是一页式总结，包含 god nodes、社区结构和意外连接。你的助手在搜索文件前会先读它，因此会按结构导航，而不是按关键字乱搜。这已经能覆盖大部分日常问题。

`/graphify query`、`/graphify path` 和 `/graphify explain` 会更深入：它们会逐跳遍历底层 `graph.json`，追踪节点之间的精确路径，并展示边级别细节（关系类型、置信度、源位置）。当你想从图谱里精确回答某个问题，而不仅仅是获得整体感知时，就该用这些命令。

可以这样理解：常驻 hook 是先给助手一张地图，`/graphify` 这几个命令则是让它沿着地图精确导航。

<details>
<summary>手动安装（curl）</summary>

```bash
mkdir -p ~/.claude/skills/graphify
curl -fsSL https://raw.githubusercontent.com/rhanka/graphify/main/src/skills/skill.md \
  > ~/.claude/skills/graphify/SKILL.md
```

把下面内容加到 `~/.claude/CLAUDE.md`：

```
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.
```

</details>

## 用法

```
/graphify                          # 对当前目录运行
/graphify ./raw                    # 对指定目录运行
/graphify ./raw --mode deep        # 更激进地抽取 INFERRED 边
/graphify ./raw --pdf-ocr auto     # PDF preflight；必要时用 mistral-ocr 处理扫描件/低文本 PDF
/graphify ./raw --update           # 只重新提取变更文件，并合并到已有图谱
/graphify ./raw --cluster-only     # 只重新聚类已有图谱，不重新提取
/graphify ./raw --no-viz           # 跳过 HTML，只生成 report + JSON
/graphify ./raw --obsidian         # 额外生成 Obsidian vault（可选）

/graphify add https://arxiv.org/abs/1706.03762        # 拉取论文、保存并更新图谱
/graphify add https://www.youtube.com/watch?v=...     # 下载视频音频，下一次 build/update 时转成 transcript
/graphify add https://x.com/karpathy/status/...       # 拉取推文
/graphify add https://... --author "Name"             # 标记原作者
/graphify add https://... --contributor "Name"        # 标记是谁把它加入语料库的

/graphify query "what connects attention to the optimizer?"
/graphify query "what connects attention to the optimizer?" --dfs   # 追踪一条具体路径
/graphify query "what connects attention to the optimizer?" --budget 1500  # 把预算限制在 N tokens
/graphify summary --graph .graphify/graph.json        # 深度遍历前的紧凑 first-hop 概览
/graphify review-delta --files src/auth.ts --graph .graphify/graph.json  # 变更文件的 review impact
/graphify review-analysis --files src/auth.ts --graph .graphify/graph.json  # blast radius + review 视图
/graphify recommend-commits --files src/auth.ts,src/session.ts --graph .graphify/graph.json  # advisory-only 提交分组建议
/graphify path "DigestAuth" "Response"
/graphify explain "SwinTransformer"

/graphify ./raw --watch            # 文件变更时自动同步图谱（代码：立即更新；文档：提醒你）
/graphify ./raw --wiki             # 构建可供 agent 抓取的 wiki（index.md + 每个 community 一篇文章）
/graphify ./raw --svg              # 导出 graph.svg
/graphify ./raw --graphml          # 导出 graph.graphml（Gephi、yEd）
/graphify ./raw --neo4j            # 生成给 Neo4j 用的 cypher.txt
/graphify ./raw --neo4j-push bolt://localhost:7687    # 直接推送到运行中的 Neo4j
/graphify ./raw --mcp              # 启动 MCP stdio server

# git hooks - 跨平台，先标记 stale，再在 git 生命周期事件后尝试轻量重建
graphify hook install
graphify hook uninstall
graphify hook status
graphify check-update .          # 检查 .graphify 的 semantic / lifecycle 更新信号
graphify state status            # 查看 .graphify/worktree.json + branch.json
graphify recommend-commits          # 基于当前 Git 变更给出 advisory-only 提交分组
graphify state prune             # 打印非破坏性的 stale-state 清理计划

# 常驻助手规则 - 按平台区分
graphify claude install            # CLAUDE.md + PreToolUse hook（Claude Code）
graphify claude uninstall
graphify codex install             # AGENTS.md（Codex）
graphify gemini install            # GEMINI.md + .gemini/settings.json（Gemini CLI）
graphify gemini uninstall
graphify copilot install           # ~/.copilot/skills/graphify/SKILL.md（GitHub Copilot CLI）
graphify copilot uninstall
graphify vscode install            # ~/.copilot/skills/graphify/SKILL.md + .github/copilot-instructions.md（VS Code Copilot Chat）
graphify vscode uninstall
graphify aider install             # AGENTS.md（Aider）
graphify aider uninstall
graphify cursor install            # .cursor/rules/graphify.mdc（Cursor）
graphify cursor uninstall
graphify opencode install          # AGENTS.md + .opencode/opencode.json（OpenCode）
graphify opencode uninstall
graphify claw install              # AGENTS.md（OpenClaw）
graphify claw uninstall
graphify droid install             # AGENTS.md（Factory Droid）
graphify droid uninstall
graphify trae install              # AGENTS.md（Trae）
graphify trae uninstall
graphify trae-cn install           # AGENTS.md（Trae CN）
graphify trae-cn uninstall
graphify hermes install            # ~/.hermes/skills/graphify/SKILL.md（Hermes）
graphify hermes uninstall
graphify kiro install              # .kiro/skills/graphify/SKILL.md + .kiro/steering/graphify.md（Kiro）
graphify kiro uninstall
graphify antigravity install       # .agent/rules + .agent/workflows + ~/.agent/skills（Google Antigravity）
graphify antigravity uninstall

# 配置型 ontology dataprep profiles - 通过 config/profile 显式 opt-in
graphify profile validate --config graphify.yaml \
  --out .graphify/profile/project-config.normalized.json \
  --profile-out .graphify/profile/ontology-profile.normalized.json
graphify profile dataprep . --config graphify.yaml
graphify profile validate-extraction \
  --profile-state .graphify/profile/profile-state.json \
  --input extraction.json
graphify profile report \
  --profile-state .graphify/profile/profile-state.json \
  --graph .graphify/graph.json \
  --out .graphify/profile/profile-report.md
```

支持混合文件类型：

| 类型 | 扩展名 | 提取方式 |
|------|--------|----------|
| 代码 | `.py .ts .js .jsx .tsx .mjs .vue .svelte .ejs .go .rs .java .c .cpp .rb .cs .kt .scala .php .blade.php .swift .lua .zig .ps1 .ex .exs .m .mm .jl .dart .v .sv` | tree-sitter AST（可用时）+ upstream Python surface 语言 fallback + 调用图 + docstring / 注释中的 rationale |
| 文档 | `.md .mdx .txt .rst .html` | 通过当前平台模型提取概念、关系和设计动机 |
| Office | `.docx .xlsx` | 先转换成 markdown，再交给当前平台模型做抽取 |
| 论文 | `.pdf` | 本地 PDF preflight；文本层 PDF 用 `pdf-parse`/`pdftotext` 转 Markdown；扫描件/低文本 PDF 可用 `mistral-ocr` 生成 Markdown + 图片后再抽取 |
| 图片 | `.png .jpg .webp .gif` | 平台多模态视觉 —— 截图、图表、任意语言都可以 |
| 音频 / 视频 | `.mp4 .mov .webm .mkv .avi .m4v .mp3 .wav .m4a .ogg` | 本地检测；需要时先用 `yt-dlp` 下载音频，再用 `ffmpeg` 规范化并通过 `faster-whisper-ts` 做本地转录，随后进入和文档相同的语义抽取路径 |

### 本地音频/视频转录

TypeScript 端口使用已发布的 `faster-whisper-ts` runtime，不调用 Python。默认转录设置刻意与 upstream Python Graphify 保持一致：Whisper 模型为 `base`、设备为 CPU、compute type 为 `int8`。如果需要不同的本地 CTranslate2 模型或 runtime target，可以通过 `GRAPHIFY_WHISPER_MODEL`、`GRAPHIFY_WHISPER_MODEL_DIR`、`GRAPHIFY_WHISPER_MODEL_ID`、`GRAPHIFY_WHISPER_MODEL_REVISION`、`GRAPHIFY_WHISPER_DEVICE` 和 `GRAPHIFY_WHISPER_COMPUTE_TYPE` 覆盖。

URL ingestion 仍然通过 `yt-dlp` 完成；本地音频/视频解码由 `faster-whisper-ts` 和系统 `ffmpeg` 处理。生成的 transcript 默认写入 `.graphify/transcripts/`，之后会像普通文档一样进入语义抽取流程。

### PDF preflight 与 Mistral OCR

Graphify 不会盲目把 PDF 送去 OCR。`GRAPHIFY_PDF_OCR` 控制行为：`auto`（默认）先用本地 `pdf-parse` 做 preflight，并在可用时回退到 `pdftotext`，只在文本过少时调用 `mistral-ocr`；`off` 保留原 PDF；`always` 强制 Mistral OCR；`dry-run` 只记录判断，不调用 API。可以用 `GRAPHIFY_PDF_OCR_MODEL` 覆盖 Mistral 模型。Mistral OCR 需要 `MISTRAL_API_KEY`；如果 `auto` 模式下缺少 key，graphify 会警告并保留原 PDF，而不是让整次运行失败。

生成的 PDF sidecar 会写入 `.graphify/converted/pdf/`，并带有指向原始 PDF 的 provenance frontmatter，然后作为普通文档进入语义抽取。如果 OCR 生成了图片工件，graphify 会把它们加入语义图片输入；skills 会要求助手用平台视觉能力解读图表、表格、示意图和嵌入文字，也可以在配置时交给外部 OCR/视觉模型，并保留原始 PDF 关联。

### 配置型 ontology dataprep profiles

Profile mode 是严格增量能力。只有当 graphify 发现 `graphify.yaml`、`graphify.yml`、`.graphify/config.yaml`、`.graphify/config.yml`，或你显式传入 `--config` / `--profile` 时才会启用。没有这些激活条件时，普通 graphify 行为不变。

Project config 描述物理输入：corpus 目录、需要参与语义抽取的生成 sidecar、registry 文件、排除路径、PDF/OCR 策略，以及 `.graphify/` 下的 state 输出。Ontology profile 描述语义约束：允许的 node type、relation type、citation 要求、review status 和命名 registry binding。Registry 可以是 CSV、JSON 或 YAML，会被规范化成带稳定 ID 和 profile 属性的普通 Graphify extraction fragment。

本地 CLI/runtime 只覆盖确定性步骤：

```bash
graphify profile validate --config graphify.yaml
graphify profile dataprep . --config graphify.yaml
graphify profile validate-extraction --profile-state .graphify/profile/profile-state.json --input extraction.json
graphify profile report --profile-state .graphify/profile/profile-state.json --graph .graphify/graph.json --out .graphify/profile/profile-report.md
```

Assistant skills 通过同一套 runtime 命令工作：`project-config`、`configured-dataprep`、`profile-prompt`、`profile-validate-extraction` 和 `profile-report`。完整语义抽取仍由 skill 编排：助手读取 profile prompt，抽取符合 profile 的 Graphify JSON，先通过基础 schema 再通过 profile rules 校验，然后并入现有 graph build/report/export/wiki 流程。

Profile artifact 位于 `.graphify/profile/`，semantic cache 按 profile hash 隔离，普通 LLM Wiki 仍然是 `.graphify/wiki/index.md`。Graphify 只内置合成 profile 示例和 fixture；真实项目 config、registry、专有 ontology 应放在消费方仓库中。MCP 专用 profile tool、embeddings、数据库、远程 registry 和独立 profile wiki 都在本批次之外。

## 你会得到什么

**God nodes** —— 度最高的概念节点（整个系统最容易汇聚到的地方）

**意外连接** —— 按综合得分排序。代码-论文之间的边会比代码-代码边权重更高。每条结果都会附带一段人话解释。

**建议提问** —— 图谱特别擅长回答的 4 到 5 个问题。

**“为什么”** —— docstring、行内注释（`# NOTE:`、`# IMPORTANT:`、`# HACK:`、`# WHY:`）以及文档里的设计动机都会被抽取成 `rationale_for` 节点。不只是知道代码“做了什么”，还能知道“为什么要这么写”。

**置信度分数** —— 每条 `INFERRED` 边都有 `confidence_score`（0.0-1.0）。你不只知道哪些是猜出来的，还知道模型对这个猜测有多有把握。`EXTRACTED` 边恒为 1.0。

**语义相似边** —— 跨文件的概念连接，即使结构上没有直接依赖也能建立关联。比如两个函数做的是同一类问题但彼此没有调用，或者某个代码类和某篇论文里的算法概念本质相同。

**超边（Hyperedges）** —— 用来表达 3 个以上节点的群组关系，这是普通两两边表达不出来的。比如：一组类共同实现一个协议、认证链路里的一组函数、同一篇论文某一节里的多个概念共同组成一个想法。

**Token 基准** —— 每次运行后都会自动打印。对混合语料（Karpathy 的仓库 + 论文 + 图片），每次查询的 token 消耗可以比直接读原文件少 **71.5 倍**。第一次运行需要先提取并建图，这一步会花 token；后续查询直接读取压缩后的图谱，节省会越来越明显。SHA256 缓存保证重复运行时只重新处理变更文件。

**自动同步**（`--watch`）—— 在后台终端里跑着，代码库一变化，图谱就会跟着更新。代码文件保存会立刻触发重建（只走 AST，不用 LLM）；文档/图片变更则会提醒你跑 `--update` 进行 LLM 再提取。

**Git hooks**（`graphify hook install`）—— 安装兼容 worktree 的 `post-commit`、`post-checkout`、`post-merge` 和 `post-rewrite` hook。hook 会先把 `.graphify/` 标记为 stale，更新 branch/worktree 元数据，然后在安全且成本低时尝试非阻塞的 code-only rebuild。hook 失败不会阻塞 Git 操作。用 `graphify state status` 查看生命周期元数据，用 `graphify state prune` 预览 stale 清理计划。

**Wiki**（`--wiki`）—— 为每个 community 和 god node 生成类似维基百科的 Markdown 文章，并提供 `index.md` 作为入口。任何 agent 只要读 `index.md`，就能通过普通文件导航整个知识库，而不必直接解析 JSON。

## Worked examples

| 语料 | 文件数 | 压缩比 | 输出 |
|------|--------|--------|------|
| Karpathy 的仓库 + 5 篇论文 + 4 张图片 | 52 | **71.5x** | [`worked/karpathy-repos/`](worked/karpathy-repos/) |
| graphify 源码 + Transformer 论文 | 4 | **5.4x** | [`worked/mixed-corpus/`](worked/mixed-corpus/) |
| httpx（合成 Python 库） | 6 | ~1x | [`worked/httpx/`](worked/httpx/) |

Token 压缩效果会随着语料规模增大而更明显。6 个文件本来就塞得进上下文窗口，所以 graphify 在这种场景里的价值更多是结构清晰度，而不是 token 压缩。到了 52 个文件（代码 + 论文 + 图片）这种规模，就能做到 71x+。每个 `worked/` 目录里都带了原始输入和真实输出（`GRAPH_REPORT.md`、`graph.json`），你可以自己跑一遍核对数字。

## 隐私

graphify 会把文档、论文和图片的内容发送给你所用 AI 编码助手背后的模型 API 来做语义提取 —— 可能是 Anthropic（Claude Code）、OpenAI（Codex）、Google（Gemini CLI），或者你当前平台使用的其他提供方。代码文件则完全在本地通过 tree-sitter AST 或 fallback extractor 处理，不会把代码内容发出去。音频/视频转录通过你本机上的 `yt-dlp` + `ffmpeg` + `faster-whisper-ts` 工具链完成。PDF 文本 preflight 是本地执行（`pdf-parse`，可选回退到 `pdftotext`）；Mistral OCR 是唯一新增的 PDF 专用网络调用，并且只会在 `GRAPHIFY_PDF_OCR=auto` 检测到扫描件/低文本 PDF 或你显式强制 OCR 时发生。项目本身没有任何遥测、使用跟踪或分析。网络请求只包括语义提取阶段调用你平台自己的模型 API、PDF OCR 模式需要时调用可选的 Mistral OCR，以及你显式要求 graphify 拉取的 URL；这些都使用你自己的 API key 或本地凭据。

## 技术栈

Graphology + Louvain（`graphology-communities-louvain`）+ tree-sitter + vis-network，再加上 regex fallback extractor、`pdf-parse`、可选的系统 `pdftotext`、可选的 `mistral-ocr`、`mammoth`、`exceljs`、`turndown`，以及按 upstream 对齐的 `yt-dlp` + `ffmpeg` + `faster-whisper-ts` 转录路径。语义提取由你当前平台运行的模型完成（Claude Code、Codex、Gemini CLI 或其他已支持客户端）。默认 HTML 输出是纯静态文件，不需要 Neo4j。

## 致谢

本仓库是 [Safi Shamsi](https://github.com/safishamsi/graphify) 原始 Graphify 项目的 TypeScript 端口。部分 review 工作流思路也来自 `code-review-graph` 对比研究，详见 [spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md](spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md)。当前受维护产品仍然是 Graphify TypeScript：多模态、默认基于文件，并在需要 parity 的地方继续对齐 upstream Graphify。

## 许可证

MIT。见 [LICENSE](LICENSE)。

<details>
<summary>贡献</summary>

**Worked examples** 是最能建立信任的贡献方式。对一个真实语料跑 `/graphify`，把输出保存到 `worked/{slug}/`，再写一份诚实的 `review.md`，评价图谱哪些地方做得对、哪些地方做得不对，然后提交 PR。

**提取 bug** —— 提 issue 时请附上输入文件、对应的缓存项（`.graphify/cache/`）以及它漏提取或瞎编了什么。

模块职责和新增语言的方法见 [ARCHITECTURE.md](ARCHITECTURE.md)。

</details>
