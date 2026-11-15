# SPEC — Engram Dormant Dreaming Synthesis (`Spec 3`)

- **Spec ID:** `SPEC-ENGRAM-DORMANT-DREAMING-SYNTHESIS` (`Spec 3` in [`spec/memory/PLAN_SPEC_ENGRAM_FRONT.md`](memory/PLAN_SPEC_ENGRAM_FRONT.md) `:188-204`)
- **Stage:** `DESIGN` (Gemini Carbon)
- **Status:** `proposed` — design specification only; authorizes no merge, push, tag, publication, migration, or runtime cutover.
- **Date:** `2026-11-15`
- **Repository of Record:** `engram` (`spec/SPEC_ENGRAM_DORMANT_DREAMING_SYNTHESIS.md`)
- **Dependencies:**
  - [`spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md`](SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md) (`Spec 0` — metamodel primitives, lineages `'engram'`, `'track'`, `'h2a'`, and `promotion-third-party-review` `:944`)
  - [`spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md`](SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md) (`Spec 6A` — `R12` `@sentropic/cluster-mesh` hop, neutral `session-db`, `SqliteKernel` + `scope-outbox-v1`, exclusive `@sentropic/llm-mesh` routing `§2.5`)
  - [`spec/SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md`](SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md) (`Spec 1` — `RawSessionEventPayload` `kind: 'context_saturation'`, `session_summary` compaction, `D7`/`D8`/`D9`/`D10`/`D33` privacy gates, `src/llm-json-port.ts` SDK isolation)
  - [`spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md`](SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md) (`Spec 2` — `engram_memory_context` seventh MCP tool, `mission_focus_context.dreaming_recalled_facts`, `D23` attention boost, `D6=refs` field-level scrubbing)
  - **Explicit `Spec 6B` Dependency (`spec/SPEC_ENGRAM_DB_CLUSTER_SYNC_AND_MULTI_WORKSTATION.md`, planned in [`spec/memory/PLAN_SPEC_ENGRAM_FRONT.md`](memory/PLAN_SPEC_ENGRAM_FRONT.md) `:226-237`):** All **remote** dreaming passes (`weekly`, `monthly`, and `cross-repository` master-harness audit, `Point 3C`) depend strictly on `Spec 6B` integral DB-cluster graph sync (`D24=integral`). **Local** dreaming passes (`nightly`, `mid-day`, `context-saturation`) have **zero** runtime dependency on `Spec 6B` and execute locally over fenced `engram-memory` SQLite + neutral `session-db` (`D10=mandate`, `D17=degraded`).
- **Binding Authorities:**
  - [`spec/memory/OWNER-DECISIONS-2026-11-14.md`](memory/OWNER-DECISIONS-2026-11-14.md) (`T-M-C`, `Point 3C`, `Point 4B`, `Point 5B`, `Point 6A`)
  - [`spec/memory/R15-SEDIMENT.md`](memory/R15-SEDIMENT.md) (`D1`, `D2`, `D6`–`D11`, `D17`–`D19`, `D21`, `D23`–`D27`, `D31`, `D33`; settled `D1`–`D34` never reopened)
  - [`spec/memory/DESIGN-NOTE-CODE-GROUNDING.md`](memory/DESIGN-NOTE-CODE-GROUNDING.md) (every code claim verified at a named commit SHA or explicitly marked **`new`** / **`PROPOSED`**)
  - [`spec/memory/DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md`](memory/DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md) (zero view/board/canvas specification in Spec 3)
  - Cross-repo boundary contracts: [`spec/memory/contracts/engram-track.md`](memory/contracts/engram-track.md), [`spec/memory/contracts/engram-h2a.md`](memory/contracts/engram-h2a.md), [`spec/memory/contracts/engram-cluster-mesh.md`](memory/contracts/engram-cluster-mesh.md)
- **Amends (exact `Before → After` deltas in §6; target files untouched on disk in this lot):**
  - [`spec/SPEC_MEMORY_FINALIZATION.md`](SPEC_MEMORY_FINALIZATION.md) (`§0–§2`, lines `1–60`, coordinated with `Spec 2 §6.2` per `OQ-S2-5`)
  - [`plan/08-BRANCH_MEMORY_FINALIZATION.md`](../plan/08-BRANCH_MEMORY_FINALIZATION.md) (lines `198–222`)
- **Evidence Baseline Verified (`DESIGN-NOTE-CODE-GROUNDING.md`):**
  - `engram` worktree `HEAD` `f0c2928e600c41f7804cf4e3b84e27688150bb1d` (`origin/main` `f75543a5c8b220a741924e8eeac6610e3808c8ce`, `@sentropic/engram@0.28.0`):
    - *Exists today:*
      - `engram-memory/contracts/index.ts:41-54,72-99,419-443,1342-1389` (`DerivationLineageV1`, `RetentionV1`, `ReconciliationConsentV1`, `TrustBindingV1`, `MemoryRecordV2`, `MemoryOperation` including `'propose_capitalisation'` and `'propose_reconciliation'`, `MemoryState`, `CapitalisationRequestV1`, `MemoryPortV2`, `MemoryEngineDependenciesV2` with injected `ClockPort`);
      - `engram-memory/assertion-family-registry.ts:66,267-365` (`reconciliationProposalIdV1`, `createAssertionFamilyRegistryV1` read-only L5 assertion reconciliation);
      - `engram-memory/recall.ts:34,38,44,163,173,209-214` (`HALF_LIFE_MS = 2_592_000_000` 30-day recency half-life, `RRF_K = 60`, `PPR_ALPHA = 0.85`);
      - `engram-memory/module-storage-neutral.ts:42` (`'scope-outbox-v1'` neutral outbox storage profile);
      - `engram-memory/bounded-projection.ts:22-86` (`52_428_800` B `.graphify/graph.json` ceiling over `accepted_current` + `projection_eligible === true` envelopes only);
      - `engram-live/scheduler.ts:3-14,53-64,86-337` (`Scheduler`, `WorkPriority = 'interactive' | 'backfill'`, 3:1 `interactiveQuantum` / `backfillQuantum` `:117,173`, `backfillReserveBytes` `:35,141-145`, `ScopeFencingTokenDto` validation `:56,133,238`, injected `ports.clock` `:54`, durable `readProgress`/`writeProgress`/`park` `:58-63`);
      - `engram-live/retention.ts:64-229` (`RetentionPort`, `deriveRetentionRequests`, `runRetentionPass` with injected `now: number` `:74,101-105` and immutable pass-entry scope snapshot `:170-175`);
      - `src/mcp/memory/schemas.ts:3657-3789` (`validateMemoryToolSchemaDialectV1`, closed Draft 2020-12 objects, zero `$defs`/`$ref`);
      - `src/llm-execution.ts:8-20,191-197,246-306,497-565` (CLI-local LLM adapters and `DIRECT_LLM_PROVIDERS` — isolated from `@sentropic/engram` library subpaths by `Spec 1` `1-E2`/`1-E3` and never imported by `engram-memory` or dreaming modules).
    - *Does NOT exist yet (`new` / `PROPOSED`, verified via `rg -n "dream|dormant|lesson|scheduler|cron" engram-memory src` — zero dreaming, shadow-lesson, or memory-consolidation scheduler implementation exists in `engram-memory/` or `src/` today):*
      - `engram-memory/dreaming-contracts.ts` (`new`, Lot `3-E1`), `engram-memory/dreaming-triggers.ts` (`new`, Lot `3-E1`), `engram-memory/dreaming-shadow.ts` (`new`, Lot `3-E2`), `engram-memory/dreaming-promotion.ts` (`new`, Lot `3-E3`), `src/dreaming/promotion-contracts.ts` (`new`, Lot `3-E3`), `src/dreaming/index.ts` (`new`, Lot `3-E3`), `src/dreaming/harness-audit.ts` (`new`, Lot `3-E4`).
  - `sentropic` `origin/main` `913e3bcbc9dec9ff5f9db36eb3a1ef5a3dd11b7a` (`@sentropic/llm-mesh@0.38.0`, `@sentropic/cluster-mesh@0.26.0-dev.27`):
    - *Exists today:*
      - `packages/llm-mesh/src/mesh.ts:49-52,131,157-160` (`LlmMesh.generate`, `createLlmMesh`);
      - `packages/llm-mesh/src/routing-contracts.ts:13,54,197-285` (`VerifiedRoutingSubject`, `RoutePlanInput`, `PreparedRouteAttempt`, `RoutePlanner.plan`);
      - `packages/llm-mesh/src/decision/index.ts:2-10`, `decision/receipt.ts:65-66,79-80` (`DecisionClient.decide`, `RemoteDecisionClient`), `decision/client.ts:483-528`, `decision/request.ts:40-75` (closed 8-key `DecisionRequest`), `decision/request-policy.ts:4-6` (`budget.maxCostMicroUsd`, `timeoutMs`, `explanation`);
      - `packages/llm-gateway/src/route-flow-core.ts:49,62` and `packages/cluster-mesh/tests/fixtures/types/llm-consumer.ts:53,90` (`RouteMeteringSink`);
      - `packages/cluster-mesh/src/integrations/llm-mesh/decision.ts:1-3` (topology-guarded re-export of `@sentropic/llm-mesh/decision`) and `packages/cluster-mesh/src/compose/llm-mesh.ts:31-43` (`createLlmMeshNamespaceModule`);
      - `packages/cluster-mesh/src/engram-memory/manifest.ts:26`, `packages/cluster-mesh/src/storage/sqlite/index.ts:38,160-187` (`SqliteKernel` + `'scope-outbox-v1'`), `packages/cluster-mesh/src/storage/postgres/profiles.ts:11,50` (`'scope-outbox-v1'` Postgres profile), `packages/cluster-mesh/src/sessions/content-policy.ts:9,90,148` (`ContentPolicyV1`, `computeRetentionDeadline`);
      - `Makefile:1261` (`typecheck-api`), `:1265` (`typecheck-llm-mesh`), `:1283` (`typecheck-cluster-mesh`), `:1286` (`test-cluster-mesh`), `:1289` (`build-cluster-mesh`), `:1422` (`pack-cluster-mesh`), `:2460,2464` (`scope-check`), `:2887` (`test-llm-mesh`), `:3010,4067` (`test-api`, `test-api-%`), `:3284` (`up-api-test`).
    - *Does NOT exist yet (`new`):*
      - `packages/cluster-mesh/src/engram-memory/dreaming-local.ts` (`new`, Lot `3-S1a`), `packages/cluster-mesh/src/integrations/llm-mesh/dreaming-shadow-adapter.ts` (`new`, Lot `3-S1b`), `packages/cluster-mesh/src/engram-memory/dreaming-remote.ts` (`new`, Lot `3-S2`, gated on `Spec 6B`), `api/src/services/memory/dreaming-schedule-trigger.ts` (`new`, Lot `3-S3`, gated on `Spec 6B`); builds on `packages/cluster-mesh/src/compose/memory.ts` (`new` in `Spec 6A` Lot `6A-S1d`) and `ModelContentAuthorizationPolicyV1` (`new` in `Spec 2` Lot `2-S1a`).
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

