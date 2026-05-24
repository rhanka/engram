import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { buildReviewDelta } from "../src/review.js";

// Port of upstream safishamsi 1494874 — when the extractor emits explicit
// `re_exports` edges (Track F F-0816-M2 S-2), review-delta barrel propagation
// must follow those edges *regardless* of the file's basename. The
// pre-existing filename-convention heuristic (index.ts, __init__.py,
// mod.rs, lib.rs, ...) remains a fallback for graphs built before this port
// (Track F F-0816-Opt-Affected S-2).
function nonBarrelNameGraph(): Graph {
  const G = new Graph({ type: "directed" });
  for (const f of [
    "src/utils/foo.ts",
    "src/utils/bar.ts",
    // NOT named index.ts / __init__.py / mod.rs / lib.rs — the filename
    // heuristic would reject this as a barrel candidate.
    "src/utils/entry.ts",
    "src/consumer.ts",
  ]) {
    G.addNode(f, { label: f, source_file: f, kind: "File" });
  }
  // entry.ts explicitly re-exports symbols from foo.ts and bar.ts.
  G.addDirectedEdge("src/utils/entry.ts", "src/utils/foo.ts", {
    relation: "re_exports",
    confidence: "EXTRACTED",
    context: "re-export",
  });
  G.addDirectedEdge("src/utils/entry.ts", "src/utils/bar.ts", {
    relation: "re_exports",
    confidence: "EXTRACTED",
    context: "re-export",
  });
  // consumer imports entry.ts (the barrel).
  G.addDirectedEdge("src/consumer.ts", "src/utils/entry.ts", {
    relation: "imports",
    confidence: "EXTRACTED",
  });
  return G;
}

describe("affected-flows prefers explicit re_exports edges over filename heuristic", () => {
  it("non-conventional barrel name still propagates when re_exports edges exist", () => {
    const delta = buildReviewDelta(nonBarrelNameGraph(), ["src/utils/foo.ts"], {
      maxNodes: 50,
      depth: 1,
    });
    // foo is the changed file; entry.ts is the explicit re-exporter; consumer
    // imports entry.ts. All three must surface at depth 1.
    expect(delta.impacted_files).toContain("src/utils/foo.ts");
    expect(delta.impacted_files).toContain("src/utils/entry.ts");
    expect(delta.impacted_files).toContain("src/consumer.ts");
  });

  it("re_exports edge alone (no filename match) does not pull unrelated files", () => {
    const G = nonBarrelNameGraph();
    G.addNode("src/other.ts", { label: "other.ts", source_file: "src/other.ts", kind: "File" });
    // unrelated import path
    G.addDirectedEdge("src/other.ts", "src/utils/bar.ts", {
      relation: "imports",
      confidence: "EXTRACTED",
    });

    const delta = buildReviewDelta(G, ["src/utils/foo.ts"], {
      maxNodes: 50,
      depth: 1,
    });
    expect(delta.impacted_files).not.toContain("src/other.ts");
  });

  it("graphs built before the port (no re_exports edges) still propagate via filename fallback", () => {
    // Same shape, but using the legacy imports_from edges and an
    // index.ts-named barrel — the fallback path must still fire.
    const G = new Graph({ type: "directed" });
    for (const f of [
      "src/utils/foo.ts",
      "src/utils/index.ts",
      "src/consumer.ts",
    ]) {
      G.addNode(f, { label: f, source_file: f, kind: "File" });
    }
    G.addDirectedEdge("src/utils/index.ts", "src/utils/foo.ts", {
      relation: "imports_from",
      confidence: "EXTRACTED",
    });
    G.addDirectedEdge("src/consumer.ts", "src/utils/index.ts", {
      relation: "imports",
      confidence: "EXTRACTED",
    });

    const delta = buildReviewDelta(G, ["src/utils/foo.ts"], {
      maxNodes: 50,
      depth: 1,
    });
    expect(delta.impacted_files).toContain("src/utils/index.ts");
    expect(delta.impacted_files).toContain("src/consumer.ts");
  });
});
