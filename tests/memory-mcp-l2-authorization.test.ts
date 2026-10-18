import { describe, expect, it, vi } from 'vitest';
import { receiptDigest } from '../engram-memory/digests.js';
import { captureRequest } from './memory-l3-fixture.js';
import { buildMemory } from './memory-l7-fixture.js';

// Independent oracle: SPEC-memory-mcp-v3.1.md M4 l.519–530 and M5 l.601–615:
// every duplicate/cache/conflict disclosure requires current authorization.
const request = () => captureRequest('l2-authorization-key-0001', '1');
const admission = (candidate_id: string) => ({
  candidate_id, authorization: request().authorization, deadline_at: request().deadline_at,
});
const snapshot = (store: unknown) => (store as { exportStateForPersistence(): unknown }).exportStateForPersistence();

describe('MCP-L2 authorization before replay and conflict', () => {
  it.each([false, true])('M4/M5 should authorize capture before disclosing a cached conflict (changed=%s)', async changed => {
    const { memory, store, dependencies } = buildMemory({ scope: 'scope:l3' });
    expect((await memory.capture(request())).ok).toBe(true);
    const before = snapshot(store);
    const authorize = vi.spyOn(dependencies.authorization, 'authorize').mockResolvedValue({
      ok: false, error: { code: 'UNAUTHORIZED', operation: 'capture', message: 'denied', retryable: false },
    });
    const retry = request();
    if (changed) retry.payload.components[0]!.text = 'changed private input';
    expect(await memory.capture(retry)).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(authorize).toHaveBeenCalledOnce();
    expect(snapshot(store)).toEqual(before);
  });

  it('M4/M5 should reauthorize a cached admission after revocation without revealing its receipt', async () => {
    const { memory, store, dependencies } = buildMemory({ scope: 'scope:l3' });
    const captured = await memory.capture(request());
    if (!captured.ok) throw Error('capture failed');
    const input = admission(captured.value.candidate_id!);
    expect(await memory.requestAdmission(input)).toMatchObject({ ok: true, value: { status: 'accepted' } });
    const before = snapshot(store);
    const decide = vi.spyOn(dependencies.admission_policy, 'decide');
    const revalidate = vi.spyOn(dependencies.authorization, 'revalidate').mockResolvedValue({
      ok: false, error: { code: 'AUTHORIZATION_REVOKED', operation: 'request_admission', message: 'revoked', retryable: false },
    });
    const result = await memory.requestAdmission(input);
    expect(result).toMatchObject({ ok: false, error: { code: 'AUTHORIZATION_REVOKED' } });
    expect(JSON.stringify(result)).not.toContain('transaction_receipt_digest');
    expect(revalidate).toHaveBeenCalledOnce();
    expect(decide).not.toHaveBeenCalled();
    expect(snapshot(store)).toEqual(before);
  });

  it.each([undefined, false, null, 'true', 1])('M4 should refuse cached admission with nonliteral revalidation %s', async valid => {
    const { memory, store, dependencies } = buildMemory({ scope: 'scope:l3' });
    const captured = await memory.capture(request());
    if (!captured.ok) throw Error('capture failed');
    const input = admission(captured.value.candidate_id!);
    expect((await memory.requestAdmission(input)).ok).toBe(true);
    const before = snapshot(store);
    vi.spyOn(dependencies.authorization, 'revalidate').mockImplementation(async (receipt_digest, checked_at) => {
      const body: any = { receipt_digest, checked_at, current_revocation_epoch: '0', reason: 'valid' };
      if (valid !== undefined) body.valid = valid;
      return { ok: true, value: { ...body, revalidation_receipt_digest: receiptDigest('authorization-revalidation', body, 'revalidation_receipt_digest') } };
    });
    const result = await memory.requestAdmission(input);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('transaction_receipt_digest');
    expect(snapshot(store)).toEqual(before);
  });

  it('M4/M5 should bind cached admission disclosure to the original exact scope', async () => {
    let scope = 'scope:l3';
    const { memory, store } = buildMemory({ scopeResolver: () => scope });
    const captured = await memory.capture(request());
    if (!captured.ok) throw Error('capture failed');
    const input = admission(captured.value.candidate_id!);
    const first = await memory.requestAdmission(input);
    expect(first.ok).toBe(true);
    const before = snapshot(store);
    scope = 'scope:other';
    expect(await memory.requestAdmission(input)).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    scope = 'scope:l3';
    expect(await memory.requestAdmission(input)).toEqual(first);
    expect(snapshot(store)).toEqual(before);
  });
});
