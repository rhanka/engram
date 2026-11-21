import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import {
  computeMemoryMutationOperationDigestV1,
  createEngramMemoryProviderV1,
  createInMemoryCanonicalMemoryStoreV1,
  createManifestMemoryDispatchPlanV1,
  createMemoryPortV2,
  createMemoryReadFacetsV1,
  MEMORY_FROZEN_PROFILE_BINDINGS_V1,
  MEMORY_PROVIDER_MANIFEST,
  projectMemoryMutationPolicyVersionsV1,
  receiptDigest,
  type McpMemoryInvokeRequest,
  type McpMemoryProviderOptions,
  type McpMemoryStandardInvocation,
} from '../../src/mcp-memory/index.js';
import type { MemoryMutationBindingV1 } from '../../src/mcp/memory/policy.js';
import { createMemoryReadPageStoreV1 } from '../../src/memory-tools/reads.js';
import { validBinding, validBindings } from '../fixtures/memory-mcp-sol-rules.js';

type AccessBoundary = NonNullable<McpMemoryProviderOptions['accessBoundary']>;
type Tool = Parameters<AccessBoundary['authenticate']>[1];
type InvocationBinding = NonNullable<McpMemoryStandardInvocation['ctx']['memory']>['binding'];
type GrantedAccess = Extract<Awaited<ReturnType<AccessBoundary['authenticate']>>, { hasMemoryIdentity: true }>;
const NOW = '2026-08-16T12:34:56.789Z';
const DEADLINE = '2026-08-16T12:35:16.789Z';
const SCOPE = 'scope:workspace';
const PURPOSE = 'purpose:l7';
const STORE = validBinding.store_id;
const AUDIT = validBinding.audit_id;
const TEXT = 'Confidential heliotrope decision';
const KEY = 'idempotency-track-conflict-01';
const ELICITATION = validBinding.elicitation_ref;
const DIGEST = `sha256:${'a'.repeat(64)}` as const;
const MANDATE = {
  mandateId: 'mandate:one', instance: validBinding.agent_id, role: 'AGENTS' as const,
  scope: SCOPE, rights: ['memory:lifecycle'], envelopeDigest: DIGEST,
  signatures: [{ by: 'issuer:one', alg: 'ed25519', value: 'verified-by-host-fixture' }],
};
const DENIED = {
  ok: false,
  auditId: AUDIT,
  redactionClass: 'high',
  error: {
    code: 'UNAUTHORIZED',
    message: 'Caller is not authorized to perform this memory operation in the resolved scope.',
    retriable: false,
  },
};

function requestContext(scope: string, mutating: boolean, overrides: Partial<InvocationBinding>): McpMemoryStandardInvocation['ctx'] {
  const { idempotency_key: _key, elicitation_ref: _ref, ...base } = validBinding;
  const binding = {
    ...base, scope_ref: scope, purpose_ref: PURPOSE, issued_at: NOW,
    claims_provenance_receipt: DIGEST, tenant_membership_receipt: DIGEST, connection_proof_digest: DIGEST,
    deadline_at: DEADLINE,
    ...(mutating ? { idempotency_key: KEY, elicitation_ref: ELICITATION } : {}),
    ...overrides,
  };
  return {
    requestId: 'request:session', correlationId: binding.correlation_ref, auditId: AUDIT,
    principal: {
      sub: binding.sub, tenantRef: binding.tid, authTime: NOW,
      claims: { sub: binding.sub, tid: binding.tid }, scopes: [...binding.transport_scopes],
    },
    surface: 'backend', mcpClient: { clientId: binding.mcp_client_id, client: 'test' },
    session: { mcpSessionId: binding.logical_session_ref }, tenantRef: binding.tid,
    connectorInstanceId: binding.connector_instance_ref, workspaceRef: binding.workspace_id, consentRefs: [], grantRefs: [],
    connectorConfig: {}, getSecret: async () => { throw Error('No test secret'); }, audit: { emit: async () => {} },
    logger: {},
    memory: { binding, expectedActiveGeneration: '1', expectedPolicyEpoch: '4', now: NOW },
  };
}

