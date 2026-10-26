import type { MemoryExecutionControlV1 } from './execution.js';
import { randomBytes } from 'node:crypto';
import { receiptDigest } from '../../engram-memory/dist/digests.js';
import type { MemoryReadFacetsV1 } from '../../engram-memory/dist/reads.js';
import type { AuthorizationContextV1, ClockPort, MemoryErrorV1 } from '../../engram-memory/dist/contracts/index.js';
import { DEFAULT_RECALL_CAPABILITY_POLICY, type GetInputV1, type SearchInputV1, type SearchPageV1, type ToolResultV1, type PublicMemoryErrorCode } from '../mcp/memory/contracts.js';
import { createToolSuccessEnvelope, isValidTrustedAuditId, mapNeutralMemoryErrorToPublic, TrustedContextUnavailableProtocolError } from '../mcp/memory/errors.js';
import { isValidCursor, isValidInstant, isValidOpaqueRef, validateGetInputV1, validateGetOutputV1, validateSearchInputV1, validateSearchOutputV1 } from '../mcp/memory/schemas.js';

type ReadTool = 'engram_memory_search' | 'engram_memory_get';
export interface MemoryReadInvocationV1 {
  auditId: string;
  authorization: AuthorizationContextV1;
  scope_ref: string;
  store_id: string;
  principal_namespace: string;
  principal_id: string;
  tenant_id: string;
  connector_instance_id: string;
  agent_id: string;
  session_id: string;
  generation: string;
  policy_id: string;
  policy_version: string;
  authorization_epoch: string;
  deadline_at: string;
}
export interface MemoryReadPageStateV1 {
  readonly binding_digest: string;
  readonly internal_engine_cursor: string;
  readonly selected_profile: string;
  readonly profile_version: string;
  readonly valid_as_of: number;
  readonly system_as_of: string;
}
export interface MemoryReadPageStoreV1 {
  issue(state: MemoryReadPageStateV1): Promise<string | undefined>;
  load(handle: string): Promise<MemoryReadPageStateV1 | undefined>;
  dispose(handle: string): Promise<void>;
}
/** Host instantiates and owns this bounded state; no signing secret exists. */
export function createMemoryReadPageStoreV1(options: { clock: ClockPort; ttl_ms: number; max_entries: number }): MemoryReadPageStoreV1 {
  if (!options.clock || !Number.isSafeInteger(options.ttl_ms) || options.ttl_ms < 1 || options.ttl_ms > 300_000 || !Number.isSafeInteger(options.max_entries) || options.max_entries < 1 || options.max_entries > 10_000) throw new Error('Invalid pagination bounds');
  const { clock, ttl_ms, max_entries } = options;
  const entries = new Map<string, { state: MemoryReadPageStateV1; issued: number; expires: number }>();
  const prune = () => {
    const instant = clock.now();
    if (!isValidInstant(instant)) { entries.clear(); throw new Error('Invalid pagination clock'); }
    const now = Date.parse(instant);
    for (const [key, entry] of entries) if (now < entry.issued || now >= entry.expires) entries.delete(key);
    return now;
  };
  return {
    async issue(state) {
      const now = prune();
      if (entries.size >= max_entries) return undefined;
      const handle = `page_${randomBytes(24).toString('hex')}`;
      entries.set(handle, { state: structuredClone(state), issued: now, expires: now + ttl_ms });
      return handle;
    },
    async load(handle) { prune(); const entry = entries.get(handle); return entry ? structuredClone(entry.state) : undefined; },
    async dispose(handle) { entries.delete(handle); },
  };
}
export interface MemoryReadHostV1 {
  clock: ClockPort;
  /** Verifies out-of-band identity, authoritative tenant, session and selection. */
  authenticate(context: MemoryReadInvocationV1, tool: ReadTool): Promise<boolean>;
  /** Independent per-tool invocation authorization, including exact scope/purpose. */
  authorize(context: MemoryReadInvocationV1, tool: ReadTool, purpose_ref: string): Promise<boolean>;
  /** Fresh policy/epoch/eligibility admission for every handle continuation. */
  authorizeContinuation(state: MemoryReadPageStateV1, context: MemoryReadInvocationV1): Promise<boolean>;
  pages: MemoryReadPageStoreV1;
}
const refs = ['scope_ref', 'store_id', 'principal_namespace', 'principal_id', 'tenant_id', 'connector_instance_id', 'agent_id', 'session_id', 'policy_id', 'policy_version'] as const;
const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8');

