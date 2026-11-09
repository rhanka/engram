# Contract: `engram` ↔ `Track` (Project Decision & Event Analyst, Control, and Per-PR Serialization)

- **Status:** `proposed, pending owner review`
- **Repository of Record:** `engram` (`spec/memory/contracts/engram-track.md`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:20]`
- **Parties:**
  - **`engram`** (`@sentropic/engram`, `@sentropic/engram-memory`): Primary session ingestion front (`D24`, `D32`), canonical record authority (`D28=engram`), and sole Git/PR serialization producer (`D34=engram`, `D29=both`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/owner-r15/comments-2026-11-08.md:9,19]`.
  - **`Track`** (`h2a repository: packages/track`): Downstream analyst and control module reading `engram` (via `cluster-mesh`, `R12`) for project decisions, project event management, live project realization tracking, and pre-merge PR serialization replay (`D1`, `D3`, `D24`, `D30`, `D32`, `D34`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:9,13,15-16,19; memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/owner-r10/suivi-direct-2026-11-07.md:5]`.

---

## 1. What Each Party Provides and Consumes

### 1.1 `engram` Provides to `Track`
1. **Live Project Event & Decision Stream (`D24`, `D28`, Live Tracking):** Real-time subscription feed and graph query surface over project-scoped events, tool milestones, branch/worktree state (`D21`), and candidate/settled project decisions already ingested into `engram` (`« Attention track c juste pour les decision et gestion d evenement projet. Engram doit etre la premiere etape in fine. »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:9]`; `« trakc avec engram devra vraiment assurer un suivi live »` `[FACT: memory-dossier/owner-r10/suivi-direct-2026-11-07.md:5]`).
2. **Domain-Filtered Decision Model (`D3`, `D27`, `D31`):** `engram` models all decisions (`project` and `harness`), filters out harness-only decisions (which serialize to workspace/repo harness overlays per `D31`), and delivers project decisions and decision-dossier contextualized facts (`D27`) to `Track` (`« quoi qu'il arrive engram doit modéliser toute décision: décision de projet, décision de harnais, mais avec des destination de sérialisation différentes. le track ne doit pas spécialement enregistrer les décision de harnais. »` `[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:19]`).
3. **Per-PR Serialization Producer (`D28=engram`, `D29=both`, `D34=engram`):** `engram` exports the deterministic per-PR `.track/` tracking serialization carrying **both** the event journal and a state snapshot, with statuses and remaining work at the time of the PR, linked by fingerprint (`D29=both`), and the Track control replays it before merge (`D34=engram`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/owner-r15/comments-2026-11-08.md:14]`.
4. **Normalized External HMI / GitHub Signals (`D30`):** External inputs originating from GitHub issues, PR reviews, or project boards (`D30`) ingested into `engram` first and exposed to `Track` as graph events. The interface layer (GitHub, boards) reads engram views, which include Track's recorded annotations. Track does not feed the board `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:13]`.

### 1.2 `Track` Provides to `engram`
1. **Project Analysis & Realization State Enrichments (`D1`, `D24`):** Structured project-event correlations, lot/branch realization state transitions, decision dossier outcomes (`packages/track/src/model/decision.ts:48-94`), and bounded-list / third-party promotion review dispositions (`D1=borne-review`) written back into `engram` as analyst graph annotations `[FACT: h2a repository: packages/track/src/model/decision.ts:48-94; memory-dossier/owner-r15/answers-2026-11-08.compact.md:4]`.
2. **Project Control Signals (`D32`, `D34`):** Joint control evaluations (`« Donc part de engram - et de track »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:16]`) executed via a rules/decision engine (owner verbatim: `« api type jev/decison »`), fast low-latency LLMs, or control agents to validate scope compliance, bounded-type writes (`D1`), and pre-merge PR serialization replay (`D34`) (`« L usage d agent en controle pour track iu engrame devrai etre possible mais potentiellement reposer plutot sur des api type jev/decison ou llm tres rapides. »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:15; memory-dossier/owner-r15/answers-2026-11-08.compact.md:5]`).

---

## 2. Interfaces

### 2.1 Existing Interfaces (in `h2a repository: packages/track` to be Re-anchored on `engram`)
- `packages/track/src/model/decision.ts:11-94` (`DecisionKind`, `Outcome`, `Dossier`, `DossierArtifact`): Re-anchored as `Track` analyst domain views over `engram` decision nodes `[FACT: h2a repository: packages/track/src/model/decision.ts:11-94]`.
- `packages/track/src/events/store.ts:39-66` (`EventStore` over `.track/events.jsonl`): Demoted from primary unmediated writer to a materialized per-PR serialization target exported by `engram` and replayed by the `Track` control before merge (`D28=engram`, `D29=both`, `D34=engram`) `[FACT: h2a repository: packages/track/src/events/store.ts:39-66; memory-dossier/owner-r8/comments-2026-11-07.md:28; memory-dossier/owner-r15/answers-2026-11-08.compact.md:5]`.
- `packages/track/src/ingest/ingest.ts:242-280` (`authorize()`): Amended to require a formal `h2a` mandate (`D4=mandate`) and to operate on `engram`-ingested events via `cluster-mesh` (`R12`) `[FACT: h2a repository: packages/track/src/ingest/ingest.ts:275-277]`.

### 2.2 Proposed Interfaces (`proposed` — to be built under R15 Spec Plan)

```ts
// status: proposed — Engram -> Track Live Analyst Subscription & Query Port via cluster-mesh (R12, D24, D28)
export interface EngramTrackAnalystPort {
  /**
   * Subscribes Track as a live downstream analyst to project-relevant events
   * and project decisions already recorded in engram (routed through cluster-mesh per R12).
   */
  subscribeProjectStream(input: {
    tenantId: string;
    workspaceId: string;
    worktreeScionId: string | null; // D21
    fromTxId: string | null;
    includeKinds: Array<'project_decision' | 'project_event' | 'decision_dossier' | 'gh_input_event'>;
  }): AsyncIterable<{
    txId: string;
    nodeId: string;
    kind: 'project_decision' | 'project_event' | 'decision_dossier' | 'gh_input_event';
    reviewStatus: 'recorded-bounded-type' | 'promotion-draft-awaiting-third-party' | 'approved' | 'rejected'; // D1=borne-review
    payload: Record<string, unknown>;
    recordedAtIso: string;
  }>;

