import {
  validateRawSessionEventEnvelope,
  validateSessionExtractionProposalBatch,
  type ExtractedCandidateItem,
  type RawSessionEventEnvelope,
  type RawSessionEventReceipt,
  type SessionContextPolicyV1,
  type SessionExtractionProposalBatch,
  type SessionExtractionReceipt,
} from "../session-front-contracts.js";
import type { SessionContextEngineKeyV1, SessionContextEngineV1 } from "../session-context/engine.js";
import {
  createSessionFrontEngineV1,
  type SessionFrontCandidateV1,
  type SessionFrontDeliveryV1,
  type SessionFrontEventInputV1,
  type SessionFrontExtractionInputV1,
  type SessionFrontScopeV1,
  type SessionFrontStoreV1,
} from "../../engram-memory/dist/session-front-engine.js";
import { receiptDigest } from "../../engram-memory/dist/digests.js";
import type { MemoryErrorV1, Result } from "../../engram-memory/dist/contracts/index.js";

export interface SessionFrontReadySlicesV1 {
  readonly readySlices: ReadonlyArray<"track" | "git" | "architecture" | "rules" | "memory">;
  readonly readySlicePayloads?: Partial<Record<"track" | "git" | "architecture" | "rules" | "memory", string>>;
  readonly syncState?: "synced" | "queued-degraded" | "local-only";
  readonly degradedBanner?: string;
}

export interface EngramSessionIngestFrontOptionsV1 {
  readonly store: SessionFrontStoreV1;
  readonly authorize: (input: {
    readonly input: RawSessionEventEnvelope | SessionExtractionProposalBatch;
  }) => Promise<Result<{ readonly hasMemoryIdentity: boolean }>> | Result<{ readonly hasMemoryIdentity: boolean }>;
  readonly getReadySlices: () => Promise<SessionFrontReadySlicesV1> | SessionFrontReadySlicesV1;
  readonly screenCandidate: (input: {
    readonly candidate: ExtractedCandidateItem;
  }) => Promise<Result<"allow" | "withheld">> | Result<"allow" | "withheld">;
  readonly clock?: { now(): number };
  readonly journalPolicy?:
    | Partial<SessionContextPolicyV1>
    | ((scope: SessionFrontScopeV1) => Promise<Partial<SessionContextPolicyV1> | undefined> | Partial<SessionContextPolicyV1> | undefined);
  readonly contextEngine?: SessionContextEngineV1;
}

const KNOWN_SLICES = ["track", "git", "architecture", "rules", "memory"] as const;
type KnownSlice = (typeof KNOWN_SLICES)[number];

function isKnownSlice(value: unknown): value is KnownSlice {
  return typeof value === "string" && (KNOWN_SLICES as readonly string[]).includes(value);
}

function fail(code: MemoryErrorV1["code"], message: string, retryable = false): Result<never> {
  return { ok: false, error: { operation: "capture", code, message, retryable } };
}

function refusedIdentity(): Result<never> {
  return fail("UNAUTHORIZED", "Session write requires a verified memory identity.");
}

function checkDeadline(deadlineAt: string, clock: EngramSessionIngestFrontOptionsV1["clock"]): Result<never> | undefined {
  if (clock === undefined) return undefined;
  let now: number;
  try {
    now = clock.now();
  } catch {
    return fail("STORE_UNAVAILABLE", "Session front clock is unavailable.", true);
  }
  if (!Number.isFinite(now)) {
    return fail("STORE_UNAVAILABLE", "Session front clock is unavailable.", true);
  }
  if (Date.parse(deadlineAt) <= now) {
    return fail("DEADLINE_EXCEEDED", "Session write arrived after deadlineAt.");
  }
  return undefined;
}

async function checkIdentity(
  authorize: EngramSessionIngestFrontOptionsV1["authorize"],
  input: RawSessionEventEnvelope | SessionExtractionProposalBatch,
): Promise<Result<never> | undefined> {
  let decision: Result<{ readonly hasMemoryIdentity: boolean }>;
  try {
    decision = await authorize({ input });
  } catch {
    return refusedIdentity();
  }
  if (!decision.ok || decision.value.hasMemoryIdentity !== true) {
    return refusedIdentity();
  }
  return undefined;
}