async function fixture({ scope = SCOPE, accessBoundary, binding, hostNow = NOW, recordText = TEXT }: {
  scope?: string;
  accessBoundary?: AccessBoundary;
  binding?: Partial<InvocationBinding>;
  hostNow?: string;
  recordText?: string;
} = {}) {
  const clock = { now: () => NOW };
  const store = createInMemoryCanonicalMemoryStoreV1({ clock, store_id: STORE });
  const dependencies = memoryDependencies(store, clock, scope);
  const engine = createMemoryPortV2(dependencies);
  const seeded = await engine.requestAdmission({
    candidate_id: await seedCandidate(engine, scope, 'incumbent', recordText),
    authorization: { credential: 'credential:test' }, deadline_at: DEADLINE,
  });
  if (!seeded.ok || seeded.value.record_id === undefined) throw Error('Could not admit test record');
  const recordId = seeded.value.record_id;
  const candidateId = await seedCandidate(engine, scope, 'candidate', 'Pending test decision');
  const readFacets = createMemoryReadFacetsV1(dependencies, { scope_ref: scope, store_id: STORE });
  const readCurrent = vi.spyOn(readFacets.readPort, 'readCurrent');
  const recall = vi.spyOn(readFacets.recallPort, 'recall');
  const capture = vi.spyOn(engine, 'capture');
  const admission = vi.spyOn(engine, 'requestAdmission');
  const transition = vi.spyOn(engine, 'transition');
  const authenticate = vi.fn(async () => true);
  const authorize = vi.fn(async () => true);
  const host = { clock: { now: () => hostNow }, authenticate, authorize };
  let reserved: MemoryMutationBindingV1<unknown> | undefined;
  const reserveOrLoad = vi.fn(async (
    lookup_key: MemoryMutationBindingV1<unknown>['lookup_key'],
    preimage: MemoryMutationBindingV1<unknown>['preimage'],
  ) => {
    if (reserved === undefined) {
      const digest = computeMemoryMutationOperationDigestV1(preimage);
      if (!digest.ok) throw Error('Invalid test reservation digest');
      const versions = projectMemoryMutationPolicyVersionsV1(preimage.effective_input);
      if (!versions.ok) throw Error('Invalid test policy versions');
      reserved = {
        lookup_key, preimage, operation_digest: digest.value.operation_digest,
        policy_versions: versions.value, recovery_state: 'pending_confirmation',
        audit_id: AUDIT, execution_generation: '0',
      };
    }
    return { ok: true as const, value: reserved };
  });
  const confirm = vi.fn(async () => true);
  const claimFencedExecution = vi.fn<McpMemoryProviderOptions['writeHost']['reservation']['claimFencedExecution']>(
    async (_ref, execution_generation) => {
      reserved = { ...reserved!, recovery_state: 'executing_unknown_outcome', execution_generation };
      return { ok: true, value: reserved };
    },
  );
  const adapter = createEngramMemoryProviderV1({
    readFacets,
    writeFacets: { engine, scope_ref: scope, store_id: STORE },
    readHost: {
      ...host, authorizeContinuation: async () => true,
      pages: createMemoryReadPageStoreV1({ clock, ttl_ms: 60000, max_entries: 10 }),
    },
    writeHost: {
      ...host, confirm, audit: { append: async () => {} },
      reservation: {
        reserveOrLoad,
        attachConfirmation: async (_ref, confirmation_ref) => {
          reserved = { ...reserved!, recovery_state: 'authorized_uncommitted', confirmation_ref };
          return { ok: true, value: reserved };
        },
        claimFencedExecution,
        reconcileCanonicalOutcome: async (_ref, canonical_replay_ref) => {
          reserved = { ...reserved!, recovery_state: 'canonical_committed_receipt', canonical_replay_ref };
          return { ok: true, value: reserved };
        },
        recordCompletion: async (_ref, stored_output) => {
          reserved = { ...reserved!, recovery_state: 'completed_response', stored_output };
          return { ok: true, value: reserved };
        },
      },
      policy: {
        capturePolicyVersion: async () => 'capture/v1', admissionPolicyVersion: async () => 'admit/v1',
        retention: { max_retention_days: 30, allow_retain_derivative_rule: false },
        reconciliation: { consented_family_refs: [] }, anchorKindRef: 'memory:lifecycle',
        nextSourceOrder: async () => ({ source_ref: 'source:host', sequence: '1' }),
        provenanceDigest: async () => DIGEST,
      },
      keyCustody: { confirmDestroyed: async () => true }, coverage: { verify: async () => ({ complete: false }) },
    },
    policyId: 'policy:memory', sourceId: 'mcp:engram-memory', generation: '1',
    hostBindings: {
      ...validBindings, profileBindings: MEMORY_FROZEN_PROFILE_BINDINGS_V1,
      engine: { ...validBindings.engine, canonicalStoreId: STORE },
    },
    plan: createManifestMemoryDispatchPlanV1(),
    ...(accessBoundary === undefined ? {} : { accessBoundary }),
  });
  return {
    recordId, candidateId, recordState: () => store.exportStateForPersistence(),
    authenticate, authorize, readCurrent, recall, capture, admission, transition, reserveOrLoad, confirm,
    claimFencedExecution, reservationState: () => reserved?.recovery_state,
    simulateInterruptedExecution() {
      reserved = { ...reserved!, recovery_state: 'executing_unknown_outcome', execution_generation: '1' };
    },
    invoke(tool: Tool, input: Record<string, unknown>, signal?: AbortSignal) {
      const mutating = 'idempotency_key' in input;
      const request: McpMemoryInvokeRequest = {
        capabilityRef: tool, input, ctx: requestContext(scope, mutating, binding ?? {}), signal,
        ...(mutating ? { idempotencyKey: KEY, elicitationRef: ELICITATION } : {}),
      };
      return adapter.invokeTool(request);
    },
  };
}

