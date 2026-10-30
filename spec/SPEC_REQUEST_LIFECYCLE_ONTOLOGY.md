# SPEC — Request-Lifecycle Ontology, Drift Report & Spec-Pin Validator (Engram)

- **Document ID**: `SPEC-request-lifecycle-ontology` (scratch review path: `.graphify/scratch/design/request-lifecycle/SPEC-request-lifecycle-ontology.md`; target committed path under Decision `E1`: `spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md` — `proposed, not yet in code`)
- **Author**: Engram Spec Author (Round 2)
- **Reviewer**: Muse Wonder / Astra (`g-arch`)
- **Date**: `2026-10-30`
- **Repository Scope**: **Engram (`rhanka/engram`, local workspace `/home/antoinefa/src/graphify`) only**. Counterpart responsibilities in `Track/H2A` (`rhanka/h2a`), `CI`, and `sentropic` (`rhanka/sentropic`) are specified strictly as external interfaces in §7 and are **not** engram implementation work.
- **Normative Upstream Contracts & Decisions**:
  - Owner Decisions of `2026-10-30` (`.graphify/scratch/design/request-lifecycle/OWNER-DECISIONS-2026-10-30.md:1-30`): `A1`, `B1`, `C commune`, `D1`, `E1`.
  - Brief (`.graphify/scratch/design/request-lifecycle/BRIEF-request-lifecycle-spec.md:1-34`).
  - Concertation on Question C (`.graphify/scratch/design/request-lifecycle/question-c-concertation-opus-r2.md:1-162`, `.graphify/scratch/design/request-lifecycle/question-c-concertation-argon-r3.md:1-16`).
  - Continuity Dossiers (`.graphify/scratch/design/request-lifecycle/DOSSIER-decision-demandes.html:1-680`, sha256 `024effba4d028eae2d2b78e98c710349e3a250d52f33527dc858df33a614c68c`; `.graphify/scratch/design/request-lifecycle/DOSSIER-continuite-demandes.md:1-151`, sha256 `171c7e1d9220f87e9e809d99f8721e8b9e07334fb21108ff096b39e354be79b8`; `.graphify/scratch/design/request-lifecycle/continuity-final-wonder.md:1-164`, sha256 `076aefb827d1486104f2530d326d7c210329517a204a72e77f7dbae7782c400c`; `.graphify/scratch/design/request-lifecycle/continuity-final-argon.md:1-293`, sha256 `2bd7abd461d40cf1a47f51222d23a4466e96e5a62ef1f1ee786ff510b3238622`).
  - Existing Track Item References (`.graphify/scratch/design/request-lifecycle/REFERENCES-existing-request.md:1-16`, sha256 `a6e681867435f34224fd80588d1762e6910527ae88106a97fb4835587aad8198`).
  - Extracted `@sentropic/track@0.98.7` Snapshot from `rhanka/h2a` `origin/main` (`9ea4db7c5`) (`.graphify/scratch/design/request-lifecycle/sources/track-origin-main/packages/track/package.json:1-74`, `src/{model,events,state,report}/**`, `docs/spec/SPEC.md:1-265`, `INTENTION.md:1-213`, `skills/branch-lifecycle/SKILL.md:1-119`).
  - Ontology Guardian Contract G0 (`.graphify/scratch/design/ontology-guardian/SPEC-G0-guardian-contracts.md:1-1491`, reviewed sha256 `31f81e0477a4125c18ad84dede813c71cd221ded48c312d6df105663c354974a`; `.graphify/scratch/design/ontology-guardian/DOSSIER-ontology-guardian.md:1-730`, sha256 `d61f576f3f0c2879bd094ce42db945a8093aa191c2c94ad31ddd9ecc1ae6f8f2`).
  - Memory Finalization Contract (`spec/SPEC_MEMORY_FINALIZATION.md` on `origin/main@86dd6c53`, sha256 `df96e908be203ddfa96452242c4434da45127149de3f944eb1e1650ba1718db5` per `DOSSIER-decision-demandes.html:661`; `unverified` directly from the local working tree checkout, which predates `86dd6c53`).
- **Factual Status Vocabulary**: Throughout this specification, coverage and verification states use only the four canonical factual status terms: `unknown`, `unverified`, `partial`, `not covered` (`BRIEF-request-lifecycle-spec.md:10,34`), alongside verbatim machine enum tokens when quoting Track or Engram code.

---

## 0. Context, Owner Decisions & Provenance Boundary

### 0.1 Binding Owner Decisions (`2026-10-30`)

Per `.graphify/scratch/design/request-lifecycle/OWNER-DECISIONS-2026-10-30.md:7-30` and `.graphify/scratch/design/request-lifecycle/question-c-concertation-opus-r2.md:57-74`:

1. **`A1` (GitHub Board Role)**: GitHub cards are a read-only board reflecting committed request state; Track is the only writer (`OWNER-DECISIONS-2026-10-30.md:9`).
2. **`B1` (Lifecycle Model & Report Stages)**: Track's separate axes are kept; `review` and `publication` (`published`) are added to the report stages (`OWNER-DECISIONS-2026-10-30.md:10`). Readers ship first, then writers, with versions coordinated; no persisted value is withdrawn (`OWNER-DECISIONS-2026-10-30.md:10`).
3. **`C commune` (Joint Position on Question C — `question-c-concertation-opus-r2.md:57-74`, confirmed in `question-c-concertation-argon-r3.md:1-16` and adopted in `OWNER-DECISIONS-2026-10-30.md:11,20-30`)**:
   - **Verified (`question-c-concertation-opus-r2.md:59`)**:
     1. Memory ↔ spec drift (`Écarts mémoire ↔ spec`).
     2. A `feature` leaf (`kind: 'feature'` without `role`) that has moved to `specified` or `in-progress` carries a resolved `spec` pin (`repository`, `path`, `sha256`, committed blob, outside `.graphify/scratch/**`) or a reasoned `spec-exempt` (`un spec-exempt motivé`).
     3. `track events-contains` on every PR carrying `.track` (`track events-contains sur toute PR portant .track`).
     4. Everything else: list-only (`Le reste : liste seule`).
   - **Where (`question-c-concertation-opus-r2.md:60`)**: Read-only engram report, at each status report, PR, and branch close (`Rapport engram en lecture seule, à chaque rapport de statut, PR et fermeture de branche`). Merge check in `branch-lifecycle`, then a required CI job (`Contrôle à la fusion dans branch-lifecycle, puis job CI requis`). Nothing in Track's core (`Rien dans le cœur Track`).
   - **Immediate Effect (`question-c-concertation-opus-r2.md:61,69-70`)**: At the first report after the transition (`Au premier rapport après la transition` — Track has no hook on transition and its core stays Git-free), the conductor opens a `manual` `dependency` blocker (`kind: 'dependency'`, `resolutionRule: 'manual'`): report status `blocked`, report bucket `AWAITED`, zero refused transition (`setSpec` and `setRealization` do not consult blockers).
   - **Deadline (`question-c-concertation-opus-r2.md:62,71-73`)**: Neither a date nor a counter: the attempt to merge the PR linked to the item (`Ni date ni compteur : la tentative de fusion de la PR reliée à l'item`). The "next report" is this merge check, which reads the **pin** and not the blocker (because a `linked-done` blocker closes as soon as the support item reaches `done` without any spec being committed, and a `manual` blocker can be resolved manually). **Only this merge is blocked** (`Seule cette fusion est bloquée`). A notification necessarily precedes any refusal because merge cannot be attempted before the check has run; an item that is never merged has no deadline and therefore no refusal.
   - **Never Blocked (`question-c-concertation-opus-r2.md:63`)**: A commit, a Track axis transition, or a memory recall (`Un commit, une transition d'axe Track, un rappel mémoire`). The "uncommitted journal" condition is removed from transitions; the report lists uncommitted events in list-only mode (`La condition « journal non committé » quitte les transitions ; le rapport liste les événements hors commit`).
   - **From When (`question-c-concertation-opus-r2.md:64`)**: At `T`, joint publication of the pin convention and the pinning command (`À T, publication conjointe de la convention et de la commande d'épinglage`). Applies to any first trigger (`spec.transition` to `specified` or `realization.transition` to `in-progress`) at or after `T`, including the `to-do` stock (`191` `feature` leaves across `h2a` `141`, `sentropic` `38`, `engram` `12`, including the `57` open `D-NNN` rows; `question-c-concertation-opus-r2.md:29,64`). `01M515G0RZX0Y9QB40AW2EF2X6` (request register, 14–15/10) and `01M57NGBMBM58YEFSS6MS5Y54Y` (dev ontology item, 18/10) are re-anchored by name at `T` (`question-c-concertation-opus-r2.md:27-28,64`; `OWNER-DECISIONS-2026-10-30.md:26`). Existing `in-progress` stock (`41` `feature` leaves across `h2a` `21`, `sentropic` `13`, `engram` `7`): list-only (`Stock in-progress : liste seule`, `question-c-concertation-opus-r2.md:30,64`).
   - **To Build & Interim State (`question-c-concertation-opus-r2.md:65`; `OWNER-DECISIONS-2026-10-30.md:27-30`)**:
     - `engram`: the drift report (`rapport`) and the spec-pin validator (`validateur`);
     - `Track/H2A`: an additive link-addition event (`événement additif d'ajout de lien`), the PR ↔ item link (`lien PR ↔ item`), the journal present on the PR (`journal présent sur la PR`), `.gitattributes` `merge=union` + `track reseal` (`union + reseal`);
     - `CI`: the required job (`job requis`), Track installed in CI (`Track installé`), and branch protection (`protection de branche`), piloted on `engram` first (`pilote engram`).
     - **Until `T` (`D'ici là`)**: `not covered` in code; procedural control by the conductor (`D'ici là : not covered, contrôle procédural par le conducteur`, `question-c-concertation-opus-r2.md:65`).
4. **`D1` (Ontology Evolution Rule)**: « Versions + correspondances » confirmed as the evolution rule of the request ontology (`OWNER-DECISIONS-2026-10-30.md:12`).
5. **`E1` (Committed Spec Location)**: Committed ontology specs live in engram `spec/`, beside the memory specs (`OWNER-DECISIONS-2026-10-30.md:13`).
6. **Out of Scope (`F1-c`, `F2-a`, `F3-a`, `G1`, `H1`)**: Concern `SPEC-diagram-view-schema-v2.md` and are `not covered` in this specification (`BRIEF-request-lifecycle-spec.md:6`).

### 0.2 Track `origin/main` Snapshot & Engram Verification Boundary

1. **Track `origin/main` Snapshot (`rhanka/h2a` `origin/main@9ea4db7c5`, `@sentropic/track@0.98.7`)**:
   - All Track model, event, fold, and report facts in this specification are sourced exclusively from the extracted `h2a` `origin/main` (`9ea4db7c5`) snapshot at `.graphify/scratch/design/request-lifecycle/sources/track-origin-main/packages/track/`:
     - `package.json:2-3` (`"@sentropic/track"`, `"version": "0.98.7"`)
     - `src/model/item.ts:1-363`
     - `src/model/report-status.ts:1-116`
     - `src/model/acceptance.ts:1-77`
     - `src/model/decision.ts:1-304`
     - `src/model/demand.ts:1-195`
     - `src/model/blocker.ts:1-58`
     - `src/model/priority.ts:1-36`
     - `src/model/spec-amend.ts:1-104`
     - `src/model/verification.ts:1-98`
     - `src/events/types.ts:1-199`
     - `src/state/fold.ts:1-576`
     - `src/report/buckets.ts:1-37`
     - `src/report/blocker-status.ts:1-61`
     - `src/report/stage-status.ts:1-259`
     - `src/report/stage-status-lexicon.ts:1-124`
     - `src/report/rollup.ts:1-411`
     - `src/report/build.ts:1-484`
     - `src/report/friendly.ts:1-286`
     - `src/report/directive.ts:1-538`
     - `src/report/format.ts:1-2152`
     - `src/report/status-by-level.ts:1-163`
     - `src/report/audit.ts:1-308`
     - `docs/spec/SPEC.md:1-265`
     - `INTENTION.md:1-213`
     - `skills/branch-lifecycle/SKILL.md:1-119`
   - In the remainder of this document, paths cited as `sources/track-origin-main/packages/track/...` refer to `.graphify/scratch/design/request-lifecycle/sources/track-origin-main/packages/track/...` (provenance: `rhanka/h2a` `origin/main@9ea4db7c5`).
   - Persisted journal entries for the two existing owner items (`01M515G0RZX0Y9QB40AW2EF2X6` and `01M57NGBMBM58YEFSS6MS5Y54Y`) are verified from `/home/antoinefa/src/h2a/.track/events.jsonl:1518,1549-1550,2339` (sha256 `5f1b6bdf08b5298764eb54c23053e86c47f4148b1bf3fa69cfd0da00e003d353`) and `/home/antoinefa/src/graphify/.track/events.jsonl:453,456` (sha256 `7c7c08f0db98326e5bf5d79db922b1e8bb9a5d537939d424d4d64e569c6e6545`), matching `REFERENCES-existing-request.md:1-16`. As documented in `question-c-concertation-opus-r2.md:79,117` (R8), those two items currently exist only in the working-copy journals (`0` commits on local/remote refs).
2. **Engram Checkout (`/home/antoinefa/src/graphify/`)**:
   - Pre-extracted snapshots of `profiles/repo-knowledge/1/profile.json` (`.graphify/scratch/design/request-lifecycle/sources/engram__profiles_repo-knowledge_1_profile.json:1-39`, sha256 `ce83e7c0605d675453cd8e03ae81bafd92af75a8a0dc9cce6b820ae305658e04`) and `profiles/repo-knowledge/1/engram-mapping.json` (`.graphify/scratch/design/request-lifecycle/sources/engram__profiles_repo-knowledge_1_engram-mapping.json:1-35`, sha256 `8ad522b49a085e0c585dc5b8ad24b5926d1ed6729e1d820e5179ef706aca2de8`) are directly read and verified.
   - `SPEC-G0-guardian-contracts.md:1-1491` and `DOSSIER-ontology-guardian.md:1-730` are directly read and verified.
   - Direct working-tree reads of `src/ontology-guardian/types.ts`, `src/ontology-guardian/catalog.ts`, `engram-memory/contracts/index.ts`, and `spec/SPEC_MEMORY_FINALIZATION.md` (committed on `engram` `origin/main@86dd6c53`, digests recorded in `DOSSIER-decision-demandes.html:657-661`) are `unverified` in the local working tree checkout and are cited via their verified contracts in `SPEC-G0-guardian-contracts.md` and `DOSSIER-decision-demandes.html:657-661`.

---

