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
| DS, `ds:`, `dsc:` | sent-tech-design-system 7c5a8c82bf2abc71bf0963e3fcfc395c48fcf6af, the pin of §4; e3bc10cc is its ancestor. `ds:` = `packages/diagram-core/src/`, `dsc:` = `packages/diagram-canvas/`. The local `origin/main` is now bbf8b390d1704756cc43b433f31d0a43ea2a4792, a descendant with `packages/diagram-core/src` unchanged; it moves `dsc:src/layout/measure.ts` `TOGGLE_ALLOCATION` from 32 (:31) to 66 (:34 at `bbf8b390`, commit 4571054d) (AR m-4, known, §4). |
| DSR | `@sentropic/design-system-svelte@0.37.0` at DS tag `svelte-v0.37.0`, commit bbf8b390 (`packages/components-svelte/package.json:2-3`): subpaths `./diagram-render` (:35) and `./diagram-icons` (:30); card/zone model `packages/components-svelte/src/lib/diagramCardModel.ts`. |
| H2A | h2a `origin/main` 65b65d6bff6f3c15d5e80277d8a70287d4b915dd: `packages/h2a/src/hosts/plugin.ts:85-152` declares `H2A_HOST_PLUGIN_TARGETS`, eight hosts, mechanisms at :89, :96, :103, :110, :117, :124, :131, :146. HD's pin db485795 is an ancestor; `packages/h2a/src/hosts/` is identical at both. |
| HD, HF, KR7 | Hosts delta h2a working note `joint-r3-hosts-delta.md`, SHA-256 c563ef384194484ed3ba48493e48cce7776dbafa21573fab53f9646be90797da (binding); its facts h2a working note `memory-dossier/kit/architecture-r7c/host-facts.json`; its encoding in that kit (`joint-profile.mjs`, `joint-proto.mjs`, `joint-fixtures.mjs`), branched from the r1 prototype: no J1-J4 closure, no stored run. |
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
| DS | Native validation, fold projection, layout, measurement execution, rendering (DSR `./diagram-render`, `./diagram-icons`), executor bindings, packaged presentation catalog | Kind, slot, footer or label semantics |
| Focus | Stores one binding Pin, verifies, renders, folds | Writes or corrects a face, label, tint or summary (passing `text.title ?? name` to `./diagram-render`, §3.2, applies the DS canvas rule at render time to the accepted document; the stored face, and the `archi-slot-drift` comparison, keep the accepted bytes); reuses another fold state's summaries; derives a kicker from the parent zone or a footer from the root zone; truncates, ellipsises or widens (PJ §8) |

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

[FACT] PE §3.1 qualifies each kind for C4 and Backstage (PE:53-67), SERVICE requalified by J5 (PJ:53): D direct, C conditional, P lossy, ∅ absent, U `unverified`; the ArchiMate column is P-6's (« P-6 — the ArchiMate mapping (engram-owned) » §1). [JUDGMENT] These are local projections, never a conformance claim.

| Kind | C4 | Backstage | ArchiMate |
|---|---|---|---|
| actor | Person: C (human, team); U (agent) | User, Group: D; agent: ∅ | business-actor (all 5 pairs): P (element type many-to-one, restored by `archi-kind` / `archi-form`, P-6) |
| system | Software system: C | System: D | grouping: P (element type many-to-one, restored by `archi-kind` / `archi-form`, P-6) |
| repo | ∅ | ∅ (source location is an annotation) | grouping (was ∅): P (element type many-to-one, restored by `archi-kind` / `archi-form`, P-6) |
| package | ∅ | Component, type library: C | artifact: P (element type many-to-one, restored by `archi-kind` / `archi-form`, P-6) |
| component | Component: P (inside one container, projected through executedBy) | Component + subcomponentOf: C | application-component: P (element type many-to-one, restored by `archi-kind` / `archi-form`, P-6) |
| runtime | Container (application): C | Component, free type: C | application-component (system-software is not used): P (element type many-to-one, restored by `archi-kind` / `archi-form`, P-6) |
| service | container instance in a deployment node, deployment view: C | Component type service describes the software, not the instance: reached through the delivering package (deployedAs), losing runsOn, operatedBy, address and instance status: C, P | application-component (was application-service: U; the instance versus software distinction is lost natively, `EXP:203`): P (element type many-to-one, restored by `archi-kind` / `archi-form`, P-6) |
| api | ∅, carried by relations: U | API: D | application-interface: P (element type many-to-one, restored by `archi-kind` / `archi-form`, P-6) |
| store | Container (data store): C | Resource: C | data-object: P (element type many-to-one, restored by `archi-kind` / `archi-form`, P-6) |
| artifact | ∅ | ∅ | artifact: P (element type many-to-one, restored by `archi-kind` / `archi-form`, P-6) |
| host | Deployment node: C | Resource: P | device (workstation), node (cluster, cloud-project): P (element type many-to-one, restored by `archi-kind` / `archi-form`, P-6) |

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
| title | mark(shortName ?? name, status), stored when a shortName exists or status ≠ current; otherwise absent and the DS canvas reads `name` (DSM3:79; `dsc:src/layout/measured.ts:148`, `semanticName` :125-131; :150 at `bbf8b390`). `@sentropic/design-system-svelte@0.37.0/diagram-render` (tag `svelte-v0.37.0`, commit `bbf8b390`) exports `projectCardProps` and `projectZoneProps` (`packages/components-svelte/src/lib/diagram-render/index.ts:35-36`), defined in `packages/components-svelte/src/lib/diagramCardModel.ts:173-215` and `:1505-1550`. Both take a `CardPresentationInput` / `ZonePresentationInput`, structural subsets of `EntityPresentation` (:85-87, :1469-1470), without the semantic document, and resolve `(text.title ?? "") === ""` to `{ kind: "label" }`, a label node with no card or zone (:178-179, :1515-1516). A host calling `./diagram-render` therefore passes `text.title ?? entity.attributes.name.value` (the `semanticName` rule) before projection (m-r2-1) | same |
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

- [FACT] Line rule = the DS reference LineMeasurer (dsc:tests/layout/m1d-fixtures.ts:65-100; DSR `./diagram-render` `cardLineMeasurer`, `packages/components-svelte/src/lib/diagram-render/index.ts:42`, `diagramCardModel.ts:494-530`, `:564-590`): breaks at spaces only, greedy; a word wider than the line keeps a line of its own (:84); no character is cut (DSM3 §4.6.2).
- [FACT] Each resulting line is measured with the KIT metrics: width(s) = Σ widths[metric][c] × size + 2, unknown glyph 0.7 (KIT `src/architecture-layout.js:33-35`); kicker uppercased (`toLocaleUpperCase(language)`), body metric 22 px plus 0.04 em per glyph (KIT `src/hrpolnav-card.js:32`); title 32 px title metric; body, detail, subtitle 24 px body; footer 24 px title (PROTO:158-161).
- More lines than allocated, or any line wider than its width → `card-overflow` (card) or `zone-overflow` (zone, measured folded **and** expanded) (EV:196-198). [JUDGMENT] The DS emits these names as layout warnings (DSM3:711); engram's acceptance makes them refusals.
- [JUDGMENT] Allocation (px × lines) = the KIT table of PJ A.2, clamped to the DS layout so that an accepted line never wraps differently there. The clamp is a stated change against PJ A.2 and PROTO:164-168 (AR B-2): card body and detail 430 → 428, card and folded-zone footers 434 → 428. [FACT] The DS lays a 460 px card out at `innerWidthOf(460)` = 460 − 2 × 16 = 428 (dsc:src/layout/measure.ts:16, :21, :116-119; dsc:src/layout/measured.ts:826-835, :1053-1063), reduces headers with a fold control by `TOGGLE_ALLOCATION`: 32 at 7c5a8c82 (measure.ts:31; `headerAvailableWidth` :125-127), 66 at tag `svelte-v0.37.0` / commit `bbf8b390` (measure.ts:34; `headerAvailableWidth` :128-130; changed by 4571054d), equal to `CARD_GEOMETRY.toggleAllocation` (`packages/components-svelte/src/lib/diagramCardModel.ts:57` at `bbf8b390`). The clamp holds at both values: 428 − 66 = 362 ≥ 290 folded, 460 − 66 = 394 ≥ 314 expanded at smallest frame 492 (m-r2-1). It also allocates at most kicker 1, title 2, body 4, detail 3, footer 1, subtitle 2 lines (measure.ts:104-114).

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

- [JUDGMENT] Under Owner decision C (2026-11-07, `P2-PARTITION-NOTE.r3.md:34-39`, key `P2`), between the two candidate designs — (a) the strict annotated Mermaid (`.mmd`) file itself (`engram.archi-mermaid/1`, orientation B2) at one fixed repository path vs. (b) keeping `.engram/architecture/manifest.json` with a `text` pointer field — **design (a) is selected** (`P2:45-48, 627`).
  1. [FACT] In `engram.archi-mermaid/1`, the `head` production (`P2:63-75, 165-174`) already carries every `ArchiManifest` datum (`language`, `owning-repo`, `pin profile`, `pin cards`, `pin view-schema`), and `parseArchiMermaid` in `src/archi-mermaid/index.ts` (`MMD`, baseline `origin/main` `1b5e81eb`) already synthesizes the complete `ArchiSourceTriple` `{ manifest, document, views }` in memory (`MMD:79-83, 2776-2804`) with `DEFAULT_SUBJECT_REF = ".engram/architecture/architecture.mmd"` (`MMD:99`).
  2. [JUDGMENT] Design (a) requires zero new fields on `ArchiManifest` (`src/ontology-guardian/archi-check.ts:55-64` (`CHK`), `src/ontology-guardian/archi-shapes.ts:562-571` (`SHP`)), keeps a single fixed discovery path in engram's project directory (ENG `src/project-config.ts:49-53`), and enables end-to-end ingestion from a repository holding only a `.mmd` file.
- [JUDGMENT] Discovery contract:
  - Constant `ARCHI_MMD_PATH = ".engram/architecture/architecture.mmd"` (`proposed`, exported by `src/ontology-guardian/archi-shapes.ts` (`SHP`) alongside `ARCHI_MANIFEST_PATH` at `SHP:25`).
  - No search, glob, legacy `.graphify/` candidate (`src/project-config.ts:57-61`) or working-tree read: for a 40-hex reachable commit, Stage 1 reads committed bytes exclusively via `git show <commit>:.engram/architecture/architecture.mmd` (`src/ontology-guardian/archi-ingest.ts:1042-1060` (`ING`)).
  - During the T3 transition (see « Owner decision C (07/11) and the D1 gates »), if `ARCHI_MMD_PATH` is absent (`null | undefined`), Stage 1 falls back to `ARCHI_MANIFEST_PATH` (`<owning repo>/.engram/architecture/manifest.json`, where every other file is named by the manifest); if a repository holds both files during T3, Stage 1 ingests from `ARCHI_MMD_PATH` only and `.engram/architecture/manifest.json` is ignored. When both are absent, Stage 1 refuses with `archi-manifest-missing` (`ING:311-323`, `P2:47`).

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
  readonly layout?: ArchiLayoutHints;         // optional M11–M12 layout hints (VW:86-115, P2:343-344, 629)
}
```

[JUDGMENT] References (AR M-1). Every authored string naming a record is its full ref as stored in the document: `owningRepo`, `draw`, `collapsed`, `legend.legendRef` and `legend.order` are EntityRefs `entity:<local>`, `viewId` is `view:<local>` (the DS ref carries its namespace, ds:refs.ts:22-24); a bare local id refuses (`archi-input-invalid`). `<local>` follows §5.6. Derived ids are never authored (PROTO:253-254, :302): entity occurrence `occurrence:o-<local>`, relation occurrence `occurrence:e-<local of the relation>`, fold group `grp.<n>.o-<local>` with n the length of `o-<local>` (ds:fold.ts:172-176), summary `summary:s<k>` (§3.8). Manifest paths are repo-relative POSIX paths without empty, `.` or `..` segments.

[JUDGMENT] Authors never write occurrences, groups, arrows, faces or digests. `buildArchiSourceView(document, spec)` (`proposed`, pure; PROTO:269-308) derives the retained source view: those derived ids, `group` of the nearest drawn ancestor in the active tree, a fold group per drawn container, an arrow for every arrow-encoded relation whose two ends are drawn, strokeStyle from lifecycle, placeholder geometry that DS layout replaces (DSM3:505), and the legend block as governed tint input. V1-V5 still run on the derived view and on every view Focus displays. The closed shapes are governed as `engram:archi-manifest/1`, `engram:archi-view/1` and `engram:archi-acceptance/1` (`proposed`), checked by hand-written guards with no runtime dependency (VS2:91).

- [FACT] Derived manifest paths from `.mmd`: `parseArchiMermaid` sets `manifest.format = "engram.archi-manifest/1"`, `manifest.document = "document.json"`, and `manifest.views` to the ascending list of `"view-specs/<view local>.json"` (`MMD:2772-2785`), matching all three merged fixture manifests (`tests/fixtures/archi/joint-r2/manifest.json:5-11`, `joint-r2-teintes/manifest.json:5-8`, `hosts-r3/manifest.json:5-9`) and the §5.4 acceptance directory layout (`ING:700-701, 740`).
- [FACT] All three fixture manifests already declare `cardsPin` (`tests/fixtures/archi/joint-r2/manifest.json:24-28`, `joint-r2-teintes/manifest.json:26-30`, `hosts-r3/manifest.json:22-26`), and `checkArchiManifestShape` requires `cardsPin` (`SHP:569, 593-597, 672-675`). [JUDGMENT] A committed `.mmd` source must therefore include `%% @dl pin cards <id> <version> <digest>` (`P2:173`, `MMD:2057-2061`); omitting it yields `parsed.value.manifest.cardsPin === undefined` (`MMD:2783`), which Stage 1 refuses with `archi-manifest-invalid` at `/cardsPin` (`SHP:596`).
- [FACT] `src/ontology-guardian/archi-view.ts:86-115` (`VW`) and `MMD:10-15, 1927-1960` already define `ArchiLayoutGroup`, `ArchiLayoutHints`, and `ArchiViewSpec.layout?: ArchiLayoutHints` (`P2:343, 629`), whereas `VIEW_SPEC_ALLOWED_KEYS` in `SHP:686-693` currently omits `"layout"`.
- [JUDGMENT] Amend `checkArchiViewSpecShape` (`SHP:686-867`) to allow optional `"layout"` in `VIEW_SPEC_ALLOWED_KEYS` and enforce M11–M12 (`P2:343-344`): non-empty plain object; optional `stretch` (`boolean`); optional `cardGapX`, `cardGapY`, `zoneGapX`, `zoneGapY`, `rankGap` (safe integers $\ge 0$); optional non-empty `ordering` record mapping `entity:<local>` keys to `entity:<local>[]` without duplicate children; optional non-empty `grouping` array of closed `ArchiLayoutGroup` trees (`id` matching `LOCAL`, `direction` in `"rows" | "columns"`, optional `stretch` boolean, optional `gapAfter` integer $\ge 0$, `items` mixing `entity:<local>` refs and subgroups with unique group `id`s per view and no duplicate direct entity refs). Any violation emits `archi-input-invalid` at its RFC 6901 pointer.

### 5.3 Acceptance sequence (atomic, fail closed)

`ingestArchitecture({ repository, commit }, { readAt, ds, write })` (`proposed`; ports injected, I-4). Stages run in order; every diagnostic of a failing stage is reported and later stages do not run; a refusal registers nothing (G0:217).

1. **Source.** Commit grammar and reachability (`ING:280-291`). When `ports.readAt(input.commit, ARCHI_MMD_PATH)` returns committed bytes (`rawMmd !== null && rawMmd !== undefined`), Stage 1 (`"source"`) executes in three steps inside scope `mmdScope = "file:.engram/architecture/architecture.mmd"` (`ING:272-452`): (a) **UTF-8 decode and `textDigest` preimage:** obtain `rawBytes: Uint8Array` (if `rawMmd` is a `string`, rejected first if it starts with `U+FEFF` or contains a lone surrogate, then UTF-8 encoded; if `Uint8Array`, decoded with `new TextDecoder("utf-8", { fatal: true })`), compute `textDigest = sha256BytesHex(rawBytes)` (`ING:215-217`, 64 lowercase hex chars), and if `rawBytes` starts with UTF-8 BOM (`0xEF 0xBB 0xBF`) or fails fatal UTF-8 decoding, refuse at stage `"source"`, scope `mmdScope`, with `mermaid-strict-invalid` (`path: "/0"`, `subjectRef: ARCHI_MMD_PATH`, `P2:530`) and register nothing; (b) **Strict Mermaid parse and canonical check:** invoke `const parsed = parseArchiMermaid(text, { checkCanonical: true, subjectRef: ARCHI_MMD_PATH })` (`MMD:2853-2867`), which verifies `printOrRefuse(triple) === text` and refuses any non-canonical formatting or ordering (K1–K12) with `mermaid-strict-noncanonical` (`MMD:2806-2837`, `P2:308, 538, 546`) — if `!parsed.ok`, add `...parsed.diagnostics` to `stage1Scopes` under `mmdScope` and return `makeRefusal("source", stage1Scopes)` (`ING:186-202`) without writing files or running Stages 2–8; (c) **Stage-1 triple invariants on `parsed.value`:** extract `{ manifest, document, views: viewSpecs } = parsed.value` (`MMD:79-83`) without secondary `ports.readAt` calls for `manifest.document` or `manifest.views`, and run the existing Stage-1 checks (`SHP:575-1055`): `checkArchiManifestShape(manifest, ARCHI_MMD_PATH)` (under `mmdScope`), `checkArchiDocumentInvariants(document, ARCHI_MMD_PATH)` (under `mmdScope`), `checkArchiViewSpecShape(spec, spec.viewId)` (under `spec.viewId`), and `checkArchiStage1CrossRefs(manifest, document, viewSpecs)`, refusing at stage `"source"` on any diagnostic while Stages 2–8 (`ING:455-841`) consume `(manifest, doc, viewSpecs)` and run unchanged (`P2:546`). During the T3 fallback when `ARCHI_MMD_PATH` is absent, manifest, document and view bytes at the commit → `archi-source-unresolved` (or `archi-manifest-missing` if `ARCHI_MANIFEST_PATH` is also absent). Each I-JSON committed file is read as I-JSON (RFC 7493) by a strict reader (`proposed`; `JSON.parse` keeps the last duplicate silently): duplicate member names, lone surrogates and non-finite numbers refuse; for the I-JSON committed files, raw bytes are never hashed (whereas for `.mmd` sources only canonical texts `fmt(t) = t` are accepted, making `textDigest` over `rawBytes` a function of the triple, `P2:545`). Manifest and view specs: closed shape → `archi-manifest-invalid`, `archi-input-invalid` (bare or unknown ref, non-archi entity in `draw`, non-container in `collapsed`, owningRepo not a repo). Document: `checkSemanticShape` (ENG `diagram-document-shape.ts:56-59`) → `archi-input-invalid` with the returned path. All three: the §5.6 discipline → `archi-input-invalid`.
2. **Pins.** archi@1, generic@2, archi-cards@1, diagram-view-schema@2 resolve by exact Pin, never latest (G0:83): unknown → `incompatible_version`, digest → `digest-mismatch` (G0:226-227); profilePins ≠ document.profileRefs, or generic@2 records without its pin → `archi-pin-mismatch`.
3. **Executor.** The DS port must be the pinned build-time copy of diagram-core at `DS_COMMIT` (G0:66), its adapter and renderer entry bytes hashing to the pinned values; otherwise `archi-executor-unavailable`. Then `validateProfile`, `verifyExecutorBindings`, `validateDocument`; native codes pass through (§5.5).
4. **Document.** `checkArchi` (A1-A4, A6).
5. **Views.** Per view: `buildArchiSourceView`, `projectArchiCards`, `checkGovernedViewShape("2")` (ENG `diagram-view-shape.ts:142-146`), `validateView`, `validateDiagramPresentation`, `checkArchiView`.
6. **Fold states.** Per view, the stored default, all expanded, all drawn containers collapsed, and each single toggle of one container from the default (3 + C states): `archiSummaries`, `projectView`, `validateView`, `validateDiagramPresentation`, `checkArchiView` with V5. [JUDGMENT] Linear, deterministic coverage; the corpus proves every state of its views (§6), and Focus re-checks each displayed state before drawing it.
7. **Versioning.** When `r<revision>` exists, every file but `acceptance.json` is recomputed and compared byte for byte: all equal → the stored record is returned and nothing is written (its `source.commit` stays the first accepting commit); any difference → `archi-revision-conflict`.
8. **Record.** Otherwise the §5.4 directory is written through `write`, which publishes all files or none (a sibling temporary directory, then one rename).

### 5.4 Canonical bytes, versioning and the acceptance record

- [JUDGMENT] Canonical form (normative, AR B-3). Every digest of this document — archi@1 contentDigest (P-CONTENT-DIAGRAM, G0:1030), archi-cards@1 contentDigest (§3.1), documentPin, viewPin, bindingPin, and the `files` digests — is `digestOfPreimage(value)`, SHA-256 over `canonicalBytes(value)`, the RFC 8785 (JCS) form (ENG `canonical.ts:59-72`): sorted keys, no insignificant whitespace, RFC 8785 numbers, arrays in their stated order (G0:929-931; §5.6). Every persisted record is exactly `canonicalBytes(value)` in UTF-8, without BOM or trailing newline (G0:1067). A pin covers the parsed value, never a git blob: two repos that pretty-print the same description differently get the same pins (canonical JSON remains the pinned identity under Gate P-1 (i), while `.mmd`-ingested acceptances additionally pin `textDigest` over the canonical `.mmd` bytes, `P2:545`).
- documentPin = {id: documentId, version: String(revision), contentDigest: digestOfPreimage(document)}. Bytes under (id, version) never change (G0:207): an edited description raises `revision`.
- viewPin = {id: viewId, version: String(revision), contentDigest: digestOfPreimage(the derived source view with its projected presentation)}; bindingPin = {id: `binding:<view local>`, version: String(revision), contentDigest: digestOfPreimage(binding)} (`proposed`).
- `ArchiViewBinding` (`proposed`, closed, an engram output, one per view; PJ A.4): viewId, activeHierarchy, language, documentPin, viewPin, profilePins, semanticCategoryPins ([] or [generic@2]), legendRef?, viewSchemaPin, cardsPin, presentationContractPin, dsCommit.
- `ArchiAcceptance` (`proposed`, closed): format `engram.archi-acceptance/1`, source {repository, commit, manifestPath}, language, owningRepo, documentPin, optional `textDigest` (`proposed`: 64-hex SHA-256 of committed `.mmd` bytes alongside `documentPin`, Gate P-1 (i), `P2:545`), profilePins, cardsPin, viewSchemaPin, bindings (binding pins ascending by id), files (every other file of its directory with its digest, ascending by path). Directory `<engram output root>/architecture/<document local id>/r<revision>/`, derived, regenerated, never hand-edited (I-6, G0:79):

```ts
export interface ArchiAcceptanceSource {
  readonly repository: string;
  readonly commit: string;
  readonly manifestPath:
    | ".engram/architecture/architecture.mmd"   // proposed (B2 primary)
    | ".engram/architecture/manifest.json";     // T3 transition fallback
}

