# Spec 1 — Live Session Ingestion Front, Extraction Pipeline, and Derived Git Worktree Graph Model (`SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION`)

- **Spec ID:** `SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION` (Spec 1 in [`spec/memory/PLAN_SPEC_ENGRAM_FRONT.md`](memory/PLAN_SPEC_ENGRAM_FRONT.md), §3 `:157-173`)
- **Stage:** `DESIGN` (`Gemini Carbon`)
- **Status:** `proposed`
- **Version:** `0.3.0` (`post-sentropic r2 & h2a review fold`)
- **Date:** `2026-11-15`
- **Repository of Record:** `engram` (`@sentropic/engram` `0.28.0`, branch `docs/memory-r15-sediment`, commit `f9dc84f7ed338cc855b26ce5b13cb6744d4ed0cf`, `package.json:2-3`) `[FACT: spec/memory/R15-SEDIMENT.md:4; spec/memory/PLAN_SPEC_ENGRAM_FRONT.md:4,159]`
- **Primary Owner:** `engram` (consumed by `h2a` CLI host plugins, `Track` analyst/control, and `sentropic` external HMI ingress exclusively via `@sentropic/cluster-mesh`, `R12`) `[FACT: spec/memory/PLAN_SPEC_ENGRAM_FRONT.md:159; spec/memory/ARCHITECTURE-RULES.md:5]`
- **Dependencies:**
  - [`spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md`](SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md) (`Spec 0`: `Sha256Digest` `:144`, `LineageId` `:147`, `OntologyTemplateEnvelopeRef` `:149-154`, `H2AMandateEnvelope` `:161-174`, `track.ontology.yaml` `:930-933`, `.h2a/overlays/*` `:977-982`)
  - [`spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md`](SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md) (`Spec 6A` `v0.2.0`: `POST /memory/v1/session-front/ingest` `:215-217,224`, guarded `POST /memory/v1/session-front/extractions` and `GET /memory/v1/control/proposals` addenda in §1.2 & §6.3 below, `POST /memory/v1/hmi/input` `:228`, `POST /memory/v1/control/verdicts` `:227,777`, `GET /memory/v1/health` `:230`, verified `H2AEnvelope<H2AMandate>` `:311-398`, `D17=degraded` durability `:399-416`, neutral `session-db` citation tuple + L3a `scope-outbox-v1` + `@sentropic/llm-mesh` routing `:417-429`, upstream lots `6A-S0a`, `6A-S0b`, `6A-S1a`–`6A-S1d`, `6A-S2`, `6A-H1`–`6A-H3` `:745-765`)
  - **Upstream `sentropic` `chat-mesh` Proposal (`sentropic:spec/SPEC_EVOL_CHAT_MESH_PROPOSAL.md`, r2):** Lots `B1`/`B2` (`:622-624`, delivering `SessionDb` and `session-db.entries.append` / `EntryRecord.ordinal` at `:276-279` in `./session-db/{postgres,sqlite}`), Lot `C2a` (`:629`, `RouteMeteringSink` & `WP16 D0` enforcement inside `@sentropic/llm-mesh` outside `llm-gateway`), `G-FENCE` (`:89,360-369`), and `G-NOSECRET` (`:97`)
- **Binding Authorities:**
  - [`spec/memory/OWNER-DECISIONS-2026-11-14.md`](memory/OWNER-DECISIONS-2026-11-14.md) (`:1-29` — `T-M-C` ownership rule, ratified Points `1B`, `2B`, `3C`, `4B`, `5B`, `6A`, and `D28` kept unchanged)
  - [`spec/memory/Q6-APPLICATION-LOG.md`](memory/Q6-APPLICATION-LOG.md) (`§19.3 :684-697`, Rules 1–5 — every claim about existing code verified against real repository state at a named commit SHA; every unshipped file, symbol, endpoint, or CLI flag marked `new` with its owning lot)
  - [`spec/memory/R15-SEDIMENT.md`](memory/R15-SEDIMENT.md) (`:1-146` — Engram-First Principle and settled decision ledger `D1`–`D34`, never reopened)
  - [`spec/memory/ARCHITECTURE-RULES.md`](memory/ARCHITECTURE-RULES.md) (`:1-13` — `R12` no-bypass invariant, `D30` three-layer separation, `archi@1` relation rules)
  - [`spec/SPEC_ENGRAM_PROFILE_VIEW_MECHANISM.md`](SPEC_ENGRAM_PROFILE_VIEW_MECHANISM.md) (`§2.1.1 :822-840` — `engram` serves declarations and semantic data only, never design-system fold/layout/rendering state)
  - [`spec/memory/contracts/engram-h2a.md`](memory/contracts/engram-h2a.md) (`:1-214`), [`spec/memory/contracts/engram-track.md`](memory/contracts/engram-track.md) (`:1-247`), [`spec/memory/contracts/engram-cluster-mesh.md`](memory/contracts/engram-cluster-mesh.md) (`:1-181`; Spec 1 §1.2 & §6.3 record the `POST /memory/v1/session-front/extractions` and `GET /memory/v1/control/proposals` addenda while keeping `contracts/engram-cluster-mesh.md` and `Spec 6A §2.2` untouched on disk in this lot, and Lot `1-E0` in §8.1 mirrors them into both documents)
- **Amends (Listed as Exact `Before → After` Deltas in §7; Target Files Unmodified in This Lot):**
  - [`spec/SPEC_AGENT_MEMORY_SUBSTRATE.md`](SPEC_AGENT_MEMORY_SUBSTRATE.md) (`§0`–`§5` write path, lines `53–244`, and `§9.4`, lines `343–370`)
  - [`spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`](SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md) (`§4`, lines `145–252`, and `§5.1`, lines `253–290`; preserving EVOL `D3` at `:73-77` and [`spec/SPEC_MEMORY_MCP_V2.md`](SPEC_MEMORY_MCP_V2.md) `M10` at `:884-910`)
  - [`spec/SPEC_LIVE_GIT_INDEXING.md`](SPEC_LIVE_GIT_INDEXING.md) (`§2`, lines `42–71`, and `§5`, lines `118–129`)
