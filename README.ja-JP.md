# graphify

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

[![TypeScript CI](https://github.com/rhanka/graphify/actions/workflows/typescript-ci.yml/badge.svg?branch=main)](https://github.com/rhanka/graphify/actions/workflows/typescript-ci.yml)

**AIコーディングアシスタント向けのスキル。** Claude Code、Gemini CLI、VS Code Copilot Chat、GitHub Copilot CLI、Aider、OpenCode、OpenClaw、Factory Droid、Trae、Kiro、Google Antigravity では `/graphify`、Codex では `$graphify` と入力すると、ファイルを読み込んでナレッジグラフを構築し、あなたが気づいていなかった構造を返します。コードベースをより速く理解し、アーキテクチャ上の意思決定の「なぜ」を見つけ出します。

このリポジトリは元の Graphify プロジェクトの保守中 TypeScript ポートです。製品の方向性、ワークフロー、初期実装は [Safi Shamsi](https://github.com/safishamsi/graphify) による原典プロジェクトに依拠しています。

graphify はマルチモーダルであり、この TypeScript ポートは upstream Python Graphify `v4` 系を `graphifyy@0.4.33` まで閉じたうえで、小さめの `v5` リポジトリ指向ワークフローも差分を明示しながら追随しています。現在の TS ランタイムはコード、Markdown、MDX、HTML、PDF、Office 文書、スクリーンショット、図表、その他の画像を処理できます。PDF はまずローカル preflight を通り、テキスト層が読める場合は `pdf-parse` で Markdown 化し、利用可能なら `pdftotext` にフォールバックします。スキャン/低テキスト PDF は `mistral-ocr` で Markdown + 画像に変換できます。ローカル音声/動画検出は `yt-dlp` + `ffmpeg` + `faster-whisper-ts` を使い、生成された transcript と PDF sidecar も同じ意味抽出パスに流し込まれます。tree-sitter AST により 20 言語をサポートし（Python、JS、TS、Go、Rust、Java、C、C++、Ruby、C#、Kotlin、Scala、PHP、Swift、Lua、Zig、PowerShell、Elixir、Objective-C、Julia）、Vue、Svelte、Blade、Dart、Verilog/SystemVerilog、MJS、EJS には upstream に合わせた fallback 対応があります。

## ブランチモデル

- `main` は現在のデフォルトで、保守対象の TypeScript 製品ブランチです。
- `v3` は元の Python Graphify 系譜を追跡する upstream mirror / alignment ブランチです。
- TypeScript 製品としての `v4` parity は `graphifyy@0.4.33` で閉じており、以後の upstream 作業や `v5` 差分は `UPSTREAM_GAP.md` に明示します。
- npm 公開は GitHub Actions trusted publishing で保護されます。release tag は、タグ対象コミットが既にデフォルトブランチに含まれ、タグのバージョンが `package.json` と一致する場合のみ有効です。

## 系譜とアラインメント

| 出典 | このリポジトリで維持または適応するもの | アラインメント契約 |
|---|---|---|
| [Safi Shamsi](https://github.com/safishamsi/graphify) による元の Graphify | 中核となる製品アイデア：フォルダ -> ナレッジグラフ、assistant-skill ワークフロー、graph/report/html 出力、provenance ラベル、コミュニティ検出、マルチモーダルなコーパス運用。 | `v3` は upstream Python Graphify の履歴ミラーであり、`UPSTREAM_GAP.md` が閉じた `v4` 系と進行中の `v5` キャッチアップを追跡します。 |
| この TypeScript ポート | npm パッケージ、リポジトリルートの TypeScript runtime、`.graphify/` state、複数アシスタント向け installer、MCP surface、git/worktree lifecycle、TS ツールチェーンによるローカル音声/動画文字起こし。 | `main` が保守対象のデフォルトブランチです。TS 固有の挙動は upstream parity ではなく、意図的な分岐として文書化します。 |
| `code-review-graph` 参照プロジェクト | review 向けのグラフ投影：first-hop summary、review delta、review analysis、review evaluation、install preview、advisory commit grouping の語彙。 | Graphify のグラフ上に追加される review surface として採用します。Graphify は review-only にはならず、SQLite/embeddings をデフォルト採用せず、マルチモーダル対応を維持します。 |

> Andrej Karpathy は論文、ツイート、スクリーンショット、メモを放り込む `/raw` フォルダを持っています。graphify はまさにその問題への答えです――生ファイルを読むのに比べて1クエリあたりのトークン数が 71.5 倍少なく、セッションをまたいで永続化され、見つけたものと推測したものを正直に区別します。

```bash
$graphify .                        # Codex
/graphify .                        # Claude Code / Gemini CLI / Copilot / Aider / OpenCode / OpenClaw / Droid / Trae / Kiro / Antigravity
```

```
.graphify/
├── graph.html       インタラクティブなグラフ - ノードをクリック、検索、コミュニティでフィルタ
├── GRAPH_REPORT.md  ゴッドノード、意外なつながり、推奨される質問
├── graph.json       永続化されたグラフ - 数週間後でも再読み込みなしでクエリ可能
├── wiki/            任意の LLM-readable wiki ページ
├── flows.json       任意の execution-flow artifact
├── branch.json      ローカル branch lifecycle state - ignored
├── worktree.json    ローカル worktree lifecycle state - ignored
└── cache/           ローカル SHA256 キャッシュ - ignored
```

`.graphify/` は commit-safe な graph artifact とローカル lifecycle state に分かれます。`graph.json`、`GRAPH_REPORT.md`、`graph.html`、`flows.json`、`wiki/` は repo-relative paths で書き出されるため、プロジェクトが branch/worktree 間で graph context を共有したい場合はコミットできます。コミット前には `graphify portable-check .graphify` を実行してください。`.graphify/branch.json`、`.graphify/worktree.json`、`.graphify/needs_update`、cache、transcript、変換済み PDF/OCR sidecar、profile runtime scratch はコミットしないでください。これらは現在の worktree にローカルで、設計上 absolute path を含むことがあります。

古いリポジトリに `graphify-out/` が残っている場合は、まず `graphify migrate-state --dry-run` を実行してください。移行はローカル state を `.graphify/` にコピーし、旧ディレクトリは削除しません。`graphify-out` が Git で追跡されている場合は、確認用に `git mv -f graphify-out .graphify` と commit message を表示します。

`graphify recommend-commits` は advisory-only です。Git 変更とグラフ影響から分割案とコミットメッセージを提案しますが、stage、commit、ブランチ変更は行いません。

`graphify review-analysis` は review 向けに blast radius、bridge nodes、test-gap hints、impacted communities、multimodal/doc regression safety を追加します。`graphify review-eval` は JSON cases から token savings、impacted-file recall、review summary precision、multimodal regression safety を測定します。

グラフに含めたくないフォルダを除外するには `.graphifyignore` ファイルを追加します：

```
# .graphifyignore
vendor/
node_modules/
dist/
*.generated.py
```

構文は `.gitignore` と同じです。パターンは graphify を実行したフォルダからの相対パスに対してマッチします。

## 入力スコープの選び方

Graphify は、コード/レビュー向けの安全なスキャンと、ナレッジベース全体の再帰クロールを分けて扱います。

- スコープ対応コマンドの既定値は `--scope auto` です。
- `HEAD` のある Git リポジトリでは、`auto` はコミット済みファイルと `.graphify/memory/*` に解決されます。
- `--scope tracked` は、まだコミットされていない新規 staged ファイルも含めます。
- `--all` は `--scope all` の別名で、再帰フォルダ走査に戻します。論文、ノート、スクリーンショット、音声/動画、非 Git フォルダではこれを使ってください。
- `graphify scope inspect . --scope auto` で、再構築前に実際の対象ファイルを確認できます。
- 設定付きプロジェクトでは `graphify.yaml` で既定値を固定できます：

```yaml
inputs:
  scope: all
```

現在この入力スコープは `detect`、`detect-incremental`、`update`、`watch`、`hook-rebuild`、および設定ベースの profile dataprep に適用されます。検出メタデータは `.graphify/scope.json` に保存され、`GRAPH_REPORT.md` に要約されます。

## 仕組み

graphify は決定論的な構造抽出とモデル駆動の意味抽出を組み合わせ、必要に応じてその間にローカル前処理を挟みます。コードは LLM を使わない AST パスでクラス、関数、インポート、コールグラフ、docstring、根拠コメントを抽出します。ドキュメント、論文、Office 文書、画像はテキストまたはマルチモーダル入力に正規化したうえで、プラットフォーム側モデルのサブエージェントが概念、関係、設計意図を抽出します。PDF はローカル preflight を通り、テキスト層が使える場合は `pdf-parse` またはローカル `pdftotext` で Markdown sidecar を作成し、スキャン/低テキスト PDF は `auto` または `always` モードで `mistral-ocr` により Markdown + 画像へ変換できます。PDF から抽出された画像も、図表、表、ダイアグラム、埋め込みテキストが意味を持つ場合は意味入力として扱います。既定ではアシスタントの vision モデルで解釈し、設定済みなら外部 OCR/vision モデルへ委譲できます。いずれも PDF provenance を保持します。音声/動画もローカルで検出でき、TypeScript ランタイムから `yt-dlp` で音声を取得し、`ffmpeg` で正規化し、`faster-whisper-ts` で文字起こしします。その transcript も他のドキュメントと同じ意味抽出パスに流し込みます。結果は Graphology グラフにマージされ、Louvain コミュニティ検出でクラスタリングされ、インタラクティブ HTML、クエリ可能な JSON、平易な監査レポートとしてエクスポートされます。

**クラスタリングはグラフトポロジベースで、埋め込みは使いません。** Louvain はエッジ密度によってコミュニティを見つけます。プラットフォームモデルが抽出する意味的類似性エッジ（`semantically_similar_to`、`INFERRED`）は既にグラフに含まれているため、コミュニティ検出に直接影響します。グラフ構造そのものが類似性シグナルであり、別途の embedding ステップやベクターデータベースは不要です。

すべての関係は `EXTRACTED`（ソースから直接見つかった）、`INFERRED`（合理的な推論、信頼度スコア付き）、`AMBIGUOUS`（レビュー対象としてフラグ付け）のいずれかでタグ付けされます。何が見つかったもので何が推測されたものか、常に分かります。

## インストール

**必要なもの:** Node.js 20+ と、次のいずれかのクライアント: [Claude Code](https://claude.ai/code), [Codex](https://openai.com/codex), [Gemini CLI](https://github.com/google-gemini/gemini-cli), VS Code Copilot Chat, [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli), [Aider](https://aider.chat), [OpenCode](https://opencode.ai), [OpenClaw](https://openclaw.ai), [Factory Droid](https://factory.ai), [Trae](https://trae.com), [Cursor](https://cursor.com), Hermes, Kiro, Google Antigravity

```bash
npm install -g graphifyy
graphify install
```

> npm パッケージは `graphify` の名前が再取得されるまでの間、一時的に `graphifyy` となっています。CLI とスキルコマンドは依然として `graphify` です。

インストールコマンドはファイルを書き込む前に mutation preview を表示し、変更対象の assistant instruction ファイルと hook/MCP/plugin 設定を明示します。

### プラットフォームサポート

| プラットフォーム | インストールコマンド |
|----------|----------------|
| Claude Code (Linux/Mac) | `graphify install` |
| Claude Code (Windows) | `graphify install`（自動検出）または `graphify install --platform windows` |
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

Codex ユーザーは並列抽出のために `~/.codex/config.toml` の `[features]` の下に `multi_agent = true` も必要です。Gemini CLI は `/graphify` を `~/.gemini/commands/graphify.toml` のカスタムコマンドとして登録し、プロジェクトインストール時には `.gemini/settings.json` に `graphify serve` 用の MCP 設定も書き込みます。GitHub Copilot CLI はグローバルな `~/.copilot/skills/graphify/SKILL.md` を使います。VS Code Copilot Chat は同じグローバル skill に加えて `.github/copilot-instructions.md` を書き込みます。Aider は `~/.aider/graphify/SKILL.md` を使いますが、このプラットフォームでは意味抽出はまだ逐次実行です。OpenCode は `.opencode/plugins/graphify.js` と `.opencode/opencode.json` で `tool.execute.before` plugin を登録します。Factory Droid は並列サブエージェントディスパッチに `Task` ツールを使用します。OpenClaw と Hermes は逐次抽出を使用します。Kiro は `.kiro/skills/graphify/SKILL.md` と常時有効の `.kiro/steering/graphify.md` を書き込みます。Google Antigravity は `.agent/rules/graphify.md`、`.agent/workflows/graphify.md`、グローバル `~/.agent/skills/graphify/SKILL.md` を書き込みます。Trae は `Agent` ツールを使いますが、Claude/Codex 型の PreToolUse フックは持たないため `AGENTS.md` が常時有効の仕組みです。

次に、AI コーディングアシスタントを開いて入力します：

```bash
$graphify .                        # Codex
/graphify .                        # Claude Code / Gemini CLI / Copilot / Aider / OpenCode / OpenClaw / Droid / Trae / Kiro / Antigravity
```

注意：Codex はスキル呼び出しに `/` ではなく `$` を使用するため、代わりに `$graphify .` と入力してください。

### アシスタントに常にグラフを使わせる（推奨）

グラフを構築した後、プロジェクトで一度だけ以下を実行します：

| プラットフォーム | コマンド |
|----------|---------|
| Claude Code | `graphify claude install` |
| Codex | `graphify codex install` |
| Gemini CLI | `graphify gemini install` |
| GitHub Copilot CLI | `graphify copilot install` |
| VS Code Copilot Chat | `graphify vscode install` |
| Aider | `graphify aider install` |
| Cursor | `graphify cursor install` |
| OpenCode | `graphify opencode install` |
| OpenClaw | `graphify claw install` |
| Factory Droid | `graphify droid install` |
| Trae | `graphify trae install` |
| Trae CN | `graphify trae-cn install` |
| Hermes | `graphify hermes install` |
| Kiro | `graphify kiro install` |
| Google Antigravity | `graphify antigravity install` |

**Claude Code** は 2 つのことを行います：Claude にアーキテクチャの質問に答える前に `.graphify/GRAPH_REPORT.md` を読むように指示する `CLAUDE.md` セクションを書き込み、すべての Glob と Grep 呼び出しの前に発火する **PreToolUse フック**（`settings.json`）をインストールします。ナレッジグラフが存在する場合、Claude は次のメッセージを見ます：_"graphify: Knowledge graph exists. Read GRAPH_REPORT.md for god nodes and community structure before searching raw files."_ ――これにより Claude はすべてのファイルを grep するのではなく、グラフを介してナビゲートします。

**Codex** は `AGENTS.md` にルールを書き込み、`.codex/hooks.json` に PreToolUse フックも追加します。
**Gemini CLI** は `GEMINI.md` を書き込み、`.gemini/settings.json` でプロジェクトスコープの `graphify` MCP サーバーを登録します。
**GitHub Copilot CLI** はグローバル `~/.copilot/skills/graphify/SKILL.md` を使います。
**VS Code Copilot Chat** はグローバル `graphify` skill をインストールし、`.github/copilot-instructions.md` を書き込むため、リポジトリ内の Copilot Chat が graphify ルールを自動的に読みます。
**Aider** はプロジェクトルートの `AGENTS.md` とグローバル `~/.aider/graphify/SKILL.md` を使いますが、意味抽出はまだ逐次です。
**Cursor** は `.cursor/rules/graphify.mdc` を `alwaysApply: true` で書き込みます。
**OpenCode** は `AGENTS.md` に加え、`.opencode/plugins/graphify.js` と `.opencode/opencode.json` でプロジェクトローカルプラグインを登録します。
**Hermes** はグローバル `~/.hermes/skills/graphify/SKILL.md` をインストールし、同じ `/graphify` の明示 skill 契約を使います。
**Kiro** は `.kiro/skills/graphify/SKILL.md`、`.graphify_version`、`inclusion: always` 付きの `.kiro/steering/graphify.md` を書き込みます。
**Google Antigravity** は `.agent/rules/graphify.md`、`.agent/workflows/graphify.md`、グローバル `~/.agent/skills/graphify/SKILL.md` を書き込みます。
**OpenClaw、Factory Droid、Trae、Trae CN** は同じルールをプロジェクトルートの `AGENTS.md` に書き込みます。これらのプラットフォームは Claude/Codex 型の PreToolUse フックをサポートしていないため、AGENTS.md が常時有効のメカニズムとなります。

アンインストールは対応するアンインストールコマンドで行います（例：`graphify claude uninstall`）。

**常時有効 vs 明示的トリガー――何が違うのか？**

常時有効のフックは `GRAPH_REPORT.md` を表面化します――これはゴッドノード、コミュニティ、意外なつながりを 1 ページにまとめた要約です。アシスタントはファイル検索の前にこれを読み、キーワードマッチではなく構造に基づいてナビゲートします。これで日常的な質問のほとんどをカバーできます。

`/graphify query`、`/graphify path`、`/graphify explain` はさらに深く踏み込みます：生の `graph.json` をホップごとに辿り、ノード間の正確なパスをトレースし、エッジレベルの詳細（関係タイプ、信頼度スコア、ソース位置）を表面化します。一般的なオリエンテーションではなく、特定の質問をグラフから答えさせたいときに使います。

こう考えてください：常時有効のフックはアシスタントに地図を与え、`/graphify` コマンドはその地図を正確にナビゲートさせます。

<details>
<summary>手動インストール（curl）</summary>

```bash
mkdir -p ~/.claude/skills/graphify
curl -fsSL https://raw.githubusercontent.com/rhanka/graphify/main/src/skills/skill.md \
  > ~/.claude/skills/graphify/SKILL.md
```

`~/.claude/CLAUDE.md` に追加します：

```
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.
```

</details>

## 使い方

```
/graphify                          # カレントディレクトリで実行
/graphify ./raw                    # 特定のフォルダで実行
/graphify ./raw --mode deep        # より積極的な INFERRED エッジ抽出
/graphify ./raw --pdf-ocr auto     # PDF preflight。必要時に mistral-ocr でスキャン/低テキスト PDF を処理
/graphify ./raw --update           # 変更されたファイルのみ再抽出し、既存グラフにマージ
/graphify ./raw --cluster-only     # 既存グラフのクラスタリングを再実行（再抽出なし）
/graphify ./raw --no-viz           # HTML をスキップ、レポート + JSON のみ生成
/graphify ./raw --obsidian                          # Obsidian ボールトも生成（オプトイン）
/graphify ./raw --obsidian --obsidian-dir ~/vaults/myproject  # ボールトを特定のディレクトリに書き込み

/graphify add https://arxiv.org/abs/1706.03762        # 論文を取得、保存、グラフを更新
/graphify add https://www.youtube.com/watch?v=...     # 動画の音声を取得し、次回 build/update で transcript 化
/graphify add https://x.com/karpathy/status/...       # ツイートを取得
/graphify add https://... --author "Name"             # 元の著者をタグ付け
/graphify add https://... --contributor "Name"        # コーパスに追加した人をタグ付け

/graphify query "アテンションとオプティマイザを結ぶものは？"
/graphify query "アテンションとオプティマイザを結ぶものは？" --dfs   # 特定のパスをトレース
/graphify query "アテンションとオプティマイザを結ぶものは？" --budget 1500  # N トークンで上限設定
/graphify summary --graph .graphify/graph.json        # 深い traversal の前に compact first-hop orientation を取得
/graphify review-delta --files src/auth.ts --graph .graphify/graph.json  # 変更ファイルの review impact
/graphify review-analysis --files src/auth.ts --graph .graphify/graph.json  # blast radius + review ビュー
/graphify recommend-commits --files src/auth.ts,src/session.ts --graph .graphify/graph.json  # advisory-only のコミット分割提案
/graphify path "DigestAuth" "Response"
/graphify explain "SwinTransformer"

/graphify ./raw --watch            # ファイル変更時にグラフを自動同期（コード：即時、ドキュメント：通知）
/graphify ./raw --wiki             # エージェントがクロール可能な wiki を構築（index.md + コミュニティごとの記事）
/graphify ./raw --svg              # graph.svg をエクスポート
/graphify ./raw --graphml          # graph.graphml をエクスポート（Gephi、yEd）
/graphify ./raw --neo4j            # Neo4j 用の cypher.txt を生成
/graphify ./raw --neo4j-push bolt://localhost:7687    # 実行中の Neo4j インスタンスに直接プッシュ
/graphify ./raw --mcp              # MCP stdio サーバーを起動

# git フック - プラットフォーム非依存。Git ライフサイクルイベントで stale 化し、軽量再構築を試行
graphify hook install
graphify hook uninstall
graphify hook status
graphify check-update .          # .graphify の semantic / lifecycle 更新シグナルを確認
graphify state status            # .graphify/worktree.json + branch.json を確認
graphify recommend-commits          # 現在の Git 変更から advisory-only のコミット分割を提案
graphify state prune             # 非破壊の stale-state クリーンアップ計画を表示

# 常時有効のアシスタント指示 - プラットフォーム固有
graphify claude install            # CLAUDE.md + PreToolUse フック（Claude Code）
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

# ターミナルから直接グラフをクエリ（AI アシスタント不要）
graphify query "アテンションとオプティマイザを結ぶものは？"
graphify query "認証フローを表示" --dfs
graphify query "CfgNode とは？" --budget 500
graphify summary --graph .graphify/graph.json
graphify review-delta --files src/auth.ts,src/session.ts --graph .graphify/graph.json
graphify review-analysis --files src/auth.ts --graph .graphify/graph.json
graphify review-eval --cases .graphify/review-cases.json --graph .graphify/graph.json
graphify recommend-commits --files src/auth.ts,src/session.ts --graph .graphify/graph.json
graphify query "..." --graph path/to/graph.json

# 設定済み ontology dataprep profiles - config/profile による明示 opt-in
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

あらゆるファイルタイプの組み合わせで動作します：

| タイプ | 拡張子 | 抽出方法 |
|------|-----------|------------|
| コード | `.py .ts .js .jsx .tsx .mjs .vue .svelte .ejs .go .rs .java .c .cpp .rb .cs .kt .scala .php .blade.php .swift .lua .zig .ps1 .ex .exs .m .mm .jl .dart .v .sv` | tree-sitter AST（利用可能な場合）+ upstream Python surface language fallback + コールグラフ + docstring / コメントの根拠 |
| ドキュメント | `.md .mdx .txt .rst .html` | 現在のプラットフォームモデルによる概念 + 関係性 + 設計根拠 |
| Office | `.docx .xlsx` | Markdown に変換した後、現在のプラットフォームモデルで抽出 |
| 論文 | `.pdf` | ローカル PDF preflight。テキスト層 PDF は `pdf-parse`/`pdftotext` で Markdown 化し、スキャン/低テキスト PDF は `mistral-ocr` で Markdown + 画像にしてから意味抽出 |
| 画像 | `.png .jpg .webp .gif` | プラットフォームのマルチモーダルモデル - スクリーンショット、図、任意の言語 |
| 音声 / 動画 | `.mp4 .mov .webm .mkv .avi .m4v .mp3 .wav .m4a .ogg` | ローカルで検出し、必要に応じて `yt-dlp` で取得、`ffmpeg` で正規化、`faster-whisper-ts` で文字起こししたうえで、ドキュメントと同じ意味抽出パスに流し込む |

### ローカル音声/動画文字起こし

TypeScript ポートは公開済みの `faster-whisper-ts` runtime を使用し、Python は呼び出しません。デフォルトの文字起こし設定は upstream Python Graphify と意図的に揃えており、Whisper モデルは `base`、デバイスは CPU、compute type は `int8` です。別のローカル CTranslate2 モデルや runtime target が必要な場合は、`GRAPHIFY_WHISPER_MODEL`、`GRAPHIFY_WHISPER_MODEL_DIR`、`GRAPHIFY_WHISPER_MODEL_ID`、`GRAPHIFY_WHISPER_MODEL_REVISION`、`GRAPHIFY_WHISPER_DEVICE`、`GRAPHIFY_WHISPER_COMPUTE_TYPE` で上書きできます。

URL ingestion は引き続き `yt-dlp` を使います。ローカルの音声/動画デコードは `faster-whisper-ts` とシステム `ffmpeg` が処理します。生成された transcript はデフォルトで `.graphify/transcripts/` に書き込まれ、その後は通常のドキュメント入力として意味抽出に渡されます。

### PDF preflight と Mistral OCR

Graphify は PDF を無条件に OCR へ送りません。`GRAPHIFY_PDF_OCR` で挙動を制御します。`auto`（デフォルト）はローカル `pdf-parse` preflight を行い、利用可能なら `pdftotext` にフォールバックし、テキストが少なすぎる場合だけ `mistral-ocr` を呼びます。`off` は元 PDF をそのまま残し、`always` は Mistral OCR を強制し、`dry-run` は API を呼ばず判定だけを記録します。Mistral モデルは `GRAPHIFY_PDF_OCR_MODEL` で上書きできます。Mistral OCR には `MISTRAL_API_KEY` が必要です。`auto` で key がない場合は警告し、元 PDF を残して処理を続けます。

生成された PDF sidecar は `.graphify/converted/pdf/` に保存され、元 PDF への provenance frontmatter を持ち、その後は通常のドキュメントとして意味抽出に渡されます。OCR が画像アーティファクトを生成した場合、graphify はそれらを意味抽出用の画像入力へ追加します。skills はプラットフォーム vision で図表、表、ダイアグラム、埋め込みテキストを解釈するよう指示し、設定済みなら外部 OCR/vision モデルに委譲できます。元 PDF への関連は保持します。

### 設定済み ontology dataprep profiles

Profile mode は完全に追加機能です。`graphify.yaml`、`graphify.yml`、`.graphify/config.yaml`、`.graphify/config.yml` が見つかった場合、または明示的に `--config` / `--profile` を渡した場合だけ有効になります。有効化されていない場合、通常の graphify の挙動は変わりません。

Project config は物理入力を定義します：corpus フォルダ、意味抽出対象に含める生成 sidecar、registry ファイル、exclude、PDF/OCR policy、`.graphify/` 配下の state 出力先です。Ontology profile は意味制約を定義します：許可された node type、relation type、citation 要件、review status、名前付き registry binding です。Registry は CSV、JSON、YAML を読み込め、安定 ID と profile 属性付きの通常の Graphify extraction fragment に正規化されます。

ローカル CLI/runtime は決定論的ステップだけを扱います：

```bash
graphify profile validate --config graphify.yaml
graphify profile dataprep . --config graphify.yaml
graphify profile validate-extraction --profile-state .graphify/profile/profile-state.json --input extraction.json
graphify profile report --profile-state .graphify/profile/profile-state.json --graph .graphify/graph.json --out .graphify/profile/profile-report.md
```

Assistant skill は同じ runtime を `project-config`、`configured-dataprep`、`profile-prompt`、`profile-validate-extraction`、`profile-report` として使います。完全な semantic extraction は引き続き skill orchestrated です。assistant が profile prompt を読み、profile 形状の Graphify JSON を抽出し、base schema と profile rules で検証したうえで、既存の graph build/report/export/wiki flow にマージします。

Profile artifact は `.graphify/profile/` に置かれ、semantic cache は profile hash で分離されます。通常の LLM Wiki は引き続き `.graphify/wiki/index.md` です。Graphify が同梱する profile example と fixture は合成データのみです。実プロジェクトの config、registry、proprietary ontology は利用側リポジトリに置きます。MCP 専用 profile tool、embeddings、database、remote registry、独立 profile wiki はこの lot では deferred です。

## 得られるもの

**ゴッドノード** - 最高次数の概念（すべてが接続するもの）

**意外なつながり** - 複合スコアでランク付け。コード-論文のエッジはコード-コードよりも高くランクされます。各結果には平易な英語の理由が含まれます。

**推奨される質問** - グラフがユニークに答えられる 4〜5 の質問

**「なぜ」** - docstring、インラインコメント（`# NOTE:`、`# IMPORTANT:`、`# HACK:`、`# WHY:`）、ドキュメントからの設計根拠が `rationale_for` ノードとして抽出されます。コードが何をするかだけでなく――なぜそのように書かれたか。

**信頼度スコア** - すべての INFERRED エッジには `confidence_score`（0.0〜1.0）があります。何が推測されたかだけでなく、モデルがどれだけ確信していたかもわかります。EXTRACTED エッジは常に 1.0 です。

**意味的類似性エッジ** - 構造的接続のないクロスファイル概念リンク。互いを呼び出さずに同じ問題を解いている 2 つの関数、同じアルゴリズムを記述しているコード内のクラスと論文内の概念など。

**ハイパーエッジ** - ペアワイズエッジでは表現できない 3+ ノードを接続するグループ関係。共有プロトコルを実装するすべてのクラス、認証フロー内のすべての関数、論文セクションから 1 つのアイデアを形成するすべての概念など。

**トークンベンチマーク** - 実行ごとに自動的に出力されます。混合コーパス（Karpathy リポジトリ + 論文 + 画像）で、生ファイルを読むのに比べて 1 クエリあたり **71.5 倍** 少ないトークン。最初の実行で抽出とグラフ構築を行います（これにはトークンがかかります）。以降のクエリはすべて生ファイルではなくコンパクトなグラフを読みます――ここで節約が複利的に効いてきます。SHA256 キャッシュにより、再実行時は変更されたファイルのみ再処理されます。

**自動同期** (`--watch`) - バックグラウンドターミナルで実行し、コードベースが変更されるとグラフが自動的に更新されます。コードファイルの保存は即座の再構築をトリガーします（AST のみ、LLM なし）。ドキュメント/画像の変更は、LLM の再パスのために `--update` を実行するよう通知します。

**Git フック** (`graphify hook install`) - worktree 互換の `post-commit`、`post-checkout`、`post-merge`、`post-rewrite` フックをインストールします。フックはまず `.graphify/` を stale としてマークし、branch/worktree メタデータを更新し、安全で低コストな場合だけ非ブロッキングの code-only rebuild を試みます。フック失敗は Git 操作をブロックしません。`graphify state status` でライフサイクルメタデータを確認し、`graphify state prune` で stale cleanup を削除なしでプレビューできます。

**Wiki** (`--wiki`) - コミュニティごとおよびゴッドノードごとの Wikipedia スタイルの Markdown 記事と、`index.md` エントリポイント。任意のエージェントを `index.md` に向ければ、JSON をパースする代わりにファイルを読むことでナレッジベースをナビゲートできます。

## 実例

| コーパス | ファイル数 | 削減率 | 出力 |
|--------|-------|-----------|--------|
| Karpathy リポジトリ + 論文5本 + 画像4枚 | 52 | **71.5x** | [`worked/karpathy-repos/`](worked/karpathy-repos/) |
| graphify ソース + Transformer 論文 | 4 | **5.4x** | [`worked/mixed-corpus/`](worked/mixed-corpus/) |
| httpx（合成 Python ライブラリ） | 6 | ~1x | [`worked/httpx/`](worked/httpx/) |

トークン削減はコーパスサイズに応じてスケールします。6 ファイルはいずれにせよコンテキストウィンドウに収まるため、そこでのグラフの価値は圧縮ではなく構造的明瞭さです。52 ファイル（コード + 論文 + 画像）では 71 倍以上が得られます。各 `worked/` フォルダには生の入力ファイルと実際の出力（`GRAPH_REPORT.md`、`graph.json`）があり、自分で実行して数字を検証できます。

## プライバシー

graphify はドキュメント、論文、画像の意味的抽出のために、ファイル内容を AI コーディングアシスタントの基盤モデル API に送信します。Anthropic（Claude Code）、OpenAI（Codex）、Google（Gemini CLI）など、利用中プラットフォームのプロバイダーが対象です。コードファイルは tree-sitter AST または fallback extractor でローカル処理されるため、コードに関してはファイル内容がマシンから出ることはありません。音声/動画の文字起こしはローカルの `yt-dlp` + `ffmpeg` + `faster-whisper-ts` ツールチェーンで実行されます。PDF テキスト preflight はローカルで実行されます（`pdf-parse`、任意で `pdftotext` フォールバック）。Mistral OCR は追加の PDF 専用ネットワーク呼び出しであり、`GRAPHIFY_PDF_OCR=auto` がスキャン/低テキスト PDF を検出した場合、または明示的に OCR を強制した場合にだけ実行されます。テレメトリ、利用追跡、分析は一切ありません。ネットワーク呼び出しは、抽出中のプラットフォームのモデル API、PDF OCR モードが必要とする任意の Mistral OCR、そしてあなたが明示的に ingestion を指示した URL 取得のみです。いずれもあなた自身の API key またはローカル認証情報を使います。

## 技術スタック

Graphology + Louvain（`graphology-communities-louvain`） + tree-sitter + vis-network に加え、regex fallback extractor、`pdf-parse`、任意のシステム `pdftotext`、任意の `mistral-ocr`、`mammoth`、`exceljs`、`turndown`、upstream に合わせた `yt-dlp` + `ffmpeg` + `faster-whisper-ts` の文字起こし経路を使います。意味的抽出は利用中プラットフォームのモデル（Claude Code、Codex、Gemini CLI など）を介して行われます。デフォルトの HTML 出力は完全な静的ファイルです。

## 謝辞

このリポジトリは [Safi Shamsi](https://github.com/safishamsi/graphify) による元の Graphify プロジェクトの TypeScript ポートです。一部の review ワークフローのアイデアは、[spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md](spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md) に記録した `code-review-graph` 比較作業からも適応しています。保守対象の製品は引き続き Graphify TypeScript であり、マルチモーダル、ファイルベースをデフォルトとし、parity が重要な箇所では upstream Graphify に合わせます。

## ライセンス

MIT。詳細は [LICENSE](LICENSE) を参照してください。

## スター履歴

[![Star History Chart](https://api.star-history.com/svg?repos=safishamsi/graphify&type=Date)](https://star-history.com/#safishamsi/graphify&Date)

<details>
<summary>コントリビューション</summary>

**実例** は最も信頼を築くコントリビューションです。実際のコーパスで `/graphify` を実行し、出力を `worked/{slug}/` に保存し、グラフが正しく捉えたもの・間違えたものを評価する正直な `review.md` を書き、PR を提出してください。

**抽出バグ** - 入力ファイル、キャッシュエントリ（`.graphify/cache/`）、何が見逃された/捏造されたかを添えて issue を開いてください。

モジュールの責任と言語の追加方法については [ARCHITECTURE.md](ARCHITECTURE.md) を参照してください。

</details>
