import { expect, it } from "vitest";
import { parseOntologyProfile } from "../src/ontology-profile.js";
import { checkProfileCompatibility } from "../src/profile-bundle.js";
import example from "./fixtures/g0-openerp-users-model.json";
const U = (p: any) => p.node_types.users, M = (p: any) => p.relation_types.memberships;
const nick = (nullable: boolean) => ({ name: "nick", type: { kind: "text" }, nullable });
const D82 = { name: "s", type: { kind: "decimal", precision: 8, scale: 2 }, nullable: false };
const uuid = (name: string) => ({ name, type: { kind: "uuid" }, nullable: false });
const addManager = (p: any) => {
  U(p).attributes.push({ name: "manager_id", type: { kind: "uuid" }, nullable: true });
  p.relation_types["users.manager_id"] = { source: "users", target: "users",
    cardinality: { out: { min: 0, max: 1 }, in: { min: 0, max: "many" } } };
  U(p).references.push({ fields: ["manager_id"], relation: "users.manager_id", targetFields: ["id"] });
};
const addIdLink = (p: any) => { p.relation_types["users.idlink"] = { source: "users",
  target: "organizations", cardinality: { out: { min: 1, max: 1 }, in: { min: 0, max: 1 } } };
  U(p).references.push({ fields: ["id"], relation: "users.idlink", targetFields: ["id"] }); };
