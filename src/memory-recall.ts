/**
 * graphify-memory v1 — the RECALL surface (SPEC_AGENT_MEMORY_SUBSTRATE, ratified
 * @87a8cd05..cd7fad55). The read side that makes the admitted substrate usable:
 * it recalls `MemoryNote` nodes through the SAME T5/T6 temporal predicate and
 * enforces the recall-surface invariants that are graphify-side (charter:
 * temporal-recall). It is the mirror of the admission gate — admission is the
 * write predicate, this is the read predicate — and it authors NO memory.
 *
 * What this surface guarantees, and deliberately does NOT:
 *  - It REUSES `overlapsTemporalWindow` (the exported T5/T6 membership predicate)
 *    rather than keeping a second, drifting copy.
 *  - It enforces tenancy access (§3.6): a `private` note is visible ONLY to its
 *    `principal_owner`; `capitalised` notes are shared; a note whose tenancy
 *    cannot be verified fails CLOSED (never recalled).
 *  - It folds tombstoned targets out at PROJECTION (§3.5) — A2 with teeth — and a
 *    tombstoned node cannot resurface through an edge (this surface is notes-only,
 *    so an edge can never reintroduce an erased subject).
 *  - It RETAINS the trust tier + review_status + provenance on every note (§1):
 *    a `pending` note is disclosed as pending, never presented as ground truth.
 *  - PROJECTION PROHIBITION (§3.3.3): it offers NO identity-profile projection.
 *    `human:<id>` notes are returned INDIVIDUALLY, never assembled into a ranked
 *    `UserModel`. The prohibition is structural — there is no such entry point.
 *
 * Deterministic, provider-neutral, no LLM, no network, no h2a import (anti-cycle).
 */
import { overlapsTemporalWindow } from "./temporal-recall.js";

export const MEMORY_RECALL_SCHEMA = "graphify.memory-recall/v1" as const;

/** The principal performing the recall; tenancy access is evaluated against it (§3.6). */
export interface MemoryRecallContext {
  principal_owner: string;
}

/** Exactly one of `asOf` (T6 point) or `window` (T5 span) must be supplied. */
export interface MemoryRecallOptions {
  /** T6 point recall: the note must be live at this instant, `[asOf, asOf]`. */
  asOf?: number;
  /** T5 window recall: inclusive `[since, until]`; `null` leaves that side open. */
  window?: { sinceMs: number | null; untilMs: number | null };
}

/** A compensating erasure event (§3.5). It folds its target out of EVERY projection. */
export interface MemoryTombstone {
  target:
    | { kind: "node"; id: string }
    | { kind: "edge"; source: string; target: string; relation?: string };
  /** The principal that owns the erased target (authority is checked at request time). */
  principal_owner: string;
}

export interface MemoryRecallInput {
  nodes?: Record<string, unknown>[];
  links?: Record<string, unknown>[];
  edges?: Record<string, unknown>[];
}

/** A recalled note, carried verbatim — the tier and provenance are RETAINED (§1). */
export type RecalledMemoryNote = Record<string, unknown> & {
  id: string;
  node_type: "MemoryNote";
  subject: string;
  t: number;
  trust: unknown;
  review_status: unknown;
  scope: string;
  principal_owner: string;
};

