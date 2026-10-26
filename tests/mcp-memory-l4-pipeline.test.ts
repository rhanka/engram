/**
 * MCP-L4 dispatch pipeline proofs over the REAL canonical implementation.
 *
 * Every case below runs the real in-process facades over the real canonical
 * engine (`createMemoryPortV2`) and read facets on a non-native in-memory
 * store (`createInMemoryCanonicalMemoryStoreV1`), with a reservation built on
 * the real closed policy functions (never fabricated digests) and host ports
 * that verify their inputs. One case per pipeline step: ordering, resolver
 * throw, cancellation during authorization, post-commit exception,
 * stronger-confirmation refusal and injected-reference preservation, plus the
 * activation preflight and discovery metadata.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryPortV2 } from '../engram-memory/dist/engine.js';
import { createMemoryReadFacetsV1 } from '../engram-memory/dist/reads.js';
import { createInMemoryCanonicalMemoryStoreV1 } from '../engram-memory/dist/memory-store.js';
import { receiptDigest } from '../engram-memory/digests.js';
import {
  MEMORY_PROVIDER_ID,
  MEMORY_TOOL_DESCRIPTORS,
  MEMORY_TOOL_SCHEMA_PROFILE_ID,
  MEMORY_WIRE_PROFILE_ID,
} from '../src/mcp-memory/provider.js';
import {
  computeMemoryMutationOperationDigestV1,
  extractMemoryMutationLookupKeyV1,
  projectMemoryMutationPolicyVersionsV1,
  validateMemoryMutationPreimageV1,
  type MemoryMutationBindingV1,
} from '../src/mcp/memory/policy.js';
import { isValidCursor, isValidOpaqueRef } from '../src/mcp/memory/schemas.js';
import {
  createEngramMemoryMcpServerV1,
  MEMORY_MCP_META_KEY,
} from '../src/mcp-memory/server.js';
import {
  createEngramMemoryProviderV1,
  McpMemoryPreflightError,
  type McpMemoryProviderOptions,
} from '../src/mcp-memory/provider.js';
import { createMemoryReadPageStoreV1 } from '../src/memory-tools/reads.js';

const NOW = '2026-08-16T12:34:56.789Z';
const DEADLINE = '2026-08-16T12:35:16.789Z';
const D = 'sha256:' + '0'.repeat(64);
const ELICITATION_REF = 'elicit:pipeline';
const KEY = (c: string) => c.repeat(32);

function binding(overrides: Record<string, unknown> = {}) {
  return {
    issuer: 'issuer:one', sub: 'alice', tid: 'tenant:one', claims: ['sub', 'tid'],
    claims_provenance_receipt: D, principal_namespace: 'ns:one', principal_id: 'alice',
    tenant_id: 'tenant:one', tenant_membership_receipt: D,
    tenant_resolution_source: 'authoritative_membership',
    agent_id: 'agent:one', mcp_client_id: 'client:one', logical_session_ref: 'session:one',
    transport_attachment_ref: 'attach:one', connection_proof_digest: D,
    publisher_id: 'sentropic.engram.memory', provider_id: 'sentropic.engram.memory',
    connector_id: 'engram-memory', connector_instance_ref: 'connector:one',
    selected_source_id: 'mcp:engram-memory', store_id: 'store:one', scope_ref: 'scope:one',
    purpose_ref: 'purpose:one', active_generation: '1', policy_epoch: '1',
    audit_id: 'audit:pipeline', correlation_ref: 'corr:one', deadline_at: DEADLINE,
    cancellation_ref: 'cancel:one', issued_at: NOW, channel_binding: 'in_process_verified',
    transport_scopes: ['mcp:tools:invoke'], neutral_credential: 'credential:one',
    ...overrides,
  };
}

function stpCtx(bindingOverrides: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const b = binding(bindingOverrides);
  return {
    requestId: 'req:one', correlationId: 'corr:one', auditId: b.audit_id,
    principal: { sub: 'alice', claims: { sub: 'alice', tid: 'tenant:one' }, scopes: ['mcp:tools:invoke'], tenantRef: 'tenant:one', authTime: NOW },
    surface: 'backend', mcpClient: { clientId: 'client:one', client: 'test' },
    session: { mcpSessionId: 'session:one' }, tenantRef: 'tenant:one',
    connectorInstanceId: 'connector:one', consentRefs: [], grantRefs: [],
    getSecret: async () => { throw new Error('no secret'); }, connectorConfig: {},
    audit: { emit: async () => {} }, logger: {},
    memory: { binding: b, expectedActiveGeneration: '1', expectedPolicyEpoch: '1', now: NOW, ...extra },
  };
}

function hostBindings() {
  const sha = '0'.repeat(64);
  return {
    profileBindings: {
      wireProfileId: 'sentropic.engram.memory-wire/v1', wireProfileSha256: sha,
      toolSchemaProfileId: 'sentropic.engram.memory-tools/2020-12-v1', toolSchemaProfileSha256: sha,
      parameterProfileId: 'sentropic.parameters/2020-12-bounded-v1', parameterSchemaVersion: '1.0.0', parameterProfileSha256: sha,
    },
    hostBindingRef: 'test-binding',
    invocation: { contractVersion: '1.0.0' },
    authorization: { contractVersion: '1.0.0' },
    domainPolicy: { contractVersion: '1.0.0' },
    engine: {
      mutationPortVersion: 2, recallPortVersion: 3, readPortVersion: 1,
      engineId: 'test-engine', canonicalStoreId: 'store:one', fenceProvenanceId: 'fence:test',
    },
    mutationRecovery: { contractVersion: '1.0.0', digestProfile: 'sentropic.engram.memory-mutation/v1' },
    confirmation: { contractVersion: '1.0.0', enrolledOidcDomain: 'sent-tech.ca' },
    audit: { contractVersion: '1.0.0' },
    pagination: { contractVersion: '1.0.0', engramOwnsSigningSecret: false },
    lifecycle: { contractVersion: '1.0.0' },
  };
}

function plan() {
  return {
    resolveTool: (name: string) => {
      const descriptor = MEMORY_TOOL_DESCRIPTORS.find((candidate) => candidate.name === name);
      if (descriptor === undefined) return undefined;
      return {
        providerId: MEMORY_PROVIDER_ID,
        capabilityName: descriptor.name,
        requiredScopes: [...descriptor.requiredScopes],
        requiredClaims: [...descriptor.requiredClaims],
        entry: {
          gates: {
            requiresHumanConfirmation: descriptor.gates.requiresHumanConfirmation,
            requiresElicitation: descriptor.gates.requiresElicitation,
          },
        },
      };
    },
  };
}

function engineDeps(clock: { now(): string }) {
  const authorization = {
    version: 1 as const,
    async authorize(request: { operation: string; resource_digest: string }) {
      const body = {
        allowed: true as const, decision_id: 'decision:pipeline', policy_version: '1',
        operation: request.operation, resource_digest: request.resource_digest,
        scope_ref: 'scope:one', not_before: NOW, expires_at: DEADLINE,
        revocation_epoch: '0',
        redaction: {
          mode: 'field-allowlist' as const,
          allowed_fields: [
            '/authorization_receipt_digest', '/citations', '/components', '/derivation', '/payload_digest',
            '/primary_component_id', '/primary_event', '/purpose_ref', '/reconciliation', '/record_digest',
            '/record_id', '/recorded_at', '/recorded_cursor', '/retention', '/schema_version', '/scope_ref',
            '/trust', '/valid_time',
          ],
          allow_derivation_lineage: false, max_packet_bytes: 1048576,
        },
        authentication_receipt_digest: D,
      };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest('authorization-allowed', body) } };
    },
    async revalidate(receiptDigestValue: string, checkedAt: string) {
      const body = { receipt_digest: receiptDigestValue, checked_at: checkedAt, valid: true, current_revocation_epoch: '0', reason: 'valid' as const };
      return { ok: true as const, value: { ...body, revalidation_receipt_digest: receiptDigest('authorization-revalidation', body, 'revalidation_receipt_digest') } };
    },
    async redact() { throw new Error('unused'); },
  };
  const policy = {
    policy_id: 'policy:pipeline', policy_version: '1',
    async decide(request: { record_digest: string }) {
      const body = { policy_id: 'policy:pipeline', policy_version: '1', record_digest: request.record_digest, decision: 'accept' as const, issued_at: NOW };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest('admission-decision', body) } };
    },
  };
  const plaintext = new Map<string, string>();
  const crypto = {
    version: 1 as const,
    async seal(input: { candidate_id: string; plaintext: string }) {
      plaintext.set(input.candidate_id, input.plaintext);
      const body = { candidate_id: input.candidate_id, envelope_ref: `envelope:${input.candidate_id}`, key_ref: `key:${input.candidate_id}`, ciphertext: `ciphertext:${input.candidate_id}` };
      return { ok: true as const, value: { ...body, envelope_digest: receiptDigest('sealed-candidate', body) } };
    },
    async open(input: { sealed: { candidate_id: string } }) {
      const value = plaintext.get(input.sealed.candidate_id);
      return value === undefined
        ? { ok: false as const, error: { code: 'UNAUTHORIZED' as const, operation: 'inspect_candidate' as const, message: 'destroyed', retryable: false } }
        : { ok: true as const, value: { plaintext: value } };
    },
    async destroy(input: { key_ref: string }) {
      const body = { destroyed: true, key_ref: input.key_ref };
      return { ok: true as const, value: { destroyed: true, receipt_digest: receiptDigest('key-destruction', body) } };
    },
    async rotate() { throw new Error('unused'); },
  };
  const evidence_verifier = {
    version: 1 as const,
    verifier_id: 'verifier:pipeline',
    verifier_version: '1',
    async classify(request: { payload_digest: string; evidence: { evidence_ref: string } }) {
      const body = {
        class: 'earned' as const,
        evidence_digest: D,
        verifier_id: 'verifier:pipeline',
        verifier_version: '1',
        issued_at: NOW,
        revocation_epoch: '0',
      };
      return {
        ok: true as const,
        value: { ...body, receipt_digest: receiptDigest('earned-trust', { ...body, payload_digest: request.payload_digest }) },
      };
    },
    async revalidate(binding_receipt_digest: string, checked_at: string) {
      const body = { binding_receipt_digest, checked_at, valid: true, current_revocation_epoch: '0', reason: 'valid' as const };
      return { ok: true as const, value: { ...body, revalidation_receipt_digest: receiptDigest('trust-revalidation', body, 'revalidation_receipt_digest') } };
    },
  };
  return { authorization, admission_policy: policy, crypto, evidence_verifier };
}

interface Harness {
  adapter: ReturnType<typeof createEngramMemoryProviderV1>;
  counts: Record<string, number>;
  confirmations: Array<Record<string, unknown>>;
  engineRequests: Array<{ op: string; cancellation_ref?: unknown }>;
  facets: unknown;
  readHost: unknown;
  writeHost: unknown;
}

function fail(code: string, message: string) {
  return { ok: false as const, error_code: code, message };
}

async function buildHarness(overrides: {
  authenticate?: (ctx: unknown, tool: string) => Promise<boolean>;
  authorize?: (ctx: unknown, tool: string, purpose: string) => Promise<boolean>;
  confirm?: (binding: Record<string, unknown>) => Promise<boolean>;
  confirmDestroyed?: (candidate_id: string) => Promise<boolean>;
  coverage?: (cursor: string) => Promise<{ complete: boolean }>;
  confirmationRequired?: boolean;
  clockNow?: string;
} = {}): Promise<Harness> {
  const counts: Record<string, number> = {
    recall: 0, readCurrent: 0, capture: 0, requestAdmission: 0, transition: 0,
    authenticate: 0, authorize: 0, reserve: 0, confirm: 0,
  };
  const confirmations: Array<Record<string, unknown>> = [];
  const engineRequests: Array<{ op: string; cancellation_ref?: unknown }> = [];
  const clock = { now: () => overrides.clockNow ?? NOW };
  const store = createInMemoryCanonicalMemoryStoreV1({ clock, store_id: 'store:one' });
  const ports = engineDeps(clock);
  const engine = createMemoryPortV2({
    canonical_store: store,
    authorization: ports.authorization,
    admission_policy: ports.admission_policy,
    crypto: ports.crypto,
    evidence_verifier: ports.evidence_verifier,
    activity_sources: [],
    clock,
    allow_unfenced_memory_store: true,
  } as unknown as Parameters<typeof createMemoryPortV2>[0]);
  const readFacets = createMemoryReadFacetsV1(
    { canonical_store: store, ...ports, activity_sources: [], clock, allow_unfenced_memory_store: true } as unknown as Parameters<typeof createMemoryReadFacetsV1>[0],
    { scope_ref: 'scope:one', store_id: 'store:one' },
  );
  const recordingEngine = {
    version: 2 as const,
    capture: async (req: Record<string, unknown>, guard?: unknown) => {
      counts.capture++;
      engineRequests.push({ op: 'capture', cancellation_ref: req.cancellation_ref });
      return (engine.capture as unknown as (r: unknown, g?: unknown) => Promise<unknown>)(req, guard);
    },
    requestAdmission: async (req: unknown, guard?: unknown) => {
      counts.requestAdmission++;
      engineRequests.push({ op: 'requestAdmission' });
      return engine.requestAdmission(req as never, guard as never);
    },
    transition: async (cmd: unknown, guard?: unknown) => {
      counts.transition++;
      engineRequests.push({ op: 'transition' });
      return engine.transition(cmd as never, guard as never);
    },
  };
  const recordingRecall = {
    version: 3 as const,
    recall: async (req: unknown) => {
      counts.recall++;
      return (readFacets.recallPort as { recall(r: unknown): Promise<unknown> }).recall(req);
    },
  };
  const recordingRead = {
    version: 1 as const,
    readCurrent: async (req: unknown) => {
      counts.readCurrent++;
      return (readFacets.readPort as { readCurrent(r: unknown): Promise<unknown> }).readCurrent(req);
    },
  };
  const facets = { scope_ref: 'scope:one', store_id: 'store:one', recallPort: recordingRecall, readPort: recordingRead, engine: recordingEngine };

  const stored = new Map<string, MemoryMutationBindingV1<unknown>>();
  const byRef = (ref: string) => [...stored.values()].find((entry) => entry.preimage.reservation_ref === ref);
  const reservation = {
    async reserveOrLoad(lookupKey: unknown, candidate: unknown) {
      counts.reserve++;
      const key = JSON.stringify(lookupKey);
      const existing = stored.get(key);
      if (existing) return { ok: true as const, value: existing };
      const candidatePreimage = candidate as Parameters<typeof validateMemoryMutationPreimageV1>[0];
      if (!validateMemoryMutationPreimageV1(candidatePreimage).ok) return fail('INVALID_SCHEMA', 'candidate preimage is not closed');
      const digest = computeMemoryMutationOperationDigestV1(candidatePreimage);
      if (!digest.ok) return fail(digest.error_code, 'candidate digest failed');
      const versions = projectMemoryMutationPolicyVersionsV1(
        (candidatePreimage as { effective_input: unknown }).effective_input,
      );
      if (!versions.ok) return fail(versions.error_code, 'candidate policy versions failed');
      const toolName = (candidatePreimage as { tool_name: string }).tool_name;
      const entry: MemoryMutationBindingV1<unknown> = {
        lookup_key: lookupKey as MemoryMutationBindingV1<unknown>['lookup_key'],
        preimage: candidatePreimage as MemoryMutationBindingV1<unknown>['preimage'],
        operation_digest: digest.value.operation_digest,
        policy_versions: versions.value,
        recovery_state: toolName === 'engram_memory_withdraw' || toolName === 'engram_memory_forget'
          ? 'pending_confirmation'
          : 'authorized_uncommitted',
        audit_id: `reservation-audit:${(candidatePreimage as { reservation_ref: string }).reservation_ref}`,
        execution_generation: '0',
      };
      stored.set(key, entry);
      return { ok: true as const, value: entry };
    },
    async attachConfirmation(reservationRef: string, confirmationRef: string, operationDigest: string) {
      const entry = byRef(reservationRef);
      if (!entry) return fail('NOT_FOUND', 'unknown reservation');
      if (entry.operation_digest !== operationDigest) return fail('INVALID_SCHEMA', 'confirmation digest mismatch');
      if (!isValidOpaqueRef(confirmationRef)) return fail('INVALID_SCHEMA', 'confirmation ref is not opaque');
      const next: MemoryMutationBindingV1<unknown> = {
        ...entry, confirmation_ref: confirmationRef,
        recovery_state: entry.recovery_state === 'pending_confirmation' ? 'authorized_uncommitted' : entry.recovery_state,
      };
      stored.set(JSON.stringify(next.lookup_key), next);
      return { ok: true as const, value: next };
    },
    async claimFencedExecution(reservationRef: string, executionGeneration: string) {
      const entry = byRef(reservationRef);
      if (!entry) return fail('NOT_FOUND', 'unknown reservation');
      if (!isValidCursor(executionGeneration)) return fail('INVALID_SCHEMA', 'execution generation is not a cursor');
      if (entry.recovery_state !== 'authorized_uncommitted') {
        return fail(entry.recovery_state === 'executing_unknown_outcome' ? 'MUTATION_OUTCOME_UNKNOWN' : 'INVALID_SCHEMA', 'reservation is not claimable');
      }
      const next: MemoryMutationBindingV1<unknown> = {
        ...entry, recovery_state: 'executing_unknown_outcome', execution_generation: executionGeneration,
      };
      stored.set(JSON.stringify(next.lookup_key), next);
      return { ok: true as const, value: next };
    },
    async reconcileCanonicalOutcome(reservationRef: string, canonicalReplayRef: string) {
      const entry = byRef(reservationRef);
      if (!entry) return fail('NOT_FOUND', 'unknown reservation');
      if (!isValidOpaqueRef(canonicalReplayRef)) return fail('INVALID_SCHEMA', 'replay ref is not opaque');
      const next: MemoryMutationBindingV1<unknown> = {
        ...entry, recovery_state: 'canonical_committed_receipt', canonical_replay_ref: canonicalReplayRef,
      };
      stored.set(JSON.stringify(next.lookup_key), next);
      return { ok: true as const, value: next };
    },
    async recordCompletion(reservationRef: string, output: unknown) {
      const entry = byRef(reservationRef);
      if (!entry) return fail('NOT_FOUND', 'unknown reservation');
      if (!isValidOpaqueRef(entry.canonical_replay_ref) || entry.recovery_state !== 'canonical_committed_receipt') {
        return fail('INVALID_SCHEMA', 'reservation has no canonical commitment to complete');
      }
      const next: MemoryMutationBindingV1<unknown> = {
        ...entry, recovery_state: 'completed_response', stored_output: output,
      };
      stored.set(JSON.stringify(next.lookup_key), next);
      return { ok: true as const, value: next };
    },
  };

  const readHost = {
    clock,
    authenticate: async (ctx: unknown, tool: string) => {
      counts.authenticate++;
      if (overrides.authenticate) return overrides.authenticate(ctx, tool);
      const c = ctx as { scope_ref: string; store_id: string };
      return c.scope_ref === 'scope:one' && c.store_id === 'store:one';
    },
    authorize: async (ctx: unknown, tool: string, purpose: string) => {
      counts.authorize++;
      if (overrides.authorize) return overrides.authorize(ctx, tool, purpose);
      const c = ctx as { scope_ref: string };
      return c.scope_ref === 'scope:one' && purpose === 'purpose:one';
    },
    authorizeContinuation: async () => true,
    pages: createMemoryReadPageStoreV1({ clock, ttl_ms: 60000, max_entries: 100 }),
  };
  const writeHost = {
    clock,
    authenticate: readHost.authenticate,
    authorize: async (ctx: unknown, tool: string, purpose: string) => {
      counts.authorize++;
      if (overrides.authorize) return overrides.authorize(ctx, tool, purpose);
      const c = ctx as { scope_ref: string };
      if (c.scope_ref !== 'scope:one') return false;
      if (tool === 'engram_memory_capture') return purpose === 'purpose:one';
      return true;
    },
    reservation,
    audit: { append: async () => {} },
    policy: {
      capturePolicyVersion: async () => 'capture-policy/v1',
      admissionPolicyVersion: async () => 'admission-policy/v1',
      retention: { max_retention_days: 30, allow_retain_derivative_rule: false },
      reconciliation: { consented_family_refs: [] as string[] },
      anchorKindRef: 'memory:lifecycle',
      provenanceDigest: async () => D,
      nextSourceOrder: async () => ({ source_ref: 'source:host', sequence: '1' }),
    },
    confirm: async (binding: Record<string, unknown>) => {
      counts.confirm++;
      confirmations.push({ ...binding });
      if (overrides.confirm) return overrides.confirm(binding);
      return true;
    },
    keyCustody: {
      confirmDestroyed: async (candidate_id: string) => {
        if (overrides.confirmDestroyed) return overrides.confirmDestroyed(candidate_id);
        return true;
      },
    },
    coverage: {
      verify: async (cursor: string) => {
        if (overrides.coverage) return overrides.coverage(cursor);
        return { complete: false };
      },
    },
  };
  const adapter = createEngramMemoryProviderV1({
    readFacets: facets as unknown as McpMemoryProviderOptions['readFacets'],
    writeFacets: facets as unknown as McpMemoryProviderOptions['writeFacets'],
    readHost: readHost as unknown as McpMemoryProviderOptions['readHost'],
    writeHost: writeHost as unknown as McpMemoryProviderOptions['writeHost'],
    policyId: 'policy:one',
    hostBindings: hostBindings() as unknown as McpMemoryProviderOptions['hostBindings'],
    plan: plan() as unknown as McpMemoryProviderOptions['plan'],
    sourceId: 'mcp:engram-memory',
    generation: '1',
  });
  return { adapter, counts, confirmations, engineRequests, facets, readHost, writeHost };
}

describe('activation preflight consumes the L0 host-binding contract', () => {
  it('advertises six tools only after a complete binding, and refuses null, empty or partial policies, ports, plans and bindings', async () => {
    const parts = await buildHarness();
    const good = {
      readFacets: parts.facets as never, writeFacets: parts.facets as never,
      readHost: parts.readHost as never, writeHost: parts.writeHost as never,
      policyId: 'policy:one', hostBindings: hostBindings(), plan: plan(),
      sourceId: 'mcp:engram-memory', generation: '1',
    };
    const adapter = createEngramMemoryProviderV1(good as unknown as McpMemoryProviderOptions);
    const listed = await adapter.listCapabilities(stpCtx() as never);
    expect(listed.length).toBe(6);

    const writeHost = parts.writeHost as Record<string, unknown>;
    const policy = writeHost.policy as Record<string, unknown>;
    const bad: unknown[] = [
      { ...good, hostBindings: undefined },
      { ...good, hostBindings: { ...hostBindings(), profileBindings: { ...(hostBindings() as { profileBindings: Record<string, unknown> }).profileBindings, wireProfileSha256: 'not-a-digest' } } },
      { ...good, hostBindings: { ...hostBindings(), confirmation: { contractVersion: '1.0.0', enrolledOidcDomain: 'other.example' } } },
      { ...good, plan: {} },
      { ...good, sourceId: '' },
      { ...good, generation: '' },
      { ...good, writeHost: { ...writeHost, policy: { ...policy, retention: null } } },
      { ...good, writeHost: { ...writeHost, policy: { ...policy, retention: {} } } },
      { ...good, writeHost: { ...writeHost, policy: { ...policy, retention: { max_retention_days: 30 } } } },
      { ...good, writeHost: { ...writeHost, policy: { ...policy, reconciliation: null } } },
      { ...good, writeHost: { ...writeHost, policy: { ...policy, reconciliation: {} } } },
      { ...good, writeHost: { ...writeHost, policy: { ...policy, anchorKindRef: '' } } },
      { ...good, writeHost: { ...writeHost, confirm: undefined } },
    ];
    for (const opts of bad) {
      expect(() => createEngramMemoryProviderV1(opts as McpMemoryProviderOptions)).toThrow(McpMemoryPreflightError);
    }
  });
});

describe('single dispatch pipeline over the real canonical implementation', () => {
  it('authenticates before any domain envelope: missing purpose is INVALID_SCHEMA after auth, a rejecting authenticator is the protocol refusal', async () => {
    const h = await buildHarness();
    const invoke = (input: unknown, ctx: unknown, extra: Record<string, unknown> = {}) =>
      h.adapter.invokeTool({ capabilityRef: 'engram_memory_search', input, ctx, ...extra } as never) as Promise<{ ok: boolean; error?: { code: string }; auditId: string }>;
    const missing = await invoke({ query: 'needle' }, stpCtx());
    expect(missing.ok).toBe(false);
    expect(missing.error?.code).toBe('INVALID_SCHEMA');
    expect(h.counts.authenticate).toBeGreaterThanOrEqual(1);

    let rejectingAuthCalls = 0;
    const rejecting = await buildHarness({
      authenticate: async () => { rejectingAuthCalls++; return false; },
    });
    const rin = (input: unknown, ctx: unknown, extra: Record<string, unknown> = {}) =>
      rejecting.adapter.invokeTool({ capabilityRef: 'engram_memory_search', input, ctx, ...extra } as never);
    await expect(rin({ query: 'needle' }, stpCtx())).rejects.toMatchObject({ protocolCode: -32603 });
    // The authenticator ran and refused; no domain envelope either way: the
    // search facade was never reached.
    expect(rejectingAuthCalls).toBeGreaterThanOrEqual(1);
    expect(rejecting.counts.recall).toBe(0);
  });

  it('short idempotency keys are argument failures, never context errors', async () => {
    const h = await buildHarness();
    const out = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_capture', input: captureArgs('abcd'), ctx: stpCtx(),
    } as never) as { ok: boolean; error?: { code: string } };
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('INVALID_SCHEMA');
    expect(h.counts.capture).toBe(0);
  });

  it('forged and missing contexts are refused before authentication', async () => {
    const h = await buildHarness();
    // A forged provider binding is refused at the trust boundary (typed
    // refusal or constant protocol error — never a domain envelope).
    const forgedError = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_search',
      input: { query: 'needle', purpose_ref: 'purpose:one' },
      ctx: stpCtx({ provider_id: 'forged.provider' }),
    } as never).then(
      () => { throw new Error('forged context must refuse'); },
      (error: unknown) => error,
    );
    expect(
      (forgedError as { protocolCode?: number })?.protocolCode === -32603 ||
      (forgedError as Error)?.name === 'MemoryDispatchRefusal',
    ).toBe(true);
    expect(h.counts.authenticate).toBe(0);
    expect(h.counts.recall).toBe(0);
    await expect(h.adapter.invokeTool({
      capabilityRef: 'engram_memory_search',
      input: { query: 'needle', purpose_ref: 'purpose:one' },
      ctx: undefined,
    } as never)).rejects.toMatchObject({ protocolCode: -32603 });
    expect(h.counts.authenticate).toBe(0);
  });

  it('cancellation during authorization never reaches the engine', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const controller = new AbortController();
    let authCalls = 0;
    const h = await buildHarness({
      authenticate: async () => { authCalls++; controller.abort(); await gate; return true; },
    });
    const pending = h.adapter.invokeTool({
      capabilityRef: 'engram_memory_search',
      input: { query: 'needle', purpose_ref: 'purpose:one' },
      ctx: stpCtx(), signal: controller.signal,
    } as never) as Promise<{ ok: boolean; error?: { code: string } }>;
    setTimeout(release, 50);
    const out = await pending;
    expect(authCalls).toBeGreaterThanOrEqual(1);
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('CANCELLED');
    expect(h.counts.recall).toBe(0);
  });

  it('aborting a mutation mid-execution is indeterminate, never proven cancelled', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const controller = new AbortController();
    let authorizeCalls = 0;
    const h = await buildHarness({
      authorize: async (_ctx, tool) => {
        authorizeCalls++;
        if (tool === 'engram_memory_capture') {
          controller.abort();
          await gate;
        }
        return true;
      },
    });
    const pending = h.adapter.invokeTool({
      capabilityRef: 'engram_memory_capture',
      input: captureArgs(KEY('a')), ctx: stpCtx(),
      idempotencyKey: KEY('a'), elicitationRef: ELICITATION_REF, signal: controller.signal,
    } as never) as Promise<{ ok: boolean; error?: { code: string } }>;
    setTimeout(release, 50);
    const out = await pending;
    expect(authorizeCalls).toBeGreaterThanOrEqual(1);
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('MUTATION_OUTCOME_UNKNOWN');
  });

  it('a post-commit custody exception keeps the committed receipt with pending cleanup', async () => {
    const h = await buildHarness({
      confirmDestroyed: () => { throw new Error('custody blew up after commit'); },
    });
    const good = () => stpCtx({ elicitation_ref: ELICITATION_REF });
    const env = { elicitationRef: ELICITATION_REF };
    const capture = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('b')), ctx: good(),
      idempotencyKey: KEY('b'), ...env,
    } as never) as { ok: boolean; output?: { value: { candidate_id: string } } };
    expect(capture.ok).toBe(true);
    const candidateId = capture.output!.value.candidate_id;
    const withdraw = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_withdraw',
      input: { candidate_id: candidateId, idempotency_key: KEY('c'), reason_ref: 'reason:one' },
      ctx: good(), idempotencyKey: KEY('c'), ...env,
    } as never) as { ok: boolean; output?: { value: { receipt: { to_state: string }; key_destruction: string } } };
    expect(withdraw.ok).toBe(true);
    expect(withdraw.output!.value.receipt.to_state).toBe('withdrawn');
    expect(withdraw.output!.value.key_destruction).toBe('pending');
  });

  it('a selected stronger confirmation gate refuses before any effect and calls the confirmation port', async () => {
    let approved = false;
    const h = await buildHarness({ confirm: async () => approved });
    const attempt = () => h.adapter.invokeTool({
      capabilityRef: 'engram_memory_capture',
      input: captureArgs(KEY('d')), ctx: stpCtx({}, { confirmationRequired: true }),
      idempotencyKey: KEY('d'), elicitationRef: ELICITATION_REF,
    } as never) as Promise<{ ok: boolean; error?: { code: string }; output?: { value: { status: string } } }>;
    const out = await attempt();
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('gate_failed');
    expect(h.counts.confirm).toBe(1);
    // No effect was committed: approving the same key afterwards commits
    // fresh instead of replaying a prior commitment.
    approved = true;
    const retry = await attempt();
    expect(retry.ok).toBe(true);
    expect(retry.output!.value.status).toBe('committed_pending');
    expect(h.counts.confirm).toBe(2);
  });

  it('reads under a stronger confirmation gate are refused closed', async () => {
    const h = await buildHarness();
    const out = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_search',
      input: { query: 'needle', purpose_ref: 'purpose:one' },
      ctx: stpCtx({ elicitation_ref: ELICITATION_REF }, { confirmationRequired: true }),
      elicitationRef: ELICITATION_REF,
    } as never) as { ok: boolean; error?: { code: string } };
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('gate_failed');
    expect(h.counts.recall).toBe(0);
  });

  it('preserves the injected elicitation and cancellation references end to end', async () => {
    const h = await buildHarness();
    const good = () => stpCtx({ elicitation_ref: ELICITATION_REF });
    const env = { elicitationRef: ELICITATION_REF };
    const capture = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('e')), ctx: good(),
      idempotencyKey: KEY('e'), ...env,
    } as never) as { ok: boolean; output?: { value: { candidate_id: string } } };
    expect(capture.ok).toBe(true);
    expect(h.engineRequests[0]).toMatchObject({ op: 'capture', cancellation_ref: 'cancel:one' });
    const withdraw = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_withdraw',
      input: { candidate_id: capture.output!.value.candidate_id, idempotency_key: KEY('f'), reason_ref: 'reason:one' },
      ctx: good(), idempotencyKey: KEY('f'), ...env,
    } as never) as { ok: boolean };
    expect(withdraw.ok).toBe(true);
    expect(h.confirmations.length).toBeGreaterThanOrEqual(1);
    expect(h.confirmations[0].elicitation_ref).toBe(ELICITATION_REF);
  });

  it('drives the real lifecycle: capture, admission, get, forget, withdraw, and indeterminate replay', async () => {
    const h = await buildHarness();
    const good = () => stpCtx({ elicitation_ref: ELICITATION_REF });
    const env = { elicitationRef: ELICITATION_REF };
    const search = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_search',
      input: { query: 'needle', purpose_ref: 'purpose:one' }, ctx: good(), ...env,
    } as never) as { ok: boolean; output?: { value: { records: unknown[] } } };
    expect(search.ok).toBe(true);
    expect(Array.isArray(search.output!.value.records)).toBe(true);

    const capture = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('1')), ctx: good(),
      idempotencyKey: KEY('1'), ...env,
    } as never) as { ok: boolean; output?: { value: { candidate_id: string; status: string } } };
    expect(capture.ok).toBe(true);
    expect(capture.output!.value.status).toBe('committed_pending');
    const candidateA = capture.output!.value.candidate_id;

    const admission = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_request_admission',
      input: { candidate_id: candidateA, idempotency_key: KEY('2') },
      ctx: good(), idempotencyKey: KEY('2'), ...env,
    } as never) as { ok: boolean; output?: { value: { outcome: { status: string; record_id?: string } } } };
    expect(admission.ok).toBe(true);
    const recordId = admission.output!.value.outcome.record_id;
    expect(typeof recordId).toBe('string');

    const get = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_get',
      input: { record_id: recordId, purpose_ref: 'purpose:one' }, ctx: good(), ...env,
    } as never) as { ok: boolean; output?: { value: { record: { record_id: string } } } };
    expect(get.ok).toBe(true);
    expect(get.output!.value.record.record_id).toBe(recordId);

    const forget = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_forget',
      input: { record_id: recordId, idempotency_key: KEY('3'), reason_ref: 'reason:one' },
      ctx: good(), idempotencyKey: KEY('3'), ...env,
    } as never) as { ok: boolean; output?: { value: { receipt: { to_state: string } } } };
    expect(forget.ok).toBe(true);
    expect(forget.output!.value.receipt.to_state).toBe('tombstoned');

    const captureB = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('4')), ctx: good(),
      idempotencyKey: KEY('4'), ...env,
    } as never) as { ok: boolean; output?: { value: { candidate_id: string } } };
    expect(captureB.ok).toBe(true);
    const withdraw = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_withdraw',
      input: { candidate_id: captureB.output!.value.candidate_id, idempotency_key: KEY('5'), reason_ref: 'reason:one' },
      ctx: good(), idempotencyKey: KEY('5'), ...env,
    } as never) as { ok: boolean };
    expect(withdraw.ok).toBe(true);
    const again = await h.adapter.invokeTool({
      capabilityRef: 'engram_memory_withdraw',
      input: { candidate_id: captureB.output!.value.candidate_id, idempotency_key: KEY('6'), reason_ref: 'reason:one' },
      ctx: good(), idempotencyKey: KEY('6'), ...env,
    } as never) as { ok: boolean; error?: { code: string } };
    expect(again.ok).toBe(false);
    expect(again.error?.code).toBe('MUTATION_OUTCOME_UNKNOWN');
  });
});

describe('SDK discovery carries the full qualified metadata', () => {
  it('asserts every metadata field through real SDK discovery', async () => {
    const h = await buildHarness();
    const server = await createEngramMemoryMcpServerV1(h.adapter);
    const via = await server.connectViaInMemory(async () => stpCtx({ elicitation_ref: ELICITATION_REF }));
    try {
      const listed = await via.client.listTools();
      expect(listed.tools.length).toBe(6);
      const byName = Object.fromEntries(listed.tools.map((t) => [t.name, t]));
      const canon = (value: unknown): string => {
        if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
        if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
        return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canon((value as Record<string, unknown>)[key])}`).join(',')}}`;
      };
      for (const tool of h.adapter.manifest.tools) {
        const seen = byName[tool.name];
        expect(seen).toBeTruthy();
        expect(seen.description).toBe(tool.description);
        // The SDK transport may reorder object keys: canonical comparison.
        expect(canon(seen.inputSchema)).toBe(canon(tool.inputSchema));
        const meta = seen._meta[MEMORY_MCP_META_KEY] as Record<string, unknown>;
        // Field-by-field against the manifest and the adapter's contract
        // ids (the frozen platform cross-check lives in the packed
        // acceptance, which owns the peers).
        expect(meta.wireProfile).toBe(MEMORY_WIRE_PROFILE_ID);
        expect(meta.toolsProfile).toBe(MEMORY_TOOL_SCHEMA_PROFILE_ID);
        expect(meta.providerId).toBe('sentropic.engram.memory');
        expect(meta.connectorId).toBe('engram-memory');
        expect(meta.sourceId).toBe('mcp:engram-memory');
        expect(meta.mutability).toBe(tool.mutability);
        expect(meta.mutatesExternalSystem).toBe(tool.mutatesExternalSystem);
        expect(meta.idempotency).toEqual(tool.idempotency);
        expect(meta.gates).toEqual(tool.gates);
        expect(meta.requiredScopes).toEqual(tool.requiredScopes);
        expect(meta.requiredClaims).toEqual(tool.requiredClaims);
        expect(meta.redactionClass).toBe('high');
      }
      // A throwing resolver is the constant protocol refusal with no leak,
      // and the provider is never invoked on that path.
      let providerCalls = 0;
      const counting = {
        ...h.adapter,
        invokeTool: (...args: unknown[]) => {
          providerCalls++;
          return (h.adapter.invokeTool as (...a: unknown[]) => Promise<unknown>)(...args);
        },
      };
      const server2 = await createEngramMemoryMcpServerV1(counting as never);
      const via2 = await server2.connectViaInMemory(async () => {
        throw new Error('PRIVATE_HOST_CONTEXT_PATH_AND_CREDENTIAL_CANARY /private/store');
      });
      try {
        await expect(via2.client.callTool({
          name: 'engram_memory_search', arguments: { query: 'needle', purpose_ref: 'purpose:one' },
        })).rejects.toThrow(/Trusted invocation context unavailable/);
        try {
          await via2.client.callTool({
            name: 'engram_memory_search', arguments: { query: 'needle', purpose_ref: 'purpose:one' },
          });
          expect.unreachable('resolver throw must refuse');
        } catch (error) {
          expect(String((error as Error)?.message ?? error)).not.toContain('CANARY');
        }
        expect(providerCalls).toBe(0);
      } finally {
        await via2.close();
      }
    } finally {
      await via.close();
    }
  });
});

export { buildHarness, stpCtx, captureArgs, hostBindings, plan, ELICITATION_REF, KEY };

function captureArgs(key: string) {
  return {
    idempotency_key: key,
    payload: {
      schema_version: 2, purpose_ref: 'purpose:one', valid_time: { t: 1 },
      components: [{ component_id: 'comp:one', kind: 'context', text: 'hello pipeline', citation_ids: ['cit:one'] }],
      primary_component_id: 'comp:one',
      primary_event: { at: 1, type_ref: 'type:one', citation_id: 'cit:one' },
      citations: [{ citation_id: 'cit:one', source_ref: 'src:one', locator: { scheme: 'document', value: 'doc#one' }, content_digest: D }],
    },
    evidence: { evidence_ref: 'ev:one', evidence_digest: D, citation_ids: ['cit:one'] },
  };
}