## 1. Dev Ontology Profile (`request-lifecycle@1`) & Track Alignment (`B1`, `D1`)

### 1.1 Profile Identity & Governance under G0

Per G0 (`SPEC-G0-guardian-contracts.md:54-65,127-166`) and Track item `01M57NGBMBM58YEFSS6MS5Y54Y` (`/home/antoinefa/src/graphify/.track/events.jsonl:456`: *"Dev ontology (PR, branches, merge/deploy lifecycle, statuses, demand/WP categories, velocity reference) held by engram and consumed by h2a; Track must externalize its ontology to engram as well; no French identifiers (owner refused 'mergé'/'déployé')"*), Engram defines and guards the dev & request-lifecycle ontology profile:

- **Ontology ID**: `request-lifecycle` (`proposed, not yet in code`; matches G0 regex `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` at `SPEC-G0-guardian-contracts.md:55`).
- **Major Version**: `1` (`positive integer >= 1`, `SPEC-G0-guardian-contracts.md:58`).
- **Coordinate (`OntologyPinId`)**: `request-lifecycle@1` (`proposed, not yet in code`, `SPEC-G0-guardian-contracts.md:62`).
- **Domain**: `'track'` (per G0 `OntologyDomain = 'code' | 'diagram' | 'memory' | 'track' | 'time'`, `SPEC-G0-guardian-contracts.md:45`).
- **Visibility**: `'public'` (`SPEC-G0-guardian-contracts.md:47`).
- **Committed Artifact Directory**: `profiles/request-lifecycle/1/` (`proposed, not yet in code`):
  - `profiles/request-lifecycle/1/profile.json`
  - `profiles/request-lifecycle/1/correspondences.json`
- **Committed Normative Spec Path (`E1`)**: `spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md` (`proposed, not yet in code`; per `OWNER-DECISIONS-2026-10-30.md:13`).
- **Canonical Digest (`digest`)**: `unverified` (computed at publication via `computeOntologyCanonicalDigest` over `profiles/request-lifecycle/1/{profile.json, correspondences.json}` per `SPEC-G0-guardian-contracts.md:363-391`).
- **Language Invariant**: Every ontology identifier (`id`, `entityTypes[].id`, `relationTypes[].id`, attribute names, enum tokens, and stage identifiers) MUST be English ASCII (`^[a-z][a-z0-9_]*$` or `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`). Zero French identifiers are permitted anywhere in `request-lifecycle@1` (`/home/antoinefa/src/graphify/.track/events.jsonl:456`).

### 1.2 Entity Types (`request-lifecycle@1`)

`request-lifecycle@1` (`proposed, not yet in code`) defines seven canonical entity types (`BRIEF-request-lifecycle-spec.md:15-19`):

| Entity Type ID (`proposed`) | Summary | Required Attributes (`proposed`) | Optional Attributes (`proposed`) | Provenance / Identity Anchor in `sources/track-origin-main/` |
|---|---|---|---|---|
| `request` | An owner demand or tracked request item anchored to the owner's literal words and date. | `id` (`string`, Track `DemandId` or `ItemId` ULID), `label` (`string`, explicit human-readable title), `ownerLiteralQuote` (`string`, exact verbatim words of the owner), `requestedAt` (`string`, ISO-8601 date or timestamp), `workspace` (`string`) | `demandId` (`string`, `DemandId`), `demandType` (`DemandType`), `demandStatus` (`DemandStatus`), `demandSourceKind` (`DemandSourceKind`), `requestSourceProvenance` (`RequestSourceProvenance`), `itemKind` (`RequestItemKind`), `itemRole` (`RequestItemRole`), `accountable` (`string`, `ActorId`), `responsible` (`readonly string[]`), `realizationStatus` (`RealizationStatus`), `specStatus` (`SpecAxisStatus`), `acceptanceStatus` (`AcceptanceAxisStatus`), `bucket` (`ReportBucket`), `stage` (`RequestLifecycleStage`), `reportStatus` (`ReportStatus`), `stageQualified` (`boolean`), `priorityScore` (`number`) | Anchored to Track `DemandState` (`sources/track-origin-main/packages/track/src/model/demand.ts:39-53`), `ItemState` (`sources/track-origin-main/packages/track/src/model/item.ts:96-146`), and `RequestSource` (`sources/track-origin-main/packages/track/src/report/build.ts:29-33,265-267`). |
| `spec` | A versioned specification document committed in a Git repository outside scratch paths. | `id` (`string`, `spec:<repository>:<path>@<sha256>`), `repository` (`RepositorySlug`), `path` (`string`, repo-relative POSIX path outside `.graphify/scratch/**`), `sha256` (`string`, `64-hex` lowercase SHA-256 of the committed Git blob content), `commitOid` (`string`, `40-hex` Git commit OID), `blobOid` (`string`, `40-hex` Git blob OID) | `title` (`string`), `ontologyPinId` (`OntologyPinId`), `liveDocRef` (`string`, per `SpecAmendPayload` in `sources/track-origin-main/packages/track/src/model/spec-amend.ts:28`) | Anchored to committed Git blob in `spec/**` (`OWNER-DECISIONS-2026-10-30.md:13,23`). |
| `decision` | An orientation or commitment decision recorded by or for the owner. | `id` (`string`, Track Decision `ItemId` ULID or memory component ID), `title` (`string`), `decisionKind` (`DecisionKind`), `outcome` (`DecisionOutcome`), `realizationStatus` (`RealizationStatus`), `recordedAt` (`string`, ISO-8601), `workspace` (`string`) | `selectedOptionId` (`string`), `recommendationOptionId` (`string`), `recommendationRationale` (`string`), `accountable` (`string`, `ActorId`), `memoryComponentId` (`string`), `citedSpecPin` (`SpecPinCandidate`), `dossierArtifacts` (`readonly DossierArtifact[]`) | Anchored to Track `DecisionState` (`sources/track-origin-main/packages/track/src/model/decision.ts:11-12,71-115`) and Engram decision memory (`SPEC_MEMORY_FINALIZATION.md`). |
| `lot` | A scoped unit of delivery (container `workpackage` / `spec-phase` / `stream`, or non-container leaf item) grouping work toward a request. | `id` (`string`, Track `ItemId` ULID), `title` (`string`), `itemKind` (`RequestItemKind`), `workspace` (`string`), `realizationStatus` (`RealizationStatus`) | `itemRole` (`RequestItemRole`, defined iff container per `isRoleContainer` in `sources/track-origin-main/packages/track/src/model/item.ts:32,155-157`), `code` (`string`, durable display code e.g. `WP9`, `S1` per `item.ts:115`), `parentId` (`string`), `wpStrictRootId` (`string`, per `rollup.ts:196-208`), `specStatus` (`SpecAxisStatus`), `acceptanceStatus` (`AcceptanceAxisStatus`), `disposition` (`Record<DecisionGate, GateDisposition>`), `bucket` (`ReportBucket`), `stage` (`RequestLifecycleStage`), `reportStatus` (`ReportStatus`), `stageQualified` (`boolean`), `realizedCommit` (`string`, per `item.ts:132`), `specExemptReason` (`string`) | Anchored to Track `ItemState` (`sources/track-origin-main/packages/track/src/model/item.ts:17-54,96-157`) and `WpNode` / `WpLeaf` (`sources/track-origin-main/packages/track/src/report/rollup.ts:66-92,137-187`). |
| `pull_request` | A GitHub pull request proposing commits for one or more lots or requests. | `id` (`string`, `pr:<repository>#<number>`), `repository` (`RepositorySlug`), `number` (`number`, positive integer), `headBranch` (`string`), `baseBranch` (`string`), `headCommitOid` (`string`, `40-hex`), `state` (`'open' \| 'draft' \| 'review' \| 'merged' \| 'closed'`) | `mergeCommitOid` (`string`, `40-hex`), `mergedAt` (`string`, ISO-8601), `trackLinkKind` (`'pr-open' \| 'pr-merged'`) | Anchored to Track `Link` (`{ kind: string; locator: string }` at `sources/track-origin-main/packages/track/src/model/item.ts:51-54`), `EVIDENCE_LINK_STAGES` (`'pr-open' \| 'pr-merged'` at `sources/track-origin-main/packages/track/src/report/stage-status.ts:57-60`), and Engram `pr-sync.ts` / `pr-attribution.ts` (`sources/GAP-read-side-astra.md:16`). |
| `release` | A published package or artifact version cut from merged commits (`published` stage). | `id` (`string`, `release:<packageName>@<version>`), `packageName` (`string`), `version` (`string`, SemVer), `repository` (`RepositorySlug`), `tagCommitOid` (`string`, `40-hex`), `publishedAt` (`string`, ISO-8601) | `registry` (`'npm' \| 'github-packages' \| 'oci' \| 'internal'`), `tarballSha256` (`string`, `64-hex`), `releaseNotesRef` (`string`) | Anchored to `publication` (`published`) report stage (`B1`, `OWNER-DECISIONS-2026-10-30.md:10`). |
| `production` | A runtime deployment or workstation installation of a released version (`deployed` stage). | `id` (`string`, `production:<environment>:<packageName>@<version>`), `environment` (`string`), `packageName` (`string`), `version` (`string`, SemVer), `deployedCommitOid` (`string`, `40-hex`), `deployedAt` (`string`, ISO-8601) | `evidenceLocator` (`string`), `hostId` (`string`), `verificationRunId` (`string`) | Anchored to `deployed` in `REPORT_STAGES` (`sources/track-origin-main/packages/track/src/model/report-status.ts:9`) and `EVIDENCE_LINK_STAGES['deployed']` (`sources/track-origin-main/packages/track/src/report/stage-status.ts:60`). |

### 1.3 Relation Types (`request-lifecycle@1`)

All relation identifiers (`proposed, not yet in code`) are directed (`from` → `to`), typed, and English-only:

| Relation Type ID (`proposed`) | Source Entity (`from`) | Target Entity (`to`) | Cardinality | Semantics & Track Anchor in `sources/track-origin-main/` |
|---|---|---|---|---|
| `request_promoted_to_lot` | `request` | `lot` | `1:N` | Demand promotion (`DemandState.itemIds` at `sources/track-origin-main/packages/track/src/model/demand.ts:46` and `ItemState.demandId` at `sources/track-origin-main/packages/track/src/model/item.ts:139`). |
| `request_governed_by_decision` | `request` | `decision` | `N:M` | The request is scoped, arbitrated, or constrained by the target `DecisionState` (`targets: ItemId[]` at `sources/track-origin-main/packages/track/src/model/decision.ts:104`). |
| `request_specified_by_spec` | `request` | `spec` | `N:M` | The request's normative contract is defined in the target committed `spec`. |
| `lot_child_of_lot` | `lot` | `lot` | `N:1` | Hierarchical containment (`ItemState.parentId` at `sources/track-origin-main/packages/track/src/model/item.ts:106` and `assertRoleNesting` at `item.ts:216-237`). |
| `lot_specified_by_spec` | `lot` | `spec` | `N:M` | Spec pin binding a `feature` leaf lot (or container) to a committed `spec` at `(repository, path, sha256)` (`OWNER-DECISIONS-2026-10-30.md:23`). |
| `lot_governed_by_decision` | `lot` | `decision` | `N:M` | A lot is targeted by a recorded `DecisionState` (`DecisionState.targets` at `sources/track-origin-main/packages/track/src/model/decision.ts:104`). |
| `decision_cites_spec` | `decision` | `spec` | `N:M` | A decision (or Engram decision memory) cites a `spec` pin `(repository, path, sha256)` (`OWNER-DECISIONS-2026-10-30.md:22`). |
| `lot_implemented_by_pr` | `lot` | `pull_request` | `N:M` | A lot is linked to a pull request (`Link` with `kind: 'pr-open' \| 'pr-merged'` in `sources/track-origin-main/packages/track/src/report/stage-status.ts:57-60`). |
| `pr_cites_spec` | `pull_request` | `spec` | `N:M` | A pull request's linked `feature` leaf cites the target `spec` pin validated at merge time (`OWNER-DECISIONS-2026-10-30.md:24`). |
| `pr_ships_in_release` | `pull_request` | `release` | `N:M` | A merged pull request's commit is included in a published `release`. |
| `release_deployed_to_production` | `release` | `production` | `1:N` | A published `release` is deployed to a target `production` environment (`EVIDENCE_LINK_STAGES['deployed']` at `sources/track-origin-main/packages/track/src/report/stage-status.ts:60`). |
| `lot_blocked_by_entity` | `lot` | `lot \| decision` | `N:M` | Track `BlockerState` relation (`kind: 'decision' \| 'dependency'`, `resolutionRule: 'linked-done' \| 'linked-accepted' \| 'manual'`, `scope: 'intra' \| 'extra'` at `sources/track-origin-main/packages/track/src/model/blocker.ts:4-28`). |

### 1.4 Alignment with Track's Separate Axes & `B1` Report Stages

Per `B1` (`OWNER-DECISIONS-2026-10-30.md:10`), Track's orthogonal axes in `sources/track-origin-main/packages/track/` are preserved intact without collapsing them into a single workflow state machine:

```
Orthogonal Track Axes & Aggregates in sources/track-origin-main/ (preserved per B1)
  ├── RequestItemKind       (ItemKind, model/item.ts:17)            : 'feature' | 'bug' | 'chore' | 'decision' | 'defect'
  ├── RequestItemRole       (ItemRole, model/item.ts:32)            : 'workpackage' | 'spec-phase' | 'stream'
  ├── SpecAxisStatus        (SpecStatus | 'n/a', model/item.ts:44)  : 'to-specify' | 'specified' | 'n/a'
  ├── RealizationStatus     (Realization, model/item.ts:45)         : 'to-do' | 'in-progress' | 'done' | 'cancelled' | 'rejected'
  ├── DecisionGate          (Gate / DecisionKind, model/item.ts:48) : 'orientation' | 'commitment'
  ├── GateDisposition       (Disposition, model/item.ts:49)         : 'required' | 'skipped' | 'not-applicable' | 'completed'
  ├── AcceptanceAxisStatus  (AcceptanceStatus, acceptance.ts:7-9)   : 'fail' | 'waived' | 'unknown' | 'stale' | 'pass' | 'n/a'
  ├── DecisionOutcome       (Outcome, model/decision.ts:12)         : 'pending' | 'go' | 'no-go' | 'deferred'
  ├── DemandType            (DemandType, model/demand.ts:15)        : 'feature' | 'defect' | 'chore'
  ├── DemandStatus          (DemandStatus, model/demand.ts:16)      : 'raised' | 'qualifying' | 'agreed' | 'rejected' | 'duplicate' | 'parked'
  ├── BlockerKind           (BlockerKind, model/blocker.ts:4)       : 'decision' | 'dependency'
  ├── BlockerResolutionRule (ResolutionRule, model/blocker.ts:5)    : 'linked-done' | 'linked-accepted' | 'manual'
  ├── BlockerScope          (BlockerScope, model/blocker.ts:12)     : 'intra' | 'extra'
  ├── ReportBucket          (Bucket, report/buckets.ts:6)           : 'AWAITED' | 'DROPPED' | 'DONE' | 'TO-DO'
  └── ReportStatus          (ReportStatus, model/report-status.ts:11): 'progressing' | 'unforeseen' | 'blocked' | 'decision-awaited' | 'not-qualified' | 'withdrawn'

Report Stage Axis (Track ReportStage in model/report-status.ts:9 = 5 values; widened per B1 with 'review' and 'published')
  spec ──► dev ──► pr ──► review (B1) ──► merged ──► published (B1) ──► deployed
```

