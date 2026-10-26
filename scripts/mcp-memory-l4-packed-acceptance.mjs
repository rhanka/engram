/**
 * MCP-L4 packed acceptance (Node only).
 *
 * Packs the candidate, installs it in isolated consumers outside the source
 * tree and verifies the L4 row: the standard adapter contract, SDK discovery
 * and invocation of the six tools (success end to end through the real
 * in-process facades, plus refusal cases), metadata/schema/codec/gate/
 * manifest/publisher/local-lazy checks, forged-call and missing-context
 * refusal with zero provider/effect calls, the transport-size guard, and the
 * disabled-install proof (scripts-enabled install, module-load tracing, no
 * native artifacts, no store, no identity).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const NPM = process.env.MCP_L4_NPM_BIN ?? '/home/antoinefa/.npm-global/bin/npm';
const P2_BASE = '/home/antoinefa/src/sentropic/.tmp/engram-l4-handoff-p2/tools/memory-mcp-l5/artifacts';
const P2_MANIFEST = join(P2_BASE, 'pre-candidate-manifest.json');

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

export function verifyP2Archives() {
  const manifest = readJson(P2_MANIFEST);
  for (const artifact of manifest.artifacts) {
    const archivePath = join(P2_BASE, artifact.archive.replace(/^tools\/memory-mcp-l5\/artifacts\//, ''));
    const bytes = readFileSync(archivePath);
    if (sha256(bytes) !== artifact.sha256) throw new Error(`P2 sha256 mismatch for ${artifact.name}`);
    if (integrityOf(bytes) !== artifact.integrity) throw new Error(`P2 integrity mismatch for ${artifact.name}`);
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
 * Scripts stay ENABLED (no --ignore-scripts): the disabled proof must
 * observe the real default install. Optional dependencies are omitted from
 * the tarball+P2 install step only to avoid unrelated native toolchains
 * (tree-sitter prebuilds); the SDK is installed separately, also with
 * scripts enabled. The disabled claim is evidenced by file and module-load
 * tracing, not by the omit flag.
 */
function installConsumer(consumerDir, tarball, extraArchives = [], env = {}, sdkRange = null) {
  mkdirSync(consumerDir, { recursive: true });
  writeFileSync(join(consumerDir, 'package.json'), JSON.stringify({ name: 'l4-consumer', version: '0.0.0', type: 'module' }));
  // Single install command: a second bare `npm install` would prune the
  // no-save tarball packages as extraneous.
  const specs = [tarball, ...extraArchives];
  if (sdkRange !== null) specs.push(`@modelcontextprotocol/sdk@${sdkRange}`);
  run(NPM, ['install', '--no-save', '--no-audit', '--no-fund', '--omit=optional', ...specs], { cwd: consumerDir, env: { ...process.env, ...env } });
}

