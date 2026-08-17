import type { SerializedGraphData } from "../../src/graph.js";

export const TEMPORAL_CURSOR = 1_750_000_000_000;

export const TEMPORAL_VISIBLE_NODE_IDS = ["open", "touches-cursor"];
export const TEMPORAL_VISIBLE_EDGE_RELATIONS = ["kept-at-cursor"];

/**
 * One closed-interval corpus reused by recall, store, slice, studio, and the
 * browser renderer. `touches-cursor` ends exactly at the cursor; `ended-before`
 * closes one millisecond earlier; `untimed` is projection scaffolding only.
 */
export function temporalBoundaryFixture(): SerializedGraphData {
  return {
    directed: true,
    multigraph: false,
    graph: { provenance: { source: "temporal-boundary-contract" } },
    nodes: [
      { id: "open", label: "Open", t: TEMPORAL_CURSOR - 2 },
      { id: "touches-cursor", label: "Closed at cursor", t: TEMPORAL_CURSOR - 1, t_end: TEMPORAL_CURSOR },
      { id: "ended-before", label: "Closed before cursor", t: TEMPORAL_CURSOR - 1, t_end: TEMPORAL_CURSOR - 1 },
      { id: "untimed", label: "Untimed projection scaffolding" },
    ],
    links: [
      {
        source: "open",
        target: "touches-cursor",
        relation: "kept-at-cursor",
        t: TEMPORAL_CURSOR - 1,
        t_end: TEMPORAL_CURSOR,
      },
      {
        source: "open",
        target: "ended-before",
        relation: "dropped-ended",
        t: TEMPORAL_CURSOR - 1,
        t_end: TEMPORAL_CURSOR - 1,
      },
      { source: "open", target: "untimed", relation: "untimed-edge" },
    ],
    hyperedges: [],
  } as SerializedGraphData;
}
