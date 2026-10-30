/**
 * F3 + PW4 public-entry acceptance for `@sentropic/engram/mcp-memory` (0.23.0).
 *
 * F3 — SQLite plan co-sign condition (sqlite-plan-cosign-astra.out lines 52-58
 * and sqlite-plan-cosign-astra-r2.out lines 97-101): the existing host-storage
 * profile and receipts closure (`src/mcp/memory/topology.ts`,
 * `src/mcp/memory/receipts.ts`) becomes importable from the public entry —
 * additive, side-effect-free re-exports only, no new subpath, no frozen-byte
 * change.
 *
 * PW4 — authoritative staged-activation plan builder
 * (FASTTRACK-PRODUCER-DESIGN.md §1.4, based on
 * PRODUCER-ISSUANCE-CONTRACT.md and memory-host-composition spec.md §8):
 * `createManifestMemoryDispatchPlanV1(options?)` is a pure, synchronous,
 * store-free manifest-to-plan builder producing a validated, frozen
 * `McpMemoryDispatchPlanV1` from the frozen provider manifest, so a provider
 * can be activated (and then bound into the broker's compiled dispatch)
 * before any registry compile exists. This breaks the
 * compileMcpRegistry <-> createMemoryMcpProvider materialization cycle.
 *
 * The staged-activation fixtures adapt the MCP-L4 pipeline harness
 * (tests/mcp-memory-l4-pipeline.test.ts — real engine v2, real read facets,
 * real in-memory canonical store) with the hand-rolled plan() replaced by
 * the public builder. Only the read lane is exercised here; write ports are
 * preflight-shaped stubs, and the full write pipeline stays covered by the
 * pipeline suite.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CompiledMemoryDispatch } from '@sentropic/mcp-broker/memory';

// F3 + PW4 symbols under test: imported exclusively from the public entry.
import {
  ENGRAM_MEMORY_HOST_STORAGE_PROFILE_V1,
  MEMORY_HOST_STORAGE_RECEIPTS_V1_SCHEMA,
  MEMORY_PROVIDER_MANIFEST,
  MEMORY_TOOL_DESCRIPTORS,
  createEngramMemoryProviderV1,
  createManifestMemoryDispatchPlanV1,
  validateMemoryHostStorageReceiptsV1,
  type McpMemoryProviderOptions,
  type MemoryHostStorageProfileV1,
  type MemoryHostStorageReceiptsV1,
} from '../src/mcp-memory/index.js';
import { ENGRAM_MEMORY_CAPABILITY_GATES } from '../src/mcp/memory/gates.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL_NAMES = [
  'engram_memory_search',
  'engram_memory_get',
  'engram_memory_capture',
  'engram_memory_request_admission',
  'engram_memory_withdraw',
  'engram_memory_forget',
] as const;

// ---------------------------------------------------------------------------
// F3 — host-storage profile and receipts exports
// ---------------------------------------------------------------------------

describe('F3 host-storage profile and receipts exports', () => {
  it('exports the frozen host-storage profile with the co-signed shape', () => {
    const profile: MemoryHostStorageProfileV1 = ENGRAM_MEMORY_HOST_STORAGE_PROFILE_V1;
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.sentropic_host)).toBe(true);
    expect(Object.isFrozen(profile.h2a_host)).toBe(true);
    expect(profile.required_receipt_contract).toBe('MemoryHostStorageReceiptsV1');
    expect(profile.sentropic_host).toEqual({
      concrete_backend_status: 'unverified',
      independent_from_h2a: true,
      calls_h2a_endpoint: false,
      shares_store_with_h2a: false,
    });
    expect(profile.h2a_host).toEqual({
      concrete_backend: 'embedded-local-linux-sqlite',
      single_mcp_server_key: 'h2a',
      independent_from_sentropic: true,
      shares_store_with_sentropic: false,
    });
  });

  it('exports the closed receipts schema (additionalProperties: false at every object level)', () => {
    const schema = MEMORY_HOST_STORAGE_RECEIPTS_V1_SCHEMA as unknown as {
      type: string;
      additionalProperties: boolean;
      required: string[];
      properties: Record<string, { additionalProperties?: boolean; required?: string[] }>;
    };
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(Object.keys(schema.properties));
    expect(Object.keys(schema.properties).sort()).toEqual([
      'admin', 'backend', 'cross_host_memory_calls', 'custody', 'fence',
      'host', 'independent_store', 'maintenance', 'pagination', 'read_port_version',
      'recall_port_version', 'retention', 'schema_version', 'store_id',
    ]);
    for (const capability of ['backend', 'fence', 'custody', 'admin', 'retention', 'maintenance', 'pagination']) {
      const receipt = schema.properties[capability];
      expect(receipt.additionalProperties).toBe(false);
      expect(receipt.required).toEqual(['id', 'version', 'receipt_sha256']);
    }
  });

  const capability = (id: string) => ({ id, version: '1.0.0', receipt_sha256: 'a'.repeat(64) });
  const validReceipts = (): MemoryHostStorageReceiptsV1 => ({
    schema_version: 1,
    host: 'h2a',
    store_id: 'store:one',
    backend: capability('backend'),
    fence: capability('fence'),
    custody: capability('custody'),
    admin: capability('admin'),
    retention: capability('retention'),
    maintenance: capability('maintenance'),
    pagination: capability('pagination'),
    recall_port_version: 3,
    read_port_version: 1,
    independent_store: true,
    cross_host_memory_calls: false,
  });

  it('accepts a valid host-storage receipts bundle for either host', () => {
    expect(validateMemoryHostStorageReceiptsV1(validReceipts())).toEqual({ ok: true });
    expect(validateMemoryHostStorageReceiptsV1({ ...validReceipts(), host: 'sentropic' })).toEqual({ ok: true });
  });

  it('refuses invalid receipts bundles with the single closed reason', () => {
    const invalid: unknown[] = [
      { ...validReceipts(), schema_version: 2 },
      { ...validReceipts(), host: 'third-party' },
      { ...validReceipts(), recall_port_version: 2 },
      { ...validReceipts(), read_port_version: 2 },
      { ...validReceipts(), independent_store: false },
      { ...validReceipts(), cross_host_memory_calls: true },
      { ...validReceipts(), store_id: '' },
      { ...validReceipts(), store_id: 123 },
      { ...validReceipts(), backend: { ...capability('backend'), receipt_sha256: 'not-a-digest' } },
      { ...validReceipts(), backend: { ...capability('backend'), version: '' } },
      { ...validReceipts(), backend: { ...capability('backend'), extra: 'field' } },
      { ...validReceipts(), unexpected: 'top-level' },
      (() => { const missing = validReceipts() as Record<string, unknown>; delete missing.fence; return missing; })(),
    ];
    invalid.forEach((value, index) => {
      expect(validateMemoryHostStorageReceiptsV1(value), `invalid receipts case ${index}`).toEqual({
        ok: false,
        reason: 'Invalid host storage/fence/custody receipt',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// PW4 — public compiled-plan builder with staged activation
// ---------------------------------------------------------------------------

describe('PW4 manifest dispatch plan builder output and determinism', () => {
  it('builds a frozen plan resolving all six frozen tools with exact descriptor values', () => {
    const plan = createManifestMemoryDispatchPlanV1();
    expect(typeof plan.resolveTool).toBe('function');
    expect(Object.isFrozen(plan)).toBe(true);
    for (const descriptor of MEMORY_TOOL_DESCRIPTORS) {
      const resolved = plan.resolveTool(descriptor.name);
      expect(resolved).toBeDefined();
      expect(resolved!.providerId).toBe(MEMORY_PROVIDER_MANIFEST.providerId);
      expect(resolved!.capabilityName).toBe(descriptor.name);
      expect(resolved!.requiredScopes).toEqual([...descriptor.requiredScopes]);
      expect(resolved!.requiredClaims).toEqual([...descriptor.requiredClaims]);
      expect(resolved!.entry.gates.requiresHumanConfirmation)
        .toBe(ENGRAM_MEMORY_CAPABILITY_GATES[descriptor.name as (typeof TOOL_NAMES)[number]].requiresHumanConfirmation);
      expect(resolved!.entry.gates.requiresElicitation)
        .toBe(ENGRAM_MEMORY_CAPABILITY_GATES[descriptor.name as (typeof TOOL_NAMES)[number]].requiresElicitation);
    }
    expect(plan.resolveTool('engram_memory_unknown')).toBeUndefined();
    expect(plan.resolveTool('')).toBeUndefined();
  });

  it('is deterministic: same inputs give the same plan resolution digest', () => {
    const probe = (plan: ReturnType<typeof createManifestMemoryDispatchPlanV1>) =>
      JSON.stringify([...TOOL_NAMES, 'engram_memory_unknown'].map((name) => plan.resolveTool(name)));
    const a = createHash('sha256').update(probe(createManifestMemoryDispatchPlanV1())).digest('hex');
    const b = createHash('sha256').update(probe(
      createManifestMemoryDispatchPlanV1({ sourceId: 'mcp:engram-memory', manifest: MEMORY_PROVIDER_MANIFEST }),
    )).digest('hex');
    expect(b).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses drifted manifests and foreign source ids at construction', () => {
    // Guard against vacuous passes: every drift case below must reach a real
    // builder (a missing export would otherwise turn each case into a
    // TypeError that toThrow() still accepts).
    expect(typeof createManifestMemoryDispatchPlanV1).toBe('function');
    const drifted = (mutate: (manifest: Record<string, unknown>) => void): unknown => {
      const manifest = structuredClone(MEMORY_PROVIDER_MANIFEST) as Record<string, unknown>;
      mutate(manifest);
      return manifest;
    };
    const driftedTool = (index: number, mutate: (tool: Record<string, unknown>) => void): unknown =>
      drifted((m) => { mutate((m.tools as Record<string, unknown>[])[index]); });
    const driftedToolGates = (index: number, mutate: (gates: Record<string, unknown>) => void): unknown =>
      driftedTool(index, (tool) => { mutate(tool.gates as Record<string, unknown>); });
    expect(() => createManifestMemoryDispatchPlanV1({
      manifest: driftedToolGates(0, (g) => { g.requiresHumanConfirmation = true; }) as never,
    })).toThrow(/drifted from the frozen L0/);
    expect(() => createManifestMemoryDispatchPlanV1({
      manifest: driftedToolGates(0, (g) => { g.requiresPolicy = false; }) as never,
    })).toThrow(/drifted from the frozen L0/);
    expect(() => createManifestMemoryDispatchPlanV1({
      manifest: driftedToolGates(0, (g) => { g.requiresPrincipalGate = true; }) as never,
    })).toThrow(/drifted from the frozen L0/);
    expect(() => createManifestMemoryDispatchPlanV1({
      manifest: driftedTool(0, (tool) => { tool.description = 'Drifted description.'; }) as never,
    })).toThrow(/drifted from the frozen L0/);
    expect(() => createManifestMemoryDispatchPlanV1({
      manifest: driftedTool(0, (tool) => { tool.inputSchema = { type: 'object' }; }) as never,
    })).toThrow(/drifted from the frozen L0/);
    expect(() => createManifestMemoryDispatchPlanV1({
      manifest: driftedTool(0, (tool) => { tool.extra_field = 'extra'; }) as never,
    })).toThrow(/drifted from the frozen L0/);
    expect(() => createManifestMemoryDispatchPlanV1({
      manifest: drifted((m) => { m.appId = 'other.app'; }) as never,
    })).toThrow(/drifted from the frozen L0/);
    expect(() => createManifestMemoryDispatchPlanV1({
      manifest: drifted((m) => { (m.tools as unknown[]).pop(); }) as never,
    })).toThrow(/frozen L0/);
    expect(() => createManifestMemoryDispatchPlanV1({
      manifest: driftedTool(0, (tool) => { (tool.requiredClaims as unknown[]) = ['sub']; }) as never,
    })).toThrow(/drifted from the frozen L0/);
    expect(() => createManifestMemoryDispatchPlanV1({
      manifest: drifted((m) => { m.providerId = 'other.provider'; }) as never,
    })).toThrow(/drifted from the frozen L0/);
    expect(() => createManifestMemoryDispatchPlanV1({
      manifest: drifted((m) => {
        (m.tools as unknown[]).push((m.tools as unknown[])[0]);
      }) as never,
    })).toThrow(/frozen L0/);
    expect(() => createManifestMemoryDispatchPlanV1({
      sourceId: 'mcp:other' as never,
    })).toThrow(/unsupported sourceId/);
  });
});

// ---------------------------------------------------------------------------
// PW4 — staged activation: manifest plan -> provider activation -> broker
// compiled dispatch, with no pre-existing registry compile anywhere.
// Fixtures adapted from tests/mcp-memory-l4-pipeline.test.ts.
// ---------------------------------------------------------------------------

const NOW = '2026-08-16T12:34:56.789Z';
const DEADLINE = '2026-08-16T12:35:16.789Z';
const D = 'sha256:' + '0'.repeat(64);

function binding(): Record<string, unknown> {
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
    audit_id: 'audit:pw4', correlation_ref: 'corr:one', deadline_at: DEADLINE,
    cancellation_ref: 'cancel:one', issued_at: NOW, channel_binding: 'in_process_verified',
    transport_scopes: ['mcp:tools:invoke'], neutral_credential: 'credential:one',
  };
}

function stpCtx() {
  const b = binding();
  return {
    requestId: 'req:one', correlationId: 'corr:one', auditId: b.audit_id,
    principal: { sub: 'alice', claims: { sub: 'alice', tid: 'tenant:one' }, scopes: ['mcp:tools:invoke'], tenantRef: 'tenant:one', authTime: NOW },
    surface: 'backend', mcpClient: { clientId: 'client:one', client: 'test' },
    session: { mcpSessionId: 'session:one' }, tenantRef: 'tenant:one',
    connectorInstanceId: 'connector:one', consentRefs: [], grantRefs: [],
    getSecret: async () => { throw new Error('no secret'); }, connectorConfig: {},
    audit: { emit: async () => {} }, logger: {},
    memory: { binding: b, expectedActiveGeneration: '1', expectedPolicyEpoch: '1', now: NOW },
  };
}

function hostBindings() {
  return {
    profileBindings: {
      wireProfileId: 'sentropic.engram.memory-wire/v1',
      wireProfileSha256: '19cd5fd28c4412c11e9a52061c0584549b3abc4dc136fccf92e6c16ddfc7c974',
      toolSchemaProfileId: 'sentropic.engram.memory-tools/2020-12-v1',
      toolSchemaProfileSha256: '5ea308592fae260753230a48329e0300968edc642305288aedc7caa02c3a3ad0',
      parameterProfileId: 'sentropic.parameters/2020-12-bounded-v1', parameterSchemaVersion: '1.0.0',
      parameterProfileSha256: 'c9edd6402957c92f96c7461f30f29b64801c6f17c224c4258984e6ee3beaca47',
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

async function buildManifestPlanHarness() {
  const { createMemoryPortV2 } = await import('../engram-memory/dist/engine.js');
  const { createMemoryReadFacetsV1 } = await import('../engram-memory/dist/reads.js');
  const { createInMemoryCanonicalMemoryStoreV1 } = await import('../engram-memory/dist/memory-store.js');
  const { receiptDigest } = await import('../engram-memory/digests.js');
  const { createMemoryReadPageStoreV1 } = await import('../src/memory-tools/reads.js');

  const clock = { now: () => NOW };
  const authorization = {
    version: 1 as const,
    async authorize(request: { operation: string; resource_digest: string }) {
      const body = {
        allowed: true as const, decision_id: 'decision:pw4', policy_version: '1',
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
  const admission_policy = {
    policy_id: 'policy:pw4', policy_version: '1',
    async decide(request: { record_digest: string }) {
      const body = { policy_id: 'policy:pw4', policy_version: '1', record_digest: request.record_digest, decision: 'accept' as const, issued_at: NOW };
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
    verifier_id: 'verifier:pw4',
    verifier_version: '1',
    async classify(request: { payload_digest: string; evidence: { evidence_ref: string } }) {
      const body = {
        class: 'earned' as const,
        evidence_digest: D,
        verifier_id: 'verifier:pw4',
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
  const ports = { authorization, admission_policy, crypto, evidence_verifier };

  const store = createInMemoryCanonicalMemoryStoreV1({ clock, store_id: 'store:one' });
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
  const facets = {
    scope_ref: 'scope:one', store_id: 'store:one',
    recallPort: readFacets.recallPort, readPort: readFacets.readPort,
    engine: {
      version: 2 as const,
      capture: async () => { throw new Error('unused in the PW4 suite'); },
      requestAdmission: async () => { throw new Error('unused in the PW4 suite'); },
      transition: async () => { throw new Error('unused in the PW4 suite'); },
    },
  };
  const readHost = {
    clock,
    authenticate: async () => true,
    authorize: async () => true,
    authorizeContinuation: async () => true,
    pages: createMemoryReadPageStoreV1({ clock, ttl_ms: 60000, max_entries: 100 }),
  };
  const unusedReservation = async () => { throw new Error('unused in the PW4 suite'); };
  const writeHost = {
    clock,
    authenticate: async () => true,
    authorize: async () => true,
    reservation: {
      reserveOrLoad: unusedReservation,
      attachConfirmation: unusedReservation,
      claimFencedExecution: unusedReservation,
      reconcileCanonicalOutcome: unusedReservation,
      recordCompletion: unusedReservation,
    },
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
    confirm: async () => true,
    keyCustody: { confirmDestroyed: async () => true },
    coverage: { verify: async () => ({ complete: false }) },
  };

  // Stage 1: the manifest-derived plan, built before any registry compile.
  const plan = createManifestMemoryDispatchPlanV1();
  // Stage 2: provider activation consumes the manifest plan (the factory
  // itself binds the broker compiled dispatch over it at the end).
  const adapter = createEngramMemoryProviderV1({
    readFacets: facets as unknown as McpMemoryProviderOptions['readFacets'],
    writeFacets: facets as unknown as McpMemoryProviderOptions['writeFacets'],
    readHost: readHost as unknown as McpMemoryProviderOptions['readHost'],
    writeHost: writeHost as unknown as McpMemoryProviderOptions['writeHost'],
    policyId: 'policy:one',
    hostBindings: hostBindings() as unknown as McpMemoryProviderOptions['hostBindings'],
    plan: plan as unknown as McpMemoryProviderOptions['plan'],
    sourceId: 'mcp:engram-memory',
    generation: '1',
  });
  return { adapter, plan };
}

describe('PW4 staged activation breaks the registry compile cycle', () => {
  it('activates the provider from the manifest plan alone and serves one end-to-end search', async () => {
    const { adapter } = await buildManifestPlanHarness();
    const listed = await adapter.listCapabilities(stpCtx() as never);
    expect(listed.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
    const search = await adapter.invokeTool({
      capabilityRef: 'engram_memory_search',
      input: { query: 'needle', purpose_ref: 'purpose:one' },
      ctx: stpCtx(),
    } as never) as { ok: boolean; auditId?: string };
    expect(search.ok).toBe(true);
    expect(search.auditId).toBe('audit:pw4');
  }, 30_000);

  it('binds the materialized adapter into the broker compiled dispatch without a materialization cycle', async () => {
    const { adapter, plan } = await buildManifestPlanHarness();
    const brokerPlan = createManifestMemoryDispatchPlanV1();
    const dispatch = new CompiledMemoryDispatch({
      plan: brokerPlan,
      adapters: [adapter],
      sourceId: 'mcp:engram-memory',
      generation: '1',
    });
    expect(typeof dispatch.select).toBe('function');
    // Byte-equality between the staged plan and the broker-compiled plan over
    // the full six-tool resolution projection.
    for (const name of TOOL_NAMES) {
      expect(JSON.stringify(brokerPlan.resolveTool(name))).toBe(JSON.stringify(plan.resolveTool(name)));
    }
    // Real selections through the external dispatch: for every tool the
    // broker-compiled plan and the staged plan drive byte-identical broker
    // selections and context projections through CompiledMemoryDispatch.
    const stagedDispatch = new CompiledMemoryDispatch({
      plan,
      adapters: [adapter],
      sourceId: 'mcp:engram-memory',
      generation: '1',
    });
    const selectInput = (name: (typeof TOOL_NAMES)[number]) =>
      ({
        toolName: name,
        ctx: stpCtx(),
        purposeRef: 'purpose:one',
        ...(name === 'engram_memory_capture' || name === 'engram_memory_request_admission' ||
            name === 'engram_memory_withdraw' || name === 'engram_memory_forget'
          ? { idempotencyKey: 'idempotency:pw4:0001' }
          : {}),
        ...(name === 'engram_memory_withdraw' || name === 'engram_memory_forget'
          ? { elicitationRef: 'elicit:pw4' }
          : {}),
        expectedPrincipalSub: 'alice',
        expectedTenantRef: 'tenant:one',
        expectedSourceId: 'mcp:engram-memory',
        expectedGeneration: '1',
      }) as unknown as Parameters<CompiledMemoryDispatch['select']>[0];
    for (const name of TOOL_NAMES) {
      const input = selectInput(name);
      const selected = dispatch.select(input);
      expect(selected.adapter).toBe(adapter);
      const stagedSelected = stagedDispatch.select(input);
      expect(JSON.stringify(selected.selection)).toBe(JSON.stringify(stagedSelected.selection));
      expect(JSON.stringify(selected.projection)).toBe(JSON.stringify(stagedSelected.projection));
      expect(selected.auditRef).toBe(stagedSelected.auditRef);
      const staged = plan.resolveTool(name);
      expect(selected.selection.capabilityName).toBe(staged!.capabilityName);
      expect(selected.selection.providerId).toBe(staged!.providerId);
      expect(selected.selection.requiredScopes).toEqual([...staged!.requiredScopes]);
      expect(selected.selection.requiredClaims).toEqual([...staged!.requiredClaims]);
      expect(selected.selection.confirmationRequired).toBe(
        name === 'engram_memory_withdraw' || name === 'engram_memory_forget' ||
        staged!.entry.gates.requiresHumanConfirmation || staged!.entry.gates.requiresElicitation,
      );
      expect(selected.projection.purpose_ref).toBe('purpose:one');
      expect(selected.projection.envelope_bindings.idempotency_key).toBe(
        name === 'engram_memory_search' || name === 'engram_memory_get'
          ? undefined
          : 'idempotency:pw4:0001',
      );
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Packed tarball: the F3 + PW4 closure ships in the published bytes.
// ---------------------------------------------------------------------------

describe('packed tarball ships the F3 + PW4 public closure', () => {
  const missing = existsSync(join(root, 'dist', 'mcp-memory.js'))
    ? []
    : ['dist/mcp-memory.js is absent (run a clean build before the packed lane)'];

  it.skipIf(missing.length > 0)(
    `imports the F3 symbols and the PW4 builder from the packed entry (${missing.join('; ')})`,
    () => {
      const directory = mkdtempSync(join(tmpdir(), 'mcp-memory-f3-pw4-packed-'));
      const env = { ...process.env, npm_config_offline: 'true', npm_config_ignore_scripts: 'true' };
      try {
        const packed = JSON.parse(execFileSync(
          'npm',
          ['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', directory],
          { cwd: root, env, encoding: 'utf8' },
        )) as { filename: string }[];
        const consumer = join(directory, 'consumer');
        const installed = join(consumer, 'node_modules', '@sentropic', 'engram');
        mkdirSync(installed, { recursive: true });
        execFileSync('tar', ['-xf', join(directory, packed[0].filename), '--strip-components=1', '-C', installed], { env });
        // The two optional peers are host-supplied in any real installation.
        for (const peer of ['mcp-broker', 'mcp-platform']) {
          symlinkSync(join(root, 'node_modules', '@sentropic', peer), join(consumer, 'node_modules', '@sentropic', peer), 'dir');
        }
        writeFileSync(join(consumer, 'package.json'), '{"type":"module"}');
        const probe = `
          import assert from 'node:assert/strict';
          const entry = await import('@sentropic/engram/mcp-memory');
          assert.equal(typeof entry.ENGRAM_MEMORY_HOST_STORAGE_PROFILE_V1, 'object');
          assert.ok(Object.isFrozen(entry.ENGRAM_MEMORY_HOST_STORAGE_PROFILE_V1));
          assert.equal(entry.ENGRAM_MEMORY_HOST_STORAGE_PROFILE_V1.h2a_host.concrete_backend, 'embedded-local-linux-sqlite');
          assert.equal(typeof entry.MEMORY_HOST_STORAGE_RECEIPTS_V1_SCHEMA, 'object');
          assert.equal(typeof entry.validateMemoryHostStorageReceiptsV1, 'function');
          assert.equal(entry.validateMemoryHostStorageReceiptsV1('not-a-receipt').ok, false);
          assert.equal(typeof entry.createManifestMemoryDispatchPlanV1, 'function');
          const plan = entry.createManifestMemoryDispatchPlanV1();
          assert.ok(Object.isFrozen(plan));
          const resolved = plan.resolveTool('engram_memory_search');
          assert.equal(resolved.providerId, 'sentropic.engram.memory');
          assert.equal(resolved.capabilityName, 'engram_memory_search');
          assert.equal(resolved.entry.gates.requiresHumanConfirmation, false);
          assert.equal(plan.resolveTool('engram_memory_unknown'), undefined);
          console.log('packed f3-pw4 closure passed');
        `;
        writeFileSync(join(consumer, 'probe.mjs'), probe);
        const out = execFileSync(process.execPath, ['probe.mjs'], { cwd: consumer, env, encoding: 'utf8' });
        expect(out).toContain('packed f3-pw4 closure passed');
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