- **Evidence Baseline Verified (Read-Only, Including Actual Commit State vs Non-Existent Target Surfaces):**
  - `engram` (`/home/antoinefa/src/graphify-wt-memfinal`, `@sentropic/engram` `0.28.0` at commit `f9dc84f7ed338cc855b26ce5b13cb6744d4ed0cf`):
    - *Exists today:* `CHANGELOG.md:39-44` (`0.24.0` extraction toolkit), `src/extraction-batch.ts:1-3140` (`:74-78` currently imports `parseJsonFromLlmText` and `TextJsonGenerationClient` from `./llm-execution.js`), `src/profile-bundle.ts:1-1223`, `src/llm-mesh.ts:1-12` (`:12` currently re-exports `textClientToCallLlm` from `./llm-execution.js`), `src/llm-execution.ts:1-580` (`:246-266` reads `*_API_KEY`, `:278-280` mutates `process.env.GOOGLE_GENERATIVE_AI_API_KEY`, `:340-365,508` dynamically imports `@ai-sdk/*` and `ai`), `src/node-descriptions.ts:848-866`, `src/community-labeling.ts:407-425`, `src/pdf-ocr.ts:91,187`, `package.json:12-63,145-165` (currently bundles `@ai-sdk/anthropic` `:146`, `@ai-sdk/cohere` `:147`, `@ai-sdk/google` `:148`, `@ai-sdk/mistral` `:149`, `@ai-sdk/openai` `:150`, `ai` `:153`, `mistral-ocr` `:161` in `dependencies`, and pins `@sentropic/llm-mesh` to `"^0.19.0"` `:152`), `tsup.config.ts:56,79,88`, `engram-memory/package.json:4,11-13` (`"private": true`, types-only `./contracts`), `engram-memory/contracts/index.ts:1-1389` (`MemoryPortV2` `:1342-1361`), `engram-memory/module-storage-neutral.ts:35-230`, `engram-memory/bounded-projection.ts:22-86`, `engram-live/contracts.ts:323-325,674-676,697-701,1180-1208,1544-1557,1680-1738` (`isOpaqueId` `:323-325`, `IDENTITY_UNCERTAINTY_STATES = ["missing_history", "shallow_history"]` `:674`, `ID_PREFIXES` `:697-701`, object-level `validateWorktreeIdentity` `:1180-1208`, `PullRequestFactDto` `:1544-1557` without `mergedAt`, `PULL_REQUEST_FACT_KEYS` / `validatePullRequestFact` `:1680-1738`), `engram-live/registration.ts:312-445`, `engram-live/pr-sync.ts:1-524` (PR-only `PullRequestFactDto` + `PrSyncPersistencePort` `:79-87`, `runPrSyncPass` `:332-524`).
    - *Does NOT exist yet at `f9dc84f7`:* `"./session-front-contracts"` export in `package.json:12-63`, `src/session-front-contracts.ts`, string predicate `isValidWorktreeId` (`1-E1`/`1-E4`), `PullRequestFactDto.mergedAt` (`1-E4`), `src/llm-json-port.ts`, `src/session-extraction-adapter.ts`, `engram-memory/contracts/session-front.ts`, `engram-memory/session-front-engine.ts`, `engram-memory/privacy/*`, `engram-memory/decision-dossier.ts`, `engram-memory/live-tracking.ts`, `engram-memory/live-tracking-reconciler.ts`, `engram-live/derived-worktree-graph.ts`, and any `github-issue` / `github-review` / `project-board` contract in `engram-live/`.
  - `sentropic` (`origin/main` commit `913e3bcbc9dec9ff5f9db36eb3a1ef5a3dd11b7a`):
    - *Exists today:* `packages/cluster-mesh/src/storage/contracts.ts:29,179,195` (`STORAGE_MODULE_IDS = ['comments', 'engram-live', 'engram-memory']`; `DEFAULT_PAGE_LIMITS.maxRecords = 100`), `packages/cluster-mesh/src/storage/sqlite/engine.ts:38-40` & `tests/storage/sqlite-lanes.spec.ts:109-122` (one module per SQLite file), `packages/cluster-mesh/src/storage/sqlite/index.ts:52-63` (`LOT1_DURABLE_PROFILES`), `packages/cluster-mesh/src/engram-memory/sqlite.ts:137-145` (currently throws `StorageUnavailableError`), `packages/cluster-mesh/src/engram-memory/limits.ts:12-23` (`MEMORY_SINGLE_EVENT_LIMITS.maxEncodedBytes = 1_048_576`, `MEMORY_CAPTURE_COMPLETION_LIMITS.maxEncodedBytes = 65_536`), `packages/cluster-mesh/src/modules/catalog.ts:18,108-119,142` (`ENGRAM_MEMORY_RANGE = '>=0.22.0 <0.23.0'`), `packages/cluster-mesh/src/sessions/content-policy.ts:89-164` (`ContentPolicyV1`, `computeRetentionDeadline`), `packages/cluster-mesh/src/live-storage/registration.ts:27-31,161,165-181,509-515` (`validateWorktreeIdentity`, `LiveDeclarationStorePort`), `packages/cluster-mesh/src/forge/{contracts,custody,lifecycle,github-api}.ts` (`GIT_APP_PERMISSIONS` `:40,50-54`, `installationEvent` `:101-103`), `packages/cluster-mesh/tests/storage/cold-workspace.sh:161` (`vitest run "${CM_SCOPE:-tests}"`), `packages/mcp-platform/src/memory/contracts.ts:107-118` (`isValidOpaqueRef` `1..512` B vs `isValidIdempotencyKey` `16..256` B), `packages/llm-mesh/package.json:3,38-45` (`0.38.0` with `./decision`), `packages/llm-mesh/src/mesh.ts:49-54`, `packages/llm-mesh/src/routing-contracts.ts:13-75,190-222`, `packages/llm-mesh/src/decision/index.ts:1-16`, `api/src/app.ts:150-160`, `api/src/routes/namespaces/memory.ts:1-75`, `api/src/routes/session-content/route-table.ts:60-100`, `api/src/services/cluster-mesh/github-app-host.ts:34-47,152-246`, `api/src/services/artifacts/live/forge-github.ts:16-62`, `Makefile:1280-1290,2460-2467,4067-4096` (`5,090` lines total).
    - *Does NOT exist yet at `913e3bcbc`:* `'session-db'` in `STORAGE_MODULE_IDS` (`6A-S0b`), `SessionDb` / `session-db.entries.append` (`chat-mesh B1/B2`), restart-durable `scope-outbox-v1` / `fenced-writers-v1` in `LOT1_DURABLE_PROFILES` (`6A-S0b`), durable SQLite `engram-memory` (`6A-S1a`), `packages/cluster-mesh/src/compose/memory.ts` (`6A-S1c`), `GET /memory/v1/control/proposals` (`1-S1a`), `RouteMeteringSink` outside `llm-gateway` (`chat-mesh C2a`), and `PrSyncPersistencePort` implementation (`1-S0a`).
  - `h2a` (`/home/antoinefa/src/h2a`, `origin/main` commit `1f57127dee0bf671e559c347cd86960180cd64c9` and PR #455 head `844402eeae1161d74304e634790904785cbb602c`):
    - *Exists today:* `packages/h2a/src/hosts/plugin.ts:22-43,85-152,182-212` (`renderWorkspaceScope`, `H2A_HOST_PLUGIN_TARGETS`, `renderStopHook` — emitting `PreToolUse` `workspace-scope-guard.mjs`, `SessionStart` on `agy`/`muse`, `Stop` `h2a drumbeat record`, `receive` `h2a drive receive`, and `poll` `h2a drumbeat scan`, with **zero** `PostToolUse` or `UserPromptSubmit` generators), `packages/h2a/hooks/{hooks.json:1-17,vibe-pre-tool.mjs:1-40,vibe-post-agent.mjs:1-29}`, `packages/h2a/src/hosts/{agy.ts:1-60,muse.ts:1-46,vibe.ts:1-57,operator-notices.ts:1-24}`, `packages/h2a/src/envelope.ts:109-150`, `packages/h2a/src/runtime/identity/workspace-id.ts:41-48`, `packages/h2a/src/decision-dossier.ts:39-48`, `packages/h2a/src/negotiation.ts:1-14` (inter-agent only), `packages/h2a/src/runtime/focus/{serve.ts:1-60,edit-receipts.ts:5-29}`, `packages/h2a/src/runtime/canevas/{answer.ts:1-50,reply.ts:1-45,serve.ts:1-63}`, PR #455 (`844402ee`) `packages/h2a/src/registry/{bridge-lock.ts:336-445,host-bootstrap.ts:28-92,1646-1775,descriptors.ts:34,cli-registry.ts:643}`, `packages/h2a/src/hosts/installation-doctor.ts:2389-2445`, `packages/h2a/scripts/h2a-bridge-shim.mjs:1-294`, `packages/h2a/src/runtime/{mcp-central-policy.ts:21-141,handover/shim-bridge.js:49,309-387,handover/admission.js:102,handover/authority.js:28}`, `packages/h2a/tsconfig.json:10-12`, `packages/h2a-runtime/src/delegate.ts:758-810`, `packages/h2a-runtime/src/gateway-host/live-github.ts:1-45,163-180` (`mergeStrategy: "unknown"` `:176`, `row.merged_at` validated at `:165-166` without storing `mergedAt` on `fact`), `packages/focus-interactive/{package.json:6,36-47,src/sync.ts:11-16,src/feedback.ts:3-50,src/response-line.ts:1-33}` (`responseLine` `:21-33`; pure headless TS, zero `h2a`/network imports), `packages/focus/src/{model.ts:65-128,track/index.ts:169-225}`, `packages/track/{package.json:1-79,src/events/store.ts:39-80,src/events/types.ts:45-120,src/ingest/ingest.ts:242-280,src/ingest/contract.ts:8-58,80-96,src/ingest/focus-l4.ts:11-68,src/model/decision.ts:11-115,src/model/item.ts:16-36,src/model/demand.ts:18-53,src/report/stage-status.ts:57-65,src/report/format.ts:889-921,src/report/friendly.ts:1-60,src/report/audit.ts:1-65,src/report/owner-report-language.test.ts:1-65,skills/present-decision/SKILL.md:4,70-100}`, and `scripts/{run-test-gates.mjs:151-152,205-223,357-358,367-386,run-tests.mjs:13-21,74,test-inventory.mjs:8-85,test-execution-evidence.mjs:23-28,test-inventory.json:1-90}`.
    - *Does NOT exist yet at `1f57127de` / `844402ee`:* `packages/h2a/src/hosts/status-surface.ts` (`new` in `Spec 6A` Lot `6A-H3`), `PostToolUse` & `UserPromptSubmit` hook generators in `plugin.ts` (`1-H1`), `packages/h2a/hooks/vibe-post-tool.mjs` (`1-H1`), `packages/h2a/src/hosts/session-front-client.ts` (`1-H1`), `packages/h2a-runtime/src/retention/d14-host-purge.ts` (`1-H2`), `packages/h2a/src/runtime/focus/dossier-ingest-bridge.ts` (`1-H3`), `packages/track/src/control/engram-proposal-evaluator.ts` (`1-H4`), `packages/track/src/ingest/engram-live-tracking.ts` (`1-H4`), and `packages/h2a-runtime/src/track-cluster-mesh-client.ts` (`1-H4`).

---

## 0. Binding Governance, Owner Verbatims, and Architectural Boundaries

### 0.1 Binding Owner Verbatims

This specification executes the settled R15/R16 architecture without reopening any decision in `D1`–`D34` (`spec/memory/R15-SEDIMENT.md:40-80`) or `OWNER-DECISIONS-2026-11-14.md` (`:1-29`).

1. **Templates / Metamodel / Control (`T-M-C`) and Consolidated Review Decisions (`1B`–`6A`, `D28` Kept)** (`spec/memory/OWNER-DECISIONS-2026-11-14.md:6-7`):
   > « Les question sont pas assez detaillees. Pose les ici. On est en train de faire des modif coté track sjr les ontologies de son domaine, il fdoit en rester maitre au moins piur les templates et engram pour leur metamodel et application track pour leur controle. Mene un tour avec h2a rapide en fable 5.2 + carbon et repose les 6 quesfion a l issi »
   > « Tout comme recommandé »

2. **First-Rank Session Ingestion Before `Track` and Analysts (`D19`, `D24`, `D32`)** (`spec/memory/R15-SEDIMENT.md:12,20-21,69,77`):
   - > « Engram doit etee en premier front pour recup les donnes de session avant track, avec des analystes » (`comments-2026-11-08.md:19`)
   - > « Attention car le premier rang doit etre engram (enregistrement pkur serialisarkkn eg tour de parole + regles + conrrole track si possible par agent). L usage d agent en controle pour track iu engrame devrai etre possible mais potentiellement reposer plutot sur des api type jev/decison ou llm tres rapides. Je ne sais pas si ce seront des "agents" » (`comments-2026-11-08.md:15`)
   - > « Donc part de engram - et de track » (`comments-2026-11-08.md:16`)
   - > « Attention track c juste pour les decision et gestion d evenement projet. Engram doit etre la premiere etape in fine. Cette assertion me smeble tres mauvaiss » (`comments-2026-11-08.md:9`)
   - > « Track nest qu un modal d analyst et controle mais le harnais en est un autre et l agent dormant aussi... » (`comments-2026-11-08.md:19`)

3. **Mandatory `cluster-mesh` MCP Registry and Integral DB-Cluster Sync (`R12`, `D24`)** (`spec/memory/ARCHITECTURE-RULES.md:5`; `spec/memory/R15-SEDIMENT.md:31,69`):
   - > « repose bien sur le mcp registry de cluster mesh » (`owner-r9/r12-correction-2026-11-07.md:5`)
   - > « De plus j ai demande un partage de graphe entre local et remote. Integral. Engram doit gere ca comme des transaction et synchro de cluster de db via cluster mesh. » (`comments-2026-11-08.md:10`)

4. **Extraction Model Posture** (`spec/memory/R15-SEDIMENT.md:27`):
   > « Il faut oeut etre en permanence un deuxiemme llm light d extraction ou reposer sur le llm de session pour les decisions a terme pkoi pas des modeles deeplearninf specialises. » (`comments-2026-11-08.md:19`)

5. **Derived Git Worktree Graph Modelling (`D21`)** (`spec/memory/R15-SEDIMENT.md:66,104`):
   > « J ai demande un [nom retiré à ta demande] like et c est cette merde que j ai les donmees sont pas modelisees » (`comments-2026-11-08.md:5`)

6. **Decision-Dossier Learning Exchanges (`D27=decision-only`) and Project vs Harness Decisions (`D3`, `D31`)** (`spec/memory/R15-SEDIMENT.md:48,72,76`):
   - > « Oui decision mais ce peut etre comme un decision dossier. Temps d echanger de qualite avec l ia resultant en des faits contextualisé et des decisions associees a ce contexte » (`comments-2026-11-08.md:12`)
   - > « quoi qu'il arrive engram doit modéliser toute décision: décision de projet, décision de harnais, mais avec des destination de sérialisation différentes. » (`owner-r8/comments-2026-11-07.md:19`)
   - > « C est tres mauvais tu confonds bcp de concepts. Engram est la memoire et enregistre les decisions de harnais. H2a a le master harnais et chaque dev a sa surouche. Engram tien le premker rang et tout comme on serialise les spec du engram et le track on serialise la surcouche de chque workspace / repo qu on va aussi commiter » (`comments-2026-11-08.md:14`)

7. **External HMI / GitHub Layer (`D30`) and Live Tracking (`suivi live`)** (`spec/memory/R15-SEDIMENT.md:21,32,75`; `owner-r10/suivi-direct-2026-11-07.md:5`):
   - > « Attention tu confonds l outil track la memoire e tun outil ihm pour interagir avec - gh pourra donner de l input c une autre layer » (`comments-2026-11-08.md:13`)
   - > « trakc avec engram devra vraiment assurer un suivi live » (`owner-r10/suivi-direct-2026-11-07.md:5`)

8. **Privacy, Confidentiality Deny-List, PII Armor, Study Bounds, Federation, and Queryable Text History (`D7`, `D8`, `D9`, `D10`, `D23`)** (`spec/memory/R15-SEDIMENT.md:52-55,68`):
   - > « de base empreintes + triage de sensibilité pour faciliter stp (possibilité de gérer une black list de confidentialité a prevoir dans la memoire pour un agent de controle de memoire type PII) » (`owner-r8/comments-2026-11-07.md:15`)
   - > « metadonnées deterministes + extrait bornés (voir le meme sujet décision précédente il faut un mécanisme de type armor PII pour faciliter le partage) » (`owner-r8/comments-2026-11-07.md:13`)
   - > « 30 projets 6 mois de session merci (tu bornes les session aux 6 mois) » (`owner-r8/comments-2026-11-07.md:11`)
   - > « + propriétaire peut avoir une polituqe par repo » (`owner-r8/comments-2026-11-07.md:9-10`)
   - > « Comme je disais precedemment un contexte de session devrait etre une requete contextuelle a la memoire + le resultat de la requete. L envoi au llm ne devrait pas envoyer de vieux contexte. L historique de sessions serait juste acceasible via la memoire comme gestionnaire de session et memoire (on garde l historique de texte en query via le graph memoire) » (`comments-2026-11-08.md:8`)

9. **Proactive `h2a` Role Analysis When Unassigned (`D16`)** (`spec/memory/R15-SEDIMENT.md:22,61`):
   > « Quand il n y a pas de role, h2a devrait etre proactif en analyse et proposition. » (`comments-2026-11-08.md:2`)

### 0.2 Scope Boundary Across Specs 0, 6A, 1, 2, 3, 4, 5, and 6B

| Spec | Ownership Boundary Relative to Spec 1 |
| :--- | :--- |
| **Spec 0** (`SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md`) | Owns `Sha256Digest` (`:144`), `LineageId` (`:147`), `OntologyTemplateEnvelopeRef` (`:149-154`), `H2AMandateEnvelope` (`:161-174`), `track.ontology.yaml` (`:930-933`), and `.h2a/overlays/*` path conventions (`:977-982`). Spec 1 imports these contracts unchanged. |
| **Spec 6A** (`SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md`) | Owns the mandatory `R12` transport endpoints (`POST /memory/v1/session-front/ingest`, `POST /memory/v1/hmi/input`, `POST /memory/v1/control/verdicts`, and `GET /memory/v1/health` at `:215-230`, plus the guarded `POST /memory/v1/session-front/extractions` addendum specified in §1.2 below), verified `H2AEnvelope<H2AMandate>` check (`:311-398`), `D17=degraded` outbox durability (`:399-416`), neutral `session-db` citation tuple (`:421-423`), and `@sentropic/llm-mesh` model routing (`:424-426`). Spec 1 defines the `engram` domain ingestion, extraction, worktree, dossier, privacy, and live-tracking semantics invoked behind those `cluster-mesh` endpoints. |
| **Spec 1** *(this document)* | Owns `EngramSessionIngestFrontPort` (`recordSessionEvent`, `recordExtraction`), the pluggable post-recording extraction pipeline over the `0.24.0` extraction toolkit (`CHANGELOG.md:39-44`), `D21` `derived_worktree` graph entities bound to `@sentropic/engram-live`, `D27=decision-only` decision-dossier exchanges, `D33`/`D7`/`D8`/`D9`/`D11`/`D13`/`D14` privacy & retention rules, and typed live-tracking events (`pr.merged`, `owner.answer`, `owner.request`) with reconciliation and gap reporting. |
| **Spec 2** (`SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md`) | Consumes the canonical records and authorized graph projections written by Spec 1 to assemble durationless prompts via `engram_memory_context` (`D20`, `D22`, `D23`). |
| **Spec 3 / Spec 4 / Spec 5 / Spec 6B** | Spec 3 owns dormant dreaming passes (`D19`, `D25`, `D26`, `Point 3C`); Spec 4 owns `h2a` role/skill ontology & `.h2a/` overlay Git serialization (`D16`, `D31`, `Point 4B`); Spec 5 owns `Track` template control & per-PR `.track/` projection/replay (`D1`, `D29`, `D34`, `Points 1B/5B`); Spec 6B owns multi-node ACID graph sync (`D24`, `Point 6A`). |

### 0.3 Design-System View Projection Boundary ([`spec/SPEC_ENGRAM_PROFILE_VIEW_MECHANISM.md`](SPEC_ENGRAM_PROFILE_VIEW_MECHANISM.md) `§2.1.1 :824-840`)

Wherever Spec 1 graph entities (`derived_worktree`, `decision_dossier`, `project_decision`, `harness_decision`, live-tracking trails) are served to diagram or UI views, **`engram` never computes or serves any state that the design system derives from folding, layout, or rendering**:
1. `engram` serves **declarations** (validated against `engram.metamodel/v1`) and **semantic data** (selected nodes, relations, attributes, and `CitationV1` / `SessionDbCitationTuple` evidence pinned to commit/cursor and `Sha256Digest`).
2. `engram` never emits hidden/visible occurrence sets, lifted endpoints, summary candidates, fold states, geometry, layout caches, or rendering-derived counts ([`spec/SPEC_ENGRAM_PROFILE_VIEW_MECHANISM.md`](SPEC_ENGRAM_PROFILE_VIEW_MECHANISM.md) `§2.1.1 :829-837`).

---

## 1. First-Rank Session Ingestion Front (`EngramSessionIngestFrontPort`, `R12`, `D12`, `D15`, `D17`, `D18`, `D30`)

### 1.1 Verified Code-Fact Baseline and Current Gaps

| Surface | Verified Current Code at Commit Baseline (`[FACT: repo:file:line]`) | What Does Not Exist Yet & R15 Gap Closed by Spec 1 |
| :--- | :--- | :--- |
| **8 CLI Host Plugins (`h2a` `1f57127de` + PR #455 `844402ee`)** | `H2A_HOST_PLUGIN_TARGETS` (`h2a:packages/h2a/src/hosts/plugin.ts:85-150`) defines 8 CLI hosts (`H2A_HOST_PLUGIN_HOSTS` at `:152`): 6 push-capable (`claude` `:86-92`, `codex` `:93-99`, `gemini` `:100-106`, `hermes` `:114-120`, `opencode` `:121-127`, `vibe` `:143-150` via `~/.vibe/hooks.toml` `post_agent` with no prompt-level receive hook at `:135-142` and `receive: 'N-A'` at `:207`) and 2 `push: false` poll-path hosts (`agy` `:107-113`, `muse` `:128-134`, which do not natively write transcripts into `cluster-mesh` `session-db` when launched outside an `h2a-runtime` PTY seat in `packages/h2a-runtime/src/delegate.ts:758-810`). Today `renderWorkspaceScope` (`:22-43`) emits only `PreToolUse` (`workspace-scope-guard.mjs`) for `['claude', 'codex', 'gemini', 'vibe', 'agy', 'muse']` (`:26`) and `SessionStart` (`agyWorkspaceScopeDefinition` `:39-43` and `muse` `:133`); `renderStopHook` (`:182-212`) emits only `Stop` (`h2a drumbeat record` `:190-196`), `receive` (`h2a drive receive --to <instance> --stdin --ignore-non-drive` `:197-199`), and `poll` (`h2a drumbeat scan` `:210`), with **zero** `PostToolUse` or `UserPromptSubmit` generators. `packages/h2a/hooks/` contains `hooks.json:1-17`, `vibe-pre-tool.mjs:1-40`, and `vibe-post-agent.mjs:1-29` (which runs `h2a drumbeat record` only when `payload.parent_session_id === null` `:14-26`, without speech-turn or `tool_result` extraction, and has no `vibe-post-tool.mjs`). `packages/h2a/src/hosts/operator-notices.ts:1-24` exists while `status-surface.ts` is `new` in `Spec 6A` Lot `6A-H3`. | *Does not exist yet (added in Lot `1-H1` on top of `6A-H1`–`6A-H3` & PR #455 `844402ee`):* `PostToolUse` and `UserPromptSubmit` hook generators in `plugin.ts`, `packages/h2a/hooks/vibe-post-tool.mjs`, speech-turn / `tool_result` extraction in `vibe-post-agent.mjs` and `h2a drumbeat record`, opportunistic MCP / `SessionStart` / `PreToolUse` / `drumbeat scan` flush for standalone `agy` & `muse` CLI sessions, `packages/h2a/src/hosts/session-front-client.ts`, Mode B ordinal replay marker for `mandate_binding`/`context_saturation`, and `D17` banner wiring via `operator-notices.ts` + `status-surface.ts` (`6A-H3`). |
| **`Track` Write Front (`h2a` `1f57127de`)** | `EventStore.appendCommand` (`h2a:packages/track/src/events/store.ts:39-80`) appends directly to `.track/events.jsonl`, and `authorize` (`h2a:packages/track/src/ingest/ingest.ts:242-280`) checks channel capabilities and `ctx.prov.auth` without `engram` first-rank recording or `cluster-mesh` mediation. | Retires `.track/events.jsonl` as an unmediated live session front (`R15-SEDIMENT.md:90-92`); raw events enter `engram` first via `cluster-mesh`, and `Track` acts downstream as template/control authority via `POST /memory/v1/control/verdicts` (`Point 5B`). |
| **Canonical Memory Substrate & Package Exports (`engram` `f9dc84f7`)** | `MemoryPortV2` (`engram-memory/contracts/index.ts:1342-1361`, in `:1-1389`) exposes `capture` (`:1346`) and `ingestActivity` (`:1348`), backed by `CanonicalMemoryStorePort` (`:761-857`) and `MEMORY_MODULE_ID = "engram-memory"` (`engram-memory/module-storage-neutral.ts:35-118`). `engram-memory/package.json:4,11-13` is `"private": true` with types-only `./contracts`; `package.json:12-63` lacks `"./session-front-contracts"`, while `package.json:146-161` still bundles `@ai-sdk/*`, `ai`, `mistral-ocr`, and `@sentropic/llm-mesh: "^0.19.0"`. | *Does not exist yet:* `"./session-front-contracts"` export (`src/session-front-contracts.ts`), `isValidWorktreeId`, `EngramSessionIngestFrontPort`, `RawEventExtractionDisposition`, bounded `turn_text` projection, `engram-memory/privacy/*`, SDK-isolated `src/llm-json-port.ts`, and `SessionExtractionStrategyPort`. |
| **`cluster-mesh` Storage, SQLite Lanes & Routes (`sentropic` `913e3bcbc`)** | `STORAGE_MODULE_IDS` (`sentropic:packages/cluster-mesh/src/storage/contracts.ts:29`) registers `['comments', 'engram-live', 'engram-memory']` only; `SqliteOpenOptions.moduleId` (`storage/sqlite/engine.ts:38-40`, `tests/storage/sqlite-lanes.spec.ts:109-122`) enforces one module per SQLite file; `createMemorySqliteStorage` (`engram-memory/sqlite.ts:137-145`) still throws `StorageUnavailableError` and `LOT1_DURABLE_PROFILES` (`storage/sqlite/index.ts:52-63`) persists neither `scope-outbox-v1` nor `fenced-writers-v1` across restart; `api/src/routes/namespaces/memory.ts:10,27-75` (`api/src/app.ts:150-160`) exposes legacy `productMemoryModule`; `RECEIVER_ROUTE_TABLE` (`api/src/routes/session-content/route-table.ts:60-100`) freezes 38 RC2 routes. | *Does not exist yet on `origin/main`:* `'session-db'` in `STORAGE_MODULE_IDS` + durable `SqliteKernel` profiles (`6A-S0b`), `SessionDb` / `session-db.entries.append` / `EntryRecord.ordinal` (`chat-mesh` Lots `B1`/`B2`), durable SQLite `engram-memory` (`6A-S1a`), `compose/memory.ts` (`6A-S1c`), and `namespaces/memory.ts` migration (`6A-S1d`). Spec 1 layers two-kernel sequential ingestion, guarded `/session-front/extractions`, `/control/proposals`, and `/hmi/input` on top of those `6A-S*` and `chat-mesh` prerequisites. |

### 1.2 Architecture, Spec 6A HTTP Contracts, Two-Kernel Sequential Commit, and `R12` Mediation Flow

```mermaid
flowchart LR
    CLI["h2a 8 CLI Host Plugins (claude, codex, gemini, agy, hermes, opencode, muse, vibe)"] -->|"POST /memory/v1/session-front/ingest (R12)"| CM["cluster-mesh Memory Access (@sentropic/cluster-mesh/compose/memory)"]
    HMI["GitHub PR Sync & Webhook Ingress (cluster-mesh/forge, D30)"] -->|"POST /memory/v1/hmi/input (R12)"| CM
    CM -->|"1. entries.append (ordinal)"| SDB[("cluster-mesh Neutral session-db (SqliteKernel #1 / PG)")]
    CM -->|"2. recordSessionEvent + lastIngestedOrdinal"| ING["EngramSessionIngestFrontPort (engram)"]
    ING -->|"commits raw_event + bounded turn_text + scope-outbox-v1"| MEM[("engram-memory Store (SqliteKernel #2 / PG)")]
    MEM -->|"bounded async queue"| EXT["Session Extraction Host (1-S2 · extraction-batch)"]
    EXT -->|"sole model path"| LLMM["@sentropic/llm-mesh + llm-mesh/decision"]
    EXT -->|"3. in-process recordExtraction (MemoryNeutralGrant)"| ING
    MEM -->|"project slices (proposed)"| CM
    CM -->|"delivers proposals & accepts POST /memory/v1/control/verdicts"| TRK["Track Application Control (verdictAuthority: track)"]
```

**Mandatory `R12` Invariant & Single Mount Path (`spec/memory/ARCHITECTURE-RULES.md:5`; `Spec 6A §2.1–§2.2 :158-230`):**
1. `h2a`, `Track`, `@sentropic/chat-server` (`G-FENCE`), and external GitHub HMI adapters **never** import or invoke `EngramSessionIngestFrontPort` directly in-process across package boundaries. `engram` exports pure L0 data contracts and runtime validators at **`@sentropic/engram/session-front-contracts`** (`src/session-front-contracts.ts`, §1.4) and the neutral engine factory consumed solely by `packages/cluster-mesh/src/compose/memory.ts`.
2. **Single `compose/memory` Route Host (`F-01`):** Every `/v1/session-front/*`, `/v1/control/proposals`, and `/v1/hmi/input` handler is defined inside `packages/cluster-mesh/src/compose/memory.ts` (`namespace: '/memory'`) and exposed on `sentropic/api` **solely** through `api/src/routes/namespaces/memory.ts` (`MEMORY_PATHS`, migrated in `6A-S1d`, resolving to `/memory/v1/*` on direct `cluster-mesh` mounts and `/api/v1/memory/v1/*` under `api/src/app.ts:150-160`). Creating a parallel `api/src/routes/memory/session-front.ts` file is **forbidden**, and the frozen 38-route `RECEIVER_ROUTE_TABLE` (`sentropic:api/src/routes/session-content/route-table.ts:60-100`) remains untouched.

| Mesh-Relative Endpoint (`/api/v1/memory/v1/*` on `api`) | Method & Body Ceiling | Required Authority & Scope Verification | Spec Owner & Role |
| :--- | :--- | :--- | :--- |
| `/memory/v1/session-front/ingest` | `POST` (`maxRequestBytes <= 1_048_576`, `engram-memory/limits.ts:12-16`) | Enrolled host attachment proof (`mandateEnvelope` optional on raw ingress per `Spec 6A :224`); rejects unauthenticated callers (`D18=readonly`, `401`/`403`). | `Spec 6A :224` + **Spec 1 §1.4**: sequential `session-db` → `engram-memory` raw event recording before `Track` (`Point 1B`), returning `readySlices` + optional `readySlicePayloads`. |
| `/memory/v1/session-front/extractions` *(Spec 1 addendum mirrored into `Spec 6A §2.2` & `contracts/engram-cluster-mesh.md` in Lot `1-E0`)* | `POST` (`maxRequestBytes <= 1_048_576`, `engram-memory/limits.ts:12-16`) | **Mandatory** verified `H2AEnvelope<H2AMandate>` (`memory:capture` right, `Spec 6A §2.3 :311-398`) **plus** mandatory check that every ID in `batch.sourceEventRecordIds` and `candidates[].sourceEventRecordIds` belongs to the authenticated `(tenantId, workspaceId)` / `scopeRef` (`403` on cross-scope mismatch; `404`/`NOT_FOUND` if uncommitted). *(Note: internal `cluster-mesh` extractor `1-S2` calls `recordExtraction` in-process under `MemoryNeutralGrant` without traversing public HTTP.)* | **Spec 1 §1.4 & §2**: external/mandated proposal batch submission (`Point 5B`). |
| `/memory/v1/hmi/input` | `POST` (`maxRequestBytes = 65_536`, rate-limited per `(installationRef, repository)`, §6.4) | Enrolled service/user auth + verified `cluster-mesh/forge` or local `gh` source attestation (`Spec 6A :228`); verified numeric GitHub `sender.id` → Sentropic `owner` binding required before any `owner.answer` / `owner.request` classification (§6.1). | `Spec 6A :228` + **Spec 1 §6**: `D30` external HMI input ingestion (`pr.merged` in Spec 1). |
| `/memory/v1/control/proposals` *(`new` Spec 1 query addendum mirrored in Lot `1-E0`)* | `GET` (cursor-paginated `limit <= 100`, `?status=proposed`) | Verified `H2AEnvelope<H2AMandate>` with `track:control` (`sentropic.track`) or `h2a:control` (`sentropic.h2a`) scoped to `(tenantId, workspaceId)`. | **Spec 1 §6.3 (`OQ-S1-3`)**: synchronous pre-PR proposal drain (`listPendingProposals`) before `serializeProjectPrSlice` / `replayBeforeMerge`. |
| `/memory/v1/control/verdicts` | `POST` (`Spec 6A :227, 777`) | Verified `H2AEnvelope<H2AMandate>` with `track:control` (`sentropic.track`) or `h2a:control` (`sentropic.h2a`). | `Spec 6A :227` + **Spec 5** (consumed in **Spec 1 §2.3 & §6.3**): authoritative `TrackControlVerdict` / `h2a` verdict (`Point 5B`, `D32`). |
| `/memory/v1/health` | `GET` (`Spec 6A :230`) | Read-only host/authenticated diagnostic check. | `Spec 6A :230` + **Spec 1 §6.4**: `D17` state, outbox depth, `live_tracking_gap_count`, `live_tracking_pending_verdict_count`, and `live_tracking_sync_staleness_ms`. |

**Two-Kernel Sequential Commit Protocol (`F-02`):**
Because `SqliteOpenOptions.moduleId` (`sentropic:packages/cluster-mesh/src/storage/sqlite/engine.ts:38-40`, enforced by `tests/storage/sqlite-lanes.spec.ts:109-122`) isolates one `StorageModuleId` per SQLite file, `'session-db'` and `'engram-memory'` **cannot** share a single multi-module SQLite transaction. For every `speech_turn` / `tool_result` / `session-db`-backed ingestion, `compose/memory` executes a deterministic two-step commit:
1. **Step 1 (`session-db` kernel):** `session-db.entries.append(...)` (`sentropic:spec/SPEC_EVOL_CHAT_MESH_PROPOSAL.md:276-279`, `chat-mesh` Lots `B1`/`B2`) commits the operational entry first and returns its immutable `(entryId, ordinal, contentDigest)` (plus `branchEpoch` / `parentEntryId` on forks).
2. **Step 2 (`engram-memory` kernel):** `engram-memory` commits in one fenced `SqliteKernel.commit(...)` (or Postgres) transaction the `raw_event` record, the bounded `turn_text` projection (§1.3), the neutral L3a `scope-outbox-v1` entry (`memory-projection-outbox`), **and** an atomic update to the durable per-`(sessionId, branchEpoch)` cursor **`lastIngestedOrdinal = Math.max(prev, ordinal)`**.
3. **Deterministic Crash & Mode-B Repair:** If the process crashes between Step 1 and Step 2 (or while `engram-memory` is in Mode B, §1.6), `maxCommittedOrdinal > lastIngestedOrdinal` immediately exposes the exact ordinal gap (`F-07`), and replaying `session-db` entries with `ordinal > lastIngestedOrdinal` converges idempotently (`duplicate_exact` on any already-committed entry).

### 1.3 Neutral `session-db` Citation Tuple, Bounded `turn_text` Projection, and EVOL `D3` / `M10` Preservation

Per the owner's `2026-11-14` `chat-mesh` rulings relayed in `Spec 6A §2.2` (`:216, 224`) and `§2.5` (`:417-423`) and `sentropic` review `F-02`:
1. **Primary `session-db` Entry + Bounded `turn_text` Canonical Projection (`<= 64 KiB`):**
   - Full operational session entries, streams, and raw attachments reside in `cluster-mesh`'s neutral `session-db` module (`STORAGE_MODULE_IDS` `'session-db'`, registered in `6A-S0b` and implemented by `chat-mesh` Lots `B1`/`B2`). `engram` creates **no** parallel operational session table and **no** memory-specific outbox table.
   - Inside `engram-memory`, each `turn_text` envelope stores `SessionDbCitationTuple` **together with a bounded canonical UTF-8 text projection (`<= 65_536` bytes / `64 KiB`)** — matching `MEMORY_CAPTURE_COMPLETION_LIMITS.maxEncodedBytes = 65_536` (`:22`) and fitting well within `MEMORY_SINGLE_EVENT_LIMITS.maxEncodedBytes = 1_048_576` (`sentropic:packages/cluster-mesh/src/engram-memory/limits.ts:12-23`; turns exceeding `64 KiB` store a UTF-8 codepoint-boundary-safe `64 KiB` canonical excerpt with `truncatedInProjection: true`, while `contentDigest` pins the full immutable `session-db` entry). This satisfies `D23` lexical/FTS search and queryable text recall in `engram` without duplicating unbounded operational transcripts.
   - **Subordination to `ContentPolicyV1` and Workspace Sync Policy (`D24`, `Point 6A`):** Local CLI operational transcripts are governed by the owner's signed `ContentPolicyV1` (`sentropic:packages/cluster-mesh/src/sessions/content-policy.ts:89-139`). When a workspace is opted into `D24` remote sync (`Point 6A`) **and** the owner's signed `ContentPolicyV1` authorizes remote session-content capture for that channel, `raw_event` and bounded `turn_text` replicate integrally and unmasked across the same `(tenantId, workspaceId)` DB cluster (`D24`, §5.2). When `ContentPolicyV1` withholds remote operational transcript upload (local-only CLI transcript), raw `turn_text` bytes remain `syncState: 'local-only'` on the workstation rather than bypassing `ContentPolicyV1`.
2. **Canonical Citation Tuple (`SessionDbCitationTuple`):** Every turn-derived `raw_event` and `turn_text` record committed in `engram` references its immutable `session-db` source via the 4-tuple `(sessionId, entryId, ordinal, contentDigest)` plus optional fork coordinates `(branchEpoch, parentEntryId)` when a session branches:
   ```ts
   // status: proposed — Neutral session-db citation tuple (Spec 6A §2.2 :224, §2.5 :422)
   export interface SessionDbCitationTuple {
     readonly sessionId: string;               // Neutral session-db session identifier (pseudonymized as sessionPseudoId in projections per D33)
     readonly entryId: string;                 // Immutable entry primary key in neutral session-db
     readonly ordinal: number;                 // Safe non-negative integer EntryRecord.ordinal within (sessionId, branchEpoch)
     readonly contentDigest: Sha256Digest;     // sha256:<64 lowercase hex> over UTF-8 RFC 8785 JCS bytes of the raw entry
     readonly branchEpoch?: number;            // Present when the session forks from an earlier ordinal
     readonly parentEntryId?: string;          // Parent entry anchor across a session branch
   }
   ```
   When mapped into `CitationV1` (`engram-memory/contracts/index.ts:18-24`), `locator` is `{ scheme: "session-db", value: "${sessionPseudoId}/${entryId}#ord=${ordinal}${branchEpoch !== undefined ? `&epoch=${branchEpoch}` : ""}" }` and `content_digest` equals `contentDigest`.
3. **Preservation of EVOL `D3` (`SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:73-77`) and `SPEC_MEMORY_MCP_V2` `M10` (`:884-910`):**
   - `raw_event` records, bounded `turn_text` envelopes, immutable `MemoryRecordV2` blobs, and `LifecycleEventV2` chains in `CanonicalMemoryStorePort` (`engram-memory/contracts/index.ts:761-857`) are the **sole canonical memory authority**.
   - The contextual memory graph queried by `engram_memory_context` (`Spec 2`) is an **authorized derived projection**; no graph projection method (`GraphStore.pushGraph` or `FileGraphStore`) may capture, admit, mutate, or resurrect a canonical record.
   - Under `D23`, `engram_memory_context` resolves and returns authorized, `D8`-bounded text history on demand via `SessionDbCitationTuple` / canonical `turn_text` envelopes; **turn text and session event logs are never copied into `graph.json`**, preserving `MEMORY_PROJECTION_RAW_BYTE_CEILING = 52_428_800` (`engram-memory/bounded-projection.ts:22`) and `accepted_current`-only projection eligibility (`SPEC_MEMORY_MCP_V2.md:898`).

### 1.4 Normative `EngramSessionIngestFrontPort` Contract and Subpath Packaging (`F-03`, `F-05`, `F-07`, `F-14`, `F-15`)

**Subpath Packaging & `cluster-mesh` Provider Catalog Registration (`F-14`):**
Because `engram-memory/package.json:4,11-13` is `"private": true` and exports types only, `@sentropic/engram/package.json` `exports` (`:12-63`) and `tsup.config.ts` (`:56,88`) MUST expose **`"./session-front-contracts"`** (`src/session-front-contracts.ts` re-exporting `engram-memory/contracts/session-front.ts` plus pure runtime validators, compiled to ESM `.js` + `.d.ts` with zero native, DB, or LLM-SDK imports). On the `sentropic` side (`Lot 1-S1a`), `packages/cluster-mesh/src/modules/catalog.ts` (`:108-119`) registers the corresponding `PROVIDER_CATALOG` entry (`requiredMembers` + topology-guarded loader in `src/loaders/memory.ts`).

```ts
// status: proposed — @sentropic/engram/session-front-contracts (src/session-front-contracts.ts, consumed via cluster-mesh R12)
import type {
  H2AMandateEnvelope,
  LineageId,
  OntologyTemplateEnvelopeRef,
  Sha256Digest,
} from './metamodel-contracts.js'; // Spec 0 §2.1 (:144-174)
import type {
  AuthorizationContextV1,
  CitationV1,
  Cursor,
  Instant,
  OpaqueRef,
  Result,
  RetentionV1,
} from 'engram-memory/contracts'; // engram-memory/contracts/index.ts:1-68,122-125,148-151

export type CliHostId =
  | 'claude' | 'codex' | 'gemini' | 'agy'
  | 'hermes' | 'opencode' | 'muse' | 'vibe'; // h2a:packages/h2a/src/hosts/plugin.ts:85-150

export type RawSessionEventKind =
  | 'speech_turn'
  | 'tool_result'
  | 'file_ref'
  | 'mandate_binding'
  | 'external_hmi_input'
  | 'context_saturation';

/**
 * F-07 terminal vs non-terminal extraction disposition persisted on every raw_event
 * so legitimate D7 rejections or empty-candidate turns never trigger perpetual gap alerts or re-extraction loops.
 */
export type RawEventExtractionDisposition =
  | 'pending_extraction'
  | 'proposed'
  | 'empty_verified'
  | 'withheld_d7';

export type ToolResultSignificance =
  | 'routine'
  | 'significant'
  | 'error'
  | 'security-gate'; // Drives D23 attention weighting in Spec 2 without dropping raw recording

export interface D6FileOrPathRef {
  /**
   * Deterministic path carrier:
   * - Allowed non-secret relative path when repo/content policy permits;
   * - `withheld-path:<sha256>` via protectedPathRef (engram-live/content-policy.ts:133-136)
   *   when classifyPath (:92-125) flags a secret-bearing basename/segment or when ungranted;
   * - Never an unmasked host-local absolute filesystem realpath (D6=refs, D33).
   */
  readonly pathRef: string;
  readonly contentFingerprint: Sha256Digest;
  readonly byteLength?: number;
  readonly lineRange?: { readonly start: number; readonly end: number };
  readonly contentDisclosureAuthorized: boolean; // False => zero excerpt/content reaches external models, caches, or logs (D6)
}

export type RawSessionEventPayload =
  | {
      readonly kind: 'speech_turn';
      readonly speakerRole: 'owner' | 'user' | 'assistant' | 'conductor' | 'system';
      readonly hostId: CliHostId;
      /**
       * Ingestion delivery path (M1, OQ-S1-4):
       * - `'push-hook'`: `UserPromptSubmit` / `Stop` on push-capable CLI hosts;
       * - `'post-agent-hook'`: `vibe-post-agent.mjs` / `h2a drumbeat record` turn-pair extraction;
       * - `'poll-scan'`: `SessionDbFallbackCursor` (`5_000 ms`, bounded `[1_000 ms, 30_000 ms]`) when `agy`/`muse` run inside an `h2a-runtime` PTY seat (`delegate.ts:758-810`) or on `h2a drumbeat scan`;
       * - `'mcp-opportunistic'`: immediate opportunistic flush on MCP tool calls (`h2a registry-bridge serve` / `mcp-central`) and `SessionStart` / `PreToolUse` (`plugin.ts:22-43`) for standalone `agy` / `muse` CLI sessions outside `h2a-runtime`;
       * - `'in-process'`: internal `cluster-mesh` host path.
       */
      readonly deliveryPath: 'push-hook' | 'post-agent-hook' | 'poll-scan' | 'mcp-opportunistic' | 'in-process';
      readonly sessionCitation: SessionDbCitationTuple;
      /** Bounded canonical UTF-8 text projection (`<= 65_536` bytes, F-02); omitted when ContentPolicyV1 withholds capture. */
      readonly boundedTurnText?: string;
      readonly truncatedInProjection?: boolean;
      readonly triggerTurnSweep: boolean; // True on outbound send per D12=turn
    }
  | {
      readonly kind: 'tool_result';
      readonly hostId: CliHostId;
      readonly toolName: string;
      readonly invocationId: string;
      readonly succeeded: boolean;
      readonly exitCode?: number;
      readonly significance: ToolResultSignificance;
      readonly sessionCitation: SessionDbCitationTuple;
      readonly touchedFiles: readonly D6FileOrPathRef[];
    }
  | {
      readonly kind: 'file_ref';
      readonly file: D6FileOrPathRef;
      readonly gitCommitOid?: { readonly algorithm: 'sha1' | 'sha256'; readonly oid: string };
      readonly sessionCitation?: SessionDbCitationTuple;
    }
  | {
      readonly kind: 'mandate_binding';
      /**
       * Verified by cluster-mesh against real H2AEnvelope<H2AMandate> (Spec 6A §2.3 :311-390).
       * Explicit `null` is valid and triggers proactive h2a role/rule analysis (D16).
       */
      readonly mandate: H2AMandateEnvelope | null;
      readonly unboundRoleAnalysisRequested: boolean; // Must be true when mandate === null (D16)
    }
  | {
      readonly kind: 'external_hmi_input'; // D30 separate HMI/GitHub input layer (Spec 1 Phase 1: PR flow only per F-05 / OQ-S1-5)
      readonly hmiSource: 'github-pr-sync' | 'github-webhook'; // github-issue, github-review, and project-board deferred to follow-up D30 spec (§6.1)
      readonly externalSourceId: OpaqueRef; // 1..512 UTF-8 bytes; revision-qualified for mutable entities (§6.2, F-03, F-06)
      readonly liveTrackingKind?: 'pr.merged' | 'owner.answer' | 'owner.request';
      readonly payloadDigest: Sha256Digest;
      readonly structuredAttributes: Readonly<Record<string, unknown>>;
      readonly citations: readonly CitationV1[];
    }
  | {
      readonly kind: 'context_saturation'; // D19 / D25 event trigger for local dreaming resynthesis
      readonly hostId: CliHostId;
      readonly observedTokenRatio: number; // 0..1
      readonly throughOrdinal: number;
    };

/**
 * F-03 deterministic idempotency key derivation:
 * Maps any (sourceKind, sourceId) where sourceId is OpaqueRef (1..512 UTF-8 bytes, mcp-platform/src/memory/contracts.ts:107-111)
 * to a fixed 72-byte ASCII key `"idem:v1:" + sha256Hex(canonicalJcs({ sourceKind, sourceId }))` satisfying isValidIdempotencyKey (16..256 B, :114-118).
 */
export declare function deriveSessionFrontIdempotencyKey(input: {
  readonly sourceKind: string;
  readonly sourceId: OpaqueRef;
}): string;

/**
 * `new` (Lots `1-E1` & `1-E4`, N-01): Dedicated string predicate `/^wt:[0-9a-f]{64}$/` for worktree identifier fields
 * (`derivedWorktreeId`, `parentWorktreeId`), complementing object-level `validateWorktreeIdentity`
 * (`engram-live/contracts.ts:1180-1208`; `sentropic:packages/cluster-mesh/src/live-storage/registration.ts:166-181`),
 * which validates full `WorktreeIdentityDto` records (`cloneId`, `worktreeId`, `worktreePath`, `gitDir`, `identityUncertainty`).
 */
export declare function isValidWorktreeId(id: unknown): id is string;

export interface RawSessionEventEnvelope {
  readonly schemaVersion: 'engram.session-event/v1';
  /** 16..256 UTF-8 bytes; MUST equal `deriveSessionFrontIdempotencyKey({ sourceKind, sourceId })` (`72` ASCII bytes, F-03). */
  readonly idempotencyKey: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  /**
   * Canonical derived worktree entity id (`wt:<64 lowercase hex>`, §3, F-15, N-01):
   * MUST pass `isValidWorktreeId` (`/^wt:[0-9a-f]{64}$/`, `new` in `1-E1`/`1-E4`, matching `ID_PREFIXES.worktree` at `engram-live/contracts.ts:699`);
   * raw filesystem paths or non-`wt:<64hex>` strings are rejected (`INVALID_SCHEMA`) so zero host paths leak into D24 sync.
   */
  readonly derivedWorktreeId: string;
  readonly cloneId: string;
  /** D33 deterministic pseudonym (`sess_pseudo:<hex>`) derived from neutral sessionId under scope key (§5.1). */
  readonly sessionPseudoId: string;
  /** D33 deterministic pseudonym (`actor_pseudo:<hex>`) of the emitting human or NHI instance (§5.1). */
  readonly actorPseudoId: string;
  /** Verified mandate ref when bound; null triggers D16 proactive h2a analysis. */
  readonly mandateRef: H2AMandateEnvelope | null;
  /**
   * Dedicated capture purpose ref (`D11=dedicated`, §5.5):
   * `'memory.capture.session/v1'` for CLI session capture, `'memory.capture.hmi/v1'` for D30 external HMI input.
   */
  readonly purposeRef: 'memory.capture.session/v1' | 'memory.capture.hmi/v1';
  /** Host audit retention bound (`D13=host`, bounded by `computeRetentionDeadline` when `ContentPolicyV1` is finite, §5.3, F-15). */
  readonly retention: RetentionV1;
  readonly occurredAt: Instant;
  readonly payload: RawSessionEventPayload;
  readonly authorization: AuthorizationContextV1;
  readonly deadlineAt: Instant;
}

export interface RawSessionEventReceipt {
  readonly status: 'recorded' | 'duplicate_exact';
  readonly eventRecordId: string;             // Canonical raw_event identifier (`raw_<base32(recordDigest)>`)
  readonly recordDigest: Sha256Digest;
  readonly cursor: Cursor;
  readonly extractionDisposition: RawEventExtractionDisposition; // Initial 'pending_extraction' on 'recorded' (F-07)
  readonly syncState: 'synced' | 'queued-degraded' | 'local-only';
  /** Present and non-null whenever D17=degraded mode is active; surfaced across all 8 CLI hosts via operator-notices.ts + status-surface.ts (6A-H3). */
  readonly degradedBanner?: string;
  /** Ready context slice identifiers eligible for immediate non-blocking hook delivery (D15=slices). */
  readonly readySlices: readonly ('track' | 'git' | 'architecture' | 'rules' | 'memory')[];
  /**
   * Optional pre-rendered UTF-8 slice text keyed by `readySlices` entry (`M1`, `D15=slices`):
   * Enables `SessionStart` / `UserPromptSubmit` hooks in `h2a` (`1-H1`) to inject ready slices in one non-blocking round-trip
   * while the 7th MCP tool `engram_memory_context` remains disabled by default until `engram` + `sentropic` co-signature and `MCP-L5` (`Point 2B`).
   */
  readonly readySlicePayloads?: Partial<Record<'track' | 'git' | 'architecture' | 'rules' | 'memory', string>>;
  /** Set true when mandateRef === null so h2a schedules proactive role/rule analysis (D16). */
  readonly h2aProactiveRoleAnalysisQueued: boolean;
  /** Set true when D12=turn sweep or D19 saturation schedules asynchronous post-record extraction/dreaming. */
  readonly extractionSweepScheduled: boolean;
  readonly transactionReceiptDigest: Sha256Digest;
}

export type ExtractionBackendKind =
  | 'light-permanent-llm'
  | 'session-llm'
  | 'specialized-model';

export interface ExtractedCandidateItem {
  readonly localCandidateKey: string;
  /** D3 / D31 mandatory domain split: project (-> Track control & .track/) vs harness (-> h2a & .h2a/). */
  readonly domain: 'project' | 'harness';
  /**
   * Neutral template pin (Spec 0 §2.1 :149-154): (lineage, templateId, templateVersion, templateDigestSha256).
   * Required for all domain-typed candidates; zero closed list of Track or h2a types in engram (T-M-C).
   */
  readonly templateRef: OntologyTemplateEnvelopeRef;
  /** Open template-declared node or decision type id, validated against the registered ProfileBundleV1. */
  readonly candidateEntityTypeId: string;
  readonly candidateRelations: readonly {
    readonly relationTypeId: string;
    readonly targetRef: string;
    readonly attributes?: Readonly<Record<string, unknown>>;
  }[];
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly validTime: { readonly t: number; readonly t_end?: number };
  /** Grounded citations back to committed raw_event records and/or D6 file refs. */
  readonly sourceEventRecordIds: readonly string[];
  readonly citations: readonly CitationV1[];
  /** Live-tracking classification when extracted or reconciled from a live-tracking signal (§6). */
  readonly liveTrackingBinding?: {
    readonly eventKind: 'pr.merged' | 'owner.answer' | 'owner.request';
    readonly sourceId: OpaqueRef;             // Full 1..512 B sourceId preserved alongside derived 72 B idempotencyKey (F-03)
  };
}

export interface SessionExtractionProposalBatch {
  readonly schemaVersion: 'engram.session-extraction/v1';
  readonly idempotencyKey: string;            // 16..256 UTF-8 bytes (`idem:v1:<64hex>`)
  readonly tenantId: string;
  readonly workspaceId: string;
  /** Canonical `wt:<64 lowercase hex>` validated via `isValidWorktreeId` (F-15, N-01). */
  readonly derivedWorktreeId: string;
  readonly sessionPseudoId: string;
  /** Every referenced raw_event MUST already exist in engram and belong to `(tenantId, workspaceId)` (F-01, NOT_FOUND / 403). */
  readonly sourceEventRecordIds: readonly string[];
  readonly extractor: {
    readonly kind: ExtractionBackendKind;
    readonly modelOrAdapterId: string;        // Resolved via @sentropic/llm-mesh
    readonly extractionSemanticsVersion: string; // Pinned to EXTRACTION_SEMANTICS_VERSION (src/extraction-batch.ts)
    readonly llmMeshAttemptRef: string;       // Verifiable PreparedRouteAttempt.attemptRef (routing-contracts.ts:198, F-13)
  };
  readonly purposeRef: 'memory.capture.session/v1' | 'memory.capture.hmi/v1';
  readonly retention: RetentionV1;
  readonly candidates: readonly ExtractedCandidateItem[];
  readonly authorization: AuthorizationContextV1;
  readonly deadlineAt: Instant;
}

export interface RecordedExtractionOutcome {
  readonly localCandidateKey: string;
  readonly candidateId: string;
  readonly domain: 'project' | 'harness';
  /**
   * Initial post-extraction review status (`Point 5B`, `m1`):
   * - `domain === 'project'` ALWAYS enters `'proposed'` (`proposalDisposition: 'stays-proposed'`, `verdict: null`
   *   under the 5-state `engram-track.md:83-88,154-165` bijection in §2.3:
   *   `'proposed' | 'recorded-bounded-type' | 'promotion-draft-awaiting-third-party' | 'approved' | 'rejected'`)
   *   with `verdictAuthority: 'track'` and awaits an authoritative `TrackControlVerdict`.
   * - `domain === 'harness'` enters `'proposed'` unless a verified h2a mandate + master/overlay rule
   *   explicitly authorizes local overlay recording (`'accepted-harness-local'`, `D3`, `D4`, `D31`, `Point 4B`).
   */
  readonly reviewStatus: 'proposed' | 'accepted-harness-local';
  readonly verdictAuthority: 'track' | 'h2a';
  readonly recordDigest: Sha256Digest;
}

export interface SessionExtractionReceipt {
  readonly status: 'committed' | 'duplicate_exact';
  readonly batchCursor: Cursor;
  readonly outcomes: readonly RecordedExtractionOutcome[];
  readonly d7BlockedKeys: readonly string[];  // Candidates withheld by engram's D7 confidentiality deny-list
  /** Updated extractionDisposition per sourceEventRecordId (`proposed` | `empty_verified` | `withheld_d7`, F-07). */
  readonly sourceDispositions: Readonly<Record<string, Exclude<RawEventExtractionDisposition, 'pending_extraction'>>>;
  readonly transactionReceiptDigest: Sha256Digest;
}

export interface EngramSessionIngestFrontPort {
  readonly version: 1;
  recordSessionEvent(envelope: RawSessionEventEnvelope): Promise<Result<RawSessionEventReceipt>>;
  recordExtraction(batch: SessionExtractionProposalBatch): Promise<Result<SessionExtractionReceipt>>;
}
```

### 1.5 Normative First-Rank Execution Rules (`D12`, `D15`, `D16`, `D18`, `D30`)

1. **Strict Write-Before-Analysis Ordering & Scope Ownership (`D24`, `D32`, `F-01`):**
   - No extraction model, `Track` analyst, `h2a` role/rule analyst, or dormant dreaming pass may consume an unrecorded session turn, tool result, or GitHub input.
   - `recordExtraction` validates inside the storage transaction that every entry in `batch.sourceEventRecordIds` and `candidates[].sourceEventRecordIds` resolves to an already-committed `raw_event` in the **same `(tenantId, workspaceId)` / `scopeRef`**; cross-scope references fail closed with `UNAUTHORIZED` (HTTP `403` on `/memory/v1/session-front/extractions`), missing `eventRecordId` entries fail closed with `NOT_FOUND`, and every verified source `raw_event` transitions atomically from `'pending_extraction'` to `'proposed'`, `'empty_verified'`, or `'withheld_d7'` (`F-07`).
2. **8-Host CLI Parity & Hook Generators Added in Lot `1-H1` (`packages/h2a/src/hosts/plugin.ts:22-43,85-152,182-212`, `M1`, `B1`, `OQ-S1-4`):**
   - **Push-hook hosts (`claude`, `codex`, `gemini`, `hermes`, `opencode`):** Lot `1-H1` adds `new` `UserPromptSubmit` and `PostToolUse` hook generators in `packages/h2a/src/hosts/plugin.ts` alongside extended `Stop` (`h2a drumbeat record`), invoking `/memory/v1/session-front/ingest` (`deliveryPath: 'push-hook'`) synchronously at prompt send (`triggerTurnSweep: true`, `D12=turn`), tool completion, and stop boundaries while preserving all PR #455 (`844402ee`) `BridgeLock` / `mcp-central` / `h2a-bridge-shim.mjs` invariants (§8.3 `1-H1`).
   - **`vibe` (`packages/h2a/src/hosts/plugin.ts:135-150`):** Because `vibe` has no prompt-level receive hook (`receive: 'N-A'` at `:207`), Lot `1-H1` adds `new` `packages/h2a/hooks/vibe-post-tool.mjs` (`post_tool` → `tool_result` ingestion) and extends `packages/h2a/hooks/vibe-post-agent.mjs:1-29` + `h2a drumbeat record` so root sessions (`payload.parent_session_id === null`) extract and ingest full speech-turn pairs + `D12=turn` sweep (`deliveryPath: 'post-agent-hook'`).
   - **Poll-path hosts (`agy` `:107-113`, `muse` `:128-134` — `OQ-S1-4`, *answered by h2a, 2026-11-15*):** When `agy` or `muse` runs inside an `h2a-runtime` PTY seat (`packages/h2a-runtime/src/delegate.ts:758-810`) writing to `session-db`, `SessionDbFallbackCursor` polls at a nominal **`5_000 ms` interval bounded to `[1_000 ms, 30_000 ms]`** (`deliveryPath: 'poll-scan'`). Because standalone `agy` and `muse` CLI sessions (`push: false`) launched outside an `h2a-runtime` seat do not natively write transcripts into `cluster-mesh` `session-db`, Lot `1-H1` **also** triggers an immediate opportunistic flush (`deliveryPath: 'mcp-opportunistic'`) on every MCP tool call (`h2a registry-bridge serve` / `mcp-central`), on `SessionStart` and `PreToolUse` (`plugin.ts:22-43`), and on `h2a drumbeat scan`, under identical `deriveSessionFrontIdempotencyKey` (`(sessionId, entryId, ordinal)`) idempotency.
   - **Shared 8-Host Degraded Banner Surface (`B1`):** All 8 hosts render `degradedBanner` exclusively through `packages/h2a/src/hosts/operator-notices.ts:1-24` + `packages/h2a/src/hosts/status-surface.ts` (`new` in `Spec 6A` Lot `6A-H3`), never reviving `packages/h2a/src/runtime/memory/*.ts` retired by `6A-H2`.
3. **Send-Time Promotion Sweep (`D12=turn`) and `session_summary` Thresholds (`OQ-S1-1`, *answered by sentropic, 2026-11-14; confirmed by h2a/Track, 2026-11-15*):**
   - Whenever `speech_turn.triggerTurnSweep === true` (every outbound send, superseding `per-mode`, `R15-SEDIMENT.md:57`), `engram` commits the `raw_event` immediately, returns `extractionSweepScheduled: true`, and enqueues the §2 extraction + `D4` mandate-gated admission sweep on `cluster-mesh`'s bounded async extraction queue (`F-08`) over all `'pending_extraction'` `raw_event` records through that cursor.
   - Rolling `session_summary` (`context_summary`) compaction triggers whenever uncompacted turns reach **`turnCountThreshold = 24` turns** or **`byteBudgetThreshold = 65_536` UTF-8 bytes** (matching the `64 KiB` frame ceiling), as well as immediately on `context_saturation` and at session close, with both thresholds configurable per `policyProfile`.
4. **Non-Blocking Slice Injection (`D15=slices`, `M1`) and Pass-Through Read-Only Mode (`D18=readonly`):**
   - Hook activation never blocks waiting for full-model convergence or asynchronous extraction (`D15=slices`, `R15-SEDIMENT.md:60`); `readySlices` reports whichever of `track`, `git`, `architecture`, `rules`, and `memory` satisfy their freshness/authorization gates right now, and `readySlicePayloads` carries optional pre-formatted UTF-8 slice text so `SessionStart` / `UserPromptSubmit` hooks inject ready slices in a single non-blocking round-trip while `engram_memory_context` remains gated behind `Point 2B` (`engram` + `sentropic` co-signature and `MCP-L5`).
   - A session without a verified memory identity (`D18=readonly`, `R15-SEDIMENT.md:63`) is refused on `recordSessionEvent` / `recordExtraction` (`UNAUTHORIZED`) and receives only the allowed non-memory slices (`track`, `git`, `architecture`, `rules`) read-only under a recorded policy, with zero memory content disclosed.
5. **Unassigned-Role Proactive `h2a` Trigger (`D16`):**
   - When `mandateRef === null`, `recordSessionEvent` records the raw event under the verified workspace principal (if authorized for capture) and sets `h2aProactiveRoleAnalysisQueued: true`, emitting a workspace-scoped signal on `cluster-mesh` so `h2a` proactively analyzes recorded activity and proposes a standard role and overlay rules (`comments-2026-11-08.md:2`; `Point 4B`: `engram` never writes roles itself).

### 1.6 Degraded Mode (`D17=degraded`, `Spec 6A §2.4 :399-416`, `F-02`, `B1`, `N-02`)

`D17=degraded` (`R15-SEDIMENT.md:62`: *"A session may start when the context service does not answer. Work continues in signalled degraded mode, with a banner and a log"*) governs two distinct fault modes without ever introducing a shadow memory JSONL queue in `~/.h2a/` or `.track/`:

| Fault Mode | Normative Behaviour | Banner & Audit Requirement |
| :--- | :--- | :--- |
| **Mode A — Remote Sentropic / context service unreachable; local `embedded-local` `cluster-mesh` SQLite healthy** | `compose/memory` executes the §1.2 two-kernel sequential commit locally: **(1)** `session-db.entries.append` (`ordinal`) on the `'session-db'` `SqliteKernel`, then **(2)** one fenced `SqliteKernel.commit(...)` transaction (`engram-memory/module-storage-neutral.ts:42,103,224-230`) on `'engram-memory'` writing `raw_event`, bounded `turn_text`, `lastIngestedOrdinal`, **and** `cluster-mesh`'s neutral L3a `scope-outbox-v1` (`memory-projection-outbox`). Returns `status: 'recorded'`, `syncState: 'queued-degraded'`. Drained transactionally via `Spec 6B` once remote connectivity returns (`D24`, `Point 6A`, subject to `ContentPolicyV1`). | Sets non-null `degradedBanner` (`ClusterMeshMemoryHealthStatus.userVisibleBanner`, `engram-cluster-mesh.md:107-115`), writes daemon health marker read on-demand across all 8 CLI hosts via `operator-notices.ts` + `status-surface.ts` (`Spec 6A :410, 761`, Lot `6A-H3`), and emits structured log `memory.access.degraded_entered`. |
| **Mode B — Local `embedded-local` `SqliteKernel` unavailable or writer fence lost (`FENCE_LOST` / `STORE_UNAVAILABLE`), or hosted store unavailable** | `/memory/v1/session-front/ingest` and `/memory/v1/hmi/input` return HTTP `503` (`ClusterMeshMemoryDegradedError`, `Spec 6A :412`). **(a) CLI sessions (`h2a`):** `h2a` fails the memory call closed immediately, creates **zero** secondary memory JSONL store in `~/.h2a/` or `.track/` (`Spec 6A :412, 777`), records a lightweight non-memory **ordinal replay marker** alongside its native drumbeat/session state carrying `(sessionId, branchEpoch, pendingFromOrdinal)` plus `mandate_binding` digest/ref and `context_saturation` `{ observedTokenRatio, throughOrdinal }` metadata (`F-02`), and lets the CLI session proceed in signalled degraded mode. Upon kernel recovery, catch-up replays `ordinal > lastIngestedOrdinal` plus any pending `mandate_binding` / `context_saturation` markers under `deriveSessionFrontIdempotencyKey` (`duplicate_exact` on already-committed events). **(b) Hosted GitHub ingress (`forge`):** the webhook receiver returns HTTP `503` so GitHub schedules webhook redelivery, backed up by `pr-sync` REST polling (`PullRequestFactDto`, §6.1). | Displays mandatory user-visible degraded banner on all 8 CLI hosts (`claude`, `codex`, `gemini`, `agy`, `hermes`, `opencode`, `muse`, `vibe`) via `operator-notices.ts` + `status-surface.ts` (`6A-H3`) and logs `memory.access.degraded_entered` + `memory.access.degraded_ingest_refused`. |

---

## 2. Post-Recording Extraction Pipeline (`recordExtraction`, `T-M-C`, `Point 5B`, `0.24.0` Toolkit)

### 2.1 Pluggable Extraction Strategy Over `@sentropic/llm-mesh`

Per `comments-2026-11-08.md:19` (`« Il faut oeut etre en permanence un deuxiemme llm light d extraction ou reposer sur le llm de session pour les decisions a terme pkoi pas des modeles deeplearninf specialises. »`) and `Spec 6A §2.5` (`:424-426`), `engram` defines a neutral, model-agnostic `SessionExtractionStrategyPort` (*does not exist yet at `f9dc84f7`*; added in `src/session-extraction-adapter.ts` in Lot `1-E3`) whose runtime inference adapter on the `cluster-mesh` host (`Lot 1-S2`) routes **exclusively** through `@sentropic/llm-mesh` (`>=0.38.0 <0.39.0`: `LlmMesh.generate` in `sentropic:packages/llm-mesh/src/mesh.ts:49-54` with `VerifiedRoutingSubject` in `routing-contracts.ts:13-17` and `PreparedRouteAttempt` usage metering in `:190-222`, or `DecisionClient` from `@sentropic/llm-mesh/decision` in `sentropic:packages/llm-mesh/src/decision/index.ts:6-9`):

```ts
// status: proposed — Neutral extraction strategy port (@sentropic/engram/extraction-batch)
export interface SessionExtractionSliceInput {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly derivedWorktreeId: string;
  readonly sessionPseudoId: string;
  readonly rawEvents: readonly CommittedRawSessionEventView[]; // Resolved from engram + authorized session-db citations
  /** Active template bundles for this workspace: repo-pinned Track bundle (track.ontology.yaml) + h2a bundle. */
  readonly activeTemplateBundles: readonly {
    readonly domain: 'project' | 'harness';
    readonly templateRef: OntologyTemplateEnvelopeRef;
    readonly profileBundleJson: string;       // Canonical ProfileBundleV1 (schema: "engram.profile-bundle/v1")
  }[];
  readonly d6ContentAuthorized: boolean;      // False => model sees D6 path+fingerprint refs only, zero raw file excerpts
}

export interface SessionExtractionStrategyPort {
  readonly backendKind: ExtractionBackendKind; // 'light-permanent-llm' | 'session-llm' | 'specialized-model'
  readonly adapterId: string;
  extractSlice(input: SessionExtractionSliceInput): Promise<Result<SessionExtractionProposalBatch>>;
}
```

| `backendKind` | Execution Path & Horizon | How It Connects to `0.24.0` Toolkit & `@sentropic/llm-mesh` (`F-12`, `F-13`, `OQ-S1-1`) |
| :--- | :--- | :--- |
| `'light-permanent-llm'` | **Now (default asynchronous/turn worker):** dedicated low-latency model running alongside the session at each `D12=turn` sweep (`policyProfile: 'mesh-fast'`, `intent: 'fast'`). | Wraps `LlmMesh.generate` (`policyProfile: 'mesh-fast'`, `intent: 'fast'`, `routing-contracts.ts:59,70`) via pure `adaptTextJsonClient` (`src/extraction-batch.ts:751-828` over `src/llm-json-port.ts`) and executes `extractDocumentBatch` (`:2956`), stamping `PreparedRouteAttempt.attemptRef` (`:198`). |
| `'session-llm'` | **Now (`RoutePlanInput` model/affinity policy inside `cluster-mesh`, `F-13`):** reuses `requestedModel` and `affinityKey` in `RoutePlanInput` (`routing-contracts.ts:54-75`) under `VerifiedRoutingSubject` **solely inside `@sentropic/llm-mesh` on `cluster-mesh`** — never passing a host SDK client to `engram` and never importing `engram` in `chat-server` (`G-FENCE`). | Executes inside `cluster-mesh` (`1-S2`), emits a verifiable `PreparedRouteAttempt.attemptRef` (`routing-contracts.ts:197-206`), and feeds structured `EXTRACTION_SCHEMA_V1` (`"engram_extraction_v1"`, `src/extraction-batch.ts:251`) JSON through `validateAndPruneChunkExtraction` (`:1338-1608`), `processCitationsForItem` (`:1279-1336`), and `mergeExtractionsWithCitationsPrepared` (`:2724`). |
| `'specialized-model'` | **Later (evolution slot):** domain-tuned sequence/graph deep-learning extractors or `DecisionClient` (`@sentropic/llm-mesh/decision`) evaluators. | Implements `SessionExtractionStrategyPort` via `@sentropic/llm-mesh` / `@sentropic/llm-mesh/decision` and emits the exact same `EXTRACTION_SCHEMA_V1` + `CitationV1` bundle into `mergeExtractionsWithCitations` without altering `recordExtraction`, storage, or `Track`/`h2a` contracts. |

### 2.2 Reuse of the `0.24.0` Extraction Toolkit (`CHANGELOG.md:39-44`)

*(Note on line anchor: `PLAN_SPEC_ENGRAM_FRONT.md:172` cites `CHANGELOG.md:19` from an earlier release; on current `0.28.0` `docs/memory-r15-sediment`, the `0.24.0 (2026-11-07)` extraction-toolkit entry is at `CHANGELOG.md:39-44`, specifically `:41`.)*

Every `SessionExtractionStrategyPort` implementation reuses the shipped `@sentropic/engram/extraction-batch` and `@sentropic/engram/profile-bundle` pipeline rather than inventing a parallel extractor:
1. **Bundle Re-validation & Profile Derivation:** For each active lineage (`track` from `track.ontology.yaml` per `Spec 0 §7.1.1 :930-933`, and `h2a`), the worker re-validates `ProfileBundleV1` (`schema: "engram.profile-bundle/v1"`, `registriesMode: "full"` in `src/profile-bundle.ts:14, 30-41, 560-565`) via `revalidateFullBundleAndRederiveProfile` (`src/extraction-batch.ts:431-642`) and checks that `bundle.profileHash` matches `templateRef.templateDigestSha256`.
2. **Deterministic Coverage & Idempotent Caching:** Slice extraction keys are computed deterministically via `computeExtractionKey` / `getOrExtract` (`src/extraction-batch.ts:98-105`) over `(rawEventDigests, templateDigestSha256, EXTRACTION_SEMANTICS_VERSION, d6ContentAuthorized)` and tracked via `checkCoverageGate` / `transitionCoverageRecord` (`:112-113`), preventing redundant LLM invocations on replayed turns.
3. **Chunk Validation, Grounding, and Citation Merge:**
   - Candidate nodes and relations are validated against the template's `NormalizedOntologyProfile` (`validateAndPruneChunkExtraction`, `src/extraction-batch.ts:1338-1608`).
   - Every candidate item is stamped with `CitationV1` locators (`processCitationsForItem`, `:1279-1336`); when `d6ContentAuthorized === true`, verbatim quotes are verified with `verifyVerbatim` (`src/source-grounding.ts:316`), and when `d6ContentAuthorized === false` (`D6=refs`), citations carry only `(SessionDbCitationTuple | D6FileOrPathRef)` digests with empty quote text.
   - Multi-turn or chunked extractions merge through `mergeExtractionsWithCitations` / `mergeAcceptedChunksPrepared` (`src/extraction-batch.ts:54, 152, 2724`), surfacing explicit conflict diagnostics rather than silently dropping competing assertions.

### 2.3 Strict `T-M-C` and `Point 5B` Proposal Lifecycle

When `EngramSessionIngestFrontPort.recordExtraction` receives a `SessionExtractionProposalBatch`:

1. **`engram` Metamodel + `D7` Gate Only (`OWNER-DECISIONS-2026-11-14.md:13, 21, 25`):**
   - `engram` verifies: (a) all `sourceEventRecordIds` exist in canonical `engram` storage, (b) `templateRef` (`{ lineage, templateId, templateVersion, templateDigestSha256 }`) resolves in `engram`'s lineage registry (`Spec 0 §2`), (c) `candidateEntityTypeId`, `attributes`, and `candidateRelations` are metamodel-well-formed against that exact registered `ProfileBundleV1`, and (d) no attribute, label, or citation matches `engram`'s `D7` confidentiality deny-list (§5.2; matching items are withheld and reported in `d7BlockedKeys`).
   - **`engram` never embeds a closed enum of `Track` types, states, or `D1` bounded-list names**, and **never mutates or repairs** a non-conforming proposal.
2. **Project-Domain Proposals Stay `proposed` Until `Track` Verdict & Unified 5-State `reviewStatus` Bijection (`Point 5B`, `m1`, `spec/memory/contracts/engram-track.md:83-88,154-165`):**
   - Every candidate with `domain: 'project'` (`templateRef.lineage === 'track'`) adopts the exact 5-state `reviewStatus` union ratified in `spec/memory/contracts/engram-track.md:83-88,154-165`:
     `'proposed' | 'recorded-bounded-type' | 'promotion-draft-awaiting-third-party' | 'approved' | 'rejected'`.
   - At extraction time (`recordExtraction`), every project-domain candidate enters `reviewStatus: 'proposed'` (`verdict: null`, `proposalDisposition: 'stays-proposed'`, `verdictAuthority: 'track'`, `engram` substrate state `pending` via `PendingControlV1` in `engram-memory/contracts/index.ts:509-521`).
   - While in `reviewStatus: 'proposed'` or `'promotion-draft-awaiting-third-party'`, the candidate is **invisible** to `accepted_current` recall, `BoundedCurrentProjectionV1` / `graph.json` (`engram-memory/bounded-projection.ts:24-27, 74-86`), and per-PR `.track/` serialization (`Point 1B`), whereas the underlying `raw_event` is already durable in `engram`.
   - Only when the `Track` application evaluates its own rules (`D1=borne-review` bounded-list check vs third-party promotion review, `D4` mandate scope, template state transitions via `« api type jev/decison »`, fast LLM, or control agent per `D32`) and submits an authoritative `TrackControlVerdict` (`verdictAuthority: 'track'`) via **`POST /memory/v1/control/verdicts`** (`Spec 6A :227, 777`) does `engram` record the verdict and transition the item according to the exact 1-to-1 bijection in `engram-track.md:154-165`:

   | `verdict` (`verdictAuthority: 'track'`) | `proposalDisposition` | Unified `reviewStatus` (`Spec 1` & `engram-track.md:83-88,154-165`) | `engram` Substrate State (`MemoryRecordV2` / `LifecycleEventV2`) |
   | :--- | :--- | :--- | :--- |
   | `null` *(no `Track` verdict recorded yet)* | `'stays-proposed'` | `'proposed'` | `pending` (excluded from `accepted_current` recall & `.track/` PR slice) |
   | `'allow'` | `'accepted'` | `'recorded-bounded-type'` | `accepted_current` (`D1` bounded-list write authorized directly by `Track` control) |
   | `'flag-for-borne-review'` | `'stays-proposed'` | `'promotion-draft-awaiting-third-party'` | `pending` (`D1=borne-review` promotion draft awaiting authorized third party; excluded from accepted state) |
   | `'flag-for-borne-review'` | `'accepted'` | `'approved'` | `accepted_current` (`D1=borne-review` promotion draft approved by an authorized third party, never its author) |
   | `'block'` | `'refused'` | `'rejected'` | `rejected` (refused by `Track` control or third-party review) |

   *(Lifecycle supersession of an already admitted `accepted_current` record appends a `LifecycleEventV2` `supersedes` transition to substrate state `historical` without adding a sixth `reviewStatus` literal.)* `engram` records `Track`'s verdict verbatim and never overrides it; `cluster-mesh` sync never overwrites a `Track`-controlled record (`Point 6A`).
3. **Harness-Domain Proposals (`D3=mandated`, `D4=mandate`, `D31`, `Point 4B`):**
   - Every candidate with `domain: 'harness'` (`templateRef.lineage === 'h2a'`) is routed outside `Track` serialization (`D3`) under harness `reviewStatus: 'proposed' | 'accepted-harness-local' | 'rejected'`.
   - Master-harness or role-definition proposals remain `reviewStatus: 'proposed'` (`verdictAuthority: 'h2a'`, `Point 4B`: *"engram may propose role changes, never write them"*). Developer/workspace/worktree overlay rules explicitly authorized by a verified `H2AMandateEnvelope` (`D3=mandated`, `D4=mandate`) and tighten-only overlay rules (`Spec 0 §4.4`) transition to `'accepted-harness-local'` (`accepted_current`) for `.h2a/overlays/*` Git serialization (`D31`, `D34`).

#### 2.3.1 Actual `engram` (`f9dc84f7`) Provider-SDK State, Subpath Isolation, Peer Range, and `'session-llm'` Under `G-FENCE` (`F-12`, `F-13`)

1. **Verified `engram` Code State at Commit `f9dc84f7` (`[FACT: engram:file:line]`):**
   - `package.json:145-165` currently declares direct runtime `dependencies` on `@ai-sdk/anthropic` (`:146`), `@ai-sdk/cohere` (`:147`), `@ai-sdk/google` (`:148`), `@ai-sdk/mistral` (`:149`), `@ai-sdk/openai` (`:150`), `ai` (`:153`), and `mistral-ocr` (`:161`), and pins `@sentropic/llm-mesh` to `"^0.19.0"` (`:152`) — predating `@sentropic/llm-mesh/decision` (`0.38.0` in `sentropic:packages/llm-mesh/package.json:3,38-45`).
   - `@sentropic/engram/llm-mesh` (`src/llm-mesh.ts:12`) currently re-exports `textClientToCallLlm` from `src/llm-execution.ts:142`, and `@sentropic/engram/extraction-batch` (`src/extraction-batch.ts:74-78`) imports `parseJsonFromLlmText` and `TextJsonGenerationClient` from `src/llm-execution.ts`.
   - `src/llm-execution.ts` reads `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`, and `COHERE_API_KEY` (`:246-266`), mutates `process.env.GOOGLE_GENERATIVE_AI_API_KEY` (`:278-280`), and dynamically imports `@ai-sdk/*` (`:340-365`) and `"ai"` (`:508`); standalone corpus helpers `src/node-descriptions.ts:848-866`, `src/community-labeling.ts:407-425`, and `src/pdf-ocr.ts:91,187` likewise import `@ai-sdk/*` / `mistral-ocr` and read `*_API_KEY`.
2. **Normative Subpath Isolation & Optional Peer Pin (`F-12`, Lots `1-E2` / `1-E3`):**
   - Pure JSON/port helpers (`parseJsonFromLlmText`, `TextJsonGenerationClient`, `textClientToCallLlm`) are extracted into a zero-dependency, zero-`process.env` module **`src/llm-json-port.ts`** (*does not exist yet at `f9dc84f7`*).
   - **Every** subpath consumed by `cluster-mesh` (`./session-front-contracts`, `./extraction-batch`, `./profile-bundle`, `./llm-mesh`, `./memory-substrate`, `./mcp-memory`, `./metamodel`) — including any shared `dist/` chunk emitted under `tsup.config.ts:79` (`splitting: true`) — MUST have **zero direct or transitive imports** to `src/llm-execution.ts`, `src/node-descriptions.ts`, `src/community-labeling.ts`, `src/pdf-ocr.ts`, `@ai-sdk/*`, `ai`, `mistral-ocr`, or any `process.env.*_API_KEY` read/mutation, verified mechanically by an import-graph + compiled-chunk AST test in `1-E2`/`1-E3`.
   - `@sentropic/llm-mesh` moves out of `dependencies` (`package.json:152`) into optional `peerDependencies` **`">=0.38.0 <0.39.0"`** (`peerDependenciesMeta: { "@sentropic/llm-mesh": { "optional": true } }`, externalized in `tsup.config.ts`) so `@sentropic/llm-mesh/decision` (`DecisionClient`) resolves against the single host `llm-mesh` instance without duplication.
3. **`'session-llm'` Locked Inside `@sentropic/llm-mesh` Under `G-FENCE` (`F-13`, `OQ-S1-1` / `sentropic` `OQ-S1-2`):**
   - Default extraction routing (`'light-permanent-llm'`) uses `policyProfile: 'mesh-fast'` (`intent: 'fast'`).
   - `'session-llm'` is authorized **exclusively** as a `RoutePlanInput` model/affinity policy (`requestedModel` + `affinityKey` under `VerifiedRoutingSubject` + `RouteUsageCeiling` in `sentropic:packages/llm-mesh/src/routing-contracts.ts:13-17,54-91`) executed **inside `@sentropic/llm-mesh` on the `cluster-mesh` side** (`Lot 1-S2`), producing a verifiable `PreparedRouteAttempt.attemptRef` (`:197-206`) and `RouteMeteringSink` settlement (`chat-mesh` Lot `C2a`). Passing a raw host provider SDK client into `engram` or importing `engram` / `cluster-mesh` inside `@sentropic/chat-server` (`G-FENCE`, `SPEC_EVOL_CHAT_MESH_PROPOSAL.md:89,360-369`) is **strictly forbidden**.

---

## 3. Derived Git Worktree Graph Entities (`D21`) and Binding to `engram-live`

### 3.1 Retiring Flat Path Aliasing (`D21`) Over Verified `engram-live` Primitives

Owner principle `D21` (`spec/memory/R15-SEDIMENT.md:66, 102-104`) permanently retires flat path aliasing (`worktree=alias`): every Git checkout—main checkout, `git worktree add` linked worktree, or detached `h2a` job worktree (`.h2a/jobs/<jobId>/wt` in `h2a:packages/h2a-runtime/src/delegate.ts:798-810`)—is modelled in `engram` as a first-class **`derived_worktree`** graph entity retaining its parent origin link, branch and working-tree state, and attached session logs.

Spec 1 binds `derived_worktree` directly to `@sentropic/engram-live` without violating any `SPEC_LIVE_GIT_INDEXING` safety or activation invariant:
- **Shared Canonical Identity Derivation (`engram-live/registration.ts:312-411`):**
  - `deriveCloneIdentity` (`:312-360`) hashes `(hostScope, normalizedCommonDirRealpath, commonDirProjectFingerprint)` into `cloneId` (`clone:<sha256>`). Linked worktrees sharing one Git `commondir` (`engram-live/worktree.ts:247-253, 336`) resolve to the **same** `cloneId`, whereas two separate clones with equal `ws:` root-commit hashes (`h2a:packages/h2a/src/runtime/identity/workspace-id.ts:41-48`) remain distinct (`SPEC_LIVE_GIT_INDEXING.md:230`).
  - `deriveWorktreeIdentity` (`engram-live/registration.ts:369-411`) hashes `(hostScope, gitDir)` under `cloneId` into `worktreeId` (`wt:<64 lowercase hex>`). Spec 1 uses this exact `worktreeId` as `derivedWorktreeId`: full `WorktreeIdentityDto` records validate via `validateWorktreeIdentity` (`engram-live/contracts.ts:699,1180-1208`; `sentropic:packages/cluster-mesh/src/live-storage/registration.ts:27-31,166-181`), while standalone string fields `derivedWorktreeId` and `parentWorktreeId` enforce the dedicated string predicate `isValidWorktreeId` (`/^wt:[0-9a-f]{64}$/`, `new` in Lots `1-E1`/`1-E4`, `F-15`, `N-01`) at runtime admission, guaranteeing that raw host filesystem paths never enter `D24` replication. *(Note: `engram-live/derived-worktree-graph.ts` does not exist yet at `f9dc84f7` and is introduced in Lot `1-E4`.)*
- **Preservation of Explicit Live Activation (`SPEC_LIVE_GIT_INDEXING` `A01` `:315`, `classifyLifecycleEvent` in `engram-live/registration.ts:468-475`):**
  - Opening an `h2a` session and recording a turn via `recordSessionEvent` computes `(cloneId, derivedWorktreeId)` purely and deterministically (`liveIndexingState: 'unactivated'`) and creates/updates the `derived_worktree` node in `engram` **without** implicitly starting background `engram-live` filesystem watchers or `Reconciler` loops (`engram-live/reconcile.ts:95-145`).
  - When explicit live indexing is activated (`WorkspaceDeclarationDto` with `liveCapability: "live"` in `engram-live/contracts.ts:243-258`, `createLiveDeclaration` in `engram-live/registration.ts:155-185`), `engram-live` attaches `declarationId` (`decl:<sha256>`, `:421-445`), `StableCapture` index/worktree digests (`engram-live/worktree.ts:104-117, 302-352`), ref observations, and `publishedGenerationId` (`gen:<10 digits>`, `engram-live/contracts.ts:371-375`) to the **exact same `derivedWorktreeId`**.

### 3.2 Normative `DerivedWorktreeNodeV1` and Graph Relation Schema

```ts
// status: proposed — D21 Derived Git worktree graph node & relations
export type WorktreeOriginKind =
  | 'main-checkout'
  | 'linked-worktree'
  | 'h2a-job-worktree'
  | 'detached-checkout';

export interface DerivedWorktreeParentOriginV1 {
  readonly parentCloneId: string;             // Canonical clone:<64 lowercase hex> from deriveCloneIdentity
  /** Present when spawned from a parent worktree; MUST pass `isValidWorktreeId` (`/^wt:[0-9a-f]{64}$/`, F-15, N-01). */
  readonly parentWorktreeId?: string;
  readonly originKind: WorktreeOriginKind;
  readonly baseRefName?: string;              // e.g. 'refs/heads/main' or parent feature branch at creation
  readonly baseCommitOid?: { readonly algorithm: 'sha1' | 'sha256'; readonly oid: string };
  readonly durableWorkspaceFingerprint?: string; // Preserved h2a `ws:<sha256>` (workspace-id.ts:41-48)
  /** Aligned verbatim with shipped `IDENTITY_UNCERTAINTY_STATES` (`engram-live/contracts.ts:674`; `sentropic:packages/cluster-mesh/src/live-storage/registration.ts:161,179,188`, N-01). */
  readonly identityUncertainty: readonly ('missing_history' | 'shallow_history')[];
}

export interface DerivedWorktreeGitStateV1 {
  readonly headOid: { readonly algorithm: 'sha1' | 'sha256'; readonly oid: string } | null;
  readonly symbolicBranchRef: string | null;  // e.g. 'refs/heads/docs/memory-r15-sediment'; null when detached
  readonly detached: boolean;
  readonly indexDigest?: Sha256Digest;        // Mapped from StableCapture.indexDigest (engram-live/worktree.ts:113)
  readonly workingTreeFingerprint?: Sha256Digest;
  readonly dirtyState: 'clean' | 'staged-only' | 'dirty' | 'conflicted' | 'unknown';
  readonly liveIndexingState: 'unactivated' | 'bootstrap' | 'current' | 'partial' | 'stale' | 'degraded';
  readonly liveDeclarationId?: string;        // decl:<sha256> when liveCapability === 'live'
  readonly livePublishedGenerationId?: string; // gen:0000000001.. (engram-live/contracts.ts:371)
  readonly observedAt: Instant;
}

export interface DerivedWorktreeNodeV1 {
  readonly nodeType: 'derived_worktree';
  readonly derivedWorktreeId: string;         // Canonical wt:<sha256> (engram-live/registration.ts:398)
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly cloneId: string;                   // Canonical clone:<sha256>
  /**
   * D33 + D6 path representation: opaque scoped pseudonym / relative label;
   * raw absolute host realpath NEVER leaves the local host (SPEC_LIVE_GIT_INDEXING.md:230).
   */
  readonly worktreePathRef: D6FileOrPathRef;
  readonly parentOrigin: DerivedWorktreeParentOriginV1;
  readonly gitState: DerivedWorktreeGitStateV1;
  /**
   * Supports R1 private object retention after branch deletion or .h2a/jobs/<jobId>/wt cleanup
   * (h2a:packages/h2a-runtime/src/delegate.ts:765-781; SPEC_LIVE_GIT_INDEXING.md:116, 316).
   */
  readonly lifecycleState: 'active' | 'detached-idle' | 'removed-retained' | 'revoked-private-purged';
  readonly r1RetentionReceiptId?: string;
  /** Relative Git/worktree overlay path per Spec 0 §7.2.4 (:981): `.h2a/overlays/worktrees/{derivedWorktreeId}.json` (local untracked overlays stay worktree-isolated per OQ-S1-5). */
  readonly harnessOverlayRelPath: string;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}
```

**Owner-Report Non-Projection Invariant (`m2`, `G7`/`G8`/`G9`):**
`derivedWorktreeId` (`wt:<64hex>`), `cloneId` (`clone:<64hex>`), `actorPseudoId` (`actor_pseudo:<64hex>`), `sessionPseudoId` (`sess_pseudo:<64hex>`), and `Sha256Digest` values carry 64-character lowercase hexadecimal digests. They MUST remain strictly confined to technical graph/journal metadata and `.h2a/overlays/worktrees/{derivedWorktreeId}.json`, and MUST NEVER be copied into owner-rendered `.track/` text fields (`title`, `body`, `summary`, `Link.label`, `nextAction`, `DemandRaw.text`), preserving `@sentropic/track` owner-report language and redaction invariants (`h2a:packages/track/src/report/{format.ts:889-921,friendly.ts:1-60,audit.ts:1-65,owner-report-language.test.ts:1-65}`).

**First-Class Graph Edges Anchored on `derived_worktree`:**

| Relation Type | `Source → Target` | Provenance & Privacy Invariant |
| :--- | :--- | :--- |
| `derived_from_clone` | `derived_worktree → git_clone` | Links linked/job worktrees to their shared `commondir` repository clone (`engram-live/registration.ts:369-411`). |
| `branched_from_worktree` | `derived_worktree → derived_worktree` | Retains parent checkout lineage when an `h2a` job or secondary worktree forks from an existing worktree (`D21`). |
| `pinned_at_head` / `tracks_branch` | `derived_worktree → git_commit` / `git_ref` | Binds worktree state to `engram-live` `Commit` and `RefObservation` entities (`SPEC_LIVE_GIT_INDEXING.md:81-82`). |
| `has_worktree_snapshot` | `derived_worktree → worktree_snapshot_envelope` | Carries metadata/digests only in shared/remote projections; local uncommitted hunks stay locally encrypted under `KeyProviderPort` (`engram-live/content-policy.ts:46-51`, `SPEC_LIVE_GIT_INDEXING` `Q2 B` / `Q6 A`) and are purged on `revokeLiveDeclaration` (`engram-live/registration.ts:268-298`). |
| `has_session_log` / `recorded_in_worktree` | `derived_worktree → session_log` and `raw_event → derived_worktree` | Attaches every `sessionPseudoId` session log and `raw_event` directly to the worktree in which it executed (`D21`), surviving worktree removal when `r1RetentionReceiptId` holds (`R1`). |
| `governed_by_worktree_overlay` | `derived_worktree → harness_overlay` | Binds `.h2a/overlays/worktrees/{derivedWorktreeId}.json` (`D31`, `Spec 0 :981`). |

```mermaid
flowchart TD
    CL["git_clone (clone:<sha256>)"]
    WT_MAIN["derived_worktree (main checkout · wt:<sha256>)"]
    WT_LINK["derived_worktree (linked / h2a job · wt:<sha256>)"]
    COMMIT["git_commit / git_ref (engram-live HEAD & branch)"]
    SNAP["worktree_snapshot_envelope (indexDigest + Q2 B local-sealed diff)"]
    SESS["session_log (sess_pseudo:<hex>)"]
    TURN["raw_event / session_turn (SessionDbCitationTuple)"]
    OVL["harness_overlay (.h2a/overlays/worktrees/{id}.json)"]

    WT_MAIN -->|"derived_from_clone"| CL
    WT_LINK -->|"derived_from_clone"| CL
    WT_LINK -->|"branched_from_worktree"| WT_MAIN
    WT_LINK -->|"pinned_at_head / tracks_branch"| COMMIT
    WT_LINK -->|"has_worktree_snapshot"| SNAP
    WT_LINK -->|"has_session_log"| SESS
    TURN -->|"recorded_in_worktree"| WT_LINK
    WT_LINK -->|"governed_by_worktree_overlay"| OVL
```

---

## 4. Decision-Dossier Learning Exchanges (`D27=decision-only`, `D3`, `D31`)

### 4.1 Verified Code Alignment with `Track`, `Focus`, and `h2a` Decision Dossiers (`M2`, `B1`)

In `h2a` (`origin/main` `1f57127de`), decision dossiers span two distinct provenance regimes that MUST NEVER be conflated (`M2`, `B1`):
- **`Track` Decision & Dossier Model (`h2a:packages/track/src/model/decision.ts:11-115`):**
  - `DecisionKind = Gate` (`'orientation' | 'commitment'`, `:11`), `Outcome` (`'pending' | 'go' | 'no-go' | 'deferred'`, `:12`), and `DecisionState` (`:97-115`: `{ id, kind: 'decision', title, workspace, realization, decisionKind, targets: ItemId[], outcome, dossier, ... }`);
  - `Option` (`:14-21`: `{ id, title, summary, pros?, cons?, questionId? }`, grouped per `questionId` in `packages/focus/src/track/index.ts:169-197`), `QAEntry` (`:23-31`: `{ id, question, answer?, context?, readingTimeMinutes?, recommendedOptionId?, recommendedAnswer? }`, mapped in `packages/focus/src/track/index.ts:212-224`), and `Dossier` (`:71-94`: `{ context, subject?, questionId?, readability?, options, qa, selectedOptionId?, recommendation?, resultingSpecChange?, decisionEvaluation?, artifacts? }`);
  - `ComprehensionEvidence` (`:39-46`: `{ subject, dossierHash, h2aEventRef?, attestationHash?, sig?, at? }`), recording the signed inter-agent attesting decider principal (`subject`) distinctly from the relaying channel principal (`prov.principal`);
  - `DossierArtifact` (`:54-68`): discriminated union distinguishing `'h2a-decision-dossier'` (`{ kind: 'h2a-decision-dossier', negotiationRef, dossierHash, comprehension?, label? }`, built in `packages/h2a/src/decision-dossier.ts:39-48` over inter-agent `packages/h2a/src/negotiation.ts:1-14`) from human `'rendered-view'` (`{ kind: 'rendered-view', viewRef, sourceDossierHash?, label? }`) and `'mockup'`.
- **Human Focus / `canevas` / `present-decision` Returns vs Pure Headless `@sentropic/focus-interactive` (`M2`, `B1`):**
  - Per `packages/track/skills/present-decision/SKILL.md:4,96-100` (*"Agent-to-human, not h2a inter-agent negotiation"*; *"Never fabricate comprehension[]: a chat reply is not a signed attestation"*) and `packages/h2a/src/runtime/canevas/reply.ts:2-4,40` (`answeredBy: "local-human"`), a human UI/chat selection or Focus return is **never** fabricated into a signed `ComprehensionEvidence` (`ComprehensionAttestationRefV1`).
  - Instead, human Focus / `canevas` / `present-decision` interactions produce structured editing/action receipts (`EditReceipt` / `RetainedEditingState` in `packages/h2a/src/runtime/focus/edit-receipts.ts:5-9`, served by `packages/h2a/src/runtime/focus/serve.ts:1-60` and `packages/h2a/src/runtime/canevas/{answer.ts:1-50,reply.ts:1-45,serve.ts:1-63}`; `FOCUS_L4_ACTIONS` `'selectOption' | 'ratifyOutcome' | 'amendSpec' | 'addDossierArtifact'` in `packages/track/src/ingest/focus-l4.ts:11-68`; headless `FeedbackIntent` and `responseLine` formatting `D1 A — label` in `packages/focus-interactive/src/{feedback.ts:3-50,response-line.ts:21-33}`).
  - **Package Boundary (`B1`):** `@sentropic/focus-interactive` (`packages/focus-interactive/package.json:6`, `src/sync.ts:11-16`) is a pure headless TypeScript package with zero runtime dependencies that **MUST NOT** import `@sentropic/h2a`, `@sentropic/cluster-mesh`, or perform network I/O; the `cluster-mesh` emission bridge lives in `packages/h2a/src/runtime/focus/dossier-ingest-bridge.ts` (`new` in Lot `1-H3`) alongside `packages/h2a/src/decision-dossier.ts` (`1-H3`).

Under `D27=decision-only` (`spec/memory/R15-SEDIMENT.md:72`: `« Oui decision mais ce peut etre comme un decision dossier. Temps d echanger de qualite avec l ia resultant en des faits contextualisé et des decisions associees a ce contexte »`) and `D3` (`:48`: `« quoi qu'il arrive engram doit modéliser toute décision: décision de projet, décision de harnais, mais avec des destination de sérialisation différentes. »`), interactive and asynchronous learning exchanges (`e_rt_swipe` swipe/card review, CLI deliberation, or web dossier review) **never** produce unanchored trait notes (`SPEC_AGENT_MEMORY_SUBSTRATE.md:130-149`). Every learning exchange is modelled in `engram` as a structured **`decision_dossier`** graph subgraph binding **`contextualized_fact`** nodes to **`project_decision`** or **`harness_decision`** nodes.

### 4.2 Normative `DecisionDossierNodeV1`, `ContextualizedFactNodeV1`, and Domain Routing

```ts
// status: proposed — D27=decision-only learning exchange & D3/D31 decision nodes (M2, m1)
export interface DossierOptionV1 {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly pros?: readonly string[];
  readonly cons?: readonly string[];
  /** Multi-question dossier binding (decision.ts:20; focus/src/track/index.ts:171). */
  readonly questionId?: string;
  /** Explicit per-option recommendation marker for rendered Focus optionSets. */
  readonly recommended?: boolean;
}

export interface DossierQAExchangeV1 {
  readonly id: string;
  readonly question: string;
  readonly answer?: string;
  /** Per-question recommendation fields aligned with QAEntry (decision.ts:29-30; focus/src/track/index.ts:219-220). */
  readonly recommendedOptionId?: string;
  readonly recommendedAnswer?: string;
  /** Citation to the exact raw_event (speech_turn or external_hmi_input) where the owner/decider answered. */
  readonly answerEventRecordId?: string;
  readonly answerCitation?: CitationV1;
}

/**
 * Signed inter-agent comprehension attestation ONLY (`artifactKind: 'h2a-decision-dossier'`,
 * `packages/track/src/model/decision.ts:39-46,56-61`, `packages/h2a/src/decision-dossier.ts:39-48`).
 * NEVER fabricated from a human UI/chat reply (`present-decision/SKILL.md:97`, `canevas/reply.ts:40`).
 */
export interface ComprehensionAttestationRefV1 {
  /** Decider actor pseudonym (`actor_pseudo:<hex>`, D33) — distinct from the relaying channel caller. */
  readonly subjectPseudoId: string;
  readonly dossierDigestSha256: Sha256Digest;
  readonly h2aEventRef?: string;
  readonly attestationDigestSha256?: Sha256Digest;
  readonly attestedAt: Instant;
}

/**
 * Structured human Focus / `canevas` / `present-decision` return receipt (`artifactKind: 'rendered-view'`, M2),
 * grounded on `EditReceipt` (`runtime/focus/edit-receipts.ts:5-9`), `FOCUS_L4_ACTIONS` (`track/src/ingest/focus-l4.ts:11-64`),
 * and `responseLine` (`focus-interactive/src/response-line.ts:21-33`, e.g. `"D1 A — label"`).
 */
export interface HumanFocusReceiptV1 {
  readonly receiptId: string;
  readonly action: 'selectOption' | 'ratifyOutcome' | 'amendSpec' | 'addDossierArtifact';
  readonly responseLine?: string;
  readonly auth: 'local-user' | 'signed';
  readonly recordedAt: Instant;
  readonly sourceEventRecordId: string;
}

export interface ContextualizedFactNodeV1 {
  readonly nodeType: 'contextualized_fact';
  readonly factId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly derivedWorktreeId: string;
  readonly summaryText: string;               // Subject to D7 deny-list + D8 PII-armor on boundary egress
  readonly validTime: { readonly t: number; readonly t_end?: number };
  readonly sourceEventRecordIds: readonly string[];
  readonly citations: readonly CitationV1[];
}

export interface DecisionDossierNodeV1 {
  readonly nodeType: 'decision_dossier';
  readonly dossierId: string;
  /** Discriminates human Focus rendered views from inter-agent h2a dossiers (decision.ts:54-68, M2). */
  readonly artifactKind: 'rendered-view' | 'h2a-decision-dossier' | 'mockup';
  readonly negotiationRef?: string;           // Present when artifactKind === 'h2a-decision-dossier' (decision.ts:57)
  readonly viewRef?: string;                  // Present when artifactKind === 'rendered-view' | 'mockup' (decision.ts:64,68)
  readonly decisionKind: 'orientation' | 'commitment'; // Aligned with DecisionState.decisionKind (decision.ts:11,103)
  readonly targetItemIds: readonly string[];  // Aligned with DecisionState.targets (decision.ts:104)
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly derivedWorktreeId: string;
  readonly sessionPseudoId: string;
  readonly exchangeMode: 'interactive-session' | 'async-swipe-review' | 'hmi-dossier-thread';
  readonly contextSummary: string;
  readonly options: readonly DossierOptionV1[]; // Pending owner-facing dossiers carry >= 2 options + recommendation
  readonly recommendation?: { readonly optionId: string; readonly rationale: string };
  readonly qaExchanges: readonly DossierQAExchangeV1[];
  readonly selectedOptionId?: string;
  /** Resulting spec amendment locator/summary aligned with Dossier.resultingSpecChange (decision.ts:88) and amendSpec (focus-l4.ts:48-55). */
  readonly resultingSpecChangeRef?: string | null;
  readonly resultingSpecChange?: { readonly kind: string; readonly ref: string; readonly label?: string } | null;
  /** Non-empty ONLY for signed inter-agent `h2a-decision-dossier` attestations (M2). */
  readonly comprehensionAttestations: readonly ComprehensionAttestationRefV1[];
  /** Human Focus / `canevas` / `present-decision` returns (`answeredBy: "local-human"` / `auth: 'local-user' | 'signed'`, M2). */
  readonly humanFocusReceipts: readonly HumanFocusReceiptV1[];
  readonly dossierDigestSha256: Sha256Digest;
  readonly sourceEventRecordIds: readonly string[];
  readonly citations: readonly CitationV1[];
}

export interface DomainDecisionNodeBaseV1 {
  readonly decisionId: string;
  readonly dossierId: string;                 // Linked via `settles_in_decision`
  readonly decisionKind: 'orientation' | 'commitment';
  readonly targetItemIds: readonly string[];
  readonly contextualizedFactIds: readonly string[]; // Linked via `contextualizes_decision` (non-empty for settled decisions)
  readonly title: string;
  readonly outcome: 'pending' | 'go' | 'no-go' | 'deferred';
  readonly selectedOptionId?: string;
  readonly deciderPseudoId?: string;
  readonly mandateRef: H2AMandateEnvelope | null;
  readonly templateRef: OntologyTemplateEnvelopeRef;
  readonly validTime: { readonly t: number; readonly t_end?: number };
  readonly citations: readonly CitationV1[];
}

export interface ProjectDecisionNodeV1 extends DomainDecisionNodeBaseV1 {
  readonly nodeType: 'project_decision';
  readonly domain: 'project';
  /**
   * templateRef.lineage MUST equal 'track'. Unified with `spec/memory/contracts/engram-track.md:83-88,154-165` (`m1`):
   * Enters `'proposed'` until an authoritative `TrackControlVerdict` transitions it (§2.3).
   */
  readonly reviewStatus:
    | 'proposed'
    | 'recorded-bounded-type'
    | 'promotion-draft-awaiting-third-party'
    | 'approved'
    | 'rejected';
  readonly verdictAuthority: 'track';
  readonly serializationTarget: 'track-pr-slice'; // Serialized to .track/ under Track template (D29=both, D34=engram, Point 1B)
}

export interface HarnessDecisionNodeV1 extends DomainDecisionNodeBaseV1 {
  readonly nodeType: 'harness_decision';
  readonly domain: 'harness';
  /** templateRef.lineage MUST equal 'h2a'. Classified local under formal h2a mandate (D3=mandated). */
  readonly overlayScope: 'worktree' | 'workspace-developer' | 'repository' | 'master-proposal';
  readonly reviewStatus: 'proposed' | 'accepted-harness-local' | 'rejected';
  readonly verdictAuthority: 'h2a';
  readonly serializationTarget: 'h2a-harness-overlay'; // Serialized to .h2a/overlays/* (D31, D34, Point 4B)
}
```

**Execution Invariants for `D27` Exchanges:**
1. Every prompt, option presentation, Q&A turn, and Focus/`canevas`/swipe action in a learning exchange is recorded **first** via `recordSessionEvent` (`speech_turn` or `external_hmi_input`), and when the owner answers an option or question it also emits a typed `owner.answer` live-tracking signal (§6).
2. Human Focus / `canevas` / `present-decision` returns populate `humanFocusReceipts` (`HumanFocusReceiptV1`) and **never** fabricate signed `comprehensionAttestations` (`ComprehensionAttestationRefV1`), which are reserved exclusively for cryptographically signed inter-agent `h2a-decision-dossier` negotiations (`M2`).
3. Settling a dossier (`selectedOptionId` chosen or `outcome !== 'pending'`) atomically links at least one `ContextualizedFactNodeV1` (`grounds_dossier` and `contextualizes_decision`) to the resulting `project_decision` or `harness_decision`, ensuring decisions never float without the factual context that justified them (`D27`).
4. `project_decision` and `harness_decision` share `engram`'s graph substrate (`D3`) while remaining strictly partitioned by `domain`, `templateRef.lineage`, `verdictAuthority`, and `serializationTarget` (`.track/` vs `.h2a/overlays/*`, `D31`, `Point 4B`, `Point 5B`).

---

## 5. Privacy, Pseudonymization, Deny-Lists, Retention, Study Bounds, and Capture Purpose

### 5.1 Deterministic Pseudonymization (`D33=pseudonymize`) and `D6=refs` Path Policy

Per `D33=pseudonymize` (`spec/memory/R15-SEDIMENT.md:78`: *"Authors and session identifiers receive a stable, deterministic pseudonym; paths follow D6"*):
1. **Scoped HMAC Pseudonyms (`actor_pseudo:*`, `sess_pseudo:*`) & `K_pseudo` Key Custody (`OQ-S1-2`, *answered by sentropic and h2a, 2026-11-15*; `m2`):**
   - For each `(tenantId, workspaceId)` protection scope, the host key custodian (`KeyProviderPort` in `engram-live/content-policy.ts:46-51` / `CryptoPort` in `engram-memory/contracts/index.ts:901-907`) holds a 256-bit scope pseudonymization key `K_pseudo` strictly outside `engram` SQLite tables (`G-NOSECRET`), outside graph projections, and outside all Git-tracked files. When multi-workstation `D24` workspace sync is explicitly enrolled, `K_pseudo` is provisioned via `cluster-mesh`'s encrypted workspace enrollment key-ring stored in the OS secret store / local keychain so `actorPseudoId` and `sessionPseudoId` match byte-for-byte across enrolled workstations of the same operator/workspace; without explicit multi-workstation enrollment, `K_pseudo` stays strictly local to the workstation (`0600`) and never transits `.h2a/` or `.track/`.
   - Author identities and session IDs are mapped deterministically before graph/index/study persistence:
     $$\text{actorPseudoId} = \text{"actor\_pseudo:"} \mathbin{\|} \operatorname{HMAC-SHA256}_{K_{\text{pseudo}}}(\text{"engram/d33/actor/v1\textbackslash 0"} \mathbin{\|} \operatorname{NFC}(\text{canonicalActorId}))$$
     $$\text{sessionPseudoId} = \text{"sess\_pseudo:"} \mathbin{\|} \operatorname{HMAC-SHA256}_{K_{\text{pseudo}}}(\text{"engram/d33/session/v1\textbackslash 0"} \mathbin{\|} \operatorname{NFC}(\text{sessionId}))$$
   - Stability guarantees that all turns of one session and all contributions of one actor join deterministically in the graph without leaking emails, OS usernames, or raw CLI session UUIDs. Per §3.2 & §6.3 (`m2`), `actorPseudoId` and `sessionPseudoId` 64-hex digests are never copied into owner-rendered `.track/` text fields. Note that per `SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:388`, **pseudonymization is never a substitute for field-omission redaction** when `AuthorizationPort.redact` withholds a field.
2. **Paths Under `D6=refs` (`spec/memory/R15-SEDIMENT.md:51`):**
   - Every file path passes deterministic pre-persistence classification (`classifyPath` in `engram-live/content-policy.ts:92-125`). Secret-bearing basenames/segments (`.env*`, `*.pem`, `*.key`, `credentials.json`, `secrets.json`, `service-account.json`, `id_rsa`/`id_ed25519`, `secret`/`secrets`/`credentials` segments at `:59-73`) are immediately replaced with `protectedPathRef` (`withheld-path:<sha256>`, `:133-136`) — `.gitignore` is never consulted as a secrecy guarantee (`:12-16`).
   - Without an active `G4` / `D6` content-disclosure grant (`SPEC_LIVE_GIT_INDEXING.md:369, 395`), external models, dreaming summaries, caches, and logs receive **only** `(pathRef, contentFingerprint)` (`contentDisclosureAuthorized: false`), never file bodies or line excerpts.

### 5.2 `D7` Confidentiality Deny-List and `D8=bounded` PII Armor Across Boundaries (`D24`, `D10`)

1. **`engram` Confidentiality / PII Deny-List (`D7`, `e_svc_mctrl`):**
   - `engram` owns `ConfidentialityDenyListV1` (`version: string`, `digestSha256: Sha256Digest`, `saltedTermHashes: readonly Sha256Digest[]`, `deterministicPatterns: readonly string[]`, `piiCategoryRules: readonly ('email' | 'phone' | 'national-id' | 'iban' | 'secret-token' | 'private-key' | 'client-program-code')[]`), building on `SECRET_PATTERNS` (`engram-live/content-policy.ts:144-150`) and aligned with `Track`'s confidentiality policy (`D32`: joint memory control from `engram` and `Track`).
   - Pre-persistence screening (`screenBatchSurfaces` pattern, `engram-live/content-policy.ts:206-240`) withholds hard-denied secret/confidentiality hits before canonical sealing; under explicit content authorization, `D7` model-assisted sensitivity triage runs exclusively through `@sentropic/llm-mesh` (`Spec 6A §2.5 :424-426`).
2. **`D8=bounded` PII-Armor Redaction and the `D24` / `D10` Egress Matrix:**
   - Implemented behind `AuthorizationPort.redact` (`engram-memory/contracts/index.ts:214-234`), stamping `PiiArmorStamp` (`{ policyVersion, redactionReceiptDigest, d7BlacklistVersion, d33Pseudonymized: true }` per `spec/memory/contracts/engram-cluster-mesh.md:45-57`):

| Transfer / Read Path | `crossesBoundary` | Normative Privacy & Federation Treatment |
| :--- | :--- | :--- |
| **Same `(tenantId, workspaceId)` local ↔ remote DB-cluster sync (`D24`)** — `raw_event`, bounded `turn_text` (`<= 64 KiB`), `typed_node`, `typed_edge`, `ontology_template`, `control_verdict` | `false` | **Integral and unmasked** transactional replication (`engram-cluster-mesh.md:53-57`) when workspace sync is enabled (`Point 6A`) and, for session-derived `turn_text` / CLI transcript bytes, subordinated to the owner's signed `ContentPolicyV1` (`sentropic:packages/cluster-mesh/src/sessions/content-policy.ts:89-139`; unconsented local CLI transcripts stay `syncState: 'local-only'`, `F-02`), preserving `D6` protected-path withholding and local-only `Q2 B` uncommitted Git hunks (`SPEC_LIVE_GIT_INDEXING.md:114, 330`). |
| **Same `(tenantId, workspaceId)` `context_log` and `context_summary` (`D10=mandate`)** | `local-by-default` | **Stays local by default** (`R15-SEDIMENT.md:55`). Replicated to another machine **only** when both `H2AMandateEnvelope.federationPolicy.allowContextTransfer === true` and the owner's per-repository policy explicitly allow it (`Spec 6A :324-328, 394`). |
| **Cross-workspace / cross-tenant capitalisation (`proposeCapitalisation`), cross-session study access (`D8`, `D9`), or external-model disclosure without raw grant** | `true` | **Mandatory `PiiArmorStamp` (`D8=bounded`):** deterministic metadata + byte-bounded extracts (`RedactionDirectiveV1.max_packet_bytes`, `engram-memory/contracts/index.ts:170-175`) scrubbed through `D7` deny-list + PII armor + `D33` pseudonyms. Missing or invalid `piiArmorStamp` fails closed (`UNAUTHORIZED` / `POLICY_UNAVAILABLE`). |

### 5.3 Host Audit Retention (`D13=host`) and Post-Close Window + Announced Purge (`D14=window` vs `D23`)

Per `D13=host` (`R15-SEDIMENT.md:58`) and `D14=window` (`:59`):
1. **Single Declared Host Audit Policy (`D13=host`) Bounded by `ContentPolicyV1` (`F-15`):**
   - Each host deployment declares a single `HostAuditRetentionPolicyV1` (`policyId`, `auditWindowMs`, `derivativeRule: 'retain' | 'make-ineligible'`). Once declared, that single policy governs all `context_log` records and processed session items on the host; per-caller or per-CLI ad-hoc TTL overrides are rejected (`INVALID_SCHEMA`).
   - Whenever the session's signed `ContentPolicyV1` channel retention (`sentropic:packages/cluster-mesh/src/sessions/content-policy.ts:89-164`) is finite (`kind: 'finite'`), `computeRetentionDeadline(channelRetention, firstAdmissionAt)` (`:148-164`) propagates into `RetentionV1.expires_at` (`expires_at = Math.min(hostAuditExpiresAt, computeRetentionDeadline(channelRetention, firstAdmissionAt))` when both are finite, or `computeRetentionDeadline(channelRetention, firstAdmissionAt)` otherwise), so session-derived retention never outlives the owner's signed `ContentPolicyV1` deadline.
2. **Post-Close Audit Presentation Window and Announced Purge (`D14=window`):**
   - When a session closes at `closedAt`, its processed items enter `AuditWindowState = 'presented-for-audit'` with `auditWindowEndsAt = closedAt + auditWindowMs` (`RetentionV1.expires_at` on audit-scoped records, `engram-memory/contracts/index.ts:47-50`).
   - During `[closedAt, auditWindowEndsAt)`, processed items remain presented on the host audit surface.
   - At `now >= auditWindowEndsAt`, a deterministic two-step transition executes:
     1. **Presentation Stop + Announced Purge Receipt:** Presentation stops immediately (`AuditWindowState = 'presentation-stopped'`), and before any physical deletion runs, the engine emits and journals an immutable **`PurgeAnnouncementReceiptV1`**:
        ```ts
        // status: proposed — D14 announced purge receipt
        export interface PurgeAnnouncementReceiptV1 {
          readonly schemaVersion: 'engram.purge-announcement/v1';
          readonly announcementId: string;
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly sessionPseudoIds: readonly string[];
          readonly hostAuditPolicyId: string;
          readonly closedWindowEnd: Instant;
          readonly announcedAt: Instant;
          readonly executeNotBefore: Instant;
          readonly targetClasses: readonly ('host-context-log' | 'host-audit-view' | 'expired-memory-envelope')[];
          readonly receiptDigest: Sha256Digest;
        }
        ```
     2. **Purge Execution Without Breaking `D23` Canonical Graph Queries:** Host-local `context_log` copies and expired sealed candidate keys are destroyed (`CryptoPort.destroy`, `engram-memory/contracts/index.ts:905`). In canonical `engram` storage, records governed by `D13` expiry fold deterministically to `expired` (or `tombstoned` on explicit erasure, cascading across every node, edge, FTS, vector, and aggregate read surface per `SPEC_AGENT_MEMORY_SUBSTRATE.md:184-195` and `SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:716, 773-776`), while non-expired canonical `turn_text` citations retained for mission continuity remain queryable on demand through the memory graph (`D23`, `PLAN_SPEC_ENGRAM_FRONT.md:184`).

### 5.4 Study Corpus Calibration Bounds (`D9=full` — Study Corpus Only)

Per `D9=full` (`R15-SEDIMENT.md:54`: `« 30 projets 6 mois de session merci (tu bornes les session aux 6 mois) »`):
- `StudyCorpusCalibrationPolicyV1` fixes `maxActiveProjects = 30` and `sessionSlidingWindowDays = 183` (`6` calendar months anchored at query `asOf`), combined with mandatory `D8=bounded` PII armor and `D33=pseudonymize`.
- **Hard Non-Truncation Invariant:** `D9` bounds **only** the read-only cross-session study and calibration corpus projection (`purposeRef: 'memory.recall.study/v1'`). It **never** deletes, expires, evicts, or caps canonical project memories in `engram` (`D28=engram`), `Track` project event trails, or `engram-live` Git/PR history (`Q1 A` uncapped history in `SPEC_LIVE_GIT_INDEXING.md:104-112`).

### 5.5 Dedicated, Independently Revocable Capture Purpose (`D11=dedicated`)

Per `D11=dedicated` (`R15-SEDIMENT.md:56`: *"Automatic capture of session facts has its own purpose, separate from the recall purpose. Capture can be revoked without cutting recall"*):
- `engram` enforces disjoint purpose namespaces in `AuthorizationPort.authorize` and `AuthorizationPort.revalidate` (`engram-memory/contracts/index.ts:161-234`):
  - **Capture purposes:** `'memory.capture.session/v1'` and `'memory.capture.hmi/v1'` (required on `recordSessionEvent`, `recordExtraction`, `MemoryPortV2.capture`, and `MemoryPortV2.ingestActivity`).
  - **Recall purposes:** `'memory.recall.contextual/v1'` (for `engram_memory_search`, `engram_memory_get`, `engram_memory_context`) and `'memory.recall.study/v1'` (for `D8`/`D9` study reads).
- Revoking a principal's or workspace's `'memory.capture.*'` grant increments the capture-grant revocation state so every subsequent `recordSessionEvent` / `recordExtraction` call fails closed with `AUTHORIZATION_REVOKED`, **without** invalidating `'memory.recall.*'` receipts or cutting recall over already admitted (`accepted_current` / `historical`) records.

---

## 6. GitHub Principal & Secret Custody (`cluster-mesh/forge`), Typed Live-Tracking Events, Bounded Reconciliation, and Rate Limits

### 6.1 GitHub Trust Boundary, Secret Custody (`G-NOSECRET`), `forge` Prerequisites, and Spec 1 Scope (`F-04`, `F-05`, `OQ-S1-5`)

1. **GitHub Credential Custody and Ingress Hosting (`F-04`, `G-NOSECRET`):**
   - **Hosted product mode (`external-host`):** GitHub ingress resides in **`packages/cluster-mesh/src/forge/*`** + `packages/cluster-mesh/src/compose/memory.ts`, composed by `api/src/services/cluster-mesh/github-app-host.ts` (`github-app-envelope-store.ts:1-105`). GitHub App private keys (PEM) and webhook secrets (`current`/`previous` overlap rotation) remain **exclusively** encrypted (`AES-256-GCM` with HKDF `'github-app-custody-v1'` under `SECRET_ENCRYPTION_KEY`, `sentropic:packages/cluster-mesh/src/forge/custody.ts:18-59`) inside `control.github_app_enrollments`. Inbound webhooks verify `X-Hub-Signature-256` HMAC-SHA256 in constant time over raw `Uint8Array` body bytes via `GitWebhookVerificationPort.verify` (`forge/contracts.ts:12-21`, `forge/lifecycle.ts:43-54,91-95`), and REST backfill calls acquire short-lived installation tokens via `GitInstallationLeasePort.acquire` (`forge/contracts.ts:29-33`, `api/src/services/artifacts/live/forge-github.ts:28-62`).
   - **Local workstation mode (`h2a` CLI):** Only the host `gh` transport (`engram-live/pr-sync.ts:60-68`) holds user GitHub credentials, strictly outside `engram` and outside any Wasm guest (`G-NOSECRET`, `sentropic:spec/SPEC_EVOL_CHAT_MESH_PROPOSAL.md:97`). **Zero secrets, PEM keys, or installation tokens ever enter `engram`, logs, or database rows.**
2. **Mandatory Verified GitHub → Sentropic Principal Binding (`F-04`):**
   - A valid GitHub webhook signature attests only that GitHub transmitted the payload — **never** that the GitHub actor is the Sentropic workspace `owner`.
   - Qualifying any GitHub-originated event as `owner.answer` or `owner.request` is **strictly forbidden** unless GitHub's immutable numeric `sender.id` (**never** mutable `sender.login`) resolves against a verified enrollment binding `(tenantId, workspaceId, githubUserId) -> sentropicOwnerPrincipal` for the target `scopeRef`. Unbound or non-owner GitHub actors MUST be rejected with HTTP `403` on owner-restricted paths or recorded strictly as non-owner external observations without `ComprehensionEvidence` / `ComprehensionAttestationRefV1` and without auto-promotion.
3. **Verified `sentropic` `origin/main` (`913e3bcbc`) `forge` Blockers and Spec 1 Phase-1 Scope (`F-05`, `OQ-S1-5`, *answered by sentropic, 2026-11-14; confirmed by h2a/Track, 2026-11-15*):**
   - On `sentropic` `origin/main` (`913e3bcbc`) and `engram` (`f9dc84f7`), four verified baseline constraints exist today:
     1. `GIT_APP_PERMISSIONS` (`sentropic:packages/cluster-mesh/src/forge/contracts.ts:7,40,50-54`) requires exact `{ contents: 'write', metadata: 'read' }`; granting `pull_requests: 'read'` or `issues: 'read'` throws `GitAppAccessLostError` and revokes enrollment (`forge/lifecycle.ts:66,75,86`);
     2. `installationEvent` (`sentropic:packages/cluster-mesh/src/forge/lifecycle.ts:101-103`) rejects with HTTP `400` any `x-github-event` other than `'installation'` and `'installation_repositories'`;
     3. `GIT_APP_TARGET_REGISTRY` (`sentropic:api/src/services/cluster-mesh/github-app-host.ts:46`) hardcodes a static two-repository allowlist instead of resolving enrolled targets dynamically; and
     4. `engram-live/pr-sync.ts:1-88` (in `:1-524`) models only PRs (`PullRequestFactDto` — no `github-issue`, `github-review`, or `project-board` contracts exist yet), and `PrSyncPersistencePort` (`engram-live/pr-sync.ts:79-87`) has **no implementation yet** in `packages/cluster-mesh`.
   - **Normative Phase-1 Scope:** Spec 1 (`§6` and `1-S3a`/`1-S3b`) restricts `D30` external GitHub ingestion **strictly to the PR flow (`PullRequestFactDto` / `pr-sync` + `x-github-event: pull_request` → `pr.merged`) combined with authenticated `session-db` entries (`owner.answer`, `owner.request`)**. Prerequisite lots `1-S0a` and `1-S0b` (§8.2) extend `GIT_APP_PERMISSIONS` to a declarative profile admitting `pull_requests: 'read'` without `GitAppAccessLostError`, enable `x-github-event: pull_request` verification/routing in `forge/lifecycle.ts:101-103`, replace the hardcoded `GIT_APP_TARGET_REGISTRY` (`github-app-host.ts:46`) with dynamic resolution against `LiveDeclarationStorePort` (`packages/cluster-mesh/src/live-storage/registration.ts:509-515`), and implement `PrSyncPersistencePort` on `cluster-mesh`'s `engram-live` storage module. GitHub issues (`github-issue`), PR review comments (`github-review`), and `ProjectsV2` boards (`project-board`) are deferred to a follow-up `D30` HMI specification with dedicated `engram-live` contracts and verified GitHub↔Sentropic identity bindings.

### 6.2 Typed Live-Tracking Events (`pr.merged`, `owner.answer`, `owner.request`), `Track` Mapping, Revision-Qualified `sourceId`, and `idem:v1:` Idempotency (`F-01`, `F-03`, `F-06`, `B2`)

Per `owner-r10/suivi-direct-2026-11-07.md:5-6` (`« trakc avec engram devra vraiment assurer un suivi live »`) and `PLAN_SPEC_ENGRAM_FRONT.md:167`, `engram` defines three closed live-tracking event schemas (*`engram-memory/live-tracking.ts` does not exist yet at `f9dc84f7`*; added in Lot `1-E6`):

```ts
// status: proposed — Typed live-tracking events (owner-r10/suivi-direct-2026-11-07.md:5-6; B2)
export type LiveTrackingEventKind = 'pr.merged' | 'owner.answer' | 'owner.request';

export type LiveTrackingEventPayloadV1 =
  | {
      readonly eventKind: 'pr.merged';
      /**
       * Canonical immutable sourceId (OpaqueRef, 1..512 UTF-8 bytes):
       * `gh:pr-merged:${owner}/${repo}#${prNumber}@${mergeOid.algorithm}:${mergeOid.oid}`
       * Emitted iff `PullRequestFactDto.state === 'merged'` and `mergeOid !== null`.
       */
      readonly sourceId: OpaqueRef;
      readonly repositoryOwner: string;
      readonly repositoryRepo: string;
      readonly prNumber: number;
      readonly headOid: { readonly algorithm: 'sha1' | 'sha256'; readonly oid: string };
      readonly baseOid: { readonly algorithm: 'sha1' | 'sha256'; readonly oid: string };
      readonly mergeOid: { readonly algorithm: 'sha1' | 'sha256'; readonly oid: string };
      /** Admits `'unknown'` when GitHub REST `/pulls` omits merge strategy (`live-github.ts:176`, B2). */
      readonly mergeStrategy: 'merge' | 'squash' | 'rebase' | 'unknown';
      /** Preserved from `PullRequestFactDto.mergedAt` (`new` optional field in `1-E4` + `live-github.ts:165-179` in `1-H2`, B2). */
      readonly mergedAt: Instant;
    }
  | {
      readonly eventKind: 'owner.answer';
      /**
       * Spec 1 Phase 1: authenticated session-db entry `session-db:${sessionId}:${entryId}@ord=${ordinal}:owner.answer`.
       * (Phase-2 mutable GitHub HMI entities MUST embed `@rev=${canonicalUpdatedAt}:${bodySha256Prefix16}` per F-06.)
       */
      readonly sourceId: OpaqueRef;
      /**
       * Aggregate discriminant (`B2`, `packages/track/src/ingest/focus-l4.ts:11-64`):
       * - Option/outcome settlement on a `decision` aggregate carries `decisionId` (+ `selectedOptionId` or defer);
       * - Free-form verbatim answer outside a `decision` aggregate omits `decisionId`/`selectedOptionId` and populates `targetItemIds`.
       */
      readonly decisionId?: string;
      readonly dossierId?: string;
      readonly selectedOptionId?: string;
      readonly questionId?: string;
      readonly targetItemIds?: readonly string[];
      /** Exact owner answer words when authorized under `ContentPolicyV1` (`D7` screened pre-persistence, `D8` armored on cross-boundary egress). */
      readonly verbatimText?: string;
      readonly verbatimDigest: Sha256Digest;
      /** Binding auth provenance required by `focus-l4.ts:21` and `ingest.ts:275-277` (`B2`). */
      readonly authProvenance: 'local-user' | 'signed';
      readonly answeredAt: Instant;
      readonly citation?: SessionDbCitationTuple;
      readonly citations: readonly CitationV1[];
    }
  | {
      readonly eventKind: 'owner.request';
      /**
       * Spec 1 Phase 1: authenticated session-db entry `session-db:${sessionId}:${entryId}@ord=${ordinal}:owner.request`.
       * (Phase-2 mutable GitHub HMI entities MUST embed `@rev=${canonicalUpdatedAt}:${bodySha256Prefix16}` per F-06.)
       */
      readonly sourceId: OpaqueRef;
      /** Immediate exact owner words required for `DemandRaw.text` (`packages/track/src/model/demand.ts:18-24`, `suivi live` 07/11, `B2`; subject to `ContentPolicyV1` / `D7` / `D8`). */
      readonly verbatimText: string;
      readonly requestSummary: string;
      readonly verbatimDigest: Sha256Digest;
      readonly requestedAt: Instant;
      readonly citation?: SessionDbCitationTuple;
      readonly citations: readonly CitationV1[];
    };
```

1. **Deterministic `72`-Byte `idempotencyKey` Derivation & Mutable-Entity Revision Rule (`F-03`, `F-06`):**
   - Because `sourceId: OpaqueRef` allows `1..512` UTF-8 bytes (`sentropic:packages/mcp-platform/src/memory/contracts.ts:107-111`) whereas `isValidIdempotencyKey` enforces `16..256` UTF-8 bytes (`:114-118`), `idempotencyKey` MUST NEVER set raw `idempotencyKey === sourceId`. Instead, every ingestion computes:
     $$\text{idempotencyKey} = \text{"idem:v1:"} \mathbin{\|} \operatorname{sha256Hex}(\operatorname{canonicalJcs}(\{\text{sourceKind},\ \text{sourceId}\}))$$
     (`72` ASCII bytes, always valid under `16..256` B), while preserving the full `sourceId` (`1..512` B) in `RawSessionEventEnvelope`, `ExtractedCandidateItem.liveTrackingBinding`, and `CitationV1`.
   - **Mutable-Entity Revision Rule (`F-06`):** Every `sourceId` referencing a mutable upstream GitHub/HMI entity MUST embed an immutable observed-content revision qualifier (for `pr.merged`, `@${mergeOid.algorithm}:${mergeOid.oid}`; for future Phase-2 GitHub comments/issues, `@rev=${canonicalUpdatedAt}:${bodySha256Prefix16}`). Consequently, a redelivered webhook (`X-GitHub-Delivery`) or overlapping `pr-sync` pass (`PR_SYNC_OVERLAP_MS = 300_000`, `engram-live/pr-sync.ts:33,345-347`) observing the **same** revision is idempotent (`duplicate_exact` / `alreadyExisted: true`), whereas a legitimate upstream edit mints a distinct `sourceId` reconciled via `supersedes` (`engram-memory/contracts/index.ts:788-797`) rather than wedging permanently on `DIGEST_CONFLICT` (`:549-555`). `DIGEST_CONFLICT` remains reserved for corrupted/conflicting payloads claiming the **exact same** `(sourceKind, sourceId)` revision.
2. **End-to-End Live-Tracking Execution, `@sentropic/track` Mapping, and Single-Writer `.track/` Orchestration Policy (`R12`, `T-M-C`, `Point 1B`, `Point 5B`, `D28` Kept, `B2`):**
   - **Step 1 (Raw First in `engram`):** `pr.merged` (from `engram-live/pr-sync.ts:332-524` / `cluster-mesh/forge` and `h2a-runtime` `live-github.ts:165-179` via `/memory/v1/hmi/input`, after Lot `1-E4` adds optional `mergedAt?: number | null` to `PullRequestFactDto` in `engram-live/contracts.ts:1544-1557,1680-1738`), `owner.answer`, and `owner.request` (from authenticated `session-db` via `/memory/v1/session-front/ingest`) commit first as `raw_event` records in `engram` via `cluster-mesh`.
   - **Step 2 (Typed Project Proposal — `engram` Remains 100% Domain-Blind per `T-M-C`):** `recordExtraction` writes the corresponding `Track`-template-referenced candidate (`domain: 'project'`, `templateRef` pinned by `(templateVersion, templateDigestSha256)` to `track.ontology.yaml`, `reviewStatus: 'proposed'`), without hardcoding any `Track` `WorkEvent` enum inside `engram`.
   - **Step 3 (`@sentropic/track` Domain Mapping & Authoritative Verdict in `1-H4`, `B2`):** Inside `@sentropic/track`, `packages/track/src/ingest/engram-live-tracking.ts` (`new` pure module in Lot `1-H4`) and `packages/track/src/control/engram-proposal-evaluator.ts` (`new` in Lot `1-H4`) map live-tracking signals onto `Track`'s ingest contract (`packages/track/src/ingest/contract.ts:52-96`, `INGEST_CONTRACT_VERSION = '2.3.0'`):
     - **`pr.merged`:** maps to `item.add-link` (`→ 'item.link-added'`, `contract.ts:8-14,83`) with **`Link.kind = 'pr-merged'`** (`packages/track/src/report/stage-status.ts:58-61` — **never** `'pr'`), paired with `item.realize` (`to: 'done'`, `contract.ts:57,86`) and `item.consolidate` / `item.anchor` (`→ 'realization.anchored'`, `contract.ts:47-49`, `events/types.ts:93-97`);
     - **`owner.answer`:** when `decisionId` is present, maps under `authProvenance: 'local-user' | 'signed'` (`focus-l4.ts:21`) to `decision.select` (`→ 'decision.option-selected'` + atomic `'go'`/`'no-go'` outcome, `focus-l4.ts:34`, `contract.ts:26-28,90`) or defer-only `decision.outcome` (`focus-l4.ts:42`); when `decisionId` is absent and `targetItemIds` is populated, maps to a verbatim `item.add-link` (`→ 'item.link-added'`) or dossier revision (`decision.dossier` / `decision.add-artifact`);
     - **`owner.request`:** maps to `demand.raise` (`→ 'demand.raised'` with `DemandRaw.text = verbatimText`, `contract.ts:44-46`, `model/demand.ts:18-45`, plus any `Track`-template owner-numbering annotation) or `item.create` (`contract.ts:81`).
     `Track` control (`verdictAuthority: 'track'`) validates each candidate (`D1=borne-review`, template conformance, item/decision linkage) and records its `TrackControlVerdict` in `engram` via **`POST /memory/v1/control/verdicts`** (`Spec 6A :227, 777`, wired via `packages/h2a-runtime/src/track-cluster-mesh-client.ts` in `1-H4`).
   - **Single-Writer `.track/` Orchestration Boundary (`D28` Kept, `Point 1B`, `B2`):** `engram`'s live registry remains the canonical reference for recorded facts (`D28` kept) and `engram` produces the per-PR `.track/` projection validated/replayed by `Track` control (`D34=engram`, `Point 1B`). The rule forbidding direct `.track/` edits inside work branches during live sessions outside the single conductor / per-PR serialization flow is configured by **`h2a` orchestration policy** and MUST NEVER be hardcoded into the generic skills distributed by `@sentropic/track`.

### 6.3 Bounded Paginated Reconciliation Job and Gap / Staleness Counters (`LiveTrackingReconcilerPort`, `F-07`, `m2`, `OQ-S1-3`)

To guarantee zero silent loss without risking `OOM` or `DEADLINE_EXCEEDED` on large histories (`F-07`), `engram` specifies a strictly bounded, cursor-paginated reconciliation job (*`engram-memory/live-tracking-reconciler.ts` does not exist yet at `f9dc84f7`*; added in Lot `1-E6`):

```ts
// status: proposed — Bounded paginated live-tracking reconciliation job & gap/staleness counters (F-07)
export type ReconciliationSourceClass = 'github-pr-sync' | 'session-db' | 'engram-pending-extraction';

export interface LiveTrackingGapBreakdown {
  readonly eventKind: LiveTrackingEventKind;
  /**
   * Present upstream, absent from engram raw_event:
   * - For `session-db`: deterministic O(1) ordinal difference `maxCommittedOrdinal - lastIngestedOrdinal` (zero LLM calls).
   * - For `github-pr-sync`: merged PullRequestFactDto observations within the bounded page absent from engram.
   */
  readonly unrecordedRawCount: number;
  /**
   * Present in engram raw_event with `extractionDisposition === 'pending_extraction'` ONLY (F-07):
   * terminal dispositions `'proposed'`, `'empty_verified'`, and `'withheld_d7'` are strictly excluded.
   */
  readonly unproposedCount: number;
  readonly awaitingTrackVerdictCount: number; // Proposed in engram (`reviewStatus: 'proposed'`), awaiting Track verdict
}

export interface LiveTrackingGapReportV1 {
  readonly schemaVersion: 'engram.live-tracking-gap/v1';
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly checkedAt: Instant;
  readonly pageLimit: number;                 // Mandatory 1..100 (DEFAULT_PAGE_LIMITS.maxRecords = 100, storage/contracts.ts:179,195)
  /** Updated durable per-(scopeRef, sourceClass) continuation cursors persisted across sweeps. */
  readonly nextReconciliationCursors: Readonly<Record<ReconciliationSourceClass, Cursor | null>>;
  readonly hasMorePages: boolean;
  readonly prSyncUpdatedAtCursor: number | null; // From PrSyncCursorDto.updatedAtCursor (engram-live/pr-sync.ts:367)
  /** Upstream PR sync freshness gauge `now - PrSyncCursorDto.lastSuccessAt` (:368), exported as `live_tracking_sync_staleness_ms`. */
  readonly liveTrackingSyncStalenessMs: number | null;
  readonly sessionDbThroughCursor: Cursor;
  readonly engramJournalThroughCursor: Cursor;
  readonly byKind: readonly LiveTrackingGapBreakdown[];
  /** Published scalar metric `live_tracking_gap_count` = sum of unrecordedRawCount + unproposedCount across all 3 kinds. */
  readonly liveTrackingGapCount: number;
  /** Published separately as `live_tracking_pending_verdict_count` so Track backlog is visible without conflating missing ingestion. */
  readonly pendingTrackVerdictCount: number;
  readonly proposalsSubmittedCount: number;
  readonly reportDigestSha256: Sha256Digest;
}

export interface LiveTrackingReconcilerPort {
  runReconciliationSweep(input: {
    readonly tenantId: string;
    readonly workspaceId: string;
    /** Mandatory bounded page size `1..100` (rejects `< 1` or `> 100` with `INVALID_SCHEMA`, F-07). */
    readonly pageLimit: number;
    /** Durable resume cursor per `(scopeRef, sourceClass)` from the previous sweep. */
    readonly reconciliationCursors?: Partial<Readonly<Record<ReconciliationSourceClass, Cursor>>>;
    readonly authorization: AuthorizationContextV1;
    readonly deadlineAt: Instant;
  }): Promise<Result<LiveTrackingGapReportV1>>;
}
```

**Reconciliation, Pre-PR Drain, & Alerting Invariants (`F-07`, `m2`, `OQ-S1-3`, *answered by sentropic, 2026-11-14, and Track/h2a, 2026-11-15*):**
1. **Bounded Paginated Reads Only:** `runReconciliationSweep` enforces `1 <= pageLimit <= 100` (`DEFAULT_PAGE_LIMITS.maxRecords = 100`, `sentropic:packages/cluster-mesh/src/storage/contracts.ts:179,195`) and persists `reconciliationCursor` per `(scopeRef, sourceClass)`. On the PR-sync store (`1-S0a`), `cluster-mesh` exposes a bounded paginated reader (`listObservationsPage({ repository, cursor, limit })`, `limit <= 100`) alongside `PrSyncPersistencePort` rather than loading full repository history via unbounded `listObservations` (`engram-live/pr-sync.ts:83`).
2. **Zero Perpetual False Positives on `D7` or Empty Turns:** `unproposedCount` counts **only** `raw_event` records with `extractionDisposition === 'pending_extraction'`; items transitioned to `'withheld_d7'` or `'empty_verified'` by `recordExtraction` are excluded and are never re-queued.
3. **Proposal-Only — Never Direct Accepted Writes (`suivi-direct-2026-11-07.md:6`, `Point 5B`):** Missing merged `PullRequestFactDto` or `session-db` entries (`ordinal > lastIngestedOrdinal`) are ingested first as `raw_event` records (`deriveSessionFrontIdempotencyKey`) and queued as `proposed` candidates via `recordExtraction` — **never** mutating `.track/events.jsonl` directly and **never** minting a `TrackControlVerdict`.
4. **Synchronous Pre-PR Proposal Sweep (`OQ-S1-3`, *answered by Track / h2a, 2026-11-15*):** Before invoking `serializeProjectPrSlice` (or `replayBeforeMerge` in `spec/memory/contracts/engram-track.md:170-224`), the `Track` conductor synchronously drains pending proposals via `listPendingProposals` (`GET /memory/v1/control/proposals?status=proposed`, `new` cursor-paginated `limit <= 100` route in `packages/cluster-mesh/src/compose/memory.ts`, Lot `1-S1a`), posts authoritative verdicts (`submitControlVerdict` on `POST /memory/v1/control/verdicts`) for every proposal in the PR slice whose evidence is complete, and leaves items awaiting human arbitration explicitly in `reviewStatus: 'proposed'` (which remain excluded from the PR slice per §2.3).
5. **Owner-Report Digest & Worktree-ID Non-Projection (`m2`, `G7`/`G8`/`G9`):** Neither `engram-live-tracking.ts` nor per-PR `.track/` projection may copy `derivedWorktreeId` (`wt:<64hex>`), `cloneId`, `actor_pseudo:<hex>`, `session_pseudo:<hex>`, or `verbatimDigest` / `Sha256Digest` into owner-rendered `.track/` text fields (`title`, `body`, `summary`, `Link.label`, `nextAction`, `DemandRaw.text`), keeping 64-hex digests in technical metadata so `@sentropic/track` owner-report language/redaction audits (`packages/track/src/report/{format.ts:889-921,friendly.ts:1-60,audit.ts:1-65,owner-report-language.test.ts:1-65}`) never see raw cryptographic digests.
6. **Exported Gauges & Alert Thresholds (`OQ-S1-3`):** Every sweep publishes `live_tracking_gap_count`, `live_tracking_pending_verdict_count`, and `live_tracking_sync_staleness_ms` (`now - PrSyncCursorDto.lastSuccessAt`, `engram-live/pr-sync.ts:368`) on `GET /memory/v1/health` and the `cluster-mesh` telemetry sink. Operators alert when:
   - `unrecordedRawCount > 0` persists for **`> 5 min` (`300_000 ms`**, exceeding `PR_SYNC_OVERLAP_MS = 300_000` in `engram-live/pr-sync.ts:33`), **or**
   - `unproposedCount > 0` (excluding `'withheld_d7'` and `'empty_verified'`) persists for **`> 10 min` (`600_000 ms`)**, **or**
   - `live_tracking_sync_staleness_ms > 900_000` (`15 min`) on any active PR-synced repository.

### 6.4 HTTP Body Limits, Ingress Rate Limiting, Bounded Extraction Queue, and GitHub ETag / `Retry-After` (`F-08`)

1. **Strict HTTP Byte Ceilings:**
   - Raw GitHub webhook ingress (`cluster-mesh/forge`): **`maxRequestBytes = 262_144` (`256 KiB`)**, verified over raw bytes prior to JSON parsing (`413 Payload Too Large` on overflow).
   - `POST /memory/v1/hmi/input` (`compose/memory`): **`maxRequestBytes = 65_536` (`64 KiB`)**.
2. **Ingress Rate Limiter & Bounded `@sentropic/llm-mesh` Queue:**
   - Inbound HMI/webhook requests are rate-limited per `(installationRef, repository)` (`429 Too Many Requests` with `Retry-After` when exceeded).
   - `raw_event` ingestion commits are decoupled from `@sentropic/llm-mesh` inference by a **bounded asynchronous extraction work queue** per workspace: bursts of PR merges or turns commit durably as `'pending_extraction'` `raw_event` records without unbounded concurrent `LlmMesh.generate` calls, and any overflow drains cleanly through `LiveTrackingReconcilerPort` (§6.3).
3. **GitHub Conditional Requests (`ETag` / `304`) and `Retry-After` Propagation (`F-08`, Lots `1-S0a` / `1-S0b`):**
   - The hosted `GithubPrTransportPort` adapter (`sentropic:packages/cluster-mesh/src/forge/github-api.ts:28-38` and `api/src/services/artifacts/live/forge-github.ts:16-19`) forwards `If-None-Match` from `PrPageRequest.etag` (`engram-live/pr-sync.ts:48-59`), handles HTTP `304 Not Modified` without spending secondary processing budget, and parses `Retry-After` and `x-ratelimit-reset` headers into `PrTransportResult.retryAfterMs` (`engram-live/pr-sync.ts:58,403-408`).

---

## 7. Exact Specification Amendments (`Before → After` Deltas; Target Files Unmodified)

Per the Spec 1 charter (`spec/memory/PLAN_SPEC_ENGRAM_FRONT.md:168-172`), the three existing specifications below remain untouched on disk in this lot; the hunks below record the exact verbatim `Before` text at the cited line ranges and the normative `After` replacement to apply in the dedicated documentation-amendment lot (`D2=review`).

### 7.1 Amendments to `spec/SPEC_AGENT_MEMORY_SUBSTRATE.md` (`§0`–`§5`, lines `53–244`, and `§9.4`, lines `343–370`)

#### Hunk 7.1.1 — Scope Closure, Substrate, and In-Scope Kinds (`spec/SPEC_AGENT_MEMORY_SUBSTRATE.md:53-120`, with `:60-70` and `:103-114` unchanged)

**Before (verbatim, lines `53–59`, `71–102`, `115–120`):**
````markdown
The principal decided: **graphify ACCEPTS being the agent-memory substrate, WITH
a written scope closure.** IN scope: agent memory — **context / decision /
evidence**. OUT (hard gate holds): persona / authored h2a identity semantics.
Anti-cycle invariant: graphify **never imports h2a**; h2a only DISPATCHES into a
contract graphify defines. This lifts the T6 out-of-scope boundary **only for
the in-scope kinds**; everything else stays OUT.
````
````markdown
## 2. Substrate — additive, no new store

Realized on `graphify.agent-stats.project-graph/v1`, additive (no version bump).
An agent-memory node is a normal graph node carrying the shared `t`/`t_end`/
`t_src` contract, so it is born window-queryable (T5) and recall-addressable
(T6) with no new reader.

## 3. IN-SCOPE kinds — the closure

### 3.1 `MemoryNote` (asserted) — the normative schema

| Field | Meaning | Enforced |
|---|---|---|
| `node_type: "MemoryNote"` | fixed | admission |
| `memory_kind` | closed enum `"context" \| "decision" \| "evidence"` | admission (enum check) |
| `subject` | what the note is ABOUT: `"agent-work"` or `"human:<id>"` (a named human as work context). A `subject` naming a persona/identity/voice is **REFUSED** (§3.3). | admission (subject predicate) |
| `t` | authored-at / turn instant (ordering coordinate, §6) | pass-through |
| `t_end` | absent ⇒ still-current; `=== t` ⇒ closed point | pass-through |
| `t_src` | which coordinate produced `t` | pass-through, UNVERIFIED |
| `provenance` | structured citation: cited string + named source (§4) | admission (citation check, §4) |
| `event_shaped` | a mandatory machine-verifiable event ANCHOR: `t` + the assertion as an anchored event, not free prose (§3.3 — **structural**, not a writer flag, not a prose classifier) | admission (structural predicate) |
| `trust: "asserted"` | fixed | — |
| `reconcilable: false` | **opt-out by construction** (C1, §3.4): a non-earned tier is NOT reconciled by default | reconciliation gate |
| `principal_owner` | tenant identity: the principal/owner this note belongs to (§3.6) | admission + gate |
| `scope` | `"private"` (to `principal_owner`) \| `"capitalised"` (shared) (§3.6) | admission + gate |
| `purpose` | the finality the subject-human fact serves (A2, §3.5) — required when `subject` is a human | admission |
| `retention` | TTL / retention bound (A2, §3.5) — required when `subject` is a human | retention sweep + deletion path |
| `review_status` | `"pending" \| "accepted"` (binary gate, D11) | gate |

`memory_kind` closes the enum; but the enum ALONE does not hold the persona
boundary. The boundary is held by CODE — §3.3.
````
````markdown
### 3.2 Deliberately OUT (hard gate)

`Persona`/`Soul` binding, `UserModel` as an identity model, any h2a write path
or invented product envelope, caller-selected namespaces, cross-workspace reads,
pagination/cursors. As `SPEC_AGENTSTATS_TIMEORIENTED` §4.3 states them.
````

**After (normative replacement for lines `53–59`, `71–102`, `115–120`; lines `60–70`, `103–114`, and `121–229` retained unchanged):**
````markdown
The principal decided (extended by R15/R16 and `SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md`):
**engram (`@sentropic/engram`) is the first-rank live session ingestion front and canonical
agent-memory substrate (`D24`, `D28=engram`, `D32`), reached exclusively via `@sentropic/cluster-mesh`
(`R12`).** IN scope: first-rank raw session events (`speech_turn`, `tool_result`, `file_ref`,
`mandate_binding`, `external_hmi_input` per `D30`, `context_saturation`), derived Git worktrees
(`derived_worktree`, `D21`), decision-dossier learning exchanges (`decision_dossier`,
`contextualized_fact`, `D27=decision-only`), domain-typed `project_decision` / `harness_decision`
(`D3`, `D31`) and lineage-registered ontology instances (`Spec 0` `OntologyTemplateEnvelopeRef`),
plus `MemoryNote` (`context | decision | evidence`). OUT (hard gate holds): `Persona`/`Soul`
voice traits, `UserModel` aggregation (§3.3), and direct unmediated `h2a` or `Track` imports
bypassing `cluster-mesh` (`R12`). Anti-cycle invariant: `engram` **never imports `h2a` or `Track`**.
````
````markdown
## 2. Substrate — canonical journal first, derived worktree anchor (`D21`), bounded projection

Canonical authority resides in `CanonicalMemoryStorePort` (`SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md` D3)
over `cluster-mesh` L3a storage (`D17`, `D24`). Every session record binds to a `derived_worktree`
entity (`wt:<sha256>`, `D21`) rather than a flat `workspaceId` path alias, carries the shared
`t`/`t_end` temporal contract, and projects only `accepted_current` envelopes into bounded graph views
(`SPEC_MEMORY_MCP_V2.md` M10; raw turn text stays queryable on demand via `D23` and never inflates `graph.json`).

## 3. IN-SCOPE kinds — first-rank session front + `MemoryNote` closure

### 3.1 First-rank session-front kinds (`Spec 1`) and `MemoryNote` (asserted)

In addition to `MemoryNote` below, `EngramSessionIngestFrontPort` (`SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md` §§1–6)
admits canonical `raw_event` records (citing `cluster-mesh` neutral `session-db` via
`(sessionId, entryId, ordinal, contentDigest)`), `derived_worktree` (`D21`), `decision_dossier` +
`contextualized_fact` (`D27=decision-only`), `project_decision` (citing `Track` `OntologyTemplateEnvelopeRef`,
held in `review_status: "proposed"` until an authoritative `Track` verdict per `Point 5B`), and
`harness_decision` (`D3=mandated`, serialized to `.h2a/overlays/*` per `D31`). Authors and session IDs
carry deterministic `D33` pseudonyms; capture uses dedicated revocable purpose `memory.capture.*` (`D11`).

| Field | Meaning | Enforced |
|---|---|---|
| `node_type: "MemoryNote"` | fixed (for episodic asserted notes; domain-typed nodes cite `OntologyTemplateEnvelopeRef` per `Spec 0`) | admission |
| `memory_kind` | closed enum `"context" \| "decision" \| "evidence"` | admission (enum check) |
| `subject` | what the note is ABOUT: `"agent-work"` or `"human:<actor_pseudo_id>"` (`D33` pseudonymized work context). A `subject` naming a persona/identity/voice is **REFUSED** (§3.3). | admission (subject predicate) |
| `derived_worktree_id` | canonical `wt:<sha256>` worktree entity (`D21`, replacing flat `workspaceId` aliasing) | admission |
| `t` | authored-at / turn instant (ordering coordinate, §6) | pass-through |
| `t_end` | absent ⇒ still-current; `=== t` ⇒ closed point | pass-through |
| `t_src` | which coordinate produced `t` | pass-through, UNVERIFIED |
| `provenance` | structured citation (`SessionDbCitationTuple`, `D6FileOrPathRef`, or named source, §4) | admission (citation check, §4) |
| `event_shaped` | mandatory machine-verifiable event ANCHOR: `t` + anchored event, not free prose (§3.3) | admission (structural predicate) |
| `trust: "asserted"` | fixed on `MemoryNote` (`earned` / `signed` governed by `EvidenceVerifierPort`) | — |
| `reconcilable: false` | **opt-out by construction** (C1, §3.4) | reconciliation gate |
| `principal_owner` | tenant/owner scope binding (§3.6) | admission + gate |
| `scope` | `"private"` \| `"capitalised"` (§3.6; cross-boundary egress requires `D8` `PiiArmorStamp`) | admission + gate |
| `purpose` | dedicated capture vs recall finality (`D11=dedicated`: `memory.capture.*` vs `memory.recall.*`) | admission |
| `retention` | host audit retention policy (`D13=host`, `D14=window` announced purge; A2 §3.5) | retention sweep + deletion path |
| `review_status` | `"pending" \| "proposed" \| "accepted"` (`project` domain stays `"proposed"` until `Track` verdict, `Point 5B`) | gate + `Track`/`h2a` control |

`memory_kind` closes the `MemoryNote` enum; the persona boundary continues to be held by CODE — §3.3.
````
````markdown
### 3.2 Deliberately OUT (hard gate)

`Persona`/`Soul` voice/value traits, `UserModel` as an aggregated identity profile (§3.3),
flat `workspaceId` path aliasing (`D21`), unmediated `h2a`/`Track` writes bypassing `cluster-mesh`
(`R12`), and closed lists of `Track` or `h2a` domain types hardcoded inside `engram` (`T-M-C`).
*(Pagination/cursors and `cluster-mesh`-mediated multi-workspace study/sync are governed by
`SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md` and `Spec 6A`/`Spec 6B`.)*
````

#### Hunk 7.1.2 — Provenance and Write Path Header (`spec/SPEC_AGENT_MEMORY_SUBSTRATE.md:230-249`)

**Before (verbatim, lines `230–249`):**
````markdown
## 4. Provenance — what `verifyVerbatim` DOES and does NOT do (B1 correction)

Each `MemoryNote` carries a structured citation (cited string + named source).
`verifyVerbatim` (`src/source-grounding.ts:316`) is applied at admission: a note
whose cited string is not literally present in its named source is **refused**.

**Correction (the previously overstated claim is removed):** `verifyVerbatim`
checks the **citation only** — that the cited string exists in the named source.
It does **NOT** check that the note is event-shaped, nor that it is not a
persona/trait. The FORM/persona boundary is a **separate code predicate**
(§3.3, `event_shaped` + `subject`), NOT `verifyVerbatim`. And neither checks
that the lesson is TRUE. graphify guarantees FORM (via §3.3) and citation
integrity (via `verifyVerbatim`), never TRUTH.

## 5. Write path — versioned append CAPABILITY (M4), not a whole-graph push

A living memory adds **one note at a time**. Measured: the `GraphStore` port
(`src/storage/types.ts`) exposes only `pushGraph` (whole-graph). Re-pushing per
note is not viable.
````

**After (normative replacement for lines `230–249`):**
````markdown
## 4. Provenance — `SessionDbCitationTuple`, `D6=refs`, and `verifyVerbatim` (B1 + R15)

Every record carries structured citations:
1. When content disclosure is authorized, `verifyVerbatim` (`src/source-grounding.ts:316`) verifies
   that the cited string is literally present in the named source; mismatches are **refused**.
2. For neutral `session-db` turns (`Spec 6A` §2.5) or ungranted files (`D6=refs`), provenance binds
   the cryptographic `(sessionId, entryId, ordinal, contentDigest)` tuple or `(pathRef, contentFingerprint)`
   without copying withheld plaintext.
`verifyVerbatim` checks citation grounding only, never `event_shaped`, persona exclusion (§3.3),
or `Track` domain validity (`Point 5B`).

## 5. Write path — first-rank `EngramSessionIngestFrontPort` via `cluster-mesh` (`R12`) + append projection (M4)

Live sessions record raw turns, tool results, `D6` file refs, mandates, and `D30` HMI inputs **first**
through `EngramSessionIngestFrontPort` (`recordSessionEvent`, then post-record `recordExtraction`
proposals) over `@sentropic/cluster-mesh` (`R12`), committing to `CanonicalMemoryStorePort` (`EVOL` D3).
For derived `GraphStore` projections (`src/storage/types.ts`), whole-graph re-push per event remains
non-viable; projection updates use incremental append/invalidation capabilities (M4 below and `EVOL` §5.5).
````

#### Hunk 7.1.3 — Producer Wire-Shape (`spec/SPEC_AGENT_MEMORY_SUBSTRATE.md:343-370`)

**Before (verbatim, lines `343–370`):**
````markdown
### 9.4 Producer wire-shape — CO-SPEC CONVERGED with the memory peer

graphify DEFINES three entry points; h2a imports ONLY the signature (types +
method shapes) and never graphify internals; graphify never imports h2a
(anti-cycle). h2a authors ALL content — graphify validates and admits, it
authors no memory (hard gate).

- **`admitMemoryNote(note, ctx) → {admitted:true, id} | {admitted:false,
  reason}`.** h2a builds the COMPLETE note (§3.1 fields). graphify runs the
  admission checks IN ORDER, all must pass: (1) `memory_kind` enum; (2)
  `subject` predicate (§3.3.1); (3) `event_shaped` STRUCTURAL predicate
  (§3.3.2, the anchor below); (4) `verifyVerbatim` citation (§4); (5) tenancy
  (`principal_owner` + `scope`, §3.6); (6) retention required when `subject`
  is a human (§3.5). On pass → `appendNode` (§5), enters `pending`. On fail →
  refused, NOTHING stored (no silent no-op).
- **`promoteNote(noteId, {leg1_verdict_ref, leg2_verdict_ref,
  independence_attestation}, ctx) → {promoted|rejected}`** — SEPARATE from
  admission (separation of powers; the trigger is never the note's author). The
  double-consensus is scheduled by the conductor; two independent high-grade
  legs emit verdict ARTEFACTS; verdicts travel by REFERENCE (a locator to the
  file), never a self-report; graphify appends the two refs + the independence
  attestation + provenance to the journal (D12).
- **`requestTombstone(target, auth, ctx) → outcome`** — h2a REQUESTS, graphify
  KEEPS the `principal_owner` authority check (§3.5). For a subject-human fact
  `auth` is a SIGNED authorization (Ed25519 of `principal_owner` or a signed
  mandate), NOT an asserted requester field — authority never rests on a
  fabricable `by`. graphify checks, then `appendTombstone` (§5).
````

**After (normative replacement for lines `343–370`):**
````markdown
### 9.4 Producer wire-shape — `cluster-mesh`-mediated (`R12`) first-rank session front (`Spec 1` + `Spec 6A`)

`engram` defines data-pure contracts (`@sentropic/engram/session-front-contracts` and
`@sentropic/engram-memory/contracts`); `engram` never imports `h2a` or `Track` (anti-cycle), and
neither `h2a` nor `Track` calls `engram` in-process (`R12`). All producer traffic transits
`@sentropic/cluster-mesh/compose/memory`:

- **`recordSessionEvent(envelope)` (via `POST /memory/v1/session-front/ingest` or `/memory/v1/hmi/input`):**
  Records every raw `speech_turn`, `tool_result`, `file_ref` (`D6`), `mandate_binding` (verified
  `H2AEnvelope<H2AMandate>` or `null` triggering `D16`), `external_hmi_input` (`D30`), and
  `context_saturation` (`D19`) **first**, anchored on `derivedWorktreeId` (`D21`), `D33` pseudonyms,
  `D11` capture purpose (`memory.capture.*`), and `D13` host retention. Degrades via L3a `scope-outbox-v1`
  with an 8-host banner + structured log (`D17=degraded`), never via `~/.h2a/` or `.track/` JSONL files.
- **`recordExtraction(batch)` (post-recording extraction pipeline):**
  `light-permanent-llm`, `session-llm`, or `specialized-model` (via `@sentropic/llm-mesh` and
  `0.24.0` `@sentropic/engram/extraction-batch`) reads committed `raw_event` records and writes
  template-pinned proposals (`OntologyTemplateEnvelopeRef`, `Spec 0`). `domain: "project"` candidates
  check only metamodel well-formedness + `D7` deny-list in `engram` and stay in `reviewStatus: "proposed"`
  until an authoritative `TrackControlVerdict` (`verdictAuthority: "track"`, `Point 5B`, `D1=borne-review`)
  arrives via `POST /memory/v1/control/verdicts` (`Spec 6A` §2.2).
- **`engram_memory_capture` / `engram_memory_request_admission` / `engram_memory_withdraw` / `engram_memory_forget`:**
  MCP write tools routed through `mcp-platform` (`Spec 6A` §3). Erasure (`forget` / `tombstone`)
  enforces signed principal/mandate authority and folds tombstones out of every read, edge, and aggregate surface (§3.5).
````

---

### 7.2 Amendments to `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md` (`§4`, lines `145–252`, and `§5.1`, lines `253–290`)

**Explicit Preservation Notice:**
- **EVOL `D3` (`spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:73-77`) is preserved verbatim and unamended:** immutable record blobs plus the append-only lifecycle journal in `CanonicalMemoryStorePort` remain sole canonical authority; all graph/lexical/vector/UI surfaces remain projections.
- **`SPEC_MEMORY_MCP_V2.md` `M10` (`:884-910`) is preserved verbatim and unamended:** `graph.json` (`BoundedCurrentProjectionV1`, `52_428_800`-byte ceiling) contains `accepted_current` envelopes and citation refs only; `session_turn` / `turn_text` history is queried on demand via `engram_memory_context` (`D23`) and **never** copied into `graph.json`.

#### Hunk 7.2.1 — Normative Data Model Extensions (`spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:234-252`, honoring the `:149` D-5 Evolution Rule across `§4` `:145-252`)

**Before (verbatim, lines `234–252`; lines `145–233` retained unchanged, so `:234-242` continues the ```` ```ts ```` block opened at `:151` and closed at `:243`):**
````markdown
export interface MemoryRecordV2 extends CandidatePayloadV2 {
  record_id: string;                          // writer-derived from record_digest
  payload_digest: Digest;
  record_digest: Digest;
  recorded_at: Instant;                       // writer assigned
  recorded_cursor: Cursor;                    // writer assigned
  authorization_receipt_digest: Digest;
  trust: TrustBindingV1;
}
```

The caller supplies `CandidatePayloadV2`, never writer fields or a trust class. Exactly one primary component and exactly one primary event anchor are required. `primary_event.citation_id` must resolve to a citation used by the primary component, and the locator must cover the anchored event. Every component is atomic for citation and redaction purposes; multiple component kinds may coexist.

`scope_ref` is opaque. No installation, tenant, workspace, compartment, user, hierarchy, wildcard, or shared/private label exists in the record schema. Only `AuthorizationPort` may interpret the reference. Scope change is never an in-place mutation.

Evidence class is immutable for a record. `asserted` is the engine's fail-closed class when no configured verifier produces a stronger valid binding. `earned` requires a verifier receipt binding source evidence to the payload digest. `signed` requires a verifier receipt binding a verified cryptographic attestation to the payload digest. The caller cannot request a class. Elevation creates a distinct pending derivative; verifier expiry or revocation appends `trust_invalidated` and makes the old record ineligible without rewriting it.

## 5. Normative ports, errors, and receipts
````

**After (normative replacement for lines `234–252`, keeping frozen `CandidatePayloadV2` / `MemoryRecordV2` binary-compatible per `:149` D-5 Evolution Rule):**
````markdown
export interface MemoryRecordV2 extends CandidatePayloadV2 {
  record_id: string;                          // writer-derived from record_digest
  payload_digest: Digest;
  record_digest: Digest;
  recorded_at: Instant;                       // writer assigned
  recorded_cursor: Cursor;                    // writer assigned
  authorization_receipt_digest: Digest;
  trust: TrustBindingV1;
}

// (2026-11-14 Spec 1 & Spec 0 amendment, additive V1 session-front & metamodel envelopes)
export type EngramGraphNodeKindV1 =
  | "session_turn"                            // canonical journal record citing neutral session-db; text queryable via D23, NEVER copied into graph.json (M10)
  | "tool_result"                             // structured tool outcome + significance tier + D6 file refs
  | "project_decision"                        // cites Track OntologyTemplateEnvelopeRef; stays 'proposed' until Track verdict (Point 5B)
  | "harness_decision"                        // D3=mandated local/harness decision; serializes to .h2a/overlays/* (D31)
  | "decision_dossier"                        // D27=decision-only exchange binding contextualized_fact nodes to decisions
  | "contextualized_fact"                     // D27 factual context grounded on raw_event citations
  | "derived_worktree"                        // D21 Git worktree entity bound to @sentropic/engram-live (cloneId, wt:<sha256>, parentOrigin, gitState, session logs)
  | "template_typed_node";                    // open lineage-registered entity citing OntologyTemplateEnvelopeRef (Spec 0)

export interface PrivacyAndGovernanceStampV1 {
  actor_pseudo_id: OpaqueRef;                 // D33 deterministic HMAC pseudonym (`actor_pseudo:<hex>`)
  session_pseudo_id?: OpaqueRef;              // D33 deterministic HMAC pseudonym (`sess_pseudo:<hex>`)
  derived_worktree_id: OpaqueRef;             // D21 `wt:<sha256>`
  d7_deny_list_version: string;               // D7 confidentiality deny-list version screened pre-persistence
  pii_armor_stamp?: {                         // D8=bounded: REQUIRED when crosses_boundary === true; omitted on integral same-(tenant, workspace) D24 sync
    policy_version: string;
    redaction_receipt_digest: Digest;
    d7_blacklist_version: string;
    d33_pseudonymized: true;
  };
  template_ref?: {                            // Spec 0 OntologyTemplateEnvelopeRef (required on project_decision, harness_decision, template_typed_node)
    lineage: "archi" | "h2a" | "track" | "engram";
    template_id: string;
    template_version: string;
    template_digest_sha256: Digest;
  };
  review_status?: "proposed" | "recorded-bounded-type" | "promotion-draft-awaiting-third-party" | "approved" | "accepted-harness-local" | "rejected";
}
```

The caller supplies `CandidatePayloadV2` (or a Spec 1 `RawSessionEventEnvelope` / `SessionExtractionProposalBatch` translated by `EngramSessionIngestFrontPort`), never writer fields or a trust class. Exactly one primary component and one primary event anchor are required. For `session_turn` records, `CitationLocatorV1` uses `{ scheme: "session-db", value }` binding `cluster-mesh`'s neutral `session-db` `(session_id, entry_id, ordinal, content_digest)` tuple (`Spec 6A` §2.5). Under `D11=dedicated`, automatic capture uses `purpose_ref = "memory.capture.session/v1" | "memory.capture.hmi/v1"`, revocable without cutting `memory.recall.*`. Under `D9=full`, the 30-project / 6-month window filters `memory.recall.study/v1` only and never truncates canonical storage.

`scope_ref` remains opaque inside `CandidatePayloadV2`; `AuthorizationPort` owns scope interpretation and `D8` redaction. EVOL D3 (`:73-77`) and `SPEC_MEMORY_MCP_V2.md` M10 (`:884-910`) govern all projections: raw session events and `session_turn` text history are canonical journal records whose authorized graph projection serves `engram_memory_context` (`D23`), and turn text is never copied into `graph.json`.

Evidence class remains immutable (`asserted` | `earned` | `signed`). Project-domain candidates (`template_ref.lineage === "track"`) remain in `review_status: "proposed"` (`pending` in the canonical store) until an authoritative `Track` verdict (`Point 5B`) admits them.

## 5. Normative ports, errors, and receipts
````

#### Hunk 7.2.2 — Common Result and Typed Errors (`spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md:253-290`)

**Before (verbatim, lines `253–290`):**
````markdown
### 5.1 Common result and typed errors

**2026-10-17 conformance amendment.** `MemoryErrorCode` includes `PROJECTION_OVERSIZED`,
the existing typed refusal when a raw current projection exceeds the §8/D10 byte ceiling.
This corrects an omission in this alias; the implementation and ceiling are unchanged.

```ts
export type MemoryOperation =
  | "capture" | "cancel_capture" | "request_admission"
  | "reject" | "withdraw" | "dispute" | "resolve_dispute" | "expire" | "supersede"
  | "mark_non_current" | "rewind" | "trust_invalidate" | "tombstone"
  | "recall_current" | "recall_history" | "recall_disputed"
  | "propose_capitalisation" | "propose_reconciliation" | "inspect_candidate"
  | "projection_invalidate" | "backup" | "restore" | "admin" | "migrate";

export type MemoryErrorCode =
  | "INVALID_SCHEMA" | "INVALID_DIGEST" | "DIGEST_CONFLICT"
  | "UNAUTHORIZED" | "AUTHORIZATION_EXPIRED" | "AUTHORIZATION_REVOKED"
  | "POLICY_UNAVAILABLE" | "POLICY_STALE" | "ILLEGAL_TRANSITION"
  | "NOT_FOUND" | "ALREADY_TERMINAL" | "DEADLINE_EXCEEDED" | "CANCELLED"
  | "CAPABILITY_UNAVAILABLE" | "STORE_UNAVAILABLE" | "FENCE_LOST"
  | "CURSOR_GAP" | "JOURNAL_CORRUPT" | "BLOB_MISSING"
  | "PROJECTION_STALE" | "PROJECTION_OVERSIZED" | "RANKING_UNAVAILABLE" | "STALE_PAGE"
  | "REGISTRY_VERSION_UNAVAILABLE" | "BACKUP_INVALID" | "RESTORE_REFUSED" | "MIGRATION_LEDGER_INVALID";

export interface MemoryErrorV1 {
  code: MemoryErrorCode;
  operation: MemoryOperation;
  message: string;
  retryable: boolean;
  error_receipt_digest?: Digest;
  denial?: true;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: MemoryErrorV1 };
```
````

**After (normative replacement for lines `253–290`):**
````markdown
### 5.1 Common result and typed errors

**2026-10-17 conformance amendment.** `MemoryErrorCode` includes `PROJECTION_OVERSIZED`,
the existing typed refusal when a raw current projection exceeds the §8/D10 byte ceiling.
**2026-11-14 Spec 1 session-front amendment.** `MemoryPortV2` retains its frozen `MemoryOperation`
and `MemoryErrorCode` unions unchanged for V2 binary compatibility; `EngramSessionIngestFrontPort`
(`SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md` §1.4) maps onto `Result<T>` using existing codes
(`DIGEST_CONFLICT` for `sourceId` payload mismatch in live-tracking, `AUTHORIZATION_REVOKED` when
`D11` `memory.capture.*` is revoked while `memory.recall.*` stays valid, `REGISTRY_VERSION_UNAVAILABLE`
for unknown/unpinned `OntologyTemplateEnvelopeRef`, `POLICY_UNAVAILABLE` / `UNAUTHORIZED` for `D7`
deny-list or missing `D8` `pii_armor_stamp` on cross-boundary egress, and `STORE_UNAVAILABLE` /
`FENCE_LOST` triggering `D17=degraded` handling at the `cluster-mesh` boundary).

```ts
export type MemoryOperation =
  | "capture" | "cancel_capture" | "request_admission"
  | "reject" | "withdraw" | "dispute" | "resolve_dispute" | "expire" | "supersede"
  | "mark_non_current" | "rewind" | "trust_invalidate" | "tombstone"
  | "recall_current" | "recall_history" | "recall_disputed"
  | "propose_capitalisation" | "propose_reconciliation" | "inspect_candidate"
  | "projection_invalidate" | "backup" | "restore" | "admin" | "migrate";

export type MemoryErrorCode =
  | "INVALID_SCHEMA" | "INVALID_DIGEST" | "DIGEST_CONFLICT"
  | "UNAUTHORIZED" | "AUTHORIZATION_EXPIRED" | "AUTHORIZATION_REVOKED"
  | "POLICY_UNAVAILABLE" | "POLICY_STALE" | "ILLEGAL_TRANSITION"
  | "NOT_FOUND" | "ALREADY_TERMINAL" | "DEADLINE_EXCEEDED" | "CANCELLED"
  | "CAPABILITY_UNAVAILABLE" | "STORE_UNAVAILABLE" | "FENCE_LOST"
  | "CURSOR_GAP" | "JOURNAL_CORRUPT" | "BLOB_MISSING"
  | "PROJECTION_STALE" | "PROJECTION_OVERSIZED" | "RANKING_UNAVAILABLE" | "STALE_PAGE"
  | "REGISTRY_VERSION_UNAVAILABLE" | "BACKUP_INVALID" | "RESTORE_REFUSED" | "MIGRATION_LEDGER_INVALID";

export interface MemoryErrorV1 {
  code: MemoryErrorCode;
  operation: MemoryOperation;
  message: string;
  retryable: boolean;
  error_receipt_digest?: Digest;
  denial?: true;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: MemoryErrorV1 };
```
````

---

### 7.3 Amendments to `spec/SPEC_LIVE_GIT_INDEXING.md` (`§2`, lines `42–71`, and `§5`, lines `118–129`)

#### Hunk 7.3.1 — Architecture And Scope (`spec/SPEC_LIVE_GIT_INDEXING.md:42-71`)

**Before (verbatim, lines `42–71`):**
````markdown
## 2. Architecture And Scope

```mermaid
flowchart TD
    D[Durable live workspace declarations] --> H[h2a / cluster-mesh host]
    H --> I[Injected Git, filesystem, GitHub, clock and protection capabilities]
    I --> E[Neutral engram collector and fact batches]
    E --> A[Engram adapter inside cluster-mesh]
    A --> S[Cluster-mesh versioned storage port]
    S --> L[Local SQLite live projection]
    S --> P[Sentropic Postgres authorized committed projection]
    H --> R[Typed authorized readers]
    R --> S
```

| Owner / repository | Responsibility |
|---|---|
| **engram** | Logical code/Git facts, deterministic extraction, OID incrementality, reconciliation, content selection, coverage and bounded scheduling logic in the separate `engram-live/` package (`@sentropic/engram-live`). Neutral factories, DTOs and injected ports; no host imports, database writes or SQL drivers. |
| **cluster-mesh package** | Engram adapter, generic storage kernel, both reusable SQLite/Postgres backends and their schema/migration algorithms, generation semantics, capability negotiation, staging/publication, typed readers, namespace authorization and N/N-1 compatibility (L3a v4.1). Postgres consumes an injected driver; pool and credential ownership stay with the application. |
| **h2a** | Compose the factory and cluster-mesh runtime; supply approved processes, filesystem access, credentials, keys, supervision, resource controls and workspace/job lifecycle. Host startup replays declarations and resumes work independently of agent sessions. |
| **sentropic app** | Compose the reusable cluster-mesh Postgres backend in `api/src/services/cluster-mesh/`; inject the driver/session bridge, operate pools/credentials and attach application migration/history in the app's DB and `api/drizzle/` surfaces. Own product live declarations, authorization, network retry, tenant access, backup/restore and deployment. An ephemeral agent or Pod is not the database operator. |

Live state, extraction caches, temporary data and signal markers reside in injected host-managed locations **outside every observed worktree and its git-dir/common-dir**, stable across branch switches. No cache/marker API may silently default to the source root. `.engram/` is the existing application state convention, with legacy `.graphify/` / `graphify-out/` compatibility; none is a permitted live write destination in the worktree. No database export, hook rebuild, JSON, report, assistant work file or graph merge driver becomes a live-to-Git output path. Git and the filesystem are observed sources. Only the separate private retention store in §4 accepts acquisition writes.

H0, L5, L6b and L9-E/L9-H enforce the same whole-cycle guard: activation, bootstrap, edit reconciliation, reads, restart and deactivation leave source-tree bytes and entries (tracked, untracked and ignored), `.gitattributes`, local/worktree Git config, index and refs unchanged by the collector. An isolated, quiescent fixture compares file inventories/digests and `git status --porcelain --ignored --untracked-files=all` before/after; controlled user edits become the next baseline. The test's status oracle runs only on benign fixtures with optional locks/fsmonitor disabled; it is not a production capture preflight (§7). An empty tracked diff alone is insufficient.

The existing file-based corpus workflow remains separate. S0 neither removes its artifacts nor migrates its users. Optional future compatibility views are bounded typed reads of authorized committed data; they do not create a live file. Existing explicitly invoked file exports remain outside live and cannot read private live snapshots through a convenience bridge.

No host/product registry is introduced inside engram. A durable **live declaration capability must be added to the hosts**; existing product workspace membership is not a repository registry. See §12 for the explicit activation, enrollment binding and local authority. Host changes have their own branches; this engram S0 branch contains only the four specified documents.
````

**After (normative replacement for lines `42–71`):**
````markdown
## 2. Architecture And Scope

```mermaid
flowchart TD
    D[Durable live workspace declarations] --> H[h2a / cluster-mesh host]
    H --> I[Injected Git, filesystem, GitHub, clock and protection capabilities]
    I --> E[Neutral engram collector and fact batches]
    E --> A[Engram adapter inside cluster-mesh]
    A --> S[Cluster-mesh versioned storage port]
    S --> L[Local SQLite live projection]
    S --> P[Sentropic Postgres authorized committed projection]
    S --> W["engram D21 derived_worktree graph entity (wt:<sha256>)"]
    H --> R[Typed authorized readers]
    R --> S
```

| Owner / repository | Responsibility |
|---|---|
| **engram** | Logical code/Git facts, deterministic extraction, OID incrementality, reconciliation, content selection, coverage and bounded scheduling logic in the separate `engram-live/` package (`@sentropic/engram-live`), plus the `D21` `derived_worktree` graph model (`SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md` §3) sharing canonical `deriveCloneIdentity` / `deriveWorktreeIdentity` (`engram-live/registration.ts:312–411`). Neutral factories, DTOs and injected ports; no host imports, database writes or SQL drivers. |
| **cluster-mesh package** | Engram adapter, generic storage kernel, both reusable SQLite/Postgres backends and their schema/migration algorithms, generation semantics, capability negotiation, staging/publication, typed readers, namespace authorization, N/N-1 compatibility (L3a v4.1), and `R12` binding of published live worktree/branch/HEAD/snapshot facts to `engram` `derived_worktree` nodes (`D21`). Postgres consumes an injected driver; pool and credential ownership stay with the application. |
| **h2a** | Compose the factory and cluster-mesh runtime; supply approved processes, filesystem access, credentials, keys, supervision, resource controls and workspace/job lifecycle (including `.h2a/jobs/<jobId>/wt` worktrees bound to `D21` + R1 retention). Host startup replays declarations and resumes work independently of agent sessions. |
| **sentropic app** | Compose the reusable cluster-mesh Postgres backend in `api/src/services/cluster-mesh/`; inject the driver/session bridge, operate pools/credentials and attach application migration/history in the app's DB and `api/drizzle/` surfaces. Own product live declarations, authorization, network retry, tenant access, backup/restore and deployment. An ephemeral agent or Pod is not the database operator. |

**`D21` derived worktree binding (`2026-11-14` Spec 1 amendment).** Every observed main checkout, linked worktree, and detached `h2a` job worktree binds directly by its canonical `(cloneId, worktreeId)` (`wt:<sha256>`) to `engram`'s `derived_worktree` graph node, uniting parent origin link, live branch/HEAD/index/working-tree digests, `.h2a/overlays/worktrees/{derivedWorktreeId}.json` ref (`D31`), and attached session logs (`D21`). Recording a session turn on an unactivated checkout creates only the passive `derived_worktree` identity node (`liveIndexingState: 'unactivated'`) and **never** implicitly activates live filesystem/Git collection (`A01` preserved).

Live state, extraction caches, temporary data and signal markers reside in injected host-managed locations **outside every observed worktree and its git-dir/common-dir**, stable across branch switches. No cache/marker API may silently default to the source root. `.engram/` is the existing application state convention, with legacy `.graphify/` / `graphify-out/` compatibility; none is a permitted live collector write destination in the worktree (explicit `D34` PR/overlay serialization is a separate governed Git workflow outside the live collector). Git and the filesystem remain observed sources for `engram-live`. Only the separate private retention store in §4 accepts acquisition writes.

H0, L5, L6b and L9-E/L9-H enforce the same whole-cycle guard: activation, bootstrap, edit reconciliation, reads, restart and deactivation leave source-tree bytes and entries (tracked, untracked and ignored), `.gitattributes`, local/worktree Git config, index and refs unchanged by the collector. An isolated, quiescent fixture compares file inventories/digests and `git status --porcelain --ignored --untracked-files=all` before/after; controlled user edits become the next baseline. The test's status oracle runs only on benign fixtures with optional locks/fsmonitor disabled; it is not a production capture preflight (§7). An empty tracked diff alone is insufficient.

The existing file-based corpus workflow remains separate. S0 neither removes its artifacts nor migrates its users. Optional future compatibility views are bounded typed reads of authorized committed data; they do not create a live file. Existing explicitly invoked file exports remain outside live and cannot read private live snapshots through a convenience bridge.

No host/product registry is introduced inside engram. A durable **live declaration capability must be added to the hosts**; existing product workspace membership is not a repository registry. See §12 for the explicit activation, enrollment binding and local authority.
````

#### Hunk 7.3.2 — Automatic GitHub PR Synchronization (`spec/SPEC_LIVE_GIT_INDEXING.md:118-129`)

**Before (verbatim, lines `118–129`):**
````markdown
## 5. Automatic GitHub PR Synchronization — P1

1. Use the host-approved installed `gh` binary and its existing authentication to enumerate **all pages and all PR states** for each registered GitHub repository. Retain identity, state/dates, pinned head/base observations and available merge metadata. CI/review/worktree metadata used by readers carries its own freshness and availability.
2. Persist object-acquisition jobs independently of the metadata cursor. Acquire authorized `refs/pull/<n>/head` and necessary associated objects in service-owned refs in a **private Git store**, never by moving refs or changing the index of the user's clone. Verify the acquired target against the observed OID; a moving remote head produces another observation, not an OID substitution.
3. Traverse the acquired DAG without a commit cap. No REST/GraphQL or `gh pr view` commit array is proof of exhaustive history. The review's reported REST limit of 250 remains `unverified` in the supplied dossier; correctness does not depend on that number.
4. Advance metadata using an `updatedAt` cursor with overlap and identity deduplication, plus periodic complete sweeps. Persist continuation/retry state and deduplicate pages that move during enumeration. A successful metadata page does not complete a failed object job.
5. Keep PR attribution separate from ancestry. Pin historically observed head/base bounds and merge-base evidence; distinguish merge, squash and rebase. Do not label every ancestor as PR-specific, subtract today's base to erase a merged PR's commits, or infer missing historical bounds. Unknown attribution stays partial while acquired ancestry remains available.
6. Apply independent request/concurrency budgets, supported ETags, timeouts, primary/secondary rate-limit handling and bounded backoff with durable retry. Tokens never enter facts, logs or database rows. Do not trust a repository-selected credential helper or executable; use host-controlled credentials and transport configuration.

No authentication, revoked access, network outage or unavailable PR ref produces an explicit `auth_required`, `stale` or `unavailable` state and last successful observation. Local collection continues. Retained observations do not disappear when credentials change, but access remains subject to host authorization. Resume automatically when the condition clears.

Q3 A already authorizes the required GitHub PR synchronization. It does not authorize periodic fetch of every remote branch, arbitrary remote URLs, telemetry or update checks.
````

**After (normative replacement for lines `118–129`):**
````markdown
## 5. Automatic GitHub PR Synchronization — P1 (And First `D30` External HMI Input Path)

1. Use the host-approved installed `gh` binary and its existing authentication to enumerate **all pages and all PR states** for each registered GitHub repository. Retain identity, state/dates, pinned head/base observations and available merge metadata. CI/review/worktree metadata used by readers carries its own freshness and availability.
2. Persist object-acquisition jobs independently of the metadata cursor. Acquire authorized `refs/pull/<n>/head` and necessary associated objects in service-owned refs in a **private Git store**, never by moving refs or changing the index of the user's clone. Verify the acquired target against the observed OID; a moving remote head produces another observation, not an OID substitution.
3. Traverse the acquired DAG without a commit cap. No REST/GraphQL or `gh pr view` commit array is proof of exhaustive history. The review's reported REST limit of 250 remains `unverified` in the supplied dossier; correctness does not depend on that number.
4. Advance metadata using an `updatedAt` cursor with overlap and identity deduplication, plus periodic complete sweeps. Persist continuation/retry state and deduplicate pages that move during enumeration. A successful metadata page does not complete a failed object job.
5. Keep PR attribution separate from ancestry. Pin historically observed head/base bounds and merge-base evidence; distinguish merge, squash and rebase. Do not label every ancestor as PR-specific, subtract today's base to erase a merged PR's commits, or infer missing historical bounds. Unknown attribution stays partial while acquired ancestry remains available.
6. Apply independent request/concurrency budgets, supported ETags, timeouts, primary/secondary rate-limit handling and bounded backoff with durable retry. Tokens never enter facts, logs or database rows. Do not trust a repository-selected credential helper or executable; use host-controlled credentials and transport configuration.
7. **`D30` External HMI Input & Live Tracking (`2026-11-14` Spec 1 amendment; Phase-1 PR flow active, issues/reviews/boards deferred):** P1 GitHub PR synchronization (under `cluster-mesh/forge` secret custody in hosted mode and host `gh` in CLI mode, `G-NOSECRET`) is the first concrete `D30` external HMI input path into `engram` (via `cluster-mesh` `POST /memory/v1/hmi/input`, `R12`). Newly observed merged PR facts (`state === "merged"` with `mergeOid`) emit typed `pr.merged` live-tracking events (`sourceId = "gh:pr-merged:<owner>/<repo>#<number>@<alg>:<mergeOid>"`, `idempotencyKey = "idem:v1:" + sha256Hex(canonicalJcs({ sourceKind, sourceId }))`, `SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md` §6), feeding `engram` first and `Track` control proposals downstream (`Point 5B`). GitHub issue, review-comment, and project-board inputs are deferred to a follow-up `D30` HMI specification once dedicated `engram-live` contracts, `cluster-mesh/forge` permissions/webhook events, and verified numeric `sender.id` → Sentropic principal bindings land, without introducing collector model calls (`A07`) or conflating GitHub/boards with `Track` or `engram`.

No authentication, revoked access, network outage or unavailable PR ref produces an explicit `auth_required`, `stale` or `unavailable` state and last successful observation. Local collection continues. Retained observations do not disappear when credentials change, but access remains subject to host authorization. Resume automatically when the condition clears.

Q3 A already authorizes the required GitHub PR synchronization. It does not authorize periodic fetch of every remote branch, arbitrary remote URLs, telemetry or update checks.
````

---

## 8. Small Test-First Implementation Lots per Repository (`engram` / `sentropic` / `h2a`)

All lots execute in TypeScript/Node only (zero scripting runtimes outside Node), follow `RED → GREEN → GUARD` discipline, respect `Spec 0` + `Spec 6A` + `chat-mesh` prerequisites, and enforce each repository's native build/test governance:
- **`engram` (`@sentropic/engram`):** `npm` + `vitest` (`npx vitest run ...`, `npm run lint`, `npm run build`), ≤12 files per lot.
- **`sentropic` (`packages/cluster-mesh`, `api`):** strict **`Make-Only` / `Docker-First` / `ENV=test-*` as final argument**, atomic **`<= ~150 LOC`** commits (`sentropic:rules/MASTER.md:11-29,36,51`), explicit test file paths on `SCOPE="..."` (`packages/cluster-mesh/tests/storage/cold-workspace.sh:161` passes `"${CM_SCOPE:-tests}"` as a quoted path argument to `vitest run`; `Makefile:4085-4087` passes `$$SCOPE` to `vitest run`, `N-02`), and **strict separation between publishable `packages/cluster-mesh` lots (each including its `packages/cluster-mesh/package.json` semver bump for `enforce-package-bump`, `rules/workflow.md:116-120`) and `api/` lots** (`F-09`).
- **`h2a` (`@sentropic/h2a`, `@sentropic/h2a-runtime`, `@sentropic/focus-interactive`, `@sentropic/track`):** `scripts/run-test-gates.mjs:151-152,205-223,357-358,367-386` and `scripts/run-tests.mjs:13-21,74` run **only** `packages/h2a/test/*.test.js` and `packages/focus-interactive/test/*.test.js` via `node --test` and `packages/h2a-runtime/src/**/*.test.ts` plus `packages/track/src/**/*.test.ts` via Vitest (`*.test.ts` inside `packages/h2a/src/` is **forbidden** because `packages/h2a/tsconfig.json:10-12` compiles `src/` into `dist/` and breaks `check-publish-payload.mjs` / `prepack`); every new `packages/h2a/test/*.test.js` or `packages/h2a-runtime/src/*.test.ts` file MUST be registered in `scripts/test-inventory.json` (`scripts/test-inventory.mjs:40-46,71-85`, `scripts/test-execution-evidence.mjs:23-28`); `@sentropic/focus-interactive` (`package.json:6`, `src/sync.ts:11-16`) remains 100% pure headless TS with zero `@sentropic/h2a` or network imports; and `@sentropic/track` (`packages/track/package.json:1-79`, locked by `6A-H1`) keeps **zero** `@sentropic/engram` or `@sentropic/cluster-mesh` dependencies (`B1`).

### 8.1 `engram` Lots (`@sentropic/engram`)

| Lot | Depends On | Scope (≤12 Files) | RED → GREEN → GUARD Test Cases (`tests/*.test.ts`) |
| :--- | :--- | :--- | :--- |
| **`1-E0` *(doc)* ** | Spec 1 review (`D2=review`) | `spec/SPEC_AGENT_MEMORY_SUBSTRATE.md`, `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`, `spec/SPEC_LIVE_GIT_INDEXING.md`, `spec/memory/contracts/engram-cluster-mesh.md`, `spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md` (`§2.2`), `CHANGELOG.md` | Documentary gate verifying exact application of §7.1–§7.3 hunks **plus** mirroring the `POST /memory/v1/session-front/extractions` and `GET /memory/v1/control/proposals` addenda into `spec/memory/contracts/engram-cluster-mesh.md` and `Spec 6A §2.2` (`N-04`, `OQ-S1-3`) while keeping EVOL `D3` (`:73-77`) and `SPEC_MEMORY_MCP_V2.md` `M10` (`:884-910`) intact. |
| **`1-E1`** | `Spec 0` Lot `0.1`, `6A-E1` | `package.json` (`exports["./session-front-contracts"]`), `tsup.config.ts`, `src/session-front-contracts.ts`, `engram-memory/contracts/session-front.ts`, `engram-memory/session-front-engine.ts`, `engram-memory/validation.ts`, `engram-memory/index.ts`, `tests/session-front-ingest.test.ts` | **RED:** Rejects unknown keys, `derivedWorktreeId` failing `isValidWorktreeId` (`/^wt:[0-9a-f]{64}$/`, `F-15`, `N-01`), `idempotencyKey` outside `16..256` B (`F-03`), `recordExtraction` citing uncommitted or cross-scope `sourceEventRecordIds` (`NOT_FOUND` / `UNAUTHORIZED`), and `D18` unauthenticated writes. **GREEN:** Exposes compiled JS + `.d.ts` at `@sentropic/engram/session-front-contracts` (`F-14`); `recordSessionEvent` commits all 6 raw event kinds (including `deliveryPath: 'mcp-opportunistic'`, `M1`) with `SessionDbCitationTuple`, bounded `<= 64 KiB` `turn_text` (`F-02`), `RawEventExtractionDisposition` (`F-07`), `D12=turn` + `24`-turn/`64 KiB` `session_summary` flags (`OQ-S1-1`), `D15=slices` (`readySlices` + optional `readySlicePayloads`, `M1`), and `D16` `null`-mandate signal. **GUARD:** `BoundedCurrentProjectionV1` (`engram-memory/bounded-projection.ts:74`) never includes `speech_turn` text (`M10`). |
| **`1-E2`** | `1-E1` | `package.json` (move `@sentropic/llm-mesh` to optional `peerDependencies` `">=0.38.0 <0.39.0"`), `src/llm-json-port.ts`, `src/llm-mesh.ts`, `engram-memory/privacy/{pseudonym,deny-list,pii-armor,retention-window,study-window}.ts`, `tests/session-front-privacy.test.ts` | **RED:** Cross-boundary egress without `PiiArmorStamp` fails closed; revoking `memory.capture.session/v1` blocks capture (`AUTHORIZATION_REVOKED`); `D7` hits are withheld (`'withheld_d7'`); ad-hoc per-CLI TTLs fail `D13=host`; `RetentionV1.expires_at` exceeding finite `ContentPolicyV1` `computeRetentionDeadline` fails (`F-15`); any import of `src/llm-execution.ts` from `src/llm-mesh.ts` fails (`F-12`). **GREEN:** `D33` HMAC pseudonyms are deterministic per scope (`OQ-S1-2`); `D11` recall stays green after capture revocation; `D14` emits `PurgeAnnouncementReceiptV1` before purge; `D9` (`30` projects, `6` months) filters `memory.recall.study/v1` only. |
| **`1-E3`** | `1-E1`, `1-E2`, `Spec 0` Lot `0.2` | `src/session-extraction-adapter.ts`, `src/extraction-batch.ts` (repoint `:74-78` onto `./llm-json-port.js`), `tsup.config.ts`, `tests/session-extraction-pipeline.test.ts` | **RED:** Project-domain candidate with unknown `OntologyTemplateEnvelopeRef` fails `REGISTRY_VERSION_UNAVAILABLE`; `domain: 'project'` never enters `accepted_current` without a `TrackControlVerdict`; **mechanical import-graph + packed `dist/` chunk AST test fails if any subpath consumed by `cluster-mesh` (`./session-front-contracts`, `./extraction-batch`, `./profile-bundle`, `./llm-mesh`, `./memory-substrate`, `./mcp-memory`, `./metamodel`) directly or transitively imports `llm-execution.ts`, `@ai-sdk/*`, `ai`, `mistral-ocr`, or reads/writes `process.env.*_API_KEY` (`F-12`)**. **GREEN:** `'light-permanent-llm'`, `'session-llm'`, and `'specialized-model'` run via `revalidateFullBundleAndRederiveProfile`, `mergeExtractionsWithCitations`, and `recordExtraction`, stamping `llmMeshAttemptRef` (`F-13`) and enforcing the 5-state `engram-track.md:83-88,154-165` `reviewStatus` bijection (`m1`) + source dispositions (`'proposed' | 'empty_verified' | 'withheld_d7'`, `F-07`). |
| **`1-E4`** | `1-E1` | `engram-live/derived-worktree-graph.ts`, `engram-live/contracts.ts` (additive `isValidWorktreeId` + optional `PullRequestFactDto.mergedAt?: number \| null` in `PULL_REQUEST_FACT_KEYS` / `validatePullRequestFact` at `:1544-1557,1680-1738`), `engram-live/index.ts`, `tests/derived-worktree-d21.test.ts` | **RED:** Rejects raw absolute host realpaths or non-`/^wt:[0-9a-f]{64}$/` worktree IDs (`isValidWorktreeId` + object-level `validateWorktreeIdentity`, `F-15`, `N-01`); rejects unknown uncertainty states outside `IDENTITY_UNCERTAINTY_STATES` (`["missing_history", "shallow_history"]`, `N-01`); rejects cross-clone merging of distinct checkouts. **GREEN:** `DerivedWorktreeNodeV1` binds `deriveCloneIdentity` + `deriveWorktreeIdentity` (`engram-live/registration.ts:312-411`), parent origin (`branched_from_worktree`), `StableCapture` digests (`engram-live/worktree.ts:104-117`), `R1` `removed-retained` state, session logs, `.h2a/overlays/worktrees/{id}.json`, and optional `PullRequestFactDto.mergedAt` (`B2`). **GUARD:** Passive turn recording keeps `liveIndexingState: 'unactivated'` (`A01`). |
| **`1-E5`** | `1-E3`, `1-E4` | `engram-memory/decision-dossier.ts`, `tests/decision-dossier-d27.test.ts` | **RED:** Rejects unanchored persona/trait learning notes, settled decisions without `ContextualizedFactNodeV1` citations, or any human `rendered-view` return fabricating `ComprehensionAttestationRefV1` (`M2`). **GREEN:** Models `decision_dossier` (`D27=decision-only`) with `artifactKind`, `decisionKind`, `targetItemIds`, `DossierOptionV1.questionId`/`recommended`, `DossierQAExchangeV1.recommendedOptionId`/`recommendedAnswer`, `resultingSpecChangeRef`, separated `comprehensionAttestations` vs `humanFocusReceipts` (`M2`), `project_decision` (5-state `engram-track.md` `reviewStatus`, `.track/` target, `m1`), and `harness_decision` (`D3=mandated`, `.h2a/overlays/*` target per `D31`). |
| **`1-E6`** | `1-E3`, `1-E4`, `1-E5` | `engram-memory/live-tracking.ts`, `engram-memory/live-tracking-reconciler.ts`, `tests/live-tracking-reconcile.test.ts` | **RED:** Rejects `pageLimit < 1` or `pageLimit > 100` (`F-07`); `owner.request` without `verbatimText` or `owner.answer` without `authProvenance` fails schema validation (`B2`); same revision `sourceId` with mutated payload fails `DIGEST_CONFLICT` while new revision `sourceId` links via `supersedes` (`F-06`); reconciler attempting direct accepted `Track` write is impossible. **GREEN:** `pr.merged` (admitting `mergeStrategy: 'unknown'` + `mergedAt`, `B2`), `owner.answer` (`decisionId?` / `targetItemIds?`, `authProvenance`, `citation?`), and `owner.request` (`verbatimText`, `citation?`) deduplicate via `deriveSessionFrontIdempotencyKey` (`72` B `idem:v1:<hex>`, `F-03`); bounded paginated reconciler excludes `'empty_verified'` and `'withheld_d7'` from `unproposedCount`, computes O(1) `session-db` ordinal gap, and emits `live_tracking_gap_count` + `live_tracking_sync_staleness_ms` (`F-07`). |

### 8.2 `sentropic` Lots (`@sentropic/cluster-mesh` vs `sentropic/api` Strictly Separated, `<= ~150 LOC`, `Make-Only`)

**Named Scope Exception `BRS1-EX1` (`sentropic:rules/MASTER.md:32-34`, `F-11`):**
- **Target:** `Makefile:1282` (`CLUSTER_MESH_PEER_TOOLS` in the cold `cluster-mesh-workspace` runner, paired in Lot `1-S1a` with `packages/cluster-mesh/package.json:269,294` and `ENGRAM_MEMORY_RANGE` in `packages/cluster-mesh/src/modules/catalog.ts:18`, plus CI wiring pin checks documented in `sentropic`'s `1-S1a` `BRANCH.md`).
- **Justification:** `Makefile:1282` currently pins `@sentropic/engram@0.22.0` (`ENGRAM_MEMORY_RANGE = '>=0.22.0 <0.23.0'`). Cold container verification (`make test-cluster-mesh`, `make typecheck-cluster-mesh`) cannot resolve `@sentropic/engram/session-front-contracts` or the SDK-purged `0.28.x` subpaths unless `CLUSTER_MESH_PEER_TOOLS` is updated in lockstep with `package.json` and `catalog.ts`.
- **Bounded Impact:** Modifies only the `@sentropic/engram` version literal on `Makefile:1282`; zero Make target recipes, Dockerfiles, or harness rules change.
- **Rollback Procedure:** Atomic `git revert` of Lot `1-S1a` restoring `Makefile:1282`, `packages/cluster-mesh/package.json:269,294`, and `packages/cluster-mesh/src/modules/catalog.ts:18` together, verified by `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh`.

| Lot | Depends On (`F-10`) | Atomic Scope (`<= ~150 LOC`; `cluster-mesh` vs `api/` Separated) | TDD `RED → GREEN` & Mandatory `Make-Only` Gate (`ENV=test-*` Last, `F-09`, `N-02`) |
| :--- | :--- | :--- | :--- |
| **`1-S0a`** *(`cluster-mesh`)* | `6A-S0b`, `1-E4` | `packages/cluster-mesh/package.json` (semver bump), `packages/cluster-mesh/src/forge/{contracts,lifecycle,github-api}.ts` (`:40,50-54`, `:101-103`, `:28-38`), `packages/cluster-mesh/src/live-storage/pr-sync-store.ts`, `packages/cluster-mesh/tests/forge/pr-sync-permissions-and-store.spec.ts` | **RED:** `pull_requests: 'read'` currently throws `GitAppAccessLostError` (`forge/contracts.ts:50-54`), `x-github-event: pull_request` returns `400` (`lifecycle.ts:101-103`), `github-api.ts` drops `ETag`/`Retry-After`, and `PrSyncPersistencePort` is unimplemented (`F-05`, `F-08`). **GREEN:** Declarative `GIT_APP_PERMISSIONS` profile admits `pull_requests: 'read'`, `lifecycle.ts` verifies/routes `pull_request` webhooks over raw bytes, `github-api.ts` supports `If-None-Match`/`304` + `Retry-After`/`x-ratelimit-reset`, and `pr-sync-store.ts` implements `PrSyncPersistencePort` + bounded `listObservationsPage` (`limit <= 100`, `F-07`).<br/>**Gate:** `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/forge/pr-sync-permissions-and-store.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh` |
| **`1-S0b`** *(`api/`)* | `1-S0a` | `api/src/services/cluster-mesh/github-app-host.ts` (`:46`), `api/src/services/artifacts/live/forge-github.ts` (`:16-19`), `api/tests/api/github-app-live-declarations.test.ts` | **RED:** Enrolled repo absent from static `GIT_APP_TARGET_REGISTRY` (`github-app-host.ts:46`) is rejected; `304`/`Retry-After` is not propagated to `PrTransportResult.retryAfterMs`. **GREEN:** Resolves targets dynamically via `LiveDeclarationStorePort` (`live-storage/registration.ts:509-515`) while keeping PEM/webhook secrets exclusively in `control.github_app_enrollments` under `SECRET_ENCRYPTION_KEY` (`F-04`, `F-05`), and wires `ETag`/`Retry-After` in `forge-github.ts` (`F-08`).<br/>**Gate:** `make scope-check ENV=test-api && make test-api-unit SCOPE="tests/api/github-app-live-declarations.test.ts" ENV=test-api && make typecheck-api ENV=test-api` |
| **`1-S1a`** *(`cluster-mesh` + `BRS1-EX1`)* | `6A-S0a`, `6A-S0b`, `6A-S1a`, `6A-S1b`, `6A-S1c`, `6A-S1d`, `chat-mesh B1`, `chat-mesh B2`, `1-E1`, `1-E2`, `1-E4` | `packages/cluster-mesh/package.json` (`:269,294` + semver bump), `Makefile` (`:1282` under `BRS1-EX1`), `packages/cluster-mesh/src/modules/catalog.ts` (`:18,108-119`), `packages/cluster-mesh/src/loaders/memory.ts`, `packages/cluster-mesh/src/compose/memory.ts`, `packages/cluster-mesh/tests/session-front-r12.spec.ts`, `packages/cluster-mesh/tests/packaging/types-and-bundlers.spec.ts` | **RED:** Missing/unverified `H2AEnvelope<H2AMandate>` or cross-scope `sourceEventRecordIds` on `POST /v1/session-front/extractions` or `GET /v1/control/proposals` fails `403` (`F-01`, `OQ-S1-3`); `/v1/hmi/input` `> 65_536` B fails `413` (`F-08`); `SqliteKernel` fault returns `503 ClusterMeshMemoryDegradedError`. **GREEN:** Registers `@sentropic/engram/session-front-contracts` in `PROVIDER_CATALOG` (`F-14`); implements `/v1/session-front/ingest` (with `readySlicePayloads`, `M1`), `/v1/session-front/extractions`, `/v1/control/proposals` (`?status=proposed`, `limit <= 100`, `OQ-S1-3`), and `/v1/hmi/input` inside `compose/memory.ts` with sequential two-kernel commit (`1. session-db.entries.append` → `2. engram-memory` + `lastIngestedOrdinal` + `scope-outbox-v1`, `F-02`, `N-02`) and `ContentPolicyV1` sync/retention/`K_pseudo` key-ring checks (`F-02`, `F-15`, `OQ-S1-2`).<br/>**Gate:** `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/session-front-r12.spec.ts" ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/packaging/types-and-bundlers.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh` |
| **`1-S1b`** *(`api/`)* | `1-S1a`, `6A-S1d` | `api/src/routes/namespaces/memory.ts` (`MEMORY_PATHS` wiring only — zero `api/src/routes/memory/session-front.ts` file, `F-01`), `api/tests/api/memory-session-front.test.ts` | **RED:** Unauthenticated caller fails `401`/`403`; Mode B store fault returns `503`; static check fails if `api/src/routes/memory/session-front.ts` exists (`F-01`). **GREEN:** Exposes `/api/v1/memory/v1/session-front/{ingest,extractions}`, `/api/v1/memory/v1/control/proposals`, and `/api/v1/memory/v1/hmi/input` through `api/src/routes/namespaces/memory.ts` with zero diff on 38-route `RECEIVER_ROUTE_TABLE` (`session-content/route-table.ts:60-100`).<br/>**Gate:** `make scope-check ENV=test-api && make test-api-unit SCOPE="tests/api/memory-session-front.test.ts" ENV=test-api && make typecheck-api ENV=test-api` |
| **`1-S2`** *(`cluster-mesh`)* | `1-S1a`, `1-E3`, `6A-S0a`, `6A-S1b`, `6A-S2`, `chat-mesh C2a` | `packages/cluster-mesh/package.json` (semver bump), `packages/cluster-mesh/src/compose/memory/llm-extraction-bridge.ts`, `packages/cluster-mesh/tests/memory-llm-mesh-extraction.spec.ts` | **RED:** Direct provider HTTP call, missing `VerifiedRoutingSubject` (`routing-contracts.ts:13-17`), missing `RouteMeteringSink` (`chat-mesh C2a`), or host SDK client injection fails; `chat-server` `G-FENCE` import check fails on any `engram` import (`F-12`, `F-13`). **GREEN:** Bounded async queue (`F-08`) routes `'light-permanent-llm'` (`'mesh-fast'`), `'session-llm'` (`RoutePlanInput` `requestedModel` + `affinityKey`), `'specialized-model'`, and `D7` triage solely via `@sentropic/llm-mesh` (`>=0.38.0 <0.39.0`) / `./decision`, recording `PreparedRouteAttempt.attemptRef` and invoking `recordExtraction` in-process under `MemoryNeutralGrant` (`F-01`).<br/>**Gate:** `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/memory-llm-mesh-extraction.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh` |
| **`1-S3a`** *(`api/`)* | `1-S0b`, `1-S1b`, `1-E6` | `api/src/services/github-hmi/memory-bridge.ts`, `api/tests/api/hmi-live-tracking.test.ts` | **RED:** Invalid `X-Hub-Signature-256`, body `> 262_144` B (`413`), rate-limit breach (`429`), foreign repo (`403`), or unbound numeric `sender.id` claiming `owner.*` (`403`, `F-04`) is rejected; Mode B returns `503` so GitHub redelivers (`F-02`). **GREEN:** Bridges verified `forge` `pull_request` webhooks and `GitInstallationLeasePort.acquire` `pr-sync` `PullRequestFactDto` merges (`F-04`, `F-05`) into `/memory/v1/hmi/input` (`pr.merged`, `idem:v1:<hex>` key, `F-03`).<br/>**Gate:** `make scope-check ENV=test-api && make test-api-unit SCOPE="tests/api/hmi-live-tracking.test.ts" ENV=test-api && make typecheck-api ENV=test-api` |
| **`1-S3b`** *(`cluster-mesh`)* | `1-S0a`, `1-S1a`, `1-S2`, `1-E6` | `packages/cluster-mesh/package.json` (semver bump), `packages/cluster-mesh/src/compose/memory/live-tracking-reconciler-host.ts`, `packages/cluster-mesh/tests/memory-live-tracking-reconciler.spec.ts` | **RED:** `pageLimit > 100` fails `INVALID_SCHEMA`; `'withheld_d7'` or `'empty_verified'` events never increment `unproposedCount` (`F-07`). **GREEN:** Runs cursor-paginated `LiveTrackingReconcilerPort` over `listObservationsPage` (`<= 100`) and O(1) `session-db` `maxCommittedOrdinal - lastIngestedOrdinal`, and publishes `live_tracking_gap_count`, `live_tracking_pending_verdict_count`, `live_tracking_sync_staleness_ms`, and `D17` health gauges on `GET /memory/v1/health` (`F-07`, `OQ-S1-3`).<br/>**Gate:** `make scope-check ENV=test-cluster-mesh && make test-cluster-mesh SCOPE="tests/memory-live-tracking-reconciler.spec.ts" ENV=test-cluster-mesh && make typecheck-cluster-mesh ENV=test-cluster-mesh` |

### 8.3 `h2a` Lots (`@sentropic/h2a`, `@sentropic/h2a-runtime`, `@sentropic/track`)

| Lot | Depends On | Scope (≤12 Files) | RED → GREEN → GUARD Test Cases (`packages/h2a/test/*.test.js` via `node --test`; `packages/{h2a-runtime,track}/src/**/*.test.ts` via Vitest; `scripts/test-inventory.json`) |
| :--- | :--- | :--- | :--- |
| **`1-H1`** | `6A-H1`, `6A-H2`, `6A-H3`, `1-S1a`, `1-S1b`, PR #455 (`844402ee`) | `packages/h2a/src/hosts/plugin.ts` (`new` `PostToolUse` & `UserPromptSubmit` hook generators + `SessionStart`/`PreToolUse` flush), `packages/h2a/hooks/{hooks.json,vibe-post-agent.mjs,vibe-post-tool.mjs}` (`vibe-post-tool.mjs` `new`), `packages/h2a/src/hosts/session-front-client.ts` (`new`), `packages/h2a/src/hosts/{operator-notices.ts,status-surface.ts}` (reused from `6A-H3`; zero `src/runtime/memory/*.ts` revival), `packages/h2a/test/plugin-session-front.test.js` (`new`), `scripts/test-inventory.json` | **RED:** Static AST guard fails on any direct `@sentropic/engram` runtime import (`R12`) or any `*.test.ts` under `packages/h2a/src/` (`tsconfig.json:10-12`); `503 ClusterMeshMemoryDegradedError` writes **zero** fallback memory JSONL in `~/.h2a/` or `.track/`. **GREEN:** All 8 CLI hosts (`claude`, `codex`, `gemini`, `agy`, `hermes`, `opencode`, `muse`, `vibe` — including `vibe-post-tool.mjs` + extended `vibe-post-agent.mjs` / `h2a drumbeat record`, `agy`/`muse` `5_000 ms` `[1_000 ms, 30_000 ms]` `session-db` poll in `h2a-runtime` seats, **and** immediate opportunistic flush on MCP tool calls / `SessionStart` / `PreToolUse` / `drumbeat scan` for standalone `agy`/`muse` CLI sessions, `M1`, `OQ-S1-4`) record turns/tool results/mandates via `/memory/v1/session-front/ingest`, inject `readySlicePayloads` (`M1`), surface the 8-host `D17` banner via `operator-notices.ts` + `status-surface.ts` (`6A-H3`), and persist the Mode B ordinal replay marker (`mandate_binding` + `context_saturation`, `F-02`). **GUARD (PR #455 `844402ee`):** Preserves all 4 PR #455 invariants: `BridgeLock` auto-repair on `auto-upgrade` (`bridge-lock.ts:336-445`, `host-bootstrap.ts:1646-1775`), `central_unavailable` fail-closed error (`shim-bridge.js:49,309-387`), `prefix_owner_mismatch` refusal (`admission.js:102`, `authority.js:28`), and non-stale tool view refresh in `h2a-bridge-shim.mjs` (`B1`). |
| **`1-H2`** | `1-H1`, `1-E4`, `1-E6` | `packages/h2a-runtime/src/delegate.ts`, `packages/h2a-runtime/src/gateway-host/live-github.ts` (`:165-179`, preserving `mergedAt: merged ? timestamp(row.merged_at) : null`), `packages/h2a-runtime/src/retention/d14-host-purge.ts` (`new`), `packages/h2a-runtime/src/derived-worktree-lifecycle.test.ts` (`new` at root `src/`), `packages/h2a-runtime/src/live-tracking-emitter.test.ts` (`new` at root `src/`), `scripts/test-inventory.json` | **RED:** Removing `.h2a/jobs/<jobId>/wt` (`delegate.ts:758-810`) without `R1` retention receipt reports explicit `retention_gap`; session start never flips `liveCapability: "live"` (`A01`); unmerged or null-`mergeOid` PR never emits `pr.merged`. **GREEN:** Binds job/linked worktrees to `isValidWorktreeId`-validated `D21` `derivedWorktreeId` (`F-15`, `N-01`), preserves `mergedAt` + `mergeStrategy: "unknown"` in `live-github.ts:165-179` (`B2`), forwards local `gh` P1 merged PR observations (`G-NOSECRET`) as `D30` `pr.merged` inputs, enforces `h2a` orchestration policy forbidding direct `.track/` writes in work branches (`B2`), and executes `D13`/`D14` post-window host purge after `PurgeAnnouncementReceiptV1`; registers both root `src/*.test.ts` suites in `scripts/test-inventory.json` (`B1`). |
| **`1-H3`** | `1-H1`, `1-E5` | `packages/h2a/src/runtime/focus/dossier-ingest-bridge.ts` (`new`), `packages/h2a/src/decision-dossier.ts` (`:39-48`), `packages/h2a/test/dossier-ingest.test.js` (`new`), `scripts/test-inventory.json` *(zero network/`h2a` imports in `@sentropic/focus-interactive`; optional pure helper test in `packages/focus-interactive/test/*.test.js`)* | **RED:** Static package-boundary guard fails if `packages/focus-interactive` imports `@sentropic/h2a`, `@sentropic/cluster-mesh`, or network I/O (`package.json:6`, `sync.ts:11-16`, `B1`); rejects any human `rendered-view` / `canevas` return (`answeredBy: "local-human"`) fabricating `ComprehensionAttestationRefV1` (`M2`), impersonated `subject === relayingChannelPrincipal`, or settled dossier without `ContextualizedFactNodeV1` citations. **GREEN:** Routes human Focus / `canevas` / `present-decision` `HumanFocusReceiptV1` (`runtime/focus/{serve,edit-receipts}.ts`, `runtime/canevas/{answer,reply,serve}.ts`, `responseLine`) via `dossier-ingest-bridge.ts` and signed inter-agent `h2a-decision-dossier` `ComprehensionAttestationRefV1` via `decision-dossier.ts` through `cluster-mesh` into `decision_dossier` + `project_decision` / `harness_decision` (`B1`, `M2`). |
| **`1-H4`** | `6A-H1`, `1-S1a`, `1-S1b`, `1-E6`, `Spec 0` Lot `0.3` | `packages/track/src/control/engram-proposal-evaluator.ts` (`new`, pure injected ports), `packages/track/src/ingest/engram-live-tracking.ts` (`new`, pure injected ports), `packages/track/src/control/engram-proposal-evaluator.test.ts` (`new`), `packages/h2a-runtime/src/track-cluster-mesh-client.ts` (`new`), `packages/h2a-runtime/src/track-cluster-mesh-client.test.ts` (`new`), `scripts/test-inventory.json` | **RED:** `6A-H1` zero-dependency CI guard fails on any `@sentropic/engram` or `@sentropic/cluster-mesh` dependency/import in `packages/track` (`B1`) or any hardcoded single-writer `.track/` rule in `@sentropic/track` skills (`B2`); unratified `proposed` project write or self-approved third-party promotion (`D1=borne-review`) is refused; owner-report audit fails if any `wt:<64hex>`, `actor_pseudo:<hex>`, or `Sha256Digest` leaks into `.track/` text fields (`m2`). **GREEN:** `engram-live-tracking.ts` maps `pr.merged` → `item.add-link` (`kind: 'pr-merged'`) + `item.realize` + `item.consolidate`/`item.anchor`, `owner.answer` → `decision.select`/`decision.outcome` (with `decisionId`) or verbatim `item.add-link` (with `targetItemIds`), and `owner.request` → `demand.raise` (`DemandRaw.text = verbatimText`) / `item.create` (`B2`); `track-cluster-mesh-client.ts` wires `/memory/v1/track/stream`, synchronous pre-PR `listPendingProposals` (`GET /memory/v1/control/proposals?status=proposed`, `OQ-S1-3`), and `POST /memory/v1/control/verdicts` (`verdictAuthority: 'track'`, 5-state `engram-track.md` `reviewStatus`, `Point 5B`, `m1`). |

---

## 9. Resolved Design & Operational Questions (`sentropic` & `h2a` / `Track` Reviews Folded)

None of the items below reopen `D1`–`D34` or `OWNER-DECISIONS-2026-11-14.md` (`T-M-C`, `1B`–`6A`, `D28` kept). All five operational parameters have been answered and ratified across the `sentropic` (`2026-11-14` / `2026-11-15`) and `h2a` / `Track` (`2026-11-15`) reviews:

1. **`OQ-S1-1` (`engram` + `sentropic` + `h2a`/`Track` — Default `D12=turn` Extraction Route Profile, `'session-llm'`, and `session_summary` Thresholds) — *resolved (`sentropic` 2026-11-14; confirmed by `h2a`/`Track` 2026-11-15)*:**
   - **Default route & `'session-llm'` policy:** Default extraction uses `policyProfile: 'mesh-fast'` (`intent: 'fast'` in `@sentropic/llm-mesh`). `'session-llm'` is authorized solely as a `RoutePlanInput` model/affinity selector (`requestedModel` + `affinityKey` under `VerifiedRoutingSubject`) executed inside `@sentropic/llm-mesh` on the `cluster-mesh` side (`PreparedRouteAttempt.attemptRef`), never injecting a host SDK client into `engram` and never importing `engram` in `chat-server` (`G-FENCE`; folded into §2.1 & §2.3.1, `F-13`). Phase-1 classification stays coherent with `T-M-C` because every `project`-domain candidate remains in `reviewStatus: 'proposed'` until an authoritative `TrackControlVerdict` (§2.3).
   - **`session_summary` trigger thresholds:** Rolling `session_summary` (`context_summary`) compaction defaults to **`turnCountThreshold = 24` turns** or **`byteBudgetThreshold = 65_536` UTF-8 bytes** (aligned with the `64 KiB` frame ceiling), plus immediate trigger on `context_saturation` and session close, configurable by `policyProfile` (folded into §1.5 rule 3).
2. **`OQ-S1-2` (`sentropic` + `h2a` — `D33` Scope Pseudonymization Key Sync) — *resolved (`sentropic` & `h2a`, 2026-11-15)*:**
   - Optional multi-workstation synchronization of `K_pseudo` under `D24` transits `cluster-mesh`'s encrypted workspace enrollment key-ring stored in the OS secret store / local keychain, strictly outside `engram` SQLite tables (`G-NOSECRET`) and outside all Git-tracked files. Without explicit multi-workstation enrollment, `K_pseudo` remains strictly workstation-local (`0600`) and never transits `.h2a/` or `.track/` (folded into §5.1).
3. **`OQ-S1-3` (`engram` + `sentropic` + `Track` — Live-Tracking Reconciliation Cadence, Pre-PR Drain, & Alert Thresholds, `owner-r10/suivi-direct-2026-11-07.md:6`) — *resolved (`sentropic` 2026-11-14; `Track`/`h2a` 2026-11-15)*:**
   - **`sentropic` alert thresholds:** Alert when `unrecordedRawCount > 0` persists for **`> 5 min` (`300_000 ms`**, exceeding `PR_SYNC_OVERLAP_MS = 300_000` in `engram-live/pr-sync.ts:33`) or when `unproposedCount > 0` (excluding terminal dispositions `'withheld_d7'` and `'empty_verified'`, `F-07`) persists for **`> 10 min` (`600_000 ms`)**, coupled with **`live_tracking_sync_staleness_ms > 900_000` (`15 min`)** (folded into §6.3).
   - **`Track` synchronous pre-PR sweep:** Before calling `serializeProjectPrSlice` (or `replayBeforeMerge`), the `Track` conductor synchronously drains pending proposals via `listPendingProposals` (`GET /memory/v1/control/proposals?status=proposed`), submits `TrackControlVerdict` (`POST /memory/v1/control/verdicts`) for all slice proposals with complete evidence, and leaves human-arbitration items explicitly in `'proposed'` (excluded from the PR slice per §2.3; folded into §1.2, §6.3, §8.2 `1-S1a`, and §8.3 `1-H4`).
4. **`OQ-S1-4` (`h2a` — Poll Cadence & Opportunistic Flush on `agy` and `muse` CLI Hosts) — *resolved (`h2a`, 2026-11-15)*:**
   - When `agy` or `muse` runs inside an `h2a-runtime` PTY seat writing to `session-db`, `SessionDbFallbackCursor` uses a nominal **`5_000 ms` interval bounded to `[1_000 ms, 30_000 ms]`**; to cover standalone `agy` and `muse` CLI sessions launched outside `h2a-runtime` (`push: false`, `plugin.ts:107-113,128-134`), `1-H1` pairs it with an immediate opportunistic flush on every MCP tool call (`h2a registry-bridge serve` / `mcp-central`), on `SessionStart` / `PreToolUse` (`plugin.ts:22-43`), and on `h2a drumbeat scan` (folded into §1.4, §1.5 rule 2, and §8.3 `1-H1`).
5. **`OQ-S1-5` (`sentropic` + `Track`/`h2a` — Phase-2 GitHub Issues / Reviews / Boards Subset for `D30` & Worktree Overlay Isolation) — *resolved (`sentropic` 2026-11-14; confirmed by `h2a`/`Track` 2026-11-15)*:**
   - Restrict Spec 1 (`§1.4`, `§6.1`, and `§8.2` `1-S3a`/`1-S3b`) strictly to the **GitHub PR flow (`engram-live/pr-sync.ts` `PullRequestFactDto` + `forge` `pull_request` webhook → `pr.merged`) plus authenticated `session-db` (`owner.answer`, `owner.request`)**, unlocked by `1-S0a`/`1-S0b`, while keeping untracked local worktree overlays isolated in `.h2a/overlays/worktrees/{derivedWorktreeId}.json` (§3.2). Defer GitHub issues (`github-issue`), PR review comments (`github-review`), and `ProjectsV2` boards (`project-board`) to a follow-up `D30` HMI specification after extending `cluster-mesh/forge` permissions/webhook events, dedicated `engram-live` contracts, and verified numeric `sender.id` → Sentropic principal identity binding (`F-04`, `F-05`; folded into §1.4, §3.2, & §6.1).

## Pointer (2026-11-20)

**2026-11-20 pointer.** `spec/SPEC_ENGRAM_SESSION_JOURNAL_AND_CONTEXT_QUERY.md` (`v0.1.2`, owner GO of 2026-11-20) supersedes `spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md`. Its §8 lists, row by row, the lines of this specification that change, each with a Before and an After. Until the author of this specification folds those rows into the text, a line named in §8 is read with its After. `plan/10-BRANCH_MEMORY_SESSION_JOURNAL.md` builds the lots of this specification with those rows applied. Nothing else in this specification changes.