### 0.2 View-Projection & Transport Boundaries (`DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md`, `R12`)

- **Zero View Specification:** Per [`spec/memory/DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md`](memory/DESIGN-NOTE-VIEW-PROJECTION-BOUNDARY.md), Spec 3 defines **zero** graphical views, canvases, dashboards, or board layouts. Dreaming writes only canonical memory journal records (`engram-memory`), recall-boost index rows consumed by `engram_memory_context` (`Spec 2`), neutral outbox/control proposals, and JCS-digested calibration/audit receipts. Projections for `Track`, `Focus`, and `Studio` belong exclusively to `Spec 5`.
- **Single Mesh Transport (`R12`):** All cross-process traffic between `h2a` / `Track` and `engram` transits `@sentropic/cluster-mesh` (`Spec 6A`). Dreaming introduces zero sidecar SQLite databases outside `SqliteKernel` / fenced `engram-memory`, zero `~/.h2a/` JSONL queues, and zero direct provider SDK calls outside `@sentropic/llm-mesh`.

---

## 1. The Dormant Dreaming Process: Placement, Triggers, Catch-Up, and Idempotency (`D19`, `D25`, `Point 3C`)

### 1.1 Two-Plane Placement Architecture (`Point 3C`, `D10=mandate`, `D17=degraded`)

Per `Point 3C` ([`OWNER-DECISIONS-2026-11-14.md:23`](memory/OWNER-DECISIONS-2026-11-14.md)), the dormant dreaming agent is partitioned across two strictly separated execution planes sharing the same pure L0-neutral domain logic in `engram-memory`:

| Pass / Trigger (`DreamingTriggerKindV1`) | Execution Plane (`Point 3C`) | `Spec 6B` Graph Sync Dependency | Primary Input Scope & `D10` Locality | Primary Outputs |
|---|---|---|---|---|
| **`nightly`** *(owner's « daily », `D19`, `D25`)* | **`embedded-local`** (workstation `cluster-mesh` over fenced SQLite + `session-db`) | **None** (runs 100% locally; `D17=degraded` safe) | Trailing local day's `session_turn`, `session_summary`, `tool_result`, and local `MemoryRecordV2` delta (`D10` stays local) | Forgotten permanent fact boosts (`D23`), L5 `proposeReconciliation` candidates, `D26` shadow drafts/verifications, `Track` proposals (`D1` + `Track` control) |
| **`mid-day`** *(`D19` « mi journee »)* | **`embedded-local`** | **None** | Half-day local session delta + `session_summary` compactions (`D10` stays local) | Intra-day forgotten permanent fact boosts (`D23`), unresolved `error`/`security-gate` consolidation, `D26` shadow drafts |
| **`context-saturation`** *(`D19` « a saturation du contexte »)* | **`embedded-local`** (event-driven on Spec 1 `context_saturation`) | **None** | Saturated session up to `throughOrdinal` + `session_summary` (`Spec 1 :295-299`) | Immediate pre-next-step permanent-fact recall boost (`D23`) & unresolved-blocker synthesis replacing linear rollover |
| **`weekly`** *(`D25`)* | **`external-host`** (`cluster-mesh` Postgres 16/17) | **`[DEPENDS ON SPEC 6B]`** (`GraphSyncBarrierReceiptV1` required) | Synced `(tenantId, workspaceId)` multi-branch/multi-worktree canonical graph (excludes untransferred `D10` local logs) | Cross-worktree permanent fact boosts (`D23`), multi-day contradiction reconciliation, `D26` shadow calibration & post-threshold promotions |
| **`monthly`** *(`D25`)* | **`external-host`** (`cluster-mesh` Postgres 16/17) | **`[DEPENDS ON SPEC 6B]`** (`GraphSyncBarrierReceiptV1` required) | Prior calendar month's synced `(tenantId, workspaceId)` canonical graph + `D26` rolling ledger | Long-horizon forgotten architectural invariants (`D23`), `TrackTemplateEvolutionRequestV1` (`Point 3C`), `spec/` review drafts (`D2`), `D26` threshold audit |
| **`cross-repository`** *(`comments-2026-11-08.md:24`, `Point 3C`)* | **`external-host`** (`cluster-mesh` Postgres 16/17) | **`[DEPENDS ON SPEC 6B]`** (`GraphSyncBarrierReceiptV1` across cohort) | Read-only `D9`-bounded (`<= 30` repos, `<= 183` days), `D7`/`D8`/`D33`/`D6`-armored multi-repo harness telemetry | `MasterHarnessAuditProposalV1` to `h2a` (`D2=review`, `Point 4B`); single-repo patterns kept local (`D31`) |

> **Wire Literal Parity With `Spec 2` (`Spec 2 §2.2 :508`):** The five workspace-level recall triggers (`'nightly' | 'weekly' | 'monthly' | 'mid-day' | 'context-saturation'`) match `EngramMemoryContextPackV1.mission_focus_context.dreaming_recalled_facts[].trigger` byte-for-byte. `'cross-repository'` targets `sentropic.h2a-harness-and-skills` (§4) and never injects cross-workspace records into a single repository's `dreaming_recalled_facts`.

### 1.2 Neutral Contracts, Cadences, and Event Trigger Predicates (`new`, Lot `3-E1`)

Following `engram-live/scheduler.ts:54` and `engram-live/retention.ts:73-74,101-105`, `engram-memory` reads **no ambient system clock** (`Date.now()` is forbidden in `engram-memory/**`); evaluation timestamps (`nowMs`) and IANA local calendar projections are injected through `ClockPort` (`engram-memory/contracts/index.ts:1388`):

```typescript
// new (Lot 3-E1): engram-memory/dreaming-contracts.ts
import type { Cursor, Digest, IdempotencyKey, Instant, OpaqueRef } from './contracts/index.js';

export type WorkspaceDreamingTriggerKindV1 =
  | 'nightly'
  | 'mid-day'
  | 'context-saturation'
  | 'weekly'
  | 'monthly';

export type DreamingTriggerKindV1 = WorkspaceDreamingTriggerKindV1 | 'cross-repository';

export type DreamingExecutionPlaneV1 = 'embedded-local' | 'external-host';

/**
 * Required before any 'weekly', 'monthly', or 'cross-repository' pass executes (Point 3C).
 * Produced by Spec 6B integral DB-cluster sync (D24=integral).
 */
export interface GraphSyncBarrierReceiptV1 {
  readonly schema_version: 1;
  readonly tenant_id: string;
  readonly synced_workspace_ids: readonly string[]; // sorted, non-empty (<= 30 for cross-repository per D9)
  /** Per-workspace acknowledged canonical journal high-water cursor after Spec 6B sync. */
  readonly high_water_cursors: ReadonlyArray<{
    readonly workspace_id: string;
    readonly through_cursor: Cursor;
    readonly synced_at: Instant;
  }>;
  /** Non-empty only when an enrolled workstation remained offline past sync grace window (OQ-S3-3). */
  readonly lagging_replica_ids: readonly string[];
  readonly barrier_digest: Digest;
}

export interface DreamingPassSchedulePolicyV1 {
  readonly schema_version: 1;
  readonly policy_profile_id: string;
  /** Local IANA timezone for workstation 'nightly' and 'mid-day' anchors (e.g. 'America/Toronto'). */
  readonly local_iana_timezone: string;
  readonly local_nightly_hour: number;            // default: 2 (02:00 local)
  readonly local_midday_window_hours: readonly [number, number]; // default: [12, 14] (13:00 anchor)
  readonly min_quiescence_before_scheduled_ms: number; // default: 300_000 (5 min idle)
  readonly saturation_token_ratio_threshold: number;   // default: 0.80 (bounded to [0.70, 0.95])
  readonly saturation_min_turn_delta: number;          // default: 8 turns since last saturation pass
  readonly saturation_min_byte_delta: number;          // default: 16_384 UTF-8 bytes
  readonly remote_weekly_utc_day_hour: readonly [number, number];  // default: [1, 3] (Monday 03:00 UTC)
  readonly remote_monthly_utc_day_hour: readonly [number, number]; // default: [1, 4] (1st 04:00 UTC)
  readonly remote_cross_repo_utc_day_hour: readonly [number, number]; // default: [0, 5] (Sunday 05:00 UTC)
  readonly policy_digest: Digest;
}
```

**Exact Trigger Firing Predicates (`evaluateDreamingTriggersV1`, `new` Lot `3-E1`):**

1. **`nightly` (`embedded-local`, default `02:00` local IANA time — owner's « daily », `D19` + `D25`):**
   - Canonical window ID: `local-day:<YYYY-MM-DD>` (the most recently closed local `02:00` boundary at `nowMs`).
   - Fires when `lastWatermark.nightly.windowId < currentLocalDayWindowId`, `currentJournalCursor > lastWatermark.nightly.throughCursor`, and local interactive session activity has been quiescent for `>= min_quiescence_before_scheduled_ms` (`300_000 ms`, or runs immediately inside the `'backfill'` queue of `Scheduler` with 3:1 `interactive:backfill` fairness per `engram-live/scheduler.ts:117,173`).
2. **`mid-day` (`embedded-local`, default `12:00–14:00` local slot — `D19` « mi journee »):**
   - Canonical window ID: `local-midday:<YYYY-MM-DD>`.
   - Fires at most once per local calendar date when **either**:
     - *(Time + Activity Trigger):* local wall time is inside `[12:00, 14:00]`, at least one `session_summary` (`Spec 1 §1.5`: `24` turns or `65_536` UTF-8 bytes) or `>= 1` closed session has been recorded since `max(lastWatermark.nightly.throughCursor, lastWatermark.midday.throughCursor)`, and workspace interactive turns have been quiescent for `>= 300_000 ms`; **or**
     - *(Inter-Session Burst Trigger):* `>= 14_400_000 ms` (`4 hours`) have elapsed since the previous local dreaming pass AND `>= 3` sessions have closed in the workspace during the current local day.
3. **`context-saturation` (`embedded-local`, event-driven — `D19` « a saturation du contexte »):**
   - Canonical window ID: `sat:<sessionId>:<throughOrdinal>`.
   - Triggered directly by Spec 1's `RawSessionEventPayload` of `kind: 'context_saturation'` (`{ kind: 'context_saturation', hostId, observedTokenRatio, throughOrdinal }`, `Spec 1 :295-299`) immediately **after** Spec 1's synchronous `session_summary` compaction + extraction sweep (`extractionSweepScheduled: true`, `Spec 1 :370`) commits `throughOrdinal`.
   - **Anti-Thrash Hysteresis Guard:** Fires if and only if `observedTokenRatio >= saturation_token_ratio_threshold` (`0.80`), `throughOrdinal > lastSaturationOrdinal(sessionId)`, and at least `saturation_min_turn_delta` (`8` turns) or `saturation_min_byte_delta` (`16_384` bytes) were ingested since `lastSaturationOrdinal(sessionId)`. Oscillating token ratios near `0.80` without new turns are deterministically ignored.
4. **`weekly`, `monthly`, and `cross-repository` (`external-host`, `[DEPENDS ON SPEC 6B]`):**
   - Canonical window IDs: `iso-week:<YYYY-Www>:rev<r>`, `utc-month:<YYYY-MM>:rev<r>`, and `cross-repo:<YYYY-Www>:rev<r>`.
   - **Fail-Closed Sync Precondition:** `evaluateDreamingTriggersV1` **refuses** (`MISSING_GRAPH_SYNC_BARRIER`) any remote trigger lacking a cryptographically digest-valid `GraphSyncBarrierReceiptV1` whose `high_water_cursors` advance past the previous completed remote watermark for that cadence.

### 1.3 Catch-Up After Powered-Off / Offline Periods (`CatchUpPolicyV1`)

Workstations power off overnight, over weekends, and across multi-week vacations, while `external-host` may remain unreachable during airplane/offline work (`D17=degraded`). Persistent watermarks (`DreamingWatermarkRowV1`, `new` Lot `3-S1a`, stored in `SqliteKernel` locally and Postgres remotely) govern deterministic catch-up on daemon startup (`h2a drumbeatTick` at `packages/h2a/src/runtime/drumbeat/watch.ts:88` / `mcp-central` / `SessionStart`):

1. **Zero-Activity Fast-Forward (Zero Wasted Model Calls):**
   - If $M \ge 1$ scheduled windows (`nightly`, `mid-day`, `weekly`, `monthly`) elapsed while the machine was powered off or idle **and** `currentJournalCursor === lastWatermark[trigger].throughCursor` (zero new journal events or session turns occurred across the entire missed span), the scheduler records a zero-LLM `DreamingEmptyWindowReceiptV1` advancing `lastCompletedWindowId` to the latest closed window in $O(1)$ time with **zero** `@sentropic/llm-mesh` invocations.
2. **Coalescing Multiple Missed `nightly` Windows Into One `'backfill'` Pass:**
   - If $M \ge 1$ local `nightly` boundaries elapsed while the workstation was powered off (e.g., laptop closed Friday `18:00` → powered on Monday `09:00`, missing `Fri`, `Sat`, `Sun` `02:00` boundaries) **and** `currentJournalCursor > lastWatermark.nightly.throughCursor`, the scheduler **never** spawns $M$ sequential `nightly` passes.
   - Instead, it enqueues **exactly one coalesced `nightly` catch-up pass** over `(lastWatermark.nightly.throughCursor .. currentJournalCursor]` tagged with `canonicalWindowId = latestMissedLocalDayWindowId` and `coalescedWindowIds: ['local-day:2026-11-13', 'local-day:2026-11-14', 'local-day:2026-11-15']`.
   - Catch-up executes strictly at `priority: 'backfill'` (`engram-live/scheduler.ts:4,35,141-145,173`), preserving `backfillReserveBytes` headroom and 3:1 `interactive:backfill` quantum scheduling so waking a laptop never delays interactive `engram_memory_context` (`D15`) or Spec 1 turn capture.
3. **Missed `mid-day` Windows Are Never Backfilled:**
   - A `mid-day` window whose `12:00–14:00` slot has already passed while the machine was powered off (or when an overdue `nightly` catch-up pass is pending) transitions directly to `superseded_by_nightly` with zero separate execution.
4. **Interrupted `context-saturation` Recovery:**
   - If the workstation crashed or powered off after recording `kind: 'context_saturation'` at `throughOrdinal` in `session-db` (`Spec 1`) before completing the saturation dreaming pass:
     - if a coalesced `nightly` catch-up pass runs first and its `throughCursor` already covers `throughOrdinal`, the pending saturation item resolves as `superseded` (`engram-live/scheduler.ts:39,246-261`);
     - otherwise, resuming that session runs the single pending `sat:<sessionId>:<throughOrdinal>` pass once before assembling the next step.
5. **Offline Workstation Reconnect Into Already-Closed Remote Windows (`late-sync-amendment`, `[DEPENDS ON SPEC 6B]`):**
   - When a workstation worked offline under `D17=degraded` while `external-host` already executed `iso-week:2026-W46:rev0`, and the workstation subsequently reconnects and completes `Spec 6B` sync: if the newly synced journal delta contains `>= 1` admitted `MemoryRecordV2` or allowed summary whose `primary_event.at` (`engram-memory/contracts/index.ts:36`) falls inside `2026-W46`, `external-host` schedules bounded amendment pass `iso-week:2026-W46:rev1` (`revisionOrdinal = prevRevision + 1`, capped at `maxLateSyncRevisionsPerWindow = 3`, folding any tail beyond `rev3` into the next `weekly` window).

### 1.4 Deterministic Three-Layer Idempotency & Tombstone Revalidation

1. **Layer 1 — Pass-Level JCS Idempotency Key (`DreamingPassIdempotencyKey`):**
   Every pass derives its immutable key before acquiring any lease or making any `@sentropic/llm-mesh` call:
   ```typescript
   // new (Lot 3-E1): engram-memory/dreaming-triggers.ts
   export function computeDreamingPassIdempotencyKeyV1(input: {
     readonly plane: DreamingExecutionPlaneV1;
     readonly tenant_id: string;
     readonly workspace_scope_digest: Digest; // sha256_jcs(sorted workspaceIds)
     readonly trigger: DreamingTriggerKindV1;
     readonly canonical_window_id: string;
     readonly from_journal_cursor: Cursor;
     readonly through_journal_cursor: Cursor;
     readonly policy_digest: Digest;
   }): IdempotencyKey; // returns `idem:dream:v1:${sha256Hex(canonicalJcsBytes(input))}`
   ```
   Duplicate wakeups, overlapping `drumbeatTick` + `SessionStart` hooks, or retried remote cron dispatches bearing the same tuple hit the unique `(tenant_id, pass_idempotency_key)` constraint in `SqliteKernel` / Postgres `scope-outbox-v1` (`packages/cluster-mesh/src/storage/root-profiles.ts:10,25`) and return the existing `DreamingPassReceiptV1` with **zero** duplicate model calls.
2. **Layer 2 — Artifact-Level Child Idempotency Keys:**
   Every output emitted by a pass (`DreamingRecallBoostIndexRowV1`, `ShadowLessonDraftV1`, `Track` typed proposal, `TrackTemplateEvolutionRequestV1`, `MasterHarnessAuditProposalV1`) derives a deterministic child key:
   `idem:dream-item:v1:${sha256_jcs({ pass_idempotency_key, artifact_kind, canonical_subject_key, sorted_citation_digests })}`.
   If a pass crashes mid-flight after emitting $k$ of $n$ items, crash recovery replays items $1..k$ as exact idempotent acknowledgements (`MemoryPortV2.capture` duplicate-capture ack in `canonical-memory-store.parity.test.ts` / `ScopeOutbox` dedup) and executes only $k+1..n$.
3. **Layer 3 — Post-LLM Fence, Epoch, & Tombstone Revalidation (`Zero Resurrection Guarantee`):**
   Before committing any pass output after an async `@sentropic/llm-mesh` round-trip, the runner validates:
   - the active `ScopeFencingTokenDto` (`engram-live/scheduler.ts:192,238,247` — aborting with `FENCE_LOST` / `fenced` if storage epoch rotated); and
   - every cited `source_record_id` and `session_turn` against the live canonical store: if any cited source transitioned to `tombstoned` (`engram_memory_forget`), `withdrawn` (`engram_memory_withdraw`), `rejected`, or matched an updated `ConfidentialityDenyListV1` (`D7`) while the pass was running, that candidate is dropped (`omitted_source_invalidated`) and **never** written (`SPEC_MEMORY_MCP_V2.md:898`).

---

## 2. `D26` (`two-tier-shadow`): Two-Tier Shadow Lesson Drafting, Independent Verifier, and Measured Threshold

### 2.1 Settled Rule & Zero-LLM vs LLM-Drafted Separation

Settled `D26` (`two-tier-shadow`, [`spec/memory/R15-SEDIMENT.md:71`](memory/R15-SEDIMENT.md)):
> *"Dreaming may later have lessons drafted by a language model, in shadow. One model drafts, an independent verifier checks, and nothing is shown to the owner before the measured threshold"*.

To prevent any conflation between deterministic graph maintenance and generative lesson synthesis:
- **Deterministic Graph Resynthesis (Zero LLM Calls — Active Immediately):** Re-indexing already-ratified `accepted_current` permanent records whose short-term recency decayed (`D23`, §3.1) and running deterministic L5 assertion-family comparisons (`createAssertionFamilyRegistryV1` in `engram-memory/assertion-family-registry.ts:267-365`) invoke **zero** language models and expose only already-ratified `accepted_current` records.
- **Model-Drafted Lessons & Generative Proposals (`D26` Two-Tier Shadow — Strictly Quarantined Until Threshold):** Every lesson, synthesized cross-session rule, LLM-synthesized `Track` proposal/template request, `spec/` amendment draft, or `h2a` harness audit proposal drafted by a language model executes inside the **Two-Tier Shadow Pipeline** below. **Nothing** drafted by this pipeline reaches the owner, `engram_memory_context`, `Track`, `h2a`, or any UI/notification surface while `ShadowCalibrationGateV1.gate_state !== 'threshold_met_eligible'`.

### 2.2 Tier 1 (Shadow Drafter) & Tier 2 (Independent Blind Verifier)

```typescript
// new (Lot 3-E2): engram-memory/dreaming-shadow.ts
import type { CitationV1, Digest, IdempotencyKey, Instant } from './contracts/index.js';
import type { DreamingTriggerKindV1 } from './dreaming-contracts.js';

export type ShadowLessonTargetDomainV1 =
  | 'engram-permanent-lesson'
  | 'track-typed-proposal'
  | 'track-template-request'
  | 'h2a-master-harness-audit'
  | 'h2a-repo-overlay-proposal'
  | 'spec-amendment-draft';

export interface ShadowLessonDraftV1 {
  readonly schema_version: 1;
  readonly draft_id: string;
  readonly pass_idempotency_key: IdempotencyKey;
  readonly trigger: DreamingTriggerKindV1;
  readonly target_domain: ShadowLessonTargetDomainV1;
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
    readonly model_family: string; // e.g. 'claude' | 'gemini' | 'gpt' | 'mistral'
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
    readonly model_family: string;
    readonly evaluator_id: string;
    readonly evaluator_revision: string;
    readonly decision_receipt_digest: Digest;
  };
  readonly verified_at: Instant;
  readonly receipt_digest: Digest;
}
```

**Four Mandatory Independence & Isolation Rules Between Tier 1 and Tier 2:**

1. **Strict Model-Family Disjointness (`Anti-Collusion Invariant`):**
   - `verifier_receipt.model_family !== drafter_receipt.model_family` is **mandatory** on every shadow verification, and whenever `RoutePlanner.listEligible(subject)` (`sentropic:packages/llm-mesh/src/routing-contracts.ts:209`) yields `>= 2` distinct providers, `verifier_receipt.provider_id !== drafter_receipt.provider_id` is enforced as well.
   - If the tenant's `@sentropic/llm-mesh` enrollment currently exposes only a single model family, `ClusterMeshDreamingLlmAdapter` (`Lot 3-S1b`) refuses Tier-2 execution with `'verifier_independence_unavailable'` and leaves the draft in `'shadow_unverified'` — **the drafting model family can never verify its own drafts**.
2. **Zero Shared Prompt / Zero Chain-of-Thought Leakage (`Blind Verification`):**
   - Tier 2 receives **only**:
     - `ShadowLessonDraftV1.statement` and `target_domain`;
     - the canonical evidence records independently re-fetched by `citation_id` / `content_digest` from the canonical store (never trusting text echoed by Tier 1);
     - active ratified `owner_decisions` and `harness_effective_rules` in scope; and
     - the registered criterion `engram.dreaming.shadow-lesson-verify/v1`.
   - Tier 2 **never** receives Tier 1's system/user prompt, reasoning trace, self-confidence, or `drafter_receipt`.
3. **Closed `@sentropic/llm-mesh/decision` Verdict Execution:**
   - Tier 2 runs exclusively through `DecisionClient.decide` (`packages/llm-mesh/src/decision/receipt.ts:65-66`, `request.ts:40-75` closed 8-key `DecisionRequest`) with `decision: { kind: 'threshold', field: 'score', op: '>=', value: 80 }`. Any citation mismatch, contradiction of a ratified `owner_decision`, or `D6`/`D7`/`T-M-C` violation forces `verdict !== 'pass'` and `score = 0`.
4. **Seeded Synthetic Negative-Control Canaries (`Non-Vacuity Proof`):**
   - Every shadow batch with `>= 1` draft deterministically synthesizes **at least one** unmarked negative-control canary (created by either swapping a `CitationV1.content_digest` to an unrelated record's text or negating an `accepted_current` `owner_decision` in scope) and submits it through the exact same `DecisionClient.decide` call path (never persisted as a real draft).
   - A verifier that rubber-stamps all inputs immediately fails the canary (`canary_false_pass_count > 0`) and trips the calibration circuit breaker (§2.3).

### 2.3 Formal Threshold Metric & Passive Shadow Measurement (`ShadowCalibrationGateV1`)

Because **`D26` forbids showing anything to the owner before the measured threshold**, the threshold metric CANNOT depend on asking the owner to grade lessons prior to threshold attainment. Instead, `engram` measures shadow quality passively over a rolling calibration ledger combining **(a) independent Tier-2 verification**, **(b) seeded negative-control canaries**, and **(c) passive prospective delayed-outcome validation against subsequent organic repository events**:

1. **Passive Prospective Outcome Resolution (`prospective_confirmed` vs `prospective_refuted`):**
   Every Tier-2-passing shadow draft (`verdict === 'pass'`, `visibility: 'shadow_internal_only'`) registers its `watch_signature` over subsequent sessions, owner events, and merged PRs during an observation horizon $[t_{\text{draft}},\, t_{\text{draft}} + \Delta_{\text{obs}}]$ (default $\Delta_{\text{obs}} = 14\text{ days}$ or $\ge 5$ subsequent sessions in the workspace):
   - **`prospective_confirmed`:** Subsequent organic workspace activity independently validates the lesson without having been shown it — specifically: (i) a verified `owner.answer` / `owner.request` (`Spec 1`), merged PR (`pr.merged`), or ratified `Track` item/spec amendment independently states or codifies the same cited file/symbol/rule invariant (`BM25F` + citation overlap above confirmation threshold verified by Tier-2 evaluator), **or** (ii) a subsequent session lacking the quarantined lesson encounters the exact predicted `error` / `security-gate` failure on `watch_signature.cited_path_fingerprints` before resolving it.
   - **`prospective_refuted`:** A subsequent ratified `owner_decision`, merged PR, `tombstone` (`forget`), or `TrackControlVerdict` contradicts the shadow draft's statement or invalidates its premise.
   - **`prospective_unobserved`:** Neither confirmed nor refuted within $\Delta_{\text{obs}}$ (tracked separately; cannot inflate `confirmed`).

2. **Exact Five-Clause Threshold Predicate (`evaluateShadowCalibrationGateV1`, `new` Lot `3-E2`):**
   Evaluated per calibration cohort `(policy_profile_id, drafter_model_family, verifier_evaluator_id, target_domain)` over the trailing `90`-day rolling window:
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

## 3. Promotion (`D1`, `D2`, `T-M-C`, `Point 3C`) and Surfacing in the Seventh Tool (`D23`)

### 3.1 What Surfaces in `engram_memory_context` (`D23`) and How

Per `D23` (`« Le mode dreaming veenant rappelera des choses permanentes oubliees sur le court terme. »`, [`R15-SEDIMENT.md:68`](memory/R15-SEDIMENT.md)) and `Spec 2 §2.2` (`:506-515`) & `§3.1` (`:770`), dreaming populates **only** the `mission_focus_context.dreaming_recalled_facts` slot of the seventh MCP tool (`engram_memory_context`), under strict admissibility and privacy invariants:

1. **Short-Term Forgotten Permanent Fact Detection (`selectForgottenPermanentFactsV1`, `new` Lot `3-E3`):**
   A canonical `MemoryRecordV2` $r$ in `(tenantId, workspaceId)` receives a `DreamingRecallBoostIndexRowV1` from a `nightly`, `mid-day`, `context-saturation`, `weekly`, or `monthly` pass if and only if **all five** conditions hold:
   - **Ratified Current State:** `state(r) === 'accepted_current'` (`engram-memory/contracts/index.ts:421` — either an already-ratified permanent decision/constraint/fact, or a post-`D26`-threshold dreamed lesson that has subsequently been admitted to `accepted_current` via third-party review under `D1=borne-review`);
   - **Permanent Validity:** `r.retention.expires_at === undefined` (`engram-memory/contracts/index.ts:47-50`) and `r.valid_time.t_end === undefined` (`:8-11`);
   - **Short-Term Attention Omission (« oubliées sur le court terme »):** $r$ was **absent** from the delivered `mission_focus_context` across the trailing $K_{\text{omit}} = 8$ step context packs (or current saturated session) in the active worktree/branch because its 30-day temporal factor (`Math.exp((-Math.LN2 * age) / HALF_LIFE_MS)` in `engram-memory/recall.ts:34,173`) or single-step lexical `BM25F` score fell below recent turn items;
   - **Graph-Structural Relevance:** $r$ lies within $\le 3$ citation/entity hops of files, symbols, `Track` items, or `.h2a/` rules touched in the window's session activity (lift-over-background PPR $> 0$); and
   - **Clean Privacy Screening:** $r$ passes `ConfidentialityDenyListV1` (`D7`) and `PiiArmorStamp` (`D8`).

2. **Attention Boost & Exact Wire Shape in `engram_memory_context` (`Spec 2` Alignment):**
   - `MemoryContextPortV1.assembleContext` (`Spec 2 §3.1 :770`) assigns boosted permanent facts **`W_class = 2.10` and `D_recency = 1.00`** (cancelling 30-day recency decay while keeping ratified direct `owner_decisions` higher at `W_class = 2.50`), packs whole items inside the caller's token/byte budget (`Spec 2 §2.1 :192`), and emits exact closed Draft 2020-12 entries in `context_pack.mission_focus_context.dreaming_recalled_facts[]`:
     ```typescript
     // Exact Spec 2 §2.2 (:506-515) wire shape — zero schema drift
     {
       readonly id: string; // canonical accepted_current MemoryRecordV2.record_id
       readonly trigger: 'nightly' | 'weekly' | 'monthly' | 'mid-day' | 'context-saturation';
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

### 3.2 Four-Path Promotion Matrix (`D1=borne-review`, `D2=review`, `T-M-C`, `Point 3C`, `Point 5B`)

Every candidate produced by dreaming beyond recall-boost indexing of already-ratified records is governed by the strict promotion matrix below. **No dreamed candidate is ever self-applied by the dreaming agent (`D1`), no `D26` LLM-drafted candidate leaves shadow before `gate_state === 'threshold_met_eligible'`, and no mechanical or substantive spec/harness change bypasses review (`D2`).**

| Candidate Kind | Gate 0 (`D26` Shadow Threshold) | Gate 1 (`D1=borne-review` Third-Party Rule) | Gate 2 (`T-M-C` / `D2=review` Sole Authority) | Wire Carrier Over `@sentropic/cluster-mesh` (`R12`) | State Before Final Verdict |
|---|---|---|---|---|---|
| **1. Cross-session `engram` permanent lesson (`MemoryRecordV2`)** | Mandatory (`calibration_receipt_digest` verified `threshold_met_eligible`) | `promotion-third-party-review` (`Spec 0 :944`): captured as `pending` with `DerivationLineageV1`; `dreamingServiceNhiId` **forbidden** from admitting | Admitted to `accepted_current` only by authorized third-party human/conductor via `MemoryPortV2.requestAdmission` | `/memory/v1/session-front/*` / `MemoryPortV2.capture` (`purpose_ref: 'memory.dreaming.synthesis/v1'`) | `pending` (invisible to `M1` tools & `dreaming_recalled_facts`) |
| **2. Typed write in the `Track` domain (item, blocker, link, demand)** | Mandatory if LLM-drafted; `AssertionFamily` receipt if deterministic | `promotion-third-party-review` (`D1` + `Point 3C`): author (`dreamingServiceNhiId`) cannot approve; held for authorized third-party reviewer | **Mandatory `Track` control (`verdictAuthority: 'track'`, `Point 3C`, `Point 5B`):** cites `TrackTemplateRef` (`lineage: 'track'`); `Track` alone validates & emits `TrackControlVerdict` | `POST /memory/v1/control/proposals` → `Track` `GET /memory/v1/control/proposals?status=proposed` → `POST /memory/v1/control/verdicts` (`engram-track.md:107-149`) | `reviewStatus: 'proposed'` (excluded from `domain_typed_envelopes`, `.graphify/graph.json`, & `.track/` PR slices) |
| **3. Change touching a `Track` template (`TrackTemplateEvolutionRequestV1`)** | Mandatory (`threshold_met_eligible`) | Third-party human/conductor review (`D1`) | **`Point 3C` + `T-M-C`:** Request to **`Track`**, which **alone accepts it** (or routed first to **`engram`** if `proposed_change_kind === 'requires_new_metamodel_construct'`). Dreaming **never** calls `registerTrackTemplateVersion` | `POST /memory/v1/dreaming/template-requests` → `Track` inbox (`Lot 3-H2`, zero direct DB mutation) | `status: 'requested'` (existing `Track` template version remains sole active schema) |
| **4. `spec/` amendment or `h2a` harness / overlay proposal** | Mandatory (`threshold_met_eligible`) | Never applied by author (`D1`; `SpecAmendPayload.proposalRef` in `h2a:packages/track/src/model/spec-amend.ts:37-40` preserves machine provenance) | **`D2=review`:** Waits for explicit human/conductor review (even if purely mechanical). `lineage: 'h2a'` master harness accepted **only by `h2a`** (`Point 4B`); `.h2a/` overlay accepted **only in target repo** (`D31`) | `SpecAmendmentProposalV1` / `MasterHarnessAuditProposalV1` / `RepoOverlayEvolutionProposalV1` over `/memory/v1/dreaming/proposals` | `status: 'proposed'` (zero direct file or Git branch write) |

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

---

## 4. Cross-Repository Master Harness Audit (`comments-2026-11-08.md:24`, `Point 3C`, `Point 4B`, `D31`)

> **`[DEPENDS ON SPEC 6B]` Hard Dependency:** The cross-repository harness audit runs **exclusively remotely (`external-host`) after `Spec 6B` integral DB-cluster graph sync** has produced a valid `GraphSyncBarrierReceiptV1` across the participating workspaces within the tenant (`Point 3C`).

### 4.1 Multi-Repository Privacy, Confidentiality, and Study Bounds (`D6`, `D7`, `D8`, `D9`, `D10`, `D33`)

Before any cross-repository aggregation or `@sentropic/llm-mesh` call executes on `external-host`, `runCrossRepoHarnessAuditV1` (`new`: `src/dreaming/harness-audit.ts`, Lot `3-E4`) enforces five fail-closed boundaries:

1. **Explicit Per-Repository Enrollment & `D9` Bounded Study Ceiling (`R15-SEDIMENT.md:54`):**
   - Includes only workspaces inside the **exact same `tenantId`** (zero cross-tenant aggregation under any circumstance) that carry an active `crossRepoHarnessAuditOptIn: true` policy receipt.
   - Enforces `D9` hard ceilings: **`<= 30` workspaces** (`MAX_STUDY_PROJECTS = 30`) and **`<= 183` days (`6` months)** lookback (`MAX_STUDY_WINDOW_DAYS = 183`), operating strictly over a **read-only projection** that never writes back into any workspace's canonical memory journal.
2. **`D10=mandate` Raw Context Exclusion:**
   - Workstation-local `context_summary` / context logs remain excluded unless explicitly transferred under both the `h2a` mandate's transfer policy and the repository's policy (`R15-SEDIMENT.md:55`).
3. **`D7` `ConfidentialityDenyListV1` + `D8` `PiiArmorStamp`:**
   - Every candidate observation matching a workspace's `ConfidentialityDenyListV1` is dropped prior to cross-workspace join; surviving structured telemetry passes `PiiArmorStamp`.
4. **`D33` Workspace, Principal, & Path Pseudonymization:**
   - Cross-repository synthesis projects observations onto canonical `lineage: 'h2a'` identifiers (`ruleId`, `skillId`, `roleId`, `hookEventKind`, `gateErrorCode` from `sentropic.h2a-harness-and-skills`) and replaces workspace IDs, session IDs, principal IDs, and repository-local paths with domain-separated `HMAC-SHA256` pseudonyms (`D33`). No repository's proprietary file tree, symbol names, or business prose ever appears in a `MasterHarnessAuditProposalV1`.
5. **`D6=refs` Cohort-Intersection Rule:**
   - External-model prose synthesis is permitted **if and only if every workspace in the audit cohort** holds `ModelContentAuthorizationPolicyV1.contentAuthorized === true` for the target `modelEndpointClass`. If even one participating workspace is `'refs_only_d6'`, the entire cross-repo pass executes in `refs_only_d6` structural-telemetry mode (aggregating rule-ID override counts, gate failure frequencies, rework ratios, and fingerprints only, with zero prose excerpts sent to the model).

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

## 5. Exclusive `@sentropic/llm-mesh` Model Routing (`Spec 1` & `Spec 6A` Alignment)

Per `Spec 6A §2.5` (`:418-451`) and `Spec 1 §2.1` (`1-E2`/`1-E3`), **100% of language-model and evaluator invocations** performed by dormant dreaming (Tier-1 shadow drafting, Tier-2 independent verification, prospective confirmation matching, and post-`Spec 6B` cross-repo harness synthesis) route **exclusively through `@sentropic/llm-mesh` (`>=0.38.0 <0.39.0`) and `@sentropic/llm-mesh/decision`**:

1. **Strict Package & Import Isolation (`G-FENCE` / L0 Neutrality):**
   - `engram-memory/**` imports **zero** `@sentropic/*`, `@ai-sdk/*`, provider SDKs, or `src/llm-execution.ts` (`tests/memory-neutrality.test.ts` AST + packed-tarball guard).
   - `src/dreaming/*` in `@sentropic/engram` defines only pure DTOs, deterministic graph selectors, and neutral port interfaces (`ShadowLessonDrafterPortV1`, `ShadowLessonVerifierPortV1`, `HarnessAuditSynthesizerPortV1`). It **never** imports `src/llm-execution.ts` (`DIRECT_LLM_PROVIDERS`, `createDirectTextJsonClient`, or `process.env.*_API_KEY` at `src/llm-execution.ts:12,246-306,497`).
   - Concrete model execution lives **solely** in `packages/cluster-mesh/src/integrations/llm-mesh/dreaming-shadow-adapter.ts` (`new`, Lot `3-S1b`), consuming `LlmMesh.generate` (`packages/llm-mesh/src/mesh.ts:52,157`) and topology-guarded `packages/cluster-mesh/src/integrations/llm-mesh/decision.ts:1-3` (`DecisionClient.decide`, `packages/llm-mesh/src/decision/receipt.ts:65-66`).

2. **`VerifiedRoutingSubject` (`WP16 D0`), `RouteMeteringSink` (`BR-47`), & Closed 8-Key `DecisionRequest`:**
   - Every dreaming model call requires a verified `VerifiedRoutingSubject` (`packages/llm-mesh/src/routing-contracts.ts:13`) binding `(tenantId, workspaceId, principalId: dreamingServiceNhiId, purpose)` — ambient or unattributed background calls are refused before adapter dispatch.
   - Every Tier-1 `RoutePlanner.plan` (`routing-contracts.ts:254`) / `PreparedRouteAttempt.generate` (`:200`) and Tier-2 `DecisionClient.decide` (`decision/client.ts:490`) settles token and micro-USD cost through `RouteMeteringSink` (`packages/llm-gateway/src/route-flow-core.ts:49,62`, wired via `chat-mesh C2a`) tagged with `(pass_idempotency_key, trigger, tier: 'shadow-drafter' | 'shadow-verifier' | 'harness-audit')`, capped by explicit per-pass `maxCostMicroUsd` (`decision/request-policy.ts:4-6`).
   - Every Tier-2 call constructs a strictly conformant 8-key `DecisionRequest` (`packages/llm-mesh/src/decision/request.ts:70`: `['schemaVersion', 'evaluator', 'inputs', 'criterion', 'decision', 'policy', 'raw', 'correlationId']`), passing zero foreign properties (`hasOnlyKeys` enforced at `validation.ts:11`).

3. **Pre-Serialization `D6=refs` & `D7`/`D8` Egress Firewall Inside the Adapter:**
   - Before serializing any prompt or `DecisionRequest.inputs` to `PreparedRouteAttempt` or `DecisionClient`, `ClusterMeshDreamingLlmAdapter` resolves `ModelContentAuthorizationPolicyV1` (`Spec 2 §4.2 :835-846`) for `(tenantId, workspaceId, candidateEndpointClass)` and verifies the host `ConfidentialityDenyListV1` (`D7`) + `PiiArmorStamp` (`D8`) screening receipt.
   - When `contentAuthorized !== true` (`'refs_only_d6'`), all file bodies, turn excerpts, and prose fields are stripped before leaving `cluster-mesh`, transmitting only `(path_ref, content_fingerprint)` and canonical digests (`R15-SEDIMENT.md:51`).

---

## 6. Exact Specification & Plan Amendments (`Before → After` Deltas)

> **Rule Reminder:** Target files [`spec/SPEC_MEMORY_FINALIZATION.md`](SPEC_MEMORY_FINALIZATION.md) and [`plan/08-BRANCH_MEMORY_FINALIZATION.md`](../plan/08-BRANCH_MEMORY_FINALIZATION.md) are **not modified** on disk in this lot. Per `D2=review` and `Spec 2 OQ-S2-5` (`SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md:1615-1616`), these exact line-anchored deltas apply in coordinated mechanical documentation fold Lot `3-E5` after Spec 3 completes adversarial review.

### 6.1 Amendment to `spec/SPEC_MEMORY_FINALIZATION.md` (`§0–§2`, lines `1–60`)

> **Coordinated Fold Note (`Spec 2 §6.2` + `Spec 3 §6.1`, `OQ-S2-5`):** Both `Spec 2` (`:1416-1542`) and `Spec 3` (`PLAN_SPEC_ENGRAM_FRONT.md:203`) amend `spec/SPEC_MEMORY_FINALIZATION.md` `§0–§2` (`lines 1–60`). Below, **`Before`** quotes the exact current on-disk lines `1–59` (immediately preceding `:60 ## 3. Items`) byte-for-byte, and **`After`** gives the exact unified post-fold text combining `Spec 2`'s `E6` + `R15-C` rows verbatim with `Spec 3`'s additive `E7` + `R15-D` rows (dormant dreaming resynthesis `D19`, `D23`, `D25`, `D26`, `Point 3C`) so the single post-review fold (`OQ-S2-5`) applies cleanly with zero merge conflict.

**Before (`spec/SPEC_MEMORY_FINALIZATION.md:1-59`, preceding `:60 ## 3. Items`):**
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

**After (`spec/SPEC_MEMORY_FINALIZATION.md:1-59` amended per `Spec 2 §6.2` + `Spec 3 §6.1`, `OQ-S2-5`, preserving historical `0.20.0` closure evidence untouched while embedding R15/R16 contextual graph recall `R15-C` and dormant dreaming consolidation `R15-D`):**
```markdown
# SPEC — Memory engine finalization (`engram-memory`)

**Date:** 2026-10-06 (closure addendum 2026-10-18, §9; R15/R16 post-`0.28.0` contextual-graph & dormant-dreaming evolution cross-reference 2026-11-15)
**Status:** proposed, amended after review rounds 1 (§7) and 2 (§8) — for conductor review. This document authorizes no merge, push, tag, publication, migration, or go-live. The §9 addendum records delivered evidence and owner decisions only; it authorizes nothing further. Post-`0.20.0` R15/R16 architectural extensions are specified in `spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md` (Spec 0), `spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md` (Spec 6A), `spec/SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md` (Spec 1), `spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md` (Spec 2), and `spec/SPEC_ENGRAM_DORMANT_DREAMING_SYNTHESIS.md` (Spec 3).
**Base:** `origin/main` `c96fc01e` (package `@sentropic/engram` 0.19.1), branch `feat/memory-finalization`. Closure baseline: `origin/main` `a88375f015104dee1dc0331530d878959133c840` (PR #398); engram 0.20.0 published from `af60f9d7` (tag `v0.20.0`). R15/R16 design baseline: `docs/memory-r15-sediment` (`@sentropic/engram` 0.28.0, `d5eb6171` / `f0c2928e`).
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
| E7 | R15/R16 settled dreaming decisions (`D1`, `D2`, `D6`, `D10`, `D19`, `D23`, `D25`, `D26`, `Point 3C`) and `@sentropic/engram` `0.28.0` code at `f0c2928e` (`engram-memory/recall.ts:34,38,44`, `engram-memory/assertion-family-registry.ts:267-365`, `engram-live/scheduler.ts:86-337`) | governs post-`0.28.0` dormant dreaming synthesis (`Spec 3`): local passes (`nightly`, `mid-day`, `context-saturation`), post-`Spec 6B` remote passes (`weekly`, `monthly`, `cross-repository` harness audit), `D26` two-tier shadow calibration (`LCB_0.95 >= 0.85`), forgotten-permanent-fact recall boosts (`D23`), and `D1`/`D2`/`T-M-C` promotion gates |

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
| R15-C | Post-`0.28.0` contextual graph query, mandate-primary fingerprint (`D22`), & sensitivity-triaged model ranking (`D7`) | `PROPOSED` on `d5eb6171` (`engram-memory/recall.ts:34,38,44` implements lexical `BM25F` + `RRF` + `PPR` over `accepted_current` only; 6-tool `v1` MCP provider in `src/mcp-memory/provider.ts:458`) | add `MemoryContextPortV1` mandate-primary role-consciousness fingerprint query (`D4`, `D22`), `D5` same-role pending-body filter, `D6` ref-only disclosure gate, `D7` `ConfidentialityDenyListV1` + `@sentropic/llm-mesh` sensitivity-triaged reranking (keeping `engram-memory` L0 neutral via injected reranker port), and default-disabled 7th tool `engram_memory_context` (`D20`, `D23`, `Point 2B`) | `2-E1`–`2-E5` (`Spec 2` §7) | R15 `D4`–`D8`, `D14`, `D15`, `D18`–`D23`; `Point 2B` |
| R15-D | Post-`0.28.0` dormant dreaming consolidation (`D19`, `D25`), two-tier shadow lessons (`D26`), & forgotten-permanent-fact recall (`D23`) | `PROPOSED` on `f0c2928e` (zero dreaming, shadow-lesson, or memory-consolidation scheduler exists in `engram-memory/` or `src/`; 30-day recency half-life in `engram-memory/recall.ts:34` decays older permanent facts unless boosted) | add L0-neutral local dreaming triggers (`nightly`, `mid-day`, `context-saturation`) + offline catch-up coalescing & post-`Spec 6B` remote passes (`weekly`, `monthly`, `cross-repository` harness audit), `D26` two-tier shadow drafter + independent `@sentropic/llm-mesh/decision` verifier gated on measured Wilson `LCB_0.95 >= 0.85`, `D23` `dreaming_recalled_facts` boost, and `D1`/`D2`/`T-M-C`/`Point 3C` promotion gates | `3-E1`–`3-E5` (`Spec 3` §7) | R15 `D1`, `D2`, `D6`, `D9`, `D10`, `D19`, `D23`, `D25`, `D26`; `Point 3C`, `T-M-C` |

## 2. CI evidence baseline (E2, Node 24 job on `c96fc01e`; post-`0.28.0` Spec 2 & Spec 3 RED/GREEN suites in `Spec 2` §7 & `Spec 3` §7)

| File | Outcome on `c96fc01e` |
|---|---|
| `tests/memory-neutrality.test.ts` | pass — `2 tests \| 1 todo` (one real test + one `it.todo`; extended in `2-E3` and `3-E1`/`3-E2` to guard neutral reranker and dreaming port injection in `engram-memory`) |
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

**Post-`0.28.0` R15/R16 sequencing note (2026-11-15, `spec/memory/PLAN_SPEC_ENGRAM_FRONT.md` & `spec/SPEC_ENGRAM_DORMANT_DREAMING_SYNTHESIS.md` §7).** Following the `@sentropic/engram` `0.22.0`–`0.28.0` `MCP-L4`–`MCP-L8` baseline, R15/R16 memory-front lots sequence strictly after `MCP-L4`–`MCP-L8`: `Spec 0` (metamodel & lineages) + `Spec 6A` (`@sentropic/cluster-mesh` `R12` hop, neutral `session-db`, `@sentropic/llm-mesh` routing) → `Spec 1` (session front & extraction) + `Spec 2` (`engram_memory_context` `v2` seventh tool) → **`Spec 3` local dormant dreaming lots (`3-E1`–`3-E4`, `3-S1a`–`3-S1b`, `3-H1`–`3-H2`: `nightly`, `mid-day`, `context-saturation`, `D26` two-tier shadow calibration, `D23` forgotten-permanent-fact recall boosts, and `D1`/`D2`/`T-M-C` promotion gates)** → `Spec 6B` (integral DB-cluster sync, `D24=integral`) → **`Spec 3` remote dreaming & cross-repository master-harness audit lots (`3-S2`–`3-S3`, `3-H3`: `weekly`, `monthly`, `cross-repository` post-sync passes, `Point 3C`)** and `Spec 3` coordinated doc fold (`3-E5`). Nothing in this note alters historical `0.20.0` evidence.
```

---

## 7. Small Test-First Implementation Lots per Repository

Every lot follows strict `RED → GREEN → REFACTOR` discipline, stays atomic (`<= ~150 LOC` in `sentropic` with `packages/*` strictly separated from `api/`; `<= ~150–250 LOC` in `engram` and `h2a`), and executes each repository's verified test gates.

### 7.1 `engram` Repository Lots (`vitest` + `tsc --noEmit`)

> **Publication Gate Before `sentropic` Lots `3-S1a` / `3-S2`:** Matching `Spec 2 §7.1`, `@sentropic/engram` built from `3-E1..3-E4` MUST be published / tarball-pinned before `sentropic` cold-workspace lots `3-S1a` and `3-S2` execute (`Makefile:1283-1289`).

| Lot | Scope & Target Files (`new` / `PROPOSED` explicitly marked) | First Failing (`RED`) Tests Written Before Implementation | Verification Command |
|---|---|---|---|
| **`3-E1`** | **L0-Neutral Dreaming Contracts, Local/Remote Trigger Predicates, Coalesced Catch-Up Watermarks, & 3-Layer Idempotency (`D19`, `D25`, `Point 3C`):** `new` `engram-memory/dreaming-contracts.ts`, `new` `engram-memory/dreaming-triggers.ts`, `tests/memory-neutrality.test.ts` | 1. Local triggers (`nightly`, `mid-day`, `context-saturation`) evaluate purely over injected `ClockPort` (`zero Date.now()`), enforce `context-saturation` hysteresis (`>= 8` turns or `>= 16_384` B since `lastSaturationOrdinal`), and require zero `Spec 6B` barrier.<br>2. Remote triggers (`weekly`, `monthly`, `cross-repository`) fail closed with `MISSING_GRAPH_SYNC_BARRIER` unless a digest-valid `GraphSyncBarrierReceiptV1` advances past the prior watermark.<br>3. Multi-day power-off (`3` missed `nightly` windows + `2` missed `mid-day` windows) coalesces into **1** `'backfill'` `nightly` pass (`mid-day` marked `superseded_by_nightly`); zero-event power-off emits zero-LLM `DreamingEmptyWindowReceiptV1`; duplicate trigger calls yield identical `idem:dream:v1:<sha256>`.<br>4. AST + packed-file scan in `tests/memory-neutrality.test.ts` confirms zero `@sentropic/*`, `@ai-sdk/*`, or `src/llm-execution.ts` imports in `engram-memory/**`. | `npx vitest run tests/dreaming-triggers-and-catchup.test.ts tests/memory-neutrality.test.ts && npx tsc --noEmit` |
| **`3-E2`** | **`D26` Two-Tier Shadow Engine, Blind Anti-Collusion Verifier Gate, Seeded Canaries, & Wilson `LCB_0.95 >= 0.85` Calibration Ledger:** `new` `engram-memory/dreaming-shadow.ts` | 1. Rejects Tier-2 verification when `verifier.model_family === drafter.model_family` (`verifier_independence_unavailable`) and strips Tier-1 prompt/chain-of-thought/receipt before calling `ShadowLessonVerifierPortV1`.<br>2. Small-sample guard: $20/20$ confirmed (`LCB_0.95 = 0.8389 < 0.85`) keeps `gate_state === 'shadow_below_threshold'`; $24/24$ (`0.8617 >= 0.85`) with `>= 30` verified passes, `>= 3` windows, `>= 10` canaries (`0` false passes), and `0` boundary defects transitions to `'threshold_met_eligible'`.<br>3. Single canary false-pass, single `D6`/`D7`/`T-M-C` violation, or model-family rotation immediately demotes `gate_state` and blocks all non-shadow emission. | `npx vitest run tests/dreaming-d26-shadow-calibration.test.ts && npx tsc --noEmit` |
| **`3-E3`** | **`D23` Forgotten-Permanent-Fact Boost Index & 4-Path Promotion Routers (`D1`, `D2`, `T-M-C`, `Point 3C`, `Point 5B`):** `new` `engram-memory/dreaming-promotion.ts`, `new` `src/dreaming/promotion-contracts.ts`, `new` `src/dreaming/index.ts`, `package.json` (`./dreaming` export; depends on `Spec 0` `0-E1` & `Spec 2` `2-E3`) | 1. `selectForgottenPermanentFactsV1` boosts only `accepted_current` permanent records omitted from the last `8` step packs (`W_class = 2.10, D_recency = 1.00`), omits `summary` under `D6=refs` (`Spec 2 :858`), withholds under `D18=readonly`, and removes boost rows immediately on `tombstone` / `withdraw` (`Zero Resurrection`).<br>2. Self-promotion by `dreamingServiceNhiId` fails closed (`D1`); `Track` typed proposals require `TrackTemplateRef` + `verdictAuthority: 'track'` + third-party review; `Track` template changes emit `TrackTemplateEvolutionRequestV1` (`sole_accepting_authority: 'track'`, or `'engram'` iff `requires_new_metamodel_construct`) and never call `registerTrackTemplateVersion`; `spec/` deltas remain `proposed` (`D2`). | `npx vitest run tests/dreaming-promotion-and-d23-recall.test.ts && npx tsc --noEmit` |
| **`3-E4`** | **`[DEPENDS ON SPEC 6B FOR REMOTE RUN]` Cross-Repository Harness Audit Partitioner & `D6`/`D7`/`D8`/`D9`/`D33` Privacy Armor:** `new` `src/dreaming/harness-audit.ts` | 1. Enforces `D9` (`<= 30` workspaces, `<= 183` days, read-only), `D7` deny-list, `D8` PII armor, `D33` HMAC pseudonymization, `D10` raw-context exclusion, and `D6=refs` cohort-intersection (1 `'refs_only_d6'` repo forces ref/telemetry-only mode for the cohort).<br>2. Patterns in `>= 3` distinct repos emit `MasterHarnessAuditProposalV1` (`lineage: 'h2a'`, `D2=review`), whereas single-repo rules (including `h2a`'s single-writer `Track` rule, `Point 4B`) emit only workspace-local `RepoOverlayEvolutionProposalV1` (`.h2a/overlays/workspace.json`, `D31`). | `npx vitest run tests/dreaming-cross-repo-harness-audit.test.ts && npx tsc --noEmit` |
| **`3-E5`** | **Coordinated Post-Review Documentation Fold (`D2=review`, `OQ-S2-5`):** `spec/SPEC_MEMORY_FINALIZATION.md:1-60` (combined `Spec 2 + Spec 3` delta), `plan/08-BRANCH_MEMORY_FINALIZATION.md:198-222` | Mechanical diff check verifying historical `0.20.0` evidence tables (`E1`–`E5`, `F13` exit table) remain byte-identical and `tests/memory-evol-declarations.test.ts` stays green. | `npx vitest run tests/memory-evol-declarations.test.ts && npx tsc --noEmit` |

### 7.2 `sentropic` Repository Lots (`Make-Only` Kernel + Trailing `ENV=`, Single-Package Atomic `<= ~150 LOC`, `packages/*` Isolated from `api/`)

> **Makefile Target Grounding (`sentropic` `origin/main` `913e3bcbc`):** Every verification command below uses **only** verified `Makefile` targets (`typecheck-cluster-mesh` `:1283`, `test-cluster-mesh` `:1286`, `build-cluster-mesh` `:1289`, `pack-cluster-mesh` `:1422`, `typecheck-llm-mesh` `:1265`, `test-llm-mesh` `:2887`, `up-api-test` `:3284`, `typecheck-api` `:1261`, `test-api-endpoints` `:3010,4067`, `scope-check` `:2460,2464`) with `ENV=` strictly last. Peer lock updates follow `Spec 2`'s named scope exception pattern (`BRS3-EX1` mirroring `BRS2-EX1` on `CLUSTER_MESH_PEER_TOOLS` / `package-lock.json` / `consumer-locks.json` when bumping `@sentropic/engram`).

| Lot | Single-Package Scope, Dependencies, & Target Files (`new` marked) | First Failing (`RED`) Tests Written Before Implementation | Verification Command (`ENV=` Mandatory Last Arg) |
|---|---|---|---|
| **`3-S1a`** | **`packages/cluster-mesh` Local Dreaming Runner, Watermark/Shadow SQLite Store, & `/memory/v1/dreaming/*` Local Routes (depends on `6A-S1b..d`, `1-S1a..b`, `2-S1a`, published `3-E1..3-E4`):** `packages/cluster-mesh/package.json`, `new` `packages/cluster-mesh/src/engram-memory/dreaming-local.ts`, `packages/cluster-mesh/src/engram-memory/sqlite-queries.ts`, `packages/cluster-mesh/src/compose/memory.ts` (from `6A-S1d`) | 1. Persists `DreamingWatermarkRowV1` and `ShadowCalibrationGateV1` in `SqliteKernel` (`storage/sqlite/index.ts:174`) + `'scope-outbox-v1'` (`engram-memory/manifest.ts:26`) with zero sidecar SQLite files.<br>2. Enforces `D10=mandate` locality on `context_summary` inputs, runs coalesced `nightly` / `mid-day` / `context-saturation` passes idempotently under `D17=degraded` local mode, and refuses (`403 shadow_threshold_not_met`) any promotion call while `gate_state !== 'threshold_met_eligible'`. | `make typecheck-cluster-mesh ENV=test-cm-dream1 && make test-cluster-mesh SCOPE="tests/engram-memory" ENV=test-cm-dream1 && make build-cluster-mesh ENV=test-cm-dream1 && make scope-check ENV=test-cm-dream1` |
| **`3-S1b`** | **`packages/cluster-mesh` `@sentropic/llm-mesh` & `@sentropic/llm-mesh/decision` Shadow Adapter (depends on `3-S1a`, `2-S1b`, `chat-mesh C2a`):** `packages/cluster-mesh/package.json`, `new` `packages/cluster-mesh/src/integrations/llm-mesh/dreaming-shadow-adapter.ts` consuming `integrations/llm-mesh/decision.ts:1-3` (`DecisionClient.decide` `decision/receipt.ts:66`, `LlmMesh.generate` `mesh.ts:52`) | 1. Enforces `VerifiedRoutingSubject` (`routing-contracts.ts:13`), `RouteMeteringSink` (`route-flow-core.ts:49`) with `maxCostMicroUsd` cap, strict 8-key `DecisionRequest` (`decision/request.ts:70`), and disjoint `drafter.modelFamily !== verifier.modelFamily` selection.<br>2. Scrubs all file/session prose to `(path_ref, content_fingerprint)` before serialization whenever `ModelContentAuthorizationPolicyV1.contentAuthorized !== true` (`D6=refs`). | `make typecheck-cluster-mesh ENV=test-cm-dream2 && make test-cluster-mesh SCOPE="tests/engram-memory" ENV=test-cm-dream2 && make typecheck-llm-mesh ENV=test-llm && make test-llm-mesh ENV=test-llm && make scope-check ENV=test-cm-dream2` |
| **`3-S2`** | **`[DEPENDS ON SPEC 6B]` `packages/cluster-mesh` Remote `weekly` / `monthly` / `cross-repository` Runner & Postgres Store (depends on `3-S1b` + `Spec 6B` sync):** `packages/cluster-mesh/package.json`, `new` `packages/cluster-mesh/src/engram-memory/dreaming-remote.ts`, `packages/cluster-mesh/src/engram-memory/postgres-queries.ts` | 1. Rejects `weekly`, `monthly`, and `cross-repository` execution without a valid `Spec 6B` `GraphSyncBarrierReceiptV1`, and schedules bounded `late-sync-amendment` (`rev1..rev3`) when an offline workstation syncs primary events into a closed window.<br>2. Enforces zero cross-tenant reads, `D9` (`<= 30` workspaces, `<= 183` days), and `D6=refs` cohort intersection on Postgres 16/17. | `make typecheck-cluster-mesh ENV=test-cm-dream3 && make test-cluster-mesh SCOPE="tests/engram-memory" ENV=test-cm-dream3 && make pack-cluster-mesh ENV=test-cm-dream3 && make scope-check ENV=test-cm-dream3` |
| **`3-S3`** | **`[DEPENDS ON SPEC 6B]` `api/` Tenant-Scoped Remote Schedule Trigger & `DEC-116` Isolation (isolated from `packages/*`; depends on `3-S2`):** `new` `api/src/services/memory/dreaming-schedule-trigger.ts`, `new` `api/tests/api/dreaming-schedule-policy.test.ts` | 1. Authenticated remote schedule dispatch invokes `cluster-mesh` `/memory/v1/dreaming/*` per opted-in tenant/workspace, exposes zero below-threshold shadow drafts in operator responses (`D26`), and keeps `sentropic-mcp` (`DEC-116`) completely blocked (`403`). | `make up-api-test ENV=test-api-dream && make typecheck-api ENV=test-api-dream && make test-api-endpoints SCOPE="tests/api/dreaming-schedule-policy.test.ts" API_TEST_WORKERS=1 ENV=test-api-dream && make scope-check ENV=test-api-dream` |

### 7.3 `h2a` Repository Lots (`node --test` + `scripts/test-inventory.json` for `packages/h2a`; Vitest + Zero-Mesh-Dep Invariant for `packages/track`)

| Lot | Scope & Target Files (`new` marked; `packages/track/package.json` keeps zero `@sentropic/engram` / `@sentropic/cluster-mesh` deps) | First Failing (`RED`) Tests Written Before Implementation | Verification Command |
|---|---|---|---|
| **`3-H1`** | **Local `drumbeatTick` / `SessionStart` Dreaming Trigger Client & Repo-Local `.h2a/` Overlay Staging (`Point 3C`, `D15`, `D31`; depends on `6A-H1..H3`, `1-H1`, `2-H1`):** `new` `packages/h2a/src/runtime/memory/dreaming-trigger-client.ts`, `packages/h2a/src/runtime/drumbeat/watch.ts:88`, `scripts/test-inventory.json` | 1. Dispatches local `nightly` / `mid-day` / powered-off catch-up and `context-saturation` notifications over `cluster-mesh` (`R12`, zero `~/.h2a/` JSONL queue) without blocking interactive `D15` prompt slices.<br>2. Stages `RepoOverlayEvolutionProposalV1` strictly as an unapplied review proposal targeting `.h2a/overlays/workspace.json` (`D2=review`), rejecting any override of `H2AMandate` / `R12` / `D6` invariants. | `npm run typecheck && node --test packages/h2a/test/dreaming-local-triggers.test.js` |
| **`3-H2`** | **`Track` Third-Party Promotion Control (`D1=borne-review`, `Point 3C`) & `TrackTemplateEvolutionRequestV1` Inbox (`T-M-C`; depends on `1-H4`):** `new` `packages/track/src/ingest/dreaming-requests.ts`, `new` `packages/track/src/dreaming-requests.test.ts`, `packages/h2a/src/runtime/memory/promote-client.ts`, `scripts/test-inventory.json` | 1. `packages/track/package.json` retains **zero** `@sentropic/engram` and `@sentropic/cluster-mesh` dependencies.<br>2. Dreamed `Track`-domain typed writes require both `verdictAuthority: 'track'` and third-party reviewer identity (`reviewerSubject !== proposalAuthorSubject`, `D1` + `Point 3C`); self-approval fails closed.<br>3. Dreamed template changes are recorded exclusively as `TrackTemplateEvolutionRequestV1` (`status: 'requested'`), accepted **only** by `Track`, while `SpecAmendPayload.proposalRef` (`packages/track/src/model/spec-amend.ts:37-40`) preserves machine-origin provenance. | `npm test -w @sentropic/track && npm run typecheck && node --test packages/h2a/test/track-dreaming-control.test.js` |
| **`3-H3`** | **`[DEPENDS ON SPEC 6B]` `h2a` Master-Harness Audit Proposal Intake (`Point 4B`, `D2=review`):** `new` `packages/h2a/src/runtime/governance/master-harness-audit-intake.ts`, `scripts/test-inventory.json` | 1. Accepts `MasterHarnessAuditProposalV1` over `cluster-mesh` only when `supporting_repo_count >= 3`, `calibration_receipt_digest` is verified, and zero repo-specific rule (such as `h2a`'s single-writer `Track` rule) is present.<br>2. Holds every master-harness candidate in `proposed` review state (`D2=review`, `Point 4B` `h2a` sole authorship of `lineage: 'h2a'`). | `npm run typecheck && node --test packages/h2a/test/master-harness-audit-intake.test.js` |

---

## 8. Open Questions

None of the operational parameters below reopen `D1`–`D34` ([`spec/memory/R15-SEDIMENT.md`](memory/R15-SEDIMENT.md)) or `Points 1B–6A` / `T-M-C` / `D28` ([`spec/memory/OWNER-DECISIONS-2026-11-14.md`](memory/OWNER-DECISIONS-2026-11-14.md)):

1. **`OQ-S3-1` (`engram` + `sentropic` + `h2a` — Default Numerical Calibration Constants & Per-Pass Cost Ceilings for `D26`):**
   - Confirm the default `ShadowCalibrationGateV1` numerical constants in §2.3 ($N_{\text{verified\_pass}} \ge 30$, $N_{\text{resolved}} \ge 20$, Wilson $\mathrm{LCB}_{0.95} \ge 0.85$, $\Delta_{\text{obs}} = 14\text{d}$, `>= 10` negative-control canaries) and the default `maxCostMicroUsd` budget ceilings per local `nightly` vs remote `weekly`/`monthly` shadow pass in `ClusterMeshDreamingLlmAdapter`.
2. **`OQ-S3-2` (`h2a` + `sentropic` — Minimum Distinct-Repository Quorum `min_distinct_repos` for Cross-Repo Master-Harness Proposals):**
   - §4.2 sets `min_distinct_repos = 3` repositories so single-repo or two-repo coincidences stay inside `.h2a/overlays/workspace.json` (`D31`). When an organization has only `2` opted-in repositories in a tenant, should `cross-repository` audit require both (`2/2` with explicit conductor flag) or remain dormant until `>= 3` repositories opt in?
3. **`OQ-S3-3` (`engram` + `sentropic` — `Spec 6B` Offline-Replica Grace Window Before Remote `weekly` / `monthly` Execution):**
   - When one enrolled laptop remains powered off at the Monday `03:00 UTC` `weekly` schedule (`GraphSyncBarrierReceiptV1.lagging_replica_ids.length > 0`), confirm the default grace hold (`recommended: 12 hours`) before `external-host` runs `rev0` over synced replicas and relies on bounded `late-sync-amendment` (`rev1..rev3`, §1.3) upon that laptop's reconnect.
4. **`OQ-S3-4` (`h2a` / `Track` — CLI Surface for Reviewing `TrackTemplateEvolutionRequestV1` in `3-H2`):**
   - Without reopening `Point 3C` (`Track` alone accepts template requests), confirm whether `Track` conductors prefer reviewing `TrackTemplateEvolutionRequestV1` items through an existing `track decision` / `track demand` command (`packages/track/src/model/{decision.ts,demand.ts}`) or a dedicated `track template-request` subcommand in Lot `3-H2`.

---

## 9. Code Grounding Ledger (`DESIGN-NOTE-CODE-GROUNDING.md`)

Every code, schema, script, Make target, and contract claim in this specification was verified directly against the repository trees at the named baseline SHAs (`engram` `HEAD` `f0c2928e` / `origin/main` `f75543a5`; `sentropic` `origin/main` `913e3bcbc`; `h2a` `origin/main` `1f57127d` / `HEAD` `229573e3`):

| Claim in Spec 3 | Verification Command Executed | Observed Result | Grounded Anchor or `new` Status |
|---|---|---|---|
| Zero dreaming, lesson-drafting, or memory-consolidation scheduler exists in `engram-memory/` or `src/` today | `rg -n "dream\|dormant\|lesson\|scheduler\|cron" engram-memory src` | Only prose comments (`sqlite.ts:89` "F1 lesson", `ontology-patch-context.ts:56` "dormant") and `"acronym"` matches | All Spec 3 dreaming modules explicitly marked **`new`** (`Lots 3-E1..3-E4`) |
| `engram-memory` 30-day recency half-life, `RRF_K`, and `PPR_ALPHA` constants | `rg -n "HALF_LIFE\|RRF_K\|PPR_ALPHA" engram-memory/recall.ts` | `HALF_LIFE_MS = 2_592_000_000` (`:34`), `RRF_K = 60` (`:38`), `PPR_ALPHA = 0.85` (`:44`), decay formula (`:173`) | `engram:engram-memory/recall.ts:34,38,44,173` |
| `DerivationLineageV1`, `RetentionV1`, `MemoryRecordV2`, `MemoryState`, `CapitalisationRequestV1`, `MemoryPortV2`, & injected `ClockPort` | `read_file` on `engram-memory/contracts/index.ts` (`:1-120,415-490,1335-1389`) | Exact interfaces and union literals verified | `engram:engram-memory/contracts/index.ts:41-54,83-99,419-443,1342-1389` |
| L5 read-only assertion-family reconciliation proposal generator | `rg -n "AssertionFamily\|reconcil" engram-memory/assertion-family-registry.ts` | `reconciliationProposalIdV1` (`:66`), `createAssertionFamilyRegistryV1` (`:267-365`) | `engram:engram-memory/assertion-family-registry.ts:66,267-365` |
| Neutral `'scope-outbox-v1'` storage profile in `engram-memory` | `rg -n "scope-outbox-v1" engram-memory/module-storage-neutral.ts` | `'scope-outbox-v1'` declared at line `42` | `engram:engram-memory/module-storage-neutral.ts:42` |
| `engram-live` 3:1 `interactive` vs `backfill` scheduler, `ScopeFencingTokenDto`, injected `clock`, & `RetentionPort` | `read_file` on `engram-live/scheduler.ts` (`:1-300`) and `engram-live/retention.ts` (`:1-229`) | `Scheduler` (`:86-337`), `interactiveQuantum: 3, backfillQuantum: 1` (`:117,173`), `backfillReserveBytes` (`:35,141-145`), `RetentionPort` (`:64-68`), `runRetentionPass` (`:167-229`) | `engram:engram-live/scheduler.ts:3-14,35,53-64,86-337`; `engram:engram-live/retention.ts:64-229` |
| `src/llm-execution.ts` direct provider helpers isolated from `engram-memory` and dreaming modules | `rg -n "export " src/llm-execution.ts` | `DIRECT_LLM_PROVIDERS` (`:12`), `directProviderCredentialEnv` (`:246`), `createDirectTextJsonClient` (`:497`) | `engram:src/llm-execution.ts:12,246-306,497` (never imported by `engram-memory` or `src/dreaming/*`) |
| Exact `Before` lines of `spec/SPEC_MEMORY_FINALIZATION.md` (`§0–§2`) and `plan/08-BRANCH_MEMORY_FINALIZATION.md` (`:198-222`) | `read_file` on `spec/SPEC_MEMORY_FINALIZATION.md:1-65` and `plan/08-BRANCH_MEMORY_FINALIZATION.md:195-245` | Verified line-by-line and character-for-character | `engram:spec/SPEC_MEMORY_FINALIZATION.md:1-60`; `engram:plan/08-BRANCH_MEMORY_FINALIZATION.md:198-222` |
| `@sentropic/llm-mesh` `0.38.0` `LlmMesh.generate`, `VerifiedRoutingSubject`, `RoutePlanner.plan`, & `PreparedRouteAttempt` | `git -C /home/antoinefa/src/sentropic grep -n ... origin/main -- packages/llm-mesh/src/` | `LlmMesh.generate` (`mesh.ts:52,157`), `VerifiedRoutingSubject` (`routing-contracts.ts:13`), `PreparedRouteAttempt` (`:197-200`), `plan` (`:254`) | `sentropic:packages/llm-mesh/src/mesh.ts:49-52,157`; `routing-contracts.ts:13,54,197-285` |
| `@sentropic/llm-mesh/decision` `DecisionClient.decide`, closed 8-key `DecisionRequest`, & `cluster-mesh` topology-guarded leaf | `git -C /home/antoinefa/src/sentropic grep -n ... origin/main -- packages/llm-mesh/src/decision/` & `git show origin/main:packages/cluster-mesh/src/integrations/llm-mesh/decision.ts` | `DecisionClient.decide` (`receipt.ts:65-66`), 8-key `hasOnlyKeys` (`request.ts:40-75`), `maxCostMicroUsd` (`request-policy.ts:4-6`), leaf re-export (`decision.ts:1-3`) | `sentropic:packages/llm-mesh/src/decision/{index.ts:2-10,receipt.ts:65-66,request.ts:40-75,request-policy.ts:4-6}`; `packages/cluster-mesh/src/integrations/llm-mesh/decision.ts:1-3` |
| `RouteMeteringSink`, `SqliteKernel`, `'scope-outbox-v1'`, & `ContentPolicyV1` in `sentropic` | `git -C /home/antoinefa/src/sentropic grep -n ... origin/main -- packages/` | `RouteMeteringSink` (`route-flow-core.ts:49,62`), `SqliteKernel` (`storage/sqlite/index.ts:38,160-187`), `'scope-outbox-v1'` (`engram-memory/manifest.ts:26`), `computeRetentionDeadline` (`sessions/content-policy.ts:148`) | `sentropic:packages/llm-gateway/src/route-flow-core.ts:49,62`; `packages/cluster-mesh/src/{engram-memory/manifest.ts:26,storage/sqlite/index.ts:38,160-187,sessions/content-policy.ts:148}`; `compose/memory.ts` marked `new` (`Spec 6A` `6A-S1d`) |
| Verified `sentropic` `Makefile` targets cited in §7.2 | `git -C /home/antoinefa/src/sentropic grep -n ... origin/main -- Makefile` | `typecheck-api` (`:1261`), `typecheck-llm-mesh` (`:1265`), `typecheck-cluster-mesh` (`:1283`), `test-cluster-mesh` (`:1286`), `build-cluster-mesh` (`:1289`), `pack-cluster-mesh` (`:1422`), `scope-check` (`:2460,2464`), `test-llm-mesh` (`:2887`), `test-api` / `test-api-%` (`:3010,4067`), `up-api-test` (`:3284`) | `sentropic:Makefile:1261,1265,1283,1286,1289,1422,2460,2464,2887,3010,3284,4067` |
| `h2a` `drumbeatTick`, `scripts/test-inventory.json`, `packages/track` zero-mesh-dep invariant, & `SpecAmendPayload.proposalRef` | `git -C /home/antoinefa/src/h2a show origin/main:...` on `watch.ts`, `test-inventory.json`, `packages/track/package.json`, `spec-amend.ts` | `drumbeatTick` (`watch.ts:88`), `@sentropic/track@0.91.0` deps only `@modelcontextprotocol/sdk` + `ulid` (`package.json:55-58`), `SpecAmendPayload.proposalRef` (`spec-amend.ts:24-40`) | `h2a:packages/h2a/src/runtime/drumbeat/watch.ts:88`; `h2a:scripts/test-inventory.json:1-25`; `h2a:packages/track/package.json:55-58`; `h2a:packages/track/src/model/spec-amend.ts:24-40` |
