# Contract: Ontology Studio data port (`engram` ↔ `sentropic/cluster-mesh`, Design System, `stp-apps`)

**v0.2.1 · Proposed contract · 23 November 2026 · freezable per review round 2, pending the joint pass with s-conductor.** Claude Fable 5.2 is the assigned author (owner ruling of 23 November: Fable writes, Muse wonder full max reviews). v0.2.0 folded round 1 of the Muse review (Review2: CHANGES REQUIRED). This revision applies, word for word, the four edits that round 2 of that review requires (`REVIEW-studio-specs-wonder-r2.md`, §7). The changelog at the end states what was done with every finding. Owner acceptance and implementation are pending.

- **Status:** `proposed`. Nothing in this document is decided by the owner. The freeze of the split (GO-1 and `OS-1`) waits for Engram's recorded agreement on this text and on the lifecycle amendment (Split:152,921).
- **Repository of record:** `engram` (`spec/SPEC_ONTOLOGY_STUDIO_DATA_PORT_CONTRACT.md`). The split asked for "a contract of record in Engram's `spec/`" (Review:108; Split:389,476).
- **Contract identifier:** `engram.ontology-studio-data-port/v1`.
- **Parties:**
  - **`engram`** (`@sentropic/engram` `0.28.0`, `package.json:3`). Owner of the data model. Authors and versions every schema, fixture and vector below, and implements the port.
  - **`sentropic`** (`@sentropic/contracts`, `@sentropic/cluster-mesh`). Owner of the mesh envelope. Hosts the port and pins this contract by digest (Split:400).
  - **Design System** (`@sentropic/design-system-ontology-core`). Declares structural mirror types and tests them against this contract in its own CI (Split:352,372).
  - **`stp-apps`**. Owns the hosted application shell and its HTTP adapter (Split:446,623).

## 1. What this contract fixes

The Engram review found that the data-port DTOs are Engram's compiled artifacts as a host sees them, and that a closed schema owned outside Engram would freeze them. s-conductor accepted the finding. (Review:90–109. Split:152.)

| Fixed here | Not fixed here |
|---|---|
| The JSON Schema of every DTO that crosses the data port (§7). | The mesh envelope: namespace, scope, invocation context, auth scopes, routes, headers, status codes, SSE framing, receipts (§3). |
| The version pin and its opaque token (§5). | Patch and decision semantics. They are the lifecycle amendment's (Amendment). |
| The open vocabularies and their known sets (§6). | Comment data. It belongs to the Sentropic comment store (Split:418). |
| The workspace publication: its descriptor, the sealed profile bundle, what it must never carry (§8). The shape of the upload plan (§7.8). | URL signing, the object store and the pointer row (Split:588). |
| The fixtures, the contract digest and what each party tests (§10 to §12). | Any Studio screen. The data model stays in Engram, and Engram's `studio/` receives no new UI component (owner direction of 22 November; Split:149,394). |

**Reading rule.** If a statement here and its cited source line disagree, the source line governs and this document is defective. The defect is reported, not reinterpreted (G0:34).

## 2. Evidence

**Pin.** Every citation of Engram code or specifications is at `origin/main` = `66465de8073c28c00a5f12a9650d4e54e989ec6f`.

**Drift.** `origin/main` now names `38948f4ea960c5a73d5d85abd0f52f45e00b95f4`, one commit later (`.git/refs/remotes/origin/main`, read in the fold session). The Muse review lane ran `git diff 66465de8..origin/main`: the commit is an `llm-mesh` bump with scrap changes, it touches no file cited here, and no cited line moves (Review2, header). Citations hold at both commits.

**Reading method and limit.** Neither the authoring session nor the fold session had a shell: every command failed with `EROFS` on the harness temporary directory, so `git show origin/main:<path>` could not run. Files were read from a local `engram-next` worktree, whose detached HEAD is the pinned commit (`.git/worktrees/engram-next/HEAD`). The Muse review lane ran `git status --porcelain` on that worktree and found it clean (Review2, header). The fold session read the lines cited for the first time in v0.2.0 the same way. It read the split again in the Sentropic working tree, which is still revision r7 (Split:3).

**No digest value was computed.** This document fixes preimages and procedures.

[JUDGMENT] identifies a proposed rule, name or choice. `unverified` and `source-gap` identify missing evidence.

| Key | File |
|---|---|
| Amendment | `SPEC_ONTOLOGY_LIFECYCLE_PATCH_AMENDMENT.md`, the companion amendment written with this contract |
| LC | `spec/SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md` |
| G0, G0A | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_CONTRACTS.md` and `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md` |
| Spec 2 | `spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md` |
| MemContract | `spec/memory/contracts/engram-cluster-mesh.md` |
| Review | `graphify/.graphify/scratch/design/studio-split/REVIEW-studio-split-engram-fable.md`, the Engram review of the split |
| Review2 | `graphify/.graphify/scratch/design/studio-split/REVIEW-studio-specs-wonder.md`, the Muse review of v0.1.0 of this contract and of the Amendment |
| Split | `sentropic/spec/SPEC_EVOL_ONTOLOGY_STUDIO_SPLIT.md`, revision r7, read in the Sentropic working tree |

## 3. What each party provides, and what `@sentropic/contracts` keeps

| Party | Provides | Consumes |
|---|---|---|
| `engram` | The schema bundle, fixtures, vectors and contract manifest of §10 and §11. The port implementation. The publish step and the publication verifier of §8. | The mesh envelope. A verified scope for every call. |
| `sentropic` | The mesh envelope. The hosted module that embeds the Engram library. The digest pin. | The contract manifest. DTOs as opaque payloads. |
| Design System | Mirror types, the wire-to-view mapper, a fixture adapter that replays Engram vectors. | The schema bundle, fixtures and vectors, as development dependencies only. |
| `stp-apps` | The hosted HTTP adapter. | The Design System packages. |

**`@sentropic/contracts` keeps the mesh envelope only.** [JUDGMENT]

| It keeps | It does not declare |
|---|---|
| The namespace entry of the port (Split:400). | Any DTO type or schema of §7. |
| The scope triple (tenant, workspace, optional model) and `VerifiedInvocationContext` (Split:481–485). | Any vocabulary as a closed union (§6). |
| The auth scopes (Split:647–650). | The version pin, or any rule to build or split `pin_token` (§5). |
| The method names of the port and their envelope arguments, with DTO payloads typed as opaque values (Split:547–582). | The digest of a decision log, or any patch rule (Amendment). |
| Routes, `ETag`, `If-Match`, `Idempotency-Key`, status codes (Split:422–440). | The publication descriptor (§8). |
| The SSE envelope: framing, cursor, size bound (Split:637). | The payload of an Engram event (§7.9). |
| Receipts (Split:638). | |
| One constant: the pin of this contract (§11). | |

`@sentropic/contracts` imports no Engram type. In the split's target architecture the Engram host depends on the envelope types (Split:340,400), so a type import back would close a cycle. At the pin Engram does not depend on that package yet: neither manifest declares it (`package.json:152–205,262–276`; `studio/package.json:13–29`). Engram exports the typed port interface from its own subpath, beside the implementation.

The model identifier inside the scope is an Engram value. It is the `id` of an entry of the models manifest (§7.2). The comment-changed event of Split:637 carries no Engram data and stays with Sentropic.

## 4. Conventions for every DTO

| Rule | Statement |
|---|---|
| CNV-1 | Schemas use JSON Schema draft 2020-12. They live in one bundle file, `data-port.schema.json`, as members of `$defs`. A DTO is addressed `data-port.schema.json#/$defs/<name>`. |
| CNV-2 | **Shipped shapes are carried verbatim.** A DTO that exists at the pin keeps its member names, its casing and its `schema` identifier. The scene and the profile bundle are camelCase at the pin. The patch envelopes are snake_case (`src/studio-scene.ts:174–192`; `src/profile-bundle.ts:41–53`; `src/ontology-patch.ts:126–133`). |
| CNV-3 | **New members are snake_case.** New envelopes take a `schema` member from the shipped family `engram_<name>_v<N>` (`src/schema-ids.ts:11–18`). |
| CNV-4 | **Closure.** Each DTO is `closed` or `open-additive` (§7.1). A closed DTO has `additionalProperties: false`. An open-additive DTO states a required core and accepts other members. |
| CNV-5 | A consumer ignores a member it does not know in an open-additive DTO, and renders a vocabulary value it does not know as unknown. It never rejects either. |
| CNV-6 | An absent optional member stays absent. A producer does not write `null` or a default in its place, except where the shipped shape is nullable (G0A:165,348). |
| CNV-7 | **No absolute path.** No DTO carries an absolute filesystem path, a home-relative path or a parent traversal (LC:245,326). §7.10 lists the shipped members that break this today, or that may. |
| CNV-8 | Writers emit `engram_*` identifiers. A patch received by the port may carry the legacy `graphify_*` identifier (`src/schema-ids.ts:4–8,46–48`). |
| CNV-9 | Timestamps are ISO-8601 strings as `toISOString` writes them. Intervals are epoch milliseconds under the `closed-v1` convention (`src/temporal-interval.ts:2,24–34`). |

Names that revisions r1 to r7 of the split used for Engram-owned shapes were placeholders (Review:244; Split:152). §7.11 maps each to the name minted here.

## 5. Version pin

### 5.1 Three profile families

Engram has three profile-hash regimes. The pin names the family and uses the representation of the sealed bundle for both digests.

| `profile_family` | Selected when | `profile_hash` as the profile stores it | In the pin |
|---|---|---|---|
| `legacy` | Neither row below applies: no `data_model`, and `metamodel_version` is not that literal (`src/ontology-profile.ts:617–622`). | Bare hex of SHA-256 over `JSON.stringify(stableForHash(profile))` (`src/ontology-profile.ts:620–622`; `src/ontology-guardian/digests.ts:126–130`). | Same value. No `presentation_hash`. |
| `engram.data-model/1` | `data_model` is present (`src/ontology-profile.ts:329–342`; G0A:150). `metamodel_version` is refused with it (`:337`). | Same procedure as `legacy`. | Same value. No `presentation_hash`. |
| `engram.metamodel/v1` | `metamodel_version` equals that literal (`src/ontology-profile.ts:617,649,694`). | `sha256:`-prefixed semantic digest, which excludes `presentation` and `visual_encoding` (`src/ontology-guardian/digests.ts:114–117,132–136`). | The bare hex the bundle stores: `toInternalDigest(profile_hash)`, never the prefixed string the profile carries (`src/profile-bundle.ts:565–567`; `src/ontology-guardian/digests.ts:11–15`). `presentation_hash` is likewise the bare hex the bundle stores (`src/profile-bundle.ts:568`; `src/ontology-profile.ts:630–640,689`). |

A change of visual encoding alone moves `profile_hash` for the first two families and `presentation_hash` for the third. The pin therefore moves in all three, and no client is served a stale `304` (Review:146).

**One representation in the pin.** [JUDGMENT] Both digests of the pin are bare hex for every family. The split sketch reads `contentDigest` as "`== profile_hash` as Engram stores it", prefixed for `engram.metamodel/v1` (Split:493–494). This contract overrides that comment. Outside the pin, every shape that carries a `profile_hash` keeps the form the profile stores: the patch stamp (§5.2), a patch and a recorded decision, the candidate queue and its response (`src/ontology-reconciliation.ts:2234`), the rebuild status (`src/ontology-reconciliation-api.ts:166`) and the projection manifest (Amendment §14).

**The family set is closed in v1.** A consumer that met a fourth value could not tell which hash regime the pin uses, and the presence rule of `presentation_hash` would have no answer. A fourth family is a new major (§11).

### 5.2 Members

The pin carries a `profile_ref`: the closed G0 `Pin` plus an optional catalog `namespace`, with the base and log identities beside it (`src/ontology-guardian/types.ts:13–18`). Only a `profile_ref` **with** a namespace is a G0 `QualifiedPin` (`src/model-governance.ts:6`). Without one it names a corpus-local profile, and it must never be passed where a `QualifiedPin` is required, as in `verifyModelPair` (`src/profile-bundle.ts:1383,1411,1425`).

| Member | Meaning |
|---|---|
| `model_id` | The model the pin describes. |
| `profile.pin` | `{ id, version, contentDigest }`, the closed G0 `Pin`. `contentDigest` equals the `profileHash` of the sealed bundle. |
| `profile.namespace` | Present only when the publisher declares the catalog namespace the profile was resolved from. The normalized profile has no namespace member (`src/types.ts:1276–1303`). See §14. |
| `profile_family` | §5.1. One of its three values. |
| `presentation_hash` | Present exactly for `engram.metamodel/v1`. The schema enforces it (§7.2). |
| `graph_hash` | The base graph hash, defined below. Never empty. A host and a publication refuse a model without one (Review:242; Amendment §13). |
| `decision_log_digest` | The digest of the Amendment §6. The digest of the empty log when the model has no decision file. |
| `decision_log_revision` | A display counter. Never an identity. |
| `pin_token` | §5.3. |

**One `graph_hash`.** [JUDGMENT] In this contract, in every patch stamp and in `P-PIN`, `graph_hash` is exactly one value: the `graph_hash` of the ontology manifest (`src/ontology-output.ts:482–499`), as the patch context reads it (`src/ontology-patch-context.ts:102–107`). Patch validation already fences on it (`src/ontology-patch.ts:524`), and the candidate queue records it (`src/ontology-reconciliation.ts:2233`). Two other shipped values carry a similar name and are different values: the SHA-256 of the bytes of `graph.json` (`src/cli.ts:423–425`), and the `topology_signature` of the graph, which the publication QA check compares with the `graph_hash` of a reconciliation response (`src/qa.ts:810–827`). Neither is ever used as the `graph_hash` of a pin, a stamp or a rebase. Whether that QA comparison and the queue agree at the pin is `unverified`, and lot P2 settles it (§13). A host that cannot obtain the ontology-manifest value refuses the model with `graph_hash_missing`. It never substitutes another hash. A member named `graph_hash` inside a carried shipped artifact (the workspace manifest, the two hierarchy sidecars) keeps the value its own emitter wrote. This contract does not equate it with the pin's.

**Governance is not in the pin.** A tier G document versions independently over the same tier N pin, so a model has no single governance pin (G0A:237). Where governance is shown, the manifest carries a separate list of `QualifiedPin`, restricted by the catalog visibility rule: a private companion is missing for another tenant (G0A:125,273). No tier N or tier G type is modelled again in this contract.

**Patch stamps are separate.** A patch must carry `profile_hash` exactly as the profile stores it, which is the prefixed form for `engram.metamodel/v1` (`src/ontology-patch.ts:523`). The manifest gives each model a `patch_stamp` with the two strings a patch must carry. A client never derives them from the pin.

### 5.3 Token

[JUDGMENT]

~~~text
P-PIN = {
  "decision_log_digest": <string>,
  "format":              "engram.version-pin/1",
  "graph_hash":          <string>,
  "model_id":            <string>,
  "presentation_hash":   <64 hex> | null,
  "profile":             { "namespace": <string> | null, "pin": { "contentDigest", "id", "version" } },
  "profile_family":      <one of the three values of §5.1>
}

pin_token = "p1-" + digestOfPreimage(P-PIN)
~~~

`null` is the stated absent case (G0:931): an absent `presentation_hash` or `profile.namespace` enters the preimage as `null` and stays absent in the DTO (CNV-6). `digestOfPreimage` is SHA-256 over RFC 8785 canonical bytes (`src/ontology-guardian/canonical.ts:96–99`).

| Rule | Statement |
|---|---|
| PIN-1 | Only Engram code builds a token. Every other party treats it as opaque and compares whole tokens for equality. No party splits it. |
| PIN-2 | The derivation is fixed so that a local host and the publish step give the same token for the same pin. It is not an interface for consumers. |
| PIN-3 | A token matches `^[A-Za-z0-9._-]{1,128}$`. It needs no escaping in a quoted header value. |
| PIN-4 | A host uses the model's `pin_token` as the validator of every model-scoped read. A write is fenced on it (`expected_pin_token`). When the current token differs, the port answers the error `stale_pin` and nothing is appended. The header mechanics are the envelope's. |
| PIN-4a | Fence sequence at a host, in order. (1) Compute the current pin. (2) Compare its `pin_token` with `expected_pin_token`. On a mismatch answer `stale_pin`, append nothing and do not call the engine. (3) Call the engine with `expectedLogDigest` set to the `decision_log_digest` of the pin computed in step 1 (Amendment WRT-5). An engine refusal `stale_decision_log` means that a CLI or MCP append raced step 1, and the port maps it to `stale_pin`. A presentation-only change therefore refuses the write at step 2 although the patch hashes still match. The client reads the pin again and sends the same patch `id`: nothing was appended, so the `id` is still free. |
| PIN-5 | `decision_log_revision` and timestamps are outside `P-PIN`. |

## 6. Open vocabularies

| Rule | Statement |
|---|---|
| VOC-1 | Every vocabulary of this table travels as a string. No schema of §7 lists its values. |
| VOC-2 | The host advertises the known patch verbs and trust tiers in its capabilities. A host advertises the verbs its engine evaluates, which may be fewer than the known set. Statuses are per model and travel in the manifest. |
| VOC-3 | The fixtures of §10 lock the known sets. A change to a known set is a contract revision, not a new major (§11). |
| VOC-4 | The statuses a decision may set for a model are the `hardening.statuses` of that model's profile (`src/ontology-patch.ts:374–379`). The six shipped values are the default used when a profile declares none (`src/ontology-profile.ts:41,184–187`). A read may carry a status outside that list: the scene documents `reference` (`src/studio-scene.ts:249–256`). A consumer renders it as it is. |

| Vocabulary | Known set at the pin | Source |
|---|---|---|
| Patch verb | Ten verbs: `accept_match`, `reject_match`, `create_canonical`, `merge_alias`, `set_status`, `add_relation`, `reject_relation`, `deprecate_entity`, `supersede_entity`, `revert_decision`. | `src/ontology-patch.ts:12–21`; Amendment §10 |
| Patch status | `proposed`, `applied`, `rejected` | `src/ontology-patch.ts:23` |
| Trust tier | `earned`, `asserted`, `signed`, `unverified` | `src/ontology-patch.ts:78` |
| Status | Per profile. Default: `candidate`, `attached`, `needs_review`, `validated`, `rejected`, `superseded`. | `src/ontology-profile.ts:41`; `src/types.ts:926–931` |
| Assertion basis, derivation method | Free strings of the profile | `src/ontology-profile.ts:105–106` |
| Disposition | The thirteen values of the Amendment §7, in four classes (below) | Amendment §7 |
| Issue code | The codes of the Amendment §13 | Amendment §13 |
| Candidate kind, status, tier | `entity_match`. `candidate`. `exact`, `fuzzy`, `structural`. | `src/ontology-reconciliation.ts:13–17` |
| Changed-file kind and action | `authoritative_decision_log`, `audit_log`, `stale_marker`. `append`, `write`. | `src/ontology-patch.ts:117–118` |
| Node shape, fill, border | Seven shapes. `solid`, `hollow`. `normal`, `bold`. | `src/ontology-profile.ts:64,69–70` |
| Hierarchy status, kind and class source | Tree: `reference`, `validated`. Overlay: six values. `tree`, `forest`. `profile`. | `src/scene-hierarchies.ts:62,73,88`; `src/types.ts:1134` |
| Citation modality and confidence | Eight modalities. `EXTRACTED`, `INFERRED`. | `src/types.ts:539,541` |
| Description status and source | `generated`, `insufficient_evidence`. `description`, `rationale`. | `src/studio-assets.ts:412–419,505–530` |
| Answer mode, fusion method, seeding | `offline`, `online`, `agent`. `rrf`. `fused-seed`. | `src/retrieval/answer-pack.ts:77,137,142` |
| Profile change code and annotation | The classifier's codes, such as `removed_status`. `covered_by_alias`, `covered_by_synonym`. | `src/profile-bundle.ts:80,973,1049,1141` |
| Window strategy | `degree-top-n` | `src/storage/types.ts:123–127` |
| Artifact name | The names of §8.2 | §8.2 |
| Port error code | The codes of §7.9 | §7.9 |
| Verifier code | The codes of §8.7 | §8.7 |

