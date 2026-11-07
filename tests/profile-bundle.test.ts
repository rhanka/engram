import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalBytes, sha256Hex } from "../src/ontology-guardian/canonical.js";
import { normalizeOntologyProfile, parseOntologyProfile } from "../src/ontology-profile.js";
import type { OntologyProfile, RegistryRecord } from "../src/types.js";
import { JSON_PROJECTION_VERSION, toJsonValue } from "../src/json-value.js";
import {
  PROFILE_BUNDLE_SCHEMA_V1,
  type ProfileBundleV1,
  bundleProfile,
  checkProfileCompatibility,
  computeRegistryRecordsDigest,
} from "../src/profile-bundle.js";

const BASE_YAML = `id: synthetic-profile
version: 2
default_language: fr
label_version: "1.0"
node_types:
  Alpha:
    id_prefix: "alpha:"
    definition: Alpha entity
    aliases: [alpha_alias]
    registry: reg_alpha
    source_backed: true
    status_policy: candidate
    properties:
      score: { type: number, description: Score }
      created_on: { type: string, format: date, description: Date }
  Beta:
    id_prefix: "beta:"
    definition: Beta entity
    aliases: [beta_alias]
    properties:
      title: { type: string, description: Title }
relation_types:
  links_to:
    source: [Alpha]
    target: [Alpha, Beta]
    requires_evidence: false
    assertion_basis: [explicit]
    derivation_methods: [extracted]
    description: Links Alpha
  unreferenced_rel:
    source: [Alpha]
    target: [Beta]
    requires_evidence: false
    description: Unreferenced
synonym_relations:
  legacy_link: links_to
registries:
  reg_alpha:
    source: alpha_src
    id_column: id
    label_column: label
    alias_columns: [slug]
    node_type: Alpha
citation_policy:
  minimum_granularity: file
  require_source_file: true
  allow_bbox: when_available
evidence_policy:
  require_evidence_refs: true
  min_refs: 1
  node_types: [Alpha]
  relation_types: [links_to]
inference_policy:
  allow_inferred_relations: true
  allowed_relation_types: [links_to]
  require_evidence_refs: false
hardening:
  statuses: [candidate, validated, rejected]
  default_status: candidate
  promotion_requires: [citation]
  status_transitions:
    - { from: [candidate], to: [validated, rejected] }
stage_enum:
  pipeline: [step_a, step_b]
  instruments: [inst_a]
  fallback: unknown_stage
  outcome_values: { accepted: [ok], refused: [no] }
hint_block:
  field_x:
    applies_to: [Alpha]
    description: Hint X
    format: string
    extraction_patterns: [pat1]
    anti_invention: Never invent
    examples: [ex1]
outputs:
  ontology:
    enabled: true
    canonical_node_types: [Alpha]
    source_node_types: [Beta]
    relation_exports: [links_to]
    wiki:
      enabled: false
      page_node_types: [Alpha]
      include_backlinks: false
      include_source_snippets: false`;

const T9_GOLDEN_PROFILE_HASH = "d1530523c2206a2db782d8244b12c5f337a1bb92e2cedd64937f5545d5935106";

const rec = (id: string, label = `L-${id}`, extra: Partial<RegistryRecord> = {}): RegistryRecord => ({
  registryId: "reg_alpha", id, label, aliases: [id.toLowerCase()], nodeType: "Alpha",
  sourceFile: `/abs/path/${id}.csv`, raw: { id, label }, ...extra,
});

