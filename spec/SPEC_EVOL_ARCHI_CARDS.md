# Governed evolution: archi@1 architecture vocabulary and archi-cards@1 card presentation

| Field | Value |
|---|---|
| Status | Proposed specification, revision 2, 2026-11-07. Revises r1 (SHA-256 b3fb5efe…) against the Argon review AR; the « Round-2 ledger » maps each finding to its change. Nothing here is implemented, committed or published; no test or evidence generator was run for this revision. |
| Author role | Engram spec author (Claude Opus 5.5, maximum reasoning). Implementation is the lots of §7. |
| Decision input | Owner decision of 2026-11-06, four answers as recommended (BRIEF-spec-archi.md:6-10): (1) the kicker is the kind · form and the footer is « repo · package »; (2) Track is a system distinct from h2a in the same repo, « Alimentation » becomes the h2a zone; (3) the tint keeps each dossier's legend, « proposed » is shown by dashes plus « (cible) » in text; (4) a product's description is written in the repo that owns its code, ingested and validated by engram, the single source; Focus only renders. Binding hosts delta HD: every supported CLI host is modelled, regardless of local installation (HD:9-15, :28). |
| Language | English. Identifiers are language-neutral; face labels come from per-language tables (§3.10). |
| Stack rule | Node/TypeScript and native binaries already present (`git`). Zero Python (G0:80). |
| Tags | [FACT] = verified source, `file:line`; [JUDGMENT] = design choice or inference; `proposed` = new symbol, file, shape or code. A [FACT] on evidence states what a stored run printed; an expected result without a stored run stays [JUDGMENT] until its lot's test asserts it. |

## Authority and observed baseline

| Key | Source and pin |
|---|---|
| ENG | engram `origin/main` f7e9914c845d0e5b1ccbd703aac4463dae5fcc1b at reading (2026-11-07), read with `git show`. It descends from 50b60324, the r1 pin, by two commits; among the files cited here only `package.json` differs, and its cited lines (:69-71) are as cited. Checkout HEAD 8f19554c is not an authority. |
| DS, `ds:`, `dsc:` | sent-tech-design-system 7c5a8c82bf2abc71bf0963e3fcfc395c48fcf6af, the pin of §4; e3bc10cc is its ancestor. `ds:` = `packages/diagram-core/src/`, `dsc:` = `packages/diagram-canvas/`. The local `origin/main` is now bbf8b390d1704756cc43b433f31d0a43ea2a4792, a descendant with `packages/diagram-core/src` unchanged; it moves `dsc:src/layout/measure.ts:31` `TOGGLE_ALLOCATION` from 32 to 66 (AR m-4, known, §4). |
| H2A | h2a `origin/main` 65b65d6bff6f3c15d5e80277d8a70287d4b915dd: `packages/h2a/src/hosts/plugin.ts:85-152` declares `H2A_HOST_PLUGIN_TARGETS`, eight hosts, mechanisms at :89, :96, :103, :110, :117, :124, :131, :146. HD's pin db485795 is an ancestor; `packages/h2a/src/hosts/` is identical at both. |
| HD, HF, KR7 | Hosts delta h2a working note `joint-r3-hosts-delta.md`, SHA-256 c563ef384194484ed3ba48493e48cce7776dbafa21573fab53f9646be90797da (binding); its facts `/home/antoinefa/src/h2a/tmp/h-cond/memory-dossier/kit/architecture-r7c/host-facts.json`; its encoding in that kit (`joint-profile.mjs`, `joint-proto.mjs`, `joint-fixtures.mjs`), branched from the r1 prototype: no J1-J4 closure, no stored run. |
| DSM3 | DS `spec/SPEC_EVOL_GD_M3_DIAGRAM_MODEL.md` at DS. |
| G0, VS2 | ENG `spec/SPEC_ONTOLOGY_GUARDIAN_G0_CONTRACTS.md`, `spec/SPEC_ONTOLOGY_DIAGRAM_VIEW_SCHEMA_V2.md`. |
| PJ | Joint proposal r2, h2a working note `PROPOSAL-joint.fr.md`, SHA-256 53488a600dcd0da096095dd5350f52a68702d3d28c80ffd4df376fb1480b3c9d. J1–J5 closed (report `archi-card-semantics-joint-r2-last.md`, SHA-256 65613ced…). |
| EV, PIN | `joint-evidence/joint-validate.out` (82fd171c…) and `joint-pin.out` (183ca170…), cited by line. Run: DS 7c5a8c82, ENG guards 50b60324, Node 22.22.1, TypeScript 6.0.3 (PJ A.6). |
| PROF, PROTO, FIX, VAL | `joint-profile.mjs` (404f2d16…), `joint-proto.mjs` (bfa0fbd2…), `joint-fixtures.mjs` (ed17cb2c…), `joint-validate.mjs` (6b3e1bef…), same folder. |
| PE, RA, AR | `PROPOSAL-engram-r2.fr.md` (78b707a4…), `review-engram-astra.md` (4f40dc8f…), `review-spec-archi-argon.md` (d5deb365…), this folder. |
| KIT | #711 kit copy, private reference kit `governance-kit/` (hrpn HEAD faf21b6f). Metrics `src/governance-font-metrics.js`, SHA-256 5f868f9e72bc64c4cbd9494540a4cf82c0adb5071474acdde481f6d3c58a0414. |

Reading rule (as G0:34): if a statement here and its cited line disagree, the line governs and this document is defective.

## 1. Scope, ownership and non-goals

[FACT] Engram owns profile definitions, versions and contracts as data; the DS owns rendering and layout; Focus owns readability (G0:55-62). Table authorship is assigned to engram (DSM3:21). Engram imports no design-system library and takes injected ports (I-4, G0:77).

| Party | Owns here | Never does |
|---|---|---|
| Owning repo (h2a, engram…) | Authors its description: manifest, SemanticDocument, view specs (§5.2) | Writes faces, occurrences, digests or acceptance records |
| Engram | archi@1, archi-cards@1, closed input/output shapes, pure checks, projection and summaries, ingestion, canonical acceptance records, `ARCHI_DIAGNOSTIC_CODES` | Layout, geometry, rendering; importing the DS (the executor is an injected port) |
| DS | Native validation, fold projection, layout, measurement execution, rendering, executor bindings, packaged presentation catalog | Kind, slot, footer or label semantics |
| Focus | Stores one binding Pin, verifies, renders, folds | Writes or corrects a face, label, tint or summary; reuses another fold state's summaries; derives a kicker from the parent zone or a footer from the root zone; truncates, ellipsises or widens (PJ §8) |

Non-goals: no change to diagram-semantic-schema@1, diagram-view-schema@2 or diagram-presentation@1 (§2.5); no new DS feature; no publication, corpus receipt or catalog admission (records stay draft, as ENG `diagram-registry.ts:1-4`); no extraction of architecture from code (descriptions are authored and validated deterministically, I-5); no tint meaning derived by archi; no C4, Backstage or ArchiMate conformance claim (§2.8); no text serialization format, whose invariants alone are fixed here (§5.6); no browser render proof (§8 O2).

## 2. The archi@1 profile

### 2.1 Identity and common attributes

- [JUDGMENT] `archi@1` (`proposed`) is a native diagram-core Profile, `completeness: complete`, with an independent lineage like generic@2 (ENG `diagram-profiles.ts:71`): a child of generic@2 would inherit `node`, `link` and `association`, which S-2 forbids removing (G0:458), so the vocabulary would not be closed.
- [FACT] Every kind carries name (text ≤200, required), shortName (≤40), role (≤400, required except actor), lifecycle (enum current, proposed, retired; required), evidence (collection of text ≤200, 1..8, required) and category (key grammar 1..40, ENG `diagram-profiles.ts:21-30`) (PROF:12-13). Every relation carries lifecycle and evidence (required) and label (≤120) (PROF:14). `facts` and a system `form` do not exist (EV:116-117).
- [JUDGMENT] Step 0 of every classification: name the referent. One box designates one thing; one source may yield several entities (a `package.json` yields a package plus one runtime per bin); a bare name without evidence of its referent is not modelled (`unknown`) (PE §3.2, PJ §2).

### 2.2 Eleven kinds, closed forms, exclusive tests

| Kind (fr kicker) | Container | Forms, closed (required?) | Extra attribute | Exclusive test |
|---|---|---|---|---|
| actor (Acteur) | no | human, agent, team, org (optional) | — | decides or acts under an identity; the program running an agent is a runtime |
| system (Système) | yes | — | — | named product without its own manifest, carrying a responsibility |
| repo (Repo) | yes | — | url ≤200 | a Git repository: remote, PR, CI |
| package (Paquet) | yes | library, plugin, app (yes) | version ≤40 | installable distribution with a name + version manifest |
| component (Composant) | no | — | — | code inside a package, without entry point, run in another process |
| runtime (Exécution) | no | cli, mcp-server, daemon, job, hook (yes) | — | entry point executed in its own process; hook = command a host launches on an event |
| service (Service) | no | — | — | deployed, addressable, operated instance running without an open session |
| api (API) | no | mcp, http, cli (yes) | access: read-only, read-write (required) | contract: a named list of operations |
| store (Stockage) | no | jsonl, file, database, object-store, graph (yes) | writerPolicy: single-writer, multi-writer (required) | data a runtime writes while running |
| artifact (Artefact) | no | skill, manifest, schema, doc (yes) | — | authored file changed by commit, loaded or read by a host |
| host (Hôte) | yes | workstation, cluster, cloud-project (yes) | — | place of execution without its own entry point |

[FACT] These rows are PROF:17-30; the four containers are EV:6. [JUDGMENT] Exclusive pairs (PE §3.2, PJ §2): store or artifact — does a runtime write it while running; runtime or host — is there an executed entry point; package or runtime — a distribution and each of its bins are distinct, joined by `deployedAs`; system or package — product or distribution; service or store — the operated process and its data are two referents. A hook that only launches an existing runtime is an `invokes{trigger: hook}` arrow; a hook with its own script is a runtime with form hook.

