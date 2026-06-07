import { describe, expect, it } from "vitest";
import { createGraphRenderer, createPositionFrame } from "../src/index";

describe("createGraphRenderer", () => {
  it("keeps rendering state separate from layout physics", () => {
    const view = createGraphRenderer(null, { interaction: { hover: true } });
    view.setGraph({
      nodeIds: ["a", "b"],
      positions: new Float32Array([0, 0, 100, 50]),
      edges: new Uint32Array([0, 1]),
    });

    view.setPositions(new Float32Array([10, 20, 110, 70]));
    view.updatePositions(createPositionFrame(new Float32Array([20, 30, 120, 80]), { tick: 2 }));
    view.fitView({ padding: 10, viewportWidth: 200, viewportHeight: 100 });
    view.setCamera({ x: 1, y: 2, zoom: 3 });

    const snapshot = view.snapshot();
    expect(snapshot.nodeCount).toBe(2);
    expect(snapshot.edgeCount).toBe(1);
    expect(snapshot.positions).toEqual([20, 30, 120, 80]);
    expect(snapshot.camera).toEqual({ x: 1, y: 2, zoom: 3 });
    expect(snapshot.layoutOptions).toBeUndefined();

    view.destroy();
    expect(view.snapshot().destroyed).toBe(true);
  });
});
