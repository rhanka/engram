#!/usr/bin/env node
// receipt.mjs — L5-MEMORY-V1 receipt & contract verifier. Lot 0 specifies it; Lot 1 wires it.
// preflight: report outstanding obligations, never emit an accepted checkpoint.
// checkpoint: strict post-run gate, exits nonzero on any failure, never downgrades one.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINNED_IMAGE_DIGEST, UNESTABLISHED_LOT0_OBLIGATIONS, computeTupleSha256, sha512Integrity, validateAgainstSchema, verifyOnDiskEvidence } from './schema-validator.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CHECKPOINT_SCHEMA = JSON.parse(readFileSync(resolve(HERE, 'schemas/checkpoint-v1.schema.json'), 'utf8'));
export const ARTIFACT_MANIFEST_SCHEMA = JSON.parse(readFileSync(resolve(HERE, 'schemas/artifact-manifest-v1.schema.json'), 'utf8'));
export const PROOF_CATALOG = JSON.parse(readFileSync(resolve(HERE, 'proof-catalog-v1.json'), 'utf8'));
export const PROOF_IDS = PROOF_CATALOG.proofs.map((p) => p.id);
export const ACCEPTANCE_ROLES = ['l4', 'platform', 'broker', 'transport'];
export const ARTIFACT_ROLES = ['l4', 'platform', 'broker', 'mesh', 'dependency'];
export const SINGLETON_ARTIFACT_ROLES = ['l4', 'platform', 'broker', 'mesh'];
export const FROZEN_SPEC_SHA256 = 'f90c927964b44fdf6ad712eee9b894762250239384643a3790931c142d3aeeca';
export const FORBIDDEN_IMPORT_PARTS = [
  'cluster-mesh/src', '/mock/', 'mock/oidc', '/testing', 'experimental/', 'createInMemoryContext',
  '/durable', '/elicitation', '/persistence', '/stores', '/audit', 'MemoryRecordStore', 'FileRecordStore', 'InMemoryAuditSink',
];
export { PINNED_IMAGE_DIGEST, UNESTABLISHED_LOT0_OBLIGATIONS, computeTupleSha256, sha512Integrity, validateAgainstSchema };

export const isSha256Hex = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
export const isCommitSha = (v) => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v);
export const isSha512Integrity = (v) => typeof v === 'string' && /^sha512-[A-Za-z0-9+/]{86}==$/.test(v);
export const hasExternalSourceAlias = (v) => typeof v === 'string' && (/^(file:|link:|portal:|workspace:|git\+|github:|https?:|npm:)/i.test(v.trim()) || v.includes('://'));
export const hasPathTraversal = (v) => typeof v !== 'string' || v.length === 0 || v.length > 256 || v.includes('\0') || v.includes(':') || v.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(v) || hasExternalSourceAlias(v);
export const sha256OfBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

const asArr = (v) => (Array.isArray(v) ? v : []);
export function findDuplicateKeys(records, keyFn) {
  const seen = new Set(), dups = new Set();
  for (const r of asArr(records)) { const k = keyFn(r); if (seen.has(k)) dups.add(k); seen.add(k); }
  return [...dups];
}

export function isForbiddenImport(specifier) {
  if (typeof specifier !== 'string' || specifier.length === 0 || hasExternalSourceAlias(specifier)) return true;
  return FORBIDDEN_IMPORT_PARTS.some((part) => specifier.includes(part));
}

export function checkSdkVersion(version) {
  const m = typeof version === 'string' ? version.match(/^(\d+)\.(\d+)\.(\d+)$/) : null;
  return Boolean(m && Number(m[1]) === 1 && Number(m[2]) >= 31);
}

export function checkNodeFloor(version, execArgv = process.execArgv, nodeOptions = process.env.NODE_OPTIONS || '') {
  if (Array.isArray(execArgv) && execArgv.some((arg) => typeof arg === 'string' && arg.includes('sqlite'))) return false;
  if (typeof nodeOptions === 'string' && nodeOptions.includes('sqlite')) return false;
  const m = typeof version === 'string' ? version.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)$/) : null;
  if (!m) return false;
  const [maj, min] = [Number(m[1]), Number(m[2])];
  return maj === 22 ? min >= 13 : maj === 23 ? min >= 4 : maj === 24;
}

