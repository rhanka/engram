# Contract: `engram` ↔ `Track` (Domain Ontology Templates, Authoritative Project Control, and Per-PR Projection)

- **Status:** `decided 2026-11-14` (`docs/memory-r15-sediment`; amended per [`spec/memory/OWNER-DECISIONS-2026-11-14.md`](../OWNER-DECISIONS-2026-11-14.md), §2.2 interfaces `proposed`)
- **Repository of Record:** `engram` (`spec/memory/contracts/engram-track.md`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:20]`
- **Parties:**
  - **`engram`** (`@sentropic/engram`, `@sentropic/engram-memory`): Primary session ingestion front (`D24`, `D32`), canonical live-registry record authority (`D28=engram`), master of the shared ontology metamodel and lineage registry (`Spec 0`: grammar, versions, digests, derivation and composition rules; `engram` checks template well-formedness and never authors or modifies a `Track` template), memory confidentiality/PII deny-list authority (`D7`, `D8`, `D33`), and producer of the per-PR `.track/` projection conforming to the `Track` template version declared in the repository (`D34=engram`, `D29=both`; `Track` control is the acceptor) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/owner-r15/comments-2026-11-08.md:9,19; spec/memory/OWNER-DECISIONS-2026-11-14.md:11-13,21,25]`.
  - **`Track`** (`h2a repository: packages/track` and the `Track` application runtime): Master and sole author of its domain ontology templates (published in its own `track` lineage with no `engram` release) and master of their control; consumer of `engram` signals (via `cluster-mesh`, `R12`) for project decisions, project event management, live project realization tracking, authoritative `D1` bounded-list and promotion verdicts, and pre-merge PR projection validation and replay as sole acceptor (`D1`, `D3`, `D24`, `D30`, `D32`, `D34`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:9,13,15-16,19; memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/owner-r10/suivi-direct-2026-11-07.md:5; spec/memory/OWNER-DECISIONS-2026-11-14.md:6,11-13,21,24-25]`.

---

## 1. What Each Party Provides and Consumes

### 1.1 `engram` Provides to `Track`
1. **Shared Ontology Metamodel & `track` Lineage Registry (`Spec 0`, `T-M-C`):** The versioned ontology metamodel (types, attributes, relations, allowed states, `.track/` file-projection descriptors, versions, SHA-256 digests, and cross-lineage derivation/composition rules) and the lineage registry where `Track` is sole writer of the `track` lineage. `engram` checks only metamodel well-formedness—returning an acceptance receipt with digest or a reasoned refusal, never writing or modifying a template—and keeps previously registered template versions readable across metamodel evolutions `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:12,16,21,24]`.
2. **Live Project Signal & Template-Typed Instance Stream (`D24`, `D28`, Live Tracking):** Real-time subscription feed and graph query surface over project-scoped raw signals, tool milestones, derived worktree state (`D21`), and proposed/accepted project-domain instances (referenced by `Track` template version and digest, never by a closed list of `Track` types in `engram`) already ingested into `engram` (`« Attention track c juste pour les decision et gestion d evenement projet. Engram doit etre la premiere etape in fine. »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:9]`; `« trakc avec engram devra vraiment assurer un suivi live »` `[FACT: memory-dossier/owner-r10/suivi-direct-2026-11-07.md:5; spec/memory/OWNER-DECISIONS-2026-11-14.md:21]`).
3. **Domain-Filtered Decision Model (`D3`, `D27`, `D31`):** `engram` models every decision (`project` and `harness`) as a base metamodel construct with its domain and serialization destination (`D3`), filters out harness-only decisions (which serialize to workspace/repo harness overlays per `D31`), and delivers project decisions and `D27` decision-dossier contextualized facts whose project varieties, outcomes, and dossier structures are defined by the cited `Track` template version (`« quoi qu'il arrive engram doit modéliser toute décision: décision de projet, décision de harnais, mais avec des destination de sérialisation différentes. le track ne doit pas spécialement enregistrer les décision de harnais. »` `[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:19; spec/memory/OWNER-DECISIONS-2026-11-14.md:11,21]`).
4. **Template-Driven Per-PR Projection Producer (`D28=engram`, `D29=both`, `D34=engram`, Point 1B):** `engram` produces the deterministic per-PR `.track/` projection carrying **both** the event journal and a state snapshot (with statuses and remaining work computed by `Track` and recorded in `engram`), linked by fingerprint (`D29=both`), conforming to the `Track` domain template version declared in the repository and citing its version and digest. `Track` control validates and replays it before merge as the sole acceptor (`D34=engram`): a non-conforming projection is refused, never repaired by `engram`. **`D28` is kept:** `engram`'s live registry remains the reference, and `.track/events.jsonl` is **not** an authoritative journal written by `Track` control `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/owner-r15/comments-2026-11-08.md:14; spec/memory/OWNER-DECISIONS-2026-11-14.md:21]`.
5. **Normalized External HMI / GitHub Signals (`D30`):** External inputs originating from GitHub issues, PR reviews, or project boards (`D30`) ingested into `engram` first and exposed to `Track` as graph events. The interface layer (GitHub, boards) reads engram views, which include Track's recorded annotations. Track does not feed the board `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:13]`.