interface ResolvedDelivery {
  readonly readySlices: readonly KnownSlice[];
  readonly readySlicePayloads?: Partial<Record<KnownSlice, string>>;
  readonly delivery: SessionFrontDeliveryV1;
}

async function resolveDelivery(
  getReadySlices: EngramSessionIngestFrontOptionsV1["getReadySlices"],
): Promise<Result<ResolvedDelivery>> {
  let provided: SessionFrontReadySlicesV1;
  try {
    provided = await getReadySlices();
  } catch {
    return fail("STORE_UNAVAILABLE", "Ready slices are unavailable.", true);
  }
  if (provided === null || typeof provided !== "object" || !Array.isArray(provided.readySlices)) {
    return fail("INVALID_SCHEMA", "Ready slices provider returned an invalid shape.");
  }
  const readySlices = [...new Set(provided.readySlices)].filter(isKnownSlice);
  let readySlicePayloads: Partial<Record<KnownSlice, string>> | undefined;
  const payloads = provided.readySlicePayloads;
  if (payloads !== undefined && payloads !== null && typeof payloads === "object") {
    const filtered: Partial<Record<KnownSlice, string>> = {};
    for (const key of readySlices) {
      const text = (payloads as Partial<Record<string, unknown>>)[key];
      if (typeof text === "string") filtered[key] = text;
    }
    if (Object.keys(filtered).length > 0) readySlicePayloads = filtered;
  }
  const syncState = provided.syncState ?? "synced";
  if (syncState !== "synced" && syncState !== "queued-degraded" && syncState !== "local-only") {
    return fail("INVALID_SCHEMA", "Ready slices provider returned an unknown sync state.");
  }
  if (syncState === "queued-degraded") {
    const banner = provided.degradedBanner;
    if (typeof banner !== "string" || banner.length === 0) {
      return fail("INVALID_SCHEMA", "Degraded mode requires a user-visible banner.");
    }
    return { ok: true, value: { readySlices, ...(readySlicePayloads && { readySlicePayloads }), delivery: { syncState, degradedBanner: banner } } };
  }
  return { ok: true, value: { readySlices, ...(readySlicePayloads && { readySlicePayloads }), delivery: { syncState } } };
}

function payloadCitation(payload: RawSessionEventEnvelope["payload"]): SessionFrontEventInputV1["citation"] {
  switch (payload.kind) {
    case "speech_turn":
    case "tool_result":
      return { ...payload.sessionCitation };
    case "file_ref":
      return payload.sessionCitation === undefined ? undefined : { ...payload.sessionCitation };
    default:
      return undefined;
  }
}

function envelopeKey(body: RawSessionEventEnvelope): SessionContextEngineKeyV1 {
  return {
    tenantId: body.tenantId,
    workspaceId: body.workspaceId,
    derivedWorktreeId: body.derivedWorktreeId,
    ...(body.mandateRef !== null && typeof body.mandateRef.role === "string"
      ? { roleRef: body.mandateRef.role }
      : {}),
    sessionId: body.sessionPseudoId,
  };
}

async function checkJournalEnabled(
  options: EngramSessionIngestFrontOptionsV1,
  scope: SessionFrontScopeV1,
  hasRequest: boolean,
): Promise<Result<never> | undefined> {
  const unavailable = (): Result<never> =>
    fail("CAPABILITY_UNAVAILABLE", "Session journal is not enabled for this workspace.");
  if (options.journalPolicy === undefined) {
    return options.contextEngine !== undefined || hasRequest ? unavailable() : undefined;
  }
  try {
    const policy =
      typeof options.journalPolicy === "function"
        ? await options.journalPolicy({ ...scope })
        : options.journalPolicy;
    if (
      policy !== null &&
      typeof policy === "object" &&
      !Array.isArray(policy) &&
      policy.journalEnabled === true &&
      (!hasRequest || options.contextEngine !== undefined)
    ) {
      return undefined;
    }
    return unavailable();
  } catch {
    return unavailable();
  }
}