it('a mutating tool call without a verified mandate fails at authentication with the sanitized unauthorized error and writes nothing', async () => {
  const authenticate = vi.fn<AccessBoundary['authenticate']>(async () => ({
    hasMemoryIdentity: true, workspaceScopeRef: SCOPE,
  }));
  const checkTrackWrite = vi.fn<AccessBoundary['checkTrackWrite']>();
  for (const accessBoundary of [undefined, { authenticate, checkTrackWrite }]) {
    const h = await fixture({ accessBoundary });
    const before = h.recordState();
    const mutations = [
      ['engram_memory_capture', { payload: capturePayload(), evidence: { evidence_ref: 'evidence:one', evidence_digest: DIGEST, citation_ids: ['citation:one'] } }],
      ['engram_memory_request_admission', { candidate_id: 'candidate:one' }],
      ['engram_memory_withdraw', { candidate_id: 'candidate:one', reason_ref: 'reason:private' }],
      ['engram_memory_forget', { record_id: h.recordId, reason_ref: 'reason:private' }],
    ] as const;
    const results = await Promise.all(mutations.map(([tool, input]) => h.invoke(tool, { ...input, idempotency_key: KEY })));
    expect(results).toEqual(mutations.map(() => DENIED));
    expect(h.recordState()).toEqual(before);
    for (const effect of [h.authorize, h.reserveOrLoad, h.capture, h.admission, h.transition]) {
      expect(effect).not.toHaveBeenCalled();
    }
  }
  expect(authenticate.mock.calls.map(([, tool]) => tool)).toEqual([
    'engram_memory_capture', 'engram_memory_request_admission', 'engram_memory_withdraw', 'engram_memory_forget',
  ]);
  const h = await fixture({ accessBoundary: { authenticate, checkTrackWrite } });
  authenticate.mockResolvedValue({ hasMemoryIdentity: true, workspaceScopeRef: SCOPE, verifiedMandate: MANDATE });
  expect(await h.invoke('engram_memory_request_admission', { candidate_id: 'candidate:one', idempotency_key: KEY })).toEqual(DENIED);
  authenticate.mockResolvedValue({
    hasMemoryIdentity: true, workspaceScopeRef: SCOPE,
    verifiedMandate: { ...MANDATE, instance: 'agent:other' },
  });
  expect(await h.invoke('engram_memory_forget', { record_id: h.recordId, reason_ref: 'reason:private', idempotency_key: KEY })).toEqual(DENIED);
  authenticate.mockRejectedValue(new Error('private verifier failure'));
  expect(await h.invoke('engram_memory_forget', { record_id: h.recordId, reason_ref: 'reason:private', idempotency_key: KEY })).toEqual(DENIED);
  expect(h.reserveOrLoad).not.toHaveBeenCalled();
  expect(checkTrackWrite).not.toHaveBeenCalled();
});

