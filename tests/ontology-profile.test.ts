import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeProjectConfig } from "../src/project-config.js";
import {
  bindOntologyProfile,
  hashOntologyProfile,
  loadOntologyProfile,
  normalizeOntologyProfile,
  parseOntologyProfile,
  validateOntologyProfile,
} from "../src/ontology-profile.js";

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-ontology-profile-"));
  cleanupDirs.push(dir);
  return dir;
}

function write(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

function validProfileYaml(): string {
  return [
    "id: equipment-maintenance-demo",
    "version: 1",
    "default_language: en",
    "node_types:",
    "  MaintenanceProcess:",
    "    aliases: [process, maintenance step]",
    "    status_policy: hardenable",
    "  Component:",
    "    aliases: [part, replaceable unit]",
    "    registry: components",
    "  Tool:",
    "    aliases: [tool, fixture]",
    "relation_types:",
    "  inspects:",
    "    source: MaintenanceProcess",
    "    target: Component",
    "  requires_tool:",
    "    source: MaintenanceProcess",
    "    target: [Tool]",
    "registries:",
    "  components:",
    "    source: components",
    "    id_column: component_id",
    "    label_column: component_name",
    "    alias_columns: [component_code]",
    "    node_type: Component",
    "citation_policy:",
    "  minimum_granularity: page",
    "  require_source_file: true",
    "  allow_bbox: when_available",
    "hardening:",
    "  statuses: [candidate, attached, needs_review, validated, rejected, superseded]",
    "  default_status: candidate",
    "  promotion_requires:",
    "    - source_citation",
    "    - allowed_relation_type",
    "",
  ].join("\n");
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("ontology profile loader", () => {
  it("loads and normalizes a YAML profile", () => {
    const root = makeTempDir();
    const profilePath = join(root, "graphify", "ontology-profile.yaml");
    write(profilePath, validProfileYaml());

    const profile = loadOntologyProfile(profilePath);

    expect(profile.id).toBe("equipment-maintenance-demo");
    expect(profile.version).toBe("1");
    expect(profile.sourcePath).toBe(profilePath);
    expect(profile.node_types.Component.registry).toBe("components");
    expect(profile.relation_types.inspects.source_types).toEqual(["MaintenanceProcess"]);
    expect(profile.relation_types.inspects.target_types).toEqual(["Component"]);
    expect(profile.citation_policy.minimum_granularity).toBe("page");
    expect(profile.hardening.default_status).toBe("candidate");
    expect(profile.outputs.ontology.enabled).toBe(false);
    expect(profile.profile_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("loads and normalizes a JSON profile", () => {
    const root = makeTempDir();
    const profilePath = join(root, "profile.json");
    writeFileSync(
      profilePath,
      JSON.stringify({
        id: "equipment-maintenance-demo",
        version: 1,
        node_types: { Component: { registry: "components" } },
        relation_types: {},
        registries: {
          components: {
            source: "components",
            id_column: "component_id",
            label_column: "component_name",
            node_type: "Component",
          },
        },
      }),
      "utf-8",
    );

    const profile = loadOntologyProfile(profilePath);

    expect(profile.version).toBe("1");
    expect(profile.node_types.Component.registry).toBe("components");
    expect(profile.hardening.statuses).toContain("candidate");
  });

  it("normalizes generic profile v2 lifecycle, evidence, inference, and hierarchy constraints", () => {
    const raw = parseOntologyProfile(
      [
        "id: synthetic-lifecycle",
        "version: 2",
        "node_types:",
        "  CanonicalEntity: {}",
        "  Mention:",
        "    source_backed: true",
        "  EvidenceRecord:",
        "    source_backed: true",
        "relation_types:",
        "  maps_to:",
        "    source: Mention",
        "    target: CanonicalEntity",
        "    requires_evidence: true",
        "    assertion_basis: [source_citation]",
        "    derivation_method: direct_extraction",
        "  parent_of:",
        "    source: CanonicalEntity",
        "    target: CanonicalEntity",
        "registries:",
        "  synthetic_entities:",
        "    source: synthetic_entities",
        "    id_column: entity_id",
        "    label_column: entity_label",
        "    node_type: CanonicalEntity",
        "hardening:",
        "  statuses: [candidate, needs_review, validated, rejected, superseded]",
        "  default_status: candidate",
        "  status_transitions:",
        "    - from: candidate",
        "      to: needs_review",
        "    - from: needs_review",
        "      to: validated",
        "      requires: [evidence_ref]",
        "inference_policy:",
        "  allow_inferred_relations: false",
        "  allowed_relation_types: [parent_of]",
        "  require_evidence_refs: true",
        "evidence_policy:",
        "  require_evidence_refs: true",
        "  min_refs: 1",
        "  relation_types: [maps_to]",
        "hierarchies:",
        "  canonical_tree:",
        "    registry: synthetic_entities",
        "    parent_column: parent_id",
        "    child_column: entity_id",
        "    relation_type: parent_of",
        "    parent_node_type: CanonicalEntity",
        "    child_node_type: CanonicalEntity",
        "",
      ].join("\n"),
      "ontology-profile.yaml",
    );

    const profile = normalizeOntologyProfile(raw);

    expect(profile.relation_types.maps_to.requires_evidence).toBe(true);
    expect(profile.relation_types.maps_to.assertion_basis).toEqual(["source_citation"]);
    expect(profile.relation_types.maps_to.derivation_methods).toEqual(["direct_extraction"]);
    expect(profile.hardening.status_transitions).toEqual([
      { from_statuses: ["candidate"], to_statuses: ["needs_review"], requires: [] },
      { from_statuses: ["needs_review"], to_statuses: ["validated"], requires: ["evidence_ref"] },
    ]);
    expect(profile.inference_policy).toMatchObject({
      allow_inferred_relations: false,
      allowed_relation_types: ["parent_of"],
      require_evidence_refs: true,
    });
    expect(profile.evidence_policy).toMatchObject({
      require_evidence_refs: true,
      min_refs: 1,
      relation_types: ["maps_to"],
    });
    expect(profile.hierarchies.canonical_tree).toMatchObject({
      registry: "synthetic_entities",
      parent_column: "parent_id",
      child_column: "entity_id",
      relation_type: "parent_of",
      parent_node_type: "CanonicalEntity",
      child_node_type: "CanonicalEntity",
    });
  });

  it("rejects missing id and invalid relation type references", () => {
    const raw = parseOntologyProfile(
      [
        "version: 1",
        "node_types:",
        "  Component: {}",
        "relation_types:",
        "  inspects:",
        "    source: MissingType",
        "    target: Component",
        "",
      ].join("\n"),
      "ontology-profile.yaml",
    );

    const errors = validateOntologyProfile(raw);

    expect(errors).toContain("id is required");
    expect(errors).toContain("relation_types.inspects.source references unknown node type MissingType");
  });

  it("rejects invalid registry declarations", () => {
    const raw = parseOntologyProfile(
      [
        "id: equipment-maintenance-demo",
        "version: 1",
        "node_types:",
        "  Component: {}",
        "relation_types: {}",
        "registries:",
        "  components:",
        "    source: components",
        "    id_column: component_id",
        "    label_column: component_name",
        "    node_type: MissingType",
        "",
      ].join("\n"),
      "ontology-profile.yaml",
    );

    expect(validateOntologyProfile(raw)).toContain(
      "registries.components.node_type references unknown node type MissingType",
    );
  });

  it("rejects ontology output declarations that reference unknown profile types", () => {
    const raw = parseOntologyProfile(
      [
        "id: equipment-maintenance-demo",
        "version: 1",
        "node_types:",
        "  Component: {}",
        "relation_types: {}",
        "outputs:",
        "  ontology:",
        "    enabled: true",
        "    canonical_node_types: [MissingType]",
        "",
      ].join("\n"),
      "ontology-profile.yaml",
    );

    expect(validateOntologyProfile(raw)).toContain(
      "outputs.ontology.canonical_node_types references unknown node type MissingType",
    );
  });

  it("rejects invalid profile v2 lifecycle, registry, and hierarchy references", () => {
    const raw = parseOntologyProfile(
      [
        "id: synthetic-lifecycle",
        "version: 2",
        "node_types:",
        "  Entity: {}",
        "relation_types:",
        "  relates:",
        "    source: Entity",
        "    target: Entity",
        "registries:",
        "  entities:",
        "    source: entities",
        "    id_column: entity_id",
        "    label_column: entity_label",
        "    node_type: Entity",
        "hardening:",
        "  statuses: [candidate]",
        "  status_transitions:",
        "    - from: draft",
        "      to: archived",
        "inference_policy:",
        "  allowed_relation_types: [missing_relation]",
        "evidence_policy:",
        "  node_types: [MissingNode]",
        "  relation_types: [missing_relation]",
        "hierarchies:",
        "  invalid_tree:",
        "    registry: missing_registry",
        "    parent_column: parent_id",
        "    child_column: entity_id",
        "    relation_type: missing_relation",
        "    parent_node_type: MissingNode",
        "    child_node_type: Entity",
        "",
      ].join("\n"),
      "ontology-profile.yaml",
    );

    const errors = validateOntologyProfile(raw);

    expect(errors).toContain("hardening.status_transitions[0].from references unknown status draft");
    expect(errors).toContain("hardening.status_transitions[0].to references unknown status archived");
    expect(errors).toContain("inference_policy.allowed_relation_types references unknown relation type missing_relation");
    expect(errors).toContain("evidence_policy.node_types references unknown node type MissingNode");
    expect(errors).toContain("evidence_policy.relation_types references unknown relation type missing_relation");
    expect(errors).toContain("hierarchies.invalid_tree.registry references unknown registry missing_registry");
    expect(errors).toContain("hierarchies.invalid_tree.relation_type references unknown relation type missing_relation");
    expect(errors).toContain("hierarchies.invalid_tree.parent_node_type references unknown node type MissingNode");
  });

  it("binds profile registry declarations to project config registry sources", () => {
    const root = makeTempDir();
    const config = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/ontology-profile.yaml" },
        inputs: {
          corpus: ["raw"],
          registries: ["references/components.csv"],
        },
      },
      join(root, "graphify.yaml"),
    );
    const profile = normalizeOntologyProfile(parseOntologyProfile(validProfileYaml(), "ontology-profile.yaml"));

    const bound = bindOntologyProfile(profile, config);

    expect(bound.registries.components.bound_source_path).toBe(join(root, "references", "components.csv"));
  });

  it("rejects registry binding when project config does not declare the named source", () => {
    const root = makeTempDir();
    const config = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/ontology-profile.yaml" },
        inputs: {
          corpus: ["raw"],
          registries: ["references/tooling.csv"],
        },
      },
      join(root, "graphify.yaml"),
    );
    const profile = normalizeOntologyProfile(parseOntologyProfile(validProfileYaml(), "ontology-profile.yaml"));

    expect(() => bindOntologyProfile(profile, config)).toThrow(
      "registries.components.source references unknown project registry source components",
    );
  });

  it("computes a stable hash independent of object key order", () => {
    const first = normalizeOntologyProfile(parseOntologyProfile(validProfileYaml(), "a.yaml"));
    const second = normalizeOntologyProfile({
      relation_types: first.relation_types,
      node_types: first.node_types,
      version: first.version,
      id: first.id,
      registries: first.registries,
      citation_policy: first.citation_policy,
      hardening: first.hardening,
    });

    expect(hashOntologyProfile(first)).toBe(hashOntologyProfile(second));
  });
});
