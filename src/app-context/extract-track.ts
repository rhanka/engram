/**
 * Lot L3 — Read-only Track CLI projection, single `track` wrapper & projection citations.
 *
 * Contract: SPEC_EVOL_APP_CONTEXT_GRAPH.r4.md §4.3, §7 « Lot L3 ».
 * Standalone library; CLI/assembler wiring lands in Lot L5.
 *
 * Track is read ONLY through its CLI (`track --version`,
 * `track query --format json`, `track decision ls --format json`) with
 * `stdio: ["ignore", "pipe", "pipe"]` and a 15s timeout. This module never
 * opens `.track/events.jsonl` (read-only `existsSync` presence check only)
 * and never writes anywhere under `.track/`.
 *
 * No base engram extractor covers Track (`extractMarkdown`, `extractSql`,
 * `extractSvelte`, `extractJs`, `extractMcpConfig`, `extractGit` run
 * unchanged and are never duplicated here). Reuse is limited to the Lot L1
 * contracts: `appContextNodeId` structural tuple IDs (`src/app-context/node-id.ts`),
 * `TrackCliItem` / `TrackCliDecision` / `TrackProjectionCitation`
 * (`src/app-context/types.ts`), and the untouched `serializeGraph` /
 * `loadGraphFromData` round-trip (`src/graph.ts`, exercised in tests).
 *
 * Every emitted relation (`in_workpackage`, `tracks`, `decides`) and every
 * `derivation_methods` value is declared in
 * `profiles/app-context/v1/profile.yaml`.
 *
 * Supported subset (binding rule 2; each row has a test case in
 * `tests/app-context-track.test.ts`):
 *
 * | # | Input | Result |
 * |---|-------|--------|
 * | 1 | CLI `track --version`, `track query --format json`, `track decision ls --format json` (`stdio: ["ignore","pipe","pipe"]`, 15 s timeout, zero write flags) | three read-only calls, parsed arrays, never a write |
 * | 2 | `track:` / `decisions:` declared with kind `frontmatter` | `spec_frontmatter_track` / `spec_frontmatter_decisions` edges |
 * | 3 | `track:` / `decisions:` declared with kind `section-marker` | `spec_section_marker_track` / `spec_section_marker_decisions` edges |
 * | 4 | `track:` / `decisions:` declared with kind `spec-map` | `spec_map_track` / `spec_map_decisions` edges |
 * | 5 | complete `.md` token in `detail.summary` matching a declared `Spec.file` | `TrackItem --tracks--> Spec` (`track_item_summary_spec_path`, pointer `/i/detail/summary`) |
 * | 6 | complete `.md` token in `contextExcerpt` matching a declared `Spec.file` | `TrackDecision --decides--> Spec` (`track_decision_excerpt_spec_path`, pointer `/i/contextExcerpt`) |
 * | 7 | `.md` token touching anything but the explicit separators below (affix, `~`/`+`/unicode affix, `@`, `%`, `\`, symbol, `/`-leading, or `…` tail) | rejected fragment: no edge, `unsupported-construct` diagnostic with projection file/line (binding rule 2) |
 * | 8 | complete `.md` token matching no declared spec file | no edge, `target-unresolved` diagnostic (`diag:<32-hex>`) with projection file/line (§4.1) |
 * | 9 | declared ULID matching zero projected records | `track-id-unresolved` (`diag:<32-hex>`) and zero edges |
 * | 10 | declared `track:` ULID matching both a `TrackItem` and a `TrackWorkpackage` | `target-ambiguous` (`diag:<32-hex>`, candidate projection locations kept) and zero edges; the L5 aggregator owns the union, L3 never dedups (§3.2) |
 * | 11 | `writeTrackProjections`: non-40-hex commit, or a final target / physical parent resolving inside `.track/` (final symlinks incl. dangling refused, `O_NOFOLLOW` writes) | throws before the first mutation; both files land outside `.track/` or neither is touched |
 *
 * Explicit separators for rows 5–6 (review R3 B1; each has a positive
 * control in `tests/app-context-track.test.ts`): whitespace (space, tab,
 * LF, CR) and `: ; , ! ? " ' ` ( ) [ ] { } < > « » ‘ ’ “ ” – — * # |`.
 * Only these — or a text edge — may touch a complete reference.
 *
 * Nothing is inferred and nothing outside this table is supported.
 */
import { O_CREAT, O_NOFOLLOW, O_TRUNC, O_WRONLY } from "node:constants";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { appContextNodeId } from "./node-id.js";
import type {
  AppContextDiagnostic,
  TrackCliDecision,
  TrackCliItem,
  TrackProjectionCitation,
} from "./types.js";

/** Exact read-only Track invocations (§4.3). Zero write flags by construction. */
export const TRACK_VERSION_ARGS: readonly string[] = ["--version"];
export const TRACK_QUERY_ARGS: readonly string[] = ["query", "--format", "json"];
export const TRACK_DECISIONS_ARGS: readonly string[] = ["decision", "ls", "--format", "json"];

/** Subprocess ceiling for every Track invocation (§4.3). */
export const TRACK_TIMEOUT_MS = 15_000;

