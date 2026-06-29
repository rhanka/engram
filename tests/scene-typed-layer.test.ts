import { afterEach, describe, expect, it } from "vitest";

import {
  applySceneLayout,
  attachTypedLayerPositions,
  resolveSceneLayoutId,
} from "../src/scene-layout.js";
import { buildStudioScene, type StudioSceneGraphLike } from "../src/studio-scene.js";

// A small typed corpus (Sherlock-ish). buildStudioScene resolves `type` onto
// each scene node, which is what the typed-layer layout bands on.
const GRAPH: StudioSceneGraphLike = {
  nodes: [
    { id: "n1", label: "Sherlock", type: "Character" },
    { id: "n2", label: "Baker Street", type: "Location" },
    { id: "n3", label: "Watson", type: "Character" },
    { id: "n4", label: "Revolver", type: "Evidence" },
    { id: "n5", label: "Scotland Yard", type: "Location" },
  ],
  links: [
    { source: "n1", target: "n2", relation: "lives_at" },
    { source: "n1", target: "n3", relation: "assists" },
  ],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("scene layout selection — Variant A typed-layer", () => {
  it("selecting 'typed-layer' STAMPS layout_id + layout_dims on the scene", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "typed-layer");
    expect(scene.layout_id).toBe("typed-layer");
    expect(scene.layout_dims).toBe(2);
  });

  it("typed-layer pins x/y AND fx/fy, banded by type", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "typed-layer");
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    for (const node of scene.nodes) {
      expect(typeof node.x).toBe("number");
      expect(typeof node.y).toBe("number");
      // Pinned: fx/fy mirror x/y so the SPA renders the layout directly.
      expect(node.fx).toBe(node.x);
      expect(node.fy).toBe(node.y);
    }
    // Same type ⇒ same y band; different type ⇒ different band.
    expect(byId.get("n1")!.y).toBe(byId.get("n3")!.y); // both Character
    expect(byId.get("n2")!.y).toBe(byId.get("n5")!.y); // both Location
    expect(byId.get("n1")!.y).not.toBe(byId.get("n2")!.y); // Character vs Location
    expect(byId.get("n4")!.y).not.toBe(byId.get("n1")!.y); // Evidence vs Character
  });

  it("the DEFAULT ('force') does NOT stamp layout_id (back-compat byte-identity)", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)), "force");
    expect("layout_id" in scene).toBe(false);
    expect("layout_dims" in scene).toBe(false);
    // Positions are still produced (FA2), just not typed-layer's identity.
    expect(scene.nodes.every((n) => typeof n.x === "number")).toBe(true);
  });

  it("applySceneLayout defaults to force when no id is given", () => {
    const scene = applySceneLayout(buildStudioScene(clone(GRAPH)));
    expect("layout_id" in scene).toBe(false);
  });

  it("attachTypedLayerPositions stamps the contract directly", () => {
    const scene = attachTypedLayerPositions(buildStudioScene(clone(GRAPH)));
    expect(scene.layout_id).toBe("typed-layer");
    expect(scene.layout_dims).toBe(2);
  });
});

describe("resolveSceneLayoutId — opt-in selection (default stays force)", () => {
  const prior = process.env.GRAPHIFY_LAYOUT;
  afterEach(() => {
    if (prior === undefined) delete process.env.GRAPHIFY_LAYOUT;
    else process.env.GRAPHIFY_LAYOUT = prior;
  });

  it("defaults to 'force' when unset", () => {
    delete process.env.GRAPHIFY_LAYOUT;
    expect(resolveSceneLayoutId()).toBe("force");
  });

  it("reads GRAPHIFY_LAYOUT=typed-layer (case-insensitive)", () => {
    process.env.GRAPHIFY_LAYOUT = "Typed-Layer";
    expect(resolveSceneLayoutId()).toBe("typed-layer");
  });

  it("anything else resolves to force", () => {
    process.env.GRAPHIFY_LAYOUT = "bogus";
    expect(resolveSceneLayoutId()).toBe("force");
  });

  it("an explicit arg overrides the env", () => {
    process.env.GRAPHIFY_LAYOUT = "typed-layer";
    expect(resolveSceneLayoutId("force")).toBe("force");
  });
});
