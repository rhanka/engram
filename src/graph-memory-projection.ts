/**
 * MCP-L3 — Filtered memory projection into the graph (restored D3/D10).
 *
 * Normative basis: SPEC-memory-mcp-v3.2.md M10 (l.1354-1405), M11 (l.1407+),
 * the MCP-L3 row (l.1675) and the filtered-projection acceptance row (l.1431),
 * over spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md D3 (l.73-77), §5.8 (l.1056)
 * projection DTOs and D10 (l.1643-1649).
 *
 * D3 PURITY: this module is data-pure. It imports only the neutral
 * bounded-projection DTO builders plus graph data types. It never touches the
 * canonical journal, the canonical store, the memory engine, or any
 * projection port implementation, so no path here can commit, admit, mutate
 * or resurrect a canonical memory record. Authorization and current
 * eligibility are host decisions supplied per candidate; this module only
 * requires their literal `=== true` form (M4) and never infers them.
 *
 * Code-target join: exact identifier equality against the supplied live code
 * node ids, local to L3. Sharing of the citation-resolution convention with
 * live-git G3 (`explainLineOrigin`, M10 l.1401) is unverified: no shared
 * helper is invented here and no canonical memory is copied into `/code-git`
 * storage.
 */
import {
  exportBoundedCurrentProjectionV1,
  MEMORY_PROJECTION_RAW_BYTE_CEILING,
  type BoundedProjectionEntryV1,
  type Digest,
  type MemoryOperation,
  type OpaqueRef,
  type ProjectionOmissionReason,
  type Result,
  type ValidIntervalV1,
} from "../engram-memory/dist/index.js";
import type Graph from "graphology";
import type { Extraction } from "./types.js";

/** Relation carried by every memory→code edge assembled here. */
export const MEMORY_GRAPH_PROJECTION_RELATION_V1 = "memory_about";

/** Graph attribute pinning the projection cursor of attached memory nodes. */
export const MEMORY_PROJECTION_CURSOR_ATTR = "memory_projection_cursor";
/** Graph attribute pinning the high-water cursor the projection was built against. */
export const MEMORY_HIGH_WATER_CURSOR_ATTR = "memory_high_water_cursor";

/** Node id namespace for projected memories; never collides with code ids. */
export const MEMORY_GRAPH_NODE_PREFIX = "memory:";

export type MemoryGraphRecordState =
  | "pending" | "rejected" | "accepted_current" | "accepted_disputed"
  | "withdrawn" | "historical" | "expired" | "trust_invalid" | "tombstoned";

/**
 * One host-folded candidate for the graph view. `projection_eligible`,
 * `authorized` and `eligible_now` carry host decisions and MUST be literal
 * `true` to project (M4 literal-`true`); any other value withholds the record
 * before assembly. Only the §5.8 envelope fields plus citation references and
 * code-link targets are carried — never a record body.
 */
export interface MemoryGraphCandidateV1 {
  record_id: string;
  state: MemoryGraphRecordState;
  projection_eligible: unknown;
  authorized: unknown;
  eligible_now: unknown;
  record_digest: Digest;
  scope_ref: string;
  valid_time: ValidIntervalV1;
  projection_cursor: string;
  citation_refs: string[];
  /** Exact code node ids this memory concerns; dangling targets are dropped, never created. */
  code_targets: string[];
}

export interface MemoryGraphAssembleInputV1 {
  high_water_cursor: string;
  projection_cursor: string;
  candidates: ReadonlyArray<MemoryGraphCandidateV1>;
  code_node_ids: ReadonlyArray<string>;
  /** Canonical terminal set; a replayed add for one of these never re-projects (anti-resurrection). */
  tombstoned_ids?: ReadonlyArray<string>;
  /** Test override only; production uses MEMORY_PROJECTION_RAW_BYTE_CEILING. */
  byte_ceiling?: number;
}

export interface AssembledMemoryGraphProjectionV1 {
  high_water_cursor: string;
  projection_cursor: string;
  /** Projected record ids, sorted. */
  included: string[];
  /**
   * `accepted_current` records withheld before assembly (ineligible,
   * unauthorized, or canonically tombstoned). The neutral
   * ProjectionOmissionReason union has no bucket for these, so they are
   * reported here — deterministically sorted — instead of being misbucketed.
   */
  withheld: string[];
  omitted_by_reason: Record<ProjectionOmissionReason, number>;
  projection_digest: string;
  export_digest: string;
  raw_byte_size: number;
  raw_byte_ceiling: number;
  extraction: { nodes: Extraction["nodes"]; edges: Extraction["edges"] };
}