export interface ArchiAcceptance {
  readonly format: "engram.archi-acceptance/1";
  readonly source: ArchiAcceptanceSource;
  readonly language: ArchiLanguage;
  readonly owningRepo: string;
  readonly documentPin: Pin;
  readonly textDigest?: string;                 // proposed: 64-hex SHA-256 of committed .mmd bytes
  readonly profilePins: readonly Pin[];
  readonly cardsPin: Pin;
  readonly viewSchemaPin: Pin;
  readonly bindings: readonly Pin[];
  readonly files: readonly ArchiAcceptanceFileEntry[];
}
```

- **Pinning and guard rules (`checkArchiAcceptanceShape`, `SHP:1134-1210`):**
  1. Add `"textDigest"` to `ACCEPTANCE_ALLOWED_KEYS` (`SHP:1134-1145`), and move the required-keys iteration at `SHP:1158-1160` to a `REQUIRED_ACCEPTANCE_KEYS` subset that excludes `"textDigest"`, whose requirement is conditional on `source.manifestPath` per rule 2.
  2. When `source.manifestPath === ARCHI_MMD_PATH`, `textDigest` is **required** and must match `DIGEST_HEX_RE` (`^[0-9a-f]{64}$`, `SHP:29`); when `source.manifestPath === ARCHI_MANIFEST_PATH` (T3 fallback), `textDigest` must be absent (`undefined`). Any violation returns `"/source/manifestPath"` or `"/textDigest"`.
  3. The persisted directory `<engram output root>/architecture/<document local id>/r<revision>/` keeps the exact 6-slot JSON table below (`manifest.json`, `document.json`, `view-specs/<view local>.json`, `views/<view local>.json`, `bindings/<view local>.json`, `acceptance.json`), each written as RFC 8785 `canonicalBytes(value)` (`ING:699-740, 826-830`).
- **Idempotence and digest stability (§5.3 stage 7, `ING:742-779`):** Because Stage 1 enforces `checkCanonical: true` (`fmt(t) = t`) and `parseArchiMermaid` / `printArchiMermaid` form a bijection on the print domain $M$ (`P2:554`), identical `.mmd` text bytes always parse to identical `(manifest, document, viewSpecs)` values and produce identical `textDigest`, `documentPin`, `viewPin`, `bindingPin`, and `files` digests. In Stage 7, when `r<revision>` already exists (`ING:743-770`), `ingestArchitecture` compares all non-acceptance files byte-for-byte (`sameBytes`) and checks that if both `storedAcc.textDigest` and the new `textDigest` are defined, `storedAcc.textDigest === textDigest`. When equal, Stage 7 returns `{ outcome: "accepted", idempotent: true, acceptance: storedAcc, ... }` without writing (`ING:761-769`, preserving the first accepting `source.commit`). Any difference refuses at stage `"versioning"` with `archi-revision-conflict` (`ING:772-778`).

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
| source | `archi-manifest-missing`, `archi-manifest-invalid`, `archi-input-invalid`, `archi-source-unresolved`; `.mmd` parse & canonical check (9 codes, `path: "/<lineIndex>"`, `subjectRef: ".engram/architecture/architecture.mmd"`, `scope: "file:.engram/architecture/architecture.mmd"`): `mermaid-strict-invalid`, `mermaid-strict-unsupported`, `mermaid-strict-annotation-unknown`, `mermaid-strict-duplicate`, `mermaid-strict-duplicate-datum`, `mermaid-strict-orphan-ref`, `mermaid-strict-placement-drift`, `mermaid-strict-style-drift`, `mermaid-strict-noncanonical` |
| codec print mode | `mermaid-strict-unrepresentable` (`MMD:47, 2874-2885`, covered by the merged G-T4 negatives in `tests/archi-mermaid-codec.test.ts:738, 1171`) |
| pins | `incompatible_version`, `digest-mismatch` (G0 names, engram origin); `archi-pin-mismatch` |
| executor | `archi-executor-unavailable` |
| document | `archi-source-conflict`, `archi-footer-missing`, `archi-single-writer`, `archi-execution-unbound`, `archi-edge-verb` |
| projection | `archi-slot-missing`, `archi-detail-missing`, `archi-category-unbound`, `card-overflow`, `zone-overflow` (DSM3:711 names, refusals here) |
| view, fold state | `archi-occurrence-duplicate`, `archi-zone-mismatch`, `archi-edge-policy`, `archi-stroke-status`, `archi-summary-missing` |
| Focus verification | `archi-slot-drift` (recomputed faces, tint tables or summaries ≠ received bytes); `archi-pin-mismatch` (a binding pin ≠ resolved bytes) |
| versioning | `archi-revision-conflict` |
| carrier (P-4 API, outside ingestion) | `carrier-digest-mismatch`, `export-stale` |
| ArchiMate mapping (P-6 API, outside ingestion) | `archimate-kind-missing` (plus `archi-input-invalid` on malformed mapping inputs) |

Totals: **38 codes** in `ARCHI_DIAGNOSTIC_CODES` (`CHK:12-50`, comments at `CHK:11, 52` updated from `37-code` to `38-code`) and `ARCHI_CODE_SET` (`SHP:40, 1283`, derived automatically from `ARCHI_DIAGNOSTIC_CODES`), all origin engram — Lot 6 appends `"carrier-digest-mismatch"` and `"export-stale"` after `"archi-revision-conflict"` (`CHK:47`), in the order of `ARCHI_CARRIER_DIAGNOSTIC_CODES` (raising the Lot 5 total from 35 to 37 codes), and Lot 7 appends `"archimate-kind-missing"` (`ARCHI_ARCHIMATE_DIAGNOSTIC_CODES`, `EXP:204`, `P2:617`) after `"export-stale"` (`CHK:49`), raising the total from **37 to 38 codes**: 21 `archi-*`, 10 `mermaid-strict-*` (`ARCHI_MERMAID_DIAGNOSTIC_CODES` at `MMD:37-48`, already in the `ArchiDiagnosticCode` union at `CHK:41-52`; `P2:528-541, 634`), 2 carrier/export (`ARCHI_CARRIER_DIAGNOSTIC_CODES`: `carrier-digest-mismatch`, `export-stale`), 1 ArchiMate mapping (`ARCHI_ARCHIMATE_DIAGNOSTIC_CODES`: `archimate-kind-missing`), 2 DS layout (`card-overflow`, `zone-overflow`), and 2 G0 (`incompatible_version`, `digest-mismatch`); DS native codes pass through in the DS arm under their own inventory.

| Code | Owner | Deciding inputs and trigger |
|---|---|---|
| `carrier-missing` | **P-3 (DS)** | [JUDGMENT] Host document only: the host carrier slot (`<metadata>`, draw.io root cell `id="0"`, `.drawio.png` `mxfile` chunk, PlantUML line-comment run, ArchiMate property) is absent or empty (`P2:593, 601`). Engram never parses host documents; passing `""` to `decodeArchiCarrier` yields `mermaid-strict-invalid`. |
| `carrier-visible-drift` | **P-3 (DS)** | [JUDGMENT] Host document + DS render at pinned `DS_COMMIT`: the visible SVG or PlantUML body differs from the deterministic projection of `(text, view, collapsed)` (`P2:580, 593, 610`). Requires DS rendering, so P-3 owns it. |
| `carrier-digest-mismatch` | **engram (P-4)** | `proposed`. Frame only: `sha256(payload) !== header.sha256` in `decodeArchiCarrier` or `checkArchiCarrier` (`path: "/0"`, `origin: "engram"`, `severity: "error"`). |
| `export-stale` | **engram (P-4)** | `proposed`. Frame + committed `.mmd` text (`P2:555, 593`): `decoded.sha256 !== sha256(committedText)` in `checkArchiCarrier` (`path: "/0"`, `origin: "engram"`, `severity: "error"`). |
| `archimate-kind-missing` | **engram (P-6)** | `proposed`. Reverse ArchiMate element/property mapping (`archiEntityTypeOfArchimate`, `archiAttributesOfArchimate`): an element of one of the 8 mapped ArchiMate types has `properties["archi-kind"]` absent or `""` (`path: "/properties/archi-kind"`, `origin: "engram"`, `severity: "error"`, `EXP:204`, `P2:617`). |
| `archimate-edit-unsupported` | **P-3 (DS)** | [JUDGMENT] Host ArchiMate document on edit-subset import: an edit outside the supported subset (rename, documentation, property value, `P2:617`, `P2-O5`). Owned and enumerated by P-3 (`P2:646`). |

- **Supersessions (`[JUDGMENT]`):** P-4 supersedes `P2:541` (« Export and carrier codes belong to P-3 ») and `P2:593` (« (P-3, PLAN:205) ») for `carrier-digest-mismatch` and `export-stale`, which engram decides from the frame and committed text alone, and `P2:555`'s single ArchiMate model-level property, when $k > 1$ (see « P-4 — the archi carrier (engram.archi-carrier/1) », §6 item 6).
- **Extended `mermaid-strict-*` triggers (`P2:528-539`, `proposed`):**

| Code | New carrier trigger |
|---|---|
| `mermaid-strict-invalid` | malformed carrier header, bad input shape, or disallowed frame char (`U+FFFE`/`U+FFFF` on decode) |
| `mermaid-strict-unsupported` | carrier header version `INT ≠ 1` |
| `mermaid-strict-annotation-unknown` | header `text=` other than `engram.archi-mermaid/1` |
| `mermaid-strict-orphan-ref`; `mermaid-strict-duplicate`, `mermaid-strict-noncanonical` | `-orphan-ref`: on `view` / `view=` and on `collapsed` / `collapsed=`; `-duplicate` and `-noncanonical`: on `collapsed` / `collapsed=` |
| `mermaid-strict-unrepresentable` | `encodeArchiCarrier` input `text` holding `U+FFFE` or `U+FFFF` |

### 5.6 Canonical JSON and serialization invariants (AR M-5)

[JUDGMENT] The accepted record is canonical JSON (§5.4). A bijective text serialization and deterministic exports stay possible on top of it because these invariants hold, each checked at stage 1 (`archi-input-invalid`, with its pointer) or true by construction. The text format itself is a separate owner objective (§8 O11).
1. **Source = the authored triple.** Manifest, SemanticDocument and view specs are the only source, all persisted (§5.4). Views, faces, summaries, measures, bindings, pins and the acceptance are functions of the triple and the pins: recomputed, never parsed back. A serializer round-trips the triple; an export reads accepted canonical bytes only.
2. **Stable ids.** Every authored record carries an authored local id matching `^[a-z][a-z0-9-]*$`, at most 40 characters (the key grammar of ENG `diagram-view-shape.ts:56`, a subset of ds:refs.ts:57, safe in DS dotted paths, RFC 6901 pointers and file names), unique per namespace, never positional and never computed from content: editing a name, role or label keeps the id. Derived ids are pure functions of authored ids (§5.2).
3. **Total order.** Object members follow RFC 8785 (UTF-16 code units). Every array has a stated order (G0:931): semantic, kept as authored — `profileRefs` = `profilePins`, `legend.order`, collection items such as `evidence`; or a set, ascending by UTF-16 code units and without duplicates — manifest `views`, `draw`, `collapsed`, `legend.tokens` (by category) — and relation `endpoints` in declared role order. An out-of-order or duplicated set refuses, so equal content always has equal bytes.
4. **No derived data in the source.** The triple holds no face, kicker, title fallback, detail, footer, icon, categoryRef, occurrence, group, arrow, strokeStyle, summary, measure or own digest, and no denormalized copy of a relation (an effective repo, a writer list); the closed shapes refuse such fields (`attribute-not-in-schema` natively, as for `facts`, EV:117).
5. **Exact strings and numbers.** Strings are well-formed Unicode (ENG `canonical.ts:11-22`), NFC, and hold no control character (U+0000–U+001F, U+007F–U+009F): every archi text is single-line, the line rule breaking at spaces only. Numbers in the triple are integers (`canonical.ts:29`). Duplicate member names refuse (§5.3).
6. **Lossless round trip is the acceptance gate.** A text serialization T is admissible only when canonicalBytes(parse_T(format_T(S))) = canonicalBytes(S) for every corpus triple S, and format_T(parse_T(t)) = t for every canonical text t. An export is admissible only as a pure function of accepted canonical bytes and pins (two runs, equal bytes) that declares what it drops, like §2.8; an export is never re-imported as a source. Lot 4 lands the gate with T = canonical JSON itself, so a later format plugs into an existing test.
   - [JUDGMENT] An export is never ingested as a source:
     - `decodeArchiCarrier` returns the canonical $t$ of a commit, with its `sha256` verified.
     - An edit-subset change in draw.io or ArchiMate (P-3, `P2-O5`, `P2:598, 617, 646`) yields a new `ArchiSourceTriple`, printed to canonical text by `printArchiMermaid`.
     - That printed text is proposed as a commit to the owning repository's `.engram/architecture/architecture.mmd`, and stage 1 ingests the commit like any other authored text (§5.4).

## 6. Test plan (test-first, file-level)

[FACT] Engram's diagram tests qualify data, shapes and migrations only; native validation, projection and layout stay DS evidence (ENG `tests/ontology-guardian-diagram-acceptance.test.ts:1-2`). [JUDGMENT] Two tiers follow. **E** runs engram code only and always runs. **DS** needs the executor at `DS_COMMIT`, built by `tests/helpers/ds-executor.ts` (`proposed`) from git objects of the local DS clone (never a working tree), transpiled with the repo's TypeScript (devDependency ^6.0.3); it skips with a visible reason when the clone is absent, never fake-passes (pattern `pinned-adapter.test.ts:48-59`, `:260-273`). The DS owner replays the same corpus as qualification evidence (§8 O1).

### 6.1 Files

| File (`proposed` unless existing) | Tier | Content and expected result |
|---|---|---|
| `tests/fixtures/archi/joint-r2/` | — | FIX ported as manifest, document (29 entities, 64 relations, EV:8), view specs roles, roles-replie, deploiement, h2a-repo and the tint witness; bare ids written as EntityRefs and sets sorted at port time (§5.6), so EV lines that print sets (EV:17, :45) compare as sets; provenance FIX ed17cb2c… |
| `tests/fixtures/archi/hosts-r3/` | — | HO = FIX plus the KR7 delta (`joint-fixtures.mjs:139-158`), built on the r2 baseline, never on KR7's r1-based prototype: 41 entities and 79 relations by construction (6 runtimes and 6 actors added; 9 relations removed, 24 added); views roles-hosts (`archi-dossier-hosts`, FIX roles plus host-poste and the eight CLIs, host-poste folded by default) and deploiement-hosts (`archi-deployment`, the eight CLIs drawn) (KR7:161-166); provenance HD c563ef38…, HF |
| `tests/fixtures/archi/{joint-r2,joint-r2-teintes,hosts-r3}/architecture.mmd` | — | Canonical `.mmd` files printed by `printArchiMermaid(S)` from each fixture triple $S$; `formatArchiMermaid(t, { check: true })` returns `ok: true` with `value === t` (G-T1), and `parseArchiMermaid(t)` reproduces each record's `canonicalBytes` byte-for-byte (G-T3, `P2:548-550`) |
| `tests/ontology-guardian-archi-profile.test.ts` | E, DS | declaration = PROF with `poll` (KR7 `joint-profile.mjs:44`); 11 kinds, 4 containers, 55 tuples, required-parent (EV:2, :6-7); deep-frozen; digest re-measured; DS `validateProfile`, `verifyExecutorBindings` `[]` (EV:3-4) |
| `tests/ontology-guardian-archi-checks.test.ts` | E, DS | document `null`/`[]`/`[]` (EV:9-11) for FIX and HO; N1-N5, N26; A1-A4 negatives of PE §7.4 |
| `tests/ontology-guardian-archi-cards.test.ts` | E | each FACE line of EV:22-39, :57-74, :83-90, :99-105, :164-185: face (form, icon, text, categoryRef) byte-equal, each measured width equal to 0.1 px, available widths from §3.9 (428 where EV prints 430 or 434); F2 (EV:108); F5 and closed kickers (EV:109-112); RJ2 (EV:140-145, the probe EV:145 re-asserted at 428); N13, N15, N20-N24, RJ4; HO faces (§2.7) |
| `tests/ontology-guardian-archi-views.test.ts` | E, DS | five views `[]` (EV:12-16…); N6-N11, N14, N14b, N16-N19, N25; RJ3 conservation and categoryRef (EV:186-187); HO views `[]` |
| `tests/ontology-guardian-archi-folds.test.ts` | DS | summaries EV:20-21, :48-56; N12; RJ1 T1-T3 and kept definitions → `archi-summary-missing` × 7 (EV:130-136); all 204 states; H1 summaries and every HO fold state |
| `tests/ontology-guardian-archi-metrics.test.ts` | E (+KIT) | §6.3 |
| `tests/ontology-guardian-archi-canonical.test.ts` | E | C1-C5, R1, E1 (§6.2); update `ARCHI_DIAGNOSTIC_CODES` inventory test (`CANON-T:216-244`) to 35 codes in Lot 5, to 37 codes in Lot 6 (with `"carrier-digest-mismatch"` and `"export-stale"` after `"archi-revision-conflict"`), and to **38 codes** in Lot 7 (updating test title at `:217` and length/set counts at `:219-220` to `38` adding `1 ArchiMate mapping`, adding `expect(ARCHI_DIAGNOSTIC_CODES.filter((c) => c.startsWith("archimate-"))).toEqual([...ARCHI_ARCHIMATE_DIAGNOSTIC_CODES])`, and updating `:236` to `expect(ARCHI_DIAGNOSTIC_CODES.slice(revConflictIdx + 1)).toEqual([...ARCHI_CARRIER_DIAGNOSTIC_CODES, ...ARCHI_ARCHIMATE_DIAGNOSTIC_CODES])`); extend `checkArchiAcceptanceShape` (`textDigest` and `REQUIRED_ACCEPTANCE_KEYS`) and `checkArchiViewSpecShape` (`layout` M11–M12) tests; run the §5.6.6 gate (`:556-588`) with $T = \text{engram.archi-mermaid/1}$ alongside canonical JSON |
| `tests/ontology-guardian-archi-ingest.test.ts` | E, DS | each §5.3 stage reaches its codes through a fake `readAt`; idempotence; `archi-revision-conflict`; executor hash mismatch; a failing `write` leaves no directory; M1–M3 (`.mmd`-only git e2e, 9 parse/check `mermaid-strict-*` refusals + invalid UTF-8, `textDigest` pinning & idempotence, §6.2) |
| `tests/ontology-guardian-archi-carrier.test.ts` (`proposed`, matched by `PKG:88` and `tsconfig.archi-types.json:13`) | E | C-T1..C-T8 (§6.2): corpus × views × fold states + order-flip round trip, refusals/order/locations/subjects, digest mismatch, stale export, N1–N5 slot survival & negative re-wraps, FIPS 180-4 SHA-256 KATs through the public API, 5,000-mutation totality, zero-dependency & drift guard |
| `tests/ontology-guardian-archi-archimate.test.ts` (`proposed`, matched by `PKG:88` and `tsconfig.archi-types.json:13`; regex literals of « P-6 — the ArchiMate mapping (engram-owned) » §3 tested directly since module regexes stay private) | E | A-T1..A-T4 (§6.2): totality and injectivity over the 3 corpus fixtures + closed 804-input relationship domain + 49 distinct view ids across 53 fold states, round trip of id/view id/element/relationship/23-property vocabulary, relationship validity against `MAT:14-132` `archimate-3.2` rules table (783 nominal + 21 `Association` fallbacks), refusals/envelope/recursive freeze/38-code drift guard |
| `tests/shared-provenance-chunk.test.ts` (existing) | E | Lot 6 updates `CHUNK-T:156-161` `@sentropic/engram/archi-mermaid` export list to `["ARCHI_CARRIER_DIAGNOSTIC_CODES", "ARCHI_MERMAID_DIAGNOSTIC_CODES", "checkArchiCarrier", "decodeArchiCarrier", "encodeArchiCarrier", "formatArchiMermaid", "parseArchiMermaid", "printArchiMermaid"]` while keeping `CHUNK-T:107-140` (`src/archi.ts`) unchanged; Lot 7 updates the `CHUNK-T:107-140` `@sentropic/engram/archi` sorted runtime export list from 32 to **46 names** by inserting `ARCHI_ARCHIMATE_DIAGNOSTIC_CODES`, `ARCHI_ARCHIMATE_ELEMENT_TABLE`, `ARCHI_ARCHIMATE_PROPERTIES`, `ARCHI_ARCHIMATE_RELATIONSHIP_TABLE` before `ARCHI_CARDS_CONTENT`; `archiAttributesOfArchimate`, `archiEntityTypeOfArchimate`, `archiRefOfArchimateId`, `archiRelationTypeOfArchimate` before `archiSummaries`; and `archiViewOfArchimateId`, `archimateElementOf`, `archimateIdOf`, `archimatePropertiesOf`, `archimateRelationshipOf`, `archimateViewIdOf` between `archiSummaries` and `assertValidArchiDiagnosticEnvelope`, while keeping `CHUNK-T:155-174` (`@sentropic/engram/archi-mermaid`) unchanged |
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
| `.mmd` ingestion, new (lot 5) | **M1 (DS e2e, `.mmd`-only git repo):** Commit only `.engram/architecture/architecture.mmd` (no JSON files in git) for `joint-r2` (`r0`), `joint-r2-teintes` (`r1`), and `hosts-r3` (`r2`); `ingestArchitecture` with `createGitReadAt` and `createAtomicArchiWriter` accepts each commit, writes all canonical JSON files, and passes `verifyArchiBinding` (`ING:859-1034`; e2e pattern `tests/ontology-guardian-archi-ingest.test.ts:628-812`). **M2 (E, parse & non-canonical refusals):** Reach all 9 parse/check `mermaid-strict-*` codes (plus invalid UTF-8 bytes) through `ingestArchitecture`; each returns `{ outcome: "refused", stage: "source", scopes: [{ scope: "file:.engram/architecture/architecture.mmd", diagnostics }] }`, passes `assertValidArchiDiagnosticEnvelope`, and leaves `writer.writeCount === 0`. **M3 (E & DS, `textDigest` pinning & idempotence):** Assert `acceptance.source.manifestPath === ARCHI_MMD_PATH`, `acceptance.textDigest === sha256(mmdBytes)`, and `documentPin` / `viewPin` / `bindingPin` / `files` equal to the JSON-ingested fixture (`C5` cross-format parity); re-ingesting unchanged `.mmd` at `COMMIT_1` or `COMMIT_2` returns `idempotent: true` with identical pins, preserves `COMMIT_1`, and performs zero writes (`R1`). Print-mode `mermaid-strict-unrepresentable` remains covered where it already lives in `tests/archi-mermaid-codec.test.ts:738, 1171`. |
| archi carrier, new (lot 6, P-4) | **C-T1 (Corpus × views × fold states + order-flip round trip):** Across all 3 corpus fixtures (`joint-r2` 4 views, `joint-r2-teintes` 1 view, `hosts-r3` 2 views = 7 views) and all $3 + C$ fold states per view (`ING:803-823`: default, expanded `[]` → `collapsed=-`, collapsed $D(v)$, and each single-container toggle = 53 states total), plus a synthetic pair `entity:sys-a1` and `entity:sys-a-b` whose model UTF-16 order (`["entity:sys-a-b", "entity:sys-a1"]`) and header EID byte order (`"e_sys_a1,e_sys_a_b"`) differ (`P2:327`), `decodeArchiCarrier(encodeArchiCarrier({ text: t, view, collapsed }).value)` returns `{ ok: true, value: { text: t, view, collapsed, sha256 } }` with `sha256 === sha256Hex(t)`. **C-T2 (Refusals, order, locations, subjects):** Every refusal path in « P-4 — the archi carrier (engram.archi-carrier/1) » §2: non-canonical `t` in encode and in decode (`mermaid-strict-noncanonical`, including two attribute lines with different names in one block, e.g. `role` and `lifecycle` of `e_svc_live` (`FX-J:31-32`): `mermaid-strict-noncanonical`, at `"/<i+1>"` in decode (`"/31"` on `FX-J`) and at `"/<i>"` in encode (`"/30"`), since encode step 3 returns the codec diagnostic unshifted), `U+FFFE` and `U+FFFF` in encode (`mermaid-strict-unrepresentable`, `path: "/text"`) and in decode (`mermaid-strict-invalid`), unknown key order and RFC 6901 escaping (`path: "/<key>"`), unknown `view` (`mermaid-strict-orphan-ref`), `collapsed` item failing rules (a) invalid → (b) orphan/non-container/undrawn → (c) duplicate → (d) unsorted in turn (verifying that `[dup, dup]` and `["entity:pkg-h2a", "entity:sys-h2a", "entity:pkg-h2a"]` on view `roles` — and header `collapsed=e_pkg_h2a,e_sys_h2a,e_pkg_h2a` in decode, where both entities are drawn containers at `FX-J:374, 384` with types at `FX-J:52, 48` and index 2 fails both (c) and (d) — emit `-duplicate` before `-noncanonical`), header token order precedence (magic, then version `INT ≠ 1` refusing with `-unsupported` whatever follows, then `text=`, `sha256=`, `view=`, `collapsed=`, a present token that does not match its §1.2 form such as `sha256=` in upper-case hex, missing token, seventh token), version `2` (`mermaid-strict-unsupported`), unknown `text=` (`mermaid-strict-annotation-unknown`), default `subjectRef` (`"archi-carrier"` on frame, codec-local `DEFAULT_SUBJECT_REF` = `ARCHI_MMD_PATH` on `committedText`); each diagnostic passes `assertValidArchiDiagnosticEnvelope` (`SHP:1459-1521`). **C-T3 (Digest mismatch):** Flipping a hex digit in `sha256=` or editing a label in the payload refuses with `carrier-digest-mismatch` (`path: "/0"`). **C-T4 (Stale export):** A valid frame encoded from `joint-r2` checked via `checkArchiCarrier(frame, newerText)` against `joint-r2` with `%% @dl revision 0` (`FX-J:5`) changed to `%% @dl revision 1` refuses with `export-stale` (`path: "/0"`). **C-T5 (N1–N5 slot survival and negative re-wraps, zero DS dependency):** (a) *Positive fixtures* decoding to exact `(t, view, collapsed, sha256)` and passing `checkArchiCarrier(f, t)`: text slot (SVG `<metadata>`, ArchiMate property) with `CRLF`, two outer blank lines, uniform 4-space prefix, uniform `TAB` prefix, trailing spaces, and missing final `LF`; attribute slot (draw.io, `.drawio.png`) after XML unescaping of `&#xa;` and `&#xd;&#xa;`; PlantUML after P-3 strips the `' ` prefix, with `CRLF`. (b) *Negative fixtures* refusing with `mermaid-strict-invalid` at their expected path: frame with `LF` folded to `SP` (`"/0"`); frame wrapped inside an `ASTRING` (`"/<i+1>"`); frame still carrying `' ` prefixes (`"/0"`). **C-T6 (SHA-256 through the public API; `sha256Utf8Hex` stays module-private):** For $k = 1 \dots 131$, $t_k$ is the `joint-r2` canonical text with the `role` value of `e_sys_engram` (`FX-J:26`) replaced by $k$ ASCII letters `a` (these are 131 consecutive UTF-8 lengths, so every length residue mod 64 occurs at least twice, including 55, 56, 63, and 0), plus variants whose replaced value holds 2-, 3-, and 4-byte UTF-8 characters, one of them straddling a 64-byte block boundary; each $t_k$ passes `formatArchiMermaid(t_k, { check: true })`, and for $f = \text{encodeArchiCarrier}(\{ \text{text}: t_k, \text{view}: \text{"roles"}, \text{collapsed}: [] \}).\text{value}$, its `sha256=` token and `decodeArchiCarrier(f).value.sha256` both equal `createHash("sha256").update(t_k, "utf8").digest("hex")`. **C-T7 (Totality, 5,000 seeded mutations):** Header edits, byte insertions/deletions, injected `LF`/`CR`/`TAB`/BOM/lone surrogates never throw, always return `ArchiMermaidResult` with codes in `ARCHI_MERMAID_DIAGNOSTIC_CODES ∪ ARCHI_CARRIER_DIAGNOSTIC_CODES` passing `assertValidArchiDiagnosticEnvelope`, and for every accepted frame $f$, `encodeArchiCarrier({ text, view, collapsed })`, built from `decodeArchiCarrier(f).value`, returns $N(f)$, the output of N1–N5. **C-T8 (Zero dependency & drift guard):** Every `import` in `src/archi-mermaid/index.ts` is `import type` and every `export … from` declaration is `export type … from`, with no `require(` or `import(`; value check `ARCHI_DIAGNOSTIC_CODES.filter((c) => c === "carrier-digest-mismatch" || c === "export-stale")` deep-equals `[...ARCHI_CARRIER_DIAGNOSTIC_CODES]`; type check `expectTypeOf<ArchiCarrierDiagnosticCode>().toEqualTypeOf<Extract<ArchiDiagnosticCode, "carrier-digest-mismatch" | "export-stale">>()`. |
| ArchiMate mapping, new (lot 7, P-6) | **A-T1 (Totality and injectivity over the 3 corpus fixtures + closed 804-input domain):** Across `FX` (`joint-r2`: 94 `document`/`entity`/`relation` refs + 4 views, `joint-r2-teintes`: 94 `archi@1` / 101 total refs + 1 view, `hosts-r3`: 121 refs + 2 views), `archimateIdOf` succeeds on every `document:`, `entity:`, and `relation:` ref, matches `ARCHIMATE_ID_RE`, and is injective per fixture, across their union, and on cross-namespace witnesses (`document:roles`, `entity:roles`, `relation:roles`); deriving the $3 + C$ fold states per view with the rule of `ING:803-823` (`SPEC:535`, 53 states and 49 distinct `(view, collapsed)` pairs: 26 in `joint-r2`, 9 in `joint-r2-teintes`, 14 in `hosts-r3`) gives 49 distinct `archimateViewIdOf` identifiers matching `ARCHIMATE_VIEW_ID_RE`, disjoint from every `entity_`, `relation_`, `document_`, and `propdef-` id (witness: default `view_roles.e_pkg_h2a.e_pkg_plugin.e_sys_engram` and all-expanded `view_roles.-` of `view:roles` in one file); `archimateElementOf` is total and injective across all 32 `(kind, form)` pairs and all fixture `archi@1` entities; `archimateRelationshipOf` is total and injective (804 distinct `canonicalBytes` outputs) across all **804 typed inputs** — for each of the 55 `ARCHI1_TUPLES`, every `(source form, target form)` of `AP:39-49` (including `actor` without `form`, 509 endpoint pairs), × `mode` (3 values) on `accesses`, × `trigger` (5 values) × `event` $\in \{\text{absent}, \text{"e"}\}$ on `invokes` — and all fixture `archi@1` relations. **A-T2 (Round trip of id, view id, element type, relationship type, and full property vocabulary):** `archiRefOfArchimateId(archimateIdOf(r).value).value === r` and `archiViewOfArchimateId(archimateViewIdOf(v, c).value).value` deep-equals `{ viewRef: v, collapsed: c }` for every fixture ref, all 53 corpus fold states, length-1/length-40 boundaries, and the order-flip witness `archimateViewIdOf("view:roles", ["entity:sys-a-b", "entity:sys-a1"])` → `"view_roles.e_sys_a1.e_sys_a_b"` whose inverse returns `{ viewRef: "view:roles", collapsed: ["entity:sys-a-b", "entity:sys-a1"] }`; `archiEntityTypeOfArchimate(archimateElementOf(e).value).value` deep-equals `e` for all 32 `(kind, form)` pairs; `archiRelationTypeOfArchimate(archimateRelationshipOf(rel).value).value` deep-equals `rel` for all 804 typed inputs and all fixture relations; for every `FX` document, `archi@1` entity, relation, and view, `archiAttributesOfArchimate(archimatePropertiesOf(rec).value, { kind, relationType, identifier })` returns the record's attributes minus the native `name`, `role` and `label` (`{}` for a view and for the model), with equal `canonicalBytes` and the evidence order kept. **A-T3 (Relationship validity against the ArchiMate 3.x rules table):** [FACT] `MAT:14-132` holds the `archimate@2` `archimate-3.2` matrix (11,569 tuples, `TUPLES_SHA256 = "a13f4112..."`), transcribed from a pinned tool's `relationships.xml` (`EXP:171`), whereas the official Open Group ArchiMate 3.x specification table is not in the repo (`unverified`, `EXP:171, 207`). With `const TUPLES = expandMatrixTuples()` (`MAT:107-132`), assert across all **804 typed inputs** and all fixture relations that for every input: `archimateRelationshipOf(input).value.usedAssociationFallback === !matrixAllows(TUPLES, nominalTypeId, archimateSource.archimateTypeId, archimateTarget.archimateTypeId)` and `matrixAllows(TUPLES, archimateTypeId, archimateSource.archimateTypeId, archimateTarget.archimateTypeId) === true` (`MAT:128`), with `usedAssociationFallback === true` holding for **exactly 21 typed inputs**: `partOf(component, package)` (3) and `runsOn` (18), and `false` for the other 783. **A-T4 (Refusals, envelope, recursive freeze, and 38-code drift guard):** Absent/empty `archi-kind` emits `archimate-kind-missing`; unknown keys, bad refs/view ids, `["entity:sys-a1", "entity:sys-a-b"]` on `archimateViewIdOf` (`path: "/collapsed/1"`) and `"view_roles.e_sys_a_b.e_sys_a1"` on `archiViewOfArchimateId` (`path: ""`), `mode` outside `accesses`, `trigger`/`event` outside `invokes`, missing required `archimateTypeId` or `directed`, an absent `archi-relation-type` (`path: "/properties/archi-relation-type"`), a retyped element or relationship (e.g. `uses` retyped from `serving` to `flow` while keeping `archi-relation-type="uses"`), mismatched `identifier` vs `archi-ref`, evidence-slot gaps, and out-of-scope/out-of-`appliesTo` properties emit `archi-input-invalid`; every diagnostic passes `assertValidArchiDiagnosticEnvelope` (`SHP:1459-1521`); every table, row, and nested object/array is recursively `Object.isFrozen`; `expectTypeOf<ArchiArchimateDiagnosticCode>().toEqualTypeOf<Extract<ArchiDiagnosticCode, "archimate-kind-missing">>()`. |

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
| 5 | strict Mermaid source ingestion: `ARCHI_MMD_PATH` discovery with T3 fallback, `ArchiViewSpec.layout` M11–M12 guard, `ArchiAcceptance.textDigest` & `REQUIRED_ACCEPTANCE_KEYS`, 35-code `ARCHI_DIAGNOSTIC_CODES` (§5.1–§5.5) | (a) fixture `architecture.mmd` files + failing canonical and ingest tests (M1–M3, §5.6.6 gate with $T = \text{engram.archi-mermaid/1}$); (b) `archi-check.ts` 35-code tuple + `archi-shapes.ts` (`ARCHI_MMD_PATH`, `layout` M11–M12, `textDigest` & `REQUIRED_ACCEPTANCE_KEYS`) + `archi-ingest.ts` Stage 1 `.mmd` parse & Stage 7 `textDigest` check | 35 codes in `ARCHI_DIAGNOSTIC_CODES`; §5.6.6 bijection gate with `engram.archi-mermaid/1`; M1 (`.mmd`-only git e2e over all 3 fixtures), M2 (9 parse/check `mermaid-strict-*` + invalid UTF-8), M3 (`textDigest` pinning & idempotence); existing JSON-mode tests green during T3 |
| 6 — archi carrier (P-4) | archi carrier (P-4): universal carrier grammar, zero-dependency `encodeArchiCarrier` / `decodeArchiCarrier` / `checkArchiCarrier` on `@sentropic/engram/archi-mermaid`, 37-code `ARCHI_DIAGNOSTIC_CODES` (§5.5, §5.6.6, §6, and « P-4 — the archi carrier (engram.archi-carrier/1) ») | (a) failing tests C-T1..C-T8 in `tests/ontology-guardian-archi-carrier.test.ts` + 37-code inventory in `CANON-T` + surface check in `CHUNK-T`; (b1) `sha256Utf8Hex`, module-private, in `src/archi-mermaid/index.ts`; C-T6 turns green with (b2), since it calls `encodeArchiCarrier`; (b2) `ARCHI_CARRIER_DIAGNOSTIC_CODES`, `ArchiCarrierDiagnostic`, `encodeArchiCarrier`, `decodeArchiCarrier`, `checkArchiCarrier` in `src/archi-mermaid/index.ts`; (b3) 37-code tuple in `src/ontology-guardian/archi-check.ts` | (1) `npm run test:archi` green (runs C-T1..C-T8 in `tests/ontology-guardian-archi-carrier.test.ts` and `CANON-T` 37-code check); (2) `npx vitest run tests/archi-mermaid-codec.test.ts && npx vitest run tests/shared-provenance-chunk.test.ts -t "keeps the public exports map unchanged"` green (`CHUNK-T:87`) |
| 7 — ArchiMate mapping tables (P-6) | ArchiMate 3.x element table (32 pairs → 8 types, §2.8 amendment), relationship table (15 relations, 55 tuples / 42 distinct ArchiMate triples / 804 typed inputs: 783 nominal + 21 frozen `EXP:198` `Association` fallbacks validated against `MAT:19-132`), concept/model & per-(view, fold state) `NCName` id bijections, 23-name `archi-*` property vocabulary & codec (including model-level `archi-carrier` per `(view, fold state)` pair), pure P-6 API on `@sentropic/engram/archi`, 38-code `ARCHI_DIAGNOSTIC_CODES` (§2.8, §5.5, §6, §7, §8 O11, « P-4 — the archi carrier (engram.archi-carrier/1) » §6 item 6, and « P-6 — the ArchiMate mapping (engram-owned) ») | (a) failing tests A-T1..A-T4 in `tests/ontology-guardian-archi-archimate.test.ts` + 38-code check in `CANON-T` + 46-export surface check in `CHUNK-T`; (b1) types and deep-frozen tables (`ARCHI_ARCHIMATE_DIAGNOSTIC_CODES`, `ARCHI_ARCHIMATE_ELEMENT_TABLE`, `ARCHI_ARCHIMATE_RELATIONSHIP_TABLE`, `ARCHI_ARCHIMATE_PROPERTIES`) in `src/ontology-guardian/archi-archimate.ts`; (b2) id and property functions (`archimateIdOf`, `archiRefOfArchimateId`, `archimateViewIdOf`, `archiViewOfArchimateId`, `archimatePropertiesOf`, `archiAttributesOfArchimate`), turning id/property cases of A-T1..A-T2 green; (b3) element and relationship functions (`archimateElementOf`, `archiEntityTypeOfArchimate`, `archimateRelationshipOf`, `archiRelationTypeOfArchimate`); (c) 38-code tuple & comments in `src/ontology-guardian/archi-check.ts` + 14 re-exports in `src/archi.ts` | (1) `npm run test:archi` green (runs A-T1..A-T4 and `CANON-T` 38-code check); (2) `npx vitest run tests/shared-provenance-chunk.test.ts -t "keeps the public exports map unchanged"` green (`CHUNK-T:87`) |

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
| O11 | owner | Committed source text serialization is closed by Owner Decisions B and C (`engram.archi-mermaid/1` at `.engram/architecture/architecture.mmd`, codec in `src/archi-mermaid/index.ts`, verified by the §5.6.6 gate), payload framing for reversible exports (`engram.archi-carrier/1`, P-4 / `P2-O3`) is closed by Lot 6 (« P-4 — the archi carrier (engram.archi-carrier/1) »), and ArchiMate mapping tables, property codec, and identifier bijections (P-6 / `P2-O4`, `P2:614-619, 645`) are closed by Lot 7 (« P-6 — the ArchiMate mapping (engram-owned) »). O11 remains open only for P-3 host exporters, headless GitHub Mermaid render in CI (G-T5, `P2:551`), and the T3 close (JSON fallback removal once all owning repos commit `architecture.mmd`). |
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

