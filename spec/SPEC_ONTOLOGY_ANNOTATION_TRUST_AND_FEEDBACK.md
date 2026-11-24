# Annotation trust, validation and feedback

**Version 0.2.2 · Draft · 24 November 2026.** It folds design review round 2 into v0.2.1, which folded round 1 into v0.2.0. One closure table at the end covers both rounds. v0.2.0 folded the owner decisions D1 A and D2 B (§0) into v0.1.0 of 21 November 2026.

**Specification path** `spec/SPEC_ONTOLOGY_ANNOTATION_TRUST_AND_FEEDBACK.md`

**Profile** `engram:annotation-trust-feedback@0.2.2` is an engram ontology profile whose terms map onto PROV-O and W3C Web Annotation (§1). The planned declaration is `profiles/annotation-trust-feedback/v0.2.2/profile.yaml`, beside the module `src/annotation-trust/` (§6). Its publication pin is **unverified** until the step named in §7. [JUDGMENT]

**Sources.** Unprefixed paths are engram at `3ef97b2c28e8`, origin/main and the base of this worktree. `R/` is radar at `0003ac20c1ad`, its origin/main, read without writing. Both pins are still origin/main on 24 November 2026. The v0.1.0 radar pin `ac01c0effabc` is not an ancestor of that commit. Every radar path v0.1.0 cited is byte-identical between the two commits (`git diff --stat` is empty), so its radar lines still hold. `D/` is `.graphify/scratch/design/` in the primary engram checkout. `DOS` is the decision dossier source `D/annotation-trust/dossier-v2/build/content.mjs`. `FAB`, `CAR`, `INV` and `RIC` are `D/annotation-trust/deep-research/RESEARCH-SOTA-fable.md`, `D/annotation-trust/deep-research/RESEARCH-SOTA-carbon.md`, `D/annotation-trust/RESEARCH-existing-annotation-ontology.md` and `D/annotation-trust/INPUT-radar-i-cond.md`. `REV` and `REV2` are the round-1 and round-2 design reviews `D/annotation-trust/REVIEW-spec-v02-wonder.md` and `D/annotation-trust/REVIEW-spec-v021-wonder.md`. [JUDGMENT] marks proposals and covers every row or block under a marked heading or column.

**Roles.** Opus 5.5 (max) authors v0.2.0 to v0.2.2. GPT-6.2 Astra authored v0.1.0. Muse wonder reviewed v0.2.0 (CHANGES-REQUIRED, no blocker) and v0.2.1 (APPROVE-WITH-MINORS), and its verdict on v0.2.2 is **unverified**. Muse spark builds the lots.

## Answer for radar

Keep the AI's class and model beside the human's selected class. A confirmation from the browser, a thumbs-up or an MCP elicitation accepted by the authenticated analyst is human and selects the effective class. Each human act records its channel and whether the AI proposal was displayed. A confirmation given with the proposal displayed never scores the model. [JUDGMENT] `RIC:26–34`, `DOS:504–505`

| Consumer question | v0.2.2 answer [JUDGMENT] |
|---|---|
| What can I use? | **provisional** permits a labelled suggestion. **trusted** permits acting on an in-scope human decision. **withheld** supplies no effective value. A read still returns the authorized history. |
| What happened to this assertion? | **unreviewed**, **uncertain**, **awaiting-elicitation**, **human-asserted**, **confirmed**, **corrected** or **rejected** (§3). |
| Who authored it, and how? | An AI with its model through `pipeline` or `mcp`, or a human through `ui-select`, `ui-thumbs` or `mcp-elicitation`, labelled « mcp + élicitation ». Each human act stores its exposure: proposal shown, not shown, or unknown for imports. |
| What can a reviewer do? | **confirm**, **correct** with a replacement, **reject** with a closed reason, record **uncertain**, or ask a question with **needs-elicitation**. |
| What changes the effective class? | An AI advances a suggestion. A human act on any of the three human channels selects a value or vetoes it. Only an explicit human decision replaces a veto. |
| What scores a model? | Only the independent reference of §4: judgments made with no AI value displayed, which alone give rates. Corrections and rejections form the known-error set, counted for learning. Confirmations given with the proposal displayed never count. |
| How do we build it? | §6 gives the TypeScript and the radar table, and §7 the lots. |

## 0. Decisions

**Owner's words, 24 November 2026:** « D1 A — Ontologie engram sur les termes PROV-O et Web Annotation · D2 B — Garder la confirmation humaine, mais hors de la référence indépendante ». Options, context and acceptance criteria are at `DOS:407–463` (question `base`) and `DOS:494–535` (question `poids`).

| Decision | Selected option | Rejected alternatives | Folded into |
|---|---|---|---|
| D1, base of the ontology | A `profil-standards`, an engram ontology on PROV-O and Web Annotation terms. Acceptance: radar applies the model declared in engram, with no house model. `DOS:428–431`, `DOS:461` | B `unites-signees`, nanopublication-style signed units as the base. It needs a second RDF store or a translation rebuilt at every check, links by content digest instead of engram identifiers, and a key per author. C `modele-natif`, a minimal native engram model whose correspondences to the standards live outside its terms, in an alignment table that can drift. `DOS:361–364`, `DOS:443–450` | §1, §6 |
| D2, weight of a confirmation | B `confirmation-a-part`. The confirmation stays human and stays out of the independent reference. Acceptance: each confirmation keeps what was displayed, and the rule can change without loss. `DOS:517–520`, `DOS:533` | A `compte-pleinement` counts every human class alike and scores the model partly on its own proposals. C `controle-a-l-aveugle` counts confirmations after a recurring blind re-check of a sample. `DOS:511–514`, `DOS:521–524` | §2, §4, §5 |

**Still binding from 21 November.** A signal keeps the human class and the AI class with its model. A class validated through MCP with elicitation is human, with the source tag « mcp + élicitation » and the trace of the validation. Every class is historised, append-only. Radar applies the engram metamodel as is. `RIC:26–34`

**Made moot.** v0.1.0's `handoff` operation, its `awaiting-human` state, the verified-receipt gate for MCP humans and the owner choice on receipt issuers are removed. An accepted elicitation is the human act itself, with server-asserted assurance. Three deferred points of the dossier close with the decisions. RDF 1.2 triple terms appear only in exports. SHACL is not part of the core. Validation is computed from immutable acts and never stored. This draft also settles two more: the current-view rule (§3, human head over AI head) and the node cost (one stored record per act, activity inside it). The weight of a thumbs-up, which the dossier moved into question D2, is set in §4. [JUDGMENT] `DOS:1136–1148`, `DOS:1249–1254`

The dossier records its status as incomplete until the Codex review, the Astra research and the owner's reference index arrive. Meanwhile it lets only reversible preparation advance (`DOS:266–267`). Open point 7 tracks this.

## 1. Profile, standard terms and storage

Engram owns the profile, its vocabulary and standard mapping, the reducer, fixtures and migrations. Radar implements the contract in its UI, authentication, writer and scoped projections. The engram validator checks conformance, and the authorized human judges the class. [JUDGMENT] `spec/SPEC_ONTOLOGY_GUARDIAN_G0_CONTRACTS.md:53–64`, `spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md:28–34`

Register owner `engram`, id `annotation-trust-feedback`, version `0.2.2`, `profileShape=engram-profile`, `artifactKind=profile`, `lifecycle=draft` and an empty parent list. Publish the §3 predicates and codes as one G0 rule sheet beside the declaration. Record the profile `Pin`, `pinsDigest` and `resultDigest`. An unknown pin or digest withholds the value and keeps its source for inspection. Radar verifies the binding before applying the reducer. [JUDGMENT] `spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md:50–64`, `src/ontology-guardian/types.ts:5–18`, `spec/SPEC_ONTOLOGY_GUARDIAN_G0_CONTRACTS.md:188–196`, `spec/SPEC_ONTOLOGY_GUARDIAN_G0_CONTRACTS.md:918–923`

**Term mapping (D1 A).** Each engram term declares its standard IRIs. The prefixes are `oa:` `http://www.w3.org/ns/oa#`, `prov:` `http://www.w3.org/ns/prov#`, `dcterms:` `http://purl.org/dc/terms/`, `as:` `http://www.w3.org/ns/activitystreams#` and `rdf:` `http://www.w3.org/1999/02/22-rdf-syntax-ns#`. Web Annotation names its `creator`, `created` and `generator` with the `dcterms:` and `as:` IRIs. The `as:` binding above is the one in the Web Annotation context `anno.jsonld`, checked on 24 November 2026. ActivityStreams 2.0 also allows an `https` form, which is a different IRI, so bindings are copied from that context only. Web Annotation pairs `generator` with `generated` (`dcterms:issued`), the serialization time: an export may set it, while the record keeps `dcterms:created` for its commit time. Re-check every IRI against the W3C pages before publishing the export context. Lots 1 and 6 test against a checked-in copy of those bindings. [JUDGMENT] `http://www.w3.org/ns/anno.jsonld`, `FAB:20–21`, `FAB:188–205`, `CAR:165–171`

