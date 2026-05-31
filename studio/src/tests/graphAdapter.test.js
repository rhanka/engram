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
