import { normalizeCanonicalJson } from './canonical-json.js';
import { authorizationResourceDigest, receiptDigest } from './digests.js';
import { applyPortOwnedRedaction, authorizeOperation, validateRecallRequest } from './engine.js';
import { computeRanking, OFFLINE_PROFILE, SEMANTIC_PROFILE, PROFILE_VERSION } from './recall.js';
import { verifyStoreProvenance } from './store-factory.js';
import { isCanonicalCursor } from './validation.js';
import { isVisibleAtDualAsOf } from './dual-as-of.js';
import type {
  AuthorizationAllowedV1, AuthorizationContextV1, Digest, MemoryEngineDependenciesV2,
  MemoryErrorCode, MemoryReadPacketV1, MemoryReadPortV1, MemoryRecallPortV3, MemoryRecordV2,
  OperationalCapabilityReceiptV1, RecallPacketV3, RecallRecordPacketV3, RecallRequestV2,
  RedactedMemoryRecordV2, Result, RevalidationPacketV1, ScopedCanonicalReadPortV1,
} from './contracts/index.js';

export interface MemoryReadFacetBindingV1 { scope_ref: string; store_id: string }
export interface MemoryReadFacetsV1 extends MemoryReadFacetBindingV1 {
  readonly recallPort: MemoryRecallPortV3;
  readonly readPort: MemoryReadPortV1;
}
const fail = <T>(code: MemoryErrorCode, message = 'current memory read unavailable'): Result<T> =>
  ({ ok: false, error: { operation: 'recall_current', code, message, retryable: false } });
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const instant = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const opaque = (s: unknown): s is string => typeof s === 'string' && s.normalize('NFC') === s && !/[\uD800-\uDFFF]/u.test(s) && bytes(s) > 2 && new TextEncoder().encode(s).byteLength <= 512;

/** M3: only complete original nested values survive. Components remain atomic. */
function redact(record: MemoryRecordV2, authorization: AuthorizationAllowedV1) {
  const directive = { ...authorization.redaction, allowed_fields: authorization.redaction.allowed_fields.filter(p => p === '' || /^\/[^/]+$/.test(p)) };
  const result = applyPortOwnedRedaction(record, directive);
  if (!result.ok) return result;
  const value = result.value as RedactedMemoryRecordV2;
  if (value.record_id !== record.record_id) return fail<never>('NOT_FOUND');
  if (value.components && (!value.citations || value.components.some(c => c.citation_ids.some(id => !value.citations!.some(citation => citation.citation_id === id))))) delete value.components;
  if (!value.components?.some(c => c.component_id === value.primary_component_id)) delete value.primary_component_id;
  if (!value.components || !value.citations?.some(c => c.citation_id === value.primary_event?.citation_id)) delete value.primary_event;
  const redacted_fields = Object.keys(record).filter(k => !Object.hasOwn(value, k)).map(k => `/${k}`).sort();
  return { ok: true as const, value: {
    record: value, redacted_fields,
    redaction_receipt_digest: receiptDigest('recall-redaction', { record_id: record.record_id, source_record_digest: record.record_digest, policy_version: authorization.policy_version, redacted_fields }, 'redaction_receipt_digest'),
  } };
}

interface CursorV1 {
  version: 1; offset: number; valid_as_of: number; system_as_of: string;
  profile: 'offline_lexical_v1' | 'semantic_v1'; request_digest: Digest;
  snapshot_digest: Digest; ordered_ids_digest: Digest; storage_epoch: string;
  authorization_digest: Digest;
}
// Compact neutral cursor stays inside OpaqueRef's 512-byte bound. Only the
// host-managed facade may expose navigation; these pins are never public handles.
function encodeCursor(c: CursorV1): string {
  const hash = (d: Digest) => Buffer.from(d.slice(7), 'hex').toString('base64url');
  return Buffer.from(JSON.stringify([c.version, c.offset, c.valid_as_of, c.system_as_of, c.profile === SEMANTIC_PROFILE ? 1 : 0, hash(c.request_digest), hash(c.snapshot_digest), hash(c.ordered_ids_digest), c.storage_epoch, hash(c.authorization_digest)]), 'utf8').toString('base64url');
}
function decodeCursor(s: string): CursorV1 | undefined {
  const p = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
  if (!Array.isArray(p) || p.length !== 10 || ![0, 1].includes(p[4]) || [p[5], p[6], p[7], p[9]].some(d => typeof d !== 'string' || !/^[\w-]{43}$/.test(d))) return undefined;
  const hash = (d: string): Digest => `sha256:${Buffer.from(d, 'base64url').toString('hex')}`;
  return { version: p[0], offset: p[1], valid_as_of: p[2], system_as_of: p[3], profile: p[4] === 1 ? SEMANTIC_PROFILE : OFFLINE_PROFILE, request_digest: hash(p[5]), snapshot_digest: hash(p[6]), ordered_ids_digest: hash(p[7]), storage_epoch: p[8], authorization_digest: hash(p[9]) };
}
const authorizationBinding = (a: AuthorizationAllowedV1) => receiptDigest('read-authorization-binding', {
  scope_ref: a.scope_ref, policy_version: a.policy_version, revocation_epoch: a.revocation_epoch,
  authentication_receipt_digest: a.authentication_receipt_digest, redaction: a.redaction,
});

