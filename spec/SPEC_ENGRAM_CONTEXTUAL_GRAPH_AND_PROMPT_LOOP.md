# Spec 2 — Contextual Graph Replacing Linear Context, and the Seventh Memory Tool (`SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP`)

- **Spec ID:** `SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP` (Spec 2 in [`spec/memory/PLAN_SPEC_ENGRAM_FRONT.md`](memory/PLAN_SPEC_ENGRAM_FRONT.md), §3 `:174-186` and §4 `:241`)
- **Stage:** `DESIGN` (`Gemini Carbon`)
- **Status:** `proposed`
- **Version:** `0.1.0`
- **Date:** `2026-11-15`
- **Repository of Record:** `engram` (`@sentropic/engram` `0.28.0`, branch `docs/memory-r15-sediment`, verified commit `d5eb6171200167acf5b81bb5ce2f39d8cc802dd9`, `registry/entries.v1.json:14`, `src/ontology-guardian/app-context-registry.ts:354`) `[FACT: spec/memory/R15-SEDIMENT.md:4; spec/memory/PLAN_SPEC_ENGRAM_FRONT.md:4,176]`
- **Primary Owner:** `engram` (consumed by the `h2a` durationless prompt assembler across all 8 CLI hosts and registered/dispatched exclusively via `@sentropic/cluster-mesh` and `@sentropic/mcp-platform`, `R12`) `[FACT: spec/memory/PLAN_SPEC_ENGRAM_FRONT.md:176; spec/memory/ARCHITECTURE-RULES.md:5]`
- **Dependencies:**
  - [`spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md`](SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md) (`Spec 0`: `Sha256Digest` `:144`, `LineageId` `:147`, `OntologyTemplateEnvelopeRef` `:149-154`, `H2AMandateEnvelope` `:161-174`)
  - [`spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md`](SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md) (`Spec 6A` `v0.2.0`: `R12` `/memory/v1/*` & MCP registry dispatch `§2–§3`, seventh tool outer wire envelope `EngramMemoryContextInputEnvelopeV1` / `EngramMemoryContextOutputEnvelopeV1` and `CapabilityTool` gates `§4.2` `:535-603`, 8 freeze guards and three-gate `BridgeLock` / `mcp-central` / `shim-bridge` host-by-host switchover `§4.3` `:604-641`)
  - [`spec/SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md`](SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md) (`Spec 1` `v0.2.0`: `EngramSessionIngestFrontPort` raw `session_turn` / `tool_result` / `owner.answer` / `owner.request` ingestion, `ToolResultSignificance` `:214-218`, `SessionDbCitationTuple` `(sessionId, entryId, ordinal, contentDigest, branchEpoch?, parentEntryId?)`, `DerivedWorktree` `D21`, `decision_dossier` `D27`, `ConfidentialityDenyListV1` `D7`, `PiiArmorStamp` `D8`, `D33` HMAC pseudonyms, and `PurgeAnnouncementReceiptV1` `D13`/`D14`)
- **Binding Authorities:**
  - [`spec/memory/OWNER-DECISIONS-2026-11-14.md`](memory/OWNER-DECISIONS-2026-11-14.md) (`:1-29` — `T-M-C` ownership rule, ratified Points `1B`, `2B`, `3C`, `4B`, `5B`, `6A`, and `D28` kept unchanged)
  - [`spec/memory/R15-SEDIMENT.md`](memory/R15-SEDIMENT.md) (`:1-173` — Engram-First Principle and settled decision ledger `D1`–`D34`, never reopened)
  - [`spec/memory/ARCHITECTURE-RULES.md`](memory/ARCHITECTURE-RULES.md) (`:1-13` — `R12` no-bypass invariant, `D30` three-layer separation, `archi@1` invariance)
  - [`spec/memory/DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md`](memory/DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md) (`:1-35` — `engram` returns semantic graph slices, references, and digests only; never UI/design-system layout, fold, or rendering state)
  - [`spec/memory/contracts/engram-h2a.md`](memory/contracts/engram-h2a.md) (`:99-155` — `EngramMemoryContextToolInput` / `EngramMemoryContextToolOutput`), [`spec/memory/contracts/engram-cluster-mesh.md`](memory/contracts/engram-cluster-mesh.md) (`:1-181`), [`spec/memory/contracts/engram-track.md`](memory/contracts/engram-track.md) (`:1-247`)
- **Amends (Listed as Exact `Before → After` Deltas in §6; Target Files Unmodified in This Lot):**
  - [`spec/SPEC_MEMORY_MCP_V2.md`](SPEC_MEMORY_MCP_V2.md) (`M1` lines `47–76`, `M7` lines `536–580` with manifest at `:553` plus per-tool gate tables at `:590–617`, and `M10` lines `884–910`)
  - [`spec/SPEC_MEMORY_FINALIZATION.md`](SPEC_MEMORY_FINALIZATION.md) (`§0–§2`, lines `1–60`)
