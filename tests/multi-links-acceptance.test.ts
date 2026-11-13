import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadGraphFromData, serializeGraph } from "../src/graph.js";
import * as core from "../src/graph.js";
import { attachMemoryProjectionToGraph, reconcileMemoryProjectionInGraph } from "../src/graph-memory-projection.js";
import { renderTree } from "../src/tree.js";
import { cluster } from "../src/cluster.js";
import { edge, extraction, node, fromRows, multiGraph, rows, writers, writeGraph, expectObservations, observation, expectFixedPoint, type Row } from "./helpers/multi-links.js";
import { withMcp } from "./helpers/multi-links-mcp.js";
import { inventory, inventoryTree, applyAllowlist, type Allowance } from "./helpers/multi-links-inventory.js";
import { skillDocuments, readSkill, skillOperations, executeSnippet, coreHistory, canonicalRows } from "./helpers/multi-links-skills.js";

const readFixture = (name: string) => JSON.parse(readFileSync(new URL("./fixtures/multi-links/" + name, import.meta.url), "utf8"));
const old = readFixture("old-simple-graph.json"), clusterFixture = readFixture("cluster-fixture.json"), clusterGolden = readFixture("expected-partition.json");

describe("L0 acceptance", () => {
  for (const shape of ["parallel", "reciprocal-undirected", "reciprocal-directed", "union"]) describe(shape, () => {
    it.fails("owner-parallel-reciprocal-union-acceptance", async () => {
      const emissions = shape === "parallel" ? [edge({ relation: "reads", source_location: "L1" }), edge({ relation: "writes", source_location: "L2" })] : shape === "union" ? [edge({ source_location: "L10" }), edge({ source_location: "L44" })] : [edge({ source_location: "L1" }), edge({ source: "b", target: "a", confidence: "INFERRED", source_location: "L2" })];
      const ns = [node("a", { label: "Caller" }), node("b", { label: "Callee" })];
      let canonical: string | undefined;
      for (const seq of [emissions, [...emissions].reverse()]) {
        const G = fromRows(seq, { directed: shape === "reciprocal-directed" }, ns);
        expect(G.size).toBe(shape === "union" ? 1 : 2);
        for (const writer of writers) {
          const data = writeGraph(G, writer), loaded = loadGraphFromData(data);
          for (const row of rows(loaded, writer)) expectObservations(row, emissions.filter(e => e.source === row.source && e.target === row.target && e.relation === row.relation).map(observation));
          const bytes = JSON.stringify(data.links); canonical ??= bytes; expect(bytes).toBe(canonical);
          await withMcp(data, async call => {
            const text = await call("get_neighbors", { label: "Caller" });
            if (shape === "parallel") { expect(text).toContain("[reads]"); expect(text).toContain("[writes]"); }
            if (shape === "reciprocal-undirected") { expect(text).toMatch(/--> Callee \[calls\] \[EXTRACTED\]/); expect(text).toMatch(/<-- Callee \[calls\] \[INFERRED\]/); }
            if (shape === "reciprocal-directed") { expect(text).toContain("[EXTRACTED]"); expect(text).not.toContain("[INFERRED]"); }
            if (shape === "union") { expect(text.match(/\[calls\]/g)).toHaveLength(1); expectObservations(data.links[0], emissions.map(observation)); }
          });
        }
        expectFixedPoint(G, seq);
      }
    });
  });
  it.fails("tree-one-row-per-neighbour-oriented-entries", () => {
    const ns = [node("center", { label: "Center" }), node("peer", { label: "A peer" }), node("other", { label: "Z competing" })];
    const emissions = [edge({ source: "center", target: "peer", relation: "calls" }), edge({ source: "peer", target: "center", relation: "calls", confidence: "INFERRED" }), edge({ source: "center", target: "peer", relation: "references" }), edge({ source: "center", target: "other" })];
    const G = multiGraph(emissions, ns);
    const text = renderTree(G, "center", { depth: 1, maxChildren: 1 });
    const children = text.split("\n").filter(l => /[├└]─/.test(l) && !l.includes("..."));
    expect(children).toHaveLength(1);
    expect(children[0]).toContain("A peer");
    expect(text).toContain("1 more");
    expect(children[0].match(/calls/g)).toHaveLength(2);
    expect(children[0]).toContain("EXTRACTED"); expect(children[0]).toContain("INFERRED"); expect(children[0]).toContain("<--");
    expect(children[0]).toContain("references");
    expect(renderTree(multiGraph([...emissions].reverse(), ns), "center", { depth: 1, maxChildren: 1 })).toBe(text);
    const base = renderTree(multiGraph([emissions[0], emissions[3]], ns), "center", { depth: 1, maxChildren: 1 });
    expect(base.split("\n").filter(l => /[├└]─/.test(l) && !l.includes("...")).length).toBe(children.length);
  });
  it.fails("memory-about-coexists-with-code-link", () => {
    const memory = node("memory:r1", { file_type: "memory", record_id: "r1" }), target = node("a");
    const code = edge({ source: memory.id, target: target.id, relation: "calls" });
    const reference = edge({ source: memory.id, target: target.id, relation: "memory_about", source_file: "memory" });
    const G = fromRows([code], {}, [memory, target]);
    const assembled = { extraction: extraction([reference], [memory]), projection_cursor: "1", high_water_cursor: "1" };
    attachMemoryProjectionToGraph(G, assembled as never);
    expect(G.size).toBe(2);
    const before = rows(G).find(r => r.relation === "calls");
    const memoryKey = JSON.stringify([memory.id, target.id, "memory_about"]), codeKey = JSON.stringify([memory.id, target.id, "calls"]);
    expect(G.hasEdge(memoryKey)).toBe(true); expect(G.hasEdge(codeKey)).toBe(true);
    reconcileMemoryProjectionInGraph(G, { ...assembled, extraction: extraction([], [memory]) } as never);
    expect(G.hasEdge(memoryKey)).toBe(false); expect(G.hasEdge(codeKey)).toBe(true);
    expect(rows(G)).toEqual([before]);
    expectFixedPoint(G);
  });
  it.fails("old-simple-graph-upgrade-enumerated", () => {
    const G = loadGraphFromData(old);
    expect(G.size).toBe(old.links.length);
    for (const n of old.nodes) for (const [key, value] of Object.entries(n)) if (key !== "id") expect(G.getNodeAttribute(n.id, key)).toEqual(value);
    expect(G.getAttribute("hyperedges")).toEqual(old.hyperedges);
    expect(G.getAttribute("community_labels")).toEqual(old.graph.community_labels);
    expect(G.getAttribute("provenance")).toEqual(old.graph.provenance);
    for (const writer of writers) {
      const data = writeGraph(G, writer);
      expect(data.multigraph).toBe(true); expect(data.graph_format).toBe("engram-graph/2");
      expect(data.topology_signature).toMatch(/^topo\/2;/);
      const keys = data.links.map((r: Row) => JSON.stringify([r.source, r.target, r.relation]));
      expect(keys).toEqual([...keys].sort());
      for (const e of old.links) {
        const row = data.links.find((r: Row) => r.source === (e._src ?? e.source) && r.target === (e._tgt ?? e.target) && r.relation === (e.relation || "related_to"));
        expectObservations(row, [observation(e)]);
        for (const [key, value] of Object.entries(e)) if (!["source", "target", "_src", "_tgt"].includes(key)) expect(row[key]).toEqual(value);
        expect([row.source, row.target]).toEqual([row._src, row._tgt]);
      }
      expect(data.hyperedges).toEqual(old.hyperedges);
      expect(data.graph.community_labels).toEqual(old.graph.community_labels);
      expect(data.graph.provenance).toEqual(old.graph.provenance);
    }
    expect([...cluster(fromRows(clusterFixture.edges, {}, clusterFixture.nodes))]).toEqual(clusterGolden);
    expectFixedPoint(G);
  });
});

