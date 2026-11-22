import { createHash } from "node:crypto";
import { canonicalizeJcs } from "../../engram-memory/dist/canonical-json.js";
import {
  createSessionFrontEngineV1,
  sessionFrontQueryDigestV1,
  sessionFrontQueryIdV1,
  type SessionFrontContextRecordV1,
  type SessionFrontScopeV1,
  type SessionFrontStoreV1,
} from "../../engram-memory/dist/session-front-engine.js";
import type { Cursor, Result } from "../../engram-memory/dist/contracts/index.js";
import { isCanonicalCursor } from "../../engram-memory/dist/validation.js";
import type {
  SessionContextDeliveryV1,
  SessionContextItemRefV1,
  SessionContextQueryV1,
  SessionContextRequestV1,
  SessionContextWatermarkV1,
  Sha256Digest,
} from "../session-front-contracts.js";
import {
  diffSessionContextViews,
  evaluateSessionContextView,
  resolveViewMaxTokens,
  type SessionContextEvaluatedViewV1,
  type SessionContextRulesProviderV1,
  type SessionContextSliceV1,
  type SessionContextViewEntryV1,
} from "./view.js";

export interface SessionContextEngineKeyV1 { readonly tenantId: string; readonly workspaceId: string; readonly derivedWorktreeId: string; readonly roleRef?: string; readonly sessionId: string; }

export interface SessionContextReaderV1 {
  readonly isLocal?: boolean;
  readonly contentAuthorized?: boolean;
}

export interface SessionContextRenderedDeliveryV1 {
  readonly readySlices: readonly SessionContextSliceV1[];
  readonly readySlicePayloads?: Partial<Record<SessionContextSliceV1, string>>;
  readonly contextDelivery: SessionContextDeliveryV1;
}

export interface SessionContextEngineV1 {
  prepareQuery(key: SessionContextEngineKeyV1): Promise<SessionContextQueryV1>;
  noteSessionEvent(key: SessionContextEngineKeyV1): Promise<SessionContextQueryV1>;
  notePinnedRequest(key: SessionContextEngineKeyV1, requestText: string): Promise<SessionContextQueryV1>;
  noteDecision(key: SessionContextEngineKeyV1, decisionText: string, sourceSessionId?: string): Promise<{ readonly cursor: string }>;
  replaceDecision(key: SessionContextEngineKeyV1, replacedRef: string, replacementText: string, sourceSessionId?: string): Promise<{ readonly cursor: string; readonly ref: string }>;
  noteViewItem(
    key: SessionContextEngineKeyV1,
    tier: 3 | 5,
    entry: SessionContextViewEntryV1,
    sourceSessionId?: string,
  ): Promise<{ readonly cursor: string }>;
  noteShadowAnnotated(
    scope: {
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly derivedWorktreeId: string;
      readonly sessionId: string;
    },
    throughOrdinal: number,
    atCursor: Cursor,
  ): void;
  requestContext(key: SessionContextEngineKeyV1, request: SessionContextRequestV1): Promise<Result<SessionContextDeliveryV1>>;
  recomputeDelivery(input: {
    readonly scope: SessionFrontScopeV1;
    readonly eventRecordId: string;
    readonly reader?: SessionContextReaderV1;
  }): Promise<Result<SessionContextRenderedDeliveryV1>>;
  evaluateView(key: SessionContextEngineKeyV1, options?: { readonly maxTokensOverride?: number }): SessionContextEvaluatedViewV1 | undefined;
  getQuery(queryId: string, version: number): SessionContextQueryV1 | undefined;
  lastWatermark(sessionId: string): Promise<SessionContextWatermarkV1>;
}

