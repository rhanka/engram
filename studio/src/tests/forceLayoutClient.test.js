import { afterEach, describe, expect, it, vi } from "vitest";

import { solveForce, terminateForceWorker, workerSupported } from "../lib/forceLayoutClient.js";

// jsdom does not implement Worker, so `solveForce` takes the SYNCHRONOUS fallback
// path (a real browser uses the worker). These tests pin the fallback contract.

afterEach(() => {
  terminateForceWorker();
  vi.unstubAllGlobals();
});

describe("forceLayoutClient — synchronous fallback (no Worker)", () => {
  it("reports no worker support in jsdom", () => {
    expect(typeof Worker).toBe("undefined");
    expect(workerSupported()).toBe(false);
  });

  it("solveForce resolves to one finite position per node, in input order", async () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ];
    const out = await solveForce(nodes, edges, { iterations: 60 });
    expect(out).toHaveLength(3);
    out.forEach((p, i) => {
      expect(p.id).toBe(nodes[i].id);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    });
  });

  it("honors repulsion / linkDistance / initialPositions options", async () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const edges = [{ source: "a", target: "b" }];
    const initialPositions = new Map([
      ["a", { x: 5, y: 5 }],
      ["b", { x: 6, y: 6 }],
    ]);
    const tight = await solveForce(nodes, edges, { iterations: 180, linkDistance: 0.2 });
    const loose = await solveForce(nodes, edges, { iterations: 180, linkDistance: 2 });
    const dist = (o) => Math.hypot(o[0].x - o[1].x, o[0].y - o[1].y);
    expect(dist(loose)).toBeGreaterThan(dist(tight));
    // initialPositions is accepted (warm-start) without throwing.
    const warm = await solveForce(nodes, edges, { iterations: 1, initialPositions });
    expect(warm).toHaveLength(2);
  });

  it("resolves an empty graph to an empty array", async () => {
    expect(await solveForce([], [], {})).toEqual([]);
  });
});