### 2.3 Fifteen relations, one encoding each

[FACT] All relations are directed and binary, roles source and target 1..1, declared in that order (PROF:53, :65); the native matrix `archi-1` holds 55 tuples, `partOf` limited to 8 pairs (PROF:33-55, EV:2). The encoding E is a function of (type, source kind, mode) with exactly one value (PROTO:84-96):

| Relation | Source → target | Native tree | Own attributes | E and rendering |
|---|---|---|---|---|
| partOf | component, artifact → package; package, runtime, service, api, store, system → system | archi-composition | — | tree: nests in composition views |
| managedIn | system, package, component, runtime, service, api, store, artifact → repo | archi-source | — | tree: footer « repo: R »; nests in source views, a repo always root |
| runsOn | runtime, service → host | archi-deployment | — | tree: detail « sur: H »; nests in deployment views |
| ownedBy | every kind but actor → actor | archi-ownership | — | owner: footer « propriétaire: O » |
| operatedBy | service, host → actor, system | archi-operation | — | owner: footer « opéré par: X » |
| executedBy | component → runtime / package → runtime | — | — | detail « exécuté par: » / arrow « exécuté par » |
| loadedBy | artifact → runtime / package → runtime | — | — | detail « chargé par: » / arrow « chargé par » |
| providesApi | runtime, service → api | — | — | detail « fourni par: » of the API |
| uses | actor → runtime, service, system | — | — | detail « utilise: » of the actor |
| accesses | runtime, service, component → store | — | mode: read, append, write (required) | read: detail « lu par: »; append or write to a single-writer store: footer « écrit par: »; otherwise arrow « ajoute à » / « écrit » |
| invokes | runtime → runtime | — | trigger: hook, poll, mcp-stdio, command, schedule (required); event ≤80 | arrow « lance », or « sondage » when trigger = poll (HD:28) |
| consumesApi | runtime, service, actor → api | — | — | arrow « appelle » |
| deployedAs; dependsOn; documents | package → runtime, service; package → package; artifact → runtime, api, component, package | — | — | arrows « déployé comme », « dépend de », « documente » |

[JUDGMENT] Rules (PJ §3): a relation whose E is not `arrow` never has a relation occurrence (`archi-edge-policy`, EV:120); an arrow label is its verb, or the verb, « · » and an object (« lance · hooks de session »); the verb is a function of the relation instance: `invokes` reads « sondage » when its trigger is `poll`, else « lance », and the host mechanism stays in `event` (HD:28); a footer or kicker may *name* an entity reached through a relation (the delivering package through partOf or deployedAs, the root system through partOf): naming is text, the relation keeps its single encoding; there is no `sends` or `calls`, a question and its answer go through one `consumesApi`. Widening any closed list after publication is archi@2 (PJ §9.6, PJ:272).

### 2.4 Consistency rules

| # | Rule | Executor | Code |
|---|---|---|---|
| N | five trees with one parent per hierarchy; acyclic composition; component requires a package parent; matrix; required attributes; closed enums and types (PROF:69-75) | DS, native | `hierarchy-multiple-parents`, `legend-key-parent-invalid` (name inherited, PE §4.3), `relationship-matrix-violation`, `endpoint-target-not-allowed`, `attribute-required-missing`, `attribute-not-in-schema`, `enum-value-not-allowed`, `unknown-entity-type`, `unknown-relation-type` |
| A1 | a direct managedIn equals the effective repo of its partOf ancestor | checkArchi | `archi-source-conflict` |
| A2 | the footer is derivable (§3.4) | checkArchi | `archi-footer-missing` |
| A3 | a single-writer store has exactly one distinct writer | checkArchi | `archi-single-writer` |
| A4 | executedBy(x, r) needs deployedAs(p, r) from x's package p, or a package deployed as r whose dependsOn chain reaches p | checkArchi | `archi-execution-unbound` |
| A6 | an arrow label equals its verb or starts with the verb and « · », in the description language; the verb is the instance's (§2.3) | checkArchi | `archi-edge-verb` |
| V1 | one occurrence per archi entity and view | checkArchiView | `archi-occurrence-duplicate` |
| V2 | expected = occurrence of the nearest drawn ancestor in the active tree, or none; actual = `groups[group].occurrence`, or none without `group`; expected = actual, both « none » cases included: a root placed in a zone refuses (N25), a child left at root refuses (N14b) | checkArchiView | `archi-zone-mismatch` |
| V3 | only arrow-encoded relations have occurrences | checkArchiView | `archi-edge-policy` |
| V4 | strokeStyle dashed ⇔ relation lifecycle ≠ current (the DS checks only its value, ds:presentation-validate.ts:244-246) | checkArchiView | `archi-stroke-status` |
| V5 | every projected DS aggregate of the fold state has an active summary | checkArchiView | `archi-summary-missing` |

[FACT] Effective repo: repo(e) = target of managedIn(e), else repo(parent of e by partOf), else none (PROTO:64-73). The checks read only records whose `profile` is `archi@1`: with a generic@2 legend in the document, the r1 prototype threw, r2 returns `[]` (EV:152-153). The r2 prototype compares expected and actual parents in both cases (PROTO:318-321). `checkArchi(document, cards, language)` and `checkArchiView(document, view, binding)` are `proposed`, pure.

[JUDGMENT] Active trees, one parent per entity each: `archi-composition` (partOf); `archi-deployment` (runsOn); `archi-source`: e sits under its partOf parent while that parent has the same effective repo, else under the repo (PROTO:225-238); `archi-dossier-hosts` (HD:15; KR7 `joint-proto.mjs:150-159`): the composition parent, except that an entity with no partOf parent, of kind runtime and form cli, sits in its runsOn host when that host is drawn. partOf never means runsOn; source composition and deployment stay distinct; visual grouping is engram's rule, not DS containment (ds:view.ts:40).

### 2.5 Native shapes: containers first, no schema delta

[FACT] Containers are expressed natively:
- Declaration: `container: true` on the entity type (ds:profile.ts:38), for system, repo, package and host.
- Zone: the container's EntityOccurrence plus a VisualGroup bound by its `occurrence` field (ds:view.ts:110-119), id `grp.<len>.<localId>` (ds:fold.ts:172-176); each child occurrence names that group in `group`. "Visual grouping is NOT containment" (ds:view.ts:40), so V2 is engram's rule.
- Face: `form: "container"` with text {kicker, title?, subtitle, footer}; the DS accepts `card` only on a non-container type and `container` only on a container type (ds:presentation-validate.ts:203-214, :491-492), refusing otherwise with `occurrence-endpoint-mismatch`, check `form-selector-mismatch` (EV:118-119).
- Fold state: `VisualGroup.collapsed` (DSM3 §4.1); summaries: `ViewDocument.summaryLabels` with `relationOccurrences` (ENG `diagram-schemas.ts:237-249`).

Schema delta: **none**. Every field exists in diagram-semantic-schema@1, diagram-view-schema@2 and diagram-presentation@1 (ENG `diagram-schemas.ts:79-115`, `:173-249`); the four views and the tint witness pass `checkViewShapeV2`, `validateView` and `validateDiagramPresentation` with no diagnostic (EV:12-16, :40-44, :75-79, :91-95, :154-158). Excerpt, placeholder geometry elided (group EV:18, face EV:38):

```jsonc
"entityOccurrences": { "occurrence:o-sys-h2a": { "id": "occurrence:o-sys-h2a", "entity": "entity:sys-h2a", "geometry": { … } },
  "occurrence:o-rt-h2a": { "id": "occurrence:o-rt-h2a", "entity": "entity:rt-h2a", "geometry": { … }, "group": "grp.9.o-sys-h2a" } },
"groups": { "grp.9.o-sys-h2a": { "id": "grp.9.o-sys-h2a", "occurrence": "occurrence:o-sys-h2a", "collapsed": false } },
"presentation": { "camera": { "x": 0, "y": 0, "zoom": 1 }, "diagram": { "contractPin": { "id": "diagram-presentation", "version": "1", "contentDigest": "74dadb9c…" },
  "entities": { "occurrence:o-sys-h2a": { "form": "container", "icon": "window",
    "text": { "kicker": "Système", "subtitle": "Relie les agents des CLI", "footer": "repo: h2a" } } }, "legends": {}, "categoryTokens": [] } }
```

Profile and instance (`proposed` where new):
- [JUDGMENT] The declaration is the PROF recipe with `poll` added to `invokes.trigger` (KR7 `joint-profile.mjs:44`; HD:28), native Profile fields (ds:profile.ts:185), governed like generic@2 (ENG `diagram-profiles.ts:55-68`) and appended last to `GOVERNED_PROFILES` (`:338-342`) so existing enumerations keep their order. Draft G0 record, payload and envelope follow `baseRecord`, `profilePayload` and `envelopeOf` (`diagram-registry.ts:81-104`, `:209-278`; instances `:317-335`): pin {id "archi", version "1.0.0", contentDigest = P-CONTENT-DIAGRAM}, profileShape diagram-profile, artifactKind base, lifecycle draft, corpus = §6 fixtures. The draft digest 62b87d17… (EV:5) is evidence only; `poll` changes it, and lot 2 re-measures it.
- [FACT] Instances are native SemanticDocument records keyed by id, with typed values and endpoints {role, target} (ENG `diagram-schemas.ts:173-197`); `profileRefs` is `["archi@1"]`, or `["archi@1", "generic@2"]` with a legend (EV:147).

### 2.6 Supported CLI hosts (HD)

