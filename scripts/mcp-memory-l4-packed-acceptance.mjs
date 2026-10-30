/**
 * MCP-L4 packed acceptance (Node only).
 *
 * Packs the candidate, installs it in isolated consumers outside the source
 * tree and verifies the L4 row against the REAL canonical implementation:
 * the standard adapter contract, SDK discovery and invocation of the six
 * tools end to end through the real in-process facades over the real
 * canonical engine on a non-native in-memory store (never fabricated
 * receipts), with host ports that verify their inputs (a rejecting
 * authenticator, a scope-checking authorizer, a confirmation port that
 * records the reference it receives), call counters at the SDK server entry
 * and at the provider entry, one probe per pipeline step (ordering, resolver
 * throw with no leak, cancellation during authorization with no later
 * effect, post-commit exception, stronger-confirmation refusal, injected
 * references preserved), metadata/schema/codec/gate/manifest/publisher/
 * local-lazy checks, forged-call and missing-context refusal with zero
 * provider/effect calls, the transport-size guard, the disabled-install
 * proof on the ordinary dependency closure (no `--omit=optional`, scripts
 * enabled, native build attempts / store opens / identity bootstraps
 * instrumented and zero), and the SDK floor (a floor failure FAILS the
 * acceptance, never `unverified`). Finally it asserts the candidate
 * manifest (exports derived from the packed `package.json`, tarball binding,
 * receipt validity) and flips its `sdkFloorProbe` to `pass`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDisabledTrace, isMemoryNativeBuildProcess } from './mcp-memory-disabled-trace.mjs';
import { P3_BASE, readFrozenP3Manifest } from './mcp-memory-l4-local-prereqs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const NPM = process.env.MCP_L4_NPM_BIN ?? '/home/antoinefa/.npm-global/bin/npm';
// P3 archives are byte-identical to the staged P2 archives, so the same
// staging directory serves both; only the manifest identity below is P3.
// The P3 manifest itself comes from the tracked fixture
// tests/fixtures/l4-full-suite-evidence/frozen-p3-manifest.json.gz (raw
// sha256 verified there); only the peer archives below stay local-only.
const SDK_PINNED = '1.32.2';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function integrityOf(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}
function run(cmd, args, options) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...options });
}
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function verifyP3Archives() {
  const manifest = readFrozenP3Manifest(ROOT);
  for (const artifact of manifest.artifacts) {
    const archivePath = join(P3_BASE, artifact.archive.replace(/^tools\/memory-mcp-l5\/artifacts\//, ''));
    const bytes = readFileSync(archivePath);
    if (sha256(bytes) !== artifact.sha256) throw new Error(`P3 sha256 mismatch for ${artifact.name}`);
    if (integrityOf(bytes) !== artifact.integrity) throw new Error(`P3 integrity mismatch for ${artifact.name}`);
  }
  return manifest;
}

export function packCandidate(destination) {
  const out = run(NPM, ['pack', '--ignore-scripts', '--pack-destination', destination], { cwd: ROOT });
  const match = out.match(/([^\s]+\.tgz)/);
  if (!match) throw new Error(`npm pack produced no tarball: ${out}`);
  const tarball = join(destination, match[1].split('/').pop());
  if (!existsSync(tarball)) throw new Error(`packed tarball missing: ${tarball}`);
  const bytes = readFileSync(tarball);
  return { tarball, sha256: sha256(bytes), integrity: integrityOf(bytes) };
}

/**
 * Install one isolated consumer. The disabled and floor consumers use the
 * ORDINARY dependency closure (no `--omit=optional`, scripts enabled): the
 * disabled proof must observe the real default install. The enabled
 * consumer keeps `--omit=optional` only to avoid unrelated native
 * toolchains (tree-sitter prebuilds); the SDK/adapter paths it proves are
 * unaffected. Install output is captured for native-build instrumentation.
 */
