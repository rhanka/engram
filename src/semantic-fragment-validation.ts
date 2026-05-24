// Semantic-fragment validator + sanitizer for untrusted JSON chunks emitted
// by LLM agents (OpenCode, Codex, and other skill-driven extractors).
//
// Ported from upstream Python `graphify.semantic_cleanup` (PR #825 /
// commit `b6127aa` on `safishamsi/graphify`). The validator enforces hard
// boundaries on payload shape so a malicious or runaway agent response
// cannot:
//
//   * exhaust memory with a multi-GB payload (25 MiB byte cap)
//   * escape the chunk directory via crafted node/edge/hyperedge IDs
//     (charset + length validation across all three)
//   * inject sentence-like rationale text as standalone graph nodes
//     (detected via file_type in {rationale, concept} OR via a
//     rationale_for edge with a sentence-like label, regardless of
//     declared file_type)
//   * inject unknown file_type values
//   * leave dangling hyperedges referencing removed nodes
//   * corrupt unrelated nodes by propagating rationale text through
//     non-rationale_for edges (only rationale_for edges propagate)
//
// The sanitizer is *destructive*: it mutates the fragment in place and
// returns the same reference for callers that prefer chaining.

import { readFileSync, statSync } from "node:fs";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/** Maximum on-disk + in-memory payload size before validation rejects the fragment. */
export const MAX_SEMANTIC_FRAGMENT_BYTES = 25 * 1024 * 1024;
/** Maximum number of top-level nodes in a single fragment. */
export const MAX_SEMANTIC_FRAGMENT_NODES = 10_000;
/** Maximum number of top-level edges in a single fragment. */
export const MAX_SEMANTIC_FRAGMENT_EDGES = 100_000;
/** Maximum number of hyperedges in a single fragment. */
export const MAX_SEMANTIC_FRAGMENT_HYPEREDGES = 10_000;
/** Maximum number of node references in a single hyperedge. */
export const MAX_SEMANTIC_HYPEREDGE_NODES = 256;
/** Maximum character length for any node/edge/hyperedge ID. */
export const MAX_SEMANTIC_ID_LENGTH = 256;

/**
 * Closed set of accepted `file_type` values. Matches upstream
 * `VALID_SEMANTIC_FILE_TYPES` (PR #825 + the "review #6" follow-up that
 * re-admitted `rationale` and `concept` so the sanitizer can clean them up
 * instead of the validator rejecting the whole chunk).
 */
export const VALID_SEMANTIC_FILE_TYPES = Object.freeze(
  new Set<string>(["code", "document", "paper", "image", "rationale", "concept"]),
);

const SEMANTIC_ID_RE = /^[A-Za-z0-9._:\-]+$/;

// Sentence-like rationale heuristic thresholds (must match upstream).
const RATIONALE_MIN_CHARS = 80;
const RATIONALE_MIN_WORDS = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Loose shape for a semantic fragment — keys are optional and tolerated. */
export interface SemanticFragment {
  nodes?: unknown[];
  edges?: unknown[];
  hyperedges?: unknown[] | null;
  input_tokens?: number;
  output_tokens?: number;
  [key: string]: unknown;
}

