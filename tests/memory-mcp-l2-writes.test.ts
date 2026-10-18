import { describe, expect, it, vi } from 'vitest';
import {
  computeMemoryMutationOperationDigestV1,
  projectMemoryMutationPolicyVersionsV1,
  type MemoryMutationBindingV1,
  type MemoryMutationLookupKeyV1,
  type MemoryMutationPreimageV1,
  type MemoryMutationRecoveryPortV1,
} from '../src/mcp/memory/policy.js';
import { createMemoryWriteToolsV1 } from '../src/memory-tools/writes.js';
import { captureRequest, DEADLINE, DIGEST, NOW } from './memory-l3-fixture.js';
import { buildMemory } from './memory-l7-fixture.js';

// Independent oracle: SPEC-memory-mcp-v3.1.md M2 (closed schemas, audit,
// retention/consent bounds), M4 (trusted context, literal true, per-tool
// authority), M5 (durable reservation, cross-tool keys, tombstone guard),
// M6 (total mapping, MUTATION_OUTCOME_UNKNOWN), M13/M14 B (in-process,
// disabled by default).
const SCOPE = 'scope:l3';
const STORE = 'memory:canonical';
const SHORT_DEADLINE = '2026-08-16T12:35:16.789Z';
const PRINCIPALS = {
  principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one',
  connector_instance_ref: 'connector:one', agent_id: 'agent:one', session_id: 'session:one',
};

function invocation(overrides = {}) {
  return {
    auditId: 'audit:l2-writes', authorization: { credential: 'credential:l7' },
    scope_ref: SCOPE, store_id: STORE, ...PRINCIPALS, generation: '1', deadline_at: SHORT_DEADLINE,
    ...overrides,
  };
}

function captureInput(key: string, sequence: string, text = 'write body') {
  const request = captureRequest(key, sequence, text);
  // Agent-level payload: no scope_ref (host-bound) and no retention request
  // (the host default applies); reconciliation defaults to no families.
  const { scope_ref: _scope, retention: _retention, ...payload } = request.payload;
  return { idempotency_key: request.idempotency_key, payload, evidence: request.evidence };
}