/** M13 option B: explicit in-process operations, no listener, broker or activation. */
export function createMemoryReadToolsV1(options: { facets: MemoryReadFacetsV1; host: MemoryReadHostV1 }) {
  const { facets, host } = options;
  const executions = new WeakMap<MemoryReadInvocationV1, MemoryExecutionControlV1>();
  async function context(input: MemoryReadInvocationV1, tool: ReadTool, execution: MemoryExecutionControlV1): Promise<MemoryReadInvocationV1> {
    let ctx: MemoryReadInvocationV1;
    try { ctx = structuredClone(input); } catch { throw new TrustedContextUnavailableProtocolError(); }
    if (!ctx || !isValidTrustedAuditId(ctx.auditId) || refs.some(k => !isValidOpaqueRef(ctx[k])) || !isValidCursor(ctx.generation) || !isValidCursor(ctx.authorization_epoch) || !isValidInstant(ctx.deadline_at)
      || !ctx.authorization || typeof ctx.authorization.credential !== 'string' || Object.keys(ctx.authorization).some(k => !['credential', 'context_ref'].includes(k))
      || (ctx.authorization.context_ref !== undefined && !isValidOpaqueRef(ctx.authorization.context_ref))) throw new TrustedContextUnavailableProtocolError();
    try {
      if (await host.authenticate(structuredClone(ctx), tool) !== true) throw new TrustedContextUnavailableProtocolError();
    } catch { throw new TrustedContextUnavailableProtocolError(); }
    executions.set(ctx, execution);
    return ctx;
  }
  const failure = (tool: ReadTool, ctx: MemoryReadInvocationV1, code: PublicMemoryErrorCode) => mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code, invocationAuthorized: false }).structuredContent;
  const neutralFailure = (tool: ReadTool, ctx: MemoryReadInvocationV1, error: MemoryErrorV1) =>
    mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, error, targetAuthorized: tool === 'engram_memory_get' && facets.isTargetAuthorizedError?.(error) === true }).structuredContent;
  function check(ctx: MemoryReadInvocationV1): PublicMemoryErrorCode | undefined {
    if (executions.get(ctx)?.signal?.aborted) return 'CANCELLED';
    const now = host.clock.now();
    if (!isValidInstant(now)) return 'STORE_UNAVAILABLE';
    const remaining = Date.parse(ctx.deadline_at) - Date.parse(now);
    if (remaining <= 0) return 'DEADLINE_EXCEEDED';
    if (remaining > 30_000) return 'INVALID_SCHEMA';
    if (ctx.scope_ref !== facets.scope_ref || ctx.store_id !== facets.store_id) return 'UNAUTHORIZED';
    if (facets.recallPort?.version !== 3 || typeof facets.recallPort.recall !== 'function' || facets.readPort?.version !== 1 || typeof facets.readPort.readCurrent !== 'function') return 'CAPABILITY_UNAVAILABLE';
    return undefined;
  }
  function envelope<T>(tool: ReadTool, ctx: MemoryReadInvocationV1, value: T, limit: number): ToolResultV1<T> {
    const result = createToolSuccessEnvelope(value, ctx.auditId);
    if (size(result.structuredContent) > limit || size(result) > 2_097_152) return failure(tool, ctx, 'RESULT_TOO_LARGE');
    return result.structuredContent;
  }
  function pageBinding(ctx: MemoryReadInvocationV1, input: SearchInputV1): string {
    const identity = Object.fromEntries([...refs, 'generation', 'authorization_epoch'].map(k => [k, ctx[k as keyof MemoryReadInvocationV1]]));
    return receiptDigest('memory-page-binding', { identity, query_utf8: [...new TextEncoder().encode(input.query)], purpose_ref: input.purpose_ref, limit: input.limit ?? 10, max_packet_bytes: input.max_packet_bytes ?? 65536, capability_policy: input.capability_policy ?? DEFAULT_RECALL_CAPABILITY_POLICY });
  }
  async function search(input: unknown, invocation: MemoryReadInvocationV1, execution: MemoryExecutionControlV1 = {}): Promise<ToolResultV1<SearchPageV1>> {
    const ctx = await context(invocation, 'engram_memory_search', execution);
    const tool = 'engram_memory_search';
    let issued: string | undefined;
    try {
      const checked = validateSearchInputV1(input);
      if (!checked.ok) return failure(tool, ctx, 'INVALID_SCHEMA');
      const arg = checked.value;
      const error = check(ctx);
      if (error) return failure(tool, ctx, error);
      let searchAuthorized = false;
      try {
        searchAuthorized = await host.authorize(structuredClone(ctx), tool, arg.purpose_ref) === true;
      } catch {
        return failure(tool, ctx, 'STORE_UNAVAILABLE');
      }
      if (execution.signal?.aborted) return failure(tool, ctx, 'CANCELLED');
      if (!searchAuthorized) return failure(tool, ctx, 'UNAUTHORIZED');
      const binding_digest = pageBinding(ctx, arg);
      let state: MemoryReadPageStateV1 | undefined;
      if (arg.page_cursor !== undefined) {
        // Raw neutral cursors are never accepted at this surface.
        if (!/^page_[0-9a-f]{48}$/.test(arg.page_cursor)) return failure(tool, ctx, 'STALE_PAGE');
        state = await host.pages.load(arg.page_cursor);
        if (!state || state.binding_digest !== binding_digest || !isValidOpaqueRef(state.internal_engine_cursor)
          || await host.authorizeContinuation(structuredClone(state), structuredClone(ctx)) !== true) return failure(tool, ctx, 'STALE_PAGE');
      }
      const limit = arg.limit ?? 10, max_packet_bytes = arg.max_packet_bytes ?? 65536;
      const envelopeOverhead = size(createToolSuccessEnvelope({}, ctx.auditId).structuredContent) - size({});
      const request = {
        query: arg.query, purpose_ref: arg.purpose_ref, authorization: ctx.authorization,
        capability_policy: arg.capability_policy ?? DEFAULT_RECALL_CAPABILITY_POLICY,
        // M2 lines 240/384: budget the whole envelope. response_digest adds
        // two bytes over packet_digest; the host handle is shorter than its cursor.
        budgets: { max_candidates: 2000, max_results: limit, max_packet_bytes: max_packet_bytes - envelopeOverhead - 2, deadline_at: ctx.deadline_at },
        page: { size: limit, ...(state ? { cursor: state.internal_engine_cursor } : {}) },
      };
      if (execution.signal?.aborted) return failure(tool, ctx, 'CANCELLED');
      const result = await facets.recallPort.recall(request);
      if (!result.ok) return neutralFailure(tool, ctx, result.error);
      const packet = result.value;
      if (state && (packet.rank_receipt.profile !== state.selected_profile || packet.rank_receipt.profile_version !== state.profile_version || packet.rank_receipt.valid_as_of !== state.valid_as_of || packet.rank_receipt.system_as_of !== state.system_as_of)) return failure(tool, ctx, 'STALE_PAGE');
      if (packet.next_page_cursor !== undefined) {
        issued = await host.pages.issue({ binding_digest, internal_engine_cursor: packet.next_page_cursor, selected_profile: packet.rank_receipt.profile, profile_version: packet.rank_receipt.profile_version, valid_as_of: packet.rank_receipt.valid_as_of, system_as_of: packet.rank_receipt.system_as_of });
        if (!issued) return failure(tool, ctx, 'RATE_LIMITED');
        if (!/^page_[0-9a-f]{48}$/.test(issued) || issued === packet.next_page_cursor) return failure(tool, ctx, 'STORE_UNAVAILABLE');
      }
      const finalError = check(ctx);
      if (finalError) return failure(tool, ctx, finalError);
      if (await host.authenticate(structuredClone(ctx), tool) !== true || await host.authorize(structuredClone(ctx), tool, arg.purpose_ref) !== true) return failure(tool, ctx, 'UNAUTHORIZED');
      if (state && await host.authorizeContinuation(structuredClone(state), structuredClone(ctx)) !== true) return failure(tool, ctx, 'STALE_PAGE');
      // Host pagination/policy ports awaited after the first engine result. Re-enter
      // the neutral facets on the SAME pins so their canonical check is last.
      if (execution.signal?.aborted) return failure(tool, ctx, 'CANCELLED');
      const final = await facets.recallPort.recall({ ...request, as_of: { valid_time: packet.rank_receipt.valid_as_of, system_cursor: packet.rank_receipt.system_as_of } });
      if (!final.ok) return neutralFailure(tool, ctx, final.error);
      if (final.value.next_page_cursor !== packet.next_page_cursor || final.value.rank_receipt.snapshot_digest !== packet.rank_receipt.snapshot_digest || JSON.stringify(final.value.records) !== JSON.stringify(packet.records)) return failure(tool, ctx, 'STALE_PAGE');
      if (execution.signal?.aborted) return failure(tool, ctx, 'CANCELLED');
      const body = { records: [...final.value.records], rank_receipt: final.value.rank_receipt, ...(issued ? { next_page_cursor: issued } : {}) };
      const value = { ...body, response_digest: receiptDigest('memory-search-page', body, 'response_digest') };
      if (!validateSearchOutputV1(value).ok) return failure(tool, ctx, 'STORE_UNAVAILABLE');
      const response = envelope(tool, ctx, value, max_packet_bytes);
      if (response.ok) issued = undefined;
      return response;
    } catch { return failure(tool, ctx, 'STORE_UNAVAILABLE'); }
    finally { if (issued !== undefined) { try { await host.pages.dispose(issued); } catch { /* expires under the host's finite lifetime */ } } }
  }
  async function get(input: unknown, invocation: MemoryReadInvocationV1, execution: MemoryExecutionControlV1 = {}): Promise<ToolResultV1<import('../../engram-memory/dist/contracts/index.js').MemoryReadPacketV1>> {
    const ctx = await context(invocation, 'engram_memory_get', execution);
    const tool = 'engram_memory_get';
    try {
      const checked = validateGetInputV1(input);
      if (!checked.ok) return failure(tool, ctx, 'INVALID_SCHEMA');
      const arg: GetInputV1 = checked.value;
      const error = check(ctx);
      if (error) return failure(tool, ctx, error);
      let getAuthorized = false;
      try {
        getAuthorized = await host.authorize(structuredClone(ctx), tool, arg.purpose_ref) === true;
      } catch {
        return failure(tool, ctx, 'STORE_UNAVAILABLE');
      }
      if (execution.signal?.aborted) return failure(tool, ctx, 'CANCELLED');
      if (!getAuthorized) return failure(tool, ctx, 'UNAUTHORIZED');
      const result = await facets.readPort.readCurrent({ ...arg, authorization: ctx.authorization, max_packet_bytes: arg.max_packet_bytes ?? 65536, deadline_at: ctx.deadline_at });
      if (!result.ok) return neutralFailure(tool, ctx, result.error);
      if (!validateGetOutputV1(result.value).ok) return failure(tool, ctx, 'STORE_UNAVAILABLE');
      const finalError = check(ctx);
      if (finalError) return failure(tool, ctx, finalError);
      if (await host.authenticate(structuredClone(ctx), tool) !== true || await host.authorize(structuredClone(ctx), tool, arg.purpose_ref) !== true) return failure(tool, ctx, 'UNAUTHORIZED');
      const final = await facets.readPort.readCurrent({ ...arg, authorization: ctx.authorization, max_packet_bytes: arg.max_packet_bytes ?? 65536, deadline_at: ctx.deadline_at });
      if (!final.ok) return neutralFailure(tool, ctx, final.error);
      if (!validateGetOutputV1(final.value).ok) return failure(tool, ctx, 'STORE_UNAVAILABLE');
      if (execution.signal?.aborted) return failure(tool, ctx, 'CANCELLED');
      return envelope(tool, ctx, final.value, arg.max_packet_bytes ?? 65536);
    } catch { return failure(tool, ctx, 'STORE_UNAVAILABLE'); }
  }
  return { search, get };
}