#### 1.4.1 Explicit Resolution of the Report-Stage & Qualification Name Collisions

Two naming collisions between Track (`sources/track-origin-main/packages/track/`) and `request-lifecycle@1` are resolved explicitly:

1. **Stage Type & Normalizer Name Collision (`ReportStage` / `normalizeReportStage` vs `RequestLifecycleStage` / `normalizeRequestLifecycleStage`)**:
   - In Track (`sources/track-origin-main/packages/track/src/model/report-status.ts:9-10,26-30` and `src/report/stage-status.ts:33`), `REPORT_STAGES` is the 5-tuple `['spec', 'dev', 'pr', 'merged', 'deployed'] as const`, `ReportStage` (aliased as `StageCode`) is `(typeof REPORT_STAGES)[number]`, and `normalizeReportStage(value: unknown): ReportStage | undefined` maps `'spec' | 'dev' | 'pr' | 'merged' | 'deployed'` and `LEGACY_STAGE_ALIASES` (`{ PR: 'pr', 'mergé': 'merged', 'déployé': 'deployed' }`, lines 15-19) to `ReportStage`, returning `undefined` on any unrecognized input so `normalizeStoredReport` (lines 40-53) drops unknown stage assertions on read.
   - Under `B1` (`OWNER-DECISIONS-2026-10-30.md:10`), `review` and `publication` (`published`) are added to the report stages (`'review'` and `'published'` are currently `not covered` in `sources/track-origin-main/packages/track/src/model/report-status.ts:9`).
   - To avoid colliding with Track's 5-value `ReportStage` and `normalizeReportStage`:
     - Engram names its 7-stage widened type `RequestLifecycleStage = 'spec' | 'dev' | 'pr' | 'review' | 'merged' | 'published' | 'deployed'`.
     - Engram names its stage normalizer `normalizeRequestLifecycleStage(value: unknown): RequestLifecycleStage | undefined`, adopting Track's exact `undefined`-for-unknown return contract (`sources/track-origin-main/packages/track/src/model/report-status.ts:26-30`) instead of returning a string `'unknown'` sentinel.
