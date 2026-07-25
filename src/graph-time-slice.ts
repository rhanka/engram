/**
 * Build-time temporal window over an emitted graph.json
 * (SPEC_AGENTSTATS_TIMEORIENTED, §3(a) — the file backend).
 *
 * This is the file-backend sibling of the T5 store window and the T6 point
 * recall: the SAME `t` / `t_end` membership predicate, but the output is a
 * re-emittable `graph.json` rather than a flat canonical projection, so every
 * existing file surface (summary, studio export, `recall --graph`) can consume
 * a temporal slice without a new reader.
 *
 * Two deliberate differences from the T5/T6 window, both stamped on the
 * emitted `graph.window` block so a consumer never has to guess:
 *
 *  - Edges are endpoint-induced. T5/T6 evaluate node and edge membership
 *    independently and may return an edge whose endpoints are absent; a
 *    graph.json with a dangling link is not loadable, so an in-window edge
 *    whose endpoint did not survive is dropped (and counted).
 *  - Untimed elements are excluded, exactly as in T5/T6: an element with no
 *    numeric `t` carries no span and therefore overlaps no window.
 *
 * This module is read-mostly and LLM-free. It never mutates the source graph,
 * and it is not wired into the build pipeline: slicing an emitted graph.json
 * keeps the (non-deterministic, sidecar-co-emitting) build path untouched.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { computeTopologySignatureFromLinks } from "./export.js";
import type { SerializedGraphData } from "./graph.js";
import { assertGraphJsonFileSize, assertGraphJsonSize } from "./graph-size-guard.js";
import { resolveGraphInputPath } from "./paths.js";
import { loadProjectConfig } from "./project-config.js";
import { overlapsTemporalWindow, parseRecallTimestamp } from "./temporal-recall.js";
import type { NormalizedProjectConfig } from "./types.js";

export const GRAPH_TIME_SLICE_SCHEMA = "graphify.graph-time-slice/v1" as const;
export const GRAPH_WINDOW_SCHEMA = "graphify.graph-window/v1" as const;

type GraphRecord = Record<string, unknown>;
type SerializedNode = GraphRecord & { id: string };
type SerializedLink = GraphRecord & { source: string; target: string };

export interface GraphTimeSliceBounds {
  /** Inclusive lower bound in epoch-ms; `null` leaves the past open. */
  sinceMs: number | null;
  /** Inclusive upper bound in epoch-ms; `null` leaves the future open. */
  untilMs: number | null;
}

/** The `graph.window` block stamped on a sliced graph.json. */
export interface GraphTimeSliceWindow {
  schema: typeof GRAPH_WINDOW_SCHEMA;
  since: number | null;
  until: number | null;
  since_iso: string | null;
  until_iso: string | null;
  /** `t <= until AND (t_end absent OR t_end >= since)`; a point is `t_end === t`. */
  predicate: "inclusive-overlap";
  /** No numeric `t` means no span, so the element cannot overlap the window. */
  untimed: "excluded";
  /** Output must stay loadable, so an in-window edge needs both endpoints. */
  edges: "endpoint-induced";
  derived_from: {
    topology_signature_sha256: string | null;
    nodes: number;
    links: number;
    hyperedges: number;
  };
}

export interface GraphTimeSliceCounts {
  nodes: { total: number; retained: number };
  links: {
    total: number;
    retained: number;
    /** In-window edges dropped only because an endpoint left the window. */
    dropped_missing_endpoint: number;
  };
  hyperedges: { total: number; retained: number };
}

export interface GraphTimeSliceResult {
  schema: typeof GRAPH_TIME_SLICE_SCHEMA;
  window: GraphTimeSliceWindow;
  counts: GraphTimeSliceCounts;
  /** The sliced, re-emittable document. */
  graph: SerializedGraphData;
}

/** Machine report for `--json`: the result without the (large) graph payload. */
export interface GraphTimeSliceReport {
  schema: typeof GRAPH_TIME_SLICE_SCHEMA;
  window: GraphTimeSliceWindow;
  counts: GraphTimeSliceCounts;
  source: string;
  out: string | null;
  written: boolean;
}

export interface GraphTimeSliceOptions {
  /** Safe integer epoch-ms, or ISO-8601 with an explicit Z/UTC offset. */
  since?: string | number;
  /** Safe integer epoch-ms, or ISO-8601 with an explicit Z/UTC offset. */
  until?: string | number;
  /** Explicit source graph.json. Otherwise config state-dir, else default. */
  graph?: string;
  config?: string;
  /** Destination graph.json. Omitted ⇒ dry run, nothing is written. */
  out?: string;
  /** Allow overwriting an existing destination (never the source). */
  force?: boolean;
  json?: boolean;
}

