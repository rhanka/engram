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
//
// NIT — fixture topology:
//   processes.csv  = MONO-ROOT demonstration fixture (super-root "AM" owns all
//                    sub-domains). This is a simplified demo shape — the real
//                    process-std-AM has 17 independent L0 roots (AM01..AM90) with no
//                    synthetic super-root.  Do NOT interpret this fixture as
//                    implying that process-std-AM has a single top-level node in
//                    production; forest.csv is the representative topology.
//
//   forest.csv     = REPRESENTATIVE MULTI-ROOT fixture (4 PROCESS_STD roots AM01/AM03/
//                    AM06/AM08 + 1 orphan parent).  This is the correct model:
//                    the real process-std-AM has 17 roots (no super-node).  Any
//                    consumer that expects a single root is incorrect.
//
// DR-1 / DR-2 (WP4-B review): additional forest fixture tests verify:
//   - Multi-root forest (N root_ids, no synthetic super-root)
//   - Orphan tolerance: node with missing parent_id → treated as extra root
//   - Pointed-code deep branch (AM0104.01.10.02 at L4, depth=4)
//   - Level contract: node level = ancestor_paths[node].length
// ---------------------------------------------------------------------------

const fixtureRoot = join(process.cwd(), "tests", "fixtures", "process-std-am");
const profilePath = join(fixtureRoot, "graphify", "ontology-profile.yaml");
const registryPath = join(fixtureRoot, "references", "processes.csv");
const forestRegistryPath = join(fixtureRoot, "references", "forest.csv");

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

/** Load the multi-root forest fixture records. */
function loadForestRecords(): RegistryRecord[] {
  const profile = loadOntologyProfile(profilePath);
  const spec: NormalizedOntologyRegistrySpec = {
    ...profile.registries.processes,
    bound_source_path: forestRegistryPath,
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

/** Run the full compile pipeline against the forest fixture. */
function compileForestFixture(): { arcs: OntologyHierarchyArc[]; index: OntologyHierarchyIndex } {
  const profile = loadOntologyProfile(profilePath);
  const records = loadForestRecords();
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

// ---------------------------------------------------------------------------
// DR-1 — Multi-root forest fixture (G-A)
//
// The real process-std-AM has 17 L0 roots (AM01..AM90) with NO synthetic super-root.
// This fixture uses 4 roots (AM01, AM03, AM06, AM08) to validate that
// buildHierarchyIndex correctly emits N root_ids without a super-node.
//
// Also validates orphan tolerance: ORPHAN01 references MISSING_PARENT which is
// absent from the registry.  The arc is NOT dropped — MISSING_PARENT becomes an
// extra root_id and ORPHAN01 gets an ancestor_path of ["MISSING_PARENT"].
// ---------------------------------------------------------------------------

describe("process-std-AM forest fixture — multi-root forest (DR-1)", () => {
  it("compiles to the expected arcs (forest-hierarchies.json)", () => {
    const { arcs } = compileForestFixture();
    const expected = readJson<OntologyHierarchyArc[]>(join(fixtureRoot, "expected", "forest-hierarchies.json"));
    expect(arcs).toEqual(expected);
  });

  it("compiles to the expected index (forest-hierarchy-index.json)", () => {
    const { index } = compileForestFixture();
    const expected = readJson<OntologyHierarchyIndex>(join(fixtureRoot, "expected", "forest-hierarchy-index.json"));
    expect(index).toEqual(expected);
  });

  it("root_ids has 5 entries (4 PROCESS_STD roots + 1 orphan parent), not 1", () => {
    const { index } = compileForestFixture();
    // Demonstrates that the real multi-root topology (AM01/AM03/AM06/AM08) is
    // handled correctly — root_ids.length > 1, no synthetic super-node.
    expect(index.root_ids.length).toBeGreaterThanOrEqual(4);
    expect(index.root_ids).toContain("AM01");
    expect(index.root_ids).toContain("AM03");
    expect(index.root_ids).toContain("AM06");
    expect(index.root_ids).toContain("AM08");
  });

  it("treats orphan node (MISSING_PARENT→ORPHAN01) as extra root, not dropped", () => {
    const { index } = compileForestFixture();
    // MISSING_PARENT is not in the registry but appears as parent_id in an arc.
    // buildHierarchyIndex must NOT drop the arc — it surfaces MISSING_PARENT
    // as a root_id and ORPHAN01 as its child.
    expect(index.root_ids).toContain("MISSING_PARENT");
    expect(index.ancestor_paths["ORPHAN01"]).toEqual(["MISSING_PARENT"]);
    // ORPHAN01 is reachable — it appears in ancestor_paths
    expect(Object.keys(index.ancestor_paths)).toContain("ORPHAN01");
  });

  it("has no cycles", () => {
    const { index } = compileForestFixture();
    expect(index.cycles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DR-2 — Pointed-code deep branch (G-B)
//
// The real process-std-AM reaches L4 with dot-separated codes (AM9090.03.01.04).
// This fixture includes the chain:
//   AM01 → AM0104 → AM0104.01 → AM0104.01.10 → AM0104.01.10.02
// (depth=4, 5 levels L0..L4)
//
// Level-derivation contract (acté en revue):
//   node level = ancestor_paths[node].length
//   L0 root  → 0, L1 → 1, L2 → 2, L3 → 3, L4 → 4
// ---------------------------------------------------------------------------

describe("process-std-AM forest fixture — pointed-code L4 depth (DR-2)", () => {
  it("depth is 4 (5 levels L0..L4)", () => {
    const { index } = compileForestFixture();
    expect(index.depth).toBe(4);
  });

  it("computes full ancestor chain for L4 pointed-code node", () => {
    const { index } = compileForestFixture();
    // AM0104.01.10.02 is at L4 with dotted code
    expect(index.ancestor_paths["AM0104.01.10.02"]).toEqual([
      "AM01",
      "AM0104",
      "AM0104.01",
      "AM0104.01.10",
    ]);
  });

  it("level contract: node level == ancestor_paths[node].length for all depths", () => {
    const { index } = compileForestFixture();
    // L0 roots
    expect(index.ancestor_paths["AM01"].length).toBe(0);
    // L1
    expect(index.ancestor_paths["AM0104"].length).toBe(1);
    // L2 (pointed code)
    expect(index.ancestor_paths["AM0104.01"].length).toBe(2);
    // L3 (pointed code)
    expect(index.ancestor_paths["AM0104.01.10"].length).toBe(3);
    // L4 (pointed code)
    expect(index.ancestor_paths["AM0104.01.10.02"].length).toBe(4);
  });

  it("arc parent_ids resolve correctly on dotted-code segments", () => {
    const { arcs } = compileForestFixture();
    // Verify the intermediate pointed-code arcs are present
    expect(arcs.some((a) => a.parent_id === "AM0104" && a.child_id === "AM0104.01")).toBe(true);
    expect(arcs.some((a) => a.parent_id === "AM0104.01" && a.child_id === "AM0104.01.10")).toBe(true);
    expect(arcs.some((a) => a.parent_id === "AM0104.01.10" && a.child_id === "AM0104.01.10.02")).toBe(true);
  });
});