export interface MemoryRecallResult {
  schema: typeof MEMORY_RECALL_SCHEMA;
  /** Individual notes — NEVER an assembled identity profile (§3.3.3). */
  notes: RecalledMemoryNote[];
  /** Structural disclosure that no profile/UserModel projection was performed. */
  projection: "notes-only";
  requestingPrincipal: string;
  asOfMs: number | null;
  window: { sinceMs: number | null; untilMs: number | null } | null;
  /** T6 contract: the full matching set, never silently truncated. */
  unpaged: true;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Resolve the recall bounds from exactly one of the two mutually exclusive modes. */
function resolveBounds(options: MemoryRecallOptions): {
  fromMs: number;
  toMs: number;
  asOfMs: number | null;
  window: { sinceMs: number | null; untilMs: number | null } | null;
} {
  const hasAsOf = typeof options.asOf === "number";
  const hasWindow = options.window !== undefined && options.window !== null;
  if (hasAsOf === hasWindow) {
    throw new Error("recallMemory requires exactly one of { asOf } or { window }");
  }
  if (hasAsOf) {
    const at = options.asOf as number;
    if (!Number.isFinite(at)) throw new RangeError("asOf must be a finite epoch-ms instant");
    return { fromMs: at, toMs: at, asOfMs: at, window: null };
  }
  const w = options.window as { sinceMs: number | null; untilMs: number | null };
  const fromMs = w.sinceMs ?? Number.NEGATIVE_INFINITY;
  const toMs = w.untilMs ?? Number.POSITIVE_INFINITY;
  if (fromMs > toMs) throw new RangeError("recallMemory window requires sinceMs <= untilMs");
  return { fromMs, toMs, asOfMs: null, window: { sinceMs: w.sinceMs, untilMs: w.untilMs } };
}

/**
 * Tenancy visibility (§3.6): a `capitalised` note is shared across principals; a
 * `private` note is visible ONLY within its `principal_owner`. A note whose
 * tenancy cannot be verified (missing owner, unknown scope) fails CLOSED — the
 * recall would rather omit a note than leak one across tenants.
 */
function isVisibleTo(node: Record<string, unknown>, requester: string): boolean {
  const owner = node.principal_owner;
  const scope = node.scope;
  if (typeof owner !== "string" || owner.length === 0) return false;
  if (scope === "capitalised") return true;
  if (scope === "private") return owner === requester;
  return false;
}

/**
 * Recall the memory notes live at the requested instant/window and visible to the
 * requesting principal, folding out tombstoned targets. Pure: the input document
 * is never mutated and notes are carried verbatim.
 */
export function recallMemory(
  input: MemoryRecallInput,
  ctx: MemoryRecallContext,
  options: MemoryRecallOptions,
  tombstones: readonly MemoryTombstone[] = [],
): MemoryRecallResult {
  if (typeof ctx?.principal_owner !== "string" || ctx.principal_owner.length === 0) {
    throw new Error("recallMemory requires a ctx.principal_owner");
  }
  const { fromMs, toMs, asOfMs, window } = resolveBounds(options);

  // Tombstoned node ids fold OUT at projection (§3.5). Because this surface is
  // notes-only, a tombstoned node can never resurface through an edge — the edge
  // cascade is satisfied by construction, not by a second pass.
  const tombstonedNodeIds = new Set<string>();
  for (const t of tombstones) {
    if (t.target.kind === "node") tombstonedNodeIds.add(t.target.id);
  }

  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const notes: RecalledMemoryNote[] = [];
  for (const node of rawNodes) {
    if (node.node_type !== "MemoryNote") continue;
    if (typeof node.id !== "string") continue;
    if (tombstonedNodeIds.has(node.id)) continue;
    if (!isVisibleTo(node, ctx.principal_owner)) continue;
    if (!overlapsTemporalWindow(node, fromMs, toMs)) continue;
    // Carried verbatim: trust, review_status and provenance are RETAINED (§1),
    // so a pending note is disclosed as pending and never dressed as ground truth.
    notes.push(node as RecalledMemoryNote);
  }

  // Deterministic order by (t, id). Human-subject and agent-subject notes are
  // treated IDENTICALLY — no per-subject ranking, no profile assembly (§3.3.3).
  notes.sort((a, b) => {
    const ta = typeof a.t === "number" ? a.t : 0;
    const tb = typeof b.t === "number" ? b.t : 0;
    return ta - tb || compareText(a.id, b.id);
  });

  return {
    schema: MEMORY_RECALL_SCHEMA,
    notes,
    projection: "notes-only",
    requestingPrincipal: ctx.principal_owner,
    asOfMs,
    window,
    unpaged: true,
  };
}