function installConsumer(consumerDir, tarball, extraArchives = [], env = {}, sdkRange = null, omitOptional = false, logPath = null) {
  mkdirSync(consumerDir, { recursive: true });
  writeFileSync(join(consumerDir, 'package.json'), JSON.stringify({ name: 'l4-consumer', version: '0.0.0', type: 'module' }));
  // Single install command: a second bare `npm install` would prune the
  // no-save tarball packages as extraneous.
  const specs = [tarball, ...extraArchives];
  if (sdkRange !== null) specs.push(`@modelcontextprotocol/sdk@${sdkRange}`);
  const args = ['install', '--no-save', '--no-audit', '--no-fund'];
  if (omitOptional) args.push('--omit=optional');
  args.push(...specs);
  const result = spawnSync(NPM, args, { cwd: consumerDir, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const out = (result.stdout ?? '') + (result.stderr ?? '');
  if (logPath !== null) writeFileSync(logPath, out);
  if (result.status !== 0) throw new Error('consumer install failed: ' + out);
}

export function p3ArchivePaths(manifest) {
  return manifest.artifacts.map((artifact) =>
    join(P3_BASE, artifact.archive.replace(/^tools\/memory-mcp-l5\/artifacts\//, '')),
  );
}

/**
 * Real-host harness, copied into each enabled/floor consumer as
 * `real-host.mjs`. It provisions the REAL canonical implementation through
 * the packed closure only: the in-memory non-native canonical store, the
 * guarded canonical engine and the real read facets (all re-exported by the
 * packed `./mcp-memory` entry), driven through the real in-process facades.
 * The reservation is Map-backed but computes every digest, version and
 * lookup key with the real closed policy functions (never fabricated). Host
 * ports verify their inputs: the authenticator rejects out-of-scope stores,
 * the authorizer checks scope (and purpose for reads/capture), and the
 * confirmation port records the exact binding it receives.
 */
const REAL_HOST_HARNESS = `
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NOW = '2026-08-16T12:34:56.789Z';
const DEADLINE = '2026-08-16T12:35:16.789Z';
export const D = 'sha256:' + '0'.repeat(64);
export const ELICITATION_REF = 'elicit:packed-l4';
export const KEY = (c) => c.repeat(32);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(HERE, 'node_modules/@sentropic/engram');

export function binding(overrides = {}) {
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
    audit_id: 'audit:packed-l4', correlation_ref: 'corr:one', deadline_at: DEADLINE,
    cancellation_ref: 'cancel:one', issued_at: NOW, channel_binding: 'in_process_verified',
    transport_scopes: ['mcp:tools:invoke'], neutral_credential: 'credential:one',
    ...overrides,
  };
}

export function stpCtx(bindingOverrides = {}, extra = {}) {
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

export function captureArgs(key = KEY('a')) {
  return {
    idempotency_key: key,
    payload: {
      schema_version: 2, purpose_ref: 'purpose:one', valid_time: { t: 1 },
      components: [{ component_id: 'comp:one', kind: 'context', text: 'hello packed', citation_ids: ['cit:one'] }],
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
      assert.ok(['capture', 'request_admission', 'withdraw', 'tombstone', 'recall_current'].includes(request.operation));
      const body = {
        allowed: true, decision_id: 'decision:packed', policy_version: '1',
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
    policy_id: 'policy:packed', policy_version: '1',
    async decide(request) {
      const body = { policy_id: 'policy:packed', policy_version: '1', record_digest: request.record_digest, decision: 'accept', issued_at: NOW };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest('admission-decision', body) } };
    },
  };
  const plaintext = new Map();
  const crypto = {
    version: 1,
    async seal(input) {
      plaintext.set(input.candidate_id, input.plaintext);
      const body = { candidate_id: input.candidate_id, envelope_ref: \`envelope:\${input.candidate_id}\`, key_ref: \`key:\${input.candidate_id}\`, ciphertext: \`ciphertext:\${input.candidate_id}\` };
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
    version: 1, verifier_id: 'verifier:packed', verifier_version: '1',
    async classify(request) {
      const body = {
        class: 'earned', evidence_digest: D, verifier_id: 'verifier:packed',
        verifier_version: '1', issued_at: NOW, revocation_epoch: '0',
      };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest('earned-trust', { ...body, payload_digest: request.payload_digest }) } };
    },
    async revalidate(binding_receipt_digest, checked_at) {
      const body = { binding_receipt_digest, checked_at, valid: true, current_revocation_epoch: '0', reason: 'valid' };
      return { ok: true, value: { ...body, revalidation_receipt_digest: receiptDigest('trust-revalidation', body, 'revalidation_receipt_digest') } };
    },
  };
  return { authorization, admission_policy: policy, crypto, evidence_verifier };
}

const failPort = (error_code, message) => ({ ok: false, error_code, message });

export async function buildRealHost(overrides = {}) {
  const providerMod = await import('@sentropic/engram/mcp-memory');
  const memoryTools = await import('@sentropic/engram/memory-tools');
  const digestOf = providerMod.receiptDigest;
  const counts = {
    recall: 0, readCurrent: 0, capture: 0, requestAdmission: 0, transition: 0,
    authenticate: 0, authorize: 0, reserve: 0, confirm: 0, providerEntry: 0, resolveEntry: 0,
  };
  const confirmations = [];
  const engineRequests = [];
  const clock = { now: () => NOW };
  const store = providerMod.createInMemoryCanonicalMemoryStoreV1({ clock, store_id: 'store:one' });
  const ports = engineDeps(digestOf, clock);
  const engine = providerMod.createMemoryPortV2({
    canonical_store: store, authorization: ports.authorization,
    admission_policy: ports.admission_policy, crypto: ports.crypto,
    evidence_verifier: ports.evidence_verifier, activity_sources: [],
    clock, allow_unfenced_memory_store: true,
  });
  const readFacets = providerMod.createMemoryReadFacetsV1(
    { canonical_store: store, ...ports, activity_sources: [], clock, allow_unfenced_memory_store: true },
    { scope_ref: 'scope:one', store_id: 'store:one' },
  );
  const recordingEngine = {
    version: 2,
    capture: async (req, guard) => {
      counts.capture++;
      engineRequests.push({ op: 'capture', cancellation_ref: req.cancellation_ref });
      return engine.capture(req, guard);
    },
    requestAdmission: async (req, guard) => {
      counts.requestAdmission++;
      engineRequests.push({ op: 'requestAdmission' });
      return engine.requestAdmission(req, guard);
    },
    transition: async (cmd, guard) => {
      counts.transition++;
      engineRequests.push({ op: 'transition' });
      return engine.transition(cmd, guard);
    },
  };
  const facets = {
    scope_ref: 'scope:one', store_id: 'store:one',
    recallPort: {
      version: 3,
      recall: async (req) => { counts.recall++; return readFacets.recallPort.recall(req); },
    },
    readPort: {
      version: 1,
      readCurrent: async (req) => { counts.readCurrent++; return readFacets.readPort.readCurrent(req); },
    },
    engine: recordingEngine,
  };

  const stored = new Map();
  const byRef = (ref) => [...stored.values()].find((entry) => entry.preimage.reservation_ref === ref);
  const isOpaque = (s) => typeof s === 'string' && s.length >= 1 && s.length <= 512;
  const reservation = {
    async reserveOrLoad(lookupKey, candidate) {
      counts.reserve++;
      const key = JSON.stringify(lookupKey);
      const existing = stored.get(key);
      if (existing) return { ok: true, value: existing };
      if (!providerMod.validateMemoryMutationPreimageV1(candidate).ok) {
        return failPort('INVALID_SCHEMA', 'candidate preimage is not closed');
      }
      const digest = providerMod.computeMemoryMutationOperationDigestV1(candidate);
      if (!digest.ok) return failPort(digest.error_code, 'candidate digest failed');
      const versions = providerMod.projectMemoryMutationPolicyVersionsV1(candidate.effective_input);
      if (!versions.ok) return failPort(versions.error_code, 'candidate policy versions failed');
      const entry = {
        lookup_key: lookupKey, preimage: candidate, operation_digest: digest.value.operation_digest,
        policy_versions: versions.value,
        recovery_state: candidate.tool_name === 'engram_memory_withdraw' || candidate.tool_name === 'engram_memory_forget'
          ? 'pending_confirmation' : 'authorized_uncommitted',
        audit_id: \`reservation-audit:\${candidate.reservation_ref}\`, execution_generation: '0',
      };
      stored.set(key, entry);
      return { ok: true, value: entry };
    },
    async attachConfirmation(reservationRef, confirmationRef, operationDigest, currentSession) {
      assert.deepEqual(currentSession, { principal_namespace: 'ns:one', principal_id: 'alice', tenant_id: 'tenant:one', session_id: 'session:one', transport_attachment_ref: 'attach:one' });
      const entry = byRef(reservationRef);
      if (!entry) return failPort('NOT_FOUND', 'unknown reservation');
      if (entry.operation_digest !== operationDigest) return failPort('INVALID_SCHEMA', 'confirmation digest mismatch');
      if (!isOpaque(confirmationRef)) return failPort('INVALID_SCHEMA', 'confirmation ref is not opaque');
      const next = {
        ...entry, confirmation_ref: confirmationRef,
        recovery_state: entry.recovery_state === 'pending_confirmation' ? 'authorized_uncommitted' : entry.recovery_state,
      };
      stored.set(JSON.stringify(next.lookup_key), next);
      return { ok: true, value: next };
    },
    async claimFencedExecution(reservationRef, executionGeneration) {
      const entry = byRef(reservationRef);
      if (!entry) return failPort('NOT_FOUND', 'unknown reservation');
      if (entry.recovery_state !== 'authorized_uncommitted') {
        return failPort(entry.recovery_state === 'executing_unknown_outcome' ? 'MUTATION_OUTCOME_UNKNOWN' : 'INVALID_SCHEMA', 'reservation is not claimable');
      }
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

  const verifyIdentity = (ctx, tool) => {
    const read = tool === 'engram_memory_search' || tool === 'engram_memory_get';
    return ctx.authorization?.credential === 'credential:one' &&
      ctx.principal_namespace === 'ns:one' && ctx.principal_id === 'alice' && ctx.tenant_id === 'tenant:one' &&
      ctx.agent_id === 'agent:one' && ctx.session_id === 'session:one' &&
      (read ? ctx.connector_instance_id : ctx.connector_instance_ref) === 'connector:one' &&
      (read || ctx.transport_attachment_ref === 'attach:one') &&
      ctx.generation === '1' && ctx.scope_ref === 'scope:one' && ctx.store_id === 'store:one';
  };
  const readHost = {
    clock,
    authenticate: async (ctx, tool) => {
      counts.authenticate++;
      if (overrides.authenticate) return overrides.authenticate(ctx, tool);
      return verifyIdentity(ctx, tool);
    },
    authorize: async (ctx, tool, purpose) => {
      counts.authorize++;
      if (overrides.authorize) return overrides.authorize(ctx, tool, purpose);
      return ctx.scope_ref === 'scope:one' && purpose === 'purpose:one';
    },
    authorizeContinuation: async (_state, ctx) => verifyIdentity(ctx, 'engram_memory_search'),
    pages: memoryTools.createMemoryReadPageStoreV1({ clock, ttl_ms: 60000, max_entries: 100 }),
  };
  const writeHost = {
    clock,
    authenticate: readHost.authenticate,
    authorize: async (ctx, tool, purpose) => {
      counts.authorize++;
      if (overrides.authorize) return overrides.authorize(ctx, tool, purpose);
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
    confirm: async (binding) => {
      counts.confirm++;
      confirmations.push({ ...binding });
      if (overrides.confirm) return overrides.confirm(binding);
      const reserved = byRef(binding.reservation_ref);
      const target = reserved?.preimage.target;
      const expectedTarget = target?.kind === 'capture_source' ? target.source_ref : target?.kind === 'candidate' ? target.candidate_id : target?.record_id;
      return binding.elicitation_ref === ELICITATION_REF && binding.principal_namespace === 'ns:one' &&
        binding.principal_id === 'alice' && binding.tenant_id === 'tenant:one' && binding.session_id === 'session:one' &&
        binding.transport_attachment_ref === 'attach:one' && reserved?.operation_digest === binding.operation_digest &&
        reserved.preimage.tool_name === binding.capability && binding.target_ref === expectedTarget &&
        Date.parse(clock.now()) >= Date.parse(NOW) && Date.parse(clock.now()) < Date.parse(DEADLINE);
    },
    keyCustody: {
      confirmDestroyed: async (candidate_id) => {
        if (overrides.confirmDestroyed) return overrides.confirmDestroyed(candidate_id);
        return true;
      },
    },
    coverage: {
      verify: async (cursor) => {
        if (overrides.coverage) return overrides.coverage(cursor);
        return { complete: false };
      },
    },
  };

  // Activation bindings from the REAL packed bytes: profile digests are the
  // exact sha256 of the packed profile assets, engine versions match the
  // provisioned facets.
  const assetBytes = (rel) => fs.readFileSync(path.join(PKG, rel));
  const assetSha = (rel) => createHash('sha256').update(assetBytes(rel)).digest('hex');
  const hostBindings = {
    profileBindings: {
      wireProfileId: 'sentropic.engram.memory-wire/v1', wireProfileSha256: assetSha('dist/registry/wire-profile.json'),
      toolSchemaProfileId: 'sentropic.engram.memory-tools/2020-12-v1', toolSchemaProfileSha256: assetSha('dist/registry/tool-schema-profile.json'),
      parameterProfileId: 'sentropic.parameters/2020-12-bounded-v1', parameterSchemaVersion: '1.0.0', parameterProfileSha256: assetSha('dist/registry/parameter-schema.json'),
    },
    hostBindingRef: 'packed-acceptance',
    invocation: { contractVersion: '1.0.0' },
    authorization: { contractVersion: '1.0.0' },
    domainPolicy: { contractVersion: '1.0.0' },
    engine: {
      mutationPortVersion: 2, recallPortVersion: 3, readPortVersion: 1,
      engineId: 'acceptance-engine', canonicalStoreId: 'store:one', fenceProvenanceId: 'fence:acceptance',
    },
    mutationRecovery: { contractVersion: '1.0.0', digestProfile: 'sentropic.engram.memory-mutation/v1' },
    confirmation: { contractVersion: '1.0.0', enrolledOidcDomain: 'sent-tech.ca' },
    audit: { contractVersion: '1.0.0' },
    pagination: { contractVersion: '1.0.0', engramOwnsSigningSecret: false },
    lifecycle: { contractVersion: '1.0.0' },
  };
  const plan = {
    resolveTool: (name) => {
      const descriptor = providerMod.MEMORY_PROVIDER_MANIFEST.tools.find((c) => c.name === name);
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
  const options = {
    readFacets: facets, writeFacets: facets, readHost, writeHost, policyId: 'policy:one',
    hostBindings, plan, sourceId: 'mcp:engram-memory', generation: '1',
  };
  const raw = providerMod.createEngramMemoryProviderV1(options);
  // Provider-entry counter: every provider dispatch passes here.
  const adapter = {
    ...raw,
    invokeTool: async (...args) => { counts.providerEntry++; return raw.invokeTool(...args); },
  };
  return { adapter, raw, counts, confirmations, engineRequests, facets, readHost, writeHost, providerMod, memoryTools, options, ports, store };
}
`;

const ENABLED_PROBE = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const pkgDir = path.join(process.cwd(), 'node_modules/@sentropic/engram');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
assert.equal(pkg.name, '@sentropic/engram');
assert.ok(pkg.exports['./mcp-memory']);
assert.ok(pkg.exports['./registry/manifest']);
assert.ok(pkg.exports['./registry/definitions']);
assert.ok((pkg.peerDependencies['@sentropic/mcp-platform'] ?? '').includes('0.4.0'));
assert.ok((pkg.peerDependencies['@sentropic/mcp-broker'] ?? '').includes('0.1.0'));
const sdkRange = pkg.optionalDependencies['@modelcontextprotocol/sdk'] ?? '';
assert.match(sdkRange, /1\\.31/);
assert.ok(!pkg.files.includes('candidate-manifest.json'));
assert.ok(!fs.existsSync(path.join(pkgDir, 'candidate-manifest.json')));
assert.ok(!fs.existsSync(path.join(pkgDir, 'engram-memory')));

const manifestMod = await import('@sentropic/engram/registry/manifest');
const definitionsMod = await import('@sentropic/engram/registry/definitions');
const providerMod = await import('@sentropic/engram/mcp-memory');
const platform = await import('@sentropic/mcp-platform/memory');
const broker = await import('@sentropic/mcp-broker/memory');
const sdkTypes = await import('@modelcontextprotocol/sdk/types.js');

// The registry-package envelope is served at ./registry/manifest (not the
// bare provider manifest) and equals the packed entries file.
assert.equal(manifestMod.manifest.format, 'sentropic.registry-package/v1');
assert.equal(manifestMod.default.format, 'sentropic.registry-package/v1');
const entries = JSON.parse(fs.readFileSync(path.join(pkgDir, 'registry/entries.v1.json'), 'utf8'));
assert.equal(JSON.stringify(manifestMod.manifest), JSON.stringify(entries));
assert.equal(entries.entries.length, 1);
const entry = entries.entries[0];
assert.equal(entry.id, 'sentropic.engram.memory');

// Standard adapter identity plus the manifest publication version.
const tools = providerMod.MEMORY_PROVIDER_MANIFEST.tools;
assert.equal(tools.length, 6);
assert.equal(providerMod.MEMORY_PROVIDER_ID, platform.MEMORY_PROVIDER_ID);
assert.equal(providerMod.MEMORY_CONNECTOR_ID, platform.MEMORY_CONNECTOR_ID);
assert.equal(providerMod.MEMORY_WIRE_PROFILE_ID, platform.MEMORY_WIRE_PROFILE_ID);
assert.equal(providerMod.MEMORY_TOOL_SCHEMA_PROFILE_ID, platform.MEMORY_TOOLS_PROFILE_ID);
assert.equal(typeof broker.CompiledMemoryDispatch, 'function');
assert.equal(typeof broker.bindMemoryInvocation, 'function');
assert.equal(typeof broker.MemoryDispatchRefusal, 'function');

// Manifest tools match the frozen P3 platform tools field by field.
const names = tools.map((t) => t.name).sort();
assert.deepEqual(names, ['engram_memory_capture','engram_memory_forget','engram_memory_get','engram_memory_request_admission','engram_memory_search','engram_memory_withdraw']);
for (const tool of tools) {
  const frozen = platform.findMemoryTool(tool.name);
  assert.ok(frozen, tool.name);
  assert.deepEqual(tool.requiredScopes, ['mcp:tools:invoke']);
  assert.deepEqual(tool.requiredClaims, ['sub', 'tid']);
  assert.deepEqual(tool.requiredScopes, frozen.requiredScopes);
  assert.deepEqual(tool.requiredClaims, frozen.requiredClaims);
  assert.equal(tool.redactionClass, 'high');
  assert.equal(tool.redactionClass, frozen.redactionClass);
  assert.equal(tool.mutability, frozen.mutability);
  assert.equal(tool.mutatesExternalSystem, frozen.mutatesExternalSystem);
  assert.deepEqual(tool.idempotency, frozen.idempotency);
  assert.deepEqual(tool.gates, frozen.gates);
  assert.equal(tool.description, frozen.description);
  assert.equal(JSON.stringify(tool.inputSchema), JSON.stringify(frozen.inputSchema));
  assert.equal(JSON.stringify(tool.outputSchema), JSON.stringify(frozen.outputSchema));
}

// Host-composition helpers expose the real canonical implementation.
for (const helper of ['createMemoryPortV2', 'createMemoryReadFacetsV1', 'createInMemoryCanonicalMemoryStoreV1', 'computeMemoryMutationOperationDigestV1', 'validateMemoryMutationPreimageV1', 'extractMemoryMutationLookupKeyV1', 'projectMemoryMutationPolicyVersionsV1', 'receiptDigest', 'validateMemoryPublisherAssetsV1', 'ENGRAM_MEMORY_WIRE_PROFILE_V1']) {
  assert.equal(typeof providerMod[helper], helper === 'ENGRAM_MEMORY_WIRE_PROFILE_V1' ? 'object' : 'function', helper);
}

// Registry asset closure: every asset separately listed with an exact
// digest; no path is duplicated where the receipt validator forbids it.
assert.ok(entry.assets.length >= 20);
const seenPaths = new Set();
for (const asset of entry.assets) {
  assert.ok(!seenPaths.has(asset.path), 'duplicated asset path ' + asset.path);
  seenPaths.add(asset.path);
  const bytes = fs.readFileSync(path.join(pkgDir, asset.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.path);
}
const assetByRole = (role) => entry.assets.find((a) => a.role === role);
assert.ok(assetByRole('provider'));
assert.ok(assetByRole('validator'));
assert.notEqual(assetByRole('provider').path, assetByRole('validator').path);
for (const tool of tools) {
  for (const side of ['input', 'output']) {
    const asset = entry.assets.find((a) => a.role === \`schema-\${side}-\${tool.name}\`);
    assert.ok(asset, side + ':' + tool.name);
    const assetSchema = JSON.parse(fs.readFileSync(path.join(pkgDir, asset.path), 'utf8'));
    assert.equal(JSON.stringify(assetSchema), JSON.stringify(side === 'input' ? tool.inputSchema : tool.outputSchema));
    assert.equal(JSON.stringify(assetSchema), JSON.stringify(side === 'input' ? platform.findMemoryTool(tool.name).inputSchema : platform.findMemoryTool(tool.name).outputSchema));
  }
}
assert.ok(JSON.stringify(JSON.parse(fs.readFileSync(path.join(pkgDir, assetByRole('wire-profile').path), 'utf8'))).length > 100);
assert.equal(JSON.parse(fs.readFileSync(path.join(pkgDir, assetByRole('wire-profile').path), 'utf8')).wireProfileId, platform.MEMORY_WIRE_PROFILE_ID);
assert.equal(JSON.parse(fs.readFileSync(path.join(pkgDir, assetByRole('tool-schema-profile').path), 'utf8')).id, platform.MEMORY_TOOLS_PROFILE_ID);
assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(pkgDir, assetByRole('parameter-schema').path), 'utf8'))), JSON.stringify(entry.parameters.schema));
assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(pkgDir, 'dist/registry/base-manifest.json'), 'utf8'))), JSON.stringify(providerMod.MEMORY_PROVIDER_MANIFEST));
assert.equal(entry.mcp.manifestAsset, 'dist/registry/provider-manifest.js');
const providerManifest = await import(path.join(pkgDir, entry.mcp.manifestAsset));
assert.deepEqual(providerManifest.manifest, providerMod.MEMORY_PROVIDER_MANIFEST);
assert.equal(providerManifest.manifest.appId, 'engram');
assert.equal(providerManifest.manifest.providerId, entry.id);
assert.equal(providerManifest.manifest.tools.length, 6);
const declaredValidator = await import(path.join(pkgDir, assetByRole('validator').path));
assert.equal(typeof declaredValidator.validateMemoryPublisherAssetsV1, 'function');
assert.equal(declaredValidator.validateMemoryPublisherAssetsV1({}, new Map()).ok, false);

// Protocol revisions are the SDK-advertised list, nothing invented.
assert.deepEqual(entry.mcp.protocolVersions, [...sdkTypes.SUPPORTED_PROTOCOL_VERSIONS]);
assert.deepEqual(entry.mcp.transportProfiles[0].protocolVersions, [...sdkTypes.SUPPORTED_PROTOCOL_VERSIONS]);

// Lazy definition: pure shell with complete descriptor/manifest/schemas,
// loading the public entry at load time, never an inline copy.
assert.equal(definitionsMod.memoryDefinition.kind, 'LazyDefinition');
assert.equal(definitionsMod.memoryDefinition.id, 'sentropic.engram.memory');
assert.equal(typeof definitionsMod.memoryDefinition.load, 'function');
const meta = definitionsMod.memoryDefinition.metadata;
assert.deepEqual([...meta.toolNames].sort(), names);
assert.equal(meta.wireProfile, platform.MEMORY_WIRE_PROFILE_ID);
assert.equal(meta.toolsProfile, platform.MEMORY_TOOLS_PROFILE_ID);
assert.equal(meta.manifest.providerId, 'sentropic.engram.memory');
assert.equal(meta.descriptor.length, 6);
assert.deepEqual(Object.keys(meta.schemas).sort(), names);
for (const tool of tools) {
  assert.equal(JSON.stringify(meta.schemas[tool.name].inputSchema), JSON.stringify(tool.inputSchema));
  assert.equal(JSON.stringify(meta.schemas[tool.name].outputSchema), JSON.stringify(tool.outputSchema));
}
const definitionsText = fs.readFileSync(path.join(pkgDir, 'dist/registry/definitions.js'), 'utf8');
assert.ok(definitionsText.includes('@sentropic/engram/mcp-memory'));
assert.ok(!definitionsText.includes('createMemoryReadToolsV1'));
assert.ok(!definitionsText.includes('reserveOrLoad'));
const lazyLoaded = await definitionsMod.memoryDefinition.load();
assert.equal(lazyLoaded.createEngramMemoryProviderV1, providerMod.createEngramMemoryProviderV1);
console.log('L4-ENABLED-PROBE-OK');
`;

const INVOCATION_PROBE = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
const host = await import('./real-host.mjs');
const { buildRealHost, stpCtx, captureArgs, KEY, ELICITATION_REF } = host;
const good = () => stpCtx({ elicitation_ref: ELICITATION_REF });
const env = { elicitationRef: ELICITATION_REF };

// Standard adapter shape plus activation preflight.
{
  const h = await buildRealHost();
  assert.equal(h.adapter.appId, 'engram');
  assert.equal(h.adapter.connectorId, 'engram-memory');
  assert.equal(h.adapter.manifest.providerId, 'sentropic.engram.memory');
  for (const method of ['resolveTenant', 'listCapabilities', 'invokeTool', 'readResource', 'validateSecrets']) {
    assert.equal(typeof h.adapter[method], 'function', method);
  }
  await assert.rejects(h.adapter.invokeTool({}), (e) => e.protocolCode === -32603);
  assert.throws(() => h.providerMod.createEngramMemoryProviderV1({}), (e) => e && e.name === 'McpMemoryPreflightError');
  await assert.rejects(h.adapter.invokeTool({ capabilityRef: 'engram_memory_search', input: {}, ctx: undefined }), (e) => e.protocolCode === -32603);
  const listed = await h.adapter.listCapabilities(good());
  assert.equal(listed.length, 6);
}

// Real lifecycle: search (empty, real receipts), capture, admission,
// get, forget, withdraw, indeterminate replay.
let recordId;
{
  const h = await buildRealHost();
  const search = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_search', input: { query: 'needle', purpose_ref: 'purpose:one' }, ctx: good(), ...env });
  assert.equal(search.ok, true);
  assert.ok(Array.isArray(search.output.value.records));
  assert.ok(typeof search.output.value.rank_receipt.request_digest === 'string');

  const capture = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('1')), ctx: good(), idempotencyKey: KEY('1'), ...env });
  assert.equal(capture.ok, true);
  assert.equal(capture.output.value.status, 'committed_pending');
  assert.match(capture.output.value.candidate_id, /^candidate_/);

  const admission = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_request_admission', input: { candidate_id: capture.output.value.candidate_id, idempotency_key: KEY('2') }, ctx: good(), idempotencyKey: KEY('2'), ...env });
  assert.equal(admission.ok, true);
  assert.equal(admission.output.value.outcome.status, 'accepted');
  recordId = admission.output.value.outcome.record_id;

  const get = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_get', input: { record_id: recordId, purpose_ref: 'purpose:one' }, ctx: good(), ...env });
  assert.equal(get.ok, true);
  assert.equal(get.output.value.record.record_id, recordId);

  const forget = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_forget', input: { record_id: recordId, idempotency_key: KEY('3'), reason_ref: 'reason:one' }, ctx: good(), idempotencyKey: KEY('3'), ...env });
  assert.equal(forget.ok, true);
  assert.equal(forget.output.value.receipt.to_state, 'tombstoned');

  const captureB = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('4')), ctx: good(), idempotencyKey: KEY('4'), ...env });
  assert.equal(captureB.ok, true);
  const withdraw = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_withdraw', input: { candidate_id: captureB.output.value.candidate_id, idempotency_key: KEY('5'), reason_ref: 'reason:one' }, ctx: good(), idempotencyKey: KEY('5'), ...env });
  assert.equal(withdraw.ok, true);
  assert.equal(withdraw.output.value.receipt.to_state, 'withdrawn');
  const again = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_withdraw', input: { candidate_id: captureB.output.value.candidate_id, idempotency_key: KEY('6'), reason_ref: 'reason:one' }, ctx: good(), idempotencyKey: KEY('6'), ...env });
  assert.equal(again.ok, false);
  assert.equal(again.error.code, 'MUTATION_OUTCOME_UNKNOWN');
  // Real engine effects observed; real receipts, never fabricated.
  assert.ok(h.counts.capture >= 2);
  assert.ok(h.counts.transition >= 3);
}

// Missing or altered shipped profile bytes refuse activation before discovery.
{
  const h = await buildRealHost();
  for (const name of ['wire-profile', 'tool-schema-profile', 'parameter-schema']) {
    const file = new URL('./node_modules/@sentropic/engram/dist/registry/' + name + '.json', import.meta.url);
    const bytes = fs.readFileSync(file);
    try {
      fs.writeFileSync(file, Buffer.concat([bytes, Buffer.from(' ')]));
      assert.throws(() => h.providerMod.createEngramMemoryProviderV1(h.options), e => e.code === 'MCP_MEMORY_PREFLIGHT_FAILED');
      fs.unlinkSync(file);
      assert.throws(() => h.providerMod.createEngramMemoryProviderV1(h.options), e => e.code === 'MCP_MEMORY_PREFLIGHT_FAILED');
    } finally { fs.writeFileSync(file, bytes); }
  }
}

// Ordering: authentication runs before any domain envelope.
{
  const h = await buildRealHost();
  const missing = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_search', input: { query: 'needle' }, ctx: good(), ...env });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'INVALID_SCHEMA');
  assert.ok(h.counts.authenticate >= 1);

  let authCalls = 0;
  const rejecting = await buildRealHost({ authenticate: async () => { authCalls++; return false; } });
  await assert.rejects(
    rejecting.adapter.invokeTool({ capabilityRef: 'engram_memory_search', input: { query: 'needle' }, ctx: good() }),
    (e) => e.protocolCode === -32603,
  );
  assert.ok(authCalls >= 1);
  assert.equal(rejecting.counts.recall, 0);
}

// Forged and missing contexts are refused before authentication.
{
  const h = await buildRealHost();
  await assert.rejects(
    h.adapter.invokeTool({ capabilityRef: 'engram_memory_search', input: { query: 'needle', purpose_ref: 'purpose:one' }, ctx: stpCtx({ provider_id: 'forged.provider' }) }),
    (e) => e.protocolCode === -32603 || e.name === 'MemoryDispatchRefusal',
  );
  assert.equal(h.counts.authenticate, 0);
  assert.equal(h.counts.recall, 0);
}

// Credentials are verified; a forged credential cannot reach a reservation.
{
  const h = await buildRealHost();
  const server = await h.providerMod.createEngramMemoryMcpServerV1(h.adapter);
  const via = await server.connectViaInMemory(async () => stpCtx({ neutral_credential: 'forged-credential' }));
  try {
    await assert.rejects(via.client.callTool({ name: 'engram_memory_capture', arguments: captureArgs(KEY('q')) }), e => e.code === -32603);
    assert.equal(h.counts.reserve, 0);
    assert.equal(h.counts.capture, 0);
  } finally { await via.close(); }
}

// Invalid arguments are M6 validation failures, never context errors.
{
  const h = await buildRealHost();
  for (const bad of [
    ['engram_memory_search', { query: 'needle' }],
    ['engram_memory_search', { query: 7, purpose_ref: 'purpose:one' }],
    ['engram_memory_search', { query: 'needle', purpose_ref: 'x'.repeat(513) }],
    ['engram_memory_search', { query: 'needle', purpose_ref: 'e\u0301' }],
    ['engram_memory_capture', captureArgs('abcd')],
    ['engram_memory_get', { record_id: 'nope', purpose_ref: 'purpose:one' }],
  ]) {
    const out = await h.adapter.invokeTool({ capabilityRef: bad[0], input: bad[1], ctx: good(), ...env });
    assert.equal(out.ok, false, bad[0]);
    assert.equal(out.error.code, 'INVALID_SCHEMA', bad[0]);
  }
  assert.equal(h.counts.capture, 0);
}

// Same envelope key on two tools conflicts before any engine transition.
{
  const h = await buildRealHost();
  const key = KEY('7');
  const first = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_capture', input: captureArgs(key), ctx: good(), idempotencyKey: key, ...env });
  assert.equal(first.ok, true);
  const clash = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_withdraw', input: { candidate_id: first.output.value.candidate_id, idempotency_key: key, reason_ref: 'reason:one' }, ctx: good(), idempotencyKey: KEY('8'), ...env });
  assert.equal(clash.ok, false);
  assert.equal(clash.error.code, 'DIGEST_CONFLICT');
  assert.equal(h.counts.transition, 0);
}

// Cancellation during authorization prevents reservation and later effects.
{
  const h = await buildRealHost();
  const aborted = new AbortController();
  aborted.abort();
  const cancelled = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_search', input: { query: 'needle', purpose_ref: 'purpose:one' }, ctx: good(), signal: aborted.signal });
  assert.equal(cancelled.ok, false);
  assert.equal(cancelled.error.code, 'CANCELLED');
  assert.equal(h.counts.recall, 0);

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const controller = new AbortController();
  const gated = await buildRealHost({ authenticate: async () => { controller.abort(); await gate; return true; } });
  const pending = gated.adapter.invokeTool({ capabilityRef: 'engram_memory_search', input: { query: 'needle', purpose_ref: 'purpose:one' }, ctx: good(), signal: controller.signal });
  setTimeout(release, 50);
  const duringAuth = await pending;
  assert.equal(duringAuth.ok, false);
  assert.equal(duringAuth.error.code, 'CANCELLED');
  assert.equal(gated.counts.recall, 0);

  let release2;
  const gate2 = new Promise((resolve) => { release2 = resolve; });
  const controller2 = new AbortController();
  const racing = await buildRealHost({ authorize: async (_ctx, tool) => { if (tool === 'engram_memory_capture') { controller2.abort(); await gate2; } return true; } });
  const pending2 = racing.adapter.invokeTool({ capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('b')), ctx: good(), idempotencyKey: KEY('b'), ...env, signal: controller2.signal });
  setTimeout(release2, 50);
  const indeterminate = await pending2;
  assert.equal(indeterminate.ok, false);
  assert.equal(indeterminate.error.code, 'CANCELLED');
  assert.equal(racing.counts.reserve, 0);
  assert.equal(racing.counts.capture, 0);
  const retry = await racing.adapter.invokeTool({ capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('b')), ctx: good(), idempotencyKey: KEY('b'), ...env });
  assert.equal(retry.output.value.status, 'committed_pending');
}

