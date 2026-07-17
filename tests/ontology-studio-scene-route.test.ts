import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleOntologyStudioRequest } from "../src/ontology-studio.js";
import { buildStudioScene } from "../src/studio-scene.js";
import { attachLayoutPositions } from "../src/graph-layout.js";
import { writeOntologyWriteFixture } from "./helpers/ontology-write-fixture.js";
import { clearClassHierarchiesEmitterCache } from "../src/ontology-class-hierarchies-emitter.js";
import { registryClassNodeId } from "../src/ontology-class-hierarchies.js";
import type {
  NormalizedClassHierarchySpec,
  NormalizedOntologyHierarchySpec,
  RegistryRecord,
} from "../src/types.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-studio-scene-"));
  tempDirs.push(dir);
  return dir;
}

const GRAPH_FIXTURE = {
  nodes: [
    { id: "n1", label: "Sherlock", node_type: "Character", community: 1, community_name: "Detectives" },
    { id: "n2", label: "Watson", node_type: "Character", community: 1, community_name: "Detectives" },
    { id: "n3", label: "Moriarty", node_type: "Character", community: 2, community_name: "Villains" },
    { id: "n4", title: "The Final Problem", node_type: "Work", community: 3 },
    { id: "iso", node_type: "Object" },
  ],
  links: [
    { source: "n1", target: "n2", relation: "assists", confidence: "EXTRACTED" },
    { source: "n1", target: "n3", relation: "opposes", confidence: "INFERRED" },
    { source: "n1", target: "n4", relation: "appears_in", confidence: "EXTRACTED" },
  ],
};

function writeGraph(stateDir: string, graph: unknown): void {
  writeFileSync(join(stateDir, "graph.json"), JSON.stringify(graph, null, 2), "utf-8");
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  // The live route + emitter both cache on graph identity; per-temp-dir keys
  // already isolate tests, but clear the emitter cache to be safe across fixtures
  // that reuse the same profile hash.
  clearClassHierarchiesEmitterCache();
});

describe("GET /api/ontology/scene.json", () => {
  it("returns buildStudioScene(graph.json) as JSON", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir());
    writeGraph(fixture.stateDir, GRAPH_FIXTURE);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/scene.json",
    );

    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/json; charset=utf-8");

    const payload = JSON.parse(result.body);
    // The route output is buildStudioScene of the on-disk graph, with layout
    // positions pre-computed and pinned (deterministic, so this matches exactly).
    expect(payload).toEqual(attachLayoutPositions(buildStudioScene(GRAPH_FIXTURE)));
    // Every node carries finite, pinned coordinates.
    for (const node of payload.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(node.fx).toBe(node.x);
      expect(node.fy).toBe(node.y);
    }
    expect(payload.stats.nodeCount).toBe(5);
    expect(payload.stats.edgeCount).toBe(3);
    expect(payload.stats.weakEdgeCount).toBe(1); // the INFERRED edge
    // Communities 1/2/3 each have a live (degree>0) member; `iso` has no
    // community and no edge, so it is excluded.
    expect(payload.stats.communityCount).toBe(3);
  });

  it("does not alter the existing graph.json route", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir());
    writeGraph(fixture.stateDir, GRAPH_FIXTURE);

    const graphResult = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/graph.json",
    );
    expect(graphResult.status).toBe(200);
    expect(JSON.parse(graphResult.body)).toEqual(GRAPH_FIXTURE);
  });

  it("404s when graph.json is absent", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir());
    // No graph.json written.
    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/scene.json",
    );
    expect(result.status).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: "graph.json not found" });
  });
});

describe("GET /api/ontology/search-index.json (work-stream C)", () => {
  it("serves the v1 search index the SPA Answer view runs over", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir());
    writeGraph(fixture.stateDir, GRAPH_FIXTURE);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/search-index.json",
    );

    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/json; charset=utf-8");

    const payload = JSON.parse(result.body);
    expect(payload.schema).toBe("graphify_search_index_v1");
    // Self-contained substrate: docs + BM25 postings + CSR adjacency ride inline,
    // so the in-browser BM25 + PPR needs neither graph.json nor a second fetch.
    expect(Array.isArray(payload.docs)).toBe(true);
    expect(payload.docs.length).toBe(GRAPH_FIXTURE.nodes.length);
    expect(payload.bm25).toBeDefined();
    expect(payload.adjacency).toBeDefined();
  });

  it("404s when graph.json is absent", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir());
    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/search-index.json",
    );
    expect(result.status).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: "graph.json not found" });
  });
});

