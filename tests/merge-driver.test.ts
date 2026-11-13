import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { mergeGraphJsonFiles } from "../src/merge-driver.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-merge-driver-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("merge graph driver", () => {
  it("union-merges graph.json nodes, links, hyperedges, and labels", () => {
    const dir = tempDir();
    const ancestor = join(dir, "ancestor.json");
    const current = join(dir, "current.json");
    const other = join(dir, "other.json");

    writeFileSync(
      ancestor,
      JSON.stringify({
        directed: false,
        graph: {
          community_labels: {
            "0": "Core",
          },
          built_from_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        nodes: [
          { id: "alpha", label: "Alpha", source_file: "src/alpha.ts", file_type: "code", community: 0 },
        ],
        links: [],
      }, null, 2),
      "utf-8",
    );
    writeFileSync(
      current,
      JSON.stringify({
        directed: false,
        graph: {
          community_labels: {
            "0": "Core",
          },
          built_from_commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
        nodes: [
          { id: "alpha", label: "Alpha", source_file: "src/alpha.ts", file_type: "code", community: 0 },
        ],
        links: [
          { source: "alpha", target: "beta", relation: "uses", confidence: "EXTRACTED" },
        ],
        hyperedges: [
          { id: "shared_flow", label: "Shared Flow", nodes: ["alpha", "beta"], relation: "participate_in", confidence: "EXTRACTED", source_file: "src/alpha.ts" },
        ],
      }, null, 2),
      "utf-8",
    );
    writeFileSync(
      other,
      JSON.stringify({
        directed: false,
        graph: {
          community_labels: {
            "1": "Docs",
          },
          built_from_commit: "cccccccccccccccccccccccccccccccccccccccc",
        },
        nodes: [
          { id: "beta", label: "Beta", source_file: "docs/beta.md", file_type: "document", community: 1 },
        ],
        links: [
          { source: "alpha", target: "beta", relation: "uses", confidence: "EXTRACTED" },
        ],
        hyperedges: [
          { id: "shared_flow", label: "Shared Flow", nodes: ["alpha", "beta"], relation: "participate_in", confidence: "EXTRACTED", source_file: "docs/beta.md" },
        ],
      }, null, 2),
      "utf-8",
    );

    const result = mergeGraphJsonFiles(ancestor, current, other);
    const merged = JSON.parse(readFileSync(current, "utf-8")) as {
      graph?: { community_labels?: Record<string, string>; built_from_commit?: string | null };
      nodes: Array<{ id: string }>;
      links: Array<{ source: string; target: string; relation?: string }>;
      hyperedges?: Array<{ id?: string }>;
    };

    expect(result.nodeCount).toBe(2);
    expect(result.edgeCount).toBe(1);
    expect(merged.nodes.map((node) => node.id)).toEqual(["alpha", "beta"]);
    expect(merged.links).toEqual([
      expect.objectContaining({ source: "alpha", target: "beta", relation: "uses" }),
    ]);
    expect(merged.hyperedges).toEqual([
      expect.objectContaining({ id: "shared_flow" }),
    ]);
    expect(merged.graph?.community_labels).toMatchObject({
      "0": "Core",
      "1": "Docs",
    });
    expect(merged.graph?.built_from_commit).toBeNull();
  });

  it("rejects graph inputs above the merge-driver node cap", () => {
    const dir = tempDir();
    const ancestor = join(dir, "ancestor.json");
    const current = join(dir, "current.json");
    const other = join(dir, "other.json");
    const tooManyNodes = Array.from({ length: 100_001 }, (_, index) => ({
      id: `node_${index}`,
      label: `Node ${index}`,
    }));

    writeFileSync(ancestor, JSON.stringify({ directed: false, graph: {}, nodes: [], links: [] }), "utf-8");
    writeFileSync(current, JSON.stringify({ directed: false, graph: {}, nodes: tooManyNodes, links: [] }), "utf-8");
    writeFileSync(other, JSON.stringify({ directed: false, graph: {}, nodes: [], links: [] }), "utf-8");

    expect(() => mergeGraphJsonFiles(ancestor, current, other)).toThrow("exceeds 100000-node cap");
  });

  // F5: the node merge picked one branch's K-set + one count (last-write-wins),
  // silently dropping the other branch's distinct citations. Union them by
  // identity and set citation_count = max(both counts, |union|).
  it("unions a node's citations across both branches and reconciles citation_count", () => {
    const dir = tempDir();
    const ancestor = join(dir, "ancestor.json");
    const current = join(dir, "current.json");
    const other = join(dir, "other.json");

    const baseNode = { id: "hub", label: "Hub", source_file: "doc.txt", file_type: "document" as const };

    writeFileSync(
      ancestor,
      JSON.stringify({ directed: false, graph: {}, nodes: [baseNode], links: [] }),
      "utf-8",
    );
    writeFileSync(
      current,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          {
            ...baseNode,
            citation_count: 5,
            citations: [
              { source_file: "a.txt", page: 1 },
              { source_file: "b.txt", page: 2 },
            ],
          },
        ],
        links: [],
      }),
      "utf-8",
    );
    writeFileSync(
      other,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          {
            ...baseNode,
            citation_count: 7,
            citations: [
              { source_file: "b.txt", page: 2 }, // overlap with current
              { source_file: "c.txt", page: 3 },
            ],
          },
        ],
        links: [],
      }),
      "utf-8",
    );

    mergeGraphJsonFiles(ancestor, current, other);
    const merged = JSON.parse(readFileSync(current, "utf-8")) as {
      nodes: Array<{ id: string; citations?: Array<{ source_file?: string; page?: number }>; citation_count?: number }>;
    };
    const hub = merged.nodes.find((n) => n.id === "hub")!;
    // deduped union a:1, b:2, c:3 (3 distinct) — NOT one branch's 2.
    const keys = (hub.citations ?? []).map((c) => `${c.source_file}:${c.page}`).sort();
    expect(keys).toEqual(["a.txt:1", "b.txt:2", "c.txt:3"]);
    // count = max(5, 7, |union|=3) = 7 (never silently below either branch).
    expect(hub.citation_count).toBe(7);
  });
});


