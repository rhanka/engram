# LLM Wiki Benchmark - April 2026

Date: 2026-04-21

This benchmark surveys public open-source projects and packages around LLM wiki,
repo-to-wiki, codebase wiki, knowledge-graph documentation, agentic documentation,
DeepWiki-like systems, context engineering repo maps, and semantic codebase maps.
It is scoped to features that could inform Graphify without copying proprietary
examples or customer-specific workflows.

## Methodology

### Inclusion rule

A project is retained only when a primary source shows at least one of the
following in April 2026:

- A Git commit on the default branch or release branch.
- A GitHub release or tag.
- A package publish on npm, PyPI, crates.io, or an equivalent package registry.

GitHub `updated_at`, stars/watch activity, issue activity, and bare `pushed_at`
timestamps are not enough. When a value is unavailable from a primary source, the
table uses `non publié`.

### Sources used

- GitHub repository metadata, commit, release, and tag API endpoints.
- npm registry metadata and npm downloads API.
- PyPI JSON package metadata.
- crates.io API with package metadata.
- Raw repository README and source files.
- Local shallow clones in `/tmp` for representative code inspection:
  - `AsyncFuncAI/deepwiki-open`
  - `AIDotNet/OpenDeepWiki`
  - `yamadashy/repomix`
  - `swarmclawai/swarmvault`

### Search coverage

Search terms included: `LLM wiki`, `repo to wiki`, `codebase wiki`,
`knowledge graph docs`, `agentic documentation`, `deepwiki-like`,
`context engineering repo wiki`, `semantic codebase map`, `gitdiagram`,
`repomix`, `gitingest`, `DeepWiki`, `MCP wiki`, and related GitHub topics.

### Evidence labels

- `Documented`: feature is stated in README, docs, package metadata, or release
  notes.
- `Observed in code`: source files were inspected and the feature is visible in
  implementation.
- `Inferred`: reasoned from public structure or naming; treat as weaker evidence.

## Executive Summary

Graphify already has a deterministic code/doc graph, community wiki output,
`summary`, `review-delta`, `review-analysis`, MCP-oriented workflows, and an
agent-readable `.graphify/wiki/` surface. The strongest opportunities from this
benchmark are therefore not full web-app clones. They are small, agent-facing
upgrades that make Graphify wiki artifacts easier to retrieve, cite, review,
budget, and keep fresh.

Top feature bets for Graphify:

- Wiki retrieval contract v2: richer `wiki/index.md`, stable article IDs,
  per-topic landing pages, source citations, related-reading paths, and
  machine-readable article manifests.
- Agent/MCP wiki tools: read wiki index, read article, search article metadata,
  explain path, lint stale wiki, and return token-bounded context packs.
- Reviewable rebuild loop: approval bundles, wiki diffs, rejection feedback,
  and manual-edit protection before regenerating wiki pages.
- Token-aware navigation: token counts per community/article/path, split output
  by budget, and compact context packs for coding agents.
- Provenance and confidence: source traceability, stale/lifecycle flags, and
  explicit distinction between observed graph facts and generated narrative.
- Diagram validation/repair: optional Mermaid validation and repair for wiki
  architecture diagrams.

## Retained Candidates

Only candidates with primary-source April 2026 activity are retained.

