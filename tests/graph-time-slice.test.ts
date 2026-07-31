/**
 * SPEC_AGENTSTATS_TIMEORIENTED §3(a): the file-backend build-time window.
 *
 * These cases pin the shared temporal contract (inclusive overlap, open-ended
 * missing `t_end`, explicit `t_end === t` points, untimed/malformed exclusion)
 * and the two file-backend-only rules: endpoint-induced edges and a
 * re-emittable, loadable graph.json carrying `graph.window`.
 */
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { computeTopologySignatureFromLinks } from "../src/export.js";
import { loadGraphFromData, type SerializedGraphData } from "../src/graph.js";
import {
  GRAPH_TIME_SLICE_SCHEMA,
  GRAPH_WINDOW_SCHEMA,
  sliceGraphByTime,
} from "../src/graph-time-slice.js";

const T0 = 1_750_000_000_000;
const HOUR = 3_600_000;

function graph(overrides: Partial<SerializedGraphData> = {}): SerializedGraphData {
  return {
    directed: true,
    multigraph: false,
    graph: { community_labels: { "0": "Alpha" }, provenance: { source: "test" } },
    topology_signature: "n=0;e=0;|",
    nodes: [],
    links: [],
    hyperedges: [],
    ...overrides,
  } as SerializedGraphData;
}

describe("sliceGraphByTime — shared temporal membership", () => {
  it("keeps a node whose t equals the inclusive upper bound and drops the next instant", () => {
    const result = sliceGraphByTime(
      graph({
        nodes: [
          { id: "on-bound", t: T0 + HOUR },
          { id: "after-bound", t: T0 + HOUR + 1 },
        ],
      }),
      { sinceMs: T0, untilMs: T0 + HOUR },
    );

    expect(result.graph.nodes?.map((node) => node.id)).toEqual(["on-bound"]);
    expect(result.counts.nodes).toEqual({ total: 2, retained: 1 });
  });

  it("keeps a span whose t_end equals the inclusive lower bound and drops one closing earlier", () => {
    const result = sliceGraphByTime(
      graph({
        nodes: [
          { id: "touches-since", t: T0 - HOUR, t_end: T0 },
          { id: "closed-before", t: T0 - HOUR, t_end: T0 - 1 },
        ],
      }),
      { sinceMs: T0, untilMs: T0 + HOUR },
    );

    expect(result.graph.nodes?.map((node) => node.id)).toEqual(["touches-since"]);
  });

  it("treats a missing t_end as open-ended and t_end === t as a point", () => {
    const source = graph({
      nodes: [
        { id: "open", t: T0 },
        { id: "point-in", t: T0 + HOUR, t_end: T0 + HOUR },
        { id: "point-out", t: T0 + 3 * HOUR, t_end: T0 + 3 * HOUR },
      ],
    });

    const inside = sliceGraphByTime(source, { sinceMs: T0 + HOUR, untilMs: T0 + 2 * HOUR });
    expect(inside.graph.nodes?.map((node) => node.id)).toEqual(["open", "point-in"]);
  });

  it("excludes untimed, non-numeric, and inverted-span records without failing the slice", () => {
    const result = sliceGraphByTime(
      graph({
        nodes: [
          { id: "kept", t: T0 },
          { id: "untimed" },
          { id: "string-t", t: String(T0) as unknown as number },
          { id: "nan-t", t: Number.NaN },
          { id: "inverted", t: T0, t_end: T0 - 1 },
          { id: "string-t-end", t: T0, t_end: "later" as unknown as number },
        ],
      }),
      { sinceMs: T0 - HOUR, untilMs: T0 + HOUR },
    );

    expect(result.graph.nodes?.map((node) => node.id)).toEqual(["kept"]);
    expect(result.counts.nodes).toEqual({ total: 6, retained: 1 });
  });

  it("supports half-open windows on either side", () => {
    const source = graph({
      nodes: [
        { id: "early", t: T0 - HOUR, t_end: T0 - HOUR },
        { id: "late", t: T0 + HOUR, t_end: T0 + HOUR },
      ],
    });

    expect(
      sliceGraphByTime(source, { sinceMs: T0, untilMs: null }).graph.nodes?.map((n) => n.id),
    ).toEqual(["late"]);
    expect(
      sliceGraphByTime(source, { sinceMs: null, untilMs: T0 }).graph.nodes?.map((n) => n.id),
    ).toEqual(["early"]);
  });
});

