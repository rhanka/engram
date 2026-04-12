import { Command } from "commander";
import Graph from "graphology";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { graphDiff, godNodes, surprisingConnections, suggestQuestions } from "./analyze.js";
import { runBenchmark, printBenchmark } from "./benchmark.js";
import { saveSemanticCache, checkSemanticCache } from "./cache.js";
import { buildFromJson } from "./build.js";
import { cluster, scoreAll } from "./cluster.js";
import { detect, detectIncremental, saveManifest } from "./detect.js";
import { toCypher, toGraphml, toHtml, toJson, toSvg, pushToNeo4j } from "./export.js";
import { extractWithDiagnostics } from "./extract.js";
import { ingest, saveQueryResult } from "./ingest.js";
import { generate } from "./report.js";
import type {
  DetectionResult,
  Extraction,
  GodNodeEntry,
  GraphDiffResult,
  SuggestedQuestion,
  SurpriseEntry,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface AnalysisFile {
  communities: Record<string, string[]>;
  cohesion: Record<string, number>;
  gods: GodNodeEntry[];
  surprises: SurpriseEntry[];
  questions?: SuggestedQuestion[];
  labels?: Record<string, string>;
  diff?: GraphDiffResult;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf-8")) as T;
}

function writeJson(path: string, value: unknown): void {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, JSON.stringify(value, null, 2), "utf-8");
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function defaultLabels(communities: Map<number, string[]>): Map<number, string> {
  const labels = new Map<number, string>();
  for (const cid of communities.keys()) {
    labels.set(cid, `Community ${cid}`);
  }
  return labels;
}

function mapToObject<V>(map: Map<number, V>): Record<string, V> {
  return Object.fromEntries([...map.entries()].map(([k, v]) => [String(k), v]));
}

function objectToStringMap(obj?: Record<string, string> | null): Map<number, string> {
  const result = new Map<number, string>();
  if (!obj) return result;
  for (const [key, value] of Object.entries(obj)) {
    const cid = Number.parseInt(key, 10);
    if (Number.isFinite(cid)) result.set(cid, value);
  }
  return result;
}

function ensureExtractionShape(value?: Partial<Extraction> | null): Extraction {
  return {
    nodes: value?.nodes ?? [],
    edges: value?.edges ?? [],
    hyperedges: value?.hyperedges ?? [],
    input_tokens: value?.input_tokens ?? 0,
    output_tokens: value?.output_tokens ?? 0,
  };
}

function loadGraph(graphPath: string): Graph {
  const raw = readJson<{
    nodes?: Array<Record<string, unknown> & { id: string }>;
    links?: Array<Record<string, unknown> & { source: string; target: string }>;
    hyperedges?: Array<Record<string, unknown>>;
  }>(graphPath);
  const G = new Graph({ type: "undirected" });

  for (const node of raw.nodes ?? []) {
    const { id, ...attrs } = node;
    G.mergeNode(id, attrs);
  }
  for (const link of raw.links ?? []) {
    const { source, target, ...attrs } = link;
    if (!G.hasNode(source) || !G.hasNode(target)) continue;
    try {
      G.mergeEdge(source, target, attrs);
    } catch {
      /* ignore duplicate merge failures */
    }
  }
  if (raw.hyperedges && raw.hyperedges.length > 0) {
    G.setAttribute("hyperedges", raw.hyperedges);
  }
  return G;
}

function mergeHyperedges(
  existing: Array<Record<string, unknown>> = [],
  incoming: Array<Record<string, unknown>> = [],
): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const merged: Array<Record<string, unknown>> = [];
  for (const hyperedge of [...existing, ...incoming]) {
    const id = String(hyperedge.id ?? "");
    const key = id || JSON.stringify(hyperedge);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hyperedge);
  }
  return merged;
}

function mergeGraphs(target: Graph, source: Graph): void {
  source.forEachNode((nodeId, attrs) => {
    target.mergeNode(nodeId, attrs);
  });
  source.forEachEdge((_edge, attrs, sourceId, targetId) => {
    if (!target.hasNode(sourceId) || !target.hasNode(targetId)) return;
    try {
      target.mergeEdge(sourceId, targetId, attrs);
    } catch {
      /* ignore */
    }
  });
  const mergedHyperedges = mergeHyperedges(
    (target.getAttribute("hyperedges") as Array<Record<string, unknown>> | undefined) ?? [],
    (source.getAttribute("hyperedges") as Array<Record<string, unknown>> | undefined) ?? [],
  );
  if (mergedHyperedges.length > 0) {
    target.setAttribute("hyperedges", mergedHyperedges);
  }
}