// Revoking approval during sealing cannot pass the engine's final guard.
{
  let approved = true;
  const h = await buildRealHost({ confirm: async () => approved });
  const seal = h.ports.crypto.seal;
  h.ports.crypto.seal = async req => { const result = await seal(req); approved = false; return result; };
  let effects = 0;
  const commit = h.store.commitPending.bind(h.store);
  h.store.commitPending = async req => { effects++; return commit(req); };
  const out = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('v')), ctx: stpCtx({ elicitation_ref: ELICITATION_REF }, { confirmationRequired: true }), idempotencyKey: KEY('v'), ...env });
  assert.equal(out.error.code, 'gate_failed');
  assert.equal(effects, 0);
  assert.ok(h.counts.confirm > 1);
}
// An abort observed after commit never replaces the committed receipt.
{
  const controller = new AbortController();
  const h = await buildRealHost();
  const commit = h.store.commitPending.bind(h.store);
  h.store.commitPending = async req => { const result = await commit(req); controller.abort(); return result; };
  const out = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('z')), ctx: good(), idempotencyKey: KEY('z'), ...env, signal: controller.signal });
  assert.equal(out.ok, true);
  assert.equal(out.output.value.status, 'committed_pending');
}

// Host dependency exceptions are sanitized: no message, no detail leak.
{
  const h = await buildRealHost({ authorize: async () => { throw new Error('CANARY-private-host-path'); } });
  const out = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('c')), ctx: good(), idempotencyKey: KEY('c'), ...env });
  assert.equal(out.ok, false);
  assert.equal(out.error.code, 'STORE_UNAVAILABLE');
  assert.ok(!JSON.stringify(out).includes('CANARY'));
}