const allowances: Allowance[] = readFixture("writer-allowlist.json");
describe("L0 writer inventory", () => {
  const preservedOperations = [
    ["node citation union", "src/assembly-hygiene.ts", "unionNodeInto", "raw-edge-rewrite", "kept.citations = unionCitations([keptCites, incCites])"],
    ["node source path normalization", "src/build.ts", "buildFromJson", "raw-edge-rewrite", "normalizedAttrs.source_file = normalizeSourceFilePath(normalizedAttrs.source_file, root) ?? normalizedAttrs.source_file"],
    ["MCP settings write", "src/cli.ts", "installGeminiMcp", "raw-graph-writer", 'writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8")'],
    ["stat-index write", "src/cache.ts", "flushStatIndex", "raw-graph-writer", "writeFileSync(tmp, JSON.stringify(statIndex))"],
  ];
  for (const [label, file, owner, kind, statement] of preservedOperations) it("accepts preserved " + label, () => {
    const sites = inventory(file, readFileSync(file, "utf8")).filter(s => s.owner === owner && s.kind === kind && s.text === statement);
    expect(sites, "the real operation must still be enumerated").toHaveLength(1);
    expect(applyAllowlist(sites, allowances)).toMatchObject([{ reason: expect.any(String) }]);
  });
  it("keeps preserved-operation allowances specific to file, owner, kind, fingerprint and count", () => {
    for (const [, file, owner, kind, statement] of preservedOperations) {
      const site = inventory(file, readFileSync(file, "utf8")).find(s => s.owner === owner && s.kind === kind && s.text === statement)!;
      expect(site).toBeDefined();
      const copies = applyAllowlist([site, { ...site }], allowances);
      expect(copies[0].reason).toBeTypeOf("string");
      expect(copies[1].reason).toBeUndefined();
      for (const field of ["file", "owner", "kind", "fingerprint"] as const) {
        expect(applyAllowlist([{ ...site, [field]: site[field] + "-changed" }], allowances)[0].reason, field).toBeUndefined();
      }
    }
  });
  it("enumerates each insertion, upsert, setter, replacement and import shape", () => {
    for (const prefix of ["add", "merge", "update"]) for (const orientation of ["", "Directed", "Undirected"]) for (const suffix of ["", "WithKey"]) {
      const method = prefix + orientation + "Edge" + suffix;
      expect(inventory("src/unknown.ts", "function replay(G) { G[" + JSON.stringify(method) + "]('key','a','b',{}); }").filter(s => !s.reason).map(s => s.kind), method).toContain("graph-insertion");
    }
    for (const method of ["setEdgeAttribute", "removeEdgeAttribute", "mergeEdgeAttributes", "replaceEdgeAttributes", "updateEdgeAttributes", "updateEachEdgeAttributes"]) {
      expect(inventory("src/unknown.ts", "function replay(G) { G." + method + "('key','confidence',{}); }").filter(s => !s.reason).map(s => s.kind), method).toContain("graph-setter");
    }
    expect(inventory("src/unknown.ts", "function replay(G,raw) { G.import(raw); return Graph.from(raw); }").filter(s => !s.reason).map(s => s.kind)).toEqual(["graph-import", "graph-import"]);
  });
  it("rejects a replay beside a sanctioned helper, bracket insertions and attribute replacement", () => {
    const source = readFileSync(new URL("./fixtures/multi-links/unsafe-replay.ts.txt", import.meta.url), "utf8");
    const sites = applyAllowlist(inventory("src/new-replay.ts", source), allowances);
    expect(sites.filter(s => !s.reason).map(s => s.kind)).toEqual(["graph-insertion", "graph-insertion", "graph-setter"]);
  });
  it("rejects an unguarded raw writer even when its comment names the guard", () => {
    const source = readFileSync(new URL("./fixtures/multi-links/unsafe-raw-writer.ts.txt", import.meta.url), "utf8");
    expect(inventory("src/new-writer.ts", source).filter(s => !s.reason).map(s => s.kind)).toContain("raw-graph-writer");
  });
  const probes = [
    ["arbitrary document alias", "function saveSnapshot(raw, destination) { writeFileSync(destination, JSON.stringify(raw)); }", "raw-graph-writer"],
    ["arbitrary link alias", 'function change(raw) { for (const row of raw.links) row.confidence = "EXTRACTED"; }', "raw-edge-rewrite"],
    ["unrelated helper in the same owner", 'function replay(G, raw) { upsertRelationEdge(G, "x", "y", {}); return { source: "a", target: "b", confidence: "EXTRACTED", ...raw }; }', "edge-row-constructor"],
    ["helper impersonation", 'function upsertRelationEdge(G, attrs) { G.mergeEdgeWithKey("K", "a", "b", attrs); }', "graph-insertion"],
    ["guard of unrelated data", 'import { assertSupportedGraphFormat } from "./graph.js"; function save(raw, other, destination) { assertSupportedGraphFormat(other); writeFileSync(destination, JSON.stringify(raw)); }', "raw-graph-writer"],
    ["setter helper impersonation", 'function upsertRelationEdge(G, attrs) { G.replaceEdgeAttributes("K", attrs); }', "graph-setter"],
  ];
  for (const [label, source, kind] of probes) it("rejects " + label, () => {
    const sites = applyAllowlist(inventory("src/brand-new-writer.ts", source), allowances);
    expect(sites.filter(s => !s.reason).map(s => s.kind)).toContain(kind);
  });
  it("classifies a guard only for the exact written document and scopes keyed writers to core", () => {
    const source = 'import { assertSupportedGraphFormat } from "./graph.js"; function save(raw, destination) { assertSupportedGraphFormat(raw); writeFileSync(destination, JSON.stringify(raw)); }';
    expect(inventory("src/writer.ts", source).find(s => s.kind === "raw-graph-writer")?.reason).toBeDefined();
    const helper = 'function upsertRelationEdge(G, attrs) { G.mergeEdgeWithKey("K", "a", "b", attrs); }';
    expect(inventory("src/graph.ts", helper).find(s => s.kind === "graph-insertion")?.reason).toBeDefined();
    expect(inventory("src/lookalike/graph.ts", helper).find(s => s.kind === "graph-insertion")?.reason).toBeUndefined();
  });
  it("rejects bare pair readers, simple constructors and unkeyed replay even beside a portable helper", () => {
    const source = 'function upsertRelationEdge(G) { G.mergeEdgeWithKey("K","a","b",{}); } const G = new Graph(); G.edge("a","b"); G.mergeEdge("a","b",{});';
    const violations = inventory("src/skills/skill.md#script-0.js", source).filter(s => !s.reason).map(s => s.kind);
    expect(violations).toEqual(["graph-insertion", "graph-constructor", "graph-pair-reader", "graph-insertion"]);
  });
  it.fails("inventory-every-writer-through-merger", () => {
    const scripts = skillDocuments.flatMap(path => {
      const skill = readSkill(path);
      return [...(skill.portable ? inventory(path + "#portable.js", skill.portable) : []), ...skill.scripts.flatMap((source, index) => inventory(path + "#script-" + index + ".js", source.replace(skill.portable ?? "\0", "")))];
    });
    const sites = applyAllowlist([...inventoryTree(), ...scripts], allowances);
    expect(sites.length).toBeGreaterThan(150);
    expect(sites.filter(s => !s.reason).map(s => `${s.file}:${s.line} ${s.owner} ${s.kind}`)).toEqual([]);
  });
});