describe("sliceGraphByTime — edges are endpoint-induced", () => {
  const source = graph({
    nodes: [
      { id: "a", t: T0 },
      { id: "b", t: T0 },
      { id: "gone", t: T0 + 10 * HOUR, t_end: T0 + 10 * HOUR },
    ],
    links: [
      { source: "a", target: "b", relation: "worked-in", t: T0, confidence: "EXTRACTED" },
      { source: "a", target: "gone", relation: "produced", t: T0 },
      { source: "a", target: "b", relation: "later", t: T0 + 10 * HOUR, t_end: T0 + 10 * HOUR },
      { source: 42 as unknown as string, target: "b", relation: "malformed", t: T0 },
    ],
  });

  it("drops an in-window edge whose endpoint left the window and counts it", () => {
    const result = sliceGraphByTime(source, { sinceMs: T0, untilMs: T0 + HOUR });

    expect(result.graph.links?.map((link) => link.relation)).toEqual(["worked-in"]);
    expect(result.counts.links).toEqual({
      total: 4,
      retained: 1,
      dropped_missing_endpoint: 1,
    });
  });

  it("emits a graph that loads without dangling links", () => {
    const result = sliceGraphByTime(source, { sinceMs: T0, untilMs: T0 + HOUR });
    const loaded = loadGraphFromData(result.graph);

    expect(loaded.order).toBe(2);
    expect(loaded.size).toBe(1);
  });

  it("keeps a hyperedge only when it is in-window and fully induced", () => {
    const result = sliceGraphByTime(
      graph({
        nodes: [
          { id: "a", t: T0 },
          { id: "b", t: T0 },
          { id: "c", t: T0 + 10 * HOUR, t_end: T0 + 10 * HOUR },
        ],
        hyperedges: [
          { id: "h-kept", nodes: ["a", "b"], relation: "co-occurs", t: T0 },
          { id: "h-dangling", nodes: ["a", "c"], relation: "co-occurs", t: T0 },
          { id: "h-untimed", nodes: ["a", "b"], relation: "co-occurs" },
        ],
      }),
      { sinceMs: T0, untilMs: T0 + HOUR },
    );

    expect(result.graph.hyperedges?.map((h) => h.id)).toEqual(["h-kept"]);
    expect(result.counts.hyperedges).toEqual({ total: 3, retained: 1 });
  });
});