export interface GraphTimeSliceDeps {
  readGraph?: (path: string) => SerializedGraphData;
  writeGraph?: (path: string, contents: string) => void;
  log?: (line: string) => void;
}

export interface GraphTimeSliceRun {
  result: GraphTimeSliceResult;
  sourcePath: string;
  outPath: string | null;
  written: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertBound(value: number | null, flag: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${flag} must be a safe integer epoch-ms`);
  }
  return value;
}

function isoOrNull(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function topologySignatureSha256(raw: SerializedGraphData): string | null {
  const signature = (raw as GraphRecord).topology_signature;
  if (typeof signature !== "string") return null;
  return `sha256:${createHash("sha256").update(signature, "utf-8").digest("hex")}`;
}

function readArray(value: unknown): GraphRecord[] {
  return Array.isArray(value) ? (value as GraphRecord[]) : [];
}

/**
 * Slice an emitted graph document to the elements overlapping `[since, until]`.
 *
 * Pure: the source document is never mutated and retained records are carried
 * verbatim (positions, descriptions, citations, `t_src`, unknown attributes) in
 * source order, so the slice is byte-deterministic for a given input.
 */
export function sliceGraphByTime(
  raw: SerializedGraphData,
  bounds: GraphTimeSliceBounds,
): GraphTimeSliceResult {
  const since = assertBound(bounds.sinceMs, "since");
  const until = assertBound(bounds.untilMs, "until");
  if (since === null && until === null) {
    throw new RangeError("a temporal slice requires at least one of since/until");
  }
  if (since !== null && until !== null && since > until) {
    throw new RangeError("temporal slice requires since <= until");
  }

  const fromMs = since ?? Number.NEGATIVE_INFINITY;
  const toMs = until ?? Number.POSITIVE_INFINITY;

  const rawNodes = readArray(raw.nodes);
  const edgeKey: "links" | "edges" = Array.isArray(raw.links)
    ? "links"
    : Array.isArray(raw.edges)
      ? "edges"
      : "links";
  const rawLinks = readArray(raw.links ?? raw.edges);
  const rawHyperedges = readArray(raw.hyperedges);

  // Fail closed rather than silently emitting an empty graph: a graph with no
  // `t` anywhere is not a temporal graph, it is a misuse of the flag.
  const timed =
    rawNodes.some((node) => isFiniteNumber(node.t)) ||
    rawLinks.some((link) => isFiniteNumber(link.t));
  if (!timed) {
    throw new Error(
      "graph carries no numeric 't' stamps; nothing to slice " +
        "(see SPEC_AGENTSTATS_TIMEORIENTED §1)",
    );
  }

  const nodes = rawNodes.filter(
    (node): node is SerializedNode =>
      typeof node.id === "string" && overlapsTemporalWindow(node, fromMs, toMs),
  );
  const retainedIds = new Set(nodes.map((node) => node.id));

  const links: SerializedLink[] = [];
  let droppedMissingEndpoint = 0;
  for (const link of rawLinks) {
    if (typeof link.source !== "string" || typeof link.target !== "string") continue;
    if (!overlapsTemporalWindow(link, fromMs, toMs)) continue;
    if (!retainedIds.has(link.source) || !retainedIds.has(link.target)) {
      droppedMissingEndpoint += 1;
      continue;
    }
    links.push(link as SerializedLink);
  }

  // Hyperedges follow the same rule as links: in-window, and fully induced by
  // the retained nodes. Untimed hyperedges are excluded like every other
  // untimed element.
  const hyperedges = rawHyperedges.filter((hyperedge) => {
    if (!overlapsTemporalWindow(hyperedge, fromMs, toMs)) return false;
    const members = hyperedge.nodes;
    if (!Array.isArray(members) || members.length === 0) return false;
    return members.every((member) => typeof member === "string" && retainedIds.has(member));
  });

  const window: GraphTimeSliceWindow = {
    schema: GRAPH_WINDOW_SCHEMA,
    since,
    until,
    since_iso: isoOrNull(since),
    until_iso: isoOrNull(until),
    predicate: "inclusive-overlap",
    untimed: "excluded",
    edges: "endpoint-induced",
    derived_from: {
      topology_signature_sha256: topologySignatureSha256(raw),
      nodes: rawNodes.length,
      links: rawLinks.length,
      hyperedges: rawHyperedges.length,
    },
  };

  const {
    graph: sourceGraphBlock,
    nodes: _sourceNodes,
    links: _sourceLinks,
    edges: _sourceEdges,
    hyperedges: _sourceHyperedges,
    ...siblings
  } = raw as SerializedGraphData & GraphRecord;

  const sliced = {
    ...siblings,
    graph: { ...(sourceGraphBlock ?? {}), window },
    // The slice is a different topology, so the inherited signature would lie.
    topology_signature: computeTopologySignatureFromLinks(nodes, links),
    nodes,
    [edgeKey]: links,
    hyperedges,
  } as SerializedGraphData;

  return {
    schema: GRAPH_TIME_SLICE_SCHEMA,
    window,
    counts: {
      nodes: { total: rawNodes.length, retained: nodes.length },
      links: {
        total: rawLinks.length,
        retained: links.length,
        dropped_missing_endpoint: droppedMissingEndpoint,
      },
      hyperedges: { total: rawHyperedges.length, retained: hyperedges.length },
    },
    graph: sliced,
  };
}

function loadConfig(configPath: string | undefined): NormalizedProjectConfig | undefined {
  return configPath ? loadProjectConfig(resolve(configPath)) : undefined;
}

function readGraphDocument(path: string, deps: GraphTimeSliceDeps): SerializedGraphData {
  if (deps.readGraph) return deps.readGraph(path);
  assertGraphJsonFileSize(path, "read");
  const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`graph file must contain a JSON object: ${path}`);
  }
  return parsed as SerializedGraphData;
}

export function toGraphTimeSliceReport(run: GraphTimeSliceRun): GraphTimeSliceReport {
  return {
    schema: run.result.schema,
    window: run.result.window,
    counts: run.result.counts,
    source: run.sourcePath,
    out: run.outPath,
    written: run.written,
  };
}

/** Compact human rendering; states what was dropped and what was not verified. */
export function formatGraphTimeSlice(run: GraphTimeSliceRun): string {
  const { window, counts } = run.result;
  const since = window.since === null ? "open" : `${window.since_iso} (${window.since})`;
  const until = window.until === null ? "open" : `${window.until_iso} (${window.until})`;
  return [
    `Temporal graph slice [${since} .. ${until}]`,
    `Source: ${run.sourcePath}`,
    `Nodes: ${counts.nodes.retained}/${counts.nodes.total}`,
    `Links: ${counts.links.retained}/${counts.links.total} ` +
      `(${counts.links.dropped_missing_endpoint} in-window edges dropped for a missing endpoint)`,
    `Hyperedges: ${counts.hyperedges.retained}/${counts.hyperedges.total}`,
    "Untimed elements are excluded; edges are endpoint-induced; the window is stamped on graph.window.",
    run.written
      ? `Wrote ${run.outPath} (no citations sidecar is co-emitted for a slice)`
      : "Dry run: pass --out <path> to write the sliced graph.json",
  ].join("\n");
}

/** CLI runner kept separate from Commander registration for focused tests. */
export function runGraphTimeSlice(
  options: GraphTimeSliceOptions,
  deps: GraphTimeSliceDeps = {},
): GraphTimeSliceRun {
  if (options.since === undefined && options.until === undefined) {
    throw new Error("a temporal slice requires at least one of --since/--until");
  }
  const bounds: GraphTimeSliceBounds = {
    sinceMs: options.since === undefined ? null : parseRecallTimestamp(options.since),
    untilMs: options.until === undefined ? null : parseRecallTimestamp(options.until),
  };

  const projectConfig = loadConfig(options.config);
  const sourcePath = options.graph
    ? resolve(options.graph)
    : projectConfig
      ? join(projectConfig.outputs.state_dir, "graph.json")
      : resolveGraphInputPath();
  if (!existsSync(sourcePath) && !deps.readGraph) {
    throw new Error(`graph file not found: ${sourcePath}`);
  }

  const result = sliceGraphByTime(readGraphDocument(sourcePath, deps), bounds);

  const outPath = options.out ? resolve(options.out) : null;
  let written = false;
  if (outPath) {
    if (outPath === sourcePath) {
      throw new Error("refusing to overwrite the source graph; choose a different --out");
    }
    if (existsSync(outPath) && !options.force) {
      throw new Error(`output already exists: ${outPath} (pass --force to overwrite)`);
    }
    const serialized = JSON.stringify(result.graph, null, 2);
    assertGraphJsonSize(Buffer.byteLength(serialized, "utf-8"), "write", outPath);
    if (deps.writeGraph) deps.writeGraph(outPath, serialized);
    else writeFileSync(outPath, serialized, "utf-8");
    written = true;
  }

  const run: GraphTimeSliceRun = { result, sourcePath, outPath, written };
  const log = deps.log ?? ((line: string) => console.log(line));
  log(
    options.json
      ? JSON.stringify(toGraphTimeSliceReport(run), null, 2)
      : formatGraphTimeSlice(run),
  );
  return run;
}
