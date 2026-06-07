import { createPositionFrame } from "./positions";
import type { LayoutEngine, PositionFrame, RenderGraphBuffers } from "./types";

export function createStaticLayoutEngine(): LayoutEngine {
  return {
    *run(graph: RenderGraphBuffers): Iterable<PositionFrame> {
      yield createPositionFrame(new Float32Array(graph.positions), { alpha: 0, tick: 0 });
    },
  };
}
