import { describe, expect, it } from "vitest";

import { sliceGraphByTime } from "../src/graph-time-slice.js";
import { buildStudioScene } from "../src/studio-scene.js";
import { filterTemporalWindow, recallAsOf } from "../src/temporal-recall.js";
// @ts-expect-error — plain ESM JS module, no type declarations.
import { applyTimeFilter, sceneTimeRange } from "../studio/src/lib/graphAdapter.js";
import {
  TEMPORAL_CURSOR,
  TEMPORAL_VISIBLE_EDGE_RELATIONS,
  TEMPORAL_VISIBLE_NODE_IDS,
  temporalBoundaryFixture,
} from "./fixtures/temporal-boundary.js";

function ids(items: ReadonlyArray<{ id: string }>): string[] {
  return items.map((item) => item.id);
}

function relations(items: ReadonlyArray<{ relation: string }>): string[] {
  return items.map((item) => item.relation);
}

describe("closed temporal interval contract", () => {
  it("keeps t_end===cursor and drops t_end<cursor on recall/store/slice/renderer", async () => {
    const fixture = temporalBoundaryFixture();
    const recalled = filterTemporalWindow(fixture, TEMPORAL_CURSOR, TEMPORAL_CURSOR);
    expect(ids(recalled.nodes)).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
    expect(relations(recalled.edges)).toEqual(TEMPORAL_VISIBLE_EDGE_RELATIONS);

    const stored = await recallAsOf(
      { asOf: TEMPORAL_CURSOR, store: "temporal-fixture" },
      {
        resolveStore: async () => ({
          capabilities: { queryWindow: true },
          queryWindow: async (fromMs: number, toMs: number) =>
            filterTemporalWindow(fixture, fromMs, toMs),
          readSnapshotMeta: async () => ({
            topologySignature: "temporal-fixture",
            pushedAt: new Date(TEMPORAL_CURSOR).toISOString(),
            toolVersion: "test",
          }),
          close: async () => undefined,
        }) as never,
      },
    );
    expect(ids(stored.nodes)).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
    expect(relations(stored.edges)).toEqual(TEMPORAL_VISIBLE_EDGE_RELATIONS);

    const sliced = sliceGraphByTime(fixture, {
      sinceMs: TEMPORAL_CURSOR,
      untilMs: TEMPORAL_CURSOR,
    });
    expect(ids(sliced.graph.nodes ?? [])).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
    expect(relations((sliced.graph.links ?? []) as Array<{ relation: string }>)).toEqual(
      TEMPORAL_VISIBLE_EDGE_RELATIONS,
    );

    const rendered = applyTimeFilter(buildStudioScene(fixture), TEMPORAL_CURSOR);
    expect(ids(rendered.nodes)).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
    expect(relations(rendered.edges)).toEqual(TEMPORAL_VISIBLE_EDGE_RELATIONS);

    expect(recalled.interval_convention).toBe("closed-v1");
    expect(stored.interval_convention).toBe("closed-v1");
    expect(sliced.window.interval_convention).toBe("closed-v1");
    expect(rendered.temporal.interval_convention).toBe("closed-v1");
  });

  it("active filter drops untimed elements and scene range includes finite t_end", () => {
    const scene = buildStudioScene(temporalBoundaryFixture());
    const active = applyTimeFilter(scene, TEMPORAL_CURSOR);

    expect(ids(active.nodes)).toEqual(TEMPORAL_VISIBLE_NODE_IDS);
    expect(relations(active.edges)).toEqual(TEMPORAL_VISIBLE_EDGE_RELATIONS);
    expect(sceneTimeRange(scene)).toEqual({
      min: TEMPORAL_CURSOR - 2,
      max: TEMPORAL_CURSOR,
    });
  });
});