**Disposition classes are part of the known set.** `effective` and `redundant` are *in effect* (information). `reverted` and `duplicate_id` are *withdrawn* (information). `orphan`, `conflict`, `not_admitted`, `target_changed` and `trust_refused` are *needs attention* (warning). `invalid_record`, `unsupported_operation`, `not_a_decision` and `opaque` are *malformed* (warning). A consumer renders a disposition it does not know as needs attention, with its raw string.

Eight value sets are structural and stay closed, with `enum` or `const` in the schema: issue `severity` (`error`, `warning`; `src/ontology-patch.ts:104`), `registriesMode` (`full`, `bindings-only`; `src/profile-bundle.ts:52`), `layout_dims` (2, 3; `src/studio-scene.ts:104,203`), the publication `state` of §7.8, `profile_family` (§5.1), the provenance link `kind` (`file`, `url`; `src/converted-provenance.ts:403`), the decision-log `source` (`authoritative`, `audit`; `src/ontology-patch.ts:135`) and the `proposed_patch_operation` of a candidate (`accept_match`; `src/ontology-reconciliation.ts:62`). [JUDGMENT] A consumer dispatches on each of the last four: which hash regime a pin uses, whether a link is fetched through the port or opened as an address, whether an item carries `effect`, and which patch a queue item proposes. "Render as unknown" is not a defined behaviour for a value that selects a code path. A new value in any of these sets is a new major (§11).

Engram records why a narrow list is a defect: three lots once landed three vocabularies for one field (`src/ontology-patch.ts:62–75`). An unknown tier loads as absent (`src/ontology-patch-context.ts:43–62`).

## 7. DTO catalogue and schemas

### 7.1 Catalogue

| Port method (Split:547–582) | Request | Response | Wire `schema` | Shipped source | Closure |
|---|---|---|---|---|---|
| `getCapabilities` | — | `capabilities` | `engram_ontology_port_capabilities_v1` | New | open-additive |
| `listModels` | — | `models` | none (`version: 1`) | `studio/src/lib/modelStore.svelte.js:15–27` | open-additive |
| `getManifest` | — | `manifest` | `engram_ontology_port_manifest_v1` | New | closed envelope |
| `getScene` | layout identifier | `scene` | none | `src/studio-scene.ts:181–210` | open-additive |
| `getWindow` | strategy, layout, limit | `window` | none | `src/storage/types.ts:168–191` | open-additive |
| `getGroupCounts` | axis | `groups` | none | `src/storage/types.ts:244–260` | open-additive |
| `getSceneHierarchies` | — | `scene_hierarchies` or `null` | `engram_scene_hierarchies_v1` | `src/scene-hierarchies.ts:100–105` | open-additive |
| `getClassHierarchies` | — | `class_hierarchies` or `null` | `engram_ontology_class_hierarchies_v1` | `src/types.ts:1177–1183` | open-additive |
| `getEntity` | entity identifier | `entity` | none | `src/studio-assets.ts:421–445` | open-additive |
| `queryRetrieval` | `retrieval_request` | `answer_pack` | `engram_answer_pack_v1` | `src/retrieval/answer-pack.ts:129–151` | open-additive |
| `getSourceProvenance` | — | `provenance` or `null` | `engram_cited_source_provenance_v1` | `src/converted-provenance.ts:553–556` | open-additive |
| `readSource` | relative path | bytes and a content type | not JSON | `src/studio-sources.ts:104–138` | §7.6 |
| `listReconciliationCandidates` | `recon_filter` | `recon_list` | `engram_ontology_reconciliation_candidates_response_v1` | `src/ontology-reconciliation.ts:141–166` | open-additive |
| `getReconciliationCandidate` | candidate identifier | `candidate` | none | `src/ontology-reconciliation.ts:50–67` | open-additive |
| `getDecisionLog` | `decision_log_query` | `decision_log` | `engram_ontology_reconciliation_decision_log_v1` | `src/ontology-patch.ts:137–165` | open-additive |
| `getRebuildStatus` | — | `rebuild_status` | `engram_ontology_rebuild_status_v1` | `src/ontology-reconciliation-api.ts:19–37` | open-additive |
| `validatePatch` | `patch` | `patch_validation` | `engram_ontology_patch_validation_v1` | `src/ontology-patch.ts:25–38,108–113` | open-additive |
| `dryRunPatch` | `patch` | `patch_apply` | `engram_ontology_patch_apply_v1` | `src/ontology-patch.ts:126–133` | open-additive |
| `applyPatch` | `apply_request` | `patch_apply` | same | same | request closed |
| `initiateWorkspacePublication` | `publication_descriptor` | `upload_plan` | `engram_ontology_workspace_publication_v1`, `engram_ontology_publication_upload_plan_v1` | New | closed |
| `completeWorkspacePublication`, `getWorkspacePublicationStatus` | publication identifier | `publication_status` | `engram_ontology_publication_status_v1` | New | closed |
| Event stream | — | three event payloads | `engram_ontology_event_*_v1` | New | closed |
| Any method | — | `error` | `engram_ontology_port_error_v1` | New | closed |

Five documents travel only inside a publication: `profile_bundle`, `patch_context`, `entity_index`, `projection` and `recon_queue` (§7.8, §8). `contract_manifest` is the schema of `contract.json` (§11).

### 7.1a Nested closure and rules outside JSON Schema

The closure word of §7.1 names the top-level object. A nested object is closed where this table says so. Every other nested object is open-additive.

| Closed nested object | Where |
|---|---|
| `pin`, `profile_ref`, `qualified_pin`, `version_pin`, `capabilities.contract`, `patch_stamp`, `decisions_report`, `breaking_change`, `non_breaking_change`, `bundle_issue`, the `manifest` envelope | §7.2 |
| `retrieval_request`, `recon_filter`, `decision_log_query`, `apply_request` | §7.5, §7.7 |
| `artifact`, `verifier_finding`, `publication_descriptor` with its model entries, its `contract` and its `omitted`, `upload_plan` with its upload entries, `publication_status` | §7.8 |
| `patch_context` with its `rejections` and its decision lines, `profile_bundle` with its registry snapshots, `entity_index`, the `inputs` of `projection` | §7.8 |
| The three events and `error` | §7.9 |
| `contract_manifest` with its file entries | §11 |

Open-additive, named here because a reader could assume otherwise: `manifest_model`, `profile_summary`, `previous_profile` and its `compatibility`, `workspace_manifest` and its artifact entries, a node of `patch_context`, a decision-log item and its `effect`, a `candidate`, the queue disclosures, a `citation`.

[JUDGMENT] Eight validity rules cannot be written in JSON Schema. Two that can are listed with them, so that no reader looks for them elsewhere.

| Rule | Statement | Enforced by | Fixture |
|---|---|---|---|
| SEM-1 | When `t_end` is present on a scene node or edge, it is a finite number not lower than `t` (`src/temporal-interval.ts:24–34`). | Fixture runner | `scene.inverted-interval` |
| SEM-2 | `presentation_hash` is present exactly when `profile_family` is `engram.metamodel/v1`. | Schema: `if`, `then`, `else` on `version_pin` | `version_pin.metamodel-v1-without-presentation`, `version_pin.legacy-with-presentation` |
| SEM-3 | `pin_token` equals `"p1-" + digestOfPreimage(P-PIN)`, built from the other members of the pin (§5.3). | Fixture runner, in Engram CI only: no other party builds a token (PIN-1) | `version_pin.token-mismatch` |
| SEM-4 | In a `manifest_model` and in a descriptor model entry, `model_id` equals `pin.model_id`, `patch_stamp.graph_hash` equals `pin.graph_hash`, and `patch_stamp.profile_hash` equals `pin.profile.pin.contentDigest`, with the prefix `sha256:` for `engram.metamodel/v1` (§5.1). | Fixture runner | `manifest.stamp-mismatch` |
| SEM-5 | `default_model_id` names one of the listed models, in a manifest and in a descriptor. | Fixture runner | `manifest.unknown-default-model` |
| SEM-6 | When `populated` is `false`, the stamp (`positions_built_at`, `counts_built_at`) is `null` (`src/storage/types.ts:184–190,253–259`). | Schema: `if`, `then` on `window` and `groups` | `window.unpopulated`, `window.unpopulated-with-stamp` |
| SEM-7 | `entity_index.count` equals the number of members of `entries`. | Fixture runner | `entity_index.count-mismatch` |
| SEM-8 | In a descriptor, no two artifacts of one model share a `name` or a `path`. Under `workspace_artifacts` no two share a `path`, and only the name `source` repeats. | Fixture runner and verifier (`descriptor_invalid`, §8.7) | `publication_descriptor.duplicate-artifact-name`, `publication_descriptor.duplicate-artifact-path` |
| SEM-9 | The forbidden-path rule of §8.7. | Fixture runner and verifier (`forbidden_artifact`) | `publication_descriptor.profile-state-artifact` |
| SEM-10 | NER-2 (§9). | Emitter scan | `scene.ner-member` |

A `valid` fixture passes its schema and every rule of this table that applies to its DTO. The Design System runs none of these rules. It accepts `valid` fixtures through its mirror types (§12).

### 7.2 Shared definitions, pin, capabilities, models, manifest

The listings below are members of `$defs` in `data-port.schema.json`. The file begins with `"$schema": "https://json-schema.org/draft/2020-12/schema"` and `"$id": "urn:engram:ontology-studio-data-port:v1"`.

~~~json
{
  "token":  { "type": "string", "minLength": 1 },
  "tokens": { "type": "array", "items": { "$ref": "#/$defs/token" } },
  "string_list": { "type": "array", "items": { "type": "string" } },
  "count":  { "type": "integer", "minimum": 0 },
  "hex64":  { "type": "string", "pattern": "^[0-9a-f]{64}$" },
  "sha256": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" },
  "rel_path": { "type": "string", "minLength": 1, "pattern": "^(?!/)(?!~)(?![A-Za-z]:)(?!(.*/)?\\.\\.(/|$))[^\\\\]+$" },
  "not_absolute": { "type": "string", "minLength": 1, "not": { "pattern": "^(/|~|[A-Za-z]:[\\\\/])" } },
  "pin": {
    "type": "object", "additionalProperties": false, "required": ["id", "version", "contentDigest"],
    "properties": { "id": { "$ref": "#/$defs/token" }, "version": { "$ref": "#/$defs/token" }, "contentDigest": { "$ref": "#/$defs/hex64" } }
  },
  "profile_ref": {
    "type": "object", "additionalProperties": false, "required": ["pin"],
    "properties": { "namespace": { "$ref": "#/$defs/token" }, "pin": { "$ref": "#/$defs/pin" } }
  },
  "qualified_pin": {
    "type": "object", "additionalProperties": false, "required": ["namespace", "pin"],
    "properties": { "namespace": { "$ref": "#/$defs/token" }, "pin": { "$ref": "#/$defs/pin" } }
  },
  "issue": {
    "type": "object", "required": ["severity", "message"],
    "properties": { "severity": { "enum": ["error", "warning"] }, "message": { "type": "string" }, "code": { "$ref": "#/$defs/token" } }
  },
  "node_decision": {
    "type": "object",
    "properties": {
      "created_by": { "$ref": "#/$defs/token" }, "merged_into": { "$ref": "#/$defs/token" }, "merged_by": { "$ref": "#/$defs/token" },
      "deprecated_by": { "$ref": "#/$defs/token" }, "superseded_by": { "$ref": "#/$defs/token" }, "superseded_via": { "$ref": "#/$defs/token" },
      "status_by": { "$ref": "#/$defs/token" }
    }
  },
  "relation_decision": {
    "type": "object",
    "properties": { "created_by": { "$ref": "#/$defs/token" }, "rejected_by": { "$ref": "#/$defs/token" } }
  },
  "relation": {
    "type": "object", "required": ["source_id", "target_id"],
    "properties": {
      "id": { "$ref": "#/$defs/token" }, "type": { "$ref": "#/$defs/token" },
      "source_id": { "$ref": "#/$defs/token" }, "target_id": { "$ref": "#/$defs/token" },
      "evidence_refs": { "type": "array", "items": { "$ref": "#/$defs/not_absolute" } },
      "decision": { "$ref": "#/$defs/relation_decision" }
    }
  },
  "version_pin": {
    "type": "object", "additionalProperties": false,
    "required": ["schema", "model_id", "profile", "profile_family", "graph_hash", "decision_log_digest", "decision_log_revision", "pin_token"],
    "properties": {
      "schema": { "const": "engram_ontology_version_pin_v1" },
      "model_id": { "$ref": "#/$defs/token" },
      "profile": { "$ref": "#/$defs/profile_ref" },
      "profile_family": { "enum": ["legacy", "engram.data-model/1", "engram.metamodel/v1"] },
      "presentation_hash": { "$ref": "#/$defs/hex64" },
      "graph_hash": { "$ref": "#/$defs/token" },
      "decision_log_digest": { "$ref": "#/$defs/sha256" },
      "decision_log_revision": { "$ref": "#/$defs/count" },
      "pin_token": { "type": "string", "pattern": "^[A-Za-z0-9._-]{1,128}$" }
    },
    "if": { "properties": { "profile_family": { "const": "engram.metamodel/v1" } }, "required": ["profile_family"] },
    "then": { "required": ["presentation_hash"] },
    "else": { "not": { "required": ["presentation_hash"] } }
  },
  "capabilities": {
    "type": "object",
    "required": ["schema", "contract", "temporal_convention", "preview_enabled", "write_enabled", "server_retrieval",
                 "known_patch_ops", "known_trust_tiers", "aggregate_axes", "window_strategies", "window_layouts"],
    "properties": {
      "schema": { "const": "engram_ontology_port_capabilities_v1" },
      "contract": {
        "type": "object", "additionalProperties": false, "required": ["id", "revision", "digest"],
        "properties": { "id": { "const": "engram.ontology-studio-data-port/v1" }, "revision": { "type": "integer", "minimum": 1 }, "digest": { "$ref": "#/$defs/sha256" } }
      },
      "temporal_convention": { "const": "closed-v1" },
      "preview_enabled": { "type": "boolean" }, "write_enabled": { "type": "boolean" }, "server_retrieval": { "type": "boolean" },
      "known_patch_ops": { "$ref": "#/$defs/tokens" }, "known_trust_tiers": { "$ref": "#/$defs/tokens" },
      "aggregate_axes": { "$ref": "#/$defs/tokens" }, "window_strategies": { "$ref": "#/$defs/tokens" }, "window_layouts": { "$ref": "#/$defs/tokens" }
    }
  },
  "models": {
    "type": "object", "required": ["version", "models"],
    "properties": {
      "version": { "const": 1 },
      "default": { "$ref": "#/$defs/token" },
      "models": { "type": "array", "items": {
        "type": "object", "required": ["id"],
        "properties": { "id": { "$ref": "#/$defs/token" }, "label": { "type": "string" }, "nodeCount": { "$ref": "#/$defs/count" }, "path": { "$ref": "#/$defs/rel_path" } }
      } }
    }
  },
  "patch_stamp": {
    "type": "object", "additionalProperties": false, "required": ["graph_hash", "profile_hash"],
    "properties": { "graph_hash": { "$ref": "#/$defs/token" }, "profile_hash": { "$ref": "#/$defs/token" } }
  },
  "profile_summary": {
    "type": "object", "required": ["statuses", "type_order", "node_types", "relation_types"],
    "properties": {
      "statuses": {
        "type": "object", "required": ["values", "default_status", "transitions"],
        "properties": {
          "values": { "$ref": "#/$defs/tokens" }, "default_status": { "$ref": "#/$defs/token" },
          "transitions": { "type": "array", "items": {
            "type": "object", "required": ["from_statuses", "to_statuses", "requires"],
            "properties": { "from_statuses": { "$ref": "#/$defs/tokens" }, "to_statuses": { "$ref": "#/$defs/tokens" }, "requires": { "$ref": "#/$defs/tokens" } }
          } }
        }
      },
      "type_order": { "$ref": "#/$defs/tokens" },
      "node_types": { "type": "object", "additionalProperties": {
        "type": "object",
        "properties": {
          "visual_encoding": {
            "type": "object",
            "properties": { "shape": { "type": "string" }, "fill": { "type": "string" }, "border": { "type": "string" } }
          }
        }
      } },
      "relation_types": { "type": "object", "additionalProperties": {
        "type": "object", "required": ["source_types", "target_types"],
        "properties": {
          "source_types": { "$ref": "#/$defs/tokens" }, "target_types": { "$ref": "#/$defs/tokens" }, "requires_evidence": { "type": "boolean" },
          "assertion_basis": { "$ref": "#/$defs/tokens" }, "derivation_methods": { "$ref": "#/$defs/tokens" }
        }
      } }
    }
  },
  "breaking_change": {
    "type": "object", "additionalProperties": false, "required": ["code", "path", "subject", "message", "before", "after"],
    "properties": {
      "code": { "type": "string" }, "path": { "type": "string" }, "subject": { "type": "string" }, "message": { "type": "string" },
      "before": { "type": ["string", "null"] }, "after": { "type": ["string", "null"] },
      "annotations": { "$ref": "#/$defs/tokens" }
    }
  },
  "non_breaking_change": {
    "type": "object", "additionalProperties": false, "required": ["code", "path", "subject", "message", "before", "after"],
    "properties": {
      "code": { "type": "string" }, "path": { "type": "string" }, "subject": { "type": "string" }, "message": { "type": "string" },
      "before": { "type": ["string", "null"] }, "after": { "type": ["string", "null"] }
    }
  },
  "bundle_issue": {
    "type": "object", "additionalProperties": false, "required": ["severity", "code", "path", "message"],
    "properties": {
      "severity": { "enum": ["error", "warning"] }, "code": { "type": "string" }, "path": { "type": "string" }, "message": { "type": "string" }
    }
  },
  "previous_profile": {
    "type": "object", "required": ["profile", "compatibility"],
    "properties": {
      "profile": { "$ref": "#/$defs/profile_ref" },
      "compatibility": {
        "type": "object", "required": ["ok", "compatible", "oldDigest", "newDigest", "breaking", "nonBreaking", "validationIssues"],
        "properties": {
          "ok": { "type": "boolean" }, "compatible": { "type": "boolean" },
          "oldDigest": { "oneOf": [ { "$ref": "#/$defs/hex64" }, { "type": "null" } ] },
          "newDigest": { "oneOf": [ { "$ref": "#/$defs/hex64" }, { "type": "null" } ] },
          "breaking": { "type": "array", "items": { "$ref": "#/$defs/breaking_change" } },
          "nonBreaking": { "type": "array", "items": { "$ref": "#/$defs/non_breaking_change" } },
          "validationIssues": { "type": "array", "items": { "$ref": "#/$defs/bundle_issue" } }
        }
      }
    }
  },
  "decisions_report": {
    "type": "object", "additionalProperties": false, "required": ["summary", "rebased", "drift_acknowledged"],
    "properties": {
      "summary": { "type": "object", "additionalProperties": { "$ref": "#/$defs/count" } },
      "rebased": { "$ref": "#/$defs/count" }, "drift_acknowledged": { "type": "boolean" }
    }
  },
  "workspace_manifest": {
    "type": "object", "required": ["schema", "schema_version", "contract", "generated_at", "graph_hash", "present_count", "artifacts"],
    "properties": {
      "schema": { "const": "engram_workspace_manifest_v1" }, "schema_version": { "const": 1 }, "contract": { "const": "workspace-bundle-contract-v1" },
      "generated_at": { "type": "string" }, "graph_hash": { "type": ["string", "null"] }, "present_count": { "$ref": "#/$defs/count" },
      "counts": {
        "type": "object", "required": ["graph_nodes", "scene_nodes", "entities", "coherent"],
        "properties": {
          "graph_nodes": { "$ref": "#/$defs/count" }, "scene_nodes": { "$ref": "#/$defs/count" }, "entities": { "$ref": "#/$defs/count" },
          "coherent": { "type": "boolean" }
        }
      },
      "artifacts": { "type": "array", "items": {
        "type": "object", "required": ["name", "path", "schema", "present", "sha256", "size_bytes"],
        "properties": {
          "name": { "$ref": "#/$defs/token" }, "path": { "$ref": "#/$defs/rel_path" }, "schema": { "type": ["string", "null"] },
          "present": { "type": "boolean" },
          "sha256": { "oneOf": [ { "$ref": "#/$defs/hex64" }, { "type": "null" } ] },
          "size_bytes": { "oneOf": [ { "$ref": "#/$defs/count" }, { "type": "null" } ] },
          "role": { "$ref": "#/$defs/token" }
        }
      } }
    }
  },
  "manifest_model": {
    "type": "object", "required": ["model_id", "pin", "patch_stamp", "profile_summary"],
    "properties": {
      "model_id": { "$ref": "#/$defs/token" }, "label": { "type": "string" }, "node_count": { "$ref": "#/$defs/count" },
      "pin": { "$ref": "#/$defs/version_pin" }, "patch_stamp": { "$ref": "#/$defs/patch_stamp" },
      "profile_summary": { "$ref": "#/$defs/profile_summary" },
      "governance_pins": { "type": "array", "items": { "$ref": "#/$defs/qualified_pin" } },
      "previous_profile": { "$ref": "#/$defs/previous_profile" }, "decisions": { "$ref": "#/$defs/decisions_report" },
      "workspace_manifest": { "$ref": "#/$defs/workspace_manifest" }
    }
  },
  "manifest": {
    "type": "object", "additionalProperties": false, "required": ["schema", "default_model_id", "models"],
    "properties": {
      "schema": { "const": "engram_ontology_port_manifest_v1" },
      "default_model_id": { "$ref": "#/$defs/token" },
      "descriptor_digest": { "$ref": "#/$defs/sha256" },
      "models": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/manifest_model" } }
    }
  }
}
~~~

