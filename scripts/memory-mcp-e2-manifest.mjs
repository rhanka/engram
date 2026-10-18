#!/usr/bin/env node
// Offline E2 return for the co-accepted L5 handoff. Never rebuild the published archive.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { checkArtifactManifest, FROZEN_SPEC_SHA256 } from './vendor/memory-mcp-l5/receipt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const NAME = '@sentropic/engram', VERSION = '0.20.0', TAG = 'v0.20.0';
const HEAD = 'af60f9d7f5e02fc31755fd81927c8dd2a44b117f';
const INTEGRITY = 'sha512-h5nFHMpQzFEtp9mq9njhK0dw58p7K5khURI4FInF2iy2BG++ncWO0D6igY5n0kETRa6rWoOYANwqVMbi+lPVFg==';
const REGISTRY_SHA256 = 'c7a95c650db82f33aa26d809340f004139980b888079dab182550f7a000f54d2';
const ATTESTATIONS_SHA256 = 'e7cece92231a0913a1b2ca2b596b2dd1e2d253b2618507a8501d052b6f21c99e';
const ARCHIVE = 'archives/engram-0.20.0.tgz', PROVENANCE = 'receipts/e2-provenance.json';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const integrity = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const jsonBytes = (doc) => Buffer.from(JSON.stringify(doc, null, 2) + '\n');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const USAGE = `Usage: node scripts/memory-mcp-e2-manifest.mjs --tarball <published.tgz> --output-dir <bundle>
  Final: --p1-manifest <pre-candidate-manifest.json> --p1-sha256 <64 lowercase hex>
  Draft: --pre-binding (writes lot2-manifest.pre-binding.json, never a final manifest)
P1 archives and contract files are read relative to its manifest and copied after digest verification.
The script uses retained npm registry evidence and performs no network requests.`;

// The archive has already matched the pinned npm SHA-512 before any member is read.
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

function prepareE2(tarball) {
  assert(integrity(tarball) === INTEGRITY, 'E2 tarball does not match the published npm integrity');
  const registryBytes = readFileSync(resolve(HERE, 'fixtures/memory-mcp-e2/registry.json'));
  const attestationBytes = readFileSync(resolve(HERE, 'fixtures/memory-mcp-e2/attestations.json'));
  assert(sha256(registryBytes) === REGISTRY_SHA256, 'Retained npm registry evidence changed');
  assert(sha256(attestationBytes) === ATTESTATIONS_SHA256, 'Retained Sigstore attestation changed');
  const registry = JSON.parse(registryBytes);
  assert(registry.name === NAME && registry.version === VERSION && registry.gitHead === HEAD && registry.dist.integrity === INTEGRITY, 'npm release identity mismatch');
  const attestation = JSON.parse(attestationBytes).attestations.find((a) => a.predicateType === 'https://slsa.dev/provenance/v1');
  const statement = JSON.parse(Buffer.from(attestation.bundle.dsseEnvelope.payload, 'base64').toString('utf8'));
  const definition = statement.predicate.buildDefinition;
  const subject = statement.subject.find((s) => s.name === 'pkg:npm/%40sentropic/engram@0.20.0');
  assert(subject?.digest?.sha512 === createHash('sha512').update(tarball).digest('hex'), 'Sigstore subject does not bind E2');
  assert(definition.externalParameters.workflow.ref === `refs/tags/${TAG}` && definition.externalParameters.workflow.repository === 'https://github.com/rhanka/engram', 'Sigstore workflow/tag mismatch');
  assert(definition.resolvedDependencies.some((d) => d.uri === `git+https://github.com/rhanka/engram@refs/tags/${TAG}` && d.digest.gitCommit === HEAD), 'Sigstore source commit mismatch');
  const members = tarMembers(tarball), pkg = JSON.parse(members.get('package/package.json'));
  assert(pkg.name === NAME && pkg.version === VERSION && pkg.exports['./memory-tools'].import === './dist/memory-tools.js', 'Packed release identity/surface mismatch');
  const packedFiles = ['package.json', 'dist/memory-tools.js', 'dist/memory-tools.d.ts'].map((path) => {
    const bytes = members.get(`package/${path}`);
    assert(bytes, `Published archive is missing ${path}`);
    return { path, sha256: sha256(bytes) };
  });
  const artifact = { role: 'e2', name: NAME, version: VERSION, sha256: sha256(tarball), integrity: INTEGRITY, sourceHead: HEAD, archive: ARCHIVE };
  const provenance = {
    evidenceVersion: 1,
    bReference: { releaseOption: 'B', repository: 'https://github.com/rhanka/engram', tag: TAG, commit: HEAD },
    artifact,
    npmRegistry: { path: 'receipts/e2-npm-registry.json', sha256: REGISTRY_SHA256, tarball: registry.dist.tarball },
    sigstore: {
      path: 'receipts/e2-npm-attestations.json', sha256: ATTESTATIONS_SHA256,
      url: registry.dist.attestations.url, predicateType: statement.predicateType,
      invocationId: statement.predicate.runDetails.metadata.invocationId,
      verification: 'retained npm registry response; subject, tag and commit bindings checked; no offline Sigstore trust-root verification',
    },
    packedFiles,
  };
  const provenanceBytes = jsonBytes(provenance);
  return {
    artifact, evidence: { path: PROVENANCE, sha256: sha256(provenanceBytes) },
    files: new Map([[ARCHIVE, tarball], [PROVENANCE, provenanceBytes], ['receipts/e2-npm-registry.json', registryBytes], ['receipts/e2-npm-attestations.json', attestationBytes]]),
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
  const draft = options['pre-binding'] === true, p1Digest = options['p1-sha256'];
  assert(options.tarball && options['output-dir'], USAGE);
  assert(!draft || (!p1Digest && !options['p1-manifest']), 'pre-binding cannot be combined with P1 binding options');
  assert(draft || (typeof p1Digest === 'string' && /^[0-9a-f]{64}$/.test(p1Digest) && options['p1-manifest']), 'Final manifest requires --p1-sha256 (64 lowercase hex) and --p1-manifest; use --pre-binding for a draft');
  const e2 = prepareE2(readFileSync(options.tarball));
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
      tarball: { type: 'string' }, 'output-dir': { type: 'string' },
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
