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
