import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReferenceWriteHostPortsV1 } from '../src/mcp/memory/reference-ports.js';
import { createMemoryWriteToolsV1 } from '../src/memory-tools/writes.js';
import { captureRequest, NOW } from './memory-l3-fixture.js';
import { buildMemory } from './memory-l7-fixture.js';

// Independent oracle: SPEC-memory-mcp-v3.2.md M4 l.583-587 (confirmation
// re-verified before the first effect, never reused across reopen/expiry or a
// new session) and M5 l.702 (uncommitted reservation under a rotated policy
// answers POLICY_STALE), restated by DESIGN-NOTE-L2-round3.md. Each test goes
// through a real SQLite close/reopen: both defects only show up after one.
const SCOPE = 'scope:l3';
const STORE = 'memory:canonical';
const SHORT_DEADLINE = '2026-08-16T12:35:16.789Z';
const PRINCIPALS = {
  principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one',
  connector_instance_ref: 'connector:one', agent_id: 'agent:one', session_id: 'session:one',
};

function invocation(overrides = {}) {
  return {
    auditId: 'audit:l2-r3', authorization: { credential: 'credential:l7' },
    scope_ref: SCOPE, store_id: STORE, ...PRINCIPALS, generation: '1', deadline_at: SHORT_DEADLINE,
    cancellation_ref: 'cancel:l2-r3', elicitation_ref: 'elicit:l2-r3',
    ...overrides,
  };
}

function agentCapture(key: string, sequence: string, text = 'round3 body') {
  const request = captureRequest(key, sequence, text);
  const { scope_ref: _scope, retention: _retention, ...payload } = request.payload;
  return { idempotency_key: request.idempotency_key, payload, evidence: request.evidence };
}

function candidateIdOf(outcome: unknown): string {
  if (!outcome || typeof outcome !== 'object') throw Error('capture failed');
  const value = (outcome as { ok: boolean; output?: { value?: { candidate_id?: string } } }).output?.value;
  if ((outcome as { ok: boolean }).ok !== true || value?.candidate_id === undefined) throw Error('capture failed');
  return value.candidate_id;
}

async function setup(directory: string, opts: {
  now?: () => string; shared?: ReturnType<typeof buildMemory>; grantExpiresAt?: string;
} = {}) {
  const fresh = opts.shared ?? buildMemory({ scope: SCOPE });
  const memory = fresh.memory as never;
  const clock = { now: opts.now ?? (() => NOW) };
  const ports = await createReferenceWriteHostPortsV1({ directory, clock });
  const host = {
    clock, authenticate: async () => true, authorize: async () => true,
    reservation: ports.reservation, audit: ports.audit, policy: ports.policy,
    confirm: async (binding: { capability: string; target_ref: string; operation_digest: string; reservation_ref: string }) => {
      if (opts.grantExpiresAt !== undefined) await ports.grantConfirmation(binding, opts.grantExpiresAt);
      return ports.confirm(binding);
    },
    keyCustody: ports.keyCustody, coverage: ports.coverage,
  };
  const tools = createMemoryWriteToolsV1({ facets: { scope_ref: SCOPE, store_id: STORE, engine: memory }, host });
  return { ...fresh, memory, tools, ports };
}

/** Later fence claims land in the port but their ACK is lost pre-effect. */
function armClaimAckLoss(ports: { reservation: { claimFencedExecution: unknown } }): void {
  const reservation = ports.reservation as {
    claimFencedExecution: (ref: string, gen: string) => Promise<{ ok: boolean }>;
  };
  const inner = reservation.claimFencedExecution.bind(reservation);
  reservation.claimFencedExecution = (async (ref: string, gen: string) => {
    const claimed = await inner(ref, gen);
    if (!claimed.ok) return claimed;
    throw new Error('claim ack lost before any effect');
  }) as never;
}