- **Evidence Baseline Verified (Read-Only, Separating Shipped Code from `PROPOSED` Non-Existent Surfaces):**
  - `engram` (`/home/antoinefa/src/graphify-wt-memfinal`, `@sentropic/engram` `0.28.0` at commit `d5eb6171200167acf5b81bb5ce2f39d8cc802dd9`):
    - *Exists today:*
      - Six frozen MCP memory tools (`v1` profile): `src/mcp/memory/contracts.ts:143-191` (`ENGRAM_MEMORY_PROVIDER_ID = 'sentropic.engram.memory'` `:143`, `ENGRAM_MEMORY_CONNECTOR_ID = 'engram-memory'` `:144`, `ENGRAM_MEMORY_APP_ID = 'engram'` `:145`, `ENGRAM_MEMORY_TOOL_NAMES` 6-tuple `:149-156`, `DISCLOSABLE_MEMORY_STATES = ['accepted_current']` `:234`, `MEMORY_MCP_LIMITS` `:266-298`, `ToolSuccessV1<T>` / `ToolFailureV1` `:437-458`, `PaginationHandleStateV1` `engram_owns_signing_secret: false` `:585-613`); `src/mcp/memory/gates.ts:141-312` (`ENGRAM_MEMORY_CAPABILITY_GATES`, `ENGRAM_MEMORY_TOOL_DESCRIPTORS` `:283-290`, `ENGRAM_MEMORY_PROVIDER_MANIFEST` `:292-312`); `src/mcp/memory/errors.ts:29-72,84-397,404-410,437-440,565-631` (27 `NEUTRAL_MEMORY_ERROR_CODES` + 4 `ADDITIONAL_PUBLIC_MEMORY_ERROR_CODES` = 31 `PUBLIC_MEMORY_ERROR_CODES`, sanitized constant messages, `-32603` `'Trusted invocation context unavailable'`); `src/mcp/memory/receipts.ts:100,124-126` (`minItems: 6, maxItems: 6`); `src/mcp/memory/schemas.ts:1-120,3170-3340`; `src/mcp/memory/topology.ts:1-120`; `src/mcp/memory/standard/manifest.ts:1-170`; `src/mcp-memory/index.ts:1-92`; `src/mcp-memory/profiles.ts:7-31` (`MEMORY_FROZEN_PROFILE_BINDINGS_V1`); `src/mcp-memory/provider.ts:169-309,391-406,458-465,648-891` (9-step `invokeTool` pipeline; `:458` asserts `ENGRAM_MEMORY_TOOL_DESCRIPTORS.length !== 6`); `src/mcp-memory/server.ts:38-40,155-203,256-302` (`COMBINED_RESULT_CEILING_BYTES = 2_097_152`); `src/memory-tools/reads.ts:28-64,113-183` (`createMemoryReadPageStoreV1`, `page_<48hex>`, `receiptDigest('memory-page-binding', ...)`, double-read `as_of` pin check).
      - `app-context` 5-tool precedent & retrieval/budget helpers: `src/app-context/types.ts:175-213` (`AppContextErrorCode` including `"cursor-invalid"` `:179` and `"budget-too-small"` `:181`; `AppContextToolName` 5-tuple `:183-189`; out-of-band `AppContextCallerAuditClaim` `:190-198` and `AppContextAuditSinkV1` `:200-213`); `src/app-context/node-id.ts:37-45` (`appContextNodeId` using JCS `canonicalBytes`); `src/ontology-guardian/app-context-registry.ts:327-333,354` (`linkedTools`); `profiles/app-context/v1/profile.yaml:1-544`; `registry/entries.v1.json:8,14`; `src/serve.ts:331-380` (`MIN_RESPONSE_TOKEN_BUDGET = 128`, `responseTokenBudget` default `2000`, `cutLinesToBudget` at `3` UTF-8 bytes/chars per token with truncation metadata counted inside budget); `src/retrieval/answer-pack.ts:149,186,235-399` (`DEFAULT_TOKEN_BUDGET = 2000`, BM25 + RRF `k = 60` + Personalized PageRank `alpha = 0.85` lift-over-background specificity + PathRAG shortest paths); `engram-memory/recall.ts:27-57,105-160` (`BM25F` field weights `primary: 3.0, decision: 2.0, evidence: 1.5, context: 1.0, citations: 0.5`, `HALF_LIFE_MS = 30d`, `RRF_K = 60`, `PPR_ALPHA = 0.85`); `engram-memory/bounded-projection.ts:22-169` (`52_428_800` B raw-byte ceiling).
    - *Does NOT exist yet at `d5eb6171` (`PROPOSED`):* `engram_memory_context` descriptor/schema/dispatch in `src/mcp/memory/*` and `src/mcp-memory/*`, `MEMORY_PROFILE_BINDINGS_V2` (`sentropic.engram.memory-wire/v2`, `sentropic.engram.memory-tools/2020-12-v2`), `src/memory-tools/context.ts` (`MemoryContextPortV1`, `createMemoryContextPageStoreV1`, `packContextEnvelopeToBudget`), `engram-memory/contextual-graph-query.ts` (mandate-primary role-consciousness fingerprint query `D22`, `D5` same-role pending-body filter, `D6` path+fingerprint gate, `D7` sensitivity-triaged reranker over `@sentropic/llm-mesh`, `D23` attention scorer + on-demand `turn_text` query), and `src/app-context/mcp-tools.ts` (`app-context` Lot L6 runtime handler).
  - `sentropic` (`origin/main` at commit `913e3bcbc9dec9ff5f9db36eb3a1ef5a3dd11b7a`):
    - *Exists today:* `packages/mcp-platform/src/memory/contracts.ts:40-66` (`MEMORY_TOOL_NAMES` 6-tuple, `MUTATING_MEMORY_TOOL_NAMES`), `packages/mcp-broker/src/memory/compiled-dispatch.ts:156-195`, `packages/cluster-mesh/src/integrations/mcp/{memory-manifest,memory-compose,memory-definition,memory-transport}.ts`, `packages/cluster-mesh/src/sessions/content-policy.ts:89-164` (`ContentPolicyV1`, `computeRetentionDeadline`), `packages/llm-mesh/src/decision/index.ts:1-16`, `packages/llm-mesh/src/routing-contracts.ts:13-75,190-222`.
    - *Does NOT exist yet at `913e3bcbc` (`PROPOSED` across Spec 6A + Spec 2):* `contextToolsEnabled` / `CoSignatureReceiptV2` verification in `mcp-platform` and `cluster-mesh`, `h2a_context_mandate` claim projection from `SignedH2AMandateWireEnvelope` / recorded `D18` read-only policy, and `D7` reranking route registration on `@sentropic/llm-mesh`.
  - `h2a` (`origin/main` at commit `1f57127de` + `OPEN` prerequisite PR #455 `fix/registry-bridge-missing-lock` at `844402eeae1161d74304e634790904785cbb602c`):
    - *Exists today:* `packages/h2a/src/runtime/loop/engine/tick.ts:41-75` (tick execution loop), `packages/h2a/src/envelope.ts:109-150` (`H2AEnvelope<H2AMandate>`), `packages/h2a/src/hosts/plugin.ts:63-212`, `packages/h2a/src/registry/{bridge-lock,descriptors,host-bootstrap,sentropic-daemon}.ts` (with PR #455 `rebootstrapMissingPluginLock` at `host-bootstrap.ts:1646-1775` and `installation-doctor.ts:2432-2440`), `packages/h2a/src/runtime/{mcp-central,mcp-central-shim,mcp-central-policy,mcp-central-qualification}.ts`, `packages/h2a/src/runtime/handover/{shim-bridge,catalogue}.js`.
    - *Does NOT exist yet at `1f57127de` (`PROPOSED`):* durationless per-step prompt assembler (`packages/h2a/src/runtime/context/durationless-prompt-loop.ts`), `D15` independent five-slice injector (`slice-injector.ts`), `D18` recorded non-memory read-only slice guard (`readonly-slice-policy.ts`), `D14` post-audit-window host cache purger (`host-context-purge.ts`), and `ContextToolHostSwitchoverPolicy` per-host `shim-bridge` masking (`6A-H3` / `2-H4`).

---

## 0. Binding Governance, Settled Verbatims, and Scope Boundaries

### 0.1 Binding Owner Verbatims (`Never Reopened`)

This specification designs the durationless contextual prompt loop and the seventh MCP memory tool (`engram_memory_context`). None of the settled decisions `D1`–`D34` in [`spec/memory/R15-SEDIMENT.md`](memory/R15-SEDIMENT.md) (`:40-80`) or the binding 2026-11-14 architecture decisions in [`spec/memory/OWNER-DECISIONS-2026-11-14.md`](memory/OWNER-DECISIONS-2026-11-14.md) (`:1-29`) are reopened.

1. **`T-M-C` Ownership Rule and `Point 2B` (Seventh Tool Built Disabled by Default, Envelope-Only Domain Slices, Co-Signed Activation, Fixed-Deadline Host Switchover)** (`spec/memory/OWNER-DECISIONS-2026-11-14.md:6-7,9-15,22`):
   - > « Les question sont pas assez detaillees. Pose les ici. On est en train de faire des modif coté track sjr les ontologies de son domaine, il fdoit en rester maitre au moins piur les templates et engram pour leur metamodel et application track pour leur controle. Mene un tour avec h2a rapide en fable 5.2 + carbon et repose les 6 quesfion a l issi »
   - > « Tout comme recommandé »
   - Ratified `Point 2B` summary (`OWNER-DECISIONS-2026-11-14.md:22`): *« Spec 2 is written and the seventh tool is built now, disabled by default. It goes live only after the engram + sentropic co-signature and production qualification. Hosts then switch one by one, with a fixed end date. The tool contract fixes only the envelope (template reference and digest), never the list of Track types. »*

2. **Contextual Graph Replacing Linear Session Context and Dormant Dreaming Recall (`D19`)** (`spec/memory/R15-SEDIMENT.md:64`):
   - > « Ca manque serieusement de profondeur. J ai demande que l un graph contextuel remplace le contexte. Et qu on ai un processus dormant (dreaning agent) de resynthese de session sur une periode (daily, mi journee, a saturation du contexte) » (`comments-2026-11-08.md:3`)

3. **Seventh Memory Tool Carrying Adaptive Context (`D20=seventh`)** (`spec/memory/R15-SEDIMENT.md:65`):
   - > « Je vois pas comment tu gere adapte sans outil memoire » (`comments-2026-11-08.md:4`)

4. **Derived Git Worktree Modelling (`D21`, Consumed via `derived_worktree_id`)** (`spec/memory/R15-SEDIMENT.md:66`):
   - > « J ai demande un [nom retiré à ta demande] like et c est cette merde que j ai les donmees sont pas modelisees » (`comments-2026-11-08.md:5`)

5. **Role-Consciousness Graph Fingerprint with Formal `h2a` Mandate as Primary Component (`D4=mandate`, `D22`)** (`spec/memory/R15-SEDIMENT.md:49,67`):
   - `D4`: > « les rôles h2a devrait êter aussi dans engram mais en tant que registre managé par le gestionnaire de mandats et role h2a. » (`owner-r8/comments-2026-11-07.md:17`)
   - `D22`: > « Le choix est mal posé et je me demande sur quelle base de spec les decisions sont prises. On dojt atteimdre une forme de conscience dans le role. L empreinte etant unenrequet graphe dans le quel le mandat eat un composant primaire. Donc de base je dirais c est pile entee les deux ce qu ej ai en tete » (`comments-2026-11-08.md:6`)

6. **Durationless Independent Prompt Loop, Attention-Driven Retrieval, Elimination of Session Rollover, and Queryable Session Text History (`D23`)** (`spec/memory/R15-SEDIMENT.md:68`):
   - > « La memoire graphe devrait remplacer le conexte en une forme de resumé a chaque etape c etait ma demande. Le mode dreaming veenant rappelera des choses permanentes oubliees sur le court terme. Il ne doit jamais y avkir de relve ou bie chaque prompt devrai etee independant ne dependre que de la memoire et du resultat precedeent reprocessé. L idee eat d etre idependant et sans duree. Mais tu semble avoir effacé cet objectif. Ce faisant tu perennise de mauvais patterns de memoire lineraire. La memoire fonctionne par de l attention […] » (`comments-2026-11-08.md:7`)
   - > « Comme je disais precedemment un contexte de session devrait etre une requete contextuelle a la memoire + le resultat de la requete. L envoi au llm ne devrait pas envoyer de vieux contexte. L historique de sessions serait juste acceasible via la memoire comme gestionnaire de session et memoire (on garde l historique de texte en query via le graph memoire) » (`comments-2026-11-08.md:8`)

7. **Access, Disclosure, Non-Blocking Slices, Identity-Less Sessions, and Audit-Window Purge (`D5`, `D6`, `D7`, `D8`, `D14`, `D15`, `D18`)** (`spec/memory/R15-SEDIMENT.md:50-53,59-60,63`):
   - `D5` (`same-agent`): *« Cross-session recall before admission is scoped to the same `h2a` role within the same `(tenantId, workspaceId)` space. Successive sessions of the same h2a role, in the same space, read the non-admitted bodies »* — owner verbatim: > « meme role h2a meme espace. » (`owner-r8/comments-2026-11-07.md:21`)
   - `D6` (`refs`): *« Without content authorization, only a path and its fingerprint may be sent to the external model. The model can cite files, without content or extract. Dreaming summaries, caches and logs follow the same rule »* (`answers-2026-11-08.compact.md:4`; `kit:2301-2304,2310`).
   - `D7` (`model`): > « de base empreintes + triage de sensibilité pour faciliter stp (possibilité de gérer une black list de confidentialité a prevoir dans la memoire pour un agent de controle de memoire type PII) » (`owner-r8/comments-2026-11-07.md:15`)
   - `D8` (`bounded`): > « metadonnées deterministes + extrait bornés (voir le meme sujet décision précédente il faut un mécanisme de type armor PII pour faciliter le partage) » (`owner-r8/comments-2026-11-07.md:13`)
   - `D14` (`window`): *« After close, processed items remain presented for the D13 duration, which serves the audit. Then presentation stops and the purge is announced »* (`answers-2026-11-08.compact.md:5`; `kit:3007-3010`).
   - `D15` (`slices`): *« Hook activation does not wait for the whole model. Each context slice (Track, Git, architecture, rules, memory) is injected as soon as its criteria pass »* (`answers-2026-11-08.compact.md:5`; `kit:3100-3103`).
   - `D18` (`readonly`): *« A session without a memory identity receives only the non-memory slices (Track, Git, architecture, rules), read-only, under a recorded policy that lists the allowed slices. It receives no memory content »* (`answers-2026-11-08.compact.md:5`; `kit:3301-3304`).

### 0.2 Strict Architectural & Sibling-Spec Boundaries

| Concern | Authoritative Spec | Spec 2 Contract Boundary |
|---|---|---|
| Shared metamodel grammar, `OntologyTemplateEnvelopeRef`, `Sha256Digest`, `LineageId` | **Spec 0** ([`SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md`](SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md)) | Spec 2 consumes `OntologyTemplateEnvelopeRef` and `Sha256Digest` unchanged (`:144-154`). `engram_memory_context` carries domain slices solely as `(template_envelope, entity_type_id, entity_id, payload_digest_sha256, control_verdict_authority, payload)` without enumerating `Track` or `h2a` domain types (`Point 2B`, `T-M-C`). |
| Outer MCP wire envelope, `R12` `/memory/v1/*` transport, `BridgeLock` / `mcp-central` / `shim-bridge` gating | **Spec 6A** ([`SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md`](SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md) `§4`) | Spec 2 preserves `EngramMemoryContextInputEnvelopeV1` and `EngramMemoryContextOutputEnvelopeV1` (`Spec 6A §4.2` `:545-591`) byte-for-byte and defines the closed internal schemas of `context_query` and `context_pack`, token budget, opaque cursor, error mapping, retrieval scoring, access rules, and prompt-loop execution. |
| Raw turn/tool ingestion, `SessionDbCitationTuple`, `DerivedWorktree`, `ConfidentialityDenyListV1`, `PiiArmorStamp` | **Spec 1** ([`SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md`](SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md)) | Spec 2 reads canonical/projected records ingested by Spec 1 (`session_turn`, `tool_result`, `project_decision`, `harness_decision`, `decision_dossier`, `derived_worktree`) and applies Spec 1's `D7`/`D8`/`D33` privacy primitives on egress. |
| Dormant dreaming synthesis cadences & shadow verification (`D25`, `D26`, `Point 3C`) | **Spec 3** (`SPEC_ENGRAM_DORMANT_DREAMING_SYNTHESIS.md`, planned) | Spec 2 defines the recall slot (`dreaming_recalled_facts`) and attention boost through which dreamed permanent facts re-enter active prompts (`D19`, `D23`), plus the `D6` ref-only disclosure rule on dreaming summaries. |
| `h2a` role/activity/skill ontology authoring & `.h2a/` overlay serialization (`D16`, `D31`, `Point 4B`) | **Spec 4** (`SPEC_ENGRAM_H2A_ROLE_ONTOLOGY_AND_HARNESS_OVERLAYS.md`, planned) | Spec 2 reads registered `h2a`-lineage role/activity/harness graphs for `role_consciousness_slice` and `harness_effective_rules`, and emits advisory `proactive_role_proposal` (`engram` never writes roles, `Point 4B`). |
| `Track` domain templates, authoritative `Track` control verdict, `.track/` PR projection (`Point 1B`, `Point 5B`) | **Spec 5** (`SPEC_ENGRAM_TRACK_ANALYST_CONTROL_AND_PR_SERIALIZATION.md`, planned) | Spec 2 never treats `proposed` `Track`-domain candidates lacking `verdictAuthority: 'track'` acceptance as ratified project state (`Point 5B`) and never hardcodes `Track` entity kinds (`Point 2B`). |
| View & design-system rendering state | [`DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md`](memory/DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md) | `engram_memory_context` returns semantic graph data, citations, template references, and digests only—never CLI/UI layout, fold state, CSS tokens, or rendering coordinates (`:18-33`). |

---

## 1. The Durationless Prompt Loop (`D23`) and Role-Consciousness Fingerprint (`D4`, `D22`)

### 1.1 Retirement of Linear Context Accumulation and Session Rollover

Today in `h2a` (`h2a` `origin/main` at `1f57127de`), iterative agent execution in `packages/h2a/src/runtime/loop/engine/tick.ts:41-75` and CLI host session wrappers (`packages/h2a/src/hosts/plugin.ts:63-212`) relies on host-maintained multi-turn conversation transcripts that grow linearly across tool calls until hitting a context window threshold, triggering manual or automated session handoff/rollover (`relève`).

Per `D19`, `D22`, and `D23` (`spec/memory/R15-SEDIMENT.md:64,67-68,87-89,108-113`), **both linear transcript accumulation and session rollover (`relève`) are permanently retired** on every CLI host switched onto `engram_memory_context`:
1. **No Accumulated Conversation Array:** At step $k \ge 1$, the prompt sent to the language model MUST NOT include raw prior assistant turns `[turn_1, ..., turn_{k-1}]`, raw prior tool output transcripts `[tool_1, ..., tool_{k-1}]`, or carryover handoff summaries from an earlier "rolled-over" session.
2. **Durationless Step Independence (`sans durée`):** Every model invocation at step $k$ is stateless with respect to session elapsed turn count. Whether step $k$ is step `1`, step `500`, or the first turn in a new CLI process three days later under the same mandate and workspace, the prompt construction function has the exact same input signature and bounded token ceiling.
3. **Exclusive Three-Part Step Payload (`D23`):** At every step $k$, the outbound model context consists of **and only of**:
   - **(A) The Contextual Graph Query Result (`EngramMemoryContextOutputEnvelopeV1`)** returned by `engram_memory_context` for step $k$, anchored on the verified `H2AEnvelope<H2AMandate>` as a primary graph-query component (`D22`), plus any ready non-memory `D15` context slices (`track`, `git`, `architecture`, `rules`);
   - **(B) The Reprocessed Result of Step $k - 1$ (`ReprocessedPreviousStepV1`)**, bounded and distilled from the raw turn/tool output already ingested into `engram` through Spec 1 (`POST /memory/v1/session-front/ingest`); and
   - **(C) The Immediate Step Trigger (`CurrentStepTriggerV1`)** — the single current user/operator message or immediate tool/hook event initiating step $k$ (itself recorded first in `engram` per the Engram-First Principle, `R15-SEDIMENT.md:11-12`, before step $k$ executes).

### 1.2 Five-Phase Per-Step Execution Contract

```mermaid
sequenceDiagram
    participant Host as h2a CLI Host / Tick Loop
    participant CM as @sentropic/cluster-mesh (R12 + mcp-platform)
    participant Engram as engram (Session Front + Memory Context Port)
    participant LLM as @sentropic/llm-mesh / Active Host Model

    Note over Host,Engram: Step k-1 finishes: raw turn + tool outputs exist
    Host->>CM: 1. POST /memory/v1/session-front/ingest (Spec 1 raw turn_text + tool_result)
    CM->>Engram: Persist canonical journal + SessionDbCitationTuple; emit ReprocessedPreviousStepV1
    Engram-->>Host: IngestReceipt + bounded ReprocessedPreviousStepV1 (host discards raw transcript buffer)

    Note over Host,Engram: Step k begins (zero linear history retained)
    Host->>CM: 2. MCP tools/call engram_memory_context (context_query + _meta['sentropic.h2a.mandate'])
    CM->>CM: Verify H2AEnvelope<H2AMandate> (or D18 policy) -> StpConnectorContext.h2aMandate
    CM->>Engram: 3. Invoke MemoryContextPortV1.assembleContext (D22 mandate-primary graph query)
    Engram->>Engram: Apply D5 same-role filter, D23/D7 weighting, D6/D8/D33 redaction, token/byte budget
    Engram-->>CM: EngramMemoryContextOutputEnvelopeV1 (template_refs + digests + context_pack)
    CM-->>Host: Sanitized AppResultEnvelope (<= max_pack_bytes & <= token_budget)

    Host->>Host: 4. Inject ready D15 slices (non-blocking) + ReprocessedPreviousStepV1 + Step k Trigger
    Host->>LLM: 5. Durationless prompt (NO old turns, NO rollover summary)
```

**Normative Step Invariants:**
1. **Phase 1 — First-Rank Ingestion & Previous-Step Reprocessing (`Spec 1` → `ReprocessedPreviousStepV1`):**
   - Before step $k$ calls `engram_memory_context`, the output of step $k-1$ (assistant response and any tool execution outputs) MUST have been submitted to `engram` via `EngramSessionIngestFrontPort.recordSessionEvent` (`POST /memory/v1/session-front/ingest`, `Spec 1` §1.1, `Spec 6A` `:215-217`).
   - Reprocessing converts the potentially large raw output of step $k-1$ into a closed, bounded `ReprocessedPreviousStepV1` structure (`<= 4_096` UTF-8 bytes; see §2.2):
     - `step_id`: exact `step_ref` of step $k - 1$;
     - `reprocessed_digest_sha256`: `Sha256Digest` of the canonical ingested turn/tool batch;
     - `reprocessed_summary`: PII-armored (`D8`) or `D6` ref-only synthesis of what step $k-1$ accomplished or observed (`<= 2_400` UTF-8 bytes);
     - `significant_tool_refs`: up to `16` canonical node IDs of `tool_result` records from step $k-1$ classified as `significant`, `error`, or `security-gate` (`Spec 1` `:214-218`);
     - `unresolved_citation_digests`: optional citation IDs (`SessionDbCitationTuple` digests) if step $k$ needs on-demand text drill-down (`query_text`).
   - On step `1` of a freshly launched CLI process (`k = 1`), `previous_step_result` is omitted (not `null`, matching `M2` closed-schema rules in `SPEC_MEMORY_MCP_V2.md:79`); cross-session continuity comes entirely from the `D22` contextual graph query (`R15-SEDIMENT.md:67-68`).
2. **Phase 2 — Mandate-Primary Fingerprint Request (`D4`, `D22`):**
   - `h2a` constructs `EngramMemoryContextInputEnvelopeV1` (`Spec 6A §4.2` `:545-565`) carrying `step_ref`, optional `derived_worktree_id` (`D21`), optional travelling `template_refs`, `max_pack_bytes`, and `context_query` (`EngramMemoryContextQueryV1`, §2.2).
   - The signed `H2AEnvelope<H2AMandate>` (`h2a:packages/h2a/src/envelope.ts:109-150`, `Spec 0` `:161-174`) is transmitted **exclusively out-of-band** in JSON-RPC `params._meta['sentropic.h2a.mandate']` and/or HTTP `X-Sentropic-H2A-Mandate` (`Spec 6A` `:501-502,600`), never inside caller-authored `arguments` (`M2` host-controlled boundary, `src/mcp/memory/schemas.ts:1-60`).
3. **Phase 3 — Role-Consciousness Fingerprint Evaluation (`D22`):**
   - Per `D22` (`« On dojt atteimdre une forme de conscience dans le role. L empreinte etant unenrequet graphe dans le quel le mandat eat un composant primaire. Donc de base je dirais c est pile entee les deux ce qu ej ai en tete »`, `R15-SEDIMENT.md:67`), a session's continuity fingerprint is neither a bare static mandate ID (« Mandat seul ») nor a linear chain of session handoff hashes (« Chaîne d’empreintes »).
   - Formally, `engram` computes `fingerprint_query_id = "fpq_" + sha256_jcs(FingerprintQuerySeedV1)` where `FingerprintQuerySeedV1` binds four primary graph anchors:
     1. **Primary Component — Verified `h2a` Mandate (`D4`, `D22`):** `(mandateId, instance, role, scope, rights[], envelopeDigest)` verified by `cluster-mesh` (`StpConnectorContext.h2aMandate`), or `'unassigned'` when no mandate is bound (`D16`/`D18`);
     2. **Registered `h2a` Role & Activity Subgraph (`D4`, `D16`):** the version-pinned `OntologyTemplateEnvelopeRef` (`lineage: 'h2a'`) for the active role, its `allowedActivities`, `multiActorRelations`, and workspace harness overlay (`D31`);
     3. **Workspace & Derived Git Worktree Anchor (`D21`):** `(tenantId, workspaceId, derivedWorktreeId ?? null, originWorkspaceId, branchHeadCommit?)`;
     4. **Mission Focus Seed (`D23`):** active mission/lot scope anchors extracted from `mandate.scope`, `previous_step_result.significant_tool_refs`, and optional `mission_focus_refs`.
4. **Phase 4 — Non-Blocking Five-Slice Prompt Assembly (`D15`, `D18`):**
   - The `h2a` prompt assembler combines each ready `D15` slice (`track`, `git`, `architecture`, `rules`, `memory`) as soon as that slice's readiness criteria pass (§4.3), without blocking turn execution on unready slices, and enforces `D18` read-only memory exclusion whenever the session lacks a memory identity (§4.4).
5. **Phase 5 — Proactive Role Proposal When Unassigned (`D16`, `Point 4B`):**
   - When a session has a valid memory identity (`sub`, `tid`) and `D16` unassigned-role posture (`mandate === null`), `engram_memory_context` inspects live `engram` activity in `(tenantId, workspaceId)` and populates `role_consciousness_slice.proactive_role_proposal` (`{ proposed_role_id, confidence_band, rationale, cited_event_ids }`). Per `Point 4B` (`OWNER-DECISIONS-2026-11-14.md:24`), this field is **strictly a read-only proposal**: `engram` never writes or activates an `h2a` role; only the `h2a` mandate-and-role manager (`D4`) may author or bind one.

---

## 2. The Seventh Memory Tool: `engram_memory_context` (`D20=seventh`, `Point 2B`)

### 2.1 Code Precedents Reconciled (`app-context` + Six Frozen `mcp/memory` Tools + `Spec 6A §4`)

Every design rule of `engram_memory_context` reconciles two existing `engram` precedents on `d5eb6171` with `Spec 6A §4` (`:522-641`) and [`spec/memory/contracts/engram-h2a.md`](memory/contracts/engram-h2a.md) (`:99-155`):

1. **Precedent A — The `app-context` Five-Tool Context Envelope, Token Budget, and Stub Progression:**
   - `src/app-context/types.ts:175-213` defines the 5 `AppContextToolName` tools (`engram_context_for_target`, `engram_specs_for_target`, `engram_targets_for_spec`, `engram_read_spec_section`, `engram_get_context_item` `:183-189`), typed error codes including `"cursor-invalid"` (`:179`) and `"budget-too-small"` (`:181`), and out-of-band `AppContextCallerAuditClaim` / `AppContextAuditSinkV1` (`:190-213`), registered in `src/ontology-guardian/app-context-registry.ts:327-333`.
   - `src/serve.ts:331-380` establishes `MIN_RESPONSE_TOKEN_BUDGET = 128` (`:331`), default `2000` (`:332`), and deterministic `3` UTF-8 bytes/chars per token truncation (`cutLinesToBudget` `:345-380`) where truncation metadata is counted inside the caller's token budget; `src/retrieval/answer-pack.ts:149` likewise sets `DEFAULT_TOKEN_BUDGET = 2000`.
   - `app-context` Lot L6 (`src/app-context/mcp-tools.ts`, `PROPOSED` / non-existent on `d5eb6171`) refines this into the **full-envelope token-budget rule**: `tokens(payload) = Math.ceil(Buffer.byteLength(JSON.stringify(payload), 'utf8') / 3)` evaluated on the **final serialized response envelope after budget and pagination fields are populated** (`used_tokens <= effective_token_budget`), whole-item deterministic packing, Unicode-scalar-safe stub progression (`utf8CutAtCodePointBoundary`, zero `U+FFFD`), and non-advancing refusal reporting `min_required_tokens` when even the minimal envelope cannot fit.
2. **Precedent B — The Six Frozen MCP Memory Tools (`src/mcp/memory/*` & `src/mcp-memory/*`):**
   - Closed Draft 2020-12 JSON Schemas with `additionalProperties: false` and optional properties omitted rather than `null` (`SPEC_MEMORY_MCP_V2.md:79`, `src/mcp/memory/schemas.ts:1-120`).
   - Host-owned opaque pagination handles `page_<48hex>` (`/^page_[0-9a-f]{48}$/`) stored in `createMemoryReadPageStoreV1` (`src/memory-tools/reads.ts:28-64,113-183`) with `engram_owns_signing_secret: false` (`src/mcp/memory/contracts.ts:612`), bound via `receiptDigest('memory-page-binding', ...)` to `(tenant_id, principal_id, tool_name, query_fingerprint, snapshot_pin)`, and checked with a double-read `as_of` pin (`reads.ts:171-174`).
   - Byte ceilings in `MEMORY_MCP_LIMITS` (`src/mcp/memory/contracts.ts:266-298`) and `src/mcp-memory/server.ts:38-40,191-202`: `max_pack_bytes` in `[4_096, 1_048_576]` defaulting to `65_536` (`:266-268`), `MAX_ARGUMENT_OBJECT_UTF8_BYTES = 1_048_576` (`:295`), `COMBINED_RESULT_CEILING_BYTES = 2_097_152` (`server.ts:38`), and `MAX_INVOCATION_DEADLINE_MS = 30_000` (`contracts.ts:297`).
   - Sanitized public error taxonomy (`PUBLIC_MEMORY_ERROR_CODES`, 31 codes in `src/mcp/memory/errors.ts:29-72,84-397`) wrapped in `ToolFailureV1` (`contracts.ts:448-458`), never inventing raw `app-context` kebab-case error strings on the `engram-memory` MCP wire.

### 2.2 Closed Input and Output Envelopes (`Draft 2020-12` & TypeScript Contracts)

The outer wire envelopes `EngramMemoryContextInputEnvelopeV1`, `EngramMemoryContextDomainEnvelopeV1`, and `EngramMemoryContextOutputEnvelopeV1` are **identical to `Spec 6A §4.2` (`SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md:545-591`)**. Spec 2 narrows `context_query` and `context_pack` from `Readonly<Record<string, unknown>>` (the domain-blind `cluster-mesh` pass-through view) to the closed Draft 2020-12 schemas `EngramMemoryContextQueryV1` and `EngramMemoryContextPackV1` under profile `sentropic.engram.memory-tools/2020-12-v2`:

```typescript
// PROPOSED: src/mcp/memory/context-contracts.ts (re-exported under v2 profile only)
import type { OntologyTemplateEnvelopeRef, Sha256Digest } from '../../metamodel/contracts.js';
import type { OpaqueRef } from './contracts.js';

export const CONTEXT_TOKEN_BUDGET_MIN = 128 as const;     // Precedent: src/serve.ts:331
export const CONTEXT_TOKEN_BUDGET_DEFAULT = 2_000 as const; // Precedent: src/serve.ts:332, answer-pack.ts:149
export const CONTEXT_TOKEN_BUDGET_MAX = 32_000 as const;
export const CHARS_OR_UTF8_BYTES_PER_TOKEN = 3 as const;  // Precedent: src/serve.ts:352

export interface ReprocessedPreviousStepV1 {
  readonly step_id: string;                      // 1..128 UTF-8 bytes, NFC
  readonly reprocessed_digest_sha256: Sha256Digest;
  readonly reprocessed_summary: string;          // 1..2400 UTF-8 bytes, NFC (D6/D8 compliant)
  readonly significant_tool_refs: readonly string[]; // 0..16 canonical tool_result node IDs
  readonly unresolved_citation_digests?: readonly Sha256Digest[]; // 0..16 optional drill-down anchors
}

export type ContextSliceIdV1 = 'track' | 'git' | 'architecture' | 'rules' | 'memory';

export interface EngramMemoryContextQueryV1 {
  /** Token ceiling for the ENTIRE serialized EngramMemoryContextOutputEnvelopeV1 (128..32000, default 2000). */
  readonly token_budget?: number;
  /** Host-managed opaque continuation handle (/^page_[0-9a-f]{48}$/); omitted on initial step query. */
  readonly page_cursor?: OpaqueRef;
  /** Reprocessed output of step k-1 (D23); omitted on step 1 (never null, per M2). */
  readonly previous_step_result?: ReprocessedPreviousStepV1;
  /** Optional on-demand raw session text search expression (D23, 1..512 UTF-8 bytes, NFC); omitted when unused. */
  readonly query_text?: string;
  /** Optional explicit mission/artifact node references to sharpen mission focus (0..16 refs). */
  readonly mission_focus_refs?: readonly string[];
  /** Optional D15 subset filter; defaults to all allowed slices for caller posture. */
  readonly requested_slices?: readonly ContextSliceIdV1[];
  /** Include same-role, same-(tenantId, workspaceId) pending bodies per D5 (default true when mandate.role != null). */
  readonly include_same_role_pending?: boolean;
}

/** Outer input envelope — byte-identical to Spec 6A §4.2 (:545-565). */
export interface EngramMemoryContextInputEnvelopeV1 {
  readonly schema_version: 1;
  readonly step_ref: string; // 1..128 UTF-8 bytes
  readonly derived_worktree_id?: string; // D21 "wt:..." node ID
  readonly template_refs?: readonly OntologyTemplateEnvelopeRef[]; // 0..32 travelling template filters
  readonly max_pack_bytes?: number; // 4096..1048576, default 65536 (MEMORY_MCP_LIMITS.MAX_PACKET_BYTES_*)
  readonly context_query: EngramMemoryContextQueryV1;
}

/** Envelope-only typed carrier — byte-identical to Spec 6A §4.2 (:567-574). */
export interface EngramMemoryContextDomainEnvelopeV1 {
  readonly template_envelope: OntologyTemplateEnvelopeRef;
  readonly entity_type_id: string; // Open template-defined type ID; NEVER a closed Track/h2a enum (Point 2B)
  readonly entity_id: string;
  readonly payload_digest_sha256: Sha256Digest;
  readonly control_verdict_authority: 'track' | 'engram' | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ContextFileDisclosureRefV1 {
  /** Real repo-relative path when permitted, or `withheld-path:<sha256>` when path matches secret patterns (D6, D33). */
  readonly path_ref: string;
  readonly content_fingerprint: Sha256Digest;
  readonly content_disclosure: 'refs_only_d6' | 'bounded_extract_d8';
  /** Present ONLY when content authorization holds AND D7/D8 PII armor passes; omitted under D6=refs. */
  readonly bounded_extract?: string;
  readonly pii_armor_stamp_digest?: Sha256Digest;
}

export interface SliceReadinessReceiptV1 {
  readonly slice: ContextSliceIdV1;
  readonly status: 'ready' | 'pending_criteria' | 'withheld_policy_d18' | 'withheld_purpose_d11' | 'degraded_local_d17';
  readonly slice_digest_sha256?: Sha256Digest;
}

export interface ContextBudgetReceiptV1 {
  readonly effective_token_budget: number;
  /** Exact ceil(utf8ByteLength(JSON.stringify(finalOutputEnvelope)) / 3) <= effective_token_budget. */
  readonly used_tokens: number;
  readonly effective_byte_budget: number;
  /** Exact utf8ByteLength(JSON.stringify(finalOutputEnvelope)) <= effective_byte_budget. */
  readonly used_bytes: number;
  readonly truncated: boolean;
  readonly stubbed_item_id?: string;
  readonly omitted_counts_by_reason: Readonly<{
    readonly budget_exceeded: number;
    readonly d6_content_withheld: number;
    readonly d7_confidentiality_denied: number;
    readonly point_5b_unratified_track_proposal: number;
  }>;
}

export interface EngramMemoryContextPackV1 {
  readonly fingerprint_query_id: string; // "fpq_<64hex>" (D22)
  readonly snapshot_as_of_cursor: string; // Monotonic store high-water cursor pinned across page_cursor continuations
  readonly ranking_mode: 'model_triaged_d7_v1' | 'deterministic_attention_v1' | 'readonly_non_memory_d18';
  readonly slice_readiness: readonly SliceReadinessReceiptV1[]; // D15 independent per-slice status
  readonly budget_receipt: ContextBudgetReceiptV1;
  /** Present ONLY when truncated === true and more eligible items remain; omitted when terminal (M2). */
  readonly next_page_cursor?: OpaqueRef;
  readonly role_consciousness_slice?: Readonly<{
    readonly role_template_envelope: OntologyTemplateEnvelopeRef;
    readonly active_role_id?: string;
    readonly mandate_digest_sha256?: Sha256Digest;
    /** Advisory only when active_role_id is absent (D16, Point 4B: engram never writes roles). */
    readonly proactive_role_proposal?: Readonly<{
      readonly proposed_role_id: string;
      readonly rationale: string;
    }>;
    readonly allowed_activities: readonly string[];
    readonly multi_actor_relations: ReadonlyArray<{
      readonly target_role_id: string;
      readonly relation: string;
    }>;
  }>;
  readonly harness_effective_rules?: Readonly<{
    readonly harness_template_envelope: OntologyTemplateEnvelopeRef;
    readonly master_harness_version: string;
    readonly workspace_overlay_ref?: string;
    readonly active_rules: readonly string[];
  }>;
  readonly git_worktree_slice?: Readonly<{
    readonly derived_worktree_id: string;
    readonly origin_workspace_id: string;
    readonly branch_ref: string;
    readonly head_commit_sha?: string;
  }>;
  readonly architecture_slice_refs?: ReadonlyArray<{
    readonly template_envelope: OntologyTemplateEnvelopeRef; // archi@1 unchanged (D16, Point 4B)
    readonly card_or_node_id: string;
    readonly summary_digest_sha256: Sha256Digest;
    readonly summary?: string;
  }>;
  /** Omitted completely under D18=readonly (zero memory content). */
  readonly mission_focus_context?: Readonly<{
    readonly owner_decisions: ReadonlyArray<{
      readonly id: string;
      readonly decision_scope: 'project' | 'harness' | 'dossier';
      readonly admission_state: 'accepted_current' | 'same_role_pending_d5';
      readonly statement: string;
      readonly citation_digest_sha256: Sha256Digest;
      readonly attention_score_q16: number; // Integer [0..65535] for deterministic JCS serialization
    }>;
    readonly significant_tool_results: ReadonlyArray<{
      readonly id: string;
      readonly significance: 'security-gate' | 'error' | 'significant';
      readonly admission_state: 'accepted_current' | 'same_role_pending_d5';
      readonly summary?: string; // Omitted when D6=refs withholds body
      readonly file_refs: readonly ContextFileDisclosureRefV1[];
      readonly citation_digest_sha256: Sha256Digest;
      readonly attention_score_q16: number;
    }>;
    readonly dreaming_recalled_facts: ReadonlyArray<{
      readonly id: string;
      readonly trigger: 'nightly' | 'weekly' | 'monthly' | 'mid-day' | 'context-saturation';
      readonly summary?: string; // Subject to D6=refs rule on dreaming summaries!
      readonly file_refs: readonly ContextFileDisclosureRefV1[];
      readonly source_digest_sha256: Sha256Digest;
      readonly attention_score_q16: number;
    }>;
  }>;
  /** Populated ONLY when query_text is supplied AND caller has memory identity (D23, D8, D6). */
  readonly session_history_query_matches?: ReadonlyArray<{
    readonly turn_node_id: string;
    readonly session_pseudonym: string; // D33 deterministic HMAC pseudonym
    readonly entry_ordinal: number;
    readonly citation_digest_sha256: Sha256Digest;
    readonly admission_state: 'accepted_current' | 'same_role_pending_d5';
    /** Present ONLY under content authorization + D8 PII armor; omitted under D6=refs. */
    readonly bounded_excerpt?: string;
    readonly file_refs: readonly ContextFileDisclosureRefV1[];
  }>;
}

/** Outer output envelope — byte-identical to Spec 6A §4.2 (:576-591). */
export interface EngramMemoryContextOutputEnvelopeV1 {
  readonly ok: true;
  readonly schema_version: 1;
  readonly tool: 'engram_memory_context';
  readonly pack_digest_sha256: Sha256Digest; // SHA-256 over UTF-8 RFC 8785 JCS bytes of context_pack
  readonly resolved_template_refs: readonly OntologyTemplateEnvelopeRef[];
  readonly domain_typed_envelopes: readonly EngramMemoryContextDomainEnvelopeV1[];
  readonly degraded: boolean;
  readonly degraded_reason?: string;
  readonly context_pack: EngramMemoryContextPackV1;
}
```

**1-to-1 Structural Mapping to [`spec/memory/contracts/engram-h2a.md`](memory/contracts/engram-h2a.md) (`:100-155`):**
- `tenantId`, `workspaceId`, and `mandateEnvelope` (`engram-h2a.md:101-112`) cross **exclusively out-of-band** in `StpConnectorContext` (`principal.tid`, workspace binding, and `h2aMandate?: VerifiedH2AMandateV1` verified from `params._meta['sentropic.h2a.mandate']` / `X-Sentropic-H2A-Mandate`, `Spec 6A` `:501-502,600`), honoring `M2` (`SPEC_MEMORY_MCP_V2.md:77-79`: caller arguments never supply authority or scope).
- `derivedWorktreeId` (`:103`) maps to `EngramMemoryContextInputEnvelopeV1.derived_worktree_id`.
- `previousStepResult` (`:113-117`) and `queryText` (`:118`) map to `context_query.previous_step_result` and `context_query.query_text` (with `null` replaced by field omission per `M2`).
- `fingerprintQueryId`, `roleConsciousnessSlice`, `harnessEffectiveRules`, `missionFocusContext`, and `sessionHistoryQueryMatches` (`:124-155`) map 1-to-1 to snake_case wire fields inside `context_pack`, while `domainTypedEnvelopes` (`:140-146`) sits at `EngramMemoryContextOutputEnvelopeV1.domain_typed_envelopes` so `cluster-mesh` can route travelling `OntologyTemplateEnvelopeRef` descriptors without parsing `context_pack` (`Spec 6A` `:531,582-585`).

### 2.3 Envelope-Only Domain Typing Invariant (`Point 2B`, `T-M-C`, `Point 5B`)

1. **Template References and Digests Only — Zero Closed `Track` or `h2a` Type Lists:**
   - In both `EngramMemoryContextInputEnvelopeV1` and `EngramMemoryContextOutputEnvelopeV1`, domain-typed items (`Track` project items, `h2a` role/skill extensions) are carried exclusively in `domain_typed_envelopes[]`, where each entry cites `template_envelope: OntologyTemplateEnvelopeRef` (`{ lineage, templateId, templateVersion, templateDigestSha256 }`, `Spec 0` `:149-154`) and `payload_digest_sha256: Sha256Digest`.
   - `entity_type_id` is a bounded UTF-8 pattern string (`^[a-z][a-z0-9._:-]{0,127}$`), **never** a JSON Schema `enum` or TypeScript union of `Track` entity names in `engram` or `sentropic`. `Track` can add, rename, or retire domain types in a new `Track` template version with **zero code or schema change in `engram_memory_context`** (`OWNER-DECISIONS-2026-11-14.md:12,22`).
2. **`Point 5B` Ratification Gate on `Track`-Domain Envelopes:**
   - Per `Point 5B` (`OWNER-DECISIONS-2026-11-14.md:25`), without an authoritative verdict from the `Track` application (`control_verdict_authority === 'track'` with verdict `'accepted'`), a typed write in the `Track` lineage stays `proposed`.
   - `engram_memory_context` MUST exclude unratified `Track`-lineage `proposed` items from `domain_typed_envelopes` (incrementing `omitted_counts_by_reason.point_5b_unratified_track_proposal`), while the underlying raw session event remains recallable in `significant_tool_results` / `session_history_query_matches` under `D5` / `D23`.

### 2.4 Dual Full-Envelope Budget (`token_budget` + `max_pack_bytes`), Deterministic Packing, and Opaque Cursor

1. **Dual Ceiling Enforcement on the Final Envelope:**
   - `effective_token_budget = clamp(context_query.token_budget ?? 2_000, 128, hostPolicy.max_token_budget ?? 32_000)` (`context_query.token_budget < 128` or `> 32_000` fails closed at Draft 2020-12 schema validation with `INVALID_SCHEMA`).
   - `effective_byte_budget = clamp(input.max_pack_bytes ?? 65_536, 4_096, Math.min(hostPolicy.max_pack_bytes ?? 1_048_576, 1_048_576))` (`src/mcp/memory/contracts.ts:266-268`).
   - Token estimation uses the exact `app-context` / `src/serve.ts:352` deterministic formula:
     $$\mathrm{tokens}(\text{envelope}) = \left\lceil \frac{\mathrm{utf8ByteLength}(\mathrm{JSON.stringify}(\text{envelope}))}{3} \right\rceil$$
   - **Post-Population Invariant:** Both `used_tokens <= effective_token_budget` and `used_bytes <= effective_byte_budget` (and outer MCP `CallToolResult <= 2_097_152` bytes in `src/mcp-memory/server.ts:38,191-202`) MUST hold on the **complete `EngramMemoryContextOutputEnvelopeV1` after `pack_digest_sha256`, `resolved_template_refs`, `budget_receipt`, and `next_page_cursor` have been populated**. Because `page_<48hex>` is fixed-width (`53` ASCII bytes) and integer counters have bounded decimal digits, `packContextEnvelopeToBudget` reserves a fixed worst-case trailer slack before finalizing `budget_receipt` and `pack_digest_sha256`.
2. **Deterministic Priority Packing & Single-Item Unicode-Scalar-Safe Stubbing (`app-context` Precedent):**
   - Structural headers (`slice_readiness`, `role_consciousness_slice`, `harness_effective_rules`, `git_worktree_slice`) are packed first in fixed priority order.
   - Variable-cardinality items across `owner_decisions`, `domain_typed_envelopes` (paired with their required `resolved_template_refs` entry!), `dreaming_recalled_facts`, `significant_tool_results`, `architecture_slice_refs`, and `session_history_query_matches` are merged into a single deterministic priority queue ordered by `(priority_tier ASC, attention_score_q16 DESC, canonical_id ASC)`.
   - Items are appended **whole** while the serialized envelope stays within both budgets.
   - **Single-Item Stub Progression Guarantee:** If the *first* remaining item at the head of a page cannot fit whole in an otherwise empty variable-item page, `packContextEnvelopeToBudget` emits a **single Unicode-scalar-safe truncated stub** of its text field (`utf8CutAtCodePointBoundary`, never splitting a UTF-8 multi-byte sequence and never emitting `U+FFFD`), sets `budget_receipt.truncated = true` and `budget_receipt.stubbed_item_id = item.id`, and advances the cursor past that item (or records a byte-offset sub-cursor for `session_history_query_matches`), guaranteeing strict forward progress on every paginated call.
   - **Non-Advancing Refusal When Structural Floor Exceeds Budget:** If `effective_token_budget` or `effective_byte_budget` is schema-valid (`>= 128` tokens and `>= 4_096` bytes) but still smaller than the minimal fixed envelope + mandatory `resolved_template_refs` floor, the tool MUST NOT advance or invalidate `page_cursor`; it returns public error code `PROJECTION_OVERSIZED` (the neutral memory counterpart of `app-context`'s `"budget-too-small"`, `src/app-context/types.ts:181` vs `src/mcp/memory/errors.ts:47`).
3. **Host-Managed Opaque Cursor (`page_<48hex>`, Zero `engram` Signing Secret):**
   - `createMemoryContextPageStoreV1` (`PROPOSED: src/memory-tools/context.ts`, modeled directly on `createMemoryReadPageStoreV1` in `src/memory-tools/reads.ts:28-64,113-183`) generates `page_${randomBytes(24).toString('hex')}` (`/^page_[0-9a-f]{48}$/`, `ttl_ms` default `60_000` bounded to `1..300_000`, `max_entries` `1..10_000`, `engram_owns_signing_secret: false` per `src/mcp/memory/contracts.ts:585-613`).
   - Each stored handle binds `pageBinding = receiptDigest('memory-context-page-binding-v1', { tenant_id, workspace_id, principal_id, mandate_digest_sha256: mandate?.envelopeDigest ?? 'none', fingerprint_query_id, query_text: query.query_text ?? '', snapshot_as_of_cursor, store_epoch })`.
   - On continuation (`page_cursor` present):
     1. Unknown, expired, malformed, principal-mismatched, mandate-changed, or query-changed handles fail closed with `STALE_PAGE` (`src/mcp/memory/errors.ts:43`, neutral counterpart of `app-context`'s `"cursor-invalid"` `:179`).
     2. Following `src/memory-tools/reads.ts:171-174`, `assembleContext` verifies `snapshot_as_of_cursor` both **before** and **after** reading the pinned snapshot; if a concurrent `forget` (`tombstone`), `withdraw`, `D7` confidentiality blacklist update, or epoch rotation invalidated an item in the pinned view, continuation refuses with `STALE_PAGE` so revoked or forgotten material is never paged out (`SPEC_MEMORY_MCP_V2.md:902`).

### 2.5 Public Error Codes (`PUBLIC_MEMORY_ERROR_CODES` Mapping)

`engram_memory_context` reuses the exact 31-code `PublicMemoryErrorCode` union in `src/mcp/memory/errors.ts:29-72` and constant sanitized messages in `errors.ts:84-397` (`ToolFailureV1` at `src/mcp/memory/contracts.ts:448-458`), introducing **zero unratified public wire error strings**:

| Condition in `engram_memory_context` | Wire Surface & Code (`src/mcp/memory/errors.ts`) | Precedent / Notes |
|---|---|---|
| Tool disabled (`contextToolsEnabled !== true`) or host masked by `shim-bridge` (`Gate 1` / `Gate 3`) | Broker / shim `unknown_tool` (before provider invocation) | `compiled-dispatch.ts:156-158`; `Spec 6A` `:611,620` |
| Missing trusted `StpConnectorContext` or missing `auditId` | JSON-RPC protocol error `-32603` (`'Trusted invocation context unavailable'`) | `src/mcp/memory/errors.ts:437-440` |
| Missing `'sub'`, `'tid'`, or `'h2a_context_mandate'` claim, or unauthorized workspace / revoked `D11` recall grant | `ToolFailureV1` → `UNAUTHORIZED_SCOPE` (`errors.ts:34`) | Constant sanitized message; zero existence leak across tenants/workspaces |
| Stray `elicitation_ref` supplied on a read-only tool, or unverified Gate 2 / runtime capability posture | `ToolFailureV1` → `gate_failed` / `CAPABILITY_UNAVAILABLE` (`errors.ts:53,71`) | Matches `src/mcp-memory/provider.ts:788-797` |
| Malformed arguments, extra keys (`additionalProperties: false`), `null` optional field, `token_budget < 128` or `> 32000`, `max_pack_bytes < 4096` or `> 1048576`, non-NFC string | `ToolFailureV1` → `INVALID_SCHEMA` (`errors.ts:31`) | Enforced identically at JSON Schema and runtime validator (`M2`) |
| Out-of-band `X-Sentropic-H2A-Mandate` vs `params._meta['sentropic.h2a.mandate']` mismatch, or invalid `Sha256Digest` in `template_refs` | `ToolFailureV1` → `INVALID_DIGEST` (`errors.ts:32`) | `Spec 6A §2.3` & `:501` |
| Unknown, expired, principal/mandate-mismatched, or tombstone-invalidated `page_cursor` | `ToolFailureV1` → `STALE_PAGE` (`errors.ts:43`) | Maps `app-context` `"cursor-invalid"` (`src/app-context/types.ts:179`) onto neutral memory taxonomy |
| Schema-valid `token_budget` / `max_pack_bytes` too small to fit the minimal fixed envelope + required `resolved_template_refs` (cursor NOT advanced) | `ToolFailureV1` → `PROJECTION_OVERSIZED` (`errors.ts:47`) | Maps `app-context` `"budget-too-small"` (`src/app-context/types.ts:181`) |
| Serialized MCP `CallToolResult` exceeds `2_097_152` UTF-8 bytes (`COMBINED_RESULT_CEILING_BYTES`) | `ToolFailureV1` → `RESULT_TOO_LARGE` (`errors.ts:68`) | `src/mcp-memory/server.ts:38,191-202` |
| Both remote store and local fenced SQLite store unavailable or unhealthy | `ToolFailureV1` → `STORE_UNAVAILABLE` (`errors.ts:52`) | When local fenced SQLite is healthy while remote sync is down, returns `ok: true, degraded: true` (`D17`) |
| Invocation deadline (`<= 30_000 ms`, `contracts.ts:297`) or abort signal exceeded | `ToolFailureV1` → `DEADLINE_EXCEEDED` (`errors.ts:54`) | `src/mcp-memory/provider.ts:680-715` |
| Per-principal / per-tenant rate limiter tripped | `ToolFailureV1` → `RATE_LIMITED` (`errors.ts:69`) | Host rate-limit mapping |

Note on `TARGET_BEARING_MEMORY_TOOLS` (`src/mcp/memory/errors.ts:404-410`): `engram_memory_context` is a scope/graph-query tool rather than a single-record ID target lookup; if a caller supplies `derived_worktree_id` or `mission_focus_refs` belonging to another tenant/workspace or unauthorized scope, `engram` either omits unauthorized nodes silently from graph traversal or returns `UNAUTHORIZED_SCOPE` when the workspace binding itself is unauthorized—never revealing whether a foreign ID exists (`M6` neutral non-disclosure).

### 2.6 Default-Disabled Build, Co-Signature & `MCP-L5` Gates, and Per-Host Switchover (`Point 2B`, `Spec 6A §4.3`)

Per `Point 2B` (`OWNER-DECISIONS-2026-11-14.md:22`) and `Spec 6A §4.3` (`SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md:604-641`):
1. **Gate 1 — Built Now, Disabled by Default (`contextToolsEnabled: false`):**
   - `createEngramMemoryProviderV1` (`src/mcp-memory/provider.ts:648`) accepts `options.contextToolsEnabled?: boolean` defaulting to `false`.
   - When `contextToolsEnabled !== true`, `provider.ts:458` validates the exact 6-tool `v1` descriptor list (`MEMORY_MCP_WIRE_PROFILE_ID_V1 = 'sentropic.engram.memory-wire/v1'`, `MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1 = 'sentropic.engram.memory-tools/2020-12-v1'` in `src/mcp-memory/profiles.ts:7-16`), `MEMORY_PUBLISHER_ASSETS_V1_SCHEMA` (`src/mcp/memory/receipts.ts:100,124-126`) keeps `minItems: 6, maxItems: 6`, and `engram_memory_context` is absent from `manifest.tools`, `tools/list`, and `CompiledMemoryDispatch`.
2. **Gate 2 — `engram` + `sentropic` Co-Signature & `MCP-L5` Production Qualification (`v2` Profile):**
   - Enabling `contextToolsEnabled: true` switches the active profile bindings to `MEMORY_MCP_WIRE_PROFILE_ID_V2 = 'sentropic.engram.memory-wire/v2'` and `MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V2 = 'sentropic.engram.memory-tools/2020-12-v2'` (`MEMORY_PUBLISHER_ASSETS_V2_SCHEMA` with `minItems: 7, maxItems: 7`).
   - Startup in `composeEngramMemoryDefinition` (`sentropic:packages/cluster-mesh/src/integrations/mcp/memory-compose.ts:19-24`) refuses atomically unless both:
     - a valid `CoSignatureReceiptV2` co-signed by `engram` (`engramManifestDigest`) and `sentropic` (`sentropicPlatformVersion`), and
     - a non-empty `MCP-L5` production qualification receipt (`l5QualificationReceiptRef`, qualifying both the 6 `M1` tools and the 7th read tool against `L5-MEMORY-V1` + re-pinned `pre-candidate-manifest.json.sha256`)
     are present and digest-verified (`Spec 6A` `:621-622`).
3. **Gate 3 — Host-by-Host Switchover with Mandatory Fixed End Date via Signed `BridgeLock` (`Spec 6A §4.3` `:623-641`):**
   - All 8 `h2a` CLI hosts (`claude`, `codex`, `gemini`, `agy`, `hermes`, `opencode`, `muse`, `vibe`) read the signed `ContextToolHostSwitchoverPolicy` (`{ enabledHosts, switchoverEndDateUtc, fallbackMode: 'search-plus-get', allHostsQualified }`, `Spec 6A` `:626-636`) from the `sentropic.engram.memory` entry of `BridgeLock` (`h2a:packages/h2a/src/registry/bridge-lock.ts:187-221` on prerequisite PR #455 `844402ee`).
   - `mcp-central` loads the 7-tool `v2` registry once on the shared central generation, while `shim-bridge.js` / `catalogue.js` masks `engram_memory_context` per host for any CLI host not yet in `enabledHosts`—preserving central `bridgeLockDigest` and `contractDigest` parity and keeping PR #455's `rebootstrapMissingPluginLock` (`host-bootstrap.ts:1646-1775`) green.
   - **Pre-Switch vs Post-Switch Host Behavior:**
     - *Host NOT in `enabledHosts` (before `switchoverEndDateUtc`):* stays on `fallbackMode: 'search-plus-get'` over the 6 `M1` tools.
     - *Host IN `enabledHosts`:* runs the §1 durationless prompt loop exclusively; accumulated multi-turn history and session rollover are disabled on that host.
     - *At/after `switchoverEndDateUtc`:* if `allHostsQualified !== true` or any configured active host remains outside `enabledHosts`, `h2a doctor` and `mcp-central` emit a non-silent `switchover_deadline_exceeded` governance refusal (`Point 2B`: fixed end date is mandatory, never open-ended). Once `allHostsQualified === true`, legacy linear-transcript rollover code paths in `h2a` are retired (`D23`).

---

## 3. Retrieval Weighting, Attention Model, and On-Demand Session Text Query (`D7`, `D19`, `D23`)

### 3.1 Multi-Channel Attention Scoring (`D23` + `D19` + `D7`)

Existing `engram` retrieval in `engram-memory/recall.ts:27-57,105-160` combines `BM25F` (`primary: 3.0, decision: 2.0, evidence: 1.5, context: 1.0, citations: 0.5`), 30-day temporal half-life (`HALF_LIFE_MS` `:54`), Reciprocal Rank Fusion (`RRF_K = 60` `:55`), and Personalized PageRank (`PPR_ALPHA = 0.85` `:56`), while `src/retrieval/answer-pack.ts:256-341` computes lift-over-background PPR specificity and PathRAG shortest paths (`:388-391`).

Per `D23` (`« La memoire fonctionne par de l attention […] »`, attention on significant tool results, owner decisions, mission focus, and dreaming recall of forgotten permanent facts), `MemoryContextPortV1` (`PROPOSED: engram-memory/contextual-graph-query.ts`) replaces generic flat recall with a two-stage **Contextual Attention Scorer**:

1. **Stage 1 — Deterministic Multi-Channel Graph Attention (`deterministic_attention_v1`, Always Computed):**
   - **Seed Distribution $\mathbf{s}$ over the Authorized Memory Graph (`D22` + `D23`):**
     Personalized PageRank (`alpha = 0.85`, lift-over-background specificity per `answer-pack.ts:256-341`) is seeded from four normalized anchor sets:
     - $0.40$ on the **Mandate & Role Consciousness Subgraph (`D22`)**: active `h2a` role node, allowed activity nodes, `mandate.scope` target nodes, and active workspace `.h2a/` overlay rules (`D31`);
     - $0.30$ on **Mission Focus Anchors (`D23`)**: `derived_worktree_id` (`D21`), `mission_focus_refs`, and Track/spec nodes cited by the active branch/lot;
     - $0.20$ on **Immediate Previous-Step Outcomes (`D23`)**: `previous_step_result.significant_tool_refs` and entities extracted from step $k-1$;
     - $0.10$ on **Lexical / Citation Seed**: `BM25F` top candidates over `previous_step_result.reprocessed_summary` and (when supplied) `query_text`.
   - **Class-Specific Attention Multipliers $W_{\text{class}}(v)$ (`D23`, `D19`, `D27`, `Spec 1` `:214-218`):**
     Each candidate node $v$ surviving access/privacy filtering (§4) receives a deterministic structural score before quantization to integer `attention_score_q16` $\in [0, 65535]$:
     $$S_{\text{det}}(v) = \mathrm{RRF}_{k=60}\!\left(\mathrm{rank}_{\text{PPR-lift}}(v),\, \mathrm{rank}_{\text{BM25F}}(v)\right) \times W_{\text{class}}(v) \times D_{\text{recency}}(v)$$
     where:
     - **Owner Decisions (`project_decision`, `harness_decision`, `decision_dossier` / `contextualized_fact` `D27`, and verified `owner.answer` / `owner.request` `Spec 1`):** $W_{\text{class}} = 2.50$, **zero temporal decay** ($D_{\text{recency}} = 1.00$ while `accepted_current`, so binding owner decisions never fade with age);
     - **Dormant Dreaming Recalled Permanent Facts (`D19`, `D23`):** $W_{\text{class}} = 2.10$, $D_{\text{recency}} = 1.00$ — specifically surfacing permanent cross-session invariants and lessons consolidated by local (`nightly`, `mid-day`, `context-saturation`) or synced remote (`weekly`, `monthly`) dreaming passes (`Point 3C`) whose lexical overlap with step $k-1$ alone would be low (`« Le mode dreaming veenant rappelera des choses permanentes oubliees sur le court terme. »`);
     - **Tool Execution Results (`ToolResultSignificance`, `Spec 1` `:214-218`):**
       - `security-gate`: $W_{\text{class}} = 2.25$ (half-life $14\text{d}$);
       - `error`: $W_{\text{class}} = 1.90$ (half-life $7\text{d}$, or $1.00$ when unresolved on the active `derived_worktree_id`);
       - `significant`: $W_{\text{class}} = 1.60$ (half-life $14\text{d}$);
       - `routine`: **$W_{\text{class}} = 0.00$ (excluded from `significant_tool_results`**, preventing routine shell/read chatter from polluting attention; reachable only via explicit `query_text` on-demand search);
     - **Ratified Domain-Typed Envelopes (`domain_typed_envelopes`, e.g. `Track`-accepted items with `control_verdict_authority: 'track'`):** $W_{\text{class}} = 1.85$ when graph-connected within $\le 2$ hops of `mandate.scope` or `derived_worktree_id`.

2. **Stage 2 — `D7` Model-Assisted Sensitivity-Triaged Reranking (`model_triaged_d7_v1`):**
   - Per `D7` (`« de base empreintes + triage de sensibilité pour faciliter stp (possibilité de gérer une black list de confidentialité a prevoir dans la memoire pour un agent de controle de memoire type PII) »`, `R15-SEDIMENT.md:52`), when **all three** conditions hold:
     1. explicit content authorization is active for the scope (`D6`/`D7`),
     2. every candidate in the top-$K$ ($K \le 32$) deterministic shortlist has passed `ConfidentialityDenyListV1` screening (`D7`, incrementing `d7_confidentiality_denied` on blocked items) and `PiiArmorStamp` redaction (`D8`), and
     3. `@sentropic/llm-mesh` (`sentropic:packages/llm-mesh/src/decision/index.ts:1-16`, `VerifiedRoutingSubject` + `RouteMeteringSink` per `Spec 1` `1-E2`, zero direct `@ai-sdk/*` calls in `engram`) is reachable within the invocation deadline budget,
     `engram` invokes the `llm-mesh/decision` fast reranker over **graph fingerprints + sensitivity-triaged bounded digests** and blends the model score via RRF with $S_{\text{det}}(v)$ (`ranking_mode: 'model_triaged_d7_v1'`).
   - When content authorization is absent (`D6=refs`), or `@sentropic/llm-mesh` is offline/degraded (`D17=degraded`), or latency budget is tight, Stage 1 `deterministic_attention_v1` serves directly without failing the prompt loop.
   - **Deterministic Tie-Breaking:** Ties on `attention_score_q16` break strictly by `(admission_state_rank ASC ['accepted_current' < 'same_role_pending_d5'], canonical_id ASC)`.

### 3.2 Raw Session Text History Queryable on Demand (`D23` Without Violating `EVOL D3` / `M10`)

Per `D23` (`« L historique de sessions serait juste acceasible via la memoire comme gestionnaire de session et memoire (on garde l historique de texte en query via le graph memoire) »`, `R15-SEDIMENT.md:68`) and `PLAN_SPEC_ENGRAM_FRONT.md:170,185`:
1. **Default Prompt Pack Excludes Raw Turn Transcripts:** When `context_query.query_text` is omitted, `session_history_query_matches` is **omitted** from `context_pack`. Old turn prose is never pushed into prompts unsolicited.
2. **On-Demand Graph-Anchored Text Query (`query_text` Present):**
   - When the model or `h2a` step supplies `context_query.query_text` (`1..512` UTF-8 bytes), `engram` executes a scoped `BM25F` + graph-neighborhood query over canonical `session_turn` records (`<= 64 KiB` bounded `turn_text` and `SessionDbCitationTuple` `(sessionId, entryId, ordinal, contentDigest, branchEpoch?, parentEntryId?)` ingested by Spec 1) within the authorized `(tenantId, workspaceId)` (and `D5` same-role filter for non-admitted turns).
   - Results populate `session_history_query_matches[]` with `turn_node_id`, `D33` `session_pseudonym`, `entry_ordinal`, `citation_digest_sha256`, and—**if and only if** content authorization (`D6`) and `D8` PII armor pass—a bounded excerpt (`<= 1_200` UTF-8 bytes, Unicode-scalar-safe). When content authorization is absent (`D6=refs`), `bounded_excerpt` is omitted and only `file_refs` (`path_ref` + `content_fingerprint`) and citation digests are returned.
3. **Zero Contamination of `.graphify/graph.json` (`EVOL D3` & `M10` Preserved):**
   - Raw `turn_text`, `tool_result` bodies, pending session records, and `session_history_query_matches` live **exclusively** in the canonical `engram-memory` / `session-db` journal and FTS/graph index. They are **never** copied into `.graphify/graph.json`, whose `52_428_800`-byte ceiling and `accepted_current` + `projection_eligible === true` envelope-only rule (`SPEC_MEMORY_MCP_V2.md:888-906`, `engram-memory/bounded-projection.ts:22-86`) remain strictly unchanged (§6.1.3).

---

## 4. Access Control, Privacy, Non-Blocking Slices, and Identity-Less Sessions

### 4.1 `D5` (`same-agent`): Pre-Admission Body Recall Scoped to Same `h2a` Role + Same Space

Settled `D5` (`spec/memory/R15-SEDIMENT.md:50`): *« Cross-session recall before admission is scoped to the same `h2a` role within the same `(tenantId, workspaceId)` space. Successive sessions of the same h2a role, in the same space, read the non-admitted bodies (`« meme role h2a meme espace. »`) »*.

**Formal `D5` Predicate in `MemoryContextPortV1`:**
Let $r$ be a record in `engram` with lifecycle state `state(r)` (`engram-memory/contracts/index.ts`):
- If `state(r) === 'accepted_current'`, $r$ is eligible for recall by any caller authorized for `(r.tenantId, r.workspaceId)` (subject to `D6`/`D7`/`D8`/`D11`/`D18`).
- If `state(r) === 'pending'` (a non-admitted raw `session_turn`, `tool_result`, or pending candidate body ingested via Spec 1 or `engram_memory_capture`), $r$'s body is readable **exclusively in `engram_memory_context`** if and only if **all six** conditions hold:
  1. `context_query.include_same_role_pending !== false` (default `true`);
  2. `StpConnectorContext.h2aMandate` is cryptographically verified (`mandate !== undefined && mandate.role !== null`);
  3. `r.tenantId === caller.tenantId` AND `r.workspaceId === caller.originWorkspaceId` (where a `D21` `derived_worktree_id` resolves through its verified `originWorkspaceId` edge in the same `(tenantId, workspaceId)` space, never across distinct workspaces or tenants);
  4. `r.authorH2ARoleId === mandate.role` (exact registered `h2a` role match—e.g., two successive `CONDUCTOR` sessions or same named `h2a` role graph ID in the same workspace read each other's pending bodies; an `AGENTS` worker or different role in the same workspace CANNOT read `CONDUCTOR` pending bodies);
  5. `r` is not `withdrawn`, `rejected`, `tombstoned`, `expired`, or blocked by `ConfidentialityDenyListV1` (`D7`);
  6. **Strict Boundary Isolation:**
     - The six `M1` tools (`engram_memory_search`, `engram_memory_get`, etc.) keep `DISCLOSABLE_MEMORY_STATES = ['accepted_current']` (`src/mcp/memory/contracts.ts:234`) unchanged;
     - `D5` **never** elevates a `Track`-domain `proposed` entity into `domain_typed_envelopes` without `Track`'s control verdict (`Point 5B`). Every `D5` item in `mission_focus_context` or `session_history_query_matches` is explicitly stamped `admission_state: 'same_role_pending_d5'`.

### 4.2 `D6` (`refs`): Path and Fingerprint Only Without Content Authorization

Settled `D6` (`spec/memory/R15-SEDIMENT.md:51`): *« Without content authorization, only a path and its fingerprint may be sent to the external model. The model can cite files, without content or extract. Dreaming summaries, caches and logs follow the same rule »*.

**Uniform `D6` Enforcement Gate Across All Four Surfaces:**
Whenever `contentPolicy.externalModelContentAuthorized === false` (`sentropic:packages/cluster-mesh/src/sessions/content-policy.ts:89-164`) for the target `(tenantId, workspaceId, modelEndpoint)`:
1. **`engram_memory_context` Output Pack (`context_pack` & `domain_typed_envelopes`):**
   - File-bearing items emit `ContextFileDisclosureRefV1` with `content_disclosure: 'refs_only_d6'`, `path_ref` (or `withheld-path:<sha256>` when the path itself matches secret/credential path patterns per `D33` and `Spec 1`), and `content_fingerprint: Sha256Digest`.
   - `bounded_extract`, `bounded_excerpt`, `significant_tool_results[].summary`, and file-derived prose inside `domain_typed_envelopes` are **omitted**; `omitted_counts_by_reason.d6_content_withheld` is incremented.
2. **Dreaming Summaries (`dreaming_recalled_facts`):**
   - Dreaming summaries recalled into `engram_memory_context` (and dreaming storage artifacts produced in Spec 3) obey the identical `D6` gate: without content authorization, `dreaming_recalled_facts[].summary` is omitted and only `(id, trigger, file_refs[{ path_ref, content_fingerprint }], source_digest_sha256)` reaches the external model.
3. **Host Context Pack Caches & Pagination Handle Store:**
   - Any cached projection or `MemoryContextPageStoreV1` entry is keyed by `(content_authorization_posture, model_endpoint_class)` so an extract-bearing authorized response is **never** served to an unauthorized external model call from cache.
4. **Host & `cluster-mesh` Audit / Context Logs:**
   - Diagnostic logs, `ReprocessedPreviousStepV1` when targeting an external un-authorized model, and degraded-mode banners record only `(path_ref, content_fingerprint)`—never file contents or code/document extracts.

When content authorization **is** granted, extracts still pass `ConfidentialityDenyListV1` (`D7`), `PiiArmorStamp` (`D8` bounded extract redaction), and `D33` author/session HMAC pseudonymization before serialization (`redactionClass: 'high'`, `src/mcp/memory/gates.ts:292-312`).

### 4.3 `D15` (`slices`): Non-Blocking Per-Slice Injection Criteria

Settled `D15` (`spec/memory/R15-SEDIMENT.md:60`): *« Hook activation does not wait for the whole model. Each context slice (Track, Git, architecture, rules, memory) is injected as soon as its criteria pass »*.

The `h2a` prompt loop and `engram_memory_context` partition step context into **five independent slices** (`ContextSliceIdV1`), each governed by its own readiness predicate and never blocking on slower or unavailable sibling slices:

| Slice ID | Readiness Criteria (`status: 'ready'`) | Carrier in `engram_memory_context` / `h2a` | Behavior When Criteria Not Yet Met |
|---|---|---|---|
| `rules` | Master `h2a` harness template + local/synced `.h2a/` workspace overlay (`D31`) loaded and digest-verified | `context_pack.harness_effective_rules` | Injects master harness baseline immediately; overlay marked `pending_criteria` until verified |
| `git` | Workspace identity + `D21` `derived_worktree_id` (`validateWorktreeIdentity`, `engram-live/contracts.ts:1180-1205`) resolved | `context_pack.git_worktree_slice` | Marked `pending_criteria`; does not block `rules` or `memory` |
| `architecture` | Registered `archi@1` (`Spec 0` / `SPEC_EVOL_ARCHI_CARDS.md`) card/graph digests available for workspace | `context_pack.architecture_slice_refs` | Marked `pending_criteria`; never blocks turn start |
| `track` | Registered `Track` template envelope (`lineage: 'track'`) present AND ratified `verdictAuthority: 'track'` state loaded (`Point 1B`, `Point 5B`) | `domain_typed_envelopes` (`lineage: 'track'`) | Marked `pending_criteria` while `Track` control or template sync is pending; raw events still flow to `engram` (`Point 5B`) |
| `memory` | Caller has memory identity (`sub`, `tid`), `D11` recall purpose (`memory.recall.contextual/v1`) is active, and local or remote `engram-memory` store responds (including `D17` local SQLite degraded mode) | `role_consciousness_slice` + `mission_focus_context` (+ `session_history_query_matches`) | Marked `withheld_policy_d18` (no memory identity), `withheld_purpose_d11` (recall revoked), or `degraded_local_d17` |

Per `D15`, hook activation in `h2a` (`packages/h2a/src/hosts/plugin.ts`) injects whichever subset of `{ rules, git, architecture, track, memory }` reports `'ready'` (or `'degraded_local_d17'`) within the per-slice readiness budget, recording exact per-slice status in `context_pack.slice_readiness[]` without stalling the prompt loop for whole-model convergence.

### 4.4 `D18` (`readonly`): Sessions Without a Memory Identity

Settled `D18` (`spec/memory/R15-SEDIMENT.md:63`): *« A session without a memory identity receives only the non-memory slices (Track, Git, architecture, rules), read-only, under a recorded policy that lists the allowed slices. It receives no memory content »*.

**Normative `D18` Enforcement (Defense in Depth Across `h2a`, `cluster-mesh`, and `engram`):**
1. **Recorded Policy Requirement (`RecordedNonMemorySlicePolicyV1`):**
   - An anonymous, ephemeral, or unauthenticated-memory session (`hasMemoryIdentity === false`) MAY receive non-memory context **if and only if** a signed/recorded workspace policy (`policy_id`, `policy_digest_sha256`, `allowed_slices ⊆ ['track', 'git', 'architecture', 'rules']`, `mutability: 'read-only'`) is on file. Notice that `'memory'` is structurally forbidden in `allowed_slices` (`INVALID_SCHEMA` at validation if present). If no recorded policy exists, **zero slices** are injected (fail-closed).
2. **Zero Memory Content Guarantee:**
   - When `hasMemoryIdentity === false`:
     - All 6 `M1` tools (`engram_memory_search`, `engram_memory_get`, `engram_memory_capture`, `engram_memory_request_admission`, `engram_memory_withdraw`, `engram_memory_forget`) are **refused** (`UNAUTHORIZED_SCOPE` / masked at `shim-bridge`), so the session can neither read nor mutate canonical memory;
     - If `engram_memory_context` is invoked under a `D18` recorded policy claim, `MemoryContextPortV1` executes in `ranking_mode: 'readonly_non_memory_d18'`:
       - `mission_focus_context` is **omitted** (zero `owner_decisions` from memory journal, zero `significant_tool_results`, zero `dreaming_recalled_facts`, zero `D5` pending bodies);
       - `session_history_query_matches` is **omitted** (even if `query_text` was passed);
       - `slice_readiness` marks `memory` as `'withheld_policy_d18'` and returns only the read-only Git/file/registry-backed slices explicitly listed in `RecordedNonMemorySlicePolicyV1.allowed_slices` (`track`, `git`, `architecture`, `rules`).

### 4.5 `D19`, `D11` (`dedicated`), and `D17` (`degraded`) Runtime Guarantees

- **`D19` Unified Architecture Across All 8 CLI Hosts:** Per `D19` (`R15-SEDIMENT.md:64,111-113`), CLIs without native mid-turn hook callbacks are **not** relegated to a shallow launch-only fallback (`hook-fallback=hybrid` was explicitly rejected). Every switched CLI host consumes the live `engram` contextual graph fed at every turn (Spec 1) via `engram_memory_context` (Spec 2) and enriched by dormant dreaming resynthesis (Spec 3).
- **`D11` (`dedicated`) Recall Independence (`R15-SEDIMENT.md:56`):** Automatic session capture runs under `purpose_ref: 'memory.capture.session/v1'` (Spec 1), whereas `engram_memory_context` executes under dedicated purpose `'memory.recall.contextual/v1'`. Revoking capture consent immediately halts Spec 1 automatic capture without cutting `engram_memory_context` recall over already-authorized records.
- **`D17` (`degraded`) Fenced Local Continuation (`R15-SEDIMENT.md:62`, `Spec 6A §2.4` `:399-416`):** When remote `cluster-mesh` sync is unreachable, `engram_memory_context` serves from the local fenced SQLite `engram-memory` store (`degraded: true`, `degraded_reason: 'remote_cluster_mesh_unreachable'`), and all 8 CLI hosts display the mandatory degraded-mode banner and structured audit log.

---

## 5. `D14` Host-Side Purge vs `D23` Canonical Queryable Retention

### 5.1 Resolving the Apparent Tension Without Reopening `D13`, `D14`, or `D23`

- **Settled `D13` (`host`, `R15-SEDIMENT.md:58`):** *« Context logs are retained per the host's audit policy. A single policy applies once its value is declared »*.
- **Settled `D14` (`window`, `R15-SEDIMENT.md:59`):** *« After close, processed items remain presented for the D13 duration, which serves the audit. Then presentation stops and the purge is announced »*.
- **Settled `D23` (`R15-SEDIMENT.md:68`):** *« L envoi au llm ne devrait pas envoyer de vieux contexte. L historique de sessions serait juste acceasible via la memoire comme gestionnaire de session et memoire (on garde l historique de texte en query via le graph memoire) »*.

`D14` and `D23` govern **two distinct storage tiers** (`PLAN_SPEC_ENGRAM_FRONT.md:183`):
1. **`D14` Purges Host-Side Local Copies, Context Logs, Caches, and Post-Close Audit Presentation Views:**
   - Once a session closes and its raw turns/extractions have been processed into `engram` (`Spec 1`), the CLI host / `h2a` local runtime keeps processed context logs and audit presentation items visible **only** for the single declared `D13` host audit duration (`declaredHostAuditDurationMs`).
   - When `closedAt + declaredHostAuditDurationMs` elapses, host presentation stops immediately, `engram` / `cluster-mesh` emits `PurgeAnnouncementReceiptV1` (`Spec 1` §5.3), and the host **cryptographically/deterministically deletes** its local linear session transcript files, step prompt/context assembly logs, cached `EngramMemoryContextOutputEnvelopeV1` packs, `ReprocessedPreviousStepV1` scratch buffers, and expired `MemoryContextPageStoreV1` handles.
2. **`D23` Retains Canonical Session Text History Queryable on Demand Inside `engram`:**
   - `engram` is the session and memory manager (`« comme gestionnaire de session et memoire »`). The `D14` host purge **does NOT delete** canonical `session_turn` records (`turn_text` bounded to `<= 64 KiB` + `SessionDbCitationTuple` `(sessionId, entryId, ordinal, contentDigest, branchEpoch?, parentEntryId?)`), `tool_result` metadata, admitted `MemoryRecordV2` items, or `D27` `decision_dossier` records inside `engram`.
   - Those canonical `engram` records remain queryable on demand via `engram_memory_context` (`context_query.query_text` → `session_history_query_matches`, gated by `D5`, `D6`, `D7`, `D8`, `D11`, `D18`, `D33`), and are bounded solely by:
     - canonical `RetentionV1` / `ContentPolicyV1.computeRetentionDeadline` (`sentropic:packages/cluster-mesh/src/sessions/content-policy.ts:148-164`),
     - explicit `engram_memory_withdraw` / `engram_memory_forget` (`tombstone`) lifecycle transitions (`SPEC_MEMORY_MCP_V2.md:57-58`), and
     - `D10=mandate` locality (`R15-SEDIMENT.md:55`: context logs and context summaries stay on the local `engram` replica unless the `h2a` mandate's transfer policy within the owner's per-repository policy explicitly authorizes cross-machine replication).

### 5.2 Artifact-by-Artifact Disposition Matrix (`D10`, `D13`, `D14`, `D23`, `M10`)

| Artifact / Copy | Owner Tier | Active Step Prompt? (`D23`) | Post-Close `D13` Window (`D14`) | After `D14` `PurgeAnnouncementReceiptV1` | Cross-Machine Sync (`D10` / `D24`) | In `.graphify/graph.json`? (`M10`) |
|---|---|---|---|---|---|---|
| Host CLI raw multi-turn transcript / rollover file | `h2a` host local disk/RAM | **Forbidden** once host switched (`D23`) | Presented read-only for `D13` host audit only | **Purged** from host disk/cache | Never synced | **Never** |
| `ReprocessedPreviousStepV1` buffer | `h2a` step loop RAM | Step $k$ only (dropped at step $k+1$) | Retained in host context log for `D13` | **Purged** from host log | Local only unless `D10` policy allows | **Never** |
| Host context-pack cache & `page_<48hex>` handles | `h2a` / `MemoryContextPageStoreV1` | Current step / `<= 300s` TTL | Audit log reference for `D13` | **Purged** (TTL `<= 300s`; log purged after `D13`) | Never synced | **Never** |
| Canonical `session_turn` (`turn_text` `<= 64 KiB` + `SessionDbCitationTuple`) | `engram` (`engram-memory` / `session-db`) | **Never unsolicited**; excerpts on-demand via `query_text` (`D23`, `D6`, `D8`) | Retained in `engram` | **Kept queryable in `engram` (`D23`)** until `RetentionV1` / `ContentPolicyV1` / `forget` | Integral within same `(tenant, workspace)` (`D24`), context summaries gated by `D10` | **Never** (`EVOL D3` / `M10`) |
| Admitted `MemoryRecordV2`, owner decisions, `decision_dossier` (`D27`), dreamed facts (`D19`) | `engram` canonical journal | Ranked & budgeted in `mission_focus_context` | Retained in `engram` | **Kept in `engram`** until superseded or `tombstoned` (`forget`) | Integral ACID sync (`D24`, `Spec 6B`) | Envelopes + citations **only** when `accepted_current` & `projection_eligible === true` (`M10`) |

---

## 6. Exact Amendments to Existing `engram` Specifications (`Before → After`)

> **Rule Reminder:** Target specification files are **not modified** on disk in this lot. The blocks below record the exact line-anchored `Before → After` deltas to [`spec/SPEC_MEMORY_MCP_V2.md`](SPEC_MEMORY_MCP_V2.md) and [`spec/SPEC_MEMORY_FINALIZATION.md`](SPEC_MEMORY_FINALIZATION.md) (`PLAN_SPEC_ENGRAM_FRONT.md:184-186`).

### 6.1 Amendments to `spec/SPEC_MEMORY_MCP_V2.md`

#### 6.1.1 Section `M1` (`spec/SPEC_MEMORY_MCP_V2.md`, lines `47–76`)

**Before (`spec/SPEC_MEMORY_MCP_V2.md:47-76`, non-blank content `:47-75` + blank separator `:76`):**
```markdown
## M1. Agent-facing capabilities

The initial contract contains exactly six tools. Each MUST be independently discoverable and independently authorized. Enabling memory MUST NOT grant all six automatically.

| Tool | Neutral operation | Required behavior |
|---|---|---|
| `engram_memory_search` | New versioned `MemoryRecallPortV3.recall` facet | Retrieve authorized, currently eligible memories with citations and ranking receipts. |
| `engram_memory_get` | New `MemoryReadPortV1.readCurrent` | Read one known canonical record without depending on search ranking. |
| `engram_memory_capture` | `MemoryPortV2.capture` | Durably submit cited material as an encrypted pending candidate. |
| `engram_memory_request_admission` | `MemoryPortV2.requestAdmission` | Request the configured policy’s decision. The caller cannot supply the decision. |
| `engram_memory_withdraw` | `transition({ operation: "withdraw" })` | Terminate a pending candidate and report required key destruction accurately. |
| `engram_memory_forget` | `transition({ operation: "tombstone" })` | Make an admitted record terminally ineligible and report derived cleanup accurately. |

Capture does not make a memory recallable. Admission is a separate policy operation. Withdrawal and forgetting remain distinct because their targets and legal transitions differ.

The tools expose **current memory only**. They MUST NOT expose arbitrary historical cursors, pending bodies, disputed-memory browsing, or administrative candidate inspection.

The following operations remain outside the agent MCP surface:

| Operation | Ownership |
|---|---|
| `admin`, bootstrap, rotation, revocation | Host administration through `MemoryPortV2.admin` and injected `AdminProviderPort`. |
| `ingestActivity` | Host automation selecting sources, schedules, scope, purpose, retention, and consent. |
| `invalidateProjections` | Host maintenance; ordinary forgetting callers receive no store-wide invalidation authority. |
| Backup, restore, migration | Host operations with their existing authorization and integrity requirements. |
| Cross-scope capitalisation | A separately authorized workflow requiring source read, target capture, sanitization, and renewed admission. |
| Reconciliation, supersession, dispute resolution, rewind | Separate lifecycle workflows. |
| `capabilities`, `readiness` | Composition and operational diagnostics with host-controlled disclosure. |
| `validate`, `cancelCapture` | Adapter internals. Cancellation may address only the caller’s corresponding capture. |
```

**After (`spec/SPEC_MEMORY_MCP_V2.md:47-76` amended per `D5`, `D19`, `D20`, `D22`, `D23`, `Point 2B`):**
```markdown
## M1. Agent-facing capabilities

The `v1` baseline contract (`sentropic.engram.memory-wire/v1`, `sentropic.engram.memory-tools/2020-12-v1`) contains six tools. Per `D20=seventh` and `Point 2B` (`spec/memory/OWNER-DECISIONS-2026-11-14.md:22`; `spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md` §2), the `v2` profile (`sentropic.engram.memory-wire/v2`, `sentropic.engram.memory-tools/2020-12-v2`) adds a seventh read-only tool, `engram_memory_context`, built disabled by default (`contextToolsEnabled: false`) and exposed only after `engram` + `sentropic` co-signature (`CoSignatureReceiptV2`), `MCP-L5` production qualification, and per-host `BridgeLock` switchover with a mandatory fixed end date (`Spec 6A` §4.3). Each tool MUST be independently discoverable and independently authorized. Enabling memory MUST NOT grant all tools automatically.

| Tool | Profile | Neutral operation | Required behavior |
|---|---|---|---|
| `engram_memory_search` | `v1`, `v2` | Versioned `MemoryRecallPortV3.recall` facet | Retrieve authorized, currently eligible (`accepted_current`) memories with citations and ranking receipts. |
| `engram_memory_get` | `v1`, `v2` | `MemoryReadPortV1.readCurrent` | Read one known canonical `accepted_current` record without depending on search ranking. |
| `engram_memory_capture` | `v1`, `v2` | `MemoryPortV2.capture` | Durably submit cited material as an encrypted pending candidate. |
| `engram_memory_request_admission` | `v1`, `v2` | `MemoryPortV2.requestAdmission` | Request the configured policy’s decision. The caller cannot supply the decision. |
| `engram_memory_withdraw` | `v1`, `v2` | `transition({ operation: "withdraw" })` | Terminate a pending candidate and report required key destruction accurately. |
| `engram_memory_forget` | `v1`, `v2` | `transition({ operation: "tombstone" })` | Make an admitted record terminally ineligible and report derived cleanup accurately. |
| `engram_memory_context` | `v2` (default-disabled; `Point 2B`) | `MemoryContextPortV1.assembleContext` (`Spec 2` §2) | Assemble a token- and byte-budgeted durationless step context pack (`D19`, `D22`, `D23`) anchored on the out-of-band verified `H2AEnvelope<H2AMandate>` (`D4`), carrying domain slices strictly as `(OntologyTemplateEnvelopeRef, Sha256Digest)` envelopes (`Point 2B`), enforcing `D5`/`D6`/`D7`/`D8`/`D15`/`D18`/`D33`, and serving on-demand bounded session text matches (`query_text`, `D23`). |

Capture does not make a memory generally recallable. Admission remains a separate policy operation. Withdrawal and forgetting remain distinct because their targets and legal transitions differ.

The six `v1` tools expose **`accepted_current` memory only** (`DISCLOSABLE_MEMORY_STATES = ['accepted_current']`); they MUST NOT expose arbitrary historical cursors, pending bodies, disputed-memory browsing, or administrative candidate inspection. Under `v2`, `engram_memory_context` alone additionally admits: (a) pre-admission (`pending`) bodies scoped strictly to successive sessions of the **exact same cryptographically verified `h2a` role within the exact same `(tenantId, workspaceId)` space** (`D5=same-agent`, stamped `same_role_pending_d5`, never elevating unratified `Track` `proposed` domain items per `Point 5B`), and (b) bounded on-demand session text history queries (`query_text`, `D23`, gated by `D6`/`D8`/`D33`), replacing linear session context accumulation and session rollover (`D19`, `D22`, `D23`).

The following operations remain outside the agent MCP surface:

| Operation | Ownership |
|---|---|
| `admin`, bootstrap, rotation, revocation | Host administration through `MemoryPortV2.admin` and injected `AdminProviderPort`. |
| `ingestActivity` / `EngramSessionIngestFrontPort` | Host session-front automation (`Spec 1`, `/memory/v1/session-front/*` via `cluster-mesh`, `R12`) selecting sources, schedules, scope, dedicated capture purpose (`D11`), retention (`D13`), and consent. |
| `invalidateProjections` | Host maintenance; ordinary forgetting callers receive no store-wide invalidation authority. |
| Backup, restore, migration, integral DB-cluster sync (`D24`) | Host and `cluster-mesh` operations (`Spec 6B`) with their existing authorization and integrity requirements. |
| Cross-scope capitalisation | A separately authorized workflow requiring source read, target capture, sanitization, and renewed admission. |
| Reconciliation, supersession, dispute resolution, rewind, dormant dreaming synthesis (`D19`, `D25`, `D26`) | Separate lifecycle and background analyst workflows (`Spec 3`). |
| `capabilities`, `readiness` | Composition and operational diagnostics with host-controlled disclosure. |
| `validate`, `cancelCapture` | Adapter internals. Cancellation may address only the caller’s corresponding capture. |
```

#### 6.1.2 Section `M7` (`spec/SPEC_MEMORY_MCP_V2.md`, lines `536–580` and `590–617`)

**Before (`spec/SPEC_MEMORY_MCP_V2.md:536-580`, non-blank content `:536-579` + blank separator `:580`):**
````markdown
## M7. Sentropic standard and both registration levels

### Contract status and required mutation qualification

The provider MUST implement Sentropic’s `AppConnectorProviderAdapter` and use its manifest, context, invocation, and result contracts.

The inspected mutation helper at `packages/mcp-platform/src/experimental/mutation-gate.ts` is explicitly **not frozen**, semver-exempt, and mock-only. The elicitation manifest extension is also experimental. These facts MUST NOT be described as an already frozen production mutation contract.

For this delivery, **MCP-L5 MUST freeze and production-qualify the required mutation subset**, including its elicitation extension, gate behavior, audit obligations, and durable host integration. Consumers MUST pin the exact qualified release in the compatibility evidence.

An exact dependency pin alone does not establish production durability or authorization. The selected release version and effective publication are currently `unverified`.

### Provider identity

The manifest identity is:

```ts
const manifestBase: AppMcpProviderManifest = {
  appId: "engram",
  providerId: "engram-memory",
  version: "1.0.0",
  displayName: "Engram Memory",
  resources: [],
  tools: memoryTools,
  prompts: [],
  authz: {
    requiredClaims: ["sub", "tid"],
    scopes: ["mcp:discover", "mcp:tools:invoke"],
    tenantResolution: "custom-resolver"
  },
  audit: {
    eventKinds: ["invoke"],
    piiClass: "high"
  },
  durability: {},
  secrets: []
};
```

The adapter’s `connectorId` is `engram-memory`.

`secrets: []` declares no engram-specific connector authentication secret. Host authentication and memory encryption custody remain outside discovery.

The mutation-capable manifest MUST additionally use the qualified elicitation extension. Withdrawal and forgetting each declare a required `confirm` policy with:
````

**After (`spec/SPEC_MEMORY_MCP_V2.md:536-580` amended per `Spec 6A §4` & `Spec 2 §2`, reconciling shipped `providerId: "sentropic.engram.memory"` in `src/mcp/memory/contracts.ts:143` / `gates.ts:294`):**
````markdown
## M7. Sentropic standard and both registration levels

### Contract status and required mutation and context-profile qualification

The provider MUST implement Sentropic’s `AppConnectorProviderAdapter` and use its manifest, context, invocation, and result contracts, registered in `@sentropic/mcp-platform` (`ConnectorRegistry.register`) and dispatched exclusively via `@sentropic/cluster-mesh` (`R12`, `Spec 6A` §2–§3).

The inspected mutation helper at `packages/mcp-platform/src/experimental/mutation-gate.ts` is explicitly **not frozen**, semver-exempt, and mock-only. The elicitation manifest extension is also experimental. These facts MUST NOT be described as an already frozen production mutation contract.

For `v1` delivery (`sentropic.engram.memory-tools/2020-12-v1`, 6 tools), **MCP-L5 MUST freeze and production-qualify the required mutation subset**, including its elicitation extension, gate behavior, audit obligations, and durable host integration. For `v2` activation (`sentropic.engram.memory-tools/2020-12-v2`, adding `engram_memory_context` per `D20=seventh` and `Point 2B`), `contextToolsEnabled` remains `false` by default (preserving the exact 6-tool `v1` manifest and `tools/list` surface) and MAY be set to `true` only when verified against both an `engram` + `sentropic` `CoSignatureReceiptV2` and an `MCP-L5` qualification receipt (`Spec 6A` §4.3, `Spec 2` §2.6). Consumers MUST pin the exact qualified release and profile digests in the compatibility evidence.

An exact dependency pin alone does not establish production durability or authorization.

### Provider identity

Reconciling the shipped `0.22.0+` implementation (`src/mcp/memory/contracts.ts:143-145`, `src/mcp/memory/gates.ts:292-312`, `registry/entries.v1.json:8`), the canonical `providerId` is `"sentropic.engram.memory"` while `connectorId` is `"engram-memory"`:

```ts
const manifestBase: AppMcpProviderManifest = {
  appId: "engram",
  providerId: "sentropic.engram.memory",
  version: contextToolsEnabled ? "2.0.0" : "1.0.0",
  displayName: "Engram Memory",
  resources: [],
  // 6 tools when contextToolsEnabled !== true (v1 default);
  // 7 tools (adding engram_memory_context) only under co-signed & L5-qualified v2 (Point 2B).
  tools: contextToolsEnabled ? memoryToolsV2 : memoryToolsV1,
  prompts: [],
  authz: {
    requiredClaims: ["sub", "tid"],
    scopes: ["mcp:discover", "mcp:tools:invoke"],
    tenantResolution: "custom-resolver"
  },
  audit: {
    eventKinds: ["invoke"],
    piiClass: "high"
  },
  durability: {},
  secrets: []
};
```

The adapter’s `connectorId` is `engram-memory` (`createEngramMemoryWireManifest` in `packages/cluster-mesh/src/integrations/mcp/memory-manifest.ts:4`).

`secrets: []` declares no engram-specific connector authentication secret. Host authentication, out-of-band `H2AEnvelope<H2AMandate>` verification (`params._meta['sentropic.h2a.mandate']` / `X-Sentropic-H2A-Mandate` projected onto `StpConnectorContext.h2aMandate`), and memory encryption custody remain outside discovery.

The mutation-capable manifest MUST additionally use the qualified elicitation extension. Withdrawal and forgetting each declare a required `confirm` policy with:
````

**Before (`spec/SPEC_MEMORY_MCP_V2.md:590-617`, non-blank content `:590-616` + blank separator `:617` — per-tool gates companion table in `M7`):**
```markdown
### Exact per-tool gates

Every descriptor publishes its exact schemas, claims, scopes, redaction class, mutability, category, idempotency requirement, and all gate Booleans.

All six require `sub` and `tid`, use redaction class `high`, and require `mcp:tools:invoke` for invocation. Discovery separately requires `mcp:discover`.

| Tool | Mutability | Category | External mutation | Idempotency |
|---|---|---|---|---|
| Search | `read-only` | `read` | `false` | `{ required: false }` |
| Get | `read-only` | `read` | `false` | `{ required: false }` |
| Capture | `append` | `write` | `true` | `{ required: true, scope: "principal" }` |
| Request admission | `state-transition` | `write` | `true` | `{ required: true, scope: "principal" }` |
| Withdraw | `state-transition` | `write` | `true` | `{ required: true, scope: "principal" }` |
| Forget | `state-transition` | `write` | `true` | `{ required: true, scope: "principal" }` |

| Tool | `requiresElicitation` | `requiresHumanConfirmation` | `requiresPrincipalGate` | `requiresPolicy` |
|---|---:|---:|---:|---:|
| Search | `false` | `false` | `false` | `true` |
| Get | `false` | `false` | `false` | `true` |
| Capture | `false` | `false` | `false` | `true` |
| Request admission | `false` | `false` | `false` | `true` |
| Withdraw | `false` | `true` | `false` | `true` |
| Forget | `false` | `true` | `false` | `true` |

`requiresPrincipalGate` denotes an owner decision through elicitation for an invocation. It does not mean an ordinary standing principal grant. Ordinary authorization, consent, and grants remain mandatory independently of these Booleans.

D11 admission policy may require its own ceremony. That domain policy is distinct from setting `requiresPrincipalGate` on every admission request.
```

**After (`spec/SPEC_MEMORY_MCP_V2.md:590-617` amended for `v2` seventh tool gate):**
```markdown
### Exact per-tool gates

Every descriptor publishes its exact schemas, claims, scopes, redaction class, mutability, category, idempotency requirement, and all gate Booleans.

All six `v1` tools require `sub` and `tid`, use redaction class `high`, and require `mcp:tools:invoke` for invocation. When `contextToolsEnabled === true` (`v2`, `Point 2B`), `engram_memory_context` additionally requires the host-verified claim `h2a_context_mandate` (`requiredClaims: ["sub", "tid", "h2a_context_mandate"]`, minted by `cluster-mesh` only from a cryptographically verified `SignedH2AMandateWireEnvelope` with right `memory:context:assemble` or an explicit recorded `D18=readonly` non-memory slice policy; `Spec 6A` §4.2, `Spec 2` §4.4). Discovery separately requires `mcp:discover`.

| Tool | Profile | Mutability | Category | External mutation | Idempotency |
|---|---|---|---|---|---|
| Search | `v1`, `v2` | `read-only` | `read` | `false` | `{ required: false }` |
| Get | `v1`, `v2` | `read-only` | `read` | `false` | `{ required: false }` |
| Capture | `v1`, `v2` | `append` | `write` | `true` | `{ required: true, scope: "principal" }` |
| Request admission | `v1`, `v2` | `state-transition` | `write` | `true` | `{ required: true, scope: "principal" }` |
| Withdraw | `v1`, `v2` | `state-transition` | `write` | `true` | `{ required: true, scope: "principal" }` |
| Forget | `v1`, `v2` | `state-transition` | `write` | `true` | `{ required: true, scope: "principal" }` |
| Context (`engram_memory_context`) | `v2` (default-disabled) | `read-only` | `read` | `false` | `{ required: false }` |

| Tool | `requiresElicitation` | `requiresHumanConfirmation` | `requiresPrincipalGate` | `requiresPolicy` |
|---|---:|---:|---:|---:|
| Search | `false` | `false` | `false` | `true` |
| Get | `false` | `false` | `false` | `true` |
| Capture | `false` | `false` | `false` | `true` |
| Request admission | `false` | `false` | `false` | `true` |
| Withdraw | `false` | `true` | `false` | `true` |
| Forget | `false` | `true` | `false` | `true` |
| Context (`engram_memory_context`) | `false` | `false` | `false` | `true` |

`requiresPrincipalGate` denotes an owner decision through elicitation for an invocation. It does not mean an ordinary standing principal grant. Ordinary authorization, consent, and grants remain mandatory independently of these Booleans.

D11 admission policy may require its own ceremony. That domain policy is distinct from setting `requiresPrincipalGate` on every admission request.
```

#### 6.1.3 Section `M10` (`spec/SPEC_MEMORY_MCP_V2.md`, lines `884–910`)

**Before (`spec/SPEC_MEMORY_MCP_V2.md:884-910`):**
```markdown
## M10. Filtered memory projection into the graph (restored D3/D10)

The restored decision is the initial D10 at validated baseline `7bc9baec`, recalled exactly:

> **D10 — Bounded current projection; history never inflates `graph.json`**
>
> `graph.json` is one bounded current graph projection, not canonical history and not “graph plus projection.” It may contain only current accepted projection envelopes, citation references, and projection metadata. It never contains record bodies, pending data, journal events, tombstone history, rank receipts, authorization receipts, backup material, or vectors.
>
> The raw-byte merge ceiling remains `52_428_800` bytes. A bounded export records high-water cursor, included record count, omitted count by reason, projection schema version, and digest. Omission must follow an explicit deterministic filter; silent top-N loss is forbidden. Any journal length may be replayed without linear growth of `graph.json` when current eligible cardinality is fixed.

The canonical journal and immutable record blobs remain the sole memory authority (EVOL D3). Graph nodes and edges, indexes, caches, exports, and UI scenes are projections. No projection path, including graph construction, export, reload, or `GraphStore.pushGraph`, may capture, admit, mutate, or resurrect a canonical memory record.

The graph may combine code with current projections of admitted, eligible, and authorized memories for the scope and audience of that view. Memory projection uses the neutral projection DTOs defined by EVOL. It carries only the envelopes, citation references, and projection metadata permitted by initial D10; it MUST NOT copy canonical record bodies, pending data, journal events, tombstone history, authorization receipts, backup material, or vectors into `graph.json`.

Projection eligibility is explicit. Only a record in `accepted_current` with `projection_eligible === true`, currently eligible and authorized for the target scope and audience, may appear in the `graph.json` projection. Any transition to `accepted_disputed` (dispute), `withdrawn`, `historical`, `expired`, `trust_invalid`, or `tombstoned` removes the record from the projection at the next regeneration or reconciliation; `pending` and `rejected` records are never projected. Memories that are private for the target audience, not admitted, or not eligible MUST be excluded before assembly and before any report, wiki, export, or cache is produced. The exclusion covers their identifiers, citations, relations, statistics, and indirect influence. Rights MUST NOT be inferred from the mere presence of an object in the graph.

Links to code rest on authorized references and evidence. No edge between records in different scopes and no private derivation lineage may bypass the capitalisation and redaction rules of EVOL.

Loss of eligibility or authorization makes a memory immediately unavailable to authorized reads. Affected projections MUST be invalidated and then rebuilt or cleaned through the acknowledged cursor. A stale projection MUST NOT be served as a current authorized view. Retries, restores, and replayed batches MUST NOT resurrect a forgotten record.

X2b keeps its persistence, staging, and invalidation guarantees. A projection adapter MUST NOT accidentally replace the whole assembled graph: integration passes through a controlled assembly that preserves foreign objects. Path, staging, and alias safeguards prevent writes outside that assembly; they do not forbid an authorized memory projection.

The `52_428_800`-byte ceiling, deterministic omissions, freshness metadata, and the EVOL invalidation-cascade criteria remain applicable. The dedicated memory tools remain usable without any code graph file.

Code symbols and documentation describing the memory implementation remain legitimate graph material. No cleanup of existing artifacts is presumed without evidence of non-conforming content. Any correction preserves the journal, canonical records, tombstones, and backup integrity.

Restoration note: M10 restores the validated baseline at `7bc9baec` (initial D3/D10). This is a restoration, not a new owner amendment.
```

**After (`spec/SPEC_MEMORY_MCP_V2.md:884-910` amended to record the `D19`/`D22`/`D23` contextual graph query separation while keeping `EVOL D3` and `7bc9baec` `D10` strictly intact):**
```markdown
## M10. Filtered memory projection into the graph (restored D3/D10)

The restored decision is the initial D10 at validated baseline `7bc9baec`, recalled exactly:

> **D10 — Bounded current projection; history never inflates `graph.json`**
>
> `graph.json` is one bounded current graph projection, not canonical history and not “graph plus projection.” It may contain only current accepted projection envelopes, citation references, and projection metadata. It never contains record bodies, pending data, journal events, tombstone history, rank receipts, authorization receipts, backup material, or vectors.
>
> The raw-byte merge ceiling remains `52_428_800` bytes. A bounded export records high-water cursor, included record count, omitted count by reason, projection schema version, and digest. Omission must follow an explicit deterministic filter; silent top-N loss is forbidden. Any journal length may be replayed without linear growth of `graph.json` when current eligible cardinality is fixed.

The canonical journal and immutable record blobs remain the sole memory authority (EVOL D3). Graph nodes and edges, indexes, caches, exports, and UI scenes are projections. No projection path, including graph construction, export, reload, or `GraphStore.pushGraph`, may capture, admit, mutate, or resurrect a canonical memory record.

The graph may combine code with current projections of admitted, eligible, and authorized memories for the scope and audience of that view. Memory projection uses the neutral projection DTOs defined by EVOL. It carries only the envelopes, citation references, and projection metadata permitted by initial D10; it MUST NOT copy canonical record bodies, pending data, journal events, tombstone history, authorization receipts, backup material, vectors, or Spec 1/Spec 2 raw `session_turn` text (`turn_text`), `tool_result` payloads, `D5` same-role pending bodies, or `ReprocessedPreviousStepV1` step summaries into `graph.json`.

Contextual prompt replacement (`D19`, `D22`, `D23` in `spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md`) preserves EVOL D3 and initial D10 in full: raw session events and `turn_text` history (`<= 64 KiB` + `SessionDbCitationTuple`) are canonical journal records in `engram-memory` / `session-db`; the memory graph read by `engram_memory_context` is their authorized live index/projection inside `engram`; and on-demand session text history returned by `engram_memory_context` (`query_text` → `session_history_query_matches`, `D23`) is served directly from the canonical store under `D6`/`D8`/`D33` redaction and is **never** copied into `.graphify/graph.json`.

Projection eligibility for `.graphify/graph.json` remains explicit. Only a record in `accepted_current` with `projection_eligible === true`, currently eligible and authorized for the target scope and audience, may appear in the `graph.json` projection. Any transition to `accepted_disputed` (dispute), `withdrawn`, `historical`, `expired`, `trust_invalid`, or `tombstoned` removes the record from the projection at the next regeneration or reconciliation; `pending` (including `same_role_pending_d5`) and `rejected` records, as well as unratified `Track` `proposed` domain items (`Point 5B`), are never projected into `graph.json`. Memories that are private for the target audience, not admitted, or not eligible MUST be excluded before assembly and before any report, wiki, export, or cache is produced. The exclusion covers their identifiers, citations, relations, statistics, and indirect influence. Rights MUST NOT be inferred from the mere presence of an object in the graph.

Links to code rest on authorized references and evidence. No edge between records in different scopes and no private derivation lineage may bypass the capitalisation and redaction rules of EVOL.

Loss of eligibility or authorization makes a memory immediately unavailable to authorized reads and invalidates any `engram_memory_context` pagination handle (`STALE_PAGE`). Affected projections MUST be invalidated and then rebuilt or cleaned through the acknowledged cursor. A stale projection MUST NOT be served as a current authorized view. Retries, restores, and replayed batches MUST NOT resurrect a forgotten record.

X2b keeps its persistence, staging, and invalidation guarantees. A projection adapter MUST NOT accidentally replace the whole assembled graph: integration passes through a controlled assembly that preserves foreign objects. Path, staging, and alias safeguards prevent writes outside that assembly; they do not forbid an authorized memory projection.

The `52_428_800`-byte ceiling, deterministic omissions, freshness metadata, and the EVOL invalidation-cascade criteria remain applicable. All seven dedicated memory tools (including `engram_memory_context` when `v2` is enabled) remain usable without any `.graphify/graph.json` file.

Code symbols and documentation describing the memory implementation remain legitimate graph material. No cleanup of existing artifacts is presumed without evidence of non-conforming content. Any correction preserves the journal, canonical records, tombstones, and backup integrity.

Restoration note: M10 restores the validated baseline at `7bc9baec` (initial D3/D10) and clarifies its strict separation from the `D23` `engram_memory_context` query path.
```

---

### 6.2 Amendments to `spec/SPEC_MEMORY_FINALIZATION.md` (`§0–§2`, lines `1–60`)

**Before (`spec/SPEC_MEMORY_FINALIZATION.md:1-60`, `§0–§2` non-blank content `:1-58` + blank `:59` preceding `:60 ## 3. Items`):**
```markdown
# SPEC — Memory engine finalization (`engram-memory`)

**Date:** 2026-10-06 (closure addendum 2026-10-18, §9)
**Status:** proposed, amended after review rounds 1 (§7) and 2 (§8) — for conductor review. This document authorizes no merge, push, tag, publication, migration, or go-live. The §9 addendum records delivered evidence and owner decisions only; it authorizes nothing further.
**Base:** `origin/main` `c96fc01e` (package `@sentropic/engram` 0.19.1), branch `feat/memory-finalization`. Closure baseline: `origin/main` `a88375f015104dee1dc0331530d878959133c840` (PR #398); engram 0.20.0 published from `af60f9d7` (tag `v0.20.0`).
**Parent (normative):** `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`, cited below as **EVOL** with its line numbers. This document is a delta: every contract change it proposes lands in EVOL through the lot that implements it.
**Plan:** `plan/08-BRANCH_MEMORY_FINALIZATION.md` (lots `F0`–`F14`, triage lots `X*`).
**Registries corrected by this change:** `BRANCH.md` (R2-f, R2-b, R2-c) and `plan/07-BRANCH_AGENT_MEMORY_SUBSTRATE.md` (Lot 0) — see §3.8.
**Excluded:** Postgres go-live and `external-host` activation (owner decision); publication of `engram-memory` (release decision).

## 0. Evidence and vocabulary

Evidence used, and only this evidence:

| Id | Source | Notes |
|---|---|---|
| E1 | code at `c96fc01e`, cited `path:line` | read directly in this worktree |
| E2 | GitHub Actions run `37177756444` (TypeScript CI, `main`, merge of #342, 2026-10-04) | jobs `test (20)` `111363850978`, `test (22)` `111363851095`, `test (24)` `111363851159`: all `success`; per-file outcomes below are quoted from the Node 24 job log, re-fetched on 2026-10-06 with `gh api repos/rhanka/engram/actions/jobs/111363851159/logs` and re-checked against it |
| E3 | npm registry metadata, queried 2026-10-06 | `npm view fs-ext@2.1.1`, `npm view better-sqlite3@12.11.1` |
| E4 | `tsc -p engram-memory/tsconfig.json --listFilesOnly` (tsc 5.4.5, nothing emitted) | the repository pins TypeScript ^6.0.3; `include` semantics are assumed unchanged (unverified for 6.x) |
| E5 | agent/conductor session logs on this workstation, outside the repository | used only to locate the definition of "image ABI" (§3.6) |

Not run: the local test suite (the worktree has no `node_modules`; no install was performed). Every "green" below comes from E2.

Status terms: `done` (code and green test evidence), `partial`, `missing`, `defect` (code contradicts EVOL), `unverified` (claim without evidence reachable from here), `source-gap` (information owned outside this repository), `N-A`, `declared gap` (EVOL records it as intentionally unsupported), `out-of-scope`.
**PROPOSED** marks a contract element, name, or file that does not exist in the code today.
In the RED lists, a case marked "RED at baseline" fails on `c96fc01e` for the stated reason; an unmarked case is a guard that characterizes existing or newly built behaviour, and its non-vacuity is shown by a mutation run recorded in the lot's PR (a fixture case or an in-test control adds evidence but does not replace the mutation run).

## 1. Summary

| # | Item | Observed state | Finalization target | Lots | Owner decision |
|---|---|---|---|---|---|
| 1 | L0 neutrality / boundary / extraction | `partial`: memory-closure vocabulary scan green; legacy memory surfaces gone; `src/agent-stats/**` gone but the subsystem is staged in-repo; repo-wide `@sentropic/*` removal not done and contradicted by product direction; one-way import closure holds but is unenforced; the `./integration` export is not built; README/ARCHITECTURE drift | enforce the closure over sources, generated code, memory tests and documentation examples; scan the packed file list; build every export; fix docs; resolve scope and staging | F5, F6, F11, F12 | D-1, D-2 |
| 2 | L5 assertion reconciliation | `partial`: registry module and the 3 named REDs green; engine never uses `assertion_registry`; `proposal_id` domain ≠ D5; `supersedes` loses its direction; errors labelled `admin`; checkpoint `registry_versions: []`; no application binding | L5a fixes without contract change, then L5b engine reconciliation (contract amendment) | F4, F8, F9, F10 | D-3 |
| 3 | R2-g Postgres CI lane | `partial` (T-g4 executed — job `memory-postgres` green on PR #344, run 38033477180, both files `1 test` passed, `0 skipped`; receipt parity, illegal-transition no-write and logical backup on Postgres stay `not covered`) | dedicated CI job, digest-pinned official images, required mode (a skip becomes a failure); registry and EVOL claims limited to what the lane executes | F1 (+F1b, F1c) | D-4, D-7(ii) |
| 4 | R2-h `multiply_linked` in `readiness()` | `missing`; related `defect`: the factory-wrapped receipt carries fields its `receipt_digest` does not bind | F2 digest fix (no contract change), then F7 additive receipt field | F2, F7 | D-5 |
| 5 | R2-a macOS/Windows fenced SQLite | `declared gap`, fail-closed at open; the Linux proof does not port as-is (unknowns U1–U5) | recommended: remains a declared gap; if included, evidence spikes first | F14 (conditional) | D-6 |
| 6 | "image ABI" | term absent from the repository; definition located in a session log (E5), not ratified | definition to validate; Node-only native smoke, CI step, image-builder note, EVOL D8 wording fix | F3 | D-7 |
| 7 | R2-b shared FS, R2-c cross-process provenance | open in `BRANCH.md` | decided: out of finalization scope, traced | — | override only |
| 8 | Registry | R2-f unchecked; Lot 0 boxes unaligned | corrected in this change | F0 | — |
| X | Found outside the brief | activity ingestion absent; `invalidateProjections` stub with no wiring contract; SQLite version gate absent; logical backup reachable only for the in-memory store; naming drift | triage | X1–X6 | D-8 (X1), D-9 (X3), D-10 (X2), D-11 (X4) |

## 2. CI evidence baseline (E2, Node 24 job)

| File | Outcome on `c96fc01e` |
|---|---|
| `tests/memory-neutrality.test.ts` | pass — `2 tests \| 1 todo` (one real test + one `it.todo`) |
| `tests/memory-activity-boundary.test.ts` | pass — 1 test |
| `tests/memory-v1-removal.test.ts` | pass — 3 tests |
| `tests/assertion-family-registry.test.ts` | pass — 3 tests |
| `tests/integration-surface-neutrality.test.ts` | pass — 4 tests |
| `tests/sqlite-memory-broker.native.test.ts`, `tests/sqlite-fence-nlink.native.test.ts`, `tests/sqlite-fence-shim.native.test.ts`, `tests/canonical-memory-store.test.ts` | pass — 4, 3, 1, 2 tests (Linux native lane executed, not skipped) |
| `tests/store-provenance.test.ts`, `tests/canonical-store-factory.test.ts`, `tests/capability-attestation-gate.test.ts`, `tests/memory-fence-posture.test.ts`, `tests/memory-fence-default-refusal.test.ts` | pass — 8, 6, 3, 4, 3 tests |
| `tests/memory-backup.test.ts`, `tests/memory-projection-cascade.test.ts` | pass — 1, 1 tests (both on the in-memory store or recording fakes) |
| `tests/canonical-memory-store.parity.test.ts` | **skipped** — `1 test \| 1 skipped` |
| `tests/postgres-memory-store.native.test.ts` | **skipped** — `1 test \| 1 skipped` |
| `tests/storage-postgres.test.ts`, `storage-pgvector`, `storage-neo4j`, `storage-spanner`, `storage-postgres-time-window`, `tests/memory-trusttier-roundtrip.test.ts` | pass with exactly 1 skipped live block each |
| `tests/agent-stats*.test.ts` (7 files) | pass — 125 tests: phase15 27, project-graph 33, phase2 26, phase1 16, `agent-stats` 16, h2a-evidence 6, extraction 1 |
```

**After (`spec/SPEC_MEMORY_FINALIZATION.md:1-60` amended per `PLAN_SPEC_ENGRAM_FRONT.md:186` to embed R15/R16 `D22` mandate-primary graph fingerprint queries, `D7` model-assisted sensitivity-triaged ranking, and `Point 2B` `engram_memory_context` evolution while keeping historical `c96fc01e` / `0.20.0` closure evidence untouched):**
```markdown
# SPEC — Memory engine finalization (`engram-memory`)

**Date:** 2026-10-06 (closure addendum 2026-10-18, §9; R15/R16 post-`0.28.0` contextual-graph evolution cross-reference 2026-11-15)
**Status:** proposed, amended after review rounds 1 (§7) and 2 (§8) — for conductor review. This document authorizes no merge, push, tag, publication, migration, or go-live. The §9 addendum records delivered evidence and owner decisions only; it authorizes nothing further. Post-`0.20.0` R15/R16 architectural extensions are specified in `spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md` (Spec 0), `spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md` (Spec 6A), `spec/SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md` (Spec 1), and `spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md` (Spec 2).
**Base:** `origin/main` `c96fc01e` (package `@sentropic/engram` 0.19.1), branch `feat/memory-finalization`. Closure baseline: `origin/main` `a88375f015104dee1dc0331530d878959133c840` (PR #398); engram 0.20.0 published from `af60f9d7` (tag `v0.20.0`). R15/R16 design baseline: `docs/memory-r15-sediment` (`@sentropic/engram` 0.28.0, `d5eb6171`).
**Parent (normative):** `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`, cited below as **EVOL** with its line numbers, together with `spec/memory/R15-SEDIMENT.md` (`D1`–`D34`) and `spec/memory/OWNER-DECISIONS-2026-11-14.md` (`Points 1B–6A`, `T-M-C`) for post-`0.20.0` engine extensions. This document is a delta: every contract change it proposes lands in EVOL through the lot that implements it.
**Plan:** `plan/08-BRANCH_MEMORY_FINALIZATION.md` (lots `F0`–`F14`, triage lots `X*`, MCP delivery chain `MCP-L4`–`MCP-L8`) and `spec/memory/PLAN_SPEC_ENGRAM_FRONT.md` (Specs `0`, `6A`, `1`–`5`, `6B`).
**Registries corrected by this change:** `BRANCH.md` (R2-f, R2-b, R2-c) and `plan/07-BRANCH_AGENT_MEMORY_SUBSTRATE.md` (Lot 0) — see §3.8.
**Excluded (at `0.20.0` closure):** Postgres go-live and `external-host` activation (subsequently governed by Spec 6A / Spec 6B); publication of `engram-memory` (release decision).

## 0. Evidence and vocabulary

Evidence used for the `0.20.0` closure (`E1`–`E5`), preserved unchanged, plus `E6` for the R15/R16 contextual-graph engine extension:

| Id | Source | Notes |
|---|---|---|
| E1 | code at `c96fc01e`, cited `path:line` | read directly in this worktree |
| E2 | GitHub Actions run `37177756444` (TypeScript CI, `main`, merge of #342, 2026-10-04) | jobs `test (20)` `111363850978`, `test (22)` `111363851095`, `test (24)` `111363851159`: all `success`; per-file outcomes below are quoted from the Node 24 job log, re-fetched on 2026-10-06 with `gh api repos/rhanka/engram/actions/jobs/111363851159/logs` and re-checked against it |
| E3 | npm registry metadata, queried 2026-10-06 | `npm view fs-ext@2.1.1`, `npm view better-sqlite3@12.11.1` |
| E4 | `tsc -p engram-memory/tsconfig.json --listFilesOnly` (tsc 5.4.5, nothing emitted) | the repository pins TypeScript ^6.0.3; `include` semantics are assumed unchanged (unverified for 6.x) |
| E5 | agent/conductor session logs on this workstation, outside the repository | used only to locate the definition of "image ABI" (§3.6) |
| E6 | R15/R16 settled ledger (`spec/memory/R15-SEDIMENT.md`, `spec/memory/OWNER-DECISIONS-2026-11-14.md`) and `@sentropic/engram` `0.28.0` code at `d5eb6171` | governs post-`0.20.0` contextual graph recall (`D19`, `D20`, `D22`, `D23`), sensitivity-triaged model ranking (`D7`), and default-disabled seventh MCP tool `engram_memory_context` (`Point 2B`, `Spec 2`) |

Not run on `c96fc01e`: the local test suite (the worktree has no `node_modules`; no install was performed). Every `0.20.0` "green" below comes from E2.

Status terms: `done` (code and green test evidence), `partial`, `missing`, `defect` (code contradicts EVOL), `unverified` (claim without evidence reachable from here), `source-gap` (information owned outside this repository), `N-A`, `declared gap` (EVOL records it as intentionally unsupported), `out-of-scope`.
**PROPOSED** marks a contract element, name, or file that does not exist in the code today.
In the RED lists, a case marked "RED at baseline" fails on `c96fc01e` for the stated reason; an unmarked case is a guard that characterizes existing or newly built behaviour, and its non-vacuity is shown by a mutation run recorded in the lot's PR (a fixture case or an in-test control adds evidence but does not replace the mutation run).

## 1. Summary

| # | Item | Observed state | Finalization target | Lots | Owner decision |
|---|---|---|---|---|---|
| 1 | L0 neutrality / boundary / extraction | `partial`: memory-closure vocabulary scan green; legacy memory surfaces gone; `src/agent-stats/**` gone but the subsystem is staged in-repo; repo-wide `@sentropic/*` removal not done and contradicted by product direction; one-way import closure holds but is unenforced; the `./integration` export is not built; README/ARCHITECTURE drift | enforce the closure over sources, generated code, memory tests and documentation examples; scan the packed file list; build every export; fix docs; resolve scope and staging | F5, F6, F11, F12 | D-1, D-2 |
| 2 | L5 assertion reconciliation | `partial`: registry module and the 3 named REDs green; engine never uses `assertion_registry`; `proposal_id` domain ≠ D5; `supersedes` loses its direction; errors labelled `admin`; checkpoint `registry_versions: []`; no application binding | L5a fixes without contract change, then L5b engine reconciliation (contract amendment) | F4, F8, F9, F10 | D-3 |
| 3 | R2-g Postgres CI lane | `partial` (T-g4 executed — job `memory-postgres` green on PR #344, run 38033477180, both files `1 test` passed, `0 skipped`; receipt parity, illegal-transition no-write and logical backup on Postgres stay `not covered`) | dedicated CI job, digest-pinned official images, required mode (a skip becomes a failure); registry and EVOL claims limited to what the lane executes | F1 (+F1b, F1c) | D-4, D-7(ii) |
| 4 | R2-h `multiply_linked` in `readiness()` | `missing`; related `defect`: the factory-wrapped receipt carries fields its `receipt_digest` does not bind | F2 digest fix (no contract change), then F7 additive receipt field | F2, F7 | D-5 |
| 5 | R2-a macOS/Windows fenced SQLite | `declared gap`, fail-closed at open; the Linux proof does not port as-is (unknowns U1–U5) | recommended: remains a declared gap; if included, evidence spikes first | F14 (conditional) | D-6 |
| 6 | "image ABI" | term absent from the repository; definition located in a session log (E5), not ratified | definition to validate; Node-only native smoke, CI step, image-builder note, EVOL D8 wording fix | F3 | D-7 |
| 7 | R2-b shared FS, R2-c cross-process provenance | open in `BRANCH.md` | decided: out of finalization scope, traced | — | override only |
| 8 | Registry | R2-f unchecked; Lot 0 boxes unaligned | corrected in this change | F0 | — |
| X | Found outside the brief | activity ingestion absent; `invalidateProjections` stub with no wiring contract; SQLite version gate absent; logical backup reachable only for the in-memory store; naming drift | triage | X1–X6 | D-8 (X1), D-9 (X3), D-10 (X2), D-11 (X4) |
| R15-C | Post-`0.28.0` contextual graph query, mandate-primary fingerprint (`D22`), & sensitivity-triaged model ranking (`D7`) | `PROPOSED` on `d5eb6171` (`engram-memory/recall.ts:27-160` implements lexical `BM25F` + `RRF` + `PPR` over `accepted_current` only; 6-tool `v1` MCP provider in `src/mcp-memory/provider.ts:458`) | add `MemoryContextPortV1` mandate-primary role-consciousness fingerprint query (`D4`, `D22`), `D5` same-role pending-body filter, `D6` ref-only disclosure gate, `D7` `ConfidentialityDenyListV1` + `@sentropic/llm-mesh` sensitivity-triaged reranking (keeping `engram-memory` L0 neutral via injected reranker port), and default-disabled 7th tool `engram_memory_context` (`D20`, `D23`, `Point 2B`) | `2-E1`–`2-E5` (`Spec 2` §7) | R15 `D4`–`D8`, `D14`, `D15`, `D18`–`D23`; `Point 2B` |

## 2. CI evidence baseline (E2, Node 24 job on `c96fc01e`; post-`0.28.0` Spec 2 RED/GREEN suites in `Spec 2` §7)

| File | Outcome on `c96fc01e` |
|---|---|
| `tests/memory-neutrality.test.ts` | pass — `2 tests \| 1 todo` (one real test + one `it.todo`; extended in `2-E3` to guard neutral reranker port injection in `engram-memory` for `D7`) |
| `tests/memory-activity-boundary.test.ts` | pass — 1 test |
| `tests/memory-v1-removal.test.ts` | pass — 3 tests |
| `tests/assertion-family-registry.test.ts` | pass — 3 tests |
| `tests/integration-surface-neutrality.test.ts` | pass — 4 tests |
| `tests/sqlite-memory-broker.native.test.ts`, `tests/sqlite-fence-nlink.native.test.ts`, `tests/sqlite-fence-shim.native.test.ts`, `tests/canonical-memory-store.test.ts` | pass — 4, 3, 1, 2 tests (Linux native lane executed, not skipped) |
| `tests/store-provenance.test.ts`, `tests/canonical-store-factory.test.ts`, `tests/capability-attestation-gate.test.ts`, `tests/memory-fence-posture.test.ts`, `tests/memory-fence-default-refusal.test.ts` | pass — 8, 6, 3, 4, 3 tests |
| `tests/memory-backup.test.ts`, `tests/memory-projection-cascade.test.ts` | pass — 1, 1 tests (both on the in-memory store or recording fakes) |
| `tests/canonical-memory-store.parity.test.ts` | **skipped** — `1 test \| 1 skipped` |
| `tests/postgres-memory-store.native.test.ts` | **skipped** — `1 test \| 1 skipped` |
| `tests/storage-postgres.test.ts`, `storage-pgvector`, `storage-neo4j`, `storage-spanner`, `storage-postgres-time-window`, `tests/memory-trusttier-roundtrip.test.ts` | pass with exactly 1 skipped live block each |
| `tests/agent-stats*.test.ts` (7 files) | pass — 125 tests: phase15 27, project-graph 33, phase2 26, phase1 16, `agent-stats` 16, h2a-evidence 6, extraction 1 |
```

---

## 7. Small Test-First Implementation Lots per Repository

Every lot follows strict `RED → GREEN → REFACTOR` discipline, stays atomic (`<= ~150–250 LOC` per PR/commit), and respects each repository's verification kernel.

### 7.1 `engram` Repository Lots (`vitest` + `tsc --noEmit`)

| Lot | Scope & Target Files (`PROPOSED` where new) | First Failing (`RED`) Tests Written Before Implementation | Verification Command |
|---|---|---|---|
| **`2-E1`** | **Closed `v2` Schemas, Envelope-Only Domain Carrier, and Default-Disabled Profile Guard:** `src/mcp/memory/context-contracts.ts`, `src/mcp/memory/schemas.ts`, `src/mcp/memory/gates.ts`, `src/mcp/memory/receipts.ts`, `src/mcp-memory/profiles.ts`, `src/mcp-memory/provider.ts:458,648` | 1. Default `createEngramMemoryProviderV1()` emits exact 6-tool `v1` manifest digest and rejects `engram_memory_context` as `unknown_tool`.<br>2. Draft 2020-12 schema rejects `null` optional fields, extra keys, `token_budget < 128`, `max_pack_bytes < 4096`, and inline mandate fields.<br>3. `domain_typed_envelopes` accepts arbitrary new `Track` `entity_type_id` values with valid `(OntologyTemplateEnvelopeRef, Sha256Digest)` (`Point 2B`). | `npx vitest run tests/mcp-memory-context-schema.test.ts && npx tsc --noEmit` |
| **`2-E2`** | **Full-Envelope Dual Budget Packer & Opaque `page_<48hex>` Cursor Store:** `src/memory-tools/context.ts` (`packContextEnvelopeToBudget`, `createMemoryContextPageStoreV1`) | 1. `ceil(utf8Bytes(JSON.stringify(finalEnvelope)) / 3) <= effective_token_budget` and `utf8Bytes <= max_pack_bytes` **after** `budget_receipt` & `next_page_cursor` population.<br>2. Oversized single multi-byte UTF-8 item emits one scalar-safe stub (zero `U+FFFD`) and advances cursor.<br>3. Minimal-floor budget overflow returns `PROJECTION_OVERSIZED` without advancing cursor.<br>4. Concurrent `forget` tombstone or mandate change invalidates `page_cursor` with `STALE_PAGE` (`engram_owns_signing_secret: false`). | `npx vitest run tests/memory-context-budget-cursor.test.ts && npx tsc --noEmit` |
| **`2-E3`** | **Mandate-Primary Graph Fingerprint (`D22`), Attention Scorer (`D23`), & Neutral `D7` Reranker Port:** `engram-memory/contextual-graph-query.ts`, `src/memory-tools/d7-llm-mesh-reranker.ts` (via `@sentropic/llm-mesh/decision`, zero `@ai-sdk/*` imports; `engram-memory` keeps L0 neutrality) | 1. `fingerprint_query_id` changes deterministically on mandate digest/role/worktree change (`D22`).<br>2. Owner decisions (`D27` included), `security-gate`/`error`/`significant` tool results, and `dreaming_recalled_facts` (`D19`) outrank routine items (`routine` excluded from `significant_tool_results`).<br>3. `D7` reranker screens `ConfidentialityDenyListV1` before model call and falls back cleanly to `deterministic_attention_v1` under `D17=degraded`.<br>4. `tests/memory-neutrality.test.ts` confirms zero `@sentropic/*` or `@ai-sdk/*` runtime imports inside `engram-memory/**`. | `npx vitest run tests/contextual-graph-attention.test.ts tests/memory-neutrality.test.ts && npx tsc --noEmit` |
| **`2-E4`** | **Access & Disclosure Enforcement (`D5`, `D6`, `D8`, `D11`, `D15`, `D18`, `Point 5B`) & On-Demand `query_text` (`D23`, `M10`):** `engram-memory/contextual-access-gates.ts` | 1. `D5`: same `h2a` role + same `(tenantId, workspaceId)` reads `pending` body (`same_role_pending_d5`); different role or different workspace gets zero leak; `engram_memory_search`/`get` still refuse `pending`; unratified `Track` `proposed` items excluded from `domain_typed_envelopes` (`Point 5B`).<br>2. `D6`: without content auth, `context_pack`, `dreaming_recalled_facts`, `session_history_query_matches`, caches, and logs emit `(path_ref, content_fingerprint)` only (`withheld-path:<sha256>` on secret paths).<br>3. `D18`: `hasMemoryIdentity === false` with recorded policy returns allowed non-memory slices read-only and zero memory content.<br>4. `query_text` returns bounded `D8`/`D33` `session_history_query_matches` while `.graphify/graph.json` projection (`M10`) contains zero `turn_text`. | `npx vitest run tests/contextual-access-and-d23-history.test.ts && npx tsc --noEmit` |
| **`2-E5`** | **End-to-End `engram-memory` MCP Provider `v2` Integration & Spec Amendments Fold Lot:** `src/mcp-memory/provider.ts`, `src/mcp-memory/server.ts` (applying §6 amendments to `SPEC_MEMORY_MCP_V2.md` and `SPEC_MEMORY_FINALIZATION.md` only when authorized by conductor) | 1. Full 9-step `provider.invokeTool('engram_memory_context', ...)` test covering all §2.5 `PUBLIC_MEMORY_ERROR_CODES`, `-32603` untrusted context refusal, `2_097_152` B `RESULT_TOO_LARGE` guard, and `D17` `degraded: true` local SQLite execution. | `npx vitest run tests/mcp-memory-provider-context.test.ts && npx tsc --noEmit` |

### 7.2 `sentropic` Repository Lots (`Make-Only` Kernel + `make scope-check`, Atomic `<= ~150 LOC`, `packages/*` Separated from `api/*`)

| Lot | Scope & Target Files (Depends on `Spec 6A` `6A-S0a`..`6A-S2`) | First Failing (`RED`) Tests Written Before Implementation | Verification Command |
|---|---|---|---|
| **`2-S0a`** | **`mcp-platform` & `mcp-broker` Conditional `v2` 7-Tool & `CoSignatureReceiptV2` Gate:** `packages/mcp-platform/src/memory/contracts.ts`, `packages/mcp-broker/src/memory/compiled-dispatch.ts` | 1. Default `contextToolsEnabled: false` keeps 6-tool `MEMORY_TOOL_NAMES` and `unknown_tool` on `engram_memory_context`.<br>2. Enabling `v2` without valid `CoSignatureReceiptV2` + `l5QualificationReceiptRef` fails closed at startup.<br>3. `engram_memory_context` is excluded from `MUTATING_MEMORY_TOOL_NAMES` and requires `['sub', 'tid', 'h2a_context_mandate']`. | `make mcp-platform-test ENV=test-mcp && make scope-check` |
| **`2-S1a`** | **`cluster-mesh` Mandate / `D18` Claim Projection & `D6` Cache Key Isolation:** `packages/cluster-mesh/src/integrations/mcp/{memory-manifest,memory-compose,memory-transport}.ts` | 1. Verified `SignedH2AMandateWireEnvelope` (`memory:context:assemble`) or recorded `D18` read-only slice policy mints `h2a_context_mandate`; plain human OAuth token without either is refused (`UNAUTHORIZED_SCOPE`).<br>2. `D6` content-policy transition prevents serving extract-bearing cached packs to `refs_only_d6` endpoints. | `make cluster-mesh-test ENV=test-cm && make scope-check` |
| **`2-S1b`** | **`@sentropic/llm-mesh` `D7` Sensitivity-Triaged Reranker Route & Metering:** `packages/llm-mesh/src/decision/*` (after `chat-mesh C2a`) | 1. Rejects any `D7` rerank call lacking `confidentialityScreened: true` receipt.<br>2. Emits `RouteMeteringSink` record for `VerifiedRoutingSubject`. | `make llm-mesh-test ENV=test-llm && make scope-check` |
| **`2-S2`** | **`api/` Registry Dispatch & `D14` Purge Announcement Route Integration (Isolated from `packages/*`):** `api/src/services/mcp/registry-dispatch.ts`, `api/tests/api/*` | 1. JSON-RPC `POST /` and REST `POST /invoke` propagate `_meta['sentropic.h2a.mandate']` / `X-Sentropic-H2A-Mandate` (refusing mismatch with `INVALID_DIGEST`) and preserve `{ error: 'memory_request_refused' }` (`403`) catch parity. | `make api-test ENV=test-api && make scope-check` |

### 7.3 `h2a` Repository Lots (`node --test`, Gated on Prerequisite PR #455 `844402ee`)

| Lot | Scope & Target Files (Depends on PR #455 + `6A-H1`..`6A-H3`) | First Failing (`RED`) Tests Written Before Implementation | Verification Command |
|---|---|---|---|
| **`2-H1`** | **Durationless Prompt Loop Assembler & Rollover Elimination (`D23`, `D22`):** `packages/h2a/src/runtime/context/durationless-prompt-loop.ts`, `packages/h2a/src/runtime/loop/engine/tick.ts` | 1. Step $k > 1$ outbound LLM request contains **only** `(EngramMemoryContextOutputEnvelopeV1 + ReprocessedPreviousStepV1 + Step k Trigger)` — zero `[turn_1..turn_{k-1}]` messages and zero rollover handoff payload.<br>2. Step $k$ refuses to assemble before step $k-1$ raw output is ingested or locally outboxed (`D17`). | `node --test packages/h2a/test/durationless-prompt-loop.test.js` |
| **`2-H2`** | **Non-Blocking Five-Slice Hook Injector (`D15`) & `D18` Read-Only Policy Guard:** `packages/h2a/src/runtime/context/{slice-injector,readonly-slice-policy}.ts`, `packages/h2a/src/hosts/plugin.ts` | 1. `D15`: slow/pending `track` or `architecture` slice never delays injection of ready `rules`, `git`, and `memory` slices.<br>2. `D18`: session with `hasMemoryIdentity === false` injects only recorded `allowed_slices ⊆ ['track','git','architecture','rules']` read-only and blocks all memory content/tools; missing policy injects zero slices. | `node --test packages/h2a/test/context-slices-d15-d18.test.js` |
| **`2-H3`** | **`D14` Post-`D13` Window Host Context Purge & `D6` Host Log Redaction:** `packages/h2a/src/runtime/context/host-context-purge.ts` | 1. Processed context logs and audit views stay readable for exact declared `D13` host duration after session close, then stop presenting, record `PurgeAnnouncementReceiptV1`, and delete host transcript/pack caches while `engram` `query_text` remains queryable (`D23`).<br>2. Under `D6=refs`, host logs write only `(path_ref, content_fingerprint)`. | `node --test packages/h2a/test/host-context-purge-d14.test.js` |
| **`2-H4`** | **8-Host Signed `BridgeLock` Switchover & Deadline Enforcement (`Point 2B`, `Spec 6A §4.3`):** `packages/h2a/src/registry/{bridge-lock,descriptors,host-bootstrap}.ts`, `packages/h2a/src/runtime/handover/{shim-bridge,catalogue}.js` | 1. Each of the 8 hosts (`claude`, `codex`, `gemini`, `agy`, `hermes`, `opencode`, `muse`, `vibe`) switches independently via `enabledHosts` over one shared 7-tool `mcp-central` generation without `409 integrity_mismatch` or regressing PR #455 `rebootstrapMissingPluginLock`.<br>2. Expired `switchoverEndDateUtc` with unswitched active host fails `h2a doctor` closed. | `node --test packages/h2a/test/context-tool-host-switchover.test.js` |

---

## 8. Open Questions

None of the items below reopen `D1`–`D34` (`spec/memory/R15-SEDIMENT.md`) or `Points 1B–6A` (`spec/memory/OWNER-DECISIONS-2026-11-14.md`). They capture operational calibration parameters to pin before Gate 2 (`CoSignatureReceiptV2`) sign-off:

1. **`OQ-S2-1` — Initial `switchoverEndDateUtc` Calendar Value & Host Ordering in `BridgeLock` (`Point 2B`, `Spec 6A OQ-H2A-1`):**
   `Point 2B` mandates a fixed switchover end date carried in the signed `BridgeLock` configuration (`ContextToolHostSwitchoverPolicy.switchoverEndDateUtc`). What exact UTC deadline and staged order across the 8 CLI hosts (`claude`, `codex`, `gemini`, `agy`, `hermes`, `opencode`, `muse`, `vibe`) do the `h2a` and `engram` conductors pin for the first `v2` rollout lock?
2. **`OQ-S2-2` — Per-Slice Non-Blocking Readiness Deadline (`D15`):**
   Under `D15=slices`, each ready slice injects immediately without waiting for the whole model. Should the per-step `h2a` hook readiness budget before marking an uncached slice `'pending_criteria'` default to `150 ms` locally (`embedded-local`) and `400 ms` over `external-host`, within the hard `30_000 ms` `MAX_INVOCATION_DEADLINE_MS` (`src/mcp/memory/contracts.ts:297`)?
3. **`OQ-S2-3` — `D7` Fast Reranker Latency Budget Inside `assembleContext`:**
   When `D7` model-assisted sensitivity-triaged reranking (`@sentropic/llm-mesh/decision`) is authorized, what soft timeout (recommended: `250 ms` out of the step budget, falling back non-fatally to Stage 1 `deterministic_attention_v1`) should `MemoryContextPortV1` enforce so durationless prompt assembly remains sub-second on interactive CLI turns?
4. **`OQ-S2-4` — Canonical Signed File Path for `RecordedNonMemorySlicePolicyV1` (`D18`):**
   Should the recorded read-only slice policy for sessions without a memory identity (`D18=readonly`) live inside the Git-committed `.h2a/` workspace harness overlay (`Spec 4`, `D31`) or inside `BridgeLock` host configuration (`Spec 6A`), or require agreement of both when both are present?
5. **`OQ-S2-5` — Coordinated Application Order for `SPEC_MEMORY_FINALIZATION.md` `§0–§2` (`Spec 2` + `Spec 3`):**
   Both Spec 2 (`PLAN_SPEC_ENGRAM_FRONT.md:186`) and Spec 3 (`:198`) register additive deltas to `spec/SPEC_MEMORY_FINALIZATION.md` `§0–§2`. Should those two deltas be applied together in a single mechanical documentation fold lot after Spec 3 completes adversarial review (`D2=review`)?
