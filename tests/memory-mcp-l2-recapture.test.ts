import { describe, expect, it } from 'vitest';
import { createMemoryPortV2 } from '../engram-memory/index.js';
import { captureRequest, DEADLINE, DIGEST, NOW } from './memory-l3-fixture.js';
import { buildMemory } from './memory-l7-fixture.js';

// Independent oracle: SPEC-memory-mcp-v3.1.md M5 l.712-729 and L0-A10 R4 l.1626:
// same-scope tombstoned-payload recapture under a new capture identity MUST
// yield ok:true pending_adjudication, never ILLEGAL_TRANSITION; another scope
// MUST NOT affect the decision; the guard MUST survive restart/restore.
const admission = (candidate_id: string) => ({
  candidate_id, authorization: { credential: 'credential:l7' }, deadline_at: DEADLINE,
});
const tombstone = (record_id: string, event_id: string) => ({
  operation: 'tombstone' as const,
  record_id,
  event_id,
  reason_ref: 'reason:l2-recapture',
  event_anchor: { occurred_at: NOW, kind_ref: 'kind:l2', provenance_ref: 'provenance:l2', provenance_digest: DIGEST },
  authorization: { credential: 'credential:l7' },
  deadline_at: DEADLINE,
});
const snapshot = (store: unknown) => (store as { exportStateForPersistence(): unknown }).exportStateForPersistence();

describe('MCP-L2 same-scope tombstone recapture guard', () => {
  it('A10-R4 should return pending_adjudication for a recaptured tombstoned payload, never ILLEGAL_TRANSITION', async () => {
    const { memory, store } = buildMemory({ scope: 'scope:l3' });
    const first = await memory.capture(captureRequest('l2-recapture-key-0001', '1', 'recapture body'));
    expect(first).toMatchObject({ ok: true });
    if (!first.ok) throw Error('capture failed');
    const admitted = await memory.requestAdmission(admission(first.value.candidate_id!));
    expect(admitted).toMatchObject({ ok: true, value: { status: 'accepted' } });
    if (!admitted.ok || admitted.value.record_id === undefined) throw Error('admission failed');
    expect(await memory.transition(tombstone(admitted.value.record_id, 'event:l2:forget'))).toMatchObject({
      ok: true, value: { to_state: 'tombstoned' },
    });
    const second = await memory.capture(captureRequest('l2-recapture-key-0002', '2', 'recapture body'));
    expect(second.ok).toBe(true);
    if (!second.ok) throw Error('recapture failed');
    expect(second.value.candidate_id).not.toBe(first.value.candidate_id);
    const before = snapshot(store);
    const result = await memory.requestAdmission(admission(second.value.candidate_id!));
    expect(result).toMatchObject({ ok: true, value: { status: 'pending_adjudication' } });
    expect(JSON.stringify(result)).not.toContain('ILLEGAL_TRANSITION');
    const retry = await memory.requestAdmission(admission(second.value.candidate_id!));
    expect(retry).toEqual(result);
    expect(snapshot(store)).toEqual(before);
  });

  it('M5 should hold pending_adjudication when the tombstone lands while the recapture is pending', async () => {
    const { memory } = buildMemory({ scope: 'scope:l3' });
    const first = await memory.capture(captureRequest('l2-recapture-key-0011', '1', 'race body'));
    if (!first.ok) throw Error('capture failed');
    const admitted = await memory.requestAdmission(admission(first.value.candidate_id!));
    if (!admitted.ok || admitted.value.record_id === undefined) throw Error('admission failed');
    const pending = await memory.capture(captureRequest('l2-recapture-key-0012', '2', 'race body'));
    if (!pending.ok) throw Error('recapture failed');
    expect(await memory.transition(tombstone(admitted.value.record_id, 'event:l2:race-forget'))).toMatchObject({
      ok: true, value: { to_state: 'tombstoned' },
    });
    await expect(memory.requestAdmission(admission(pending.value.candidate_id!))).resolves.toMatchObject({
      ok: true, value: { status: 'pending_adjudication' },
    });
  });

  it('M5 should survive restart with fresh port caches over the same durable store', async () => {
    const first = buildMemory({ scope: 'scope:l3' });
    const captured = await first.memory.capture(captureRequest('l2-recapture-key-0021', '1', 'restart body'));
    if (!captured.ok) throw Error('capture failed');
    const admitted = await first.memory.requestAdmission(admission(captured.value.candidate_id!));
    if (!admitted.ok || admitted.value.record_id === undefined) throw Error('admission failed');
    await first.memory.transition(tombstone(admitted.value.record_id, 'event:l2:restart-forget'));
    const recaptured = await first.memory.capture(captureRequest('l2-recapture-key-0022', '2', 'restart body'));
    if (!recaptured.ok) throw Error('recapture failed');
    const restarted = createMemoryPortV2(first.dependencies);
    await expect(restarted.requestAdmission(admission(recaptured.value.candidate_id!))).resolves.toMatchObject({
      ok: true, value: { status: 'pending_adjudication' },
    });
  });

  it('M5 should accept the same text in another scope despite the tombstone', async () => {
    let scope = 'scope:other';
    const { memory } = buildMemory({ scopeResolver: () => scope });
    const foreign = await memory.capture({
      ...captureRequest('l2-recapture-key-0031', '1', 'scoped body'),
      payload: { ...captureRequest('l2-recapture-key-0031', '1', 'scoped body').payload, scope_ref: 'scope:other' },
    });
    if (!foreign.ok) throw Error('capture failed');
    const admitted = await memory.requestAdmission(admission(foreign.value.candidate_id!));
    if (!admitted.ok || admitted.value.record_id === undefined) throw Error('admission failed');
    await memory.transition(tombstone(admitted.value.record_id, 'event:l2:scope-forget'));
    scope = 'scope:l3';
    const local = await memory.capture(captureRequest('l2-recapture-key-0032', '2', 'scoped body'));
    if (!local.ok) throw Error('capture failed');
    await expect(memory.requestAdmission(admission(local.value.candidate_id!))).resolves.toMatchObject({
      ok: true, value: { status: 'accepted' },
    });
  });
});