describe('MCP-L2 round-3 lifecycle findings', () => {
  it('M4R1 should refuse withdrawal after reopen when the confirmation expired and the session is new', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-r3-'));
    let now = NOW;
    try {
      // One approval bound to this exact reservation/digest, expiring 10s
      // after issue; the fence claim lands but its ACK is lost pre-effect.
      const first = await setup(directory, {
        now: () => now, grantExpiresAt: '2026-08-16T12:35:06.789Z'
      });
      const candidateId = candidateIdOf(await first.tools.capture(agentCapture('l2-r3-key-000011', '1'), invocation()));
      armClaimAckLoss(first.ports);
      const input = { candidate_id: candidateId, idempotency_key: 'l2-r3-key-000012-0000', reason_ref: 'reason:one' };
      await expect(first.tools.withdraw(input, invocation())).resolves.toMatchObject({
        ok: false, error: { code: 'STORE_UNAVAILABLE' },
      });
      first.ports.close();
      // Reopen after the approval expired; the retry arrives on a new session.
      now = '2026-08-16T12:35:11.789Z';
      const second = await setup(directory, { now: () => now, shared: first });
      const transitions = vi.spyOn(second.store, 'applyLifecycle');
      const retry = await second.tools.withdraw(input, invocation({ session_id: 'session:two' }));
      expect(retry).toMatchObject({ ok: false, error: { code: 'gate_failed' } });
      expect(transitions).not.toHaveBeenCalled();
      second.ports.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('M4R1 should complete the same-key withdrawal after reopen while the confirmation is still valid', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-r3-'));
    let now = NOW;
    try {
      const first = await setup(directory, {
        now: () => now, grantExpiresAt: '2026-08-16T12:35:06.789Z'
      });
      const candidateId = candidateIdOf(await first.tools.capture(agentCapture('l2-r3-key-000021', '1'), invocation()));
      armClaimAckLoss(first.ports);
      const input = { candidate_id: candidateId, idempotency_key: 'l2-r3-key-000022-0000', reason_ref: 'reason:one' };
      await expect(first.tools.withdraw(input, invocation())).resolves.toMatchObject({
        ok: false, error: { code: 'STORE_UNAVAILABLE' },
      });
      first.ports.close();
      // The same approval still covers the retry: one canonical effect only.
      now = '2026-08-16T12:35:01.789Z';
      const second = await setup(directory, {
        now: () => now, grantExpiresAt: '2026-08-16T12:35:06.789Z', shared: first,
      });
      const transitions = vi.spyOn(second.store, 'applyLifecycle');
      const retry = await second.tools.withdraw(input, invocation({ session_id: 'session:two' }));
      expect(retry).toMatchObject({ ok: true, output: { value: { receipt: { to_state: 'withdrawn' } } } });
      expect(transitions).toHaveBeenCalledOnce();
      second.ports.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('M5R2 should answer POLICY_STALE after reopen when an unknown admission meets a rotated policy', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-r3-'));
    try {
      const first = await setup(directory, {});
      const candidateId = candidateIdOf(await first.tools.capture(agentCapture('l2-r3-key-000031', '1'), invocation()));
      armClaimAckLoss(first.ports);
      const input = { candidate_id: candidateId, idempotency_key: 'l2-r3-key-000032-0000' };
      // Fence claimed, outcome unknown, no canonical effect committed.
      await expect(first.tools.requestAdmission(input, invocation())).resolves.toMatchObject({
        ok: false, error: { code: 'STORE_UNAVAILABLE' },
      });
      await first.ports.policy.rotate('engram_memory_request_admission');
      first.ports.close();
      const second = await setup(directory, { shared: first });
      const admissions = vi.spyOn(second.store, 'applyAdmission');
      const retry = await second.tools.requestAdmission(input, invocation());
      expect(retry).toMatchObject({ ok: false, error: { code: 'POLICY_STALE' } });
      expect(admissions).not.toHaveBeenCalled();
      second.ports.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('M5R2 should accept the same-key admission after reopen while the policy is unchanged', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-r3-'));
    try {
      const first = await setup(directory, {});
      const candidateId = candidateIdOf(await first.tools.capture(agentCapture('l2-r3-key-000041', '1'), invocation()));
      armClaimAckLoss(first.ports);
      const input = { candidate_id: candidateId, idempotency_key: 'l2-r3-key-000042-0000' };
      await expect(first.tools.requestAdmission(input, invocation())).resolves.toMatchObject({
        ok: false, error: { code: 'STORE_UNAVAILABLE' },
      });
      first.ports.close();
      const second = await setup(directory, { shared: first });
      const admissions = vi.spyOn(second.store, 'applyAdmission');
      const retry = await second.tools.requestAdmission(input, invocation());
      expect(retry).toMatchObject({ ok: true, output: { value: { outcome: { status: 'accepted' } } } });
      expect(admissions).toHaveBeenCalledOnce();
      second.ports.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
