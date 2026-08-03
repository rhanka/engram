/**
 * The agent-memory PORT — the anti-cycle SEAM (SPEC_AGENT_MEMORY_SUBSTRATE §9.4,
 * ratified @87a8cd05..cd7fad55). Two sides, ONE data-pure surface a consumer imports:
 *   - the PRODUCER (write-side): three entry points admitMemoryNote / promoteNote /
 *     requestTombstone (`MemoryProducerPort`);
 *   - the RECALL (read-side): recallMemory (`MemoryRecallPort`) — the surface h2a's
 *     wake-recall codes against (read the memory at wake).
 * h2a imports ONLY this signature (types + method shapes) and never graphify
 * internals; graphify never imports h2a. h2a authors ALL content — graphify
 * validates, admits and projects, it authors no memory (hard gate §3.2).
 *
 * ANTI-CYCLE, MADE STRUCTURAL: this module imports NOTHING — no node builtins, no
 * storage, no source-grounding — so a consumer (h2a) that imports the port drags
 * in ZERO graphify runtime. That is the one-way edge, enforced by having no edge
 * at all to import. (Verified at build: `grep '^import' src/memory-producer-port.ts`
 * is empty.)
 *
 * IMPLEMENTATION binding (design-forward, reconciled at the merge train): the
 * concrete `admitMemoryNote`/`requestTombstone` live in `memory-admission.ts` with
 * an INJECTED storage/source dependency (`deps`), and recall in `memory-recall.ts`.
 * graphify binds them behind a `createMemoryProducer(internalDeps): MemoryProducerPort`
 * factory that closes over storage and exposes the `(…, ctx)` port below; h2a sees
 * only the ctx-carrying port, never the deps. The factory + storage wiring is the
 * §5 port cabling (gated on storage's authorized append surface).
 *
 * The port also carries the shared STRUCTURAL shape contract `validateMemoryNoteShape`,
 * a data-pure pre-flight h2a can run BEFORE dispatch: the same schema/enum, subject,
 * event-anchor, tenancy and retention checks the gate enforces, MINUS `verifyVerbatim`
 * (a citation check that needs source resolution, so it stays gate-side, §4). The
 * gate remains authoritative; this is a cheap local reject for malformed notes.
 */

/** Versioned like the M4 append capability: a consumer pins the contract it built against. */
export const MEMORY_PRODUCER_PORT_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Data-pure note shape (§3.1) — h2a builds the COMPLETE note.
// ---------------------------------------------------------------------------

export type MemoryKind = "context" | "decision" | "evidence";
export type MemoryScope = "private" | "capitalised";
/**
 * The canonical trust-tier union — the SINGLE source for the `trust` field
 * across the memory contract, ontology nodes (`OntologyNodeTrustTier` derives
 * from this), and agent-stats (§1). `earned` = ranked git ground-truth;
 * `asserted` = a gated `MemoryNote`; `signed` = Ed25519 identity (h2a, out of
 * scope here); `unverified` = provenance NOT established (e.g. h2a coordination
 * evidence) — a distinct tier, never folded into `asserted`, since that would
 * fabricate provenance the data does not carry (the M2 principle). Three lots
 * once spelled three vocabularies for this one field; this union is the one.
 */
export type TrustTier = "earned" | "asserted" | "signed" | "unverified";

/** The structural event anchor (§9.4) — what makes `event_shaped` a code check. */
export interface MemoryEventAnchor {
  /** The instant it happened (epoch-ms or turn count). REQUIRED — a generalization has none. */
  at: number;
  /**
   * A DESCRIPTIVE event-kind label (h2a's vocabulary), structurally required as a
   * non-empty string. It is NOT a gate-closed set: the load-bearing closure is
   * `memory_kind` {context,decision,evidence} (enforced), and the structural
   * anchor is the REQUIRED numeric `at`. (Doc corrected 2026-08-01: the earlier
   * "closed event-kind" wording over-claimed — the code checks PRESENCE, not
   * membership in a set. The ratified spec §9.4 carries the same over-claim in its
   * prose; flagged to memory + conductor for reconciliation, since the spec never
   * enumerates the set, so a closed check is not implementable as written.)
   */
  kind: string;
  /** A structured locator; the SAME handle as `provenance.source` (§9.4). */
  ref: string;
}

/** Structured citation (§4): a cited string + the named source it must appear in. */
export interface MemoryProvenance {
  cited: string;
  source: string;
}