export interface MemoryGraphAttachReceiptV1 {
  added_nodes: number;
  added_edges: number;
  skipped_dangling_edges: number;
}

export interface MemoryGraphReconcileReceiptV1 extends MemoryGraphAttachReceiptV1 {
  removed: string[];
}

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const CURSOR_PATTERN = /^(0|[1-9][0-9]*)$/;

function isOpaqueRef(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const bytes = new TextEncoder().encode(value).byteLength;
  return bytes >= 1 && bytes <= 512;
}

function isValidInterval(value: unknown): value is ValidIntervalV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const interval = value as Record<string, unknown>;
  if (typeof interval.t !== "number" || !Number.isSafeInteger(interval.t)) return false;
  if (interval.t_end !== undefined && (typeof interval.t_end !== "number" || !Number.isSafeInteger(interval.t_end))) return false;
  if (typeof interval.t_end === "number" && interval.t_end < interval.t) return false;
  return true;
}

function refusal<T>(code: "PROJECTION_OVERSIZED" | "INVALID_SCHEMA", message: string): Result<T> {
  const operation = "projection_invalidate" as MemoryOperation;
  return { ok: false, error: { code, operation, message, retryable: false } };
}

function compareCursor(left: string, right: string): number {
  try {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  } catch {
    return left < right ? -1 : left > right ? 1 : 0;
  }
}

/**
 * M10 l.1368: only `accepted_current` with literal `projection_eligible === true`,
 * literally authorized and literally currently eligible — and absent from the
 * canonical tombstone set — may appear. Every check is `=== true` (M4).
 */
export function isProjectableMemoryCandidate(
  candidate: MemoryGraphCandidateV1,
  tombstoned: ReadonlySet<string>,
): boolean {
  return (
    candidate.state === "accepted_current" &&
    candidate.projection_eligible === true &&
    candidate.authorized === true &&
    candidate.eligible_now === true &&
    !tombstoned.has(candidate.record_id)
  );
}

function validateCandidate(candidate: MemoryGraphCandidateV1): string | undefined {
  if (!isOpaqueRef(candidate.record_id)) return "record_id must be a 1–512 byte string";
  if (!DIGEST_PATTERN.test(candidate.record_digest)) return "record_digest must be a sha256 digest";
  if (!isOpaqueRef(candidate.scope_ref)) return "scope_ref must be a 1–512 byte string";
  if (!isValidInterval(candidate.valid_time)) return "valid_time must be a safe-integer interval";
  if (!CURSOR_PATTERN.test(candidate.projection_cursor)) return "projection_cursor must be a canonical u64 cursor";
  if (!Array.isArray(candidate.citation_refs) || !candidate.citation_refs.every(isOpaqueRef)) {
    return "citation_refs must resolve to opaque references";
  }
  if (!Array.isArray(candidate.code_targets) || !candidate.code_targets.every((target) => typeof target === "string" && target.length > 0)) {
    return "code_targets must be nonempty string node ids";
  }
  return undefined;
}

/**
 * Assembles the filtered memory extraction for one graph view. Pure: no store,
 * no journal, no network. Records are processed in sorted record-id order so
 * the output (and its digest) is deterministic for the same input.
 */
