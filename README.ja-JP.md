# graphify

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

[![TypeScript CI](https://github.com/rhanka/graphify/actions/workflows/typescript-ci.yml/badge.svg?branch=v3-typescript)](https://github.com/rhanka/graphify/actions/workflows/typescript-ci.yml)

**AIコーディングアシスタント向けのスキル。** Claude Code、Gemini CLI、GitHub Copilot CLI、Aider、OpenCode、OpenClaw、Factory Droid、Trae では `/graphify`、Codex では `$graphify` と入力すると、ファイルを読み込んでナレッジグラフを構築し、あなたが気づいていなかった構造を返します。コードベースをより速く理解し、アーキテクチャ上の意思決定の「なぜ」を見つけ出します。

このリポジトリは元の Graphify プロジェクトの保守中 TypeScript ポートです。製品の方向性、ワークフロー、初期実装は [Safi Shamsi](https://github.com/safishamsi/graphify) による原典プロジェクトに依拠しています。

graphify はマルチモーダルであり、この TypeScript ポートは upstream `v3` に対してリリース単位でキャッチアップしています。現在の TS ランタイムはコード、Markdown、PDF、Office 文書、スクリーンショット、図表、その他の画像を処理できます。このブランチではさらにローカルの音声/動画検出と `yt-dlp` + `ffmpeg` + `sherpa-onnx-node` による文字起こし経路を追加しており、生成された transcript も同じ意味抽出パスに流し込まれます。tree-sitter AST により 20 言語をサポートします（Python、JS、TS、Go、Rust、Java、C、C++、Ruby、C#、Kotlin、Scala、PHP、Swift、Lua、Zig、PowerShell、Elixir、Objective-C、Julia）。

## ブランチモデル

- `v3-typescript` は現在のデフォルトで、保守対象の TypeScript 製品ブランチです。
- `v3` は元の Python Graphify 系譜を追跡する upstream mirror / alignment ブランチです。
- キャッチアップ作業はバージョンごとに記録し、差分を明示します。

## アラインメントと分岐

- 元の Graphify は製品系譜と parity 目標です。
- TypeScript ポートは npm 配布、ローカル runtime state、MCP / install surfaces、git worktree lifecycle などを TS-native に強化します。
- `code-review-graph` は将来の review-mode の参考であり、主系譜ではありません。

> Andrej Karpathy は論文、ツイート、スクリーンショット、メモを放り込む `/raw` フォルダを持っています。graphify はまさにその問題への答えです――生ファイルを読むのに比べて1クエリあたりのトークン数が 71.5 倍少なく、セッションをまたいで永続化され、見つけたものと推測したものを正直に区別します。

```bash
$graphify .                        # Codex
/graphify .                        # Claude Code / Gemini CLI / Copilot CLI / Aider / OpenCode / OpenClaw / Droid / Trae
```

```
.graphify/
├── graph.html       インタラクティブなグラフ - ノードをクリック、検索、コミュニティでフィルタ
├── GRAPH_REPORT.md  ゴッドノード、意外なつながり、推奨される質問
├── graph.json       永続化されたグラフ - 数週間後でも再読み込みなしでクエリ可能
└── cache/           SHA256 キャッシュ - 再実行時は変更されたファイルのみ処理
```

`.graphify/` はローカルの runtime state です。デフォルトで gitignore され、worked examples やエクスポート済み artifact として意図的に公開する場合を除き、コミットしないでください。

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

## 仕組み

graphify は決定論的な構造抽出とモデル駆動の意味抽出を組み合わせ、必要に応じてその間にローカル前処理を挟みます。コードは LLM を使わない AST パスでクラス、関数、インポート、コールグラフ、docstring、根拠コメントを抽出します。ドキュメント、論文、Office 文書、画像はテキストまたはマルチモーダル入力に正規化したうえで、プラットフォーム側モデルのサブエージェントが概念、関係、設計意図を抽出します。このキャッチアップブランチでは音声/動画もローカルで検出でき、TypeScript ランタイムから `yt-dlp` で音声を取得し、`ffmpeg` で正規化し、`sherpa-onnx-node` で文字起こしします。その transcript も他のドキュメントと同じ意味抽出パスに流し込みます。結果は Graphology グラフにマージされ、Louvain コミュニティ検出でクラスタリングされ、インタラクティブ HTML、クエリ可能な JSON、平易な監査レポートとしてエクスポートされます。

**クラスタリングはグラフトポロジベースで、埋め込みは使いません。** Louvain はエッジ密度によってコミュニティを見つけます。プラットフォームモデルが抽出する意味的類似性エッジ（`semantically_similar_to`、`INFERRED`）は既にグラフに含まれているため、コミュニティ検出に直接影響します。グラフ構造そのものが類似性シグナルであり、別途の embedding ステップやベクターデータベースは不要です。

すべての関係は `EXTRACTED`（ソースから直接見つかった）、`INFERRED`（合理的な推論、信頼度スコア付き）、`AMBIGUOUS`（レビュー対象としてフラグ付け）のいずれかでタグ付けされます。何が見つかったもので何が推測されたものか、常に分かります。

## インストール

**必要なもの:** Node.js 20+ と、次のいずれかのクライアント: [Claude Code](https://claude.ai/code), [Codex](https://openai.com/codex), [Gemini CLI](https://github.com/google-gemini/gemini-cli), [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli), [Aider](https://aider.chat), [OpenCode](https://opencode.ai), [OpenClaw](https://openclaw.ai), [Factory Droid](https://factory.ai), [Trae](https://trae.com), [Cursor](https://cursor.com)

```bash
npm install -g graphifyy
graphify install
```

> npm パッケージは `graphify` の名前が再取得されるまでの間、一時的に `graphifyy` となっています。CLI とスキルコマンドは依然として `graphify` です。

### プラットフォームサポート

| プラットフォーム | インストールコマンド |
|----------|----------------|
| Claude Code (Linux/Mac) | `graphify install` |
| Claude Code (Windows) | `graphify install`（自動検出）または `graphify install --platform windows` |
| Codex | `graphify install --platform codex` |
| Gemini CLI | `graphify install --platform gemini` |
| GitHub Copilot CLI | `graphify install --platform copilot` |
| Aider | `graphify install --platform aider` |
| OpenCode | `graphify install --platform opencode` |
| OpenClaw | `graphify install --platform claw` |
| Factory Droid | `graphify install --platform droid` |
| Trae | `graphify install --platform trae` |
| Trae CN | `graphify install --platform trae-cn` |

Codex ユーザーは並列抽出のために `~/.codex/config.toml` の `[features]` の下に `multi_agent = true` も必要です。Gemini CLI は `/graphify` を `~/.gemini/commands/graphify.toml` のカスタムコマンドとして登録し、プロジェクトインストール時には `.gemini/settings.json` に `graphify serve` 用の MCP 設定も書き込みます。GitHub Copilot CLI はグローバルな `~/.copilot/skills/graphify/SKILL.md` を使います。Aider は `~/.aider/graphify/SKILL.md` を使いますが、このプラットフォームでは意味抽出はまだ逐次実行です。Factory Droid は並列サブエージェントディスパッチに `Task` ツールを使用します。OpenClaw は逐次抽出を使用します（並列エージェントサポートはこのプラットフォームではまだ初期段階です）。Trae は `Agent` ツールを使いますが、Claude/Codex 型の PreToolUse フックは持たないため `AGENTS.md` が常時有効の仕組みです。

次に、AI コーディングアシスタントを開いて入力します：

```bash
$graphify .                        # Codex
/graphify .                        # Claude Code / Gemini CLI / Copilot CLI / Aider / OpenCode / OpenClaw / Droid / Trae
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
| Aider | `graphify aider install` |
| Cursor | `graphify cursor install` |
| OpenCode | `graphify opencode install` |
| OpenClaw | `graphify claw install` |
| Factory Droid | `graphify droid install` |
| Trae | `graphify trae install` |
| Trae CN | `graphify trae-cn install` |

**Claude Code** は 2 つのことを行います：Claude にアーキテクチャの質問に答える前に `.graphify/GRAPH_REPORT.md` を読むように指示する `CLAUDE.md` セクションを書き込み、すべての Glob と Grep 呼び出しの前に発火する **PreToolUse フック**（`settings.json`）をインストールします。ナレッジグラフが存在する場合、Claude は次のメッセージを見ます：_"graphify: Knowledge graph exists. Read GRAPH_REPORT.md for god nodes and community structure before searching raw files."_ ――これにより Claude はすべてのファイルを grep するのではなく、グラフを介してナビゲートします。

**Codex** は `AGENTS.md` にルールを書き込み、`.codex/hooks.json` に PreToolUse フックも追加します。  
**Gemini CLI** は `GEMINI.md` を書き込み、`.gemini/settings.json` でプロジェクトスコープの `graphify` MCP サーバーを登録します。  
**GitHub Copilot CLI** はグローバル `~/.copilot/skills/graphify/SKILL.md` を使います。  
**Aider** はプロジェクトルートの `AGENTS.md` とグローバル `~/.aider/graphify/SKILL.md` を使いますが、意味抽出はまだ逐次です。  
**Cursor** は `.cursor/rules/graphify.mdc` を `alwaysApply: true` で書き込みます。  
**OpenCode** は `AGENTS.md` に加え、`.opencode/plugins/graphify.js` と `opencode.json` でプロジェクトローカルプラグインを登録します。  
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
curl -fsSL https://raw.githubusercontent.com/rhanka/graphify/v3-typescript/src/skills/skill.md \
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
graphify aider install             # AGENTS.md（Aider）
graphify aider uninstall
graphify cursor install            # .cursor/rules/graphify.mdc（Cursor）
graphify cursor uninstall
graphify opencode install          # AGENTS.md（OpenCode）
graphify claw install              # AGENTS.md（OpenClaw）
graphify droid install             # AGENTS.md（Factory Droid）
graphify trae install              # AGENTS.md（Trae）
graphify trae uninstall
graphify trae-cn install           # AGENTS.md（Trae CN）
graphify trae-cn uninstall

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
```

あらゆるファイルタイプの組み合わせで動作します：

| タイプ | 拡張子 | 抽出方法 |
|------|-----------|------------|
| コード | `.py .ts .js .jsx .tsx .go .rs .java .c .cpp .rb .cs .kt .scala .php .swift .lua .zig .ps1 .ex .exs .m .mm .jl` | tree-sitter による AST + コールグラフ + docstring / コメントの根拠 |
| ドキュメント | `.md .txt .rst` | 現在のプラットフォームモデルによる概念 + 関係性 + 設計根拠 |
| Office | `.docx .xlsx` | Markdown に変換した後、現在のプラットフォームモデルで抽出 |
| 論文 | `.pdf` | 引用マイニング + 概念抽出 |
| 画像 | `.png .jpg .webp .gif` | プラットフォームのマルチモーダルモデル - スクリーンショット、図、任意の言語 |
| 音声 / 動画 | `.mp4 .mov .webm .mkv .avi .m4v .mp3 .wav .m4a .ogg` | ローカルで検出し、必要に応じて `yt-dlp` で取得、`ffmpeg` で正規化、`sherpa-onnx-node` で文字起こししたうえで、ドキュメントと同じ意味抽出パスに流し込む |

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

graphify はドキュメント、論文、画像の意味的抽出のために、ファイル内容を AI コーディングアシスタントの基盤モデル API に送信します。Anthropic（Claude Code）、OpenAI（Codex）、Google（Gemini CLI）など、利用中プラットフォームのプロバイダーが対象です。コードファイルは tree-sitter AST を介してローカルで処理されるため、コードに関してはファイル内容がマシンから出ることはありません。音声/動画の文字起こしを使う場合、その工程はローカルの `yt-dlp` + `ffmpeg` + `sherpa-onnx-node` ツールチェーンで実行されます。テレメトリ、利用追跡、分析は一切ありません。ネットワーク呼び出しは、あなたが明示的に ingestion を指示した URL 取得と、抽出中のプラットフォームのモデル API 呼び出しのみです。

## 技術スタック

Graphology + Louvain（`graphology-communities-louvain`） + tree-sitter + vis-network に加え、`pdf-parse`、`mammoth`、`exceljs`、`turndown`、そしてこのキャッチアップブランチで upstream に合わせて導入した `yt-dlp` + `ffmpeg` + `sherpa-onnx-node` の文字起こし経路を使います。意味的抽出は利用中プラットフォームのモデル（Claude Code、Codex、Gemini CLI など）を介して行われます。デフォルトの HTML 出力は完全な静的ファイルです。

## 謝辞

このリポジトリは [Safi Shamsi](https://github.com/safishamsi/graphify) による元の Graphify プロジェクトの TypeScript ポートです。現行コードベースは assistant-skill ワークフローとナレッジグラフモデルを維持しつつ、保守されるランタイムをリポジトリルートの TypeScript 実装へ移しています。

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
