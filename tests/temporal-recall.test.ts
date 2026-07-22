/**
 * T6 pure temporal graph recall contract: timestamp parsing plus the
 * deterministic graph.json overlap fallback.
 */
import { describe, expect, it } from "vitest";

import {
  filterTemporalWindow,
  parseRecallTimestamp,
} from "../src/temporal-recall.js";

const AT = Date.parse("2026-07-22T12:00:00.000Z");

describe("parseRecallTimestamp", () => {
  it("treats safe base-10 epoch-ms and timezone-explicit ISO as the same instant", () => {
    expect(parseRecallTimestamp(String(AT))).toBe(AT);
    expect(parseRecallTimestamp(AT)).toBe(AT);
    expect(parseRecallTimestamp("2026-07-22T12:00:00.000Z")).toBe(AT);
    expect(parseRecallTimestamp("2026-07-22T08:00:00.000-04:00")).toBe(AT);
  });

  it("rejects ambiguous, coerced, fractional, unsafe, and non-finite timestamps", () => {
    for (const invalid of [
      "2026-07-22",
      "2026-07-22T12:00:00",
      "1e3",
      "1.5",
      "Infinity",
      "NaN",
      "9007199254740992",
      "not-a-date",
    ]) {
      expect(() => parseRecallTimestamp(invalid)).toThrow(/--as-of/);
    }
    expect(() => parseRecallTimestamp(Number.NaN)).toThrow(/safe integer/);
    expect(() => parseRecallTimestamp(Number.POSITIVE_INFINITY)).toThrow(/safe integer/);
    expect(() => parseRecallTimestamp(1.5)).toThrow(/safe integer/);
  });
});

describe("filterTemporalWindow", () => {
  it("uses inclusive point/open/span semantics and excludes malformed records", () => {
    const result = filterTemporalWindow(
      {
        nodes: [
          { id: "right", label: "Right", node_type: "Commit", t: 200, t_end: 200 },
          { id: "point", label: "Point", node_type: "Commit", t: 100, t_end: 100 },
          { id: "open", label: "Open", node_type: "Session", t: 40, t_src: "startedAt" },
          { id: "closed-end", label: "Closed", node_type: "Session", t: 50, t_end: 100 },
          { id: "before", label: "Before", node_type: "Session", t: 50, t_end: 99 },
          { id: "spanning", label: "Spanning", node_type: "Session", t: 90, t_end: 210 },
          { id: "untimed", label: "Untimed" },
          { id: "bad-t", label: "Bad t", t: "100" },
          { id: "bad-end", label: "Bad end", t: 80, t_end: "open" },
          { id: "inverted", label: "Inverted", t: 100, t_end: 99 },
          { id: "nonfinite", label: "Nonfinite", t: Number.POSITIVE_INFINITY },
        ],
        links: [
          { source: "z", target: "a", relation: "late-order", t: 100, t_end: 100 },
          {
            source: "ghost",
            target: "untimed",
            relation: "independent",
            confidence: "DIRECT",
            t: 100,
            t_end: 100,
            provenance: { source: "fixture" },
          },
          { source: "open", target: "untimed", relation: "open-edge", t: 40 },
          { source: "before", target: "right", relation: "before-edge", t: 50, t_end: 99 },
          { source: "bad-end", target: "inverted", relation: "bad", t: 80, t_end: null },
        ],
      },
      100,
      100,
    );

    expect(result.nodes.map((node) => node.id)).toEqual([
      "open",
      "closed-end",
      "spanning",
      "point",
    ]);
    expect(result.nodes[0]).toMatchObject({
      id: "open",
      t: 40,
      t_src: "startedAt",
    });
    expect(result.nodes[0]).not.toHaveProperty("t_end");
    expect(result.edges.map((edge) => edge.relation)).toEqual([
      "open-edge",
      "independent",
      "late-order",
    ]);
    expect(result.edges[1]).toMatchObject({
      source: "ghost",
      target: "untimed",
      relation: "independent",
      provenance: { source: "fixture" },
    });
  });

  it("sorts ties by code-point identity and supports the legacy edges key", () => {
    const result = filterTemporalWindow(
      {
        nodes: [
          { id: "b", label: "B", t: 10, t_end: 10 },
          { id: "A", label: "A", t: 10, t_end: 10 },
          { id: "a", label: "a", t: 10, t_end: 10 },
        ],
        edges: [
          { source: "b", target: "a", relation: "z", t: 10, t_end: 10 },
          { source: "A", target: "b", relation: "a", t: 10, t_end: 10 },
        ],
      },
      10,
      10,
    );
    expect(result.nodes.map((node) => node.id)).toEqual(["A", "a", "b"]);
    expect(result.edges.map((edge) => `${edge.source}:${edge.target}:${edge.relation}`)).toEqual([
      "A:b:a",
      "b:a:z",
    ]);
  });

  it("rejects invalid windows before filtering", () => {
    expect(() => filterTemporalWindow({}, Number.NaN, 1)).toThrow(/finite/);
    expect(() => filterTemporalWindow({}, 2, 1)).toThrow(/fromMs <= toMs/);
  });
});
