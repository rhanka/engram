/**
 * Agent-memory ADMISSION GATE — the graphify-side of the ratified contract
 * SPEC_AGENT_MEMORY_SUBSTRATE (@87a8cd05..d8a4a448, wire-shape §9.4).
 *
 * graphify DEFINES this gate; h2a imports only the SIGNATURE and never graphify
 * internals; this module imports NOTHING from h2a (anti-cycle). graphify authors
 * NO memory content — it VALIDATES a caller-built note and stamps the fixed
 * admission fields only.
 *
 * Perimeter (this module): the admission checks (§3.1 schema/enum; §3.3 persona
 * = subject + STRUCTURAL event_shaped + single-note/no-profile; §3.4
 * reconcilable:false; §3.5 subject-human retention + tombstone authority; §3.6
 * principal_owner/scope neutral hook; §4 verifyVerbatim citation). OUT of scope:
 * the storage write-path (injected as a dependency), the D11 promotion rule, and
 * the parked executive/projection logic (§3.6).
 *
 * Deterministic, provider-neutral, no LLM, no network.
 */
import { createHash } from "node:crypto";
import { normalizeForMatch, verifyVerbatim } from "./source-grounding.js";

export type MemoryKind = "context" | "decision" | "evidence";
export type MemoryScope = "private" | "capitalised";

/** The structural event anchor — what makes `event_shaped` a code check, not prose. */
export interface MemoryEventAnchor {
  /** The instant it happened (epoch-ms or turn count). REQUIRED — a generalization has none. */
  at: number;
  /** A DESCRIPTIVE event-kind aligned to `memory_kind` — required as a non-empty
   * string, NOT a gate-closed set (the closed, enforced enum is `memory_kind`). */
  kind: string;
  /** A structured locator, shared with `provenance.source`. */
  ref: string;
}

/** Structured citation: a cited string + the named source it must appear in (§4). */
export interface MemoryProvenance {
  cited: string;
  source: string;
}

/** The note handed over by the producer (h2a). h2a authors ALL of it. */
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

export interface AdmissionDeps {
  /** Resolve a source locator to its raw text for `verifyVerbatim`; `null` when unresolvable. */
  resolveSource: (ref: string) => string | null;
  /** The storage write-path (injected — anti-cycle + testable). Appends the admitted node. */
  appendNode: (node: Record<string, unknown>) => Promise<{ created: boolean }>;
}

export type AdmissionOutcome =
  | { admitted: true; id: string }
  | { admitted: false; reason: string };

const MEMORY_KINDS = new Set<string>(["context", "decision", "evidence"]);
const MEMORY_SCOPES = new Set<string>(["private", "capitalised"]);

function isHumanSubject(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("human:") && s.length > "human:".length;
}
function isValidSubject(s: unknown): boolean {
  return s === "agent-work" || isHumanSubject(s);
}

/**
 * Stable content-addressed id over the note's IDENTITY fields (deterministic, no
 * clock/random). It must distinguish notes that DIFFER, or the append upsert
 * silently overwrites one with the other (P0 F-A): a `context` and a `decision`
 * note sharing an anchor+citation are DISTINCT records, so `memory_kind`,
 * `event.kind`, `t_end`, `provenance.source` and `scope` all participate. The
 * volatile `[key:string]` extension (e.g. a signature) is deliberately EXCLUDED so
 * a re-admit of identical content stays idempotent (same content → same id).
 */
