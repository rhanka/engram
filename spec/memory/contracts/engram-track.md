# Contract: `engram` ↔ `Track` (Domain Ontology Templates, Authoritative Project Control, and Per-PR Projection)

- **Status:** `decided 2026-11-14` within the scope of `EVIDENCE-q6-message-shown-to-owner.md` and `EVIDENCE-q6-owner-question-and-answer.json` (`docs/memory-r15-sediment`; amended per [`spec/memory/OWNER-DECISIONS-2026-11-14.md`](../OWNER-DECISIONS-2026-11-14.md), seat extensions marked `proposed, not decided by the owner`, session-journal clauses amended on `2026-11-15` by `D1 A · D2 A · D3 A` with follow-up dossier pending, §2.2 interfaces `proposed`)
- **Repository of Record:** `engram` (`spec/memory/contracts/engram-track.md`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:20]`
- **Parties:**
  - **`engram`** (`@sentropic/engram`, `@sentropic/engram-memory`): Primary session ingestion front (`D24`, `D32`), canonical live-registry record authority (`D28=engram`), master of the shared ontology metamodel and lineage registry (`Spec 0`: shared grammar of types, relations, and versions plus registry `decided 2026-11-14`; attributes, states, file-projection descriptors, digests, and derivation/composition rules `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`; `engram` checks template well-formedness and never authors or modifies a `Track` template), memory confidentiality/PII deny-list authority (`D7`, `D8`, `D33`), and producer of the per-PR `.track/` projection conforming to the `Track` template version published by `Track` (`D34=engram`, `D29=both`; `Track` control replays and blocks merge on discrepancy) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/owner-r15/comments-2026-11-08.md:9,19; spec/memory/OWNER-DECISIONS-2026-11-14.md:13-15,22,26]`.
  - **`Track`** (`h2a repository: packages/track` and the `Track` application runtime): Master and sole author of its domain ontology templates (published in its own `track` lineage with no `engram` release) and master of their control; consumer of `engram` signals (via `cluster-mesh`, `R12`) for project decisions, project event management, live project realization tracking, authoritative `D1` bounded-list and promotion verdicts, and pre-merge PR projection validation and replay (`D1`, `D3`, `D24`, `D30`, `D32`, `D34`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:9,13,15-16,19; memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/owner-r10/suivi-direct-2026-11-07.md:5; spec/memory/OWNER-DECISIONS-2026-11-14.md:6,13-15,22,25-26]`.

> **Note on `2026-11-15` owner decisions (`D1 A · D2 A · D3 A`) and pending follow-up dossier ([`spec/memory/OWNER-DECISIONS-2026-11-14.md`](../OWNER-DECISIONS-2026-11-14.md) § « Owner words and dossier decisions of 2026-11-15 »):** On `2026-11-15`, on decision dossier « journal de session en graphe et outil mémoire », the owner decided **`D1 A`** (journal + diff — the three functions: note, return the diff, search history; data in nodes and edges), **`D2 A`** (parallel journal + injected diff: third-party tools keep their thread while `engram` notes each step and injects only what is new), and **`D3 A`** (journal first, in three stages: `(1)` note in third-party tools; `(2)` return the diff and search history; `(3)` our CLI, where `engram` is the primary logger). A follow-up decision dossier requested by the owner on `2026-11-15` (scope: `OWNER-DECISIONS-2026-11-14.md` § « Pending follow-up decision dossier ») is pending; these documents specify no design for its open points until he answers. The `2026-11-14` contract text below has not yet been rewritten and is read with `D1 A · D2 A · D3 A` (`2026-11-15`) and the pending follow-up dossier.

---

## 1. What Each Party Provides and Consumes

### 1.1 `engram` Provides to `Track`
1. **Shared Ontology Metamodel & `track` Lineage Registry (`Spec 0`, `T-M-C`):** The versioned ontology metamodel (types, relations, and versions plus the registry `decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:10`; attributes, allowed states, `.track/` file-projection descriptors, SHA-256 digests, and cross-lineage derivation/composition rules `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`) and the lineage registry where `Track` is sole writer of the `track` lineage (`decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:50`). `engram` checks only metamodel well-formedness—accepting or refusing a template and never writing or modifying one (`decided 2026-11-14`; digest receipt `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`; non-repair `proposed, not decided by the owner` — source seat: `h2a`)—and keeps previously registered template versions readable across metamodel evolutions (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`) `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:14,17,22,25]`.
2. **Live Project Signal & Template-Typed Instance Stream (`D24`, `D28`, Live Tracking):** Real-time subscription feed and graph query surface over project-scoped raw signals, tool milestones, derived worktree state (`D21`), and proposed/accepted project-domain instances (referenced by `Track` template version `decided 2026-11-14`, plus digest `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`, never by a closed list of `Track` types in `engram`) already ingested into `engram` (`« Attention track c juste pour les decision et gestion d evenement projet. Engram doit etre la premiere etape in fine. Cette assertion me smeble tres mauvaiss »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:9]`; `« trakc avec engram devra vraiment assurer un suivi live »` `[FACT: memory-dossier/owner-r10/suivi-direct-2026-11-07.md:5; spec/memory/OWNER-DECISIONS-2026-11-14.md:22]`).
3. **Domain-Filtered Decision Model (`D3`, `D27`, `D31`):** `engram` models every decision (`project/production` and `harness`) as a base metamodel construct carrying scope, blocking posture (`urgent-blocking` vs `async-non-blocking` pending review, `owner-r8/comments-2026-11-07.md:54`), state, and serialization destination (`D3`), filters out harness-only decisions (which serialize to workspace/repo harness overlays per `D31`), and delivers project decisions and `D27` decision-dossier contextualized facts whose project varieties, outcomes, and dossier structures are defined by the cited `Track` template version (`« clarifie. aujourd'hui on n'a pas les decision record dans track ? (comme les décision de ce dossier). quoi qu'il arrive engram doit modéliser toute décision: décision de projet, décision de harnais, mais avec des destination de sérialisation différentes. le track ne doit pas spécialement enregistrer les décision de harnais. »` `[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:19,54; spec/memory/OWNER-DECISIONS-2026-11-14.md:13,22]`).
4. **Template-Driven Per-PR Projection Producer (`D28=engram`, `D29=both`, `D34=engram`, Point 1B):** `engram` produces the deterministic per-PR `.track/` projection carrying **both** the event journal and a state snapshot (with statuses and remaining work computed by `Track` and recorded in `engram`), linked by fingerprint (`D29=both`), conforming to the `Track` domain template version published by `Track` (`decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:23`; citing its SHA-256 `digest` `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`). `Track` control validates and replays it before merge and blocks merge on discrepancy (`D34=engram`, `decided 2026-11-14`; `"never repaired by engram"` `proposed, not decided by the owner` — source seat: `h2a`). **`D28` is kept:** `engram`'s live registry remains the reference, and `.track/events.jsonl` is **not** an authoritative journal written by `Track` control `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/owner-r15/comments-2026-11-08.md:14; spec/memory/OWNER-DECISIONS-2026-11-14.md:22]`.
5. **Normalized External HMI / GitHub Signals (`D30`):** External inputs originating from GitHub issues, PR reviews, or project boards (`D30`) ingested into `engram` first and exposed to `Track` as graph events. The interface layer (GitHub, boards) reads engram views, which include Track's recorded annotations. Track does not feed the board `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:13]`.