### 1.2 `Track` Provides to `engram`
1. **Domain Ontology Templates (`T-M-C`, Point 1B, Point 4B):** Versioned `Track` domain ontology templates (domain object types, attributes, relations, allowed states, `D1` bounded-list membership, and `.track/` file shapes), published in the `track` lineage with SHA-256 digests and evolved by `Track` alone without an `engram` release (`« il fdoit en rester maitre au moins piur les templates et engram pour leur metamodel et application track pour leur controle. »` `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:6,11,21,24]`).
2. **Project Analysis & Realization State Enrichments (`D1`, `D24`):** Structured project-event correlations, realization state transitions, decision dossier outcomes (`packages/track/src/model/decision.ts:48-94`), and third-party promotion review dispositions (`D1=borne-review`), typed by `Track` template version and digest and written back into `engram` via `cluster-mesh` (`R12`) `[FACT: h2a repository: packages/track/src/model/decision.ts:48-94; memory-dossier/owner-r15/answers-2026-11-08.compact.md:4; spec/memory/OWNER-DECISIONS-2026-11-14.md:11,21]`.
3. **Authoritative Project-Domain Control Verdicts & Pre-Merge Acceptance (`D32`, `D34`, Point 5B):** Control still originates from both `engram` and `Track` (`« Donc part de engram - et de track »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:16]`), executed via a rules/decision engine (owner verbatim: `« api type jev/decison »`), fast low-latency LLMs, or control agents (`« L usage d agent en controle pour track iu engrame devrai etre possible mais potentiellement reposer plutot sur des api type jev/decison ou llm tres rapides. »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:15; memory-dossier/owner-r15/answers-2026-11-08.compact.md:5]`). For the `Track` domain, the `Track` application writes and executes its rules, and its verdict (`verdictAuthority: 'track'`) is authoritative over template conformance, the `D1` bounded list (including any dreamed proposal per Point 3C), mandate scope, and `D34` pre-merge PR projection validation and replay; `engram` records the verdict and never replaces it. Without a `Track` verdict, a typed write stays `proposed`, while the raw event is already recorded in `engram` `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:13,21,23,25]`.

---

## 2. Interfaces

