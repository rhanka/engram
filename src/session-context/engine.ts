import { createHash } from "node:crypto";
import { canonicalizeJcs } from "../../engram-memory/dist/canonical-json.js";
import { createSessionFrontEngineV1, sessionFrontQueryDigestV1, sessionFrontQueryIdV1, type SessionFrontStoreV1 } from "../../engram-memory/dist/session-front-engine.js";
import type { Result } from "../../engram-memory/dist/contracts/index.js";
import { isCanonicalCursor } from "../../engram-memory/dist/validation.js";
import type { SessionContextDeliveryV1, SessionContextItemRefV1, SessionContextQueryV1, SessionContextRequestV1, SessionContextWatermarkV1, Sha256Digest } from "../session-front-contracts.js";
export interface SessionContextEngineKeyV1 { readonly tenantId: string; readonly workspaceId: string; readonly derivedWorktreeId: string; readonly roleRef?: string; readonly sessionId: string; }
export interface SessionContextEngineV1 {
  noteSessionEvent(key: SessionContextEngineKeyV1): Promise<SessionContextQueryV1>;
  notePinnedRequest(key: SessionContextEngineKeyV1, requestText: string): Promise<SessionContextQueryV1>;
  noteDecision(key: SessionContextEngineKeyV1, decisionText: string, sourceSessionId?: string): Promise<{ readonly cursor: string }>;
  requestContext(key: SessionContextEngineKeyV1, request: SessionContextRequestV1): Promise<Result<SessionContextDeliveryV1>>;
  getQuery(queryId: string, version: number): SessionContextQueryV1 | undefined;
  lastWatermark(sessionId: string): Promise<SessionContextWatermarkV1>;
}
export function createSessionContextEngineV1(options: { readonly store: SessionFrontStoreV1; readonly actorRef: string; readonly cloneId: string; readonly now?: () => string }): SessionContextEngineV1 {
  const l0 = createSessionFrontEngineV1(options.store);
  const now = options.now ?? (() => new Date().toISOString());
  const queries = new Map<string, SessionContextQueryV1[]>();
  const decisions = new Map<string, { ref: string; text: string; digest: Sha256Digest; cursor: string; source: string }[]>();
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
  const viewAt = (keyString: string, version: number, at: string): { refs: string[]; texts: Map<string, string> } => {
    const refs: string[] = [], texts = new Map<string, string>();
    for (const ref of (queries.get(keyString) ?? []).find((entry) => entry.version === version)?.pinnedEventRecordIds ?? []) { const text = pinned.get(ref); if (text !== undefined) { refs.push(ref); texts.set(ref, text); } }
    for (const decision of decisions.get(keyString) ?? []) if (BigInt(decision.cursor) <= BigInt(at)) { refs.push(decision.ref); texts.set(decision.ref, decision.text); }
    return { refs, texts };
  };
  const readable = (held: unknown, head: SessionContextQueryV1): held is SessionContextWatermarkV1 => {
    if (!isObj(held) || typeof held.queryId !== "string") return false;
    const vs = versionsOf(held.queryId);
    if (vs.length === 0 || held.queryId !== head.queryId) return false;
    if (typeof held.queryVersion !== "number" || !Number.isSafeInteger(held.queryVersion) || held.queryVersion < 1 || held.queryVersion > vs[vs.length - 1]!.version) return false;
    if (!isCanonicalCursor(held.cursor)) return false;
    try { return BigInt(held.cursor) <= BigInt(cursor); } catch { return false; }
  };
  const toItems = (refs: readonly string[], texts: Map<string, string>): SessionContextItemRefV1[] => refs.filter((ref) => texts.has(ref)).map((ref) => ({ ref, digest: textDigest(texts.get(ref) ?? ""), slice: (ref.startsWith("pinned:") ? "track" : "memory") as SessionContextItemRefV1["slice"], change: "added" as const, disclosure: "text" as const, authoredBy: "code" as const, sourceEventRecordIds: [] }));
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
        const deliver = (refs: readonly string[], texts: Map<string, string>, mode: "full" | "diff"): Result<SessionContextDeliveryV1> => {
          const ordered = [...refs].sort();
          const watermark = { queryId: head.queryId, queryVersion: head.version, cursor };
          seen.set(slot, { watermark, refs: mode === "full" ? new Set(ordered) : new Set([...(seen.get(slot)?.refs ?? []), ...ordered]) });
          return { ok: true, value: { mode, watermark, queryDigest: head.digest, byteLength: ordered.reduce((n, ref) => n + Buffer.byteLength(texts.get(ref) ?? "", "utf8"), 0), items: toItems(ordered, texts) } };
        };
        if (reset !== undefined || !seen.has(slot)) { const view = viewAt(keyString, head.version, cursor); return deliver(view.refs, view.texts, "full"); }
        const heldRefs = readable(held, head) ? new Set(viewAt(keyString, held.queryVersion, held.cursor).refs) : new Set(seen.get(slot)!.refs);
        for (const decision of decisions.get(keyString) ?? []) if (decision.source === key.sessionId) heldRefs.add(decision.ref);
        const nowView = viewAt(keyString, head.version, cursor);
        return deliver(nowView.refs.filter((ref) => !heldRefs.has(ref)), nowView.texts, "diff");
      });
    },
    getQuery(queryId, version) { return versionsOf(queryId).find((entry) => entry.version === version); },
    async lastWatermark(sessionId) {
      const keyString = keyOfSession.get(sessionId);
      const head = keyString === undefined ? undefined : latest(keyString);
      if (head === undefined) return { queryId: "query_pending", queryVersion: 1, cursor: "0" };
      return seen.get(JSON.stringify([keyString, sessionId]))?.watermark ?? { queryId: head.queryId, queryVersion: head.version, cursor: "0" };
    },
  };
}