/** Minimal in-memory reservation port; durability is proven by the reference file-backed port. */
function fakeReservation() {
  const bindings = new Map<string, MemoryMutationBindingV1<unknown>>();
  const calls = { reserve: 0, claim: 0 };
  const keyOf = (key: MemoryMutationLookupKeyV1) => JSON.stringify(key);
  const port: MemoryMutationRecoveryPortV1<unknown> = {
    async reserveOrLoad(lookupKey, candidatePreimage) {
      calls.reserve++;
      const key = keyOf(lookupKey);
      const existing = bindings.get(key);
      if (existing) return { ok: true, value: existing };
      const digest = computeMemoryMutationOperationDigestV1(candidatePreimage);
      if (!digest.ok) return digest;
      const versions = projectMemoryMutationPolicyVersionsV1(candidatePreimage.effective_input);
      if (!versions.ok) return versions;
      const needsConfirm = candidatePreimage.tool_name === 'engram_memory_withdraw' || candidatePreimage.tool_name === 'engram_memory_forget';
      const binding: MemoryMutationBindingV1<unknown> = {
        lookup_key: lookupKey, preimage: candidatePreimage, operation_digest: digest.value.operation_digest,
        policy_versions: versions.value, recovery_state: needsConfirm ? 'pending_confirmation' : 'authorized_uncommitted',
        audit_id: `reservation-audit:${candidatePreimage.reservation_ref}`, execution_generation: '0',
      };
      bindings.set(key, binding);
      return { ok: true, value: binding };
    },
    async attachConfirmation(reservationRef, confirmationRef, operationDigest) {
      const binding = [...bindings.values()].find((entry) => entry.preimage.reservation_ref === reservationRef);
      if (!binding) return { ok: false, error_code: 'NOT_FOUND', message: 'unknown reservation' };
      if (binding.operation_digest !== operationDigest) return { ok: false, error_code: 'INVALID_SCHEMA', message: 'confirmation digest mismatch' };
      const next: MemoryMutationBindingV1<unknown> = { ...binding, confirmation_ref: confirmationRef, recovery_state: binding.recovery_state === 'pending_confirmation' ? 'authorized_uncommitted' : binding.recovery_state };
      bindings.set(keyOf(binding.lookup_key), next);
      return { ok: true, value: next };
    },
    async claimFencedExecution(reservationRef, executionGeneration) {
      calls.claim++;
      const found = [...bindings.entries()].find(([, entry]) => entry.preimage.reservation_ref === reservationRef);
      if (!found) return { ok: false, error_code: 'NOT_FOUND', message: 'unknown reservation' };
      const [key, binding] = found;
      if (binding.recovery_state !== 'authorized_uncommitted') {
        return { ok: false, error_code: binding.recovery_state === 'executing_unknown_outcome' ? 'MUTATION_OUTCOME_UNKNOWN' : 'INVALID_SCHEMA', message: 'reservation not claimable' };
      }
      const next: MemoryMutationBindingV1<unknown> = { ...binding, recovery_state: 'executing_unknown_outcome', execution_generation: executionGeneration };
      bindings.set(key, next);
      return { ok: true, value: next };
    },
    async reconcileCanonicalOutcome(reservationRef, canonicalReplayRef) {
      const found = [...bindings.entries()].find(([, entry]) => entry.preimage.reservation_ref === reservationRef);
      if (!found) return { ok: false, error_code: 'NOT_FOUND', message: 'unknown reservation' };
      const [key, binding] = found;
      const next: MemoryMutationBindingV1<unknown> = { ...binding, recovery_state: 'canonical_committed_receipt', canonical_replay_ref: canonicalReplayRef };
      bindings.set(key, next);
      return { ok: true, value: next };
    },
    async recordCompletion(reservationRef, output) {
      const found = [...bindings.entries()].find(([, entry]) => entry.preimage.reservation_ref === reservationRef);
      if (!found) return { ok: false, error_code: 'NOT_FOUND', message: 'unknown reservation' };
      const [key, binding] = found;
      const next: MemoryMutationBindingV1<unknown> = { ...binding, recovery_state: 'completed_response', stored_output: output };
      bindings.set(key, next);
      return { ok: true, value: next };
    },
  };
  return { port, bindings, calls };
}

function host(overrides = {}) {
  const audit: unknown[] = [];
  return {
    host: {
      clock: { now: () => NOW },
      authenticate: async () => true,
      authorize: async () => true,
      reservation: fakeReservation().port,
      audit: { append: async (entry: unknown) => { audit.push(entry); } },
      policy: {
        capturePolicyVersion: async () => 'capture-policy/v1',
        admissionPolicyVersion: async () => 'admission-policy/v1',
        retention: { max_retention_days: 30, allow_retain_derivative_rule: false },
        reconciliation: { consented_family_refs: [] },
        anchorKindRef: 'memory:lifecycle',
        provenanceDigest: async () => DIGEST,
        nextSourceOrder: async () => ({ source_ref: 'source:host', sequence: '1' }),
      },
      confirm: async () => true,
      keyCustody: { confirmDestroyed: async () => false },
      coverage: { verify: async () => ({ complete: false as boolean, coverage_digest: undefined }) },
      ...overrides,
    },
    audit,
  };
}

function setup(overrides = {}) {
  const fixture = buildMemory({ scope: SCOPE });
  const facets = { scope_ref: SCOPE, store_id: STORE, engine: fixture.memory };
  const { host: h, audit } = host(overrides);
  return { ...fixture, facets, tools: createMemoryWriteToolsV1({ facets, host: h }), host: h, audit };
}

