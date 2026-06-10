import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { compileHierarchies, buildHierarchyIndex } from "../src/ontology-hierarchies.js";
import { loadOntologyProfile } from "../src/ontology-profile.js";
import { loadProfileRegistry } from "../src/profile-registry.js";
import type {
  NormalizedOntologyRegistrySpec,
  OntologyHierarchyArc,
  OntologyHierarchyIndex,
  RegistryRecord,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// process-std-AM representative fixture (increment B).
//
// Validates that the profile-declared `am_process_tree` hierarchy compiles to
// the expected arcs + index: root detection (AM), 3 levels, ancestor paths,
// and the increment-B lifecycle fields (status:"reference", confidence:1.0).
//
// The `expected/*.json` files are produced by actually running the compile
// pipeline (see scripts/regen note in the fixture), so this test is a true
// round-trip assertion, not a hand-fabricated snapshot.
// ---------------------------------------------------------------------------

const fixtureRoot = join(process.cwd(), "tests", "fixtures", "process-std-am");
const profilePath = join(fixtureRoot, "graphify", "ontology-profile.yaml");
const registryPath = join(fixtureRoot, "references", "processes.csv");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/** Load the fixture registry records, binding the spec to the fixture CSV. */
function loadFixtureRecords(): RegistryRecord[] {
  const profile = loadOntologyProfile(profilePath);
  const spec: NormalizedOntologyRegistrySpec = {
    ...profile.registries.processes,
    bound_source_path: registryPath,
  };
  return loadProfileRegistry("processes", spec);
}

/** Run the full compile pipeline against the fixture. */
function compileFixture(): { arcs: OntologyHierarchyArc[]; index: OntologyHierarchyIndex } {
  const profile = loadOntologyProfile(profilePath);
  const records = loadFixtureRecords();
  const arcs = compileHierarchies({
    hierarchies: profile.hierarchies,
    registries: { processes: records },
  });
  const index = buildHierarchyIndex(arcs);
  return { arcs, index };
}

describe("process-std-AM fixture — hierarchy compile", () => {
  it("compiles the AM process tree to the expected arcs", () => {
    const { arcs } = compileFixture();
    const expected = readJson<OntologyHierarchyArc[]>(join(fixtureRoot, "expected", "hierarchies.json"));
    expect(arcs).toEqual(expected);
  });

  it("compiles the AM process tree to the expected index", () => {
    const { index } = compileFixture();
    const expected = readJson<OntologyHierarchyIndex>(join(fixtureRoot, "expected", "hierarchy-index.json"));
    expect(index).toEqual(expected);
  });

  it("detects AM as the single root", () => {
    const { index } = compileFixture();
    expect(index.root_ids).toEqual(["AM"]);
  });

  it("spans at least 3 levels (depth 2)", () => {
    const { index } = compileFixture();
    expect(index.depth).toBe(2);
  });

  it("computes ancestor paths for grandchildren", () => {
    const { index } = compileFixture();
    expect(index.ancestor_paths["AM"]).toEqual([]);
    expect(index.ancestor_paths["AM01"]).toEqual(["AM"]);
    expect(index.ancestor_paths["AM0101"]).toEqual(["AM", "AM01"]);
    expect(index.ancestor_paths["AM0104"]).toEqual(["AM", "AM01"]);
    expect(index.ancestor_paths["AM0201"]).toEqual(["AM", "AM02"]);
  });

  it("has no cycles", () => {
    const { index } = compileFixture();
    expect(index.cycles).toEqual([]);
  });

  it("emits 6 arcs (one per non-root process)", () => {
    const { arcs } = compileFixture();
    expect(arcs).toHaveLength(6);
  });

  it("tags every arc as a reference fact with confidence 1.0 (increment B)", () => {
    const { arcs } = compileFixture();
    for (const arc of arcs) {
      expect(arc.source).toBe("profile");
      expect(arc.status).toBe("reference");
      expect(arc.confidence).toBe(1.0);
      expect(arc.type).toBe("parent_process_of");
      expect(arc.hierarchy_id).toBe("am_process_tree");
    }
  });
});