## Owner decision C (07/11) and the D1 gates

- **Binding authority and baseline (`2026-11-08`).** Owner decision C (2026-11-07, `P2-PARTITION-NOTE.r3.md:34-39`, key `P2`): strict Mermaid with `%% @dl` annotations (`engram.archi-mermaid/1`, orientation B2) at `.engram/architecture/architecture.mmd` (`ARCHI_MMD_PATH`) is the committed architecture source; canonical JSON (RFC 8785) remains the pinned identity; engram owns the zero-dependency codec (`@sentropic/engram/archi-mermaid`, `src/archi-mermaid/index.ts`, key `MMD`). Observed baseline on `rhanka/engram` `origin/main` `1b5e81eb` (merge of lot 4 `1d030b9a` into `9e9e582e`): `src/archi-mermaid/index.ts` (`MMD`), `src/ontology-guardian/archi-ingest.ts` (`ING`), `src/ontology-guardian/archi-shapes.ts` (`SHP`), `src/ontology-guardian/archi-check.ts` (`CHK`), `src/ontology-guardian/archi-view.ts` (`VW`), and `P2-PARTITION-NOTE.r3.md` (`P2`).
- **The D1 / P-1 gates (`P2:544-552`):**
  1. **Gate (i) — Both digests pinned, canonical JSON stays the pinned identity:** `ArchiAcceptance` pins `textDigest` (64-hex SHA-256 of the committed `.mmd` bytes) alongside `documentPin`, while `documentPin`, `viewPin`, `bindingPin`, and `files` remain RFC 8785 `digestOfPreimage` over the canonical JSON records (§5.4). Because Stage 1 enforces `checkCanonical: true` (`fmt(t) = t`), `textDigest` is a deterministic function of the canonical triple (`P2:545`). This arrangement supersedes the `P2:633` A7 sketch (`{ repository, commit, textPath, textSha256 }`) by keeping `source.manifestPath` as the literal union `".engram/architecture/architecture.mmd" | ".engram/architecture/manifest.json"` and placing `textDigest` at the top level of `ArchiAcceptance` alongside `documentPin`.
  2. **Gate (ii) — Parse → canonical → unchanged fail-closed stages; closed parse diagnostics:** Stage 1 decodes UTF-8, computes `textDigest`, runs `parseArchiMermaid(text, { checkCanonical: true, subjectRef: ARCHI_MMD_PATH })`, and runs the four Stage-1 shape/invariant guards (`SHP:575-1055`); any parse or canonical failure refuses at stage `"source"` under `scope: "file:.engram/architecture/architecture.mmd"` using the closed 35-code `ARCHI_DIAGNOSTIC_CODES` inventory (§5.3, §5.5) and registers nothing. Stages 2–8 (`ING:455-841`) run unchanged (`P2:546`).
  3. **Gate (iii) — Bijection gate in engram CI:** `tests/ontology-guardian-archi-canonical.test.ts:556-588` runs the §5.6.6 round-trip gate with $T = \text{engram.archi-mermaid/1}$ alongside canonical JSON, complementing the merged codec suite `tests/archi-mermaid-codec.test.ts` (G-T1..G-T4).