/** The note handed over by h2a. h2a authors ALL of it (§9.4). */
export interface MemoryNoteInput {
  node_type: "MemoryNote";
  memory_kind: MemoryKind;
  /** `"agent-work"` or `"human:<id>"` only — never a persona/identity/voice (§3.3.1). */
  subject: string;
  t: number;
  t_end?: number;
  t_src: string;
  event: MemoryEventAnchor;
  provenance: MemoryProvenance;
  principal_owner: string;
  scope: MemoryScope;
  /** Required when `subject` is a human (§3.5). */
  purpose?: string;
  /** Retention/TTL bound; required when `subject` is a human (§3.5). */
  retention?: number | string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// The dispatch context — TENANCY on whose behalf h2a dispatches, NOT storage deps.
// ---------------------------------------------------------------------------

export interface MemoryContext {
  /** The principal on whose behalf h2a dispatches (part of the gate + partition). */
  principal_owner: string;
}

// ---------------------------------------------------------------------------
// Outcomes — discriminated, so a consumer branches without guessing.
// ---------------------------------------------------------------------------

export type AdmissionOutcome =
  | { admitted: true; id: string }
  | { admitted: false; reason: string };

export type PromotionOutcome =
  | { promoted: true; id: string }
  | { promoted: false; reason: string };

/** The D11 double-consensus travels by REFERENCE (locators), never a self-report (§9.4). */
export interface PromotionEvidence {
  leg1_verdict_ref: string;
  leg2_verdict_ref: string;
  independence_attestation: string;
}

export type TombstoneTarget =
  | { kind: "node"; id: string }
  | { kind: "edge"; source: string; target: string; relation?: string };

export interface TombstoneAuthorization {
  /** Who requests the erasure. */
  requester: string;
  /**
   * For a subject-human fact, a SIGNED authorization (Ed25519 of `principal_owner`
   * or a signed mandate, §9.4); its cryptographic verification is h2a's. Authority
   * never rests on a fabricable asserted `requester`.
   */
  signedAuthorization?: unknown;
}

export type TombstoneOutcome = { applied: boolean; reason?: string };

// ---------------------------------------------------------------------------
// THE PORT — the three entry points (§9.4). graphify implements; h2a codes against.
// ---------------------------------------------------------------------------

export interface MemoryProducerPort {
  /** Validate a caller-built note and, on pass, append it as `pending` (§9.4/§5). */
  admitMemoryNote(note: MemoryNoteInput, ctx: MemoryContext): Promise<AdmissionOutcome>;
  /** D11: promote a `pending` note on two independent verdict REFERENCES (§9.3). */
  promoteNote(noteId: string, evidence: PromotionEvidence, ctx: MemoryContext): Promise<PromotionOutcome>;
  /** Request an erasure; graphify keeps the `principal_owner` authority check (§3.5). */
  requestTombstone(
    target: TombstoneTarget,
    auth: TombstoneAuthorization,
    ctx: MemoryContext,
  ): Promise<TombstoneOutcome>;
}

// ---------------------------------------------------------------------------
// THE RECALL PORT (read-side, §3.3.3/§7) — the surface h2a's wake-recall codes
// against. graphify projects; h2a consumes. Data-pure signature (no import).
// ---------------------------------------------------------------------------

/** Exactly one of `asOf` (T6 point) or `window` (T5 span) is supplied. */
export interface MemoryRecallQuery {
  /** T6 point recall: the note must be live at this instant, `[asOf, asOf]`. */
  asOf?: number;
  /** T5 window recall: inclusive `[since, until]`; `null` leaves that side open. */
  window?: { sinceMs: number | null; untilMs: number | null };
}

/**
 * A recalled note as PROJECTED. The tier (`trust`, `review_status`) and `provenance`
 * are RETAINED (§1: every projection retains tier + provenance), so a `pending` note
 * is disclosed as pending and never dressed as ground truth. Carried verbatim beyond
 * these keys.
 */
export interface RecalledMemoryNoteView {
  id: string;
  node_type: "MemoryNote";
  memory_kind: MemoryKind;
  subject: string;
  t: number;
  t_end?: number;
  trust: TrustTier;
  review_status: string;
  scope: MemoryScope;
  principal_owner: string;
  provenance: MemoryProvenance;
  event: MemoryEventAnchor;
  [key: string]: unknown;
}

/**
 * The recall projection. `projection: "notes-only"` is the structural disclosure of
 * the projection prohibition (§3.3.3): individual notes, NEVER an assembled identity
 * profile. `freshness` discloses that the recall does not verify a store snapshot's
 * freshness (mirrors the T6 `unverified` disclosure); `unpaged` is the T6
 * no-silent-truncation contract.
 */
export interface MemoryRecallResultView {
  schema: string;
  notes: RecalledMemoryNoteView[];
  projection: "notes-only";
  requestingPrincipal: string;
  freshness: "unverified";
  unpaged: true;
}

/**
 * The recall entry point h2a codes against. Like the producer port it is
 * ctx-carrying (tenancy, NOT storage/graph deps): graphify binds the concrete pure
 * `recallMemory` (memory-recall.ts) behind a `createMemoryRecall(deps)` factory that
 * closes over the graph source + tombstone journal and exposes this ctx port. The
 * read-side enforces tenancy access (private ⇒ owner-only), tombstone fold-out and
 * the projection prohibition — graphify-side invariants, not the caller's to bypass.
 */
export interface MemoryRecallPort {
  recallMemory(query: MemoryRecallQuery, ctx: MemoryContext): Promise<MemoryRecallResultView>;
}

/** The whole memory port a consumer may depend on — write-side + read-side. */
export interface MemoryPort extends MemoryProducerPort, MemoryRecallPort {}

// ---------------------------------------------------------------------------
// The shared STRUCTURAL shape contract — a data-pure pre-flight (no citation).
// ---------------------------------------------------------------------------

export type ShapeCheck = { ok: true } | { ok: false; reason: string };

const MEMORY_KINDS = new Set<string>(["context", "decision", "evidence"]);
const MEMORY_SCOPES = new Set<string>(["private", "capitalised"]);

function isHumanSubject(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("human:") && s.length > "human:".length;
}
function isValidSubject(s: unknown): boolean {
  return s === "agent-work" || isHumanSubject(s);
}

function fail(reason: string): ShapeCheck {
  return { ok: false, reason };
}

/**
 * The data-pure structural predicate the port publishes (§3.1/§3.3/§3.6/§3.5).
 * It checks the FORM in the SAME order the gate does, MINUS the `verifyVerbatim`
 * citation (which needs source resolution — that stays authoritative and gate-side,
 * §4). A consumer runs this locally to reject a malformed note before dispatch; it
 * is NOT the admission decision (the gate re-checks and adds the citation verify).
 */
export function validateMemoryNoteShape(note: unknown): ShapeCheck {
  if (note === null || typeof note !== "object") return fail("note must be an object");
  const n = note as Record<string, unknown>;

  // 1. schema + closed enum (§3.1)
  if (n.node_type !== "MemoryNote") return fail("node_type must be 'MemoryNote'");
  if (!MEMORY_KINDS.has(n.memory_kind as string)) {
    return fail("memory_kind not in the closed enum {context,decision,evidence}");
  }

  // 2. subject predicate (§3.3.1)
  if (!isValidSubject(n.subject)) {
    return fail("subject must be 'agent-work' or 'human:<id>'");
  }

  // 3. event_shaped is STRUCTURAL (§3.3.2) — a machine anchor, not prose/flag.
  const ev = n.event;
  if (ev === null || typeof ev !== "object") return fail("event anchor is required (event_shaped is structural)");
  const anchor = ev as Record<string, unknown>;
  if (typeof anchor.at !== "number" || !Number.isFinite(anchor.at)) {
    return fail("event.at is required and must be numeric — a generalization has no instant");
  }
  if (typeof anchor.kind !== "string" || anchor.kind.length === 0) return fail("event.kind is required");
  if (typeof anchor.ref !== "string" || anchor.ref.length === 0) return fail("event.ref (locator) is required");

  // 4. tenancy (§3.6)
  if (typeof n.principal_owner !== "string" || n.principal_owner.length === 0) {
    return fail("principal_owner is required (§3.6)");
  }
  if (!MEMORY_SCOPES.has(n.scope as string)) return fail("scope must be 'private' or 'capitalised' (§3.6)");

  // 5. subject-human retention controls (§3.5)
  if (isHumanSubject(n.subject)) {
    if (typeof n.purpose !== "string" || n.purpose.length === 0) {
      return fail("a subject-human fact requires a `purpose` (§3.5)");
    }
    if (n.retention === undefined || n.retention === null) {
      return fail("a subject-human fact requires a `retention` bound (§3.5)");
    }
  }

  // 6. provenance SHAPE only — the citation is verified gate-side (§4), not here.
  const prov = n.provenance;
  if (prov === null || typeof prov !== "object") return fail("provenance {cited, source} is required (§4)");
  const p = prov as Record<string, unknown>;
  if (typeof p.cited !== "string" || typeof p.source !== "string") {
    return fail("provenance.cited and provenance.source must be strings (§4)");
  }

  return { ok: true };
}
