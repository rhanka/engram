import type { Cursor, Digest, Instant, MemoryErrorCode, Result, RetentionV1 } from "./contracts/index.js";
import { CanonicalJsonError } from "./canonical-json.js";
import { receiptDigest, recordIdFromDigest } from "./digests.js";
import { isCanonicalCursor } from "./validation.js";

export interface SessionFrontScopeV1 {
  readonly tenantId: string;
  readonly workspaceId: string;
}

export interface SessionFrontCitationV1 {
  readonly sessionId: string;
  readonly entryId: string;
  readonly ordinal: number;
  readonly contentDigest: Digest;
  readonly branchEpoch?: number;
  readonly parentEntryId?: string;
}

export type SessionFrontDispositionV1 = "pending_extraction" | "proposed" | "empty_verified" | "withheld_d7";
type TerminalDisposition = Exclude<SessionFrontDispositionV1, "pending_extraction">;

interface SessionFrontWrite {
  readonly scope: SessionFrontScopeV1;
  readonly idempotencyKey: string;
  readonly worktreeId: string;
  readonly sessionRef: string;
  readonly purposeRef: string;
  readonly retention: RetentionV1;
}

interface EventBody extends SessionFrontWrite {
  readonly actorRef: string;
  readonly cloneId: string;
  readonly assignmentDigest: Digest | null;
  readonly occurredAt: Instant;
  readonly payload: Readonly<Record<string, unknown>> & { readonly kind: string };
  readonly citation?: SessionFrontCitationV1;
}

export interface SessionFrontEventInputV1 extends EventBody {
  readonly text?: string;
  readonly truncatedInProjection?: boolean;
  readonly queueExtraction: boolean;
}

export type SessionFrontDeliveryV1 =
  | { readonly syncState: "synced" | "local-only" }
  | { readonly syncState: "queued-degraded"; readonly degradedBanner: string };

export interface SessionFrontEventReceiptV1 {
  readonly status: "recorded" | "duplicate_exact";
  readonly eventRecordId: string;
  readonly recordDigest: Digest;
  readonly cursor: Cursor;
  readonly extractionDisposition: SessionFrontDispositionV1;
  readonly delivery: SessionFrontDeliveryV1;
  readonly roleAnalysisQueued: boolean;
  readonly extractionSweepScheduled: boolean;
  readonly transactionReceiptDigest: Digest;
}

export interface SessionFrontCandidateV1 extends Readonly<Record<string, unknown>> {
  readonly localCandidateKey: string;
  readonly domain: "project" | "harness";
  readonly sourceEventRecordIds: readonly string[];
}

export interface SessionFrontExtractionInputV1<Candidate extends SessionFrontCandidateV1> extends SessionFrontWrite {
  readonly sourceEventRecordIds: readonly string[];
  readonly extractor: Readonly<Record<string, string>>;
  readonly candidates: readonly Candidate[];
}

export interface SessionFrontExtractionReceiptV1 {
  readonly status: "committed" | "duplicate_exact";
  readonly batchCursor: Cursor;
  readonly outcomes: readonly {
    readonly localCandidateKey: string;
    readonly candidateId: string;
    readonly domain: SessionFrontCandidateV1["domain"];
    readonly recordDigest: Digest;
  }[];
  readonly d7BlockedKeys: readonly string[];
  readonly sourceDispositions: Readonly<Record<string, TerminalDisposition>>;
  readonly transactionReceiptDigest: Digest;
}

interface CommitIdentity {
  readonly scope: SessionFrontScopeV1;
  readonly idempotencyKey: string;
  readonly inputDigest: Digest;
}

type EventCommit = CommitIdentity & {
  readonly kind: "event";
  readonly event: EventBody;
  readonly turnText?: {
    readonly citation: SessionFrontCitationV1;
    readonly text: string;
    readonly truncatedInProjection: boolean;
  };
  /** Advance the scope's session/branch high-water mark using max in the same commit. */
  readonly ordinal?: { readonly sessionId: string; readonly branchEpoch: number; readonly throughOrdinal: number };
  readonly receipt: SessionFrontEventReceiptV1;
};

type ExtractionCommit = CommitIdentity & {
  readonly kind: "extraction";
  readonly extraction: Omit<SessionFrontExtractionInputV1<SessionFrontCandidateV1>, "candidates">;
  readonly candidates: readonly SessionFrontCandidateV1[];
  readonly receipt: SessionFrontExtractionReceiptV1;
};

export type SessionFrontCommitV1 = EventCommit | ExtractionCommit;
type Replay = Pick<EventCommit, "kind" | "inputDigest" | "receipt"> | Pick<ExtractionCommit, "kind" | "inputDigest" | "receipt">;

export interface SessionFrontTransactionV1 {
  /** Next write cursor in this transaction. Read-only transactions do not advance it. */
  readonly cursor: Cursor;
  readReplay(kind: Replay["kind"], idempotencyKey: string): Promise<Replay | undefined>;
  /** Return only the scope and disposition of an already-committed event, including other scopes. */
  readEvent(eventRecordId: string): Promise<{
    readonly scope: SessionFrontScopeV1;
    readonly disposition: SessionFrontDispositionV1;
  } | undefined>;
  /**
   * Stage a canonical commit. The same write includes the replay receipt, source disposition updates,
   * ordinal advance, and any required sync outbox or post-commit signals from the receipt.
   */
  write(commit: SessionFrontCommitV1): Promise<void>;
}

