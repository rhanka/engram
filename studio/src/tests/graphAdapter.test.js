import { describe, expect, it } from "vitest";

import {
  buildScene,
  graphEdges,
  groupCounts,
  isStrongEdge,
  nodeCommunity,
  nodeGroup,
  nodeLabel,
  nodeSourcePath,
  nodeType,
  relationRowsFor,
} from "../lib/graphAdapter.js";

const FIXTURE = {
  nodes: [
    {
      id: "character_sherlock_holmes",
      label: "Sherlock Holmes",
      type: "Character",
      community: 0,
      community_name: "Sherlock Holmes anthology",
      source_file: "corpus/a-study-in-scarlet/text.txt",
      source_location: "part1",
      status: "validated",
      confidence: "EXTRACTED",
    },
    {
      id: "work_study_in_scarlet",
      label: "A Study in Scarlet",
      type: "Work",
      community: 0,
      community_name: "Sherlock Holmes anthology",
    },
    {
      // No label/community; should fall back to id + type.
      id: "place_baker_street",
      type: "Place",
    },
  ],
  links: [
    {
      source: "character_sherlock_holmes",
      target: "work_study_in_scarlet",
      relation: "appears_in",
      confidence: "EXTRACTED",
    },
    {
      source: "character_sherlock_holmes",
      target: "place_baker_street",
      relation: "lives_at",
      confidence: "INFERRED",
    },
    {
      // Dangling edge: target does not exist, must be dropped.
      source: "character_sherlock_holmes",
      target: "ghost_node",
      relation: "haunts",
    },
  ],
};

describe("graphAdapter mapping", () => {
  it("accepts both links and edges keys", () => {
    expect(graphEdges({ links: [{ source: "a", target: "b" }] })).toHaveLength(1);
    expect(graphEdges({ edges: [{ source: "a", target: "b" }] })).toHaveLength(1);
    expect(graphEdges(null)).toEqual([]);
  });

  it("resolves labels with id fallback", () => {
    expect(nodeLabel(FIXTURE.nodes[0])).toBe("Sherlock Holmes");
    expect(nodeLabel(FIXTURE.nodes[2])).toBe("place_baker_street");
  });

  it("derives group from community first, then type", () => {
    expect(nodeGroup(FIXTURE.nodes[0])).toBe("Sherlock Holmes anthology");
    expect(nodeGroup(FIXTURE.nodes[2])).toBe("Place");
    expect(nodeGroup({ id: "x", community: 4 })).toBe("community:4");
    expect(nodeGroup({ id: "x" })).toBeUndefined();
  });

  it("maps strong/weak from confidence", () => {
    expect(isStrongEdge({ confidence: "EXTRACTED" })).toBe(true);
    expect(isStrongEdge({})).toBe(true); // default EXTRACTED
    expect(isStrongEdge({ confidence: "INFERRED" })).toBe(false);
  });

  it("builds a scene dropping dangling edges and flagging weak links", () => {
    const scene = buildScene(FIXTURE);
    expect(scene.nodes).toHaveLength(3);
    // ghost_node edge dropped, 2 valid edges remain.
    expect(scene.edges).toHaveLength(2);
    const weak = scene.edges.find((e) => e.relation === "lives_at");
    expect(weak.weak).toBe(true);
    const strong = scene.edges.find((e) => e.relation === "appears_in");
    expect(strong.weak).toBeUndefined();
    expect(scene.stats.weakEdgeCount).toBe(1);
  });

  it("scales node weight by degree (hub bigger than leaf)", () => {
    const scene = buildScene(FIXTURE);
    const hub = scene.nodes.find((n) => n.id === "character_sherlock_holmes");
    const leaf = scene.nodes.find((n) => n.id === "work_study_in_scarlet");
    expect(hub.weight).toBeGreaterThan(leaf.weight);
  });

  it("hides weak links when showWeakLinks=false", () => {
    const scene = buildScene(FIXTURE, { showWeakLinks: false });
    expect(scene.edges).toHaveLength(1);
    expect(scene.edges[0].relation).toBe("appears_in");
  });

  it("nodes always carry a group when known so tones stay stable", () => {
    const scene = buildScene(FIXTURE);
    expect(scene.nodes[0].group).toBe("Sherlock Holmes anthology");
    expect(scene.nodes[2].group).toBe("Place");
  });
});

describe("graphAdapter relations", () => {
  it("builds out/in relation rows with resolved other-labels", () => {
    const rows = relationRowsFor("work_study_in_scarlet", FIXTURE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      direction: "in",
      relation: "appears_in",
      otherId: "character_sherlock_holmes",
      otherLabel: "Sherlock Holmes",
    });
  });

  it("returns out direction for source-side edges", () => {
    const rows = relationRowsFor("character_sherlock_holmes", FIXTURE);
    // appears_in (out), lives_at (out), haunts->ghost (out, label falls back to id)
    expect(rows.every((r) => r.direction === "out")).toBe(true);
    expect(rows.map((r) => r.relation).sort()).toEqual(["appears_in", "haunts", "lives_at"]);
  });
});

