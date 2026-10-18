import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReferenceWriteHostPortsV1 } from '../src/mcp/memory/reference-ports.js';
import { computeMemoryMutationOperationDigestV1, projectMemoryMutationPolicyVersionsV1 } from '../src/mcp/memory/policy.js';
import { createMemoryWriteToolsV1 } from '../src/memory-tools/writes.js';
import { captureRequest, NOW } from './memory-l3-fixture.js';
import { buildMemory } from './memory-l7-fixture.js';

// Independent oracle: SPEC-memory-mcp-v3.1.md M5 (durable reservation,
// replay, unknown never re-effects, cross-tool keys, retry reuses resolved
// defaults) and M14 §B-2 (named non-mock reference durable host-port set;
// test-only confirmation binds the operation digest).
const SCOPE = 'scope:l3';
const STORE = 'memory:canonical';
const SHORT_DEADLINE = '2026-08-16T12:35:16.789Z';
const LATER = '2026-08-18T12:35:16.789Z';

function invocation(overrides = {}) {
  return {
    auditId: 'audit:l2-ports', authorization: { credential: 'credential:l7' },
    scope_ref: SCOPE, store_id: STORE, principal_namespace: 'principal:test', principal_id: 'alice',
    tenant_id: 'tenant:one', connector_instance_ref: 'connector:one', agent_id: 'agent:one', session_id: 'session:one',
    generation: '1', deadline_at: SHORT_DEADLINE, ...overrides,
  };
}

function agentCapture(key: string, sequence: string, text = 'ports body') {
  const request = captureRequest(key, sequence, text);
  const { scope_ref: _scope, retention: _retention, ...payload } = request.payload;
  return { idempotency_key: request.idempotency_key, payload, evidence: request.evidence };
}

function setup(directory: string, overrides = {}) {
  const fixture = buildMemory({ scope: SCOPE });
  const ports = createReferenceWriteHostPortsV1({ directory });
  const host = {
    clock: { now: () => NOW },
    authenticate: async () => true,
    authorize: async () => true,
    reservation: ports.reservation,
    audit: ports.audit,
    policy: ports.policy,
    confirm: ports.confirm,
    keyCustody: ports.keyCustody,
    coverage: ports.coverage,
    ...overrides,
  };
  const tools = createMemoryWriteToolsV1({ facets: { scope_ref: SCOPE, store_id: STORE, engine: fixture.memory }, host });
  return { ...fixture, tools, ports };
}