it('a session without a memory identity receives no memory content on search and get, and a same-role workspace caller reads locally and is refused across scopes', async () => {
  const authenticate = vi.fn<AccessBoundary['authenticate']>(async () => ({
    hasMemoryIdentity: false,
  }));
  const accessBoundary = { authenticate, checkTrackWrite: vi.fn<AccessBoundary['checkTrackWrite']>() };
  const h = await fixture({ accessBoundary });
  const read = (f: typeof h) => Promise.all([
    f.invoke('engram_memory_search', { query: 'heliotrope', purpose_ref: PURPOSE }),
    f.invoke('engram_memory_get', { record_id: f.recordId, purpose_ref: PURPOSE }),
  ]);

  const unconfigured = await fixture();
  expect(await read(unconfigured)).toEqual([DENIED, DENIED]);
  const noWorkspace = await fixture({ binding: { workspace_id: undefined } });
  expect(await read(noWorkspace)).toEqual([DENIED, DENIED]);
  expect(noWorkspace.recall).not.toHaveBeenCalled();
  expect(noWorkspace.readCurrent).not.toHaveBeenCalled();
  expect(await read(h)).toEqual([DENIED, DENIED]);
  expect(h.recall).not.toHaveBeenCalled();
  expect(h.readCurrent).not.toHaveBeenCalled();

  authenticate.mockResolvedValue({ hasMemoryIdentity: true, workspaceScopeRef: SCOPE });
  const local = await read(h);
  expect(local[0]).toMatchObject({ ok: true, output: { value: { records: [expect.objectContaining({
    record: expect.objectContaining({ record_id: h.recordId }),
  })] } } });
  expect(local[1]).toMatchObject({ ok: true, output: { value: { record: { record_id: h.recordId } } } });
  expect(JSON.stringify(local[1])).toContain(TEXT);

  // The cross-scope adapter serves the requested scope. Its ordinary host and
  // facets would allow the read, so only the session access check can refuse.
  const remote = await fixture({ scope: 'scope:other', accessBoundary });
  expect(await read(remote)).toEqual([DENIED, DENIED]);
  expect(remote.recall).not.toHaveBeenCalled();
  expect(remote.readCurrent).not.toHaveBeenCalled();
});

it('a write that collides with a Track-controlled record keeps the incumbent bytes and stages a proposed conflict candidate', async () => {
  const authenticate = vi.fn<AccessBoundary['authenticate']>(async () => ({
    hasMemoryIdentity: true, workspaceScopeRef: SCOPE, verifiedMandate: MANDATE,
  }));
  const checkTrackWrite = vi.fn<AccessBoundary['checkTrackWrite']>();
  const h = await fixture({ accessBoundary: { authenticate, checkTrackWrite } });
  const incumbent = {
    recordId: h.recordId, scopeRef: SCOPE, trackControlled: true,
    payloadBytesUtf8Jcs: '{"decision":"keep the incumbent"}',
  };
  const before = JSON.stringify(incumbent);
  const storeBefore = h.recordState();
  const proposals = new Map();
  checkTrackWrite.mockImplementation(async (write) => {
    const { mutation } = write;
    if (mutation.operation !== 'lifecycle' || mutation.request.operation !== 'tombstone' ||
        write.scopeRef !== incumbent.scopeRef || mutation.request.record_id !== incumbent.recordId ||
        !incumbent.trackControlled) return 'clear';
    proposals.set(write.idempotencyKey, {
      recordId: incumbent.recordId, reasonRef: mutation.request.reason_ref, state: 'proposed',
      status: 'conflict_pending_track_control', trackControlled: false,
    });
    return 'conflict_staged';
  });
  const input = { record_id: h.recordId, idempotency_key: KEY, reason_ref: 'reason:new-proposal' };
  h.confirm.mockResolvedValueOnce(false);
  expect(await h.invoke('engram_memory_forget', input)).toMatchObject({ ok: false, error: { code: 'gate_failed' } });
  expect(checkTrackWrite).not.toHaveBeenCalled();
  const result = await h.invoke('engram_memory_forget', input);
  expect(result).toMatchObject({ ok: false, error: { code: 'DIGEST_CONFLICT', retriable: false } });
  expect(checkTrackWrite).toHaveBeenCalledTimes(1);
  expect(h.claimFencedExecution).not.toHaveBeenCalled();
  expect(h.reservationState()).toBe('authorized_uncommitted');
  expect(JSON.stringify(result)).not.toContain(h.recordId);
  expect(JSON.stringify(incumbent)).toBe(before);
  expect(h.recordState()).toEqual(storeBefore);
  expect(proposals.get(KEY)).toEqual({
    recordId: incumbent.recordId, reasonRef: input.reason_ref, state: 'proposed',
    status: 'conflict_pending_track_control', trackControlled: false,
  });
  expect(await h.invoke('engram_memory_forget', input)).toEqual(result);
  expect(checkTrackWrite).toHaveBeenCalledTimes(2);
  expect(h.claimFencedExecution).not.toHaveBeenCalled();
  expect(proposals.size).toBe(1);
  expect(h.recordState()).toEqual(storeBefore);

  const ordinary = await fixture({ accessBoundary: { authenticate, checkTrackWrite }, recordText: 'Ordinary decision' });
  expect(await ordinary.invoke('engram_memory_forget', { ...input, record_id: ordinary.recordId })).toMatchObject({
    ok: true, output: { value: { receipt: { to_state: 'tombstoned' } } },
  });
  expect(proposals.size).toBe(1);
});