[FACT] h2a declares eight plugin targets with distinct mechanisms (H2A `plugin.ts:85-152`); HD models every supported host, installation staying `unverified` unless separately evidenced (HD:9-11). [JUDGMENT] Encoding, as KR7 `joint-fixtures.mjs:139-158` applied to FIX:
- One HÔTE · POSTE `host-poste`, name « Poste de travail », role « 8 CLI », in the default fold set of role views (HD:13).
- One EXÉCUTION · CLI per target, named by HF (Claude Code, Codex, Gemini CLI, Antigravity/agy, Hermes, OpenCode, Muse, Vibe), role « Ouvre la session de l’agent », evidence its `plugin.ts` line; `runsOn` host-poste, `ownedBy` its vendor.
- Vendors are org actors with HD's proofs: Anthropic, OpenAI, Google, NousResearch, Meta, Mistral (HD:30-39). Gemini CLI and OpenCode have no attributed vendor (HD:34, :37, :41): each gets its own actor named `unverified`, evidence the missing source, so the footer reads « propriétaire: unverified » and no vendor is invented.
- One `invokes` per host mechanism, host → CLI h2a: trigger `poll` for `agy-plugin-poll` and `muse-poll`, `hook` for the six push mechanisms (KR7:155); `event` = the mechanism id; label as HD:17-26: exactly « sondage » for agy, « sondage · cycle de vie Muse », « lance · hooks de session », « lance · app-server »…
- These edges replace FIX's `in-hooks`, `in-mcp-claude`, `in-mcp-codex` and the per-host `ob-*`, `ro-*` (FIX:51-52, :76-77, :93-95; KR7:147, :152); the plugin `loadedBy` edges `lb-plugin-claude`, `lb-plugin-codex` (FIX:86-87) are dropped as in KR7:147, and no plugin `loadedBy` is asserted for any host (HD:28). Skill `loadedBy` and API `consumesApi` relations stay (HD:28).

### 2.7 Owner decision and hosts applied (worked faces, EV:22-39, :83-90; overlay rows from §6.2 H1)

| Box | Kicker | Title | Body / subtitle | Detail | Footer |
|---|---|---|---|---|---|
| zone h2a (was « Alimentation ») | Système | h2a | Relie les agents des CLI | — | repo: h2a |
| zone Track (distinct system, same repo) | Système | Track | Contrôle chaque écriture | — | repo: h2a |
| zone @sentropic/track | Paquet · Lib | @sentropic/track | Code JS du suivi et bins track | — | repo: h2a |
| card CLI track | Exécution · CLI | CLI track | Valide puis écrit le suivi | sur: Poste de travail | repo: h2a · @sentropic/track |
| card events.jsonl | Stockage · JSONL | events.jsonl | Journal du suivi, ajout seul | lu par: CLI h2a · track-mcp | écrit par: CLI track |
| card engram live | Service | engram live (cible) | Tient le track record vivant | sur: Cluster (cible) | opéré par: cluster-mesh (cible) |
| card Claude Code | Exécution · CLI | Claude Code | Session de l'agent | sur: Poste de travail | propriétaire: Anthropic |
| overlay zone Poste de travail | Hôte · Poste | Poste de travail | 8 CLI | — | opéré par: rhanka |
| overlay card Gemini CLI | Exécution · CLI | Gemini CLI | Ouvre la session de l’agent | sur: Poste de travail | propriétaire: unverified |
| overlay card Antigravity/agy | Exécution · CLI | Antigravity/agy | Ouvre la session de l’agent | sur: Poste de travail | propriétaire: Google |

« Hooks des CLI » is the arrow `invokes{trigger: hook}` « lance · hooks de session » from Claude Code to CLI h2a (FIX:93); the only dashed arrow of Rôles is « appelle · propositions et questions » (EV:19). [JUDGMENT] In the overlay the eight CLI cards sit in the folded « Poste de travail » zone (`archi-dossier-hosts`); folded, the zone carries one summary « lance · sondage · 8 liaisons » toward CLI h2a (§3.8).

### 2.8 Crosswalk qualifications (J5, inlined)

[FACT] PE §3.1 qualifies each kind (PE:53-67), SERVICE requalified by J5 (PJ:53): D direct, C conditional, P lossy, ∅ absent, U `unverified`. [JUDGMENT] These are local projections, never a conformance claim.

| Kind | C4 | Backstage | ArchiMate |
|---|---|---|---|
| actor | Person: C (human, team); U (agent) | User, Group: D; agent: ∅ | business-actor: U |
| system | Software system: C | System: D | grouping: U |
| repo | ∅ | ∅ (source location is an annotation) | ∅ |
| package | ∅ | Component, type library: C | artifact: U |
| component | Component: P (inside one container, projected through executedBy) | Component + subcomponentOf: C | application-component: U |
| runtime | Container (application): C | Component, free type: C | application-component, system-software: U |
| service | container instance in a deployment node, deployment view: C | Component type service describes the software, not the instance: reached through the delivering package (deployedAs), losing runsOn, operatedBy, address and instance status: C, P | application-service: U |
| api | ∅, carried by relations: U | API: D | application-interface: U |
| store | Container (data store): C | Resource: C | data-object: U |
| artifact | ∅ | ∅ | artifact: U |
| host | Deployment node: C | Resource: P | node: U |

## 3. The archi-cards@1 presentation contract

### 3.1 Identity, carriage and content digest

[JUDGMENT] `archi-cards@1` (`proposed`) is a G0 contract artifact shaped like diagram-presentation@1 (ENG `diagram-registry.ts:159-188`; DSM3:145): profileShape mechanism-descriptor, artifactKind contract, binding {artifactKind: contract, schemaPin: archi-cards-schema@1 (`proposed`), compatibilityMatrixVersion "1"}, pin {id "archi-cards", version "1"}. It is never in `profileRefs` and never inside a view, whose contract pin is closed to diagram-presentation/1 (ENG `diagram-schemas.ts:79-89`); the binding carries its `cardsPin` (§5.4). Its output is a diagram-presentation@1 value.

[JUDGMENT] Content digest (AR B-3). diagram-presentation@1 hashes its four-field descriptor (`diagram-registry.ts:159-166`) because its content is a schema; here the tables are the contract, so `contentDigest = digestOfPreimage(ARCHI_CARDS_CONTENT)` (ENG `canonical.ts:69-72`) over the closed object `{ descriptor, labels: { fr, en }, icons, detail, verbOrder, status, allocation, lineRule, metrics: { sha256, table } }` (`proposed`; §3.3-§3.10), descriptor = {id "archi-cards@1", artifactKind "contract", schemaPin, compatibilityMatrixVersion "1"}. Metric widths are non-integers in RFC 8785 number form (`canonical.ts:27-31`). The asset `contracts/archi-cards-1.json` holds exactly `canonicalBytes(ARCHI_CARDS_CONTENT)`, the asset convention of `diagram-registry.ts:332-335`. Projection code is never hashed (G0:1030): a changed output for equal inputs requires archi-cards@2.

### 3.2 Slot projection

`projectArchiCards(document, sourceView, binding, cards)` → `{ outcome: "ok", diagram, measures }` or `{ outcome: "refused", diagnostics }` (`proposed`, pure; PROTO:336-376). Non-archi entries of the source view are copied verbatim; archi entries are always recomputed.

| Slot | Card (non-container kind) | Zone (container kind), folded and expanded |
|---|---|---|
| icon | §3.5 | §3.5 |
| kicker | « Kind · Form » in author case, uppercased at drawing (DSM3:89, :251); the kind alone without a form; API form cli reads « Commandes »; a sub-system reads « Système · <root system title> » (PROTO:150-155) | same |
| title | mark(shortName ?? name, status), stored when a shortName exists or status ≠ current; otherwise absent and the DS reads `name` (DSM3:79) | same |
| body | role | — |
| subtitle | — | role, identical folded and expanded |
| detail | §3.3 | — (zones have no detail) |
| footer | §3.4 | same; independent of view, fold state and descendants (EV:108) |
| categoryRef | §3.7 | same |

Missing role → `archi-slot-missing`; a drawn card without detail item → `archi-detail-missing` (EV:125). No slot is empty, truncated or ellipsised.

### 3.3 Detail of a card

| Kind | Prefix fr / en | Items |
|---|---|---|
| component | exécuté par / run by | targets of executedBy |
| artifact | chargé par / loaded by | targets of loadedBy |
| runtime, service | sur / on | target of runsOn |
| api | fourni par / provided by | sources of providesApi |
| store | lu par / read by | sources of accesses{read} |
| actor | utilise / uses | targets of uses |

[FACT] Items are read in the document, drawn or not, one per far entity, ordered by `Intl.Collator(language)` on titles; text « prefix: A · B · +N » keeps every non-current item, then current items while the line fits, then « · +N »; never an ellipsis (PROTO:135-148, :185-200; EV:145). [JUDGMENT] The collator is kept because the ported expectation EV:145 depends on it; §8 O4 tracks host stability. Edge case (AR m-3): when the shortest admissible text — every non-current item, or the first current item if there is none, then « · +N » — is already wider than the slot, it is emitted untruncated (PROTO:193-199) and §3.9 refuses the card once, `card-overflow` at `/measures/<occurrence>/card.detail`; a non-current item is never dropped to make a line fit.

### 3.4 Footer: total function of the element alone

| Kind | Footer (fr) | Fallback | Otherwise |
|---|---|---|---|
| package, api, system | repo: R, R = effective repo | propriétaire: O (ownedBy) | `archi-footer-missing` |
| component, artifact | repo: R · P, P = partOf package | propriétaire: O | `archi-footer-missing` |
| runtime | repo: R · P, P = deployedAs sources sorted by title | propriétaire: O | `archi-footer-missing` |
| store | écrit par: W (single-writer, exactly one) / écrit par: plusieurs (multi-writer, ≥ 1) | — | no writer: `archi-footer-missing`; ≠ 1 writer: `archi-single-writer` |
| service, host | opéré par: X | — | `archi-footer-missing` |
| repo | propriétaire: O | — | `archi-footer-missing` |
| actor | no footer, a governed absence | — | never refused |