### 1.2 `Track` Provides to `engram`
1. **Domain Ontology Templates (`T-M-C`, Point 1B, Point 4B):** Versioned `Track` domain ontology templates (domain object types, allowed states, and `.track/` file shapes `decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:9`; the `Track` control verdict covering the `D1` bounded list `decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:11`; declaring `D1` bounded-list membership inside the `Track` template, typed attribute schemas, and SHA-256 digests `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`), published in the `track` lineage and evolved by `Track` alone without an `engram` release (`« […] il fdoit en rester maitre au moins piur les templates et engram pour leur metamodel et application track pour leur controle. »` `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:6,13,22,25]`).
2. **Project Analysis & Realization State Enrichments (`D1`, `D24`):** Structured project-event correlations, realization state transitions, decision dossier outcomes (`packages/track/src/model/decision.ts:48-94`), and third-party promotion review dispositions (`D1=borne-review`), typed by `Track` template version (`decided 2026-11-14`) and digest (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`) and written back into `engram` via `cluster-mesh` (`R12`) `[FACT: h2a repository: packages/track/src/model/decision.ts:48-94; memory-dossier/owner-r15/answers-2026-11-08.compact.md:4; spec/memory/OWNER-DECISIONS-2026-11-14.md:13,22]`.
3. **Authoritative Project-Domain Control Verdicts & Pre-Merge Acceptance (`D32`, `D34`, Point 5B):** Control still originates from both `engram` and `Track` (`« Donc part de engram - et de track »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:16]`), executed via a rules/decision engine (owner verbatim: `« api type jev/decison »`), fast low-latency LLMs, or control agents (`« […] L usage d agent en controle pour track iu engrame devrai etre possible mais potentiellement reposer plutot sur des api type jev/decison ou llm tres rapides. Je ne sais pas si ce seront des "agents" »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:15; memory-dossier/owner-r15/answers-2026-11-08.compact.md:5]`). For the `Track` domain, the `Track` application writes and executes its rules, and its verdict (`verdictAuthority: 'track'`) is authoritative over template conformance, the `D1` bounded list (including any dreamed proposal touching the `Track` domain per Point 3C), mandate scope, and `D34` pre-merge PR projection validation and replay (`decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:11,38,58`; `engram` recording the verdict as a distinct record and never replacing it is `proposed, not decided by the owner` — source seat: `Fable`). Without a `Track` verdict, a typed write stays `proposed`, while the raw event is already recorded in `engram` (`decided 2026-11-14`) `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:15,22,24,26]`.

---

## 2. Interfaces

### 2.1 Existing Interfaces (in `h2a repository: packages/track`, `origin/main` `1f57127de`, to be Re-anchored on `engram`)
- `packages/track/src/model/decision.ts:11-94` (`DecisionKind`, `Outcome`, `Dossier`, `DossierArtifact`) and ongoing `Track` ontology modules: Canonical source definitions of `Track` domain ontology templates owned by `Track` and published into `engram`'s `track` lineage (project-domain records in `engram` instantiate these templates by version `decided 2026-11-14` and digest `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`, rather than reducing `Track` modules to passive views over fixed `engram` node kinds) `[FACT: h2a repository: packages/track/src/model/decision.ts:11-94; spec/memory/OWNER-DECISIONS-2026-11-14.md:6,13,25]`.
- `packages/track/src/events/store.ts:34-42` (`EventStore` over `.track/events.jsonl`), `packages/track/src/report/snapshot.ts:14` (`SNAPSHOT_SCHEMA = 'track.snapshot/v1'`), and `packages/track/src/state/snapshot.ts:34-37` (`Snapshot` `{ streamLength, state }`, which has no `schema` field today): Retired as a primary session writer (`« pardon mais 1. events doit être géré par engram. la sérialisation potentiellement via track je ne sais pas mais la c'est sûr qu'il n'y a aucune connexion a aucun module donc y a un pb »` `[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:28]`). **`D28` is kept:** `engram`'s live registry is the canonical reference, and `.track/events.jsonl` is **not** an authoritative domain journal written by `Track` control; `.track/` is a materialized per-PR projection (event journal + state snapshot linked by fingerprint, `D29=both`, file shapes governed by the `Track` template version declared in the repo) produced by `engram` and validated/replayed before merge by `Track` control (`D28=engram`, `D29=both`, `D34=engram`) `[FACT: h2a repository: packages/track/src/events/store.ts:34-42; packages/track/src/report/snapshot.ts:14; packages/track/src/state/snapshot.ts:34-37; memory-dossier/owner-r8/comments-2026-11-07.md:28; memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; spec/memory/OWNER-DECISIONS-2026-11-14.md:3,22]`.
- `packages/track/src/ingest/ingest.ts:242-280` (`authorize()`): Re-anchored in the `Track` application's control engine (`verdictAuthority: 'track'`) to require a formal `h2a` mandate (`D4=mandate`), validate conformance against the cited `Track` template version (`decided 2026-11-14`) and digest (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`), and operate on `engram`-ingested signals via `cluster-mesh` (`R12`) `[FACT: h2a repository: packages/track/src/ingest/ingest.ts:275-277; spec/memory/OWNER-DECISIONS-2026-11-14.md:15,26]`.

