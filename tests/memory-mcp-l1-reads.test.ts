import { describe, expect, it, vi } from 'vitest';
import { createMemoryReadFacetsV1 } from '../engram-memory/reads.js';
import { createMemoryReadToolsV1, createMemoryReadPageStoreV1 } from '../src/memory-tools/reads.js';
import { receiptDigest } from '../engram-memory/digests.js';
import { openFencedSqliteCanonicalMemoryStoreV1 } from '../engram-memory/sqlite.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildMemory, NOW, recallRequest, seedAccepted } from './memory-l7-fixture.js';

// Independent oracle: SPEC-memory-mcp-v3.1.md M1/M3 (current, scoped, pure),
// M2/M4 (trusted context, literal true), M6 (sanitized failures), M13/M14 B.
const binding = { scope_ref: 'mem:scope', store_id: 'memory:canonical' };
const deadline = '2026-08-16T12:35:16.789Z';
function request(query = 'needle common') {
  return { ...recallRequest(query), budgets: { ...recallRequest(query).budgets, deadline_at: deadline } };
}
function setup(options: Parameters<typeof buildMemory>[0] = {}) {
  const fixture = buildMemory({ authorizationExpiresAt: '2026-08-16T12:39:56.789Z', ...options });
  const facets = createMemoryReadFacetsV1(fixture.dependencies, binding);
  return { ...fixture, facets };
}
function invocation() {
  return {
    auditId: 'audit:l1', authorization: { credential: 'credential:l7' }, ...binding,
    principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one',
    connector_instance_id: 'connector:one', agent_id: 'agent:one', session_id: 'session:one',
    generation: '1', policy_id: 'policy:one', policy_version: '1', authorization_epoch: '0',
    deadline_at: deadline,
  };
}
function tools(facets: ReturnType<typeof createMemoryReadFacetsV1>, overrides = {}) {
  const host = {
    clock: { now: () => NOW }, authenticate: vi.fn(async () => true),
    authorize: vi.fn(async () => true), authorizeContinuation: vi.fn(async () => true),
    pages: createMemoryReadPageStoreV1({ clock: { now: () => NOW }, ttl_ms: 60_000, max_entries: 8 }),
    ...overrides,
  };
  return { tools: createMemoryReadToolsV1({ facets, host }), host };
}
const code = (value: any) => value.ok ? undefined : value.error.code;