  /**
   * Records Track analyst enrichments (lot progress, dossier disposition,
   * realization state) back into the canonical engram graph via cluster-mesh (R12).
   */
  recordTrackAnalysisAnnotation(input: {
    tenantId: string;
    workspaceId: string;
    mandateId: string;             // D3/D4 formal h2a mandate required
    targetNodeIds: string[];
    analysisKind: 'lot-state' | 'decision-outcome' | 'borne-review-disposition' | 'milestone-correlation';
    summary: string;
    structuredState: Record<string, unknown>;
  }): Promise<{ annotationNodeId: string; txId: string }>;
}

// status: proposed — Joint Engram + Track Control Evaluation Port (D32)
export interface MemoryAndTrackControlPort {
  evaluateControlGate(input: {
    tenantId: string;
    workspaceId: string;
    origin: 'engram-front' | 'track-analyst'; // D32: control originates from both engram and Track
    engineKind: 'rules-decision-engine' | 'fast-llm' | 'control-agent';
    turnNodeId: string;
    activeMandateId: string;
    activeRulesRef: string;
  }): Promise<{
    verdict: 'allow' | 'flag-for-borne-review' | 'block';
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
    worktreeScionId: string;       // D21
    prBranchName: string;
    baseCommitSha: string;
    headCommitSha: string;
    mandateId: string;             // D4
  }): Promise<{
    producer: 'engram';            // D34=engram
    authority: 'engram';           // D28=engram
    contentMode: 'both';           // D29=both (event journal + state snapshot, linked by fingerprint)
    eventJournalPath: string;      // e.g. .track/pr/<pr-or-branch>/events.jsonl
    stateSnapshotPath: string;     // e.g. .track/pr/<pr-or-branch>/snapshot.json
    linkFingerprint: string;       // D29 fingerprint linking event journal and state snapshot
    contentDigestSha256: string;
  }>;
}

