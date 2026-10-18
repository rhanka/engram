import { join } from 'node:path';
import { createMemoryPortV2, openFencedSqliteCanonicalMemoryStoreV1, receiptDigest } from '../engram-memory/index.js';
import { createReferenceWriteHostPortsV1 } from '../src/mcp/memory/reference-ports.js';
import { createMemoryWriteToolsV1 } from '../src/memory-tools/writes.js';
import { captureRequest, NOW } from './memory-l3-fixture.js';
import { buildMemory } from './memory-l7-fixture.js';

export const invocation = (session_id = 'session:one') => ({
  auditId: 'audit:l2-recovery', authorization: { credential: 'credential:l7' },
  scope_ref: 'scope:l3', store_id: 'memory:canonical', principal_namespace: 'principal:test',
  principal_id: 'alice', tenant_id: 'tenant:one', connector_instance_ref: 'connector:one',
  agent_id: 'agent:one', session_id, generation: '1', deadline_at: '2026-08-16T12:35:16.789Z',
});

export function captureInput(key: string) {
  const request = captureRequest(key, '1', 'canonical recovery body');
  const { scope_ref: _scope, retention: _retention, ...payload } = request.payload;
  return { idempotency_key: key, payload, evidence: request.evidence };
}

export async function openRecoveryFixture(directory: string, clock: { now(): string }, approve = false) {
  const opened = await openFencedSqliteCanonicalMemoryStoreV1({
    filename: join(directory, 'canonical.sqlite'), clock, allow_ephemeral_filesystem_store: true,
  });
  if (!opened.ok) throw Error(JSON.stringify(opened));
  const store = opened.value;
  const { dependencies } = buildMemory({ scope: 'scope:l3', store, clock });
  // Test-only, stateless custody: envelope material lives in SQLite, so a new
  // engine and new dependency objects cannot recover it from a process cache.
  dependencies.crypto = {
    ...dependencies.crypto,
    async seal(input) {
      const body = { candidate_id: input.candidate_id, envelope_ref: `envelope:${input.candidate_id}`,
        key_ref: `key:${input.candidate_id}`, ciphertext: input.plaintext };
      return { ok: true, value: { ...body, envelope_digest: receiptDigest('sealed-candidate', body) } };
    },
    async open(input) { return { ok: true, value: { plaintext: input.sealed.ciphertext } }; },
  };
  const memory = createMemoryPortV2(dependencies);
  const ports = await createReferenceWriteHostPortsV1({ directory, clock });
  const host = {
    clock, authenticate: async () => true, authorize: async () => true,
    reservation: ports.reservation, audit: ports.audit, policy: ports.policy,
    confirm: async (binding: Parameters<typeof ports.confirm>[0]) => {
      if (approve) await ports.grantConfirmation(binding, '2026-08-16T12:35:06.789Z');
      return ports.confirm(binding);
    },
    keyCustody: ports.keyCustody, coverage: ports.coverage,
  };
  const tools = createMemoryWriteToolsV1({ facets: {
    scope_ref: 'scope:l3', store_id: 'memory:canonical', engine: memory,
  }, host });
  return { memory, store, dependencies, ports, host, tools, async close() { ports.close(); await store.close(); } };
}

export type RecoveryFixture = Awaited<ReturnType<typeof openRecoveryFixture>>;
export type RecoveryOperation = 'capture' | 'requestAdmission' | 'withdraw' | 'forget';

export async function prepareOperation(first: RecoveryFixture, operation: RecoveryOperation) {
  const input = captureInput('l2-recovery-mutation-key-00001');
  if (operation === 'capture') return (rig: RecoveryFixture, session = 'session:one') => rig.tools.capture(input, invocation(session));
  const captured = await first.tools.capture(captureInput('l2-recovery-seeding-key-00001'), invocation());
  if (!captured.ok || !captured.output.value.candidate_id) throw Error('seed capture failed');
  const candidate_id = captured.output.value.candidate_id;
  const target = { candidate_id, idempotency_key: input.idempotency_key, reason_ref: 'reason:recovery' };
  if (operation === 'withdraw') return (rig: RecoveryFixture, session = 'session:one') => rig.tools.withdraw(target, invocation(session));
  if (operation === 'requestAdmission') {
    const admission = { candidate_id, idempotency_key: input.idempotency_key };
    return (rig: RecoveryFixture, session = 'session:one') => rig.tools.requestAdmission(admission, invocation(session));
  }
  const admitted = await first.tools.requestAdmission({ candidate_id, idempotency_key: 'l2-recovery-seeding-key-00002' }, invocation());
  if (!admitted.ok || !admitted.output.value.outcome.record_id) throw Error('seed admission failed');
  const forget = { record_id: admitted.output.value.outcome.record_id, idempotency_key: input.idempotency_key, reason_ref: target.reason_ref };
  return (rig: RecoveryFixture, session = 'session:one') => rig.tools.forget(forget, invocation(session));
}

export { NOW };
