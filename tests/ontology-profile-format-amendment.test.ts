import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";
import type { Sha256Digest } from "../src/metamodel-contracts.js";
import {
  APP_CONTEXT_PINNED_CONTENT_DIGEST,
  verifyRegisteredAppContextProfile,
} from "../src/ontology-guardian/app-context-registry.js";
import {
  bindOntologyProfile,
  getAuthoredOntologyProfile,
  hashOntologyPresentation,
  hashOntologyProfile,
  normalizeOntologyProfile,
  parseOntologyProfile,
  validateOntologyProfile,
} from "../src/ontology-profile.js";
import { bundleProfile, checkProfileCompatibility, type ProfileBundleV1 } from "../src/profile-bundle.js";
import type {
  NormalizedOntologyProfile,
  NormalizedProjectConfig,
  OntologyProfile,
  OntologyRelationCardinality,
} from "../src/types.js";

function profile(cardinality?: OntologyRelationCardinality) {
  return {
    metamodel_version: "engram.metamodel/v1" as const,
    version: "1.0.0",
    id: "digest-example",
    node_types: { Task: {} },
    relation_types: {
      blocks: {
        target_types: ["Task"],
        source_types: ["Task"],
        ...(cardinality === undefined ? {} : { cardinality }),
      },
    },
  };
}

function sha256(bytes: string): Sha256Digest {
  return `sha256:${createHash("sha256").update(bytes, "utf8").digest("hex")}`;
}

function asProfileInput(runtime: NormalizedOntologyProfile): OntologyProfile {
  return runtime as unknown as OntologyProfile;
}

