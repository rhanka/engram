/**
 * Agent-memory factory — CABLES the §9.4 ctx-carrying ports to their concrete
 * graphify impls (memory-admission, memory-recall) AND the REAL storage D5 append
 * port (`GraphStore.appendNode`/`appendTombstone`, `capabilities.append` v1,
 * SPEC_AGENT_MEMORY_SUBSTRATE §5). This is the §5 cabling the seam deferred.
 *
 * ANTI-CYCLE: this module is graphify-INTERNAL glue. h2a imports ONLY the data-pure
 * `memory-producer-port` (types + method shapes), never this factory, so the factory
 * may import storage + admission freely — it adds no edge TO h2a. graphify never
 * imports h2a. (Verified at build: no `h2a` token in the source.)
 *
 * The public ports carry a `ctx` (tenancy); the concrete admit/recall take injected
 * `deps`. The factory closes over the storage store + a source resolver + a read
 * source, and exposes the ctx surface. Deterministic, provider-neutral, no LLM.
 */
import {
  admitMemoryNote,
  requestTombstone as requestTombstoneGate,
  type MemoryNoteInput as AdmissionNoteInput,
} from "./memory-admission.js";
import { recallMemory, type MemoryRecallInput, type MemoryTombstone } from "./memory-recall.js";
import type {
  AdmissionOutcome,
  MemoryContext,
  MemoryNoteInput,
  MemoryPort,
  MemoryProducerPort,
  MemoryRecallPort,
  MemoryRecallQuery,
  MemoryRecallResultView,
  PromotionEvidence,
  PromotionOutcome,
  RecalledMemoryNoteView,
  TombstoneAuthorization,
  TombstoneOutcome,
  TombstoneTarget,
} from "./memory-producer-port.js";
import type { GraphStore, GraphNodeInput, GraphStoreAppendCapability, GraphTombstoneInput } from "./storage/types.js";

/**
 * The storage surface the producer needs — the D5 append side only, as a STRUCTURAL
 * subset so a real `GraphStore` satisfies it and a test can supply a fake without a
 * live backend. We depend on the SIGNATURE, never a concrete adapter.
 */
export interface MemoryAppendStore {
  capabilities: { append?: GraphStoreAppendCapability };
  appendNode?: GraphStore["appendNode"];
  appendTombstone?: GraphStore["appendTombstone"];
}

export interface MemoryProducerDeps {
  /** The storage store whose D5 append port receives admitted notes / tombstones. */
  store: MemoryAppendStore;
  /** Resolve a cited source locator to its raw text for `verifyVerbatim` (§4). */
  resolveSource: (ref: string) => string | null;
}

export interface MemoryRecallDeps {
  /** Load the current memory subgraph (nodes + links) to recall from. */
  loadGraph: () => MemoryRecallInput | Promise<MemoryRecallInput>;
  /** Load the append-only tombstone journal folded out at projection (§3.5). */
  loadTombstones?: () => readonly MemoryTombstone[] | Promise<readonly MemoryTombstone[]>;
}

/**
 * Cable the WRITE-side port (admit / promote / requestTombstone) to the concrete
 * gate + the real storage append port.
 *
 * M4 guard: the store must DECLARE `capabilities.append` (v1) AND implement the two
 * methods, or we throw rather than cable — a producer bound to a store that would
 * silently no-op an erasure is exactly the "success without effect" the contract
 * forbids (§5).
 */
export function createMemoryProducer(deps: MemoryProducerDeps): MemoryProducerPort {
  const { store, resolveSource } = deps;
  if (
    store.capabilities.append?.version !== 1 ||
    typeof store.appendNode !== "function" ||
    typeof store.appendTombstone !== "function"
  ) {
    throw new Error(
      "createMemoryProducer requires a store declaring capabilities.append (D5 v1) with real " +
        "appendNode + appendTombstone — M4 omit-entirely, never a present-but-no-op method (§5)",
    );
  }
  const appendNode = (node: Record<string, unknown>) => store.appendNode!(node as GraphNodeInput);
  const appendTombstone = (t: { target: TombstoneTarget; principal_owner: string }) =>
    // The memory tombstone's authority (principal_owner) rides as the storage
    // audit `reason`; the target shapes are identical.
    store.appendTombstone!({ target: t.target, reason: t.principal_owner } as GraphTombstoneInput);

  return {
    async admitMemoryNote(note: MemoryNoteInput, ctx: MemoryContext): Promise<AdmissionOutcome> {
      // Tenancy consistency (§3.6): a dispatching principal may only admit a note
      // for its OWN principal — never write into another tenant's memory.
      if (ctx.principal_owner !== note.principal_owner) {
        return {
          admitted: false,
          reason: "ctx.principal_owner does not match note.principal_owner (cross-tenant write refused, §3.6)",
        };
      }
      return admitMemoryNote(note as unknown as AdmissionNoteInput, { resolveSource, appendNode });
    },

    async promoteNote(
      _noteId: string,
      _evidence: PromotionEvidence,
      _ctx: MemoryContext,
    ): Promise<PromotionOutcome> {
      // D11 promotion is NOT yet cabled: its body co-specs against memory's
      // double-consensus orchestration, still converging h2a-side (§9.3). Refuse
      // honestly (discriminated) rather than fabricate an unverified promotion.
      return {
        promoted: false,
        reason:
          "promoteNote (D11) is not yet cabled: it awaits the memory-side double-consensus orchestration convergence (§9.3)",
      };
    },

    async requestTombstone(
      target: TombstoneTarget,
      auth: TombstoneAuthorization,
      ctx: MemoryContext,
    ): Promise<TombstoneOutcome> {
      return requestTombstoneGate({ target, principal_owner: ctx.principal_owner }, auth, { appendTombstone });
    },
  };
}

/**
 * Cable the READ-side port (recall) to a read source. The pure `recallMemory`
 * (memory-recall) enforces tenancy access + tombstone fold-out + the projection
 * prohibition; the factory supplies the graph + tombstone journal and exposes the
 * ctx port, adding the `freshness` disclosure (the recall does not verify a store
 * snapshot's freshness — mirrors the T6 `unverified` disclosure).
 */
export function createMemoryRecall(deps: MemoryRecallDeps): MemoryRecallPort {
  return {
    async recallMemory(query: MemoryRecallQuery, ctx: MemoryContext): Promise<MemoryRecallResultView> {
      const input = await deps.loadGraph();
      const tombstones = deps.loadTombstones ? await deps.loadTombstones() : [];
      const options =
        query.asOf !== undefined ? { asOf: query.asOf } : { window: query.window as { sinceMs: number | null; untilMs: number | null } };
      const result = recallMemory(input, { principal_owner: ctx.principal_owner }, options, tombstones);
      return {
        schema: result.schema,
        notes: result.notes as unknown as RecalledMemoryNoteView[],
        projection: "notes-only",
        requestingPrincipal: result.requestingPrincipal,
        freshness: "unverified",
        unpaged: true,
      };
    },
  };
}

/** Cable the WHOLE memory port (write-side + read-side) behind one surface. */
export function createMemoryPort(deps: MemoryProducerDeps & MemoryRecallDeps): MemoryPort {
  return { ...createMemoryProducer(deps), ...createMemoryRecall(deps) };
}
