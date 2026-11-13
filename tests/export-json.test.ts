import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import { toCypher, toJson } from "../src/export.js";

const cleanupDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-export-json-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("toJson shrink guard", () => {
  it("refuses to overwrite an existing larger graph unless forced", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "alpha", label: "Alpha", source_file: "src/a.ts", file_type: "code" },
          { id: "beta", label: "Beta", source_file: "src/b.ts", file_type: "code" },
        ],
        links: [],
      }, null, 2),
      "utf-8",
    );

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args.join(" ")); };
    try {
      const graph = new Graph();
      graph.addNode("alpha", { label: "Alpha", source_file: "src/a.ts", file_type: "code" });
      const written = toJson(graph, new Map([[0, ["alpha"]]]), graphPath);
      expect(written).toBe(false);
    } finally {
      console.warn = originalWarn;
    }

    const persisted = JSON.parse(readFileSync(graphPath, "utf-8")) as { nodes: Array<{ id: string }> };
    expect(persisted.nodes).toHaveLength(2);
    expect(warnings.join("\n")).toContain("Refusing to overwrite");
  });

  it("overwrites when force=true is supplied", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "alpha", label: "Alpha", source_file: "src/a.ts", file_type: "code" },
          { id: "beta", label: "Beta", source_file: "src/b.ts", file_type: "code" },
        ],
        links: [],
      }, null, 2),
      "utf-8",
    );

    const graph = new Graph();
    graph.addNode("alpha", { label: "Alpha", source_file: "src/a.ts", file_type: "code" });
    const written = toJson(graph, new Map([[0, ["alpha"]]]), graphPath, { force: true });

    expect(written).toBe(true);
    const persisted = JSON.parse(readFileSync(graphPath, "utf-8")) as { nodes: Array<{ id: string }> };
    expect(persisted.nodes).toHaveLength(1);
    expect(persisted.nodes[0]?.id).toBe("alpha");
  });
});

describe("toCypher", () => {
  it("escapes control characters in string literals and allowlists identifiers", () => {
    const dir = tempDir();
    const outputPath = join(dir, "cypher.txt");
    const graph = new Graph();
    graph.addNode("alpha'\nMATCH", {
      label: "Alpha'\nMATCH (n) DETACH DELETE n",
      file_type: "123 invalid",
    });
    graph.addNode("beta", { label: "Beta", file_type: "code" });
    graph.addEdge("alpha'\nMATCH", "beta", {
      relation: "123\nDELETE",
      confidence: "EXTRACTED\nCREATE",
    });

    toCypher(graph, outputPath);

    const cypher = readFileSync(outputPath, "utf-8");
    expect(cypher).toContain(":Entity");
    expect(cypher).toContain("[:RELATES_TO ");
    expect(cypher).toContain("Alpha\\'\\nMATCH");
    expect(cypher).toContain("EXTRACTED\\nCREATE");
    expect(cypher).not.toContain("Alpha'\nMATCH");
    expect(cypher).not.toContain("[:123");
  });
});