Notes.

- `server_retrieval`, `aggregate_axes`, `window_strategies` and `window_layouts` answer for the scope of the call. When the scope names a model, they describe that model: `server_retrieval` is `false` when the model's log holds an `effective` decision (Amendment MAT-0), whatever the host could serve for another model, and the window lists are empty when no window can be served for that model. When the scope names no model, they describe the host: `server_retrieval` is `true` when the host can serve retrieval for at least one model of the workspace. A model-scoped call that cannot be served still answers `capability_unavailable` (PR-05). A client gating a search or window surface reads capabilities in model scope.
- `models` is the shipped `models.json` shape (`studio/src/lib/modelStore.svelte.js:15–27`). A hosted port omits `path` (`:34–44`). The shipped emitter is the multi-model bundle script, which writes the file at the bundle root (`scripts/build-studio-multimodel.mjs:178–193`). A single-model bundle carries no `models.json` (Review2, C-m3; that builder was not read in the fold session), and the port synthesizes the one-entry shape.
- `workspace_manifest` is the signed `workspace-bundle-contract-v1` manifest, carried byte-unchanged (`src/workspace-manifest.ts:29,37,52,85–104`). Its emitter reports on a fixed set of five artifacts and does not list itself (`src/workspace-manifest-emitter.ts:32–33,65–85`). An artifact that is not on disk is recorded with `present: false` and has no file (`:26–28`). `counts` is optional (`src/workspace-manifest.ts:101`). Projected artifacts and publication documents are never added to it. They are listed in the publication descriptor only. That sibling files respect the peer's reading of the signed contract stays `unverified`: the contract body is an h2a negotiation artifact that was not read (`src/workspace-manifest.ts:39–51`; Review:247).
- `compatibility` is the shipped `ProfileCompatibilityResult`, verbatim, with its three item shapes (`src/profile-bundle.ts:27–32,73–100`). Both digests are bare hex.
- `profile_summary` is derived from the normalized profile: statuses from `hardening` (`src/ontology-profile.ts:179–191`), relation endpoints and provenance strings from the normalized relation type (`:100–108`), and each node type's `visual_encoding` when declared.
- `type_order` replaces the hardcoded type list of the Studio (Split:195). [JUDGMENT] It is derived, never authored: for each compiled class hierarchy in code-unit order of its identifier, a depth-first walk from `root_class_ids` through `child_ids` appends each member node type that is not yet in the list, so the first occurrence wins; node types not reached follow in code-unit order (`src/types.ts:1109–1150`). No profile key is added (Review:245).

### 7.3 Scene, window, groups, hierarchies

~~~json
{
  "scene": {
    "type": "object", "required": ["nodes", "edges", "communityColors", "stats"],
    "properties": {
      "multigraph": { "type": "boolean" },
      "nodes": { "type": "array", "items": {
        "type": "object", "required": ["id", "label", "weight", "shape"],
        "properties": {
          "id": { "$ref": "#/$defs/token" }, "label": { "type": "string" }, "weight": { "type": "number" }, "shape": { "$ref": "#/$defs/token" },
          "fill": { "type": "string" }, "border": { "type": "string" }, "group": { "type": "string" }, "type": { "type": "string" },
          "status": { "type": "string" }, "t": { "type": "number" }, "t_end": { "type": "number" },
          "x": { "type": "number" }, "y": { "type": "number" }, "fx": { "type": "number" }, "fy": { "type": "number" }, "fixed": { "type": "boolean" },
          "source_file": { "$ref": "#/$defs/not_absolute" },
          "registry_id": { "type": "string" }, "registry_record_id": { "type": "string" },
          "decision": { "$ref": "#/$defs/node_decision" }
        }
      } },
      "edges": { "type": "array", "items": {
        "type": "object", "required": ["source", "target"],
        "properties": {
          "source": { "$ref": "#/$defs/token" }, "target": { "$ref": "#/$defs/token" }, "relation": { "type": "string" }, "relation_type": { "type": "string" },
          "dash": { "type": "string" }, "weak": { "const": true }, "t": { "type": "number" }, "t_end": { "type": "number" }
        }
      } },
      "communityColors": { "type": "object", "additionalProperties": { "type": "string" } },
      "stats": {
        "type": "object", "required": ["nodeCount", "edgeCount", "weakEdgeCount", "communityCount"],
        "properties": { "nodeCount": { "$ref": "#/$defs/count" }, "edgeCount": { "$ref": "#/$defs/count" }, "weakEdgeCount": { "$ref": "#/$defs/count" }, "communityCount": { "$ref": "#/$defs/count" } }
      },
      "temporal": { "type": "object", "required": ["interval_convention"], "properties": { "interval_convention": { "const": "closed-v1" } } },
      "layout_id": { "type": "string" }, "layout_dims": { "enum": [2, 3] }, "snapshot_id": { "type": "string" }
    }
  },
  "window": {
    "type": "object", "required": ["strategy", "limit", "nodes", "edges", "populated", "positions_built_at"],
    "properties": {
      "strategy": { "$ref": "#/$defs/token" }, "layout": { "type": "string" }, "limit": { "$ref": "#/$defs/count" },
      "nodes": { "type": "array", "items": {
        "type": "object", "required": ["id", "label", "degree"],
        "properties": {
          "id": { "$ref": "#/$defs/token" }, "label": { "type": "string" }, "degree": { "type": "number", "minimum": 0 },
          "node_type": { "type": "string" }, "x": { "type": "number" }, "y": { "type": "number" }
        }
      } },
      "edges": { "type": "array", "items": {
        "type": "object", "required": ["source", "target", "relation"],
        "properties": { "source": { "type": "string" }, "target": { "type": "string" }, "relation": { "type": "string" } }
      } },
      "populated": { "type": "boolean" }, "positions_built_at": { "type": ["string", "null"] }
    },
    "if": { "properties": { "populated": { "const": false } }, "required": ["populated"] },
    "then": { "properties": { "positions_built_at": { "type": "null" } } }
  },
  "groups": {
    "type": "object", "required": ["axis", "groups", "populated", "counts_built_at"],
    "properties": {
      "axis": { "$ref": "#/$defs/token" },
      "groups": { "type": "array", "items": {
        "type": "object", "required": ["key", "label", "count"],
        "properties": { "key": { "type": "string" }, "label": { "type": "string" }, "count": { "$ref": "#/$defs/count" }, "parent_key": { "type": "string" } }
      } },
      "populated": { "type": "boolean" }, "counts_built_at": { "type": ["string", "null"] }
    },
    "if": { "properties": { "populated": { "const": false } }, "required": ["populated"] },
    "then": { "properties": { "counts_built_at": { "type": "null" } } }
  },
  "scene_hierarchies": {
    "type": "object", "required": ["schema", "generated_at", "graph_hash", "hierarchies"],
    "properties": {
      "schema": { "const": "engram_scene_hierarchies_v1" }, "generated_at": { "type": "string" }, "graph_hash": { "type": ["string", "null"] },
      "hierarchies": { "type": "object", "additionalProperties": {
        "type": "object",
        "required": ["relation_type", "kind", "root_ids", "max_depth", "nodes_by_id", "overlay_arcs", "orphan_ids", "cycles", "conflicts", "dangling_arc_count"],
        "properties": {
          "relation_type": { "type": "string" }, "kind": { "$ref": "#/$defs/token" },
          "root_ids": { "$ref": "#/$defs/tokens" }, "max_depth": { "$ref": "#/$defs/count" },
          "nodes_by_id": { "type": "object", "additionalProperties": {
            "type": "object", "required": ["parent_id", "child_ids", "level", "status", "registry_record_id"],
            "properties": {
              "parent_id": { "type": ["string", "null"] }, "child_ids": { "$ref": "#/$defs/tokens" }, "level": { "$ref": "#/$defs/count" },
              "label": { "type": "string" }, "code": { "type": "string" }, "status": { "type": "string" },
              "assertion_basis": { "type": "string" }, "derivation_method": { "type": "string" },
              "registry_record_id": { "$ref": "#/$defs/token" }
            }
          } },
          "overlay_arcs": { "type": "array", "items": {
            "type": "object", "required": ["parent_id", "child_id", "status"],
            "properties": {
              "parent_id": { "$ref": "#/$defs/token" }, "child_id": { "$ref": "#/$defs/token" }, "status": { "type": "string" },
              "confidence": { "type": "number" }, "evidence_refs": { "$ref": "#/$defs/string_list" }, "derivation_method": { "type": "string" }
            }
          } },
          "orphan_ids": { "$ref": "#/$defs/tokens" },
          "cycles": { "type": "array", "items": { "$ref": "#/$defs/tokens" } },
          "conflicts": { "type": "array", "items": {
            "type": "object", "required": ["child_id", "kept_parent_id", "demoted_parent_ids"],
            "properties": {
              "child_id": { "$ref": "#/$defs/token" }, "kept_parent_id": { "$ref": "#/$defs/token" }, "demoted_parent_ids": { "$ref": "#/$defs/tokens" }
            }
          } },
          "dangling_arc_count": { "$ref": "#/$defs/count" }
        }
      } }
    }
  },
  "class_hierarchies": {
    "type": "object", "required": ["schema", "generated_at", "hierarchies"],
    "properties": {
      "schema": { "const": "engram_ontology_class_hierarchies_v1" }, "generated_at": { "type": "string" },
      "graph_hash": { "type": ["string", "null"] }, "profile_hash": { "type": ["string", "null"] },
      "hierarchies": { "type": "object", "additionalProperties": {
        "type": "object",
        "required": ["relation_type", "membership_relation_type", "root_class_ids", "max_depth", "classes_by_id",
                     "orphan_class_names", "cycles", "member_node_type_conflicts", "unattached_entity_count"],
        "properties": {
          "relation_type": { "type": "string" }, "membership_relation_type": { "type": "string" },
          "root_class_ids": { "$ref": "#/$defs/tokens" }, "max_depth": { "$ref": "#/$defs/count" },
          "classes_by_id": { "type": "object", "additionalProperties": {
            "type": "object",
            "required": ["id", "label", "parent_id", "child_ids", "level", "member_node_types", "member_hierarchies", "member_ids", "source", "status"],
            "properties": {
              "id": { "$ref": "#/$defs/token" }, "label": { "type": "string" }, "parent_id": { "type": ["string", "null"] },
              "child_ids": { "$ref": "#/$defs/tokens" }, "level": { "$ref": "#/$defs/count" },
              "member_node_types": { "$ref": "#/$defs/tokens" }, "member_hierarchies": { "$ref": "#/$defs/tokens" },
              "member_ids": { "$ref": "#/$defs/tokens" }, "source": { "type": "string" }, "status": { "type": "string" }
            }
          } },
          "orphan_class_names": { "$ref": "#/$defs/string_list" },
          "cycles": { "type": "array", "items": { "$ref": "#/$defs/tokens" } },
          "member_node_type_conflicts": { "type": "array", "items": {
            "type": "object", "required": ["node_type", "dropped_classes"],
            "properties": { "node_type": { "$ref": "#/$defs/token" }, "dropped_classes": { "$ref": "#/$defs/string_list" } }
          } },
          "unattached_entity_count": { "$ref": "#/$defs/count" }
        }
      } }
    }
  }
}
~~~

Notes.

- A scene node may carry any field of the shipped allow-list (`src/studio-scene.ts:257–299`), and an edge any field of the edge allow-list (`:301–315`). The scene has no `trust` field at the pin.
- The interval rule and the stamp rule are SEM-1 and SEM-6 (§7.1a).
- A node's position members, and the `layout_id`, `layout_dims` and `snapshot_id` of the scene, are those of the base scene. The projection computes no layout, and a created node has no position member (Amendment VIEW-6b).
- [JUDGMENT] In v1 no window, group count or search index is projected (Amendment MAT-0). A local host whose graph store mirrors the base may serve a window or a group count while the model's log holds no effective decision. Its stamps are the store's own, written by whoever baked the data and never made up at read time (`src/storage/types.ts:185–190,254–259`). A publication never carries either artifact in v1, so a hosted host advertises empty `aggregate_axes`, `window_strategies` and `window_layouts`.
- When a window or a group count is not available, the port answers the error `capability_unavailable`, and the client falls back (Amendment VIEW-7). `queryRetrieval` answers the same error for a model whose log holds an effective decision, and in model scope `capabilities.server_retrieval` is then `false` (§7.2) (Amendment MAT-0).
- Scene hierarchies are keyed by raw registry identifiers and class hierarchies by `class:<ClassName>` and entity node identifiers (`src/scene-hierarchies.ts:8–13`; `src/types.ts:1050–1053`). Both are rebuilt by their shipped builders over the projected graph: scene hierarchies over the unchanged base arcs and the nodes of the projected scene, class hierarchies over the nodes of the projected graph (Amendment VIEW-6a).

### 7.4 Entity view

~~~json
{
  "citation": {
    "type": "object", "required": ["source_file"],
    "properties": {
      "source_file": { "$ref": "#/$defs/not_absolute" }, "source_url": { "type": "string" }, "sourceUrl": { "type": "string" },
      "rawRef": { "type": "string" }, "docSha": { "type": "string" },
      "page": { "type": ["number", "string"] }, "section": { "type": "string" }, "paragraph_id": { "type": "string" }, "figure_id": { "type": "string" },
      "bbox": { "type": "array", "minItems": 4, "maxItems": 4, "items": { "type": "number" } },
      "region": { "type": "array", "minItems": 4, "maxItems": 4, "items": { "type": "number" } },
      "modality": { "type": "string" }, "excerpt": { "type": "string" },
      "quoteSpan": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } },
      "source_location": { "type": "string" }, "quote": { "type": "string" }, "confidence": { "type": "string" }
    }
  },
  "entity": {
    "type": "object", "required": ["id", "description", "occurrences"],
    "properties": {
      "id": { "$ref": "#/$defs/token" },
      "type": { "type": ["string", "null"] }, "community": { "type": "integer" }, "community_name": { "type": ["string", "null"] },
      "description": { "oneOf": [ { "type": "null" }, {
        "type": "object", "required": ["status", "description"],
        "properties": { "status": { "type": "string" }, "description": { "type": ["string", "null"] }, "source": { "type": "string" }, "provisional": { "type": "boolean" } }
      } ] },
      "occurrences": {},
      "citations": {
        "type": "object", "required": ["count", "citations"],
        "properties": { "count": { "$ref": "#/$defs/count" }, "citations": { "type": "array", "items": { "$ref": "#/$defs/citation" } } }
      },
      "label": { "type": "string" }, "status": { "type": "string" }, "trust": { "type": "string" },
      "aliases": { "type": "array", "items": { "type": "string" } },
      "decision": { "$ref": "#/$defs/node_decision" },
      "members": { "type": "array", "items": {
        "type": "object", "required": ["id"], "properties": { "id": { "$ref": "#/$defs/token" }, "label": { "type": "string" } }
      } },
      "relations": { "type": "array", "items": { "$ref": "#/$defs/relation" } }
    }
  }
}
~~~

The first seven members are the shipped entity sidecar (`src/studio-assets.ts:412–445`). The last seven are added by this contract and are optional. `trust` is present only when the node declares a known tier. It is never defaulted (`src/ontology-patch.ts:52–59`). `relations` lists the resolved relations in which the entity is source or target, in the shipped relation shape (`src/ontology-patch.ts:80–86`; Amendment VIEW-2). `members` lists the nodes merged into the entity (Amendment VIEW-1).

A citation item is the shipped `OntologyCitation` (`src/types.ts:573–621`; `src/studio-assets.ts:302–305`). `source_file` is required and every other member is optional. `source_file` is `not_absolute`, and §7.10 row 6 states what the port does with an absolute one. `modality` and `confidence` are open strings (§6).

`occurrences` is opaque pass-through in v1. It is untyped at the pin (`src/studio-assets.ts:437`). A producer copies the base value, or `null`. A consumer must not depend on its shape, and the member is excluded from Design System conformance (§12).

| Rule | Statement |
|---|---|
| ENT-1 | `getEntity` answers `entity_not_found` exactly when the identifier names no node of the base graph and no created node. A merged member stays readable (Amendment VIEW-1). |
| ENT-2 | A node without sidecar data gets the empty sidecar `{ id, description: null, occurrences: null }`, never an error. The shipped builder never fails for an identifier (`src/studio-assets.ts:495–562`). |
| ENT-3 | `getReconciliationCandidate` answers `candidate_not_found` exactly when the identifier is absent from the queue. A decided item is returned with its `decision` (REC-2): the method takes no `include_decided` argument (§7.1), and the shipped lookup reads the whole queue (`src/ontology-reconciliation-api.ts:92–102`). |