| Engram term | Standard IRI | Meaning |
|---|---|---|
| `Annotation` | `oa:Annotation`, `prov:Entity` | One immutable record per act: a class, a note, a verdict, `uncertain`, a question or a preserved source. A correction's record holds its verdict and its new value and exports them as two linked annotations. A preserved source exports as a `prov:Entity` only. |
| `motivation`, derived from the action | `oa:motivatedBy` with `oa:classifying`, `oa:commenting`, `oa:assessing` or `oa:questioning` | Class, note, verdict or `uncertain`, and `needs-elicitation`. Never stored. |
| `value` | `oa:hasBody`. A class or a note is an `oa:TextualBody` with `rdf:value`. | The class code of the pinned vocabulary or the note text. The pin stays an engram addition, and a `skos:Concept` form waits for open point 1. A verdict's body is its decision and reason, in engram codes. |
| `SubjectVersion` | `oa:SpecificResource`, `prov:Entity` | The exact version of the subject the actor saw. |
| `targets` | `oa:hasTarget` | From a class or note to its `SubjectVersion`. From a verdict, `uncertain` or question to the `judged` annotation. |
| `version_of` | `oa:hasSource` | From a `SubjectVersion` to its subject. |
| `Subject`, `SourceRow` | `prov:Entity` | The annotated object, and a legacy source row kept by `preserve-source`. |
| `Actor` | `prov:Agent`. `prov:Person` for `human`, `prov:SoftwareAgent` for `ai` and `adapter`. | Who acted. Agents are shared nodes and never copied per act. |
| `authored_by` | `dcterms:creator`, `prov:wasAttributedTo` | The agent responsible for the content. A confirmation is authored by the confirmer, and the judged value keeps its own author. |
| `recorded_by` | `as:generator` | The service that wrote the record: radar API, MCP server or importer. |
| `recordedAt` | `dcterms:created`, `prov:generatedAtTime` | The writer's commit time. |
| `Activity`, export only | `prov:Activity`, linked by `prov:wasGeneratedBy` | Built from `actor`, `channel`, `exposure` and `elicitation`, which the record stores. |
| `associated_with`, export only | `prov:wasAssociatedWith`, qualified by `prov:qualifiedAssociation` to a `prov:Association` with `prov:agent` and `prov:hadRole` | Roles decider, mediator (the assistant client) and recorder, exported as `prov:Role` instances (open point 1). |
| `PromptTemplate`, export only | `prov:Plan`, the object of `prov:hadPlan` on the pipeline run's `prov:Association` | The prompt template of a pipeline run. Its `promptDigest` is an engram property of the plan, never the object of `prov:hadPlan`. |
| `displayed` | `prov:used`, qualified by `prov:qualifiedUsage` to a `prov:Usage` with `prov:entity` and `prov:hadRole` `displayed` | The AI annotations on screen when the human acted (`exposure.shown`). |
| `derived_from` | `prov:wasDerivedFrom` | From a correction's new value to the judged value, and from a preserved source to its row. |
| `invalidated_by`, export only | `prov:wasInvalidatedBy` | A corrected or rejected value points to the deciding activity. The stored record never changes. |
| `slot`, `scopeRef`, `revision`, `contentDigest`, `promptDigest`, `channel`, `exposure`, `validation`, `trust`, `evaluationRole`, `Selection`, `EvaluationPair`, `selects`, `pairs` | none | Engram additions. Option A leaves confidence and validation to engram. `DOS:429` |

The profile carries this table as the top-level extension `standard_terms`. Its source of truth is the `standardTerms` constant of the engram module, which generates the YAML. Lot 1's test parses the rows of this table from the spec and compares them term by term. `OntologyNodeType` and `OntologyRelationType` have no external IRI slot. The pinned bundler keeps unknown top-level keys as extensions and compares them in compatibility checks. [JUDGMENT] `src/types.ts:859–907`, `src/profile-bundle.ts:541–544`, `src/profile-bundle.ts:1255–1260`

**Storage.** Storage stays engram's property graph. Each act is one immutable `Annotation` record with its activity fields, typed references and content digest. Radar persists exactly these records in the journal of §6, the only store of annotation acts. There is no RDF store, no quad or nanopublication store and no second copy. RDF and JSON-LD 1.1 are an export view computed from the records with the table above. An export is never read back as authority. Validation, selection, trust and evaluation pairs are computed on read and never stored. §5 (Cutover) makes each existing radar class table a frozen source imported once or a projection written only inside the append transaction, so none stays a second authority. [JUDGMENT] `DOS:421`, `FAB:63`, `FAB:184`, `CAR:209`

**Existing engram symbols.** `Confidence` and `confidence_score` stay extraction evidence. Neither a value nor a threshold grants human authority, and an absent score is unknown, never 1. `OntologyCitation`, `CitationConfidence` and evidence record IDs carry evidence. `Digest`, `Pin` and `digestOfPreimage` carry pins and content digests. A memory receipt can be referenced and resolved under its own contract, and no annotation act transitions it. Graph and diagram projections keep their own `OntologyStatus` and validation level. [JUDGMENT] `src/types.ts:14`, `src/types.ts:91`, `src/types.ts:109`, `src/types.ts:517–539`, `src/types.ts:573–637`, `src/ontology-guardian/canonical.ts:96–98`, `engram-memory/contracts/index.ts:385–391`, `engram-memory/contracts/index.ts:509–515`, `src/ontology-guardian/diagram-native-types.ts:31–33`

## 2. Acts, actors, exposure and evidence

**Identity.** One stream identifies `(scopeRef, subjectRef, slot)`. The host supplies stable, opaque references. A personal scope names its owner and workspace, a shared scope its workspace. Radar resolves a subject from city, node type and node id. The class slot stays fixed across authors, input versions and runs, and each note has its own slot. `(stream, revision)` names one immutable record. `subjectVersion` is the input snapshot the actor saw. [JUDGMENT] `R/packages/immo-mcp/src/signal-contract.ts:5–8`, `R/api/drizzle/0048_signal_mcp_write.sql:6–27`

**Authority.** The host authenticates the writer, resolves an opaque principal, checks live scope permissions and records the policy and authority receipt. It derives actor kind and channel from the authenticated route. It accepts an exposure only for AI revisions it served on that surface. A client cannot set a role, a status or an evaluation role. An AI can assert, mark its own uncertainty and ask a question. It cannot confirm, correct or reject. [JUDGMENT]

| Actor and channel | Required provenance [JUDGMENT] |
|---|---|
| `ai` via `pipeline` | Producer principal, configured model label, model version, run reference and SHA-256 of the prompt template bytes. `modelVersion` is the model identifier in the provider response, as radar's semantic extraction already reads it, and `null`, read as unknown, when the response has none. That the single-pass client exposes it is **unverified**, and lot 8c pins the rule. Effort, prompt identifier and input digest when supplied, as radar pipeline rows carry. `R/api/src/services/graph/class-annotations.ts:22–35`, `R/api/src/services/graph/refresh-single-pass.ts:10–19`, `R/api/src/services/graph/refresh-single-pass.ts:88–100`, `R/api/src/services/exploitation/semantic-extract.ts:226` |
| `ai` via `mcp` | Declared model and verified client, plus the session when known. An assistant has no prompt template, so `promptDigest` is absent and never inferred. Evaluation groups by the verified client and the model it declares, labelled client-declared since radar cannot verify it. `R/packages/immo-mcp/src/signal-contract.ts:9–20`, `R/api/drizzle/0048_signal_mcp_write.sql:14`, `R/api/drizzle/0048_signal_mcp_write.sql:22` |
| `human` via `ui-select` or `ui-thumbs` | Authenticated principal and a host receipt that binds the displayed subject version, the displayed AI revisions, the value and the deliberate action. `ui-thumbs` is the thumbs-up or thumbs-down widget. `ui-select` is any other UI choice. |
| `human` via `mcp-elicitation` | Principal resolved by the MCP server from the authenticated session, verified client, and the elicitation trace below. Label « mcp + élicitation ». `RIC:28` |
| `adapter` via `import` | Importer principal. As an actor it can only preserve a source. As the recorder it can also write a legacy human act whose trace is partial or whose exposure is `unknown` (§5). |

**Exposure (D2 B).** Every human act stores `exposure`. `shown` lists the stream revisions of the AI values on screen when the human acted. `not-shown` means the surface displayed no AI value of that slot and the actor can read none for that subject and slot in another scope. Otherwise the host records `shown` with the revisions it displayed, possibly none. `unknown` is reserved for imports. `confirm`, `correct` and `reject` require `shown`, including the judged revision. Together with the channel, the exposure is the elicitation mechanism of the act. [JUDGMENT] `DOS:533`, `FAB:217`, `FAB:334–338`