function analyzeGraph(
  G: Graph,
  detection: DetectionResult,
  root: string,
  tokenCost: { input: number; output: number },
  labelsOverride?: Map<number, string>,
): {
  communities: Map<number, string[]>;
  cohesion: Map<number, number>;
  labels: Map<number, string>;
  gods: GodNodeEntry[];
  surprises: SurpriseEntry[];
  questions: SuggestedQuestion[];
  report: string;
  analysis: AnalysisFile;
} {
  const communities = cluster(G);
  const cohesion = scoreAll(G, communities);
  const labels = labelsOverride && labelsOverride.size > 0 ? labelsOverride : defaultLabels(communities);
  const gods = godNodes(G);
  const surprises = surprisingConnections(G, communities);
  const questions = suggestQuestions(G, communities, labels);
  const report = generate(
    G,
    communities,
    cohesion,
    labels,
    gods,
    surprises,
    detection,
    tokenCost,
    root,
    questions,
  );
  return {
    communities,
    cohesion,
    labels,
    gods,
    surprises,
    questions,
    report,
    analysis: {
      communities: mapToObject(communities),
      cohesion: mapToObject(cohesion),
      gods,
      surprises,
      questions,
      labels: mapToObject(labels),
    },
  };
}

function placeholderDetection(root: string = "."): DetectionResult {
  return {
    files: { code: [], document: [], paper: [], image: [] },
    total_files: 0,
    total_words: 0,
    needs_graph: true,
    warning: `Reused existing graph at ${resolve(root)} without re-running corpus detection.`,
    skipped_sensitive: [],
    graphifyignore_patterns: 0,
  };
}

function mergeSemanticArtifacts(
  cached: Partial<Extraction> | null | undefined,
  fresh: Partial<Extraction> | null | undefined,
): Extraction {
  const cachedExtraction = ensureExtractionShape(cached);
  const freshExtraction = ensureExtractionShape(fresh);

  const dedupedNodes: Extraction["nodes"] = [];
  const seen = new Set<string>();
  for (const node of [...cachedExtraction.nodes, ...freshExtraction.nodes]) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    dedupedNodes.push(node);
  }

  return {
    nodes: dedupedNodes,
    edges: [...cachedExtraction.edges, ...freshExtraction.edges],
    hyperedges: [...(cachedExtraction.hyperedges ?? []), ...(freshExtraction.hyperedges ?? [])],
    input_tokens: freshExtraction.input_tokens ?? 0,
    output_tokens: freshExtraction.output_tokens ?? 0,
  };
}

function mergeAstAndSemantic(
  astInput: Partial<Extraction> | null | undefined,
  semanticInput: Partial<Extraction> | null | undefined,
): Extraction {
  const ast = ensureExtractionShape(astInput);
  const semantic = ensureExtractionShape(semanticInput);

  const mergedNodes: Extraction["nodes"] = [...ast.nodes];
  const seen = new Set(ast.nodes.map((node) => node.id));
  for (const node of semantic.nodes) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    mergedNodes.push(node);
  }

  return {
    nodes: mergedNodes,
    edges: [...ast.edges, ...semantic.edges],
    hyperedges: semantic.hyperedges ?? [],
    input_tokens: semantic.input_tokens ?? 0,
    output_tokens: semantic.output_tokens ?? 0,
  };
}

function updateCostFile(
  extractionInput: Partial<Extraction> | null | undefined,
  detection: DetectionResult,
  outPath: string,
): {
  runs: Array<{ date: string; input_tokens: number; output_tokens: number; files: number }>;
  total_input_tokens: number;
  total_output_tokens: number;
} {
  const extraction = ensureExtractionShape(extractionInput);
  let cost = {
    runs: [] as Array<{ date: string; input_tokens: number; output_tokens: number; files: number }>,
    total_input_tokens: 0,
    total_output_tokens: 0,
  };
  const resolved = resolve(outPath);
  if (existsSync(resolved)) {
    cost = readJson<typeof cost>(resolved);
  }

  const input = extraction.input_tokens ?? 0;
  const output = extraction.output_tokens ?? 0;
  cost.runs.push({
    date: new Date().toISOString(),
    input_tokens: input,
    output_tokens: output,
    files: detection.total_files,
  });
  cost.total_input_tokens += input;
  cost.total_output_tokens += output;
  writeJson(resolved, cost);
  return cost;
}