### 7.5 Retrieval

~~~json
{
  "retrieval_request": {
    "type": "object", "additionalProperties": false, "required": ["question"],
    "properties": { "question": { "type": "string", "minLength": 1 }, "limit": { "type": "integer", "minimum": 1 } }
  },
  "answer_pack": {
    "type": "object",
    "required": ["schema", "graph_signature", "question", "mode", "retrieval", "neighborhood", "paths", "communities", "budget", "answer"],
    "properties": {
      "schema": { "const": "engram_answer_pack_v1" },
      "graph_signature": { "type": "string" }, "grounding_signature": { "type": "string" },
      "question": { "type": "string" }, "mode": { "$ref": "#/$defs/token" },
      "retrieval": {
        "type": "object", "required": ["seeds", "fusion", "ppr"],
        "properties": {
          "seeds": { "type": "array", "items": {
            "type": "object", "required": ["node_id", "label", "fused_rank"],
            "properties": { "node_id": { "$ref": "#/$defs/token" }, "label": { "type": "string" }, "bm25": { "type": "number" }, "fused_rank": { "type": "number" } }
          } },
          "fusion": {
            "type": "object", "required": ["method", "k", "lists"],
            "properties": { "method": { "$ref": "#/$defs/token" }, "k": { "type": "number" }, "lists": { "$ref": "#/$defs/string_list" } }
          },
          "ppr": {
            "type": "object", "required": ["alpha", "iterations", "tolerance", "seeded_by", "refused"],
            "properties": {
              "alpha": { "type": "number" }, "iterations": { "type": "number" }, "tolerance": { "type": "number" },
              "seeded_by": { "$ref": "#/$defs/token" }, "refused": { "type": "boolean" }
            }
          }
        }
      },
      "neighborhood": { "type": "array", "items": {
        "type": "object", "required": ["node_id", "label", "ppr", "specificity", "community"],
        "properties": {
          "node_id": { "$ref": "#/$defs/token" }, "label": { "type": "string" }, "type": { "type": "string" },
          "ppr": { "type": "number" }, "specificity": { "type": "number" }, "community": { "type": "number" }, "description": { "type": "string" },
          "grounding": { "type": "array", "items": {
            "type": "object",
            "properties": {
              "quote": { "type": "string" }, "source_file": { "$ref": "#/$defs/not_absolute" },
              "page": { "type": ["number", "string"] }, "section": { "type": "string" }
            }
          } }
        }
      } },
      "paths": { "type": "array", "items": {
        "type": "object", "required": ["nodes", "reliability"],
        "properties": { "nodes": { "$ref": "#/$defs/tokens" }, "reliability": { "type": "number" } }
      } },
      "communities": { "type": "array", "items": {
        "type": "object", "required": ["id", "label", "salient"],
        "properties": { "id": { "type": "number" }, "label": { "type": "string" }, "salient": { "type": "boolean" } }
      } },
      "budget": {
        "type": "object", "required": ["token_budget", "relevance_tests_proposed"],
        "properties": { "token_budget": { "type": "number" }, "relevance_tests_proposed": { "type": "number" } }
      },
      "answer": { "type": ["string", "null"] }
    }
  }
}
~~~

The answer pack is "the frozen cross-mode contract" of the retrieval core, with its nested shapes (`src/retrieval/answer-pack.ts:79–151`). The port adds nothing to it. A grounding span types `quote` as required while its own comment calls it optional (`:87–90`), so the schema does not require it. A grounding `source_file` follows §7.10 row 6.

### 7.6 Sources

~~~json
{
  "provenance": {
    "type": "object", "required": ["schema", "documents"],
    "properties": {
      "schema": { "const": "engram_cited_source_provenance_v1" },
      "documents": {
        "type": "object",
        "propertyNames": { "$ref": "#/$defs/not_absolute" },
        "additionalProperties": {
          "type": "object", "required": ["original", "via", "bundled"],
          "properties": {
            "original": { "$ref": "#/$defs/not_absolute" }, "conversion": { "type": "string" }, "via": { "type": "string" }, "bundled": { "type": "boolean" },
            "chain": { "type": "array", "items": {
              "type": "object", "required": ["ref", "kind", "via"],
              "properties": { "ref": { "$ref": "#/$defs/not_absolute" }, "kind": { "enum": ["file", "url"] }, "via": { "type": "string" }, "conversion": { "type": "string" }, "bundled": { "type": "boolean" } }
            } },
            "preferred": { "$ref": "#/$defs/not_absolute" }
          }
        }
      }
    }
  }
}
~~~

| Rule | Statement |
|---|---|
| SRC-1 | `readSource` takes a relative path and returns bytes with a content type. Traversal is refused before and after resolution, as at the pin (`src/studio-sources.ts:104–120`). |
| SRC-2 | A cited document is never answered with `text/html` unless its locator is an HTML file. A missing document is the error `source_not_found`, never a fallback page (`src/studio-sources.ts:50–55,122–138`). |
| SRC-3 | A provenance document served by the port holds no absolute path, in a key, in `original`, in `preferred` or in a `ref`. A URL is allowed. |

SRC-3 is not met at the pin. An original that escapes every root "keeps its ABSOLUTE path and is still recorded", and an absolute locator is used as a key as is (`src/converted-provenance.ts:407–411,430–431,582,595–598`). [JUDGMENT] The port emitter drops a chain link whose `ref` is absolute, drops an entry whose preferred artifact or key is absolute, and reports the number dropped (`omitted`, §7.8).

### 7.7 Reconciliation queue, decision log, rebuild status, patch envelopes

~~~json
{
  "recon_filter": {
    "type": "object", "additionalProperties": false,
    "properties": {
      "status": { "type": "string" }, "kind": { "type": "string" }, "operation": { "enum": ["accept_match"] },
      "canonical_id": { "type": "string" }, "candidate_id": { "type": "string" }, "min_score": { "type": "number" }, "query": { "type": "string" },
      "sort": { "enum": ["score", "id"] }, "order": { "enum": ["asc", "desc"] },
      "limit": { "$ref": "#/$defs/count" }, "offset": { "$ref": "#/$defs/count" }, "include_decided": { "type": "boolean" }
    }
  },
  "candidate": {
    "type": "object",
    "required": ["id", "kind", "status", "score", "candidate_id", "canonical_id", "shared_terms", "evidence_refs", "reasons", "proposed_patch_operation"],
    "properties": {
      "id": { "$ref": "#/$defs/token" }, "kind": { "type": "string" }, "status": { "type": "string" }, "score": { "type": "number" }, "tier": { "type": "string" },
      "candidate_id": { "$ref": "#/$defs/token" }, "canonical_id": { "$ref": "#/$defs/token" },
      "shared_terms": { "type": "array", "items": { "type": "string" } }, "evidence_refs": { "type": "array", "items": { "type": "string" } },
      "reasons": { "type": "array", "items": { "type": "string" } }, "proposed_patch_operation": { "enum": ["accept_match"] },
      "score_breakdown": {
        "type": "object",
        "properties": {
          "neighbour_jaccard": { "type": "number" }, "shared_neighbours": { "type": "number" },
          "relation_profile_jaccard": { "type": "number" }, "shared_provenance": { "type": "number" }
        }
      },
      "structural_basis": {
        "type": "object", "required": ["shared_neighbour_ids", "shared_neighbour_count", "shared_relation_types", "shared_provenance_refs"],
        "properties": {
          "shared_neighbour_ids": { "$ref": "#/$defs/string_list" }, "shared_neighbour_count": { "type": "number" },
          "shared_relation_types": { "$ref": "#/$defs/string_list" }, "shared_provenance_refs": { "$ref": "#/$defs/string_list" }
        }
      },
      "decision": {
        "type": "object", "required": ["patch_id", "outcome"],
        "properties": { "patch_id": { "$ref": "#/$defs/token" }, "outcome": { "$ref": "#/$defs/token" } }
      }
    }
  },
  "recon_list": {
    "type": "object", "required": ["schema", "generated_at", "graph_hash", "profile_hash", "stale", "total", "limit", "offset", "items"],
    "properties": {
      "schema": { "const": "engram_ontology_reconciliation_candidates_response_v1" },
      "generated_at": { "type": "string" }, "graph_hash": { "type": "string" }, "profile_hash": { "type": "string" }, "stale": { "type": "boolean" },
      "total": { "$ref": "#/$defs/count" }, "limit": { "$ref": "#/$defs/count" }, "offset": { "$ref": "#/$defs/count" },
      "items": { "type": "array", "items": { "$ref": "#/$defs/candidate" } },
      "decision_log_digest": { "$ref": "#/$defs/sha256" },
      "queue": {
        "allOf": [ { "$ref": "#/$defs/queue_disclosures" } ],
        "type": "object", "required": ["candidate_count"],
        "properties": { "candidate_count": { "$ref": "#/$defs/count" }, "decision_log_digest": { "$ref": "#/$defs/sha256" } }
      }
    }
  },
  "queue_disclosures": {
    "type": "object",
    "properties": {
      "fuzzy_blocking_cap": {
        "type": "object", "required": ["applied", "scope", "threshold", "skipped_key_count", "largest_skipped_block_size", "note"],
        "properties": {
          "applied": { "const": true }, "scope": { "$ref": "#/$defs/token" }, "threshold": { "type": "number" },
          "skipped_key_count": { "type": "number" }, "largest_skipped_block_size": { "type": "number" }, "note": { "type": "string" }
        }
      },
      "fuzzy_tier_eligibility": {
        "type": "object",
        "required": ["criterion", "minimum_smaller_side_token_count", "excluded_comparable_node_count", "comparable_node_count", "excluded_comparable_node_share"],
        "properties": {
          "criterion": { "type": "string" }, "minimum_smaller_side_token_count": { "type": "number" },
          "excluded_comparable_node_count": { "type": "number" }, "comparable_node_count": { "type": "number" },
          "excluded_comparable_node_share": { "type": "number" }
        }
      },
      "trust_tier_gate": {
        "type": "object", "required": ["criterion", "pairs_evaluated", "pairs_both_tagged", "pairs_one_side_tagged", "pairs_rejected"],
        "properties": {
          "criterion": { "type": "string" }, "pairs_evaluated": { "type": "number" }, "pairs_both_tagged": { "type": "number" },
          "pairs_one_side_tagged": { "type": "number" }, "pairs_rejected": { "type": "number" }
        }
      },
      "tier_exclusion": {
        "type": "object", "required": ["criterion", "excluded_types", "nodes_excluded", "nodes_total"],
        "properties": {
          "criterion": { "type": "string" }, "excluded_types": { "$ref": "#/$defs/string_list" },
          "nodes_excluded": { "type": "number" }, "nodes_total": { "type": "number" }
        }
      },
      "precision_guard": {
        "type": "object", "required": ["criterion", "scope", "exact_pairs_offered", "exact_pairs_retracted"],
        "properties": {
          "criterion": { "type": "string" }, "scope": { "type": "string" },
          "exact_pairs_offered": { "type": "number" }, "exact_pairs_retracted": { "type": "number" }
        }
      },
      "output_truncation": {
        "type": "object", "required": ["criterion", "cap", "dropped"],
        "properties": { "criterion": { "type": "string" }, "cap": { "type": ["number", "null"] }, "dropped": { "type": "number" } }
      }
    }
  },
  "decision_log_query": {
    "type": "object", "additionalProperties": false,
    "properties": {
      "source": { "enum": ["authoritative", "audit", "both"] }, "status": { "enum": ["applied", "rejected", "all"] },
      "operation": { "type": "string" }, "node_id": { "type": "string" }, "from": { "type": "string" }, "to": { "type": "string" },
      "disposition": { "type": "string" }, "limit": { "$ref": "#/$defs/count" }, "offset": { "$ref": "#/$defs/count" }
    }
  },
  "decision_log": {
    "type": "object", "required": ["schema", "total", "limit", "offset", "items", "issues"],
    "properties": {
      "schema": { "const": "engram_ontology_reconciliation_decision_log_v1" },
      "total": { "$ref": "#/$defs/count" }, "limit": { "$ref": "#/$defs/count" }, "offset": { "$ref": "#/$defs/count" },
      "items": { "type": "array", "items": {
        "type": "object", "required": ["source", "path", "recorded_at", "patch"],
        "properties": {
          "source": { "enum": ["authoritative", "audit"] }, "path": { "$ref": "#/$defs/rel_path" }, "recorded_at": { "type": ["string", "null"] }, "patch": { "type": "object" },
          "entry": { "type": "integer", "minimum": 1 },
          "effect": {
            "type": "object", "required": ["disposition"],
            "properties": {
              "disposition": { "$ref": "#/$defs/token" }, "detail": { "type": "string" }, "related_decision_id": { "$ref": "#/$defs/token" },
              "rebased": { "type": "boolean" }, "rebase_unverified": { "type": "boolean" },
              "recorded_under": { "type": "object", "properties": { "graph_hash": { "type": "string" }, "profile_hash": { "type": "string" } } },
              "evidence_unresolved": { "type": "array", "items": { "type": "string" } }
            }
          }
        }
      } },
      "issues": { "type": "array", "items": { "$ref": "#/$defs/issue" } },
      "log_digest": { "$ref": "#/$defs/sha256" }, "log_revision": { "$ref": "#/$defs/count" },
      "summary": { "type": "object", "additionalProperties": { "$ref": "#/$defs/count" } }
    }
  },
  "rebuild_status": {
    "type": "object", "required": ["schema", "needs_update", "graph_hash", "profile_hash", "candidates_match", "decision_log_available", "candidates"],
    "properties": {
      "schema": { "const": "engram_ontology_rebuild_status_v1" },
      "needs_update": { "type": "boolean" }, "graph_hash": { "type": ["string", "null"] }, "profile_hash": { "type": ["string", "null"] },
      "candidates_match": { "type": "boolean" }, "decision_log_available": { "type": "boolean" },
      "candidates": {
        "type": "object",
        "required": ["path", "exists", "readable", "candidate_count", "generated_at", "graph_hash", "profile_hash", "consistent_with_context", "issues"],
        "properties": {
          "path": { "$ref": "#/$defs/rel_path" }, "exists": { "type": "boolean" }, "readable": { "type": "boolean" },
          "candidate_count": { "type": ["integer", "null"] }, "generated_at": { "type": ["string", "null"] },
          "graph_hash": { "type": ["string", "null"] }, "profile_hash": { "type": ["string", "null"] },
          "consistent_with_context": { "type": ["boolean", "null"] }, "issues": { "$ref": "#/$defs/string_list" }
        }
      },
      "pin": { "$ref": "#/$defs/version_pin" },
      "queue_stale": { "type": "boolean" },
      "projection": {
        "type": "object", "required": ["materialized", "stale"],
        "properties": { "materialized": { "type": "boolean" }, "stale": { "type": ["boolean", "null"] }, "decision_log_digest": { "$ref": "#/$defs/sha256" } }
      }
    }
  },
  "patch": {
    "type": "object",
    "required": ["schema", "id", "operation", "status", "profile_hash", "graph_hash", "target", "evidence_refs", "reason", "author", "created_at"],
    "properties": {
      "schema": { "enum": ["engram_ontology_patch_v1", "graphify_ontology_patch_v1"] },
      "id": { "$ref": "#/$defs/token" }, "operation": { "$ref": "#/$defs/token" }, "status": { "type": "string" },
      "profile_hash": { "type": "string" }, "graph_hash": { "type": "string" }, "target": { "type": "object" },
      "evidence_refs": { "type": "array", "items": { "type": "string" } },
      "reason": { "type": "string" }, "author": { "type": "string" }, "created_at": { "type": "string" }
    }
  },
  "patch_result_members": {
    "type": "object",
    "properties": {
      "disposition": { "$ref": "#/$defs/token" },
      "created_node_id": { "$ref": "#/$defs/token" }, "created_relation_id": { "$ref": "#/$defs/token" },
      "log_digest": { "$ref": "#/$defs/sha256" }, "log_revision": { "$ref": "#/$defs/count" },
      "reactivates": { "$ref": "#/$defs/tokens" }
    }
  },
  "patch_validation": {
    "allOf": [ { "$ref": "#/$defs/patch_result_members" } ],
    "type": "object", "required": ["schema", "patch_id", "valid", "issues"],
    "properties": {
      "schema": { "const": "engram_ontology_patch_validation_v1" },
      "patch_id": { "type": ["string", "null"] }, "valid": { "type": "boolean" },
      "issues": { "type": "array", "items": { "$ref": "#/$defs/issue" } }
    }
  },
  "patch_apply": {
    "allOf": [ { "$ref": "#/$defs/patch_result_members" } ],
    "type": "object", "required": ["schema", "patch_id", "valid", "issues", "dry_run", "changed_files"],
    "properties": {
      "schema": { "const": "engram_ontology_patch_apply_v1" },
      "patch_id": { "type": ["string", "null"] }, "valid": { "type": "boolean" },
      "issues": { "type": "array", "items": { "$ref": "#/$defs/issue" } },
      "dry_run": { "type": "boolean" },
      "changed_files": { "type": "array", "items": {
        "type": "object", "required": ["path", "kind", "action"],
        "properties": { "path": { "$ref": "#/$defs/rel_path" }, "kind": { "type": "string" }, "action": { "type": "string" } }
      } },
      "already_applied": { "type": "boolean" },
      "new_pin": { "$ref": "#/$defs/version_pin" }
    }
  },
  "apply_request": {
    "type": "object", "additionalProperties": false, "required": ["patch", "expected_pin_token"],
    "properties": { "patch": { "type": "object" }, "expected_pin_token": { "type": "string", "pattern": "^[A-Za-z0-9._-]{1,128}$" } }
  }
}
~~~

