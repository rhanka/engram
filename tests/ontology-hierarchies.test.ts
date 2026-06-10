import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { compileHierarchies, buildHierarchyIndex } from "../src/ontology-hierarchies.js";
import { compileOntologyOutputs } from "../src/ontology-output.js";
import type {
  NormalizedOntologyHierarchySpec,
  OntologyHierarchyArc,
  RegistryRecord,
} from "../src/types.js";
import type { NormalizedOntologyProfile } from "../src/types.js";
import type { Extraction } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-ontology-hierarchies-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/** Minimal NormalizedOntologyProfile factory. */
function makeProfile(
  hierarchies: Record<string, NormalizedOntologyHierarchySpec> = {},
): NormalizedOntologyProfile {
  return {
    id: "test",
    version: "1",
    default_language: "en",
    profile_hash: "test-hash",
    node_types: {
      Category: {},
    },
    relation_types: {
      parent_of: { source_types: ["Category"], target_types: ["Category"], requires_evidence: false, assertion_basis: [], derivation_methods: [] },
    },
    registries: {},
    citation_policy: { minimum_granularity: "file", require_source_file: false, allow_bbox: false },
    hardening: {
      statuses: ["candidate", "validated"],
      default_status: "candidate",
      promotion_requires: [],
      status_transitions: [],
    },
    inference_policy: { allow_inferred_relations: false, allowed_relation_types: [], require_evidence_refs: false },
    evidence_policy: { require_evidence_refs: false, min_refs: 0, node_types: [], relation_types: [] },
    hierarchies,
    outputs: {
      ontology: {
        enabled: false,
        artifact_schema: "graphify_ontology_outputs_v1",
        canonical_node_types: [],
        source_node_types: [],
        occurrence_node_types: [],
        alias_fields: [],
        relation_exports: [],
        wiki: { enabled: false, page_node_types: [], include_backlinks: false, include_source_snippets: false },
      },
    },
  };
}

/** Make a RegistryRecord from minimal fields. */
function makeRecord(
  registryId: string,
  id: string,
  raw: Record<string, unknown>,
): RegistryRecord {
  return {
    registryId,
    id,
    label: id,
    aliases: [],
    nodeType: "Category",
    sourceFile: "/fake/registry.csv",
    raw,
  };
}

// ---------------------------------------------------------------------------
// compileHierarchies — unit tests
// ---------------------------------------------------------------------------