**Elicitation trace.** The MCP server binds each request to the session's user and client, and to the stream, subject version, expected revision and displayed values. Only `accept` with an affirmative answer creates a human act. The trace keeps the protocol revision, client, session, a single-use request reference, the request digest over the displayed message and the response digest. It also keeps the start and end times, the audit reference and `assurance=server-asserted`. Decline, cancel, timeout, an unsupported client or an answer for a changed revision creates no act, and a restricted audit log may keep it. Radar's form today shows the proposal, the current value and the version, and returns a boolean. [JUDGMENT] `FAB:86`, `FAB:315`, `R/packages/immo-mcp/src/signal-tools.ts:48–55`, `R/packages/immo-mcp/src/server-http.ts:265–272`

**Evidence.** Use `OntologyCitation` and evidence record IDs. Each supplied citation requires `source_file`. An authenticated first-person act can have an empty citation list, so the base projection sets `require_source_file=false`. Citation counts, quote strength and graph degree trigger no transition. [JUDGMENT] `src/types.ts:573–574`, `src/profile-validate.ts:93–98`, `spec/SPEC_CITATIONS.md:301–307`

**Time.** `observedAt` is the source time when known. `recordedAt` is the writer's UTC time in RFC 3339, and replay follows committed revisions. `createdAt` comes from the value-creating record, `lastReviewedAt` from the latest human verdict on that revision and `decidedAt` from the governing human decision. [JUDGMENT]

## 3. Closed transition table

Validation belongs to one immutable value record in a scope and is computed from the records that target it. Trust belongs to the stream's current selection. The **AI head** holds the latest admitted AI value. The **human head** holds a decision pointing to a value revision, or a veto pointing to the rejected revision. Both start empty. [JUDGMENT]

**Open** means `unreviewed`, `uncertain` or `awaiting-elicitation`. **Selected human** means a `human-asserted` or `confirmed` revision still selected by the human head. Every live write needs actor authority, the current stream revision and the matching live subject version. Judging also needs an eligible target, defined below. [JUDGMENT]

| Operation | Allowed prior state and actor | Validation result | Effect on selection [JUDGMENT] |
|---|---|---|---|
| `assert(value)` | New value, any stream state. AI. | `unreviewed`, or `uncertain` if the producer flagged it ambiguous. | Advance the AI head and keep the human value or veto. |
| `assert(value)` | New value, any stream state. Human. | `human-asserted`. | Select it. Replacing a human head names its decision revision. |
| `needs-elicitation(question)` | Open target. A human, or the AI that authored it. Nonblank question. | `awaiting-elicitation`. | Expose it for follow-up. It records no answer. |
| `uncertain` | Open target. A human, or the AI that authored it. | `uncertain`. | Record the inability to decide. |
| `confirm` | Open target, or the selected `human-asserted` value. A human approving the exact value shown, on any human channel. | `confirmed`. | Select it through the human head. The value keeps its author, and the record names the confirmer. |
| `correct(value)` | Open target or selected human. A human. A different valid value in the same slot. | `corrected` on the target, plus a new `human-asserted` value in the same record. | Link old to new atomically and select the new value. The AI class and model stay. |
| `reject(reason)` | Open target or selected human. A human. One closed reason from §6. | `rejected`. | Install a veto if the target is the selected human value, or the eligible AI head while the human head is absent or stale. Rejecting an alternative keeps the head. |
| `preserve-source(row)` | Adapter, any state. A durable, access-controlled row reference and digest. | None. | Keep both heads and expose the row to authorized readers. |

A write that replaces a human value or veto names its decision revision in `replacesHuman`. Every other write sets it to `null`. `corrected` and `rejected` are terminal for the judged revision. A repeated command resolves through its idempotency key, and a confirmed revision cannot be confirmed again. Failed scope checks, stale subjects or revisions, missing authority, unknown codes and unlisted transitions change nothing. For a class, equality compares vocabulary pin and code, and a correction keeps its target's pin. For a note, compare the stored text after documented input normalization. [JUDGMENT]

| Human head | AI head | Derived read [JUDGMENT] |
|---|---|---|
| Eligible selected value | Any | `trusted` with the human value, plus the latest visible AI value and model. A confirmation or correction also returns the judged value and its author. |
| Stale selected value | Any | `withheld` with no effective value. Show the prior decision and the current AI proposal. |
| Veto | Any | `withheld` with no effective value. Return the rejected revision, reason and decision trace. |
| Absent | Eligible `unreviewed` value without a same-version matching rejection | `provisional` with the AI value. |
| Absent | Other cases, including a same-version matching rejection | `withheld`. Return the proposal, its state and any matching rejection. |

Resolve the subject version and class vocabulary on each read, including as-of reads. An eligible value matches that subject version and slot, and a class also matches its vocabulary pin. A matching rejection is a human rejection of an equal value in the stream on the same subject version. `matchingRejections` also lists such rejections on earlier subject versions, as a warning that leaves `provisional` unchanged since the input changed. Only a human can select a repeated value. A veto persists across input versions until a human replaces it. [JUDGMENT]

**Example 1, elicited confirmation.** At revision 1, pipeline run A asserts `pertinent`. An assistant calls `confirm_classification` with `up`, the server displays revision 1, and the analyst accepts. Revision 2 is a human `confirm` of revision 1 through `mcp-elicitation`, with exposure `shown=[1]` and a complete trace. The read is `trusted` with `pertinent`, the AI head still names run A, and the evaluation pair is `anchored`. A decline appends nothing, and revision 1 stays `provisional`. [JUDGMENT]

**Example 2, veto.** At revision 3 the analyst rejects revision 1 for `wrong-subject`, naming decision 2, and the pair becomes `known-error`. A delayed AI write expecting revision 2 conflicts. A run based on revision 3 appends revision 4. The read stays `withheld` until a human explicitly replaces decision 3. [JUDGMENT]

**Worked correction.** One personal class stream keeps one subject version and vocabulary, and revision numbers are local. [JUDGMENT] `R/packages/immo-mcp/src/class-reasons.ts:17–19`

| Revision | Record | Read after it [JUDGMENT] |
|---|---|---|
| 1 | Run A asserts `pertinent` with its model version and prompt digest. | `ai.revision=1`, `provisional`. |
| 2 | Through `ui-select` with `shown=[1]`, the reviewer corrects revision 1 to `a_surveiller` with reason `S-PLANIFIE`. | `human.decision=2`, `judged=1`, `selected=2`, `trusted`. The pair for run A is `pertinent → a_surveiller`, `known-error`. |
| 3, 4 | Runs B and C each assert. | `ai.revision=4`, and the effective value is still revision 2. Runs B and C have no pair: no human saw them, and no blind judgment exists. |

## 4. Evaluation and the independent reference (D2 B)

A human confirmation given with the AI proposal displayed is kept, recorded as human with its channel and exposure, and can select the effective value. It never enters the independent reference used to score a model. That reference is the set of human judgments made with no AI value of the slot displayed, as the dossier defines it, and only it yields a rate. Corrections and rejections of a displayed proposal, including a different value chosen while it was shown, form the separate known-error set. Each counts in full as a known error and for learning, never as a rate. [JUDGMENT] `DOS:517–520`, `DOS:927–932`, `DOS:975`, `DOS:1490`

An **evaluation pair** joins one AI value revision to one human record in the same stream and subject version. The reducer derives `evaluationRole` from the human record's action, exposure and value and from the stream's record order, and clients never supply it. Each human record forms at most one pair per AI revision. Per stream and AI revision, reports keep the latest `blind` pair for rates and the latest other pair for known errors and the ceiling. Earlier pairs stay in history. [JUDGMENT]