describe('MCP-L1 spec-derived neutral reads', () => {
  it('M3 should isolate the corpus before candidate caps, BM25 and receipts in the same store', async () => {
    const { memory, facets, store } = setup();
    const own = await seedAccepted(memory, 'needle common local');
    const first = await facets.recallPort.recall(request());
    expect(first.ok).toBe(true);
    const foreign = buildMemory({ store, scope: 'scope:foreign' }).memory;
    for (let i = 0; i < 8; i++) await seedAccepted(foreign, `needle common foreign ${i}`, { scope: 'scope:foreign' });
    const uncapped = await facets.recallPort.recall(request());
    expect(uncapped).toMatchObject({ ok: true, value: { rank_receipt: { candidate_count: 1 } } });
    if (uncapped.ok) expect(uncapped.value.records.map(r => r.record.record_id)).toEqual([own]);
    const after = await facets.recallPort.recall({ ...request(), budgets: { ...request().budgets, max_candidates: 1 } });
    expect(after.ok).toBe(true);
    if (!first.ok || !after.ok) return;
    expect(after.value.records.map(r => r.record.record_id)).toEqual([own]);
    expect(after.value.records[0]!.score).toBe(first.value.records[0]!.score);
    expect(after.value.rank_receipt.candidate_count).toBe(1);
    expect(after.value.rank_receipt.candidate_ids_digest).toBe(first.value.rank_receipt.candidate_ids_digest);
  });

  it('M3 should keep expired reads pure, including cursor, outbox and journal', async () => {
    let now = NOW;
    const { memory, facets, store } = setup({ clock: { now: () => now } });
    const id = await seedAccepted(memory, 'needle common expires', { retentionExpiresAt: '2026-08-16T12:34:57.000Z' });
    const before = (store as any).exportStateForPersistence();
    const maintenanceSnapshot = vi.spyOn(store, 'acceptedSnapshot');
    const maintenanceRevalidate = vi.spyOn(store, 'revalidate');
    now = '2026-08-16T12:34:58.000Z';
    const search = await facets.recallPort.recall(request());
    expect(search).toMatchObject({ ok: true, value: { records: [] } });
    expect(code(await facets.readPort.readCurrent({ record_id: id, purpose_ref: 'purpose:l7', authorization: { credential: 'credential:l7' }, max_packet_bytes: 65536, deadline_at: deadline }))).toBe('NOT_FOUND');
    expect((store as any).exportStateForPersistence()).toEqual(before);
    expect(maintenanceSnapshot).not.toHaveBeenCalled();
    expect(maintenanceRevalidate).not.toHaveBeenCalled();
  });

  it('M1/M3 should read an exact nonmatching record without ranking or unscoped access', async () => {
    const { memory, facets, store } = setup();
    const id = await seedAccepted(memory, 'different words');
    const foreign = await seedAccepted(buildMemory({ store, scope: 'scope:foreign' }).memory, 'foreign secret', { scope: 'scope:foreign' });
    const legacy = vi.spyOn(store, 'readRecord').mockImplementation(() => { throw Error('unscoped'); });
    const snapshot = vi.spyOn(store.scoped_reads!, 'acceptedSnapshot');
    const get = (record_id: string) => facets.readPort.readCurrent({ record_id, purpose_ref: 'purpose:l7', authorization: { credential: 'credential:l7' }, max_packet_bytes: 65536, deadline_at: deadline });
    expect(await get(id)).toMatchObject({ ok: true, value: { record: { record_id: id } } });
    expect(code(await get(foreign))).toBe('NOT_FOUND');
    expect(code(await get(`mem_${'a'.repeat(52)}`))).toBe('NOT_FOUND');
    expect(legacy).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('M3 should omit unauthorized fields and withhold components lacking surviving citations', async () => {
    const { memory, facets } = setup({ allowedFields: ['/components', '/record_id', '/valid_time/t'] });
    const id = await seedAccepted(memory, 'needle common secret');
    const result = await facets.recallPort.recall(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.records[0]!.record).toEqual({ record_id: id });
    expect(result.value.records[0]!.redacted_fields).toContain('/components');
    expect(JSON.stringify(result)).not.toContain('needle common secret');
  });

  it('M3 should refuse missing or wrong scoped facets without any legacy fallback', async () => {
    const { dependencies, store } = setup();
    for (const scoped_reads of [undefined, { version: 2 }]) {
      const wrapper = new Proxy(store, { get(target, key) { return key === 'scoped_reads' ? scoped_reads : typeof (target as any)[key] === 'function' ? (target as any)[key].bind(target) : (target as any)[key]; } });
      const facets = createMemoryReadFacetsV1({ ...dependencies, canonical_store: wrapper }, binding);
      expect(code(await facets.recallPort.recall(request()))).toBe('CAPABILITY_UNAVAILABLE');
    }
    expect(createMemoryReadFacetsV1(dependencies, binding).recallPort.version).toBe(3);
    expect(createMemoryReadFacetsV1(dependencies, binding).readPort.version).toBe(1);
  });

  it('M3 should revalidate after materialization and prevent a concurrent tombstone disclosure', async () => {
    const { memory, facets, store } = setup();
    const id = await seedAccepted(memory, 'needle common');
    const original = store.scoped_reads!.readRecord.bind(store.scoped_reads);
    vi.spyOn(store.scoped_reads!, 'readRecord').mockImplementation(async input => {
      const read = await original(input);
      expect((await memory.transition({ operation: 'tombstone', record_id: id, event_id: 'event:l1:tombstone', reason_ref: 'reason:erase', event_anchor: { occurred_at: NOW, kind_ref: 'event:erase', provenance_ref: 'provenance:l1', provenance_digest: `sha256:${'a'.repeat(64)}` }, authorization: { credential: 'credential:l7' }, deadline_at: deadline })).ok).toBe(true);
      return read;
    });
    const result = await facets.recallPort.recall(request());
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('needle common');
  });

  it.each(['search', 'get'] as const)('M3 should refuse %s if the cursor advances inside final revalidation', async kind => {
    const { memory, facets, store } = setup();
    const id = await seedAccepted(memory, 'needle common final check race');
    const original = store.revalidateReadOnly.bind(store);
    let calls = 0;
    vi.spyOn(store, 'revalidateReadOnly').mockImplementation(async input => {
      if (++calls === (kind === 'search' ? 2 : 1)) expect((await memory.transition({ operation: 'tombstone', record_id: id, event_id: 'event:inside:final:revalidation', reason_ref: 'reason:l1', event_anchor: { occurred_at: NOW, kind_ref: 'event:l1', provenance_ref: 'provenance:l1', provenance_digest: `sha256:${'a'.repeat(64)}` }, authorization: { credential: 'credential:l7' }, deadline_at: deadline })).ok).toBe(true);
      return original(input);
    });
    const result = kind === 'search' ? await facets.recallPort.recall(request()) : await facets.readPort.readCurrent({ record_id: id, purpose_ref: 'purpose:l7', authorization: { credential: 'credential:l7' }, max_packet_bytes: 65536, deadline_at: deadline });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('final check race');
  });

  it('M3/M4 should require fresh authorization revalidation and the five-minute receipt ceiling', async () => {
    const { memory, facets, dependencies } = setup();
    await seedAccepted(memory, 'needle common');
    const original = dependencies.authorization.revalidate.bind(dependencies.authorization);
    vi.spyOn(dependencies.authorization, 'revalidate').mockImplementation((digest, _at) => original(digest, '2026-08-16T12:34:55.000Z'));
    expect((await facets.recallPort.recall(request())).ok).toBe(false);
    const tooLong = setup({ authorizationExpiresAt: '2026-08-16T12:39:56.790Z' });
    expect((await tooLong.facets.recallPort.recall(request())).ok).toBe(false);
  });

  it.each(['dispute', 'mark_non_current', 'trust_invalidate', 'tombstone'] as const)('M1/M3 should exclude %s from recall and exact get', async operation => {
    const { memory, facets } = setup();
    const id = await seedAccepted(memory, 'needle common hidden body');
    const result = await memory.transition({ operation, record_id: id, event_id: `event:l1:${operation}`, reason_ref: 'reason:l1', event_anchor: { occurred_at: NOW, kind_ref: 'event:l1', provenance_ref: 'provenance:l1', provenance_digest: `sha256:${'a'.repeat(64)}` }, authorization: { credential: 'credential:l7' }, deadline_at: deadline });
    expect(result.ok).toBe(true);
    expect(await facets.recallPort.recall(request())).toMatchObject({ ok: true, value: { records: [] } });
    expect(await facets.readPort.readCurrent({ record_id: id, purpose_ref: 'purpose:l7', authorization: { credential: 'credential:l7' }, max_packet_bytes: 65536, deadline_at: deadline })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it.each([undefined, false, null, 'true', 1])('M4 should refuse a missing/nonliteral final authorization verdict %s', async verdict => {
    const { memory, facets, dependencies } = setup();
    await seedAccepted(memory, 'needle common hidden');
    const original = dependencies.authorization.revalidate.bind(dependencies.authorization);
    let calls = 0;
    vi.spyOn(dependencies.authorization, 'revalidate').mockImplementation(async (digest, at) => {
      const result = await original(digest, at);
      if (++calls === 1 || !result.ok) return result;
      const body: any = { ...result.value, valid: verdict };
      if (verdict === undefined) delete body.valid;
      body.revalidation_receipt_digest = receiptDigest('authorization-revalidation', body, 'revalidation_receipt_digest');
      return { ok: true, value: body };
    });
    const result = await facets.recallPort.recall(request());
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('needle common hidden');
  });

  it('M3/M4 should refuse absent canonical eligibility and bind exact target and purpose', async () => {
    const log: any[] = [];
    const { memory, facets, store } = setup({ authorizationLog: log });
    const id = await seedAccepted(memory, 'needle common');
    log.length = 0;
    const original = store.revalidateReadOnly.bind(store);
    vi.spyOn(store, 'revalidateReadOnly').mockImplementation(async input => {
      const result = await original(input);
      if (!result.ok) return result;
      const body: any = { ...result.value };
      delete body.eligible_record_ids;
      body.receipt_digest = receiptDigest('revalidation-packet', body);
      return { ok: true, value: body };
    });
    const result = await facets.readPort.readCurrent({ record_id: id, purpose_ref: 'purpose:exact', authorization: { credential: 'credential:l7' }, max_packet_bytes: 65536, deadline_at: deadline });
    expect(result.ok).toBe(false);
    expect(log).toHaveLength(2);
    for (const entry of log) expect(entry.resource).toEqual({ scope_ref: binding.scope_ref, record_id: id, purpose_ref: 'purpose:exact' });
  });

  it('M3 should scope semantic graph expansion and vector allowlists and refuse an unavailable required channel', async () => {
    const semanticIds: string[][] = [], vectorIds: string[][] = [];
    const semantic: any = { version: 1, async inducedAdjacency(input: any) {
      semanticIds.push([...input.eligible_record_ids]);
      const body = { record_ids: [...input.eligible_record_ids], offsets: input.eligible_record_ids.map(() => 0).concat(0), neighbours: [], weights: [], projection_cursor: input.system_as_of };
      return { ok: true, value: { ...body, adjacency_digest: receiptDigest('semantic-adjacency', body) } };
    } };
    const vector: any = { version: 1, async query(input: any) {
      vectorIds.push([...input.eligible_record_ids]);
      const body = { matches: input.eligible_record_ids.map((record_id: string) => ({ record_id, score: 1 })), model_ref: 'vector:local', projection_cursor: '1' };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest('vector-query', body) } };
    } };
    const { memory, facets, store } = setup({ semantic, vector });
    const own = await seedAccepted(memory, 'needle common');
    await seedAccepted(buildMemory({ store, scope: 'scope:foreign' }).memory, 'needle common foreign', { scope: 'scope:foreign' });
    const result = await facets.recallPort.recall(request());
    expect(result).toMatchObject({ ok: true, value: { rank_receipt: { profile: 'semantic_v1', candidate_count: 1 } } });
    expect(semanticIds).toEqual([[own]]);
    expect(vectorIds).toEqual([[own]]);
    const offline = setup();
    expect(await offline.facets.recallPort.recall({ ...request(), capability_policy: { minimum_channels: 'lexical_and_semantic', network: 'forbid' } })).toMatchObject({ ok: false, error: { code: 'RANKING_UNAVAILABLE' } });
  });

  it.each([undefined, false, null, 'true', 1])('M3/M4 should exclude trust without a literal current verdict %s', async verdict => {
    const { memory, facets, dependencies } = setup({ seededTrustClasses: true });
    const id = await seedAccepted(memory, 'needle common trust secret', { trustClass: 'earned' });
    dependencies.evidence_verifier!.revalidate = async (binding_receipt_digest, checked_at) => {
      const body: any = { binding_receipt_digest, checked_at, valid: verdict, current_revocation_epoch: '0', reason: 'valid' };
      if (verdict === undefined) delete body.valid;
      return { ok: true, value: { ...body, revalidation_receipt_digest: receiptDigest('trust-revalidation', body, 'revalidation_receipt_digest') } };
    };
    const refused = await facets.recallPort.recall(request());
    if (verdict === false) expect(refused).toMatchObject({ ok: true, value: { records: [], rank_receipt: { candidate_count: 0 } } });
    else expect(refused.ok).toBe(false);
    const exact = await facets.readPort.readCurrent({ record_id: id, purpose_ref: 'purpose:l7', authorization: { credential: 'credential:l7' }, max_packet_bytes: 65536, deadline_at: deadline });
    expect(exact.ok).toBe(false);
    expect(JSON.stringify(exact)).not.toContain('trust secret');
    dependencies.evidence_verifier!.revalidate = async (binding_receipt_digest, checked_at) => {
      const body = { binding_receipt_digest, checked_at, valid: true, current_revocation_epoch: '0', reason: 'valid' as const };
      return { ok: true, value: { ...body, revalidation_receipt_digest: receiptDigest('trust-revalidation', body, 'revalidation_receipt_digest') } };
    };
    expect(await facets.recallPort.recall(request())).toMatchObject({ ok: true, value: { rank_receipt: { candidate_count: 1 } } });
  });

  it('M6 should preserve trust infrastructure failure rather than return an empty successful search', async () => {
    const { memory, facets, dependencies } = setup({ seededTrustClasses: true });
    await seedAccepted(memory, 'needle common trust secret', { trustClass: 'earned' });
    dependencies.evidence_verifier!.revalidate = async () => ({ ok: false, error: { operation: 'recall_current', code: 'STORE_UNAVAILABLE', message: 'private backend', retryable: false } });
    const result = await facets.recallPort.recall(request());
    expect(result).toMatchObject({ ok: false, error: { code: 'STORE_UNAVAILABLE' } });
  });

  it('M3 should keep real SQLite snapshots and final checks free of write transactions and enforce its live fence', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l1-sqlite-'));
    let now = NOW, commits = 0, statements = 0;
    const opened = await openFencedSqliteCanonicalMemoryStoreV1({ filename: join(directory, 'memory.sqlite'), clock: { now: () => now }, store_id: binding.store_id, allow_ephemeral_filesystem_store: true, before_commit: () => { commits++; }, on_mutation_statement: () => { statements++; } });
    expect(opened.ok).toBe(true);
    if (!opened.ok) { rmSync(directory, { recursive: true, force: true }); throw Error(opened.error.code); }
    try {
      const { memory, facets, store } = setup({ store: opened.value, clock: { now: () => now } });
      const id = await seedAccepted(memory, 'needle common sqlite', { retentionExpiresAt: '2026-08-16T12:34:57.000Z' });
      const before = await store.readJournal({ after: '0', limit: 100 });
      const outbox = await store.nextProjectionBatch({ after: '0', limit: 100 });
      const cursor = await store.readiness();
      commits = statements = 0;
      expect(await facets.recallPort.recall(request())).toMatchObject({ ok: true, value: { rank_receipt: { candidate_count: 1 } } });
      now = '2026-08-16T12:34:58.000Z';
      expect(await facets.recallPort.recall(request())).toMatchObject({ ok: true, value: { records: [] } });
      expect(await facets.readPort.readCurrent({ record_id: id, purpose_ref: 'purpose:l7', authorization: { credential: 'credential:l7' }, max_packet_bytes: 65536, deadline_at: deadline })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(await store.readJournal({ after: '0', limit: 100 })).toEqual(before);
      expect(await store.nextProjectionBatch({ after: '0', limit: 100 })).toEqual(outbox);
      const after = await store.readiness();
      expect(after.ok && cursor.ok && after.value.high_water_cursor === cursor.value.high_water_cursor).toBe(true);
      expect(commits).toBe(0); expect(statements).toBe(0);
      opened.value.forceFenceLossForTesting();
      expect(await facets.recallPort.recall(request())).toMatchObject({ ok: false, error: { code: 'FENCE_LOST' } });
    } finally { await opened.value.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});

describe('MCP-L1 in-process search/get', () => {
  it('M2/M4 should require authenticated host context and preserve the audit reference byte for byte', async () => {
    const { facets } = setup();
    const { tools: api, host } = tools(facets);
    for (const ctx of [undefined, { ...invocation(), auditId: undefined }, { ...invocation(), principal_id: '' }]) {
      await expect(api.search({ query: 'needle', purpose_ref: 'purpose:l7' }, ctx as any)).rejects.toMatchObject({ code: -32603, message: 'Trusted invocation context unavailable' });
    }
    expect(host.authorize).not.toHaveBeenCalled();
    expect(await api.search({ query: 'needle', purpose_ref: 'purpose:l7', scope_ref: 'foreign' }, invocation())).toMatchObject({ ok: false, auditId: 'audit:l1', error: { code: 'INVALID_SCHEMA' } });
    expect(await api.search({ query: 'needle', purpose_ref: 'purpose:l7' }, invocation())).toMatchObject({ ok: true, auditId: 'audit:l1' });
  });

  it.each([undefined, false, null, 'true', 1])('M4 should refuse nonliteral invocation and continuation verdict %s', async verdict => {
    const { memory, facets } = setup();
    for (let i = 0; i < 3; i++) await seedAccepted(memory, `needle common ${i}`);
    const { tools: denied } = tools(facets, { authorize: async () => verdict });
    expect(await denied.search({ query: 'needle', purpose_ref: 'purpose:l7' }, invocation())).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    const { tools: api } = tools(facets, { authorizeContinuation: async () => verdict });
    const input = { query: 'needle', purpose_ref: 'purpose:l7', limit: 1 };
    const first = await api.search(input, invocation());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(await api.search({ ...input, page_cursor: first.output.value.next_page_cursor }, invocation())).toMatchObject({ ok: false, error: { code: 'STALE_PAGE' } });
  });

  it('M3 should paginate without loss or duplication and bind parameters, principal and generation', async () => {
    const { memory, facets } = setup();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await seedAccepted(memory, `needle common ${i}`));
    const { tools: api } = tools(facets);
    const input = { query: 'needle', purpose_ref: 'purpose:l7', limit: 2 };
    const collected = [], pins = new Set();
    let page_cursor;
    do {
      const page = await api.search({ ...input, ...(page_cursor ? { page_cursor } : {}) }, invocation());
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      const value = page.output.value;
      const { response_digest, ...body } = value;
      expect(response_digest).toBe(receiptDigest('memory-search-page', body, 'response_digest'));
      collected.push(...value.records.map(r => r.record.record_id));
      pins.add(value.rank_receipt.system_as_of);
      page_cursor = value.next_page_cursor;
      if (page_cursor) {
        expect(page_cursor).toMatch(/^page_[0-9a-f]{48}$/);
        for (const change of [{ principal_id: 'bob' }, { generation: '2' }, { session_id: 'other' }]) {
          expect(await api.search({ ...input, page_cursor }, { ...invocation(), ...change })).toMatchObject({ ok: false, error: { code: 'STALE_PAGE' } });
        }
        expect(await api.search({ ...input, query: 'changed', page_cursor }, invocation())).toMatchObject({ ok: false, error: { code: 'STALE_PAGE' } });
      }
      expect(collected.length).toBeLessThanOrEqual(5);
    } while (page_cursor);
    expect(collected.sort()).toEqual(ids.sort());
    expect(pins.size).toBe(1);
  });

  it('M2/M6 should enforce envelope budgets, exact get and facet versions with sanitized failures', async () => {
    const { memory, facets } = setup();
    const id = await seedAccepted(memory, 'needle common ' + 'x'.repeat(5000));
    const { tools: api } = tools(facets);
    expect(await api.get({ record_id: id, purpose_ref: 'purpose:l7', max_packet_bytes: 4096 }, invocation())).toMatchObject({ ok: false, error: { code: 'RESULT_TOO_LARGE' } });
    expect(await api.get({ record_id: id, purpose_ref: 'purpose:l7' }, invocation())).toMatchObject({ ok: true, output: { value: { record: { record_id: id } } } });
    const { tools: wrong } = tools({ ...facets, recallPort: { ...facets.recallPort, version: 2 } } as any);
    expect(await wrong.search({ query: 'needle', purpose_ref: 'purpose:l7' }, invocation())).toMatchObject({ ok: false, error: { code: 'CAPABILITY_UNAVAILABLE' } });
    vi.spyOn(facets.readPort, 'readCurrent').mockRejectedValue(Error('/private/path secret'));
    const failure = await api.get({ record_id: id, purpose_ref: 'purpose:l7' }, invocation());
    expect(failure).toMatchObject({ ok: false, error: { code: 'STORE_UNAVAILABLE' } });
    expect(JSON.stringify(failure)).not.toContain('secret');
  });

  it.each([true, false])('M6 should preserve neutral retryability %s while sanitizing its message', async retryable => {
    const { facets } = setup();
    vi.spyOn(facets.recallPort, 'recall').mockResolvedValue({ ok: false, error: { code: 'PROJECTION_STALE', operation: 'recall_current', retryable, message: '/private/backend secret' } });
    const { tools: api } = tools(facets);
    const result = await api.search({ query: 'needle', purpose_ref: 'purpose:l7' }, invocation());
    expect(result).toMatchObject({ ok: false, error: { code: 'PROJECTION_STALE', retriable: retryable } });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('M3 should refuse missing state, tampering, expiry, quota exhaustion and disposal', async () => {
    let now = NOW;
    const pages = createMemoryReadPageStoreV1({ clock: { now: () => now }, ttl_ms: 1000, max_entries: 1 });
    const { memory, facets } = setup();
    for (let i = 0; i < 3; i++) await seedAccepted(memory, `needle common ${i}`);
    const { tools: api } = tools(facets, { pages });
    const input = { query: 'needle', purpose_ref: 'purpose:l7', limit: 1 };
    const first = await api.search(input, invocation());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const cursor = first.output.value.next_page_cursor!;
    expect(await api.search(input, invocation())).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    for (const page_cursor of ['engine:raw', `page_${'0'.repeat(48)}`]) expect(await api.search({ ...input, page_cursor }, invocation())).toMatchObject({ ok: false, error: { code: 'STALE_PAGE' } });
    now = '2026-08-16T12:34:57.789Z';
    expect(await api.search({ ...input, page_cursor: cursor }, invocation())).toMatchObject({ ok: false, error: { code: 'STALE_PAGE' } });
    const next = await api.search(input, invocation());
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    await pages.dispose(next.output.value.next_page_cursor!);
    expect(await pages.load(next.output.value.next_page_cursor!)).toBeUndefined();
  });

  it('M3 should invalidate pages on canonical and time-dependent eligibility drift', async () => {
    let now = NOW;
    const { memory, facets } = setup({ clock: { now: () => now } });
    for (let i = 0; i < 3; i++) await seedAccepted(memory, `needle common ${i}`, { retentionExpiresAt: '2026-08-16T12:35:00.000Z' });
    const { tools: api } = tools(facets);
    const input = { query: 'needle', purpose_ref: 'purpose:l7', limit: 1 };
    const first = await api.search(input, invocation());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    now = '2026-08-16T12:35:00.000Z';
    expect(await api.search({ ...input, page_cursor: first.output.value.next_page_cursor }, invocation())).toMatchObject({ ok: false, error: { code: 'STALE_PAGE' } });
    now = NOW;
    await seedAccepted(memory, 'needle common new generation');
    expect(await api.search({ ...input, page_cursor: first.output.value.next_page_cursor }, invocation())).toMatchObject({ ok: false, error: { code: 'STALE_PAGE' } });
  });

  it('M3 should check canonical eligibility after the last asynchronous host callback', async () => {
    const { memory, facets } = setup();
    const id = await seedAccepted(memory, 'needle common final race');
    let calls = 0;
    const { tools: api } = tools(facets, { authorize: async () => {
      if (++calls === 2) expect((await memory.transition({ operation: 'tombstone', record_id: id, event_id: 'event:final:host:race', reason_ref: 'reason:l1', event_anchor: { occurred_at: NOW, kind_ref: 'event:l1', provenance_ref: 'provenance:l1', provenance_digest: `sha256:${'a'.repeat(64)}` }, authorization: { credential: 'credential:l7' }, deadline_at: deadline })).ok).toBe(true);
      return true;
    } });
    const result = await api.search({ query: 'needle', purpose_ref: 'purpose:l7' }, invocation());
    expect(result).toMatchObject({ ok: false, error: { code: 'STALE_PAGE' } });
    expect(JSON.stringify(result)).not.toContain('final race');
  });

  it('M2/M3 should bind the exact query bytes across Unicode-equivalent queries', async () => {
    const { memory, facets } = setup();
    for (let i = 0; i < 3; i++) await seedAccepted(memory, `needle common ${i}`);
    const { tools: api } = tools(facets);
    const input = { query: 'needle é', purpose_ref: 'purpose:l7', limit: 1 };
    const first = await api.search(input, invocation());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(await api.search({ ...input, query: 'needle e\u0301', page_cursor: first.output.value.next_page_cursor }, invocation())).toMatchObject({ ok: false, error: { code: 'STALE_PAGE' } });
  });

  it('M2/M3 should paginate under a byte budget without skipping or repeating a record', async () => {
    const { memory, facets } = setup();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await seedAccepted(memory, `needle common ${i} ${'x'.repeat(1500)}`));
    const { tools: api } = tools(facets);
    const seen: string[] = [];
    let page_cursor: string | undefined;
    do {
      const result = await api.search({ query: 'needle', purpose_ref: 'purpose:l7', max_packet_bytes: 8192, limit: 10, ...(page_cursor ? { page_cursor } : {}) }, invocation());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(8192);
      seen.push(...result.output.value.records.map(r => r.record.record_id));
      expect(seen.length).toBeLessThanOrEqual(5);
      page_cursor = result.output.value.next_page_cursor;
    } while (page_cursor);
    expect(seen.sort()).toEqual(ids.sort());
  });
});