export function checkMakeCommand(command) {
  const failures = [];
  if (typeof command !== 'string' || !command.startsWith('make ')) failures.push('make: must start with "make "');
  if (typeof command === 'string' && /(^|\s)-f(\s|$)/.test(command)) failures.push('make: -f bypass is forbidden');
  for (const port of ['API_PORT=9625', 'UI_PORT=5825', 'MAILDEV_UI_PORT=1725']) {
    if (typeof command !== 'string' || !command.includes(port)) failures.push(`make: missing ${port}`);
  }
  const tokens = typeof command === 'string' ? command.trim().split(/\s+/) : [];
  if (!/^ENV=(test|e2e)-feat-memory-mcp-l5$/.test(tokens[tokens.length - 1] || '')) failures.push('make: ENV=<test|e2e>-feat-memory-mcp-l5 must be last');
  return failures;
}

export function checkFixtureProvenance(doc) {
  if (!doc || typeof doc !== 'object') return ['fixtures: not an object'];
  const failures = [];
  if (doc.specSha256 !== FROZEN_SPEC_SHA256) failures.push('fixtures.specSha256: must match frozen v3.1 digest');
  if (!isCommitSha(doc.l0Commit)) failures.push('fixtures.l0Commit: must be a 40-hex commit');
  if (!isSha256Hex(doc.coOwnerReceiptSha256)) failures.push('fixtures.coOwnerReceiptSha256: must be full lowercase SHA-256');
  if (!Array.isArray(doc.files) || doc.files.length === 0) failures.push('fixtures.files: must be nonempty');
  for (const dup of findDuplicateKeys(doc.files, (f) => f && f.path)) failures.push(`fixtures.files: duplicate path ${dup}`);
  for (const f of asArr(doc.files)) if (!f || hasPathTraversal(f.path) || hasPathTraversal(f.upstreamPath) || !isSha256Hex(f.sha256)) failures.push(`fixtures.files/${f && f.path}: invalid entry`);
  return failures;
}

export function checkArtifactManifest(doc, options = {}) {
  const failures = validateAgainstSchema(doc, ARTIFACT_MANIFEST_SCHEMA);
  if (!doc || typeof doc !== 'object') return failures;
  const artifacts = asArr(doc.artifacts), inv = asArr(doc.contractInventory);
  for (const dup of findDuplicateKeys(artifacts, (a) => a && a.name)) failures.push(`manifest.artifacts: duplicate name ${dup}`);
  for (const dup of findDuplicateKeys(artifacts, (a) => a && a.archive)) failures.push(`manifest.artifacts: duplicate archive ${dup}`);
  for (const a of artifacts) {
    if (!a || hasExternalSourceAlias(a.name) || hasExternalSourceAlias(a.version) || hasPathTraversal(a.archive) || !isSha256Hex(a.sha256) || !isSha512Integrity(a.integrity) || !isCommitSha(a.sourceHead)) {
      failures.push(`manifest.artifacts/${a && a.name}: invalid artifact record`);
    }
  }
  const roles = artifacts.map((a) => a && a.role);
  if (doc.stage === 'pre-candidate' && (!roles.includes('platform') || !roles.includes('broker') || roles.includes('l4') || roles.includes('mesh'))) failures.push('manifest.stage: pre-candidate must carry platform and broker only');
  if (doc.stage === 'lot2') {
    const e2 = artifacts.filter((a) => a && a.role === 'e2');
    if (e2.length !== 1 || e2[0].sha256 !== doc.e2ArtifactSha256) failures.push('manifest.stage: lot2 must bind exact e2 artifact');
  }
  if (doc.stage === 'candidate') {
    for (const r of SINGLETON_ARTIFACT_ROLES) if (roles.filter((x) => x === r).length !== 1) failures.push(`manifest.stage: candidate requires exactly one ${r} artifact`);
    const l4 = artifacts.find((a) => a && a.role === 'l4');
    if (!l4 || l4.sha256 !== doc.e4ArtifactSha256) failures.push('manifest.stage: candidate e4ArtifactSha256 must match l4 artifact sha256');
  }
  for (const dup of findDuplicateKeys(inv, (c) => c && c.path)) failures.push(`manifest.contractInventory: duplicate path ${dup}`);
  for (const c of inv) if (!c || hasPathTraversal(c.path) || hasExternalSourceAlias(c.version) || !isSha256Hex(c.sha256)) failures.push(`manifest.contractInventory/${c && c.path}: invalid contract record`);
  if (options.retainedContractInventory && JSON.stringify(inv) !== JSON.stringify(options.retainedContractInventory)) failures.push('manifest.contractInventory: differs from retained pre-candidate');
  return failures;
}

