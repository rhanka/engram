import { expect, it } from "vitest";
import { parseOntologyProfile } from "../src/ontology-profile.js";
import { checkProfileCompatibility } from "../src/profile-bundle.js";
import example from "./fixtures/g0-openerp-users-model.json";
const U = (p: any) => p.node_types.users, M = (p: any) => p.relation_types.memberships;
const nick = (nullable: boolean) => ({ name: "nick", type: { kind: "text" }, nullable });
const D82 = { name: "s", type: { kind: "decimal", precision: 8, scale: 2 }, nullable: false };
const addManager = (p: any) => {
  U(p).attributes.push({ name: "manager_id", type: { kind: "uuid" }, nullable: true });
  p.relation_types["users.manager_id"] = { source: "users", target: "users",
    cardinality: { out: { min: 0, max: 1 }, in: { min: 0, max: "many" } } };
  U(p).references.push({ fields: ["manager_id"], relation: "users.manager_id", targetFields: ["id"] });
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
const rows: Array<[string, Mut | null, Mut, string, string, boolean, string, boolean]> = [
  ["nullable addition", null, (p) => { U(p).attributes.push(nick(true)); },
    "existing relative order preserved", "nullable-add-breaking", true, "added_nullable_attribute", false],
  ["non-null addition", null, (p) => { U(p).attributes.push(nick(false)); },
    "Add any non-nullable field", "non-null-add-compatible", false, "added_non_nullable_attribute", false],
  ["relax nullability", null, (p) => { U(p).attributes[7].nullable = true; },
    "Relax nullable from false to true", "relax-misclassified", true, "relaxed_attribute_nullability", false],
  ["reorder surviving fields", null, (p) => { const a = U(p).attributes; [a[2], a[3]] = [a[3], a[2]]; },
    "reorder surviving fields", "reorder-misclassified", false, "reordered_row_attributes", false],
  ["narrow text bound", null, (p) => { U(p).attributes[2].type = { kind: "text", maxLength: 64 }; },
    "exclude any previously allowed length", "narrow-misclassified", false, "narrowed_text_bounds", true],
  ["change kind", null, (p) => { U(p).attributes[2].type = { kind: "string" }; },
    "Change kind or enumRef", "kind-change-misclassified", false, "changed_logical_type", false],
  ["widen decimal", (p) => { U(p).attributes.push({ ...D82 }); },
    (p) => { U(p).attributes.at(-1).type = { kind: "decimal", precision: 10, scale: 3 }; },
    "stay equal or grow", "decimal-widen-misclassified", true, "widened_decimal", false],
  ["shift decimal scale at equal precision", (p) => { U(p).attributes.push({ ...D82 }); },
    (p) => { U(p).attributes.at(-1).type = { kind: "decimal", precision: 8, scale: 3 }; },
    "Any loss of fractional or integer capacity", "decimal-shift-compatible", false, "narrowed_decimal", false],
  ["append enum value", null, (p) => { p.data_model.enums.user_status.values.push("archived"); },
    "entire old list as a prefix", "enum-append-misclassified", true, "appended_enum_values", false],
  ["reorder enum values", null, (p) => { p.data_model.enums.user_status.values.reverse(); },
    "reorder existing values", "enum-reorder-compatible", false, "changed_enum_values", false],
  ["add enum domain", null, (p) => { p.data_model.enums.region = { kind: "enum", values: ["eu", "us"] }; },
    "Add a domain", "domain-add-misclassified", true, "added_enum_domain", false],
  ["change primary key", (p) => { U(p).key = ["id", "organization_id"]; U(p).unique.push(["id"]); },
    (p) => { U(p).key = ["organization_id", "id"]; },
    "primary key membership or order", "key-change-misclassified", false, "changed_primary_key", false],
  ["add unique tuple", null, (p) => { U(p).unique.push(["display_name"]); },
    "can reject old rows", "unique-add-misclassified", false, "changed_unique_tuples", false],
  ["reorder unique tuples", (p) => { U(p).unique.push(["email"]); }, (p) => { U(p).unique.reverse(); },
    "outer list of unchanged unique tuples", "unique-reorder-misclassified", true, "reordered_unique_tuples", true],
  ["edge nullable addition", null, (p) => { M(p).attributes.push(nick(true)); },
    "existing entity or stored edge", "edge-add-misclassified", true, "added_nullable_attribute", false],
  ["reference added with its FK column", null, addManager, "Add or remove a reference on a surviving entity",
    "row-change-masks-reference", false, "added_nullable_attribute", false],
  ["change enumRef", null, (p) => { U(p).attributes[5].type = { enumRef: "locale" }; },
    "Change kind or enumRef", "enumRef-change-ignored", false, "changed_logical_type", false],
  ["raise text minimum", null, (p) => { U(p).attributes[2].type = { kind: "text", minLength: 3 }; },
    "an absent minimum means 0", "min-length-ignored", false, "narrowed_text_bounds", true],
  ["grow precision at equal scale", (p) => { U(p).attributes.push({ ...D82 }); },
    (p) => { U(p).attributes.at(-1).type = { kind: "decimal", precision: 9, scale: 2 }; },
    "stay equal or grow", "equal-scale-not-widening", true, "widened_decimal", false],
  ["grow scale at equal integer capacity", (p) => { U(p).attributes.push({ ...D82 }); },
    (p) => { U(p).attributes.at(-1).type = { kind: "decimal", precision: 9, scale: 3 }; },
    "stay equal or grow", "equal-integer-capacity-not-widening", true, "widened_decimal", false],
  ["insert enum value before the tail", null, (p) => { p.data_model.enums.user_status.values.splice(1, 0, "x"); },
    "insert before the old tail", "insert-as-append", false, "changed_enum_values", false],
  ["reorder fields inside a unique tuple", null, (p) => { U(p).unique = [["email", "organization_id"]]; },
    "change its fields or their order", "unique-inner-order-ignored", false, "changed_unique_tuples", false],
];
it.each(rows)("%s", (_label, pre, mut, _quote, _kills, compat, code, revCompat) => {
  const oldP = base(); if (pre) pre(oldP); const newP = base(); if (pre) pre(newP); mut(newP);
  const fwd = checkProfileCompatibility(parseOntologyProfile(oldP), parseOntologyProfile(newP));
  expect(fwd.ok).toBe(true); expect(fwd.compatible).toBe(compat); // kills: wrong §6 result for this change
  expect([...fwd.breaking, ...fwd.nonBreaking]).toContainEqual(expect.objectContaining({ code }));
  const rev = checkProfileCompatibility(parseOntologyProfile(newP), parseOntologyProfile(oldP));
  expect(rev).toMatchObject({ ok: true, compatible: revCompat }); // kills: wrong §6 result in reverse
});