const skills = skillDocuments.map(readSkill);
const corpusNames = ["old-simple-graph.json", "legacy-reversed-row.json", "legacy-absent-confidence.json", "untyped-x2b.json", "old-directed-reciprocal.json", "old-loop.json", "b1-reciprocal-effective-rows.json", "r4-effective-raw-collapse.json", "m2-absolute-locator-graph.json"];
const corpus = [
  ...corpusNames.map(name => [name, readFixture(name)] as const),
  ["lone-surrogate", { nodes: [node("a"), node("b")], links: [edge({ source_file: "bad\ud800.ts", citations: [{ quote: "\udfff", ["\ud800"]: "kept key" }] })] }],
  ["composed-decomposed-quotes", { nodes: [node("a"), node("b")], links: ["é", "e\u0301"].map(quote => edge({ citations: [{ source_file: "f.ts", quote }] })) }],
  ["bbox-region", { nodes: [node("a"), node("b")], links: [{ bbox: [0, 0, 1, 1] }, { region: [0, 0, 1, 1] }, { bbox: [0, 0, 1, 1], region: [0, 0, 1, 1] }].map(citation => edge({ citations: [{ source_file: "f.ts", ...citation }] })) }],
  ["zero-null-malformed-time", { nodes: [node("a"), node("b")], links: [edge({ confidence_score: -0, t: "bad" }), edge({ confidence_score: 0, t: "bad" }), edge({ confidence_score: null, t: 10 })] }],
] as Array<[string, Row]>;
function skillInput(raw: Row) {
  if (Array.isArray(raw)) raw = { links: raw, nodes: [...new Set(raw.flatMap(e => [e.source, e.target, e._src, e._tgt]).filter(v => typeof v === "string"))].map(id => node(id)) };
  return { ...raw, nodes: raw.nodes.map((n: Row, i: number) => ({ ...n, label: typeof n.label === "string" && n.label.length > 3 ? n.label : i === 0 ? "Caller" : "Callee" + i })), links: raw.links ?? raw.edges ?? [] };
}
// Compare rendering semantics across the two existing presentation layouts.
// Keep relation, confidence, direction and every line; omit source decorations.
const withoutSource = (line: string) => line.trim().replace(/\s+\[src=.*$/, "");
const queryLines = (text: string) => text.split("\n").map(withoutSource).filter(l => l.startsWith("EDGE ")).sort();
const neighborLines = (text: string) => text.split("\n").map(withoutSource).flatMap(line => {
  const oldLayout = /^--(.*?)--> (.*?) \[([^\]]*)\](?: \(.*\))?$/.exec(line);
  if (oldLayout) return [`--> ${oldLayout[2]} [${oldLayout[1]}] [${oldLayout[3]}]`];
  return /^(?:-->|<--)/.test(line) ? [line] : [];
}).sort();
const pathLine = (text: string) => text.replace(/--([^\n]*?)-->\s*\[([^\]]*)\]/g, "--$1 [$2]-->").replace(/\s+/g, " ").trim().replace(/\.$/, "");
describe("L0 shipped skill execution", () => {
  it("reads all six actual script-bearing documents", () => {
    expect(skills).toHaveLength(6);
    expect(new Set(skills.map(s => s.path)).size).toBe(6);
    for (const skill of skills) expect(skill.scripts.length).toBeGreaterThan(3);
  });
  it.fails("skills-shared-portable-block-byte-equality", () => {
    for (const skill of skills) expect(skill.portable, skill.path + ": missing authored portable implementation between markers").toBeTypeOf("string");
    expect(new Set(skills.map(s => s.portableBytes)).size).toBe(1);
  });
  for (const skill of skills) describe(skill.path, () => {
    it("a marked portable block cannot hide broken shipped merge/query/path/neighbour consumers", () => {
      const input = skillInput(old), fresh = extraction([], input.nodes as never);
      const marked = { ...skill, portable: "throw new Error('PORTABLE_IS_NOT_A_CONSUMER')", portableBytes: "marked portable implementation" };
      const mergeBroken = { ...marked, scripts: marked.scripts.map(s => /GExisting/.test(s) && /GNew\.forEachEdge/.test(s) ? 'throw new Error("SHIPPED_MERGE_EXECUTED");\n' + s : s) };
      expect(() => skillOperations(mergeBroken, input, fresh)).toThrow("SHIPPED_MERGE_EXECUTED");
      const broken = { ...marked, scripts: marked.scripts.map(s => /const question\s*=/.test(s) ? 'throw new Error("SHIPPED_QUERY_EXECUTED");' : /const aTerm\s*=/.test(s) ? 'throw new Error("SHIPPED_PATH_EXECUTED");' : /const term\s*=/.test(s) && /CONNECTIONS/.test(s) ? 'throw new Error("SHIPPED_NEIGHBORS_EXECUTED");' : s) };
      // Keep source landmarks for the extractor; no helper execution can stand
      // in for the statements the document actually ships.
      broken.scripts = broken.scripts.map((s, i) => s.startsWith("throw") ? s + "\n/* " + marked.scripts[i] + " */" : s);
      const result = skillOperations(broken, input, fresh);
      expect(String(result.queryError)).toContain("SHIPPED_QUERY_EXECUTED");
      expect(String(result.pathError)).toContain("SHIPPED_PATH_EXECUTED");
      expect(String(result.neighborsError)).toContain("SHIPPED_NEIGHBORS_EXECUTED");
    });
    it.fails("shipped consumers pass the pair-reader, multigraph-constructor and keyed-replay grep gates", () => {
      const sites = skill.scripts.flatMap((source, i) => inventory(skill.path + "#script-" + i + ".js", source.replace(skill.portable ?? "\0", "")));
      expect(sites.filter(s => !s.reason && ["graph-pair-reader", "graph-constructor", "graph-insertion"].includes(s.kind)).map(s => `${s.line} ${s.kind} ${s.text}`)).toEqual([]);
    });
    it.fails("portable block API and canonical observation identities match core independently of consumers", () => {
      expect(skill.portable, skill.path + ": missing portable API block").toBeTypeOf("string");
      const runtime = executeSnippet(skill.portable!, {}, {});
      for (const name of ["loadGraphFromData", "serializeGraph", "mergeEdgeEvidence", "upsertRelationEdge", "getPairEdges", "observationKey", "assertionIdentityOf", "prepareFreshExtraction", "legacyObservationFromRawLink"]) expect(runtime[name], name).toBeTypeOf("function");
      for (const [name, raw] of corpus) {
        const input = skillInput(raw), expected = loadGraphFromData(input), actual = runtime.loadGraphFromData(input);
        expect(canonicalRows(actual)).toBe(canonicalRows(expected));
        for (const row of rows(actual)) {
          expect(runtime.getPairEdges(actual, row.source, row.target)).toEqual((core as Row).getPairEdges(expected, row.source, row.target));
          for (const rec of row.evidence_observations) expect(runtime.observationKey(rec)).toBe((core as Row).observationKey(rec));
        }
        if (name === "lone-surrogate") expect(runtime.observationKey(rows(actual)[0].evidence_observations[0])).toMatch(/^esc:/);
      }
    });
    // The non-inverted control proves extraction/execution cannot accidentally
    // supply the expected failure (syntax, collection shape, or I/O setup).
    it("executes its actual loader/merge/query/path snippets on the corpus", () => {
      for (const [, raw] of corpus) {
        const input = skillInput(raw), fresh = extraction([edge({ source: input.nodes[0].id, target: input.nodes[1]?.id ?? input.nodes[0].id, relation: "writes", source_location: "L0-new" })], input.nodes.map((n: Row) => node(n.id, n)));
        const result = skillOperations(skill, input, fresh);
        expect(result.loaded.order).toBe(input.nodes.length);
        expect(result.merged.order).toBe(input.nodes.length);
        expect(result.query ?? result.queryError).toBeDefined();
        expect(result.path ?? result.pathError).toBeDefined();
        expect(result.neighbors ?? result.neighborsError).toBeDefined();
      }
    });
    (skill.path === "src/skills/skill.md" ? it : it.fails)("skill query block executes without a source syntax error", () => {
      const input = skillInput(old), fresh = extraction([], input.nodes as never);
      const result = skillOperations(skill, input, fresh);
      expect(result.queryError, skill.path + ": query code extracted verbatim from the document").toBeUndefined();
      expect(result.query).toBeDefined();
    });
    for (const shape of ["reciprocal", "reverse-only", "directed", "surrogate"]) describe("rendered " + shape, () => {
      for (const consumer of ["query", "neighbors", "path"] as const) it.fails("actual shipped " + consumer + " output retains assertion orientation and matches core", async () => {
        const a = shape === "surrogate" ? "a\ud800" : "a";
        const ns = [node(a, { label: "Caller" }), node("b", { label: "Callee" })];
        const forward = (relation: string) => edge({ source: a, target: "b", _src: a, _tgt: "b", relation, source_file: shape === "surrogate" ? "bad\udfff.ts" : "f.ts" });
        const reverse = edge({ source: "b", target: a, _src: "b", _tgt: a, relation: "calls", confidence: "INFERRED" });
        const links = shape === "reciprocal" ? [forward("reads"), reverse, forward("writes")] : shape === "surrogate" ? [forward("reads"), forward("writes")] : [reverse];
        const input = { directed: shape === "directed", nodes: ns, links };
        const result = skillOperations(skill, input, extraction([], ns));
        expect(result[consumer + "Error" as "queryError" | "neighborsError" | "pathError"], "the actual " + consumer + " snippet must execute").toBeUndefined();
        const rendered = result[consumer]!.join("\n");
        if (consumer === "path") {
          if (shape === "directed") expect(rendered).toContain("No path found");
          else expect(pathLine(rendered)).toContain(shape === "reverse-only" ? "<--calls [INFERRED]--" : "--reads [EXTRACTED]-->");
        } else {
          const lines = consumer === "query" ? queryLines(rendered) : neighborLines(rendered);
          expect(lines).toHaveLength(shape === "directed" ? 0 : links.length);
          if (shape === "reverse-only" || shape === "reciprocal") expect(lines.some(l => l.includes("<--") && l.includes("calls") && l.includes("INFERRED"))).toBe(true);
        }
        await withMcp(input, async call => {
          if (consumer === "query") expect(queryLines(rendered)).toEqual(queryLines(await call("query_graph", { question: "Caller" })));
          if (consumer === "neighbors") expect(neighborLines(rendered)).toEqual(neighborLines(await call("get_neighbors", { label: "Caller" })));
          if (consumer === "path") expect(pathLine(rendered)).toBe(pathLine(await call("shortest_path", { source: "Caller", target: "Callee" })));
        });
      });
    });
    for (const [name, raw] of corpus) describe(name, () => {
      it.fails("skills-six-variants-executed-parity", async () => {
        const input = skillInput(raw), fresh = extraction([edge({ source: input.nodes[0].id, target: input.nodes[1]?.id ?? input.nodes[0].id, relation: "writes", source_location: "L0-new" })], input.nodes.map((n: Row) => node(n.id, n)));
        const actual = skillOperations(skill, input, fresh), expected = coreHistory(input, fresh);
        expect(actual.loaded.multi, "the document loader must retain relation identity and observations").toBe(true);
        expect(canonicalRows(actual.loaded)).toBe(canonicalRows(expected.loaded));
        expect(canonicalRows(actual.merged)).toBe(canonicalRows(expected.merged));
        expect(rows(actual.merged).find(r => r.relation === "writes")).toBeDefined();
        for (const row of rows(actual.loaded)) expect(row.evidence_observations?.length).toBeGreaterThan(0);
        expect(actual.queryError).toBeUndefined(); expect(actual.pathError).toBeUndefined(); expect(actual.neighborsError).toBeUndefined();
        await withMcp(input, async call => {
          expect(queryLines(actual.query!.join("\n"))).toEqual(queryLines(await call("query_graph", { question: input.nodes[0].label })));
          expect(neighborLines(actual.neighbors!.join("\n"))).toEqual(neighborLines(await call("get_neighbors", { label: input.nodes[0].label })));
          if (input.nodes.length > 1) expect(pathLine(actual.path!.join("\n"))).toBe(pathLine(await call("shortest_path", { source: input.nodes[0].label, target: input.nodes[1].label })));
        });
        expectFixedPoint(actual.merged);
      });
    });
  });
});
