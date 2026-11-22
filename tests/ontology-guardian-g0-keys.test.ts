import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { canonicalBytes } from "../src/ontology-guardian/canonical.js";
import { normalizeOntologyProfile, parseOntologyProfile, validateOntologyProfile } from "../src/ontology-profile.js";
import { bundleProfile, type ModelRow, type Names } from "../src/profile-bundle.js";
import example from "./fixtures/g0-openerp-users-model.json";
const clone = (): any => structuredClone(example), sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const U = "node_types.users", O = "node_types.organizations", GOLDEN = "21684a38e6c3979937f53a286b275971f3ccda431c299078c0e8715a9240e50e";
const setK = (key: unknown) => (p: any) => { p.node_types.users.key = key; }, setU = (unique: unknown) => (p: any) => { p.node_types.users.unique = unique; };
const specPreimage = (node_types: unknown) => ({
  id: example.id, version: example.version, data_model: example.data_model, default_language: "en", node_types, registries: example.registries,
  relation_types: { "users.organization_id": { source_types: ["users"], target_types: ["organizations"], requires_evidence: false, assertion_basis: [], derivation_methods: [], cardinality: example.relation_types["users.organization_id"].cardinality } },
  citation_policy: { minimum_granularity: "page", require_source_file: true, allow_bbox: "when_available" },
  hardening: { statuses: ["candidate", "attached", "needs_review", "validated", "rejected", "superseded"], default_status: "candidate", promotion_requires: [], status_transitions: [] },
  inference_policy: { allow_inferred_relations: true, allowed_relation_types: [], require_evidence_refs: false }, evidence_policy: { require_evidence_refs: false, min_refs: 0, node_types: [], relation_types: [] }, hierarchies: {}, class_hierarchies: {},
  outputs: { ontology: { enabled: false, artifact_schema: "engram_ontology_outputs_v1", canonical_node_types: [], source_node_types: [], occurrence_node_types: [], alias_fields: [], relation_exports: [], wiki: { enabled: false, page_node_types: [], include_backlinks: false, include_source_snippets: false } } },
});
const badKeys: Array<[string, (p: any) => void, string]> = [
  ["unknown key", setK(["missing"]), `${U}.key[0]`], ["proto key", setK(["__proto__"]), `${U}.key[0]`], ["wrong-case key", setK(["ID"]), `${U}.key[0]`],
  ["empty-string key", setK([""]), `${U}.key[0]`], ["non-string key", setK([1]), `${U}.key[0]`], ["repeated key", setK(["id", "id"]), `${U}.key[1]`],
  ["nullable key", (p) => { setK(["password_hash"])(p); setU([["password_hash"]])(p); }, `${U}.key[0]`], ["nullable 2nd key", setK(["id", "last_login_at"]), `${U}.key[1]`],
  ["empty key", setK([]), `${U}.key`], ["non-array key", setK("id"), `${U}.key`], ["null key", setK(null), `${U}.key`],
  ["missing 2nd-node key", (p) => { delete p.node_types.organizations.key; }, `${O}.key`], ["non-array unique", setU({}), `${U}.unique`], ["null unique", setU(null), `${U}.unique`],
  ["non-array unique tuple", setU(["email"]), `${U}.unique[0]`], ["empty unique tuple", setU([[]]), `${U}.unique[0]`], ["unknown unique col", setU([["organization_id", "missing"]]), `${U}.unique[0][1]`],
  ["proto unique", setU([["__proto__"]]), `${U}.unique[0][0]`], ["repeated unique col", setU([["email", "email"]]), `${U}.unique[0][1]`], ["unique equals key", setU([["id"]]), `${U}.unique[0]`],
  ["unique equals composite key", (p) => { setK(["organization_id", "id"])(p); setU([["organization_id", "id"]])(p); }, `${U}.unique[0]`],
  ["duplicate unique", setU([["organization_id", "email"], ["organization_id", "email"]]), `${U}.unique[1]`],
];
it.each(badKeys)("refuses %s", (_label, mutate, path) => {
  const p = clone(); mutate(p); const parsed = parseOntologyProfile(p);
  expect(validateOntologyProfile(parsed).map((e) => e.split(" ")[0])).toStrictEqual([path]); // kills: skipped key/unique check or spurious error
  expect(() => normalizeOntologyProfile(parsed)).toThrow(`  - ${path} `); // kills: normalize bypassing validateModelKeys
  expect(bundleProfile(parsed)).toMatchObject({ ok: false, errors: [{ path }] }); // kills: bundleProfile swallowing key refusal
});
it("validates composite/nullable/delimiter tuples, preserves order in digest, and detaches arrays", () => {
  expect(sha256(canonicalBytes(specPreimage(example.node_types)))).toBe(GOLDEN); // kills: drift between independent spec preimage and golden vector
  const p = clone(), key: Names = ["organization_id", "id"], unique: Names[] = [["organization_id", "email"], ["email", "organization_id"], ["organization_id", "password_hash"], ["id"]];
  p.node_types.organizations.unique = []; p.node_types.users.key = [...key]; p.node_types.users.unique = unique.map((t) => [...t]);
  const expectedDigest = sha256(canonicalBytes(specPreimage(p.node_types))), parsed = parseOntologyProfile(p);
  expect(validateOntologyProfile(parsed)).toStrictEqual([]); // kills: rejecting nullable/reversed unique or explicit unique:[]
  const norm = normalizeOntologyProfile(parsed);
  expect(norm.profile_hash).toBe(expectedDigest); // kills: key/unique outer-or-inner order or empty-unique digest drift
  expect(bundleProfile(parsed)).toMatchObject({ ok: true, bundle: { profileHash: expectedDigest, profile: { node_types: { users: { key, unique }, organizations: { unique: [] } } } } }); // kills: bundleProfile key/unique projection mismatch
  (parsed.node_types as any).users.key.push("x"); (parsed.node_types as any).users.unique[0].push("x"); (parsed.node_types as any).users.unique.push(["display_name"]);
  expect((norm.node_types.users! as ModelRow).key).toStrictEqual(key); // kills: aliasing or reordering key
  expect((norm.node_types.users! as ModelRow).unique).toStrictEqual(unique); // kills: aliasing or reordering outer/inner unique
  expect(norm.node_types.organizations!.unique).toStrictEqual([]); // kills: dropping explicit empty unique
  const d = clone(); d.node_types.organizations.attributes.push(...["a", "c", "a,b", "b,c", "a|b", "b|c"].map((name) => ({ name, type: { kind: "text" }, nullable: false })));
  d.node_types.organizations.unique = [["a,b", "c"], ["a", "b,c"], ["a|b", "c"], ["a", "b|c"]];
  expect(validateOntologyProfile(parseOntologyProfile(d))).toStrictEqual([]); // kills: comma/pipe-joined tuple id collision
});
it("omits undefined unique on tagged nodes and leaves untagged legacy key/unique verbatim", () => {
  const p = clone(); p.node_types.organizations.unique = undefined; const norm = normalizeOntologyProfile(parseOntologyProfile(p));
  expect(Object.hasOwn(norm.node_types.organizations!, "unique")).toBe(false); // kills: retaining own unique:undefined
  expect(norm.profile_hash).toBe(GOLDEN); // kills: unique:undefined altering golden digest
  expect(() => canonicalBytes(norm)).not.toThrow(); // kills: unserializable undefined in normalized node
  const legacy = parseOntologyProfile({ id: "legacy", version: "1", node_types: { Foo: { attributes: ["a"], key: "opaque", unique: { k: 1 } } } });
  expect(validateOntologyProfile(legacy)).toStrictEqual([]); // kills: running key checks on untagged profile
  expect(normalizeOntologyProfile(legacy).node_types.Foo).toStrictEqual({ attributes: ["a"], key: "opaque", unique: { k: 1 } }); // kills: normalizing key/unique without hasDataModel
  expect(bundleProfile(legacy)).toMatchObject({ ok: true, bundle: { profile: { node_types: { Foo: { key: "opaque", unique: { k: 1 } } } } } }); // kills: bundleProfile rejecting opaque legacy key/unique
});
