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
//   mkdir -p /tmp/e2-0.21.1
//   npm pack @sentropic/engram@0.21.1 --pack-destination /tmp/e2-0.21.1
//   npm view @sentropic/engram@0.21.1 name version gitHead dist --json > /tmp/e2-0.21.1-registry.json
//   curl -fsSL "$(node -p "require('/tmp/e2-0.21.1-registry.json').dist.attestations.url")" -o /tmp/e2-0.21.1-attestations.json
//   node scripts/memory-mcp-e2-manifest.mjs \
//     --expected-version 0.21.1 \
//     --tarball /tmp/e2-0.21.1/sentropic-engram-0.21.1.tgz \
//     --registry-json /tmp/e2-0.21.1-registry.json \
//     --attestations-json /tmp/e2-0.21.1-attestations.json \
//     --host-tuple /path/to/e2-host-tuple.json \
//     --p1-manifest /path/to/p1/pre-candidate-manifest.json \
//     --p1-sha256 68181613ff36b601d7f6bb62550294fdcd2c0ad26f2ed25cc1ad2fa633fafd5a \
//     --output-dir /path/to/lot2-bundle
//
// The host tuple (--host-tuple) is the sentropic delivery file carrying the
// installed host-backend closure, the neutral contract, the locks, the Node 24
// image by digest and the profiles. That delivery (G1/C9) does not exist yet:
// the script requires the file as an explicit input, binds its bytes through
// the E2 provenance and preserves P1. A missing or incomplete tuple is a
// fail-closed refusal (source-gap); no value is ever invented.
// Format: {"format":"e2-host-tuple/v1","backend":{"name","version","sourceHead",
// "archive","sha256","integrity"},"neutralContract":{"path","version","sha256"},
// "locks":[{"path","sha256"}], "nodeImage":"node:24…@sha256:<64hex>",
// "profiles":["…"]}. Every named file must exist next to the tuple with
// bytes matching its declared sha256, and the Node major must equal exactly 24.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

const USAGE = `Usage: node scripts/memory-mcp-e2-manifest.mjs --expected-version <semver> --tarball <published.tgz> --registry-json <npm-view-dist.json> --attestations-json <attestations.json> --host-tuple <e2-host-tuple-v1.json> --output-dir <bundle>
  Final: --p1-manifest <pre-candidate-manifest.json> --p1-sha256 <64 lowercase hex>
  Draft: --pre-binding (writes lot2-manifest.pre-binding.json, never a final manifest)
--expected-version is mandatory and has no default. The tarball identity
(integrity sha512, shasum, gitHead, SLSA provenance) is read from the retained
registry evidence: run \`npm view @sentropic/engram@<version> name version gitHead dist --json\`.
P1 archives and contract files are read relative to its manifest and copied after digest verification.
--host-tuple is mandatory (final and draft): the sentropic file carrying the
installed host-backend closure, the neutral contract, the locks, the Node 24
image by digest and the profiles ({"format":"e2-host-tuple/v1","backend":
{"name","version","sourceHead","archive","sha256","integrity"},
"neutralContract":{"path","version","sha256"},"locks":[{"path","sha256"}],
"nodeImage":"node:24…@sha256:<64hex>","profiles":["…"]}). Its bytes are
retained and bound through the E2 provenance; P1 is preserved byte for byte.
A missing or incomplete tuple refuses fail-closed with source-gap: no value
is invented. The script performs no network requests.`;

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

