import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeMemoryMutationOperationDigestV1,
  projectMemoryMutationPolicyVersionsV1,
  type MemoryMutationBindingV1,
  type MemoryMutationLookupKeyV1,
  type MemoryMutationRecoveryPortV1,
} from '../src/mcp/memory/policy.js';
import { createReferenceWriteHostPortsV1 } from '../src/mcp/memory/reference-ports.js';
import { createMemoryWriteToolsV1 } from '../src/memory-tools/writes.js';
import { captureRequest, NOW } from './memory-l3-fixture.js';
import { buildMemory } from './memory-l7-fixture.js';

// Independent oracle: SPEC-memory-mcp-v3.1.md M4/M5/M14 and the tour-1
// relecture (REVIEW-L2-sol.out, 9 MAJEURS). Each test below replays the
// reviewer's exact counterexample and asserts the specified fixed behavior.
const SCOPE = 'scope:l3';
const STORE = 'memory:canonical';
const SHORT_DEADLINE = '2026-08-16T12:35:16.789Z';
const PRINCIPALS = {
  principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one',
  connector_instance_ref: 'connector:one', agent_id: 'agent:one', session_id: 'session:one',
};
const EXPIRES_1 = '2026-08-20T12:34:56.789Z';
const EXPIRES_2 = '2026-08-25T12:34:56.789Z';

function invocation(overrides = {}) {
  return {
    auditId: 'audit:l2-r2', authorization: { credential: 'credential:l7' },
    scope_ref: SCOPE, store_id: STORE, ...PRINCIPALS, generation: '1', deadline_at: SHORT_DEADLINE,
    ...overrides,
  };
}

function captureInput(key: string, sequence: string, text = 'round2 body') {
  const request = captureRequest(key, sequence, text);
  const { scope_ref: _scope, retention: _retention, ...payload } = request.payload;
  return { idempotency_key: request.idempotency_key, payload, evidence: request.evidence };
}