describe("compileHierarchies", () => {
  it("returns empty array when no hierarchies declared", () => {
    const arcs = compileHierarchies({ hierarchies: {}, registries: {} });
    expect(arcs).toEqual([]);
  });

  it("returns empty array when registry is empty", () => {
    const spec: NormalizedOntologyHierarchySpec = {
      registry: "cats",
      parent_column: "parent_id",
      child_column: "id",
      relation_type: "parent_of",
      parent_node_type: "Category",
      child_node_type: "Category",
    };
    const arcs = compileHierarchies({ hierarchies: { taxonomy: spec }, registries: { cats: [] } });
    expect(arcs).toEqual([]);
  });

  it("skips rows with blank parent (root nodes)", () => {
    const spec: NormalizedOntologyHierarchySpec = {
      registry: "cats",
      parent_column: "parent_id",
      child_column: "id",
      relation_type: "parent_of",
      parent_node_type: "Category",
      child_node_type: "Category",
    };
    const records: RegistryRecord[] = [
      makeRecord("cats", "root", { id: "root", parent_id: "" }),
      makeRecord("cats", "child1", { id: "child1", parent_id: "root" }),
    ];
    const arcs = compileHierarchies({ hierarchies: { taxonomy: spec }, registries: { cats: records } });
    expect(arcs).toHaveLength(1);
    expect(arcs[0].parent_id).toBe("root");
    expect(arcs[0].child_id).toBe("child1");
  });

  it("generates correct arcs for a 3-level hierarchy", () => {
    // root → level1 → level2
    const spec: NormalizedOntologyHierarchySpec = {
      registry: "cats",
      parent_column: "parent_id",
      child_column: "id",
      relation_type: "parent_of",
      parent_node_type: "Category",
      child_node_type: "Category",
    };
    const records: RegistryRecord[] = [
      makeRecord("cats", "root", { id: "root", parent_id: "" }),
      makeRecord("cats", "level1", { id: "level1", parent_id: "root" }),
      makeRecord("cats", "level2", { id: "level2", parent_id: "level1" }),
    ];
    const arcs = compileHierarchies({ hierarchies: { taxonomy: spec }, registries: { cats: records } });

    expect(arcs).toHaveLength(2);

    const arc0 = arcs.find((a) => a.child_id === "level1")!;
    expect(arc0).toBeDefined();
    expect(arc0.parent_id).toBe("root");
    expect(arc0.hierarchy_id).toBe("taxonomy");
    expect(arc0.type).toBe("parent_of");
    expect(arc0.source).toBe("profile");
    // Increment B — profile arcs are authoritative reference facts.
    expect(arc0.status).toBe("reference");
    expect(arc0.confidence).toBe(1.0);

    const arc1 = arcs.find((a) => a.child_id === "level2")!;
    expect(arc1).toBeDefined();
    expect(arc1.parent_id).toBe("level1");
  });

  it("tags every profile arc with status:reference and confidence:1.0", () => {
    const spec: NormalizedOntologyHierarchySpec = {
      registry: "cats",
      parent_column: "parent_id",
      child_column: "id",
      relation_type: "parent_of",
      parent_node_type: "Category",
      child_node_type: "Category",
    };
    const records: RegistryRecord[] = [
      makeRecord("cats", "root", { id: "root", parent_id: "" }),
      makeRecord("cats", "child1", { id: "child1", parent_id: "root" }),
      makeRecord("cats", "grandchild", { id: "grandchild", parent_id: "child1" }),
    ];
    const arcs = compileHierarchies({ hierarchies: { taxonomy: spec }, registries: { cats: records } });
    expect(arcs).toHaveLength(2);
    expect(arcs.every((a) => a.status === "reference")).toBe(true);
    expect(arcs.every((a) => a.confidence === 1.0)).toBe(true);
  });

  it("skips self-loops (parent_id === id)", () => {
    const spec: NormalizedOntologyHierarchySpec = {
      registry: "cats",
      parent_column: "parent_id",
      child_column: "id",
      relation_type: "parent_of",
      parent_node_type: "Category",
      child_node_type: "Category",
    };
    const records: RegistryRecord[] = [
      makeRecord("cats", "self", { id: "self", parent_id: "self" }),
    ];
    const arcs = compileHierarchies({ hierarchies: { taxonomy: spec }, registries: { cats: records } });
    expect(arcs).toHaveLength(0);
  });

  it("produces arcs from multiple hierarchies", () => {
    const specA: NormalizedOntologyHierarchySpec = {
      registry: "catsA",
      parent_column: "parent",
      child_column: "id",
      relation_type: "part_of",
      parent_node_type: "Category",
      child_node_type: "Category",
    };
    const specB: NormalizedOntologyHierarchySpec = {
      registry: "catsB",
      parent_column: "parent",
      child_column: "id",
      relation_type: "belongs_to",
      parent_node_type: "Category",
      child_node_type: "Category",
    };
    const recsA: RegistryRecord[] = [
      makeRecord("catsA", "p1", { id: "c1", parent: "p1" }),
    ];
    const recsB: RegistryRecord[] = [
      makeRecord("catsB", "p2", { id: "c2", parent: "p2" }),
    ];
    const arcs = compileHierarchies({
      hierarchies: { hierA: specA, hierB: specB },
      registries: { catsA: recsA, catsB: recsB },
    });
    expect(arcs).toHaveLength(2);
    expect(arcs.find((a) => a.hierarchy_id === "hierA")?.type).toBe("part_of");
    expect(arcs.find((a) => a.hierarchy_id === "hierB")?.type).toBe("belongs_to");
  });

  it("round-trips through JSON cleanly", () => {
    const spec: NormalizedOntologyHierarchySpec = {
      registry: "cats",
      parent_column: "parent_id",
      child_column: "id",
      relation_type: "parent_of",
      parent_node_type: "Category",
      child_node_type: "Category",
    };
    const records: RegistryRecord[] = [
      makeRecord("cats", "root", { id: "root", parent_id: "" }),
      makeRecord("cats", "child", { id: "child", parent_id: "root" }),
    ];
    const arcs = compileHierarchies({ hierarchies: { tax: spec }, registries: { cats: records } });
    const json = JSON.stringify(arcs);
    const parsed = JSON.parse(json) as OntologyHierarchyArc[];
    expect(parsed).toEqual(arcs);
  });
});