export function assembleMemoryGraphProjection(
  input: MemoryGraphAssembleInputV1,
): Result<AssembledMemoryGraphProjectionV1> {
  if (!CURSOR_PATTERN.test(input.high_water_cursor) || !CURSOR_PATTERN.test(input.projection_cursor)) {
    return refusal("INVALID_SCHEMA", "high_water_cursor and projection_cursor must be canonical u64 cursors");
  }
  const tombstoned = new Set(input.tombstoned_ids ?? []);
  const liveCode = new Set(input.code_node_ids);
  const ordered = [...input.candidates].sort((a, b) => (a.record_id < b.record_id ? -1 : a.record_id > b.record_id ? 1 : 0));

  const entries: BoundedProjectionEntryV1[] = [];
  const omitted: Array<{ record_id: string; reason: ProjectionOmissionReason }> = [];
  const withheld: string[] = [];
  const codeTargetsByRecord = new Map<string, string[]>();
  const seen = new Set<string>();

  for (const candidate of ordered) {
    const invalid = validateCandidate(candidate);
    if (invalid !== undefined) {
      return refusal("INVALID_SCHEMA", `memory candidate ${JSON.stringify(candidate.record_id ?? "?")} is invalid: ${invalid}`);
    }
    if (seen.has(candidate.record_id)) {
      return refusal("INVALID_SCHEMA", "bounded projection has a duplicate record id");
    }
    seen.add(candidate.record_id);
    if (!isProjectableMemoryCandidate(candidate, tombstoned)) {
      if (candidate.state === "accepted_current") {
        withheld.push(candidate.record_id);
      } else {
        omitted.push({ record_id: candidate.record_id, reason: candidate.state });
      }
      continue;
    }
    entries.push({
      node_id: `${MEMORY_GRAPH_NODE_PREFIX}${candidate.record_id}`,
      record_id: candidate.record_id,
      record_digest: candidate.record_digest,
      scope_ref: candidate.scope_ref as OpaqueRef,
      valid_time: candidate.valid_time,
      projection_cursor: candidate.projection_cursor,
      citation_refs: [...candidate.citation_refs],
    });
    codeTargetsByRecord.set(
      candidate.record_id,
      [...new Set(candidate.code_targets.filter((target) => liveCode.has(target)))].sort(),
    );
  }

  const exported = exportBoundedCurrentProjectionV1({
    high_water_cursor: input.high_water_cursor,
    projection_cursor: input.projection_cursor,
    current: entries,
    omitted,
  });
  if (!exported.ok) return exported;

  const edges: Extraction["edges"] = [];
  for (const object of exported.value.projection.objects) {
    const targets = codeTargetsByRecord.get(object.projection.record_id) ?? [];
    for (const target of targets) {
      edges.push({
        source: object.node_id,
        target,
        relation: MEMORY_GRAPH_PROJECTION_RELATION_V1,
        confidence: "EXTRACTED",
        source_file: "",
      });
    }
  }
  edges.sort((a, b) => {
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    return a.target < b.target ? -1 : a.target > b.target ? 1 : 0;
  });

  // M10 l.1362: the ceiling covers the bytes actually produced — the memory
  // nodes and memory edges in the form written to `graph.json`. The neutral
  // envelope size undercounts the node rows (id, label, file_type,
  // source_file plus the duplicated envelope and citation references), so no
  // field-by-field estimate is used: the real serialized size is measured.
  const nodes: Extraction["nodes"] = exported.value.projection.objects.map((object) => ({
    id: object.node_id,
    label: object.projection.record_id,
    file_type: "memory",
    source_file: "",
    memory_projection: object.projection,
    citation_refs: [...object.citation_refs],
  }));
  const encoder = new TextEncoder();
  const totalRawBytes =
    encoder.encode(JSON.stringify(nodes)).byteLength +
    encoder.encode(JSON.stringify(edges)).byteLength;
  const ceiling = input.byte_ceiling ?? MEMORY_PROJECTION_RAW_BYTE_CEILING;
  if (totalRawBytes > ceiling) {
    return refusal(
      "PROJECTION_OVERSIZED",
      `bounded current projection of ${entries.length} objects with ${edges.length} code references is ${totalRawBytes} bytes, exceeds the ${ceiling}-byte ceiling; refused without omitting any current entry`,
    );
  }
  return {
    ok: true,
    value: {
      high_water_cursor: input.high_water_cursor,
      projection_cursor: input.projection_cursor,
      included: entries.map((entry) => entry.record_id),
      withheld: withheld.sort(),
      omitted_by_reason: exported.value.omitted_by_reason,
      projection_digest: exported.value.projection_digest,
      export_digest: exported.value.export_digest,
      raw_byte_size: totalRawBytes,
      raw_byte_ceiling: ceiling,
      extraction: { nodes, edges },
    },
  };
}

export function memoryNodeIdForRecord(recordId: string): string {
  return `${MEMORY_GRAPH_NODE_PREFIX}${recordId}`;
}

export function memoryRecordIdOfNodeId(nodeId: string): string | undefined {
  return nodeId.startsWith(MEMORY_GRAPH_NODE_PREFIX) ? nodeId.slice(MEMORY_GRAPH_NODE_PREFIX.length) : undefined;
}

/** M10 l.1372: a projection behind the high-water cursor is stale and MUST NOT be served as current. */
export function isMemoryProjectionFresh(projectionCursor: string, highWaterCursor: string): boolean {
  if (!CURSOR_PATTERN.test(projectionCursor) || !CURSOR_PATTERN.test(highWaterCursor)) return false;
  return compareCursor(projectionCursor, highWaterCursor) >= 0;
}

