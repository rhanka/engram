/**
 * L4 shared-provenance packed proof (Node only).
 *
 * Builds a consumer from the REAL packed tarball and drives one capture
 * across the two public entries that share the private provenance registry:
 * the store is opened through `@sentropic/engram/mcp-memory`
 * (`createInMemoryCanonicalMemoryStoreV1`, the only in-memory store opener
 * any public entry provides — the substrate entry's own opener needs a host
 * neutral backend no public entry supplies), the canonical engine is created
 * through `@sentropic/engram/memory-substrate` (`createMemoryPortV2`), and
 * the provider + MCP server are built through `@sentropic/engram/mcp-memory`.
 * The capture must succeed: with duplicated registries the substrate engine
 * refuses the foreign store with CAPABILITY_UNAVAILABLE; with one shared
 * registry it admits it.
 *
 * Also asserts the static invariant over the PACKED dist: the provenance
 * WeakSets are defined in exactly one ESM module file.
 *
 * Fenced-store case (MINOR): the store is opened through the substrate entry
 * (`openModuleStorageCanonicalMemoryStoreV1` over the neutral acceptance
 * backend), then engine, facets and server come from the mcp-memory entry
 * with the unfenced exemption disabled. Old archive: CAPABILITY_UNAVAILABLE;
 * new archive: capture succeeds.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packCandidate, p3ArchivePaths, verifyP3Archives } from './mcp-memory-l4-packed-acceptance.mjs';
import { L4_R5_SHA256, L4_R5_TARBALL_REL as L4_R5_TARBALL, L4_R9_SHA256, L4_R9_TARBALL_REL as L4_R9_TARBALL } from './mcp-memory-l4-local-prereqs.mjs';
import { pinnedContractDigest, tarballAcceptanceBackendSources } from './substrate-tarball-acceptance.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

/** Frozen L4 archives under test: r5 (pre-fix) must refuse, r9 (fix) must capture (paths shared with the local-prereqs gate). */

const NPM = process.env.MCP_L4_NPM_BIN ?? '/home/antoinefa/.npm-global/bin/npm';
const SDK_PINNED = '1.32.2';

function installConsumer(consumerDir, tarball, extraArchives, cacheDir) {
  mkdirSync(consumerDir, { recursive: true });
  writeFileSync(join(consumerDir, 'package.json'), JSON.stringify({ name: 'l4-shared-provenance-consumer', version: '0.0.0', type: 'module' }));
  const args = ['install', '--no-save', '--no-audit', '--no-fund', '--omit=optional', tarball, ...extraArchives, `@modelcontextprotocol/sdk@${SDK_PINNED}`];
  const result = spawnSync(NPM, args, { cwd: consumerDir, env: { ...process.env, npm_config_cache: cacheDir }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const out = (result.stdout ?? '') + (result.stderr ?? '');
  if (result.status !== 0) throw new Error('shared-provenance consumer install failed: ' + out);
}

function packedEsmModules(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.map')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'studio-app') continue;
      packedEsmModules(full, out);
      continue;
    }
    if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** Provenance WeakSet definitions in the INSTALLED (packed) dist. */
export function packedProvenanceDefiners(installedRoot) {
  const dist = join(installedRoot, 'node_modules/@sentropic/engram/dist');
  const patterns = [
    /fencedFactoryStores\s*=\s*(?:\/\*[^*]*\*\/\s*)?new WeakSet/,
    /inMemoryStores\s*=\s*(?:\/\*[^*]*\*\/\s*)?new WeakSet/,
  ];
  const byPattern = patterns.map((pattern) =>
    packedEsmModules(dist)
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(dist.length + 1)),
  );
  return { fenced: byPattern[0], inMemory: byPattern[1] };
}

/**
 * Cross-entry capture probe, copied into the isolated consumer and run
 * against the installed packed entries only. Mirrors the pipeline suite's
 * real-host harness, except the engine seam: store via `mcp-memory`, engine
 * via `memory-substrate`, provider + server via `mcp-memory`.
 */
const SHARED_PROVENANCE_PROBE = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const substrate = await import('@sentropic/engram/memory-substrate');
const mcp = await import('@sentropic/engram/mcp-memory');
const memoryTools = await import('@sentropic/engram/memory-tools');

const NOW = '2026-08-16T12:34:56.789Z';
const DEADLINE = '2026-08-16T12:35:16.789Z';
const D = 'sha256:' + '0'.repeat(64);
const KEY = (c) => c.repeat(32);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const PKG = path.join(HERE, 'node_modules/@sentropic/engram');

function binding(overrides = {}) {
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
    audit_id: 'audit:shared-provenance', correlation_ref: 'corr:one', deadline_at: DEADLINE,
    cancellation_ref: 'cancel:one', issued_at: NOW, channel_binding: 'in_process_verified',
    transport_scopes: ['mcp:tools:invoke'], neutral_credential: 'credential:one',
    ...overrides,
  };
}

