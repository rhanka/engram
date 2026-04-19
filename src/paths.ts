/**
 * Central path contract for graphify-owned workspace state.
 *
 * The public default is now .graphify/. Legacy graphify-out/ paths are kept
 * as read fallbacks for one compatibility window.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export const DEFAULT_GRAPHIFY_STATE_DIR = ".graphify";
export const LEGACY_GRAPHIFY_STATE_DIR = "graphify-out";
export const NEXT_GRAPHIFY_STATE_DIR = DEFAULT_GRAPHIFY_STATE_DIR;

export interface GraphifyPathOptions {
  /** Workspace root. Defaults to the current process directory. */
  root?: string;
  /** State directory relative to root, or absolute. Defaults to .graphify. */
  stateDir?: string;
}

export interface GraphifyScratchPaths {
  detect: string;
  detectSemantic: string;
  ast: string;
  cached: string;
  uncached: string;
  semanticNew: string;
  semantic: string;
  extract: string;
  analysis: string;
  labels: string;
  transcripts: string;
  pdfOcr: string;
  incremental: string;
  incrementalSemantic: string;
  oldGraph: string;
  runtime: string;
  node: string;
  runtimeScript: string;
}

export interface GraphifyLegacyRootScratchPaths {
  detect: string;
  extract: string;
  analysis: string;
  labels: string;
  incremental: string;
  oldGraph: string;
}

export interface GraphifyPaths {
  root: string;
  stateDir: string;
  graph: string;
  report: string;
  html: string;
  manifest: string;
  cost: string;
  cacheDir: string;
  transcriptsDir: string;
  downloadsDir: string;
  convertedDir: string;
  memoryDir: string;
  wikiDir: string;
  needsUpdate: string;
  scratch: GraphifyScratchPaths;
  legacyRootScratch: GraphifyLegacyRootScratchPaths;
}

function statePath(root: string, stateDir: string): string {
  return resolve(root, stateDir);
}

export function resolveGraphifyPaths(options: GraphifyPathOptions = {}): GraphifyPaths {
  const root = resolve(options.root ?? ".");
  const stateDir = statePath(root, options.stateDir ?? DEFAULT_GRAPHIFY_STATE_DIR);

  const scratch: GraphifyScratchPaths = {
    detect: join(stateDir, ".graphify_detect.json"),
    detectSemantic: join(stateDir, ".graphify_detect_semantic.json"),
    ast: join(stateDir, ".graphify_ast.json"),
    cached: join(stateDir, ".graphify_cached.json"),
    uncached: join(stateDir, ".graphify_uncached.txt"),
    semanticNew: join(stateDir, ".graphify_semantic_new.json"),
    semantic: join(stateDir, ".graphify_semantic.json"),
    extract: join(stateDir, ".graphify_extract.json"),
    analysis: join(stateDir, ".graphify_analysis.json"),
    labels: join(stateDir, ".graphify_labels.json"),
    transcripts: join(stateDir, ".graphify_transcripts.json"),
    pdfOcr: join(stateDir, ".graphify_pdf_ocr.json"),
    incremental: join(stateDir, ".graphify_incremental.json"),
    incrementalSemantic: join(stateDir, ".graphify_incremental_semantic.json"),
    oldGraph: join(stateDir, ".graphify_old.json"),
    runtime: join(stateDir, ".graphify_runtime.json"),
    node: join(stateDir, ".graphify_node"),
    runtimeScript: join(stateDir, ".graphify_runtime_script"),
  };

  return {
    root,
    stateDir,
    graph: join(stateDir, "graph.json"),
    report: join(stateDir, "GRAPH_REPORT.md"),
    html: join(stateDir, "graph.html"),
    manifest: join(stateDir, "manifest.json"),
    cost: join(stateDir, "cost.json"),
    cacheDir: join(stateDir, "cache"),
    transcriptsDir: join(stateDir, "transcripts"),
    downloadsDir: join(stateDir, "transcripts", "downloads"),
    convertedDir: join(stateDir, "converted"),
    memoryDir: join(stateDir, "memory"),
    wikiDir: join(stateDir, "wiki"),
    needsUpdate: join(stateDir, "needs_update"),
    scratch,
    legacyRootScratch: {
      detect: join(root, ".graphify_detect.json"),
      extract: join(root, ".graphify_extract.json"),
      analysis: join(root, ".graphify_analysis.json"),
      labels: join(root, ".graphify_labels.json"),
      incremental: join(root, ".graphify_incremental.json"),
      oldGraph: join(root, ".graphify_old.json"),
    },
  };
}

export function defaultGraphPath(root?: string): string {
  return resolveGraphifyPaths({ root }).graph;
}

export function legacyGraphPath(root?: string): string {
  return resolveGraphifyPaths({ root, stateDir: LEGACY_GRAPHIFY_STATE_DIR }).graph;
}

/**
 * Resolve a graph input path for read operations.
 *
 * Explicit user paths are respected. Implicit/default reads prefer .graphify,
 * then fall back to legacy graphify-out if only the old artifact exists.
 */
export function resolveGraphInputPath(graphPath?: string, root?: string): string {
  if (graphPath) return resolve(graphPath);
  const current = defaultGraphPath(root);
  if (existsSync(current)) return current;
  const legacy = legacyGraphPath(root);
  if (existsSync(legacy)) return legacy;
  return current;
}

export function defaultManifestPath(root?: string): string {
  return resolveGraphifyPaths({ root }).manifest;
}

export function defaultTranscriptsDir(root?: string): string {
  return resolveGraphifyPaths({ root }).transcriptsDir;
}