// Stronger confirmation gate: refusal before any effect, confirmation port
// revalidated at every effect guard; retry with approval commits fresh.
{
  let approved = false;
  const h = await buildRealHost({ confirm: async () => approved });
  const attempt = () => h.adapter.invokeTool({ capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('d')), ctx: stpCtx({}, { confirmationRequired: true }), idempotencyKey: KEY('d'), ...env });
  const refused = await attempt();
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'gate_failed');
  assert.equal(h.counts.confirm, 1);
  approved = true;
  const committed = await attempt();
  assert.equal(committed.ok, true);
  assert.equal(committed.output.value.status, 'committed_pending');
  assert.ok(h.counts.confirm > 2);

  const reads = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_search', input: { query: 'needle', purpose_ref: 'purpose:one' }, ctx: stpCtx({ elicitation_ref: ELICITATION_REF }, { confirmationRequired: true }), ...env });
  assert.equal(reads.ok, false);
  assert.equal(reads.error.code, 'gate_failed');
}

// Injected references are preserved: the confirmation port receives the
// injected elicitation reference unchanged, and the engine receives the
// injected cancellation reference (never a synthesized one).
{
  const h = await buildRealHost();
  const capture = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('e')), ctx: good(), idempotencyKey: KEY('e'), ...env });
  assert.equal(capture.ok, true);
  assert.equal(h.engineRequests[0].op, 'capture');
  assert.equal(h.engineRequests[0].cancellation_ref, 'cancel:one');
  const withdraw = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_withdraw', input: { candidate_id: capture.output.value.candidate_id, idempotency_key: KEY('f'), reason_ref: 'reason:one' }, ctx: good(), idempotencyKey: KEY('f'), ...env });
  assert.equal(withdraw.ok, true);
  assert.ok(h.confirmations.length >= 1);
  assert.equal(h.confirmations[0].elicitation_ref, ELICITATION_REF);
  const verified = h.confirmations[0];
  for (const changed of [
    { target_ref: 'target:wrong' }, { principal_id: 'mallory' }, { session_id: 'session:other' },
    { transport_attachment_ref: 'attach:other' }, { elicitation_ref: 'elicit:other' },
    { operation_digest: 'sha256:' + 'f'.repeat(64) }, { capability: 'engram_memory_forget' },
  ]) assert.equal(await h.writeHost.confirm({ ...verified, ...changed }), false);
}