export function checkProofRecords(proofs, expectedManifestSha256, expectedSourceHead, catalog = PROOF_CATALOG, expectedCi = null) {
  const catProofs = asArr(catalog.proofs);
  if (!Array.isArray(proofs) || proofs.length !== catProofs.length) return [`proofs: expected exactly ${catProofs.length} records`];
  const failures = [], ids = proofs.map((p) => p && p.id), expectedIds = catProofs.map((p) => p.id);
  for (const id of ids) if (!expectedIds.includes(id)) failures.push(`proofs: unknown id ${JSON.stringify(id)}`);
  for (const id of expectedIds) if (!ids.includes(id)) failures.push(`proofs: missing id ${id}`);
  for (const dup of findDuplicateKeys(proofs, (p) => p && p.id)) failures.push(`proofs: duplicate id ${dup}`);
  for (const p of proofs) {
    const label = (p && p.id) || '?', r = p && p.result, cat = catProofs.find((x) => x.id === label);
    if (!p || !cat || JSON.stringify(p.files) !== JSON.stringify(cat.files) || p.command !== cat.command || checkMakeCommand(p.command).length > 0) failures.push(`proofs/${label}: files or command mismatch against catalog`);
    if (!r || r.format !== 'vitest-json' || !(Number.isInteger(r.passed) && r.passed >= (cat ? cat.requiredCases.length : 1)) || r.failed !== 0 || r.skipped !== 0 || r.todo !== 0) failures.push(`proofs/${label}: invalid vitest-json counts`);
    if (!r || !isSha256Hex(r.sha256) || !isSha256Hex(r.executedCasesSha256) || !isSha256Hex(p.artifactManifestSha256) || !isCommitSha(p.sourceHead)) failures.push(`proofs/${label}: bad digest or binding`);
    if (isSha256Hex(expectedManifestSha256) && p && p.artifactManifestSha256 !== expectedManifestSha256) failures.push(`proofs/${label}: cross-digest proof reuse`);
    if (isCommitSha(expectedSourceHead) && p && p.sourceHead !== expectedSourceHead) failures.push(`proofs/${label}: stale sourceHead`);
    if (expectedCi && p && (p.runId !== expectedCi.runId || p.attempt !== expectedCi.attempt)) failures.push(`proofs/${label}: runId/attempt mismatch against ci`);
  }
  return failures;
}

