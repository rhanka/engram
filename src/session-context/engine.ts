import { createHash } from "node:crypto";
import { canonicalizeJcs } from "../../engram-memory/dist/canonical-json.js";
import { createSessionFrontEngineV1, sessionFrontQueryDigestV1, sessionFrontQueryIdV1, type SessionFrontStoreV1 } from "../../engram-memory/dist/session-front-engine.js";
import type { Result } from "../../engram-memory/dist/contracts/index.js";
import { isCanonicalCursor } from "../../engram-memory/dist/validation.js";
import type { SessionContextDeliveryV1, SessionContextItemRefV1, SessionContextQueryV1, SessionContextRequestV1, SessionContextWatermarkV1, Sha256Digest } from "../session-front-contracts.js";
import { diffSessionContextViews, evaluateSessionContextView, resolveViewMaxTokens, type SessionContextEvaluatedViewV1, type SessionContextRulesProviderV1, type SessionContextViewEntryV1 } from "./view.js";
export interface SessionContextEngineKeyV1 { readonly tenantId: string; readonly workspaceId: string; readonly derivedWorktreeId: string; readonly roleRef?: string; readonly sessionId: string; }
export interface SessionContextEngineV1 {
  noteSessionEvent(key: SessionContextEngineKeyV1): Promise<SessionContextQueryV1>;
  notePinnedRequest(key: SessionContextEngineKeyV1, requestText: string): Promise<SessionContextQueryV1>;
  noteDecision(key: SessionContextEngineKeyV1, decisionText: string, sourceSessionId?: string): Promise<{ readonly cursor: string }>;
  replaceDecision(key: SessionContextEngineKeyV1, replacedRef: string, replacementText: string, sourceSessionId?: string): Promise<{ readonly cursor: string; readonly ref: string }>;
  noteViewItem(key: SessionContextEngineKeyV1, tier: 3 | 5, entry: SessionContextViewEntryV1): Promise<{ readonly cursor: string }>;
  requestContext(key: SessionContextEngineKeyV1, request: SessionContextRequestV1): Promise<Result<SessionContextDeliveryV1>>;
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
  const extraItems = new Map<string, { tier: 3 | 5; entry: SessionContextViewEntryV1 }[]>();
  const pinned = new Map<string, string>();
  const seen = new Map<string, { watermark: SessionContextWatermarkV1; refs: Set<string> }>();
  const keyOfSession = new Map<string, string>();
  const persisted = new Set<string>();
  const chains = new Map<string, Promise<void>>();
  let cursor = "0";
  const fail = (message: string): Result<never> => ({ ok: false, error: { operation: "capture", code: "INVALID_SCHEMA", message, retryable: false } });
  const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
  const hasNull = (v: unknown, visited = new WeakSet<object>()): boolean => v === null || (typeof v === "object" && !visited.has(v) && (visited.add(v), (Array.isArray(v) ? v : Object.values(v)).some((x) => hasNull(x, visited))));
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
  const viewAt = (keyString: string, version: number, at: string, override?: number): SessionContextEvaluatedViewV1 => {
    const query = (queries.get(keyString) ?? []).find((entry) => entry.version === version) ?? latest(keyString)!;
    const extras = extraItems.get(keyString) ?? [];
    return evaluateSessionContextView({
      query, cursor: at, pinnedRequests: query.pinnedEventRecordIds.flatMap((ref) => { const text = pinned.get(ref); return text === undefined ? [] : [{ ref, text }]; }),
      decisions: (decisions.get(keyString) ?? []).map((d) => ({ ref: d.ref, text: d.text, digest: d.digest, slice: "memory", cursor: d.cursor, ...(d.replacedAtCursor === undefined ? {} : { replacedAtCursor: d.replacedAtCursor }) })),
      trackItems: extras.filter((x) => x.tier === 3).map((x) => x.entry), rulesProvider: options.rulesProvider, selectorItems: extras.filter((x) => x.tier === 5).map((x) => x.entry),
      viewMaxTokens: effectiveMaxTokens, maxTokensOverride: override, countTokens: options.countTokens,
    });
  };
  const readable = (held: unknown, head: SessionContextQueryV1): held is SessionContextWatermarkV1 => {
    if (!isObj(held) || typeof held.queryId !== "string") return false;
    const vs = versionsOf(held.queryId);
    if (vs.length === 0 || held.queryId !== head.queryId) return false;
    if (typeof held.queryVersion !== "number" || !Number.isSafeInteger(held.queryVersion) || held.queryVersion < 1 || held.queryVersion > vs[vs.length - 1]!.version) return false;
    if (!isCanonicalCursor(held.cursor)) return false;
    try { return BigInt(held.cursor) <= BigInt(cursor); } catch { return false; }
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
    if (head !== undefined) { keyOfSession.set(key.sessionId, keyString); return head; }
    const bare = { schemaVersion: "engram.session-context-query/v1" as const, queryId: sessionFrontQueryIdV1({ tenantId: key.tenantId, workspaceId: key.workspaceId, worktreeId: key.derivedWorktreeId, ...(key.roleRef === undefined ? { sessionId: key.sessionId } : { roleRef: key.roleRef }) }), version: 1, tenantId: key.tenantId, workspaceId: key.workspaceId, derivedWorktreeId: key.derivedWorktreeId, ...(key.roleRef === undefined ? {} : { roleRef: key.roleRef }), trackScope: [], ontologies: [], pinnedEventRecordIds: [], selectors: [] };
    const full = { ...bare, digest: queryDigestOf(bare) };
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
    noteSessionEvent(key) { return enqueue(keyOf(key), () => ensureQuery(key)); },
    notePinnedRequest(key, requestText) { return enqueue(keyOf(key), async () => {
      const head = await ensureQuery(key);
      const ref = `pinned:${head.queryId}:v${head.version + 1}`;
      const bare = { schemaVersion: head.schemaVersion, queryId: head.queryId, version: head.version + 1, tenantId: head.tenantId, workspaceId: head.workspaceId, derivedWorktreeId: head.derivedWorktreeId, ...(head.roleRef === undefined ? {} : { roleRef: head.roleRef }), trackScope: head.trackScope, ontologies: head.ontologies, pinnedEventRecordIds: [...head.pinnedEventRecordIds, ref], selectors: head.selectors };
      const full = { ...bare, digest: queryDigestOf(bare) };
      await persistQuery(key, full);
      pinned.set(ref, requestText);
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
    noteViewItem(key, tier, entry) { return enqueue(keyOf(key), async () => {
      const head = await ensureQuery(key), keyString = keyOf(key), digest = entry.digest ?? textDigest(entry.text), list = extraItems.get(keyString) ?? [];
      const committed = await recordNeutral(key, `sj1c:item:${head.queryId}:${entry.ref}:${list.length + 1}`, key.sessionId, { kind: "session_context_item", tier, textDigest: digest });
      list.push({ tier, entry: { ...entry, digest, cursor: committed } }); extraItems.set(keyString, list);
      return { cursor: committed };
    }); },
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
        const deliver = (items: readonly SessionContextItemRefV1[], rawTexts: ReadonlyMap<string, string>, mode: "full" | "diff", overflow?: "pinned_request_over_ceiling"): Result<SessionContextDeliveryV1> => {
          const watermark = { queryId: head.queryId, queryVersion: head.version, cursor };
          const nextRefs = mode === "full" ? new Set<string>() : new Set(seen.get(slot)?.refs ?? []);
          for (const item of items) { if (item.change === "withdrawn") nextRefs.delete(item.ref); else nextRefs.add(item.ref); }
          seen.set(slot, { watermark, refs: nextRefs });
          return { ok: true, value: { mode, watermark, queryDigest: head.digest, byteLength: items.reduce((n, item) => n + Buffer.byteLength(rawTexts.get(item.ref) ?? "", "utf8"), 0), items, ...(overflow === undefined ? {} : { overflow }) } };
        };
        const nowView = viewAt(keyString, head.version, cursor);
        if (reset !== undefined || !seen.has(slot)) return deliver(nowView.items, nowView.rawTextByRef, "full", nowView.overflow);
        const isReadable = readable(held, head), baselineCursor = isReadable ? held.cursor : seen.get(slot)!.watermark.cursor;
        const heldRefs = isReadable ? new Set(viewAt(keyString, held.queryVersion, held.cursor).items.map((item) => item.ref)) : new Set(seen.get(slot)!.refs);
        const allDecisions = decisions.get(keyString) ?? [];
        for (const d of allDecisions) if (d.source === key.sessionId && (d.replacedAtCursor === undefined || BigInt(d.replacedAtCursor) > BigInt(baselineCursor))) heldRefs.add(d.ref);
        const withdrawnEntries = allDecisions.filter((d) => d.replacedAtCursor !== undefined && BigInt(d.replacedAtCursor) <= BigInt(cursor)).map((d) => ({ ref: d.ref, text: d.text, digest: d.digest, slice: "memory" as const, cursor: d.cursor, replacedAtCursor: d.replacedAtCursor }));
        const diff = diffSessionContextViews({ nowView, heldRefs, withdrawnEntries, viewMaxTokens: effectiveMaxTokens, countTokens: options.countTokens });
        return deliver(diff.items, diff.rawTextByRef, "diff", diff.overflow);
      });
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
