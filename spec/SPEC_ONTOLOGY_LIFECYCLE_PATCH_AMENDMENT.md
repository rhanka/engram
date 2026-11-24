# Lifecycle amendment — patch and decision semantics of the ontology decision log

**v0.2.2 · Proposed specification · 23 November 2026 · freezable per review round 2, pending the joint pass with s-conductor.** Claude Fable 5.2 is the assigned author (owner ruling of 23 November: Fable writes, Muse wonder full max reviews). v0.2.0 folded round 1 of the Muse review (Review2: CHANGES REQUIRED). v0.2.1 applied, word for word, the four edits that round 2 of that review requires (`REVIEW-studio-specs-wonder-r2.md`, §7). This revision is an erratum: it corrects one sentence of §7 for `duplicate_id` records and adds vector LV-REV-14. The changelog at the end states what was done with every finding. Owner acceptance and implementation are pending. This document amends `spec/SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`. It gives normative force to the alias and reversibility core of `spec/SPEC_ONTOLOGY_RECONCILIATION_ALGORITHM.md` (ALG:30–37,185). Occurrence aggregation (ALG:33) stays deferred (§18), so ALG as a whole stays "draft for review". It is the dependency that the Sentropic split specification cites as « to be written by engram ». (Review:111–132. Split:390,589.)

## 1. What this amendment decides

The Engram review of the Studio split found that patch semantics were being written outside Engram and diverged from Engram's own lifecycle specification. s-conductor accepted the finding and removed those rules from the split. This amendment is where they are now decided. (Review:111–132. Split:152,390.)

| Topic | Decision | Section |
|---|---|---|
| Overlay | The decision log is the authoritative state. One pure projection function folds it over the compiled base. The base never contains a decision effect. | §5 |
| Log identity | Entries are ordered by file position and identified by patch `id`. A computed digest identifies a log state. Nothing is stored in the records to chain them. | §6 |
| Per-verb effect | One table defines, for each verb, the preconditions and the effect on nodes, relations, entity views and the candidate queue. | §7 |
| Views | Each view is built by its shipped builder over a projected graph. Window, group counts and the search index are not projected in v1. | §7, §14 |
| Created ids | `created:` followed by the SHA-256 of the patch `id`. | §8 |
| Conflict | A record whose precondition fails against the state left by earlier records has no effect and receives a named disposition. Nothing is silently dropped or silently last-wins. | §9 |
| Reversal | A tenth verb, `revert_decision`, appends a compensating record. The targeted record is folded out. | §10 |
| Rebase | A new patch must carry the active hashes. A recorded decision is re-evaluated over a later base by the projection, behind an identity guard. Records are never rewritten. | §11 |
| Changed profile | The projection evaluates every decision against the current profile. A decision the profile no longer admits has no effect and is reported as `not_admitted`. | §11 |
| Trust | `accept_match` between two nodes that both declare a tier and whose tiers differ has no effect. No rule applies to single-node verbs. | §12 |
| Writers | All three writers append under one lock inside `applyOntologyPatch`, with an optional fence on the log digest. | §13 |
| Freshness | Decisions stop writing `needs_update`. Queue and materialization freshness are computed from the log digest. | §14 |
| Existing logs | Every log already written stays readable. Its records gain effects only as this document defines them. | §15 |

Owner direction of 22 November applies to everything below: the data model stays in Engram, and Engram's `studio/` receives no new UI component. Any screen or control for the verb, dispositions and markers defined here belongs to the Design System. (Split:149,394.)

## 2. Evidence

**Pin.** Every citation of Engram code or specifications is at `origin/main` = `66465de8073c28c00a5f12a9650d4e54e989ec6f`, the commit that ref named when v0.1.0 was written.

**Drift.** `origin/main` now names `38948f4ea960c5a73d5d85abd0f52f45e00b95f4`, one commit later (`.git/refs/remotes/origin/main`, read in the fold session). The Muse review lane ran `git diff 66465de8..origin/main`: the commit is an `llm-mesh` bump with scrap changes, it touches no file cited here, and no cited line moves (Review2, header). Citations hold at both commits.

**Reading method and limit.** Neither the authoring session nor the fold session had a shell: every command failed with `EROFS` on the harness temporary directory, so `git show origin/main:<path>` could not run. Files were read from a local `engram-next` worktree, whose detached HEAD is the pinned commit (`.git/worktrees/engram-next/HEAD`; checkout recorded at `.git/worktrees/engram-next/logs/HEAD:3`). The Muse review lane ran `git status --porcelain` on that worktree and found it clean (Review2, header). The fold session read the lines cited for the first time in v0.2.0 the same way.

**No digest value was computed.** This document fixes preimages and procedures. The expected digests of §16 are produced by lots L1 and L7 (§17).

[JUDGMENT] identifies a proposed rule, name or choice. `unverified` identifies missing evidence. Sections 4 to 17 are proposed Engram decisions for owner acceptance. Short citations expand below.