describe("graphAdapter helpers", () => {
  it("derives community + source path", () => {
    expect(nodeCommunity(FIXTURE.nodes[0])).toBe("Sherlock Holmes anthology");
    expect(nodeCommunity({ community: 3 })).toBe("Community 3");
    expect(nodeSourcePath(FIXTURE.nodes[0])).toBe(
      "corpus/a-study-in-scarlet/text.txt:part1",
    );
    expect(nodeSourcePath({})).toBeNull();
  });

  it("groups nodes by type and community with counts", () => {
    const byType = groupCounts(FIXTURE, nodeType);
    expect(byType).toContainEqual({ key: "Character", count: 1 });
    expect(byType).toContainEqual({ key: "Work", count: 1 });
    const byComm = groupCounts(FIXTURE, nodeCommunity);
    expect(byComm).toContainEqual({ key: "Sherlock Holmes anthology", count: 2 });
  });
});

describe("citationsByFile (SVELTE-2)", () => {
  it("groups citations by source file with passages", async () => {
    const { citationsByFile } = await import("../lib/graphAdapter.js");
    const node = {
      id: "n1",
      source_file: "a.txt",
      citations: [
        { source_file: "a.txt", section: "ch1", quote: "alpha" },
        { source_file: "a.txt", section: "ch2" },
        { source_file: "b.txt", section: "intro", quote: "beta" },
      ],
    };
    const groups = citationsByFile(node);
    expect(groups.length).toBe(2);
    const a = groups.find((g) => g.file === "a.txt");
    expect(a.count).toBe(2);
    expect(a.passages[0].quote).toBe("alpha");
    expect(a.passages[1].section).toBe("ch2");
    expect(a.passages[1].quote).toBe(null);
    const b = groups.find((g) => g.file === "b.txt");
    expect(b.count).toBe(1);
  });

  it("falls back to node.source_file when a citation has none, and handles empty", async () => {
    const { citationsByFile } = await import("../lib/graphAdapter.js");
    expect(citationsByFile({ citations: [] })).toEqual([]);
    const g = citationsByFile({ source_file: "x.txt", citations: [{ section: "s" }] });
    expect(g[0].file).toBe("x.txt");
  });
});

describe("candidateSubgraph (SVELTE-7)", () => {
  it("keeps both anchors + 1-hop neighbours and their internal edges", async () => {
    const { candidateSubgraph } = await import("../lib/graphAdapter.js");
    const graph = {
      nodes: [{ id: "A" }, { id: "B" }, { id: "n1" }, { id: "n2" }, { id: "far" }],
      links: [
        { source: "A", target: "n1", relation: "r" },
        { source: "B", target: "n2", relation: "r" },
        { source: "n1", target: "far", relation: "r" },
      ],
    };
    const sub = candidateSubgraph(graph, "A", "B", 1);
    expect(sub.nodes.map((n) => n.id).sort()).toEqual(["A", "B", "n1", "n2"]);
    expect(sub.links.length).toBe(2);
  });
  it("handles missing anchors gracefully", async () => {
    const { candidateSubgraph } = await import("../lib/graphAdapter.js");
    const sub = candidateSubgraph({ nodes: [{ id: "A" }], links: [] }, "A", "ZZZ", 1);
    expect(sub.nodes.map((n) => n.id)).toEqual(["A"]);
  });
});

describe("shapeForType / shapeLegend (SVELTE-4)", () => {
  it("maps ontology types to DS shapes, defaulting to dot", async () => {
    const { shapeForType } = await import("../lib/graphAdapter.js");
    expect(shapeForType({ type: "Character" })).toBe("diamond");
    expect(shapeForType({ node_type: "Location" })).toBe("triangle");
    expect(shapeForType({ type: "Evidence" })).toBe("square");
    expect(shapeForType({ type: "Work" })).toBe("box");
    expect(shapeForType({ type: "Unknownish" })).toBe("dot");
    expect(shapeForType({})).toBe("dot");
  });
  it("buildScene attaches a shape to every node", async () => {
    const { buildScene } = await import("../lib/graphAdapter.js");
    const s = buildScene({ nodes: [{ id: "a", type: "Character" }, { id: "b", type: "Location" }], links: [] });
    expect(s.nodes.find((n) => n.id === "a").shape).toBe("diamond");
    expect(s.nodes.find((n) => n.id === "b").shape).toBe("triangle");
  });
  it("shapeLegend returns distinct type->shape entries", async () => {
    const { shapeLegend } = await import("../lib/graphAdapter.js");
    const legend = shapeLegend({ nodes: [{ id: "a", type: "Character" }, { id: "b", type: "Character" }, { id: "c", type: "Evidence" }] });
    expect(legend).toEqual([{ label: "Character", shape: "diamond" }, { label: "Evidence", shape: "square" }]);
  });
});

describe("withReconcileEdge (SVELTE-7)", () => {
  it("adds a bold reconcile edge between the two twins", async () => {
    const { withReconcileEdge } = await import("../lib/graphAdapter.js");
    const scene = { nodes: [{ id: "A" }, { id: "B" }], edges: [] };
    const out = withReconcileEdge(scene, "A", "B");
    expect(out.edges.length).toBe(1);
    expect(out.edges[0]).toMatchObject({ source: "A", target: "B", relation: "≈ reconcile", reconcile: true });
  });
  it("does not duplicate when a direct edge already exists, and no-ops on missing nodes", async () => {
    const { withReconcileEdge } = await import("../lib/graphAdapter.js");
    const withEdge = { nodes: [{ id: "A" }, { id: "B" }], edges: [{ source: "B", target: "A", relation: "x" }] };
    expect(withReconcileEdge(withEdge, "A", "B").edges.length).toBe(1);
    const missing = { nodes: [{ id: "A" }], edges: [] };
    expect(withReconcileEdge(missing, "A", "ZZ").edges.length).toBe(0);
  });
});