const addStored = (p: any, inMin: number) => {
  p.relation_types.user_devices = { source: "users", target: "organizations",
    cardinality: { out: { min: 0, max: "many" }, in: { min: inMin, max: "many" } },
    attributes: [{ name: "device_id", type: { kind: "uuid" }, nullable: false }], key: ["device_id"],
    endpoints: { source: { fields: ["device_id"], targetFields: ["id"] },
      target: { fields: ["device_id"], targetFields: ["id"] } } };
};
const stripEnums = (p: any) => {
  for (const n of Object.values(p.node_types) as any[]) for (const a of n.attributes)
    if (a.type.enumRef) a.type = { kind: "text" };
  delete p.data_model.enums;
};
const switchToStored = (p: any) => {
  U(p).references = [];
  p.relation_types["users.organization_id"] = { source: "users", target: "organizations",
    cardinality: { out: { min: 1, max: "many" }, in: { min: 0, max: "many" } },
    attributes: [{ name: "organization_id", type: { kind: "uuid" }, nullable: false }], key: ["organization_id"],
    endpoints: { source: { fields: ["organization_id"], targetFields: ["id"] },
      target: { fields: ["organization_id"], targetFields: ["id"] } } };
};
const base = (): any => {
  const p: any = structuredClone(example);
  const cols = [{ name: "organization_id", type: { kind: "uuid" }, nullable: false },
    { name: "user_id", type: { kind: "uuid" }, nullable: false }];
  p.relation_types.memberships = { source: "organizations", target: "users",
    cardinality: { out: { min: 0, max: "many" }, in: { min: 0, max: "many" } }, attributes: cols,
    key: ["organization_id", "user_id"],
    endpoints: { source: { fields: ["organization_id"], targetFields: ["id"] },
      target: { fields: ["user_id"], targetFields: ["id"] } } };
  return p;
};
type Mut = (p: any) => void;
const rows: Array<[string, Mut | null, Mut, string, string, boolean, string, number, boolean, number]> = [
  ["nullable addition", null, (p) => { U(p).attributes.push(nick(true)); },
    "existing relative order preserved", "nullable-add-breaking", true, "added_nullable_attribute", 1, false, 1],
  ["non-null addition", null, (p) => { U(p).attributes.push(nick(false)); },
    "Add any non-nullable field", "non-null-add-compatible", false, "added_non_nullable_attribute", 1, false, 1],
  ["relax nullability", null, (p) => { U(p).attributes[7].nullable = true; },
    "Relax nullable from false to true", "relax-misclassified", true, "relaxed_attribute_nullability", 1, false, 1],
  ["reorder surviving fields", null, (p) => { const a = U(p).attributes; [a[2], a[3]] = [a[3], a[2]]; },
    "reorder surviving fields", "reorder-misclassified", false, "reordered_row_attributes", 1, false, 1],
  ["narrow text bound", null, (p) => { U(p).attributes[2].type = { kind: "text", maxLength: 64 }; },
    "exclude any previously allowed length", "narrow-misclassified", false, "narrowed_text_bounds", 1, true, 1],
  ["change kind", null, (p) => { U(p).attributes[2].type = { kind: "string" }; },
    "Change kind or enumRef", "kind-change-misclassified", false, "changed_logical_type", 1, false, 1],
  ["widen decimal", (p) => { U(p).attributes.push({ ...D82 }); },
    (p) => { U(p).attributes.at(-1).type = { kind: "decimal", precision: 10, scale: 3 }; },
    "stay equal or grow", "decimal-widen-misclassified", true, "widened_decimal", 1, false, 1],
  ["shift decimal scale at equal precision", (p) => { U(p).attributes.push({ ...D82 }); },
    (p) => { U(p).attributes.at(-1).type = { kind: "decimal", precision: 8, scale: 3 }; },
    "Any loss of fractional or integer capacity", "decimal-shift-compatible", false, "narrowed_decimal", 1, false, 1],
  ["append enum value", null, (p) => { p.data_model.enums.user_status.values.push("archived"); },
    "entire old list as a prefix", "enum-append-misclassified", true, "appended_enum_values", 1, false, 1],
  ["reorder enum values", null, (p) => { p.data_model.enums.user_status.values.reverse(); },
    "reorder existing values", "enum-reorder-compatible", false, "changed_enum_values", 1, false, 1],
  ["add enum domain", null, (p) => { p.data_model.enums.region = { kind: "enum", values: ["eu", "us"] }; },
    "Add a domain", "domain-add-misclassified", true, "added_enum_domain", 1, false, 1],
  ["change primary key", (p) => { U(p).key = ["id", "organization_id"]; U(p).unique.push(["id"]); },
    (p) => { U(p).key = ["organization_id", "id"]; },
    "primary key membership or order", "key-change-misclassified", false, "changed_primary_key", 1, false, 1],
  ["add unique tuple", null, (p) => { U(p).unique.push(["display_name"]); },
    "can reject old rows", "unique-add-misclassified", false, "changed_unique_tuples", 1, false, 1],
  ["reorder unique tuples", (p) => { U(p).unique.push(["email"]); }, (p) => { U(p).unique.reverse(); },
    "outer list of unchanged unique tuples", "unique-reorder-misclassified", true, "reordered_unique_tuples", 1,
    true, 1],
  ["edge nullable addition", null, (p) => { M(p).attributes.push(nick(true)); },
    "existing entity or stored edge", "edge-add-misclassified", true, "added_nullable_attribute", 1, false, 1],
  ["reference added with its FK column", null, addManager, "Add or remove a reference on a surviving entity",
    "row-change-masks-reference", false, "added_reference", 3, false, 3],
  ["change enumRef", null, (p) => { U(p).attributes[5].type = { enumRef: "locale" }; },
    "Change kind or enumRef", "enumRef-change-ignored", false, "changed_logical_type", 1, false, 1],
  ["raise text minimum", null, (p) => { U(p).attributes[2].type = { kind: "text", minLength: 3 }; },
    "an absent minimum means 0", "min-length-ignored", false, "narrowed_text_bounds", 1, true, 1],
  ["grow precision at equal scale", (p) => { U(p).attributes.push({ ...D82 }); },
    (p) => { U(p).attributes.at(-1).type = { kind: "decimal", precision: 9, scale: 2 }; },
    "stay equal or grow", "equal-scale-not-widening", true, "widened_decimal", 1, false, 1],
  ["grow scale at equal integer capacity", (p) => { U(p).attributes.push({ ...D82 }); },
    (p) => { U(p).attributes.at(-1).type = { kind: "decimal", precision: 9, scale: 3 }; },
    "stay equal or grow", "equal-integer-capacity-not-widening", true, "widened_decimal", 1, false, 1],
  ["insert enum value before the tail", null, (p) => { p.data_model.enums.user_status.values.splice(1, 0, "x"); },
    "insert before the old tail", "insert-as-append", false, "changed_enum_values", 1, false, 1],
  ["reorder fields inside a unique tuple", null, (p) => { U(p).unique = [["email", "organization_id"]]; },
    "change its fields or their order", "unique-inner-order-ignored", false, "changed_unique_tuples", 1, false, 1],
  ["reference added on an existing column", null, addIdLink, "Add or remove a reference on a surviving entity",
    "reference-add-compatible", false, "added_reference", 2, false, 2],
  ["endpoint remap on a stored row", null,
    (p) => { M(p).endpoints.target = { fields: ["organization_id"], targetFields: ["id"] }; },
    "either endpoints mapping on a stored row", "endpoint-remap-compatible", false, "changed_endpoint_mapping", 1,
    false, 1],
  ["endpoint remap with a nullable addition", null,
    (p) => { M(p).endpoints.target = { fields: ["organization_id"], targetFields: ["id"] };
      U(p).attributes.push(nick(true)); },
    "either endpoints mapping on a stored row", "compound-masks-endpoint", false, "changed_endpoint_mapping", 2,
    false, 2],
  ["reorder unchanged references", addManager, (p) => { U(p).references.reverse(); },
    "outer list of unchanged references", "reference-reorder-breaking", true, "reordered_references", 1, true, 1],
  ["retarget a reference by renaming its relation", null,
    (p) => { p.relation_types["users.org"] = p.relation_types["users.organization_id"];
      delete p.relation_types["users.organization_id"]; U(p).references[0].relation = "users.org"; },
    "Change its relation", "reference-retarget-missed", false, "changed_reference", 3, false, 3],
  ["tighten a stored minimum", null, (p) => { M(p).cardinality.in.min = 1; },
    "Raise either minimum or lower either maximum", "cardinality-tighten-compatible", false,
    "narrowed_cardinality", 1, true, 1],
  ["widen a stored minimum", (p) => { M(p).cardinality.in = { min: 1, max: "many" }; },
    (p) => { M(p).cardinality.in = { min: 0, max: "many" }; },
    "Lower a minimum or raise a maximum", "cardinality-widen-breaking", true, "widened_cardinality", 1, false, 1],
  ["mixed widen and tighten", (p) => { M(p).cardinality.in = { min: 1, max: 10 }; },
    (p) => { M(p).cardinality.in = { min: 0, max: 5 }; },
    "including a mixed widen/tighten", "cardinality-mixed-compatible", false, "narrowed_cardinality", 1, false, 1],
  ["add a stored relation with no new constraint", null, (p) => addStored(p, 0),
    "no new constraint on existing rows", "plain-relation-add-breaking", true, "added_relation_type", 1, false, 1],
  ["add a stored relation that requires participation", null, (p) => addStored(p, 1),
    "requires participation", "constraining-relation-compatible", false, "added_constraining_relation", 1,
    false, 1],
  ["remove a stored relation", null, (p) => { delete p.relation_types.memberships; },
    "Remove or rename either", "relation-remove-compatible", false, "removed_relation_type", 1, true, 1],
  ["rename a stored relation", null,
    (p) => { p.relation_types.enrollments = p.relation_types.memberships; delete p.relation_types.memberships; },
    "Remove or rename either", "relation-rename-compatible", false, "removed_relation_type", 2, false, 2],
  ["add an entity with its full row", null,
    (p) => { p.node_types.teams = { attributes: [{ name: "id", type: { kind: "uuid" }, nullable: false }],
      key: ["id"] }; },
    "its full row", "entity-add-breaking", true, "added_node_type", 1, false, 1],
  ["change a registry label column", null, (p) => { p.registries.users.label_column = "email"; },
    "label_column", "registry-label-ignored", false, "changed_registry_binding", 1, false, 1],
  ["reorder registry aliases", (p) => { p.registries.users.alias_columns = ["email", "display_name"]; },
    (p) => { p.registries.users.alias_columns = ["display_name", "email"]; },
    "alias-list reorder preserves its lookup set", "registry-alias-reorder-breaking", true, "", 0, true, 0],
  ["add an unbound registry", null,
    (p) => { p.registries.extra = { source: "extra", node_type: "users", id_column: "id",
      label_column: "display_name" }; },
    "add an unbound registry", "unbound-registry-breaking", true, "added_registry", 1, false, 1],
  ["remove a registry with its node binding", null, (p) => { delete p.registries.users; delete U(p).registry; },
    "Remove/rename a registry", "registry-remove-compatible", false, "removed_registry", 2, false, 2],
  ["bump the version", null, (p) => { p.version = "2.0.1"; },
    "Bump the version on an otherwise equal model", "version-bump-breaking", true, "bumped_profile_version", 1,
    true, 1],
  ["change the profile id", null, (p) => { p.id = "other"; },
    "Change profile ID", "profile-id-ignored", false, "changed_profile_id", 1, false, 1],
  ["absent references against an empty list", null, (p) => { p.node_types.organizations.references = []; },
    "Absent ↔ accepted empty optional containers", "refs-empty-breaking", true, "", 0, true, 0],
  ["absent enums against an empty object", stripEnums, (p) => { p.data_model.enums = {}; },
    "Absent ↔ accepted empty optional containers", "enums-empty-breaking", true, "", 0, true, 0],
  ["absent unique against an empty list", null, (p) => { p.node_types.organizations.unique = []; },
    "Absent ↔ accepted empty optional containers", "unique-empty-breaking", true, "", 0, true, 0],
  ["absent alias list against an empty list", (p) => { delete p.registries.users.alias_columns; },
    (p) => { p.registries.users.alias_columns = []; },
    "Absent ↔ accepted empty optional containers", "alias-empty-breaking", true, "", 0, true, 0],
  ["equal effective text bounds", null, (p) => { U(p).attributes[2].type = { kind: "text", minLength: 0 }; },
    "equal effective bounds are non-breaking", "equal-bounds-breaking", true, "widened_text_bounds", 1, true, 1],
  ["switch a surviving relation from FK to stored", null, switchToStored,
    "Switching the storage mode", "storage-switch-compatible", false, "changed_endpoint_mapping", 5, false, 5],
  ["new entity with its required FK", null, (p) => { p.node_types.teams = { attributes: [uuid("id"), uuid("org_id")],
    key: ["id"], references: [{ fields: ["org_id"], relation: "teams.org_id", targetFields: ["id"] }] };
    p.relation_types["teams.org_id"] = { source: "teams", target: "organizations",
      cardinality: { out: { min: 1, max: 1 }, in: { min: 0, max: "many" } } }; },
    "Classify a newly added table as a whole", "new-table-fk-breaking", true, "added_relation_type", 2, false, 2],
  ["stored relation requiring existing sources", null,
    (p) => { addStored(p, 0); p.relation_types.user_devices.cardinality.out.min = 1; },
    "requires participation", "out-min-ignored", false, "added_constraining_relation", 1, false, 1],
  ["relax an FK column with its multiplicity", null,
    (p) => { U(p).attributes[1].nullable = true; p.relation_types["users.organization_id"].cardinality.out.min = 0; },
    "Lower a minimum or raise a maximum", "fk-cardinality-skipped", true, "widened_cardinality", 2, false, 2],
  ["retarget a reference local tuple", (p) => { U(p).attributes.push(uuid("alt_org_id")); },
    (p) => { U(p).references[0].fields = ["alt_org_id"]; },
    "local or target tuple/order", "reference-change-compatible", false, "changed_reference", 1, false, 1],
  ["remap the source endpoint", null,
    (p) => { M(p).endpoints.source = { fields: ["user_id"], targetFields: ["id"] }; },
    "either endpoints mapping on a stored row", "source-endpoint-ignored", false, "changed_endpoint_mapping", 1,
    false, 1],
  ["bound a many maximum", null, (p) => { M(p).cardinality.in = { min: 0, max: 5 }; },
    '"many" is unbounded', "many-as-bounded", false, "narrowed_cardinality", 1, true, 1],
  ["raise a bounded maximum", (p) => { M(p).cardinality.in = { min: 0, max: 5 }; },
    (p) => { M(p).cardinality.in = { min: 0, max: 10 }; },
    "raise a maximum with no bound tightening", "max-raise-breaking", true, "widened_cardinality", 1, false, 1],
  ["add a registry alias", null, (p) => { p.registries.users.alias_columns.push("display_name"); },
    "alias membership", "alias-membership-ignored", false, "changed_registry_binding", 1, false, 1],
  ["endpoint remap with a nullable addition on the same edge", (p) => { M(p).attributes.push(uuid("inviter_id")); },
    (p) => { M(p).endpoints.target = { fields: ["inviter_id"], targetFields: ["id"] };
      M(p).attributes.push(nick(true)); },
    "either endpoints mapping on a stored row", "same-edge-masks-endpoint", false, "changed_endpoint_mapping", 2,
    false, 2],
];
it.each(rows)("%s", (_label, pre, mut, _quote, _kills, compat, code, count, revCompat, revCount) => {
  const oldP = base(); if (pre) pre(oldP); const newP = base(); if (pre) pre(newP); mut(newP);
  const fwd = checkProfileCompatibility(parseOntologyProfile(oldP), parseOntologyProfile(newP));
  expect(fwd.ok).toBe(true); expect(fwd.compatible).toBe(compat); // kills: wrong §6 result for this change
  if (code) expect([...fwd.breaking, ...fwd.nonBreaking]).toContainEqual(expect.objectContaining({ code }));
  expect(fwd.breaking.length + fwd.nonBreaking.length).toBe(count); // kills: a spurious extra change
  const rev = checkProfileCompatibility(parseOntologyProfile(newP), parseOntologyProfile(oldP));
  expect(rev).toMatchObject({ ok: true, compatible: revCompat }); // kills: wrong §6 result in reverse
  expect(rev.breaking.length + rev.nonBreaking.length).toBe(revCount);
});
const refusals: Array<[string, Mut | null, Mut, string, string, string, string, string, boolean]> = [
  ["known addition with an unhandled delta", null,
    (p) => { U(p).attributes.push(nick(true));
      p.class_hierarchies = { tax: { relation_type: "sub", membership_relation_type: "inst",
        classes: { Root: { parent: null } } } }; },
    "known nullable addition and an unhandled delta", "compound-returns-compatible", "unclassified_data_model_delta",
    "class_hierarchies.tax", "class_hierarchies.tax", false],
  ["unhandled delta alone", null,
    (p) => { p.class_hierarchies = { tax: { relation_type: "sub", membership_relation_type: "inst",
      classes: { Root: { parent: null } } } }; },
    "unclassified typed or inherited residual delta", "unhandled-returns-compatible", "unclassified_data_model_delta",
    "class_hierarchies.tax", "class_hierarchies.tax", false],
  ["dropped header from a successor", null, (p) => { p.data_model = null; },
    "an invalid declaration", "header-drop-compatible", "invalid_profile_schema", "new.data_model",
    "old.data_model", true],
  ["unknown format in a successor", null, (p) => { p.data_model.format = "engram.data-model/2"; },
    "an unknown format", "format-change-compatible", "invalid_profile_schema", "new.data_model.format",
    "old.data_model.format", true],
  ["unsupported major in a successor", null, (p) => { p.version = "3"; },
    "an unsupported major", "major-change-compatible", "invalid_profile_schema", "new.version", "old.version",
    true],
  ["invalid declaration in a successor", null, (p) => { delete U(p).attributes[0].nullable; },
    "an invalid declaration", "invalid-decl-compatible", "invalid_profile_schema",
    "new.node_types.users.attributes[0].nullable", "old.node_types.users.attributes[0].nullable", true],
  ["two unhandled paths from two call sites", null,
    (p) => { U(p).linking = { preset: "gazetteer-exact" }; p.class_hierarchies = { tax: { relation_type: "sub",
      membership_relation_type: "inst", classes: { Root: { parent: null } } } }; },
    "for each unhandled path", "first-path-only", "unclassified_data_model_delta",
    "class_hierarchies.tax,node_types.users.linking", "class_hierarchies.tax,node_types.users.linking", false],
];
it.each(refusals)("%s", (_label, pre, mut, _quote, _kills, code, fwdPath, revPath, prefixed) => {
  const oldP = base(); if (pre) pre(oldP); const newP = base(); if (pre) pre(newP); mut(newP);
  for (const [a, b, path] of [[oldP, newP, fwdPath], [newP, oldP, revPath]] as const) {
    const r = checkProfileCompatibility(parseOntologyProfile(a), parseOntologyProfile(b));
    expect(r).toMatchObject({ ok: false, compatible: false, breaking: [], nonBreaking: [] });
    const issues = r.validationIssues.map((i) => `${i.severity} ${i.code} ${i.path}`);
    expect(issues).toEqual(path.split(",").map((q) => `error ${code} ${q}`));
    const self = (x: any) => checkProfileCompatibility(parseOntologyProfile(x), parseOntologyProfile(x));
    if (!prefixed) expect([r.oldDigest, r.newDigest]).toEqual([self(a).oldDigest, self(b).oldDigest]);
  }
});

it("Treat two untagged inputs with the existing compatibility API", () => { // kills: gate on legacy pairs
  const blocks = { source_types: ["Task"], target_types: ["Task"] };
  const v1 = (rel: object) => ({ metamodel_version: "engram.metamodel/v1", version: "1.0.0", id: "legacy",
    node_types: { Task: {} }, relation_types: { blocks, ...rel } });
  const depends = { ...blocks, cardinality: { out: { min: 1, max: "many" } } };
  expect(checkProfileCompatibility(v1({}) as any, v1({ depends }) as any))
    .toMatchObject({ ok: true, compatible: true, breaking: [] });
});