function findBestMatchingNode(G: Graph, term: string): string | null {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  let best: { score: number; nodeId: string } | null = null;
  G.forEachNode((nodeId, data) => {
    const label = ((data.label as string) ?? "").toLowerCase();
    const score = words.filter((word) => label.includes(word)).length;
    if (score <= 0) return;
    if (!best || score > best.score) {
      best = { score, nodeId };
    }
  });
  return best?.nodeId ?? null;
}

function runtimeInfo(): Record<string, string> {
  return {
    runtime: "typescript",
    version: getVersion(),
    node: process.execPath,
    script: __filename,
    module: join(__dirname, "index.js"),
    cli: join(__dirname, "cli.js"),
  };
}

async function main(): Promise<void> {
  const program = new Command();
  program.name("graphify-skill-runtime");

  program
    .command("runtime-info")
    .description("Print the runtime metadata for the Codex TypeScript skill")
    .action(() => {
      console.log(JSON.stringify(runtimeInfo(), null, 2));
    });

  program
    .command("detect")
    .argument("<inputPath>")
    .option("--out <path>")
    .action((inputPath, opts) => {
      const result = detect(resolve(inputPath));
      if (opts.out) {
        writeJson(opts.out, result);
        console.log(`Detected ${result.total_files} files in ${resolve(inputPath)}`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    });

  program
    .command("detect-incremental")
    .argument("<inputPath>")
    .option("--manifest <path>", "Path to manifest.json", "graphify-out/manifest.json")
    .option("--out <path>")
    .action((inputPath, opts) => {
      const result = detectIncremental(resolve(inputPath), resolve(opts.manifest));
      if (opts.out) {
        writeJson(opts.out, result);
        console.log(`${result.new_total ?? 0} new/changed file(s) under ${resolve(inputPath)}`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    });

  program
    .command("extract-ast")
    .requiredOption("--detect <path>", "Path to detection JSON")
    .requiredOption("--out <path>", "Path to AST extraction JSON")
    .option("--incremental", "Use detection.new_files.code instead of detection.files.code")
    .action(async (opts) => {
      const detection = readJson<DetectionResult>(opts.detect);
      const codeFiles = opts.incremental
        ? detection.new_files?.code ?? []
        : detection.files.code ?? [];

      if (codeFiles.length === 0) {
        writeJson(opts.out, ensureExtractionShape());
        console.log("No code files - skipping AST extraction");
        return;
      }

      const { extraction, diagnostics } = await extractWithDiagnostics(codeFiles);
      writeJson(opts.out, extraction);
      if (diagnostics.length > 0) {
        const sample = diagnostics
          .slice(0, 3)
          .map((d) => `${d.filePath}: ${d.error}`)
          .join(" | ");
        console.log(`AST: ${extraction.nodes.length} nodes, ${extraction.edges.length} edges (${diagnostics.length} file(s) failed: ${sample})`);
        return;
      }
      console.log(`AST: ${extraction.nodes.length} nodes, ${extraction.edges.length} edges`);
    });

  program
    .command("check-semantic-cache")
    .requiredOption("--detect <path>", "Path to detection JSON")
    .option("--incremental", "Use detection.new_files when present")
    .option("--root <path>", "Graph root for cache resolution", ".")
    .requiredOption("--cached-out <path>", "Path to cached extraction JSON")
    .requiredOption("--uncached-out <path>", "Path to newline-delimited uncached file list")
    .action((opts) => {
      const detection = readJson<DetectionResult>(opts.detect);
      const source = opts.incremental && detection.new_files ? detection.new_files : detection.files;
      const allFiles = [
        ...(source.document ?? []),
        ...(source.paper ?? []),
        ...(source.image ?? []),
      ];
      const [cachedNodes, cachedEdges, cachedHyperedges, uncached] = checkSemanticCache(
        allFiles,
        resolve(opts.root),
      );
      writeJson(opts.cachedOut, {
        nodes: cachedNodes,
        edges: cachedEdges,
        hyperedges: cachedHyperedges,
      });
      mkdirSync(dirname(resolve(opts.uncachedOut)), { recursive: true });
      writeFileSync(resolve(opts.uncachedOut), uncached.join("\n"), "utf-8");
      console.log(`Cache: ${allFiles.length - uncached.length} files hit, ${uncached.length} files need extraction`);
    });

  program
    .command("save-semantic-cache")
    .requiredOption("--input <path>", "Path to semantic extraction JSON")
    .option("--root <path>", "Graph root for cache resolution", ".")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.input));
      const saved = saveSemanticCache(
        extraction.nodes as Array<Record<string, unknown>>,
        extraction.edges as Array<Record<string, unknown>>,
        (extraction.hyperedges ?? []) as Array<Record<string, unknown>>,
        resolve(opts.root),
      );
      console.log(`Cached ${saved} files`);
    });

  program
    .command("merge-semantic")
    .requiredOption("--cached <path>")
    .requiredOption("--new <path>")
    .requiredOption("--out <path>")
    .action((opts) => {
      const cached = ensureExtractionShape(readJson<Partial<Extraction>>(opts.cached));
      const fresh = ensureExtractionShape(readJson<Partial<Extraction>>(opts.new));

      const dedupedNodes: Extraction["nodes"] = [];
      const seen = new Set<string>();
      for (const node of [...cached.nodes, ...fresh.nodes]) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        dedupedNodes.push(node);
      }

      const merged: Extraction = {
        nodes: dedupedNodes,
        edges: [...cached.edges, ...fresh.edges],
        hyperedges: [...(cached.hyperedges ?? []), ...(fresh.hyperedges ?? [])],
        input_tokens: fresh.input_tokens ?? 0,
        output_tokens: fresh.output_tokens ?? 0,
      };
      writeJson(opts.out, merged);
      console.log(
        `Extraction complete - ${merged.nodes.length} nodes, ${merged.edges.length} edges (${cached.nodes.length} from cache, ${fresh.nodes.length} new)`,
      );
    });

  program
    .command("merge-extraction")
    .requiredOption("--ast <path>")
    .requiredOption("--semantic <path>")
    .requiredOption("--out <path>")
    .action((opts) => {
      const ast = ensureExtractionShape(readJson<Partial<Extraction>>(opts.ast));
      const semantic = ensureExtractionShape(readJson<Partial<Extraction>>(opts.semantic));

      const mergedNodes: Extraction["nodes"] = [...ast.nodes];
      const seen = new Set(ast.nodes.map((node) => node.id));
      for (const node of semantic.nodes) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        mergedNodes.push(node);
      }

      const merged: Extraction = {
        nodes: mergedNodes,
        edges: [...ast.edges, ...semantic.edges],
        hyperedges: semantic.hyperedges ?? [],
        input_tokens: semantic.input_tokens ?? 0,
        output_tokens: semantic.output_tokens ?? 0,
      };
      writeJson(opts.out, merged);
      console.log(
        `Merged: ${merged.nodes.length} nodes, ${merged.edges.length} edges (${ast.nodes.length} AST + ${semantic.nodes.length} semantic)`,
      );
    });

  program
    .command("finalize-build")
    .requiredOption("--detect <path>")
    .requiredOption("--ast <path>")
    .requiredOption("--root <path>")
    .requiredOption("--graph-out <path>")
    .requiredOption("--report-out <path>")
    .requiredOption("--analysis-out <path>")
    .requiredOption("--cost-out <path>")
    .option("--cached <path>", "Optional cached semantic JSON")
    .option("--semantic-new <path>", "Optional fresh semantic JSON")
    .option("--html-out <path>", "Optional graph.html output path")
    .action((opts) => {
      const detection = readJson<DetectionResult>(opts.detect);
      const ast = ensureExtractionShape(readJson<Partial<Extraction>>(opts.ast));
      const cached = opts.cached && existsSync(resolve(opts.cached))
        ? readJson<Partial<Extraction>>(opts.cached)
        : null;
      const semanticNew = opts.semanticNew && existsSync(resolve(opts.semanticNew))
        ? readJson<Partial<Extraction>>(opts.semanticNew)
        : null;

      if (semanticNew) {
        saveSemanticCache(
          semanticNew.nodes as Array<Record<string, unknown>>,
          semanticNew.edges as Array<Record<string, unknown>>,
          (semanticNew.hyperedges ?? []) as Array<Record<string, unknown>>,
          ".",
        );
      }

      const semantic = mergeSemanticArtifacts(cached, semanticNew);
      const extraction = mergeAstAndSemantic(ast, semantic);
      const G = buildFromJson(extraction);
      if (G.order === 0) {
        throw new Error("Graph is empty - extraction produced no nodes.");
      }

      const analyzed = analyzeGraph(
        G,
        detection,
        resolve(opts.root),
        { input: extraction.input_tokens ?? 0, output: extraction.output_tokens ?? 0 },
      );

      toJson(G, analyzed.communities, resolve(opts.graphOut));
      writeFileSync(resolve(opts.reportOut), analyzed.report, "utf-8");
      writeJson(opts.analysisOut, analyzed.analysis);
      if (opts.htmlOut) {
        toHtml(G, analyzed.communities, resolve(opts.htmlOut), {
          communityLabels: analyzed.labels,
        });
      }
      saveManifest(detection.files, join(dirname(resolve(opts.graphOut)), "manifest.json"));
      const cost = updateCostFile(extraction, detection, opts.costOut);

      console.log(`Graph: ${G.order} nodes, ${G.size} edges, ${analyzed.communities.size} communities`);
      console.log(`This run: ${(extraction.input_tokens ?? 0).toLocaleString()} input tokens, ${(extraction.output_tokens ?? 0).toLocaleString()} output tokens`);
      console.log(`All time: ${cost.total_input_tokens.toLocaleString()} input, ${cost.total_output_tokens.toLocaleString()} output (${cost.runs.length} runs)`);
    });

  program
    .command("finalize-update")
    .requiredOption("--detect <path>")
    .requiredOption("--ast <path>")
    .requiredOption("--existing-graph <path>")
    .requiredOption("--root <path>")
    .requiredOption("--graph-out <path>")
    .requiredOption("--report-out <path>")
    .requiredOption("--analysis-out <path>")
    .requiredOption("--cost-out <path>")
    .option("--cached <path>", "Optional cached semantic JSON")
    .option("--semantic-new <path>", "Optional fresh semantic JSON")
    .option("--html-out <path>", "Optional graph.html output path")
    .action((opts) => {
      const detection = readJson<DetectionResult>(opts.detect);
      const ast = ensureExtractionShape(readJson<Partial<Extraction>>(opts.ast));
      const cached = opts.cached && existsSync(resolve(opts.cached))
        ? readJson<Partial<Extraction>>(opts.cached)
        : null;
      const semanticNew = opts.semanticNew && existsSync(resolve(opts.semanticNew))
        ? readJson<Partial<Extraction>>(opts.semanticNew)
        : null;

      if (semanticNew) {
        saveSemanticCache(
          semanticNew.nodes as Array<Record<string, unknown>>,
          semanticNew.edges as Array<Record<string, unknown>>,
          (semanticNew.hyperedges ?? []) as Array<Record<string, unknown>>,
          ".",
        );
      }

      const semantic = mergeSemanticArtifacts(cached, semanticNew);
      const extraction = mergeAstAndSemantic(ast, semantic);

      const oldGraph = loadGraph(opts.existingGraph);
      const mergedGraph = loadGraph(opts.existingGraph);
      const newGraph = buildFromJson(extraction);
      mergeGraphs(mergedGraph, newGraph);

      const analyzed = analyzeGraph(
        mergedGraph,
        detection,
        resolve(opts.root),
        { input: extraction.input_tokens ?? 0, output: extraction.output_tokens ?? 0 },
      );
      analyzed.analysis.diff = graphDiff(oldGraph, mergedGraph);

      toJson(mergedGraph, analyzed.communities, resolve(opts.graphOut));
      writeFileSync(resolve(opts.reportOut), analyzed.report, "utf-8");
      writeJson(opts.analysisOut, analyzed.analysis);
      if (opts.htmlOut) {
        toHtml(mergedGraph, analyzed.communities, resolve(opts.htmlOut), {
          communityLabels: analyzed.labels,
        });
      }
      saveManifest(detection.files, join(dirname(resolve(opts.graphOut)), "manifest.json"));
      const cost = updateCostFile(extraction, detection, opts.costOut);

      console.log(`Merged: ${mergedGraph.order} nodes, ${mergedGraph.size} edges`);
      console.log(analyzed.analysis.diff.summary);
      console.log(`This run: ${(extraction.input_tokens ?? 0).toLocaleString()} input tokens, ${(extraction.output_tokens ?? 0).toLocaleString()} output tokens`);
      console.log(`All time: ${cost.total_input_tokens.toLocaleString()} input, ${cost.total_output_tokens.toLocaleString()} output (${cost.runs.length} runs)`);
    });

  program
    .command("analyze-build")
    .requiredOption("--extract <path>")
    .requiredOption("--detect <path>")
    .requiredOption("--root <path>")
    .requiredOption("--graph-out <path>")
    .requiredOption("--report-out <path>")
    .requiredOption("--analysis-out <path>")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const detection = readJson<DetectionResult>(opts.detect);
      const root = resolve(opts.root);
      const G = buildFromJson(extraction);

      if (G.order === 0) {
        throw new Error("Graph is empty - extraction produced no nodes.");
      }

      const analyzed = analyzeGraph(
        G,
        detection,
        root,
        { input: extraction.input_tokens ?? 0, output: extraction.output_tokens ?? 0 },
      );

      mkdirSync(dirname(resolve(opts.graphOut)), { recursive: true });
      toJson(G, analyzed.communities, resolve(opts.graphOut));
      writeFileSync(resolve(opts.reportOut), analyzed.report, "utf-8");
      writeJson(opts.analysisOut, analyzed.analysis);
      saveManifest(detection.files, join(dirname(resolve(opts.graphOut)), "manifest.json"));
      console.log(`Graph: ${G.order} nodes, ${G.size} edges, ${analyzed.communities.size} communities`);
    });

  program
    .command("write-labeled-report")
    .requiredOption("--extract <path>")
    .requiredOption("--detect <path>")
    .requiredOption("--analysis <path>")
    .requiredOption("--labels <path>")
    .requiredOption("--root <path>")
    .requiredOption("--report-out <path>")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const detection = readJson<DetectionResult>(opts.detect);
      const analysis = readJson<AnalysisFile>(opts.analysis);
      const labelObject = readJson<Record<string, string>>(opts.labels);
      const labels = objectToStringMap(labelObject);
      const G = buildFromJson(extraction);
      const communities = new Map<number, string[]>(
        Object.entries(analysis.communities).map(([key, value]) => [Number.parseInt(key, 10), value]),
      );
      const cohesion = new Map<number, number>(
        Object.entries(analysis.cohesion).map(([key, value]) => [Number.parseInt(key, 10), value]),
      );
      const questions = suggestQuestions(G, communities, labels);
      const report = generate(
        G,
        communities,
        cohesion,
        labels,
        analysis.gods,
        analysis.surprises,
        detection,
        { input: extraction.input_tokens ?? 0, output: extraction.output_tokens ?? 0 },
        resolve(opts.root),
        questions,
      );

      analysis.questions = questions;
      analysis.labels = mapToObject(labels);
      writeFileSync(resolve(opts.reportOut), report, "utf-8");
      writeJson(opts.analysis, analysis);
      console.log("Report updated with community labels");
    });

  program
    .command("export-html")
    .requiredOption("--extract <path>")
    .requiredOption("--analysis <path>")
    .option("--labels <path>")
    .requiredOption("--out <path>")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const analysis = readJson<AnalysisFile>(opts.analysis);
      const labels = opts.labels ? objectToStringMap(readJson<Record<string, string>>(opts.labels)) : objectToStringMap(analysis.labels);
      const communities = new Map<number, string[]>(
        Object.entries(analysis.communities).map(([key, value]) => [Number.parseInt(key, 10), value]),
      );
      const G = buildFromJson(extraction);
      toHtml(G, communities, resolve(opts.out), { communityLabels: labels });
      console.log("graph.html written - open in any browser, no server needed");
    });

  program
    .command("export-svg")
    .requiredOption("--extract <path>")
    .requiredOption("--analysis <path>")
    .option("--labels <path>")
    .requiredOption("--out <path>")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const analysis = readJson<AnalysisFile>(opts.analysis);
      const labels = opts.labels ? objectToStringMap(readJson<Record<string, string>>(opts.labels)) : objectToStringMap(analysis.labels);
      const communities = new Map<number, string[]>(
        Object.entries(analysis.communities).map(([key, value]) => [Number.parseInt(key, 10), value]),
      );
      const G = buildFromJson(extraction);
      toSvg(G, communities, resolve(opts.out), labels);
      console.log("graph.svg written - embeds in Obsidian, Notion, GitHub READMEs");
    });

  program
    .command("export-graphml")
    .requiredOption("--extract <path>")
    .requiredOption("--analysis <path>")
    .requiredOption("--out <path>")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const analysis = readJson<AnalysisFile>(opts.analysis);
      const communities = new Map<number, string[]>(
        Object.entries(analysis.communities).map(([key, value]) => [Number.parseInt(key, 10), value]),
      );
      const G = buildFromJson(extraction);
      toGraphml(G, communities, resolve(opts.out));
      console.log("graph.graphml written - open in Gephi, yEd, or any GraphML tool");
    });

  program
    .command("export-cypher")
    .requiredOption("--extract <path>")
    .requiredOption("--out <path>")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const G = buildFromJson(extraction);
      toCypher(G, resolve(opts.out));
      console.log("cypher.txt written - import with: cypher-shell < graphify-out/cypher.txt");
    });

  program
    .command("push-neo4j")
    .requiredOption("--extract <path>")
    .requiredOption("--analysis <path>")
    .requiredOption("--uri <uri>")
    .requiredOption("--user <user>")
    .requiredOption("--password <password>")
    .action(async (opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const analysis = readJson<AnalysisFile>(opts.analysis);
      const G = buildFromJson(extraction);
      const communities = new Map<number, string[]>(
        Object.entries(analysis.communities).map(([key, value]) => [Number.parseInt(key, 10), value]),
      );
      const result = await pushToNeo4j(G, {
        uri: opts.uri,
        user: opts.user,
        password: opts.password,
        communities,
      });
      console.log(`Pushed to Neo4j: ${result.nodes} nodes, ${result.edges} edges`);
    });

  program
    .command("benchmark")
    .requiredOption("--graph <path>")
    .option("--corpus-words <n>")
    .action((opts) => {
      const corpusWords = opts.corpusWords ? Number.parseInt(opts.corpusWords, 10) : undefined;
      const result = runBenchmark(resolve(opts.graph), corpusWords);
      printBenchmark(result);
    });

  program
    .command("update-cost")
    .requiredOption("--extract <path>")
    .requiredOption("--detect <path>")
    .requiredOption("--out <path>")
    .action((opts) => {
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const detection = readJson<DetectionResult>(opts.detect);
      const outPath = resolve(opts.out);

      let cost = {
        runs: [] as Array<{ date: string; input_tokens: number; output_tokens: number; files: number }>,
        total_input_tokens: 0,
        total_output_tokens: 0,
      };
      if (existsSync(outPath)) {
        cost = readJson<typeof cost>(outPath);
      }

      const input = extraction.input_tokens ?? 0;
      const output = extraction.output_tokens ?? 0;
      cost.runs.push({
        date: new Date().toISOString(),
        input_tokens: input,
        output_tokens: output,
        files: detection.total_files,
      });
      cost.total_input_tokens += input;
      cost.total_output_tokens += output;
      writeJson(outPath, cost);

      console.log(`This run: ${input.toLocaleString()} input tokens, ${output.toLocaleString()} output tokens`);
      console.log(
        `All time: ${cost.total_input_tokens.toLocaleString()} input, ${cost.total_output_tokens.toLocaleString()} output (${cost.runs.length} runs)`,
      );
    });

  program
    .command("merge-update")
    .requiredOption("--existing-graph <path>")
    .requiredOption("--extract <path>")
    .requiredOption("--detect <path>")
    .requiredOption("--root <path>")
    .requiredOption("--graph-out <path>")
    .requiredOption("--report-out <path>")
    .requiredOption("--analysis-out <path>")
    .action((opts) => {
      const oldGraph = loadGraph(opts.existingGraph);
      const mergedGraph = loadGraph(opts.existingGraph);
      const extraction = ensureExtractionShape(readJson<Partial<Extraction>>(opts.extract));
      const detection = readJson<DetectionResult>(opts.detect);
      const newGraph = buildFromJson(extraction);

      mergeGraphs(mergedGraph, newGraph);

      const analyzed = analyzeGraph(
        mergedGraph,
        detection,
        resolve(opts.root),
        { input: extraction.input_tokens ?? 0, output: extraction.output_tokens ?? 0 },
      );
      analyzed.analysis.diff = graphDiff(oldGraph, mergedGraph);

      toJson(mergedGraph, analyzed.communities, resolve(opts.graphOut));
      writeFileSync(resolve(opts.reportOut), analyzed.report, "utf-8");
      writeJson(opts.analysisOut, analyzed.analysis);
      saveManifest(detection.files, join(dirname(resolve(opts.graphOut)), "manifest.json"));

      console.log(`Merged: ${mergedGraph.order} nodes, ${mergedGraph.size} edges`);
      console.log(analyzed.analysis.diff.summary);
    });

  program
    .command("cluster-only")
    .requiredOption("--graph <path>")
    .requiredOption("--root <path>")
    .requiredOption("--graph-out <path>")
    .requiredOption("--report-out <path>")
    .requiredOption("--analysis-out <path>")
    .action((opts) => {
      const G = loadGraph(opts.graph);
      const analyzed = analyzeGraph(
        G,
        placeholderDetection(opts.root),
        resolve(opts.root),
        { input: 0, output: 0 },
      );
      toJson(G, analyzed.communities, resolve(opts.graphOut));
      writeFileSync(resolve(opts.reportOut), analyzed.report, "utf-8");
      writeJson(opts.analysisOut, analyzed.analysis);
      console.log(`Re-clustered: ${analyzed.communities.size} communities`);
    });

  program
    .command("path")
    .requiredOption("--graph <path>")
    .argument("<nodeA>")
    .argument("<nodeB>")
    .action(async (nodeA, nodeB, opts) => {
      const G = loadGraph(opts.graph);
      const source = findBestMatchingNode(G, nodeA);
      const target = findBestMatchingNode(G, nodeB);
      if (!source || !target) {
        console.log(`Could not find nodes matching: ${JSON.stringify(nodeA)} or ${JSON.stringify(nodeB)}`);
        return;
      }
      let path: string[];
      try {
        const shortestPath = await import("graphology-shortest-path/unweighted.js");
        path = shortestPath.bidirectional(G, source, target) ?? [];
      } catch {
        throw new Error("graphology-shortest-path is unavailable");
      }
      if (path.length === 0) {
        console.log(`No path found between ${JSON.stringify(nodeA)} and ${JSON.stringify(nodeB)}`);
        return;
      }
      console.log(`Shortest path (${path.length - 1} hops):`);
      for (let i = 0; i < path.length; i++) {
        const nodeId = path[i]!;
        const label = (G.getNodeAttribute(nodeId, "label") as string) ?? nodeId;
        if (i === path.length - 1) {
          console.log(`  ${label}`);
          break;
        }
        const nextNode = path[i + 1]!;
        const edgeId = G.edge(nodeId, nextNode);
        const attrs = edgeId ? G.getEdgeAttributes(edgeId) : {};
        console.log(`  ${label} --${attrs.relation ?? ""}--> [${attrs.confidence ?? ""}]`);
      }
    });

  program
    .command("explain")
    .requiredOption("--graph <path>")
    .argument("<nodeName>")
    .action((nodeName, opts) => {
      const G = loadGraph(opts.graph);
      const nodeId = findBestMatchingNode(G, nodeName);
      if (!nodeId) {
        console.log(`No node matching ${JSON.stringify(nodeName)}`);
        return;
      }
      const attrs = G.getNodeAttributes(nodeId);
      console.log(`NODE: ${(attrs.label as string) ?? nodeId}`);
      console.log(`  source: ${(attrs.source_file as string) ?? "unknown"}`);
      console.log(`  type: ${(attrs.file_type as string) ?? "unknown"}`);
      console.log(`  degree: ${G.degree(nodeId)}`);
      console.log("");
      console.log("CONNECTIONS:");
      G.forEachNeighbor(nodeId, (neighbor) => {
        const edgeId = G.edge(nodeId, neighbor);
        const edge = edgeId ? G.getEdgeAttributes(edgeId) : {};
        const label = (G.getNodeAttribute(neighbor, "label") as string) ?? neighbor;
        const sourceFile = (G.getNodeAttribute(neighbor, "source_file") as string) ?? "";
        console.log(`  --${edge.relation ?? ""}--> ${label} [${edge.confidence ?? ""}] (${sourceFile})`);
      });
    });

  program
    .command("ingest")
    .argument("<url>")
    .option("--target-dir <path>", "Directory to save fetched content", "./raw")
    .option("--author <name>")
    .option("--contributor <name>")
    .action(async (url, opts) => {
      const outPath = await ingest(url, resolve(opts.targetDir), {
        author: opts.author ?? null,
        contributor: opts.contributor ?? null,
      });
      console.log(`Saved to ${outPath}`);
    });

  program
    .command("save-query-result")
    .requiredOption("--question <text>")
    .requiredOption("--answer <text>")
    .requiredOption("--memory-dir <path>")
    .option("--query-type <type>", "Type label for the saved Q&A", "query")
    .option("--source-nodes-json <json>", "JSON array of source node labels", "[]")
    .action((opts) => {
      const outPath = saveQueryResult({
        question: opts.question,
        answer: opts.answer,
        memoryDir: resolve(opts.memoryDir),
        queryType: opts.queryType,
        sourceNodes: JSON.parse(opts.sourceNodesJson) as string[],
      });
      console.log(`Saved to ${outPath}`);
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