### 2.2 Proposed Interfaces (`proposed` — to be built under R15 Spec Plan)

```ts
export type Sha256Digest = `sha256:${string}`; // 64 hex lowercase over RFC 8785 (JCS) UTF-8 bytes

// status: proposed — Signed h2a mandate envelope verified at L0/boundary gates (Spec 0 :161-174;
// grounded on h2a@1f57127de:packages/h2a/src/types.ts:73-77,79-102,239-249 and packages/h2a/src/authority.ts:55-59,90-94)
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

// status: proposed — Neutral reference to a Track domain template version (decided 2026-11-14)
// plus digest (templateDigestSha256: proposed, not decided by the owner — source seats: Fable, Carbon)
export interface TrackTemplateRef {
  lineage: 'track';
  templateId: string;
  templateVersion: string;
  templateDigestSha256: Sha256Digest; // proposed, not decided by the owner (source seats: Fable, Carbon)
}

// status: proposed — Track Domain Template Lineage Registration Port on Engram Metamodel (Spec 0, T-M-C)
export interface TrackOntologyTemplateRegistryPort {
  registerTrackTemplateVersion(input: {
    writerMandate: H2AMandateEnvelope; // Signed formal h2a mandate (D4); Track is sole writer of the 'track' lineage
    metamodelVersion: string;
    templateId: string;
    templateVersion: string;
    templateDefinition: Record<string, unknown>; // Domain types, allowed states, .track/ file shapes (decided 14/11, message:9); declaring D1 bounded-list membership inside the template and typed attributes (proposed, not decided by the owner — source seats: Fable, Carbon)
    templateDigestSha256: Sha256Digest; // proposed, not decided by the owner (source seats: Fable, Carbon)
  }): Promise<
    | { status: 'accepted'; templateRef: TrackTemplateRef }
    | { status: 'refused-metamodel-invalid'; diagnostics: string[] } // Never authored or modified by engram (decided 14/11); never repaired by engram (proposed, not decided by the owner — source seat: h2a)
  >;
}

// status: proposed — Engram -> Track Live Analyst Subscription & Query Port via cluster-mesh (R12, D24, D28)
export interface EngramTrackAnalystPort {
  /**
   * Subscribes Track as a live downstream analyst to project-relevant events
   * and project decisions already recorded in engram (routed through cluster-mesh per R12).
   */
  subscribeProjectStream(input: {
    tenantId: string;
    workspaceId: string;
    derivedWorktreeId: string | null; // D21
    fromTxId: string | null;
    templateRefs: TrackTemplateRef[]; // Subscribed Track template versions (+ digests: proposed, not decided by the owner)
    includeTemplateTypeIds?: string[]; // Open template-defined type identifiers; never a closed list in engram
    includeBaseSignals?: Array<'raw_session_event' | 'gh_input_event'>; // Note: session-journal framing amended 2026-11-15 by D1 A · D2 A · D3 A; follow-up dossier pending (see top note)
  }): AsyncIterable<{
    txId: string;
    nodeId: string;
    signalClass: 'track_domain_object' | 'raw_session_event' | 'gh_input_event';
    templateRef: TrackTemplateRef | null; // Required when signalClass === 'track_domain_object'
    templateTypeId: string | null;        // Type declared in templateRef; never hardcoded in engram
    reviewStatus:
      | 'proposed'                        // Point 5B (decided 14/11): stays proposed until Track control verdict
      | 'recorded-bounded-type'
      | 'promotion-draft-awaiting-third-party'
      | 'approved'
      | 'rejected';                       // D1=borne-review
    payload: Record<string, unknown>;
    recordedAtIso: string;
  }>;

  /**
   * Records Track enrichments and realization state conforming to a Track template
   * version (+ digest: proposed, not decided by the owner) back into the canonical engram graph via cluster-mesh (R12).
   */
  recordTrackAnalysisAnnotation(input: {
    tenantId: string;
    workspaceId: string;
    mandateId: string;             // D3/D4 formal h2a mandate; signed H2AEnvelope<H2AMandate> verified upstream at the cluster-mesh R12 boundary gate (POST /memory/v1/track/annotations, Spec 6A §2.2–§2.3 :227,311-398).
    targetNodeIds: string[];
    templateRef: TrackTemplateRef; // Cited Track template version (+ digest: proposed, not decided by the owner)
    annotationTypeId: string;      // Open type declared by templateRef; never a closed list in engram
    summary: string;
    structuredState: Record<string, unknown>; // Validated by Track application against templateRef
  }): Promise<{ annotationNodeId: string; txId: string }>;
}

// status: proposed — Split Engram + Track Control Evaluation Port (D32, T-M-C Point 5B)
export type ControlGateEvaluationInput =
  | {
      tenantId: string;
      workspaceId: string;
      gateScope: 'project-domain';
      verdictAuthority: 'track';   // Track application is sole control authority for project-domain gates (Point 5B, decided 14/11)
      origin: 'engram-front' | 'track-analyst'; // D32: control hooks may originate from both engram and Track
      engineKind: 'rules-decision-engine' | 'fast-llm' | 'control-agent';
      turnNodeId: string;
      templateRef: TrackTemplateRef; // Template version (+ digest: proposed, not decided by the owner) governing the typed write
      templateTypeId: string;
      activeMandateId: string | null;
      actorId: string;
      provenanceKind: 'human' | 'agent' | 'automation';
      actKind: 'own-act' | 'mandated-act' | 'unmandated-scoped';
      candidatePayload: Record<string, unknown>;
      targetAggregateId?: string;
      activeRulesRef: string;      // Rules authored and executed by the Track application
    }
  | {
      tenantId: string;
      workspaceId: string;
      gateScope: 'metamodel-and-privacy';
      verdictAuthority: 'engram';  // Engram checks metamodel well-formedness and holds D7 confidentiality deny-list
      origin: 'engram-front' | 'track-analyst'; // D32
      engineKind: 'rules-decision-engine' | 'fast-llm' | 'control-agent';
      turnNodeId: string;
      metamodelVersion: string;
      activeMandateId: string | null;
      activeRulesRef: string;
    };

export interface MemoryAndTrackControlPort {
  evaluateControlGate(input: ControlGateEvaluationInput): Promise<{
    verdictAuthority: 'track' | 'engram';
    verdict: 'allow' | 'flag-for-borne-review' | 'block';
    proposalDisposition: 'accepted' | 'stays-proposed' | 'refused'; // Without a Track verdict, typed project writes stay 'proposed' (decided 14/11)
    appliedRuleIds: string[];
    controlLatencyMs: number;
    rationale: string;
  }>;
}
```

