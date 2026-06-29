import { afterEach, describe, expect, it } from "vitest";

import {
  applySceneLayout,
  attachTimeOrientedPositions,
  resolveSceneLayoutId,
} from "../src/scene-layout.js";
import { buildStudioScene, type StudioSceneGraphLike } from "../src/studio-scene.js";

// Epoch-ms instants (out of chronological node order so X ordering is observable).
const T_1887 = Date.UTC(1887, 2, 1);
const T_1891 = Date.UTC(1891, 4, 4);
const T_1893 = Date.UTC(1893, 11, 1);

// A small typed + temporal corpus. buildStudioScene carries `t` (#234) onto each
// scene node and resolves `type`, which Variant E bands on (Y) / orders by (X).
const GRAPH: StudioSceneGraphLike = {
  nodes: [
    { id: "n1", label: "Sherlock", type: "Character", t: T_1891 },
    { id: "n2", label: "Baker Street", type: "Location", t: T_1887 },
    { id: "n3", label: "Watson", type: "Character", t: T_1893 },
    { id: "n4", label: "Untimed Clue", type: "Evidence" }, // no `t` ⇒ untimed
  ],
  links: [{ source: "n1", target: "n2", relation: "lives_at" }],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("scene layout selection — Variant E time-oriented", () => {
  it("selecting 'time-oriented' STAMPS layout_id + layout_dims on the scene", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "time-oriented");
    expect(scene.layout_id).toBe("time-oriented");
    expect(scene.layout_dims).toBe(2);
  });

  it("pins x/y AND fx/fy, ordering timed nodes by `t` on X", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "time-oriented");
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    for (const node of scene.nodes) {
      expect(typeof node.x).toBe("number");
      expect(typeof node.y).toBe("number");
      expect(node.fx).toBe(node.x);
      expect(node.fy).toBe(node.y);
    }
    // n2 (1887) is oldest, n3 (1893) is newest ⇒ x(n2) < x(n1) < x(n3).
    expect(byId.get("n2")!.x!).toBeLessThan(byId.get("n1")!.x!);
    expect(byId.get("n1")!.x!).toBeLessThan(byId.get("n3")!.x!);
  });

  it("bands by type on Y (same type shares a lane)", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "time-oriented");
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    expect(byId.get("n1")!.y).toBe(byId.get("n3")!.y); // both Character
    expect(byId.get("n1")!.y).not.toBe(byId.get("n2")!.y); // Character vs Location
  });

  it("parks an UNTIMED node left of every timed node (deterministic untimed rail)", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "time-oriented");
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    const untimedX = byId.get("n4")!.x!;
    expect(Number.isFinite(untimedX)).toBe(true);
    for (const id of ["n1", "n2", "n3"]) {
      expect(untimedX).toBeLessThan(byId.get(id)!.x!);
    }
  });

  it("the DEFAULT ('force') does NOT stamp layout_id (back-compat byte-identity)", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "force");
    expect("layout_id" in scene).toBe(false);
    expect("layout_dims" in scene).toBe(false);
  });

  it("attachTimeOrientedPositions stamps the contract directly", () => {
    const scene = attachTimeOrientedPositions(buildStudioScene(clone(GRAPH)));
    expect(scene.layout_id).toBe("time-oriented");
    expect(scene.layout_dims).toBe(2);
  });
});

describe("resolveSceneLayoutId — time-oriented opt-in (default stays force)", () => {
  const prior = process.env.GRAPHIFY_LAYOUT;
  afterEach(() => {
    if (prior === undefined) delete process.env.GRAPHIFY_LAYOUT;
    else process.env.GRAPHIFY_LAYOUT = prior;
  });

  it("defaults to 'force' when unset", () => {
    delete process.env.GRAPHIFY_LAYOUT;
    expect(resolveSceneLayoutId()).toBe("force");
  });

  it("reads GRAPHIFY_LAYOUT=time-oriented (case-insensitive)", () => {
    process.env.GRAPHIFY_LAYOUT = "Time-Oriented";
    expect(resolveSceneLayoutId()).toBe("time-oriented");
  });

  it("still reads typed-layer + falls back to force for anything else", () => {
    process.env.GRAPHIFY_LAYOUT = "typed-layer";
    expect(resolveSceneLayoutId()).toBe("typed-layer");
    process.env.GRAPHIFY_LAYOUT = "bogus";
    expect(resolveSceneLayoutId()).toBe("force");
  });

  it("an explicit arg overrides the env", () => {
    process.env.GRAPHIFY_LAYOUT = "time-oriented";
    expect(resolveSceneLayoutId("force")).toBe("force");
  });
});