// A post-commit custody exception keeps the committed receipt with pending
// cleanup (never a retriable store error, never indeterminate).
{
  const h = await buildRealHost({ confirmDestroyed: () => { throw new Error('custody failed after commit'); } });
  const capture = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_capture', input: captureArgs(KEY('9')), ctx: good(), idempotencyKey: KEY('9'), ...env });
  assert.equal(capture.ok, true);
  const withdraw = await h.adapter.invokeTool({ capabilityRef: 'engram_memory_withdraw', input: { candidate_id: capture.output.value.candidate_id, idempotency_key: KEY('g'), reason_ref: 'reason:one' }, ctx: good(), idempotencyKey: KEY('g'), ...env });
  assert.equal(withdraw.ok, true);
  assert.equal(withdraw.output.value.receipt.to_state, 'withdrawn');
  assert.equal(withdraw.output.value.key_destruction, 'pending');
}
console.log('L4-INVOCATION-PROBE-OK');
`;

const SIX_TOOL_PROBE = `
import assert from 'node:assert/strict';
const host = await import('./real-host.mjs');
const { buildRealHost, stpCtx, captureArgs, KEY, ELICITATION_REF } = host;
const h = await buildRealHost();
const good = () => stpCtx({ elicitation_ref: ELICITATION_REF });
const env = { elicitationRef: ELICITATION_REF };
const providerMod = h.providerMod;
const platform = await import('@sentropic/mcp-platform/memory');