/** Projection paths relative to `<stateRoot>/commits/<commit>/` (§4.3). */
export const TRACK_QUERY_REL = "track-projections/track-query.json";
export const TRACK_DECISIONS_REL = "track-projections/track-decisions.json";

export type TrackCommandResult = { stdout: string };

/**
 * Subprocess adapter. The default implementation shells out to `track`;
 * tests inject a fixture runner. Every call carries `{ cwd, timeoutMs }`.
 */
export type TrackCommandRunner = (
  args: readonly string[],
  opts: { cwd: string; timeoutMs: number },
) => Promise<TrackCommandResult>;

export type TrackNodeType = "TrackItem" | "TrackDecision" | "TrackWorkpackage";
export type TrackRelation = "in_workpackage" | "tracks" | "decides";

/** Single `track` wrapper: computed id, `node_type`, CLI record nested under `track` (§4.3). */
export interface TrackGraphNode {
  id: string;
  node_type: TrackNodeType;
  track: TrackCliItem | TrackCliDecision | { wpId: string; wpLabel: string };
  source_file: typeof TRACK_QUERY_REL | typeof TRACK_DECISIONS_REL;
  citations: TrackProjectionCitation[];
}

/** Lossless app-context relation record carried on Track edges (§3.2). */
export interface TrackGraphEdge {
  source: string;
  target: string;
  relation: TrackRelation;
  confidence: "EXTRACTED";
  derivation_methods: string[];
  evidence_refs: string[];
  source_file: typeof TRACK_QUERY_REL | typeof TRACK_DECISIONS_REL;
  citations: TrackProjectionCitation[];
}

