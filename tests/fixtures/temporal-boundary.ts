import Graph from "graphology";
import type { SerializedGraphData } from "../../src/graph.js";

export const TEMPORAL_CURSOR = 1_750_000_000_000;

export const TEMPORAL_VISIBLE_NODE_IDS = ["open", "touches-cursor", "point", "start"];
export const TEMPORAL_VISIBLE_EDGE_RELATIONS = [
  "open-at-cursor",
  "kept-at-cursor",
  "start-at-cursor",
  "point-at-cursor",
];

/**
 * One closed-interval corpus reused by recall, in-memory store, SQLite store,
 * Postgres store, time slice, studio scene, and the browser renderer.
 * Covers all 7 normative boundary cases at TEMPORAL_CURSOR:
 * - `open` (`open-end`): t < cursor, no t_end
 * - `touches-cursor` (`end`): t < cursor, t_end === cursor
 * - `point` (`point`): t === cursor, t_end === cursor
 * - `start` (`start`): t === cursor, t_end > cursor
 * - `ended-before` (`just-before`): t_end === cursor - 1
 * - `starts-after` (`just-after`): t === cursor + 1
 * - `untimed` (`untimed`): no t, no t_end
 */
export function temporalBoundaryFixture(): SerializedGraphData {
  return {
    directed: true,
    multigraph: false,
    graph: { provenance: { source: "temporal-boundary-contract" } },
    nodes: [
      { id: "open", label: "Open-end interval", t: TEMPORAL_CURSOR - 2 },
      {
        id: "touches-cursor",
        label: "Closed at cursor (end)",
        t: TEMPORAL_CURSOR - 1,
        t_end: TEMPORAL_CURSOR,
      },
      {
        id: "point",
        label: "Point at cursor",
        t: TEMPORAL_CURSOR,
        t_end: TEMPORAL_CURSOR,
      },
      {
        id: "start",
        label: "Starts at cursor",
        t: TEMPORAL_CURSOR,
        t_end: TEMPORAL_CURSOR + 2,
      },
      {
        id: "ended-before",
        label: "Closed just-before cursor",
        t: TEMPORAL_CURSOR - 2,
        t_end: TEMPORAL_CURSOR - 1,
      },
      {
        id: "starts-after",
        label: "Starts just-after cursor",
        t: TEMPORAL_CURSOR + 1,
        t_end: TEMPORAL_CURSOR + 2,
      },
      { id: "untimed", label: "Untimed projection scaffolding" },
    ],
    links: [
      {
        source: "open",
        target: "start",
        relation: "open-at-cursor",
        t: TEMPORAL_CURSOR - 2,
      },
      {
        source: "open",
        target: "touches-cursor",
        relation: "kept-at-cursor",
        t: TEMPORAL_CURSOR - 1,
        t_end: TEMPORAL_CURSOR,
      },
      {
        source: "point",
        target: "touches-cursor",
        relation: "start-at-cursor",
        t: TEMPORAL_CURSOR,
        t_end: TEMPORAL_CURSOR + 2,
      },
      {
        source: "start",
        target: "point",
        relation: "point-at-cursor",
        t: TEMPORAL_CURSOR,
        t_end: TEMPORAL_CURSOR,
      },
      {
        source: "open",
        target: "ended-before",
        relation: "dropped-ended",
        t: TEMPORAL_CURSOR - 2,
        t_end: TEMPORAL_CURSOR - 1,
      },
      {
        source: "point",
        target: "starts-after",
        relation: "dropped-after",
        t: TEMPORAL_CURSOR + 1,
        t_end: TEMPORAL_CURSOR + 2,
      },
      { source: "open", target: "untimed", relation: "untimed-edge" },
    ],
    hyperedges: [],
  } as SerializedGraphData;
}

export function temporalBoundaryGraph(): {
  G: Graph;
  communities: Map<number, string[]>;
} {
  const fixture = temporalBoundaryFixture();
  const G = new Graph();
  for (const node of fixture.nodes ?? []) {
    const { id, ...attrs } = node as Record<string, unknown> & { id: string };
    G.addNode(id, attrs);
  }
  for (const link of (fixture.links ?? []) as Array<
    Record<string, unknown> & { source: string; target: string }
  >) {
    const { source, target, ...attrs } = link;
    G.addEdge(source, target, attrs);
  }
  return {
    G,
    communities: new Map([[1, G.nodes()]]),
  };
}