const writeCases = [
  { tool: 'engram_memory_capture', right: 'memory:capture', operation: 'capture',
    input: () => ({ payload: capturePayload(), evidence: evidenceFor('one') }),
    expected: { status: 'committed_pending' } },
  { tool: 'engram_memory_request_admission', right: 'memory:admit', operation: 'request_admission',
    input: (h: Awaited<ReturnType<typeof fixture>>) => ({ candidate_id: h.candidateId }),
    expected: { outcome: { status: 'accepted' } } },
  { tool: 'engram_memory_withdraw', right: 'memory:lifecycle', operation: 'lifecycle',
    input: (h: Awaited<ReturnType<typeof fixture>>) => ({ candidate_id: h.candidateId, reason_ref: 'reason:withdraw' }),
    expected: { receipt: { operation: 'withdraw', to_state: 'withdrawn' } } },
  { tool: 'engram_memory_forget', right: 'memory:lifecycle', operation: 'lifecycle',
    input: (h: Awaited<ReturnType<typeof fixture>>) => ({ record_id: h.recordId, reason_ref: 'reason:forget' }),
    expected: { receipt: { operation: 'tombstone', to_state: 'tombstoned' } } },
] as const;

function grantAccess(rights: readonly string[]) {
  return {
    authenticate: vi.fn<AccessBoundary['authenticate']>(async () => ({
      hasMemoryIdentity: true, workspaceScopeRef: SCOPE, verifiedMandate: { ...MANDATE, rights },
    })),
    checkTrackWrite: vi.fn<AccessBoundary['checkTrackWrite']>().mockResolvedValue('clear'),
  };
}

it.each(writeCases)('$tool commits with its exact mandate right and checks Track once before claiming', async ({ tool, right, operation, input, expected }) => {
  const accessBoundary = grantAccess([right]);
  const h = await fixture({ accessBoundary });
  const args = { ...input(h), idempotency_key: KEY };
  expect(await h.invoke(tool, args)).toMatchObject({ ok: true, output: { value: expected } });
  expect(accessBoundary.checkTrackWrite).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    idempotencyKey: KEY, scopeRef: SCOPE, storeId: STORE, tenantId: validBinding.tenant_id,
    verifiedMandate: { ...MANDATE, rights: [right] }, mutation: expect.objectContaining({ operation }),
  }));
  expect(h.claimFencedExecution).toHaveBeenCalledTimes(1);
  expect(accessBoundary.checkTrackWrite).toHaveBeenCalledBefore(h.claimFencedExecution);
  const replay = tool === 'engram_memory_capture' ? { status: 'duplicate_exact' } : expected;
  expect(await h.invoke(tool, args)).toMatchObject({ ok: true, output: { value: replay } });
  expect(accessBoundary.checkTrackWrite).toHaveBeenCalledTimes(1);
});

it.each(writeCases)('$tool refuses a Track conflict before claiming and can retry the same key', async ({ tool, right, input, expected }) => {
  const accessBoundary = grantAccess([right]);
  accessBoundary.checkTrackWrite.mockResolvedValueOnce('conflict_staged');
  const h = await fixture({ accessBoundary });
  const before = h.recordState();
  const args = { ...input(h), idempotency_key: KEY };
  expect(await h.invoke(tool, args)).toMatchObject({ ok: false, error: { code: 'DIGEST_CONFLICT', retriable: false } });
  expect(h.recordState()).toEqual(before);
  expect(accessBoundary.checkTrackWrite).toHaveBeenCalledTimes(1);
  expect(h.claimFencedExecution).not.toHaveBeenCalled();
  expect(h.reservationState()).toBe(h.confirm.mock.calls.length ? 'authorized_uncommitted' : 'pending_confirmation');
  expect(await h.invoke(tool, args)).toMatchObject({ ok: true, output: { value: expected } });
  expect(accessBoundary.checkTrackWrite).toHaveBeenCalledTimes(2);
  expect(h.claimFencedExecution).toHaveBeenCalledTimes(1);
});