| Key | File |
|---|---|
| LC | `spec/SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`, 514 lines, "baseline accepted" (LC:7) |
| ALG | `spec/SPEC_ONTOLOGY_RECONCILIATION_ALGORITHM.md`, "draft for review" (ALG:6) |
| MEM | `spec/SPEC_AGENT_MEMORY_SUBSTRATE.md`, ratified 2026-08-01 (MEM:1,5) |
| G0, G0A | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_CONTRACTS.md` and `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md` |
| Port | `SPEC_ONTOLOGY_STUDIO_DATA_PORT_CONTRACT.md`, the companion contract written with this amendment |
| Review | `graphify/.graphify/scratch/design/studio-split/REVIEW-studio-split-engram-fable.md`, the Engram review of the split |
| Review2 | `graphify/.graphify/scratch/design/studio-split/REVIEW-studio-specs-wonder.md`, the Muse review of v0.1.0 of this amendment and of the Port contract |
| Split | `sentropic/spec/SPEC_EVOL_ONTOLOGY_STUDIO_SPLIT.md`, revision r7, read in the Sentropic working tree |

Source files under `src/` are cited by path and line. Paths start at the Engram repository root.

## 3. The specification of record against the pin

| # | Topic | Specification of record | Shipped at the pin | Closed in |
|---|---|---|---|---|
| 1 | Fold | "apply to authoritative project state -> rebuild derived graph and ontology artifacts" and a planned `ontology rebuild` (LC:39,206). Relations are "aggregated as a view" onto the canonical (ALG:34). | Apply appends to two logs and writes a marker (`src/ontology-patch.ts:608–652`). Candidate generation states "nothing is ever applied" and "nothing is merged, here or downstream" (`src/ontology-reconciliation.ts:1108–1109,2144–2145`). `src/cli.ts:3212–3339` holds `candidates`, `decision-log`, `patch`, `serve` and `studio`. The rest of the `ontology` group was not read (`unverified`; Split:262 reports no `rebuild` by `git grep`). | §5, §14 |
| 2 | Validation state | "target nodes, relations, registry records and evidence refs exist" (LC:191). | Targets resolve against the compiled `ontology/nodes.json` and `relations.json` (`src/ontology-patch-context.ts:110–133`; `src/ontology-patch.ts:386–483`). | §7, §13 |
| 3 | Per-verb effect | One line per verb (LC:175–183). The alias model for `accept_match` (ALG:30–37). | None. | §7 |
| 4 | Reversal | "keep every mutation auditable and reversible" (LC:30). "100% reversible", "undo last auto-batch", "undo restores the pre-merge view byte-for-byte" (ALG:35,143,185). | Nine verbs, none reverses another (`src/ontology-patch.ts:12–21`). | §10 |
| 5 | Rebase | Hashes match "unless explicitly rebased" (LC:188–189). Decisions must "survive graph rebuilds" (LC:29). A "rebase path" is listed as a future test (LC:448). | Both hashes must be equal or validation errors. No rebase path exists (`src/ontology-patch.ts:523–524`). | §11 |
| 6 | Record content | Every applied patch records a "before/after summary" (LC:50). | The record is the patch plus `status`, `applied_at` and `applied_by` (`src/ontology-patch.ts:640–645`). | §11, §13 |
| 7 | Identity and order | "Patch records are append-only instructions" (LC:150). | No identifier check, no sequence, no hash in a record (`src/ontology-patch.ts:608–652`). | §6 |
| 8 | Writers | The Studio "writes only through the same patch core used by CLI and MCP" (LC:365). | Three callers of `applyOntologyPatch` (`src/cli.ts:3304–3309`, `src/serve.ts:1368–1376`, `src/ontology-studio.ts:543`). A bare `appendFileSync` (`src/ontology-patch.ts:573–576`). | §13 |
| 9 | Trust | The reconciliation algorithm "MUST reject any candidate pair whose two members are of different trust tiers" so a note "can never be merged into or over ground truth". The application point is the ontology lot (MEM:157–163). | A queue-time predicate only (`src/ontology-reconciliation.ts:264–267`). `accept_match` validation checks existence only (`src/ontology-patch.ts:386–391`). | §12 |
| 10 | Stale marker | "mark derived artifacts stale or run an explicit rebuild" (LC:216). | Apply writes `needs_update` (`src/ontology-patch.ts:650`). Queue staleness reads it (`src/ontology-reconciliation-api.ts:72–79`). | §14 |
| 11 | Existing logs | Malformed-line warnings (LC:335). | The reader skips malformed and non-object lines with a warning and unwraps `{ patch }` records (`src/ontology-patch.ts:239–258`). Legacy `graphify_*` identifiers are accepted (`src/schema-ids.ts:46–48`). | §15 |
| 12 | Empty graph hash | — | The context falls back to `""` (`src/ontology-patch-context.ts:107`). A patch without `graph_hash` normalizes to `""`, and the equality test then passes (`src/ontology-patch.ts:497,524`). | §13 |
| 13 | Input status | Example patch has `status: "proposed"` (LC:159). | The audit file is chosen from the verb or the input status, the record status from the verb alone (`src/ontology-patch.ts:579,642`). A patch of another verb whose input status is `rejected` therefore lands in the audit file of the `reject_*` verbs with the record status `applied`. | §13 |

LC and ALG examples predate the rename and show `graphify_*` identifiers (LC:156,278,294). This amendment uses the shipped `engram_*` identifiers (`src/ontology-patch.ts:8–10`; `src/schema-ids.ts:4–8`).

## 4. Exact changes to the lifecycle specification

[JUDGMENT] Apply the eight replacements below when adopting the amendment. Each **Before** is the complete source line.

### Core contract, flow · LC:39

**Before**

~~~text
viewer or agent -> propose patch -> validate patch -> apply to authoritative project state -> rebuild derived graph and ontology artifacts
~~~

**After**

~~~text
viewer or agent -> propose patch -> validate patch against the projected state -> append the decision to the authoritative decision log -> project the log over the compiled base (live read, rebuild or publication)
~~~

### Operation families · LC:183

**Before**

~~~text
- `supersede_entity`: link a deprecated entity to its replacement.
~~~

**After**

~~~text
- `supersede_entity`: link a deprecated entity to its replacement.
- `revert_decision`: cancel one earlier decision by appending a compensating record.

The effect of each operation is defined in SPEC_ONTOLOGY_LIFECYCLE_PATCH_AMENDMENT.md §7 and §10.
~~~

### Validation, profile hash · LC:188

**Before**

~~~text
- profile hash matches the active profile unless explicitly rebased
~~~

**After**

~~~text
- profile hash matches the active profile; a recorded decision is re-evaluated against a later profile by the projection and is never rewritten
~~~

### Validation, graph hash · LC:189

**Before**

~~~text
- graph hash matches the candidate generation graph unless explicitly rebased
~~~

**After**

~~~text
- graph hash is non-empty and matches the active base graph; a recorded decision is re-evaluated against a later base by the projection, behind the identity guard, and is never rewritten
~~~

### Validation, targets · LC:191

**Before**

~~~text
- target nodes, relations, registry records and evidence refs exist
~~~

**After**

~~~text
- target nodes and relations exist in the projected state (the compiled base folded with every earlier decision), and evidence refs exist
~~~

### CLI, rebuild · LC:206

**Before**

~~~text
graphify ontology rebuild --config graphify.yaml
~~~

**After**

~~~text
engram ontology rebuild --config <path>   # materializes the projection; never rewrites a project-owned source
~~~

### CLI rules, staleness · LC:216

**Before**

~~~text
- After any write, Graphify should mark derived artifacts stale or run an explicit rebuild when requested.
~~~

**After**

~~~text
- After a decision write, the compiled base is not stale. Freshness of the candidate queue and of a materialized projection is computed from the decision-log digest; the write does not create `needs_update`.
~~~

### Read-only API contract · LC:247

**Before**

~~~text
## Read-Only Reconciliation API Contract
~~~

**After**

~~~text
## Read-Only Reconciliation API Contract

For Studio reads, this section (through the "Current implementation slice" list) is superseded by the Engram data-port contract, SPEC_ONTOLOGY_STUDIO_DATA_PORT_CONTRACT.md. The localhost routes it describes are served by `src/ontology-studio.ts` and are deleted with that file in lot OS-4 of the Studio split. The MCP and CLI read surfaces keep the response shapes described here.
~~~

The section runs from LC:247 to LC:337. The shared read responses stay in `src/ontology-reconciliation-api.ts` (LC:336).

ALG is not edited. Its canonical-entity model (ALG:30–37) is read as follows: `alias_of` is the alias map of the projection (§7), and "undo" is `revert_decision` (§10). No `alias_of` edge is written to a compiled artifact. One clause is not given force here: the occurrences of a member becoming occurrences of the canonical (ALG:33). It stays deferred (§18).

## 5. Model

Three things exist for one model. [JUDGMENT]

- **Base.** The compiled artifacts of one model at one `graph_hash` and one profile. For decisions, the base is the content the patch context reads: nodes, relations and evidence references (`src/ontology-patch-context.ts:110–134`). For views, it also holds what the shipped view builders read: the graph, the base scene, the hierarchy arcs, the entity sidecar sources and the candidate queue (VIEW-6 to VIEW-6c).
- **Decision log.** The JSONL file at `outputs.ontology.reconciliation.decisions_path` (`src/project-config.ts:452–454`; LC:136–146). It is the authoritative state of every reconciliation decision.
- **Projection.** The result of folding the log over the base under the current profile.

**One `graph_hash`.** Everywhere in this amendment `graph_hash` is one value: the `graph_hash` of the ontology manifest (`src/ontology-output.ts:482–499`), which the patch context reads (`src/ontology-patch-context.ts:102–107`) and patch validation fences on (`src/ontology-patch.ts:524`). The hash of the bytes of `graph.json` (`src/cli.ts:423–425`) and the `topology_signature` of the graph (`src/qa.ts:820`) are other values. Neither is ever a stamp or a rebase hash (Port §5.2).

| Rule | Statement |
|---|---|
| PRJ-1 | The projection is one pure function, proposed `projectOntologyDecisions(base, profile, log)` in `src/ontology-projection.ts`. It reads no file, runs no `git`, reads no clock and calls no model (LC:47). |
| PRJ-2 | It is the only fold. Validation, dry-run, apply, live reads, `ontology rebuild` and workspace publication all call it. No other code gives a decision an effect. A host may evaluate a patch against a state that this function wrote earlier (Port §8.4). (Split:390 item (b).) |
| PRJ-3 | It is total. It returns a result for any log content and never throws on a log entry. |
| PRJ-4 | It is deterministic. Equal inputs give outputs with equal canonical bytes (`src/ontology-guardian/canonical.ts:59–62`). |
| PRJ-5 | The base never contains a decision effect. Extraction and compilation never read the log. Projected output is never written to a base artifact path. A decision is therefore applied exactly once, by the projection. |
| PRJ-6 | A pipeline rebuild recompiles the base. It does not consume, rewrite or truncate the log. Decisions survive it through PRJ-2 and §11 (LC:29). |
| PRJ-7 | Array order is part of the output. `nodes` and `relations` keep base order, with created entries appended in log order. A union keeps the existing values in their order, then adds the new values in the order of the node they come from, without duplicates by exact string. `rejections` collect in log order. `decisions` are in file order. The evidence union of VIEW-2 is the one exception: it is sorted in code-unit order. Vector comparison of projected nodes and relations is order-sensitive under these rules. |

**Inputs.** `base = { graph_hash, nodes, relations, evidence_refs }`, with nodes and relations in the shipped shapes `OntologyPatchNode` and `OntologyPatchRelation` (`src/ontology-patch.ts:40–60,80–86`). `profile` is a `NormalizedOntologyProfile` (`src/types.ts:1276–1303`). `log` is the entry list of §6.

**Output.** `{ inputs, nodes, relations, resolved_relations, alias_of, rejections, decisions, summary, issues }`. `inputs` repeats `graph_hash`, `profile_hash`, `decision_log_digest` and `decision_log_revision`. `decisions` holds one item per log entry with its disposition (§7). `summary` counts items per disposition. `issues` holds the warnings the fold raises about its inputs, each with a code (LOG-10).

**Pure context.** [JUDGMENT] The shipped `OntologyPatchContext` mixes decision inputs with the writer's environment (`rootDir`, `stateDir`, `profileState`, `decisionsPath`, `dirtyWorktree`; `src/ontology-patch.ts:88–101`). Split it into `OntologyDecisionContext = { graphHash, profile, nodes, relations, evidenceRefs }` and a writer environment. `loadOntologyPatchContext` becomes one adapter that fills both from disk. A second, pure builder fills the decision context from in-memory documents. For hosted preview those documents are the sealed profile bundle and a projected state that this same projection wrote at publication, so the host evaluates a patch without folding again (Port §8.4). (Review:184. `src/ontology-patch-context.ts:98–139`.)

The decision context also carries the compiled per-type normalizer map, which exact-tier term comparison needs when the queue is regenerated (`src/ontology-reconciliation.ts:232–238`). The disk adapter compiles it as today. The pure builder receives it, or compiles the declarative normalizers of a sealed profile, which never names a module (Port BND-1). Queue regeneration and live reads therefore share one context builder.

## 6. Decision log

| Rule | Statement |
|---|---|
| LOG-1 | The log is read as UTF-8, split on `\r?\n`, and each line is trimmed. A blank line is not an entry (`src/ontology-patch.ts:225,234–238`). An absent file is the empty log (`:217–220`). |
| LOG-2 | Each remaining line is one **entry**, in file order. An entry is a **record** when it parses to a JSON object that `tryCanonicalBytes` accepts (`src/ontology-guardian/canonical.ts:65–71`). Any other entry is **opaque**: malformed JSON, non-object JSON (`src/ontology-patch.ts:239–255`), or an object that cannot be canonicalized, such as one holding a lone surrogate or a non-finite number (`src/ontology-guardian/canonical.ts:11–22,28`). |
| LOG-3 | The **effective patch** of a record is its `patch` member when that member is an object, otherwise the record itself (`src/ontology-patch.ts:257–258`). |
| LOG-4 | A record is a **decision** when its effective patch has a non-empty string `operation` and its `status` is `applied` or `rejected`. The status is read on the effective patch, or on the record when the effective patch has none. `rejected` is the status the engine writes for the two `reject_*` verbs (`src/ontology-patch.ts:642`). It does not mean that the patch was refused. |
| LOG-5 | Order is entry order in the file. `applied_at` and `created_at` are data and never order entries. |
| LOG-6 | Identity is the `id` of the effective patch. The first decision with a given `id` is the decision. Every later one has no effect (`duplicate_id`). |
| LOG-7 | Schema identifiers `engram_ontology_patch_v1` and `graphify_ontology_patch_v1` are both accepted (`src/schema-ids.ts:46–48`). No record is rewritten (`:4–8`). The identifier is checked on new writes only: a stored record with another `schema` value is still read (§7). |
| LOG-8 | No sequence number and no chained hash is stored in a record. The log is a git-tracked file that merges by union. A stored chain would break at every merge. |
| LOG-9 | Every scalar string member that the fold or the validator reads (`id`, `operation`, `status`, the target identifiers, `alias`, `label`, `type`, the statuses, `decision_id`) is read as the shipped helper reads it: trimmed, and missing when it is empty after trimming or is not a string (`src/ontology-patch.ts:322–324,485–504`). Array members are read as the shipped helper reads them too: an entry that is not a string or holds only whitespace is dropped, and a kept entry is **not** trimmed (`:326–330`). Evidence references therefore compare by exact string, as at the pin (`:369–371`). Created-identifier derivation (§8) hashes the trimmed patch `id`. |
| LOG-10 | The fold expects at most one base node per `id`. If a base repeats an `id`, the first occurrence in base order is the node, as in the shipped lookup (`src/ontology-patch.ts:344–346`). Later occurrences are ignored and reported once in `issues` with the warning code `duplicate_base_node_id`. The fold stays total (PRJ-3). A relation `id` may be absent, and it may repeat: the compiled `id` is derived from the triple, so two equal triples share one (`src/ontology-output.ts:389–402`). `reject_relation` by `relation_id` rejects **every** relation that carries the identifier. |

### Digest of a log state

[JUDGMENT] One digest answers one question: which ordered sequence of entries was projected? It follows the discipline of G0 §7: an exact preimage, RFC 8785 canonical bytes and SHA-256, with digest values carried as preimage fields in the pattern of the pins preimage, and never one digest standing in for another (G0:916,921,931; `src/ontology-guardian/canonical.ts:59–62,92–99`).

~~~text
entry_digest(record) = sha256Hex(canonicalBytes(record))          the record as stored, wrapper included
entry_digest(opaque) = sha256Hex(UTF-8 bytes of the trimmed line)

P-DECISION-LOG = {
  "entries": [ { "digest": <entry_digest>, "kind": "record" | "opaque" }, ... ],   file order
  "format":  "engram.decision-log-digest/1"
}

decision_log_digest   = "sha256:" + digestOfPreimage(P-DECISION-LOG)
decision_log_revision = number of entries
~~~

| Changes the digest | Does not change the digest |
|---|---|
| An entry is appended, removed, reordered or altered, including a wrapper member, `applied_at`, or an opaque line. | Line endings, a byte-order mark, blank lines, surrounding whitespace, and the key order inside a record. |

The digest covers the stored record and not the effective patch. Every change that a served view can show, including the decision trail, therefore moves it (Review:241). `decision_log_revision` is a display counter. It is never an identity (Split:503).

## 7. Evaluation and per-verb effect

[JUDGMENT] The fold classifies the entries, then makes two passes over them, both in file order. Validation uses the evaluation function of the second pass (§13). No second implementation of a precondition exists.

**Classification.** Each entry is tested in this order. The first test that applies names its disposition.

| # | Test | Disposition |
|---|---|---|
| 1 | The entry is not a record (LOG-2). | `opaque` |
| 2 | The record is not a decision (LOG-4). | `not_a_decision` |
| 3 | The decision has no `id`. | `invalid_record` |
| 4 | An earlier decision has the same `id` (LOG-6). The content of the later one is not read. | `duplicate_id` |
| 5 | The `operation` is not one this engine evaluates. | `unsupported_operation` |

The first decision that carries an `id` **owns** it, whatever its own disposition. A decision that passes the five tests is an **evaluated decision**.

**First pass: cancellations.** Walking the entries in file order, a `revert_decision` that is an evaluated decision cancels the decision its `decision_id` names when the four conditions below hold at that point of the walk. When one fails, the revert cancels nothing and takes the disposition shown. The conditions are tested in this order.

| Condition | Disposition of the revert when it fails |
|---|---|
| `decision_id` is present. | `invalid_record` |
| An earlier decision owns that `id`. A revert placed before its target never cancels it. | `orphan` |
| That decision is not itself a `revert_decision` (REV-7). | `invalid_record` |
| That decision is not already cancelled. | `redundant` |

Only the owner of an `id` can cancel or be cancelled. A later record with the same `id` stays `duplicate_id`, whether or not the owner is reverted.

**Second pass: evaluation.** Each evaluated decision that is neither cancelled nor a `revert_decision` goes through one function, `evaluateDecision(state, profile, patch)`. It returns a disposition and, when the disposition is `effective`, the next state. A cancelled decision receives `reverted` and changes no state, for the records between it and its revert as for the records after. The fold still asks `evaluateDecision` what the cancelled decision would have been at its own position, and discards the state it returns. A cancelling revert is `effective` when that answer is `effective` or `redundant`: it withdrew a decision that was in effect. It is `redundant` when the cancelled decision would have had no effect. The withdrawal then shows on the target, which moves to `reverted` and leaves the count of decisions that need attention.

Cancellation overrides classification in exactly one case. A target whose operation this engine does not evaluate (`unsupported_operation`) owns its `id` and can be cancelled like any other decision (REV-3): it receives `reverted`, not `unsupported_operation`, and the cancelling revert is `redundant`, because the target never had an effect this engine can state. No other classification outcome can be a target: `opaque`, `not_a_decision`, no-`id` and `duplicate_id` records own no `id`. A revert naming an `id` that no earlier decision owns is `orphan` (LV-REV-10). A `duplicate_id` record carries the `id` of the earlier decision that owns it, so a revert naming that `id` is judged against the owner, exactly as if the duplicate were absent, and the later record stays `duplicate_id` (LV-REV-14).

### State

- `nodes`: base nodes plus created nodes. A node gains an optional `decision` object naming the deciding patches: `created_by`, `merged_into`, `merged_by`, `deprecated_by`, `superseded_by`, `superseded_via`, `status_by`.
- `relations`: base relations plus created relations, as recorded. A relation gains an optional `decision` object: `created_by`, `rejected_by`.
- `alias_of`: member identifier to canonical identifier. It resolves transitively (ALG:34).
- `rejections`: rejected pairs, rejected queue item identifiers, rejected candidate identifiers, and rejected relation triples.

A node is **live** when it exists in `nodes` and has no `merged_into`. Deprecation and supersession are markers. They do not remove a node.

**Statuses are never written implicitly.** `status` changes only through `set_status`. Merging, deprecating and superseding are recorded in `decision`, because the status vocabulary belongs to each profile and the shipped default list has no `deprecated` value (`src/ontology-profile.ts:41,184–187`; `src/types.ts:926–931`).

### Dispositions

Every log entry receives exactly one disposition. The vocabulary is open: a consumer treats an unknown value as "no effect, unknown reason" and shows it in the class "needs attention" (Port §6).

| Class | Disposition | Meaning |
|---|---|---|
| In effect | `effective` | The decision changed the projected state. For a `revert_decision`: it cancelled a decision that was in effect. |
| | `redundant` | The decision is admitted and changes nothing. For a `revert_decision`: it cancelled a decision that had no effect, or its target was already cancelled. |
| Withdrawn | `reverted` | A later `revert_decision` cancels it. |
| | `duplicate_id` | An earlier decision has the same `id`. |
| Needs attention | `orphan` | A node, relation or decision it names is absent from the projected state. |
| | `conflict` | What it names exists but an earlier effective decision consumed or contradicted it. |
| | `not_admitted` | The current profile does not admit it. |
| | `target_changed` | The identity guard of §11 failed for a target. |
| | `trust_refused` | The trust rule of §12 applies. |
| Malformed | `invalid_record` | The decision has no `id`, a member the verb requires is missing, the decision names the same node twice, or a `revert_decision` names another `revert_decision`. |
| | `unsupported_operation` | The `operation` is not one this engine evaluates. |
| | `not_a_decision` | The record has no `operation`, or its status is neither `applied` nor `rejected`. |
| | `opaque` | The entry is not a record. |

When several preconditions of `evaluateDecision` fail, the first in this order names the disposition: `invalid_record`, `orphan`, `target_changed`, `conflict`, `not_admitted`, `trust_refused`, `redundant`, `effective`. A `revert_decision` follows the order of the first pass instead.

**What a stored record is judged on.** [JUDGMENT] The disposition of a stored record depends on its `id`, `operation`, `status` and `target`, and on `graph_hash`, `profile_hash` and `summary` through §11. No other envelope member changes it. A `schema` value that no writer emits, a missing `reason`, `author` or `created_at`, and an empty or unknown `evidence_refs` do not cancel a recorded decision. An unknown reference is listed in `evidence_unresolved` (CMP-6). Only new writes enforce the envelope checks of §13. The alternative is a fourteenth disposition for a record whose envelope is invalid. The owner confirms the choice at adoption (§18).

### Effect of each verb

Target members are those the shipped validation reads (`src/ontology-patch.ts:386–483`).

| Verb and target | Preconditions, with the disposition when one fails | Effect when effective |
|---|---|---|
| `accept_match` · `candidate_id`, `canonical_id` | The two identifiers are present and differ (`invalid_record`). Both nodes exist (`orphan`). Both are live, and no rejection covers the pair or the candidate (`conflict`). A rejection by `mapping_id` covers no pair: the fold does not read the queue. §12 (`trust_refused`). | `alias_of[candidate] = canonical`. The candidate keeps its record and gains `merged_into` and `merged_by`. The canonical gains the candidate's label and aliases as aliases, and the union of `normalized_terms` and `source_refs`, in the order of PRJ-7. A value already among its aliases, or equal to its own label, is not added. Every node, edge and source stays in place (ALG:33–35). |
| `reject_match` · `candidate_id` and `canonical_id`, or `mapping_id`, or `candidate_id` alone | One of the three forms is present (`invalid_record`; shipped rule at `:440–444`). When `mapping_id` is present it is the form, and the other members are ignored. In the pair form the two identifiers differ (`invalid_record`). In the pair form and the candidate-alone form each named node exists (`orphan`). The `mapping_id` form checks no existence. In the pair form the candidate is not already merged into that canonical (`conflict`). The same rejection is not already recorded (`redundant`). | The rejection is recorded. The pair form rejects the unordered pair. The `mapping_id` form rejects the queue item with that `id`. The candidate-alone form rejects every pairing of that node as candidate. No node or relation changes. Only the pair form and the candidate-alone form block a later `accept_match`. |
| `create_canonical` · `type`, `label` | Both members are present after trimming: a `label` that holds only whitespace is `invalid_record`. `type` is a node type of the profile (`not_admitted`). The created identifier is not already in `nodes` (`conflict`). | A node `{ id: created id, type, label, source_refs: evidence_refs }` with `decision.created_by`. It has no `status` member and no `trust` member (§8, §12). |
| `merge_alias` · `canonical_id`, `alias` | Both are present (`invalid_record`). The node exists (`orphan`) and is live (`conflict`). The alias is not already an alias, the label or the `id` of the node, by exact string (`redundant`). | The alias joins the node's `aliases`, trimmed (LOG-9). An alias that another node also carries is allowed. |
| `set_status` · `node_id`, `to_status`, optional `from_status` | `node_id` and `to_status` are present (`invalid_record`). The node exists (`orphan`) and is live (`conflict`). A supplied `from_status` equals the projected status, which is the profile's `default_status` when the node has none (`conflict`). `to_status` is in `hardening.statuses` and the transition from the projected status is allowed (`not_admitted`; `:374–384,399`). The projected status may lie outside `hardening.statuses`, as `reference` does on a base node, and it enters the transition test as it is. The projected status differs from `to_status` (`redundant`). | `status = to_status`, with `decision.status_by`. |
| `add_relation` · `source_id`, `target_id`, `relation_type` | All three are present, and the two identifiers differ: a relation from a node to itself is `invalid_record`. Both nodes exist (`orphan`). Both are live, the triple was not rejected, and the created identifier is not already in `relations` (`conflict`). The relation type exists and admits the two node types (`not_admitted`; `:420–432`). No equal non-rejected triple exists (`redundant`). Equality is on the recorded triple, before alias resolution. | A relation `{ id: created id, type, source_id, target_id, evidence_refs }` with `decision.created_by`. A triple that duplicates another only after alias resolution is `effective` and collapses in `resolved_relations` (VIEW-2). |
| `reject_relation` · `relation_id`, or `relation_type` with `source_id` and `target_id` | One of the two forms is present (`invalid_record`). When `relation_id` is present it is the form, and a triple beside it is ignored, even when it disagrees. A relation with that identifier, or with that triple, exists (`orphan`). At least one such relation is not already rejected (`redundant`). | Every relation that carries the identifier, or the triple, gains `decision.rejected_by` and leaves every view (LOG-10). The triple of each is recorded so a later equal `add_relation` conflicts. |
| `deprecate_entity` · `node_id` | `node_id` is present (`invalid_record`). The node exists (`orphan`) and is live (`conflict`). It is not already deprecated (`redundant`). | `decision.deprecated_by`. The node stays visible, stays live and stays a valid target. |
| `supersede_entity` · `deprecated_id`, `replacement_id` | The two identifiers are present and differ (`invalid_record`). Both nodes exist (`orphan`). Both are live, the first is not already superseded, and the replacement is neither deprecated nor superseded (`conflict`). | On the first node: `decision.superseded_by = replacement_id`, `superseded_via` set to the superseding patch `id`, and `deprecated_by` set to that same `id` unless the node is already deprecated. A later `deprecate_entity` on that node is therefore `redundant`. No relation is redirected. Supersession is a lifecycle link and not an identity merge. |
| `revert_decision` · `decision_id` | §10. | §10. |

**Deprecation and supersession do not change liveness.** A deprecated or superseded node is live. A merge into it, and a status or alias change on it, are evaluated by the ordinary rules.

Four shipped behaviours change for new writes. `reject_relation` with a `relation_type` alone was accepted (`src/ontology-patch.ts:464–468`) and now has no defined target. A supplied `from_status` replaced the node's status in the transition test (`:399`) and is now an assertion that must hold. `reject_match` checked no node (`:440–444`) and now requires the named nodes to exist, except in the `mapping_id` form. `add_relation` accepted a relation from a node to itself (`:410–433`) and now refuses it. A decision that names a merged node is never redirected to the canonical (VIEW-8).

Transition `requires` lists and `promotion_requires` are not evaluated at the pin (`src/ontology-patch.ts:374–384`; `src/ontology-profile.ts:164–190`). This amendment does not change that.

### Views

| Rule | Statement |
|---|---|
| VIEW-1 | A merged member is not a node of any projected view. Reading the entity by the member identifier returns the member's own entity view, with `decision.merged_into`. The canonical's entity view lists its members. |
| VIEW-2 | `resolved_relations` is `relations` with both endpoints resolved through `alias_of`, without rejected relations, without relations whose two endpoints resolve to the same node, and with relations equal on source, target and type collapsed into the first one in order. The kept relation carries the union of `evidence_refs`, sorted in code-unit order. The entity view reads `resolved_relations`. The patch context keeps `relations` as recorded, because evaluation compares recorded triples. The scene is built from the projected graph, whose links follow the same three rules (VIEW-6). |
| VIEW-3 | Created nodes and relations appear in every projected view. |
| VIEW-4 | Every projected view shows the projected status and the `decision` markers. |
| VIEW-5 | A candidate queue item is **decided** when a rejection covers it, when its candidate is merged into its canonical, or when either of its nodes is no longer live. A rejection covers an item when its `id` was rejected by `mapping_id`, when its unordered pair was rejected, or when its candidate was rejected alone. A decided item leaves the open queue and carries the deciding patch identifier with an `outcome`: `accepted` when its candidate is merged into its canonical, `rejected` when a rejection covers it, `superseded` when another decision made one of its nodes stop being live. When several apply, the first in that order names the outcome. Regeneration never emits a rejected pair again (ALG:134). |
| VIEW-6 | Views are built from a **projected graph**, never from patch nodes alone. [JUDGMENT] The projected graph starts from the base graph: the nodes and links of `graph.json`, as the scene builder reads them (`src/studio-scene.ts:96–107,216–224`). (a) A merged member is removed. (b) Each link endpoint is resolved through `alias_of`. (c) A link is removed when its recorded triple of source, relation and target is a rejected relation, or when resolution made it a link from a node to itself. The triple is what ties a compiled relation to its link (`src/ontology-output.ts:389–402`). (d) A link that resolution made equal on source, target and relation to a link standing earlier in order is removed. The kept link is not changed, and the evidence of the removed one stays readable in `resolved_relations`. (e) A created node is appended as `{ id, label, type, source_refs }` and a created relation as the link `{ source, target, relation: type, evidence_refs }`, both in log order. (f) The projected `status` replaces the `status` of the graph node. A node or link that no rule touches keeps its bytes, so an empty log gives the base graph. |
| VIEW-6a | The shipped builders then run over that graph, called exactly as the shipped live route calls them, so an empty log reproduces today's live bytes (OS-4 parity). `buildStudioScene(projectedGraph)` with no options (`src/ontology-studio.ts:287`): no profile is passed, so per-type `visual_encoding` overrides do not apply, as on the live route today — honouring them (as `src/studio-export.ts:711` does) is a later visible change, never a silent cutover effect. After the build the materializer attaches, in this order, each node's `decision` object (the builder copies only its allow-list, `src/studio-scene.ts:257–299`) and the position members of VIEW-6b. The class-hierarchy builder runs over the nodes of the projected graph (`src/ontology-class-hierarchies.ts:48–54,87–90`), its envelope `graphHash`/`profileHash` repeated from the base artifact. The scene-hierarchy builder runs over the **unchanged base arcs** (`src/scene-hierarchies.ts:107–126`) with `sceneNodeIds` derived from the projected scene as the shipped export derives them (raw id = `registry_record_id` when present, else the node id, `src/studio-export.ts:716–726`), `labels` = the labels the base artifact carries in `nodes_by_id`, extended with projected-scene labels for ids the base does not label, and `specs`/envelope `graphHash` repeated from the base build. Decisions never create a registry arc and never rename a node, so these inputs are exact for every v1 decision. No builder holds decision logic. |
| VIEW-6b | The projection computes no layout and reads no clock. It never calls `attachLayoutPositions` or the export layout (`src/graph-layout.ts:411–434`; `src/studio-export.ts:708–711`): layout is computed once per base and its bytes depend on environment (`GRAPHIFY_FAST_LAYOUT`, `src/graph-layout.ts:402–422`), so recomputing it per decision would move every node and break MAT-2 across environments. The **base scene** of §5 is the shipped result for the base graph, `attachLayoutPositions(buildStudioScene(baseGraph))` (`src/ontology-studio.ts:287`); a host holding no base scene file computes it that way once and caches it by base `graph_hash` (WRT-8). After the projected build, each node receives the position members (`x`, `y`, `fx`, `fy`, `fixed`) of the base-scene node with the same id — set when the base node has them, removed when it has not — assigned in the order `x, y, fx, fy, fixed`. A created node therefore has no position member; the client places it. The projected graph copies `layout_id`, `layout_dims` and `snapshot_id` from the base graph and the builder carries them through (`src/studio-scene.ts:777–780`). Where a shipped shape has `generated_at`, the projected view repeats the base artifact's. |
| VIEW-6c | A projected entity view is the shipped sidecar for that identifier, built by `buildEntitySidecar` with the node of the projected graph (`src/studio-assets.ts:421–445,495–562`). A created node therefore gets the empty sidecar `{ id, description: null, occurrences: null }` with its `type`. `label`, `status`, `trust`, `aliases`, `decision`, `members` and `relations` come from the projection. Occurrences and citations are the base node's own in v1. They are never aggregated from members (§18). |
| VIEW-7 | No window, group count or search index is projected in v1 (MAT-0). A host whose graph store mirrors the base may serve a window or a group count while the log holds no `effective` decision. Once the log holds one, the host answers that the capability is unavailable, and the client falls back as it does today without a store (`src/ontology-studio.ts:415–419,462–464`). |
| VIEW-8 | No read and no write redirects a merged member identifier to its canonical. Two things resolve through `alias_of`: the endpoints of `resolved_relations` and of projected links (VIEW-2, VIEW-6), and the member list of the canonical's entity view (VIEW-1). A patch that names a merged node where a live node is required is `conflict`. |

Aggregating the occurrences and citations of members into the canonical's entity view is not specified here. The occurrence payload is untyped at the pin (`src/studio-assets.ts:437`). See §18.

## 8. Created identifiers

| Rule | Statement |
|---|---|
| CID-1 | `created_id(patch_id) = "created:" + sha256Hex(UTF-8 bytes of patch_id)`, 64 lowercase hex digits (`src/ontology-guardian/canonical.ts:92–94`). `patch_id` is the `id` as LOG-9 reads it, trimmed. [JUDGMENT] |
| CID-2 | `create_canonical` gives this identifier to its node. `add_relation` gives it to its relation. |
| CID-3 | The identifier depends on the patch `id` only. It is stable across rebuilds, profile changes, republications and log merges. |
| CID-4 | A later patch may name a created identifier wherever a node or relation identifier is accepted. |
| CID-5 | The engine returns it as `created_node_id` or `created_relation_id` on the validation and apply results, in dry-run and in write (§13). (Review:240.) |

A namespaced synthetic identifier has a precedent at the pin: class nodes are `class:<ClassName>` "so they never collide with raw registry / entity ids" (`src/ontology-class-hierarchies.ts:12–13,41–46`; `src/types.ts:1050–1051`). That extraction can never emit an identifier starting with `created:` is `unverified`. The `conflict` precondition of `create_canonical` is the guard.

## 9. Conflicts and duplicates

| Rule | Statement |
|---|---|
| CNF-1 | The fold evaluates decisions in file order. An earlier effective decision stands until it is reverted. |
| CNF-2 | A later decision whose precondition fails because of an earlier one has no effect and is reported `conflict`. It is never applied in place of the earlier one, and it is never dropped without a disposition. |
| CNF-3 | New writes are refused before append when they are not valid (§13): every verb but a cancelling `revert_decision` must be `effective`. Conflicting records therefore reach a log only through a merge of two divergent logs, or through a hand edit. |
| CNF-4 | `duplicate_id` follows LOG-6. The content of a later record with a known `id` is never read. |

## 10. Reversal

[JUDGMENT] Reversal is a compensating record. The ratified memory contract uses the same construction for erasure: a compensating event "appended to the journal and folded OUT at projection" (MEM:175–178).

| Rule | Statement |
|---|---|
| REV-1 | The verb is `revert_decision`. Its target is `{ "decision_id": "<patch id>" }`. `reason` is required. `evidence_refs` may be empty for this verb only. |
| REV-2 | The target must be a decision that appears earlier in the log (`orphan` otherwise), that is not itself a `revert_decision` (`invalid_record`), and that is not already cancelled (`redundant`). §7 states the walk that applies these tests in file order, and the disposition of the revert itself. |
| REV-3 | The targeted record receives `reverted` and has no effect anywhere in the fold, on the records between it and the revert as on the records after. The record stays in the file. A decision of any disposition may be reverted. Reverting one that had no effect withdraws it from the "needs attention" count, and the revert itself is then `redundant` (§7). |
| REV-4 | For a log `L`, a decision `X` effective in `L·X`, and `R` reverting `X`: the `nodes`, `relations`, `resolved_relations`, `alias_of` and `rejections` of the projection of `L·X·R` equal those of `L`, in canonical bytes. This is the property ALG:185 requires. |
| REV-5 | A revert is refused at write time (`has_dependents`) when cancelling `X` would turn another record from `effective` into a disposition of the class "needs attention". The dependents are reverted first. A record that only moves from `effective` to `redundant` is not a dependent. |
| REV-6 | A revert may make a record effective that was `conflict` or `redundant` because of `X`. Validation and dry-run list those identifiers in the result member `reactivates` (§13). The write is allowed. |
| REV-7 | A `revert_decision` cannot be reverted. Taking the decision again is a new patch with a new `id`. |
| REV-8 | A batch undo (ALG:143) is a sequence of reverts in reverse order. An atomic batch is out of scope: no auto-apply path ships (ALG:77). |

A stored log may hold a reverted record that still has dependents, after a merge. The projection stays defined: the dependents become `orphan` or `not_admitted`.

## 11. Rebase and decisions under a changed profile

**At write time.** A new patch must carry the active `profile_hash` and the active, non-empty `graph_hash` (shipped equality at `src/ontology-patch.ts:523–524`; non-emptiness is new). `graph_hash` is the one value of §5, the ontology manifest's, and never another hash of the graph. A proposed patch whose hashes are stale is refused. Its author issues it again against the current state. The engine never re-stamps a patch, so no decision is applied under hashes its author did not see.

**At projection time.** Decisions must survive a rebuild (LC:29). They are carried to a later base or profile by evaluation, never by editing the record.

| Rule | Statement |
|---|---|
| RBS-1 | A record is **rebased** when its `graph_hash` differs from the base's or its `profile_hash` differs from the profile's. |
| RBS-2 | Every record, rebased or not, is evaluated by `evaluateDecision` against the current projected state and the current profile. |
| RBS-3 | **Identity guard.** When the record's `graph_hash` differs from the base's, each **guarded node** of the record is compared with `summary.before.nodes[id]`, which the writer recorded for exactly this set. The guarded set per verb: `accept_match`, the candidate and the canonical; `reject_match`, both nodes in the pair form, the candidate in the candidate-alone form, none in the `mapping_id` form; `create_canonical`, none; `merge_alias`, `set_status` and `deprecate_entity`, the named node; `add_relation`, both endpoints; `reject_relation`, both endpoints of each relation it rejects, as recorded; `supersede_entity`, both nodes; `revert_decision`, none, because its target keeps its own guard outcome. A guarded node created by an earlier decision of the same fold is exempt: its identity is the patch `id` (§8). Every other guarded node must exist, or the record is `orphan`, which precedes this test. It must then match its snapshot. If the snapshot holds `registry_record_id`, the node must hold the same `registry_id` and the same `registry_record_id`, a `registry_id` missing from the snapshot having to be missing from the node too. Otherwise `type` must be equal, missing on both sides counting as equal, and `label` must be equal after `normalizeTerm` (`src/ontology-reconciliation.ts:215–217`), a label missing on either side counting as a mismatch. The compiled node shape carries a `label` (`src/ontology-output.ts:426–429,447`), so the last case is expected on hand-made bases only. Any mismatch gives `target_changed` for the whole record. |
| RBS-4 | A record without `summary`, written before this amendment, is carried on identifier match alone and flagged `rebase_unverified`. |
| RBS-5 | Each decision item reports `recorded_under: { graph_hash, profile_hash }`, `rebased` and, when it applies, `rebase_unverified`. The summary counts rebased items per disposition. |
| RBS-6 | A rebase is never silent at a boundary. Workspace publication refuses a model in which a rebased record has a disposition of the class "needs attention", unless the operator passes an explicit acknowledgment that the descriptor records (Port §8). `engram ontology rebuild` prints the same counts and exits non-zero under `--fail-on-drift`. |

The guard exists because a node identifier is derived from a label or a registry key. After a re-extraction, the same identifier can denote another entity. An unguarded replay would merge the wrong nodes. [JUDGMENT]

**Summary written at apply.** [JUDGMENT] The engine adds a `summary` member to the record it appends. It fulfils LC:50 and feeds RBS-3. Members appear only when known.

~~~json
{
  "summary": {
    "before": { "nodes": { "<node id>": { "type": "…", "label": "…", "status": "…", "registry_id": "…", "registry_record_id": "…" } } },
    "after":  { "created_node_id": "…", "created_relation_id": "…", "status": "…" }
  }
}
~~~

`before.nodes` holds exactly the guarded set of RBS-3, as projected **before** this decision. Each node carries the members it then had among `type`, `label`, `status`, `registry_id` and `registry_record_id`. A member the node did not have stays absent. `after.status` is written only by `set_status`.

The writer spreads the patch into the record and then writes `summary`, `status`, `applied_at` and `applied_by` over any value the client supplied, as the shipped record does for the last three (`src/ontology-patch.ts:640–645`). A patch is an open record (`:37`), so without that rule an author could seat a `summary.before` that matches a wrong node and defeat RBS-3. A record appended by the engine therefore never carries an author-supplied snapshot. A hand-written record can carry any `summary`, and the fold cannot tell. That is the limit of every rule that reads a stored record (§13, last paragraph).

**Changed profile.** RBS-2 is the whole rule. The cases that give `not_admitted`:

| Decision | Change in the profile | Classified by `checkProfileCompatibility` as |
|---|---|---|
| `set_status` | The status left `hardening.statuses`, or the transition is no longer listed. | `removed_status`, breaking (`src/profile-bundle.ts:1141`; structural fallback at `:859–868`). `narrowed_status_transition`, breaking (`:1164,1173`). |
| `add_relation` | The relation type was removed, or no longer admits the endpoint types. | `removed_relation_type`, breaking (`:1046–1050`) |
| `create_canonical` | The node type was removed. | `removed_node_type`, breaking (`:971–974`) |

The classifier's verdict does not predict dispositions. RBS-2 re-evaluates every decision, whatever the classifier calls the change. Three facts frame it. First, a purely additive change never turns a decision into `not_admitted`: an added node type, relation type or status, a widened endpoint list, a version bump (`src/profile-bundle.ts:956,976–979,1142`). It can turn a stored `not_admitted` record `effective`. Such a record reaches a log only through a merge or a hand edit (CNF-3), and it then counts for the records after it by the ordinary rules. Second, a changed `default_status` and a narrowed transition list change what `set_status` admits (`src/ontology-patch.ts:374–384,399`), and the classifier calls both breaking (`src/profile-bundle.ts:1143–1145,1164,1173`). Third, the classifier calls the first entry added to an empty `status_transitions` list `widened_status_transition`, non-breaking (`:1167–1169`), although an empty list admits every transition (`src/ontology-patch.ts:380`). The new list narrows what `set_status` admits, and a stored transition that it does not cover becomes `not_admitted`. LV-PRF-01 locks the additive case. LV-PRF-06 locks the stored `not_admitted` record that an added status makes `effective`. LV-PRF-05 locks the empty-list case.

For an `engram.metamodel/v1` profile a presentation-only change does not move `profile_hash` at all (`src/ontology-guardian/digests.ts:114–117`; `src/ontology-profile.ts:617–619`), so no record becomes rebased. The compatibility verdict itself travels in the publication descriptor (Port §8). The projection does not compute it.

Hosted comments anchored on a decision that lost its effect are outside this amendment. They belong to the comment store of the split (Split:588).

## 12. Trust

The ratified rule: a candidate pair whose members are of different tiers must be rejected, "so a memory note can never be merged into or over ground truth", and the application point is the ontology lot (MEM:157–163). At the pin only the queue applies it (`src/ontology-reconciliation.ts:264–267`). A hand-written `accept_match` across tiers passes validation (`src/ontology-patch.ts:386–391`).

| Rule | Statement |
|---|---|
| TRU-1 | `accept_match` has no effect (`trust_refused`) when both nodes declare a tier and the tiers differ. It is the shipped predicate `violatesTrustTier`, applied at evaluation. |
| TRU-2 | A missing tier is not a violation, as at the pin, and for the reason recorded there: no signal yet says that the tier regime is in force for a corpus (`src/ontology-reconciliation.ts:254–262`). |
| TRU-3 | No tier rule applies to a verb that names one node. `merge_alias`, `set_status`, `deprecate_entity` and `create_canonical` have no second node to compare. (Review:239.) |
| TRU-4 | A created node carries no `trust` member. A tier is never defaulted (`src/ontology-reconciliation.ts:261–262`). Tagging it `asserted` would make TRU-1 refuse the merge of corpus nodes into the canonical that was created to receive them (LC:177; ALG:32). |
| TRU-5 | A tier value outside the known set loads as absent (`src/ontology-patch-context.ts:43–62`). The known set is `earned`, `asserted`, `signed`, `unverified` (`src/ontology-patch.ts:78`). |
| TRU-6 | The rule is pairwise, as shipped. It compares the two named nodes only, never the members already merged into either. A cluster can therefore mix tiers through an untagged bridge node: an `earned` node and an `asserted` note each merge into an untagged canonical, and both merges pass. That is the outcome the ratified rule exists to prevent (MEM:157–160). [JUDGMENT] v1 keeps the shipped semantics and records the limit. A cluster-wide comparison is an open decision for the memory lane (§18). LV-TRU-06 locks the v1 behaviour, so that any later tightening is a visible vector change. |

MEM also sets `reconcilable: false` on memory notes (MEM:153–156). The patch node shape has no such member at the pin (`src/ontology-patch.ts:40–60`), so the projection cannot test it. See §18.

## 13. Validation, apply and the writer protocol

**One rule for validity.** [JUDGMENT] A patch is valid when the envelope checks pass and `evaluateDecision` on the projection of the current log returns `effective`. Any other disposition is an error whose code is the disposition name. A `revert_decision` is the one verb that `evaluateDecision` does not judge. It is valid when the walk of §7 lets it cancel its target, whether its own disposition is then `effective` or `redundant`, and when REV-5 finds no dependent. Without this clause the write that REV-3 allows, the revert of a record that had no effect, would be refused for being `redundant`. A revert that cancels nothing is refused, with its disposition as the code. Validation and the fold cannot disagree, because they are the same function.

**Admission.** The shipped normalization returns nothing for a verb outside the nine, and validation then answers with `patch_id: null` (`src/ontology-patch.ts:485–489,509–516`). Normalization is widened to admit any non-empty `operation`. An unknown verb then reaches evaluation and answers `unsupported_operation` with its `patch_id`. `revert_decision` is admitted by the same change.

**Envelope checks.** Shipped checks stay (`src/ontology-patch.ts:518–527`). Seven refusal codes are new. Two shipped refusals and one shipped warning gain a code.

| Code | Check | Status |
|---|---|---|
| `schema_mismatch`, `missing_id`, `missing_reason`, `missing_author`, `missing_created_at` | `:518–522` | Shipped |
| `profile_hash_mismatch`, `graph_hash_mismatch` | `:523–524` | Shipped |
| `evidence_missing`, `evidence_unknown` | `:363–372`. Not required for `revert_decision` (REV-1). | Shipped, one exemption |
| `decisions_path_missing`, `decisions_path_outside_jail` | A write without a configured decision path, or with one outside the repository jail (`:619–625`). | Shipped, now coded |
| `graph_hash_missing` | The active graph hash is empty, or the patch carries none. | New (Review:242) |
| `patch_not_canonicalizable` | `tryCanonicalBytes(patch)` is `null`. | New (Review:241) |
| `status_not_proposed` | The input `status` is present and is not `proposed`. It is read on the input, before normalization, which would turn an absent or non-string value into `proposed` (`:495`). | New (§3 row 13) |
| `patch_id_conflict` | A decision of the log owns the `id`, and its content differs from the incoming patch. Content is compared as canonical bytes of the effective patch (LOG-3), after the shipped normalization of the incoming patch (`:485–504`) and with `status`, `applied_at`, `applied_by` and `summary` removed from both sides. Equal bytes under the same rule are `already_applied`. | New |
| `stale_decision_log`, `decision_log_locked` | WRT-5, WRT-2. | New |
| `has_dependents` | REV-5. | New |

Four warning codes exist. A warning never makes a result invalid.

| Warning code | Raised when |
|---|---|
| `dirty_worktree` | The shipped worktree warning (`:527`). |
| `audit_append_failed` | WRT-3a. |
| `stale_lock_removed` | WRT-2. |
| `dependents_not_evaluated` | A host without a base cannot run the two checks of a revert that need a second fold (Port CTX-5). |

Issues gain an optional `code` member beside `severity` and `message` (`src/ontology-patch.ts:103–106`). Fixtures assert codes, never message text.

**Results.** [JUDGMENT] Both results gain optional snake_case members. The shipped members and schema identifiers are unchanged (`src/ontology-patch.ts:108–113,126–133`).

| Member | On | Meaning |
|---|---|---|
| `disposition` | validation, apply | The disposition the patch would receive, or received. |
| `created_node_id`, `created_relation_id` | validation, apply | §8. |
| `log_digest`, `log_revision` | validation, apply | The log state the result was computed at. After a write, the new state. |
| `already_applied` | apply | `true` when a decision of the log owns the `id` and its content equals the incoming patch, under the comparison rule of `patch_id_conflict`. Nothing is appended. |
| `reactivates` | validation, apply | REV-6. |

After a write, `changed_files` lists only the files that were written. A dry-run lists the files a write would change, as at the pin (`src/ontology-patch.ts:628–636`), without the stale marker (FRS-1).

**Writer protocol.** `applyOntologyPatch` stays the only writer (§3 row 8).

| Rule | Statement |
|---|---|
| WRT-1 | A write holds an exclusive lock: the file `<decisions_path>.lock`, created with the exclusive flag. It is keyed on the decision file, so two state directories that share one log exclude each other. The file holds the process identifier, the host name and the acquisition time, for diagnosis only. Staleness is judged on the modification time of the lock file against the writer's wall clock. It is never judged on the process identifier or on the embedded acquisition time, so a lock taken from another machine over a shared filesystem is handled the same way. A clock skew above the stale bound between two machines can let a writer take a live lock. The last paragraph of this section says why the fold stays correct. [JUDGMENT] |
| WRT-2 | Acquisition retries for at most 2 seconds, waiting 25 ms between two exclusive-create attempts. On failure the write is refused (`decision_log_locked`) and nothing is appended. A lock older than 30 seconds is stale. The next writer removes it and reports the warning `stale_lock_removed`. [JUDGMENT] for the three durations. |
| WRT-3 | Under the lock, in order: read the log and compute its digest; apply the fence (WRT-5); normalize the incoming patch and test `missing_id` and `patch_not_canonicalizable`; handle a known `id` (`already_applied` or `patch_id_conflict`); run the other envelope checks; project; evaluate; refuse unless the patch is valid, as the first paragraph of this section defines it; append the record with its `summary`; append the audit record (`src/ontology-patch.ts:578–586,648`); release. A known `id` is handled before the hash checks, so the replay of an applied patch stays `already_applied` after the base has moved. |
| WRT-3a | The authoritative append is the commit point. If the audit append then fails, the write still succeeds. The result carries the warning `audit_append_failed`, and `changed_files` lists only the files that were written. |
| WRT-4 | The append is one write of one complete line. When the file is not empty and does not end with a line feed, the writer first writes one. Without this guard a hand-edited log would glue the new record to its last line and lose both. |
| WRT-5 | **Fence.** The caller may pass `expectedLogDigest`. When the current digest differs, the write is refused (`stale_decision_log`) and nothing is appended. The Studio always passes it. The CLI and the MCP tool accept it as an optional input. The Studio host passes the `decision_log_digest` of the pin it computed itself, never a value decoded from a client token (Port PIN-4a). |
| WRT-6 | Validation and dry-run take no lock and write nothing. Their result names the `log_digest` they read. |
| WRT-7 | The path jail and the dirty-worktree warning stay (`src/ontology-patch.ts:527,619–625`). The engine never stages, commits or pushes (LC:215). |
| WRT-8 | A host caches a projection and its views by the model's pin token (Port §5.3). It checks the log on every request, so an append by another writer is visible on the next read. |

**Audit files.** The writer keeps both shipped audit files (`src/ontology-patch.ts:578–586`). The decision-log preview reads `applied-patches.jsonl` (`src/ontology-reconciliation-api.ts:54–56,104–113`), and that file is the `audit` source of the port. `rejected-patches.jsonl` has no reader at the pin (Review2, A-m3) and is not served in v1 (Port LOGV-5). `status_not_proposed` removes the input that made a patch of another verb land in it (§3 row 13).

The protocol and the fold are two layers. The fold is total over any log, so correctness of what is shown never depends on writers behaving. The protocol only narrows what reaches the log. A stale lock taken over in the worst case lets a record land after another writer's. The fold then gives it `conflict` or `effective` by the ordinary rules.

## 14. Materialization, rebuild and freshness

**Materialization.** [JUDGMENT] Writing the projection to disk produces a directory of projected artifacts and one manifest, `projection.json`:

~~~json
{
  "schema": "engram_ontology_projection_v1",
  "generated_at": "…",
  "inputs": { "graph_hash": "…", "profile_hash": "…", "presentation_hash": "…", "decision_log_digest": "sha256:…", "decision_log_revision": 0 },
  "summary": { "effective": 0, "orphan": 0 },
  "artifacts": [ { "name": "projected-scene", "path": "scene.json", "schema": null, "sha256": "…", "size_bytes": 0 } ]
}
~~~

Artifact entries reuse the member names of the workspace manifest (`src/workspace-manifest.ts:72–83`). `summary` holds one count per disposition present. `presentation_hash` is present only for an `engram.metamodel/v1` profile, whose visual encoding is outside `profile_hash` (`src/ontology-guardian/digests.ts:114–117`). `inputs.profile_hash` and `inputs.presentation_hash` are written as the profile stores them, which is the `sha256:`-prefixed form for an `engram.metamodel/v1` profile (`src/ontology-profile.ts:614–640,688–689`). The version pin converts both to bare hex (Port §5.1).

| Rule | Statement |
|---|---|
| MAT-0 | Window, group-count and search-index artifacts are **not** projected in v1. [JUDGMENT] No rule of this amendment says how a top-degree window, a group count or a search index is built over a projected graph, and at the pin only one store adapter serves the first two (Split:588). When the log of a model holds an `effective` decision, a window read, a group-count read and a retrieval query answer that the capability is unavailable (VIEW-7), and in model scope the host reports `server_retrieval: false` (Port §7.2). The clients' shipped fallbacks apply. The artifact names `projected-window.*`, `projected-groups.*` and `projected-search-index` of the Port contract §8.2 are reserved for a later amendment that defines their construction. A v1 publication never carries them. |
| MAT-1 | Materialization writes to `<state_dir>/ontology/projected/` locally and to the publication staging directory at publish time. It never writes to a base artifact path (PRJ-5). |
| MAT-2 | A materialized artifact equals, byte for byte, what a live host serves for the same inputs. Both sides serialize an artifact as its shipped emitter does, and neither reads a clock (VIEW-6b). Live and materialized bytes come from one serializer per artifact in the L8 code, shared by both paths; `LV-VIEW-03` tests that pair. Equality with files written by pre-amendment pipelines is asserted only by `LV-VIEW-05`, whose base artifacts the vector itself carries (§16). |
| MAT-3 | `engram ontology rebuild` (LC:206) re-runs the deterministic ontology-output step over the existing extraction, materializes the projection, and regenerates the candidate queue over the live projected nodes and `resolved_relations`, leaving out every decided pair (ALG:134). It runs no extraction and calls no model (LC:47). A stale extraction is refreshed by the ordinary pipeline (PRJ-6), never by this command. |
| MAT-4 | A regenerated queue records the `decision_log_digest` it was generated under, as an optional member of `engram_ontology_reconciliation_candidates_v1`. The queue schema already takes optional additions under the same identifier (`src/ontology-reconciliation.ts:19–23,75–85`). |

**Freshness.** One marker cannot carry two causes, and a decision does not make the base stale (PRJ-5).

| Rule | Statement |
|---|---|
| FRS-1 | `applyOntologyPatch` no longer writes `needs_update`, and the `stale_marker` entry leaves `changed_files` (`src/ontology-patch.ts:600–604,650`). The marker keeps its meaning for the base. A marker left by an apply of the pinned engine cannot be told from a base-stale marker. It clears on the next graph update (`src/watch.ts:666–671`), and the release notes of lot L8 say so. |
| FRS-2 | The candidate queue is stale when the shipped predicate holds (`src/ontology-reconciliation-api.ts:72–79`), or when the log has at least one entry and the queue's recorded `decision_log_digest` is absent or differs from the current one. |
| FRS-3 | A materialized projection is stale when the `inputs` of its `projection.json` differ from the current base hash, profile hash, presentation hash or log digest. |
| FRS-4 | A live read is never stale with respect to the log. Its freshness is stated by the version pin (Port §5). |

## 15. Compatibility of logs already written

| Rule | Statement |
|---|---|
| CMP-1 | No shipped reader gives a decision an effect on a derived artifact (§3 row 1). This amendment therefore defines effects for the first time, and that **is** an observable change on upgrade. Recorded decisions take effect in every view: a merged node leaves the scene. Write-time validation tightens from the base state to the projected state: a patch that is valid at the pin, such as a second `accept_match` of one candidate (`src/ontology-patch.ts:386–391`), can be refused as `conflict`, `not_admitted` or `trust_refused`. The release notes of the lots that land L3 and L7 state both. Log reading does not regress: listing, digest and preview (CMP-2, CMP-5). |
| CMP-2 | Every tolerance of the shipped reader stays: skipped malformed and non-object lines, unwrapped `{ patch }` records, both identifier families (`src/ontology-patch.ts:239–258`; `src/schema-ids.ts:46–48`). |
| CMP-3 | Opaque entries never block a write. They have no effect, are listed with their line number, and enter the digest. A log that kept conflict markers after a merge stays usable. Publication refuses a log that holds an opaque entry (Port §8). |
| CMP-4 | A record without `summary` follows RBS-4. A record with a repeated `id` follows LOG-6. |
| CMP-5 | Records written under this amendment stay readable by the pinned engine: its reader lists them and gives them no meaning (`src/ontology-patch.ts:204–267`). `summary` is an added member of an open record (`:37`). |
| CMP-6 | Missing evidence does not cancel a recorded decision. An `evidence_refs` entry unknown in the current base is reported on the item (`evidence_unresolved`), and the decision keeps its disposition. Evidence justified the decision when it was taken. A renamed source file must not undo it (LC:29). |

## 16. Conformance vectors

[JUDGMENT] One vector is one JSON file with schema `engram_ontology_lifecycle_vector_v1`: a base, a profile fixture name, the log lines, and steps. Each step names a call (`validate`, `dry_run`, `apply`, `project`), an input, and the expected result: validity, disposition, issue codes, created identifiers, log digest, and the projected nodes and relations where the vector asserts them. A vector that asserts a view also carries the base graph and the base scene. Vectors run with a fixed clock and a fixed author (`src/ontology-patch.ts:99–100,639,644`).

Profile fixtures are versioned with the vectors, under `profiles/` in the same contract directory. `profile-default` holds the shipped defaults and no transition. `profile-transitions` holds the default statuses and the chain from `candidate` to `attached` to `validated`. `profile-typed` holds two node types and one relation type that admits exactly one pair of endpoint types. A vector that names no fixture uses `profile-default`. Lot L3 may rename a fixture once, before L9.

Files live under `contracts/ontology-studio-data-port/v1/vectors/` (Port §10). Each file name carries its expected result: `<id>.<expected>.json`. Dispositions, identifiers and node sets are authored from this document. Digests are computed by the engine and then frozen. Lot L1 freezes the digests of the LV-LOG vectors and of every vector that has no `apply` step. Lot L7 freezes the others, whose record bytes exist only once `summary` (L5) and the writer protocol (L7) have landed (§17). The Design System fixture adapter replays these files and holds no rule (Review:201; Split:627).

| Vector | Scenario | Expected |
|---|---|---|
| LV-LOG-01 | Absent log, then empty file. | Equal digests. Revision 0. |
| LV-LOG-02 | The same records with LF, with CRLF, with a byte-order mark, with blank lines. | Equal digests. |
| LV-LOG-03 | The same record with another key order. | Equal digests. |
| LV-LOG-04 | One character of `reason` changed. | Digest differs. |
| LV-LOG-05 | Two records swapped. | Digest differs. |
| LV-LOG-06 | A malformed line and three merge conflict markers. | Four `opaque`. Digest differs. Other dispositions unchanged. |
| LV-LOG-07 | A wrapped `{ patch }` record, then the same with another `recorded_at`. | `effective`. Digest differs. Projection equal. |
| LV-LOG-08 | A record with `graphify_ontology_patch_v1`. | `effective`. |
| LV-LOG-09 | A record holding the number `1e999`. | `opaque`. |
| LV-LOG-10 | A record with `status: "proposed"`. | `not_a_decision`. |
| LV-LOG-11 | Two records with one `id`. | Second is `duplicate_id`. |
| LV-LOG-12 | A record with `operation: "future_verb"`. | `unsupported_operation`. |
| LV-LOG-13 | A base that repeats one node `id`. | The first occurrence is the node. One `issues` warning, `duplicate_base_node_id`. |
| LV-LOG-14 | A record whose `id` and target identifiers carry surrounding whitespace, and an `evidence_refs` entry that carries some. | Identifiers are read trimmed. The evidence entry is compared as written (LOG-9). |
| LV-ACC-01 | `accept_match` of a candidate with two relations, one to the canonical, one duplicating a relation of the canonical. | `effective`. Alias map set. Aliases and terms merged. Self-relation absent and duplicate collapsed in `resolved_relations`, with the union of evidence. |
| LV-ACC-02 | The candidate is already merged. | `conflict`. |
| LV-ACC-03 | The canonical is a merged member. | `conflict`. |
| LV-ACC-04 | An unknown node identifier. | `orphan`. |
| LV-ACC-05 | The pair was rejected earlier. | `conflict`. |
| LV-ACC-06 | `a` into `b`, then `b` into `c`. | Both `effective`. `a` resolves to `c`. |
| LV-ACC-07 | Candidate equals canonical. | `invalid_record`. |
| LV-ACC-08 | The candidate carries a label, two aliases and three terms, and one of the aliases is already on the canonical. | `effective`. Aliases and terms in the order of PRJ-7, without the duplicate. |
| LV-REJ-01 | `reject_match` in pair form. | `effective`. Queue item decided. No node change. |
| LV-REJ-02 | Rejection after the accepted merge of the same pair. | `conflict`. |
| LV-REJ-03 | The same rejection twice. | Second is `redundant`. |
| LV-REJ-04 | `mapping_id` form. | `effective`. Only the item with that `id` is decided. |
| LV-REJ-05 | Candidate-alone form, then `accept_match` of that candidate. | `effective`, then `conflict`. |
| LV-REJ-06 | Pair form with an unknown candidate. | `orphan`. |
| LV-REJ-07 | `mapping_id` form with an identifier that no queue item carries. | `effective`: this form checks no existence. |
| LV-REJ-08 | `mapping_id` and a pair in one target, then `accept_match` of that pair. | `effective`: only the queue item is rejected. Then `effective`: the pair was not. |
| LV-CRE-01 | `create_canonical`. | `effective`. Identifier per CID-1. No `status`, no `trust`. |
| LV-CRE-02 | Node type absent from the profile. | `not_admitted`. |
| LV-CRE-03 | Create, then `add_relation` to the created identifier. | Both `effective`. |
| LV-CRE-04 | Create, then `merge_alias` on it. | Both `effective`. |
| LV-CRE-05 | Create, then `accept_match` of a base node into it. | Both `effective`. |
| LV-CRE-06 | A `label` that holds only whitespace. | `invalid_record`. |
| LV-ALI-01 to 05 | New alias. Existing alias. Alias on a merged member. Alias equal to the node's own `id`. Alias that another node carries. | `effective`. `redundant`. `conflict`. `redundant`. `effective`. |
| LV-STA-01 to 07 | Allowed transition. Transition not listed. `from_status` that does not hold. Status absent from the profile. Second transition from the projected status. Base status `reference` with an empty transition list. Base status `reference` with a list that does not name it. | `effective`. `not_admitted`. `conflict`. `not_admitted`. `effective`. `effective`. `not_admitted`. |
| LV-REL-01 to 08 | New relation. Unknown relation type. Endpoint types not admitted. Merged endpoint. Equal triple. A relation from a node to itself. A base relation that already carries the created identifier. A triple that equals a base relation only after alias resolution. | `effective`. `not_admitted`. `not_admitted`. `conflict`. `redundant`. `invalid_record`. `conflict`. `effective`, collapsed in `resolved_relations`. |
| LV-RJR-01 to 06 | By identifier. By triple. `relation_type` alone. `add_relation` of a rejected triple. An identifier beside a triple that disagrees. An identifier that two base relations carry. | `effective`. `effective`. `invalid_record`. `conflict`. `effective`: the identifier wins, and the relation of the triple is untouched. `effective`: both relations are rejected. |
| LV-DEP-01 to 03 | Deprecate. Deprecate again. Deprecate, then `merge_alias` on the node and `accept_match` into it. | `effective`. `redundant`. `effective`, `effective`, `effective`. |
| LV-SUP-01 to 05 | Supersede. Already superseded. Superseded replacement. Same node twice. Supersede, then `deprecate_entity` on the first node. | `effective` and deprecated. `conflict`. `conflict`. `invalid_record`. `effective`, then `redundant`. |
| LV-REV-01 | Revert an `accept_match`. | REV-4 holds against the log without both records. |
| LV-REV-02 | Revert a `create_canonical` that a later `add_relation` uses. | Write refused, `has_dependents`. As a stored log: relation `orphan`. |
| LV-REV-03 | Revert a merge that made a later merge `conflict`. | The result member `reactivates` names the later merge. After the write the later merge is `effective`. |
| LV-REV-04 to 07 | Revert a revert. Unknown identifier. Second revert of one decision. Revert placed before its target. | `invalid_record`. `orphan`. `redundant`. `orphan`. |
| LV-REV-08 | Revert a decision that was `conflict`. | Target `reverted`. Revert `redundant`. State unchanged. |
| LV-REV-09 | The same revert record twice. | Second is `duplicate_id`. The target is cancelled once. |
| LV-REV-10 | Revert naming the `id` of a record whose status is `proposed`. | `orphan`: that record is not a decision. |
| LV-REV-11 | Revert a decision that was `redundant`. | Target `reverted`. Revert `effective`. State unchanged. |
| LV-REV-12 | Revert without `decision_id`. | `invalid_record`. Nothing is cancelled. |
| LV-REV-13 | A `future_verb` decision, then a revert of it. | Target `reverted` (not `unsupported_operation`). Revert `redundant`. The write is valid (§13). State unchanged. |
| LV-REV-14 | An effective `accept_match`, then a `create_canonical` that carries the same `id`, then a revert naming that `id`. | The `accept_match` is `reverted`. The `create_canonical` stays `duplicate_id` and creates no node. The revert is `effective`, not `orphan`. The projected state equals the base (REV-4). |
| LV-RBS-01 | New graph hash, targets unchanged. | `effective`, `rebased`. |
| LV-RBS-02 | New graph hash, the label of a target changed. | `target_changed`. |
| LV-RBS-03 | New graph hash, registry-backed node renamed, same registry record. | `effective`. |
| LV-RBS-04 | New graph hash, a target is gone. | `orphan`. |
| LV-RBS-05 | New graph hash, record without `summary`. | `effective`, `rebase_unverified`. |
| LV-RBS-06 | New graph hash. The snapshot holds a `registry_record_id`, and the node now carries another one. | `target_changed`. |
| LV-RBS-07 | New graph hash, `reject_match` by `mapping_id`. | `effective`, `rebased`: the guarded set is empty. |
| LV-RBS-08 | New graph hash, `add_relation` whose endpoint was created by an earlier decision of the log. | `effective`: a created node is exempt from the guard. |
| LV-PRF-01 | Non-breaking profile change: an added node type. | Every disposition unchanged. |
| LV-PRF-02 | Breaking change `removed_status`, with a `set_status` to that status in the log. | `not_admitted`. |
| LV-PRF-03 | Breaking change `removed_relation_type`, with an `add_relation` of that type in the log. | `not_admitted`. |
| LV-PRF-04 | `engram.metamodel/v1` profile, presentation changed only. | `profile_hash` equal. No record rebased. |
| LV-PRF-05 | The profile gains its first transition list, a change classified `widened_status_transition`. The log holds a `set_status` that the list does not cover. | `not_admitted`. |
| LV-PRF-06 | The profile gains a status. The log holds a `set_status` to it that was `not_admitted`, then a `set_status` on the same node with a `from_status`. | The first becomes `effective`. The second, whose `from_status` is the base status, becomes `conflict`. |
| LV-TRU-01 to 06 | Both tiers present and different. One tier absent. Equal tiers. `merge_alias` on an `asserted` node. `earned` node merged into a created canonical. An `earned` node and an `asserted` node each merged into one untagged node. | `trust_refused`. `effective`. `effective`. `effective`. `effective`. Both `effective` (TRU-6). |
| LV-CMP-01 | A recorded `accept_match` with one evidence reference that the base no longer knows. | `effective`, with `evidence_unresolved` holding that reference. |
| LV-CMP-02 | A recorded decision with a `schema` value that no writer emits and an empty `evidence_refs`. | The disposition that its `operation` and `target` give. Envelope members do not change it (§7). |
| LV-WRT-01 | Write with a stale `expectedLogDigest`. | Refused, `stale_decision_log`. File bytes unchanged. |
| LV-WRT-02, 03 | Known `id` with equal content. Known `id` with other content. | `already_applied`, no append. Refused, `patch_id_conflict`. |
| LV-WRT-04 | Log without a final line feed. | One record per line after the write. |
| LV-WRT-05 | Lock held past the bound. | Refused, `decision_log_locked`. |
| LV-WRT-06 | CLI, MCP tool and Studio host each append `n` patches concurrently. | `3n` records, each parsable, none lost. Final digest equals a recomputation. |
| LV-WRT-07 to 10 | Empty graph hash. Input status `applied`. Patch that cannot be canonicalized. Decision path outside the jail. | Refused: `graph_hash_missing`, `status_not_proposed`, `patch_not_canonicalizable`, `decisions_path_outside_jail`. |
| LV-WRT-11 | Pin fence at the port, two cases. A presentation-only change moves the pin token and leaves the patch hashes and the log digest equal. Then a CLI append lands between the host's pin computation and its engine call. | First: `stale_pin` at the port, the engine is never called, nothing is appended. Second: the engine answers `stale_decision_log`, and the port answers `stale_pin` (Port PIN-4a). |
| LV-WRT-12 | The audit append fails after the authoritative append. | The write succeeds. Warning `audit_append_failed`. `changed_files` lists the decision log only. |
| LV-WRT-13 | A patch that carries its own `summary`, `applied_at` and `applied_by`. | The stored record holds the engine's values. |
| LV-WRT-14 | Replay of an applied patch after the graph hash moved. | `already_applied`. Nothing is appended. |
| LV-WRT-15 | Validation of a patch whose verb is unknown. | Invalid, `unsupported_operation`, with its `patch_id`. |
| LV-VIEW-01 to 04 | Merged member in the scene. Store-backed window with a decision in the log. Materialized against live. Queue after a rejection. | Absent. Unavailable. Byte-equal. Item decided, queue stale by digest. |
| LV-VIEW-05 | Empty log. | The projected scene, hierarchies and entity views equal the base ones, byte for byte. |
| LV-VIEW-06 | `create_canonical`. | The node is in the scene with the weight and shape that the builder derives, and with no position member. Its entity view is the empty sidecar with its `type`. |
| LV-VIEW-07 | `accept_match` of a member with three links: one to the canonical, one that duplicates a link of the canonical, one to a third node. | The first is removed, the second is removed, the third is re-pointed to the canonical. Weights follow the new degrees. |
| LV-VIEW-08 | `reject_relation`. | Every link with that triple is gone from the scene. |
| LV-VIEW-09 | `accept_match` of a member that a registry hierarchy lists. | The scene hierarchy is rebuilt over the base arcs without that `registry_record_id`. |
| LV-VIEW-10 | Retrieval query with an effective decision in the log. | Unavailable. (The model-scoped `server_retrieval: false` is asserted by the Port contract's P7 host conformance, not by this vector.) |
| LV-VIEW-11 | Profile declaring `visual_encoding`, empty log. | Projected scene uses built-in shapes (no profile passed, VIEW-6a) and equals the vector's base scene byte-for-byte, positions included. |

## 17. Test-first Engram lots

[JUDGMENT] Each lot observes its named failure, makes its own gate green and replays the earlier gates. Node, TypeScript and Vitest throughout. Zero Python (G0A:427). Line caps are set by the conductor at lot planning.

| Lot | First failing assertion | Passing change |
|---|---|---|
| L1. Log reader and digest | LV-LOG-02 gives two digests for LF and CRLF, or LV-LOG-06 throws. | Entry classification, string reading (LOG-9), `P-DECISION-LOG`, digest and revision. Freeze the digests of the LV-LOG vectors and of every vector without an `apply` step. A vector with an `apply` step asserts its dispositions and identifiers here, with its digests marked `pending-l7`. |
| L2. Pure decision context | Building a context from in-memory documents touches the filesystem or runs `git`. | Split `OntologyPatchContext`. Keep `loadOntologyPatchContext` as the disk adapter. Add the pure builder, with the normalizer map. |
| L3. Evaluation, nine verbs | LV-ACC-02 validates, or LV-CRE-03 fails with "does not exist in ontology nodes". | Widened admission of any non-empty `operation` (§13). `evaluateDecision`, the state, the classification, the dispositions and their precedence, array order (PRJ-7). LV-ACC, LV-REJ, LV-CRE, LV-ALI, LV-STA, LV-REL, LV-RJR, LV-DEP, LV-SUP, LV-CMP. The release notes state the change of CMP-1. |
| L4. Reversal | LV-REV-01 leaves the merge in the projection. | `revert_decision`, the cancellation walk of §7, REV-4 to REV-7. |
| L5. Rebase and profile change | LV-RBS-02 merges the renamed node, or LV-PRF-02 keeps the removed status. | `summary` at apply over the guarded set, the identity guard, the rebase flags, `not_admitted`. |
| L6. Trust | LV-TRU-01 validates. | TRU-1 at evaluation, reusing the shipped predicate. LV-TRU-06 locks TRU-6. |
| L7. Validation and writer protocol | LV-WRT-01 appends, or LV-WRT-06 loses a record. | Validity through the fold, issue and warning codes, result members, lock, fence, line guard, idempotent replay, the commit point. Freeze the digests marked `pending-l7`. The release notes state the change of CMP-1. |
| L8. Views, materialization, rebuild | LV-VIEW-03 differs between a live read and the materialized file, or LV-VIEW-05 differs from the base. | The projected graph and the view rules VIEW-6 to VIEW-8, MAT-0, `projection.json`, `engram ontology rebuild`, queue regeneration and digest stamp, FRS-1 to FRS-3. The release notes state the marker case of FRS-1. |
| L9. Vector package | A vector listed in §16 is absent from the published directory, a file name does not carry its expected result, or a digest is still marked `pending-l7`. | Emit the vector files, the profile fixtures and their manifest entries (Port §10, §11). The manifest build refuses a `pending-l7` digest. |

**Order across the two specifications.** [JUDGMENT] L1, then Port P1 to P3, then L2 to L7, then Port P4, then L8, then Port P5, then L9, then Port P6 and P7. Conductors may re-sequence inside that order. Two gates may not move. First, `contract.json` at revision 1 cannot be built before L9 and Port P6: it lists every vector with its digest, and the digests of the vectors with an `apply` step exist only after L7. Second, the triple that `@sentropic/contracts` pins exists only after Port P6 (Port DIG-6). What GO-1 can record before any lot is the commit of the two texts (Port DIG-4). The split's `OS-1` gate reads "amendment vectors/transcripts green in Engram CI" (Split:706), and its `OS-4a` scope reads "implements the Engram amendment" (Split:709). The two overlap on L1 to L8, and the re-pricing has to place those lots on one side.

**Inputs for re-pricing.** The split asks Engram to re-price its `OS-1` and `OS-4a` shares after this draft (Split:390 item (e), 892). Work that revision r6 did not count: the pure decision context (L2), the tenth verb and its cancellation walk (L4), the record summary and the identity guard (L5), view construction over a projected graph and queue regeneration over the projected state (L8), and the vector package with its profile fixtures (L9). Round 1 of the Muse review enlarged three of them: the cancellation walk (Review2, B6), the snapshot and the guarded set (B7, B8), and view construction (B1). This document gives no figure in agent-hours.

## 18. Open decisions

| Question and owner | Options | Recommendation [JUDGMENT] |
|---|---|---|
| How is a wrong decision undone? Engram. (LC:30. ALG:35,143,185.) | (A) The `revert_decision` verb of §10. (B) Editing the git-tracked file, as today. (C) Inverse meaning for existing verbs, such as a rejection after a merge. | A. B leaves the Studio without an undo and moves the digest by hand. C covers four verbs out of nine and replaces CNF-1 with a later-wins rule for some pairs. |
| Does a decision write still create `needs_update`? Engram. (LC:216. `src/ontology-patch.ts:650`.) | (A) No: FRS-1 to FRS-3. (B) Yes, cleared by `ontology rebuild`. | A. Under B one file carries two causes, and a rebuild cannot know whether the base cause still holds. |
| Is the identity guard blocking? Engram. (§11.) | (A) Blocking: `target_changed` has no effect. (B) Advisory: the decision applies and is flagged. | A. A wrong merge shown as fact costs more than a decision to take again. |
| Should the patch context carry `reconcilable`? Engram, with the memory lane. (MEM:153–156. `src/ontology-patch.ts:40–60`.) | (A) Leave it to candidate generation. (B) Load it and refuse `accept_match` on a node that opted out. | A for this amendment. B needs a decision on how the opt-in is expressed. |
| One decision log per model or per corpus? Engram. How a multi-model build sets `decisions_path` is `unverified`. | (A) Per corpus: one log, each model's projection carries what its base admits, behind RBS-3. (B) Per model. | A, if the build already shares the path. The rules of §11 make both safe. |
| Should the canonical's entity view aggregate member occurrences and citations? Engram. (ALG:33. `src/studio-assets.ts:437`.) | (A) List members only, as in VIEW-1. (B) Aggregate after the occurrence payload is typed. | A now, B as a later amendment. |
| Lock durations and placement. Engram. (WRT-1, WRT-2.) | (A) Beside the decision file, 2 s and 30 s. (B) Under the state directory. | A. B does not exclude two state directories that share a log. |
| Are window, group counts and the search index projected in v1? Engram and s-conductor. (MAT-0. Split:428–429,711–712.) | (A) No: the names are reserved, and the shipped fallbacks apply once a decision is effective. (B) Yes: this amendment defines their construction over the projected graph, and the lot is priced. | A. No rule exists for B today. A needs a ruling all the same, because it removes the hosted windowed first paint from Wave 1 (Port §14, §15). |
| Does an envelope defect change the disposition of a stored record? Engram. (§7. CMP-6.) | (A) No: only `id`, `operation`, `status`, `target` and the rebase inputs count. (B) Yes: a fourteenth disposition for a record whose envelope is invalid. | A. A renamed source or a legacy identifier must not undo a decision (LC:29). |
| Is the trust rule pairwise or cluster-wide? Engram, with the memory lane. (TRU-6. MEM:157–160.) | (A) Pairwise, as shipped. (B) Compare with every member already merged into either node. | A for this amendment, recorded as a limit. B changes what MEM asks of the ontology lot and belongs to that lane. |
| Does `reject_match` require its nodes to exist? Engram. (§7. `src/ontology-patch.ts:440–444`.) | (A) Yes, except in the `mapping_id` form. (B) No, as shipped. | A. A rejection that names no node has nothing to guard and nothing to show. |

**Recommendations of review round 2.** Round 2 of the Muse review (`REVIEW-studio-specs-wonder-r2.md`, §6) recommends an outcome for three open decisions. They are recorded here as the reviewer's recommendations. None is a decision: each waits for an owner ruling, which GO-1 records.

| Open decision | Reviewer's recommendation | Grounds the review gives |
|---|---|---|
| Are window, group counts and the search index projected in v1? (MAT-0, row above.) | Option A: reserve them. GO-1 records the ruling and states its consequence in words: server retrieval goes dark for a model after its first effective decision. The split's `OS-3` can then design the disabled state in Wave 1. | No construction over a projected graph exists for any of the three artifacts, so option B would freeze a promise to write three. The fallbacks ship today and already serve every corpus without a store. A base window or a base index served after a decision would contradict the projection that every other view shows. The review adds that under option B this amendment is not freezable. |
| Is a revert offered in the Studio in Wave 1? (Port §14.) | Option A, with one pricing correction: a revert action on the audit panel, priced in the split's `OS-3`, and not a tenth editor in `OS-5`. A confirm-and-apply action is enough for Wave 1, and batch undo (REV-8) can wait. | Wave 1 ships accept and reject, and the projection makes an accepted merge visible at once (CMP-1), so its undo ships beside it. The engine, the DTOs and the host already carry what the action needs: the tenth verb (§10), the disposition on each decision-log item (Port §7.7), the fenced `applyPatch` (Port PIN-4a), and the `reactivates` and `has_dependents` answers (§13). Undo from the CLI only saves one Design System control, since the CLI path exists either way. |
| The split's `OS-1` gate and its `OS-4a` scope overlap on L1 to L8 (§17). | Move the gate, not the lots. L1 to L8 stay in `OS-4a`, with Port P4 and P5. `OS-1` exits on what GO-1 can record: the commits of the two texts, the frozen envelope and port surface, and the Port P1 to P3 fixtures as they land. The pinned triple and the green vectors become an exit gate of `OS-4a`, which gates `OS-6` as today. The split edits that follow are the `OS-1` gate column, the `OS-4a` gate and the GO-1 sentence (Split:921): the commits at GO-1, the digest at the exit of `OS-4a`. | The split's own scope sentence places the implementation in `OS-4a` (Split:709). No lot waits for the triple before `OS-6`. A manifest pinned in two stages would allow a conformance claim against no lifecycle vector. The programme total is unchanged. |

## 19. Coverage of the review findings

| Finding | Where it is settled |
|---|---|
| B2 item 1, per-verb effect | §7 |
| B2 item 2, reversal | §10 |
| B2 item 3, rebase and profile drift | §11 |
| B2 item 4, stale marker; r5 finding 2 | §14, FRS-1 to FRS-4 |
| B2 item 5, existing logs | §6, §15 |
| B2 change 3, vectors versioned by Engram | §16, L9, Port §10 |
| B2 change 4, one projection function | PRJ-2, MAT-3 |
| B2 change 5, re-pricing | §17, inputs only |
| M3 item 1, third list and three profile vectors | `not_admitted`, LV-PRF-01 to 03 |
| M6, fixture adapter replays transcripts | §16 |
| m4, trust guard and `merge_alias` | §12, TRU-3 |
| m5, created-node field named by Engram | CID-5 |
| m6, digest input cases | §6, `patch_not_canonicalizable` |
| m7, empty graph hash | `graph_hash_missing` |
| r6 finding 3, record format; finding 4, lock placement | §11 summary, WRT-1, WRT-2 |

Items of the split that stay with Sentropic: HTTP status codes, `If-Match` and `Idempotency-Key` headers, receipts and the event envelope. This amendment gives them the engine facts they map: issue codes, `log_digest` and `already_applied`.

The findings of the Muse review of v0.1.0 are closed one by one in the changelog below.

## Summary

- The decision log is the authoritative state. One pure function projects it over a base that never holds a decision effect. A rebuild and a publication call that same function.
- Each of the nine shipped verbs has stated preconditions and one stated effect. A tenth verb, `revert_decision`, cancels one decision by a compensating record, under a cancellation walk in file order.
- Every log entry receives one of thirteen dispositions. A decision that lost its effect is reported with its reason: `orphan`, `conflict`, `not_admitted`, `target_changed` or `trust_refused`.
- A log state is identified by a computed digest over its entries. Writers append under one lock and may fence on that digest.
- A recorded decision is carried to a new base behind an identity guard with a stated node set per verb, and to a new profile by re-evaluation. No record is rewritten.
- Views are built by the shipped builders over a projected graph. Window, group counts and the search index are not projected in v1, and that choice needs a ruling because it changes the split's hosted first paint.
- One hundred and thirty-two named vectors carry their expected result. Engram generates and versions them. No digest value in this document was computed. Counts are as drafted in this revision. Completeness against every refusal is what the Muse review tracks, and it closes only when the files land in lots L1 to L9.

## Changelog

### v0.2.2 · 23 November 2026 · erratum, revert naming the `id` of a `duplicate_id` record

The last sentence of the cancellation-override paragraph of §7 put `duplicate_id` among the records for which « a revert naming one is `orphan` ». That contradicted three statements of the same section. Classification test 4 gives `duplicate_id` to a record whose `id` an earlier decision already carries. The first decision that carries an `id` owns it. The first pass makes a revert `orphan` only when no earlier decision owns the `id` it names. The sentence now states both cases: an `id` that no earlier decision owns gives `orphan` (LV-REV-10, unchanged), and the `id` that a duplicate carries is judged against its owner. The first-pass table already governed, so no engine behaviour and no other rule changes. LV-REV-14 locks the case, and the vector count moves from 131 to 132 (Summary).

Checked and unchanged, because each states the rule correctly: LOG-6, classification test 4, the ownership sentence, the first-pass table and the sentence after it, the `orphan` and `duplicate_id` rows of the disposition table, REV-2, REV-3, CNF-4, CMP-4, LV-LOG-11, LV-REV-04 to 07, LV-REV-09 and LV-REV-10. The Port contract states no revert-target rule of its own and is not edited.

The defect was flagged by the Engram re-check of the split at r8 (`RECHECK-studio-split-r8-fable.md`, E1). The split adopted the correct reading at r9 without waiting for this revision. The sentence came word for word from round 2 of the Muse review (`REVIEW-studio-specs-wonder-r2.md`, §1.2), so that reviewer should see this erratum. This revision changes the digest and the commit of this document: a pin that names v0.2.1 has to move to the commit that carries v0.2.2. Author of this erratum: Claude Opus 5.5.

### v0.2.1 · 23 November 2026 · round 2 of the Muse review, freeze path

Round 2 of the Muse review (`REVIEW-studio-specs-wonder-r2.md`, in the directory of Review2) holds both texts not freezable for four edits only. Its §7 lists them, and its §1.1, §1.2 and §5.3 give each text word for word. The four are applied verbatim, and no other rule changes: (1) VIEW-6a and VIEW-6b replaced, MAT-2 completed, LV-VIEW-11 added (B1 remnant, its §1.1); (2) the cancellation-override paragraph, placed after the second pass in §7 of this amendment, and LV-REV-13 (B6 remnant, its §1.2); (3) the capabilities-scoping note of the Port contract §7.2 (R2-N1, its §5.3); (4) the three `server_retrieval` substitutions that go with it, in MAT-0 and in the Expected cell of LV-VIEW-10 here, and in the notes of the Port contract §7.3. The vector count moves from 129 to 131 (Summary). §18 records the reviewer's recommendations on three open decisions, as recommendations.

**Limits of this session.** It read, in the pinned worktree, the lines that edit 1 cites for the first time. Two cited ranges stop short of the operative lines. `src/studio-scene.ts:777–780` carries `snapshot_id` and `layout_id` through, and `layout_dims` follows at `:781–782`. `src/studio-export.ts:708–711` holds the comment and the build that announce the export layout, and the layout call is at `:751`. Both citations stay as the review gives them.

### v0.2.0 · 23 November 2026 · fold of round 1 of the Muse review

Review2 returned CHANGES REQUIRED on v0.1.0. Its header counts 8 blockers, 14 majors and 14 minors. Its body holds twenty majors, C-M1 to C-M10 and A-M1 to A-M10. All twenty are folded. This table closes the findings that touch this amendment. The Port contract's changelog closes the others.

| Finding | Status | Where |
|---|---|---|
| B1 (joint) | Folded, deviation 7 | VIEW-1 to VIEW-8, MAT-0, MAT-2. LV-VIEW-05 to 10. |
| B3 (joint) | Folded | WRT-5, LV-WRT-11. Port PIN-4a, PAT-2, PAT-2a. |
| B5 (joint) | Folded | §5, "One `graph_hash`". |
| B6 | Folded, deviation 6 | §7: classification and the two passes. REV-2, REV-3, REV-5, REV-6. LV-REV-08 to 12. |
| B7 | Folded, deviations 1 and 2 | LOG-9, LOG-10, `patch_id_conflict`, `already_applied`, the paragraph after the summary listing in §11. LV-LOG-13, LV-LOG-14, LV-WRT-13, LV-WRT-14. |
| B8 | Folded | RBS-3, the paragraph after the summary listing in §11. LV-RBS-06 to 08. |
| A-M1 | Folded, deviation 8 | §7: verb table and the two paragraphs after it. LV-REL-06 to 08, LV-REJ-06 to 08, LV-RJR-05, LV-RJR-06, LV-SUP-05, LV-ALI-04, LV-ALI-05, LV-CRE-06, LV-DEP-03, LV-STA-06, LV-STA-07. |
| A-M2 | Folded | §7, "What a stored record is judged on". LOG-7. LV-CMP-01, LV-CMP-02. §18. |
| A-M3 | Folded | CMP-1, the eighth replacement of §4, the header. |
| A-M4 | Folded, deviation 3 | §11, the paragraph on the classifier. LV-PRF-05, LV-PRF-06. |
| A-M5 | Folded | WRT-1, WRT-2, WRT-3, WRT-3a. §13: admission, codes, warning codes. Lot L3. LV-WRT-12, LV-WRT-15. |
| A-M6 | Folded | MAT-3, the normalizer map in §5, FRS-1. |
| A-M7 | Folded, deviation 4 | Lots L1, L7 and L9, the intro of §16, "Order across the two specifications" in §17. |
| A-M8 | Folded | TRU-6, LV-TRU-06, §18. |
| A-M9 (joint) | Folded | Warning codes in §13. Port CTX-4 to CTX-6. |
| A-M10 | Folded | PRJ-7, VIEW-2, LV-ACC-08. Port `type_order`. |
| A-m1 | Applied | §6, digest paragraph. |
| A-m2 | Applied | §11, changed-profile table. |
| A-m3 | Applied, deviation 5 | §3 row 13, "Audit files" in §13. |
| A-m4 | Applied | REV-6. |
| A-m5 | Applied | §16, profile fixtures. |
| A-m6 | Applied | VIEW-8. |
| A-m7 | Applied | Summary. |
| C-m2, amendment part | Applied | §2. The closing commands are deleted. |

**Deviations.** Each keeps or changes a text against the review's wording, and says on what ground.

1. B7, LOG-9. The review reads every string as trimmed, evidence references included. At the pin a scalar is trimmed and an array entry is not: `stringArray` keeps an entry as written and drops only what is not a string or holds only whitespace (`src/ontology-patch.ts:326–330`), the comparison is by exact string (`:369–371`), and the context loader keeps every string (`src/ontology-patch-context.ts:32–34`). LOG-9 follows the pin, so a stored reference that carries whitespace still resolves.
2. B7, summary. "A stored `summary` is therefore always engine-written" is narrowed to the records that the engine appends. A hand-edited log can hold any `summary`, and the fold cannot tell.
3. A-M4. The review calls a change of `default_status` and a change of the transition list non-breaking for the classifier. At the pin `changed_default_status` is pushed as breaking (`src/profile-bundle.ts:1143–1145`), and a narrowed list too (`:1164,1173`). The change that the classifier does call non-breaking, and that narrows admission, is the first entry added to an empty list (`:1167–1169`, with `src/ontology-patch.ts:380`). The text and LV-PRF-05 use that case.
4. A-M7. The review's order places Port P4 to P6 before L8, while it states that P5 needs L3 to L8. The order written here is L1, P1 to P3, L2 to L7, P4, L8, P5, L9, P6 and P7. §17 also states what follows from it: the pinned triple cannot exist before P6, so the split's `OS-1` gate and its `OS-4a` scope overlap on L1 to L8.
5. A-m3. A `reject_*` patch and a patch of another verb whose input status is `rejected` do not "file differently". Both go to `rejected-patches.jsonl`, with different record statuses (`src/ontology-patch.ts:579,642`).
6. B6. The disposition of a revert is defined on what its target would have been at its own position, which one pass computes. Read literally, "in the uncancelled fold" needs one more fold per revert. Three things are added to make the rule total: the five classification tests in their order, REV-5 stated on the class "needs attention", and one clause in §13 that makes a cancelling revert valid whatever its disposition. Without that clause the review's rule and the writer's "refuse unless `effective`" would refuse the revert of a `conflict` record, which REV-3 allows and LV-REV-08 expects. No Engram line bears on this point.
7. B1. VIEW-6 is completed where two implementers could still produce different bytes: the tie between a rejected relation and its link, which is the triple (`src/ontology-output.ts:389–402`); links that resolution makes equal; positions, copied from the base scene and never recomputed (`scripts/build-studio-multimodel.mjs:149–151`); `generated_at`, repeated from the base artifact; and serialization (MAT-2).
8. A-M1. For `reject_match` the review left a choice between an existence check and the shipped absence of one. The check is chosen, and §18 lists the alternative.

**Consequence the review did not list.** MAT-0 is folded as written. It removes the hosted windowed first paint that the split prices (Split:428–429,711–712). §18 and the Port contract (§14, §15) put that before the owner.

**Limits of the fold session.** It had no shell. Three statements are taken from other texts and were not read again in code: that no code reads `rejected-patches.jsonl` (Review2, A-m3; the read path in `src/ontology-reconciliation-api.ts` was read), that one store adapter only serves windows and group counts (Split:588), and the diff of the drift commit (Review2, header).

### v0.1.0 · 23 November 2026

First draft, reviewed in Review2.
