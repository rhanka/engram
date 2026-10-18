import { describe, expect, it, vi } from 'vitest';
import { receiptDigest } from '../engram-memory/digests.js';
import { captureRequest } from './memory-l3-fixture.js';
import { buildMemory, NOW } from './memory-l7-fixture.js';

// SPEC-memory-mcp-v3.1.md M4 l.525–530/567 and M5 l.747–749:
// cancellation before commit prevents the effect; lost/cancelled response after
// commit does not roll it back or authorize another effect.
const request = () => captureRequest('l2-interruption-key-0001', '1');
const snapshot = (store: unknown) => (store as { exportStateForPersistence(): unknown }).exportStateForPersistence();

describe('MCP-L2 precommit interruption', () => {
  it.each(['cancel', 'deadline', 'revoke'] as const)('M4/M5 should prevent capture when %s occurs while sealing', async kind => {
    let now = NOW;
    const { memory, store, dependencies } = buildMemory({ scope: 'scope:l3', clock: { now: () => now } });
    const before = snapshot(store);
    const commit = vi.spyOn(store, 'commitPending');
    const destroy = vi.spyOn(dependencies.crypto, 'destroy');
    const seal = dependencies.crypto.seal.bind(dependencies.crypto);
    vi.spyOn(dependencies.crypto, 'seal').mockImplementation(async input => {
      const result = await seal(input);
      if (kind === 'cancel') await memory.cancelCapture(request().cancellation_ref);
      if (kind === 'deadline') now = request().deadline_at;
      if (kind === 'revoke') vi.spyOn(dependencies.authorization, 'revalidate').mockResolvedValue({
        ok: false, error: { code: 'AUTHORIZATION_REVOKED', operation: 'capture', message: 'revoked', retryable: false },
      });
      return result;
    });
    const code = { cancel: 'CANCELLED', deadline: 'DEADLINE_EXCEEDED', revoke: 'AUTHORIZATION_REVOKED' }[kind];
    expect(await memory.capture(request())).toMatchObject({ ok: false, error: { code } });
    expect(commit).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
    expect(snapshot(store)).toEqual(before);
  });

  it('M5 should preserve a committed capture after cancellation and recover with the same source and key', async () => {
    const { memory, store } = buildMemory({ scope: 'scope:l3' });
    const commit = store.commitPending.bind(store);
    const commitSpy = vi.spyOn(store, 'commitPending').mockImplementation(async input => {
      const result = await commit(input);
      await memory.cancelCapture(request().cancellation_ref);
      return result;
    });
    const first = await memory.capture(request());
    expect(first).toMatchObject({ ok: true, value: { status: 'committed_pending' } });
    if (!first.ok) throw Error('capture failed');
    const retry = await memory.capture({ ...request(), cancellation_ref: 'cancel:reattached' });
    expect(retry).toMatchObject({ ok: true, value: {
      status: 'duplicate_exact', candidate_id: first.value.candidate_id,
      cursor: first.value.cursor, transaction_receipt_digest: first.value.transaction_receipt_digest,
    } });
    expect(commitSpy).toHaveBeenCalledOnce();
  });

  it.each([undefined, false, null, 'true', 1])('M4 should refuse admission if the effect verdict becomes %s during policy evaluation', async valid => {
    const { memory, store, dependencies } = buildMemory({ scope: 'scope:l3' });
    const captured = await memory.capture(request());
    if (!captured.ok) throw Error('capture failed');
    const before = snapshot(store);
    const apply = vi.spyOn(store, 'applyAdmission');
    const decide = dependencies.admission_policy.decide.bind(dependencies.admission_policy);
    vi.spyOn(dependencies.admission_policy, 'decide').mockImplementation(async input => {
      const result = await decide(input);
      vi.spyOn(dependencies.authorization, 'revalidate').mockImplementation(async (receipt_digest, checked_at) => {
        const body: any = { receipt_digest, checked_at, current_revocation_epoch: '0', reason: 'valid' };
        if (valid !== undefined) body.valid = valid;
        return { ok: true, value: { ...body, revalidation_receipt_digest: receiptDigest('authorization-revalidation', body, 'revalidation_receipt_digest') } };
      });
      return result;
    });
    const result = await memory.requestAdmission({ candidate_id: captured.value.candidate_id!, authorization: request().authorization, deadline_at: request().deadline_at });
    expect(result.ok).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(snapshot(store)).toEqual(before);
  });

  it.each(['withdraw', 'dispute', 'tombstone'] as const)('M4 should prevent %s after revocation during canonical state lookup', async operation => {
    const { memory, store, dependencies } = buildMemory({ scope: 'scope:l3' });
    const captured = await memory.capture(request());
    if (!captured.ok) throw Error('capture failed');
    const candidate_id = captured.value.candidate_id!;
    let record_id: string | undefined;
    if (operation !== 'withdraw') {
      const admitted = await memory.requestAdmission({ candidate_id, authorization: request().authorization, deadline_at: request().deadline_at });
      if (!admitted.ok) throw Error('admission failed');
      record_id = admitted.value.record_id;
    }
    const before = snapshot(store);
    const apply = vi.spyOn(store, 'applyLifecycle');
    const read = store.readJournal.bind(store);
    vi.spyOn(store, 'readJournal').mockImplementation(async input => {
      const result = await read(input);
      vi.spyOn(dependencies.authorization, 'revalidate').mockResolvedValue({
        ok: false, error: { code: 'AUTHORIZATION_REVOKED', operation: 'mark_non_current', message: 'revoked', retryable: false },
      });
      return result;
    });
    const result = await memory.transition({
      operation, ...(operation === 'withdraw' ? { candidate_id } : { record_id: record_id! }),
      event_id: 'event:l2:revoked', reason_ref: 'reason:l2',
      event_anchor: { occurred_at: NOW, kind_ref: 'event:l2', provenance_ref: 'provenance:l2', provenance_digest: request().evidence.evidence_digest },
      authorization: request().authorization, deadline_at: request().deadline_at,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'AUTHORIZATION_REVOKED', operation } });
    expect(apply).not.toHaveBeenCalled();
    expect(snapshot(store)).toEqual(before);
  });
});