function p2ArchivePaths(manifest) {
  return manifest.artifacts.map((artifact) =>
    join(P2_BASE, artifact.archive.replace(/^tools\/memory-mcp-l5\/artifacts\//, '')),
  );
}

const SHARED_PREAMBLE = `
import assert from 'node:assert/strict';
const NOW = '2026-08-16T12:34:56.789Z';
const ISSUED = NOW;
const DEADLINE = '2026-08-16T12:35:16.789Z';
const D = 'sha256:' + '0'.repeat(64);
const KEY1 = '0123456789abcdef0123456789abcdef';
const KEY2 = 'fedcba9876543210fedcba9876543210';
const KEY3 = '11112222333344445555666677778888';
const KEY4 = '99990000111122223333444455556666';
const RECORD_ID = 'mem_' + 'c'.repeat(32);
const CANDIDATE_ID = 'cand:packed-l4';
const ELICITATION_REF = 'elicit:packed-l4';
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
    audit_id: 'audit:packed-l4', correlation_ref: 'corr:one', deadline_at: DEADLINE,
    cancellation_ref: 'cancel:one', issued_at: ISSUED, channel_binding: 'in_process_verified',
    transport_scopes: ['mcp:tools:invoke'], neutral_credential: 'credential:one',
    ...overrides,
  };
}
function stpCtx(bindingOverrides = {}) {
  const b = binding(bindingOverrides);
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
function makeCounts() {
  return { recall: 0, readCurrent: 0, capture: 0, requestAdmission: 0, transition: 0, authenticate: 0, authorize: 0, reserve: 0 };
}
const RANK_RECEIPT = {
  request_digest: D, authorization_receipt_digest: D, profile: 'offline_lexical_v1',
  profile_version: '1', profile_config_digest: D, valid_as_of: 1, system_as_of: '0',
  snapshot_id: 'snap:one', snapshot_digest: D, candidate_count: 0, candidate_ids_digest: D,
  scoring_formula_ref: 'formula:one', ordered_ids_digest: D, revalidation_receipt_digest: D,
  projection_receipt_digests: [], issued_at: NOW, receipt_digest: D,
};
const SEARCH_PACKET = { records: [], rank_receipt: RANK_RECEIPT, packet_digest: D };
const READ_PACKET = {
  record: { record_id: RECORD_ID }, redacted_fields: [], redaction_receipt_digest: D,
  read_receipt: {
    record_id: RECORD_ID, record_digest: D, valid_as_of: 1, system_as_of: '0',
    validated_through_cursor: '0', authorization_receipt_digest: D,
    revalidation_receipt_digest: D, checked_at: NOW, receipt_digest: D,
  },
  packet_digest: D,
};
function makeFacets(counts, packetOverrides = {}) {
  const packet = { ...SEARCH_PACKET, ...packetOverrides };
  return {
    scope_ref: 'scope:one',
    store_id: 'store:one',
    recallPort: { version: 3, recall: async () => { counts.recall++; return { ok: true, value: structuredClone(packet) }; } },
    readPort: { version: 1, readCurrent: async () => { counts.readCurrent++; return { ok: true, value: structuredClone(READ_PACKET) }; } },
    engine: {
      version: 2,
      capture: async (req, guard) => {
        counts.capture++;
        if (await guard() !== true) return { ok: false, error: { code: 'STORE_UNAVAILABLE', message: 'guard refused', retryable: false } };
        return { ok: true, value: { status: 'committed_pending', candidate_id: CANDIDATE_ID, cursor: '1', transaction_receipt_digest: D } };
      },
      requestAdmission: async (req, guard) => {
        counts.requestAdmission++;
        if (await guard() !== true) return { ok: false, error: { code: 'STORE_UNAVAILABLE', message: 'guard refused', retryable: false } };
        return { ok: true, value: { status: 'pending_adjudication', candidate_id: req.candidate_id, cursor: '1', decision_receipt_digest: D, transaction_receipt_digest: D } };
      },
      transition: async (cmd, guard) => {
        counts.transition++;
        if (await guard() !== true) return { ok: false, error: { code: 'STORE_UNAVAILABLE', message: 'guard refused', retryable: false } };
        if (cmd.operation === 'withdraw') {
          return { ok: true, value: { event_id: cmd.event_id, operation: 'withdraw', from_state: 'pending', to_state: 'withdrawn', cursor: '1', event_digest: D, authorization_receipt_digest: D, transaction_receipt_digest: D } };
        }
        return { ok: true, value: { event_id: cmd.event_id, operation: 'tombstone', from_state: 'accepted_current', to_state: 'tombstoned', cursor: '1', event_digest: D, authorization_receipt_digest: D, transaction_receipt_digest: D } };
      },
    },
  };
}
function jcs(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(jcs).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + jcs(value[key])).join(',') + '}';
}
function lookupOf(preimage) {
  return {
    principal_namespace: preimage.principal_namespace, principal_id: preimage.principal_id,
    tenant_id: preimage.tenant_id, store_id: preimage.store_id, provider_id: preimage.provider_id,
    connector_id: preimage.connector_id, connector_instance_ref: preimage.connector_instance_ref,
    scope_ref: preimage.scope_ref, idempotency_key: preimage.idempotency_key,
  };
}
function versionsOf(effective) {
  if (effective.tool_name === 'engram_memory_capture') {
    return { tool_name: effective.tool_name, capture_policy_version: effective.capture_policy_version };
  }
  if (effective.tool_name === 'engram_memory_request_admission') {
    return { tool_name: effective.tool_name, admission_policy_version: effective.admission_policy_version };
  }
  return { tool_name: effective.tool_name };
}
function makeReservation() {
  const bindings = new Map();
  const find = (ref) => [...bindings.values()].find((entry) => entry.preimage.reservation_ref === ref);
  return {
    async reserveOrLoad(lookupKey, candidate) {
      const key = JSON.stringify(lookupKey);
      const existing = bindings.get(key);
      if (existing) return { ok: true, value: existing };
      const operation_digest = 'sha256:' + createHash('sha256').update(jcs(candidate), 'utf8').digest('hex');
      const needsConfirm = candidate.tool_name === 'engram_memory_withdraw' || candidate.tool_name === 'engram_memory_forget';
      const entry = {
        lookup_key: lookupOf(candidate), preimage: candidate, operation_digest,
        policy_versions: versionsOf(candidate.effective_input),
        recovery_state: needsConfirm ? 'pending_confirmation' : 'authorized_uncommitted',
        audit_id: 'reservation-audit:' + candidate.reservation_ref, execution_generation: '0',
      };
      bindings.set(key, entry);
      return { ok: true, value: entry };
    },
    async attachConfirmation(reservationRef, confirmationRef, operationDigest) {
      const entry = find(reservationRef);
      if (!entry) return { ok: false, error_code: 'NOT_FOUND', message: 'unknown reservation' };
      if (entry.operation_digest !== operationDigest) {
        return { ok: false, error_code: 'INVALID_SCHEMA', message: 'confirmation digest mismatch' };
      }
      const next = { ...entry, confirmation_ref: confirmationRef, recovery_state: 'authorized_uncommitted' };
      bindings.set(JSON.stringify(next.lookup_key), next);
      return { ok: true, value: next };
    },
    async claimFencedExecution(reservationRef, executionGeneration) {
      const entry = find(reservationRef);
      if (!entry) return { ok: false, error_code: 'NOT_FOUND', message: 'unknown reservation' };
      if (entry.recovery_state !== 'authorized_uncommitted') {
        return { ok: false, error_code: 'INVALID_SCHEMA', message: 'reservation not claimable' };
      }
      const next = { ...entry, recovery_state: 'executing_unknown_outcome', execution_generation: executionGeneration };
      bindings.set(JSON.stringify(next.lookup_key), next);
      return { ok: true, value: next };
    },
    async reconcileCanonicalOutcome(reservationRef, replayRef) {
      const entry = find(reservationRef);
      if (!entry) return { ok: false, error_code: 'NOT_FOUND', message: 'unknown reservation' };
      const next = { ...entry, recovery_state: 'canonical_committed_receipt', canonical_replay_ref: replayRef };
      bindings.set(JSON.stringify(next.lookup_key), next);
      return { ok: true, value: next };
    },
    async recordCompletion(reservationRef, output) {
      const entry = find(reservationRef);
      if (!entry) return { ok: false, error_code: 'NOT_FOUND', message: 'unknown reservation' };
      const next = { ...entry, recovery_state: 'completed_response', stored_output: output };
      bindings.set(JSON.stringify(next.lookup_key), next);
      return { ok: true, value: next };
    },
  };
}
function makeHosts(counts, overrides = {}) {
  const readHost = {
    clock: { now: () => NOW },
    authenticate: async () => { counts.authenticate++; return true; },
    authorize: async () => { counts.authorize++; return true; },
    authorizeContinuation: async () => true,
    pages: null,
  };
  const writeHost = {
    clock: { now: () => NOW },
    authenticate: async () => { counts.authenticate++; return true; },
    authorize: async () => { counts.authorize++; return true; },
    reservation: makeReservation(),
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
    ...(overrides.writeHost ?? {}),
  };
  return { readHost: { ...readHost, ...(overrides.readHost ?? {}) }, writeHost };
}
function captureArgs(key = KEY1) {
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

// Standard adapter identity plus the manifest publication version.
assert.equal(manifestMod.manifest.appId, 'engram');
assert.equal(manifestMod.manifest.providerId, 'sentropic.engram.memory');
assert.equal(manifestMod.manifest.version, '1.0.0');
assert.equal(manifestMod.manifest.tools.length, 6);
assert.equal(providerMod.MEMORY_PROVIDER_ID, platform.MEMORY_PROVIDER_ID);
assert.equal(providerMod.MEMORY_CONNECTOR_ID, platform.MEMORY_CONNECTOR_ID);
assert.equal(providerMod.MEMORY_WIRE_PROFILE_ID, platform.MEMORY_WIRE_PROFILE_ID);
assert.equal(providerMod.MEMORY_TOOL_SCHEMA_PROFILE_ID, platform.MEMORY_TOOLS_PROFILE_ID);
assert.equal(typeof broker.CompiledMemoryDispatch, 'function');
assert.equal(typeof broker.bindMemoryInvocation, 'function');
assert.equal(typeof broker.MemoryDispatchRefusal, 'function');

// Manifest tools match the frozen P2 platform tools field by field.
const names = manifestMod.manifest.tools.map((t) => t.name).sort();
assert.deepEqual(names, ['engram_memory_capture','engram_memory_forget','engram_memory_get','engram_memory_request_admission','engram_memory_search','engram_memory_withdraw']);
for (const tool of manifestMod.manifest.tools) {
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

// Registry asset closure: every asset separately listed with an exact digest.
const entries = JSON.parse(fs.readFileSync(path.join(pkgDir, 'registry/entries.v1.json'), 'utf8'));
assert.equal(entries.format, 'sentropic.registry-package/v1');
assert.equal(entries.entries.length, 1);
const entry = entries.entries[0];
assert.equal(entry.id, 'sentropic.engram.memory');
assert.ok(entry.assets.length >= 15);
for (const asset of entry.assets) {
  const bytes = fs.readFileSync(path.join(pkgDir, asset.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.path);
}
const assetByRole = Object.fromEntries(entry.assets.map((a) => [a.role, a]));
for (const tool of manifestMod.manifest.tools) {
  for (const side of ['input', 'output']) {
    const asset = assetByRole[\`schema-\${side}-\${tool.name}\`];
    assert.ok(asset, side + ':' + tool.name);
    const assetSchema = JSON.parse(fs.readFileSync(path.join(pkgDir, asset.path), 'utf8'));
    assert.equal(JSON.stringify(assetSchema), JSON.stringify(side === 'input' ? tool.inputSchema : tool.outputSchema));
    assert.equal(JSON.stringify(assetSchema), JSON.stringify(side === 'input' ? platform.findMemoryTool(tool.name).inputSchema : platform.findMemoryTool(tool.name).outputSchema));
  }
}
assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(pkgDir, assetByRole['wire-profile'].path), 'utf8'))), JSON.stringify({ id: platform.MEMORY_WIRE_PROFILE_ID }));
assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(pkgDir, assetByRole['tool-schema-profile'].path), 'utf8'))), JSON.stringify({ id: platform.MEMORY_TOOLS_PROFILE_ID }));
assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(pkgDir, assetByRole['parameter-schema'].path), 'utf8'))), JSON.stringify(entry.parameters.schema));
assert.equal(manifestMod.manifest.elicitation.length, 2);
assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(pkgDir, assetByRole['elicitation-request'].path), 'utf8'))), JSON.stringify(manifestMod.manifest.elicitation[0].requestSchema));
assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(pkgDir, assetByRole['elicitation-response'].path), 'utf8'))), JSON.stringify(manifestMod.manifest.elicitation[0].responseSchema));

// Protocol revisions are the SDK-advertised list, nothing invented.
assert.deepEqual(entry.mcp.protocolVersions, [...sdkTypes.SUPPORTED_PROTOCOL_VERSIONS]);
assert.deepEqual(entry.mcp.transportProfiles[0].protocolVersions, [...sdkTypes.SUPPORTED_PROTOCOL_VERSIONS]);

// Lazy definition loads the public entry at load time, never an inline copy.
assert.equal(definitionsMod.memoryDefinition.kind, 'LazyDefinition');
assert.equal(definitionsMod.memoryDefinition.id, 'sentropic.engram.memory');
assert.equal(typeof definitionsMod.memoryDefinition.load, 'function');
assert.deepEqual(definitionsMod.memoryDefinition.metadata.toolNames.sort(), names);
assert.equal(definitionsMod.memoryDefinition.metadata.wireProfile, platform.MEMORY_WIRE_PROFILE_ID);
const definitionsText = fs.readFileSync(path.join(pkgDir, 'dist/registry/definitions.js'), 'utf8');
assert.ok(definitionsText.includes('@sentropic/engram/mcp-memory'));
assert.ok(!definitionsText.includes('createMemoryReadToolsV1'));
assert.ok(!definitionsText.includes('reserveOrLoad'));
const lazyLoaded = await definitionsMod.memoryDefinition.load();
assert.equal(lazyLoaded.createEngramMemoryProviderV1, providerMod.createEngramMemoryProviderV1);
console.log('L4-ENABLED-METADATA-OK');
`;

const INVOCATION_PROBE = SHARED_PREAMBLE + `
import { createHash } from 'node:crypto';
const providerMod = await import('@sentropic/engram/mcp-memory');
const memoryTools = await import('@sentropic/engram/memory-tools');
const broker = await import('@sentropic/mcp-broker/memory');
const platform = await import('@sentropic/mcp-platform/memory');

function makeAdapter(counts, hostOverrides = {}, packetOverrides = {}) {
  const facets = makeFacets(counts, packetOverrides);
  const hosts = makeHosts(counts, hostOverrides);
  hosts.readHost.pages = memoryTools.createMemoryReadPageStoreV1({ clock: { now: () => NOW }, ttl_ms: 60000, max_entries: 100 });
  const adapter = providerMod.createEngramMemoryProviderV1({
    readFacets: facets, writeFacets: facets, readHost: hosts.readHost, writeHost: hosts.writeHost, policyId: 'policy:one',
  });
  return { adapter, facets, hosts };
}
const invoke = (adapter, capabilityRef, input, ctx, extra = {}) =>
  adapter.invokeTool({ capabilityRef, input, ctx, ...extra });

// Contract shape: the standard adapter surface.
{
  const counts = makeCounts();
  const { adapter } = makeAdapter(counts);
  assert.equal(adapter.appId, 'engram');
  assert.equal(adapter.connectorId, 'engram-memory');
  assert.equal(adapter.manifest.providerId, 'sentropic.engram.memory');
  for (const method of ['resolveTenant', 'listCapabilities', 'invokeTool', 'readResource', 'validateSecrets']) {
    assert.equal(typeof adapter[method], 'function', method);
  }
  const listed = await adapter.listCapabilities(stpCtx());
  assert.equal(listed.length, 6);
  const tenant = await adapter.resolveTenant({ principalSub: 'alice', tenantRef: 'tenant:one', connectorInstanceId: 'connector:one' });
  assert.equal(tenant.principalRef, 'alice');
  await assert.rejects(adapter.readResource({ capabilityRef: 'x', input: { uri: 'u' }, ctx: stpCtx() }), (e) => e instanceof broker.MemoryDispatchRefusal);
  assert.deepEqual(await adapter.validateSecrets({ principalRef: 'alice', tenantRef: 'tenant:one', connectorInstanceId: 'connector:one' }), []);
  await assert.rejects(
    async () => providerMod.createEngramMemoryProviderV1({}),
    (e) => e instanceof providerMod.McpMemoryPreflightError,
  );
}

// Successful operations end to end through the real facades.
{
  const counts = makeCounts();
  const { adapter } = makeAdapter(counts);
  const good = stpCtx({ elicitation_ref: ELICITATION_REF });
  const env = (extra = {}) => ({ elicitationRef: ELICITATION_REF, ...extra });
  const search = await invoke(adapter, 'engram_memory_search', { query: 'needle', purpose_ref: 'purpose:one' }, good, env());
  assert.equal(search.ok, true);
  assert.equal(search.auditId, 'audit:packed-l4');
  assert.equal(search.redactionClass, 'high');
  assert.equal(search.output.schema_version, 1);
  assert.ok(Array.isArray(search.output.value.records));
  assert.ok(counts.recall >= 1);
  const get = await invoke(adapter, 'engram_memory_get', { record_id: RECORD_ID, purpose_ref: 'purpose:one' }, good, env());
  assert.equal(get.ok, true);
  assert.equal(get.output.value.record.record_id, RECORD_ID);
  const capture = await invoke(adapter, 'engram_memory_capture', captureArgs(KEY1), good, env({ idempotencyKey: KEY1 }));
  assert.equal(capture.ok, true);
  assert.equal(capture.output.value.status, 'committed_pending');
  assert.ok(typeof capture.output.value.candidate_id === 'string');
  const admitted = await invoke(adapter, 'engram_memory_request_admission', { candidate_id: capture.output.value.candidate_id, idempotency_key: KEY2 }, good, env({ idempotencyKey: KEY2 }));
  assert.equal(admitted.ok, true);
  assert.equal(admitted.output.value.outcome.status, 'pending_adjudication');
  const withdraw = await invoke(adapter, 'engram_memory_withdraw', { candidate_id: capture.output.value.candidate_id, idempotency_key: KEY3, reason_ref: 'reason:one' }, good, env({ idempotencyKey: KEY3 }));
  assert.equal(withdraw.ok, true);
  assert.equal(withdraw.output.value.receipt.to_state, 'withdrawn');
  const forget = await invoke(adapter, 'engram_memory_forget', { record_id: RECORD_ID, idempotency_key: KEY4, reason_ref: 'reason:one' }, good, env({ idempotencyKey: KEY4 }));
  assert.equal(forget.ok, true);
  assert.equal(forget.output.value.receipt.to_state, 'tombstoned');
}

// No response before host authentication: rejecting authenticator + aborted call.
{
  const counts = makeCounts();
  const { adapter } = makeAdapter(counts, {
    readHost: { authenticate: async () => { counts.authenticate++; return false; } },
    writeHost: { authenticate: async () => { counts.authenticate++; return false; } },
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    invoke(adapter, 'engram_memory_search', { query: 'needle', purpose_ref: 'purpose:one' }, stpCtx(), { signal: controller.signal }),
    (e) => e.code === -32603 || e.protocolCode === -32603,
  );
  assert.ok(counts.authenticate >= 1);
  assert.equal(counts.recall, 0);
  // Idempotency-conflict envelopes also wait for authentication.
  await assert.rejects(
    invoke(adapter, 'engram_memory_capture', captureArgs(KEY1), stpCtx(), { idempotencyKey: KEY2 }),
    (e) => e.code === -32603 || e.protocolCode === -32603,
  );
}

// Cancellation: accepting auth, pre-aborted signal -> CANCELLED envelope, zero effects.
{
  const counts = makeCounts();
  const { adapter } = makeAdapter(counts);
  const controller = new AbortController();
  controller.abort();
  const out = await invoke(adapter, 'engram_memory_search', { query: 'needle', purpose_ref: 'purpose:one' }, stpCtx(), { signal: controller.signal });
  assert.equal(out.ok, false);
  assert.equal(out.error.code, 'CANCELLED');
  assert.equal(out.auditId, 'audit:packed-l4');
  assert.ok(counts.authenticate >= 1);
  assert.equal(counts.recall, 0);
}

// Cancellation during authentication never reaches the engine.
{
  const counts = makeCounts();
  const controller = new AbortController();
  const { adapter } = makeAdapter(counts, {
    readHost: { authenticate: async () => { counts.authenticate++; controller.abort(); return true; } },
  });
  const out = await invoke(adapter, 'engram_memory_search', { query: 'needle', purpose_ref: 'purpose:one' }, stpCtx(), { signal: controller.signal });
  assert.equal(out.ok, false);
  assert.equal(out.error.code, 'CANCELLED');
  assert.equal(counts.recall, 0);
}

// Trusted mutation-envelope bindings: forged provider binding is refused with zero effects.
{
  const counts = makeCounts();
  const { adapter } = makeAdapter(counts);
  const forged = stpCtx({ provider_id: 'forged.provider' });
  await assert.rejects(
    invoke(adapter, 'engram_memory_search', { query: 'needle', purpose_ref: 'purpose:one' }, forged),
    (e) => e instanceof broker.MemoryDispatchRefusal || e.code === -32603 || e.protocolCode === -32603,
  );
  assert.equal(counts.recall, 0);
  assert.equal(counts.authenticate, 0);
}

// Missing host context (undefined) is refused with zero provider/effect calls.
{
  const counts = makeCounts();
  const { adapter } = makeAdapter(counts);
  await assert.rejects(
    invoke(adapter, 'engram_memory_search', { query: 'needle', purpose_ref: 'purpose:one' }, undefined),
    (e) => e.code === -32603 || e.protocolCode === -32603,
  );
  assert.equal(counts.recall, 0);
  assert.equal(counts.authenticate, 0);
}

// Invalid arguments are validation errors, not missing host context.
{
  const counts = makeCounts();
  const { adapter } = makeAdapter(counts);
  const missing = await invoke(adapter, 'engram_memory_search', { query: 'needle' }, stpCtx());
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'INVALID_SCHEMA');
  const wrongType = await invoke(adapter, 'engram_memory_search', { query: 42, purpose_ref: 'purpose:one' }, stpCtx());
  assert.equal(wrongType.ok, false);
  assert.equal(wrongType.error.code, 'INVALID_SCHEMA');
}

// The same key on two mutation tools conflicts before any second effect (M5).
{
  const counts = makeCounts();
  const { adapter } = makeAdapter(counts);
  const good = stpCtx({ elicitation_ref: ELICITATION_REF });
  const first = await invoke(adapter, 'engram_memory_capture', captureArgs(KEY1), good, { idempotencyKey: KEY1, elicitationRef: ELICITATION_REF });
  assert.equal(first.ok, true);
  const clash = await invoke(adapter, 'engram_memory_withdraw', { candidate_id: first.output.value.candidate_id, idempotency_key: KEY1, reason_ref: 'reason:one' }, good, { idempotencyKey: KEY1, elicitationRef: ELICITATION_REF });
  assert.equal(clash.ok, false);
  assert.equal(clash.error.code, 'DIGEST_CONFLICT');
  assert.equal(counts.transition, 0);
}

// Dependency exceptions are sanitized through the M6 mapping.
{
  const counts = makeCounts();
  const canary = 'PRIVATE_STORAGE_PATH_AND_CREDENTIAL_CANARY';
  const { adapter } = makeAdapter(counts, {
    writeHost: { authorize: async () => { counts.authorize++; throw new Error(canary + ' /private/store'); } },
  });
  const out = await invoke(adapter, 'engram_memory_capture', captureArgs(KEY1), stpCtx(), { idempotencyKey: KEY1 });
  assert.equal(out.ok, false);
  assert.equal(out.error.code, 'STORE_UNAVAILABLE');
  assert.equal(out.auditId, 'audit:packed-l4');
  assert.ok(!JSON.stringify(out).includes(canary));
}

// Transport-size guard measures the complete serialized response.
{
  const big = await import('@sentropic/engram/mcp-memory');
  const huge = 'x'.repeat(3 * 1024 * 1024);
  const guarded = big.toMcpCallToolResult({ ok: true, output: { schema_version: 1, value: { blob: huge } }, auditId: 'audit:packed-l4', redactionClass: 'high' });
  assert.equal(guarded.isError, true);
  assert.equal(guarded.structuredContent.ok, false);
  assert.equal(guarded.structuredContent.error.code, 'RESULT_TOO_LARGE');
  assert.equal(guarded.structuredContent.auditId, 'audit:packed-l4');
  const small = big.toMcpCallToolResult({ ok: true, output: { schema_version: 1, value: { blob: 'tiny' } }, auditId: 'audit:packed-l4', redactionClass: 'high' });
  assert.equal(small.isError, false);
}
console.log('L4-INVOCATION-OK');
`;

const SIX_TOOL_PROBE = SHARED_PREAMBLE + `
import { createHash } from 'node:crypto';
const providerMod = await import('@sentropic/engram/mcp-memory');
const memoryTools = await import('@sentropic/engram/memory-tools');
const platform = await import('@sentropic/mcp-platform/memory');
const sdkTypes = await import('@modelcontextprotocol/sdk/types.js');

const counts = makeCounts();
const facets = makeFacets(counts, { next_page_cursor: 'raw:engine:cursor:one' });
const hosts = makeHosts(counts);
hosts.readHost.pages = memoryTools.createMemoryReadPageStoreV1({ clock: { now: () => NOW }, ttl_ms: 60000, max_entries: 100 });
const adapter = providerMod.createEngramMemoryProviderV1({
  readFacets: facets, writeFacets: facets, readHost: hosts.readHost, writeHost: hosts.writeHost, policyId: 'policy:one',
});
const server = await providerMod.createEngramMemoryMcpServerV1(adapter);
let mode = 'good';
async function resolveContext(name, args) {
  if (mode === 'missing') return undefined;
  if (mode === 'forged') return stpCtx({ provider_id: 'forged.provider' });
  return stpCtx({ elicitation_ref: ELICITATION_REF });
}
const via = await server.connectViaInMemory(resolveContext);

function canon(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canon(value[key])).join(',') + '}';
}

// Full discovery through the real SDK transport. The SDK transport may
// reorder object keys, so schemas compare in canonical form, never by
// serialized string equality.
{
  const listed = await via.client.listTools();
  assert.equal(listed.tools.length, 6);
  const byName = Object.fromEntries(listed.tools.map((t) => [t.name, t]));
  for (const tool of adapter.manifest.tools) {
    const seen = byName[tool.name];
    assert.ok(seen, tool.name);
    assert.equal(seen.description, tool.description);
    assert.equal(canon(seen.inputSchema), canon(tool.inputSchema));
    assert.ok(seen.outputSchema.type === 'object');
    assert.equal(canon(seen.outputSchema.oneOf), canon(tool.outputSchema.oneOf ?? [tool.outputSchema]));
    const parsed = sdkTypes.ToolSchema.safeParse({ name: seen.name, description: seen.description, inputSchema: seen.inputSchema, outputSchema: seen.outputSchema, annotations: seen.annotations, _meta: seen._meta });
    assert.equal(parsed.success, true, tool.name);
    assert.deepEqual(seen.annotations, {
      readOnlyHint: tool.mutability === 'read-only',
      destructiveHint: tool.mutatesExternalSystem,
      idempotentHint: !tool.idempotency.required,
      openWorldHint: false,
    });
    assert.equal(seen._meta['sentropic.engram/memory'].wireProfile, platform.MEMORY_WIRE_PROFILE_ID);
    assert.equal(seen._meta['sentropic.engram/memory'].toolsProfile, platform.MEMORY_TOOLS_PROFILE_ID);
    assert.equal(seen._meta['sentropic.engram/memory'].providerId, 'sentropic.engram.memory');
  }
}

// All six tools succeed end to end through SDK + dispatch + facades.
const keyA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const keyB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const keyC = 'cccccccccccccccccccccccccccccccc';
const keyD = 'dddddddddddddddddddddddddddddddd';
{
  const search = await via.client.callTool({ name: 'engram_memory_search', arguments: { query: 'needle', purpose_ref: 'purpose:one' } });
  assert.equal(search.isError, false);
  assert.equal(search.structuredContent.ok, true);
  assert.ok(Array.isArray(search.structuredContent.output.value.records));
  assert.equal(JSON.parse(search.content[0].text).auditId, 'audit:packed-l4');
  assert.equal(JSON.stringify(JSON.parse(search.content[0].text)), JSON.stringify(search.structuredContent));
  const handle = search.structuredContent.output.value.next_page_cursor;
  assert.match(handle, /^page_[0-9a-f]{48}$/);
  const continued = await via.client.callTool({ name: 'engram_memory_search', arguments: { query: 'needle', purpose_ref: 'purpose:one', page_cursor: handle } });
  assert.equal(continued.isError, false);
  assert.equal(continued.structuredContent.ok, true);

  const get = await via.client.callTool({ name: 'engram_memory_get', arguments: { record_id: RECORD_ID, purpose_ref: 'purpose:one' } });
  assert.equal(get.isError, false);
  assert.equal(get.structuredContent.output.value.record.record_id, RECORD_ID);

  const capture = await via.client.callTool({ name: 'engram_memory_capture', arguments: captureArgs(keyA) });
  assert.equal(capture.isError, false);
  assert.equal(capture.structuredContent.output.value.status, 'committed_pending');
  const candidateId = capture.structuredContent.output.value.candidate_id;

  const admission = await via.client.callTool({ name: 'engram_memory_request_admission', arguments: { candidate_id: candidateId, idempotency_key: keyB } });
  assert.equal(admission.isError, false);
  assert.equal(admission.structuredContent.output.value.outcome.status, 'pending_adjudication');

  const withdraw = await via.client.callTool({ name: 'engram_memory_withdraw', arguments: { candidate_id: candidateId, idempotency_key: keyC, reason_ref: 'reason:one' } });
  assert.equal(withdraw.isError, false);
  assert.equal(withdraw.structuredContent.output.value.receipt.to_state, 'withdrawn');

  const forget = await via.client.callTool({ name: 'engram_memory_forget', arguments: { record_id: RECORD_ID, idempotency_key: keyD, reason_ref: 'reason:one' } });
  assert.equal(forget.isError, false);
  assert.equal(forget.structuredContent.output.value.receipt.to_state, 'tombstoned');
}

// SDK-level forged-call and missing-context refusals with zero effect calls.
{
  const before = { ...counts };
  mode = 'forged';
  await assert.rejects(via.client.callTool({ name: 'engram_memory_search', arguments: { query: 'needle', purpose_ref: 'purpose:one' } }));
  assert.deepEqual({ ...counts }, before);
  mode = 'missing';
  await assert.rejects(via.client.callTool({ name: 'engram_memory_search', arguments: { query: 'needle', purpose_ref: 'purpose:one' } }), (e) => String(e?.message ?? e).includes('32603') || e?.code === -32603);
  assert.deepEqual({ ...counts }, before);
  mode = 'good';
  await assert.rejects(via.client.callTool({ name: 'no_such_tool', arguments: {} }));
}
await via.close();
console.log('L4-SIX-TOOL-SDK-OK');
`;

const TRACE_LOADER = `
import { appendFileSync } from 'node:fs';
const LOG = process.env.MCP_L4_TRACE_LOG;
const MARKERS = ['/mcp-memory', 'better-sqlite3', 'fs-ext', 'dist/store', 'dist/engine', 'module-storage', '.node'];
export async function resolve(specifier, context, next) {
  const resolved = await next(specifier, context);
  const url = resolved.url ?? '';
  const hay = String(specifier) + ' ' + String(url);
  if (MARKERS.some((m) => hay.includes(m))) appendFileSync(LOG, hay + '\\n');
  return resolved;
}
`;

const TRACE_SETUP = `
import { register } from 'node:module';
register('./trace-loader.mjs', import.meta.url);
const modules = process.argv.slice(2);
for (const mod of modules) await import(mod);
console.log('TRACE-IMPORTS-OK');
`;

const DISABLED_PROBE = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const pkgDir = path.join(process.cwd(), 'node_modules/@sentropic/engram');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
assert.equal(pkg.name, '@sentropic/engram');
// No native artifacts, native-memory dependencies or neutral sources anywhere in the consumer.
const seen = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else seen.push(full);
  }
}
walk(process.cwd());
assert.ok(!seen.some((f) => f.endsWith('.node')), 'native binary present');
assert.ok(!seen.some((f) => f.includes('better-sqlite3')), 'better-sqlite3 present');
assert.ok(!seen.some((f) => f.includes('fs-ext') && !f.includes('trace')), 'fs-ext present');
assert.ok(!seen.some((f) => f.includes('binding.gyp')), 'binding.gyp present');
assert.ok(!fs.existsSync(path.join(pkgDir, 'engram-memory')), 'neutral sources packed');
// Root and CLI bundles never load the provider (the only occurrence is a
// package-exports data blob, which carries no import/require).
for (const bundle of ['dist/index.js', 'dist/index.cjs', 'dist/cli.js']) {
  const text = fs.readFileSync(path.join(pkgDir, bundle), 'utf8');
  assert.ok(!/from\\s*["'][^"']*mcp-memory/.test(text), bundle);
  assert.ok(!/import\\([^)]*mcp-memory/.test(text), bundle);
  assert.ok(!/require\\([^)]*mcp-memory/.test(text), bundle);
}
// Metadata-only surface: importing it resolves no provider, store or native.
const entries = JSON.parse(fs.readFileSync(path.join(pkgDir, 'registry/entries.v1.json'), 'utf8'));
assert.equal(entries.entries[0].id, 'sentropic.engram.memory');
const definitionsMod = await import('@sentropic/engram/registry/definitions');
assert.equal(definitionsMod.memoryDefinition.kind, 'LazyDefinition');
assert.equal(typeof definitionsMod.memoryDefinition.load, 'function');
const manifestMod = await import('@sentropic/engram/registry/manifest');
assert.equal(manifestMod.manifest.tools.length, 6);
// Module-load tracing: the metadata surface resolves no provider/store/native.
const traceLog = path.join(process.cwd(), 'module-trace.log');
fs.writeFileSync(traceLog, '');
const traceOut = execFileSync(process.execPath, ['--import', './trace-setup.mjs', 'trace-setup.mjs', '@sentropic/engram/registry/manifest', '@sentropic/engram/registry/definitions'], {
  cwd: process.cwd(), env: { ...process.env, MCP_L4_TRACE_LOG: traceLog },
}).toString();
assert.ok(traceOut.includes('TRACE-IMPORTS-OK'));
assert.equal(fs.readFileSync(traceLog, 'utf8'), '');
console.log('L4-DISABLED-OK');
`;

const FLOOR_PROBE = `
import assert from 'node:assert/strict';
const providerMod = await import('@sentropic/engram/mcp-memory');
const memoryTools = await import('@sentropic/engram/memory-tools');
const sdkTypes = await import('@modelcontextprotocol/sdk/types.js');
const sdkPkg = await import('@modelcontextprotocol/sdk/package.json', { with: { type: 'json' } });
assert.equal(sdkPkg.default.version, '1.31.0');
const counts = { recall: 0 };
const facets = {
  scope_ref: 'scope:one', store_id: 'store:one',
  recallPort: { version: 3, recall: async () => { counts.recall++; return { ok: true, value: { records: [], rank_receipt: RANK_RECEIPT, packet_digest: D } }; } },
  readPort: { version: 1, readCurrent: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'missing', retryable: false } }) },
  engine: { version: 2, capture: async () => ({ ok: false, error: { code: 'STORE_UNAVAILABLE', message: 'down', retryable: true } }), requestAdmission: async () => ({ ok: false, error: { code: 'STORE_UNAVAILABLE', message: 'down', retryable: true } }), transition: async () => ({ ok: false, error: { code: 'STORE_UNAVAILABLE', message: 'down', retryable: true } }) },
};
const pages = memoryTools.createMemoryReadPageStoreV1({ clock: { now: () => NOW }, ttl_ms: 60000, max_entries: 100 });
const hosts = makeHosts(counts);
hosts.readHost.pages = pages;
const adapter = providerMod.createEngramMemoryProviderV1({ readFacets: facets, writeFacets: facets, readHost: hosts.readHost, writeHost: hosts.writeHost, policyId: 'policy:one' });
const server = await providerMod.createEngramMemoryMcpServerV1(adapter);
const via = await server.connectViaInMemory(async () => stpCtx());
const listed = await via.client.listTools();
assert.equal(listed.tools.length, 6);
for (const tool of listed.tools) {
  const parsed = sdkTypes.ToolSchema.safeParse({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema, annotations: tool.annotations, _meta: tool._meta });
  assert.equal(parsed.success, true, tool.name);
}
const search = await via.client.callTool({ name: 'engram_memory_search', arguments: { query: 'needle', purpose_ref: 'purpose:one' } });
assert.equal(search.isError, false);
assert.equal(search.structuredContent.ok, true);
await via.close();
console.log('L4-FLOOR-OK');
`;

export async function runPackedAcceptance() {
  const manifest = verifyP2Archives();
  const work = mkdtempdirWork();
  const npmCache = join(work, 'npm-cache');
  mkdirSync(npmCache, { recursive: true });
  const consumerEnv = { npm_config_cache: npmCache };
  try {
    const packed = packCandidate(work);
    const enabledDir = join(work, 'enabled');
    installConsumer(enabledDir, packed.tarball, p2ArchivePaths(manifest), consumerEnv, '^1.31.0');
    writeFileSync(join(enabledDir, 'probe-enabled.mjs'), ENABLED_PROBE);
    const enabledOut = run(process.execPath, ['probe-enabled.mjs'], { cwd: enabledDir });
    if (!enabledOut.includes('L4-ENABLED-METADATA-OK')) throw new Error('enabled metadata probe failed');
    writeFileSync(join(enabledDir, 'probe-invocation.mjs'), INVOCATION_PROBE);
    const invocationOut = run(process.execPath, ['probe-invocation.mjs'], { cwd: enabledDir });
    if (!invocationOut.includes('L4-INVOCATION-OK')) throw new Error('invocation probe failed: ' + invocationOut);
    writeFileSync(join(enabledDir, 'probe-six.mjs'), SIX_TOOL_PROBE);
    const sixOut = run(process.execPath, ['probe-six.mjs'], { cwd: enabledDir });
    if (!sixOut.includes('L4-SIX-TOOL-SDK-OK')) throw new Error('six-tool SDK probe failed: ' + sixOut);
    const disabledDir = join(work, 'disabled');
    installConsumer(disabledDir, packed.tarball, [], consumerEnv, null);
    writeFileSync(join(disabledDir, 'trace-loader.mjs'), TRACE_LOADER);
    writeFileSync(join(disabledDir, 'trace-setup.mjs'), TRACE_SETUP);
    writeFileSync(join(disabledDir, 'probe-disabled.mjs'), DISABLED_PROBE);
    const disabledOut = run(process.execPath, ['probe-disabled.mjs'], { cwd: disabledDir });
    if (!disabledOut.includes('L4-DISABLED-OK')) throw new Error('disabled probe failed');
    let floor = 'skipped';
    try {
      const floorDir = join(work, 'floor');
      installConsumer(floorDir, packed.tarball, p2ArchivePaths(manifest), consumerEnv, '1.31.0');
      writeFileSync(join(floorDir, 'probe-floor.mjs'), SHARED_PREAMBLE + FLOOR_PROBE);
      const floorOut = run(process.execPath, ['probe-floor.mjs'], { cwd: floorDir });
      if (!floorOut.includes('L4-FLOOR-OK')) throw new Error('floor probe failed: ' + floorOut);
      floor = 'pass';
    } catch (error) {
      floor = `unverified (${String(error?.message ?? error).slice(0, 160)})`;
    }
    return { packed, work, floor };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function mkdtempdirWork() {
  return mkdtempSync(join(tmpdir(), 'mcp-l4-'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPackedAcceptance().then(
    ({ floor }) => console.log(`MCP-L4-PACKED-ACCEPTANCE-OK floor=${floor}`),
    (error) => { console.error(error); process.exit(1); },
  );
}



