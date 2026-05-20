/**
 * Hyperedges data layer (Lot F-Hyper-1).
 *
 * Canonical schema, graphology storage wrappers, and merge semantics for
 * N-ary "hyperedges" — group relationships spanning >2 nodes. This module
 * mirrors upstream Python `safishamsi/graphify@v8` (`build.py`, `export.py`)
 * where the same structure is persisted as `G.graph["hyperedges"]` and as the
 * top-level `hyperedges` field in `graph.json`.
 *
 * Lot F-Hyper-1 is a scaffold / data layer only — no source extraction, no
 * rendering. Populated via downstream lots once we wire LLM extractors.
 */
import type Graph from "graphology";

import type { Confidence, Hyperedge } from "./types.js";

export type { Hyperedge } from "./types.js";

/** Graphology attribute key used to persist hyperedges on a `Graph`. */
export const HYPEREDGES_ATTRIBUTE = "hyperedges";

const CONFIDENCE_VALUES: ReadonlySet<Confidence> = new Set([
  "EXTRACTED",
  "INFERRED",
  "AMBIGUOUS",
]);

/**
 * Runtime type guard. Returns true if `value` matches the `Hyperedge` shape.
 */
export function validateHyperedge(value: unknown): value is Hyperedge {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const h = value as Record<string, unknown>;
  if (typeof h.id !== "string" || h.id.length === 0) return false;
  if (typeof h.label !== "string") return false;
  if (!Array.isArray(h.nodes) || !h.nodes.every((n) => typeof n === "string")) return false;
  if (typeof h.relation !== "string") return false;
  if (typeof h.confidence !== "string" || !CONFIDENCE_VALUES.has(h.confidence as Confidence)) {
    return false;
  }
  if (typeof h.source_file !== "string") return false;
  if (h.confidence_score !== undefined) {
    if (typeof h.confidence_score !== "number" || !Number.isFinite(h.confidence_score)) {
      return false;
    }
  }
  return true;
}

/**
 * Read hyperedges from a `Graph`. Returns an empty array when none are stored.
 */
export function loadHyperedges(graph: Graph): Hyperedge[] {
  const raw = graph.getAttribute(HYPEREDGES_ATTRIBUTE) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw as Hyperedge[];
}

/**
 * Write hyperedges onto a `Graph`.
 */
export function setHyperedges(graph: Graph, edges: Hyperedge[]): void {
  graph.setAttribute(HYPEREDGES_ATTRIBUTE, edges);
}

/**
 * Deterministically merge two hyperedge lists.
 */
export function mergeHyperedges(a: readonly Hyperedge[], b: readonly Hyperedge[]): Hyperedge[] {
  const byId = new Map<string, Hyperedge>();
  const order: string[] = [];

  const ingest = (list: readonly Hyperedge[]): void => {
    for (const candidate of list) {
      if (!candidate || typeof candidate !== "object") continue;
      const id = (candidate as { id?: unknown }).id;
      if (typeof id !== "string" || id.length === 0) continue;

      const existing = byId.get(id);
      if (!existing) {
        const cloned: Hyperedge = {
          ...candidate,
          nodes: Array.isArray(candidate.nodes) ? [...candidate.nodes] : [],
        };
        byId.set(id, cloned);
        order.push(id);
        continue;
      }

      const incomingNodes = Array.isArray(candidate.nodes) ? candidate.nodes : [];
      if (incomingNodes.length === 0) continue;
      const seen = new Set(existing.nodes);
      for (const node of incomingNodes) {
        if (typeof node !== "string" || seen.has(node)) continue;
        seen.add(node);
        existing.nodes.push(node);
      }
    }
  };

  ingest(a);
  ingest(b);

  return order.map((id) => byId.get(id) as Hyperedge);
}