/**
 * Product adapter implementing `EngramSessionIngestFrontPort` over the neutral
 * L0 engine. The store travels through the injected port; this module keeps no
 * native, database, or model-SDK import.
 */
export function createEngramSessionIngestFront(options: EngramSessionIngestFrontOptionsV1) {
  const engine = createSessionFrontEngineV1(options.store);
  return {
    async recordSessionEvent(envelope: RawSessionEventEnvelope): Promise<Result<RawSessionEventReceipt>> {
      try {
        const valid = validateRawSessionEventEnvelope(envelope);
        if (!valid.ok) return valid;
        const late = checkDeadline(valid.value.deadlineAt, options.clock);
        if (late) return late;
        const identity = await checkIdentity(options.authorize, valid.value);
        if (identity) return identity;
        const body = valid.value;
        const disabled = await checkJournalEnabled(
          options,
          { tenantId: body.tenantId, workspaceId: body.workspaceId },
          body.contextRequest !== undefined,
        );
        if (disabled) return disabled;
        const slices = await resolveDelivery(options.getReadySlices);
        if (!slices.ok) return slices;
        const key = options.contextEngine ? envelopeKey(body) : undefined;
        const preparedQuery =
          body.contextRequest !== undefined && options.contextEngine && key
            ? await options.contextEngine.prepareQuery(key)
            : undefined;
        const contextQuery = preparedQuery
          ? { queryId: preparedQuery.queryId, queryVersion: preparedQuery.version }
          : undefined;
        const citation = payloadCitation(body.payload);
        const input: SessionFrontEventInputV1 = {
          scope: { tenantId: body.tenantId, workspaceId: body.workspaceId },
          idempotencyKey: body.idempotencyKey,
          worktreeId: body.derivedWorktreeId,
          sessionRef: body.sessionPseudoId,
          purposeRef: body.purposeRef,
          retention: body.retention,
          actorRef: body.actorPseudoId,
          cloneId: body.cloneId,
          assignmentDigest: body.mandateRef === null ? null : receiptDigest("session-mandate", { ...body.mandateRef }),
          occurredAt: body.occurredAt,
          payload: body.payload,
          ...(citation !== undefined && { citation }),
          ...(body.payload.kind === "speech_turn" && body.payload.boundedTurnText !== undefined && {
            text: body.payload.boundedTurnText,
          }),
          ...(body.payload.kind === "speech_turn" && body.payload.truncatedInProjection !== undefined && {
            truncatedInProjection: body.payload.truncatedInProjection,
          }),
          ...(body.contextRequest !== undefined && {
            contextRequest: body.contextRequest as unknown as Readonly<Record<string, unknown>>,
          }),
          queueExtraction: body.payload.kind === "speech_turn"
            ? body.payload.triggerTurnSweep
            : body.payload.kind === "context_saturation",
        };
        const recorded = await engine.recordEvent(input, slices.value.delivery, contextQuery);
        if (!recorded.ok) return recorded;
        const receipt = recorded.value;
        if (options.contextEngine && key) {
          await options.contextEngine.noteSessionEvent(key);
        }
        const delivered =
          body.contextRequest !== undefined && options.contextEngine
            ? await options.contextEngine.recomputeDelivery({
                scope: input.scope,
                eventRecordId: receipt.eventRecordId,
              })
            : undefined;
        if (delivered && !delivered.ok) return delivered;
        const readySlices = delivered
          ? delivered.value.readySlices
          : options.contextEngine
            ? []
            : slices.value.readySlices;
        const readySlicePayloads = delivered
          ? delivered.value.readySlicePayloads
          : options.contextEngine
            ? undefined
            : slices.value.readySlicePayloads;
        return {
          ok: true,
          value: {
            status: receipt.status,
            eventRecordId: receipt.eventRecordId,
            recordDigest: receipt.recordDigest,
            cursor: receipt.cursor,
            extractionDisposition: receipt.extractionDisposition,
            syncState: slices.value.delivery.syncState,
            ...(slices.value.delivery.syncState === "queued-degraded" && {
              degradedBanner: slices.value.delivery.degradedBanner,
            }),
            readySlices: [...readySlices],
            ...(readySlicePayloads && { readySlicePayloads: { ...readySlicePayloads } }),
            ...(delivered && { contextDelivery: delivered.value.contextDelivery }),
            h2aProactiveRoleAnalysisQueued: receipt.roleAnalysisQueued,
            extractionSweepScheduled: receipt.extractionSweepScheduled,
            transactionReceiptDigest: receipt.transactionReceiptDigest,
          },
        };
      } catch {
        return fail("STORE_UNAVAILABLE", "Session front could not complete the write.", true);
      }
    },

    async recordExtraction(batch: SessionExtractionProposalBatch): Promise<Result<SessionExtractionReceipt>> {
      try {
        const valid = validateSessionExtractionProposalBatch(batch);
        if (!valid.ok) return valid;
        const late = checkDeadline(valid.value.deadlineAt, options.clock);
        if (late) return late;
        const identity = await checkIdentity(options.authorize, valid.value);
        if (identity) return identity;
        const body = valid.value;
        const disabled = await checkJournalEnabled(options, { tenantId: body.tenantId, workspaceId: body.workspaceId }, false);
        if (disabled) return disabled;
        const input: SessionFrontExtractionInputV1<SessionFrontCandidateV1> = {
          scope: { tenantId: body.tenantId, workspaceId: body.workspaceId },
          idempotencyKey: body.idempotencyKey,
          worktreeId: body.derivedWorktreeId,
          sessionRef: body.sessionPseudoId,
          purposeRef: body.purposeRef,
          retention: body.retention,
          sourceEventRecordIds: [...body.sourceEventRecordIds],
          extractor: { ...body.extractor },
          candidates: body.candidates.map((candidate) => ({ ...candidate })),
        };
        const verdicts = new Map<string, "allow" | "withheld">();
        for (const candidate of body.candidates) {
          let screened: Result<"allow" | "withheld">;
          try {
            screened = await options.screenCandidate({ candidate });
          } catch {
            return fail("STORE_UNAVAILABLE", "Candidate screening is unavailable.", true);
          }
          if (!screened.ok) return screened;
          if (screened.value !== "allow" && screened.value !== "withheld") {
            return fail("INVALID_SCHEMA", "Candidate screening returned an unexpected verdict.");
          }
          verdicts.set(candidate.localCandidateKey, screened.value);
        }
        const committed = await engine.recordExtraction(input, (candidate) => ({
          ok: true as const,
          value: verdicts.get(candidate.localCandidateKey) ?? ("withheld" as const),
        }));
        if (!committed.ok) return committed;
        const receipt = committed.value;
        if (options.contextEngine && receipt.annotatedThroughOrdinal !== undefined) {
          options.contextEngine.noteShadowAnnotated(
            {
              tenantId: body.tenantId,
              workspaceId: body.workspaceId,
              derivedWorktreeId: body.derivedWorktreeId,
              sessionId: body.sessionPseudoId,
            },
            receipt.annotatedThroughOrdinal,
            receipt.batchCursor,
          );
        }
        return {
          ok: true,
          value: {
            status: receipt.status,
            batchCursor: receipt.batchCursor,
            outcomes: receipt.outcomes.map((outcome) => ({
              localCandidateKey: outcome.localCandidateKey,
              candidateId: outcome.candidateId,
              domain: outcome.domain,
              reviewStatus: "proposed" as const,
              verdictAuthority: outcome.domain === "harness" ? ("h2a" as const) : ("track" as const),
              recordDigest: outcome.recordDigest,
            })),
            d7BlockedKeys: [...receipt.d7BlockedKeys],
            sourceDispositions: { ...receipt.sourceDispositions },
            transactionReceiptDigest: receipt.transactionReceiptDigest,
          },
        };
      } catch {
        return fail("STORE_UNAVAILABLE", "Session front could not complete the write.", true);
      }
    },
  };
}