| Rule | Statement |
|---|---|
| REC-1 | `stale` on the queue keeps its shipped member and takes the meaning of the Amendment FRS-2. The split's `rebuildPending` is this member (Split:434). |
| REC-2 | A decided item is left out unless `include_decided` is true. It then carries `decision` with the deciding patch and an `outcome` (`accepted`, `rejected`, `superseded`; Amendment VIEW-5). |
| REC-3 | The response carries the queue disclosures in `queue`. At the pin the queue holds them and the response type has no member for them, although consumers "must treat a queue carrying this stamp as incomplete" (`src/ontology-reconciliation.ts:69–113,156–166,2237–2247`). The shipped type marks four disclosures as always present, and a queue written before a block existed lacks it (`:86–107`). The schema therefore leaves all six optional and types each one that is present. An absent block means "written before the block existed", never zero. |
| REC-4 | `recon_list.decision_log_digest` is the **current** log digest. The digest that the queue recorded when it was last regenerated travels as `queue.decision_log_digest` (Amendment MAT-4). `stale` is their comparison, together with the shipped predicate (Amendment FRS-2). |
| REC-5 | The published `projected-reconciliation-candidates` artifact is the base queue with each decided item marked by its `decision` (Amendment VIEW-5). It is never regenerated at publish: regeneration happens only in `engram ontology rebuild` (Amendment MAT-3). The Engram library inside the host leaves decided items out of a list unless `include_decided` is true, then applies the shipped filters, sort and paging (`src/ontology-reconciliation-api.ts:81–90`). |
| LOGV-1 | `effect` is present on every item of the authoritative source. Items of the audit source carry none. Opaque entries are reported in `issues` with their line number, as at the pin (`src/ontology-patch.ts:239–255`), and counted in `summary`. |
| LOGV-2 | `from` and `to` keep their shipped meaning. `from` matches `target.from_status`, or `target.source_id` when the patch has no `from_status`. `to` matches `target.to_status`, or `target.target_id` (`src/ontology-patch.ts:300–320`). Neither is a date bound, and v1 offers no date filter. |
| LOGV-3 | A `disposition` filter matches `effect.disposition`. It therefore matches no item of the `audit` source. |
| LOGV-4 | `summary`, `log_digest` and `log_revision` describe the whole authoritative log. They never describe the page, and never the audit file. `total` counts the items that pass the filters. |
| LOGV-5 | The `audit` source is the shipped preview of `applied-patches.jsonl` (`src/ontology-reconciliation-api.ts:54–56,104–113`). `rejected-patches.jsonl` is not served in v1 (Amendment §13). |
| PAT-1 | The port passes any JSON object within the shipped body limit to the engine ("256 KB", `src/ontology-studio.ts:384–386`). The `patch` schema describes a well-formed patch. It is not a gate: an ill-formed patch gets a validation result with issue codes, as today (`src/ontology-patch.ts:506–535`). |
| PAT-2 | On receipt, before validation, a host writes the verified principal over `patch.author` and sets the engine's `applied_by` from the same principal. A value supplied by the client is discarded, and a missing `author` is not an error at the port (`src/ontology-patch.ts:100,521,644`; Split:642). The engine's `missing_author` check applies to the CLI and MCP callers, which call the engine directly (Amendment §13). |
| PAT-2a | `affected_node_ids` of `event_patch_applied` is computed by the Engram library that builds the event, with one exported engine function. No code outside Engram derives it. `accept_match` and `supersede_entity` give both target identifiers. `reject_match` gives both identifiers in the pair form, the candidate in the candidate-alone form, and the empty list in the `mapping_id` form. `create_canonical` gives the created identifier. `merge_alias`, `set_status` and `deprecate_entity` give the named node. `add_relation` gives both endpoints, and `reject_relation` both endpoints of each relation it rejects. `revert_decision` gives the list of the decision it reverts. Identifiers are as recorded in the decision, never resolved through the alias map, in the order written here and without duplicates. The apply result does not carry the list in v1. A client that needs exact invalidation compares pin tokens (PIN-4). |
| PAT-3 | `new_pin` is present after a successful write. A dry-run and a refused write carry none. |
| PAT-4 | `apply_request` carries no idempotency key. The engine is idempotent on the patch `id` (Amendment §13). An `Idempotency-Key` header is the envelope's. |

### 7.8 Publication

~~~json
{
  "artifact": {
    "type": "object", "additionalProperties": false, "required": ["name", "path", "schema", "sha256", "size_bytes"],
    "properties": {
      "name": { "$ref": "#/$defs/token" }, "path": { "$ref": "#/$defs/rel_path" }, "schema": { "type": ["string", "null"] },
      "sha256": { "$ref": "#/$defs/hex64" }, "size_bytes": { "$ref": "#/$defs/count" },
      "role": { "$ref": "#/$defs/token" }, "media_type": { "$ref": "#/$defs/token" }
    }
  },
  "verifier_finding": {
    "type": "object", "additionalProperties": false, "required": ["code", "message"],
    "properties": { "code": { "$ref": "#/$defs/token" }, "message": { "type": "string" }, "path": { "$ref": "#/$defs/rel_path" } }
  },
  "publication_descriptor": {
    "type": "object", "additionalProperties": false,
    "required": ["schema", "contract", "corpus_id", "generated_at", "engram_version", "default_model_id", "models", "workspace_artifacts", "omitted"],
    "properties": {
      "schema": { "const": "engram_ontology_workspace_publication_v1" },
      "contract": {
        "type": "object", "additionalProperties": false, "required": ["id", "revision", "digest"],
        "properties": { "id": { "const": "engram.ontology-studio-data-port/v1" }, "revision": { "type": "integer", "minimum": 1 }, "digest": { "$ref": "#/$defs/sha256" } }
      },
      "corpus_id": { "$ref": "#/$defs/token" }, "generated_at": { "type": "string" }, "engram_version": { "$ref": "#/$defs/token" },
      "default_model_id": { "$ref": "#/$defs/token" },
      "models": { "type": "array", "minItems": 1, "items": {
        "type": "object", "additionalProperties": false,
        "required": ["model_id", "pin", "patch_stamp", "profile_summary", "registries_mode", "decisions", "artifacts"],
        "properties": {
          "model_id": { "$ref": "#/$defs/token" }, "label": { "type": "string" }, "node_count": { "$ref": "#/$defs/count" },
          "pin": { "$ref": "#/$defs/version_pin" }, "patch_stamp": { "$ref": "#/$defs/patch_stamp" },
          "profile_summary": { "$ref": "#/$defs/profile_summary" },
          "registries_mode": { "enum": ["full", "bindings-only"] },
          "previous_profile": { "$ref": "#/$defs/previous_profile" }, "decisions": { "$ref": "#/$defs/decisions_report" },
          "governance_pins": { "type": "array", "items": { "$ref": "#/$defs/qualified_pin" } },
          "artifacts": { "type": "array", "items": { "$ref": "#/$defs/artifact" } }
        }
      } },
      "workspace_artifacts": { "type": "array", "items": { "$ref": "#/$defs/artifact" } },
      "omitted": {
        "type": "object", "additionalProperties": false, "required": ["provenance_entries", "provenance_links", "citations", "refs"],
        "properties": {
          "provenance_entries": { "$ref": "#/$defs/count" }, "provenance_links": { "$ref": "#/$defs/count" },
          "citations": { "$ref": "#/$defs/count" }, "refs": { "$ref": "#/$defs/count" }
        }
      }
    }
  },
  "upload_plan": {
    "type": "object", "additionalProperties": false, "required": ["schema", "publication_id", "descriptor_digest", "uploads"],
    "properties": {
      "schema": { "const": "engram_ontology_publication_upload_plan_v1" },
      "publication_id": { "$ref": "#/$defs/token" }, "descriptor_digest": { "$ref": "#/$defs/sha256" },
      "uploads": { "type": "array", "items": {
        "type": "object", "additionalProperties": false, "required": ["path", "sha256", "size_bytes", "method", "url", "headers"],
        "properties": {
          "path": { "$ref": "#/$defs/rel_path" }, "sha256": { "$ref": "#/$defs/hex64" }, "size_bytes": { "$ref": "#/$defs/count" },
          "method": { "const": "PUT" }, "url": { "type": "string", "minLength": 1 },
          "headers": {
            "type": "object", "additionalProperties": { "type": "string" },
            "propertyNames": { "not": { "pattern": "^[Cc][Oo][Nn][Tt][Ee][Nn][Tt]-[Ll][Ee][Nn][Gg][Tt][Hh]$" } }
          },
          "expires_at": { "type": "string" }
        }
      } }
    }
  },
  "publication_status": {
    "type": "object", "additionalProperties": false, "required": ["schema", "publication_id", "descriptor_digest", "state"],
    "properties": {
      "schema": { "const": "engram_ontology_publication_status_v1" },
      "publication_id": { "$ref": "#/$defs/token" }, "descriptor_digest": { "$ref": "#/$defs/sha256" },
      "state": { "enum": ["verifying", "published", "failed"] },
      "failures": { "type": "array", "items": { "$ref": "#/$defs/verifier_finding" } },
      "warnings": { "type": "array", "items": { "$ref": "#/$defs/verifier_finding" } }
    }
  },
  "patch_context": {
    "type": "object", "additionalProperties": false,
    "required": ["schema", "model_id", "graph_hash", "decision_log_digest", "nodes", "relations", "alias_of", "rejections", "decisions", "evidence_refs"],
    "properties": {
      "schema": { "const": "engram_ontology_patch_context_v1" },
      "model_id": { "$ref": "#/$defs/token" }, "graph_hash": { "$ref": "#/$defs/token" }, "decision_log_digest": { "$ref": "#/$defs/sha256" },
      "nodes": { "type": "array", "items": {
        "type": "object", "required": ["id"],
        "properties": {
          "id": { "$ref": "#/$defs/token" }, "label": { "type": "string" }, "type": { "type": "string" }, "status": { "type": "string" }, "trust": { "type": "string" },
          "aliases": { "type": "array", "items": { "type": "string" } }, "normalized_terms": { "type": "array", "items": { "type": "string" } },
          "source_refs": { "type": "array", "items": { "$ref": "#/$defs/not_absolute" } },
          "registry_id": { "type": "string" }, "registry_record_id": { "type": "string" }, "registry_partition": { "type": "string" },
          "registry_refs": { "type": "array", "items": { "type": "string" } },
          "decision": { "$ref": "#/$defs/node_decision" }
        }
      } },
      "relations": { "type": "array", "items": { "$ref": "#/$defs/relation" } },
      "alias_of": { "type": "object", "additionalProperties": { "$ref": "#/$defs/token" } },
      "rejections": {
        "type": "object", "additionalProperties": false, "required": ["pairs", "mapping_ids", "candidate_ids", "relations"],
        "properties": {
          "pairs": { "type": "array", "items": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "$ref": "#/$defs/token" } } },
          "mapping_ids": { "$ref": "#/$defs/tokens" }, "candidate_ids": { "$ref": "#/$defs/tokens" },
          "relations": { "type": "array", "items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "$ref": "#/$defs/token" } } }
        }
      },
      "decisions": { "type": "array", "items": {
        "type": "object", "additionalProperties": false, "required": ["id", "operation", "disposition"],
        "properties": { "id": { "$ref": "#/$defs/token" }, "operation": { "$ref": "#/$defs/token" }, "disposition": { "$ref": "#/$defs/token" } }
      } },
      "evidence_refs": { "type": "array", "items": { "$ref": "#/$defs/not_absolute" } }
    }
  },
  "path_free": {
    "not": { "type": "object", "anyOf": [ { "required": ["sourcePath"] }, { "required": ["bound_source_path"] } ] },
    "additionalProperties": { "$ref": "#/$defs/path_free" },
    "items": { "$ref": "#/$defs/path_free" }
  },
  "profile_bundle": {
    "allOf": [ { "$ref": "#/$defs/path_free" } ],
    "type": "object", "additionalProperties": false,
    "required": ["schema", "digest", "profileId", "profileVersion", "profileHash", "profile", "documentProjection", "extensions", "registries", "registriesMode"],
    "properties": {
      "schema": { "const": "engram.profile-bundle/v1" },
      "digest": { "$ref": "#/$defs/hex64" }, "profileId": { "$ref": "#/$defs/token" }, "profileVersion": { "$ref": "#/$defs/token" },
      "profileHash": { "$ref": "#/$defs/token" }, "presentationHash": { "$ref": "#/$defs/hex64" },
      "profile": {
        "type": "object", "not": { "required": ["sourcePath"] },
        "properties": { "registries": { "type": "object", "additionalProperties": { "type": "object", "not": { "required": ["bound_source_path"] } } } }
      },
      "documentProjection": {
        "type": "object", "not": { "anyOf": [ { "required": ["sourcePath"] }, { "required": ["profile_hash"] } ] },
        "properties": { "registries": { "type": "object", "additionalProperties": { "type": "object", "not": { "required": ["bound_source_path"] } } } }
      },
      "extensions": { "type": "object" },
      "registries": { "type": "object", "additionalProperties": {
        "type": "object", "additionalProperties": false, "required": ["registryId", "binding", "recordCount", "recordsDigest"],
        "properties": {
          "registryId": { "$ref": "#/$defs/token" },
          "binding": { "type": "object", "not": { "required": ["bound_source_path"] } },
          "recordCount": { "type": ["integer", "null"] }, "recordsDigest": { "type": ["string", "null"] }
        }
      } },
      "registriesMode": { "enum": ["full", "bindings-only"] }
    }
  },
  "entity_index": {
    "type": "object", "additionalProperties": false, "required": ["schema", "count", "entries"],
    "properties": {
      "schema": { "const": "engram_ontology_entity_index_v1" }, "count": { "$ref": "#/$defs/count" },
      "entries": { "type": "object", "additionalProperties": {
        "type": "array", "minItems": 2, "maxItems": 2, "items": { "$ref": "#/$defs/count" }
      } }
    }
  },
  "projection": {
    "type": "object", "required": ["schema", "generated_at", "inputs", "summary", "artifacts"],
    "properties": {
      "schema": { "const": "engram_ontology_projection_v1" }, "generated_at": { "type": "string" },
      "inputs": {
        "type": "object", "additionalProperties": false,
        "required": ["graph_hash", "profile_hash", "decision_log_digest", "decision_log_revision"],
        "properties": {
          "graph_hash": { "$ref": "#/$defs/token" }, "profile_hash": { "$ref": "#/$defs/token" },
          "presentation_hash": { "$ref": "#/$defs/sha256" },
          "decision_log_digest": { "$ref": "#/$defs/sha256" }, "decision_log_revision": { "$ref": "#/$defs/count" }
        }
      },
      "summary": { "type": "object", "additionalProperties": { "$ref": "#/$defs/count" } },
      "artifacts": { "type": "array", "items": { "$ref": "#/$defs/artifact" } }
    }
  },
  "recon_queue": {
    "allOf": [ { "$ref": "#/$defs/queue_disclosures" } ],
    "type": "object", "required": ["schema", "graph_hash", "profile_hash", "generated_at", "candidate_count", "candidates"],
    "properties": {
      "schema": { "const": "engram_ontology_reconciliation_candidates_v1" },
      "graph_hash": { "type": "string" }, "profile_hash": { "type": "string" }, "generated_at": { "type": "string" },
      "candidate_count": { "$ref": "#/$defs/count" }, "decision_log_digest": { "$ref": "#/$defs/sha256" },
      "candidates": { "type": "array", "items": { "$ref": "#/$defs/candidate" } }
    }
  }
}
~~~

Notes.

- `projection` is the manifest of a materialized projection (Amendment §14). Its `inputs` repeat what the engine folded, in the form the profile stores: `profile_hash` is the string a patch carries, and `presentation_hash` is `sha256:`-prefixed (`src/ontology-profile.ts:630–640,688–689`). The pin converts both to bare hex (§5.1).
- `recon_queue` is the shipped candidate queue (`src/ontology-reconciliation.ts:69–109`), with the optional `decision_log_digest` of the Amendment MAT-4 and, on a decided candidate, the `decision` of REC-2.
- `path_free` forbids the two runtime member names at any depth of a bundle (BND-4).
- In `upload_plan`, header names compare without regard to case. The publisher sends exactly the headers of the plan plus `Content-Length: <size_bytes>`: the shipped signer binds the exact length (Split:588). A plan never names `Content-Length` itself, and the schema refuses one that does.
- `omitted` counts what the port emitters left out of the publication under SRC-3 and under §7.10 row 6.

### 7.9 Events and errors

~~~json
{
  "event_snapshot_updated": {
    "type": "object", "additionalProperties": false, "required": ["schema", "model_id", "pin_token", "decision_log_revision"],
    "properties": {
      "schema": { "const": "engram_ontology_event_snapshot_updated_v1" },
      "model_id": { "$ref": "#/$defs/token" }, "pin_token": { "type": "string", "pattern": "^[A-Za-z0-9._-]{1,128}$" },
      "decision_log_revision": { "$ref": "#/$defs/count" }, "descriptor_digest": { "$ref": "#/$defs/sha256" }
    }
  },
  "event_patch_applied": {
    "type": "object", "additionalProperties": false,
    "required": ["schema", "model_id", "patch_id", "operation", "affected_node_ids", "pin_token", "decision_log_revision", "queue_stale"],
    "properties": {
      "schema": { "const": "engram_ontology_event_patch_applied_v1" },
      "model_id": { "$ref": "#/$defs/token" }, "patch_id": { "$ref": "#/$defs/token" }, "operation": { "$ref": "#/$defs/token" },
      "affected_node_ids": { "$ref": "#/$defs/tokens" }, "pin_token": { "type": "string", "pattern": "^[A-Za-z0-9._-]{1,128}$" },
      "decision_log_revision": { "$ref": "#/$defs/count" }, "queue_stale": { "type": "boolean" }
    }
  },
  "event_reconciliation_stale": {
    "type": "object", "additionalProperties": false, "required": ["schema", "model_id", "reason"],
    "properties": {
      "schema": { "const": "engram_ontology_event_reconciliation_stale_v1" },
      "model_id": { "$ref": "#/$defs/token" }, "reason": { "$ref": "#/$defs/token" }
    }
  },
  "error": {
    "type": "object", "additionalProperties": false, "required": ["schema", "code", "message"],
    "properties": {
      "schema": { "const": "engram_ontology_port_error_v1" },
      "code": { "$ref": "#/$defs/token" }, "message": { "type": "string" }, "model_id": { "$ref": "#/$defs/token" }, "details": { "type": "object" }
    }
  }
}
~~~

Events carry identifiers and digests only. `affected_node_ids` follows PAT-2a. Known error codes: `model_not_found`, `entity_not_found`, `candidate_not_found`, `source_not_found`, `capability_unavailable`, `graph_hash_missing`, `write_disabled`, `stale_pin`, `invalid_request`, `publication_refused`. §12 names the call that gives each one. `publication_refused` is the answer of `initiateWorkspacePublication` to a descriptor that fails the checks which need no artifact (§8.7), and its `details.failures` carries the findings. How a code maps to a status code is the envelope's.

### 7.10 Shipped behaviours this contract corrects at the port

| # | At the pin | At the port |
|---|---|---|
| 1 | A decision-log `path` falls back to a home-relative or absolute path (`src/ontology-patch.ts:197–201`). | A relative path. When the log lies outside the workspace root, its base name. |
| 2 | `changed_files[].path` is the resolved decision path and a path under the resolved state directory (`src/ontology-patch.ts:588–606`; `src/project-config.ts:447,452–454`; `src/ontology-patch-context.ts:100`). | Relative to the workspace root. |
| 3 | `candidates.path` of the rebuild status is absolute when the file is outside the state directory (`src/ontology-reconciliation-api.ts:39–48`). | A relative path. |
| 4 | Provenance keeps absolute paths (§7.6). | SRC-3. |
| 5 | The candidates response type has no member for the queue disclosures (REC-3). | Carried in `queue`. |
| 6 | A `source_file` (scene node, citation, grounding span), a node's `source_refs` and an `evidence_refs` entry are carried as extraction recorded them (`src/studio-scene.ts:274`; `src/types.ts:574`; `src/retrieval/answer-pack.ts:90`; `src/ontology-patch-context.ts:119,132`). Nothing at those points makes a value relative. Whether an extraction can record an absolute path is `unverified`. | `not_absolute`. [JUDGMENT] A value that is an absolute path is never rewritten, because a reference is matched by exact string (Amendment LOG-9). The member is left out, or the citation that requires it, and a publication counts both in `omitted` (§7.8). |

### 7.11 Names minted by Engram