### 2.1 Existing Interfaces (in `h2a repository: packages/track` to be Re-anchored on `engram`)
- `packages/track/src/model/decision.ts:11-94` (`DecisionKind`, `Outcome`, `Dossier`, `DossierArtifact`) and ongoing `Track` ontology modules: Canonical source definitions of `Track` domain ontology templates owned by `Track` and published into `engram`'s `track` lineage (project-domain records in `engram` instantiate these templates by version and digest, rather than reducing `Track` modules to passive views over fixed `engram` node kinds) `[FACT: h2a repository: packages/track/src/model/decision.ts:11-94; spec/memory/OWNER-DECISIONS-2026-11-14.md:6,11,24]`.
- `packages/track/src/events/store.ts:39-66` (`EventStore` over `.track/events.jsonl`): Retired as a primary session writer. **`D28` is kept:** `engram`'s live registry is the canonical reference, and `.track/events.jsonl` is **not** an authoritative domain journal written by `Track` control; `.track/` is a materialized per-PR projection (event journal + state snapshot linked by fingerprint, `D29=both`, file shapes governed by the `Track` template version declared in the repo) produced by `engram` and validated/replayed before merge by `Track` control as sole acceptor (`D28=engram`, `D29=both`, `D34=engram`) `[FACT: h2a repository: packages/track/src/events/store.ts:39-66; memory-dossier/owner-r8/comments-2026-11-07.md:28; memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; spec/memory/OWNER-DECISIONS-2026-11-14.md:3,21]`.
- `packages/track/src/ingest/ingest.ts:242-280` (`authorize()`): Re-anchored in the `Track` application's control engine (`verdictAuthority: 'track'`) to require a formal `h2a` mandate (`D4=mandate`), validate conformance against the cited `Track` template version and digest, and operate on `engram`-ingested signals via `cluster-mesh` (`R12`) `[FACT: h2a repository: packages/track/src/ingest/ingest.ts:275-277; spec/memory/OWNER-DECISIONS-2026-11-14.md:13,25]`.

### 2.2 Proposed Interfaces (`proposed` — to be built under R15 Spec Plan)

```ts
// status: proposed — Neutral reference to a Track domain template version and digest (Spec 0, T-M-C)
// Track domain types are referenced by template version and digest, never as a closed list in engram interfaces.
export interface TrackTemplateRef {
  lineage: 'track';
  templateId: string;
  templateVersion: string;
  templateDigestSha256: string;
}

// status: proposed — Track Domain Template Lineage Registration Port on Engram Metamodel (Spec 0, T-M-C)
export interface TrackOntologyTemplateRegistryPort {
  registerTrackTemplateVersion(input: {
    writerMandateId: string;       // Track is sole writer of the 'track' lineage
    metamodelVersion: string;
    templateId: string;
    templateVersion: string;
    templateDefinition: Record<string, unknown>; // Domain types, attributes, states, D1 bounded list, .track/ file shapes
    templateDigestSha256: string;
  }): Promise<
    | { status: 'accepted'; templateRef: TrackTemplateRef }
    | { status: 'refused-metamodel-invalid'; diagnostics: string[] } // Never authored, repaired, or modified by engram
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
    templateRefs: TrackTemplateRef[]; // Subscribed Track template versions + digests (open domain types)
    includeTemplateTypeIds?: string[]; // Open template-defined type identifiers; never a closed list in engram
    includeBaseSignals?: Array<'raw_session_event' | 'gh_input_event'>; // Base engram / D30 ingress signals
  }): AsyncIterable<{
    txId: string;
    nodeId: string;
    signalClass: 'track_domain_object' | 'raw_session_event' | 'gh_input_event';
    templateRef: TrackTemplateRef | null; // Required when signalClass === 'track_domain_object'
    templateTypeId: string | null;        // Type declared in templateRef; never hardcoded in engram
    reviewStatus:
      | 'proposed'                        // Point 5B: stays proposed until Track control verdict
      | 'recorded-bounded-type'
      | 'promotion-draft-awaiting-third-party'
      | 'approved'
      | 'rejected';                       // D1=borne-review
    payload: Record<string, unknown>;
    recordedAtIso: string;
  }>;

  /**
   * Records Track enrichments and realization state conforming to a Track template
   * version and digest back into the canonical engram graph via cluster-mesh (R12).
   */
  recordTrackAnalysisAnnotation(input: {
    tenantId: string;
    workspaceId: string;
    mandateId: string;             // D3/D4 formal h2a mandate required
    targetNodeIds: string[];
    templateRef: TrackTemplateRef; // Cited Track template version + digest
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
      verdictAuthority: 'track';   // Track application is sole control authority for project-domain gates (Point 5B)
      origin: 'engram-front' | 'track-analyst'; // D32: control hooks may originate from both engram and Track
      engineKind: 'rules-decision-engine' | 'fast-llm' | 'control-agent';
      turnNodeId: string;
      templateRef: TrackTemplateRef; // Template version + digest governing the typed write
      templateTypeId: string;
      activeMandateId: string;
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
      activeMandateId: string;
      activeRulesRef: string;
    };

export interface MemoryAndTrackControlPort {
  evaluateControlGate(input: ControlGateEvaluationInput): Promise<{
    verdictAuthority: 'track' | 'engram';
    verdict: 'allow' | 'flag-for-borne-review' | 'block';
    proposalDisposition: 'accepted' | 'stays-proposed' | 'refused'; // Without a Track verdict, typed project writes stay 'proposed'
    appliedRuleIds: string[];
    controlLatencyMs: number;
    rationale: string;
  }>;
}

// status: proposed — Per-PR Serialization Producer in Engram (D28=engram, D29=both, D34=engram)
export interface EngramPrSerializationProducerPort {
  serializeProjectPrSlice(input: {
    tenantId: string;
    workspaceId: string;
    derivedWorktreeId: string;       // D21
    prBranchName: string;
    baseCommitSha: string;
    headCommitSha: string;
    mandateId: string;             // D4
    templateRef: TrackTemplateRef; // Repo-declared Track template version + digest applied by engram (Point 1B)
  }): Promise<{
    producer: 'engram';            // D34=engram: engram produces the per-PR projection
    acceptor: 'track-control';     // Point 1B: Track control validates, replays, and alone accepts or refuses
    registryAuthority: 'engram';   // D28=engram kept: engram's live registry stays the reference
    templateRef: TrackTemplateRef; // Cited Track template version + digest governing file shapes and states
    contentMode: 'both';           // D29=both (event journal + state snapshot, linked by fingerprint)
    eventJournalPath: string;      // File path/shape declared by templateRef (e.g. .track/pr/<pr-or-branch>/events.jsonl)
    stateSnapshotPath: string;     // File path/shape declared by templateRef (e.g. .track/pr/<pr-or-branch>/snapshot.json)
    linkFingerprint: string;       // D29 fingerprint linking event journal, state snapshot, and templateRef digest
    contentDigestSha256: string;
  }>;
}

// status: proposed — Pre-merge Template Validation and Replay by Track Control as Acceptor (D34=engram, Point 1B)
export interface TrackSerializationReplayPort {
  replayBeforeMerge(input: {
    prBranchName: string;
    templateRef: TrackTemplateRef; // Declared Track template version + digest in the repository
    eventJournalPath: string;
    stateSnapshotPath: string;
    linkFingerprint: string;
  }): Promise<{
    verdictAuthority: 'track';
    acceptor: 'track-control';
    templateConformant: boolean;
    verdict: 'match' | 'mismatch'; // Non-conforming projection or replay mismatch is refused, never repaired by engram
    acceptance: 'accepted' | 'refused';
    mismatches: string[];
  }>;
}
```