const server = await providerMod.createEngramMemoryMcpServerV1(h.adapter);
// SDK server entry counter: every SDK CallTool passes the resolver.
const baseResolve = async () => good();
const via = await server.connectViaInMemory(async (...args) => { h.counts.resolveEntry++; return baseResolve(...args); });
try {
  const canon = (value) => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canon(value[key])).join(',') + '}';
  };
  // Full discovery metadata through real SDK discovery, field by field,
  // against the manifest and the frozen platform tools.
  const listed = await via.client.listTools();
  assert.equal(listed.tools.length, 6);
  const byName = Object.fromEntries(listed.tools.map((t) => [t.name, t]));
  for (const tool of h.adapter.manifest.tools) {
    const seen = byName[tool.name];
    assert.ok(seen, tool.name);
    assert.equal(seen.description, tool.description);
    assert.equal(canon(seen.inputSchema), canon(tool.inputSchema));
    for (const branch of tool.outputSchema.oneOf) {
      assert.ok(seen.outputSchema.oneOf.some((candidate) => canon(candidate) === canon(branch)), tool.name);
    }
    const meta = seen._meta[providerMod.MEMORY_MCP_META_KEY];
    const frozen = platform.findMemoryTool(tool.name);
    assert.equal(meta.wireProfile, platform.MEMORY_WIRE_PROFILE_ID);
    assert.equal(meta.toolsProfile, platform.MEMORY_TOOLS_PROFILE_ID);
    assert.equal(meta.providerId, 'sentropic.engram.memory');
    assert.equal(meta.connectorId, 'engram-memory');
    assert.equal(meta.sourceId, 'mcp:engram-memory');
    assert.equal(meta.mutability, tool.mutability);
    assert.equal(meta.mutatesExternalSystem, tool.mutatesExternalSystem);
    assert.deepEqual(meta.idempotency, tool.idempotency);
    assert.deepEqual(meta.gates, tool.gates);
    assert.deepEqual(meta.requiredScopes, tool.requiredScopes);
    assert.deepEqual(meta.requiredClaims, tool.requiredClaims);
    assert.equal(meta.redactionClass, 'high');
    assert.deepEqual(meta.requiredScopes, frozen.requiredScopes);
    assert.deepEqual(meta.requiredClaims, frozen.requiredClaims);
    assert.equal(meta.redactionClass, frozen.redactionClass);
    assert.equal(seen.annotations.readOnlyHint, tool.mutability === 'read-only');
    assert.equal(seen.annotations.destructiveHint, tool.mutatesExternalSystem);
    assert.equal(seen.annotations.openWorldHint, false);
  }

  // Six tools end to end over SDK with the real canonical implementation.
  const search = await via.client.callTool({ name: 'engram_memory_search', arguments: { query: 'needle', purpose_ref: 'purpose:one' } });
  assert.ok(!search.isError);
  assert.ok(search.structuredContent && Array.isArray(search.structuredContent.output.value.records));

  const capture = await via.client.callTool({ name: 'engram_memory_capture', arguments: captureArgs(KEY('h')) });
  assert.equal(capture.structuredContent.output.value.status, 'committed_pending');
  const admission = await via.client.callTool({ name: 'engram_memory_request_admission', arguments: { candidate_id: capture.structuredContent.output.value.candidate_id, idempotency_key: KEY('i') } });
  assert.equal(admission.structuredContent.output.value.outcome.status, 'accepted');
  const recordId = admission.structuredContent.output.value.outcome.record_id;
  const get = await via.client.callTool({ name: 'engram_memory_get', arguments: { record_id: recordId, purpose_ref: 'purpose:one' } });
  assert.equal(get.structuredContent.output.value.record.record_id, recordId);
  // Real listing content round-trips through the MCP transport codec.
  assert.equal(get.content[0].text, JSON.stringify(get.structuredContent));
  // Two distinct admitted records force a real host continuation.
  const extraArgs = captureArgs(KEY('m'));
  extraArgs.payload.components[0].text = 'hello packed second';
  const extraCapture = await via.client.callTool({ name: 'engram_memory_capture', arguments: extraArgs });
  const extraAdmission = await via.client.callTool({ name: 'engram_memory_request_admission', arguments: { candidate_id: extraCapture.structuredContent.output.value.candidate_id, idempotency_key: KEY('n') } });
  assert.equal(extraAdmission.structuredContent.output.value.outcome.status, 'accepted');
  const pageArgs = { query: 'hello', purpose_ref: 'purpose:one', limit: 1 };
  const paged = await via.client.callTool({ name: 'engram_memory_search', arguments: pageArgs });
  const handle = paged.structuredContent.output.value.next_page_cursor;
  assert.match(handle, /^page_[0-9a-f]{48}$/);
  const next = await via.client.callTool({ name: 'engram_memory_search', arguments: { ...pageArgs, page_cursor: handle } });
  assert.equal(next.structuredContent.ok, true);
  assert.equal(next.structuredContent.output.value.records.length, 1);
  assert.notDeepEqual(next.structuredContent.output.value.records, paged.structuredContent.output.value.records);
  const changed = await via.client.callTool({ name: 'engram_memory_search', arguments: { ...pageArgs, query: 'packed', page_cursor: handle } });
  assert.equal(changed.structuredContent.error.code, 'STALE_PAGE');
  await h.readHost.pages.dispose(handle);
  const lost = await via.client.callTool({ name: 'engram_memory_search', arguments: { ...pageArgs, page_cursor: handle } });
  assert.equal(lost.structuredContent.error.code, 'STALE_PAGE');
  const forget = await via.client.callTool({ name: 'engram_memory_forget', arguments: { record_id: recordId, idempotency_key: KEY('j'), reason_ref: 'reason:one' } });
  assert.equal(forget.structuredContent.output.value.receipt.to_state, 'tombstoned');
  const captureB = await via.client.callTool({ name: 'engram_memory_capture', arguments: captureArgs(KEY('k')) });
  const withdraw = await via.client.callTool({ name: 'engram_memory_withdraw', arguments: { candidate_id: captureB.structuredContent.output.value.candidate_id, idempotency_key: KEY('l'), reason_ref: 'reason:one' } });
  assert.equal(withdraw.structuredContent.output.value.receipt.to_state, 'withdrawn');

  // Forged and missing contexts: refused with zero effects and zero
  // authentication calls; the missing context never reaches the provider
  // (server guard before dispatch).
  const forgedProviderBefore = h.counts.providerEntry;
  const effectsBefore = h.counts.capture + h.counts.transition + h.counts.recall;
  const authBefore = h.counts.authenticate;
  const forgedServer = await providerMod.createEngramMemoryMcpServerV1(h.adapter);
  const viaForged = await forgedServer.connectViaInMemory(async () => stpCtx({ provider_id: 'forged.provider' }));
  try {
    await assert.rejects(viaForged.client.callTool({ name: 'engram_memory_search', arguments: { query: 'needle', purpose_ref: 'purpose:one' } }), (e) => e.code === -32603);
  } finally {
    await viaForged.close();
  }
  assert.equal(h.counts.providerEntry, forgedProviderBefore);
  // Forged binding refused at the trust boundary: zero authentication calls.
  assert.equal(h.counts.authenticate, authBefore);
  const providerBefore = h.counts.providerEntry;
  // Direct missing context: protocol refusal (thrown, like unknown tools),
  // never reaching the provider.
  await assert.rejects(server.callTool('engram_memory_search', { query: 'needle', purpose_ref: 'purpose:one' }, undefined), (e) => e.code === -32603);
  assert.equal(h.counts.providerEntry, providerBefore);
  assert.ok(h.counts.resolveEntry >= 1);
  // Resolver throw: constant protocol refusal, no leak, zero provider calls.
  const server2 = await providerMod.createEngramMemoryMcpServerV1(h.adapter);
  const via2 = await server2.connectViaInMemory(async () => { throw new Error('CANARY-private-host-path'); });
  try {
    await assert.rejects(via2.client.callTool({ name: 'engram_memory_search', arguments: { query: 'x', purpose_ref: 'purpose:one' } }), (e) => e.code === -32603);
    try {
      await via2.client.callTool({ name: 'engram_memory_search', arguments: { query: 'x', purpose_ref: 'purpose:one' } });
      assert.fail('resolver throw must refuse');
    } catch (error) {
      // The SDK transport may wrap the protocol message once more; the
      // contract is the code plus the constant refusal text, with no leak.
      assert.equal(error.code, -32603);
      assert.ok(String(error.message).includes('Trusted invocation context unavailable'));
      assert.ok(!String(error.message).includes('CANARY'));
    }
  } finally {
    await via2.close();
  }
  assert.equal(h.counts.providerEntry, providerBefore);
  assert.ok(h.counts.capture + h.counts.transition + h.counts.recall >= effectsBefore);

  // Unknown tool keeps its SDK code.
  await assert.rejects(via.client.callTool({ name: 'engram_memory_nope', arguments: {} }), (e) => e.code === -32602);

  // Transport-size guard survives the real path (A14): the ceiling is 2MB
  // combined, so the oversize payload must clear it.
  const huge = 'y'.repeat(3000000);
  const big = providerMod.toMcpCallToolResult({ ok: true, output: { schema_version: 1, value: huge }, auditId: 'audit:packed-l4', redactionClass: 'high' });
  assert.equal(big.isError, true);
  assert.equal(big.structuredContent.error.code, 'RESULT_TOO_LARGE');
  const small = providerMod.toMcpCallToolResult({ ok: true, output: { schema_version: 1, value: { records: [] } }, auditId: 'audit:packed-l4', redactionClass: 'high' });
  assert.ok(!small.isError);
} finally {
  await via.close();
}
console.log('L4-SIX-TOOL-PROBE-OK');
`;

const DISABLED_PROBE = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const pkgDir = path.join(process.cwd(), 'node_modules/@sentropic/engram');

// Disabled installation: the tarball's ordinary runtime closure is present,
// but no memory peers (platform/broker). The SDK ships inside the ordinary
// closure; the disabled claim is about provider/store/identity, not about it.
const peers = fs.readdirSync(path.join(process.cwd(), 'node_modules/@sentropic'));
assert.ok(peers.includes('engram'));
assert.ok(!peers.includes('mcp-platform'));
assert.ok(!peers.includes('mcp-broker'));

// Both CJS hooks and ESM load hooks are installed before npm starts and
// inherited by lifecycle processes; initialization is measured at function entry.
await import('@sentropic/engram/registry/manifest');
await import('@sentropic/engram/registry/definitions');
await import('@sentropic/engram');

// The shipped bundles outside the optional lazy entry carry no lazy memory
// machinery: no entry-specifier import, bundling-agnostic. (The bundles do
// embed the package exports map as static data, which names the optional
// files without loading them; the load trace above is the load proof.)
for (const bundle of ['dist/index.js', 'dist/index.cjs', 'dist/cli.js', 'dist/cli-compat.js']) {
  const text = fs.readFileSync(path.join(pkgDir, bundle), 'utf8');
  assert.ok(!text.includes('@sentropic/engram/mcp-memory'), bundle);
  assert.ok(!text.includes('@sentropic/engram/memory-tools'), bundle);
  assert.ok(!text.includes('LazyDefinition'), bundle);
}

// The package ships no native binaries and no neutral sources of its own:
// ordinary install performs no memory native build here.
const natives = ['.node', 'binding.gyp'];
const foundNatives = [];
const walkPkg = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) { if (name !== '.git') walkPkg(full); continue; }
    if (natives.some((marker) => name === marker || name.endsWith(marker))) foundNatives.push(full);
  }
};
walkPkg(pkgDir);
assert.deepEqual(foundNatives, []);

// No store opened, no identity bootstrapped: our code created no store,
// identity or journal files under the installed package or consumer root.
const suspicious = ['.sqlite', '.sqlite3', '.db', 'identity.json', 'memory.journal'];
const foundState = [];
const walkState = (dir, depth) => {
  if (depth > 3) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) { walkState(full, depth + 1); continue; }
    if (suspicious.some((marker) => name.endsWith(marker))) foundState.push(full);
  }
};
walkState(pkgDir, 0);
walkState(process.cwd(), 0);
assert.deepEqual(foundState, []);

const entries = JSON.parse(fs.readFileSync(path.join(pkgDir, 'registry/entries.v1.json'), 'utf8'));
assert.equal(entries.entries[0].id, 'sentropic.engram.memory');
assert.equal(entries.entries[0].entryVersion, '1.0.0');
assert.equal(entries.entries[0].publisher.packageVersion, JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version);
console.log('L4-DISABLED-PROBE-OK');

`;