/** Throws `PROJECTION_STALE` when the projection is behind the high-water cursor. */
export function assertMemoryProjectionFresh(projectionCursor: string, highWaterCursor: string): void {
  if (!isMemoryProjectionFresh(projectionCursor, highWaterCursor)) {
    throw new Error(
      `PROJECTION_STALE: memory projection at cursor ${projectionCursor} is behind high-water cursor ${highWaterCursor}; rebuild before serving`,
    );
  }
}

/** True when the live graph view carries at least one memory node. */
export function graphCarriesMemoryNodes(G: Graph): boolean {
  let found = false;
  G.forEachNode((_nodeId, attrs) => {
    if (!found && (attrs as Record<string, unknown>)?.file_type === "memory") found = true;
  });
  return found;
}

/**
 * M10 l.1399 — the single mandatory freshness gate for every Graph surface
 * that exposes memory (report, wiki, export). Surfaces call it
 * unconditionally: there is no parameter that skips the gate. A view without
 * memory nodes stays servable. A view carrying memory nodes without a
 * high-water proof is refused — freshness is unprovable, so the projection
 * MUST NOT be served as current. With a proof, a projection behind it is
 * refused (`PROJECTION_STALE`).
 */
export function enforceMemoryFreshnessForSurface(G: Graph, highWaterCursor?: string): void {
  if (!graphCarriesMemoryNodes(G)) return;
  if (highWaterCursor === undefined) {
    throw new Error(
      "PROJECTION_STALE: graph carries memory nodes without a high-water proof; supply the live high-water cursor and rebuild before serving",
    );
  }
  checkGraphMemoryFreshness(G, highWaterCursor);
}

/**
 * M10 l.1399 — the single mandatory freshness gate for cached extractions.
 * Same fail-closed rule as the Graph gate: payloads without memory nodes pass
 * unconditionally; a payload carrying memory nodes without a high-water proof
 * is refused; with a proof, every memory node must pin a projection cursor at
 * or ahead of it (a cursor-less memory node cannot prove freshness).
 */
export function enforceCachedMemoryFreshness(
  payload: Record<string, unknown>,
  highWaterCursor?: string,
): void {
  const nodes = (payload as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return;
  let carriesMemory = false;
  for (const node of nodes) {
    if (!!node && typeof node === "object" && (node as Record<string, unknown>).file_type === "memory") {
      carriesMemory = true;
      break;
    }
  }
  if (!carriesMemory) return;
  if (highWaterCursor === undefined) {
    throw new Error(
      "PROJECTION_STALE: cached extraction carries memory nodes without a high-water proof; supply the live high-water cursor and rebuild before serving",
    );
  }
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const record = node as Record<string, unknown>;
    if (record.file_type !== "memory") continue;
    const projection = record.memory_projection;
    const cursor =
      projection !== null && typeof projection === "object"
        ? (projection as Record<string, unknown>).projection_cursor
        : undefined;
    if (typeof cursor !== "string") {
      throw new Error(
        "PROJECTION_STALE: cached memory node has no projection cursor; rebuild before serving",
      );
    }
    assertMemoryProjectionFresh(cursor, highWaterCursor);
  }
}

/**
 * Freshness gate for an assembled graph. Memory nodes require valid cursor
 * pins and a projection current through both the pinned and live high-water.
 */
export function checkGraphMemoryFreshness(G: Graph, highWaterCursor: string): void {
  const attrs = G.getAttributes() as Record<string, unknown>;
  const projectionCursor = attrs[MEMORY_PROJECTION_CURSOR_ATTR];
  const pinnedHighWater = attrs[MEMORY_HIGH_WATER_CURSOR_ATTR];
  if (projectionCursor === undefined && pinnedHighWater === undefined && !graphCarriesMemoryNodes(G)) return;
  if (typeof projectionCursor !== "string" || typeof pinnedHighWater !== "string") {
    throw new Error("PROJECTION_STALE: memory projection freshness attributes are malformed; rebuild before serving");
  }
  assertMemoryProjectionFresh(projectionCursor, pinnedHighWater);
  assertMemoryProjectionFresh(projectionCursor, highWaterCursor);
}

/**
 * Controlled assembly (M10 l.1374): adds only `memory:`-namespaced nodes and
 * edges whose both endpoints exist. An id collision with a non-memory node
 * throws instead of replacing the foreign object; dangling code targets are
 * skipped and counted. Stamps the freshness cursors on the graph.
 */
