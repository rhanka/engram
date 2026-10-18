// schema-validator.mjs — Closed JSON Schema draft-2020-12 validator & on-disk evidence verifier for L5-MEMORY-V1.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PINNED_IMAGE_DIGEST = 'node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6';
export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const sha512Integrity = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
export const CHECKPOINT_SCHEMA_SHA256 = sha256Hex(readFileSync(resolve(HERE, 'schemas/checkpoint-v1.schema.json')));
export const ARTIFACT_MANIFEST_SCHEMA_SHA256 = sha256Hex(readFileSync(resolve(HERE, 'schemas/artifact-manifest-v1.schema.json')));
export const PROOF_CATALOG_SHA256 = sha256Hex(readFileSync(resolve(HERE, 'proof-catalog-v1.json')));
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const asArr = (v) => (Array.isArray(v) ? v : []);

function readTarEntries(tgzBytes) {
  let tar;
  try { tar = gunzipSync(tgzBytes); } catch { return null; }
  if (!Buffer.isBuffer(tar) || tar.length < 1024 || tar.length % 512 !== 0) return null;
  const entries = new Map();
  for (let off = 0; off + 512 <= tar.length;) {
    const hdr = tar.subarray(off, off + 512);
    if (hdr.every((b) => b === 0)) break;
    if (hdr.subarray(257, 262).toString('ascii') !== 'ustar') return null;
    const name = hdr.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const size = parseInt(hdr.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(), 8);
    if (!name || Number.isNaN(size) || size < 0 || off + 512 + size > tar.length) return null;
    entries.set(name, tar.subarray(off + 512, off + 512 + size));
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return entries.size > 0 ? entries : null;
}

export function canonicalizeJson(value) {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalizeJson(v)).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalizeJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function computeTupleSha256(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const { phase, source, contracts, preCandidate, artifacts, closure, runtime, assurance } = doc;
  const definitionDigests = {
    checkpointSchemaSha256: CHECKPOINT_SCHEMA_SHA256,
    artifactManifestSchemaSha256: ARTIFACT_MANIFEST_SCHEMA_SHA256,
    proofCatalogSha256: PROOF_CATALOG_SHA256,
  };
  return sha256Hex(Buffer.from(canonicalizeJson({ phase, source, contracts, preCandidate, artifacts, closure, runtime, assurance, definitionDigests })));
}

export function validateAgainstSchema(value, rootSchema, node = rootSchema, path = '$') {
  if (!node || typeof node !== 'object') return [];
  if (node.$ref) {
    const refName = node.$ref.replace(/^#\/\$defs\//, '');
    const target = rootSchema.$defs && rootSchema.$defs[refName];
    return target ? validateAgainstSchema(value, rootSchema, target, path) : [`${path}: unresolved $ref ${node.$ref}`];
  }
  const failures = [];
  if (node.oneOf) {
    const branchErrors = node.oneOf.map((branch) => validateAgainstSchema(value, rootSchema, branch, path));
    const matches = branchErrors.filter((errs) => errs.length === 0);
    if (matches.length !== 1) failures.push(`${path}: must match exactly one oneOf branch (matched ${matches.length}): ${branchErrors.flat().join('; ')}`);
    return failures;
  }
  if (node.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${path}: expected object`];
    const props = node.properties || {};
    if (node.additionalProperties === false && Object.getPrototypeOf(value) !== Object.prototype) {
      failures.push(`${path}: additional property __proto__ forbidden`);
    }
    for (const req of node.required || []) if (!hasOwn(value, req)) failures.push(`${path}: missing required property ${req}`);
    if (node.additionalProperties === false) {
      for (const k of Object.getOwnPropertyNames(value)) if (!hasOwn(props, k)) failures.push(`${path}: additional property ${k} forbidden`);
    }
    for (const [k, propSchema] of Object.entries(props)) {
      if (hasOwn(value, k)) failures.push(...validateAgainstSchema(value[k], rootSchema, propSchema, `${path}.${k}`));
    }
    return failures;
  }
  if (node.type === 'array') {
    if (!Array.isArray(value)) return [`${path}: expected array`];
    if (node.minItems !== undefined && value.length < node.minItems) failures.push(`${path}: minItems ${node.minItems} violated`);
    if (node.maxItems !== undefined && value.length > node.maxItems) failures.push(`${path}: maxItems ${node.maxItems} violated`);
    if (node.items) value.forEach((item, idx) => failures.push(...validateAgainstSchema(item, rootSchema, node.items, `${path}[${idx}]`)));
    return failures;
  }
  if (node.type === 'string') {
    if (typeof value !== 'string') return [`${path}: expected string`];
    if (node.minLength !== undefined && value.length < node.minLength) failures.push(`${path}: minLength ${node.minLength} violated`);
    if (node.maxLength !== undefined && value.length > node.maxLength) failures.push(`${path}: maxLength ${node.maxLength} violated`);
    if (node.pattern && !new RegExp(node.pattern).test(value)) failures.push(`${path}: pattern mismatch`);
    if (node.format === 'date-time' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) || Number.isNaN(Date.parse(value)))) {
      failures.push(`${path}: invalid date-time format`);
    }
  } else if (node.type === 'integer') {
    if (!Number.isInteger(value)) return [`${path}: expected integer`];
    if (node.minimum !== undefined && value < node.minimum) failures.push(`${path}: minimum ${node.minimum} violated`);
    if (node.maximum !== undefined && value > node.maximum) failures.push(`${path}: maximum ${node.maximum} violated`);
  } else if (node.type === 'boolean' && typeof value !== 'boolean') {
    return [`${path}: expected boolean`];
  }
  if (node.const !== undefined && value !== node.const) failures.push(`${path}: must equal ${JSON.stringify(node.const)}`);
  if (node.enum && !node.enum.includes(value)) failures.push(`${path}: must be one of ${JSON.stringify(node.enum)}`);
  return failures;
}

export const UNESTABLISHED_LOT0_OBLIGATIONS = Object.freeze([
  'provenance.predecessors: pendingPredecessorMappings remain unresolved (BR3/L5-F1)',
  'importGraph.resolver: tools/memory-mcp-l5/import-graph.mjs is not yet implemented (Lot 1 obligation)',
  'assurance.verifier: tools/memory-mcp-l5/verifier.mjs is not yet implemented (Lot 2 obligation)',
  'ci.provenance: trusted CI run provenance is not established by local evidence files',
  'ownerUat.provenance: authenticated owner decision provenance is not established by local actorRef strings',
  'acceptances.provenance: authenticated co-owner acceptance provenance is not established by local actorRef strings',
]);

function resolvePkgSubpath(rootDir, spec) {
  const parts = String(spec || '').split('/');
  if (parts.length < 2) return null;
  const pkgName = `${parts[0]}/${parts[1]}`, sub = parts.length > 2 ? `./${parts.slice(2).join('/')}` : '.';
  try {
    const pkg = JSON.parse(readFileSync(resolve(rootDir, `installed/node_modules/${pkgName}/package.json`), 'utf8'));
    const exp = pkg?.exports?.[sub], relTarget = typeof exp === 'string' ? exp : (exp?.import || exp?.default);
    return typeof relTarget === 'string' ? `installed/node_modules/${pkgName}/${relTarget.replace(/^\.?\//, '')}` : null;
  } catch { return null; }
}

function scanImportGraphFiles(rootDir, startFiles, failures) {
  const queue = [...startFiles], visited = new Set(), edges = [];
  const exts = ['', '.ts', '.js', '.mjs', '.d.ts', '/index.ts', '/index.js', '/index.mjs', '/index.d.ts'];
  while (queue.length > 0) {
    const fp = queue.shift();
    if (!fp || visited.has(fp) || !existsSync(resolve(rootDir, fp))) continue;
    visited.add(fp);
    const code = readFileSync(resolve(rootDir, fp), 'utf8');
    if (/\bimport\s*\(\s*(?!['"][^'"]+['"]\s*\))/.test(code)) failures.push(`importGraph: computed dynamic import in ${fp}`);
    const specs = [
      ...[...code.matchAll(/\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ...[...code.matchAll(/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
    ];
    for (const sp of specs) {
      if (/mock|fixture|test-helper|in-memory|fake|stub|better-sqlite3/i.test(sp) || /^@sentropic\/[^/]+\/src(?:\/|$)/.test(sp)) {
        failures.push(`importGraph: forbidden import ${sp} in ${fp}`);
      }
      if (sp.startsWith('.')) {
        const hit = exts.map((ext) => resolve(dirname(resolve(rootDir, fp)), `${sp}${ext}`)).find((cand) => {
          const r = relative(rootDir, cand);
          return !r.startsWith('..') && !r.startsWith('/') && existsSync(cand);
        });
        if (!hit) { failures.push(`importGraph: unresolved import ${sp} in ${fp}`); continue; }
        const toRel = relative(rootDir, hit).replace(/\\/g, '/');
        if (fp.startsWith('packages/') && toRel.startsWith('packages/') && fp.split('/')[1] !== toRel.split('/')[1]) {
          failures.push(`importGraph: sibling source import ${sp} in ${fp}`);
        }
        edges.push({ from: fp, specifier: sp, to: toRel });
        queue.push(toRel);
      } else if (sp.startsWith('@sentropic/')) {
        const toPkg = resolvePkgSubpath(rootDir, sp);
        if (!toPkg || !existsSync(resolve(rootDir, toPkg))) { failures.push(`importGraph: unresolved package import ${sp} in ${fp}`); continue; }
        edges.push({ from: fp, specifier: sp, to: toPkg });
        queue.push(toPkg);
      }
    }
  }
  return edges;
}

export function verifyOnDiskEvidence(doc, catalog, options = {}) {
  const baseDir = options.baseDir;
  if (typeof baseDir !== 'string' || baseDir.length === 0) return ['evidence: baseDir is required to verify on-disk proof files'];
  const failures = [], rootDir = resolve(baseDir);
  const readChecked = (relPath, expectedSha, label) => {
    if (typeof relPath !== 'string' || relPath.length === 0) { failures.push(`${label}: missing path`); return null; }
    const abs = resolve(rootDir, relPath), rel = relative(rootDir, abs);
    if (rel.startsWith('..') || rel.startsWith('/') || !existsSync(abs)) { failures.push(`${label}: missing on-disk file ${relPath}`); return null; }
    const bytes = readFileSync(abs);
    if (!expectedSha || sha256Hex(bytes) !== expectedSha) { failures.push(`${label}: sha256 mismatch for ${relPath}`); return null; }
    return bytes;
  };
  const readJson = (ref, label) => {
    const bytes = ref ? readChecked(ref.path, ref.sha256, label) : null;
    if (!bytes) return null;
    try { return JSON.parse(bytes.toString('utf8')); } catch { failures.push(`${label}: invalid JSON in ${ref.path}`); return null; }
  };
  const src = doc.source || {}, c = doc.contracts || {}, pre = doc.preCandidate || {}, closure = doc.closure || {};
  const treeDoc = readJson({ path: 'receipts/source-tree.json', sha256: src.sourceTreeSha256 }, 'source.sourceTreeSha256');
  const treeFiles = asArr(treeDoc?.files), treePaths = new Set();
  if (!treeDoc || treeDoc.repository !== src.repository || treeDoc.head !== src.head || treeDoc.base !== src.base || treeDoc.merge !== src.merge || treeDoc.checkout !== src.checkout || treeFiles.length === 0) {
    failures.push('source.sourceTree: tree metadata or empty files mismatch');
  }
  for (const tf of treeFiles) {
    if (!tf?.path || treePaths.has(tf.path)) failures.push(`source.sourceTree: duplicate or invalid file ${tf?.path}`);
    treePaths.add(tf?.path);
    readChecked(tf?.path, tf?.sha256, `source.sourceTree/${tf?.path}`);
  }
  for (const rp of [...asArr(catalog.importGraphRoots).filter((r) => !String(r).startsWith('@sentropic/')), ...asArr(pre.contractInventory).map((x) => x?.path), ...asArr(c.schemas).map((x) => x?.path), ...asArr(catalog.immutableFixtures)]) {
    if (rp && !treePaths.has(rp)) failures.push(`source.sourceTree: missing required tracked file ${rp}`);
  }
  readChecked('packages/mcp-platform/dist/registry.d.ts', c.registrySha256, 'contracts.registrySha256');
  readChecked('packages/cluster-mesh/dist/compose/mcp.d.ts', c.gatewaySha256, 'contracts.gatewaySha256');
  const freezeDoc = readJson(c.l0Freeze, 'contracts.l0Freeze');
  if (!freezeDoc || freezeDoc.specSha256 !== c.specSha256 || freezeDoc.l0Commit !== c.l0Commit || freezeDoc.imageDigest !== PINNED_IMAGE_DIGEST || freezeDoc.checkpointSchemaSha256 !== CHECKPOINT_SCHEMA_SHA256 || freezeDoc.artifactManifestSchemaSha256 !== ARTIFACT_MANIFEST_SCHEMA_SHA256 || freezeDoc.proofCatalogSha256 !== PROOF_CATALOG_SHA256) {
    failures.push('contracts.l0Freeze: freeze metadata or schema/catalog hash mismatch');
  }
  for (const reqFix of asArr(catalog.immutableFixtures)) {
    const entry = asArr(freezeDoc?.immutableFixtures).find((f) => f && f.path === reqFix);
    readChecked(reqFix, entry?.sha256, `immutableFixtures/${reqFix}`);
  }
  for (const k of ['entry', 'providerManifest']) readChecked(c[k]?.path, c[k]?.sha256, `contracts.${k}`);
  for (const listKey of ['fixtures', 'exports', 'schemas', 'profiles']) {
    for (const item of asArr(c[listKey])) readChecked(item?.path, item?.sha256, `contracts.${listKey}/${item?.path}`);
  }
  const retainedInv = asArr(pre.contractInventory);
  if (retainedInv.length === 0) failures.push('preCandidate.contractInventory: missing contractInventory entries');
  for (const item of retainedInv) {
    const retainedBytes = readChecked(`retained/${item?.path}`, item?.sha256, `preCandidate.retained/${item?.path}`);
    const qualifiedBytes = readChecked(item?.path, item?.sha256, `preCandidate.qualified/${item?.path}`);
    if (retainedBytes && qualifiedBytes && Buffer.compare(retainedBytes, qualifiedBytes) !== 0) failures.push(`preCandidate.contractInventory: byte mismatch on ${item?.path}`);
  }
  const l4Artifact = asArr(doc.artifacts).find((a) => a && a.role === 'l4');
  const l4Receipt = readJson(pre.l4BuildReceipt, 'preCandidate.l4BuildReceipt');
  if (!l4Receipt || l4Receipt.builtAgainstPreCandidateSha256 !== pre.manifestSha256 || !l4Artifact || l4Receipt.e4ArtifactSha256 !== l4Artifact.sha256 || l4Receipt.sourceHead !== l4Artifact.sourceHead) {
    failures.push('preCandidate.l4BuildReceipt: invalid E4 build binding');
  }
  const compDoc = readJson(pre.contractComparison, 'preCandidate.contractComparison');
  if (!compDoc || compDoc.identical !== true || compDoc.preCandidateManifestSha256 !== pre.manifestSha256 || compDoc.candidateManifestSha256 !== closure.artifactManifestSha256 || JSON.stringify(compDoc.contracts) !== JSON.stringify(retainedInv)) {
    failures.push('preCandidate.contractComparison: invalid comparison record');
  }
  for (const a of asArr(doc.artifacts)) {
    const bytes = readChecked(a?.archiveRef, a?.sha256, `artifacts/${a?.name}`);
    if (bytes && sha512Integrity(bytes) !== a?.integrity) failures.push(`artifacts/${a?.name}: sha512 integrity mismatch`);
    const entries = bytes ? readTarEntries(bytes) : null;
    let pkgJson = null;
    try { pkgJson = entries?.has('package/package.json') ? JSON.parse(entries.get('package/package.json').toString('utf8')) : null; } catch { pkgJson = null; }
    if (!entries || !pkgJson || pkgJson.name !== a?.name || pkgJson.version !== a?.version) {
      failures.push(`artifacts/${a?.name}: invalid tar.gz archive or package.json`); continue;
    }
    for (const [entryName, entryBytes] of entries.entries()) {
      if (!entryName.startsWith('package/')) { failures.push(`artifacts/${a?.name}: unexpected tar entry ${entryName}`); continue; }
      readChecked(`installed/node_modules/${a.name}/${entryName.slice('package/'.length)}`, sha256Hex(entryBytes), `installed/${a.name}/${entryName}`);
    }
  }
  const rt = doc.runtime || {}, assurance = doc.assurance || {}, ci = doc.ci || {};
  const declLock = readJson({ path: 'package-lock.json', sha256: closure.declaredLockSha256 }, 'closure.declaredLockSha256');
  const instLock = readJson({ path: 'receipts/installed-lock.json', sha256: closure.installedLockSha256 }, 'closure.installedLockSha256');
  const sdkPkg = declLock?.packages?.['node_modules/@modelcontextprotocol/sdk'], instSdkPkg = instLock?.packages?.['node_modules/@modelcontextprotocol/sdk'];
  if (!declLock || !instLock || instLock.sdkVersion !== closure.sdkVersion || instLock.sdkRange !== closure.sdkRange || JSON.stringify(instLock.protocolVersions) !== JSON.stringify(closure.protocolVersions) || sdkPkg?.version !== closure.sdkVersion || instSdkPkg?.version !== closure.sdkVersion) {
    failures.push('closure.installedLock: SDK lock metadata mismatch');
  }
  for (const k of [...Object.keys(declLock?.packages || {}), ...Object.keys(instLock?.packages || {})]) {
    if (k.includes('better-sqlite3')) failures.push(`closure.installedLock: forbidden package ${k}`);
  }
  for (const a of asArr(doc.artifacts)) {
    const lp = instLock?.packages?.[`node_modules/${a?.name}`], dp = declLock?.packages?.[`node_modules/${a?.name}`];
    if (!lp || !dp || lp.version !== a?.version || dp.version !== a?.version || lp.sha256 !== a?.sha256 || lp.integrity !== a?.integrity || lp.resolved !== a?.archiveRef) {
      failures.push(`closure.installedLock: package mismatch for ${a?.name}`);
    }
  }
  let instSdkDisk = null;
  try { instSdkDisk = JSON.parse(readFileSync(resolve(rootDir, 'installed/node_modules/@modelcontextprotocol/sdk/package.json'), 'utf8')); } catch { instSdkDisk = null; }
  if (!instSdkDisk || instSdkDisk.name !== '@modelcontextprotocol/sdk' || instSdkDisk.version !== closure.sdkVersion) failures.push('closure.installedLock: installed SDK package.json mismatch');
  const instClosure = readJson({ path: 'receipts/installed-closure.json', sha256: closure.installedClosureSha256 }, 'closure.installedClosureSha256');
  if (!instClosure || instClosure.artifactManifestSha256 !== closure.artifactManifestSha256 || instClosure.sdkVersion !== closure.sdkVersion || instClosure.referenceExport !== closure.referenceExport) {
    failures.push('closure.installedClosureSha256: closure report mismatch');
  } else if (canonicalizeJson(instClosure.artifacts) !== canonicalizeJson(doc.artifacts)) {
    failures.push('closure.installedClosure: artifacts mismatch');
  }
  readChecked('packages/mcp-broker/dist/memory-reference/index.js', closure.referenceSourceSha256, 'closure.referenceSourceSha256');
  readChecked('tools/memory-mcp-l5/policies/sqlite-fence-profile-v1.json', rt.fenceProfileSha256, 'runtime.fenceProfileSha256');
  let probeRaw = null;
  try { probeRaw = JSON.parse(readFileSync(resolve(rootDir, 'receipts/runtime-probe.json'), 'utf8')); } catch { probeRaw = null; }
  const probeArgs = Array.isArray(probeRaw?.execArgv) ? probeRaw.execArgv.join(' ') : String(probeRaw?.execArgv ?? '');
  if (!probeRaw || !Array.isArray(probeRaw.execArgv) || typeof probeRaw.nodeOptions !== 'string' || /sqlite/i.test(`${probeArgs} ${probeRaw.nodeOptions}`) || probeRaw.tupleHead !== src.head || probeRaw.artifactManifestSha256 !== closure.artifactManifestSha256 || probeRaw.nodeVersion !== rt.nodeVersion || !/^24\.\d+\.\d+$/.test(String(probeRaw.nodeVersion)) || probeRaw.imageDigest !== rt.imageDigest || probeRaw.imageDigest !== PINNED_IMAGE_DIGEST || probeRaw.platform !== rt.platform || probeRaw.sqliteVersion !== rt.sqliteVersion || probeRaw.driver !== 'node:sqlite' || probeRaw.journalMode !== 'WAL' || probeRaw.synchronous !== 'FULL' || probeRaw.filesystem !== rt.filesystem || probeRaw.filesystemAssumptions !== rt.filesystemAssumptions || probeRaw.fenceProfileSha256 !== rt.fenceProfileSha256 || probeRaw.pythonCount !== 0 || probeRaw.addonBuildCount !== 0) {
    failures.push('runtime.probe: on-disk runtime-probe.json mismatch');
  }
  readChecked('tools/memory-mcp-l5/policies/sent-tech-assurance-v1.json', assurance.productionPolicySha256, 'assurance.productionPolicySha256');
  readChecked('tools/memory-mcp-l5/policies/qualification-assurance-v1.json', assurance.qualificationPolicySha256, 'assurance.qualificationPolicySha256');
  readChecked('tools/memory-mcp-l5/verifier.mjs', assurance.verifierArtifactSha256, 'assurance.verifierArtifactSha256');
  readChecked('tools/memory-mcp-l5/policies/trust-profile-v1.json', assurance.trustProfileSha256, 'assurance.trustProfileSha256');
  const graphDoc = readJson(doc.importGraph, 'importGraph');
  const resFiles = asArr(graphDoc?.resolvedFiles), expectedRoots = asArr(catalog.importGraphRoots);
  if (!graphDoc || graphDoc.forbiddenHits !== 0 || graphDoc.unresolvedEdges !== 0 || resFiles.length !== expectedRoots.length || sha256Hex(Buffer.from(canonicalizeJson(resFiles))) !== doc.importGraph?.resolvedFilesSha256 || JSON.stringify(graphDoc.roots) !== JSON.stringify(expectedRoots)) {
    failures.push('importGraph: on-disk report mismatch');
  }
  if (JSON.stringify(resFiles.map((r) => r?.root)) !== JSON.stringify(expectedRoots) || new Set(resFiles.map((r) => r?.path)).size !== resFiles.length) {
    failures.push('importGraph: resolvedFiles roots mismatch');
  }
  for (const rf of resFiles) {
    const expPath = String(rf?.root || '').startsWith('@sentropic/') ? resolvePkgSubpath(rootDir, rf.root) : rf?.root;
    if (!expPath || rf?.path !== expPath) failures.push(`importGraph: resolvedFiles path mismatch for ${rf?.root}`);
    readChecked(rf?.path, rf?.sha256, `importGraph.resolvedFiles/${rf?.root}`);
  }
  const scannedEdges = scanImportGraphFiles(rootDir, resFiles.map((r) => r?.path), failures);
  if (graphDoc && canonicalizeJson(asArr(graphDoc.edges)) !== canonicalizeJson(scannedEdges)) failures.push('importGraph: edges mismatch with scanned files');
  const normPath = (fp) => {
    if (typeof fp !== 'string') return '';
    const s = fp.replace(/\\/g, '/'), rp = `${rootDir.replace(/\\/g, '/')}/`;
    if (s.startsWith(rp)) return s.slice(rp.length);
    const i = s.search(/(?:^|\/)(packages|tools)\//);
    return i >= 0 ? s.slice(s[i] === '/' ? i + 1 : i) : s;
  };
  for (const p of asArr(doc.proofs)) {
    const cat = asArr(catalog.proofs).find((x) => x.id === p?.id);
    const rep = readJson(p?.result, `proofs/${p?.id}.result`);
    if (!cat || !rep || rep.success !== true || rep.runId !== p.runId || rep.attempt !== p.attempt || rep.sourceHead !== p.sourceHead || rep.artifactManifestSha256 !== p.artifactManifestSha256 || rep.numPassedTests !== p.result?.passed || rep.numTotalTests !== p.result?.passed || rep.numFailedTests !== 0 || rep.numPendingTests !== 0 || rep.numTodoTests !== 0 || !Array.isArray(rep.testResults)) {
      failures.push(`proofs/${p?.id}: invalid on-disk vitest report`); continue;
    }
    const executed = [], fileSet = new Set();
    for (const tr of rep.testResults) {
      const nf = normPath(tr?.name), ars = asArr(tr?.assertionResults);
      if (!cat.files.includes(nf) || fileSet.has(nf)) failures.push(`proofs/${p.id}: unlisted file ${nf}`);
      if (tr?.status !== 'passed' || ars.length === 0) failures.push(`proofs/${p.id}: empty assertions in ${nf}`);
      fileSet.add(nf);
      for (const ar of ars) {
        if (ar?.status !== 'passed') failures.push(`proofs/${p.id}: non-passed assertion ${ar?.fullName || ar?.title}`);
        else executed.push({ file: nf, caseId: ar.fullName || ar.title, status: 'passed' });
      }
      for (const reqCase of asArr(cat.fileCases?.[nf])) {
        if (!ars.some((ar) => ar?.status === 'passed' && (ar.title === reqCase || ar.fullName === reqCase || String(ar.title || '').includes(reqCase) || String(ar.fullName || '').includes(reqCase)))) {
          failures.push(`proofs/${p.id}: missing required case ${reqCase} in ${nf}`);
        }
      }
    }
    if (executed.length !== p.result?.passed) failures.push(`proofs/${p.id}: assertion count mismatch`);
    for (const reqFile of cat.files) if (!fileSet.has(reqFile)) failures.push(`proofs/${p.id}: missing executed file ${reqFile}`);
    for (const reqCase of cat.requiredCases) if (!executed.some((e) => e.caseId === reqCase || String(e.caseId || '').includes(reqCase))) failures.push(`proofs/${p.id}: missing required case ${reqCase}`);
    if (sha256Hex(Buffer.from(canonicalizeJson(executed))) !== p.result?.executedCasesSha256) failures.push(`proofs/${p.id}: executedCasesSha256 mismatch`);
  }
  let ciRun = null;
  try { ciRun = JSON.parse(readFileSync(resolve(rootDir, 'receipts/ci-run.json'), 'utf8')); } catch { ciRun = null; }
  if (!ciRun || ciRun.workflow !== ci.workflow || ciRun.status !== 'completed' || ciRun.conclusion !== 'success' || ciRun.runId !== ci.runId || ciRun.attempt !== ci.attempt || ciRun.head !== ci.head || ciRun.base !== ci.base || ciRun.merge !== ci.merge || ciRun.checkout !== ci.checkout || ciRun.imageDigest !== ci.imageDigest || ciRun.imageDigest !== PINNED_IMAGE_DIGEST || ciRun.artifactName !== ci.artifactName || ciRun.tupleSha256 !== doc.tupleSha256) {
    failures.push('ci.evidence: ci-run.json field mismatch');
  }
  for (const j of asArr(ci.jobs)) {
    const jDoc = readJson({ path: `receipts/ci-job-${j?.id}.json`, sha256: j?.resultSha256 }, `ci.jobs/${j?.id}`);
    if (!jDoc || jDoc.jobId !== j?.id || jDoc.runId !== ci.runId || jDoc.attempt !== ci.attempt || jDoc.head !== ci.head || jDoc.base !== ci.base || jDoc.merge !== ci.merge || jDoc.checkout !== ci.checkout || jDoc.imageDigest !== ci.imageDigest || jDoc.imageDigest !== PINNED_IMAGE_DIGEST || jDoc.artifactName !== ci.artifactName || jDoc.tupleSha256 !== doc.tupleSha256 || jDoc.conclusion !== 'success' || (j?.id === 'memory-l5-qualification' && JSON.stringify(jDoc.proofResultSha256s) !== JSON.stringify(asArr(doc.proofs).map((p) => ({ id: p?.id, sha256: p?.result?.sha256 }))))) {
      failures.push(`ci.jobs/${j?.id}: on-disk job evidence mismatch`);
    }
  }
  if (!asArr(catalog.authorizedOwners?.ownerUat).includes(doc.ownerUat?.actorRef) || !asArr(freezeDoc?.authorizedOwners?.ownerUat).includes(doc.ownerUat?.actorRef)) failures.push('ownerUat: unauthorized actorRef');
  const uatDoc = readJson(doc.ownerUat?.evidence, 'ownerUat.evidence');
  if (!uatDoc || uatDoc.tupleSha256 !== doc.tupleSha256 || uatDoc.authoritySourceSha256 !== c.l0Freeze?.sha256 || uatDoc.ciRunId !== ci.runId || uatDoc.status !== doc.ownerUat?.status || uatDoc.actorRef !== doc.ownerUat?.actorRef || uatDoc.recordedAt !== doc.ownerUat?.recordedAt || (doc.ownerUat?.status === 'passed' ? uatDoc.policySha256 !== doc.ownerUat?.policySha256 || doc.ownerUat?.policySha256 !== assurance.productionPolicySha256 : uatDoc.owningLot !== doc.ownerUat?.owningLot || uatDoc.reason !== doc.ownerUat?.reason)) {
    failures.push('ownerUat.evidence: on-disk decision mismatch');
  }
  for (const a of asArr(doc.acceptances)) {
    if (!asArr(catalog.authorizedOwners?.acceptances?.[a?.role]).includes(a?.actorRef) || !asArr(freezeDoc?.authorizedOwners?.acceptances?.[a?.role]).includes(a?.actorRef)) failures.push(`acceptances/${a?.role}: unauthorized actorRef`);
    const accDoc = readJson(a?.evidence, `acceptances/${a?.role}.evidence`);
    if (!accDoc || accDoc.role !== a?.role || accDoc.actorRef !== a?.actorRef || accDoc.tupleSha256 !== doc.tupleSha256 || accDoc.authoritySourceSha256 !== c.l0Freeze?.sha256 || accDoc.ciRunId !== ci.runId || accDoc.verdict !== 'accepted') failures.push(`acceptances/${a?.role}: on-disk disposition mismatch`);
  }
  if (asArr(catalog.pendingPredecessorMappings).some((m) => m?.status === 'pending-predecessor-integration')) failures.push(UNESTABLISHED_LOT0_OBLIGATIONS[0]);
  if (!existsSync(resolve(HERE, 'import-graph.mjs'))) failures.push(UNESTABLISHED_LOT0_OBLIGATIONS[1]);
  if (!existsSync(resolve(HERE, 'verifier.mjs'))) failures.push(UNESTABLISHED_LOT0_OBLIGATIONS[2]);
  failures.push(...UNESTABLISHED_LOT0_OBLIGATIONS.slice(3));
  return failures;
}