import { vi as mlVi } from "vitest";
import * as mlNeo4j from "../src/storage/neo4j.js";
import { loadGraphFromData as mlLoad } from "../src/graph.js";
import { pushToNeo4j as mlPush } from "../src/export.js";
import * as mlExports from "../src/export.js";
import { main as mlRuntimeMain } from "../src/skill-runtime.js";
import { runStorePush as mlCliPush } from "../src/store-cli.js";
import { edge as mlEdge, extraction as mlExtraction, fromRows as mlBuild, rows as mlRows, writeGraph as mlWrite, writers as mlWriters, observation as mlObservation, expectObservations as mlObs, expectFixedPoint as mlFixed } from "./helpers/multi-links.js";
import { skillDocuments as mlSkills, readSkill as mlReadSkill, executePushSnippet as mlSkillPush } from "./helpers/multi-links-skills.js";
describe("L0-E/S export",()=>{
  for(const writer of mlWriters) describe(writer,()=>{
    it.fails("serializer-vote-law-both-serializers",()=>{
      const a=mlEdge({confidence:"AMBIGUOUS"}),b=mlEdge({confidence:"EXTRACTED"});
      const merged=mlBuild([a,b]);
      const serializedA=mlWrite(mlBuild([a]),writer);
      const loaded=mlLoad(serializedA);
      const second=mlBuild([...mlRows(loaded,writer),b]);
      const left=mlRows(merged,writer),right=mlRows(second,writer);
      expect(left[0].confidence_score).toBe(1.0);
      expect(right[0].confidence_score).toBe(1.0);
      mlObs(left[0],[mlObservation(a),mlObservation(b)]);
      mlObs(right[0],[mlObservation(a),mlObservation(b)]);
      expect(JSON.stringify(left)).toBe(JSON.stringify(right));
      expect(JSON.stringify(mlRows(merged,"serializeGraph"))).toBe(JSON.stringify(mlRows(merged,"toJson")));
      mlFixed(second,[a,b]);
    });
  });
  it.fails("M3-public-neo4j-wrapper-propagates-warning",async()=>{
    const warning="neo4j: observations not persisted for 1 edge";
    const fake={id:"neo4j",capabilities:{push:true},pushGraph:mlVi.fn(async()=>({nodes:2,edges:1,warnings:[warning],durationMs:0})),close:mlVi.fn(async()=>{})};
    const factory=mlVi.spyOn(mlNeo4j,"createNeo4jGraphStore").mockResolvedValue(fake as never);
    try {
      const G=mlBuild([mlEdge()]);
      const result=await mlPush(G,{uri:"bolt://fixture",user:"fixture",password:"fixture"});
      expect(factory).toHaveBeenCalledTimes(1);
      expect(fake.pushGraph).toHaveBeenCalledWith(G,new Map(),{mode:"merge"});
      expect(fake.close).toHaveBeenCalledTimes(1);
      expect((result as any).warnings).toEqual([warning]);
    } finally {factory.mockRestore();}
  });
  it("Neo4j warning reaches the real store CLI output",async()=>{
    const warning="neo4j: observations not persisted for 1 edge",graphPath=join(tempDir(),"graph.json");
    writeFileSync(graphPath,JSON.stringify(mlWrite(mlBuild([mlEdge()]),"serializeGraph")));
    const log=mlVi.fn();
    const store={id:"neo4j",capabilities:{push:true},pushGraph:async()=>({nodes:2,edges:1,warnings:[warning],durationMs:0}),close:async()=>{}};
    await mlCliPush({graph:graphPath,store:"neo4j",mode:"merge"},{env:{},resolveStore:async()=>store as never,log});
    expect(log.mock.calls.flat().join("\n")).toContain(warning);
  });
  for (const boundary of ["warning-bearing wrapper", "real wrapper and adapter"]) it.fails("push-neo4j runtime command emits warnings from its " + boundary, async () => {
    const warning = "neo4j: observations not persisted for 1 edge", dir = tempDir();
    const extract = join(dir, "extract.json"), analysis = join(dir, "analysis.json");
    writeFileSync(extract, JSON.stringify(mlExtraction([mlEdge()]))); writeFileSync(analysis, JSON.stringify({ communities: {} }));
    const adapter = { id: "neo4j", capabilities: { push: true }, pushGraph: mlVi.fn(async () => ({ nodes: 2, edges: 1, warnings: [warning], durationMs: 0 })), close: mlVi.fn(async () => {}) };
    const seam = boundary === "warning-bearing wrapper"
      ? mlVi.spyOn(mlExports, "pushToNeo4j").mockResolvedValue({ nodes: 2, edges: 1, warnings: [warning] } as never)
      : mlVi.spyOn(mlNeo4j, "createNeo4jGraphStore").mockResolvedValue(adapter as never);
    const log = mlVi.spyOn(console, "log").mockImplementation(() => {}), warn = mlVi.spyOn(console, "warn").mockImplementation(() => {}), error = mlVi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await mlRuntimeMain(["node", "skill-runtime", "push-neo4j", "--extract", extract, "--analysis", analysis, "--uri", "bolt://fixture", "--user", "fixture", "--password", "fixture"]);
      expect(seam).toHaveBeenCalledTimes(1);
      if (boundary === "real wrapper and adapter") { expect(adapter.pushGraph).toHaveBeenCalledTimes(1); expect(adapter.close).toHaveBeenCalledTimes(1); }
      const output = [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].flat().join("\n");
      expect(output).toContain("Pushed to Neo4j: 2 nodes, 1 edges");
      expect(output, "the wrapper's actual CLI caller must print its diagnostics").toContain(warning);
    } finally { seam.mockRestore(); log.mockRestore(); warn.mockRestore(); error.mockRestore(); }
  });
  for (const path of mlSkills) for (const boundary of ["warning-bearing wrapper", "real wrapper and adapter"]) it.fails(path + " shipped push awaits and emits counts/warnings from its " + boundary, async () => {
    const warning = "neo4j: observations not persisted for 1 edge";
    const adapter = { id: "neo4j", capabilities: { push: true }, pushGraph: mlVi.fn(async () => ({ nodes: 2, edges: 1, warnings: [warning], durationMs: 0 })), close: mlVi.fn(async () => {}) };
    const seam = boundary === "warning-bearing wrapper"
      ? mlVi.spyOn(mlExports, "pushToNeo4j").mockResolvedValue({ nodes: 2, edges: 1, warnings: [warning] } as never)
      : mlVi.spyOn(mlNeo4j, "createNeo4jGraphStore").mockResolvedValue(adapter as never);
    try {
      const output = (await mlSkillPush(mlReadSkill(path), mlExtraction([mlEdge()]))).join("\n");
      expect(seam).toHaveBeenCalledTimes(1);
      if (boundary === "real wrapper and adapter") { expect(adapter.pushGraph).toHaveBeenCalledTimes(1); expect(adapter.close).toHaveBeenCalledTimes(1); }
      expect(output).toContain("Pushed to Neo4j: 2 nodes, 1 edges");
      expect(output, "the actual shipped async push consumer must print its diagnostics").toContain(warning);
    } finally { seam.mockRestore(); }
  });
});