| Placeholder in the split (r1 to r7) | Name in this contract |
|---|---|
| `profilePin`, `profileFamily`, `presentationHash`, `graphHash` | `profile`, `profile_family`, `presentation_hash`, `graph_hash` |
| `decisionLogDigest`, `decisionRevision`, `pinToken` | `decision_log_digest`, `decision_log_revision`, `pin_token` |
| `expectedPinToken`, `newPin` | `expected_pin_token`, `new_pin` |
| `allowedPatchOps`, `knownTrustTiers` | `known_patch_ops` with `write_enabled` and `preview_enabled`, `known_trust_tiers` |
| `taxonomyOrder` | `type_order` |
| `rebuildPending` | `stale` on the queue, `queue_stale` on the status and the event |
| `createdCanonicalId` | `created_node_id` |
| `orphanDecisionIds`, `conflictedDecisionIds` | The `disposition` of each decision-log item, and `summary` |
| `descriptorDigest` | `descriptor_digest` |
| `engram_ontology_bundle_publication_v1`, `ontology-publication.json` | `engram_ontology_workspace_publication_v1`, `publication.json` |
| `commentsEnabled`, `trackControlled` | Not in an Engram DTO. See §14. |
| `contentDigest` as "`== profile_hash` as Engram stores it" (Split:493–494) | Bare hex for every family (§5.1) |
| `profileFamily` as an open string (Split:496–498) | `profile_family`, closed to three values in v1 (§5.1) |
| `snapshotId` on the pin and on the snapshot event (Split:506,637) | Not in the pin and not in an event. The scene keeps its shipped `snapshot_id` (§7.3). |
| `trustTier` (Split:520) | `trust` |
| `schemaVersion: 1` on the capabilities (Split:534) | `schema: "engram_ontology_port_capabilities_v1"` |
| `query` in the retrieval input (Split:557) | `question`, the member the answer pack already has (§7.5) |
| `etag` in the result of `readSource` (Split:559) | Not an Engram value. The validator of a read is the envelope's (PIN-4). |
| The options of `getDecisionLog` (Split:562) | `decision_log_query` (§7.7) |
| `idempotencyKey` in the apply input, and an always-present `newPin` (Split:567–571) | No idempotency member (PAT-4). `new_pin` only after a successful write (PAT-3). |
| `affectedEntityIds` (Split:637) | `affected_node_ids` (PAT-2a) |

## 8. Workspace publication

A workspace publication is the immutable, compiled content of one workspace as Engram hands it to a host. "Bundle" is not used for it: in Engram that word means `ProfileBundleV1` and `workspace-bundle-contract-v1` (Review:187).

### 8.1 Descriptor and identity

| Rule | Statement |
|---|---|
| PUB-1 | The descriptor is the file `publication.json`, schema `engram_ontology_workspace_publication_v1`. It is written as RFC 8785 canonical bytes with no trailing line feed. |
| PUB-2 | `descriptor_digest = "sha256:" + sha256Hex(bytes of publication.json)`. It is the identity of the publication. One publication may hold several models, so no model pin can name it (Split:588). |
| PUB-3 | Every file of the publication is listed once, with its `sha256` and `size_bytes`, under its model or under `workspace_artifacts`. The descriptor does not list itself. Within one model no two artifacts share a `name` or a `path`. Under `workspace_artifacts` no two share a `path`, and only the name `source` repeats (SEM-8). |
| PUB-4 | The files of the signed manifest keep their names and bytes. For each artifact that the manifest marks `present`, the descriptor lists the file, and its digest and size equal the manifest's (`src/workspace-manifest.ts:72–83`). An artifact that the manifest marks absent has no file and no descriptor entry. |
| PUB-5 | A hosted `manifest` DTO is computed from the descriptor and from the bytes of the listed `workspace-manifest` artifact, read through the injected reader after its digest was checked. Each model entry of the descriptor therefore carries the pin, the patch stamp and the profile summary. `workspace_manifest` is the parsed content of that model's artifact, unchanged, when the artifact is listed. It is absent otherwise. |

### 8.2 Content of one model

| Artifact `name` | Path under `models/<model_id>/` | `schema` | Required |
|---|---|---|---|
| `profile-bundle` | `profile-bundle.json` | `engram.profile-bundle/v1` | Yes |
| `patch-context` | `patch-context.json` | `engram_ontology_patch_context_v1` | Yes |
| `decision-log` | `decisions.jsonl` | `engram_ontology_patch_v1` | Yes. An empty file when there is no decision. |
| `projection` | `projected/projection.json` | `engram_ontology_projection_v1` | Yes |
| `projected-scene` | `projected/scene.json` | none | Yes |
| `projected-entities`, `projected-entities-index` | `projected/entities.ndjson`, `projected/entities.index.json` | none, `engram_ontology_entity_index_v1` | Yes |
| `projected-decision-log` | `projected/decision-log.json` | `engram_ontology_reconciliation_decision_log_v1` | Yes. The whole authoritative view with its `effect` members. The host filters and pages it. |
| `projected-reconciliation-candidates` | `projected/reconciliation-candidates.json` | `engram_ontology_reconciliation_candidates_v1` | When a queue exists. The base queue with its decided items marked (REC-5). |
| `projected-scene-hierarchies`, `projected-class-hierarchies` | `projected/scene-hierarchies.json`, `projected/class-hierarchies.json` | their shipped identifiers | When the base has them |
| `projected-window.<strategy>.<layout>`, `projected-groups.<axis>` | `projected/window.<strategy>.<layout>.json`, `projected/groups.<axis>.json` | none | Reserved. Never in v1 (Amendment MAT-0). |
| `projected-search-index` | `projected/search-index.json` | none | Reserved. Never in v1 (Amendment MAT-0). |
| `workspace-manifest` | `workspace-manifest.json` | `engram_workspace_manifest_v1` | When the model's base bundle has one |
| `scene`, `scene-hierarchies`, `reconciliation-candidates`, `graph`, `entities` | The five paths the manifest lists, as emitted (`src/workspace-manifest-emitter.ts:69–85`) | as emitted | Each one that the manifest marks `present` (PUB-4) |

Workspace-level artifacts: `models` (`models.json`), `sources-provenance` (`sources/provenance.json`) and one `source` entry per cited document under `sources/`.

[JUDGMENT] Projected artifacts are produced at publish time by the one projection of the Amendment §5, under the view rules of its §7 (VIEW-6 to VIEW-6c) and the materialization rules of its §14. Scene, entities, hierarchies, provenance and sources are served byte for byte. The decision-log and reconciliation artifacts are **inputs** to the Engram library inside the host (`./ontology-studio-host`), which applies the shipped filter, sort and paging functions and leaves decided items out by default (REC-2, REC-5, LOGV-2 to LOGV-4). No Sentropic code implements a filter, a fold or a query rule, and no fold runs for a read (Split:390,427).

[JUDGMENT] `projected-entities` holds one entity view per line, each in canonical JSON. `projected-entities-index` maps an entity identifier to the byte offset and length of its line. A host answers `getEntity` with that byte range and parses nothing.

### 8.3 The sealed profile bundle

The profile travels as `ProfileBundleV1`, Engram's portable carrier, exported from `./profile-bundle` (`package.json:51–54`; `src/profile-bundle.ts:25,41–53,582–587`).

| Rule | Statement |
|---|---|
| BND-1 | The bundle is produced by `bundleProfile` from the authored profile document. A profile whose linking names a local module is refused there (`src/profile-bundle.ts:331–354`). |
| BND-2 | The sealed content is `documentProjection`, `registries` and `registriesMode`. `digest` covers `{ schema, document: documentProjection, registries, registriesMode }`. Each registry enters as `{ binding, recordCount, recordsDigest }`, with the literal `not_bundled` in place of `recordsDigest` in `bindings-only` mode (`src/profile-bundle.ts:169–190`). The `profile` member is outside the digest. |
| BND-3 | A consumer never trusts `profile` as received. It recomputes the digest and derives the normalized profile again from `documentProjection`, as the comparison path of the bundle module does (`src/profile-bundle.ts:771–805`). [JUDGMENT] Engram exports this as one function, proposed `openProfileBundle(bundle)`. It returns `{ ok: true, profile, profileHash, presentationHash? }` or `{ ok: false, issues }`, where `issues` is a list of `ProfileBundleIssue` (`:27–32`). It never throws on bundle content. Today the check is internal: `resolveComparableSide` is not exported (`:722`). The exported pair verifier accepts tagged data models only and requires empty `extensions` (`:1411,1439,1447–1448`). In `full` mode the recomputation covers the bundle digest over the stored snapshots. It cannot check `recordCount` or `recordsDigest` against registry records, because the bundle does not carry them. Hosted preview therefore never depends on registry records (Amendment §5). |
| BND-4 | The bundle holds no runtime path: no `sourcePath` and no `profile_hash` at the top of `documentProjection`, and no member named `sourcePath` or `bound_source_path` at any depth of the bundle, `extensions` included. The pair verifier already refuses `sourcePath`, `profile_hash` and a registry `bound_source_path` inside `documentProjection`, for tagged models (`src/profile-bundle.ts:1404–1410`). The bundle validity check admits a `sourcePath` in `profile` (`:632`), and the digest does not protect it. Publication adds the refusal for every family, as a scan of member names over the whole bundle value (`path_free`, §7.8). A violation is `bundle_invalid`. String values are not scanned: `extensions` holds the keys of the authored document that the loader does not consume, copied as written (`:541–545`), so it carries what the author wrote and no value that the runtime injected. |
| BND-5 | The pin's `profile.pin.contentDigest` equals `profileHash`, its `id` and `version` equal `profileId` and `profileVersion`, and its `presentation_hash` equals `presentationHash`. |
| BND-6 | The bundle has no member outside the eleven names of `BUNDLE_KEYS` (`src/profile-bundle.ts:1352–1355`). |

**Correction of the review.** Review:185 asked that registry records be published only under `registriesMode: "full"`. The bundle never holds a registry record. In `full` mode it holds a count and a digest of the records, and in `bindings-only` mode it holds neither (`src/profile-bundle.ts:34–39,452–456,526–530`). No file of a publication holds a registry record. `registries_mode` in the descriptor only records which of the two the bundle attests.

### 8.4 The patch-context document

Hosted preview needs the state a patch is evaluated against. At the pin that state is loaded from disk by a function that lets `profile-state.json` choose two directories and runs `git status` in one of them (`src/ontology-patch-context.ts:100,103,137`).

| Rule | Statement |
|---|---|
| CTX-1 | `patch-context` is the projected decision state of the model at the publication's pin: projected nodes and relations, the alias map, the rejections, and one line per decision with its disposition. The publish step writes it from the same projection run as the projected artifacts. Arrays keep the order of the Amendment PRJ-7. A rejected pair is `[a, b]` in code-unit order. A rejected relation is `[relation_type, source_id, target_id]`. |
| CTX-2 | It holds none of the five environment members of the shipped context (`rootDir`, `stateDir`, `profileState`, `decisionsPath`, `dirtyWorktree`; `src/ontology-patch.ts:88–101`). None is in the schema, and the schema is closed. |
| CTX-3 | A host builds its decision context from `profile-bundle` and `patch-context` with the pure builder of the Amendment §5. It never calls `loadOntologyPatchContext`. No filesystem read and no `git` call occur on the preview path. |
| CTX-4 | Hosted validation and dry-run evaluate the patch against that state with the engine's one evaluation function. For `valid`, `disposition`, the codes of the error issues and the created identifiers, the result equals that of a local host at the same pin. Parity covers nothing else: a hosted dry-run returns `changed_files: []` and never raises `dirty_worktree`, because a pure context has no path and no worktree. No fold runs in the host. |
| CTX-5 | Two checks of `revert_decision` need a second fold: its dependents and the records it would reactivate (Amendment REV-5, REV-6). A host that holds no base reports them as not evaluated, with the warning code `dependents_not_evaluated` (Amendment §13). Hosted writes are not mounted in the baseline of the split (Split:437). |
| CTX-6 | `evidence_refs` is the union the local validator knows (`src/ontology-patch.ts:352–361`; `src/ontology-patch-context.ts:64–76,134`): the `id` and the `source_file` of each source, the `source_refs` of each projected node and the `evidence_refs` of each projected relation, without duplicates, in code-unit order. An absolute path is never written as a reference (§7.10 row 6). A patch that cites one previews as `evidence_unknown`, and CTX-4 does not cover that case. |

### 8.5 What a publication never carries

| Never published | Why |
|---|---|
| `profile-state.json` | It names a state directory and a project configuration path (`src/ontology-patch-context.ts:100,103`). |
| `project-config.normalized.json` | It holds the configuration directory and resolved paths (`src/ontology-patch-context.ts:81,93,103`; `src/project-config.ts:447,452–454`). |
| `ontology-profile.normalized.json` | The runtime profile carries `sourcePath` and, once bound, `bound_source_path`. The hash excludes both, so it does not protect them (`src/ontology-profile.ts:665,720–723`; `src/ontology-guardian/digests.ts:110–111`). |
| `registries/*.json` | §8.3. |
| An absolute path in any JSON member covered by `rel_path` or `not_absolute` | CNV-7. |
| A provenance entry or link with an absolute path | SRC-3. The descriptor counts what the emitter dropped in `omitted`. |
| A model without a graph hash | §5.2. |
| A decision log with an opaque entry | Amendment CMP-3. A log that leaves the corpus repository must parse entirely. |

### 8.6 Decisions under a changed base or profile

| Rule | Statement |
|---|---|
| DRF-1 | `decisions.summary` holds the count of decisions per disposition. `decisions.rebased` holds the count of rebased records (Amendment RBS-1). |
| DRF-2 | The publish step refuses a model in which a rebased record has a disposition of the class "needs attention" (Amendment §7), with the failure code `decision_drift`. |
| DRF-3 | The operator may pass an explicit acknowledgment. The step then publishes and writes `drift_acknowledged: true`. This is the explicit act that the lifecycle specification attaches to a rebase (LC:188–189; Amendment RBS-6). |
| DRF-4 | When the profile of a model differs from the one currently published for that model, the descriptor carries `previous_profile`: the previous profile reference and the verdict of `checkProfileCompatibility(previous bundle, new bundle)` (`src/profile-bundle.ts:872–876`). A breaking change is thereby visible to the hosted audit panel (Review:172). |
| DRF-5 | How the publish step obtains the previously published bundle is the hosted flow's. When it cannot, `previous_profile` is absent. The verifier then returns the warning `previous_profile_unavailable`, and the status lists it in `warnings` (§8.7). |

No route of the port publishes or promotes a profile or a governance revision. That stays in Engram's catalog (G0A:123–125; Review:173).

### 8.7 Verification

[JUDGMENT] Engram exports one verifier, proposed `verifyWorkspacePublication(descriptorBytes, readArtifact, options?)`. It is pure apart from the injected reader. The host calls it during asynchronous verification, after it has checked every digest and size against storage (Split:588). `options.previousDescriptor` is the descriptor that the workspace pointer names at that moment, when one exists.

It returns `{ ok, failures, warnings }`. `failures` and `warnings` are lists of `{ code, message, path? }` (`verifier_finding`, §7.8). `ok` is true exactly when `failures` is empty, and a warning never changes it. The host copies both lists into `publication_status`. The first four checks need no artifact. A host runs them at `initiateWorkspacePublication` and answers `publication_refused` when one fails (§7.9).

| Check | Failure code |
|---|---|
| The descriptor is canonical and matches its schema, and it meets SEM-5 and SEM-8. | `descriptor_invalid` |
| The contract identifier is this contract, and the revision is not above the verifier's. | `contract_mismatch` |
| Every required artifact of §8.2 is listed. | `artifact_missing` |
| No path listed under a model has the base name `profile-state.json`, `project-config.normalized.json` or `ontology-profile.normalized.json`, and none has a directory `registries` directly above a `.json` file. The same holds under `workspace_artifacts` for every artifact other than a `source`. The finding names the `path`. | `forbidden_artifact` |
| BND-2 to BND-6 hold for each bundle. | `bundle_invalid` |
| The pin recomputes: digest of the log snapshot, bundle digests, `pin_token` (§5.3). | `pin_mismatch` |
| `projection.json` and `patch-context` name the pin's graph hash and log digest. | `projection_mismatch` |
| The log snapshot has no opaque entry. | `decision_log_unparsable` |
| DRF-2 and DRF-3. | `decision_drift` |
| The path rules of §8.5 hold in every JSON document the verifier parses. | `absolute_path` |
| The manifest digests equal the descriptor's (PUB-4). | `manifest_mismatch` |

One warning exists, `previous_profile_unavailable`. It is raised for a model whose profile pin differs from the one in `previousDescriptor` and whose entry carries no `previous_profile` (DRF-5).

A cited document is exempt from the name rule. The verifier cannot judge the content of a document, and no host reads a file under `sources/` as state.

## 9. No NER shape in V1

The NER consumer belongs to Engram's Spec 2, whose status is `proposed` (Spec 2:3–4). Nothing has decided how a span becomes an annotation or graph evidence. (Review:189–195.)

| Rule | Statement |
|---|---|
| NER-1 | No schema of §7 defines a member, a capability, an event or an error code for NER or for enrichment status. |
| NER-2 | An Engram emitter under this contract writes no member whose name holds the token `ner`, `span` or `receipt`, in any DTO, open-additive DTOs included. A name is split into tokens on `_` and on case boundaries, and the tokens are compared in lower case: `generated_at` gives `generated` and `at`, and passes. Values are never scanned. Two exemptions exist. The keys inside `occurrences` are data, not members (§7.4). The citation member `quoteSpan` is a pair of quote offsets that ships at the pin (`src/types.ts:594`). The emitter conformance run scans for the rule (§12). |
| NER-3 | NER-derived data reaches a Studio only through this port, as provenance that Engram defines in its own specification. Adding such a member is a contract revision made after that decision, never a consumer-side extension. |
| NER-4 | The Studio never calls `llm-mesh` (Split:391). |

Provenance that exists today stays as it is: the free strings `assertion_basis` and `derivation_method`, and `confidence_score`, as the scene already carries them (`src/studio-scene.ts:257–299`). No closed `origin` union exists.

## 10. Fixtures and vectors

[JUDGMENT] Contract files are data. They ship in the Engram package under one directory and one subpath, proposed `contracts/ontology-studio-data-port/v1/` and `./contracts/ontology-studio-data-port`.

~~~text
contracts/ontology-studio-data-port/v1/
  contract.json                      the manifest of §11
  data-port.schema.json              the bundle of §7
  fixtures/<dto>.<case>.valid.json
  fixtures/<dto>.<case>.invalid.<reason>.json
  vectors/LV-<group>-<nn>.<expected>.json   the lifecycle vectors of the Amendment §16
  vectors/TV-<nn>.<expected>.json           the temporal vectors, below
  vectors/PV-<nn>.<expected>.json           the publication vectors, below
  profiles/<name>.json                      the profile fixtures the lifecycle vectors name
~~~

Every file name carries its expected result. A `valid` fixture must validate against `$defs/<dto>` and pass the rules of §7.1a. An `invalid` fixture must fail, and `<reason>` names the rule or the schema keyword that fails. A runner that gets another outcome fails. A verb, an error code or an event with one fixture per value has one file per value: a file that holds several patches cannot validate against the single-patch definition.