function stpCtx(bindingOverrides = {}, extra = {}) {
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

function captureArgs(key = KEY('a')) {
  return {
    idempotency_key: key,
    payload: {
      schema_version: 2, purpose_ref: 'purpose:one', valid_time: { t: 1 },
      components: [{ component_id: 'comp:one', kind: 'context', text: 'hello shared provenance', citation_ids: ['cit:one'] }],
      primary_component_id: 'comp:one',
      primary_event: { at: 1, type_ref: 'type:one', citation_id: 'cit:one' },
      citations: [{ citation_id: 'cit:one', source_ref: 'src:one', locator: { scheme: 'document', value: 'doc#one' }, content_digest: D }],
    },
    evidence: { evidence_ref: 'ev:one', evidence_digest: D, citation_ids: ['cit:one'] },
  };
}

const FULL_ALLOWLIST = [
  '/authorization_receipt_digest', '/citations', '/components', '/derivation', '/payload_digest',
  '/primary_component_id', '/primary_event', '/purpose_ref', '/reconciliation', '/record_digest',
  '/record_id', '/recorded_at', '/recorded_cursor', '/retention', '/schema_version', '/scope_ref',
  '/trust', '/valid_time',
];

function engineDeps(receiptDigest, clock) {
  const authorization = {
    version: 1,
    async authorize(request) {
      assert.equal(request.context.credential, 'credential:one');
      const body = {
        allowed: true, decision_id: 'decision:shared', policy_version: '1',
        operation: request.operation, resource_digest: request.resource_digest,
        scope_ref: 'scope:one', not_before: NOW, expires_at: DEADLINE,
        revocation_epoch: '0',
        redaction: { mode: 'field-allowlist', allowed_fields: FULL_ALLOWLIST, allow_derivation_lineage: false, max_packet_bytes: 1048576 },
        authentication_receipt_digest: D,
      };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest('authorization-allowed', body) } };
    },
    async revalidate(receiptDigestValue, checkedAt) {
      const body = { receipt_digest: receiptDigestValue, checked_at: checkedAt, valid: true, current_revocation_epoch: '0', reason: 'valid' };
      return { ok: true, value: { ...body, revalidation_receipt_digest: receiptDigest('authorization-revalidation', body, 'revalidation_receipt_digest') } };
    },
    async redact() { throw new Error('unused'); },
  };
  const policy = {
    policy_id: 'policy:shared', policy_version: '1',
    async decide(request) {
      const body = { policy_id: 'policy:shared', policy_version: '1', record_digest: request.record_digest, decision: 'accept', issued_at: NOW };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest('admission-decision', body) } };
    },
  };
  const plaintext = new Map();
  const crypto = {
    version: 1,
    async seal(input) {
      plaintext.set(input.candidate_id, input.plaintext);
      const body = { candidate_id: input.candidate_id, envelope_ref: 'envelope:' + input.candidate_id, key_ref: 'key:' + input.candidate_id, ciphertext: 'ciphertext:' + input.candidate_id };
      return { ok: true, value: { ...body, envelope_digest: receiptDigest('sealed-candidate', body) } };
    },
    async open(input) {
      const value = plaintext.get(input.sealed.candidate_id);
      return value === undefined
        ? { ok: false, error: { code: 'UNAUTHORIZED', operation: 'inspect_candidate', message: 'destroyed', retryable: false } }
        : { ok: true, value: { plaintext: value } };
    },
    async destroy(input) {
      const body = { destroyed: true, key_ref: input.key_ref };
      return { ok: true, value: { destroyed: true, receipt_digest: receiptDigest('key-destruction', body) } };
    },
    async rotate() { throw new Error('unused'); },
  };
  const evidence_verifier = {
    version: 1, verifier_id: 'verifier:shared', verifier_version: '1',
    async classify(request) {
      const body = { class: 'earned', evidence_digest: D, verifier_id: 'verifier:shared', verifier_version: '1', issued_at: NOW, revocation_epoch: '0' };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest('earned-trust', { ...body, payload_digest: request.payload_digest }) } };
    },
    async revalidate(binding_receipt_digest, checked_at) {
      const body = { binding_receipt_digest, checked_at, valid: true, current_revocation_epoch: '0', reason: 'valid' };
      return { ok: true, value: { ...body, revalidation_receipt_digest: receiptDigest('trust-revalidation', body, 'revalidation_receipt_digest') } };
    },
  };
  return { authorization, admission_policy: policy, crypto, evidence_verifier };
}
`;

const SHARED_PROVENANCE_TAIL = `
const failPort = (error_code, message) => ({ ok: false, error_code, message });

