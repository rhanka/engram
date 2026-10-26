/**
 * MCP-L4 packed acceptance (Node only).
 *
 * Packs the candidate, installs it in isolated consumers outside the source
 * tree and verifies the L4 row: SDK discovery/invocation of the six tools,
 * metadata/schema/codec/gate/manifest/publisher/local-lazy checks,
 * forged-call and missing-context refusal, and the disabled-install proof.
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

function installConsumer(consumerDir, tarball, extraArchives = [], env = {}) {
  mkdirSync(consumerDir, { recursive: true });
  writeFileSync(join(consumerDir, 'package.json'), JSON.stringify({ name: 'l4-consumer', version: '0.0.0', type: 'module' }));
  const args = ['install', '--ignore-scripts', '--no-save', '--no-audit', '--no-fund', tarball, ...extraArchives];
  run(NPM, args, { cwd: consumerDir, env: { ...process.env, ...env } });
}

function p2ArchivePaths(manifest) {
  return manifest.artifacts.map((artifact) =>
    join(P2_BASE, artifact.archive.replace(/^tools\/memory-mcp-l5\/artifacts\//, '')),
  );
}

const ENABLED_PROBE = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

const manifestMod = await import('@sentropic/engram/registry/manifest');
const definitionsMod = await import('@sentropic/engram/registry/definitions');
const providerMod = await import('@sentropic/engram/mcp-memory');
const platform = await import('@sentropic/mcp-platform/memory');
const broker = await import('@sentropic/mcp-broker/memory');

assert.equal(manifestMod.manifest.providerId, 'sentropic.engram.memory');
assert.equal(manifestMod.manifest.appId, 'engram');
assert.equal(manifestMod.manifest.version, '1.0.0');
assert.equal(manifestMod.manifest.tools.length, 6);
const names = manifestMod.manifest.tools.map((t) => t.name).sort();
assert.deepEqual(names, ['engram_memory_capture','engram_memory_forget','engram_memory_get','engram_memory_request_admission','engram_memory_search','engram_memory_withdraw']);
for (const tool of manifestMod.manifest.tools) {
  assert.deepEqual(tool.requiredScopes, ['mcp:tools:invoke']);
  assert.deepEqual(tool.requiredClaims, ['sub','tid']);
  assert.equal(tool.redactionClass, 'high');
  assert.equal(tool.gates.requiresPolicy, true);
}
const byName = Object.fromEntries(manifestMod.manifest.tools.map((t) => [t.name, t]));
assert.equal(byName.engram_memory_search.mutability, 'read-only');
assert.equal(byName.engram_memory_search.mutatesExternalSystem, false);
assert.deepEqual(byName.engram_memory_search.idempotency, { required: false });
assert.equal(byName.engram_memory_capture.mutatesExternalSystem, true);
assert.deepEqual(byName.engram_memory_capture.idempotency, { required: true, scope: 'principal' });
assert.equal(byName.engram_memory_withdraw.gates.requiresHumanConfirmation, true);
assert.equal(byName.engram_memory_forget.gates.requiresHumanConfirmation, true);
assert.equal(manifestMod.manifest.elicitation.length, 2);

assert.equal(platform.MEMORY_PROVIDER_ID, 'sentropic.engram.memory');
assert.equal(platform.MEMORY_WIRE_PROFILE_ID, 'sentropic.engram.memory-wire/v1');
assert.equal(platform.MEMORY_TOOLS_PROFILE_ID, 'sentropic.engram.memory-tools/2020-12-v1');
assert.equal(providerMod.MEMORY_WIRE_PROFILE_ID, platform.MEMORY_WIRE_PROFILE_ID);
assert.equal(providerMod.MEMORY_TOOL_SCHEMA_PROFILE_ID, platform.MEMORY_TOOLS_PROFILE_ID);
for (const name of names) {
  assert.ok(platform.isMemoryToolName(name));
  assert.ok(platform.findMemoryTool(name));
}
assert.equal(typeof broker.CompiledMemoryDispatch, 'function');
assert.equal(typeof broker.bindMemoryInvocation, 'function');

assert.equal(definitionsMod.memoryDefinition.kind, 'LazyDefinition');
assert.equal(definitionsMod.memoryDefinition.id, 'sentropic.engram.memory');
assert.equal(typeof definitionsMod.memoryDefinition.load, 'function');
const definitionsText = fs.readFileSync(path.join(pkgDir, 'dist/registry/definitions.js'), 'utf8');
assert.ok(definitionsText.includes('./mcp-memory'));
const lazyLoaded = await definitionsMod.memoryDefinition.load();
assert.equal(typeof (lazyLoaded.createEngramMemoryProviderV1 ?? lazyLoaded.default?.createEngramMemoryProviderV1), 'function');

const entries = JSON.parse(fs.readFileSync(path.join(pkgDir, 'registry/entries.v1.json'), 'utf8'));
assert.equal(entries.format, 'sentropic.registry-package/v1');
assert.equal(entries.entries.length, 1);
console.log('L4-ENABLED-METADATA-OK');
`;

const INVOCATION_PROBE = `
import assert from 'node:assert/strict';
const providerMod = await import('@sentropic/engram/mcp-memory');
const { createMemoryReadPageStoreV1 } = await import('@sentropic/engram/memory-tools');
const NOW = '2026-08-16T12:34:56.789Z';
const ISSUED = NOW;
const DEADLINE = '2026-08-16T12:35:16.789Z';
const D = 'sha256:' + '0'.repeat(64);
const binding = { issuer: 'issuer:one', sub: 'alice', tid: 'tenant:one', claims: ['sub','tid'], claims_provenance_receipt: D, principal_namespace: 'ns:one', principal_id: 'alice', tenant_id: 'tenant:one', tenant_membership_receipt: D, tenant_resolution_source: 'authoritative_membership', agent_id: 'agent:one', mcp_client_id: 'client:one', logical_session_ref: 'session:one', transport_attachment_ref: 'attach:one', connection_proof_digest: D, publisher_id: 'sentropic.engram.memory', provider_id: 'sentropic.engram.memory', connector_id: 'engram-memory', connector_instance_ref: 'connector:one', selected_source_id: 'mcp:engram-memory', store_id: 'store:one', scope_ref: 'scope:one', purpose_ref: 'purpose:one', active_generation: '1', policy_epoch: '1', audit_id: 'audit:packed-l4', correlation_ref: 'corr:one', deadline_at: DEADLINE, cancellation_ref: 'cancel:one', issued_at: ISSUED, channel_binding: 'in_process_verified', transport_scopes: ['mcp:tools:invoke'], neutral_credential: 'credential:one' };
function stpCtx(purpose = 'purpose:one', audit = 'audit:packed-l4', mutateBinding = null) {
  const b = { ...binding, purpose_ref: purpose, audit_id: audit, ...(mutateBinding ?? {}) };
  return { requestId: 'req:one', correlationId: 'corr:one', auditId: audit, principal: { sub: 'alice', claims: { sub: 'alice', tid: 'tenant:one' }, scopes: ['mcp:tools:invoke'], tenantRef: 'tenant:one', authTime: NOW }, surface: 'backend', mcpClient: { clientId: 'client:one', client: 'test' }, session: { mcpSessionId: 'session:one' }, tenantRef: 'tenant:one', connectorInstanceId: 'connector:one', consentRefs: [], grantRefs: [], getSecret: async () => { throw new Error('no secret'); }, connectorConfig: {}, audit: { emit: async () => {} }, logger: {}, memory: { binding: b, expectedActiveGeneration: '1', expectedPolicyEpoch: '1', now: NOW } };
}
let calls = 0;
const fail = async () => { calls++; throw Object.assign(new Error('store down'), { code: 'STORE_UNAVAILABLE' }); };
const facets = { scope_ref: 'scope:one', store_id: 'store:one', recallPort: { version: 3, recall: fail }, readPort: { version: 1, readCurrent: fail } };
const pages = createMemoryReadPageStoreV1({ clock: { now: () => NOW }, ttl_ms: 60000, max_entries: 100 });
const readHost = { clock: { now: () => NOW }, authenticate: async () => true, authorize: async () => true, authorizeContinuation: async () => true, pages };
const engineFacets = { scope_ref: 'scope:one', store_id: 'store:one', engine: { version: 2, capture: fail, requestAdmission: fail, transition: fail } };
const writeHost = { clock: { now: () => NOW }, authenticate: async () => true, authorize: async () => true, reservation: { reserveOrLoad: fail, attachConfirmation: fail, claimFencedExecution: fail, reconcileCanonicalOutcome: fail, recordCompletion: fail }, audit: { append: async () => {} }, policy: { capturePolicyVersion: async () => 'capture-policy/v1', admissionPolicyVersion: async () => 'admission-policy/v1', retention: { max_retention_days: 30, allow_retain_derivative_rule: false }, reconciliation: { consented_family_refs: [] }, anchorKindRef: 'memory:lifecycle', provenanceDigest: async () => D, nextSourceOrder: async () => ({ source_ref: 'source:host', sequence: '1' }) }, confirm: async () => false, keyCustody: { confirmDestroyed: async () => false }, coverage: { verify: async () => ({ complete: false }) } };
const provider = providerMod.createEngramMemoryProviderV1({ readFacets: facets, writeFacets: engineFacets, readHost, writeHost, policyId: 'policy:one' });
const listed = provider.listTools().map((t) => t.name).sort();
assert.deepEqual(listed, ['engram_memory_capture','engram_memory_forget','engram_memory_get','engram_memory_request_admission','engram_memory_search','engram_memory_withdraw']);
const good = stpCtx();
const searchArgs = { query: 'needle', purpose_ref: 'purpose:one' };
const searchRes = await provider.invokeTool('engram_memory_search', searchArgs, good);
assert.equal(searchRes.isError, searchRes.structuredContent.ok === false);
assert.equal(JSON.parse(searchRes.content[0].text).auditId, 'audit:packed-l4');
assert.equal(JSON.stringify(JSON.parse(searchRes.content[0].text)), JSON.stringify(searchRes.structuredContent));
assert.equal(searchRes.structuredContent.auditId, 'audit:packed-l4');
assert.equal(searchRes.structuredContent.redactionClass, 'high');
assert.ok(calls >= 1);
const before = calls;
await assert.rejects(provider.invokeTool('engram_memory_search', searchArgs, undefined), (e) => e.code === -32603);
assert.equal(calls, before);
const forged = stpCtx('purpose:one', 'audit:packed-l4', { provider_id: 'forged.provider' });
await assert.rejects(provider.invokeTool('engram_memory_search', searchArgs, forged), (e) => e.code === -32603);
assert.equal(calls, before);
console.log('L4-INVOCATION-OK');
`;

const SIX_TOOL_PROBE = `
import assert from 'node:assert/strict';
const providerMod = await import('@sentropic/engram/mcp-memory');
const { createMemoryReadPageStoreV1 } = await import('@sentropic/engram/memory-tools');
const NOW = '2026-08-16T12:34:56.789Z';
const DEADLINE = '2026-08-16T12:35:16.789Z';
const D = 'sha256:' + '0'.repeat(64);
const binding = { issuer: 'issuer:one', sub: 'alice', tid: 'tenant:one', claims: ['sub','tid'], claims_provenance_receipt: D, principal_namespace: 'ns:one', principal_id: 'alice', tenant_id: 'tenant:one', tenant_membership_receipt: D, tenant_resolution_source: 'authoritative_membership', agent_id: 'agent:one', mcp_client_id: 'client:one', logical_session_ref: 'session:one', transport_attachment_ref: 'attach:one', connection_proof_digest: D, publisher_id: 'sentropic.engram.memory', provider_id: 'sentropic.engram.memory', connector_id: 'engram-memory', connector_instance_ref: 'connector:one', selected_source_id: 'mcp:engram-memory', store_id: 'store:one', scope_ref: 'scope:one', purpose_ref: 'purpose:one', active_generation: '1', policy_epoch: '1', audit_id: 'audit:packed-l4', correlation_ref: 'corr:one', deadline_at: DEADLINE, cancellation_ref: 'cancel:one', issued_at: NOW, channel_binding: 'in_process_verified', transport_scopes: ['mcp:tools:invoke'], neutral_credential: 'credential:one' };
function stpCtx(purpose = 'purpose:one') {
  const b = { ...binding, purpose_ref: purpose };
  return { requestId: 'req:one', correlationId: 'corr:one', auditId: 'audit:packed-l4', principal: { sub: 'alice', claims: { sub: 'alice', tid: 'tenant:one' }, scopes: ['mcp:tools:invoke'], tenantRef: 'tenant:one', authTime: NOW }, surface: 'backend', mcpClient: { clientId: 'client:one', client: 'test' }, session: { mcpSessionId: 'session:one' }, tenantRef: 'tenant:one', connectorInstanceId: 'connector:one', consentRefs: [], grantRefs: [], getSecret: async () => { throw new Error('x'); }, connectorConfig: {}, audit: { emit: async () => {} }, logger: {}, memory: { binding: b, expectedActiveGeneration: '1', expectedPolicyEpoch: '1', now: NOW } };
}
const facets = { scope_ref: 'scope:one', store_id: 'store:one', recallPort: { version: 3, recall: async () => ({ ok: false, error: { code: 'STORE_UNAVAILABLE', message: 'down', retryable: true } }) }, readPort: { version: 1, readCurrent: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'missing', retryable: false } }) } };
const pages = createMemoryReadPageStoreV1({ clock: { now: () => NOW }, ttl_ms: 60000, max_entries: 100 });
const readHost = { clock: { now: () => NOW }, authenticate: async () => true, authorize: async () => true, authorizeContinuation: async () => true, pages };
const engineFacets = { scope_ref: 'scope:one', store_id: 'store:one', engine: { version: 2, capture: async () => ({ ok: false, error: { code: 'STORE_UNAVAILABLE', message: 'down', retryable: true } }), requestAdmission: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'missing', retryable: false } }), transition: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'missing', retryable: false } }) } };
const writeHost = { clock: { now: () => NOW }, authenticate: async () => true, authorize: async () => true, reservation: { reserveOrLoad: async () => ({ ok: false, error_code: 'STORE_UNAVAILABLE', message: 'down' }), attachConfirmation: async () => ({ ok: false, error_code: 'STORE_UNAVAILABLE', message: 'down' }), claimFencedExecution: async () => ({ ok: false, error_code: 'STORE_UNAVAILABLE', message: 'down' }), reconcileCanonicalOutcome: async () => ({ ok: false, error_code: 'STORE_UNAVAILABLE', message: 'down' }), recordCompletion: async () => ({ ok: false, error_code: 'STORE_UNAVAILABLE', message: 'down' }) }, audit: { append: async () => {} }, policy: { capturePolicyVersion: async () => 'capture-policy/v1', admissionPolicyVersion: async () => 'admission-policy/v1', retention: { max_retention_days: 30, allow_retain_derivative_rule: false }, reconciliation: { consented_family_refs: [] }, anchorKindRef: 'memory:lifecycle', provenanceDigest: async () => D, nextSourceOrder: async () => ({ source_ref: 'source:host', sequence: '1' }) }, confirm: async () => false, keyCustody: { confirmDestroyed: async () => false }, coverage: { verify: async () => ({ complete: false }) } };
const provider = providerMod.createEngramMemoryProviderV1({ readFacets: facets, writeFacets: engineFacets, readHost, writeHost, policyId: 'policy:one' });
const server = await providerMod.createEngramMemoryMcpServerV1(provider);
const good = stpCtx();
const via = await server.connectViaInMemory(async () => good);
const listed = await via.client.listTools();
assert.deepEqual(listed.tools.map((t) => t.name).sort(), ['engram_memory_capture','engram_memory_forget','engram_memory_get','engram_memory_request_admission','engram_memory_search','engram_memory_withdraw']);
const key = '0123456789abcdef0123456789abcdef';
const calls = [
  ['engram_memory_search', { query: 'needle', purpose_ref: 'purpose:one' }],
  ['engram_memory_get', { record_id: 'mem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', purpose_ref: 'purpose:one' }],
  ['engram_memory_capture', { idempotency_key: key, payload: { schema_version: 2, purpose_ref: 'purpose:one', valid_time: { t: 1 }, components: [{ component_id: 'c:one', kind: 'context', text: 'hello', citation_ids: ['cit:one'] }], primary_component_id: 'c:one', primary_event: { at: 1, type_ref: 'type:one', citation_id: 'cit:one' }, citations: [{ citation_id: 'cit:one', source_ref: 'src:one', locator: { scheme: 'test', value: 'v:one' }, content_digest: 'sha256:' + '1'.repeat(64) }] }, evidence: { evidence_ref: 'ev:one', evidence_digest: 'sha256:' + '2'.repeat(64), citation_ids: ['cit:one'] } }],
  ['engram_memory_request_admission', { candidate_id: 'cand:one', idempotency_key: key }],
  ['engram_memory_withdraw', { candidate_id: 'cand:one', idempotency_key: key, reason_ref: 'reason:one' }],
  ['engram_memory_forget', { record_id: 'mem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', idempotency_key: key, reason_ref: 'reason:one' }],
];
for (const [name, args] of calls) {
  const out = await via.client.callTool({ name, arguments: args });
  assert.ok(out.structuredContent);
  assert.equal(out.isError, out.structuredContent.ok === false);
  assert.equal(JSON.parse(out.content[0].text).auditId, 'audit:packed-l4');
}
await via.close();
console.log('L4-SIX-TOOL-SDK-OK');
`;

const DISABLED_PROBE = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const pkgDir = path.join(process.cwd(), 'node_modules/@sentropic/engram');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
assert.ok(!pkg.files.includes('candidate-manifest.json'));
const entries = JSON.parse(fs.readFileSync(path.join(pkgDir, 'registry/entries.v1.json'), 'utf8'));
assert.equal(entries.entries[0].id, 'sentropic.engram.memory');
const definitionsMod = await import('@sentropic/engram/registry/definitions');
assert.equal(definitionsMod.memoryDefinition.kind, 'LazyDefinition');
const manifestMod = await import('@sentropic/engram/registry/manifest');
assert.equal(manifestMod.manifest.tools.length, 6);
const providerMod = await import('@sentropic/engram/mcp-memory');
assert.equal(typeof providerMod.createEngramMemoryProviderV1, 'function');
assert.throws(() => providerMod.createEngramMemoryProviderV1({}), /explicit injected host/);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== '.git') walk(full); }
    else files.push(full);
  }
}
walk(pkgDir);
assert.ok(!files.some((f) => f.endsWith('.node')));
assert.ok(!files.some((f) => f.includes('better-sqlite3')));
const pkgText = fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8');
assert.ok(!pkgText.includes('"better-sqlite3"') || pkgText.includes('optional'));
console.log('L4-DISABLED-OK');
`;

export async function runPackedAcceptance() {
  const manifest = verifyP2Archives();
  const work = mkdtempSync(join(tmpdir(), 'mcp-l4-'));
  const npmCache = join(work, 'npm-cache');
  mkdirSync(npmCache, { recursive: true });
  const consumerEnv = { npm_config_cache: npmCache };
  try {
    const packed = packCandidate(work);
    const enabledDir = join(work, 'enabled');
    installConsumer(enabledDir, packed.tarball, p2ArchivePaths(manifest), consumerEnv);
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
    installConsumer(disabledDir, packed.tarball, [], consumerEnv);
    writeFileSync(join(disabledDir, 'probe-disabled.mjs'), DISABLED_PROBE);
    const disabledOut = run(process.execPath, ['probe-disabled.mjs'], { cwd: disabledDir });
    if (!disabledOut.includes('L4-DISABLED-OK')) throw new Error('disabled probe failed');
    return { packed, work };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPackedAcceptance().then(
    () => console.log('MCP-L4-PACKED-ACCEPTANCE-OK'),
    (error) => { console.error(error); process.exit(1); },
  );
}





