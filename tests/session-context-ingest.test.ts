import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CanonicalJsonError } from "../engram-memory/dist/canonical-json.js";
import { buildBoundedCurrentProjectionV1 } from "../engram-memory/bounded-projection.js";
import {
  createSessionFrontEngineV1,
  type SessionFrontCommitV1,
  type SessionFrontStoreV1,
  type SessionFrontTransactionV1,
} from "../engram-memory/session-front-engine.js";
import { createGraph, serializeGraph } from "../src/graph.js";
import { assembleMemoryGraphProjection, attachMemoryProjectionToGraph } from "../src/graph-memory-projection.js";
import {
  createSessionContextEngineV1,
  type SessionContextEngineKeyV1,
} from "../src/session-context/engine.js";
import {
  createEngramSessionIngestFront,
  deriveSessionFrontIdempotencyKey,
  validateRawSessionEventEnvelope,
  type EngramSessionIngestFrontOptionsV1,
  type RawSessionEventEnvelope,
  type RawSessionEventPayload,
  type SessionContextQueryV1,
  type SessionContextRequestV1,
  type SessionDbCitationTuple,
  type SessionExtractionProposalBatch,
  type Sha256Digest,
} from "../src/session-front-contracts.js";

const TENANT_ID = "tenant-sj2a";
const WORKSPACE_ID = "workspace-sj2a";
const OTHER_WORKSPACE_ID = "workspace-sj2a-other";
const WORKTREE_ID = `wt:${"a".repeat(64)}`;
const SESSION_A = "sess_pseudo:aaaa000011112222";
const SESSION_B = "sess_pseudo:bbbb000033334444";
const ACTOR_A = "actor_pseudo:1111222233334444";
const CLONE_ID = "clone:sj2a-local";
const NOW = "2026-11-22T17:00:00.000Z";
const DEADLINE = "2026-11-22T17:05:00.000Z";
const DIGEST = `sha256:${"b".repeat(64)}` as Sha256Digest;
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
const SLICE_ORDER = ["track", "git", "architecture", "rules", "memory"] as const;
const VALID_CREDENTIAL = "verified-sj2a-credential";

// Independent cryptographic / canonical helpers (zero reuse of code under test).
function independentJcs(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (Array.isArray(value)) return `[${value.map(independentJcs).join(",")}]`;
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const normalized = new Map<string, unknown>();
    for (const rawKey of Object.keys(rec)) normalized.set(rawKey.normalize("NFC"), rec[rawKey]);
    const keys = [...normalized.keys()].sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${independentJcs(normalized.get(k))}`).join(",")}}`;
  }
  throw new TypeError(`Unsupported value for JCS: ${typeof value}`);
}

