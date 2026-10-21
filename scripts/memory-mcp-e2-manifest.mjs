#!/usr/bin/env node
// Offline E2 return for the public memory-substrate entry (amendment §8 points 1-5).
// Never rebuilds the published archive. No network: every identity comes from
// retained `npm view` / attestation bytes passed as explicit file parameters.
//
// The target version is a mandatory parameter: there is no default and no
// pinned 0.20.0. The script verifies
// `pkg.exports['./memory-substrate'].import === './dist/memory-substrate.js'`,
// inventories package.json, the entry JS/d.ts and every chunk they statically
// reach, then binds the real published tarball (npm integrity sha512, shasum,
// gitHead and SLSA provenance read from the retained registry evidence).
//
// Exact command for the 0.21.1 release (run once 0.21.1 is published; the 0.20.0
// fixtures under scripts/fixtures/memory-mcp-e2/ are superseded evidence, not inputs):
//
//   npm pack @sentropic/engram@0.21.1 --pack-destination /tmp/e2-0.21.1
//   npm view @sentropic/engram@0.21.1 name version gitHead dist --json > /tmp/e2-0.21.1-registry.json
//   # fetch the exact response from dist.attestations.url into /tmp/e2-0.21.1-attestations.json
//   node scripts/memory-mcp-e2-manifest.mjs \
//     --expected-version 0.21.1 \
//     --tarball /tmp/e2-0.21.1/sentropic-engram-0.21.1.tgz \
//     --registry-json /tmp/e2-0.21.1-registry.json \
//     --attestations-json /tmp/e2-0.21.1-attestations.json \
//     --p1-manifest /path/to/p1/pre-candidate-manifest.json \
//     --p1-sha256 68181613ff36b601d7f6bb62550294fdcd2c0ad26f2ed25cc1ad2fa633fafd5a \
//     --output-dir /path/to/lot2-bundle
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { checkArtifactManifest, FROZEN_SPEC_SHA256 } from './vendor/memory-mcp-l5/receipt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const NAME = '@sentropic/engram';
const REPOSITORY = 'https://github.com/rhanka/engram';
const SLSA_PREDICATE = 'https://slsa.dev/provenance/v1';
const ENTRY_SPECIFIER = './memory-substrate';
const ENTRY_IMPORT = './dist/memory-substrate.js';
const ENTRY_TYPES = './dist/memory-substrate.d.ts';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha1hex = (bytes) => createHash('sha1').update(bytes).digest('hex');
const sha512hex = (bytes) => createHash('sha512').update(bytes).digest('hex');
const integrity = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const jsonBytes = (doc) => Buffer.from(JSON.stringify(doc, null, 2) + '\n');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const USAGE = `Usage: node scripts/memory-mcp-e2-manifest.mjs --expected-version <semver> --tarball <published.tgz> --registry-json <npm-view-dist.json> --attestations-json <attestations.json> --output-dir <bundle>
  Final: --p1-manifest <pre-candidate-manifest.json> --p1-sha256 <64 lowercase hex>
  Draft: --pre-binding (writes lot2-manifest.pre-binding.json, never a final manifest)
--expected-version is mandatory and has no default. The tarball identity
(integrity sha512, shasum, gitHead, SLSA provenance) is read from the retained
registry evidence: run \`npm view @sentropic/engram@<version> name version gitHead dist --json\`.
P1 archives and contract files are read relative to its manifest and copied after digest verification.
The script performs no network requests.`;

