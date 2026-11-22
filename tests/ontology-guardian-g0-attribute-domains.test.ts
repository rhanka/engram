import { expect, it } from "vitest";
import { normalizeOntologyProfile, parseOntologyProfile, validateOntologyProfile } from "../src/ontology-profile.js";
import { bundleProfile } from "../src/profile-bundle.js";
import example from "./fixtures/g0-openerp-users-model.json";
const clone = (): any => structuredClone(example);
const A = "node_types.users.attributes", E = "data_model.enums", text = { name: "email", type: { kind: "text" }, nullable: false };
const at = (a: unknown) => (p: any) => { p.node_types.users.attributes[2] = a; };
const badTypes: Array<[string, unknown, string]> = [
  ["bool spelling", { kind: "bool" }, "kind"], ["geometry", { kind: "geometry" }, "kind"], ["array", { kind: "array", item: { kind: "text" } }, "kind"],
  ["negative bound", { kind: "text", minLength: -1 }, "minLength"], ["inverted bounds", { kind: "text", minLength: 5, maxLength: 2 }, "maxLength"],
  ["pattern on text", { kind: "text", pattern: "^a" }, "pattern"], ["extra boolean key", { kind: "boolean", minLength: 1 }, "minLength"],
  ["float string bound", { kind: "string", minLength: 1.5 }, "minLength"], ["inverted string bounds", { kind: "string", minLength: 5, maxLength: 2 }, "maxLength"],
  ["decimal scale above precision", { kind: "decimal", precision: 8, scale: 9 }, "scale"], ["decimal precision zero", { kind: "decimal", precision: 0, scale: 0 }, "precision"],
  ["decimal precision above max", { kind: "decimal", precision: 39, scale: 0 }, "precision"], ["decimal precision float", { kind: "decimal", precision: 8.5, scale: 0 }, "precision"],
  ["decimal scale negative", { kind: "decimal", precision: 8, scale: -1 }, "scale"], ["decimal scale float", { kind: "decimal", precision: 8, scale: 1.5 }, "scale"],
  ["dangling enum", { enumRef: "missing" }, "enumRef"], ["proto enum", { enumRef: "__proto__" }, "enumRef"], ["extra enumRef key", { enumRef: "locale", extra: 1 }, "enumRef"],
];
const badProfiles: Array<[string, (p: any) => void, string]> = [
  ...badTypes.map(([l, type, f]): [string, (p: any) => void, string] => [l, at({ ...text, type }), `${A}[2].type.${f}`]),
  ["missing nullable", at({ name: "email", type: { kind: "text" } }), `${A}[2].nullable`], ["default value", at({ ...text, default: null }), `${A}[2].default`],
  ["duplicate name", at({ ...text, name: "display_name" }), `${A}[3].name`], ["empty name", at({ ...text, name: "" }), `${A}[2].name`],
  ["empty attributes", (p) => { p.node_types.users.attributes = []; }, A], ["missing attributes", (p) => { delete p.node_types.users.attributes; }, A],
  ["empty enum domain", (p) => { p.data_model.enums.locale.values = []; }, `${E}.locale.values`], ["duplicate enum values", (p) => { p.data_model.enums.locale.values = ["en", "en"]; }, `${E}.locale.values`],
  ["empty-string enum value", (p) => { p.data_model.enums.locale.values = ["en", ""]; }, `${E}.locale.values`],
  ["extra enum key", (p) => { p.data_model.enums.locale = { kind: "enum", values: ["en", "fr"], extra: true }; }, `${E}.locale`],
  ["empty enum name", (p) => { p.data_model.enums[""] = { kind: "enum", values: ["a"] }; }, E],
];
it.each(badProfiles)("refuses %s", (_label, mutate, path) => {
  const p = clone();
  mutate(p);
  const parsed = parseOntologyProfile(p);
  expect(validateOntologyProfile(parsed)[0]?.split(" ")[0]).toBe(path);
  expect(() => normalizeOntologyProfile(parsed)).toThrow(`  - ${path} `);
  expect(bundleProfile(parsed)).toMatchObject({ ok: false, errors: [{ path }] });
});
it("accepts all 11 closed domains, boundary bounds, and preserves each kind", () => {
  const base = normalizeOntologyProfile(parseOntologyProfile(clone()));
  const swaps: Array<[number, unknown]> = [
    [0, { kind: "int" }], [1, { kind: "bigint" }], [2, { kind: "string", minLength: 1, maxLength: 64 }], [3, { kind: "decimal", precision: 10, scale: 2 }],
    [4, { kind: "decimal", precision: 1, scale: 0 }], [6, { kind: "boolean" }], [7, { kind: "json" }], [8, { kind: "date" }], [9, { kind: "decimal", precision: 38, scale: 38 }],
  ];
  const p = clone(); delete p.node_types.users.references; delete p.node_types.users.registry; p.relation_types = {}; p.registries = {};
  for (const [i, type] of swaps) p.node_types.users.attributes[i].type = type;
  p.node_types.users.attributes.push({ name: "empty_text", type: { kind: "text", minLength: 0, maxLength: 0 }, nullable: false });
  expect(validateOntologyProfile(parseOntologyProfile(p))).toEqual([]);
  const attrs = normalizeOntologyProfile(parseOntologyProfile(p)).node_types.users!.attributes!;
  for (const [i, type] of swaps) expect(attrs[i]!.type).toEqual(type);
  expect(attrs[11]!.type).toEqual({ kind: "text", minLength: 0, maxLength: 0 });
  const asStr = clone();
  asStr.node_types.users.attributes[2].type = { kind: "string" };
  expect(normalizeOntologyProfile(parseOntologyProfile(asStr)).profile_hash).not.toBe(base.profile_hash);
});
it("drops undefined bounds and detaches normalized attributes from the caller", () => {
  const p = clone();
  p.node_types.users.attributes[2] = { name: "email", type: { kind: "text", minLength: undefined }, nullable: false };
  const parsed = parseOntologyProfile(p);
  expect(validateOntologyProfile(parsed)).toEqual([]);
  const attrs = normalizeOntologyProfile(parsed).node_types.users!.attributes!;
  expect(attrs[2]!.type).toStrictEqual({ kind: "text" });
  expect(Object.hasOwn(attrs[2]!.type, "minLength")).toBe(false);
  (parsed.node_types as any).users.attributes[2].type = { kind: "text", minLength: 9 };
  (parsed.node_types as any).users.attributes.push({ name: "extra", type: { kind: "int" }, nullable: true });
  expect(attrs).toHaveLength(11);
  expect(attrs[2]!.type).toStrictEqual({ kind: "text" });
});
it.each<[unknown[]]>([[["a", "b"]], [[{ key: "x" }]]])("preserves opaque attributes verbatim on untagged legacy profiles (%j)", (attributes) => {
  const parsed = parseOntologyProfile({ id: "legacy", version: "1", node_types: { Foo: { attributes } } });
  expect(validateOntologyProfile(parsed)).toEqual([]);
  expect(normalizeOntologyProfile(parsed).node_types.Foo!.attributes).toStrictEqual(attributes);
  expect(bundleProfile(parsed)).toMatchObject({ ok: true, bundle: { profile: { node_types: { Foo: { attributes } } } } });
});