it.each([
  { mode: 'returns an unknown decision', code: 'STORE_UNAVAILABLE', decide: async () => 'unknown' as never },
  { mode: 'throws', code: 'MUTATION_OUTCOME_UNKNOWN', decide: async () => { throw Error('private Track exception'); } },
])('fails closed before claiming when the Track port $mode', async ({ code, decide }) => {
  const accessBoundary = grantAccess(['memory:lifecycle']);
  accessBoundary.checkTrackWrite.mockImplementation(decide);
  const h = await fixture({ accessBoundary });
  const before = h.recordState();
  const result = await h.invoke('engram_memory_forget', { ...writeCases[3].input(h), idempotency_key: KEY });
  expect(result).toMatchObject({ ok: false, error: { code } });
  expect(JSON.stringify(result)).not.toContain('private Track exception');
  expect(accessBoundary.checkTrackWrite).toHaveBeenCalledTimes(1);
  expect(h.claimFencedExecution).not.toHaveBeenCalled();
  expect(h.reservationState()).toBe('authorized_uncommitted');
  expect(h.recordState()).toEqual(before);
});

it('cancels a write aborted during confirmation before asking Track or claiming', async () => {
  const accessBoundary = grantAccess(['memory:lifecycle']);
  accessBoundary.checkTrackWrite.mockResolvedValue('conflict_staged');
  const h = await fixture({ accessBoundary });
  const controller = new AbortController();
  h.confirm.mockImplementationOnce(async () => {
    controller.abort();
    return true;
  });
  const before = h.recordState();
  const input = { ...writeCases[3].input(h), idempotency_key: KEY };
  expect(await h.invoke('engram_memory_forget', input, controller.signal)).toMatchObject({
    ok: false, error: { code: 'CANCELLED' },
  });
  expect(h.confirm).toHaveBeenCalled();
  expect(accessBoundary.checkTrackWrite).not.toHaveBeenCalled();
  expect(h.claimFencedExecution).not.toHaveBeenCalled();
  expect(h.recordState()).toEqual(before);
});

it('refuses a Track conflict during recovery without a new claim and retries when Track clears', async () => {
  const accessBoundary = grantAccess(['memory:lifecycle']);
  accessBoundary.checkTrackWrite.mockResolvedValueOnce('conflict_staged');
  const h = await fixture({ accessBoundary });
  const input = { ...writeCases[3].input(h), idempotency_key: KEY };
  expect(await h.invoke('engram_memory_forget', input)).toMatchObject({ ok: false, error: { code: 'DIGEST_CONFLICT' } });
  h.simulateInterruptedExecution();
  accessBoundary.checkTrackWrite.mockClear();
  h.claimFencedExecution.mockClear();
  const before = h.recordState();
  accessBoundary.checkTrackWrite.mockResolvedValueOnce('conflict_staged');
  expect(await h.invoke('engram_memory_forget', input)).toMatchObject({
    ok: false, error: { code: 'DIGEST_CONFLICT' },
  });
  expect(h.recordState()).toEqual(before);
  expect(accessBoundary.checkTrackWrite).toHaveBeenCalledTimes(1);
  expect(h.claimFencedExecution).not.toHaveBeenCalled();
  expect(await h.invoke('engram_memory_forget', input)).toMatchObject({
    ok: true, output: { value: writeCases[3].expected },
  });
  expect(accessBoundary.checkTrackWrite).toHaveBeenCalledTimes(2);
});