const clock = { now: () => NOW };
// Store opened through the mcp-memory entry (the only in-memory store opener
// any public entry provides); the engine below comes from the substrate entry.
const store = mcp.createInMemoryCanonicalMemoryStoreV1({ clock, store_id: 'store:one' });
const ports = engineDeps(mcp.receiptDigest, clock);
const engine = substrate.createMemoryPortV2({
  canonical_store: store, authorization: ports.authorization,
  admission_policy: ports.admission_policy, crypto: ports.crypto,
  evidence_verifier: ports.evidence_verifier, activity_sources: [],
  clock, allow_unfenced_memory_store: true,
});
const readFacets = mcp.createMemoryReadFacetsV1(
  { canonical_store: store, ...ports, activity_sources: [], clock, allow_unfenced_memory_store: true },
  { scope_ref: 'scope:one', store_id: 'store:one' },
);
const facets = {
  scope_ref: 'scope:one', store_id: 'store:one',
  recallPort: readFacets.recallPort, readPort: readFacets.readPort, engine,
};

const stored = new Map();
const byRef = (ref) => [...stored.values()].find((entry) => entry.preimage.reservation_ref === ref);
const isOpaque = (s) => typeof s === 'string' && s.length >= 1 && s.length <= 512;
const reservation = {
  async reserveOrLoad(lookupKey, candidate) {
    const key = JSON.stringify(lookupKey);
    const existing = stored.get(key);
    if (existing) return { ok: true, value: existing };
    if (!mcp.validateMemoryMutationPreimageV1(candidate).ok) return failPort('INVALID_SCHEMA', 'candidate preimage is not closed');
    const digest = mcp.computeMemoryMutationOperationDigestV1(candidate);
    if (!digest.ok) return failPort(digest.error_code, 'candidate digest failed');
    const versions = mcp.projectMemoryMutationPolicyVersionsV1(candidate.effective_input);
    if (!versions.ok) return failPort(versions.error_code, 'candidate policy versions failed');
    const entry = {
      lookup_key: lookupKey, preimage: candidate, operation_digest: digest.value.operation_digest,
      policy_versions: versions.value, recovery_state: 'authorized_uncommitted',
      audit_id: 'reservation-audit:' + candidate.reservation_ref, execution_generation: '0',
    };
    stored.set(key, entry);
    return { ok: true, value: entry };
  },
  async attachConfirmation(reservationRef, confirmationRef, operationDigest) {
    const entry = byRef(reservationRef);
    if (!entry) return failPort('NOT_FOUND', 'unknown reservation');
    if (entry.operation_digest !== operationDigest) return failPort('INVALID_SCHEMA', 'confirmation digest mismatch');
    if (!isOpaque(confirmationRef)) return failPort('INVALID_SCHEMA', 'confirmation ref is not opaque');
    const next = { ...entry, confirmation_ref: confirmationRef };
    stored.set(JSON.stringify(next.lookup_key), next);
    return { ok: true, value: next };
  },
  async claimFencedExecution(reservationRef, executionGeneration) {
    const entry = byRef(reservationRef);
    if (!entry) return failPort('NOT_FOUND', 'unknown reservation');
    if (entry.recovery_state !== 'authorized_uncommitted') return failPort('INVALID_SCHEMA', 'reservation is not claimable');
    const next = { ...entry, recovery_state: 'executing_unknown_outcome', execution_generation: executionGeneration };
    stored.set(JSON.stringify(next.lookup_key), next);
    return { ok: true, value: next };
  },
  async reconcileCanonicalOutcome(reservationRef, canonicalReplayRef) {
    const entry = byRef(reservationRef);
    if (!entry) return failPort('NOT_FOUND', 'unknown reservation');
    if (!isOpaque(canonicalReplayRef)) return failPort('INVALID_SCHEMA', 'replay ref is not opaque');
    const next = { ...entry, recovery_state: 'canonical_committed_receipt', canonical_replay_ref: canonicalReplayRef };
    stored.set(JSON.stringify(next.lookup_key), next);
    return { ok: true, value: next };
  },
  async recordCompletion(reservationRef, output) {
    const entry = byRef(reservationRef);
    if (!entry) return failPort('NOT_FOUND', 'unknown reservation');
    if (!isOpaque(entry.canonical_replay_ref) || entry.recovery_state !== 'canonical_committed_receipt') {
      return failPort('INVALID_SCHEMA', 'reservation has no canonical commitment to complete');
    }
    const next = { ...entry, recovery_state: 'completed_response', stored_output: output };
    stored.set(JSON.stringify(next.lookup_key), next);
    return { ok: true, value: next };
  },
};