[FACT] PROTO:103-132; EV:31-39, :83-90. R, P, O, W, X are titles (shortName ?? name), each with its status mark (§3.6); « plusieurs » carries none, each writer then being an arrow. This realizes decision (1): code cards read « repo: h2a · @sentropic/track ». An external CLI has no repo and reads « propriétaire: <vendor> », `unverified` when unattributed (§2.6).

### 3.5 Icons

| Kind | Icon |
|---|---|
| actor | people; form agent: robot |
| system, artifact | window |
| repo, package, component, api | link |
| runtime, service | server |
| store | db |
| host | cloud |

[FACT] PROTO:29-30, :368. Every icon is in the existing #711 family (PE §6.4), so no `card-icon-unknown` arises (DSM3:223). Dedicated kind pictograms are an archi-cards@2 matter once the DS ships them (PJ §4.4).

### 3.6 Status marks « (cible) », « (retiré) » (J2)

- [FACT] status = worst lifecycle, retired > proposed > current (PROTO:44-45).
- Title: worst of the entity and of every relation on its active-tree path to its drawn parent (PROTO:346; EV:144: a proposed `partOf` marks « CLI track (cible) »); under `archi-dossier-hosts`, a placed CLI root's path is its runsOn.
- Detail or footer item: worst of the named entity and of the relations that bring it (PROTO:100; EV:36, :143).
- Text: `${text} (cible)` or `${text} (retiré)` (en: target, retired), measured like the rest (EV:146); never hidden in « +N » (EV:145); kicker, body and subtitle carry no mark.
- Arrows: strokeStyle `dashed` iff the relation is not current (V4, EV:122), decision (3).
- [FACT] Turning the target current changes five slots and leaves no mark (EV:140-142).

### 3.7 Legend carriage (J3)

- [FACT] The meaning of a tint is semantic: a generic@2 `legend` and its `legend-key` entities (name, category) in the same document; every `contains` is generic@2 → generic@2, no relation joins the families (EV:147-148; DSM3:207-214, P-AM pattern).
- An archi entity's tint is its `category` value, a domain datum.
- The governed tint input is the view spec's legend block (§5.2): legend and key faces, `legends.order`, `categoryTokens` (category → DS token). The projection copies it byte for byte; it is conserved in every fold state (EV:186-188).
- `categoryRef` = the key of `binding.legendRef` whose category equals the entity's; none, or no legendRef while a drawn entity has a category → `archi-category-unbound` (EV:193-194).
- generic@2 sits in `profilePins` and `semanticCategoryPins` (DSM3:153). Without it the DS refuses: `profile-not-declared` on the document; `reference-type-mismatch`, `tone-category-unknown` and `occurrence-endpoint-mismatch`/`form-selector-mismatch` on the presentation (EV:190). DSM3:218 announces `dangling-reference` instead: divergence `unverified` (§8 O5); tests assert the DS at the pinned commit.
- [FACT] Native refusals: two tokens for one category → `occurrence-endpoint-mismatch`/`token-binding-conflict`; a cross-family `contains` → `endpoint-without-join` (EV:191-192); an r1-shaped presentation → `tone-category-unknown` × 6 (EV:189).

### 3.8 Fold summaries per DS key (J1)

`archiSummaries(document, sourceView, collapsed, ds)` (`proposed`, pure, DS port injected; PROTO:378-418):
1. P = `ds.projectView(document, sourceView without summaryLabels, collapsed)` (ds:fold.ts:282): definitions of another fold set are never reused.
2. For each DS aggregate key K = (source representative, target representative, effective style) of P (ds:fold.ts:742-781, key :774-775) with at least one projected member, one SummaryDefinition: id `summary:s<n>` in sorted key order; sourceOccurrence, targetOccurrence; relationIds = sorted unique relation ids of **all** members; relationOccurrences = **all** member occurrence ids sorted, directly visible ones included; strokeStyle dashed iff K is dashed (DSM3 §4.5.1-4.5.2). A member is oriented by the declared role order of its relation type, roles[0] → roles[1], as the DS orients it (ds:fold.ts:537-549, :754-758), never by searching a role named `source`; every archi@1 type declares [source, target] (PROF:53, :65), so both readings coincide (PROTO:387).
3. Label: one relation → its label; several → the distinct verbs of their relations (the instance verb: an invokes with trigger poll reads « sondage », HD:28) in the order invokes, invokes.poll, consumesApi, deployedAs, loadedBy, executedBy, dependsOn, documents, accesses.append, accesses.write, joined « · », then « · N liaisons » (en « N links »).

The displayed view of fold set F is `ds.projectView(document, sourceView + archiSummaries(…, F), F)`, recomputed on every transition: fold, unfold, fold all, unfold all (DSM3 §4.4.3, :503-520). [FACT] Folding `pkg-track` in Rôles yields « déployé comme · documente · 3 liaisons » (EV:132); keeping Rôles' definitions after folding all leaves 7 of 8 aggregates unlabelled (EV:134); over 204 fold states, 960 of 960 aggregates are labelled with no refusal (EV:137-139, :188). No EV summary combines verbs whose order changes with invokes.poll (EV:49-56, :132).

### 3.9 Line measurement (J4)

- [FACT] Line rule = the DS reference LineMeasurer (dsc:tests/layout/m1d-fixtures.ts:65-100): breaks at spaces only, greedy; a word wider than the line keeps a line of its own (:84); no character is cut (DSM3 §4.6.2).
- [FACT] Each resulting line is measured with the KIT metrics: width(s) = Σ widths[metric][c] × size + 2, unknown glyph 0.7 (KIT `src/architecture-layout.js:33-35`); kicker uppercased (`toLocaleUpperCase(language)`), body metric 22 px plus 0.04 em per glyph (KIT `src/hrpolnav-card.js:32`); title 32 px title metric; body, detail, subtitle 24 px body; footer 24 px title (PROTO:158-161).
- More lines than allocated, or any line wider than its width → `card-overflow` (card) or `zone-overflow` (zone, measured folded **and** expanded) (EV:196-198). [JUDGMENT] The DS emits these names as layout warnings (DSM3:711); engram's acceptance makes them refusals.
- [JUDGMENT] Allocation (px × lines) = the KIT table of PJ A.2, clamped to the DS layout so that an accepted line never wraps differently there. The clamp is a stated change against PJ A.2 and PROTO:164-168 (AR B-2): card body and detail 430 → 428, card and folded-zone footers 434 → 428. [FACT] The DS lays a 460 px card out at `innerWidthOf(460)` = 460 − 2 × 16 = 428 (dsc:src/layout/measure.ts:16, :21, :116-119; dsc:src/layout/measured.ts:826-835, :1053-1063), reduces headers with a fold control by 32 (measure.ts:31, :121-127) and allocates at most kicker 1, title 2, body 4, detail 3, footer 1, subtitle 2 lines (measure.ts:104-114).

| State | kicker | title | body | detail | subtitle | footer |
|---|---|---|---|---|---|---|
| card | 358 × 1 | 358 × 1 | 428 × 1 | 428 × 1 | — | 428 × 1 |
| zone folded | 290 × 1 | 290 × 1 | — | — | 396 × 2 | 428 × 1 |
| zone expanded, smallest frame 492 | 314 × 1 | 314 × 2 | — | — | 434 × 2 | 434 × 1 |

[FACT] No rendered face of the ported views changes: the widest accepted lines of the clamped slots measure body 368.7, detail 344.7, footer 367.3 px (EV:106), all below 428, and a candidate fitItems rejected at 430 (PROTO:197) stays rejected at 428; the « +N » probe EV:145 is not a rendered face and is re-asserted at 428 (§6.1). Only the denominators EV prints change (EV:107 and each FACE measure), so §6.1 compares faces and widths, not those denominators. Every rendered line of the four ported views stays within; the witness faces equal Rôles' (EV:164-185). KIT `FOLD_TITLE = 290` (hrpn/render.js:36) is commented « 356 − 66 » (hrpn/tints.css:26) while PJ uses 358 for the card title: 2 px `unverified`, settled by the parity test (§6.3). Edge and summary labels (`edge-label`, 400 × 1, measured.ts:104) are measured by the DS only: `not covered` (§8 O3).

### 3.10 Label tables

[FACT] fr is PJ A.2 / PROTO:20-39, plus `invokes.poll` (HD:28). [JUDGMENT] en is new; its widths are `unverified` until lot 3 measures the closed kicker lists of both languages (fr, EV:112: widest card kicker ACTEUR · ORGANISATION 262.7 px of 358, widest zone kicker HÔTE · PROJET CLOUD 237.2 px of 290). Sub-system kickers carry a root title, so they are measured per face (N15).