#### Bijection `(verdict, proposalDisposition) <-> reviewStatus` (`gateScope: 'project-domain'`, `verdictAuthority: 'track'`)

Every `track_domain_object` emitted on `EngramTrackAnalystPort.subscribeProjectStream` maps bijectively between its latest `Track` control state `(verdict, proposalDisposition)` (`verdict = null` before any `Track` verdict is recorded) and `reviewStatus` (all other `(verdict, proposalDisposition)` combinations are invalid and rejected):

| `verdict` (`verdictAuthority: 'track'`) | `proposalDisposition` | `reviewStatus` (`subscribeProjectStream`) | Domain State Meaning |
| :--- | :--- | :--- | :--- |
| `null` *(no `Track` verdict recorded yet)* | `'stays-proposed'` | `'proposed'` | Held as a proposal until `Track` control evaluates it (`Point 5B`, `decided 2026-11-14`); excluded from accepted domain state. |
| `'allow'` | `'accepted'` | `'recorded-bounded-type'` | `D1` bounded-list write directly authorized by `Track` control without human review; enters accepted domain state. |
| `'flag-for-borne-review'` | `'stays-proposed'` | `'promotion-draft-awaiting-third-party'` | `D1=borne-review` promotion draft gated by `Track` control and awaiting an authorized third party; excluded from accepted domain state until approved. |
| `'flag-for-borne-review'` | `'accepted'` | `'approved'` | `D1=borne-review` promotion draft approved by an authorized third party (never its author) and accepted by `Track` control; enters accepted domain state. |
| `'block'` | `'refused'` | `'rejected'` | Refused by `Track` control (`authorize()`, `h2a@1f57127de:packages/track/src/ingest/ingest.ts:242-280`) or rejected at third-party review; excluded from accepted domain state. |