describe("GET /api/ontology/class-hierarchies.json", () => {
  // Hand-authored taxonomy: Thing → Person, Person gathers `Character` nodes.
  const TAXONOMY: Record<string, NormalizedClassHierarchySpec> = {
    tax: {
      relation_type: "subclass_of",
      membership_relation_type: "has_instance",
      classes: {
        Thing: { parent: null, label: null, member_node_types: [] },
        Person: { parent: "Thing", label: null, member_node_types: ["Character"] },
      },
    },
  };

  // Registry-bound process tree (parent_id column) + its dataprep-normalized rows.
  const HIERARCHIES: Record<string, NormalizedOntologyHierarchySpec> = {
    proc_tree: {
      registry: "procs",
      parent_column: "parent_id",
      child_column: "id",
      relation_type: "parent_process",
      parent_node_type: "Proc",
      child_node_type: "Proc",
    },
  };
  const PROC_REGISTRY: RegistryRecord[] = [
    { registryId: "procs", id: "A", label: "Root A", aliases: [], nodeType: "Proc", sourceFile: "/p.csv", raw: { id: "A", parent_id: "" } },
    { registryId: "procs", id: "A.1", label: "Child A1", aliases: [], nodeType: "Proc", sourceFile: "/p.csv", raw: { id: "A.1", parent_id: "A" } },
  ];
  const PROC_GRAPH = {
    nodes: [
      { id: "registry_procs_A", node_type: "Proc", registry_record_id: "A" },
      { id: "registry_procs_A_1", node_type: "Proc", registry_record_id: "A.1" },
    ],
    links: [],
  };

  it("serves the DERIVED artifact for a registry-bound hierarchy (no class block)", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir(), {
      hierarchies: HIERARCHIES,
      registries: { procs: PROC_REGISTRY },
    });
    writeGraph(fixture.stateDir, PROC_GRAPH);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/class-hierarchies.json",
    );

    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/json; charset=utf-8");
    const payload = JSON.parse(result.body);
    expect(payload.schema).toBe("graphify_ontology_class_hierarchies_v1");
    const tree = payload.hierarchies.proc_tree;
    // Two classes, nested A → A.1, member_ids joined by registry_record_id.
    expect(tree.classes_by_id[registryClassNodeId("proc_tree", "A")].child_ids).toEqual([
      registryClassNodeId("proc_tree", "A.1"),
    ]);
    expect(tree.classes_by_id[registryClassNodeId("proc_tree", "A.1")].member_ids).toEqual([
      "registry_procs_A_1",
    ]);
  });

  it("serves the hand-authored class_hierarchies artifact", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir(), { classHierarchies: TAXONOMY });
    writeGraph(fixture.stateDir, GRAPH_FIXTURE);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/class-hierarchies.json",
    );

    expect(result.status).toBe(200);
    const payload = JSON.parse(result.body);
    expect(payload.hierarchies.tax.classes_by_id["class:Person"].member_ids).toEqual([
      "n1",
      "n2",
      "n3",
    ]);
  });

  it("404s (client-tolerated) when the profile declares neither source", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir());
    writeGraph(fixture.stateDir, GRAPH_FIXTURE);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/class-hierarchies.json",
    );
    expect(result.status).toBe(404);
    expect(JSON.parse(result.body).error).toMatch(/class_hierarchies|registry/);
  });

  it("404s when graph.json is absent", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir(), {
      hierarchies: HIERARCHIES,
      registries: { procs: PROC_REGISTRY },
    });
    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/class-hierarchies.json",
    );
    expect(result.status).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: "graph.json not found" });
  });
});