| Human record | `evaluationRole` | Use [JUDGMENT] |
|---|---|---|
| `confirm` of an AI revision, through `ui-select`, `ui-thumbs` or `mcp-elicitation` | `anchored` | Out of the reference. Human, effective and historised. |
| `correct` or `reject` of an AI revision | `known-error` | In the known-error set for that run, with its confusion `ai → human` or `ai → rejected(reason)`. Counted in full for learning, never a rate. |
| A human value (an `assert` or a correction's new value) whose `shown` lists an AI revision it does not judge | `anchored` if the values are equal, `known-error` otherwise | As in the two rows above. |
| A **prior judgment**: a human value with exposure `not-shown` and no AI value earlier in its stream, at any subject version, paired with each later AI value of the same subject version | `blind` | In the independent reference. Equal values count as agreement, different values as disagreement. The only input to a rate. |
| Any other `not-shown` value, or a `shown` list that names no AI revision | none | No pair. An earlier AI value may have been seen without leaving a record. |
| Exposure `unknown` | `unscored` | Out of the reference, reported as a separate count. |

A judgment recorded after any AI value of its stream is not `blind` for any model, a later one included: viewing leaves no record, so only record order proves that no proposal was seen. Verdicts on human values, `uncertain` and `needs-elicitation` form no pair. [JUDGMENT]

**Reports** group pairs by model, model version (`unknown` when null) or client-declared model, labelled as declared, prompt digest and channel. The agreement rate is blind agreements over blind pairs, and it is absent when there are none. Known errors are counts and confusions. With `a` anchored confirmations and `k` known errors on displayed proposals, `a / (a + k)` may be shown as a ceiling only. In the dossier example, 100 displayed proposals with 81 confirmations and 19 corrections give no rate, 19 known errors and a ceiling of 81 %. [JUDGMENT] `DOS:914–932`

**Radar's thumbs-up ratio.** Today `exportClassFeedback` counts `up` and `down` per model, prompt and their pair. It computes `positiveRate = up / (up + down)` with `judged → human` confusions. The thumbs sit next to the displayed AI class, model and rationale. Under D2 B every `up` is `anchored` and every `down` is `known-error`. The export keeps both counts and the confusions. It renames `positiveRate` to `anchoredConfirmationShare` and removes it from every model-quality view. Model accuracy comes only from blind pairs. Radar has no blind surface today, so its only blind pairs will be prior judgments recorded live after the cutover, and it reports no rate until some exist. [JUDGMENT] `R/api/src/services/graph/class-feedback-reader.ts:21–49`, `R/ui/src/lib/signals/class-annotation-label.ts:5–11`, `D/annotation-trust/INPUT-radar-annotation-report.md:39–41`, `DOS:958–962`

**Blind sources.** v0.2.2 admits only the live prior judgment, for example a class set on a card before any run. A surface that hides existing AI values yields no `blind` pair until a profile revision defines how its protocol proves that the actor never saw them. [JUDGMENT]

## 5. Radar crosswalk at the pinned revision

### Class, reason and facet state

| Radar value | Profile value and interpretation [JUDGMENT] | Source |
|---|---|---|
| `pertinent`, `a_surveiller`, `ecarte` | Retain the codes. An archive or discard can be an affirmed class and does not imply rejection of the identification. | `R/packages/immo-mcp/src/class-reasons.ts:2–5`, `R/api/drizzle/0048_signal_mcp_write.sql:101–104` |
| `non_classe` | A deliberate human clear can assert it. An untouched signal has no assertion. The single-pass AI emits one of the other three classes plus an independent `ambiguous` flag. A historical automatic `non_classe` is preserved with its source. | `R/packages/immo-mcp/src/class-reasons.ts:6`, `R/api/src/services/graph/refresh-single-pass.ts:21–32`, `R/api/src/services/facets/classification-contracts.ts:10–15` |
| Reason verdicts `pertinent / a_surveiller / non_pertinent` | Keep code, pinned vocabulary and text. All 28 seeded codes map by identity: eight P codes to `pertinent`, eight S codes to `a_surveiller`, eleven N codes and `V2-PRECEDENT` to `ecarte`, whose DB verdict is `non_pertinent`. | `R/api/drizzle/0014_facets_signal.sql:2–38`, `R/packages/immo-mcp/src/class-reasons.ts:8–36` |
| Facets `selection / archive`, heads `active / inactive` | Active selection supplies its basket and active archive supplies `ecarte`. Deselect or restore releases that facet. `untouched` supplies no assertion. Hidden flags and archive fingerprints are view data with no feedback authority. | `R/api/src/services/facets/classification-contracts.ts:6–30`, `R/api/src/services/facets/scoped-reader.ts:99–104`, `R/ui/src/lib/signals/signal-classement.ts:148–185` |

### Writers, storage and reads

| Radar record or tool | Mapping under v0.2.2 [JUDGMENT] | Source |
|---|---|---|
| `signal_class_annotations` and history | Each AI run appends an AI assertion via `pipeline`, except an identical rerun (next row, lot 8c). Current `ambiguous=true` maps to initial `uncertain`. History omits the flag, and that absence is kept. Legacy rows carry a model label only and import with `modelVersion: null`. | `R/api/drizzle/0045_signal_class_annotations.sql:7–25`, `R/api/drizzle/0046_signal_class_ambiguity.sql:1`, `R/api/drizzle/0047_signal_class_feedback.sql:6–38` |
| AI writer `written / manual / noop` | `written` yields an AI assertion. The `manual` early return goes and the lock order stays (lot 8c): a run is recorded even after human history. `noop` stays: a run whose prompt digest, input digest, model and effort equal those of the stream's AI head appends nothing, so an identical rerun adds no pair (§4). `preserveExistingAi`, which the unclassified-signal repository passes, keeps its guard: it also appends nothing over an AI head holding a class other than `non_classe`. The return union becomes `written / noop`. The refresh projection ignores the result, and reannotation counts `noop` as unchanged, drops its `manual` branch and keeps skipping signals with manual facet history before classifying. | `R/api/src/services/graph/class-annotations.ts:37–78`, `R/api/src/services/graph/class-annotations.ts:44–55`, `R/api/src/services/graph/class-annotations.ts:56–61`, `R/api/src/services/graph/reannotate-repository.ts:27–30`, `R/api/src/services/graph/reannotate-repository.ts:159–160`, `R/api/src/services/graph/reannotate-signals.ts:117–142`, `R/api/src/services/graph/refresh-run.ts:343–345`, `RIC:32` |
| `facet_events.source=manual / ai` | Authenticated UI writes map to a human `assert` via `ui-select` in their scope. New writes carry their exposure. Historical rows get exposure `unknown`. | `R/api/drizzle/0045_signal_class_annotations.sql:1–5`, `R/api/src/services/facets/scoped-writer.ts:145–163` |
| `signal_class_feedback.verdict=up / down` | `up` is a `confirm` via `ui-thumbs` whose `shown` holds the judged history row, so `anchored`. `down` is a `correct` with its replacement and registry reason, so `known-error`. Keep the judged history ID, model, both classes, facet event and comment. | `R/api/drizzle/0047_signal_class_feedback.sql:40–57`, `R/api/src/services/graph/class-feedback-command.ts:16–30` |
| `classify_signal` | Without accepted elicitation, an AI assertion via `mcp`, except `non_classe`, which still needs acceptance. With it, that AI assertion plus a human `confirm` of it via `mcp-elicitation`, `anchored`. A workspace class write stays `ecarte` with moderation. | `R/packages/immo-mcp/src/signal-contract.ts:15–16`, `R/api/drizzle/0048_signal_mcp_write.sql:214–231` |
| `confirm_classification` | Accepted `up` is a human `confirm` of the displayed current value. Accepted `down` is a human `correct` to a different class other than `non_classe`, with code and reason. Unaccepted calls still fail. | `R/packages/immo-mcp/src/signal-contract.ts:17–18`, `R/packages/immo-mcp/src/signal-tools.ts:41–53` |
| `annotate_signal` | A note on its own slot, from an AI via `mcp` or a human in the browser. Accepted elicitation adds a human `confirm` of the note. Notes form no evaluation pair. | `R/packages/immo-mcp/src/signal-contract.ts:19–20`, `R/api/src/services/graph/signal-mcp.ts:96–101` |
| `signal_mcp_events`, `mcp / auto / pending_human=true` | A legacy accepted elicitation. Import the AI assertion. If a browser decision names the row in `linked_event_id`, that decision is the single human act (next row) and carries this row in `evidence.sourceRows`, since radar showed « à confirmer » until then. Otherwise import a human act via `mcp-elicitation` with `trace=partial` naming the row, exposure `shown` and the importer as recorder. Resolve the judged value from `previous_version`, or preserve the row only. The proposal was in the displayed message by construction. | `R/api/drizzle/0048_signal_mcp_write.sql:12–27`, `R/packages/immo-mcp/src/signal-tools.ts:50`, `R/docs/spec/SPEC_EVOL_MCP_SIGNAL_WRITE.md:21–22` |
| `manual / human` browser decision | A human `confirm` or `correct` of the linked proposal via `ui-thumbs` or `ui-select`, exposure `shown`. A decision that names an earlier decision follows the chained-decision rule below. A class other than `ecarte` chosen on a workspace proposal appends two acts in one transaction: a `correct` to `non_classe` in the workspace stream and an `assert` of the chosen class in the personal stream. The personal `assert` records `shown` with no revision of its own stream and links the workspace proposal through `evidence.sourceRows`, so it forms no pair (§4). Radar's original-actor rule for confirmation is host policy under `policyRef`, since §3 lets any authorized human confirm. | `R/api/src/services/graph/signal-mcp.ts:37–76`, `R/api/drizzle/0048_signal_mcp_write.sql:144` |
| `signal_mcp_audit`, reads | Restricted audit storage. Its input hash covers tool input, not the displayed message or the answer. `get_signal_classification` and `list_class_reasons` cause no transition. | `R/packages/immo-mcp/src/signal-tools.ts:11–18`, `R/packages/immo-mcp/src/signal-tools.ts:31–40` |

### Adapter gaps

1. **Elicitation is human.** Migration 0048 forces every `source='mcp'` row to `validation='auto'`, the tool descriptions promise automatic validation, and radar's MCP spec says acceptance never proves human intervention. The owner decisions reverse this. 0048 and its CHECK stay as written, since they describe the rows the cutover freezes, and from the cutover the journal is the only writer of MCP acts. `confirm()` returns a structured elicitation result instead of a boolean: action, protocol revision, request reference, request and response digests, start and end times. The writer records that full trace, since radar's audit lacks the elicitation status, and writes the human act in the tool call's transaction. Rewrite the descriptions and that spec. The form text "Accept the displayed change as a human decision" becomes accurate. [JUDGMENT] `R/api/drizzle/0048_signal_mcp_write.sql:23–24`, `R/packages/immo-mcp/src/server-http.ts:265–272`, `R/packages/immo-mcp/src/signal-contract.ts:26–27`, `R/docs/spec/SPEC_EVOL_MCP_SIGNAL_WRITE.md:20–24`, `D/annotation-trust/INPUT-radar-annotation-report.md:177`
2. **Exposure capture.** The UI echoes the AI revisions it displayed with each class change and thumbs, and the API checks them against what it served. The MCP server takes them from the message it built. A live human write without its exposure is refused. [JUDGMENT]
3. **Two classes and isolation.** Global AI writes check manual facet history across workspaces, a public read can mask an AI row as manual, and a newer AI can eclipse an automatic MCP proposal. Keep the global AI observation by immutable reference and expose scoped copies only where authorized. Never export one user's human class to another. A confirmed workspace archive controls personal visibility until an authorized restoration. [JUDGMENT] `R/api/src/services/graph/class-annotations.ts:46–61`, `R/api/src/services/graph/class-annotations.ts:95–104`, `R/api/drizzle/0048_signal_mcp_write.sql:80–100`, `R/docs/spec/SPEC_EVOL_MCP_SIGNAL_WRITE.md:31–36`
4. **Feedback coverage.** Standalone reasoned rejection, explicit uncertainty and a recorded question need adapter operations, because `down` always needs a replacement today. An open question or an unanswered request never produces a rejection. [JUDGMENT] `R/packages/immo-mcp/src/signal-contract.ts:12–29`, `R/api/src/services/graph/class-feedback-command.ts:20–29`

**Count a browser decision once.** Index `signal_class_feedback.id` as the decision source. Its `annotation_id` names the judged AI history row and its `event_id` the resulting facet row, for `up` and `down`. Collect facet rows whose `class_feedback_id` points back, keep these IDs in `evidence.sourceRows` and emit one human act. An equal class or timestamp alone links nothing. Retries reuse the feedback ID. [JUDGMENT] `R/api/drizzle/0047_signal_class_feedback.sql:40–61`, `R/api/src/services/graph/class-feedback.ts:64–101`, `R/api/src/services/graph/class-feedback.ts:103–120`

**Chained browser decisions.** A browser decision can target an earlier decision instead of the MCP proposal, and its `linked_event_id` then names that decision's row, as in radar's own chain pending → `confirm` → `non_classe`. On import, a named row stands for the act that carries it, its own or the one it collapsed into, so a chain resolves transitively. The successive decision judges the value revision that act selected and names that act in `replacesHuman`: a different value lands as a `correct` of the selected value. A decision on an equal value, such as a second confirmation, appends nothing and joins that act's `evidence.sourceRows`, since a confirmed revision cannot be confirmed again (§3). [JUDGMENT] `R/api/src/services/graph/signal-mcp.ts:48–50`, `R/api/src/services/graph/signal-mcp.ts:69–74`, `R/api/src/services/graph/signal-mcp-db.test.ts:132–146`

### Cutover

Radar lots 8a to 13 ship behind one cutover switch, off by default. Until it flips, radar runs unchanged: legacy writers and MCP tool descriptions, the read priority of `signal_mcp_read` and the « MCP · model · à confirmer » badge. Lot 14 flips it once, in one deployment: a freeze migration, the lot 11 import, reads moved to the lot 12 projection and writers moved to the journal. There is no dual-write window. Afterwards an accepted elicitation reads `trusted` with « mcp + élicitation », and « à confirmer » no longer exists. [JUDGMENT] `R/api/drizzle/0048_signal_mcp_write.sql:95–120`, `R/docs/spec/SPEC_EVOL_MCP_SIGNAL_WRITE.md:22`

| Radar table | Fate at cutover [JUDGMENT] | Source |
|---|---|---|
| `signal_mcp_events`, `signal_class_feedback` | Frozen by a refusing `BEFORE INSERT` trigger, like the existing `reject_class_feedback_mutation()` triggers. Imported once and kept read-only as the source rows that acts reference. | `R/api/drizzle/0047_signal_class_feedback.sql:71–83`, `R/api/drizzle/0048_signal_mcp_write.sql:42–47` |
| `signal_class_annotation_history` | Its copy trigger `signal_class_annotation_record` is dropped, then the table is frozen and imported likewise. | `R/api/drizzle/0047_signal_class_feedback.sql:26–38` |
| `signal_class_annotations` | Projection of the global AI head, written only inside the pipeline append transaction. | `R/api/src/services/graph/class-annotations.ts:62–71` |
| `facet_events` | Class-bearing rows become a projection written inside their act's append transaction. View-only rows are unchanged. | `R/api/src/services/facets/scoped-writer.ts:145–163` |
| `signal_mcp_audit` | Kept as restricted audit of tool calls, outside the act journal. | `R/api/drizzle/0048_signal_mcp_write.sql:30–34` |

## 6. Implementation

### Engram owns the TypeScript profile

Lots 1 to 7 create `src/annotation-trust/` with `profile.ts`, `types.ts`, `parse.ts`, `reduce.ts`, `evaluate.ts` and `export.ts`. The block below writes its imports relative to the engram root. Serialize `template` into the planned profile YAML, with `standard_terms` generated from `standardTerms` (§1). Its states, attributes and endpoints use the `engram.metamodel/v1` grammar, and `profile` is derived from it for the pinned base loader. At this base, `validateOntologyProfile` checks state names, the default status and transition endpoints. `validateProfileExtraction` checks `previous_status` pairs, and the bundler recognises v1 and keeps `lineage` and `standard_terms` as extensions. The base loader cannot certify authority, exposure, head precedence or evaluation roles; the §3 and §4 rules do. A direct human assertion, or the replacement in a correction, reaches `human-asserted` in its own append. `Selection` and `EvaluationPair` are derived on read and never stored or exported as annotations. [JUDGMENT] `spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md:55–57`, `src/ontology-profile.ts:328–392`, `src/ontology-profile.ts:472–480`, `src/ontology-profile.ts:693`, `src/profile-validate.ts:133–140`, `src/profile-validate.ts:408`, `src/profile-bundle.ts:314`

A parser checks closed objects, exact pins, nonempty identifiers and UTC times. G0 digests are 64 lowercase hexadecimal digits, and the v1 template digest is `sha256:` followed by 64. Revisions fit a positive PostgreSQL integer, and the first append expects revision zero. A request UUID is branded only in its lowercase canonical form. `contentDigest` is `digestOfPreimage` of the committed record without that field. A pipeline act must carry the `modelVersion` key, and its `null` reads as unknown. A live write refuses exposure `unknown` and `trace=partial`, which only the import path accepts. An imported human act uses its source row as `receiptRef`, and as `requestRef` when the trace is partial. [JUDGMENT] `src/ontology-guardian/types.ts:5–18`, `src/ontology-guardian/canonical.ts:96–98`

```ts
import type { Confidence, GraphEdge, OntologyCitation, OntologyEvidenceRecord, OntologyProfile } from "./src/types.js";
import type { Digest, Pin } from "./src/ontology-guardian/types.js";

const open = ["unreviewed", "uncertain", "awaiting-elicitation"] as const;
const decidable = [...open, "human-asserted", "confirmed"] as const;
const validation = {
  states: [...decidable, "corrected", "rejected"], initial_state: "unreviewed",
  terminal_states: ["corrected", "rejected"],
  transitions: [
    { from: ["unreviewed"], to: ["human-asserted"], requires: ["new-human-value"], authority: "own-act-human" },
    { from: open, to: ["awaiting-elicitation"], requires: ["needs-elicitation"] },
    { from: open, to: ["uncertain"], requires: ["uncertain-or-ambiguous-assert"] },
    { from: [...open, "human-asserted"], to: ["confirmed"], requires: ["confirm"], authority: "own-act-human" },
    { from: decidable, to: ["corrected"], requires: ["correct"], authority: "own-act-human" },
    { from: decidable, to: ["rejected"], requires: ["reject"], authority: "own-act-human" }
  ]
} as const;
const channel = { kind: "enum", required: true,
  values: ["pipeline", "mcp", "ui-select", "ui-thumbs", "mcp-elicitation", "import"] } as const;
const exposure = { kind: "enum", required: false, values: ["shown", "not-shown", "unknown"] } as const;
const trust = { kind: "enum", required: true, values: ["provisional", "trusted", "withheld"] } as const;
const role = { kind: "enum", required: true, values: ["blind", "known-error", "anchored", "unscored"] } as const;
const template = {
  metamodel_version: "engram.metamodel/v1" as const, lineage: "engram" as const,
  id: "annotation-trust-feedback", version: "0.2.2",
  node_types: {
    Subject: {}, SubjectVersion: {}, Actor: {}, SourceRow: {},
    Annotation: { attributes: { channel, exposure }, state_machines: { validation } },
    Selection: { attributes: { trust } }, EvaluationPair: { attributes: { role } }
  },
  relation_types: {
    targets: { source_types: ["Annotation"], target_types: ["SubjectVersion", "Annotation"] },
    version_of: { source_types: ["SubjectVersion"], target_types: ["Subject"] },
    authored_by: { source_types: ["Annotation"], target_types: ["Actor"] },
    recorded_by: { source_types: ["Annotation"], target_types: ["Actor"] },
    displayed: { source_types: ["Annotation"], target_types: ["Annotation"] },
    derived_from: { source_types: ["Annotation"], target_types: ["Annotation", "SourceRow"] },
    selects: { source_types: ["Selection"], target_types: ["Annotation"] },
    pairs: { source_types: ["EvaluationPair"], target_types: ["Annotation"] }
  },
  standard_terms: {} as Record<string, readonly string[]> // generated from standardTerms (§1)
};
const profile = {
  id: template.id, version: template.version, relation_types: template.relation_types,
  node_types: Object.fromEntries(Object.keys(template.node_types).map(name => [name, {}] as const)),
  hardening: { statuses: [...validation.states], default_status: validation.initial_state,
    status_transitions: validation.transitions.map(({ from, to, requires }) =>
      ({ from: [...from], to: [...to], requires: [...requires] })) },
  citation_policy: { minimum_granularity: "file", require_source_file: false }
} satisfies OntologyProfile;

type StreamRef = { scopeRef: string; subjectRef: string; slot: string };
type Trust = (typeof trust.values)[number];
type Validation = (typeof validation.states)[number];
type Channel = (typeof channel.values)[number];
type EvaluationRole = (typeof role.values)[number];
type RejectReason = "wrong-subject" | "contradicted" | "insufficient-evidence"
  | "obsolete" | "duplicate" | "out-of-scope";
type Value = { kind: "class"; vocabulary: Pin; code: string } | { kind: "note"; text: string };
type SourceLink = { sourceRef: string; sourceDigest: Digest };

type AI = { kind: "ai"; actorRef: string; model: string } & (
  | { channel: "pipeline"; modelVersion: string | null; promptDigest: Digest; runRef: string;
      effort?: string; promptId?: string; inputDigest?: Digest }
  | { channel: "mcp"; clientRef: string; sessionRef?: string });
type Elicitation = { clientRef: string; requestRef: string; assurance: "server-asserted" } & (
  | { trace: "complete"; protocolRevision: string; sessionRef: string; requestDigest: Digest;
      responseDigest: Digest; startedAt: string; endedAt: string; auditRef: string }
  | { trace: "partial"; legacyRow: SourceLink });
type Human = { kind: "human"; actorRef: string; receiptRef: string } & (
  | { channel: Extract<Channel, `ui-${string}`> }
  | { channel: "mcp-elicitation"; elicitation: Elicitation });
type Adapter = { kind: "adapter"; actorRef: string; channel: "import" };
type Shown = { proposal: "shown"; shown: number[] };
type Exposure = Shown | { proposal: "not-shown" } | { proposal: "unknown" };

type Assertion = { kind: "assert"; value: Value };
type Decide = { kind: "confirm"; judged: number }
  | { kind: "correct"; judged: number; value: Value }
  | { kind: "reject"; judged: number; reason: RejectReason };
type Inquire = { kind: "uncertain"; judged: number }
  | { kind: "needs-elicitation"; judged: number; question: string };
type PreservedSource = SourceLink & { batchRef?: string; reportedSource?: string;
  reportedClass?: string; reportedNote?: string; reportedModel?: string; pendingHuman?: boolean };
type Evidence = { citations: OntologyCitation[]; evidenceRefs: OntologyEvidenceRecord["id"][];
  sourceRows?: SourceLink[];
  extraction?: { confidence?: Confidence; confidence_score?: GraphEdge["confidence_score"] } };

type RequestId = string & { readonly __requestUuid: unique symbol };
type TemplateRef = { lineage: typeof template.lineage; templateId: string; templateVersion: string;
  templateDigestSha256: `sha256:${string}` };
type Entry = {
  stream: StreamRef; template: TemplateRef; profile: Pin; pinsDigest: Digest; resultDigest: Digest;
  revision: number; expectedRevision: number; replacesHuman: number | null;
  requestId: RequestId; commandDigest: Digest; contentDigest: Digest; recorderRef: string;
  policyRef: string; authorityReceiptRef: string; recordedAt: string; observedAt?: string;
  source?: SourceLink; evidence: Evidence; classReasonCode?: string; rationale?: string;
} & (
  | { subjectVersion: string; actor: AI; action: (Assertion & { ambiguous?: boolean }) | Inquire }
  | { subjectVersion: string; actor: Human; exposure: Shown; action: Decide }
  | { subjectVersion: string; actor: Human; exposure: Exposure; action: Assertion | Inquire }
  | { subjectVersion: string | null; actor: Adapter; action: { kind: "preserve-source"; row: PreservedSource } }
);

type ValueAt = { revision: number; subjectVersion: string; value: Value; validation: Validation;
  author: AI | Human; contentDigest: Digest; createdAt: string; lastReviewedAt: string | null };
type HumanHead = { decision: number; by: Human; exposure: Exposure; decidedAt: string } & (
  | { kind: "value"; action: "assert"; selected: ValueAt; judged: null }
  | { kind: "value"; action: "confirm" | "correct"; selected: ValueAt; judged: ValueAt }
  | { kind: "veto"; action: "reject"; judged: ValueAt; reason: RejectReason });
type EvaluationPair = { ai: ValueAt & { author: AI }; human: number; channel: Channel;
  humanValue: Value | { rejected: RejectReason }; role: EvaluationRole };
type ReadModel = { stream: StreamRef; revision: number; subjectVersion: string;
  ai: (ValueAt & { author: AI }) | null; human: HumanHead | null;
  matchingRejections: { decision: number; judged: number; subjectVersion: string; reason: RejectReason }[];
  unverifiedSources: { revision: number; row: PreservedSource }[]; pairs: EvaluationPair[] } & (
  | { trust: "withheld"; effective: null }
  | { trust: Exclude<Trust, "withheld">; effective: ValueAt });
```

On a read, load the decision at `human.decision` and materialize `judged` from its `action.judged` in the same stream. A correction selects the value created in its own record, and a confirmation selects the judged revision. `ValueAt` keeps value and author from creation and projects validation as of the read. Pairs follow §4. [JUDGMENT]

A rejection code describes the defect in the judged claim: `wrong-subject` for mistaken identity, `contradicted` for contrary evidence, `insufficient-evidence` for a claim the reviewer declines to accept, `obsolete` for an outdated basis, `duplicate` for a repeated claim and `out-of-scope` for an inapplicable claim. `uncertain` leaves judgment open. Comments and domain class reasons cannot replace a missing code. [JUDGMENT]

### Radar owns the journal and writer

Each row holds one normalized record. Generated columns enforce stream identity, ordering, idempotency, same-stream references, the actor and channel combinations and the exposure of verdicts. The writer authorizes the canonical tuple, assigns the next revision and recording time, then computes `contentDigest`. [JUDGMENT]

```sql
CREATE TABLE annotation_event (
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  stream_key jsonb GENERATED ALWAYS AS (payload->'stream') STORED NOT NULL,
  rev integer GENERATED ALWAYS AS ((payload->>'revision')::integer) STORED NOT NULL,
  prev integer GENERATED ALWAYS AS (nullif((payload->>'expectedRevision')::integer, 0)) STORED,
  judged integer GENERATED ALWAYS AS ((payload#>>'{action,judged}')::integer) STORED,
  replaces_human integer GENERATED ALWAYS AS ((payload->>'replacesHuman')::integer) STORED,
  actor_kind text GENERATED ALWAYS AS (payload#>>'{actor,kind}') STORED NOT NULL,
  actor_ref text GENERATED ALWAYS AS (payload#>>'{actor,actorRef}') STORED NOT NULL,
  channel text GENERATED ALWAYS AS (payload#>>'{actor,channel}') STORED NOT NULL,
  action_kind text GENERATED ALWAYS AS (payload#>>'{action,kind}') STORED NOT NULL,
  proposal text GENERATED ALWAYS AS (payload#>>'{exposure,proposal}') STORED,
  request_id uuid GENERATED ALWAYS AS ((payload->>'requestId')::uuid) STORED NOT NULL,
  command_digest text GENERATED ALWAYS AS (payload->>'commandDigest') STORED NOT NULL,
  content_digest text GENERATED ALWAYS AS (payload->>'contentDigest') STORED NOT NULL,
  client_ref text GENERATED ALWAYS AS (payload#>>'{actor,elicitation,clientRef}') STORED,
  request_ref text GENERATED ALWAYS AS (payload#>>'{actor,elicitation,requestRef}') STORED,
  PRIMARY KEY (stream_key, rev),
  UNIQUE (stream_key, actor_ref, request_id),
  UNIQUE (client_ref, request_ref),
  FOREIGN KEY (stream_key, prev) REFERENCES annotation_event (stream_key, rev),
  FOREIGN KEY (stream_key, judged) REFERENCES annotation_event (stream_key, rev),
  FOREIGN KEY (stream_key, replaces_human) REFERENCES annotation_event (stream_key, rev),
  CHECK (jsonb_typeof(stream_key) = 'object' AND stream_key ?& ARRAY['scopeRef','subjectRef','slot']),
  CHECK ((payload->>'requestId') = request_id::text),
  CHECK (CASE actor_kind
    WHEN 'ai' THEN channel IN ('pipeline','mcp') AND proposal IS NULL
      AND action_kind IN ('assert','uncertain','needs-elicitation')
    WHEN 'human' THEN channel IN ('ui-select','ui-thumbs','mcp-elicitation')
      AND proposal IN ('shown','not-shown','unknown') AND action_kind <> 'preserve-source'
    WHEN 'adapter' THEN channel = 'import' AND proposal IS NULL AND action_kind = 'preserve-source'
    ELSE false END),
  CHECK (action_kind NOT IN ('confirm','correct','reject')
    OR (proposal = 'shown' AND payload#>'{exposure,shown}' @> to_jsonb(judged))),
  CHECK ((channel = 'mcp-elicitation') = (client_ref IS NOT NULL AND request_ref IS NOT NULL)),
  CHECK (rev > 0 AND coalesce((payload->>'expectedRevision')::integer, -1) = rev - 1),
  CHECK (command_digest ~ '^[0-9a-f]{64}$' AND content_digest ~ '^[0-9a-f]{64}$'),
  CHECK (judged IS NULL OR judged < rev),
  CHECK (replaces_human IS NULL OR replaces_human < rev)
);
```

**Write transaction.** Only the controlled append path writes, and application roles get no direct insert, update, delete or truncate. Serialize on the stream key, including its first record. Recheck authorization and resolve the subject version, workspace moderation and protected heads under the writers' locks. Bind a scoped copy of a global AI value to its immutable source revision. Apply a shared archive release and the resulting personal choice atomically. For an elicitation, write the AI assertion if any, the human act and the consumed request reference in the tool call's transaction. [JUDGMENT] `R/api/src/services/graph/class-feedback.ts:19–62`, `R/api/src/services/graph/signal-mcp.ts:37–56`, `R/docs/spec/SPEC_EVOL_MCP_SIGNAL_WRITE.md:28–36`

**Idempotency.** After checking access, look up `(stream, actorRef, requestId)`. Hash the canonical request identity, actor and channel, stream, subject version, pins, expected revision, supersession, exposure, action, source and evidence. For an elicitation, include client and request reference. Exclude receipts, the server-assigned revision, the recording time and both digests. An exact retry returns its committed record, and a changed input under the same key conflicts. Two first writes expecting revision zero yield one revision 1. A refused write has no side effect. [JUDGMENT] `src/ontology-guardian/canonical.ts:59–61`, `R/api/src/services/graph/class-feedback.ts:29–48`

**Legacy import.** When the actor, display or subject version cannot be resolved, append `preserve-source` with a stable import request UUID and snapshot digest. Legacy accepted elicitations and UI rows follow §5. A reviewer can adopt a historical value in a new act. [JUDGMENT] `R/api/drizzle/0048_signal_mcp_write.sql:12–33`

## 7. Test-first lots

Each lot starts with its failing test and implements only what that test proves. Budgets cover tests, fixtures and code, with a ceiling of 150 changed lines per lot. Muse spark builds every lot. Engram lots need no radar change. Engram publishes the profile pin once lots 1 to 5 pass. Radar lots 8a and 8b may start on lot 2b's build, and later radar lots consume the published pin. Order: 1, 2a, 2b, 3, 4a, 4b, 5, with 6 and 7 after 2b; radar 8a and 8b after 2b; 8c, 9a, 9b and 10 to 13 after 8b and 5; 14 last, once open point 7 is re-read. [JUDGMENT]

| Lot · owner | First failing test | Deliverable · max lines [JUDGMENT] |
|---|---|---|
| 1 · engram | The derived base profile normalizes. An instance with swapped endpoints fails. A `standard_terms` entry that differs from the §1 table parsed from this spec, or uses an undeclared prefix, fails, and prefix bindings equal the checked-in `anno.jsonld` copy. A mismatched template or rule-sheet pin is refused. | Declaration, `standardTerms`, base projection, binding fixture · 140 |
| 2a · engram | Type tests: an AI actor cannot carry a `Decide` action, a human verdict needs `Shown`, a pipeline AI needs the `modelVersion` key and a prompt digest, and an `mcp-elicitation` human needs a trace. | Discriminated types · 110 |
| 2b · engram | Reject a pipeline AI without the `modelVersion` key or prompt digest, an AI verdict, and a human verdict whose exposure omits the judged revision. Reject an `mcp-elicitation` act without trace, a client-set role, and a live write with `unknown` exposure or a partial trace. `modelVersion: null` parses. | Closed parser · 140 |
| 3 · engram | Replay assert, question, `uncertain` and `confirm` through each human channel, including a confirmation by a human who did not run the proposing assistant session. Both authors survive, an elicited confirmation reads `trusted`, and a decline leaves `provisional`. | Reducer for open states and trust · 140 |
| 4a · engram | Correct an AI value, reject an alternative, then reject the effective value. Repeat a rejected class. Veto a fresh AI head over a stale human value. An alternative rejected on one subject version and re-asserted on the next reads `provisional` and returns the earlier rejection. | Protected selection and veto · 145 |
| 4b · engram | Refuse an assert over a veto whose `replacesHuman` is `null` or names a stale decision, and a `correct` of a confirmed value no longer selected. `corrected` and `rejected` stay terminal. | Supersession guards, terminal states · 110 |
| 5 · engram | 100 displayed proposals with 81 confirmations and 19 corrections give no rate, 19 known errors and a ceiling of 0.81. A prior judgment pairs `blind` with later runs and yields a rate. A `not-shown` assert recorded after an AI value of its stream, including one its actor confirmed on another surface, forms no pair. A later rejection replaces an earlier anchored pair for the same run. Runs B and C of §3 stay unpaired. | Evaluation pairs, roles and reports · 145 |
| 6 · engram | The worked correction exports to JSON-LD 1.1 using only §1 IRIs. The corrected value carries `prov:wasInvalidatedBy`, run A's association reaches a `prov:Plan` through `prov:hadPlan`, revision 2's activity has a `prov:qualifiedUsage` of revision 1 with role `displayed`, class bodies are `oa:TextualBody`, and no literal is the object of `prov:hadPlan`. The exporter does no I/O, and nothing reads an export back. | Pure export view and golden file · 145 |
| 7 · engram | A citation round-trip, a structurally preserved diagram and a referenced memory receipt leave trust and pairs unchanged. | Cross-contract fixtures, G0 corpus manifest · 120 |
| 8a · radar | The actor, channel and verdict-exposure CHECKs refuse bad rows, and a reference to a later or foreign-stream revision fails. | Journal table in the next free migration, 0049 at the pin · 100 |
| 8b · radar | Concurrent first writes, a stale review and changed-key reuse cannot all commit. An exact retry returns its revision. | Append transaction · 140 |
| 8c · radar | A run after human history appends its AI assertion and leaves the human value selected. An identical rerun, with the same prompt and input digests, model and effort, appends nothing and returns `noop`. `prompt_sha256` becomes `promptDigest`, the response's model identifier becomes `modelVersion`, and a response without one records `null`. | `writeClassAnnotation` on the journal: no `manual` return, `noop` dedupe, same lock order, projection row · 140 |
| 9a · radar | `confirm()` returns the structured result. Decline, cancel, timeout, an unsupported client and a stale answer yield no act. | Structured elicitation capture · 110 |
| 9b · radar | An accepted elicitation writes a human act with complete trace and « mcp + élicitation ». A reused request reference conflicts, and `non_classe` without acceptance is refused. With the switch on, no tool description promises automatic validation, and with it off the legacy text is served. | MCP writer on the journal, switch-gated tool descriptions · 145 |
| 10 · radar | A class change on a card showing an AI badge records `shown`. Thumbs-up is a `confirm`, `anchored`; thumbs-down is a `correct`, `known-error`. A card without AI records `not-shown` only if the actor can read no AI value of the slot in another scope. | UI exposure capture, feedback adapter, facet projection · 150 |
| 11 · radar | Four classes and 28 code pairs round-trip. Feedback and its facet count once. A legacy accepted elicitation imports with `trace=partial`, and one followed by a browser confirmation imports as one `confirm` with one `anchored` pair. Radar's chain pending → browser `confirm` → browser `non_classe` imports as one `confirm` and one `correct` of the same AI revision, the `correct` naming the `confirm` in `replacesHuman`. Legacy UI rows get `unknown`, and an untouched card has no author. | Legacy reader and import · 150 |
| 12 · radar | Two personal scopes see the same AI run and different human decisions. A workspace veto or archive survives personal changes. | Scoped dual-value projection and UI · 145 |
| 13 · radar | The export shows `anchoredConfirmationShare`, no accuracy without blind pairs, and confusions as known errors. A correction still compares to its judged model and prompt after two new runs. | Evaluation export · 110 |
| 14 · radar | After the freeze migration, inserts into the frozen tables fail and the history copy trigger is gone. With the switch on, reads come from the lot 12 projection and every writer appends to the journal. | Cutover: freeze migration and switch flip · 90 |

## 8. Open points

Only points the two decisions leave open are listed, each with the default this draft applies. [JUDGMENT]

1. **Export namespace.** The IRI base for engram-only terms and its governance are open (`DOS:1142`). Default: no public IRI, and exports stay unpublished.
2. **Bindings to the frozen Comments contract and to ACLP.** The dossier names drift from Comments as a failure scenario (`DOS:458`, `DOS:1144`). The inventory goes further: the §6 journal and writer duplicate shared Comments builders, resolver and storage, which radar's host instructions forbid copying (`INV:80`). Reuse was considered and deferred: D1 A puts the vocabulary and the reducer in engram, binding them to the Comments revision and review is a cross-owner change that needs its own review, and whether Comments can carry exposure and evaluation roles is **unverified**. Default: none in v0.2.2. Radar implements this profile directly once its conductor accepts that exception before lot 8a, or swaps lots 8a and 8b for an adapter onto the shared builders.
3. **Second reviewer.** Shared consequential decisions could require a distinct second person. Default: one reviewer plus radar's workspace moderation.
4. **Uncertain AI values.** They can appear in the review queue only, or also in ordinary results with a label. Default: review queue.
5. **Confidence and calibration.** The form of a score and its calibration record is open (`DOS:1140`). Default: a raw score is evidence only, and radar sends none.
6. **User-signed assurance.** Signatures for some classes are open (`DOS:1141`). Default: none. With option B rejected, server authentication remains the proof of who acted (`DOS:443–445`, `FAB:340`).
7. **Missing inputs.** The Codex review, the Astra research and the owner's reference index have not arrived (`DOS:266`, `DOS:1147`). Default: re-read §0 to §4 when they do. Lots 1 to 13 are reversible preparation and proceed; the cutover of lot 14, the least reversible step, waits for that re-read.

## Changes from v0.1.0

1. §0 records D1 A and D2 B with the owner's words and the rejected options B and C of each question.
2. §1 maps every engram term to PROV-O and Web Annotation IRIs, carried as the profile extension `standard_terms`. Storage stays the engram property graph, one immutable record per act, and RDF and JSON-LD are an export view only.
3. The origin `human-mcp-elicited` with a verified-receipt gate becomes the channel `mcp-elicitation` with server-asserted assurance and a full trace. `ui-thumbs` and `ui-select` replace `human-ui`. MCP AI proposals no longer need a prompt digest.
4. Every human act stores its exposure, and §4 defines the independent reference and the derived `evaluationRole`. Radar's thumbs-up ratio becomes `anchoredConfirmationShare`, outside model quality.
5. `handoff`, `awaiting-human`, `resolvesHandoff`, the handoff queue and the receipt-issuer choice are removed.
6. The radar table drops the handoff and issuer columns, gains channel, exposure and content digest checks, and keys elicitations by client and request reference.
7. Engram is re-pinned to `3ef97b2c28e8` and radar to `0003ac20c1ad`, and engram code lines are re-verified.
8. The lots grow from 11 to 19 (9 engram, 10 radar), and the open points keep only what the decisions leave open.

## Review closure (v0.2.0 → v0.2.2)

Every finding of `REV` (round 1, CHANGES-REQUIRED, no blocker) and of `REV2` (round 2, APPROVE-WITH-MINORS, no blocker or major) is answered below. D1 A and D2 B are unchanged. Lines refer to this version.

| Finding | Change (section, line) or answer |
|---|---|
| M1 strict `blind` underivable | §4 table and blind sources (:144, :151–155, :161), §2 exposure (:91), lot 5 (:410). `blind` now needs a prior judgment: `not-shown` with no earlier AI value in the stream, which record order proves. Any other `not-shown` value forms no pair. `not-shown` also excludes an AI value readable in another scope. This is stricter than the suggested same-actor rule because a view leaves no record. |
| M2 legacy double confirmation | §5 rows (:185–186), lot 11 (:419). A pending row named by a browser decision collapses into that decision and stays in `evidence.sourceRows`. Only a pending row without a successor imports via `mcp-elicitation`. Result: one `confirm`, one `anchored` pair. |
| M3 PROV-O qualified forms | §1 table (:64–66, :69), lot 6 (:411). `PromptTemplate` is a `prov:Plan` reached by `prov:hadPlan` on the `prov:Association`, with its digest kept as an engram property. `displayed` goes through `prov:qualifiedUsage` to a `prov:Usage` with `prov:entity` and `prov:hadRole`. Roles are `prov:Role` instances. |
| M4 pipeline writer unowned, no `modelVersion` source | New lot 8c (:415), §2 (:85), §5 (:178–179), §6 (:218, :283). `modelVersion` is the model identifier in the provider response, or `null` (unknown) when the response has none. Legacy rows import with `null` instead of `preserve-source`. |
| M5 cutover not executable | §5 adapter gap 1 and Cutover (:191, :200–210), lots 9a, 9b and 14 (:416–417, :422). 0048 and its CHECK stay untouched, and each table's fate is fixed. One switch flips once, with no dual-write window. The badge and read priority retire at the flip. `confirm()` returns a structured result. |
| m1 `as:` IRI | §1 (:48), lot 1 (:404). The binding matches `anno.jsonld` (http form), and the IRI is no longer **unverified**. Bindings are copied from that context only. One sentence on `generator` and `generated` is added. |
| m2 citation | §5 (:186): `0048:144` replaces `0048:264–269`. |
| m3 "independent reference" | §4 (:142, :149), answer table (:24). The reference holds blind judgments only. Corrections and rejections form the known-error set. |
| m4 who confirms, dual append | §5 (:186), lot 3 (:407). The original-actor rule is radar host policy under `policyRef`. The workspace dual append is named. |
| m5 declared model, `non_classe` | §2 (:86), §4 (:157), §5 (:182). The model is labelled client-declared. `non_classe` still needs acceptance (`0048:216–217`). |
| m6 lot sizes, module path, `standard_terms` | §7 (:400–422), §1 (:71), §6 (:216). Lots 2, 4, 8 and 9 are split into 2a/2b, 4a/4b, 8a/8b/8c and 9a/9b. The module is `src/annotation-trust/`. `standardTerms` is the source of truth, checked mechanically. |
| m7 rejected alternative on a new version | §3 (:126), TS (:335), lot 4a (:408). `matchingRejections` lists earlier versions as a warning, and only the current version blocks `provisional`. |
| m8 missing negative tests | Lot 4b (:409) covers an assert over a veto with a `null` or stale `replacesHuman`, and a `correct` of an unselected confirmed value. |
| m9 class body export | §1 `value` row (:54), lot 6 (:411). A class body is an `oa:TextualBody` with the code as `rdf:value`. The pin stays engram-only, and `skos:Concept` is deferred to open point 1. |
| m10 framing | §0 (:33), open points 2 and 7 (:429, :434). Option C now reads as in `DOS:447–449`. Comments reuse is stated as considered and deferred, with a radar conductor gate before lot 8a. Lot 14 waits for open point 7. |
| C7 publication pin step | §7 (:400). Engram publishes the pin once lots 1 to 5 pass. |
| n1 chained browser decisions, M2 class | §5 design note (:198), row (:186), lot 11 (:419). A row named in `linked_event_id` stands for the act that carries it, so a chain resolves transitively. A successive decision judges the value revision that act selected and names the act in `replacesHuman`. A decision on an equal value appends nothing and joins that act's `evidence.sourceRows`. Lot 11 imports radar's chain pending → `confirm` → `non_classe` as one `confirm` and one `correct`. |
| n2 imported blind source | §4 (:159, :161), recommended option. « or imported » is deleted: v0.2.2 admits only the live prior judgment, matching §5 and lot 11, and radar's first blind pairs come from live judgments after the cutover. |
| n3 pipeline `noop`, `preserveExistingAi` | §5 (:178–179), lot 8c (:415). A run repeating the AI head's prompt and input digests, model and effort appends nothing and returns `noop`. `preserveExistingAi` keeps its `non_classe`-only guard. The return union becomes `written / noop`, with each caller's handling stated. Lot 8c adds the identical rerun. |
| n4 exposure of the personal append | §5 (:186). The personal `assert` records `shown` with no revision of its own stream, links the workspace proposal through `evidence.sourceRows` and forms no pair. |
| n5 derived-read predicate | §3 read table (:123–124). Both rows name a same-version matching rejection. |
| n6 tool descriptions not switch-gated | §5 Cutover (:202), lot 9b (:417). Legacy tool descriptions are served until the flip, and lot 9b checks the new text with the switch on. |
| n7 stale lot count | Changes from v0.1.0, item 8 (:445): 19 lots, 9 engram and 10 radar. |
| n8 citation off by one | Not folded. At the radar pin, `semantic-extract.ts:225` is the provider line and `:226` is `model: response.modelId ?? provider.model`, so the §2 citation (:85) already holds. |