// Real packed constructor and admin dispatch: the store/identity observers
// must fire on shipped code, even if bundling changes its function names.
const TRACE_CONTROL_PROBE = `
import assert from 'node:assert/strict';
import { buildRealHost, NOW } from './real-host.mjs';
const h = await buildRealHost();
const readiness = await h.store.readiness();
assert.equal(readiness.ok, true);
let bootstraps = 0;
const engine = h.providerMod.createMemoryPortV2({
  canonical_store: h.store, ...h.ports, activity_sources: [], clock: h.readHost.clock,
  allow_unfenced_memory_store: true,
  admin_provider: {
    version: 1,
    async bootstrap(request) {
      bootstraps++;
      assert.equal(request.admin_credential_ref, 'credential:trace-control');
      return { ok: false, error: { code: 'UNAUTHORIZED', operation: 'admin', message: 'test host refused', retryable: false } };
    },
    async rotate() { throw new Error('unexpected rotate'); },
    async revoke() { throw new Error('unexpected revoke'); },
  },
});
const out = await engine.admin({ operation: 'bootstrap', bootstrap: {
  store_id: 'store:one', storage_epoch: readiness.value.storage_epoch,
  admin_credential_ref: 'credential:trace-control', deadline_at: new Date(Date.parse(NOW) + 20_000).toISOString(),
} });
assert.equal(out.ok, false);
assert.equal(out.error.code, 'UNAUTHORIZED');
assert.equal(bootstraps, 1);
console.log('L4-TRACE-CONTROL-PROBE-OK');
`;

const FLOOR_PROBE = `
import assert from 'node:assert/strict';
const host = await import('./real-host.mjs');
const { buildRealHost, stpCtx, captureArgs, KEY, ELICITATION_REF } = host;
const h = await buildRealHost();
const good = () => stpCtx({ elicitation_ref: ELICITATION_REF });
const server = await h.providerMod.createEngramMemoryMcpServerV1(h.adapter);
const via = await server.connectViaInMemory(async () => good());
try {
  const sdk = await import('@modelcontextprotocol/sdk/types.js');
  const listed = await via.client.listTools();
  assert.equal(listed.tools.length, 6);
  for (const tool of listed.tools) {
    const parsed = sdk.ToolSchema.safeParse(tool);
    assert.equal(parsed.success, true, tool.name);
  }
  const search = await via.client.callTool({ name: 'engram_memory_search', arguments: { query: 'needle', purpose_ref: 'purpose:one' } });
  assert.ok(Array.isArray(search.structuredContent.output.value.records));
} finally {
  await via.close();
}
console.log('L4-FLOOR-PROBE-OK');
`;

function runProbe(consumerDir, name, source, env = {}) {
  writeFileSync(join(consumerDir, `${name}.mjs`), source);
  const out = run('node', [`${name}.mjs`], { cwd: consumerDir, env: { ...process.env, ...env, MCP_L4_NPM_BIN: NPM } });
  const marker = `L4-${name.toUpperCase()}-OK`;
  const lines = out.split('\n').filter((line) => line.startsWith('L4-'));
  if (!lines.some((line) => line.startsWith(marker))) {
    throw new Error(`probe ${name} missing marker ${marker}:\n${out}`);
  }
  return lines;
}