/** Additive facets share one injected engine/store and its existing fence provenance. */
export function createMemoryReadFacetsV1(dependencies: MemoryEngineDependenciesV2, bindingInput: MemoryReadFacetBindingV1): MemoryReadFacetsV1 {
  const binding = { ...bindingInput };
  const store = dependencies.canonical_store;
  const clock = () => dependencies.clock.now();

  async function ready(): Promise<Result<OperationalCapabilityReceiptV1>> {
    const scoped = store.scoped_reads;
    if (!opaque(binding.scope_ref) || !opaque(binding.store_id) || scoped?.version !== 1 || typeof scoped.acceptedSnapshot !== 'function' || typeof scoped.readRecord !== 'function') return fail('CAPABILITY_UNAVAILABLE');
    const result = await store.readiness();
    if (!result.ok) return result;
    if (result.value.store_id !== binding.store_id) return fail('CAPABILITY_UNAVAILABLE');
    return verifyStoreProvenance(store, result.value, { allowUnfencedMemoryStore: dependencies.allow_unfenced_memory_store === true }, 'recall_current');
  }
  function scoped(): ScopedCanonicalReadPortV1 { return store.scoped_reads!; }
  async function authorize(context: AuthorizationContextV1, purpose_ref: string, deadline_at: string, record_id?: string) {
    const now = clock();
    if (!instant(now)) return fail<AuthorizationAllowedV1>('STORE_UNAVAILABLE');
    if (Date.parse(now) >= Date.parse(deadline_at)) return fail<AuthorizationAllowedV1>('DEADLINE_EXCEEDED');
    const resource = { scope_ref: binding.scope_ref, purpose_ref, ...(record_id === undefined ? {} : { record_id }) };
    const result = await authorizeOperation(dependencies.authorization, {
      operation: 'recall_current', resource, resource_digest: authorizationResourceDigest('recall_current', resource),
      context, issued_at: now, deadline_at,
    }, binding.scope_ref, now);
    if (!result.ok) return result;
    const lifetime = Date.parse(result.value.expires_at) - Date.parse(result.value.not_before);
    return lifetime > 0 && lifetime <= 300_000 ? result : fail<AuthorizationAllowedV1>('INVALID_SCHEMA');
  }
  async function trust(record: MemoryRecordV2, now: string): Promise<Result<boolean>> {
    const t = record.trust;
    if (!t || !instant(t.issued_at) || Date.parse(t.issued_at) > Date.parse(now) || (t.expires_at !== undefined && (!instant(t.expires_at) || Date.parse(now) >= Date.parse(t.expires_at)))) return { ok: true, value: false };
    if (t.class === 'asserted' && t.verifier_id === 'graphify-memory:asserted') {
      return { ok: true, value: t.receipt_digest === receiptDigest('asserted-trust', { ...t, payload_digest: record.payload_digest }) };
    }
    const verifier = dependencies.evidence_verifier;
    if (!verifier || verifier.verifier_id !== t.verifier_id || verifier.verifier_version !== t.verifier_version) return fail('CAPABILITY_UNAVAILABLE');
    const result = await verifier.revalidate(t.receipt_digest, now);
    if (!result.ok) return { ok: false, error: { ...result.error, operation: 'recall_current' } };
    const v = result.value;
    if (typeof v.valid !== 'boolean' || !['valid', 'expired', 'revoked', 'unknown'].includes(v.reason) || !isCanonicalCursor(v.current_revocation_epoch)
      || v.binding_receipt_digest !== t.receipt_digest || v.checked_at !== now
      || v.revalidation_receipt_digest !== receiptDigest('trust-revalidation', { ...v }, 'revalidation_receipt_digest')) return fail('INVALID_SCHEMA');
    if (v.reason === 'unknown') return fail('CAPABILITY_UNAVAILABLE');
    return { ok: true, value: v.valid === true && v.reason === 'valid' && v.current_revocation_epoch === t.revocation_epoch };
  }
  async function finalCheck(records: MemoryRecordV2[], a: AuthorizationAllowedV1, context: AuthorizationContextV1, purpose: string, deadline: string, pin: OperationalCapabilityReceiptV1, record_id?: string): Promise<Result<RevalidationPacketV1>> {
    // M3/M4: fresh authority AFTER bodies/redaction, then current canonical eligibility.
    const currentAuth = await authorize(context, purpose, deadline, record_id);
    if (!currentAuth.ok) return currentAuth;
    if (authorizationBinding(currentAuth.value) !== authorizationBinding(a)) return fail('AUTHORIZATION_REVOKED');
    for (const record of records) {
      if (record.scope_ref !== binding.scope_ref) return fail(record_id ? 'NOT_FOUND' : 'STALE_PAGE');
      const checkedTrust = await trust(record, clock());
      if (!checkedTrust.ok) return checkedTrust;
      if (checkedTrust.value !== true) return fail(record_id ? 'NOT_FOUND' : 'STALE_PAGE');
    }
    const current = await ready();
    if (!current.ok) return current;
    if (current.value.storage_epoch !== pin.storage_epoch) return fail('FENCE_LOST');
    if (current.value.high_water_cursor !== pin.high_water_cursor) return fail(record_id ? 'NOT_FOUND' : 'STALE_PAGE');
    const final = await store.revalidateReadOnly({ record_ids: records.map(r => r.record_id), valid_as_of: Date.parse(clock()), system_as_of: current.value.high_water_cursor, authorization_receipt_digest: a.receipt_digest, operation: 'recall_current' });
    if (!final.ok) return final;
    const value = final.value;
    if (!Array.isArray(value.eligible_record_ids) || value.authorization_receipt_digest !== a.receipt_digest || value.receipt_digest !== receiptDigest('revalidation-packet', { ...value })) return fail('STORE_UNAVAILABLE');
    if (value.cursor !== current.value.high_water_cursor) return fail(record_id ? 'NOT_FOUND' : 'STALE_PAGE');
    if (records.some(r => !value.eligible_record_ids.includes(r.record_id))) return fail(record_id ? 'NOT_FOUND' : 'STALE_PAGE');
    const checkedAt = clock();
    if (!instant(checkedAt) || Date.parse(checkedAt) >= Date.parse(deadline)) return fail('DEADLINE_EXCEEDED');
    if (Date.parse(checkedAt) >= Date.parse(a.expires_at) || Date.parse(checkedAt) >= Date.parse(currentAuth.value.expires_at)) return fail('AUTHORIZATION_EXPIRED');
    if (records.some(r => !isVisibleAtDualAsOf(r.valid_time, r.recorded_cursor, { valid_as_of: Date.parse(checkedAt), system_as_of: value.cursor })
      || (r.retention.expires_at !== undefined && Date.parse(checkedAt) >= Date.parse(r.retention.expires_at))
      || (r.trust.expires_at !== undefined && Date.parse(checkedAt) >= Date.parse(r.trust.expires_at)))) return fail(record_id ? 'NOT_FOUND' : 'STALE_PAGE');
    return final;
  }
  async function recall(input: RecallRequestV2): Promise<Result<RecallPacketV3>> {
    try {
      const now = clock();
      if (!instant(now)) return fail('STORE_UNAVAILABLE');
      const validated = validateRecallRequest(input, now);
      if (!validated.ok) return validated;
      // Legacy V2 normalization remains untouched. New reads preserve query and
      // credential bytes; opaque references are validated rather than repaired.
      const request = { ...validated.value, query: input.query, purpose_ref: input.purpose_ref, authorization: input.authorization };
      if (!opaque(request.purpose_ref) || (request.authorization.context_ref !== undefined && !opaque(request.authorization.context_ref))) return fail('INVALID_SCHEMA');
      const pin = await ready();
      if (!pin.ok) return pin;
      const authorization = await authorize(request.authorization, request.purpose_ref, request.budgets.deadline_at);
      if (!authorization.ok) return authorization;
      const a = authorization.value;
      const semantic = dependencies.semantic_projection !== undefined && dependencies.vector_projection !== undefined;
      if (request.capability_policy.minimum_channels === 'lexical_and_semantic' && !semantic) return fail('RANKING_UNAVAILABLE');
      const profile = semantic ? SEMANTIC_PROFILE : OFFLINE_PROFILE;
      const request_digest = receiptDigest('scoped-recall-request', { scope_ref: binding.scope_ref, query_utf8: [...new TextEncoder().encode(request.query)], purpose_ref: request.purpose_ref, capability_policy: request.capability_policy, budgets: { max_candidates: request.budgets.max_candidates, max_results: request.budgets.max_results, max_packet_bytes: request.budgets.max_packet_bytes }, page_size: request.page?.size ?? request.budgets.max_results });
      let cursor: CursorV1 | undefined;
      if (request.page?.cursor !== undefined) {
        try { cursor = decodeCursor(request.page.cursor); } catch { return fail('STALE_PAGE'); }
        if (!cursor || cursor.version !== 1 || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || !Number.isSafeInteger(cursor.valid_as_of) || !isCanonicalCursor(cursor.system_as_of)
          || cursor.request_digest !== request_digest || cursor.profile !== profile || cursor.authorization_digest !== authorizationBinding(a) || cursor.storage_epoch !== pin.value.storage_epoch
          || cursor.system_as_of !== pin.value.high_water_cursor) return fail('STALE_PAGE');
      }
      const valid_as_of = cursor?.valid_as_of ?? request.as_of?.valid_time ?? Date.parse(now);
      const system_as_of = cursor?.system_as_of ?? request.as_of?.system_cursor ?? pin.value.high_water_cursor;
      if (system_as_of !== pin.value.high_water_cursor || (cursor && ((request.as_of?.valid_time !== undefined && request.as_of.valid_time !== valid_as_of) || (request.as_of?.system_cursor !== undefined && request.as_of.system_cursor !== system_as_of)))) return fail('STALE_PAGE');
      const snapshot = await scoped().acceptedSnapshot({ scope_ref: binding.scope_ref, authorization: a, authorization_receipt_digest: a.receipt_digest, valid_as_of, system_as_of, max_candidates: request.budgets.max_candidates });
      if (!snapshot.ok) return snapshot;
      const bodies = new Map<string, MemoryRecordV2>();
      // Trust-ineligible bodies never enter the ranking corpus or semantic allowlists.
      for (const doc of snapshot.value.documents) {
        const read = await scoped().readRecord({ scope_ref: binding.scope_ref, authorization: a, authorization_receipt_digest: a.receipt_digest, record_id: doc.record_id, system_as_of });
        if (!read.ok) return read;
        if (read.value.scope_ref !== binding.scope_ref) return fail('UNAUTHORIZED');
        const checkedTrust = await trust(read.value, clock());
        if (!checkedTrust.ok) return checkedTrust;
        if (checkedTrust.value === true) bodies.set(doc.record_id, read.value);
      }
      const documents = snapshot.value.documents.filter(d => bodies.has(d.record_id));
      const scoped_snapshot = { ...snapshot.value, documents, snapshot_digest: receiptDigest('scoped-trusted-snapshot', { snapshot_digest: snapshot.value.snapshot_digest, documents }) };
      const ranking = await computeRanking(dependencies, { profile, request, authorization: a, valid_as_of, system_as_of, now, scoped_snapshot });
      if (!ranking.ok) return ranking;
      const r = ranking.value;
      if (cursor && (cursor.ordered_ids_digest !== r.orderedIdsDigest || cursor.snapshot_digest !== scoped_snapshot.snapshot_digest)) return fail('STALE_PAGE');
      const rankBody = {
        request_digest, authorization_receipt_digest: a.receipt_digest, profile, profile_version: PROFILE_VERSION,
        profile_config_digest: r.profileConfigDigest, valid_as_of, system_as_of,
        snapshot_id: scoped_snapshot.snapshot_id, snapshot_digest: scoped_snapshot.snapshot_digest,
        candidate_count: r.candidateCount, candidate_ids_digest: r.candidateIdsDigest,
        scoring_formula_ref: r.scoringFormulaRef, ordered_ids_digest: r.orderedIdsDigest,
        revalidation_receipt_digest: r.revalidationReceiptDigest, projection_receipt_digests: r.projectionReceiptDigests, issued_at: now,
      };
      const records: RecallRecordPacketV3[] = [];
      let offset = cursor?.offset ?? 0;
      const page_size = Math.min(request.page?.size ?? request.budgets.max_results, request.budgets.max_results);
      const packet = () => {
        const next: CursorV1 = { version: 1, offset, valid_as_of, system_as_of, profile, request_digest, snapshot_digest: scoped_snapshot.snapshot_digest, ordered_ids_digest: r.orderedIdsDigest, storage_epoch: pin.value.storage_epoch, authorization_digest: authorizationBinding(a) };
        const body = { records, rank_receipt: { ...rankBody, receipt_digest: receiptDigest('rank-receipt', rankBody) }, ...(offset < r.ordered.length ? { next_page_cursor: encodeCursor(next) } : {}) };
        return { ...body, packet_digest: receiptDigest('recall-packet-v3', body) };
      };
      const disclosed: MemoryRecordV2[] = [];
      while (offset < r.ordered.length && records.length < page_size) {
        const id = r.ordered[offset]!;
        const source = bodies.get(id)!;
        const redacted = redact(source, a);
        if (!redacted.ok) {
          if (redacted.error.code !== 'NOT_FOUND') return redacted;
          offset++; continue;
        }
        records.push({ ...redacted.value, score: r.scoreById.get(id)!, rank: offset + 1 });
        offset++;
        if (bytes(packet()) > request.budgets.max_packet_bytes) {
          records.pop(); offset--;
          if (records.length === 0) return fail('PROJECTION_OVERSIZED');
          break;
        }
        disclosed.push(source);
      }
      const final = await finalCheck(disclosed, a, request.authorization, request.purpose_ref, request.budgets.deadline_at, pin.value);
      if (!final.ok) return final;
      rankBody.revalidation_receipt_digest = final.value.receipt_digest;
      return { ok: true, value: packet() };
    } catch { return fail('STORE_UNAVAILABLE'); }
  }
  async function readCurrent(input: Parameters<MemoryReadPortV1['readCurrent']>[0]): Promise<Result<MemoryReadPacketV1>> {
    try {
      let request: typeof input;
      try { normalizeCanonicalJson(input); request = JSON.parse(JSON.stringify(input)); } catch { return fail('INVALID_SCHEMA'); }
      if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).sort().join(',') !== 'authorization,deadline_at,max_packet_bytes,purpose_ref,record_id' || !/^mem_[a-z2-7]{52}$/.test(request.record_id) || !opaque(request.purpose_ref) || !instant(request.deadline_at) || !Number.isSafeInteger(request.max_packet_bytes) || request.max_packet_bytes < 1 || request.max_packet_bytes > 1048576
        || !request.authorization || typeof request.authorization.credential !== 'string' || Object.keys(request.authorization).some(k => !['credential', 'context_ref'].includes(k)) || (request.authorization.context_ref !== undefined && !opaque(request.authorization.context_ref))) return fail('INVALID_SCHEMA');
      const pin = await ready();
      if (!pin.ok) return pin;
      const a = await authorize(request.authorization, request.purpose_ref, request.deadline_at, request.record_id);
      if (!a.ok) return a;
      const read = await scoped().readRecord({ record_id: request.record_id, system_as_of: pin.value.high_water_cursor, authorization_receipt_digest: a.value.receipt_digest, authorization: a.value, scope_ref: binding.scope_ref });
      if (!read.ok) return read;
      const redacted = redact(read.value, a.value);
      if (!redacted.ok) return redacted;
      const valid_as_of = Date.parse(clock());
      const final = await finalCheck([read.value], a.value, request.authorization, request.purpose_ref, request.deadline_at, pin.value, request.record_id);
      if (!final.ok) return final;
      const readBody = { record_id: request.record_id, record_digest: read.value.record_digest, valid_as_of, system_as_of: pin.value.high_water_cursor, validated_through_cursor: final.value.cursor, authorization_receipt_digest: a.value.receipt_digest, revalidation_receipt_digest: final.value.receipt_digest, checked_at: clock() };
      const body = { ...redacted.value, read_receipt: { ...readBody, receipt_digest: receiptDigest('memory-read-receipt', readBody) } };
      const packet = { ...body, packet_digest: receiptDigest('memory-read-packet', body) };
      return bytes(packet) <= request.max_packet_bytes ? { ok: true, value: packet } : fail('PROJECTION_OVERSIZED');
    } catch { return fail('STORE_UNAVAILABLE'); }
  }
  return { ...binding, recallPort: { version: 3, recall }, readPort: { version: 1, readCurrent } };
}
