# SPEC EVOL — GD-M3-DIAGRAM-MODEL: one metamodel across generic, archimate, bpmn, uml (r4)

| Field | Value |
| --- | --- |
| Author revision | Round 5 plus the owner's targeted extra author round of 2026-10-27 for the relation-target fold finding only; artifact name r4 is retained. |
| Status | Specification authored by Engram on 2026-10-27. No implementation, admission, package publication, consumer switch-over or review is claimed. |
| Author / independent assessment | Sol 6.1 xhigh, specification author. Independent assessment belongs to Muse Wonder xhigh; the author supplies no assessment of their own text. |
| Baseline | Copy of DS commit f6f3ba3790696754b6e08b13b62148ef3556bc4e, SHA-256 e7ca16aedeb752f7fcdc11673e4c8600450fa2b7f3b4ac224e493f718c24b9ef. |
| Deliverable | Only /home/antoinefa/src/graphify/.graphify/scratch/design/ontology-guardian/m3/SPEC_EVOL_GD_M3_DIAGRAM_MODEL-r4.md. No repository is changed. |
| Governance | G2: Engram governs profiles, schemas, fixtures, migrations, pins and digests. The Design System owns and publishes the diagram-core executor, layout and rendering. |
| Pivot | SemanticDocument / ViewDocument; generic@2, archimate@2, the A′ generated BPMN family and uml@2. The @1 declarations remain immutable. bpmn-canvas profile-c14n/2 remains unchanged. |
| Scope | Shared model, typed presentation/view data, profile deltas, validation, projection, measurement, migration and qualification contracts. Rendering, interactive UI, exports and editing have their separately owned roadmap gates in §10. |
| Tooling | Node/TypeScript and native tools; zero Python. Offline execution with embedded JS/styles, no CDN and no network loads in composition, validation, layout or painting. Read-only authoring access to an additional matrix transcription source is recorded in §8.5. |

## Owner orders and binding sources

Owner order of 2026-10-25, verbatim as supplied for this round:

> « Attention on a deja cree une etude et un mode pour les diagrammes cote sentropic que tu devrais reprendre. Il couvrait aussi bpmn. »

Owner decision of 2026-10-26: Sol authors r4; completed ArchiMate and UML profiles are **archimate@2 and uml@2**, with explicit migrations from immutable @1 skeletons. There is no same-id exact-pin dispatch. Owner decision of 2026-10-27 assigns authorship to Engram as guardian in place of the design system.

The owner relay of 2026-10-18 is transcribed exactly from its pinned file, including its spelling:

> « Les algo open licence libre ou algo public mais dans notre js a nous … On respect mais on libere au max et on a nos propres souches »
>
> « diagrammes gigogne (ouvrables) … Tout diagramme est un graph et toute representation est une forme de synthese. Il faut bie modeliser diagramme layout et skills de presentation »
>
> « L enjeu n est pas la taille mais la reactivité et l atomicité des editions … la acapacite offline sans cdn doit etre possible donc ok la 32Mo qd js embedb »

The brief also supplies the sentence « Tout diagramme est un graph et toute representation est une forme de synthese. Il faut bien modeliser diagramme layout et skills de presentation ». Both sources bind the same three layers. “32 MB” is an **order of magnitude, not a ceiling**.

| Source key | Immutable source / SHA-256 | Binding clauses |
| --- | --- | --- |
| STUDY | /home/antoinefa/src/sentropic/.tmp/governance-unification/study.md, r10, 7e3a3d1cb863eafce347bceff2639d5fdbc12a6dc2515371b34c2524687c5335 | §1.2 point 4: one metamodel; N13: no BPMN extension loss; M4: profile pins and executor qualified together; R-06: no divergence across bpmn-canvas, Focus, d2d and diagram-core. |
| G2 | /home/antoinefa/src/sentropic/.tmp/governance-unification/decisions.md:9, 731ecd6c0907332ad10ce4f7ae44e7eb812a91767ce60558fe9fb3847df7bcb8 | Engram data governance; DS executor ownership. |
| OWNER | /home/antoinefa/src/sentropic/.tmp/governance-unification/owner-diagram-decisions-via-hcond.md, 76eee3b4e91b34027c030c8c4c48006e0d387d224ffd4bd990085b557aa2a985 | Three layers, nested/openable diagrams, own JS, offline, atomicity. |
| REQUIREMENTS | /home/antoinefa/src/sentropic/.tmp/governance-unification/DS-DIAGRAM-MODULES-REQUIREMENTS.md, c65f5f3afc752b387d3ee2498f894fb6a8637fa7a845b9e0608b450b4325e944 | Owner-validated #711 geometry and behaviour; line 65 preserves 600 interactions and 240 stress toggles, worst interaction below 1.8 s, no idle work. |
| G0 | /home/antoinefa/src/graphify/.graphify/scratch/design/ontology-guardian/SPEC-G0-guardian-contracts.md, e6362445f87d6581ac31224c2dc44e15214b3a7debc2afff2b3d25b8b37ff8f6 | Closed record/catalog/lineage, receipts, §5.5 admission, exact preimages. |
| DS | sent-tech-design-system f6f3ba3790696754b6e08b13b62148ef3556bc4e; per-file hashes §8.5 | Read using git show revision:path. Historical M2 and A′ contracts are transcribed before extension below. |
| PARITY | sent-tech-design-system 610c0353d899befeb59634b46b9d90f578661731 | PR #193 uniqueness order. This remains the parity baseline, never replaced by a moving main. |
| KIT | sentropic 4138a0ecba9c5b37409abb5ac00f732d02b7dc8d:docs/governance/kit/src; file hashes §8.5 | The merged #711 bytes; scratch kit bytes are not this source. |
| HRPN | airbus-genair-hrpolnav faf21b6f259f93a485994bbe03b4023763bf2597; full source root /home/antoinefa/src/airbus-genair-hrpolnav; per-file hashes §8.5 | Frozen ds-fixtures and separate producer bytes, each retrieved by git show revision:path. |
| G0-CODE | Engram 618977a86a25c35e426a87f97cb9f3391cd1c654:src/ontology-guardian; file hashes §8.5 | Implemented G0 contracts after #408; data types, digest procedures and admission. This code supplies no production owner/namespace registry. |

## 0. Reading and evidence discipline

SHALL and MUST NOT are normative. frozen-requirement restates REQUIREMENTS; measured-code states a pinned observation; decision implements the supplied decisions and the contracts they require. Source bytes, specified behaviour and executed qualification are separate facts. An expected diagnostic is an oracle value, not a claim that a future executor has produced it.

An unverified item always names its owner in §11.2. It blocks only dependent claims and gates; it never becomes an admitted placeholder. No digest is invented. A full digest is 64 lowercase hexadecimal digits. This document's final file hash is computed externally, avoiding a self-hash.

No consumer extension or local refinement may carry the standard presentation. D3-C still preserves genuinely foreign content as preserved-unvalidated, separately counted and never promoted to validated data. No network is needed by a consumer: all schemas, profile/matrix bytes, contract assets and fixtures are pinned locally before use.

## 1. One metamodel and three separate layers

### 1.1 Family routing

The complete model is SemanticDocument / ViewDocument across generic, archimate, bpmn and uml. A family is data over that model. A new profile major is neither a new executor nor a new metamodel.

| Family / artifact | Active target | Retained source | Scope |
| --- | --- | --- | --- |
| Generic cards | generic@2 plus diagram-presentation@1 (§3.2) | generic@1 | Cards, containers, labelled links, semantic categories and legends. |
| ArchiMate | archimate@2; same presentation contract when drawn as cards | archimate@1 skeleton | Catalogue, ordered source/target relationship tuples, grouping, viewpoints. |
| BPMN | bpmn@2, bpmndi@1, dc@1, di@1, bioc@1, color@1, sem@1 via A′ | bpmn@1 skeleton | Descriptor-generated semantics, F1, DI, extensions. |
| UML class diagrams | uml@2; same presentation contract when drawn as cards | uml@1 skeleton | Classifiers, properties, operations, associations, multiplicities, packages and stereotype application. |
| Canonicalization | profile-c14n/2 | Same bytes and fixtures | Identity only; never a document validator. |
| Withdrawn proposal | architecture@1 is never registered, pinned or migrated to | No published predecessor | §9 landing is retained. |

The native registry remains keyed by ProfileId (the pinned createProfileRegistry rejects duplicate ids: “a profile id is a version, not a name”). generic@1/@2, archimate@1/@2 and uml@1/@2 coexist as **different ids**. Pins authenticate bytes/version; they do not dispatch two incompatible declarations under one ProfileId.

### 1.2 Layer ownership

| Layer | Carrier | Data permitted |
| --- | --- | --- |
| Graph | SemanticDocument, profile data governed by Engram | Entities, relations, ports, semantic names/descriptions/categories, type/refinement definitions, resources and preserved foreign content. No drawing instructions. |
| Layout | ViewDocument and DS layout input/output | Occurrences and geometry, folds, projection provenance, filters, authored summary definitions, recursive hints, measurements and fixed footprints. |
| Presentation skill | Typed ViewDocument.presentation.diagram plus governed contract/theme assets | Card anatomy, icon selection, category→token bindings, legend order, relation occurrence strokeStyle, drawing roles and theme resolution. |

Semantic “category” denotes a domain distinction; “token” denotes its rendering. A diagram may retain its categories while changing every token, icon, footprint and stroke without changing any semantic byte or semantic profile digest. Card title falls back to the semantic name by reference; it is not duplicated unless an explicitly authored view title differs.

### 1.3 No presentation in the graph

All standard drawing fields — kicker, body/detail line allocations, subtitle, footer, icon, token, order, legendRef, strokeStyle, footprint and collapsed — live in the view/presentation contract. They are not added to a family entity/relation schema. A domain attribute whose meaning happens to be text remains semantic, but it is read by a declared projection; a renderer never treats an arbitrary semantic attribute as a drawing instruction.

Legend/category entities contain semantic names, category keys and descriptions. Their header adornments, key order and category→token map are view data. No “semantic presentation” exemption exists. The leak gate scans semantic declarations and fixture instances for the drawing fields, and asserts semantic-digest invariance after changing view presentation.

### 1.4 Owner requirements, with their gates

The fixed card is 460 × 200 CSS pixels at zoom 1, square-cornered and never enlarged to fit text or docks. Collapsed containers have that size at every depth. Header icon 70; gap 6; kicker 22/400 uppercase at drawing time; title 32/700, line-height 1.3; body 24/400, line-height 1.3, first glyph inset 14. Footer bottom 9.25; rule 1 screen pixel at every zoom. No ellipsis or clipping; overflow is diagnosed. Expanded subtitle→rule 4; rule→children 16; children→bottom 16. Expanded frames sharing a row align with zero deviation. The collapsed subtitle is centred in both axes with 16 side margins, without justification or stretching.

One duotone pictogram family on its own subpath, 64-unit viewBox, includes brain/robot; its card rendering never mixes Lucide glyphs. The fold control uses the separately specified DS IconButton and focus-visible keyboard ring. Own JS algorithms, atomic edits, offline/no CDN and nested openable diagrams bind all gates.

§4 defines model-facing footprints, measurement and projection; §10 M2 owns pixel parity, M3 interactive reflow and the **600 interactions including 240 stress toggles**, M4 xyflow/standalone, M5 exports and M6 editing. Moving an interaction gate out of M1 never withdraws its workload or 1.8-second budget.

## 2. Source contracts, transcribed before extension

DS paths in this section are read at DS unless a more specific revision is named.

### 2.1 Native profiles and M2 invariants

M2 model §3.4: one entity has N occurrences in one view and occurrences in several views; deleting an occurrence deletes a drawing; deleting its entity requires explicit policy. SemanticDocument excludes camera/geometry/components. Commands are transactional with inverses or a stated reason. Migration keeps the original and refuses an unknown major in write. References are nominal and not interchangeable.

Native Profile (profile.ts): id, name, version, completeness; entityTypes, portTypes, relationTypes, constraints, limits; optional notes. Native role declaration: role, cardinality { min, max }, targets (entity/port), optional entityTypes. Native attribute values carry their kind; an undeclared attribute refuses attribute-not-in-schema. Document refinements are additive; redeclaring an inherited attribute refuses type-definition-conflict.

| Pinned declaration | Exact starting contract |
| --- | --- |
| generic@1 | node: required name≤200, state, weight, duration, createdAt, pinned, tags, owner. container: required name≤200 and collapsed. port: in/out/inout, label≤80. link: source/target 1..1 entity/port, label≤120, weight. contains: tree containment, parent container. association: member 2..8, label≤120. Global container-name uniqueness and container count≤64. |
| archimate@1 | element with name, required layer in strategy/business/application/technology/physical/motivation/implementation, optional aspect active/behaviour/passive/motivation; junction operator and/or; grouping name. Eleven relation names with 1..1 arity only. No matrix; no conformance claim. |
| uml@1 | class, interface, package, property, operation. Class stereotypes are collection(text≤60), max 8; property multiplicity text≤20; association sourceMultiplicity/targetMultiplicity text≤20. generalization, dependency, packageContainment tree. No completed multiplicity/profile/stereotype rules. |
| bpmn@1 | process, participant, lane, task, subProcess, event, gateway; flowPort; sequenceFlow, messageFlow, association, flowElementContainment; bpmn-containment tree. No event matrix/complete DI. |

generic.ts SHA-256 b19967fe65483abdbf0e271f197e13691904e4b087c1542de23c52e2ad4f45c3 and skeletons.ts SHA-256 0a01fd2569e68c2b99ca754f28dc7cbbbd9a1d491ffa9981161cae3bbf56b54e remain immutable. New declarations go in new files; editing these historical files fails the preservation gate.

### 2.2 Native view and diagnostic shapes

view.ts transcribes PresentationState as { camera: { x, y, zoom }, grid?: { size, snap }, theme?: string }. ViewDocument has exactly viewId, semanticDocumentId, revision, entityOccurrences, relationOccurrences, portOccurrences, groups, filters, presentation. Its revision is the document revision when last changed, never ahead of the document. RelationOccurrence has id, relation, endpoints and optional waypoints. An endpoint has role and occurrence. VisualGroup has id, optional label/collapsed. §3.2 extends PresentationState; §4 extends endpoints/groups and adds only summaryLabels at the top level.

diagnostics.ts transcribes Diagnostic as { code, severity: "error"|"warning", path, message, refs?: string[], details?: Record<string,string|number|boolean> }. Absence of refs/details is distinct from an empty object/array. Appendix C supplies literal new arms; unchanged native arrays are neither enriched nor globally sorted.

### 2.3 A′ shared kernel prerequisites

A′ K1 uses subtype/subsumption; K2 adds targetTypes?: TypeRef[] to a reference schema, checking both existence and target type (reference-target-type for a mismatch). K6 value is **{ kind: "struct", type: TypeRef, fields: Record<string, AttributeValue> }**, nested and validated against its declared effective type; its diagnostics are struct-type-unknown, struct-field-not-in-schema and struct-type-not-allowed. K8 overlays use qualified attribute names and active profileRefs; overlaying never redeclares a base attribute. K9 owns generated DI view schemas and shapes/edge occurrences, including verbatim waypoints. These mechanisms are shared, never reimplemented with family-specific branches.

UML @2 depends explicitly on K1/K2/K6. This specification supplies their required declaration interpretation in §§3.9.1/3.11.1/A.4; it does not claim their executor/schema registration already exists. Their schema-major and publication qualification is the A′/DS kernel dependency, recorded unverified in §11.2. generic@2 card presentation does not depend on structured semantic attributes.

## 3. Governed family and presentation contracts

### 3.1 Semantic successors

generic@2 is a replacement **base**, not a G0 child of generic@1. It removes collapsed, global container-name uniqueness and container count≤64, and raises link.label to 200. It retains the general node/port attributes and link weight. It adds semantic legend and legend-key types:

| Type | Semantic attributes | Container capability |
| --- | --- | --- |
| node | name required text≤200; general @1 attributes unchanged; optional category text≤40 with key grammar | false |
| container | name required text≤200; optional category text≤40 | true |
| legend | name required text≤200; optional description text≤600 | true |
| legend-key | name required text≤120; category required text≤40; optional description text≤200 | false |

Category is domain data. No token, icon, order or footprint is an attribute of any of these types. contains permits parent roots container/legend, is a tree, and declares containment/parent/child as data. children-restricted confines a legend's children to legend-key; required-parent confines each key to a legend. category is unique within its legend. Key drawing order is validated in the view, not as a semantic unique-attribute constraint. Limits: maxEntities 100000, maxRelations 500000, maxEndpointsPerRelation 8. link source/target remain 1..1; association member 2..8.

### 3.2 Shared typed presentation fragment: diagram-presentation@1

#### 3.2.1 Identity and G0 application

diagram-presentation@1 is a **G0 contract artifact**, profileShape mechanism-descriptor, artifactKind contract. Its binding is exactly { artifactKind: "contract", schemaPin: Pin, compatibilityMatrixVersion: "1" }. It is not a diagram profile and MUST NOT appear in SemanticDocument.profileRefs, lineage.parents of a family, or a semantic P-PINS layer list. It uses the G0 contract-verdict receipt; theme data additionally requires theme-invariance. Contract/schema bytes are governed once by Engram, executed by the generic DS view validator. No third semantic profile shape is introduced.

G0 §2.3 is transcribed before application: S-1 permits additive types/relations and narrowing; S-2 forbids parent removal, widening and attribute redeclaration; S-3 refuses unresolved conflicts; S-4 refuses cross-profile endpoints without a module/join; S-5 prohibits network loading; S-6 forbids weakening a core gate; S-7 binds deterministic effective declarations/rules to ordered pins.

Application is **not semantic stacking**. It joins a validated semantic context to a typed ViewDocument through nominal references, adds no semantic attribute/type, never redeclares name and never silently changes profile ownership. This is the executable module/join contract covering the references below. Family profile bytes, ProfileId and all three semantic digests are identical before/after application.

Closed input:
{ familyPins: Pin[], semanticDocument: SemanticDocument, sourceView: ViewDocument, contractPin: Pin, semanticCategoryPins: Pin[], adapterPin: Pin }.
familyPins are precisely the unique semantic profileRefs in their stored order. semanticCategoryPins is [] or the declared generic@2 pin when category entities of that profile are used by another family. That pin must already be in profileRefs/familyPins; it is not an implicit import. adapterPin identifies the qualified view-contract executor/schema adapter. Pin equality means equality of id, version and contentDigest, never just a display label. input.contractPin MUST equal sourceView.presentation.diagram.contractPin and the resolved diagram-presentation@1 contract pin. Resolve that contract's catalog entry and parse its ontology.compatibility.adapter exact pinned reference; it MUST equal input.adapterPin, and its bound schema asset MUST equal the contract artifactBinding.schemaPin. contractPin authenticates the presentation contract; adapterPin authenticates the catalog-selected executor/schema adapter. Both equalities are mandatory and neither input can select a different contract/schema.

Closed output union:
{ outcome: "ok", view: ViewDocument, familyPins: Pin[], contractPin: Pin, presentationDigest: Digest, diagnostics: [] }
or { outcome: "refused", diagnostics: Diagnostic[] } (no candidate view).
presentationDigest is SHA-256 of RFC 8785 of the full presentation.diagram value; the contract pin is inside that value. It is an application digest, not any of G0's four semantic/catalog digests.

Execution, in order: resolve all pins locally and verify bytes; check input.contractPin against DiagramPresentation.contractPin, check adapterPin against the resolved contract catalog ontology.compatibility.adapter, and check the adapter's schema binding against artifactBinding.schemaPin; validate families independently (or their admitted G0 semantic stack); validate every occurrence against its owning family; validate the closed presentation shape; resolve selectors/references; validate slot bounds, category bindings and legend order; only then emit the effective view validation context. Unknown pin/schema/selector, an absent join, duplicate binding, unsupported contract version, conflict or invalid value refuses. No “last wins” rule and no consumer callback/schema augmentation exists. A family is selected by its resolved owner profile/type metadata, never a literal list of consumer or scene ids.

#### 3.2.2 Closed persisted shape

The extension is **PresentationState.diagram?**, preserving camera/grid/theme unchanged. Every object below is closed. Pin/nominal references are the G0/M2 types. Keys of entities/legends refer to existing entity occurrence ids in the same view; a reference to a semantic entity is not accepted as an occurrence id.

~~~ts
type StrokeStyle = "solid" | "dashed";
type DiagramForm = "card" | "container" | "legend" | "legend-key";
interface PresentationText {
  readonly title?: string;    // ≤200; key title ≤120; absent reads semantic name
  readonly kicker?: string;   // ≤80
  readonly body?: string;     // ≤400
  readonly detail?: string;   // ≤400
  readonly subtitle?: string; // ≤600; container/legend only
  readonly footer?: string;   // ≤120
}
interface EntityPresentation {
  readonly form: DiagramForm;
  readonly text: PresentationText;
  readonly icon?: string;          // key, 1..40; never SVG/path/URL
  readonly categoryRef?: EntityRef; // semantic legend-key entity, not a token
}
interface LegendPresentation {
  readonly order: readonly EntityRef[]; // each direct key once; authored order
}
interface CategoryTokenBinding {
  readonly legendRef: EntityRef; // semantic legend
  readonly category: string;     // key 1..40
  readonly token: string;        // token-name 1..80
}
interface DiagramPresentation {
  readonly contractPin: Pin;
  readonly entities: Readonly<Record<string, EntityPresentation>>;
  readonly legends: Readonly<Record<string, LegendPresentation>>;
  readonly categoryTokens: readonly CategoryTokenBinding[];
}
~~~

All presentation fields are typed schema data. Partial<Record> is not an open JSON bag: unknown fields refuse. body/detail each carry one allocated content role; markup/executable content is not admitted. Legend-key text permits kicker/body/detail/footer so conversion preserves its authored strings without concatenation, truncation or a side ledger. Such retained text is available to accessibility/export; the swatch form need not draw the original card icon. Icon content is retained even when its drawing is retired.

RelationOccurrence.strokeStyle? is the **only** stroke carrier, default solid; no semantic fallback exists. The contract does not duplicate it in another table. A view-only stroke change keeps semantic bytes/revision/digests unchanged. Projection preserves the field's presence and value, including absent versus explicit solid.

Footprints are governed contract/layout assets (§4.6), not EntityTypeDeclaration fields. Presentation edits replace a view and retain its document revision; they do not call update-entity-attributes.

#### 3.2.3 Selectors, conflict handling and four composition witnesses

Card selector: any non-container entity occurrence whose semantic type is valid in its owner family. Container selector: a valid type with inherited container capability. Legend/key selector: the corresponding semantic types declared by the admitted generic@2 module. Explicit form must satisfy its selector; no shape inference from an id/string/label. Every semantic endpoint remains owned/validated by its original profile.

The generic@2 semantic legend module has no cross-profile endpoints: each contains relation involving its legend/keys has profile generic@2 and both endpoints owned by generic@2. View categoryRef/legendRef are cross-module references covered **only by this join**; they never widen the ArchiMate/BPMN/UML relation matrix. Applying generic@2 contains to a foreign-family entity is refused unless a separate admitted semantic join exists. No such semantic join is added here.

| Executable witness | Semantic input / resolved application | Required result |
| --- | --- | --- |
| P-GEN | generic@2 node n and container c; generic@2 legend l/key k; occurrence n uses card, categoryRef k; legend order [k] and matching binding | One family pin; no semantic attribute overlay; apply then validateView returns []; changing n's icon changes only presentationDigest. |
| P-AM | archimate@2 application-component a; generic@2 l/k; profileRefs [archimate@2,generic@2]; occurrence a uses card/categoryRef k | Two independent family contexts, same contractPin; matrix still governs a's relations. No name redeclaration or cross-profile contains. |
| P-BPMN | A′ task/subProcess occurrences in a generated DI view, with an optional generic@2 legend | Same contract after K9 view validation; DI and preserved extensions unchanged; presentation is a synthesis view, never a BPMN evaluator. |
| P-UML | uml@2 class c/package p, optional generic@2 l/k; class card/package container | Same contract; multiplicity/stereotype semantics validate before application; no card attribute in uml@2. |

Negative witnesses: omit generic@2 from P-AM profileRefs while retaining categoryRef k → dangling-reference at that view field; add name via a proposed semantic fragment stack → G0 attribute-redeclaration; a cross-profile contains with no semantic join → endpoint-without-join; two CategoryTokenBinding rows for one (legendRef,category) → typed view conflict, no output. Refusal objects are in Appendix C. A consumer cannot repair any witness with an extension.

### 3.3 Grammars and category resolution

Key = minLength 1, maxLength 40, pattern "^[a-z][a-z0-9-]*$", patternName key.
Token-name = minLength 1, maxLength 80, pattern "^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$", patternName token-name; in JSON the backslash is escaped. The token grammar includes every key, and additionally dotted paths. Dotted tokens are not keys; a single-segment key satisfies both. Empty/uppercase/whitespace/colour literals refuse. These are shape checks; a well-formed unknown icon validates the view and produces card-icon-unknown/zone-icon-unknown when drawn.

Category values and category descriptions remain semantic. categoryTokens is a view map, whose (legendRef,category) must name a category of that legend. categoryRef selects a semantic key. Without an explicit categoryRef, generic node/container.category may select a category by key; families with no such domain attribute use the explicit categoryRef. The join schema declares this projection, and the engine does not special-case family names.

Explicit categoryRef binds one key. Otherwise a single legend is the default; with several legends collect matching category keys. All matching view token bindings must agree for the unbound category to resolve; disagreement refuses tone-category-unknown/ambiguous; no match refuses undeclared. A legendRef of the wrong semantic type refuses bound-target-not-legend. Reordering record insertion, legends or binding rows never chooses a winner. categoryTokens does not enter contentDigest or P-RESULT of any semantic profile. Empty legends are valid and draw no key list.

### 3.4 Hierarchies, ports and refined types

Hierarchy declaration/parent-family/children-restricted/required-parent constraints are data. The shared cycle-safe resolver (§5.1) determines inherited container capability and role family membership for @2 profiles. No hierarchy id, family name or scene literal occurs in executor branches.

Each tree child has at most one parent per hierarchy; hierarchy-multiple-parents/hierarchy-cycle retain their existing codes. A declared DAG may have several parents and remains acyclic. No profile depth cap smaller than its limits is introduced; traversals are iterative or explicitly bounded. Semantic containment and visual grouping are distinct. A child may be drawn without a drawing of its semantic parent. N drawings of one parent fold independently.

Ports retain semantic owner/direction/name/attributes; side/order/anchor belong to port occurrences. Binary links, visible self-links and 3–8-member associations conserve every endpoint and relation identity. Aggregation is only binary and style-compatible (§4.5). ArchiMate/UML have no semantic port in these completions.

### 3.5 Relation presentation

A labelled relation's label is semantic authored content under the family's bound. Drawing style is RelationOccurrence.strokeStyle, default solid. No label parsing infers a dash or arrowhead. A projection copies a source occurrence's strokeStyle iff present and with identical value.

Acceptance style inventories: S2-asbuilt 7 dashed/37 solid, S1-conversational 10/14, S3-agentfactory 3/33, fixture S2-target 0/54, A5 0/31. The oracle lists dashed relation ids (§8.7). Multiple drawings of one relation may choose different styles and summaries must disambiguate those drawings (§4.5).

### 3.6 Legend data and order

Legend name/description and key name/category/description live in generic@2. The semantic constraints require keys under legends and category uniqueness within a legend. The view stores header slots/icon, categoryTokens and each legend occurrence's explicit ordered key list. Each direct key must occur exactly once in that list. This list is the order: renaming ids or permuting source records does not reorder it. It is not encoded by ordinal entity ids. An absent legend presentation uses stable semantic-key-id order and is recorded as an unauthored order in the oracle; acceptance conversions supply the explicit authored list.

The legacy semantic quantity order proposal is withdrawn: no display order is a graph attribute. The generic numeric schema mechanisms remain available (§5.8), including quantity-above-max, for actual domain quantities and UML numeric bounds.

### 3.7 Text and language

Authored text is preserved in its document/view language. Kicker case conversion is rendering under the host locale, never a stored rewrite. Profiles/executor contain no localisation or consumer label table. Generated “N links”/fold controls are host-localised; summaryLabels stores authored text. A translation is a new authored instance. Every textual migration records its source/target and retains the exact original.

### 3.8 Generic publication

generic@2 is a complete declaration as specified in §3.1, with an independent base lineage and explicit generic@1→generic@2 migration. Its effective resolved declaration has no container-name uniqueness, no container count constraint and link.label maxLength 200. Its self-validation/corpus/admission are implementation evidence, still unverified until their owners supply receipts (§11.2).

### 3.9 ArchiMate completion: archimate@2

archimate@1 remains the immutable skeleton. archimate@2 is a replacement base with migration §3.13.2, not an in-place change and not a narrowing G0 child. Catalogue and pairwise matrix are materialized from the versioned 3.2 data transcribed in Appendix A.1; no independent source/target lists are used to imply their Cartesian product.

The external transcription source is pinned to archimatetool/archi 9e6a014f9ef6a782a7dda604ef7b4d03d2c7819a, relationships.xml version="3.2". It supplies concrete machine-readable tuple data and its Ecore catalogue, not a new design. It is **not a claim of Open Group certification**. Engram must verify the source's normative suitability and licence closure before admission (unverified U-AM). The mandatory dependency is explicit rather than an arity-only “complete” assertion.

Each concrete catalogue type inherits abstract element (non-instantiable); layer/aspect are semantic constrained catalogue data derived from the pinned catalogue, not freely authored enum values that can contradict the chosen type. junction retains required operator and/or. grouping is container-capable; groupingContainment is a separate tree relation, not a matrix relationship and not a projection/fold carrier. Grouping and location have no invented layer. Viewpoints are typed entity-type/attribute filters, not semantic types.

Matrix rule:
{ kind: "relationship-matrix", matrixId: "archimate-3.2", sourceRole: "source", targetRole: "target", tuples: [{ relationType, sourceType, targetType }] }.
The complete tuple set is Appendix A.1's executable transcription from immutable XML/keys. Missing tuple means disallowed, not unknown or permissive. Resolve a refinement to the nearest concrete catalogue ancestor; test the **ordered pair** and exact relation id together. Each relation still has one source/target; independent role typing only checks target kind and existence, then the matrix checks the pair. A declaration's source/target list may be broad; the pair test must still run.

Access mode is an enum write/read/unspecified/read-write on access (§3.9.2); junction connections must be of the same relationship type along the junction, with both operator values tested. Association direction remains a semantic relation property under the source schema; drawing arrowheads belong to the view. influence.strength has the source's unbounded text schema, with no invented truncation bound; no “strongest relation” algorithm silently invents or derives assertions. Matrix data may admit derived relationship kinds, but the executor validates an authored tuple and does not synthesize it.

The XML's Relationship pseudo-concept is represented by the generic relation-target endpoint carrier specified in §3.9.1. It is retained in every full-matrix case, never dropped or reified as an entity. Appendix A.4 supplies the complete declaration recipe; U-AM-ENDPOINT is qualification of that defined shared schema/migration, not an unspecified carrier. Element-only witnesses cannot satisfy full-profile admission.

Required witnesses: every allowed tuple has a positive case; every absent relation for each ordered type pair has a negative case; reversed source/target pairs use their own cells; catalogue/refinement/cycle and junction/access cases have explicit verdicts. Example cells are reproduced in Appendix A.1 and their literal diagnostic is in Appendix C. Conformance is never inferred from the number eleven.


#### 3.9.1 Shared relation-target endpoint carrier

Source transcription: DS document.ts RelationEndpoint.target is EntityRef | PortRef; profile.ts EndpointTargetKind is "entity" | "port"; view.ts uses the existing OccurrenceRef and RelationOccurrence.relation. The pinned Ecore ArchimateRelationship.source/target refer to ArchimateConcept, which includes relationships. Appendix A.1 retains that source concept as @relation. The following is the required **generic schema extension of the same SemanticDocument/ViewDocument**, not another metamodel, a reified entity or an ArchiMate-only document shape:

~~~ts
type EndpointTargetKind = "entity" | "port" | "relation";
interface RelationEndpoint {
  readonly role: string;
  readonly target: EntityRef | PortRef | RelationRef;
}
interface RelationRoleDeclaration {
  readonly role: string;
  readonly cardinality: { readonly min:number; readonly max:number };
  readonly targets: readonly EndpointTargetKind[];
  readonly entityTypes?: readonly string[];
}
~~~

No new SemanticDocument top-level field, reference namespace, semantic target wrapper or catalog field is added. relation: references already exist. entityTypes restricts entity targets only; it neither coerces a relation into an entity nor implicitly permits it. A role must explicitly include "relation". Resolve a relation target by a single lookup in document.relations; verify its key/id/profile/type in its own admitted context. Never recursively resolve the target relation's endpoints to determine its kind. Forward references, self-references and cycles therefore terminate; they are allowed only if the profile's own matrix/constraints allow them. Cross-profile targets still need the G0 S-4 semantic join.

For matrix classification, an entity resolves to its nearest concrete catalogue ancestor, a relation to @relation, and a port is disallowed by the ArchiMate roles. Test exactly the same tuple array, including both the Relationship row and column. @relation is a matrix discriminator, never a registered entity type or a wildcard for all entity types. An unknown/dangling target is diagnosed before matrix checking, once at relations.<relationId>.endpoints[i].target. Existing endpoint-target-not-allowed and dangling-reference arms extend to seenKind/expectedKind="relation" with their exact native messages/details; no seenChain appears. Legacy @1 adapters retain their pinned two-kind execution and arrays.

RelationOccurrenceEndpoint.occurrence and sourceOccurrence can, under the new schema adapter, resolve in entityOccurrences, portOccurrences **or relationOccurrences**, with exactly one occurrence namespace/key match. In the last case the drawn semantic target is drawn.relation. The view provenance field semanticTarget is EntityRef | PortRef | RelationRef (§4.4.2). Role membership is checked with the native message/refs/details transcribed in C.4; no new endpoint field is necessary. Kind/existence/provenance use direct lookup; fold classification alone uses the bounded occurrence worklist of §4.4.1, never recursive semantic-target resolution. Multiple occurrences of the same target relation remain distinct drawings and the authored endpoint selects one explicitly. Semantic references never depend on view visibility.

This carrier includes the persisted fold provenance of §§4.4.1–4.4.4. A target relation occurrence that remains visible, including one whose own endpoints are projected, remains the attachment occurrence; it still draws the same RelationRef and requires no provenance on the attaching endpoint. If the target occurrence becomes internal to a folded container, its canonical representative is that visible collapsed container: the attaching endpoint stores occurrence = representative, semanticTarget = the original RelationRef, sourceOccurrence = the original relation occurrence. The target relation occurrence stays in relationOccurrences unchanged and is excluded from the scene as endpoint-hidden. The graph is unchanged; neither a relation entity nor a presentation field is introduced. Appendix B.7/C.6 supplies the worked ArchiMate fixture and diagnostics.

Layout/rendering is separately qualified in M2. For a still-visible relation target, an attachment uses the midpoint by arc length of that target occurrence's retained, finite, non-degenerate polyline, including waypoints, in view coordinates. Its target route is read once from the retained source view before any new routes are emitted; cyclic attachments do not recursively reroute one another. A missing/degenerate source route refuses that layout request and retains the source state; it cannot be fabricated as a semantic error or a corpus pass. For an internal target represented by a collapsed container, route to that container's anchor under §4.4.7; the hidden target's polyline is not used. A host suppression request without the canonical fold witness still refuses under C.4 relation-target-hidden. A valid fold with the defined representative does not emit that diagnostic.

**Migration witness:** register this extension only in the shared schema-2.0 migration/adapter already required by A′, with Engram/DS qualification under U-AM-ENDPOINT/U-KERNEL. Its endpoint step is identity on every pre-existing entity/port target and occurrence endpoint, including array order and absence/presence; the outer migration alone updates schemaVersion according to A′. There are no @1 relation targets to guess. Reject downgrade to 1.x while any relation target/attachment exists; otherwise restore the retained original. The independent family migration still maps every @1 element explicitly and changes profileRefs to archimate@2; it does not change a relation target into a fake element.

Use the pinned archimate-skeleton-document.json identities (§8.5): map entity:actor→business-actor, entity:process→business-process, entity:component→application-component, retaining entity:junction. The three source relation endpoints migrate byte for byte. In a separate explicit fixture edit, retain id relation:flow, set its type to association and endpoints to entity:component / relation:assignment. The application-component→@relation cell contains o, so this added assertion is accepted by the specified pair predicate. Reversing those endpoints uses @relation→application-component, independently permitted by its own o cell; changing the type to access is rejected. Mapping is a specification witness, not an executed migration receipt.

U-AM-ENDPOINT now concerns implementation, schema registration, migration/reload and routing receipts for this **defined** carrier; there is no remaining unspecified endpoint shape. Full archimate@2 declaration scope includes all 62 matrix concepts. No complete-profile admission/publication is asserted before those receipts and U-AM; a skeleton @2 is not published as a shortcut.

#### 3.9.2 Complete declaration recipe

Appendix A.4 gives the deterministic native declaration expansion from the 61 catalogue rows and full tuples, including generic junction-incidence checking and grouping containment. accessMode is optional enum write/read/unspecified/read-write: the pinned IAccessRelationship constants are 0/1/2/3 respectively, including the previously omitted unspecified case. This is an explicit native projection of accessType, not source-schema identity; imports record the exact conversion. Absence is retained, with no authored default synthesized. influence.strength is optional text with **no invented maxLength**, as in the pinned Ecore. association.directed is optional boolean; view arrowheads still derive through presentation data.

### 3.10 BPMN generated family, without regression

A′ is transcribed unchanged: descriptors from bpmn-moddle 10.3.1 generate bpmn@2, bpmndi@1, dc@1, di@1, bioc@1, color@1, sem@1; semantics.json digest c274f46f773b5f557f7995fa70aae9d8a50384aedfcc6c3a5d166563a17a7c97. K1–K13 are shared mechanisms, including K2 references, K4 owner composition, K6 struct, K8 overlays, K9 DI and K11 preserved source.

F1 moddle JSON is the pivot. XML stays at test/exchange edges. Unknown namespace content, xmlns and xsi are preserved; no semantic/presentation conversion drops them. One ViewDocument per BPMNDiagram with its DI plane/root and shape/edge forms, labels/styles/overlays; DI waypoints stay verbatim. No generated artifact is hand-maintained here. A′ owns automatic-generation/bijection gates and separately determines its schema-major transition. bpmn@1 stays registered/readable and is never silently migrated or removed by this specification.

Rendering/editing parity remains owned by SPEC_RE_BPMN_JS_PARITY and bpmn-canvas until its own gates pass. profile-c14n/2 and 610c0353 parity are separate invariants (§6). Generated BPMN admission requires all parity-library receipts and bijection evidence (§7.4), without a skeleton exemption.

### 3.11 UML class-diagram completion: uml@2

uml@1 remains the immutable skeleton. uml@2 is a replacement base with explicit migration §3.13.2. Activity/sequence/state are not added by this class-diagram lot. Classifier names, member names, visibility and multiplicity are domain content; drawing is diagram-presentation@1.

| Declaration | Completed semantic content |
| --- | --- |
| class | required name≤200; abstract boolean; optional visibility enum public/protected/private/package; isStatic boolean; stereotypes ordered collection of typed entity references to stereotype, max 8. |
| interface | required name≤200; visibility; stereotypes on the same terms. |
| package | required name≤200; container true; stereotypes on the same terms. |
| property | required name≤200; typeName≤200 retained; multiplicity struct of declared multiplicity type; visibility; isDerived/isStatic booleans; stereotypes as above. |
| operation | required name≤200; returnTypeName≤200 retained; visibility; isStatic; stereotypes as above. |
| stereotype | required name≤60; extends: bounded collection of enum(class,interface,package,property,operation), 1..5, no duplicates. Its references are type-checked by K2; application is refused when the target's effective kind is outside extends. |
| association | source/target each 1..1 classifier entity; optional sourceMultiplicity/targetMultiplicity structs; aggregation enum none/shared/composite on each end; at most one composite end. |
| generalization | source/target classifier (class/interface), 1..1; acyclic generalization. |
| dependency | source/target declared entity, 1..1; no fabricated subtype or cardinality semantics. |
| packageContainment | parent package family, child declared entity, tree uml-package-containment. |

The attribute type **multiplicity** is a K6 structured-value type, never an entity occurrence, string bag or PlantUML source:
{ lower: quantity(unit="unit",integer=true,min=0),
  upper: quantity(unit="unit",integer=true,min=-1),
  isOrdered?: boolean, isUnique?: boolean }.
upper = -1 is the single native UnlimitedNatural unbounded sentinel; otherwise upper≥lower. Both fields declare max 9007199254740991. A lower or finite upper must be a safe non-negative integer; -1 is allowed only for upper. The complete stored witness is:
{ kind:"struct", type:"multiplicity", fields:{
  lower:{kind:"quantity",value:0,unit:"unit"},
  upper:{kind:"quantity",value:-1,unit:"unit"} } }.
This uses the exact K6 value envelope rather than inventing a second structured-value shape. Value schemas permit the upper sentinel declaratively; the generic bound-pair constraint implements upper==-1 || lower<=upper with literal failure in Appendix C. Empty struct, lower=-1, upper=-2, fractional values, unknown fields, non-quantity kinds and lower>finite-upper refuse.

Migration recognises @1 strings n, n..m, n..*, and * (0..*) only, without trimming/guessing. It records original text plus the parsed target fields and keeps originalCanonical. A syntactically valid reversed range refuses. A stereotype string requires an explicit mapping to a declared stereotype entity; no new semantic assertion is guessed. The profile/stereotype mechanism means these declared class-diagram application rules; no claim of complete UML metamodel coverage is made.

K1/K2/K6 and their qualified schema are hard prerequisites of this profile, not prose deferred behind a complete admission flag. Appendix A.2 fixes valid/rejected values and the generic scalar/struct diagnostics. The profile's admission stays unverified until these mechanisms and the class-diagram corpus have receipts.


#### 3.11.1 Closed declaration and qualification boundary

Appendix A.4 fixes every attribute schema, role, hierarchy, constraint and declaration order for this class-diagram subset. Optional booleans/enums/structs remain absent when unauthored; there are no hidden defaults. sourceAggregation/targetAggregation are the exact association-end field names. Their default interpretation is none without materializing a value; at most one may be composite. A duplicate stereotype.extends entry refuses collection-unique rather than silently deduplicating. Generalization has its own acyclic DAG hierarchy (target=parent, source=child); package containment retains its separate tree.

The named multiplicity declaration is a kind-neutral, identity-abstract schema in the common type registry: its fields are required lower/upper quantities and optional isOrdered/isUnique booleans. Entity records cannot instantiate it (abstract-instantiated). A K6 struct has no entity identity; selecting this declaration validates its closed fields and bound-pair, and does not create an abstract Entity. This is the explicit schema interpretation required of the shared K6 adapter; it is included in the native entityTypes declaration bytes and thus in the unchanged G0 P-CONTENT-DIAGRAM projection. No ignored top-level structTypes field, free object, entity occurrence or out-of-band consumer type registry is introduced.

The same resolver checks every property and association end. Required struct fields use attribute-required-missing at .fields.lower/.fields.upper; non-quantity kinds use attribute-type-mismatch; required unit is unit. Each field's schema is fully present in Appendix A.4, with targetTypes=["multiplicity"] on all three struct slots. The generic bound-pair check applies after field validation, and reference-application after K2 resolution, with no duplicate secondary diagnostic for a missing/wrong-kind reference. Reference target/applicability uses K1 ancestry; stereotype.extends contains the five declared concrete base kinds.

The pinned UML fixture (§8.5) supplies a concrete migration witness: property entity:order-total "1"→lower=1/upper=1; relation:order-customer source "0..*"→0/-1 and target "1"→1/1; original typed strings, ids, generalization and package endpoints survive in originalCanonical/operations. Its class stereotype text "entity" requires the caller's explicit stereotype mapping and an existing declared stereotype with extends including class. Omission returns unmapped-stereotype and the exact source; a supplied valid mapping permits the stated conversion. No source string is transformed into a guessed business stereotype entity. All source-profile references are rewritten only in the committed whole-state migration.

The declaration recipe and scalar/struct/application oracles close the specification content; qualified K1/K2/K6 schema-2.0 registration, native adapter acceptance, the supplied mapping's actual identities, corpus execution and production pins remain unverified U-KERNEL/U-ID/U-DIAG/U-QUAL under their named owners. No complete UML-wide conformance, package release or executed admission is implied.

### 3.12 Canonicalization

profile-c14n/2 remains exactly bpmn-canvas canonical.ts at SHA-256 287d8cb87beb7384fc89a8d6141681010dcba50ee895aaadc3b31345541191ba. It is RFC 8785 profile-value identity, with rawDigest/canonicalDigest/stableId under the existing mechanism. No catalog re-canonicalizes it and no DS executor reimplements it.

The sealed c14n oracle is profile-parity-corpus/1/cases/jcs-*.json and identity-stable-id.json (§6). W01–W12 and parity-corpus/canonical-vectors.json belong to their existing F1/workbench comparators and are not substituted for that oracle.

### 3.13 Explicit migrations and supersession

#### 3.13.1 generic@1 → generic@2

A migration is an explicit versioned transaction over DiagramState (semantic document plus **all retained views**) and a pinned presentation contract where presentation is moved. It retains originalCanonical and its SHA-256, from/to pins, ordered operations and unmigrated items { path, reason }. It never returns a valid-target claim on a partial candidate. If any blocking item exists, return the exact original state and report, no candidate and no writes.

Preflight resolves source refinements, validates all source inputs, plans every rewrite and every view-slot bound, detects reserved-name collisions, and validates the complete proposed target before committing any rewrite. Operations are ordered: profileRefs, typeDefinitions by UTF-16 id, entities, relations, ports by id, then views/occurrences by id. Record insertion does not change operation/report bytes.

1. Require generic@1 exactly once and generic@2 absent. Replace that reference in place, preserving unrelated refs/order. Rewrite every matching .profile on typeDefinitions/entities/relations/ports, not just entities. Post-scan leaves no source profile on migrated records.
2. Resolve each source refinement's full chain. Compatible overlapping **semantic** attributes promote; genuinely additional domain attributes remain in a residual refinement with their values/schema, dependents rebased to their nearest retained ancestor. Remove a refinement only after all dependent records/values have valid destinations.
3. A different-kind overlap **or any same-kind incompatible bound** is a blocking migration outcome, reason type-definition-conflict, detail incompatible-attribute-schema. The entire migration refuses before rewrites. There is no shadowing, truncation or promised successful retained redeclaration. Witness: source kicker≤200 with 100 characters cannot move into view kicker≤80; body≤600 with 500 characters cannot move into body≤400. Both retain the exact original and have no target candidate.
4. Presentation-only source refinement/extension slots move into typed view presentation for each original occurrence, retaining every authored string; this conversion requires the corresponding retained views and contract pin. No source occurrence/view available → blocking missing-presentation-destination. Body/detail/footer/kicker/icon are not promoted into semantic @2 attributes. Domain tint/category meaning becomes semantic category/key data; its colour mapping moves to categoryTokens. A distinct conflicting target text/style refuses atomically.
5. Remove semantic container.collapsed and report absent/false/true distinctly. Seed a new view fold only if explicitly requested by the caller; no semantic revision bump is caused by fold state. Never invent a semantic collapsed field.
6. Preserve relation/port ids, endpoints, labels/general attributes; record link label bound 120→200 once, never rewrite labels. There is no @1 native stroke slot to synthesize. Existing view/source dash metadata maps per occurrence; absent remains absent.
7. Preserve foreign resources/extensions. A separately authorised standard-slot conversion (A5 §8.4) consumes only the named slot extension after every field has a native destination. Generic migration alone never erases unrelated preserved content.
8. Validate the full target semantic document and every view, including new references. Only [] permits outcome ok. Recovery restores originalCanonical byte for byte; it is not a reverse migrator guess.

#### 3.13.2 archimate@1 → archimate@2; uml@1 → uml@2

These are **required new-major migrations**, never same-id re-pin operations. The common transaction/preflight/profile-bearing-record/residual-refinement/atomic-refusal/recovery contract above applies.

ArchiMate input supplies a closed mapping { entityTypes: Record<EntityRef, CatalogueTypeId> }. Every @1 element requires one explicit concrete catalogue assignment; layer/aspect alone is not enough to infer it. grouping/junction keep their meanings and ids, with explicit mappings where the new source id spelling differs. Verify each authored relation against its exact ordered matrix tuple; a forbidden relation is a blocking relationship-matrix failure. No silent relation deletion, strongest-relation substitution or invented catalogue assertion is allowed. An unmapped @1 element reports missing-type-mapping; the original stays @1.

UML input supplies { stereotypes: Record<string,EntityRef> }. Rewrite all profile-bearing records. Parse @1 property multiplicity and association end multiplicities by §3.11; unchanged scalar/name/general attributes survive. Resolve each original stereotype text through the supplied mapping to an existing declared stereotype and validate its application; unknown/unmapped text blocks, not silently removed. Store each original notation and its exact typed conversion in operations, with original state recovery. An invalid range or unresolved stereotype leaves the original @1 state unchanged.

Coexistence/reload witnesses: register all six @1/@2 ids; validate each retained source using @1; migrate explicitly and validate @2; serialize/reload both; resolve each by its own ProfileId and pin; verify no duplicate-id registry failure, no adapter fallback and no source bytes changed.

#### 3.13.3 Collisions

A target-reserved type id or semantic/view attribute collision is preflighted before changes. A genuinely additional consumer attribute survives residually. Any unresolvable name/kind/bound/target-value collision yields a deterministic unmigrated row and whole-state refusal. There is no mixed-major partial output. All strings consumed from A5 have the precise destinations of §8.4.

#### 3.13.4 Supersession is not composition ancestry

G0 S-2 forbids removal/widening/redeclaration in a stack child. Each replacement @2 is therefore a base with lineage { parents: [], mappings: [], migrations: [its explicit migration reference] }, stack [its own pin], no predecessor as a composition layer. A predecessor may become superseded with supersededBy plus migrationRef, while its bytes and registry readability remain immutable.

ArchiMate/UML @1 completeness stays skeleton forever; supersession lifecycle metadata does not turn it complete. The fragment is a separate contract bound in the catalog envelope and view, not a semantic parent. Resolve witnesses assert generic@2's removed constraints do not return through ancestry and that archimate@2/uml@2 have the distinct ids throughout.

## 4. View model: folds, folded projections, measurement and layout hints

The view remains the M2 `ViewDocument`: occurrences of entities, relations and ports, visual groups, filters and persistable presentation state, pointing at exactly one `SemanticDocument` and never ahead of its revision. This section adds the fold contract, the folded-edge projection that stays valid, the measurement input that layout consumes, and the generic layout hints that replace consumer packing. Transient state (hover, in-flight drag, marquee) stays out of the view, as today. Every rule is family-neutral over declared synthesis occurrences; native DI/view schemas remain authoritative when no synthesis form is selected.

### 4.1 Fold state is view data, bound to occurrences

#### 4.1.1 Binding rule

- The fold state of a container drawing in a view is the `collapsed` flag of exactly one `VisualGroup` of that view, bound to an **entity occurrence**, not to an entity. `VisualGroup` gains one optional field (view-shape inventory, §3.13):
  ```ts
  interface VisualGroup {
    readonly id: string;
    readonly label?: string;
    readonly collapsed?: boolean;
    /** The entity occurrence this group folds. Present on every fold group in a completed-profile view. */
    readonly occurrence?: OccurrenceRef;
  }
  ```
  For each entity occurrence in the view whose effective type (shared resolver, §5.1) is in the container family (`container: true` on its base chain), the view MAY hold one group whose `occurrence` equals that occurrence's id and whose `collapsed` is the fold state of **that drawing** in that view. The group id is `grp.<len>.<localId>` where `<localId>` is the local id of the **occurrence** (not the entity) and `<len>` is its length — the id form already used by the measured HRPN view, re-anchored from entity to occurrence. Group membership follows the existing derived rule: an entity occurrence belongs to the group named by its `EntityOccurrence.group`, and that group is the fold group of its hierarchy parent's occurrence in the same view. Membership itself is never duplicated as a member list.
- **N occurrences (M2 §3.4).** The same container entity MAY have several occurrences in one view; each occurrence has its own fold group and may fold independently. Two views of one document fold independently, as before. A container occurrence with no fold group is expanded. A fold group whose `occurrence` names no entity occurrence of the view, or an occurrence whose effective type is outside the container family, reports `dangling-reference` / `occurrence-endpoint-mismatch` under the view validation of §5.6 (the group is view data and is validated as such).
- Folding or unfolding is a view change. It is expressed by replacing the `ViewDocument` (§4.1.3), or by the host re-running layout with a new collapse input (§4.6) and replacing the view wholesale. It never mutates the `SemanticDocument`, never bumps `document.revision`, and never travels through an `update-entity-attributes` command. No completed profile's semantic `collapsed` attribute is a fold carrier (§3.2.2).
- The rendering consequence is fixed: expanded, a container occurrence draws its header plus its visible children; collapsed, the same occurrence draws exactly one atomic card (`460 × 200`, §4.6) carrying the resolved typed presentation text (kicker/title/subtitle/footer), icon and category token, plus the fold control. No child occurrence of a collapsed container occurrence is a scene item (§4.4, step 1).

#### 4.1.2 Why occurrence binding is required

With entity binding, two drawings of one container cannot fold differently, and the projection of §4.4 cannot say **which** drawing an edge was retargeted from when the same entity is drawn twice. Occurrence binding removes both gaps without new machinery: the fold group, the hidden-by-fold test and the representative are all computed per occurrence, and §4.4.2 preserves the original endpoint occurrence so unfolding restores the exact drawing.

#### 4.1.3 Revision meaning: fold-only changes keep the semantic revision

`decision` — `ViewDocument.revision` keeps its current meaning exactly: **the document revision this view was last changed at; never ahead of the document** (`packages/diagram-core/src/view.ts`, refused as `revision-divergence` when ahead). A fold-only change therefore **retains** that value:

- Folding, unfolding, expand-all, collapse-all, changing an occurrence strokeStyle, editing a `summaryLabels` entry and re-projecting (§4.4) all produce a replacement view whose `revision` equals the source view's `revision` (which equals the document revision the view was built against). No fold operation increments `ViewDocument.revision`, and no fold operation requires a semantic command. The HRPN witness is normative: the supplied view at revision 1 folded in any way stays at revision 1 and validates; a fold that produced revision 2 against a document at revision 1 would refuse `revision-divergence` and is a defect.
- View concurrency is **not** carried by `revision`. A host that needs optimistic concurrency over views uses a separate host revision: the canonical content hash of the view (the executor's canonical serialisation, §7.3 artifact digest discipline) or a host-minted view generation counter stored outside the `ViewDocument`. This specification gives that value no field name inside the view, because two hosts mint it differently and neither meaning is the document revision. Tests assert the observable contract: repeated fold/unfold at document revision 0 (and at revision 1 on the HRPN view) validates at every step with `view.revision === document.revision` throughout, and the semantic document bytes are unchanged by every fold (§5.6, §5.7).
- A semantic change (any command that bumps `document.revision`) does not automatically rebase existing views: a view whose `revision` is behind the document revision is stale in the M2 sense and is rebuilt or re-projected by its host; `validateView` continues to refuse only the ahead case, as today.

### 4.2 Default folds

- Default folds are **input data**, not component defaults and not semantic data. A host supplies `defaultFolds: readonly OccurrenceRef[]` (container **occurrences** folded in the initial view; a host building a fresh view from a document MAY instead supply entity refs, which the view builder resolves to the occurrences it creates, recording the resolved occurrence ids in the produced view) when it first builds or lays out a view. The layout or view builder stamps exactly those occurrences' fold groups `collapsed: true` in the produced `ViewDocument`; every other container group is `collapsed: false` or absent-means-expanded by the rule that an undeclared group is expanded.
- A stored `ViewDocument` therefore fully determines the displayed folds without consulting any default list. Reopening a stored view never re-applies defaults. Changing defaults after a view exists has no effect until a new view is produced.
- Expand-all and collapse-all are host operations over the same data: they produce a new view in which every container fold group is expanded, respectively every container fold group whose occurrence has at least one child occurrence is collapsed. They mint no semantic change and are bounded by the interaction budget of §10.

### 4.3 Scoped uniqueness execution

Scoped uniqueness is executed as §5.3 specifies. This section states only the view-visible consequence: no view rule depends on display-title uniqueness in any family. Two containers both titled « CI/CD », two ArchiMate elements with the same name, two BPMN tasks with the same name and two UML classes with the same name are all valid unless their family profile declares a scoped uniqueness over that attribute in that scope. Legend category uniqueness is semantic and scoped withinType: legend. Display order is the explicit ordered view key list (§3.6), never a semantic uniqueness rule.

### 4.4 Folded-edge projection that yields a valid `ViewDocument`

This section defines the only folded projection. A folded output that does not follow it is not a valid view, and the M1 gates assert `validateView(foldedView, document)` returns zero diagnostics on every folded acceptance scene. Two r1 defects are closed by construction: the representative is the **outermost visible** collapsed ancestor (never an invisible inner one), and the projection is **recomputed from a retained source view on every transition** (never mutated in place, so unfolding reverses it). Folded-only persistence without a retained source is not a valid mode (§4.4.2).

#### 4.4.1 Definitions (per occurrence)

For a given view, let `containsParentEntity(entity)` be the semantic hierarchy parent under the hierarchy named by the composed stack (at most one per hierarchy, §3.4), and let `parentOccurrence(occurrence)` be the entity occurrence of that parent entity that contains this occurrence in this view (resolved through `EntityOccurrence.group` → fold group → `VisualGroup.occurrence`; when a child has several parent drawings, the one whose fold group the child occurrence names). All definitions below are per occurrence, so N occurrences of one entity project independently. For BPMN DI views the same definitions run over the DI plane hierarchy; no BPMN name is tested by the mechanism.

- An entity occurrence is **hidden by fold** when any hierarchy ancestor **occurrence** of it (walking `parentOccurrence` upward) is folded (its fold group `collapsed: true`). A collapsed container occurrence's own drawing stays visible as a card; its child occurrences, at any depth, are hidden by fold. This matches the existing `group-collapsed` cascade: hidden occurrences are reported, never silently dropped.
- The **visible representative** of an entity occurrence `O` in a view is defined by walking the ancestor-occurrence chain upward from `O`:
  1. Collect every ancestor occurrence (including `O` itself when `O` is a container occurrence, for the question “where do edges to `O`'s children land”) whose fold group is collapsed, in order from innermost to outermost.
  2. If the collection is empty, the representative is `O` itself.
  3. Otherwise the representative is the **outermost** element of the collection — the collapsed ancestor closest to the root. By construction no ancestor above it is collapsed, so it is visible; every inner collapsed ancestor is hidden beneath it and is never selected. (The governance `collapseGovernanceScene` behaviour is the measured precedent: the representative is the collapsed ancestor that stays visible through the whole chain.)
  For a port occurrence, the representative is the visible representative of the port's owner occurrence, drawn through the representative's port occurrence bound to that representative when one exists in the view, otherwise through the representative occurrence itself (§4.4.2, port rule).
- A relation occurrence is **internal** to a collapsed container occurrence when **every** endpoint's visible representative is that same occurrence **and at least one endpoint was actually hidden by a fold** (a visible self-link whose endpoints already coincide without any fold is untouched, never internal). Internal relations draw nothing in the folded view. A relation with at least one endpoint hidden and not internal is **projected**; a relation with no endpoint hidden is **untouched**. For an n-ary `association` the test runs over the complete representative set: internal iff the set has one element and a fold was involved; projected iff the set has more than one element and at least one endpoint was hidden; untouched otherwise. Each endpoint projects independently.

For relation-target endpoints the preceding definitions have this finite extension. Begin with entity/port representatives and an empty map of internal relation occurrences to collapsed container occurrences. In each simultaneous round, an original endpoint naming a relation occurrence uses its mapped container if already classified internal, otherwise that relation occurrence itself; other endpoints use their entity/port representatives. Add an unclassified relation occurrence only when its complete representative set is one **collapsed container entity occurrence** and at least one endpoint is fold-dependent (an entity/port hidden by fold, or an already internal relation occurrence). Repeat until no addition; there are at most as many adding rounds as retained relation occurrences. Classification is independent of record order. A relation occurrence's representative is its mapped container if internal, otherwise itself, even if its own endpoints are projected. Relation-target cycles without a fold witness remain visible relation occurrences; the worklist never chooses an arbitrary container or loops through their semantic targets. An attaching relation is then classified/projected with exactly the same representative rule, allowing chains of internal relation targets to collapse in successive rounds.

The fold witness for an internal relation occurrence comprises **all** its endpoint representatives and their entity ancestor walks or earlier worklist witnesses, not a semantic parent of the relation. Each dependency was classified in an earlier round, so this witness is finite and ends at the same outermost visible collapsed container. It is derived view state, never a stored field. For validation of a persisted projection, reconstruct original endpoint occurrence references as sourceOccurrence when present, otherwise occurrence; retained internal records are unchanged. Run the same worklist on those references and the stored fold groups. This recovers the representative without a retained source view, scene, route or new graph field. Missing/invalid provenance is refused before it can serve as a witness.

#### 4.4.2 The projected occurrence (view data) — persisted-shape inventory

The persisted view gains the following optional fields, plus PresentationState.diagram of §3.2 (§3.13 inventory; `VIEW_DOCUMENT_FIELDS` gains exactly `summaryLabels` — a test asserts the view field set still refuses a stray `hover`-style key):

1. On `RelationOccurrenceEndpoint`: `semanticTarget?: EntityRef | PortRef | RelationRef`. Present **iff** the drawn `occurrence` does not itself draw the semantic endpoint target for that role. Its value is the semantic relation's endpoint target for that role, copied verbatim. A RelationRef is permitted only where the semantic role admits relation targets (§3.9.1). Absent means “the drawn occurrence draws the semantic target”, exactly as today.
2. On `RelationOccurrenceEndpoint`: `sourceOccurrence?: OccurrenceRef`. Present **iff** `semanticTarget` is present. Its value is the **original endpoint occurrence** — the occurrence that drew the semantic target in the source view. This is the endpoint-occurrence provenance the reviews require: the projection never loses which drawing it came from, including when the same entity has several occurrences (the original is identified by occurrence id, not by entity id). On an unprojected endpoint both fields are absent.
3. On `RelationOccurrence`: `strokeStyle?: "solid" | "dashed"` — the view style of §3.5. Absent means solid. Projection **preserves override presence exactly**: an untouched occurrence carries the source field or its absence byte-for-byte; a projected occurrence carries the source override when the source carried one and carries no field when the source carried none (the effective style is derived at render time, never materialised). §4.4.3 step 2 states the rule; the empty-collapse byte-identity witness of §5.6 enforces it.
4. On `RelationOccurrence`: no aggregation field. Aggregation is derived, never stored (§4.5).
5. On `VisualGroup`: `occurrence?: OccurrenceRef` — the fold binding of §4.1.1.
6. On `ViewDocument`: `summaryLabels?: Readonly<Record<string, SummaryDefinition>>` — authored summary **definitions** (§4.5.1), distinct from their active projection (§4.5.2). Absent means no authored labels; derived count labels are computed at render time and never stored.

```ts
interface RelationOccurrenceEndpoint {
  readonly role: string;
  readonly occurrence: OccurrenceRef;
  readonly semanticTarget?: EntityRef | PortRef | RelationRef;
  readonly sourceOccurrence?: OccurrenceRef;
}
interface RelationOccurrence {
  readonly id: OccurrenceRef;
  readonly relation: RelationRef;
  readonly endpoints: readonly RelationOccurrenceEndpoint[];
  readonly waypoints?: readonly Point[];
  readonly strokeStyle?: "solid" | "dashed";
}
```

**Retained source view (normative).** A folded view is always derived from a stated source view by the pure projection of §4.4.3. The host **retains the source (least-folded) view** for as long as it offers fold transitions over that document view. Storing only folded views is not a supported persistence mode: endpoint provenance alone cannot recover an originally absent `strokeStyle` override, a discarded summary activation, or source geometry, so no reconstruction operation is specified and none is claimed. A folded view read back from storage without its source validates as a view (§4.4.4) and renders, but it is not a projection input; the host rebuilds a source view (unfolded layout) before the next fold transition. This replaces the r2 alternative that permitted folded-only storage.

#### 4.4.3 Projection procedure: recomputed from the retained source on every transition, with folded geometry

Projection is a **pure function**; it is never an in-place mutation of a stored view, and it is re-run from the retained source on every fold transition. Fold projection alone does not produce displayed geometry: the displayed folded view is the composition **fold → measure → place → route** (§4.6.3), in which projection supplies the folded occurrence set and endpoints, measurement supplies the collapsed footprints, placement assigns the `460 × 200` collapsed boxes, and routing draws between representative anchors. Source geometry is retained on hidden occurrence records for restoration and is never emitted as the folded box.

```
projectView(document, sourceView, collapsedOccurrenceIds) -> ViewDocument   // endpoints + groups only
layoutFolded(document, sourceView, collapsedOccurrenceIds, hints?) -> ViewDocument  // projectView + measure/place/route
```

- **Inputs.** `document`: the `SemanticDocument` (unchanged). `sourceView`: the retained view of that document in which **no endpoint is projected for fold reasons** — every relation endpoint either draws its semantic target or is an authored drawing with no `semanticTarget`. Callers MUST NOT pass an already-projected view as `sourceView`; the function refuses (diagnostic `occurrence-endpoint-mismatch`, detail `projection-source-projected`) if any input endpoint already carries `semanticTarget`. This is the rule that makes unfolding exact: a fold change is always `projectView(document, sourceView, newCollapsedSet)`, never “patch the previous projection”.
- **Step 1 — hidden set.** Compute hidden-by-fold entity/port occurrences and the complete internal-relation worklist (§4.4.1) from `collapsedOccurrenceIds` (the set of container occurrences whose fold groups are collapsed in the output), before emitting any projected endpoints. Hidden entity occurrences stay in the output `ViewDocument` records (their geometry is the source geometry, retained so unfolding restores it byte-for-byte) and are excluded from the scene as `group-collapsed`, as today. Internal relation occurrences also stay, unchanged. Do not delete occurrences to fold.
- **Step 2 — per relation occurrence.** Let the semantic relation's endpoints be known from `document`. For each relation occurrence in `sourceView`:
  - Compute each endpoint's visible representative (§4.4.1) from the endpoint's **original** drawn occurrence (`endpoint.occurrence` in the source view). Every endpoint is handled independently, including each `member` of an n-ary association.
  - If the relation is internal (§4.4.1: complete representative set of one, with a fold involved), copy the occurrence record unchanged (original endpoints, no provenance fields, override presence unchanged) and let the scene exclude it as `endpoint-hidden` with its cause reported. It draws nothing.
  - Else, for each endpoint whose original occurrence is hidden by fold, including a relation occurrence classified internal: set the output endpoint's `occurrence` to the representative occurrence (for a port endpoint, the representative's port occurrence when one exists in the view, otherwise the representative's entity occurrence; for an internal relation endpoint, its mapped container entity occurrence), set `semanticTarget` to the semantic endpoint target for that role, and set `sourceOccurrence` to the original `endpoint.occurrence`. In the relation arm these are respectively the original RelationRef and relation occurrence id. Endpoints that are not hidden are copied unchanged and carry neither provenance field, including attachments to a still-visible projected relation occurrence.
  - Copy `waypoints` unchanged on the retained record. Copy the `strokeStyle` field **iff** the source occurrence carried it, with the same value; never add the field and never remove it. The effective style of a projected occurrence is derived at render time (occurrence strokeStyle if present, else solid) and is not stored.
- **Step 3 — groups, filters, summaries, geometry hand-off.** Stamp fold groups for exactly `collapsedOccurrenceIds`; copy every filter unchanged (filters and folds combine, §4.4.6); carry `summaryLabels` **definitions** through unchanged (§4.5.1 — definitions are never dropped by projection; activation is derived per folded state, §4.5.2). Leave every other occurrence and presentation value unchanged, except geometry: entity occurrence geometry in the output of `layoutFolded` is the placed folded geometry (collapsed occurrences at `460 × 200`, expanded occurrences recomputed over visible children), while `projectView` alone leaves geometry as the source geometry and is therefore an intermediate, never a displayed view. The output keeps the source view's `viewId` only when the host replaces that view; a folded derivative that coexists with its source uses a new `viewId`. The output `revision` equals the source `revision` (§4.1.3).
- **Restoration property (normative).** For any collapsed sets `A` and `B`, `projectView(document, sourceView, A)` followed by discarding the result and computing `projectView(document, sourceView, B)` is the only transition. In particular, `projectView(document, sourceView, ∅)` returns a view whose relation occurrences are **byte-identical** to the source view's (canonical serialisation, including `strokeStyle` presence and `summaryLabels` definitions), and repeated fold/unfold cycles `A → ∅ → A → ∅` produce identical bytes at each repetition. No `semanticTarget` or representative endpoint survives into a view whose collapsed set does not hide that endpoint, because the projection is recomputed, not patched. The r1 defect — expanding a previously projected view leaving `semanticTarget` and the ancestor endpoint intact, then failing `projection-not-folded` — cannot occur under this procedure, and §5.6 fixtures assert the cycle explicitly.

#### 4.4.4 Validation of a projected endpoint

`validateView` accepts a projected endpoint **iff** all of the following hold; otherwise it reports the stated diagnostic. The unprojected rule is unchanged: without `semanticTarget`, the drawn occurrence must draw exactly a semantic endpoint target for its role, else `occurrence-endpoint-mismatch`.

- `semanticTarget` equals one of the semantic relation's endpoint targets for the endpoint's role (the same set the current check uses). Otherwise `occurrence-endpoint-mismatch`.
- `sourceOccurrence` is present, names exactly one occurrence of this view, and that occurrence draws `semanticTarget`: its entity, port or relation field equals the nominal EntityRef, PortRef or RelationRef respectively. Resolve the appropriate occurrence map directly; a relation's endpoint entities are never substituted for its RelationRef. Otherwise `occurrence-endpoint-mismatch` with detail `provenance-missing` (absent) or `provenance-mismatch` (names a different target).
- The drawn (`occurrence`) occurrence exists in the view and is not itself hidden by fold. Otherwise `dangling-reference` (missing) or `occurrence-endpoint-mismatch` with detail `representative-hidden`. Under §4.4.1 the representative is visible by construction, so `representative-hidden` witnesses a hand-written or stale projection, never a correct one.
- For an entity source, walking hierarchy parent **occurrences** from `sourceOccurrence` up to the drawn occurrence passes only through occurrences hidden by fold; the drawn occurrence is collapsed and outermost. For a port source, start at its owner occurrence and apply the counterpart rule of §4.4.6. For a relation source, use the finite all-endpoint fold witness of §4.4.1: the source relation occurrence must be classified internal and the drawn occurrence must equal its mapped container. There is no fabricated semantic containment parent for a relation. A missing fold witness or an unrelated representative refuses `occurrence-endpoint-mismatch`/`projection-not-folded`; choosing an inner folded container when the witness reaches a higher folded container refuses `projection-not-outermost`. Thus a relation with projected but still-visible endpoints cannot be replaced by a container merely because one endpoint lies inside it. The nested entity case and every branch of a relation witness select the outermost visible representative.
- For every changed drawing, including a RelationRef target, the representative entity has container capability (for a counterpart port, its owner entity has that capability). Otherwise `occurrence-endpoint-mismatch` with detail `representative-not-container`. This rule applies to the **fold representative**, not the semantic target's kind: a source relation occurrence has a relation field, while its valid collapsed representative is a container entity occurrence. A still-visible relation target uses its own relation occurrence with neither provenance field and is checked by the unprojected rule, without a container requirement.

These checks make the folded view self-describing: a validator needs only the document, the view and the hierarchy tree — no layout output, no scene and no fold list. Appendix B works the entity examples, the nested form, a three-member association spanning two collapsed branches and the ArchiMate relation-to-relation fold with RelationRef provenance.

#### 4.4.5 Aggregation is derived, never stored — with authored labels as view data

When several semantic relations project onto the same visible representatives, each keeps its own `RelationOccurrence` with its own business id (§3.5). A renderer MAY group projected occurrences into one drawn stroke only under the compatibility rule of §4.5.3; that grouping is computed from the view at render time, is recomputed on every fold change, and is never persisted as a relation, an occurrence or an extension. The constituent relation ids of a drawn aggregate are exactly the relation ids of the grouped occurrences — grouping never mints, merges or drops a business id.

What a renderer draws as the aggregate's label is governed by §4.5: an active authored summary for that aggregate wins; otherwise the renderer MAY draw a count label whose text is host-localised (§3.7). The count is derived; the authored label is stored view data. Both preserve the constituent ids, and export (§10 roadmap) serialises the authored label with its constituent ids so a folded overview round-trips.

#### 4.4.6 Filters combined with folds; ports

- Filters and folds are independent exclusions with distinct reasons. A filter that hides an endpoint excludes its relation occurrence as `endpoint-hidden` (filter cause), independently of fold exclusions; the two reasons stay distinct so a host can tell a fold from a filter. Projection runs **after** filter evaluation is known to the host only in this sense: §4.4.3 projects on fold visibility; a relation occurrence already excluded by a filter is still projected by the same rules (its endpoints' representatives are computed identically), so removing the filter later never requires re-projection logic — the scene simply stops excluding it. §5.6 fixtures assert simultaneous filter+fold states: an endpoint hidden by both produces one exclusion with the fold reason taking precedence in the record and the filter cause retained in the exclusion's `cause` field, and clearing either one alone restores the correct drawing without touching the other.
- Ports: a port endpoint hidden by fold projects to the representative's port occurrence when the representative occurrence has a port occurrence for the same semantic port's counterpart (same `PortRef` drawn on the representative is impossible — ports belong to their owner — so the rule is: the port occurrence whose `ownerOccurrence` is the representative occurrence and whose `port` is a port of the representative entity with the same direction, when exactly one exists; otherwise the representative's entity occurrence). The chosen drawing is recorded identically (`occurrence` = chosen occurrence, `semanticTarget` = original port ref, `sourceOccurrence` = original port occurrence), so port folds validate by §4.4.4 with the port arm of the walk. A port with no counterpart on the representative still projects (to the entity occurrence) and still restores, because provenance names the original port occurrence.

#### 4.4.7 Scene consequence

The scene builder keeps its conservation rule. In a folded view: hidden occurrences are exclusions (`group-collapsed`), internal relation occurrences are exclusions (`endpoint-hidden`), projected relation occurrences are edge items whose path runs representative-anchor to representative-anchor (persisted waypoints of the source occurrence, when still inside the visible region, are retained as route hints on the retained record and ignored for the projected segment outside it — the router owns the final route). No occurrence is silently dropped and no edge disappears without a reported exclusion.

### 4.5 Authored aggregate labels for collapsed overviews: definitions and active projection

The #711 all-collapsed overview draws **authored** summary labels on its aggregate edges (the kit's `summaryLabels`), not only counts. A count-only rule loses that content while counts and semantic validity still pass, so the authored input is model data (view data, because it labels a folded drawing). Definitions validate in a retained source view; activation and uniqueness are resolved after occurrence projection.

#### 4.5.1 Persistent definitions and occurrence scope

~~~ts
interface SummaryDefinition {
  readonly id: string;
  readonly sourceOccurrence: OccurrenceRef;
  readonly targetOccurrence: OccurrenceRef;
  readonly label: string;
  readonly relationIds: readonly RelationRef[]; // sorted, distinct, non-empty
  readonly strokeStyle?: "solid" | "dashed";    // absent selects solid only
  readonly relationOccurrences?: readonly OccurrenceRef[]; // sorted, distinct, optional disambiguation
}
~~~

Storage: ViewDocument.summaryLabels?, keyed by id. This is an authored **definition**, never persisted activation. Definitions survive projection byte for byte.

For definition D, source and target scopes are the occurrence subtrees rooted at D.sourceOccurrence/D.targetOccurrence through the view's fold groups, not all drawings of the underlying entity. Build candidates from binary source-view relation occurrences whose ordered endpoints lie in those two occurrence scopes and whose **effective occurrence strokeStyle equals D.strokeStyle ?? "solid"**. For an undirected binary relation normalize the representative pair by UTF-16 occurrence id; no normalization applies to a directed pair. Hyper-relations are excluded from binary summaries.

If relationOccurrences is present, every listed occurrence must exist and be a candidate, and it is the complete selected candidate set for that scope/style. It cannot omit another matching occurrence of the same semantic relation unless that other occurrence lies in a different occurrence subtree. If absent, the scope/style must select at most one occurrence for each relation id; otherwise definition validation refuses summary-occurrence-ambiguous and the author must supply occurrence ids. relationIds must equal the sorted unique relation ids of the selected occurrence set, with no omission or extra. The source view needs no top-level relation between the two scope roots for the definition to be valid.

Definition id and source triple (sourceOccurrence,targetOccurrence,effectiveStyle) are unique in the source view. Duplicate source triples report summary-duplicate-key. Constituent/style/scope mismatch reports summary-constituents-mismatch. A valid definition may be inactive in an expanded view: inactivity is not a diagnostic.

#### 4.5.2 Resolve authored summaries after projection

Compute projection and filter exclusions first. For each **drawn binary aggregate** form the key K = (projected source representative occurrence, projected target representative occurrence, effectiveStyle), preserving direction or using the undirected normalization above. Its members are the sorted occurrence ids; its semantic constituent set is the sorted unique relation ids. At least one actual fold projection is required for summary activation; visible self-links and ordinary unfolded edges do not acquire summaries.

For each definition, map its source/target occurrence roots to representatives by §4.4, preserving its selected occurrence set. It is an activation candidate only if:
(a) its key equals K;
(b) every selected occurrence is drawn in K in this state;
(c) the selected occurrence ids equal **all** members of K; and
(d) relationIds equals the full constituent set of K.
A partial overlap is inactive; no intersection silently turns it into an exact match. A definition omitting a dashed relation is valid for the solid-only candidate set and never labels the dashed group.

After all candidates are computed, enforce **at most one candidate per active key K**, even when their source triples differed. If two definitions collide, report occurrence-endpoint-mismatch/summary-active-key-conflict for each candidate after the first (definition ids sorted UTF-16), include firstId and the representative pair/style as scalar details, and refuse the derived projection/layout result. There is no winning label selected by source proximity, insertion order or label text. Definitions remain retained unchanged in the source view.

Witness: P contains C and relation C→X. Definitions (P,X,solid) and (C,X,solid) can both be source-valid. Folding P makes the same key and full member set; projection refuses with summary-active-key-conflict. Removing one definition restores the result. With N drawings of C, the occurrence-scoped rule prevents another drawing's relation from entering this key.

#### 4.5.3 Drawing, conservation and round trips

Solid and dashed occurrences never aggregate together. Style is the occurrence field or solid, with no semantic fallback. An aggregate with one active definition draws its authored label; an aggregate with none may draw the host-localized count. Constituent occurrence/relation ids remain available; no business relation is created, merged or deleted.

Export/re-import serializes label, exact constituent ids, occurrence scope and style; it reconstructs definitions without replacing authored text with a count. A1's ten authored source labels and their derived constituent ids are pinned in §8.7; both source validity and overview activation are gates. Where source material has no authored summaries the oracle explicitly records an empty set, rather than inventing labels.

### 4.6 Fixed footprints and the measurement API

This section replaces any prose of the form “layout receives measured headers” with exact types and a call sequence. The executor surface is §5.6; the component rendering contract that consumes the same line-layout result is owned by `SPEC_EVOL_DS_DIAGRAM_CARDS.md` and is referenced, not restated, except where the shared result is defined.

#### 4.6.1 Footprints: state-dependent, with a fixed-axis policy

Layout consumes a footprint per entity occurrence. A footprint is resolved from the composed presentation data plus view state (fold), never from a component constant and never from a family declaration. The presentation data carries (§5.5):

```ts
interface FootprintDecl {
  readonly width: number;   // card pixels at zoom 1
  readonly height: number;
  readonly fixedAxes: "both" | "height" | "none";
}
```

| Entity occurrence (in view state) | Footprint | `fixedAxes` | Source |
| --- | --- | --- | --- |
| Leaf occurrence (any family, selected card form) | fixed `460 × 200` | `both` | `frozen-requirement` |
| Container-family occurrence, **collapsed** in this view | fixed `460 × 200` | `both` | `frozen-requirement` (collapsed wrapping card takes the atomic-card size at every nesting level) |
| Container-family occurrence, **expanded** | computed: header height (§4.6.3) + children extent + frozen insets (rule gaps 4, content insets 16) | `none` (both axes are outputs) | `frozen-requirement` spacing values |
| `legend` occurrence, collapsed | fixed `460 × 200` (it is a container-family fold) | `both` | §4.1 |
| `legend` occurrence, expanded | computed like a container, over legend-key lines | `none` | this section |
| `legend-key` occurrence | width **follows the legend's inner width** (legend width minus its content insets); height fixed `64` | `height` (width is an input from the parent, height is fixed) | measured compact legend line of the validated HRPN scenes; a layout input, not a card token |

`fixed` is not a boolean on a type, it is `fixedAxes` on the footprint in a state. A collapsed container's footprint comes from the **view state** (fold), not from a second type declaration: the presentation data declares one footprint per presentation form, and this table maps (form, folded?) to the consumed footprint. The token change rule is unchanged: a token change that alters a fixed footprint recomputes placement, docks and routes in the same layout call; an appearance-only change inside an unchanged box never moves a dock.

#### 4.6.2 Measurement types (exact)

Text measurement is injected, as today, because the engine holds no font metric and no DOM. The `(text, role) => TextSize` measurer is replaced by a request/result pair that carries the entity, the wrapping width, the toggle allocation and the slot allocation, and returns the **shared line-layout result** that layout and rendering both consume:

```ts
type TextRole = "kicker" | "title" | "body" | "detail" | "footer"
              | "subtitle" | "legend-label" | "edge-label";

interface MeasureRequest {
  readonly text: string;
  readonly role: TextRole;
  /** Available wrapping width in card pixels for this slot in this entity state. */
  readonly availableWidth: number;
  /** Allocated lines for this slot in this state; overflow is lines beyond this count. */
  readonly allocatedLines: number;
  /** True when the slot belongs to a collapsed (card-form) occurrence. */
  readonly folded: boolean;
}

interface LineLayout {
  readonly lines: readonly string[];  // wrapped lines, in order; text is never altered
  readonly width: number;             // widest line, card pixels
  readonly height: number;            // lines.length × line-height(role)
  readonly overflow: boolean;         // true iff lines.length exceeds allocatedLines
}

type LineMeasurer = (request: MeasureRequest) => LineLayout;

interface EntityMeasurementInput {
  readonly entity: EntityRef;
  readonly occurrence: OccurrenceRef;
  readonly effectiveType: string;       // resolved by §5.1
  readonly folded: boolean;
  readonly toggle: boolean;             // true iff a fold control is rendered for this occurrence
  readonly slots: Readonly<Partial<Record<TextRole, string>>>; // every §3.2 text role resolved for this occurrence
  readonly availableWidth: number;      // card inner width for this state (460 minus insets and, when toggle, the toggle allocation)
  readonly allocatedLines: Readonly<Partial<Record<TextRole, number>>>; // frozen allocation per slot for this state
}

interface SlotMeasurement {
  readonly occurrence: OccurrenceRef;   // entity occurrence, or relation occurrence for edge-label
  readonly role: TextRole;
  readonly layout: LineLayout;
}

interface HeaderMeasurement {
  readonly occurrence: OccurrenceRef;
  readonly kicker?: LineLayout;
  readonly title: LineLayout;
  readonly subtitle?: LineLayout;       // containers and legends, expanded and collapsed forms measured separately
  readonly height: number;              // header band height consumed by placement
  readonly overflow: boolean;           // any slot overflowed its allocation
}
```

- The measurer is called per **slot**, with its `availableWidth` and `allocatedLines`. Roles are: `kicker`, `title`, `body`, `detail`, `footer`, `subtitle`, `legend-label`, `edge-label`. The same `LineLayout` (`lines`, `width`, `height`) MUST be usable to render the text: layout reserves `height` and the renderer draws `lines`. A second, divergent wrapping at render time is a contract violation.
- Per entity, layout reads **all** fragment slots (not only `name`): kicker, title, body, detail, footer for cards; kicker, title, subtitle, footer for containers and legends; label for legend keys and relation labels for edges. A measurer that receives only the title is a contract violation caught by the M1 layout tests.
- **Toggle allocation.** When `toggle` is true, the header's `availableWidth` for `title` (and `kicker`) is reduced by the toggle allocation (the fold control's reserved slot) **before** measuring, and the same reduced width is what the renderer wraps against. The header allocation with the control reserved therefore differs from the allocation without it by construction, and measurement and rendering use the same allocation for the same occurrence in the same view. There is no post-hoc `FOLD_TITLE` cap, no `padding-right` override and no parenthesis relocation.
- **Legend-key width.** A legend key is measured with `availableWidth` equal to the legend's inner width minus the swatch allocation, and placed at that width with height `64` (§4.6.1). Its `LineLayout` height is asserted ≤ 64 by the overflow rule; a longer label overflows the key line, never widens the legend by itself (the legend width is computed from its header and its longest key at the measured width — the key width follows the legend, the legend does not follow one key's unwrapped width).
- **Expanded width determination (order fixed).** An expanded container's inner width is determined **before** its header is measured: it is the maximum over (a) the header's unwrapped title/kicker width at the toggle-reduced allocation, (b) the widest fixed child footprint plus content insets, and (c) the grouping width implied by `LayoutHints` (§4.7), in that priority with (c) as an authored override. The header is then measured at that determined inner width, so subtitle wrapping is stable and vertical placement never depends on a width discovered afterwards. §4.6.3 step 2 fixes this order; a layout that measures an expanded header at the card width and later widens the box fails the §5.6 sharing test.

#### 4.6.3 Call sequence (normative order)

One `layoutDocument` / `layoutFolded` call performs, in order:

1. **Resolve.** Read the document through the shared resolver (§5.1); classify each occurrence (leaf / container-expanded / container-collapsed / legend / legend-key) from (effective type, typed presentation form, fold set). Refuse unsupported profiles/types by name, as today.
2. **Determine widths bottom-up.** For every expanded container/legend, determine its inner width by §4.6.2 (children footprints and hints known before any header measurement). Fixed occurrences take their fixed width.
3. **Measure headers.** For every leaf and every container/legend occurrence, build its `EntityMeasurementInput` (folded form and expanded form are different inputs; a collapsed container is measured as a card with `folded: true`) and measure kicker/title/subtitle through `LineMeasurer`, producing a `HeaderMeasurement` per occurrence. Header measurements are computed **before** any child placement.
4. **Place children bottom-up.** Expanded containers place their visible children using the children's footprints (fixed children at their fixed boxes; nested expanded containers recursively), then compute their own box as header height + children extent + insets. Collapsed occurrences place no children and take the `460 × 200` box. The supplied header measurements **affect child placement observably**: a taller measured subtitle header pushes the first child row down by exactly the header-height delta (asserted in §5.6 tests by two measurers differing only in subtitle line count).
5. **Measure bodies and labels.** Measure card body/detail/footer lines at the card inner width, legend-key labels at the legend inner width, and edge labels at their label allocation, all through the same `LineMeasurer`.
6. **Dock and route.** Assign docks against fixed boxes under §4.6.4; route projected and untouched edges between representative anchors.
7. **Emit.** Produce the `ViewDocument` (occurrences with placed geometry, fold groups, projected endpoints per §4.4, `summaryLabels` definitions carried through) plus `LayoutResult { fit, warnings, measurements }` where `measurements` carries a `HeaderMeasurement` per entity occurrence **and** a `SlotMeasurement` for every non-header slot measured in step 5 (body, detail, footer, legend-label, edge-label), keyed by occurrence and role. Layout and rendering therefore share one line-layout result per slot; a renderer that re-wraps with a different width fails the §5.6 sharing test. M1 asserts the measurement output only; the renderer-sharing assertion over rendered pixels belongs to M2 (§10), and no M1 gate depends on it.

#### 4.6.4 Overflow result

Overflow is a measurement outcome, never a size change: when measured text needs more lines than its frozen allocation holds, layout still places the fixed box, keeps every character, and reports the overflow with needed versus allocated size. The result type is:

```ts
interface MeasurementOverflow {
  readonly occurrence: OccurrenceRef;
  readonly slot: TextRole;
  readonly neededHeight: number;
  readonly allocatedHeight: number;
  readonly lines: number;          // measured line count
  readonly allocatedLines: number; // frozen allocation for the slot
}
```

Overflows surface as layout warnings (`card-overflow` for a card slot, `zone-overflow` for a container/legend header or collapsed-subtitle slot — the component diagnostic names of `SPEC_EVOL_DS_DIAGRAM_CARDS.md`, carried here as warning codes) and fail the geometry gate of the milestone that owns the scene. The wording is shortened by the author; no slot is ever truncated, clipped or ellipsised by layout or rendering.

#### 4.6.5 Fixed-size policy and docking overflow

- A fixed footprint (`fixedAxes: "both"`, or the fixed axis of a `height`-fixed footprint) is never enlarged, for docking or for any other reason. The current placement behaviour that grows a node to fit its dock slots is removed for fixed types (§5.6).
- When the docks required on one side of a fixed box exceed what the side holds at the declared slot spacing, the outcome is: keep the box, place the docks that fit in declared order, route the remainder from the box edge at the nearest free anchor, and report one `docking-overflow` layout warning per affected occurrence (side, required slots, fitted slots). No silent drop: every relation keeps an occurrence and a route (scene conservation, §4.4.7).
- Expanded containers are computed boxes and may grow for their children and headers; they never shrink a fixed child to fit.

#### 4.6.6 What “observing role calls” does not prove

A test that records that the measurer was invoked with each role, without asserting that the returned `LineLayout` changed placement, does not close blocking 2. §5.6 therefore requires: (a) two measurers differing only in measured subtitle height produce different first-child `y` by exactly that delta; (b) the `lines` returned at layout are the `lines` recorded in `LayoutResult.measurements` for every slot (same array content asserted through the layout fixture); (c) a toggle-bearing header wraps its title at the reduced width in both the measurement input and the emitted measurement. Role-call observation MAY be asserted additionally; it is never sufficient alone. The rendered-pixel sharing assertion is an M2 gate (§10), not an M1 gate.

### 4.7 Recursive authored layout hints

~~~ts
interface LayoutGroup {
  readonly id:string;
  readonly direction:"rows"|"columns";
  readonly items:readonly (EntityRef | LayoutGroup)[];
  readonly stretch?:boolean;
  readonly gapAfter?:number;
}
interface LayoutHints {
  readonly ordering?:Readonly<Record<EntityRef,readonly EntityRef[]>>;
  readonly grouping?:readonly LayoutGroup[];
  readonly stretch?:boolean;
  readonly cardGapX?:number; readonly cardGapY?:number;
  readonly zoneGapX?:number; readonly zoneGapY?:number;
  readonly rankGap?:number;
}
~~~

items is the single ordered sequence: references and subgroups can interleave. Separate members/groups arrays cannot preserve a source order such as [left column, RUNZ, right column], so they are not a second authority. A root/flow group is scoped to the siblings named by its leaf references in that context; duplicate leaf membership in one context or a reference outside that sibling context refuses. Nested subgroup items are recursive. id is authored layout identity, never a semantic parent override.

Rows stack items on y; columns stack on x. Item order is preserved. ordering gives sibling order within the named semantic parent; unlisted siblings follow in UTF-16 reference order. Local stretch overrides global stretch and widens computed expanded boxes only, never fixed cards/axes. gapAfter applies to that item/group on its parent's flow axis. Absent group gap inherits the corresponding call's card/zone/rank metric; absence is recorded, never replaced with an invented measured number.

Axis gaps are independent: cardGapX/cardGapY and zoneGapX/zoneGapY; rankGap controls bands. Defaults retain the engine's existing metrics; a source with no authored hints supplies no numeric overrides. The oracle supplies the concrete translated HRPN kit.root and PPROZ/RUNZ/OUT/PRODZ trees (§8.7), including interleaving and local stretch. Those are input data; no consumer tree parser or scene flag enters the engine. No source coordinates are copied as layout input.

The corpus asserts unchanged fixed footprints under all hints, expanded-width stretch only, disjoint x/y gap effects and identical placement from the same ordered tree under reordered record insertion.

### 4.8 Filters, presentation and legend placement

Existing camera/grid/theme/filter meanings remain unchanged. A legend is placed through its occurrence geometry; its keys follow that **legend occurrence's explicit ordered key list** (§3.6). Any in-canvas or surrounding legend drawing reads the same semantic legend/category entities and typed presentation data; it cannot substitute a consumer tint table or sample-card refinement.

The fixed-footprint/measurement rules of §4.6 apply when diagram-presentation@1 selects card/container/legend/legend-key **synthesis forms**. They do not replace native BPMN DI dimensions/waypoints, UML-specific native shapes or an unmodified @1 view with a universal card box. A view with no presentation.diagram uses its pinned existing renderer/layout behaviour. A BPMN card synthesis is a separate view over the same semantic document, preserving its native DI views.


## 5. Family-neutral executor mechanisms

All changes below are requirements for implementation. No build or test run is claimed in this authoring task. Existing @1 source files remain untouched. A mechanism may not branch on consumer ids, titles, scene names, category vocabulary or family-specific type literals.

### 5.1 Shared resolver

One resolver accepts (document, owning profile context, type id). It resolves profile types or additive document refinements, follows the full base chain with a visited set, returns the effective schema, nearest declared family type, inherited container capability and ordered ancestry, or a typed refusal. Unknown base, cross-owner base without an admitted join, a cycle or inherited attribute redeclaration refuses. A concrete document refinement of an abstract profile base remains instantiable; the abstract flag prohibits instantiating the base itself and is not inherited as a blanket prohibition.

All @2 endpoint checks, classification, hierarchy parents, typed references, matrix lookup, migration and layout use this resolver. Legacy @1 validation remains bound to its native behaviour (§5.3.1). Cached results are scoped to the document revision and exact profile context; a cache never crosses pins.

### 5.2 Type-family role satisfaction and matrix pairs

For a new-format role's entityTypes, the target satisfies the role iff its resolved chain contains an allowed family root. Refined containers can parent through any hierarchy declared with that family. A leaf refinement cannot acquire container capability by geometry. The existing endpoint-target-not-allowed code/path/message/details are retained; no seenChain is inserted in it.

For relationship-matrix, role satisfaction is only a preliminary check. The executor then tests one tuple (relationType,resolvedSourceCatalogueType,resolvedTargetCatalogueType). It never computes a Cartesian product from independent lists. Missing tuple emits relationship-matrix-violation. Unknown type/kind/cardinality diagnostics take precedence; a pair check does not duplicate a failure for an unresolved endpoint. The Relationship pseudo-concept is classified through the shared relation-target carrier of §3.9.1; its implementation/qualification remains gated there.

### 5.3 Scoped uniqueness, without changing legacy arrays

New declaration:
{ kind:"unique-attribute", entityType, attribute,
  scope:"document"|"siblings"|{withinType:string} }.
scope is mandatory for new-format declarations. document groups all effective members; siblings groups by the declared hierarchy parent (roots form one sibling group); withinType groups by the nearest ancestor of the declared type in that hierarchy. More than one possible grouping ancestor without a unique hierarchy selection refuses profile qualification.

Within each group, constrained entities are walked in UTF-16 id order. The first is the never-reported reference; later duplicates have refs [reportedId,referenceId]. This is the **610c0353** PR #193 rule retained per group. New scoped uniqueness adds only the scalar scope detail, with the literal arm in Appendix C. category uniqueness is semantic; legend drawing order is a view list.

There is **no global sort of native diagnostic arrays**. Native validation stage order is retained. For new checks only, visit declarations in declared order and records/occurrences in UTF-16 key order within that check. Append their findings at their declared stage. G0 may order its separate enriched diagnostic copies by its own comparator; the native array/report and original-index correspondence remain unchanged.

#### 5.3.1 Explicit compatibility carrier, outside closed G0 records

The contract asset executor-profile-bindings@1 is a package-contained, hash-bound table:
{ schemaVersion:"1", rows:[{ profileId, profilePin:Pin,
  declarationAdapter:"legacy-constraints@1"|"scoped-constraints@1" }] }.
Rows are unique by ProfileId; pin verifies bytes, never chooses between duplicate ProfileIds. Legacy rows are exactly generic@1, archimate@1, bpmn@1, uml@1. Completed rows generic@2, archimate@2, uml@2 use scoped-constraints@1; generated rows are added by their A′ lot under distinct ids. A missing row or digest mismatch refuses, never guesses from absence of scope.

The table is an **asset** { role,path,mediaType,sha256 } in the G0 catalog envelope, bound through **bindings** { key,contract,required }. It is not a declarationFormat field of OntologyRecord or OntologyPayload; neither closed shape gains a field. Adapter identity/version is additionally the existing ontology.compatibility.adapter pinned string, not metadata placed beside compatibility.

Legacy rows run the pinned native @1 declaration/endpoint checks and native stage ordering. Internal normalization of an unscoped unique-attribute may use document scope, but serialization/digests use the untouched stored declarations and diagnostics project back to their exact legacy shape with no scope or seenChain. PR #193 ordering remains 610c0353, not an older pre-fix order.

Required distinction witness: a bpmn@1 process refined as custom-process still yields the native endpoint-target-not-allowed under the retained adapter; a new-format synthetic profile naming the process family accepts its refinement. Both outcomes are explicit. Loading @2 never silently changes a retained @1 verdict.

### 5.4 Generic constraints and typed view checks

Semantic ProfileConstraint additions are closed:

~~~ts
type AddedConstraint =
  | { kind:"hierarchy"; relationType:string; hierarchyId:string; parentRole:string; childRole:string }
  | { kind:"parent-family"; hierarchyId:string; familyRoots:readonly string[] }
  | { kind:"children-restricted"; parentFamilyRoots:readonly string[]; childTypes:readonly string[]; hierarchyId:string }
  | { kind:"required-parent"; childTypes:readonly string[]; parentFamilyRoots:readonly string[]; hierarchyId:string }
  | { kind:"relationship-matrix"; matrixId:string; sourceRole:string; targetRole:string;
      tuples:readonly {relationType:string;sourceType:string;targetType:string}[] }
  | { kind:"bound-pair"; valueType:string; lowerField:string; upperField:string; unboundedUpper:number }
  | { kind:"reference-application"; attribute:string; declarationType:string; allowedTypesField:string }
  | { kind:"incident-type-uniformity"; matrixId:string; entityType:string; relationTypes:readonly string[] }
  | { kind:"at-most-value"; relationType:string; attributes:readonly string[]; value:string; max:number }
  | { kind:"collection-unique"; entityType:string; attribute:string };
~~~

Native acyclic-hierarchy/max-entities-of-type remain available. New scope replaces only the new-format unique-attribute arm. bound-pair is the generic comparison required by the UML multiplicity carrier; reference-application checks a declared application target set with no UML name hard-coded.

incident-type-uniformity gathers relations in the declared relationTypes whose entity endpoint resolves to entityType (including refinements); zero/one distinct incident relation type passes, more than one refuses once per entity, in UTF-16 entity-id order. Distinct relation types and incident relation refs are sorted by UTF-16 solely inside this new check, never by sorting a diagnostic array. groupingContainment is absent from that relationTypes list. The literal junction arm in C.2 uses relationship-matrix-violation.

at-most-value counts present enum fields equal to value on each declared relationType; count>max refuses once at that relation's attributes, with multiplicity-invalid and the C.2 exclusive-end arm. Absent aggregation fields contribute zero; invalid field kinds/enums refuse before this check. collection-unique compares canonical typed collection items left to right and emits collection-bound-exceeded at each later duplicate item, details {constraint:"collection-unique",firstIndex,duplicateIndex}; no item is removed. These mechanisms have no family-specific literals in the executor.

generic@2 constraint values: hierarchy(contains,containment,parent,child); parent-family(containment,[container,legend]); children-restricted([legend],[legend-key],containment); required-parent([legend-key],[legend],containment); acyclic-hierarchy(containment); unique-attribute(legend-key,category,{withinType:legend}). ArchiMate declares groupingContainment and its matrix; UML declares packageContainment and multiplicity/stereotype constraints.

Presentation category-membership, token agreement, key order, icon grammar and form-selector checks execute only in validateView/application against diagram-presentation@1. There is no semantic tokenAttribute or semantic category→token constraint. The view join references semantic categories and compares the typed view bindings.

Synthetic witnesses rename legend/key/category/hierarchy to palette/swatch/code/nesting and give the same constraints; outcomes must be identical after nominal renaming. Removing an optional constraint removes exactly its check. This proves no field/type name alone triggers a rule.

#### 5.4.1 Diagnostic adapter and admission

Engram's diagnostic contract revision is a separate contract artifact/schema asset. It extends the accepted native diagram-code vocabulary with the inventory in Appendix C while preserving origin diagram-core, nativeCode verbatim, severity/path/message/refs/details, optional-field presence and native order through an indexed inverse mapping. Record it in envelope assets/bindings and the existing compatibility.adapter reference.

The frozen G0 S-DSDIAG union does not magically accept new codes. The matching diagnostic-schema/adapter qualification is a required S2 dependency, unverified U-DIAG until supplied. The old G0 record/catalog/preimages remain unchanged. Each new arm requires a native→G0 separate copy→native exact-byte witness; absence of the adapter/receipt refuses admission. Report/2 diagnostics keep their own native adapter and are never translated to diagram-core codes.

### 5.5 Declaration, registry and publication units

New files hold generic@2, archimate@2, uml@2 literals/data references; skeletons.ts and generic.ts retain their exact pinned bytes. Registry registration adds new ids and never duplicates @1. EntityTypeDeclaration gains container?; **no footprint/icon/token field**. The shared contract's footprint/slot/schema assets are separate.

The semantic profile literal and its Engram source must project to identical P-CONTENT-DIAGRAM bytes. A family profile without its required source matrix, K6 carrier or admission evidence stays draft. §7 gives the exact G0 shape/receipt gate. “Complete” means declaration scope, never permission to skip a corpus or receipt.

### 5.6 View/layout execution surface

view.ts adds PresentationState.diagram?, optional summaryLabels, endpoint semanticTarget/sourceOccurrence, RelationOccurrence.strokeStyle?, VisualGroup.occurrence?. VIEW_DOCUMENT_FIELDS adds **only summaryLabels** because presentation already exists. The extended nested presentation field set adds only diagram. No hover, selection marquee or in-flight state is persisted.

The view application and validateView execute §3.2 and §4. Folding is fold→measure→place→route from a retained source. Native revision retains document meaning. Layout input reads semantic names/content projections and typed presentation slots; it never searches arbitrary entity attributes for card chrome. LayoutOptions has collapsed occurrence ids, hints and injected LineMeasurer. Output carries measurements for all slots; the renderer consumes the same wrapped lines in M2. Fixed boxes never expand for docking; all edges are drawn or explicitly excluded under scene conservation.

Mandatory implementation witnesses: empty-collapse exact restoration; repeated A→∅→A→∅ equality; nested outermost representative; independently folded duplicate occurrences; ports/counterparts; n-ary endpoints; visible self-links; filter+fold cause retention; revision 0 and 1; invalid provenance; active-summary collisions; heterogeneous styles; deletion/undo; no semantic byte changes. Measurement witnesses assert actual first-child-y delta under a changed measured header, every emitted line array, toggle-reduced width, legend inner-width/64-height and recursive hint/axis independence. Merely observing a role callback is insufficient.

### 5.7 Commands, migrations and inverses

No new semantic command kind. Domain edits use existing attribute commands; presentation edits replace a view and retain its revision. Semantic legends/keys use ordinary create/delete entity commands with explicit deletion policy. Folds are view changes, never semantic commands.

Dependency-aware deletion cleans categoryRef/categoryTokens/key-order entries, fold bindings, projected endpoints by source reprojection and summary definitions. Deleting a relation also preflights every semantic relation target and relation-occurrence attachment that names it: refuse under the existing deletion policy unless an explicitly authorized cascading transaction removes all dependents; its inverse restores those endpoints/occurrences byte for byte, including cyclic dependencies. No dangling attachment is committed. Deleting a semantic relation removes its ids/occurrences from definitions; empty definitions disappear, remaining definitions are revalidated. Any operation creating an active-summary conflict refuses atomically. The inverse restores every consumed view field/definition/optional-field presence byte for byte. The same applies to occurrence-only deletion without deleting the entity.

The profile-migration registry includes all three @1→@2 migrations (§3.13), separately from schema migrations. Reports include exact source/target pins, operations, unmigrated and originalCanonical/hash. An atomic refusal has no partial target. Reversed-insertion tests compare canonical target bytes and ordered operations. Unknown profile/schema major refuses write and preserves inspection.

### 5.8 Scalar and structured validation

Text schema extension: minLength?, pattern? (anchored ASCII RegExp source, no flags), patternName?; patternName required with pattern. Invalid/non-anchored/non-compiling pattern or minLength>maxLength refuses profile qualification. Value validation checks maxLength first (existing text-too-long), then minLength/pattern (one text-pattern-mismatch). A dotted token and a hyphenated single key witness the correct grammar inclusion.

Quantity schema extension: integer?, min?, max?. Existing kind/finiteness/unit checks keep native priority and codes, including quantity-unit-missing. Then new integrality/bound checks run in declared order: non-integer, below min, above max, one first new scalar failure per value. Numeric declaration min>max or non-finite bounds refuses qualification. quantity-above-max is included everywhere in the exact code inventory. Numeric safe-integer restrictions for multiplicity belong to its declared schema/constraint, not every domain quantity.

K2/K6 validation follows the transcribed A′ carrier. Unknown structured type, unknown field and forbidden structured target type retain their A′ codes. A well-typed multiplicity whose finite upper is below lower produces multiplicity-invalid at the struct attribute path; wrong scalar kind/bound emits the scalar diagnostic first. Stereotype application is checked only after K2 resolves the referenced stereotype. No family-specific parser enters validateScalar.

## 6. BPMN no-regression and identity gates

### 6.1 Frozen boundaries

bpmn@1 skeleton bytes and native verdict/diagnostic arrays stay unchanged through its explicit legacy adapter. New subsumption is version-bound, not retroactive. bpmn-canvas remains the production BPMN editor until its separate parity gates; this specification adds no second runtime evaluator.

profile-c14n/2 output is unchanged for every input. The accepted sealed vectors are:
tests/fixtures/profile-parity-corpus/profile-parity-corpus/1/cases/jcs-key-order.json,
jcs-escapes.json, jcs-numbers.json and identity-stable-id.json.
Their full file hashes and expected bytes/ids are in §8.5. The manifest/pin covers all corpus bytes before any gate runs.

parity-corpus/canonical-vectors.json (SHA-256 f238aef110a43381416fd0025326f883f760dc75510a9f0cc5817415eb02d1c6) stays under its existing workbench comparator. It expects decimal 0.0000001 where RFC 8785 emits 1e-7; it has input/expected values, no recorded digest. It cannot be used as a profile-c14n/2 byte/digest oracle. W01–W12 are F1 document cases with their own verdicts, not uniformly profile artifacts.

The diagram unique-attribute reference/order baseline remains DS 610c0353d899befeb59634b46b9d90f578661731 (PR #193). No seenChain and no global sorting is added to its native arrays.

### 6.2 Required gates

1. Recompute all manifest hashes (198 shared corpus files and the separate F1/workbench corpus), Unicode lock UCD 15.0.0 and descriptor/F1 pins before assertions. A mismatch is fixture error, not a changed expected result.
2. Replay **jcs-*.json** using profile-c14n/2 and compare the exact expected canonical text, including 1e-7, UTF-16 key ordering, escaping and negative zero. Replay identity-stable-id.json using stable-id/1 and compare all four exact ids. Do not substitute the workbench vectors.
3. Replay F1/W01–W12/native Report/2 and extension cases under their existing comparator and validator roles. Preserve unknown namespace payload, xmlns, xsi, DI, raw source and optional fields. Missing DI still yields required not-evaluated, never pass.
4. Replay retained skeleton document/verdict/diagnostic arrays and profile digests exactly; custom-process remains a legacy endpoint refusal. Compare whole arrays in native order. PR #193 reversed-insertion duplicate-reference witness retains the 610c0353 order.
5. Generated BPMN can claim completion only after A′ descriptor coverage=total, F1 round-trip, complete DI and §7.4 **per-library parity plus bijection** receipts all pass. Missing a required receipt at any completeness, including skeleton, refuses admission.

### 6.3 Ownership and outstanding mappings

Engram governs generated profile/corpus pins, DS implements shared kernel/view execution, bpmn-canvas owns F1 and canonicalization, d2d owns its private profile/evidence and the existing twin-library parity. The pinned d2d position leaves the generated-profile mapping unresolved. It is unverified U-D2D-MAP, owned jointly by Engram/d2d/DS, and its matrix cell remains partial. Private bodies stay owner-side; public pins/digests/receipt references never replace missing private evidence. No Python is run for this specification or added to implementation; existing twin receipts are supplied by their owners.

## 7. Engram governance and DS execution

### 7.1 Engram artifacts

Engram holds exact versioned family declarations, the diagram-presentation@1 contract/schema and view assets, semantic/view schemas, profile migration functions/references, executable matrix data, corpus/oracle, full pins/digests, diagnostic-schema/adapter bindings, namespace/owner identity records and receipt references. No entry is admitted merely because its self-validation or corpus is green. It also holds the supersession metadata/migration relationships; replacements have empty composition ancestry.

### 7.2 DS artifacts

DS keeps family-neutral resolution/validation/commands/migration registration, view application/projection, layout/measurement/routing, published executor and presentation renderers/themes. A shipped data transcription is a digest-checked Engram artifact, not a competing author-owned profile. Consumers pin locally; painting/composition performs no MCP/network call.


### 7.3 Digests: G0 exact preimages, vectors, and the separate artifact digest

Digests follow G0 §7 exactly; this section restates the operative preimages so an implementer never has to guess which bytes are hashed, and names the one additional digest this lot needs under a different name. `resultDigest` changes exactly when its effective preimage changes; a pin change necessarily changes `pinsDigest` and changes `resultDigest` only when the resolved effective declarations or rule set change (the r2 sentence that every pin change changes `resultDigest` is withdrawn).

#### 7.3.1 The four G0 digests (never interchanged)

| Digest | Question it answers | Preimage (G0 §7.2) | Changes when |
| --- | --- | --- | --- |
| `contentDigest` | Which profile bytes are these? | Per shape. For a diagram profile: **P-CONTENT-DIAGRAM** (§7.3.2). d2d keeps its `profile-c14n/2` bytes; engram keeps the `profile_hash` stable serialisation. The DS FNV-1a value (`packages/diagram-core/src/hash.ts`) is none of these and never a trust gate. | Only when the profile's own declarative content changes (new version) |
| `pinsDigest` | Which pins were declared? | **P-PINS** (§7.3.3): ordered layer pins + rule-sheet pins + delta/mapping digests in one hashed object. Even a single-layer stack hashes the pin structure, never the profile bytes. | Any layer pin, layer order, rule-sheet pin, delta or mapping change |
| `resultDigest` | Which resolved result was produced? | **P-RESULT** (§7.3.4): effective declarations + effective rule set (guardian-computable scope) or the owner's complete effective document (private scope). | Any change to the effective preimage (pin, order, delta or composition-rule change that alters the effective result) |
| `entryDigest` | Which catalog entry is this? | **P-ENTRY**: SHA-256 over the RFC 8785 bytes of the whole catalog entry (envelope plus payload), computed externally, never self-embedded. | Any entry field change (including deprecation), never a profile-byte change alone |

#### 7.3.2 P-CONTENT-DIAGRAM (diagram `contentDigest`)

Source: G0 P-CONTENT-DIAGRAM at `SPEC-G0-guardian-contracts.md` §7.2 (oracle-pinned, §8.5). The preimage is the closed object below, canonicalised with RFC 8785 (JCS), UTF-8, no trailing newline, and hashed with SHA-256. Keys in canonical (sorted) order:

| Key | Value |
| --- | --- |
| `completeness` | String (`skeleton` or `complete`), verbatim |
| `constraints` | Array of the profile's executable constraint declarations, in declared order, each as its native JSON value |
| `entityTypes` | Array of entity type declarations, in declared order, each as its native JSON value (labels, attribute schemas, `abstract` flags, and the M1 additions `container`, text `pattern`/`patternName`/`minLength`, numeric `integer`/`min`/`max` where declared) |
| `limits` | Closed object with exactly `maxEntities`, `maxRelations`, `maxEndpointsPerRelation`; each the declared number or **`null`** where the source omits it (omission hashed as `null`, never `0`, never dropped) |
| `portTypes` | Array of port type declarations, in declared order (`[]` where none) |
| `profile` | String `name@major` — the source `id` under this key (renamed; the value is identical) |
| `relationTypes` | Array of relation type declarations, in declared order (labels, direction, roles with `min`/`max`, targets, entity types, attributes, `hierarchy` where declared) |

Excluded (never hashed): `name`, `version`, `notes` as standalone fields (identity is carried by `profile`; human notes are outside the delegated projection), runtime code, file paths, the DS FNV drift value, view documents, occurrences, geometry, layout results, theme identifiers and token values, and every catalog field. Consequences, normative and fixtured (§7.3.5): changing `completeness`, a `container` flag, a constraint `scope`, a text `pattern` or a numeric bound **changes** `contentDigest`; changing only `notes` **does not**. The transcription check of §7.3.6 uses this projection on both sides.

#### 7.3.3 P-PINS, P-DELTA, P-MAPPING

- **P-PINS**: closed object `{ deltaDigest, layers, mappingDigest, ruleSheets }` where `layers` is an array of Pin objects exactly `{ contentDigest, id, version }` in stack order (top layer last; reordering changes the digest; even a single-layer stack hashes this array), `ruleSheets` the same Pin shape in composed order (`[]` where none), and `deltaDigest`/`mappingDigest` each a digest or `null`. `pinsDigest` is SHA-256 over the RFC 8785 bytes of that object. Hashing profile pins alone, or omitting `ruleSheets` where sheets compose, fails qualification.
- **P-DELTA**: the delta digest inside P-PINS is SHA-256 over the RFC 8785 bytes of `{ base, mappingRef, operations, retiredFixtures, retiredRules }`, where each operation's `declarationDigest` is computed over the **single declared value alone** (diagram: RFC 8785 bytes of that declaration JSON value), never over a whole profile (G0 P-DELTA, complete in the pinned G0).
- **P-MAPPING**: the mapping digest is SHA-256 over the RFC 8785 bytes of `{ entries, mappingId, version }`, each entry its flat typed object with every arm field verbatim; the file's own `contentDigest` field is excluded.

#### 7.3.4 P-RESULT

Guardian-computable diagram scope: SHA-256 over the RFC 8785 bytes of `{ effectiveDeclarations, effectiveRuleSet, severityPolicyDigest }`, where `effectiveDeclarations` is the P-CONTENT-DIAGRAM object of the **effective** (resolved) profile, `effectiveRuleSet` the composed effective rules as closed `{ classification, code, messageKey, ruleBody, ruleId, severity }` objects (`ruleBody` the complete effective native rule value), and `severityPolicyDigest` the pinned SHA-256 of canonical `{ phase, readinessPolicy, settings }` (or `null` where no rule sheet applies). Changing an effective body, option, severity, classification or selected policy changes this digest even with pins held fixed. The owner-side private procedure (whole effective document, S-D2DC14N) does not apply to public diagram profiles and is not used here; private (d2d) results are computed owner-side and recorded as receipt data only.

#### 7.3.5 Frozen vectors (must reproduce exactly)

An implementation must reproduce each digest from the exact bytes. A mismatch fails qualification; the vectors decide the freeze (G0 §7.2).

| Vector | Exact canonical bytes (UTF-8, no trailing newline) | SHA-256 |
| --- | --- | --- |
| V-PINS-1 (P-PINS, single layer, no delta/mapping/rules) | `{"deltaDigest":null,"layers":[{"contentDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","id":"generic","version":"1.0.0"}],"mappingDigest":null,"ruleSheets":[]}` (186 bytes) | `467becc10978220abbbe6d9fdad72eddec4c62a3dd9f2150bc3f9fe1bd7313fe` |
| V-DIAGRAM-1 (P-CONTENT-DIAGRAM, minimal) | `{"completeness":"complete","constraints":[],"entityTypes":[{"id":"node"}],"limits":{"maxEndpointsPerRelation":4,"maxEntities":100,"maxRelations":200},"portTypes":[],"profile":"generic@1","relationTypes":[]}` (206 bytes) | `4d2c641281713349753eb80ba40e0b08ec29b2f93847e4d0f2feb18e25381c94` |
| V-MAPPING-1 (P-MAPPING, one rename) | `{"entries":[{"from":"a","kind":"rename","to":"b"}],"mappingId":"m1","version":"1.0.0"}` (86 bytes) | `b5770fd9b0623a047f65ed3d7811340afa965a623faaf0fd3e58babbc1be2516` |
| V-DELTA-1 (P-DELTA, one add) | `{"base":{"contentDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","id":"generic","version":"1.0.0"},"mappingRef":null,"operations":[{"declarationDigest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","op":"add","subject":"c4-system"}],"retiredFixtures":[],"retiredRules":[]}` (320 bytes) | `436065f4f09c6de4dc7f25f8eb3821088e43f27c2f9454137fc19042bebff3e2` |

Mutation fixtures (in addition to G0 §7.4 FX-DIG-*): for each completed profile, flipping `completeness`, toggling a `container` flag, changing a constraint `scope`, changing a text `pattern` and changing a numeric bound each change the computed `contentDigest`; editing only `notes` leaves it unchanged; omitting a limit vs declaring it `null`-equivalent is distinguished exactly as G0 prescribes (declared number vs `null`).

#### 7.3.6 Transcription check and the separate artifact digest

- **Pins.** A consumer pins a profile by an exact pin `{ id, version, contentDigest }` — exact version, full SHA-256 `contentDigest` over the P-CONTENT-DIAGRAM projection, no range, no tag, no `latest` fallback anywhere. An unknown version, digest or major refuses; it never falls back.
- **Transcription check.** Each completed-profile literal shipped in `packages/diagram-core` must project (P-CONTENT-DIAGRAM) to bytes whose SHA-256 equals the pinned Engram `contentDigest`. The M1 gate runs this check; a mismatch refuses the build (`digest-mismatch` discipline) rather than silently preferring either copy.
- **Artifact digest (separate, where complete-file equality is also required).** `artifactDigest` is SHA-256 over the RFC 8785 canonical bytes of the **complete** profile artifact as published (including `name`, `version`, `notes` and any governed metadata the projection excludes), computed externally and recorded beside — never instead of — `contentDigest`. It exists so a publisher can prove two complete files are byte-equivalent where that stronger statement is needed (for example a mirrored transcription audit). Rules: `artifactDigest` never gates pin resolution, never substitutes for `contentDigest` in P-PINS/P-RESULT, and is labelled `artifactDigest` wherever recorded so the two are never interchanged. A notes-only change changes `artifactDigest` and leaves `contentDigest` unchanged; both behaviours are fixtured.
- **Fixture hand-off:** each acceptance fixture (§8) is identified by its canonical SHA-256 as recorded in the corpus manifest. A hash mismatch at lot time aborts the lot's fixture step as a fixture error, not a test failure.
- **Change flow:** a profile change is proposed as data in Engram, qualified against the corpus there, published as a new version with its digests, and only then transcribed or re-pinned here. This repository never edits a published profile's bytes in place, and Engram never edits executor code.


**Presentation digest separation (r4).** No footprint/icon/stroke/categoryTokens/order/slot-allocation declaration is inside an entity/relation profile declaration. Applying or changing diagram-presentation@1 changes its contract/application digest and view bytes, not the semantic P-CONTENT-DIAGRAM/P-PINS/P-RESULT. The G0 P-CONTENT projection still hashes all *semantic* native declarations (including matrix tuples, container flags, numeric/struct/reference schemas) verbatim. Contract assets use their exact governed artifact digest and G0 contract binding. A schema change cannot be hidden as a notes-only edit.


### 7.4 Exact G0 mapping, receipts and admission

#### 7.4.1 Source types, before application

Transcribed from G0 §§1.3/1.4/5.3, unchanged:

~~~ts
type Digest = string; // exactly 64 lowercase hex digits
interface Pin { readonly id:string; readonly version:string; readonly contentDigest:Digest }
type DigestEvidence =
  | { readonly evidenceState:"resolved"; readonly digest:Digest }
  | { readonly evidenceState:"unresolved" };
interface ResultingDigests {
  readonly contentDigest:Digest;
  readonly pinsDigest:Digest;
  readonly resultEvidence:DigestEvidence;
}
interface PrivateDerivationRef {
  readonly base:Pin; readonly deltaDigest:Digest; readonly mappingRef?:Pin;
}
interface PrivateDerivationRecord extends PrivateDerivationRef {
  readonly resultingDigests:ResultingDigests;
}
interface PrivateLineage {
  readonly parents:readonly Pin[];
  readonly derivationRef?:PrivateDerivationRef;
  readonly mappings:readonly string[];
  readonly migrations:readonly string[];
}
interface PublicDerivationRecord {
  readonly base:Pin; readonly operations:readonly DeltaOperation[];
  readonly resultingDigests:ResultingDigests;
}
interface PublicLineage {
  readonly parents:readonly Pin[];
  readonly derivation?:PublicDerivationRecord;
  readonly mappings:readonly string[];
  readonly migrations:readonly string[];
}
~~~

Public/private lineage is discriminated by enclosing visibility, never by an added scope field inside lineage. Private record→reference mapping takes base/deltaDigest/mappingRef from lineage.derivationRef and resultingDigests from the **same enclosing candidate/entry digests**; mismatches refuse digest-mismatch. No private delta operation, rule body or business name crosses that boundary.

Closed OntologyRecord fields, and only these:
namespace, id, version, owner, lifecycle, completeness, visibility, profileShape, artifactKind, profileRef, corpusRef, digests, lineage, consumers, supersededBy?, migrationRef?, deprecatedReason?, deprecatedAt?, catalogEntryRef?.
profileRef is exactly {canonicalRef,contentDigest}; corpusRef exactly {ref,digest}; digests exactly ResultingDigests. Draft may lack publication evidence; published requires corpusRef and resolved resultEvidence. Deprecated requires reason/date and may name a known successor; superseded requires supersededBy and migrationRef; draft/published have neither deprecation nor successor fields.

Closed catalog envelope fields:
format="sentropic.registry-entry/v1", contractVersion="1.1.4", kind, id, name, description, entryVersion, publisher, compatibility, parameters, bindings, assets, exactly one selected kind payload; optional qualified extensions/requiredExtensions. kind adds ontology to the native skill/mcp union without altering either original arm.
publisher={packageName,packageVersion};
compatibility={entryContract,packages:[{name,range}],schemaProfiles,requiredHostFeatures,optionalHostFeatures};
parameters={schemaVersion,schema,defaults};
binding={key,contract,required};
asset={role,path,mediaType,sha256}.
An ontology payload is not an envelope, and a DocumentSchema is not an asset/binding.

Closed OntologyPayload fields:
canonicalRef, namespace, owner, domain?, profileShape, artifactKind, profilePin, stack, digests, ruleSheets, lifecycle, deprecatedReason?, deprecatedAt?, supersededBy?, provenance, licenceClosure?, coverage?, lineage, conflictPolicy, completeness, corpusRef, receipts, migrations, consumers, compatibility, visibility, linkedTools, artifactBinding.
provenance={sourceRef,sourceRevision} only; compatibility={renderer,adapter} pinned strings only.
ruleSheets=[] here where no rule sheet applies; otherwise each public row has sheetPin/ruleIds/selections with full G0 SelectionMetadata, and private selections remain owner-side. No root declarationFormat or diagnosticAdapterPin is added.

Exact artifactBinding arms (each carries its artifactKind discriminator):
- base: basePin, bijectionEvidence={evidenceState:"resolved",receiptRef} or {evidenceState:"unresolved"}. **Non-BPMN bases also carry this field**, resolved to their base corpus receipt.
- profile: profilePin, stack, relationMatrixRef required for private profiles and absent otherwise.
- contract: schemaPin, compatibilityMatrixVersion.
- theme: themeDigest, appliesTo.
- mechanism: mechanismVersion, descriptorPins, compatibilityMatrixVersion.
- corpus: manifestDigest, manifestRef, sealedVectorsDigest, caseCounts={publishedCases,localVectors}.

No unknown property is admitted to any closed object. entryDigest is SHA-256 over the full G0 P-ENTRY and is computed **externally**, never embedded in record/payload/envelope.

#### 7.4.2 Family field mapping and identity lookups

| G0 location | Required mapping |
| --- | --- |
| record namespace / payload namespace | Same resolved namespace identity, compared verbatim. Candidate namespace for these public diagram artifacts is diagram; the production registry lookup is unverified U-ID, owned by Engram. No fictitious diagram.namespace registry key is treated as evidence. |
| record owner / payload owner | Same durable owner handle read from the admitted owner identity. G2 assigns responsibility to Engram; candidate handle engram. Actual registered handle/lookup receipt is unverified U-ID. A label is not a lookup. |
| record id/version / payload profilePin | generic/2 ↔ native generic@2; archimate/2 ↔ archimate@2; uml/2 ↔ uml@2. Generated family ids/versions exactly §3.10. Every native/pin mapping is explicit, no stripping guessed at load time. Exact versions only, no ranges/tags/latest. |
| contract record/payload | diagram-presentation/1, native contract label diagram-presentation@1; profileShape mechanism-descriptor, artifactKind contract, schemaPin with the same exact contract schema digest. Not a semantic stack layer. |
| record profileRef / payload canonicalRef | Canonical reference read from the governing identity record; its digest equals payload profilePin.contentDigest and record digests.contentDigest. The catalog id remains a distinct identity. |
| record corpusRef / payload corpusRef | Exact same {ref,digest}; required and hash-checked before corpus execution. |
| base stack / lineage | stack=[ownPin]; lineage.parents=[]; mappings=[] unless a governed mapping exists; migrations=[the explicit predecessor migration]. basePin=ownPin; bijectionEvidence is required as above. |
| semantic stacked entry | Only actual admitted additive/narrowing semantic modules; layers in stack order and lineage.parents equal to the predecessor layers (excluding the entry's own pin), S-1…S-7 enforced. Card presentation does not create such a stack. The two-layer fixture below is an isolated G0 narrowing specimen. |
| migrations / migrationRef / supersededBy | Migration references in record/lineage/payload agree. On each superseded @1 entry, successor points at its @2 pin and migrationRef exists. Source profile bytes remain unchanged. |
| digests | P-CONTENT-DIAGRAM/P-PINS/P-RESULT exactly §7.3. No unresolved arm contains digest/null/empty placeholder. |
| provenance | sourceRef identifies this specification by exact file hash; sourceRevision is that immutable hash identifier, not an uncommitted branch name. It does not self-embed the current file hash here. |
| compatibility | renderer/adapter are exact pinned reference strings to qualified DS executor and schema/diagnostic adapter. Before qualification a pinned build-time copy is explicitly transitional. No extra metadata beside compatibility. |
| assets / bindings | Profile/semantic/view/presentation/diagnostic schemas and executor-profile-bindings@1 use exact asset/binding forms, package-contained relative paths, full raw-file SHA-256. The schema contract string names the corresponding immutable schema pin. |
| consumers / linkedTools | Present arrays of actual consumer/tool identity references. The owner registry must resolve them before publication; no invocation grant follows from discovery. |
| lifecycle/completeness/visibility | draft until full admission; then published, completeness complete for qualified replacements, public. Retained @1 stays skeleton as applicable. Skeleton never waives admission evidence. |
| licenceClosure / coverage | Required iff EXT pack entry; absent for these DIA bases. Matrix/contract dependency licence evidence still belongs to its own artifact qualification; no laundering through an omitted EXT field. |
| catalogEntryRef | Absent for draft; exact admitted catalog entry reference when present. No root entryDigest or declarationFormat is added. |

Lookup algorithm: obtain the exact immutable record by the requested (namespace,id,version); verify its profileRef and digests against requested Pin; resolve its owner through the owner identity input; compare every mirrored field in the catalog payload; validate assets/bindings and reciprocal references; then execute §5.5 admission. Missing record/owner/canonical reference or lookup receipt refuses. Source G0-CODE intentionally contains no production registry; therefore this specification cannot assert that these lookups already succeeded. Candidate strings do not stand in for actual registered identities.

#### 7.4.3 Concrete closed-shape specimens

Appendix A.3 serializes one base and one two-layer semantic narrowing entry, their matching records and resolved **fixture** identities. It uses computed digests of explicitly included specimen declarations; it has no placeholder digest. Its namespace/owner are fixture-namespace/fixture-owner, not claimed production identities. The base includes resolved bijectionEvidence to its fixture corpus receipt. The stacked entry includes profilePin/stack, and its lineage.parents names the base pin in stack order. It composes no presentation fields.

These are serialization/field-mapping oracles. They do not claim executed schema validation, receipt issuance or S2 admission. The actual published base/contract records and production lookup/receipt values remain unverified U-ID/U-QUAL; no fixture alias may be shipped as a production canonical reference.

#### 7.4.4 Receipts, ordinary DIA and generated-BPMN exception

G0 Receipt common fields, exactly:
receiptKind, corpusDigest, libraryId, libraryVersion, validatorRole, verdict, issuedAt, evaluatedStack, transitionQualification as required by role.
evaluatedStack={stack,pinsDigest,resultEvidence}.
validatorRole is transitional-oracle, retained-check or qualified-ds-execution.
transitionQualification is {claim:"oracle-witness",parityMatrixDigest} for a transitional oracle, {claim:"reference-qualified",parityMatrixDigest,qualifiedExecutorPin,gateEvidenceRef} for qualified execution, absent for retained-check.

| Artifact scope | Complete required receipt set |
| --- | --- |
| Ordinary non-BPMN DIA base/profile | family-corpus from **each validator library in its declared qualification scope**; family DIA; fixtureDigest=corpusRef.digest; corpusDigest matches; severityPolicyDigest explicitly null where no sheet; ruleVerdicts present, [] only without sheets. Non-BPMN base bijectionEvidence names this corpus receipt. |
| Generated-BPMN DIA | All bpmn-parity receipts: **each implementing library × each claimed proof set × each declared phase/readiness selection**, plus bpmn-bijection. Any additional ordinary DIA corpus obligation in its declared qualification scope is also retained. Bijection does not replace parity. |
| Contract (presentation/view/diagnostic schema) | contract-verdict with schemaPin, compatibilityMatrixVersion, caseVerdicts (caseId and errorCode only on refusal), severityPolicyDigest (selected digest or explicit null). Includes schema validation and each compatibility-case verdict. |
| Theme | theme-invariance with styledProfilePin, semanticDigestsBefore/After={contentDigest,pinsDigest,resultDigest}, equal field by field; severityPolicyDigest present. |
| Mechanism/corpus | G0 mechanism-compat and all implementing-library corpus/parity receipts for the declared scope; sealed-vector/manifest evidence required. |

bpmn-parity proofBindings is exactly
{ proofSet:"published-corpus"|"local-expectations",
  corpusAuthority:{tag,manifestDigest}, unicodeLockDigest? ,
  profilePin, severityPolicyDigest, ruleSheetPins, compiledLintEvidence }.
compiledLintEvidence is {scope:"public",compiledOptions:S-COMPILED,settings:Setting[]} or {scope:"private-reference",ownerReceiptRef}. Private body/settings remain owner-side. Native full compiled options/bindings and selection metadata are preserved and verified against the independent producer selection. The Unicode lock is required for every text/case/prefix rule.

ruleVerdicts rows: ruleId, native effective severity, verdict off/pass/diagnostic/not-evaluated, parity proven/open, optional studyDisposition. No warn→warning translation. The published corpus (176 cases) and local expectations (486 vectors, 68 identifiers shared) are distinct proof sets; both are required when both are claimed, never merged into a single count or receipt. The 198 files are the manifest's file count, not 176+486.

bpmn-bijection fields: descriptorCoverage={covered,total} with equality, roundTripEvidenceRef, moddleTestPin (exact version/digest of latest bpmn-moddle selected as test dependency), severityPolicyDigest. It carries no proofBindings. Missing parity receipts refuse even with a passing bijection receipt.

#### 7.4.5 G0 §5.5 admission, unchanged

1. Derive required obligations from the **entry's declared qualification scope**, not a caller-supplied shortened receipt list. Match exact libraries/versions, proof sets and selections; duplicates cannot cover another obligation.
2. Require entry and every required receipt resultEvidence to be resolved, digest present and equal. A pass with unresolved evidence refuses, as do two unresolved arms. Check stack order, every Pin and pinsDigest, corpus identity, all proof/selection bindings, required schema/matrix cases and compiled evidence.
3. Recompute public policy digest from {phase,readinessPolicy,settings}, compare each selected rule severity/studyDisposition and require every required verdict row. Private runs check owner-side evidence by opaque reference with the same refusal discipline.
4. Missing, failed, mismatched, unevaluated or wrong-role receipt refuses missing-receipt at every completeness, skeleton included. parity open cannot qualify a rule's reference execution. qualified-ds-execution requires reference-qualified gate evidence.
5. Require self-validation, corpus validity, applicable licence closure, resolved digests, identity lookups and every dependent contract/adapter receipt. Only then publish/admit. The guardian stores receipts and executes no implementing library itself.

Removing any one generated-BPMN parity-library/proof-set receipt or its bijection receipt flips admission to missing-receipt; restoring it can restore admission only if all other evidence still matches. The same exhaustive-removal witness applies to ordinary DIA validators and contract/schema obligations.


## 8. Evidence matrix and acceptance oracle

### 8.1 Status and layer semantics

covered = verified evidence for the stated layer from the exact pinned bytes; partial = the correct family but a named missing conversion/implementation/receipt; absent = wrong family or no claim. **Target expressibility is a separate column**, never a current covered verdict. Canonical identity coverage is not semantic/view validity; rendering and interaction require their own gates.

A1 is merged #711. A2 is frozen S2-asbuilt, A3 frozen S2-target, A4a S1-conversational, A4b S3-agentfactory. A5 is the distinct Engram-form S2-target graph. Each is a separate corpus instance. Current HRPN producers are separate snapshots (§8.6); they do not replace frozen fixture payloads.

### 8.2 Matrix

| Row / evidence layer | A1 | A2 | A3 | A4a | A4b | A5 | BPMN F1/W01–W12 | d2d |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| generic@1 model/view today | partial: card presentation external; no CI/CD duplicate assertion in #711 | partial: external tints/dashes | partial: external tints/dashes | partial: external tints/dashes | partial: external tints/dashes | partial: native validation [] relies on refinement, 19 slot extensions and suffixed names | absent: wrong family | absent: wrong family |
| generic@2 + contract, specified target | partial: native conversion/executor receipts unverified | partial: same | partial: same | partial: same | partial: same | partial: §8.4 populated conversion; executor receipt unverified | absent: wrong family | absent: wrong family |
| archimate@1 skeleton | absent: no ArchiMate assertion | absent: wrong family | absent: wrong family | absent: wrong family | absent: wrong family | absent: wrong family | absent: wrong family | absent: wrong family |
| archimate@2 | absent: no producer matrix assertion | absent: same | absent: same | absent: same | absent: same | absent: same | absent: wrong family | absent: wrong family |
| bpmn@1 skeleton | absent | absent | absent | absent | absent | absent | partial: arity only, no full DI/extension model | partial: placeholder cannot express private mechanism profile |
| A′ generated BPMN model | absent | absent | absent | absent | absent | absent | partial: F1 publication/extension/DI and bijection qualification remain A′ evidence | partial: pinned generated-profile mapping missing (U-D2D-MAP) |
| uml@1 / uml@2 | absent: no UML classifier assertion | absent | absent | absent | absent | absent | absent: wrong family | absent: wrong family |
| profile-c14n/2 identity | absent: documents are not profile artifacts | absent | absent | absent | absent | absent | absent as a uniform F1-model claim; sealed JCS/stable-id cases are covered identity witnesses separately (§8.5) | covered identity of manifest-sealed profile artifacts; semantic model/layout coverage is not implied |

Sources for card cells: A1 KIT; A2/A3/A4a/A4b exact fixture hashes in §8.5; A5 exact semantic/view hashes. Sources for BPMN/d2d cells: A′, c14n code, sealed manifest/pin, F1/workbench index and pinned d2d position. No absent cell becomes partial by coercing cards into invented layer/aspect/classifier assignments. No generated mapping is described as already covered.

Target scope: generic@2 plus the contract expresses A1–A5 without consumer refinements/extensions for standard presentation. Acceptance requires native execution of the concrete oracle below; the specification does not manufacture that execution evidence. ArchiMate/UML have their own A7 matrix/multiplicity corpora and admission dependencies, not synthetic coverage over HRPN card scenes.

### 8.3 Counts and explicit additions

| Instance | Source cards / frames / links | Added semantic legend / keys / contains | Target node / container / legend / legend-key | Target contains / link | Dashed / solid |
| --- | --- | --- | --- | --- | --- |
| A1 | 28 / 10 / 50 | 1 / 3 / 3 | 28 / 10 / 1 / 3 | 36 / 50 | 0 / 50 |
| A2 S2-asbuilt | 41 / 17 / 44 | 1 / 4 / 4 | 41 / 17 / 1 / 4 | 58 / 44 | 7 / 37 |
| A3 S2-target fixture | 51 / 22 / 54 | 1 / 4 / 4 | 51 / 22 / 1 / 4 | 73 / 54 | 0 / 54 |
| A4a S1-conversational | 23 / 17 / 24 | 1 / 5 / 5 | 23 / 17 / 1 / 5 | 41 / 24 | 10 / 14 |
| A4b S3-agentfactory | 37 / 15 / 36 | 1 / 5 / 5 | 37 / 15 / 1 / 5 | 53 / 36 | 3 / 33 |
| A5 Engram S2-target | 37 / 19 / 31 | 0 / 0 / 0 (existing LEGEND and four samples retyped) | 33 / 18 / 1 / 4 | 51 / 31 | 0 / 31 |

A1 source contains is 33 (28 card parents plus five nested-frame parents); adding three key containments gives 36. New legends are roots: no unrecorded root-containment link is invented. A2–A4 source contains are 54/69/36/48 respectively, recomputed from non-null parents. Re-expression preserves every original node/frame/link id and adds only the explicitly counted legend/key/contains records. A5 is identity-preserving for every entity and relation, not a deletion of sample-card identities.

Expanded/folded layout uses DS geometry from the declared inputs, not source geometry as engine input. Source PNGs are comparison witnesses only. No card slot, standard category rendering or authored summary requires a consumer extension.

### 8.4 A5 ledger: every authored field has a native destination

Source: semantic `46f64154bb6592d49ccda5633b2c4d4205fb1c6752ef218be31d6757923ecf91`; view `82930614efe070bdb8e5acce3aecea29dfdb2d1ab625b7d376507f97fb6f8b50`; manifest `54ef0dd0ac0e923aa99435625780902d07c3819e9c2c340868c921d1f956fd91`.

The resulting semantic document has 56 entities, 82 relations, no standard-slot extension and no standard-slot refinement. Every source id survives. Its ViewDocument stores the standard presentation in presentation.diagram. Default folds are exactly PCICD, MSGZ, VERTEXZ, OBSZ, INGZ, GENSRC, AWSCI, resolved to existing occurrence ids in the produced view; document/view revision remains 1.

| Source | Semantic destination | Typed view destination / disposition |
| --- | --- | --- |
| LEGEND container name | legend.name, same entity id | extension kicker="HRPN", subtitle="Card tints and link styles of this scene", icon="window" become its occurrence presentation text/icon. No string is dropped. |
| Four legend sample cards | Same ids retyped legend-key; name unchanged; category from explicit table below; description from body | Original kicker/body/detail/footer/icon values retained individually in legend-key EntityPresentation. Icon drawing is retired for swatch form; its name remains stored. Explicit order list is genair,custom,outside,none. |
| 18 other containers | Same ids/types; literal displayTitle becomes name for PCICD/AWSCI | Every zone-slots kicker/subtitle/footer/icon moves to its occurrence presentation. Tint meaning becomes category data; drawing token stays in view. The generated name suffix used solely to avoid uniqueness is retired with its exact original in migration operations/originalCanonical; no authored display string is retired. |
| 33 other hrpn-card | Same ids become node; semantic name unchanged; tint meaning retained as category | Every kicker/body/detail/footer/icon moves to each original occurrence. The consumed refinement is removed only after all instances/dependents have destinations. |
| contains / link | Same 51/31 ids, endpoints, labels and general attributes | Occurrence style absent stays absent (effective solid). Source view geometry is replaced only by authorised DS layout; original state remains recoverable. |
| resources and foreign extensions | Preserved unchanged | No presentation conversion erases unrelated data. |

The four complete resulting records below give their exact authored values. S denotes the semantic legend-key fields; P denotes that key's typed occurrence presentation. Strings in these records remain in English exactly as in the source. An accessible exporter can read all original text directly from the resulting native document/view pair; a side-ledger note is not its only destination.

~~~json
[
  {
    "S": {
      "id": "entity:legend-genair",
      "profile": "generic@2",
      "type": "legend-key",
      "attributes": {
        "name": {
          "kind": "text",
          "value": "GenAiR standard"
        },
        "category": {
          "kind": "text",
          "value": "genair"
        },
        "description": {
          "kind": "text",
          "value": "GenAiR template, unchanged"
        }
      }
    },
    "P": {
      "form": "legend-key",
      "text": {
        "kicker": "TINT · BLUE",
        "body": "GenAiR template, unchanged",
        "detail": "standard GenAiR code and service",
        "footer": "tint: genair"
      },
      "icon": "window",
      "categoryRef": "entity:legend-genair"
    }
  },
  {
    "S": {
      "id": "entity:legend-custom",
      "profile": "generic@2",
      "type": "legend-key",
      "attributes": {
        "name": {
          "kind": "text",
          "value": "GenAiR customisation"
        },
        "category": {
          "kind": "text",
          "value": "custom"
        },
        "description": {
          "kind": "text",
          "value": "within the template frame"
        }
      }
    },
    "P": {
      "form": "legend-key",
      "text": {
        "kicker": "TINT · GREEN",
        "body": "within the template frame",
        "detail": "configured, data services included",
        "footer": "tint: custom"
      },
      "icon": "window",
      "categoryRef": "entity:legend-custom"
    }
  },
  {
    "S": {
      "id": "entity:legend-outside",
      "profile": "generic@2",
      "type": "legend-key",
      "attributes": {
        "name": {
          "kind": "text",
          "value": "Specific for HRPN"
        },
        "category": {
          "kind": "text",
          "value": "outside"
        },
        "description": {
          "kind": "text",
          "value": "added outside the template"
        }
      }
    },
    "P": {
      "form": "legend-key",
      "text": {
        "kicker": "TINT · YELLOW",
        "body": "added outside the template",
        "detail": "not provided by GenAiR",
        "footer": "tint: outside"
      },
      "icon": "window",
      "categoryRef": "entity:legend-outside"
    }
  },
  {
    "S": {
      "id": "entity:legend-none",
      "profile": "generic@2",
      "type": "legend-key",
      "attributes": {
        "name": {
          "kind": "text",
          "value": "Managed service"
        },
        "category": {
          "kind": "text",
          "value": "none"
        },
        "description": {
          "kind": "text",
          "value": "Google or third-party"
        }
      }
    },
    "P": {
      "form": "legend-key",
      "text": {
        "kicker": "NO TINT",
        "body": "Google or third-party",
        "detail": "managed service: no fill",
        "footer": "tint: none"
      },
      "icon": "window",
      "categoryRef": "entity:legend-none"
    }
  }
]
~~~

All four original names, kickers, body/detail lines, footers, icon names and tint presence are accounted for. In particular "TINT · BLUE" and "tint: genair" are native P.text.kicker/footer values; none has been folded into an undefined description note. The absence of tint on legend-none remains an absence in the archived source; the explicit semantic category none comes from its role as the no-tint legend key. Each source field→destination path is recorded, not merely each entity's count.

### 8.5 Raw-byte source pins

A source pin is SHA-256 over exact file bytes; it is not a G0 profile contentDigest. DS files are always retrieved with git show DS:path. KIT files are retrieved with git show 4138a0ec:path, never the scratch kit. The table below is generated from the read bytes. Paths sharing a repository/revision use that exact revision for every row.

| Repository / immutable revision or snapshot | Path | Raw SHA-256 |
| --- | --- | --- |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `packages/diagram-core/src/profile.ts` | `ee4299f403e84041254537bdbb0c058079200be6b668230200f241a86dc30223` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `packages/diagram-core/src/document.ts` | `300f05718298f7debbc15ffc36dd587b918724ca6f5ab310b297049a59dddf38` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `packages/diagram-core/fixtures/valid/archimate-skeleton-document.json` | `8395ccc32ac25ae1354271817a3358bfe6f96243ecdfe2e5ef45ae1f48683951` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `packages/diagram-core/fixtures/valid/uml-skeleton-document.json` | `eea74144a37d9e44456278eeb36b06c5c2d7f9b4d19136a6b8ed3ce6ea3b08d8` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `packages/diagram-core/src/attributes.ts` | `25574ecc699b8e08a6cc30f72b0923cc0b04c32071057a8a2edeb4beb779a21e` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `packages/diagram-core/src/view.ts` | `767faaf9b0b5ba001aa0ac2e621de41dc5117a8386dd719dc91dbf6c01fb8598` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `packages/diagram-core/src/validate.ts` | `ab0ee3df80a427e8199b5204fb8652e4b86d03a2ebcf7b52860f78937ad120f3` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `packages/diagram-core/src/profiles/generic.ts` | `b19967fe65483abdbf0e271f197e13691904e4b087c1542de23c52e2ad4f45c3` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `packages/diagram-core/src/profiles/skeletons.ts` | `0a01fd2569e68c2b99ca754f28dc7cbbbd9a1d491ffa9981161cae3bbf56b54e` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `packages/diagram-core/src/diagnostics.ts` | `fdd5e6a39cab036c8e552d2e0db46759ddb164a535f00a9fe848a9c0555c92a4` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `spec/SPEC_EVOL_GD_M2_MODEL.md` | `5e7798a451c5b92cbbde6fbf85ea5f890c32c863ece3c73e5d9772efa9cff078` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `spec/SPEC_EVOL_GD_M2_DS_PRESENTATION.md` | `ea0fdd0ae6aa605ec05ff8cd91c6fe02b34570369836f7a973316905698db9ab` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `spec/SPEC_EVOL_GD_M2_CANVAS.md` | `b81dfe8ad4700bc741b5c23dbe4e7d95d565deaa09e24f7d1c4ec1c4eeb9b7e9` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `spec/SPEC_EVOL_GD_BPMN_MODDLE_COVERAGE.md` | `7b29e147873287402a271d8b95e86bc0d39cd320152bbd8c6b1f6ef4c6e87505` |
| sent-tech-design-system `f6f3ba3790696754b6e08b13b62148ef3556bc4e` | `spec/SPEC_RE_BPMN_JS_PARITY.md` | `17df4d8423355f26c28fe330da84198ed77d5a7684eddd4558c3b050fef7bace` |
| sentropic `4138a0ecba9c5b37409abb5ac00f732d02b7dc8d` | `docs/governance/kit/src/governance-central.js` | `8648b0935735a386afa843e7221234406c1c61fbe48fa5bc7c4172743b0c3f1c` |
| sentropic `4138a0ecba9c5b37409abb5ac00f732d02b7dc8d` | `docs/governance/kit/src/governance-collapse.js` | `eb30e4fadbf3a045b353a700747a97941beabd5c1cf49fb6cd9e764eb5b9d3b7` |
| sentropic `4138a0ecba9c5b37409abb5ac00f732d02b7dc8d` | `docs/governance/kit/src/governance-summary.js` | `d821077ac133d229bd5835c465e9f1e7731529e7d573ccd6253fa7916a2d54cc` |
| sentropic `4138a0ecba9c5b37409abb5ac00f732d02b7dc8d` | `docs/governance/kit/src/governance-summary-layouts.json` | `44a43b5e1ee3d05968a6baf8d2731076dfb048d0cfc7ddca4ac86f8fc1b10e65` |
| sentropic `4138a0ecba9c5b37409abb5ac00f732d02b7dc8d` | `docs/governance/kit/src/governance-layout.js` | `98ca434d422a0685c68c418594452d8f768ecfd491764df992cf6c9dcb823430` |
| sentropic `4138a0ecba9c5b37409abb5ac00f732d02b7dc8d` | `docs/governance/kit/src/architecture-routing.js` | `4a181ba51080426ec77bc3dbf07ccfab1e6363f9bf5ce1363a659b0a7c47198e` |
| sentropic `4138a0ecba9c5b37409abb5ac00f732d02b7dc8d` | `docs/governance/kit/src/presentation-scenes.json` | `fce2bd5fd1805a46e4c0d7066e61c4706f52dd96a8d80808b6fab946e1744e61` |
| sentropic `4138a0ecba9c5b37409abb5ac00f732d02b7dc8d` | `docs/governance/kit/src/FrameToggle.svelte` | `9ad3b30b8ccaaf37157f13adf8feb53c1f3d1a1c3dca4b4f436166879ef45cc6` |
| graphify `618977a86a25c35e426a87f97cb9f3391cd1c654` | `src/ontology-guardian/types.ts` | `e6f9e1627bcdca53c837466424c3deb853f72e5be208b6ddaa6e07e2baa0a631` |
| graphify `618977a86a25c35e426a87f97cb9f3391cd1c654` | `src/ontology-guardian/catalog.ts` | `bd5b5d290472009196e073d0f8694774d17c263a796fcf2bc9e46b1cbffe32d8` |
| graphify `618977a86a25c35e426a87f97cb9f3391cd1c654` | `src/ontology-guardian/digests.ts` | `49cec7b137b8f9ec3ab074b7357472ba2b7204e8afa6212dc61142b6f3ec4405` |
| graphify `618977a86a25c35e426a87f97cb9f3391cd1c654` | `src/ontology-guardian/admission.ts` | `fe299c2e1d0c9c899cd9ac68a76a1ad230bdf542211dffdac05b0a2dafab2b9d` |
| graphify `618977a86a25c35e426a87f97cb9f3391cd1c654` | `src/ontology-guardian/diagnostics.ts` | `521de919cf9d0161cdd0257d63fc3c2febf93e207bb5eb57df331dcc414b71af` |
| archimatetool/archi `9e6a014f9ef6a782a7dda604ef7b4d03d2c7819a` | `com.archimatetool.model/src/com/archimatetool/model/IAccessRelationship.java` | `79eb8f693a88e585257f6808678ff03b0409456fbf9f16ca498fdfc121f8d0f3` |
| archimatetool/archi `9e6a014f9ef6a782a7dda604ef7b4d03d2c7819a` | `com.archimatetool.model/model/relationships.xml` | `82cc8d11b174f3edf700fc8d6e3e061d4d9d8e65e5ec0f3c323d94f98a2681e7` |
| archimatetool/archi `9e6a014f9ef6a782a7dda604ef7b4d03d2c7819a` | `com.archimatetool.model/model/relationships-keys.xml` | `19d86924efc3364d26c162fe4e6643f37fd9493a0effc80ce5e2aa648fb6803e` |
| archimatetool/archi `9e6a014f9ef6a782a7dda604ef7b4d03d2c7819a` | `com.archimatetool.model/model/archimate.ecore` | `6d95f268182648c4dba6802ceacf05b9b1b323624f30eb8c31282fc7be29b253` |
| archimatetool/archi `9e6a014f9ef6a782a7dda604ef7b4d03d2c7819a` | `com.archimatetool.model/LICENSE.txt` | `428f4272e912bbc3809052990c5ba1089b06382dab6e6d6a71670789bfc9bcff` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/ds-fixtures/MANIFEST.md` | `9558092fa2af669af9dcd4df6d9380e24a1cba723dbdd603ad2ebd86c6439a49` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/ds-fixtures/S2-asbuilt.json` | `7abc427f7beca5b0f87947efc9df4daf6316f24725074f47f1da2b04be76ba2e` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/ds-fixtures/S2-target.json` | `28a7271dd0bec89fa9ad435174a614ab4a40b346b10724da95736f9c55b574d9` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/ds-fixtures/S1-conversational.json` | `d9f7f7cb80894b5301e11cc7b7f0fc2775d1933aa15013152001395d716a32c7` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/ds-fixtures/S3-agentfactory.json` | `e362b9a8da84082e5389127ae463d282fb773ef8950f41017222e0b3ef9002fc` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/ds-fixtures/tint-legend.json` | `cc47a3e3a2019af8c436ce28a34d0d52d71b8439cf55a44a33f1c0239752a26d` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/engram/S2-target.semantic.json` | `46f64154bb6592d49ccda5633b2c4d4205fb1c6752ef218be31d6757923ecf91` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/engram/S2-target.view.json` | `82930614efe070bdb8e5acce3aecea29dfdb2d1ab625b7d376507f97fb6f8b50` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/engram/MANIFEST.json` | `54ef0dd0ac0e923aa99435625780902d07c3819e9c2c340868c921d1f956fd91` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/scene-metadata.mjs` | `85de8a950c66312bd1f519ea2cc04aa37dff4bf9f6f0d39e34252fd95e2b6d51` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/.generated/data.json` | `5a893cd1c69e1bb81bf4095b7472e7494ede1eb709d2c02b732af2163a1d7f2e` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/SCENES.md` | `224bcaac70e397e771d88273219483eea808c0aa31cdcdc6d61d47f645d94853` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/build-scenes.mjs` | `35f0b1ac5e24f12956ea51104a8a3190cb8849485da867dc4d2990a77342d769` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/ds-fixtures/build-fixtures.mjs` | `3dee69da67bb5569a385a6dfa15759ac27d3fa749e8d6b2a63f04e0446fec102` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/engram/build-engram.mjs` | `d6d007c97efad0f68f041c6a53a901cb6adaeea851e04c08676f419318b45caa` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/ard/decision/focus/.generated/governance-scenes.json` | `236320cec2b25466dfe46d9338f3f75c14aba3ee33c6c25d8070ffc242d5b35c` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/ard/decision/focus/.generated/figures/figures.json` | `83935a169f04ab48df155f324dee6fbf336a502fd2b8cdc260ae03c0a6962719` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/ard/decision/focus/.generated/figures/S2-target.png` | `5dffb39dd10551ae83b35fd256ccc3c65911d5aa731cdccb253605c3ac5d1c9a` |
| airbus-genair-hrpolnav `faf21b6f259f93a485994bbe03b4023763bf2597` | `docs/architecture/hrpn/ds-fixtures/reference-renders.json` | `7afee15ef473389452011d38fbaf8547973b5eed572440cc0c31ee8d921e25db` |

Additional raw-byte pins, measured directly or retained from the unchanged sealed manifest (the gate verifies each before use):

| Source | SHA-256 |
| --- | --- |
| bpmn-canvas src/profile/canonical.ts | 287d8cb87beb7384fc89a8d6141681010dcba50ee895aaadc3b31345541191ba |
| profile-parity-corpus/1/cases/jcs-key-order.json | 2a2b0ddc4eeaede4cdac346ae46d5b048b8f25d051b41785eaddbb3e4e491a84 |
| profile-parity-corpus/1/cases/jcs-escapes.json | 71a5af8cb8735f034b8411a44cc1e46090083f235509b98d1629c0020f294fdc |
| profile-parity-corpus/1/cases/jcs-numbers.json | bb22448419b5d26311f475995cb5bf3f357e90ca0983ee20f0d2018766fa4bbf |
| profile-parity-corpus/1/cases/identity-stable-id.json | 59ca51c94f5010267b2991b74fc42d7d04a004ed3890ef8c546ec016301df84f |
| profile-parity-corpus/1/manifest.json | 01b81fd9fb69f110a7f302631d6da92126bcb1672c67bea3ea68ff802df39faf |
| tests/fixtures/profile-parity-corpus.pin.json | d34ee889917b8c5ef14c8d7bbd3fa2b222d93f4ac61de4bd0b41deb5767378a2 |
| tests/fixtures/unicode-case-15.0.0.pin.json | 989aa11b6c138115a356c39867a26d8da281d2fd4b926508c72199b87fa4b762 |
| tests/fixtures/parity-corpus/index.json | 40284149ca3538b35250e5896694e7d15c80d3c3233241e0d7ac3d91266df03a |
| tests/fixtures/parity-corpus/canonical-vectors.json (workbench only) | f238aef110a43381416fd0025326f883f760dc75510a9f0cc5817415eb02d1c6 |
| #711 portable, sentropic 4138a0ec:docs/governance/governance-r11-portable.html | 831cbdee9bb5820e7e19ed55c942522a5848c402db9be0c89d87d02559bf6f35 |
| Frozen ds-fixtures/reference/S2-target.png | f606ac163c5202c8cddb7caaba97e4d748d767865a2abfb1bb2f57a7bb4ad542 |

| Additional source path (under /home/antoinefa/src) | Raw SHA-256 |
| --- | --- |
| `sentropic/.tmp/governance-unification/evidence-astra/threads/ontology/d2d.md` | `ad956900e9ddf79e639dc26332e1380961cbce88dce878527de02d188c7a97c0` |
| `graphify/.graphify/scratch/design/ontology-guardian/m3/CONSOLIDATED-M3-r3.md` | `0a022c50f77f40acb866b6c7a793de87809538a9146063ce655e856374db414d` |
| `graphify/.graphify/scratch/design/ontology-guardian/m3/review-M3-sol-r3.out` | `3fb3bf2d22fcad2c3de3a2d83322fdab7c35c3e10021debfa150882b5ffb37a5` |
| `graphify/.graphify/scratch/design/ontology-guardian/m3/review-M3-astra-r3.out` | `eb2017236c70714e4a6691d8dbaba1c650d892700af0e237b69ab89c0b383b5e` |
| `sent-tech-design-system/scratchpad/rev/dmodel-rev3.out` | `00d0571581e847181fe694e9e85e982af13e3637d8b9598b9868198f0261cd38` |
| `bpmn-canvas/src/profile/canonical.ts` | `287d8cb87beb7384fc89a8d6141681010dcba50ee895aaadc3b31345541191ba` |
| `bpmn-canvas/tests/fixtures/corpus/comments.bpmn` | `0f3b5609248ed3eb3cb6f63b8cf2c7f2ee8f4036fb9de8d52ff3d9732f731d30` |
| `bpmn-canvas/tests/fixtures/corpus/duplicate-id.bpmn` | `0b3bc8a15b3a2a265e93f4106d5f1d168973d5f343240ea17411581f63df6151` |
| `bpmn-canvas/tests/fixtures/corpus/extension-ok.bpmn` | `0f47cd0cb28482cddbbb1ed4210c1ac5ee8c0387320028186d00a62080934a69` |
| `bpmn-canvas/tests/fixtures/corpus/io-specification-incomplete.bpmn` | `ff99f2ed6e1a826d90b249a701aa29055416347c19967b6ce2f81d2be3efcf7f` |
| `bpmn-canvas/tests/fixtures/corpus/no-di.bpmn` | `f092763b04317e16565f83dfa84be412778d6372f2bbbed5715917375c2fad5f` |
| `bpmn-canvas/tests/fixtures/corpus/notation.bpmn` | `9d39d6cf37f477ee14451b035dec7e1605f6da765df90c3d51441e4f870f763d` |
| `bpmn-canvas/tests/fixtures/corpus/partial-di.bpmn` | `73c526076bfb556a7974419b4f28f7e5f512b812a9a6fe3a08afe3acd4f73795` |
| `bpmn-canvas/tests/fixtures/corpus/rogue-extension.bpmn` | `3db5a5412a5f48f14b9c6e76f1c3a7cb1760941d01ce543031c66a88e9753cef` |
| `bpmn-canvas/tests/fixtures/corpus/tiny.bpmn` | `29142ab44afc7c4d55049d2ee27bc72af2dcb36785020c634d9aa853c7f92350` |
| `bpmn-canvas/tests/fixtures/corpus/unresolved-reference.bpmn` | `43da5729c80c31fd46e0ef1c5673ce7b83e46dc01a52addf3f3daed7c9d43b0c` |


| Additional #711 source, sentropic 4138a0ecba9c5b37409abb5ac00f732d02b7dc8d | Raw SHA-256 |
| --- | --- |
| docs/governance/kit/scripts/check-browser.mjs | d0fddf3eb0ae441abcfda9dec0b6f03eeb9ee53169ab26ce257ca443e6115f84 |
| docs/governance/kit/scripts/browser-checks.mjs | 64890d902abf1ecfd9386083b5a7cab32c9226d821163ca13c21d7d974b50e2a |
| docs/governance/kit/scripts/check-performance.mjs | c603e64d0df412b0d61f79046c59d03a9cb1449b0b9d2e2f8b7b460085e03d05 |
| docs/governance/kit/scripts/check-geometry.mjs | b3b5ed9fbade3d8e47d2cc2e63f6190d95438bad3e333c2227a70f663d21d4cb |
| docs/governance/kit/src/app.css | d776e25ab66012cd6b08813adcb6a787ff9bcd36d6bca9020aac1fd483330ed5 |
| docs/governance/kit/src/architecture-layout.js | ec1547e5b22d98d2cd47bb84b1930fff4cd7fcc5e93c298074569d90b23692e9 |

The sealed JCS numbers vector expects exactly:
[1e+21,1e-7,0,5e-324,1,100000000000000000000,123456789012345680000,0.000001].
The four stable-id expectations are:
g_61b268027699fa668a9b0e3eced8130a2b2e188f426051e9ad25ebb1e33a800c,
g_0a8caa16444f4c61e14ffc4d7b77eb0dd75f8764840be0d3d7b8be550c0923d1,
g_fda08c83ba8214a3e2d869831822d1cc754d9ef15cf9b93fe975e9b48dec7a6b,
g_58599b7f84255d80c005b2dcda149676afeb0f7045dd6a162ea609ea523ac618.
These values belong to identity, not model conformance.

### 8.6 HRPN producer snapshots are distinct from frozen fixtures

Five MANIFEST source-path pins no longer describe the current producer files. They are not silently “verified” by the intact fixture copies. The corrected producer pins below were recomputed with Node from git show HRPN:path at immutable airbus-genair-hrpolnav faf21b6f259f93a485994bbe03b4023763bf2597; they also match the observed working bytes. The producer and frozen payload rows are independently resolvable from that commit. No consumer replays a mutable path, and historical manifest metadata is never used as an active producer pin:

| Producer path | Historical pin printed by frozen fixture manifest | Producer raw-byte pin at HRPN |
| --- | --- | --- |
| docs/architecture/hrpn/.generated/data.json | 1459e303d6eac96935c762143538d9f6daac519465fd42a1d8f5cc8765616591 | 5a893cd1c69e1bb81bf4095b7472e7494ede1eb709d2c02b732af2163a1d7f2e |
| docs/architecture/hrpn/scene-metadata.mjs | 2e67c2c380f50771f4d4520eb1d4110fefca1a51dd173bf10073c6216437ce68 | 85de8a950c66312bd1f519ea2cc04aa37dff4bf9f6f0d39e34252fd95e2b6d51 |
| docs/architecture/hrpn/SCENES.md | ab3ddb9208b7d3f9c35d94401c29da5bc95477ab99d4caf0fabaa34c41be237f | 224bcaac70e397e771d88273219483eea808c0aa31cdcdc6d61d47f645d94853 |
| docs/ard/decision/focus/.generated/figures/figures.json | de868091d0bf973aa3c33f82e7a095f3cf88c8ccc5879ea75a13d89c80435c4d | 83935a169f04ab48df155f324dee6fbf336a502fd2b8cdc260ae03c0a6962719 |
| docs/ard/decision/focus/.generated/figures/S2-target.png | f606ac163c5202c8cddb7caaba97e4d748d767865a2abfb1bb2f57a7bb4ad542 | 5dffb39dd10551ae83b35fd256ccc3c65911d5aa731cdccb253605c3ac5d1c9a |

Frozen ds-fixtures payloads and reference/S2-target.png retain their original hashes. The frozen target sceneHash is b631abb4e4432f43a2978e96f83f346f76fbd7bd6a2d8eea0a3340e7ca1d2d46; current producer target sceneHash is 81183292b8249aa25776768ba505e1b46b95d9a9a6fd2e5610efb247691bcef3. A historical hash in a fixture's embedded source metadata is **provenance of that frozen snapshot**, not an instruction to read the mutable producer path as if it still matched. Recovery of the old producer bytes is unverified U-HISTORY (owner HRPN); no regeneration from today's producer is accepted as the same frozen fixture.

A5's independent source docs/ard/decision/focus/.generated/governance-scenes.json still hashes to 236320cec2b25466dfe46d9338f3f75c14aba3ee33c6c25d8070ffc242d5b35c, matching its manifest. It is separately pinned; it does not overwrite A3.

### 8.7 Populated, digest-bound derived oracle

The following JSON is **the derived oracle now**, not a promise to write one later. It contains source→slot mappings, the explicit category→token assignments, exact default fold inputs, recursive hint translations, dashed ids, ten A1 summary definitions with constituents, all A5 target semantic/presentation records and expected valid diagnostic arrays.

Assignments to existing DS token names are governed synthesis data specified here, not claimed to appear inside tint-legend.json. Source raw colour evidence stays separate. The source tint legend contains no custom/outside category: those A5 meanings come from the A5 semantic records/current pinned metadata. Pixel equivalence/theme resolution remains unverified U-THEME (owner DS presentation); the table does not assert arbitrary palette colours already match the #711/HRPN pixels.

A1 starts with its five top frames collapsed, transcribed from the pinned #711 check-browser.mjs initial-state assertions. A2–A4 use explicit all-expanded initial inputs because their frozen sources declare no stored default fold list. A5 uses its seven source folds. Empty summaries in A2–A5 mean no authored summary definitions in those pinned inputs; no count label is promoted to authored text.

For A2–A4, ordering is transcribed recursively for **every** zone in the frozen zoneHierarchy: key = "entity:" + zone.id; values = zone.cards followed by zone.zones.map(child => "entity:" + child.id), with "entity:" also prefixed to each card id. Child objects are never string-coerced. All 71 parent lists / 207 direct-child references resolve to an entity whose frozen parent is that zone, with no duplicate in a list. No unrecorded gap/direction is asserted as source evidence. A5's root/PPROZ interleaving and PRODZ stretch are the concrete translation of the pinned metadata kit tree. Omitted gapAfter/cardGap/zoneGap fields mean inherited DS engine metrics. Exact pixel/geometry qualification remains a separate U-QUAL gate.

Materialization is generic: create the declared family entities/relations; create each explicitly counted root legend and its keys for that instance; select that instance's categories/order; build CategoryTokenBinding rows from its categories and the common table; resolve every occurrence reference to the retained source drawings; apply diagram-presentation@1; validate and lay out. Instance-specific content stays corpus data. There is no consumer extension, callback or local schema. A1–A4 use added ids entity:legend and entity:legend-key-<category>, after collision preflight; A5 retains entity:LEGEND and entity:legend-<category>.

A native executor must recompute counts/ids/diagnostics against this oracle. [] arrays are specified expectations, not fabricated execution receipts. Rejected diagnostic oracles are fully specified in Appendix C.

| Derived projection | Canonical bytes | SHA-256 |
| --- | --- | --- |
| Whole JSON below | 33429 | 08cae540e5535727fc1f4b7bba3aa12d84908790b6c918dc263b65560ab4f2de |
| categoryTokens only | 432 | a77e2a62ddd6d576f06005969361ee15c241789fe8a571e6195dfb5c2782b3bf |
| A1 summaries only | 2110 | e363601a0c116197a471a599e92dc94da16147f0e7e78346c1ab7c7df9a49018 |
| A5 {entities,presentationEntities} | 20532 | 527a0b18c1afee9e71591d6c2e3ef8d68294c89d5f0e593527b31a47b207a2b8 |

~~~json
{
  "schemaVersion": "m3-r4-oracle/1",
  "mappings": {
    "fixture": {
      "semanticName": "entities[].label",
      "viewTitle": "entities[].name when present and distinct",
      "kicker": "entities[].code",
      "body": "entities[].role",
      "detail": "entities[].detail",
      "footer": "entities[].footer",
      "semanticCategory": "entities[].tint ?? none",
      "strokeStyle": "relations[].style (one source drawing)",
      "semanticParent": "entities[].parent",
      "store": "true → node.tags includes store; false → no store tag, original presence archived",
      "icon": "absent in frozen fixture; do not invent"
    },
    "a1": {
      "semanticName": "nodes[].data.title; groups[].titleLines joined by one space",
      "kicker": "nodes[].data.kicker / groups[].kicker",
      "body": "nodes[].data.function",
      "detail": "nodes[].data.detail",
      "subtitle": "groups[].subtitle",
      "footer": "nodes[].data.cardFooter",
      "icon": "nodes[].data.cardIcon",
      "semanticCategory": "data.tone / group.tone",
      "strokeStyle": "absent → solid"
    },
    "a5": {
      "semanticName": "attributes.name except extension.displayTitle on PCICD/AWSCI",
      "kicker": "attributes.kicker or zone-slots.kicker",
      "body": "attributes.body",
      "detail": "attributes.detail",
      "subtitle": "zone-slots.subtitle",
      "footer": "attributes.footer or zone-slots.footer",
      "icon": "attributes.icon or zone-slots.icon",
      "semanticCategory": "attributes.tint or zone-slots.tint, absent → no category except explicit legend-none key",
      "strokeStyle": "source relation occurrence field, absent retained"
    }
  },
  "categoryTokens": {
    "genair": "st-semantic-data-category1",
    "specific": "st-semantic-feedback-warning",
    "added": "st-semantic-feedback-warning",
    "removed": "st-semantic-feedback-error",
    "risk": "st-semantic-feedback-error",
    "custom": "st-semantic-feedback-success",
    "outside": "st-semantic-feedback-warning",
    "none": "st-semantic-surface-raised",
    "neutral": "st-semantic-surface-raised",
    "proposal": "st-semantic-feedback-warning",
    "identity": "st-semantic-feedback-info"
  },
  "instances": [
    {
      "id": "A1",
      "source": "sentropic 4138a0ec:docs/governance/kit/src/presentation-scenes.json#/en/architectureScenes/central",
      "counts": {
        "node": 28,
        "container": 10,
        "legend": 1,
        "legend-key": 3,
        "contains": 36,
        "link": 50
      },
      "categories": [
        "neutral",
        "proposal",
        "identity"
      ],
      "defaultFolds": [
        "occurrence:h2a",
        "occurrence:surfaces",
        "occurrence:cluster-mesh",
        "occurrence:engram",
        "occurrence:design-system"
      ],
      "overviewFolds": [
        "occurrence:h2a",
        "occurrence:surfaces",
        "occurrence:cluster-mesh",
        "occurrence:engram",
        "occurrence:design-system"
      ],
      "summaries": [
        {
          "id": "sum:0",
          "sourceOccurrence": "occurrence:h2a",
          "targetOccurrence": "occurrence:surfaces",
          "label": "Harness and collaboration",
          "relationIds": [
            "relation:e-h2a-chat",
            "relation:e-h2a-cli",
            "relation:e-h2a-cowork"
          ],
          "strokeStyle": "solid"
        },
        {
          "id": "sum:1",
          "sourceOccurrence": "occurrence:surfaces",
          "targetOccurrence": "occurrence:cluster-mesh",
          "label": "Sessions and tools",
          "relationIds": [
            "relation:e-ai-api",
            "relation:e-cli-api",
            "relation:e-cloud-api",
            "relation:e-cloud-catalog",
            "relation:e-cowork-api"
          ],
          "strokeStyle": "solid"
        },
        {
          "id": "sum:2",
          "sourceOccurrence": "occurrence:h2a",
          "targetOccurrence": "occurrence:cluster-mesh",
          "label": "Tools for h2a",
          "relationIds": [
            "relation:e-h2a-tools"
          ],
          "strokeStyle": "solid"
        },
        {
          "id": "sum:3",
          "sourceOccurrence": "occurrence:cluster-mesh",
          "targetOccurrence": "occurrence:h2a",
          "label": "A2a messages",
          "relationIds": [
            "relation:e-mesh-h2a"
          ],
          "strokeStyle": "solid"
        },
        {
          "id": "sum:4",
          "sourceOccurrence": "occurrence:cluster-mesh",
          "targetOccurrence": "occurrence:surfaces",
          "label": "Application deployment",
          "relationIds": [
            "relation:e-infra-cloud"
          ],
          "strokeStyle": "solid"
        },
        {
          "id": "sum:5",
          "sourceOccurrence": "occurrence:engram",
          "targetOccurrence": "occurrence:cluster-mesh",
          "label": "Memory and knowledge",
          "relationIds": [
            "relation:e-eng-mem",
            "relation:e-eng-onto",
            "relation:e-eng-store"
          ],
          "strokeStyle": "solid"
        },
        {
          "id": "sum:6",
          "sourceOccurrence": "occurrence:cluster-mesh",
          "targetOccurrence": "occurrence:engram",
          "label": "Logs and metrics",
          "relationIds": [
            "relation:e-eng-observe"
          ],
          "strokeStyle": "solid"
        },
        {
          "id": "sum:7",
          "sourceOccurrence": "occurrence:engram",
          "targetOccurrence": "occurrence:design-system",
          "label": "Diagram Graphs",
          "relationIds": [
            "relation:e-eng-ds"
          ],
          "strokeStyle": "solid"
        },
        {
          "id": "sum:8",
          "sourceOccurrence": "occurrence:design-system",
          "targetOccurrence": "occurrence:cluster-mesh",
          "label": "Canvas UI",
          "relationIds": [
            "relation:e-ds-catalog",
            "relation:e-ds-comments",
            "relation:e-ds-store"
          ],
          "strokeStyle": "solid"
        },
        {
          "id": "sum:9",
          "sourceOccurrence": "occurrence:h2a",
          "targetOccurrence": "occurrence:design-system",
          "label": "Focus schema and skill",
          "relationIds": [
            "relation:e-focus-dossier"
          ],
          "strokeStyle": "solid"
        }
      ],
      "hints": {
        "grouping": [
          {
            "id": "central-roots",
            "direction": "rows",
            "items": [
              "entity:h2a",
              "entity:surfaces",
              "entity:cluster-mesh",
              "entity:engram",
              "entity:design-system"
            ]
          }
        ]
      },
      "dashedRelationIds": [],
      "expectedSemanticDiagnostics": [],
      "expectedViewDiagnostics": [],
      "qualification": "unverified U-QUAL"
    },
    {
      "id": "A2",
      "scene": "S2-asbuilt",
      "sourceSha256": "7abc427f7beca5b0f87947efc9df4daf6316f24725074f47f1da2b04be76ba2e",
      "counts": {
        "node": 41,
        "container": 17,
        "legend": 1,
        "legend-key": 4,
        "contains": 58,
        "link": 44
      },
      "categories": [
        "genair",
        "none",
        "risk",
        "specific"
      ],
      "defaultFolds": [],
      "summaries": [],
      "hints": {
        "ordering": {
          "entity:PEOPLE": [
            "entity:EMP",
            "entity:DEV"
          ],
          "entity:WS": [
            "entity:CHAT"
          ],
          "entity:GCP": [
            "entity:PROJ",
            "entity:SSMPROJ",
            "entity:PRODZ"
          ],
          "entity:PROJ": [
            "entity:LBIAP",
            "entity:NET",
            "entity:MSGZ",
            "entity:RUNZ",
            "entity:AEZ",
            "entity:STATEZ",
            "entity:VERTEXZ",
            "entity:OBSZ",
            "entity:CICDZ"
          ],
          "entity:MSGZ": [
            "entity:TOPIC",
            "entity:SUB"
          ],
          "entity:RUNZ": [
            "entity:APP",
            "entity:PUSH",
            "entity:CONS",
            "entity:CHATCLI",
            "entity:AGENT",
            "entity:QUERY",
            "entity:ADMINT"
          ],
          "entity:AEZ": [
            "entity:AEAPP"
          ],
          "entity:STATEZ": [
            "entity:DOCS",
            "entity:SESS",
            "entity:CSQL",
            "entity:BKT",
            "entity:FS"
          ],
          "entity:VERTEXZ": [
            "entity:RAG",
            "entity:GEM"
          ],
          "entity:OBSZ": [
            "entity:CLOG",
            "entity:LOGS",
            "entity:BQ",
            "entity:PHX"
          ],
          "entity:CICDZ": [
            "entity:CB",
            "entity:AR",
            "entity:TF",
            "entity:TFST"
          ],
          "entity:SSMPROJ": [
            "entity:SSM",
            "entity:IFMIR",
            "entity:BASE"
          ],
          "entity:PRODZ": [
            "entity:PRODNP"
          ],
          "entity:OUT": [
            "entity:AWSZ"
          ],
          "entity:AWSZ": [
            "entity:JENKINS",
            "entity:JFROG",
            "entity:GITHUBZ",
            "entity:GITLABZ"
          ],
          "entity:GITHUBZ": [
            "entity:CUTTER",
            "entity:AGARDEN",
            "entity:IFREPO",
            "entity:GLIBS"
          ],
          "entity:GITLABZ": [
            "entity:SCMREPO"
          ]
        }
      },
      "dashedRelationIds": [
        "relation:AEAPP__RAG__a0b5b8269cfd",
        "relation:APP__CSQL__5f0a28de3e78",
        "relation:APP__LOGS__e43083545724",
        "relation:APP__PHX__2dc85bc7391e",
        "relation:CUTTER__PRODNP__24e6dc578f0b",
        "relation:JFROG__BASE__a03f155bff51",
        "relation:SCMREPO__SSM__4e20c757a1be"
      ],
      "expectedSemanticDiagnostics": [],
      "expectedViewDiagnostics": [],
      "qualification": "unverified U-QUAL"
    },
    {
      "id": "A3",
      "scene": "S2-target",
      "sourceSha256": "28a7271dd0bec89fa9ad435174a614ab4a40b346b10724da95736f9c55b574d9",
      "counts": {
        "node": 51,
        "container": 22,
        "legend": 1,
        "legend-key": 4,
        "contains": 73,
        "link": 54
      },
      "categories": [
        "added",
        "genair",
        "none",
        "specific"
      ],
      "defaultFolds": [],
      "summaries": [],
      "hints": {
        "ordering": {
          "entity:PEOPLE": [
            "entity:EMP",
            "entity:DEV",
            "entity:HRADM"
          ],
          "entity:WS": [
            "entity:CHAT",
            "entity:DRIVE"
          ],
          "entity:GCP": [
            "entity:PROJ",
            "entity:SSMPROJ",
            "entity:PRODZ"
          ],
          "entity:PROJ": [
            "entity:NET",
            "entity:MSGZ",
            "entity:RUNZ",
            "entity:STATEZ",
            "entity:VERTEXZ",
            "entity:OBSZ",
            "entity:INGZ",
            "entity:CICDZ"
          ],
          "entity:MSGZ": [
            "entity:TOPIC",
            "entity:SUB"
          ],
          "entity:RUNZ": [
            "entity:PUSH",
            "entity:EVT",
            "entity:CONS",
            "entity:CHATCLI",
            "entity:FEEDBACK",
            "entity:ELIG",
            "entity:AGENT",
            "entity:LINK",
            "entity:QUERY"
          ],
          "entity:STATEZ": [
            "entity:DOCS",
            "entity:SESS",
            "entity:FS",
            "entity:CSQL"
          ],
          "entity:VERTEXZ": [
            "entity:RAG",
            "entity:GEM",
            "entity:ARMOR"
          ],
          "entity:OBSZ": [
            "entity:CLOG",
            "entity:LOGS",
            "entity:BQ",
            "entity:PHX"
          ],
          "entity:INGZ": [
            "entity:SYNC",
            "entity:IMPORT"
          ],
          "entity:CICDZ": [
            "entity:CB",
            "entity:AR",
            "entity:TF",
            "entity:TFST"
          ],
          "entity:SSMPROJ": [
            "entity:SSM",
            "entity:IFMIR",
            "entity:BASE"
          ],
          "entity:PRODZ": [
            "entity:PCICD",
            "entity:PSHARED",
            "entity:PDEVZ",
            "entity:PINTZ",
            "entity:PPROZ"
          ],
          "entity:PCICD": [
            "entity:PAR",
            "entity:PIAC"
          ],
          "entity:PSHARED": [
            "entity:PSVPC",
            "entity:PLIBS"
          ],
          "entity:PDEVZ": [
            "entity:PDEV"
          ],
          "entity:PINTZ": [
            "entity:PINT"
          ],
          "entity:PPROZ": [
            "entity:PPRO"
          ],
          "entity:OUT": [
            "entity:AWSZ"
          ],
          "entity:AWSZ": [
            "entity:JENKINS",
            "entity:JFROG",
            "entity:GITHUBZ",
            "entity:GITLABZ"
          ],
          "entity:GITHUBZ": [
            "entity:CUTTER",
            "entity:AGARDEN",
            "entity:IFREPO",
            "entity:GLIBS"
          ],
          "entity:GITLABZ": [
            "entity:SCMREPO"
          ]
        }
      },
      "dashedRelationIds": [],
      "expectedSemanticDiagnostics": [],
      "expectedViewDiagnostics": [],
      "qualification": "unverified U-QUAL"
    },
    {
      "id": "A4a",
      "scene": "S1-conversational",
      "sourceSha256": "d9f7f7cb80894b5301e11cc7b7f0fc2775d1933aa15013152001395d716a32c7",
      "counts": {
        "node": 23,
        "container": 17,
        "legend": 1,
        "legend-key": 5,
        "contains": 41,
        "link": 24
      },
      "categories": [
        "added",
        "genair",
        "none",
        "risk",
        "specific"
      ],
      "defaultFolds": [],
      "summaries": [],
      "hints": {
        "ordering": {
          "entity:PEOPLE": [
            "entity:EMP",
            "entity:HRADM"
          ],
          "entity:WS": [
            "entity:CHAT",
            "entity:APPSS",
            "entity:DRIVE"
          ],
          "entity:GCP": [
            "entity:PROJ",
            "entity:PRODZ"
          ],
          "entity:PROJ": [
            "entity:CXZ",
            "entity:TOOLZ",
            "entity:VAIZ",
            "entity:STATEZ",
            "entity:GOVZ"
          ],
          "entity:CXZ": [
            "entity:CXINT",
            "entity:CXAGENT",
            "entity:PLAYBOOK",
            "entity:DSTOOL"
          ],
          "entity:TOOLZ": [
            "entity:LINKF",
            "entity:RLA"
          ],
          "entity:VAIZ": [
            "entity:DATASTORE",
            "entity:GEM"
          ],
          "entity:STATEZ": [
            "entity:DOCS",
            "entity:SYNC",
            "entity:BQLOG"
          ],
          "entity:GOVZ": [
            "entity:NOIAC",
            "entity:EXPORT"
          ],
          "entity:PRODZ": [
            "entity:PDEVZ",
            "entity:PINTZ",
            "entity:PPROZ"
          ],
          "entity:PDEVZ": [
            "entity:PDEV"
          ],
          "entity:PINTZ": [
            "entity:PINT"
          ],
          "entity:PPROZ": [
            "entity:PPRO"
          ],
          "entity:OUT": [
            "entity:AWSZ"
          ],
          "entity:AWSZ": [
            "entity:GITHUBZ",
            "entity:GITLABZ"
          ],
          "entity:GITHUBZ": [
            "entity:GENTPL"
          ],
          "entity:GITLABZ": [
            "entity:SCMREPO"
          ]
        }
      },
      "dashedRelationIds": [
        "relation:APPSS__CXAGENT__5bd5623a9dfc",
        "relation:CHAT__APPSS__1b30808dad7d",
        "relation:DRIVE__SYNC__eefb74f30a11",
        "relation:EXPORT__SCMREPO__19793062b717",
        "relation:NOIAC__CXAGENT__ddde25d26cdd",
        "relation:PLAYBOOK__RLA__51f9edec990b",
        "relation:SCMREPO__PDEV__af6ca2d26ea0",
        "relation:SCMREPO__PINT__3904bbabeaf9",
        "relation:SCMREPO__PPRO__598187d83575",
        "relation:SYNC__DOCS__dc261875c2c1"
      ],
      "expectedSemanticDiagnostics": [],
      "expectedViewDiagnostics": [],
      "qualification": "unverified U-QUAL"
    },
    {
      "id": "A4b",
      "scene": "S3-agentfactory",
      "sourceSha256": "e362b9a8da84082e5389127ae463d282fb773ef8950f41017222e0b3ef9002fc",
      "counts": {
        "node": 37,
        "container": 15,
        "legend": 1,
        "legend-key": 5,
        "contains": 53,
        "link": 36
      },
      "categories": [
        "added",
        "genair",
        "none",
        "removed",
        "risk"
      ],
      "defaultFolds": [],
      "summaries": [],
      "hints": {
        "ordering": {
          "entity:LEFT": [
            "entity:USERS",
            "entity:CASB",
            "entity:IDP",
            "entity:SIEM"
          ],
          "entity:PCP": [
            "entity:PLOG",
            "entity:CONN",
            "entity:MAF",
            "entity:VPCSC",
            "entity:GAPI",
            "entity:IAM",
            "entity:AIP",
            "entity:DATAHUB"
          ],
          "entity:AIP": [
            "entity:EAI",
            "entity:SPOKE"
          ],
          "entity:EAI": [
            "entity:AUTHM",
            "entity:OBSV",
            "entity:AUDIT",
            "entity:SCC",
            "entity:GEZ",
            "entity:GEAP"
          ],
          "entity:GEZ": [
            "entity:GEUI",
            "entity:MA1",
            "entity:FEDC",
            "entity:DSTORE"
          ],
          "entity:GEAP": [
            "entity:GW",
            "entity:POL",
            "entity:MA2",
            "entity:RUNTIME"
          ],
          "entity:RUNTIME": [
            "entity:HRAGENT",
            "entity:HRTOOLS"
          ],
          "entity:SPOKE": [
            "entity:RAG",
            "entity:GEM",
            "entity:DOCS",
            "entity:SYNC",
            "entity:XIAM",
            "entity:PSL"
          ],
          "entity:DATAHUB": [
            "entity:DATAPROD",
            "entity:PIPE"
          ],
          "entity:RIGHT": [
            "entity:LAN",
            "entity:SAASZ"
          ],
          "entity:SAASZ": [
            "entity:DRIVE",
            "entity:CHAT"
          ],
          "entity:OUT": [
            "entity:AWSZ"
          ],
          "entity:AWSZ": [
            "entity:JENKINS",
            "entity:GITHUBZ",
            "entity:GITLABZ"
          ],
          "entity:GITHUBZ": [
            "entity:CUTTER"
          ],
          "entity:GITLABZ": [
            "entity:SCMREPO"
          ]
        }
      },
      "dashedRelationIds": [
        "relation:USERS__CHAT__de2bbc5b3e38",
        "relation:VPCSC__HRAGENT__8356391330d1",
        "relation:XIAM__HRAGENT__f18eca9333d3"
      ],
      "expectedSemanticDiagnostics": [],
      "expectedViewDiagnostics": [],
      "qualification": "unverified U-QUAL"
    },
    {
      "id": "A5",
      "sourceSha256": "46f64154bb6592d49ccda5633b2c4d4205fb1c6752ef218be31d6757923ecf91",
      "counts": {
        "node": 33,
        "container": 18,
        "legend": 1,
        "legend-key": 4,
        "contains": 51,
        "link": 31
      },
      "categories": [
        "genair",
        "custom",
        "outside",
        "none"
      ],
      "defaultFolds": [
        "occurrence:PCICD",
        "occurrence:MSGZ",
        "occurrence:VERTEXZ",
        "occurrence:OBSZ",
        "occurrence:INGZ",
        "occurrence:GENSRC",
        "occurrence:AWSCI"
      ],
      "summaries": [],
      "dashedRelationIds": [],
      "entities": {
        "entity:PEOPLE": {
          "id": "entity:PEOPLE",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Users and operators"
            }
          }
        },
        "entity:WS": {
          "id": "entity:WS",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Google Workspace"
            }
          }
        },
        "entity:GCP": {
          "id": "entity:GCP",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Google Cloud Platform"
            }
          }
        },
        "entity:PRODZ": {
          "id": "entity:PRODZ",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "PROD landing zone"
            }
          }
        },
        "entity:PPROZ": {
          "id": "entity:PPROZ",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "HRPN pro project"
            }
          }
        },
        "entity:MSGZ": {
          "id": "entity:MSGZ",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Pub/Sub"
            },
            "category": {
              "kind": "text",
              "value": "outside"
            }
          }
        },
        "entity:RUNZ": {
          "id": "entity:RUNZ",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Cloud Run"
            }
          }
        },
        "entity:STATEZ": {
          "id": "entity:STATEZ",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Storage and state"
            }
          }
        },
        "entity:VERTEXZ": {
          "id": "entity:VERTEXZ",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Vertex AI"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:INGZ": {
          "id": "entity:INGZ",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Ingestion"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:PSHARED": {
          "id": "entity:PSHARED",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "PROD shared projects"
            }
          }
        },
        "entity:PCICD": {
          "id": "entity:PCICD",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "CI/CD"
            }
          }
        },
        "entity:OBSZ": {
          "id": "entity:OBSZ",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Observability"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:OUT": {
          "id": "entity:OUT",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "AWS"
            }
          }
        },
        "entity:GITHUBZ": {
          "id": "entity:GITHUBZ",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Airbus GitHub"
            }
          }
        },
        "entity:GENSRC": {
          "id": "entity:GENSRC",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "GenAiR sources"
            },
            "category": {
              "kind": "text",
              "value": "genair"
            }
          }
        },
        "entity:GITLABZ": {
          "id": "entity:GITLABZ",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Airbus GitLab"
            }
          }
        },
        "entity:AWSCI": {
          "id": "entity:AWSCI",
          "profile": "generic@2",
          "type": "container",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "CI/CD"
            }
          }
        },
        "entity:LEGEND": {
          "id": "entity:LEGEND",
          "profile": "generic@2",
          "type": "legend",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Legend"
            }
          }
        },
        "entity:EMP": {
          "id": "entity:EMP",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Employees · HR"
            }
          }
        },
        "entity:DEV": {
          "id": "entity:DEV",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Developers · admin"
            }
          }
        },
        "entity:HRADM": {
          "id": "entity:HRADM",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "HR · content owners"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:CHAT": {
          "id": "entity:CHAT",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Chat app"
            }
          }
        },
        "entity:DRIVE": {
          "id": "entity:DRIVE",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Drive · source"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:TOPIC": {
          "id": "entity:TOPIC",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Pub/Sub · topic"
            },
            "category": {
              "kind": "text",
              "value": "outside"
            }
          }
        },
        "entity:SUB": {
          "id": "entity:SUB",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Pub/Sub · push"
            },
            "category": {
              "kind": "text",
              "value": "outside"
            }
          }
        },
        "entity:APP": {
          "id": "entity:APP",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Backend · FastAPI"
            },
            "category": {
              "kind": "text",
              "value": "genair"
            }
          }
        },
        "entity:AGENT": {
          "id": "entity:AGENT",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "ADK agent · RAG tools"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:CHATAPI": {
          "id": "entity:CHATAPI",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Google Chat · API"
            },
            "category": {
              "kind": "text",
              "value": "outside"
            }
          }
        },
        "entity:DOCS": {
          "id": "entity:DOCS",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Bucket · documents"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:FS": {
          "id": "entity:FS",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Firestore · sessions"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:RAG": {
          "id": "entity:RAG",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "RAG Engine"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:GEM": {
          "id": "entity:GEM",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Model · Gemini"
            }
          }
        },
        "entity:ARMOR": {
          "id": "entity:ARMOR",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Model Armor"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:SYNC": {
          "id": "entity:SYNC",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Job · Drive sync"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:IMPORT": {
          "id": "entity:IMPORT",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Job · RAG import"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:PSSM": {
          "id": "entity:PSSM",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Repo · SSM"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:PAR": {
          "id": "entity:PAR",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Registry · PROD"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:PIAC": {
          "id": "entity:PIAC",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "IaC · WIF"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:PLIBS": {
          "id": "entity:PLIBS",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Libs · PyPI"
            },
            "category": {
              "kind": "text",
              "value": "genair"
            }
          }
        },
        "entity:CLOG": {
          "id": "entity:CLOG",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Logging · audit"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:LOGS": {
          "id": "entity:LOGS",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Logs · 1 year"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:BQ": {
          "id": "entity:BQ",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "BigQuery · linked"
            },
            "category": {
              "kind": "text",
              "value": "genair"
            }
          }
        },
        "entity:PHX": {
          "id": "entity:PHX",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Tracing · Phoenix"
            },
            "category": {
              "kind": "text",
              "value": "genair"
            }
          }
        },
        "entity:PSVPC": {
          "id": "entity:PSVPC",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Network · SVPC"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:CUTTER": {
          "id": "entity:CUTTER",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Template · GenAiR"
            },
            "category": {
              "kind": "text",
              "value": "genair"
            }
          }
        },
        "entity:AGARDEN": {
          "id": "entity:AGARDEN",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Agents · template"
            },
            "category": {
              "kind": "text",
              "value": "genair"
            }
          }
        },
        "entity:IFREPO": {
          "id": "entity:IFREPO",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "IaC · modules"
            },
            "category": {
              "kind": "text",
              "value": "genair"
            }
          }
        },
        "entity:GLIBS": {
          "id": "entity:GLIBS",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Libs · GenAiR"
            },
            "category": {
              "kind": "text",
              "value": "genair"
            }
          }
        },
        "entity:SCMREPO": {
          "id": "entity:SCMREPO",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Repo · SCM"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            }
          }
        },
        "entity:JENKINS": {
          "id": "entity:JENKINS",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "CI · Jenkins"
            }
          }
        },
        "entity:JFROG": {
          "id": "entity:JFROG",
          "profile": "generic@2",
          "type": "node",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Registry · JFrog"
            }
          }
        },
        "entity:legend-genair": {
          "id": "entity:legend-genair",
          "profile": "generic@2",
          "type": "legend-key",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "GenAiR standard"
            },
            "category": {
              "kind": "text",
              "value": "genair"
            },
            "description": {
              "kind": "text",
              "value": "GenAiR template, unchanged"
            }
          }
        },
        "entity:legend-custom": {
          "id": "entity:legend-custom",
          "profile": "generic@2",
          "type": "legend-key",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "GenAiR customisation"
            },
            "category": {
              "kind": "text",
              "value": "custom"
            },
            "description": {
              "kind": "text",
              "value": "within the template frame"
            }
          }
        },
        "entity:legend-outside": {
          "id": "entity:legend-outside",
          "profile": "generic@2",
          "type": "legend-key",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Specific for HRPN"
            },
            "category": {
              "kind": "text",
              "value": "outside"
            },
            "description": {
              "kind": "text",
              "value": "added outside the template"
            }
          }
        },
        "entity:legend-none": {
          "id": "entity:legend-none",
          "profile": "generic@2",
          "type": "legend-key",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Managed service"
            },
            "category": {
              "kind": "text",
              "value": "none"
            },
            "description": {
              "kind": "text",
              "value": "Google or third-party"
            }
          }
        }
      },
      "presentationEntities": {
        "occurrence:PEOPLE": {
          "form": "container",
          "text": {
            "kicker": "PPL",
            "subtitle": "Employees HR · Developers admin · HR content owners",
            "footer": "scope: Users and operators"
          },
          "icon": "people"
        },
        "occurrence:WS": {
          "form": "container",
          "text": {
            "kicker": "GWS",
            "subtitle": "Chat app · Drive source",
            "footer": "service: Google Workspace"
          },
          "icon": "window"
        },
        "occurrence:GCP": {
          "form": "container",
          "text": {
            "kicker": "GOOGLE CLOUD",
            "subtitle": "PROD landing zone",
            "footer": "service: Google Cloud"
          },
          "icon": "cloud"
        },
        "occurrence:PRODZ": {
          "form": "container",
          "text": {
            "kicker": "GCP PROJECT (PROD)",
            "subtitle": "app_code (to provision)",
            "footer": "service: GCP project (PROD)"
          },
          "icon": "server"
        },
        "occurrence:PPROZ": {
          "form": "container",
          "text": {
            "kicker": "GCP PROJECT (PROD)",
            "subtitle": "project_id_pro",
            "footer": "service: GCP project (PROD)"
          },
          "icon": "server"
        },
        "occurrence:MSGZ": {
          "form": "container",
          "text": {
            "kicker": "PS",
            "subtitle": "Pub/Sub topic · Pub/Sub push",
            "footer": "service: Pub/Sub"
          },
          "icon": "link",
          "categoryRef": "entity:legend-outside"
        },
        "occurrence:RUNZ": {
          "form": "container",
          "text": {
            "kicker": "HRPN",
            "subtitle": "hrpn-ragengine-agent",
            "footer": "repo: HRPN"
          },
          "icon": "server"
        },
        "occurrence:STATEZ": {
          "form": "container",
          "text": {
            "kicker": "HRPN",
            "subtitle": "Bucket documents · Firestore sessions",
            "footer": "repo: HRPN"
          },
          "icon": "db"
        },
        "occurrence:VERTEXZ": {
          "form": "container",
          "text": {
            "kicker": "VAI",
            "subtitle": "RAG Engine · Model Gemini · Model Armor",
            "footer": "service: Vertex AI"
          },
          "icon": "brain",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:INGZ": {
          "form": "container",
          "text": {
            "kicker": "HRPN",
            "subtitle": "Job Drive sync · Job RAG import",
            "footer": "repo: HRPN"
          },
          "icon": "server",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:PSHARED": {
          "form": "container",
          "text": {
            "kicker": "GENAI PLATFORM",
            "subtitle": "CI/CD · Observability · Network SVPC",
            "footer": "service: GenAI platform"
          },
          "icon": "server"
        },
        "occurrence:PCICD": {
          "form": "container",
          "text": {
            "kicker": "GENAI PCP PLATFORM",
            "subtitle": "project_id_cicd",
            "footer": "service: GenAI PCP Platform"
          },
          "icon": "server"
        },
        "occurrence:OBSZ": {
          "form": "container",
          "text": {
            "kicker": "GENAI PCP PLATFORM",
            "subtitle": "Logging audit · Logs 1 year · BigQuery linked · Tracing Phoenix",
            "footer": "service: GenAI PCP Platform"
          },
          "icon": "shield",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:OUT": {
          "form": "container",
          "text": {
            "kicker": "OUTSIDE GCP",
            "subtitle": "Airbus GitHub · Airbus GitLab · CI/CD",
            "footer": "scope: Outside GCP"
          },
          "icon": "link"
        },
        "occurrence:GITHUBZ": {
          "form": "container",
          "text": {
            "kicker": "GH",
            "subtitle": "github.airbus.corp",
            "footer": "service: Airbus GitHub"
          },
          "icon": "link"
        },
        "occurrence:GENSRC": {
          "form": "container",
          "text": {
            "kicker": "GENAIR",
            "subtitle": "Template GenAiR · Agents template · IaC modules · Libs GenAiR",
            "footer": "repo: GenAiR"
          },
          "icon": "server",
          "categoryRef": "entity:legend-genair"
        },
        "occurrence:GITLABZ": {
          "form": "container",
          "text": {
            "kicker": "AIRBUS SCM",
            "subtitle": "SCM",
            "footer": "service: Airbus SCM"
          },
          "icon": "link"
        },
        "occurrence:AWSCI": {
          "form": "container",
          "text": {
            "kicker": "AIRBUS AWS",
            "subtitle": "CI Jenkins · Registry JFrog",
            "footer": "service: Airbus AWS"
          },
          "icon": "server"
        },
        "occurrence:LEGEND": {
          "form": "legend",
          "text": {
            "kicker": "HRPN",
            "subtitle": "Card tints and link styles of this scene"
          },
          "icon": "window"
        },
        "occurrence:EMP": {
          "form": "card",
          "text": {
            "kicker": "USR",
            "body": "HR users and employees",
            "detail": "ask HR policy questions in Chat",
            "footer": "actor: Airbus employees"
          },
          "icon": "people"
        },
        "occurrence:DEV": {
          "form": "card",
          "text": {
            "kicker": "DEV",
            "body": "HRPN developers (2 authors)",
            "detail": "git push · Terraform",
            "footer": "actor: HRPN team"
          },
          "icon": "people"
        },
        "occurrence:HRADM": {
          "form": "card",
          "text": {
            "kicker": "OWN",
            "body": "Policy owners (AAI HR)",
            "detail": "approve documents in Drive",
            "footer": "actor: AAI HR"
          },
          "icon": "people",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:CHAT": {
          "form": "card",
          "text": {
            "kicker": "CHT",
            "body": "HR Policy Navigator",
            "detail": "Chat spaces (BRD-ACC-010)",
            "footer": "service: Google Workspace"
          },
          "icon": "window"
        },
        "occurrence:DRIVE": {
          "form": "card",
          "text": {
            "kicker": "DRV",
            "body": "restricted HR policy folder",
            "detail": "approved PDFs only",
            "footer": "service: Google Workspace"
          },
          "icon": "window",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:TOPIC": {
          "form": "card",
          "text": {
            "kicker": "TOP",
            "body": "hrpn-gchat-events",
            "detail": "publisher identity: gate G1",
            "footer": "repo: HRPN"
          },
          "icon": "link",
          "categoryRef": "entity:legend-outside"
        },
        "occurrence:SUB": {
          "form": "card",
          "text": {
            "kicker": "SUB",
            "body": "hrpn-gchat-events-sub",
            "detail": "OIDC · dedicated push SA",
            "footer": "repo: HRPN"
          },
          "icon": "link",
          "categoryRef": "entity:legend-outside"
        },
        "occurrence:APP": {
          "form": "card",
          "text": {
            "kicker": "API",
            "body": "get_fast_api_app()",
            "detail": "Python · GenAiR template server",
            "footer": "repo: HRPN"
          },
          "icon": "server",
          "categoryRef": "entity:legend-genair"
        },
        "occurrence:AGENT": {
          "form": "card",
          "text": {
            "kicker": "AGT",
            "body": "root_agent (HR prompt)",
            "detail": "rag_query · format_links · scope",
            "footer": "repo: HRPN"
          },
          "icon": "robot",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:CHATAPI": {
          "form": "card",
          "text": {
            "kicker": "GCH",
            "body": "POST /gchat-push · reply",
            "detail": "event check · dedup · rating",
            "footer": "repo: HRPN"
          },
          "icon": "server",
          "categoryRef": "entity:legend-outside"
        },
        "occurrence:DOCS": {
          "form": "card",
          "text": {
            "kicker": "DOC",
            "body": "hrpn-ragengine-docs",
            "detail": "fed by the Drive sync job",
            "footer": "repo: HRPN"
          },
          "icon": "db",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:FS": {
          "form": "card",
          "text": {
            "kicker": "FS",
            "body": "hrpn-sessions (Native)",
            "detail": "FirestoreSessionService · TTL 1 y",
            "footer": "repo: HRPN"
          },
          "icon": "db",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:RAG": {
          "form": "card",
          "text": {
            "kicker": "RAG",
            "body": "corpus hr_policies",
            "detail": "RagManaged Basic · embed-005",
            "footer": "service: Vertex AI"
          },
          "icon": "brain",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:GEM": {
          "form": "card",
          "text": {
            "kicker": "LLM",
            "body": "pinned Gemini Flash",
            "detail": "upgrade with regression tests",
            "footer": "service: Vertex AI"
          },
          "icon": "brain"
        },
        "occurrence:ARMOR": {
          "form": "card",
          "text": {
            "kicker": "MA",
            "body": "prompt + answer screening",
            "detail": "PROD availability: unknown",
            "footer": "service: Vertex AI"
          },
          "icon": "shield",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:SYNC": {
          "form": "card",
          "text": {
            "kicker": "SYN",
            "body": "drive-sync Cloud Run job",
            "detail": "read-only SA · delta copy",
            "footer": "repo: HRPN"
          },
          "icon": "server",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:IMPORT": {
          "form": "card",
          "text": {
            "kicker": "IMP",
            "body": "rag.import_files() job",
            "detail": "delta indexing · 24 h SLA",
            "footer": "repo: HRPN"
          },
          "icon": "server",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:PSSM": {
          "form": "card",
          "text": {
            "kicker": "PSM",
            "body": "Source Manager (PROD)",
            "detail": "ssm = cicd project",
            "footer": "repo: HRPN"
          },
          "icon": "link",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:PAR": {
          "form": "card",
          "text": {
            "kicker": "PAR",
            "body": "app-container-images",
            "detail": "+ app-container-images-noprod",
            "footer": "repo: HRPN"
          },
          "icon": "db",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:PIAC": {
          "form": "card",
          "text": {
            "kicker": "WIF",
            "body": "iac-sa + iac-state bucket",
            "detail": "pool wif-<app_code>-prod-cicd",
            "footer": "repo: HRPN"
          },
          "icon": "shield",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:PLIBS": {
          "form": "card",
          "text": {
            "kicker": "PLB",
            "body": "prj-libs-71f1 python-repository",
            "detail": "GenAiR libs for PROD builds",
            "footer": "service: GenAI platform"
          },
          "icon": "db",
          "categoryRef": "entity:legend-genair"
        },
        "occurrence:CLOG": {
          "form": "card",
          "text": {
            "kicker": "LOG",
            "body": "structured conversation log",
            "detail": "PII scrubbed (BRD-HR-014)",
            "footer": "repo: HRPN"
          },
          "icon": "shield",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:LOGS": {
          "form": "card",
          "text": {
            "kicker": "FBK",
            "body": "hrpn-logbucket + hrpn-sink",
            "detail": "365 d (DAT-015) · 120 d today",
            "footer": "repo: HRPN"
          },
          "icon": "shield",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:BQ": {
          "form": "card",
          "text": {
            "kicker": "BQ",
            "body": "hrpn_user_feedback_ds",
            "detail": "linked dataset on log bucket",
            "footer": "repo: HRPN"
          },
          "icon": "shield",
          "categoryRef": "entity:legend-genair"
        },
        "occurrence:PHX": {
          "form": "card",
          "text": {
            "kicker": "PHX",
            "body": "module cloud_run_phoenix",
            "detail": "no instrumentation library",
            "footer": "repo: HRPN"
          },
          "icon": "shield",
          "categoryRef": "entity:legend-genair"
        },
        "occurrence:PSVPC": {
          "form": "card",
          "text": {
            "kicker": "SVP",
            "body": "Shared VPC host project",
            "detail": "networks dev / int / pro",
            "footer": "service: GenAI platform"
          },
          "icon": "cloud",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:CUTTER": {
          "form": "card",
          "text": {
            "kicker": "GEN",
            "body": "GenAiR-Cutter 26.9.0",
            "detail": "Agent Engine · no frontend",
            "footer": "repo: GenAiR-Cutter"
          },
          "icon": "link",
          "categoryRef": "entity:legend-genair"
        },
        "occurrence:AGARDEN": {
          "form": "card",
          "text": {
            "kicker": "AGD",
            "body": "GenAiR-AgentGarden (main)",
            "detail": "ragengine-agent · Cutter submodule",
            "footer": "repo: GenAiR-AgentGarden"
          },
          "icon": "link",
          "categoryRef": "entity:legend-genair"
        },
        "occurrence:IFREPO": {
          "form": "card",
          "text": {
            "kicker": "GIF",
            "body": "genair-infra-factory v1.8.3",
            "detail": "PROD: GitHub · POD: SSM mirror",
            "footer": "repo: genair-infra-factory"
          },
          "icon": "server",
          "categoryRef": "entity:legend-genair"
        },
        "occurrence:GLIBS": {
          "form": "card",
          "text": {
            "kicker": "LIB",
            "body": "genair-* Python packages",
            "detail": "built by Jenkins → Artifactory",
            "footer": "repo: GenAiR libs"
          },
          "icon": "link",
          "categoryRef": "entity:legend-genair"
        },
        "occurrence:SCMREPO": {
          "form": "card",
          "text": {
            "kicker": "GIT",
            "body": "HRPN PROD repository",
            "detail": "host open: GitLab or GitHub",
            "footer": "repo: HRPN"
          },
          "icon": "link",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:JENKINS": {
          "form": "card",
          "text": {
            "kicker": "JK",
            "body": "oc.jenkins 2b82-devops",
            "detail": "GenAiR jobs · PROD pipelines",
            "footer": "service: Jenkins on AWS"
          },
          "icon": "server"
        },
        "occurrence:JFROG": {
          "form": "card",
          "text": {
            "kicker": "JF",
            "body": "Artifactory 2b82",
            "detail": "r-8cf1-genair-pypi-local",
            "footer": "service: JFrog Artifactory"
          },
          "icon": "db"
        },
        "occurrence:legend-genair": {
          "form": "legend-key",
          "text": {
            "kicker": "TINT · BLUE",
            "body": "GenAiR template, unchanged",
            "detail": "standard GenAiR code and service",
            "footer": "tint: genair"
          },
          "icon": "window",
          "categoryRef": "entity:legend-genair"
        },
        "occurrence:legend-custom": {
          "form": "legend-key",
          "text": {
            "kicker": "TINT · GREEN",
            "body": "within the template frame",
            "detail": "configured, data services included",
            "footer": "tint: custom"
          },
          "icon": "window",
          "categoryRef": "entity:legend-custom"
        },
        "occurrence:legend-outside": {
          "form": "legend-key",
          "text": {
            "kicker": "TINT · YELLOW",
            "body": "added outside the template",
            "detail": "not provided by GenAiR",
            "footer": "tint: outside"
          },
          "icon": "window",
          "categoryRef": "entity:legend-outside"
        },
        "occurrence:legend-none": {
          "form": "legend-key",
          "text": {
            "kicker": "NO TINT",
            "body": "Google or third-party",
            "detail": "managed service: no fill",
            "footer": "tint: none"
          },
          "icon": "window",
          "categoryRef": "entity:legend-none"
        }
      },
      "legendOrder": [
        "entity:legend-genair",
        "entity:legend-custom",
        "entity:legend-outside",
        "entity:legend-none"
      ],
      "hints": {
        "grouping": [
          {
            "id": "root",
            "direction": "columns",
            "items": [
              {
                "id": "left",
                "direction": "rows",
                "items": [
                  "entity:PEOPLE",
                  "entity:WS",
                  "entity:LEGEND"
                ]
              },
              {
                "id": "right",
                "direction": "rows",
                "stretch": true,
                "items": [
                  "entity:GCP",
                  "entity:OUT"
                ]
              }
            ]
          },
          {
            "id": "PRODZ",
            "direction": "rows",
            "stretch": true,
            "items": [
              "entity:PPROZ",
              "entity:PSHARED"
            ]
          },
          {
            "id": "PPROZ",
            "direction": "rows",
            "items": [
              {
                "id": "PPROZ-row",
                "direction": "columns",
                "items": [
                  {
                    "id": "PPROZ-left",
                    "direction": "rows",
                    "items": [
                      "entity:MSGZ",
                      "entity:INGZ"
                    ]
                  },
                  "entity:RUNZ",
                  {
                    "id": "PPROZ-right",
                    "direction": "rows",
                    "items": [
                      "entity:STATEZ",
                      "entity:VERTEXZ"
                    ]
                  }
                ]
              }
            ]
          },
          {
            "id": "RUNZ",
            "direction": "rows",
            "items": [
              "entity:CHATAPI",
              "entity:APP",
              "entity:AGENT"
            ]
          },
          {
            "id": "OUT",
            "direction": "columns",
            "items": [
              "entity:GITHUBZ",
              "entity:GITLABZ",
              "entity:AWSCI"
            ]
          }
        ]
      },
      "expectedSemanticDiagnostics": [],
      "expectedViewDiagnostics": [],
      "qualification": "unverified U-QUAL"
    }
  ]
}
~~~

Hash procedure: RFC 8785 of the parsed JSON object (no trailing newline), then SHA-256. Each subprojection above is the exact named JSON value; A5 uses the two-key object shown in its label. No file hash is substituted for a derived projection hash. A future corpus artifact must copy these values or publish a new governed oracle revision with a recorded reason; it may not silently redefine expected mappings/counts.

### 8.8 Acceptance and ownership

M1 checks semantic/view validity, leak invariance, typed counts, every per-occurrence style, summary definitions/activation, A5 field equality, migrations and frozen vectors. A7 adds the ArchiMate full tuple corpus and UML multiplicity/stereotype corpus. Actual execution/receipt collection is unverified U-QUAL; this file records no pass verdict. M2/M3 consume the same pinned fixtures for visual/interactive gates and preserve their source identity.

## 9. Architecture landing remains settled

Card diagrams A1–A5 land on **generic@2 plus diagram-presentation@1**. ArchiMate assertions land on **archimate@2**, using the same presentation contract when drawn as cards. architecture@1 remains withdrawn.

A1 and HRPN sources assert nodes/containers/contains/labelled links and semantic categories, not ArchiMate layer/aspect/matrix assertions. Their ArchiMate cells are therefore absent, not partial. The source generic@1 graphs migrate with explicit value-preserving conversion; forcing an ArchiMate interpretation would invent assertions absent from their producers. The study's central governance-routing instance likewise projects to the generic family.

The landing does not decide profile retention cost: generic@1, archimate@1, bpmn@1 and uml@1 remain readable/regression-tested under any landing. Both family choices can share the same governed presentation contract, so no “one fragment versus three copies” cost advantage is claimed. The owner already chose the @2 migration identities; that decision is not reopened.

## 10. Delivery stages and preserved workload

S1 = development code/data/schema/corpus drafts, outside the catalog.
S2 = qualified profile/contract publication only after full G0 §5.5 admission, all dependency/identity/adapter receipts included.
S3 = package release/publication under the owning project's release authority.
No stage follows merely from writing this specification.

| Milestone | Scope and gate |
| --- | --- |
| M1 Model/executor/view | Implement §5 and qualified family data, explicit @1→@2 migrations, typed presentation join, folds/measurement/hints. Build/check/package-scoped tests; self-validation and all A1–A5/A7 oracles including rejected cases; native legacy arrays unchanged; G0 vectors exact; no code/file/pin leak; no extra publishable package. A′-dependent UML/ArchiMate subgates remain explicitly blocked by the corresponding unverified dependencies, not reported done. |
| M2 Presentation | Pixel equality against actual #711 and pinned HRPN figures, fixed 460×200 geometry, no ellipsis, shared LineLayout, one duotone registry, category token resolution and legend/accessibility text. REQUIREMENTS and pinned kit bytes are the authority; component schema/rendering qualification belongs to DS. |
| M3 Interaction | Every interactive transition validates, conserves scene items/exclusions, reflows without collision, reroutes, keeps fixed boxes and document revision, and satisfies **600 interactions including 240 stress toggles**, worst interaction <1.8 seconds, no continuous idle work, no raised timeouts. Workload enumeration below is mandatory. |
| M4 Integration | xyflow (Svelte Flow) custom nodes with handles and standalone embedding; no consumer presentation patches. Adoption/qualification is separate from package release. |
| M5 Export | Owning export spec gates folds, exact authored summaries/constituents, styles and ids on re-import; BPMN XML stays under A′. |
| M6 Editing | RT-1 before rich-text editing; host-applied edge reconnection/inline labels under Track 01M5F3XSAJC2H6S9ZREP7JFFJ6; refused proposals change nothing; BPMN stays with its parity owner. |

The M3 workload transcribes the **actual #711 check-browser.mjs/browser-checks.mjs** workload, preserving its report units: **600 interactions total, of which 240 are stress toggles**. No source workload is invented from unrelated scene counts.

| Reported interaction class | Pinned source enumeration | Count |
| --- | --- | --- |
| Frame-control traversal | 8 contexts (desktop/mobile × fr/en × light/dark), 10 frames, 3 expected aria-expanded states per frame | 240 |
| Mixed-fold latency | 8 contexts × [surfaces,engram,design-system,cm-catalog] | 32 |
| In-frame DS icon buttons | 4 desktop contexts × 10 frames × 2 expected states | 80 |
| Keyboard then mouse focus | One compound focus-visible case in each desktop context | 4 |
| Touch pinch | One pinch case in each mobile context | 4 |
| Stress toggles | fr/en, 120 each; control index (i*7+floor(i/11)) % controls.count | 240 |
| **Total** | 360 other reported interactions + 240 stress toggles | **600** |

Frame order is exactly h2a, surfaces, cluster-mesh, cm-catalog, cat-mcp, cm-storage, cm-security, cm-cluster, engram, design-system. Traversal states are true,false,true; desktop icon-button states false,true. Each stress language uses its fresh browser/context and the source's collapsed starting state. Every latency gate remains strictly below 1800 ms; no timeout is raised. Offline/no-request and idle-work checks are retained. Browser setup/navigation/global actions are retained as source setup/assertions rather than silently re-counted to replace required report entries.

The same model/projection is additionally exercised on A2–A5 by their corpus gates; those cases do not substitute for or reduce the owner-validated #711 600/240 workload.

The owner freezes the totals/budget/idle rule; the per-action measurement artifact and timings are unverified U-INTERACTION (owner DS M3). No authoring-time timing claim appears here. Own JS and offline/no CDN apply to every stage; 32 MB remains an order of magnitude, not a ceiling.

## 11. Finding response and remaining evidence

### 11.1 Contract response crosswalk (authorship record, not an assessment)

| Finding group | Original identifiers | Specification response |
| --- | --- | --- |
| Presentation in graph | Sol N1; Astra 1; DS R3-B1 | §§1.2–1.3/3.1–3.6: all drawing fields in typed view/contract; categories remain semantic; digest invariance. |
| Executable composition | Sol N2; Astra 2; DS T1 | §3.2 closed G0 contract artifact, explicit join/application, selectors/conflicts and four family witnesses; no profileRefs augmentation or S-2 redeclaration. |
| Profile identity/completion | Sol N3/N4; Astra 3/4; DS R3-B4/T1 | archimate@2/uml@2, §3.9 pair matrix and §3.11 K6 carrier, §3.13 migrations and coexistence; exact source/endpoint/qualification dependencies stay unverified rather than arity-only coverage. |
| Incompatible bounds | Sol N5; Astra 9; DS T2 | §3.13 same-kind/different-kind conflicts both atomically refuse; original retained, no invalid partial target. |
| Authored summaries/style | Sol N6; Astra 10; DS R3-B5 | §4.5 occurrence/style-specific constituents, active-key uniqueness after projection, Appendix B.4/B.5 worked witnesses. |
| G0 closed mapping/identities | Sol N7; Astra 7; DS T7 | §7.4 exact record/payload/lineage/bindings, full base evidence arm, concrete fixture specimens; production lookups explicitly unverified U-ID. |
| Generated BPMN admission | Sol N8; Astra 6 | §7.4 requires every implementing-library/proof-set/selection parity receipt plus bijection; any missing receipt refuses. |
| Oracle/matrix/source pins | Sol N9/N10; Astra 8; DS T3/T6/R3-B2 | §8 actual #711 hashes/counts, split HRPN columns, separate current producer pins, concrete digest-bound derived oracle and summary constituents; measured coverage distinguished from target. |
| A5 authored field retention | Sol N11; Astra 11; DS T4 | §8.4 four exact key records and §8.7 all 56 native semantic/presentation targets; kicker/footer/icon values have direct native destinations. |
| c14n vectors | Sol N12; Astra 5; DS R3-B3 | §6 and §8.5 bind sealed jcs-* and identity-stable-id; workbench remains separate; 610c0353 parity retained. |
| Workload | Sol N13; Astra 12; DS R3-B6 | §10 source-enumerated 600 interactions including 240 stress toggles, <1.8 s, no idle work. |
| Diagnostics | Sol N14; Astra 13; DS T5/T8 | §5.3 legacy behaviour/ordering preserved; Appendix C literal complete arms/inventory includes quantity-above-max and .target endpoint path; adapter schema qualification explicit. |
| Quotes/cost/landing | DS R3-M1; consolidated §9 | Exact relay quotation and supplied owner spelling distinguished; no 32 MB ceiling or unsupported copy-cost comparison; §9 generic@2/archimate@2 landing kept. |
| r4 PARTIAL — ArchiMate completion | r4 closure table; Sol N3 / Astra 4 / DS T1; targeted owner follow-up on the r5 view gap | §§3.9.1–3.9.2/4.4/A.4/B.7/C.6: full declaration and shared relation-target carrier, including RelationRef view provenance, finite fold witnesses and a worked relation-to-relation projection. Publication remains gated by U-AM/U-AM-ENDPOINT/U-QUAL. |
| r4 PARTIAL — UML completion | r4 closure table; Sol N3 / Astra 4 / DS T1 | §§3.11.1/A.4: exact K6 schema registration interpretation, all class-diagram attributes/roles/constraints, exclusive aggregation, unique extends, K1 diagnostics and explicit pinned-fixture migration. Execution remains U-KERNEL/U-QUAL. |
| r4 PARTIAL — G0 closed mapping | r4 closure table; Sol N7 / Astra 7 / DS T7 | §7.4/A.3: exact closed records/envelopes, mirrored identities/digests/lineage, defined fixture references, all artifact/asset preimages and recalculated external P-ENTRY. Production lookups/admission remain U-ID/U-QUAL. |
| r4 PARTIAL — Populated oracle | r4 closure table; Sol N9 / Astra 8 / DS T3 | §8.7: 71 recursively derived frozen-parent orderings / 207 resolvable direct children; all projection sizes/hashes recalculated. Expected arrays remain authored corpus values. |
| r4 PARTIAL — HRPN producer pins | r4 closure table; DS T3 | §§8.5–8.6: every HRPN payload/producer path is pinned to immutable HRPN commit faf21b6f259f93a485994bbe03b4023763bf2597 and independently rehashed. Only recovery of superseded historical producer bytes remains U-HISTORY. |
| r4 MAJOR — Fifteen invalid hint ids | r4 new finding, §8.7 A2–A4b | Child zone.id is read recursively from the four pinned JSON files, never child-object coercion; each id exists and its parent matches. Whole-oracle SHA-256 and Appendix E recalculated. |
| r4 MAJOR — One digest reused for seven artifacts | r4 new finding, A.3 | Seven distinct artifact byte preimages/digests, two defined full-declaration asset byte sources and two recalculated P-ENTRY values. Only corpus references reuse the corpus digest. No fixture executable/schema qualification is asserted. |
| r4 MAJOR — Relationship endpoint carrier | r4 new finding, §3.9; r5 finding on §§4.4.2/4.4.4 | §§3.9.1/4.4 define the same semantic/view carrier through folds: a visible target retains its relation occurrence; an internal target uses its canonical collapsed container with original RelationRef/sourceOccurrence provenance. B.7/C.6 specify projection, restoration and negative diagnostics; execution/routing qualification remains U-AM-ENDPOINT. |
| r4 MINOR — Hash-row count | r4 new finding, Appendix E | §8.5 now has 86 rows (52+12+16+6), including four new controlling source files, and 85 distinct source identities. All 86 rows recomputed with Node. |
| r4 MINOR — Five diagnostic paths | r4 new finding, C.3 | Each mutation has its exact field path, matching its C.3 arm; no one of those five arrays uses the generic presentation.diagram path. |
| r4 MINOR — Adapter/contract pin binding | r4 new finding, §3.2.1 | Input contractPin equals the persisted/resolved presentation contract; adapterPin equals that contract catalog's compatibility.adapter; schema binding equals artifactBinding.schemaPin. Each mismatch refuses before application under presentation-pin-mismatch. |

### 11.2 unverified register

| Id | Still unverified | Owner / effect |
| --- | --- | --- |
| U-ID | Production namespace/owner/canonical-reference registry lookups and actual published catalog record identities | Engram guardian/catalog. Candidate namespace diagram and handle engram are specified expectations, not read registry evidence. S2 refuses without lookups. |
| U-AM | Normative suitability/catalogue classification and transitive licence qualification of the pinned Archi 3.2 machine-data transcription against the authoritative ArchiMate source | Engram ArchiMate steward. Full pair data is supplied; external certification/standard equivalence is not claimed. Blocks complete-profile admission. |
| U-AM-ENDPOINT | Execution/schema-2.0 registration, identity migration/reload/downgrade and view-attachment/routing receipts for the fully defined §3.9.1 generic relation-target carrier | DS kernel with Engram. Shape, finite lookup, @relation classification, RelationRef fold provenance, bounded occurrence classification, routing limits and migration witness are specified; B.7/C.6 are expected values, not receipts. No second metamodel/reification/cell deletion. Blocks full archimate@2 admission, not declaration specification. |
| U-KERNEL | Qualified K1/K2/K6 type/reference/struct schema (including the §3.11.1 kind-neutral multiplicity schema interpretation), shared schema-2.0 transition and Appendix A.4 declaration support | DS kernel/A′ with Engram profiles. Full declarations/carriers/constraints are specified; compatible execution/schema registration/publication remains unverified. |
| U-DIAG | Published diagnostic-schema/adapter accepting the new native code arms, with reversible receipts | Engram guardian adapter + DS. Blocks S2 for those executors, does not alter frozen G0. |
| U-D2D-MAP | Generated BPMN↔d2d mechanism mapping and associated receipt pins | Engram/d2d/bpmn-canvas/DS. Matrix remains partial, private content owner-side. |
| U-HISTORY | Historical producer bytes matching the five superseded HRPN provenance pins | HRPN producer. Frozen fixtures remain pinned/intact; historical regeneration is not asserted. |
| U-THEME | Resolved DS token assets and pixel equivalence of the governed category-token table | DS presentation with Engram contract/theme steward. Does not permit consumer colour tables. |
| U-QUAL | Implementation, exact executor/package pins, schema-valid production specimens, corpus/transition and admission receipts, including complete A7 execution | DS execution + Engram governance. Specification oracle values and serialization specimens are not executed admission evidence. |
| U-INTERACTION | Measured per-action 600/240 artifact and worst-case/idle evidence | DS M3. Workload remains mandatory; no measured performance is claimed. |

All open evidence is assigned above. No unanswered owner choice about identity/family routing/workload is introduced.


## Appendix A — Source transcriptions and executable specimens

### A.1 ArchiMate 3.2 catalogue and pairwise matrix

Immutable source: archimatetool/archi 9e6a014f9ef6a782a7dda604ef7b4d03d2c7819a, com.archimatetool.model/model/relationships.xml (version 3.2), relationships-keys.xml and archimate.ecore, plus com.archimatetool.model/LICENSE.txt and com.archimatetool.model/src/com/archimatetool/model/IAccessRelationship.java, raw hashes §8.5. The table below is a transcription of the matrix bytes. The source licence is MIT-form text including The Open Group attribution; dependent publication still requires Engram's U-AM qualification. No Java runtime/code is shipped; the executor is our own JS over the pinned data.

Key transcription: a=access, c=composition, f=flow, g=aggregation, i=assignment, n=influence, o=association, r=realization, s=specialization, t=triggering, v=serving. Case is preserved in the source; this snapshot uses lowercase keys. No runtime relation derivation is implied by a permitted key.

Catalogue type names map by inserting "-" between a lowercase/digit and following uppercase, then ASCII lowercase. Grouping→grouping, Junction→junction retain the @1 names. Relationship→@relation is the source's pseudo-concept for a relation target/source, **not an entity type**. Its generic native carrier is specified in §3.9.1 and qualified under U-AM-ENDPOINT. The other 61 rows are concrete element kinds. layer/aspect below are the explicit candidate classification used by this transcription; classification against the standard is part of U-AM, not fabricated source certification.

| Source concept | Native type id | Layer | Aspect |
| --- | --- | --- | --- |
| ApplicationCollaboration | application-collaboration | application | active |
| ApplicationComponent | application-component | application | active |
| ApplicationEvent | application-event | application | behaviour |
| ApplicationFunction | application-function | application | behaviour |
| ApplicationInteraction | application-interaction | application | behaviour |
| ApplicationInterface | application-interface | application | active |
| ApplicationProcess | application-process | application | behaviour |
| ApplicationService | application-service | application | behaviour |
| Artifact | artifact | technology | passive |
| Assessment | assessment | motivation | motivation |
| BusinessActor | business-actor | business | active |
| BusinessCollaboration | business-collaboration | business | active |
| BusinessEvent | business-event | business | behaviour |
| BusinessFunction | business-function | business | behaviour |
| BusinessInteraction | business-interaction | business | behaviour |
| BusinessInterface | business-interface | business | active |
| BusinessObject | business-object | business | passive |
| BusinessProcess | business-process | business | behaviour |
| BusinessRole | business-role | business | active |
| BusinessService | business-service | business | behaviour |
| Capability | capability | strategy | behaviour |
| CommunicationNetwork | communication-network | technology | active |
| Constraint | constraint | motivation | motivation |
| Contract | contract | business | passive |
| CourseOfAction | course-of-action | strategy | behaviour |
| DataObject | data-object | application | passive |
| Deliverable | deliverable | implementation | passive |
| Device | device | technology | active |
| DistributionNetwork | distribution-network | physical | active |
| Driver | driver | motivation | motivation |
| Equipment | equipment | physical | active |
| Facility | facility | physical | active |
| Gap | gap | implementation | passive |
| Goal | goal | motivation | motivation |
| Grouping | grouping | none | composite |
| ImplementationEvent | implementation-event | implementation | behaviour |
| Junction | junction | none | other |
| Location | location | none | composite |
| Material | material | physical | passive |
| Meaning | meaning | motivation | motivation |
| Node | node | technology | active |
| Outcome | outcome | motivation | motivation |
| Path | path | technology | active |
| Plateau | plateau | implementation | composite |
| Principle | principle | motivation | motivation |
| Product | product | business | composite |
| Representation | representation | business | passive |
| Requirement | requirement | motivation | motivation |
| Resource | resource | strategy | active |
| Stakeholder | stakeholder | motivation | motivation |
| SystemSoftware | system-software | technology | active |
| TechnologyCollaboration | technology-collaboration | technology | active |
| TechnologyEvent | technology-event | technology | behaviour |
| TechnologyFunction | technology-function | technology | behaviour |
| TechnologyInteraction | technology-interaction | technology | behaviour |
| TechnologyInterface | technology-interface | technology | active |
| TechnologyProcess | technology-process | technology | behaviour |
| TechnologyService | technology-service | technology | behaviour |
| Value | value | motivation | motivation |
| ValueStream | value-stream | strategy | behaviour |
| WorkPackage | work-package | implementation | behaviour |

None denotes no layer; it is not the string value of a fabricated semantic layer attribute. Catalogue descriptors constrain instance layer/aspect only where defined. Grouping/container capability is explicit. No optional name is made globally unique.

**Complete pairwise table.** Columns are numbered 0…61 in exactly the source order below. Every row has 62 cell strings in that order. Each character in a cell admits exactly that relationship for **that ordered source/target pair**. "-" denotes the empty set; there is no implicit Cartesian product. This is a compact encoding of all 3,844 pairs and their 11,569 permitted (relationship,source,target) tuples, including every @relation pair under §3.9.1.

~~~text
0 ApplicationCollaboration
1 ApplicationComponent
2 ApplicationEvent
3 ApplicationFunction
4 ApplicationInteraction
5 ApplicationInterface
6 ApplicationProcess
7 ApplicationService
8 Artifact
9 Assessment
10 BusinessActor
11 BusinessCollaboration
12 BusinessEvent
13 BusinessFunction
14 BusinessInteraction
15 BusinessInterface
16 BusinessObject
17 BusinessProcess
18 BusinessRole
19 BusinessService
20 Capability
21 CommunicationNetwork
22 Constraint
23 Contract
24 CourseOfAction
25 DataObject
26 Deliverable
27 Device
28 DistributionNetwork
29 Driver
30 Equipment
31 Facility
32 Gap
33 Goal
34 Grouping
35 ImplementationEvent
36 Junction
37 Location
38 Material
39 Meaning
40 Node
41 Outcome
42 Path
43 Plateau
44 Principle
45 Product
46 Relationship
47 Representation
48 Requirement
49 Resource
50 Stakeholder
51 SystemSoftware
52 TechnologyCollaboration
53 TechnologyEvent
54 TechnologyFunction
55 TechnologyInteraction
56 TechnologyInterface
57 TechnologyProcess
58 TechnologyService
59 Value
60 ValueStream
61 WorkPackage
~~~

| Source row | 62 relation-key cells, targets 0…61 |
| --- | --- |
| ApplicationCollaboration | `cfgostv fgortv fiortv fiortv fiortv cfgortv fiortv fiortv ao no fotv fotv fortv fortv fortv fortv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no fotv fotv fotv fotv fotv fotv fotv fotv no or o` |
| ApplicationComponent | `fotv cfgorstv fiortv fiortv fiortv cfgortv fiortv fiortv ao no fotv fotv fortv fortv fortv fortv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no fotv fotv fotv fotv fotv fotv fotv fotv no or o` |
| ApplicationEvent | `fotv fotv cfgostv fotv fotv fotv fotv fotv ao no fotv fotv fortv fotv fotv fotv ao fotv fotv fotv o fotv nor ao o ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no o o` |
| ApplicationFunction | `fotv fotv fotv cfgostv cfgotv fotv cfgotv fortv ao no fotv fotv fotv fortv fortv fotv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o` |
| ApplicationInteraction | `fotv fotv fotv cfgotv cfgostv fotv cfgotv fortv ao no fotv fotv fotv fortv fortv fotv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o` |
| ApplicationInterface | `fotv fotv fotv fotv fotv cfgostv fotv fiotv ao no fotv fotv fotv fotv fotv fortv ao fotv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no fotv fotv fotv fotv fotv fotv fotv fotv no or o` |
| ApplicationProcess | `fotv fotv fotv cfgotv cfgotv fotv cfgostv fortv ao no fotv fotv fotv fortv fortv fotv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o` |
| ApplicationService | `fotv fotv fotv fotv fotv fotv fotv cfgostv ao no fotv fotv fotv fotv fotv fotv ao fotv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o` |
| Artifact | `or or or or or or or or cgors no o o or or or or or or o or or o nor or or or o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o o nor or no or o or or or or or or no or o` |
| Assessment | `o o o o o o o o o cgnos o o o o o o o o o o o o no o o o o o o no o o o no cgnos o acfginorstv o o no o no o o no o o o no o no o o o o o o o o no o o` |
| BusinessActor | `fotv fotv fotv fotv fotv fotv fotv fotv ao no cfgostv fotv fiotv fiotv fiotv cfgiotv ao fiotv fiotv fiortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv io acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or ino fotv fotv fotv fotv fotv fotv fotv fotv no or io` |
| BusinessCollaboration | `fotv fotv fotv fotv fotv fotv fotv fotv ao no fgotv cfgostv fiotv fiotv fiotv cfgiotv ao fiotv fgiotv fiortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv io acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or ino fotv fotv fotv fotv fotv fotv fotv fotv no or io` |
| BusinessEvent | `fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv cfgostv fotv fotv fotv ao fotv fotv fotv o fotv nor ao o ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no o o` |
| BusinessFunction | `fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv fotv cfgostv cfgotv fotv ao cfgotv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o` |
| BusinessInteraction | `fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv fotv cfgotv cfgostv fotv ao cfgotv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o` |
| BusinessInterface | `fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv fotv fotv fotv cfgostv ao fotv fotv fiotv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no fotv fotv fotv fotv fotv fotv fotv fotv no or o` |
| BusinessObject | `o o o o o o o o o no o o o o o o cgos o o o or o nor cgos or o o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o o nor or no o o o o o o o o no or o` |
| BusinessProcess | `fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv fotv cfgotv cfgotv fotv ao cfgostv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o` |
| BusinessRole | `fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv fiotv fiotv fiotv cfgotv ao fiotv cfgostv fiortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv io acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or ino fotv fotv fotv fotv fotv fotv fotv fotv no or io` |
| BusinessService | `fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv fotv fotv fotv fotv ao fotv fotv cfgostv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o` |
| Capability | `o o o o o o o o o no o o o o o o o o o o cfgostv o nor o fortv o o o o no o o o nor cfgnorstv o acfginorstv o o no o nor o o nor o o o nor fotv no o o o o o o o o no fotv o` |
| CommunicationNetwork | `fortv fortv fortv fortv fortv fortv fortv fortv aio no fortv fortv fortv fortv fortv fortv ao fortv fortv fortv or cfgostv nor ao or ao o fgortv fotv no fortv fortv o nor acfginorstv o acfginorstv fotv ao no fortv nor fortv o nor fotv o ao nor or nor fgiortv fortv fiortv fiortv fiortv fgiortv fiortv fiortv no or o` |
| Constraint | `o o o o o o o o o no o o o o o o o o o o o o cgnos o o o o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o o cgnos o no o o o o o o o o no o o` |
| Contract | `o o o o o o o o o no o o o o o o cgos o o o or o nor cgos or o o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o o nor or no o o o o o o o o no or o` |
| CourseOfAction | `o o o o o o o o o no o o o o o o o o o o fotv o nor o cfgostv o o o o no o o o nor cfgnorstv o acfginorstv o o no o nor o o nor o o o nor fotv no o o o o o o o o no fotv o` |
| DataObject | `o o o o o o o o o no o o o o o o or o o o or o nor or or cgos o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o o nor or no o o o o o o o o no or o` |
| Deliverable | `or or or or or or or or or no or or or or or or or or or or or or nor or or or cgos or or no or or o nor cgnors o acfginorstv or or no or nor or or nor or o or nor or nor or or or or or or or or no or o` |
| Device | `fortv fortv fortv fortv fortv fortv fortv fortv aio no fotv fotv fortv fortv fortv fortv ao fortv fotv fortv or fotv nor ao or ao o cfgostv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no cfgiortv fotv fiortv fiortv fiortv cfgiortv fiortv fiortv no or o` |
| DistributionNetwork | `fortv fortv fortv fortv fortv fortv fortv fortv aio no fiortv fiortv fiortv fiortv fiortv fiortv ao fiortv fiortv fiortv or fotv nor ao or ao o fgiortv cfgostv no fgiortv fgiortv o nor acfginorstv io acfginorstv fotv aio no fgiortv nor fortv o nor fotv o ao nor or inor fgiortv fortv fiortv fiortv fiortv fgiortv fiortv fiortv no or io` |
| Driver | `o o o o o o o o o no o o o o o o o o o o o o no o o o o o o cgnos o o o no cgnos o acfginorstv o o no o no o o no o o o no o no o o o o o o o o no o o` |
| Equipment | `fortv fortv fortv fortv fortv fortv fortv fortv aio no fotv fotv fortv fortv fortv fortv ao fortv fotv fortv or fotv nor ao or ao o cfgortv fotv no cfgorstv fotv o nor acfginorstv o acfginorstv fotv aio no fotv nor fotv o nor fotv o ao nor or no cfgiortv fotv fiortv fiortv fiortv cfgiortv fiortv fiortv no or o` |
| Facility | `fortv fortv fortv fortv fortv fortv fortv fortv aio no fiotv fiotv fiortv fiortv fiortv fiortv ao fiortv fiotv fiortv or fotv nor ao or ao o cfgiortv fotv no cfgiortv cfgiostv o nor acfginorstv io acfginorstv fotv aio no cfgiotv nor fotv o nor fotv o ao nor or ino cfgiortv fotv fiortv fiortv fiortv cfgiortv fiortv fiortv no or io` |
| Gap | `o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o cgos o cgos o acfginorstv o o o o o o o o o o o o o o o o o o o o o o o o o` |
| Goal | `o o o o o o o o o no o o o o o o o o o o o o no o o o o o o no o o o cgnos cgnos o acfginorstv o o no o no o o no o o o no o no o o o o o o o o no o o` |
| Grouping | `cfgorstv cfgorstv cfgiorstv cfgiorstv cfgiorstv cfgorstv cfgiorstv cfgiorstv acgiors cgnos cfgiorstv cfgiorstv cfgiorstv cfgiorstv cfgiorstv cfgiorstv acgors cfgiorstv cfgiorstv cfgiorstv cfgiorstv cfgorstv cgnors acgors cfgorstv acgors acgors cfgiorstv cfgorstv cgnos cfgiorstv cfgiorstv cgos cgnors acfginorstv cfgiost acfginorstv cfgorstv acgiors cgnos cfgiorstv cgnors cfgorstv cfgorst cgnors cfgorstv cgo acgors cgnors cfgorstv cginors cfgiorstv cfgorstv cfgiorstv cfgiorstv cfgiorstv cfgiorstv cfgiorstv cfgiorstv cgnos cfgiorstv cfgiost` |
| ImplementationEvent | `o o o o o o o o o no o o o o o o o o o o o o no o o o ao o o no o o o no acfgnost cfgost acfginorstv o o no o no o fot no o o o no o no o o o o o o o o no o fot` |
| Junction | `fortv fortv fiortv fiortv fiortv fortv fiortv fiortv aior no fiortv fiortv fiortv fiortv fiortv fiortv aor fiortv fiortv fiortv fiortv fortv nor aor fortv aor aor fiortv fortv no fiortv fiortv o nor afinortv fiot acfginorstv fortv aior no fiortv nor fortv fort nor fortv - aor nor fortv inor fiortv fortv fiortv fiortv fiortv fiortv fiortv fiortv no fiortv fiot` |
| Location | `cfgortv cfgortv cfgiortv cfgiortv cfgiortv cfgortv cfgiortv cfgiortv acgio cgno cfgiortv cfgiortv cfgiortv cfgiortv cfgiortv cfgiortv acgo cfgiortv cfgiortv cfgiortv cgor cfgotv cgnor acgo cgor acgo cgo cfgiortv cfgotv cgno cfgiortv cfgiortv cgo cgnor acfginorstv cgio acfginorstv cfgostv acgio cgno cfgiortv cgnor cfgortv cgo cgnor cfgotv cgo acgo cgnor cgor cginor cfgiortv cfgortv cfgiortv cfgiortv cfgiortv cfgiortv cfgiortv cfgiortv cgno cgor cgio` |
| Material | `or or or or or or or or or no o o or or or or or or o or or o nor or or or o or o no or o o nor cgnors o acfginorstv o cgors no o nor o o nor o o o nor or no or o or or or or or or no or o` |
| Meaning | `o o o o o o o o o no o o o o o o o o o o o o no o o o o o o no o o o no cgnos o acfginorstv o o cgnos o no o o no o o o no o no o o o o o o o o no o o` |
| Node | `fortv fortv fortv fortv fortv fortv fortv fortv aio no fiotv fiotv fiortv fiortv fiortv fiortv ao fiortv fiotv fiortv or fotv nor ao or ao o cfgiortv fotv no cfgiortv cfgiotv o nor acfginorstv io acfginorstv fotv aio no cfgiostv nor fotv o nor fotv o ao nor or ino cfgiortv fotv fiortv fiortv fiortv cfgiortv fiortv fiortv no or io` |
| Outcome | `o o o o o o o o o no o o o o o o o o o o o o no o o o o o o no o o o nor cgnors o acfginorstv o o no o cgnos o o no o o o no o no o o o o o o o o no o o` |
| Path | `fortv fortv fortv fortv fortv fortv fortv fortv aio no fiotv fiotv fiortv fiortv fiortv fiortv ao fiortv fiotv fiortv or fotv nor ao or ao o fgiortv fotv no fgiortv fgiotv o nor acfginorstv io acfginorstv fotv aio no fgiotv nor cfgostv o nor fotv o ao nor or ino fgiortv fgotv fiortv fiortv fiortv fgiortv fiortv fiortv no or io` |
| Plateau | `cgor cgor cgor cgor cgor cgor cgor cgor cgor no cgor cgor cgor cgor cgor cgor cgor cgor cgor cgor cgor cgor cgnor cgor cgor cgor ao cgor cgor no cgor cgor o cgnor acfginorst fot acfginorstv cgor cgor no cgor cgnor cgor cfgost nor cgor cgo cgor cgnor cgor inor cgor cgor cgor cgor cgor cgor cgor cgor no cgor fot` |
| Principle | `o o o o o o o o o no o o o o o o o o o o o o no o o o o o o no o o o nor cgnors o acfginorstv o o no o nor o o cgnos o o o no o no o o o o o o o o no o o` |
| Product | `fortv fortv fortv fortv fortv fortv fortv cfgortv acgo no fotv fotv fortv fortv fortv fortv acgo fortv fotv cfgortv or fotv nor acgo or acgo o fortv fotv no fortv fotv o nor acfgnorstv o acfginorstv fotv acgo no fotv nor fotv o nor cfgostv o acgo nor or no fortv fotv fortv fortv fortv fortv fortv cfgortv no or o` |
| Relationship | `o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o - o o o o o o o o o - o o o o o o o o o o o o o o o` |
| Representation | `o o o o o o o o o no o o o o o o or o o o or o nor or or o o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o cgos nor or no o o o o o o o o no or o` |
| Requirement | `o o o o o o o o o no o o o o o o o o o o o o cgnos o o o o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o o cgnos o no o o o o o o o o no o o` |
| Resource | `o o o o o o o o o no o o o o o o o o o o fiotv o nor o fortv o o o o no o o o nor cfginorstv o acfginorstv o o no o nor o o nor o o o nor cfgostv no o o o o o o o o no fiotv o` |
| Stakeholder | `o o o o o o o o o no o o o o o o o o o o o o no o o o o o o no o o o no cgnos o acfginorstv o o no o no o o no o o o no o cgnos o o o o o o o o no o o` |
| SystemSoftware | `fortv fortv fortv fortv fortv fortv fortv fortv aio no fotv fotv fortv fortv fortv fortv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no cfgiorstv fotv fiortv fiortv fiortv cfgiortv fiortv fiortv no or o` |
| TechnologyCollaboration | `fortv fortv fortv fortv fortv fortv fortv fortv aio no fiotv fiotv fiortv fiortv fiortv fiortv ao fiortv fiotv fiortv or fotv nor ao or ao o fgiortv fotv no fgiortv fgiotv o nor acfginorstv io acfginorstv fotv aio no fgiotv nor fotv o nor fotv o ao nor or ino fgiortv cfgostv fiortv fiortv fiortv cfgiortv fiortv fiortv no or io` |
| TechnologyEvent | `fotv fotv fortv fotv fotv fotv fotv fotv ao no fotv fotv fortv fotv fotv fotv ao fotv fotv fotv o fotv nor ao o ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv cfgostv fotv fotv fotv fotv fotv no o o` |
| TechnologyFunction | `fotv fotv fotv fortv fortv fotv fortv fortv ao no fotv fotv fotv fortv fortv fotv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv cfgostv cfgotv fotv cfgotv fortv no or o` |
| TechnologyInteraction | `fotv fotv fotv fortv fortv fotv fortv fortv ao no fotv fotv fotv fortv fortv fotv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv cfgotv cfgostv fotv cfgotv fortv no or o` |
| TechnologyInterface | `fotv fotv fotv fotv fotv fortv fotv fortv ao no fotv fotv fotv fotv fotv fortv ao fotv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no fotv fotv fotv fotv fotv cfgostv fotv fiotv no or o` |
| TechnologyProcess | `fotv fotv fotv fortv fortv fotv fortv fortv ao no fotv fotv fotv fortv fortv fotv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv cfgotv cfgotv fotv cfgostv fortv no or o` |
| TechnologyService | `fotv fotv fotv fotv fotv fotv fotv fortv ao no fotv fotv fotv fotv fotv fotv ao fotv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv cfgostv no or o` |
| Value | `o o o o o o o o o no o o o o o o o o o o o o no o o o o o o no o o o no cgnos o acfginorstv o o no o no o o no o o o no o no o o o o o o o o cgnos o o` |
| ValueStream | `o o o o o o o o o no o o o o o o o o o o fotv o nor o fortv o o o o no o o o nor cfgnorstv o acfginorstv o o no o nor o o nor o o o nor fotv no o o o o o o o o no cfgostv o` |
| WorkPackage | `or or or or or or or or or no or or or or or or or or or or or or nor or or or aor or or no or or o nor acfgnorst fot acfginorstv or or no or nor or fort nor or o or nor or nor or or or or or or or or no or cfgost` |

Executable expansion, with names and cells taken verbatim from the tables above:

~~~js
const relation = {a:"access",c:"composition",f:"flow",g:"aggregation",
  i:"assignment",n:"influence",o:"association",r:"realization",
  s:"specialization",t:"triggering",v:"serving"};
const typeId = name => name === "Relationship" ? "@relation" :
  name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const tuples = cells.flatMap((row,i) => row.flatMap((keys,j) =>
  keys === "-" ? [] : [...keys].map(k => ({
    relationType:relation[k], sourceType:typeId(names[i]), targetType:typeId(names[j])
  }))));
const allows = (relationship,source,target) =>
  tuples.some(t => t.relationType===relationship &&
    t.sourceType===source && t.targetType===target);
~~~

A profile declaration embeds this expanded tuple array in its relationship-matrix constraint in row/column/key order. Its contentDigest covers the complete tuple values, not merely an external matrix digest. Source↔native catalogue/matrix identities and the pinned source files are also retained as governance evidence. Missing files/digest mismatch prevents transcription; a live URL never substitutes at validation time.

Expanded array RFC 8785: 1027156 bytes, SHA-256 `a13f4112164afd177923a67b424d4c9b6ee57c1b993c4d11c94d5227385267f9`.
Catalogue JSON array (the rows above, fields name/id/layer/aspect): 5280 bytes, SHA-256 `114cdca0c1e538f9cedf09613f415a6464bc9f4f54471c62ecfafcf6fede916e`.

Concrete pair witnesses transcribed from the table:
- application-component→data-object admits access and association ("ao"); the reverse admits only association ("o"). Therefore access(component,data-object) passes and access(data-object,component) yields relationship-matrix-violation.
- application-component→application-service admits flow, assignment, association, realization, triggering and serving ("fiortv").
- data-object→data-object admits composition, aggregation, association and specialization ("cgos"), not assignment.
These are predicates over an ordered pair, not independently allowed source/target families.

### A.2 UML multiplicity and stereotype oracles

Shared struct/reference fields are those of A′ K2/K6 (§2.3); this table fixes the profile's data-level interpretation.

| Authored @1 input / @2 fields | Expected result |
| --- | --- |
| "1" | lower=1, upper=1 |
| "0..1" | lower=0, upper=1 |
| "1..5" | lower=1, upper=5 |
| "*" | lower=0, upper=-1 |
| "1..*" | lower=1, upper=-1 |
| " 1", "1 ", "one", "", "1...2" | Atomic migration refusal: multiplicity-syntax; exact source text retained |
| lower=3, upper=2 | multiplicity-invalid, no target migration |
| lower=-1 or upper=-2 | quantity-below-min at the offending field |
| lower=0.5 | quantity-not-integer |
| finite upper > 9007199254740991 | quantity-above-max (declared max=9007199254740991) |
| unknown struct field "ceiling" | struct-field-not-in-schema |
| unknown struct type | struct-type-unknown |
| a known non-multiplicity struct in the multiplicity attribute | struct-type-not-allowed |
| stereotype ref points at ordinary class | reference-target-type |
| stereotype extends=[class], applied to interface | stereotype-application-invalid |
| @1 stereotype text without an explicit mapping | Atomic migration refusal: unmapped-stereotype |
| class with a mapped stereotype extending class | Valid; no local schema/refinement is required |

All structs remain bounded typed fields; no arbitrary JSON object is admitted. Association endpoint multiplicities use the identical carrier. The recorded migration operation keeps every source string/field and exact source-state recovery.

### A.3 G0 closed record/catalog serialization specimens

The JSON below is **fixture data**, with computed digest values over the explicitly supplied declarations and distinct byte sources. Its fixture identities are resolved within this document, not production namespace/owner lookups. Passing receipt values here are expected serialization objects, not a claim that a validator ran or a receipt was issued. This distinction is required by U-ID/U-QUAL.

The base declaration and additive narrowing layer are minimal G0 mechanism fixtures (not production generic@2/ArchiMate/UML profile bytes). The layer adds only a domain entity count bound; it neither removes a parent attribute nor widens a gate. Stack=[basePin,layerPin]; layer lineage.parents=[basePin]. There is no self-parent and no presentation fragment in the semantic stack. Each envelope includes all closed fields, complete base/profile artifactBinding, and a fixture-only compatibility.adapter string whose byte source is embedded below. No declarationFormat is added to any record/payload.

~~~json
{
  "corpus": {
    "scope": "g0-serialization",
    "cases": [
      "base-shape",
      "two-layer-narrowing-shape"
    ]
  },
  "base": {
    "declaration": {
      "id": "specimen-base@1",
      "name": "specimen-base",
      "version": 1,
      "completeness": "complete",
      "entityTypes": [
        {
          "id": "node",
          "label": "Node",
          "attributes": [
            {
              "name": "name",
              "kind": "text",
              "required": true,
              "maxLength": 200
            }
          ]
        }
      ],
      "portTypes": [],
      "relationTypes": [],
      "constraints": [],
      "limits": {
        "maxEntities": 100,
        "maxRelations": 200,
        "maxEndpointsPerRelation": 2
      }
    },
    "record": {
      "namespace": "fixture-namespace",
      "id": "specimen-base",
      "version": "1",
      "owner": "fixture-owner",
      "lifecycle": "draft",
      "completeness": "complete",
      "visibility": "public",
      "profileShape": "diagram-profile",
      "artifactKind": "base",
      "profileRef": {
        "canonicalRef": "fixture:specimen-base@1",
        "contentDigest": "63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e"
      },
      "corpusRef": {
        "ref": "fixture:serialization-corpus",
        "digest": "3d4c6b6bc655d028bc7467f7278c5dac3c913e8b298f2ad756fbc78c173701d8"
      },
      "digests": {
        "contentDigest": "63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e",
        "pinsDigest": "8b7e46be03c24ead8555204c7ebf85a4a3d37a25e83a64700ea6d106f25162d3",
        "resultEvidence": {
          "evidenceState": "resolved",
          "digest": "936fd5f33944413161807f464641469c42ec6f57e784bf0ed4ce9c77b21cb874"
        }
      },
      "lineage": {
        "parents": [],
        "mappings": [],
        "migrations": []
      },
      "consumers": [
        "fixture:consumer"
      ]
    },
    "envelope": {
      "format": "sentropic.registry-entry/v1",
      "contractVersion": "1.1.4",
      "kind": "ontology",
      "id": "fixture-base",
      "name": "Serialization base",
      "description": "Expected fixture serialization; not admission evidence.",
      "entryVersion": "1",
      "publisher": {
        "packageName": "fixture-publisher",
        "packageVersion": "1"
      },
      "compatibility": {
        "entryContract": "1.1.4",
        "packages": [],
        "schemaProfiles": [
          "fixture:diagram-profile/1"
        ],
        "requiredHostFeatures": [
          "ontology-descriptors"
        ],
        "optionalHostFeatures": []
      },
      "parameters": {
        "schemaVersion": "1",
        "schema": {
          "type": "object",
          "properties": {},
          "required": [],
          "additionalProperties": false,
          "maxProperties": 0
        },
        "defaults": {}
      },
      "bindings": [
        {
          "key": "profile",
          "contract": "fixture:diagram-profile/1#sha256=c2079bdd72c369d4eb0c98534d55c30d5b0435c0805c7589ec3ed55e4e7e2ae8",
          "required": true
        }
      ],
      "assets": [
        {
          "role": "profile-data",
          "path": "profiles/specimen-base.json",
          "mediaType": "application/json",
          "sha256": "ffcf89f3c1ab72bbbf6262f421745bd03fc16b4767bdbc5092c2ce8496bf9760"
        }
      ],
      "ontology": {
        "canonicalRef": "fixture:specimen-base@1",
        "namespace": "fixture-namespace",
        "owner": "fixture-owner",
        "profileShape": "diagram-profile",
        "artifactKind": "base",
        "profilePin": {
          "id": "specimen-base",
          "version": "1",
          "contentDigest": "63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e"
        },
        "stack": [
          {
            "id": "specimen-base",
            "version": "1",
            "contentDigest": "63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e"
          }
        ],
        "digests": {
          "contentDigest": "63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e",
          "pinsDigest": "8b7e46be03c24ead8555204c7ebf85a4a3d37a25e83a64700ea6d106f25162d3",
          "resultEvidence": {
            "evidenceState": "resolved",
            "digest": "936fd5f33944413161807f464641469c42ec6f57e784bf0ed4ce9c77b21cb874"
          }
        },
        "ruleSheets": [],
        "lifecycle": "draft",
        "provenance": {
          "sourceRef": "fixture:serialization-contract",
          "sourceRevision": "1"
        },
        "lineage": {
          "parents": [],
          "mappings": [],
          "migrations": []
        },
        "conflictPolicy": "fixture:g0-conflicts@1#sha256=69294822a50219a2ce80a2a94e3196e74d61fb4186f9e6905f26d712960bb6b0",
        "completeness": "complete",
        "corpusRef": {
          "ref": "fixture:serialization-corpus",
          "digest": "3d4c6b6bc655d028bc7467f7278c5dac3c913e8b298f2ad756fbc78c173701d8"
        },
        "receipts": [
          {
            "receiptKind": "family-corpus",
            "corpusDigest": "3d4c6b6bc655d028bc7467f7278c5dac3c913e8b298f2ad756fbc78c173701d8",
            "libraryId": "fixture-validator",
            "libraryVersion": "1",
            "validatorRole": "transitional-oracle",
            "verdict": "pass",
            "issuedAt": "2026-10-27",
            "evaluatedStack": {
              "stack": [
                {
                  "id": "specimen-base",
                  "version": "1",
                  "contentDigest": "63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e"
                }
              ],
              "pinsDigest": "8b7e46be03c24ead8555204c7ebf85a4a3d37a25e83a64700ea6d106f25162d3",
              "resultEvidence": {
                "evidenceState": "resolved",
                "digest": "936fd5f33944413161807f464641469c42ec6f57e784bf0ed4ce9c77b21cb874"
              }
            },
            "transitionQualification": {
              "claim": "oracle-witness",
              "parityMatrixDigest": "e408dcd7721485c12f8d4900e059b83a2d9aa7682d5798f7783144219ee73b46"
            },
            "family": "DIA",
            "fixtureDigest": "431033b0add7b951a5a63956b25a43c5069749b69acee1a8d8aa6a6c78272a9d",
            "severityPolicyDigest": null,
            "ruleVerdicts": []
          }
        ],
        "migrations": [],
        "consumers": [
          "fixture:consumer"
        ],
        "compatibility": {
          "renderer": "fixture:executor@1#sha256=ab8bea23f592a350e1a668edc06320d9811816734788ad838dab04dbccac2eaa",
          "adapter": "fixture:adapter@1#sha256=84a80f9f40e48c2e1f7b2b105ad44b941447a76e4f05cbae0395878587f76a35"
        },
        "visibility": "public",
        "linkedTools": [],
        "artifactBinding": {
          "artifactKind": "base",
          "basePin": {
            "id": "specimen-base",
            "version": "1",
            "contentDigest": "63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e"
          },
          "bijectionEvidence": {
            "evidenceState": "resolved",
            "receiptRef": "fixture:receipt-base"
          }
        }
      }
    },
    "externalEntryDigest": "500d7242b900d4559ffd2291ea69498fcfda3415738958b3c8d62e0927a9349d",
    "receiptReference": {
      "ref": "fixture:receipt-base",
      "receiptIndex": 0
    }
  },
  "stacked": {
    "declaration": {
      "id": "specimen-layer@1",
      "name": "specimen-layer",
      "version": 1,
      "completeness": "complete",
      "entityTypes": [],
      "portTypes": [],
      "relationTypes": [],
      "constraints": [
        {
          "kind": "max-entities-of-type",
          "entityType": "node",
          "max": 10
        }
      ],
      "limits": {
        "maxEntities": 100,
        "maxRelations": 200,
        "maxEndpointsPerRelation": 2
      }
    },
    "record": {
      "namespace": "fixture-namespace",
      "id": "specimen-layer",
      "version": "1",
      "owner": "fixture-owner",
      "lifecycle": "draft",
      "completeness": "complete",
      "visibility": "public",
      "profileShape": "diagram-profile",
      "artifactKind": "profile",
      "profileRef": {
        "canonicalRef": "fixture:specimen-layer@1",
        "contentDigest": "6787c2ae4e516218d8819e68678916a0df9d2a050f2b5c5b73b64f9a900e7b59"
      },
      "corpusRef": {
        "ref": "fixture:serialization-corpus",
        "digest": "3d4c6b6bc655d028bc7467f7278c5dac3c913e8b298f2ad756fbc78c173701d8"
      },
      "digests": {
        "contentDigest": "6787c2ae4e516218d8819e68678916a0df9d2a050f2b5c5b73b64f9a900e7b59",
        "pinsDigest": "d4eb21e7218297b366fde124c2807fce1c893aec0238af838cadcad9b6c6cb0f",
        "resultEvidence": {
          "evidenceState": "resolved",
          "digest": "8a143e5506ba01f81603f5e891e7a9328d62cce0ca20b325ef36aa14af1d84a8"
        }
      },
      "lineage": {
        "parents": [
          {
            "id": "specimen-base",
            "version": "1",
            "contentDigest": "63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e"
          }
        ],
        "mappings": [],
        "migrations": []
      },
      "consumers": [
        "fixture:consumer"
      ]
    },
    "envelope": {
      "format": "sentropic.registry-entry/v1",
      "contractVersion": "1.1.4",
      "kind": "ontology",
      "id": "fixture-profile",
      "name": "Serialization profile",
      "description": "Expected fixture serialization; not admission evidence.",
      "entryVersion": "1",
      "publisher": {
        "packageName": "fixture-publisher",
        "packageVersion": "1"
      },
      "compatibility": {
        "entryContract": "1.1.4",
        "packages": [],
        "schemaProfiles": [
          "fixture:diagram-profile/1"
        ],
        "requiredHostFeatures": [
          "ontology-descriptors"
        ],
        "optionalHostFeatures": []
      },
      "parameters": {
        "schemaVersion": "1",
        "schema": {
          "type": "object",
          "properties": {},
          "required": [],
          "additionalProperties": false,
          "maxProperties": 0
        },
        "defaults": {}
      },
      "bindings": [
        {
          "key": "profile",
          "contract": "fixture:diagram-profile/1#sha256=c2079bdd72c369d4eb0c98534d55c30d5b0435c0805c7589ec3ed55e4e7e2ae8",
          "required": true
        }
      ],
      "assets": [
        {
          "role": "profile-data",
          "path": "profiles/specimen-layer.json",
          "mediaType": "application/json",
          "sha256": "fd8b9a9ab48fcf94f955bf65c06164e470a63ddb17fc1a68c919f145ea931417"
        }
      ],
      "ontology": {
        "canonicalRef": "fixture:specimen-layer@1",
        "namespace": "fixture-namespace",
        "owner": "fixture-owner",
        "profileShape": "diagram-profile",
        "artifactKind": "profile",
        "profilePin": {
          "id": "specimen-layer",
          "version": "1",
          "contentDigest": "6787c2ae4e516218d8819e68678916a0df9d2a050f2b5c5b73b64f9a900e7b59"
        },
        "stack": [
          {
            "id": "specimen-base",
            "version": "1",
            "contentDigest": "63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e"
          },
          {
            "id": "specimen-layer",
            "version": "1",
            "contentDigest": "6787c2ae4e516218d8819e68678916a0df9d2a050f2b5c5b73b64f9a900e7b59"
          }
        ],
        "digests": {
          "contentDigest": "6787c2ae4e516218d8819e68678916a0df9d2a050f2b5c5b73b64f9a900e7b59",
          "pinsDigest": "d4eb21e7218297b366fde124c2807fce1c893aec0238af838cadcad9b6c6cb0f",
          "resultEvidence": {
            "evidenceState": "resolved",
            "digest": "8a143e5506ba01f81603f5e891e7a9328d62cce0ca20b325ef36aa14af1d84a8"
          }
        },
        "ruleSheets": [],
        "lifecycle": "draft",
        "provenance": {
          "sourceRef": "fixture:serialization-contract",
          "sourceRevision": "1"
        },
        "lineage": {
          "parents": [
            {
              "id": "specimen-base",
              "version": "1",
              "contentDigest": "63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e"
            }
          ],
          "mappings": [],
          "migrations": []
        },
        "conflictPolicy": "fixture:g0-conflicts@1#sha256=69294822a50219a2ce80a2a94e3196e74d61fb4186f9e6905f26d712960bb6b0",
        "completeness": "complete",
        "corpusRef": {
          "ref": "fixture:serialization-corpus",
          "digest": "3d4c6b6bc655d028bc7467f7278c5dac3c913e8b298f2ad756fbc78c173701d8"
        },
        "receipts": [
          {
            "receiptKind": "family-corpus",
            "corpusDigest": "3d4c6b6bc655d028bc7467f7278c5dac3c913e8b298f2ad756fbc78c173701d8",
            "libraryId": "fixture-validator",
            "libraryVersion": "1",
            "validatorRole": "transitional-oracle",
            "verdict": "pass",
            "issuedAt": "2026-10-27",
            "evaluatedStack": {
              "stack": [
                {
                  "id": "specimen-base",
                  "version": "1",
                  "contentDigest": "63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e"
                },
                {
                  "id": "specimen-layer",
                  "version": "1",
                  "contentDigest": "6787c2ae4e516218d8819e68678916a0df9d2a050f2b5c5b73b64f9a900e7b59"
                }
              ],
              "pinsDigest": "d4eb21e7218297b366fde124c2807fce1c893aec0238af838cadcad9b6c6cb0f",
              "resultEvidence": {
                "evidenceState": "resolved",
                "digest": "8a143e5506ba01f81603f5e891e7a9328d62cce0ca20b325ef36aa14af1d84a8"
              }
            },
            "transitionQualification": {
              "claim": "oracle-witness",
              "parityMatrixDigest": "e408dcd7721485c12f8d4900e059b83a2d9aa7682d5798f7783144219ee73b46"
            },
            "family": "DIA",
            "fixtureDigest": "431033b0add7b951a5a63956b25a43c5069749b69acee1a8d8aa6a6c78272a9d",
            "severityPolicyDigest": null,
            "ruleVerdicts": []
          }
        ],
        "migrations": [],
        "consumers": [
          "fixture:consumer"
        ],
        "compatibility": {
          "renderer": "fixture:executor@1#sha256=ab8bea23f592a350e1a668edc06320d9811816734788ad838dab04dbccac2eaa",
          "adapter": "fixture:adapter@1#sha256=84a80f9f40e48c2e1f7b2b105ad44b941447a76e4f05cbae0395878587f76a35"
        },
        "visibility": "public",
        "linkedTools": [],
        "artifactBinding": {
          "artifactKind": "profile",
          "profilePin": {
            "id": "specimen-layer",
            "version": "1",
            "contentDigest": "6787c2ae4e516218d8819e68678916a0df9d2a050f2b5c5b73b64f9a900e7b59"
          },
          "stack": [
            {
              "id": "specimen-base",
              "version": "1",
              "contentDigest": "63ad6952c654ff343ef8aab9a39f23e9900a863e092d8113ca67791feac2e97e"
            },
            {
              "id": "specimen-layer",
              "version": "1",
              "contentDigest": "6787c2ae4e516218d8819e68678916a0df9d2a050f2b5c5b73b64f9a900e7b59"
            }
          ]
        }
      }
    },
    "externalEntryDigest": "5544190fd969998f25dc384d910565c2c98b73051f372bce3d39b96521965142",
    "receiptReference": {
      "ref": "fixture:receipt-profile",
      "receiptIndex": 0
    }
  },
  "artifacts": {
    "fixture:diagram-profile/1": {
      "mediaType": "application/json",
      "bytes": "{\"id\":\"fixture:diagram-profile/1\",\"required\":[\"id\",\"name\",\"version\",\"completeness\",\"entityTypes\",\"portTypes\",\"relationTypes\",\"constraints\",\"limits\"],\"scope\":\"serialization-only\",\"unknownFields\":\"refuse\"}"
    },
    "fixture:g0-conflicts@1": {
      "mediaType": "application/json",
      "bytes": "{\"attributeRedeclaration\":\"refuse\",\"gateWidening\":\"refuse\",\"id\":\"fixture:g0-conflicts@1\",\"parentRemoval\":\"refuse\",\"scope\":\"serialization-only\"}"
    },
    "fixture:executor@1": {
      "mediaType": "text/javascript",
      "bytes": "export const fixtureRole = \"renderer\";\n"
    },
    "fixture:adapter@1": {
      "mediaType": "text/javascript",
      "bytes": "export const fixtureRole = \"adapter\";\n"
    },
    "fixture:parity-matrix": {
      "mediaType": "application/json",
      "bytes": "{\"cases\":[{\"expected\":\"base\",\"id\":\"base-shape\"},{\"expected\":\"profile\",\"id\":\"two-layer-narrowing-shape\"}],\"claim\":\"oracle-witness\",\"scope\":\"serialization-only\"}"
    },
    "fixture:case-inputs": {
      "mediaType": "application/json",
      "bytes": "{\"cases\":[{\"id\":\"base-shape\",\"maxEntities\":100,\"maxRelations\":200},{\"entityType\":\"node\",\"id\":\"two-layer-narrowing-shape\",\"max\":10}],\"scope\":\"serialization-only\"}"
    }
  }
}
~~~

Byte reconstruction is exact and Node-only: UTF-8 of each artifacts[ref].bytes string, with precisely its represented newlines and no additional newline; SHA-256 of those bytes yields that artifact's pinned digest. These are deliberately inert serialization fixtures, not executable or schema-qualified DS packages. The contract bytes describe the fixture binding, not a claimed production JSON Schema. corpusRef.digest and receipt.corpusDigest hash RFC 8785 of corpus; fixtureDigest hashes artifacts["fixture:case-inputs"].bytes; parityMatrixDigest hashes artifacts["fixture:parity-matrix"].bytes. The seven different artifacts (corpus, binding contract, conflict policy, renderer, adapter, parity matrix, case inputs) have seven independently calculated, distinct digests. Asset profiles/specimen-base.json is RFC 8785 of base.declaration, and profiles/specimen-layer.json is RFC 8785 of stacked.declaration, both UTF-8 with no trailing newline; each asset sha256 hashes those full bytes, not P-CONTENT-DIAGRAM.

For P-RESULT the base effective declaration is its P-CONTENT-DIAGRAM projection; the layer effective declaration uses the layer's profile identity/completeness/limits, base entityTypes and concatenated base+layer constraints, with empty port/relation/rule arrays and severityPolicyDigest=null. Every record/payload/evaluatedStack digest is recomputed from this explicitly resolved fixture value. The externalEntryDigest fields above belong to this specimen container, not to either closed envelope. Each receiptReference resolves to receipts[0] in that specimen. Fixture lookups are closed within this container: (fixture-namespace,specimen-base,1) resolves base.record; (fixture-namespace,specimen-layer,1) resolves stacked.record; fixture-owner resolves the supplied isolated owner handle; each profileRef/canonicalRef resolves the corresponding declaration. fixture:serialization-corpus resolves corpus; each artifacts key resolves exactly its embedded bytes; receipt references resolve the stated receiptIndex; asset paths resolve the byte constructions above. fixture:consumer and fixture-publisher are isolated fixture identity inputs, not asserted production registrations. No reference is silently elided. Production executor/adapter/schema pins and identity registry evidence remain U-ID/U-DIAG/U-QUAL.



### A.4 Deterministic completed-profile declarations

This is normative declaration data expressed by a pure Node-compatible expansion, not executor code. Input catalogue is the array of the 61 A.1 table rows as {name,id,layer,aspect}; "none" is the table marker, not an instance layer value. Input tuples is exactly A.1's expanded ordered tuple array. Native attribute/schema keys are transcribed from profile.ts/attributes.ts plus the shared K1/K2/K6 and §5.4 additions; all new semantic declarations are inside the seven G0 projection keys. The recipe is over pinned/transcribed inputs only and calls no service, consumer callback or implementation validator.

~~~js
function completedDeclarations(catalogue, tuples) {
  const text = (name, maxLength, required=false) =>
    ({name,kind:"text",...(required?{required:true}:{}),
      ...(maxLength===undefined?{}:{maxLength})});
  const bool = name => ({name,kind:"boolean"});
  const enumeration = (name,values,required=false) =>
    ({name,kind:"enum",values,...(required?{required:true}:{})});
  const role = (name,targets,entityTypes) => ({
    role:name, cardinality:{min:1,max:1}, targets,
    ...(entityTypes===undefined?{}:{entityTypes})
  });
  const pair = (id,entityTypes,targets=["entity"]) => ({
    id,label:id,direction:"directed",
    roles:[role("source",targets,entityTypes),role("target",targets,entityTypes)]
  });
  const hierarchy = (id,hierarchyId,parentType,childTypes) => ({
    id,label:id,direction:"directed",
    roles:[role("parent",["entity"],[parentType]),
      role("child",["entity"],childTypes)],
    hierarchy:{id:hierarchyId,shape:"tree",parentRole:"parent",childRole:"child"}
  });
  const relationshipIds = ["composition","aggregation","assignment","realization",
    "serving","access","influence","triggering","flow","association","specialization"];
  const archimate = {
    id:"archimate@2",name:"archimate",version:2,completeness:"complete",
    entityTypes:[
      {id:"element",label:"Element",abstract:true,attributes:[]},
      ...catalogue.map(c=>({
        id:c.id,label:c.name,supertypes:["element"],
        ...(c.id==="grouping"?{container:true}:{}),
        attributes:[
          ...(c.id==="junction"?
            [enumeration("operator",["and","or"],true)]:
            [text("name",200,c.id!=="grouping")]),
          ...(c.layer==="none"?[]:[enumeration("layer",[c.layer],true)]),
          enumeration("aspect",[c.aspect])
        ]
      }))
    ],
    portTypes:[],
    relationTypes:[
      ...relationshipIds.map(id=>({
        ...pair(id,undefined,["entity","relation"]),
        ...(id==="access"?{attributes:[
          enumeration("accessMode",["write","read","unspecified","read-write"])]}:
          id==="influence"?{attributes:[text("strength")]}:
          id==="association"?{attributes:[bool("directed")]}:{})
      })),
      hierarchy("groupingContainment","archimate-grouping","grouping",["element"])
    ],
    constraints:[
      {kind:"acyclic-hierarchy",hierarchyId:"archimate-grouping"},
      {kind:"relationship-matrix",matrixId:"archimate-3.2",
        sourceRole:"source",targetRole:"target",tuples},
      {kind:"incident-type-uniformity",matrixId:"archimate-3.2",entityType:"junction",relationTypes:relationshipIds}
    ],
    limits:{maxEndpointsPerRelation:2},notes:[]
  };
  const visibility = () =>
    enumeration("visibility",["public","protected","private","package"]);
  const stereotypes = () => ({name:"stereotypes",kind:"collection",
    item:{kind:"reference",refKind:"entity",targetTypes:["stereotype"]},maxItems:8});
  const common = () => [text("name",200,true),visibility(),stereotypes()];
  const multiplicity = name => ({name,kind:"struct",targetTypes:["multiplicity"]});
  const aggregation = name => enumeration(name,["none","shared","composite"]);
  const generalization = pair("generalization",["class","interface"]);
  generalization.hierarchy = {id:"uml-generalization",shape:"dag",
    parentRole:"target",childRole:"source"};
  const uml = {
    id:"uml@2",name:"uml",version:2,completeness:"complete",
    entityTypes:[
      {id:"class",label:"Class",attributes:[...common(),bool("abstract"),bool("isStatic")]},
      {id:"interface",label:"Interface",attributes:common()},
      {id:"package",label:"Package",container:true,attributes:common()},
      {id:"property",label:"Property",attributes:[...common(),text("typeName",200),
        multiplicity("multiplicity"),bool("isDerived"),bool("isStatic")]},
      {id:"operation",label:"Operation",attributes:[...common(),
        text("returnTypeName",200),bool("isStatic")]},
      {id:"stereotype",label:"Stereotype",attributes:[text("name",60,true),
        {name:"extends",kind:"collection",required:true,
          item:{kind:"enum",values:["class","interface","package","property","operation"]},
          minItems:1,maxItems:5}]},
      {id:"multiplicity",label:"Multiplicity",abstract:true,attributes:[
        {name:"lower",kind:"quantity",required:true,units:["unit"],
          integer:true,min:0,max:9007199254740991},
        {name:"upper",kind:"quantity",required:true,units:["unit"],
          integer:true,min:-1,max:9007199254740991},
        bool("isOrdered"),bool("isUnique")]}
    ],
    portTypes:[],
    relationTypes:[
      {...pair("association",["class","interface"]),attributes:[
        multiplicity("sourceMultiplicity"),multiplicity("targetMultiplicity"),
        aggregation("sourceAggregation"),aggregation("targetAggregation")]},
      generalization,pair("dependency"),
      hierarchy("packageContainment","uml-package-containment","package")
    ],
    constraints:[
      {kind:"acyclic-hierarchy",hierarchyId:"uml-package-containment"},
      {kind:"acyclic-hierarchy",hierarchyId:"uml-generalization"},
      {kind:"bound-pair",valueType:"multiplicity",lowerField:"lower",
        upperField:"upper",unboundedUpper:-1},
      {kind:"reference-application",attribute:"stereotypes",
        declarationType:"stereotype",allowedTypesField:"extends"},
      {kind:"at-most-value",relationType:"association",
        attributes:["sourceAggregation","targetAggregation"],value:"composite",max:1},
      {kind:"collection-unique",entityType:"stereotype",attribute:"extends"}
    ],
    limits:{maxEndpointsPerRelation:2},notes:[]
  };
  return {archimate,uml};
}
~~~

No authored @1 value is inferred from these schema choices. In particular source stereotype references and concrete ArchiMate type mappings are explicit migration inputs. Abstract schema declarations cannot occur as Entity instances; concrete catalogue types and typed K6 values use their respective schema interpretation in §§3.9/3.11. These **draft declaration digests** identify the exact expansion below; they are not admitted production Pins or executor qualification.

| Draft declaration | P-CONTENT-DIAGRAM bytes | contentDigest | Full RFC 8785 artifactDigest |
| --- | --- | --- | --- |
| archimate@2 | 1047531 | 1ffa38c1169b43d932b7c6d69cea24b52dd753f0f4e14eb43f6e83746cce1189 | b7dd36d534e1aceb42d2aff433a1988f462a9eeaefe58bc541a3d6936a95b267 |
| uml@2 | 5068 | d7da59f277c0f4216a32c201dacdb837270e687ef5d8b1838f00f083e14f9e96 | ab6cf4de23ad003f376239a23a0bae3adec929b7866edb1e0adeaa4156cdba41 |

ArchiMate corpus definition is finite and closed: the source order's 62×62 ordered concept pairs × the 11 declared relationship ids = 42,284 cases; each expanded tuple yields an allowed case and every absent tuple yields a rejection. @relation witnesses use real relation targets/occurrences under §3.9.1, never entity stubs. Case builders allocate local fixture identities from the canonical case input's SHA-256 and retain that preimage; generated production/corpus artifact ids remain unverified U-QUAL until published by Engram. Additional cases cover both junction operators, mixed incident types, all four accessMode values, influence text, association direction, refinement resolution, grouping cycles, dangling relation targets, occurrence attachments, forward/cyclic lookup termination and exact migration/downgrade refusal. Each negative has its literal diagnostic in Appendix C or the unchanged native arm.

UML corpus includes every Appendix A.2 value, property plus both association ends, absent optional values, required lower/upper, non-quantity fields, max/min/integer/unit checks, all five extends kinds, dangling/wrong-type/inapplicable stereotypes, duplicate extends, two composite ends, generalization cycles and the pinned fixture's successful/safely refused migration variants. No mutation is repaired or silently coerced. Execution and receipt issuance belong to U-QUAL, not these expected case definitions.

## Appendix B — Worked folded projections

**B.1 Single fold.** Document (fragment): containers `MSGZ` (collapsed in the view), cards `CHAT` (outside `MSGZ`) and `TOPIC` (contained in `MSGZ`); semantic relation `link` `CHAT → TOPIC`. Source view: occurrences `occurrence:CHAT`, `occurrence:MSGZ`, `occurrence:TOPIC`; `occurrence:TOPIC` names the fold group of `occurrence:MSGZ`; that group (`occurrence: occurrence:MSGZ`) is `collapsed: true`.

Projection (§4.4.3) with collapsed set `{occurrence:MSGZ}`: `occurrence:TOPIC` is hidden by fold; its visible representative is `occurrence:MSGZ` (the only, hence outermost, collapsed ancestor occurrence). The relation occurrence becomes: source endpoint `{ role: "source", occurrence: occurrence:CHAT }` (unchanged, no provenance fields); target endpoint `{ role: "target", occurrence: occurrence:MSGZ, semanticTarget: "entity:TOPIC", sourceOccurrence: occurrence:TOPIC }`. Laid out by `layoutFolded`, `occurrence:MSGZ` takes the `460 × 200` collapsed box and the edge routes representative-anchor to representative-anchor; the source geometry of `occurrence:TOPIC` stays on its retained record.

Validation (§4.4.4): `entity:TOPIC` is a target of the semantic relation for role `target`; `sourceOccurrence` draws it; the `MSGZ` occurrence exists, is visible and is folded; walking parent occurrences from `occurrence:TOPIC` reaches `occurrence:MSGZ` through the collapsed group; `MSGZ` is in the container family. Zero diagnostics. Removing `semanticTarget` makes the same view refuse `occurrence-endpoint-mismatch`, which is the RED state of the current executor on this input and the first test of `packages/diagram-core/tests/folded-view.test.ts`. Unfolding is `projectView(document, sourceView, ∅)`, whose target endpoint is again `{ occurrence: occurrence:TOPIC }` byte-identically (no patched residue, no materialised `strokeStyle`).

**B.2 Nested fold.** Add ancestors `PPROZ` (contains `MSGZ`) and `GCP`/`PRODZ` above it, all collapsed, with `TOPIC` inside `MSGZ`. Collapsed set `{occurrence:GCP…, occurrence:PPROZ, occurrence:MSGZ}` (every ancestor occurrence folded). The representative of `occurrence:TOPIC` is the **outermost** collapsed ancestor occurrence (the root-most folded one), which is visible because nothing above it is folded. The inner folded occurrences (`MSGZ`, `PPROZ`) are hidden and are never selected; a hand-written projection naming `occurrence:MSGZ` as representative refuses with detail `projection-not-outermost` (and would have drawn to a hidden occurrence). Collapsing only `MSGZ` (ancestors expanded) selects `occurrence:MSGZ`, as in B.1. Both folded views validate, and each unfold step is a fresh `projectView` from the retained source view.

**B.3 N-ary association across two collapsed branches.** An `association` with members `occurrence:A1` (inside collapsed `occurrence:ZONE-A`), `occurrence:B1` (inside collapsed `occurrence:ZONE-B`) and `occurrence:EXT` (outside any fold). Representatives: `occurrence:ZONE-A`, `occurrence:ZONE-B`, `occurrence:EXT` — three distinct representatives with folds involved, so the occurrence is projected (each endpoint independently, provenance per endpoint), never internal, and validates. Collapsing further so that all three representatives coincide (one outer zone folded over both branches and the external member drawn inside it) makes the representative set a single element with a fold involved: the occurrence becomes internal and draws nothing. With no fold at all, three coincident representatives cannot arise from distinct visible occurrences, and a visible self-link stays untouched (§4.4.1).

**B.4 Authored solid summary with a separate dashed group.** Source relations are relation:r-solid (CHAT→TOPIC) and relation:r-dashed (CHAT→SUB), with TOPIC/SUB under MSGZ. occurrence:r-solid has strokeStyle absent; occurrence:r-dashed has strokeStyle dashed. The retained source view carries:

~~~json
{
  "sum:overview-chat": {
    "id": "sum:overview-chat",
    "sourceOccurrence": "occurrence:CHAT",
    "targetOccurrence": "occurrence:MSGZ",
    "label": "Chat events",
    "relationIds": ["relation:r-solid"],
    "strokeStyle": "solid"
  }
}
~~~

Source candidate matching includes the solid occurrence only because the definition selects style solid. The dashed relation is not a missing constituent. With MSGZ collapsed, the two occurrences form two aggregate keys, (occurrence:CHAT,occurrence:MSGZ,solid) and the corresponding dashed key. The solid key has exactly one candidate and draws "Chat events"; the dashed key has no definition and may draw its localized count. Both relation ids remain conserved. A second solid definition for the same source triple refuses summary-duplicate-key. Export retains the authored label, style and exact constituent id.

**B.5 Distinct source definitions colliding after projection.** P contains C; one solid relation C→X has one occurrence. Definition s1 for (occurrence:P,occurrence:X,solid) and s2 for (occurrence:C,occurrence:X,solid) both name that relation and validate in the source. Collapsing P maps both selected occurrence sets onto (occurrence:P,occurrence:X,solid). Source-key uniqueness alone cannot decide them. §4.5.2 refuses the derived result with summary-active-key-conflict on s2, firstId=s1; no label is selected. Deleting either definition restores a unique candidate.

**B.6 Same relation in two drawings.** C has drawings occurrence:C1/C2 under different parent drawings. A relation has occurrences occurrence:r1/r2; only r1 crosses the source definition's occurrence scope. r2 cannot become its constituent merely because relationIds agrees. Where several same-relation occurrences cross the same scope, relationOccurrences is required; ambiguity is a source refusal, not a guessed aggregate.

**B.7 ArchiMate relation-to-relation folded target.** The complete fixture mutation and expected record fragments are in C.6 under the descriptive name "ArchiMate folded relation-to-relation". It reuses the pinned ArchiMate document's entity/relation identities and occurrence strings already present in B/C; its case id is computed from the pinned raw bytes and canonical mutation, never assigned arbitrarily. All edits after the explicit @2 migration are authored fixture changes. Retype entity:junction as grouping with a name and no junction operator. Retype relation:serving as groupingContainment (parent entity:junction, child entity:actor), relation:assignment as association (entity:junction → entity:actor), and relation:flow as association (entity:component → relation:assignment). The two association tuples are grouping→business-actor and application-component→@relation, both admitted by their own o cells; groupingContainment is the separate hierarchy, outside the matrix.

The source fragment draws the grouping as occurrence:Z, its actor child as occurrence:A1 and the external application component as occurrence:EXT. The group key/id reuses the string occurrence:Z; its occurrence binding is occurrence:Z and the actor's group is that same key. Target relation:assignment is drawn by occurrence:flow, with a finite source polyline; attaching relation:flow is drawn by occurrence:r. These deliberately distinct relation/occurrence bindings are resolved by their fields, not by suffix matching. The enclosing valid view identity is supplied by the fixture harness; semanticDocumentId and revision are retained from the pinned document. No new view id or contract pin is fabricated.

With collapsed set {occurrence:Z}, occurrence:A1 is hidden and occurrence:Z stays visible. The first worklist round maps occurrence:flow to occurrence:Z: both endpoints have that representative and the actor endpoint supplies the fold witness. occurrence:r stays external because its representatives are occurrence:EXT and occurrence:Z. Its projected target is exactly {role:"target",occurrence:"occurrence:Z",semanticTarget:"relation:assignment",sourceOccurrence:"occurrence:flow"}. The target occurrence:flow is retained byte for byte with its original endpoints and waypoints, and excluded as endpoint-hidden; actor occurrence:A1 is excluded as group-collapsed; occurrence:r draws to the collapsed container anchor. The expected semantic/view diagnostic arrays are []; scene exclusions are not diagnostics. projectView keeps source geometry; layoutFolded subsequently measures/places the 460 × 200 collapsed card. revision remains 1 and semantic bytes remain unchanged by the fold.

Unfolding from the retained source with the empty collapsed set restores occurrence:r's target {role:"target",occurrence:"occurrence:flow"}, with both provenance fields absent, and restores both relation records byte for byte. If the target relation instead crosses the container boundary, it stays visible with its own projected endpoints; the attaching endpoint continues to name occurrence:flow without provenance and uses the retained route midpoint (§3.9.1). That state never substitutes an endpoint entity for the target RelationRef.

C.6 gives three isolated negative variants of the valid folded fragment: remove sourceOccurrence → provenance-missing; replace it with occurrence:r (which draws relation:flow, not relation:assignment) → provenance-mismatch; clear the collapsed set while retaining the projected endpoint → projection-not-folded. Each expects one literal diagnostic at relationOccurrences.occurrence:r.endpoints[1].occurrence, with refs [occurrence:r,occurrence:Z]. The separate pre-existing relation-target-hidden case is an unsupported host suppression mask without a fold witness, not the expected result of this valid collapse. All outcomes are specification oracles; no executor run is asserted.


## Appendix C — Exact diagnostic contracts

### C.1 Inventory, shape and ordering

Native Diagnostic shape is §2.2, copied without renaming: code, severity, path, message, optional refs/details. Scalar details only. Every **new** arm below includes refs/details exactly as shown, including [] when empty. Substitutions are raw native string ids/type/attribute names, or finite numbers. Entity/relation/port recordPath is the actual dotted native record path; collection indices append [i]. No RFC 6901 conversion occurs inside the native object.

The complete native baseline inventory (50 codes, DS diagnostics.ts at the pinned DS revision) is:

`dangling-reference`, `reference-type-mismatch`, `hierarchy-cycle`, `attribute-not-in-schema`, `quantity-unit-missing`, `collection-bound-exceeded`, `unknown-schema-major`, `revision-conflict`, `extension-unsupported`, `malformed-ref`, `duplicate-id`, `record-key-mismatch`, `schema-version-malformed`, `schema-migration-required`, `document-not-an-object`, `unknown-profile`, `profile-not-declared`, `unknown-entity-type`, `unknown-relation-type`, `unknown-port-type`, `type-definition-conflict`, `attribute-type-mismatch`, `attribute-required-missing`, `enum-value-not-allowed`, `quantity-unit-not-allowed`, `text-too-long`, `date-not-iso8601`, `unique-attribute-violation`, `endpoint-role-unknown`, `endpoint-cardinality-violation`, `endpoint-target-not-allowed`, `hierarchy-multiple-parents`, `port-direction-not-allowed`, `port-owner-mismatch`, `view-document-mismatch`, `revision-divergence`, `occurrence-endpoint-mismatch`, `value-not-finite`, `value-not-serialisable`, `limit-exceeded`, `unknown-command`, `target-already-exists`, `target-missing`, `delete-policy-required`, `delete-policy-refused`, `placement-kind-mismatch`, `inverse-budget-exceeded`, `extension-hash-mismatch`, `extension-source-not-retained`, `view-already-exists`.

Exactly seventeen code additions are required across this lot and its explicitly shared K1/K2/K6 prerequisites:

`legend-key-parent-invalid`, `tone-category-unknown`, `text-pattern-mismatch`, `quantity-not-integer`, `quantity-below-min`, `quantity-above-max`, `relationship-matrix-violation`, `multiplicity-invalid`, `stereotype-application-invalid`, `reference-target-type`, `struct-type-unknown`, `struct-field-not-in-schema`, `struct-type-not-allowed`, `supertype-unknown`, `supertype-cycle`, `attribute-conflict`, `abstract-instantiated`.

The four K2/K6 codes and the four K1 codes are transcribed from A′ and qualified with that kernel; their literal native arms are given below and they are not renamed implementations. All other modified cases reuse an existing code. No seenChain is added to any retained endpoint diagnostic. There is **no global sort** of a native array. Legacy stages/record iteration and 610c0353 uniqueness order remain exact. New per-check iteration is §5.3. Separate G0 enriched copies retain original native indices and invert to the native array exactly.

Layout/rendering codes are separate and **not** DiagnosticCode additions: card-overflow, zone-overflow, docking-overflow; card-icon-unknown and zone-icon-unknown. Their values enter layout/render results, not semantic validation receipts. Migration reason strings (missing-type-mapping, multiplicity-syntax, unmapped-stereotype, missing-presentation-destination, incompatible-attribute-schema) belong to the report, not this union.

### C.2 Literal semantic/scalar arms

All rows have severity error. id/path substitutions are raw M2 nominal references; type/attribute/constraint names are exact declaration strings. allowed is a comma-joined declaration-order list unless stated. No unnamed detail alternative exists.

| Arm | Code / path | Literal message | Exact refs | Exact details |
| --- | --- | --- | --- | --- |
| Wrong child under legend | legend-key-parent-invalid / entities.<childId> | key entity <childId> is contained by legend <parentId>; only legend-key entities may be contained by a legend | [childId,parentId] | {childType,parentType,constraint:"children-restricted"} |
| Key under wrong parent | legend-key-parent-invalid / entities.<childId> | key entity <childId> is contained by <parentId>, which is outside the legend family; a legend-key must be contained by a legend | [childId,parentId] | {childType,parentType,constraint:"required-parent"} |
| Orphan key | legend-key-parent-invalid / entities.<childId> | key entity <childId> has no hierarchy parent; a legend-key must be contained by a legend | [childId] | {childType,parentType:"none",constraint:"required-parent"} |
| Text pattern | text-pattern-mismatch / <recordPath>.attributes.<attribute> or the exact typed view text/icon/token field | value does not match the <patternName> grammar | [] | {pattern:patternName,length:value.length,maxLength} if declared, otherwise exactly {pattern:patternName,length:value.length} |
| Minimum only | text-pattern-mismatch / same actual value path | value is shorter than the minimum length for <attribute> | [] | {pattern:"min-length",length:value.length,minLength} |
| Integer | quantity-not-integer / <recordPath>.attributes.<attribute> (including .fields.<field>) | value <value> is not an integer | [] | {value,integer:"required"} |
| Below bound | quantity-below-min / same actual value path | value <value> is below the minimum <min> | [] | {value,min} |
| Above bound | quantity-above-max / same actual value path | value <value> is above the maximum <max> | [] | {value,max} |
| Scoped duplicate | unique-attribute-violation / entities.<reportedId>.attributes.<attribute> | attribute <attribute> must be unique among <entityType> entities in scope <scope>; <referenceId> carries the same value | [reportedId,referenceId] | {attribute,type:entityType,scope} |
| Legacy duplicate | unique-attribute-violation / entities.<reportedId>.attributes.<attribute> | attribute <attribute> must be unique among <entityType> entities; <referenceId> carries the same value | [reportedId,referenceId] | {attribute,type:entityType}, no scope |
| Wrong endpoint kind, unchanged | endpoint-target-not-allowed / relations.<relationId>.endpoints[<i>].target | role <role> accepts <targets joined ", ">, not a <seenKind> | [endpointTarget] | {seenKind,allowed:targets joined ","} |
| Wrong endpoint type, unchanged | endpoint-target-not-allowed / relations.<relationId>.endpoints[<i>].target | role <role> accepts entity types <entityTypes joined ", ">; <targetId> is a <seenType> | [targetId] | {seenType,allowed:entityTypes joined ","} |
| Matrix pair | relationship-matrix-violation / relations.<relationId>.endpoints | relation <relationId> of type <relationType> is not allowed from <sourceType> to <targetType> by matrix <matrixId> | [relationId,sourceId,targetId] | {matrixId,relationType,sourceType,targetType} |
| Multiplicity pair | multiplicity-invalid / <recordPath>.attributes.<attribute> | multiplicity lower <lower> exceeds finite upper <upper> | [] | {lower,upper,constraint:"bound-pair"} |
| Stereotype target application | stereotype-application-invalid / <recordPath>.attributes.<attribute>[<i>] | stereotype <stereotypeId> cannot be applied to type <targetType> | [targetId,stereotypeId] | {attribute,targetType,allowed} |
| K2 reference type | reference-target-type / exact reference attribute/item path | reference target <targetId> has type <seenType>; allowed types are <allowed joined ", "> | [targetId] | {seenType,allowed:allowed joined ","} |
| K6 unknown type | struct-type-unknown / exact struct value path | structured value type <typeId> is not declared | [] | {type:typeId} |
| K6 unknown field | struct-field-not-in-schema / <structPath>.fields.<field> | field <field> is not declared by structured type <typeId> | [] | {type:typeId,field} |
| K6 forbidden type | struct-type-not-allowed / exact struct value path | structured type <typeId> is not allowed here; allowed types are <allowed joined ", "> | [] | {type:typeId,allowed:allowed joined ","} |

| Junction incidence | relationship-matrix-violation / entities.<entityId> | junction <entityId> connects incompatible relation types <relationTypes joined ", "> | [entityId,...incidentRelationIds] | {matrixId,constraint:"incident-type-uniformity",relationTypes:relationTypes joined ","} |
| Exclusive aggregation ends | multiplicity-invalid / relations.<relationId>.attributes | relation <relationId> has <count> <value> ends; at most <max> is allowed | [relationId] | {count,max,constraint:"at-most-value"} |
| Duplicate typed item | collection-bound-exceeded / <recordPath>.attributes.<attribute>[<duplicateIndex>] | collection <attribute> repeats item <duplicateIndex>; first occurrence is <firstIndex> | [] | {constraint:"collection-unique",firstIndex,duplicateIndex} |
| Unknown K1 parent | supertype-unknown / profiles.<profileId>.entityTypes.<typeId>.supertypes[<i>] | supertype <supertype> is not declared | [] | {supertype} |
| K1 cycle | supertype-cycle / profiles.<profileId>.entityTypes.<typeId>.supertypes | supertype chain for <typeId> is cyclic | [] | {type:typeId} |
| K1 inherited conflict | attribute-conflict / profiles.<profileId>.entityTypes.<typeId>.attributes.<attribute> | inherited attribute <attribute> has incompatible schemas on <typeId> | [] | {attribute,type:typeId} |
| Abstract Entity | abstract-instantiated / entities.<entityId>.type | abstract type <typeId> cannot be instantiated as an entity | [entityId] | {type:typeId} |

K1 declaration resolution walks declared types/supertypes in order, depth-first left-to-right as transcribed in §2.3/A′. Unknown parent/cycle suppresses descendant effective-schema checks; attribute-conflict names each conflicting field once after valid parents resolve. Abstract Entity checking follows successful type resolution and refuses identity instantiation before checking its fields. These additions do not change retained @1 diagnostics.

scope is exactly document, siblings or within:<typeId>. Duplicate multiplicity is one diagnostic per later id in each group, never one per pair. Legend parent arms are one per violating child, with the first applicable arm chosen in table order (wrong child is not also treated as a key). Pattern maxLength-presence is determined by the schema, never arbitrarily omitted. Missing/dangling refs use their existing code before target type/application checks.

### C.3 Category and presentation arms

| Arm | Code / path | Literal message | Exact refs | Exact details |
| --- | --- | --- | --- | --- |
| No declared category | tone-category-unknown / presentation.diagram.entities.<occurrenceId>.categoryRef (or exact projected category field) | category <value> on occurrence <occurrenceId> is not declared by any legend in this document | [occurrenceId] | {value,legendBinding:"undeclared",categoryType:"legend-key"} |
| Ambiguous token binding | tone-category-unknown / same category field | category <value> on occurrence <occurrenceId> resolves ambiguously across legends; set categoryRef to bind it | [occurrenceId] | {value,legendBinding:"ambiguous",categoryType:"legend-key"} |
| Bound target wrong kind | tone-category-unknown / presentation.diagram.categoryTokens[<i>].legendRef | legendRef names <targetId>, which is not a legend | [targetId] | {value:category,legendBinding:"bound-target-not-legend",categoryType:"legend-key"} |

For view-contract shape failures use occurrence-endpoint-mismatch with path equal to the precise failing presentation field, message "diagram presentation fails check <check>", refs [] and details {check}, where **each literal arm** is:
presentation-shape-invalid (unknown/missing/wrong-typed closed field),
form-selector-mismatch (form disagrees with resolved type capability),
legend-order-invalid (missing/extra/duplicate key in the ordered list),
token-binding-conflict (duplicate (legendRef,category) rows),
presentation-pin-mismatch (resolved bytes fail a pin, input.contractPin differs from DiagramPresentation.contractPin/resolved contract pin, adapterPin differs from catalog ontology.compatibility.adapter, or the adapter schema binding differs from artifactBinding.schemaPin).
These are the complete check strings, not an open detail enum. Path selection is deterministic: presentation-shape-invalid names the offending leaf (or its missing field), form-selector-mismatch names .form, legend-order-invalid names .order, token-binding-conflict names the later conflicting categoryTokens[i] row, and presentation-pin-mismatch names presentation.diagram.contractPin for contract disagreement/bytes, input.adapterPin for adapter input/catalog disagreement, or the catalog binding contract field for a schema-binding disagreement. The five mutation oracles below use an otherwise valid card occurrence n, legend occurrence l with direct key k, and an initial (entity:l,risk,danger) token binding. Adapter disagreement is checked before selector/value validation and also refuses under presentation-pin-mismatch; it never falls through to a candidate view. Dangling nominal references use dangling-reference at the exact field with message "presentation reference <targetId> does not resolve", refs [targetId], details {}. A wrong reference namespace uses reference-type-mismatch with message "presentation reference <targetId> must be a <expectedKind>", refs [targetId], details {expectedKind}. Unknown profile/schema resolution remains the existing unknown-profile/G0 missing-receipt discipline, not a new unlisted native code.

### C.4 Projection and summary arms

All new projection arms use code occurrence-endpoint-mismatch, severity error, path relationOccurrences.<relationOccurrenceId>.endpoints[<i>].occurrence, message "projected endpoint for role <role> fails check <check>", refs [relationOccurrenceId,drawnOccurrenceId], details exactly {role,check}. Each literal check and its complete predicate is:

| check | Predicate that fails |
| --- | --- |
| representative-hidden | Drawn representative exists but is hidden by a fold. |
| projection-not-folded | No entity/port collapsed-ancestor walk, or finite all-endpoint relation fold witness, connects original and drawn occurrences. |
| projection-not-outermost | Drawn occurrence is an inner folded ancestor while a higher folded ancestor exists. |
| representative-not-container | Drawn representative's resolved entity type (or counterpart port owner's type) has no container capability. The original semantic target may be a relation. |
| provenance-missing | semanticTarget present but sourceOccurrence absent. |
| provenance-mismatch | sourceOccurrence's entity/port/relation field does not equal semanticTarget in its nominal namespace, or semanticTarget is not a role target. |
| projection-source-projected | Caller passed a source endpoint already carrying semanticTarget. |

Missing occurrences first emit existing dangling-reference; ordinary unprojected mismatches keep the pinned native rule. New folded checks have this explicit first-failure priority: provenance, occurrence existence, ancestor walk/fold, outermost, visibility, capability. This priority applies to the predicates of §4.4.4 and determines which single projection failure is emitted for an endpoint; no final sort occurs. A hidden inner folded representative therefore yields projection-not-outermost before its visibility failure, matching Appendix B.2. Other hidden representatives yield representative-hidden. Neither path fabricates a valid view.

**Relation-target occurrence arms (§3.9.1).** The new adapter resolves drawn targets over all three occurrence maps, preserving the native endpoint mismatch shape:
{code:"occurrence-endpoint-mismatch",severity:"error",path:"relationOccurrences.<relationOccurrenceId>.endpoints[<i>].occurrence",message:"occurrence <occurrenceId> draws <drawnTarget>; role <role> of <relationId> targets <targets joined ', '>",refs:[occurrenceId,drawnTarget,...targets],details:{role}}.
A missing occurrence uses dangling-reference at the same path, message "<occurrenceId> is no entity, port or relation occurrence of this view", refs [occurrenceId], and no details. Those are new-adapter arms only; the @1 wording remains exactly "entity or port". A canonical fold retains all relation occurrence records and redirects attachments to an internal target's mapped container with RelationRef provenance; it does not refuse relation-target-hidden. That arm guards an explicit host request to suppress an otherwise visible target relation occurrence **without** the §4.4.1 fold witness (the projectedHiddenRelationOccurrences mask in the existing C.6 negative case, with no collapsed set). Refuse once per affected attachment with code occurrence-endpoint-mismatch, severity error, the same endpoint path, message "projected endpoint for role <role> fails check relation-target-hidden", refs [relationOccurrenceId,drawnOccurrenceId], details {role,check:"relation-target-hidden"}. This mask is a negative harness input, never a ViewDocument field. Ordinary filters still produce scene exclusions with their filter cause (§4.4.6), not this refusal. Finite lookup precedes fold classification; no partial candidate is emitted. The positive folded-target fixture and its isolated provenance/stale-fold diagnostics are in B.7/C.6.

Summary arms use occurrence-endpoint-mismatch, path summaryLabels.<summaryId>, message "summary definition <summaryId> fails check <check>", refs [summaryId,sourceOccurrence,targetOccurrence].
- summary-constituents-mismatch: details {check:"summary-constituents-mismatch"}.
- summary-duplicate-key: details {check:"summary-duplicate-key",firstId}.
- summary-occurrence-ambiguous: details {check:"summary-occurrence-ambiguous",relationId}.
- summary-active-key-conflict: details {check:"summary-active-key-conflict",firstId,sourceRepresentative,targetRepresentative,strokeStyle}.
A source-valid inactive definition emits **nothing**. Active conflicts are emitted after projection in UTF-16 definition-id order, one per conflicting candidate after firstId. That first id is a diagnostic reference, not a winning active label.

### C.5 Declaration/resolver arms

Each row uses type-definition-conflict, severity error, refs [], and exactly the stated details:

| Predicate | Path | Literal message | Exact details |
| --- | --- | --- | --- |
| Missing new-format scope | profiles.<profileId>.constraints[<i>] | unique-attribute constraint for <typeId>.<attribute> requires an explicit scope | {check:"unique-scope-missing",type:typeId,attribute} |
| Illegal abstract container | profiles.<profileId>.entityTypes[<i>] | abstract type <typeId> cannot declare container capability | {check:"abstract-container",type:typeId} |
| Invalid text grammar/bounds | <schemaPath> | text schema for <attribute> has an invalid pattern or length bounds | {check:"text-pattern-invalid",attribute} |
| Invalid numeric bounds | <schemaPath> | quantity schema for <attribute> has invalid numeric bounds | {check:"numeric-constraint-invalid",attribute} |
| Resolver base cycle | typeDefinitions.<definitionId>.baseType | type definition <definitionId> closes base cycle <cycle> | {check:"resolution-cycle",cycle} |
| Invalid matrix declaration | profiles.<profileId>.constraints[<i>] | relationship matrix <matrixId> has an invalid or duplicate tuple | {check:"matrix-constraint-invalid",matrixId} |

cycle is the visited chain joined with ">", including the repeated closing id. Missing bases use unknown-entity-type before a cycle check. A real redeclaration retains the pinned native literal:
path typeDefinitions.<id>.attributes.<attribute>;
message "type definition <id> redeclares <attribute>, which base type <baseType> already declares; refinements are additive only";
details {attribute,baseType}; **refs absent**, matching the native source. A migration's incompatible-bound refusal lives in unmigrated rather than inventing a misleading successful declaration.

### C.6 Concrete diagnostic object oracles

The following concrete objects instantiate every added code and every new arm family. They are fixture expectations, not the output of a claimed run. The templates above define substitution/multiplicity for all records; the JSON fixes optional-field presence and scalar detail encoding.

The ten computed case ids below use Node and "case_" + SHA-256(raw sourcePin file bytes || UTF-8("\n") || RFC 8785(mutation)), with no trailing newline after the mutation. name is a descriptive label, never a resolvable entity/profile id. Their sourcePin paths/hashes are in §8.5. Mutations isolate the named check in the already valid @2 declaration/document context: relation and entity fragments replace the corresponding isolated input, and declaration mutations precede document checks. The B.7 mutation first applies the §3.9.1 migration with its explicit entityMappings, then replaces the listed entity/relation records and installs its sourceViewFragment in the enclosing valid view. Omitted standard view fields retain the harness's valid values; semanticDocumentId = the pinned documentId and revision = 1. Its three variants are independent mutations of the expected folded fragment. The deliberately missing parent name in the negative K1 case is expected to fail resolution; it is not presented as a source id. Full corpus execution remains U-QUAL.

~~~json
[
  {
    "id": "legend-wrong-child",
    "expected": [
      {
        "code": "legend-key-parent-invalid",
        "severity": "error",
        "path": "entities.entity:n",
        "message": "key entity entity:n is contained by legend entity:l; only legend-key entities may be contained by a legend",
        "refs": [
          "entity:n",
          "entity:l"
        ],
        "details": {
          "childType": "node",
          "parentType": "legend",
          "constraint": "children-restricted"
        }
      }
    ]
  },
  {
    "id": "legend-wrong-parent",
    "expected": [
      {
        "code": "legend-key-parent-invalid",
        "severity": "error",
        "path": "entities.entity:k",
        "message": "key entity entity:k is contained by entity:c, which is outside the legend family; a legend-key must be contained by a legend",
        "refs": [
          "entity:k",
          "entity:c"
        ],
        "details": {
          "childType": "legend-key",
          "parentType": "container",
          "constraint": "required-parent"
        }
      }
    ]
  },
  {
    "id": "legend-orphan",
    "expected": [
      {
        "code": "legend-key-parent-invalid",
        "severity": "error",
        "path": "entities.entity:k",
        "message": "key entity entity:k has no hierarchy parent; a legend-key must be contained by a legend",
        "refs": [
          "entity:k"
        ],
        "details": {
          "childType": "legend-key",
          "parentType": "none",
          "constraint": "required-parent"
        }
      }
    ]
  },
  {
    "id": "category-undeclared",
    "expected": [
      {
        "code": "tone-category-unknown",
        "severity": "error",
        "path": "presentation.diagram.entities.occurrence:n.categoryRef",
        "message": "category risk on occurrence occurrence:n is not declared by any legend in this document",
        "refs": [
          "occurrence:n"
        ],
        "details": {
          "value": "risk",
          "legendBinding": "undeclared",
          "categoryType": "legend-key"
        }
      }
    ]
  },
  {
    "id": "category-ambiguous",
    "expected": [
      {
        "code": "tone-category-unknown",
        "severity": "error",
        "path": "presentation.diagram.entities.occurrence:n.categoryRef",
        "message": "category risk on occurrence occurrence:n resolves ambiguously across legends; set categoryRef to bind it",
        "refs": [
          "occurrence:n"
        ],
        "details": {
          "value": "risk",
          "legendBinding": "ambiguous",
          "categoryType": "legend-key"
        }
      }
    ]
  },
  {
    "id": "category-wrong-legend",
    "expected": [
      {
        "code": "tone-category-unknown",
        "severity": "error",
        "path": "presentation.diagram.categoryTokens[0].legendRef",
        "message": "legendRef names entity:c, which is not a legend",
        "refs": [
          "entity:c"
        ],
        "details": {
          "value": "risk",
          "legendBinding": "bound-target-not-legend",
          "categoryType": "legend-key"
        }
      }
    ]
  },
  {
    "id": "pattern-bounded",
    "expected": [
      {
        "code": "text-pattern-mismatch",
        "severity": "error",
        "path": "presentation.diagram.entities.occurrence:n.icon",
        "message": "value does not match the key grammar",
        "refs": [],
        "details": {
          "pattern": "key",
          "length": 1,
          "maxLength": 40
        }
      }
    ]
  },
  {
    "id": "pattern-without-max",
    "expected": [
      {
        "code": "text-pattern-mismatch",
        "severity": "error",
        "path": "entities.entity:n.attributes.code",
        "message": "value does not match the key grammar",
        "refs": [],
        "details": {
          "pattern": "key",
          "length": 1
        }
      }
    ]
  },
  {
    "id": "minimum-only",
    "expected": [
      {
        "code": "text-pattern-mismatch",
        "severity": "error",
        "path": "entities.entity:n.attributes.code",
        "message": "value is shorter than the minimum length for code",
        "refs": [],
        "details": {
          "pattern": "min-length",
          "length": 0,
          "minLength": 1
        }
      }
    ]
  },
  {
    "id": "integer",
    "expected": [
      {
        "code": "quantity-not-integer",
        "severity": "error",
        "path": "entities.entity:p.attributes.multiplicity.fields.lower",
        "message": "value 0.5 is not an integer",
        "refs": [],
        "details": {
          "value": 0.5,
          "integer": "required"
        }
      }
    ]
  },
  {
    "id": "quantity-min",
    "expected": [
      {
        "code": "quantity-below-min",
        "severity": "error",
        "path": "entities.entity:p.attributes.multiplicity.fields.lower",
        "message": "value -1 is below the minimum 0",
        "refs": [],
        "details": {
          "value": -1,
          "min": 0
        }
      }
    ]
  },
  {
    "id": "quantity-max",
    "expected": [
      {
        "code": "quantity-above-max",
        "severity": "error",
        "path": "entities.entity:p.attributes.multiplicity.fields.upper",
        "message": "value 9007199254740992 is above the maximum 9007199254740991",
        "refs": [],
        "details": {
          "value": 9007199254740992,
          "max": 9007199254740991
        }
      }
    ]
  },
  {
    "id": "unique-scoped",
    "expected": [
      {
        "code": "unique-attribute-violation",
        "severity": "error",
        "path": "entities.entity:k2.attributes.category",
        "message": "attribute category must be unique among legend-key entities in scope within:legend; entity:k1 carries the same value",
        "refs": [
          "entity:k2",
          "entity:k1"
        ],
        "details": {
          "attribute": "category",
          "type": "legend-key",
          "scope": "within:legend"
        }
      }
    ]
  },
  {
    "id": "unique-legacy",
    "expected": [
      {
        "code": "unique-attribute-violation",
        "severity": "error",
        "path": "entities.entity:c2.attributes.name",
        "message": "attribute name must be unique among container entities; entity:c1 carries the same value",
        "refs": [
          "entity:c2",
          "entity:c1"
        ],
        "details": {
          "attribute": "name",
          "type": "container"
        }
      }
    ]
  },
  {
    "id": "endpoint-kind",
    "expected": [
      {
        "code": "endpoint-target-not-allowed",
        "severity": "error",
        "path": "relations.relation:r.endpoints[0].target",
        "message": "role source accepts entity, not a port",
        "refs": [
          "port:p"
        ],
        "details": {
          "seenKind": "port",
          "allowed": "entity"
        }
      }
    ]
  },
  {
    "id": "endpoint-type",
    "expected": [
      {
        "code": "endpoint-target-not-allowed",
        "severity": "error",
        "path": "relations.relation:r.endpoints[0].target",
        "message": "role source accepts entity types process; entity:p is a custom-process",
        "refs": [
          "entity:p"
        ],
        "details": {
          "seenType": "custom-process",
          "allowed": "process"
        }
      }
    ]
  },
  {
    "id": "matrix-reversed-pair",
    "expected": [
      {
        "code": "relationship-matrix-violation",
        "severity": "error",
        "path": "relations.relation:r.endpoints",
        "message": "relation relation:r of type access is not allowed from data-object to application-component by matrix archimate-3.2",
        "refs": [
          "relation:r",
          "entity:d",
          "entity:c"
        ],
        "details": {
          "matrixId": "archimate-3.2",
          "relationType": "access",
          "sourceType": "data-object",
          "targetType": "application-component"
        }
      }
    ]
  },
  {
    "id": "multiplicity-reversed",
    "expected": [
      {
        "code": "multiplicity-invalid",
        "severity": "error",
        "path": "entities.entity:p.attributes.multiplicity",
        "message": "multiplicity lower 3 exceeds finite upper 2",
        "refs": [],
        "details": {
          "lower": 3,
          "upper": 2,
          "constraint": "bound-pair"
        }
      }
    ]
  },
  {
    "id": "stereotype-application",
    "expected": [
      {
        "code": "stereotype-application-invalid",
        "severity": "error",
        "path": "entities.entity:i.attributes.stereotypes[0]",
        "message": "stereotype entity:s cannot be applied to type interface",
        "refs": [
          "entity:i",
          "entity:s"
        ],
        "details": {
          "attribute": "stereotypes",
          "targetType": "interface",
          "allowed": "class"
        }
      }
    ]
  },
  {
    "id": "typed-reference",
    "expected": [
      {
        "code": "reference-target-type",
        "severity": "error",
        "path": "entities.entity:i.attributes.stereotypes[0]",
        "message": "reference target entity:c has type class; allowed types are stereotype",
        "refs": [
          "entity:c"
        ],
        "details": {
          "seenType": "class",
          "allowed": "stereotype"
        }
      }
    ]
  },
  {
    "id": "struct-unknown",
    "expected": [
      {
        "code": "struct-type-unknown",
        "severity": "error",
        "path": "entities.entity:p.attributes.multiplicity",
        "message": "structured value type unknown-value is not declared",
        "refs": [],
        "details": {
          "type": "unknown-value"
        }
      }
    ]
  },
  {
    "id": "struct-field",
    "expected": [
      {
        "code": "struct-field-not-in-schema",
        "severity": "error",
        "path": "entities.entity:p.attributes.multiplicity.fields.ceiling",
        "message": "field ceiling is not declared by structured type multiplicity",
        "refs": [],
        "details": {
          "type": "multiplicity",
          "field": "ceiling"
        }
      }
    ]
  },
  {
    "id": "struct-type",
    "expected": [
      {
        "code": "struct-type-not-allowed",
        "severity": "error",
        "path": "entities.entity:p.attributes.multiplicity",
        "message": "structured type other-value is not allowed here; allowed types are multiplicity",
        "refs": [],
        "details": {
          "type": "other-value",
          "allowed": "multiplicity"
        }
      }
    ]
  },
  {
    "id": "presentation-shape-invalid",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "presentation.diagram.entities.occurrence:n.text.kicker",
        "message": "diagram presentation fails check presentation-shape-invalid",
        "refs": [],
        "details": {
          "check": "presentation-shape-invalid"
        }
      }
    ],
    "mutation": {
      "path": "presentation.diagram.entities.occurrence:n.text.kicker",
      "value": 7
    }
  },
  {
    "id": "form-selector-mismatch",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "presentation.diagram.entities.occurrence:n.form",
        "message": "diagram presentation fails check form-selector-mismatch",
        "refs": [],
        "details": {
          "check": "form-selector-mismatch"
        }
      }
    ],
    "mutation": {
      "path": "presentation.diagram.entities.occurrence:n.form",
      "value": "container"
    }
  },
  {
    "id": "legend-order-invalid",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "presentation.diagram.legends.occurrence:l.order",
        "message": "diagram presentation fails check legend-order-invalid",
        "refs": [],
        "details": {
          "check": "legend-order-invalid"
        }
      }
    ],
    "mutation": {
      "path": "presentation.diagram.legends.occurrence:l.order",
      "value": []
    }
  },
  {
    "id": "token-binding-conflict",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "presentation.diagram.categoryTokens[1]",
        "message": "diagram presentation fails check token-binding-conflict",
        "refs": [],
        "details": {
          "check": "token-binding-conflict"
        }
      }
    ],
    "mutation": {
      "path": "presentation.diagram.categoryTokens[1]",
      "value": {
        "legendRef": "entity:l",
        "category": "risk",
        "token": "danger"
      }
    }
  },
  {
    "id": "presentation-pin-mismatch",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "presentation.diagram.contractPin",
        "message": "diagram presentation fails check presentation-pin-mismatch",
        "refs": [],
        "details": {
          "check": "presentation-pin-mismatch"
        }
      }
    ],
    "mutation": {
      "path": "presentation.diagram.contractPin",
      "operation": "substitute-another-resolved-contract-pin"
    }
  },
  {
    "id": "representative-hidden",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "relationOccurrences.occurrence:r.endpoints[1].occurrence",
        "message": "projected endpoint for role target fails check representative-hidden",
        "refs": [
          "occurrence:r",
          "occurrence:Z"
        ],
        "details": {
          "role": "target",
          "check": "representative-hidden"
        }
      }
    ]
  },
  {
    "id": "projection-not-folded",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "relationOccurrences.occurrence:r.endpoints[1].occurrence",
        "message": "projected endpoint for role target fails check projection-not-folded",
        "refs": [
          "occurrence:r",
          "occurrence:Z"
        ],
        "details": {
          "role": "target",
          "check": "projection-not-folded"
        }
      }
    ]
  },
  {
    "id": "projection-not-outermost",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "relationOccurrences.occurrence:r.endpoints[1].occurrence",
        "message": "projected endpoint for role target fails check projection-not-outermost",
        "refs": [
          "occurrence:r",
          "occurrence:Z"
        ],
        "details": {
          "role": "target",
          "check": "projection-not-outermost"
        }
      }
    ]
  },
  {
    "id": "representative-not-container",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "relationOccurrences.occurrence:r.endpoints[1].occurrence",
        "message": "projected endpoint for role target fails check representative-not-container",
        "refs": [
          "occurrence:r",
          "occurrence:Z"
        ],
        "details": {
          "role": "target",
          "check": "representative-not-container"
        }
      }
    ]
  },
  {
    "id": "provenance-missing",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "relationOccurrences.occurrence:r.endpoints[1].occurrence",
        "message": "projected endpoint for role target fails check provenance-missing",
        "refs": [
          "occurrence:r",
          "occurrence:Z"
        ],
        "details": {
          "role": "target",
          "check": "provenance-missing"
        }
      }
    ]
  },
  {
    "id": "provenance-mismatch",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "relationOccurrences.occurrence:r.endpoints[1].occurrence",
        "message": "projected endpoint for role target fails check provenance-mismatch",
        "refs": [
          "occurrence:r",
          "occurrence:Z"
        ],
        "details": {
          "role": "target",
          "check": "provenance-mismatch"
        }
      }
    ]
  },
  {
    "id": "projection-source-projected",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "relationOccurrences.occurrence:r.endpoints[1].occurrence",
        "message": "projected endpoint for role target fails check projection-source-projected",
        "refs": [
          "occurrence:r",
          "occurrence:Z"
        ],
        "details": {
          "role": "target",
          "check": "projection-source-projected"
        }
      }
    ]
  },
  {
    "id": "summary-constituents-mismatch",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "summaryLabels.s2",
        "message": "summary definition s2 fails check summary-constituents-mismatch",
        "refs": [
          "s2",
          "occurrence:C",
          "occurrence:X"
        ],
        "details": {
          "check": "summary-constituents-mismatch"
        }
      }
    ]
  },
  {
    "id": "summary-duplicate-key",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "summaryLabels.s2",
        "message": "summary definition s2 fails check summary-duplicate-key",
        "refs": [
          "s2",
          "occurrence:C",
          "occurrence:X"
        ],
        "details": {
          "check": "summary-duplicate-key",
          "firstId": "s1"
        }
      }
    ]
  },
  {
    "id": "summary-occurrence-ambiguous",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "summaryLabels.s2",
        "message": "summary definition s2 fails check summary-occurrence-ambiguous",
        "refs": [
          "s2",
          "occurrence:C",
          "occurrence:X"
        ],
        "details": {
          "check": "summary-occurrence-ambiguous",
          "relationId": "relation:r"
        }
      }
    ]
  },
  {
    "id": "summary-active-key-conflict",
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "summaryLabels.s2",
        "message": "summary definition s2 fails check summary-active-key-conflict",
        "refs": [
          "s2",
          "occurrence:C",
          "occurrence:X"
        ],
        "details": {
          "check": "summary-active-key-conflict",
          "firstId": "s1",
          "sourceRepresentative": "occurrence:Z",
          "targetRepresentative": "occurrence:X",
          "strokeStyle": "solid"
        }
      }
    ]
  },
  {
    "id": "scope-required",
    "expected": [
      {
        "code": "type-definition-conflict",
        "severity": "error",
        "path": "profiles.generic@2.constraints[0]",
        "message": "unique-attribute constraint for legend-key.category requires an explicit scope",
        "refs": [],
        "details": {
          "check": "unique-scope-missing",
          "type": "legend-key",
          "attribute": "category"
        }
      }
    ]
  },
  {
    "id": "abstract-container",
    "expected": [
      {
        "code": "type-definition-conflict",
        "severity": "error",
        "path": "profiles.synthetic@2.entityTypes[0]",
        "message": "abstract type root cannot declare container capability",
        "refs": [],
        "details": {
          "check": "abstract-container",
          "type": "root"
        }
      }
    ]
  },
  {
    "id": "bad-text-schema",
    "expected": [
      {
        "code": "type-definition-conflict",
        "severity": "error",
        "path": "profiles.synthetic@2.entityTypes[0].attributes[0]",
        "message": "text schema for code has an invalid pattern or length bounds",
        "refs": [],
        "details": {
          "check": "text-pattern-invalid",
          "attribute": "code"
        }
      }
    ]
  },
  {
    "id": "bad-numeric-schema",
    "expected": [
      {
        "code": "type-definition-conflict",
        "severity": "error",
        "path": "profiles.synthetic@2.entityTypes[0].attributes[0]",
        "message": "quantity schema for count has invalid numeric bounds",
        "refs": [],
        "details": {
          "check": "numeric-constraint-invalid",
          "attribute": "count"
        }
      }
    ]
  },
  {
    "id": "type-cycle",
    "expected": [
      {
        "code": "type-definition-conflict",
        "severity": "error",
        "path": "typeDefinitions.a.baseType",
        "message": "type definition a closes base cycle a>b>a",
        "refs": [],
        "details": {
          "check": "resolution-cycle",
          "cycle": "a>b>a"
        }
      }
    ]
  },
  {
    "id": "bad-matrix",
    "expected": [
      {
        "code": "type-definition-conflict",
        "severity": "error",
        "path": "profiles.archimate@2.constraints[0]",
        "message": "relationship matrix archimate-3.2 has an invalid or duplicate tuple",
        "refs": [],
        "details": {
          "check": "matrix-constraint-invalid",
          "matrixId": "archimate-3.2"
        }
      }
    ]
  },
  {
    "id": "native-redeclaration",
    "expected": [
      {
        "code": "type-definition-conflict",
        "severity": "error",
        "path": "typeDefinitions.refined.attributes.name",
        "message": "type definition refined redeclares name, which base type node already declares; refinements are additive only",
        "details": {
          "attribute": "name",
          "baseType": "node"
        }
      }
    ]
  },
  {
    "id": "source-valid-inactive-summary",
    "expected": []
  },
  {
    "id": "solid-summary-does-not-include-dashed",
    "expected": []
  },
  {
    "id": "case_78e5757e7e2adade198869b77144b84085625a7380fd7035f9f64dc611833792",
    "mutation": {
      "path": "relations.relation:serving",
      "value": {
        "id": "relation:serving",
        "profile": "archimate@2",
        "type": "triggering",
        "endpoints": [
          {
            "role": "source",
            "target": "entity:process"
          },
          {
            "role": "target",
            "target": "entity:junction"
          }
        ],
        "attributes": {}
      }
    },
    "expected": [
      {
        "code": "relationship-matrix-violation",
        "severity": "error",
        "path": "entities.entity:junction",
        "message": "junction entity:junction connects incompatible relation types flow, triggering",
        "refs": [
          "entity:junction",
          "relation:flow",
          "relation:serving"
        ],
        "details": {
          "matrixId": "archimate-3.2",
          "constraint": "incident-type-uniformity",
          "relationTypes": "flow,triggering"
        }
      }
    ],
    "name": "junction-incident-types",
    "sourcePin": {
      "repository": "sent-tech-design-system",
      "revision": "f6f3ba3790696754b6e08b13b62148ef3556bc4e",
      "path": "packages/diagram-core/fixtures/valid/archimate-skeleton-document.json",
      "sha256": "8395ccc32ac25ae1354271817a3358bfe6f96243ecdfe2e5ef45ae1f48683951"
    }
  },
  {
    "id": "case_f579949420e664ed7b741494a57859dc9bc66a6f31d1ae799cdcedda3502cb88",
    "mutation": {
      "replacements": [
        {
          "path": "relations.relation:order-customer.attributes.sourceAggregation",
          "value": {
            "kind": "enum",
            "value": "composite"
          }
        },
        {
          "path": "relations.relation:order-customer.attributes.targetAggregation",
          "value": {
            "kind": "enum",
            "value": "composite"
          }
        }
      ]
    },
    "expected": [
      {
        "code": "multiplicity-invalid",
        "severity": "error",
        "path": "relations.relation:order-customer.attributes",
        "message": "relation relation:order-customer has 2 composite ends; at most 1 is allowed",
        "refs": [
          "relation:order-customer"
        ],
        "details": {
          "count": 2,
          "max": 1,
          "constraint": "at-most-value"
        }
      }
    ],
    "name": "two-composite-ends",
    "sourcePin": {
      "repository": "sent-tech-design-system",
      "revision": "f6f3ba3790696754b6e08b13b62148ef3556bc4e",
      "path": "packages/diagram-core/fixtures/valid/uml-skeleton-document.json",
      "sha256": "eea74144a37d9e44456278eeb36b06c5c2d7f9b4d19136a6b8ed3ce6ea3b08d8"
    }
  },
  {
    "id": "case_beb407b2578c63ce4a2619c23d081c167bba9ea97492285d586ed0d4c86efa68",
    "mutation": {
      "isolatedEntity": {
        "id": "entity:order",
        "profile": "uml@2",
        "type": "stereotype",
        "attributes": {
          "name": {
            "kind": "text",
            "value": "Order"
          },
          "extends": {
            "kind": "collection",
            "items": [
              {
                "kind": "enum",
                "value": "class"
              },
              {
                "kind": "enum",
                "value": "class"
              }
            ]
          }
        }
      }
    },
    "expected": [
      {
        "code": "collection-bound-exceeded",
        "severity": "error",
        "path": "entities.entity:order.attributes.extends[1]",
        "message": "collection extends repeats item 1; first occurrence is 0",
        "refs": [],
        "details": {
          "constraint": "collection-unique",
          "firstIndex": 0,
          "duplicateIndex": 1
        }
      }
    ],
    "name": "duplicate-extends",
    "sourcePin": {
      "repository": "sent-tech-design-system",
      "revision": "f6f3ba3790696754b6e08b13b62148ef3556bc4e",
      "path": "packages/diagram-core/fixtures/valid/uml-skeleton-document.json",
      "sha256": "eea74144a37d9e44456278eeb36b06c5c2d7f9b4d19136a6b8ed3ce6ea3b08d8"
    }
  },
  {
    "id": "case_9ddcf62fdc56e4d33af6aebb251fe1a5fa5988e548cf60b01c5f2a191998405f",
    "mutation": {
      "path": "profiles.uml@2.entityTypes.class.supertypes",
      "value": [
        "missing"
      ]
    },
    "expected": [
      {
        "code": "supertype-unknown",
        "severity": "error",
        "path": "profiles.uml@2.entityTypes.class.supertypes[0]",
        "message": "supertype missing is not declared",
        "refs": [],
        "details": {
          "supertype": "missing"
        }
      }
    ],
    "name": "supertype-unknown",
    "sourcePin": {
      "repository": "sent-tech-design-system",
      "revision": "f6f3ba3790696754b6e08b13b62148ef3556bc4e",
      "path": "packages/diagram-core/fixtures/valid/uml-skeleton-document.json",
      "sha256": "eea74144a37d9e44456278eeb36b06c5c2d7f9b4d19136a6b8ed3ce6ea3b08d8"
    }
  },
  {
    "id": "case_5de1e81a294931a03d5fd302d8a0f0c01819ef6936e399ec62264c8ab0b951b5",
    "mutation": {
      "path": "profiles.uml@2.entityTypes.class.supertypes",
      "value": [
        "class"
      ]
    },
    "expected": [
      {
        "code": "supertype-cycle",
        "severity": "error",
        "path": "profiles.uml@2.entityTypes.class.supertypes",
        "message": "supertype chain for class is cyclic",
        "refs": [],
        "details": {
          "type": "class"
        }
      }
    ],
    "name": "supertype-cycle",
    "sourcePin": {
      "repository": "sent-tech-design-system",
      "revision": "f6f3ba3790696754b6e08b13b62148ef3556bc4e",
      "path": "packages/diagram-core/fixtures/valid/uml-skeleton-document.json",
      "sha256": "eea74144a37d9e44456278eeb36b06c5c2d7f9b4d19136a6b8ed3ce6ea3b08d8"
    }
  },
  {
    "id": "case_8d9846b3f4e3afcab6230b4d2433ba9f1c9939769f59ddcfe0e63511ea169969",
    "mutation": {
      "replacements": [
        {
          "path": "profiles.uml@2.entityTypes.class.attributes",
          "value": []
        },
        {
          "path": "profiles.uml@2.entityTypes.class.supertypes",
          "value": [
            "interface",
            "package"
          ]
        },
        {
          "path": "profiles.uml@2.entityTypes.interface.attributes.name.maxLength",
          "value": 100
        }
      ]
    },
    "expected": [
      {
        "code": "attribute-conflict",
        "severity": "error",
        "path": "profiles.uml@2.entityTypes.class.attributes.name",
        "message": "inherited attribute name has incompatible schemas on class",
        "refs": [],
        "details": {
          "attribute": "name",
          "type": "class"
        }
      }
    ],
    "name": "attribute-conflict",
    "sourcePin": {
      "repository": "sent-tech-design-system",
      "revision": "f6f3ba3790696754b6e08b13b62148ef3556bc4e",
      "path": "packages/diagram-core/fixtures/valid/uml-skeleton-document.json",
      "sha256": "eea74144a37d9e44456278eeb36b06c5c2d7f9b4d19136a6b8ed3ce6ea3b08d8"
    }
  },
  {
    "id": "case_27deeb4c3575ac8f4aa268e9eeb08b822780ce0861684ff5fd1f71837500ef2c",
    "mutation": {
      "path": "entities.entity:order.type",
      "value": "multiplicity",
      "operation": "instantiate-abstract-identity-schema"
    },
    "expected": [
      {
        "code": "abstract-instantiated",
        "severity": "error",
        "path": "entities.entity:order.type",
        "message": "abstract type multiplicity cannot be instantiated as an entity",
        "refs": [
          "entity:order"
        ],
        "details": {
          "type": "multiplicity"
        }
      }
    ],
    "name": "abstract-instantiated",
    "sourcePin": {
      "repository": "sent-tech-design-system",
      "revision": "f6f3ba3790696754b6e08b13b62148ef3556bc4e",
      "path": "packages/diagram-core/fixtures/valid/uml-skeleton-document.json",
      "sha256": "eea74144a37d9e44456278eeb36b06c5c2d7f9b4d19136a6b8ed3ce6ea3b08d8"
    }
  },
  {
    "id": "case_fe922459c0772be776416003ee5450eb2b49d8f92f935556e3343370ff6f0525",
    "mutation": {
      "path": "input.adapterPin",
      "value": {
        "id": "fixture:executor",
        "version": "1",
        "contentDigest": "ab8bea23f592a350e1a668edc06320d9811816734788ad838dab04dbccac2eaa"
      }
    },
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "input.adapterPin",
        "message": "diagram presentation fails check presentation-pin-mismatch",
        "refs": [],
        "details": {
          "check": "presentation-pin-mismatch"
        }
      }
    ],
    "name": "adapter-pin-mismatch",
    "sourcePin": {
      "repository": "sent-tech-design-system",
      "revision": "f6f3ba3790696754b6e08b13b62148ef3556bc4e",
      "path": "packages/diagram-core/fixtures/valid/uml-skeleton-document.json",
      "sha256": "eea74144a37d9e44456278eeb36b06c5c2d7f9b4d19136a6b8ed3ce6ea3b08d8"
    }
  },
  {
    "id": "case_dfc9850a6f79aaa8301d79ab15a1ed73b74ce18550ad27d691d4afc31105c68b",
    "mutation": {
      "attachmentOccurrence": "occurrence:r",
      "targetOccurrence": "occurrence:flow",
      "projectedHiddenRelationOccurrences": [
        "occurrence:flow"
      ]
    },
    "expected": [
      {
        "code": "occurrence-endpoint-mismatch",
        "severity": "error",
        "path": "relationOccurrences.occurrence:r.endpoints[1].occurrence",
        "message": "projected endpoint for role target fails check relation-target-hidden",
        "refs": [
          "occurrence:r",
          "occurrence:flow"
        ],
        "details": {
          "role": "target",
          "check": "relation-target-hidden"
        }
      }
    ],
    "name": "relation-target-hidden",
    "sourcePin": {
      "repository": "sent-tech-design-system",
      "revision": "f6f3ba3790696754b6e08b13b62148ef3556bc4e",
      "path": "packages/diagram-core/fixtures/valid/archimate-skeleton-document.json",
      "sha256": "8395ccc32ac25ae1354271817a3358bfe6f96243ecdfe2e5ef45ae1f48683951"
    }
  },
  {
    "id": "case_7096bf5caf4ece090e4d14b5db3dcea68ffa7272d4e08cd982b061fc0b93a974",
    "name": "ArchiMate folded relation-to-relation",
    "sourcePin": {
      "repository": "sent-tech-design-system",
      "revision": "f6f3ba3790696754b6e08b13b62148ef3556bc4e",
      "path": "packages/diagram-core/fixtures/valid/archimate-skeleton-document.json",
      "sha256": "8395ccc32ac25ae1354271817a3358bfe6f96243ecdfe2e5ef45ae1f48683951"
    },
    "mutation": {
      "entityMappings": {
        "entity:actor": "business-actor",
        "entity:process": "business-process",
        "entity:component": "application-component"
      },
      "replaceEntities": {
        "entity:junction": {
          "id": "entity:junction",
          "profile": "archimate@2",
          "type": "grouping",
          "attributes": {
            "name": {
              "kind": "text",
              "value": "Claims grouping"
            }
          }
        }
      },
      "replaceRelations": {
        "relation:assignment": {
          "id": "relation:assignment",
          "profile": "archimate@2",
          "type": "association",
          "endpoints": [
            {
              "role": "source",
              "target": "entity:junction"
            },
            {
              "role": "target",
              "target": "entity:actor"
            }
          ],
          "attributes": {}
        },
        "relation:serving": {
          "id": "relation:serving",
          "profile": "archimate@2",
          "type": "groupingContainment",
          "endpoints": [
            {
              "role": "parent",
              "target": "entity:junction"
            },
            {
              "role": "child",
              "target": "entity:actor"
            }
          ],
          "attributes": {}
        },
        "relation:flow": {
          "id": "relation:flow",
          "profile": "archimate@2",
          "type": "association",
          "endpoints": [
            {
              "role": "source",
              "target": "entity:component"
            },
            {
              "role": "target",
              "target": "relation:assignment"
            }
          ],
          "attributes": {}
        }
      },
      "sourceViewFragment": {
        "entityOccurrences": {
          "occurrence:Z": {
            "id": "occurrence:Z",
            "entity": "entity:junction",
            "geometry": {
              "x": 0,
              "y": 0,
              "width": 1000,
              "height": 600
            }
          },
          "occurrence:A1": {
            "id": "occurrence:A1",
            "entity": "entity:actor",
            "geometry": {
              "x": 40,
              "y": 240,
              "width": 460,
              "height": 200
            },
            "group": "occurrence:Z"
          },
          "occurrence:EXT": {
            "id": "occurrence:EXT",
            "entity": "entity:component",
            "geometry": {
              "x": 1200,
              "y": 240,
              "width": 460,
              "height": 200
            }
          }
        },
        "relationOccurrences": {
          "occurrence:r": {
            "id": "occurrence:r",
            "relation": "relation:flow",
            "endpoints": [
              {
                "role": "source",
                "occurrence": "occurrence:EXT"
              },
              {
                "role": "target",
                "occurrence": "occurrence:flow"
              }
            ]
          },
          "occurrence:flow": {
            "id": "occurrence:flow",
            "relation": "relation:assignment",
            "endpoints": [
              {
                "role": "source",
                "occurrence": "occurrence:Z"
              },
              {
                "role": "target",
                "occurrence": "occurrence:A1"
              }
            ],
            "waypoints": [
              {
                "x": 500,
                "y": 200
              },
              {
                "x": 270,
                "y": 240
              }
            ]
          }
        },
        "portOccurrences": {},
        "groups": {
          "occurrence:Z": {
            "id": "occurrence:Z",
            "occurrence": "occurrence:Z",
            "collapsed": false
          }
        },
        "filters": []
      },
      "collapsedOccurrenceIds": [
        "occurrence:Z"
      ]
    },
    "expectedProjection": {
      "entityOccurrences": {
        "occurrence:Z": {
          "id": "occurrence:Z",
          "entity": "entity:junction",
          "geometry": {
            "x": 0,
            "y": 0,
            "width": 1000,
            "height": 600
          }
        },
        "occurrence:A1": {
          "id": "occurrence:A1",
          "entity": "entity:actor",
          "geometry": {
            "x": 40,
            "y": 240,
            "width": 460,
            "height": 200
          },
          "group": "occurrence:Z"
        },
        "occurrence:EXT": {
          "id": "occurrence:EXT",
          "entity": "entity:component",
          "geometry": {
            "x": 1200,
            "y": 240,
            "width": 460,
            "height": 200
          }
        }
      },
      "relationOccurrences": {
        "occurrence:r": {
          "id": "occurrence:r",
          "relation": "relation:flow",
          "endpoints": [
            {
              "role": "source",
              "occurrence": "occurrence:EXT"
            },
            {
              "role": "target",
              "occurrence": "occurrence:Z",
              "semanticTarget": "relation:assignment",
              "sourceOccurrence": "occurrence:flow"
            }
          ]
        },
        "occurrence:flow": {
          "id": "occurrence:flow",
          "relation": "relation:assignment",
          "endpoints": [
            {
              "role": "source",
              "occurrence": "occurrence:Z"
            },
            {
              "role": "target",
              "occurrence": "occurrence:A1"
            }
          ],
          "waypoints": [
            {
              "x": 500,
              "y": 200
            },
            {
              "x": 270,
              "y": 240
            }
          ]
        }
      },
      "portOccurrences": {},
      "groups": {
        "occurrence:Z": {
          "id": "occurrence:Z",
          "occurrence": "occurrence:Z",
          "collapsed": true
        }
      },
      "filters": []
    },
    "expectedScene": {
      "groupCollapsed": [
        "occurrence:A1"
      ],
      "endpointHidden": [
        "occurrence:flow"
      ],
      "drawnRelations": [
        "occurrence:r"
      ]
    },
    "expectedUnfoldedRelationOccurrences": {
      "occurrence:r": {
        "id": "occurrence:r",
        "relation": "relation:flow",
        "endpoints": [
          {
            "role": "source",
            "occurrence": "occurrence:EXT"
          },
          {
            "role": "target",
            "occurrence": "occurrence:flow"
          }
        ]
      },
      "occurrence:flow": {
        "id": "occurrence:flow",
        "relation": "relation:assignment",
        "endpoints": [
          {
            "role": "source",
            "occurrence": "occurrence:Z"
          },
          {
            "role": "target",
            "occurrence": "occurrence:A1"
          }
        ],
        "waypoints": [
          {
            "x": 500,
            "y": 200
          },
          {
            "x": 270,
            "y": 240
          }
        ]
      }
    },
    "expectedRevision": 1,
    "expected": [],
    "variants": [
      {
        "name": "missing relation occurrence provenance",
        "mutation": {
          "path": "relationOccurrences.occurrence:r.endpoints[1].sourceOccurrence",
          "operation": "remove"
        },
        "expected": [
          {
            "code": "occurrence-endpoint-mismatch",
            "severity": "error",
            "path": "relationOccurrences.occurrence:r.endpoints[1].occurrence",
            "message": "projected endpoint for role target fails check provenance-missing",
            "refs": [
              "occurrence:r",
              "occurrence:Z"
            ],
            "details": {
              "role": "target",
              "check": "provenance-missing"
            }
          }
        ]
      },
      {
        "name": "different relation occurrence provenance",
        "mutation": {
          "path": "relationOccurrences.occurrence:r.endpoints[1].sourceOccurrence",
          "value": "occurrence:r"
        },
        "expected": [
          {
            "code": "occurrence-endpoint-mismatch",
            "severity": "error",
            "path": "relationOccurrences.occurrence:r.endpoints[1].occurrence",
            "message": "projected endpoint for role target fails check provenance-mismatch",
            "refs": [
              "occurrence:r",
              "occurrence:Z"
            ],
            "details": {
              "role": "target",
              "check": "provenance-mismatch"
            }
          }
        ]
      },
      {
        "name": "stale relation target projection after unfold",
        "mutation": {
          "path": "groups.occurrence:Z.collapsed",
          "value": false
        },
        "expected": [
          {
            "code": "occurrence-endpoint-mismatch",
            "severity": "error",
            "path": "relationOccurrences.occurrence:r.endpoints[1].occurrence",
            "message": "projected endpoint for role target fails check projection-not-folded",
            "refs": [
              "occurrence:r",
              "occurrence:Z"
            ],
            "details": {
              "role": "target",
              "check": "projection-not-folded"
            }
          }
        ]
      }
    ]
  }
]
~~~

### C.7 Layout warning shape

card-overflow/zone-overflow carry the exact MeasurementOverflow of §4.6.4 (occurrence,slot,neededHeight,allocatedHeight,lines,allocatedLines). docking-overflow is
{code:"docking-overflow",refs:[occurrenceId],message:"side <side> of <occurrenceId> needs <required> docks, fits <fitted>",details:{side,required,fitted}},
where side is north/east/south/west and counts are non-negative integers. These warnings never become semantic refusal codes. Unknown-icon render results use card-icon-unknown/zone-icon-unknown and retain the unresolved name; no view semantic failure is fabricated.


## Appendix D — Oracle replay and evidence boundaries

Source identity is the exact repository revision plus path and raw SHA-256, or the explicitly content-addressed snapshot plus its path/hash. A frozen path whose bytes drift fails as fixture error; it is never overwritten with a live producer value. Unverified metadata belongs to §11.2, not a fake Digest field.

The derived oracle is the literal JSON of §8.7, with its canonical projection digests. Corpus publication packages those values, the matrix source/transcription and rejected-case oracles together; it does not leave mappings/folds/hints/expected diagnostics to an implementation author's later interpretation. Its producer executes the library gates, records exact library/version/selection, and submits the resulting receipts to G0. Fixture expectations and source hashes do not count as receipts.

Replay order:
1. Resolve local source/corpus/profile/contract pins and compare exact bytes before any assertion.
2. Validate semantic families in their own resolved contexts, with @1 legacy behaviour preserved and @2 shared mechanisms explicitly selected.
3. Validate/apply the typed presentation join, including semantic category references and native view field closure.
4. Project from retained source occurrences; resolve summary candidates and active-key uniqueness; measure/place/route; validate the emitted view.
5. Compare per-type/containment/link counts, per-occurrence styles, exact authored field values/summary sets and stated diagnostic arrays.
6. Only an executing library may produce qualification/admission receipts, with all G0 proof obligations. This authoring task performs a final document consistency calculation only.

A blank expected diagnostic array is an oracle assertion, not a success claim. A missing qualified executor/registry/carrier implementation/adapter/receipt remains unverified under its named owner. No fallback to latest, consumer patch or skipped required case is part of this contract.

## Appendix E — Final consistency pass (2026-10-27)

The preceding author round recorded the document consistency calculations below: all 86 §8.5 hash rows, 3,844 XML matrix cells, frozen order references, separate G0 preimages and diagnostic field paths. Those unchanged calculations are retained as prior author evidence, not claimed as re-executed in the owner's targeted extra round. That extra round aligns only the relation-target carrier, fold provenance and worked fixture, updates the affected rows, parses the five fenced JSON artifacts with Node and calculates the added fixture identity from pinned source bytes and its canonical mutation. Source observations and unresolved qualification remain separate (§11.2). No implementation validator or independent assessment is run or claimed.

| Checked identity / field / code / digest | Canonical correspondence / calculation | Result |
| --- | --- | --- |
| Frozen hint references | A2–A4b: 71 parent lists, 207 direct-child references; every id resolves in the pinned scene and has the named parent; no duplicate membership or child-object coercion | consistent |
| Completed ArchiMate declarations | A.4: 62 native type declarations (61 concrete + abstract element), 12 relation declarations, 3 constraints; 1,047,531 P-CONTENT bytes; 1ffa38c1169b43d932b7c6d69cea24b52dd753f0f4e14eb43f6e83746cce1189 | consistent draft data; qualification unverified |
| Completed UML declarations | A.4: 7 named schemas (6 entity kinds + identity-abstract multiplicity), 4 relations, 6 constraints; 5,068 P-CONTENT bytes; d7da59f277c0f4216a32c201dacdb837270e687ef5d8b1838f00f083e14f9e96 | consistent draft data; qualification unverified |
| Relation endpoint carrier | EndpointTargetKind entity/port/relation; RelationEndpoint.target and RelationOccurrenceEndpoint.semanticTarget use EntityRef/PortRef/RelationRef. Provenance resolves entity/port/relation directly; a visible relation target retains its occurrence, an internal one uses its canonical collapsed container and original RelationRef/sourceOccurrence. Matrix @relation is never an entity type. | §§3.9.1/4.4/5.2/A.1/A.4/B.7/C.4/C.6 aligned; execution unverified |
| ArchiMate folded relation target | B.7/C.6 case_7096bf5caf4ece090e4d14b5db3dcea68ffa7272d4e08cd982b061fc0b93a974 derives from the existing pinned ArchiMate source and canonical mutation. Folded target = occurrence:Z / relation:assignment / occurrence:flow; positive diagnostics []; exact source restoration; three negative variants each expect one existing projection diagnostic. Internal records remain unchanged; no graph drawing field. | Authored projection/diagnostic oracle; case identity calculated, executor qualification unverified |
| Full matrix case count | 62×62×11=42,284; 11,569 positive tuples (126 involving @relation), 30,715 absent-tuple rejections; source XML rows/cells reproduced exactly | consistent |
| Presentation pin equalities | input.contractPin = sourceView.presentation.diagram.contractPin = resolved contract; input.adapterPin = contract catalog ontology.compatibility.adapter; adapter schema binding = artifactBinding.schemaPin | §§3.2.1/7.4/C.3 agree |
| Precise presentation paths | Five C.3 mutation paths equal the respective expected Diagnostic.path; adapter mismatch separately names input.adapterPin | consistent |
| G0 specimen artifact byte hashes | Corpus 3d4c6b6bc655d028bc7467f7278c5dac3c913e8b298f2ad756fbc78c173701d8; six embedded byte strings independently hashed; seven distinct digest values total | consistent |
| G0 specimen asset byte hashes | Base ffcf89f3c1ab72bbbf6262f421745bd03fc16b4767bdbc5092c2ce8496bf9760; layer fd8b9a9ab48fcf94f955bf65c06164e470a63ddb17fc1a68c919f145ea931417; each hashes full declaration JCS bytes | consistent |
| G0 specimen external entryDigest | Base 500d7242b900d4559ffd2291ea69498fcfda3415738958b3c8d62e0927a9349d; stack 5544190fd969998f25dc384d910565c2c98b73051f372bce3d39b96521965142; each hashes its own closed envelope | consistent |
| Derived oracle | 08cae540e5535727fc1f4b7bba3aa12d84908790b6c918dc263b65560ab4f2de | consistent |
| Category token map | a77e2a62ddd6d576f06005969361ee15c241789fe8a571e6195dfb5c2782b3bf | consistent |
| Ten A1 summaries | e363601a0c116197a471a599e92dc94da16147f0e7e78346c1ab7c7df9a49018 | consistent |
| A5 full field ledger | 527a0b18c1afee9e71591d6c2e3ef8d68294c89d5f0e593527b31a47b207a2b8 | consistent |
| Semantic/presentation field separation | 56 semantic entities / 56 occurrence presentations; graph has no icon/token/stroke/order | consistent |
| A1 counts and initial folds | 28 cards / 10 frames / 50 links; five initial folds | consistent |
| 600/240 source workload | 240+32+80+4+4+240=600, of which stress=240 | consistent |
| ArchiMate pair matrix | a13f4112164afd177923a67b424d4c9b6ee57c1b993c4d11c94d5227385267f9 | consistent |
| ArchiMate catalogue | 114cdca0c1e538f9cedf09613f415a6464bc9f4f54471c62ecfafcf6fede916e | consistent |
| G0 frozen vectors | 186 / 206 / 86 / 320 bytes; all four hashes | consistent |
| Additional case identities | Ten case_ ids use SHA-256 of pinned raw fixture bytes, newline and canonical mutation; nine retain their prior calculations, the B.7 case is calculated in the targeted extra round. sourcePin hashes match §8.5; descriptive names are not nominal entity/profile ids. | Existing identities retained; added identity calculated |
| Diagnostic inventory | 50 native + 17 additions, including quantity-above-max; C.6 has 58 top-level case records / 55 primary diagnostic objects, plus 3 diagnostic objects in the B.7 case's isolated variants (58 diagnostic objects total). No new code or legacy message/order change. | JSON counts calculated; expected outcomes only |
| Legacy fields/order | Native .target path; no new seenChain/global sort; no legacy scope | consistent |
| G0 closed mapping specimens | Mirrored namespace/owner/digests/lineage; base evidence arm; no self-parent; seven distinct embedded artifact byte sources, two defined asset byte sources, recomputed P-CONTENT/P-PINS/P-RESULT/P-ENTRY | consistent |
| Source pin repetition | 86 hash rows in §8.5 (52 + 12 + 16 + 6); 85 distinct source identities because canonical.ts appears twice; frozen/producer HRPN rows use the same immutable commit but distinct paths/hashes | consistent |
| Profile identity/migration | Distinct @2 ProfileIds; @1 immutable; migrations explicit; architecture@1 withdrawn | consistent |
| BPMN c14n/admission | Sealed JCS/stable-id; 610c0353; parity plus bijection | consistent |
| Summary projection/example | Occurrence/style-specific membership and active-key refusal; literal worked example | consistent |
| Open evidence assigned | Every unverified dependency has an owner/gate | consistent |
| Wording/placeholders | Literal diagnostic contracts; prohibited word absent | consistent |
| Semantic profile ids | generic@1 / generic@2; archimate@1 / archimate@2; bpmn@1 / bpmn@2; bpmndi@1, dc@1, di@1, bioc@1, color@1, sem@1; uml@1 / uml@2. @1 means retained source; @2 means replacement/generated target throughout §§1–11. | Identical spellings and roles |
| Withdrawn id | architecture@1 occurs only as withdrawn history/prohibition; no registry or migration target. | Identical disposition |
| Non-profile ids | diagram-presentation@1 = G0 contract; executor-profile-bindings@1 = bound contract asset; legacy-constraints@1/scoped-constraints@1 = adapter identities. None is a SemanticDocument profileRef or extra semantic stack layer. | Roles separated |
| Fixture-only ids | specimen-base@1, specimen-layer@1, synthetic@2; fixture adapter@1/executor@1/g0-conflicts@1 references appear only in isolated serialization/diagnostic oracles. They are not production lookup evidence. | Scope explicit |
| Native view additions | RelationOccurrenceEndpoint.semanticTarget?: EntityRef/PortRef/RelationRef and sourceOccurrence?: OccurrenceRef; both occurrence fields resolve all three existing occurrence maps. RelationOccurrence.strokeStyle; VisualGroup.occurrence; ViewDocument.summaryLabels; PresentationState.diagram. Only summaryLabels changes VIEW_DOCUMENT_FIELDS; bounded relation fold witnesses add no persisted field or semantic parent. | §§2.2/3.2/3.9.1/4.4/5.6/B.7/C.4/C.6 aligned |
| DiagramPresentation fields | contractPin, entities, legends, categoryTokens. EntityPresentation={form,text,icon?,categoryRef?}; PresentationText={title?,kicker?,body?,detail?,subtitle?,footer?}; LegendPresentation={order}; CategoryTokenBinding={legendRef,category,token}. | Same names in contract/oracle |
| Semantic versus drawing fields | Semantic name/category/description and existing domain attributes remain graph data. icon/token/strokeStyle/order/footprint/collapsed and standard card roles remain typed view/contract data; domain BPMN body text is not prohibited by a drawing-field name scan. | Carrier boundary unchanged across sections |
| SummaryDefinition fields | id, sourceOccurrence, targetOccurrence, label, relationIds, strokeStyle?, relationOccurrences?. Definition and activation use the same style/occurrence scope; active key uses projected representatives. | §4.5/App. B/App. C agree |
| Measurement fields | MeasureRequest text/role/availableWidth/allocatedLines/folded; LineLayout lines/width/height/overflow; EntityMeasurementInput entity/occurrence/effectiveType/folded/toggle/slots/availableWidth/allocatedLines; HeaderMeasurement occurrence/kicker?/title/subtitle?/height/overflow; SlotMeasurement occurrence/role/layout. | §4.6 API is the shared layout/render input |
| Footprints / overflow | FootprintDecl width/height/fixedAxes; MeasurementOverflow occurrence/slot/neededHeight/allocatedHeight/lines/allocatedLines. Card 460×200, fixedAxes both; key height 64, fixedAxes height; expanded computed. Applies to selected synthesis forms, preserving native DI. | §§1.4/4.6/4.8/App. C agree |
| Recursive hint fields | LayoutGroup id/direction/items/stretch?/gapAfter?; LayoutHints ordering?/grouping?/stretch?/cardGapX?/cardGapY?/zoneGapX?/zoneGapY?/rankGap?. Ordered items preserve PPROZ interleaving; no duplicate members/groups authority. | §4.7 and A5 oracle agree |
| G0 identity/digest fields | Pin={id,version,contentDigest}; digests={contentDigest,pinsDigest,resultEvidence}; DigestEvidence is resolved+digest or unresolved without digest. profileRef={canonicalRef,contentDigest}; corpusRef={ref,digest}. | Exact names/shapes reused |
| G0 lineage fields | PublicLineage parents/derivation?/mappings/migrations; PrivateLineage parents/derivationRef?/mappings/migrations; PrivateDerivationRef base/deltaDigest/mappingRef?; PrivateDerivationRecord adds resultingDigests from the same enclosing digests. | §7.4 specimens/source mapping agree |
| G0 closed envelope mappings | namespace/owner mirrored; profilePin and record profileRef.contentDigest agree; assets role/path/mediaType/sha256; bindings key/contract/required; provenance sourceRef/sourceRevision only; compatibility renderer/adapter strings. No declarationFormat field or extra adjacent adapter pin. | Closed shapes preserved |
| G0 artifactBinding arms | base includes basePin+bijectionEvidence (also non-BPMN); profile includes profilePin+stack; contract includes schemaPin+compatibilityMatrixVersion; theme includes themeDigest+appliesTo; mechanism/corpus keep their exact G0 arms. | §7.4 source/specimens agree |
| G0 receipt proof fields | evaluatedStack stack/pinsDigest/resultEvidence; bpmn-parity proofBindings only; bpmn-bijection descriptorCoverage/roundTripEvidenceRef/moddleTestPin; family-corpus family/fixtureDigest; contract-verdict schemaPin/compatibilityMatrixVersion/caseVerdicts; severityPolicyDigest explicit for each arm as specified. | Proof sets/roles never merged |
| UML multiplicity fields | K6 kind/type/fields; lower and upper quantities in unit; integer bounds and max 9007199254740991; upper=-1 only unbounded sentinel. Same carrier on property and association ends, schema declaration in A.4. | §3.11/App. A.2/App. A.4/App. C agree |
| Native diagnostic fields | code/severity/path/message/refs?/details? preserved; new details are scalar. Appendix C enumerates 50 unchanged native codes + 17 additions and all changed arms. Native endpoint path ends in .target. | No placeholder or new legacy field |
| Source versus application digests | Raw source SHA-256, G0 contentDigest/pinsDigest/resultEvidence, external entryDigest, presentationDigest and the explicit derived-oracle projection digests keep distinct names/preimages. | No digest substitution |
| Known incomplete evidence | U-ID, U-AM, U-AM-ENDPOINT, U-KERNEL, U-DIAG, U-D2D-MAP, U-HISTORY, U-THEME, U-QUAL, U-INTERACTION are all explicitly unverified with named owners. Consistency does not resolve them. | No false qualification claim |

The file's final SHA-256 is calculated externally after this table is written. It is not self-embedded.