function defaultTrackRunner(): TrackCommandRunner {
  return async (args, opts) => {
    const stdout = execFileSync("track", [...args], {
      cwd: opts.cwd,
      timeout: opts.timeoutMs,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return { stdout: String(stdout) };
  };
}

export interface TrackCollection {
  cliVersion: string;
  items: TrackCliItem[];
  decisions: TrackCliDecision[];
  queryText: string;
  decisionsText: string;
  skippedMissingTrackDir: boolean;
}

function parseCliArray(stdout: string, command: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`track ${command} returned non-JSON output: ${(error as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`track ${command} must return a JSON array`);
  }
  return parsed;
}

function assertRecordShape(
  record: unknown,
  command: string,
  index: number,
): asserts record is Record<string, unknown> {
  if (
    typeof record !== "object" ||
    record === null ||
    typeof (record as { id?: unknown }).id !== "string"
  ) {
    throw new Error(`track ${command} record at index ${index} must be an object with a string id`);
  }
}

/**
 * Run the three read-only CLI commands and parse the projections.
 * A missing `.track/` directory is graceful: zero subprocess calls and empty
 * projections. Malformed JSON throws instead of inventing records.
 */
export async function collectTrackProjections(opts: {
  repoDir: string;
  runner?: TrackCommandRunner;
}): Promise<TrackCollection> {
  const runner = opts.runner ?? defaultTrackRunner();
  if (!existsSync(join(opts.repoDir, ".track"))) {
    return {
      cliVersion: "",
      items: [],
      decisions: [],
      queryText: formatTrackProjection([]),
      decisionsText: formatTrackProjection([]),
      skippedMissingTrackDir: true,
    };
  }
  const runOpts = { cwd: opts.repoDir, timeoutMs: TRACK_TIMEOUT_MS };
  const version = await runner(TRACK_VERSION_ARGS, runOpts);
  const query = await runner(TRACK_QUERY_ARGS, runOpts);
  const decisionsOut = await runner(TRACK_DECISIONS_ARGS, runOpts);
  const itemsRaw = parseCliArray(query.stdout, "query --format json");
  const decisionsRaw = parseCliArray(decisionsOut.stdout, "decision ls --format json");
  itemsRaw.forEach((record, index) => assertRecordShape(record, "query --format json", index));
  decisionsRaw.forEach((record, index) =>
    assertRecordShape(record, "decision ls --format json", index),
  );
  return {
    cliVersion: version.stdout.trim(),
    items: itemsRaw as TrackCliItem[],
    decisions: decisionsRaw as TrackCliDecision[],
    queryText: formatTrackProjection(itemsRaw),
    decisionsText: formatTrackProjection(decisionsRaw),
    skippedMissingTrackDir: false,
  };
}

/** Deterministic persisted projection format: 2-space JSON plus trailing newline (§4.3). */
export function formatTrackProjection(records: readonly unknown[]): string {
  return `${JSON.stringify(records, null, 2)}\n`;
}

/** 1-based line span of one pretty-printed JSON array element. */
export interface TrackElementSpan {
  line_start: number;
  line_end: number;
}

/**
 * Recover element line spans from stored projection text (§4.3 citations).
 * String-aware scan: brackets inside JSON strings never affect depth.
 */
export function indexPrettyArrayElements(prettyText: string): TrackElementSpan[] {
  const spans: TrackElementSpan[] = [];
  const lines = prettyText.split("\n");
  let started = false;
  let closed = false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let inElement = false;
  let elementStart = 1;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci]!;
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        if (started && depth === 1 && !inElement && !closed) {
          inElement = true;
          elementStart = li + 1;
        }
        inString = true;
        continue;
      }
      if (ch === "{" || ch === "[") {
        if (!started) {
          if (ch !== "[") {
            throw new Error("track projection text must be a JSON array");
          }
          started = true;
          depth = 1;
          continue;
        }
        if (closed) {
          throw new Error("track projection text has content after the JSON array");
        }
        if (depth === 1 && !inElement) {
          inElement = true;
          elementStart = li + 1;
        }
        depth++;
        continue;
      }
      if (ch === "}" || ch === "]") {
        depth--;
        if (depth < 0) {
          throw new Error("track projection text has unbalanced brackets");
        }
        if (depth <= 1 && inElement) {
          spans.push({ line_start: elementStart, line_end: li + 1 });
          inElement = false;
        }
        if (depth === 0) {
          closed = true;
        }
        continue;
      }
      if (closed) {
        if (ch.trim() !== "" && ch !== ",") {
          throw new Error("track projection text has content after the JSON array");
        }
        continue;
      }
      if (!started) {
        if (ch.trim() !== "") {
          throw new Error("track projection text must be a JSON array");
        }
        continue;
      }
      if (depth === 1 && !inElement && ch !== "," && ch.trim() !== "") {
        inElement = true;
        elementStart = li + 1;
        continue;
      }
      if (depth === 1 && inElement && ch === ",") {
        spans.push({ line_start: elementStart, line_end: li + 1 });
        inElement = false;
      }
    }
  }
  if (!started || depth !== 0) {
    throw new Error("track projection text is not a complete JSON array");
  }
  return spans;
}

/** RFC 6901 segment escaping for constructed JSON Pointers. */
export function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

interface CitationParts {
  source_file: TrackGraphNode["source_file"];
  command: TrackProjectionCitation["command"];
  cliVersion: string;
  commit: string;
  span: TrackElementSpan;
  pointer: string;
}

function trackCitation(parts: CitationParts): TrackProjectionCitation {
  return {
    citation_kind: "track_cli_projection",
    source_file: parts.source_file,
    line_start: parts.span.line_start,
    line_end: parts.span.line_end,
    json_pointer: parts.pointer,
    command: parts.command,
    cli_version: parts.cliVersion,
    commit: parts.commit,
  };
}

export interface TrackBuildOutput {
  nodes: TrackGraphNode[];
  itemNodes: TrackGraphNode[];
  decisionNodes: TrackGraphNode[];
  workpackageNodes: TrackGraphNode[];
  itemIdToNodeId: Map<string, string>;
  decisionIdToNodeId: Map<string, string>;
  wpIdToNodeId: Map<string, string>;
  queryText: string;
  decisionsText: string;
}

/**
 * Build the single-`track`-wrapper nodes with projection citations.
 * One `TrackWorkpackage` node per distinct `wpId`; `wpLabel` falls back to
 * `wpId` when absent.
 */
export function buildTrackNodes(opts: {
  repoKey: string;
  commit: string;
  cliVersion: string;
  items: TrackCliItem[];
  decisions: TrackCliDecision[];
}): TrackBuildOutput {
  const queryText = formatTrackProjection(opts.items);
  const decisionsText = formatTrackProjection(opts.decisions);
  const querySpans = indexPrettyArrayElements(queryText);
  const decisionSpans = indexPrettyArrayElements(decisionsText);

  const itemNodes: TrackGraphNode[] = [];
  const itemIdToNodeId = new Map<string, string>();
  opts.items.forEach((item, index) => {
    const span = querySpans[index];
    if (!span) {
      throw new Error(`track projection has no element at index ${index}`);
    }
    const id = appContextNodeId(opts.repoKey, "TrackItem", [item.id]);
    itemIdToNodeId.set(item.id, id);
    itemNodes.push({
      id,
      node_type: "TrackItem",
      track: item,
      source_file: TRACK_QUERY_REL,
      citations: [
        trackCitation({
          source_file: TRACK_QUERY_REL,
          command: "track query --format json",
          cliVersion: opts.cliVersion,
          commit: opts.commit,
          span,
          pointer: `/${index}`,
        }),
      ],
    });
  });

  const decisionNodes: TrackGraphNode[] = [];
  const decisionIdToNodeId = new Map<string, string>();
  opts.decisions.forEach((decision, index) => {
    const span = decisionSpans[index];
    if (!span) {
      throw new Error(`track decisions projection has no element at index ${index}`);
    }
    const id = appContextNodeId(opts.repoKey, "TrackDecision", [decision.id]);
    decisionIdToNodeId.set(decision.id, id);
    decisionNodes.push({
      id,
      node_type: "TrackDecision",
      track: decision,
      source_file: TRACK_DECISIONS_REL,
      citations: [
        trackCitation({
          source_file: TRACK_DECISIONS_REL,
          command: "track decision ls --format json",
          cliVersion: opts.cliVersion,
          commit: opts.commit,
          span,
          pointer: `/${index}`,
        }),
      ],
    });
  });

  const workpackageNodes: TrackGraphNode[] = [];
  const wpIdToNodeId = new Map<string, string>();
  opts.items.forEach((item, index) => {
    if (!item.wpId || wpIdToNodeId.has(item.wpId)) {
      return;
    }
    const span = querySpans[index];
    if (!span) {
      throw new Error(`track projection has no element at index ${index}`);
    }
    const id = appContextNodeId(opts.repoKey, "TrackWorkpackage", [item.wpId]);
    wpIdToNodeId.set(item.wpId, id);
    workpackageNodes.push({
      id,
      node_type: "TrackWorkpackage",
      track: { wpId: item.wpId, wpLabel: item.wpLabel ?? item.wpId },
      source_file: TRACK_QUERY_REL,
      citations: [
        trackCitation({
          source_file: TRACK_QUERY_REL,
          command: "track query --format json",
          cliVersion: opts.cliVersion,
          commit: opts.commit,
          span,
          pointer: `/${index}/${escapeJsonPointerSegment("wpId")}`,
        }),
      ],
    });
  });

  return {
    nodes: [...itemNodes, ...decisionNodes, ...workpackageNodes],
    itemNodes,
    decisionNodes,
    workpackageNodes,
    itemIdToNodeId,
    decisionIdToNodeId,
    wpIdToNodeId,
    queryText,
    decisionsText,
  };
}

export interface TrackLinkContext {
  repoKey: string;
  commit: string;
  cliVersion: string;
  items: TrackCliItem[];
  decisions: TrackCliDecision[];
  itemIdToNodeId: Map<string, string>;
  decisionIdToNodeId: Map<string, string>;
  wpIdToNodeId: Map<string, string>;
  queryText: string;
  decisionsText: string;
}

/** `TrackItem --in_workpackage--> TrackWorkpackage` (`track_query_wp_id`). */
export function linkTrackInWorkpackages(ctx: TrackLinkContext): { edges: TrackGraphEdge[] } {
  const querySpans = indexPrettyArrayElements(ctx.queryText);
  const edges: TrackGraphEdge[] = [];
  ctx.items.forEach((item, index) => {
    if (!item.wpId) {
      return;
    }
    const source = ctx.itemIdToNodeId.get(item.id);
    const target = ctx.wpIdToNodeId.get(item.wpId);
    const span = querySpans[index];
    if (!source || !target || !span) {
      return;
    }
    edges.push({
      source,
      target,
      relation: "in_workpackage",
      confidence: "EXTRACTED",
      derivation_methods: ["track_query_wp_id"],
      evidence_refs: [],
      source_file: TRACK_QUERY_REL,
      citations: [
        trackCitation({
          source_file: TRACK_QUERY_REL,
          command: "track query --format json",
          cliVersion: ctx.cliVersion,
          commit: ctx.commit,
          span,
          pointer: `/${index}/${escapeJsonPointerSegment("wpId")}`,
        }),
      ],
    });
  });
  return { edges };
}

export type TrackDeclarationKind = "frontmatter" | "section-marker" | "spec-map";

export interface TrackDeclarationTarget {
  targetId: string;
  kind: TrackDeclarationKind;
  track?: string[];
  decisions?: string[];
}

const TRACKS_DERIVATION: Record<TrackDeclarationKind, string> = {
  frontmatter: "spec_frontmatter_track",
  "section-marker": "spec_section_marker_track",
  "spec-map": "spec_map_track",
};

const DECIDES_DERIVATION: Record<TrackDeclarationKind, string> = {
  frontmatter: "spec_frontmatter_decisions",
  "section-marker": "spec_section_marker_decisions",
  "spec-map": "spec_map_decisions",
};

/**
 * Resolve explicit ULID declarations (`track:` / `decisions:` on a
 * Spec/SpecSection/Requirement or the spec map) against the projections.
 * A ULID matching an item or workpackage yields
 * `TrackItem | TrackWorkpackage --tracks--> target`; a ULID matching a
 * decision yields `TrackDecision --decides--> target`. Unknown ULIDs yield a
 * `track-id-unresolved` diagnostic and zero edges — never an inferred link.
 */
export function linkExplicitTrackDeclarations(
  ctx: TrackLinkContext & { declarations: TrackDeclarationTarget[] },
): { edges: TrackGraphEdge[]; diagnostics: AppContextDiagnostic[] } {
  const querySpans = indexPrettyArrayElements(ctx.queryText);
  const decisionSpans = indexPrettyArrayElements(ctx.decisionsText);
  const itemIndex = new Map(ctx.items.map((item, index) => [item.id, index]));
  const decisionIndex = new Map(ctx.decisions.map((decision, index) => [decision.id, index]));
  const wpFirstItemIndex = new Map<string, number>();
  ctx.items.forEach((item, index) => {
    if (item.wpId && !wpFirstItemIndex.has(item.wpId)) {
      wpFirstItemIndex.set(item.wpId, index);
    }
  });

  // No dedup here: every emission is returned to the L5 aggregator, which
  // owns the deterministic union of derivation_methods and citations (§3.2).
  const edges: TrackGraphEdge[] = [];
  const diagnostics: AppContextDiagnostic[] = [];

  const pushEdge = (edge: TrackGraphEdge): void => {
    edges.push(edge);
  };

  const unresolved = (ulid: string, targetId: string, field: "track" | "decisions"): void => {
    diagnostics.push({
      id: appContextNodeId(ctx.repoKey, "Diagnostic", ["track-id-unresolved", ulid]),
      code: "track-id-unresolved",
      message: `track ${field} id "${ulid}" declared on ${targetId} matches no TrackItem, TrackWorkpackage, or TrackDecision`,
    });
  };

  for (const declaration of ctx.declarations) {
    for (const ulid of declaration.track ?? []) {
      // Gather TrackItem and TrackWorkpackage candidates before choosing a
      // source: zero gives track-id-unresolved, one gives the link, several
      // give target-ambiguous and no link (binding rule 3).
      const itemIdx = itemIndex.get(ulid);
      const itemNode = itemIdx !== undefined ? ctx.itemIdToNodeId.get(ulid) : undefined;
      const wpIdx = wpFirstItemIndex.get(ulid);
      const wpNode = ctx.wpIdToNodeId.get(ulid);
      const candidates: Array<{
        source: string;
        span: TrackElementSpan;
        pointer: string;
        label: string;
      }> = [];
      const itemSpan = itemIdx !== undefined ? querySpans[itemIdx] : undefined;
      if (itemIdx !== undefined && itemNode && itemSpan) {
        candidates.push({
          source: itemNode,
          span: itemSpan,
          pointer: `/${itemIdx}`,
          label: `TrackItem ${ulid}`,
        });
      }
      const wpSpan = wpIdx !== undefined ? querySpans[wpIdx] : undefined;
      if (wpIdx !== undefined && wpNode && wpSpan) {
        candidates.push({
          source: wpNode,
          span: wpSpan,
          pointer: `/${wpIdx}/${escapeJsonPointerSegment("wpId")}`,
          label: `TrackWorkpackage ${ulid}`,
        });
      }
      if (candidates.length === 0) {
        unresolved(ulid, declaration.targetId, "track");
        continue;
      }
      if (candidates.length > 1) {
        diagnostics.push({
          id: appContextNodeId(ctx.repoKey, "Diagnostic", ["target-ambiguous", ulid]),
          code: "target-ambiguous",
          message: `track id "${ulid}" declared on ${declaration.targetId} matches several sources: ${candidates.map((c) => c.label).join(", ")}`,
          candidates: candidates.map((c) => ({
            file: TRACK_QUERY_REL,
            startLine: c.span.line_start,
            endLine: c.span.line_end,
            label: c.label,
          })),
        });
        continue;
      }
      const only = candidates[0]!;
      pushEdge({
        source: only.source,
        target: declaration.targetId,
        relation: "tracks",
        confidence: "EXTRACTED",
        derivation_methods: [TRACKS_DERIVATION[declaration.kind]],
        evidence_refs: [],
        source_file: TRACK_QUERY_REL,
        citations: [
          trackCitation({
            source_file: TRACK_QUERY_REL,
            command: "track query --format json",
            cliVersion: ctx.cliVersion,
            commit: ctx.commit,
            span: only.span,
            pointer: only.pointer,
          }),
        ],
      });
    }
    for (const ulid of declaration.decisions ?? []) {
      const decIdx = decisionIndex.get(ulid);
      const decNode = decIdx !== undefined ? ctx.decisionIdToNodeId.get(ulid) : undefined;
      if (decIdx === undefined || !decNode) {
        unresolved(ulid, declaration.targetId, "decisions");
        continue;
      }
      const span = decisionSpans[decIdx];
      if (!span) {
        continue;
      }
      pushEdge({
        source: decNode,
        target: declaration.targetId,
        relation: "decides",
        confidence: "EXTRACTED",
        derivation_methods: [DECIDES_DERIVATION[declaration.kind]],
        evidence_refs: [],
        source_file: TRACK_DECISIONS_REL,
        citations: [
          trackCitation({
            source_file: TRACK_DECISIONS_REL,
            command: "track decision ls --format json",
            cliVersion: ctx.cliVersion,
            commit: ctx.commit,
            span,
            pointer: `/${decIdx}`,
          }),
        ],
      });
    }
  }
  return { edges, diagnostics };
}

const SPEC_PATH_PATTERN = /[A-Za-z0-9_./-]+\.md/g;
const ASCII_SPEC_PATH_PATTERN = /^[A-Za-z0-9_./-]+\.md$/;

/**
 * Explicitly allowed separators around a complete `.md` reference
 * (binding rule 2; review R3 B1). Whitespace (space, tab, LF, CR) and
 * exactly this punctuation: `: ; , ! ? " ' ` ( ) [ ] { } < >` plus
 * `« » ‘ ’ “ ” – — * # |`. Every separator has a positive control in
 * `tests/app-context-track.test.ts` ("links a complete ref wrapped in
 * explicit separator ..."). Any other adjacent character (`@`, `%`, `\`,
 * symbols, `~`, `+`, Unicode letters/marks, astral characters) belongs to
 * the token and rejects the whole token as a fragment — an unknown
 * character is never a separator. Token boundaries are examined by code
 * point, so astral characters and combining marks are never split.
 */
const EXPLICIT_SEPARATOR_CHARS =
  " \t\n\r:;,!?\"'`()[]{}<>«»‘’“”–—*#|";

function isExplicitSeparator(cp: number): boolean {
  return (
    cp < 0x10000 &&
    EXPLICIT_SEPARATOR_CHARS.includes(String.fromCodePoint(cp))
  );
}

function codePointBefore(text: string, index: number): number | undefined {
  if (index <= 0) {
    return undefined;
  }
  const low = text.charCodeAt(index - 1);
  if (low >= 0xdc00 && low <= 0xdfff && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) {
      return (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
    }
  }
  return low;
}

interface SpecPathScan {
  intact: string[];
  fragments: string[];
}

/**
 * Complete explicit repo-relative `.md` references in free text (§4.3,
 * binding rule 5). The regex finds a `.md` candidate; the complete token is
 * then delimited by the explicit separators (or text edges), expanding over
 * file-name and unknown characters alike by code point. The token links
 * only when it matches the ASCII path subset fully (`/docs/...` excluded:
 * an absolute path is not a repo-relative reference). Any other token —
 * affixed (`.mdx`, `.md.backup`, `.md/more`, `~`/`+`/unicode affix),
 * unknown-adjacent (`@`, `%`, `\`, symbol), or `…`-truncated tail — is a
 * fragment of a larger invalid token. Scanning resumes after the rejected
 * token, never inside it. Fragments never link; they diagnose per
 * binding rule 2.
 */
function scanSpecPathTokens(text: string): SpecPathScan {
  SPEC_PATH_PATTERN.lastIndex = 0;
  const intact: string[] = [];
  const fragments: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = SPEC_PATH_PATTERN.exec(text)) !== null) {
    const end = match.index + match[0].length;
    let left = match.index;
    while (left > 0) {
      const before = codePointBefore(text, left);
      if (before === undefined || isExplicitSeparator(before)) {
        break;
      }
      left -= before > 0xffff ? 2 : 1;
    }
    let right = end;
    while (right < text.length) {
      const after = text.codePointAt(right);
      if (after === undefined || isExplicitSeparator(after)) {
        break;
      }
      right += after > 0xffff ? 2 : 1;
    }
    SPEC_PATH_PATTERN.lastIndex = right;
    const token = text.slice(left, right);
    if (ASCII_SPEC_PATH_PATTERN.test(token) && !token.startsWith("/")) {
      intact.push(token);
    } else {
      fragments.push(token);
    }
  }
  return { intact, fragments };
}

/**
 * `TrackItem --tracks--> Spec` from intact `.md` paths in
 * `detail.summary` (`track_item_summary_spec_path`) and
 * `TrackDecision --decides--> Spec` from intact `.md` paths in
 * `contextExcerpt` (`track_decision_excerpt_spec_path`). A complete explicit
 * path with zero declared candidates yields a `target-unresolved`
 * diagnostic (§4.1) and no edge; a fragment of a larger token yields an
 * `unsupported-construct` diagnostic (binding rule 2) and no edge.
 */
export function linkSpecPathMentions(
  ctx: TrackLinkContext & {
    specFileToNodeId: Map<string, string> | Record<string, string>;
  },
): { edges: TrackGraphEdge[]; diagnostics: AppContextDiagnostic[] } {
  const specFileToNodeId =
    ctx.specFileToNodeId instanceof Map
      ? ctx.specFileToNodeId
      : new Map(Object.entries(ctx.specFileToNodeId));
  const querySpans = indexPrettyArrayElements(ctx.queryText);
  const decisionSpans = indexPrettyArrayElements(ctx.decisionsText);
  const edges: TrackGraphEdge[] = [];
  const diagnostics: AppContextDiagnostic[] = [];
  const seen = new Set<string>();
  const seenDiags = new Set<string>();
  const pushEdge = (edge: TrackGraphEdge): void => {
    const key = `${edge.source}\u0000${edge.target}\u0000${edge.relation}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    edges.push(edge);
  };
  const pushDiagnostic = (diagnostic: AppContextDiagnostic): void => {
    const key = `${diagnostic.code} ${diagnostic.file} ${diagnostic.message}`;
    if (seenDiags.has(key)) {
      return;
    }
    seenDiags.add(key);
    diagnostics.push(diagnostic);
  };

  ctx.items.forEach((item, index) => {
    const summary = item.detail?.summary;
    if (!summary) {
      return;
    }
    const source = ctx.itemIdToNodeId.get(item.id);
    const span = querySpans[index];
    if (!source || !span) {
      return;
    }
    const scan = scanSpecPathTokens(summary);
    for (const specPath of new Set(scan.intact)) {
      const target = specFileToNodeId.get(specPath);
      if (!target) {
        pushDiagnostic({
          id: appContextNodeId(ctx.repoKey, "Diagnostic", [
            "target-unresolved",
            specPath,
          ]),
          code: "target-unresolved",
          message: `spec path "${specPath}" in TrackItem ${item.id} matches no declared spec`,
          file: TRACK_QUERY_REL,
          line: span.line_start,
        });
        continue;
      }
      pushEdge({
        source,
        target,
        relation: "tracks",
        confidence: "EXTRACTED",
        derivation_methods: ["track_item_summary_spec_path"],
        evidence_refs: [],
        source_file: TRACK_QUERY_REL,
        citations: [
          trackCitation({
            source_file: TRACK_QUERY_REL,
            command: "track query --format json",
            cliVersion: ctx.cliVersion,
            commit: ctx.commit,
            span,
            pointer: `/${index}/${escapeJsonPointerSegment("detail")}/${escapeJsonPointerSegment("summary")}`,
          }),
        ],
      });
    }
    for (const fragment of new Set(scan.fragments)) {
      pushDiagnostic({
        id: appContextNodeId(ctx.repoKey, "Diagnostic", [
          "unsupported-construct",
          fragment,
        ]),
        code: "unsupported-construct",
        message: `path fragment "${fragment}" in TrackItem ${item.id} is not a complete explicit spec path`,
        file: TRACK_QUERY_REL,
        line: span.line_start,
      });
    }
  });

  ctx.decisions.forEach((decision, index) => {
    const excerpt = decision.contextExcerpt;
    if (!excerpt) {
      return;
    }
    const source = ctx.decisionIdToNodeId.get(decision.id);
    const span = decisionSpans[index];
    if (!source || !span) {
      return;
    }
    const excerptScan = scanSpecPathTokens(excerpt);
    for (const specPath of new Set(excerptScan.intact)) {
      const target = specFileToNodeId.get(specPath);
      if (!target) {
        pushDiagnostic({
          id: appContextNodeId(ctx.repoKey, "Diagnostic", [
            "target-unresolved",
            specPath,
          ]),
          code: "target-unresolved",
          message: `spec path "${specPath}" in TrackDecision ${decision.id} matches no declared spec`,
          file: TRACK_DECISIONS_REL,
          line: span.line_start,
        });
        continue;
      }
      pushEdge({
        source,
        target,
        relation: "decides",
        confidence: "EXTRACTED",
        derivation_methods: ["track_decision_excerpt_spec_path"],
        evidence_refs: [],
        source_file: TRACK_DECISIONS_REL,
        citations: [
          trackCitation({
            source_file: TRACK_DECISIONS_REL,
            command: "track decision ls --format json",
            cliVersion: ctx.cliVersion,
            commit: ctx.commit,
            span,
            pointer: `/${index}/${escapeJsonPointerSegment("contextExcerpt")}`,
          }),
        ],
      });
    }
    for (const fragment of new Set(excerptScan.fragments)) {
      pushDiagnostic({
        id: appContextNodeId(ctx.repoKey, "Diagnostic", [
          "unsupported-construct",
          fragment,
        ]),
        code: "unsupported-construct",
        message: `path fragment "${fragment}" in TrackDecision ${decision.id} is not a complete explicit spec path`,
        file: TRACK_DECISIONS_REL,
        line: span.line_start,
      });
    }
  });
  return { edges, diagnostics };
}

export interface TrackProjectionFiles {
  queryRel: string;
  decisionsRel: string;
  queryAbs: string;
  decisionsAbs: string;
}

/** Only 40-hex checkout commits persist: anything else could escape the commit directory. */
const COMMIT_HEX_RE = /^[0-9a-f]{40}$/;

function pathTouchesTrackDir(resolvedPath: string): boolean {
  return resolvedPath.split(sep).includes(".track");
}

/**
 * Physical location of `dir`, following symlinks through the nearest existing
 * ancestor. Never throws: falls back to the logically resolved path when
 * nothing on the chain exists yet.
 */
async function physicalDirForWrite(dir: string): Promise<string> {
  const logical = resolve(dir);
  let probe = logical;
  while (true) {
    try {
      const real = await realpath(probe);
      return join(real, relative(probe, logical));
    } catch {
      const parent = dirname(probe);
      if (parent === probe) {
        return logical;
      }
      probe = parent;
    }
  }
}

/**
 * Refuse a final projection target whose own location or physical ancestors
 * reach `.track/`. `lstat` (which never follows the final component) refuses
 * final symlinks including dangling ones; `realpath` on the existing target
 * and on the nearest existing ancestors refuses resolved locations.
 */
async function assertFinalTargetOutsideTrack(absPath: string): Promise<void> {
  let stat: Awaited<ReturnType<typeof lstat>> | undefined;
  try {
    stat = await lstat(absPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw error;
    }
  }
  if (stat?.isSymbolicLink()) {
    throw new Error(
      `refusing to persist track projections through a symlink: ${absPath}`,
    );
  }
  if (pathTouchesTrackDir(absPath)) {
    throw new Error(`refusing to persist track projections inside .track: ${absPath}`);
  }
  let realTarget: string | undefined;
  try {
    realTarget = await realpath(absPath);
  } catch {
    realTarget = undefined;
  }
  if (realTarget !== undefined && pathTouchesTrackDir(realTarget)) {
    throw new Error(
      `refusing to persist track projections inside .track (resolved): ${realTarget}`,
    );
  }
  const physicalParent = await physicalDirForWrite(dirname(absPath));
  if (pathTouchesTrackDir(physicalParent)) {
    throw new Error(
      `refusing to persist track projections inside .track (resolved): ${physicalParent}`,
    );
  }
}

/**
 * Write bytes without following a final symlink (`O_NOFOLLOW`): a link
 * swapped in between the prevalidation and the write fails here instead of
 * redirecting bytes into `.track/`.
 */
async function writeFileNoFollow(absPath: string, text: string): Promise<void> {
  const handle = await open(
    absPath,
    O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW,
    0o644,
  );
  try {
    await handle.writeFile(text, { encoding: "utf8" });
  } finally {
    await handle.close();
  }
}

/**
 * Persist canonical projections under
 * `<stateRoot>/commits/<commit>/track-projections/` (§4.3, retention in L5).
 * Refuses any physical destination inside `.track/` — checked on the
 * resolved final targets, on every physical parent, and through symlinks —
 * before the first `mkdir` or write, and rejects non-40-hex commits. A
 * forbidden final file aborts the whole persistence: either both files are
 * written outside `.track/`, or neither is touched. This module never
 * writes under `.track/`.
 */
export async function writeTrackProjections(opts: {
  stateRootDir: string;
  commit: string;
  queryText: string;
  decisionsText: string;
}): Promise<TrackProjectionFiles> {
  if (!COMMIT_HEX_RE.test(opts.commit)) {
    throw new Error(
      `refusing to persist track projections: commit "${opts.commit}" is not a 40-hex checkout commit`,
    );
  }
  const dir = join(resolve(opts.stateRootDir), "commits", opts.commit, "track-projections");
  if (pathTouchesTrackDir(dir)) {
    throw new Error(`refusing to persist track projections inside .track: ${dir}`);
  }
  const queryAbs = join(dir, "track-query.json");
  const decisionsAbs = join(dir, "track-decisions.json");
  await assertFinalTargetOutsideTrack(queryAbs);
  await assertFinalTargetOutsideTrack(decisionsAbs);
  const physicalDir = await physicalDirForWrite(dir);
  if (pathTouchesTrackDir(physicalDir)) {
    throw new Error(
      `refusing to persist track projections inside .track (resolved): ${physicalDir}`,
    );
  }
  await mkdir(dir, { recursive: true });
  await writeFileNoFollow(queryAbs, opts.queryText);
  await writeFileNoFollow(decisionsAbs, opts.decisionsText);
  return {
    queryRel: TRACK_QUERY_REL,
    decisionsRel: TRACK_DECISIONS_REL,
    queryAbs,
    decisionsAbs,
  };
}

export interface TrackExtraction {
  cliVersion: string;
  nodes: TrackGraphNode[];
  edges: TrackGraphEdge[];
  diagnostics: AppContextDiagnostic[];
  queryText: string;
  decisionsText: string;
}

/**
 * Full standalone pipeline: collect projections, build wrapper nodes, link
 * workpackages, resolve explicit ULID declarations and spec-path mentions.
 * File persistence (`writeTrackProjections`) stays caller-owned for L5.
 */
export async function extractTrack(opts: {
  repoDir: string;
  repoKey: string;
  commit: string;
  runner?: TrackCommandRunner;
  specFileToNodeId?: Map<string, string> | Record<string, string>;
  declarations?: TrackDeclarationTarget[];
}): Promise<TrackExtraction> {
  // The subprocess short-circuit stays inside collectTrackProjections. A
  // missing `.track/` still resolves the received declarations against the
  // (empty) projections, so explicitly declared but unresolved ids are
  // reported instead of masked (§4.3).
  const collected = await collectTrackProjections({ repoDir: opts.repoDir, runner: opts.runner });
  const built = buildTrackNodes({
    repoKey: opts.repoKey,
    commit: opts.commit,
    cliVersion: collected.cliVersion,
    items: collected.items,
    decisions: collected.decisions,
  });
  const ctx: TrackLinkContext = {
    repoKey: opts.repoKey,
    commit: opts.commit,
    cliVersion: collected.cliVersion,
    items: collected.items,
    decisions: collected.decisions,
    itemIdToNodeId: built.itemIdToNodeId,
    decisionIdToNodeId: built.decisionIdToNodeId,
    wpIdToNodeId: built.wpIdToNodeId,
    queryText: built.queryText,
    decisionsText: built.decisionsText,
  };
  const inWp = linkTrackInWorkpackages(ctx);
  const explicit = linkExplicitTrackDeclarations({
    ...ctx,
    declarations: opts.declarations ?? [],
  });
  const mentions = linkSpecPathMentions({
    ...ctx,
    specFileToNodeId: opts.specFileToNodeId ?? new Map<string, string>(),
  });
  return {
    cliVersion: collected.cliVersion,
    nodes: built.nodes,
    edges: [...inWp.edges, ...explicit.edges, ...mentions.edges],
    diagnostics: [...explicit.diagnostics, ...mentions.diagnostics],
    queryText: built.queryText,
    decisionsText: built.decisionsText,
  };
}