// ---------------------------------------------------------------------------
// buildHierarchyIndex — unit tests
// ---------------------------------------------------------------------------

describe("buildHierarchyIndex", () => {
  it("returns empty index for empty arcs", () => {
    const idx = buildHierarchyIndex([]);
    expect(idx.schema).toBe("graphify_ontology_hierarchies_v1");
    expect(idx.root_ids).toEqual([]);
    expect(idx.depth).toBe(0);
    expect(idx.ancestor_paths).toEqual({});
    expect(idx.cycles).toEqual([]);
  });

  it("builds correct index for a 3-level linear chain", () => {
    // root → mid → leaf
    const arcs: OntologyHierarchyArc[] = [
      { hierarchy_id: "h", parent_id: "root", child_id: "mid", level: 0, type: "parent_of", source: "profile" },
      { hierarchy_id: "h", parent_id: "mid", child_id: "leaf", level: 0, type: "parent_of", source: "profile" },
    ];
    const idx = buildHierarchyIndex(arcs);

    expect(idx.root_ids).toContain("root");
    expect(idx.depth).toBe(2);
    expect(idx.ancestor_paths["root"]).toEqual([]);
    expect(idx.ancestor_paths["mid"]).toEqual(["root"]);
    expect(idx.ancestor_paths["leaf"]).toEqual(["root", "mid"]);
    expect(idx.cycles).toHaveLength(0);
  });

  it("detects a cycle and excludes cycled nodes from paths and roots", () => {
    // a → b → c → a (cycle)
    const arcs: OntologyHierarchyArc[] = [
      { hierarchy_id: "h", parent_id: "a", child_id: "b", level: 0, type: "t", source: "profile" },
      { hierarchy_id: "h", parent_id: "b", child_id: "c", level: 0, type: "t", source: "profile" },
      { hierarchy_id: "h", parent_id: "c", child_id: "a", level: 0, type: "t", source: "profile" },
    ];
    const idx = buildHierarchyIndex(arcs);

    // Must not hang — cycle is detected
    expect(idx.cycles).toHaveLength(1);
    const cycleNodes = new Set(idx.cycles[0]);
    expect(cycleNodes.has("a") || cycleNodes.has("b") || cycleNodes.has("c")).toBe(true);

    // Cycled nodes must be absent from root_ids
    for (const node of ["a", "b", "c"]) {
      expect(idx.root_ids).not.toContain(node);
    }

    // No ancestor_paths for cycled nodes
    for (const node of ["a", "b", "c"]) {
      expect(idx.ancestor_paths[node]).toBeUndefined();
    }
  });

  it("handles a mixed graph with one cycle and one clean tree", () => {
    // clean: root → child
    // cycle: x → y → x
    const arcs: OntologyHierarchyArc[] = [
      { hierarchy_id: "h", parent_id: "root", child_id: "child", level: 0, type: "t", source: "profile" },
      { hierarchy_id: "h", parent_id: "x", child_id: "y", level: 0, type: "t", source: "profile" },
      { hierarchy_id: "h", parent_id: "y", child_id: "x", level: 0, type: "t", source: "profile" },
    ];
    const idx = buildHierarchyIndex(arcs);

    expect(idx.root_ids).toContain("root");
    expect(idx.root_ids).not.toContain("x");
    expect(idx.root_ids).not.toContain("y");

    expect(idx.ancestor_paths["root"]).toEqual([]);
    expect(idx.ancestor_paths["child"]).toEqual(["root"]);
    expect(idx.ancestor_paths["x"]).toBeUndefined();
    expect(idx.ancestor_paths["y"]).toBeUndefined();

    expect(idx.cycles).toHaveLength(1);
    expect(idx.depth).toBe(1);
  });

  it("computes correct depth for a wide tree", () => {
    // root → A → B → C (depth 3)
    // root → X (depth 1)
    const arcs: OntologyHierarchyArc[] = [
      { hierarchy_id: "h", parent_id: "root", child_id: "A", level: 0, type: "t", source: "profile" },
      { hierarchy_id: "h", parent_id: "A", child_id: "B", level: 0, type: "t", source: "profile" },
      { hierarchy_id: "h", parent_id: "B", child_id: "C", level: 0, type: "t", source: "profile" },
      { hierarchy_id: "h", parent_id: "root", child_id: "X", level: 0, type: "t", source: "profile" },
    ];
    const idx = buildHierarchyIndex(arcs);

    expect(idx.depth).toBe(3);
    expect(idx.ancestor_paths["C"]).toEqual(["root", "A", "B"]);
    expect(idx.ancestor_paths["X"]).toEqual(["root"]);
  });

  it("round-trips through JSON cleanly", () => {
    const arcs: OntologyHierarchyArc[] = [
      { hierarchy_id: "h", parent_id: "root", child_id: "child", level: 0, type: "t", source: "profile" },
    ];
    const idx = buildHierarchyIndex(arcs);
    const json = JSON.stringify(idx);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(idx);
  });
});

