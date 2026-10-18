import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMemoryPortV2 } from '../engram-memory/index.js';
import { openFencedSqliteCanonicalMemoryStoreV1 } from '../engram-memory/sqlite.js';
import { captureRequest, DEADLINE } from './memory-l3-fixture.js';
import { buildMemory } from './memory-l7-fixture.js';

// Independent oracle: SPEC-memory-mcp-v3.1.md M5 l.596-600 (durable operation
// identity; canonical effect and replay evidence commit atomically; loss of the
// later acknowledgement MUST NOT permit a second effect) and l.598 (admission
// outcomes recoverable from durable state, not only an in-process cache).
const admission = (candidate_id: string) => ({
  candidate_id, authorization: { credential: 'credential:l7' }, deadline_at: DEADLINE,
});
const snapshot = (store: unknown) => (store as { exportStateForPersistence(): unknown }).exportStateForPersistence();

describe('MCP-L2 durable admission replay proof', () => {
  it('M5 should recover the identical accepted outcome after restart with empty port caches', async () => {
    const first = buildMemory({ scope: 'scope:l3' });
    const captured = await first.memory.capture(captureRequest('l2-durable-key-0001', '1'));
    if (!captured.ok) throw Error('capture failed');
    const outcome = await first.memory.requestAdmission(admission(captured.value.candidate_id!));
    expect(outcome).toMatchObject({ ok: true, value: { status: 'accepted' } });
    const before = snapshot(first.store);
    const restarted = createMemoryPortV2(first.dependencies);
    const recovered = await restarted.requestAdmission(admission(captured.value.candidate_id!));
    expect(recovered).toEqual(outcome);
    expect(snapshot(first.store)).toEqual(before);
  });

  it('M5 should recover a rejected outcome without a second canonical effect', async () => {
    const { createL3Memory } = await import('./memory-l3-fixture.js');
    const { buildMemory: build } = await import('./memory-l7-fixture.js');
    const { store } = build({ scope: 'scope:l3' });
    const { applyAdmission } = store;
    let effects = 0;
    store.applyAdmission = (async (input: never) => { effects++; return applyAdmission.call(store, input); }) as never;
    const first = createL3Memory('reject', store);
    const captured = await first.memory.capture(captureRequest('l2-durable-key-0002', '1'));
    if (!captured.ok) throw Error('capture failed');
    const input = { candidate_id: captured.value.candidate_id!, authorization: { credential: 'credential:l3' }, deadline_at: DEADLINE };
    const outcome = await first.memory.requestAdmission(input);
    expect(outcome).toMatchObject({ ok: true, value: { status: 'rejected' } });
    expect(effects).toBe(1);
    const restarted = createL3Memory('reject', store);
    await expect(restarted.memory.requestAdmission(input)).resolves.toEqual(outcome);
    expect(effects).toBe(1);
  });

  it('M5 should refuse a foreign scope without disclosing the recorded receipt', async () => {
    let scope = 'scope:l3';
    const { memory, store } = buildMemory({ scopeResolver: () => scope });
    const captured = await memory.capture(captureRequest('l2-durable-key-0003', '1'));
    if (!captured.ok) throw Error('capture failed');
    const outcome = await memory.requestAdmission(admission(captured.value.candidate_id!));
    expect(outcome.ok).toBe(true);
    const before = snapshot(store);
    scope = 'scope:other';
    const foreign = await memory.requestAdmission(admission(captured.value.candidate_id!));
    expect(foreign).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(JSON.stringify(foreign)).not.toContain('transaction_receipt_digest');
    expect(snapshot(store)).toEqual(before);
  });

  it('M5 should keep a guarded recapture pending across restart, never converting it to accepted', async () => {
    const first = buildMemory({ scope: 'scope:l3' });
    const admitted = await first.memory.capture(captureRequest('l2-durable-key-0004', '1', 'durable body'));
    if (!admitted.ok) throw Error('capture failed');
    const outcome = await first.memory.requestAdmission(admission(admitted.value.candidate_id!));
    if (!outcome.ok || outcome.value.record_id === undefined) throw Error('admission failed');
    await first.memory.transition({
      operation: 'tombstone' as const, record_id: outcome.value.record_id, event_id: 'event:l2:durable-forget',
      reason_ref: 'reason:l2', event_anchor: { occurred_at: '2026-08-16T12:34:56.789Z', kind_ref: 'kind:l2', provenance_ref: 'provenance:l2', provenance_digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      authorization: { credential: 'credential:l7' }, deadline_at: DEADLINE,
    });
    const recaptured = await first.memory.capture(captureRequest('l2-durable-key-0005', '2', 'durable body'));
    if (!recaptured.ok) throw Error('recapture failed');
    const restarted = createMemoryPortV2(first.dependencies);
    await expect(restarted.requestAdmission(admission(recaptured.value.candidate_id!))).resolves.toMatchObject({
      ok: true, value: { status: 'pending_adjudication' },
    });
  });

  it('M5 should persist the replay proof in a file-backed store across close and reopen', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-durable-'));
    try {
      const filename = join(directory, 'memory.sqlite');
      const clock = { now: () => '2026-08-16T12:34:56.789Z' };
      const first = await openFencedSqliteCanonicalMemoryStoreV1({ filename, clock, store_id: 'memory:canonical', allow_ephemeral_filesystem_store: true });
      if (!first.ok) throw Error(`open failed: ${first.error.code}`);
      const memory = buildMemory({ scope: 'scope:l3', store: first.value, clock }).memory;
      const captured = await memory.capture(captureRequest('l2-durable-key-0006', '1'));
      if (!captured.ok) throw Error('capture failed');
      const outcome = await memory.requestAdmission(admission(captured.value.candidate_id!));
      expect(outcome.ok).toBe(true);
      await first.value.close();
      const second = await openFencedSqliteCanonicalMemoryStoreV1({ filename, clock, store_id: 'memory:canonical', allow_ephemeral_filesystem_store: true });
      if (!second.ok) throw Error(`reopen failed: ${second.error.code}`);
      try {
        const reopened = buildMemory({ scope: 'scope:l3', store: second.value, clock }).memory;
        await expect(reopened.requestAdmission(admission(captured.value.candidate_id!))).resolves.toEqual(outcome);
      } finally {
        await second.value.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
