# SPEC — Engram Dormant Dreaming Synthesis (`Spec 3`)

- **Spec ID:** `SPEC-ENGRAM-DORMANT-DREAMING-SYNTHESIS` (`Spec 3` in [`spec/memory/PLAN_SPEC_ENGRAM_FRONT.md`](memory/PLAN_SPEC_ENGRAM_FRONT.md) `:188-204`)
- **Version:** `0.2.0` (`2026-11-15` — post-`sentropic` `@sentropic/cluster-mesh` OWNER review fold; `h2a` review pending)
- **Stage:** `DESIGN` (Gemini Carbon)
- **Status:** `proposed` — design specification only; authorizes no merge, push, tag, publication, migration, or runtime cutover.
- **Date:** `2026-11-15`
- **Repository of Record:** `engram` (`spec/SPEC_ENGRAM_DORMANT_DREAMING_SYNTHESIS.md`)
- **Dependencies:**
  - [`spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md`](SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md) (`Spec 0` — metamodel primitives, lineages `'engram'`, `'track'`, `'h2a'`, and `promotion-third-party-review` `:944`)
  - [`spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md`](SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md) (`Spec 6A` — `R12` `@sentropic/cluster-mesh` hop, `Point 6A` non-overwrite guard `§5.3 :683-716`, `6A-S0b` durable SQLite `'scope-outbox-v1'` + `'fenced-writers-v1'`, `6A-S1a` `memory-binding-v2` manifest, neutral `session-db`, exclusive `@sentropic/llm-mesh` routing `§2.5`)
  - [`spec/SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md`](SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md) (`Spec 1` — `RawSessionEventPayload` `kind: 'context_saturation'`, `session_summary` compaction, `D7`/`D8`/`D9`/`D10`/`D33` privacy gates, `Lots 1-E2/1-E3` `src/llm-json-port.ts` provider-SDK & `*_API_KEY` isolation)
  - [`spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md`](SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md) (`Spec 2` — `engram_memory_context` seventh MCP tool, closed 5-literal `mission_focus_context.dreaming_recalled_facts[].trigger` `:508`, `D23` attention boost `:770`, `D6=refs` field-level scrubbing, coordinated `SPEC_MEMORY_FINALIZATION.md` delta `Lot 2-E5`)
  - **`sentropic` Companion Mesh Capabilities (`chat-mesh` & `WD-2`):**
    - `sentropic:spec/SPEC_EVOL_CHAT_MESH_PROPOSAL.md` (working-tree draft in `sentropic`, not yet on `origin/main` `913e3bcbc`: `Lots B1/B2` neutral `session-db` `:277-285,622-623`, and `Lot C2a` moving `RouteMeteringSink` into `@sentropic/llm-mesh` `:370-388,629`);
    - `sentropic:spec/SPEC_EVOL_WASM_DEPLOYMENT.md` (working-tree draft in `sentropic`, not yet on `origin/main` `913e3bcbc`: **owner decision `W-D5 B`, relayed by `sentropic`**, `:44` *"Scheduling itself is a mesh capability, accessible to browser and remote agents"*, realized by `Lot WD-2` mesh-native scheduler `:66,85-91,277,360,383` and aligned with `SPEC_EVOL_CHAT_MESH_PROPOSAL.md:152,635`).
  - **Explicit `Spec 6B` Dependency (planned in [`spec/memory/PLAN_SPEC_ENGRAM_FRONT.md`](memory/PLAN_SPEC_ENGRAM_FRONT.md) `:226-237`; specification file currently `unknown` / unshipped in `spec/` at `2856a6cc` / `fc0437b2`):** All **remote** dreaming passes (`weekly`, `monthly`, `cross-repository` master-harness audit, and `late-sync-amendment`, `Point 3C`) depend strictly on `Spec 6B` integral DB-cluster graph sync (`D24=integral`) committing a kernel-verified sync barrier in `PostgresKernel`. While `Spec 6B` is absent on `external-host`, remote dreaming triggers fail closed (`HTTP 503` / `MISSING_GRAPH_SYNC_BARRIER`) with zero scheduler submissions, zero `@sentropic/llm-mesh` calls, and zero writes (§1.2, §3.4). **Local** dreaming passes (`nightly`, `mid-day`, `context-saturation`) have **zero** runtime dependency on `Spec 6B` and execute locally over fenced `engram-memory` SQLite + neutral `session-db` (`D10=mandate`, `D17=degraded`).
- **Binding Authorities:**
  - [`spec/memory/OWNER-DECISIONS-2026-11-14.md`](memory/OWNER-DECISIONS-2026-11-14.md) (`T-M-C`, `Point 3C`, `Point 4B`, `Point 5B`, `Point 6A`)
  - Owner decision **`W-D5 B` (relayed by `sentropic`**, `sentropic:spec/SPEC_EVOL_WASM_DEPLOYMENT.md:44`): scheduling is a `@sentropic/cluster-mesh` mesh-native capability (`WD-2`), never an application cron loop in `api/`
  - [`spec/memory/R15-SEDIMENT.md`](memory/R15-SEDIMENT.md) (`D1`, `D2`, `D6`–`D11`, `D17`–`D19`, `D21`, `D23`–`D27`, `D31`, `D33`; settled `D1`–`D34` never reopened)
  - [`spec/memory/DESIGN-NOTE-CODE-GROUNDING.md`](memory/DESIGN-NOTE-CODE-GROUNDING.md) (every code claim verified at a named commit SHA or explicitly marked **`new`** / **`PROPOSED`**)
  - [`spec/memory/DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md`](memory/DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md) (zero view/board/canvas specification in Spec 3)
  - Cross-repo boundary contracts: [`spec/memory/contracts/engram-track.md`](memory/contracts/engram-track.md), [`spec/memory/contracts/engram-h2a.md`](memory/contracts/engram-h2a.md), [`spec/memory/contracts/engram-cluster-mesh.md`](memory/contracts/engram-cluster-mesh.md)
- **Amends (exact `Before → After` deltas in §6; target files untouched on disk in this lot):**
  - [`spec/SPEC_MEMORY_FINALIZATION.md`](SPEC_MEMORY_FINALIZATION.md) (`§0–§2`, lines `1–60`, rebased incrementally after `Spec 2 §6.2` `Lot 2-E5` per `OQ-S2-5` and `S3-C-08`)
  - [`plan/08-BRANCH_MEMORY_FINALIZATION.md`](../plan/08-BRANCH_MEMORY_FINALIZATION.md) (lines `198–222`)
  - Coordinated route-table mirror into [`spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md`](SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md) (`§2.2`) and [`spec/memory/contracts/engram-cluster-mesh.md`](memory/contracts/engram-cluster-mesh.md) executed in `Lot 3-E5` (§3.4, §7.1)
- **Evidence Baseline Verified (`DESIGN-NOTE-CODE-GROUNDING.md`):**
  - `engram` branch `docs/memory-r15-sediment` at `fc0437b20e974f6a1e4424e7def20deb9857c16a` (Spec 3 initial commit `2856a6ccf0922806bad675fbaa76c59e8a37c317`, base parent `f0c2928e600c41f7804cf4e3b84e27688150bb1d`; `origin/main` `f75543a5c8b220a741924e8eeac6610e3808c8ce`, `@sentropic/engram@0.28.0` at `package.json:2-3`):
    - *Exists today:*
      - `engram-memory/contracts/index.ts:41-54,72-99,419-443,1342-1389` (`DerivationLineageV1`, `RetentionV1`, `ReconciliationConsentV1`, `TrustBindingV1`, `MemoryRecordV2`, `MemoryOperation` including `'propose_capitalisation'` and `'propose_reconciliation'`, `MemoryState`, `CapitalisationRequestV1`, `MemoryPortV2`, `MemoryEngineDependenciesV2` with injected `ClockPort`);
      - `engram-memory/assertion-family-registry.ts:66,267-365` (`reconciliationProposalIdV1`, `createAssertionFamilyRegistryV1` read-only L5 assertion reconciliation);
      - `engram-memory/recall.ts:34,38,44,163,173,209-214` (`HALF_LIFE_MS = 2_592_000_000` 30-day recency half-life, `RRF_K = 60`, `PPR_ALPHA = 0.85`);
      - `engram-memory/module-storage-neutral.ts:42` (`'scope-outbox-v1'` neutral outbox storage profile);
      - `engram-memory/bounded-projection.ts:22-86` (`52_428_800` B `.graphify/graph.json` ceiling over `accepted_current` + `projection_eligible === true` envelopes only);
      - `engram-live/scheduler.ts:3-14,53-64,86-337` (`Scheduler`, `WorkPriority = 'interactive' | 'backfill'`, 3:1 `interactiveQuantum` / `backfillQuantum` `:117,173`, `backfillReserveBytes` `:35,141-145`, `ScopeFencingTokenDto` validation `:56,133,238`, injected `ports.clock` `:54`, durable `readProgress`/`writeProgress`/`park` `:58-63`);
      - `engram-live/retention.ts:64-229` (`RetentionPort`, `deriveRetentionRequests`, `runRetentionPass` with injected `now: number` `:74,101-105` and immutable pass-entry scope snapshot `:170-175`);
      - `src/mcp/memory/schemas.ts:3657-3789` (`validateMemoryToolSchemaDialectV1`, closed Draft 2020-12 objects, zero `$defs`/`$ref`);
      - `package.json:146-161` (`@ai-sdk/anthropic`, `@ai-sdk/cohere`, `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/openai`, `ai`, `mistral-ocr` still in `dependencies` today) and `src/llm-execution.ts:12,246-281,337-366,497` (`DIRECT_LLM_PROVIDERS`, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `MISTRAL_API_KEY` / `COHERE_API_KEY` env reads, imported by `src/llm-mesh.ts:12` and `src/extraction-batch.ts:74-78`) — isolated from `@sentropic/engram` library subpaths by **prerequisite `Spec 1` Lots `1-E2` and `1-E3`** (`Spec 1 :574-584, 1664-1665`) and mechanically forbidden in all Spec 3 dreaming modules (`§5.1`, `§7.1`).
    - *Does NOT exist yet (`new` / `PROPOSED`, verified via `rg -n "dream|dormant|lesson|scheduler|cron" engram-memory src` — zero dreaming, shadow-lesson, or memory-consolidation scheduler implementation exists in `engram-memory/` or `src/` today):*
      - `engram-memory/dreaming-contracts.ts` (`new`, Lot `3-E1`), `engram-memory/dreaming-triggers.ts` (`new`, Lot `3-E1`), `engram-memory/dreaming-shadow.ts` (`new`, Lot `3-E2`), `engram-memory/dreaming-promotion.ts` (`new`, Lot `3-E3`), `src/dreaming/promotion-contracts.ts` (`new`, Lot `3-E3`), `src/dreaming/index.ts` (`new`, Lot `3-E3`), `src/dreaming/harness-audit.ts` (`new`, Lot `3-E4`).
  - `sentropic` `origin/main` `913e3bcbc9dec9ff5f9db36eb3a1ef5a3dd11b7a` (`packages/llm-mesh/package.json:3` `0.38.0`; `packages/cluster-mesh/package.json:3` `0.26.0-dev.27`, latest published `0.25.0` in `packages/cluster-mesh/tests/storage/pack-only-dev-gate.mjs:13`, qualification pin `INSTALLED_MESH_VERSION ?= 0.24.0` in `packages/cluster-mesh/tests/engram-memory/qualification.mk:37`):
    - *Exists today on `origin/main`:*
      - `packages/llm-mesh/src/mesh.ts:49-54,131,157-160` (`LlmMesh`: `listProviders`, `listModels`, `generate`, `stream`; `createLlmMesh` — zero `RouteMeteringSink` and zero `maxCostMicroUsd` on `LlmMesh.generate`);
      - `packages/llm-mesh/src/routing-contracts.ts:13,19-37,54-126,156-193,206-214,249-288` (`VerifiedRoutingSubject` `:13`, `EligibleAccountDescriptor` `:19-37`, `RoutePlanInput` `:54-77`, `RouteUsageCeiling` `:80-91` token/unit counts only, `RouteQuote` `:93-126`, `RouteModelInventoryEntry` `:156-160`, `RouteOutcomeReason` & `RouteFailureClassification` with `retryAfterMs` and `committed` `:161-193`, internal `AccountDirectoryPort.listEligible` `:206-214`, and `RoutePlanner` `:249-288` exposing `listModels?(subject)` `:251-253`, `plan` `:254`, and `quote?(input)` `:256`);
      - `packages/llm-mesh/src/providers.ts:7,43-47,63-64,129-135` and `packages/llm-mesh/src/catalog.ts:152,202` (`ProviderFamily` `:7`; `gcp` has `family: 'google'` at `catalog.ts:202` while serving `'anthropic/claude-sonnet-4-6@gcp'` at `providers.ts:63-64`; `mistral` serves `'zai-glm-5-3'` at `:43-47`; `antigravityModelFleet` mixes Claude, Gemini, and GPT at `:129-135`);
      - `packages/llm-mesh/src/decision/index.ts:1-16`, `decision/receipt.ts:17-24,65-81` (`DecisionCost`, `DecisionClient.decide`, `DecisionConnectionFailure`, `RemoteDecisionClient`), `decision/client.ts:358-515` (`retryAfterMs` preserved at `:448`), `decision/request.ts:40-75` (closed 8-key `DecisionRequest`), `decision/request-policy.ts:3-10` (per-call `DecisionRequest.policy.budget.maxCostMicroUsd`, `timeoutMs`, `explanation`);
      - `packages/llm-gateway/src/route-flow-core.ts:49-51` (`RouteMeteringSink`, currently in `@sentropic/llm-gateway` only) and `packages/llm-gateway/src/ports/budget.ts:1-40` (`BudgetAdmissionPort`; `:5` *"the gateway never reads pricing and mesh never reads budgets"*);
      - `packages/cluster-mesh/src/modules/catalog.ts:18-19` (`ENGRAM_MEMORY_RANGE`, `LLM_MESH_RANGE = '0.19.2 || >=0.22.0 <0.39.0'`, matching `packages/cluster-mesh/package.json:269,271`), `src/modules/topology-guard-llm-mesh.ts:1-5` (loads `@sentropic/llm-mesh` without `@sentropic/llm-gateway`), `src/integrations/llm-mesh/decision.ts:1-3`, and `src/compose/llm-mesh.ts:31-43` (`createLlmMeshNamespaceModule`);
      - `packages/cluster-mesh/src/engram-memory/neutral-contract.ts:181-199,271-275` (`NeutralModuleTransaction.findIdempotency`, single-`{ tenantId, workspaceId }` `MemoryScopeBindingV1`), `manifest.ts:19-28,58-144,215-230` (`MEMORY_REQUIRED_PROFILES` `:26` `'scope-outbox-v1'`, `MEMORY_QUERY_NAMES`, `MEMORY_RECORD_KINDS`, `MEMORY_AGGREGATE_KINDS`, `MEMORY_KEY_FORMATS` `:138` `'["memory-outbox-v1","<through_cursor_inclusive>","<batch_digest>"]'`, `MEMORY_CONTRACT_DIGEST`), `projection.ts:13-17,50-83,100-104` (`pgScopeKey`, `validateMemoryPgEffects`, `StorageInvalidCommandError` on unknown keys), `sqlite-queries.ts:17-18`, `postgres-queries.ts:15-16,80-119`;
      - `packages/cluster-mesh/src/storage/postgres/profiles.ts:11-12,50-58` (durable Postgres `'scope-outbox-v1'`), `packages/cluster-mesh/src/storage/sqlite/index.ts:38,60-63,75-83,160-187` (`SqliteKernel`, where `LOT1_DURABLE_PROFILES` excludes `'scope-outbox-v1'` and `'fenced-writers-v1'` until `Spec 6A` Lot `6A-S0b`; note `src/storage/root-profiles.ts:15-16` is the in-memory `RootScopedRuntime`, not SQLite/Postgres persistence), `packages/cluster-mesh/src/sessions/content-policy.ts:89-148` (`ContentPolicyV1`, `computeRetentionDeadline`);
      - `api/src/routes/namespaces/memory.ts:10-75` (`MEMORY_PATHS`), `api/src/services/mcp/client-policy.ts:3-50` (`DEC-116`: `SENTROPIC_MCP_CLIENT_ID = 'sentropic-mcp'` governing MCP `READ_ONLY_TOOL_ALLOWLIST` / `READ_ONLY_CONNECTOR_CAPABILITIES` only, not HTTP `/api/v1/memory/*`);
      - `Makefile:1261` (`typecheck-api`), `:1265` (`typecheck-llm-mesh`), `:1269-1289` (`lint-cluster-mesh`, `CLUSTER_MESH_PEER_TOOLS` `:1282`, `typecheck-cluster-mesh`, `test-cluster-mesh`, `build-cluster-mesh`), `:1318` (`qualify-published-install` `PEERS`), `:1422` (`pack-cluster-mesh`), `:2460,2464` (`scope-check`), `:2887` (`test-llm-mesh`), `:3010,4067` (`test-api`, `test-api-%`), `:3284` (`up-api-test`), `:4986-5051` (`memory-l5-lint`, `memory-l5-pack` `:5023-5028`), `packages/cluster-mesh/tests/storage/cold-workspace.sh:121,131-132,152-162`, `packages/cluster-mesh/tests/engram-memory/mcp-host.ts:17`, and `packages/cluster-mesh/tests/storage/postgres.mk:33-54` (`cluster-mesh-pg-test`, `cluster-mesh-pg-down`).
    - *Does NOT exist yet (`new`):*
      - Upstream `sentropic` prerequisites: `6A-S0b` (durable SQLite `'scope-outbox-v1'` + `'fenced-writers-v1'`), `6A-S1a` (`memory-binding-v2`), `6A-S1b..d` (`packages/cluster-mesh/src/compose/memory.ts`), `2-S1a`/`2-S1b` (`ModelContentAuthorizationPolicyV1`), `chat-mesh Lots B1/B2` (`session-db`), `chat-mesh Lot C2a` (moving `RouteMeteringSink` into `@sentropic/llm-mesh`), and `Lot WD-2` (`packages/cluster-mesh/src/deployment/scheduler.ts` mesh-native scheduler per `W-D5 B`, relayed by `sentropic`);
      - Spec 3 `sentropic` deliverables: `packages/cluster-mesh/src/engram-memory/dreaming-local.ts` (`new`, Lot `3-S1a`), `packages/cluster-mesh/src/integrations/llm-mesh/memory-dreaming-llm.ts` (`new`, Lot `3-S1b`), `/memory/v1/dreaming/*` & `POST /memory/v1/control/proposals` Hono handlers in `packages/cluster-mesh/src/compose/memory.ts` (`new`, Lot `3-S1c`), `packages/cluster-mesh/src/engram-memory/dreaming-remote.ts` (`new`, Lots `3-S2a` & `3-S2b`, gated on `Spec 6B` and `WD-2` — **zero** cron service in `api/`), and `MEMORY_PATHS` + HTTP `'sentropic-mcp'` `403` guard in `api/src/routes/namespaces/memory.ts` (`Lot 3-S3`).
  - `h2a` `origin/main` `1f57127dee0bf671e559c347cd86960180cd64c9` (`HEAD` `229573e3ab8f0bd0430892966f4c8659ee4aece2`, `@sentropic/track@0.91.0`):
    - *Exists today:*
      - `packages/h2a/src/runtime/drumbeat/watch.ts:88` (`drumbeatTick`), `packages/h2a/src/runtime/drumbeat/index.ts:32`, `packages/h2a/src/hosts/plugin.ts`, `packages/h2a/src/runtime/memory/{admit-client.ts,promote-client.ts,recall-client.ts}`;
      - `packages/track/package.json:55-58` (`dependencies: { "@modelcontextprotocol/sdk": "^1.30.0", "ulid": "^3.0.2" }` — zero `@sentropic/engram` or `@sentropic/cluster-mesh` dependency);
      - `packages/track/src/model/spec-amend.ts:24-40` (`SpecAmendPayload` with `proposalRef` preserving machine-proposal provenance alongside human acceptance);
      - `scripts/test-inventory.json:1-25` (explicit test file registry).
    - *Does NOT exist yet (`new`):*
      - `packages/h2a/src/runtime/memory/dreaming-trigger-client.ts` (`new`, Lot `3-H1`), `packages/track/src/ingest/dreaming-requests.ts` (`new`, Lot `3-H2`), `packages/h2a/src/runtime/governance/master-harness-audit-intake.ts` (`new`, Lot `3-H3`, gated on `Spec 6B`).

---

## 0. Binding Governance, Settled Verbatims, and Architectural Boundaries

### 0.1 Binding Owner Verbatims & Settled Decisions (Never Reopened)

Every clause in this specification implements—and never reopens—the owner decisions fixed in [`spec/memory/OWNER-DECISIONS-2026-11-14.md`](memory/OWNER-DECISIONS-2026-11-14.md) and [`spec/memory/R15-SEDIMENT.md`](memory/R15-SEDIMENT.md):

1. **`T-M-C` — Templates (`Track`), Metamodel (`engram`), Control (`Track`) ([`OWNER-DECISIONS-2026-11-14.md:6-7,9-15`](memory/OWNER-DECISIONS-2026-11-14.md)):**
   > « Les question sont pas assez detaillees. Pose les ici. On est en train de faire des modif coté track sjr les ontologies de son domaine, il fdoit en rester maitre au moins piur les templates et engram pour leur metamodel et application track pour leur controle. Mene un tour avec h2a rapide en fable 5.2 + carbon et repose les 6 quesfion a l issi »
   >
   > « Tout comme recommandé »
2. **`Point 3C` — Local vs Remote Dreaming Placement & `Track` Template / Control Authority ([`OWNER-DECISIONS-2026-11-14.md:23`](memory/OWNER-DECISIONS-2026-11-14.md), [`PLAN_SPEC_ENGRAM_FRONT.md:242`](memory/PLAN_SPEC_ENGRAM_FRONT.md)):**
   - Nightly, mid-day, and context-saturation passes run **locally** (`embedded-local`, keeping `D10` context logs and context summaries on the local workstation unless the `h2a` mandate's transfer policy within the owner's per-repository policy permits transfer).
   - Weekly, monthly, and cross-repository master-harness audit passes run **remotely** (`external-host`) **after graph sync** (`Spec 6B` dependency).
   - Any dreamed proposal touching a `Track` template is a **request to `Track`**, which alone accepts it (or to `engram` if it requires a new metamodel construct).
   - Any typed write dreaming proposes in the `Track` domain passes **`Track` control** (`verdictAuthority: 'track'`) on top of `D1=borne-review`.
3. **`D19` — Contextual Graph Replacement & Dormant Session Resynthesis ([`R15-SEDIMENT.md:64`](memory/R15-SEDIMENT.md)):**
   > « Ca manque serieusement de profondeur. J ai demande que l un graph contextuel remplace le contexte. Et qu on ai un processus dormant (dreaning agent) de resynthese de session sur une periode (daily, mi journee, a saturation du contexte) »
4. **`D21` — Typed Domain Modelling Expectation ([`R15-SEDIMENT.md:66`](memory/R15-SEDIMENT.md), forbidden product name masked as requested):**
   > « J ai demande un [nom retiré à ta demande] like et c est cette merde que j ai les donmees sont pas modelisees »
5. **`D23` — Forgotten Permanent Facts Recalled Over Short-Term Decay & Durationless Prompt Independence ([`R15-SEDIMENT.md:68`](memory/R15-SEDIMENT.md)):**
   > « La memoire graphe devrait remplacer le conexte en une forme de resumé a chaque etape c etait ma demande. Le mode dreaming veenant rappelera des choses permanentes oubliees sur le court terme. Il ne doit jamais y avkir de relve ou bie chaque prompt devrai etee independant ne dependre que de la memoire et du resultat precedeent reprocessé. L idee eat d etre idependant et sans duree. Mais tu semble avoir effacé cet objectif. Ce faisant tu perennise de mauvais patterns de memoire lineraire. La memoire fonctionne par de l attention […] »