// ---------------------------------------------------------------------------
// compileOntologyOutputs integration — hierarchy files written / skipped
// ---------------------------------------------------------------------------

describe("compileOntologyOutputs — hierarchy integration", () => {
  const minimalExtraction: Extraction = {
    input_tokens: 0,
    output_tokens: 0,
    nodes: [],
    edges: [],
  };

  it("does NOT write hierarchy files when profile has no hierarchies", () => {
    const outputDir = makeTempDir();
    const profile = makeProfile({});

    compileOntologyOutputs({
      outputDir,
      extraction: minimalExtraction,
      profile,
      config: { enabled: true },
    });

    expect(existsSync(join(outputDir, "hierarchies.json"))).toBe(false);
    expect(existsSync(join(outputDir, "hierarchy-index.json"))).toBe(false);
  });

  it("writes hierarchies.json and hierarchy-index.json when hierarchies declared", () => {
    const outputDir = makeTempDir();

    const spec: NormalizedOntologyHierarchySpec = {
      registry: "cats",
      parent_column: "parent_id",
      child_column: "id",
      relation_type: "parent_of",
      parent_node_type: "Category",
      child_node_type: "Category",
    };
    const profile = makeProfile({ taxonomy: spec });

    const registries: Record<string, RegistryRecord[]> = {
      cats: [
        makeRecord("cats", "root", { id: "root", parent_id: "" }),
        makeRecord("cats", "child1", { id: "child1", parent_id: "root" }),
        makeRecord("cats", "child2", { id: "child2", parent_id: "root" }),
        makeRecord("cats", "grandchild", { id: "grandchild", parent_id: "child1" }),
      ],
    };

    compileOntologyOutputs({
      outputDir,
      extraction: minimalExtraction,
      profile,
      config: { enabled: true },
      registries,
    });

    // Both files must exist
    expect(existsSync(join(outputDir, "hierarchies.json"))).toBe(true);
    expect(existsSync(join(outputDir, "hierarchy-index.json"))).toBe(true);

    // Validate hierarchies.json content
    const arcs = readJson<OntologyHierarchyArc[]>(join(outputDir, "hierarchies.json"));
    expect(arcs).toHaveLength(3); // root→child1, root→child2, child1→grandchild
    expect(arcs.every((a) => a.source === "profile")).toBe(true);
    expect(arcs.every((a) => a.hierarchy_id === "taxonomy")).toBe(true);
    // Increment B — serialized arcs carry the lifecycle fields.
    expect(arcs.every((a) => a.status === "reference")).toBe(true);
    expect(arcs.every((a) => a.confidence === 1.0)).toBe(true);

    // Validate hierarchy-index.json content
    const idx = readJson<{ schema: string; root_ids: string[]; depth: number; ancestor_paths: Record<string, string[]>; cycles: string[][] }>(
      join(outputDir, "hierarchy-index.json"),
    );
    expect(idx.schema).toBe("graphify_ontology_hierarchies_v1");
    expect(idx.root_ids).toContain("root");
    expect(idx.depth).toBe(2);
    expect(idx.ancestor_paths["grandchild"]).toEqual(["root", "child1"]);
    expect(idx.cycles).toHaveLength(0);
  });

  it("adds hierarchy files to manifest when they exist", () => {
    const outputDir = makeTempDir();

    const spec: NormalizedOntologyHierarchySpec = {
      registry: "cats",
      parent_column: "parent_id",
      child_column: "id",
      relation_type: "parent_of",
      parent_node_type: "Category",
      child_node_type: "Category",
    };
    const profile = makeProfile({ taxonomy: spec });

    const registries: Record<string, RegistryRecord[]> = {
      cats: [
        makeRecord("cats", "root", { id: "root", parent_id: "" }),
        makeRecord("cats", "child", { id: "child", parent_id: "root" }),
      ],
    };

    compileOntologyOutputs({
      outputDir,
      extraction: minimalExtraction,
      profile,
      config: { enabled: true },
      registries,
    });

    const manifest = readJson<Record<string, unknown>>(join(outputDir, "manifest.json"));
    expect(manifest.hierarchies_path).toBeDefined();
    expect(manifest.hierarchy_index_path).toBeDefined();
  });

  it("returns hierarchyArcCount in result when hierarchies present", () => {
    const outputDir = makeTempDir();

    const spec: NormalizedOntologyHierarchySpec = {
      registry: "cats",
      parent_column: "parent_id",
      child_column: "id",
      relation_type: "parent_of",
      parent_node_type: "Category",
      child_node_type: "Category",
    };
    const profile = makeProfile({ taxonomy: spec });

    const registries: Record<string, RegistryRecord[]> = {
      cats: [
        makeRecord("cats", "root", { id: "root", parent_id: "" }),
        makeRecord("cats", "child", { id: "child", parent_id: "root" }),
      ],
    };

    const result = compileOntologyOutputs({
      outputDir,
      extraction: minimalExtraction,
      profile,
      config: { enabled: true },
      registries,
    });

    expect(result.hierarchyArcCount).toBe(1);
  });

  it("does not write hierarchy files when compilation is disabled", () => {
    const outputDir = makeTempDir();
    const spec: NormalizedOntologyHierarchySpec = {
      registry: "cats",
      parent_column: "parent_id",
      child_column: "id",
      relation_type: "parent_of",
      parent_node_type: "Category",
      child_node_type: "Category",
    };
    const profile = makeProfile({ taxonomy: spec });

    compileOntologyOutputs({
      outputDir,
      extraction: minimalExtraction,
      profile,
      config: { enabled: false },
    });

    expect(existsSync(join(outputDir, "hierarchies.json"))).toBe(false);
    expect(existsSync(join(outputDir, "hierarchy-index.json"))).toBe(false);
  });
});
