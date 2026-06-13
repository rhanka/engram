/**
 * GET /api/ontology/entity/<id> — Level-2 citations passthrough.
 *
 * The entity route returns `buildEntitySidecar` output verbatim. This pins that
 * the sidecar's new `citations: { count, citations }` field (the lazily-served
 * full per-entity list, SPEC_CITATIONS.md) reaches the HTTP response for a hub
 * id, and is absent when the co-derived store is missing.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Graph from "graphology";

import { handleOntologyStudioRequest } from "../src/ontology-studio.js";
import { writeOntologyWriteFixture } from "./helpers/ontology-write-fixture.js";
import { aggregateCitations, writeCitationsSidecar } from "../src/citations.js";
import { __resetCitationsSidecarCache, __resetGraphDescriptionCache } from "../src/studio-assets.js";
import type { OntologyCitation } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(() => {
  __resetGraphDescriptionCache();
  __resetCitationsSidecarCache();
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = require("node:fs").mkdtempSync(join(tmpdir(), "graphify-entity-cite-"));
  tempDirs.push(dir);
  return dir;
}

/** Emit graph.json + ontology/citations.json into stateDir via the engine. */
function seedHub(stateDir: string, hubCitations: OntologyCitation[]): number {
  mkdirSync(join(stateDir, "ontology"), { recursive: true });
  const G = new Graph({ type: "directed" });
  G.addNode("hub", { label: "Sherlock", citations: hubCitations.map((c) => ({ ...c })) });
  G.addNode("leaf", { label: "Watson" });
  const map = aggregateCitations(G);
  const nodes = G.mapNodes((id, attrs) => ({ id, ...attrs }));
  writeFileSync(join(stateDir, "graph.json"), JSON.stringify({ nodes, edges: [] }));
  writeCitationsSidecar(stateDir, map, G);
  return map.hub!.count;
}

describe("GET /api/ontology/entity/<id> citations", () => {
  it("includes the full Level-2 citations list for a hub id", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir());
    const cites: OntologyCitation[] = Array.from({ length: 12 }, (_, i) => ({
      source_file: `work_${i}.txt`,
      section: `ch${i}`,
      page: i + 1,
    }));
    const count = seedHub(fixture.stateDir, cites);

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/entity/hub",
    );

    expect(result.status).toBe(200);
    const payload = JSON.parse(result.body);
    expect(payload.id).toBe("hub");
    expect(payload.citations).toBeDefined();
    expect(payload.citations.count).toBe(count);
    expect(count).toBe(12);
    expect(payload.citations.citations).toHaveLength(12);
  });

  it("omits citations when the co-derived store is absent", () => {
    const fixture = writeOntologyWriteFixture(makeTempDir());
    writeFileSync(
      join(fixture.stateDir, "graph.json"),
      JSON.stringify({ nodes: [{ id: "hub", label: "Sherlock" }], edges: [] }),
    );

    const result = handleOntologyStudioRequest(
      { profileStatePath: fixture.profileStatePath },
      "GET",
      "/api/ontology/entity/hub",
    );

    expect(result.status).toBe(200);
    const payload = JSON.parse(result.body);
    expect(payload.citations).toBeUndefined();
  });
});
