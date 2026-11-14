import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeGraphJsonFiles } from "../src/merge-driver.js";
import { buildMerge } from "../src/build.js";
import { loadGraphFromData, serializeGraph } from "../src/graph.js";
import { tempDir, extraction, node } from "./helpers/multi-links.js";

describe("P1 format refusal before writer migration", () => {
  it("activates the factory-backed loader and offers explicit read-only inspection", () => {
    expect(loadGraphFromData({ nodes: [node("a")] }).multi).toBe(true);
    const future = { graph_format: "engram-graph/3", nodes: [node("a")] };
    expect(() => loadGraphFromData(future)).toThrowError(expect.objectContaining({ code: "unsupported-graph-format" }));
    const inspected = loadGraphFromData(future, { allowUnknownFormatReadOnly: true });
    expect(inspected.getAttributes()).toMatchObject({ graph_format: "engram-graph/3", read_only: true });
    expect(() => serializeGraph(inspected)).toThrowError(expect.objectContaining({ code: "unsupported-graph-format" }));
  });

  it("rejects every raw merge-driver input, including the copy branch", () => {
    for (const offending of ["ancestor", "current", "other", "copy"]) {
      const dir = tempDir();
      const paths = Object.fromEntries(["ancestor", "current", "other"].map(name => [name, join(dir, name + ".json")]));
      for (const name of ["ancestor", "current", "other"]) {
        if (offending === "copy" && name === "current") continue;
        const raw = { nodes: [node("a")], links: [], ...((name === offending || offending === "copy" && name === "other") ? { graph_format: "engram-graph/3" } : {}) };
        writeFileSync(paths[name], JSON.stringify(raw));
      }
      const before = existsSync(paths.current) ? readFileSync(paths.current, "utf8") : undefined;
      expect(() => mergeGraphJsonFiles(paths.ancestor, paths.current, paths.other)).toThrowError(expect.objectContaining({ code: "unsupported-graph-format" }));
      expect(existsSync(paths.current) ? readFileSync(paths.current, "utf8") : undefined).toBe(before);
    }
  });

  it("refuses a future raw snapshot before buildMerge constructs a typed shell", () => {
    const path = join(tempDir(), "graph.json");
    const bytes = JSON.stringify({ graph_format: "engram-graph/3", nodes: [node("a")], links: [] });
    writeFileSync(path, bytes);
    expect(() => buildMerge([extraction([])], { graphPath: path })).toThrowError(expect.objectContaining({ code: "unsupported-graph-format" }));
    expect(readFileSync(path, "utf8")).toBe(bytes);
  });
});