// status: proposed — Pre-merge Serialization Replay by Track Control (D34=engram)
export interface TrackSerializationReplayPort {
  replayBeforeMerge(input: {
    prBranchName: string;
    eventJournalPath: string;
    stateSnapshotPath: string;
    linkFingerprint: string;
  }): Promise<{
    verdict: 'match' | 'mismatch';
    mismatches: string[];
  }>;
}
```

---

## 3. Architectural Invariants

1. **Engram Before Track (`D24`, `D32`, Owner Global Principle):** `Track` is never the first ingestion hop for session events, speech turns, or decisions (`« Engram doit etee en premier front pour recup les donnes de session avant track, avec des analystes - Track nest qu un modal d analyst et controle »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:19]`). Every raw session event enters `engram` first (`[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:28]`).
2. **Project-Only Scope in Track (`D3`, `D24`, `D31`):** `Track` analyzes and controls **project decisions and project events only** (`« Attention track c juste pour les decision et gestion d evenement projet. »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:9]`). Harness decisions and workspace/repository harness overlays (`D31`) are excluded from `Track` and handled by the `h2a` harness analyst `[FACT: memory-dossier/owner-r8/comments-2026-11-07.md:19]`.
3. **Bounded Review Gate (`D1=borne-review`, `D3=mandated`, `D4=mandate`):** Writes whose type is on the bounded list pass the Track control and are recorded without human review. Each promotion draft waits for an authorized third party and is never applied by its author (D1) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:4]`.
4. **Engram as Canonical Authority and Per-PR Serializer (`D28=engram`, `D29=both`, `D34=engram`):** `engram` is both the canonical record authority (`D28`) and the producer (`D34`) that exports the per-PR `.track/` serialization carrying **both** the event journal and a state snapshot, with statuses and remaining work at the time of the PR, linked by fingerprint (`D29=both`) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5]`.
5. **Control Flexibility (`D32`):** Control loops shared between `engram` and `Track` (`« Donc part de engram - et de track »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:16]`) MUST support a rules/decision engine (owner verbatim: `« api type jev/decison »`), fast low-latency LLMs, and control agents as execution engines (`[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:15]`).
6. **Separation from GitHub / Board HMI Layer (`D30`):** `Track` is an analytical and control module, not a board UI or a direct GitHub mirror. GitHub issues, PRs, and project boards sit in a separate HMI/input layer that reads `engram` views and feeds external user/GitHub inputs into `engram` (`« Attention tu confonds l outil track la memoire e tun outil ihm pour interagir avec - gh pourra donner de l input c une autre layer »` `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:13]`).
7. **Pre-Merge Serialization Replay (`D34`):** The Track control replays the engram serialization before merge. A mismatch blocks the merge (D34) `[FACT: memory-dossier/owner-r15/answers-2026-11-08.compact.md:5; memory-dossier/kit/src/memory-content-r11.json:4208-4211]`.
8. **Cluster-Mesh Mediation (`R12`):** Track (h2a repository) reads and writes engram only through cluster-mesh memory access (R12, owner-r9 r12-correction:5, kit:287). No Track interface reaches engram directly `[FACT: memory-dossier/owner-r9/r12-correction-2026-11-07.md:5; memory-dossier/kit/src/memory-content-r11.json:287]`.

---

## 4. Out of Scope

- Master harness rules, developer/workspace/repository harness overlays (`D31`), and `h2a` role/activity ontology definitions (`D16`) (governed by `spec/memory/contracts/engram-h2a.md`) `[JUDGMENT]`.
- Database-cluster replication mechanics and MCP registry routing (governed by `spec/memory/contracts/engram-cluster-mesh.md`) `[JUDGMENT]`.
- Frontend board UI implementation in Sentropic or GitHub Apps (external HMI layer per `D30`) `[FACT: memory-dossier/owner-r15/comments-2026-11-08.md:13]`.
