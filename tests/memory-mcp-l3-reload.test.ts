import { describe, expect, it } from "vitest";
import { loadGraphFromData, type SerializedGraphData } from "../src/graph.js";

function persistedMemory(graph?: Record<string, unknown>): SerializedGraphData {
  return {
    graph,
    nodes: [
      { id: "code", file_type: "code" },
      { id: "memory:record", file_type: "memory", memory_projection: { projection_cursor: "7" } },
    ],
    links: [{ source: "memory:record", target: "code", relation: "memory_about" }],
  };
}

describe("MCP-L3 mandatory reload freshness", () => {
  it("should refuse projection 7 / high-water 12 before returning any memory", () => {
    const raw = persistedMemory({ memory_projection_cursor: "7", memory_high_water_cursor: "12" });
    expect(() => loadGraphFromData(raw)).toThrow(/PROJECTION_STALE/);
  });

  it.each([undefined, {}, { memory_projection_cursor: "7", memory_high_water_cursor: "7" }])(
    "should refuse memory without a live high-water proof even with persisted pins %j",
    (graph) => {
      expect(() => loadGraphFromData(persistedMemory(graph))).toThrow(/PROJECTION_STALE/);
    },
  );

  it("should keep code-only reloads available without a memory proof", () => {
    const G = loadGraphFromData({ nodes: [{ id: "code", file_type: "code" }] });
    expect(G.nodes()).toEqual(["code"]);
  });

  it("should expose current memory only with a live high-water proof", () => {
    const raw = persistedMemory({ memory_projection_cursor: "7", memory_high_water_cursor: "7" });
    expect(loadGraphFromData(raw, { memoryHighWaterCursor: "7" }).hasNode("memory:record")).toBe(true);
    expect(() => loadGraphFromData(raw, { memoryHighWaterCursor: "12" })).toThrow(/PROJECTION_STALE/);
  });

  it.each([undefined, {}, { memory_projection_cursor: "7" }, { memory_projection_cursor: "7", memory_high_water_cursor: "12" }])(
    "should refuse missing or stale persisted pins %j even with a live proof",
    (graph) => {
      expect(() => loadGraphFromData(persistedMemory(graph), { memoryHighWaterCursor: "7" })).toThrow(/PROJECTION_STALE/);
    },
  );
});