---

## 3. Architectural Invariants

1. **Engram Before Track (`D24`, `D32`, Owner Global Principle):** `Track` is never the first ingestion hop for session events, speech turns, or decisions (`« Engram doit etee en premier front pour recup les donnes de session avant track, avec des analystes - Track nest qu un modal d analyst et controle »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:19]`). Every raw session event enters `engram` first (`[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:28]`), requiring no domain template; typed `Track`-domain writes are evaluated against `Track`'s templates and accepted by `Track` control `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:21,25]`.
2. **Project-Only Scope in Track (`D3`, `D24`, `D31`):** `Track` defines templates for, analyzes, and controls **project decisions and project events only** (`« Attention track c juste pour les decision et gestion d evenement projet. »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:9]`). Harness decisions and workspace/repository harness overlays (`D31`) are excluded from `Track` and handled by `h2a`, and a `.h2a/` overlay never modifies a `Track` template `[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:19; spec/memory/OWNER-DECISIONS-2026-11-14.md:24]`.
3. **Bounded Review Gate under `Track` Control (`D1=borne-review`, `D3=mandated`, `D4=mandate`, Point 3C, Point 5B):** Writes whose type is on the `D1` bounded list (declared in `Track`'s templates) pass the `Track` application's control (`verdictAuthority: 'track'`) and are recorded without human review. Every promotion draft (including any dreamed proposal in the `Track` domain) passes `Track` control and waits for an authorized third party, never applied by its author (`D1`); any dreamed proposal touching a `Track` template is a request to `Track`, which alone accepts it `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:4; spec/memory/OWNER-DECISIONS-2026-11-14.md:13,23,25]`.
4. **Live-Registry Reference Kept (`D28=engram`) and Template-Driven Per-PR Projection (`D29=both`, `D34=engram`, Point 1B):** **`D28` is kept:** `engram`'s live registry remains the canonical reference for recorded facts (when the live registry and a PR file copy contradict each other, `engram`'s live registry wins and the copy is regenerated at the next PR), and `.track/events.jsonl` is **not** an authoritative domain journal written by `Track` control. For template definitions, `Track`'s published template version (cited with its SHA-256 digest) is the reference. `engram` produces the per-PR `.track/` projection (event journal + state snapshot, linked by fingerprint, `D29=both`) conforming to the `Track` template version declared in the repo, and `Track` control is the sole acceptor `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; spec/memory/OWNER-DECISIONS-2026-11-14.md:3,11,21]`.
5. **Control Origin and Verdict Authority (`D32`, Point 5B):** Control hooks still originate from both `engram` and `Track` (`« Donc part de engram - et de track »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:16]`) and MUST support a rules/decision engine (owner verbatim: `« api type jev/decison »`), fast low-latency LLMs, and control agents (`[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:15]`). For the `Track` domain, the `Track` application writes and executes its rules and its verdict (`verdictAuthority: 'track'`) is authoritative; `engram` records it and never replaces it (without a verdict, a typed project write stays `proposed`, while the raw record is already in `engram`). `engram` checks template well-formedness against its metamodel and holds the `D7` confidentiality deny-list `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:12-13,25]`.
6. **Separation from GitHub / Board HMI Layer (`D30`):** `Track` is an analytical and control module, not a board UI or a direct GitHub mirror. GitHub issues, PRs, and project boards sit in a separate HMI/input layer that reads `engram` views and feeds external user/GitHub inputs into `engram` (`« Attention tu confonds l outil track la memoire e tun outil ihm pour interagir avec - gh pourra donner de l input c une autre layer »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:13]`).
7. **Pre-Merge Template Validation and Replay (`D34`, Point 1B):** The `Track` application's control validates conformance to the declared `Track` template version/digest and replays the `engram`-produced per-PR projection before merge. A non-conforming projection or replay mismatch is refused by `Track` control (blocking merge) and is never repaired by `engram` (`D34`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/kit/src/memory-content-r11.json:4208-4211; spec/memory/OWNER-DECISIONS-2026-11-14.md:13,21]`.
8. **Cluster-Mesh Mediation (`R12`):** Track (h2a repository) reads and writes engram only through cluster-mesh memory access (R12, owner-r9 r12-correction:5, kit:287). No Track interface reaches engram directly `[FACT: memory-dossier/owner-r9/r12-correction-2026-11-07.md:5; memory-dossier/kit/src/memory-content-r11.json:287]`.
9. **T-M-C Ontology Ownership & Zero Closed Type Lists (`OWNER-DECISIONS-2026-11-14.md`):** Per the owner rule (`« il fdoit en rester maitre au moins piur les templates et engram pour leur metamodel et application track pour leur controle. »`), `Track` is master and sole author of its domain ontology templates (evolving them with no `engram` release unless a new metamodel construct is needed), `engram` is master of the shared metamodel and lineage registry (accepting or refusing templates on well-formedness only, never writing one), and the `Track` application is master of their control. `Track` domain types are always referenced by `(templateVersion, templateDigestSha256)`, never as a closed list in `engram` interfaces `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:6,11-13,21-22,24-26]`.

---

## 4. Out of Scope

- Master harness templates, developer/workspace/repository `.h2a/` harness overlays (`D31`), and `h2a` role, activity, and harness-skill templates (`D16`) (governed by `spec/memory/contracts/engram-h2a.md`; `Track` domain ontology templates and their control are governed here under the shared metamodel of `Spec 0`) `[FACT: spec/memory/OWNER-DECISIONS-2026-11-14.md:24]`.
- Database-cluster replication mechanics and MCP registry routing (governed by `spec/memory/contracts/engram-cluster-mesh.md`) `[JUDGMENT]`.
- Frontend board UI implementation in Sentropic or GitHub Apps (external HMI layer per `D30`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:13]`.