```ts
// status: proposed — Per-PR Serialization Producer in Engram (D28=engram, D29=both, D34=engram)
// Formula: linkFingerprint = sha256(JCS({ templateRef, eventJournalSha256, stateSnapshotSha256, head }))
export interface EngramPrSerializationProducerPort {
  serializeProjectPrSlice(input: {
    tenantId: string;
    workspaceId: string;
    derivedWorktreeId: string;       // D21
    prBranchName: string;
    baseCommitSha: string;
    headCommitSha: string;
    mandateId: string;             // D4 formal h2a mandate; signed H2AEnvelope<H2AMandate> verified upstream at the cluster-mesh R12 boundary gate (POST /memory/v1/serialization/export, Spec 6A §2.2–§2.3 :229,311-398).
    templateRef: TrackTemplateRef; // Published Track template version applied by engram (decided 14/11; digest field proposed, not decided by the owner)
    baseTemplateRef?: TrackTemplateRef; // Prior Track template version when the PR evolves track.ontology.yaml (new, Spec 0)
    mappingRef?: string;           // Optional template migration mapping reference for baseTemplateRef -> templateRef
  }): Promise<{
    producer: 'engram';            // D34=engram: engram produces the per-PR projection
    acceptor: 'track-control';     // Point 1B: Track control validates and replays before merge, blocking merge on discrepancy
    registryAuthority: 'engram';   // D28=engram kept: engram's live registry stays the reference
    templateRef: TrackTemplateRef; // Cited Track template version (+ digest: proposed, not decided by the owner)
    baseTemplateRef?: TrackTemplateRef;
    mappingRef?: string;
    contentMode: 'both';           // D29=both (event journal + state snapshot, linked by fingerprint)
    eventJournalPath: string;      // File path/shape declared by templateRef (e.g. .track/pr/<pr-or-branch>/events.jsonl)
    eventJournalSha256: Sha256Digest;
    stateSnapshotPath: string;     // File path/shape declared by templateRef (e.g. .track/pr/<pr-or-branch>/snapshot.json)
    // 'track.snapshot/v1' exists in h2a@1f57127de:packages/track/src/report/snapshot.ts:14;
    // 'track.state-snapshot/v1' is `new` (proposed Track schema; packages/track/src/state/snapshot.ts:34-37 Snapshot has no `schema` field today).
    stateSnapshotSchema: 'track.state-snapshot/v1' | 'track.snapshot/v1';
    stateSnapshotSha256: Sha256Digest;
    headPath: string;              // .track/head.json path declared by templateRef for suffix-truncation validation
    head: { streamLength: number; lastContentHash: Sha256Digest | null };
    linkFingerprint: Sha256Digest; // sha256(JCS({ templateRef, eventJournalSha256, stateSnapshotSha256, head }))
    contentDigestSha256: Sha256Digest;
  }>;
}

// status: proposed — Pre-merge Template Validation and Replay by Track Control (D34=engram, Point 1B)
export interface TrackSerializationReplayPort {
  replayBeforeMerge(input: {
    prBranchName: string;
    templateRef: TrackTemplateRef; // Published Track template version (+ digest: proposed, not decided by the owner)
    baseTemplateRef?: TrackTemplateRef; // Prior Track template version when the PR evolves track.ontology.yaml (new, Spec 0)
    mappingRef?: string;           // Optional migration mapping reference for baseTemplateRef -> templateRef
    eventJournalPath: string;
    eventJournalSha256: Sha256Digest;
    stateSnapshotPath: string;
    // 'track.snapshot/v1' exists in h2a@1f57127de:packages/track/src/report/snapshot.ts:14;
    // 'track.state-snapshot/v1' is `new` (proposed Track schema; packages/track/src/state/snapshot.ts:34-37 Snapshot has no `schema` field today).
    stateSnapshotSchema: 'track.state-snapshot/v1' | 'track.snapshot/v1';
    stateSnapshotSha256: Sha256Digest;
    headPath: string;
    head: { streamLength: number; lastContentHash: Sha256Digest | null };
    linkFingerprint: Sha256Digest; // sha256(JCS({ templateRef, eventJournalSha256, stateSnapshotSha256, head }))
  }): Promise<{
    verdictAuthority: 'track';
    acceptor: 'track-control';
    templateConformant: boolean;
    verdict: 'match' | 'mismatch'; // Mismatch blocks merge (decided 14/11); "never repaired by engram" is proposed, not decided by the owner (source seat: h2a)
    acceptance: 'accepted' | 'refused';
    mismatches: string[];
  }>;
}
```

