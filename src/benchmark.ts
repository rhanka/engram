/**
 * Token-reduction benchmark - measures how much context graphify saves vs naive full-corpus approach.
 */
import { readFileSync, existsSync } from "node:fs";
import Graph from "graphology";
import { forEachTraversalNeighbor, loadGraphFromData, type SerializedGraphData } from "./graph.js";
import { defaultGraphPath } from "./paths.js";
import type { BenchmarkResult } from "./types.js";

const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.max(1, Math.floor(text.length / CHARS_PER_TOKEN));
}

function querySubgraphTokens(G: Graph, question: string, depth: number = 3): number {
  const terms = question.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const scored: [number, string][] = [];
  G.forEachNode((nid, data) => {
    const label = ((data.label as string) ?? "").toLowerCase();
    const score = terms.filter((t) => label.includes(t)).length;
    if (score > 0) scored.push([score, nid]);
  });
  scored.sort((a, b) => b[0] - a[0]);
  const startNodes = scored.slice(0, 3).map(([, nid]) => nid);
  if (startNodes.length === 0) return 0;

  const visited = new Set(startNodes);
  let frontier = new Set(startNodes);
  const edgesSeen: [string, string][] = [];

  for (let d = 0; d < depth; d++) {
    const nextFrontier = new Set<string>();
    for (const n of frontier) {
      forEachTraversalNeighbor(G, n, (neighbor) => {
        if (!visited.has(neighbor)) {
          nextFrontier.add(neighbor);
          edgesSeen.push([n, neighbor]);
        }
      });
    }
    for (const n of nextFrontier) visited.add(n);
    frontier = nextFrontier;
  }

  const lines: string[] = [];
  for (const nid of visited) {
    const d = G.getNodeAttributes(nid);
    lines.push(`NODE ${d.label ?? nid} src=${d.source_file ?? ""} loc=${d.source_location ?? ""}`);
  }
  for (const [u, v] of edgesSeen) {
    if (visited.has(u) && visited.has(v)) {
      const edge = G.edge(u, v);
      if (edge) {
        const d = G.getEdgeAttributes(edge);
        lines.push(`EDGE ${G.getNodeAttribute(u, "label") ?? u} --${d.relation ?? ""}--> ${G.getNodeAttribute(v, "label") ?? v}`);
      }
    }
  }

  return estimateTokens(lines.join("\n"));
}

const SAMPLE_QUESTIONS = [
  "how does authentication work",
  "what is the main entry point",
  "how are errors handled",
  "what connects the data layer to the api",
  "what are the core abstractions",
];

interface BenchmarkOptions {
  corpusWords?: number;
  questions?: string[];
}

function loadGraph(graphPath: string): Graph {
  const raw = JSON.parse(readFileSync(graphPath, "utf-8")) as SerializedGraphData;
  return loadGraphFromData(raw);
}

export function runBenchmark(
  graphPath: string = defaultGraphPath(),
  corpusWordsOrOptions?: number | BenchmarkOptions,
  questions?: string[],
): BenchmarkResult {
  const options = typeof corpusWordsOrOptions === "number"
    ? { corpusWords: corpusWordsOrOptions, questions }
    : (corpusWordsOrOptions ?? {});

  if (!existsSync(graphPath)) {
    return { error: `Graph file not found: ${graphPath}. Build the graph first.` };
  }

  const G = loadGraph(graphPath);

  const corpusWords = options.corpusWords ?? (G.order * 50);

  if (corpusWords === undefined) {
    return { error: "Could not determine corpus size." };
  }

  const corpusTokens = Math.floor((corpusWords * 100) / 75);
  const qs = options.questions ?? SAMPLE_QUESTIONS;
  const perQuestion: Array<{ question: string; query_tokens: number; reduction: number }> = [];

  for (const q of qs) {
    const qt = querySubgraphTokens(G, q);
    if (qt > 0) {
      perQuestion.push({
        question: q,
        query_tokens: qt,
        reduction: Math.round((corpusTokens / qt) * 10) / 10,
      });
    }
  }

  if (perQuestion.length === 0) {
    return { error: "No matching nodes found for sample questions. Build the graph first." };
  }

  const avgQueryTokens = Math.floor(
    perQuestion.reduce((s, p) => s + p.query_tokens, 0) / perQuestion.length,
  );
  const reductionRatio = avgQueryTokens > 0 ? Math.round((corpusTokens / avgQueryTokens) * 10) / 10 : 0;

  return {
    corpus_tokens: corpusTokens,
    corpus_words: corpusWords,
    nodes: G.order,
    edges: G.size,
    avg_query_tokens: avgQueryTokens,
    reduction_ratio: reductionRatio,
    per_question: perQuestion,
  };
}

export function printBenchmark(result: BenchmarkResult): void {
  if (result.error) {
    console.log(`Benchmark error: ${result.error}`);
    return;
  }

  console.log(`\ngraphify token reduction benchmark`);
  console.log("─".repeat(50));
  console.log(`  Corpus:          ${result.corpus_words!.toLocaleString()} words → ~${result.corpus_tokens!.toLocaleString()} tokens (naive)`);
  console.log(`  Graph:           ${result.nodes!.toLocaleString()} nodes, ${result.edges!.toLocaleString()} edges`);
  console.log(`  Avg query cost:  ~${result.avg_query_tokens!.toLocaleString()} tokens`);
  console.log(`  Reduction:       ${result.reduction_ratio}x fewer tokens per query`);
  console.log(`\n  Per question:`);
  for (const p of result.per_question!) {
    console.log(`    [${p.reduction}x] ${p.question.slice(0, 55)}`);
  }
  console.log();
}
