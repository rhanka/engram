/**
 * Track F-0820-0827 M19 — Community IDs must be stable across runs when the
 * partitioner returns the same grouping in different enumeration orders.
 *
 * Upstream f5f3a1c (#1090): the from-scratch build writes each node's community
 * field from cluster()'s enumerate() after a size-sort. Equal-sized small
 * communities were ordered by the partitioner's (non-seed-stable) enumeration
 * order, so their integer IDs permuted run-to-run even when the actual grouping
 * was identical. Fix: add a ``tuple(sorted(nodes))`` tiebreak to make the sort
 * a total order. TS equivalent: sort the nodes before joining for the tiebreak.
 */
import { describe, it, expect, vi } from "vitest";
import Graph from "graphology";

describe("F-0820-0827 M19 — community ID stability with equal-sized communities (f5f3a1c, #1090)", () => {
  it("tiebreak on sorted nodes makes ordering stable when partitioner returns nodes in different order within communities", async () => {
    // The key scenario: two equal-sized communities. In run 1, the partitioner
    // returns the nodes of community X in order [z, a] (z first). In run 2, it
    // returns [a, z] (a first). Without a sorted-nodes tiebreak, `join("\0")`
    // gives "z\0a" vs "a\0z" — different comparators → different CID assignment.
    // With sorted tiebreak, both runs compute the same canonical form sorted(nodes)
    // and produce the same CID assignment.

    function makeG() {
      const G = new Graph({ type: "undirected" });
      for (const n of ["a", "b", "z", "y"]) G.mergeNode(n);
      G.mergeEdge("a", "b");
      G.mergeEdge("z", "y");
      return G;
    }

    vi.resetModules();
    const louvainMock = vi.fn();
    vi.doMock("graphology-communities-louvain", () => ({ default: louvainMock }));
    const { cluster } = await import("../src/cluster.js");

    // Run 1: nodes in community 0 are [z, a] (z first in the object entry order)
    louvainMock.mockImplementationOnce((_graph: Graph) => ({
      z: 0, a: 0, b: 1, y: 1,
    } as Record<string, number>));

    // Run 2: same grouping, but community 0 has nodes [a, z] (a first)
    louvainMock.mockImplementationOnce((_graph: Graph) => ({
      a: 0, z: 0, y: 1, b: 1,
    } as Record<string, number>));

    const run1 = cluster(makeG());
    const run2 = cluster(makeG());

    vi.doUnmock("graphology-communities-louvain");
    vi.resetModules();

    // Build node→cid maps
    const nodeCid = (result: Map<number, string[]>) => {
      const m: Record<string, number> = {};
      for (const [cid, nodes] of result) for (const n of nodes) m[n] = cid;
      return m;
    };

    const map1 = nodeCid(run1);
    const map2 = nodeCid(run2);

    // Both runs must assign the same CID to each node (stability)
    expect(map1["a"], "node a must have same cid across runs").toBe(map2["a"]);
    expect(map1["b"], "node b must have same cid across runs").toBe(map2["b"]);
    expect(map1["z"], "node z must have same cid across runs").toBe(map2["z"]);
    expect(map1["y"], "node y must have same cid across runs").toBe(map2["y"]);

    // Sanity: a and z are in the same community
    expect(map1["a"]).toBe(map1["z"]);
    // Sanity: b and y are in the same community
    expect(map1["b"]).toBe(map1["y"]);
  });

  it("deterministic: community containing lex-smallest sorted node list gets the lower CID", async () => {
    // With a total-order sort using sorted nodes as tiebreak:
    // community {a, z} (sorted: [a, z]) sorts before {b, y} (sorted: [b, y])
    // because "a" < "b" — so {a,z} always gets CID 0.

    function makeG() {
      const G = new Graph({ type: "undirected" });
      for (const n of ["a", "b", "z", "y"]) G.mergeNode(n);
      G.mergeEdge("a", "z");
      G.mergeEdge("b", "y");
      return G;
    }

    vi.resetModules();
    const louvainMock = vi.fn();
    vi.doMock("graphology-communities-louvain", () => ({ default: louvainMock }));
    const { cluster } = await import("../src/cluster.js");

    // Louvain returns {b,y} first (cid 0) and {a,z} second (cid 1)
    louvainMock.mockImplementationOnce((_graph: Graph) => ({
      b: 0, y: 0, a: 1, z: 1,
    } as Record<string, number>));

    const result = cluster(makeG());

    vi.doUnmock("graphology-communities-louvain");
    vi.resetModules();

    const nodeCid: Record<string, number> = {};
    for (const [cid, nodes] of result) for (const n of nodes) nodeCid[n] = cid;

    // {a,z} sorted = [a, z], {b,y} sorted = [b, y]. "a" < "b" → {a,z} gets CID 0.
    expect(nodeCid["a"], "community {a,z} should get lower CID than {b,y}").toBe(0);
    expect(nodeCid["z"]).toBe(0);
    expect(nodeCid["b"]).toBe(1);
    expect(nodeCid["y"]).toBe(1);
  });
});