export function attachMemoryProjectionToGraph(
  G: Graph,
  assembled: AssembledMemoryGraphProjectionV1,
): MemoryGraphAttachReceiptV1 {
  let addedNodes = 0;
  let addedEdges = 0;
  let skippedDanglingEdges = 0;
  for (const node of assembled.extraction.nodes) {
    const { id, ...attrs } = node;
    if (G.hasNode(id)) {
      const existing = G.getNodeAttributes(id) as Record<string, unknown>;
      if (existing.file_type !== "memory") {
        throw new Error(`memory projection refuses to replace foreign node ${JSON.stringify(id)}`);
      }
    } else {
      addedNodes += 1;
    }
    G.mergeNode(id, { ...attrs });
  }
  for (const edge of assembled.extraction.edges) {
    if (!G.hasNode(edge.source) || !G.hasNode(edge.target)) {
      skippedDanglingEdges += 1;
      continue;
    }
    G.mergeEdge(edge.source, edge.target, { ...edge });
    addedEdges += 1;
  }
  G.setAttribute(MEMORY_PROJECTION_CURSOR_ATTR, assembled.projection_cursor);
  G.setAttribute(MEMORY_HIGH_WATER_CURSOR_ATTR, assembled.high_water_cursor);
  return { added_nodes: addedNodes, added_edges: addedEdges, skipped_dangling_edges: skippedDanglingEdges };
}

/**
 * Drops every `memory` node whose id is outside the included set, with its
 * incident edges. Shared by reconciliation and by derived-surface preparation
 * so report, wiki, export and caches expose only what is projected.
 */
export function stripNonProjectedMemoryNodes(
  G: Graph,
  includedNodeIds: ReadonlySet<string>,
): string[] {
  const removed: string[] = [];
  const stale: string[] = [];
  G.forEachNode((nodeId, attrs) => {
    if ((attrs as Record<string, unknown>).file_type === "memory" && !includedNodeIds.has(nodeId)) {
      stale.push(nodeId);
    }
  });
  for (const nodeId of stale.sort()) {
    const recordId = memoryRecordIdOfNodeId(nodeId) ?? nodeId;
    G.dropNode(nodeId);
    removed.push(recordId);
  }
  return removed.sort();
}

/**
 * Drops every memory node with its incident edges and clears the freshness
 * pins, so a regeneration without a fresh projection conserves no memory
 * (M10 l.1399). Code nodes are never touched. The stripped graph carries no
 * projection and stays servable as a code-only view.
 */
export function stripAllMemoryProjectionFromGraph(G: Graph): string[] {
  const removed = stripNonProjectedMemoryNodes(G, new Set());
  if (G.hasAttribute(MEMORY_PROJECTION_CURSOR_ATTR)) {
    G.removeAttribute(MEMORY_PROJECTION_CURSOR_ATTR);
  }
  if (G.hasAttribute(MEMORY_HIGH_WATER_CURSOR_ATTR)) {
    G.removeAttribute(MEMORY_HIGH_WATER_CURSOR_ATTR);
  }
  return removed;
}

/**
 * Regeneration/reconciliation (M10 l.1368, l.1370): the next assembly drops
 * memories that left `accepted_current`/eligibility/authorization, retires
 * every previous memory reference edge before attaching the fresh reference
 * set, then attaches the fresh projection. A retargeted authorization (e.g.
 * `[alpha]` replaced by `[beta]`) therefore leaves no stale edge behind.
 * Code nodes and code-code edges are never touched.
 */
export function reconcileMemoryProjectionInGraph(
  G: Graph,
  assembled: AssembledMemoryGraphProjectionV1,
): MemoryGraphReconcileReceiptV1 {
  const included = new Set(assembled.extraction.nodes.map((node) => node.id));
  const removed = stripNonProjectedMemoryNodes(G, included);
  const staleEdges: string[] = [];
  G.forEachEdge((edgeKey, _attrs, source, target) => {
    if (source.startsWith(MEMORY_GRAPH_NODE_PREFIX) || target.startsWith(MEMORY_GRAPH_NODE_PREFIX)) {
      staleEdges.push(edgeKey);
    }
  });
  for (const edgeKey of staleEdges) {
    if (G.hasEdge(edgeKey)) G.dropEdge(edgeKey);
  }
  const attached = attachMemoryProjectionToGraph(G, assembled);
  return { ...attached, removed };
}

/** Re-exported so callers pin the same ceiling the neutral projection enforces. */
export { MEMORY_PROJECTION_RAW_BYTE_CEILING };