// The archive has already matched the published npm SHA-512 before any member is read.
function tarMembers(bytes) {
  const tar = gunzipSync(bytes), members = new Map();
  for (let off = 0; off + 512 <= tar.length;) {
    const header = tar.subarray(off, off + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start, end) => header.subarray(start, end).toString('utf8').replace(/\0.*$/, '');
    const prefix = text(345, 500), name = `${prefix ? prefix + '/' : ''}${text(0, 100)}`;
    const size = parseInt(text(124, 136).trim(), 8);
    assert(Number.isSafeInteger(size) && size >= 0 && off + 512 + size <= tar.length, 'Invalid npm tar member');
    if (header[156] === 0 || header[156] === 48) members.set(name, tar.subarray(off + 512, off + 512 + size));
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return members;
}

function relativeSpecifiers(text) {
  const out = [];
  const pattern = /(?:from\s*['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)|require\s*\(\s*['"](\.[^'"]+)['"]\s*\))/g;
  let match;
  while ((match = pattern.exec(text)) !== null) out.push(match[1] ?? match[2] ?? match[3]);
  return out;
}

// Every chunk the memory-substrate entry statically reaches, resolved inside
// the published archive. A distributable sourcemap comment is not an import.
function collectEntryClosure(members) {
  const roots = ['package.json', ENTRY_IMPORT.replace(/^\.\//, ''), ENTRY_TYPES.replace(/^\.\//, '')];
  const seen = [];
  const queue = [...roots];
  while (queue.length > 0) {
    const rel = queue.shift();
    if (seen.includes(rel)) continue;
    const bytes = members.get(`package/${rel}`);
    assert(bytes, `Published archive is missing chunk ${rel} required by ${ENTRY_SPECIFIER}`);
    seen.push(rel);
    if (!rel.endsWith('.js') && !rel.endsWith('.d.ts')) continue;
    for (const spec of relativeSpecifiers(bytes.toString('utf8'))) {
      const resolved = posix.normalize(posix.join(posix.dirname(rel), spec));
      assert(!resolved.startsWith('..'), `Published archive escapes its package: ${spec} required by ${rel}`);
      const candidates = [resolved, resolved.replace(/\.js$/, '.d.ts'), `${resolved}.js`, `${resolved}.d.ts`];
      const target = candidates.find((candidate) => members.has(`package/${candidate}`));
      assert(target, `Published archive is missing chunk ${resolved} required by ${rel}`);
      if (!seen.includes(target) && !queue.includes(target)) queue.push(target);
    }
  }
  return seen.sort();
}

function prepareE2(tarball, { expectedVersion, registryPath, attestationsPath }) {
  const tag = `v${expectedVersion}`;
  const registryBytes = readFileSync(registryPath);
  let registry;
  try { registry = JSON.parse(registryBytes.toString('utf8')); } catch { assert(false, 'Retained npm registry evidence is not JSON'); }
  assert(registry.name === NAME && registry.version === expectedVersion, 'npm release identity mismatch');
  const gitHead = registry.gitHead;
  assert(typeof gitHead === 'string' && /^[0-9a-f]{40}$/.test(gitHead), 'npm gitHead is not a 40 lowercase hex commit');
  const dist = registry.dist;
  assert(dist && typeof dist.integrity === 'string' && typeof dist.shasum === 'string' && typeof dist.tarball === 'string', 'npm dist evidence is incomplete');
  assert(integrity(tarball) === dist.integrity, 'E2 tarball does not match the published npm integrity');
  assert(sha1hex(tarball) === dist.shasum, 'E2 tarball does not match the published npm shasum');
  const attestationBytes = readFileSync(attestationsPath);
  let attestationsDoc;
  try { attestationsDoc = JSON.parse(attestationBytes.toString('utf8')); } catch { assert(false, 'Retained attestation evidence is not JSON'); }
  const attestation = (attestationsDoc.attestations ?? []).find((a) => a.predicateType === SLSA_PREDICATE);
  assert(attestation, 'Retained SLSA provenance is missing');
  const statement = JSON.parse(Buffer.from(attestation.bundle.dsseEnvelope.payload, 'base64').toString('utf8'));
  const definition = statement.predicate.buildDefinition;
  const subject = statement.subject.find((s) => s.name === `pkg:npm/%40sentropic/engram@${expectedVersion}`);
  assert(subject?.digest?.sha512 === sha512hex(tarball), 'Sigstore subject does not bind E2');
  assert(definition.externalParameters.workflow.ref === `refs/tags/${tag}` && definition.externalParameters.workflow.repository === REPOSITORY, 'Sigstore workflow/tag mismatch');
  assert(definition.resolvedDependencies.some((d) => d.uri === `git+${REPOSITORY}@refs/tags/${tag}` && d.digest.gitCommit === gitHead), 'Sigstore source commit mismatch');
  const members = tarMembers(tarball), pkg = JSON.parse(members.get('package/package.json'));
  assert(pkg.name === NAME && pkg.version === expectedVersion, 'Packed release identity mismatch');
  assert(pkg.exports?.[ENTRY_SPECIFIER]?.import === ENTRY_IMPORT, `Packed release surface mismatch: expected ${ENTRY_SPECIFIER}.import === ${ENTRY_IMPORT}`);
  const packedFiles = collectEntryClosure(members).map((path) => {
    const bytes = members.get(`package/${path}`);
    return { path, sha256: sha256(bytes) };
  });
  const archive = `archives/engram-${expectedVersion}.tgz`;
  // artifactItem is a frozen sentropic contract: no shasum member. The shasum
  // binding is still enforced above and recorded in npmRegistry below.
  const artifact = { role: 'e2', name: NAME, version: expectedVersion, sha256: sha256(tarball), integrity: dist.integrity, sourceHead: gitHead, archive };
  const provenance = {
    evidenceVersion: 1,
    bReference: { releaseOption: 'B', repository: REPOSITORY, tag, commit: gitHead },
    artifact,
    npmRegistry: { path: 'receipts/e2-npm-registry.json', sha256: sha256(registryBytes), tarball: dist.tarball, shasum: dist.shasum },
    sigstore: {
      path: 'receipts/e2-npm-attestations.json', sha256: sha256(attestationBytes),
      url: dist.attestations.url, predicateType: statement.predicateType,
      invocationId: statement.predicate.runDetails.metadata.invocationId,
      verification: 'retained npm registry response; subject, tag and commit bindings checked; no offline Sigstore trust-root verification',
    },
    packedFiles,
  };
  const provenanceBytes = jsonBytes(provenance);
  return {
    artifact, evidence: { path: 'receipts/e2-provenance.json', sha256: sha256(provenanceBytes) },
    files: new Map([[archive, tarball], ['receipts/e2-provenance.json', provenanceBytes], ['receipts/e2-npm-registry.json', registryBytes], ['receipts/e2-npm-attestations.json', attestationBytes]]),
  };
}

function prepareP1(path, digest) {
  const bytes = readFileSync(path);
  assert(sha256(bytes) === digest, 'P1 manifest SHA-256 mismatch');
  const doc = JSON.parse(bytes), errors = checkArtifactManifest(doc);
  assert(doc.stage === 'pre-candidate' && errors.length === 0, `Invalid P1 manifest: ${errors.join('; ')}`);
  assert(doc.source.specSha256 === FROZEN_SPEC_SHA256, 'P1 must bind frozen M');
  const root = dirname(path);
  const files = new Map([['pre-candidate-manifest.json', bytes]]);
  const retain = (path, digest, npmIntegrity) => {
    // checkArtifactManifest has already validated each closed relative path.
    const bytes = readFileSync(resolve(root, path));
    assert(sha256(bytes) === digest, `P1 SHA-256 mismatch: ${path}`);
    assert(!npmIntegrity || integrity(bytes) === npmIntegrity, `P1 npm integrity mismatch: ${path}`);
    assert(!files.has(path) || files.get(path).equals(bytes), `P1 file collision: ${path}`);
    files.set(path, bytes);
  };
  for (const artifact of doc.artifacts) retain(artifact.archive, artifact.sha256, artifact.integrity);
  for (const contract of doc.contractInventory) retain(contract.path, contract.sha256);
  return { doc, files };
}

export function generateE2Bundle(options) {
  const expectedVersion = options['expected-version'];
  assert(typeof expectedVersion === 'string' && /^\d+\.\d+\.\d+$/.test(expectedVersion), 'E2 manifest requires --expected-version <semver> with no default; nothing is pinned to 0.20.0');
  assert(options.tarball && options['output-dir'], USAGE);
  assert(options['registry-json'] && options['attestations-json'], 'E2 manifest requires --registry-json <npm view dist --json> and --attestations-json <retained response>; no network is used');
  const draft = options['pre-binding'] === true, p1Digest = options['p1-sha256'];
  assert(!draft || (!p1Digest && !options['p1-manifest']), 'pre-binding cannot be combined with P1 binding options');
  assert(draft || (typeof p1Digest === 'string' && /^[0-9a-f]{64}$/.test(p1Digest) && options['p1-manifest']), 'Final manifest requires --p1-sha256 (64 lowercase hex) and --p1-manifest; use --pre-binding for a draft');
  const e2 = prepareE2(readFileSync(options.tarball), { expectedVersion, registryPath: resolve(options['registry-json']), attestationsPath: resolve(options['attestations-json']) });
  const p1 = draft ? null : prepareP1(resolve(options['p1-manifest']), p1Digest);
  const doc = draft ? {
    status: 'pre-binding', intendedStage: 'lot2', e2ArtifactSha256: e2.artifact.sha256,
    e2Provenance: e2.evidence, artifacts: [e2.artifact], missing: ['P1 manifest bytes and SHA-256'],
  } : {
    manifestVersion: 1, stage: 'lot2', preCandidateManifestSha256: p1Digest,
    e2ArtifactSha256: e2.artifact.sha256, e2Provenance: e2.evidence, source: p1.doc.source,
    artifacts: [...p1.doc.artifacts, e2.artifact], contractInventory: p1.doc.contractInventory,
  };
  if (!draft) {
    const errors = checkArtifactManifest(doc, { retainedContractInventory: p1.doc.contractInventory });
    assert(errors.length === 0, `Invalid Lot 2 manifest: ${errors.join('; ')}`);
  }
  const name = draft ? 'lot2-manifest.pre-binding.json' : 'lot2-manifest.json';
  const bytes = jsonBytes(doc), files = new Map(p1?.files);
  for (const [path, content] of [...e2.files, [name, bytes], [`${name}.sha256`, Buffer.from(`${sha256(bytes)}  ${name}\n`)]]) {
    assert(!files.has(path), `E2 output collides with P1: ${path}`);
    files.set(path, content);
  }
  const output = resolve(options['output-dir']);
  for (const [path, content] of files) {
    const destination = resolve(output, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  return { status: draft ? 'pre-binding' : 'bound', path: resolve(output, name), sha256: sha256(bytes) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      'expected-version': { type: 'string' }, tarball: { type: 'string' }, 'output-dir': { type: 'string' },
      'registry-json': { type: 'string' }, 'attestations-json': { type: 'string' },
      'p1-manifest': { type: 'string' }, 'p1-sha256': { type: 'string' },
      'pre-binding': { type: 'boolean' }, help: { type: 'boolean' },
    } });
    if (values.help) console.log(USAGE);
    else console.log(JSON.stringify(generateE2Bundle(values)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