export interface LoadValidatedResult {
  fragment: SemanticFragment | null;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Return validation errors for an untrusted semantic-extraction fragment.
 *
 * An empty array means the fragment passed validation. The parameter type is
 * `unknown` (not `SemanticFragment`) because the validator is the first
 * line of defense against arbitrary deserialized JSON — the first check
 * rejects anything that isn't a plain object.
 */
export function validateSemanticFragment(fragment: unknown): string[] {
  if (!isPlainObject(fragment)) {
    return ["fragment must be a JSON object"];
  }

  const errors: string[] = [];
  let payloadSize = 0;
  try {
    payloadSize = Buffer.byteLength(JSON.stringify(fragment), "utf-8");
  } catch (exc) {
    return [`fragment is not JSON-serializable: ${(exc as Error).message}`];
  }
  if (payloadSize > MAX_SEMANTIC_FRAGMENT_BYTES) {
    errors.push(`payload is ${payloadSize} bytes; max is ${MAX_SEMANTIC_FRAGMENT_BYTES}`);
  }

  const rawNodes = (fragment as SemanticFragment).nodes;
  const rawEdges = (fragment as SemanticFragment).edges;
  const rawHyperedges = (fragment as SemanticFragment).hyperedges;

  let nodes: unknown[] = [];
  if (rawNodes === undefined) {
    // optional
  } else if (!Array.isArray(rawNodes)) {
    errors.push("nodes must be a list");
  } else if (rawNodes.length > MAX_SEMANTIC_FRAGMENT_NODES) {
    errors.push(`nodes has ${rawNodes.length} entries; max is ${MAX_SEMANTIC_FRAGMENT_NODES}`);
    nodes = rawNodes;
  } else {
    nodes = rawNodes;
  }

  let edges: unknown[] = [];
  if (rawEdges === undefined) {
    // optional
  } else if (!Array.isArray(rawEdges)) {
    errors.push("edges must be a list");
  } else if (rawEdges.length > MAX_SEMANTIC_FRAGMENT_EDGES) {
    errors.push(`edges has ${rawEdges.length} entries; max is ${MAX_SEMANTIC_FRAGMENT_EDGES}`);
    edges = rawEdges;
  } else {
    edges = rawEdges;
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isPlainObject(node)) {
      errors.push(`nodes[${i}] must be an object`);
      continue;
    }
    validateSemanticId(errors, `nodes[${i}].id`, (node as Record<string, unknown>).id);
    const fileType = (node as Record<string, unknown>).file_type;
    if (fileType !== null && fileType !== undefined && !VALID_SEMANTIC_FILE_TYPES.has(fileType as string)) {
      const sortedTypes = [...VALID_SEMANTIC_FILE_TYPES].sort();
      errors.push(
        `nodes[${i}].file_type ${JSON.stringify(fileType)} is not one of ${JSON.stringify(sortedTypes)}`,
      );
    }
  }

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!isPlainObject(edge)) {
      errors.push(`edges[${i}] must be an object`);
      continue;
    }
    validateSemanticId(errors, `edges[${i}].source`, (edge as Record<string, unknown>).source);
    validateSemanticId(errors, `edges[${i}].target`, (edge as Record<string, unknown>).target);
  }

  let hyperedges: unknown[] = [];
  if (rawHyperedges === undefined || rawHyperedges === null) {
    // optional / nullable
  } else if (!Array.isArray(rawHyperedges)) {
    errors.push("hyperedges must be a list");
  } else {
    hyperedges = rawHyperedges;
    if (hyperedges.length > MAX_SEMANTIC_FRAGMENT_HYPEREDGES) {
      errors.push(
        `hyperedges has ${hyperedges.length} entries; max is ${MAX_SEMANTIC_FRAGMENT_HYPEREDGES}`,
      );
    }
    for (let i = 0; i < hyperedges.length; i++) {
      const he = hyperedges[i];
      if (!isPlainObject(he)) {
        errors.push(`hyperedges[${i}] must be an object`);
        continue;
      }
      const heRec = he as Record<string, unknown>;
      validateSemanticId(errors, `hyperedges[${i}].id`, heRec.id);
      const heNodes = heRec.nodes;
      if (!Array.isArray(heNodes)) {
        errors.push(`hyperedges[${i}].nodes must be a list`);
        continue;
      }
      if (heNodes.length > MAX_SEMANTIC_HYPEREDGE_NODES) {
        errors.push(
          `hyperedges[${i}].nodes has ${heNodes.length} entries; max is ${MAX_SEMANTIC_HYPEREDGE_NODES}`,
        );
      }
      for (let j = 0; j < heNodes.length; j++) {
        validateSemanticId(errors, `hyperedges[${i}].nodes[${j}]`, heNodes[j]);
      }
    }
  }

  return errors;
}

