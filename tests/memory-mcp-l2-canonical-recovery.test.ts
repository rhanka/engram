import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NOW, openRecoveryFixture, prepareOperation, type RecoveryFixture, type RecoveryOperation } from './memory-mcp-l2-recovery-fixture.js';

// Independent oracle: v3.2 M4 l.583–587; M5 l.702, 708–710, 730, 744.
// The host claim is durable in BOTH arms. Only canonical SQLite evidence may
// distinguish a lost claim ACK (no effect) from a lost engine ACK (committed).
describe.each<RecoveryOperation>(['withdraw', 'forget', 'requestAdmission', 'capture'])('MCP-L2 canonical recovery: %s', operation => {
  it.each([false, true])('should consult canonical proof before expired guards when committed=%s', async committed => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-canonical-recovery-'));
    let now = NOW;
    const clock = { now: () => now };
    const first = await openRecoveryFixture(directory, clock, true);
    let second: RecoveryFixture | undefined;
    try {
      const invoke = await prepareOperation(first, operation);
      if (committed) {
        const method = operation === 'capture' ? 'capture' : operation === 'requestAdmission' ? 'requestAdmission' : 'transition';
        const original = first.memory[method].bind(first.memory);
        vi.spyOn(first.memory, method).mockImplementationOnce(async (input, guard) => {
          const result = await original(input as never, guard);
          expect(result.ok).toBe(true);
          throw Error('canonical commit ACK lost before host reconciliation');
        });
      } else {
        const claim = first.ports.reservation.claimFencedExecution.bind(first.ports.reservation);
        vi.spyOn(first.ports.reservation, 'claimFencedExecution').mockImplementationOnce(async (...args) => {
          expect((await claim(...args)).ok).toBe(true);
          throw Error('claim ACK lost before canonical effect');
        });
      }
      expect(await invoke(first)).toMatchObject({ ok: false, error: {
        code: committed ? 'MUTATION_OUTCOME_UNKNOWN' : 'STORE_UNAVAILABLE',
      } });
      const before = await first.store.readiness();
      const policyTool = operation === 'capture' ? 'engram_memory_capture' : 'engram_memory_request_admission';
      if (operation === 'capture' || operation === 'requestAdmission') await first.ports.policy.rotate(policyTool);
      await first.close();
      now = '2026-08-16T12:35:11.789Z';
      second = await openRecoveryFixture(directory, clock);
      expect(second.memory).not.toBe(first.memory);
      expect(second.store).not.toBe(first.store);
      const effects = [vi.spyOn(second.store, 'commitPending'), vi.spyOn(second.store, 'applyAdmission'), vi.spyOn(second.store, 'applyLifecycle')];
      const confirm = vi.spyOn(second.host, 'confirm');
      const policy = vi.spyOn(second.dependencies.admission_policy, 'decide');
      const replay = await invoke(second, 'session:two');
      if (committed) {
        expect(replay).toMatchObject({ ok: true, output: { value: operation === 'capture'
          ? { status: 'duplicate_exact' } : operation === 'requestAdmission'
            ? { replayed: true, outcome: { status: 'accepted' } }
            : { replayed: true, receipt: { to_state: operation === 'withdraw' ? 'withdrawn' : 'tombstoned' } },
        } });
        expect(confirm).not.toHaveBeenCalled();
      } else {
        expect(replay).toMatchObject({ ok: false, error: {
          code: operation === 'capture' || operation === 'requestAdmission' ? 'POLICY_STALE' : 'gate_failed',
        } });
        if (operation === 'withdraw' || operation === 'forget') expect(confirm).toHaveBeenCalledOnce();
      }
      for (const effect of effects) expect(effect).not.toHaveBeenCalled();
      expect(policy).not.toHaveBeenCalled();
      const after = await second.store.readiness();
      if (!before.ok || !after.ok) throw Error('canonical readiness failed');
      expect(after.value.high_water_cursor).toBe(before.value.high_water_cursor);
    } finally {
      await second?.close();
      await first.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