export function checkCheckpoint(doc, options = {}) {
  const failures = validateAgainstSchema(doc, CHECKPOINT_SCHEMA);
  if (!doc || typeof doc !== 'object') return failures;
  const src = doc.source || {}, contracts = doc.contracts || {}, pre = doc.preCandidate || {}, closure = doc.closure || {}, rt = doc.runtime || {};
  if (doc.tupleSha256 !== computeTupleSha256(doc)) failures.push('tupleSha256: does not match canonical tuple digest');
  if (contracts.specSha256 !== FROZEN_SPEC_SHA256) failures.push('contracts.specSha256: must match frozen v3.1 digest');
  const rootDir = typeof options.baseDir === 'string' && options.baseDir.length > 0 ? resolve(options.baseDir) : null;
  const preDiskPath = rootDir ? resolve(rootDir, 'tools/memory-mcp-l5/artifacts/pre-candidate-manifest.json') : null;
  const candDiskPath = rootDir ? resolve(rootDir, 'tools/memory-mcp-l5/artifacts/candidate-manifest.json') : null;
  const preBytes = options.preCandidateManifestBytes || (preDiskPath && existsSync(preDiskPath) ? readFileSync(preDiskPath) : null);
  const candBytes = options.candidateManifestBytes || options.manifestBytes || (candDiskPath && existsSync(candDiskPath) ? readFileSync(candDiskPath) : null);
  if (!isSha256Hex(pre.manifestSha256) || !preBytes || sha256OfBytes(preBytes) !== pre.manifestSha256) failures.push('preCandidate.manifestSha256: mismatch or absent preCandidateManifestBytes');
  if (!isSha256Hex(closure.artifactManifestSha256) || !candBytes || sha256OfBytes(candBytes) !== closure.artifactManifestSha256) failures.push('closure.artifactManifestSha256: mismatch or absent candidate manifestBytes');
  let preMfDoc = null, candMfDoc = null;
  try { preMfDoc = preBytes ? JSON.parse(preBytes.toString('utf8')) : null; } catch { failures.push('preCandidate.manifest: invalid JSON'); }
  try { candMfDoc = candBytes ? JSON.parse(candBytes.toString('utf8')) : null; } catch { failures.push('closure.artifactManifest: invalid JSON'); }
  if (!preMfDoc || preMfDoc.stage !== 'pre-candidate' || checkArtifactManifest(preMfDoc).length > 0 || JSON.stringify(preMfDoc.contractInventory) !== JSON.stringify(pre.contractInventory) || preMfDoc.source?.specSha256 !== contracts.specSha256 || preMfDoc.source?.l0Commit !== contracts.l0Commit || preMfDoc.source?.br3Commit !== src.base || preMfDoc.source?.sdkRange !== closure.sdkRange || preMfDoc.source?.declaredLockSha256 !== closure.declaredLockSha256) {
    failures.push('preCandidate.manifest: invalid stage, schema, source, or contractInventory');
  }
  const expectedMfArtifacts = asArr(doc.artifacts).map((a) => a && ({ role: a.role, name: a.name, version: a.version, sha256: a.sha256, integrity: a.integrity, sourceHead: a.sourceHead, archive: a.archiveRef }));
  const candSrcOk = candMfDoc?.source && candMfDoc.source.specSha256 === contracts.specSha256 && candMfDoc.source.l0Commit === contracts.l0Commit && candMfDoc.source.br3Commit === src.base && candMfDoc.source.l5Head === src.head && candMfDoc.source.sdkRange === closure.sdkRange && candMfDoc.source.declaredLockSha256 === closure.declaredLockSha256 && (!preMfDoc?.source || (candMfDoc.source.specSha256 === preMfDoc.source.specSha256 && candMfDoc.source.l0Commit === preMfDoc.source.l0Commit && candMfDoc.source.br3Commit === preMfDoc.source.br3Commit && candMfDoc.source.sdkRange === preMfDoc.source.sdkRange && candMfDoc.source.declaredLockSha256 === preMfDoc.source.declaredLockSha256));
  if (!candMfDoc || candMfDoc.stage !== 'candidate' || checkArtifactManifest(candMfDoc, { retainedContractInventory: pre.contractInventory }).length > 0 || candMfDoc.preCandidateManifestSha256 !== pre.manifestSha256 || JSON.stringify(candMfDoc.l4BuildReceipt) !== JSON.stringify(pre.l4BuildReceipt) || !candSrcOk || JSON.stringify(candMfDoc.artifacts) !== JSON.stringify(expectedMfArtifacts) || (preMfDoc && asArr(preMfDoc.artifacts).some((pa) => !asArr(candMfDoc.artifacts).some((ca) => JSON.stringify(ca) === JSON.stringify(pa))))) {
    failures.push('closure.artifactManifest: candidateManifest.source mismatch or invalid candidate manifest');
  }
  if (options.l4BuildReceipt && options.l4BuildReceipt.builtAgainstPreCandidateSha256 !== pre.manifestSha256) failures.push('preCandidate.l4BuildReceipt: builtAgainstPreCandidateSha256 mismatch');
  if (options.contractComparison && options.contractComparison.identical !== true) failures.push('preCandidate.contractComparison: contract bytes or inventory changed');
  for (const r of SINGLETON_ARTIFACT_ROLES) if (asArr(doc.artifacts).filter((a) => a && a.role === r).length !== 1) failures.push(`artifacts: requires exactly one ${r} role`);
  for (const dup of findDuplicateKeys(doc.artifacts, (a) => a && a.name)) failures.push(`artifacts: duplicate name ${dup}`);
  for (const dup of findDuplicateKeys(doc.artifacts, (a) => a && a.archiveRef)) failures.push(`artifacts: duplicate archiveRef ${dup}`);
  if (closure.sdkRange !== '^1.31.0' || !checkSdkVersion(closure.sdkVersion)) failures.push('closure.sdkVersion: must satisfy ^1.31.0');
  if (closure.referenceExport !== '@sentropic/mcp-broker/memory-reference') failures.push('closure.referenceExport: invalid');
  if (!/^24\.\d+\.\d+$/.test(String(rt.nodeVersion || '')) || !checkNodeFloor(rt.nodeVersion, options.execArgv, options.nodeOptions)) failures.push('runtime.nodeVersion: must be Node 24.x without SQLite flags');
  if (rt.imageDigest !== PINNED_IMAGE_DIGEST || !/^3\.(?:[4-9][0-9]|[1-9][0-9]{2,})\.[0-9]+$/.test(rt.sqliteVersion || '')) failures.push('runtime: invalid imageDigest or sqliteVersion');
  if (rt.driver !== 'node:sqlite' || rt.journalMode !== 'WAL' || rt.synchronous !== 'FULL' || rt.pythonCount !== 0 || rt.addonBuildCount !== 0) failures.push('runtime: invalid sqlite/build invariants');
  const assurance = doc.assurance || {}, graph = doc.importGraph || {}, ci = doc.ci || {}, uat = doc.ownerUat || {};
  if (assurance.qualificationOnly !== true) failures.push('assurance.qualificationOnly: must be true');
  failures.push(...checkProofRecords(doc.proofs, closure.artifactManifestSha256, src.head, PROOF_CATALOG, ci));
  if (graph.forbiddenHits !== 0 || graph.unresolvedEdges !== 0 || JSON.stringify(graph.roots) !== JSON.stringify(PROOF_CATALOG.importGraphRoots)) failures.push('importGraph: forbiddenHits/unresolvedEdges/roots mismatch');
  const expectedArtifactName = `memory-mcp-l5-${src.head}-${ci.runId}-${ci.attempt}`;
  if (ci.workflow !== '.github/workflows/ci.yml' || ci.head !== src.head || ci.base !== src.base || ci.merge !== src.merge || ci.checkout !== src.checkout || ci.imageDigest !== rt.imageDigest || ci.artifactName !== expectedArtifactName) failures.push('ci: tuple metadata mismatch');
  const jobIds = asArr(ci.jobs).map((j) => j && j.id);
  if (!jobIds.includes('memory-l5-qualification') || findDuplicateKeys(ci.jobs, (j) => j && j.id).length > 0) failures.push('ci.jobs: missing or duplicate memory-l5-qualification');
  for (const j of asArr(ci.jobs)) if (!j || j.conclusion !== 'success' || !isSha256Hex(j.resultSha256)) failures.push(`ci job ${j && j.id}: must succeed with a result digest`);
  if (uat.status === 'passed' ? !isSha256Hex(uat.policySha256) : uat.status === 'owner-deferred' ? !['L6', 'L8'].includes(uat.owningLot) : true) failures.push('ownerUat: invalid decision record');
  const roles = asArr(doc.acceptances).map((a) => a && a.role);
  for (const role of ACCEPTANCE_ROLES) if (!roles.includes(role)) failures.push(`acceptances: missing ${role} disposition`);
  for (const dup of findDuplicateKeys(doc.acceptances, (a) => a && a.role)) failures.push(`acceptances: duplicate ${dup} disposition`);
  for (const a of asArr(doc.acceptances)) if (!a || a.verdict !== 'accepted' || a.tupleSha256 !== doc.tupleSha256) failures.push(`acceptances/${a && a.role}: invalid acceptance or tuple mismatch`);
  failures.push(...verifyOnDiskEvidence(doc, PROOF_CATALOG, options));
  return failures;
}