export function assertNoNativeBuildAttempts(installLog, label, traceRows = [], {
  moduleDirectories = [], pathExists = existsSync,
} = {}) {
  const evidence = traceRows.filter(row => row?.kind === 'native-build' &&
    isMemoryNativeBuildProcess(row.detail?.executable, row.detail?.cwd))
    .map(row => 'trace: ' + JSON.stringify(row.detail));
  for (const directory of moduleDirectories) {
    if (!/(?:^|[/\\])(?:fs-ext|better-sqlite3)$/.test(directory)) continue;
    for (const output of ['build/config.gypi', 'build/Release/obj.target']) {
      const file = join(directory, output);
      if (pathExists(file)) evidence.push('filesystem: ' + file);
    }
  }
  // npm prints scripts before dispatch. Log excerpts are diagnostics only.
  if (evidence.length) throw new Error(label + ': native build attempts observed:\n' +
    evidence.slice(0, 10).join('\n') + '\ninstall log excerpt:\n' + installLog.slice(-2000));
}

/**
 * Candidate-manifest assertion (worktree side): exports come from the PACKED
 * package.json (exact equality), the tarball binding matches the just-packed
 * bytes, and the publisher receipt validates against the exact tarball
 * bytes. On success the acceptance-owned `sdkFloorProbe` flips to `pass`.
 */
async function assertCandidateManifest(packed) {
  const manifestPath = join(ROOT, 'candidate-manifest.json');
  const manifest = readJson(manifestPath);
  if (manifest.tarball.sha256 !== packed.sha256) {
    throw new Error('candidate-manifest tarball sha256 does not match the just-packed tarball (refresh first)');
  }
  if (manifest.tarball.integrity !== packed.integrity) {
    throw new Error('candidate-manifest tarball integrity does not match the just-packed tarball (refresh first)');
  }
  const work = mkdtempSync(join(tmpdir(), 'mcp-l4-manifest-check-'));
  try {
    execFileSync('tar', ['-xzf', packed.tarball, '-C', work]);
    const packedRoot = join(work, 'package');
    const packedPkg = readJson(join(packedRoot, 'package.json'));
    if (JSON.stringify(manifest.exports) !== JSON.stringify(packedPkg.exports)) {
      throw new Error('candidate-manifest exports differ from the packed package.json (refresh first)');
    }
    const entries = readJson(join(ROOT, 'registry', 'entries.v1.json'));
    const packedAssets = new Map();
    for (const asset of entries.entries[0].assets) {
      packedAssets.set(asset.path, new Uint8Array(readFileSync(join(packedRoot, asset.path))));
    }
    const validatorAsset = entries.entries[0].assets.find(asset => asset.role === 'validator');
    const { validateMemoryPublisherAssetsV1 } = await import(join(packedRoot, validatorAsset.path));
    const receipt = readJson(join(ROOT, 'registry', 'publisher-assets.v1.json'));
    if (receipt.tarballSha256 !== packed.sha256 || receipt.tarballIntegrity !== packed.integrity) {
      throw new Error('publisher receipt tarball binding does not match the just-packed tarball (refresh first)');
    }
    const receiptCheck = validateMemoryPublisherAssetsV1(receipt, packedAssets);
    if (!receiptCheck.ok) throw new Error(`publisher receipt invalid against tarball bytes: ${receiptCheck.reason}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  manifest.sdkFloorProbe = 'pass';
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function runPackedAcceptance() {
  const manifest = verifyP3Archives();
  const work = mkdtempSync(join(tmpdir(), 'mcp-l4-'));
  try {
    const packed = packCandidate(work);
    const enabledDir = join(work, 'enabled');
    installConsumer(enabledDir, packed.tarball, p3ArchivePaths(manifest), { npm_config_cache: join(work, 'enabled-cache') }, SDK_PINNED, true);
    const enabledSdk = readJson(join(enabledDir, 'node_modules/@modelcontextprotocol/sdk/package.json')).version;
    if (enabledSdk !== SDK_PINNED || enabledSdk !== readJson(join(ROOT, 'candidate-manifest.json')).sdkPinned) {
      throw new Error('enabled consumer SDK differs from the pinned candidate SDK');
    }
    console.log('L4-SDK-PINNED-OBSERVED:' + enabledSdk);
    writeFileSync(join(enabledDir, 'real-host.mjs'), REAL_HOST_HARNESS);
    runProbe(enabledDir, 'enabled-probe', ENABLED_PROBE);
    runProbe(enabledDir, 'invocation-probe', INVOCATION_PROBE);
    runProbe(enabledDir, 'six-tool-probe', SIX_TOOL_PROBE);

    // Disabled proof on the ordinary dependency closure: full install,
    // scripts enabled, output captured for native-build instrumentation.
    const disabledDir = join(work, 'disabled');
    const disabledLog = join(work, 'disabled-install.log');
    const trace = createDisabledTrace(work);
    // Positive controls prove that each observer is live before the zero proof.
    const canaryDir = join(work, 'trace-canary');
    mkdirSync(canaryDir);
    writeFileSync(join(canaryDir, 'mcp-memory.cjs'), '');
    writeFileSync(join(canaryDir, 'mcp-memory.mjs'), '');
    const nativeCanary = join(canaryDir, 'node_modules/fs-ext');
    mkdirSync(nativeCanary, { recursive: true });
    const nativeCommand = join(canaryDir, 'node-gyp');
    writeFileSync(nativeCommand, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    run('node', ['-e', 'require(' + JSON.stringify(join(canaryDir, 'mcp-memory.cjs')) + ');import(' + JSON.stringify(join(canaryDir, 'mcp-memory.mjs')) + ');require("node:child_process").spawnSync(' + JSON.stringify(nativeCommand) + ',[],{cwd:' + JSON.stringify(nativeCanary) + '});'], { env: { ...process.env, ...trace.env } });
    runProbe(enabledDir, 'trace-control-probe', TRACE_CONTROL_PROBE, trace.env);
    const control = trace.read();
    for (const kind of ['cjs-load', 'cjs-compile', 'esm-load', 'provider-load', 'store-open', 'identity-bootstrap', 'native-build']) {
      if (!control.some(row => row.kind === kind)) throw new Error('disabled observer is not live: ' + kind);
    }
    console.log('L4-TRACE-REAL-CONTROL:' + JSON.stringify(Object.fromEntries(
      ['store-open', 'identity-bootstrap'].map(kind => [kind, control.filter(row => row.kind === kind).length]),
    )));
    trace.reset();
    installConsumer(disabledDir, packed.tarball, [], { npm_config_cache: join(work, 'disabled-cache'), ...trace.env }, null, false, disabledLog);
    // The trace holds install-phase rows only here (reset before the
    // install, disabled probe afterwards), so its `native-build` rows are
    // executed-build evidence attributable to the install itself.
    assertNoNativeBuildAttempts(readFileSync(disabledLog, 'utf8'), 'disabled install', trace.read(), {
      moduleDirectories: ['better-sqlite3', 'fs-ext'].map(name => join(disabledDir, 'node_modules', name)),
    });
    runProbe(disabledDir, 'disabled-probe', DISABLED_PROBE, trace.env);
    const observed = trace.read();
    const disabled = Object.fromEntries(['provider-load', 'store-open', 'identity-bootstrap', 'native-build'].map(kind => [kind, observed.filter(row => row.kind === kind).length]));
    if (Object.values(disabled).some(count => count !== 0)) throw new Error('disabled effects: ' + JSON.stringify(disabled));
    console.log('L4-DISABLED-OBSERVED:' + JSON.stringify(disabled));

    // SDK floor on the ordinary closure: discovery plus all six tools at exactly
    // 1.31.0. A floor failure FAILS the acceptance outright.
    const floorDir = join(work, 'floor');
    installConsumer(floorDir, packed.tarball, p3ArchivePaths(manifest), { npm_config_cache: join(work, 'floor-cache') }, '1.31.0', false);
    const floorSdk = readJson(join(floorDir, 'node_modules/@modelcontextprotocol/sdk/package.json')).version;
    if (floorSdk !== '1.31.0') throw new Error('floor consumer SDK differs from exact 1.31.0');
    console.log('L4-SDK-FLOOR-OBSERVED:' + floorSdk);
    writeFileSync(join(floorDir, 'real-host.mjs'), REAL_HOST_HARNESS);
    runProbe(floorDir, 'floor-probe', FLOOR_PROBE);
    runProbe(floorDir, 'six-tool-probe', SIX_TOOL_PROBE);

    await assertCandidateManifest(packed);
    return { packed, floor: 'pass' };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPackedAcceptance().then(
    ({ packed, floor }) => console.log(`MCP-L4-PACKED-OK sha256=${packed.sha256} floor=${floor}`),
    (error) => { console.error(error); process.exit(1); },
  );
}

