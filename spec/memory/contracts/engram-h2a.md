# Contract: `engram` ↔ `h2a` (Harness Master, Overlays, Role Ontology, Context Query, Decisions, and MCP)

- **Status:** `decided 2026-11-14` within the scope of `EVIDENCE-q6-message-shown-to-owner.md` and `EVIDENCE-q6-owner-question-and-answer.json` (`docs/memory-r15-sediment`; amended per [`spec/memory/OWNER-DECISIONS-2026-11-14.md`](../OWNER-DECISIONS-2026-11-14.md), seat extensions marked `proposed, not decided by the owner`, session/prompt-loop direction annotated with the `2026-11-15` supersession banner, §2.2 interfaces `proposed`)
- **Repository of Record:** `engram` (`spec/memory/contracts/engram-h2a.md`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:20]`
- **Parties:**
  - **`engram`** (`@sentropic/engram`, `@sentropic/engram-memory`): Primary session ingestion front, canonical graph memory authority (`D28=engram` — authoritative over recorded memory facts and the live registry, **not** authority over `Track` or `h2a` ontology templates), master of the shared ontology metamodel and lineage registry (`Spec 0`: shared grammar of types, relations, and versions plus registry `decided 2026-11-14`; attributes, states, file-projection descriptors, digests, and derivation/composition rules `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`; `engram` validates template well-formedness, may propose role changes, and never authors or modifies `h2a` or `Track` templates), first-class decision store (`D3`, `D27`, `owner-r8/comments-2026-11-07.md:19,54`), contextual graph query engine (`D19`, `D20`, `D22`, `D23` — *see 15/11 banner below*), and Git/PR serialization producer (`D34=engram`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/owner-r8/comments-2026-11-07.md:19,54; spec/memory/OWNER-DECISIONS-2026-11-14.md:13-14,25]`.
  - **`h2a`** (`h2a repository: packages/h2a`, `origin/main` `1f57127de`): Master and sole author of the role/activity, harness-skill, and master-harness templates (`D16`, `D31` — registered as the `h2a` profile lineage in `engram`'s registry, sibling to and distinct from the `Track` domain template lineage authored solely by `Track`, `decided 2026-11-14`), formal mandate authority (`D3`, `D4`, `D10`), CLI host plugin runtime across 8 hosts (`claude`, `codex`, `gemini`, `agy`, `hermes`, `opencode`, `muse`, `vibe`), and owner of the decision response tool, decision skill, and interactive/async swipe review surfaces (`D27`, `owner-r8/comments-2026-11-07.md:54`) `[FACT: h2a repository: packages/h2a/src/hosts/plugin.ts:85-152; packages/h2a/src/authority.ts:55-59,90-94; packages/h2a/src/runtime/drive/index.ts:331-337; memory-dossier/owner-r15/comments-2026-11-08.md:2,12,14; memory-dossier/owner-r8/comments-2026-11-07.md:54; spec/memory/OWNER-DECISIONS-2026-11-14.md:25]`.

> **Superseded in direction by the owner's 15/11 words; pending the owner's decision dossier "journal de session en graphe et outil mémoire":** « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. » *(Applies across §1, §2.2, and §3 wherever session logging is modeled as flat raw-event envelopes across all 8 external CLI hosts or context delivery uses a 7th MCP tool `engram_memory_context`, full-slice payloads, and an 8-host transcript-cutoff switchover; retained below without redesign while the owner's decision dossier is pending.)*

---

## 1. What Each Party Provides and Consumes

### 1.1 `engram` Provides to `h2a`
1. **Primary Session Ingestion Front (`D19`, `D24`, `D32`):** First-rank ingestion of every session datum emitted by `h2a` CLI host hooks (`tour de parole` speech turns, tool results, owner decisions, harness rules, and mandate bindings) before `Track` or any other analyst executes `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:15,19]`. *(Superseded in direction by the owner's 15/11 words; pending the owner's decision dossier "journal de session en graphe et outil mémoire": « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. »)*
2. **Shared Ontology Metamodel, Multi-Lineage Registry, and Derivable Graph Substrate (`Spec 0`, `D4`, `D16`, Point 4B):** Published, versioned metamodel grammar and multi-lineage registry hosting the two sibling `h2a` and `Track` lineages (`decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:10,48-51`, `EVIDENCE-q6-owner-question-and-answer.json:6,12`), metamodel well-formedness validation (accepting or refusing templates, never authoring or mutating them; digest receipt `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`; non-repair `proposed, not decided by the owner` — source seat: `h2a`), sibling `archi@1` immutability and version-pinned cross-lineage composition rules (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`), and graph storage hosting the `h2a` role, scope, typical-activity, and harness-skill templates `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:2; memory-dossier/owner-r8/comments-2026-11-07.md:17; spec/memory/OWNER-DECISIONS-2026-11-14.md:14,25]`.
3. **Derived Worktree Graph Modelling (`D21`):** First-class graph entities representing derived git worktrees (derived copies retaining their parent origin link, branch/worktree state, and attached session logs) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:5]`.
4. **Durationless Contextual Graph Query Engine (`D19`, `D20`, `D22`, `D23`, Point 2B — *historically decided 2026-11-14*):**
   > **Superseded in direction by the owner's 15/11 words; pending the owner's decision dossier "journal de session en graphe et outil mémoire":** « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. »
   *Historical 14/11 statement:* The seventh memory tool (`engram_memory_context` — tool identifier `proposed, not decided by the owner`, source seats: conductor, `Fable`, `Carbon`; built now disabled by default, going live only after the `engram` + `sentropic` co-signature and `MCP-L5` production qualification, followed by host-by-host switchover with a fixed end date, `decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:33`) and underlying query engine that replaces linear session transcripts at every prompt step with a Mandate+Role-fingerprint graph query, returning active mission focus, significant tool results, owner decisions, applicable master+overlay harness rules, and on-demand queryable session text history. The seventh tool contract fixes only the envelope (template reference and version `decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:30`; `digest` `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`), never a closed list of `Track` or domain types `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:3-4,6-8; spec/memory/OWNER-DECISIONS-2026-11-14.md:23]`.
5. **Dormant Dreaming Resynthesis (`D19`, `D25`, `D26`, Point 3C):** Background session resynthesis running on default cadences nightly (the owner's « daily »), weekly and monthly, and event triggers mid-day and context saturation (**nightly runs locally** and **weekly and monthly — cross-repository master harness audit, after graph sync — run remotely**, `decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:42`, `EVIDENCE-q6-owner-question-and-answer.json:6,12`; local placement of `mid-day` and `context-saturation` triggers is `proposed, not decided by the owner` — source seats: `Fable` local, `Carbon` reactive near-session with local offline fallback), surfacing long-term permanent facts forgotten in short-term execution `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:3,7,11; spec/memory/OWNER-DECISIONS-2026-11-14.md:24]`.
6. **Harness Overlay Serialization to Git (`D31`, `D34`, Point 4B):** Deterministic serialization of per-developer, per-workspace, and per-repository harness overlays (`surcouches`) into Git-committed files alongside `engram` specs and `Track` slices (`D31`, `D34`); the `.h2a/` directory layout (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`, `h2a`) and the rule that a `.h2a/` overlay never modifies a `Track` template or bypasses `Track` control (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`) are seat proposals `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:14; spec/memory/OWNER-DECISIONS-2026-11-14.md:13,25]`.

### 1.2 `h2a` Provides to `engram`
1. **Live Session & Turn Stream (`D11`, `D12`, `D13`, `D14`, `D19`, `proposed`):**
   > **Superseded in direction by the owner's 15/11 words; pending the owner's decision dossier "journal de session en graphe et outil mémoire":** « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. »
   `proposed` structured turn boundaries (`tour de parole`), significant tool execution results, session lifecycle window signals (`D14=window`), and send-time promotion sweeps (`D12=turn`) across the 8 CLI hosts. Today (`h2a` `origin/main` `1f57127de`), `packages/h2a/src/hosts/plugin.ts:22-43,85-152,182-212` renders `PreToolUse` (`workspace-scope-guard.mjs`) for `['claude', 'codex', 'gemini', 'vibe', 'agy', 'muse']`, `SessionStart` for `agy` (`:107-113`) and `muse` (`:128-134`), `Stop` (`h2a drumbeat record`), `receive` (`h2a drive receive --to <instance> --stdin --ignore-non-drive`, `'N-A'` on `vibe`), and `poll` (`h2a drumbeat scan`, `:208-211`), with `packages/h2a/hooks/{hooks.json:1-17,vibe-pre-tool.mjs:1-40,vibe-post-agent.mjs:1-29}` and **zero** `PostToolUse` or `UserPromptSubmit` hook generators (`packages/h2a-runtime/src/delegate.ts:755-815` implements `retainBeforeJobRemoval` and `resolveJobCwd` only, with **zero** `session-db` polling). Any `UserPromptSubmit`/`PostToolUse` hook generators in `plugin.ts`, `vibe-post-tool.mjs`, turn-pair extraction in `vibe-post-agent.mjs`, and any `session-db` poll bridge or opportunistic MCP flush for non-push hosts (`agy`, `muse`) are **`new`** (`proposed`) `[FACT: h2a repository (origin/main 1f57127de): packages/h2a/src/hosts/plugin.ts:22-43,85-152,182-212; packages/h2a/hooks/hooks.json:1-17; packages/h2a/hooks/vibe-pre-tool.mjs:1-40; packages/h2a/hooks/vibe-post-agent.mjs:1-29; packages/h2a-runtime/src/delegate.ts:755-815; memory-dossier/owner-r15/answers-2026-11-08.compact.md:4; memory-dossier/owner-r8/comments-2026-11-07.md:7]`.
2. **Formal Signed h2a Mandates (`D3`, `D4`, `D10`, `D22`):** Signed `MANDATE` artifacts, issued only by roles listed in `H2A_AUTHORITY_MATRIX.MANDATE` and verified via `canSignArtifactKind(role, 'MANDATE')` (`packages/h2a/src/authority.ts:55-59,90-94`; `packages/h2a/src/runtime/drive/index.ts:331-337`) `[FACT]`. The envelope fields `D22` uses in memory queries (actor, role, scope, workspace) are `proposed` `[JUDGMENT]`; used as a primary component of the `D22` session graph fingerprint and required for `D3`/`D4`/`D10` admission, disposition, and federation `[FACT: h2a repository: packages/h2a/src/authority.ts:55-59,90-94; packages/h2a/src/runtime/drive/index.ts:331-337; memory-dossier/owner-r15/comments-2026-11-08.md:6]`.
3. **Master Harness & Role/Activity/Skill Ontology Templates (`D16`, `D31`, Point 4B):** As sole author and master of its templates (`decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:49`), `h2a` provides the canonical `h2a` master harness templates and the `h2a` profile template of standard roles (agent and human), typical activities (`activité types`), and harness skills (referencing any `Track` domain objects by version-pinned metamodel composition without redefining `Track` types — `proposed, not decided by the owner`, source seats: `Fable`, `Carbon`), plus proactive role/rule analysis proposals whenever an active session lacks an assigned role (`« Quand il n y a pas de role, h2a devrait etre proactif en analyse et proposition. […] »`; `engram` may propose role changes, never write them, `decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:51`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:2,14,25; spec/memory/OWNER-DECISIONS-2026-11-14.md:25]`.
4. **Decision Response Tool, Urgent Blocking vs Async Non-Blocking Stacking, Decision Skill, and Swipe/Dossier Review (`D3`, `D27`, `owner-r8/comments-2026-11-07.md:54`, `proposed`):** Per the owner's verbatim request (`« faudra prévoir dans h2a de mettre un tool de réponse, en capacité le cas échéant soit de trigger les différents outils de question des tools en direct (beosin urgent et bloquant askuserquestion ou autre tool des clis) ou stacking des decisions en attente non bloquante pour revue (les decision hors decision dossier) async, pour favoriser la prise de décision non bloquante. dans l'absolu les decision doivent être modélisées en tant que telles via engram (decision harnais, decision projet / production) et quand on sera en remote controle (ou meme en local) faut prevoir un mode de parcours des decision / decision dossier (en swipant d'un dossier a l'autre). le skill des decision devrait imposer une lecture non jargonneuse, avec un contexte clair et complex et une explication orientée impact et risque des différentes possibles options de décision. tracke ce besoin stp, et correle le au dossier memoire puisqu'engram doit stocker les decision. »` `[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:54]`), `h2a` provides (`new` / `proposed`):
   - **(a) Decision response tool:** triggers native CLI question tools directly (`askuserquestion` or host CLI equivalents) when a decision is **urgent and blocking**, or **stacks pending non-blocking decisions** (`les decision hors decision dossier`) for asynchronous review so execution remains non-blocking by default;
   - **(b) First-class `engram` decision records (`D3`):** every decision (`harness` and `project/production`) is stored in `engram` with its scope, blocking posture (`urgent-blocking | async-non-blocking`), state, and serialization destination;
   - **(c) Swipe-through review surface (`D27`):** traversal mode across pending decisions and `D27` decision dossiers (`decision-only` exchanges producing contextualized facts and bound decisions) by swiping from one dossier/decision to the next in both **remote control** and **local** modes;
   - **(d) `h2a` decision skill:** enforces non-jargon prose, a clear and rich (`clair et complex`) context exposition, and an impact- and risk-oriented explanation of every candidate option `[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:19,54; memory-dossier/owner-r15/comments-2026-11-08.md:12]`.

---

## 2. Interfaces

All communication between `h2a` and `engram` transits through `@sentropic/cluster-mesh` and the `packages/mcp-platform` registry (`R12`, `D24`) `[FACT: memory-dossier/owner-r9/r12-correction-2026-11-07.md:5; memory-dossier/owner-r11/mcp-correction-2026-11-07.md:5]`.

### 2.1 Existing Interfaces (in `@sentropic/engram` 0.28.0 / `SPEC_MEMORY_MCP_V2.md`)
- `engram_memory_search`, `engram_memory_get`, `engram_memory_capture`, `engram_memory_request_admission`, `engram_memory_withdraw`, `engram_memory_forget` (`spec/SPEC_MEMORY_MCP_V2.md:49-58`). `@sentropic/engram` 0.28.0 (`package.json:3`) ships them as six in-process tools (`src/memory-tools/`, export `./memory-tools`), disabled by default (`plan/08-BRANCH_MEMORY_FINALIZATION.md:202`). Since 0.22.0 an optional MCP adapter, the MCP-L4 candidate (`./mcp-memory`, `./registry/*`; `src/mcp-memory/provider.ts`), ships disabled by default and pending MCP-L5 qualification (`CHANGELOG.md:64-66`). `h2a` reaches the in-process `MemoryPortV2` through `packages/h2a/src/runtime/memory/port-v2-adapter.ts` over the vendored V2 types (`graphify-contracts-v2.vendored.ts`), not through these tools `[FACT: package.json:3,22,35,39,43; CHANGELOG.md:64-66; spec/SPEC_MEMORY_MCP_V2.md:49-58; plan/08-BRANCH_MEMORY_FINALIZATION.md:202; h2a repository: packages/h2a/src/runtime/memory/port-v2-adapter.ts:1-12]`.

### 2.2 Proposed Interfaces (`proposed` — to be built under R15 Spec Plan)

> **Superseded in direction by the owner's 15/11 words; pending the owner's decision dossier "journal de session en graphe et outil mémoire":** « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. » *(Applies to `EngramSessionIngestFrontPort` flat raw-event ingestion and `EngramMemoryContextToolInput` / `EngramMemoryContextToolOutput` below; retained without redesign pending the owner's decision dossier.)*

```ts
export type Sha256Digest = `sha256:${string}`; // 64 hex lowercase over RFC 8785 (JCS) UTF-8 bytes

export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

// status: proposed — Signed h2a mandate envelope verified at L0/boundary gates (Spec 0 :161-174;
// grounded on h2a@1f57127de:packages/h2a/src/types.ts:79-102,239-249 and packages/h2a/src/authority.ts:55-59,90-94)
export interface H2AMandateEnvelope {
  readonly mandateId: string;
  readonly instance: string;
  readonly role: 'PRINCIPAL' | 'EXECUTIF' | 'CONDUCTOR' | 'AGENTS' | 'CONTROL' | 'MANDATAIRE' | null;
  readonly scope: string;
  readonly rights: readonly string[];
  readonly expiresAt?: string;
  readonly envelopeDigest: Sha256Digest;
  readonly signatures: ReadonlyArray<{
    readonly by: string;
    readonly alg: string;
    readonly value: string;
  }>;
}

// status: proposed — Neutral metamodel template-reference envelope:
// templateId + templateVersion decided 2026-11-14; templateDigestSha256 proposed, not decided by the owner (source seats: Fable, Carbon)
export interface OntologyTemplateEnvelopeRef {
  lineage: 'archi' | 'h2a' | 'track' | 'engram'; // LineageId (Spec 0 :147)
  templateId: string;
  templateVersion: string;
  templateDigestSha256: Sha256Digest; // proposed, not decided by the owner (source seats: Fable, Carbon)
}

export type SessionFrontSliceName = 'track' | 'git' | 'architecture' | 'rules' | 'memory';

// status: proposed — Raw session event envelope & post-recording extraction DTOs (D19, D21, D24, D30, D32, D33;
// flat raw-event shape superseded in direction on 15/11 pending owner dossier "journal de session en graphe et outil mémoire")
export interface RawSessionEventEnvelope {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly derivedWorktreeId: string;        // D21
  readonly sessionPseudoId: string;          // D33
  readonly actorPseudoId: string;            // D33
  readonly eventKind:
    | 'speech_turn'
    | 'tool_result'
    | 'file_ref'
    | 'mandate_binding'
    | 'external_hmi_input'
    | 'context_saturation';
  readonly deliveryPath: 'push-hook' | 'post-agent-hook' | 'poll-scan' | 'mcp-opportunistic' | 'in-process';
  readonly idempotencyKey: string;
  readonly mandateRef: H2AMandateEnvelope | null;
  readonly payload: Record<string, unknown>;
  readonly recordedAtIso: string;
}

export interface RawSessionEventReceipt {
  readonly status: 'recorded' | 'duplicate_exact';
  readonly eventRecordId: string;
  readonly recordDigest: Sha256Digest;
  readonly cursor: string;
  readonly extractionDisposition: 'pending_extraction' | 'proposed' | 'empty_verified' | 'withheld_d7';
  readonly syncState: 'synced' | 'queued-degraded' | 'local-only';
  readonly degradedBanner?: string;          // D17=degraded
  readonly readySlices: readonly SessionFrontSliceName[];
  readonly readySlicePayloads?: Partial<Record<SessionFrontSliceName, string>>; // D15=slices
  readonly h2aProactiveRoleAnalysisQueued: boolean; // True when mandateRef === null (D16)
  readonly extractionSweepScheduled: boolean;       // True on D12=turn sweep or D19 saturation
  readonly transactionReceiptDigest: Sha256Digest;
}

export interface SessionExtractionProposalBatch {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceEventRecordIds: readonly string[];
  readonly extractorKind: 'permanent-light-llm' | 'session-llm' | 'specialized-model';
  readonly proposals: ReadonlyArray<{
    readonly proposalId: string;
    readonly domain: 'project' | 'harness' | 'memory';
    readonly templateEnvelope: OntologyTemplateEnvelopeRef | null;
    readonly entityTypeId: string;
    readonly candidatePayload: Record<string, unknown>;
  }>;
}

export interface SessionExtractionReceipt {
  readonly batchId: string;
  readonly recordedProposalIds: readonly string[];
  readonly withheldD7ProposalIds: readonly string[];
  readonly refusedMetamodelInvalidIds: readonly string[];
  readonly transactionReceiptDigest: Sha256Digest;
}

// status: proposed — Primary session event recorder & post-recording extraction port (D19, D24, D32; R12 via cluster-mesh)
export interface EngramSessionIngestFrontPort {
  readonly version: 1;
  recordSessionEvent(
    envelope: RawSessionEventEnvelope
  ): Promise<Result<RawSessionEventReceipt>>;

  recordExtraction(
    batch: SessionExtractionProposalBatch
  ): Promise<Result<SessionExtractionReceipt>>;
}

// status: proposed — First-class Decision Record, Urgent/Async Routing & Swipe Review Port
// (D3, D27, owner-r8/comments-2026-11-07.md:19,54; `new` across h2a and engram)
export interface DecisionOptionImpactRisk {
  readonly optionId: string;
  readonly labelPlainLanguage: string;       // Non-jargon label enforced by the h2a decision skill
  readonly impactSummary: string;            // Impact-oriented explanation
  readonly riskSummary: string;              // Risk-oriented explanation
}

export interface EngramDecisionRecord {
  readonly decisionId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scope: 'harness' | 'project-production'; // D3 + comments-2026-11-07.md:19,54
  readonly blockingPosture: 'urgent-blocking' | 'async-non-blocking'; // Urgent CLI question vs async review stack
  readonly containerKind: 'standalone-decision' | 'decision-dossier'; // D27
  readonly dossierId: string | null;
  readonly state: 'pending-urgent' | 'queued-async-stack' | 'answered' | 'superseded';
  readonly serializationTarget: 'h2a-harness-overlay' | 'track-pr-projection'; // D3, D31, D34
  readonly clearAndRichContext: string;      // Non-jargon, clear & complex context enforced by the h2a decision skill
  readonly options: readonly DecisionOptionImpactRisk[];
  readonly contextualizedFactIds: readonly string[]; // D27
  readonly selectedOptionId: string | null;
  readonly mandate: H2AMandateEnvelope | null;
}

export interface H2aDecisionRoutingAndDossierPort {
  /**
   * Routes a decision (`owner-r8/comments-2026-11-07.md:54`):
   * - when `blockingPosture === 'urgent-blocking'`, triggers the active CLI host's native blocking
   *   question tool (`askuserquestion` or host equivalent) directly;
   * - when `blockingPosture === 'async-non-blocking'`, stacks the decision in `engram` for non-blocking
   *   asynchronous swipe review without stalling the session.
   * Rejects jargony or option-incomplete prompts that violate the `h2a` decision skill contract.
   */
  routeOrStackDecision(
    decision: Omit<EngramDecisionRecord, 'state' | 'selectedOptionId'>
  ): Promise<Result<{
    readonly decisionId: string;
    readonly deliveryMode: 'triggered-native-cli-question' | 'stacked-async-review';
    readonly state: EngramDecisionRecord['state'];
  }>>;

  /**
   * Lists pending standalone decisions and `D27` decision dossiers for swipe-through traversal
   * (`mode: 'local' | 'remote-control'`, swiping from one dossier/decision to the next) and records answers in `engram`.
   */
  listSwipeReviewQueue(input: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly surface: 'local' | 'remote-control';
    readonly cursor: string | null;
  }): Promise<Result<{
    readonly items: readonly EngramDecisionRecord[];
    readonly nextCursor: string | null;
  }>>;
}

// status: proposed — 7th MCP tool: tool name `engram_memory_context` is proposed, not decided by the owner
// (source seats: conductor, Fable, Carbon); superseded in direction on 15/11 pending owner dossier
// "journal de session en graphe et outil mémoire"
export interface EngramMemoryContextToolInput {
  tenantId: string;
  workspaceId: string;
  derivedWorktreeId: string;         // D21
  mandateEnvelope: H2AMandateEnvelope | null; // D22 primary component of fingerprint query (null when unassigned per D16/D18)
  previousStepResult: {            // D23 reprocessed previous result
    stepId: string;
    reprocessedSummary: string;
    significantToolRefs: string[];
  } | null;
  queryText: string | null;        // Optional on-demand text history query (D23)
}

// Historical Point 2B (14/11; superseded in direction on 15/11): fixes only the envelope
// (template reference + version decided 14/11; digest proposed, not decided by the owner), never a closed list of Track or h2a domain types.
export interface EngramMemoryContextToolOutput {
  fingerprintQueryId: string;
  roleConsciousnessSlice: {        // D16 + D22 role & activity ontology slice (h2a template lineage)
    roleTemplateEnvelope: OntologyTemplateEnvelopeRef;
    activeRoleId: string | null;
    proactiveRoleProposal: { proposedRoleId: string; rationale: string } | null; // D16 when no role (proposal only; engram never writes roles)
    allowedActivities: string[];
    multiActorRelations: Array<{ targetRoleId: string; relation: string }>;
  };
  harnessEffectiveRules: {         // D31 master + workspace/repo overlay (h2a harness template lineage)
    harnessTemplateEnvelope: OntologyTemplateEnvelopeRef;
    masterHarnessVersion: string;
    workspaceOverlayRef: string;
    activeRules: string[];
  };
  missionFocusContext: {           // D23 attention on significant elements + D15 envelope-only domain slices
    ownerDecisions: Array<{ id: string; statement: string }>;
    domainTypedEnvelopes: Array<{  // Envelope-only carrier for Track or h2a typed items (never a closed type list)
      templateEnvelope: OntologyTemplateEnvelopeRef;
      entityTypeId: string;
      entityId: string;
      controlVerdictAuthority: 'track' | 'engram' | null;
      payload: Record<string, unknown>;
    }>;
    significantToolResults: Array<{ id: string; summary: string }>;
    dreamingRecalledFacts: Array<{
      id: string;
      summary: string;
      trigger: 'nightly' | 'weekly' | 'monthly' | 'mid-day' | 'context-saturation';
    }>;
  };
  sessionHistoryQueryMatches: Array<{ turnNodeId: string; excerpt: string }> | null; // D8 bounded + PII-armored
}

// status: proposed — Role/Activity/Skill Template Lineage + Harness Overlay Port (Spec 0, D16, D31, D34, Point 4B)
export interface EngramHarnessAndOntologyPort {
  upsertRoleOntologyGraph(input: {
    writerMandate: H2AMandateEnvelope; // Signed formal h2a mandate (D4); h2a mandate-and-role manager is sole author/writer of 'h2a' lineage (Point 4B, decided 14/11)
    metamodelVersion: string;          // Shared engram metamodel version (Spec 0)
    templateEnvelope: OntologyTemplateEnvelopeRef; // lineage: 'h2a'
    composedLineagePins: OntologyTemplateEnvelopeRef[]; // proposed, not decided by the owner (source seats: Fable, Carbon): version-pinned links to archi@1 and 'track'
    roles: Array<{
      roleId: string;
      actorClass: 'h2a-standard' | 'human-classic';
      scopes: readonly string[];
      allowedArtifactKinds: readonly string[];
      mandateRights?: readonly string[];
      typicalActivities: string[];
      harnessSkillGraphIds?: string[];
      multiActorEdges: Array<{ relation: string; targetRoleId: string }>;
      derivationModelRef: string;
    }>;
  }): Promise<
    | { status: 'accepted'; graphCommitId: string; templateEnvelope: OntologyTemplateEnvelopeRef }
    | { status: 'refused-metamodel-invalid'; diagnostics: string[] } // Engram validates metamodel well-formedness only and never writes templates (decided 14/11); never repairs templates (proposed, not decided by the owner — source seat: h2a)
  >;

  recordHarnessDecisionAndSerializeOverlay(input: {
    tenantId: string;
    workspaceId: string;
    repositoryId: string;
    developerId: string;           // D33 pseudonymized
    mandateId: string;             // D4
    harnessTemplateEnvelope: OntologyTemplateEnvelopeRef; // h2a master harness template reference (+ digest: proposed, not decided by the owner)
    masterHarnessRef: string;      // h2a master harness baseline
    overlayDelta: Record<string, unknown>; // Harness-only delta; refusing modifications to a Track template is proposed, not decided by the owner (source seats: Fable, Carbon)
  }): Promise<{
    decisionNodeId: string;
    serializedOverlayPath: string; // Committed to Git per D31/D34 (.h2a/ directory layout is proposed, not decided by the owner — source seats: Fable, Carbon, h2a)
  }>;
}
```

---

## 3. Architectural Invariants

1. **Engram-First Ordering (`D24`, `D32`):**
   > **Superseded in direction by the owner's 15/11 words; pending the owner's decision dossier "journal de session en graphe et outil mémoire":** « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. »
   `h2a` host integrations MUST record session turns, tool results, and file references in `engram` first (`recordSessionEvent` via `/memory/v1/session-front/ingest`, fed by `new` `UserPromptSubmit`/`PostToolUse` hook generators on push hosts, `new` `vibe-post-tool.mjs` + `vibe-post-agent.mjs` on `vibe`, and a `new` poll/opportunistic bridge alongside today's `SessionStart` / `PreToolUse` / `h2a drumbeat scan` hooks in `packages/h2a/src/hosts/plugin.ts:107-113,128-134,208-211` on `agy` and `muse`), before live extraction (`recordExtraction`), `Track`, or any harness analyst reads or acts on them `[FACT: h2a repository: packages/h2a/src/hosts/plugin.ts:22-43,107-150,208-211; memory-dossier/owner-r15/comments-2026-11-08.md:15,19]`.
2. **Zero Linear Context Accumulation, Staged Rollout & Envelope-Only 7th Tool (`D19`, `D20`, `D22`, `D23`, Point 2B — *historically decided 2026-11-14*):**
   > **Superseded in direction by the owner's 15/11 words; pending the owner's decision dossier "journal de session en graphe et outil mémoire":** « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. »
   *Historical 14/11 invariant:* The seventh memory tool (`engram_memory_context` — tool identifier `proposed, not decided by the owner`, source seats: conductor, `Fable`, `Carbon`) is built now disabled by default and goes live only after the `engram` + `sentropic` co-signature and `MCP-L5` production qualification, after which CLI hosts switch one by one to a fixed end date (`decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:33`). Once switched, `h2a` MUST NOT accumulate multi-turn raw conversation transcripts in LLM prompts or execute session rollover handoffs: every prompt step is durationless and independent, constructed from the seventh tool (using the signed `h2a` mandate as primary fingerprint component) + the query result + the reprocessed output of the immediately preceding step. The seventh tool contract fixes only the envelope (template reference and version `decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:30`; `digest` `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`), never a closed list of `Track` or domain types `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:6-8; spec/memory/OWNER-DECISIONS-2026-11-14.md:23]`.
3. **Metamodel vs Template Mastery & Sibling Lineages (`Spec 0`, `D16`, Point 4B):** `engram` is master of the shared ontology metamodel and lineage registry; its « canonical graph memory authority » (`D28=engram`) governs recorded memory facts and the live registry, and is **not** authority over `Track` or `h2a` templates. Two sibling lineages sit under `engram`'s metamodel (`decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:48-51`, `EVIDENCE-q6-owner-question-and-answer.json:6,12`), alongside `archi@1` whose eleven kinds and fifteen relations stay unchanged (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`): `h2a` is master and sole author of the role, activity, and harness-skill profile templates (`engram` may propose role changes—and when a session has no role, `h2a` runs proactive analysis over `engram` and proposes a role and scope—but `engram` never writes role templates, `decided 2026-11-14`), while `Track` is sole author of the `Track` domain ontology templates (`decided 2026-11-14`). Cross-references by composition with version pinning are `proposed, not decided by the owner` (source seats: `Fable`, `Carbon`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:2; spec/memory/OWNER-DECISIONS-2026-11-14.md:13-14,25]`.
4. **Master Harness Templates + Git-Serialized Workspace Overlays (`D31`, `D34`, Point 4B):** `h2a` is master of the master harness templates; `engram` records all harness decisions in first rank and serializes each developer/workspace/repository harness overlay (`surcouche`) into a Git-committed artifact (`D31`, `D34`). Both the `.h2a/` filesystem directory layout (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`, `h2a`) and the rule that a `.h2a/` harness overlay never modifies a `Track` template or bypasses `Track` application control (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`) are seat proposals `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:14; spec/memory/OWNER-DECISIONS-2026-11-14.md:13,25]`.
5. **Formal Mandate Gate & Same-Role Recall (`D3`, `D4`, `D5`, `D10`, `D18`):** Mutations (admission, disposition, promotion, overlay serialization, cross-workspace federation) require a valid signed `h2a` mandate (`D4`). A session without a memory identity receives only the non-memory slices, read-only, under a recorded policy (`D18`). Successive sessions of the same `h2a` role, in the same `(tenantId, workspaceId)` space, read the non-admitted bodies before admission (`D5`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:4-5; memory-dossier/owner-r8/comments-2026-11-07.md:17,21]`.
6. **Cluster-Mesh & MCP Registry Exclusivity (`R12`):** `h2a` MUST NOT instantiate direct SQLite/file memory stores or standalone MCP servers outside `@sentropic/cluster-mesh` and the `packages/mcp-platform` registry `[FACT: memory-dossier/owner-r9/r12-correction-2026-11-07.md:5; memory-dossier/owner-r11/mcp-correction-2026-11-07.md:5]`.
7. **Multi-repo harness audit and harness graphs (owner, 2026-11-08; Point 3C, Point 4B):** **nightly dreaming runs locally** and **weekly and monthly dreaming (including the multi-repo master harness audit, after graph sync) run remotely** (`decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:42`, `EVIDENCE-q6-owner-question-and-answer.json:6,12`; local placement of `mid-day` and `context-saturation` passes is `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`); each repository's harness overlay evolves in that repository. `h2a` harness skills and `h2a` roles are `engram` graphs in the `h2a` template lineage (`proposed`; no such graph exists today), referencing `Track` domain objects by version-pinned composition (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:24-25; spec/memory/OWNER-DECISIONS-2026-11-14.md:24-25]`.
8. **Urgent Blocking CLI Questions vs Async Non-Blocking Decision Stack, Swipe Traversal & Non-Jargon Decision Skill (`D3`, `D27`, `owner-r8/comments-2026-11-07.md:54`):** Every `harness` and `project/production` decision is modelled as a first-class entity in `engram` carrying its scope, blocking posture (`urgent-blocking | async-non-blocking`), state, and serialization destination (`D3`). `h2a` provides a decision response tool (`new`) that either triggers the host CLI's native blocking question tool (`askuserquestion` or equivalent) when urgent and blocking, or stacks non-dossier pending decisions asynchronously for non-blocking review, paired with a swipe-through traversal surface across decisions and `D27` decision dossiers in both remote control and local modes, and a decision skill enforcing non-jargon prose, clear and rich context, and impact/risk option framing `[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:19,54; memory-dossier/owner-r15/comments-2026-11-08.md:12]`.

---

## 4. Out of Scope

- `Track` domain ontology templates (mastered by `Track`), `Track` application control verdicts and pre-merge acceptance, project event timeline projections, and per-PR `.track/` projection formatting (governed by `spec/memory/contracts/engram-track.md`; only `proposed, not decided by the owner` version-pinned cross-lineage references from `h2a` templates sit in this contract) `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:13-15,22,25-26]`.
- Low-level SQLite/Postgres storage drivers and transactional DB-cluster replication wire protocols (governed by `spec/memory/contracts/engram-cluster-mesh.md`) `[JUDGMENT]`.
- Direct GitHub/board UI rendering (GitHub and boards are an external HMI/input layer per `D30`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:13]`.
