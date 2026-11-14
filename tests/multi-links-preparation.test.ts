import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as build from "../src/build.js";
import * as batch from "../src/extract-git.js";
import { mergeExtractionsWithCitations } from "../src/extract-git.js";
import { edge, extraction, node, tempDir, type Row } from "./helpers/multi-links.js";

describe("P1 preparation and legacy reader bodies", () => {
  it("activates no-root preparation before batch capture and derives confidence", () => {
    const input = [
      extraction([edge({ source_file: "src\\f.ts", source_location: "L1", confidence: "AMBIGUOUS" })]),
      extraction([edge({ source_file: "src/f.ts", source_location: "L2", confidence: "EXTRACTED" })]),
    ];
    const result = mergeExtractionsWithCitations(input).extraction;
    expect(result.edges).toHaveLength(1);
    expect(result.edges.map(row => row.source_file)).toEqual(["src/f.ts"]);
    expect(result.edges[0].evidence_observations).toHaveLength(2);
    const G = build.buildFromJson(result);
    expect(G.getEdgeAttribute(G.edges()[0], "confidence")).toBe("EXTRACTED");
  });

  it("prepares fresh locators before citation merge grouping with an additive root", () => {
    const mergePrepared = (batch as Row).mergeExtractionsWithCitationsPrepared;
    expect(mergePrepared).toBeTypeOf("function");
    const input = ["/repo/f.ts", "f.ts"].map(source_file => extraction([edge({ source_file })]));
    expect(mergePrepared(input, { root: "/repo" }).extraction.edges).toHaveLength(1);
    expect(input[0].edges[0].source_file).toBe("/repo/f.ts");
    expect(mergePrepared([extraction([edge({ source_file: "src\\f.ts" })])]).extraction.edges[0].source_file).toBe("src/f.ts");
    expect(mergePrepared([input[0]]).extraction.edges[0].source_file).toBe("/repo/f.ts");
  });

  it("never prepares a captured locator or its observations", () => {
    const rec = { source_file: "/repo/f.ts", confidence: "INFERRED" };
    const input = extraction([edge({ source_file: "/repo/f.ts", confidence: "INFERRED", evidence_observations: [rec] })]);
    const result = (batch as Row).mergeExtractionsWithCitationsPrepared([input], { root: "/repo" }).extraction.edges[0];
    expect(result.source_file).toBe("/repo/f.ts");
    expect(result.evidence_observations).toEqual([rec]);
  });

  it("captures raw evidence before building a typed legacy shell in the unwired reader", () => {
    const path = join(tempDir(), "graph.json");
    const raw = { nodes: [node("a"), node("b")], links: [{ source: "a", target: "b", relation: "calls", source_file: "/repo/f.ts", derivation_methods: ["ast", "peer"] }] };
    writeFileSync(path, JSON.stringify(raw));
    const read = (build as Row).readExistingGraphExtractionPrepared;
    expect(read).toBeTypeOf("function");
    const prepared = read(path).extraction.edges[0];
    expect(prepared.evidence_observations).toEqual([
      { source_file: "/repo/f.ts", derivation_method: "ast" },
      { source_file: "/repo/f.ts", derivation_method: "peer" },
    ]);
    expect(prepared.evidence_observations.every((rec: Row) => !Object.hasOwn(rec, "confidence"))).toBe(true);
    raw.links[0] = { ...raw.links[0], confidence: "INFERRED" } as never;
    writeFileSync(path, JSON.stringify(raw));
    expect(read(path).extraction.edges[0].evidence_observations.every((rec: Row) => rec.confidence === "INFERRED")).toBe(true);
  });

  it("rejects all-malformed captured evidence before returning a typed legacy shell", () => {
    const path = join(tempDir(), "graph.json");
    const raw = { nodes: [node("a"), node("b")], links: [edge({ evidence_observations: [null, 1] })] };
    const before = JSON.stringify(raw);
    writeFileSync(path, before);
    expect(() => build.readExistingGraphExtractionPrepared(path)).toThrow(/captured.*no valid observations/i);
    expect(JSON.stringify(raw)).toBe(before);
  });
});