describe("F-EN2 profile bundle & shared JSON projection", () => {
  it("F-EN2-T1: digest invariance across key order, comments, blank lines, flow style, and record order", () => {
    const reordered = `# comment\n\noutputs:\n  ontology: { wiki: { include_source_snippets: false, include_backlinks: false, page_node_types: [Alpha], enabled: false }, relation_exports: [links_to], source_node_types: [Beta], canonical_node_types: [Alpha], enabled: true }\n\nhint_block: { field_x: { examples: [ex1], anti_invention: Never invent, extraction_patterns: [pat1], format: string, description: Hint X, applies_to: [Alpha] } }\n\nstage_enum: { outcome_values: { refused: [no], accepted: [ok] }, fallback: unknown_stage, instruments: [inst_a], pipeline: [step_a, step_b] }\n\nhardening: { status_transitions: [{ to: [validated, rejected], from: [candidate] }], promotion_requires: [citation], default_status: candidate, statuses: [candidate, validated, rejected] }\n\ninference_policy: { require_evidence_refs: false, allowed_relation_types: [links_to], allow_inferred_relations: true }\n\nevidence_policy: { relation_types: [links_to], node_types: [Alpha], min_refs: 1, require_evidence_refs: true }\n\ncitation_policy: { allow_bbox: when_available, require_source_file: true, minimum_granularity: file }\n\nregistries: { reg_alpha: { node_type: Alpha, alias_columns: [slug], label_column: label, id_column: id, source: alpha_src } }\n\nsynonym_relations: { legacy_link: links_to }\n\nrelation_types:\n  unreferenced_rel: { description: Unreferenced, requires_evidence: false, target: [Beta], source: [Alpha] }\n  links_to: { description: Links Alpha, derivation_methods: [extracted], assertion_basis: [explicit], requires_evidence: false, target: [Alpha, Beta], source: [Alpha] }\n\nnode_types:\n  Beta: { properties: { title: { description: Title, type: string } }, aliases: [beta_alias], definition: Beta entity, id_prefix: "beta:" }\n  Alpha: { properties: { created_on: { description: Date, format: date, type: string }, score: { description: Score, type: number } }, status_policy: candidate, source_backed: true, registry: reg_alpha, aliases: [alpha_alias], definition: Alpha entity, id_prefix: "alpha:" }\n\nlabel_version: "1.0"\n\ndefault_language: fr\nversion: 2\nid: synthetic-profile\n`;
    const b1 = bundleProfile(BASE_YAML, { reg_alpha: [rec("1"), rec("2")] });
    const b2 = bundleProfile(reordered, { reg_alpha: [rec("2"), rec("1")] });
    expect(b1.ok).toBe(true);
    expect(b2.ok).toBe(true);
    if (!b1.ok || !b2.ok) return;
    expect(b1.bundle.digest).toBe(b2.bundle.digest);
  });

  it("F-EN2-T2: digest sensitivity and sourceFile independence", () => {
    const base = bundleProfile(BASE_YAML, { reg_alpha: [rec("1", "One", { sourceFile: "/machine/a.csv" })] });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const sameDiffSource = bundleProfile(BASE_YAML, { reg_alpha: [rec("1", "One", { sourceFile: "/other/b.csv" })] });
    expect(sameDiffSource.ok).toBe(true);
    if (!sameDiffSource.ok) return;
    expect(sameDiffSource.bundle.digest).toBe(base.bundle.digest);
    expect(sameDiffSource.bundle.registries.reg_alpha?.recordsDigest).toBe(base.bundle.registries.reg_alpha?.recordsDigest);
    for (const mut of [
      BASE_YAML.replace("type: number", "type: integer"),
      BASE_YAML.replace("alpha_alias", "alpha_alias_2"),
      BASE_YAML.replace("fallback: unknown_stage", "fallback: other"),
      BASE_YAML.replace("version: 2", 'version: "2"'),
    ]) {
      const res = bundleProfile(mut, { reg_alpha: [rec("1", "One")] });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.bundle.digest).not.toBe(base.bundle.digest);
    }
    const recLabelMut = bundleProfile(BASE_YAML, { reg_alpha: [rec("1", "Changed")] });
    expect(recLabelMut.ok).toBe(true);
    if (recLabelMut.ok) expect(recLabelMut.bundle.digest).not.toBe(base.bundle.digest);
  });

  it("F-EN2-T3: removed node type is breaking and annotated when covered by alias", () => {
    const withGamma = BASE_YAML.replace("node_types:", "node_types:\n  Gamma:\n    id_prefix: 'gamma:'\n    definition: Gamma");
    const r1 = checkProfileCompatibility(withGamma, BASE_YAML);
    expect(r1.ok).toBe(true);
    expect(r1.compatible).toBe(false);
    expect(r1.breaking.find((b) => b.code === "removed_node_type" && b.subject === "Gamma")).toBeTruthy();
    const withAlias = BASE_YAML.replace("aliases: [beta_alias]", "aliases: [beta_alias, gamma]");
    const r2 = checkProfileCompatibility(withGamma, withAlias);
    expect(r2.breaking.find((b) => b.code === "removed_node_type")?.annotations).toEqual(["covered_by_alias"]);
  });

  it("F-EN2-T4: relation compatibility rules on real fields", () => {
    const noUnref = BASE_YAML.replace(/  unreferenced_rel:[\s\S]*?description: Unreferenced\n/, "");
    expect(checkProfileCompatibility(BASE_YAML, noUnref).breaking.map((b) => b.code)).toContain("removed_relation_type");
    const renamed = BASE_YAML.replace("  unreferenced_rel:", "  renamed_rel:").replace("legacy_link: links_to", "legacy_link: links_to\n  unreferenced_rel: renamed_rel");
    const rSyn = checkProfileCompatibility(BASE_YAML, renamed);
    expect(rSyn.compatible).toBe(false);
    expect(rSyn.breaking.find((b) => b.code === "removed_relation_type")?.annotations).toEqual(["covered_by_synonym"]);
    expect(rSyn.nonBreaking.map((n) => n.code)).toContain("added_relation_type");
    expect(checkProfileCompatibility(BASE_YAML, BASE_YAML.replace("target: [Alpha, Beta]", "target: [Alpha]")).breaking.map((b) => b.code)).toContain("narrowed_relation_target");
    expect(checkProfileCompatibility(BASE_YAML, BASE_YAML.replace("requires_evidence: false", "requires_evidence: true")).breaking.map((b) => b.code)).toContain("tightened_relation_requires_evidence");
  });

  it("F-EN2-T5: property and id_prefix rules on real descriptor fields", () => {
    expect(checkProfileCompatibility(BASE_YAML, BASE_YAML.replace("type: number", "type: integer")).breaking.map((b) => b.code)).toContain("changed_node_property_type");
    expect(checkProfileCompatibility(BASE_YAML, BASE_YAML.replace(/      created_on:.*\n/, "")).breaking.map((b) => b.code)).toContain("removed_node_property");
    expect(checkProfileCompatibility(BASE_YAML, BASE_YAML.replace("description: Score", "description: Score, required: true")).breaking.map((b) => b.code)).toContain("changed_node_property_type");
    const descOnly = checkProfileCompatibility(BASE_YAML, BASE_YAML.replace("description: Score", "description: Updated score"));
    expect(descOnly.compatible).toBe(true);
    expect(descOnly.nonBreaking.map((n) => n.code)).toContain("changed_node_property_description");
    expect(checkProfileCompatibility(BASE_YAML, BASE_YAML.replace('id_prefix: "alpha:"', 'id_prefix: "al:"')).breaking.map((b) => b.code)).toContain("changed_node_id_prefix");
  });

  it("F-EN2-T6: extensions are opaque and fail-closed with injectable classifier", () => {
    const extMut = BASE_YAML.replace("fallback: unknown_stage", "fallback: other_stage");
    const r1 = checkProfileCompatibility(BASE_YAML, extMut);
    expect(r1.compatible).toBe(false);
    expect(r1.breaking).toContainEqual(expect.objectContaining({ code: "changed_unmodeled_block", path: "extensions.stage_enum" }));
    const r2 = checkProfileCompatibility(BASE_YAML, extMut, { classifyExtensionChange: ({ path }) => (path === "extensions.stage_enum" ? "non-breaking" : "breaking") });
    expect(r2.compatible).toBe(true);
    expect(r2.nonBreaking).toContainEqual(expect.objectContaining({ code: "classified_extension_change", path: "extensions.stage_enum" }));
    const r3 = checkProfileCompatibility(BASE_YAML, extMut, { classifyExtensionChange: () => { throw new Error("boom"); } });
    expect(r3.compatible).toBe(false);
    expect(r3.breaking[0]?.message).toContain("boom");
  });

  it("F-EN2-T7: policies, registries, modeled residual units, and effective sets", () => {
    expect(checkProfileCompatibility(BASE_YAML, BASE_YAML.replace("minimum_granularity: file", "minimum_granularity: page")).breaking.map((b) => b.code)).toContain("tightened_citation_policy");
    const statusRemoved = BASE_YAML.replace("statuses: [candidate, validated, rejected]", "statuses: [candidate, validated]").replace("to: [validated, rejected]", "to: [validated]");
    expect(checkProfileCompatibility(BASE_YAML, statusRemoved).breaking.map((b) => b.code)).toContain("removed_status");
    expect(checkProfileCompatibility(BASE_YAML, BASE_YAML.replace("to: [validated, rejected]", "to: [validated]")).breaking.map((b) => b.code)).toContain("narrowed_status_transition");
    expect(checkProfileCompatibility(BASE_YAML, BASE_YAML.replace("label_column: label", "label_column: name")).breaking.map((b) => b.code)).toContain("changed_registry_binding");
    const full1 = bundleProfile(BASE_YAML, { reg_alpha: [rec("1", "A")] });
    const full2 = bundleProfile(BASE_YAML, { reg_alpha: [rec("1", "B")] });
    expect(full1.ok).toBe(true);
    expect(full2.ok).toBe(true);
    if (full1.ok && full2.ok) {
      expect(checkProfileCompatibility(full1.bundle, full2.bundle).breaking.map((b) => b.code)).toContain("changed_registry_records");
    }
    expect(bundleProfile(BASE_YAML, {})).toMatchObject({ ok: false, refusalCode: "invalid_registry_data" });
    expect(bundleProfile(BASE_YAML, { reg_alpha: [], extra: [] })).toMatchObject({ ok: false, refusalCode: "invalid_registry_data" });
    expect(bundleProfile(BASE_YAML, { reg_alpha: [rec("1"), rec("1")] })).toMatchObject({ ok: false, refusalCode: "invalid_registry_data" });
    const badRegId = bundleProfile(BASE_YAML, { reg_alpha: [rec("1", "A", { registryId: "wrong" })] });
    expect(badRegId.ok).toBe(false);
    if (!badRegId.ok) expect(badRegId.errors[0]?.path).toBe("registries.reg_alpha.records[0].registryId");
    const badNodeType = bundleProfile(BASE_YAML, { reg_alpha: [rec("1", "A", { nodeType: "Beta" })] });
    expect(badNodeType.ok).toBe(false);
    if (!badNodeType.ok) expect(badNodeType.errors[0]?.path).toBe("registries.reg_alpha.records[0].nodeType");
    const promMut = BASE_YAML.replace("promotion_requires: [citation]", "promotion_requires: [citation, review]");
    expect(checkProfileCompatibility(BASE_YAML, promMut).breaking).toContainEqual(expect.objectContaining({ code: "changed_modeled_field", path: "hardening.promotion_requires" }));
    expect(checkProfileCompatibility(BASE_YAML, BASE_YAML.replace("enabled: false", "enabled: true")).breaking).toContainEqual(expect.objectContaining({ code: "changed_modeled_field", path: "outputs.ontology.wiki" }));
    const promAllowed = checkProfileCompatibility(BASE_YAML, promMut, { classifyModeledFieldChange: ({ path }) => (path === "hardening.promotion_requires" ? "non-breaking" : "breaking") });
    expect(promAllowed.compatible).toBe(true);
    expect(promAllowed.nonBreaking.some((n) => n.code === "classified_modeled_field_change")).toBe(true);
    expect(checkProfileCompatibility(BASE_YAML, promMut, { classifyModeledFieldChange: () => { throw new Error("fail"); } }).compatible).toBe(false);
    const evAllNodes = BASE_YAML.replace("node_types: [Alpha]", "node_types: []");
    expect(checkProfileCompatibility(BASE_YAML, evAllNodes).breaking.map((b) => b.code)).toContain("tightened_evidence_policy");
    const evRelaxNodes = checkProfileCompatibility(evAllNodes, BASE_YAML);
    expect(evRelaxNodes.compatible).toBe(true);
    expect(evRelaxNodes.nonBreaking.map((n) => n.code)).toContain("relaxed_evidence_policy");
    const evAllRels = BASE_YAML.replace("relation_types: [links_to]", "relation_types: []");
    expect(checkProfileCompatibility(BASE_YAML, evAllRels).breaking.map((b) => b.code)).toContain("tightened_evidence_policy");
    expect(checkProfileCompatibility(evAllRels, BASE_YAML).nonBreaking.map((n) => n.code)).toContain("relaxed_evidence_policy");
    const evOff1 = BASE_YAML.replace("require_evidence_refs: true", "require_evidence_refs: false");
    const evOff2 = evAllNodes.replace("require_evidence_refs: true", "require_evidence_refs: false");
    expect(checkProfileCompatibility(evOff1, evOff2).breaking).toEqual([]);
    expect(checkProfileCompatibility(evOff1, evOff2).nonBreaking).toEqual([]);
    const evOffRels = evAllRels.replace("require_evidence_refs: true", "require_evidence_refs: false");
    expect(checkProfileCompatibility(evOff1, evOffRels).breaking).toEqual([]);
    expect(checkProfileCompatibility(evOff1, evOffRels).nonBreaking).toEqual([]);
    const citPage = BASE_YAML.replace("minimum_granularity: file", "minimum_granularity: page");
    const citRelax1 = checkProfileCompatibility(citPage, BASE_YAML);
    expect(citRelax1.breaking).toEqual([]);
    expect(citRelax1.nonBreaking.map((n) => n.code)).toContain("relaxed_citation_policy");
    const citRelax2 = checkProfileCompatibility(BASE_YAML, BASE_YAML.replace("require_source_file: true", "require_source_file: false"));
    expect(citRelax2.breaking).toEqual([]);
    expect(citRelax2.nonBreaking.map((n) => n.code)).toContain("relaxed_citation_policy");
  });

  it("F-EN2-T8: computeRegistryRecordsDigest matches closed form and code-unit sort", () => {
    const rZ = rec("Z", "Zed"), rA = rec("a", "Aye"), rB = rec("b", "Bee", { partition: "p1" });
    for (const list of [[], [rA], [rZ, rA, rB]]) {
      const sorted = [...list].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : (x.partition ?? "") < (y.partition ?? "") ? -1 : (x.partition ?? "") > (y.partition ?? "") ? 1 : 0));
      const closed = sha256Hex(sorted.map((r) => canonicalBytes({ id: r.id, label: r.label, aliases: r.aliases, partition: r.partition ?? null, raw: r.raw })).join("\n") + (sorted.length ? "\n" : ""));
      expect(computeRegistryRecordsDigest(list)).toBe(closed);
    }
    expect(computeRegistryRecordsDigest([rA, rZ])).toBe(computeRegistryRecordsDigest([rZ, rA]));
  });

  it("F-EN2-T9: profile_hash characterization golden", () => {
    const norm = normalizeOntologyProfile(parseOntologyProfile(BASE_YAML));
    expect(norm.profile_hash).toBe(T9_GOLDEN_PROFILE_HASH);
    const res = bundleProfile(BASE_YAML);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.bundle.profileHash).toBe(T9_GOLDEN_PROFILE_HASH);
    expect(res.bundle.schema).toBe(PROFILE_BUNDLE_SCHEMA_V1);
    expect(JSON_PROJECTION_VERSION).toBe("engram.json-projection/v1");
  });

  it("F-EN2-T10: refusals, linking.normalize.fn fence, dangling removals, and __proto__", () => {
    expect(bundleProfile("node_types: [unclosed")).toMatchObject({ ok: false, refusalCode: "invalid_profile_syntax" });
    const noSource = bundleProfile(BASE_YAML.replace("    source: [Alpha]\n    target: [Alpha, Beta]", "    target: [Alpha, Beta]"));
    expect(noSource).toMatchObject({ ok: false, refusalCode: "invalid_profile_schema", errors: [{ path: "relation_types.links_to.source", message: "relation_types.links_to.source is required" }] });
    const nullNodeYaml = "id: p\nversion: 1\nnode_types:\n  Alpha:\n";
    expect(bundleProfile(nullNodeYaml)).toMatchObject({ ok: false, refusalCode: "invalid_profile_schema" });
    const nullRelYaml = "id: p\nversion: 1\nnode_types:\n  Alpha:\n    id_prefix: 'a:'\nrelation_types:\n  rel:\n";
    expect(bundleProfile(nullRelYaml)).toMatchObject({ ok: false, refusalCode: "invalid_profile_schema" });
    expect(checkProfileCompatibility(BASE_YAML, nullNodeYaml)).toMatchObject({ ok: false, compatible: false });
    const mapRes = bundleProfile(new Map() as unknown as OntologyProfile);
    expect(mapRes).toMatchObject({ ok: false, refusalCode: "invalid_profile_schema", errors: [{ path: "profile", message: "profile projection failed at profile: non_plain_object" }] });
    const withFn = bundleProfile(BASE_YAML.replace("    status_policy: candidate", '    status_policy: candidate\n    linking:\n      normalize:\n        fn: "./nonexistent-normalizer-module.js"'));
    expect(withFn).toMatchObject({ ok: false, refusalCode: "unsupported_linking_fn", errors: [{ path: "node_types.Alpha.linking.normalize.fn" }] });
    expect(checkProfileCompatibility("node_types: [unclosed", BASE_YAML)).toMatchObject({ ok: false, compatible: false });
    const goodRes = bundleProfile(BASE_YAML);
    expect(goodRes.ok).toBe(true);
    if (goodRes.ok) {
      const p3a = JSON.parse(JSON.stringify(goodRes.bundle)) as { profile: { node_types: Record<string, unknown> } };
      p3a.profile.node_types.Alpha = null;
      const rP3a = checkProfileCompatibility(BASE_YAML, p3a as unknown as ProfileBundleV1);
      expect(rP3a.ok).toBe(false);
      expect(rP3a.validationIssues).toEqual([expect.objectContaining({ path: "new.digest" })]);
      const p3b = JSON.parse(JSON.stringify(goodRes.bundle)) as { profile: { hardening: { status_transitions: unknown[] } } };
      p3b.profile.hardening.status_transitions = [{}];
      const rP3b = checkProfileCompatibility(BASE_YAML, p3b as unknown as ProfileBundleV1);
      expect(rP3b.ok).toBe(false);
      expect(rP3b.validationIssues).toEqual([expect.objectContaining({ path: "new.digest" })]);
      const p3c = JSON.parse(JSON.stringify(goodRes.bundle)) as { profile: { node_types: Record<string, unknown> } };
      delete p3c.profile.node_types.Beta;
      const rP3c = checkProfileCompatibility(BASE_YAML, p3c as unknown as ProfileBundleV1);
      expect(rP3c.ok).toBe(false);
      expect(rP3c.validationIssues).toEqual([expect.objectContaining({ path: "new.digest" })]);
      const p5 = JSON.parse(JSON.stringify(goodRes.bundle)) as { registries: { reg_alpha: { binding: Record<string, unknown> } } };
      p5.registries.reg_alpha.binding.partition_column = undefined;
      const rP5 = checkProfileCompatibility(BASE_YAML, p5 as unknown as ProfileBundleV1);
      expect(rP5.ok).toBe(false);
      expect(rP5.validationIssues).toEqual([expect.objectContaining({ path: "new.digest" })]);
    }
    const noBeta = BASE_YAML.replace(/  Beta:[\s\S]*?title: \{ type: string, description: Title \}\n/, "");
    const dangNode = checkProfileCompatibility(BASE_YAML, noBeta);
    expect(dangNode.ok).toBe(false);
    expect(dangNode.compatible).toBe(false);
    expect(dangNode.validationIssues.length).toBeGreaterThan(0);
    expect(dangNode.validationIssues.every((i) => i.path.startsWith("new."))).toBe(true);
    expect(dangNode.breaking.find((b) => b.code === "removed_node_type" && b.subject === "Beta")).toBeTruthy();
    const noLinksTo = BASE_YAML.replace(/  links_to:[\s\S]*?description: Links Alpha\n/, "");
    const dangRel = checkProfileCompatibility(BASE_YAML, noLinksTo);
    expect(dangRel.ok).toBe(false);
    expect(dangRel.compatible).toBe(false);
    expect(dangRel.validationIssues.length).toBeGreaterThan(0);
    expect(dangRel.validationIssues.every((i) => i.path.startsWith("new."))).toBe(true);
    expect(dangRel.breaking.find((b) => b.code === "removed_relation_type" && b.subject === "links_to")).toBeTruthy();
    const parsedObj = parseOntologyProfile(BASE_YAML) as Record<string, unknown>;
    expect(bundleProfile(parsedObj).ok).toBe(true);
    const alphaNode = (parsedObj.node_types as Record<string, { aliases: string[]; properties: unknown }>).Alpha;
    expect(Object.isFrozen(alphaNode?.aliases)).toBe(false);
    expect(Object.isFrozen(alphaNode?.properties)).toBe(false);
    const noStatusesYaml = "id: min-p\nversion: 1\nnode_types:\n  Alpha:\n    id_prefix: 'a:'\n";
    expect(bundleProfile(noStatusesYaml).ok).toBe(true);
    expect(Object.isFrozen(normalizeOntologyProfile(parseOntologyProfile(noStatusesYaml)).hardening.statuses)).toBe(false);
    const protoObj = Object.assign(Object.create(null), parsedObj, JSON.parse('{"__proto__":{"x":1}}'));
    Object.setPrototypeOf(protoObj, Object.prototype);
    expect(bundleProfile(protoObj)).toMatchObject({ ok: false, refusalCode: "invalid_profile_schema", errors: [{ path: "__proto__" }] });
    const jp = toJsonValue(Object.assign(JSON.parse('{"__proto__":{"x":1}}'), { u: undefined }));
    expect(jp.ok).toBe(true);
    if (jp.ok) {
      expect(Object.getPrototypeOf(jp.value)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(jp.value, "__proto__")).toBe(true);
    }
    const shared = { k: -0 };
    expect(toJsonValue({ a: shared, b: shared })).toEqual({ ok: true, value: { a: { k: 0 }, b: { k: 0 } } });
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(toJsonValue(cyc)).toEqual({ ok: false, path: "self", reason: "cycle" });
    expect(toJsonValue(new Date())).toEqual({ ok: false, path: "", reason: "non_plain_object" });
    expect(toJsonValue({ [Symbol("s")]: 1 })).toEqual({ ok: false, path: "", reason: "symbol_key" });
    expect(toJsonValue(Object.defineProperty({}, "g", { get: () => 1, enumerable: true }))).toEqual({ ok: false, path: "g", reason: "accessor_property" });
    expect(toJsonValue(Object.defineProperty({}, "hidden", { value: 1, enumerable: false }))).toEqual({ ok: false, path: "hidden", reason: "accessor_property" });
    // eslint-disable-next-line no-sparse-arrays
    expect(toJsonValue([1, , 3])).toEqual({ ok: false, path: "[1]", reason: "unsupported_type" });
    expect(toJsonValue([undefined])).toEqual({ ok: false, path: "[0]", reason: "unsupported_type" });
    expect(toJsonValue(undefined)).toEqual({ ok: false, path: "", reason: "unsupported_type" });
    expect(toJsonValue(1n)).toEqual({ ok: false, path: "", reason: "unsupported_type" });
    expect(toJsonValue(() => {})).toEqual({ ok: false, path: "", reason: "unsupported_type" });
    expect(toJsonValue(Infinity)).toEqual({ ok: false, path: "", reason: "non_finite_number" });
    expect(toJsonValue(-Infinity)).toEqual({ ok: false, path: "", reason: "non_finite_number" });
    expect(toJsonValue({ b: NaN, a: NaN })).toEqual({ ok: false, path: "a", reason: "non_finite_number" });
    expect(toJsonValue({ x: [0, { y: NaN }] })).toEqual({ ok: false, path: "x[1].y", reason: "non_finite_number" });
    expect(toJsonValue({ "\ud800": 1 })).toEqual({ ok: false, path: "\ud800", reason: "invalid_unicode" });
    expect(toJsonValue("\ud800")).toEqual({ ok: false, path: "", reason: "invalid_unicode" });
  });

  describe.skipIf(!process.env.ENGRAM_RADAR_PROFILE_PATH)("F-EN2-T11: opt-in real-profile integration", () => {
    it("bundles and checks compatibility mutations on the consumer profile", () => {
      const raw = readFileSync(process.env.ENGRAM_RADAR_PROFILE_PATH!, "utf8");
      const b = bundleProfile(raw);
      expect(b.ok).toBe(true);
      if (!b.ok) return;
      expect(b.bundle.profileVersion).toBe("2");
      expect(Object.keys(b.bundle.extensions).sort()).toEqual(["etape_enum", "extraction_hints", "ontology_version", "synonym_relations"]);
      const commented = bundleProfile(`\n# comment\n${raw}\n`);
      expect(commented.ok).toBe(true);
      if (commented.ok) expect(commented.bundle.digest).toBe(b.bundle.digest);
      expect(checkProfileCompatibility(raw, raw.replace(/  supersedes:\n(?:    .*\n)+/, "")).breaking.map((x) => x.code)).toContain("removed_relation_type");
      expect(checkProfileCompatibility(raw, raw.replace(/superficie_m2:\s*\{\s*type:\s*number/, "superficie_m2: { type: integer")).breaking.map((x) => x.code)).toContain("changed_node_property_type");
      const narrowed = checkProfileCompatibility(raw, raw.replace("target: [Zone, Lot]", "target: [Zone]"));
      expect(narrowed.breaking.some((x) => x.code === "narrowed_relation_target" && x.subject === "concerns")).toBe(true);
      const added = checkProfileCompatibility(raw, raw.replace("node_types:", "node_types:\n  SyntheticExtra:\n    id_prefix: 'syn:'"));
      expect(added.compatible).toBe(true);
      expect(added.nonBreaking.map((x) => x.code)).toEqual(["added_node_type"]);
      const noRezones = checkProfileCompatibility(raw, raw.replace(/  rezones:\n(?:    .*\n)+/, ""));
      expect(noRezones.ok).toBe(false);
      expect(noRezones.validationIssues.length).toBeGreaterThan(0);
      expect(noRezones.breaking.some((x) => x.code === "removed_relation_type")).toBe(true);
      const noConstraint = checkProfileCompatibility(raw, raw.replace(/  Constraint:\n(?:    .*\n)+/, ""));
      expect(noConstraint.ok).toBe(false);
      expect(noConstraint.validationIssues.length).toBeGreaterThan(0);
      expect(noConstraint.breaking.some((x) => x.code === "removed_node_type")).toBe(true);
    });
  });
});
