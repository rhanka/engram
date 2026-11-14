import { describe, expect, it } from "vitest";

import {
  buildScene,
  buildWindowScene,
  candidateSubgraph,
  candidateUnionSubgraph,
  communityStats,
  entitiesByCommunity,
  entitiesByType,
  graphEdges,
  graphNodes,
  groupCounts,
  isStrongEdge,
  nodeCommunity,
  nodeGroup,
  nodeLabel,
  nodeSourcePath,
  nodeType,
  relationRowsFor,
} from "../lib/graphAdapter.js";
import { buildGraphRendererPayload, colorForGroup } from "../lib/graphRendererPayload.js";
import {
  applyGroupCollapse,
  applyOntologyCollapse,
  injectCommunityNodes,
  injectOntologyClassNodes,
  injectTypeNodes,
} from "../lib/classNodes.js";

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

  it("preserves profile metadata and fixed hierarchy positions in scene nodes and edges", () => {
    const scene = buildScene({
      nodes: [
        {
          id: "AM0104.01",
          label: "Manage identity",
          type: "ProcessStdProcess",
          status: "validated",
          ontology_status: "validated",
          parent_id: "AM0104",
          level: 2,
          code: "AM0104.01",
          fx: 120,
          fy: -40,
        },
        {
          id: "DE.AI.01",
          label: "AI design",
          node_type: "ABPProcess",
          review_status: "candidate",
          x: 10,
          y: 20,
          fixed: true,
        },
      ],
      links: [
        {
          source: "AM0104.01",
          target: "DE.AI.01",
          relation_type: "candidate_maps_to",
          assertion_basis: "heuristic_guess",
          review_status: "candidate",
          derivation_method: "llm_guess",
          confidence_score: 0.62,
          evidence_refs: ["registry#process_std"],
        },
      ],
    });

    expect(scene.nodes[0]).toMatchObject({
      id: "AM0104.01",
      type: "ProcessStdProcess",
      status: "validated",
      ontology_status: "validated",
      parent_id: "AM0104",
      level: 2,
      code: "AM0104.01",
      x: 120,
      y: -40,
      fx: 120,
      fy: -40,
    });
    expect(scene.nodes[1]).toMatchObject({
      id: "DE.AI.01",
      type: "ABPProcess",
      review_status: "candidate",
      x: 10,
      y: 20,
      fixed: true,
    });
    expect(scene.edges[0]).toMatchObject({
      relation: "candidate_maps_to",
      relation_type: "candidate_maps_to",
      assertion_basis: "heuristic_guess",
      review_status: "candidate",
      derivation_method: "llm_guess",
      confidence_score: 0.62,
      evidence_refs: ["registry#process_std"],
      weak: true,
    });
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

describe("groupCounts prefer-server (storage LOT 2)", () => {
  it("uses the store's precomputed counts when supplied, NOT the in-memory graph", () => {
    // A keyFn that EXPLODES if called proves no O(#nodes) pass happens when the
    // server provided counts (the "instant grouping" win).
    const keyFn = () => {
      throw new Error("client keyFn must not run when server counts are present");
    };
    const serverCounts = {
      axis: "node_type",
      groups: [
        { key: "Character", label: "Character", count: 12 },
        { key: "Place", label: "Place", count: 5 },
      ],
    };
    const result = groupCounts(FIXTURE, keyFn, serverCounts);
    // Built straight from the server payload, re-sorted by count desc, key asc.
    expect(result).toEqual([
      { key: "Character", count: 12 },
      { key: "Place", count: 5 },
    ]);
  });

  it("accepts a bare groups array and re-sorts it by count desc, key asc", () => {
    const result = groupCounts(FIXTURE, nodeType, [
      { key: "Place", count: 5 },
      { key: "Character", count: 12 },
    ]);
    expect(result.map((g) => g.key)).toEqual(["Character", "Place"]);
  });

  it("falls back to the client computation when serverCounts is null/empty", () => {
    // Default flat-JSON studio: no store → null → identical to the legacy call.
    const client = groupCounts(FIXTURE, nodeType);
    expect(groupCounts(FIXTURE, nodeType, null)).toEqual(client);
    expect(groupCounts(FIXTURE, nodeType, { axis: "node_type", groups: [] })).toEqual(client);
    expect(groupCounts(FIXTURE, nodeType, [])).toEqual(client);
  });

  it("falls back when the server payload has no usable rows (missing key / NaN count)", () => {
    const client = groupCounts(FIXTURE, nodeType);
    const garbage = { axis: "node_type", groups: [{ label: "no key" }, { key: "x", count: "nope" }] };
    expect(groupCounts(FIXTURE, nodeType, garbage)).toEqual(client);
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

  it("citationsByFileFrom groups an explicit citation list (lazy sidecar upgrade)", async () => {
    const { citationsByFileFrom, citationsByFile } = await import("../lib/graphAdapter.js");
    // The full sidecar list (more than the inline K-set on the node) groups the
    // same way as citationsByFile(node) does over node.citations.
    const fullList = [
      { source_file: "a.txt", section: "ch1" },
      { source_file: "a.txt", section: "ch2" },
      { source_file: "b.txt", page: 5 },
      { source_file: "c.txt", section: "intro" },
    ];
    const groups = citationsByFileFrom(fullList);
    expect(groups.map((g) => g.file)).toEqual(["a.txt", "b.txt", "c.txt"]);
    expect(groups.find((g) => g.file === "a.txt").count).toBe(2);
    // Parity: citationsByFile(node) delegates to citationsByFileFrom(node.citations).
    expect(citationsByFile({ citations: fullList })).toEqual(groups);
  });

  it("citationsByFileFrom accepts a fallback source_file and handles empty", async () => {
    const { citationsByFileFrom } = await import("../lib/graphAdapter.js");
    expect(citationsByFileFrom([])).toEqual([]);
    expect(citationsByFileFrom(null)).toEqual([]);
    const g = citationsByFileFrom([{ section: "s" }], "x.txt");
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

describe("shapeForType (SVELTE-4)", () => {
  it("maps curated ontology types to their hand-picked DS shapes", async () => {
    const { shapeForType } = await import("../lib/graphAdapter.js");
    expect(shapeForType({ type: "Character" })).toBe("diamond");
    expect(shapeForType({ node_type: "Location" })).toBe("triangle");
    expect(shapeForType({ type: "Evidence" })).toBe("square");
    expect(shapeForType({ type: "Work" })).toBe("hexagon");
    expect(shapeForType({ type: "ChapterOrStory" })).toBe("dot");
    // A typeless node still falls back to the neutral dot.
    expect(shapeForType({})).toBe("dot");
  });

  it("gives a NON-profile (file_type) type a stable, distinct shape per type", async () => {
    const { shapeForType, fallbackShapeForType } = await import("../lib/graphAdapter.js");
    // Bug fix: unknown types used to ALL collapse to "dot" (one glyph for every
    // file_type, no shape-per-type legend). Each now gets a stable ring shape.
    expect(shapeForType({ type: "Unknownish" })).toBe("diamond");
    expect(shapeForType({ file_type: "code" })).toBe("square");
    expect(shapeForType({ file_type: "concept" })).toBe("star");
    expect(shapeForType({ file_type: "rationale" })).toBe("hexagon");
    // Deterministic: same type ⇒ same shape across canvas / legend / re-export.
    expect(fallbackShapeForType("code")).toBe(shapeForType({ type: "code" }));
    expect(fallbackShapeForType("code")).toBe("square");
    // Never the box family (reserved for god-class hubs / class nodes).
    for (const t of ["code", "concept", "rationale", "Commit", "Branch", "zzz"]) {
      expect(["box", "roundedbox"]).not.toContain(fallbackShapeForType(t));
    }
    expect(fallbackShapeForType("")).toBe("dot");
  });
  it("buildScene attaches a shape to every node", async () => {
    const { buildScene } = await import("../lib/graphAdapter.js");
    const s = buildScene({ nodes: [{ id: "a", type: "Character" }, { id: "b", type: "Location" }], links: [] });
    expect(s.nodes.find((n) => n.id === "a").shape).toBe("diamond");
    expect(s.nodes.find((n) => n.id === "b").shape).toBe("triangle");
  });
  it("buildScene emits fill/border variants only for non-default types", async () => {
    const { buildScene } = await import("../lib/graphAdapter.js");
    const s = buildScene({
      nodes: [
        { id: "char", type: "Character" }, // diamond, defaults
        { id: "alias", type: "Alias" }, // diamond, hollow
        { id: "author", type: "Author" }, // star, bold border
        { id: "work", type: "Work" }, // hexagon, bold border
        { id: "story", type: "ChapterOrStory" }, // dot, bold border
      ],
      links: [],
    });
    const byId = new Map(s.nodes.map((n) => [n.id, n]));
    expect(byId.get("char").fill).toBeUndefined();
    expect(byId.get("char").border).toBeUndefined();
    expect(byId.get("alias").fill).toBe("hollow");
    expect(byId.get("alias").border).toBeUndefined();
    expect(byId.get("author").border).toBe("bold");
    expect(byId.get("work").fill).toBe("hollow");
    expect(byId.get("work").border).toBe("bold");
    expect(byId.get("story").border).toBe("bold");
  });
  it("keeps shared hexagon types visually distinct by fill/border variant", async () => {
    const { buildScene } = await import("../lib/graphAdapter.js");
    const s = buildScene({
      nodes: ["Organization", "ForensicMethod", "Saga", "Work"].map((type, i) => ({ id: `n${i}`, type })),
      links: [],
    });
    const signatures = s.nodes.map((node) =>
      [node.type, node.shape, node.fill ?? "solid", node.border ?? "normal"].join(":"),
    );
    expect(signatures).toEqual([
      "Organization:hexagon:solid:normal",
      "ForensicMethod:hexagon:hollow:normal",
      "Saga:hexagon:solid:bold",
      "Work:hexagon:hollow:bold",
    ]);
  });
});

describe("computeGodClass — Character-gated box-label class", () => {
  // sherlock (Character) is the global hub (degree 3); works are non-box
  // structural nodes. The god-class must resolve to Character WITHOUT
  // hardcoding individual ids.
  const GRAPH = {
    nodes: [
      { id: "sherlock", label: "Sherlock Holmes", type: "Character" },
      { id: "watson", label: "John Watson", type: "Character" },
      { id: "memoirs", label: "The Memoirs", type: "Work" },
      { id: "baker", label: "221B", type: "Location" },
    ],
    links: [
      { source: "sherlock", target: "watson", relation: "assists" },
      { source: "sherlock", target: "memoirs", relation: "appears_in" },
      { source: "sherlock", target: "baker", relation: "located_in" },
      { source: "watson", target: "memoirs", relation: "appears_in" },
    ],
  };

  it("buildScene overrides god-class hubs to the box glyph (others keep base shapes)", async () => {
    const { buildScene } = await import("../lib/graphAdapter.js");
    const s = buildScene(GRAPH);
    const byId = new Map(s.nodes.map((n) => [n.id, n]));
    // Both Characters pass the gate (deg >= 0.15 * 3) -> labelled boxes.
    expect(byId.get("sherlock").shape).toBe("roundedbox");
    expect(byId.get("watson").shape).toBe("roundedbox");
    // Work keeps its non-box type default; only Character hubs become boxes.
    expect(byId.get("memoirs").shape).toBe("hexagon");
    expect(byId.get("baker").shape).toBe("triangle");
  });

  it("does not box-label non-Character hubs even when they dominate the graph", async () => {
    const { buildScene, computeGodClass, computeDegrees } = await import("../lib/graphAdapter.js");
    const flipped = {
      nodes: [
        { id: "p1", type: "Paper" },
        { id: "p2", type: "Paper" },
        { id: "lab", type: "Lab" },
      ],
      links: [
        { source: "lab", target: "p1" },
        { source: "lab", target: "p2" },
      ],
    };
    const degree = computeDegrees(flipped.nodes, flipped.links);
    expect(computeGodClass(flipped.nodes, degree, 2)).toBe(null);
    const s = buildScene(flipped);
    const byId = new Map(s.nodes.map((n) => [n.id, n]));
    // The intent: a non-Character hub is NEVER box-labelled (boxes are reserved
    // for Character god-class hubs). Each non-profile type still gets its own
    // stable per-type glyph (Lab → dot, Paper → star) — never a box.
    expect(["box", "roundedbox"]).not.toContain(byId.get("lab").shape);
    expect(byId.get("lab").shape).toBe("dot");
    expect(byId.get("p1").shape).toBe("star");
  });

  it("returns null with no edges or no typed nodes (no override applied)", async () => {
    const { buildScene, computeGodClass } = await import("../lib/graphAdapter.js");
    expect(computeGodClass([{ id: "a", type: "Character" }], new Map([["a", 0]]), 0)).toBe(null);
    const s = buildScene({ nodes: [{ id: "a", type: "Character" }], links: [] });
    expect(s.nodes[0].shape).toBe("diamond");
  });
});

describe("applyWeakFilter (ÉTAPE 1b — scene.json parity)", () => {
  // A graph exercising every branch the weak filter touches: a strong-only
  // node, a node whose ONLY edge is weak (orphaned by the filter), and a hub
  // whose degree changes (so weight re-normalisation matters).
  const GRAPH = {
    nodes: [
      { id: "hub", type: "Character", community_name: "C1" },
      { id: "strong", type: "Work", community_name: "C1" },
      { id: "weakonly", type: "Location", community_name: "C2" },
      { id: "lonely", type: "Object" }, // no edges at all
    ],
    links: [
      { source: "hub", target: "strong", relation: "appears_in", confidence: "EXTRACTED" },
      { source: "hub", target: "weakonly", relation: "located_in", confidence: "INFERRED" },
    ],
  };

  it("applyWeakFilter(fullScene, false) === buildScene(graph, {showWeakLinks:false})", async () => {
    const { buildScene, applyWeakFilter } = await import("../lib/graphAdapter.js");
    const full = buildScene(GRAPH, { showWeakLinks: true });
    const filtered = applyWeakFilter(full, false);
    const reference = buildScene(GRAPH, { showWeakLinks: false });
    expect(filtered).toEqual(reference);
  });

  it("returns the scene unchanged when showWeak is true", async () => {
    const { buildScene, applyWeakFilter } = await import("../lib/graphAdapter.js");
    const full = buildScene(GRAPH, { showWeakLinks: true });
    expect(applyWeakFilter(full, true)).toEqual(full);
  });

  it("drops weak edges and zeroes weakEdgeCount", async () => {
    const { buildScene, applyWeakFilter } = await import("../lib/graphAdapter.js");
    const full = buildScene(GRAPH, { showWeakLinks: true });
    expect(full.stats.weakEdgeCount).toBe(1);
    const filtered = applyWeakFilter(full, false);
    expect(filtered.edges.some((e) => e.weak)).toBe(false);
    expect(filtered.stats.weakEdgeCount).toBe(0);
    expect(filtered.stats.edgeCount).toBe(1);
    // Node count is stable (buildScene keeps orphaned nodes) and the community
    // count is computed over all edges, so it does not move with the filter.
    expect(filtered.stats.nodeCount).toBe(full.stats.nodeCount);
    expect(filtered.stats.communityCount).toBe(full.stats.communityCount);
  });

  it("is pure: does not mutate the input scene", async () => {
    const { buildScene, applyWeakFilter } = await import("../lib/graphAdapter.js");
    const full = buildScene(GRAPH, { showWeakLinks: true });
    const snapshot = JSON.parse(JSON.stringify(full));
    applyWeakFilter(full, false);
    expect(full).toEqual(snapshot);
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

describe("attachReconLayout (#2.2 — local recon layout)", () => {
  it("keeps pinned twins fixed and centres neighbours around them", async () => {
    const { attachReconLayout } = await import("../lib/graphAdapter.js");
    const cx = 360, cy = 280, dx = 130;
    const scene = {
      nodes: [
        { id: "A", fx: cx - dx, fy: cy },
        { id: "B", fx: cx + dx, fy: cy },
        { id: "n1", x: 9000, y: -4000 }, // scattered full-graph coords (must be dropped)
        { id: "n2", x: -2000, y: 7000 },
      ],
      edges: [
        { source: "A", target: "n1" },
        { source: "B", target: "n2" },
        { source: "A", target: "B" },
      ],
    };
    const out = attachReconLayout(scene);
    const byId = Object.fromEntries(out.nodes.map((n) => [n.id, n]));
    // Twins stay pinned exactly at their fx/fy (held fixed during the sim).
    expect(byId.A.x).toBeCloseTo(cx - dx, 6);
    expect(byId.A.y).toBeCloseTo(cy, 6);
    expect(byId.B.x).toBeCloseTo(cx + dx, 6);
    expect(byId.B.y).toBeCloseTo(cy, 6);
    // Every node ends up with both x/y AND fx/fy set (pinned for direct render).
    for (const n of out.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.fx)).toBe(true);
      expect(n.fx).toBe(n.x);
      expect(n.fy).toBe(n.y);
    }
    // Neighbours settle near the twins' centre, NOT at their scattered coords.
    expect(Math.hypot(byId.n1.x - cx, byId.n1.y - cy)).toBeLessThan(600);
    expect(Math.hypot(byId.n2.x - cx, byId.n2.y - cy)).toBeLessThan(600);
  });
  it("returns the scene unchanged for an empty node set", async () => {
    const { attachReconLayout } = await import("../lib/graphAdapter.js");
    const empty = { nodes: [], edges: [] };
    expect(attachReconLayout(empty)).toBe(empty);
  });
});

describe("reconTwinPinOffset (focal box overlap fix)", () => {
  // Deterministic measure stub: linear in font size, 0.5 × size per char —
  // mirrors the linearity the world-width derivation relies on.
  const measure = (text, font) => text.length * Number.parseFloat(font) * 0.5;
  const BOX_H = 18; // renderer BOX_BASE_HEIGHT_PX

  it("separates two wide identical labels: 2dx ≥ halfA + halfB + gap", async () => {
    const { reconTwinPinOffset, reconBoxWorldWidth } = await import("../lib/graphAdapter.js");
    const label = "Dr. John H. Watson";
    const opts = { pixelRatio: 2, measure };
    const w = reconBoxWorldWidth(label, opts);
    const dx = reconTwinPinOffset(label, label, opts);
    // Boxes centred at ±dx: edges at dx − w/2 must not cross the centre line,
    // and the world gap equals 2dx − w (≥ half a box height = 18 × pr × 0.5).
    expect(2 * dx - w).toBeGreaterThanOrEqual(BOX_H * 2 * 0.5 - 1e-9);
    // Width formula parity with renderer boxDimensions (world units):
    // height = 18 × pr; font = h × 12/22; width = textW + 2 × h × 5/22.
    const h = BOX_H * 2;
    const expected = measure(label, `${h * (12 / 22)}px sans-serif`) + 2 * h * (5 / 22);
    expect(w).toBeCloseTo(expected, 9);
  });

  it("keeps short labels compact (spacing tracks the actual widths)", async () => {
    const { reconTwinPinOffset } = await import("../lib/graphAdapter.js");
    const opts = { pixelRatio: 2, measure };
    const short = reconTwinPinOffset("221B", "221B", opts);
    const long = reconTwinPinOffset("Dr. John H. Watson", "Dr. John H. Watson", opts);
    expect(short).toBeLessThan(long);
    // A 4-char pair needs far less than the legacy hand-tuned 45 × pr scale.
    expect(short).toBeLessThan(long / 2);
  });

  it("handles asymmetric and empty labels (empty box collapse)", async () => {
    const { reconTwinPinOffset, reconBoxWorldWidth } = await import("../lib/graphAdapter.js");
    const opts = { pixelRatio: 1, measure };
    // Empty label: legacy hidden-font collapse — width = height × 10/22.
    expect(reconBoxWorldWidth("", opts)).toBeCloseTo(BOX_H * (10 / 22), 9);
    const wA = reconBoxWorldWidth("A very long canonical label", opts);
    const wB = reconBoxWorldWidth("", opts);
    const dx = reconTwinPinOffset("A very long canonical label", "", opts);
    expect(2 * dx).toBeGreaterThanOrEqual(wA / 2 + wB / 2 + BOX_H * 0.5 - 1e-9);
  });

  it("falls back to a glyph-ratio estimate without Canvas2D (jsdom)", async () => {
    const { reconTwinPinOffset } = await import("../lib/graphAdapter.js");
    // No `measure` injected: jsdom has no 2d context, so the fallback path
    // must still return a finite, positive offset.
    const dx = reconTwinPinOffset("Dr. John H. Watson", "Dr. John H. Watson", { pixelRatio: 2 });
    expect(Number.isFinite(dx)).toBe(true);
    expect(dx).toBeGreaterThan(45); // strictly wider than the old constant
  });
});

describe("memoised graph index (quick-win C) — parity with the old filter+sort", () => {
  // A graph with several types/communities and out-of-order labels to make the
  // sort observable. A fresh object per assertion-block so the WeakMap cache is
  // exercised, not shared with other describe blocks.
  const G = {
    nodes: [
      { id: "c2", label: "Zeta", type: "Character", community_name: "Beta" },
      { id: "c1", label: "Alpha", type: "Character", community_name: "Beta" },
      { id: "w1", label: "Mu", type: "Work", community: 3 },
      { id: "p1", type: "Place" }, // no label -> falls back to id; no community
      { id: "c3", label: "Mid", type: "Character", community_name: "Beta" },
    ],
    links: [
      { source: "c1", target: "w1", relation: "appears_in", confidence: "EXTRACTED" },
      { source: "c2", target: "w1", relation: "appears_in", confidence: "EXTRACTED" },
    ],
  };

  // Reference = the pre-index implementation, recomputed independently.
  const refByType = (g, type) =>
    graphNodes(g)
      .filter((n) => nodeType(n) === type)
      .map((n) => ({ id: n.id, label: nodeLabel(n) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  const refByCommunity = (g, community) =>
    graphNodes(g)
      .filter((n) => nodeCommunity(n) === community)
      .map((n) => ({ id: n.id, label: nodeLabel(n) }))
      .sort((a, b) => a.label.localeCompare(b.label));

  it("entitiesByType matches the reference for every present type", () => {
    for (const type of ["Character", "Work", "Place"]) {
      expect(entitiesByType(G, type)).toEqual(refByType(G, type));
    }
    // Sorted, not document order: Alpha < Mid < Zeta.
    expect(entitiesByType(G, "Character").map((e) => e.label)).toEqual(["Alpha", "Mid", "Zeta"]);
  });

  it("entitiesByCommunity matches the reference (named + numeric)", () => {
    expect(entitiesByCommunity(G, "Beta")).toEqual(refByCommunity(G, "Beta"));
    expect(entitiesByCommunity(G, "Community 3")).toEqual(refByCommunity(G, "Community 3"));
  });

  it("returns [] for an unknown type/community and tolerates a null graph", () => {
    expect(entitiesByType(G, "Nope")).toEqual([]);
    expect(entitiesByCommunity(G, "Nope")).toEqual([]);
    expect(entitiesByType(null, "Character")).toEqual([]);
    expect(entitiesByCommunity(null, "Beta")).toEqual([]);
  });

  it("memoises: repeated calls for the same graph return the identical array reference", () => {
    const first = entitiesByType(G, "Character");
    const second = entitiesByType(G, "Character");
    expect(second).toBe(first); // cached bucket, not a fresh sort
  });

  it("communityStats is stable across calls and unchanged by memoisation", () => {
    const a = communityStats(G);
    const b = communityStats(G);
    expect(b).toBe(a); // same memoised object
    // Beta (3 members, all live via c1/c2 edges) is counted.
    expect(a.live.find((x) => x.key === "Beta")?.count).toBe(3);
  });
});

describe("candidateUnionSubgraph (EVOL 1.b)", () => {
  it("folds each candidate into its canonical, drops fold self-loops, dedups parallels", async () => {
    const { candidateUnionSubgraph } = await import("../lib/graphAdapter.js");
    const graph = {
      nodes: [
        { id: "A", type: "Character" }, { id: "B", type: "Character" },
        { id: "C", type: "Location" }, { id: "D", type: "Location" },
        { id: "N1", type: "Object" }, { id: "N2", type: "Object" },
      ],
      links: [
        { source: "A", target: "N1", relation: "owns" },
        { source: "B", target: "N1", relation: "owns" },   // parallel after fold A->B -> dedup
        { source: "A", target: "B", relation: "alias_of" }, // self-loop after fold -> dropped
        { source: "C", target: "N2", relation: "at" },
      ],
    };
    const sub = candidateUnionSubgraph(
      graph,
      [{ candidate_id: "A", canonical_id: "B" }, { candidate_id: "C", canonical_id: "D" }],
      1,
    );
    const ids = sub.nodes.map((n) => n.id);
    expect(ids).not.toContain("A"); // folded into B
    expect(ids).not.toContain("C"); // folded into D
    expect(ids).toContain("B");
    expect(ids).toContain("D");
    // no self-loops survive the fold (alias_of A<->B becomes B<->B and is dropped)
    expect(sub.links.every((e) => e.source !== e.target)).toBe(true);
    expect(sub.links.some((e) => e.relation === "alias_of")).toBe(false);
    // the two parallel "owns" edges collapse to one B->N1
    const owns = sub.links.filter((e) => e.relation === "owns");
    expect(owns.length).toBe(1);
    expect(owns[0].source).toBe("B");
  });
});

describe("B2 — T12 numeric-only-community colour parity (A5 × BUG B)", () => {
  // A graph whose communities are NUMERIC-ONLY (no community_name). Two live
  // communities (0, 1). The A5 trap: the legend keys community by `nodeCommunity`
  // (`Community <n>`), but the canvas fills by `nodeGroup` (`community:<n>`).
  // Post-merge (#195 BUG B) the swatch resolves its colour through the SAME
  // colorForGroup() the canvas uses, over the SAME `nodeGroup` palette key
  // captured on rec.group — so each numeric community must get the colour of its
  // `community:<n>` key (and two distinct numeric communities get DISTINCT
  // colours, never both collapsing to colorForGroup of the wrong/missing key).
  const numericGraph = {
    nodes: [
      { id: "a", community: 0 },
      { id: "b", community: 0 },
      { id: "c", community: 1 },
      { id: "d", community: 1 },
    ],
    links: [
      { source: "a", target: "b", relation: "knows" },
      { source: "c", target: "d", relation: "knows" },
    ],
  };

  it("each numeric community's colour matches colorForGroup of its nodeGroup palette key", () => {
    const stats = communityStats(numericGraph);
    expect(stats.liveCount).toBe(2);
    const byKey = new Map(stats.live.map((c) => [c.key, c]));
    // nodeCommunity keys are `Community 0` / `Community 1`; nodeGroup keys are
    // `community:0` / `community:1` — the keys the canvas hashes for the fill.
    expect(nodeCommunity(numericGraph.nodes[0])).toBe("Community 0");
    expect(nodeGroup(numericGraph.nodes[0])).toBe("community:0");
    // A5: the swatch colour is resolved under the `community:<n>` palette key,
    // NOT the `Community <n>` legend key — so it equals the on-canvas fill.
    expect(byKey.get("Community 0").color).toBe(colorForGroup("community:0"));
    expect(byKey.get("Community 1").color).toBe(colorForGroup("community:1"));
    // The two numeric communities get DISTINCT colours (the A5 bug collapsed
    // community 1 to the wrong key's colour).
    expect(byKey.get("Community 1").color).not.toBe(byKey.get("Community 0").color);
  });

  it("NAMED-community colour parity stays green (unaffected by the fix)", () => {
    const namedGraph = {
      nodes: [
        { id: "a", community_name: "People" },
        { id: "b", community_name: "People" },
        { id: "c", community_name: "Places" },
        { id: "d", community_name: "Places" },
      ],
      links: [
        { source: "a", target: "b", relation: "knows" },
        { source: "c", target: "d", relation: "knows" },
      ],
    };
    const stats = communityStats(namedGraph);
    const byKey = new Map(stats.live.map((c) => [c.key, c]));
    // Named communities: nodeGroup === nodeCommunity === community_name, so the
    // swatch colour is colorForGroup(community_name).
    expect(byKey.get("People").color).toBe(colorForGroup("People"));
    expect(byKey.get("Places").color).toBe(colorForGroup("Places"));
  });
});

describe("R2-M1 — topology degree through Studio adapters", () => {
  const classes = {
    hierarchies: {
      fixture: {
        classes_by_id: {
          "class:Character": {
            id: "class:Character",
            member_node_types: ["Character"],
            member_ids: ["d"],
          },
        },
      },
    },
  };
  const injectClass = (graph) => injectOntologyClassNodes(graph, classes);
  const injectCommunity = (graph) => injectCommunityNodes(graph, {
    communityOf: (node) => node.id === "d" ? "group" : null,
    liveKeys: ["group"],
  });
  const injectType = (graph) => injectTypeNodes(graph, {
    typeOf: (node) => node.id === "d" ? "Character" : null,
    typeNames: ["Character"],
  });
  const collapse = (graph, target) => applyGroupCollapse(graph, {
    parentById: new Map([["d", target]]),
    collapseTargets: [target],
  });
  const adapters = [
    ["candidateSubgraph", (graph) => candidateSubgraph(graph, "a", "c", 1)],
    ["candidateUnionSubgraph", (graph) => candidateUnionSubgraph(graph, [
      { canonical_id: "a" }, { canonical_id: "c" },
    ], 1)],
    ["buildWindowScene", (graph) => ({ ...graph, edges: graph.links }), buildWindowScene],
    ["ontology injection", injectClass],
    ["ontology injection without an artifact", (graph) => injectOntologyClassNodes(graph, null)],
    ["ontology injection with empty hierarchies", (graph) => injectOntologyClassNodes(graph, { hierarchies: {} })],
    ["community injection", injectCommunity],
    ["community injection with no live keys", (graph) => injectCommunityNodes(graph, { liveKeys: [] })],
    ["type injection", injectType],
    ["type injection with no type names", (graph) => injectTypeNodes(graph, { typeNames: [] })],
    ["ontology collapse", (graph) => applyOntologyCollapse(injectClass(graph), classes, {
      collapsedClassIds: ["class:Character"],
    })],
    ["ontology collapse without targets", (graph) => applyOntologyCollapse(graph, classes)],
    ["community collapse", (graph) => collapse(injectCommunity(graph), "community-node:group")],
    ["type collapse", (graph) => collapse(injectType(graph), "type-node:Character")],
    ["group collapse without targets", (graph) => applyGroupCollapse(graph)],
    ["group collapse without members", (graph) => applyGroupCollapse(graph, { collapseTargets: ["missing"] })],
  ];

  function fixture(parallel = false, labels = false) {
    return {
      nodes: (labels ? ["c", "d", "e", "z", "w", "b", "a"] : ["a", "b", "c", "d", "e"])
        .map((id, index) => ({ id, label: id, type: "Character", x: index, y: 0 })),
      links: [
        { source: "a", target: "b", relation: "r1" },
        { source: "c", target: "d", relation: "r1" },
        { source: "c", target: "e", relation: "r1" },
        ...(parallel ? ["r2", "r3", "r4"].map((relation) => ({ source: "a", target: "b", relation })) : []),
        ...(labels ? ["z", "w"].map((target) => ({ source: "c", target, relation: "r1" })) : []),
      ],
    };
  }

  const weightsById = (scene) => Object.fromEntries(scene.nodes.map((node) => [node.id, node.weight]));
  const colorsById = (payload) => Object.fromEntries(payload.renderGraph.nodeIds.map((id, index) => [
    id, Array.from(payload.baseStyle.nodeColors.slice(index * 4, index * 4 + 4)),
  ]));
  const labelsById = (payload) => Object.fromEntries(payload.renderGraph.nodeIds.map((id, index) => [
    id, payload.baseStyle.nodeLabels[index],
  ]));

  for (const [name, adapt, makeScene = buildScene] of adapters) {
    describe(name, () => {
      it("should preserve weights, churn and opt-in when parallel relations are added", () => {
        const before = adapt({ ...fixture(), multigraph: true });
        const after = adapt({ ...fixture(true), multigraph: true });
        const baseline = makeScene(before);
        const parallel = makeScene(after);
        expect(weightsById(parallel)).toEqual(weightsById(baseline));
        expect(weightsById(parallel).c).toBeGreaterThan(weightsById(parallel).a);
        expect(colorsById(buildGraphRendererPayload(parallel, { colorBy: "churn" })))
          .toEqual(colorsById(buildGraphRendererPayload(baseline, { colorBy: "churn" })));
        expect(before.multigraph).toBe(true);
        expect(after.multigraph).toBe(true);
        expect(baseline.multigraph).toBe(true);
        expect(parallel.multigraph).toBe(true);
        expect(parallel.edges.length - baseline.edges.length).toBe(3);
      });

      it("should preserve label priority when parallel relations compete for the label budget", () => {
        function payload(parallel) {
          const scene = makeScene(adapt({ ...fixture(parallel, true), multigraph: true }));
          // Two extra peripheral characters keep the label budget contested
          // even when a collapse hides one member. Fix packing order per ID.
          const order = ["c", "d", "e", "z", "w", "b", "a"];
          const rank = (id) => order.includes(id) ? order.indexOf(id) : order.length;
          return buildGraphRendererPayload({
            ...scene,
            nodes: [...scene.nodes].sort((a, b) => rank(a.id) - rank(b.id)),
          }, { zoom: 0 });
        }
        const baseline = labelsById(payload(false));
        expect(baseline.a).toBe("");
        expect(baseline.c).toBe("c");
        expect(labelsById(payload(true))).toEqual(baseline);
      });

      it.each([undefined, false])("should retain legacy degree behavior for multigraph=%s", (flag) => {
        const graph = { ...fixture(true), ...(flag === undefined ? {} : { multigraph: flag }) };
        const adapted = adapt(graph);
        const scene = makeScene(adapted);
        expect(adapted.multigraph).not.toBe(true);
        if (flag === undefined) expect(adapted).not.toHaveProperty("multigraph");
        expect(scene).not.toHaveProperty("multigraph");
        expect(weightsById(scene).a).toBeGreaterThan(weightsById(scene).c);
        expect(weightsById(scene).a).toBe(23.04);
        expect(weightsById(scene).c).toBe(7.5625);
      });

      it("should retain opt-in when the input graph is empty", () => {
        const adapted = adapt({ nodes: [], links: [], multigraph: true });
        expect(adapted.multigraph).toBe(true);
        expect(makeScene(adapted).multigraph).toBe(true);
      });
    });
  }
});