- **Migration (T3 transition coexistence and closing step):**
  1. **T3 open (coexistence):** While T3 is open, Stage 1 probes `ARCHI_MMD_PATH` first and falls back to `ARCHI_MANIFEST_PATH` only when `ARCHI_MMD_PATH` is absent at `<commit>` (if a repository holds both files, `ARCHI_MMD_PATH` wins and `manifest.json` is ignored). JSON-only repositories and existing JSON-mode unit tests (`tests/ontology-guardian-archi-ingest.test.ts:153-623`, `tests/ontology-guardian-archi-canonical.test.ts:425-516`) continue to pass without modification (`source.manifestPath = ".engram/architecture/manifest.json"`, `textDigest` omitted). Focus (`verifyArchiBinding`, `ING:859-1034`) verifies `document.json`, `views/<view local>.json`, and `bindings/<view local>.json`, which are identical across `.mmd` and JSON ingestion.
  2. **Closing T3 (owner gate, M8):** When the owner closes T3 after all owning repos commit `.engram/architecture/architecture.mmd`: remove the `ARCHI_MANIFEST_PATH` fallback in `ING:294-451`; make `ArchiAcceptance.textDigest` unconditional with `source.manifestPath === ARCHI_MMD_PATH` in `SHP:1158-1173`; switch the corpus fixture loaders so that the committed `tests/fixtures/archi/*/architecture.mmd` is the single corpus input per fixture and the JSON records (`manifest`, `document`, `viewSpecs`) consumed by the checks, cards, views, folds, canonical, and pinned-adapter suites (§6.1) are loaded through `parseArchiMermaid` (byte-equal per the §6.1 fixtures row, G-T3), and only then delete the legacy JSON fixture files under `tests/fixtures/archi/*/`.
- **GLM 5.3 review ledger (`review-spec-mmd-glm.md`, verdict SOLID, 8 MINOR fixed):**
  - **M1:** Moved the required-keys loop in `checkArchiAcceptanceShape` (`SHP:1158-1160`) to `REQUIRED_ACCEPTANCE_KEYS` excluding `"textDigest"`, whose presence is conditional on `source.manifestPath` (§5.4).
  - **M2:** Re-cited the `pin cards` head production and parse branch as `P2:173`, `MMD:2057-2061`, keeping `MMD:2783` and `SHP:596` (§5.2).
  - **M3:** Re-cited M1's `verifyArchiBinding` pointer as `ING:859-1034` and the e2e test pattern as `tests/ontology-guardian-archi-ingest.test.ts:628-812` (§6.2).
  - **M4:** Re-cited `cardsPin` in `MANIFEST_ALLOWED_KEYS` at `SHP:569` (`SHP:569, 593-597, 672-675`) (§5.2).
  - **M5:** Re-attributed `mermaid-strict-unrepresentable` print-mode refusal coverage to the merged G-T4 negatives in `tests/archi-mermaid-codec.test.ts:738, 1171` (§5.5, §6.2).
  - **M6:** Scoped §5.3 stage 1's « raw bytes are never hashed » rule to the I-JSON committed files, with the `.mmd` `textDigest` exception stated via the canonical-only text rationale (`fmt(t) = t`, `P2:545`) (§5.3, §5.4).
  - **M7:** Added `readonly layout?: ArchiLayoutHints;` to the §5.2 `ArchiViewSpec` interface block alongside the M11–M12 guard rules (§5.2).
  - **M8:** Specified that at T3 close each fixture's committed `architecture.mmd` becomes the corpus input and its JSON records are loaded through `parseArchiMermaid` (byte-equal per G-T3) before deleting the legacy JSON files (this section).

## P-4 — the archi carrier (engram.archi-carrier/1)

- **Ownership and baseline (`2026-11-08`).** Engram owns P-4 (R/A, `P2:555, 644`), closing open point `P2-O3`. P-3 (host exporters: SVG, draw.io, `.drawio.png`, PlantUML, ArchiMate, and their edit subsets) belongs to the DS (`P2:553, 583-620`). P-6 (ArchiMate mapping tables, `P2:614-619, 645`) is out of scope here. Observed baseline on `rhanka/engram` `origin/main` `a84516ad` (`v0.25.0`): `spec/SPEC_EVOL_ARCHI_CARDS.md` (`SPEC`, this document), `src/archi-mermaid/index.ts` (`MMD`), `src/ontology-guardian/archi-ingest.ts` (`ING`), `src/ontology-guardian/archi-check.ts` (`CHK`), `src/ontology-guardian/archi-shapes.ts` (`SHP`), `src/ontology-guardian/canonical.ts` (`CAN`), `src/archi.ts` (`ARCHI`), `package.json` (`PKG`), `tests/fixtures/archi/joint-r2/architecture.mmd` (`FX-J`), `tests/archi-mermaid-codec.test.ts` (`CODEC-T`), `tests/ontology-guardian-archi-canonical.test.ts` (`CANON-T`), `tests/shared-provenance-chunk.test.ts` (`CHUNK-T`), and `P2-PARTITION-NOTE.r3.md` (`P2`).

### 1. The carrier grammar (`engram.archi-carrier/1`, `proposed`)

#### 1.1 Universal frame choice and round-trip invariant
- [JUDGMENT] **One universal frame** is selected for all payload-carrying B2 targets (`P2:555, 563-581`). Engram produces and consumes the frame string; host slot placement and extraction belong to P-3.
- **Round-trip invariant (`[JUDGMENT]`):** For every canonical `engram.archi-mermaid/1` text $t$ without `U+FFFE`/`U+FFFF` (`fmt(t) = t`, `P2:308`, `MMD:2806-2837, 2887-2903`), every view local id $\text{view}$ declared in $t$, and every strictly ascending list $\text{collapsed} \subseteq D(\text{view})$ of drawn container `entity:<local>` refs in model UTF-16 order (§5.2, §5.6, `P2:327, 487`, `MMD:1884-1895`):
  $$\text{decode}(\text{encode}(t, \text{view}, \text{collapsed})) = (t, \text{view}, \text{collapsed})$$
  where $\text{decodeArchiCarrier}(\text{encodeArchiCarrier}(\{ \text{text}: t, \text{view}, \text{collapsed} \}).\text{value}).\text{value} = \{ \text{text}: t, \text{view}, \text{collapsed}, \text{sha256}: \text{sha256}(t) \}$.

#### 1.2 Exact EBNF, header token order, and line endings
```ebnf
(* Universal archi carrier frame, proposed. Confirms P2-O3 (P2:555, 644); other tokens as P2 §4.2 (P2:209-214). *)
carrier     = header , LF , payload ;
header      = "archi-carrier" , SP , "1" ,
              SP , "text=engram.archi-mermaid/1" ,
              SP , "sha256=" , HEX64 ,
              SP , "view=" , LOCAL ,
              SP , "collapsed=" , COLLAPSED ;
HEX64       = 64 * HEX ;                           (* P2:211, 219; MMD:176 *)
COLLAPSED   = "-" | ( EID , { "," , EID } ) ;     (* strictly ascending by EID ASCII/UTF-16 bytes *)
payload     = file ;                               (* canonical engram.archi-mermaid/1 text t, P2:159, 581 *)
```
- **Header tokens and order (`[JUDGMENT]`, confirming `P2:555`):** Split line 0 on `SP` (`U+0020`). Check the magic, then the version: a version `INT ≠ 1` refuses with `mermaid-strict-unsupported`, whatever follows. Then check `text=`, `sha256=`, `view=`, and `collapsed=` in turn. A missing token fails at its position, a seventh token fails after `collapsed=`, and a present token that does not match its §1.2 form (wrong key, empty value, `sha256=` not `HEX64`, `view=` not `LOCAL`, `collapsed=` neither `-` nor an `EID` list) → `mermaid-strict-invalid`:
  1. `"archi-carrier"` (magic literal; mismatch → `mermaid-strict-invalid`);
  2. `"1"` (carrier grammar version; any `INT ≠ 1` refuses with `mermaid-strict-unsupported`, whatever follows; missing or non-`INT` with `mermaid-strict-invalid`);
  3. `"text=engram.archi-mermaid/1"` (payload grammar identifier; any other non-empty value after `"text="` refuses with `mermaid-strict-annotation-unknown`, matching `MMD:1998-2000`; `"text="` with an empty value refuses with `mermaid-strict-invalid`);
  4. `"sha256=" + HEX64` (`^[0-9a-f]{64}$`, `MMD:176`, `SHP:32`): lowercase hex SHA-256 of the UTF-8 bytes of $t$, identical to `ArchiAcceptance.textDigest` (`ING:354-358`, §5.4);
  5. `"view=" + LOCAL` (`^[a-z][a-z0-9-]{0,39}$`, `MMD:170`, `P2:213`): `<view local>` id (`viewId` without `"view:"`, `P2:237`);
  6. `"collapsed=" + COLLAPSED`: `"-"` when the exported fold state has zero collapsed containers ($\emptyset$), else comma-separated `EID`s (`^e_[a-z][a-z0-9_]{0,39}$`, `MMD:171`, `P2:214, 235`) in strictly ascending EID byte order without duplicates or spaces, matching `K11` (`P2:324, 327`). Only the header spells `EID`s in EID byte order; the model-facing API (§2 below) takes and returns `entity:<local>` refs in model UTF-16 order (§5.2, §5.6, `P2:327`).
- **Line endings (`[FACT]` / `[JUDGMENT]`):** Canonical frames use `LF` (`U+000A`) only: one `LF` after `header`, then canonical $t$ line by line ending with its single final `LF` (`K1`, `P2:146, 314`, `MMD:1529, 1655-1666`). No BOM (`U+FEFF`), `CR` (`U+000D`), `TAB` (`U+0009`), control character, lone surrogate, or XML non-character (`U+FFFE`, `U+FFFF`) occurs in a canonical frame.

