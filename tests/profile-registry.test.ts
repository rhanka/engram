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
import type { NormalizedOntologyProfile } from "../src/types.js";
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

  it("loads a declared partition column, rejects missing values, and keeps IDs globally unique", () => {
    const root = makeTempDir();
    const partitionedPath = join(root, "partitioned.csv");
    writeFileSync(
      partitionedPath,
      "component_id,component_name,municipality\nCMP-001,Demo One,compton\n",
      "utf-8",
    );
    const spec = {
      source: "components",
      id_column: "component_id",
      label_column: "component_name",
      alias_columns: [],
      node_type: "Component",
      partition_column: "municipality",
      bound_source_path: partitionedPath,
    };

    expect(loadProfileRegistry("components", spec)[0]).toMatchObject({ partition: "compton" });

    const missingColumnPath = join(root, "missing-column.csv");
    writeFileSync(missingColumnPath, "component_id,component_name\nCMP-002,Demo Two\n", "utf-8");
    expect(() => loadProfileRegistry("components", { ...spec, bound_source_path: missingColumnPath })).toThrow(
      `registries.components.partition_column municipality does not exist in ${missingColumnPath}`,
    );

    const missingValuePath = join(root, "missing-value.csv");
    writeFileSync(missingValuePath, "component_id,component_name,municipality\nCMP-003,Demo Three,\n", "utf-8");
    expect(() => loadProfileRegistry("components", { ...spec, bound_source_path: missingValuePath })).toThrow(
      "components record CMP-003 is missing partition_column municipality",
    );

    const duplicateAcrossPartitionsPath = join(root, "duplicate-across-partitions.csv");
    writeFileSync(
      duplicateAcrossPartitionsPath,
      "component_id,component_name,municipality\nC-15,C-15,compton\nC-15,C-15,other\n",
      "utf-8",
    );
    expect(() => loadProfileRegistry("components", { ...spec, bound_source_path: duplicateAcrossPartitionsPath })).toThrow(
      "duplicate registry record id C-15 in components",
    );
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

  it("propagates registry_partition without changing the registry seed node ID", () => {
    const profile = {
      id: "partitioned",
      version: "1",
      profile_hash: "profile-hash",
    } as NormalizedOntologyProfile;
    const extraction = registryRecordsToExtraction({
      zones: [{
        registryId: "zones",
        id: "C-15",
        label: "C-15",
        aliases: [],
        nodeType: "Zone",
        partition: "compton",
        sourceFile: "/tmp/zones.csv",
        raw: { code: "C-15", municipality: "compton" },
      }],
    }, profile);

    expect(extraction.nodes).toContainEqual(expect.objectContaining({
      id: "registry_zones_C_15",
      registry_id: "zones",
      registry_record_id: "C-15",
      registry_partition: "compton",
    }));
  });
});