it.each([
  { issue: 'a mandate with an empty ID', patch: { mandateId: '' } },
  { issue: 'a mandate for a different scope', patch: { scope: 'scope:other' } },
  { issue: 'a mandate with an empty scope', patch: { scope: '' } },
  { issue: 'an expired mandate', patch: { expiresAt: '2026-08-16T12:34:56.788Z' } },
  { issue: 'a mandate expiring at the host clock instant', patch: { expiresAt: NOW } },
  { issue: 'a mandate with an invalid expiry', patch: { expiresAt: 'invalid' } },
  { issue: 'a mandate without signatures', patch: { signatures: [] } },
  { issue: 'a mandate with a missing signature entry', patch: { signatures: new Array<(typeof MANDATE.signatures)[number]>(1) } },
  { issue: 'a mandate with a malformed signature', patch: { signatures: [{ by: '', alg: 'ed25519', value: 'verified' }] } },
  { issue: 'a mandate with a malformed digest', patch: { envelopeDigest: 'sha256:abc' } },
] satisfies { issue: string; patch: Partial<typeof MANDATE & { expiresAt: string }> }[])(
  'denies $issue before write authorization', async ({ patch }) => {
    const accessBoundary = grantAccess(['memory:lifecycle']);
    accessBoundary.authenticate.mockResolvedValue({
      hasMemoryIdentity: true, workspaceScopeRef: SCOPE, verifiedMandate: { ...MANDATE, ...patch },
    });
    const h = await fixture({ accessBoundary });
    expect(await h.invoke('engram_memory_forget', { ...writeCases[3].input(h), idempotency_key: KEY })).toEqual(DENIED);
    expect(h.authorize).not.toHaveBeenCalled();
    expect(h.reserveOrLoad).not.toHaveBeenCalled();
  },
);

it.each([
  { issue: 'an omitted agent', binding: { agent_id: undefined }, instance: undefined, workspace: SCOPE },
  { issue: 'an empty connector instance', binding: { connector_instance_ref: '' }, instance: '', workspace: SCOPE },
  { issue: 'an empty bound scope', binding: { scope_ref: '' }, instance: MANDATE.instance, workspace: '' },
  { issue: 'an empty workspace scope', binding: {}, instance: MANDATE.instance, workspace: '' },
])('refuses $issue before dispatch or authorization', async ({ binding, instance, workspace }) => {
  const accessBoundary = grantAccess(['memory:lifecycle']);
  accessBoundary.authenticate.mockResolvedValue({
    hasMemoryIdentity: true, workspaceScopeRef: workspace, verifiedMandate: { ...MANDATE, instance } as typeof MANDATE,
  });
  const h = await fixture({ accessBoundary, binding });
  expect(await h.invoke('engram_memory_forget', { ...writeCases[3].input(h), idempotency_key: KEY })).toEqual(DENIED);
  expect(h.authorize).not.toHaveBeenCalled();
});

it('requires a read grant for the target scope and evaluates its expiry against the read host clock', async () => {
  const accessBoundary = grantAccess(['memory:read']);
  const scope = 'scope:other';
  const hostNow = '2026-08-16T12:35:00.000Z';
  const h = await fixture({ accessBoundary, scope, hostNow });
  const input = { record_id: h.recordId, purpose_ref: PURPOSE };
  expect(await h.invoke('engram_memory_get', input)).toEqual(DENIED);
  const access: GrantedAccess = {
    hasMemoryIdentity: true, workspaceScopeRef: SCOPE,
    verifiedMandate: { ...MANDATE, instance: validBinding.connector_instance_ref, scope, rights: ['memory:read'], expiresAt: hostNow },
  };
  accessBoundary.authenticate.mockResolvedValue(access);
  expect(await h.invoke('engram_memory_get', input)).toEqual(DENIED);
  expect(h.readCurrent).not.toHaveBeenCalled();
  accessBoundary.authenticate.mockResolvedValue({ ...access, verifiedMandate: { ...access.verifiedMandate!, expiresAt: DEADLINE } });
  expect(await h.invoke('engram_memory_get', input)).toMatchObject({ ok: true, output: { value: { record: { record_id: h.recordId } } } });
});