/** Minimal in-memory reservation port; durability is proven by the reference port. */
function fakeReservation() {
  const bindings = new Map<string, MemoryMutationBindingV1<unknown>>();
  const keyOf = (key: MemoryMutationLookupKeyV1) => JSON.stringify(key);
  const port: MemoryMutationRecoveryPortV1<unknown> = {
    async reserveOrLoad(lookupKey, candidatePreimage) {
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
      const next: MemoryMutationBindingV1<unknown> = { ...binding, confirmation_ref: confirmationRef, recovery_state: 'authorized_uncommitted' };
      bindings.set(keyOf(binding.lookup_key), next);
      return { ok: true, value: next };
    },
    async claimFencedExecution(reservationRef, executionGeneration) {
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
  return { port, bindings };
}

function setup(overrides = {}) {
  const fixture = buildMemory({ scope: SCOPE });
  const facets = { scope_ref: SCOPE, store_id: STORE, engine: fixture.memory };
  const { port } = fakeReservation();
  const h = {
    clock: { now: () => NOW },
    authenticate: async () => true,
    authorize: async () => true,
    reservation: port,
    audit: { append: async () => undefined },
    policy: {
      capturePolicyVersion: async () => 'capture-policy/v1',
      admissionPolicyVersion: async () => 'admission-policy/v1',
      retention: { max_retention_days: 30, allow_retain_derivative_rule: false },
      reconciliation: { consented_family_refs: [] },
      anchorKindRef: 'memory:lifecycle',
      provenanceDigest: async () => 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as never,
      nextSourceOrder: async () => ({ source_ref: 'source:host', sequence: '1' }),
    },
    confirm: async () => true,
    keyCustody: { confirmDestroyed: async () => false },
    coverage: { verify: async () => ({ complete: false as boolean, coverage_digest: undefined }) },
    ...overrides,
  };
  return { ...fixture, facets, tools: createMemoryWriteToolsV1({ facets, host: h }), host: h };
}

describe('MCP-L2 round-2 lifecycle findings', () => {
  it('M4 should refuse an admission replay after neutral authority revocation', async () => {
    const { tools, dependencies } = setup();
    const captured = await tools.capture(captureInput('l2-r2-key-000001', '1'), invocation());
    if (!captured.ok || captured.output.value.candidate_id === undefined) throw Error('capture failed');
    const input = { candidate_id: captured.output.value.candidate_id, idempotency_key: 'l2-r2-key-000002-0000' };
    expect((await tools.requestAdmission(input, invocation())).ok).toBe(true);
    vi.spyOn(dependencies.authorization, 'authorize').mockResolvedValue({
      ok: false, error: { code: 'UNAUTHORIZED', operation: 'request_admission', message: 'neutral authority revoked', retryable: false },
    });
    const replay = await tools.requestAdmission(input, invocation());
    expect(replay).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(JSON.stringify(replay)).not.toContain('transaction_receipt_digest');
  });

  it('M4 should require the current confirmation verdict after expiry and a new session', async () => {
    let verdict = true;
    const { port } = fakeReservation();
    const { tools } = setup({ reservation: port, confirm: async () => verdict });
    const captured = await tools.capture(captureInput('l2-r2-key-000011', '1'), invocation());
    if (!captured.ok || captured.output.value.candidate_id === undefined) throw Error('capture failed');
    let claims = 0;
    const innerClaim = port.claimFencedExecution.bind(port);
    port.claimFencedExecution = (async (ref: string, gen: string) => {
      claims++;
      if (claims === 1) return { ok: false as const, error_code: 'STORE_UNAVAILABLE' as const, message: 'injected fence fault' };
      return innerClaim(ref, gen);
    }) as never;
    const input = { candidate_id: captured.output.value.candidate_id, idempotency_key: 'l2-r2-key-000012-0000', reason_ref: 'reason:one' };
    await expect(tools.withdraw(input, invocation())).resolves.toMatchObject({
      ok: false, error: { code: 'STORE_UNAVAILABLE' },
    });
    verdict = false;
    await expect(tools.withdraw(input, invocation({ session_id: 'session:two' }))).resolves.toMatchObject({
      ok: false, error: { code: 'gate_failed' },
    });
  });

  it('M5 should keep the reservation source sequence on retry, not a fresh one', async () => {
    let sequence = 0;
    let claims = 0;
    const { port } = fakeReservation();
    const innerClaim = port.claimFencedExecution.bind(port);
    port.claimFencedExecution = (async (ref: string, gen: string) => {
      claims++;
      if (claims === 1) return { ok: false as const, error_code: 'STORE_UNAVAILABLE' as const, message: 'injected fence fault' };
      return innerClaim(ref, gen);
    }) as never;
    const rig = setup({
      reservation: port,
      policy: {
        capturePolicyVersion: async () => 'capture-policy/v1',
        admissionPolicyVersion: async () => 'admission-policy/v1',
        retention: { max_retention_days: 30, allow_retain_derivative_rule: false },
        reconciliation: { consented_family_refs: [] },
        anchorKindRef: 'memory:lifecycle',
        provenanceDigest: async () => 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as never,
        nextSourceOrder: async () => ({ source_ref: 'source:host', sequence: String(++sequence) }),
      },
    });
    const capture = vi.spyOn(rig.memory, 'capture');
    const input = captureInput('l2-r2-key-000021', '9');
    await expect(rig.tools.capture(input, invocation())).resolves.toMatchObject({
      ok: false, error: { code: 'STORE_UNAVAILABLE' },
    });
    const retry = await rig.tools.capture(input, invocation());
    expect(retry).toMatchObject({ ok: true, output: { value: { status: 'committed_pending' } } });
    expect(capture).toHaveBeenCalledOnce();
    expect((capture.mock.calls[0]![0] as { source_order: { sequence: string } }).source_order.sequence).toBe('1');
  });

  it('M5 should conflict when the same key carries a changed explicit expiry', async () => {
    const { tools, store } = setup();
    const commit = vi.spyOn(store, 'commitPending');
    const first = captureInput('l2-r2-key-000031', '1');
    const seeded = await tools.capture({
      ...first, payload: { ...first.payload, retention: { derivative_rule: 'make-ineligible', expires_at: EXPIRES_1 } },
    }, invocation());
    expect(seeded).toMatchObject({ ok: true, output: { value: { status: 'committed_pending' } } });
    await expect(tools.capture({
      ...first, payload: { ...first.payload, retention: { derivative_rule: 'make-ineligible', expires_at: EXPIRES_2 } },
    }, invocation())).resolves.toMatchObject({ ok: false, error: { code: 'DIGEST_CONFLICT' } });
    expect(commit).toHaveBeenCalledOnce();
  });

  it('M5 should conflict when the same key carries changed reconciliation families', async () => {
    const { tools, store } = setup({ policy: {
      capturePolicyVersion: async () => 'capture-policy/v1',
      admissionPolicyVersion: async () => 'admission-policy/v1',
      retention: { max_retention_days: 30, allow_retain_derivative_rule: false },
      reconciliation: { consented_family_refs: ['family:a'] },
      anchorKindRef: 'memory:lifecycle',
      provenanceDigest: async () => 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as never,
      nextSourceOrder: async () => ({ source_ref: 'source:host', sequence: '1' }),
    } });
    const commit = vi.spyOn(store, 'commitPending');
    const first = captureInput('l2-r2-key-000041', '1');
    const seeded = await tools.capture({
      ...first, payload: { ...first.payload, reconciliation: { family_refs: ['family:a'] } },
    }, invocation());
    expect(seeded).toMatchObject({ ok: true, output: { value: { status: 'committed_pending' } } });
    await expect(tools.capture({
      ...first, payload: { ...first.payload, reconciliation: { family_refs: [] } },
    }, invocation())).resolves.toMatchObject({ ok: false, error: { code: 'DIGEST_CONFLICT' } });
    expect(commit).toHaveBeenCalledOnce();
  });

  it('M5 should hold a recapture pending when its tombstone sits past the first journal page', async () => {
    const { createInMemoryCanonicalMemoryStoreV1, memoryJournalEventHashV1 } = await import('../engram-memory/index.js');
    const seeder = buildMemory({ scope: 'scope:l3' });
    const seeded = await seeder.memory.capture(captureRequest('l2-r2-seed-00000001', '1', 'filler body'));
    if (!seeded.ok) throw Error('seed capture failed');
    const template = (seeder.store.exportStateForPersistence() as { value: { journal: Array<Record<string, unknown>> } }).value.journal[0]!;
    const { event_hash: _dropped, ...templateBody } = template;
    const fillers: Array<Record<string, unknown>> = [];
    let previous = template.previous_event_hash as string;
    for (let i = 0; i < 2001; i++) {
      const body = {
        ...templateBody, event_id: `filler:event:${i}`, candidate_id: `candidate:filler:${i}`,
        cursor: String(i + 1), previous_event_hash: previous,
      };
      const event_hash = memoryJournalEventHashV1(body as never);
      fillers.push({ ...body, event_hash });
      previous = event_hash;
    }
    const store = createInMemoryCanonicalMemoryStoreV1({
      clock: { now: () => NOW },
      persistence: { journal: fillers as never, controls: [], envelopes: [], records: [], lexical: [], outbox: [] },
    });
    const { memory } = buildMemory({ scope: 'scope:l3', store: store as never });
    const first = await memory.capture(captureRequest('l2-r2-key-000051', '3001', 'guard body'));
    if (!first.ok || first.value.candidate_id === undefined) throw Error('capture failed');
    const admitted = await memory.requestAdmission({
      candidate_id: first.value.candidate_id, authorization: { credential: 'credential:l7' }, deadline_at: '2026-08-16T12:40:00.000Z',
    });
    if (!admitted.ok || admitted.value.record_id === undefined) throw Error('admission failed');
    expect(await memory.transition({
      operation: 'tombstone' as const, record_id: admitted.value.record_id, event_id: 'event:l2:r2-forget',
      reason_ref: 'reason:r2',
      event_anchor: { occurred_at: NOW, kind_ref: 'kind:r2', provenance_ref: 'provenance:r2', provenance_digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      authorization: { credential: 'credential:l7' }, deadline_at: '2026-08-16T12:40:00.000Z',
    })).toMatchObject({ ok: true, value: { to_state: 'tombstoned' } });
    const second = await memory.capture(captureRequest('l2-r2-key-000052', '3002', 'guard body'));
    if (!second.ok || second.value.candidate_id === undefined) throw Error('recapture failed');
    await expect(memory.requestAdmission({
      candidate_id: second.value.candidate_id, authorization: { credential: 'credential:l7' }, deadline_at: '2026-08-16T12:40:00.000Z',
    })).resolves.toMatchObject({ ok: true, value: { status: 'pending_adjudication' } });
  }, 120000);

  it('M5 should refuse automatic acceptance when a tombstone lands between the guard snapshot and the commit', async () => {
    const { memory, store } = buildMemory({ scope: 'scope:l3' });
    const deadline = '2026-08-16T12:40:00.000Z';
    const authorization = { credential: 'credential:l7' };
    const anchor = {
      occurred_at: NOW, kind_ref: 'kind:r2', provenance_ref: 'provenance:r2',
      provenance_digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const,
    };
    const first = await memory.capture(captureRequest('l2-r2-key-000061', '1', 'race body'));
    if (!first.ok || first.value.candidate_id === undefined) throw Error('capture failed');
    const admitted = await memory.requestAdmission({ candidate_id: first.value.candidate_id, authorization, deadline_at: deadline });
    if (!admitted.ok || admitted.value.record_id === undefined) throw Error('admission failed');
    const pending = await memory.capture(captureRequest('l2-r2-key-000062', '2', 'race body'));
    if (!pending.ok || pending.value.candidate_id === undefined) throw Error('recapture failed');
    const realReadJournal = store.readJournal.bind(store);
    let resolveTombstone: (() => void) | undefined;
    const tombstoneDone = new Promise<void>((resolve) => { resolveTombstone = resolve; });
    let gateArmed = true;
    vi.spyOn(store, 'readJournal').mockImplementation(async (input: never) => {
      const args = input as unknown as { after: string };
      if (gateArmed && args.after === '0') {
        gateArmed = false;
        const stale = await realReadJournal(input);
        await tombstoneDone;
        return stale;
      }
      return realReadJournal(input);
    });
    const admissionP = memory.requestAdmission({ candidate_id: pending.value.candidate_id, authorization, deadline_at: deadline });
    await new Promise((resolve) => setImmediate(resolve));
    expect(await memory.transition({
      operation: 'tombstone' as const, record_id: admitted.value.record_id, event_id: 'event:l2:r2-race-forget',
      reason_ref: 'reason:r2', event_anchor: anchor, authorization, deadline_at: deadline,
    })).toMatchObject({ ok: true, value: { to_state: 'tombstoned' } });
    resolveTombstone!();
    await expect(admissionP).resolves.toMatchObject({ ok: true, value: { status: 'pending_adjudication' } });
  });

  it('M5 should recover the durable proof on retry after a lost commit acknowledgement', async () => {
    const rig = setup();
    const commit = vi.spyOn(rig.store, 'commitPending');
    const realCapture = rig.memory.capture.bind(rig.memory);
    vi.spyOn(rig.memory, 'capture').mockImplementationOnce(async (input) => {
      const result = await realCapture(input);
      expect(result.ok).toBe(true);
      throw new Error('ack lost after commit');
    });
    const input = captureInput('l2-r2-key-000071', '1');
    await expect(rig.tools.capture(input, invocation())).resolves.toMatchObject({
      ok: false, error: { code: 'MUTATION_OUTCOME_UNKNOWN' },
    });
    const retry = await rig.tools.capture(input, invocation());
    expect(retry).toMatchObject({ ok: true, output: { value: { status: 'duplicate_exact' } } });
    expect(commit).toHaveBeenCalledOnce();
  });

  it('M5 should recover the committed outcome on retry after a lost completion', async () => {
    const { port } = fakeReservation();
    let completions = 0;
    const innerComplete = port.recordCompletion.bind(port);
    port.recordCompletion = (async (ref: string, output: unknown) => {
      completions++;
      if (completions === 1) throw new Error('completion lost after reconcile');
      return innerComplete(ref, output);
    }) as never;
    const rig = setup({ reservation: port });
    const input = captureInput('l2-r2-key-000081', '1');
    const first = await rig.tools.capture(input, invocation());
    expect(first).toMatchObject({ ok: true, output: { value: { status: 'committed_pending' } } });
    const retry = await rig.tools.capture(input, invocation());
    expect(retry).toMatchObject({ ok: true, output: { value: { status: 'duplicate_exact' } } });
  });

  it('M5 should refuse a completion without a reconciled canonical reference', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-r2-'));
    const ports = await createReferenceWriteHostPortsV1({ directory });
    try {
      const seed = captureRequest('l2-r2-key-000091', '7', 'ports body');
      const lookupKey = {
        principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one', store_id: STORE,
        provider_id: 'sentropic.engram.memory', connector_id: 'engram-memory', connector_instance_ref: 'connector:one',
        scope_ref: SCOPE, idempotency_key: 'l2-r2-key-000091-00000000',
      } as never;
      const preimage = {
        profile: 'sentropic.engram.memory-mutation/v1', reservation_ref: 'reservation:eight',
        provider_id: 'sentropic.engram.memory', provider_contract_version: '1.0.0',
        principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one', store_id: STORE,
        connector_id: 'engram-memory', connector_instance_ref: 'connector:one', scope_ref: SCOPE,
        tool_name: 'engram_memory_capture', idempotency_key: 'l2-r2-key-000091-00000000',
        target: { kind: 'capture_source', source_ref: 'source:host', sequence: '1' },
        effective_input: {
          tool_name: 'engram_memory_capture',
          payload: { ...seed.payload, retention: { derivative_rule: 'make-ineligible', expires_at: '2026-09-15T12:34:56.789Z' } },
          evidence: seed.evidence,
          capture_policy_version: 'capture-policy/v1',
        },
      } as never;
      expect((await ports.reservation.reserveOrLoad(lookupKey, preimage)).ok).toBe(true);
      expect((await ports.reservation.claimFencedExecution('reservation:eight', '1')).ok).toBe(true);
      const bare = await ports.reservation.recordCompletion('reservation:eight', { status: 'committed_pending' });
      expect(bare.ok).toBe(false);
      expect((await ports.reservation.reconcileCanonicalOutcome('reservation:eight', 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).ok).toBe(true);
      expect((await ports.reservation.recordCompletion('reservation:eight', { status: 'committed_pending' })).ok).toBe(true);
    } finally {
      ports.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('M14 should persist the reference over SQLite, never JSON files', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-l2-r2-'));
    const ports = await createReferenceWriteHostPortsV1({ directory });
    try {
      const seed = captureRequest('l2-r2-key-000101', '7', 'ports body');
      const lookupKey = {
        principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one', store_id: STORE,
        provider_id: 'sentropic.engram.memory', connector_id: 'engram-memory', connector_instance_ref: 'connector:one',
        scope_ref: SCOPE, idempotency_key: 'l2-r2-key-000101-00000000',
      } as never;
      const preimage = {
        profile: 'sentropic.engram.memory-mutation/v1', reservation_ref: 'reservation:nine',
        provider_id: 'sentropic.engram.memory', provider_contract_version: '1.0.0',
        principal_namespace: 'principal:test', principal_id: 'alice', tenant_id: 'tenant:one', store_id: STORE,
        connector_id: 'engram-memory', connector_instance_ref: 'connector:one', scope_ref: SCOPE,
        tool_name: 'engram_memory_capture', idempotency_key: 'l2-r2-key-000101-00000000',
        target: { kind: 'capture_source', source_ref: 'source:host', sequence: '1' },
        effective_input: {
          tool_name: 'engram_memory_capture',
          payload: { ...seed.payload, retention: { derivative_rule: 'make-ineligible', expires_at: '2026-09-15T12:34:56.789Z' } },
          evidence: seed.evidence,
          capture_policy_version: 'capture-policy/v1',
        },
      } as never;
      expect((await ports.reservation.reserveOrLoad(lookupKey, preimage)).ok).toBe(true);
      await ports.audit.append({ tool: 'engram_memory_capture', decision: 'reserve' });
      expect(existsSync(join(directory, 'reservations.json'))).toBe(false);
      expect(existsSync(join(directory, 'audit.jsonl'))).toBe(false);
      expect(readdirSync(directory).some((file) => file.endsWith('.sqlite'))).toBe(true);
      ports.close();
      const reopened = await createReferenceWriteHostPortsV1({ directory });
      try {
        const reloaded = await reopened.reservation.reserveOrLoad(lookupKey, preimage);
        expect(reloaded.ok).toBe(true);
        if (reloaded.ok) expect(reloaded.value.preimage.reservation_ref).toBe('reservation:nine');
        expect(reopened.auditLog().some((entry) => entry.decision === 'reserve')).toBe(true);
      } finally {
        reopened.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