import { edge as mlEdge, node as mlNode, expectObservations as mlObs, observation as mlObservation, type Row as MlRow } from "./helpers/multi-links.js";
describe("L0-S merge driver", () => {
  for(const role of ["ancestor","current","other"]) describe(role+"/merge",()=>{
    it.fails("merge-driver-unknown-and-copy-branch-zero-writes",()=>{
      const dir=tempDir(), paths={ancestor:join(dir,"ancestor.json"),current:join(dir,"current.json"),other:join(dir,"other.json")};
      const base={nodes:[mlNode("a"),mlNode("b")],links:[]};
      const docs:Record<string,MlRow>={ancestor:base,current:{...base,links:[mlEdge({relation:"reads"})]},other:{...base,links:[mlEdge({relation:"writes"})]}};
      docs[role]={...docs[role],graph_format:"engram-graph/3"};
      for(const k of Object.keys(paths)) writeFileSync(paths[k],JSON.stringify(docs[k]));
      const before=readFileSync(paths.current,"utf8");
      let error:any;
      try {mergeGraphJsonFiles(paths.ancestor,paths.current,paths.other);} catch(e){error=e;}
      expect(error,"validate every input before merge or copy output").toMatchObject({name:"UnsupportedGraphFormatError",code:"unsupported-graph-format"});
      expect(readFileSync(paths.current,"utf8")).toBe(before);
      expect(readFileSync(paths.other,"utf8")).toBe(JSON.stringify(docs.other));
    });
  });
  for (const sourceRole of ["left", "right"]) describe("missing-destination/copy-" + sourceRole, () => {
    for (const unknownRole of ["source", "ancestor"]) it.fails("merge-driver-unknown-and-copy-branch-zero-writes", () => {
      const dir = tempDir(), ancestor = join(dir, "ancestor.json");
      const source = join(dir, sourceRole + ".json"), destination = join(dir, (sourceRole === "left" ? "right" : "left") + ".json");
      const base = { nodes: [mlNode("a"), mlNode("b")], links: [] };
      const emission = mlEdge(), row = { ...emission, _src: "a", _tgt: "b", confidence_score: 1, evidence_observations: [mlObservation(emission)] };
      const docs = { ancestor: { ...base, ...(unknownRole === "ancestor" ? { graph_format: "engram-graph/3" } : {}) }, source: { ...base, directed: false, multigraph: true, graph_format: unknownRole === "source" ? "engram-graph/3" : "engram-graph/2", links: [row] } };
      writeFileSync(ancestor, JSON.stringify(docs.ancestor)); writeFileSync(source, JSON.stringify(docs.source));
      expect(existsSync(destination), "the actual current/destination must be absent to select raw copy").toBe(false);
      let error: unknown;
      try { mergeGraphJsonFiles(ancestor, destination, source); } catch (e) { error = e; }
      expect(error, "validate source AND ancestor before entering the missing-current copy").toMatchObject({ name: "UnsupportedGraphFormatError", code: "unsupported-graph-format" });
      expect(existsSync(destination), "refusal must not create the absent destination").toBe(false);
      expect(readFileSync(source, "utf8")).toBe(JSON.stringify(docs.source));
      expect(readFileSync(ancestor, "utf8")).toBe(JSON.stringify(docs.ancestor));
    });
    it("known v2 input really reaches the missing-current copy branch", () => {
      const dir = tempDir(), source = join(dir, sourceRole + ".json"), destination = join(dir, "absent.json");
      const emission = mlEdge();
      const document = { graph_format: "engram-graph/2", multigraph: true, directed: false, nodes: [mlNode("a"), mlNode("b")], links: [{ ...emission, _src: "a", _tgt: "b", confidence_score: 1, evidence_observations: [mlObservation(emission)] }] };
      writeFileSync(source, JSON.stringify(document));
      const result = mergeGraphJsonFiles(join(dir, "absent-ancestor.json"), destination, source);
      expect(result.edgeCount).toBe(1);
      expect(JSON.parse(readFileSync(destination, "utf8"))).toMatchObject(document);
    });
    it.fails("known legacy copy upgrades through the v2 writer rather than copying raw bytes", () => {
      const dir = tempDir(), ancestor = join(dir, "ancestor.json"), source = join(dir, sourceRole + ".json"), destination = join(dir, "absent.json");
      const legacy = { directed: false, nodes: [mlNode("a"), mlNode("b")], links: [mlEdge({ source_location: "L10" })] };
      writeFileSync(ancestor, JSON.stringify({ nodes: legacy.nodes, links: [] })); writeFileSync(source, JSON.stringify(legacy));
      mergeGraphJsonFiles(ancestor, destination, source);
      const copied = JSON.parse(readFileSync(destination, "utf8"));
      expect(copied.graph_format).toBe("engram-graph/2"); expect(copied.multigraph).toBe(true);
      mlObs(copied.links[0], [mlObservation(legacy.links[0])]);
      expect(readFileSync(source, "utf8")).toBe(JSON.stringify(legacy));
    });
  });
  it.fails("merge-driver-reads-writes-commutative-replay",()=>{
    let canonical:string|undefined;
    const emissions=[mlEdge({relation:"reads",source_location:"L1"}),mlEdge({relation:"writes",source_location:"L2"})];
    for(const order of [emissions,[...emissions].reverse()]){
      const dir=tempDir(),ancestor=join(dir,"ancestor.json"),current=join(dir,"current.json"),other=join(dir,"other.json");
      const base={nodes:[mlNode("a"),mlNode("b")],links:[]};
      writeFileSync(ancestor,JSON.stringify(base));
      writeFileSync(current,JSON.stringify({...base,links:[order[0]]}));
      writeFileSync(other,JSON.stringify({...base,links:[order[1]]}));
      mergeGraphJsonFiles(ancestor,current,other);
      const output=JSON.parse(readFileSync(current,"utf8"));
      expect(output.links.map((r:MlRow)=>r.relation).sort()).toEqual(["reads","writes"]);
      for(const e of emissions) mlObs(output.links.find((r:MlRow)=>r.relation===e.relation),[mlObservation(e)]);
      const bytes=JSON.stringify(output.links);canonical??=bytes;expect(bytes).toBe(canonical);
      mergeGraphJsonFiles(ancestor,current,other);
      expect(JSON.stringify(JSON.parse(readFileSync(current,"utf8")).links)).toBe(bytes);
    }
  });
});
