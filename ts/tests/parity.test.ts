/**
 * Parity test: validates that TypeScript output matches Python output structure.
 *
 * Runs the Python graphify on extraction.json, then runs TypeScript graphify,
 * and compares: node counts, edge counts, community structure, report sections.
 *
 * Requires Python graphify to be installed (`pip install -e ../`).
 * Skipped gracefully if Python is not available.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";

import { buildFromJson } from "../src/build.js";
import { cluster, scoreAll } from "../src/cluster.js";
import { godNodes, surprisingConnections, suggestQuestions } from "../src/analyze.js";
import { generate } from "../src/report.js";
import { toJson } from "../src/export.js";
import type { Extraction } from "../src/types.js";

const FIXTURES_DIR = resolve(__dirname, "fixtures");
const EXTRACTION_JSON = join(FIXTURES_DIR, "extraction.json");
const TMP_DIR = join(tmpdir(), `graphify-parity-${Date.now()}`);
const PY_OUT = join(TMP_DIR, "python");
const TS_OUT = join(TMP_DIR, "typescript");

function pythonAvailable(): boolean {
  try {
    execSync('python3 -c "import graphify"', { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

describe("Python ↔ TypeScript parity", () => {
  const hasPython = pythonAvailable();

  beforeAll(() => {
    mkdirSync(PY_OUT, { recursive: true });
    mkdirSync(TS_OUT, { recursive: true });
  });

  // ── TypeScript pipeline ───────────────────────────────────────────────
  let tsGraph: InstanceType<typeof Graph>;
  let tsCommunities: Map<number, string[]>;
  let tsReport: string;

  it("TypeScript: builds graph from extraction.json", () => {
    const raw = JSON.parse(readFileSync(EXTRACTION_JSON, "utf-8")) as Extraction;
    tsGraph = buildFromJson(raw);
    expect(tsGraph.order).toBe(4);
    expect(tsGraph.size).toBe(4);
  });

  it("TypeScript: runs full pipeline and writes outputs", () => {
    tsCommunities = cluster(tsGraph);
    const cohesion = scoreAll(tsGraph, tsCommunities);
    const gods = godNodes(tsGraph);
    const surprises = surprisingConnections(tsGraph, tsCommunities);
    const labels = new Map<number, string>();
    for (const cid of tsCommunities.keys()) labels.set(cid, `Community ${cid}`);
    const questions = suggestQuestions(tsGraph, tsCommunities, labels);

    tsReport = generate(
      tsGraph, tsCommunities, cohesion, labels, gods, surprises,
      {
        files: { code: ["model.py"], document: ["paper.md"], paper: [], image: [] },
        total_files: 2, total_words: 5000, needs_graph: true, warning: null,
        skipped_sensitive: [], graphifyignore_patterns: 0,
      },
      { input: 1200, output: 340 }, "parity-test", questions,
    );

    toJson(tsGraph, tsCommunities, join(TS_OUT, "graph.json"));
    writeFileSync(join(TS_OUT, "GRAPH_REPORT.md"), tsReport);
  });

  // ── Python pipeline (if available) ────────────────────────────────────
  it.skipIf(!hasPython)("Python: builds graph and writes outputs", () => {
    const script = `
import json, sys
from pathlib import Path
sys.path.insert(0, "${resolve(__dirname, "..", "..", "py")}")
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json

raw = json.loads(Path("${EXTRACTION_JSON}").read_text())
G = build_from_json(raw)
communities = cluster(G)
cohesion = score_all(G, communities)
gods = god_nodes(G)
surprises = surprising_connections(G, communities)
labels = {cid: f"Community {cid}" for cid in communities}
questions = suggest_questions(G, communities, labels)

detection = {
    "files": {"code": ["model.py"], "document": ["paper.md"], "paper": [], "image": []},
    "total_files": 2, "total_words": 5000, "needs_graph": True, "warning": None,
    "skipped_sensitive": [], "graphifyignore_patterns": 0,
}

report = generate(G, communities, cohesion, labels, gods, surprises,
                  detection, {"input": 1200, "output": 340}, "parity-test",
                  suggested_questions=questions)

to_json(G, communities, "${join(PY_OUT, "graph.json")}")
Path("${join(PY_OUT, "GRAPH_REPORT.md")}").write_text(report)

# Also dump counts for comparison
print(json.dumps({
    "nodes": G.number_of_nodes(),
    "edges": G.number_of_edges(),
    "communities": len(communities),
    "god_nodes": len(gods),
    "surprises": len(surprises),
}))
`;
    const result = execSync(`python3 -c '${script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: "utf-8",
      cwd: TMP_DIR,
    }).trim();

    writeFileSync(join(PY_OUT, "counts.json"), result);
  });

  // ── Comparison tests ──────────────────────────────────────────────────
  it.skipIf(!hasPython)("Parity: same node count", () => {
    const pyCounts = JSON.parse(readFileSync(join(PY_OUT, "counts.json"), "utf-8"));
    expect(tsGraph.order).toBe(pyCounts.nodes);
  });

  it.skipIf(!hasPython)("Parity: same edge count", () => {
    const pyCounts = JSON.parse(readFileSync(join(PY_OUT, "counts.json"), "utf-8"));
    expect(tsGraph.size).toBe(pyCounts.edges);
  });

  it.skipIf(!hasPython)("Parity: same community count (±1 tolerance for algorithmic variance)", () => {
    const pyCounts = JSON.parse(readFileSync(join(PY_OUT, "counts.json"), "utf-8"));
    // Louvain is non-deterministic, allow ±1 community difference
    expect(Math.abs(tsCommunities.size - pyCounts.communities)).toBeLessThanOrEqual(1);
  });

  it.skipIf(!hasPython)("Parity: both reports contain same sections", () => {
    const pyReport = readFileSync(join(PY_OUT, "GRAPH_REPORT.md"), "utf-8");
    const sections = [
      "## Corpus Check",
      "## Summary",
      "## God Nodes",
      "## Surprising Connections",
      "## Communities",
    ];
    for (const section of sections) {
      expect(tsReport).toContain(section);
      expect(pyReport).toContain(section);
    }
  });

  it.skipIf(!hasPython)("Parity: graph.json has same node IDs", () => {
    const pyData = JSON.parse(readFileSync(join(PY_OUT, "graph.json"), "utf-8"));
    const tsData = JSON.parse(readFileSync(join(TS_OUT, "graph.json"), "utf-8"));

    const pyNodeIds = new Set(pyData.nodes.map((n: any) => n.id));
    const tsNodeIds = new Set(tsData.nodes.map((n: any) => n.id));

    expect(tsNodeIds).toEqual(pyNodeIds);
  });

  it.skipIf(!hasPython)("Parity: graph.json has same edge count", () => {
    const pyData = JSON.parse(readFileSync(join(PY_OUT, "graph.json"), "utf-8"));
    const tsData = JSON.parse(readFileSync(join(TS_OUT, "graph.json"), "utf-8"));

    expect(tsData.links.length).toBe(pyData.links.length);
  });

  // ── Self-contained structural checks (always run) ─────────────────────
  it("TypeScript graph.json is structurally valid", () => {
    const data = JSON.parse(readFileSync(join(TS_OUT, "graph.json"), "utf-8"));
    expect(data.nodes).toBeInstanceOf(Array);
    expect(data.links).toBeInstanceOf(Array);
    for (const node of data.nodes) {
      expect(typeof node.id).toBe("string");
      expect(typeof node.label).toBe("string");
    }
    for (const link of data.links) {
      expect(typeof link.source).toBe("string");
      expect(typeof link.target).toBe("string");
      expect(typeof link.relation).toBe("string");
    }
  });

  it("TypeScript report has confidence breakdown", () => {
    expect(tsReport).toMatch(/EXTRACTED/);
    expect(tsReport).toMatch(/INFERRED/);
    expect(tsReport).toMatch(/AMBIGUOUS/);
  });

  afterAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });
});