function independentSha256(text: string): Sha256Digest {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}` as Sha256Digest;
}

function independentJcsSha256(value: unknown, domainPrefix = ""): Sha256Digest {
  return `sha256:${createHash("sha256").update(domainPrefix, "utf8").update(independentJcs(value), "utf8").digest("hex")}` as Sha256Digest;
}

function independentBase32FromHex(hex: string): string {
  let bits = 0;
  let buf = 0;
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    buf = (buf << 8) | Number.parseInt(hex.slice(i, i + 2), 16);
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(buf >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(buf << (5 - bits)) & 31];
  return out;
}

function independentQueryId(k: SessionContextEngineKeyV1): string {
  const scope = k.roleRef === undefined ? { kind: "session", sessionId: k.sessionId } : { kind: "role", roleRef: k.roleRef };
  const digest = independentJcsSha256(
    { tenantId: k.tenantId, workspaceId: k.workspaceId, worktreeId: k.derivedWorktreeId, ...scope },
    "graphify-memory/session-context-query-id/v1\0",
  );
  return `query_${independentBase32FromHex(digest.slice("sha256:".length)).slice(0, 16)}`;
}

function independentQueryDigest(
  k: SessionContextEngineKeyV1,
  version: number,
  pinnedEventRecordIds: readonly string[],
): Sha256Digest {
  const bare: Omit<SessionContextQueryV1, "digest"> = {
    schemaVersion: "engram.session-context-query/v1",
    queryId: independentQueryId(k),
    version,
    tenantId: k.tenantId,
    workspaceId: k.workspaceId,
    derivedWorktreeId: k.derivedWorktreeId,
    ...(k.roleRef === undefined ? {} : { roleRef: k.roleRef }),
    trackScope: [],
    ontologies: [],
    pinnedEventRecordIds: [...pinnedEventRecordIds],
    selectors: [],
  };
  return independentJcsSha256(bare);
}

function independentLine(ref: string, text: string, mode: "text" | "reference" | "withdrawn"): string {
  const digest = independentSha256(text);
  if (mode === "withdrawn") return `${ref}: [withdrawn] (${digest})`;
  if (mode === "reference") return `${ref}: [reference] (${digest})`;
  return `${ref}: ${text}`;
}

function independentPayloads(
  entries: readonly { readonly slice: (typeof SLICE_ORDER)[number]; readonly line: string }[],
): {
  readonly readySlices: readonly (typeof SLICE_ORDER)[number][];
  readonly readySlicePayloads?: Partial<Record<(typeof SLICE_ORDER)[number], string>>;
  readonly byteLength: number;
} {
  const grouped = new Map<(typeof SLICE_ORDER)[number], string[]>();
  for (const e of entries) {
    const arr = grouped.get(e.slice) ?? [];
    arr.push(e.line);
    grouped.set(e.slice, arr);
  }
  const readySlices: (typeof SLICE_ORDER)[number][] = [];
  const readySlicePayloads: Partial<Record<(typeof SLICE_ORDER)[number], string>> = {};
  let byteLength = 0;
  for (const slice of SLICE_ORDER) {
    const lines = grouped.get(slice);
    if (lines && lines.length > 0) {
      const payload = lines.join("\n");
      readySlices.push(slice);
      readySlicePayloads[slice] = payload;
      byteLength += Buffer.byteLength(payload, "utf8");
    }
  }
  return {
    readySlices,
    ...(readySlices.length > 0 ? { readySlicePayloads } : {}),
    byteLength,
  };
}

function mandateFor(role: "AGENTS" | "PRINCIPAL" = "AGENTS") {
  return {
    mandateId: `mandate-${role.toLowerCase()}`,
    instance: "instance-sj2a",
    role,
    scope: "scope-sj2a",
    rights: ["memory:context:assemble"],
    envelopeDigest: DIGEST,
    signatures: [{ by: "issuer-sj2a", alg: "ed25519", value: "sig-sj2a" }],
  } as const;
}

function citationFor(sessionId: string, ordinal: number): SessionDbCitationTuple {
  return {
    sessionId,
    entryId: `entry-${sessionId}-${ordinal}`,
    ordinal,
    contentDigest: independentSha256(`${sessionId}:${ordinal}`),
  };
}

function speechPayload(
  sessionId: string,
  ordinal: number,
  boundedTurnText?: string,
  speakerRole: "owner" | "assistant" = "owner",
): RawSessionEventPayload {
  return {
    kind: "speech_turn",
    speakerRole,
    hostId: "claude",
    deliveryPath: "push-hook",
    sessionCitation: citationFor(sessionId, ordinal),
    ...(boundedTurnText !== undefined ? { boundedTurnText } : {}),
    triggerTurnSweep: true,
  };
}

function makeEnvelope(overrides: {
  readonly sourceId: string;
  readonly sessionPseudoId?: string;
  readonly workspaceId?: string;
  readonly mandateRef?: ReturnType<typeof mandateFor> | null;
  readonly payload?: RawSessionEventPayload;
  readonly contextRequest?: SessionContextRequestV1;
  readonly credential?: string;
}): RawSessionEventEnvelope {
  const sessionPseudoId = overrides.sessionPseudoId ?? SESSION_A;
  const mandateRef = overrides.mandateRef === undefined ? mandateFor("AGENTS") : overrides.mandateRef;
  return {
    schemaVersion: "engram.session-event/v1",
    idempotencyKey: deriveSessionFrontIdempotencyKey({ sourceKind: "sj2a-event", sourceId: overrides.sourceId }),
    tenantId: TENANT_ID,
    workspaceId: overrides.workspaceId ?? WORKSPACE_ID,
    derivedWorktreeId: WORKTREE_ID,
    cloneId: CLONE_ID,
    sessionPseudoId,
    actorPseudoId: ACTOR_A,
    mandateRef,
    purposeRef: "memory.capture.session/v1",
    retention: { derivative_rule: "retain" },
    occurredAt: NOW,
    payload: overrides.payload ?? speechPayload(sessionPseudoId, 1, "turn-text-default"),
    authorization: { credential: overrides.credential ?? VALID_CREDENTIAL },
    deadlineAt: DEADLINE,
    ...(overrides.contextRequest !== undefined ? { contextRequest: overrides.contextRequest } : {}),
  };
}

function makeExtractionBatch(
  sourceEventRecordIds: readonly string[],
  sourceId: string,
  sessionPseudoId = SESSION_A,
): SessionExtractionProposalBatch {
  return {
    schemaVersion: "engram.session-extraction/v1",
    idempotencyKey: deriveSessionFrontIdempotencyKey({ sourceKind: "sj2a-extract", sourceId }),
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    derivedWorktreeId: WORKTREE_ID,
    sessionPseudoId,
    sourceEventRecordIds: [...sourceEventRecordIds],
    extractor: {
      kind: "light-permanent-llm",
      modelOrAdapterId: "anthropic:claude-haiku-4",
      extractionSemanticsVersion: "sj2a-v1",
      llmMeshAttemptRef: "attempt-sj2a-1",
    },
    purposeRef: "memory.capture.session/v1",
    retention: { derivative_rule: "retain" },
    candidates: [],
    authorization: { credential: VALID_CREDENTIAL },
    deadlineAt: DEADLINE,
  };
}

function createHarness(overrides: Partial<EngramSessionIngestFrontOptionsV1> & { readonly withEngine?: boolean } = {}) {
  const commits: SessionFrontCommitV1[] = [];
  let tail = Promise.resolve();
  let readEventCalls = 0;
  let sliceCalls = 0;

  const store: SessionFrontStoreV1 = {
    transact(scopeArg, apply) {
      const completion = tail.then(async () => {
        const writes: SessionFrontCommitV1[] = [];
        const outcome = await apply({
          cursor: String(commits.length + 1),
          async readReplay(kind, idempotencyKey) {
            return commits.find(
              (c) =>
                c.kind === kind &&
                c.idempotencyKey === idempotencyKey &&
                c.scope.tenantId === scopeArg.tenantId &&
                c.scope.workspaceId === scopeArg.workspaceId,
            );
          },
          async readEvent(id) {
            readEventCalls += 1;
            const entry = commits.find((c) => c.kind === "event" && c.receipt.eventRecordId === id);
            if (entry?.kind !== "event") return undefined;
            const latest = commits.findLast(
              (c) => c.kind === "extraction" && Object.hasOwn(c.receipt.sourceDispositions, id),
            );
            return {
              scope: entry.scope,
              disposition:
                latest?.kind === "extraction"
                  ? latest.receipt.sourceDispositions[id]!
                  : entry.receipt.extractionDisposition,
              ...(entry.ordinal !== undefined ? { ordinal: entry.ordinal.throughOrdinal } : {}),
              sessionRef: entry.event.sessionRef,
              ...(entry.contextRecord !== undefined ? { contextRecord: structuredClone(entry.contextRecord) } : {}),
            };
          },
          async write(commit) {
            writes.push(structuredClone(commit));
          },
        });
        if (outcome.ok) commits.push(...writes);
        return outcome;
      });
      tail = completion.then(() => undefined, () => undefined);
      return completion;
    },
  };

  const contextEngine =
    overrides.withEngine === false
      ? undefined
      : createSessionContextEngineV1({
          store,
          actorRef: ACTOR_A,
          cloneId: CLONE_ID,
          now: () => NOW,
        });

  const { withEngine: _omit, ...frontOverrides } = overrides;
  const front = createEngramSessionIngestFront({
    store,
    authorize: async ({ input }) => ({
      ok: true,
      value: { hasMemoryIdentity: input.authorization.credential === VALID_CREDENTIAL },
    }),
    getReadySlices: () => {
      sliceCalls += 1;
      return { readySlices: ["track"], readySlicePayloads: { track: "legacy-slice-should-not-leak" } };
    },
    screenCandidate: () => ({ ok: true, value: "allow" }),
    ...(contextEngine !== undefined ? { contextEngine } : {}),
    ...frontOverrides,
  });

  return {
    front,
    contextEngine,
    store,
    commits,
    getReadEventCalls: () => readEventCalls,
    getSliceCalls: () => sliceCalls,
  };
}

describe("tests/session-context-ingest.test.ts", () => {
  it("t1: journalEnabled false answers CAPABILITY_UNAVAILABLE and records nothing", async () => {
    const keyA: SessionContextEngineKeyV1 = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: "AGENTS",
      sessionId: SESSION_A,
    };
    const expectedQid = independentQueryId(keyA);

    const disabledVariants: Array<{ readonly name: string; readonly opts: Partial<EngramSessionIngestFrontOptionsV1> & { readonly withEngine?: boolean } }> = [
      { name: "explicit false policy", opts: { journalPolicy: { journalEnabled: false } } },
      { name: "async false policy", opts: { journalPolicy: async () => ({ journalEnabled: false }) } },
      { name: "default-off when contextEngine set without policy (OD:83)", opts: {} },
      { name: "undefined policy result fails closed", opts: { journalPolicy: () => undefined } },
      { name: "non-boolean truthy journalEnabled fails closed", opts: { journalPolicy: () => ({ journalEnabled: "true" as unknown as boolean }) } },
      { name: "throwing policy reader fails closed", opts: { journalPolicy: () => { throw new Error("policy store down"); } } },
    ];

    for (const variant of disabledVariants) {
      const h = createHarness(variant.opts);
      const withReq = await h.front.recordSessionEvent(
        makeEnvelope({ sourceId: `t1-req-${variant.name}`, contextRequest: { reset: "restart" } }),
      );
      // Kills a mutant that allows recordSessionEvent with contextRequest when journalEnabled is false or unset.
      expect(withReq.ok, variant.name).toBe(false);
      if (withReq.ok) return;
      // Kills a mutant that returns a code other than CAPABILITY_UNAVAILABLE when journalEnabled is false.
      expect(withReq.error.code, variant.name).toBe("CAPABILITY_UNAVAILABLE");
      // Kills a mutant that marks CAPABILITY_UNAVAILABLE as retryable.
      expect(withReq.error.retryable, variant.name).toBe(false);
      // Kills a mutant that reports an operation other than capture on journal-off refusal.
      expect(withReq.error.operation, variant.name).toBe("capture");

      const withoutReq = await h.front.recordSessionEvent(makeEnvelope({ sourceId: `t1-bare-${variant.name}` }));
      // Kills a mutant that only checks journalEnabled when contextRequest is present.
      expect(withoutReq.ok, variant.name).toBe(false);
      if (withoutReq.ok) return;
      // Kills a mutant that returns a wrong error code for a bare event when journalEnabled is false.
      expect(withoutReq.error.code, variant.name).toBe("CAPABILITY_UNAVAILABLE");

      const extractionRes = await h.front.recordExtraction(makeExtractionBatch(["raw_nonexistent"], `t1-ext-${variant.name}`));
      // Kills a mutant that permits recordExtraction when journalEnabled is false.
      expect(extractionRes.ok, variant.name).toBe(false);
      if (extractionRes.ok) return;
      // Kills a mutant that returns NOT_FOUND instead of CAPABILITY_UNAVAILABLE on recordExtraction when journal is off.
      expect(extractionRes.error.code, variant.name).toBe("CAPABILITY_UNAVAILABLE");

      // Kills a mutant that commits any event or query to the store before checking journalEnabled.
      expect(h.commits.length, variant.name).toBe(0);
      // Kills a mutant that invokes getReadySlices or prepares deliveries when journalEnabled is false.
      expect(h.getSliceCalls(), variant.name).toBe(0);
      // Kills a mutant that creates query v1 in the contextEngine when journalEnabled is false.
      expect(h.contextEngine?.getQuery(expectedQid, 1), variant.name).toBeUndefined();
    }

    // Legacy 1-E1 front without contextEngine or journalPolicy must still fail closed on contextRequest.
    const legacy = createHarness({ withEngine: false });
    const legacyReq = await legacy.front.recordSessionEvent(
      makeEnvelope({ sourceId: "t1-legacy-req", contextRequest: { reset: "restart" } }),
    );
    // Kills a mutant that ignores contextRequest instead of failing closed when contextEngine is absent.
    expect(legacyReq.ok).toBe(false);
    if (legacyReq.ok) return;
    // Kills a mutant that returns a wrong error code when contextRequest arrives without an enabled context journal.
    expect(legacyReq.error.code).toBe("CAPABILITY_UNAVAILABLE");
    // Kills a mutant that records an event when contextRequest is refused due to absent context journal.
    expect(legacy.commits.length).toBe(0);

    // Unauthenticated caller gets UNAUTHORIZED even when journalEnabled is false (no workspace opt-in oracle leak).
    const unauthHarness = createHarness({ journalPolicy: { journalEnabled: false } });
    const unauth = await unauthHarness.front.recordSessionEvent(
      makeEnvelope({ sourceId: "t1-unauth", credential: "invalid-cred", contextRequest: { reset: "restart" } }),
    );
    // Kills a mutant that checks journalEnabled before authorize and leaks workspace opt-in state to unauthenticated callers.
    expect(unauth.ok).toBe(false);
    if (unauth.ok) return;
    // Kills a mutant that answers CAPABILITY_UNAVAILABLE instead of UNAUTHORIZED to an unauthenticated caller.
    expect(unauth.error.code).toBe("UNAUTHORIZED");
    // Kills a mutant that touches the store on an unauthenticated call.
    expect(unauthHarness.commits.length).toBe(0);
  });

  it("t2: no contextRequest: recorded, no delivery", async () => {
    const keyA: SessionContextEngineKeyV1 = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: "AGENTS",
      sessionId: SESSION_A,
    };
    const expectedQid = independentQueryId(keyA);
    const expectedV1Digest = independentQueryDigest(keyA, 1, []);

    const h = createHarness({ journalPolicy: { journalEnabled: true } });
    const result = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t2-bare-turn",
        payload: speechPayload(SESSION_A, 1, "note only without context request"),
      }),
    );
    // Kills a mutant that refuses valid events without contextRequest when journalEnabled is true.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Kills a mutant that returns a wrong status on a newly recorded event.
    expect(result.value.status).toBe("recorded");
    // Kills a mutant that emits an invalid eventRecordId format.
    expect(result.value.eventRecordId).toMatch(/^raw_[a-z2-7]{52}$/);
    // Kills a mutant that emits contextDelivery when contextRequest was omitted.
    expect(Object.hasOwn(result.value, "contextDelivery")).toBe(false);
    // Kills a mutant that injects readySlices when contextRequest was omitted in journal mode.
    expect(result.value.readySlices).toEqual([]);
    // Kills a mutant that attaches readySlicePayloads when contextRequest was omitted.
    expect(Object.hasOwn(result.value, "readySlicePayloads")).toBe(false);

    const eventCommit = h.commits.find((c) => c.kind === "event" && c.receipt.eventRecordId === result.value.eventRecordId);
    // Kills a mutant that drops the event commit when contextRequest is omitted.
    expect(eventCommit?.kind).toBe("event");
    if (eventCommit?.kind !== "event") return;
    // Kills a mutant that stores a synthetic contextRecord on an event that carried no contextRequest.
    expect(Object.hasOwn(eventCommit, "contextRecord")).toBe(false);

    const v1 = h.contextEngine!.getQuery(expectedQid, 1);
    // Kills a mutant that fails to initialize query v1 when the first event of a key is noted without contextRequest.
    expect(v1?.version).toBe(1);
    // Kills a mutant that computes a wrong queryDigest for query v1 created by noting an event.
    expect(v1?.digest).toBe(expectedV1Digest);
  });

  it("t3: with contextRequest the payloads hold only the difference, the receipt names watermark and queryDigest, and a call with no host fact renders for an external reader that is not authorized", async () => {
    const keyA: SessionContextEngineKeyV1 = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: "AGENTS",
      sessionId: SESSION_A,
    };
    const keyB: SessionContextEngineKeyV1 = { ...keyA, sessionId: SESSION_B };
    const expectedQid = independentQueryId(keyA);
    const pinnedText = "Passe la limite de tentatives à 5";
    const pinnedRef = `pinned:${expectedQid}:v2`;
    const expectedV2Digest = independentQueryDigest(keyA, 2, [pinnedRef]);

    const h = createHarness({ journalPolicy: { journalEnabled: true } });
    const engine = h.contextEngine!;

    // Seed session A pinned request (v2), session A own decision, session B outside decision, and a dreaming recall.
    await engine.noteSessionEvent(keyA);
    await engine.notePinnedRequest(keyA, pinnedText);
    const ownDecText = "own-session-decision: keep vitest fast";
    await engine.noteDecision(keyA, ownDecText, SESSION_A);
    const otherDecText = "other-session-secret: rotate staging key";
    await engine.noteDecision(keyB, otherDecText, SESSION_B);
    const dreamingText = "dreaming-recall-secret: never skip retries";
    await engine.noteViewItem(
      keyA,
      5,
      {
        ref: "rec_dreaming_01",
        text: dreamingText,
        slice: "memory",
        authoredBy: "dreaming",
        sourceEventRecordIds: ["raw_dream_src_1"],
      },
      SESSION_A,
    );

    const ownDecRef = `decision:${expectedQid}:${independentSha256(ownDecText).slice(7, 15)}:1`;
    const otherDecRef = `decision:${expectedQid}:${independentSha256(otherDecText).slice(7, 15)}:2`;

    // Step 1: reset: "restart" -> full view; own items are text, other-session and dreaming items are references.
    const r1 = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t3-step-1",
        payload: speechPayload(SESSION_A, 1, "start session"),
        contextRequest: { reset: "restart", hostSignal: "SessionStart" },
      }),
    );
    // Kills a mutant that rejects a valid envelope carrying contextRequest.reset.
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // Decisions are ordered newest-first (otherDec cursor 4, then ownDec cursor 3), followed by tier 5 dreaming item.
    const expectedStep1 = independentPayloads([
      { slice: "track", line: independentLine(pinnedRef, pinnedText, "text") },
      { slice: "memory", line: independentLine(otherDecRef, otherDecText, "reference") },
      { slice: "memory", line: independentLine(ownDecRef, ownDecText, "text") },
      { slice: "memory", line: independentLine("rec_dreaming_01", dreamingText, "reference") },
    ]);

    // Kills a mutant that omits contextDelivery on a call carrying contextRequest.
    expect(r1.value.contextDelivery).toBeDefined();
    if (!r1.value.contextDelivery) return;
    // Kills a mutant that returns mode diff instead of full on reset: "restart".
    expect(r1.value.contextDelivery.mode).toBe("full");
    // Kills a mutant that stamps wrong queryId, queryVersion, or cursor on the returned watermark.
    expect(r1.value.contextDelivery.watermark).toEqual({
      queryId: expectedQid,
      queryVersion: 2,
      cursor: r1.value.cursor,
    });
    // Kills a mutant that omits or corrupts queryDigest on the delivery receipt.
    expect(r1.value.contextDelivery.queryDigest).toBe(expectedV2Digest);
    // Kills a mutant that emits annotatedThroughOrdinal before any shadow extraction has committed.
    expect(Object.hasOwn(r1.value.contextDelivery, "annotatedThroughOrdinal")).toBe(false);
    // Kills a mutant that returns wrong readySlices ordering or drops slices on full delivery.
    expect(r1.value.readySlices).toEqual(expectedStep1.readySlices);
    // Kills a mutant that leaks other-session or dreaming text instead of rendering [reference] (sha256:...) or corrupts own-session text.
    expect(r1.value.readySlicePayloads).toEqual(expectedStep1.readySlicePayloads);
    // Kills a mutant that leaks raw text of another session's decision into readySlicePayloads when called with no host fact.
    expect(JSON.stringify(r1.value.readySlicePayloads)).not.toContain(otherDecText);
    // Kills a mutant that leaks raw text of a dreaming recall into readySlicePayloads when called with no host fact.
    expect(JSON.stringify(r1.value.readySlicePayloads)).not.toContain(dreamingText);
    // Kills a mutant that reports raw-text byteLength instead of exact UTF-8 payload byteLength.
    expect(r1.value.contextDelivery.byteLength).toBe(expectedStep1.byteLength);
    // Kills a mutant that marks own-session items as reference or other-session/dreaming items as text on external unauthorized delivery.
    expect(r1.value.contextDelivery.items.map((i) => ({ ref: i.ref, disclosure: i.disclosure }))).toEqual([
      { ref: pinnedRef, disclosure: "text" },
      { ref: otherDecRef, disclosure: "reference" },
      { ref: ownDecRef, disclosure: "text" },
      { ref: "rec_dreaming_01", disclosure: "reference" },
    ]);

    // Step 2: nothing changed outside -> diff returns 0 bytes and no readySlicePayloads.
    const r2 = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t3-step-2",
        payload: speechPayload(SESSION_A, 2, "follow up prompt"),
        contextRequest: { held: r1.value.contextDelivery.watermark },
      }),
    );
    // Kills a mutant that rejects a follow-up diff request holding the returned watermark.
    expect(r2.ok).toBe(true);
    if (!r2.ok || !r2.value.contextDelivery) return;
    // Kills a mutant that sends mode full instead of diff when holding a valid watermark.
    expect(r2.value.contextDelivery.mode).toBe("diff");
    // Kills a mutant that re-delivers items already held by the session.
    expect(r2.value.contextDelivery.items).toEqual([]);
    // Kills a mutant that reports non-zero byteLength when nothing changed outside the session.
    expect(r2.value.contextDelivery.byteLength).toBe(0);
    // Kills a mutant that emits non-empty readySlices on a zero-byte diff.
    expect(r2.value.readySlices).toEqual([]);
    // Kills a mutant that emits readySlicePayloads on a zero-byte diff (SJ §3.3).
    expect(Object.hasOwn(r2.value, "readySlicePayloads")).toBe(false);
    // Kills a mutant that fails to advance watermark cursor on a zero-byte diff.
    expect(r2.value.contextDelivery.watermark).toEqual({
      queryId: expectedQid,
      queryVersion: 2,
      cursor: r2.value.cursor,
    });

    // Step 3: Session A adds an own-session decision (must NOT echo), Session B adds an outside decision (MUST arrive as reference only).
    await engine.noteDecision(keyA, "own-step-no-echo: local run passed", SESSION_A);
    const deltaText = "outside-delta-secret: cap retries at 5";
    await engine.noteDecision(keyB, deltaText, SESSION_B);
    const deltaRef = `decision:${expectedQid}:${independentSha256(deltaText).slice(7, 15)}:4`;
    const expectedDelta = independentPayloads([
      { slice: "memory", line: independentLine(deltaRef, deltaText, "reference") },
    ]);

    const r3 = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t3-step-3",
        payload: speechPayload(SESSION_A, 3, "next prompt"),
        contextRequest: { held: r2.value.contextDelivery.watermark },
      }),
    );
    // Kills a mutant that fails diff delivery when an outside decision exists.
    expect(r3.ok).toBe(true);
    if (!r3.ok || !r3.value.contextDelivery) return;
    // Kills a mutant that returns mode full instead of diff for an outside decision.
    expect(r3.value.contextDelivery.mode).toBe("diff");
    // Kills a mutant that echoes already-held track slice or own-session decisions instead of delivering ONLY the difference.
    expect(r3.value.readySlices).toEqual(["memory"]);
    // Kills a mutant that leaks the outside decision's raw text or includes non-delta items in readySlicePayloads.
    expect(r3.value.readySlicePayloads).toEqual(expectedDelta.readySlicePayloads);
    // Kills a mutant that exposes session B's raw decision text to an external unauthorized reader.
    expect(r3.value.readySlicePayloads?.memory).not.toContain(deltaText);
    // Kills a mutant that sets wrong disclosure, ref, or digest on the outside delta item.
    expect(r3.value.contextDelivery.items).toEqual([
      {
        ref: deltaRef,
        digest: independentSha256(deltaText),
        slice: "memory",
        change: "added",
        disclosure: "reference",
        authoredBy: "code",
        sourceEventRecordIds: [],
      },
    ]);
    // Kills a mutant that miscomputes UTF-8 byteLength of the difference payload.
    expect(r3.value.contextDelivery.byteLength).toBe(expectedDelta.byteLength);
    // Kills a mutant that sets annotatedThroughOrdinal before any shadow extraction has committed.
    expect(Object.hasOwn(r3.value.contextDelivery, "annotatedThroughOrdinal")).toBe(false);

    // Step 4: Shadow reads step 1 (ordinal 1) via recordExtraction -> next delivery reports annotatedThroughOrdinal: 1.
    const ext1 = await h.front.recordExtraction(makeExtractionBatch([r1.value.eventRecordId], "t3-ext-1", SESSION_A));
    // Kills a mutant that breaks recordExtraction when journalEnabled is true.
    expect(ext1.ok).toBe(true);

    const r4 = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t3-step-4",
        payload: speechPayload(SESSION_A, 4, "after shadow step 1"),
        contextRequest: { held: r3.value.contextDelivery.watermark },
      }),
    );
    // Kills a mutant that fails delivery after a shadow extraction commits.
    expect(r4.ok).toBe(true);
    if (!r4.ok || !r4.value.contextDelivery) return;
    // Kills a mutant that omits or miscomputes annotatedThroughOrdinal once the shadow has read step 1.
    expect(r4.value.contextDelivery.annotatedThroughOrdinal).toBe(1);
    // Kills a mutant that re-delivers the outside decision when holding r3's watermark.
    expect(r4.value.contextDelivery.byteLength).toBe(0);

    // Step 5: Shadow reads step 3 (ordinal 3) -> annotatedThroughOrdinal advances to 3.
    const ext2 = await h.front.recordExtraction(makeExtractionBatch([r3.value.eventRecordId], "t3-ext-2", SESSION_A));
    // Kills a mutant that rejects a second extraction batch.
    expect(ext2.ok).toBe(true);

    const r5 = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t3-step-5",
        payload: speechPayload(SESSION_A, 5, "after shadow step 3"),
        contextRequest: { held: r4.value.contextDelivery.watermark },
      }),
    );
    // Kills a mutant that fails delivery after the second shadow extraction.
    expect(r5.ok).toBe(true);
    if (!r5.ok || !r5.value.contextDelivery) return;
    // Kills a mutant that fails to advance annotatedThroughOrdinal monotonically from 1 to 3.
    expect(r5.value.contextDelivery.annotatedThroughOrdinal).toBe(3);

    // Unassigned session (mandateRef: null) gets its own session-scoped queryId and inherits nothing from role AGENTS.
    const unassignedKey: SessionContextEngineKeyV1 = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      sessionId: "sess_pseudo:cccc000055556666",
    };
    const rUnassigned = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t3-unassigned",
        sessionPseudoId: unassignedKey.sessionId,
        mandateRef: null,
        payload: speechPayload(unassignedKey.sessionId, 1, "unassigned prompt"),
        contextRequest: { reset: "restart" },
      }),
    );
    // Kills a mutant that refuses an unassigned session (mandateRef: null) with contextRequest.
    expect(rUnassigned.ok).toBe(true);
    if (!rUnassigned.ok || !rUnassigned.value.contextDelivery) return;
    // Kills a mutant that shares role AGENTS's queryId with an unassigned (mandateRef: null) session.
    expect(rUnassigned.value.contextDelivery.watermark.queryId).toBe(independentQueryId(unassignedKey));
    // Kills a mutant that leaks role AGENTS's items into an unassigned session's view.
    expect(rUnassigned.value.contextDelivery.items).toEqual([]);
  });

  it("t4: the request and the answered watermark are stored with the event, and the delivery is recomputed from them", async () => {
    const keyA: SessionContextEngineKeyV1 = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: "AGENTS",
      sessionId: SESSION_A,
    };
    const keyB: SessionContextEngineKeyV1 = { ...keyA, sessionId: SESSION_B };
    const expectedQid = independentQueryId(keyA);
    const pinnedText = "Passe la limite de tentatives à 5";
    const outside1 = "outside-decision-one: use jitter";
    const outside2 = "outside-decision-two: add circuit breaker";
    const outside3 = "outside-decision-three: log attempts";
    const laterPinned = "et garde la borne à 30s";

    const h = createHarness({ journalPolicy: { journalEnabled: true } });
    const engine = h.contextEngine!;
    await engine.noteSessionEvent(keyA);
    await engine.notePinnedRequest(keyA, pinnedText);

    // Event 1: full reset with optional hostSignal and loop metadata.
    const req1: SessionContextRequestV1 = {
      reset: "compaction",
      hostSignal: "PreCompact",
      loop: {
        objectiveLoopId: "loop-sj2a-1",
        trackScope: [
          {
            repoKey: "sentropic/engram",
            workspace: WORKSPACE_ID,
            aggregateId: "US-42",
            role: "builder",
            aggregateKind: "user_story",
            baselineCommit: "abc1234",
            decisionGateId: "gate-1",
            decisionGateDigest: DIGEST,
          },
        ],
      },
    };
    const env1 = makeEnvelope({
      sourceId: "t4-ev-1",
      payload: speechPayload(SESSION_A, 1, "before compaction"),
      contextRequest: req1,
    });
    const res1 = await h.front.recordSessionEvent(env1);
    // Kills a mutant that rejects a full contextRequest with hostSignal and loop.
    expect(res1.ok).toBe(true);
    if (!res1.ok || !res1.value.contextDelivery) return;
    const snap1 = structuredClone({
      readySlices: res1.value.readySlices,
      readySlicePayloads: res1.value.readySlicePayloads,
      contextDelivery: res1.value.contextDelivery,
    });

    // Outside decision 1 from session B -> Event 2 diff.
    await engine.noteDecision(keyB, outside1, SESSION_B);
    const req2: SessionContextRequestV1 = { held: structuredClone(snap1.contextDelivery.watermark) };
    const env2 = makeEnvelope({
      sourceId: "t4-ev-2",
      payload: speechPayload(SESSION_A, 2, "turn 2"),
      contextRequest: req2,
    });
    const res2 = await h.front.recordSessionEvent(env2);
    // Kills a mutant that fails Event 2 diff delivery.
    expect(res2.ok).toBe(true);
    if (!res2.ok || !res2.value.contextDelivery) return;
    const snap2 = structuredClone({
      readySlices: res2.value.readySlices,
      readySlicePayloads: res2.value.readySlicePayloads,
      contextDelivery: res2.value.contextDelivery,
    });

    // Shadow extracts Event 1 (ordinal 1), then Session B adds outside2 -> Event 3 uses an UNREADABLE watermark!
    await h.front.recordExtraction(makeExtractionBatch([res1.value.eventRecordId], "t4-ext-1", SESSION_A));
    await engine.noteDecision(keyB, outside2, SESSION_B);
    const req3: SessionContextRequestV1 = {
      held: { queryId: expectedQid, queryVersion: 999, cursor: "999999" },
    };
    const res3 = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t4-ev-3",
        payload: speechPayload(SESSION_A, 3, "turn 3 unreadable watermark"),
        contextRequest: req3,
      }),
    );
    // Kills a mutant that errors instead of answering from stored session history on an unreadable watermark.
    expect(res3.ok).toBe(true);
    if (!res3.ok || !res3.value.contextDelivery) return;
    const snap3 = structuredClone({
      readySlices: res3.value.readySlices,
      readySlicePayloads: res3.value.readySlicePayloads,
      contextDelivery: res3.value.contextDelivery,
    });

    // Verify stored EventCommit carries ONLY request and answeredWatermark, NEVER delivery content.
    for (const [label, evId, expectedReq, expectedSnap] of [
      ["ev1", res1.value.eventRecordId, req1, snap1],
      ["ev2", res2.value.eventRecordId, req2, snap2],
      ["ev3", res3.value.eventRecordId, req3, snap3],
    ] as const) {
      const commit = h.commits.find((c) => c.kind === "event" && c.receipt.eventRecordId === evId);
      // Kills a mutant that fails to persist the EventCommit in the store.
      expect(commit?.kind, label).toBe("event");
      if (commit?.kind !== "event") return;
      // Kills a mutant that drops or corrupts the stored contextRequest on the EventCommit.
      expect(commit.contextRecord?.request, label).toEqual(expectedReq);
      // Kills a mutant that drops or corrupts the stored answeredWatermark on the EventCommit.
      expect(commit.contextRecord?.answeredWatermark, label).toEqual(expectedSnap.contextDelivery.watermark);
      // Kills a mutant that stores delivery content (contextDelivery) inside EventCommit instead of recomputing it.
      expect(Object.hasOwn(commit, "contextDelivery"), label).toBe(false);
      // Kills a mutant that stores rendered readySlicePayloads inside EventCommit instead of recomputing them.
      expect(Object.hasOwn(commit, "readySlicePayloads"), label).toBe(false);
      const serialized = JSON.stringify(commit);
      // Kills a mutant that leaks rendered delivery lines or outside decision text into the stored EventCommit.
      expect(serialized, label).not.toContain("[reference]");
      // Kills a mutant that embeds readySlicePayloads anywhere inside the stored EventCommit.
      expect(serialized, label).not.toContain("readySlicePayloads");
      // Kills a mutant that embeds contextDelivery anywhere inside the stored EventCommit.
      expect(serialized, label).not.toContain("contextDelivery");
    }

    // Mutate caller's input envelopes, requests, and returned receipts in place AFTER recording!
    (req1 as { reset?: string }).reset = "clear";
    (req2.held as { cursor: string }).cursor = "0";
    (res2.value.contextDelivery.watermark as { cursor: string }).cursor = "999";
    if (res2.value.readySlicePayloads) res2.value.readySlicePayloads.memory = "TAMPERED_CALLER_MEMORY";

    // Mutate journal state FURTHER after ev1/ev2/ev3: replace outside1, add outside3, bump query to v3, advance shadow ordinal to 3!
    const outside1Ref = `decision:${expectedQid}:${independentSha256(outside1).slice(7, 15)}:1`;
    await engine.replaceDecision(keyB, outside1Ref, "replacement-decision: use exponential jitter", SESSION_B);
    await engine.noteDecision(keyB, outside3, SESSION_B);
    await engine.notePinnedRequest(keyA, laterPinned);
    await h.front.recordExtraction(makeExtractionBatch([res3.value.eventRecordId], "t4-ext-3", SESSION_A));

    // Recompute ev1, ev2, ev3 strictly from stored data (must read from store and match original snapshots item-for-item & byte-for-byte).
    const scope = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID };
    const readsBefore = h.getReadEventCalls();
    const rec1 = await engine.recomputeDelivery({ scope, eventRecordId: res1.value.eventRecordId });
    const rec2 = await engine.recomputeDelivery({ scope, eventRecordId: res2.value.eventRecordId });
    const rec3 = await engine.recomputeDelivery({ scope, eventRecordId: res3.value.eventRecordId });
    const readsAfter = h.getReadEventCalls();

    // Kills a mutant that serves recomputeDelivery from an in-memory cache without reading stored commits from the store.
    expect(readsAfter).toBeGreaterThan(readsBefore);
    // Kills a mutant that fails recomputing ev1 from stored data.
    expect(rec1.ok).toBe(true);
    // Kills a mutant that fails recomputing ev2 from stored data.
    expect(rec2.ok).toBe(true);
    // Kills a mutant that fails recomputing ev3 (unreadable watermark) from stored data.
    expect(rec3.ok).toBe(true);
    if (!rec1.ok || !rec2.ok || !rec3.ok) return;

    // Kills a mutant whose recomputation of ev1 diverges on items, payloads, watermark, queryDigest, or later extractions/query versions.
    expect(rec1.value).toEqual(snap1);
    // Kills a mutant whose recomputation of ev2 is polluted by caller-memory mutation, later decision replacement, later v3 query, or later shadow extraction.
    expect(rec2.value).toEqual(snap2);
    // Kills a mutant whose recomputation of ev3 fails to replay unreadable-watermark prior history or leaks later extraction ordinal 3 instead of 1.
    expect(rec3.value).toEqual(snap3);
    // Kills a mutant that loses annotatedThroughOrdinal: 1 when recomputing ev3 after a later extraction raised it to 3.
    expect(rec3.value.contextDelivery.annotatedThroughOrdinal).toBe(1);

    // Recompute ev2 for a local reader and an authorized external reader -> same items, now rendered as text!
    const expectedLocalEv2 = independentPayloads([
      { slice: "memory", line: independentLine(outside1Ref, outside1, "text") },
    ]);
    for (const reader of [{ isLocal: true }, { contentAuthorized: true }] as const) {
      const recAuth = await engine.recomputeDelivery({ scope, eventRecordId: res2.value.eventRecordId, reader });
      // Kills a mutant that fails recomputing ev2 for a local or content-authorized reader.
      expect(recAuth.ok).toBe(true);
      if (!recAuth.ok) return;
      // Kills a mutant that caches external-reference payloads instead of recomputing disclosure for a local/authorized reader.
      expect(recAuth.value.readySlicePayloads).toEqual(expectedLocalEv2.readySlicePayloads);
      // Kills a mutant that keeps disclosure as reference for a local or content-authorized reader.
      expect(recAuth.value.contextDelivery.items.map((i) => i.disclosure)).toEqual(["text"]);
      // Kills a mutant that miscomputes byteLength for a local or content-authorized reader.
      expect(recAuth.value.contextDelivery.byteLength).toBe(expectedLocalEv2.byteLength);
    }

    // Cross-scope and missing-event refusals on recomputeDelivery fail closed.
    const crossScope = await engine.recomputeDelivery({
      scope: { tenantId: TENANT_ID, workspaceId: OTHER_WORKSPACE_ID },
      eventRecordId: res2.value.eventRecordId,
    });
    // Kills a mutant that allows cross-workspace recomputation of another workspace's stored event.
    expect(crossScope.ok).toBe(false);
    if (crossScope.ok) return;
    // Kills a mutant that returns a code other than UNAUTHORIZED on cross-scope recomputeDelivery.
    expect(crossScope.error.code).toBe("UNAUTHORIZED");

    const missing = await engine.recomputeDelivery({ scope, eventRecordId: "raw_does_not_exist" });
    // Kills a mutant that succeeds or throws on an unknown eventRecordId in recomputeDelivery.
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    // Kills a mutant that returns a code other than NOT_FOUND for a missing eventRecordId.
    expect(missing.error.code).toBe("NOT_FOUND");

    // Event stored without contextRequest cannot be recomputed (NOT_FOUND).
    const bare = await h.front.recordSessionEvent(makeEnvelope({ sourceId: "t4-bare-no-req" }));
    // Kills a mutant that fails recording a bare event without contextRequest inside the recomputation harness.
    expect(bare.ok).toBe(true);
    if (!bare.ok) return;
    const bareRec = await engine.recomputeDelivery({ scope, eventRecordId: bare.value.eventRecordId });
    // Kills a mutant that fabricates a delivery for an event stored without contextRequest.
    expect(bareRec.ok).toBe(false);
    if (bareRec.ok) return;
    // Kills a mutant that returns a code other than NOT_FOUND when an event has no stored contextRecord.
    expect(bareRec.error.code).toBe("NOT_FOUND");
  });

  it("t5: no turn text enters .graphify/graph.json", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "engram-sj2a-graph-"));
    try {
      const graphDir = join(tmpRoot, ".graphify");
      const graphPath = join(graphDir, "graph.json");
      mkdirSync(graphDir, { recursive: true });

      const baseGraph = createGraph(false);
      baseGraph.addNode("code:src/retry.ts", { label: "retry.ts", file_type: "code", source_file: "src/retry.ts" });
      const initialGraphBytes = JSON.stringify(serializeGraph(baseGraph), null, 2);
      writeFileSync(graphPath, initialGraphBytes, "utf8");

      const canaryOwner = "CANARY_OWNER_TURN_TEXT_SJ2A_9f8e7d6c";
      const canaryAssistant = "CANARY_ASSISTANT_TURN_TEXT_SJ2A_1a2b3c4d";
      const h = createHarness({ journalPolicy: { journalEnabled: true } });

      const r1 = await h.front.recordSessionEvent(
        makeEnvelope({
          sourceId: "t5-turn-1",
          payload: speechPayload(SESSION_A, 1, canaryOwner, "owner"),
          contextRequest: { reset: "restart" },
        }),
      );
      const r2 = await h.front.recordSessionEvent(
        makeEnvelope({
          sourceId: "t5-turn-2",
          payload: speechPayload(SESSION_A, 2, canaryAssistant, "assistant"),
        }),
      );
      // Kills a mutant that fails recording speech_turn events during the graph-isolation guard.
      expect(r1.ok && r2.ok).toBe(true);
      if (!r1.ok || !r2.ok) return;

      const ext = await h.front.recordExtraction(
        makeExtractionBatch([r1.value.eventRecordId, r2.value.eventRecordId], "t5-ext", SESSION_A),
      );
      // Kills a mutant that fails extraction during the graph-isolation guard.
      expect(ext.ok).toBe(true);

      // 1. Existing .graphify/graph.json on disk is untouched byte-for-byte.
      const diskAfterIngest = readFileSync(graphPath, "utf8");
      // Kills a mutant that writes to .graphify/graph.json during session-front ingest or extraction.
      expect(diskAfterIngest).toBe(initialGraphBytes);
      // Kills a mutant that leaks owner turn text into .graphify/graph.json on disk.
      expect(diskAfterIngest).not.toContain(canaryOwner);
      // Kills a mutant that leaks assistant turn text into .graphify/graph.json on disk.
      expect(diskAfterIngest).not.toContain(canaryAssistant);

      // 2. Bounded current projection (L0) never carries turn text or raw event ids.
      const eventCommit = h.commits.find((c) => c.kind === "event" && c.receipt.eventRecordId === r1.value.eventRecordId);
      // Kills a mutant that omits the committed event record from store commits when recording a speech_turn.
      expect(eventCommit?.kind).toBe("event");
      const bounded = buildBoundedCurrentProjectionV1({
        high_water_cursor: r2.value.cursor,
        projection_cursor: r2.value.cursor,
        current: [
          {
            node_id: "memory:mem_accepted_1",
            record_id: "mem_accepted_1",
            record_digest: r1.value.recordDigest,
            scope_ref: WORKSPACE_ID,
            valid_time: { t: 100 },
            projection_cursor: r2.value.cursor,
            citation_refs: ["cit-1"],
            ...(eventCommit as unknown as Record<string, unknown>),
          },
        ],
        omitted: [{ record_id: r1.value.eventRecordId, reason: "pending" }],
      });
      const boundedJson = JSON.stringify(bounded);
      // Kills a mutant that copies speech_turn turnText into BoundedCurrentProjectionV1.
      expect(boundedJson).not.toContain(canaryOwner);
      // Kills a mutant that copies raw eventRecordId into BoundedCurrentProjectionV1 objects.
      expect(boundedJson).not.toContain(r1.value.eventRecordId);

      // 3. Full memory-to-graph.json projection pipeline writes zero turn text into .graphify/graph.json.
      const assembled = assembleMemoryGraphProjection({
        high_water_cursor: r2.value.cursor,
        projection_cursor: r2.value.cursor,
        code_node_ids: ["code:src/retry.ts"],
        candidates: [
          {
            record_id: "mem_accepted_1",
            state: "accepted_current",
            projection_eligible: true,
            authorized: true,
            eligible_now: true,
            record_digest: r1.value.recordDigest,
            scope_ref: WORKSPACE_ID,
            valid_time: { t: 100 },
            projection_cursor: r2.value.cursor,
            citation_refs: ["cit-1"],
            code_targets: ["code:src/retry.ts"],
            ...(eventCommit as unknown as Record<string, unknown>),
          } as never,
        ],
      });
      // Kills a mutant that breaks memory graph projection assembly.
      expect(assembled.ok).toBe(true);
      if (!assembled.ok) return;
      attachMemoryProjectionToGraph(baseGraph, assembled.value);
      const projectedGraphJson = JSON.stringify(serializeGraph(baseGraph), null, 2);
      writeFileSync(graphPath, projectedGraphJson, "utf8");
      const finalGraphOnDisk = readFileSync(graphPath, "utf8");
      // Kills a mutant that leaks owner turn text into projected .graphify/graph.json.
      expect(finalGraphOnDisk).not.toContain(canaryOwner);
      // Kills a mutant that leaks assistant turn text into projected .graphify/graph.json.
      expect(finalGraphOnDisk).not.toContain(canaryAssistant);
      // Kills a mutant that leaks contextRequest or turnText fields into projected .graphify/graph.json.
      expect(finalGraphOnDisk).not.toContain("contextRequest");

      // 4. Static guard: none of the session-front / session-context product modules touch fs or graph.json.
      for (const rel of [
        "../src/session-front-contracts.ts",
        "../src/session-front/ingest.ts",
        "../src/session-context/engine.ts",
        "../engram-memory/session-front-engine.ts",
      ]) {
        const src = readFileSync(new URL(rel, import.meta.url), "utf8");
        // Kills a mutant that adds filesystem or graph.json writes to session-front or session-context modules.
        expect(src, rel).not.toMatch(/node:fs|writeFileSync|graph\.json|\.graphify/);
      }
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("t6: hostile inputs are rejected by one strict entry decoder with closed refusals and never throw", async () => {
    const h = createHarness({ journalPolicy: { journalEnabled: true } });
    const base = makeEnvelope({ sourceId: "t6-base", contextRequest: { reset: "restart" } });

    // 1. Accessor / getter properties on envelope, contextRequest, held, or loop must NEVER be invoked (0 calls) and return INVALID_SCHEMA.
    let getterHits = 0;
    const withTopGetter = { ...base };
    Object.defineProperty(withTopGetter, "contextRequest", {
      enumerable: true,
      get() {
        getterHits += 1;
        return { reset: "restart" };
      },
    });
    const withNestedGetter = {
      ...base,
      contextRequest: Object.defineProperty({}, "reset", {
        enumerable: true,
        get() {
          getterHits += 1;
          return "restart";
        },
      }),
    };
    const withHeldGetter = {
      ...base,
      contextRequest: {
        held: Object.defineProperty({ queryId: "q", queryVersion: 1 }, "cursor", {
          enumerable: true,
          get() {
            getterHits += 1;
            return "1";
          },
        }),
      },
    };

    for (const hostile of [withTopGetter, withNestedGetter, withHeldGetter]) {
      const val = validateRawSessionEventEnvelope(hostile);
      // Kills a mutant that accepts getter/accessor properties instead of rejecting them in the strict entry decoder.
      expect(val.ok).toBe(false);
      if (val.ok) return;
      // Kills a mutant that returns an error code other than INVALID_SCHEMA for getter properties.
      expect(val.error.code).toBe("INVALID_SCHEMA");
      const res = await h.front.recordSessionEvent(hostile as RawSessionEventEnvelope);
      // Kills a mutant that reads raw envelope properties a second time or accepts getters in recordSessionEvent.
      expect(res.ok).toBe(false);
    }
    // Kills a mutant that invokes property getters during decoding (TOCTOU / second reader of raw input).
    expect(getterHits).toBe(0);

    // 2. Own "__proto__" key at envelope, contextRequest, held, or loop depth is refused without polluting Object.prototype.
    const protoTop = JSON.parse(`{"__proto__":{"pollutedSj2a":true}}`) as Record<string, unknown>;
    Object.assign(protoTop, base);
    const protoReq = JSON.parse(`{"reset":"restart","__proto__":{"pollutedSj2a":true}}`) as Record<string, unknown>;
    const protoHeld = JSON.parse(`{"queryId":"q","queryVersion":1,"cursor":"1","__proto__":{"pollutedSj2a":true}}`) as Record<string, unknown>;
    const protoLoop = JSON.parse(`{"objectiveLoopId":"l1","trackScope":[],"__proto__":{"pollutedSj2a":true}}`) as Record<string, unknown>;
    const protoOpenAttrs = JSON.parse(`{"__proto__":{"pollutedSj2a":true},"ok":1}`) as Record<string, unknown>;
    const hmiProtoEnv = {
      ...makeEnvelope({
        sourceId: "t6-hmi-proto",
        payload: {
          kind: "external_hmi_input",
          hmiSource: "github-pr-sync",
          externalSourceId: "PR#99@rev1",
          payloadDigest: DIGEST,
          structuredAttributes: protoOpenAttrs,
          citations: [],
        },
      }),
      purposeRef: "memory.capture.hmi/v1" as const,
    };
    for (const hostile of [
      protoTop,
      { ...base, contextRequest: protoReq },
      { ...base, contextRequest: { held: protoHeld } },
      { ...base, contextRequest: { reset: "restart", loop: protoLoop } },
      hmiProtoEnv,
    ]) {
      const val = validateRawSessionEventEnvelope(hostile);
      // Kills a mutant that lets an own "__proto__" key slip through Object.keys / plain assignment into the decoded envelope.
      expect(val.ok).toBe(false);
      if (val.ok) return;
      // Kills a mutant that classifies an own "__proto__" key under a code other than INVALID_SCHEMA.
      expect(val.error.code).toBe("INVALID_SCHEMA");
    }
    // Kills a mutant that mutates Object.prototype when decoding a "__proto__" key.
    expect(({} as Record<string, unknown>).pollutedSj2a).toBeUndefined();

    // 3. Sparse arrays, array subclasses, arrays with extra props, non-enumerable props, symbols, non-plain prototypes, throwing Proxy.
    const sparseScope = new Array(1);
    const holeScope: unknown[] = [];
    holeScope[1] = { repoKey: "r", workspace: "w", aggregateId: "a", role: "b", aggregateKind: "k" };
    class SubArray extends Array {}
    const subScope = new SubArray();
    const extraPropScope = Object.assign([], { evil: 1 });
    const nonEnumReq = { reset: "restart" };
    Object.defineProperty(nonEnumReq, "hidden", { value: 1, enumerable: false });
    const symReq = { reset: "restart", [Symbol("s")]: 1 };
    const customProtoReq = Object.assign(Object.create({ reset: "restart" }), {});
    const throwingProxy = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("hostile proxy trap");
        },
        ownKeys() {
          throw new Error("hostile proxy ownKeys");
        },
      },
    );

    const hostileInputs: unknown[] = [
      { ...base, contextRequest: { reset: "restart", loop: { objectiveLoopId: "l", trackScope: sparseScope } } },
      { ...base, contextRequest: { reset: "restart", loop: { objectiveLoopId: "l", trackScope: holeScope } } },
      { ...base, contextRequest: { reset: "restart", loop: { objectiveLoopId: "l", trackScope: subScope } } },
      { ...base, contextRequest: { reset: "restart", loop: { objectiveLoopId: "l", trackScope: extraPropScope } } },
      { ...base, contextRequest: nonEnumReq },
      { ...base, contextRequest: symReq },
      { ...base, contextRequest: customProtoReq },
      { ...base, contextRequest: throwingProxy },
      throwingProxy,
      null,
      [],
      // Schema & null-prohibition violations inside contextRequest:
      { ...base, contextRequest: null },
      { ...base, contextRequest: [] },
      { ...base, contextRequest: {} },
      { ...base, contextRequest: { held: { queryId: "q", queryVersion: 1, cursor: "1" }, reset: "compaction" } },
      { ...base, contextRequest: { held: null } },
      { ...base, contextRequest: { reset: null } },
      { ...base, contextRequest: { reset: "bogus" } },
      { ...base, contextRequest: { reset: "restart", extra: true } },
      { ...base, contextRequest: { held: { queryId: "q", queryVersion: 1, cursor: "1", extra: true } } },
      { ...base, contextRequest: { held: { queryId: "q", queryVersion: -0, cursor: "1" } } },
      { ...base, contextRequest: { held: { queryId: "q", queryVersion: Number.NaN, cursor: "1" } } },
      { ...base, contextRequest: { reset: "restart", hostSignal: "" } },
      { ...base, contextRequest: { reset: "restart", hostSignal: "x".repeat(65) } },
      { ...base, contextRequest: { reset: "restart", hostSignal: null } },
      { ...base, contextRequest: { reset: "restart", loop: null } },
      { ...base, contextRequest: { reset: "restart", loop: { objectiveLoopId: "l", trackScope: null } } },
      {
        ...base,
        contextRequest: {
          reset: "restart",
          loop: {
            objectiveLoopId: "l",
            trackScope: [{ repoKey: "r", workspace: "w", aggregateId: "a", role: "b", aggregateKind: "k", baselineCommit: null }],
          },
        },
      },
    ];

    for (const hostile of hostileInputs) {
      const val = validateRawSessionEventEnvelope(hostile);
      // Kills a mutant that accepts hostile or malformed contextRequest inputs or throws on them.
      expect(val.ok).toBe(false);
      if (val.ok) return;
      // Kills a mutant that returns an error code other than INVALID_SCHEMA on hostile input.
      expect(val.error.code).toBe("INVALID_SCHEMA");
      // Kills a mutant that marks INVALID_SCHEMA refusals as retryable.
      expect(val.error.retryable).toBe(false);
      const res = await h.front.recordSessionEvent(hostile as RawSessionEventEnvelope);
      // Kills a mutant that lets hostile input pass recordSessionEvent or throw past Result.
      expect(res.ok).toBe(false);
      if (res.ok) return;
      // Kills a mutant that classifies hostile recordSessionEvent input under a code other than INVALID_SCHEMA.
      expect(res.error.code).toBe("INVALID_SCHEMA");
    }
    // Kills a mutant that writes any commit on hostile inputs.
    expect(h.commits.length).toBe(0);

    // 4. Hostile inputs to contextEngine.recomputeDelivery return closed INVALID_SCHEMA and never throw.
    const hostileRecompute: unknown[] = [
      null,
      [],
      throwingProxy,
      { scope: null, eventRecordId: "raw_1" },
      { scope: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID }, eventRecordId: "" },
      { scope: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID }, eventRecordId: "raw_1", reader: null },
      { scope: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID }, eventRecordId: "raw_1", reader: { isLocal: "yes" } },
      { scope: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID }, eventRecordId: "raw_1", reader: { extra: true } },
      JSON.parse(`{"scope":{"tenantId":"t","workspaceId":"w"},"eventRecordId":"raw_1","__proto__":{"polluted":true}}`),
    ];
    for (const hostile of hostileRecompute) {
      const rec = await h.contextEngine!.recomputeDelivery(hostile as never);
      // Kills a mutant that accepts or throws on hostile recomputeDelivery input.
      expect(rec.ok).toBe(false);
      if (rec.ok) return;
      // Kills a mutant that returns an error code other than INVALID_SCHEMA for hostile recomputeDelivery input.
      expect(rec.error.code).toBe("INVALID_SCHEMA");
      // Kills a mutant that marks INVALID_SCHEMA on recomputeDelivery as retryable.
      expect(rec.error.retryable).toBe(false);
    }
  });

  it("t7: idempotent replay returns the original delivery and conflicting contextRequest is refused with DIGEST_CONFLICT", async () => {
    const keyA: SessionContextEngineKeyV1 = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: "AGENTS",
      sessionId: SESSION_A,
    };
    const keyB: SessionContextEngineKeyV1 = { ...keyA, sessionId: SESSION_B };
    const h = createHarness({ journalPolicy: { journalEnabled: true } });
    const engine = h.contextEngine!;
    await engine.noteSessionEvent(keyA);
    await engine.notePinnedRequest(keyA, "initial request");

    const env = makeEnvelope({
      sourceId: "t7-idem",
      payload: speechPayload(SESSION_A, 1, "first turn"),
      contextRequest: { reset: "restart" },
    });
    const first = await h.front.recordSessionEvent(env);
    // Kills a mutant that fails initial delivery before idempotency replay.
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const commitsAfterFirst = h.commits.length;

    // Advance journal state after first call (new outside decision must NOT alter replayed delivery!).
    await engine.noteDecision(keyB, "later decision after first call", SESSION_B);
    const commitsBeforeReplay = h.commits.length;

    const replay = await h.front.recordSessionEvent(env);
    // Kills a mutant that fails exact idempotent replay of an event with contextRequest.
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    // Kills a mutant that returns status recorded instead of duplicate_exact on replay.
    expect(replay.value.status).toBe("duplicate_exact");
    // Kills a mutant that changes eventRecordId, cursor, readySlices, readySlicePayloads, or contextDelivery on replay.
    expect(replay.value).toEqual({ ...first.value, status: "duplicate_exact" });
    // Kills a mutant that appends a duplicate commit on idempotent replay.
    expect(h.commits.length).toBe(commitsBeforeReplay);
    // Kills a mutant that wrote extra commits during initial recording beyond query v1, v2, and the single event commit.
    expect(commitsAfterFirst).toBe(3);

    // Same idempotencyKey with a DIFFERENT contextRequest -> DIGEST_CONFLICT!
    const conflict = await h.front.recordSessionEvent({
      ...env,
      contextRequest: { reset: "compaction" },
    });
    // Kills a mutant that ignores contextRequest when computing inputDigest for idempotency conflict detection.
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    // Kills a mutant that returns a code other than DIGEST_CONFLICT when contextRequest differs under the same idempotencyKey.
    expect(conflict.error.code).toBe("DIGEST_CONFLICT");
    // Kills a mutant that writes a commit on DIGEST_CONFLICT.
    expect(h.commits.length).toBe(commitsBeforeReplay);
  });

  it("t8: post-prepare refusals commit zero records without mutating queries, retry succeeds cleanly, and a crash between the two writes recovers on replay", async () => {
    // Store contract note: SessionFrontTransactionV1 exposes one immutable `cursor` per transaction and
    // stages a single canonical commit, so the event record and `session_context_query` v1 cannot share
    // one commit without colliding cursors. Durable order is therefore:
    //   1. Prepare `{ queryId, queryVersion }` purely in memory (zero store writes, zero `queries` map mutation).
    //   2. Write 1: commit the event record (`EventCommit`, idempotent on `envelope.idempotencyKey`).
    //   3. Write 2: persist `session_context_query` v1 (`sj1a:${queryId}:v1`, deterministic from `key`).
    // Why this order is durable and replay recovers a crash between Write 1 and Write 2:
    // - Reversing the order (query v1 first, event second) commits an orphan `session_context_query` v1 on
    //   any refusal/failure of `recordEvent` (DIGEST_CONFLICT, non-canonical cursor, STORE_UNAVAILABLE, etc.).
    // - With event first and query second, every `recordEvent` refusal commits zero records and leaves
    //   `contextEngine`'s query map untouched; if a crash or outage occurs between Write 1 and Write 2,
    //   replaying the exact same envelope hits `duplicate_exact` on Write 1 (keeping the original
    //   `eventRecordId`, `cursor`, and `answeredWatermark`), completes Write 2 idempotently, populates
    //   `queries` with v1, and recomputes the exact delivery.

    // 1. DIGEST_CONFLICT on a fresh key carrying contextRequest commits zero records and leaves queries unchanged.
    const freshKey: SessionContextEngineKeyV1 = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: "AGENTS",
      sessionId: SESSION_B,
    };
    const freshQid = independentQueryId(freshKey);
    const freshV1Digest = independentQueryDigest(freshKey, 1, []);

    const hConflict = createHarness({ journalPolicy: { journalEnabled: true } });
    const seedUnassigned = makeEnvelope({
      sourceId: "t8-shared-idem",
      sessionPseudoId: SESSION_A,
      mandateRef: null,
      payload: speechPayload(SESSION_A, 1, "unassigned seed turn"),
    });
    const seeded = await hConflict.front.recordSessionEvent(seedUnassigned);
    // Kills a mutant that breaks seeding an initial unassigned event before DIGEST_CONFLICT probing.
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;
    // Kills a mutant that writes an unexpected number of commits for the seed unassigned event (event + query v1).
    expect(hConflict.commits.length).toBe(2);

    const conflictingOnFreshKey = makeEnvelope({
      sourceId: "t8-shared-idem",
      sessionPseudoId: SESSION_B,
      mandateRef: mandateFor("AGENTS"),
      payload: speechPayload(SESSION_B, 1, "conflicting turn on fresh key"),
      contextRequest: { reset: "restart" },
    });
    const conflictRes = await hConflict.front.recordSessionEvent(conflictingOnFreshKey);
    // Kills a mutant that accepts a conflicting idempotencyKey on a fresh key with contextRequest.
    expect(conflictRes.ok).toBe(false);
    if (conflictRes.ok) return;
    // Kills a mutant that returns a code other than DIGEST_CONFLICT when idempotencyKey collides on a fresh key.
    expect(conflictRes.error.code).toBe("DIGEST_CONFLICT");
    // Kills a mutant that marks DIGEST_CONFLICT as retryable.
    expect(conflictRes.error.retryable).toBe(false);
    // Kills a mutant that calls noteSessionEvent before recordEvent and commits an orphan session_context_query v1 on DIGEST_CONFLICT.
    expect(hConflict.commits.length).toBe(2);
    // Kills a mutant that mutates contextEngine's in-memory queries map before recordEvent succeeds on DIGEST_CONFLICT.
    expect(hConflict.contextEngine!.getQuery(freshQid, 1)).toBeUndefined();
    // Kills a mutant that leaks an uncommitted query into evaluateView after DIGEST_CONFLICT.
    expect(hConflict.contextEngine!.evaluateView(freshKey)).toBeUndefined();
    // Kills a mutant that binds keyOfSession in memory before recordEvent succeeds on DIGEST_CONFLICT.
    expect(await hConflict.contextEngine!.lastWatermark(SESSION_B)).toEqual({
      queryId: "query_pending",
      queryVersion: 1,
      cursor: "0",
    });

    // Retrying on the fresh key with a non-conflicting idempotencyKey succeeds cleanly as if the refused call never happened.
    const cleanFresh = await hConflict.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t8-fresh-clean",
        sessionPseudoId: SESSION_B,
        mandateRef: mandateFor("AGENTS"),
        payload: speechPayload(SESSION_B, 1, "clean turn on fresh key"),
        contextRequest: { reset: "restart" },
      }),
    );
    // Kills a mutant whose failed DIGEST_CONFLICT poisons a subsequent clean call on the same fresh key.
    expect(cleanFresh.ok).toBe(true);
    if (!cleanFresh.ok || !cleanFresh.value.contextDelivery) return;
    // Kills a mutant that returns duplicate_exact instead of recorded on the clean call after DIGEST_CONFLICT.
    expect(cleanFresh.value.status).toBe("recorded");
    // Kills a mutant that skips committing the event or query v1 after recovering from DIGEST_CONFLICT.
    expect(hConflict.commits.length).toBe(4);
    // Kills a mutant that assigns a wrong cursor to the clean event commit after DIGEST_CONFLICT (must be cursor "3", not "4").
    expect(cleanFresh.value.cursor).toBe("3");
    // Kills a mutant that omits or corrupts the watermark or queryDigest on the clean call after DIGEST_CONFLICT.
    expect(cleanFresh.value.contextDelivery.watermark).toEqual({
      queryId: freshQid,
      queryVersion: 1,
      cursor: "3",
    });
    // Kills a mutant that computes a wrong v1 queryDigest on the clean call after DIGEST_CONFLICT.
    expect(cleanFresh.value.contextDelivery.queryDigest).toBe(freshV1Digest);
    // Kills a mutant that fails to register v1 in contextEngine after the clean call succeeds.
    expect(hConflict.contextEngine!.getQuery(freshQid, 1)?.digest).toBe(freshV1Digest);

    // Original unassigned call still replays cleanly with zero extra commits.
    const seedReplay = await hConflict.front.recordSessionEvent(seedUnassigned);
    // Kills a mutant that corrupts the original replay record after a conflicting call on another key.
    expect(seedReplay.ok).toBe(true);
    if (!seedReplay.ok) return;
    // Kills a mutant that fails to recognize the original call as duplicate_exact after a conflict refusal.
    expect(seedReplay.value.status).toBe("duplicate_exact");
    // Kills a mutant that appends extra commits when replaying the original call.
    expect(hConflict.commits.length).toBe(4);

    // 2. Every refusal/failure path reachable AFTER the context query is prepared:
    //    store returns STORE_UNAVAILABLE, store returns non-retryable UNAUTHORIZED, store throws,
    //    store throws CanonicalJsonError (INVALID_SCHEMA), non-canonical tx.cursor, tx.readReplay throws,
    //    tx.readReplay returns mismatched kind ("extraction" -> DIGEST_CONFLICT), tx.write throws,
    //    and post-apply commit failure (fsync/durable commit rejects).
    type FaultMode =
      | "store_unavailable"
      | "store_unauthorized"
      | "transact_throw"
      | "canonical_json_error"
      | "bad_cursor"
      | "read_replay_throw"
      | "replay_kind_mismatch"
      | "write_throw"
      | "post_apply_throw";

    const faultCases: ReadonlyArray<{
      readonly mode: FaultMode;
      readonly expectedCode: string;
      readonly expectedRetryable: boolean;
    }> = [
      { mode: "store_unavailable", expectedCode: "STORE_UNAVAILABLE", expectedRetryable: true },
      { mode: "store_unauthorized", expectedCode: "UNAUTHORIZED", expectedRetryable: false },
      { mode: "transact_throw", expectedCode: "STORE_UNAVAILABLE", expectedRetryable: true },
      { mode: "canonical_json_error", expectedCode: "INVALID_SCHEMA", expectedRetryable: false },
      { mode: "bad_cursor", expectedCode: "STORE_UNAVAILABLE", expectedRetryable: true },
      { mode: "read_replay_throw", expectedCode: "STORE_UNAVAILABLE", expectedRetryable: true },
      { mode: "replay_kind_mismatch", expectedCode: "DIGEST_CONFLICT", expectedRetryable: false },
      { mode: "write_throw", expectedCode: "STORE_UNAVAILABLE", expectedRetryable: true },
      { mode: "post_apply_throw", expectedCode: "STORE_UNAVAILABLE", expectedRetryable: true },
    ];

    for (const faultCase of faultCases) {
      const commits: SessionFrontCommitV1[] = [];
      let activeFault: FaultMode | null = faultCase.mode;

      const faultStore: SessionFrontStoreV1 = {
        async transact(scopeArg, apply) {
          if (activeFault === "store_unavailable") {
            return {
              ok: false,
              error: { operation: "capture", code: "STORE_UNAVAILABLE", message: "injected store down", retryable: true },
            };
          }
          if (activeFault === "store_unauthorized") {
            return {
              ok: false,
              error: { operation: "capture", code: "UNAUTHORIZED", message: "injected store scope denied", retryable: false },
            };
          }
          if (activeFault === "transact_throw") throw new Error("injected transact boom");
          if (activeFault === "canonical_json_error") throw new CanonicalJsonError("injected canonical error");

          const writes: SessionFrontCommitV1[] = [];
          const tx: SessionFrontTransactionV1 = {
            cursor: activeFault === "bad_cursor" ? "01" : String(commits.length + 1),
            async readReplay(kind, idempotencyKey) {
              if (activeFault === "read_replay_throw") throw new Error("injected readReplay boom");
              if (activeFault === "replay_kind_mismatch") {
                return {
                  kind: "extraction",
                  inputDigest: DIGEST,
                  receipt: {
                    status: "committed",
                    batchCursor: "1",
                    outcomes: [],
                    d7BlockedKeys: [],
                    sourceDispositions: {},
                    transactionReceiptDigest: DIGEST,
                  },
                };
              }
              return commits.find(
                (c) =>
                  c.kind === kind &&
                  c.idempotencyKey === idempotencyKey &&
                  c.scope.tenantId === scopeArg.tenantId &&
                  c.scope.workspaceId === scopeArg.workspaceId,
              );
            },
            async readEvent(id) {
              const entry = commits.find((c) => c.kind === "event" && c.receipt.eventRecordId === id);
              if (entry?.kind !== "event") return undefined;
              return {
                scope: entry.scope,
                disposition: entry.receipt.extractionDisposition,
                ...(entry.ordinal !== undefined ? { ordinal: entry.ordinal.throughOrdinal } : {}),
                sessionRef: entry.event.sessionRef,
                ...(entry.contextRecord !== undefined ? { contextRecord: structuredClone(entry.contextRecord) } : {}),
              };
            },
            async write(commit) {
              if (activeFault === "write_throw") throw new Error("injected write boom");
              writes.push(structuredClone(commit));
            },
          };
          const outcome = await apply(tx);
          if (activeFault === "post_apply_throw") throw new Error("injected durable commit failure");
          if (outcome.ok) commits.push(...writes);
          return outcome;
        },
      };

      const engine = createSessionContextEngineV1({
        store: faultStore,
        actorRef: ACTOR_A,
        cloneId: CLONE_ID,
        now: () => NOW,
      });
      const front = createEngramSessionIngestFront({
        store: faultStore,
        authorize: () => ({ ok: true, value: { hasMemoryIdentity: true } }),
        getReadySlices: () => ({ readySlices: [] }),
        screenCandidate: () => ({ ok: true, value: "allow" }),
        journalPolicy: { journalEnabled: true },
        contextEngine: engine,
      });

      const env = makeEnvelope({
        sourceId: `t8-fault-${faultCase.mode}`,
        sessionPseudoId: SESSION_B,
        mandateRef: mandateFor("AGENTS"),
        payload: speechPayload(SESSION_B, 1, `fault path ${faultCase.mode}`),
        contextRequest: { reset: "restart" },
      });

      const failed = await front.recordSessionEvent(env);
      // Kills a mutant that succeeds despite a post-prepare recordEvent refusal or failure.
      expect(failed.ok, faultCase.mode).toBe(false);
      if (failed.ok) return;
      // Kills a mutant that misclassifies a post-prepare recordEvent refusal or failure code.
      expect(failed.error.code, faultCase.mode).toBe(faultCase.expectedCode);
      // Kills a mutant that sets wrong retryable flag on a post-prepare recordEvent refusal or failure.
      expect(failed.error.retryable, faultCase.mode).toBe(faultCase.expectedRetryable);
      // Kills a mutant that persists session_context_query v1 before recordEvent succeeds on any refusal/failure path.
      expect(commits.length, faultCase.mode).toBe(0);
      // Kills a mutant that mutates contextEngine's queries map before recordEvent succeeds on any refusal/failure path.
      expect(engine.getQuery(freshQid, 1), faultCase.mode).toBeUndefined();
      // Kills a mutant that mutates evaluateView before recordEvent succeeds on any refusal/failure path.
      expect(engine.evaluateView(freshKey), faultCase.mode).toBeUndefined();
      // Kills a mutant that mutates keyOfSession before recordEvent succeeds on any refusal/failure path.
      expect(await engine.lastWatermark(SESSION_B), faultCase.mode).toEqual({
        queryId: "query_pending",
        queryVersion: 1,
        cursor: "0",
      });

      // Clear the fault and retry the EXACT SAME envelope: must succeed as if the refused call never happened!
      activeFault = null;
      const retried = await front.recordSessionEvent(env);
      // Kills a mutant where a refused/failed call poisons retrying the exact same envelope afterwards.
      expect(retried.ok, `${faultCase.mode} retry`).toBe(true);
      if (!retried.ok || !retried.value.contextDelivery) return;
      // Kills a mutant that treats a clean retry after a 0-commit failure as duplicate_exact instead of recorded.
      expect(retried.value.status, `${faultCase.mode} retry`).toBe("recorded");
      // Kills a mutant that leaves cursor drift from the refused call (clean first write must land at cursor "1").
      expect(retried.value.cursor, `${faultCase.mode} retry`).toBe("1");
      // Kills a mutant that commits the wrong number of records on clean retry (event + query v1 = 2).
      expect(commits.length, `${faultCase.mode} retry`).toBe(2);
      // Kills a mutant that writes query v1 before the event commit (durable order must be event then query v1).
      expect(commits.map((c) => (c.kind === "event" ? c.event.payload.kind : c.kind)), `${faultCase.mode} retry`).toEqual([
        "speech_turn",
        "session_context_query",
      ]);
      // Kills a mutant that stamps a wrong watermark on clean retry after a post-prepare failure.
      expect(retried.value.contextDelivery.watermark, `${faultCase.mode} retry`).toEqual({
        queryId: freshQid,
        queryVersion: 1,
        cursor: "1",
      });
      // Kills a mutant that stamps a wrong queryDigest on clean retry after a post-prepare failure.
      expect(retried.value.contextDelivery.queryDigest, `${faultCase.mode} retry`).toBe(freshV1Digest);
      // Kills a mutant that fails to register v1 in queries after clean retry succeeds.
      expect(engine.getQuery(freshQid, 1)?.digest, `${faultCase.mode} retry`).toBe(freshV1Digest);
    }

    // 3. Crash between Write 1 (event commit) and Write 2 (session_context_query v1 persistence):
    //    test both surviving-engine replay AND fresh-engine (process restart) replay over the same durable store.
    for (const restartEngine of [false, true]) {
      const label = restartEngine ? "process-restart-replay" : "same-engine-replay";
      const commits: SessionFrontCommitV1[] = [];
      let transactCount = 0;
      let failWrite2Once = true;

      const crashStore: SessionFrontStoreV1 = {
        async transact(scopeArg, apply) {
          transactCount += 1;
          // Write 1 is the event commit (transactCount === 1); Write 2 is session_context_query v1 (transactCount === 2).
          if (failWrite2Once && transactCount === 2) {
            failWrite2Once = false;
            return {
              ok: false,
              error: { operation: "capture", code: "STORE_UNAVAILABLE", message: "simulated crash before write 2", retryable: true },
            };
          }
          const writes: SessionFrontCommitV1[] = [];
          const outcome = await apply({
            cursor: String(commits.length + 1),
            async readReplay(kind, idempotencyKey) {
              return commits.find(
                (c) =>
                  c.kind === kind &&
                  c.idempotencyKey === idempotencyKey &&
                  c.scope.tenantId === scopeArg.tenantId &&
                  c.scope.workspaceId === scopeArg.workspaceId,
              );
            },
            async readEvent(id) {
              const entry = commits.find((c) => c.kind === "event" && c.receipt.eventRecordId === id);
              if (entry?.kind !== "event") return undefined;
              return {
                scope: entry.scope,
                disposition: entry.receipt.extractionDisposition,
                ...(entry.ordinal !== undefined ? { ordinal: entry.ordinal.throughOrdinal } : {}),
                sessionRef: entry.event.sessionRef,
                ...(entry.contextRecord !== undefined ? { contextRecord: structuredClone(entry.contextRecord) } : {}),
              };
            },
            async write(commit) {
              writes.push(structuredClone(commit));
            },
          });
          if (outcome.ok) commits.push(...writes);
          return outcome;
        },
      };

      const makePair = () => {
        const ctxEngine = createSessionContextEngineV1({
          store: crashStore,
          actorRef: ACTOR_A,
          cloneId: CLONE_ID,
          now: () => NOW,
        });
        const front = createEngramSessionIngestFront({
          store: crashStore,
          authorize: () => ({ ok: true, value: { hasMemoryIdentity: true } }),
          getReadySlices: () => ({ readySlices: [] }),
          screenCandidate: () => ({ ok: true, value: "allow" }),
          journalPolicy: { journalEnabled: true },
          contextEngine: ctxEngine,
        });
        return { ctxEngine, front };
      };

      const firstPair = makePair();
      const env = makeEnvelope({
        sourceId: `t8-crash-${label}`,
        sessionPseudoId: SESSION_B,
        mandateRef: mandateFor("AGENTS"),
        payload: speechPayload(SESSION_B, 1, "turn interrupted between write 1 and write 2"),
        contextRequest: { reset: "restart" },
      });

      const crashed = await firstPair.front.recordSessionEvent(env);
      // Kills a mutant that swallows a Write 2 (persistQuery) failure after Write 1 committed.
      expect(crashed.ok, label).toBe(false);
      if (crashed.ok) return;
      // Kills a mutant that returns a non-STORE_UNAVAILABLE error when Write 2 fails after Write 1 committed.
      expect(crashed.error.code, label).toBe("STORE_UNAVAILABLE");
      // Kills a mutant that marks a crash between the two writes as non-retryable (blocking replay recovery).
      expect(crashed.error.retryable, label).toBe(true);
      // Kills a mutant that wrote query v1 first instead of committing the event first (Write 1 must be the event).
      expect(commits.length, label).toBe(1);
      // Kills a mutant whose Write 1 commit is not the speech_turn event carrying contextRecord.
      expect(commits[0]?.kind === "event" ? commits[0].event.payload.kind : undefined, label).toBe("speech_turn");
      const durableEventId = commits[0]?.kind === "event" ? commits[0].receipt.eventRecordId : "";
      // Kills a mutant that commits v1 into contextEngine's in-memory queries map when persistQuery fails.
      expect(firstPair.ctxEngine.getQuery(freshQid, 1), label).toBeUndefined();

      // Replay the exact same call (either on the same engine or a fresh post-restart engine over the same store).
      const recoveryPair = restartEngine ? makePair() : firstPair;
      const recovered = await recoveryPair.front.recordSessionEvent(env);
      // Kills a mutant where replaying the same call fails to recover from a crash between Write 1 and Write 2.
      expect(recovered.ok, label).toBe(true);
      if (!recovered.ok || !recovered.value.contextDelivery) return;
      // Kills a mutant that duplicates Write 1 instead of hitting duplicate_exact on replay recovery.
      expect(recovered.value.status, label).toBe("duplicate_exact");
      // Kills a mutant that changes eventRecordId on replay recovery after a crash between Write 1 and Write 2.
      expect(recovered.value.eventRecordId, label).toBe(durableEventId);
      // Kills a mutant that changes the answered cursor from Write 1 ("1") on replay recovery.
      expect(recovered.value.cursor, label).toBe("1");
      // Kills a mutant that duplicates the event or skips Write 2 during replay recovery (must be [speech_turn, session_context_query]).
      expect(commits.map((c) => (c.kind === "event" ? c.event.payload.kind : c.kind)), label).toEqual([
        "speech_turn",
        "session_context_query",
      ]);
      // Kills a mutant that loses watermark or queryDigest when recovering delivery on replay.
      expect(recovered.value.contextDelivery.watermark, label).toEqual({
        queryId: freshQid,
        queryVersion: 1,
        cursor: "1",
      });
      // Kills a mutant that computes a wrong queryDigest on replay recovery.
      expect(recovered.value.contextDelivery.queryDigest, label).toBe(freshV1Digest);
      // Kills a mutant that fails to populate v1 in contextEngine's queries map on replay recovery.
      expect(recoveryPair.ctxEngine.getQuery(freshQid, 1)?.digest, label).toBe(freshV1Digest);

      // Follow-up diff call using the recovered watermark succeeds cleanly with 0 bytes.
      const followUp = await recoveryPair.front.recordSessionEvent(
        makeEnvelope({
          sourceId: `t8-crash-follow-${label}`,
          sessionPseudoId: SESSION_B,
          mandateRef: mandateFor("AGENTS"),
          payload: speechPayload(SESSION_B, 2, "follow-up after crash recovery"),
          contextRequest: { held: recovered.value.contextDelivery.watermark },
        }),
      );
      // Kills a mutant where recovered watermark fails on the next diff call.
      expect(followUp.ok, label).toBe(true);
      if (!followUp.ok || !followUp.value.contextDelivery) return;
      // Kills a mutant that falls back to full mode instead of diff after crash-recovery replay.
      expect(followUp.value.contextDelivery.mode, label).toBe("diff");
      // Kills a mutant that emits unexpected items on an unchanged diff after crash-recovery replay.
      expect(followUp.value.contextDelivery.items, label).toEqual([]);
      // Kills a mutant that reports non-zero byteLength on an unchanged diff after crash-recovery replay.
      expect(followUp.value.contextDelivery.byteLength, label).toBe(0);
    }
  });

  it("t9: direct L0 recordEvent rejects falsy/non-object contextRequest and invalid or accessor contextQuery with INVALID_SCHEMA and zero commits", async () => {
    const h = createHarness({ withEngine: false });
    const l0 = createSessionFrontEngineV1(h.store);
    const baseInput = {
      scope: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID },
      idempotencyKey: deriveSessionFrontIdempotencyKey({ sourceKind: "t9-l0", sourceId: "base" }),
      worktreeId: WORKTREE_ID,
      sessionRef: SESSION_A,
      purposeRef: "memory.capture.session/v1",
      retention: { derivative_rule: "retain" as const },
      actorRef: ACTOR_A,
      cloneId: CLONE_ID,
      assignmentDigest: null,
      occurredAt: NOW,
      payload: { kind: "speech_turn" as const },
      queueExtraction: false,
    };
    const validQuery = { queryId: "query_valid12345678", queryVersion: 1 };

    // 1. Falsy or non-plain-object contextRequest values (including null) must fail closed with INVALID_SCHEMA.
    const invalidContextRequests: unknown[] = [null, false, 0, "", 42, "restart", [], new Date(0)];
    for (const [idx, badReq] of invalidContextRequests.entries()) {
      for (const queryArg of [validQuery, undefined]) {
        const res = await l0.recordEvent(
          {
            ...baseInput,
            idempotencyKey: deriveSessionFrontIdempotencyKey({ sourceKind: "t9-req", sourceId: `${idx}-${queryArg ? "q" : "nq"}` }),
            contextRequest: badReq as unknown as Readonly<Record<string, unknown>>,
          },
          { syncState: "synced" },
          queryArg,
        );
        // Kills a mutant that accepts falsy/non-object contextRequest (such as null, false, 0, "") and silently drops contextRecord.
        expect(res.ok, `badReq=${String(badReq)}`).toBe(false);
        if (res.ok) return;
        // Kills a mutant that returns an error code other than INVALID_SCHEMA for non-plain-object contextRequest.
        expect(res.error.code, `badReq=${String(badReq)}`).toBe("INVALID_SCHEMA");
        // Kills a mutant that marks INVALID_SCHEMA for invalid contextRequest as retryable.
        expect(res.error.retryable, `badReq=${String(badReq)}`).toBe(false);
      }
    }

    // 2. Accessor/getter, throwing Proxy, or invalid contextQuery inputs must fail closed with INVALID_SCHEMA (0 getter invocations, never STORE_UNAVAILABLE).
    let getterHits = 0;
    const throwingQueryIdGetter = Object.defineProperty({ queryVersion: 1 }, "queryId", {
      enumerable: true,
      get() {
        getterHits += 1;
        throw new Error("getter should never be invoked");
      },
    });
    const throwingVersionGetter = Object.defineProperty({ queryId: "query_getter" }, "queryVersion", {
      enumerable: true,
      get() {
        getterHits += 1;
        throw new Error("getter should never be invoked");
      },
    });
    const throwingProxy = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("proxy trap");
        },
        ownKeys() {
          throw new Error("proxy ownKeys");
        },
      },
    );
    const nonEnumQuery = { queryId: "query_nonenum", queryVersion: 1 };
    Object.defineProperty(nonEnumQuery, "hidden", { value: true, enumerable: false });
    const symQuery = { queryId: "query_sym", queryVersion: 1, [Symbol("s")]: true };
    const customProtoQuery = Object.assign(Object.create({ queryId: "query_proto" }), { queryVersion: 1 });
    const protoKeyQuery = JSON.parse(`{"queryId":"query_proto_key","queryVersion":1,"__proto__":{"pollutedL0":true}}`);

    const invalidQueries: unknown[] = [
      null,
      [],
      "query_str",
      42,
      {},
      { queryId: "", queryVersion: 1 },
      { queryId: 123, queryVersion: 1 },
      { queryId: "query_ok", queryVersion: 0 },
      { queryId: "query_ok", queryVersion: -1 },
      { queryId: "query_ok", queryVersion: -0 },
      { queryId: "query_ok", queryVersion: 1.5 },
      { queryId: "query_ok", queryVersion: Number.NaN },
      { queryId: "query_ok", queryVersion: Number.POSITIVE_INFINITY },
      { queryId: "query_ok", queryVersion: Number.MAX_SAFE_INTEGER + 1 },
      { queryId: "query_ok", queryVersion: "1" },
      { queryId: "query_ok", queryVersion: 1, extra: true },
      throwingQueryIdGetter,
      throwingVersionGetter,
      throwingProxy,
      nonEnumQuery,
      symQuery,
      customProtoQuery,
      protoKeyQuery,
    ];

    for (const [idx, badQuery] of invalidQueries.entries()) {
      for (const withReq of [true, false]) {
        const res = await l0.recordEvent(
          {
            ...baseInput,
            idempotencyKey: deriveSessionFrontIdempotencyKey({ sourceKind: "t9-query", sourceId: `${idx}-${withReq}` }),
            ...(withReq ? { contextRequest: { reset: "restart" } } : {}),
          },
          { syncState: "synced" },
          badQuery as unknown as { readonly queryId: string; readonly queryVersion: number },
        );
        // Kills a mutant that accepts invalid, non-positive, non-integer, or accessor contextQuery values in L0 recordEvent.
        expect(res.ok, `idx=${idx} withReq=${withReq}`).toBe(false);
        if (res.ok) return;
        // Kills a mutant that classifies accessor/Proxy/invalid contextQuery as STORE_UNAVAILABLE instead of INVALID_SCHEMA.
        expect(res.error.code, `idx=${idx} withReq=${withReq}`).toBe("INVALID_SCHEMA");
        // Kills a mutant that marks invalid contextQuery refusals as retryable.
        expect(res.error.retryable, `idx=${idx} withReq=${withReq}`).toBe(false);
      }
    }

    // Kills a mutant that invokes getters on contextQuery instead of inspecting descriptors once before transact.
    expect(getterHits).toBe(0);
    // Kills a mutant that writes any store commit on invalid L0 contextRequest or contextQuery inputs.
    expect(h.commits.length).toBe(0);
    // Kills a mutant that pollutes Object.prototype from a __proto__ key on contextQuery.
    expect(({} as Record<string, unknown>).pollutedL0).toBeUndefined();

    // Valid plain-object contextRequest + valid plain-object contextQuery commits cleanly.
    const good = await l0.recordEvent(
      {
        ...baseInput,
        idempotencyKey: deriveSessionFrontIdempotencyKey({ sourceKind: "t9-good", sourceId: "ok" }),
        contextRequest: { reset: "restart" },
      },
      { syncState: "synced" },
      validQuery,
    );
    // Kills a mutant whose L0 validation over-rejects a valid plain contextRequest and valid contextQuery.
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    // Kills a mutant that omits or corrupts contextRecord on a valid direct L0 recordEvent call.
    expect(good.value.contextRecord).toEqual({
      request: { reset: "restart" },
      answeredWatermark: { queryId: validQuery.queryId, queryVersion: 1, cursor: "1" },
    });
  });

  it("t10: annotatedThroughOrdinal ignores ordinals from foreign sessions cited in an extraction batch", async () => {
    const h = createHarness({ journalPolicy: { journalEnabled: true } });

    const evB = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t10-sess-b-ord42",
        sessionPseudoId: SESSION_B,
        payload: speechPayload(SESSION_B, 42, "foreign session turn at ordinal 42"),
      }),
    );
    const evA = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t10-sess-a-ord1",
        sessionPseudoId: SESSION_A,
        payload: speechPayload(SESSION_A, 1, "own session turn at ordinal 1"),
        contextRequest: { reset: "restart" },
      }),
    );
    // Kills a mutant that breaks recording events for SESSION_A or SESSION_B in the cross-session ordinal test.
    expect(evA.ok && evB.ok).toBe(true);
    if (!evA.ok || !evB.ok || !evA.value.contextDelivery) return;

    // 1. Extraction batch for SESSION_A citing ONLY SESSION_B's event (ordinal 42) must NOT set SESSION_A's annotatedThroughOrdinal.
    const extForeignOnly = await h.front.recordExtraction(
      makeExtractionBatch([evB.value.eventRecordId], "t10-ext-foreign-only", SESSION_A),
    );
    // Kills a mutant that refuses a valid extraction batch citing another session's committed event in the same scope.
    expect(extForeignOnly.ok).toBe(true);

    const afterForeignOnly = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t10-sess-a-ord2",
        sessionPseudoId: SESSION_A,
        payload: speechPayload(SESSION_A, 2, "turn 2 after foreign-only extraction"),
        contextRequest: { held: evA.value.contextDelivery.watermark },
      }),
    );
    // Kills a mutant that fails delivery for SESSION_A after a foreign-only extraction batch.
    expect(afterForeignOnly.ok).toBe(true);
    if (!afterForeignOnly.ok || !afterForeignOnly.value.contextDelivery) return;
    // Kills a mutant that aggregates foreign session ordinals (42) into SESSION_A's annotatedThroughOrdinal.
    expect(Object.hasOwn(afterForeignOnly.value.contextDelivery, "annotatedThroughOrdinal")).toBe(false);

    // 2. Extraction batch for SESSION_A citing BOTH SESSION_A (ordinal 1) and SESSION_B (ordinal 42) must report 1, never 42.
    const extMixed = await h.front.recordExtraction(
      makeExtractionBatch([evA.value.eventRecordId, evB.value.eventRecordId], "t10-ext-mixed", SESSION_A),
    );
    // Kills a mutant that fails committing a mixed-session extraction batch.
    expect(extMixed.ok).toBe(true);

    const afterMixed = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t10-sess-a-ord3",
        sessionPseudoId: SESSION_A,
        payload: speechPayload(SESSION_A, 3, "turn 3 after mixed extraction"),
        contextRequest: { held: afterForeignOnly.value.contextDelivery.watermark },
      }),
    );
    // Kills a mutant that fails delivery for SESSION_A after a mixed-session extraction batch.
    expect(afterMixed.ok).toBe(true);
    if (!afterMixed.ok || !afterMixed.value.contextDelivery) return;
    // Kills a mutant that fails to gate maxOrdinal on record.sessionRef === extraction.sessionRef (would report 42 instead of 1).
    expect(afterMixed.value.contextDelivery.annotatedThroughOrdinal).toBe(1);

    // 3. Backwards compatibility: when a store's readEvent omits sessionRef (undefined), ordinal is still aggregated.
    const legacyStore: SessionFrontStoreV1 = {
      async transact(_scopeArg, apply) {
        return apply({
          cursor: "5",
          async readReplay() {
            return undefined;
          },
          async readEvent(id) {
            return id === "raw_legacy_1"
              ? { scope: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID }, disposition: "pending_extraction", ordinal: 7 }
              : undefined;
          },
          async write() {},
        });
      },
    };
    const l0Legacy = createSessionFrontEngineV1(legacyStore);
    const legacyExt = await l0Legacy.recordExtraction(
      {
        scope: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID },
        idempotencyKey: deriveSessionFrontIdempotencyKey({ sourceKind: "t10-legacy", sourceId: "1" }),
        worktreeId: WORKTREE_ID,
        sessionRef: SESSION_A,
        purposeRef: "memory.capture.session/v1",
        retention: { derivative_rule: "retain" },
        sourceEventRecordIds: ["raw_legacy_1"],
        extractor: { kind: "light-permanent-llm" },
        candidates: [],
      },
      () => ({ ok: true, value: "allow" }),
    );
    // Kills a mutant that breaks ordinal aggregation when a legacy store's readEvent omits sessionRef.
    expect(legacyExt.ok).toBe(true);
    if (!legacyExt.ok) return;
    // Kills a mutant that drops annotatedThroughOrdinal when record.sessionRef is undefined.
    expect(legacyExt.value.annotatedThroughOrdinal).toBe(7);
  });

  it("t11: valid held watermark syncs tracked refs so subsequent unreadable watermarks do not re-emit settled replacements", async () => {
    const keyA: SessionContextEngineKeyV1 = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      derivedWorktreeId: WORKTREE_ID,
      roleRef: "AGENTS",
      sessionId: SESSION_A,
    };
    const keyB: SessionContextEngineKeyV1 = { ...keyA, sessionId: SESSION_B };
    const expectedQid = independentQueryId(keyA);
    const pinnedText = "keep retry cap at 5";
    const dec1Text = "decision-1: initial backoff 100ms";
    const dec2Text = "decision-2: exponential backoff 200ms";
    const dec3Text = "decision-3: add jitter";

    const h = createHarness({ journalPolicy: { journalEnabled: true } });
    const engine = h.contextEngine!;
    await engine.noteSessionEvent(keyA); // cursor 1
    await engine.notePinnedRequest(keyA, pinnedText); // cursor 2
    await engine.noteDecision(keyB, dec1Text, SESSION_B); // cursor 3
    const dec1Ref = `decision:${expectedQid}:${independentSha256(dec1Text).slice(7, 15)}:1`;

    // ev1 (reset: "restart", cursor 4) delivers [pinned, dec1].
    const ev1 = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t11-ev1",
        payload: speechPayload(SESSION_A, 1, "turn 1"),
        contextRequest: { reset: "restart" },
      }),
    );
    // Kills a mutant that breaks initial full delivery before replacement.
    expect(ev1.ok).toBe(true);
    if (!ev1.ok || !ev1.value.contextDelivery) return;

    // Replace dec1 with dec2 at cursor 5.
    const replaced = await engine.replaceDecision(keyB, dec1Ref, dec2Text, SESSION_B);
    // Kills a mutant that fails to advance cursor when replacing a decision.
    expect(replaced.cursor).toBe("5");

    // ev2 sends valid held watermark AT cursor "5" (caller already holds post-replacement state [pinned, dec2]).
    const ev2 = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t11-ev2",
        payload: speechPayload(SESSION_A, 2, "turn 2 holding cursor 5"),
        contextRequest: { held: { queryId: expectedQid, queryVersion: 2, cursor: replaced.cursor } },
      }),
    );
    // Kills a mutant that fails delivery when caller holds the post-replacement cursor.
    expect(ev2.ok).toBe(true);
    if (!ev2.ok || !ev2.value.contextDelivery) return;
    // Kills a mutant that emits non-empty diff when caller already holds the post-replacement watermark.
    expect(ev2.value.contextDelivery.items).toEqual([]);
    // Kills a mutant that reports non-zero bytes when caller already holds the post-replacement watermark.
    expect(ev2.value.contextDelivery.byteLength).toBe(0);

    // ev3 sends an UNREADABLE watermark: fallback must NOT re-emit dec2 (added) or dec1 (withdrawn)!
    const ev3 = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t11-ev3",
        payload: speechPayload(SESSION_A, 3, "turn 3 unreadable watermark"),
        contextRequest: { held: { queryId: expectedQid, queryVersion: 999, cursor: "999" } },
      }),
    );
    // Kills a mutant that errors on an unreadable watermark after a valid held sync.
    expect(ev3.ok).toBe(true);
    if (!ev3.ok || !ev3.value.contextDelivery) return;
    // Kills a mutant that escalates an unreadable watermark to full mode after a valid held sync.
    expect(ev3.value.contextDelivery.mode).toBe("diff");
    // Kills a mutant in recomputeDelivery step() that seeds nextRefs from stale prev.refs instead of heldRefs (re-emitting dec2 added + dec1 withdrawn).
    expect(ev3.value.contextDelivery.items).toEqual([]);
    // Kills a mutant that reports non-zero byteLength when re-emitting already-settled transitions on unreadable watermark.
    expect(ev3.value.contextDelivery.byteLength).toBe(0);
    // Kills a mutant that emits readySlices when nothing changed since the valid held watermark.
    expect(ev3.value.readySlices).toEqual([]);
    // Kills a mutant that attaches readySlicePayloads on a zero-byte unreadable-watermark fallback.
    expect(Object.hasOwn(ev3.value, "readySlicePayloads")).toBe(false);

    // Add a genuinely new decision dec3 and send ev4 with an unreadable watermark: ONLY dec3 arrives.
    await engine.noteDecision(keyB, dec3Text, SESSION_B);
    const dec3Ref = `decision:${expectedQid}:${independentSha256(dec3Text).slice(7, 15)}:3`;
    const expectedDec3 = independentPayloads([
      { slice: "memory", line: independentLine(dec3Ref, dec3Text, "reference") },
    ]);
    const ev4 = await h.front.recordSessionEvent(
      makeEnvelope({
        sourceId: "t11-ev4",
        payload: speechPayload(SESSION_A, 4, "turn 4 unreadable watermark after dec3"),
        contextRequest: { held: { queryId: expectedQid, queryVersion: 999, cursor: "999" } },
      }),
    );
    // Kills a mutant that fails unreadable-watermark delivery when a new decision arrives after a valid held sync.
    expect(ev4.ok).toBe(true);
    if (!ev4.ok || !ev4.value.contextDelivery) return;
    // Kills a mutant that re-emits dec1/dec2 alongside dec3 on ev4's unreadable watermark.
    expect(ev4.value.contextDelivery.items.map((i) => ({ ref: i.ref, change: i.change }))).toEqual([
      { ref: dec3Ref, change: "added" },
    ]);
    // Kills a mutant that miscomputes readySlicePayloads for dec3 on ev4.
    expect(ev4.value.readySlicePayloads).toEqual(expectedDec3.readySlicePayloads);

    // Recomputing ev3 and ev4 from stored records after later writes reproduces identical empty/dec3 deliveries.
    const scope = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID };
    const rec3 = await engine.recomputeDelivery({ scope, eventRecordId: ev3.value.eventRecordId });
    const rec4 = await engine.recomputeDelivery({ scope, eventRecordId: ev4.value.eventRecordId });
    // Kills a mutant that fails recomputing ev3 or ev4 from stored records.
    expect(rec3.ok && rec4.ok).toBe(true);
    if (!rec3.ok || !rec4.ok) return;
    // Kills a mutant whose stored recomputation of ev3 drifts from the original empty diff.
    expect(rec3.value.contextDelivery.items).toEqual([]);
    // Kills a mutant whose stored recomputation of ev4 drifts from delivering only dec3.
    expect(rec4.value.contextDelivery.items.map((i) => ({ ref: i.ref, change: i.change }))).toEqual([
      { ref: dec3Ref, change: "added" },
    ]);

    // Also verify direct requestContext keeps seen.refs in sync across a valid held watermark over a replacement.
    const hDirect = createHarness({ journalPolicy: { journalEnabled: true } });
    const directEngine = hDirect.contextEngine!;
    await directEngine.noteSessionEvent(keyA);
    await directEngine.notePinnedRequest(keyA, pinnedText);
    await directEngine.noteDecision(keyB, dec1Text, SESSION_B);
    const d1 = await directEngine.requestContext(keyA, { reset: "restart" });
    // Kills a mutant that breaks direct requestContext full reset before replacement.
    expect(d1.ok).toBe(true);
    const dRep = await directEngine.replaceDecision(keyB, dec1Ref, dec2Text, SESSION_B);
    const d2 = await directEngine.requestContext(keyA, {
      held: { queryId: expectedQid, queryVersion: 2, cursor: dRep.cursor },
    });
    // Kills a mutant that breaks direct requestContext at the post-replacement cursor.
    expect(d2.ok).toBe(true);
    if (!d2.ok) return;
    // Kills a mutant that emits items on direct requestContext when holding the post-replacement cursor.
    expect(d2.value.items).toEqual([]);
    const d3 = await directEngine.requestContext(keyA, {
      held: { queryId: expectedQid, queryVersion: 999, cursor: "999" },
    });
    // Kills a mutant that fails direct requestContext on an unreadable watermark after a valid held sync.
    expect(d3.ok).toBe(true);
    if (!d3.ok) return;
    // Kills a mutant in requestContext deliver() that preserves stale seen.refs instead of syncing with heldRefs.
    expect(d3.value.items).toEqual([]);
  });
});
