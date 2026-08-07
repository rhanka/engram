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
 *
 * D11 ENFORCEABILITY FRONTIER (§9.3 — what `promoteNote` does NOT guarantee, stated
 * like the verifyVerbatim / event_shaped caveats). graphify enforces only the
 * STRUCTURAL contract: the note is `pending`, TWO verdict references are present and
 * DISTINCT (structural independence = two different artefacts), an independence
 * attestation is present, the tenancy matches, and on pass it APPENDS the accepted
 * note + audit stamp (D12 append-and-fold). graphify NEVER reads or re-judges the
 * CONTENT of the verdicts — they are references, so:
 *   - the SUBSTANTIVE consensus (both legs GO, high-grade, truly independent) is
 *     enforced by the h2a ORCHESTRATION (conductor-launched, author-excluded);
 *   - it is made AUDITABLE by the recorded refs (a third party resolves them);
 *   - verdict SIGNATURES (the `signed` tier h2a owns) close authenticity — an audit
 *     proves it, not just "cited";
 *   - "caller != author" (separation of powers) is enforced by the orchestration and
 *     auditable via the leg identity IN the verdicts; graphify knows only the tenancy
 *     (ctx.principal), NOT the individual agent, so this is NOT enforced gate-side.
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
import type {
  GraphStore,
  GraphNodeInput,
  GraphStoreAppendCapability,
  GraphStoreReadbackCapability,
  GraphTombstoneInput,
} from "./storage/types.js";

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

/** A stored note as read back for the D11 promotion checks. */
export type MemoryNoteRecord = Record<string, unknown> & {
  id: string;
  review_status?: unknown;
  principal_owner?: unknown;
};

/**
 * Deps that ENABLE the D11 `promoteNote` body (§9.3). Absent ⇒ `promoteNote`
 * returns an honest not-configured refusal (a producer may be admit-only).
 */
export interface MemoryPromotionDeps {
  /** Read a note by id for the promotion checks; `null` when it does not exist. */
  loadNote: (noteId: string) => (MemoryNoteRecord | null) | Promise<MemoryNoteRecord | null>;
  /** Clock for the `promoted_at` stamp (injected for determinism/tests). */
  now?: () => number;
}