| Project | April 2026 proof | Popularity snapshot | License | Runtime | Inputs | Outputs | Index/search | Graph/wiki | Agent UX | CI/release | Graphify relevance |
|---|---:|---:|---|---|---|---|---|---|---|---|---|
| [deepwiki-open](https://github.com/AsyncFuncAI/deepwiki-open) | Commit `05591ee`, 2026-04-10 | 15,784 stars, 1,768 forks, downloads: non publié | MIT | Python, TypeScript, Next.js | GitHub/GitLab/Bitbucket repos, local clone, private token | Wiki pages, Mermaid, Markdown/JSON export, RAG answers | FAISS RAG and embeddings | Wiki generation, diagrams, DeepResearch | Web chat, Ask, DeepResearch | GitHub repo, Docker docs | Strong reference for repo wiki UX, RAG, Mermaid, exports |
| [OpenDeepWiki](https://github.com/AIDotNet/OpenDeepWiki) | Commit `e104940`, 2026-04-11 | 3,104 stars, 404 forks, downloads: non publié | MIT | C#/.NET 9, TypeScript | Git repos, repo DB, code docs | Wiki/docs, README updates, Mermaid | Semantic Kernel and repo analysis | Knowledge graph documented, diagrams | MCP, repo-scoped MCP server, Feishu bot | DB migrations, workers | Strong reference for incremental update and MCP governance |
| [deepwiki-rs / Litho](https://github.com/sopaco/deepwiki-rs) | Release `1.5.0`, 2026-04-05; crates `1.5.0`, 2026-04-06 | 926 stars, 117 forks, crates downloads: 5,869 | MIT | Rust | Repos, PDFs, Markdown, SQL, DB schemas, git history | C4 docs, Mermaid, ERD, Litho Book | Fuzzy search documented | C4 architecture wiki, cross refs | AI doc interpretation | GitHub release, crates publish | Useful for C4/CODE architecture article taxonomy |
| [RepoWiki](https://github.com/he-yufeng/RepoWiki) | Commit `a6f8722`, 2026-04-16; PyPI `0.1.0`, 2026-04-16 | 50 stars, 7 forks, PyPI downloads: non publié | MIT | Python | Local/GitHub repos | Markdown, JSON, HTML, Mermaid | TF-IDF RAG, SQLite cache | Dependency graph, PageRank, guided reading path | CLI, Web UI, planned chat | GitHub Actions publish fix, PyPI publish | Small but relevant PageRank/guided-reading pattern |
| [llmwiki](https://github.com/lucasastorian/llmwiki) | Commit `8af419e`, 2026-04-07 | 587 stars, 90 forks, downloads: non publié | Apache-2.0 | TypeScript, Python/FastAPI | PDFs, articles, notes, office docs | Raw sources, wiki, tools, assets | PGroonga/Postgres search | Personal knowledge wiki | Claude MCP tools | App/service stack | Useful layered raw/wiki/tools model and contradiction checks |
| [karpathy-llm-wiki](https://github.com/Astro-Han/karpathy-llm-wiki) | Commit `9e8c4f4`, 2026-04-13 | 559 stars, 70 forks, downloads: non publié | MIT | Agent skill docs | Raw sources, markdown wiki | `raw/`, `wiki/`, `wiki/index.md`, `wiki/log.md` | Agent query workflow | Skill-managed LLM wiki | Claude/Cursor/Codex/OpenCode skill | Docs repo | Useful skill/AGENTS workflow contract |
| [swarmvault](https://github.com/swarmclawai/swarmvault) | Commit `e261afe`, 2026-04-17; npm `1.1.0`, 2026-04-17 | 250 stars, 27 forks; npm last-month: CLI 9,250, engine 9,645, viewer 8,358 | MIT | TypeScript | Docs, PDFs, audio/video, web, arXiv/DOI, structured data | Wiki, graph exports, Obsidian, Neo4j, HTML/SVG/GraphML/Cypher/JSON | Hybrid SQLite FTS and embeddings | Typed KG, paths, contradiction edges | MCP, watch, approval bundles, agent integrations | CI, live smoke, npm publish | Strongest reference for reviewable graph/wiki lifecycle |
| [obsidian-llm-wiki-local](https://github.com/kytmanov/obsidian-llm-wiki-local) | Commit `bf6fc2a`, 2026-04-19; PyPI `0.5.1`, 2026-04-19 | 263 stars, 46 forks, PyPI downloads: non publié | MIT | Python | Markdown/Obsidian vault | Obsidian wiki pages, backlinks, diffs | No vector DB; concept compilation | Wikilinks and alias map | CLI, watcher, review UI | Release and PyPI publish | Strong reference for approval, lint, manual-edit protection |
| [llm-wiki](https://github.com/Pratiyush/llm-wiki) | Commit `4c8e7b6`, 2026-04-21; PyPI `llmwiki` `0.7.8`, 2026-04-21 | 137 stars, 17 forks, PyPI downloads: non publié | MIT | Python | Agent sessions, docs, notes | Static site, `llms.txt`, JSON-LD, pages | Search, command palette | Entities, concepts, syntheses, questions graph | MCP, skills, hooks, watch | PyPI publish | Useful confidence/lifecycle and AI export concepts |
| [repomix](https://github.com/yamadashy/repomix) | Commit `6dc0b0d`, 2026-04-19 | 23,728 stars, 1,161 forks; npm last-month: 230,376 | MIT | TypeScript | Local/remote repos, branches, commits, diffs | XML/Markdown/JSON/plain context packs, skill files | Grep/read MCP output, token metrics | No persistent wiki graph | MCP, Claude Agent Skill generator | Extensive test/release scripts | Best reference for token-aware context packs and MCP ergonomics |
| [GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) | Commit `b077293`, 2026-04-21 | 15,466 stars, 1,188 forks, downloads: non publié | MIT | TypeScript, Python/FastAPI, Bun | GitHub repos and README/tree | Interactive architecture diagram, Mermaid, PNG | File-tree validation, cache | LLM architecture graph | Web UX, source-click navigation | Dependency bump workflow | Useful diagram validation and click-to-source UX |
| [codesight](https://github.com/Houseofmvps/codesight) | Commit `b5992b4`, 2026-04-21; npm `1.13.1`, 2026-04-18 | 947 stars, 90 forks; npm last-month: 9,622 | MIT in package/README; GitHub license: non publié | TypeScript | Codebases, docs mode | AI context map, `.codesight/wiki/` | AST/regex extraction, MCP search | Wiki overview/auth/payments/database/users/UI/log | 13 MCP tools, watch, hook | npm publish | Very close reference for codebase wiki retrieval contract |
| [cocoindex-code](https://github.com/cocoindex-io/cocoindex-code) | Commit `90d8ff9`, 2026-04-15; PyPI `0.2.27`, 2026-04-15 | 1,410 stars, 101 forks, PyPI downloads: non publié | Apache-2.0 | Python, Rust-backed indexer | Local codebase | Semantic code chunks and search results | AST semantic index, embeddings | No wiki; code search layer | CLI, Skill, MCP | Docker CI/cache, PyPI publish | Useful optional semantic search adapter pattern |

## Detailed Observations

### AsyncFuncAI/deepwiki-open

- URL: https://github.com/AsyncFuncAI/deepwiki-open
- April proof: commit `05591ee` on 2026-04-10, `feat: add LaTeX math formula rendering support (#499)`.
- Popularity: 15,784 stars, 1,768 forks, downloads: `non publié`.
- License: MIT.
- Language/runtime: Python backend, TypeScript/Next.js frontend.
- Inputs: GitHub, GitLab, Bitbucket, private repositories with tokens, local cloned source.
- Outputs: generated wiki pages, Mermaid diagrams, chat answers, Markdown/JSON export.
- Index/search: FAISS retriever and embeddings.
- Graph/wiki: wiki pages and diagrams; graph is mostly generated narrative/diagram, not a deterministic graph database.
- Agent UX: web Ask panel, DeepResearch flow, provider configuration, token/private repo support.
- CI/release: Docker and deployment docs inspected; release cadence not used as inclusion proof.
- Documented: private repository support, multi-provider LLM/embedding support, Mermaid diagrams, Ask/RAG, DeepResearch, export to Markdown and JSON, wiki cache.
- Observed in code: `api/data_pipeline.py` performs shallow clones, token-safe URL handling, file filtering, and repository cleanup; `api/rag.py` builds and filters embeddings for FAISS retrieval; `api/prompts.py` contains RAG and DeepResearch prompt stages; frontend components implement Mermaid rendering and Ask UI.
- Inferred: the architecture optimizes for interactive wiki generation more than deterministic graph auditability.
- Limits: heavy app stack; generated wiki quality depends on LLM providers; provenance is weaker than Graphify source-file/community audit; README indicates active development focus is moving toward a related product.
- Graphify relevance: adopt UI-independent ideas: export manifest, richer wiki article prompts, Ask/RAG optional adapter, and Mermaid repair/validation.

### AIDotNet/OpenDeepWiki

- URL: https://github.com/AIDotNet/OpenDeepWiki
- April proof: commit `e104940` on 2026-04-11, `Enhance OpenDeepWiki with AI capabilities and configuration updates`.
- Popularity: 3,104 stars, 404 forks, downloads: `non publié`.
- License: MIT.
- Language/runtime: C#/.NET 9, Semantic Kernel, TypeScript/Next.js.
- Inputs: Git repositories and persisted repository records.
- Outputs: generated docs/wiki, README updates, Mermaid code-structure diagrams.
- Index/search: repository analyzer services and Semantic Kernel usage documented/observed.
- Graph/wiki: knowledge graph construction is documented; Mermaid prompts and generation code are visible.
- Agent UX: MCP support, repository-scoped MCP server, Feishu bot integration.
- CI/release: migrations, worker services, and repository processing jobs observed.
- Documented: code analysis, documentation generation, knowledge graph construction, Mermaid diagrams, smart directory filtering, incremental updates, MCP, Feishu bot, README update.
- Observed in code: `IncrementalUpdateService`, `RepositoryProcessingWorker`, `RepositoryAnalyzer`, MCP service folders, admin MCP provider service, EF migrations for incremental tasks and MCP tables, Mermaid prompts in wiki generation.
- Inferred: the system treats repository analysis as an ongoing server-side workflow with persisted tasks and governance.
- Limits: server/database-heavy; broad product scope; graph export semantics are less clear than Graphify's `graph.json`.
- Graphify relevance: incremental update queue, repository-scoped MCP permissions, and admin/config boundaries are useful patterns for a future Graphify daemon, but should remain out of the current docs-only branch.

### sopaco/deepwiki-rs / Litho

- URL: https://github.com/sopaco/deepwiki-rs
- April proof: GitHub release `1.5.0` on 2026-04-05; crates.io version `1.5.0` on 2026-04-06; latest April commit `4d0cb5c` on 2026-04-05.
- Popularity: 926 stars, 117 forks, crates downloads: 5,869.
- License: MIT.
- Language/runtime: Rust.
- Inputs: repositories, external PDFs, Markdown, SQL, database schemas, git history.
- Outputs: C4 model docs, Mermaid diagrams, ERDs, Litho Book reader output.
- Index/search: fuzzy search documented.
- Graph/wiki: C4 Context, Container, Component, Code hierarchy; cross-references documented.
- Agent UX: AI document interpretation documented.
- CI/release: GitHub release and crates publish verified.
- Documented: high-performance AI-driven wiki, comments/structure/relationship extraction, multi-language support, templates, external knowledge, database docs, git history, cross-references, CI/CD integration, Mermaid Fixer.
- Observed in code: not cloned in this pass; code-level claims were not verified beyond public release/package metadata and repository docs.
- Inferred: C4 hierarchy can map well onto Graphify communities, modules, god nodes, and files.
- Limits: architecture-doc focus may not preserve low-level graph audit trails; runtime differs from Graphify's Node tooling.
- Graphify relevance: borrow the C4 article taxonomy and Mermaid repair concept for wiki v2.

### he-yufeng/RepoWiki

- URL: https://github.com/he-yufeng/RepoWiki
- April proof: commit `a6f8722` on 2026-04-16; PyPI `repowiki` version `0.1.0` on 2026-04-16.
- Popularity: 50 stars, 7 forks, PyPI downloads: `non publié`.
- License: MIT.
- Language/runtime: Python.
- Inputs: local repositories and GitHub repositories.
- Outputs: Markdown, JSON, HTML, Mermaid.
- Index/search: TF-IDF RAG and SQLite cache documented.
- Graph/wiki: dependency graph and PageRank documented.
- Agent UX: CLI and web UI; terminal chat documented as planned/coming soon.
- CI/release: commit fixed publish workflow; PyPI package published.
- Documented: dependency graph, PageRank, guided reading path, 4-pass LLM analysis, SQLite content-hash cache, 30+ languages, LiteLLM providers.
- Observed in code: not cloned in this pass; package publish and docs were verified.
- Inferred: PageRank/guided path is a lightweight way to convert graph centrality into reading order.
- Limits: young project; chat capability not complete per README; small adoption.
- Graphify relevance: guided reading paths from community centrality could improve `wiki/index.md` and `summary`.

### lucasastorian/llmwiki

- URL: https://github.com/lucasastorian/llmwiki
- April proof: commit `8af419e` on 2026-04-07.
- Popularity: 587 stars, 90 forks, downloads: `non publié`.
- License: Apache-2.0.
- Language/runtime: TypeScript, Python/FastAPI, Supabase/Postgres, S3.
- Inputs: PDFs, articles, notes, office documents, SVG/CSV assets.
- Outputs: raw sources, wiki pages, tools layer, source assets.
- Index/search: PGroonga/Postgres search documented.
- Graph/wiki: layered LLM wiki for personal knowledge.
- Agent UX: Claude MCP tools for guide, search, read, write, delete.
- CI/release: app/service stack documented; no package release used for inclusion.
- Documented: raw/wiki/tools layers, contradictions, page-range PDFs, inline images, isolated converter, Mistral OCR, MCP tools.
- Observed in code: not cloned in this pass; docs and commit metadata were inspected.
- Inferred: separating raw sources from generated wiki and agent tools reduces accidental source loss.
- Limits: personal knowledge wiki, not codebase-specific; service dependencies are heavy.
- Graphify relevance: raw/wiki/tools layering and contradiction surfacing could inform wiki provenance and lint.

### Astro-Han/karpathy-llm-wiki

- URL: https://github.com/Astro-Han/karpathy-llm-wiki
- April proof: commit `9e8c4f4` on 2026-04-13.
- Popularity: 559 stars, 70 forks, downloads: `non publié`.
- License: MIT.
- Language/runtime: agent skill documentation; no primary runtime published by GitHub metadata.
- Inputs: raw sources curated by agents.
- Outputs: `raw/`, `wiki/`, `wiki/index.md`, `wiki/log.md`.
- Index/search: agent query workflow documented.
- Graph/wiki: wiki folder convention, citations, log.
- Agent UX: Claude Code, Cursor, Codex, OpenCode skill workflow.
- CI/release: docs repo; no package release used for inclusion.
- Documented: Ingest, Query, Lint operations; citations; install via `npx add-skill`; agent-compatible wiki conventions.
- Observed in code: not cloned; this is primarily a skill/workflow repository.
- Inferred: the value is a contract between agent and files, not an engine.
- Limits: depends on host-agent discipline; no deterministic analyzer.
- Graphify relevance: convert Graphify wiki conventions into a formal AGENTS/skill contract for agent traversal.

### swarmclawai/swarmvault

- URL: https://github.com/swarmclawai/swarmvault
- April proof: commit `e261afe` on 2026-04-17; npm packages `@swarmvaultai/cli`, `@swarmvaultai/engine`, and `@swarmvaultai/viewer` version `1.1.0` on 2026-04-17.
- Popularity: 250 stars, 27 forks; npm last-month downloads: CLI 9,250, engine 9,645, viewer 8,358.
- License: MIT.
- Language/runtime: TypeScript.
- Inputs: documents, PDFs, audio/video, web, arXiv/DOI, structured data, local files.
- Outputs: wiki, typed knowledge graph, HTML/SVG/GraphML/Cypher/JSON/Obsidian/Neo4j exports.
- Index/search: hybrid SQLite FTS and embeddings; rerank documented/observed.
- Graph/wiki: typed KG, graph paths, contradiction edges, schema hashes.
- Agent UX: MCP, watch mode, approval bundles, many agent integrations.
- CI/release: GitHub CI, live smoke workflow, npm publish scripts.
- Documented: raw/wiki/schema layers, interactive graph viewer, review automation, local Whisper, graph diff, `compile --approve`, candidates, lint/conflicts, Obsidian graph export, token budgets.
- Observed in code: `packages/engine/src/mcp.ts` exposes graph path/explain, approvals, watch status, and resources; `vault.ts` handles approval bundles, contradiction edges, hybrid search/rerank, token-budget trim, and schema hashes; `watch.ts` handles file watching; workflow files include CI and live smoke.
- Inferred: SwarmVault's "approval bundle" is the cleanest observed lifecycle pattern for regenerated knowledge artifacts.
- Limits: broad multimodal product; more stateful than Graphify; some features go beyond repo analysis.
- Graphify relevance: strongest candidate for reviewable wiki updates, approval/rejection loop, graph path MCP tools, and export formats.

### kytmanov/obsidian-llm-wiki-local

- URL: https://github.com/kytmanov/obsidian-llm-wiki-local
- April proof: commit `bf6fc2a` on 2026-04-19; PyPI `obsidian-llm-wiki` version `0.5.1` on 2026-04-19.
- Popularity: 263 stars, 46 forks, PyPI downloads: `non publié`.
- License: MIT.
- Language/runtime: Python.
- Inputs: Obsidian Markdown vaults.
- Outputs: Obsidian wiki pages, wikilinks, review diffs.
- Index/search: no vector DB or embeddings; concept-driven compilation documented.
- Graph/wiki: wikilinks and alias map.
- Agent UX: CLI run/compile/lint/approve, watcher, review interface.
- CI/release: PyPI publish and release commit verified.
- Documented: local-first workflow, Ollama default, OpenAI-compatible endpoints, rejection feedback loop, draft annotations, selective recompile, wikilink repair, manual edit protection, git safety undo, 418 offline tests.
- Observed in code: not cloned; docs and package metadata were inspected.
- Inferred: the manual-edit protection model can prevent generated wiki from erasing curated notes.
- Limits: notes/wiki domain, not repo graph domain; no vector/graph database.
- Graphify relevance: review UI and manual-edit protection are directly applicable to generated wiki article regeneration.

### Pratiyush/llm-wiki

- URL: https://github.com/Pratiyush/llm-wiki
- April proof: commit `4c8e7b6` on 2026-04-21; PyPI `llmwiki` version `0.7.8` on 2026-04-21.
- Popularity: 137 stars, 17 forks, PyPI downloads: `non publié`.
- License: MIT.
- Language/runtime: Python.
- Inputs: agent sessions, docs, notes.
- Outputs: static site, `llms.txt`, `llms-full.txt`, JSON-LD graph, page `.txt` and `.json`.
- Index/search: search and command palette documented.
- Graph/wiki: sources, entities, concepts, syntheses, comparisons, questions.
- Agent UX: MCP, skill mirror, hooks, watch, scheduled automation.
- CI/release: PyPI package publish verified; repository metadata says `pyproject.toml` version differs from latest PyPI version, so treat package identity carefully.
- Documented: 4-factor confidence, 5-state lifecycle, 15 lint rules, contradiction checks, claim verification, stale detection, Auto Dream/MEMORY consolidation, Obsidian link.
- Observed in code: not cloned; docs and PyPI/GitHub metadata were inspected.
- Inferred: confidence and lifecycle states could become a Graphify article metadata layer.
- Limits: agent-session knowledge base, not source-code graph; package/repo version mismatch needs follow-up before integration research.
- Graphify relevance: `llms.txt`, JSON-LD, confidence/lifecycle, stale detection, and lint vocabulary are relevant to wiki v2 metadata.

### yamadashy/repomix

- URL: https://github.com/yamadashy/repomix
- April proof: commit `6dc0b0d` on 2026-04-19.
- Popularity: 23,728 stars, 1,161 forks; npm last-month downloads: 230,376.
- License: MIT.
- Language/runtime: TypeScript.
- Inputs: local repositories, remote repositories, branches, commits, git diffs/logs.
- Outputs: XML, Markdown, JSON, plain context packs, split files, Claude Agent Skill files.
- Index/search: MCP read/grep tools over generated output; token metrics.
- Graph/wiki: no persistent wiki graph; it is a context packer.
- Agent UX: MCP server and generated Agent Skill.
- CI/release: extensive scripts and tests observed; latest npm publish was March 2026, so inclusion proof is the April commit.
- Documented: security scanning with Secretlint, tree-sitter compression, remote repository packing, token counts, output splitting, MCP, skill generation.
- Observed in code: MCP server tools `pack_codebase`, `pack_remote_repository`, `read_repomix_output`, `grep_repomix_output`, and `generate_skill`; tree-sitter compression, security scanning, and metrics modules.
- Inferred: token accounting and split-output ergonomics explain much of agent adoption.
- Limits: not a wiki, no graph provenance, no persistent community model.
- Graphify relevance: high-priority reference for token-aware context packs, MCP read/grep ergonomics, and generated skill packaging.

### ahmedkhaleel2004/GitDiagram

- URL: https://github.com/ahmedkhaleel2004/gitdiagram
- April proof: commit `b077293` on 2026-04-21.
- Popularity: 15,466 stars, 1,188 forks, downloads: `non publié`.
- License: MIT.
- Language/runtime: TypeScript, Python/FastAPI, Bun.
- Inputs: GitHub repositories, README, recursive file tree.
- Outputs: interactive architecture diagram, Mermaid, PNG.
- Index/search: file tree and source path validation documented.
- Graph/wiki: LLM-generated system graph/diagram, not a persistent wiki.
- Agent UX: web flow, URL substitution, clickable components to files/directories.
- CI/release: dependency update workflow verified by April commit.
- Documented: replace `hub` with `diagram`, OpenAI/OpenRouter, Cloudflare R2/Upstash Redis, private repo PAT, two-pass LLM generation, Mermaid compile/validation/retry.
- Observed in code: not cloned; README and commit metadata were inspected.
- Inferred: validating generated diagram nodes against the actual repository tree reduces hallucinated architecture.
- Limits: visualization-only; graph is generated by LLM rather than extracted deterministically.
- Graphify relevance: Graphify can combine deterministic graph facts with validated Mermaid/PNG exports and click-to-source links.

### Houseofmvps/codesight

- URL: https://github.com/Houseofmvps/codesight
- April proof: commit `b5992b4` on 2026-04-21; npm `codesight` version `1.13.1` on 2026-04-18.
- Popularity: 947 stars, 90 forks; npm last-month downloads: 9,622.
- License: MIT in package/README; GitHub API license: `non publié`.
- Language/runtime: TypeScript.
- Inputs: codebases and a knowledge/docs mode for Markdown notes/ADRs/meetings/retros/specs/research.
- Outputs: AI context map, `.codesight/wiki/` pages, wiki index/article/lint tools.
- Index/search: TypeScript AST precision plus regex parsers for many languages; MCP tools.
- Graph/wiki: codebase wiki pages for overview, auth, payments, database, users, UI, and log.
- Agent UX: 13 MCP tools, watch mode, hook mode, targeted wiki retrieval.
- CI/release: npm package publish verified.
- Documented: zero-dependency Node CLI, 30+ framework detectors, 13 ORM parsers, `--wiki`, `--mode knowledge`, benchmarks/token reduction claims.
- Observed in code: not cloned; README and package metadata were inspected.
- Inferred: targeted wiki retrieval is a close competitor to Graphify's `.graphify/wiki/`.
- Limits: less multimodal; README benchmark claims were not independently reproduced.
- Graphify relevance: closest reference for wiki retrieval contract, MCP wiki tools, and hook/watch ergonomics.

### cocoindex-io/cocoindex-code

- URL: https://github.com/cocoindex-io/cocoindex-code
- April proof: commit `90d8ff9` on 2026-04-15; PyPI `cocoindex-code` version `0.2.27` on 2026-04-15.
- Popularity: 1,410 stars, 101 forks, PyPI downloads: `non publié`.
- License: Apache-2.0.
- Language/runtime: Python with Rust-backed CocoIndex engine.
- Inputs: local codebases.
- Outputs: semantic code chunks and search results.
- Index/search: AST-based semantic code search with embeddings; local or LiteLLM/cloud embeddings.
- Graph/wiki: no wiki or graph output in the inspected docs.
- Agent UX: CLI, Skill, MCP.
- CI/release: Docker BuildKit cache workflow and PyPI publish verified.
- Documented: `ccc init`, `index`, `search`, `status`, `mcp`, `doctor`, `reset`; skill auto-init/update; MCP search returns file path, language, line, and similarity.
- Observed in code: not cloned; README and package metadata were inspected.
- Inferred: semantic search can complement Graphify's structural graph instead of replacing it.
- Limits: search layer only; embedding dependency path can be heavier than deterministic Graphify graphing.
- Graphify relevance: defer as optional semantic adapter after wiki/MCP/token work.

## Feature Matrix

Legend: `Y` = supported, `P` = partial or documented but not code-verified here,
`N` = not observed, `NP` = non publié.

| Feature | deepwiki-open | OpenDeepWiki | Litho | RepoWiki | llmwiki app | skill wiki | SwarmVault | OLW local | llm-wiki | Repomix | GitDiagram | Codesight | CocoIndex Code |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Local repo input | P | P | P | Y | N | N | P | N | N | Y | N | Y | Y |
| Remote repo input | Y | Y | P | Y | N | N | P | N | N | Y | Y | P | N |
| Private repo/token | Y | P | NP | NP | N | N | NP | N | N | P | Y | NP | N |
| Non-code docs input | P | P | Y | P | Y | Y | Y | Y | Y | P | N | P | N |
| Persistent wiki | Y | Y | Y | Y | Y | Y | Y | Y | Y | N | N | Y | N |
| Wiki index/articles | Y | Y | Y | Y | Y | Y | Y | Y | Y | N | N | Y | N |
| Mermaid/diagram output | Y | Y | Y | Y | N | N | P | N | N | N | Y | P | N |
| HTML/static output | P | P | P | Y | Y | N | Y | N | Y | N | Y | P | N |
| JSON/graph export | Y | P | P | Y | P | N | Y | P | Y | Y | P | P | N |
| Search/index | Y | P | Y | Y | Y | P | Y | P | Y | Y | P | Y | Y |
| Structural graph | P | P | P | P | P | N | Y | P | Y | N | P | P | N |
| Graph path/explain | N | P | P | P | N | N | Y | N | P | N | N | P | N |
| RAG/Q&A | Y | P | P | P | P | P | P | P | P | N | N | P | Y |
| MCP | N | Y | NP | N | Y | N | Y | N | Y | Y | N | Y | Y |
| Agent skill/hooks | N | P | NP | P | P | Y | Y | P | Y | Y | N | Y | Y |
| Incremental/watch | P | Y | P | P | N | P | Y | Y | Y | N | N | Y | Y |
| Review/approval/lint | N | P | P | N | P | Y | Y | Y | Y | N | N | P | N |
| Confidence/lifecycle | N | N | N | N | P | P | P | P | Y | N | N | N | N |
| Token budgeting | P | P | P | P | P | N | Y | N | P | Y | N | Y | Y |
| Source citations/provenance | P | P | P | P | Y | Y | Y | Y | Y | P | P | P | Y |
| CI/release proof | Commit | Commit | Release/package | Package | Commit | Commit | Commit/package | Package | Package | Commit | Commit | Package | Package |

## Recommended Shortlist for Graphify

### 1. Wiki retrieval contract v2

Graphify should make `.graphify/wiki/` a stable contract for coding agents:

- Stable `wiki/index.md` sections: overview, top communities, god nodes,
  changed files, recommended reading paths, and stale status.
- Per-article front matter or sidecar JSON: article ID, graph node/community IDs,
  source file paths, token count, last graph build hash, confidence/provenance
  labels, and related articles.
- Deterministic "next reads" derived from graph centrality and community
  adjacency, inspired by RepoWiki PageRank and Litho C4 hierarchy.

Primary references: Codesight, RepoWiki, Litho, karpathy-llm-wiki.

### 2. Agent/MCP wiki tools

Add or specify MCP/CLI surfaces that expose wiki artifacts without forcing agents
to read raw graph JSON:

- `wiki-index`: return compact index and stale/build metadata.
- `wiki-read`: return one article by ID/path/community.
- `wiki-search`: search article titles, source paths, and node aliases.
- `graph-path-explain`: return a token-bounded explanation for relationships.
- `wiki-lint`: report stale article, missing provenance, broken links, and
  unreferenced generated pages.

Primary references: SwarmVault, Repomix, Codesight, CocoIndex Code.

### 3. Reviewable rebuild loop

Generated wiki updates should be reviewable before overwrite:

- Generate a rebuild bundle with changed pages, source graph delta, and concise
  rationale.
- Preserve manual edits unless explicitly marked generated.
- Accept/reject/retry individual article changes.
- Store rejection notes for the next regeneration prompt or deterministic
  template pass.

Primary references: SwarmVault and obsidian-llm-wiki-local.

### 4. Token-aware context packs

Graphify can turn structural graph knowledge into agent-sized context:

- Token counts by article, community, file, and graph path.
- `--max-tokens` packing for `summary`, `review-delta`, and wiki reads.
- Split packs by community or concern.
- Security-conscious filtering before context generation.

Primary references: Repomix, Codesight, SwarmVault.

### 5. Provenance, confidence, and stale lifecycle

Graphify should explicitly separate deterministic graph facts from generated
narrative:

- Mark facts as `observed`, `documented`, or `inferred`.
- Track stale status at graph, article, and source-file levels.
- Include source file/path citations in generated wiki sections.
- Add lifecycle states for wiki pages: generated, reviewed, edited, stale,
  retired.

Primary references: llm-wiki, llmwiki app, obsidian-llm-wiki-local,
SwarmVault.

### 6. Diagram validation and repair

Graphify already has extracted graph structure that can constrain Mermaid output:

- Generate Mermaid diagrams from graph facts, not only from LLM narrative.
- Validate Mermaid syntax and node references.
- Retry/repair invalid diagrams.
- Link diagram nodes back to source files or community articles.

Primary references: GitDiagram, deepwiki-open, OpenDeepWiki, Litho.

### 7. Semantic search adapter, deferred

Embedding search is valuable, but it should remain optional until the wiki/MCP
contract is stronger:

- Keep Graphify deterministic by default.
- Add optional semantic chunk search that returns source paths and graph node IDs.
- Prefer local embeddings or pluggable provider configuration.

Primary references: CocoIndex Code, deepwiki-open, SwarmVault.

## Potential Graphify Integration Lots

These are docs/spec follow-up lots only. They are not product implementation
tasks for this branch.

- [ ] Lot 1: Write `SPEC_GRAPHIFY_WIKI_V2_CONTRACT.md` for index/article
  manifests, stable article IDs, stale metadata, and source citations.
- [ ] Lot 2: Write `SPEC_GRAPHIFY_AGENT_WIKI_MCP.md` for wiki-read,
  wiki-search, graph-path-explain, and wiki-lint tool contracts.
- [ ] Lot 3: Write `SPEC_GRAPHIFY_TOKEN_CONTEXT_PACKS.md` for token counting,
  max-token packing, split output, and security filtering.
- [ ] Lot 4: Write `SPEC_GRAPHIFY_REVIEWABLE_WIKI_REBUILD.md` for approval
  bundles, manual edit protection, and reject/retry loops.
- [ ] Lot 5: Write `SPEC_GRAPHIFY_PROVENANCE_LIFECYCLE.md` for observed vs
  documented vs inferred labels, stale states, and confidence metadata.
- [ ] Lot 6: Write `SPEC_GRAPHIFY_DIAGRAM_VALIDATION.md` for Mermaid generation,
  validation, repair, and click-to-source metadata.
- [ ] Lot 7: Write `SPEC_GRAPHIFY_SEMANTIC_SEARCH_ADAPTER.md` as a deferred,
  optional design that maps semantic hits back to deterministic graph IDs.
- [ ] Lot 8: Add a benchmark refresh checklist for future date-bound surveys so
  package/stars/activity claims are repeatable and auditable.

## Notable Exclusions

These projects are relevant to the search space but were excluded because they
did not meet the verified April 2026 activity rule or were too far from the
benchmark scope.

| Project | Popularity snapshot | Reason excluded |
|---|---:|---|
| [gitingest](https://github.com/coderamp-labs/gitingest) | 14,385 stars, 1,052 forks | Repo `pushed_at` was April 2026, but the verified default-branch commit was 2025-08-16, PyPI latest was 2025-07-31, and tags were 2025. |
| [open-repo-wiki](https://github.com/daeisbae/open-repo-wiki) | 290 stars, 30 forks | Repo `pushed_at` was April 2026, but no verified April 2026 default-branch commit/release/package was found. |
| [CognitionAI/deepwiki](https://github.com/CognitionAI/deepwiki) | 66 stars, 12 forks | Latest verified commit was 2025-05-22. |
| [deepwiki-mcp](https://github.com/regenrek/deepwiki-mcp) | 1,331 stars, 76 forks | Latest verified default-branch commit was 2025-07-22; npm latest was 2025-04-28. |
| [openDeepWiki](https://github.com/weibaohui/openDeepWiki) | 73 stars, 14 forks | Latest verified default-branch commit was 2026-03-26. |
| [github-deepwiki-button](https://github.com/yamadashy/github-deepwiki-button) | 89 stars, 11 forks | Latest verified default-branch commit was 2026-03-14. |
| [GitHub-CodeWiki-Jumper](https://github.com/qixing-jk/GitHub-CodeWiki-Jumper) | 28 stars, 2 forks | Latest verified default-branch commit was 2026-03-25. |
| [deepwiki-open-community](https://github.com/kuarcis/deepwiki-open-community) | 2 stars, 0 forks | Latest verified default-branch commit was 2025-10-01. |
| [docmancer](https://github.com/docmancer/docmancer) | 76 stars, forks: non publié | Has April activity, but it is primarily a documentation fetch/search helper rather than a repo-to-wiki/codebase-wiki/knowledge-graph-wiki system. |

## Limits and Follow-up Risks

- This is a snapshot as of 2026-04-21. Stars, forks, downloads, and default
  branches are mutable.
- The benchmark uses primary-source metadata, but it does not install or run the
  retained projects.
- PyPI does not publish download counts in its JSON package API, so PyPI
  download counts are recorded as `non publié`.
- README claims were treated as `Documented`, not independently benchmarked.
- Only four repositories were cloned and code-inspected deeply. Other retained
  projects were inspected through primary docs, package metadata, and commit
  metadata.
- Some projects use product language around "knowledge graph" for generated
  wiki structures. Graphify should preserve its stronger deterministic graph
  provenance instead of copying weaker graph semantics.
- Follow-up specs should re-check activity and package metadata before making
  roadmap or marketing claims from this benchmark.
