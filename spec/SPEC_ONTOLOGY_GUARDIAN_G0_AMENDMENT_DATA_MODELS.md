# G0 amendment — Engram as the native authority for database models

**v0.2.1 · Proposed specification · 21 November 2026.** GPT-6.2 Astra max is the assigned author. Gemini Carbon High requested changes to v0.1.1, closed F1–F9 on v0.1.2 and returned `APPROVE-WITH-MINORS` on v0.1.2 and v0.2.0. The v0.2.0 amendment incorporated sentbase’s three requests on v0.1.3. This revision applies the conductor’s ruling to accept M1 and M2. Dispositions follow §9. Owner acceptance and implementation are pending. (Brief:1–3,42. Review 1:1. Review 2:1–13,19–29. Amendment:3–7. Carbon v0.2:1–19.)

## 1. What the owner decided

“I want Engram to manage this database’s data models natively,” the owner wrote (translated). On 21 November the owner selected D4-A. The acceptance criterion requires a pinned Engram profile to generate every hot table, S3 table, route and row-level security (RLS) policy. The graph uses the same entities, relations and registry bindings. (Decision:4–11. R3:398–421,530,535,729–735,881.)

| Owner | Deliverable |
|---|---|
| **Engram** | Defines the logical model in tier N and the governed metadata in tier G. Publishes exact versions and digests, validates bindings and classifies changes. N enters the profile digest. G binds to that profile and has its own digest. (R3:398–400,729–731,754–757.) |
| **cluster-mesh** | Supplies all access rights, their typed representation, the translator to RLS predicates and the independent oracle for access decisions. sentbase reads access rules only from cluster-mesh. (R3:401–403,732,758,763. Consumer:30.) |
| **sentbase** | Compiles the pinned model into CNPG and S3 tables, APIs, RLS policies assembled from cluster-mesh predicates, and graph views. The tenant selects its storage region in sentbase deployment configuration and applies migrations to its data. (R3:404–421,733–735,814. Amendment:6.) |

D4-A settles authority. The r3 dossier is **Incomplete**, pending Astra’s final validation. Its candidate storage hints, first Task slice, relation-policy coverage and lot gates are working inputs. Section 9 records sentbase’s field review and traces each compiler input to its declaration. The formats below are proposed Engram decisions for owner acceptance at lot 3.1. (Decision:12–16. R3:85,432,446,754–764,876–881. Consumer:1–3,7–28. Amendment:3–6.)

### Evidence

The v0.1.3 replay compared `15eab662f5dbcc6dd80cd0cd1fe65b24fed8b262` with the immutable P1-7 baseline `b2e3fb8d1627e8c8c1ae8fbed9ce78ef76e3f502`. The cited Engram contracts, sources and tests were re-read at the v0.2.0 base `7d8e9fd325350abd215a0e7266d54e9d4cd2af55` and match those replay revisions byte for byte. Short citations expand below. [JUDGMENT] identifies a proposed contract, fixture choice or recommendation. `unverified` identifies missing evidence.