6. **`D25` — Default Consolidation Cadences (`nightly`, `weekly`, `monthly`, replacing `weekly-milestones`; [`R15-SEDIMENT.md:70`](memory/R15-SEDIMENT.md)):**
   > « J avais demandé daily. Donc jendirais comme j avais demande nighly weekly monthly par defaut. »
7. **`D26` (`two-tier-shadow`) — Two-Tier Shadow Lesson Drafting & Measured Threshold ([`R15-SEDIMENT.md:71`](memory/R15-SEDIMENT.md)):**
   > *"Dreaming may later have lessons drafted by a language model, in shadow. One model drafts, an independent verifier checks, and nothing is shown to the owner before the measured threshold"*.
8. **Cross-Repository Master Harness Audit vs Local Repository Overlay ([`R15-SEDIMENT.md:35`](memory/R15-SEDIMENT.md), `comments-2026-11-08.md:24`, `Point 4B`, `D31`):**
   > « typiquement le harnais h2a devrait être revue a l'oree d'une audition multi repo (dreaming agent) la ou l'évolution du harnais devrait être pour le repo lui meme »
9. **Promotion, Spec Review, & Privacy Invariants ([`R15-SEDIMENT.md:46-56,62,76,78`](memory/R15-SEDIMENT.md)):**
   - **`D1` (`borne-review`):** Typed writes on `Track`'s bounded list pass `Track` control without human review during in-mandate execution, whereas **every promotion draft (including dreaming promotions, `Spec 0 :944` `promotion-third-party-review`) waits for an authorized third party and is never applied by its author**.
   - **`D2` (`review`):** Even a purely mechanical spec amendment waits for review.
   - **`D6` (`refs`):** Without content authorization, only a path and its fingerprint may be sent to the external model; **dreaming summaries, caches, and logs follow the same rule**.
   - **`D7` / `D8` / `D9` / `D10` / `D17` / `D33`:** Confidentiality deny-list screening (`D7`), PII armor (`D8`), cross-project study ceiling (`30` projects, `6` months / `183` days, read-only corpus `D9`), local-by-default context summaries (`D10=mandate`), visible fenced local continuation (`D17=degraded`), and HMAC pseudonymization (`D33`).

### 0.2 View-Projection, Transport, and Mesh-Native Scheduling Boundaries (`DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md`, `R12`, `Point 6A`, `W-D5 B`)

- **Zero View Specification:** Per [`spec/memory/DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md`](memory/DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md), Spec 3 defines **zero** graphical views, canvases, dashboards, or board layouts. Dreaming writes only canonical memory journal records (`engram-memory`), recall-boost index rows consumed by `engram_memory_context` (`Spec 2`), neutral outbox/control proposals, and JCS-digested calibration/audit receipts. Projections for `Track`, `Focus`, and `Studio` belong exclusively to `Spec 5`.
- **Single Mesh Transport (`R12`) & `Point 6A` Non-Overwrite Guard:** All cross-process traffic between `h2a` / `Track` and `engram` transits `@sentropic/cluster-mesh` (`Spec 6A`). Pure `engram` modules return immutable value DTOs; only the `@sentropic/cluster-mesh` storage host opens a kernel transaction, and **every** dreaming write, reconciliation, supersession, or amendment transaction mechanically enforces `Point 6A` (`record.trackControlled !== true`, `Spec 6A §5.3 :683-716`) — dreaming **never** overwrites, mutates, or directly supersedes a `Track`-controlled record. Dreaming introduces zero sidecar SQLite databases outside `SqliteKernel` / fenced `engram-memory`, zero `~/.h2a/` JSONL queues, and zero direct provider SDK calls outside `@sentropic/llm-mesh`.
- **Mesh-Native Remote Scheduling (`W-D5 B`, relayed by `sentropic`):** Per owner decision **`W-D5 B` (relayed by `sentropic`**, `sentropic:spec/SPEC_EVOL_WASM_DEPLOYMENT.md:44`: *"Scheduling itself is a mesh capability, accessible to browser and remote agents"*), all remote dreaming schedules (`weekly`, `monthly`, `cross-repository`, and `late-sync-amendment`) are driven **exclusively by `@sentropic/cluster-mesh`'s mesh-native scheduler (`Lot WD-2`**, `SPEC_EVOL_WASM_DEPLOYMENT.md:66,85-91,277,360,383`, aligned with `SPEC_EVOL_CHAT_MESH_PROPOSAL.md:152,635` `execution: { kind: 'mesh-scheduler' }`) inside `packages/cluster-mesh/src/engram-memory/dreaming-remote.ts`. **An application cron loop or schedule-dispatch service in `api/` is strictly forbidden.**

---

## 1. The Dormant Dreaming Process: Placement, Triggers, Mesh Scheduling, Catch-Up, and Idempotency (`D19`, `D25`, `Point 3C`, `Point 6A`, `W-D5 B`)

### 1.1 Two-Plane Placement Architecture, Kernel-Verified Sync Barriers, & `Point 6A` Guard (`Point 3C`, `Point 6A`, `D10=mandate`, `D17=degraded`)

Per `Point 3C` ([`OWNER-DECISIONS-2026-11-14.md:23`](memory/OWNER-DECISIONS-2026-11-14.md)), the dormant dreaming agent is partitioned across two strictly separated execution planes sharing the same pure L0-neutral domain logic in `engram-memory`:

| Pass / Trigger (`DreamingTriggerKindV1`) | Execution Plane & Scheduler (`Point 3C`, `W-D5 B` relayed by `sentropic`) | `Spec 6B` Graph Sync Dependency | Primary Input Scope & `D10` Locality | Primary Outputs (All Subject to Mechanical `Point 6A` Non-Overwrite Guard) |
|---|---|---|---|---|
| **`nightly`** *(owner's « daily », `D19`, `D25`)* | **`embedded-local`** (workstation `cluster-mesh` over fenced SQLite + `session-db`; triggered via `h2a drumbeatTick` / `SessionStart`, zero extra daemon in `cluster-mesh`) | **None** (runs 100% locally; `D17=degraded` safe) | Trailing local day's `session_turn`, `session_summary`, `tool_result`, and local `MemoryRecordV2` delta (`D10` stays local) | Forgotten permanent fact boosts (`D23`), L5 `proposeReconciliation` candidates (`trackControlled: false` proposals only), `D26` shadow drafts/verifications, `Track` proposals (`D1` + `Track` control) |
| **`mid-day`** *(`D19` « mi journee »)* | **`embedded-local`** (opportunistic on existing `drumbeatTick` / `session-front` ingress; zero polling loop in `cluster-mesh`, `OQ-S3-3`) | **None** | Half-day local session delta + `session_summary` compactions (`D10` stays local) | Intra-day forgotten permanent fact boosts (`D23`), unresolved `error`/`security-gate` consolidation, `D26` shadow drafts |
| **`context-saturation`** *(`D19` « a saturation du contexte »)* | **`embedded-local`** (event-driven on Spec 1 `context_saturation`) | **None** | Saturated session up to `throughOrdinal` + `session_summary` (`Spec 1 :295-299`) | Immediate pre-next-step permanent-fact recall boost (`D23`) & unresolved-blocker synthesis replacing linear rollover |
| **`weekly`** *(`D25`)* | **`external-host`** (`cluster-mesh` Postgres 16/17 + **`WD-2` mesh-native scheduler**, `W-D5 B` relayed by `sentropic`) | **`[DEPENDS ON SPEC 6B]`** (kernel-stored `GraphSyncBarrierReceiptV1` required) | Synced `(tenantId, workspaceId)` multi-branch/multi-worktree canonical graph (excludes untransferred `D10` local logs) | Cross-worktree permanent fact boosts (`D23`), multi-day contradiction reconciliation (`Point 6A` guarded), `D26` shadow calibration & post-threshold promotions |
| **`monthly`** *(`D25`)* | **`external-host`** (`cluster-mesh` Postgres 16/17 + **`WD-2` mesh-native scheduler**, `W-D5 B` relayed by `sentropic`) | **`[DEPENDS ON SPEC 6B]`** (kernel-stored `GraphSyncBarrierReceiptV1` required) | Prior calendar month's synced `(tenantId, workspaceId)` canonical graph + `D26` rolling ledger | Long-horizon forgotten architectural invariants (`D23`), `TrackTemplateEvolutionRequestV1` (`Point 3C`), `spec/` review drafts (`D2`), `D26` threshold audit |
| **`cross-repository`** *(`comments-2026-11-08.md:24`, `Point 3C`)* | **`external-host`** (`cluster-mesh` Postgres 16/17 + **`WD-2` mesh-native scheduler**, `W-D5 B` relayed by `sentropic`) | **`[DEPENDS ON SPEC 6B]`** (kernel-stored `GraphSyncBarrierReceiptV1` per cohort workspace) | Read-only `D9`-bounded (`<= 30` repos, `<= 183` days), strictly intra-tenant, `D7`/`D8`/`D33`/`D6`-armored multi-repo harness telemetry | `MasterHarnessAuditProposalV1` to `h2a` (`D2=review`, `Point 4B`); single-repo patterns kept local (`D31`) |

> **Wire Literal Parity With `Spec 2` (`Spec 2 §2.2 :508`, `S3-C-08`):** The five workspace-level recall triggers (`'nightly' | 'weekly' | 'monthly' | 'mid-day' | 'context-saturation'`) match `EngramMemoryContextPackV1.mission_focus_context.dreaming_recalled_facts[].trigger` byte-for-byte. `'late-sync-amendment'` projects deterministically onto `'weekly' | 'monthly'` via `DreamingRecallBoostIndexRowV1.projectedContextTrigger` (§3.1), and `'cross-repository'` targets `sentropic.h2a-harness-and-skills` (§4) — emitting **zero** workspace `DreamingRecallBoostIndexRowV1` rows and never injecting cross-workspace records into a single repository's `dreaming_recalled_facts`.

**Normative Plane, Sync-Barrier Authenticity, & `Point 6A` Invariants:**

1. **Kernel-Authenticated `GraphSyncBarrierReceiptV1` — Zero Caller-Supplied Barrier Payloads (`S3-C-03`):**
   - No HTTP route under `/memory/v1/dreaming/*` (§3.4) ever accepts `GraphSyncBarrierReceiptV1` from an external HTTP request body or caller claim (preventing forged `through_cursor` values over partially replicated graphs).
   - Instead, `packages/cluster-mesh/src/engram-memory/dreaming-remote.ts` reads the durable `Spec 6B` sync-barrier aggregate **directly from `PostgresKernel`** inside each target `(tenantId, workspaceId)` bound scope (`NeutralBoundScope`) and binds its kernel transaction digest and fencing epoch before evaluating any remote trigger.
   - **Fail-Closed Fallback While `Spec 6B` Is Unshipped (`503 MISSING_GRAPH_SYNC_BARRIER`):** Until `Spec 6B` registers its sync-barrier aggregate on `external-host`, every remote pass invocation (`weekly`, `monthly`, `cross-repository`, `late-sync-amendment`) fails closed with HTTP `503 Service Unavailable` and typed diagnostic `DreamingPreconditionRefusal('MISSING_GRAPH_SYNC_BARRIER')` — submitting **zero** `WD-2` scheduler intents, making **zero** `@sentropic/llm-mesh` calls, and committing **zero** writes.
2. **Mechanical `Point 6A` Non-Overwrite Invariant Across Every Dreaming Write & Amendment (`S3-C-04`):**
   - Per `Point 6A` ([`OWNER-DECISIONS-2026-11-14.md:26`](memory/OWNER-DECISIONS-2026-11-14.md), `Spec 6A §5.3 :683-716`, [`engram-cluster-mesh.md:90,125,169`](memory/contracts/engram-cluster-mesh.md)), both `dreaming-local.ts` (`SqliteKernel`) and `dreaming-remote.ts` (`PostgresKernel`), backed at storage-commit time by `validateMemoryPgEffects` (`packages/cluster-mesh/src/engram-memory/projection.ts:50-83`) and the equivalent SQLite validator, verify `incumbent.trackControlled !== true` on every target record before any write, reconciliation, supersession, or amendment commits.
   - Dreaming **never** overwrites, updates, tombstones, or emits a direct `LifecycleEventV2` superseding any record carrying `trackControlled: true` (`verdictAuthority: 'track'`). Any attempted direct mutation or supersession of a `trackControlled: true` record aborts with `Refusal('TRACK_CONTROLLED_IMMUTABLE')`.
   - Whenever a `Track`-controlled record is implicated in a contradiction, `proposeReconciliation` candidate, or `late-sync-amendment`, dreaming stages **only** a separate non-authoritative proposal (`reviewStatus: 'proposed'`, `verdictAuthority: 'track'`, `trackControlled: false`) referencing the untouched `trackControlled: true` record for `Track` control resolution (§3.2).

### 1.2 Neutral Contracts, Mesh-Native Scheduler Port (`WD-2`), Deterministic Scope Jitter, & Trigger Predicates (`new`, Lots `3-E1` & `3-S2b`)

Following `engram-live/scheduler.ts:54` and `engram-live/retention.ts:73-74,101-105`, `engram-memory` reads **no ambient system clock** (`Date.now()` is forbidden in `engram-memory/**`); evaluation timestamps (`nowMs`) and IANA local calendar projections are injected through `ClockPort` (`engram-memory/contracts/index.ts:1388`):

```typescript
// new (Lot 3-E1): engram-memory/dreaming-contracts.ts
import type { Cursor, Digest, IdempotencyKey, Instant } from './contracts/index.js';

export type WorkspaceDreamingTriggerKindV1 =
  | 'nightly'
  | 'mid-day'
  | 'context-saturation'
  | 'weekly'
  | 'monthly';

export type DreamingTriggerKindV1 = WorkspaceDreamingTriggerKindV1 | 'cross-repository';

/** Includes bounded post-reconnect remote revision runs (§1.3 item 5); projected to Spec 2 triggers via §3.1. */
export type DreamingPassExecutionTriggerKindV1 = DreamingTriggerKindV1 | 'late-sync-amendment';

export type DreamingExecutionPlaneV1 = 'embedded-local' | 'external-host';

/**
 * Required before any 'weekly', 'monthly', 'cross-repository', or 'late-sync-amendment' pass executes (Point 3C).
 * Produced by Spec 6B integral DB-cluster sync (D24=integral) and read ONLY from PostgresKernel state
 * inside each bound (tenantId, workspaceId) scope — NEVER accepted from caller HTTP payloads (S3-C-03).
 */
export interface GraphSyncBarrierReceiptV1 {
  readonly schema_version: 1;
  readonly tenant_id: string;
  readonly synced_workspace_ids: readonly string[]; // sorted, non-empty (<= 30 for cross-repository per D9)
  /** Per-workspace acknowledged canonical journal high-water cursor committed in PostgresKernel by Spec 6B. */
  readonly high_water_cursors: ReadonlyArray<{
    readonly workspace_id: string;
    readonly through_cursor: Cursor;
    readonly kernel_tx_digest: Digest;
    readonly synced_at: Instant;
  }>;
  /** Non-empty only when an enrolled workstation remained offline past sync grace window (OQ-S3-3). */
  readonly lagging_replica_ids: readonly string[];
  readonly kernel_fencing_epoch: number;
  readonly barrier_digest: Digest;
}

export interface DreamingPassSchedulePolicyV1 {
  readonly schema_version: 1;
  readonly policy_profile_id: string;
  /** Local IANA timezone for workstation 'nightly' and 'mid-day' anchors (e.g. 'America/Toronto'). */
  readonly local_iana_timezone: string;
  readonly local_nightly_hour: number;                   // default: 2 (02:00 local)
  readonly local_midday_window_hours: readonly [number, number]; // default: [12, 14] (13:00 anchor)
  /** Local workstation inactivity window before scheduled local passes (default: 900_000 ms = 15 min, OQ-S3-3). */
  readonly min_quiescence_before_scheduled_ms: number;   // default: 900_000 (15 min idle, sentropic OQ-S3-3)
  readonly saturation_token_ratio_threshold: number;     // default: 0.80 (bounded to [0.70, 0.95])
  readonly saturation_min_turn_delta: number;            // default: 8 turns since last saturation pass
  readonly saturation_min_byte_delta: number;            // default: 16_384 UTF-8 bytes
  readonly remote_weekly_utc_day_hour: readonly [number, number];     // default: [1, 3] (Monday 03:00 UTC base)
  readonly remote_monthly_utc_day_hour: readonly [number, number];    // default: [1, 4] (1st 04:00 UTC base)
  readonly remote_cross_repo_utc_day_hour: readonly [number, number]; // default: [0, 5] (Sunday 05:00 UTC base)
  /** Deterministic per-scope jitter window spreading multi-tenant remote passes (default: 3_600_000 ms = 60 min, S3-C-02). */
  readonly max_schedule_jitter_ms: number;               // default: 3_600_000
  /** Global & per-tenant remote pass admission caps preventing Postgres / llm-mesh stampedes (S3-C-02). */
  readonly max_concurrent_remote_passes_global: number;  // default: 16
  readonly max_concurrent_remote_passes_per_tenant: number; // default: 2
  /** Bounded late-sync-amendment caps (§1.3 item 6, S3-C-02). */
  readonly max_late_sync_revisions_per_window: number;   // default: 3
  readonly max_amended_windows_per_cycle: number;        // default: 2
  readonly policy_digest: Digest;
}
```

**Mesh-Native Remote Scheduler Port (`DreamingRemoteSchedulerPort`, `W-D5 B` relayed by `sentropic`, `Lot 3-S2b`):**

Mirroring `TurnExecutionPort` (`execution: { kind: 'mesh-scheduler' }`) in `sentropic:spec/SPEC_EVOL_CHAT_MESH_PROPOSAL.md:152,635` (`Lot D3`), `packages/cluster-mesh/src/engram-memory/dreaming-remote.ts` schedules every remote pass (`weekly`, `monthly`, `cross-repository`, `late-sync-amendment`) exclusively through `@sentropic/cluster-mesh`'s `WD-2` mesh-native scheduler (`sentropic:spec/SPEC_EVOL_WASM_DEPLOYMENT.md:44,66,85-91,277,360,383`, `new` in `packages/cluster-mesh/src/deployment/scheduler.ts`), with **zero** cron timer or schedule loop in `api/`:

```typescript
// new (Lot 3-S2b): packages/cluster-mesh/src/engram-memory/dreaming-remote.ts
export interface DreamingMeshScheduleIntentV1 {
  readonly tenantId: string;
  readonly authenticatedPrincipalId: string; // dreamingServiceNhiId
  readonly resource: `engram-memory:dreaming:${DreamingPassExecutionTriggerKindV1}`;
  readonly immutableInputDigest: Digest;
  readonly requiredCapabilities: readonly ['engram-memory/substrate', 'llm-mesh'];
  readonly placement: 'external-host';
  /** Deterministic tenant/workspace-hashed jitter offset past base UTC anchor (S3-C-02). */
  readonly notBeforeEpochMs: number;
  readonly deadlineEpochMs: number;
  readonly idempotencyKey: IdempotencyKey;
  readonly policyRevision: Digest;
}

export type DreamingMeshJobStateV1 =
  | 'queued'
  | 'admitted'
  | 'running'
  | 'cancellation-requested'
  | 'completed'
  | 'failed'
  | 'effect-unknown'; // WD-2 state machine (SPEC_EVOL_WASM_DEPLOYMENT.md:88)

export interface DreamingRemoteSchedulerPort {
  submit(intent: DreamingMeshScheduleIntentV1): Promise<{ readonly jobId: string; readonly fencingEpoch: number }>;
  status(tenantId: string, jobId: string): Promise<{ readonly state: DreamingMeshJobStateV1; readonly fencingEpoch: number }>;
  cancel(tenantId: string, jobId: string, reason: string): Promise<void>;
  receipt(tenantId: string, jobId: string): Promise<{ readonly receiptDigest: Digest; readonly state: DreamingMeshJobStateV1 } | null>;
}
```

- **Deterministic Tenant/Scope Offset Jitter & Bounded Admission (`S3-C-02`):** To prevent multi-tenant thundering herds at `Monday 03:00 UTC`, `1st 04:00 UTC`, or `Sunday 05:00 UTC`, `dreaming-remote.ts` computes a deterministic per-scope offset before calling `DreamingRemoteSchedulerPort.submit`:
  $$\text{offsetMs} = \operatorname{uint32\_be}\!\left(\operatorname{sha256}\!\left(\text{tenantId} \mathbin{\|} \text{"\textbackslash 0"} \mathbin{\|} \text{workspaceScopeKey} \mathbin{\|} \text{"\textbackslash 0"} \mathbin{\|} \text{triggerKind}\right)\right) \bmod \text{max\_schedule\_jitter\_ms}$$
  (default `max_schedule_jitter_ms = 3_600_000`, setting `notBeforeEpochMs = windowAnchorUtcMs + offsetMs`, where `workspaceScopeKey` is `workspaceId` for single-workspace passes or `":cross-repo"` for tenant cohort audits). In addition, `dreaming-remote.ts` enforces both `max_concurrent_remote_passes_global` (default `16`) and `max_concurrent_remote_passes_per_tenant` (default `2`) via bounded FIFO deferral queues under `WD-O5` epoch/generation fencing leases (`SPEC_EVOL_WASM_DEPLOYMENT.md:90,360,383`).

**Exact Trigger Firing Predicates (`evaluateDreamingTriggersV1`, `new` Lot `3-E1`):**

1. **`nightly` (`embedded-local`, default `02:00` local IANA time — owner's « daily », `D19` + `D25`):**
   - Canonical window ID: `local-day:<YYYY-MM-DD>` (the most recently closed local `02:00` boundary at `nowMs`).
   - Fires when `lastWatermark.nightly.windowId < currentLocalDayWindowId`, `currentJournalCursor > min(lastWatermark.nightly.deterministicThroughCursor, lastWatermark.nightly.modelSynthesisThroughCursor)`, and local interactive session activity has been quiescent for `>= min_quiescence_before_scheduled_ms` (`900_000 ms` / `15 min` per `OQ-S3-3`, or runs inside the `'backfill'` queue of `Scheduler` with 3:1 `interactive:backfill` fairness per `engram-live/scheduler.ts:117,173`).
2. **`mid-day` (`embedded-local`, default `12:00–14:00` local slot — `D19` « mi journee », zero extra `cluster-mesh` daemon per `OQ-S3-3`):**
   - Canonical window ID: `local-midday:<YYYY-MM-DD>`.
   - Evaluated opportunistically on existing `h2a drumbeatTick` (`packages/h2a/src/runtime/drumbeat/watch.ts:88`), `SessionStart`, or `session-front` ingress — **no background daemon or polling loop is added inside `cluster-mesh`**.
   - Fires at most once per local calendar date when **either**:
     - *(Time + Activity Trigger):* local wall time is inside `[12:00, 14:00]`, at least one `session_summary` (`Spec 1 §1.5`: `24` turns or `65_536` UTF-8 bytes) or `>= 1` closed session has been recorded since `max(lastWatermark.nightly.deterministicThroughCursor, lastWatermark.midday.deterministicThroughCursor)`, and workspace interactive turns have been quiescent for `>= min_quiescence_before_scheduled_ms` (`900_000 ms` / `15 min`, `OQ-S3-3`); **or**
     - *(Inter-Session Burst Trigger):* `>= 14_400_000 ms` (`4 hours`) have elapsed since the previous local dreaming pass, `>= 3` sessions have closed in the workspace during the current local day, and interactive turns have been quiescent for `>= 900_000 ms`.
3. **`context-saturation` (`embedded-local`, event-driven — `D19` « a saturation du contexte »):**
   - Canonical window ID: `sat:<sessionId>:<throughOrdinal>`.
   - Triggered directly by Spec 1's `RawSessionEventPayload` of `kind: 'context_saturation'` (`{ kind: 'context_saturation', hostId, observedTokenRatio, throughOrdinal }`, `Spec 1 :295-299`) immediately **after** Spec 1's synchronous `session_summary` compaction + extraction sweep (`extractionSweepScheduled: true`, `Spec 1 :370`) commits `throughOrdinal`.
   - **Anti-Thrash Hysteresis Guard:** Fires if and only if `observedTokenRatio >= saturation_token_ratio_threshold` (`0.80`), `throughOrdinal > lastSaturationOrdinal(sessionId)`, and at least `saturation_min_turn_delta` (`8` turns) or `saturation_min_byte_delta` (`16_384` bytes) were ingested since `lastSaturationOrdinal(sessionId)`. Oscillating token ratios near `0.80` without new turns are deterministically ignored.
4. **`weekly`, `monthly`, and `cross-repository` (`external-host` via `WD-2` mesh scheduler, `[DEPENDS ON SPEC 6B]`):**
   - Canonical window IDs: `iso-week:<YYYY-Www>:rev<r>`, `utc-month:<YYYY-MM>:rev<r>`, and `cross-repo:<YYYY-Www>:rev<r>`.
   - **Fail-Closed Kernel Sync Precondition (`S3-C-03`):** `evaluateDreamingTriggersV1` **refuses** (`DreamingPreconditionRefusal('MISSING_GRAPH_SYNC_BARRIER')`) any remote trigger lacking a kernel-read, digest-valid `GraphSyncBarrierReceiptV1` whose `high_water_cursors` advance past the previous completed remote watermark for that cadence.

### 1.3 Catch-Up After Powered-Off / Offline Periods & Remote Outages (`CatchUpPolicyV1`, `S3-C-02`, `S3-C-04`, `S3-C-05`)

Workstations power off overnight, over weekends, and across multi-week vacations, while `external-host` or `Spec 6B` sync may remain unreachable or paused across multiple remote windows (`D17=degraded`). Persistent dual-cursor watermarks (`DreamingWatermarkRowV1`, `new` Lot `3-S1a`, carrying both `deterministicThroughCursor` and `modelSynthesisThroughCursor` per §5.2, stored as registered aggregates in `SqliteKernel` locally and `PostgresKernel` remotely) govern deterministic catch-up:

1. **Zero-Activity Fast-Forward (Zero Wasted Model Calls, Local & Remote):**
   - If $M \ge 1$ scheduled windows (`nightly`, `mid-day`, `weekly`, `monthly`, `cross-repository`) elapsed while the machine was powered off or the workspace was idle **and** `currentTargetCursor === lastWatermark[trigger].deterministicThroughCursor === lastWatermark[trigger].modelSynthesisThroughCursor` (zero new journal events or session turns occurred across the entire missed span), the runner records a zero-LLM `DreamingEmptyWindowReceiptV1` advancing `lastCompletedWindowId` to the latest closed window in $O(1)$ time with **zero** `@sentropic/llm-mesh` invocations.
2. **Coalescing Multiple Missed Local `nightly` Windows Into One `'backfill'` Pass:**
   - If $M \ge 1$ local `nightly` boundaries elapsed while the workstation was powered off (e.g., laptop closed Friday `18:00` → powered on Monday `09:00`, missing `Fri`, `Sat`, `Sun` `02:00` boundaries) **and** new local journal/session activity exists past the prior watermark, the runner **never** spawns $M$ sequential `nightly` passes.
   - Instead, it enqueues **exactly one coalesced `nightly` catch-up pass** over `(lastWatermark.nightly.throughCursor .. currentJournalCursor]` tagged with `canonicalWindowId = latestMissedLocalDayWindowId` and `coalescedWindowIds: ['local-day:2026-11-13', 'local-day:2026-11-14', 'local-day:2026-11-15']`.
   - Catch-up executes strictly at `priority: 'backfill'` (`engram-live/scheduler.ts:4,35,141-145,173`), preserving `backfillReserveBytes` headroom and 3:1 `interactive:backfill` quantum scheduling so waking a laptop never delays interactive `engram_memory_context` (`D15`) or Spec 1 turn capture.
3. **Missed `mid-day` Windows Are Never Backfilled:**
   - A `mid-day` window whose `12:00–14:00` slot has already passed while the machine was powered off (or when an overdue `nightly` catch-up pass is pending) transitions directly to `superseded_by_nightly` with zero separate execution.
4. **Interrupted `context-saturation` Recovery:**
   - If the workstation crashed or powered off after recording `kind: 'context_saturation'` at `throughOrdinal` in `session-db` (`Spec 1`) before completing the saturation dreaming pass:
     - if a coalesced `nightly` catch-up pass runs first and its cursor already covers `throughOrdinal`, the pending saturation item resolves as `superseded` (`engram-live/scheduler.ts:39,246-261`);
     - otherwise, resuming that session runs the single pending `sat:<sessionId>:<throughOrdinal>` pass once before assembling the next step.
5. **Coalescing Multiple Missed Remote Windows (`weekly`, `monthly`, `cross-repository`, `S3-C-02`):**
   - If `external-host`, `WD-2`, or `Spec 6B` sync was unavailable across $K > 1$ remote windows (e.g., `W01..W04` or multiple months), `dreaming-remote.ts` **never** replays $K$ historical remote passes sequentially.
   - Instead, **at most one coalesced pass per remote cadence** is submitted to `DreamingRemoteSchedulerPort` over `(lastCompletedThroughCursor, syncCompleteThroughCursor]` of the latest kernel-verified `GraphSyncBarrierReceiptV1`, recording `coalescedWindowIds` in `DreamingPassReceiptV1` with deterministic per-scope jitter (`§1.2`) and bounded concurrency admission.
6. **Bounded Offline Workstation Reconnect Into Already-Closed Remote Windows (`late-sync-amendment`, `[DEPENDS ON SPEC 6B]`, `S3-C-02`, `S3-C-04`):**
   - When one or more workstations worked offline under `D17=degraded` while `external-host` already executed `iso-week:2026-W46:rev0`, and subsequently reconnect and complete `Spec 6B` sync with `>= 1` admitted `MemoryRecordV2` or allowed summary whose `primary_event.at` (`engram-memory/contracts/index.ts:36`) falls inside a closed remote window:
     1. **Slice Coalescing Before Execution:** All late sync slices arriving for an affected window before an amendment job transitions to `'running'` in `WD-2` coalesce into **a single** `rev_next` (`revisionOrdinal = prevRevision + 1`, capped at `max_late_sync_revisions_per_window = 3`).
     2. **Cycle Window Cap (`max_amended_windows_per_cycle = 2`):** At most `2` historical closed windows may be amended in a single scheduling cycle (`most-recent-first`); any older affected windows (`> 2`) or tails exceeding `rev3` are deterministically absorbed into the next consolidated `monthly` pass without spawning an unbounded backlog.
     3. **`Point 6A` Guard on Amendments (`S3-C-04`):** A `late-sync-amendment` pass may supersede via `LifecycleEventV2` **only** dreaming's own prior `trackControlled: false` `DreamingRecallBoostIndexRowV1` entries and unratified `trackControlled: false` dreaming proposals; any conflict involving an incumbent `trackControlled: true` record is routed solely as a separate `reviewStatus: 'proposed'` (`verdictAuthority: 'track'`, `trackControlled: false`) candidate (`Refusal('TRACK_CONTROLLED_IMMUTABLE')` on any direct overwrite/supersession attempt).

### 1.4 Deterministic Three-Layer Idempotency, `memory-binding-v2` Manifest Registration, & Tombstone Revalidation (`S3-C-04`, `S3-C-09`)

1. **Layer 1 — Pass-Level JCS Idempotency Key (`DreamingPassIdempotencyKey`):**
   Every pass derives its immutable key before acquiring any lease or making any `@sentropic/llm-mesh` call:
   ```typescript
   // new (Lot 3-E1): engram-memory/dreaming-triggers.ts
   export function computeDreamingPassIdempotencyKeyV1(input: {
     readonly plane: DreamingExecutionPlaneV1;
     readonly tenant_id: string;
     readonly workspace_scope_digest: Digest; // sha256_jcs(sorted workspaceIds)
     readonly trigger: DreamingPassExecutionTriggerKindV1;
     readonly canonical_window_id: string;
     readonly from_journal_cursor: Cursor;
     readonly through_journal_cursor: Cursor;
     readonly policy_digest: Digest;
   }): IdempotencyKey; // returns `idem:dream:v1:${sha256Hex(canonicalJcsBytes(input))}`
   ```
   Duplicate local wakeups, overlapping `drumbeatTick` + `SessionStart` hooks, or redelivered `WD-2` mesh-scheduler intents (`SPEC_EVOL_WASM_DEPLOYMENT.md:88,360` `'effect-unknown'` recovery) bearing the same tuple resolve through `NeutralModuleTransaction.findIdempotency` (`packages/cluster-mesh/src/engram-memory/neutral-contract.ts:181-199`) and the durable `'scope-outbox-v1'` profile (`packages/cluster-mesh/src/storage/postgres/profiles.ts:11-12,50-58` on Postgres, and `packages/cluster-mesh/src/storage/sqlite/index.ts:60-63,75-83` activated in `Spec 6A` Lot `6A-S0b` on SQLite, using key format `'["memory-outbox-v1","<through_cursor_inclusive>","<batch_digest>"]'` at `packages/cluster-mesh/src/engram-memory/manifest.ts:138`), returning the existing `DreamingPassReceiptV1` with **zero** duplicate model calls. *(Note: `packages/cluster-mesh/src/storage/root-profiles.ts:15-16` is the in-memory `RootScopedRuntime` only and is never relied upon for durable outbox persistence.)*
2. **Mandatory `manifest.ts` & `projection.ts` Registration Under `memory-binding-v2` (`S3-C-04`, `OQ-S3-1`, Lot `3-S1a`):**
   Because `packages/cluster-mesh/src/engram-memory/projection.ts:100-104`, `sqlite-queries.ts:17-18`, and `postgres-queries.ts:15-16,117-119` reject any undeclared record key prefix, aggregate kind, or query name with `StorageInvalidCommandError`, Lot `3-S1a` (building on `Spec 6A` Lot `6A-S1a` `memory-binding-v2`) explicitly registers in `packages/cluster-mesh/src/engram-memory/manifest.ts` and `projection.ts` (and recomputes `MEMORY_CONTRACT_DIGEST` at `manifest.ts:215-230`):
   - `MEMORY_RECORD_KINDS`: `'dreaming-pass-receipt'`, `'dreaming-recall-boost'` (`DreamingRecallBoostIndexRowV1`), `'dreaming-shadow-draft'` (`ShadowLessonDraftV1` + `ShadowVerificationReceiptV1`), and `'dreaming-proposal'`;
   - `MEMORY_AGGREGATE_KINDS`: `'dreaming-watermark'` (`DreamingWatermarkRowV1` keyed by `["dreaming-watermark-v1","<trigger_kind>"]` inside each bound `{ tenantId, workspaceId }` scope) and `'dreaming-shadow-gate-state'` (`DreamingShadowGateStateV1` keyed by `["dreaming-shadow-gate-v1","<lineage>","<target_domain>","<cohort_key>"]` inside each bound `{ tenantId, workspaceId }` scope — ensuring per-`(tenantId, workspaceId, lineage)` isolation and **never** sharing gate state across tenants per `OQ-S3-1`);
   - `MEMORY_QUERY_NAMES`: `'dreaming.readWatermark'`, `'dreaming.readShadowGateState'`, `'dreaming.listRecallBoosts'`, and `'dreaming.listProposals'`.
3. **Layer 2 — Artifact-Level Child Idempotency Keys:**
   Every output emitted by a pass (`DreamingRecallBoostIndexRowV1`, `ShadowLessonDraftV1`, `Track` typed proposal, `TrackTemplateEvolutionRequestV1`, `MasterHarnessAuditProposalV1`) derives a deterministic child key:
   `idem:dream-item:v1:${sha256_jcs({ pass_idempotency_key, artifact_kind, canonical_subject_key, sorted_citation_digests })}`.
   If a pass crashes mid-flight after emitting $k$ of $n$ items, crash recovery replays items $1..k$ as exact idempotent acknowledgements (`NeutralModuleTransaction.findIdempotency` / `MemoryPortV2.capture` duplicate-capture ack) and executes only $k+1..n$.
4. **Layer 3 — Post-LLM Fence, Epoch, `Point 6A`, & Tombstone Revalidation (`Zero Resurrection & Non-Overwrite Guarantee`):**
   Before committing any pass output after an async `@sentropic/llm-mesh` round-trip, the runner validates inside the kernel commit transaction:
   - the active `ScopeFencingTokenDto` (`engram-live/scheduler.ts:192,238,247`) and `WD-O5` scheduler fencing epoch on remote runs — aborting with `FENCE_LOST` / `fenced` if storage or scheduler epoch rotated;
   - `Point 6A` (`target.trackControlled !== true`, aborting direct mutation/supersession with `Refusal('TRACK_CONTROLLED_IMMUTABLE')`); and
   - every cited `source_record_id` and `session_turn` against the live canonical store: if any cited source transitioned to `tombstoned` (`engram_memory_forget`), `withdrawn` (`engram_memory_withdraw`), `rejected`, or matched an updated `ConfidentialityDenyListV1` (`D7`) while the pass was running, that candidate is dropped (`omitted_source_invalidated`) and **never** written (`SPEC_MEMORY_MCP_V2.md:898`).

---

## 2. `D26` (`two-tier-shadow`): Two-Tier Shadow Lesson Drafting, Independent Verifier, and Measured Threshold

### 2.1 Settled Rule, Deterministic vs Model-Drafted Separation, & `Point 6A` Guard

Settled `D26` (`two-tier-shadow`, [`spec/memory/R15-SEDIMENT.md:71`](memory/R15-SEDIMENT.md)):
> *"Dreaming may later have lessons drafted by a language model, in shadow. One model drafts, an independent verifier checks, and nothing is shown to the owner before the measured threshold"*.

To prevent any conflation between deterministic graph maintenance and generative lesson synthesis:
- **Deterministic Graph Resynthesis (Zero LLM Calls — Active Immediately & `D17=degraded` Safe):** Re-indexing already-ratified `accepted_current` permanent records whose short-term recency decayed (`D23`, §3.1) and running deterministic L5 assertion-family comparisons (`createAssertionFamilyRegistryV1` in `engram-memory/assertion-family-registry.ts:267-365`) invoke **zero** language models, advance `DreamingWatermarkRowV1.deterministicThroughCursor` independently of `@sentropic/llm-mesh` availability (§5.2), expose only already-ratified `accepted_current` records, and strictly obey `Point 6A` (`S3-C-04`): deterministic `proposeReconciliation` never mutates or supersedes an incumbent `trackControlled: true` record, staging only a separate `reviewStatus: 'proposed'` (`verdictAuthority: 'track'`, `trackControlled: false`) candidate whenever a `Track`-controlled record is involved.
- **Model-Drafted Lessons & Generative Proposals (`D26` Two-Tier Shadow — Strictly Quarantined Until Threshold):** Every lesson, synthesized cross-session rule, LLM-synthesized `Track` proposal/template request, `spec/` amendment draft, or `h2a` harness audit proposal drafted by a language model executes inside the **Two-Tier Shadow Pipeline** below. **Nothing** drafted by this pipeline reaches the owner, `engram_memory_context`, `Track`, `h2a`, or any UI/notification surface while `DreamingShadowGateStateV1.gate_state !== 'threshold_met_eligible'`.

### 2.2 Tier 1 (Shadow Drafter), Canonical Model-Family Resolution, & Tier 2 (Independent Blind Verifier)

```typescript
// new (Lot 3-E2): engram-memory/dreaming-shadow.ts
import type { CitationV1, Digest, IdempotencyKey, Instant } from './contracts/index.js';
import type { DreamingPassExecutionTriggerKindV1 } from './dreaming-contracts.js';

export type CanonicalModelFamilyIdV1 =
  | 'anthropic'
  | 'google'
  | 'openai'
  | 'mistral'
  | 'zai'
  | 'cohere'
  | 'unknown';

export type ShadowLessonTargetDomainV1 =
  | 'engram-permanent-lesson'
  | 'track-typed-proposal'
  | 'track-template-request'
  | 'h2a-master-harness-audit'
  | 'h2a-repo-overlay-proposal'
  | 'spec-amendment-draft';

export type ShadowDraftVerificationStatusV1 =
  | 'pending_verification'
  | 'pending_independent_family'
  | 'verified_pass'
  | 'verified_rejected';

export interface ShadowLessonDraftV1 {
  readonly schema_version: 1;
  readonly draft_id: string;
  readonly pass_idempotency_key: IdempotencyKey;
  readonly trigger: DreamingPassExecutionTriggerKindV1;
  readonly target_domain: ShadowLessonTargetDomainV1;
  readonly verification_status: ShadowDraftVerificationStatusV1;
  /** Concise invariant or lesson statement (<= 2_048 UTF-8 B, NFC; scrubbed under D6=refs when applicable). */
  readonly statement: string;
  /** Mandatory >= 2 distinct primary-event citations, or >= 1 verified owner correction citation. */
  readonly citations: readonly CitationV1[];
  /** Structural watch signature used for passive prospective validation (§2.3). */
  readonly watch_signature: {
    readonly cited_path_fingerprints: readonly Digest[];
    readonly cited_symbol_or_rule_keys: readonly string[];
    readonly predicted_failure_codes: readonly string[];
  };
  readonly drafter_receipt: {
    readonly provider_id: string;
    readonly model_family: Exclude<CanonicalModelFamilyIdV1, 'unknown'>;
    readonly served_model_id: string;
    readonly route_attempt_digest: Digest;
  };
  readonly draft_digest: Digest;
}

export type ShadowVerifierVerdictKindV1 =
  | 'pass'
  | 'reject_hallucinated_citation'
  | 'reject_trivial_or_duplicate'
  | 'reject_contradicts_ratified'
  | 'reject_policy_boundary';

export interface ShadowVerificationReceiptV1 {
  readonly schema_version: 1;
  readonly draft_id: string;
  readonly draft_digest: Digest;
  readonly verdict: ShadowVerifierVerdictKindV1;
  /** Integer score in 0..100 from @sentropic/llm-mesh/decision graded criterion; pass requires >= 80. */
  readonly verifier_score_0_to_100: number;
  readonly verifier_receipt: {
    readonly provider_id: string;
    readonly model_family: Exclude<CanonicalModelFamilyIdV1, 'unknown'>;
    readonly evaluator_id: string;
    readonly evaluator_revision: string;
    readonly decision_receipt_digest: Digest;
  };
  readonly verified_at: Instant;
  readonly receipt_digest: Digest;
}
```

**Four Mandatory Independence & Isolation Rules Between Tier 1 and Tier 2 (`S3-C-05`, `S3-C-06`, `S3-C-09`):**

1. **Strict Canonical Model-Family Disjointness (`Anti-Collusion Invariant`):**
   - Because neither `RouteModelInventoryEntry` (`{ modelId, providerId }` at `sentropic:packages/llm-mesh/src/routing-contracts.ts:156-160`) nor `EligibleAccountDescriptor` (`:19-37`) carries a `model_family` field—and because in `sentropic`'s real catalog (`packages/llm-mesh/src/providers.ts:7,43-47,63-64,129-135`, `catalog.ts:152,202`) `providerId: 'gcp'` has `ProviderDescriptor.family === 'google'` (`catalog.ts:202`) while serving `'anthropic/claude-sonnet-4-6@gcp'` (`providers.ts:63-64`), `providerId: 'mistral'` serves third-party `'zai-glm-5-3'` (`:43-47`), and `antigravityModelFleet` (`:129-135`) multiplexes Claude, Gemini, and GPT models—`packages/cluster-mesh/src/integrations/llm-mesh/memory-dreaming-llm.ts` (`new`, Lot `3-S1b`) computes `resolveCanonicalModelFamily(providerId, modelId): CanonicalModelFamilyIdV1` by inspecting the normalized `modelId` **first**:
     - `anthropic/*` or `claude-*` (including `anthropic/claude-*@gcp`) → `'anthropic'`;
     - `google/*` or `gemini-*` → `'google'`;
     - `openai/*` or `gpt-*` / `o1-*` / `o3-*` / `o4-*` → `'openai'`;
     - `zai-glm-*` or `zai/*` → `'zai'`;
     - `mistral-*` / `codestral-*` / `ministral-*` → `'mistral'`;
     - `command-*` / `cohere/*` → `'cohere'`;
     - falling back to single-vendor `ProviderDescriptor.family` **only** when the provider hosts no multi-family fleet, and returning `'unknown'` (refused fail-closed for Tier-1/Tier-2 pairing) otherwise.
   - `memory-dreaming-llm.ts` queries `RoutePlanner.listModels(subject)` (`packages/llm-mesh/src/routing-contracts.ts:251-253`; or `LlmMesh.listModels()` at `packages/llm-mesh/src/mesh.ts:51` when `RoutePlanner.listModels` is unset — never internal `AccountDirectoryPort.listEligible` at `:209`). **`verifier_receipt.model_family !== drafter_receipt.model_family` (with neither equal to `'unknown'`) is mandatory on every shadow verification**, and whenever the inventory exposes `>= 2` distinct `providerId` values across disjoint families, `verifier_receipt.provider_id !== drafter_receipt.provider_id` is enforced as well.
   - If `listModels` currently exposes only a single canonical model family for the subject, `memory-dreaming-llm.ts` refuses Tier-2 execution without erroring the deterministic pass and persists the Tier-1 draft quarantined with `verification_status: 'pending_independent_family'` (§5.2) — **the drafting model family can never verify its own drafts**.
2. **Zero Shared Prompt / Zero Chain-of-Thought Leakage (`Blind Verification`):**
   - Tier 2 receives **only**:
     - `ShadowLessonDraftV1.statement` and `target_domain`;
     - the canonical evidence records independently re-fetched by `citation_id` / `content_digest` from the canonical store (never trusting text echoed by Tier 1);
     - active ratified `owner_decisions` and `harness_effective_rules` in scope; and
     - the registered criterion `engram.dreaming.shadow-lesson-verify/v1`.
   - Tier 2 **never** receives Tier 1's system/user prompt, reasoning trace, self-confidence, or `drafter_receipt`.
3. **Closed `@sentropic/llm-mesh/decision` Verdict Execution:**
   - Tier 2 runs exclusively through `DecisionClient.decide` (`packages/llm-mesh/src/decision/receipt.ts:65-66`, `request.ts:40-75` closed 8-key `DecisionRequest`) with `decision: { kind: 'threshold', field: 'score', op: '>=', value: 80 }`. Any citation mismatch, contradiction of a ratified `owner_decision`, or `D6`/`D7`/`T-M-C`/`Point 6A` violation forces `verdict !== 'pass'` and `score = 0`.
4. **Seeded Synthetic Negative-Control Canaries (`Non-Vacuity Proof`):**
   - Every shadow batch with `>= 1` draft deterministically synthesizes **at least one** unmarked negative-control canary (created by either swapping a `CitationV1.content_digest` to an unrelated record's text or negating an `accepted_current` `owner_decision` in scope) and submits it through the exact same `DecisionClient.decide` call path (never persisted as a real draft).
   - A verifier that rubber-stamps all inputs immediately fails the canary (`canary_false_pass_count > 0`) and trips the calibration circuit breaker (§2.3).

### 2.3 Formal Threshold Metric, Per-Scope Aggregate Isolation, & Passive Shadow Measurement (`DreamingShadowGateStateV1` / `ShadowCalibrationGateV1`)

Because **`D26` forbids showing anything to the owner before the measured threshold**, the threshold metric CANNOT depend on asking the owner to grade lessons prior to threshold attainment. Instead, `engram` measures shadow quality passively over a rolling calibration ledger combining **(a) independent Tier-2 verification**, **(b) seeded negative-control canaries**, and **(c) passive prospective delayed-outcome validation against subsequent organic repository events**:

- **Strict `(tenantId, workspaceId, lineage)` Aggregate Isolation (`OQ-S3-1`, confirmed by `sentropic` `2026-11-15`):** Calibration state `DreamingShadowGateStateV1` is persisted exclusively as a registered aggregate (`'dreaming-shadow-gate-state'` in `packages/cluster-mesh/src/engram-memory/manifest.ts`, §1.4) scoped per `(tenantId, workspaceId, lineage)` (further partitioned by `(target_domain, policy_profile_id, drafter_model_family, verifier_evaluator_id)`). Calibration counts and `gate_state` are **never** shared across tenants.

1. **Passive Prospective Outcome Resolution (`prospective_confirmed` vs `prospective_refuted`):**
   Every Tier-2-passing shadow draft (`verdict === 'pass'`, `visibility: 'shadow_internal_only'`) registers its `watch_signature` over subsequent sessions, owner events, and merged PRs during an observation horizon $[t_{\text{draft}},\, t_{\text{draft}} + \Delta_{\text{obs}}]$ (default $\Delta_{\text{obs}} = 14\text{ days}$ or $\ge 5$ subsequent sessions in the workspace):
   - **`prospective_confirmed`:** Subsequent organic workspace activity independently validates the lesson without having been shown it — specifically: (i) a verified `owner.answer` / `owner.request` (`Spec 1`), merged PR (`pr.merged`), or ratified `Track` item/spec amendment independently states or codifies the same cited file/symbol/rule invariant (`BM25F` + citation overlap above confirmation threshold verified by Tier-2 evaluator), **or** (ii) a subsequent session lacking the quarantined lesson encounters the exact predicted `error` / `security-gate` failure on `watch_signature.cited_path_fingerprints` before resolving it.
   - **`prospective_refuted`:** A subsequent ratified `owner_decision`, merged PR, `tombstone` (`forget`), or `TrackControlVerdict` contradicts the shadow draft's statement or invalidates its premise.
   - **`prospective_unobserved`:** Neither confirmed nor refuted within $\Delta_{\text{obs}}$ (tracked separately; cannot inflate `confirmed`).

2. **Exact Five-Clause Threshold Predicate (`evaluateShadowCalibrationGateV1`, `new` Lot `3-E2`):**
   Evaluated per `(tenantId, workspaceId, lineage, target_domain, policy_profile_id, drafter_model_family, verifier_evaluator_id)` aggregate over the trailing `90`-day rolling window:
   Let $N_{\text{drafts}}$ be total real shadow drafts evaluated, $N_{\text{verified\_pass}}$ be drafts passing Tier 2 (`score >= 80`), $N_{\text{confirmed}}$ be prospectively confirmed Tier-2-passed drafts, $N_{\text{refuted}}$ be prospectively refuted Tier-2-passed drafts, and $N_{\text{resolved}} = N_{\text{confirmed}} + N_{\text{refuted}}$.

   `gate_state` transitions from `'shadow_below_threshold'` to `'threshold_met_eligible'` **if and only if ALL FIVE clauses hold simultaneously**:
   - **Clause 1 — Sample & Multi-Window Floor:**
     $$N_{\text{verified\_pass}} \ge 30 \quad \land \quad N_{\text{resolved}} \ge 20 \quad \land \quad N_{\text{distinct\_windows}} \ge 3$$
   - **Clause 2 — Exact 95% Wilson Score Lower Confidence Bound on Prospective Precision (`LCB_0.95 >= 0.85`):**
     With $\hat{p} = \frac{N_{\text{confirmed}}}{N_{\text{resolved}}}$ and $z = 1.96$:
     $$\mathrm{LCB}_{0.95}\!\left(N_{\text{confirmed}},\, N_{\text{resolved}}\right) = \frac{\hat{p} + \frac{z^2}{2 N_{\text{resolved}}} - z \sqrt{\frac{\hat{p}(1 - \hat{p})}{N_{\text{resolved}}} + \frac{z^2}{4 N_{\text{resolved}}^2}}}{1 + \frac{z^2}{N_{\text{resolved}}}} \ge 0.85$$
     *(Small-sample protection by construction: even $20/20$ yields $\mathrm{LCB}_{0.95}(20,20) \approx 0.8389 < 0.85$, requiring at least $24/24$ ($\approx 0.8617$), $29/30$ is $0.8380 < 0.85$, $34/35 \approx 0.8558$, etc. — mathematically preventing premature promotion on lucky micro-batches.)*
   - **Clause 3 — Seeded Canary Rejection Integrity (`100%` Negative-Control Catch Rate):**
     $$N_{\text{canaries}} \ge 10 \quad \land \quad \text{canary\_false\_pass\_count} = 0$$
   - **Clause 4 — Verifier Discrimination Band:**
     $$0.25 \le \frac{N_{\text{verified\_pass}}}{N_{\text{drafts}}} \le 0.95$$
     *(Below `0.25` indicates noisy Tier-1 drafting; above `0.95` triggers a rubber-stamp hold.)*
   - **Clause 5 — Zero Critical Boundary or Citation Defects (Trailing `50` Drafts):**
     $$\text{policy\_boundary\_violation\_count}_{50} = 0 \quad \land \quad \text{post\_verify\_hallucinated\_citation\_count}_{50} = 0$$

3. **Continuous Post-Threshold Monitoring & Automatic Circuit-Breaker Demotion:**
   - Once `gate_state === 'threshold_met_eligible'`, **every** subsequent candidate still passes both Tier 1 and Tier 2 (`score >= 80`), **plus** third-party review (`D1` / `D2`, §3); and third-party review outcomes (`accepted` vs `rejected` in `D1`/`Track` control) feed directly into $(N_{\text{confirmed}}, N_{\text{refuted}})$.
   - `gate_state` **immediately demotes** back to `'shadow_below_threshold'` (or `'shadow_circuit_broken'`) if:
     1. $\mathrm{LCB}_{0.95}$ drops below `0.80` (hysteresis band `[0.80, 0.85]`);
     2. `canary_false_pass_count > 0` or `policy_boundary_violation_count > 0`; or
     3. `drafter_model_family` or `verifier_evaluator_id` / `evaluator_revision` changes without an explicit re-qualification receipt.

---

## 3. Promotion (`D1`, `D2`, `T-M-C`, `Point 3C`, `Point 6A`), Surfacing in the Seventh Tool (`D23`), and Mesh HTTP Routes

### 3.1 What Surfaces in `engram_memory_context` (`D23`) and Closed Trigger Projection (`Spec 2 §2.2 :508`, `S3-C-08`)

Per `D23` (`« Le mode dreaming veenant rappelera des choses permanentes oubliees sur le court terme. »`, [`R15-SEDIMENT.md:68`](memory/R15-SEDIMENT.md)) and `Spec 2 §2.2` (`:506-515`) & `§3.1` (`:770`), dreaming populates **only** the `mission_focus_context.dreaming_recalled_facts` slot of the seventh MCP tool (`engram_memory_context`), under strict admissibility, schema-parity, and privacy invariants:

```typescript
// new (Lot 3-E3): engram-memory/dreaming-promotion.ts
import type { Digest, IdempotencyKey, Instant } from './contracts/index.js';
import type { WorkspaceDreamingTriggerKindV1 } from './dreaming-contracts.js';

export type BoostSourceTriggerKindV1 = WorkspaceDreamingTriggerKindV1 | 'late-sync-amendment';

export interface DreamingRecallBoostIndexRowV1 {
  readonly schema_version: 1;
  readonly boost_row_id: string;
  readonly record_id: string; // canonical accepted_current MemoryRecordV2.record_id
  readonly pass_idempotency_key: IdempotencyKey;
  readonly source_trigger_kind: BoostSourceTriggerKindV1;
  readonly amended_window_cadence?: 'weekly' | 'monthly'; // required iff source_trigger_kind === 'late-sync-amendment'
  /**
   * Closed 5-literal trigger projected directly onto Spec 2 §2.2 (:508) dreaming_recalled_facts[].trigger
   * so validateSchema in Spec 2 never sees 'late-sync-amendment' or 'cross-repository' (S3-C-08).
   */
  readonly projectedContextTrigger: WorkspaceDreamingTriggerKindV1;
  readonly trackControlled: false; // Point 6A: boost index row is owned by dreaming, never overwrites target record
  readonly attention_score_q16: number; // 0..65535
  readonly source_digest_sha256: Digest;
  readonly created_at: Instant;
}
```

- **Total Trigger Projection Bijection (`projectDreamingTriggerToContextWireV1`, `S3-C-08`):**
  - `'nightly' | 'weekly' | 'monthly' | 'mid-day' | 'context-saturation'` $\mapsto$ identical literal in `WorkspaceDreamingTriggerKindV1`;
  - `'late-sync-amendment'` $\mapsto$ `'weekly'` when `canonical_window_id` amends an `iso-week:*` window, or `'monthly'` when amending a `utc-month:*` window (`amended_window_cadence` mandatory);
  - `'cross-repository'` emits **zero** `DreamingRecallBoostIndexRowV1` rows (§1.1, §4.1; and if any shared diagnostic helper projects a `'cross-repo-weekly'` schedule label, it maps deterministically to `'weekly'`, never leaking an unknown literal to `Spec 2` `validateSchema`).

1. **Short-Term Forgotten Permanent Fact Detection (`selectForgottenPermanentFactsV1`, `new` Lot `3-E3`):**
   A canonical `MemoryRecordV2` $r$ in `(tenantId, workspaceId)` receives a `DreamingRecallBoostIndexRowV1` from a `nightly`, `mid-day`, `context-saturation`, `weekly`, `monthly`, or `late-sync-amendment` pass if and only if **all five** conditions hold:
   - **Ratified Current State:** `state(r) === 'accepted_current'` (`engram-memory/contracts/index.ts:421` — either an already-ratified permanent decision/constraint/fact, or a post-`D26`-threshold dreamed lesson that has subsequently been admitted to `accepted_current` via third-party review under `D1=borne-review`);
   - **Permanent Validity:** `r.retention.expires_at === undefined` (`engram-memory/contracts/index.ts:47-50`) and `r.valid_time.t_end === undefined` (`:8-11`);
   - **Short-Term Attention Omission (« oubliées sur le court terme »):** $r$ was **absent** from the delivered `mission_focus_context` across the trailing $K_{\text{omit}} = 8$ step context packs (or current saturated session) in the active worktree/branch because its 30-day temporal factor (`Math.exp((-Math.LN2 * age) / HALF_LIFE_MS)` in `engram-memory/recall.ts:34,173`) or single-step lexical `BM25F` score fell below recent turn items;
   - **Graph-Structural Relevance:** $r$ lies within $\le 3$ citation/entity hops of files, symbols, `Track` items, or `.h2a/` rules touched in the window's session activity (lift-over-background PPR $> 0$); and
   - **Clean Privacy Screening:** $r$ passes `ConfidentialityDenyListV1` (`D7`) and `PiiArmorStamp` (`D8`).

2. **Attention Boost & Exact Wire Shape in `engram_memory_context` (`Spec 2` Alignment):**
   - `MemoryContextPortV1.assembleContext` (`Spec 2 §3.1 :770`) assigns boosted permanent facts **`W_class = 2.10` and `D_recency = 1.00`** (cancelling 30-day recency decay while keeping ratified direct `owner_decisions` higher at `W_class = 2.50`), packs whole items inside the caller's token/byte budget (`Spec 2 §2.1 :192`), maps `trigger: row.projectedContextTrigger`, and emits exact closed Draft 2020-12 entries in `context_pack.mission_focus_context.dreaming_recalled_facts[]`:
     ```typescript
     // Exact Spec 2 §2.2 (:506-515) wire shape — zero schema drift
     {
       readonly id: string; // canonical accepted_current MemoryRecordV2.record_id
       readonly trigger: 'nightly' | 'weekly' | 'monthly' | 'mid-day' | 'context-saturation'; // = row.projectedContextTrigger
       readonly trust_tier: 'ratified_accepted_current';
       /** Present ONLY under 'authorized_d8' (contentAuthorized === true + D7/D8 pass); OMITTED under D6=refs! */
       readonly summary?: string;
       readonly file_refs: readonly ContextFileDisclosureRefV1[];
       readonly source_digest_sha256: Sha256Digest;
       readonly attention_score_q16: number; // 0..65535
     }
     ```
   - **Mandatory Privacy & Lifecycle Enforcement on Recall:**
     - **`D6=refs` (`Spec 2 §4.2 :858`, `R15-SEDIMENT.md:51`):** When `ModelContentAuthorizationPolicyV1.contentAuthorized !== true` (`'refs_only_d6'`), `summary` is **omitted** and `file_refs[]` carry only `(path_ref, content_fingerprint)` (`bounded_extract` omitted), incrementing `omitted_counts_by_reason.d6_content_withheld`.
     - **`D18=readonly` (`Spec 2 §4.4 :896`):** Sessions without a memory identity receive **zero** `dreaming_recalled_facts` (`mission_focus_context` omitted).
     - **Immediate Invalidation Cascade:** Transitioning $r$ (or any `DerivationLineageV1.source_record_ids` parent when `derivative_rule === 'make-ineligible'`, `engram-memory/contracts/index.ts:42,49`) to `tombstoned`, `withdrawn`, or `accepted_disputed` atomically removes its `DreamingRecallBoostIndexRowV1` and invalidates open `page_<48hex>` handles with `'STALE_PAGE'` (`Spec 2 :630`).

### 3.2 Four-Path Promotion Matrix (`D1=borne-review`, `D2=review`, `T-M-C`, `Point 3C`, `Point 5B`, `Point 6A`)

Every candidate produced by dreaming beyond recall-boost indexing of already-ratified records is governed by the strict promotion matrix below. **No dreamed candidate is ever self-applied by the dreaming agent (`D1`), no dreaming write ever overwrites or supersedes an incumbent `trackControlled: true` record (`Point 6A`, `S3-C-04`), no `D26` LLM-drafted candidate leaves shadow before `gate_state === 'threshold_met_eligible'`, and no mechanical or substantive spec/harness change bypasses review (`D2`).**

> **Why Cross-Session Proposals Use `POST /memory/v1/control/proposals` Rather Than `Spec 1` `POST /memory/v1/session-front/extractions` (`S3-C-08`):** `Spec 1 §1.2` (`:136`) and `§1.4` (`:416-417, 470`) require non-empty raw session `sourceEventRecordIds` on `POST /memory/v1/session-front/extractions`. Multi-session or multi-branch dreaming reconciliations and post-threshold promotions legitimately cite already-committed `MemoryRecordV2` IDs without a new raw session event; therefore Spec 3 defines the dedicated non-extraction submission route `POST /memory/v1/control/proposals` (paired with `Spec 1`'s read route `GET /memory/v1/control/proposals` and `Spec 6A`'s verdict route `POST /memory/v1/control/verdicts`) in §3.4 below.

| Candidate Kind | Gate 0 (`D26` Shadow Threshold) | Gate 1 (`D1=borne-review` & `Point 6A`) | Gate 2 (`T-M-C` / `D2=review` Sole Authority) | Wire Carrier Over `@sentropic/cluster-mesh` (`R12`, §3.4) | State Before Final Verdict |
|---|---|---|---|---|---|
| **1. Cross-session `engram` permanent lesson (`MemoryRecordV2`)** | Mandatory (`calibration_receipt_digest` verified `threshold_met_eligible`) | `promotion-third-party-review` (`Spec 0 :944`): captured as `pending` (`trackControlled: false`) with `DerivationLineageV1`; `dreamingServiceNhiId` **forbidden** from admitting | Admitted to `accepted_current` only by authorized third-party human/conductor via `MemoryPortV2.requestAdmission` | `POST /memory/v1/dreaming/proposals` (`MemoryPortV2.capture`, `purpose_ref: 'memory.dreaming.synthesis/v1'`) | `pending` (invisible to `M1` tools & `dreaming_recalled_facts`) |
| **2. Typed write or contradiction proposal in the `Track` domain (item, blocker, link, demand)** | Mandatory if LLM-drafted; `AssertionFamily` receipt if deterministic | `promotion-third-party-review` (`D1` + `Point 3C`) **+ `Point 6A` non-overwrite (`trackControlled: false` staged candidate; existing `trackControlled: true` records untouched)** | **Mandatory `Track` control (`verdictAuthority: 'track'`, `Point 3C`, `Point 5B`):** cites `TrackTemplateRef` (`lineage: 'track'`); `Track` alone validates & emits `TrackControlVerdict` | `POST /memory/v1/control/proposals` → `Track` `GET /memory/v1/control/proposals?status=proposed` (`Spec 1 :138`) → `POST /memory/v1/control/verdicts` (`Spec 6A :227`, `engram-track.md:107-149`) | `reviewStatus: 'proposed'` (exact 5-state union in `engram-track.md:83-88`; excluded from `domain_typed_envelopes`, `.graphify/graph.json`, & `.track/` PR slices) |
| **3. Change touching a `Track` template (`TrackTemplateEvolutionRequestV1`)** | Mandatory (`threshold_met_eligible`) | Third-party human/conductor review (`D1`) + `Point 6A` (`refusedConcurrentTemplates` / zero direct template mutation) | **`Point 3C` + `T-M-C`:** Request to **`Track`**, which **alone accepts it** (or routed first to **`engram`** if `proposed_change_kind === 'requires_new_metamodel_construct'`). Dreaming **never** calls `registerTrackTemplateVersion` | `POST /memory/v1/dreaming/template-requests` → `GET /memory/v1/dreaming/template-requests?status=requested` (`Track` inbox, `Lot 3-H2`) | `status: 'requested'` (existing `Track` template version remains sole active schema) |
| **4. `spec/` amendment or `h2a` harness / overlay proposal** | Mandatory (`threshold_met_eligible`) | Never applied by author (`D1`; `SpecAmendPayload.proposalRef` in `h2a:packages/track/src/model/spec-amend.ts:37-40` preserves machine provenance) | **`D2=review`:** Waits for explicit human/conductor review (even if purely mechanical). `lineage: 'h2a'` master harness accepted **only by `h2a`** (`Point 4B`); `.h2a/` overlay accepted **only in target repo** (`D31`) | `POST /memory/v1/dreaming/proposals` → `GET /memory/v1/dreaming/proposals?status=proposed` (`SpecAmendmentProposalV1` / `MasterHarnessAuditProposalV1` / `RepoOverlayEvolutionProposalV1`) | `status: 'proposed'` (zero direct file or Git branch write) |

### 3.3 Exact `TrackTemplateEvolutionRequestV1` Contract (`Point 3C`, `T-M-C`, `new` Lot `3-E3`)

```typescript
// new (Lot 3-E3): src/dreaming/promotion-contracts.ts
// (Placed in src/dreaming/ rather than engram-memory/ so engram-memory/** preserves strict one-way L0 import closure!)
import type { Digest, IdempotencyKey, Instant } from '../../engram-memory/contracts/index.js';
import type { OntologyTemplateEnvelopeRef } from '../metamodel/contracts.js'; // Spec 0 (Lot 0-E1)

export type TemplateEvolutionChangeKindV1 =
  | 'add_optional_attribute'
  | 'add_entity_type'
  | 'add_edge_kind'
  | 'tighten_invariant'
  | 'deprecate_attribute'
  | 'requires_new_metamodel_construct';

export interface TrackTemplateEvolutionRequestV1 {
  readonly schema_version: 1;
  readonly request_id: string;
  readonly idempotency_key: IdempotencyKey;
  readonly pass_idempotency_key: IdempotencyKey;
  /** Mandatory D26 proof that gate_state === 'threshold_met_eligible'; rejected fail-closed otherwise. */
  readonly calibration_receipt_digest: Digest;
  /**
   * Per Point 3C & PLAN_SPEC_ENGRAM_FRONT.md:242:
   * - 'track' when expressible in Spec 0's existing metamodel (Track alone accepts/rejects);
   * - 'engram' ONLY when proposed_change_kind === 'requires_new_metamodel_construct' (engram reviews metamodel first, D2=review, before Track may adopt).
   */
  readonly sole_accepting_authority: 'track' | 'engram'; // 'track' iff proposed_change_kind !== 'requires_new_metamodel_construct'
  readonly base_track_template?: OntologyTemplateEnvelopeRef & { readonly lineage: 'track' };
  readonly proposed_change_kind: TemplateEvolutionChangeKindV1;
  /** Structured diff descriptor (never an executable registration payload; dreaming holds zero 'lineage: track' signing/registration right). */
  readonly proposed_delta_summary: string;
  readonly cited_evidence_digests: readonly Digest[];
  readonly requested_at: Instant;
  readonly status: 'requested';
  readonly request_digest: Digest;
}
```
Runtime validation enforces the exact bi-implication `(proposed_change_kind === 'requires_new_metamodel_construct') <==> (sole_accepting_authority === 'engram')`.

### 3.4 Canonical Mesh HTTP Route Surface (`/memory/v1/dreaming/*` & `POST /memory/v1/control/proposals`, `S3-C-03`, `S3-C-08`)

Every HTTP endpoint introduced by Spec 3 is hosted inside `packages/cluster-mesh/src/compose/memory.ts` (`namespace: '/memory'`, `Lot 3-S1c`), exposed on `sentropic/api` (`/api/v1/memory/v1/*`) exclusively by appending to `MEMORY_PATHS` in `api/src/routes/namespaces/memory.ts:10-75` (`Lot 3-S3`), and mirrored into `Spec 6A §2.2` (`:219-230`) and [`spec/memory/contracts/engram-cluster-mesh.md`](memory/contracts/engram-cluster-mesh.md) in coordinated documentation `Lot 3-E5`:

| Mesh-Relative Endpoint (`/api/v1/memory/v1/*` on `api`) | Method & Body Ceiling | Request / Response Contract (`new` Lots `3-E1..3-E4`, `3-S1c`) | Required `H2AMandateBody.rights` (`Spec 6A :333`) & Auth Guard | Plane & Pre-`Spec 6B` Behavior (`S3-C-03`) |
|---|---|---|---|---|
| `/memory/v1/dreaming/triggers` | `POST` (`<= 65_536` B) | `DreamingTriggerDispatchRequestV1` (**forbids** `GraphSyncBarrierReceiptV1` in body) → `DreamingPassReceiptV1 \| DreamingPreconditionRefusal` | Enrolled local host attachment or signed `H2AEnvelope<H2AMandate>` with `'memory:dreaming:trigger'`; **`403 Forbidden` if `client_id === 'sentropic-mcp'`** | `embedded-local`: runs local `nightly`/`mid-day`/`context-saturation` immediately; `external-host`: reads barrier from `PostgresKernel` & submits to `WD-2` (`503 MISSING_GRAPH_SYNC_BARRIER` while `Spec 6B` absent). |
| `/memory/v1/control/proposals` *(write companion to `Spec 1 :138` `GET /memory/v1/control/proposals`)* | `POST` (`<= 262_144` B) | `ControlProposalSubmissionBatchV1` (cites committed `MemoryRecordV2` IDs in same `(tenantId, workspaceId)`, `trackControlled: false`) → `ControlProposalSubmissionReceiptV1` | Signed `H2AEnvelope<H2AMandate>` with `'memory:propose'` or `'memory:capture'`; enforces `Point 6A` (`409 TRACK_CONTROLLED_IMMUTABLE` on overwrite attempt) & `403` on `'sentropic-mcp'` | Active on `embedded-local` and `external-host`; rejects below-threshold LLM-drafted items (`403 shadow_threshold_not_met`). |
| `/memory/v1/dreaming/template-requests` | `POST` / `GET` (`<= 65_536` B) | `POST`: `TrackTemplateEvolutionRequestV1` → `TrackTemplateRequestReceiptV1`; `GET ?status=requested`: paginated list | `POST`: signed mandate with `'memory:dreaming:propose'` + verified `calibration_receipt_digest`; `GET`: `'track:control'` or `'engram:metamodel:review'`; `403` on `'sentropic-mcp'` | Active on both planes (`D26` `threshold_met_eligible` mandatory on `POST`; zero below-threshold shadow drafts ever returned on `GET`). |
| `/memory/v1/dreaming/proposals` | `POST` / `GET` (`<= 262_144` B) | `POST` / `GET ?status=proposed`: `SpecAmendmentProposalV1 \| MasterHarnessAuditProposalV1 \| RepoOverlayEvolutionProposalV1 \| PendingDreamedLessonV1` | `POST`: signed mandate with `'memory:dreaming:propose'` + verified `calibration_receipt_digest`; `GET`: `'h2a:control'` / `'track:control'` / `'memory:admit'`; `403` on `'sentropic-mcp'` | Local proposals active on `embedded-local`; `MasterHarnessAuditProposalV1` active on `external-host` only after `Spec 6B` (`503` while `Spec 6B` absent). |

- **Explicit HTTP `'sentropic-mcp'` Rejection Guard (`S3-C-03`, `S3-C-09`):** On `sentropic` `origin/main`, `DEC-116` (`api/src/services/mcp/client-policy.ts:3-50`) restricts only MCP tool and connector allowlists (`READ_ONLY_TOOL_ALLOWLIST`, `READ_ONLY_CONNECTOR_CAPABILITIES`) for `SENTROPIC_MCP_CLIENT_ID = 'sentropic-mcp'` and does **not** intercept HTTP `/api/v1/memory/*` (`api/src/routes/namespaces/memory.ts:10-75`). Therefore both `packages/cluster-mesh/src/compose/memory.ts` (`Lot 3-S1c`) and `api/src/routes/namespaces/memory.ts` (`Lot 3-S3`) install an explicit HTTP authentication middleware check returning `403 Forbidden` whenever a bearer/session token carries `client_id === 'sentropic-mcp'` (`SENTROPIC_MCP_CLIENT_ID`).

---

## 4. Cross-Repository Master Harness Audit (`comments-2026-11-08.md:24`, `Point 3C`, `Point 4B`, `D31`)

> **`[DEPENDS ON SPEC 6B]` Hard Dependency:** The cross-repository harness audit runs **exclusively remotely (`external-host`) via `@sentropic/cluster-mesh`'s `WD-2` mesh-native scheduler (`W-D5 B`, relayed by `sentropic`) after `Spec 6B` integral DB-cluster graph sync** has committed a valid `GraphSyncBarrierReceiptV1` inside `PostgresKernel` for each participating workspace within the tenant (`Point 3C`, `S3-C-01`, `S3-C-03`).

### 4.1 Unconditional Intra-Tenant Isolation, Per-Workspace `NeutralBoundScope` Binding, & Study Bounds (`D4`, `D6`–`D10`, `D33`, `S3-C-03`, `OQ-S3-2`)

Before any cross-repository aggregation or `@sentropic/llm-mesh` call executes on `external-host`, `dreaming-remote.ts` (`Lot 3-S2a`) and `runCrossRepoHarnessAuditV1` (`new`: `src/dreaming/harness-audit.ts`, Lot `3-E4`) enforce five unconditional fail-closed boundaries:

1. **Unconditional Intra-Tenant Isolation, Per-Workspace `NeutralBoundScope`, & `D9` Study Ceiling (`S3-C-03`, `OQ-S3-2`):**
   - **Absolute Intra-Tenant Invariant (Zero Exceptions):** `cohortWorkspace.tenantId === callerGrant.scope.tenantId` holds **unconditionally** — cross-tenant reads or aggregations are forbidden in all circumstances (no override flag, no exception).
   - **Per-Workspace Kernel Scope Binding (`pgScopeKey` Compatibility):** On `sentropic` `origin/main`, `packages/cluster-mesh/src/engram-memory/projection.ts:13-17` computes `pgScopeKey('engram-memory', context.grant.scope)` over a single `{ tenantId, workspaceId }` (`neutral-contract.ts:271-275`, `storage/sqlite/index.ts:186`) and `postgres-queries.ts:80-119` binds a single `scope_key` per query. Consequently, `dreaming-remote.ts` **never** executes cross-workspace SQL outside the kernel: it acquires a **distinct `NeutralBoundScope` (`NeutralModuleStorageBinding.bind(grant)`) per participating `workspaceId`**, verifying at each scope open a signed `H2AEnvelope<H2AMandate>` (`Spec 6A §2.3 :392`) carrying `D4` identity, explicit `D9` `crossRepoHarnessAuditOptIn` right, and `D10` transfer policy (`OQ-S3-2`, confirmed by `sentropic` `2026-11-15`), and reads each workspace's committed `Spec 6B` `GraphSyncBarrierReceiptV1` directly from `PostgresKernel`.
   - Enforces `D9` hard ceilings (`R15-SEDIMENT.md:54`): **`<= 30` workspaces** (`MAX_STUDY_PROJECTS = 30`) and **`<= 183` days (`6` months)** lookback (`MAX_STUDY_WINDOW_DAYS = 183`), operating strictly over a **read-only projection** that never writes back into any workspace's canonical memory journal.
2. **`D10=mandate` Raw Context Exclusion:**
   - Workstation-local `context_summary` / context logs remain excluded unless explicitly transferred under both the signed `h2a` mandate's transfer policy and the repository's policy (`R15-SEDIMENT.md:55`).
3. **Per-Source-Boundary `D7` `ConfidentialityDenyListV1` + `D8` `PiiArmorStamp` + `D33` Pseudonymization (`S3-C-03`):**
   - Inside each individual `workspaceId`'s `NeutralBoundScope` boundary—**before** any observation enters the in-memory cohort aggregator—every candidate matching that workspace's `ConfidentialityDenyListV1` (`D7`) is dropped, surviving structured telemetry passes `PiiArmorStamp` (`D8`), and workspace IDs, session IDs, principal IDs, and repository-local paths are replaced with domain-separated `HMAC-SHA256` pseudonyms (`D33`), projecting observations solely onto canonical `lineage: 'h2a'` identifiers (`ruleId`, `skillId`, `roleId`, `hookEventKind`, `gateErrorCode` from `sentropic.h2a-harness-and-skills`). No repository's proprietary file tree, symbol names, or business prose ever appears in a `MasterHarnessAuditProposalV1`.
4. **`D6=refs` Cohort-Intersection Rule:**
   - External-model prose synthesis is permitted **if and only if every workspace in the audit cohort** holds `ModelContentAuthorizationPolicyV1.contentAuthorized === true` for the target `modelEndpointClass`. If even one participating workspace is `'refs_only_d6'`, the entire cross-repo pass executes in `refs_only_d6` structural-telemetry mode (aggregating rule-ID override counts, gate failure frequencies, rework ratios, and fingerprints only, with zero prose excerpts sent to the model).
5. **Fail-Closed Quorum & Barrier Verification:**
   - If any selected workspace in the cohort lacks a valid `PostgresKernel` `GraphSyncBarrierReceiptV1` (`Spec 6B`), that workspace is excluded prior to cohort size evaluation; if fewer than `min_distinct_repos` (`3`) synced, mandate-verified intra-tenant workspaces remain, the pass exits cleanly with zero model calls.

### 4.2 Partitioning Rule: `h2a` Master Harness vs Per-Repository `.h2a/` Overlay

Grounded directly in `comments-2026-11-08.md:24` (`« typiquement le harnais h2a devrait être revue a l'oree d'une audition multi repo (dreaming agent) la ou l'évolution du harnais devrait être pour le repo lui meme »`), `Point 4B` (`OWNER-DECISIONS-2026-11-14.md:24`), `D31` (`R15-SEDIMENT.md:76`), and [`spec/memory/contracts/engram-h2a.md`](memory/contracts/engram-h2a.md) `:159-203`:

1. **Master Harness Proposals → Addressed Exclusively to `h2a` (`MasterHarnessAuditProposalV1`):**
   - **Cross-Repo Recurrence Quorum:** A friction, ambiguity, or repeated local-overlay override qualifies as a master-harness candidate **if and only if**:
     1. it references an existing `lineage: 'h2a'` rule, skill, role activity boundary, or hook contract in `sentropic.h2a-harness-and-skills` (or a cross-host gap observed across CLI hosts);
     2. it recurs independently across **`supporting_repo_count >= min_distinct_repos` (default `3` distinct workspaces**, `OQ-S3-2`); and
     3. its `D26` shadow calibration cohort (`target_domain: 'h2a-master-harness-audit'`) satisfies `gate_state === 'threshold_met_eligible'` (§2.3).
   - **Sole `h2a` Authorship & `D2=review` Gate:** Delivered over `@sentropic/cluster-mesh` to `h2a` (`Lot 3-H3`). Per `Point 4B` and `D2=review`, **`h2a` alone** reviews, edits, accepts, or rejects the proposal in the `h2a` repository and publishes any resulting `sentropic.h2a-harness-and-skills` template version. Dreaming holds zero write authority on `lineage: 'h2a'`.

2. **Repository-Specific Harness Evolution → Stays Inside Each Repository (`RepoOverlayEvolutionProposalV1`, `D31`):**
   - Any pattern observed in **fewer than `min_distinct_repos` repositories**, or bound to repository-local build/test/governance conventions—for example:
     - `sentropic`'s `Make-Only` + trailing `ENV=` + single-package scope rules;
     - `engram`'s `engram-memory` L0 neutrality closure (`tests/memory-neutrality.test.ts`);
     - `h2a`'s **`h2a`-only single-writer `Track` rule** (`Point 4B`, `engram-h2a.md:191-195`: *"Single-writer Track rule stays h2a-only; workspace `.h2a/` overlays (`D31`) express repo-specific policies"*)—
     **MUST NEVER** be emitted as a `MasterHarnessAuditProposalV1` to `h2a`.
   - Instead, single-repository dreaming (`nightly`, `weekly`, `monthly`) emits a workspace-scoped `RepoOverlayEvolutionProposalV1` targeting **only that repository's `.h2a/overlays/workspace.json`** (`D31`), gated on `D26` threshold + `D1=borne-review` + `D2=review` (landed solely through a human/conductor-reviewed Git PR in that repository, and mechanically rejected if it attempts to weaken an immutable `h2a` security invariant such as `H2AMandate` verification, `R12`, or `D6`/`D7`/`D8`).

---

## 5. Exclusive `@sentropic/llm-mesh` Model Routing, Budget Accounting, and Degraded Failure Modes (`Spec 1` & `Spec 6A` Alignment, `S3-C-05`, `S3-C-06`)

### 5.1 Grounded `@sentropic/llm-mesh` Contracts, Per-Call vs Per-Pass Budgets, & SDK Isolation (`S3-C-06`, `S3-C-09`)

Per `Spec 6A §2.5` (`:418-451`) and `Spec 1 §2.1` (`Lots 1-E2`/`1-E3`), **100% of language-model and evaluator invocations** performed by dormant dreaming (Tier-1 shadow drafting, Tier-2 independent verification, prospective confirmation matching, and post-`Spec 6B` cross-repo harness synthesis) route **exclusively through `@sentropic/llm-mesh` and `@sentropic/llm-mesh/decision`**:

1. **Strict Package, SDK, & API-Key Isolation (`G-FENCE` / L0 Neutrality, Depends on `Spec 1` `1-E2` & `1-E3`):**
   - `engram-memory/**` imports **zero** `@sentropic/*`, `@ai-sdk/*`, `ai`, `mistral-ocr`, provider SDKs, or `src/llm-execution.ts`, and never reads `process.env.*_API_KEY`.
   - `src/dreaming/*` in `@sentropic/engram` (delivered **after** `Spec 1` Lots `1-E2` and `1-E3` isolate `@ai-sdk/*` and `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `MISTRAL_API_KEY` / `COHERE_API_KEY` env reads in `src/llm-execution.ts:246-281,337-366`) defines only pure DTOs, deterministic graph selectors, and neutral port interfaces (`ShadowLessonDrafterPortV1`, `ShadowLessonVerifierPortV1`, `HarnessAuditSynthesizerPortV1`). `tests/memory-neutrality.test.ts` AST + packed-tarball guards enforce zero imports of `@ai-sdk/*`, `ai`, `mistral-ocr`, or `src/llm-execution.ts` and zero `process.env.*_API_KEY` accesses across **all** Spec 3 dreaming modules (`engram-memory/dreaming-*.ts` and `src/dreaming/*.ts`).
   - Concrete model execution lives **solely** in `packages/cluster-mesh/src/integrations/llm-mesh/memory-dreaming-llm.ts` (`new`, Lot `3-S1b`), consuming `LlmMesh.listModels` / `LlmMesh.generate` (`packages/llm-mesh/src/mesh.ts:51-52,157`), `RoutePlanner.listModels` / `RoutePlanner.plan` / `RoutePlanner.quote` (`packages/llm-mesh/src/routing-contracts.ts:251-256`), and topology-guarded `packages/cluster-mesh/src/integrations/llm-mesh/decision.ts:1-3` (`DecisionClient.decide`, `packages/llm-mesh/src/decision/receipt.ts:65-66`; loaded without `@sentropic/llm-gateway` per `packages/cluster-mesh/src/modules/topology-guard-llm-mesh.ts:1-5`).

2. **Grounded Per-Call Ceilings vs `new` Per-Pass Cumulative Budget Tracker (`S3-C-06`, `S3-C-09`):**
   - **Verified Subject Attribution (`WP16 D0`):** Every dreaming model call requires a `VerifiedRoutingSubject` (`packages/llm-mesh/src/routing-contracts.ts:13`) binding `(tenantId, workspaceId, principalId: dreamingServiceNhiId, purpose)` — ambient or unattributed background calls are refused before dispatch.
   - **Per-Call Ceilings (Existing on `origin/main`):**
     - Tier-1 `LlmMesh.generate` (`mesh.ts:52`) / `RoutePlanInput` (`routing-contracts.ts:54-77`) carries per-call token/unit bounds via `RouteUsageCeiling` (`{ inputTokens, outputTokens, reasoningTokens }` at `routing-contracts.ts:80-91` — note `@sentropic/llm-mesh` carries **no** USD budget field on `LlmMesh.generate` / `RoutePlanInput`, per `packages/llm-gateway/src/ports/budget.ts:5`: *"the gateway never reads pricing and mesh never reads budgets"*);
     - Tier-2 `DecisionClient.decide` (`decision/client.ts:358-515`) constructs a closed 8-key `DecisionRequest` (`decision/request.ts:40-75`, `validation.ts:11`: `['schemaVersion', 'evaluator', 'inputs', 'criterion', 'decision', 'policy', 'raw', 'correlationId']`) whose `policy.budget.maxCostMicroUsd` and `policy.timeoutMs` (`decision/request-policy.ts:3-10`) bound **that individual `DecisionRequest` call only**.
   - **Per-Pass Cumulative Budget Accumulator (`DreamingPassBudgetTracker`, `new` in `memory-dreaming-llm.ts`, Lot `3-S1b`):**
     - `memory-dreaming-llm.ts` maintains an explicit per-pass micro-USD accumulator initialized from `DreamingPassSchedulePolicyV1` (recommended defaults in `OQ-S3-1`: `'50000'` micro-USD for `mid-day` / `context-saturation`, `'250000'` for `nightly` / `weekly`, `'500000'` for `monthly` / `cross-repository`).
     - **Pre-Call Quote Check:** Before each Tier-1 or Tier-2 call, `memory-dreaming-llm.ts` invokes `RoutePlanner.quote?(input)` (`routing-contracts.ts:93-126,256`) and halts further generative calls for the pass (`DreamingPassOutcome = 'degraded_deterministic_only'`, §5.2) whenever `spentMicroUsd + quotedWorstCaseMicroUsd > passMaxCostMicroUsd` (or delegates admission to `BudgetAdmissionPort` at `packages/llm-gateway/src/ports/budget.ts:18-40` when `via: 'agent-gateway'`, `SPEC_EVOL_CHAT_MESH_PROPOSAL.md:373`).
     - **Post-Call Metering Settlement (`chat-mesh Lot C2a` Dependency):** Settled token and micro-USD cost is accumulated from `RouteMeteringSink` (**`new` in `@sentropic/llm-mesh` via `chat-mesh Lot C2a`**, `SPEC_EVOL_CHAT_MESH_PROPOSAL.md:380-382,629`; currently defined only in `packages/llm-gateway/src/route-flow-core.ts:49-51`) for Tier-1 calls and `DecisionReceipt.cost` (`packages/llm-mesh/src/decision/receipt.ts:17-24`) for Tier-2 calls, tagged with `(pass_idempotency_key, trigger, tier: 'shadow-drafter' | 'shadow-verifier' | 'harness-audit')`. If `chat-mesh Lot C2a` advances `@sentropic/llm-mesh` past `<0.39.0`, Lot `3-S1b` updates `LLM_MESH_RANGE` in `packages/cluster-mesh/src/modules/catalog.ts:19` and `packages/cluster-mesh/package.json:271` in lockstep.

3. **Pre-Serialization `D6=refs` & `D7`/`D8` Egress Firewall Inside `memory-dreaming-llm.ts`:**
   - Before serializing any prompt or `DecisionRequest.inputs` to `PreparedRouteAttempt` or `DecisionClient`, `memory-dreaming-llm.ts` resolves `ModelContentAuthorizationPolicyV1` (`Spec 2 §4.2 :835-846`) for `(tenantId, workspaceId, candidateEndpointClass)` and verifies the host `ConfidentialityDenyListV1` (`D7`) + `PiiArmorStamp` (`D8`) screening receipt.
   - When `contentAuthorized !== true` (`'refs_only_d6'`), all file bodies, turn excerpts, and prose fields are stripped before leaving `cluster-mesh`, transmitting only `(path_ref, content_fingerprint)` and canonical digests (`R15-SEDIMENT.md:51`).

### 5.2 Failure Modes, Timeouts, Budget Exhaustion, and Degraded Execution (`S3-C-05`)

When `@sentropic/llm-mesh` or `@sentropic/llm-mesh/decision` is unavailable, slow, single-family-constrained, or over budget (`RouteFailureClassification` `'network-unavailable' | 'provider-5xx' | 'rate-limited' | 'auth-failed' | 'reauth-required'` at `packages/llm-mesh/src/routing-contracts.ts:161-193`, or `DecisionConnectionFailure` `'MESH_UNAVAILABLE' | 'TRANSPORT_FAILED' | 'TIMEOUT' | 'CANCELLED'` at `packages/llm-mesh/src/decision/receipt.ts:69-77`), `dreaming-local.ts`, `dreaming-remote.ts`, and `memory-dreaming-llm.ts` enforce four normative invariants:

1. **Transactional Decoupling of Deterministic Indexing (`D23`) From Model Synthesis (`D26`):**
   - `DreamingWatermarkRowV1` persists **two independent cursors** per `(scope, triggerKind)`:
     - `deterministicThroughCursor`: committed immediately in Transaction 1 alongside deterministic `D23` `DreamingRecallBoostIndexRowV1` rows and deterministic L5 `createAssertionFamilyRegistryV1` reconciliation proposals (**zero** `@sentropic/llm-mesh` dependency). Offline or degraded workstations (`D17=degraded`) therefore continue recalling forgotten permanent facts (`D23`) even when `@sentropic/llm-mesh` or network connectivity is completely down.
     - `modelSynthesisThroughCursor`: advanced in Transaction 2 **if and only if** the `D26` shadow-drafting / verification stage (or cross-repo harness synthesis) completes cleanly or has zero eligible inputs without model/budget failure.
2. **`committed === true` Non-Retry & Budget Accounting (`Zero Double Billing`):**
   - Per `packages/llm-mesh/src/routing-contracts.ts:178-193` (*"A committed failure must never be retried implicitly"*), whenever a Tier-1 or Tier-2 error carries `RouteFailureClassification.committed === true`, `memory-dreaming-llm.ts` charges the estimated/reported cost against `DreamingPassBudgetTracker` and **never** auto-retries that candidate in the same pass.
3. **Bounded Single Retry Honoring `retryAfterMs` & `'degraded_deterministic_only'` Pass Outcome:**
   - On uncommitted (`committed === false`) transient failures (`'rate-limited'`, `'network-unavailable'`, `'provider-5xx'`, `'MESH_UNAVAILABLE'`, `'TRANSPORT_FAILED'`, or `'TIMEOUT'`), `memory-dreaming-llm.ts` honors `retryAfterMs` (`routing-contracts.ts:175`, `decision/client.ts:448`, capped by pass deadline) and performs **at most `1` intra-pass retry**.
   - On `'auth-failed'`, `'reauth-required'`, empty `listModels`, pass budget exhaustion, or second uncommitted failure, the runner aborts further model calls, leaves `modelSynthesisThroughCursor` at its prior cursor (recording `DreamingPassOutcome = 'degraded_deterministic_only'` rather than terminal `'completed'`), and resumes the un-synthesized `(modelSynthesisThroughCursor, currentCursor]` slice cleanly on the next scheduled cycle without losing `D26` coverage or causing retry storms.
4. **Explicit Single-Family Quarantine (`'pending_independent_family'`):**
   - When `listModels` exposes only one canonical model family (`resolveCanonicalModelFamily`), Tier-1 drafts (if produced) are stored in shadow quarantine with `verification_status: 'pending_independent_family'` (never promoted, never self-verified by the drafting family, and never blocking `deterministicThroughCursor`), awaiting Tier-2 verification once an independent model family becomes available.

---

## 6. Exact Specification & Plan Amendments (`Before → After` Deltas)

> **Rule Reminder:** Target files [`spec/SPEC_MEMORY_FINALIZATION.md`](SPEC_MEMORY_FINALIZATION.md), [`plan/08-BRANCH_MEMORY_FINALIZATION.md`](../plan/08-BRANCH_MEMORY_FINALIZATION.md), [`spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md`](SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md), and [`spec/memory/contracts/engram-cluster-mesh.md`](memory/contracts/engram-cluster-mesh.md) are **not modified** on disk in this lot. Per `D2=review`, `Spec 2 OQ-S2-5` (`SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md:1615-1616`), and `S3-C-08`, these exact line-anchored deltas apply in coordinated mechanical documentation fold Lot `3-E5` **after** `Spec 2` Lot `2-E5` and after Spec 3 completes adversarial review.

### 6.1 Incremental Amendment to `spec/SPEC_MEMORY_FINALIZATION.md` (`§0–§2`, rebased after `Spec 2 §6.2` `Lot 2-E5`, `S3-C-08`)

> **Incremental Rebase Note (`S3-C-08`, `OQ-S2-5`):** On disk at `2856a6cc` / `fc0437b2`, `spec/SPEC_MEMORY_FINALIZATION.md:1-60` is still at its pre-fold `c96fc01e` state, which `Spec 2 §6.2` (`SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md:1416-1542`, `Lot 2-E5`) amends first. To eliminate any merge conflict or overwrite of `Spec 2`'s `E6`, `R15-C` (`engram-memory/recall.ts:27-160`), or `2-E3` neutrality note, `Lot 2-E5` is an explicit prerequisite of `Lot 3-E5` (§7.1), **`Before`** below quotes the exact post-`Spec 2 §6.2` (`:1482-1541`) state byte-for-byte, and **`After`** applies Spec 3's purely additive `E7`, `R15-D`, and `3-E1..3-E4` neutrality guards on top.

**Before (post-`Spec 2 §6.2` `Lot 2-E5` state of `spec/SPEC_MEMORY_FINALIZATION.md` `§0–§2`, `SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md:1482-1541`):**
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

**After (incremental Spec 3 delta in `Lot 3-E5` on top of `Spec 2 §6.2`, preserving `E6`, `R15-C`, and `2-E3` untouched while adding `E7`, `R15-D`, and `3-E1..3-E4`):**
```markdown
# SPEC — Memory engine finalization (`engram-memory`)

**Date:** 2026-10-06 (closure addendum 2026-10-18, §9; R15/R16 post-`0.28.0` contextual-graph & dormant-dreaming evolution cross-reference 2026-11-15)
**Status:** proposed, amended after review rounds 1 (§7) and 2 (§8) — for conductor review. This document authorizes no merge, push, tag, publication, migration, or go-live. The §9 addendum records delivered evidence and owner decisions only; it authorizes nothing further. Post-`0.20.0` R15/R16 architectural extensions are specified in `spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md` (Spec 0), `spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md` (Spec 6A), `spec/SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md` (Spec 1), `spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md` (Spec 2), and `spec/SPEC_ENGRAM_DORMANT_DREAMING_SYNTHESIS.md` (Spec 3).
**Base:** `origin/main` `c96fc01e` (package `@sentropic/engram` 0.19.1), branch `feat/memory-finalization`. Closure baseline: `origin/main` `a88375f015104dee1dc0331530d878959133c840` (PR #398); engram 0.20.0 published from `af60f9d7` (tag `v0.20.0`). R15/R16 design baseline: `docs/memory-r15-sediment` (`@sentropic/engram` 0.28.0, `d5eb6171` / base parent `f0c2928e`).
**Parent (normative):** `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`, cited below as **EVOL** with its line numbers, together with `spec/memory/R15-SEDIMENT.md` (`D1`–`D34`) and `spec/memory/OWNER-DECISIONS-2026-11-14.md` (`Points 1B–6A`, `T-M-C`) for post-`0.20.0` engine extensions. This document is a delta: every contract change it proposes lands in EVOL through the lot that implements it.
**Plan:** `plan/08-BRANCH_MEMORY_FINALIZATION.md` (lots `F0`–`F14`, triage lots `X*`, MCP delivery chain `MCP-L4`–`MCP-L8`) and `spec/memory/PLAN_SPEC_ENGRAM_FRONT.md` (Specs `0`, `6A`, `1`–`5`, `6B`).
**Registries corrected by this change:** `BRANCH.md` (R2-f, R2-b, R2-c) and `plan/07-BRANCH_AGENT_MEMORY_SUBSTRATE.md` (Lot 0) — see §3.8.
**Excluded (at `0.20.0` closure):** Postgres go-live and `external-host` activation (subsequently governed by Spec 6A / Spec 6B / Spec 3 `Point 3C`); publication of `engram-memory` (release decision).

## 0. Evidence and vocabulary

Evidence used for the `0.20.0` closure (`E1`–`E5`), preserved unchanged, plus `E6`–`E7` for the R15/R16 contextual-graph and dormant-dreaming engine extensions:

| Id | Source | Notes |
|---|---|---|
| E1 | code at `c96fc01e`, cited `path:line` | read directly in this worktree |
| E2 | GitHub Actions run `37177756444` (TypeScript CI, `main`, merge of #342, 2026-10-04) | jobs `test (20)` `111363850978`, `test (22)` `111363851095`, `test (24)` `111363851159`: all `success`; per-file outcomes below are quoted from the Node 24 job log, re-fetched on 2026-10-06 with `gh api repos/rhanka/engram/actions/jobs/111363851159/logs` and re-checked against it |
| E3 | npm registry metadata, queried 2026-10-06 | `npm view fs-ext@2.1.1`, `npm view better-sqlite3@12.11.1` |
| E4 | `tsc -p engram-memory/tsconfig.json --listFilesOnly` (tsc 5.4.5, nothing emitted) | the repository pins TypeScript ^6.0.3; `include` semantics are assumed unchanged (unverified for 6.x) |
| E5 | agent/conductor session logs on this workstation, outside the repository | used only to locate the definition of "image ABI" (§3.6) |
| E6 | R15/R16 settled ledger (`spec/memory/R15-SEDIMENT.md`, `spec/memory/OWNER-DECISIONS-2026-11-14.md`) and `@sentropic/engram` `0.28.0` code at `d5eb6171` | governs post-`0.20.0` contextual graph recall (`D19`, `D20`, `D22`, `D23`), sensitivity-triaged model ranking (`D7`), and default-disabled seventh MCP tool `engram_memory_context` (`Point 2B`, `Spec 2`) |
| E7 | R15/R16 settled dreaming decisions (`D1`, `D2`, `D6`, `D10`, `D19`, `D23`, `D25`, `D26`, `Point 3C`, `Point 6A`) and `@sentropic/engram` `0.28.0` code at base parent `f0c2928e` (`engram-memory/recall.ts:34,38,44`, `engram-memory/assertion-family-registry.ts:267-365`, `engram-live/scheduler.ts:86-337`) | governs post-`0.28.0` dormant dreaming synthesis (`Spec 3`): local passes (`nightly`, `mid-day`, `context-saturation`), post-`Spec 6B` mesh-scheduled remote passes (`weekly`, `monthly`, `cross-repository` harness audit, `W-D5 B` relayed by `sentropic`), `D26` two-tier shadow calibration (`LCB_0.95 >= 0.85`), forgotten-permanent-fact recall boosts (`D23`), and `D1`/`D2`/`T-M-C`/`Point 6A` gates |

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
| R15-D | Post-`0.28.0` dormant dreaming consolidation (`D19`, `D25`), two-tier shadow lessons (`D26`), & forgotten-permanent-fact recall (`D23`) | `PROPOSED` on base parent `f0c2928e` (zero dreaming, shadow-lesson, or memory-consolidation scheduler exists in `engram-memory/` or `src/`; 30-day recency half-life in `engram-memory/recall.ts:34` decays older permanent facts unless boosted) | add L0-neutral local dreaming triggers (`nightly`, `mid-day`, `context-saturation`) + offline/remote catch-up coalescing & post-`Spec 6B` `WD-2` mesh-scheduled remote passes (`weekly`, `monthly`, `cross-repository` harness audit), `D26` two-tier shadow drafter + independent `@sentropic/llm-mesh/decision` verifier gated on measured Wilson `LCB_0.95 >= 0.85`, `D23` `dreaming_recalled_facts` boost, and `D1`/`D2`/`T-M-C`/`Point 3C`/`Point 6A` gates | `3-E1`–`3-E5` (`Spec 3` §7) | R15 `D1`, `D2`, `D6`, `D9`, `D10`, `D19`, `D23`, `D25`, `D26`; `Point 3C`, `Point 6A`, `T-M-C` |

## 2. CI evidence baseline (E2, Node 24 job on `c96fc01e`; post-`0.28.0` Spec 2 & Spec 3 RED/GREEN suites in `Spec 2` §7 & `Spec 3` §7)

| File | Outcome on `c96fc01e` |
|---|---|
| `tests/memory-neutrality.test.ts` | pass — `2 tests \| 1 todo` (one real test + one `it.todo`; extended in `2-E3` to guard neutral reranker port injection in `engram-memory` for `D7`, and in `3-E1`–`3-E4` to guard zero `@sentropic/*`, `@ai-sdk/*`, `ai`, `src/llm-execution.ts`, or `*_API_KEY` imports across Spec 3 dreaming modules) |
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

### 6.2 Amendment to `plan/08-BRANCH_MEMORY_FINALIZATION.md` (lines `198–222`)

**Before (`plan/08-BRANCH_MEMORY_FINALIZATION.md:198-222`):**
```markdown
### F13 closure addendum — 0.20.0 delivered, MCP chain remaining (2026-10-18)

This addendum records evidence and owner decisions only. It introduces no new design rule. Sources: owner journal `/home/antoinefa/src/graphify/.graphify/scratch/design/memory-finalization/PIPELINE.md` (entries marked `OWNER` / `DÉCISION OWNER`), merged pull requests and commits on `origin/main`, `CHANGELOG.md` 0.20.0, tag `v0.20.0`, and `spec/SPEC_MEMORY_MCP_V2.md` (lots MCP-L0 through MCP-L10).

**Delivered in `@sentropic/engram` 0.20.0 (option B).** Owner decision 2026-10-17 (`PIPELINE.md` 15:05, `DÉCISION OWNER`): 0.20.0 ships without the MCP adapter; the adapter (MCP-L4) follows in a later release after MCP-L5 qualification. The 0.20.0 artifact therefore delivers the memory substrate and six in-process tools, disabled by default, with no MCP provider, loader, or registry entry (`CHANGELOG.md` 0.20.0; `package.json` export `./memory-tools`). Publication evidence: PR #396 (`af60f9d7`, `chore(release): prepare 0.20.0 version metadata and changelog` `1922b539`), tag `v0.20.0` on `af60f9d7`, CI trusted-publisher publication with Sigstore provenance, and post-publication install check green (`PIPELINE.md` 2026-10-18 02:56–04:02; `CHANGELOG.md` 0.20.0 date 2026-10-18). Delivered lots on `main`:

- MCP-L0 contracts — PR #387 (`3eff28a8`, six tool contracts, closed schemas, total error mapping) and MCP-L0b contract hardening — PR #398 (`a88375f0`: inherited-property refusal in closed schema validation `984e1de5`, nested JSON Schema dialect `e03fa41d`, canonical MCP envelope comparison `ba5492bd`, exact SemVer entry/manifest versions `b2509314`, connector instance in catalog cache key `77605c90`, regression coverage `e6d1668f`). Gate suites: `tests/memory-evol-declarations.test.ts`, `tests/memory-mcp-l0-contract.test.ts`.
- MCP-L1 reads — PR #392 (`9adffa0c`: scoped current-read facets `acb8b756`, guarded in-process search/get tools `a9515da7`, neutral projection error preservation `648f1a53`, get authorization phases `5525e748`, search envelope byte reservation `915ca1a7`).
- MCP-L2 writes — PR #394 (`bc4363bc`: disabled-by-default in-process write tools with bound confirmation `12bb692a`, file-backed reference durable host ports `0cb13ccd`, durable admission replay proof `0b98945b`, canonical-outcome recovery before first-effect guards `79b44c90`/`3b09059e`, first-effect vs replay distinction `5cbb55fc`, packed-bundle root fix `f00d1e1e`).
- D3/D10 restoration (filtered shared graph) — PR #393 (`02ac925c`: EVOL D10 restoration `72472d20`, MCP v2 oracle alignment `e5303409`, filtered projection contract in topology `b3fce738`, D10 literal/guard refresh `d2efd5fd`). Conformance source: initial D3/D10 at `7bc9baec`; owner decisions 2026-10-17 (`PIPELINE.md` 19:58 `DÉCISION OWNER` “Un seul graphe, filtré”, 20:02 baseline check, 21:02 Argon review confirming conformance to initial D3/D10). `graph.json` carries only filtered memory projection envelopes for `accepted_current` records with `projection_eligible === true` (EVOL D3, D10 restoration note).
- MCP-L3 filtered projection — PR #395 (`9f03ebf1`: pure filtered projection assembly `f18d9b77`, memory node wiring and reconciliation `2ac50f0a`, module rename `72b0a7fe`, freshness/edge-aware ceiling/shrink guards `529b7193`, mandatory freshness gate and real ceiling bytes `d0aa14d8`, reloaded-graph freshness `15b0c34b`, graph-JSON ceiling measurement `17b7dcf4`, oversized-row refusal before export `cf243763`).

The substrate exit table below (baseline `545a57b8`, run `38949383331`) remains the EVOL §10 evidence for the memory engine. It is not re-based to a new CI run by this addendum; a new run on the pushed closure commits is still required (see G3 in `BRANCH.md`).

**E2 return obligation (co-accepted L5 pre-candidate handoff).** Before Sentropic Lot 2, return “E2, the packed real L2 canonical engine/fenced replay artifact with its B-reference provenance, bound with P1 in `lot2-manifest.json`.” Producer: `scripts/memory-mcp-e2-manifest.mjs`; it takes the exact published `@sentropic/engram@0.20.0` tarball, checks its pinned npm integrity, and retains the `v0.20.0` / `af60f9d7` Sigstore provenance. A final manifest requires both `--p1-manifest` and `--p1-sha256`; source, artifacts and the closed contract inventory come from those verified P1 bytes. Until P1 exists, `--pre-binding` emits only `lot2-manifest.pre-binding.json`. This records the delivery obligation and tooling, not E2 acceptance or L5 qualification.

**Remaining — MCP gateway and downstream chain (not delivered, not counted done).** Lot identifiers and dependencies are those of `spec/SPEC_MEMORY_MCP_V2.md` § Lots (`MCP-L0 → MCP-L1 + MCP-L2 + MCP-L5 → MCP-L4`; `MCP-L4 + MCP-L5 → MCP-L6 → MCP-L7 → MCP-L8`; then MCP-L9 qualification and MCP-L10 publication for the MCP chain):

- **MCP-L4 — Standard memory provider (engram).** Deliverable: `src/mcp/memory/*` MCP provider, optional product export, six tools over MCP transport, total result/error mapping, cancellation, host-managed page handles, native dependency isolation. Depends on MCP-L1, MCP-L2, and the qualified MCP-L5 contract. Status: `missing` in 0.20.0 by owner option B; no MCP adapter ships in 0.20.0.
- **MCP-L5 — Production Sentropic mutation and execution path (Sentropic).** Deliverable: frozen, production-qualified mutation subset, production broker, verified context, idempotency/elicitation forwarding, policy enforcement, catalog metadata preservation. Depends on MCP-L0 and on the Sentropic pre-candidate P1 (lot 1, after the Sentropic chain #679 → #685 → R2/R7a/R3 is published; `PIPELINE.md` l.362, 2026-10-18 03:55); runs alongside MCP-L1–MCP-L3. Status: `missing`; MCP-L4 cannot exit before MCP-L5 establishes its qualified contract (`SPEC_MEMORY_MCP_V2.md` dependency note).
- **MCP-L6 — Sentropic registry re-exposure (Sentropic, using the engram provider).** Deliverable: Sentropic-owned embedded provider/store, tenant-aware `registerMcpSource`, selected agent/tool policy, executable handlers, collision and disable behavior. Depends on MCP-L4 and MCP-L5. Status: `missing`. This is the registry re-exposure the owner decision of 2026-10-17 requires (Sentropic-standard MCP tools re-exposed in the registry).
- **MCP-L7 — Public mesh delivery and legacy retirement (Sentropic).** Deliverable: memory leaf, loader, composition, metadata, public MCP bindings, dependency preflight, `/memory` disabled helper, retirement of the legacy shadow protocol. Depends on MCP-L4–MCP-L6 and candidate package artifacts. Status: `missing`.
- **MCP-L8 — Voluntary agent-host consumption (h2a).** Deliverable: persisted opt-in, selected agents/tools, caller/scope/policy/custody/administration bindings, embedded-local composition, legacy client cutover, mesh pin updates. Depends on MCP-L7. Status: `missing`. Inheritance is voluntary and default-disabled; a fresh h2a exposes no memory and triggers no memory native build (`SPEC_MEMORY_MCP_V2.md` MCP-L8 exit criterion). This is the voluntary host inheritance the owner decision of 2026-10-17 requires.

MCP-L9 (cross-repository qualification) and MCP-L10 (publication and closure for the MCP chain) follow MCP-L1–MCP-L8 and are likewise `missing`. The F13 independent-review and owner-gate checkboxes above stay open for this chain.
```

**After (`plan/08-BRANCH_MEMORY_FINALIZATION.md:198-222` amended per `PLAN_SPEC_ENGRAM_FRONT.md:203` to append the post-`0.28.0` R15/R16 sequencing note linking R15 dreaming lots after `MCP-L4`–`MCP-L8`):**
```markdown
### F13 closure addendum — 0.20.0 delivered, MCP chain remaining (2026-10-18)

This addendum records evidence and owner decisions only. It introduces no new design rule. Sources: owner journal `/home/antoinefa/src/graphify/.graphify/scratch/design/memory-finalization/PIPELINE.md` (entries marked `OWNER` / `DÉCISION OWNER`), merged pull requests and commits on `origin/main`, `CHANGELOG.md` 0.20.0, tag `v0.20.0`, and `spec/SPEC_MEMORY_MCP_V2.md` (lots MCP-L0 through MCP-L10).

**Delivered in `@sentropic/engram` 0.20.0 (option B).** Owner decision 2026-10-17 (`PIPELINE.md` 15:05, `DÉCISION OWNER`): 0.20.0 ships without the MCP adapter; the adapter (MCP-L4) follows in a later release after MCP-L5 qualification. The 0.20.0 artifact therefore delivers the memory substrate and six in-process tools, disabled by default, with no MCP provider, loader, or registry entry (`CHANGELOG.md` 0.20.0; `package.json` export `./memory-tools`). Publication evidence: PR #396 (`af60f9d7`, `chore(release): prepare 0.20.0 version metadata and changelog` `1922b539`), tag `v0.20.0` on `af60f9d7`, CI trusted-publisher publication with Sigstore provenance, and post-publication install check green (`PIPELINE.md` 2026-10-18 02:56–04:02; `CHANGELOG.md` 0.20.0 date 2026-10-18). Delivered lots on `main`:

- MCP-L0 contracts — PR #387 (`3eff28a8`, six tool contracts, closed schemas, total error mapping) and MCP-L0b contract hardening — PR #398 (`a88375f0`: inherited-property refusal in closed schema validation `984e1de5`, nested JSON Schema dialect `e03fa41d`, canonical MCP envelope comparison `ba5492bd`, exact SemVer entry/manifest versions `b2509314`, connector instance in catalog cache key `77605c90`, regression coverage `e6d1668f`). Gate suites: `tests/memory-evol-declarations.test.ts`, `tests/memory-mcp-l0-contract.test.ts`.
- MCP-L1 reads — PR #392 (`9adffa0c`: scoped current-read facets `acb8b756`, guarded in-process search/get tools `a9515da7`, neutral projection error preservation `648f1a53`, get authorization phases `5525e748`, search envelope byte reservation `915ca1a7`).
- MCP-L2 writes — PR #394 (`bc4363bc`: disabled-by-default in-process write tools with bound confirmation `12bb692a`, file-backed reference durable host ports `0cb13ccd`, durable admission replay proof `0b98945b`, canonical-outcome recovery before first-effect guards `79b44c90`/`3b09059e`, first-effect vs replay distinction `5cbb55fc`, packed-bundle root fix `f00d1e1e`).
- D3/D10 restoration (filtered shared graph) — PR #393 (`02ac925c`: EVOL D10 restoration `72472d20`, MCP v2 oracle alignment `e5303409`, filtered projection contract in topology `b3fce738`, D10 literal/guard refresh `d2efd5fd`). Conformance source: initial D3/D10 at `7bc9baec`; owner decisions 2026-10-17 (`PIPELINE.md` 19:58 `DÉCISION OWNER` “Un seul graphe, filtré”, 20:02 baseline check, 21:02 Argon review confirming conformance to initial D3/D10). `graph.json` carries only filtered memory projection envelopes for `accepted_current` records with `projection_eligible === true` (EVOL D3, D10 restoration note).
- MCP-L3 filtered projection — PR #395 (`9f03ebf1`: pure filtered projection assembly `f18d9b77`, memory node wiring and reconciliation `2ac50f0a`, module rename `72b0a7fe`, freshness/edge-aware ceiling/shrink guards `529b7193`, mandatory freshness gate and real ceiling bytes `d0aa14d8`, reloaded-graph freshness `15b0c34b`, graph-JSON ceiling measurement `17b7dcf4`, oversized-row refusal before export `cf243763`).

The substrate exit table below (baseline `545a57b8`, run `38949383331`) remains the EVOL §10 evidence for the memory engine. It is not re-based to a new CI run by this addendum; a new run on the pushed closure commits is still required (see G3 in `BRANCH.md`).

**E2 return obligation (co-accepted L5 pre-candidate handoff).** Before Sentropic Lot 2, return “E2, the packed real L2 canonical engine/fenced replay artifact with its B-reference provenance, bound with P1 in `lot2-manifest.json`.” Producer: `scripts/memory-mcp-e2-manifest.mjs`; it takes the exact published `@sentropic/engram@0.20.0` tarball, checks its pinned npm integrity, and retains the `v0.20.0` / `af60f9d7` Sigstore provenance. A final manifest requires both `--p1-manifest` and `--p1-sha256`; source, artifacts and the closed contract inventory come from those verified P1 bytes. Until P1 exists, `--pre-binding` emits only `lot2-manifest.pre-binding.json`. This records the delivery obligation and tooling, not E2 acceptance or L5 qualification.

**Remaining — MCP gateway and downstream chain (not delivered, not counted done).** Lot identifiers and dependencies are those of `spec/SPEC_MEMORY_MCP_V2.md` § Lots (`MCP-L0 → MCP-L1 + MCP-L2 + MCP-L5 → MCP-L4`; `MCP-L4 + MCP-L5 → MCP-L6 → MCP-L7 → MCP-L8`; then MCP-L9 qualification and MCP-L10 publication for the MCP chain):

- **MCP-L4 — Standard memory provider (engram).** Deliverable: `src/mcp/memory/*` MCP provider, optional product export, six tools over MCP transport, total result/error mapping, cancellation, host-managed page handles, native dependency isolation. Depends on MCP-L1, MCP-L2, and the qualified MCP-L5 contract. Status: `missing` in 0.20.0 by owner option B; no MCP adapter ships in 0.20.0.
- **MCP-L5 — Production Sentropic mutation and execution path (Sentropic).** Deliverable: frozen, production-qualified mutation subset, production broker, verified context, idempotency/elicitation forwarding, policy enforcement, catalog metadata preservation. Depends on MCP-L0 and on the Sentropic pre-candidate P1 (lot 1, after the Sentropic chain #679 → #685 → R2/R7a/R3 is published; `PIPELINE.md` l.362, 2026-10-18 03:55); runs alongside MCP-L1–MCP-L3. Status: `missing`; MCP-L4 cannot exit before MCP-L5 establishes its qualified contract (`SPEC_MEMORY_MCP_V2.md` dependency note).
- **MCP-L6 — Sentropic registry re-exposure (Sentropic, using the engram provider).** Deliverable: Sentropic-owned embedded provider/store, tenant-aware `registerMcpSource`, selected agent/tool policy, executable handlers, collision and disable behavior. Depends on MCP-L4 and MCP-L5. Status: `missing`. This is the registry re-exposure the owner decision of 2026-10-17 requires (Sentropic-standard MCP tools re-exposed in the registry).
- **MCP-L7 — Public mesh delivery and legacy retirement (Sentropic).** Deliverable: memory leaf, loader, composition, metadata, public MCP bindings, dependency preflight, `/memory` disabled helper, retirement of the legacy shadow protocol. Depends on MCP-L4–MCP-L6 and candidate package artifacts. Status: `missing`.
- **MCP-L8 — Voluntary agent-host consumption (h2a).** Deliverable: persisted opt-in, selected agents/tools, caller/scope/policy/custody/administration bindings, embedded-local composition, legacy client cutover, mesh pin updates. Depends on MCP-L7. Status: `missing`. Inheritance is voluntary and default-disabled; a fresh h2a exposes no memory and triggers no memory native build (`SPEC_MEMORY_MCP_V2.md` MCP-L8 exit criterion). This is the voluntary host inheritance the owner decision of 2026-10-17 requires.

MCP-L9 (cross-repository qualification) and MCP-L10 (publication and closure for the MCP chain) follow MCP-L1–MCP-L8 and are likewise `missing`. The F13 independent-review and owner-gate checkboxes above stay open for this chain.

**Post-`0.28.0` R15/R16 sequencing note (2026-11-15, `spec/memory/PLAN_SPEC_ENGRAM_FRONT.md` & `spec/SPEC_ENGRAM_DORMANT_DREAMING_SYNTHESIS.md` §7).** Following the `@sentropic/engram` `0.22.0`–`0.28.0` `MCP-L4`–`MCP-L8` baseline, R15/R16 memory-front lots sequence strictly after `MCP-L4`–`MCP-L8`: `Spec 0` (metamodel & lineages) + `Spec 6A` (`@sentropic/cluster-mesh` `R12` hop, `6A-S0b` durable SQLite outbox/fencing, `6A-S1a` `memory-binding-v2`, `Point 6A` non-overwrite guard, `@sentropic/llm-mesh` routing) + `chat-mesh B1/B2/C2a` → `Spec 1` (session front & `1-E2`/`1-E3` SDK isolation) + `Spec 2` (`engram_memory_context` `v2` seventh tool) → **`Spec 3` local dormant dreaming & HTTP route lots (`3-E1`–`3-E4`, `3-S1a`–`3-S1c`, `3-S3`, `3-H1`–`3-H2`: `nightly`, `mid-day`, `context-saturation`, `D26` two-tier shadow calibration, `D23` forgotten-permanent-fact recall boosts, and `D1`/`D2`/`T-M-C`/`Point 6A` gates)** → `Spec 6B` (integral DB-cluster sync, `D24=integral`) + `WD-2` (`cluster-mesh` mesh-native scheduler per `W-D5 B`, relayed by `sentropic`) → **`Spec 3` remote dreaming & cross-repository master-harness audit lots (`3-S2a`–`3-S2b`, `3-H3`: `weekly`, `monthly`, `cross-repository` post-sync passes, `Point 3C`, zero `api/` cron)** and incremental doc fold (`2-E5` → `3-E5`). Nothing in this note alters historical `0.20.0` evidence.
```

---

## 7. Small Test-First Implementation Lots per Repository

Every lot follows strict `RED → GREEN → REFACTOR` discipline, stays atomic (`<= ~150 LOC` per commit in `sentropic` per `rules/MASTER.md:51` with `packages/*` strictly separated from `api/`; `<= ~150–250 LOC` in `engram` and `h2a`), and executes each repository's verified test gates.

### 7.1 `engram` Repository Lots (`vitest` + `tsc --noEmit`)

> **Upstream Prerequisites & Publication Gate Before `sentropic` Lots `3-S1a..3-S2b` (`S3-C-06`, `S3-C-07`, `S3-C-08`):** `Spec 1` Lots **`1-E2` and `1-E3`** (`Spec 1 :574-584, 1664-1665`, isolating `@ai-sdk/*`, `ai`, `mistral-ocr`, and `*_API_KEY` env reads out of library subpaths) MUST land before `3-E2`–`3-E4`; `Spec 2` Lot **`2-E5`** (`SPEC_MEMORY_FINALIZATION.md` `§0–§2` contextual-graph delta) MUST land before `3-E5`; and `@sentropic/engram` built from `3-E1..3-E4` MUST be published / tarball-pinned before `sentropic` cold-workspace lots `3-S1a..3-S1c` and `3-S2a..3-S2b` execute (`Makefile:1282-1289, 1318`).

| Lot | Scope, Dependencies, & Target Files (`new` / `PROPOSED` explicitly marked) | First Failing (`RED`) Tests Written Before Implementation | Verification Command |
|---|---|---|---|
| **`3-E1`** | **L0-Neutral Dreaming Contracts, Local/Remote Trigger Predicates, Coalesced Local+Remote Catch-Up, Bounded `late-sync-amendment`, & 3-Layer Idempotency (`D19`, `D25`, `Point 3C`):** `new` `engram-memory/dreaming-contracts.ts`, `new` `engram-memory/dreaming-triggers.ts`, `tests/memory-neutrality.test.ts` | 1. Local triggers (`nightly`, `mid-day` with `900_000 ms` / `15 min` default quiescence per `OQ-S3-3`, `context-saturation`) evaluate purely over injected `ClockPort` (`zero Date.now()`), enforce `context-saturation` hysteresis (`>= 8` turns or `>= 16_384` B since `lastSaturationOrdinal`), and require zero `Spec 6B` barrier.<br>2. Remote triggers (`weekly`, `monthly`, `cross-repository`, `late-sync-amendment`) fail closed with `MISSING_GRAPH_SYNC_BARRIER` unless a digest-valid `GraphSyncBarrierReceiptV1` advances past the prior watermark.<br>3. Multi-day local power-off (`3` missed `nightly` + `2` missed `mid-day`) and multi-week remote outage (`4` missed `weekly` windows) each coalesce into **1** catch-up pass; `late-sync-amendment` coalesces pre-start slices into 1 `rev_next` (`<= 3`) and caps `max_amended_windows_per_cycle = 2`; zero-event spans emit zero-LLM `DreamingEmptyWindowReceiptV1`.<br>4. AST + packed-file scan in `tests/memory-neutrality.test.ts` confirms zero `@sentropic/*` imports in `engram-memory/**` and zero `@ai-sdk/*`, `ai`, `mistral-ocr`, `src/llm-execution.ts` imports or `process.env.*_API_KEY` reads across all Spec 3 dreaming modules. | `npx vitest run tests/dreaming-triggers-and-catchup.test.ts tests/memory-neutrality.test.ts && npx tsc --noEmit` |
| **`3-E2`** | **`D26` Two-Tier Shadow Engine, Blind Anti-Collusion Verifier Gate, Single-Family Quarantine, Seeded Canaries, & Wilson `LCB_0.95 >= 0.85` Calibration Ledger (depends on `3-E1` & `Spec 1` `1-E2`/`1-E3`):** `new` `engram-memory/dreaming-shadow.ts`, `tests/memory-neutrality.test.ts` | 1. Rejects Tier-2 verification when `verifier.model_family === drafter.model_family` or `'unknown'`, quarantines single-family drafts as `'pending_independent_family'` without failing deterministic `D23`, and strips Tier-1 prompt/chain-of-thought/receipt before calling `ShadowLessonVerifierPortV1`.<br>2. Small-sample guard: $20/20$ confirmed (`LCB_0.95 = 0.8389 < 0.85`) keeps `gate_state === 'shadow_below_threshold'`; $24/24$ (`0.8617 >= 0.85`) with `>= 30` verified passes, `>= 3` windows, `>= 10` canaries (`0` false passes), and `0` boundary defects transitions per-`(tenantId, workspaceId, lineage)` `DreamingShadowGateStateV1` to `'threshold_met_eligible'`.<br>3. Single canary false-pass, single `D6`/`D7`/`T-M-C`/`Point 6A` violation, or model-family rotation immediately demotes `gate_state` and blocks all non-shadow emission. | `npx vitest run tests/dreaming-d26-shadow-calibration.test.ts tests/memory-neutrality.test.ts && npx tsc --noEmit` |
| **`3-E3`** | **`D23` Forgotten-Permanent-Fact Boost Index (`projectedContextTrigger` Bijection), `Point 6A` Guard, & 4-Path Promotion Routers (`D1`, `D2`, `T-M-C`, `Point 3C`, `Point 5B`; depends on `Spec 0` `0-E1`, `Spec 1` `1-E2`/`1-E3`, `Spec 2` `2-E3`):** `new` `engram-memory/dreaming-promotion.ts`, `new` `src/dreaming/promotion-contracts.ts`, `new` `src/dreaming/index.ts`, `package.json` (`./dreaming` export), `tests/memory-neutrality.test.ts` | 1. `selectForgottenPermanentFactsV1` boosts only `accepted_current` permanent records omitted from the last `8` step packs (`W_class = 2.10, D_recency = 1.00`), maps `'late-sync-amendment'` deterministically to `'weekly' \| 'monthly'` in `projectedContextTrigger` (zero boost rows for `'cross-repository'`, 100% valid against `Spec 2 :508` `validateSchema`), omits `summary` under `D6=refs`, withholds under `D18=readonly`, and removes boost rows immediately on `tombstone` / `withdraw`.<br>2. Enforces `Point 6A` (`Refusal('TRACK_CONTROLLED_IMMUTABLE')` on any attempt to overwrite/supersede `trackControlled: true` records; stages separate `trackControlled: false`, `reviewStatus: 'proposed'` proposals on `POST /memory/v1/control/proposals` DTOs); self-promotion by `dreamingServiceNhiId` fails closed (`D1`); `TrackTemplateEvolutionRequestV1` enforces bi-implication on `sole_accepting_authority`. | `npx vitest run tests/dreaming-promotion-and-d23-recall.test.ts tests/memory-neutrality.test.ts && npx tsc --noEmit` |
| **`3-E4`** | **`[DEPENDS ON SPEC 6B FOR REMOTE RUN]` Cross-Repository Harness Audit Partitioner & Unconditional Intra-Tenant `D6`/`D7`/`D8`/`D9`/`D33` Privacy Armor (depends on `3-E3` & `Spec 1` `1-E2`/`1-E3`):** `new` `src/dreaming/harness-audit.ts`, `tests/memory-neutrality.test.ts` | 1. Unconditionally rejects any `cohortWorkspace.tenantId !== callerTenantId` (`zero cross-tenant reads` without exception), enforces `D9` (`<= 30` workspaces, `<= 183` days, read-only), per-workspace `D7` deny-list + `D8` PII armor + `D33` HMAC pseudonymization before cohort join, `D10` raw-context exclusion, and `D6=refs` cohort-intersection.<br>2. Patterns in `>= 3` distinct repos emit `MasterHarnessAuditProposalV1` (`lineage: 'h2a'`, `D2=review`), whereas single-repo rules (including `h2a`'s single-writer `Track` rule, `Point 4B`) emit only workspace-local `RepoOverlayEvolutionProposalV1` (`.h2a/overlays/workspace.json`, `D31`). | `npx vitest run tests/dreaming-cross-repo-harness-audit.test.ts tests/memory-neutrality.test.ts && npx tsc --noEmit` |
| **`3-E5`** | **Incremental Post-Review Documentation & Route-Table Fold (`D2=review`, `OQ-S2-5`, `S3-C-08`; depends on `Spec 2` `Lot 2-E5`):** `spec/SPEC_MEMORY_FINALIZATION.md:1-60` (incremental §6.1 delta on top of `2-E5`), `plan/08-BRANCH_MEMORY_FINALIZATION.md:198-222` (§6.2 delta), `spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md` (`§2.2` route mirror), `spec/memory/contracts/engram-cluster-mesh.md` (route mirror) | Mechanical diff check verifying `Spec 2`'s `E6` + `R15-C` (`recall.ts:27-160`) + `2-E3` note and historical `0.20.0` evidence tables (`E1`–`E5`, `F13` exit table) remain intact, §3.4 `/memory/v1/dreaming/*` & `POST /memory/v1/control/proposals` routes match across `Spec 3` / `Spec 6A` / `engram-cluster-mesh.md`, and `tests/memory-evol-declarations.test.ts` stays green. | `npx vitest run tests/memory-evol-declarations.test.ts && npx tsc --noEmit` |

### 7.2 `sentropic` Repository Lots (`Make-Only` Kernel + Trailing `ENV=`, Single-Package Atomic `<= ~150 LOC`, Zero `api/` Cron)

> **Upstream `sentropic` Prerequisites (`S3-C-01`, `S3-C-04`, `S3-C-06`, `S3-C-07`):**
> - **Before `3-S1a`:** `Spec 6A` **`6A-S0b`** (activating durable `'scope-outbox-v1'` and `'fenced-writers-v1'` on `SqliteKernel` in `packages/cluster-mesh/src/storage/sqlite/index.ts:60-63,75-83`), **`6A-S1a`** (`memory-binding-v2` in `engram-memory/manifest.ts`), `Spec 1` `1-S1a`/`1-S2`, `Spec 2` `2-S1a`, **`chat-mesh Lots B1/B2`** (neutral `session-db`), and published `@sentropic/engram` (`3-E1..3-E3`).
> - **Before `3-S1b`:** `3-S1a`, `Spec 2` `2-S1b`, and **`chat-mesh Lot C2a`** (`RouteMeteringSink` moved into `@sentropic/llm-mesh`, `SPEC_EVOL_CHAT_MESH_PROPOSAL.md:380-382,629`).
> - **Before `3-S1c` & `3-S3`:** `Spec 6A` **`6A-S1b..d`** (`packages/cluster-mesh/src/compose/memory.ts` and `api/src/routes/namespaces/memory.ts`).
> - **Before `3-S2a` & `3-S2b`:** **`Spec 6B`** (transactional DB-cluster graph sync committing `GraphSyncBarrierReceiptV1` in `PostgresKernel`), published `@sentropic/engram` (`3-E4`), and **`Lot WD-2`** (`packages/cluster-mesh/src/deployment/scheduler.ts` mesh-native scheduler per **owner decision `W-D5 B`, relayed by `sentropic`**, `SPEC_EVOL_WASM_DEPLOYMENT.md:44,66,85-91,277,383`).
>
> **Why `SCOPE` Targets Explicit `*.spec.ts` Files & Real Postgres (`S3-C-07`):** In `packages/cluster-mesh/tests/storage/cold-workspace.sh:152-154`, `--exclude 'tests/engram-memory/mcp-memory-*.spec.ts'` applies **only** when `[ -z "$CM_PG_URL" ] && [ -z "${CM_SCOPE:-}" ]`. Passing a directory `SCOPE="tests/engram-memory"` without `CM_PG_URL` sets non-empty `CM_SCOPE`, executing `mcp-memory-{pg,http,sdk,stdio}.spec.ts` and crashing immediately at `tests/engram-memory/mcp-host.ts:17`. Every SQLite lot below (`3-S1a..3-S1c`) therefore passes its exact `*.spec.ts` file in `SCOPE="tests/engram-memory/<file>.spec.ts"`, while PostgreSQL lots (`3-S2a`, `3-S2b`) invoke `packages/cluster-mesh/tests/storage/postgres.mk:33-54` (`cluster-mesh-pg-test` + `cluster-mesh-pg-down`), which provisions isolated Docker PostgreSQL and injects `CM_PG_URL` under any `ENV=test-*`.

**Bounded Governance Scope Exceptions (`rules/MASTER.md:33`, `S3-C-07`):**

1. **`BRS3-EX1` — `@sentropic/engram` (and Optional `@sentropic/llm-mesh`) Peer Pin & Cold-Workspace Lock Cascade:**
   - **Touched Protected Files:** `Makefile:1282` (`CLUSTER_MESH_PEER_TOOLS`) and `:1318` (`qualify-published-install` `PEERS`), `packages/cluster-mesh/tests/storage/cold-workspace.sh:121,131-132`, `packages/cluster-mesh/contracts/engram-memory-neutral-contract-v*.d.ts`, `packages/cluster-mesh/package.json:269,271`, `packages/cluster-mesh/src/modules/catalog.ts:18-19`, `scripts/ci/consumer-locks.json`, `scripts/ci/tool-locks.json`, and root `package-lock.json`.
   - **Rationale & Bounded Impact:** Cold-workspace (`cold-workspace.sh:121,131-132`) and offline CI (`locked-consumer.mjs`, `locked-tools.mjs`, `qualify-published-install`) pin exact `@sentropic/engram` tarball/version coordinates and neutral contract `.d.ts` snapshots; advancing `cluster-mesh` to consume `@sentropic/engram` `3-E1..3-E4` (or `@sentropic/llm-mesh` post-`chat-mesh C2a` if `>=0.39.0`) fails deterministically unless these lock pins move atomically in `3-S1a` / `3-S1b`. Zero runtime logic outside `packages/cluster-mesh` is altered.
   - **Rollback:** `git revert` of the single `3-S1a` (or `3-S1b`) commit atomically restores the prior peer range, `.d.ts` contract snapshot, `cold-workspace.sh` pin, `Makefile` peer string, and CI lock JSONs.
2. **`BRS3-EX2` — `enforce-package-bump` & `MCP-L5` Pre-Candidate Lock-Snapshot Cascade (`packages/cluster-mesh`):**
   - **Touched Protected Files:** `packages/cluster-mesh/package.json`, root `package-lock.json`, `tools/memory-mcp-l5/artifacts/pre-candidate-manifest.json` + `.sha256`, `tools/memory-mcp-l5/artifacts/lock-snapshots/<sha256>.package-lock.json`, `tools/memory-mcp-l5/artifacts/history/*` (when P1 retention triggers at `pack.mjs:175-177`), and `packages/cluster-mesh/tests/engram-memory/qualification.mk:14-15,24,37,48-49,58,67,71,83,90`.
   - **Rationale & Bounded Impact:** Modifying `packages/cluster-mesh/src/**` requires bumping `packages/cluster-mesh/package.json` (`enforce-package-bump`, `rules/workflow.md:116-120`), which updates `package-lock.json` (`tools/memory-mcp-l5/lock-closure.mjs:130`). Per `Makefile:5028` and `tools/memory-mcp-l5/pack.mjs:124-127`, updated `package-lock.json` **MUST be committed to `HEAD` before running `make memory-l5-pack`** so `--head-lock-sha` matches working-tree `package-lock.json` and emits the matching lock snapshot and `qualification.mk` SHA-256 pins.
   - **Rollback:** `git revert` of the lot's pack/qualification commit + implementation commit restores `packages/cluster-mesh/package.json`, `package-lock.json`, `tools/memory-mcp-l5/artifacts/**`, and `qualification.mk` in one atomic rollback.

| Lot | Single-Package Scope (`<= ~150 LOC`), Dependencies, & Target Files (`new` marked) | First Failing (`RED`) Tests Written Before Implementation | Verification Command (`ENV=` Mandatory Last Arg) |
|---|---|---|---|
| **`3-S1a`** | **`packages/cluster-mesh` `memory-binding-v2` Manifest/Projection Registration, Dual-Cursor SQLite Store, `Point 6A` Guard, & `dreaming-local.ts` (depends on `6A-S0b`, `6A-S1a`, `1-S1a`, `1-S2`, `2-S1a`, `chat-mesh B1/B2`, published `3-E1..3-E3`; `BRS3-EX1` + `BRS3-EX2`):** `packages/cluster-mesh/package.json`, `packages/cluster-mesh/src/engram-memory/{manifest.ts,projection.ts,sqlite.ts,sqlite-queries.ts}`, `new` `packages/cluster-mesh/src/engram-memory/dreaming-local.ts`, `new` `packages/cluster-mesh/tests/engram-memory/dreaming-local.spec.ts` (+ `BRS3-EX1`/`BRS3-EX2` lock files) | 1. Registers dreaming record/aggregate/query kinds in `manifest.ts` & `projection.ts` (zero `StorageInvalidCommandError`), persists dual-cursor `DreamingWatermarkRowV1` (`deterministicThroughCursor`, `modelSynthesisThroughCursor`) and per-`(tenantId, workspaceId, lineage)` `DreamingShadowGateStateV1` in `SqliteKernel` + `'scope-outbox-v1'` (`6A-S0b`).<br>2. Enforces mechanical `Point 6A` (`Refusal('TRACK_CONTROLLED_IMMUTABLE')` on any `trackControlled: true` overwrite/supersession), `D10=mandate` locality, `900_000 ms` local quiescence with zero extra daemon, and `D17=degraded` deterministic `D23` boosts when `llm-mesh` is absent. | `make lint-cluster-mesh ENV=test-s3-local && make typecheck-cluster-mesh ENV=test-s3-local && make test-cluster-mesh SCOPE="tests/engram-memory/dreaming-local.spec.ts" ENV=test-s3-local && make build-cluster-mesh ENV=test-s3-local && make pack-cluster-mesh ENV=test-s3-local && make memory-l5-lint ENV=test-s3-local && make scope-check ENV=test-s3-local` *(after committing `package-lock.json`: `make memory-l5-pack ENV=test-s3-local`)* |
| **`3-S1b`** | **`packages/cluster-mesh` `@sentropic/llm-mesh` & `@sentropic/llm-mesh/decision` Dreaming Adapter, Canonical Family Resolver, Budget Tracker, & `§5.2` Failure Modes (depends on `3-S1a`, `2-S1b`, `chat-mesh C2a`; `BRS3-EX1`/`BRS3-EX2` if `LLM_MESH_RANGE` bumps):** `packages/cluster-mesh/package.json`, `packages/cluster-mesh/src/modules/catalog.ts`, `new` `packages/cluster-mesh/src/integrations/llm-mesh/memory-dreaming-llm.ts`, `new` `packages/cluster-mesh/tests/engram-memory/memory-dreaming-llm.spec.ts` | 1. Queries `RoutePlanner.listModels(subject)` / `LlmMesh.listModels`, resolves `resolveCanonicalModelFamily` (`'anthropic/claude-sonnet-4-6@gcp'` → `'anthropic'`, `'zai-glm-5-3'` → `'zai'`), enforces disjoint families (`'pending_independent_family'` when single-family), 8-key `DecisionRequest`, `RoutePlanner.quote` pre-check + `DreamingPassBudgetTracker` (`RouteMeteringSink` via `chat-mesh C2a`), and `D6=refs` pre-serialization scrubbing.<br>2. Enforces `§5.2`: zero retry on `committed === true`, max-1 retry honoring `retryAfterMs` on uncommitted failures, and `'degraded_deterministic_only'` without advancing `modelSynthesisThroughCursor`. | `make lint-cluster-mesh ENV=test-s3-llm && make typecheck-cluster-mesh ENV=test-s3-llm && make test-cluster-mesh SCOPE="tests/engram-memory/memory-dreaming-llm.spec.ts" ENV=test-s3-llm && make typecheck-llm-mesh ENV=test-llm && make test-llm-mesh ENV=test-llm && make pack-cluster-mesh ENV=test-s3-llm && make scope-check ENV=test-s3-llm` |
| **`3-S1c`** | **`packages/cluster-mesh` Hono `/memory/v1/dreaming/*` & `POST /memory/v1/control/proposals` Routes, `'sentropic-mcp'` HTTP `403` Guard, & Pre-`Spec 6B` `503` Refusal (depends on `3-S1a`, `3-S1b`, `6A-S1b..d`; `BRS3-EX2`):** `packages/cluster-mesh/package.json`, `packages/cluster-mesh/src/compose/memory.ts`, `new` `packages/cluster-mesh/tests/engram-memory/dreaming-http-routes.spec.ts` | 1. Enforces `H2AMandateBody.rights` (§3.4), rejects any caller-supplied `GraphSyncBarrierReceiptV1`, rejects `client_id === 'sentropic-mcp'` with HTTP `403 Forbidden`, refuses below-threshold promotions (`403 shadow_threshold_not_met`), and fails closed with `503 MISSING_GRAPH_SYNC_BARRIER` (zero `WD-2` jobs, zero `llm-mesh` calls, zero writes) on `external-host` while `Spec 6B` is unregistered. | `make lint-cluster-mesh ENV=test-s3-routes && make typecheck-cluster-mesh ENV=test-s3-routes && make test-cluster-mesh SCOPE="tests/engram-memory/dreaming-http-routes.spec.ts" ENV=test-s3-routes && make pack-cluster-mesh ENV=test-s3-routes && make memory-l5-lint ENV=test-s3-routes && make scope-check ENV=test-s3-routes` |
| **`3-S2a`** | **`[DEPENDS ON SPEC 6B]` `packages/cluster-mesh` Postgres Queries, Kernel Barrier Read, Per-Workspace `NeutralBoundScope` Intra-Tenant Cohort Isolation, & Remote Runner (depends on `3-S1c`, `Spec 6B`, published `3-E4`; `BRS3-EX1`/`BRS3-EX2`):** `packages/cluster-mesh/package.json`, `packages/cluster-mesh/src/engram-memory/{postgres.ts,postgres-queries.ts}`, `new` `packages/cluster-mesh/src/engram-memory/dreaming-remote.ts`, `new` `packages/cluster-mesh/tests/engram-memory/dreaming-remote.spec.ts` | 1. Reads `GraphSyncBarrierReceiptV1` solely from `PostgresKernel`, coalesces multi-window remote outages into 1 pass, bounds `late-sync-amendment` (`rev1..rev3`, `max_amended_windows_per_cycle = 2`), and enforces `Point 6A` (`trackControlled !== true`) on Postgres 16/17.<br>2. Opens a distinct mandate-verified `NeutralBoundScope` per opted-in `workspaceId`, enforces unconditional `cohortWorkspace.tenantId === callerGrant.scope.tenantId`, and applies `D7`+`D8`+`D33` per source scope before cohort join. | `make lint-cluster-mesh ENV=test-s3-remote && make typecheck-cluster-mesh ENV=test-s3-remote && make -f Makefile -f packages/cluster-mesh/tests/storage/postgres.mk cluster-mesh-pg-test SCOPE="tests/engram-memory/dreaming-remote.spec.ts" ENV=test-s3-remote && make -f Makefile -f packages/cluster-mesh/tests/storage/postgres.mk cluster-mesh-pg-down ENV=test-s3-remote && make pack-cluster-mesh ENV=test-s3-remote && make scope-check ENV=test-s3-remote` |
| **`3-S2b`** | **`[DEPENDS ON SPEC 6B + WD-2]` `packages/cluster-mesh` `DreamingRemoteSchedulerPort` Wiring Onto `WD-2` Mesh-Native Scheduler, Scope Jitter, & Admission Caps (`W-D5 B` relayed by `sentropic`; depends on `3-S2a`, `WD-2`; `BRS3-EX2`):** `packages/cluster-mesh/package.json`, `packages/cluster-mesh/src/engram-memory/dreaming-remote.ts`, `new` `packages/cluster-mesh/tests/engram-memory/dreaming-remote-scheduler.spec.ts` | 1. Submits remote `weekly`, `monthly`, `cross-repository`, and `late-sync-amendment` intents exclusively through `WD-2` (`DreamingRemoteSchedulerPort`: `submit`/`status`/`cancel`/`receipt` + `WD-O5` fencing epochs; zero `api/` cron), applies deterministic `sha256(tenantId + "\0" + scopeKey + "\0" + triggerKind) % max_schedule_jitter_ms` offsets, and enforces global/per-tenant concurrency caps + idempotent `'effect-unknown'` recovery. | `make lint-cluster-mesh ENV=test-s3-sched && make typecheck-cluster-mesh ENV=test-s3-sched && make -f Makefile -f packages/cluster-mesh/tests/storage/postgres.mk cluster-mesh-pg-test SCOPE="tests/engram-memory/dreaming-remote-scheduler.spec.ts" ENV=test-s3-sched && make -f Makefile -f packages/cluster-mesh/tests/storage/postgres.mk cluster-mesh-pg-down ENV=test-s3-sched && make pack-cluster-mesh ENV=test-s3-sched && make scope-check ENV=test-s3-sched` |
| **`3-S3`** | **`api/` `MEMORY_PATHS` Exposure & Explicit HTTP `'sentropic-mcp'` `403` Guard (strictly isolated from `packages/*`, ZERO cron in `api/`; depends on `3-S1c`, `6A-S1d`):** `api/src/routes/namespaces/memory.ts`, `new` `api/tests/api/memory-dreaming-endpoints.test.ts` | 1. Exposes `/v1/dreaming/*` and `POST /v1/control/proposals` through `MEMORY_PATHS` in `api/src/routes/namespaces/memory.ts` (zero schedule/cron code in `api/`), rejects `client_id === 'sentropic-mcp'` with HTTP `403 Forbidden`, exposes zero below-threshold shadow drafts (`D26`), and returns `503 MISSING_GRAPH_SYNC_BARRIER` on remote triggers when `Spec 6B` is absent. | `make up-api-test ENV=test-api-dream && make typecheck-api ENV=test-api-dream && make test-api-endpoints SCOPE="tests/api/memory-dreaming-endpoints.test.ts" API_TEST_WORKERS=1 ENV=test-api-dream && make scope-check ENV=test-api-dream` |

### 7.3 `h2a` Repository Lots (`node --test` + `scripts/test-inventory.json` for `packages/h2a`; Vitest + Zero-Mesh-Dep Invariant for `packages/track`)

| Lot | Scope & Target Files (`new` marked; `packages/track/package.json` keeps zero `@sentropic/engram` / `@sentropic/cluster-mesh` deps) | First Failing (`RED`) Tests Written Before Implementation | Verification Command |
|---|---|---|---|
| **`3-H1`** | **Local `drumbeatTick` / `SessionStart` Dreaming Trigger Client & Repo-Local `.h2a/` Overlay Staging (`Point 3C`, `D15`, `D31`; depends on `6A-H1..H3`, `1-H1`, `2-H1`):** `new` `packages/h2a/src/runtime/memory/dreaming-trigger-client.ts`, `packages/h2a/src/runtime/drumbeat/watch.ts:88`, `scripts/test-inventory.json` | 1. Dispatches local `nightly` / `mid-day` / powered-off catch-up and `context-saturation` notifications over `cluster-mesh` (`R12`, zero `~/.h2a/` JSONL queue) without blocking interactive `D15` prompt slices.<br>2. Stages `RepoOverlayEvolutionProposalV1` strictly as an unapplied review proposal targeting `.h2a/overlays/workspace.json` (`D2=review`), rejecting any override of `H2AMandate` / `R12` / `D6` invariants. | `npm run typecheck && node --test packages/h2a/test/dreaming-local-triggers.test.js` |
| **`3-H2`** | **`Track` Third-Party Promotion Control (`D1=borne-review`, `Point 3C`) & `TrackTemplateEvolutionRequestV1` Inbox (`T-M-C`; depends on `1-H4`):** `new` `packages/track/src/ingest/dreaming-requests.ts`, `new` `packages/track/src/dreaming-requests.test.ts`, `packages/h2a/src/runtime/memory/promote-client.ts`, `scripts/test-inventory.json` | 1. `packages/track/package.json` retains **zero** `@sentropic/engram` and `@sentropic/cluster-mesh` dependencies.<br>2. Dreamed `Track`-domain typed writes require both `verdictAuthority: 'track'` and third-party reviewer identity (`reviewerSubject !== proposalAuthorSubject`, `D1` + `Point 3C`); self-approval fails closed.<br>3. Dreamed template changes are recorded exclusively as `TrackTemplateEvolutionRequestV1` (`status: 'requested'`), accepted **only** by `Track`, while `SpecAmendPayload.proposalRef` (`packages/track/src/model/spec-amend.ts:37-40`) preserves machine-origin provenance. | `npm test -w @sentropic/track && npm run typecheck && node --test packages/h2a/test/track-dreaming-control.test.js` |
| **`3-H3`** | **`[DEPENDS ON SPEC 6B]` `h2a` Master-Harness Audit Proposal Intake (`Point 4B`, `D2=review`):** `new` `packages/h2a/src/runtime/governance/master-harness-audit-intake.ts`, `scripts/test-inventory.json` | 1. Accepts `MasterHarnessAuditProposalV1` over `cluster-mesh` only when `supporting_repo_count >= 3`, `calibration_receipt_digest` is verified, and zero repo-specific rule (such as `h2a`'s single-writer `Track` rule) is present.<br>2. Holds every master-harness candidate in `proposed` review state (`D2=review`, `Point 4B` `h2a` sole authorship of `lineage: 'h2a'`). | `npm run typecheck && node --test packages/h2a/test/master-harness-audit-intake.test.js` |

---

## 8. Open Questions

None of the operational parameters below reopen `D1`–`D34` ([`spec/memory/R15-SEDIMENT.md`](memory/R15-SEDIMENT.md)) or `Points 1B–6A` / `T-M-C` / `D28` ([`spec/memory/OWNER-DECISIONS-2026-11-14.md`](memory/OWNER-DECISIONS-2026-11-14.md)). Positions from `sentropic` (`@sentropic/cluster-mesh` OWNER review, `2026-11-15`) are folded below; `h2a`'s review of Spec 3 has not yet arrived.

1. **`OQ-S3-1` (`engram` + `sentropic` + `h2a` — Default Numerical Calibration Constants, Aggregate Scoping, & Per-Pass Cost Ceilings for `D26`):**
   - Confirm the default `DreamingShadowGateStateV1` / `ShadowCalibrationGateV1` numerical constants in §2.3 ($N_{\text{verified\_pass}} \ge 30$, $N_{\text{resolved}} \ge 20$, Wilson $\mathrm{LCB}_{0.95} \ge 0.85$, $\Delta_{\text{obs}} = 14\text{d}$, `>= 10` negative-control canaries) and the default per-pass micro-USD budget ceilings (`'50000'` / `'250000'` / `'500000'`) in `memory-dreaming-llm.ts`.
   - **Position (`sentropic` / `@sentropic/cluster-mesh` OWNER review, `2026-11-15` — folded into §1.4 & §2.3):** Default thresholds ($N_{\text{min}} = 30$, precision $\ge 0.85$, FPR $\le 0.05$, `canaryPassRate = 1.0`) accepted on the `cluster-mesh` side, subject to persisting `DreamingShadowGateStateV1` as a registered aggregate in `packages/cluster-mesh/src/engram-memory/manifest.ts` scoped per `(tenantId, workspaceId, lineage)` and **never** shared across tenants (now normative in §1.4 & §2.3). Pending `h2a` confirmation on remaining domain calibration / cost constants.
2. **`OQ-S3-2` (`h2a` + `sentropic` — Cross-Repo Opt-In Mandate Binding, Intra-Tenant Invariant, & Minimum Quorum `min_distinct_repos`):**
   - §4.2 sets `min_distinct_repos = 3` repositories so single-repo or two-repo coincidences stay inside `.h2a/overlays/workspace.json` (`D31`). When an organization has only `2` opted-in repositories in a tenant, should `cross-repository` audit require both (`2/2` with explicit conductor flag) or remain dormant until `>= 3` repositories opt in?
   - **Position (`sentropic` / `@sentropic/cluster-mesh` OWNER review, `2026-11-15` — folded into §4.1):** Cross-repository opt-in MUST be carried by the signed `h2a` mandate (`D4`, `D9`, `D10`) verified when opening each per-workspace `NeutralBoundScope` in `cluster-mesh`, **unconditionally intra-tenant** (`cohortWorkspace.tenantId === callerGrant.scope.tenantId` with zero exceptions, now normative in §4.1). Pending `h2a` confirmation on `min_distinct_repos = 3` vs `2/2` tenant behavior.
3. **`OQ-S3-3` (`engram` + `sentropic` — Workstation Local Inactivity Window & `Spec 6B` Offline-Replica Grace Window):**
   - Confirm the workstation local inactivity threshold before scheduled local passes and, for post-`Spec 6B` remote passes, confirm the default grace hold (`recommended: 12 hours`) when `GraphSyncBarrierReceiptV1.lagging_replica_ids.length > 0` before `external-host` runs `rev0` over synced replicas and relies on bounded `late-sync-amendment` (`rev1..rev3`, `max_amended_windows_per_cycle = 2`, §1.3).
   - **Position (`sentropic` / `@sentropic/cluster-mesh` OWNER review, `2026-11-15` — folded into §1.1 & §1.2):** Local workstation inactivity window default set to **`15 min` (`900_000 ms`)**, and **no extra daemon or polling loop** may be added inside `cluster-mesh` for `mid-day` (now normative in §1.1 & §1.2). Remote `Spec 6B` lagging-replica grace duration remains coordinated with `Spec 6B`.
4. **`OQ-S3-4` (`h2a` / `Track` — CLI Surface for Reviewing `TrackTemplateEvolutionRequestV1` in `3-H2`):**
   - Without reopening `Point 3C` (`Track` alone accepts template requests), confirm whether `Track` conductors prefer reviewing `TrackTemplateEvolutionRequestV1` items through an existing `track decision` / `track demand` command (`packages/track/src/model/{decision.ts,demand.ts}`) or a dedicated `track template-request` subcommand in Lot `3-H2`. *(Pending `h2a` review.)*

---

## 9. Code Grounding Ledger (`DESIGN-NOTE-CODE-GROUNDING.md`)

Every code, schema, script, Make target, and contract claim in this specification was verified directly against the repository trees at the named baseline SHAs (`engram` branch `HEAD` `fc0437b20e974f6a1e4424e7def20deb9857c16a`, Spec 3 initial commit `2856a6ccf0922806bad675fbaa76c59e8a37c317`, base parent `f0c2928e600c41f7804cf4e3b84e27688150bb1d`, `origin/main` `f75543a5c8b220a741924e8eeac6610e3808c8ce`; `sentropic` `origin/main` `913e3bcbc9dec9ff5f9db36eb3a1ef5a3dd11b7a` plus working-tree drafts `spec/SPEC_EVOL_WASM_DEPLOYMENT.md` and `spec/SPEC_EVOL_CHAT_MESH_PROPOSAL.md`; `h2a` `origin/main` `1f57127dee0bf671e559c347cd86960180cd64c9` / `HEAD` `229573e3ab8f0bd0430892966f4c8659ee4aece2`):

| Claim in Spec 3 | Verification Command Executed | Observed Result | Grounded Anchor or `new` Status |
|---|---|---|---|
| Zero dreaming, lesson-drafting, or memory-consolidation scheduler exists in `engram-memory/` or `src/` today; `Spec 6B` absent in `spec/` | `rg -n "dream\|dormant\|lesson\|scheduler\|cron" engram-memory src && git -C /home/antoinefa/src/graphify-wt-memfinal ls-tree -r --name-only 2856a6cc spec/` | Only prose comments (`sqlite.ts:89`, `ontology-patch-context.ts:56`) and `"acronym"` matches; `Spec 6B` absent (`unknown`) in `spec/` | All Spec 3 dreaming modules explicitly marked **`new`** (`Lots 3-E1..3-E4`); remote triggers fail closed `503 MISSING_GRAPH_SYNC_BARRIER` until `Spec 6B` ships |
| `engram-memory` 30-day recency half-life, `RRF_K`, and `PPR_ALPHA` constants | `rg -n "HALF_LIFE\|RRF_K\|PPR_ALPHA" engram-memory/recall.ts` | `HALF_LIFE_MS = 2_592_000_000` (`:34`), `RRF_K = 60` (`:38`), `PPR_ALPHA = 0.85` (`:44`), decay formula (`:173`) | `engram@f0c2928e:engram-memory/recall.ts:34,38,44,173` |
| `DerivationLineageV1`, `RetentionV1`, `MemoryRecordV2`, `MemoryState`, `CapitalisationRequestV1`, `MemoryPortV2`, & injected `ClockPort` | `read_file` on `engram-memory/contracts/index.ts` (`:1-120,415-490,1335-1389`) | Exact interfaces and union literals verified | `engram@f0c2928e:engram-memory/contracts/index.ts:41-54,83-99,419-443,1342-1389` |
| L5 read-only assertion-family reconciliation proposal generator | `rg -n "AssertionFamily\|reconcil" engram-memory/assertion-family-registry.ts` | `reconciliationProposalIdV1` (`:66`), `createAssertionFamilyRegistryV1` (`:267-365`) | `engram@f0c2928e:engram-memory/assertion-family-registry.ts:66,267-365` |
| `engram-live` 3:1 `interactive` vs `backfill` scheduler, `ScopeFencingTokenDto`, injected `clock`, & `RetentionPort` | `read_file` on `engram-live/scheduler.ts` (`:1-300`) and `engram-live/retention.ts` (`:1-229`) | `Scheduler` (`:86-337`), `interactiveQuantum: 3, backfillQuantum: 1` (`:117,173`), `backfillReserveBytes` (`:35,141-145`), `RetentionPort` (`:64-68`), `runRetentionPass` (`:167-229`) | `engram@f0c2928e:engram-live/scheduler.ts:3-14,35,53-64,86-337`; `engram-live/retention.ts:64-229` |
| `engram` `@ai-sdk/*` deps & `src/llm-execution.ts` `*_API_KEY` reads isolated by `Spec 1` `1-E2`/`1-E3` | `nl -ba package.json \| sed -n '145,162p' && nl -ba src/llm-execution.ts \| sed -n '246,281p;337,366p'` | `@ai-sdk/*`, `ai`, `mistral-ocr` in `package.json:146-161`; `*_API_KEY` env reads in `src/llm-execution.ts:246-281,337-366` (`src/llm-mesh.ts:12`, `src/extraction-batch.ts:74-78`) | `engram@2856a6cc:package.json:146-161`, `src/llm-execution.ts:12,246-281,337-366,497`; prerequisite `Spec 1` `Lots 1-E2/1-E3` + AST guard in `tests/memory-neutrality.test.ts` |
| Incremental `Before` state of `spec/SPEC_MEMORY_FINALIZATION.md` (post-`Spec 2 §6.2` `Lot 2-E5`) and `plan/08-BRANCH_MEMORY_FINALIZATION.md:198-222` | `read_file` on `spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md:1480-1542`, `spec/SPEC_MEMORY_FINALIZATION.md:1-65`, and `plan/08-BRANCH_MEMORY_FINALIZATION.md:195-245` | Verified line-by-line against `Spec 2 §6.2` (`E6`, `R15-C` `recall.ts:27-160`, `2-E3`) and `plan/08` | `engram@fc0437b2:spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md:1482-1541` (`Lot 2-E5`); `plan/08-BRANCH_MEMORY_FINALIZATION.md:198-222` |
| `W-D5 B` (**relayed by `sentropic`**) & `WD-2` mesh-native scheduler + `chat-mesh` `B1/B2/C2a` | `nl -ba /home/antoinefa/src/sentropic/spec/SPEC_EVOL_WASM_DEPLOYMENT.md \| sed -n '44p;66p;85,91p;277p;360p;383p'` & `nl -ba /home/antoinefa/src/sentropic/spec/SPEC_EVOL_CHAT_MESH_PROPOSAL.md \| sed -n '152p;277,285p;370,388p;622,635p'` | Working-tree drafts in `sentropic`: `W-D5 B` (`:44`, relayed by `sentropic`), `WD-2` (`:66,85-91,277`), `WD-O5` (`:383`); `chat-mesh` `mesh-scheduler` (`:152,635`), `session-db` (`:277-285,622-623`), `RouteMeteringSink` in `C2a` (`:370-388,629`) | `WD-2` (`packages/cluster-mesh/src/deployment/scheduler.ts`), `chat-mesh B1/B2/C2a`, & `DreamingRemoteSchedulerPort` (`Lot 3-S2b`) marked **`new`**; zero `api/` cron |
| `@sentropic/llm-mesh@0.38.0` `LlmMesh`, `RoutePlanner.listModels`/`plan`/`quote`, `RouteUsageCeiling`, `RouteFailureClassification`, & multi-family `providers.ts` / `catalog.ts` | `git -C /home/antoinefa/src/sentropic show origin/main:packages/llm-mesh/src/{mesh,routing-contracts,providers,catalog}.ts \| nl -ba` | `LlmMesh` (`mesh.ts:49-54,157`), `RouteUsageCeiling` (`routing-contracts.ts:80-91`), `RouteQuote` (`:93-126`), `RouteModelInventoryEntry` (`:156-160`), `RouteFailureClassification` (`committed`, `retryAfterMs` `:161-193`), `AccountDirectoryPort.listEligible` (`:209`), `RoutePlanner.listModels`/`plan`/`quote` (`:249-288`), `anthropic/*@gcp` (`providers.ts:63-64`, `catalog.ts:202`), `zai-glm-5-3` (`:43-47`), `antigravityModelFleet` (`:129-135`) | `sentropic@913e3bcbc:packages/llm-mesh/src/{mesh.ts:49-54,routing-contracts.ts:13,54-193,249-288,providers.ts:7,43-64,129-135,catalog.ts:152,202}`; `resolveCanonicalModelFamily` & `DreamingPassBudgetTracker` **`new`** (`Lot 3-S1b`) |
| `@sentropic/llm-mesh/decision`, `RouteMeteringSink` (`llm-gateway` vs `chat-mesh C2a`), & `BudgetAdmissionPort` | `git -C /home/antoinefa/src/sentropic show origin/main:packages/llm-mesh/src/decision/{index,receipt,client,request,request-policy}.ts` & `packages/llm-gateway/src/{route-flow-core,ports/budget}.ts` | `DecisionClient.decide` & `DecisionConnectionFailure` (`receipt.ts:65-77`), `retryAfterMs` (`client.ts:448`), 8-key `DecisionRequest` (`request.ts:40-75`), per-call `maxCostMicroUsd` (`request-policy.ts:3-10`); `RouteMeteringSink` in `llm-gateway/src/route-flow-core.ts:49-51`; `BudgetAdmissionPort` (`ports/budget.ts:5,18-40`) | `sentropic@913e3bcbc:packages/llm-mesh/src/decision/{index.ts:1-16,receipt.ts:17-77,client.ts:358-515,request.ts:40-75,request-policy.ts:3-10}`, `packages/llm-gateway/src/{route-flow-core.ts:49-51,ports/budget.ts:5,18-40}`; `RouteMeteringSink` in `llm-mesh` **`new`** (`chat-mesh C2a`) |
| `cluster-mesh` `manifest.ts`, `projection.ts`, `pgScopeKey`, `NeutralModuleTransaction.findIdempotency`, & durable `'scope-outbox-v1'` (`Postgres` vs `SqliteKernel` `6A-S0b` vs in-memory `root-profiles.ts`) | `git -C /home/antoinefa/src/sentropic show origin/main:packages/cluster-mesh/src/engram-memory/{neutral-contract,manifest,projection,sqlite-queries,postgres-queries}.ts` & `src/storage/{root-profiles.ts,postgres/profiles.ts,sqlite/index.ts}` | `findIdempotency` (`neutral-contract.ts:181-199`), single-scope `MemoryScopeBindingV1` (`:271-275`), `manifest.ts:19-28,58-144,215-230` (`memory-outbox-v1` `:138`), `pgScopeKey` (`projection.ts:13-17`), `validateMemoryPgEffects` (`:50-83`), `StorageInvalidCommandError` (`:100-104`, `sqlite-queries.ts:17-18`, `postgres-queries.ts:15-16,80-119`); Postgres `'scope-outbox-v1'` (`postgres/profiles.ts:11-12,50-58`); SQLite excludes `'scope-outbox-v1'` until `6A-S0b` (`sqlite/index.ts:60-63,75-83`); `root-profiles.ts:15-16` is in-memory only | `sentropic@913e3bcbc:packages/cluster-mesh/src/engram-memory/{neutral-contract.ts:181-199,271-275,manifest.ts:19-144,215-230,projection.ts:13-17,50-104,sqlite-queries.ts:17-18,postgres-queries.ts:15-16,80-119}` & `src/storage/{postgres/profiles.ts:11-12,50-58,sqlite/index.ts:60-63,75-83,160-187}`; `dreaming-local.ts` (`3-S1a`) & `dreaming-remote.ts` (`3-S2a/b`) **`new`** |
| `api/src/routes/namespaces/memory.ts` (`MEMORY_PATHS`) vs MCP-only `DEC-116` (`client-policy.ts`), Make gates, `cold-workspace.sh`, `postgres.mk`, & `MCP-L5` lock cascade | `git -C /home/antoinefa/src/sentropic show origin/main:api/src/{routes/namespaces/memory.ts,services/mcp/client-policy.ts}` & `Makefile`, `cold-workspace.sh`, `mcp-host.ts`, `postgres.mk`, `qualification.mk`, `pack.mjs`, `lock-closure.mjs` | `MEMORY_PATHS` (`memory.ts:10-75`); `DEC-116` (`client-policy.ts:3-50`) filters MCP tools/connectors only; `cold-workspace.sh:152-154` + `mcp-host.ts:17` require single-file `SCOPE` without `CM_PG_URL`; `postgres.mk:33-54` provides `cluster-mesh-pg-test`/`down`; `Makefile:5028` + `pack.mjs:124-136,175-177` + `lock-closure.mjs:130` govern `HEAD:package-lock.json` | `sentropic@913e3bcbc:api/src/{routes/namespaces/memory.ts:10-75,services/mcp/client-policy.ts:3-50}`, `Makefile:1261-1318,1422,2460-2467,2887,3010,3284,4067,4986-5051`, `packages/cluster-mesh/tests/{storage/cold-workspace.sh:121,131-132,152-162,storage/postgres.mk:33-54,engram-memory/mcp-host.ts:17,engram-memory/qualification.mk:14-90}`, `tools/memory-mcp-l5/{pack.mjs:124-177,lock-closure.mjs:130}` |
| `h2a` `drumbeatTick`, `scripts/test-inventory.json`, `packages/track` zero-mesh-dep invariant, & `SpecAmendPayload.proposalRef` | `git -C /home/antoinefa/src/h2a show origin/main:...` on `watch.ts`, `test-inventory.json`, `packages/track/package.json`, `spec-amend.ts` | `drumbeatTick` (`watch.ts:88`), `@sentropic/track@0.91.0` deps only `@modelcontextprotocol/sdk` + `ulid` (`package.json:55-58`), `SpecAmendPayload.proposalRef` (`spec-amend.ts:24-40`) | `h2a@1f57127de:packages/h2a/src/runtime/drumbeat/watch.ts:88`; `scripts/test-inventory.json:1-25`; `packages/track/package.json:55-58`; `packages/track/src/model/spec-amend.ts:24-40` |