if (process.argv[1] && process.argv[1].endsWith('/receipt.mjs')) {
  const argv = process.argv.slice(2), arg = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const mode = arg('--mode'), checkpointPath = arg('--checkpoint'), manifestPath = arg('--manifest'), preManifestPath = arg('--pre-candidate-manifest');
  if ((mode !== 'preflight' && mode !== 'checkpoint') || !checkpointPath) { console.error('usage: receipt.mjs --mode preflight|checkpoint --checkpoint <path> [--manifest <path>] [--pre-candidate-manifest <path>] [--base-dir <dir>]'); process.exit(2); }
  const baseDir = arg('--base-dir') || dirname(resolve(checkpointPath));
  let doc = null, failures = [];
  try {
    doc = JSON.parse(readFileSync(checkpointPath, 'utf8'));
    const manifestBytes = manifestPath ? (existsSync(manifestPath) ? readFileSync(manifestPath) : Buffer.alloc(0)) : null;
    const preCandidateManifestBytes = preManifestPath ? (existsSync(preManifestPath) ? readFileSync(preManifestPath) : Buffer.alloc(0)) : null;
    failures = checkCheckpoint(doc, { baseDir, manifestBytes, preCandidateManifestBytes, execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS || '' });
  } catch (err) {
    failures = [`checkpoint: ${err && err.message ? err.message : String(err)}`];
  }
  if (mode === 'preflight') { console.log(JSON.stringify({ mode: 'preflight', accepted: false, outstanding: failures }, null, 2)); process.exit(0); }
  if (failures.length > 0) { console.log(JSON.stringify({ mode: 'checkpoint', accepted: false, failures }, null, 2)); process.exit(1); }
  console.log(JSON.stringify({ mode: 'checkpoint', accepted: true, checkpoint: 'L5-MEMORY-V1', tupleSha256: doc.tupleSha256 }, null, 2));
}