| Fixture | Expected | Reason |
|---|---|---|
| `version_pin.legacy` | valid | No `presentation_hash`, no namespace. |
| `version_pin.metamodel-v1` | valid | `presentation_hash` present. |
| `version_pin.data-model` | valid | Family `engram.data-model/1`. |
| `version_pin.catalog-namespace` | valid | `profile.namespace` present. |
| `version_pin.unknown-family` | invalid | `enum` on `profile_family`: the set is closed in v1 (§5.1). |
| `version_pin.empty-graph-hash` | invalid | `minLength` on `graph_hash`. |
| `version_pin.prefixed-content-digest` | invalid | `contentDigest` is bare hex (§5.1). |
| `version_pin.prefixed-presentation-hash` | invalid | `presentation_hash` is bare hex (§5.1). |
| `version_pin.governance-member` | invalid | Closed: no governance member in the pin. |
| `version_pin.semantic-digest-member` | invalid | Closed: no duplicate digest member. |
| `version_pin.token-with-colon` | invalid | PIN-3. |
| `version_pin.metamodel-v1-without-presentation` | invalid | SEM-2, `then`. |
| `version_pin.legacy-with-presentation` | invalid | SEM-2, `else`. |
| `version_pin.token-mismatch` | invalid | SEM-3. |
| `capabilities.known-sets` | valid | VOC-3: exactly the ten verbs and the four tiers of §6. |
| `capabilities.read-only-host` | valid | `write_enabled: false`. |
| `capabilities.hosted-preview` | valid | The hosted baseline: `preview_enabled: true`, `write_enabled: false`, empty window lists. |
| `capabilities.unknown-verb-and-tier` | valid | VOC-1. |
| `capabilities.extra-member` | valid | CNV-4, open-additive. |
| `capabilities.wrong-contract-id` | invalid | `const` on `contract.id`. |
| `models.two-models` | valid | Shipped shape. |
| `manifest.two-models` | valid | Per-model pins and stamps. |
| `manifest.breaking-profile-change` | valid | `previous_profile` with a typed `removed_status` entry. |
| `manifest.stamp-mismatch` | invalid | SEM-4. |
| `manifest.unknown-default-model` | invalid | SEM-5. |
| `workspace_manifest.five-artifacts` | valid | The signed shape, with one artifact absent. |
| `workspace_manifest.prefixed-sha256` | invalid | An artifact `sha256` is bare hex or `null`. |
| `scene.closed-interval` | valid | `t` and `t_end`. |
| `scene.decision-markers` | valid | `decision` on a node. |
| `scene.status-outside-profile` | valid | VOC-4: the status `reference`. |
| `scene.created-node-without-position` | valid | A created node has no position member (Amendment VIEW-6b). |
| `scene.inverted-interval` | invalid | SEM-1. |
| `scene.ner-member` | invalid | SEM-10: the open-additive member `ner_receipt_ref` fails the emitter scan. |
| `window.degree-top-n` | valid | Typed nodes and edges, with a string stamp. |
| `window.unpopulated` | valid | `populated: false`, null stamp. |
| `window.unpopulated-with-stamp` | invalid | SEM-6. |
| `groups.node-type-axis` | valid | Shipped shape. |
| `scene_hierarchies.tree-with-overlay` | valid | One tree, one overlay arc, one conflict. |
| `scene_hierarchies.numeric-parent-id` | invalid | `parent_id` is a string or `null`. |
| `class_hierarchies.two-levels` | valid | Shipped shape. |
| `class_hierarchies.conflict-without-classes` | invalid | `dropped_classes` is required. |
| `entity.shipped-sidecar` | valid | The seven shipped members only. |
| `entity.merged-member` | valid | `decision.merged_into`. |
| `entity.unknown-trust-tier` | valid | VOC-1. |
| `entity.with-citations` | valid | Typed citations, `quoteSpan` included. |
| `entity.absolute-citation-source` | invalid | §7.10 row 6. |
| `answer_pack.offline` | valid | The shipped pack, with `answer: null`. |
| `provenance.relative-chain` | valid | A file link and a URL link. |
| `provenance.absolute-original` | invalid | SRC-3. |
| `provenance.absolute-key` | invalid | SRC-3. |
| `provenance.unknown-link-kind` | invalid | `enum` on `kind`: closed (§6). |
| `recon_list.with-disclosures` | valid | REC-3. |
| `recon_list.decided-item` | valid | REC-2. |
| `recon_list.unknown-proposed-operation` | invalid | `enum` on `proposed_patch_operation`: closed (§6). |
| `recon_queue.with-digest` | valid | The queue with `decision_log_digest` and one decided candidate. |
| `recon_queue.missing-candidates` | invalid | `required`. |
| `decision_log.dispositions` | valid | One item per disposition class. |
| `decision_log.unknown-disposition` | valid | VOC-1. |
| `decision_log.absolute-path` | invalid | §7.10 row 1. |
| `decision_log.unknown-source` | invalid | `enum` on `source`: closed (§6). |
| `rebuild_status.live-host` | valid | `projection.materialized: false`. |
| `patch.<verb>`, ten files, one per verb of §6 | valid | Known verbs. `patch.revert_decision` carries an empty `evidence_refs` (Amendment REV-1). |
| `patch.legacy-schema-id` | valid | CNV-8. |
| `patch.unknown-verb` | valid | VOC-1. The engine answers `unsupported_operation`. |
| `patch_validation.coded-issues` | valid | One error and one warning, each with a `code`. |
| `patch_validation.unknown-severity` | invalid | `enum` on `severity`. |
| `patch_apply.created-node` | valid | `created_node_id`, `new_pin`. |
| `patch_apply.already-applied` | valid | `already_applied: true`, no `new_pin`. |
| `patch_apply.absolute-changed-file` | invalid | §7.10 row 2. |
| `apply_request.idempotency-member` | invalid | PAT-4, closed. |
| `profile_bundle.bindings-only`, `profile_bundle.full` | valid | §8.3. |
| `profile_bundle.source-path` | invalid | BND-4. |
| `profile_bundle.bound-source-path` | invalid | BND-4. |
| `profile_bundle.nested-source-path` | invalid | BND-4: `sourcePath` three levels down in `extensions` (`path_free`). |
| `profile_bundle.extra-member` | invalid | BND-6. |
| `patch_context.projected-state` | valid | CTX-1. |
| `patch_context.root-dir-member` | invalid | CTX-2. |
| `entity_index.two-entries` | valid | Offsets and lengths. |
| `entity_index.count-mismatch` | invalid | SEM-7. |
| `projection.metamodel-v1` | valid | A prefixed `presentation_hash` in `inputs`. |
| `projection.extra-input` | invalid | `inputs` is closed. |
| `publication_descriptor.two-models` | valid | §8.1, §8.2. |
| `publication_descriptor.drift-acknowledged` | valid | DRF-3. |
| `publication_descriptor.profile-state-artifact` | invalid | SEM-9, `forbidden_artifact`. |
| `publication_descriptor.duplicate-artifact-name` | invalid | SEM-8. |
| `publication_descriptor.duplicate-artifact-path` | invalid | SEM-8. |
| `publication_descriptor.ner-member` | invalid | NER-1, closed. |
| `upload_plan.two-uploads` | valid | §7.8. |
| `upload_plan.content-length-header` | invalid | `propertyNames` on `headers`. |
| `publication_status.failed-with-warning` | valid | One failure, one warning. |
| `publication_status.unknown-state` | invalid | Closed `state`. |
| `event_patch_applied.minimal` | valid | Identifiers and digests only. |
| `event_patch_applied.revert` | valid | A `revert_decision`, with the identifiers of the decision it reverts (PAT-2a). |
| `event_snapshot_updated.hosted` | valid | `descriptor_digest` present. |
| `event_reconciliation_stale.minimal` | valid | Closed shape. |
| `error.<code>`, ten files, one per code of §7.9 | valid | The known set of error codes. `error.stale-pin` is PIN-4. |
| `error.extra-member` | invalid | Closed. |
| `contract_manifest.sorted` | valid | §11. |
| `contract_manifest.prefixed-sha256` | invalid | A listed `sha256` is bare hex (DIG-2). |

The table names 118 files. A row that covers several files says how many.

**Temporal vectors.** The `closed-v1` helpers are Engram's (`src/temporal-interval.ts:24–55`). The Design System mirrors three of them (Split:371). Six vectors lock their results. Each is one JSON file with schema `engram_ontology_temporal_vector_v1`: an `element` with `t` and an optional `t_end`, a `cursor`, and `expected` with two booleans, `interval` and `active`. This schema is distinct from the lifecycle vector's (Amendment §16).

| File | Input | Expected |
|---|---|---|
| `TV-01.active.json` | `t` and `t_end`, cursor between them. | Active. |
| `TV-02.active.json` | `t` and `t_end`, cursor equal to `t_end`. | Active: the interval is closed. |
| `TV-03.inactive.json` | `t` and `t_end`, cursor after `t_end`. | Not active. |
| `TV-04.active.json` | `t` only, cursor after `t`. | Active: open-ended. |
| `TV-05.no-interval.json` | `t_end` lower than `t`. | No interval. Not active for any cursor. |
| `TV-06.active.json` | `t_end` equal to `t`, cursor equal to `t`. | Active: a point in time. |

**Publication vectors.** [JUDGMENT] A schema fixture cannot show a refusal that needs artifact bytes. Seventeen vectors lock the verifier of §8.7. Each is one JSON file with schema `engram_ontology_publication_vector_v1`. It holds `descriptor`, the UTF-8 text of `publication.json`; `artifacts`, a map from path to UTF-8 text, which the runner serves through the injected reader; an optional `previous_descriptor`; and `expected`, with `ok`, `failure_codes` and `warning_codes`. The file name carries the first expected code, or `ok`.

| File | Case | Expected |
|---|---|---|
| `PV-01.ok.json` | Two models, every rule met. | `ok`. |
| `PV-02.descriptor_invalid.json` | The descriptor bytes are not canonical. | `descriptor_invalid`. |
| `PV-03.descriptor_invalid.json` | One model lists two artifacts with one `name`. | `descriptor_invalid`. |
| `PV-04.contract_mismatch.json` | A revision above the verifier's. | `contract_mismatch`. |
| `PV-05.artifact_missing.json` | No `patch-context` for one model. | `artifact_missing`. |
| `PV-06.forbidden_artifact.json` | `models/m/profile-state.json` listed under a model. | `forbidden_artifact`, with that path. |
| `PV-07.ok.json` | A cited document at `sources/registries/a.json`. | `ok`: a `source` is exempt. |
| `PV-08.bundle_invalid.json` | The bundle digest does not recompute. | `bundle_invalid`. |
| `PV-09.bundle_invalid.json` | `sourcePath` nested under `extensions`. | `bundle_invalid`. |
| `PV-10.pin_mismatch.json` | `pin_token` does not recompute. | `pin_mismatch`. |
| `PV-11.projection_mismatch.json` | `projection.json` names another log digest. | `projection_mismatch`. |
| `PV-12.decision_log_unparsable.json` | A merge conflict marker in `decisions.jsonl`. | `decision_log_unparsable`. |
| `PV-13.decision_drift.json` | A rebased record is `orphan`, without acknowledgment. | `decision_drift`. |
| `PV-14.ok.json` | The same publication with `drift_acknowledged: true`. | `ok`. |
| `PV-15.absolute_path.json` | An absolute `source_refs` entry in `patch-context`. | `absolute_path`. |
| `PV-16.manifest_mismatch.json` | The digest of `scene.json` differs from the manifest's. | `manifest_mismatch`. |
| `PV-17.ok.json` | The previous descriptor holds another profile pin, and the entry has no `previous_profile`. | `ok`, with the warning `previous_profile_unavailable`. |

Valid fixtures of shipped shapes are emitted by the shipped builders, not written by hand, so a fixture cannot drift from the code. Lifecycle vectors are the Amendment's. A change of a vector is a contract revision and needs no major of any Sentropic package (Review:130).

## 11. Contract digest: what Sentropic pins

[JUDGMENT]

| Rule | Statement |
|---|---|
| DIG-1 | `contract.json` is the manifest of the contract, with the schema `contract_manifest` below. It lists the schema bundle, every fixture, every vector and every profile fixture as `{ name, path, sha256, size_bytes }`, sorted by `path` in code-unit order, with the contract identifier and an integer `revision`. A repeated `name` or `path` refuses the build. It does not list itself. The pattern is the workspace manifest's, which throws on a repeated name and sorts by code unit (`src/workspace-manifest.ts:72–83,150–171`; `src/workspace-manifest-emitter.ts:32–33`). |
| DIG-2 | A listed `sha256` is the bare hex SHA-256 of the exact bytes of the file. Files are UTF-8 with line feeds. |
| DIG-3 | `contract.json` is written as RFC 8785 canonical bytes. The **contract digest** is `"sha256:" + sha256Hex(bytes of contract.json)` (`src/ontology-guardian/canonical.ts:59–62,92–94`). |
| DIG-4 | The digest covers machine-checked files only. The text of this specification and of the Amendment is outside it. Their commit is what GO-1 records (Split:921). |
| DIG-5 | `revision` increases by one whenever the content of `contract.json` changes. |
| DIG-6 | `@sentropic/contracts` pins the triple `(contract identifier, revision, digest)`. The pin is a conformance receipt: Sentropic's CI ran against exactly those files. |
| DIG-7 | At run time a consumer accepts a host whose capabilities name the same contract identifier and a revision not lower than the pinned one. It does not require equal digests. An additive Engram revision therefore needs no Sentropic release. The rule is safe only because a revision never changes a meaning (Versioning, below). |
| DIG-8 | At an equal revision, different digests mean a damaged or altered contract. A CI refuses it. |
| DIG-9 | A host states the triple it implements in `capabilities.contract`. A publication states the triple it was built under in its descriptor. |

`contract_manifest` is a member of `$defs` in the schema bundle:

~~~json
{
  "contract_manifest": {
    "type": "object", "additionalProperties": false, "required": ["id", "revision", "files"],
    "properties": {
      "id": { "const": "engram.ontology-studio-data-port/v1" }, "revision": { "type": "integer", "minimum": 1 },
      "files": { "type": "array", "items": {
        "type": "object", "additionalProperties": false, "required": ["name", "path", "sha256", "size_bytes"],
        "properties": {
          "name": { "$ref": "#/$defs/token" }, "path": { "$ref": "#/$defs/rel_path" },
          "sha256": { "$ref": "#/$defs/hex64" }, "size_bytes": { "$ref": "#/$defs/count" }
        }
      } }
    }
  }
}
~~~

The order of `files` and the uniqueness of `name` and `path` are checked by the manifest builder and by the fixture runner. JSON Schema cannot state them.

**Versioning.** Engram decides DTO versioning (Review:109).

| Change | Effect |
|---|---|
| A new optional member in an open-additive DTO. A new known value in an open vocabulary. A new fixture or vector. A new optional artifact name. | A new revision under `v1`. |
| Any change to a closed DTO. A removed or renamed member. A changed type. A new required member. A changed digest or token preimage. A new value in a closed set (§6). **Any changed meaning of an existing member, disposition, code or derivation, `type_order`, `stale` and `summary` included.** | A new major: `engram.ontology-studio-data-port/v2`, new `schema` identifiers for the DTOs concerned, a new directory. |

A shipped shape carried verbatim follows its own identifier. If `engram_answer_pack_v1` becomes `v2`, the port carries `v2` under a new contract revision when the change is additive for consumers, and under a new major otherwise.

The memory contract between the same parties is pinned by a co-signed digest. The split reports the constant in `cluster-mesh` (Split:268). That file was not read in this session, so the alignment of this rule with it is `unverified`.

## 12. Conformance

| Where | What runs |
|---|---|
| Engram CI | Every fixture gives its expected result against the bundle and the rules of §7.1a. Every lifecycle and temporal vector gives its expected result against the engine, and every publication vector against the verifier. DTOs emitted by the local host and by the publish step validate. The NER scan of §9 finds nothing. `contract.json` recomputes. |
| Design System CI | The mirror types and the mapper accept every `valid` fixture. `occurrences` is outside that check (§7.4). The fixture adapter replays the vectors and holds no validation rule, no canonicalization and no digest code (Review:201; Split:627). |
| Sentropic CI | The pinned triple equals the `contract.json` of the pinned Engram package version. The envelope tests treat DTO bodies as opaque. |
| Port conformance suite (Split:478) | Scope refusals stay Sentropic's. The DTO assertions of that suite are these fixtures, and its refusal cases are the scenarios below. |

**Port refusal scenarios.** [JUDGMENT] An `error` fixture locks the shape of a code. A scenario locks the call that gives it. The ten scenarios run against the local host in lot P7 and against the hosted module in the split's suite.

| Scenario | Call | Expected error |
|---|---|---|
| PR-01 | Any model-scoped call with a model identifier that the workspace does not hold. | `model_not_found` |
| PR-02 | `getEntity` with an identifier that names no base node and no created node. | `entity_not_found` |
| PR-03 | `getReconciliationCandidate` with an identifier that the queue does not hold. | `candidate_not_found` |
| PR-04 | `readSource` for a document that does not exist. | `source_not_found`, and never an HTML page (SRC-2) |
| PR-05 | `getWindow`, `getGroupCounts` or `queryRetrieval` on a model whose log holds an effective decision, or on a host without a store. | `capability_unavailable` |
| PR-06 | Any model-scoped call on a model whose ontology manifest holds no graph hash. | `graph_hash_missing` |
| PR-07 | `applyPatch` on a host whose capabilities say `write_enabled: false`. | `write_disabled` |
| PR-08 | `applyPatch` with an `expected_pin_token` that is not the current one. | `stale_pin`, and nothing is appended (PIN-4a) |
| PR-09 | `applyPatch` with a request that carries a member outside `apply_request`. | `invalid_request` |
| PR-10 | `initiateWorkspacePublication` with a descriptor that lists a forbidden path. | `publication_refused`, with the finding in `details.failures` |

The validator is a development dependency. This contract adds no production dependency to Engram's root manifest, and the contract directory is data only (Review:220).

## 13. Test-first Engram lots

[JUDGMENT] Node, TypeScript and Vitest. Zero Python. Each lot observes its named failure first. Line caps are set by the conductor.

| Lot | First failing assertion | Passing change |
|---|---|---|
| P1. Bundle and shipped shapes | A `valid` fixture emitted by a shipped builder fails its schema, or `scene.inverted-interval` passes. | `data-port.schema.json`, the fixture runner with the rules of §7.1a, fixtures of the shipped shapes. |
| P2. Pin, token, vocabularies | `version_pin.prefixed-content-digest` passes, or two hosts give two tokens for one pin. | The pin builder for the three families, the one `graph_hash` of §5.2, `P-PIN`, capabilities, manifest and `type_order`. The QA comparison at `src/qa.ts:820` is checked against that `graph_hash`, and the result is recorded. |
| P3. Path rules | `decision_log.absolute-path`, `patch_apply.absolute-changed-file` or `entity.absolute-citation-source` passes. | The six corrections of §7.10 at the port emitters. Shipped CLI output is unchanged. The lot records whether an extraction can write an absolute `source_file`. |
| P4. Sealed bundle and patch context | `profile_bundle.source-path` or `profile_bundle.nested-source-path` passes, or a context build reads a file. | `openProfileBundle`, the `path_free` scan, the patch-context emitter, the pure builder wired for preview (Amendment L2). |
| P5. Descriptor and verifier | `PV-06` verifies, or `PV-13` publishes without acknowledgment. | The publish step, `verifyWorkspacePublication` with its result shape, the seventeen publication vectors, the entity pack and its index, DRF-1 to DRF-5. |
| P6. Manifest, digest, package | `contract.json` does not recompute, the packed tarball lacks a listed file, or a consumer cannot resolve a fixture through `exports`. | The manifest builder, the two `exports` entries below, the entry `contracts/ontology-studio-data-port` in `files` (`package.json:12–67,72–78`). |
| P7. Host conformance | A DTO served by the local host fails its schema, a scenario of §12 gives another code, or the NER scan finds a member. | The emitter conformance run and the ten refusal scenarios over the local host. It gates the host lot of the split (Split:709). |

The two `exports` entries of lot P6, verbatim:

~~~json
{
  "./contracts/ontology-studio-data-port": "./contracts/ontology-studio-data-port/v1/contract.json",
  "./contracts/ontology-studio-data-port/*": "./contracts/ontology-studio-data-port/v1/*"
}
~~~

Without the pattern entry a Node consumer cannot resolve a fixture next to the manifest through `exports`, even when `files` ships it.