describe("sliceGraphByTime — emitted document", () => {
  const source = graph({
    nodes: [
      { id: "a", t: T0, label: "A", x: 1.5, y: -2, description: "kept", t_src: "startedAt" },
      { id: "b", t: T0, label: "B" },
    ],
    links: [{ source: "a", target: "b", relation: "worked-in", t: T0, t_end: T0 }],
  });

  it("carries retained records verbatim and in source order", () => {
    const result = sliceGraphByTime(source, { sinceMs: T0, untilMs: T0 });

    expect(result.graph.nodes?.[0]).toEqual({
      id: "a",
      t: T0,
      label: "A",
      x: 1.5,
      y: -2,
      description: "kept",
      t_src: "startedAt",
    });
    expect(result.graph.nodes?.map((node) => node.id)).toEqual(["a", "b"]);
  });

  it("stamps graph.window with the chosen bounds and the source identity", () => {
    const result = sliceGraphByTime(source, { sinceMs: T0, untilMs: T0 + HOUR });
    const window = (result.graph.graph as Record<string, unknown>).window;

    expect(window).toEqual({
      schema: GRAPH_WINDOW_SCHEMA,
      since: T0,
      until: T0 + HOUR,
      since_iso: new Date(T0).toISOString(),
      until_iso: new Date(T0 + HOUR).toISOString(),
      predicate: "inclusive-overlap",
      untimed: "excluded",
      edges: "endpoint-induced",
      derived_from: {
        topology_signature_sha256: `sha256:${createHash("sha256")
          .update("n=0;e=0;|", "utf-8")
          .digest("hex")}`,
        nodes: 2,
        links: 1,
        hyperedges: 0,
      },
    });
    expect(result.schema).toBe(GRAPH_TIME_SLICE_SCHEMA);
    expect(result.window).toEqual(window);
  });

  it("preserves the rest of the graph block and unrelated siblings", () => {
    const result = sliceGraphByTime(source, { sinceMs: T0, untilMs: T0 });
    const block = result.graph.graph as Record<string, unknown>;

    expect(block.community_labels).toEqual({ "0": "Alpha" });
    expect(block.provenance).toEqual({ source: "test" });
    expect(result.graph.directed).toBe(true);
    expect(result.graph.multigraph).toBe(false);
  });

  it("recomputes topology_signature instead of inheriting the source one", () => {
    const result = sliceGraphByTime(source, { sinceMs: T0, untilMs: T0 });
    const signature = (result.graph as Record<string, unknown>).topology_signature;

    expect(signature).not.toBe("n=0;e=0;|");
    expect(signature).toBe(
      computeTopologySignatureFromLinks(result.graph.nodes ?? [], result.graph.links ?? []),
    );
  });

  it("mirrors an `edges` source key instead of silently renaming it", () => {
    const result = sliceGraphByTime(
      {
        nodes: [
          { id: "a", t: T0 },
          { id: "b", t: T0 },
        ],
        edges: [{ source: "a", target: "b", relation: "r", t: T0 }],
      } as SerializedGraphData,
      { sinceMs: T0, untilMs: T0 },
    );

    expect(result.graph.edges).toHaveLength(1);
    expect(result.graph.links).toBeUndefined();
  });

  it("never mutates the source document", () => {
    const original = JSON.parse(JSON.stringify(source)) as SerializedGraphData;
    sliceGraphByTime(source, { sinceMs: T0, untilMs: T0 });

    expect(source).toEqual(original);
  });

  it("is deterministic for a given input", () => {
    const a = sliceGraphByTime(source, { sinceMs: T0, untilMs: T0 + HOUR });
    const b = sliceGraphByTime(source, { sinceMs: T0, untilMs: T0 + HOUR });

    expect(JSON.stringify(a.graph)).toBe(JSON.stringify(b.graph));
  });
});

describe("sliceGraphByTime — rejected inputs", () => {
  const timed = graph({ nodes: [{ id: "a", t: T0 }] });

  it("requires at least one bound", () => {
    expect(() => sliceGraphByTime(timed, { sinceMs: null, untilMs: null })).toThrow(
      /at least one of since\/until/,
    );
  });

  it("requires since <= until", () => {
    expect(() => sliceGraphByTime(timed, { sinceMs: T0 + 1, untilMs: T0 })).toThrow(
      /since <= until/,
    );
  });

  it("requires safe integer epoch bounds", () => {
    expect(() => sliceGraphByTime(timed, { sinceMs: T0 + 0.5, untilMs: null })).toThrow(
      /safe integer epoch-ms/,
    );
  });

  it("fails closed on a graph that carries no t stamps at all", () => {
    expect(() =>
      sliceGraphByTime(graph({ nodes: [{ id: "a" }, { id: "b" }] }), {
        sinceMs: T0,
        untilMs: T0 + HOUR,
      }),
    ).toThrow(/no numeric 't' stamps/);
  });
});
