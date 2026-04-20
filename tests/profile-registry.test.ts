import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeProjectConfig } from "../src/project-config.js";
import { bindOntologyProfile, loadOntologyProfile } from "../src/ontology-profile.js";
import {
  loadProfileRegistries,
  loadProfileRegistry,
  normalizeRegistryRecord,
  registryRecordsToExtraction,
} from "../src/profile-registry.js";
import { validateExtraction } from "../src/validate.js";

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-profile-registry-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("profile registry loader", () => {
  it("loads synthetic CSV registries bound by ontology profile", () => {
    const root = join(process.cwd(), "tests", "fixtures", "profile-demo");
    const config = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/ontology-profile.yaml" },
        inputs: {
          corpus: ["raw/manuals"],
          registries: ["references/components.csv", "references/tooling.csv"],
        },
      },
      join(root, "graphify.yaml"),
    );
    const profile = bindOntologyProfile(loadOntologyProfile(config.profile.resolvedPath), config);

    const registries = loadProfileRegistries(profile);

    expect(registries.components).toHaveLength(2);
    expect(registries.components[0]).toMatchObject({
      registryId: "components",
      id: "CMP-001",
      label: "Demo Filter Cartridge",
      aliases: ["DFC-001"],
      nodeType: "Component",
      sourceFile: join(root, "references", "components.csv"),
    });
    expect(registries.components[0].raw).toMatchObject({ component_id: "CMP-001" });
    expect(registries.tooling).toHaveLength(2);
  });

  it("loads JSON and YAML registry arrays", () => {
    const root = makeTempDir();
    const jsonPath = join(root, "components.json");
    const yamlPath = join(root, "tooling.yaml");
    writeFileSync(
      jsonPath,
      JSON.stringify([
        { component_id: "CMP-010", component_name: "Demo Bearing", component_code: "DBR-010" },
      ]),
      "utf-8",
    );
    writeFileSync(
      yamlPath,
      "- tool_id: TOOL-010\n  tool_name: Demo Lift Aid\n  tool_code: DLA-010\n",
      "utf-8",
    );

    const components = loadProfileRegistry("components", {
      source: "components",
      id_column: "component_id",
      label_column: "component_name",
      alias_columns: ["component_code"],
      node_type: "Component",
      bound_source_path: jsonPath,
    });
    const tooling = loadProfileRegistry("tooling", {
      source: "tooling",
      id_column: "tool_id",
      label_column: "tool_name",
      alias_columns: ["tool_code"],
      node_type: "Tool",
      bound_source_path: yamlPath,
    });

    expect(components[0]).toMatchObject({ id: "CMP-010", label: "Demo Bearing" });
    expect(tooling[0]).toMatchObject({ id: "TOOL-010", label: "Demo Lift Aid" });
  });

  it("normalizes aliases and preserves raw fields", () => {
    const record = normalizeRegistryRecord(
      "components",
      {
        source: "components",
        id_column: "component_id",
        label_column: "component_name",
        alias_columns: ["component_code", "legacy_code"],
        node_type: "Component",
      },
      {
        component_id: "CMP-020",
        component_name: "Demo Valve",
        component_code: "DVL-020",
        legacy_code: "LEG-020",
        ignored: "kept in raw",
      },
      "/tmp/components.csv",
    );

    expect(record.aliases).toEqual(["DVL-020", "LEG-020"]);
    expect(record.raw).toMatchObject({ ignored: "kept in raw" });
  });

  it("rejects missing required columns and duplicate IDs", () => {
    const root = makeTempDir();
    const csvPath = join(root, "components.csv");
    writeFileSync(
      csvPath,
      "component_id,component_name\nCMP-001,Demo One\nCMP-001,Demo Duplicate\n",
      "utf-8",
    );

    expect(() =>
      loadProfileRegistry("components", {
        source: "components",
        id_column: "component_id",
        label_column: "component_name",
        alias_columns: [],
        node_type: "Component",
        bound_source_path: csvPath,
      }),
    ).toThrow("duplicate registry record id CMP-001 in components");

    expect(() =>
      normalizeRegistryRecord(
        "components",
        {
          source: "components",
          id_column: "component_id",
          label_column: "component_name",
          alias_columns: [],
          node_type: "Component",
        },
        { component_id: "", component_name: "No ID" },
        csvPath,
      ),
    ).toThrow("components record is missing id_column component_id");
  });

  it("rejects unbound registry sources", () => {
    expect(() =>
      loadProfileRegistry("components", {
        source: "components",
        id_column: "component_id",
        label_column: "component_name",
        alias_columns: [],
        node_type: "Component",
      }),
    ).toThrow("registries.components is not bound to a source file");
  });

  it("converts registry records to a base-valid Graphify extraction", () => {
    const root = join(process.cwd(), "tests", "fixtures", "profile-demo");
    const config = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/ontology-profile.yaml" },
        inputs: {
          corpus: ["raw/manuals"],
          registries: ["references/components.csv", "references/tooling.csv"],
        },
      },
      join(root, "graphify.yaml"),
    );
    const profile = bindOntologyProfile(loadOntologyProfile(config.profile.resolvedPath), config);
    const registries = loadProfileRegistries(profile);

    const extraction = registryRecordsToExtraction(registries, profile);

    expect(validateExtraction(extraction)).toEqual([]);
    expect(extraction.edges).toEqual([]);
    expect(extraction.hyperedges).toEqual([]);
    expect(extraction.input_tokens).toBe(0);
    expect(extraction.output_tokens).toBe(0);
    expect(extraction.nodes).toContainEqual(
      expect.objectContaining({
        id: "registry_components_CMP_001",
        label: "Demo Filter Cartridge",
        file_type: "document",
        source_file: join(root, "references", "components.csv"),
        node_type: "Component",
        registry_id: "components",
        registry_record_id: "CMP-001",
        aliases: ["DFC-001"],
        status: "validated",
        profile_id: "equipment-maintenance-demo",
        profile_version: "1",
        profile_hash: profile.profile_hash,
      }),
    );
  });
});