describe('MCP-L2 in-process write tools', () => {
  it('M13 should refuse every write with a typed error when no host ports are injected', async () => {
    const fixture = buildMemory({ scope: SCOPE });
    const facets = { scope_ref: SCOPE, store_id: STORE, engine: fixture.memory };
    const commit = vi.spyOn(fixture.store, 'commitPending');
    // @ts-expect-error host ports are mandatory
    const tools = createMemoryWriteToolsV1({ facets });
    for (const [name, input] of [
      ['capture', captureInput('l2-writes-key-0001', '1')],
      ['requestAdmission', { candidate_id: 'candidate:none', idempotency_key: 'l2-writes-key-0002-0000' }],
      ['withdraw', { candidate_id: 'candidate:none', idempotency_key: 'l2-writes-key-0003-0000', reason_ref: 'reason:one' }],
      ['forget', { record_id: 'mem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', idempotency_key: 'l2-writes-key-0004-0000', reason_ref: 'reason:one' }],
    ] as const) {
      await expect(tools[name](input, invocation())).resolves.toMatchObject({ ok: false, error: { code: 'CAPABILITY_UNAVAILABLE' } });
    }
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { auditId: undefined }, { auditId: 'audit_mcp_l0_default' }, { auditId: '' }])('M2 should refuse without audit (%s) before any effect', async (ctx) => {
    const { tools, memory } = setup();
    const capture = vi.spyOn(memory, 'capture');
    await expect(tools.capture(captureInput('l2-writes-key-0011', '1'), ctx as never)).rejects.toMatchObject({ code: -32603 });
    expect(capture).not.toHaveBeenCalled();
  });

  it.each([undefined, false, null, 'true', 1])('M4 should refuse capture with nonliteral authorization %s', async (verdict) => {
    const { tools, memory } = setup({ authorize: async () => verdict });
    const capture = vi.spyOn(memory, 'capture');
    await expect(tools.capture(captureInput('l2-writes-key-0021', '1'), invocation())).resolves.toMatchObject({
      ok: false, error: { code: 'UNAUTHORIZED' },
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it('M2 should refuse a forged payload key and an over-budget key without effect', async () => {
    const { tools, memory } = setup();
    const commit = vi.spyOn(memory, 'capture');
    const forged = captureInput('l2-writes-key-0031', '1');
    await expect(tools.capture({ ...forged, payload: { ...forged.payload, scope_ref: 'scope:forged' } }, invocation())).resolves.toMatchObject({
      ok: false, error: { code: 'INVALID_SCHEMA' },
    });
    await expect(tools.capture({ ...forged, idempotency_key: 'abcd' }, invocation())).resolves.toMatchObject({
      ok: false, error: { code: 'INVALID_SCHEMA' },
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it('M4 should isolate per-tool authority: capture allowed, admission denied', async () => {
    const seen: string[] = [];
    const { tools } = setup({ authorize: async (_ctx: unknown, tool: string) => { seen.push(tool); return tool === 'engram_memory_capture'; } });
    const captured = await tools.capture(captureInput('l2-writes-key-0041', '1'), invocation());
    expect(captured.ok).toBe(true);
    if (!captured.ok || captured.output.value.candidate_id === undefined) throw Error('capture failed');
    await expect(tools.requestAdmission({ candidate_id: captured.output.value.candidate_id, idempotency_key: 'l2-writes-key-0042-0000' }, invocation())).resolves.toMatchObject({
      ok: false, error: { code: 'UNAUTHORIZED' },
    });
    expect(seen).toContain('engram_memory_capture');
    expect(seen).toContain('engram_memory_request_admission');
  });

  it('M5 should commit capture once and replay it identically under the same key', async () => {
    const { tools, store } = setup();
    const commit = vi.spyOn(store, 'commitPending');
    const input = captureInput('l2-writes-key-0051', '1');
    const first = await tools.capture(input, invocation());
    expect(first).toMatchObject({ ok: true, output: { value: { status: 'committed_pending' } } });
    const second = await tools.capture(input, invocation());
    expect(second).toMatchObject({ ok: true, output: { value: { status: 'duplicate_exact' } } });
    expect(second).toEqual(first.ok ? { ...first, output: { ...first.output, value: { ...first.output.value, status: 'duplicate_exact' } } } : second);
    expect(commit).toHaveBeenCalledOnce();
  });

  it('M5 should admit once and replay without a second canonical effect', async () => {
    const { tools, store } = setup();
    const apply = vi.spyOn(store, 'applyAdmission');
    const captured = await tools.capture(captureInput('l2-writes-key-0061', '1'), invocation());
    if (!captured.ok || captured.output.value.candidate_id === undefined) throw Error('capture failed');
    const input = { candidate_id: captured.output.value.candidate_id, idempotency_key: 'l2-writes-key-0062-0000' };
    const first = await tools.requestAdmission(input, invocation());
    expect(first).toMatchObject({ ok: true, output: { value: { outcome: { status: 'accepted' }, replayed: false } } });
    const second = await tools.requestAdmission(input, invocation());
    expect(second).toMatchObject({ ok: true, output: { value: { outcome: { status: 'accepted' }, replayed: true } } });
    expect(second).toEqual(first.ok && second.ok ? { ...first, output: { ...first.output, value: { ...first.output.value, replayed: true } } } : second);
    expect(apply).toHaveBeenCalledOnce();
  });

  it('M4 should never disclose a cached admission after revocation', async () => {
    let allowed = true;
    const { tools } = setup({ authorize: async () => allowed });
    const captured = await tools.capture(captureInput('l2-writes-key-0071', '1'), invocation());
    if (!captured.ok || captured.output.value.candidate_id === undefined) throw Error('capture failed');
    const input = { candidate_id: captured.output.value.candidate_id, idempotency_key: 'l2-writes-key-0072-0000' };
    expect((await tools.requestAdmission(input, invocation())).ok).toBe(true);
    allowed = false;
    const retry = await tools.requestAdmission(input, invocation());
    expect(retry).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(JSON.stringify(retry)).not.toContain('transaction_receipt_digest');
  });

  it('A06 should refuse withdraw without operation-bound confirmation and bind approval to the digest', async () => {
    const { tools, store } = setup({ confirm: async () => false });
    const apply = vi.spyOn(store, 'applyLifecycle');
    const captured = await tools.capture(captureInput('l2-writes-key-0081', '1'), invocation());
    if (!captured.ok || captured.output.value.candidate_id === undefined) throw Error('capture failed');
    const input = { candidate_id: captured.output.value.candidate_id, idempotency_key: 'l2-writes-key-0082-0000', reason_ref: 'reason:one' };
    await expect(tools.withdraw(input, invocation())).resolves.toMatchObject({ ok: false, error: { code: 'gate_failed' } });
    expect(apply).not.toHaveBeenCalled();
  });

  it('A06 should complete withdraw only for the approved digest and report custody honestly', async () => {
    const approvals = new Map<string, boolean>();
    const destroyed = new Set<string>();
    const seen: Array<{ capability: string; target_ref: string; operation_digest: string }> = [];
    const { tools, store } = setup({
      confirm: async (binding: { capability: string; target_ref: string; operation_digest: string }) => {
        seen.push(binding);
        return approvals.get(binding.operation_digest) === true;
      },
      keyCustody: { confirmDestroyed: async (candidate_id: string) => destroyed.has(candidate_id) },
    });
    const apply = vi.spyOn(store, 'applyLifecycle');
    const captured = await tools.capture(captureInput('l2-writes-key-0091', '1'), invocation());
    if (!captured.ok || captured.output.value.candidate_id === undefined) throw Error('capture failed');
    const input = { candidate_id: captured.output.value.candidate_id, idempotency_key: 'l2-writes-key-0092-0000', reason_ref: 'reason:one' };
    await expect(tools.withdraw(input, invocation())).resolves.toMatchObject({ ok: false, error: { code: 'gate_failed' } });
    expect(apply).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ capability: 'engram_memory_withdraw', target_ref: captured.output.value.candidate_id });
    approvals.set(seen[0]!.operation_digest, true);
    const pending = await tools.withdraw(input, invocation());
    expect(pending).toMatchObject({ ok: true, output: { value: { replayed: false, key_destruction: 'pending' } } });
    expect(apply).toHaveBeenCalledOnce();
    destroyed.add(captured.output.value.candidate_id);
    const complete = await tools.withdraw(input, invocation());
    expect(complete).toMatchObject({ ok: true, output: { value: { replayed: true, key_destruction: 'complete' } } });
    expect(apply).toHaveBeenCalledOnce();
  });

  it('M5 should report forget coverage only after verification', async () => {
    let covered = false;
    const digests: Array<string | undefined> = [];
    const { tools } = setup({ coverage: { verify: async () => ({ complete: covered, coverage_digest: covered ? DIGEST : undefined }) } });
    const captured = await tools.capture(captureInput('l2-writes-key-0101', '1'), invocation());
    if (!captured.ok || captured.output.value.candidate_id === undefined) throw Error('capture failed');
    const admitted = await tools.requestAdmission({ candidate_id: captured.output.value.candidate_id, idempotency_key: 'l2-writes-key-0102-0000' }, invocation());
    if (!admitted.ok || admitted.output.value.outcome.record_id === undefined) throw Error('admission failed');
    const input = { record_id: admitted.output.value.outcome.record_id, idempotency_key: 'l2-writes-key-0103-0000', reason_ref: 'reason:one' };
    const pending = await tools.forget(input, invocation());
    expect(pending).toMatchObject({ ok: true, output: { value: { projection_invalidation: 'pending' } } });
    expect(JSON.stringify(pending)).not.toContain('coverage_receipt_digest');
    covered = true;
    const complete = await tools.forget(input, invocation());
    expect(complete).toMatchObject({ ok: true, output: { value: { projection_invalidation: 'complete', coverage_receipt_digest: DIGEST, replayed: true } } });
    digests.push(complete.ok ? complete.output.value.coverage_receipt_digest : undefined);
    expect(digests).toEqual([DIGEST]);
  });

  it('M5 should conflict a cross-tool key reuse with zero second effect', async () => {
    const { tools, store } = setup();
    const commit = vi.spyOn(store, 'commitPending');
    const apply = vi.spyOn(store, 'applyLifecycle');
    const key = 'l2-writes-key-0111-0000';
    const captured = await tools.capture({ ...captureInput(key, '1'), idempotency_key: key }, invocation());
    expect(captured.ok).toBe(true);
    if (!captured.ok || captured.output.value.candidate_id === undefined) throw Error('capture failed');
    await expect(tools.withdraw({ candidate_id: captured.output.value.candidate_id, idempotency_key: key, reason_ref: 'reason:one' }, invocation())).resolves.toMatchObject({
      ok: false, error: { code: 'DIGEST_CONFLICT' },
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });

  it('M2 should bound retention and consent by host policy and record the versions', async () => {
    const { tools } = setup();
    const over = captureInput('l2-writes-key-0121', '1');
    await expect(tools.capture({ ...over, payload: { ...over.payload, retention: { derivative_rule: 'retain' } } }, invocation())).resolves.toMatchObject({
      ok: false, error: { code: 'UNAUTHORIZED' },
    });
    const far = captureInput('l2-writes-key-0122', '2');
    await expect(tools.capture({ ...far, payload: { ...far.payload, retention: { derivative_rule: 'make-ineligible', expires_at: '2026-09-25T12:34:56.789Z' } } }, invocation())).resolves.toMatchObject({
      ok: false, error: { code: 'UNAUTHORIZED' },
    });
    const kin = captureInput('l2-writes-key-0123', '3');
    await expect(tools.capture({ ...kin, payload: { ...kin.payload, reconciliation: { family_refs: ['family:unknown'] } } }, invocation())).resolves.toMatchObject({
      ok: false, error: { code: 'UNAUTHORIZED' },
    });
  });

  it('M5 should route a tombstoned recapture to pending_adjudication through the facade', async () => {
    const { tools } = setup();
    const first = await tools.capture(captureInput('l2-writes-key-0131', '1', 'facade body'), invocation());
    if (!first.ok || first.output.value.candidate_id === undefined) throw Error('capture failed');
    const admitted = await tools.requestAdmission({ candidate_id: first.output.value.candidate_id, idempotency_key: 'l2-writes-key-0132-0000' }, invocation());
    if (!admitted.ok || admitted.output.value.outcome.record_id === undefined) throw Error('admission failed');
    const forgotten = await tools.forget({ record_id: admitted.output.value.outcome.record_id, idempotency_key: 'l2-writes-key-0133-0000', reason_ref: 'reason:one' }, invocation());
    expect(forgotten.ok).toBe(true);
    const second = await tools.capture(captureInput('l2-writes-key-0134', '2', 'facade body'), invocation());
    if (!second.ok || second.output.value.candidate_id === undefined) throw Error('recapture failed');
    await expect(tools.requestAdmission({ candidate_id: second.output.value.candidate_id, idempotency_key: 'l2-writes-key-0135-0000' }, invocation())).resolves.toMatchObject({
      ok: true, output: { value: { outcome: { status: 'pending_adjudication' } } },
    });
  });

  it('M4/M6 should map an indeterminate engine failure to MUTATION_OUTCOME_UNKNOWN without a second effect', async () => {
    const { tools, store } = setup();
    const captured = await tools.capture(captureInput('l2-writes-key-0141', '1'), invocation());
    if (!captured.ok || captured.output.value.candidate_id === undefined) throw Error('capture failed');
    const admitted = await tools.requestAdmission({ candidate_id: captured.output.value.candidate_id, idempotency_key: 'l2-writes-key-0142-0000' }, invocation());
    if (!admitted.ok || admitted.output.value.outcome.record_id === undefined) throw Error('admission failed');
    const apply = vi.spyOn(store, 'applyLifecycle');
    apply.mockRejectedValueOnce(new Error('backend exploded'));
    const input = { record_id: admitted.output.value.outcome.record_id, idempotency_key: 'l2-writes-key-0143-0000', reason_ref: 'reason:one' };
    await expect(tools.forget(input, invocation())).resolves.toMatchObject({
      ok: false, error: { code: 'MUTATION_OUTCOME_UNKNOWN', retriable: true },
    });
    expect(apply).toHaveBeenCalledOnce();
    // M5 l.710: the retry consults the canonical proof instead of stalling on
    // UNKNOWN. Nothing committed (the mock threw first), so the retry commits
    // the single effect; a further retry replays it without another commit.
    const retry = await tools.forget(input, invocation());
    expect(retry).toMatchObject({ ok: true, output: { value: { replayed: false } } });
    expect(apply).toHaveBeenCalledTimes(2);
    await expect(tools.forget(input, invocation())).resolves.toMatchObject({
      ok: true, output: { value: { replayed: true } },
    });
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('M2 should bound the synchronous execution deadline', async () => {
    const { tools, memory } = setup();
    const commit = vi.spyOn(memory, 'capture');
    await expect(tools.capture(captureInput('l2-writes-key-0151', '1'), invocation({ deadline_at: DEADLINE }))).resolves.toMatchObject({
      ok: false, error: { code: 'INVALID_SCHEMA' },
    });
    expect(commit).not.toHaveBeenCalled();
  });
});