export interface SessionFrontStoreV1 {
  /**
   * Run against one consistent view and serialize conflicting writes. Commit staged work only if
   * apply succeeds, and return its value only once the commit is durable.
   */
  transact<T>(scope: SessionFrontScopeV1, apply: (transaction: SessionFrontTransactionV1) => Promise<Result<T>>): Promise<Result<T>>;
}

function refuse(code: MemoryErrorCode, message: string): Result<never> {
  return { ok: false, error: { operation: "capture", code, message, retryable: code === "STORE_UNAVAILABLE" } };
}

function recordIdentity(prefix: string, digest: Digest): string {
  return prefix + recordIdFromDigest(digest).slice("mem_".length);
}

function boundedText(text: string): { text: string; truncatedInProjection: boolean } {
  const { read } = new TextEncoder().encodeInto(text, new Uint8Array(65_536));
  return { text: text.slice(0, read), truncatedInProjection: read < text.length };
}

/**
 * Drop explicit `undefined` values from optional properties before canonical
 * hashing. Under `exactOptionalPropertyTypes: false` a caller may pass
 * `citation: undefined`; `normalizeCanonicalJson` rejects `undefined`, so the
 * engine strips it instead of throwing past the `Promise<Result<...>>`
 * boundary.
 */
function stripUndefined<T>(value: T, seen = new WeakSet<object>()): T {
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new CanonicalJsonError("cyclic value is not JSON");
    seen.add(value);
    const out = value.map((item) => stripUndefined(item, seen));
    seen.delete(value);
    return out as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    if (seen.has(value)) throw new CanonicalJsonError("cyclic value is not JSON");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    if (Object.getOwnPropertySymbols(value).length > 0) return value;
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = stripUndefined(item, seen);
    }
    seen.delete(value);
    return out as T;
  }
  return value;
}

async function transact<T>(
  store: SessionFrontStoreV1,
  scope: SessionFrontScopeV1,
  apply: (transaction: SessionFrontTransactionV1) => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    return await store.transact(scope, apply);
  } catch (error) {
    if (error instanceof CanonicalJsonError) {
      return refuse("INVALID_SCHEMA", "Session-front input is not canonical JSON.");
    }
    return refuse("STORE_UNAVAILABLE", "Session storage could not complete the transaction.");
  }
}

function checkCursor(tx: SessionFrontTransactionV1): Result<never> | undefined {
  if (!isCanonicalCursor(tx.cursor)) {
    return refuse("STORE_UNAVAILABLE", "Session storage returned a non-canonical cursor.");
  }
  return undefined;
}