| Key | File |
|---|---|
| Brief, Fold, Amendment | Under `graphify/.graphify/scratch/design/g0-data-models/`, `BRIEF-spec-g0-n-g-layers.md`, `BRIEF-fold-g0-sentbase-input.md` and `BRIEF-spec-g0-v02.md`, respectively |
| Review 1, Review 2, Carbon v0.2 | Under `graphify/.graphify/scratch/design/g0-data-models/`, `REVIEW-g0-amendment-r1.md`, `REVIEW-g0-amendment-r2.md` and `REVIEW-g0-v02-r1.md`, respectively |
| Decision, R3, Muse | Under `sentbase/tmp/dossiers/lakehouse/`, `OWNER-ANSWER-r3.yaml`, `dossier-r3.fr.md` and `review-muse.fr.md` (P1-3 on r2), respectively |
| Consumer | `graphify/.graphify/scratch/design/g0-data-models/INPUT-sentbase-compiler-v0.md`, v0 |
| Mesh snapshot | `sentbase/tmp/dossiers/lakehouse/src/sentropic/packages/cluster-mesh/package.json` at the r3 snapshot `70638ed6`. (R3:1058–1059.) |
| G0, OpenERP | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_CONTRACTS.md` and `spec/SPEC_ONTOLOGY_OPENERP_FROZEN.md` respectively |
| Guardian | `graphify/.graphify/scratch/design/ontology-guardian/DOSSIER-ontology-guardian.md` |
| Metamodel, Diagrams | `spec/SPEC_ENGRAM_METAMODEL_AND_LINEAGE_REGISTRY.md` and `graphify/.graphify/scratch/design/simple-diagrams/SPEC_ENGRAM_GRAPH_METAMODEL_AND_DIAGRAMS.md` respectively |
| SQL | `openerp/apps/api/src/db/migrations/0001_foundation.sql` at `d06d5ece64772482c97411eb5191ae1bb3cb80cb`. This commit supplies the example DDL. The 773-column extraction is pinned separately by its file hash. Its formal linkage to that commit remains `unverified` under OQ-OP-03. (OpenERP:18–25. `spec/SPEC_ONTOLOGY_OPENERP_ADDENDUM_1.md:57–63`.) |

The sibling repository paths start at `/home/antoinefa/src/`. The scratch sources belong to the main Graphify checkout. (Brief:3–15.)

## 2. Exact changes to G0

[JUDGMENT] Apply the six replacements below when adopting the amendment. Each **Before** is the complete source line, including its original citation. The type offsets inside the G0:130 quotation are historical. The current declarations begin at `src/types.ts:1186,1244`. The scope is the database in D4-A. Sentropic also has an independently owned ARCH-19 object vocabulary. Its authority can be identified even when a database model refers to one of its types. (Guardian:200–207,224. R3:65–67,451–453,729–735.)

### §0.2, operational schemas · G0:64

**Before**

~~~text
| Operational schemas (ARCH-19 object types). Alignment is by typed reference only. | Sentropic | DOSSIER-ontology-guardian.md:205, DOSSIER-ontology-guardian.md:224 |
~~~

**After**

~~~text
| Physical schemas, generated APIs and RLS policies, and their installation. Sentropic ARCH-19 object types are aligned by typed reference. | sentbase (compiled artifacts), cluster-mesh (rights and predicate translation), tenant (installation), Sentropic (ARCH-19 vocabulary) | DOSSIER-ontology-guardian.md:205, DOSSIER-ontology-guardian.md:224, dossier-r3.fr.md:729–735 |
~~~

### §0.2, boundary sentence · G0:57

**Before**

~~~text
The guardian does not own execution, rendering, memory or operational schemas. Source: DOSSIER-ontology-guardian.md:202, DOSSIER-ontology-guardian.md:203, DOSSIER-ontology-guardian.md:204, DOSSIER-ontology-guardian.md:205.
~~~

**After**

~~~text
Execution, rendering, memory authority and deployment of physical schemas belong to their respective owners. Engram governs the database model declarations from which sentbase compiles operational artifacts. Source: DOSSIER-ontology-guardian.md:202–205, dossier-r3.fr.md:729–735.
~~~

### §0.2, positive ownership · G0:55

**Before**

~~~text
Engram as guardian owns profile definitions as data, versions and immutable publication, stacking, derivation and merge contracts with their diagnostics, deprecation and migration records, conformance-corpus references, and catalog entries. Source: DOSSIER-ontology-guardian.md:200.
~~~

**After**

~~~text
Engram as guardian owns profile definitions as data, including native logical database models (tier N), separately pinned governance documents for those models (tier G), versions and immutable publication, stacking, derivation and merge contracts with their diagnostics, deprecation and migration records, conformance-corpus references, and catalog entries. Source: DOSSIER-ontology-guardian.md:200, dossier-r3.fr.md:729–731,754–757.
~~~

### §0.4, ARCH-19 scope · G0:106

**Before**

~~~text
Sentropic ARCH-19 operational types are excluded from all six properties; the guardian aligns them by typed reference and offers no operation over them. Source: DOSSIER-ontology-guardian.md:224.
~~~

**After**

~~~text
Sentropic ARCH-19 operational types are aligned by typed reference and remain outside the six guardian properties. The database model adopted under D4-A is governed through the Engram profile and its separately pinned governance document. A reference to an ARCH-19 type confers no ownership of that type. Source: DOSSIER-ontology-guardian.md:224, dossier-r3.fr.md:729–735.
~~~

### §1.2, Engram declaration · G0:130

**Before**

~~~text
| Engram shape | OntologyProfile: types, relations with typed endpoints, entity registries, citation, evidence, inference and hardening policies, hierarchies, class hierarchies, outputs; normalized to NormalizedOntologyProfile with profile_hash. | id plus version; content anchor profile_hash (see §7). | DOSSIER-ontology-guardian.md:188 (src/types.ts:1163, src/types.ts:1221 as read there) |
~~~

**After**

~~~text
| Engram shape | OntologyProfile: types, relations with typed endpoints, entity registries, citation, evidence, inference and hardening policies, hierarchies, class hierarchies, outputs. Data-model profiles also declare typed attributes, nullability, domains, keys, references and edge cardinality as specified in this amendment. Normalized to NormalizedOntologyProfile with profile_hash. | id plus version; content anchor profile_hash (see §7). | DOSSIER-ontology-guardian.md:188, dossier-r3.fr.md:729,754 |
~~~

### §5.2, catalog carrier for G · G0:689

**Before**

~~~text
| extensions | Qualified metadata object | No | Qualified keys only. Extension metadata never broadens authority. | Registry discipline (closed envelope with qualified extensions), DOSSIER-ontology-guardian.md:154 |
~~~

**After**

~~~text
| extensions | Qualified metadata object | No | Qualified keys only. On an Engram data-model companion entry, `extensions["engram.data-governance/1"]` is the exact G QualifiedPin and `requiredExtensions` includes this key. Extension metadata never broadens authority. | DOSSIER-ontology-guardian.md:154, dossier-r3.fr.md:754–757 |
~~~

[JUDGMENT] **Standalone G publication.** Use a distinct, immutable catalog entry for each companion release. Its v9 variant is `kind: "ontology"`, `ontology.profileShape: "engram-profile"`, `ontology.artifactKind: "profile"`, with the required extension above. The payload carries N’s namespace, `profilePin`, stack and receipts. The companion’s `ontology.visibility` governs access to that entry. The extension value is exactly `{namespace, pin: {id, version, contentDigest}}` for **G** (§4). Give the companion its own catalog `id` and exact `entryVersion`. An ordinary N entry may omit the extension. The N `OntologyRecord` and `OntologyPayload` keep their closed schemas. G qualification adds strict §4 pair validation to the existing profile admission gate. (G0:158–181,658–672,678–690,698–710,723–729,753,770. `src/ontology-guardian/catalog.ts:146–159,179–184`.)

[JUDGMENT] The trusted publication index maps G's `(namespace, id, version)` to its digest, companion `(kind, id, entryVersion)` and external P-ENTRY `entryDigest`. Verify the whole envelope, required extension and both pins. Read N’s visibility from its own publication record. A `public` N permits a `public` or `private:<tenant>` companion. A `private:<tenant>` N requires that exact `private:<tenant>` on its companion. Exactly one asset in a public companion has `role: "data-governance"`. Its `mediaType` is `application/json`, its package-relative path holds the canonical G bytes and its `sha256` equals G’s `pin.contentDigest`. A private companion omits the `data-governance` asset and uses opaque private pins and the tenant’s verification receipt. Other tenants see the entry as missing. A G-only revision requires a new G version and `entryVersion`. Refuse a reused G identity with different bytes, a missing required key or a stale entry digest. (G0:143–147,168,198–211,687–694,727,758,920–923,1134–1139. `src/ontology-guardian/digests.ts:290–295`, `tests/ontology-guardian-diagram-pinned-adapter.test.ts:409–428`. Consumer:33–35.)

## 3. Tier N — the logical model

At the pin, `OntologyNodeType` and `OntologyRelationType` have no typed column declarations. The frozen OpenERP profile contains 67 entity keys and 146 relations with endpoints. Its 776 extracted column rows comprise **773 real columns and three constraint pseudo-columns**. Column facts, enum domains and table invariants are preserved in G for v1. Structured attribute validation was an open capability. D4-A sponsors that part of OQ-OP-14. The three pseudo-columns are provenance rows. Addendum 1 supplies their three composite FK tuples and limits its tenant-carrying attestation to those relations. [JUDGMENT] A successor may declare the attested tuples as references. Source CHECKs, triggers, delete actions and SQL defaults outside the v0 grammar keep their evidence and require an explicit round-trip difference when unsupported. (`src/types.ts:856–895,1186–1203`. OpenERP:2013–2021,2029–2043,2215,2218. `spec/SPEC_ONTOLOGY_OPENERP_ADDENDUM_1.md:23–37,57–63`. R3:451–454,743,754.)

### Wire schema

[JUDGMENT] The following TypeScript describes closed wire objects. JSON arrays are ordered and `?` denotes an optional member. Move `NativeScalarSchema`, its support types and shared scalar schema fragments into one neutral data-only module, proposed `src/model-schemas.ts`. `diagram-native-types.ts` re-exports the native types, `diagram-schemas.ts` builds its attribute schema from those fragments, and `profile-bundle.ts` imports and re-exports the data-model types from the same module. Both adapters use the same metamodel `Cardinality` declaration there. This keeps diagram execution outside the public profile import. (`src/ontology-guardian/diagram-native-types.ts:4–19`, `src/ontology-guardian/diagram-schemas.ts:158–171`, `src/types.ts:856–895`. Metamodel:269–280. Diagrams:391–400,429–435,804. Consumer:7–20.)

~~~ts
type Names = readonly [string, ...string[]]
type EnumDomain = Extract<NativeScalarSchema, { kind: "enum" }>
type TextDomain = Pick<Extract<NativeScalarSchema, { kind: "text" }>, "kind" | "minLength" | "maxLength">
type LogicalType =
  | TextDomain
  | ({ kind: "string" } & Pick<TextDomain, "minLength" | "maxLength">)
  | Extract<NativeScalarSchema, { kind: "boolean" | "date" }>
  | { kind: "int" | "bigint" | "timestamptz" | "uuid" | "json" }
  | { kind: "decimal", precision: number, scale: number }
  | { enumRef: string }
type ModelAttribute = { name: string, type: LogicalType, nullable: boolean }
type FieldPair = { fields: Names, targetFields: Names }
type Reference = FieldPair & { relation: string }
type Cardinality = Required<NonNullable<MetamodelRelationTypeDecl["cardinality"]>>
type ModelHeader = { format: "engram.data-model/1", enums?: Record<string, EnumDomain> }
type ModelRow = { attributes: readonly ModelAttribute[], key: Names, unique?: readonly Names[] }
type ModelNode = OntologyNodeType & ModelRow & { references?: readonly Reference[] }
type ModelEdge = OntologyRelationType & { cardinality: Cardinality } & (
  | { attributes?: never, key?: never, unique?: never, endpoints?: never }
  | (ModelRow & { endpoints: { source: FieldPair, target: FieldPair } })
)
~~~

[JUDGMENT] `data_model` selects the grammar before any version check (§5). A tagged profile declares `data_model: ModelHeader`, `node_types: Record<string, ModelNode>` and, when present, `relation_types: Record<string, ModelEdge>`. It uses `registries` from `OntologyProfile`. Normalized edges carry `cardinality` and the declared row fields for a stored edge alongside `source_types` and `target_types`. The first compiler accepts the literal format on exact major-2 profile versions. (`src/types.ts:1186–1222,1244–1266`, `src/ontology-profile.ts:92–112,513–543`. R3:754–755.)

[JUDGMENT] The ordered column array is the wire form for this tagged Engram profile. A metamodel adapter can derive its lookup map by `name` while preserving the original array for digest verification. Spec 0’s `AttributeDecl.required` concerns presence. It cannot supply an omitted `nullable` value. The enum declaration and textual bounds reuse the native definitions. Diagrams retain their own attribute envelope and executor. (Metamodel:176–212,253–280. Diagrams:391–400,435. Consumer:8–17.)

[JUDGMENT] These rules determine whether the model can be pinned.

1. **Columns and values.** Each model node declares a nonempty `attributes` list. Every node or edge attribute has a nonempty, case-sensitive `name` unique within that list, one logical `type` and an explicit boolean `nullable`. Nullability permits the value `null`. Presence in an API operation is a separate contract. Omitting a new optional model field leaves it absent after normalization. The v0 validator rejects a supplied column `default`, even when its value is `null`. Future admission of authored defaults is open in §8. (Consumer:8–11,16,18–20. R3:754.)
2. **Logical domains.** The closed set is `string`, `text`, `int`, `bigint`, `decimal(p,s)`, `boolean`, `date`, `timestamptz`, `uuid`, `json` and `enum:<ref>`. Each simple name is the literal `type.kind` in normalized JSON. `string` and `text` remain distinct, with optional nonnegative integer `minLength` and `maxLength` in ascending order. **Spelling disagreement.** N uses the native `boolean` kind for JSON booleans and rejects the unfrozen consumer spelling `bool`. The native union shares its boolean/date arm and GM2d owns the Spec 0 ↔ diagram mapping. The worked `users` projection contains no boolean column, so its 2,531-byte digest vector in §5 is unchanged. (Consumer:3,10. Fold:7. Metamodel:176–184. Diagrams:435,804. `src/ontology-guardian/diagram-native-types.ts:11–15`, `src/ontology-guardian/diagram-schemas.ts:158–163`.)

   `int` and `bigint` are signed 32- and 64-bit integers. `decimal(p,s)` is encoded as `{kind: "decimal", precision: p, scale: s}`. `p` and `s` must be integers with `1 ≤ p ≤ 38` and `0 ≤ s ≤ p`. Exact decimals and 64-bit integers cross a JSON API as decimal strings. `date` is a calendar day, `timestamptz` is an instant with an offset, `uuid` is an identifier and `json` admits JSON values. The native quantity carries units and uses a JS number. (Consumer:10. Diagrams:435.)

   `enum:<ref>` is encoded as `{enumRef: "<ref>"}`. Resolve it against `data_model.enums` to a closed native enum with nonempty, ordered, distinct string values. The v0 validator rejects unresolved domains and unknown types. This includes `geometry` and `array`, both open in §8. (Consumer:10,15. `src/ontology-guardian/diagram-native-types.ts:14–19`.)
3. **Keys.** Each `ModelRow` declares one ordered primary `key` of distinct non-nullable local attributes. Each member of `unique` is a nonempty ordered tuple of distinct local attributes. Refuse duplicate declarations. For a nullable unique tuple only fully non-null tuples participate in uniqueness. The same row rules cover entities and stored edges. (Consumer:12–14,16. OpenERP:1501–1515,2041.)
4. **References and storage.** Each tagged relation is binary. Its normalized `source_types` and `target_types` each name exactly one existing node. A `FieldPair` maps distinct local `fields` positionally to distinct `targetFields` of equal arity and equal logical types, including enum identity and decimal bounds. The target tuple is a primary key or a non-nullable unique tuple. For a node `Reference`, `relation` selects the edge, the declaring node is its source and its target node supplies `targetFields`. The relation's `cardinality` supplies both bounds. (Consumer:14,16. `src/ontology-profile.ts:85–99`. Metamodel:269–280.)

   **FK-backed.** Exactly one node reference to `r` uses that node's FK columns for `r` and emits no relation table. Refuse a second binding, any `attributes` (including `[]`), `key`, `unique` or `endpoints` on this edge, or a G `relations[r]` entry. `out.max = 1`. `out.min = 0` if any local component is nullable, otherwise 1. Any null component means no outgoing reference. `in.min = 0` and `in.max` is 1 for a locally unique FK tuple, otherwise `"many"`. (Consumer:14–16. OpenERP:2019,2033,2057.)

   **Stored.** With zero node references to `r`, require `endpoints.source`, `endpoints.target`, a nonempty row `attributes` list and its `key`. Emit one relation table. Each endpoint's `fields` are non-null columns on that row, and `targetFields` select the named endpoint node's candidate key under the `FieldPair` rules. Declare every scope column and any payload in the same `attributes` list. Apply node attribute, key and optional `unique` validation. No endpoint ID or tenant column is synthesized. A source entity's number of edge rows must meet `out` and a target entity's count must meet `in`. Minima are nonnegative integers, maxima are integers ≥ the minimum or `"many"`. A maximum of 1 requires uniqueness of that endpoint's local tuple. If sentbase cannot enforce declared multiplicities it refuses compilation. (Metamodel:269–280. Diagrams:433. Consumer:14–16,23.)

   Test a many-to-many `memberships` row on the two example entities with `organization_id` and `user_id` of kind `uuid`, composite primary key in that order, and one `FieldPair` to each `id`. Its G scope names `organization_id` and its CDC flag is mandatory. Removing either endpoint field or classifying a column absent from the row refuses. The worked `users.organization_id` is the FK-backed control. These are separate fixtures. (SQL:3–15,31–44. OpenERP:162,214,1512. Consumer:16,23–24,28.)
5. **Registries.** `node_types[E].registry` names an existing `OntologyRegistrySpec` whose `node_type` is E. Bind `id_column` to a non-null single-field candidate key, `label_column` to a non-null field of kind `string` or `text`, and any `alias_columns` and `partition_column` to declared fields. Read the existing normalized binding as emitted. An omitted alias list yields `alias_columns: []` and an omitted partition leaves `partition_column` absent. Registry identity must be unique even across partitions. A composite-key entity needs an independently declared single-field candidate key to use this binding. `source` identifies the registry input. The bound file path is runtime-only. Registry partitioning scopes labels and aliases. It supplies no grant. (`src/types.ts:886–895,1213–1222`, `src/ontology-profile.ts:102–112,328–337,459–473,556–577`, `src/profile-registry.ts:64–94,112–122`. R3:745. Consumer:17.)
6. **Strict decoding.** Refuse duplicate object keys before conversion to maps, unknown fields, duplicate names/tuples and unresolved references, with a path to the offending declaration. Restrict new map keys and model node/relation identifiers against `__proto__`, `prototype`, `constructor` and the runtime keys suppressed by `stableForHash`. Fields in arrays identify columns by the `name` value. Validation occurs before normalization can discard input. The legacy discriminator path is specified in §5. (`src/ontology-profile.ts:69–82,92–99,114–132,289–301`, `src/profile-bundle.ts:151–161`. Consumer:35.)

### Worked OpenERP profile

[JUDGMENT] This self-contained fixture contains **all 11 columns of `users`**, plus the one referenced `organizations` key needed to validate it. Both inline SQL primary keys imply non-nullability. The frozen extraction recorded `notNull: false` for the bare `id` declarations, which lack an explicit `NOT NULL` token. Preserve that evidence in v1. Here the pinned DDL establishes the logical key. Enum order, FK and composite uniqueness are source facts. The registry is an example binding. The example has its own ID. A release of the enriched full ontology would be `openerp@2`. (SQL:3–15,31–44. OpenERP:220–225,255–268,1503–1508,2035. R3:754,880.)

~~~json
{
  "id": "openerp-users-example",
  "version": "2",
  "data_model": {
    "format": "engram.data-model/1",
    "enums": {
      "locale": {"kind": "enum", "values": ["en", "fr"]},
      "user_status": {"kind": "enum", "values": ["invited", "active", "deactivated"]}
    }
  },
  "node_types": {
    "organizations": {
      "attributes": [{"name": "id", "type": {"kind": "uuid"}, "nullable": false}],
      "key": ["id"]
    },
    "users": {
      "registry": "users",
      "attributes": [
        {"name": "id",               "type": {"kind": "uuid"},          "nullable": false},
        {"name": "organization_id",  "type": {"kind": "uuid"},          "nullable": false},
        {"name": "email",            "type": {"kind": "text"},          "nullable": false},
        {"name": "display_name",     "type": {"kind": "text"},          "nullable": false},
        {"name": "preferred_locale", "type": {"enumRef": "locale"},     "nullable": false},
        {"name": "status",           "type": {"enumRef": "user_status"},"nullable": false},
        {"name": "password_hash",    "type": {"kind": "text"},          "nullable": true},
        {"name": "mfa_state",        "type": {"kind": "text"},          "nullable": false},
        {"name": "last_login_at",    "type": {"kind": "timestamptz"},   "nullable": true},
        {"name": "created_at",       "type": {"kind": "timestamptz"},   "nullable": false},
        {"name": "updated_at",       "type": {"kind": "timestamptz"},   "nullable": false}
      ],
      "key": ["id"],
      "unique": [["organization_id", "email"]],
      "references": [{"fields": ["organization_id"], "relation": "users.organization_id", "targetFields": ["id"]}]
    }
  },
  "relation_types": {
    "users.organization_id": {
      "source": "users", "target": "organizations",
      "cardinality": {"out": {"min": 1, "max": 1}, "in": {"min": 0, "max": "many"}}
    }
  },
  "registries": {
    "users": {"source": "users", "node_type": "users", "id_column": "id",
              "label_column": "display_name", "alias_columns": ["email"], "partition_column": "organization_id"}
  }
}
~~~

## 4. Tier G — governed metadata

[JUDGMENT] A separate document identifies one N revision by namespace and exact G0 pin. G can version a tenant boundary, personal-data treatment or access pattern without republishing the logical schema. `Pin` and `Digest` are G0 types. The consumer resolves both pins in their named namespaces. (G0:143–147,206–207. R3:398–399,729–731,754–757. Consumer:22–35.)

~~~ts
type QualifiedPin = { namespace: string, pin: Pin }
type TenantScope = { kind: "global" } | { kind: "tenant", tenant: string, workspace?: string }
type ColumnGovernance = (
  | { pii: { category: "none" }, retention?: never, erasure?: never }
  | { pii: { category: "identifier" | "contact" | "authentication" | "personal" | "sensitive" }, retention: string, erasure: "delete" | "anonymize" }
) & { protect?: { encrypt: true } }
type Retention = { from: string, days: number }
type ChangeCapture = { include: boolean }
type StorageNeeds = {
  tenantScope: TenantScope, columns: Record<string, ColumnGovernance>, cdc: ChangeCapture,
  retention?: Record<string, Retention>,
  physical?: { schema?: string, table?: string, columns?: Record<string, string> },
  indexes?: readonly { kind: "btree" | "unique" | "gin", fields: Names }[],
  partitionBy?: Names, sortBy?: readonly { field: string, direction: "asc" | "desc" }[],
}
type ModelGovernance = {
  format: "engram.data-governance/1", namespace: string, id: string, version: string,
  profile: QualifiedPin,
  entities: Record<string, StorageNeeds>,
  relations?: Record<string, StorageNeeds>
}
~~~

[JUDGMENT] Engram checks the declaration against the **verified N body**. sentbase checks target capabilities and tenant-owned inputs at compilation (§6).

- **Scope and coverage.** `entities` covers every model node exactly once. `relations` covers exactly the independently stored edges (§3) and may be absent when that set is empty. Each table has a `tenantScope` and one `columns[A].pii.category` for every N attribute, including endpoint columns. Extra column entries refuse. Tenant and optional workspace operands name distinct non-null fields on that row of kind `uuid`, `string`, `text`, `int` or `bigint`. A scope operand may repeat across rows. Validate its type and nullability wherever it participates in an N key or reference. Reject a missing field, any other kind, or an incompatible FK tuple. `kind: "global"` has neither operand. cluster-mesh supplies equality predicates and access decisions. (Consumer:23–24,30. R3:730,732,758. SQL:31–33.)
- **Retention and erasure.** Every PII category other than `none` requires a local `retention` rule and an `erasure` action of `delete` or `anonymize`. Category `none` forbids both fields. Use `sensitive` on the same arm as `personal` for information the inventory classifies as sensitive under Québec law or as a special category under the GDPR. A rule's `from` names a non-null `timestamptz` on the row and `days` is a positive safe integer. The action is due that many 24-hour days after the field's timestamp. All `delete` actions on one table must have the same `(from, days)` because they remove the whole row. sentbase resolves tenant-approved anonymization during compilation. The tenant measures erasure across archives, snapshots and backups. (Consumer:24. R3:72,734,795–803. Amendment:4.) [Québec private-sector Act, art. 12, as amended by Loi 25](https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1#se:12) · [GDPR, art. 9](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_9)
- **Column protection.** On either PII arm, `columns[A].protect` may declare exactly `{"encrypt":true}`. For each entity or stored relation row, refuse protection on any member of its N primary `key` or any `unique` tuple, on either side of a foreign key, or on its G `tenantScope.tenant` or `tenantScope.workspace`. For FKs, check local `fields` and referenced `targetFields` on their respective rows, including both `endpoints.source` and `endpoints.target` of a stored edge. Compare logical names before SQL overrides. The declaration states the column needs encryption. sentbase and the tenant choose the mechanism and manage its keys. (Amendment:5. Muse:152–163. R3:805–812.)
- **Deployment boundary.** Tenant residency and storage region belong to sentbase tenant deployment configuration, outside N and G. Region selection contributes no bytes to either digest, so deployments in different regions can use the same verified pair. Strict decoding rejects deployment settings embedded in either model document. (Amendment:6. R3:72,814. Consumer:35.)
- **SQL names.** `physical.schema` and `physical.table` specify SQL identifiers. `physical.columns[A]` overrides the name of a declared column. Engram rejects expressions, unknown logical names and name collisions determined by `(N, G)`. For omitted overrides, sentbase uses the logical table/column names and the schema in its pinned target configuration. It checks all effective names for collisions under the target's identifier rules before emission. The OpenERP round-trip checks overrides against the 773 real source columns. (Consumer:25. OpenERP:2035. R3:743,880.)
- **Indexes and DuckLake.** `indexes[].fields` is an ordered list of logical attributes and `indexes[].kind` is `btree`, `unique` or `gin`. A `unique` index must realize a tuple N already declares unique. For the S3 plan, `partitionBy[]` lists logical fields in partition order and `sortBy[]` lists fields and their `asc` or `desc` direction in sort order. Resolve every field against N and refuse repetitions within a list. (Consumer:26–27. R3:412,734.)
- **CDC.** Every entity and every stored relation requires its own boolean `cdc.include`. `true` includes the table in the mapping and `false` excludes it. Refuse a missing flag even on a payload-free relation table. An FK-backed edge uses its source entity's row event. (Consumer:16,28. R3:732–734.)
- **G preimage.** Serialize the complete closed `ModelGovernance` with `canonicalBytes` and hash its UTF-8 bytes using `sha256Hex`. The preimage includes the literal `pii.category`, the whole `protect` object when declared, and the full N pin in `profile`, including `profile.pin.contentDigest`. Omission contributes no `protect` member on any category, including `sensitive`. Historical G documents serialize as authored under the same `engram.data-governance/1` format. A reader implementing v0.1.3 alone refuses either addition during strict decoding. Both declarations are outside the §5 N preimage. (`src/ontology-guardian/canonical.ts:24–55,59–72`. G0:207. Consumer:22,34–35. Amendment:4–7.)
- **Pin and visibility.** The detached G pin’s `id` and `version` must equal the body’s, in its namespace. G carries no self-digest. A G-only edit needs a new G version. For `private:<tenant>` G, its body, including physical hints and policy details, stays with that tenant. The tenant verifies the pair using N’s existing public pin if N is `public`. If N is private, both bodies stay with the same tenant. For private content the guardian retains only opaque pins, digests and receipt references. (`src/ontology-guardian/types.ts:5–24`. G0:146,207,211,727,758. R3:730,757. Consumer:34.)

**Validation fixtures.** Each RED case changes one declaration in an otherwise valid pair. Report the offending path, including the owning row for a column error. (Amendment:4–7. Consumer:35.)

| Fixture | Mutations that must refuse, tested separately |
|---|---|
| A `sensitive` column with a local rule and `erasure: "delete"` | Omit `retention`, name a missing rule, omit `erasure`, or supply an unknown erasure action. |
| An eligible payload column | Set `protect` to `null`, `{}`, `{"encrypt":false}`, or `{"encrypt":true,"keyId":"k"}`. |
| Keys in the §3 example | Protect `users.id` (primary key), or `users.email` (one component of a composite unique tuple). |
| An FK column outside the local key and scope | Protect a component of a node reference's local tuple. On a stored edge with a separate row key, protect a local source endpoint field, then a local target endpoint field. Protecting a referenced candidate-key field on its node also refuses. |
| A table with distinct tenant and workspace operands outside keys and FKs | Protect just the tenant operand, then just the workspace operand. |
| The tagged §3 profile and its §4 companion | Insert `data_model.storageRegion` in N or `entities.users.physical.residency` in G. Both are unknown fields. |

For passing controls, validate an eligible `sensitive` column with either erasure action and with `protect` present or absent. An eligible `none` payload on a stored edge may request encryption with both retention and erasure absent. (Amendment:4–5.)

### Worked governance document

[JUDGMENT] Revision `2` of this example G document places erasure on each personal attribute. It decorates the same N pin in the `example` namespace. Its classifications, 365-day retention interval, physical names and storage needs are illustrative. They make no retention claim about OpenERP or any jurisdiction. The database’s `organization_id` scope is sourced. (SQL:31–43. OpenERP:140,255–259. R3:730,795–803. Consumer:22–28. G0:207.)

~~~json
{
  "format": "engram.data-governance/1",
  "namespace": "example", "id": "users-governance", "version": "2",
  "profile": {"namespace": "example", "pin": {"id": "openerp-users-example", "version": "2",
              "contentDigest": "21684a38e6c3979937f53a286b275971f3ccda431c299078c0e8715a9240e50e"}},
  "entities": {
    "organizations": {
      "tenantScope": {"kind": "tenant", "tenant": "id"},
      "columns": {"id": {"pii": {"category": "none"}}},
      "cdc": {"include": false}
    },
    "users": {
      "tenantScope": {"kind": "tenant", "tenant": "organization_id"},
      "columns": {
        "id":               {"pii": {"category": "identifier"},     "retention": "account", "erasure": "delete"},
        "organization_id":  {"pii": {"category": "none"}},
        "email":            {"pii": {"category": "contact"},        "retention": "account", "erasure": "delete"},
        "display_name":     {"pii": {"category": "identifier"},     "retention": "account", "erasure": "delete"},
        "preferred_locale": {"pii": {"category": "personal"},       "retention": "account", "erasure": "delete"},
        "status":           {"pii": {"category": "personal"},       "retention": "account", "erasure": "delete"},
        "password_hash":    {"pii": {"category": "authentication"}, "retention": "account", "erasure": "delete"},
        "mfa_state":        {"pii": {"category": "authentication"}, "retention": "account", "erasure": "delete"},
        "last_login_at":    {"pii": {"category": "personal"},       "retention": "account", "erasure": "delete"},
        "created_at":       {"pii": {"category": "personal"},       "retention": "account", "erasure": "delete"},
        "updated_at":       {"pii": {"category": "personal"},       "retention": "account", "erasure": "delete"}
      },
      "retention": {"account": {"from": "updated_at", "days": 365}},
      "physical": {"schema": "identity_data", "table": "accounts", "columns": {"display_name": "label"}},
      "indexes": [{"kind": "btree", "fields": ["organization_id", "status"]}],
      "partitionBy": ["organization_id"],
      "sortBy": [{"field": "created_at", "direction": "desc"}, {"field": "id", "direction": "asc"}],
      "cdc": {"include": true}
    }
  }
}
~~~

[JUDGMENT] The example N preimage is **2531 UTF-8 bytes** and hashes to the `profile.pin.contentDigest` above. G's preimage is **1768 UTF-8 bytes**. For this example the exact §2 extension value is `{"namespace":"example","pin":{"id":"users-governance","version":"2","contentDigest":"649b23132c5400ad11f5a92596057830daa2e5fdfee9258a3a54dc516d0da8d0"}}`. That G digest also verifies the canonical public asset. The figures use §5's proposed N projection and `digestOfPreimage` for G. (`src/ontology-profile.ts:69–83,505–511,519–552`, `src/ontology-guardian/canonical.ts:59–72`. G0:687–692.)

**Revision 3 over the same N pin.** [JUDGMENT] In a synthetic dialysis patient register, a patient's name discloses that they receive treatment. Starting with the complete revision `2` document above, set the G `version` to `"3"` and replace only `entities.users.columns.display_name` with this object. The field is a registry label and the existing `account` rule resolves to 365 days from `updated_at`. (Amendment:4–5. SQL:31–44.)

~~~json
{"pii":{"category":"sensitive"},"retention":"account","erasure":"delete","protect":{"encrypt":true}}
~~~

The canonical G body for `example/users-governance@3` is **1794 UTF-8 bytes**, SHA-256 `3fb9d4dc071b20b1e5e53fb6038604e977efa3dc2f01bfc5b2ea152cd62c2f58`. Its §2 companion carries this new G pin. Revisions `2` and `3` verify against the same `example/openerp-users-example@2` N pin. (`src/ontology-guardian/canonical.ts:59–72`. Consumer:33–35.)

## 5. Why existing digests survive · P1-7

**Current bytes.** `normalizeOntologyProfile` validates the authored input, builds an explicit top-level object, normalizes nodes, relations and registries, compiles linking normalizers, then assigns `profile_hash = hashOntologyProfile(normalized)`. `hashOntologyProfile` feeds the UTF-8 bytes of `JSON.stringify(stableForHash(normalized))` to SHA-256 and returns lowercase hex. `stableForHash` recursively sorts object keys, retains array order, skips `sourcePath`, `profile_hash` and `bound_source_path` at every depth, and skips `fn` only inside `linking.normalize`. When present, `linking.normalizer` enters the hash. A file-backed profile can fingerprint a local module there. §6 defines the narrower bundle contract. Legacy policy defaults and empty arrays are real preimage bytes. (`src/ontology-profile.ts:69–83,114–143,160–172,505–553`. `src/entity-normalizer.ts:140–161`. G0:961–981. R3:742,754,981.)

**Disagreement on retroactive default removal.** Consumer:19 requires absent model fields to stay absent. Extending that rule to existing normalized fields breaks P1-7. The authored `openerp@1` omits `citation_policy`. Removing just that member from its normalized hash input reduces 27,088 bytes to 26,982 and yields `2d94e71bf4ce9018e17d4773856c4ba7fbaa1020e9321b69f181f4ef977f163b`. The frozen v1 vector below therefore fails under the same SHA-256 procedure. Preserve historical defaults and apply absence preservation to the new declarations. Strict closure applies to tagged compiler input. (Consumer:18–20,35. R3:742,754. G0:207,920,961–981. `src/ontology-guardian/openerp-profile.ts:248,491–499`, `src/ontology-profile.ts:119–143,505–511,537`.)

**The opt-in branch.** [JUDGMENT] In `validateOntologyProfile`, `normalizeOntologyProfile` and `bundleProfile`, dispatch solely on the parsed `profile.data_model` **before** testing the version. If `profile.data_model === undefined`, use the legacy validation, normalization, serialization and hash path verbatim at any version. This preserves opaque node fields and the untagged `buildOpenerpSuccessorV2()` vector. If `profile.data_model !== undefined` (including `null`), require a closed header with `format === "engram.data-model/1"` and an exact version string `major` or `major.minor.patch`, each component decimal without leading zeroes and `major === 2`. A tagged `"1"`, malformed version, unknown format/major or mixed `metamodel_version` selector refuses. Add `"data_model"` to `CONSUMED_KEYS` so the accepted header enters normalized N and the closed tagged bundle has `extensions: {}`. A compiler additionally requires the tagged format and a trusted publication pin. (`src/ontology-profile.ts:298–301,513–553`, `src/profile-bundle.ts:105–110,340–372,523–551,560–565`, `src/ontology-guardian/openerp-registry.ts:131–140`, `tests/ontology-guardian-openerp-vectors.test.ts:301–308`. Metamodel:127–136. G0:83,147. Consumer:33–35.)

**Exact typed preimage.** [JUDGMENT] After validation build the current normalized object, including its legacy policies. Copy `data_model` and each node's `attributes`, `key`, and supplied `unique` and `references`. Add `cardinality` to each normalized relation. For a stored relation also copy `attributes`, `key`, `endpoints` and any `unique`. Preserve declared array order. An omitted optional declaration such as `enums` or `unique` contributes no property. An accepted explicit empty collection stays present. An FK-backed relation has no storage members. Hash this object once with `hashOntologyProfile`. G's body, companion pin and catalog metadata are outside N's preimage. (`src/ontology-profile.ts:92–132,505–553`. R3:398–399,754. Consumer:18–22.)

**Proof obligation.** [JUDGMENT] For every historical untagged v1 pin with the same linking resources, compare the actual legacy and candidate hash inputs and loader outcomes. Independent Node processes at the P1-7 baseline and the v0.2.0 base (§1) reproduced identical SHA-256 input buffers for all eleven v0.1.3 digest vectors, including the six historical pins below. Both Engram rows also reproduced through `bundleProfile`. Replay against a future implementation and the full release inventory is `unverified`. (`src/ontology-profile.ts:556–587`, `src/profile-bundle.ts:171–192,541–565`, `tests/ontology-guardian-openerp-vectors.test.ts:227–232`, `tests/ontology-guardian-app-context.test.ts:96–109`.)

| Existing vector | `profile_hash` / `contentDigest` from the baseline |
|---|---|
| `openerp@1` · draft · 27,088 preimage bytes | `8c00c51d1132d48dbe7a223f0fb0fb7b7d79fc6894d403b4731ffa265b081e65` (`src/ontology-guardian/openerp-profile.ts:491–499`, `src/ontology-guardian/openerp-registry.ts:19–32`) |
| `app-context@1` · draft · 13,558 preimage bytes, including visual encodings | `f04ea89ae549471fe0dc62460dccd5b3c87204717b98ea7f4235cbf0d835819a` (`src/ontology-guardian/app-context-registry.ts:39–46,400–410`. Metamodel:133–134.) |
| `generic@1.0.0` · superseded · 2,043 preimage bytes | `6166cca09085eb244751d4c3b0edf82de000d3ca445af134409836970a2f1dbe` (`src/ontology-guardian/diagram-skeletons.ts:205–211`) |
| `archimate@1.0.0` · superseded · 3,128 preimage bytes | `96791bf1886f4a57d3cb96c82573a2bed9da621ddc9262c81d6167b90c3b3b22` (`src/ontology-guardian/diagram-skeletons.ts:205–211`) |
| `uml@1.0.0` · superseded · 2,336 preimage bytes | `184d0b7f7364293a2f835e80c31320300ba0f4f9ebcea35f7e0dc8fc093ea0d9` (`src/ontology-guardian/diagram-skeletons.ts:205–211`) |
| `archi@1.0.0` · draft · 21,212 preimage bytes | `81ed1a11925f9bb1d644a839cad788555ffeea876c8c09d2d0a34d6981e8b344` (`src/ontology-guardian/archi-profile.ts:113–125,160–165`) |

**First RED tests and release gate.** [JUDGMENT] Use the immutable baseline in §1. Lots 1a–1c separate the P1-7 replay, the opt-in change and its controls. The same comparisons gate release. (Brief:37–42. R3:535,754,876,1254. G0:1154,1277.)

1. **Census.** Union the ontology entries in `registry/entries.v1.json`, the registered profile records in `src/ontology-guardian/`, and any immutable release inventory at the baseline. Select exact major-1 `engram-profile` and `diagram-profile` pins across draft, published, superseded and deprecated states. Join matching sources by `(namespace, id, version)` and require their digests to agree. Refuse conflicting evidence, missing pins, missing replay receipts or a repeated row within a source. Compare the set of required pins with the set replayed. At release also enumerate every published v1 pin through the cutoff, including deprecated or superseded versions and owner receipts for private pins. (`registry/entries.v1.json:306–307,349–359,375`. G0:124–131,198–211. R3:754,876.)
2. **Baseline members.** The manifest's sole ontology is the draft `engram/app-context@1`. Registered records also supply draft `openerp/openerp@1`, draft `diagram/archi@1.0.0` and superseded `diagram/{generic,archimate,uml}@1.0.0`. Require all six. Zero published Engram profiles at this baseline is valid. Dropping the two drafts from the Engram replay fails. Mechanism descriptors have their own shape. (`src/ontology-guardian/app-context-registry.ts:293–305,400–412`, `src/ontology-guardian/openerp-registry.ts:19–32`, `src/ontology-guardian/archi-profile.ts:125,160–165`, `src/ontology-guardian/diagram-registry.ts:33,120–159,173–183`, `src/ontology-guardian/diagram-skeletons.ts:205–211`.)
3. **Replay.** Run the baseline and candidate in independent Node processes on identical pinned inputs. Capture actual bytes passed to SHA-256, compare the buffers byte for byte and verify both digests against the recorded pin, including draft pins. For Engram compare public loader and bundle outcomes, including the §6 `unsupported_linking_fn` refusal. On success check `bundle.profileHash` and `bundle.profile.profile_hash`. For diagrams use the native content procedure. Private owners run both readers locally and return only the pin and equality receipt. Fail on a missing input, unequal loader outcome, empty required census or stale evidence. Additional controls cover present/absent linking, bound registries, policy defaults, numeric/string versions, empty collections and historical opaque node fields. Injecting `attributes: []` on every untyped node must trip the byte comparison. (`src/ontology-profile.ts:69–83,114–143,519–552,556–587`, `src/profile-bundle.ts:316–337,541–551`, `src/ontology-guardian/archi-profile.ts:113–125`. G0:211,920.)
4. **Opt-in counterexample.** Append only `"archived"` to the example's `user_status.values` at version `"2"`. The baseline drops `data_model` and `cardinality` and hashes both to `ad473f861ceac840a5b22afc150d50fc8d431ff536e2483dab192816acf1c1d4`. Under §5's projection the original is 2,531 bytes / `21684a38e6c3979937f53a286b275971f3ccda431c299078c0e8715a9240e50e` and the append is 2,542 bytes / `8ea14fc66bbbe2ba3dc4fd9c82904618ecfab9e992c346a5fd948d6afb46babb`. Fix the reader and retain the original golden pins. (`src/ontology-profile.ts:92–99,519–543,550–553`. Consumer:15,18–20.)
5. Mutate stored edge attributes, endpoint tuples, registry columns and tuple order separately with identity fixed in memory. Object-key reorder preserves the hash. Changing G retention or sort repins G and the companion entry's P-ENTRY while N's bytes stay fixed. Binding G to another N changes G and invalidates the old pair. (`src/ontology-profile.ts:69–83,102–112`, `src/ontology-guardian/canonical.ts:49–53,64–72`. G0:206–207,918–923.)
6. Hold the §4 revision `3` identity fixed in memory. In one copy change only `display_name.pii.category` from `sensitive` to `personal`. In another omit only `display_name.protect`. Each copy must produce different G bytes and a different G digest from revision `3`, with identical N bytes. Replay the unmodified revision `2` against its original 1,768 bytes and digest to catch an injected protection default. (`src/ontology-guardian/canonical.ts:49–53,64–72`. Amendment:4–7.)

## 6. Interface to the sentbase compiler

[JUDGMENT] sentbase imports `@sentropic/engram/profile-bundle` from an exact published package version. Private source and `dist/` paths are outside the contract. At the publication boundary, Resolve authenticates the §2 envelope and supplies two expected `QualifiedPin` values. The pure pair verifier takes those pins, the published `ProfileBundleV1` containing normalized N and the separate G document. Decode and Verify return validated declarations or a path-specific refusal. The public subpath and `checkProfileCompatibility` exist at the source pin. The types, verifier and typed classifications below are proposed additions. (`package.json:47–50`, `src/profile-bundle.ts:30–41,541–556,847–858`. G0:188–196. Consumer:32–37.)

| Step | Consumer-visible check or result |
|---|---|
| Resolve | The trusted lookup verifies the §2 companion entry against its external P-ENTRY digest. Match N's namespace and `ontology.profilePin` and G's extension `QualifiedPin` to the two requested pins. Require exact `(namespace, id, version)` and full lowercase SHA-256 `contentDigest` for each. Match N's ID/version to the bundle and normalized profile, and G's identity and whole `profile` pin to G and N respectively. Refuse `latest`, ranges, unknown versions/majors, stale or missing pins and namespace swaps. Enforce the §2 visibility rule. Resolve public N by its public pin and public G from its verified asset. For `private:<tenant>` G the tenant resolves G locally, obtains N by its public pin or from that same tenant’s private store, and verifies the pair locally. [JUDGMENT] (Consumer:33–34. G0:83,143–147,206–211,687–692,727,758. `src/types.ts:1244–1252`.) |
| Decode | Consume normalized JSON in `bundle.profile` exactly as Engram emits it and the closed G document. The publisher checks preservation of authored fields and array order under §5. The compiler strictly decodes both wire shapes, including types, ordering and cross-references, and refuses duplicate or unknown fields before projection. An embedded access rule or RLS predicate refuses in either tier. Require the §5 tagged major-2 header in N and an empty `bundle.extensions`. The catalog's G extension belongs to the §2 envelope. [JUDGMENT] (Consumer:30,35. `src/profile-bundle.ts:30–41,105–114,523–551`.) |
| Verify | Recompute N with `hashOntologyProfile` (§5). Require equality with `bundle.profileHash`, `bundle.profile.profile_hash` and N’s `pin.contentDigest`. Recompute G with `digestOfPreimage` (§4) and compare with G’s detached `pin.contentDigest`. Any mismatch refuses the pair. `ProfileBundleV1.digest` covers the document projection and registry snapshot mode. Record it separately if used. [JUDGMENT] (Consumer:33–35. G0:920,981. `src/profile-bundle.ts:171–192,541–551`, `src/ontology-guardian/canonical.ts:59–72`.) |
| Evolve N | `checkProfileCompatibility(old, new)` validates both inputs and applies the matrix below. A classified non-breaking change takes a new immutable version and a generated additive migration. A breaking change requires a higher model major and a `migrationRef` string identifying an immutable migration revision in publication metadata. A non-null addition on an existing row always takes this path. Its backfill belongs to that migration. The v0 compiler refuses a new major until its reader is qualified. [JUDGMENT] (Consumer:36. G0:174,177,186–198,206–207. R3:755–756. `src/profile-bundle.ts:80–88,847–877`.) |
| Evolve G | For every valid §4 edit to the governance of a pinned N model, publish a new G `version` and companion `entryVersion` under §2. Reuse the exact N pin. Apply the tier G deployment rules below to the changes in that revision. [JUDGMENT] (Consumer:22–28,34. R3:730,755–757. Amendment:4–5. Carbon v0.2:13–19.) |
| Compile and apply | sentbase compiles N, G and cluster-mesh's typed rights offline. For each `anonymize` field it must resolve a pinned, tenant-approved transformation compatible with the field's type, nullability, keys and references. For each `protect` declaration, sentbase checks that the tenant's target configuration can enforce column encryption. Refuse an unmet encryption need, an unavailable or incompatible transformation, unsupported target semantics or untranslatable rights before emission. The compiler receipt records both qualified pins and their input digests, rights revision, applicable transformation pins, compiler and target versions, options and output hashes. Replaying these inputs must reproduce the output bytes. The tenant executes the generated migrations. Memory joins stay read-only projections. [JUDGMENT] (Consumer:24,30,36–37. G0:74,77. R3:404–421,729–735,756–763,795–805. Amendment:5.) |

[JUDGMENT] Use the same valid `(N, G)` pair with an `anonymize` field in two tenant compile fixtures. Engram accepts both declarations. With no suitable transformation sentbase must refuse before generating DDL. With the approved transformation it must reproduce the output and identify the transformation in the receipt. (Consumer:24,37. R3:734,762,803.)

**Linking in v0 bundles.** In a v0 `ProfileBundleV1`, nodes may omit `linking` or use supported presets and built-in normalizers. For example, `linking.normalize.builtin: ["case_fold"]` produces `builtins: ["case_fold@1"]` in `linking.normalizer`. Before normalization, `bundleProfile` refuses a module reference at `node_types.<id>.linking.normalize.fn` with `refusalCode: "unsupported_linking_fn"`. The bundle’s `documentProjection` omits the module reference. `checkProfileCompatibility` re-derives the normalized profile from that projection. [JUDGMENT] The pair verifier accepts only a built-in descriptor reproducible from the projection. A supplied `module_sha256` fails verification without resolving a module path or loading linking code. (G0:77. `src/entity-normalizer.ts:31–39,140–164,314–330,344–354`, `src/profile-bundle.ts:298,316–337,386–388,749–767`, `src/ontology-guardian/digests.ts:88–96`, `tests/profile-bundle.test.ts:275–276`.)

### Tier N compatibility matrix

[JUDGMENT] Compare validated declarations, including stored relation rows. Match entity, relation, attribute, domain and registry declarations by name. Classify a newly added table as a whole, including its required local columns and keys. Check separately any obligation it imposes on an existing row or endpoint. For a compound change apply **refusal, then breaking, then non-breaking** in that order. A wider value domain or cardinality admits every old value or count. Use the named existing rules for inherited profile fields and consume each typed path once before residual checks. (Consumer:36. R3:755–756. `src/profile-bundle.ts:916–931,979–983,987–1023,1028–1054`. `tests/profile-bundle.test.ts:144–170,179–185`.)

| Construct | Non-breaking | Breaking |
|---|---|---|
| Entity or relation | Add an entity with its full row or a relation with no new constraint on existing rows. | Remove or rename either. Adding a relation that requires participation or imposes a new FK on existing rows is breaking. Switching the storage mode of a surviving relation is also breaking. |
| Attributes on an existing entity or stored edge | Add a nullable field with existing relative order preserved. Relax `nullable` from `false` to `true`. | Add **any** non-nullable field, remove/rename a field, reorder surviving fields, or tighten nullability. The classifier takes only old and new inputs. |
| Logical types and text bounds | Keep the kind and widen the interval of allowed lengths. For comparison an absent minimum means 0 and an absent maximum is unbounded. | Change kind or `enumRef`, or exclude any previously allowed length. `string` → `text` changes kind. |
| `decimal(p,s)` | Widen if both the fractional capacity `s` and integer capacity `p − s` stay equal or grow. Thus `(8,2)` → `(10,3)` widens. | Any loss of fractional or integer capacity, including `(8,2)` → `(8,3)`. |
| Named enums and ordered `values` | Add a domain, or append values with the entire old list as a prefix. The §5 `"archived"` mutation is non-breaking. | Remove/rename a domain, replace/remove a member, insert before the old tail or reorder existing values. |
| `key` and `unique` | Reorder the outer list of unchanged unique tuples. | Change primary key membership or order. Add a unique tuple (can reject old rows), remove one (withdraws a candidate key), or change its fields or their order. |
| References and stored endpoints | Reorder the outer list of unchanged references. | Add or remove a reference on a surviving entity. Change its relation, local or target tuple/order, endpoint node or role, or either `endpoints` mapping on a stored row. |
| `cardinality.in` and `.out` | Lower a minimum or raise a maximum with no bound tightening. `"many"` is unbounded. | Raise either minimum or lower either maximum, including a mixed widen/tighten. |
| Registries | Add a registry with a new node, or add an unbound registry. An alias-list reorder preserves its lookup set. | Remove/rename a registry or change a surviving node's `registry` binding, `source`, `node_type`, `id_column`, `label_column`, alias membership or `partition_column`. |
| Header, identity and optional containers | Bump the version on an otherwise equal model. Pure object-key reorder has no effect. Absent ↔ accepted empty optional containers, outer-list reorder as above, and equal effective bounds are non-breaking even if bytes differ. | Change profile ID or move from an untagged legacy model to its first tagged successor. |

[JUDGMENT] In a typed comparison, dropping the header from a successor, an unknown format, an unsupported major or an invalid declaration refuses at validation with `invalid_profile_schema`. Treat two untagged inputs with the existing compatibility API. (Consumer:35–36. `src/profile-bundle.ts:340–372,847–877`.)

[JUDGMENT] For classified valid pairs return `ok: true`, `compatible: breaking.length === 0`, both bundle digests, sorted change lists and `validationIssues: []`. On any unclassified typed or inherited residual delta return `ok: false`, `compatible: false`, `oldDigest: oldBundle.digest`, `newDigest: newBundle.digest`, `breaking: []`, `nonBreaking: []` and a `validationIssues` entry `{severity: "error", code: "unclassified_data_model_delta", path, message}` for each unhandled path. A compound change with a known nullable addition and an unhandled delta must return that refusal. Unknown wire fields fail strict validation first using `invalid_profile_schema`. (`src/profile-bundle.ts:16–21,80–101,858–877,979–983,1018–1024,1188–1205`. Consumer:35–36.)

### Tier G deployment rules

[JUDGMENT] Compare two verified revisions of the same G document over the same N pin. A different `profile` pin selects a new pair under §5 item 5. Check each entity and stored relation. Where a column declares `retention`, resolve its local rule to `(from, days)`. A compound edit requires reviewed evidence if any of its changes does. Refuse an unclassified change. (Consumer:22–28,34. R3:730,755–757. Carbon v0.2:13–19.)

| Deployment gate | Changes to a valid G declaration |
|---|---|
| Metadata or layout repin. Proceed to the ordinary compile checks. | Changes to `indexes`, `sortBy`, `partitionBy` or `cdc.include`. Extending a retention window on the same clock. Reclassifying `pii.category` between any two non-`none` categories, including `sensitive`, with unchanged `erasure`. Edits that preserve effective settings, such as renaming a retention rule and updating all uses. |
| Data or boundary transition. Require reviewed transition evidence before deployment. | Changing `tenantScope` or a column’s `erasure`, including the addition or removal of erasure when moving between `none` and any PII category. Adding or removing `protect` on an existing table. Shortening a retention window or changing its `from` clock. Renaming an effective SQL identifier through `physical.schema`, `physical.table` or `physical.columns[A]`. |

Reclassifying `users.display_name` from `identifier` to `sensitive` with its existing retention and erasure is a metadata repin. The §4 revision `2` → `3` also adds `protect`. On an existing table, adding or removing protection requires reviewed evidence covering CNPG values and DuckLake snapshots. On a new table, sentbase checks the initial protection setting against the tenant’s encryption capability before emission. (Amendment:5. Muse:152–163. Carbon v0.2:16–19.)

### sentbase L0 acceptance

- **Minimal export.** DS7 must first decouple the required production manifest of the delivered `@sentropic/engram` unit from `ai`, provider SDKs and any transitive path that installs them. The snapshot's root `dependencies` include `ai`, five `@ai-sdk/*` packages, `@sentropic/llm-mesh` and `graphology`. Selecting a subpath still installs required root dependencies. DS7 exit supplies the packed minimal unit and its qualified closure as a prerequisite of 3.1. (Consumer:39–41. R3:759,764,869,876. `package.json:47–50,145–165`.)
- **Lot 10 receipt.** In a clean consumer of that exact tarball, enumerate the installed transitive production packages with their versions and licences. Fail on any AI SDK or any member outside MIT, Apache-2.0 or CC0. Separately walk static imports and instrument an actual load of the public `./profile-bundle` through validation and verification. Require zero AI SDK, host or runtime `graphology` imports/loads. Record the tarball digest and both results. The static walker pattern is `scripts/substrate-tarball-acceptance.mjs:64–83,105–117`. The release receipt is `unverified`. (Consumer:40. G0:77,188–196. R3:759,869,876.)
- **cluster-mesh alignment.** In the r3 snapshot, cluster-mesh declares Engram `>=0.22.0 <0.23.0` as a peer and `0.22.0` for development. Engram is `0.28.0`, outside that range. At DS7 entry, s-conductor aligns the consumer dependency with a published Engram release. Acceptance requires a receipt naming the resolved exact package version and showing a successful load of `@sentropic/engram/profile-bundle` from cluster-mesh. This package alignment is `unverified`. Model pins remain exact under I-10. (Consumer:41. Mesh snapshot:269,294. `package.json:3`. R3:456,764,982. G0:83.)

## 7. Test-first Engram lots

[JUDGMENT] **GPT-6.2 Sol xhigh** builds every lot (owner, 20 November). Each cap counts additions plus deletions, including tests, fixtures, types, blank lines and implementation. Each lot observes its named failure, makes its own gate green and replays earlier gates. Use Node, TypeScript and Vitest throughout. Zero Python. These lots subdivide Engram's r3 work in 3.1, after DS7. (Brief:37–43. G0:80. R3:869,876. `package.json:88–92,101`.)

| Lot | Max lines | First failing assertion | Passing change |
|---|---:|---|---|
| 1a. P1-7 baseline replay | 150 | First run the byte-equality assertion with `attributes: []` injected on an untagged node. Observe RED against the recorded pin. Omitting a draft must also fail census equality. | Build the independent six-pin census and the two-process Engram byte comparison (§5). Remove the deliberate mutant to obtain green with the legacy reader. Reuse the registered v1 sources. |
| 1b. Tagged dispatch and enum vector | 150 | The unchanged normalizer hashes both §5 enum variants identically. Tagged `"1"` is accepted, or untagged `"2"` loses its pinned result. | Add the worked N fixture, header/version dispatch, consumed bundle key and projection of the header and cardinality. Reproduce both §5 N hashes and the untagged successor vector. |
| 1c. Replay controls and receipts | 140 | Omitting a native-adapter replay, an applicable private-owner receipt or a legacy control allows an incomplete release pass. | Use the 1a runner for the native diagram preimages, release/private evidence and remaining §5 controls. Require one matching receipt per census pin and exercise load/bind/bundle. |
| 2. Attribute domains | 140 | `bool` is accepted, `date` loses its native schema, `string` and `text` hash identically, or a missing `nullable`, `default`, invalid bound, duplicate name or dangling enum passes. | Share the neutral scalar declarations and schema fragments. Validate the closed logical domains and preserve each declared kind. **Conductor-approved size exception:** 208 code/test lines (131 `src/` + 77 `tests/`, plus this spec line = 210 diff lines) vs the 140-line cap, for the boundary and control tests required by review. |
| 3. Keys | 110 | A key containing an unknown, repeated or nullable column passes. | Validate primary and unique tuples, arity and order on a `ModelRow`. |
| 4a. FK-backed edges | 120 | A reversed/incompatible tuple, second FK binding or edge payload on a bound FK passes. | Verify the local and candidate-key tuples, singleton endpoints and FK multiplicities. |
| 4b. Stored edges | 140 | The `memberships` vector accepts an absent endpoint column or row key, or an endpoint/payload mutation leaves N unchanged. | Validate and project explicit stored rows, both endpoint tuples and cardinality. |
| 5. Registries and input closure | 135 | A nonunique ID, wrong node, dangling partition, reserved map key or duplicate input member is accepted. | Extend strict decoding and registry binding using the shared profile types. |
| 6. G ownership and retention | 145 | A nullable, `json` or missing scope operand, duplicate tenant/workspace operand, incompatible N key/FK, missing personal-data erasure or conflicting row deletes passes. | Check column coverage, allowed scope kinds, retention clocks and erasure declarations from `(N, G)` alone. A valid `anonymize` passes here without a tenant transformation lookup. |
| 7. G storage and bytes | 140 | A G entry on an FK, missing stored-edge scope or CDC, a SQL collision or an undeclared unique index passes, or the `users-governance@2` preimage misses its §4 byte count or digest. | Complete the closed schema for stored `relations` and each table’s `physical`, `indexes`, `partitionBy`, `sortBy` and `cdc`. Add the worked `users-governance@2` fixture and seal the complete G body with its full N pin. Run both §4 region-injection cases. |
| 7a. Sensitive data and protection syntax | 135 | Validation rejects a valid `sensitive` column or eligible protected payload, accepts missing retention or erasure or a malformed `protect` flag, or a §5 item 6 mutation preserves the G digest. | Extend the PII arm and decode the closed `protect` flag. Run the §4 sensitivity and flag-shape cases with both erasure controls. With protection absent, changing only `personal` to `sensitive` must change G’s digest. Derive `users-governance@3` from Lot 7’s fixture. Replay both worked G vectors and both §5 item 6 mutations with N’s bytes fixed. |
| 7b. Column protection on keys, FKs and scope | 145 | A protected primary or unique key member, FK component, tenant operand or workspace operand is accepted. | Check logical names before SQL overrides on entities and stored edges. Exercise the §4 role cases, including local and referenced fields on node FKs and both stored-edge endpoints. Keep eligible protected payloads passing on both PII arms, including `none` on a stored edge. |
| 8a. Companion publication | 125 | A private G over public N is refused, or a public or other-tenant companion for private N is admitted. | Test all three permitted §2 pairs. Refuse a missing required extension, missing or substituted public G asset, private G asset or stale P-ENTRY digest. Check tenant receipts, cross-tenant deny-as-missing and the digest change on a G-only revision. |
| 8b. Pair verification through the public export | 145 | A swapped namespace, stale pin, unknown format, altered normalized body, bundle digest substituted for N or injected `module_sha256` passes. | Export the pure verifier and types. Check both input documents, pins and content digests. Exercise the §6 built-in and `unsupported_linking_fn` cases. Reuse the same public N pin with public and tenant-private G. Verify both private G cases at the owning tenant. |
| 9a. Row and domain compatibility | 140 | A nullable addition, non-null addition, enum append/reorder or equal-precision decimal scale shift receives the wrong §6 result. | Classify node and edge row attributes, named domains, keys and unique tuples with table-driven cases for both directions. |
| 9b. Relation and registry compatibility | 145 | A cardinality tightening, endpoint/registry change, or known-plus-unhandled compound change yields a compatible result. | Complete the §6 matrix and assert exact refusal flags, code and path. Replay 9a's cases together with the inherited classifiers. |
| 10. Conformance and delivery | 150 | DS7's packed public import has a forbidden static/runtime edge, an AI package in the installed closure, an excluded licence or a missing digest receipt. | Reuse the tarball walker and DS7-qualified unit. Verify both L0 receipts, worked vectors, G-only mutation and all required v1 replays. |

**External dependencies.** DS7 delivers the minimal Engram unit with its root production manifest decoupled, qualified closure and cluster-mesh load receipt (§6). It gates 3.1, including Lot 10's clean-install check. SC2 belongs to cluster-mesh and supplies the rights translator, bounded rules and independent oracle. sentbase lots 3.2 and 3.3 consume 3.1 and SC2 for the Task slice and evolution, 3.4 verifies the OpenERP round-trip, and 4.1 consumes registry bindings for graph views. (R3:758–764,869,876–881.)

## 8. Open decisions

| Question and owner | Options | Recommendation [JUDGMENT] |
|---|---|---|
| How should exact domains outside the v0 type set enter N? Engram and the sentbase interface owner. OpenERP already contains `text[]`. (OpenERP:238–243. Consumer:8–10. Diagrams:435.) | (A) Refuse each unsupported field and record the round-trip gap. (B) Qualify an array adapter using the shared collection kind with explicit element/bound semantics. (C) Extend N with arrays and geometry together after both have pinned fixtures. | Start with A. Qualify B when the first real array must round-trip. Admit geometry only on source and target evidence. |
| How can a column map to an external standard’s property under OQ-OP-15? Engram G0 custodian. G’s physical names and privacy annotations do not establish cross-ontology correspondences. (OpenERP:2077,2219. G0:542–553. Consumer:25.) | (A) Define a versioned field-mapping arm with source and target field identities. (B) Ratify lossless field semantics for an existing arm. (C) Keep evidence outside the mapping artifact. | Use C until a pinned public property and a validated source field exist, then A. Keep v1 mappings and P-MAPPING bytes immutable. |
| Should future models admit authored defaults? Engram and sentbase. Source DDL includes generated UUIDs, status defaults and timestamps. (SQL:31–43. Consumer:18–20. R3:754.) | (A) Require caller-supplied values in v0. (B) Add typed literal defaults in a later dialect. (C) Specify generated values separately with an implementing target receipt. | Use A for this version. Consider B or C only when a concrete round-trip proves which semantics are required. Never synthesize a missing declaration during normalization. |

## 9. Coverage of the sentbase compiler input

`covered` identifies a v0 read or check. `open` identifies a proposal v0 refuses. `rejected` records a disagreement and its deciding source. `A` is a logical attribute, `D` an enum domain and `r` a relation. Locations identify the normalized wire contract or the compiler gate. (Consumer:1–41. Fold:5–10.)

sentbase accepted all 66 rows of v0.1.3 as conformant or better, including the native `boolean` spelling, v0 refusal of authored defaults, geometry and arrays (§8 option A first), and preservation of legacy defaults. The three additional rows record its follow-up requests on sensitive data, column protection and tenant residency. (Amendment:3–7.)

| Compiler field or condition | Tier | Status | Place in this spec (path:line) | Source |
|---|---|---|---|---|
| Node `attributes[]` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:165` | Consumer:8 |
| Node `attributes[].name` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:165` | Consumer:9 |
| Node `attributes[].type` (closed logical domains) | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:166` | Consumer:10 |
| Boolean spelling `bool` | N | rejected | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:166` | Consumer:3,10. Metamodel:180. `src/ontology-guardian/diagram-schemas.ts:160` |
| `decimal(p,s)` precision → `type.precision` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:168` | Consumer:10 |
| `decimal(p,s)` scale → `type.scale` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:168` | Consumer:10 |
| `enum:<ref>` domain name → `type.enumRef` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:170` | Consumer:10 |
| `type` candidate `geometry` | N | open | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:170` | Consumer:10 |
| `type` candidate `array` | N | open | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:170` | Consumer:10 |
| Node `attributes[].nullable` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:165` | Consumer:11 |
| Node `key[]` (ordered primary key) | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:171` | Consumer:12 |
| Node `unique[]` (ordered attribute tuples) | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:171` | Consumer:13 |
| Node `references[]` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:152` | Consumer:14 |
| Reference local attributes → `fields[]` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:172` | Consumer:14 |
| Reference target node → `relation_types[r].target_types[0]` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:172` | Consumer:14 |
| Reference target attributes → `targetFields[]` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:172` | Consumer:14 |
| Reference cardinality → `relation_types[r].cardinality` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:172` | Consumer:14 |
| Closed domains → `data_model.enums` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:170` | Consumer:15 |
| Ordered enum members → `data_model.enums[D].values[]` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:170` | Consumer:15 |
| Relation `cardinality` (outgoing and incoming bounds) | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:174`, `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:176` | Consumer:16 |
| Relation `attributes[]` (endpoint, scope and any payload columns on a stored row) | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:176` | Consumer:16 |
| Edge `attributes[].name` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:165` | Consumer:9,16 |
| Edge `attributes[].type` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:166` | Consumer:10,16 |
| Edge `attributes[].nullable` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:165` | Consumer:11,16 |
| Registry ID → `id_column` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:179` | Consumer:17 |
| Registry label → `label_column` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:179` | Consumer:17 |
| Registry aliases → `alias_columns[]` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:179` | Consumer:17 |
| Registry partition → `partition_column` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:179` | Consumer:17 |
| Absent optional model field (the `linking` rule) | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:348` | Consumer:19. R3:742,754 |
| Value `default` on an attribute (refused in v0) | N | open | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:165` | Consumer:20 |
| Retroactive removal of legacy defaults (disagreement) | N | rejected | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:344` | Consumer:19 (legacy interpretation). G0:207,920,981. R3:742,754 |
| `tenantScope` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:241` | Consumer:23 |
| Tenant equality field → `tenantScope.tenant` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:265` | Consumer:23 |
| Workspace equality field → `tenantScope.workspace` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:265` | Consumer:23 |
| Attribute `pii.category` → `columns[A].pii.category` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:265` | Consumer:24 |
| Sensitive data → `columns[A].pii.category = "sensitive"` with required retention and erasure | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:266` | Amendment:4. Consumer:24 |
| Column protection → optional `columns[A].protect` with literal `encrypt: true` and key, FK and scope exclusions | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:267` | Amendment:5. Muse:152–163 |
| Attribute `retention` → `columns[A].retention` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:266` | Consumer:24 |
| Attribute `erasure` → `columns[A].erasure` (`delete` or `anonymize`) | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:266` | Consumer:24 |
| SQL name overrides → `physical` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:269` | Consumer:25 |
| Schema override → `physical.schema` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:269` | Consumer:25 |
| Table override → `physical.table` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:269` | Consumer:25 |
| Column overrides → `physical.columns[A]` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:269` | Consumer:25 |
| Index declarations → `indexes[]` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:252` | Consumer:26 |
| Index attributes → `indexes[].fields[]` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:270` | Consumer:26 |
| Index kind → `indexes[].kind` (`btree`, `unique`, `gin`) | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:270` | Consumer:26 |
| DuckLake partition fields → `partitionBy[]` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:270` | Consumer:27 |
| DuckLake sort order → `sortBy[]` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:270` | Consumer:27 |
| Entity `cdc.include` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:271` | Consumer:28 |
| Profile pin `namespace` (publication lookup) | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:376` | Consumer:33. G0:206 |
| Profile pin `id` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:376` | Consumer:33. G0:144 |
| Profile pin `version` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:376` | Consumer:33. G0:83,144 |
| Profile SHA-256 → N `pin.contentDigest` | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:378` | Consumer:7,33,35. G0:920 |
| Detached G SHA-256 → G `pin.contentDigest` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:378` | Consumer:22,34–35 |
| Decorated profile digest → G `profile.pin.contentDigest` | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:272` | Consumer:34 |
| Exact pins, refusal of `latest` and ranges | N and G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:376` | Consumer:33–34. G0:83,144 |
| Public `./profile-bundle` from a published package, no private import | N and G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:372` | Consumer:33 |
| G document identity `(namespace, id, version)` and companion catalog pin | G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:123` | Consumer:34. G0:689–692 |
| Tenant-side verification of private G with public or same-tenant private N | N and G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:273` | Consumer:34. G0:211,727 |
| Normalized JSON and strict unknown-field refusal | N and G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:377` | Consumer:35 |
| Recompute both content digests and refuse mismatches | N and G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:378` | Consumer:35 |
| `checkProfileCompatibility(old, new)`, non-breaking/additive and breaking/major with referenced migration | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:379` | Consumer:36 |
| Unclassified or compound unclassified change refuses | N | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:406` | Consumer:36 |
| Same inputs give identical output bytes | N and G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:381` | Consumer:37 |
| Compiler receipt includes the input digests | N and G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:381` | Consumer:37 |
| L0 minimal export, zero AI SDK and MIT, Apache-2.0 or CC0 transitive licence closure | N and G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:422` | Consumer:39–40. R3:759,869 |
| L0 cluster-mesh peer `>=0.22.0 <0.23.0` versus Engram `0.28.0`, exact load receipt | N and G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:423` | Consumer:41. Mesh snapshot:269,294 |
| Access rules supplied by cluster-mesh, embedded rights refused | Outside N and G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:377` | Consumer:30. R3:732–733 |
| Tenant residency or storage region → sentbase tenant deployment configuration | Outside N and G | covered | `spec/SPEC_ONTOLOGY_GUARDIAN_G0_AMENDMENT_DATA_MODELS.md:268` | Amendment:6. R3:72,814 |

## Review round 1 — dispositions

- **F1 · Accepted.** Use the shared native `boolean`/`date` arm and one neutral scalar module. §9 records the `bool` spelling disagreement. (Metamodel:180. `src/ontology-guardian/diagram-native-types.ts:11–15`. Consumer:3,10.)
- **F2 · Accepted.** FK-backed edges own no table. Stored edges declare their endpoint tuples, row key and columns in N, with exact G coverage and required CDC. (Consumer:14–16,23–28. Metamodel:269–280. §7 lots 4a–4b, 7.)
- **F3 · Accepted.** Count both draft Engram pins and four v1 diagram profiles. Carbon estimates 280–350 changed lines. Lots 1a–1c give the replay, enum RED and controls separate 150-line ceilings. (Review 1:19–23. Brief:37–42. `registry/entries.v1.json:349–375`, `src/ontology-guardian/archi-profile.ts:160–165`, `src/ontology-guardian/diagram-registry.ts:120–159`.)
- **F4 · Accepted.** Publish G through a standalone `kind: "ontology"` companion entry with a required, digest-bound qualified extension and public or tenant-local resolution. (G0:658–672,687–694,923. `src/ontology-guardian/catalog.ts:146–159`.)
- **F5 · Accepted.** §6 classifies each typed construct, including non-null additions, and gives the exact failed result for an unclassified delta. Migration evidence is checked at publication. (Consumer:36. `src/profile-bundle.ts:80–88,847–877,1195–1205`.)
- **F6 · Accepted.** DS7 owns manifest decoupling. Lot 10 checks the installed package and licence closure and the static and runtime imports of the public subpath. (R3:759,869,876. `package.json:145–165`.)
- **F7 · Accepted.** §1 identifies the fold brief and §9 maps the compiler contract, proof and both L0 expectations through Consumer:41. (Fold:5–10. Consumer:30–41.)
- **F8 · Accepted.** Header presence selects strict validation before version dispatch. The untagged v2 successor keeps its existing hash and tagged v1 refuses. (`src/profile-bundle.ts:105–110,523–551`, `tests/ontology-guardian-openerp-vectors.test.ts:301–308`.)
- **F9 · Accepted.** §4 enumerates scope kinds and checks local retention conflicts. §6 makes sentbase resolve the tenant's anonymization transformation before emission. (Consumer:23–24. R3:730–735,758,795–803.)

## Review round 2 — dispositions

- **N1 · Accepted.** §6 admits built-in linking descriptors and presets in v0 bundles. A module reference yields `unsupported_linking_fn`, and a supplied module fingerprint fails re-derivation. (Review 2:19–23. `src/profile-bundle.ts:316–337,749–767`, `tests/profile-bundle.test.ts:275–276`.)
- **N2 · Accepted.** §§2, 4 and 6 permit private G on public N and require the same tenant for private N and G. Only public G ships a `data-governance` asset. Lots 8a and 8b cover publication and tenant-side verification. (Review 2:25–29. Consumer:33–35. G0:146,168,211,687,727,758.)

## v0.2.0 review round 1 — dispositions

- **M1 · Accepted.** Lot 7 owns the closed storage schema, the `users-governance@2` fixture and G preimage sealing. Lot 7a reuses them for the revision `3` and §5 digest checks. Lot 7b owns the protected-column role checks. (Carbon v0.2:5–11.)
- **M2 · Accepted.** §6 gives every valid governance edit a G and companion repin over the same N and specifies which edits require reviewed transition evidence, including adding or removing protection on an existing table. (Carbon v0.2:13–19.)

## Summary

- sentbase accepted all 66 v0.1.3 coverage rows. Tier G adds `sensitive` with mandatory retention and erasure and permits `protect` on columns outside keys, FKs and scope operands.
- sentbase and the tenant choose the encryption mechanism. The tenant selects residency and storage region in sentbase deployment configuration.
- Each governance edit versions G and its companion over the same N pin. Data or boundary transitions require reviewed evidence before deployment.
- GPT-6.2 Sol xhigh seals revision `2` in Lot 7, replays both G vectors in Lot 7a (135 lines) and checks column roles in Lot 7b (145 lines). The §5 replay covers all six historical v1 pins.