```js
fr = { kind: { actor: "Acteur", system: "Système", repo: "Repo", package: "Paquet", component: "Composant", runtime: "Exécution",
    service: "Service", api: "API", store: "Stockage", artifact: "Artefact", host: "Hôte" },
  form: { human: "Humain", agent: "Agent", team: "Équipe", org: "Organisation", library: "Lib", plugin: "Plugin", app: "App",
    cli: "CLI", "mcp-server": "MCP", daemon: "Démon", job: "Job", hook: "Hook", mcp: "MCP", http: "HTTP", "api.cli": "Commandes",
    jsonl: "JSONL", file: "Fichier", database: "Base", "object-store": "Objets", graph: "Graphe", skill: "Skill",
    manifest: "Manifeste", schema: "Schéma", doc: "Doc", workstation: "Poste", cluster: "Cluster", "cloud-project": "Projet cloud" },
  footer: { repo: "repo", owner: "propriétaire", writtenBy: "écrit par", operatedBy: "opéré par", several: "plusieurs" },
  verb: { invokes: "lance", "invokes.poll": "sondage", consumesApi: "appelle", deployedAs: "déployé comme", dependsOn: "dépend de",
    documents: "documente", executedBy: "exécuté par", loadedBy: "chargé par", "accesses.append": "ajoute à", "accesses.write": "écrit" },
  status: { proposed: "cible", retired: "retiré" }, links: "liaisons" }
en = { kind: { actor: "Actor", system: "System", repo: "Repo", package: "Package", component: "Component", runtime: "Runtime",
    service: "Service", api: "API", store: "Store", artifact: "Artifact", host: "Host" },
  form: { human: "Human", agent: "Agent", team: "Team", org: "Organization", library: "Lib", plugin: "Plugin", app: "App",
    cli: "CLI", "mcp-server": "MCP", daemon: "Daemon", job: "Job", hook: "Hook", mcp: "MCP", http: "HTTP", "api.cli": "Commands",
    jsonl: "JSONL", file: "File", database: "Database", "object-store": "Objects", graph: "Graph", skill: "Skill",
    manifest: "Manifest", schema: "Schema", doc: "Doc", workstation: "Workstation", cluster: "Cluster", "cloud-project": "Cloud project" },
  footer: { repo: "repo", owner: "owner", writtenBy: "written by", operatedBy: "operated by", several: "several" },
  verb: { invokes: "launches", "invokes.poll": "polls", consumesApi: "calls", deployedAs: "deployed as", dependsOn: "depends on",
    documents: "documents", executedBy: "run by", loadedBy: "loaded by", "accesses.append": "appends to", "accesses.write": "writes" },
  status: { proposed: "target", retired: "retired" }, links: "links" }
```

One language per description (DSM3:251: a translation is a new authored instance); verbs, prefixes, marks and summary labels use the manifest language (§5.2).

## 4. The DS re-pin

[FACT]
- ENG pins `DS_COMMIT = e3bc10cc9e59…` (`diagram-presentation-pins.ts:34`), adapter `presentation-validate.ts` 488d8499… and renderer `presentation-apply.ts` 28c3607e… (`:37-45`).
- At e3bc10cc and at 7c5a8c82 both entry files hash to these values (`git show | sha256sum`; 819 and 304 lines). `fold.ts` is absent at e3bc10cc and present at 7c5a8c82 (874 lines, 143c0be9…). The local DS `origin/main` was 7c5a8c82 at r1; it is now bbf8b390, whose `packages/diagram-core/src` is identical, so both hashes and `fold.ts` hold there too; among the files read here it changes only `dsc:` `TOGGLE_ALLOCATION` (AR m-4: known, no change).
- With the same profile, document and folded Rôles view, e3bc10cc returns 10 × `occurrence-endpoint-mismatch` and has no `projectView`; 7c5a8c82 returns `[]` everywhere (PIN:1-10; `joint-pin.mjs`).
- The commit is inside entry revision 2: `PAYLOAD_CONTRACT_QUALIFIED.compatibility = QUALIFIED_COMPATIBILITY` (`diagram-registry.ts:349-360`), entry digest c430ff66… asserted by `tests/ontology-guardian-diagram-pinned-adapter.test.ts:46`, `:294`, and transcribed into the DS packaged catalog (ds:presentation-catalog.ts:226-227, :243-260; DS `tests/presentation-catalog-pin.test.ts:16-18`), against which DS application authenticates `input.adapterPin` (ds:presentation-apply.ts:252-279). `adapterPin` is read nowhere else in ds: (git grep at DS).

Re-pin [JUDGMENT], symbols `proposed`:
1. `DS_COMMIT = "7c5a8c82bf2abc71bf0963e3fcfc395c48fcf6af"`, or a later DS commit that contains `fold.ts` and keeps both entry hashes, under the same gate; `DS_ADAPTER_SHA256` and `DS_RENDERER_SHA256` unchanged.
2. Entry 2 stays byte-identical (G0:207, precedent entry 1 at `diagram-registry.ts:338-347`): `DS_COMMIT_ENTRY_2 = "e3bc10cc…"` builds `QUALIFIED_COMPATIBILITY_ENTRY_2` for `PAYLOAD_CONTRACT_QUALIFIED`; c430ff66… remains asserted; test lines `:169`, `:285-286` move to the entry-2 references.
3. Entry revision 3: `PAYLOAD_CONTRACT_FOLD`, `ENVELOPE_CONTRACT_FOLD` (id `engram-diagram-presentation-3`, entryVersion "3", compatibility at 7c5a8c82); contract content 74dadb9c… and schemaPin f13d5957… unchanged; `CONTRACT_FOLD_REVISION: CatalogRevisionLink` {successor 3, predecessor 2 with entryDigest c430ff66…}, verified by `checkContractCatalogRevision` (`:369-372`, `:395-417`).
4. DS adoption (DS owner, §8 O1): the packaged catalog moves to entry 3 before DS application accepts an adapter Pin at 7c5a8c82. Validation and `projectView` do not read it, so lots 2-4 do not wait.

Gate: existing pinned-adapter tests green; new cases parse entry 3, project its adapter Pin and hash both entry files at the new commit (skip with reason when the DS clone is absent, never a fake pass, `:48-59`, `:260-273`); the PIN replay at the new `DS_COMMIT` returns `[]` for the folded view.

## 5. Ingestion

### 5.1 Discovery

[JUDGMENT] One fixed path at one exact commit: `<owning repo>/.engram/architecture/manifest.json` (`proposed`), in engram's project directory (ENG `src/project-config.ts:49-53`). No search, glob, legacy `.graphify/` candidate (`:57-61`) or working-tree read: bytes come from `git show <commit>:<path>` for a 40-hex reachable commit. Absent → `archi-manifest-missing`. Every other file is named by the manifest.

### 5.2 Authored inputs (closed JSON; an unknown field refuses)

```ts
interface ArchiManifest {                   // proposed
  readonly format: "engram.archi-manifest/1";
  readonly language: "fr" | "en";             // one language per description
  readonly owningRepo: string;                // EntityRef of a repo entity of the document
  readonly document: string;                  // repo-relative path of the SemanticDocument JSON
  readonly views: readonly string[];          // repo-relative paths of ArchiViewSpec files; a set (§5.6)
  readonly profilePins: readonly Pin[];       // equal to document.profileRefs, same order
  readonly cardsPin: Pin;                     // archi-cards@1
  readonly viewSchemaPin: Pin;                // diagram-view-schema@2
}
interface ArchiViewSpec {                   // proposed
  readonly format: "engram.archi-view/1";
  readonly viewId: string;                    // "view:<local>", unique in the manifest
  readonly activeHierarchy: "archi-composition" | "archi-source" | "archi-deployment" | "archi-dossier-hosts";
  readonly draw: readonly string[];           // EntityRefs of archi entities; a set
  readonly collapsed: readonly string[];      // default fold set: EntityRefs of drawn containers; a set
  readonly legend?: { readonly legendRef: string; readonly title?: string;
    readonly order: readonly string[];        // EntityRefs of legendRef's keys, display order
    readonly tokens: readonly { readonly category: string; readonly token: string }[] };  // a set, by category
}
```

[JUDGMENT] References (AR M-1). Every authored string naming a record is its full ref as stored in the document: `owningRepo`, `draw`, `collapsed`, `legend.legendRef` and `legend.order` are EntityRefs `entity:<local>`, `viewId` is `view:<local>` (the DS ref carries its namespace, ds:refs.ts:22-24); a bare local id refuses (`archi-input-invalid`). `<local>` follows §5.6. Derived ids are never authored (PROTO:253-254, :302): entity occurrence `occurrence:o-<local>`, relation occurrence `occurrence:e-<local of the relation>`, fold group `grp.<n>.o-<local>` with n the length of `o-<local>` (ds:fold.ts:172-176), summary `summary:s<k>` (§3.8). Manifest paths are repo-relative POSIX paths without empty, `.` or `..` segments.

[JUDGMENT] Authors never write occurrences, groups, arrows, faces or digests. `buildArchiSourceView(document, spec)` (`proposed`, pure; PROTO:269-308) derives the retained source view: those derived ids, `group` of the nearest drawn ancestor in the active tree, a fold group per drawn container, an arrow for every arrow-encoded relation whose two ends are drawn, strokeStyle from lifecycle, placeholder geometry that DS layout replaces (DSM3:505), and the legend block as governed tint input. V1-V5 still run on the derived view and on every view Focus displays. The closed shapes are governed as `engram:archi-manifest/1`, `engram:archi-view/1` and `engram:archi-acceptance/1` (`proposed`), checked by hand-written guards with no runtime dependency (VS2:91).

### 5.3 Acceptance sequence (atomic, fail closed)

`ingestArchitecture({ repository, commit }, { readAt, ds, write })` (`proposed`; ports injected, I-4). Stages run in order; every diagnostic of a failing stage is reported and later stages do not run; a refusal registers nothing (G0:217).