it('exposes the access-boundary types through the MCP memory entry point', () => {
  const entry = fileURLToPath(new URL('../../src/mcp-memory/index.ts', import.meta.url));
  const program = ts.createProgram([entry], { module: ts.ModuleKind.NodeNext, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const entryModule = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!;
  const exports = checker.getExportsOfModule(entryModule).map((symbol) => symbol.name);
  expect(exports).toEqual(expect.arrayContaining([
    'MemoryAccessBoundaryV1', 'MemoryAccessAuthenticationV1', 'MemoryTrackWriteV1',
  ]));
});

it('the six-tool v1 manifest digest is unchanged and the package declares no cluster-mesh dependency', () => {
  expect(MEMORY_PROVIDER_MANIFEST.tools).toHaveLength(6);
  const manifestBytes = `${JSON.stringify(MEMORY_PROVIDER_MANIFEST, null, 2)}\n`;
  expect(createHash('sha256').update(manifestBytes).digest('hex')).toBe(
    'a0c484fecac059254a33f92c966070d85f690a4835e97cac814510c6124d542b',
  );
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    expect(pkg[field] ?? {}).not.toHaveProperty('@sentropic/cluster-mesh');
  }
});

function evidenceFor(id: string) {
  return { evidence_ref: `evidence:${id}`, evidence_digest: DIGEST, citation_ids: [`citation:${id}`] };
}

function capturePayload(id = 'one', text = TEXT) {
  return {
    schema_version: 2 as const, purpose_ref: PURPOSE, valid_time: { t: 1 },
    components: [{ component_id: `component:${id}`, kind: 'context' as const, text, citation_ids: [`citation:${id}`] }],
    primary_component_id: `component:${id}`,
    primary_event: { at: 1, type_ref: 'event:one', citation_id: `citation:${id}` },
    citations: [{ citation_id: `citation:${id}`, source_ref: 'source:one', locator: { scheme: 'document', value: `doc#${id}` }, content_digest: DIGEST }],
  };
}

async function seedCandidate(engine: ReturnType<typeof createMemoryPortV2>, scope: string, id: string, text: string) {
  const captured = await engine.capture({
    schema_version: 2, idempotency_key: `idempotency-fixture-${id}`,
    payload: {
      ...capturePayload(id, text), scope_ref: scope,
      retention: { derivative_rule: 'retain' }, reconciliation: { family_refs: [] },
    },
    evidence: evidenceFor(id), authorization: { credential: 'credential:test' },
    source_order: { source_ref: `source:${id}`, sequence: '0' }, deadline_at: DEADLINE, cancellation_ref: `cancel:${id}`,
  });
  if (!captured.ok || captured.value.candidate_id === undefined) throw Error(`Could not capture ${id}`);
  return captured.value.candidate_id;
}

type Dependencies = Parameters<typeof createMemoryPortV2>[0];

function memoryDependencies(store: Dependencies['canonical_store'], clock: Dependencies['clock'], scope: string): Dependencies {
  const plaintext = new Map<string, string>();
  return {
    canonical_store: store, clock, activity_sources: [], allow_unfenced_memory_store: true,
    authorization: {
      version: 1,
      async authorize({ operation, resource_digest }) {
        const body = {
          allowed: true as const, decision_id: 'decision:test', policy_version: '1', operation, resource_digest,
          scope_ref: scope, not_before: NOW, expires_at: DEADLINE, revocation_epoch: '0',
          redaction: { mode: 'field-allowlist' as const, allowed_fields: [''], allow_derivation_lineage: false, max_packet_bytes: 1_048_576 },
          authentication_receipt_digest: DIGEST,
        };
        return { ok: true, value: { ...body, receipt_digest: receiptDigest('authorization-allowed', body) } };
      },
      async revalidate(receipt_digest, checked_at) {
        const body = { receipt_digest, checked_at, valid: true, current_revocation_epoch: '0', reason: 'valid' as const };
        return { ok: true, value: { ...body, revalidation_receipt_digest: receiptDigest('authorization-revalidation', body, 'revalidation_receipt_digest') } };
      },
      async redact() { throw Error('Unused test redaction port'); },
    },
    admission_policy: {
      policy_id: 'policy:test', policy_version: '1',
      async decide({ record_digest }) {
        const body = { policy_id: 'policy:test', policy_version: '1', record_digest, decision: 'accept' as const, issued_at: NOW };
        return { ok: true, value: { ...body, receipt_digest: receiptDigest('admission-decision', body) } };
      },
    },
    crypto: {
      version: 1,
      async seal({ candidate_id, plaintext: contents }) {
        plaintext.set(candidate_id, contents);
        const body = { candidate_id, envelope_ref: `envelope:${candidate_id}`, key_ref: `key:${candidate_id}`, ciphertext: `ciphertext:${candidate_id}` };
        return { ok: true, value: { ...body, envelope_digest: receiptDigest('sealed-candidate', body) } };
      },
      async open({ sealed }) { return { ok: true, value: { plaintext: plaintext.get(sealed.candidate_id)! } }; },
      async destroy({ key_ref }) {
        plaintext.delete(key_ref.slice('key:'.length));
        return { ok: true, value: { destroyed: true, receipt_digest: receiptDigest('key-destruction', { destroyed: true, key_ref }) } };
      },
      async rotate() { throw Error('Unused test rotation port'); },
    },
  };
}