**Order across the two specifications.** [JUDGMENT] Amendment L1, then P1 to P3, then Amendment L2 to L7, then P4, then Amendment L8, then P5, then Amendment L9, then P6 and P7. Conductors may re-sequence inside that order. Two gates may not move. `contract.json` at revision 1 cannot be built before Amendment L9 and P6, because it lists every vector with its digest. The triple of DIG-6 therefore exists only after P6. What GO-1 can record before any lot is the commit of the two texts (DIG-4). The Amendment §17 states the consequence for the split's `OS-1` and `OS-4a`.

**Inputs for re-pricing.** Work that revision r6 of the split did not count for Engram: the schema bundle and fixture runner (P1), the path corrections (P3), `openProfileBundle` and the patch-context emitter (P4), the verifier and the entity pack (P5), the manifest and subpath (P6). Round 1 of the Muse review added the typed schemas of every shipped shape and sixty-one fixtures (P1), the publication vectors and the verifier result (P5), and the refusal scenarios (P7). This document gives no figure in agent-hours.

## 14. Open decisions

| Question and owner | Options | Recommendation [JUDGMENT] |
|---|---|---|
| Where does `profile.namespace` come from? Engram. No compiled artifact carries a namespace (`src/types.ts:1276–1303`). | (A) A publisher option, recorded in the descriptor; absent for a corpus-local profile. (B) A new project-configuration key. (C) No namespace in v1. | A. It needs no format amendment, and a local profile stays expressible. |
| Does a DTO carry `track_controlled`? Engram and s-conductor. The memory contract defines the flag for graph transactions (MemContract:104). No ontology node, scene field or patch context carries it at the pin (`src/ontology-patch.ts:40–60`; `src/studio-scene.ts:257–299`). The split still gates a refusal on it (Split:437,709). | (A) No member and no refusal in v1, until a producer exists. (B) Reserve an optional member now. | A. A member without a producer is a shape frozen ahead of its decision, as NER would be. |
| Who advertises that comments are available? s-conductor. | (A) The host envelope. (B) The Engram capabilities. | A. The port serves no comment. |
| Entity views in a publication: one packed file with an index, or one object per entity? Engram and s-conductor. | (A) The pack and index of §8.2. (B) One object per entity. | A. B multiplies uploads by the number of entities. |
| Should the port gate a patch by schema? Engram. | (A) No: PAT-1. (B) Yes, with a request error. | A. A user gets issue codes instead of a transport error. |
| Does the entity view list relations? Engram and the Design System. | (A) Yes, optional, in the shipped relation shape (§7.4). (B) No: the client derives them from the scene. | A. A windowed first paint does not hold every edge of an entity. |
| Where do the contract files live in the package? Engram. | (A) `contracts/` at the root, one subpath. (B) Under `spec/`. (C) Under `tests/fixtures/`. | A. They are published data, read by two other repositories. |
| Are window, group counts and the search index part of a v1 publication? Engram and s-conductor. The Amendment MAT-0 reserves them, because no rule builds them over a projected graph. The split serves a hosted first paint from them (Split:428–429,711–712). | (A) Reserved: a v1 publication carries none, and the hosted Studio paints from the shipped fallback. (B) The Amendment defines their construction now, and Engram prices the lot. | A, with an explicit ruling. It changes two gates of the split (§15). |
| Is a revert offered in the Studio in Wave 1? s-conductor and the Design System. The engine has the verb (Amendment §10). The split prices nine verbs (Split:378,710). | (A) A revert action in the audit panel, priced in the split. (B) Undo from the CLI only in Wave 1, recorded at GO-1. | A. The Studio accepts and rejects matches from its first release. An accepted merge with no undo beside it leaves the user without the reversal that the Amendment §10 exists to give. |

**Recommendations of review round 2.** Round 2 of the Muse review (`REVIEW-studio-specs-wonder-r2.md`, §6) recommends an outcome for three open decisions. They are recorded here as the reviewer's recommendations. None is a decision: each waits for an owner ruling, which GO-1 records.

| Open decision | Reviewer's recommendation | Grounds the review gives |
|---|---|---|
| Are window, group counts and the search index part of a v1 publication? (Amendment MAT-0, row above.) | Option A: reserve them. GO-1 records the ruling and states its consequence in words: server retrieval goes dark for a model after its first effective decision. The split's `OS-3` can then design the disabled state in Wave 1. | No construction over a projected graph exists for any of the three artifacts, so option B would freeze a promise to write three. The fallbacks ship today and already serve every corpus without a store. A base window or a base index served after a decision would contradict the projection that every other view shows. The review adds that under option B the Amendment is not freezable. |
| Is a revert offered in the Studio in Wave 1? (Row above.) | Option A, with one pricing correction: a revert action on the audit panel, priced in the split's `OS-3`, and not a tenth editor in `OS-5`. Row 6 of the split edits of §15 would then read: nine editor verbs (`OS-3`, `OS-5`) and one audit-panel revert action (`OS-3`). A confirm-and-apply action is enough for Wave 1, and batch undo (Amendment REV-8) can wait. | Wave 1 ships accept and reject, and the projection makes an accepted merge visible at once (Amendment CMP-1), so its undo ships beside it. The engine, the DTOs and the host already carry what the action needs: the tenth verb (Amendment §10), the disposition on each decision-log item (§7.7), the fenced `applyPatch` (PIN-4a), and the `reactivates` and `has_dependents` answers (Amendment §13). Undo from the CLI only saves one Design System control, since the CLI path exists either way. |
| The split's `OS-1` gate and its `OS-4a` scope overlap on Amendment L1 to L8 (§13; Amendment §17). | Move the gate, not the lots. Amendment L1 to L8 stay in `OS-4a`, with P4 and P5. `OS-1` exits on what GO-1 can record: the commits of the two texts, the frozen envelope and port surface, and the P1 to P3 fixtures as they land. The pinned triple and the green vectors become an exit gate of `OS-4a`, which gates `OS-6` as today. The split edits that follow are the `OS-1` gate column, the `OS-4a` gate and the GO-1 sentence (Split:921): the commits at GO-1, the digest at the exit of `OS-4a`. | The split's own scope sentence places the implementation in `OS-4a` (Split:709). No lot waits for the triple before `OS-6`. A manifest pinned in two stages would allow a conformance claim against no lifecycle vector. The programme total is unchanged. |

## 15. Coverage of the review findings

| Finding | Where it is settled |
|---|---|
| B1 item 1, Engram owns every DTO schema | §7, §10, §12 |
| B1 item 2, `@sentropic/contracts` limited to the envelope | §3 |
| B1 item 3, a contract of record in Engram's `spec/` | This document |
| B1 item 4, Engram decides versioning | §11 |
| M1, pin on Engram's identity, opaque token | §5 |
| M2, open vocabularies, statuses per profile | §6. VOC-4 narrows the review's wording: the profile list bounds what a decision may set, not what a read may carry. |
| M3 item 2, previous pin and compatibility verdict | DRF-4 |
| M3 item 3, no pin or promote route | §8.6 |
| M4 items 1, 2, 4, 5 | §8.3, §8.4, §8.5 |
| M4 item 3, registry records | Corrected in §8.3 |
| M5, no NER shape | §9 |
| M6, the fixture adapter replays Engram files | §10, §12 |
| M8 item 3, no production dependency | §12 |
| m5, m9, names minted by Engram | §7.11 |
| m7, empty graph hash | §5.2, §8.5 |
| m10, `taxonomyOrder` | `type_order`, §7.2 |
| m12, projected artifacts and the signed manifest | §7.2 note, PUB-4. One half stays `unverified`. |

Findings M7, M8 items 1, 2 and 4, M9, m1 to m4, m8 and m11 concern the split itself and were settled in its revision r7 (Split:1036–1060).

The findings of the Muse review of v0.1.0 are closed one by one in the changelog below.

**Required split r8 edits.** [JUDGMENT] §7.11 maps names. The edits below change statements, gates or prices of the split, and r7 is wrong or silent on each. GO-1 waits for them, or for an owner ruling on items 2, 5 and 6.

| # | In the split | Edit |
|---|---|---|
| 1 | Registry records "travel inside `ProfileBundleV1`" and are published only under `registriesMode: "full"` (Split:393,588), with the `OS-6` scope and gate that follow (Split:711). | The bundle holds a count and a digest in `full` mode and no record in either mode (§8.3). No file of a publication holds a registry record. |
| 2 | `trackControlled` as a DTO member, an editor lock and a refusal (Split:378,381,437,530,649,709,710), and `commentsEnabled` in the Engram capabilities (Split:543). | Neither exists in an Engram DTO in v1 (§14). Remove them, or rule a producer. |
| 3 | The port sketch (Split:487–571) and the event members (Split:637). | The ten rows that §7.11 adds in this revision. |
| 4 | "vocabularies are never closed unions" (Split:586). | The open vocabularies are those of the table of §6. Engram closes the eight structural sets of §6. |
| 5 | Hosted window and groups served from the publication (Split:428–429), "precomputed window and groups artifacts" and a search index in the publication (Split:588), the `OS-6` emitters and gate (Split:711), and the `OS-7` gate "windowed first paint from the precomputed publication artifact" (Split:712). | Not in a v1 publication (Amendment MAT-0). The hosted Studio paints from the shipped fallback, unless the owner rules option B of §14. |
| 6 | The editors cover nine verbs (Split:378,710). | Ten verbs exist. Price a revert action, or record undo from the CLI only (§14). |
| 7 | The `OS-1` row (Split:706): "all 9 patch ops", the contract digest pinned in `@sentropic/contracts`, and "amendment vectors/transcripts green in Engram CI". | Ten verbs. The two texts under their final `spec/` paths. The triple exists only after lot P6, and the vectors are green only once the engine lots have landed (§13; Amendment §17). |

## Summary

- Engram owns the schema of every DTO of the Studio data port. `@sentropic/contracts` keeps the mesh envelope and one pinned triple.
- The version pin is Engram's profile identity for three hash regimes, with one named base hash and the log digest. Its token is opaque to every other party.
- Open vocabularies are strings, with known sets advertised and locked by fixtures. Eight structural sets are closed. Statuses are valid per profile.
- Every shipped shape is typed from the shipped interface, nested members included.
- A publication carries the sealed profile bundle and a path-free projected state. It never carries a local state file, an absolute path or a registry record. One verifier with one result shape refuses it otherwise.
- A v1 publication carries no window, no group count and no search index. That choice needs a ruling, because it changes the split's hosted first paint.
- No DTO has an NER member in v1.
- One hundred and eighteen fixtures, six temporal vectors and seventeen publication vectors carry their expected result in their name. One digest over one manifest is what Sentropic pins. Counts are as drafted in this revision. Completeness against every refusal is what the Muse review tracks, and it closes only when the files land in lots P1 to P6.
- New findings since the first review: provenance and three path members expose absolute paths at the pin, the candidates response has no member for the queue disclosures, the bundle never holds registry records, a read may carry a status outside the profile list, `track_controlled` has no source in the ontology artifacts, and three shipped values travel under the name `graph_hash`.

## Changelog

### v0.2.1 · 23 November 2026 · round 2 of the Muse review, freeze path

Round 2 of the Muse review (`REVIEW-studio-specs-wonder-r2.md`, in the directory of Review2) holds both texts not freezable for four edits only. Its §7 lists them, and its §1.1, §1.2 and §5.3 give each text word for word. The four are applied verbatim, and no other rule changes. Two touch this contract: (3) the capabilities-scoping note, placed first in the notes of §7.2 (R2-N1, its §5.3); (4) the `server_retrieval` substitution in the notes of §7.3, whose two mirrors are in the Amendment (MAT-0 and the Expected cell of LV-VIEW-10). Two are in the Amendment only: (1) VIEW-6a and VIEW-6b replaced, MAT-2 completed, LV-VIEW-11 added (B1 remnant, its §1.1); (2) the cancellation-override paragraph and LV-REV-13 (B6 remnant, its §1.2). No fixture and no count changes in this contract. §14 records the reviewer's recommendations on three open decisions, as recommendations.

### v0.2.0 · 23 November 2026 · fold of round 1 of the Muse review

Review2 returned CHANGES REQUIRED on v0.1.0. Its header counts 8 blockers, 14 majors and 14 minors. Its body holds twenty majors, C-M1 to C-M10 and A-M1 to A-M10. All twenty are folded. This table closes the findings that touch this contract. The Amendment's changelog closes the others.

| Finding | Status | Where |
|---|---|---|
| B1 (joint) | Folded | §7.3 notes, §8.2, REC-5. Amendment VIEW-6 to VIEW-6c, MAT-0. |
| B2 | Folded, deviation 1 | §7.2 to §7.8: `string_list`, typed `compatibility`, `window`, `workspace_manifest`, both hierarchies, `projection`, `recon_queue`. Also typed: `answer_pack`, `citation`, candidate and queue disclosures, `rebuild_status`. Fixtures in §10. |
| B3 (joint) | Folded | PIN-4a, PAT-2, PAT-2a, fixture `event_patch_applied.revert`. Amendment WRT-5, LV-WRT-11. |
| B4 | Folded, deviation 2 | §8.7, PUB-3 to PUB-5, §8.2, §1, `upload_plan` and `verifier_finding` in §7.8. |
| B5 (joint) | Folded | §5.2, lot P2. Amendment §5. |
| C-M1 | Folded | §3. |
| C-M2 | Folded, deviation 3 | §5.1, §5.2, §6, `version_pin` in §7.2, three fixtures. |
| C-M3 | Folded | §7.1a. |
| C-M4 | Folded | §6: eight closed sets, disposition classes. `enum` in §7.6 and §7.7. |
| C-M5 | Folded | §10: 118 fixtures, named temporal files, 17 publication vectors. §12: ten refusal scenarios. |
| C-M6 | Folded, deviation 4 | §7.11, §15. |
| C-M7 | Folded, deviation 5 | REC-4, REC-5, LOGV-2 to LOGV-5, `queue.decision_log_digest`. |
| C-M8 | Folded, deviation 6 | §7.4: `citation`, `occurrences`, ENT-1 to ENT-3. |
| C-M9 | Folded | §11: major row, `contract_manifest`, DIG-1, DIG-2, DIG-7. Lot P6. Ten verbs in §6. |
| C-M10 | Folded, deviation 7 | BND-3, BND-4, `path_free`. |
| A-M7 (joint) | Folded, order corrected | §13. The Amendment's changelog gives the reason. |
| A-M9 (joint) | Folded | CTX-4 to CTX-6. |
| A-M10, contract part | Folded | `type_order` note in §7.2, CTX-1. |
| C-m1 | Applied in part, deviation 8 | BND-3. |
| C-m2 | Applied | §2. |
| C-m3 | Applied, deviation 9 | §7.2 note. |
| C-m4 | Applied | BND-2. |
| C-m5 | Applied, deviation 10 | NER-2. |
| C-m6 | Applied | REC-3. The range ends at `:2247`: line 2248 is `candidates`. |
| C-m7 | Applied | §6. |
| A-m7, contract part | Applied | Summary. |

**Deviations.** Each keeps or changes a text against the review's wording, and says on what ground.

1. B2 (f). `projection.inputs.presentation_hash` is typed `sha256`, not `hex64`. `inputs` repeats what the engine folded, in the form the profile stores, and the profile stores `presentation_hash` with its prefix (`src/ontology-profile.ts:630–640,688–689`; `src/ontology-guardian/digests.ts:17–20`). The pin alone converts to bare hex.
2. B4 (e). A plan that names `Content-Length` is refused by the schema of the plan, not answered with `invalid_request`. An upload plan is what a host returns, and a port error is what a host answers: the party that reads the plan is the publisher. No Engram line bears on this point.
3. C-M2. The sentence "the patch stamp is the only place the prefixed form travels" is not adopted. Shipped shapes that this contract carries verbatim hold the stored form too: the queue writes `context.profile.profile_hash` (`src/ontology-reconciliation.ts:2234`), and so does the rebuild status (`src/ontology-reconciliation-api.ts:166`). §5.1 says that the pin alone uses the bare form.
4. C-M6. The split was read again and is still r7. Six line numbers of the review are off by one or two: `query` is at Split:557, `snapshotId` at 506, `trackControlled` at 530, `commentsEnabled` at 543, `etag` at 559, `applyPatch` at 567–571. The `OS-5` row is Split:710 and the `OS-6` row Split:711. §15 also lists two edits that the review did not name: Split:586, and the hosted window, groups and search rows that MAT-0 touches.
5. C-M7. The published queue is not "filtered at publish (decided items removed)". Decided items stay, marked with their `decision` (REC-5). REC-2 has to list them under `include_decided`, the replacement text of B1 itself puts the filtering in the host library, and the shipped query runs on a whole queue (`src/ontology-reconciliation-api.ts:81–90`).
6. C-M8. `getReconciliationCandidate` returns a decided item with its `decision` instead of answering `candidate_not_found` (ENT-3). The method takes no `include_decided` argument (Split:561), and the shipped lookup reads the whole queue (`src/ontology-reconciliation-api.ts:92–102`).
7. C-M10. The scan of member names at any depth is adopted. The scan of string values under `extensions` is not. `extensions` holds the authored keys that the loader does not consume, copied as written (`src/profile-bundle.ts:541–545`), and a verified bundle derives it again from `documentProjection` and compares (`:777–790`). The runtime injects two values only, `sourcePath` (`src/ontology-profile.ts:665`) and `bound_source_path` (`:720–723`), and both are caught by name. A value scan would refuse an authored string that merely starts with `/` or `~`.
8. C-m1. `:632` is kept. At the pin, line 632 of `src/profile-bundle.ts` reads `(p.sourcePath !== undefined && typeof p.sourcePath !== "string") ||`, and line 633 reads `!isPlainObj(p.node_types) ||`. `:722` is kept as the cite of the internal check: line 722 reads `function resolveComparableSide(input: ProfileComparableInput): {`, and `isValidNormalizedProfile` ends at line 720. The range `1447–1448` is applied.
9. C-m3. The cite is the write itself, `scripts/build-studio-multimodel.mjs:178–193`, not the header comment at `:1–33`.
10. C-m5. The token rule is adopted with one exemption that the review did not see. `quoteSpan` is a shipped citation member (`src/types.ts:594`) and would fail the scan once citations are typed (C-M8).

**Added without a finding asking for it.** Round 2 should read these as new text.

- §7.10 row 6, with `omitted.citations` and `omitted.refs`. Typing `source_file` as `not_absolute` (C-M8) needs a rule for an absolute value.
- SEM-3, SEM-4 and SEM-5, with their fixtures.
- Position members in the `scene` schema, and `visual_encoding` typed in `profile_summary`.
- `options.previousDescriptor` in the verifier, so that the warning of DRF-5 can be computed.
- The `legacy` family defined as "neither of the two others", so that the closed set is total (§5.1).
- Two open decisions in §14: the v1 scope of MAT-0, and the revert action in the Studio.

**Consequence the review did not list.** MAT-0 is folded as written. It removes the hosted windowed first paint that the split prices (Split:428–429,711–712). §14 and §15 put that before the owner.

**Limits of the fold session.** It had no shell. Three statements are taken from Review2 and were not read again: the diff of the drift commit, the single-model bundle builder (C-m3), and the absence of an Engram dependency on `@sentropic/contracts` in `src/` imports (C-M1; both manifests were read). Whether an extraction can record an absolute `source_file` stays `unverified` and goes to lot P3.

### v0.1.0 · 23 November 2026

First draft, reviewed in Review2.