export function createSessionFrontEngineV1(store: SessionFrontStoreV1) {
  return {
    async recordEvent(input: SessionFrontEventInputV1, delivery: SessionFrontDeliveryV1): Promise<Result<SessionFrontEventReceiptV1>> {
      let cleaned: SessionFrontEventInputV1;
      let inputDigest: Digest;
      try {
        cleaned = stripUndefined(input);
        const { deliveryPath: _deliveryPath, ...speech } = cleaned.payload;
        inputDigest = receiptDigest("session-event-input", {
          ...cleaned,
          // A CLI may flush the same source entry by either hook or poll.
          payload: cleaned.payload.kind === "speech_turn" ? speech : cleaned.payload,
        });
      } catch (error) {
        if (error instanceof CanonicalJsonError) {
          return refuse("INVALID_SCHEMA", "Session-front input is not canonical JSON.");
        }
        throw error;
      }
      const { text, truncatedInProjection, queueExtraction, ...event } = cleaned;
      const committedText = event.citation && text !== undefined ? {
        ...boundedText(text), citation: event.citation,
      } : undefined;
      const turnText = committedText && {
        ...committedText,
        truncatedInProjection: committedText.truncatedInProjection || truncatedInProjection === true,
      };
      const ordinal = event.citation && {
        sessionId: event.citation.sessionId,
        branchEpoch: event.citation.branchEpoch ?? 0,
        throughOrdinal: event.citation.ordinal,
      };
      const { scope, idempotencyKey } = event;
      // The canonical digest preimage excludes the operational delivery path
      // and never retains unbounded turn text: only the bounded `turnText`
      // projection is hashed and committed. The stored commit keeps the
      // delivery path as operational metadata but drops `boundedTurnText` /
      // `truncatedInProjection` from the payload so `> 64 KiB` text never
      // persists in `commit.event`.
      let commitPayload: EventBody["payload"] = event.payload;
      let digestPayload: EventBody["payload"] = event.payload;
      if (event.payload.kind === "speech_turn") {
        const { boundedTurnText: _bounded, truncatedInProjection: _truncated, ...withoutText } = event.payload;
        commitPayload = withoutText;
        const { deliveryPath: _delivery, ...withoutDelivery } = withoutText;
        digestPayload = withoutDelivery;
      }
      return transact<SessionFrontEventReceiptV1>(store, scope, async (tx) => {
        const badCursor = checkCursor(tx);
        if (badCursor) return badCursor;
        const previous = await tx.readReplay("event", idempotencyKey);
        if (previous) {
          if (previous.kind !== "event" || previous.inputDigest !== inputDigest) {
            return refuse("DIGEST_CONFLICT", "The key already identifies a different session event.");
          }
          return { ok: true, value: { ...previous.receipt, status: "duplicate_exact" } };
        }
        const recordDigest = receiptDigest("raw-event", { event: { ...event, payload: digestPayload }, ...(turnText && { turnText }) });
        const body = {
          status: "recorded" as const,
          eventRecordId: recordIdentity("raw_", recordDigest),
          recordDigest,
          cursor: tx.cursor,
          extractionDisposition: "pending_extraction" as const,
          delivery,
          roleAnalysisQueued: event.assignmentDigest === null,
          extractionSweepScheduled: queueExtraction,
        };
        const receipt = { ...body, transactionReceiptDigest: receiptDigest("session-event-commit", body) };
        await tx.write({
          kind: "event", scope, idempotencyKey, inputDigest,
          event: { ...event, payload: commitPayload }, receipt,
          ...(turnText && { turnText }), ...(ordinal && { ordinal }),
        });
        return { ok: true, value: receipt };
      });
    },

    async recordExtraction<Candidate extends SessionFrontCandidateV1>(
      input: SessionFrontExtractionInputV1<Candidate>,
      screen: (candidate: Candidate) => Result<"allow" | "withheld">,
    ): Promise<Result<SessionFrontExtractionReceiptV1>> {
      let cleaned: SessionFrontExtractionInputV1<Candidate>;
      let inputDigest: Digest;
      try {
        cleaned = stripUndefined(input);
        inputDigest = receiptDigest("session-extraction-input", { ...cleaned });
      } catch (error) {
        if (error instanceof CanonicalJsonError) {
          return refuse("INVALID_SCHEMA", "Session-front input is not canonical JSON.");
        }
        throw error;
      }
      const { candidates, ...extraction } = cleaned;
      const { scope, idempotencyKey } = extraction;
      return transact<SessionFrontExtractionReceiptV1>(store, scope, async (tx) => {
        const badCursor = checkCursor(tx);
        if (badCursor) return badCursor;
        const previous = await tx.readReplay("extraction", idempotencyKey);
        if (previous) {
          if (previous.kind !== "extraction" || previous.inputDigest !== inputDigest) {
            return refuse("DIGEST_CONFLICT", "The key already identifies a different extraction batch.");
          }
          return { ok: true, value: { ...previous.receipt, status: "duplicate_exact" } };
        }
        const ids = new Set([...cleaned.sourceEventRecordIds, ...candidates.flatMap((candidate) => candidate.sourceEventRecordIds)]);
        const sources = new Map<string, TerminalDisposition>();
        for (const id of ids) {
          const record = await tx.readEvent(id);
          if (!record) return refuse("NOT_FOUND", "An extraction source is not committed.");
          if (record.scope.tenantId !== scope.tenantId || record.scope.workspaceId !== scope.workspaceId) {
            return refuse("UNAUTHORIZED", "An extraction source is outside the authorized scope.");
          }
          sources.set(id, record.disposition === "pending_extraction" ? "empty_verified" : record.disposition);
        }

        const allowed: Candidate[] = [];
        const outcomes: SessionFrontExtractionReceiptV1["outcomes"][number][] = [];
        const d7BlockedKeys: string[] = [];
        for (const candidate of candidates) {
          const screened = screen(candidate);
          if (!screened.ok) return screened;
          if (screened.value === "withheld") {
            d7BlockedKeys.push(candidate.localCandidateKey);
            for (const id of candidate.sourceEventRecordIds) {
              if (sources.get(id) !== "proposed") sources.set(id, "withheld_d7");
            }
            continue;
          }
          if (screened.value !== "allow") {
            return refuse("INVALID_SCHEMA", "Candidate screening returned an unexpected verdict.");
          }
          allowed.push(candidate);
          for (const id of candidate.sourceEventRecordIds) sources.set(id, "proposed");
          const recordDigest = receiptDigest("session-extraction-candidate", { extraction, candidate });
          outcomes.push({
            localCandidateKey: candidate.localCandidateKey,
            candidateId: recordIdentity("candidate_", recordDigest),
            domain: candidate.domain,
            recordDigest,
          });
        }
        const body = {
          status: "committed" as const,
          batchCursor: tx.cursor,
          outcomes,
          d7BlockedKeys,
          sourceDispositions: Object.fromEntries(sources),
        };
        const receipt = { ...body, transactionReceiptDigest: receiptDigest("session-extraction-commit", body) };
        await tx.write({ kind: "extraction", scope, idempotencyKey, inputDigest, extraction, candidates: allowed, receipt });
        return { ok: true, value: receipt };
      });
    },
  };
}
