import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleOntologyStudioRequest } from "../src/ontology-studio.js";
import { buildStudioScene } from "../src/studio-scene.js";
import { attachLayoutPositions } from "../src/graph-layout.js";
import { writeOntologyWriteFixture } from "./helpers/ontology-write-fixture.js";
import type { NormalizedClassHierarchySpec } from "../src/types.js";

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

describe("GET /api/ontology/class-hierarchies.json (EVOL 2.c)", () => {
  // A minimal normalized class taxonomy: Thing → Person, Person gathers the
  // graph's `Character` node_type as instances.
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

  it("serves the emitClassHierarchies artifact when the profile declares a block", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir(), { classHierarchies: TAXONOMY });
    writeGraph(fixture.stateDir, GRAPH_FIXTURE);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/class-hierarchies.json",
    );

    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/json; charset=utf-8");

    const payload = JSON.parse(result.body);
    expect(payload.schema).toBe("graphify_ontology_class_hierarchies_v1");
    // Character-typed graph nodes (n1..n3) are gathered under the Person leaf.
    expect(payload.hierarchies.tax.classes_by_id["class:Person"].member_ids).toEqual([
      "n1",
      "n2",
      "n3",
    ]);

    // A GET must be side-effect-free: the route calls the PURE builder, so it
    // writes NO class-hierarchies.json into the state dir's ontology/ (the old
    // writing emitter did — this guards against a regression that 500s on a
    // read-only FS and can dirty a tracked worktree).
    expect(
      existsSync(join(fixture.stateDir, "ontology", "class-hierarchies.json")),
    ).toBe(false);
  });

  it("404s (client-tolerated) when the profile has no class_hierarchies block", () => {
    // The default fixture carries no block — mirrors the static export writing
    // no file; the SPA's fetchClassHierarchies falls back to null.
    const fixture = writeOntologyWriteFixture(makeTempDir());
    writeGraph(fixture.stateDir, GRAPH_FIXTURE);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/class-hierarchies.json",
    );
    expect(result.status).toBe(404);
    expect(JSON.parse(result.body).error).toMatch(/class_hierarchies/);
  });

  it("404s when graph.json is absent", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir(), { classHierarchies: TAXONOMY });
    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/class-hierarchies.json",
    );
    expect(result.status).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: "graph.json not found" });
  });
});