2. **Qualification vs Report-Status Name Collision (`DemandStatus['qualifying']`, `ReportStatus['not-qualified']`, and `ItemStageStatus['qualified']`)**:
   - In Track (`sources/track-origin-main/packages/track/`), "qualification" and "status" refer to three distinct constructs that MUST NOT be conflated:
     - `DemandStatus` (`sources/track-origin-main/packages/track/src/model/demand.ts:16`): `'raised' | 'qualifying' | 'agreed' | 'rejected' | 'duplicate' | 'parked'` (lifecycle of a `demand` aggregate before promotion into `item`(s)).
     - `ReportStatus` / `StatusCode` (`sources/track-origin-main/packages/track/src/model/report-status.ts:11-12`; `src/report/stage-status.ts:35`): `'progressing' | 'unforeseen' | 'blocked' | 'decision-awaited' | 'not-qualified' | 'withdrawn'` (the 6 neutral status codes on an item's report row; note that `'blocked'` lives here and in bucket `'AWAITED'`, **never** on `Realization`, and `'qualified'` is **not** a member of `REPORT_STATUSES`).
     - `ItemStageStatus['qualified']` (`sources/track-origin-main/packages/track/src/report/stage-status.ts:77,196-209`): a derived `boolean` witness (`acceptanceWitness || storedWitness === true`) indicating whether a qualifying fact postdating the last reopening is present.
   - `request-lifecycle@1` preserves all three without collision: `DemandStatus` (`6` demand states), `ReportStatus` (`6` report status codes), and `stageQualified` (`boolean` corresponding to `ItemStageStatus['qualified']`).

#### 1.4.2 Exact Correspondence Table (`request-lifecycle@1` ↔ `@sentropic/track@0.98.7` on `origin/main@9ea4db7c5`)

Per `D1` (`OWNER-DECISIONS-2026-10-30.md:12`) and G0 (`SPEC-G0-guardian-contracts.md:191-215`), every correspondence rule maps only to axes and values verified in `sources/track-origin-main/packages/track/`. Any value not yet in `sources/track-origin-main/` is marked `not covered` and linked to an open question in §9.1:

| `request-lifecycle@1` Symbol (`proposed`) | `request-lifecycle@1` Values / Shape | Track Source Type & File:Line (`sources/track-origin-main/packages/track/...`) | Track Values / Shape on `origin/main` (`9ea4db7c5`) | Correspondence Kind & Coverage |
|---|---|---|---|---|
| `RequestItemKind` | `'feature' \| 'bug' \| 'chore' \| 'decision' \| 'defect'` | `ItemKind` (`src/model/item.ts:17`) | `'feature' \| 'bug' \| 'chore' \| 'decision' \| 'defect'` | `exact` (closed 5-value union). |
| `RequestItemRole` | `'workpackage' \| 'spec-phase' \| 'stream'` | `ItemRole` (`src/model/item.ts:32`; `isRoleContainer` at `src/model/item.ts:155-157`) | `'workpackage' \| 'spec-phase' \| 'stream'` (`undefined` on leaf items) | `exact` (closed 3-value union). |
| `SpecAxisStatus` | `'to-specify' \| 'specified' \| 'n/a'` | `SpecStatus \| 'n/a'` (`src/model/item.ts:44,102`; `src/state/fold.ts:147`) | `'to-specify' \| 'specified'` (`'n/a'` when `kind === 'decision'`) | `exact` (closed union; `spec.started` and `spec.abandoned` at `src/events/types.ts:108-109` are log-only handler facts not folded into `specStatus` per `src/state/fold.ts:73-75`). |
| `RealizationStatus` | `'to-do' \| 'in-progress' \| 'done' \| 'cancelled' \| 'rejected'` | `Realization` (`src/model/item.ts:45,280-286`) | `'to-do' \| 'in-progress' \| 'done' \| 'cancelled' \| 'rejected'` | `exact` (closed 5-value union; `'blocked'` is **not** a `Realization` value — see `ReportStatus` and `ReportBucket`). |
| `ReopenMotive` | `'closed-without-owner-uat' \| 'regression-observed'` | `ReopenMotive` (`src/model/item.ts:69-70`) | `'closed-without-owner-uat' \| 'regression-observed'` | `exact` (closed 2-value union). |
| `DecisionGate` / `DecisionKind` | `'orientation' \| 'commitment'` | `Gate` (`src/model/item.ts:48`) / `DecisionKind` (`src/model/decision.ts:11`) | `'orientation' \| 'commitment'` | `exact` (closed 2-value union). |
| `GateDisposition` | `'required' \| 'skipped' \| 'not-applicable' \| 'completed'` | `Disposition` (`src/model/item.ts:49`) | `'required' \| 'skipped' \| 'not-applicable' \| 'completed'` | `exact` (closed 4-value union). |
| `AcceptanceAxisStatus` | `'fail' \| 'waived' \| 'unknown' \| 'stale' \| 'pass' \| 'n/a'` | `CriterionStatus` & `AcceptanceStatus` (`src/model/acceptance.ts:7-9`; `docs/spec/SPEC.md:140-149`) | `'fail' \| 'waived' \| 'unknown' \| 'stale' \| 'pass' \| 'n/a'` (`'n/a'` for `kind: 'decision'`) | `exact` (closed 6-value union). |
| `EvidenceKind` | `'unit' \| 'integration' \| 'e2e' \| 'manual'` | `EvidenceKind` (`src/model/acceptance.ts:3`) | `'unit' \| 'integration' \| 'e2e' \| 'manual'` | `exact` (closed 4-value union). |
| `DecisionOutcome` | `'pending' \| 'go' \| 'no-go' \| 'deferred'` | `Outcome` (`src/model/decision.ts:12,206-211`) | `'pending' \| 'go' \| 'no-go' \| 'deferred'` | `exact` (closed 4-value union). |
| `DemandType` | `'feature' \| 'defect' \| 'chore'` | `DemandType` (`src/model/demand.ts:15,96`) | `'feature' \| 'defect' \| 'chore'` | `exact` (closed 3-value union). |
| `DemandStatus` | `'raised' \| 'qualifying' \| 'agreed' \| 'rejected' \| 'duplicate' \| 'parked'` | `DemandStatus` (`src/model/demand.ts:16,61-68`) | `'raised' \| 'qualifying' \| 'agreed' \| 'rejected' \| 'duplicate' \| 'parked'` | `exact` (closed 6-value union; off-ramp subset `DispositionOutcome = 'rejected' \| 'duplicate' \| 'parked'` at `src/model/demand.ts:82`). |
| `DemandSourceKind` | `'human' \| 'agent' \| 'h2a' \| 'import' \| 'external'` | `DemandSource['kind']` (`src/model/demand.ts:27,97`) | `'human' \| 'agent' \| 'h2a' \| 'import' \| 'external'` | `exact` (closed 5-value union). |
| `RequestSourceProvenance` | `'demand-raw' \| 'legacy-title'` | `RequestSource['provenance']` (`src/report/build.ts:29-33`) | `'demand-raw' \| 'legacy-title'` | `exact` (closed 2-value union). |
| `BlockerKind` | `'decision' \| 'dependency'` | `BlockerKind` (`src/model/blocker.ts:4`) | `'decision' \| 'dependency'` | `exact` (closed 2-value union). |
| `BlockerResolutionRule` | `'linked-done' \| 'linked-accepted' \| 'manual'` | `ResolutionRule` (`src/model/blocker.ts:5`) | `'linked-done' \| 'linked-accepted' \| 'manual'` | `exact` (closed 3-value union; openness evaluated by `isOpen` in `src/state/fold.ts:561-576` and `effectiveBlockerOpen` in `src/report/blocker-status.ts:29-50`). |
| `BlockerScope` | `'intra' \| 'extra'` | `BlockerScope` (`src/model/blocker.ts:12`) | `'intra' \| 'extra'` | `exact` (closed 2-value union). |
| `ReportBucket` | `'AWAITED' \| 'DROPPED' \| 'DONE' \| 'TO-DO'` | `Bucket` (`src/report/buckets.ts:6-7,22-37`) | `'AWAITED' \| 'DROPPED' \| 'DONE' \| 'TO-DO'` | `exact` (closed 4-value union; precedence `AWAITED > DROPPED > DONE > TO-DO` in `bucketOf` at `src/report/buckets.ts:22-37`). |
| `ReportStatus` | `'progressing' \| 'unforeseen' \| 'blocked' \| 'decision-awaited' \| 'not-qualified' \| 'withdrawn'` | `ReportStatus` (`src/model/report-status.ts:11-12`) / `StatusCode` (`src/report/stage-status.ts:35,230-248`) | `'progressing' \| 'unforeseen' \| 'blocked' \| 'decision-awaited' \| 'not-qualified' \| 'withdrawn'` | `exact` (closed 6-value union; an open dependency blocker or `acceptance === 'fail'` derives `status = 'blocked'` at `src/report/stage-status.ts:233-234`). |
| `stageQualified` | `boolean` | `ItemStageStatus['qualified']` (`src/report/stage-status.ts:77,196-209`) | `boolean` (`acceptanceWitness \|\| storedWitness === true`) | `exact` (derived boolean field on `ItemStageStatus`, distinct from `ReportStatus`). |
| `RequestLifecycleStage` | `'spec' \| 'dev' \| 'pr' \| 'review' \| 'merged' \| 'published' \| 'deployed'` | `ReportStage` (`src/model/report-status.ts:9-10`) / `StageCode` (`src/report/stage-status.ts:33`) + `LEGACY_STAGE_ALIASES` (`src/model/report-status.ts:15-19`) | `REPORT_STAGES = ['spec', 'dev', 'pr', 'merged', 'deployed']`; legacy read aliases `PR -> 'pr'`, `'mergé' -> 'merged'`, `'déployé' -> 'deployed'` | `widening` + `inbound-alias-normalization`: `'spec' \| 'dev' \| 'pr' \| 'merged' \| 'deployed'` map 1:1 to `REPORT_STAGES`; `'PR'`, `'mergé'`, `'déployé'` normalize on read per `model/report-status.ts:15-30`; `'review'` and `'published'` are added per `B1` (`OWNER-DECISIONS-2026-10-30.md:10`) and are currently `not covered` in `sources/track-origin-main/packages/track/src/model/report-status.ts:9` (see `IF-8` and `OQ-5`). |
| `ItemLink` & Stage-Proving Link Kinds | Open `{ kind: string; locator: string }` with known stage-proving kinds `'pr-open' \| 'pr-merged' \| 'deployed'`, provenance kind `'branch.md'`, and proposed `'spec' \| 'spec-exempt'` | `Link` (`src/model/item.ts:51-54`), `EVIDENCE_LINK_STAGES` (`src/report/stage-status.ts:57-61`), `docs/spec/SPEC.md:239` | Open `{ kind: string; locator: string }`; `EVIDENCE_LINK_STAGES` maps `'pr-open' -> 'pr'`, `'pr-merged' -> 'merged'`, `'deployed' -> 'deployed'`; `'branch.md'` on imported items | `partial` / `not covered` for `'spec'` and `'spec-exempt'`: Track `Link.kind` is an open `string` (`src/model/item.ts:52`), `links` is only written on creation (`src/state/fold.ts:155,194,509`), and `'spec'` / `'spec-exempt'` link kinds plus the additive link-addition event on existing items are `not covered` in `sources/track-origin-main/` (owned by `Track/H2A` under `IF-6` and `OQ-1`). |

---

## 2. Vocabulary Publication, Digest Discipline & Migration Order (`B1`, `D1`, `E1`, G0)

> « Amendment A1 » — sections 2.1 and 2.2 below are replaced per the round-3 binding design note (`DESIGN-NOTE-rlo-g0-binding.md`, sha256 `a503789494fcbd8813fd005607f4596fcdba480975ae56f47278d43089125667`); section 2.3 is unchanged.

### 2.1 Profile JSON & Mapping JSON Schemas

Engram publishes two deterministic JSON files under
`profiles/request-lifecycle/1/`. Both files copy the committed shape of
`profiles/repo-knowledge/1/` exactly. No top-level key is added and none is
removed.

#### 2.1.1 `profiles/request-lifecycle/1/profile.json`

Top-level shape, copied from `profiles/repo-knowledge/1/profile.json:1-7`:
`{id, version, owner, lifecycle, description, modules}`. `version` is the
string `"1"` (same form as `profiles/repo-knowledge/1/profile.json:3`).

Request-lifecycle content lives inside `modules`. Two modules are defined:

- `modules.track`: `{description, entityTypes, relationTypes, axes}`.
  `entityTypes` lists the 7 entity types of section 1.2 as `{id}` objects:
  `decision, lot, production, pull_request, release, request, spec`.
  `relationTypes` lists the 12 relation types of section 1.3 as
  `{id, from, to}` objects: `request_promoted_to_lot`,
  `request_governed_by_decision`, `request_specified_by_spec`,
  `lot_child_of_lot`, `lot_specified_by_spec`, `lot_governed_by_decision`,
  `decision_cites_spec`, `lot_implemented_by_pr`, `pr_cites_spec`,
  `pr_ships_in_release`, `release_deployed_to_production`,
  `lot_blocked_by_entity`. `axes` holds the 18 axes of section 1.4.2,
  including `requestLifecycleStages: ["spec", "dev", "pr", "review",
  "merged", "published", "deployed"]`.
- `modules.lifecycle`: `{description, requestLifecycleStages}` with the
  same 7-stage list, kept next to the stage-normalizer contract of
  section 2.3.

The following section 2.1.1 fields of the previous draft have no slot in
this shape and are not asserted here: `$schema`, `coordinate`, `domain`,
`visibility`, `specPath`, `language`, and top-level `entityTypes`,
`relationTypes`, `axes`. See open questions OQ-RL-2 and OQ-RL-7.

#### 2.1.2 `profiles/request-lifecycle/1/engram-mapping.json`

Top-level shape, copied from
`profiles/repo-knowledge/1/engram-mapping.json:1-8`:
`{mappingVersion, profile, description, adapters}`. `profile` is
`{id: "request-lifecycle", version: "1"}`. Each adapter keeps the real
adapter keys `{timingRecord, extractionTarget, note}` of
`profiles/repo-knowledge/1/engram-mapping.json:9-13`:

- `timingRecord` holds the `request-lifecycle@1` source symbol (for
  example `"RequestLifecycleStage"`).
- `extractionTarget` holds the target symbol in Track or in
  `repo-knowledge@1` (for example `"ReportStage"`).
- `note` holds the correspondence kind and coverage as text (for example
  `"widening; review and published are B1 additions, not covered in Track
  REPORT_STAGES"`).

The previous `OntologyCorrespondenceRule` fields `kind`,
`coverageStatus`, `inboundAliases`, `unmappedSourceValues` and
`openQuestionId` have no dedicated adapter slot. They survive only as
`note` text (partial). See open question OQ-RL-3. Ontology evolution still
uses versions plus explicit correspondences; composition stays refused
(section 2.2, fixture F3).

### 2.2 Canonical Digest Computation (G0 Contract)

Digests use only the committed G0 helpers. A `Digest` is 64 lowercase hex
digits with no prefix (`src/ontology-guardian/types.ts:6`,
`src/ontology-guardian/types.ts:8-11`).

1. Content digest: parse `profiles/request-lifecycle/1/profile.json` as a
   JSON value and compute
   `contentDigest = digestOfPreimage(profileJsonValue)`
   (`src/ontology-guardian/canonical.ts:70-72`), equivalently
   `sha256Hex(canonicalBytes(profileJsonValue))`
   (`src/ontology-guardian/canonical.ts:60-67`).
   `REQUEST_LIFECYCLE_PIN = {id: "request-lifecycle", version: "1",
   contentDigest}` follows the closed `Pin` shape
   (`src/ontology-guardian/types.ts:14-18`) and the `OPENERP_PIN` pattern
   (`src/ontology-guardian/openerp-profile.ts:495`).
2. Pins digest: `pinsDigestOf({layers: [REQUEST_LIFECYCLE_PIN]})`
   (`src/ontology-guardian/digests.ts:81-84`), the same single-layer form
   as `openerpPinsDigestOf`
   (`src/ontology-guardian/openerp-profile.ts:506-508`). The digest value
   is `unknown` until the profile file exists and is pinned; no value is
   asserted in this spec.
3. Mapping digest: `engram-mapping.json` is hashed as a JSON value with
   `digestOfPreimage`. `mappingDigestOf`
   (`src/ontology-guardian/digests.ts:231-233`) needs a `MappingFile`
   projection (`src/ontology-guardian/types.ts:224-229`) that the
   `{mappingVersion, profile, description, adapters}` shape does not
   provide directly. Status: partial. See open question OQ-RL-4.
4. Catalog entry digest: `entryDigestOf(entry)`
   (`src/ontology-guardian/digests.ts:292-295`), computed externally over
   the whole entry and never self-embedded.
5. Admission: `checkAdmission({entry, receipts})`
   (`src/ontology-guardian/admission.ts:445-499`) returns
   `{admitted: true}` or `{admitted: false, code: "missing-receipt",
   reason}` (`src/ontology-guardian/admission.ts:99-101`). The
   `request-lifecycle@1` entry uses family `"TRK"`
   (`src/ontology-guardian/admission.ts:40`), `profileShape:
   "track-vocabulary"` (`src/ontology-guardian/types.ts:86-91`) and
   `artifactKind: "profile"` (`src/ontology-guardian/types.ts:92`).
   `deriveRequirements` (`src/ontology-guardian/admission.ts:135`) then
   requires a `"family-corpus"` receipt
   (`src/ontology-guardian/admission.ts:108-111`). No
   `computeOntologyCanonicalDigest`, `verifyOntologyPinDigest`,
   `canonicalizeJsonText` or `OntologyIntegrityError` symbol is used:
   none exists in `src/`.

### 2.3 Stage Normalizer & Rollout Sequencing: Readers First, Then Writers (`B1`)

Per `OWNER-DECISIONS-2026-10-30.md:10` and `sources/track-origin-main/packages/track/src/model/report-status.ts:9-30`:

```typescript
export const REQUEST_LIFECYCLE_STAGES = [
  'spec',
  'dev',
  'pr',
  'review',
  'merged',
  'published',
  'deployed',
] as const;

export type RequestLifecycleStage = (typeof REQUEST_LIFECYCLE_STAGES)[number];

export const LEGACY_TRACK_STAGE_ALIASES: Readonly<Record<string, RequestLifecycleStage>> = {
  PR: 'pr',
  'mergé': 'merged',
  'déployé': 'deployed',
};

/**
 * Proposed in src/request-lifecycle/stage-normalizer.ts (proposed, not yet in code).
 * Named normalizeRequestLifecycleStage (distinct from Track's 5-stage normalizeReportStage in
 * sources/track-origin-main/packages/track/src/model/report-status.ts:26-30), while preserving
 * Track's exact undefined-for-unknown return semantics.
 */
export function normalizeRequestLifecycleStage(
  value: unknown,
): RequestLifecycleStage | undefined {
  if (typeof value !== 'string') return undefined;
  if ((REQUEST_LIFECYCLE_STAGES as readonly string[]).includes(value)) {
    return value as RequestLifecycleStage;
  }
  return LEGACY_TRACK_STAGE_ALIASES[value];
}
```

Rollout order (`B1`, `OWNER-DECISIONS-2026-10-30.md:10`):
1. **Step 1 — Engram publishes `request-lifecycle@1` (Reader-Ready Vocabulary)**:
   - Engram commits `spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md` (`E1`), `profiles/request-lifecycle/1/profile.json`, `profiles/request-lifecycle/1/correspondences.json`, and registers `request-lifecycle@1` in `src/ontology-guardian/catalog.ts`.
   - Engram exports `normalizeRequestLifecycleStage(value: unknown): RequestLifecycleStage | undefined`, accepting all 7 canonical English tokens (`'spec' | 'dev' | 'pr' | 'review' | 'merged' | 'published' | 'deployed'`) plus Track's `LEGACY_STAGE_ALIASES` (`'PR' -> 'pr'`, `'mergé' -> 'merged'`, `'déployé' -> 'deployed'`), and returning `undefined` on any unknown value (never throwing on historical log replay).
2. **Step 2 — Consumers (`Track/H2A`, `sentropic`) ship Readers (`IF-8`)**:
   - Track (`src/model/report-status.ts`, `src/report/stage-status.ts`, `src/report/stage-status-lexicon.ts`) and Sentropic upgrade their stage readers to accept `'review'` and `'published'` alongside `'spec' | 'dev' | 'pr' | 'merged' | 'deployed'` and `LEGACY_STAGE_ALIASES`.
3. **Step 3 — Track ships Writers (`IF-8`)**:
   - Only after readers in Engram, Track, and Sentropic are merged and released does Track enable writing `'review'` and `'published'` in `assertItemReportStatus` (`sources/track-origin-main/packages/track/src/model/report-status.ts:100-116`) and `EVIDENCE_LINK_STAGES` (`sources/track-origin-main/packages/track/src/report/stage-status.ts:57-63`).
4. **Non-Withdrawal Invariant**: Persisted events in `.track/events.jsonl` are hash-chained (`seq`, `prevHash`, `contentHash` in `sources/track-origin-main/packages/track/src/events/types.ts:195-199`); historical `'PR'`, `'mergé'`, and `'déployé'` tokens are **never rewritten or withdrawn** (`OWNER-DECISIONS-2026-10-30.md:10`; `sources/track-origin-main/packages/track/src/model/report-status.ts:5-8`).

---

## 3. Memory↔Spec Drift Report (`C commune` Point 1)

### 3.1 Normative Purpose & Non-Blocking Guarantee

Per `OWNER-DECISIONS-2026-10-30.md:22,25`, `question-c-concertation-opus-r2.md:59-60,63`, `BRIEF-request-lifecycle-spec.md:23`, and `continuity-final-wonder.md:127`:
- Engram exposes a **pure, read-only** function and CLI/MCP report surface that evaluates memory↔spec drift at a named Git `baselineCommit` (`40-hex` commit OID), callable at each status report, PR, and branch close (`question-c-concertation-opus-r2.md:60`).
- It uses **only** the four drift categories defined in `C commune` (`continuity-final-wonder.md:127`; `DOSSIER-decision-demandes.html:325,609`), in **list-only mode**.
- It **never** mutates Git, Track, or Memory state, and **never** blocks a commit, a Track axis transition, or a memory recall (`OWNER-DECISIONS-2026-10-30.md:25`; `question-c-concertation-opus-r2.md:63`).

### 3.2 The Four Normative Drift Categories (`MemorySpecDriftCategory`)

```typescript
/**
 * Proposed in src/request-lifecycle/drift-report.ts (proposed, not yet in code).
 * Exact 4 categories from C commune (continuity-final-wonder.md:127; DOSSIER-decision-demandes.html:325,609).
 */
export type MemorySpecDriftCategory =
  | 'matching'
  | 'drifted-since-citation'
  | 'decision-memory-without-committed-spec'
  | 'spec-cited-from-uncommitted-or-scratch-path';
```

| Category Token (`proposed`) | Exact Wording in `C commune` (`continuity-final-wonder.md:127`) | Classification Predicate at `baselineCommit` |
|---|---|---|
| `'matching'` | `matching` | The decision memory (or Track decision/item spec citation) carries a spec pin `(repository, path, sha256)` where `path` is outside `.graphify/scratch/**`, the file exists in the Git tree of `baselineCommit`, and the SHA-256 of the committed Git blob at `baselineCommit:path` equals the cited `sha256`. |
| `'drifted-since-citation'` | `drifted since citation` | The citation carries `(repository, path, sha256)` where `path` is outside `.graphify/scratch/**`, and either: (a) the file exists at `baselineCommit:path` with a committed blob whose SHA-256 differs from `sha256`, or (b) `path` was committed at an ancestor commit of `baselineCommit` but was deleted/renamed before `baselineCommit`. |
| `'decision-memory-without-committed-spec'` | `decision memory with no committed-spec citation` | An admitted decision memory component in Engram (or a settled Track decision projected into memory) has zero spec citations, or has a spec citation missing `repository`, `path`, or `sha256`. |
| `'spec-cited-from-uncommitted-or-scratch-path'` | `spec cited from an uncommitted/scratch path` | A decision memory or Track item cites a spec `path` inside `.graphify/scratch/**` **or** cites a `path` that has never been committed in the Git tree at or before `baselineCommit`. |

### 3.3 Deterministic Classification Precedence

When a single decision memory record or citation could match multiple failure conditions, the classifier evaluates rules in the following strict deterministic order (first match wins):

1. **No citation / incomplete citation tuple** (`!citation || !citation.repository.trim() || !citation.path.trim() || !citation.sha256?.trim()`) $\rightarrow$ `'decision-memory-without-committed-spec'`.
2. **Scratch path** (`isScratchSpecPath(citation.path) === true`, i.e., normalized POSIX path equals `.graphify/scratch`, starts with `.graphify/scratch/`, or contains `/.graphify/scratch/`) $\rightarrow$ `'spec-cited-from-uncommitted-or-scratch-path'`.
3. **Uncommitted path** (file `citation.path` does not exist in `baselineCommit` tree **and** is not found in ancestor history of `baselineCommit`) $\rightarrow$ `'spec-cited-from-uncommitted-or-scratch-path'`.
4. **Blob SHA-256 mismatch or deleted since citation** (`blobAtBaseline === null` while present in ancestor history, or `blobAtBaseline.contentSha256.toLowerCase() !== citation.sha256.trim().toLowerCase()`) $\rightarrow$ `'drifted-since-citation'`.
5. **Exact match** (`blobAtBaseline.contentSha256.toLowerCase() === citation.sha256.trim().toLowerCase()`) $\rightarrow$ `'matching'`.

### 3.4 Input & Output Contracts (`evaluateMemorySpecDrift`)

```typescript
export type RepositorySlug = string; // e.g. "rhanka/engram", "rhanka/h2a", "rhanka/sentropic"

export interface SpecCitationInput {
  readonly repository: RepositorySlug;
  readonly path: string;
  readonly sha256?: string;
  readonly citedAtCommitOid?: string;
}

export interface DecisionMemoryDriftInput {
  readonly memoryId: string;
  readonly decisionId?: string;
  readonly trackItemId?: string;
  readonly summary: string;
  readonly recordedAt: string; // ISO-8601
  readonly citations: readonly SpecCitationInput[];
}

export interface GitTreeBlobReader {
  /**
   * Pure read-only lookup at a named commit OID.
   * Returns null if commitOid or path does not exist in that commit's tree.
   */
  readCommittedBlob(input: {
    readonly repository: RepositorySlug;
    readonly commitOid: string;
    readonly path: string;
  }): {
    readonly blobOid: string;
    readonly contentSha256: string;
  } | null;

  /**
   * Returns true iff path existed in at least one ancestor commit of commitOid.
   */
  pathExistedInHistory?(input: {
    readonly repository: RepositorySlug;
    readonly commitOid: string;
    readonly path: string;
  }): boolean;
}

export interface DriftReportEntry {
  readonly memoryId: string;
  readonly decisionId?: string;
  readonly trackItemId?: string;
  readonly summary: string;
  readonly recordedAt: string;
  readonly category: MemorySpecDriftCategory;
  readonly citedRepository?: RepositorySlug;
  readonly citedPath?: string;
  readonly citedSha256?: string;
  readonly currentBlobOid?: string;
  readonly currentSha256?: string;
}

/**
 * Informational list-only cross-store observations from C commune
 * (question-c-concertation-opus-r2.md:63,83). Never gating.
 */
export interface InformationalDriftCounters {
  readonly uncommittedTrackEventsCount: number | 'unknown';
  readonly mergedPullRequestsWithoutLinkedItemCount: number | 'unknown';
  readonly codeCitationsToUnresolvedSpecCount: number | 'unknown';
}

export interface MemorySpecDriftReport {
  readonly schemaVersion: 'request-lifecycle-drift-report/v1';
  readonly repository: RepositorySlug;
  readonly baselineCommit: string; // 40-hex OID
  readonly entries: readonly DriftReportEntry[];
  readonly countsByCategory: Readonly<Record<MemorySpecDriftCategory, number>>;
  readonly informationalCounters: InformationalDriftCounters;
}
```

**Deterministic Ordering Invariant**: `entries` MUST be sorted deterministically by `(categoryOrder(entry.category), entry.memoryId.localeCompare(other.memoryId), (entry.citedPath ?? '').localeCompare(other.citedPath ?? ''))`, where `categoryOrder` is:
1. `'spec-cited-from-uncommitted-or-scratch-path'`
2. `'decision-memory-without-committed-spec'`
3. `'drifted-since-citation'`
4. `'matching'`

---

## 4. Deterministic Spec-Pin Validator (`C commune` Points 2–5)

### 4.1 Complete `C commune` Architecture: Validator (Engram) vs Report Blocker (Track/Conductor) vs Merge Gates (`branch-lifecycle` & CI)

Per `OWNER-DECISIONS-2026-10-30.md:21-30`, `question-c-concertation-opus-r2.md:57-74`, and `question-c-concertation-argon-r3.md:1-16`:

1. **Engram owns the pure, deterministic `validateSpecPin` function (`IF-3`)**:
   - Evaluates whether a `feature` leaf (`kind === 'feature'` and `role === undefined`) that transitioned to `specified` or `in-progress` at or after `T` (or is re-anchored by name at `T`) carries a resolved `spec` pin (`repository`, `path`, `sha256`, committed blob at `targetCommitOid`, with `path` outside `.graphify/scratch/**`) or a reasoned `spec-exempt` (`question-c-concertation-opus-r2.md:59`).
   - Nothing is added to Track's core state machine (`question-c-concertation-opus-r2.md:60,70`).
2. **Track/Conductor owns the immediate effect at the next status report (`IF-7`)**:
   - Track has no hook on transition and its core remains Git-free (`question-c-concertation-opus-r2.md:70`; `sources/track-origin-main/packages/track/skills/branch-lifecycle/SKILL.md:11,118`; `INTENTION.md:24`).
   - Therefore, at the **first status report after the transition** (`Au premier rapport après la transition`, `question-c-concertation-opus-r2.md:61,70`), if `validateSpecPin` refuses, the conductor opens a Track blocker with `kind: 'dependency'` and `resolutionRule: 'manual'` (`sources/track-origin-main/packages/track/src/model/blocker.ts:4-5`).
   - Opening this blocker derives report `status: 'blocked'` (`sources/track-origin-main/packages/track/src/report/stage-status.ts:233-234`) and places the item in report bucket `'AWAITED'` (`sources/track-origin-main/packages/track/src/report/buckets.ts:25`), while `item.realization` remains `'to-do'` or `'in-progress'` and **zero transition is refused** (`setSpec` and `setRealization` never consult blockers; `question-c-concertation-opus-r2.md:61,69`).
3. **Only Merge is Blocked — Two Distinct Merge Gates in `branch-lifecycle` and CI (`IF-9`, `IF-10`, `IF-11`)**:
   - **Deadline (`Échéance`)**: Neither a date nor a counter, but the attempt to merge the PR linked to the item (`question-c-concertation-opus-r2.md:62`). An item that is never merged has no deadline and never experiences a refusal (`question-c-concertation-opus-r2.md:73`).
   - **Why the spec-pin merge gate reads the pin and NOT the blocker**: In Track (`sources/track-origin-main/packages/track/src/state/fold.ts:561-575`), a `linked-done` dependency blocker closes automatically as soon as its `ref` item reaches `realization === 'done'` even if no spec was ever committed, and a `manual` dependency blocker can be closed by a `blocker.resolved` event (`question-c-concertation-opus-r2.md:71,93`). Therefore, the merge check MUST evaluate the item's `spec` pin (or `spec-exempt`) directly via `validateSpecPin` (`OWNER-DECISIONS-2026-10-30.md:24`; `question-c-concertation-opus-r2.md:62,71`).
   - **Separation of the Two Merge Gates**:
     - **Gate A — Track Event-Containment Gate (`IF-9`, owned by `Track/H2A` & `CI`)**: `track events-contains` on every PR carrying `.track` (`question-c-concertation-opus-r2.md:59`), orchestrated by `skills/branch-lifecycle/SKILL.md:42-62` (`assets/check.sh`), which trial-merges the branch into base and enforces `events(post-merge real) ⊇ events(branch)` (`rc=0` on containment, `rc=1` on lost events, `rc=2` on merge conflict / setup error).
     - **Gate B — Spec-Pin Merge Gate (`IF-10` in `branch-lifecycle`, `IF-11` in CI)**: Calls Engram's `validateSpecPin` (`IF-3`) on the PR's linked `feature` leaf item(s).
   - **Prerequisites & Rollout Order (`question-c-concertation-opus-r2.md:65,81`; `OWNER-DECISIONS-2026-10-30.md:27-30`)**:
     - **engram**: builds the drift report (`IF-2`) and the spec-pin validator (`IF-3`).
     - **Track/H2A**: builds the additive link-addition event on existing items (`IF-6`), the PR ↔ item link (`IF-6`), the requirement that the `.track` journal be present on the PR (`IF-6`), and `.gitattributes` `merge=union` + `track reseal` (`IF-9` / `IF-11`).
     - **CI**: installs Track in CI, wires the required job and branch protection, piloting on `rhanka/engram` first (where working-copy divergence is `0` events against `origin/main`, `question-c-concertation-opus-r2.md:81,133`), and enabling required mode on `rhanka/h2a` and `rhanka/sentropic` after `.gitattributes` `merge=union` + `track reseal` (`question-c-concertation-opus-r2.md:65,81,95`).
     - **Interim State before `T` (`D'ici là`)**: `not covered` in code; procedural control by the conductor (`question-c-concertation-opus-r2.md:65`).

### 4.2 Applicability Matrix (`isSpecPinRequiredForItem`)

Per `OWNER-DECISIONS-2026-10-30.md:23,26` and `question-c-concertation-opus-r2.md:38-47,64`, applicability across item kinds, roles, and stock cohorts is:

| Item Cohort (`question-c-concertation-opus-r2.md:39-47,64`) | Absent Pin (`candidate == null`) | Invalid Declared Pin | Validator Status When No Valid Pin/Exempt |
|---|---|---|---|
| `feature` leaf (`kind === 'feature'` and `role === undefined`) with first trigger (`spec.transition -> 'specified'` or `realization.transition -> 'in-progress'`) at `event.at >= T` (includes the `191` `to-do` `feature` leaves) | Manual `dependency` blocker at next report (`blocked`, `AWAITED`), then merge blocked at PR merge | Manual `dependency` blocker at next report (`blocked`, `AWAITED`), then merge blocked at PR merge | `'refused'` (with `SpecPinRefusalCode`) |
| Named re-anchored items at `T`: `01M515G0RZX0Y9QB40AW2EF2X6` (`chore` leaf in `h2a`) and `01M57NGBMBM58YEFSS6MS5Y54Y` (`feature` leaf in `engram`) | Re-anchored by name at `T` (with blocker opened at `T` if unpinned), then merge blocked at PR merge | Blocker at report, then merge blocked at PR merge | `'refused'` (until re-anchored pin resolves) |
| Legacy `in-progress` `feature` leaf (`41` items in `in-progress` before `T` with no new trigger at/after `T`, not in re-anchored set) | List-only (`liste seule`) | List-only (`liste seule`) | `'legacy-list-only'` (never blocks merge) |
| `bug`, `chore` (not in re-anchored set), `defect` leaf | Nothing (`Rien`) | List-only (`Liste seule`) | `'not-applicable'` (or `'invalid-optional-pin-list-only'` if a malformed pin was voluntarily attached; never blocks merge) |
| Container (`role` in `'workpackage' \| 'spec-phase' \| 'stream'`), even with `kind === 'feature'` | Nothing (`Rien`) | List-only (`Liste seule`) | `'not-applicable'` (or `'invalid-optional-pin-list-only'`; never blocks merge) |
| `decision` (`kind === 'decision'`, `specStatus === 'n/a'`) | `N-A` | `N-A` | `'not-applicable'` |

### 4.3 Spec-Pin & Spec-Exempt Input Shapes

```typescript
/**
 * Proposed in src/request-lifecycle/spec-pin-validator.ts (proposed, not yet in code).
 */
export interface SpecPinCandidate {
  readonly mode: 'pin';
  readonly repository: string;
  readonly path: string;
  readonly sha256: string;
}

export interface SpecExemptCandidate {
  readonly mode: 'spec-exempt';
  /**
   * Sourced from C commune (OWNER-DECISIONS-2026-10-30.md:23; question-c-concertation-opus-r2.md:55,59):
   * a spec-exempt link carrying a non-empty reason ("un lien spec-exempt portant un motif").
   */
  readonly exemptReason: string;
}

export type SpecPinOrExemptInput = SpecPinCandidate | SpecExemptCandidate | null | undefined;

export interface SpecPinValidationRequest {
  readonly itemId: string;
  readonly itemKind: 'feature' | 'bug' | 'chore' | 'decision' | 'defect';
  readonly itemRole?: 'workpackage' | 'spec-phase' | 'stream';
  /**
   * Timestamp of the first triggering transition (spec.transition -> 'specified'
   * or realization.transition -> 'in-progress') at or after cutoffTimestampT, if any.
   */
  readonly triggerEventAt?: string;
  readonly cutoffTimestampT: string; // ISO-8601 timestamp T
  readonly targetCommitOid: string; // 40-hex Git commit OID against which the blob is verified
  readonly candidate: SpecPinOrExemptInput;
}
```

### 4.4 Validation Rules & Refusal Codes (`SpecPinRefusalCode` — `proposed, not yet in code`)

Every refusal code below is a `proposed, not yet in code` symbol of `request-lifecycle@1` (governed under `D1` versions-plus-correspondences, not a pre-existing G0 error code). No unsourced character-length threshold, approver rule, repository regex, or extra path ban beyond `.graphify/scratch/**` is enforced by the validator (all such policy refinements are recorded as open questions `OQ-4` and `OQ-6` in §9.1):

```typescript
/**
 * Proposed refusal codes for IF-3 (proposed, not yet in code).
 * Every code maps 1:1 to a sourced requirement in OWNER-DECISIONS-2026-10-30.md:23
 * and question-c-concertation-opus-r2.md:55,59.
 */
export type SpecPinRefusalCode =
  | 'PIN_MISSING'
  | 'PIN_REPOSITORY_MISSING'
  | 'PIN_PATH_MISSING'
  | 'PIN_PATH_SCRATCH_FORBIDDEN'
  | 'PIN_SHA256_INVALID'
  | 'PIN_BLOB_NOT_COMMITTED'
  | 'PIN_SHA256_MISMATCH'
  | 'EXEMPT_REASON_MISSING';

export type SpecPinValidationStatus =
  | 'valid-pin'
  | 'valid-exempt'
  | 'not-applicable'
  | 'legacy-list-only'
  | 'invalid-optional-pin-list-only'
  | 'refused';

export interface SpecPinValidationResult {
  readonly itemId: string;
  readonly status: SpecPinValidationStatus;
  readonly refusalCode?: SpecPinRefusalCode;
  readonly refusalMessage?: string;
  readonly normalizedPin?: {
    readonly repository: RepositorySlug;
    readonly path: string;
    readonly sha256: string;
    readonly commitOid: string;
    readonly blobOid: string;
  };
  readonly normalizedExempt?: {
    readonly exemptReason: string;
  };
}
```

#### 4.4.1 Exact Deterministic Evaluation Steps

Given `req: SpecPinValidationRequest` and `gitReader: GitTreeBlobReader`:

1. **Determine Cohort Applicability**:
   - Let `isReanchored = req.itemId === '01M515G0RZX0Y9QB40AW2EF2X6' || req.itemId === '01M57NGBMBM58YEFSS6MS5Y54Y'`.
   - Let `isFeatureLeaf = req.itemKind === 'feature' && req.itemRole === undefined` (per `isRoleContainer` in `sources/track-origin-main/packages/track/src/model/item.ts:155-157`).
   - If `!isReanchored && !isFeatureLeaf`:
     - If `req.itemKind === 'decision'` or `req.candidate === null || req.candidate === undefined`, return `{ itemId: req.itemId, status: 'not-applicable' }`.
     - If `req.candidate` is present on a `bug`, `chore`, `defect`, or container item (`question-c-concertation-opus-r2.md:43-44`), evaluate candidate validity (Steps 2–3 below): if valid, return `'valid-pin'` or `'valid-exempt'`; if invalid, return `{ itemId: req.itemId, status: 'invalid-optional-pin-list-only', refusalCode, refusalMessage }` (listed in the report, never blocks merge).
   - If `!isReanchored && isFeatureLeaf`:
     - If `req.triggerEventAt === undefined || req.triggerEventAt < req.cutoffTimestampT`, return `{ itemId: req.itemId, status: 'legacy-list-only' }` (`question-c-concertation-opus-r2.md:30,47,64`).
2. **Candidate Presence Check (when subject to the rule)**:
   - If `req.candidate === null || req.candidate === undefined` $\rightarrow$ return `{ itemId: req.itemId, status: 'refused', refusalCode: 'PIN_MISSING', refusalMessage: 'Feature leaf requires a resolved spec pin (repository, path, sha256) or a reasoned spec-exempt' }`.
3. **Branch A — When `req.candidate.mode === 'spec-exempt'`**:
   - Let `reason = req.candidate.exemptReason.trim()` (matching Track's standard non-empty text check `typeof v === 'string' && v.trim().length > 0` in `sources/track-origin-main/packages/track/src/model/item.ts:335` and `src/model/report-status.ts:77`).
   - If `reason.length === 0` $\rightarrow$ return `{ itemId: req.itemId, status: 'refused', refusalCode: 'EXEMPT_REASON_MISSING', refusalMessage: 'spec-exempt requires a non-empty reason' }`.
   - Otherwise $\rightarrow$ return `{ itemId: req.itemId, status: 'valid-exempt', normalizedExempt: { exemptReason: reason } }`.
4. **Branch B — When `req.candidate.mode === 'pin'`**:
   - **Step B1 (`PIN_REPOSITORY_MISSING`)**: Let `repository = req.candidate.repository.trim()`. If `repository.length === 0` $\rightarrow$ refuse with `PIN_REPOSITORY_MISSING` (`"Spec pin requires a non-empty repository identifier"`).
   - **Step B2 (`PIN_PATH_MISSING`)**: Let `rawPath = req.candidate.path.trim()`. Normalize POSIX relative path (strip leading `./`). If `rawPath.length === 0` $\rightarrow$ refuse with `PIN_PATH_MISSING` (`"Spec pin requires a non-empty repository-relative path"`).
   - **Step B3 (`PIN_PATH_SCRATCH_FORBIDDEN`)**: If `path === '.graphify/scratch' || path.startsWith('.graphify/scratch/') || path.includes('/.graphify/scratch/')` $\rightarrow$ refuse with `PIN_PATH_SCRATCH_FORBIDDEN` (`"Spec pin path must be outside .graphify/scratch/**"` per `OWNER-DECISIONS-2026-10-30.md:23` and `question-c-concertation-opus-r2.md:59`).
   - **Step B4 (`PIN_SHA256_INVALID`)**: Let `expectedSha256 = req.candidate.sha256.trim().toLowerCase()`. If `!/^[0-9a-f]{64}$/.test(expectedSha256)` $\rightarrow$ refuse with `PIN_SHA256_INVALID` (`"Spec pin sha256 must be a 64-character lowercase hexadecimal SHA-256 digest"`).
   - **Step B5 (`PIN_BLOB_NOT_COMMITTED`)**: Call `gitReader.readCommittedBlob({ repository, commitOid: req.targetCommitOid, path })`. If `null` (file does not exist as a committed blob in the tree of `targetCommitOid`) $\rightarrow$ refuse with `PIN_BLOB_NOT_COMMITTED` (`"Spec file is not a committed blob at targetCommitOid"` per `OWNER-DECISIONS-2026-10-30.md:23`).
   - **Step B6 (`PIN_SHA256_MISMATCH`)**: Compare `blob.contentSha256.toLowerCase()` with `expectedSha256`. If they differ $\rightarrow$ refuse with `PIN_SHA256_MISMATCH` (`"Committed blob sha256 does not match pinned sha256"`).
   - **Step B7 (`valid-pin`)**: Return `{ itemId: req.itemId, status: 'valid-pin', normalizedPin: { repository, path, sha256: expectedSha256, commitOid: req.targetCommitOid, blobOid: blob.blobOid } }`.

---

## 5. Data Feeding the GitHub Cards (`A1`)

### 5.1 Strict Ownership Split (`A1`)

Per `OWNER-DECISIONS-2026-10-30.md:9` (`A1`: *"GitHub cards are a read-only board reflecting committed request state; Track is the only writer"*) and `BRIEF-request-lifecycle-spec.md:24`:

- **Engram's Responsibility (Read-Only Vocabulary & Enrichment Inputs)**:
  1. Publish the `request-lifecycle@1` ontology profile and correspondences (§1–§2), including the 7-stage `RequestLifecycleStage` vocabulary (`spec`, `dev`, `pr`, `review`, `merged`, `published`, `deployed`) and `normalizeRequestLifecycleStage`.
  2. Expose a pure read-only projection helper `buildRequestCardEnrichment(input)` (`proposed, not yet in code`) that takes a Track item's state, its spec citation(s), and `baselineCommit`, and returns the engram-side enrichment fields (`specPinValidation`, `worstDriftCategory`, `normalizedStage`, `reportStageDeprecatedAliasUsed`, `ontologyCoordinate: 'request-lifecycle@1'`).
- **Track / H2A / GitHub Responsibility (External Interface — NOT Engram Work)**:
  - Track is the sole writer of `.track/events.jsonl` and the sole source of item state (`OWNER-DECISIONS-2026-10-30.md:9`).
  - Synchronizing or projecting committed Track state (`ReportRow` / `ReportItemFacts` in `sources/track-origin-main/packages/track/src/report/build.ts:35-87,127-138`) + Engram enrichment onto GitHub Projects v2 cards (such as project `PVT_kwHOAXQtFM4Bjok_` observed in `.graphify/scratch/design/request-lifecycle/sources/gh__projects.txt:1`) is an external interface owned by `Track/H2A` (see §7, Interface `IF-5`). Until `IF-5` is built (`not covered` in code today), the Track report alone carries the `blocked` / `AWAITED` signal (`question-c-concertation-opus-r2.md:98`; `question-c-concertation-argon-r3.md:8`).

### 5.2 Engram Read-Only Card Enrichment DTO (`RequestCardEnrichmentDto`)

```typescript
/**
 * Proposed in src/request-lifecycle/card-enrichment.ts (proposed, not yet in code).
 * Pure read-only projection input consumed by Track/GitHub board projector.
 */
export interface RequestCardEnrichmentInput {
  readonly itemId: string;
  readonly itemKind: 'feature' | 'bug' | 'chore' | 'decision' | 'defect';
  readonly itemRole?: 'workpackage' | 'spec-phase' | 'stream';
  readonly rawReportStage?: string;
  readonly rawReportStatus?: string;
  readonly baselineCommit: string; // 40-hex
  readonly cutoffTimestampT: string; // ISO-8601
  readonly triggerEventAt?: string; // ISO-8601
  readonly specCandidate?: SpecPinOrExemptInput;
  readonly decisionMemories?: readonly DecisionMemoryDriftInput[];
}

export interface RequestCardEnrichmentDto {
  readonly ontologyCoordinate: 'request-lifecycle@1';
  readonly itemId: string;
  /**
   * Normalized via normalizeRequestLifecycleStage; undefined when rawReportStage is absent or
   * unrecognized (matching Track normalizeReportStage semantics in model/report-status.ts:26-30).
   */
  readonly normalizedStage?: RequestLifecycleStage;
  readonly reportStageDeprecatedAliasUsed: boolean;
  readonly specPinValidation: SpecPinValidationResult;
  readonly worstDriftCategory: MemorySpecDriftCategory | 'not-applicable';
}
```

---

## 6. Re-Anchoring of Existing Items (`01M515G0RZX0Y9QB40AW2EF2X6` and `01M57NGBMBM58YEFSS6MS5Y54Y`)

### 6.1 Verified State of the Two Items in `.track/events.jsonl`

Per `.graphify/scratch/design/request-lifecycle/REFERENCES-existing-request.md:1-16`, `question-c-concertation-opus-r2.md:27-28,79,117` (R8), and direct reads of `/home/antoinefa/src/h2a/.track/events.jsonl` and `/home/antoinefa/src/graphify/.track/events.jsonl`:

| Field | Item 1 (`h2a`) | Item 2 (`engram` / `graphify`) |
|---|---|---|
| **`aggregateId` (ULID)** | `01M515G0RZX0Y9QB40AW2EF2X6` | `01M57NGBMBM58YEFSS6MS5Y54Y` |
| **Repository & Journal File:Line** | `rhanka/h2a` — `/home/antoinefa/src/h2a/.track/events.jsonl:1549-1550,2339` (working copy; `0` commits on local/remote refs per `question-c-concertation-opus-r2.md:79,117`) | `rhanka/engram` — `/home/antoinefa/src/graphify/.track/events.jsonl:456` (working copy; `0` commits on local/remote refs per `question-c-concertation-opus-r2.md:79,117`) |
| **`parentId` (Workpackage)** | `01M515ED3S5WVMD3GVQ6E9WM5G` (`"Demandes owner (registre : label + phrase exacte)"`, `kind: "chore"`, `role: "workpackage"`, line `1518`) | `01M57NGAZRTDER493T0C15CVQX` (`"WP9 Ontology guardianship (engram guardian of all ontologies)"`, `kind: "feature"`, `role: "workpackage"`, line `453`) |
| **`title`** | `"Registre des demandes : label explicite et phrase exacte"` | `"Dev ontology: PR/branches/lifecycle requested by h2a; Track externalizes its own ontology to engram"` |
| **`kind` / `role`** | `kind: "chore"`, `role: undefined` (leaf) | `kind: "feature"`, `role: undefined` (leaf) |
| **Created `at` / `id` / `contentHash`** | `at: "2026-10-16T01:33:46.656Z"`, `id: "01M515G0S018B4DBP8FW3RMC9M"`, `contentHash: "sha256:6c65a623ab9c129341d0039e4852d693bad0b2c201ec9dc103dbbb459c6a294c"` | `at: "2026-10-18T14:09:01.581Z"`, `id: "01M57NGBMDDTMDQVHS820GA0EC"`, `contentHash: "sha256:83d78ae4c666b2ddf30d1474502323fc9db4e5977eaa46921c470954022d0ff9"` |
| **Verbatim `body`** | `"Phrases owner : « il faut pouvoir associer un label clair aux demandes, savoir retrouver le littéral exact, les branches, les version, etc... on avait envisageer d'utiliser graphify/engram pour ca » (14/10) ; « il faut faire des efforts et mobiliser le track report quand je fais des demande de status, sans que ca prenne des plombes » (14/10) ; « tu mets un label explicite, et il faut la référence a ma phrase. d'ailleurs j,avais demander un model engram pour la gestion des demandes... il doit être dans track » (15/10). Ce workpackage. Modèle engram de gestion des demandes : à retrouver (source-gap)."` | `"Dev ontology (PR, branches, merge/deploy lifecycle, statuses, demand/WP categories, velocity reference) held by engram and consumed by h2a; Track must externalize its ontology to engram as well; no French identifiers (owner refused 'mergé'/'déployé')."` |
| **Current Folded State** | `realization: "in-progress"` (line `1550`), `report.stage.value: "dev"`, `report.status: "not-qualified"` (line `2339`), `links: undefined`, `engagementRef: undefined` | `realization: "to-do"`, `specStatus: "to-specify"`, `links: undefined`, `engagementRef: undefined` |

### 6.2 Engram-Side Re-Anchoring Data vs Track-Side Procedure

Per `OWNER-DECISIONS-2026-10-30.md:26`, `question-c-concertation-opus-r2.md:27-28,64,79`, and `BRIEF-request-lifecycle-spec.md:25`:

1. **Engram-Side Data (Specified & Shipped by Engram)**:
   - Engram commits this specification to `spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md` (`E1`), producing a committed Git blob with a deterministic `sha256` at commit OID `C_spec`.
   - Engram exports `REANCHORED_REQUEST_LIFECYCLE_ITEMS` in `src/request-lifecycle/reanchor-manifest.ts` (`proposed, not yet in code`) containing the static, machine-readable anchor records for both ULIDs:

```typescript
/**
 * Proposed in src/request-lifecycle/reanchor-manifest.ts (proposed, not yet in code).
 */
export interface ReanchorItemManifestEntry {
  readonly itemId: '01M515G0RZX0Y9QB40AW2EF2X6' | '01M57NGBMBM58YEFSS6MS5Y54Y';
  readonly hostRepository: 'rhanka/h2a' | 'rhanka/engram';
  readonly parentWorkpackageId: '01M515ED3S5WVMD3GVQ6E9WM5G' | '01M57NGAZRTDER493T0C15CVQX';
  readonly counterpartItemId: '01M57NGBMBM58YEFSS6MS5Y54Y' | '01M515G0RZX0Y9QB40AW2EF2X6';
  readonly ontologyCoordinate: 'request-lifecycle@1';
  readonly specPinTarget: {
    readonly repository: 'rhanka/engram';
    readonly path: 'spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md';
    /** Computed from the committed Git blob of spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md at publication T. */
    readonly sha256: string;
  };
  readonly ownerQuotes: readonly {
    readonly quote: string;
    readonly date: string;
  }[];
}
```

   - Why both items are named explicitly in `isSpecPinRequiredForItem` (§4.2):
     - `01M515G0RZX0Y9QB40AW2EF2X6` is a `chore` already in `in-progress` since `2026-10-16` (`question-c-concertation-opus-r2.md:27`), so it would otherwise miss both the `feature` filter and the `to-do` future-transition trigger.
     - `01M57NGBMBM58YEFSS6MS5Y54Y` is a `feature` at `to-specify` / `to-do` with zero transitions (`question-c-concertation-opus-r2.md:28`), so naming it at `T` forces immediate re-anchoring (and blocker opening until pinned) at `T` without waiting for a transition.

2. **Track-Side Procedure (External Interface — Owned by `Track/H2A`, `IF-6`)**:
   - Because `ItemState.links` in `sources/track-origin-main/packages/track/src/state/fold.ts:155,194,509` is currently populated only at creation (`item.created`, `decision.created`, `demand.raised`) and no additive event in `EVENT_TYPES` (`sources/track-origin-main/packages/track/src/events/types.ts:19-111`) appends a `Link` to an existing item (`question-c-concertation-opus-r2.md:31,65,114`), `Track/H2A` owns adding the additive link-addition event and CLI/MCP command, committing the working-copy journal entries for `01M515G0RZX0Y9QB40AW2EF2X6` and `01M57NGBMBM58YEFSS6MS5Y54Y` into Git (`question-c-concertation-opus-r2.md:79`), and attaching the `specPinTarget` at `T` (see §7, Interface `IF-6`).

---

## 7. Interface Ownership Table

Per `BRIEF-request-lifecycle-spec.md:14,29`, `OWNER-DECISIONS-2026-10-30.md:20-30`, and `question-c-concertation-opus-r2.md:57-65`, every boundary between `engram`, `Track/H2A`, `CI`, and `sentropic` is enumerated below with a single authoritative owner. Engram implements **only** rows where `Owner === 'engram'`.

| Interface ID | Interface Name | Producer / Provider | Consumer(s) | Owner | Contract Summary, Prerequisites & Interim State |
|---|---|---|---|---|---|
| `IF-1` | `request-lifecycle@1` Ontology Profile, Stage Normalizer & Digest | `engram` (`profiles/request-lifecycle/1/{profile.json,correspondences.json}`, `src/request-lifecycle/stage-normalizer.ts`, `src/ontology-guardian/catalog.ts`) | `Track/H2A`, `sentropic`, `engram` | **`engram`** | Governed under G0 (`SPEC-G0-guardian-contracts.md:127-215,363-415`); English-only identifiers; explicit correspondences (`D1`) to `sources/track-origin-main/`; exports `normalizeRequestLifecycleStage` (`undefined` on unknown); committed spec at `spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md` (`E1`). |
| `IF-2` | Memory↔Spec Drift Report (`evaluateMemorySpecDrift`) | `engram` (`src/request-lifecycle/drift-report.ts` — `proposed`) | `Track/H2A` conductors (at status report, PR, and branch close), owner dossiers | **`engram`** | Read-only at a named `baselineCommit`; outputs the 4 `C commune` categories (`matching`, `drifted-since-citation`, `decision-memory-without-committed-spec`, `spec-cited-from-uncommitted-or-scratch-path`) + 3 informational list-only counters (`OWNER-DECISIONS-2026-10-30.md:22`; `question-c-concertation-opus-r2.md:59-60,83`). |
| `IF-3` | Deterministic Spec-Pin Validator (`validateSpecPin`) | `engram` (`src/request-lifecycle/spec-pin-validator.ts` — `proposed`) | `Track/H2A` (`branch-lifecycle`, conductor report), `CI` merge check | **`engram`** | Pure check reading the **pin** (not the blocker): validates `(repository, path, sha256)` against committed Git blob at `targetCommitOid` outside `.graphify/scratch/**`, or non-empty reasoned `spec-exempt` (`OWNER-DECISIONS-2026-10-30.md:23-24`; `question-c-concertation-opus-r2.md:59,62,71`). |
| `IF-4` | GitHub Card Read-Only Enrichment Input (`buildRequestCardEnrichment`) & Re-Anchor Manifest | `engram` (`src/request-lifecycle/card-enrichment.ts`, `src/request-lifecycle/reanchor-manifest.ts` — `proposed`) | `Track/H2A` GitHub board projector & re-anchoring flow | **`engram`** | Pure projection of `request-lifecycle@1` `normalizedStage`, `specPinValidation`, `worstDriftCategory`, and static anchor data for `01M515G0RZX0Y9QB40AW2EF2X6` and `01M57NGBMBM58YEFSS6MS5Y54Y` (`A1`, `BRIEF-request-lifecycle-spec.md:24-25`). |
| `IF-5` | GitHub Projects v2 Read-Only Board Sync (`A1`) | `Track/H2A` | GitHub Projects v2 (`PVT_kwHOAXQtFM4Bjok_` and repo boards) | **`Track/H2A`** | Reads committed `.track/events.jsonl` state + `IF-4` enrichment and updates GitHub Project cards one-way; Track remains the sole writer (`A1`, `OWNER-DECISIONS-2026-10-30.md:9`). Current status: `not covered` in code; Track report carries the `blocked` / `AWAITED` signal in the interim (`question-c-concertation-opus-r2.md:98`). |
| `IF-6` | Additive Link Event, PR ↔ Item Link, Journal on PR & Re-Anchoring at `T` | `Track/H2A` (new additive event in `src/events/types.ts` & `src/state/fold.ts` + CLI/MCP verb) | `.track/events.jsonl` in `engram`, `h2a`, `sentropic` | **`Track/H2A`** | Because `links` is only written on creation (`sources/track-origin-main/packages/track/src/state/fold.ts:155,194,509`), adds an additive link-addition event (`événement additif d'ajout de lien`), records PR ↔ item links (`lien PR ↔ item`), ensures the `.track` journal is present on the PR (`journal présent sur la PR`), commits and pins `01M515G0RZX0Y9QB40AW2EF2X6` and `01M57NGBMBM58YEFSS6MS5Y54Y` at `T` (`question-c-concertation-opus-r2.md:31,64-65,79`; `OWNER-DECISIONS-2026-10-30.md:26,29`). Current status before `T`: `not covered`. |
| `IF-7` | Missing-Pin Soft Blocker Opening at Next Report | `Track/H2A` conductor (at first status report after transition) | `.track/events.jsonl` (`blocker.opened`) | **`Track/H2A`** | At the first report after a `feature` leaf moves to `specified` or `in-progress` (at/after `T`) without a valid pin or `spec-exempt`, opens a `dependency` blocker with `resolutionRule: 'manual'` (`sources/track-origin-main/packages/track/src/model/blocker.ts:4-5`), deriving report `status: 'blocked'` (`src/report/stage-status.ts:233-234`) and bucket `'AWAITED'` (`src/report/buckets.ts:25`) with zero refused transition (`OWNER-DECISIONS-2026-10-30.md:23`; `question-c-concertation-opus-r2.md:61,69-70`). Interim before `T`: procedural control by the conductor (`question-c-concertation-opus-r2.md:65`). |
| `IF-8` | Report Stage Reader/Writer Rollout (`review`, `published`) | `Track/H2A` (`src/model/report-status.ts:9`, `src/report/stage-status.ts:57-63`, `src/report/stage-status-lexicon.ts`) & `sentropic` | `Track/H2A`, `sentropic`, `engram` | **`Track/H2A`** (with **`sentropic`** for Sentropic UI readers) | Ships stage readers accepting `'review'` and `'published'` first, then writers, without withdrawing any persisted value (`B1`, `OWNER-DECISIONS-2026-10-30.md:10`). Current status in `sources/track-origin-main/`: `not covered`. |
| `IF-9` | Track Event-Containment Gate (`track events-contains`) & `merge=union` + `reseal` | `Track/H2A` (`sources/track-origin-main/packages/track/skills/branch-lifecycle/SKILL.md:15-28,42-62`, `assets/check.sh`, plus `.gitattributes` `merge=union` and `track reseal`) | Pre-merge workflow & CI on every PR carrying `.track` | **`Track/H2A`** | Enforces `events(post-merge real) ⊇ events(branch)` via `track events-contains` on every PR carrying `.track` (`question-c-concertation-opus-r2.md:59`). Requires `.gitattributes` `merge=union` + `track reseal` (currently `not covered` in code per `SKILL.md:18-22` and `question-c-concertation-opus-r2.md:65,81,119`) before enabling required CI mode on `h2a` and `sentropic`. |
| `IF-10` | Spec-Pin Merge Check in `branch-lifecycle` | `Track/H2A` (`packages/track/skills/branch-lifecycle/`) | Agent / conductor merge & branch-close workflow | **`Track/H2A`** | Distinct from the `events-contains` containment gate (`IF-9`): invokes `engram` `IF-3` (`validateSpecPin` / `graphify request-lifecycle check`) on the PR's linked `feature` leaves at merge / branch-close time, reading the **pin** and not the blocker (`OWNER-DECISIONS-2026-10-30.md:24`; `question-c-concertation-opus-r2.md:60,62`). Current status before `T`: `not covered`, procedural control by the conductor (`question-c-concertation-opus-r2.md:65`). |
| `IF-11` | Required CI Merge Job, Track Installation in CI & Branch Protection | `CI` (GitHub Actions in `engram` pilot first, then `h2a` and `sentropic`) | GitHub PR merge protection (`enforce_admins` active per `question-c-concertation-opus-r2.md:53,120`) | **`CI`** | Prerequisites: (1) Track installed in CI (`Track installé`, currently absent from `engram` `.github/workflows/typescript-ci.yml` per `question-c-concertation-opus-r2.md:65,119`), (2) `.track` journal present on the PR and PR ↔ item link (`IF-6`), (3) branch protection wiring the required job (`protection de branche`). Enforces `IF-9` (`track events-contains` on PRs carrying `.track`) and `IF-3` (`validateSpecPin` on linked `feature` leaves) as a required merge check: piloted on `rhanka/engram` first, then `rhanka/h2a` and `rhanka/sentropic` after `merge=union` + `reseal` (`OWNER-DECISIONS-2026-10-30.md:24,30`; `question-c-concertation-opus-r2.md:60,65,81`). Interim before `T`: `not covered`, procedural control by the conductor (`question-c-concertation-opus-r2.md:65`). |

---

## 8. Test-First Implementation Lots & Acceptance Fixtures

All implementation work in `rhanka/engram` is structured into five test-first TypeScript lots (`RLO-L1` through `RLO-L5`, `proposed, not yet in code`). Every lot requires red-to-green Vitest tests before implementation code is merged, and after modifying code files `npx graphify hook-rebuild` must be run per `AGENTS.md`.

### 8.1 Lot Breakdown (Engram Only)

> « Amendment A1 » — the `RLO-L1` row below and the `F1`/`F3` rows in §8.2 are replaced per the round-3 binding design note (`DESIGN-NOTE-rlo-g0-binding.md`, sha256 `a503789494fcbd8813fd005607f4596fcdba480975ae56f47278d43089125667`).

| Lot ID (`proposed`) | Title | Target Files & Entry Points in `rhanka/engram` (`proposed`) | Prerequisite Lots | Test-First Acceptance Fixtures |
|---|---|---|---|---|
| **`RLO-L1`** | `request-lifecycle@1` Profile, Mapping, Stage Normalizer & Registration | `profiles/request-lifecycle/1/profile.json`, `profiles/request-lifecycle/1/engram-mapping.json`, `src/request-lifecycle/stage-normalizer.ts` (already committed, `8c456781`), `src/request-lifecycle/registry.ts`, `spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md`, `tests/request-lifecycle-ontology.test.ts` | G0 (`ONT-G0`) | `F1`, `F2`, `F3` |
| **`RLO-L2`** | Deterministic Spec-Pin & Spec-Exempt Validator | `src/request-lifecycle/spec-pin-validator.ts`, `tests/spec-pin-validator.test.ts` | `RLO-L1` | `F4`, `F5`, `F6`, `F7`, `F8` |
| **`RLO-L3`** | Read-Only Memory↔Spec Drift Report at `baselineCommit` | `src/request-lifecycle/drift-report.ts`, `tests/request-lifecycle-drift-report.test.ts` | `RLO-L1`, `RLO-L2` | `F9`, `F10` |
| **`RLO-L4`** | GitHub Card Read-Only Enrichment Projection & Re-Anchor Manifest | `src/request-lifecycle/card-enrichment.ts`, `src/request-lifecycle/reanchor-manifest.ts`, `src/request-lifecycle/index.ts`, `tests/request-lifecycle-enrichment.test.ts` | `RLO-L1`, `RLO-L2`, `RLO-L3` | `F11`, `F12` |
| **`RLO-L5`** | Engram CLI Verification Surface (`graphify request-lifecycle check` & `drift-report`) | `src/request-lifecycle/cli-check.ts` (exporting `runRequestLifecycleCheckCli`), wired into `src/cli.ts` as subcommands `graphify request-lifecycle check` and `graphify request-lifecycle drift-report`, `tests/request-lifecycle-cli-check.test.ts` | `RLO-L2`, `RLO-L3`, `RLO-L4` | `F4`–`F12` bound to `runRequestLifecycleCheckCli` and `graphify request-lifecycle check` (`exitCode: 0` on `valid-pin` / `valid-exempt` / `not-applicable` / `legacy-list-only` / `invalid-optional-pin-list-only`; `exitCode: 1` on `refused`) |

### 8.2 Normative Acceptance Fixtures (`F1`–`F12`)

| Fixture ID | Lot | Input Scenario | Expected Deterministic Output |
|---|---|---|---|
| **`F1`** | `RLO-L1` | Load `profiles/request-lifecycle/1/profile.json` and `profiles/request-lifecycle/1/engram-mapping.json`; recompute the content digest with `digestOfPreimage` and the pins digest with `pinsDigestOf({layers: [REQUEST_LIFECYCLE_PIN]})`; call `checkAdmission` on the `TRK` entry without receipts. | Top-level keys are exactly `{id, version, owner, lifecycle, description, modules}` with `version: "1"`; `modules.track` declares all 7 entity types, all 12 relation types and all 18 axes including the 7 `requestLifecycleStages`; recomputed digests equal `REQUEST_LIFECYCLE_PIN.contentDigest` and `REQUEST_LIFECYCLE_PINS_DIGEST` (64 lowercase hex, `isDigest` true); a one-field mutation changes the recomputed digest; `checkAdmission` returns `{admitted: false, code: "missing-receipt", reason}` with a non-empty `reason`. The `{admitted: true}` path is not covered until a `family-corpus` receipt fixture exists (OQ-RL-6). |
| **`F2`** | `RLO-L1` | Call `normalizeRequestLifecycleStage` on `'spec'`, `'dev'`, `'pr'`, `'PR'`, `'review'`, `'merged'`, `'mergé'`, `'published'`, `'deployed'`, `'déployé'`, `'bogus-stage'`, and `undefined`. | Maps `'PR' -> 'pr'`, `'mergé' -> 'merged'`, `'déployé' -> 'deployed'`; maps the 7 canonical English stages 1:1; returns `undefined` for `'bogus-stage'` and `undefined` (matching Track's `normalizeReportStage` unknown contract in `sources/track-origin-main/packages/track/src/model/report-status.ts:26-30`) without throwing. |
| **`F3`** | `RLO-L1` | Call `composeApplicability("TRK")` (`src/ontology-guardian/diagnostics.ts:785-788`) and wrap the result with `refusedOutcome` (`src/ontology-guardian/diagnostics.ts:749-757`). | Returns exactly one diagnostic `{origin: "guardian", code: "operation-not-applicable", nativeCode: "operation-not-applicable", ruleId: null, subjectRef: "TRK", severity: "error", path: null, messageKey: "compose-not-offered"}`; `refusedOutcome` returns `{outcome: "refused", diagnostics: [that diagnostic]}`. No `composeOntologies` symbol is used: it does not exist in `src/`. |
| **`F4`** | `RLO-L2`, `RLO-L5` | `validateSpecPin` (and `graphify request-lifecycle check`) on a `feature` leaf (`role: undefined`) triggered at `event.at >= T` with `candidate: { mode: 'pin', repository: 'rhanka/engram', path: 'spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md', sha256: '<matching-64-hex>' }` where `gitReader` resolves the blob at `targetCommitOid`. | Returns `{ status: 'valid-pin', refusalCode: undefined, normalizedPin: { repository: 'rhanka/engram', path: 'spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md', sha256: '<matching-64-hex>', commitOid: targetCommitOid, blobOid: '<40-hex>' } }`; CLI `exitCode === 0`. |
| **`F5`** | `RLO-L2`, `RLO-L5` | `validateSpecPin` (and `graphify request-lifecycle check`) on a `feature` leaf triggered at `event.at >= T` with `path: '.graphify/scratch/design/request-lifecycle/SPEC-request-lifecycle-ontology.md'`. | Returns `{ status: 'refused', refusalCode: 'PIN_PATH_SCRATCH_FORBIDDEN' }`; CLI `exitCode === 1`. |
| **`F6`** | `RLO-L2`, `RLO-L5` | `validateSpecPin` (and `graphify request-lifecycle check`) on a `feature` leaf triggered at `event.at >= T` with: (a) `candidate: null`, (b) uncommitted path (`gitReader.readCommittedBlob` returns `null`), (c) committed blob whose `contentSha256` differs from `candidate.sha256`. | Returns deterministic refusals: (a) `PIN_MISSING`, (b) `PIN_BLOB_NOT_COMMITTED`, (c) `PIN_SHA256_MISMATCH`; CLI `exitCode === 1` for each. |
| **`F7`** | `RLO-L2`, `RLO-L5` | `validateSpecPin` (and `graphify request-lifecycle check`) on a `feature` leaf triggered at `event.at >= T` with `candidate: { mode: 'spec-exempt', exemptReason: 'D-054 closes obsolete PRs; no specification document applies' }`, vs `candidate: { mode: 'spec-exempt', exemptReason: '   ' }`. | Non-empty reason returns `{ status: 'valid-exempt', normalizedExempt: { exemptReason: 'D-054 closes obsolete PRs; no specification document applies' } }` (`exitCode === 0`); blank/whitespace-only reason returns `{ status: 'refused', refusalCode: 'EXEMPT_REASON_MISSING' }` (`exitCode === 1`). |
| **`F8`** | `RLO-L2`, `RLO-L5` | `validateSpecPin` (and `graphify request-lifecycle check`) on: (a) `kind: 'bug'` leaf with `candidate: null`, (b) `kind: 'chore'` leaf (not in `REANCHORED_ITEM_IDS_AT_T`) with `candidate: null`, (c) `kind: 'feature'` with `role: 'workpackage'`, (d) `kind: 'feature'` leaf whose last transition to `'in-progress'` was at `event.at < T` and not in `REANCHORED_ITEM_IDS_AT_T`, (e) `kind: 'bug'` leaf with an invalid pin (`PIN_BLOB_NOT_COMMITTED`). | Returns `status: 'not-applicable'` for (a), (b), (c); `status: 'legacy-list-only'` for (d); `status: 'invalid-optional-pin-list-only'` with `refusalCode: 'PIN_BLOB_NOT_COMMITTED'` for (e). CLI `exitCode === 0` for all five (never blocks merge). |
| **`F9`** | `RLO-L3`, `RLO-L5` | `evaluateMemorySpecDrift` (and `graphify request-lifecycle drift-report`) at `baselineCommit` over 4 synthetic decision memories: `M1` citing committed `spec/SPEC_A.md` with matching `sha256`; `M2` citing committed `spec/SPEC_B.md` whose blob at `baselineCommit` has a new `sha256`; `M3` with `citations: []`; `M4` citing `.graphify/scratch/design/draft.md`. | Classifies `M1 -> 'matching'`, `M2 -> 'drifted-since-citation'`, `M3 -> 'decision-memory-without-committed-spec'`, `M4 -> 'spec-cited-from-uncommitted-or-scratch-path'`; `countsByCategory` equals `{ matching: 1, 'drifted-since-citation': 1, 'decision-memory-without-committed-spec': 1, 'spec-cited-from-uncommitted-or-scratch-path': 1 }`; `entries` sorted in exact precedence order `[M4, M3, M2, M1]`; CLI `exitCode === 0`. |
| **`F10`** | `RLO-L3` | Verify that calling `evaluateMemorySpecDrift` performs zero writes and leaves the input memory array and mock `gitReader` state untouched. | Pure read-only execution; identical output on repeated invocations. |
| **`F11`** | `RLO-L4`, `RLO-L5` | Inspect `REANCHORED_REQUEST_LIFECYCLE_ITEMS` for `01M515G0RZX0Y9QB40AW2EF2X6` and `01M57NGBMBM58YEFSS6MS5Y54Y`, and run `validateSpecPin` on both items at `T` before and after attaching the committed `spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md` pin. | Both ULIDs match `/home/antoinefa/src/h2a/.track/events.jsonl:1549` and `/home/antoinefa/src/graphify/.track/events.jsonl:456` verbatim; before pin attachment both return `{ status: 'refused', refusalCode: 'PIN_MISSING' }` (`exitCode === 1`); after pin attachment both return `{ status: 'valid-pin' }` (`exitCode === 0`). |
| **`F12`** | `RLO-L4` | Run `buildRequestCardEnrichment` on item `01M515G0RZX0Y9QB40AW2EF2X6` (`rawReportStage: 'dev'`) and an item with legacy `rawReportStage: 'mergé'` and an item with `rawReportStage: 'bogus-stage'`. | Returns `RequestCardEnrichmentDto` with `ontologyCoordinate: 'request-lifecycle@1'`, `normalizedStage: 'dev'` (`reportStageDeprecatedAliasUsed: false`), `normalizedStage: 'merged'` (`reportStageDeprecatedAliasUsed: true` for `'mergé'`), and `normalizedStage: undefined` for `'bogus-stage'`. |

---

## 9. Open-Questions Register & Verification Register

### 9.1 Open-Questions Register (with Authoritative Owner)

| Question ID | Open Question | Impacted Interface | Authoritative Owner | Interim Rule / Fallback at Lot Start |
|---|---|---|---|---|
| **`OQ-1`** | In `@sentropic/track`, what exact additive event shape (`EVENT_TYPES` in `sources/track-origin-main/packages/track/src/events/types.ts:19-111`) and `Link` convention (`Link` in `src/model/item.ts:51-54`) will serialize a spec pin `(repository, path, sha256)` and a `spec-exempt` reason on an existing item? | `IF-3`, `IF-6` | **`Track/H2A`** | Engram's `validateSpecPin` (`IF-3`) accepts the normalized `SpecPinOrExemptInput` DTO (§4.3) and provides a pure parser helper extracting `SpecPinOrExemptInput` from `Link` entries (`kind: 'spec'` / `kind: 'spec-exempt'`) once `Track/H2A` freezes `IF-6`. |
| **`OQ-2`** | What is the exact ISO-8601 cutoff timestamp `T` (`cutoffTimestampT`) for joint publication of `request-lifecycle@1` and Track's link-addition command (`OWNER-DECISIONS-2026-10-30.md:26`; `question-c-concertation-opus-r2.md:31,64`)? | `IF-3`, `IF-6`, `IF-7` | **`Track/H2A` + `engram` conductors** | `cutoffTimestampT` is an explicit parameter in `SpecPinValidationRequest` (§4.3) and configured as a named constant once both PRs are ready to merge at `T`. Until `T`, the gate is `not covered` in code and enforced procedurally by the conductor (`question-c-concertation-opus-r2.md:65`). |
| **`OQ-3`** | How should cross-repository Git blob lookups (`gitReader.readCommittedBlob`) resolve when an item in `rhanka/h2a` or `rhanka/sentropic` pins a spec committed in `rhanka/engram` (e.g. `01M515G0RZX0Y9QB40AW2EF2X6` or `D-005` in `h2a` pinning `rhanka/engram:spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md` per `question-c-concertation-opus-r2.md:32` and §6.2)? | `IF-3`, `IF-10`, `IF-11` | **`CI` & `Track/H2A`** (transport) / **`engram`** (validator contract) | All three repositories (`rhanka/engram`, `rhanka/h2a`, `rhanka/sentropic`) are public (`question-c-concertation-opus-r2.md:32,121`); `validateSpecPin` accepts any `GitTreeBlobReader` implementation (local `git cat-file` for intra-repo pins, or multi-repo checkout / verified blob manifest in CI). |
| **`OQ-4`** | Beyond a non-empty `exemptReason` (`exemptReason.trim().length > 0`), should `spec-exempt` require a minimum reason length, a structured reason taxonomy, or an explicit approver actor (`exemptApprovedBy`)? | `IF-3`, `IF-7` | **Owner / `engram` + `Track/H2A`** | Interim rule in `validateSpecPin` (§4.4.1 Step 3): require a non-empty trimmed `exemptReason` only (`EXEMPT_REASON_MISSING` on empty/whitespace string), with zero unsourced length threshold or approver refusal. |
| **`OQ-5`** | In `@sentropic/track`, how should `EVIDENCE_LINK_STAGES`, `STAGE_RANK`, and `deriveItemStageStatus` (`sources/track-origin-main/packages/track/src/report/stage-status.ts:57-63,127-259`) rank and require evidence for the two new `B1` stages `'review'` and `'published'` (`src/model/report-status.ts:9,112`)? | `IF-1`, `IF-8` | **`Track/H2A`** | Currently `not covered` in `sources/track-origin-main/packages/track/src/model/report-status.ts:9`. Under `B1` (`OWNER-DECISIONS-2026-10-30.md:10`), Engram's `normalizeRequestLifecycleStage` (§2.3) already reads `'review'` and `'published'` in rank order `spec < dev < pr < review < merged < published < deployed` while `Track/H2A` specifies the writer evidence rules in `IF-8`. |
| **`OQ-6`** | Should `validateSpecPin` enforce additional constraints on `repository` format (e.g. `<owner>/<repo>` slug allowlist), `path` prefixes (e.g. requiring `spec/**` under `E1` in addition to forbidding `.graphify/scratch/**`), or `sha256:` prefix tolerance (matching Track `Sha256` in `sources/track-origin-main/packages/track/src/events/types.ts:7`)? | `IF-3` | **Owner / `engram`** | Interim rule in `validateSpecPin` (§4.4.1 Step 4): enforce only the sourced requirements from `OWNER-DECISIONS-2026-10-30.md:23` (`repository` non-empty, `path` non-empty and outside `.graphify/scratch/**`, `sha256` `64-hex` matching the committed Git blob at `targetCommitOid`). |

### 9.2 Register of `unverified` & `not covered` Points

Every point that could not be directly verified from the local read-only files or that is not yet implemented in `sources/track-origin-main/` is recorded below using only the canonical factual status terms (`unknown`, `unverified`, `partial`, `not covered`):

| ID | Point | Status | Reason & Citation |
|---|---|---|---|
| **`UV-1`** | Track `@sentropic/track@0.98.7` (`rhanka/h2a` `origin/main@9ea4db7c5`) model, event, fold, report, and `branch-lifecycle` sources (`packages/track/src/{model,events,state,report}/**`, `SPEC.md`, `INTENTION.md`, `skills/branch-lifecycle/SKILL.md`). | Verified from extracted snapshot (`partial` for `src/accept/status.ts` and `skills/branch-lifecycle/assets/check.sh`) | Directly read and verified from `.graphify/scratch/design/request-lifecycle/sources/track-origin-main/packages/track/`. `src/accept/status.ts` and `skills/branch-lifecycle/assets/check.sh` are not included in the `sources/track-origin-main/` extraction directory; their contracts are verified via `sources/track-origin-main/packages/track/src/model/acceptance.ts:6-9`, `docs/spec/SPEC.md:140-149`, `skills/branch-lifecycle/SKILL.md:48-62`, and `question-c-concertation-opus-r2.md:119`. |
| **`UV-2`** | Direct working-tree file read of `spec/SPEC_MEMORY_FINALIZATION.md`, `src/ontology-guardian/types.ts`, `src/ontology-guardian/catalog.ts`, and `engram-memory/contracts/index.ts` on `rhanka/engram` `origin/main@86dd6c53`. | `unverified` | Present on `origin/main@86dd6c53` (SHA-256 digests recorded in `DOSSIER-decision-demandes.html:657-661`), but absent from the local working tree checkout without running `git`. Verified against `SPEC-G0-guardian-contracts.md:1-1491`. |
| **`UV-3`** | Canonical SHA-256 digest (`sha256:<64-hex>`) of `profiles/request-lifecycle/1/{profile.json, correspondences.json}` and blob SHA-256 of `spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md`. | `unverified` | Files are specified by this document (`proposed, not yet in code`) and their SHA-256 digests will be computed deterministically by `computeOntologyCanonicalDigest` and `git hash-object` when `RLO-L1` is written. |
| **`UV-4`** | Live GitHub Projects v2 field schema for board `PVT_kwHOAXQtFM4Bjok_` beyond `.graphify/scratch/design/request-lifecycle/sources/gh__projects.txt:1`. | `unverified` | Only the 1-line summary (`3\tRadar immobilier — Kanban livraison\topen\tPVT_kwHOAXQtFM4Bjok_`) is present in local pre-extracted sources; board projection is owned by `Track/H2A` (`IF-5`, currently `not covered` in code). |
| **`NC-1`** | `B1` report stages `'review'` and `'published'`, additive link-addition event (`IF-6`), `.gitattributes` `merge=union` + `track reseal` (`IF-9`), and required CI spec-pin merge check (`IF-11`). | `not covered` | Not yet present in `sources/track-origin-main/packages/track/` or repository workflows (`question-c-concertation-opus-r2.md:15,17,31,65,81`); tracked under interfaces `IF-6` through `IF-11` and open questions `OQ-1` through `OQ-6`, with procedural control by the conductor until `T` (`question-c-concertation-opus-r2.md:65`). |

## Annex R2 — Conductor resolutions of the round-2 MINOR findings (binding on implementers)

Source: request-spec-review-wonder-r2.out (VERDICT: SOLID). These four resolutions are part of this spec. Each one takes precedence over the line it amends.
1. Spec entity: cite `liveDocRef` at sources/track-origin-main/packages/track/src/model/spec-amend.ts:28-29 (the field is at line 29).
2. Drift report:
   - `GitTreeBlobReader.pathExistedInHistory` is REQUIRED for `graphify request-lifecycle drift-report`.
   - A reader without it is refused with a typed error; it never falls back silently to `spec-cited-from-uncommitted-or-scratch-path`.
   - Fixture F9 gains a deleted-since-citation case.
3. `worstDriftCategory` is the first category present, in the §3.3 precedence order (SPEC lines 412-416). It is `not-applicable` when no decision memory is supplied. F12 also asserts `specPinValidation` and `worstDriftCategory`.
4. Fixtures for RLO-L5:
   - F4 to F8 and F11, through the `check` subcommand;
   - F9, through `drift-report`.
   F10 remains RLO-L3 only, and F12 remains RLO-L4 only.