export interface MemoryProducerDeps {
  /** The storage store whose D5 append port receives admitted notes / tombstones. */
  store: MemoryAppendStore;
  /** Resolve a cited source locator to its raw text for `verifyVerbatim` (§4). */
  resolveSource: (ref: string) => string | null;
  /** OPTIONAL: enables the D11 `promoteNote` body; absent ⇒ honest not-configured refusal. */
  promotion?: MemoryPromotionDeps;
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
      noteId: string,
      evidence: PromotionEvidence,
      ctx: MemoryContext,
    ): Promise<PromotionOutcome> {
      // The D11 body enforces the STRUCTURAL contract only (§9.3 / frontier E in the
      // header): it never re-reads or re-judges the CONTENT of the two verdicts —
      // those are REFERENCES; the substantive consensus is enforced by the h2a
      // orchestration and made AUDITABLE by the recorded refs. Absent promotion
      // deps ⇒ this producer is admit-only.
      const promotion = deps.promotion;
      if (!promotion) {
        return { promoted: false, reason: "promoteNote is not configured on this producer (no promotion.loadNote dep)" };
      }
      const now = promotion.now ?? (() => Date.now());

      // D.1 — the note must exist and be `pending` (only asserted-pending notes enter D11).
      const note = await promotion.loadNote(noteId);
      if (!note) return { promoted: false, reason: `note not found: ${noteId}` };
      if (note.review_status !== "pending") {
        return { promoted: false, reason: "note is not review_status:'pending' (D11 promotes only pending notes)" };
      }
      // D.4 — tenancy: the promoting principal must own the note (§3.6).
      if (ctx.principal_owner !== note.principal_owner) {
        return { promoted: false, reason: "ctx.principal_owner does not match note.principal_owner (§3.6)" };
      }
      // D.2 — two verdict references, present and DISTINCT (structural independence =
      // two different artefacts). graphify does NOT read their content.
      const { leg1_verdict_ref, leg2_verdict_ref, independence_attestation } = evidence;
      if (typeof leg1_verdict_ref !== "string" || leg1_verdict_ref.length === 0 ||
          typeof leg2_verdict_ref !== "string" || leg2_verdict_ref.length === 0) {
        return { promoted: false, reason: "both leg1_verdict_ref and leg2_verdict_ref are required" };
      }
      if (leg1_verdict_ref === leg2_verdict_ref) {
        return { promoted: false, reason: "the two verdict references must be DISTINCT (structural independence — two different artefacts)" };
      }
      // D.3 — the independence attestation reference must be present (well-formed).
      if (typeof independence_attestation !== "string" || independence_attestation.length === 0) {
        return { promoted: false, reason: "independence_attestation is required" };
      }

      // Pass — append the accepted note (D12 append-and-fold: the prior `pending`
      // version stays in the journal, folded out at projection) with the audit
      // stamp recording the two refs + attestation + provenance + who/when.
      const accepted: Record<string, unknown> = {
        ...note,
        review_status: "accepted",
        promotion: {
          leg1_verdict_ref,
          leg2_verdict_ref,
          independence_attestation,
          promoted_at: now(),
          promoted_by: ctx.principal_owner,
          provenance: note.provenance,
        },
      };
      await appendNode(accepted);
      return { promoted: true, id: note.id };
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

/**
 * The read-back surface recall + promotion need — the operational-slice read
 * mirror of the append port (`capabilities.readback` v1). Structural subset so a
 * real `GraphStore` satisfies it and a test supplies a fake without a live backend.
 */
export interface MemoryReadbackStore {
  capabilities: { readback?: GraphStoreReadbackCapability };
  loadNode?: GraphStore["loadNode"];
  listMemoryNotes?: GraphStore["listMemoryNotes"];
  loadTombstones?: GraphStore["loadTombstones"];
}

/** A store that can both APPEND (write) and READ BACK (recall/promote) memory. */
export type MemoryOperationalStore = MemoryAppendStore & MemoryReadbackStore;

/**
 * Cable a REAL store (append + read-back) into the WHOLE ctx-carrying `MemoryPort`
 * — the operational slice. `admitMemoryNote` writes through the append port;
 * `recallMemory` reads through `listMemoryNotes`; `promoteNote` reads the pending
 * note through `loadNode`. The store is the single source of truth; graphify
 * authors nothing (§3.2).
 *
 * M4 guard: BOTH capabilities must be declared v1 with real methods, or we throw —
 * a port bound to a store that would silently no-op a write OR return nothing on
 * read is exactly the "success without effect" the contract forbids (§5).
 *
 * `loadGraph` is ctx-less by the `MemoryRecallDeps` contract, so it lists the
 * tenancy VISIBILITY SUPERSET (`listMemoryNotes`) and `recallMemory` RE-APPLIES the
 * authoritative §3.6 filter — the store scan only narrows, never widens, what a
 * principal can see.
 */
export function createMemoryPortForStore(
  store: MemoryOperationalStore,
  opts: { resolveSource: (ref: string) => string | null; now?: () => number },
): MemoryPort {
  if (
    store.capabilities.append?.version !== 1 ||
    typeof store.appendNode !== "function" ||
    typeof store.appendTombstone !== "function"
  ) {
    throw new Error(
      "createMemoryPortForStore requires a store declaring capabilities.append (D5 v1) with real appendNode + appendTombstone (§5)",
    );
  }
  if (
    store.capabilities.readback?.version !== 1 ||
    typeof store.loadNode !== "function" ||
    typeof store.listMemoryNotes !== "function" ||
    typeof store.loadTombstones !== "function"
  ) {
    throw new Error(
      "createMemoryPortForStore requires a store declaring capabilities.readback (v1) with real loadNode + " +
        "listMemoryNotes + loadTombstones — recall/promote read what append wrote",
    );
  }
  const loadNode = store.loadNode;
  const listMemoryNotes = store.listMemoryNotes;
  const loadTombstones = store.loadTombstones;

  return createMemoryPort({
    store,
    resolveSource: opts.resolveSource,
    promotion: {
      loadNote: async (noteId: string) => (await loadNode(noteId)) as MemoryNoteRecord | null,
      now: opts.now,
    },
    // ctx-less by contract → list the visibility SUPERSET; recallMemory re-applies §3.6.
    loadGraph: async () => ({ nodes: (await listMemoryNotes()) as unknown as Record<string, unknown>[] }),
    loadTombstones: async () =>
      (await loadTombstones()).map((rec) => ({
        // the append path rode the memory tombstone's `principal_owner` as the audit `reason`.
        target: rec.target as MemoryTombstone["target"],
        principal_owner: typeof rec.reason === "string" ? rec.reason : "",
      })),
  });
}
