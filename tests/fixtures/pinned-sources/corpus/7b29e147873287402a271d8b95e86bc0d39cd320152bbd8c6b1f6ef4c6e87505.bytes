# SPEC EVOL — GD-BPMN-MODDLE: exhaustive bpmn-moddle coverage in `diagram-core` (A′)

**Status**: specification and traceability only — no implementation in this PR.
**Date**: 2026-10-15. **Owner decision rendered**: 2026-10-04.
**Base measured**: `origin/main` = `85a69e89`; rebased on `4a5e80a7` (#166, #167, #168). Between `85a69e89` and `4a5e80a7` the cited files are unchanged except
`spec/graph-dataviz-decisions.json` (D2 and D4 marked rendered by #168); the check
(`git diff --quiet 85a69e89 4a5e80a7 -- docs/graph-dataviz-migration-plan.md spec/ packages/diagram-core packages/diagram-canvas scripts/verify-layering.test.mjs scripts/verify-publishable-licensing.test.mjs plan docs/a0-csp-dependency-qualification.md` with `spec/` restricted to the spec files cited) exits 0.
**Revised** 2026-10-16 after the independent review and the owner's F1 decision of 2026-10-15 (Annex A). `packages/diagram-core` and `packages/diagram-canvas` are
byte-identical to `0ce2c48f`, the revision the decision dossier measured
(`git diff --quiet 0ce2c48f origin/main -- packages/diagram-core packages/diagram-canvas` → exit 0).
**Programme**: [decisions](SPEC_DECISIONS_GRAPH_DATAVIZ_REPATRIATION.md), [M2-MODEL](SPEC_EVOL_GD_M2_MODEL.md),
[M2-CANVAS](SPEC_EVOL_GD_M2_CANVAS.md), [migration plan](../docs/graph-dataviz-migration-plan.md) (amended in the
same PR, section « Décision d'ordre »).
**Track**: see §17.

Conventions. `DC:` = `packages/diagram-core/` in this repository at `85a69e89`. `BC@84c93dc:` =
`git -C /home/antoinefa/src/bpmn-canvas show 84c93dc:<path>` (local, **unpushed** branch
`workbench/functions-20261004`; see §4). `NM:` = `/home/antoinefa/src/bpmn-canvas/node_modules/` (bpmn-moddle
10.3.1, moddle 8.2.1, moddle-xml 12.3.1, per each `package.json` line 3). Every figure carries its command or
file:line. Citations `docs/…:NN`, `spec/…:NN`, `plan/…:NN` and `scripts/…:NN` refer to the base `85a69e89` unless stated
otherwise (this PR's own amendment shifts lines of `docs/graph-dataviz-migration-plan.md`). `[JUDGMENT]` marks a design choice of this spec, not a measured fact. `unknown` marks a gap.

---

## 1. Decision

### 1.1 Owner choice (2026-10-04)

1. **A′ now.** `@sentropic/diagram-core` covers bpmn-moddle **exhaustively** through **profiles generated** from the
   moddle descriptors (`bpmn`, `bpmndi`, `dc`, `di`, `bioc`, `color`, plus the `sem:` dialect). The kernel receives
   the general mechanisms this requires. `diagram-core` stays zero-dependency, zero-DOM and private (D1-A).
2. **Typed coverage** of every type and property, with **full source retention** for unknown namespaces, counted
   separately. Editing and rendering stay in `bpmn-canvas`.
3. Verbatim: « bpmn-moddle (toujours dernière version) est importé pour tests de compatibilité bijective pour
   détecter les breaking changes ». The latest bpmn-moddle is a **test dependency of a separate package**. Tests
   prove the bijection **moddle JSON ↔ `DiagramState`** and descriptor coverage (100 % of the types and properties
   of the latest version mapped). A CI job installs `bpmn-moddle@latest` outside the lockfile, on relevant PRs and on
   a schedule, and fails on any break.

### 1.2 Clarifications that take precedence over the dossier

- The exchange pivot is the **moddle object model serialised as JSON ("moddle JSON")**, not XML. XML appears only at
  the edges (parse and export, done by bpmn-moddle inside the tests). Owner rule relayed by d2d-cond: « un seul
  modèle JSON moddle de bout en bout, XML seulement en sortie ». The dossier's « the bridge goes through XML » (its
  §5) is superseded.
- The target moddle JSON shape is **F1 of bpmn-canvas** (§4). Status: **shape to align, `unknown` until published**.
- **Owner decision on F1 (2026-10-15)**: F1 **preserves** unknown extensions instead of refusing them — content of
  `extensionElements`, foreign attributes, unregistered `xmlns` declarations with their URI and prefix, and the same
  rule for `xsi` — as bpmn-moddle does, with a faithful XML round trip. Removal of out-of-profile content is done on
  the d2d side, by its profile import, with a typed loss report. This is a separate F1 lot on the bpmn-canvas and d2d
  side, tests first, including an XML round trip of MIWG `B.1.0`, `C.4.0` and `C.5.0`. It settles F1-A1 and F1-A2
  (§4.4). The DS codec never removes anything: unknown content becomes `PreservedExtension` (K11).
- **D3 = C and the export direction** (conductor arbitration, 2026-10-15): the bijection required by the owner's
  verbatim implies the State → moddle JSON direction for the BPMN pivot. D3 = C (import first, export later) does not
  forbid this consequence; XML export stays at the test edge.
- **Third-party runtimes: D7′** (Track `01M51CADFM2PXZWDDZ9HWWH62W`, commitment, option `revisee`, outcome `go`,
  on `main` since #168; `spec/SPEC_EVOL_DS_JSON_RENDER_STANDARD.md` §18.4). It revises D7 = A: elkjs and xyflow are
  allowed in published DS manifests under the qualification conditions of `docs/a0-csp-dependency-qualification.md`;
  bpmn-js is allowed **through `bpmn-canvas`, in the elements package**, its bpmn.io watermark governed by the Camunda
  licence. **bpmn-moddle stays a test dependency only** in this programme, with no runtime XML I/O in any DS package
  (conductor arbitration, 2026-10-15).
- The `sem:` dialect is `BpmnSemantics`, URI `https://sentropic.com/schema/bpmn/semantics/1`, descriptor sha256
  `c274f46f773b5f557f7995fa70aae9d8a50384aedfcc6c3a5d166563a17a7c97`
  (`git -C /home/antoinefa/src/bpmn-canvas show 84c93dc:src/io/semantics.json | sha256sum`, identical at the branch
  tip `e9f5f89`).

### 1.3 Options as presented (dossier of 2026-10-04, not committed)

The French decision dossier was prepared by the `design-system` conductor with two independent reviews (Codex,
Opus). It is not committed; its sha256 is recorded on the Track artifact (§17). Its options, condensed:

| id | choice | best argument for | best argument against |
|---|---|---|---|
| 0 | Ratified plan as is: bpmn-js / `bpmn-canvas` is the BPMN engine, `diagram-core` keeps a partial profile | nothing to amend, lowest cost | does not meet the owner's goal |
| A | `diagram-core` is the source of truth, BPMN profile written by hand, separate codec | one typed multi-view model | ≈ 1 200 slots by hand; schema frozen without multi-view proof |
| **A′** | as A, profiles **generated** from moddle descriptors; `extends` → overlay profiles; kernel gets only general mechanisms | D1-A conformant (output is data, no moddle runtime); dialects at the same price | mapping, compositions, cardinalities and DI still to prove; BPMN well-formedness is not in the descriptors |
| B | the moddle tree is the source of truth, `diagram-core` adopts it | exhaustive by construction | reopens D1; moddle runtime in the core or its re-implementation |
| C | two assumed models with a bridge | fast, D3-C conformant | two editable authorities, forbidden by `docs/graph-dataviz-migration-plan.md:91` |
| D→A′ | A′ as target, reached through a measurement lot first | the only path meeting the D1 condition before freezing | defers the goal; risk of an endless measurement |

**Recommendation of the dossier: D→A′. Owner selection: A′, outcome `go`.** The difference matters: the owner
accepted to start the target directly. This spec keeps the D1 condition as a **gate inside the programme** (§13,
gate G3) rather than as a preliminary lot: no `bpmn@2` document is persisted outside fixtures before the bijection
passes on the multi-view fixture. The D1 recommendation asked for « une fixture BPMN multi-vues **et une ArchiMate**
avec contraintes de relations » before freezing (`spec/graph-dataviz-decisions.json`, D1 `recommendation`). **G3
lifts the D1 condition only for the BPMN scope of schema 2.0; the ArchiMate fixture with relation constraints remains
due before any freeze that commits the native M3 profiles.**

### 1.4 Interpretation of "exhaustively"

Typed coverage of the explicitly versioned moddle metamodels listed in §1.1, plus integral retention of unknown
namespace content **outside** the typed count. Editing and rendering of each type are **not** part of it
(`bpmn-canvas`, §12).

## 2. Scope

**In scope**

- Kernel mechanisms K1–K13 in `diagram-core` (§6), one persisted-schema major bump with its registered migration
  (§7).
- A generator under `tools/` compiling the moddle descriptors into `diagram-core` profiles and a coverage matrix
  (§8).
- A separate **private** package `@sentropic/diagram-bpmn-moddle` (proposed name): F1 moddle JSON ↔ `DiagramState`
  codec, 5-status conversion report, corpus, bijection and coverage tests, with bpmn-moddle as an exact-pinned
  **devDependency** (§9, §10).
- A Node/TS-only CI job "moddle latest" (§11).

**Out of scope**

- Rendering or editing BPMN in the DS (stays in `bpmn-canvas`; a DS dependency on it is governed by D7′, §12).
- A runtime XML parser or serialiser in any DS package: bpmn-moddle is a test dependency only (§1.2).
- Publishing `diagram-core` or the new package (D2: new packages are born private, `SPEC_EVOL_GD_M2_MODEL.md:14`).
- Dialects other than `sem:` (camunda, zeebe, …): the generator is dialect-agnostic, but no other descriptor is in
  the corpus (§16 U2).
- BPMN execution semantics.

## 3. Starting point (measured)

### 3.1 bpmn-moddle

- Latest published version: **10.3.1**, published 2026-09-21T11:24:49Z (`npm view bpmn-moddle dist-tags time
  --json`, run 2026-10-15). Runtime dependencies: `moddle ^8.2.1`, `moddle-xml ^12.3.1`, `min-dash ^5.1.0`; license
  MIT, `Copyright (c) 2014 camunda Services GmbH` (`NM:bpmn-moddle/LICENSE` line 3).
- Six registered packages, **166 types (27 abstract), 379 own properties** (`node --input-type=module` over
  `new BpmnModdle().registry.packages`, summing `types.length`, `isAbstract` and `properties.length`; reproduced 2026-10-15).
  `bpmn`: 137 types (17 abstract), 318 properties; `bpmndi` 6/18; `dc` 7/12; `di` 11/23; `bioc` 2/4; `color` 3/4.
- `color` ships **no JSON resource**: it exists only in the bundle (`NM:bpmn-moddle/dist/index.js:3669` URI,
  `:3721` package, `:3730-3737` registered package table). Descriptor extraction must therefore read the runtime
  registry for `color`.
- The 5 `bioc`/`color` types are **traits**: they `extends` `bpmndi:BPMNShape`, `BPMNEdge`, `BPMNLabel`, are not
  instantiable (`registry.getEffectiveDescriptor("bioc:ColoredShape")` throws `cannot create <bioc:ColoredShape>
  extending <bpmndi:BPMNShape>`), and their properties appear in the target's effective descriptor
  (`getEffectiveDescriptor("bpmndi:BPMNShape")` lists 20 properties ending with `stroke, fill, background-color,
  border-color`, whose `ns.name` is `bioc:stroke`, `bioc:fill`, `color:background-color`, `color:border-color`).
- Descriptor flag counts over `NM:bpmn-moddle/resources/bpmn/json/{bpmn,bpmndi,di}.json` (Node one-liner over
  `types[].superClass` and `types[].properties[]`, 2026-10-15), as `bpmn` / `bpmndi` / `di`: multiple inheritance
  13 / 0 / 0; `isMany` 102 / 1 / 7; `isVirtual` 10 / 0 / 11; `replaces` 2 / 0 / 0; `redefines` 0 / 7 / 0;
  `xml.serialize = "xsi:type"` 15 / 0 / 1; `isReference` 113 (43 many) / 7 / 6.
- Types without an `isId` property in their effective descriptor (`registry.getEffectiveDescriptor`; hence 114 of
  the 120 concrete `bpmn` types carry an id): `bpmn` 7 (`Extension`, `ExtensionDefinition`,
  `ExtensionAttributeDefinition`, `ExtensionElements`, `InputOutputBinding`, `InteractionNode` (abstract),
  `Import`); `dc` 7 (all); `di` 1 (`Extension`); `bpmndi` 0 (same command).
- moddle-xml behaviours that the bijection must factor out (§10.3):
  - unresolved references are removed (`NM:moddle-xml/dist/index.js:774-775`, warning `unresolved reference` at
    `:755`);
  - write order follows the descriptor (`getSerializableProperties`, `:1135`), default-equal values are not written
    (`:1152`);
  - unknown content outside `extensionElements` raises `unparsable content` (`:715`) and is dropped with a warning
    instead of an error because `BpmnModdle.fromXML` reads in lax mode (`NM:bpmn-moddle/dist/index.js:55`,
    `lax: true`; `NM:moddle-xml/dist/index.js:720-727`); XML comments are dropped. These two were observed by the dossier's probe `moddle-mechanisms-probe.mjs` (not committed); L3
    re-measures them (§10.3).

### 3.2 `diagram-core` 0.1.0 (private, zero dependency)

| fact | evidence |
|---|---|
| no supertype on a type declaration | `DC:src/profile.ts:26-32` |
| role targets compared by strict equality | `DC:src/validate.ts:329` (`role.entityTypes.includes(target.type)`) |
| role `max` mandatory ("an unbounded role is a bag") | `DC:src/profile.ts:44-51` |
| three constraint kinds only | `DC:src/profile.ts:81-84` |
| collections bounded, `maxItems` mandatory; scalars only | `DC:src/attributes.ts:46-55` |
| reference scalar constrains the namespace only | `DC:src/attributes.ts:44` |
| no integer/real scalar kind | `DC:src/attributes.ts:37-44` |
| local id refuses `_` start and non-ASCII | `DC:src/refs.ts:57` |
| one profile per entity | `DC:src/document.ts:31` |
| relation: ≥ 2 endpoints, targets entity or port | `DC:src/document.ts:37-55` |
| extension scope: document / entity / relation / port | `DC:src/document.ts:95-99` |
| `PreservedExtension.source` optional; identity (namespace, version, scope) | `DC:src/document.ts:111-125`, `:181` |
| entity occurrence = rectangle geometry; relation occurrence = endpoints + waypoints; no label, no plane root | `DC:src/view.ts:35-43`, `:52-58`, `:126-137` |
| frozen field lists | `DC:src/document.ts:142`, `DC:src/view.ts:140-150` |
| schema version 1.1, one registered migration | `DC:src/document.ts:163`, `DC:src/migrate.ts:417` |
| zero dependency of any kind, asserted | `DC:tests/no-dom-no-deps.test.ts:160-165` |
| `bpmn@1` is a declared skeleton; `sequenceFlow.default` is a boolean | `DC:src/profiles/skeletons.ts:28`, `:50`, `:87`; descriptor: `Activity.default`/`ExclusiveGateway.default` are references to `SequenceFlow` |
| the BPMN fixture has no view | `DC:fixtures/valid/bpmn-skeleton-document.json` |
| `bpmn@1` used nowhere outside `diagram-core` except two prose mentions | `git grep -n "bpmn@1\|BPMN_SKELETON" -- ':!packages/diagram-core'` → `docs/graph-dataviz-migration-plan.md:115`, `spec/SPEC_EVOL_GD_M2_MODEL.md:71` |
| the DS layer must not depend on the diagram model | `scripts/verify-layering.test.mjs:18` |
| publishable package count is 18 | `scripts/verify-publishable-licensing.test.mjs:84-91` |

## 4. The exchange form: F1 moddle JSON (status `unknown`)

Source: `BC@84c93dc:src/io/moddle-json.ts` (commit `84c93dc` "feat: workbench G1 F1 moddle JSON codec", ancestor of
the branch tip `e9f5f89`; the branch is **not pushed**: `git ls-remote origin` lists no `functions` ref). F1 is
**the shape to align with**, not a published contract. Its status stays `unknown` until bpmn-canvas publishes it.

### 4.1 F1 as measured at `84c93dc`

| rule | evidence |
|---|---|
| each element is `{ "$type": "prefix:Type", ...props }` | `:7-11` |
| configuration `{ contractVersion: "1", defaults: "explicit", descriptors }`; defaults are emitted explicitly | `:19-24`, `:178-182` |
| root must be `bpmn:Definitions` | `:101` |
| the `sem` descriptor must equal the shipped `semantics.json`; built-in prefixes `bpmn, bpmndi, dc, di, bioc, color` cannot be re-registered | `:72-75` |
| API `hydrate(json, cfg)` (JSON → moddle objects) and `project(model, cfg)` (moddle objects → JSON); no XML | `:89-97` |
| containment follows descriptor compositions; references are id strings resolved after the containment walk | `:183-189`, `:199-209` |
| no `$parent` on the wire | `:166` |
| `$attrs` admitted only for namespace declarations whose URI matches a registered package | `:140-142` |
| virtual properties refused (`unsupported-structure`) | `:181` |
| errors: `ModdleJsonError extends IoError` with a structural `path`; codes `invalid-configuration`, `not-bpmn`, `invalid-value`, `invalid-reference`, `dangling-reference`, `duplicate-id`, `unsupported-extension`, `invalid-containment`, `unknown-type`, `invalid-model`, `unknown-property`, `unsupported-structure` | `:26-32`, every `fail(...)` call |

### 4.2 Drift already observed after `84c93dc`

`git -C /home/antoinefa/src/bpmn-canvas diff 84c93dc workbench/functions-20261004 -- src/io/moddle-json.ts`
(+32 / −11): unqualified string attributes become admissible in `$attrs`; namespace-qualified property names become
a wire alias (`wireNames`); a `diagnostic` getter maps codes to another wire vocabulary; a `duplicate-extension`
refusal for a second `sem:Info` in one collection. This confirms the `unknown` status: the DS pins the `84c93dc` form
and treats each later change as an alignment item.

### 4.3 F1 on the corpus, measured (2026-10-15)

Method: `src/io/{moddle-json.ts,semantics.json,errors.ts}` and `src/types.ts` extracted at `84c93dc` (then at
`e9f5f89`), bundled with bpmn-canvas's own `esbuild` against its installed bpmn-moddle 10.3.1; for each corpus file,
`new BpmnModdle({ sem }).fromXML` then `project → hydrate → project` with
`{ contractVersion: "1", defaults: "explicit", descriptors: { sem } }`. Same result at both revisions:

| file | moddle warnings | F1 |
|---|---|---|
| `ce1-homonyms`, `ce3-collapsed-subprocess`, `ce4-two-pools-message`, `ce5-two-diagrams-shared-root` (E3) | 0 | projected; `project(hydrate(project(m)))` byte-stable |
| `B.1.0` (MIWG) | 0 | refused: `unsupported-extension` at `$.$attrs.xmlns:bpsim` |
| `C.4.0`, `C.5.0` (MIWG) | 0 | refused: `unsupported-extension` at `$.$attrs.trisobpmn:logoChoice` |

The three MIWG files declare namespaces F1 does not register (`bpsim`, `trisobpmn`, `triso`, `drools`, `dmn`, …; `grep
-o 'xmlns:[a-zA-Z0-9]*="[^"]*"'` on each file). **F1 as measured cannot carry 3 of the 7 corpus files**. The owner
settled this on 2026-10-15 (§1.2): F1 will preserve such content. Until that F1 lot is published, the MIWG part of the
bijection is `unknown`.

### 4.4 Alignment items with bpmn-canvas (gate G0)

Channel: the `design-system` conductor relays each item to the bpmn-canvas / d2d conductors over h2a. The status is
recorded in this table (updated by PR) and, for the items that gate L3, as an external dependency blocker on L3 in
Track (§17).

| # | item | why the DS needs it | status / DS position |
|---|---|---|---|
| F1-A1 | representation of **unknown-namespace content**: generic elements in `bpmn:ExtensionElements.values` and foreign qualified attributes | owner requirement 2 (full source retention); F1 refuses unknown `$type` (`:152-154`) and foreign `$attrs` (`:140-142`); blocks the 3 MIWG files (§4.3) | **settled by the owner 2026-10-15** (§1.2): F1 preserves it, as bpmn-moddle does; exact JSON encoding delivered by the F1 lot (tests first) — `unknown` until published. The DS maps it to `PreservedExtension` with `source` (K11), never drops it |
| F1-A2 | namespace declarations (`xmlns:*`) in `$attrs` | needed to reproduce J exactly; F1 admits only registered URIs (`:141-142`), so an unregistered declaration (MIWG, QName imports) is refused (§4.3) | **settled by the owner 2026-10-15**: unregistered declarations are preserved with URI and prefix, same rule for `xsi`. Registered declarations are typed values (K8.3); unregistered ones are preserved (K11) |
| F1-A3 | unqualified string attributes (admitted at `e9f5f89` only) | XSD-valid BPMN carries none; some tools emit them | covered by the owner decision (foreign attributes are preserved) → `PreservedExtension` |
| F1-A4 | qualified property-name aliases (`e9f5f89`) | none for the DS | DS emits local names only |
| F1-A5 | error vocabulary | one diagnostic vocabulary across repos | DS reuses the `84c93dc` codes plus `path` |
| F1-A6 | `sem` descriptor pin | identical semantics on both sides | DS pins sha256 `c274f46f…7c97` |
| F1-A7 | **publication vehicle and version of F1** (package, versioned file or tagged contract) | the DS needs a fixed reference to pin and to check its test helper against | `unknown` (U13); first deliverable asked of the F1 lot |

## 5. Mapping principles: moddle JSON → `DiagramState` [JUDGMENT]

These rules are decided by this spec and confirmed by the L1/L3 tests. They are deterministic functions of the
descriptors plus a small hand-written binding file (§8.4).

| moddle construct | `DiagramState` target |
|---|---|
| `bpmn:Definitions` | the `SemanticDocument`; its own properties on one root entity of type `bpmn:Definitions` |
| instance of a concrete type whose effective descriptor has an `isId` property (114 of the 120 concrete `bpmn` types; `sem:Info` has none) | **Entity** of the generated profile of its package; the element key is its `id` (K3) or a synthesized key when the instance has no id |
| containment property whose item type has an id | **composition slot**: the child entity records `owner = { parent, slot, index }` (K4, K5) |
| containment property whose item type has no id (`bpmn:Import`, `bpmn:ExtensionElements`, `dc:Bounds`, …) | **structured value** attribute (K6) |
| `Element`-typed property (`bpmn:ExtensionElements.values`, `di:Extension.values`) | open collection of structured values of any **registered** type (e.g. `sem:Info`); a registered value that carries an id stays a struct there, its id being an ordinary field, not an entity key; unregistered content → `PreservedExtension` (K11) anchored at its index |
| primitive or enumeration attribute; `isBody`; element-serialised primitive | scalar attribute (K7, K12) |
| reference property | typed reference attribute (K2); references to imported namespaces → external reference (K3) |
| virtual property (`isVirtual`, 10 in `bpmn`, 11 in `di`, §3.1) | not persisted, recorded as **derived** in the coverage matrix with its inverse named in the binding file |
| `replaces` / `redefines` | the supplanting property is the persisted one (K1) |
| `bpmndi:BPMNDiagram` | one `ViewDocument` per diagram, keyed by the diagram id |
| `bpmndi:BPMNPlane` | the view **root** (K9) |
| `bpmndi:BPMNShape` | entity occurrence, form `shape` (K9) |
| `bpmndi:BPMNEdge` | entity occurrence, form `edge`, with the DI waypoints verbatim (K9) |
| `bpmndi:BPMNLabel`, `bpmndi:BPMNLabelStyle`, `dc:Font` | occurrence label and view styles (K9) |
| `bioc:*`, `color:*` traits | **overlay** attributes on occurrences (K8) |
| `sem:Info` (superClass `Element`, inside `extensionElements`) | structured value of type `sem@1#Info` in the open collection (K8) |

**Why every connector is an entity, not a `Relation`** [JUDGMENT]. Making `SequenceFlow`, `MessageFlow`,
`Association`, `DataInputAssociation`, … diagram-core relations fails on three measured facts:
(1) a data association may have **zero** `sourceRef` (`NM:bpmn-moddle/resources/bpmn/xsd/Semantic.xsd:442`,
`minOccurs="0"`), which a relation cannot express (`DC:src/document.ts:44-55`, two endpoints minimum);
(2) an `Association` targets any `BaseElement`, including a sequence flow (descriptor: `Association.sourceRef` and
`targetRef` have `type: "BaseElement"`, `isReference: true` in `NM:bpmn-moddle/resources/bpmn/json/bpmn.json`; XSD:
`Semantic.xsd:70-71`, `xsd:QName`), and a relation
endpoint cannot target a relation (`DC:src/document.ts:37-42`);
(3) a sequence flow is itself contained (`Process.flowElements`) and owns children (`conditionExpression`), which
relations cannot. Entities with typed references keep the generator purely descriptor-driven. Exposing connectors as
graph edges to `diagram-canvas` or processing is a projection, out of scope here (§16 U9).

## 6. Kernel mechanisms

Each mechanism lists: **need** (evidence), **contract**, **diagnostics**, **test**. All are general (no BPMN name
appears in kernel code; BPMN appears only in generated profile data). Persisted-shape changes are gathered in §7.

### K1 — Supertypes and subsumption

- **Need**: 13 `bpmn` types with multiple inheritance (§3.1), inheritance depth up to 5
  (`ManualTask > Task > Activity > FlowNode > FlowElement > BaseElement`); strict-equality role check
  (`DC:src/validate.ts:329`).
- **Contract**: a type declaration gains `supertypes?: readonly TypeRef[]` (ordered, possibly several) where
  `TypeRef = "<profileId>#<typeId>"` or a local id. Kinds: concrete types are entity types; abstract types are
  kind-neutral and never instantiated. The effective schema of a type is folded along its supertypes depth-first,
  left to right, first occurrence wins, and a property marked `supplants: "<Type>#<prop>"` replaces the named
  inherited one (moddle `replaces`/`redefines`). Every type constraint (role `entityTypes`, reference targets,
  slot item types, structured-value types) is satisfied by the named type **or any subtype**.
- **Diagnostics**: `supertype-unknown`, `supertype-cycle`, `attribute-conflict` (same name inherited twice with
  different schemas and no `supplants`), `abstract-instantiated`.
- **Test**: for every generated type, the effective property set equals bpmn-moddle's
  `registry.getEffectiveDescriptor(type).properties`: same names, and per name the same type and flags (run in the
  separate package, T4). A precedence disagreement between this fold and moddle's therefore fails a test.

### K2 — Typed references to a business type

- **Need**: 113 reference properties in `bpmn` (43 many), e.g. `Activity.default → SequenceFlow`; the kernel only
  constrains the namespace (`DC:src/attributes.ts:44`).
- **Contract**: the `reference` scalar schema gains `targetTypes?: readonly TypeRef[]`; resolution checks the target
  exists **and** its type is subsumed by one of `targetTypes`. Many-valued references are ordered collections (K5).
- **Diagnostics**: `reference-target-type` (wrong type), existing dangling-reference diagnostic kept.
- **Test**: a reference from `Activity.default` to a `Task` is refused with `reference-target-type`.

### K3 — Identifiers, QName and `import`

- **Need**: BPMN ids are XML NCNames (`_x`, non-ASCII allowed); `LOCAL_ID` refuses them (`DC:src/refs.ts:57`).
  QName references into imported documents exist in BPMN (`bpmn:Import` has `importType`, `location`, `namespace`
  only) and moddle drops them when unresolved (`NM:moddle-xml/dist/index.js:774-775`).
- **Contract**:
  1. `LOCAL_ID` accepts the XML NCName production, plus a **reserved synthesized form** `~<base32>` that is not an
     NCName. A synthesized key is assigned by the codec to an id-less instance as a deterministic function of its
     owner key, slot and index; the exporter never emits it as an `id`.
  2. BPMN ids form one `xsd:ID` space. The codec places each id in exactly one key space (`entity:`, `occurrence:` for
     shapes, edges, planes and labels, `view:` for diagrams, style keys for label styles) and refuses a duplicate
     across all of them (`duplicate-id`, same code as F1).
  3. A new scalar kind `external-reference = { namespace: string /* URI */, local: string }` represents a reference
     to an element of an imported document. It is never dereferenced (D3-C: nothing fetched, parsed or executed).
     It validates only when the document declares a `bpmn:Import` whose `namespace` equals `namespace`.
  4. `CallActivity.calledElement` stays a text scalar: the descriptor types it `String`, not a reference.
- **Diagnostics**: `ref-format` (existing class, widened grammar), `external-reference-import-missing`.
- **Reachability caveat**: F1 resolves references to contained ids only (`BC@84c93dc:src/io/moddle-json.ts:204`,
  `dangling-reference`) and moddle drops unresolved ones, so the moddle → F1 path never produces an external
  reference today. The kernel scalar kind is still delivered and tested on state fixtures; **the codec mapping of
  `external-reference` is `unknown`** until its F1 encoding exists (U3), and T1–T5 do not depend on it.
- **Test**: entity key `_BPMNShape_StartEvent_2` and `Événement_1` accepted; `~` keys never exported; an external
  reference without matching `Import` refused.

### K4 — Multiplicity per parent (composition slots)

- **Need**: "`SequenceFlow`: 0..1 `conditionExpression`", "`BPMNShape`: 0..1 `label`" are not expressible: a role
  cardinality counts the endpoints of one relation (`DC:src/profile.ts:44-47`); no constraint counts children
  (`:81-84`). The `bpmn@1` containment tree also refuses a task contained in a process and listed in a lane (dossier
  probe, not committed: diagnostic `hierarchy-multiple-parents`; L1 re-tests it as a state fixture).
- **Contract**: a type declares `slots: { name, itemTypes: TypeRef[], multiplicity: { min, max: number |
  "unbounded" }, ordered: true }`. An element (entity) has at most one `owner = { parent: EntityRef, slot: string,
  index: number }`. Containment is the owner field, not a relation, so lane membership (`Lane.flowNodeRef`, a
  reference) never competes with containment. The owner graph is a forest rooted at the `bpmn:Definitions` entity.
- **Diagnostics**: `slot-unknown`, `slot-item-type`, `slot-multiplicity`, `owner-cycle`, `owner-missing-parent`.
- **Test**: a second `conditionExpression` on one flow is refused (`slot-multiplicity`); a task owned by a process and
  referenced by a lane validates.

### K5 — Ordered, unbounded collections when the descriptor requires it

- **Need**: 102 `isMany` properties in `bpmn` (§3.1) have no upper bound; the kernel requires
  `maxItems` (`DC:src/attributes.ts:46-55`) and records carry no order (`DC:src/document.ts:12-16`).
- **Contract**: a collection schema whose item schema is typed may set `maxItems: "unbounded"` only when its profile
  marks it `descriptorDerived: true`. Slot children are ordered by `owner.index` (dense, 0-based, per parent and
  slot). Resource limits stay in `ProfileLimits` (`DC:src/profile.ts:86-90`).
- **Amendment of D1-A wording** [JUDGMENT]: `SPEC_EVOL_GD_M2_MODEL.md:68` says "collection bornée". The prohibition
  it serves is the untyped bag; a typed, descriptor-derived unbounded collection is not a bag. This spec amends that
  line for descriptor-derived profiles only; hand-written profiles keep the bound.
- **Diagnostics**: `slot-index-gap`, `slot-index-duplicate`, `collection-unbounded-not-allowed`.
- **Test**: 10 000 items in an unbounded descriptor-derived collection validate; the same schema in a hand-written
  profile is refused.

### K6 — Structured values and compositions

- **Need**: attributes are scalars or collections of scalars (`DC:src/attributes.ts:22-34`); `dc:Bounds`, `dc:Font`, `bpmn:Import`, `bpmn:ExtensionElements` carry no id and are compositions.
- **Contract**: a new attribute value kind `struct = { type: TypeRef, fields: Record<string, AttributeValue> }`,
  nested to any depth, validated against the effective schema of `type` (K1 subsumption applies: a slot typed
  `bpmn:Expression` accepts `bpmn:FormalExpression`, which covers the 15 `xsi:type` polymorphic properties). The
  composition rule is fixed: an item type **with** an id property → slot (K4); **without** → struct.
- **Diagnostics**: `struct-type-unknown`, `struct-field-not-in-schema`, `struct-type-not-allowed`.
- **Test**: an `Import` struct on the root; a `FormalExpression` in a slot typed `Expression`.

### K7 — Body text

- **Need**: `Documentation.text` and `Expression.body` are `isBody`; `TextAnnotation.text` and `ScriptTask.script`
  are element-serialised primitives (descriptor flags).
- **Contract**: text scalars are stored **verbatim** (no trim, no newline normalisation, no maximum length unless the
  profile declares one). The profile records the moddle serialisation form (`attribute | body | element`) as
  metadata for the coverage matrix only; the JSON pivot does not depend on it.
- **Test**: a multi-line body with leading spaces and `\r\n` survives T1 byte for byte.

### K8 — Multi-profile extensions

- **Need**: `bioc` and `color` use moddle `extends` on DI types (§3.1); `sem:Info` is a typed element placed in
  `bpmn:ExtensionElements.values` (`superClass: ["Element"]`, `BC@84c93dc:src/io/semantics.json`), **not** an
  `extends`. An entity has a single profile (`DC:src/document.ts:31`).
- **Contract**:
  1. **Overlays**: a profile may declare `overlays: [{ target: TypeRef, attributes: AttributeSchema[] }]`. The
     effective schema of an element or occurrence of the target type (or a subtype) is its own schema plus the
     overlays of every profile listed in the document's `profileRefs`. Overlay attribute names are qualified by the
     overlay profile's prefix (`bioc:fill`), so no collision with the base type. The element keeps its single
     profile.
  2. **Typed extension elements**: an open collection (`Element`-typed) accepts structured values of any type of a
     profile listed in `profileRefs`.
  3. **Namespace declarations**: `xmlns:*` declarations carried in F1 `$attrs` are a typed struct collection
     `{ prefix, uri }` on the carrying element (F1-A2).
- **Diagnostics**: `overlay-profile-inactive`, `overlay-target-mismatch`.
- **Test**: `bioc:fill` on a shape occurrence validates only when `bioc@1` is in `profileRefs`; `sem:Info` with a
  `laneRef` to a non-lane is refused (`reference-target-type`).

### K9 — Complete DI

- **Need**: no label, no label style, no plane root, no typed occurrence attribute, a frozen view field list
  (`DC:src/view.ts:35-43`, `:126-150`); DI waypoints already include the anchor points on the outline, while
  `diagram-canvas` builds a route as first endpoint centre, waypoints, other endpoint centres
  (`packages/diagram-canvas/src/scene.ts:266`, `:296`).
- **Contract**:
  1. `ViewDocument` gains `root?: { plane: OccurrenceRef /* the BPMNPlane id */, element: EntityRef }` (a collapsed
     sub-process or a collaboration gets its own plane), `attributes` typed by the view schema of the profile
     (`name`, `documentation`, `resolution`), and `styles: Record<string, { attributes }>` for `BPMNLabelStyle`
     (with `dc:Font` as a struct).
  2. `EntityOccurrence` becomes a union on `form`: `shape` (current fields: `geometry` = `dc:Bounds`) or `edge`
     (`waypoints` ≥ 2, verbatim DI points; optional `source` / `target` occurrence refs for `sourceElement` /
     `targetElement`). Both carry `attributes` typed by the profile's view schemas (`isHorizontal`, `isExpanded`,
     `isMarkerVisible`, `isMessageVisible`, `participantBandKind`, `choreographyActivityShape`,
     `messageVisibleKind`) plus overlays (K8), and an optional `label = { id?: OccurrenceRef, geometry?, style?: styleKey,
     attributes }`.
  3. Profiles gain `viewSchemas` (diagram, plane, shape, edge, label, labelStyle), generated from `bpmndi`, `di`,
     `dc`.
  4. Extension scopes gain `occurrence` and `view` (unknown attributes on DI elements).
  5. `diagram-canvas` paints `edge` occurrences from their waypoints verbatim, without adding shape centres. This
     applies only to the new `edge` form of `EntityOccurrence`; `RelationOccurrence` and its route
     (`packages/diagram-canvas/src/scene.ts:266`, `:296`) are unchanged, so no existing `generic@1` scene changes and
     no relation-occurrence migration is needed.
- **Diagnostics**: `view-root-unknown`, `occurrence-form-invalid`, `label-style-unknown`.
- **Test**: the multi-view fixture (§10.4) — two `BPMNDiagram` over one process, one collapsed sub-process plane,
  labels with styles, `bioc`/`color` overlays — round-trips under T1/T2.

### K10 — `bpmn@1` → `bpmn@2`: no migration; `bpmn@1` removed in L1

- **Decision** [JUDGMENT]: no automatic migration. Reasons, each checkable:
  1. `bpmn@1` is `completeness: "skeleton"` (`DC:src/profiles/skeletons.ts:50`); no document uses it outside the
     package's own fixture and tests (§3.2, `git grep`).
  2. One mapping is underdetermined: `event.position = intermediate` merges `IntermediateCatchEvent` and
     `IntermediateThrowEvent` (`DC:src/profiles/skeletons.ts:63`, one enum value for both); a migration would have to guess.
  3. `flowPort` has no BPMN counterpart (`DC:src/profiles/skeletons.ts:75`).
  4. `ProfileId` carries the major version (`DC:src/profile.ts:22`), so `bpmn@1` and `bpmn@2` coexist.
- **Contract** (conductor arbitration 2026-10-15: private package, no consumer): `bpmn@1` is **removed in L1** — its
  declaration in `DC:src/profiles/skeletons.ts`, its registration, `DC:fixtures/valid/bpmn-skeleton-document.json` and
  its tests. A document naming `bpmn@1` is then refused like any unregistered profile. The two prose mentions outside
  the package (`docs/graph-dataviz-migration-plan.md:115`, `spec/SPEC_EVOL_GD_M2_MODEL.md:71`) are historical records
  and stay.
- **Future breaking descriptor changes**: a profile-migration registry with the same contract as the schema
  migration (registered function, report `from/to/operations/unmigrated`, original retained — `DC:src/migrate.ts`)
  is specified now and first used by the first breaking bpmn-moddle change (§11.4).

### K11 — `PreservedExtension.source` mandatory

- **Need**: a hash alone does not retain content (`DC:src/document.ts:111-125`, `source?` at `:124`); identity
  `(namespace, version, scope)` (`:181`) cannot hold two unknown elements of one namespace on one element.
- **Contract**: `source: string` is **required** (canonical JSON of the unknown F1 subtree, F1-A1);
  `contentHash = hash(source)` is checked as today (`DC:src/validate.ts:518`); a new `anchor` field
  (`{ kind: "element", property, index } | { kind: "attribute", name }`) completes the identity; scopes extended per
  K9.4. Preserved content is `preserved-unvalidated`, counted separately from typed coverage, never a fact (D3-C).
- **Migration**: 1.1 → 2.0 cannot invent a missing source. An extension without `source` is listed in
  `unmigrated` with reason `source-missing`, and the original is retained by the migration report (§7).
- **Test**: an extension without `source` is refused on 2.0; two `acme:` elements on one entity coexist.

### K12 — Numeric scalars

- **Need**: `Integer` (`startQuantity`, `completionQuantity`, `sem:order`) and `Real` (`dc:x`, `dc:width`,
  `dc:Font.size`, `di:Diagram.resolution`) have no kind; `quantity` requires a unit (`DC:src/attributes.ts:42`).
- **Contract**: scalar kinds `integer` (safe integer) and `real` (finite, `-0` refused — same rule as
  `BC@84c93dc:src/io/moddle-json.ts:114-115`).

### K13 — Commands follow the new fields

- **Need**: the M2 invariant: every persisted field changes only through a command with an inverse
  (`SPEC_EVOL_GD_M2_MODEL.md` §3.5).
- **Contract**: entity create/update carry `owner`; occurrence create/move carry `form`, `attributes`, `label`; view
  create carries `root`, `attributes`, `styles`; one new command `reorder-in-slot` with its inverse. No "replace
  type" command (editing stays in `bpmn-canvas`).
- **Test**: the existing `command → inverse → initial state` pattern for each new or widened command.

## 7. Persisted schema: `diagram-core` 2.0

K3, K4, K6, K8, K9, K11 and K12 change persisted shapes (K1, K2 and K5 change profile shapes only); K11 makes a
field mandatory. This spec therefore proposes **one major bump, 1.1 →
2.0**, with **one** registered migration (`DC:src/migrate.ts:417`): existing occurrences become `form: "shape"`;
`owner` absent; `source`-less extensions go to `unmigrated` (K11); `RelationOccurrence` is untouched (K9.5). `SEMANTIC_DOCUMENT_FIELDS` and
`VIEW_DOCUMENT_FIELDS` are updated in the same change, and their tests with them. `diagram-canvas` moves in the same
lot (it depends on `diagram-core`, `packages/diagram-canvas/package.json:23`). Freezing 2.0 is gate G3 (§13).

## 8. The generator (`tools/diagram-profile-gen/`)

Node ESM, built-ins only (no dependency, no Python).

### 8.1 Inputs

1. **Descriptor snapshot**, committed: `packages/diagram-bpmn-moddle/descriptors/bpmn-moddle@<version>/` with
   `bpmn.json`, `bpmndi.json`, `dc.json`, `di.json`, `bioc.json` (copied from `NM:bpmn-moddle/resources/`) and
   `color.json` (serialised from the runtime registry, §3.1), plus `sem@1/semantics.json` (sha256 pinned, §1.2) and a
   `SHA256SUMS` manifest. Produced by `packages/diagram-bpmn-moddle/scripts/extract-descriptors.mjs`, the only step
   that loads bpmn-moddle.
2. **Binding file** `tools/diagram-profile-gen/bindings.json` (hand-written, reviewed): prefix → profile id
   (`bpmn → bpmn@2`, `bpmndi → bpmndi@1`, `dc → dc@1`, `di → di@1`, `bioc → bioc@1`, `color → color@1`,
   `sem → sem@1`), the inverse of each virtual property or the explicit value `no-inverse` when none exists in the
   descriptors (e.g. `CategoryValue.categorizedFlowElements`, U14), the view-model absorption of DI structural properties
   (§8.3 class `P-VIEW`), and the well-formedness rule catalogue references (§8.4).

### 8.2 Outputs

1. `packages/diagram-core/src/profiles/generated/*.ts`: data-only modules, one per profile, with a header carrying
   the bpmn-moddle version, the descriptor sha256s, the generator version and the upstream MIT notice
   (camunda Services GmbH) for the derived data. They import only `diagram-core` types by relative path; the
   zero-dependency guard (`DC:tests/no-dom-no-deps.test.ts:160-165`) keeps holding. They are exported by a dedicated
   `createBpmnModdleRegistry()`; the default registry is unchanged.
2. `packages/diagram-bpmn-moddle/coverage.json`: one row per (package, type, property) with its class (§8.3) and its
   target in the profile or view model.
3. `packages/diagram-bpmn-moddle/fixtures/synthetic/`: one minimal F1 document per concrete type exercising each of
   its properties at least once (T5).
4. `--check` mode: regenerate in memory and diff against the committed outputs; non-zero exit on any difference.
   `--diff <old-snapshot> <new-snapshot>` classifies a descriptor change as `additive` or `breaking` (§11.4).

### 8.3 Compilation rules

- Types: `superClass` → `supertypes` in order (K1); `isAbstract` → abstract; moddle's built-in `Element` → the
  kernel's open root. Labels are derived mechanically from type names (`UserTask` → "User Task").
- `extends` (traits) → overlays on the target type (K8); traits are not instantiable types.
- `replaces` (2 in `bpmn`) and `redefines` (7 in `bpmndi`) → `supplants` (K1). An inherited name conflict without
  either is a generator error.
- Multiple inheritance: the generator does not linearise by itself; it emits supertypes and the kernel folds them
  (K1). The fold is checked against moddle's own effective descriptor (T4), so a disagreement is caught by a test,
  not by review.
- Property classes, exactly one per property: `P-ID` (`isId` → element key), `P-SCALAR` (primitive or enum, incl.
  body and element primitives), `P-REF` (reference, incl. many), `P-SLOT` (composition of an id-bearing type),
  `P-STRUCT` (composition of an id-less type), `P-OPEN` (`Element`-typed), `P-DERIVED` (virtual), `P-SUPPLANTED`
  (replaced or redefined), `P-OVERLAY` (trait property), `P-VIEW` (DI structural: `BPMNDiagram.plane`,
  `BPMNPlane.planeElement`, `bpmnElement`, `di:waypoint`, `di:Shape.bounds`, `di:Label.bounds`, `label`, `labelStyle`, `sourceElement`,
  `targetElement`, …). A property in no class, or in two, fails the generator.
- `subsettedProperty` (3 occurrences in `di.json`, e.g. `Plane.planeElement`) is deliberately ignored: the JSON pivot
  is per property, and T3 serialises through moddle itself.
- Descriptor facts that the kernel does not need at run time but that T4 compares — `default`, `isAttr`, `isBody` and
  the K7 serialisation form — are emitted as **profile metadata** on each generated attribute, so T4 reads them from
  the generated profile, not from `coverage.json`.
- Known descriptor anomaly: `BaseElement.extensionDefinitions` references `ExtensionDefinition`, a type without an
  id (§3.1). The generator flags it; the codec reports such a reference `unsupported` until a corpus case shows how
  moddle resolves it (`unknown`, §16 U6).

### 8.4 What does not come from the descriptors

| item | source | status |
|---|---|---|
| BPMN well-formedness (no incoming flow on a start event, `attachedToRef` is an activity, flow source and target in the same container, …) | OMG BPMN 2.0.2 (formal/13-12-09) and the XSD shipped in `NM:bpmn-moddle/resources/bpmn/xsd/` | hand-written rule catalogue, each rule citing its clause; reported as diagnostics, **never** blocking import (import accepts what moddle accepts). Exact rule set `unknown` (U5) |
| required-ness (`use="required"`, `minOccurs`) | same XSD (e.g. `Semantic.xsd:1373-1374`) | part of the catalogue, not of the profile |
| bounds | none in the descriptors | none by default (K5); host limits through `ProfileLimits` |
| inverses of virtual properties | none in the descriptors | binding file |
| DI absorption into the view model | none | binding file |

## 9. The separate package `@sentropic/diagram-bpmn-moddle` (private)

- `packages/diagram-bpmn-moddle`, `"private": true`, MIT, version `0.1.0`.
- `dependencies`: `@sentropic/diagram-core` (exact pin, as `diagram-canvas` does). `devDependencies`:
  `bpmn-moddle` **exact pin** (10.3.1 at the time of writing, which is also `latest` on 2026-10-15), test tooling.
- The DS layer must not depend on it: add `/^@sentropic\/diagram-bpmn-moddle$/` to `FORBIDDEN` in
  `scripts/verify-layering.test.mjs:18`. Publishable count unchanged (18).
- Relation to the `@sentropic/diagram-codecs` package planned by `SPEC_EVOL_GD_M2_MODEL.md:24-27`: kept separate so
  that the "moddle latest" job does not gate unrelated codecs; folding it later is open (U7).

### 9.1 Runtime API (no XML, no bpmn-moddle at runtime)

```ts
toDiagramState(json: ModdleJsonElement, cfg: CodecConfig): { state: DiagramState; report: ConversionReport }
toModdleJson(state: DiagramState, cfg: CodecConfig): { json: ModdleJsonElement; report: ConversionReport }
```

`CodecConfig = { contractVersion: "1"; registry: ProfileRegistry /* createBpmnModdleRegistry() */ }`. Refusals
throw `ModdleJsonError` with the F1 code vocabulary and a structural `path` (F1-A5).

### 9.2 Conversion report

One row per F1 element or attribute: `{ path, sourceType, status, target?, reason? }`, plus totals per status and
two **separate** counters: `typed` (per package) and `preserved` (per namespace URI). Preserved content is never
summed into typed coverage (owner requirement 2).

| status | meaning |
|---|---|
| `converted` | typed element, attribute, struct or occurrence created |
| `preserved-extension` | unknown-namespace content kept as `PreservedExtension` with `source` (K11) |
| `degraded` | converted with a declared loss. **Must be 0** on the corpus for registered packages (AC-L3.6) |
| `ignored` | content deliberately not persisted because it is derivable (none expected: F1 refuses virtual properties) |
| `unsupported` | refused: reference to an id-less type (§8.3), a DI element whose `bpmnElement` is missing |

### 9.3 Test-only helpers

`tests/support/f1.ts` implements F1 `project`/`hydrate` over bpmn-moddle objects, following `BC@84c93dc`'s contract
(§4.1). This package does not import bpmn-canvas (§12); when F1 is published, the helper is checked against it.

## 10. Bijection and coverage tests

### 10.1 Definitions

`F1(m)` = test-helper projection of moddle objects; `canon` = canonical JSON (sorted keys, arrays in order).

| test | property | exactness |
|---|---|---|
| **T1** JSON → state → JSON | for each corpus document `x`: `J0 = F1(moddle.fromXML(x))`, `S = toDiagramState(J0)`, `J1 = toModdleJson(S)` ⇒ `canon(J1) === canon(J0)` | exact |
| **T2** state → JSON → state | `serialiseState(toDiagramState(J1)) === serialiseState(S)` | exact; for a state that was edited after import, exact up to re-derived synthesized keys (K3) |
| **T3** XML edge | `J2 = F1(moddle.fromXML(moddle.toXML(hydrate(J1))))` ⇒ `canon(J2) === canon(J0)`; every difference between `x` and the moddle output is attributed to one of N1–N5 | zero unattributed difference |
| **T4** descriptor coverage | for every package, type and property of the **installed** bpmn-moddle (`registry.packages`, `getEffectiveDescriptor` for non-trait types; trait properties via their targets): a `coverage.json` row exists, its class target exists, and the generated effective schema equals moddle's (names, types, `isMany`, `isReference`, `isAttr`, `isBody`, `isId`, `default`) | 100 %; at 10.3.1: 166 types, 379 own properties; `sem`: 1 type, 6 properties |
| **T5** exercise | every property of every registered package is set at least once by a corpus or synthetic document that passes T1/T2 | 100 % |

### 10.2 Exactness inside the codec

The codec applies **no** normalisation: JSON ↔ state is exact. Defaults are explicit on both sides (F1
`defaults: "explicit"`, `BC@84c93dc:src/io/moddle-json.ts:20-22`), so "absent" and "default" never need to be
reconciled inside the codec.

### 10.3 Admitted normalisations (moddle's own losses, XML edge only)

| id | normalisation | evidence |
|---|---|---|
| N1 | child order follows the descriptor, not the file (order inside one collection kept) | `NM:moddle-xml/dist/index.js:1135` |
| N2 | XML comments dropped | dossier probe; re-measured by L3 |
| N3 | unresolved references (incl. QName into an imported document) dropped, with an `unresolved reference` warning | `:755`, `:774-775` |
| N4 | values equal to the descriptor default not written | `:1152` |
| N5 | unknown element outside `extensionElements` dropped, with an `unparsable content` warning | `:715`, lax mode `NM:bpmn-moddle/dist/index.js:55` and `:720-727`; dossier probe |

Formatting, whitespace between elements, attribute order and namespace prefix spelling are XML serialisation
details, outside the JSON pivot. T3 attributes each difference by matching moddle's warnings and rules; anything else
fails.

### 10.4 Corpus

| set | content | licence and provenance |
|---|---|---|
| E3 | `experiments/e3/corpus/` of bpmn-canvas: `ce1-homonyms`, `ce3-collapsed-subprocess`, `ce4-two-pools-message`, `ce5-two-diagrams-shared-root` (4 files at `84c93dc`) | MIT (bpmn-canvas `LICENSE`); copied with repo, commit, path, sha256 |
| MIWG (bpmn-canvas copies) | `docs/demo/B.1.0.bpmn`, `C.4.0.bpmn`, `C.5.0.bpmn` of bpmn-canvas | back in the bijection corpus (owner decision 2026-10-15, §1.2); T1–T3 status `unknown` until the F1 lot is published; until then the suite asserts today's F1 refusal (code and path) so that the change, when it lands, is seen. CC BY 3.0, OMG BPMN MIWG; **modified copies**: B.1.0 re-encoded to UTF-8, C.4.0 and C.5.0 stripped of their `color:` attributes (`BC@84c93dc:THIRD_PARTY_NOTICES.md:100-105`). The DS notice states both the attribution and these changes |
| MIWG (originals) | the same three reference models taken unmodified from the MIWG test suite (`https://github.com/bpmn-miwg/bpmn-miwg-test-suite`, folder `Reference`), so that `color:` is covered (conductor arbitration 2026-10-15) | CC BY 3.0; upstream commit and sha256 recorded when copied in L3 (`unknown` today); B.1.0 is ISO-8859-1 and is decoded per its XML declaration; same `unknown` status as the copies |
| multi-view | new, authored for this programme (MIT): process + lane set where a task is owned by the process **and** listed in `Lane.flowNodeRef`; two `BPMNDiagram` over the same process (two views of one identity); a collapsed sub-process with its own plane; `BPMNLabel` with bounds and `BPMNLabelStyle`/`dc:Font`; `bioc:stroke`/`fill` and `color:*`; a `conditionExpression` as `FormalExpression` and another as plain `Expression`, a timer `timeDuration`; a `sem:Info` with `laneRef`; a `bpmn:import` and a reference `other:M1` into it (unresolved QName) | MIT. The QName part needs an unregistered `xmlns:other`, refused by F1 as measured (§4.3) and preserved after the F1 lot: the fixture's T1–T3 status is `unknown` until the F1 lot is published (the former `multi-view-qname` split is withdrawn) |
| unknown-namespaces | new (MIT): `acme:` elements in `extensionElements` (with attributes, children, body), an `acme:owner` attribute, an unregistered `xmlns` and an `xsi:schemaLocation` | `unknown` until the F1 lot is published; meanwhile its F1 JSON follows the F1 lot's draft encoding and is fed to the codec directly (T1/T2 only, no XML edge) |
| synthetic | generated per concrete type (§8.2) | derived from MIT descriptors |

CC BY 3.0 fixtures are not shipped in any tarball (the package is private) but are listed in the repository's
`THIRD-PARTY-NOTICES.md` with attribution and changes.

## 11. CI job "moddle latest"

### 11.1 Shape

`.github/workflows/moddle-latest.yml`, Node 22 only — no `setup-python`, `pip` or Python step (owner rule; a guard
test asserts the absence of those strings).

- **Triggers**: `pull_request` and `push` to `main` on `packages/diagram-core/**`, `packages/diagram-bpmn-moddle/**`,
  `tools/diagram-profile-gen/**`, `.github/workflows/moddle-latest.yml`; `schedule` (daily); `workflow_dispatch`.
- **Permissions**: the test job has `contents: read` only and uses no secret. A separate `report` job (below) holds
  `issues: write`; it never installs bpmn-moddle.
- **Steps**:
  1. `npm ci` (lockfile tree, used for everything except bpmn-moddle).
  2. `LATEST=$(npm view bpmn-moddle dist-tags.latest)`.
  3. Install outside the lockfile, in an isolated prefix:
     `npm install --prefix "$RUNNER_TEMP/moddle-latest" --no-save --no-package-lock --ignore-scripts "bpmn-moddle@$LATEST"`.
  4. Run the compatibility suite (T1–T5) with `BPMN_MODDLE_DIR` pointing at that install and
     `EXPECTED_BPMN_MODDLE_VERSION=$LATEST`. The harness **fails** if the loaded `package.json` version differs from
     the expected one, so a silent fallback to the lockfile copy is impossible.
  5. `node tools/diagram-profile-gen/generate.mjs --diff <committed snapshot> <descriptors of latest>` prints the
     classified change.
- **Automatic issue on a red scheduled run** (conductor arbitration 2026-10-15, instead of Dependabot): a `report`
  job, `needs: test`, `if: failure() && github.event_name == 'schedule'`, `permissions: issues: write`, uses the `gh`
  binary of the runner with the workflow's `GITHUB_TOKEN`. It looks for an open issue labelled `moddle-latest`; if one
  exists it adds a comment, otherwise it opens one. The issue body carries `LATEST`, the pinned version, the run URL,
  the failing tests and the `--diff` classification, and links the bump procedure (§11.3). It runs no repository code
  and installs nothing.

### 11.2 What "always the latest version" means, and how it is guaranteed

- The **lockfile lane** (ordinary `verify`) tests the pinned version: reproducible, never moves by itself.
- The **latest lane** resolves the `latest` dist-tag at run time, at least daily and on every relevant PR, and
  asserts that the version under test is that tag (step 4). Because T4 requires 100 % of the **installed** latest
  descriptor to be mapped, the job fails on any descriptor change, additive or breaking, and on any bijection break.
- Consequence: the pinned version can lag `latest` by at most the time between a red scheduled run and the bump PR;
  the red run opens or updates the `moddle-latest` issue, which is the signal. No Dependabot configuration exists in
  this repository (`ls .github/dependabot.yml` → absent) and none is added.

### 11.3 How a new version enters the lockfile

1. The scheduled run fails, names `LATEST` and opens or updates the `moddle-latest` issue.
2. A bump PR runs `npm install -w @sentropic/diagram-bpmn-moddle --save-dev --save-exact bpmn-moddle@<LATEST>`
   (updates the package manifest and `package-lock.json`).
3. `node packages/diagram-bpmn-moddle/scripts/extract-descriptors.mjs` writes the new snapshot.
4. `node tools/diagram-profile-gen/generate.mjs` regenerates profiles, `coverage.json` and synthetic fixtures; the
   PR carries the diff classification.
5. **Additive** change: same profile major; merge when both lanes are green. **Breaking** change: profile major bump
   with a registered profile migration (K10) or an owner decision; the PR stops there until one exists.

### 11.4 Breaking-change classification

`breaking` = a type or property removed, a property type changed, `isMany` or `isReference` flipped, a composition
turned into a reference or the reverse, an enumeration literal removed, a default changed. Everything else is
`additive`.

## 12. Position of `bpmn-canvas`

- It remains **the BPMN editor and renderer**, the only place where bpmn-js lives (licence and watermark handled
  there).
- **F1** is the shared shape: bpmn-canvas is the shape partner; the alignment items are in §4.4.
- **`sem:`** is a versioned dialect with a pinned descriptor (§1.2), a test case of the generator, and **not** a
  second semantic model.
- **No second semantic model**: the authoritative exchanged model is F1 JSON; `DiagramState` is its bijective typed
  image (T1/T2). Two representations of the same information, proven equal, are not two divergent implementations
  (`docs/graph-dataviz-migration-plan.md:91`).
- **No dependency of bpmn-canvas on `diagram-core`** while `diagram-core` is private (`npm view
  @sentropic/diagram-core` → E404, `docs/graph-dataviz-migration-plan.md:118`).
- The reverse-engineering programme recorded by #167 (Track `01M518XJW7NZBFFPBH4PXQDWWE`, bpmn-js → `@sentropic/graph`)
  is about rendering and interaction parity; it does not change the semantic model specified here.
- **DS dependency on bpmn-canvas**: D7′ allows bpmn-js through `bpmn-canvas` in the DS elements package, with the
  bpmn.io watermark under the Camunda licence (§1.2). That is the elements package's concern; this programme adds no
  dependency on bpmn-canvas, neither in `diagram-core` nor in `@sentropic/diagram-bpmn-moddle`.

## 13. Lots, dependencies and gates

| lot | content | depends on | exit gate |
|---|---|---|---|
| **L0** — spec and traceability | this PR: spec, plan amendment, Track decision and items, `graph-dataviz-decisions.json` alignment | — | **G0**: PR reviewed; F1-A1…A7 (§4.4) relayed over h2a to the bpmn-canvas / d2d conductors, status recorded in §4.4 and in Track (§17) |
| **L1** — kernel 2.0 | K1–K13 in `diagram-core`, migration 1.1 → 2.0, `diagram-canvas` edge form, **removal of `bpmn@1`** (K10); state fixtures first, including the multi-view case in state form | L0 | **G1**: AC-L1 green; no `bpmn@2` document persisted outside fixtures |
| **L2** — generator and profiles | package skeleton with exact-pinned bpmn-moddle devDependency, descriptor snapshot, generator, generated profiles, `coverage.json`, synthetic fixtures, freshness guard, well-formedness catalogue v0 | L1 | **G2**: AC-L2 green (100 % mapped at the pinned version) |
| **L3** — codec and bijection | `toDiagramState` / `toModdleJson`, report, corpus with notices, T1–T5 | L2; **external**: the F1 lot of bpmn-canvas / d2d, published | **G3** (the D1 condition, BPMN scope only — §1.3): T1/T2 exact on the multi-view fixture, which needs the published F1 lot ⇒ schema 2.0 declared frozen, in a short report to the owner |
| **L4** — CI latest | workflow with the `report` job, version assertion, fault-injection test, bump procedure in the package README | L3 | **G4**: one green scheduled run on `main`, one demonstrated red run under fault injection, and the issue it opened |

L2 can start its extraction script in parallel with L1, but its outputs target the 2.0 shapes and merge after G1.
L3 can be developed against `84c93dc` and the F1 lot's drafts; only G3 waits for the published F1.

## 14. Acceptance criteria (measurable)

**L1**
1. `npm run check` and `npm test` for `@sentropic/diagram-core` and `@sentropic/diagram-canvas` exit 0;
   `DC:tests/no-dom-no-deps.test.ts` unchanged and green.
2. Each of K1–K13 has at least one named positive test and one rejected case asserting the diagnostic code of §6.
3. Every remaining fixture under `DC:fixtures/` migrates 1.1 → 2.0 with an asserted report.
4. An `edge` occurrence yields a path through its waypoints verbatim in `diagram-canvas`; the existing
   `RelationOccurrence` scene tests pass unchanged.
5. `git grep -n "bpmn@1\|BPMN_SKELETON" -- packages/` returns nothing; a document naming `bpmn@1` is refused as an
   unregistered profile.
6. `scripts/verify-publishable-licensing.test.mjs` still asserts 18.

**L2**
1. `node tools/diagram-profile-gen/generate.mjs --check` exits 0 and runs in a repository guard.
2. `validateProfile` returns no diagnostic for each generated profile.
3. `coverage.json`: every type and own property of the pinned bpmn-moddle (166 / 379 at 10.3.1) and of `sem`
   (1 / 6) in exactly one class; zero unmapped; every virtual property has an inverse or `no-inverse`.
4. `SHA256SUMS` matches the snapshot; the `sem` sha256 is `c274f46f…7c97`.
5. The well-formedness catalogue v0 exists; each rule cites its OMG clause or XSD line; a test proves that no rule
   blocks import (a document violating every rule still converts, with one diagnostic per rule).

**L3**
1. T1 exact on 100 % of the documents whose status is not `unknown` (today: E3, synthetic). 2. T2 exact on the same.
3. T3: zero unattributed difference, with negative tests proving that an unattributable difference fails.
4. T4: 100 %. 5. T5: 100 % of properties exercised, with non-default values in the synthetic fixtures.
6. Report: zero `degraded` and zero `unsupported` on that corpus; preserved counted separately. 7. Documents marked
   `unknown` (MIWG copies and originals, multi-view, unknown-namespaces) run with their expected current outcome
   asserted, and move to criteria 1–6 when the F1 lot is published; G3 requires the multi-view fixture to have moved.
8. `THIRD-PARTY-NOTICES.md` lists the MIWG files, copies and originals (CC BY 3.0, with the changes) and the E3
   files (MIT). 9. `scripts/verify-layering.test.mjs` forbids DS → `@sentropic/diagram-bpmn-moddle`.

**L4**
1. Workflow present, Node only (guard asserts no `python`, `pip`, `setup-python`). 2. The harness asserts the loaded
   version equals `npm view bpmn-moddle dist-tags.latest`. 3. A test that injects an extra type into the descriptor
   makes T4 fail. 4. Triggers `pull_request`, `push`, `schedule`, `workflow_dispatch`; test job `permissions:
   contents: read`; `--ignore-scripts`. 5. The `report` job opens an issue labelled `moddle-latest` on a red scheduled
   run, or comments on the open one; demonstrated once under fault injection. 6. The bump procedure (§11.3) is in the
   package README.

**Every lot**: English commit messages with a measured body, no attribution trailer, no Python; `node
scripts/run-script-guards.mjs` and `npm run licensing:check` exit 0.

## 15. Risks

| risk | parade |
|---|---|
| **Pre-mortem (dossier)**: in six months a 1 200-slot `bpmn@2` exists that nothing renders or edits; bpmn-canvas edits the real BPMN through moddle; import looks complete because the source was stored; DI and extension edits desynchronise source and typed model | F1 JSON is the single exchanged model and the state is proven its bijective image (T1/T2), so there is no second source to drift; source retention is limited to unknown namespaces and counted apart |
| **Argument against the owner's choice (dossier)**: going straight to A′ freezes a schema without multi-view proof | G3: 2.0 is frozen only after T1/T2 pass on the multi-view fixture; until then no `bpmn@2` document is persisted outside fixtures. G3 lifts the D1 condition for the BPMN scope only (§1.3) |
| F1 is unpublished and already drifted after `84c93dc` (§4.2) | pin `84c93dc`; alignment table §4.4; F1 status `unknown` in every report; publication vehicle asked as F1-A7 |
| G3 now waits for an external lot (F1 in bpmn-canvas / d2d) | external blocker on L3 in Track (§17); L1, L2 and most of L3 proceed meanwhile |
| the bpmn-canvas workbench branch introduces a "shared Python wire tuple" diagnostic mapping (`e9f5f89`, §4.2) | the DS defines conformance on F1 JSON only and imports no artefact from that branch; Node/TS only (owner rule) |
| running unreviewed `latest` code in CI (supply chain) | isolated prefix, `--ignore-scripts`, no secret, read-only permissions in the test job; the `report` job holds `issues: write` but installs and runs nothing from the repository or npm |
| GitHub disables scheduled workflows after a period of repository inactivity | PR and push triggers remain; the README of the package says how to re-enable the schedule |
| a new upstream release turns every relevant PR red until the bump PR lands (intended by the owner's « échoue sur toute rupture ») | the issue and the failure message name the bump procedure (§11.3); the bump PR is the first action |
| schema 2.0 breaks `diagram-canvas` | same lot, same tests (L1); `RelationOccurrence` untouched (K9.5) |
| generated profiles grow `diagram-core` | data only, private package; size measured in L2 (`unknown` today) |
| moddle quirks (reference to an id-less `ExtensionDefinition`) | flagged by the generator, reported `unsupported` |

## 16. Unknowns

- **U1** the owner's real BPMN corpus; **U2** dialects beyond `sem:` (camunda, zeebe…); **U3** F1 encoding of
  external (QName) references, hence the codec mapping of `external-reference`; **U4** document sizes and
  performance; **U5** exact well-formedness rule set; **U6** how moddle resolves references to
  `ExtensionDefinition`; **U7** folding into `@sentropic/diagram-codecs`; **U9** projection of connector entities as
  graph edges for canvas or processing; **U11** external consumers of bpmn-canvas; **U12** cost in calendar time (the
  dossier's lot counts are judgments); **U13** publication vehicle and version of F1 (F1-A7); **U14** virtual
  properties with no inverse in the descriptors (e.g. `CategoryValue.categorizedFlowElements`); **U15** exact JSON
  encoding of preserved content in the F1 lot.
- Closed since the first version: **U8** (no runtime XML I/O, §1.2), **U10** (automatic issue, §11.1).

## 17. Traceability

Track workspace `streams`, written with the `track` CLI 0.98.0 from this branch after rebasing on `4a5e80a7`
(#168, which brought the log to 1666 events and recorded D7′). The writes of the earlier versions of this PR were
replayed with the CLI each time, never merged by hand (the log is a hash chain), so every id below is new. The CLI derives the actor from `git config user.email` (`human:<email>`); `track validate` →
`OK: 1689 events, integrity + desync clean` (1666 on `4a5e80a7`, plus 23);
`track events-contains --base <main log> --candidate .track/events.jsonl` → `OK: candidate contains all 1655 base
event id(s)`.

| object | Track id |
|---|---|
| decision (commitment) — options `0`, `A`, `A′`, `B`, `C`, `D→A′`; recommendation `D→A′`; selected `A′`, outcome `go` | `01M51CN4FK67W6X25C6Z9MY9WR` |
| artifact `rendered-view` → `spec/SPEC_EVOL_GD_BPMN_MODDLE_COVERAGE.md`, source dossier sha256 `c40a396fdaa3a9608940f64b660c04f7d7cead3323dd3fd09aa16c316c06154f` | on the decision above |
| feature GD-BPMN-MODDLE (parent: stream S4 `01KW860AE02142WK477SGQCFY9`) | `01M51CMCQTYAGFVY3EX3VNH87J` |
| L0 — spec and traceability (in progress) | `01M51CMCYNFMXS6ZP5NMRKXNHV` |
| L1 — kernel 2.0 | `01M51CMD735QT8BC1MG6SE48WC` |
| L2 — generator and profiles | `01M51CMDEZ8BNDE5P5C8F5CAAR` |
| L3 — codec and bijection | `01M51CMDPV250R5VXDZEWBYKX3` |
| L4 — CI latest | `01M51CMDZCJAZAZSZKH47MZKYN` |
| external blocker on L3: F1 lot of bpmn-canvas / d2d, engagement `bpmn-canvas+d2d:F1-preserve-unknown-extensions`, rule `manual` | `01M51CMF8SGJJR2G0RJZXG6GJE` |

Dependencies L1 → L0, L2 → L1, L3 → L2, L4 → L3 are `dependency` blockers with rule `linked-accepted`; each lot
carries one acceptance criterion pointing at §14. No acceptance run and no comprehension record was created. The ids
of the two earlier versions (decisions `01M51212CEWV91B1E8HEPTDDNV` and `01M51C22VMKPETPEXM0AMD3MZK`, features
`01M511ZNB2RR64XQRQ1JZ0KEAA` and `01M51BZY5V27TWNHXEECAGX00H`, …) never reached `main` and do not exist on this
branch.

`spec/graph-dataviz-decisions.json`: D1 and D3 now read `"status": "rendered"` with a `rendered` object (D1 = A,
Track `01M38WXG0GRC4899GWWVAZXEFF`; D3 = C, Track `01M38WXGBSF7J8NWPC8FKERT1T`). These are the owner's decisions of
2026-09-24, already on `main`, so the replay did not change them; D2 and D4 were marked the same way by #168. The fields that `plan/replay-graph-dataviz-track.mjs`
compares (`context`, `options`, `recommendation`) are unchanged: its preview reports 0 operations. The pending records
it created (`01M2KK5XMT167FA4389ZJMRV39`, `01M2KK5XQSHM5Y7WB2TCAW6D8T`) stay pending, because
`docs/graph-dataviz-verify.mjs:60-63` asserts it. That script already fails on `origin/main` before this PR, on an
unrelated check (`Unexpected source adaptation packages/dataviz-angular/package.json`, line 58); no workflow runs it.

## Annex A — Review: corrections applied / refused

Independent review by muse 1.3 (max effort) of the first version, verdict « fusionnable après corrections listées »
(`.ds-scrap/x2-REVIEW-muse.md`, not committed). Each correction was checked before being applied.

| # | correction | outcome | where / proof |
|---|---|---|---|
| 1 | name the fate of the ArchiMate half of the D1 condition | **applied**: G3 lifts it for the BPMN scope of 2.0 only; the ArchiMate fixture stays due before any freeze of native M3 profiles. Verified: the D1 `recommendation` in `spec/graph-dataviz-decisions.json` does require « une ArchiMate avec contraintes de relations » | §1.3, §13 (G3), §15 |
| 2 | name the well-formedness catalogue as a deliberate addition in the plan amendment | **applied** | `docs/graph-dataviz-migration-plan.md`, amendment, third bullet |
| 3 | mark the codec mapping of `external-reference` `unknown` | **applied** | K3, U3 |
| 4 | assume that K9.5 changes the route of existing generic relation occurrences, and their migration | **refused, with a clarifying sentence**. K9.5 applies to the new `edge` form of `EntityOccurrence` (K9.2); it never touched `RelationOccurrence`, whose route stays as built at `packages/diagram-canvas/src/scene.ts:266`, `:296`. No `generic@1` scene changes and no relation-occurrence migration exists. AC-L1.4 now asserts the existing `RelationOccurrence` scene tests pass unchanged; review item U15 (cost of that migration) is therefore not added | K9.5, §7, AC-L1.4 |
| 5 | source or remove « 16 des 120 » in the Track decision context | **applied (removed)**. The figure came from the dossier and is not derived in the repository; the replayed context states what `skeletons.ts` declares (7 entity types, 4 relation types, 1 port type, no DI) | Track `01M51CN4FK67W6X25C6Z9MY9WR` |
| 6 | say that `docs/…:NN` / `spec/…:NN` citations refer to the base | **applied**; the rebase base `4a5e80a7` changes none of the cited files except `spec/graph-dataviz-decisions.json` (command in the header) | header, conventions |
| 7 | say where `default` / `isAttr` compared by T4 live; settle an id-bearing value inside an open collection | **applied**: profile metadata read by T4; in an open collection such a value stays a struct, its id an ordinary field | §8.3, §5 |
| 8 | AC for the well-formedness catalogue v0; channel and record of F1-A1…A6 | **applied**: AC-L2.5; channel h2a via the `design-system` conductor, status in §4.4 and as an external blocker on L3 in Track | §14, §4.4, §13, §17 |
| cosmetic | Association → BaseElement cited from the descriptor first; `di:Shape.bounds` / `di:Label.bounds`; N5 lax mode; unqualified names in the effective descriptor; `subsettedProperty` ignored | **applied**, each verified: `Semantic.xsd:70-71`; `NM:bpmn-moddle/dist/index.js:55` (`lax: true`) and `NM:moddle-xml/dist/index.js:720-727`; 3 `subsettedProperty` in `di.json` | §5, §8.3, §3.1, §10.3 |
| U13, U14 | F1 publication vehicle; virtual properties without inverse | **applied**: F1-A7 / U13; `no-inverse` value in the binding file / U14 (`CategoryValue.categorizedFlowElements` verified: `isVirtual`, no declared inverse) | §4.4, §8.1, §16 |

Changes made at the same time, from outside the review:

- **Owner decision on F1, 2026-10-15** (§1.2): F1 preserves unknown extensions; separate F1 lot, tests first, with an
  XML round trip of the three MIWG files. Consequences: F1-A1/A2 settled (§4.4); MIWG back in the bijection corpus and
  the QName case back in the multi-view fixture, both `unknown` until the F1 lot is published (§10.4); G3 waits for
  that publication (§13).
- **Conductor arbitrations, 2026-10-15**: `bpmn@1` removed in L1 (K10, AC-L1.5); automatic GitHub issue on a red
  scheduled run instead of Dependabot (§11.1, AC-L4.5); MIWG originals added to cover `color:` (§10.4); the export
  direction is a consequence of the verbatim that D3 = C does not forbid (§1.2); bpmn-moddle is a test dependency only,
  with no runtime XML I/O (§1.2). The arbitration cited « D7′ », which was not yet on `main` at that time; it is now
  (`01M51CADFM2PXZWDDZ9HWWH62W`, merged with #168), and §1.2 and §12 rely on it instead of D7 = A.