const readHost = {
  clock,
  authenticate: async (ctx, tool) => ctx.scope_ref === 'scope:one' && ctx.store_id === 'store:one',
  authorize: async (ctx, tool, purpose) => ctx.scope_ref === 'scope:one' && purpose === 'purpose:one',
  authorizeContinuation: async () => true,
  pages: memoryTools.createMemoryReadPageStoreV1({ clock, ttl_ms: 60000, max_entries: 100 }),
};
const writeHost = {
  clock,
  authenticate: readHost.authenticate,
  authorize: async (ctx, tool, purpose) => {
    if (ctx.scope_ref !== 'scope:one') return false;
    if (tool === 'engram_memory_capture') return purpose === 'purpose:one';
    return true;
  },
  reservation,
  audit: { append: async () => {} },
  policy: {
    capturePolicyVersion: async () => 'capture-policy/v1',
    admissionPolicyVersion: async () => 'admission-policy/v1',
    retention: { max_retention_days: 30, allow_retain_derivative_rule: false },
    reconciliation: { consented_family_refs: [] },
    anchorKindRef: 'memory:lifecycle',
    provenanceDigest: async () => D,
    nextSourceOrder: async () => ({ source_ref: 'source:host', sequence: '1' }),
  },
  confirm: async () => true,
  keyCustody: { confirmDestroyed: async () => true },
  coverage: { verify: async () => ({ complete: false }) },
};