describe('MCP-L2 reference durable host ports', () => {
  it('M5 should replay the identical capture across port restart with one engine effect', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-ports-'));
    try {
      const first = setup(directory);
      const commit = vi.spyOn(first.store, 'commitPending');
      const input = agentCapture('l2-ports-key-0001', '1');
      const completed = await first.tools.capture(input, invocation());
      expect(completed.ok).toBe(true);
      const second = setup(directory);
      const replayed = await second.tools.capture(input, invocation());
      expect(replayed).toEqual(completed.ok && replayed.ok
        ? { ...completed, output: { ...completed.output, value: { ...completed.output.value, status: 'duplicate_exact' } } }
        : replayed);
      expect(commit).toHaveBeenCalledOnce();
      const audit = second.ports.auditLog();
      expect(audit.some((entry) => entry.decision === 'complete')).toBe(true);
      expect(audit.some((entry) => entry.decision === 'replay')).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('M5 should reuse persisted retention across a clock advance instead of recomputing expiry', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-ports-'));
    try {
      const ports = createReferenceWriteHostPortsV1({ directory });
      const key = {
        principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one', store_id: STORE,
        provider_id: 'sentropic.engram.memory', connector_id: 'engram-memory', connector_instance_ref: 'connector:one',
        scope_ref: SCOPE, idempotency_key: 'l2-ports-key-0002-00000000',
      };
      const seed = captureRequest('l2-ports-key-0002-0001', '7', 'ports body');
      const preimage = {
        profile: 'sentropic.engram.memory-mutation/v1', reservation_ref: 'reservation:one',
        provider_id: 'sentropic.engram.memory', provider_contract_version: '1.0.0',
        principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one', store_id: STORE,
        connector_id: 'engram-memory', connector_instance_ref: 'connector:one', scope_ref: SCOPE,
        tool_name: 'engram_memory_capture', idempotency_key: 'l2-ports-key-0002-00000000',
        target: { kind: 'capture_source', source_ref: 'source:host', sequence: '1' },
        effective_input: {
          tool_name: 'engram_memory_capture',
          payload: { ...seed.payload, retention: { derivative_rule: 'make-ineligible', expires_at: '2026-09-15T12:34:56.789Z' } },
          evidence: seed.evidence,
          capture_policy_version: 'capture-policy/v1',
        },
      } as never;
      const first = await ports.reservation.reserveOrLoad(key as never, preimage);
      expect(first.ok).toBe(true);
      const retry = await ports.reservation.reserveOrLoad(key as never, {
        ...preimage,
        effective_input: { ...preimage.effective_input, payload: { ...preimage.effective_input.payload, retention: { derivative_rule: 'make-ineligible', expires_at: LATER } } },
      } as never);
      expect(retry.ok).toBe(true);
      if (!first.ok || !retry.ok) throw Error('reservation failed');
      expect((retry.value.preimage.effective_input as { payload: { retention: unknown } }).payload.retention).toEqual(
        (first.value.preimage.effective_input as { payload: { retention: unknown } }).payload.retention,
      );
      expect(computeMemoryMutationOperationDigestV1(preimage).ok).toBe(true);
      expect(projectMemoryMutationPolicyVersionsV1(preimage.effective_input).ok).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('M5 should return POLICY_STALE for an uncommitted reservation after rotation, without a new effect', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-ports-'));
    try {
      const rigged = setup(directory);
      const captured = await rigged.tools.capture(agentCapture('l2-ports-key-0003', '1'), invocation());
      if (!completed(captured)) throw Error('capture failed');
      const admission = { candidate_id: captured.output.value.candidate_id, idempotency_key: 'l2-ports-key-0003-0000' };
      const inner = rigged.ports.reservation.claimFencedExecution.bind(rigged.ports.reservation);
      let claims = 0;
      rigged.ports.reservation.claimFencedExecution = (async (ref: string, gen: string) => {
        claims++;
        if (claims === 1) return { ok: false as const, error_code: 'STORE_UNAVAILABLE' as const, message: 'injected fence fault' };
        return inner(ref, gen);
      }) as never;
      await expect(rigged.tools.requestAdmission(admission, invocation())).resolves.toMatchObject({
        ok: false, error: { code: 'STORE_UNAVAILABLE' },
      });
      await rigged.ports.policy.rotate('engram_memory_request_admission');
      const retry = await rigged.tools.requestAdmission(admission, invocation());
      expect(retry).toMatchObject({ ok: false, error: { code: 'POLICY_STALE' } });
      function completed(out: unknown): out is { output: { value: { candidate_id: string } } } {
        return (out as { ok: boolean }).ok === true;
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('M5 should let a single concurrent claimant win the fence', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-ports-'));
    try {
      const ports = createReferenceWriteHostPortsV1({ directory });
      const key = {
        principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one', store_id: STORE,
        provider_id: 'sentropic.engram.memory', connector_id: 'engram-memory', connector_instance_ref: 'connector:one',
        scope_ref: SCOPE, idempotency_key: 'l2-ports-key-0004-00000000',
      };
      const seed = captureRequest('l2-ports-key-0004-0001', '8', 'ports body');
      const preimage = {
        profile: 'sentropic.engram.memory-mutation/v1', reservation_ref: 'reservation:two',
        provider_id: 'sentropic.engram.memory', provider_contract_version: '1.0.0',
        principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one', store_id: STORE,
        connector_id: 'engram-memory', connector_instance_ref: 'connector:one', scope_ref: SCOPE,
        tool_name: 'engram_memory_capture', idempotency_key: 'l2-ports-key-0004-00000000',
        target: { kind: 'capture_source', source_ref: 'source:host', sequence: '1' },
        effective_input: {
          tool_name: 'engram_memory_capture',
          payload: { ...seed.payload, retention: { derivative_rule: 'make-ineligible', expires_at: '2026-09-15T12:34:56.789Z' } },
          evidence: seed.evidence,
          capture_policy_version: 'capture-policy/v1',
        },
      } as never;
      const reserved = await ports.reservation.reserveOrLoad(key as never, preimage);
      expect(reserved.ok).toBe(true);
      const [winner, loser] = await Promise.all([
        ports.reservation.claimFencedExecution('reservation:two', '1'),
        ports.reservation.claimFencedExecution('reservation:two', '1'),
      ]);
      expect([winner.ok, loser.ok].sort()).toEqual([false, true]);
      const refused = !winner.ok ? winner : loser;
      if (refused.ok) throw Error('expected one refusal');
      expect(refused.error_code).toBe('MUTATION_OUTCOME_UNKNOWN');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('M5 should let one concurrent claimant win and recover the committed replay after restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-ports-'));
    try {
      const first = setup(directory);
      const commit = vi.spyOn(first.store, 'commitPending');
      const input = agentCapture('l2-ports-key-0005', '1');
      const [left, right] = await Promise.all([
        first.tools.capture(input, invocation()),
        first.tools.capture(input, invocation()),
      ]);
      const codes = [left, right].map((out) => (out.ok ? out.output.value.status : out.error.code)).sort();
      expect(commit).toHaveBeenCalledOnce();
      expect(codes).toContain('MUTATION_OUTCOME_UNKNOWN');
      expect(codes.some((code) => code === 'committed_pending' || code === 'duplicate_exact')).toBe(true);
      const second = setup(directory);
      const recovered = await second.tools.capture(input, invocation());
      expect(recovered.ok).toBe(true);
      expect(commit).toHaveBeenCalledOnce();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('M14 should bind test-only confirmation to the operation digest', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-ports-'));
    try {
      const ports = createReferenceWriteHostPortsV1({ directory });
      const binding = { capability: 'engram_memory_forget', target_ref: 'mem_target', operation_digest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', reservation_ref: 'reservation:three' } as never;
      await expect(ports.confirm(binding)).resolves.toBe(false);
      ports.grantConfirmation(binding, '2027-08-16T12:34:56.789Z');
      await expect(ports.confirm(binding)).resolves.toBe(true);
      await expect(ports.confirm({ ...binding, operation_digest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd' } as never)).resolves.toBe(false);
      await expect(ports.confirm({ ...binding, target_ref: 'mem_other' } as never)).resolves.toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