---

## 3. Architectural Invariants

1. **Engram Before Track (`D24`, `D32`, Owner Global Principle):** `Track` is never the first ingestion hop for session events, speech turns, or decisions (`« […] Engram doit etee en premier front pour recup les donnes de session avant track, avec des analystes - Track nest qu un modal d analyst et controle mais le harnais en est un autre et l agent dormant aussi... a voir. […] »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:19]`; `« pardon mais 1. events doit être géré par engram. la sérialisation potentiellement via track je ne sais pas mais la c'est sûr qu'il n'y a aucune connexion a aucun module donc y a un pb »` `[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:28]`). Every raw session record enters `engram` first *(session-journal framing amended `2026-11-15` by `D1 A · D2 A · D3 A`, with follow-up dossier pending — see top note)*, requiring no domain template; typed `Track`-domain writes are evaluated against `Track`'s templates and accepted by `Track` control `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:22,26]`.
2. **Project-Only Scope in Track (`D3`, `D24`, `D31`):** `Track` defines templates for, analyzes, and controls **project decisions and project events only** (`« Attention track c juste pour les decision et gestion d evenement projet. […] »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:9]`). Harness decisions and workspace/repository harness overlays (`D31`) are excluded from `Track` and handled by `h2a` (`[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:19]`); a `.h2a/` overlay never modifying a `Track` template is `proposed, not decided by the owner` (source seats: `Fable`, `Carbon`) `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:25]`.
3. **Bounded Review Gate under `Track` Control (`D1=borne-review`, `D3=mandated`, `D4=mandate`, Point 3C, Point 5B):** Writes whose type is on the `D1` bounded list pass the `Track` application's control verdict (`verdictAuthority: 'track'`, the verdict covering the `D1` bounded list `decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:11`; declaring `D1` bounded-list membership inside `Track`'s templates is `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`) and are recorded without human review. Every promotion draft passes `Track` control and waits for an authorized third party, never applied by its author (`D1=borne-review`). Every dreamed proposal touching the `Track` domain passes `Track` control, and the dormant agent never writes into `Track` itself (`decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:38`); routing dreamed proposals that touch a `Track` template as requests to `Track` alone is `proposed, not decided by the owner` (source seat: `Fable`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:4; spec/memory/OWNER-DECISIONS-2026-11-14.md:15,24,26]`.
4. **Live-Registry Reference Kept (`D28=engram`) and Template-Driven Per-PR Projection (`D29=both`, `D34=engram`, Point 1B):** **`D28` is kept:** `engram`'s live registry remains the canonical reference for recorded facts (when the live registry and a PR file copy contradict each other, `engram`'s live registry wins and the copy is regenerated at the next PR), and `.track/events.jsonl` is **not** an authoritative domain journal written by `Track` control (`decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:25`, `EVIDENCE-q6-owner-question-and-answer.json:6,11-16`). For template definitions, `Track`'s published template version is the reference (`decided 2026-11-14`; SHA-256 `digest` citation `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`). `engram` produces the per-PR `.track/` projection (event journal + state snapshot, linked by fingerprint, `D29=both`) conforming to the `Track` template version published by `Track`, and `Track` control replays and validates it before merge `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; spec/memory/OWNER-DECISIONS-2026-11-14.md:3,13,22]`.
5. **Control Origin and Verdict Authority (`D32`, Point 5B):** Control hooks still originate from both `engram` and `Track` (`« Donc part de engram - et de track »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:16]`) and MUST support a rules/decision engine (owner verbatim: `« api type jev/decison »`), fast low-latency LLMs, and control agents (`[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:15]`). For the `Track` domain, the `Track` application writes and executes its rules and its verdict (`verdictAuthority: 'track'`) is authoritative (`decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:58`; without a verdict, a typed project write stays `proposed`, while the raw record is already in `engram`; `engram` recording the verdict as a distinct record and never replacing it is `proposed, not decided by the owner` — source seat: `Fable`). `engram` checks template well-formedness against its metamodel and holds the `D7` confidentiality deny-list `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:14-15,26]`.
6. **Separation from GitHub / Board HMI Layer (`D30`):** `Track` is an analytical and control module, not a board UI or a direct GitHub mirror. GitHub issues, PRs, and project boards sit in a separate HMI/input layer that reads `engram` views and feeds external user/GitHub inputs into `engram` (`« Attention tu confonds l outil track la memoire e tun outil ihm pour interagir avec - gh pourra donner de l input c une autre layer »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:13]`).
7. **Pre-Merge Template Validation and Replay (`D34`, Point 1B):** The `Track` application's control validates conformance to the declared `Track` template version (`decided 2026-11-14`; `digest` `proposed, not decided by the owner` — source seats: `Fable`, `Carbon`) and replays the `engram`-produced per-PR projection before merge, blocking merge on discrepancy (`D34`, `decided 2026-11-14`; `"never repaired by engram"` is `proposed, not decided by the owner` — source seat: `h2a`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/kit/src/memory-content-r11.json:4208-4211; spec/memory/OWNER-DECISIONS-2026-11-14.md:15,22]`.
8. **Cluster-Mesh Mediation (`R12`):** Track (h2a repository) reads and writes engram only through cluster-mesh memory access (R12, owner-r9 r12-correction:5, kit:287). No Track interface reaches engram directly `[FACT: memory-dossier/owner-r9/r12-correction-2026-11-07.md:5; memory-dossier/kit/src/memory-content-r11.json:287]`.
9. **T-M-C Ontology Ownership & Zero Closed Type Lists (`OWNER-DECISIONS-2026-11-14.md`):** Per the owner rule (`« […] il fdoit en rester maitre au moins piur les templates et engram pour leur metamodel et application track pour leur controle. »`), `Track` is master and sole author of its domain ontology templates (evolving them with no `engram` release, `decided 2026-11-14`, `EVIDENCE-q6-message-shown-to-owner.md:9`; the qualification « unless a new metamodel construct is needed » is `proposed, not decided by the owner` — source seat: `Fable`), `engram` is master of the shared metamodel and lineage registry (accepting or refusing templates on well-formedness only, never writing one), and the `Track` application is master of their control. `Track` domain types are always referenced by `templateVersion` (`decided 2026-11-14`) plus `templateDigestSha256` (`proposed, not decided by the owner` — source seats: `Fable`, `Carbon`), never as a closed list in `engram` interfaces `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:6,13-15,22-23,25-27]`.

---

## 4. Out of Scope

- Master harness templates, developer/workspace/repository `.h2a/` harness overlays (`D31`), and `h2a` role, activity, and harness-skill templates (`D16`) (governed by `spec/memory/contracts/engram-h2a.md`; `Track` domain ontology templates and their control are governed here under the shared metamodel of `Spec 0`) `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:25]`.
- Database-cluster replication mechanics (including the `proposed, not decided by the owner` offline concurrent template-version conflict refusal — source seat: `Fable`) and MCP registry routing (governed by `spec/memory/contracts/engram-cluster-mesh.md`) `[JUDGMENT]`.
- Frontend board UI implementation in Sentropic or GitHub Apps (external HMI layer per `D30`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:13]`.