const assetBytes = (rel) => fs.readFileSync(path.join(PKG, rel));
const assetSha = (rel) => createHash('sha256').update(assetBytes(rel)).digest('hex');
const hostBindings = {
  profileBindings: {
    wireProfileId: 'sentropic.engram.memory-wire/v1', wireProfileSha256: assetSha('dist/registry/wire-profile.json'),
    toolSchemaProfileId: 'sentropic.engram.memory-tools/2020-12-v1', toolSchemaProfileSha256: assetSha('dist/registry/tool-schema-profile.json'),
    parameterProfileId: 'sentropic.parameters/2020-12-bounded-v1', parameterSchemaVersion: '1.0.0', parameterProfileSha256: assetSha('dist/registry/parameter-schema.json'),
  },
  hostBindingRef: 'shared-provenance',
  invocation: { contractVersion: '1.0.0' },
  authorization: { contractVersion: '1.0.0' },
  domainPolicy: { contractVersion: '1.0.0' },
  engine: {
    mutationPortVersion: 2, recallPortVersion: 3, readPortVersion: 1,
    engineId: 'shared-engine', canonicalStoreId: 'store:one', fenceProvenanceId: 'fence:shared',
  },
  mutationRecovery: { contractVersion: '1.0.0', digestProfile: 'sentropic.engram.memory-mutation/v1' },
  confirmation: { contractVersion: '1.0.0', enrolledOidcDomain: 'sent-tech.ca' },
  audit: { contractVersion: '1.0.0' },
  pagination: { contractVersion: '1.0.0', engramOwnsSigningSecret: false },
  lifecycle: { contractVersion: '1.0.0' },
};
const plan = {
  resolveTool: (name) => {
    const descriptor = mcp.MEMORY_PROVIDER_MANIFEST.tools.find((c) => c.name === name);
    if (descriptor === undefined) return undefined;
    return {
      providerId: descriptor.providerId ?? 'sentropic.engram.memory',
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

const provider = mcp.createEngramMemoryProviderV1({
  readFacets: facets, writeFacets: facets, readHost, writeHost, policyId: 'policy:one',
  hostBindings, plan, sourceId: 'mcp:engram-memory', generation: '1',
});
const server = await mcp.createEngramMemoryMcpServerV1(provider);
const out = await server.callTool('engram_memory_capture', captureArgs(KEY('a')), stpCtx(), { idempotencyKey: KEY('a') });
const envelope = out.structuredContent;
console.log(JSON.stringify({ ok: envelope.ok === true, code: envelope.ok === true ? null : envelope.error?.code ?? null }));
if (envelope.ok !== true) process.exit(3);
`;

/**
 * Pack the candidate, install one isolated consumer (tarball + P3 peer
 * archives + pinned SDK) and run the cross-entry capture probe plus the
 * packed-dist static invariant.
 */
export async function runSharedProvenancePacked() {
  const work = mkdtempSync(join(tmpdir(), 'l4-shared-provenance-'));
  try {
    const manifest = verifyP3Archives();
    const packed = packCandidate(work);
    const consumerDir = join(work, 'consumer');
    installConsumer(consumerDir, packed.tarball, p3ArchivePaths(manifest), join(work, 'npm-cache'));
    const definers = packedProvenanceDefiners(consumerDir);
    writeFileSync(join(consumerDir, 'shared-provenance-probe.mjs'), SHARED_PROVENANCE_PROBE + SHARED_PROVENANCE_TAIL);
    let probe;
    try {
      const out = execFileSync(process.execPath, ['shared-provenance-probe.mjs'], {
        cwd: consumerDir, encoding: 'utf8', stdio: 'pipe',
      });
      probe = { exitCode: 0, ...JSON.parse(out.trim().split('\n').pop()) };
    } catch (error) {
      const stdout = error.stdout ?? '';
      let parsed = null;
      try {
        parsed = JSON.parse(stdout.trim().split('\n').pop() ?? '');
      } catch {
        parsed = null;
      }
      probe = { exitCode: error.status ?? 1, ok: false, code: parsed?.code ?? null, stderr: (error.stderr ?? '').slice(-2000) };
    }
    return { packed, definers, probe };
  } finally {
    const keep = process.env.L4_KEEP_WORKDIRS === '1';
    if (!keep) {
      try {
        const { rmSync } = await import('node:fs');
        rmSync(work, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

/**
 * Fenced-store probe tail. Reuses the shared head above (imports, binding,
 * engine ports) but opens the store through the substrate entry over the
 * neutral acceptance backend, then wires engine, facets and server from the
 * mcp-memory entry with the unfenced exemption disabled.
 */
const FENCED_STORE_TAIL = `
const failPort = (error_code, message) => ({ ok: false, error_code, message });

const fencedScope = { tenantId: 'tenant:one', workspaceId: 'workspace:one' };
const fencedClock = { now: () => NOW };
// Neutral acceptance backend (same factory as the substrate tarball
// acceptance, embedded from its live source below); the store is opened
// through the substrate entry.
const fencedBackend = createTarballAcceptanceBackend({ scope: { ...fencedScope }, contractDigest: CONTRACT_DIGEST });
const fencedOpened = await substrate.openModuleStorageCanonicalMemoryStoreV1({
  handle: fencedBackend.handle,
  scope_binding: {
    scope: { ...fencedScope }, store_id: 'store:one',
    resolveScope: (scopeRef) => scopeRef === 'scope:one' ? { ...fencedScope } : null,
  },
  grant: fencedBackend.grant,
  clock: fencedClock,
  deadline_at: DEADLINE,
});
if (!fencedOpened.ok) {
  console.log(JSON.stringify({ ok: false, code: fencedOpened.error.code ?? null }));
  process.exit(3);
}
const fencedStore = fencedOpened.value;
const fencedPorts = engineDeps(mcp.receiptDigest, fencedClock);
// Engine, facets and server all come from the mcp-memory entry with the
// unfenced exemption disabled: only a fenced store sharing this module
// instance's provenance registry is admitted.
const engine = mcp.createMemoryPortV2({
  canonical_store: fencedStore, authorization: fencedPorts.authorization,
  admission_policy: fencedPorts.admission_policy, crypto: fencedPorts.crypto,
  evidence_verifier: fencedPorts.evidence_verifier, activity_sources: [],
  clock: fencedClock,
});
const readFacets = mcp.createMemoryReadFacetsV1(
  { canonical_store: fencedStore, ...fencedPorts, activity_sources: [], clock: fencedClock },
  { scope_ref: 'scope:one', store_id: 'store:one' },
);
const facets = {
  scope_ref: 'scope:one', store_id: 'store:one',
  recallPort: readFacets.recallPort, readPort: readFacets.readPort, engine,
};

const stored = new Map();
const byRef = (ref) => [...stored.values()].find((entry) => entry.preimage.reservation_ref === ref);
const isOpaque = (s) => typeof s === 'string' && s.length >= 1 && s.length <= 512;
const reservation = {
  async reserveOrLoad(lookupKey, candidate) {
    const key = JSON.stringify(lookupKey);
    const existing = stored.get(key);
    if (existing) return { ok: true, value: existing };
    if (!mcp.validateMemoryMutationPreimageV1(candidate).ok) return failPort('INVALID_SCHEMA', 'candidate preimage is not closed');
    const digest = mcp.computeMemoryMutationOperationDigestV1(candidate);
    if (!digest.ok) return failPort(digest.error_code, 'candidate digest failed');
    const versions = mcp.projectMemoryMutationPolicyVersionsV1(candidate.effective_input);
    if (!versions.ok) return failPort(versions.error_code, 'candidate policy versions failed');
    const entry = {
      lookup_key: lookupKey, preimage: candidate, operation_digest: digest.value.operation_digest,
      policy_versions: versions.value, recovery_state: 'authorized_uncommitted',
      audit_id: 'reservation-audit:' + candidate.reservation_ref, execution_generation: '0',
    };
    stored.set(key, entry);
    return { ok: true, value: entry };
  },
  async attachConfirmation(reservationRef, confirmationRef, operationDigest) {
    const entry = byRef(reservationRef);
    if (!entry) return failPort('NOT_FOUND', 'unknown reservation');
    if (entry.operation_digest !== operationDigest) return failPort('INVALID_SCHEMA', 'confirmation digest mismatch');
    if (!isOpaque(confirmationRef)) return failPort('INVALID_SCHEMA', 'confirmation ref is not opaque');
    const next = { ...entry, confirmation_ref: confirmationRef };
    stored.set(JSON.stringify(next.lookup_key), next);
    return { ok: true, value: next };
  },
  async claimFencedExecution(reservationRef, executionGeneration) {
    const entry = byRef(reservationRef);
    if (!entry) return failPort('NOT_FOUND', 'unknown reservation');
    if (entry.recovery_state !== 'authorized_uncommitted') return failPort('INVALID_SCHEMA', 'reservation is not claimable');
    const next = { ...entry, recovery_state: 'executing_unknown_outcome', execution_generation: executionGeneration };
    stored.set(JSON.stringify(next.lookup_key), next);
    return { ok: true, value: next };
  },
  async reconcileCanonicalOutcome(reservationRef, canonicalReplayRef) {
    const entry = byRef(reservationRef);
    if (!entry) return failPort('NOT_FOUND', 'unknown reservation');
    if (!isOpaque(canonicalReplayRef)) return failPort('INVALID_SCHEMA', 'replay ref is not opaque');
    const next = { ...entry, recovery_state: 'canonical_committed_receipt', canonical_replay_ref: canonicalReplayRef };
    stored.set(JSON.stringify(next.lookup_key), next);
    return { ok: true, value: next };
  },
  async recordCompletion(reservationRef, output) {
    const entry = byRef(reservationRef);
    if (!entry) return failPort('NOT_FOUND', 'unknown reservation');
    if (!isOpaque(entry.canonical_replay_ref) || entry.recovery_state !== 'canonical_committed_receipt') {
      return failPort('INVALID_SCHEMA', 'reservation has no canonical commitment to complete');
    }
    const next = { ...entry, recovery_state: 'completed_response', stored_output: output };
    stored.set(JSON.stringify(next.lookup_key), next);
    return { ok: true, value: next };
  },
};

const readHost = {
  clock: fencedClock,
  authenticate: async (ctx, tool) => ctx.scope_ref === 'scope:one' && ctx.store_id === 'store:one',
  authorize: async (ctx, tool, purpose) => ctx.scope_ref === 'scope:one' && purpose === 'purpose:one',
  authorizeContinuation: async () => true,
  pages: memoryTools.createMemoryReadPageStoreV1({ clock: fencedClock, ttl_ms: 60000, max_entries: 100 }),
};
const writeHost = {
  clock: fencedClock,
  authenticate: readHost.authenticate,
  authorize: async (ctx, tool, purpose) => {
    if (ctx.scope_ref !== 'scope:one') return false;
    if (tool === 'engram_memory_capture') return purpose === 'purpose:one';
    return true;
  },
  reservation,
  audit: { append: async () => {} },
  policy: {
    capturePolicyVersion: async () => 'capture-policy/v1',
    admissionPolicyVersion: async () => 'admission-policy/v1',
    retention: { max_retention_days: 30, allow_retain_derivative_rule: false },
    reconciliation: { consented_family_refs: [] },
    anchorKindRef: 'memory:lifecycle',
    provenanceDigest: async () => D,
    nextSourceOrder: async () => ({ source_ref: 'source:host', sequence: '1' }),
  },
  confirm: async () => true,
  keyCustody: { confirmDestroyed: async () => true },
  coverage: { verify: async () => ({ complete: false }) },
};

const assetBytes = (rel) => fs.readFileSync(path.join(PKG, rel));
const assetSha = (rel) => createHash('sha256').update(assetBytes(rel)).digest('hex');
const hostBindings = {
  profileBindings: {
    wireProfileId: 'sentropic.engram.memory-wire/v1', wireProfileSha256: assetSha('dist/registry/wire-profile.json'),
    toolSchemaProfileId: 'sentropic.engram.memory-tools/2020-12-v1', toolSchemaProfileSha256: assetSha('dist/registry/tool-schema-profile.json'),
    parameterProfileId: 'sentropic.parameters/2020-12-bounded-v1', parameterSchemaVersion: '1.0.0', parameterProfileSha256: assetSha('dist/registry/parameter-schema.json'),
  },
  hostBindingRef: 'fenced-store-provenance',
  invocation: { contractVersion: '1.0.0' },
  authorization: { contractVersion: '1.0.0' },
  domainPolicy: { contractVersion: '1.0.0' },
  engine: {
    mutationPortVersion: 2, recallPortVersion: 3, readPortVersion: 1,
    engineId: 'fenced-engine', canonicalStoreId: 'store:one', fenceProvenanceId: 'fence:fenced',
  },
  mutationRecovery: { contractVersion: '1.0.0', digestProfile: 'sentropic.engram.memory-mutation/v1' },
  confirmation: { contractVersion: '1.0.0', enrolledOidcDomain: 'sent-tech.ca' },
  audit: { contractVersion: '1.0.0' },
  pagination: { contractVersion: '1.0.0', engramOwnsSigningSecret: false },
  lifecycle: { contractVersion: '1.0.0' },
};
const plan = {
  resolveTool: (name) => {
    const descriptor = mcp.MEMORY_PROVIDER_MANIFEST.tools.find((c) => c.name === name);
    if (descriptor === undefined) return undefined;
    return {
      providerId: descriptor.providerId ?? 'sentropic.engram.memory',
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

const provider = mcp.createEngramMemoryProviderV1({
  readFacets: facets, writeFacets: facets, readHost, writeHost, policyId: 'policy:one',
  hostBindings, plan, sourceId: 'mcp:engram-memory', generation: '1',
});
const server = await mcp.createEngramMemoryMcpServerV1(provider);
const out = await server.callTool('engram_memory_capture', captureArgs(KEY('a')), stpCtx(), { idempotencyKey: KEY('a') });
const envelope = out.structuredContent;
console.log(JSON.stringify({ ok: envelope.ok === true, code: envelope.ok === true ? null : envelope.error?.code ?? null }));
if (envelope.ok !== true) process.exit(3);
`;

/**
 * Neutral acceptance backend prelude for the fenced-store probe: the pinned
 * contract digest plus the factory and its module-scope companions, sliced
 * pristine from the on-disk backend source (no hand copy, no runtime
 * toString which the test runner's SSR transform rewrites).
 */
function fencedBackendPrelude() {
  const sources = tarballAcceptanceBackendSources(ROOT);
  return [
    `const CONTRACT_DIGEST = ${JSON.stringify(pinnedContractDigest(ROOT))};`,
    `const ZERO_HASH = 'sha256:${'0'.repeat(64)}';`,
    'const MAX_U64 = 18446744073709551615n;',
    `const storageError = ${sources.storageError};`,
    `const stableStringify = ${sources.stableStringify};`,
    `const profileDigest = ${sources.profileDigest};`,
    `const createTarballAcceptanceBackend = ${sources.createTarballAcceptanceBackend};`,
  ].join('\n');
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function execProbeFile(consumerDir, filename) {
  try {
    const out = execFileSync(process.execPath, [filename], {
      cwd: consumerDir, encoding: 'utf8', stdio: 'pipe',
    });
    return { exitCode: 0, ...JSON.parse(out.trim().split('\n').pop()) };
  } catch (error) {
    const stdout = error.stdout ?? '';
    let parsed = null;
    try {
      parsed = JSON.parse(stdout.trim().split('\n').pop() ?? '');
    } catch {
      parsed = null;
    }
    return { exitCode: error.status ?? 1, ok: false, code: parsed?.code ?? null, stderr: (error.stderr ?? '').slice(-2000) };
  }
}

function runFencedProbeAgainst(tarball, extraArchives) {
  const work = mkdtempSync(join(tmpdir(), 'l4-fenced-provenance-'));
  try {
    const consumerDir = join(work, 'consumer');
    installConsumer(consumerDir, tarball, extraArchives, join(work, 'npm-cache'));
    writeFileSync(join(consumerDir, 'fenced-store-probe.mjs'), SHARED_PROVENANCE_PROBE + fencedBackendPrelude() + FENCED_STORE_TAIL);
    return { probe: execProbeFile(consumerDir, 'fenced-store-probe.mjs') };
  } finally {
    if (process.env.L4_KEEP_WORKDIRS !== '1') {
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

/**
 * Fenced-store packed case: re-pack the candidate and require byte-identity
 * with the r9 archive, then run the substrate-opened, exemption-disabled
 * probe against the frozen r5 archive (must refuse CAPABILITY_UNAVAILABLE)
 * and the frozen r9 archive (must capture).
 */
export async function runFencedStorePacked() {
  const r5Bytes = readFileSync(join(ROOT, L4_R5_TARBALL));
  if (sha256Hex(r5Bytes) !== L4_R5_SHA256) throw new Error('r5 archive identity mismatch');
  const r9Bytes = readFileSync(join(ROOT, L4_R9_TARBALL));
  if (sha256Hex(r9Bytes) !== L4_R9_SHA256) throw new Error('r9 archive identity mismatch');
  const repackWork = mkdtempSync(join(tmpdir(), 'l4-fenced-repack-'));
  let repacked;
  try {
    repacked = packCandidate(repackWork);
  } finally {
    const { rmSync } = await import('node:fs');
    rmSync(repackWork, { recursive: true, force: true });
  }
  const byteIdentical = repacked.sha256 === L4_R9_SHA256;
  if (!byteIdentical) throw new Error(`repack drift: packed ${repacked.sha256} !== r9 ${L4_R9_SHA256}`);
  const manifest = verifyP3Archives();
  const extraArchives = p3ArchivePaths(manifest);
  const old = runFencedProbeAgainst(join(ROOT, L4_R5_TARBALL), extraArchives);
  const current = runFencedProbeAgainst(join(ROOT, L4_R9_TARBALL), extraArchives);
  return { repacked, byteIdentical, old, new: current };
}
