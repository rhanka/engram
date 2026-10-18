import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NOW, openRecoveryFixture, prepareOperation, type RecoveryFixture, type RecoveryOperation } from './memory-mcp-l2-recovery-fixture.js';

describe.each<RecoveryOperation>(['withdraw', 'forget', 'requestAdmission', 'capture'])('MCP-L2 effect guard: %s', operation => {
  it('should recheck host policy and confirmation after asynchronous dependencies before committing', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-effect-guard-'));
    let now = NOW;
    const rig = await openRecoveryFixture(directory, { now: () => now }, true);
    try {
      const invoke = await prepareOperation(rig, operation);
      const before = await rig.store.readiness();
      const effects = [vi.spyOn(rig.store, 'commitPending'), vi.spyOn(rig.store, 'applyAdmission'), vi.spyOn(rig.store, 'applyLifecycle')];
      const expired = operation === 'withdraw' || operation === 'forget';
      if (expired) {
        const revalidate = rig.dependencies.authorization.revalidate.bind(rig.dependencies.authorization);
        vi.spyOn(rig.dependencies.authorization, 'revalidate').mockImplementationOnce(async (...args) => {
          const result = await revalidate(...args);
          now = '2026-08-16T12:35:11.789Z';
          return result;
        });
      } else if (operation === 'capture') {
        const seal = rig.dependencies.crypto.seal.bind(rig.dependencies.crypto);
        vi.spyOn(rig.dependencies.crypto, 'seal').mockImplementationOnce(async input => {
          const sealed = await seal(input);
          await rig.ports.policy.rotate('engram_memory_capture');
          return sealed;
        });
      } else {
        const decide = rig.dependencies.admission_policy.decide.bind(rig.dependencies.admission_policy);
        vi.spyOn(rig.dependencies.admission_policy, 'decide').mockImplementationOnce(async input => {
          const decision = await decide(input);
          await rig.ports.policy.rotate('engram_memory_request_admission');
          return decision;
        });
      }
      expect(await invoke(rig)).toMatchObject({ ok: false, error: { code: expired ? 'gate_failed' : 'POLICY_STALE' } });
      for (const effect of effects) expect(effect).not.toHaveBeenCalled();
      const after = await rig.store.readiness();
      if (!before.ok || !after.ok) throw Error('canonical readiness failed');
      expect(after.value.high_water_cursor).toBe(before.value.high_water_cursor);
    } finally { await rig.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(['host', 'neutral'])('should refuse committed disclosure after SQLite reopen when %s authority is revoked', async authority => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-replay-auth-'));
    const clock = { now: () => NOW };
    const first = await openRecoveryFixture(directory, clock, true);
    let second: RecoveryFixture | undefined;
    try {
      const invoke = await prepareOperation(first, operation);
      expect(await invoke(first)).toMatchObject({ ok: true });
      await first.close();
      second = await openRecoveryFixture(directory, clock);
      if (authority === 'host') vi.spyOn(second.host, 'authorize').mockResolvedValue(false);
      else vi.spyOn(second.dependencies.authorization, 'authorize').mockResolvedValue({
        ok: false, error: { code: 'UNAUTHORIZED', operation: 'capture', message: 'revoked', retryable: false },
      });
      const result = await invoke(second, 'session:two');
      expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
      expect(JSON.stringify(result)).not.toContain('transaction_receipt_digest');
    } finally { await second?.close(); await first.close(); rmSync(directory, { recursive: true, force: true }); }
  });
});