1. **Source.** Commit grammar and reachability; manifest, document and view bytes at the commit → `archi-source-unresolved`. Each file is read as I-JSON (RFC 7493) by a strict reader (`proposed`; `JSON.parse` keeps the last duplicate silently): duplicate member names, lone surrogates and non-finite numbers refuse; raw bytes are never hashed. Manifest and view specs: closed shape → `archi-manifest-invalid`, `archi-input-invalid` (bare or unknown ref, non-archi entity in `draw`, non-container in `collapsed`, owningRepo not a repo). Document: `checkSemanticShape` (ENG `diagram-document-shape.ts:56-59`) → `archi-input-invalid` with the returned path. All three: the §5.6 discipline → `archi-input-invalid`.
2. **Pins.** archi@1, generic@2, archi-cards@1, diagram-view-schema@2 resolve by exact Pin, never latest (G0:83): unknown → `incompatible_version`, digest → `digest-mismatch` (G0:226-227); profilePins ≠ document.profileRefs, or generic@2 records without its pin → `archi-pin-mismatch`.
3. **Executor.** The DS port must be the pinned build-time copy of diagram-core at `DS_COMMIT` (G0:66), its adapter and renderer entry bytes hashing to the pinned values; otherwise `archi-executor-unavailable`. Then `validateProfile`, `verifyExecutorBindings`, `validateDocument`; native codes pass through (§5.5).
4. **Document.** `checkArchi` (A1-A4, A6).
5. **Views.** Per view: `buildArchiSourceView`, `projectArchiCards`, `checkGovernedViewShape("2")` (ENG `diagram-view-shape.ts:142-146`), `validateView`, `validateDiagramPresentation`, `checkArchiView`.
6. **Fold states.** Per view, the stored default, all expanded, all drawn containers collapsed, and each single toggle of one container from the default (3 + C states): `archiSummaries`, `projectView`, `validateView`, `validateDiagramPresentation`, `checkArchiView` with V5. [JUDGMENT] Linear, deterministic coverage; the corpus proves every state of its views (§6), and Focus re-checks each displayed state before drawing it.
7. **Versioning.** When `r<revision>` exists, every file but `acceptance.json` is recomputed and compared byte for byte: all equal → the stored record is returned and nothing is written (its `source.commit` stays the first accepting commit); any difference → `archi-revision-conflict`.
8. **Record.** Otherwise the §5.4 directory is written through `write`, which publishes all files or none (a sibling temporary directory, then one rename).

### 5.4 Canonical bytes, versioning and the acceptance record

- [JUDGMENT] Canonical form (normative, AR B-3). Every digest of this document — archi@1 contentDigest (P-CONTENT-DIAGRAM, G0:1030), archi-cards@1 contentDigest (§3.1), documentPin, viewPin, bindingPin, and the `files` digests — is `digestOfPreimage(value)`, SHA-256 over `canonicalBytes(value)`, the RFC 8785 (JCS) form (ENG `canonical.ts:59-72`): sorted keys, no insignificant whitespace, RFC 8785 numbers, arrays in their stated order (G0:929-931; §5.6). Every persisted record is exactly `canonicalBytes(value)` in UTF-8, without BOM or trailing newline (G0:1067). A pin covers the parsed value, never a git blob: two repos that pretty-print the same description differently get the same pins.
- documentPin = {id: documentId, version: String(revision), contentDigest: digestOfPreimage(document)}. Bytes under (id, version) never change (G0:207): an edited description raises `revision`.
- viewPin = {id: viewId, version: String(revision), contentDigest: digestOfPreimage(the derived source view with its projected presentation)}; bindingPin = {id: `binding:<view local>`, version: String(revision), contentDigest: digestOfPreimage(binding)} (`proposed`).
- `ArchiViewBinding` (`proposed`, closed, an engram output, one per view; PJ A.4): viewId, activeHierarchy, language, documentPin, viewPin, profilePins, semanticCategoryPins ([] or [generic@2]), legendRef?, viewSchemaPin, cardsPin, presentationContractPin, dsCommit.
- `ArchiAcceptance` (`proposed`, closed): format `engram.archi-acceptance/1`, source {repository, commit, manifestPath}, language, owningRepo, documentPin, profilePins, cardsPin, viewSchemaPin, bindings (binding pins ascending by id), files (every other file of its directory with its digest, ascending by path). Directory `<engram output root>/architecture/<document local id>/r<revision>/`, derived, regenerated, never hand-edited (I-6, G0:79):

| File | Value written as `canonicalBytes` | Pinned by |
|---|---|---|
| `manifest.json` | the ArchiManifest | `files` |
| `document.json` | the SemanticDocument | documentPin |
| `view-specs/<view local>.json` | each ArchiViewSpec | `files` |
| `views/<view local>.json` | each derived source view with its projected presentation | viewPin |
| `bindings/<view local>.json` | each ArchiViewBinding | bindingPin |
| `acceptance.json` | the ArchiAcceptance | its own digest |

- Focus stores only a bindingPin and resolves exact bytes, never latest (PJ §8; G0:83); its node shape is h2a's (§8 O9). An edit in Focus is a change proposed to the owning repo's description, then re-ingested; never a write into an accepted record.
- [JUDGMENT] Authority scope: a description is authoritative for entities whose effective repo is `owningRepo`. Entities of other repos and third parties are references (e.g. « Outils mémoire » of engram, the eight CLI hosts in the h2a description); their consistency with another repo's accepted description is `not covered` in revision 2 (§8 O6).

### 5.5 Diagnostics: the envelope and the closed list

`ARCHI_DIAGNOSTIC_CODES` (`proposed`, closed, exported by the archi module); `DIAGRAM_DIAGNOSTIC_CODES` (ENG `diagram-schemas.ts:258-279`) does not change.

[FACT] The real envelope (ENG `diagnostics.ts` at f7e9914c): a union on `origin` (:290-315). `EngramIssue` is {severity, code, message, path?, nodeId?, edgeIndex?} (:251-259) and `EngramDiagnostic` adds exactly {origin: "engram", nativeCode, subjectRef} (:307-311); `DiagramCoreDiagnostic` adds {origin: "diagram-core", nativeCode, subjectRef, studyDisposition?} to `DsDiagnostic` {code, severity, path, message, refs?, details?} (:241-249, :300-305); `sortDiagnostics` orders by (code, subjectRef, locator) (:717-745). No `fromEngramIssue`, `validateEngramIssue` or `engramSubjectRef` exists (git grep at ENG).

[JUDGMENT] Rules (`proposed`):
- **Archi findings** are `EngramDiagnostic` with exactly those keys: `severity` "error"; `code` = `nativeCode` = the archi code (G0:372-373); `message` a fixed English template; `path` an RFC 6901 pointer (`validPointer`, :137-139) into the judged value of its scope; `nodeId` the full ref of the offending record (`entity:`, `relation:`, `occurrence:`, `summary:`) when there is one; `edgeIndex` never (archi relations are keyed records); no `ruleId` (G0:374), `refs` or `details`. `subjectRef` = that ref; else the viewId, the pin as `id@version` (G0:375), the DS aggregate key (ds:fold.ts:775) for `archi-summary-missing`, or the repo-relative file path for a source finding. Measurements go to `path` (`/measures/<occurrence>/<state>.<slot>`) and `message`, since the arm has no details.
- **DS findings** keep every S-DSDIAG field verbatim, dotted path included (G0:354, :377), plus origin "diagram-core", `nativeCode` = `code`, `subjectRef` = `refs[0]` when present, else `path`. Any DS finding refuses, warnings included. [FACT] `DiagramCoreDiagnostic` types `code` with the S-DSDIAG union transcribed at DS 25c0f3d3 (ENG `diagnostics.ts:185-239`), which lacks `endpoint-without-join`, `legend-key-parent-invalid`, `tone-category-unknown` and `relationship-matrix-violation`, emitted by DS 7c5a8c82 (ds:diagnostics.ts:72-74, :79) and expected by N16, N17, N19 and §2.4 N (EV:189-192). [JUDGMENT] The DS arm is `ArchiDsDiagnostic` (`proposed`) = `DiagramCoreDiagnostic` with `code: string`: same keys and values; it is a G0 `DiagramCoreDiagnostic` exactly when its code is in the transcription (§8 O10).
- **No guardian origin.** `GuardianCode` is the closed stack, derive and merge union (ENG `types.ts:269-331`). `incompatible_version` and `digest-mismatch` keep the names of G0's record-contract errors (G0:226-227) as engram native codes, as engram's openerp resolver already does for the first (`openerp-registry.ts:302-313`).
- **Refusal.** `ArchiRefusal` (`proposed`) = {outcome: "refused", stage, scopes}, scopes ascending by name, each {scope, diagnostics in `sortDiagnostics` order}; scope ∈ `file:<path>`, `pins`, `executor`, `document`, `<viewId>`, `<viewId>/<fold key>`, `binding:<view local>`. A view scope judges {view, measures}; a fold scope, the displayed view; fold keys are `default`, `expanded`, `collapsed`, `toggle:<occurrence>`.

| Stage | Codes |
|---|---|
| source | `archi-manifest-missing`, `archi-manifest-invalid`, `archi-input-invalid`, `archi-source-unresolved` |
| pins | `incompatible_version`, `digest-mismatch` (G0 names, engram origin); `archi-pin-mismatch` |
| executor | `archi-executor-unavailable` |
| document | `archi-source-conflict`, `archi-footer-missing`, `archi-single-writer`, `archi-execution-unbound`, `archi-edge-verb` |
| projection | `archi-slot-missing`, `archi-detail-missing`, `archi-category-unbound`, `card-overflow`, `zone-overflow` (DSM3:711 names, refusals here) |
| view, fold state | `archi-occurrence-duplicate`, `archi-zone-mismatch`, `archi-edge-policy`, `archi-stroke-status`, `archi-summary-missing` |
| Focus verification | `archi-slot-drift` (recomputed faces, tint tables or summaries ≠ received bytes); `archi-pin-mismatch` (a binding pin ≠ resolved bytes) |
| versioning | `archi-revision-conflict` |

Totals: 25 codes, all origin engram: 21 `archi-*`, 2 DS layout names, 2 G0 names; DS native codes pass through in the DS arm under their own inventory.

### 5.6 Canonical JSON and serialization invariants (AR M-5)