function memoryNoteId(note: MemoryNoteInput): string {
  const canonical = JSON.stringify([
    note.principal_owner,
    note.subject,
    note.memory_kind,
    note.t,
    note.t_end ?? null,
    note.event?.kind,
    note.event?.ref,
    note.event?.at,
    note.provenance?.cited,
    note.provenance?.source,
    note.scope,
  ]);
  return `mem:${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

function refuse(reason: string): AdmissionOutcome {
  return { admitted: false, reason };
}

/**
 * The admission gate. Runs the contract's checks IN ORDER; ALL must pass. On a
 * refusal, NOTHING is stored (no silent no-op). On success, stamps the fixed
 * admission fields and appends the note as `review_status: "pending"` (promotion
 * to `accepted` is the D11 gate — OUT of this perimeter).
 *
 * Single-note by construction: it admits ONE note and never assembles a
 * subject-human profile — the UserModel projection prohibition (§3.2/§3.3.3) is a
 * recall-surface invariant enforced separately (charter: temporal-recall).
 */
export async function admitMemoryNote(
  note: MemoryNoteInput,
  deps: AdmissionDeps,
): Promise<AdmissionOutcome> {
  // 1. schema + closed enum (§3.1)
  if (!note || note.node_type !== "MemoryNote") return refuse("node_type must be 'MemoryNote'");
  if (!MEMORY_KINDS.has(note.memory_kind)) {
    return refuse(`memory_kind not in the closed enum {context,decision,evidence}: ${String(note.memory_kind)}`);
  }

  // 2. persona: subject predicate (§3.3.1)
  if (!isValidSubject(note.subject)) {
    return refuse(`subject must be 'agent-work' or 'human:<id>', not ${String(note.subject)}`);
  }

  // 3. persona: event_shaped is STRUCTURAL (§3.3.2) — a machine-verifiable anchor,
  //    NOT a writer flag and NOT a prose classifier. A generalization has no `at`.
  const ev = note.event as MemoryEventAnchor | undefined;
  if (!ev || typeof ev !== "object") {
    return refuse("event anchor is required (event_shaped is structural, not prose)");
  }
  if (typeof ev.at !== "number" || !Number.isFinite(ev.at)) {
    return refuse("event.at (the instant it happened) is required and must be numeric — a generalization has no instant");
  }
  if (typeof ev.kind !== "string" || !ev.kind) return refuse("event.kind is required");
  if (typeof ev.ref !== "string" || !ev.ref) return refuse("event.ref (locator) is required");

  // 4. tenancy neutral hook (§3.6) — the FIELDS only, never the parked exec logic
  if (typeof note.principal_owner !== "string" || !note.principal_owner) {
    return refuse("principal_owner is required (§3.6)");
  }
  if (!MEMORY_SCOPES.has(note.scope)) {
    return refuse(`scope must be 'private' or 'capitalised', not ${String(note.scope)}`);
  }

  // 5. retention controls for a subject-human fact (§3.5)
  if (isHumanSubject(note.subject)) {
    if (typeof note.purpose !== "string" || !note.purpose) {
      return refuse("a subject-human fact requires a `purpose` (§3.5)");
    }
    if (note.retention === undefined || note.retention === null) {
      return refuse("a subject-human fact requires a `retention` bound (§3.5)");
    }
  }

  // 6. citation gate — verifyVerbatim ONLY (§4): the cited string must be literally
  //    present in the named source. This checks the citation, NOT the form (§3.3)
  //    and NOT the truth of the lesson.
  const prov = note.provenance;
  if (!prov || typeof prov.cited !== "string" || typeof prov.source !== "string") {
    return refuse("provenance {cited, source} is required (§4)");
  }
  const raw = deps.resolveSource(prov.source);
  if (raw == null) return refuse(`provenance source could not be resolved: ${prov.source}`);
  if (!verifyVerbatim(prov.cited, normalizeForMatch(raw))) {
    return refuse("citation failed verifyVerbatim: the cited string is not present in the named source");
  }

  // All checks passed — stamp the fixed admission fields (graphify authors nothing else).
  const id = memoryNoteId(note);
  const admitted: Record<string, unknown> = {
    ...note,
    id,
    trust: "asserted", // fixed tier (§1/§3.1)
    review_status: "pending", // enters behind the binary gate; promotion is OUT of this perimeter (D11)
    reconcilable: false, // opt-out by construction (§3.4)
  };
  await deps.appendNode(admitted);
  return { admitted: true, id };
}

// ---------------------------------------------------------------------------
// Tombstone authority hook (§3.5) — the CHECK is graphify's; the append is
// storage's write-path (injected, OUT of this perimeter).
// ---------------------------------------------------------------------------

export type TombstoneTarget =
  | { kind: "node"; id: string }
  | { kind: "edge"; source: string; target: string; relation?: string };

export interface TombstoneRequest {
  target: TombstoneTarget;
  /** The principal that owns the target being erased. */
  principal_owner: string;
}

export interface TombstoneAuthority {
  /** Who requests the erasure. */
  requester: string;
  /**
   * For a subject-human fact, a SIGNED authorization (Ed25519 of the
   * `principal_owner` or a signed mandate) is required (§9.4); its cryptographic
   * verification is the caller's (h2a) — this gate checks ownership.
   */
  signedAuthorization?: unknown;
}

export interface TombstoneDeps {
  appendTombstone: (tombstone: { target: TombstoneTarget; principal_owner: string }) => Promise<{ applied: boolean }>;
}

/**
 * Authority check for an erasure (§3.5): only the `principal_owner` (or an agent
 * it MANDATES) may erase. graphify KEEPS this check; the actual tombstone append
 * is storage's write-path (injected). Authority never rests on a fabricable
 * asserted `by`.
 */
export async function requestTombstone(
  req: TombstoneRequest,
  auth: TombstoneAuthority,
  deps: TombstoneDeps,
): Promise<{ applied: boolean; reason?: string }> {
  const ownerAuthorised = auth.requester === req.principal_owner; // mandated-agent path: future
  if (!ownerAuthorised) {
    return { applied: false, reason: "erasure requires the principal_owner (or a mandated agent)" };
  }
  return deps.appendTombstone({ target: req.target, principal_owner: req.principal_owner });
}