function validateSemanticId(errors: string[], field: string, value: unknown): void {
  if (typeof value !== "string") {
    errors.push(`${field} must be a string`);
    return;
  }
  if (value.length === 0) {
    errors.push(`${field} must not be empty`);
    return;
  }
  if (value.length > MAX_SEMANTIC_ID_LENGTH) {
    errors.push(`${field} is ${value.length} chars; max is ${MAX_SEMANTIC_ID_LENGTH}`);
  }
  if (value.includes("/") || value.includes("\\") || value.includes("..")) {
    errors.push(`${field} must not contain path separators or '..'`);
  }
  if (!SEMANTIC_ID_RE.test(value)) {
    errors.push(`${field} contains unsupported characters`);
  }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load and validate a semantic chunk file, rejecting oversize payloads
 * before parsing. JSON decode errors are reported as validation errors
 * instead of being raised, so callers can skip past bad chunks without
 * a try/catch.
 */
export function loadValidatedSemanticFragment(filePath: string): LoadValidatedResult {
  let size = 0;
  try {
    size = statSync(filePath).size;
  } catch (exc) {
    return { fragment: null, errors: [`could not stat ${filePath}: ${(exc as Error).message}`] };
  }
  if (size > MAX_SEMANTIC_FRAGMENT_BYTES) {
    return {
      fragment: null,
      errors: [`payload is ${size} bytes; max is ${MAX_SEMANTIC_FRAGMENT_BYTES}`],
    };
  }
  let fragment: unknown;
  try {
    const text = readFileSync(filePath, "utf-8");
    fragment = JSON.parse(text);
  } catch (exc) {
    const message = (exc as Error).message;
    if (message.includes("ENOENT") || message.includes("EISDIR")) {
      return { fragment: null, errors: [`could not read ${filePath}: ${message}`] };
    }
    return { fragment: null, errors: [`invalid JSON: ${message}`] };
  }
  const errors = validateSemanticFragment(fragment);
  if (errors.length > 0) {
    return { fragment: null, errors };
  }
  return { fragment: fragment as SemanticFragment, errors: [] };
}

// ---------------------------------------------------------------------------
// Sanitizer
// ---------------------------------------------------------------------------

const INVALID_FILE_TYPES_FOR_SANITIZE = new Set<string>(["rationale", "concept"]);

/**
 * Clean up a semantic-extraction fragment in place. Returns the same object
 * reference for chaining.
 *
 * Operations:
 *   1. Remove nodes with `file_type: 'rationale'` or `file_type: 'concept'`
 *      (these are not graph-entity types — they were emitted by an LLM
 *      that ignored the schema).
 *   2. Detect nodes whose label reads like a sentence / rationale paragraph
 *      AND that participate in a `rationale_for` edge, then convert the
 *      label into a `rationale` attribute on the target node and drop the
 *      source node + its edges. The `rationale_for` edge signal applies
 *      regardless of the source node's `file_type` — sentence-like nodes
 *      with allowed types (`document`, `code`) are still cleaned up when
 *      they're explicitly marked as rationale.
 *   3. Strip nodes whose only distinguishing field is the label (empty id —
 *      likely LLM hallucination).
 *   4. Filter hyperedges so they cannot reference removed or unknown node
 *      IDs after the cleanup passes above. A hyperedge with fewer than two
 *      surviving members is dropped.
 *
 * Only `rationale_for` edges propagate rationale text. Other outgoing edges
 * (e.g. `references`, `conceptually_related_to`) are not used as
 * attribute-propagation paths — that would corrupt unrelated nodes by
 * attaching rationale meant for a different target.
 */
export function sanitizeSemanticFragment(fragment: SemanticFragment): SemanticFragment {
  const nodes = Array.isArray(fragment.nodes) ? (fragment.nodes as Array<Record<string, unknown>>) : [];
  const edges = Array.isArray(fragment.edges) ? (fragment.edges as Array<Record<string, unknown>>) : [];
  const hyperedgesRaw = Array.isArray(fragment.hyperedges) ? (fragment.hyperedges as unknown[]) : [];

  // ---- build lookup maps --------------------------------------------------
  const nodeById = new Map<string, Record<string, unknown>>();
  for (const n of nodes) {
    const nid = (n.id as string) ?? "";
    if (nid) nodeById.set(nid, n);
  }

  // Pre-collect node IDs that source a `rationale_for` edge — these are
  // candidates for sentence-like cleanup even when file_type is allowed.
  const rationaleForSources = new Set<string>();
  for (const e of edges) {
    if (e.relation === "rationale_for") {
      const src = (e.source as string) ?? "";
      if (src) rationaleForSources.add(src);
    }
  }

  // ---- pass 1: identify nodes to remove + rationale candidates -----------
  const rationaleCandidates: Array<Record<string, unknown>> = [];
  const removeIds = new Set<string>();
  const keepNodes: Array<Record<string, unknown>> = [];
  for (const n of nodes) {
    const nid = (n.id as string) ?? "";
    if (!nid) {
      // node without an id cannot be referenced — discard
      continue;
    }
    const ft = (n.file_type as string) ?? "";
    const label = (n.label as string) ?? "";
    if (INVALID_FILE_TYPES_FOR_SANITIZE.has(ft)) {
      // Invalid file_type ("rationale" / "concept"): if the label looks
      // like a sentence we may convert it to an attribute on its target.
      if (isSentenceLikeRationaleLabel(label)) {
        rationaleCandidates.push(n);
      }
      removeIds.add(nid);
      continue;
    }
    if (rationaleForSources.has(nid) && isSentenceLikeRationaleLabel(label)) {
      // Allowed file_type, but the node sources a `rationale_for` edge AND
      // its label is sentence-like prose. Treat it as rationale cleanup
      // material rather than a real graph entity.
      rationaleCandidates.push(n);
      removeIds.add(nid);
      continue;
    }
    keepNodes.push(n);
  }

  // ---- pass 2: convert sentence-nodes → rationale attributes -------------
  const rationaleAttrs = new Map<string, string[]>();
  for (const rn of rationaleCandidates) {
    const rnId = (rn.id as string) ?? "";
    const text = ((rn.label as string) ?? "").trim();
    for (const e of edges) {
      if (e.relation !== "rationale_for") continue;
      if (e.source !== rnId) continue;
      const targetId = e.target as string | undefined;
      if (!targetId || !nodeById.has(targetId) || removeIds.has(targetId)) continue;
      const list = rationaleAttrs.get(targetId) ?? [];
      list.push(text);
      rationaleAttrs.set(targetId, list);
    }
  }
  for (const [targetId, texts] of rationaleAttrs) {
    if (nodeById.has(targetId) && !removeIds.has(targetId)) {
      appendRationaleAttr(nodeById.get(targetId)!, texts);
    }
  }

  // ---- pass 3: strip edges referencing removed nodes ---------------------
  const keepEdges: Array<Record<string, unknown>> = [];
  for (const e of edges) {
    const src = (e.source as string) ?? "";
    const tgt = (e.target as string) ?? "";
    if (removeIds.has(src) || removeIds.has(tgt)) continue;
    keepEdges.push(e);
  }

  // ---- pass 4: filter hyperedges to surviving node IDs -------------------
  const survivingIds = new Set<string>();
  for (const n of keepNodes) {
    const nid = (n.id as string) ?? "";
    if (nid) survivingIds.add(nid);
  }
  const keepHyperedges: Array<Record<string, unknown>> = [];
  for (const he of hyperedgesRaw) {
    if (!isPlainObject(he)) continue;
    const heRec = he as Record<string, unknown>;
    const heNodes = heRec.nodes;
    if (!Array.isArray(heNodes)) continue;
    const filtered = heNodes.filter((ref) => typeof ref === "string" && survivingIds.has(ref));
    if (filtered.length < 2) {
      // A hyperedge needs at least two surviving members to be meaningful.
      continue;
    }
    if (filtered.length !== heNodes.length) {
      keepHyperedges.push({ ...heRec, nodes: filtered });
    } else {
      keepHyperedges.push(heRec);
    }
  }

  fragment.nodes = keepNodes;
  fragment.edges = keepEdges;
  fragment.hyperedges = keepHyperedges;
  return fragment;
}

function appendRationaleAttr(node: Record<string, unknown>, texts: string[]): void {
  const existing = (node.rationale as string) ?? "";
  const newText = texts.join("\n\n").trim();
  if (existing) {
    node.rationale = `${existing}\n\n${newText}`;
  } else {
    node.rationale = newText;
  }
}

function isSentenceLikeRationaleLabel(label: string): boolean {
  if (!label) return false;
  const trimmed = label.trim();
  if (trimmed.length < RATIONALE_MIN_CHARS) {
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    if (wordCount < RATIONALE_MIN_WORDS) return false;
  }
  return /[.!?:]/.test(trimmed);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