[JUDGMENT] The accepted record is canonical JSON (§5.4). A bijective text serialization and deterministic exports stay possible on top of it because these invariants hold, each checked at stage 1 (`archi-input-invalid`, with its pointer) or true by construction. The text format itself is a separate owner objective (§8 O11).
1. **Source = the authored triple.** Manifest, SemanticDocument and view specs are the only source, all persisted (§5.4). Views, faces, summaries, measures, bindings, pins and the acceptance are functions of the triple and the pins: recomputed, never parsed back. A serializer round-trips the triple; an export reads accepted canonical bytes only.
2. **Stable ids.** Every authored record carries an authored local id matching `^[a-z][a-z0-9-]*$`, at most 40 characters (the key grammar of ENG `diagram-view-shape.ts:56`, a subset of ds:refs.ts:57, safe in DS dotted paths, RFC 6901 pointers and file names), unique per namespace, never positional and never computed from content: editing a name, role or label keeps the id. Derived ids are pure functions of authored ids (§5.2).
3. **Total order.** Object members follow RFC 8785 (UTF-16 code units). Every array has a stated order (G0:931): semantic, kept as authored — `profileRefs` = `profilePins`, `legend.order`, collection items such as `evidence`; or a set, ascending by UTF-16 code units and without duplicates — manifest `views`, `draw`, `collapsed`, `legend.tokens` (by category) — and relation `endpoints` in declared role order. An out-of-order or duplicated set refuses, so equal content always has equal bytes.
4. **No derived data in the source.** The triple holds no face, kicker, title fallback, detail, footer, icon, categoryRef, occurrence, group, arrow, strokeStyle, summary, measure or own digest, and no denormalized copy of a relation (an effective repo, a writer list); the closed shapes refuse such fields (`attribute-not-in-schema` natively, as for `facts`, EV:117).
5. **Exact strings and numbers.** Strings are well-formed Unicode (ENG `canonical.ts:11-22`), NFC, and hold no control character (U+0000–U+001F, U+007F–U+009F): every archi text is single-line, the line rule breaking at spaces only. Numbers in the triple are integers (`canonical.ts:29`). Duplicate member names refuse (§5.3).
6. **Lossless round trip is the acceptance gate.** A text serialization T is admissible only when canonicalBytes(parse_T(format_T(S))) = canonicalBytes(S) for every corpus triple S, and format_T(parse_T(t)) = t for every canonical text t. An export is admissible only as a pure function of accepted canonical bytes and pins (two runs, equal bytes) that declares what it drops, like §2.8; an export is never re-imported as a source. Lot 4 lands the gate with T = canonical JSON itself, so a later format plugs into an existing test.

## 6. Test plan (test-first, file-level)

[FACT] Engram's diagram tests qualify data, shapes and migrations only; native validation, projection and layout stay DS evidence (ENG `tests/ontology-guardian-diagram-acceptance.test.ts:1-2`). [JUDGMENT] Two tiers follow. **E** runs engram code only and always runs. **DS** needs the executor at `DS_COMMIT`, built by `tests/helpers/ds-executor.ts` (`proposed`) from git objects of the local DS clone (never a working tree), transpiled with the repo's TypeScript (devDependency ^6.0.3); it skips with a visible reason when the clone is absent, never fake-passes (pattern `pinned-adapter.test.ts:48-59`, `:260-273`). The DS owner replays the same corpus as qualification evidence (§8 O1).

### 6.1 Files

| File (`proposed` unless existing) | Tier | Content and expected result |
|---|---|---|
| `tests/fixtures/archi/joint-r2/` | — | FIX ported as manifest, document (29 entities, 64 relations, EV:8), view specs roles, roles-replie, deploiement, h2a-repo and the tint witness; bare ids written as EntityRefs and sets sorted at port time (§5.6), so EV lines that print sets (EV:17, :45) compare as sets; provenance FIX ed17cb2c… |
| `tests/fixtures/archi/hosts-r3/` | — | HO = FIX plus the KR7 delta (`joint-fixtures.mjs:139-158`), built on the r2 baseline, never on KR7's r1-based prototype: 41 entities and 79 relations by construction (6 runtimes and 6 actors added; 9 relations removed, 24 added); views roles-hosts (`archi-dossier-hosts`, FIX roles plus host-poste and the eight CLIs, host-poste folded by default) and deploiement-hosts (`archi-deployment`, the eight CLIs drawn) (KR7:161-166); provenance HD c563ef38…, HF |
| `tests/ontology-guardian-archi-profile.test.ts` | E, DS | declaration = PROF with `poll` (KR7 `joint-profile.mjs:44`); 11 kinds, 4 containers, 55 tuples, required-parent (EV:2, :6-7); deep-frozen; digest re-measured; DS `validateProfile`, `verifyExecutorBindings` `[]` (EV:3-4) |
| `tests/ontology-guardian-archi-checks.test.ts` | E, DS | document `null`/`[]`/`[]` (EV:9-11) for FIX and HO; N1-N5, N26; A1-A4 negatives of PE §7.4 |
| `tests/ontology-guardian-archi-cards.test.ts` | E | each FACE line of EV:22-39, :57-74, :83-90, :99-105, :164-185: face (form, icon, text, categoryRef) byte-equal, each measured width equal to 0.1 px, available widths from §3.9 (428 where EV prints 430 or 434); F2 (EV:108); F5 and closed kickers (EV:109-112); RJ2 (EV:140-145, the probe EV:145 re-asserted at 428); N13, N15, N20-N24, RJ4; HO faces (§2.7) |
| `tests/ontology-guardian-archi-views.test.ts` | E, DS | five views `[]` (EV:12-16…); N6-N11, N14, N14b, N16-N19, N25; RJ3 conservation and categoryRef (EV:186-187); HO views `[]` |
| `tests/ontology-guardian-archi-folds.test.ts` | DS | summaries EV:20-21, :48-56; N12; RJ1 T1-T3 and kept definitions → `archi-summary-missing` × 7 (EV:130-136); all 204 states; H1 summaries and every HO fold state |
| `tests/ontology-guardian-archi-metrics.test.ts` | E (+KIT) | §6.3 |
| `tests/ontology-guardian-archi-canonical.test.ts` | E | C1-C5, R1, E1 (§6.2) |
| `tests/ontology-guardian-archi-ingest.test.ts` | E, DS | each §5.3 stage reaches its codes through a fake `readAt`; idempotence; `archi-revision-conflict`; executor hash mismatch; a failing `write` leaves no directory |
| `tests/ontology-guardian-diagram-pinned-adapter.test.ts` (existing) | E (+DS clone) | §4 gate |

### 6.2 Fixtures and cases

Notation `a`/`b` = DS code `a` with `details.check` `b`, as printed by VAL:14.

| Set | Cases and expected codes (EV line) |
|---|---|
| 23 negatives, ported | N1 artifact form hook → `enum-value-not-allowed` (113); N2 runtime without role → `attribute-required-missing` (114); N3 label without verb → `archi-edge-verb` (115); N4 system form, N5 `facts` → `attribute-not-in-schema` (116-117); N6 container as card, N7 service as zone → `occurrence-endpoint-mismatch`/`form-selector-mismatch` (118-119), DS `validateDiagramPresentation`; N8 detail relation as arrow → `archi-edge-policy` (120); N9 runtime in package zone → `archi-zone-mismatch` (121); N10 proposed relation solid → `archi-stroke-status` (122); N11 second occurrence → `archi-occurrence-duplicate` (123); N12 per-type summaries on one key → `occurrence-endpoint-mismatch`/`summary-constituents-mismatch` and `/summary-duplicate-key` (124); N13 runtime without runsOn → `archi-detail-missing` (125); N14b component left at root → `archi-zone-mismatch` (128); N15 sub-system kicker 468 px → `zone-overflow` (129); N16 r1 presentation → `tone-category-unknown` × 6 (189); N17 generic@2 pin omitted → `profile-not-declared`; `tone-category-unknown`, `reference-type-mismatch`, `occurrence-endpoint-mismatch`/`form-selector-mismatch` (190); N18 two tokens → `occurrence-endpoint-mismatch`/`token-binding-conflict` (191); N19 cross-family contains → `endpoint-without-join`, `legend-key-parent-invalid` (192); N20 category absent from legend, N21 no legendRef → `archi-category-unbound`, × 6 for N21 (193-194); N22 « Cluster mesh (cible) » 317.5 px → `zone-overflow` title folded (146); N23 unbreakable body word → `card-overflow` (197) |
| 2 positives, ported | N14 component without drawn package nests in the system zone, all checks `[]` (126-127); N24 two-line subtitle 315 + 337 px of 396 accepted (198) |
| 204 fold states, ported | roles 64, deploiement 4, h2a-repo 8, tint witness 128: 0 refusal, 960 of 960 aggregates labelled, tint tables unchanged (137-139, 188) |
| r2 cases, new (no stored run) | N25 root runtime given a zone group → `archi-zone-mismatch` (AR M-3); N26 `invokes` with trigger poll labelled « lance · sondage » → `archi-edge-verb`; H1 HO: every check `[]`; the eight CLI occurrences in `grp.12.o-host-poste`; faces of §2.7; arrow labels HD:17-26; roles-hosts default summaries (host-poste, rt-h2a, solid) « lance · sondage · 8 liaisons », (host-poste, api-h2a, solid) « appelle · outils h2a_* », (host-poste, rt-track, solid) « lance · écritures du suivi », plus EV:21; every fold state of both HO views: 0 refusal, every projected aggregate labelled, counts recorded in lot 3 |
| canonical and envelope, new | C1 duplicate member name in a view spec, C2 `draw` unsorted or duplicated, C3 decomposed (non-NFC) `name`, C4 local id `sys.h2a` → `archi-input-invalid`; C5 FIX pretty-printed with shuffled keys → the same pins and files; R1 re-ingesting the persisted canonical triple from a test repository commit → a byte-identical directory, then a no-op; E1 every corpus refusal carries exactly the `EngramDiagnostic` or `ArchiDsDiagnostic` keys, in `sortDiagnostics` order |

The r1 red runs are history and are not ported; their conditions survive as negatives (N12, N16, kept definitions).

