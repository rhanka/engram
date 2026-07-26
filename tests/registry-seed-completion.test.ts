import { describe, expect, it } from "vitest";

import {
  completeRegistrySeeds,
  registriesBackingHierarchies,
} from "../src/registry-seed-completion.js";
import type {
  GraphNode,
  NormalizedOntologyProfile,
  RegistryRecord,
} from "../src/types.js";

function profile(): NormalizedOntologyProfile {
  // Only the fields completeRegistrySeeds / registryRecordsToExtraction read.
  return {
    id: "demo",
    version: "1",
    profile_hash: "hash-demo",
  } as unknown as NormalizedOntologyProfile;
}

function record(registryId: string, id: string, label: string): RegistryRecord {
  return {
    registryId,
    id,
    label,
    aliases: [],
    nodeType: registryId === "org-units" ? "OrganizationUnit" : "Process",
    sourceFile: `/registries/${registryId}.csv`,
    raw: { id, label },
  };
}

function node(id: string, registryId?: string, recordId?: string): GraphNode {
  return {
    id,
    label: id,
    file_type: "document",
    source_file: "x.csv",
    ...(registryId ? { registry_id: registryId } : {}),
    ...(recordId ? { registry_record_id: recordId } : {}),
  };
}

describe("registry seed completion", () => {
  const registries = {
    "abp-processes": [
      record("abp-processes", "DE", "Develop"),
      record("abp-processes", "DE.AI", "Architect and Integrate"),
      record("abp-processes", "DE.AI.01", "Organize Requirements"),
    ],
    "org-units": [record("org-units", "AB", "client-org Canada")],
  };

  it("materializes only the registry rows missing from the graph", () => {
    // "DE" is already seeded under the canonical id; the other three are not.
    const graphNodes = [node("registry_abp_processes_DE", "abp-processes", "DE")];

    const result = completeRegistrySeeds({ registries, profile: profile(), graphNodes });

    expect(result.added).toBe(3);
    expect(result.nodes.map((n) => n.registry_record_id)).toEqual([
      "DE.AI",
      "DE.AI.01",
      "AB",
    ]);
    expect(result.byRegistry).toEqual({
      "abp-processes": { total: 3, existing: 1, added: 2 },
      "org-units": { total: 1, existing: 0, added: 1 },
    });
  });

  it("emits seeds shaped like pipeline-seeded registry nodes", () => {
    const result = completeRegistrySeeds({
      registries: { "org-units": registries["org-units"] },
      profile: profile(),
      graphNodes: [],
    });

    expect(result.nodes[0]).toMatchObject({
      id: "registry_org_units_AB",
      label: "client-org Canada",
      node_type: "OrganizationUnit",
      registry_id: "org-units",
      // D2: the join key is the verbatim id_column value.
      registry_record_id: "AB",
      status: "validated",
      profile_id: "demo",
    });
  });

  it("recognizes a record already seeded under a NON-canonical node id", () => {
    // The pipeline can attach a record to a node it created from the corpus;
    // matching only on the canonical id would duplicate the entity.
    const graphNodes = [node("semantic:doc:n7", "org-units", "AB")];

    const result = completeRegistrySeeds({
      registries: { "org-units": registries["org-units"] },
      profile: profile(),
      graphNodes,
    });

    expect(result.added).toBe(0);
    expect(result.byRegistry["org-units"]).toEqual({ total: 1, existing: 1, added: 0 });
  });

  it("is a no-op on an already-complete graph", () => {
    const graphNodes: GraphNode[] = [
      node("registry_abp_processes_DE", "abp-processes", "DE"),
      node("registry_abp_processes_DE_AI", "abp-processes", "DE.AI"),
      node("registry_abp_processes_DE_AI_01", "abp-processes", "DE.AI.01"),
      node("registry_org_units_AB", "org-units", "AB"),
    ];

    const result = completeRegistrySeeds({ registries, profile: profile(), graphNodes });

    expect(result.added).toBe(0);
    expect(result.nodes).toEqual([]);
  });

  it("restricts completion to the requested registries", () => {
    const result = completeRegistrySeeds({
      registries,
      profile: profile(),
      graphNodes: [],
      onlyRegistries: ["org-units"],
    });

    expect(result.added).toBe(1);
    expect(Object.keys(result.byRegistry)).toEqual(["org-units"]);
  });

  it("is deterministic regardless of registry key order", () => {
    const forward = completeRegistrySeeds({ registries, profile: profile(), graphNodes: [] });
    const reversed = completeRegistrySeeds({
      registries: {
        "org-units": registries["org-units"],
        "abp-processes": registries["abp-processes"],
      },
      profile: profile(),
      graphNodes: [],
    });

    expect(reversed.nodes.map((n) => n.id)).toEqual(forward.nodes.map((n) => n.id));
  });

  it("lists the registries backing declared hierarchies, deduped and sorted", () => {
    expect(
      registriesBackingHierarchies({
        hierarchies: {
          abp_process_tree: { registry: "abp-processes" },
          org_unit_tree: { registry: "org-units" },
          // Two hierarchies over the same registry must yield one entry.
          abp_alt_tree: { registry: "abp-processes" },
        },
      } as unknown as NormalizedOntologyProfile),
    ).toEqual(["abp-processes", "org-units"]);
  });
});