export function createSessionContextEngineV1(options: { readonly store: SessionFrontStoreV1; readonly actorRef: string; readonly cloneId: string; readonly now?: () => string; readonly viewMaxTokens?: number; readonly maxTokensOverride?: number; readonly rulesProvider?: SessionContextRulesProviderV1; readonly countTokens?: (text: string) => number }): SessionContextEngineV1 {
  const effectiveMaxTokens = resolveViewMaxTokens(options.viewMaxTokens, options.maxTokensOverride);
  const l0 = createSessionFrontEngineV1(options.store);
  const now = options.now ?? (() => new Date().toISOString());
  const queries = new Map<string, SessionContextQueryV1[]>();
  const decisions = new Map<string, { ref: string; text: string; digest: Sha256Digest; cursor: string; source: string; replacedAtCursor?: string }[]>();
  const extraItems = new Map<string, { tier: 3 | 5; source: string; entry: SessionContextViewEntryV1 }[]>();
  const pinned = new Map<string, { readonly text: string; readonly source: string }>();
  const annotations = new Map<string, { readonly cursor: Cursor; readonly ordinal: number }[]>();
  const slotEventIds = new Map<string, Set<string>>();
  const seen = new Map<string, { watermark: SessionContextWatermarkV1; refs: Set<string> }>();
  const keyOfSession = new Map<string, string>();
  const persisted = new Set<string>();
  const chains = new Map<string, Promise<void>>();
  let cursor = "0";
  const fail = (
    message: string,
    code: "INVALID_SCHEMA" | "NOT_FOUND" | "UNAUTHORIZED" | "STORE_UNAVAILABLE" = "INVALID_SCHEMA",
  ): Result<never> => ({
    ok: false,
    error: { operation: "capture", code, message, retryable: code === "STORE_UNAVAILABLE" },
  });
  const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
  const hasNull = (v: unknown, visited = new WeakSet<object>()): boolean => v === null || (typeof v === "object" && !visited.has(v) && (visited.add(v), (Array.isArray(v) ? v : Object.values(v)).some((x) => hasNull(x, visited))));
  const readPlain = (value: unknown): Record<string, unknown> | undefined => {
    if (!isObj(value) || Object.getOwnPropertySymbols(value).length > 0) return undefined;
    const out: Record<string, unknown> = Object.create(null);
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (key === "__proto__" || !descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return undefined;
      }
      out[key] = descriptor.value;
    }
    return out;
  };
  const discloseFor = (sessionId: string, reader?: SessionContextReaderV1) =>
    (source: string | undefined, authoredBy: SessionContextItemRefV1["authoredBy"] = "code"): "text" | "reference" => {
      if (reader?.isLocal === true || reader?.contentAuthorized === true) return "text";
      return authoredBy !== "dreaming" && source === sessionId ? "text" : "reference";
    };
  const annotatedAt = (
    scope: {
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly derivedWorktreeId: string;
      readonly sessionId: string;
    },
    at: Cursor,
  ): number | undefined => {
    const key = JSON.stringify([scope.tenantId, scope.workspaceId, scope.derivedWorktreeId, scope.sessionId]);
    const list = annotations.get(key) ?? [];
    return list.reduce<number | undefined>((best, entry) => {
      if (BigInt(entry.cursor) > BigInt(at)) return best;
      return best === undefined ? entry.ordinal : Math.max(best, entry.ordinal);
    }, undefined);
  };
  const enqueue = <T>(keyString: string, run: () => Promise<T>): Promise<T> => {
    const next = (chains.get(keyString) ?? Promise.resolve()).then(run, run);
    const tail: Promise<void> = next.then(() => undefined, () => undefined).finally(() => { if (chains.get(keyString) === tail) chains.delete(keyString); });
    chains.set(keyString, tail); return next;
  };
  const textDigest = (text: string): Sha256Digest => `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}` as Sha256Digest;
  const queryDigestOf = (bare: Omit<SessionContextQueryV1, "digest">): Sha256Digest => `sha256:${createHash("sha256").update(canonicalizeJcs(bare as Record<string, unknown>), "utf8").digest("hex")}` as Sha256Digest;
  const keyOf = (key: SessionContextEngineKeyV1): string => canonicalizeJcs({ tenantId: key.tenantId, workspaceId: key.workspaceId, worktreeId: key.derivedWorktreeId, ...(key.roleRef === undefined ? { kind: "session", sessionId: key.sessionId } : { kind: "role", roleRef: key.roleRef }) });
  const latest = (keyString: string): SessionContextQueryV1 | undefined => { const vs = queries.get(keyString); return vs === undefined || vs.length === 0 ? undefined : vs[vs.length - 1]!; };
  const versionsOf = (queryId: string): SessionContextQueryV1[] => { for (const vs of queries.values()) if (vs[0]?.queryId === queryId) return vs; return []; };
  const viewAt = (
    keyString: string,
    version: number,
    at: string,
    override?: number,
    disclose?: (source: string | undefined, authoredBy?: SessionContextItemRefV1["authoredBy"]) => "text" | "reference",
  ): SessionContextEvaluatedViewV1 => {
    const query = (queries.get(keyString) ?? []).find((entry) => entry.version === version) ?? latest(keyString)!;
    const extras = extraItems.get(keyString) ?? [];
    const disclosureOf = (source: string | undefined, authoredBy: SessionContextItemRefV1["authoredBy"] = "code") =>
      disclose ? { disclosure: disclose(source, authoredBy) } : {};
    return evaluateSessionContextView({
      query,
      cursor: at,
      pinnedRequests: query.pinnedEventRecordIds.flatMap((ref) => {
        const entry = pinned.get(ref);
        return entry === undefined ? [] : [{ ref, text: entry.text, ...disclosureOf(entry.source) }];
      }),
      decisions: (decisions.get(keyString) ?? []).map((decision) => ({
        ref: decision.ref,
        text: decision.text,
        digest: decision.digest,
        slice: "memory" as const,
        cursor: decision.cursor,
        ...disclosureOf(decision.source),
        ...(decision.replacedAtCursor === undefined ? {} : { replacedAtCursor: decision.replacedAtCursor }),
      })),
      trackItems: extras
        .filter((item) => item.tier === 3)
        .map((item) => ({ ...item.entry, ...disclosureOf(item.source, item.entry.authoredBy) })),
      rulesProvider: options.rulesProvider,
      selectorItems: extras
        .filter((item) => item.tier === 5)
        .map((item) => ({ ...item.entry, ...disclosureOf(item.source, item.entry.authoredBy) })),
      viewMaxTokens: effectiveMaxTokens,
      maxTokensOverride: override,
      countTokens: options.countTokens,
    });
  };
  const readable = (
    held: unknown,
    head: SessionContextQueryV1,
    maxCursor: Cursor = cursor,
  ): held is SessionContextWatermarkV1 => {
    if (
      !isObj(held) ||
      typeof held.queryId !== "string" ||
      versionsOf(held.queryId).length === 0 ||
      held.queryId !== head.queryId
    ) {
      return false;
    }
    if (
      typeof held.queryVersion !== "number" ||
      !Number.isSafeInteger(held.queryVersion) ||
      held.queryVersion < 1 ||
      held.queryVersion > head.version ||
      !isCanonicalCursor(held.cursor)
    ) {
      return false;
    }
    try {
      return BigInt(held.cursor) <= BigInt(maxCursor);
    } catch {
      return false;
    }
  };
  const buildInitialQuery = (key: SessionContextEngineKeyV1): SessionContextQueryV1 => {
    const bare = {
      schemaVersion: "engram.session-context-query/v1" as const,
      queryId: sessionFrontQueryIdV1({
        tenantId: key.tenantId,
        workspaceId: key.workspaceId,
        worktreeId: key.derivedWorktreeId,
        ...(key.roleRef === undefined ? { sessionId: key.sessionId } : { roleRef: key.roleRef }),
      }),
      version: 1,
      tenantId: key.tenantId,
      workspaceId: key.workspaceId,
      derivedWorktreeId: key.derivedWorktreeId,
      ...(key.roleRef === undefined ? {} : { roleRef: key.roleRef }),
      trackScope: [],
      ontologies: [],
      pinnedEventRecordIds: [],
      selectors: [],
    };
    return { ...bare, digest: queryDigestOf(bare) };
  };
  const persistQuery = async (key: SessionContextEngineKeyV1, query: SessionContextQueryV1): Promise<void> => {
    const mark = `${query.queryId}:v${query.version}`;
    if (persisted.has(mark)) return;
    const neutral = { queryId: query.queryId, version: query.version, tenantId: query.tenantId, workspaceId: query.workspaceId, worktreeId: query.derivedWorktreeId, ...(query.roleRef === undefined ? { sessionId: key.sessionId } : { roleRef: query.roleRef }), pinnedRefs: [...query.pinnedEventRecordIds], selectorIds: query.selectors.map((selector) => selector.selectorId) };
    const receipt = await l0.recordEvent({ scope: { tenantId: key.tenantId, workspaceId: key.workspaceId }, idempotencyKey: `sj1a:${mark}`, worktreeId: key.derivedWorktreeId, sessionRef: key.sessionId, purposeRef: "memory.capture.session/v1", retention: { derivative_rule: "retain" }, actorRef: options.actorRef, cloneId: options.cloneId, assignmentDigest: null, occurredAt: now(), payload: { kind: "session_context_query", ...neutral, neutralDigest: sessionFrontQueryDigestV1(neutral) }, queueExtraction: false }, { syncState: "synced" });
    if (!receipt.ok) throw new Error(`session_context_query v${query.version} not committed: ${receipt.error.code}`);
    persisted.add(mark);
    if (BigInt(receipt.value.cursor) > BigInt(cursor)) cursor = receipt.value.cursor;
  };
  const ensureQuery = async (key: SessionContextEngineKeyV1): Promise<SessionContextQueryV1> => {
    const keyString = keyOf(key);
    const head = latest(keyString);
    if (head !== undefined) {
      keyOfSession.set(key.sessionId, keyString);
      return head;
    }
    const full = buildInitialQuery(key);
    await persistQuery(key, full);
    queries.set(keyString, [full]);
    keyOfSession.set(key.sessionId, keyString);
    return full;
  };
  const recordNeutral = async (key: SessionContextEngineKeyV1, idempotencyKey: string, sessionRef: string, payload: Readonly<Record<string, unknown>> & { readonly kind: string }): Promise<string> => {
    const receipt = await l0.recordEvent({ scope: { tenantId: key.tenantId, workspaceId: key.workspaceId }, idempotencyKey, worktreeId: key.derivedWorktreeId, sessionRef, purposeRef: "memory.capture.session/v1", retention: { derivative_rule: "retain" }, actorRef: options.actorRef, cloneId: options.cloneId, assignmentDigest: null, occurredAt: now(), payload, queueExtraction: false }, { syncState: "synced" });
    if (!receipt.ok) throw new Error(`${payload.kind} not committed: ${receipt.error.code}`);
    if (BigInt(receipt.value.cursor) > BigInt(cursor)) cursor = receipt.value.cursor;
    return receipt.value.cursor;
  };
  return {
    async prepareQuery(key) {
      const keyString = keyOf(key);
      const pending = chains.get(keyString);
      if (pending !== undefined) {
        await pending;
      }
      return latest(keyString) ?? buildInitialQuery(key);
    },
    noteSessionEvent(key) { return enqueue(keyOf(key), () => ensureQuery(key)); },
    notePinnedRequest(key, requestText) { return enqueue(keyOf(key), async () => {
      const head = await ensureQuery(key);
      const ref = `pinned:${head.queryId}:v${head.version + 1}`;
      const bare = { schemaVersion: head.schemaVersion, queryId: head.queryId, version: head.version + 1, tenantId: head.tenantId, workspaceId: head.workspaceId, derivedWorktreeId: head.derivedWorktreeId, ...(head.roleRef === undefined ? {} : { roleRef: head.roleRef }), trackScope: head.trackScope, ontologies: head.ontologies, pinnedEventRecordIds: [...head.pinnedEventRecordIds, ref], selectors: head.selectors };
      const full = { ...bare, digest: queryDigestOf(bare) };
      await persistQuery(key, full);
      pinned.set(ref, { text: requestText, source: key.sessionId });
      queries.get(keyOf(key))!.push(full);
      return full;
    }); },
    noteDecision(key, decisionText, sourceSessionId) { return enqueue(keyOf(key), async () => {
      const head = await ensureQuery(key);
      const keyString = keyOf(key);
      const digest = textDigest(decisionText);
      const list = decisions.get(keyString) ?? [];
      const ref = `decision:${head.queryId}:${digest.slice(7, 15)}:${list.length + 1}`;
      const receipt = await l0.recordEvent({ scope: { tenantId: key.tenantId, workspaceId: key.workspaceId }, idempotencyKey: `sj1a:${ref}`, worktreeId: key.derivedWorktreeId, sessionRef: sourceSessionId ?? key.sessionId, purposeRef: "memory.capture.session/v1", retention: { derivative_rule: "retain" }, actorRef: options.actorRef, cloneId: options.cloneId, assignmentDigest: null, occurredAt: now(), payload: { kind: "session_context_decision", textDigest: digest }, queueExtraction: false }, { syncState: "synced" });
      if (!receipt.ok) throw new Error(`session_context_decision not committed: ${receipt.error.code}`);
      if (BigInt(receipt.value.cursor) > BigInt(cursor)) cursor = receipt.value.cursor;
      list.push({ ref, text: decisionText, digest, cursor: receipt.value.cursor, source: sourceSessionId ?? key.sessionId });
      decisions.set(keyString, list);
      return { cursor: receipt.value.cursor };
    }); },
    replaceDecision(key, replacedRef, replacementText, sourceSessionId) { return enqueue(keyOf(key), async () => {
      const head = await ensureQuery(key), keyString = keyOf(key), list = decisions.get(keyString) ?? [];
      const target = list.find((entry) => entry.ref === replacedRef && entry.replacedAtCursor === undefined);
      if (target === undefined) throw new Error(`decision not found or already replaced: ${replacedRef}`);
      const digest = textDigest(replacementText), ref = `decision:${head.queryId}:${digest.slice(7, 15)}:${list.length + 1}`;
      const committed = await recordNeutral(key, `sj1c:${ref}`, sourceSessionId ?? key.sessionId, { kind: "session_context_decision_replace", textDigest: digest, replacedRef });
      target.replacedAtCursor = committed; list.push({ ref, text: replacementText, digest, cursor: committed, source: sourceSessionId ?? key.sessionId }); decisions.set(keyString, list);
      return { cursor: committed, ref };
    }); },
    noteViewItem(key, tier, entry, sourceSessionId) {
      return enqueue(keyOf(key), async () => {
        const head = await ensureQuery(key);
        const keyString = keyOf(key);
        const digest = entry.digest ?? textDigest(entry.text);
        const list = extraItems.get(keyString) ?? [];
        const source = sourceSessionId ?? key.sessionId;
        const committed = await recordNeutral(
          key,
          `sj1c:item:${head.queryId}:${entry.ref}:${list.length + 1}`,
          source,
          { kind: "session_context_item", tier, textDigest: digest },
        );
        list.push({ tier, source, entry: { ...entry, digest, cursor: committed } });
        extraItems.set(keyString, list);
        return { cursor: committed };
      });
    },
    noteShadowAnnotated(scope, throughOrdinal, atCursor) {
      if (!Number.isSafeInteger(throughOrdinal) || throughOrdinal < 0 || !isCanonicalCursor(atCursor)) return;
      const key = JSON.stringify([scope.tenantId, scope.workspaceId, scope.derivedWorktreeId, scope.sessionId]);
      const list = annotations.get(key) ?? [];
      list.push({ cursor: atCursor, ordinal: throughOrdinal });
      annotations.set(key, list);
      if (BigInt(atCursor) > BigInt(cursor)) {
        cursor = atCursor;
      }
    },
    async requestContext(key, request) {
      if (!isObj(request) || hasNull(request)) return fail("request must be an object with no null fields.");
      const { held, reset } = request as { readonly held?: unknown; readonly reset?: unknown };
      if ((held !== undefined) === (reset !== undefined)) return fail("Exactly one of held and reset must be set.");
      if (held !== undefined && (!isObj(held) || typeof held.queryId !== "string" || typeof held.queryVersion !== "number" || typeof held.cursor !== "string")) return fail("held must have string queryId, number queryVersion and string cursor.");
      if (reset !== undefined && reset !== "compaction" && reset !== "clear" && reset !== "restart") return fail("reset must be compaction, clear or restart.");
      const keyString = keyOf(key);
      return enqueue(keyString, async () => {
        const head = await ensureQuery(key);
        const slot = JSON.stringify([keyString, key.sessionId]);
        // Preserves SJ-1a raw-text byteLength contract on SessionContextDeliveryV1 while view.ts bounds rendered ref-prefixed slice payloads.
        const deliver = (
          items: readonly SessionContextItemRefV1[],
          rawTexts: ReadonlyMap<string, string>,
          mode: "full" | "diff",
          baseRefs: ReadonlySet<string>,
          overflow?: "pinned_request_over_ceiling",
        ): Result<SessionContextDeliveryV1> => {
          const watermark = { queryId: head.queryId, queryVersion: head.version, cursor };
          const nextRefs = new Set(baseRefs);
          for (const item of items) {
            if (item.change === "withdrawn") {
              nextRefs.delete(item.ref);
            } else {
              nextRefs.add(item.ref);
            }
          }
          seen.set(slot, { watermark, refs: nextRefs });
          return {
            ok: true,
            value: {
              mode,
              watermark,
              queryDigest: head.digest,
              byteLength: items.reduce((n, item) => n + Buffer.byteLength(rawTexts.get(item.ref) ?? "", "utf8"), 0),
              items,
              ...(overflow === undefined ? {} : { overflow }),
            },
          };
        };
        const nowView = viewAt(keyString, head.version, cursor);
        if (reset !== undefined || !seen.has(slot)) {
          return deliver(nowView.items, nowView.rawTextByRef, "full", new Set<string>(), nowView.overflow);
        }
        const isReadable = readable(held, head);
        const baselineCursor = isReadable ? held.cursor : seen.get(slot)!.watermark.cursor;
        const heldRefs = isReadable
          ? new Set(viewAt(keyString, held.queryVersion, held.cursor).items.map((item) => item.ref))
          : new Set(seen.get(slot)!.refs);
        const allDecisions = decisions.get(keyString) ?? [];
        for (const d of allDecisions) {
          if (d.source === key.sessionId && (d.replacedAtCursor === undefined || BigInt(d.replacedAtCursor) > BigInt(baselineCursor))) {
            heldRefs.add(d.ref);
          }
        }
        const withdrawnEntries = allDecisions
          .filter((d) => d.replacedAtCursor !== undefined && BigInt(d.replacedAtCursor) <= BigInt(cursor))
          .map((d) => ({
            ref: d.ref,
            text: d.text,
            digest: d.digest,
            slice: "memory" as const,
            cursor: d.cursor,
            replacedAtCursor: d.replacedAtCursor,
          }));
        const diff = diffSessionContextViews({
          nowView,
          heldRefs,
          withdrawnEntries,
          viewMaxTokens: effectiveMaxTokens,
          countTokens: options.countTokens,
        });
        return deliver(diff.items, diff.rawTextByRef, "diff", heldRefs, diff.overflow);
      });
    },
    async recomputeDelivery(rawInput) {
      let scopeObj: SessionFrontScopeV1;
      let eventRecordId: string;
      let reader: SessionContextReaderV1 | undefined;
      try {
        const obj = readPlain(rawInput);
        const scope = obj ? readPlain(obj.scope) : undefined;
        const hasReader = obj !== undefined && Object.hasOwn(obj, "reader");
        const parsedReader = hasReader ? readPlain(obj.reader) : undefined;
        if (
          !obj ||
          Object.keys(obj).some((key) => key !== "scope" && key !== "eventRecordId" && key !== "reader") ||
          !scope ||
          Object.keys(scope).length !== 2 ||
          typeof scope.tenantId !== "string" ||
          !scope.tenantId ||
          typeof scope.workspaceId !== "string" ||
          !scope.workspaceId ||
          typeof obj.eventRecordId !== "string" ||
          !obj.eventRecordId
        ) {
          return fail("recomputeDelivery input is invalid.");
        }
        if (hasReader) {
          if (
            !parsedReader ||
            Object.keys(parsedReader).some((key) => key !== "isLocal" && key !== "contentAuthorized") ||
            (Object.hasOwn(parsedReader, "isLocal") && typeof parsedReader.isLocal !== "boolean") ||
            (Object.hasOwn(parsedReader, "contentAuthorized") && typeof parsedReader.contentAuthorized !== "boolean")
          ) {
            return fail("recomputeDelivery reader is invalid.");
          }
          reader = parsedReader as SessionContextReaderV1;
        }
        scopeObj = { tenantId: scope.tenantId, workspaceId: scope.workspaceId };
        eventRecordId = obj.eventRecordId;
      } catch {
        return fail("recomputeDelivery input is invalid.");
      }

      try {
        return await options.store.transact(scopeObj, async (tx) => {
          const target = await tx.readEvent(eventRecordId);
          if (!target) return fail("Stored session event not found.", "NOT_FOUND");
          if (target.scope.tenantId !== scopeObj.tenantId || target.scope.workspaceId !== scopeObj.workspaceId) {
            return fail("Stored session event is outside the authorized scope.", "UNAUTHORIZED");
          }
          const stored = target.contextRecord;
          const watermark = stored?.answeredWatermark;
          const query = watermark
            ? versionsOf(watermark.queryId).find((entry) => entry.version === watermark.queryVersion)
            : undefined;
          if (
            !stored ||
            !watermark ||
            typeof target.sessionRef !== "string" ||
            !target.sessionRef ||
            !query ||
            query.tenantId !== scopeObj.tenantId ||
            query.workspaceId !== scopeObj.workspaceId ||
            !isCanonicalCursor(watermark.cursor)
          ) {
            return fail("Stored session event carries no resolvable context request.", "NOT_FOUND");
          }
          const storedRequest = readPlain(stored.request);
          if (!storedRequest || Object.hasOwn(storedRequest, "held") === Object.hasOwn(storedRequest, "reset")) {
            return fail("Stored context request is invalid.");
          }
          if (BigInt(watermark.cursor) > BigInt(cursor)) {
            cursor = watermark.cursor;
          }

          const key: SessionContextEngineKeyV1 = {
            tenantId: query.tenantId,
            workspaceId: query.workspaceId,
            derivedWorktreeId: query.derivedWorktreeId,
            ...(query.roleRef === undefined ? {} : { roleRef: query.roleRef }),
            sessionId: target.sessionRef,
          };
          const keyString = keyOf(key);
          const slot = JSON.stringify([keyString, target.sessionRef]);
          const ids = slotEventIds.get(slot) ?? new Set<string>();
          ids.add(eventRecordId);
          slotEventIds.set(slot, ids);

          const prior: SessionFrontContextRecordV1[] = [];
          for (const id of ids) {
            if (id === eventRecordId) continue;
            const previousEvent = await tx.readEvent(id);
            if (
              previousEvent?.contextRecord &&
              BigInt(previousEvent.contextRecord.answeredWatermark.cursor) < BigInt(watermark.cursor)
            ) {
              prior.push(previousEvent.contextRecord);
            }
          }
          prior.sort((a, b) => {
            const left = BigInt(a.answeredWatermark.cursor);
            const right = BigInt(b.answeredWatermark.cursor);
            return left > right ? 1 : left < right ? -1 : 0;
          });

          const disclose = discloseFor(target.sessionRef, reader);
          const allDecisions = decisions.get(keyString) ?? [];
          const step = (
            record: SessionFrontContextRecordV1,
            prev?: { readonly cursor: Cursor; readonly refs: ReadonlySet<string> },
          ) => {
            const at = record.answeredWatermark.cursor;
            const stepQuery = versionsOf(record.answeredWatermark.queryId).find(
              (entry) => entry.version === record.answeredWatermark.queryVersion,
            )!;
            const nowView = viewAt(keyString, stepQuery.version, at, undefined, disclose);
            const req = record.request as SessionContextRequestV1;
            if (req.reset !== undefined || prev === undefined) {
              return {
                mode: "full" as const,
                rendered: nowView,
                nextRefs: new Set(nowView.items.map((item) => item.ref)),
              };
            }
            const okHeld = readable(req.held, stepQuery, at);
            const baseCursor = okHeld ? req.held.cursor : prev.cursor;
            const heldRefs = okHeld
              ? new Set(
                  viewAt(keyString, req.held.queryVersion, req.held.cursor, undefined, disclose).items.map(
                    (item) => item.ref,
                  ),
                )
              : new Set(prev.refs);
            for (const decision of allDecisions) {
              if (
                decision.source === target.sessionRef &&
                BigInt(decision.cursor) <= BigInt(at) &&
                (decision.replacedAtCursor === undefined || BigInt(decision.replacedAtCursor) > BigInt(baseCursor))
              ) {
                heldRefs.add(decision.ref);
              }
            }
            const withdrawnEntries = allDecisions
              .filter(
                (decision) =>
                  BigInt(decision.cursor) <= BigInt(at) &&
                  decision.replacedAtCursor !== undefined &&
                  BigInt(decision.replacedAtCursor) <= BigInt(at),
              )
              .map((decision) => ({
                ref: decision.ref,
                text: decision.text,
                digest: decision.digest,
                slice: "memory" as const,
                cursor: decision.cursor,
                replacedAtCursor: decision.replacedAtCursor,
                disclosure: disclose(decision.source, "code"),
              }));
            const diff = diffSessionContextViews({
              nowView,
              heldRefs,
              withdrawnEntries,
              viewMaxTokens: effectiveMaxTokens,
              countTokens: options.countTokens,
            });
            const nextRefs = new Set(heldRefs);
            for (const item of diff.items) {
              if (item.change === "withdrawn") {
                nextRefs.delete(item.ref);
              } else {
                nextRefs.add(item.ref);
              }
            }
            return { mode: "diff" as const, rendered: diff, nextRefs };
          };

          let state: { readonly cursor: Cursor; readonly refs: ReadonlySet<string> } | undefined;
          for (const record of prior) {
            state = { cursor: record.answeredWatermark.cursor, refs: step(record, state).nextRefs };
          }
          const final = step(stored, state);
          const annotatedThroughOrdinal = annotatedAt(key, watermark.cursor);
          const hasPayloads = final.rendered.readySlices.length > 0;
          return {
            ok: true,
            value: {
              readySlices: [...final.rendered.readySlices],
              ...(hasPayloads ? { readySlicePayloads: { ...final.rendered.readySlicePayloads } } : {}),
              contextDelivery: {
                mode: final.mode,
                watermark: { ...watermark },
                queryDigest: query.digest,
                byteLength: final.rendered.byteLength,
                items: final.rendered.items,
                ...(annotatedThroughOrdinal === undefined ? {} : { annotatedThroughOrdinal }),
                ...(final.rendered.overflow === undefined ? {} : { overflow: final.rendered.overflow }),
              },
            },
          };
        });
      } catch {
        return fail("Session storage could not recompute the delivery.", "STORE_UNAVAILABLE");
      }
    },
    evaluateView(key, opts) { const keyString = keyOf(key); const head = latest(keyString); return head === undefined ? undefined : viewAt(keyString, head.version, cursor, opts?.maxTokensOverride); },
    getQuery(queryId, version) { return versionsOf(queryId).find((entry) => entry.version === version); },
    async lastWatermark(sessionId) {
      const keyString = keyOfSession.get(sessionId);
      const head = keyString === undefined ? undefined : latest(keyString);
      if (head === undefined) return { queryId: "query_pending", queryVersion: 1, cursor: "0" };
      return seen.get(JSON.stringify([keyString, sessionId]))?.watermark ?? { queryId: head.queryId, queryVersion: head.version, cursor: "0" };
    },
  };
}