### 6.3 Parity with the #711 metrics

- The embedded metrics table deep-equals the object parsed from KIT `src/governance-font-metrics.js`, whose SHA-256 is 5f868f9e… (EV:1); KIT absent → skip with reason.
- `width`, the kicker rule and the line rule reproduce to 0.1 px: closed kickers (EV:112), F5 (EV:109-111), maxima (EV:106), RJ4, N23, N24 (EV:196-198).
- The allocation table equals §3.9, derived from KIT `FOLD_TITLE` 290 (hrpn/render.js:36), the 66 px reserve (hrpn/tints.css:26-27), frame − 178 (src/architecture-layout.js:70-71) and the DS clamps (measure.ts:16-31, :104-127); the test fixes the 356/358 card title width from the kit sources.
- Scope: metric and allocation parity. The kit's own face rules (kicker from the parent zone, footer from the root zone, KIT `src/governance-central.js:96-109`) are what archi replaces (PJ §8), so face equality with #711 scenes is not a goal.

## 7. Lots

New script `test:archi` (`proposed`) = diagram type check plus vitest on `tests/ontology-guardian-archi-*.test.ts`, beside `test:diagram` (ENG `package.json:69-71`). Each lot writes its failing tests first; commits stay under 150 lines where feasible (the metrics data file is the stated exception).

| Lot | One logical change | Commits | Gate |
|---|---|---|---|
| 1 | DS re-pin: entry 3 at 7c5a8c82, entry 2 frozen (§4) | (a) failing pinned-adapter cases; (b) pins + registry entry 3 + revision link | `npm run test:diagram` green with c430ff66… unchanged; entry-3 link checked; entry hashes at the new commit; PIN replay `[]` |
| 2 | archi@1: profile data with `poll`, draft G0 record, `checkArchi` with instance verbs (§2) | (a) FIX and HO fixtures + failing tests; (b) `archi-profile.ts` + registry; (c) `archi-check.ts` document rules | profile and checks tests (E, DS); N1-N5, N26, A1-A4; FIX and HO documents `[]`; `test:diagram` unchanged |
| 3 | archi-cards@1: contract data and preimage, projection, marks, legend, measurement, summaries, view checks over four trees (§3) | (a) tables + metrics data + `ARCHI_CARDS_CONTENT`; (b) `projectArchiCards`; (c) `archiSummaries` + `checkArchiView`; (d) fold, HO and parity tests | cards, views, folds, metrics tests: 23 + 2 ported cases, 204 states, N25, H1 |
| 4 | Ingestion, canonical record and envelope (§5) | (a) shapes, I-JSON reader, §5.6 checks, `ARCHI_DIAGNOSTIC_CODES`, envelope; (b) `buildArchiSourceView` + `ingestArchitecture` + atomic `write`; (c) canonical and ingest tests | every §5.5 code reached; C1-C5, R1, E1; idempotence; fixtures ingested end to end from a test repository commit |

## 8. Open points

| # | Owner | Point |
|---|---|---|
| O1 | DS | Adopt entry 3 in the packaged catalog and replay the archi corpus as qualification receipts. |
| O2 | DS | Browser font and shared line layout (M2, DSM3:93): the measurement proves fit at the pinned metrics, not a rendered pixel (`unverified`). |
| O3 | engram | en table widths `unverified`; edge and summary label fit `not covered`. |
| O4 | engram | `Intl.Collator` stability across ICU builds `unverified`; a drift refuses through `archi-slot-drift`, never renders. |
| O5 | DS | `dangling-reference` (DSM3:218) against `reference-type-mismatch` observed at 7c5a8c82 (EV:190). |
| O6 | engram | Consistency of entities referenced from another repo's description `not covered`. |
| O7 | owner + engram | G0 publication of archi@1 and archi-cards@1 (corpus, receipts, G0:188-196); drafts until then. |
| O8 | DS | Dedicated kind pictograms, then archi-cards@2. |
| O9 | h2a | Focus `architectureView` node and read transport; the six memory MCP tools stay unchanged (I-3, G0:76). |
| O10 | G0 owner | S-DSDIAG is transcribed at DS 25c0f3d3 while the executor is pinned at 7c5a8c82; re-transcribing it would make `ArchiDsDiagnostic` a `DiagramCoreDiagnostic` (§5.5). |
| O11 | owner | Text serialization format and exports: a separate objective, admissible only through the §5.6 gate. |
| O12 | h2a | Installation of each CLI host `unverified` unless separately evidenced (HD:9); vendors of Gemini CLI and OpenCode `unverified` (HD:41); push delivery maps to trigger `hook` as KR7:155. |

## Round-2 ledger

| Finding | Change | Where |
|---|---|---|
| B-1 hosts delta absent | Applied, binding: HD, HF, KR7 and H2A pinned; `poll` added to `invokes.trigger`; instance verb « sondage » / « polls »; tree `archi-dossier-hosts`; eight CLI hosts, vendors and `unverified` owners modelled; overlay HO and its expectations. Not taken: the S-2 rationale (G0:458 limits a child's removals; list widening is archi@2 by PJ:272). | Authority; §2.3-§2.7, §3.6, §3.8, §3.10, §5.2, §6, §7 |
| B-2 428 against EV 430/434 | 428 kept on DS evidence (`innerWidthOf(460)` = 428, dsc measure.ts:16, :21, :116-119) and stated as a change against PJ A.2 and PROTO:164-168; the gate compares faces and widths with §3.9 denominators; no ported outcome changes (EV:106) | §3.9, §6.1 |
| B-3 no canonical form | RFC 8785 for every digest and record through `canonicalBytes` / `digestOfPreimage` (canonical.ts:59-72; G0:929-931, :1067); parsed values hashed, never git blobs; I-JSON reading; archi-cards@1 preimage with its tables; exact record directory, atomic write. AR's G0 path `spec/SPEC-G0-guardian-contracts.md` does not exist at ENG | §3.1, §5.3, §5.4, §5.6 |
| B-4 envelope mismatch | Aligned with the real types (diagnostics.ts:241-315): `EngramDiagnostic` exact keys, no refs, details or ruleId, pointer path, nodeId and subjectRef rules, `sortDiagnostics`, scoped refusal; DS arm `ArchiDsDiagnostic` for codes outside S-DSDIAG; no guardian origin. Disputed in part: `fromEngramIssue`, `validateEngramIssue`, `engramSubjectRef` do not exist (git grep: `EngramIssue` only at diagnostics.ts:252, :307; :425-475 hold `assertValidNativeEntry`, `compareNativeEntries`) | §5.5, §8 O10 |
| M-1 ref convention | Full refs everywhere authored; local-id grammar; derived id forms stated | §5.2, §5.6 |
| M-2 role orientation | Declared role order written into §3.8. Disputed in part: archi@1 has no `definedIn`; every type declares [source, target] (PROF:53, :65), so PROTO:387 already orients correctly | §3.8 |
| M-3 V2 root case | V2 written as equality of two optional parents; N25 added. Disputed in part: r1 already required root without drawn ancestor (r1:100), and PROTO:318-321 compares both cases; the quoted guard is not in PROTO | §2.4, §6.2 |
| M-4 J5 by pointer | Crosswalk inlined | §1, §2.8 |
| M-5 bijection readiness | §5.6: source triple, stable ids, total order, no derived data, exact strings and numbers, round-trip gate; manifest and view specs persisted. Not applicable: the « unless explicitly overridden » strokeStyle clause is not in r1 (V4 at r1:102; authors write no arrows, r1:324). Not taken: AR's profileRefs order (generic@2 first) contradicts EV:147 | §5.4, §5.6, §6, §7 |
| m-1 citations | The four quoted targets verified and kept: ds presentation-validate.ts:491-492 is the form-selector refusal; diagram-registry.ts:81-104 `baseRecord`, :209-278 `profilePayload` and `envelopeOf`; PROTO:135-148 `detailItems`, :185-200 `fitItems`; diagram-registry.ts:349-360 qualified payload and envelope. Refreshed: ENG pin f7e9914c, DS `origin/main` bbf8b390, fold.ts :774-775, measure.ts :104-114, :116-127, `envelopeOf` instances :317-335, revision link :369-372 | Authority, §2.5, §3.8, §3.9, §4 |
| m-2 stale PROF comment | Known, no change: PROF:3 says « except actor/repo », PROF:18-20 require `role` on repo; the spec follows the code | — |
| m-3 fitItems edge case | Stated: untruncated emission, one `card-overflow` | §3.3 |
| m-4 TOGGLE_ALLOCATION 66 | Known, no change: noted in the authority table and §4; the §3.9 clamp also holds at 66 (428 − 66 = 362 ≥ 290; 460 − 66 = 394 ≥ 314) | Authority, §4 |

## Conductor decisions after review round 2 (2026-11-07)

Review round 2 (Argon) verdict: SOLID. Round-1 ledger: 12 FIXED, 1 DISPUTED-ACCEPTED. New findings: 2 MINOR. Both MINORs are decided by the conductor and folded in as follows:

- **m-r2-1.** The card/zone rendering, measurement and icon contracts (Authority, §1, §3.2, §3.9) name the published `@sentropic/design-system-svelte@0.37.0` subpaths `./diagram-render` and `./diagram-icons` (tag `svelte-v0.37.0`, commit `bbf8b390`).
  - Lot 1 re-checks `TOGGLE_ALLOCATION` against `measure.ts` at that commit, and records the `./diagram-render` `text.title` fallback in §3.2.
  - The §4 `ds:` pin for `@sentropic/diagram-core` keeps its commit + SHA-256 form.
- **m-r2-2.** Lot 4 widens the `sortDiagnostics` parameter type in `src/ontology-guardian/diagnostics.ts` so that it accepts `ArchiDsDiagnostic`. A failing type test comes first.
