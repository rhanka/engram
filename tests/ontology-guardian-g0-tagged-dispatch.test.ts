import { expect, it, vi } from "vitest";
import * as digests from "../src/ontology-guardian/digests.js";
import { buildOpenerpSuccessorV2, SUCCESSOR_V2_DIGESTS } from "../src/ontology-guardian/openerp-registry.js";
import { normalizeOntologyProfile, parseOntologyProfile, validateOntologyProfile } from "../src/ontology-profile.js";
import { bundleProfile, checkProfileCompatibility } from "../src/profile-bundle.js";
import example from "./fixtures/g0-openerp-users-model.json";

it("changes the profile digest when a member is appended to the tagged enum", () => {
  const extended = structuredClone(example);
  extended.data_model.enums.user_status.values.push("archived");
  const original = normalizeOntologyProfile(parseOntologyProfile(example));
  const withArchived = normalizeOntologyProfile(parseOntologyProfile(extended));
  expect(withArchived.profile_hash).not.toBe(original.profile_hash);
  for (const [input, normalized, bytes, digest] of [
    [example, original, 2531, "21684a38e6c3979937f53a286b275971f3ccda431c299078c0e8715a9240e50e"],
    [extended, withArchived, 2542, "8ea14fc66bbbe2ba3dc4fd9c82904618ecfab9e992c346a5fd948d6afb46babb"],
  ] as const) {
    expect(normalized.profile_hash).toBe(digest);
    expect(Buffer.byteLength(JSON.stringify(digests.stableForHash(normalized)))).toBe(bytes);
    const result = bundleProfile(JSON.stringify(input));
    expect(result).toMatchObject({ ok: true, bundle: { profileHash: digest, profile: { profile_hash: digest } } });
    expect(result.ok && result.bundle.extensions).toEqual({});
  }
});

it.each([
  [{ data_model: null }, "data_model"],
  [{ version: "1", data_model: null }, "data_model"],
  [{ data_model: { format: "engram.data-model/2" } }, "data_model.format"],
  [{ data_model: { format: example.data_model.format, extra: true } }, "data_model.extra"],
  [{ data_model: { format: example.data_model.format, enums: null } }, "data_model.enums"],
  [{ metamodel_version: "engram.metamodel/v1", engram_authored_document: {}, presentation_hash: "mixed" }, "metamodel_version"],
  ...[2, "1", "02", "2.0", "2.01.0", "2.0.01", "2.0.0-rc.1", "3", "20"].map((version) => [{ version }, "version"] as const),
] as const)("refuses tagged profile overrides %j", (overrides, path) => {
  const profile = parseOntologyProfile({ ...example, ...overrides });
  expect(validateOntologyProfile(profile)[0]?.split(" ")[0]).toBe(path);
  expect(() => normalizeOntologyProfile(profile)).toThrow(`  - ${path} `);
  using projection = path === "metamodel_version" ? vi.spyOn(digests, "stableForHash") : undefined;
  expect(bundleProfile(profile)).toMatchObject({ ok: false, errors: [{ path }] });
  if (projection) expect(projection).not.toHaveBeenCalledWith(expect.not.objectContaining({ presentation_hash: "mixed" }));
});

const enumFree: any = structuredClone(example);
for (const node of Object.values(enumFree.node_types) as any[]) node.attributes = node.attributes.filter((attribute: any) => !("enumRef" in attribute.type));
it.each([{}, { enums: undefined }])("accepts an exact major-2 triple and omits undefined enums (%#)", (enums) => {
  const data_model = { format: example.data_model.format, ...enums };
  const normalized = normalizeOntologyProfile(parseOntologyProfile({ ...enumFree, version: "2.0.0", data_model }));
  expect(normalized.data_model).toStrictEqual({ format: data_model.format });
  expect(normalized.data_model).not.toBe(data_model);
});

const untagged = { ...example, data_model: undefined };
// §6:404: "In a typed comparison, dropping the header from a successor, an unknown format, an unsupported
// major or an invalid declaration refuses at validation with `invalid_profile_schema`."
// Case 0 (a typed successor drops its header) refuses; case 1 (untagged legacy to its first tagged
// successor) stays breaking per §6:402.
it("refuses a typed successor that drops its data_model header", () => {
  expect(checkProfileCompatibility(parseOntologyProfile(example), parseOntologyProfile(untagged)))
    .toMatchObject({ ok: false, compatible: false, breaking: [], nonBreaking: [],
      validationIssues: [{ severity: "error", code: "invalid_profile_schema", path: "new.data_model" }] });
});
it.each([
  [untagged, example],
])("fails closed on data_model change %#", (before, after) => {
  expect(checkProfileCompatibility(parseOntologyProfile(before), parseOntologyProfile(after)))
    .toMatchObject({ ok: true, compatible: false, breaking: [{ code: "changed_modeled_field", path: "data_model" }] });
});

it("preserves the pinned digest of the untagged OpenERP successor at version 2", () => {
  const successor = buildOpenerpSuccessorV2();
  expect(normalizeOntologyProfile(successor).profile_hash).toBe(SUCCESSOR_V2_DIGESTS.contentDigest);
  expect(bundleProfile(successor)).toMatchObject({ ok: true, bundle: { profileHash: SUCCESSOR_V2_DIGESTS.contentDigest } });
});