describe("metamodel v1 profile format", () => {
  it("a metamodel v1 profile hashes to a Sha256Digest over RFC 8785 bytes with no injected default, and a cardinality change moves the hash", () => {
    const authored = {
      ...profile({ out: { min: 0, max: "many" } }),
      domain_policies: { example: { "2": "é", "10": 1e-7 } },
      sourcePath: "/local/profile.yaml",
      profile_hash: "supplied-hash",
    };
    // Independent JCS vector. Numeric property names also sort by UTF-16 code unit.
    const expected = sha256(
      '{"domain_policies":{"example":{"10":1e-7,"2":"é"}},"id":"digest-example",' +
      '"metamodel_version":"engram.metamodel/v1","node_types":{"Task":{}},"relation_types":' +
      '{"blocks":{"cardinality":{"out":{"max":"many","min":0}},"source_types":["Task"],' +
      '"target_types":["Task"]}},"version":"1.0.0"}',
    );
    const normalized = normalizeOntologyProfile(authored);
    expect(hashOntologyProfile(authored)).toBe(expected);
    expect(normalized.profile_hash).toBe(expected);
    expect(hashOntologyProfile(normalized)).toBe(expected);
    expect(bindOntologyProfile(normalized, {} as NormalizedProjectConfig).profile_hash).toBe(expected);
    expect(normalized.relation_types.blocks?.cardinality).toEqual({ out: { min: 0, max: "many" } });
    expect(normalized.default_language).toBe("en");
    expect(hashOntologyProfile({ ...authored, default_language: "en" })).not.toBe(expected);
    expect(hashOntologyProfile({ ...authored, citation_policy: {}, hardening: {} })).not.toBe(expected);
    expect(hashOntologyProfile({
      ...authored,
      relation_types: profile({ out: { min: 0, max: 1 } }).relation_types,
    })).not.toBe(expected);
    const bundled = bundleProfile(authored);
    expect(bundled).toMatchObject({ ok: true, bundle: { profileHash: expected.slice("sha256:".length) } });
    expect(bundleProfile(asProfileInput(normalized))).toEqual(bundled);
    expect(bundleProfile(asProfileInput(bindOntologyProfile(normalized, {} as NormalizedProjectConfig)))).toEqual(bundled);
  });

  it.each([NaN, Infinity, "\ud800"])("refuses invalid authored JCS input %j", (value) => {
    expect(() => hashOntologyProfile({ ...profile(), default_language: value as string })).toThrow();
  });

  it.each(["in", "out"] as const)("changes the semantic digest when the %s bound moves", (direction) => {
    const before = normalizeOntologyProfile(profile({ [direction]: { min: 0, max: "many" } }));
    const after = normalizeOntologyProfile(profile({ [direction]: { min: 0, max: 1 } }));
    expect(before.profile_hash).not.toBe(after.profile_hash);
  });

  it.each([
    { min: -1, max: "many" as const },
    { min: 2, max: 1 },
    { min: 0.5, max: 2 },
    { min: 0, max: 1.5 },
    { min: 0, max: "unbounded" },
    null,
  ])("refuses an invalid cardinality bound %j", (bound) => {
    const authored = profile({ in: bound as OntologyRelationCardinality["in"] });
    expect(validateOntologyProfile(authored)).toEqual([
      expect.stringContaining("MM_REL_INVALID_CARDINALITY"),
    ]);
    expect(bundleProfile(authored)).toMatchObject({
      ok: false,
      refusalCode: "invalid_profile_schema",
      errors: [{ code: "MM_REL_INVALID_CARDINALITY", path: "relation_types.blocks.cardinality.in" }],
    });
  });

  it.each([null, { extra: { min: 0, max: 1 } }])("refuses invalid root cardinality %j", (cardinality) => {
    const authored = profile(cardinality as OntologyRelationCardinality);
    expect(bundleProfile(authored)).toMatchObject({
      ok: false,
      errors: [{ code: "MM_REL_INVALID_CARDINALITY", path: "relation_types.blocks.cardinality" }],
    });
  });

  it("preserves the full cardinality issue path for a relation id containing whitespace", () => {
    const invalid = profile({ in: { min: -1, max: 1 } });
    const authored = { ...invalid, relation_types: { "blocks task": invalid.relation_types.blocks } };
    expect(bundleProfile(authored)).toMatchObject({
      ok: false,
      errors: [{ code: "MM_REL_INVALID_CARDINALITY", path: "relation_types.blocks task.cardinality.in" }],
    });
  });

  it("rejects a non-plain presentation object during validation", () => {
    const presentation = new Date() as unknown as OntologyProfile["presentation"];
    expect(validateOntologyProfile({ ...profile(), presentation })).toEqual(["presentation must be an object"]);
    expect(validateOntologyProfile({ ...profile(), presentation: Object.create(null) })).toEqual([]);
  });

  it("a visual_encoding change leaves profile_hash byte-identical and moves presentation_hash", () => {
    const before = profile();
    const after = {
      ...before,
      node_types: {
        Task: { visual_encoding: { shape: "diamond", fill: "hollow", border: "bold", color_hex: "#123456" } } as const,
      },
    };
    const oldProfile = normalizeOntologyProfile(before);
    const newProfile = normalizeOntologyProfile(after);
    expect(newProfile.profile_hash).toBe(oldProfile.profile_hash);
    const expected = sha256(
      '{"node_visual_encoding":{"Task":{"border":"bold","color_hex":"#123456",' +
      '"fill":"hollow","shape":"diamond"}},"presentation":null}',
    );
    expect(hashOntologyPresentation(newProfile)).toBe(expected);
    expect(newProfile.presentation_hash).toBe(expected);
    expect(oldProfile.presentation_hash).not.toBe(expected);
    const oldBundle = bundleProfile(before);
    const newBundle = bundleProfile(after);
    expect(newBundle).toMatchObject({ ok: true, bundle: { presentationHash: expected.slice("sha256:".length) } });
    if (!oldBundle.ok || !newBundle.ok) throw new Error("Expected valid profile bundles");
    const compatibility = checkProfileCompatibility(oldBundle.bundle, JSON.parse(JSON.stringify(newBundle.bundle)));
    expect(compatibility).toMatchObject({ ok: true, compatible: true, breaking: [] });
    expect(compatibility.nonBreaking).toContainEqual(expect.objectContaining({ code: "changed_node_visual_encoding" }));
  });

  it("separates authored top-level presentation from semantic identity", () => {
    const before = profile();
    const after = { ...before, presentation: { layout: "tree" }, presentation_hash: sha256("supplied-hash") };
    const normalized = normalizeOntologyProfile(after);
    expect(hashOntologyProfile(after)).toBe(hashOntologyProfile(before));
    expect(normalized.presentation_hash).toBe(sha256('{"node_visual_encoding":{"Task":null},"presentation":{"layout":"tree"}}'));
    expect(checkProfileCompatibility(before, after).compatible).toBe(true);
  });

  it("seals the same presentation digest when layout hints use runtime metadata names", () => {
    const authored = {
      ...profile(),
      presentation: {
        layout: "grid",
        sourcePath: "diagram-hint",
        hints: [{ bound_source_path: "anchor", profile_hash: "label", linking: { normalize: { fn: "style" } } }],
      },
    };
    const normalized = normalizeOntologyProfile(authored);
    const expected = sha256(
      '{"node_visual_encoding":{"Task":null},"presentation":{"hints":[{"bound_source_path":"anchor",' +
      '"linking":{"normalize":{"fn":"style"}},"profile_hash":"label"}],"layout":"grid","sourcePath":"diagram-hint"}}',
    );
    expect(normalized.presentation_hash).toBe(expected);
    expect(bundleProfile(authored)).toMatchObject({
      ok: true,
      bundle: { presentationHash: expected.slice("sha256:".length) },
    });
  });

  it("omits undefined optional styling fields in object inputs", () => {
    const authored = {
      ...profile(),
      node_types: { Task: { visual_encoding: { shape: "dot", fill: undefined } } } as const,
    };
    const normalized = normalizeOntologyProfile(authored);
    expect(normalized.presentation_hash).toBe(sha256('{"node_visual_encoding":{"Task":{"shape":"dot"}},"presentation":null}'));
  });

  it.each([undefined, "0".repeat(64)])("rejects a v1 bundle whose presentationHash becomes %j", (digest) => {
    const result = bundleProfile(profile());
    if (!result.ok) throw new Error("Expected a valid profile bundle");
    const { presentationHash: _original, ...serialized } = JSON.parse(JSON.stringify(result.bundle)) as ProfileBundleV1;
    const tampered = digest === undefined ? serialized : { ...serialized, presentationHash: digest };
    expect(checkProfileCompatibility(tampered, result.bundle)).toMatchObject({
      ok: false,
      compatible: false,
      validationIssues: [{ path: "old.digest" }],
    });
  });

  it("rejects a legacy bundle with a mismatched embedded profile_hash", () => {
    const { metamodel_version: _v1, ...legacy } = profile();
    const result = bundleProfile(legacy);
    if (!result.ok) throw new Error("Expected a valid legacy profile bundle");
    const tampered = {
      ...result.bundle,
      profile: { ...result.bundle.profile, profile_hash: "0".repeat(64) },
    };
    expect(checkProfileCompatibility(tampered, result.bundle)).toMatchObject({
      ok: false,
      compatible: false,
      validationIssues: [{ path: "old.digest" }],
    });
  });

  it("keeps the authored digest when the runtime profile is spread without profile_hash", () => {
    const normalized = normalizeOntologyProfile(profile());
    const { profile_hash: digest, ...detached } = normalized;
    expect(hashOntologyProfile(detached)).toBe(digest);
  });

  it("verifies a detached runtime profile with a local normalizer and an explicit source path", () => {
    const authored = {
      ...profile(),
      node_types: { Task: { linking: { normalize: { fn: "./zone-normalize.mjs#normalizeZoneCode" } } } },
    };
    const sourcePath = fileURLToPath(new URL("./fixtures/normalizers/profile.yaml", import.meta.url));
    const normalized = normalizeOntologyProfile(authored, sourcePath);
    expect(hashOntologyProfile(JSON.parse(JSON.stringify(normalized)))).toBe(normalized.profile_hash);
  });

  it.each([["JSON", JSON.stringify], ["YAML", stringifyYaml]] as const)(
    "rejects runtime authored provenance in raw %s profile text",
    (_format, serialize) => {
      const authored = { ...profile(), domain_policies: { example: { enabled: true } } };
      const raw = serialize(normalizeOntologyProfile(authored));
      expect(() => parseOntologyProfile(raw)).toThrow(/engram_authored_document/);
      expect(bundleProfile(raw)).toMatchObject({ ok: false, refusalCode: "invalid_profile_syntax" });
    },
  );

  it("reports unverified authored provenance as a profile validation error", () => {
    const authored = profile();
    const unverified = { ...authored, engram_authored_document: authored };
    expect(validateOntologyProfile(unverified)).toContainEqual(expect.stringContaining("engram_authored_document"));
  });

  it("preserves authored semantics when hashing, binding, and bundling a serialized runtime profile", () => {
    const authored = {
      ...profile(),
      domain_policies: { example: { enabled: true } },
      registries: {
        tasks: { source: "tasks", id_column: "id", label_column: "name", node_type: "Task" },
      },
    };
    const result = bundleProfile(authored);
    if (!result.ok) throw new Error("Expected a valid profile bundle");
    const { profile: detached } = JSON.parse(JSON.stringify(result.bundle)) as ProfileBundleV1;
    const hash = hashOntologyProfile(authored);
    const cfg = { inputs: { registrySources: { tasks: "/local/tasks.csv" } } } as unknown as NormalizedProjectConfig;
    expect.soft(validateOntologyProfile(asProfileInput(detached))).toEqual([]);
    expect.soft(hashOntologyProfile(detached)).toBe(hash);
    const bound = bindOntologyProfile(detached, cfg);
    expect.soft(bound.registries.tasks?.bound_source_path).toBe("/local/tasks.csv");
    expect.soft(bound.profile_hash).toBe(hash);
    expect.soft(bundleProfile(asProfileInput(detached))).toEqual(result);
    expect(bundleProfile(asProfileInput(bound))).toEqual(result);
  });

  it("refuses a detached runtime profile whose declarations conflict with its authored document", () => {
    const normalized = normalizeOntologyProfile(profile());
    const tampered = { ...normalized, default_language: "fr" };
    expect.soft(() => hashOntologyProfile(tampered)).toThrow(/authored document/);
    expect(bundleProfile(asProfileInput(tampered))).toMatchObject({ ok: false, refusalCode: "invalid_profile_schema" });
  });

  it("freezes normalized v1 declarations without freezing the authored input", () => {
    const authored = profile({ out: { min: 0, max: 1 } });
    const normalized = normalizeOntologyProfile(authored);
    const bound = bindOntologyProfile(normalized, {} as NormalizedProjectConfig);
    const changeCardinality = (candidate: typeof normalized) => {
      Object.assign(candidate.relation_types.blocks!.cardinality!.out!, { max: 2 });
    };
    expect.soft(() => changeCardinality(normalized)).toThrow(TypeError);
    expect.soft(() => changeCardinality(bound)).toThrow(TypeError);
    Object.assign(authored.relation_types.blocks.cardinality!.out!, { max: 3 });
    expect(normalized.relation_types.blocks?.cardinality?.out?.max).toBe(1);
  });

  it("returns an authored copy whose mutation cannot change future bundles", () => {
    const authored = profile();
    const normalized = normalizeOntologyProfile(authored);
    const copy = getAuthoredOntologyProfile(asProfileInput(normalized));
    copy.version = "9.9.9";
    expect(bundleProfile(asProfileInput(normalized))).toEqual(bundleProfile(authored));
  });

  it("a narrowed relation cardinality is breaking and a widened one is not", () => {
    const wide = profile({ out: { min: 0, max: "many" } });
    const narrow = profile({ out: { min: 0, max: 1 } });
    expect.soft(checkProfileCompatibility(wide, narrow)).toMatchObject({ ok: true, compatible: false });
    expect(checkProfileCompatibility(narrow, wide)).toMatchObject({ ok: true, compatible: true });
  });

  it.each([
    [{ min: 0, max: "many" as const }, { min: 0, max: 1 }],
    [{ min: 0, max: 2 }, { min: 1, max: 2 }],
    [undefined, { min: 1, max: "many" as const }],
    [{ min: 0, max: 2 }, { min: 1, max: "many" as const }],
  ])("flags a narrowed relation cardinality as breaking (%j to %j)", (wide, narrow) => {
    const before = profile(wide === undefined ? undefined : { out: wide });
    const after = profile({ out: narrow });
    const narrowed = checkProfileCompatibility(before, after);
    expect(narrowed.compatible).toBe(false);
    expect(narrowed.breaking).toContainEqual(expect.objectContaining({
      code: "narrowed_relation_cardinality", path: "relation_types.blocks.cardinality.out",
    }));
  });

  it.each([
    [{ min: 0, max: 1 }, { min: 0, max: "many" as const }],
    [{ min: 1, max: 2 }, { min: 0, max: 2 }],
    [{ min: 1, max: "many" as const }, undefined],
  ])("flags a widened relation cardinality as compatible (%j to %j)", (narrow, wide) => {
    const before = profile({ in: narrow });
    const after = profile(wide === undefined ? undefined : { in: wide });
    const widened = checkProfileCompatibility(before, after);
    expect(widened).toMatchObject({ ok: true, compatible: true, breaking: [] });
    expect(widened.nonBreaking).toContainEqual(expect.objectContaining({
      code: "widened_relation_cardinality", path: "relation_types.blocks.cardinality.in",
    }));
  });

  it("app-context@1 still verifies its pinned content digest", () => {
    const raw = readFileSync(new URL("../profiles/app-context/v1/profile.yaml", import.meta.url), "utf8");
    expect(verifyRegisteredAppContextProfile(raw).contentDigest).toBe(APP_CONTEXT_PINNED_CONTENT_DIGEST);
  });
});