#### 1.3 Frame alphabet, host quoting boundary, and PlantUML comment form
- [FACT] Every header token uses only `[a-z0-9._/,=-]`. In canonical $t$, every string (`VSTRING` and `ASTRING`) is single-line without control characters (`P2:253`, §5.6, `MMD:533-547`); `VSTRING` decimal-escapes `"`, `#`, `&`, `<`, `>`, `[`, `]`, `` ` ``, `{`, `|`, `U+2028`, `U+2029` (`#34;`..`#8233;`, `P2:246`, `MMD:549-562, 603-631`), and `ASTRING` backslash-escapes `"`, `\`, `{`, `U+2028`, `U+2029` (`P2:247`, `MMD:633-686`). Canonical $t$ therefore holds no `{` (`K9`, `P2:250, 322`), no multi-line literal, and no raw `<`, `>`, or `&` in visible labels, though `U+FFFE` and `U+FFFF` are not excluded by `MMD:533-547`.
- [JUDGMENT] **Frame alphabet:** the canonical alphabet of §1.2 minus `U+FFFE` and `U+FFFF`, so that every frame scalar is an XML 1.0 `Char` (§2.2, which excludes `U+FFFE` and `U+FFFF`, forbidden even as character references by XML 1.0 §4.1). `encodeArchiCarrier` refuses a text holding `U+FFFE` or `U+FFFF` with `mermaid-strict-unrepresentable` (`path: "/text"`); `decodeArchiCarrier` refuses `U+FFFE` or `U+FFFF` with `mermaid-strict-invalid`.
- [JUDGMENT] **PlantUML comment form (closing `P2:609`):** PlantUML carries the frame in line comments only: `' ` followed by $L$ for each non-empty frame line $L$, or `'` alone for an empty $L$. It never uses a block comment (`/' … '/`), because `'/` may occur raw in $t$ (`P2:246-247`).
- [JUDGMENT] **No carrier-level character escaping is added.** Host syntax quoting and unquoting (XML entity/attribute escaping in SVG `<metadata>`, draw.io `id="0"`, or ArchiMate `<property>`, and `' ` line-comment prefixes in PlantUML) belong exclusively to P-3 (§6 item 5 below).

#### 1.4 Payload delimitation, canonical check, and integrity
- [JUDGMENT] **Payload delimitation:** `LF` (`U+000A`) is the only line delimiter, and each slot family transports it losslessly (P-3 obligations, §6 item 5 below). `decodeArchiCarrier` holds no host-format adapter and applies only these five normalizations, in order — each is the identity on a canonical frame and the exact inverse of one host whitespace change:
  - **N1:** `CRLF` (`\r\n`) and lone `CR` (`\r`) → `LF` (`\n`).
  - **N2:** remove trailing `SP` (`U+0020`) or `TAB` (`U+0009`) from every line.
  - **N3:** drop leading and trailing empty lines.
  - **N4:** remove the longest `SP`/`TAB` prefix shared by every non-empty line (line 0 of a canonical frame starts at column 1, so any shared prefix is what the host added).
  - **N5:** end with exactly one `LF`.
- **Canonical check and integrity (`[JUDGMENT]`):** After N1–N5, any remaining `TAB`, `CR`, BOM, control char, lone surrogate, or `U+FFFE`/`U+FFFF` refuses with `mermaid-strict-invalid`. Line 0 is the header and lines `1..n` are the payload. The payload must pass `parseArchiMermaid(payload, { checkCanonical: true, subjectRef })` — otherwise `decodeArchiCarrier` refuses with the codec's closed diagnostic, `mermaid-strict-noncanonical` included (`P2:555, 581`). Nothing else is repaired: `LF`s turned into `SP`, a wrap inside a line, and an unstripped host comment marker (`' `) are all refused. `sha256` covers $t$ only (`sha256Utf8Hex(payload) === header.sha256`, checking integrity); `view=` and `collapsed=` are checked against the visible projection by `carrier-visible-drift` for T2 and T5 (`P2:580, 593, 610`); for T3 and T6, their check is P-3's edit-subset logic (`P2:598, 617`), not covered by engram.
- **Normalization invariant (`[JUDGMENT]`):** $\text{decode}(H(\text{encode}(x))) = x$ for every finite composition $H$ of the host changes that N1–N5 invert (`LF` → `CRLF` or `CR`; `SP` or `TAB` appended at line ends; empty lines added before or after the frame; one `SP`/`TAB` prefix added to every line; the final `LF` dropped or repeated). A wrap inside a quoted string cannot be undone because `"ab"` and `"a b"` both wrap to `"a` `LF` `b"`; surviving arbitrary line wraps would require a whitespace-insensitive payload encoding (such as base64 of $t$), which would give up « line by line » (`P2:555`) and is not proposed.

### 2. The engram API (`proposed`, on `@sentropic/engram/archi-mermaid` only)

- [FACT] `@sentropic/engram/archi-mermaid` (`src/archi-mermaid/index.ts`, `PKG:59-62`) has zero runtime imports (`MMD:1-22, 167`), is separate from `@sentropic/engram/archi` (`ARCHI:1-95`, `CHUNK-T:107-165`), and returns `ArchiMermaidResult<T>` (`MMD:66-68`) with `ArchiMermaidDiagnostic` (`MMD:53-60`).
- [JUDGMENT] Keep `src/archi-mermaid/index.ts` zero-dependency by embedding a module-private pure TypeScript FIPS 180-4 UTF-8 SHA-256 helper (`sha256Utf8Hex`, zero `node:crypto` or external runtime import, byte-identical to `ING:219-221` and `CAN:65-67`). Do not re-export carrier symbols from `src/archi.ts`. Keep `ARCHI_MERMAID_DIAGNOSTIC_CODES` (`MMD:37-48`) and `ArchiMermaidDiagnostic` (`MMD:53-60`) unchanged so existing codec callers keep their 10-code type; add `ARCHI_CARRIER_DIAGNOSTIC_CODES`, `ArchiCarrierDiagnostic`, and a defaulted type parameter on `ArchiMermaidResult`:

```ts
export const ARCHI_CARRIER_DIAGNOSTIC_CODES = Object.freeze(["carrier-digest-mismatch", "export-stale"] as const); // proposed
export type ArchiCarrierDiagnosticCode = (typeof ARCHI_CARRIER_DIAGNOSTIC_CODES)[number];                          // proposed
export interface ArchiCarrierDiagnostic extends EngramDiagnostic {                                                 // proposed
  readonly origin: "engram"; readonly severity: "error";
  readonly code: ArchiMermaidDiagnosticCode | ArchiCarrierDiagnosticCode;
  readonly nativeCode: ArchiMermaidDiagnosticCode | ArchiCarrierDiagnosticCode;
  readonly path: string; readonly subjectRef: string;
}
export type ArchiMermaidResult<T, D extends EngramDiagnostic = ArchiMermaidDiagnostic> =                           // proposed
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly [D, ...D[]] };
export interface ArchiCarrierEncodeInput {                                                                         // proposed
  readonly text: string;
  readonly view: string;                // <view local>, e.g. "roles"
  readonly collapsed: readonly string[]; // strictly ascending "entity:<local>" refs in D(view) (§5.2, §5.6)
}
export interface ArchiCarrierDecoded {                                                                             // proposed
  readonly text: string;                // canonical engram.archi-mermaid/1 text t
  readonly view: string;                // <view local>
  readonly collapsed: readonly string[]; // strictly ascending "entity:<local>" refs in model UTF-16 order
  readonly sha256: string;              // 64-hex SHA-256 of UTF-8 bytes of text
}
export interface ArchiCarrierOptions { readonly subjectRef?: string; }                                             // proposed
export function encodeArchiCarrier(input: unknown, options?: ArchiCarrierOptions): ArchiMermaidResult<string, ArchiCarrierDiagnostic>;
export function decodeArchiCarrier(frame: unknown, options?: ArchiCarrierOptions): ArchiMermaidResult<ArchiCarrierDecoded, ArchiCarrierDiagnostic>;
export function checkArchiCarrier(frame: unknown, committedText: unknown, options?: ArchiCarrierOptions): ArchiMermaidResult<ArchiCarrierDecoded, ArchiCarrierDiagnostic>;
```

- **Refusal order, locations, and subjects (`[JUDGMENT]`):**
  - **Default `subjectRef`:** `encodeArchiCarrier` defaults `subjectRef` to the codec-local `DEFAULT_SUBJECT_REF` (`".engram/architecture/architecture.mmd"`, `MMD:99`), whose value equals `ARCHI_MMD_PATH` (`SHP:25`); `MMD` never imports `SHP`. `decodeArchiCarrier` and `checkArchiCarrier` default the frame's `subjectRef` to `"archi-carrier"` when `options.subjectRef` is not a non-empty string (encode: `DEFAULT_SUBJECT_REF`); in `checkArchiCarrier`, findings on `committedText` always carry `subjectRef: DEFAULT_SUBJECT_REF`.
  - **`encodeArchiCarrier(input, options?)`** (first failure wins):
    1. Non-object `input`, unknown key, non-string `text`, `view` not matching `LOCAL_RE` (`MMD:170`), or `collapsed` not an array — checked in the listed order; an unknown key → `path: "/<key>"` (RFC 6901-escaped), the first one in `Object.keys` order; an input whose fields cannot be read → `mermaid-strict-invalid` (`path: ""`) — → `mermaid-strict-invalid` (`path: ""`, `"/<key>"`, `"/text"`, `"/view"`, or `"/collapsed"`).
    2. `text` contains `U+FFFE` or `U+FFFF` → `mermaid-strict-unrepresentable` (`path: "/text"`).
    3. `parseArchiMermaid(text, { checkCanonical: true, subjectRef })` fails → returns its closed diagnostic (`mermaid-strict-noncanonical` when `fmt(t) ≠ t`, or `mermaid-strict-*`; its `path` points into `text` read as an array of lines, `P2:526`, unshifted, whereas steps 1, 4, and 5 point into the input object with the same default `subjectRef`).
    4. `"view:" + view` not in `parsed.value.views` → `mermaid-strict-orphan-ref` (`path: "/view"`).
    5. For each index $i$ of `collapsed` in ascending order ($0 \dots n-1$), apply these rules in turn (first failing index and rule wins, `path: "/collapsed/<i>"`): (a) not a string matching `^entity:[a-z][a-z0-9-]{0,39}$` (`MMD:170`) → `mermaid-strict-invalid`; (b) not in $D(\text{view})$ (entity absent from `document.entities`, not in `viewSpec.draw`, or not an `archi@1` container kind `system | repo | package | host`, `MMD:251-253, 260, 1884-1895`) → `mermaid-strict-orphan-ref`; (c) equal to an earlier member → `mermaid-strict-duplicate`; (d) `collapsed[i - 1] > collapsed[i]` in UTF-16 order → `mermaid-strict-noncanonical`.
    6. Maps each ref via `toEid` (`MMD:474-477`), sorts by `cmpBytes` (`MMD:450-452`) into `collapsed=`, and returns `header + "\n" + text`.
  - **`decodeArchiCarrier(frame, options?)`** (first failure wins):
    1. Non-string `frame`, empty before or after N1–N5, or (after N1–N5) BOM, `TAB`, `CR`, lone surrogate, control char other than `LF`, or `U+FFFE`/`U+FFFF` → `mermaid-strict-invalid` at `path: "/0"` (or `"/<lineIdx>"` into the N1–N5 frame).
    2. Header on line 0 (`path: "/0"`), split on `SP` and checked in the order of §1.2: magic (`"archi-carrier"`, else `mermaid-strict-invalid`), then version (a version `INT ≠ 1` refuses with `mermaid-strict-unsupported`, whatever follows; missing or non-`INT` → `mermaid-strict-invalid`), then `text=` (`text=<other>` with non-empty `<other>` → `mermaid-strict-annotation-unknown`), `sha256=`, `view=`, and `collapsed=` (`collapsed=` token $i$ not matching `EID_RE`, `MMD:171` → `mermaid-strict-invalid`) in turn; a missing token fails at its position, a seventh token fails after `collapsed=`, and a present token that does not match its §1.2 form (wrong key, empty value, `sha256=` not `HEX64`, `view=` not `LOCAL`, `collapsed=` neither `-` nor an `EID` list) → `mermaid-strict-invalid`.
    3. Payload (`lines 1..n` of the N1–N5 frame) fails `parseArchiMermaid(payload, { checkCanonical: true, subjectRef })` → returns its closed `mermaid-strict-*` diagnostic (`mermaid-strict-noncanonical` included) with `path` shifted from `"/<i>"` (`MMD:504`) to `"/<i+1>"`.
    4. `sha256Utf8Hex(payload) !== header.sha256` → `carrier-digest-mismatch` (`path: "/0"`).
    5. `"view:" + view` not in `triple.views` → `mermaid-strict-orphan-ref` (`path: "/0"`). Then for each `collapsed=` EID at index $i$ in ascending order, apply in turn (`path: "/0"`): (a) is enforced at step 2; (b) `fromEid(eid)` (`MMD:479-481`) not in $D(\text{view})$ → `mermaid-strict-orphan-ref`; (c) equal to an earlier member → `mermaid-strict-duplicate`; (d) `eids[i - 1] > eids[i]` in EID byte order → `mermaid-strict-noncanonical`. Returns `collapsed` as `fromEid` refs sorted in model UTF-16 order.
  - **`checkArchiCarrier(frame, committedText, options?)`**:
    1. Runs `decodeArchiCarrier(frame, options)`; if `!dec.ok`, returns `dec`.
    2. Validates `committedText` via `parseArchiMermaid(committedText, { checkCanonical: true, subjectRef: DEFAULT_SUBJECT_REF })` (the codec-local `DEFAULT_SUBJECT_REF`, `MMD:99`, whose value equals `ARCHI_MMD_PATH`, `SHP:25`; `MMD` never imports `SHP`); if `!com.ok`, returns `com`.
    3. If `dec.value.sha256 !== sha256Utf8Hex(committedText)`, refuses with `export-stale` (`path: "/0"`, `subjectRef`: the frame `subjectRef` resolved as in decode). Otherwise returns `dec`.

### 6. Contract list for the DS (what P-3 consumes and honours)

1. **Subpath & zero-dependency guarantee:** Import `encodeArchiCarrier`, `decodeArchiCarrier`, `checkArchiCarrier`, `parseArchiMermaid`, `printArchiMermaid`, `formatArchiMermaid`, `ARCHI_MERMAID_DIAGNOSTIC_CODES`, and `ARCHI_CARRIER_DIAGNOSTIC_CODES` from `@sentropic/engram/archi-mermaid` only (`PKG:59-62`; zero runtime dependencies).
2. **Export framing (P-3 write path):** Given canonical committed text `t` (`acceptance.textDigest === sha256(t)`), exported `view` (`<view local>`), and active fold state `collapsed` (`entity:<local>` refs in ascending UTF-16 order), call `encodeArchiCarrier({ text: t, view, collapsed })` and write `result.value` into the format's host slot (BPMN refuses with P-3's `export-not-applicable`, `P2:605`).
3. **Verification / edit-subset read path (P-3):** If the host slot is absent or empty, P-3 emits `carrier-missing` (`P2:593, 601`). Otherwise, after removing its slot's host syntax (P-3: XML unescaping; the PlantUML `' ` prefix, item 5), call `decodeArchiCarrier(frame, { subjectRef })` (or `checkArchiCarrier(frame, committedText, { subjectRef })`), returning `{ text, view, collapsed, sha256 }` or closed `ArchiCarrierDiagnostic`s.
4. **Visible-drift and edit-subset boundary (§5.6.6):** After `decodeArchiCarrier` succeeds, P-3 checks `carrier-visible-drift` (`P2:580, 593, 610`) or applies draw.io / ArchiMate edit subsets (`P2:598-599, 617`, `P2-O5`) to produce an updated triple printed via `printArchiMermaid` and proposed as a commit to the owning repo's `architecture.mmd` (§5.4, §5.6.6).
5. **Transport (P-3 obligations):**
   - *SVG:* the frame is the text of one dedicated child element of `<metadata>`, XML-escaped. If CDATA is used, every `]]>` is split, since `ASTRING` may hold it raw.
   - *draw.io and `.drawio.png`:* one dedicated attribute of the root-cell object, with each `LF` written as `&#xa;` (mxGraph's default; `unverified` at a pinned draw.io).
   - *ArchiMate:* one dedicated property value.
   - *PlantUML:* line comments as stated in §1.3 (`' ` + line, or `'` on an empty line; `unverified` at a pinned PlantUML: a `/'` inside a line comment). The frame starts at `' archi-carrier 1 …` and ends before the first line that is not a line comment; P-3 writes a non-comment line right after it.
   - In every family, P-3 removes exactly its slot's host syntax, then calls `decodeArchiCarrier`.
6. **Cardinality:** One frame per exported `(view, fold state)` pair: a draw.io page carries its pair's frame in its own root cell; an ArchiMate exchange file that exports $k$ ArchiMate views (one per exported fold state, `P2:575`) carries $k$ frames in $k$ model-level `archi-carrier` properties (`propertyDefinitionRef="propdef-archi-carrier"`, « P-6 — the ArchiMate mapping (engram-owned) » §4), each holding `encodeArchiCarrier({ text, view, collapsed }).value` (`SPEC:682-705`, XML-escaped by P-3 per `SPEC:661, 736`); an SVG or PlantUML file carries one frame. Line 0 of each frame (`view=<local> collapsed=<EIDs or ->`, `SPEC:639-646`) self-identifies its pair on decode. Whether $k$ `<property>` entries sharing `propertyDefinitionRef="propdef-archi-carrier"` and holding multi-line values validate under the Open Group XSD is `unverified` until test A-1 runs with `xmllint` (`EXP:206-207`; presence `unverified`). Whether they survive a tool save is `unverified` until test A-2 (`EXP:210`) runs on a pinned tool.
7. **Ids:** `collapsed` in `ArchiCarrierEncodeInput` and `ArchiCarrierDecoded` uses `entity:<local>` refs in ascending UTF-16 order (§5.2, §5.6); P-3 maps its `occurrence:o-<local>` fold state (`ING:806-822`) to `entity:<local>` refs in model order, while `encodeArchiCarrier` / `decodeArchiCarrier` handle the header's `e_<local>` EID byte order (§1.2, §2).
8. **Subject:** P-3 passes the host document's repo-relative path as `subjectRef` to `decodeArchiCarrier` and `checkArchiCarrier`.
9. **Visible-drift inputs:** Either the `@sentropic/engram/archi` projection (`buildArchiSourceView`, `projectArchiCards`, `archiSummaries`, `ARCHI:21, 36-37`), or the accepted `views/` and `bindings/` files (§5.4), rendered at `DS_COMMIT`.

## P-4 review (08/11)

Reviewer: Claude Opus 5.5 (by owner ruling of 2026-11-08, 3 rounds, final verdict **SOLID**; `review-spec-carrier-opus-r1.md`, `review-spec-carrier-opus-r2.md`, `review-spec-carrier-opus-r3.md` against `SPEC_DELTA_CARRIER_P4.md` → `.r2.md` → `.r3.md`).

- **Round-1 ledger (folded into r2):**
  - **F1** (BLOCKER — §1.4 heuristic splitter not exact/invertible): Replaced heuristic splitter with lossless `LF` contract, invertible normalizations N1–N5, `TAB`/`CR` refusal after N1–N5, and positive/negative C-T5 fixtures (P-4 §1.4, §2, §6.2 C-T5).
  - **F2** (BLOCKER — PlantUML host adapter inside decode): Removed PlantUML `' ` stripping from `decodeArchiCarrier`; assigned host unquoting to P-3 and added C-T5 negative test proving `' `-prefixed input refuses at `"/0"` (P-4 §1.4, §6 items 3 & 5, §6.2 C-T5).
  - **F3** (MAJOR — decode accepts non-canonical payloads via `formatArchiMermaid`): Removed `formatArchiMermaid` fallback; payload must pass `parseArchiMermaid(payload, { checkCanonical: true, subjectRef })`; added swapped-attribute-line C-T2 negative (P-4 §1.4, §2, §6.2 C-T2).
  - **F4** (MAJOR — XML `U+FFFE`/`U+FFFF` and PlantUML comment form): Restricted frame alphabet to XML 1.0 `Char` (encode refuses `U+FFFE`/`U+FFFF` with `-unrepresentable` at `"/text"`, decode with `-invalid`) and specified PlantUML line-comment form (`' ` / `'`), closing `P2:609` (P-4 §1.2, §1.3, §2, §6.2 C-T2).
  - **F5** (MAJOR — DS contract missing transport, extent, cardinality, ids, subject, drift inputs): Added P-4 §6 items 5–9 covering transport per slot (CDATA `]]>`, PlantUML extent), cardinality, `entity:<local>` id conversion, repo-relative `subjectRef`, and visible-drift inputs at `DS_COMMIT`.
  - **F6** (MAJOR — missing SHA-256 KAT, totality, zero-dep, drift guard, exact C-T4): Added `tests/ontology-guardian-archi-carrier.test.ts` with C-T1..C-T8 (C-T4 `revision 0 → 1`, C-T6 FIPS 180-4 SHA-256 KATs, C-T7 5,000 mutations, C-T8 zero-dep and drift guards) (§6.1, §6.2).
  - **F7** (MAJOR — Lot 6 gate does not execute carrier tests; commit size): Placed C-T1..C-T8 in `tests/ontology-guardian-archi-carrier.test.ts` (matched by `npm run test:archi`), added step-2 vitest command for `CODEC-T` and `CHUNK-T:87`, and split commits into `(a)`, `(b1)`, `(b2)`, `(b3)` (§7 Lot 6).
  - **F8** (MAJOR — re-export from `src/archi.ts` breaks surface split): Removed all `src/archi.ts` re-exports; kept `CHUNK-T:107-140` unchanged and updated `CHUNK-T:156-161` to the 8 `@sentropic/engram/archi-mermaid` exports (P-4 §2, §6 item 1, §6.1).
  - **F9** (MAJOR — missing §5.6.6 amendment; source re-import wording): Amended §5.6.6 and P-4 §6 items 3–4 stating exports are never ingested as a source and edit-subset outputs are proposed as commits to `architecture.mmd` (§5.6.6, P-4 §6).
  - **F10** (MINOR — widening `ArchiMermaidDiagnostic` breaks exhaustive switches): Kept `ArchiMermaidDiagnostic` unchanged; added `ArchiCarrierDiagnostic` and generic `ArchiMermaidResult<T, D = ArchiMermaidDiagnostic>` (P-4 §2).
  - **F11** (MINOR — ambiguous refusal order on `collapsed` and header): Specified strict per-index check order `(a) invalid → (b) orphan-ref → (c) duplicate → (d) noncanonical` (`>` strictly) and left-to-right header token order (P-4 §1.2, §2, §6.2 C-T2).
  - **F12** (MINOR — diagnostic `path` offset and `subjectRef` defaults): Shifted payload diagnostic `path` to `"/<i+1>"` (`"/0"` for header/frame) and set default `subjectRef` to `"archi-carrier"` for decode/check frame and `DEFAULT_SUBJECT_REF` for encode and `committedText` (P-4 §2, §6.2 C-T2).
  - **F13** (MINOR — incomplete §5.5 stage row, reused triggers, supersessions, tuple order): Added `carrier` stage row, carrier trigger table for the 7 reused `mermaid-strict-*` codes, `P2:541, 593` supersessions, and exact tuple position after `"archi-revision-conflict"` (`CHK:47`) (§5.5).
  - **F14** (MINOR — `MMD` line citations, `HEX64` EBNF rule, "authenticate" wording): Fixed citations (`MMD:633-686, 1529, 2887-2903`), defined `HEX64 = 64 * HEX ;`, and renamed §1.4 step to « Canonical check and integrity » noting `sha256` covers $t$ only (P-4 §1.1–§1.4).
  - **F15** (MINOR — EID order in model-facing `collapsed` API): `ArchiCarrierEncodeInput.collapsed` and `ArchiCarrierDecoded.collapsed` use `entity:<local>` refs in ascending UTF-16 order while header `collapsed=` spells `e_<local>` in EID byte order; added `sys-a1`/`sys-a-b` C-T1 case (P-4 §1.1, §1.2, §2, §6 item 7, §6.2 C-T1).
- **Round-2 ledger (folded into r3):**
  - **F6** (PARTIAL in r2 — C-T6 export/import conflict + C-T8 guard gaps): Closed via N1 and N5 exact fixes, testing SHA-256 through the public API (`sha256Utf8Hex` module-private) and tightening C-T8 zero-dependency and value/type drift guards (P-4 §2, §6.2 C-T6 & C-T8, §7 Lot 6).
  - **N1** (MAJOR — C-T6 calls non-exported/non-movable `sha256Utf8Hex`): Kept `sha256Utf8Hex` module-private; C-T6 varies `e_sys_engram` `role` (`FX-J:26`) across $k = 1 \dots 131$ ASCII `a`s (covering every mod-64 length residue twice) + multi-byte UTF-8 boundary variants through `encodeArchiCarrier`/`decodeArchiCarrier`; commit `(b1)` notes C-T6 turns green with `(b2)` (P-4 §2, §6.2 C-T6, §7 Lot 6).
  - **N2** (MINOR — `ARCHI_MMD_PATH` lives in `SHP`, which has runtime imports): Specified the codec-local `DEFAULT_SUBJECT_REF` (`MMD:99`, equal to `ARCHI_MMD_PATH` at `SHP:25`), and stated `MMD` never imports `SHP` (P-4 §2, §6.2 C-T2).
  - **N3** (MINOR — header token count vs version precedence; encode step 1 unknown key path/order): Line 0 splits on `SP` and checks magic, then version (`INT ≠ 1` → `-unsupported` whatever follows), then `text=`, `sha256=`, `view=`, `collapsed=`, missing token, and 7th token (`-invalid`); encode step 1 checks in listed order with `path: "/<key>"` (RFC 6901-escaped, first in `Object.keys` order) (P-4 §1.2, §2, §6.2 C-T2).
  - **N4** (MINOR — C-T2 swapped `evidence` lines are canonical and hit digest check instead): Specified swapping two attribute lines with different names in one block (`role` and `lifecycle` of `e_svc_live`, `FX-J:31-32`), yielding `mermaid-strict-noncanonical` (§6.2 C-T2).
  - **N5** (MINOR — C-T8 zero-dep misses `export … from`; drift check loses value order): Added `export type … from` check on every `export … from` declaration; separated value deep-equality (`ARCHI_DIAGNOSTIC_CODES.filter(...)` vs `[...ARCHI_CARRIER_DIAGNOSTIC_CODES]`) from `expectTypeOf` equality (§6.2 C-T8).
  - **N6** (MINOR — cardinality unit is `(view, fold state)` pair; `P2:555` ArchiMate single-property supersession): Changed unit to one frame per exported `(view, fold state)` pair ($k$ ArchiMate views → $k$ frames, `P2:575`, P-6 decides where) and recorded supersession of `P2:555`'s single ArchiMate model-level property when $k > 1$ (§5.5, P-4 §6 item 6).
  - **N7** (MINOR — header field check scope for T3/T6; PlantUML `/'` inside line comment status): Scoped `carrier-visible-drift` check of `view=`/`collapsed=` to T2 and T5 (`P2:580, 593, 610`) vs P-3 edit-subset logic for T3 and T6 (`P2:598, 617`, not covered by engram); marked PlantUML `/'` inside a line comment `unverified` at a pinned PlantUML (P-4 §1.4, §6 item 5).
  - **N8** (MINOR — wordings of normalization invariant, frame alphabet, trigger table, PlantUML run, C-T7 property): Applied exact fixes (a)–(e): $\text{decode}(H(\text{encode}(x))) = x$ for host changes $H$ inverted by N1–N5; canonical alphabet of §1.2 minus `U+FFFE`/`U+FFFF`; `-duplicate`/`-noncanonical` on `collapsed`/`collapsed=` only; « PlantUML line-comment run »; `encodeArchiCarrier({ text, view, collapsed })` built from `decodeArchiCarrier(f).value` returns $N(f)$ (§5.5, §6.2 C-T7, P-4 §1.3, §1.4).
- **Round-3 ledger (folded here):**
  - **R3-1** (MINOR — C-T2 gives the decode path to the encode case too): Stated `"/<i+1>"` in decode (`"/31"` on `FX-J`) and `"/<i>"` in encode (`"/30"`), since encode step 3 returns the codec diagnostic unshifted (`path` into `text` lines, `P2:526`) (P-4 §2, §6.2 C-T2).
  - **R3-2** (MINOR — decode step 2 and §1.2 drop the catch-all code for a malformed header token): Added the catch-all rule that a present token not matching its §1.2 form (wrong key, empty value, `sha256=` not `HEX64`, `view=` not `LOCAL`, `collapsed=` neither `-` nor an `EID` list) refuses with `mermaid-strict-invalid`, and added uppercase `sha256=` to C-T2 (P-4 §1.2, §2, §6.2 C-T2).
  - **P-1** (MINOR — `[dup, dup]` cannot show that rule (c) runs before rule (d)): Added `["entity:pkg-h2a", "entity:sys-h2a", "entity:pkg-h2a"]` on view `roles` (and header `collapsed=e_pkg_h2a,e_sys_h2a,e_pkg_h2a` in decode, `FX-J:48, 52, 374, 384`) where index 2 fails both (c) and (d) and emits `-duplicate` before `-noncanonical` (§6.2 C-T2).
  - **P-2** (MINOR — rule (a) of decode step 5 can never fire): Noted in decode step 5 that rule (a) is enforced at step 2 (P-4 §2).

## P-6 — the ArchiMate mapping (engram-owned)

- **Ownership, baseline, and tags (`2026-11-08`).** Engram owns P-6 (R/A, `P2:615-616, 645`), closing open point `P2-O4`: the `archi@1` kind → ArchiMate 3.x element type table, relationship table, identifier mapping, `archi-*` property vocabulary and codec, and `archimate-kind-missing`. P-3 (DS exchange XML codec, XML `accessType` spelling, view geometry, node/connection/organization identifiers, edit subsets, and `archimate-edit-unsupported`) belongs to the DS (`P2:614-619, 646`, `EXP:170-210`). Observed baseline on `rhanka/engram` `origin/main` `ff6a7845` (`v0.26.0`, verified via `git show origin/main:<path>`): `spec/SPEC_EVOL_ARCHI_CARDS.md` (`SPEC`, this document), `src/ontology-guardian/archi-profile.ts` (`AP`), `src/ontology-guardian/archi-check.ts` (`CHK`), `src/ontology-guardian/archi-shapes.ts` (`SHP`), `src/ontology-guardian/diagram-matrix-data.ts` (`MAT`), `src/ontology-guardian/diagram-profiles.ts` (`PROF-D`), `src/archi-mermaid/index.ts` (`MMD`), `src/archi.ts` (`ARCHI`), `package.json` (`PKG`), `tests/fixtures/archi/{joint-r2,joint-r2-teintes,hosts-r3}/` (`FX`), `tests/ontology-guardian-archi-canonical.test.ts` (`CANON-T`), `tests/shared-provenance-chunk.test.ts` (`CHUNK-T`), plus `P2-PARTITION-NOTE.r3.md` (`P2`) and `archi-skill/EXPORTS.md` (`EXP`). Stack & tags follow `SPEC:9-10` plus `external` (outside the repo) and `unverified` (external specification or tool behaviour not evidenced in the repo).

### 1. The kind → ArchiMate 3.x element type table (`proposed`) and §2.8 amendment

- [FACT] `archi@1` declares 11 entity kinds (`SPEC:54-67`, `AP:38-50`, forms at `AP:39-49`): 4 form-less kinds (`system`, `repo`, `component`, `service`), 1 optional-form kind (`actor`: `undefined | "human" | "agent" | "team" | "org"`), and 6 required-form kinds (`package`: 3, `runtime`: 5, `api`: 3, `store`: 5, `artifact`: 4, `host`: 3), yielding **32 valid `(kind, form)` domain pairs**. `ARCHIMATE_CATALOGUE` (`MAT:14`) and `archimate@2` (`PROF-D:208-218`) define the 61 concrete ArchiMate 3.2 element types by PascalCase Open Exchange `name` (`xsi:type`) and kebab-case `id`.
- [JUDGMENT] `ARCHI_ARCHIMATE_ELEMENT_TABLE` (`proposed`) maps all 32 `(kind, form)` pairs as a **total function** onto 8 ArchiMate 3.x element types (`EXP:175-185`, `P2:568, 615`). `generic@2` `legend` and `legend-key` entities (4 in `FX` `joint-r2-teintes`) and `generic@2` `contains` relations (3 in `FX` `joint-r2-teintes`) are not exported as ArchiMate elements or relationships; the P-4 carrier payload carries them (`P2:578`). The `ArchiMate` column of §2.8 (`SPEC:163-177`) is amended accordingly, qualifying every row as `P (element type many-to-one, restored by archi-kind / archi-form, P-6)`.

| `archi@1` kind (`AP:38-50`) | Closed forms (`required?`, `AP:39-49`) | ArchiMate 3.x element (`xsi:type` / `archimate@2` `id`) | Layer / aspect (`MAT:14`) | Collapse & reversibility properties (`P2:568, 619`, `EXP:173`) |
|---|---|---|---|---|
| `actor` | `human`, `agent`, `team`, `org` (no; 5 pairs incl. `undefined`) | `BusinessActor` / `business-actor` | `business` / `active` | **5-to-1 form collapse** (`manyToOne: true`); `archi-kind="actor"`, `archi-form="<form>"` iff `form` present |
| `system` | — (1 pair) | `Grouping` / `grouping` | `none` / `composite` | **2-to-1 kind collapse** with `repo` (`manyToOne: true`); `archi-kind="system"` (no `archi-form`) |
| `repo` | — (1 pair; opt. `url`) | `Grouping` / `grouping` | `none` / `composite` | **2-to-1 kind collapse** with `system` (`manyToOne: true`); `archi-kind="repo"` (no `archi-form`) |
| `package` | `library`, `plugin`, `app` (yes; 3 pairs; opt. `version`) | `Artifact` / `artifact` | `technology` / `passive` | **2-kind / 7-pair collapse** with `artifact` (`manyToOne: true`); `archi-kind="package"`, `archi-form="<form>"` |
| `component` | — (1 pair) | `ApplicationComponent` / `application-component` | `application` / `active` | **3-kind / 7-pair collapse** with `runtime`, `service` (`manyToOne: true`); `archi-kind="component"` (no `archi-form`) |
| `runtime` | `cli`, `mcp-server`, `daemon`, `job`, `hook` (yes; 5 pairs) | `ApplicationComponent` / `application-component` | `application` / `active` | **3-kind / 7-pair collapse** with `component`, `service` (`manyToOne: true`); `archi-kind="runtime"`, `archi-form="<form>"` |
| `service` | — (1 pair) | `ApplicationComponent` / `application-component` | `application` / `active` | **3-kind / 7-pair collapse** with `component`, `runtime` (`manyToOne: true`); `archi-kind="service"` (no `archi-form`) |
| `api` | `mcp`, `http`, `cli` (yes; 3 pairs; req. `access`) | `ApplicationInterface` / `application-interface` | `application` / `active` | **3-to-1 form collapse** (`manyToOne: true`); `archi-kind="api"`, `archi-form="<form>"` |
| `store` | `jsonl`, `file`, `database`, `object-store`, `graph` (yes; 5 pairs; req. `writerPolicy`) | `DataObject` / `data-object` | `application` / `passive` | **5-to-1 form collapse** (`manyToOne: true`); `archi-kind="store"`, `archi-form="<form>"` |
| `artifact` | `skill`, `manifest`, `schema`, `doc` (yes; 4 pairs) | `Artifact` / `artifact` | `technology` / `passive` | **2-kind / 7-pair collapse** with `package` (`manyToOne: true`); `archi-kind="artifact"`, `archi-form="<form>"` |
| `host` | `workstation` (yes; 1 pair) | `Device` / `device` | `technology` / `active` | **1-to-1** preimage (`manyToOne: false`); `archi-kind="host"`, `archi-form="workstation"` |
| `host` | `cluster`, `cloud-project` (yes; 2 pairs) | `Node` / `node` | `technology` / `active` | **2-to-1 form collapse** (`manyToOne: true`); `archi-kind="host"`, `archi-form="<form>"` |

### 2. The relation → ArchiMate 3.x relationship table (`proposed`)

- [FACT] `archi@1` declares 15 directed binary relations (`source` → `target`) over 55 `(relationType, sourceType, targetType)` tuples in `ARCHI1_TUPLES` (`SPEC:72-90`, `AP:52-68` `RELATIONS`, `AP:70-73` `PART_OF`, `AP:79-85` `ARCHI1_TUPLES`). They give **60 `(relationType, source kind, target kind)` items** when `host` is split by ArchiMate type (`Device` vs `Node`), which collapse onto **42 distinct `(relationType, sourceTypeId, targetTypeId)` triples**; expanding all valid `(source (kind, form), target (kind, form))` pairs of `AP:39-49` yields **509 typed endpoint pairs**, and adding `mode` (3 values) on `accesses` plus `trigger` (5 values) × `event` (absent or present) on `invokes` yields **804 typed relationship inputs**. Encoding $E$ (`CHK:122-137`, `P2:97-101`) partitions instances into `.mmd` `nest` (`partOf`), `rel` (`managedIn`, `runsOn`, `ownedBy`, `operatedBy`, `providesApi`, `uses`, `executedBy` on `component`, `loadedBy` on `artifact`, `accesses{read}`, `accesses{append|write}` on a `single-writer` store), and `edge` (all other instances).
- [FACT] Under `ARCHIMATE_MATRIX_CELLS` (`MAT:19-83, 107-132`, `archimate@2` matrix `archimate-3.2`, 11,569 allowed tuples): (a) **52 of the 55 `ARCHI1_TUPLES`** (55 of the 60 host-split items, 783 of the 804 typed inputs) are allowed under their nominal ArchiMate relationship (`EXP:188-197`); (b) **3 `ARCHI1_TUPLES`** (5 host-split items, 21 of the 804 typed inputs) are forbidden under their nominal relationship because `component`, `runtime`, and `service` map to `ApplicationComponent`: `partOf(component, package)` (3 typed inputs) maps whole → part to `Artifact → ApplicationComponent` where `MAT:29` (`"or"`) forbids `Composition` (`c`), and `runsOn(runtime | service, host)` (18 typed inputs) maps host → runtime/service to `(Device | Node) → ApplicationComponent` (`MAT:48, 61` allow `f`, `o`, `r`, `t`, `v` from `Device` and `Node` to `ApplicationComponent`, but not `i`; `EXP:198` prescribes `Association`, so `Realization` is not used); (c) `Association` (`o`) is allowed on all $60 \times 60 = 3{,}600$ ordered non-junction element pairs (`MAT:20-83`).
- [JUDGMENT] Every `archi@1` relation — `nest`, `rel`, and `edge` alike (`P2:570-573`) — maps to an ArchiMate relationship (`EXP:186-198`) determined purely by the frozen `ARCHI_ARCHIMATE_RELATIONSHIP_TABLE` (`associationFallback` lists `partOf: [{ sourceKind: "component", targetKind: "package" }]` and `runsOn: [{ sourceKind: "runtime", targetKind: "host" }, { sourceKind: "service", targetKind: "host" }]`; `matrixAllows` is asserted in A-T3, never called at run time). Where `associationFallback` matches, the mapping emits directed `Association` (`association`, `directed: true`, `usedAssociationFallback: true`, `EXP:198`) with the same endpoint orientation. **Every** exported relationship carries property `archi-relation-type="<relationType>"` (`EXP:173, 198`).
- **Supersession (`[JUDGMENT]`):** P-6 supersedes `runsOn → Assignment` of `P2:573` and `EXP:191`: every `runsOn` instance exports as a directed `Association` (`usedAssociationFallback: true`) with `archi-relation-type="runsOn"`.

| `archi@1` relation (`E` / `.mmd`, `P2:97-101`) | `archi@1` `source → target` (`AP:52-73`) | Nominal ArchiMate relationship (`xsi:type` / `archimate@2` `id`) | Direction in ArchiMate | Validity in `archimate-3.2` (`MAT:19-132`), `associationFallback`, & `[JUDGMENT]` rationale | Relation properties (`P2:571-573`, `EXP:173, 193-198`) |
|---|---|---|---|---|---|
| `partOf` (`tree` / `nest`) | `component, artifact → package`; `package, runtime, service, api, store, system → system` (8 tuples) | `Composition` / `composition` (`P2:570`, `EXP:190`) | **swapped** (`target → source`, whole → part) | **Allowed** for 7/8 tuples (`MAT:29, 55`); **fallback** on `component → package` (`Artifact → ApplicationComponent`, `MAT:29` `"or"`, 3 typed inputs) → directed `Association` (`EXP:198`) | `archi-relation-type="partOf"` |
| `managedIn` (`tree` / `rel`) | `system, package, component, runtime, service, api, store, artifact → repo` (8 tuples) | `Association` / `association` (`directed: true`, `P2:573`, `EXP:196`) | **forward** (`source → target`) | **Allowed** for all 8/8 tuples (`MAT:22, 26, 29, 46, 55`); `associationFallback: []` | `archi-relation-type="managedIn"` |
| `runsOn` (`tree` / `rel`) | `runtime, service → host` (2 tuples; 4 host-split items; 18 typed inputs) | `Assignment` / `assignment` (`P2:573`, `EXP:191`) | **swapped** (`target → source`, `host → runtime \| service`) | Nominal `Assignment` **forbidden** on `(Device \| Node) → ApplicationComponent` (`MAT:48, 61` `"fortv"`); **fallback** on `runtime, service → host` (18 typed inputs) → directed `Association` (`EXP:198`) | `archi-relation-type="runsOn"` |
| `ownedBy` (`owner` / `rel`) | all 10 non-`actor` kinds `→ actor` (10 tuples; 11 items) | `Association` / `association` (`directed: true`, `EXP:196`) | **forward** (`source → target`) | **Allowed** for all 10/10 tuples (`MAT:22, 26, 29, 46, 48, 55, 61`); `associationFallback: []` | `archi-relation-type="ownedBy"` |
| `operatedBy` (`owner` / `rel`) | `service, host → actor, system` (4 tuples; 6 items) | `Association` / `association` (`directed: true`, `EXP:196`) | **forward** (`source → target`) | **Allowed** for all 4/4 tuples (`MAT:22, 48, 61`); `associationFallback: []` | `archi-relation-type="operatedBy"` |
| `deployedAs` (`arrow` / `edge`) | `package → runtime, service` (2 tuples) | `Realization` / `realization` (`EXP:195`) | **forward** (`source → target`) | **Allowed** for all 2/2 tuples (`Artifact → ApplicationComponent`, `MAT:29` `"or"`); `[JUDGMENT]` package artifact realizes the deployed runtime/service (`EXP:195`) | `archi-relation-type="deployedAs"` |
| `dependsOn` (`arrow` / `edge`) | `package → package` (1 tuple) | `Association` / `association` (`directed: true`, `EXP:196`) | **forward** (`source → target`) | **Allowed** (`Artifact → Artifact`, `MAT:29` `"cgors"`); `associationFallback: []` | `archi-relation-type="dependsOn"` |
| `executedBy` (`detail` on `component` → `rel`; `arrow` on `package` → `edge`) | `component, package → runtime` (2 tuples) | `Realization` / `realization` (`EXP:195`) | **forward** (`source → target`) | **Allowed** for all 2/2 tuples (`MAT:22, 29`); `[JUDGMENT]` keeps uniform `Realization` per `EXP:195` (`MAT:22` also allows `Serving` on `component → runtime`; `archi-relation-type` disambiguates) | `archi-relation-type="executedBy"` |
| `loadedBy` (`detail` on `artifact` → `rel`; `arrow` on `package` → `edge`) | `package, artifact → runtime` (2 tuples) | `Realization` / `realization` (`EXP:195`) | **forward** (`source → target`) | **Allowed** for all 2/2 tuples (`Artifact → ApplicationComponent`, `MAT:29` `"or"`); `[JUDGMENT]` `MAT:29` allows only `o` or `r`; keeps `Realization` per `EXP:195` (`archi-relation-type` disambiguates) | `archi-relation-type="loadedBy"` |
| `invokes` (`arrow` / `edge`) | `runtime → runtime` (1 tuple) | `Triggering` / `triggering` (`EXP:194`) | **forward** (`source → target`) | **Allowed** (`ApplicationComponent → ApplicationComponent`, `MAT:22` `"cfgorstv"`); `associationFallback: []` | `archi-relation-type="invokes"`, `archi-trigger`, opt. `archi-event` |
| `providesApi` (`detail` / `rel`) | `runtime, service → api` (2 tuples) | `Realization` / `realization` (`EXP:195`) | **forward** (`source → target`) | **Allowed** for all 2/2 tuples (`ApplicationComponent → ApplicationInterface`, `MAT:22` `"cfgortv"`; `Assignment` forbidden); `[JUDGMENT]` keeps `Realization` per `EXP:195` (`Composition` also in `MAT:22`) | `archi-relation-type="providesApi"` |
| `consumesApi` (`arrow` / `edge`) | `runtime, service, actor → api` (3 tuples) | `Serving` / `serving` (`EXP:192`) | **swapped** (`target → source`, `api → consumer`) | **Allowed** for all 3/3 tuples (`ApplicationInterface → ApplicationComponent \| BusinessActor`, `MAT:26` `"fotv"`); `associationFallback: []` | `archi-relation-type="consumesApi"` |
| `uses` (`detail` / `rel`) | `actor → runtime, service, system` (3 tuples) | `Serving` / `serving` (`EXP:192`) | **swapped** (`target → source`, `provider → actor`) | **Allowed** for all 3/3 tuples (`ApplicationComponent \| Grouping → BusinessActor`, `MAT:22, 55`); `associationFallback: []` | `archi-relation-type="uses"` |
| `accesses` (`detail` / `footer` → `rel`; `arrow` → `edge`, `P2:100-101`) | `runtime, service, component → store` (3 tuples) | `Access` / `access` (`archimate@2` `accessMode`: `read` → `"read"`, `write \| append` → `"write"`, `PROF-D:225`, `EXP:193`; XML `accessType` spelling belongs to P-3, `external`) | **forward** (`source → target`) | **Allowed** for all 3/3 tuples (`ApplicationComponent → DataObject`, `MAT:22` `"ao"`); `associationFallback: []` | `archi-relation-type="accesses"`, `archi-mode="read" \| "append" \| "write"` |
| `documents` (`arrow` / `edge`) | `artifact → runtime, api, component, package` (4 tuples) | `Association` / `association` (`directed: true`, `EXP:196`) | **forward** (`source → target`) | **Allowed** for all 4/4 tuples (`Artifact → ApplicationComponent \| ApplicationInterface \| Artifact`, `MAT:29`); `associationFallback: []` | `archi-relation-type="documents"` |

### 3. The identifier mapping (`proposed`)

- [FACT] Every authored archi record ref is `<ns>:<local>` with `<local>` matching `LOCAL_ID_RE = /^[a-z][a-z0-9-]*$/` and `MAX_LOCAL_ID_LEN = 40` (`SPEC:369, 490`, `SHP:30-31`, plus `document:<local>` on `document.json:2`). An ArchiMate XML `identifier` is an `xs:ID` / `xs:NCName` (`[A-Za-z_][A-Za-z0-9._-]*` in ASCII, W3C Namespaces in XML, `external`), which allows `-`, `_`, and `.` but forbids `:` (`P2:616`). Neither `<local>` nor `EID` (`^e_[a-z][a-z0-9_]{0,39}$`, `SPEC:654`) contains `.`, and `<local>` never contains `_`.
- [JUDGMENT] **Concept and model identifier bijection (`archimateIdOf` ⇄ `archiRefOfArchimateId`, `proposed`; regexes stay module-private):**
  - Domain `ARCHI_REF_RE = /^(document|entity|relation):[a-z][a-z0-9-]{0,39}$/`; codomain `ARCHIMATE_ID_RE = /^(document|entity|relation)_[a-z][a-z0-9-]{0,39}$/` (valid `NCName`, `8..49` ASCII chars).
  - Forward: $\text{archimateIdOf}(\text{ref}) = \text{ref}.\text{replace}(\text{":"}, \text{"\_"})$ (`"document:archi-joint"` $\mapsto$ `"document_archi-joint"` for `<model identifier>`, `"entity:sys-h2a"` $\mapsto$ `"entity_sys-h2a"`, `"relation:ro-h2a"` $\mapsto$ `"relation_ro-h2a"`). Closed inverse: $\text{archiRefOfArchimateId}(\text{id}) = \text{id}.\text{replace}(\text{"\_"}, \text{":"})$.
- [JUDGMENT] **Per-(view, fold state) view identifier bijection (`archimateViewIdOf` ⇄ `archiViewOfArchimateId`, `proposed`):**
  - Domain: `viewRef` matching `VIEW_REF_RE = /^view:[a-z][a-z0-9-]{0,39}$/` and `collapsed: readonly string[]` of strictly ascending `"entity:<local>"` refs in model UTF-16 order (`SPEC:693`).
  - Formula: `"view_" + <local> + "." + C`, where `C` is the P-4 header token `COLLAPSED` (`SPEC:645, 654, 715`: each ref mapped by a module-private `toEid`, equal to `MMD:516-519` (`"e_" + local.replace(/-/g, "_")`), sorted in strictly ascending EID byte order, and joined with `.` in place of `,`; `C` is `"-"` when `collapsed` is empty). Examples: `"view_roles.-"` and `"view_roles.e_pkg_h2a.e_sys_h2a"`.
  - Codomain: `ARCHIMATE_VIEW_ID_RE = /^view_[a-z][a-z0-9-]{0,39}\.(-|e_[a-z][a-z0-9_]{0,39}(\.e_[a-z][a-z0-9_]{0,39})*)$/` (with EIDs strictly ascending in EID byte order without duplicates).
  - Closed inverse (`archiViewOfArchimateId`): split at the first `.` to recover `viewRef = "view:" + <local>`; if `C === "-"`, `collapsed = []`, else split `C` on `.`, verify strictly ascending EID byte order without duplicates (`SPEC:721`), map each EID back with a module-private `fromEid`, equal to `MMD:521-523` (`"entity:" + eid.slice(2).replace(/_/g, "-")`) (`SPEC:721`), and sort `collapsed` in model UTF-16 order. Because `LOCAL` and `EID` contain no `.`, the map is injective and its inverse is closed.
  - Each exported view carries `archi-ref = "view:<local>"`; all fold states of one view share this `archi-ref` value because views are derived and never read back (`P2:575, 579`).
- [JUDGMENT] **Reserved `xs:ID` prefixes (P-6 / P-3 contract) and collision-free counts (asserted by A-T1):** P-6 reserves the prefixes `entity_`, `relation_`, `document_`, `view_`, and `propdef-`; P-3 identifiers (view nodes, connections, organization items) must use none of them. Across `FX`, `archimateIdOf` and `archimateViewIdOf` produce zero collisions: `joint-r2` (1 document + 29 entities + 64 relations = 94 concept/model ids; 4 views with $3 + C = 29$ fold states and 26 distinct `(view, collapsed)` pairs → 26 view ids), `joint-r2-teintes` (1 + 29 `archi@1` / 33 total entities + 64 `archi@1` / 67 total relations = 94 `archi@1` / 101 total ids; 1 view with 9 states and 9 distinct pairs → 9 view ids), and `hosts-r3` (1 + 41 + 79 = 121 ids; 2 views with 15 states and 14 distinct pairs → 14 view ids; 53 total fold states and 49 distinct view ids across the 7 corpus views, `SPEC:535`).
- [JUDGMENT] **Identity and import rules (`P2:566, 616-619`, `EXP:204-205`):** Every exported model, element, relationship, and view carries property `archi-ref` (`unverified` whether an ArchiMate tool save preserves `archi-ref` until test A-2 of `EXP:210` runs on a pinned tool, `P2:618`). On import, `archi-ref` decides identity: (a) an XML `identifier` matching `ARCHIMATE_ID_RE` or `ARCHIMATE_VIEW_ID_RE` must equal the forward mapping of `archi-ref` (for the model, element, or relationship, `archimateIdOf(archi-ref)`; for a view, prefix `"view_" + <local> + "."`), else import refuses with `archi-input-invalid` at `"/identifier"`; identifiers matching neither pattern are ignored; (b) two elements or two relationships with the same `archi-ref` refuse with `archi-input-invalid` (views may share `archi-ref` across distinct fold states); (c) an element whose ArchiMate type is outside the 8 mapped types (§1) and that carries no `archi-*` property is not imported (`P2:619`, `EXP:205`), whereas an element of one of the 8 mapped types without `archi-kind` refuses with `archimate-kind-missing` (`P2:617`, `EXP:204`).

### 4. The property vocabulary (`proposed`) and canonical emission order

- [JUDGMENT] Native ArchiMate fields carry entity `name` (`<name>`, `P2:567`), entity `role` (`<documentation>`, omitted when an `actor` has no `role`, `P2:569`, `EXP:200`), and relation `label` (`<name>` when present, `P2:571`). Every other semantic datum and the P-4 carrier ride in the closed **23-name `archi-*` string property vocabulary** (`ARCHI_ARCHIMATE_PROPERTIES`, `proposed`), each declared once in `<propertyDefinitions>` with `NCName` identifier `propdef-<name>` and `type="string"`. Each property value is the attribute's `value` string (`evidence.items[i - 1].value` for slot $i$). `archiAttributesOfArchimate` rebuilds `{ kind, value }` and `{ kind: "collection", items }` from the attribute kinds of the `archi@1` declaration (`AP:20-36, 90-99`).
- [JUDGMENT] **P-4 §6 item 6 (`SPEC:739`):** An ArchiMate exchange file that exports $k$ ArchiMate views (one per exported fold state, `P2:575`) carries $k$ frames in $k$ model-level `archi-carrier` properties (`propertyDefinitionRef="propdef-archi-carrier"`, this section), each holding `encodeArchiCarrier({ text, view, collapsed }).value` (`SPEC:682-705`, XML-escaped by P-3 per `SPEC:661, 736`); an SVG or PlantUML file carries one frame. Line 0 of each frame (`view=<local> collapsed=<EIDs or ->`, `SPEC:639-646`) self-identifies its pair on decode. Whether $k$ `<property>` entries sharing `propertyDefinitionRef="propdef-archi-carrier"` and holding multi-line values validate under the Open Group XSD is `unverified` until test A-1 runs with `xmllint` (`EXP:206-207`; presence `unverified`). Whether they survive a tool save is `unverified` until test A-2 (`EXP:210`) runs on a pinned tool.
- [JUDGMENT] **Canonical emission order (`EXP:14` X2):** (1) The row order of `ARCHI_ARCHIMATE_PROPERTIES` below (with `archi-evidence-1` .. `archi-evidence-8` ascending) is the emission order both of `<propertyDefinitions>` and of each concept's `<properties>`. (2) The $k$ exported views and the $k$ model-level `archi-carrier` properties follow strictly ascending `(view local, COLLAPSED token)`, compared byte by byte. (3) Each `(view, fold state)` pair appears at most once per file.

| Property definition name (`propdef-<name>`) | `scope` | `appliesTo` / `presence` | `attribute` & value encoding (`SPEC:49, 54-88, 493`, `AP:20-68, 90-99`) |
|---|---|---|---|
| `archi-carrier` | `["model"]` | — / `"per-pair"` | `engram.archi-carrier/1` frame string (`SPEC:638-647`, `EXP:55`) |
| `archi-ref` | `["model", "element", "relationship", "view"]` | — / `"required"` | Original ref `"document:<local>" \| "entity:<local>" \| "relation:<local>" \| "view:<local>"` (`"document:<local>"` on the model, `P2:566, 616`) |
| `archi-kind` | `["element"]` | — / `"required"` | `archi@1` entity kind (`"actor"` .. `"host"`, 11 values, `P2:568, 617`, `EXP:173, 204`) |
| `archi-form` | `["element"]` | `["actor", "package", "runtime", "api", "store", "artifact", "host"]` / `"if-present"` | `form`: closed form enum of `archi-kind` (`AP:39-49`, `P2:568`, `EXP:173`); absent when `form` is omitted |
| `archi-relation-type` | `["relationship"]` | — / `"required"` | `archi@1` relation type (`"partOf"` .. `"documents"`, 15 values, `P2:571`, `EXP:173, 198`) |
| `archi-lifecycle` | `["element", "relationship"]` | — / `"required"` | `lifecycle`: `"current" \| "proposed" \| "retired"` (`AP:26`, `P2:569`, `EXP:99, 200`) |
| `archi-evidence-1` .. `archi-evidence-8` | `["element", "relationship"]` | — / `1`: `"required"`, `2..8`: `"if-present"` | `evidence`: `evidence.items[i - 1].value` for $1 \le i \le k \le 8$, contiguous `1..k` (`AP:27-30`, `P2:569`, `EXP:99`; whether 1-based slots preserve array order under tool property sorting is `unverified` until `EXP:210` A-2) |
| `archi-short-name` | `["element"]` | — / `"if-present"` | `shortName`: NFC single-line string $\le 40$ (`AP:33`, `SPEC:493`, `EXP:200`) |
| `archi-category` | `["element"]` | — / `"if-present"` | `category`: key `^[a-z][a-z0-9-]*$`, length `1..40` (`AP:31`, `EXP:200`) |
| `archi-url` | `["element"]` | `["repo"]` / `"if-present"` | `url`: NFC single-line string $\le 200$ (`AP:41`, `SPEC:493`) |
| `archi-version` | `["element"]` | `["package"]` / `"if-present"` | `version`: NFC single-line string $\le 40$ (`AP:42`, `SPEC:493`) |
| `archi-access` | `["element"]` | `["api"]` / `"required"` | `access`: `"read-only" \| "read-write"` (`AP:46`) |
| `archi-writer-policy` | `["element"]` | `["store"]` / `"required"` | `writerPolicy`: `"single-writer" \| "multi-writer"` (`AP:47`) |
| `archi-trigger` | `["relationship"]` | `["invokes"]` / `"required"` | `trigger`: `"hook" \| "poll" \| "mcp-stdio" \| "command" \| "schedule"` (`AP:62`) |
| `archi-event` | `["relationship"]` | `["invokes"]` / `"if-present"` | `event`: NFC single-line string $\le 80$ (`AP:62`, `SPEC:493`) |
| `archi-mode` | `["relationship"]` | `["accesses"]` / `"required"` | `mode`: `"read" \| "append" \| "write"` (`EXP:193`, `AP:66`; disambiguates `"append"` from `"write"`) |

### 5. The engram API (`proposed`, on `@sentropic/engram/archi` only)

- [JUDGMENT] Implemented in `src/ontology-guardian/archi-archimate.ts` (`proposed`) and re-exported from `src/archi.ts` (`@sentropic/engram/archi`, `PKG:51-54`). Nothing is added to `@sentropic/engram/archi-mermaid` (`src/archi-mermaid/index.ts`, `PKG:59-62`), keeping `CHUNK-T:155-174` unchanged. Pure deep-frozen data and total functions only; XML serialization and parsing belong to P-3 (`P2:614-619`).

```ts
export const ARCHI_ARCHIMATE_DIAGNOSTIC_CODES = Object.freeze(["archimate-kind-missing"] as const); // proposed
export type ArchiArchimateDiagnosticCode = (typeof ARCHI_ARCHIMATE_DIAGNOSTIC_CODES)[number];       // proposed
export type ArchiArchimateFailureCode = ArchiArchimateDiagnosticCode | "archi-input-invalid";       // proposed
export interface ArchiArchimateDiagnostic extends EngramDiagnostic {                                // proposed
  readonly origin: "engram"; readonly severity: "error"; readonly path: string; readonly subjectRef: string;
  readonly code: ArchiArchimateFailureCode; readonly nativeCode: ArchiArchimateFailureCode;
}
export type ArchiArchimateResult<T> =                                                               // proposed
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly [ArchiArchimateDiagnostic, ...ArchiArchimateDiagnostic[]] };
export interface ArchiArchimateElementRow {                                                         // proposed (32 rows, §1)
  readonly kind: string; readonly form?: string; readonly archimateElement: string; readonly archimateTypeId: string; // MAT:14
  readonly layer: string; readonly aspect: string; readonly manyToOne: boolean;                     // false only for host:workstation
}
export interface ArchiArchimateElementMapping extends ArchiArchimateElementRow {                    // proposed
  readonly properties: { readonly "archi-kind": string; readonly "archi-form"?: string };
}
export interface ArchiArchimateRelationshipRow {                                                    // proposed (15 rows, §2)
  readonly relationType: string; readonly nominalRelationship: string; readonly nominalTypeId: string;
  readonly direction: "forward" | "swapped";
  readonly associationFallback: readonly { readonly sourceKind: string; readonly targetKind: string }[]; // deep-frozen
}
export interface ArchiArchimateRelationshipMapping {                                                // proposed
  readonly archimateRelationship: string; readonly archimateTypeId: string;
  readonly nominalRelationship: string; readonly nominalTypeId: string;
  readonly direction: "forward" | "swapped"; readonly usedAssociationFallback: boolean;
  readonly archimateSource: ArchiArchimateElementMapping; readonly archimateTarget: ArchiArchimateElementMapping;
  readonly directed?: true; readonly accessMode?: "read" | "write";                                 // PROF-D:225, 228-229
  readonly properties: Readonly<Record<string, string>>;                                            // archi-relation-type, archi-mode?, archi-trigger?, archi-event?
}
export interface ArchiArchimateRelationReversed {                                                   // proposed
  readonly relationType: string; readonly mode?: string; readonly trigger?: string; readonly event?: string;
  readonly source: { readonly kind: string; readonly form?: string }; readonly target: { readonly kind: string; readonly form?: string };
}
export interface ArchiArchimatePropertyDef {                                                        // proposed (23 rows in emission order, §4)
  readonly name: string; readonly identifier: string; readonly scope: readonly ("model" | "element" | "relationship" | "view")[];
  readonly appliesTo?: readonly string[]; readonly attribute?: string; readonly presence: "required" | "if-present" | "per-pair";
}
export interface ArchiArchimateViewState { readonly viewRef: string; readonly collapsed: readonly string[]; } // proposed
export interface ArchiArchimateDecodedRecord {                                                      // proposed
  readonly ref: string; readonly kind?: string; readonly relationType?: string; readonly attributes: Readonly<Record<string, unknown>>;
}
export const ARCHI_ARCHIMATE_ELEMENT_TABLE: readonly ArchiArchimateElementRow[];                    // proposed (32 deep-frozen rows)
export const ARCHI_ARCHIMATE_RELATIONSHIP_TABLE: readonly ArchiArchimateRelationshipRow[];          // proposed (15 deep-frozen rows)
export const ARCHI_ARCHIMATE_PROPERTIES: readonly ArchiArchimatePropertyDef[];                      // proposed (23 deep-frozen defs)
export function archimateIdOf(ref: unknown, options?: { readonly subjectRef?: string }): ArchiArchimateResult<string>;
export function archiRefOfArchimateId(id: unknown, options?: { readonly subjectRef?: string }): ArchiArchimateResult<string>;
export function archimateViewIdOf(viewRef: unknown, collapsed: unknown, options?: { readonly subjectRef?: string }): ArchiArchimateResult<string>;
export function archiViewOfArchimateId(id: unknown, options?: { readonly subjectRef?: string }): ArchiArchimateResult<ArchiArchimateViewState>;
export function archimateElementOf(input: unknown, options?: { readonly subjectRef?: string }): ArchiArchimateResult<ArchiArchimateElementMapping>;
export function archiEntityTypeOfArchimate(input: unknown, options?: { readonly subjectRef?: string }): ArchiArchimateResult<{ readonly kind: string; readonly form?: string }>;
export function archimateRelationshipOf(input: unknown, options?: { readonly subjectRef?: string }): ArchiArchimateResult<ArchiArchimateRelationshipMapping>;
export function archiRelationTypeOfArchimate(input: unknown, options?: { readonly subjectRef?: string }): ArchiArchimateResult<ArchiArchimateRelationReversed>;
export function archimatePropertiesOf(record: unknown, options?: { readonly subjectRef?: string }): ArchiArchimateResult<Readonly<Record<string, string>>>;
export function archiAttributesOfArchimate(properties: unknown, context?: unknown, options?: { readonly subjectRef?: string }): ArchiArchimateResult<ArchiArchimateDecodedRecord>;
```

- **Input shapes and refusal rules (`[JUDGMENT]`, closed objects, first failure wins, default `subjectRef = "archimate"`):**
  - `archimateIdOf` / `archiRefOfArchimateId`: non-string or not matching `ARCHI_REF_RE` / `ARCHIMATE_ID_RE` (§3) → `archi-input-invalid` (`path: ""`).
  - `archimateViewIdOf(viewRef, collapsed, options?)` / `archiViewOfArchimateId(id, options?)`: `viewRef` not matching `VIEW_REF_RE` (`"/viewRef"`), `collapsed` not an array (`"/collapsed"`), or `collapsed[i]` not matching `^entity:[a-z][a-z0-9-]{0,39}$`, duplicate, or unsorted in UTF-16 order (`"/collapsed/<i>"`) → `archi-input-invalid`; `id` not matching `ARCHIMATE_VIEW_ID_RE` or EIDs duplicated/unsorted in EID byte order → `archi-input-invalid` (`path: ""`).
  - `archimateElementOf({ kind, form? }, options?)`: non-object or unknown key (`""` or `"/<key>"`), unknown `kind` (`"/kind"`), or missing required / forbidden / unknown `form` (`"/form"`) → `archi-input-invalid`.
  - `archiEntityTypeOfArchimate(input, options?)`: accepts the closed keys of `ArchiArchimateElementMapping` (`archimateTypeId` and `properties` required; `archimateElement?`, `layer?`, `aspect?`, `manyToOne?`, `kind?`, `form?` optional). Check order: shape and unknown keys (`""` or `"/<key>"`); then `properties` (`"/properties"`); then `properties["archi-kind"]` (missing or `""` → **`archimate-kind-missing`** at `path: "/properties/archi-kind"`, `EXP:204`, `P2:617`; unknown kind or invalid `properties["archi-form"]` → `archi-input-invalid`); then equality against the recovered forward output (every supplied key, required or optional, must deep-equal the same key of `archimateElementOf(recovered).value`, else `archi-input-invalid` at its pointer).
  - `archimateRelationshipOf({ relationType, source, target, mode?, trigger?, event? }, options?)`: closed keys; validates `source` and `target` via `archimateElementOf` (`"/source..."`, `"/target..."`), checks `(relationType, source.kind, target.kind)` in `ARCHI1_TUPLES` (`AP:79-85`, else `archi-input-invalid` at `"/relationType"` or `"/target"`), requires `mode` on `accesses` and refuses `mode` outside `accesses` (`"/mode"`), requires `trigger` and optional `event` on `invokes` and refuses `trigger` or `event` outside `invokes` (`"/trigger"`, `"/event"`), and reads the frozen `ARCHI_ARCHIMATE_RELATIONSHIP_TABLE` row (`direction`, `associationFallback`) to orient `(archimateSource, archimateTarget)` and set `usedAssociationFallback`, `directed: true` (on `association`), and `accessMode` (on `access`, no `accessType`).
  - `archiRelationTypeOfArchimate(input, options?)`: accepts the closed keys of `ArchiArchimateRelationshipMapping` (`archimateTypeId`, `archimateSource`, `archimateTarget`, and `properties` required, plus `directed: true` required when `archimateTypeId === "association"` and `accessMode` required when `archimateTypeId === "access"`; `archimateRelationship?`, `nominalRelationship?`, `nominalTypeId?`, `direction?`, `usedAssociationFallback?` optional). Check order: shape and unknown keys (`""` or `"/<key>"`); then `properties` (`"/properties"`); then `properties["archi-relation-type"]` (an absent, empty or unknown `properties["archi-relation-type"]` → `archi-input-invalid` at `"/properties/archi-relation-type"`, plus refusing `archi-mode` outside `accesses` and `archi-trigger`/`archi-event` outside `invokes`); then endpoints (reads `direction` from the `ARCHI_ARCHIMATE_RELATIONSHIP_TABLE` row named by `properties["archi-relation-type"]`, un-swaps `archimateSource`/`archimateTarget` when `direction === "swapped"`, and validates endpoints via `archiEntityTypeOfArchimate`); then equality (verifies the recovered input through `archimateRelationshipOf(recovered).value` and checks that every supplied key, required or optional, deep-equals the same key of `archimateRelationshipOf(recovered).value`, else `archi-input-invalid` at its pointer).
  - `archimatePropertiesOf(record, options?)` & `archiAttributesOfArchimate(properties, context?, options?)`: `archimatePropertiesOf` accepts `{ ref, kind?, relationType?, attributes? }`, validates all §4 attributes (extracting each attribute's `.value` string and `evidence.items[i - 1].value`, while ignoring native `name`, `role`, `label`), and emits the `archi-*` record in §4 canonical order. `archiAttributesOfArchimate` validates `properties` (and optional `context: { kind?, relationType?, scope?, identifier? }`), rebuilds `{ kind, value }` and `{ kind: "collection", items }` from the attribute kinds of the `archi@1` declaration (`AP:20-36, 90-99`, returning `{}` for a view and for the model), emitting `archimate-kind-missing` when an entity lacks `archi-kind`, and `archi-input-invalid` on any gap in `archi-evidence-1..8`, any property outside the `scope` or `appliesTo` of its §4 row, any missing required property, or an `identifier` matching `ARCHIMATE_ID_RE` / `ARCHIMATE_VIEW_ID_RE` that disagrees with `archi-ref` (`"/identifier"`, §3).

## P-6 review (08/11)

Reviewer: Claude Opus 5.5 (by owner ruling of 2026-11-08, 2 rounds, final verdict **SOLID**; `review-spec-archimate-opus.md`, `review-spec-archimate-opus-r2.md` against `SPEC_DELTA_ARCHIMATE_P6.md` → `.r2.md`).

- **Round-1 ledger (14 findings: B1, M1–M4, m1–m9 — folded into r2):**
  - **B1** (BLOCKER — duplicate view `xs:ID` across fold states): Added `archimateViewIdOf(viewRef, collapsed)` ⇄ `archiViewOfArchimateId(id)` (`"view_" + <local> + "." + C`, `ARCHIMATE_VIEW_ID_RE`), added `document` to `archimateIdOf` (`"document_archi-joint"` for `<model>`), reserved `entity_`, `relation_`, `document_`, `view_`, `propdef-` for P-6 vs P-3, and added the 53-state / 49-pair view-id disjointness check (`view_roles` default + expanded witness) to A-T1 and A-T2 (P-6 §3, §5, §6.2).
  - **M1** (MAJOR — `AP` citations off by 3 + 5 other citations): Corrected every `AP` citation (`:38-50`, `:39-49`, `:52-68`, `:70-73`, `:79-85`, `:52-73`, `:26-68`, `:27-30`, `:33`, `:31`, `:41`, `:42`, `:46`, `:47`, `:62`, `:66`), quoted `LOCAL_ID_RE = /^[a-z][a-z0-9-]*$/` and `MAX_LOCAL_ID_LEN = 40` (`SHP:30-31`), cited `PROF-D:225` `accessMode` (`"read"`, `"write"`) with XML `accessType` as P-3 `external`, cited `AP:33` + `SPEC:493` and `AP:31`, cited `P2:97-101`, and retagged the §3 fixture counts as `[JUDGMENT]` asserted by A-T1 (P-6 §1–§5).
  - **M2** (MAJOR — API types undeclared; reverse inputs & attributes): Declared `ArchiArchimateElementRow`, `ArchiArchimateElementMapping`, `ArchiArchimateRelationshipRow`, `ArchiArchimateRelationshipMapping`, `ArchiArchimateRelationReversed`, `ArchiArchimatePropertyDef`, `ArchiArchimateViewState`, and `ArchiArchimateDecodedRecord`; closed reverse-function input keys to their forward output keys, read `direction` from the table row, refused `mode` outside `accesses` and `trigger`/`event` outside `invokes`, and replaced `accessType` with `accessMode?: "read" | "write"` (P-6 §5).
  - **M3** (MAJOR — §2.8 crosswalk amendment missing): Replaced the `ArchiMate` column of `SPEC:167-177` for all 11 kinds (`repo` → `grouping`, `runtime`/`service` → `application-component`, `host` → `device`/`node`, all qualified `P` restored by `archi-kind` / `archi-form`) while keeping `SPEC:163` (« never a conformance claim ») (§2.8, P-6 §1).
  - **M4** (MAJOR — relationship test domain misstated): Stated the 55 tuples → 60 host-split items → 42 distinct `(relationType, sourceTypeId, targetTypeId)` triples → 509 typed endpoint pairs → 804 typed relationship inputs, updated A-T1 and A-T2 to enumerate all 804 inputs, updated A-T3 to assert `usedAssociationFallback === true` on exactly 21 typed inputs (`partOf(component, package)`: 3; `runsOn`: 18) and `false` on 783, and updated the Lot 7 row (P-6 §2, §6.2, §7).
  - **m1** (MINOR — external claims & `MAT:48, 61` parenthetical): Replaced the §2 parenthetical with the exact `MAT:48, 61` (`f, o, r, t, v` allowed, `i` forbidden; `EXP:198` prescribes `Association`) statement, marked `archi-ref` survival, $k$ `archi-carrier` properties, and `archi-evidence-1..8` sorting under tool saves as `unverified`, and tagged the W3C `NCName` grammar as `external` (P-6 §2–§4).
  - **m2** (MINOR — code amendment edits & drift guards): Noted that `ARCHI_CODE_SET` (`SHP:40`) is derived from `ARCHI_DIAGNOSTIC_CODES`, updated `CHK:11, 52` comments to `38-code`, added the `archimate-kind-missing` and `archimate-edit-unsupported` owner-table rows in §5.5, added `expectTypeOf` to A-T4, and specified all three `CANON-T:216-244` updates (`:217, 219-220`, `startsWith("archimate-")` filter, and `:236` slice) (§5.5, §6.1, §6.2).
  - **m3** (MINOR — import rules on identity, required types, foreign types): Specified that `archi-ref` decides identity (matching `ARCHIMATE_ID_RE` / `ARCHIMATE_VIEW_ID_RE` checked at `"/identifier"`, non-matching ignored; duplicate element/relationship `archi-ref` refused), required `archimateTypeId` in both reverse functions and `directed: true` on associations, and distinguished unimported foreign types without `archi-*` (`P2:619`) from `archimate-kind-missing` on the 8 mapped types (`P2:617`) (P-6 §3, §5, §6.2).
  - **m4** (MINOR — property vocabulary codec & round-trip test): Added `archimatePropertiesOf` and `archiAttributesOfArchimate` to P-6 §5, added the full-fixture entity/relation/view attribute round-trip check (`canonicalBytes` + evidence order) to A-T2, and added refusals for evidence-slot gaps and out-of-scope/out-of-`appliesTo` properties to P-6 §5 and A-T4 (P-6 §5, §6.2).
  - **m5** (MINOR — canonical emission order): Stated the three emission-order rules in P-6 §4: `ARCHI_ARCHIMATE_PROPERTIES` order for definitions and concept properties, strictly ascending byte order of `(view local, COLLAPSED token)` for the $k$ views and $k$ `archi-carrier` properties, and at most one occurrence per `(view, fold state)` pair per file (P-6 §4).
  - **m6** (MINOR — fallback frozen in table, not computed via `matrixAllows`): Added `associationFallback` to `ArchiArchimateRelationshipRow`, specified that `archimateRelationshipOf` reads only the frozen tables, and kept `matrixAllows` in A-T3 to verify that the frozen fallback matches the matrix verdict across all 804 inputs (P-6 §2, §5, §6.2).
  - **m7** (MINOR — `Realization` rationale on `deployedAs`, `executedBy`, `loadedBy`, `providesApi`): Added explicit `[JUDGMENT]` rationales to the `deployedAs`, `executedBy`, `loadedBy`, and `providesApi` rows in P-6 §2 noting the alternative relationships allowed by `MAT:22, 29` (`Serving`, `Association`, `Composition`) and how `archi-relation-type` preserves the exact `archi@1` relation (P-6 §2).
  - **m8** (MINOR — `generic@2` `contains`, `accesses` placement, `runsOn` supersession, P-4 item 6, section landing): Covered `generic@2` `contains` in P-6 §1, added `.mmd` placements (`detail`/`footer` → `rel`; `arrow` → `edge`) to `accesses` in P-6 §2, added the `runsOn → Assignment` supersession note in P-6 §2, amended `SPEC:739` in P-4 §6 item 6 and P-6 §4, and placed `## P-6 — the ArchiMate mapping (engram-owned)` after `## P-4 review (08/11)` (P-4 §6, P-6 §1, §2, §4).
  - **m9** (MINOR — recursive freeze, spelled-out 46 exports, split commit (b), SPEC section refs): Added recursive `Object.isFrozen` check to A-T4, spelled out all 14 new exports and their positions in the 46-name `CHUNK-T:107-140` list (keeping regexes module-private), split commit `(b)` into `(b1)`, `(b2)`, `(b3)`, and referenced `SPEC` section names in Lot 7 (P-6 §3, §6.1, §6.2, §7).
- **Round-2 ledger (9 MINOR findings: N1–N9 — folded here):**
  - **N1** (MINOR — fold-state counts are 49 distinct pairs, not 46): Updated per-fixture and corpus view-id counts from `25 / 8 / 13 / 46` to `26 / 9 / 14 / 49` across the 53 fold states, and stated that A-T1 derives the $3 + C$ states via `ING:803-823` (P-6 §3, §6.1, §6.2 A-T1).
  - **N2** (MINOR — A-T2 attribute round-trip expectations, typed attribute wrappers, `archi-form` `appliesTo`): Specified in A-T2 that `archiAttributesOfArchimate` returns the record's attributes minus native `name`, `role` and `label` (`{}` for a view and for the model); stated in P-6 §4–§5 that each property holds the attribute's `.value` string (`evidence.items[i - 1].value` for slot $i$) and `archiAttributesOfArchimate` rebuilds `{ kind, value }` and `{ kind: "collection", items }` from `AP:20-36, 90-99`; and replaced the prose `archi-form` `appliesTo` with `["actor", "package", "runtime", "api", "store", "artifact", "host"]` (P-6 §4, §5, §6.2 A-T2).
  - **N3** (MINOR — A-T3 calls `matrixAllows` with 3 arguments instead of 4): Updated A-T3 to bind `const TUPLES = expandMatrixTuples()` and assert both `archimateRelationshipOf(input).value.usedAssociationFallback === !matrixAllows(TUPLES, nominalTypeId, archimateSource.archimateTypeId, archimateTarget.archimateTypeId)` and `matrixAllows(TUPLES, archimateTypeId, archimateSource.archimateTypeId, archimateTarget.archimateTypeId) === true` (§6.2 A-T3).
  - **N4** (MINOR — reverse relationship `archi-relation-type` refusal, full-key equality, check order): Added the `/properties/archi-relation-type` refusal on absent/empty/unknown `archi-relation-type`, required every supplied key (required or optional) in `archiEntityTypeOfArchimate` and `archiRelationTypeOfArchimate` to deep-equal the recovered forward output, stated the deterministic check order (`shape and unknown keys → properties → archi-kind / archi-relation-type → endpoints → equality`), and added absent `archi-relation-type` and retyped-relationship cases to A-T4 (P-6 §5, §6.2 A-T4).
  - **N5** (MINOR — `<model>` identifier matches `ARCHIMATE_ID_RE` without model `archi-ref`): Widened `archi-ref` `scope` to `["model", "element", "relationship", "view"]` with `"document:<local>"` on the model and included `archimateIdOf(archi-ref)` for the model in rule (a) of P-6 §3 (P-6 §3, §4, §5).
  - **N6** (MINOR — no view-id witness where EID byte order and UTF-16 order differ): Added `archimateViewIdOf("view:roles", ["entity:sys-a-b", "entity:sys-a1"])` ⇄ `"view_roles.e_sys_a1.e_sys_a_b"` to A-T2 and the corresponding unsorted-UTF-16 (`"/collapsed/1"`) and unsorted-EID (`""`) refusals to A-T4 (§6.2 A-T2, A-T4).
  - **N7** (MINOR — `toEid` and `fromEid` are module-private in `MMD`): Specified that P-6 uses module-private `toEid` and `fromEid` helpers equal to `MMD:516-519` (`"e_" + local.replace(/-/g, "_")`) and `MMD:521-523` (`"entity:" + eid.slice(2).replace(/_/g, "-")`) (P-6 §3).
  - **N8** (MINOR — `SPEC:163` `[FACT]` attributes the ArchiMate column to `PE`): Amended `SPEC:163` so `PE §3.1` qualifies C4 and Backstage while attributing the ArchiMate column to P-6 (« P-6 — the ArchiMate mapping (engram-owned) » §1) (§2.8).
  - **N9** (MINOR — XSD validity is settled by test A-1, not A-2): Split the `unverified` note on $k$ model-level `archi-carrier` properties between test A-1 with `xmllint` (`EXP:206-207`, presence `unverified`) for Open Group XSD validation and test A-2 (`EXP:210`) for tool-save survival (P-4 §6 item 6, P-6 §4).