// Real module lexer (TypeScript compiler API, a direct devDependency: no new
// dependency). Comments are syntax trivia, so `import /* c */ './x.js'` and
// every other static edge shape lex to their specifier; a computed target
// cannot resolve to a file and refuses fail-closed instead of being guessed.
function staticSpecifiers(text, rel) {
  const ts = createRequire(import.meta.url)('typescript');
  const source = ts.createSourceFile(
    rel, text, ts.ScriptTarget.ESNext, true,
    rel.endsWith('.d.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
  const out = [];
  const add = (target) => {
    assert(target && ts.isStringLiteralLike(target),
      `Published archive has an unresolvable import in ${rel}: refusing instead of guessing`);
    if (target.text.startsWith('.')) out.push(target.text);
    else assert(!rel.endsWith('.d.ts'), `Published archive has an unretained type dependency ${target.text} required by ${rel}`);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node)) {
      add(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined);
    } else if (ts.isExternalModuleReference(node)) {
      add(node.expression);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === 'require';
      if ((isImport || isRequire) && node.arguments.length > 0) {
        add(node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const ref of source.referencedFiles) {
    assert(!ref.fileName.startsWith('/'), `Published archive has an unretained type dependency ${ref.fileName} required by ${rel}`);
    out.push(ref.fileName.startsWith('.') ? ref.fileName : `./${ref.fileName}`);
  }
  for (const ref of source.typeReferenceDirectives) add(ts.factory.createStringLiteral(ref.fileName));
  return out;
}

// Every chunk the memory-substrate entry statically reaches, resolved inside
// the published archive. A distributable sourcemap comment is not an import.
// The execution graph (JS) and the type graph (d.ts) resolve separately: a
// declaration never substitutes for a missing runtime JS, and a present JS
// never hides a missing reachable declaration.
function collectGraph(members, root, kind) {
  const seen = [];
  const queue = [root];
  while (queue.length > 0) {
    const rel = queue.shift();
    if (seen.includes(rel)) continue;
    const bytes = members.get(`package/${rel}`);
    assert(bytes, `Published archive is missing chunk ${rel} required by ${ENTRY_SPECIFIER}`);
    seen.push(rel);
    if ((kind === 'js' && !rel.endsWith('.js')) || (kind === 'dts' && !rel.endsWith('.d.ts'))) continue;
    for (const spec of staticSpecifiers(bytes.toString('utf8'), rel)) {
      const resolved = posix.normalize(posix.join(posix.dirname(rel), spec));
      assert(!resolved.startsWith('..'), `Published archive escapes its package: ${spec} required by ${rel}`);
      // Exact ESM resolution: the specifier names the file byte-for-byte, no
      // extension guessing, so a `missing.js.js` decoy never satisfies
      // `missing.js`. Inside the type graph a `.js` specifier maps to its
      // `.d.ts` declaration exactly as TypeScript resolves types.
      const target = kind === 'js' ? resolved : (resolved.endsWith('.js') ? `${resolved.slice(0, -3)}.d.ts` : resolved);
      const suffix = kind === 'js' ? '.js' : '.d.ts';
      assert(target.endsWith(suffix) && members.has(`package/${target}`), `Published archive is missing chunk ${target} required by ${rel}`);
      if (!seen.includes(target) && !queue.includes(target)) queue.push(target);
    }
  }
  return seen;
}

function collectEntryClosure(members) {
  const runtime = collectGraph(members, ENTRY_IMPORT.replace(/^\.\//, ''), 'js');
  const types = collectGraph(members, ENTRY_TYPES.replace(/^\.\//, ''), 'dts');
  return [...new Set(['package.json', ...runtime, ...types])].sort();
}

const HOST_TUPLE_FORMAT = 'e2-host-tuple/v1';
const isHex = (value, length) => typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
const isSemver = (value) => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
const isRelPath = (value) => typeof value === 'string' && value.length > 0 && value.length <= 512 && !value.startsWith('/') && !/(^|\/)\.\.(\/|$)/.test(value) && !value.includes('\0') && !value.includes(':');
const isIntegrity = (value) => typeof value === 'string' && /^sha512-[A-Za-z0-9+/]{86}==$/.test(value);

// Typed Node image: a digest-pinned reference `<name>@sha256:<64 hex>`
// whose major version parses as an integer and must equal exactly 24, so
// `node:240-…` never reads as Node 24.
const parseNodeImage = (value) => {
  const reference = typeof value === 'string' ? value.match(/^(.+)@sha256:([0-9a-f]{64})$/) : null;
  const tag = reference ? reference[1].match(/^node:(\d+)([.-].*)?$/) : null;
  const major = tag ? Number.parseInt(tag[1], 10) : NaN;
  const exact = tag && Number.isSafeInteger(major) && String(major) === tag[1] && major === 24;
  assert(reference && exact, 'nodeImage must be a Node 24 image by digest (<name>@sha256:<64 hex> with major version exactly 24)');
  return { name: reference[1], major, digest: reference[2] };
};

// The sentropic host delivery (backend closure, neutral contract, locks,
// Node 24 image digest, profiles) does not exist yet. It is required as an
// explicit file input, validated strictly, and bound through the E2
// provenance. Anything missing or malformed refuses fail-closed: no value
// is invented to stand in for the delivery.
function readHostTuple(path) {
  assert(typeof path === 'string' && path.length > 0, 'source-gap: host tuple is absent (sentropic backend/contract/lock/image/profile delivery pending); pass --host-tuple <e2-host-tuple-v1.json>, no value is invented');
  let bytes;
  try { bytes = readFileSync(resolve(path)); }
  catch { assert(false, `source-gap: host tuple is absent (unreadable file ${path}); pass --host-tuple <e2-host-tuple-v1.json>, no value is invented`); }
  let doc;
  try { doc = JSON.parse(bytes.toString('utf8')); }
  catch { assert(false, 'source-gap: host tuple is incomplete (not JSON); refusing instead of inventing the sentropic delivery'); }
  const failures = [];
  if (!doc || typeof doc !== 'object') failures.push('not an object');
  else {
    if (doc.format !== HOST_TUPLE_FORMAT) failures.push('format must be e2-host-tuple/v1');
    const backend = doc.backend;
    if (!backend || typeof backend !== 'object' || typeof backend.name !== 'string' || backend.name.length === 0 || !isSemver(backend.version) || !isHex(backend.sourceHead, 40) || !isRelPath(backend.archive) || !isHex(backend.sha256, 64) || !isIntegrity(backend.integrity)) failures.push('backend closure is incomplete');
    const contract = doc.neutralContract;
    if (!contract || typeof contract !== 'object' || !isRelPath(contract.path) || !isSemver(contract.version) || !isHex(contract.sha256, 64)) failures.push('neutral contract is incomplete');
    if (!Array.isArray(doc.locks) || doc.locks.length === 0 || doc.locks.some((lock) => !lock || typeof lock !== 'object' || !isRelPath(lock.path) || !isHex(lock.sha256, 64))) failures.push('locks are incomplete');
    try { parseNodeImage(doc.nodeImage); } catch { failures.push('nodeImage must be a Node 24 image by digest'); }
    if (!Array.isArray(doc.profiles) || doc.profiles.length === 0 || doc.profiles.some((profile) => typeof profile !== 'string' || profile.length === 0)) failures.push('profiles are incomplete');
  }
  assert(failures.length === 0, `source-gap: host tuple is incomplete (${failures.join('; ')}); refusing instead of inventing the sentropic delivery`);
  // Facts, not names: every file the tuple references must exist next to the
  // tuple. Its bytes are read and hashed, and the hash must match the
  // declared digest, which the manifest then binds. A missing or tampered
  // file refuses fail-closed. Retain these exact verified bytes so the tuple
  // remains resolvable relative to its retained copy without source inputs.
  const root = dirname(resolve(path));
  const files = new Map();
  const bindFile = (declaredPath, declaredSha256, label) => {
    let fileBytes;
    try { fileBytes = readFileSync(resolve(root, declaredPath)); }
    catch { assert(false, `source-gap: host tuple references ${label} ${declaredPath} which does not exist; refusing instead of inventing the sentropic delivery`); }
    assert(sha256(fileBytes) === declaredSha256, `source-gap: host tuple ${label} ${declaredPath} bytes do not match the declared sha256 (tampered or stale); refusing instead of inventing the sentropic delivery`);
    files.set(posix.normalize(declaredPath), fileBytes);
    return fileBytes;
  };
  const backendBytes = bindFile(doc.backend.archive, doc.backend.sha256, 'backend archive');
  assert(integrity(backendBytes) === doc.backend.integrity, `source-gap: host tuple backend archive ${doc.backend.archive} bytes do not match the declared integrity; refusing instead of inventing the sentropic delivery`);
  bindFile(doc.neutralContract.path, doc.neutralContract.sha256, 'neutral contract');
  for (const lock of doc.locks) bindFile(lock.path, lock.sha256, 'lock');
  return { bytes, doc, files };
}

function prepareE2(tarball, { expectedVersion, registryPath, attestationsPath, hostTuple }) {
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
  assert(pkg.exports?.[ENTRY_SPECIFIER]?.types === ENTRY_TYPES, `Packed release surface mismatch: expected ${ENTRY_SPECIFIER}.types === ${ENTRY_TYPES}`);
  const packedFiles = collectEntryClosure(members).map((path) => {
    const bytes = members.get(`package/${path}`);
    return { path, sha256: sha256(bytes) };
  });
  const archive = `archives/engram-${expectedVersion}.tgz`;
  // artifactItem is a frozen sentropic contract: no shasum member. The shasum
  // binding is still enforced above and recorded in npmRegistry below.
  const artifact = { role: 'e2', name: NAME, version: expectedVersion, sha256: sha256(tarball), integrity: dist.integrity, sourceHead: gitHead, archive };
  const hostClosure = {
    path: 'receipts/e2-host-tuple.json', sha256: sha256(hostTuple.bytes),
    format: hostTuple.doc.format, backend: hostTuple.doc.backend,
    neutralContract: hostTuple.doc.neutralContract, locks: hostTuple.doc.locks,
    nodeImage: hostTuple.doc.nodeImage, profiles: hostTuple.doc.profiles,
  };
  const provenance = {
    evidenceVersion: 1,
    bReference: { releaseOption: 'B', repository: REPOSITORY, tag, commit: gitHead },
    hostClosure,
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
  const files = new Map([[archive, tarball], ['receipts/e2-provenance.json', provenanceBytes], ['receipts/e2-npm-registry.json', registryBytes], ['receipts/e2-npm-attestations.json', attestationBytes], ['receipts/e2-host-tuple.json', hostTuple.bytes]]);
  for (const [path, bytes] of hostTuple.files) {
    const retainedPath = posix.join(posix.dirname(hostClosure.path), path);
    assert(!files.has(retainedPath), `Host tuple file collides with E2 evidence: ${retainedPath}`);
    files.set(retainedPath, bytes);
  }
  return {
    artifact, evidence: { path: 'receipts/e2-provenance.json', sha256: sha256(provenanceBytes) },
    files,
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
  const hostTuple = readHostTuple(options['host-tuple']);
  const e2 = prepareE2(readFileSync(options.tarball), { expectedVersion, registryPath: resolve(options['registry-json']), attestationsPath: resolve(options['attestations-json']), hostTuple });
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
      'host-tuple': { type: 'string' },
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
