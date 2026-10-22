import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { checkArtifactManifest, ARTIFACT_MANIFEST_SCHEMA, FROZEN_SPEC_SHA256 } from '../scripts/vendor/memory-mcp-l5/receipt.mjs';
import { validateAgainstSchema } from '../scripts/vendor/memory-mcp-l5/schema-validator.mjs';

const { registerHooks } = await import('node:module');
const hasRegisterHooks = typeof registerHooks === 'function';
const skipReason = hasRegisterHooks ? '' : ' (skipped: requires node:module.registerHooks, Node.js 22.15+ / 23.5+)';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/memory-mcp-e2-manifest.mjs');
const VERSION = '0.21.1';
const GIT_HEAD = 'ab'.repeat(20);
const REPOSITORY = 'https://github.com/rhanka/engram';
const SLSA_PREDICATE = 'https://slsa.dev/provenance/v1';
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const sha1 = (bytes: Buffer) => createHash('sha1').update(bytes).digest('hex');
const sha512hex = (bytes: Buffer) => createHash('sha512').update(bytes).digest('hex');
const integrity = (bytes: Buffer) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const dirs: string[] = [];
const directory = () => { const dir = mkdtempSync(join(tmpdir(), 'memory-e2-test-')); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const run = (args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

it.skipIf(hasRegisterHooks)('should refuse Node.js without registerHooks before processing inputs', () => {
  const result = run(['--unknown-option']);
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('E2_UNSUPPORTED_NODE');
  expect(result.stderr).toContain('Node.js 22.15+ (22.x) or 23.5+');
  expect(result.stderr).toContain('node:module.registerHooks');
  expect(result.stderr).toContain('pinned Node 24 image');
  expect(result.stderr).toContain(process.version);
  expect(result.stderr).not.toContain('SyntaxError');
  expect(result.stdout).toBe('');
});

// P1 is future work: these are deliberately synthetic local P1 inputs, never release evidence.
function makeP1() {
  const dir = directory();
  const put = (path: string, body: string) => {
    const bytes = Buffer.from(body);
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), bytes);
    return bytes;
  };
  const artifacts = ['platform', 'broker'].map((role) => {
    const archive = `archives/mcp-${role}.tgz`, bytes = put(archive, `synthetic ${role} archive`);
    return { role, name: `@sentropic/mcp-${role}`, version: '0.1.0', sha256: sha256(bytes), integrity: integrity(bytes), sourceHead: 'b'.repeat(40), archive };
  });
  const path = 'contracts/memory.d.ts', bytes = put(path, 'export type Contract = string;\n');
  const doc = {
    manifestVersion: 1, stage: 'pre-candidate',
    source: { specSha256: FROZEN_SPEC_SHA256, l0Commit: 'a'.repeat(40), br3Commit: 'b'.repeat(40), l5Head: 'c'.repeat(40), sdkRange: '^1.31.0', declaredLockSha256: 'd'.repeat(64) },
    artifacts, contractInventory: [{ path, version: '0.1.0', sha256: sha256(bytes) }],
  };
  // Hash the exact retained bytes, including whitespace, rather than a reserialization.
  const manifest = put('pre-candidate-manifest.json', JSON.stringify(doc, null, 4) + '\n\n');
  return { dir, doc, digest: sha256(manifest), args: ['--p1-manifest', join(dir, 'pre-candidate-manifest.json'), '--p1-sha256', sha256(manifest)] };
}

/** Minimal npm-compatible tar writer: only regular files, no checksum verification on read. */
function tarEntry(name: string, data: Buffer): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 'utf8');
  header.write(data.length.toString(8).padStart(11, '0'), 124, 'utf8');
  header[156] = 48;
  return Buffer.concat([header, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}

function makeTarball(files: Record<string, string>): Buffer {
  const entries = Object.entries(files).map(([name, body]) => tarEntry(name, Buffer.from(body)));
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(512)]));
}

function packageJson(extraExports: Record<string, unknown> = {}) {
  return JSON.stringify({
    name: '@sentropic/engram', version: VERSION,
    exports: {
      '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      './memory-substrate': { types: './dist/memory-substrate.d.ts', import: './dist/memory-substrate.js' },
      ...extraExports,
    },
  });
}

const ENTRY_JS = `export { x } from './chunk-a.js';\nexport const entry = 1;\n`;
const ENTRY_DTS = `export { x } from './chunk-a.js';\nexport declare const entry: number;\n`;

const HOST_TUPLE_FORMAT = 'e2-host-tuple/v1';
const HOST_NODE_IMAGE = 'node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6';

// Synthetic sentropic host-tuple inputs (backend closure, neutral contract,
// locks, Node 24 image digest, profiles). The G1/C9 delivery does not exist
// yet; these local fixtures stand in for its documented file format only.
// Every declared file is written next to the tuple with bytes matching the
// declared hashes, exactly as the validator requires.
function makeHostTuple(extra: Record<string, unknown> = {}) {
  const dir = directory();
  const backendBytes = Buffer.from('synthetic backend archive');
  const contractBytes = Buffer.from('export type Neutral = string;\n');
  const lockBytes = Buffer.from(JSON.stringify({ name: 'host-lock', version: '0.0.0' }));
  const backendArchive = 'host/cluster-mesh-memory-0.3.0.tgz';
  const contractPath = 'contracts/module-storage-port.d.ts';
  const lockPath = 'locks/host-package-lock.json';
  for (const [path, bytes] of [[backendArchive, backendBytes], [contractPath, contractBytes], [lockPath, lockBytes]] as const) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), bytes);
  }
  const doc = {
    format: HOST_TUPLE_FORMAT,
    backend: {
      name: '@sentropic/cluster-mesh-memory', version: '0.3.0', sourceHead: 'c'.repeat(40),
      archive: backendArchive, sha256: sha256(backendBytes),
      integrity: integrity(backendBytes),
    },
    neutralContract: { path: contractPath, version: '4.1.0', sha256: sha256(contractBytes) },
    locks: [{ path: lockPath, sha256: sha256(lockBytes) }],
    nodeImage: HOST_NODE_IMAGE,
    profiles: ['atomic-units-v1', 'immutable-chains-v1', 'immutable-boundaries-v1', 'scope-outbox-v1', 'fenced-writers-v1'],
    ...extra,
  };
  const path = join(dir, 'host-tuple.json');
  writeFileSync(path, JSON.stringify(doc, null, 2));
  return { dir, doc, args: ['--host-tuple', path] };
}

function makeE2(extra: { files?: Record<string, string>; exportMap?: Record<string, unknown> } = {}) {
  const dir = directory();
  const tarball = makeTarball({
    'package/package.json': packageJson(extra.exportMap),
    'package/dist/memory-substrate.js': ENTRY_JS,
    'package/dist/memory-substrate.d.ts': ENTRY_DTS,
    'package/dist/chunk-a.js': 'export const x = 1;\n',
    'package/dist/chunk-a.d.ts': 'export declare const x: number;\n',
    ...extra.files,
  });
  const tgz = join(dir, `engram-${VERSION}.tgz`);
  writeFileSync(tgz, tarball);
  const registry = {
    name: '@sentropic/engram', version: VERSION, gitHead: GIT_HEAD,
    dist: {
      shasum: sha1(tarball), tarball: `https://registry.npmjs.org/@sentropic/engram/-/engram-${VERSION}.tgz`,
      integrity: integrity(tarball),
      attestations: { url: `https://registry.npmjs.org/-/npm/v1/attestations/@sentropic%2fengram@${VERSION}`, provenance: { predicateType: SLSA_PREDICATE } },
    },
  };
  const statement = {
    predicateType: SLSA_PREDICATE,
    subject: [{ name: `pkg:npm/%40sentropic/engram@${VERSION}`, digest: { sha512: sha512hex(tarball) } }],
    predicate: {
      predicateType: SLSA_PREDICATE,
      buildDefinition: {
        externalParameters: { workflow: { ref: `refs/tags/v${VERSION}`, repository: REPOSITORY } },
        resolvedDependencies: [{ uri: `git+${REPOSITORY}@refs/tags/v${VERSION}`, digest: { gitCommit: GIT_HEAD } }],
      },
      runDetails: { metadata: { invocationId: 'synthetic-invocation' } },
    },
  };
  const attestations = { attestations: [{ predicateType: SLSA_PREDICATE, bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') } } }] };
  const reg = join(dir, 'registry.json'), att = join(dir, 'attestations.json');
  writeFileSync(reg, JSON.stringify(registry, null, 2));
  writeFileSync(att, JSON.stringify(attestations));
  const base = ['--expected-version', VERSION, '--tarball', tgz, '--registry-json', reg, '--attestations-json', att];
  return { dir, tarball, registry, base };
}

describe.skipIf(!hasRegisterHooks)(`E2 handoff prerequisites${skipReason}`, () => {
  it.each([[], ['--p1-sha256', 'a'.repeat(64)], ['--p1-manifest', 'missing.json'], ['--p1-sha256', 'ABC']].map((binding) => ({ binding })))('should refuse a final manifest without complete P1 binding: $binding', ({ binding }) => {
    const e2 = makeE2();
    const result = run([...e2.base, '--output-dir', join(directory(), 'output'), ...binding]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Final manifest requires --p1-sha256/);
  });

  it('should retain the sentropic schema and verifier byte-for-byte with source provenance', () => {
    const root = join(ROOT, 'scripts/vendor/memory-mcp-l5');
    const provenance = readJson(join(root, 'provenance.json'));
    expect(provenance.commit).toBe('9ed96eb83cd77da710f1adeb83a19e425d6c4910');
    for (const file of provenance.files) {
      const bytes = readFileSync(join(root, file.path));
      expect(sha256(bytes)).toBe(file.sha256);
      const upstream = process.env.ENGRAM_E2_SENTROPIC_REPO;
      if (upstream) expect(bytes.equals(execFileSync('git', ['-C', upstream, 'show', `${provenance.commit}:${file.upstreamPath}`]))).toBe(true);
    }
  });
});

describe.skipIf(!hasRegisterHooks)(`E2 host closure tuple (sentropic delivery, fail-closed with source-gap)${skipReason}`, () => {
  it('should refuse a final manifest when the host tuple is absent', () => {
    const e2 = makeE2();
    const p1 = makeP1();
    const result = run([...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/source-gap/);
  });

  it('should refuse a final manifest when the host tuple is incomplete', () => {
    const e2 = makeE2();
    const p1 = makeP1();
    const host = makeHostTuple({ locks: [] });
    const result = run([...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/source-gap/);
  });

  it.each([false, true])('should reopen the retained bundle without source inputs (draft=%s)', (draft) => {
    const e2 = makeE2(), p1 = makeP1(), host = makeHostTuple(), out = join(directory(), 'output');
    const binding = draft ? ['--pre-binding'] : p1.args;
    const first = run([...e2.base, '--output-dir', out, ...binding, ...host.args]);
    expect(first.status, first.stderr).toBe(0);
    const provenance = readJson(join(out, 'receipts/e2-provenance.json'));
    const tuplePath = join(out, provenance.hostClosure.path);
    expect(readFileSync(tuplePath).equals(readFileSync(host.args[1]!))).toBe(true);
    for (const path of [host.doc.backend.archive, host.doc.neutralContract.path, ...host.doc.locks.map((lock) => lock.path)]) {
      expect(readFileSync(join(dirname(tuplePath), path)).equals(readFileSync(join(host.dir, path)))).toBe(true);
    }
    for (const dir of [e2.dir, p1.dir, host.dir]) rmSync(dir, { recursive: true });
    const second = join(directory(), 'output');
    const result = run([
      '--expected-version', VERSION, '--tarball', join(out, provenance.artifact.archive),
      '--registry-json', join(out, provenance.npmRegistry.path), '--attestations-json', join(out, provenance.sigstore.path),
      '--host-tuple', tuplePath, '--output-dir', second,
      ...(draft ? ['--pre-binding'] : ['--p1-manifest', join(out, 'pre-candidate-manifest.json'), '--p1-sha256', p1.digest]),
    ]);
    expect(result.status, result.stderr).toBe(0);
    const paths = readdirSync(out, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name).slice(out.length + 1));
    for (const path of paths) expect(readFileSync(join(second, path)).equals(readFileSync(join(out, path))), path).toBe(true);
  });
});

describe.skipIf(!hasRegisterHooks)(`E2 exact command documentation${skipReason}`, () => {
  it('should give the exact directory creation and executable attestation retrieval steps', () => {
    const readme = readFileSync(join(ROOT, 'scripts/fixtures/memory-mcp-e2/README.md'), 'utf8');
    const script = readFileSync(SCRIPT, 'utf8');
    for (const doc of [readme, script]) {
      expect(doc).toMatch(/mkdir -p \/tmp\/e2-0\.21\.1/);
      expect(doc).toMatch(/curl -fsSL .*dist\.attestations\.url.*e2-0\.21\.1-attestations\.json/);
    }
    expect(readme).not.toMatch(/# fetch the exact response/);
  });
});

describe.skipIf(!hasRegisterHooks)(`E2 substrate entry on a local deterministic fixture (offline)${skipReason}`, () => {
  it('should refuse a tarball whose export map is not the memory-substrate entry', () => {
    const e2 = makeE2({ exportMap: { './memory-substrate': { types: './dist/memory-tools.d.ts', import: './dist/memory-tools.js' } } });
    const p1 = makeP1();
    const host = makeHostTuple();
    const result = run([...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/memory-substrate/);
  });

  it('should refuse a tarball missing a chunk required by the entry', () => {
    const e2 = makeE2({ files: { 'package/dist/memory-substrate.js': `export { x } from './chunk-missing.js';\n` } });
    const p1 = makeP1();
    const host = makeHostTuple();
    const result = run([...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/missing chunk/);
  });

  it('should refuse an unresolved side-effect import', () => {
    const e2 = makeE2({ files: { 'package/dist/memory-substrate.js': `import './side-missing.js';\nexport { x } from './chunk-a.js';\n` } });
    const p1 = makeP1();
    const host = makeHostTuple();
    const result = run([...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/missing chunk dist\/side-missing\.js/);
  });

  it('should inventory a resolved side-effect import', () => {
    const e2 = makeE2({ files: {
      'package/dist/memory-substrate.js': `import './side.js';\nexport { x } from './chunk-a.js';\n`,
      'package/dist/side.js': 'globalThis.__side = 1;\n',
    } });
    const p1 = makeP1();
    const host = makeHostTuple();
    const out = join(directory(), 'output');
    const result = run([...e2.base, '--output-dir', out, ...p1.args, ...host.args]);
    expect(result.status, result.stderr).toBe(0);
    const packed = JSON.parse(readFileSync(join(out, 'receipts/e2-provenance.json'), 'utf8')).packedFiles.map((f: { path: string }) => f.path);
    expect(packed).toContain('dist/side.js');
  });

  it('should refuse a runtime import satisfied only by a declaration', () => {
    const e2 = makeE2({ files: {
      'package/dist/memory-substrate.js': `export { x } from './only-types.js';\n`,
      'package/dist/only-types.d.ts': 'export declare const x: number;\n',
    } });
    const p1 = makeP1();
    const host = makeHostTuple();
    const result = run([...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/missing chunk dist\/only-types\.js/);
  });

  it('should refuse a reachable declaration missing although its JS exists', () => {
    const e2 = makeE2({ files: {
      'package/dist/memory-substrate.d.ts': `export { y } from './chunk-b.js';\n`,
      'package/dist/chunk-b.js': 'export const y = 2;\n',
    } });
    const p1 = makeP1();
    const host = makeHostTuple();
    const result = run([...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/missing chunk dist\/chunk-b\.d\.ts/);
  });

  it('should refuse a tarball whose integrity differs from the published npm dist', () => {
    const e2 = makeE2();
    const registry = { ...e2.registry, dist: { ...e2.registry.dist, integrity: integrity(Buffer.from('different bytes')) } };
    const reg = join(e2.dir, 'registry-tampered.json');
    writeFileSync(reg, JSON.stringify(registry, null, 2));
    const p1 = makeP1();
    const host = makeHostTuple();
    const args = [...e2.base];
    args[args.indexOf('--registry-json') + 1] = reg;
    const result = run([...args, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/integrity/);
  });

  it.each([
    `import type { X } from './type-edge.js'; export { X };`,
    `export type { X } from './type-edge.js';`,
    `export type X = import('./type-edge.js').X;`,
    `export type X = typeof import('./type-edge.js');`,
    `import X = require('./type-edge.js'); export { X };`,
    `export {}; declare module './type-edge.js' { export type Added = string; }`,
    `declare module './type-edge.js' { export type Added = string; }`,
    `/** @typedef {import('./type-edge.js').X} X */\nexport {};`,
    `/** @import { X } from './type-edge.js' */\nexport {};`,
    `/// <reference path="./type-edge.d.ts" />`,
    `/// <reference types="./type-edge.d.ts" />`,
  ])('should inventory transitive declaration edges from %s', (declaration) => {
    const files = {
      'package/dist/memory-substrate.d.ts': declaration,
      'package/dist/type-edge.d.ts': `export type X = import('./nested.js').X;`,
      'package/dist/nested.d.ts': 'export type X = string;',
    };
    const e2 = makeE2({ files });
    const p1 = makeP1(), host = makeHostTuple(), out = join(directory(), 'output');
    const result = run([...e2.base, '--output-dir', out, ...p1.args, ...host.args]);
    expect(result.status, result.stderr).toBe(0);
    const packed = readJson(join(out, 'receipts/e2-provenance.json')).packedFiles;
    for (const path of ['package/dist/type-edge.d.ts', 'package/dist/nested.d.ts'] as const) {
      expect(packed).toContainEqual({ path: path.slice('package/'.length), sha256: sha256(Buffer.from(files[path])) });
    }
  });

  it.each([
    `/** @typedef {import('./type-edge.js').X} X */\nexport const x = 1;`,
    `/** @import { X } from './type-edge.js' */\nexport const x = 1;`,
  ])('should inventory declaration bytes for JSDoc in runtime JS: %s', (source) => {
    const declaration = 'export type X = string;';
    const e2 = makeE2({ files: {
      'package/dist/chunk-a.js': source,
      'package/dist/type-edge.d.ts': declaration,
    } });
    const p1 = makeP1(), host = makeHostTuple(), out = join(directory(), 'output');
    const result = run([...e2.base, '--output-dir', out, ...p1.args, ...host.args]);
    expect(result.status, result.stderr).toBe(0);
    expect(readJson(join(out, 'receipts/e2-provenance.json')).packedFiles).toContainEqual({
      path: 'dist/type-edge.d.ts', sha256: sha256(Buffer.from(declaration)),
    });
  });

  it.each([
    { specifier: './%63hunk-a.js', target: 'chunk-a' },
    { specifier: './chunk-a.js?profile=offline#entry', target: 'chunk-a' },
    { specifier: './literal%256d.js', target: 'literal%6d' },
    { specifier: './literal%23hash.js', target: 'literal#hash' },
  ])('should inventory Node URL targets for $specifier in both graphs', ({ specifier, target }) => {
    const files = {
      'package/dist/memory-substrate.js': `export { x } from '${specifier}';`,
      'package/dist/memory-substrate.d.ts': `export type X = import('${specifier}').X;`,
      [`package/dist/${target}.js`]: 'export const x = 1;',
      [`package/dist/${target}.d.ts`]: 'export type X = string;',
    };
    const e2 = makeE2({ files }), p1 = makeP1(), host = makeHostTuple(), out = join(directory(), 'output');
    const result = run([...e2.base, '--output-dir', out, ...p1.args, ...host.args]);
    expect(result.status, result.stderr).toBe(0);
    const packed = readJson(join(out, 'receipts/e2-provenance.json')).packedFiles;
    for (const extension of ['js', 'd.ts']) {
      const path = `dist/${target}.${extension}`;
      expect(packed).toContainEqual({ path, sha256: sha256(Buffer.from(files[`package/${path}`]!)) });
    }
  });

  it.each(['@sentropic/engram/retained', '#retained', 'bundled/retained'])('should resolve Node import and types conditions for %s and retain transitive bytes', (specifier) => {
    const conditions = { types: './dist/retained-types.d.ts', import: './dist/retained-runtime.js', require: './dist/missing-require.cjs' };
    const files: Record<string, string> = {
      'package/dist/memory-substrate.js': `export { x } from '${specifier}';`,
      'package/dist/memory-substrate.d.ts': `export type X = import('${specifier}').X;`,
      'package/dist/retained-runtime.js': `export { x } from './runtime-nested.js';`,
      'package/dist/runtime-nested.js': 'export const x = 1;',
      'package/dist/retained-types.d.ts': `export type X = import('./types-nested.js').X;`,
      'package/dist/types-nested.d.ts': 'export type X = string;',
    };
    if (specifier === '#retained') files['package/package.json'] = JSON.stringify({ ...JSON.parse(packageJson()), imports: { '#retained': conditions } });
    if (specifier === 'bundled/retained') {
      files['package/node_modules/bundled/package.json'] = JSON.stringify({ name: 'bundled', exports: { './retained': conditions } });
      for (const [path, bytes] of Object.entries(files)) {
        if (path.startsWith('package/dist/') && !path.includes('memory-substrate')) {
          files[path.replace('package/dist/', 'package/node_modules/bundled/dist/')] = bytes;
          delete files[path];
        }
      }
    }
    const e2 = makeE2({ files, exportMap: { './retained': conditions } });
    const p1 = makeP1(), host = makeHostTuple(), out = join(directory(), 'output');
    const result = run([...e2.base, '--output-dir', out, ...p1.args, ...host.args]);
    expect(result.status, result.stderr).toBe(0);
    const packed = readJson(join(out, 'receipts/e2-provenance.json')).packedFiles;
    for (const [path, bytes] of Object.entries(files)) {
      if (path.endsWith('/package.json') || path.includes('memory-substrate')) continue;
      expect(packed).toContainEqual({ path: path.slice('package/'.length), sha256: sha256(Buffer.from(bytes)) });
    }
  });

  it('should allow Node builtins in both graphs', () => {
    const e2 = makeE2({ files: {
      'package/dist/chunk-a.js': `import 'node:fs'; import 'node:fs/promises'; import 'fs'; export const x = 1;`,
      'package/dist/chunk-a.d.ts': `import 'node:fs'; export declare const x: number;`,
    } });
    const p1 = makeP1(), host = makeHostTuple();
    const result = run([...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args]);
    expect(result.status, result.stderr).toBe(0);
  });

  it('should resolve require conditions from the reached package rather than the archive root', () => {
    const files = {
      'package/dist/chunk-a.js': `require('bundled'); export const x = 1;`,
      'package/node_modules/bundled/package.json': JSON.stringify({
        name: 'bundled', exports: { import: './missing.js', require: './entry.js' },
        imports: { '#nested': { import: './missing.js', require: './nested.js' } },
      }),
      'package/node_modules/bundled/entry.js': `require('#nested');`,
      'package/node_modules/bundled/nested.js': 'module.exports = 1;',
    };
    const e2 = makeE2({ files });
    const p1 = makeP1(), host = makeHostTuple(), out = join(directory(), 'output');
    const result = run([...e2.base, '--output-dir', out, ...p1.args, ...host.args]);
    expect(result.status, result.stderr).toBe(0);
    const packed = readJson(join(out, 'receipts/e2-provenance.json')).packedFiles;
    for (const path of ['package/node_modules/bundled/entry.js', 'package/node_modules/bundled/nested.js'] as const) {
      expect(packed).toContainEqual({ path: path.slice('package/'.length), sha256: sha256(Buffer.from(files[path])) });
    }
  });

  it('should refuse to run without an explicit target version', () => {
    const e2 = makeE2();
    const p1 = makeP1();
    const args = e2.base.filter((a, i) => a !== '--expected-version' && e2.base[i - 1] !== '--expected-version');
    const result = run([...args, '--output-dir', join(directory(), 'output'), ...p1.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--expected-version/);
  });

  it('should refuse a P1 digest that differs from the retained manifest bytes', () => {
    const e2 = makeE2();
    const p1 = makeP1();
    const host = makeHostTuple();
    const args = [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args.slice(0, -1), 'f'.repeat(64), ...host.args];
    const result = run(args);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/P1 manifest SHA-256 mismatch/);
  });

  it('should bind the fixture E2, the exact P1 bytes and a valid host tuple in the closed sentropic Lot 2 schema', () => {
    const e2 = makeE2(), p1 = makeP1(), host = makeHostTuple(), out = join(e2.dir, 'output');
    const result = run([...e2.base, '--output-dir', out, ...p1.args, ...host.args]);
    expect(result.status, result.stderr).toBe(0);
    const bytes = readFileSync(join(out, 'lot2-manifest.json')), manifest = JSON.parse(bytes.toString());
    expect(validateAgainstSchema(manifest, ARTIFACT_MANIFEST_SCHEMA)).toEqual([]);
    expect(checkArtifactManifest(manifest, { retainedContractInventory: p1.doc.contractInventory })).toEqual([]);
    expect(manifest.stage).toBe('lot2');
    expect(manifest.preCandidateManifestSha256).toBe(p1.digest);
    expect(sha256(readFileSync(join(out, 'pre-candidate-manifest.json')))).toBe(p1.digest);
    expect(manifest.source).toEqual(p1.doc.source);
    expect(manifest.e2ArtifactSha256).toBe(sha256(e2.tarball));
    expect(manifest.artifacts.find((a: { role: string }) => a.role === 'e2').version).toBe(VERSION);
    for (const artifact of manifest.artifacts) {
      const archive = readFileSync(join(out, artifact.archive));
      expect(sha256(archive)).toBe(artifact.sha256);
      expect(integrity(archive)).toBe(artifact.integrity);
    }
    const packed = JSON.parse(readFileSync(join(out, 'receipts/e2-provenance.json'), 'utf8')).packedFiles.map((f: { path: string }) => f.path);
    for (const path of ['package.json', 'dist/memory-substrate.js', 'dist/memory-substrate.d.ts', 'dist/chunk-a.js', 'dist/chunk-a.d.ts']) expect(packed).toContain(path);
    const provenanceBytes = readFileSync(join(out, manifest.e2Provenance.path));
    expect(sha256(provenanceBytes)).toBe(manifest.e2Provenance.sha256);
    const provenance = JSON.parse(provenanceBytes.toString());
    expect(provenance.bReference).toMatchObject({ releaseOption: 'B', tag: `v${VERSION}`, commit: GIT_HEAD });
    expect(provenance.hostClosure).toMatchObject({
      path: 'receipts/e2-host-tuple.json', format: HOST_TUPLE_FORMAT,
      backend: host.doc.backend, neutralContract: host.doc.neutralContract,
      locks: host.doc.locks, nodeImage: host.doc.nodeImage, profiles: host.doc.profiles,
    });
    expect(sha256(readFileSync(join(out, provenance.hostClosure.path)))).toBe(provenance.hostClosure.sha256);
    expect(sha256(readFileSync(join(host.dir, 'host-tuple.json')))).toBe(provenance.hostClosure.sha256);
    for (const ref of [provenance.npmRegistry, provenance.sigstore]) expect(sha256(readFileSync(join(out, ref.path)))).toBe(ref.sha256);
    expect(readFileSync(join(out, 'lot2-manifest.json.sha256'), 'utf8')).toBe(`${sha256(bytes)}  lot2-manifest.json\n`);
  });

  it('should produce identical bytes for every output on two executions', () => {
    const e2 = makeE2(), p1 = makeP1(), host = makeHostTuple();
    const first = join(e2.dir, 'output'), second = join(directory(), 'output');
    for (const out of [first, second]) {
      const result = run([...e2.base, '--output-dir', out, ...p1.args, ...host.args]);
      expect(result.status, result.stderr).toBe(0);
    }
    const paths = readdirSync(first, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name).slice(first.length + 1)).sort();
    for (const path of paths) expect(readFileSync(join(first, path)).equals(readFileSync(join(second, path))), path).toBe(true);
  });

  it.each(['digest', 'archive', 'inventory'])('should fail before writing when P1 %s is altered', (kind) => {
    const e2 = makeE2(), p1 = makeP1(), host = makeHostTuple(), out = join(directory(), 'output');
    if (kind === 'digest') p1.args[p1.args.length - 1] = 'f'.repeat(64);
    else writeFileSync(join(p1.dir, kind === 'archive' ? p1.doc.artifacts[0]!.archive : p1.doc.contractInventory[0]!.path), 'tampered');
    const result = run([...e2.base, '--output-dir', out, ...p1.args, ...host.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/P1 .*mismatch/);
    expect(existsSync(out)).toBe(false);
  });
});

const HOST_IMAGE_DIGEST = HOST_NODE_IMAGE.split('@sha256:')[1]!;

// Single round-3 mutation driver: one table row per check, every row must be refused.
const ROUND3_MUTATIONS: { id: string; stderr: RegExp; setup: () => string[] }[] = [
  {
    id: 'comment-in-import', stderr: /missing chunk dist\/missing\.js/,
    setup: () => makeE2commentArgs(),
  },
  {
    id: 'decoy-extension', stderr: /missing chunk dist\/missing\.js/,
    setup: () => {
      const e2 = makeE2({ files: {
        'package/dist/memory-substrate.js': `export { x } from './missing.js';\n`,
        'package/dist/missing.js.js': 'export const decoy = true;\n',
      } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  },
  ...['runtime', 'types'].map((kind) => ({
    id: `encoded-decoy-${kind}`, stderr: /missing chunk dist\/missing\.(js|d\.ts)/,
    setup: () => {
      const e2 = makeE2({ files: {
        ...(kind === 'runtime'
          ? { 'package/dist/memory-substrate.js': `export { x } from './%6dissing.js';` }
          : { 'package/dist/memory-substrate.d.ts': `export type X = import('./%6dissing.js').X;` }),
        'package/dist/%6dissing.js': 'export const x = 1;',
        'package/dist/%6dissing.d.ts': 'export type X = string;',
      } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  })),
  ...['%2f', '%5c'].map((separator) => ({
    id: `encoded-separator-${separator}`, stderr: /encoded separator/,
    setup: () => {
      const e2 = makeE2({ files: {
        'package/dist/memory-substrate.js': `import './${separator}missing.js';`,
        [`package/dist/${separator}missing.js`]: 'export const decoy = true;',
      } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  })),
  {
    id: 'missing-types-target', stderr: /types/,
    setup: () => {
      const e2 = makeE2({ exportMap: { './memory-substrate': { types: './dist/memory-substrate-types-missing.d.ts', import: './dist/memory-substrate.js' } } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  },
  ...[
    { id: 'type-import-declaration', declaration: `import type { X } from './missing.js'; export { X };` },
    { id: 'type-export-declaration', declaration: `export type { X } from './missing.js';` },
    { id: 'type-import', declaration: `export type X = import('./missing.js').X;` },
    { id: 'typeof-type-import', declaration: `export type X = typeof import('./missing.js');` },
    { id: 'external-module-reference', declaration: `import X = require('./missing.js'); export { X };` },
    { id: 'module-augmentation', declaration: `export {}; declare module './missing.js' { export type X = string; }` },
    { id: 'ambient-relative-module', declaration: `declare module './missing.js' { export type X = string; }` },
    { id: 'jsdoc-import-type', declaration: `/** @typedef {import('./missing.js').X} X */\nexport {};` },
    { id: 'jsdoc-import-tag', declaration: `/** @import { X } from './missing.js' */\nexport {};` },
    { id: 'type-reference-path', declaration: `/// <reference path="./missing.d.ts" />` },
    { id: 'type-reference-types', declaration: `/// <reference types="./missing.d.ts" />` },
  ].map(({ id, declaration }) => ({
    id, stderr: /missing chunk dist\/missing\.d\.ts/,
    setup: () => {
      const e2 = makeE2({ files: {
        'package/dist/chunk-a.d.ts': declaration,
        // Runtime bytes cannot satisfy a missing type edge.
        'package/dist/missing.js': 'export const X = 1;',
      } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  })),
  ...[
    { id: 'runtime-package', specifier: 'missing-package', stderr: /E2_UNRESOLVED_DEPENDENCY.*ERR_MODULE_NOT_FOUND/ },
    { id: 'runtime-subpath-import', specifier: '#missing', stderr: /E2_UNRESOLVED_DEPENDENCY.*ERR_PACKAGE_IMPORT_NOT_DEFINED/ },
    { id: 'runtime-file-url', specifier: 'file:///__engram_missing__/missing.js', stderr: /E2_UNRETAINED_DEPENDENCY/ },
    { id: 'runtime-export-target', specifier: '@sentropic/engram/retained', stderr: /E2_MISSING_DEPENDENCY.*missing chunk dist\/missing\.js/ },
    { id: 'runtime-import-target', specifier: '#retained', stderr: /E2_MISSING_DEPENDENCY.*missing chunk dist\/missing\.js/ },
    { id: 'runtime-unexported-subpath', specifier: '@sentropic/engram/private', stderr: /E2_UNRESOLVED_DEPENDENCY.*ERR_PACKAGE_PATH_NOT_EXPORTED/ },
  ].map(({ id, specifier, stderr }) => ({
    id, stderr,
    setup: () => {
      const conditions = { types: './dist/chunk-a.d.ts', import: './dist/missing.js' };
      const e2 = makeE2({
        exportMap: { './retained': conditions },
        files: {
          'package/package.json': JSON.stringify({ ...JSON.parse(packageJson({ './retained': conditions })), imports: { '#retained': conditions } }),
          'package/dist/chunk-a.js': `import '${specifier}'; export const x = 1;`,
        },
      });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  })),
  {
    id: 'runtime-unretained-file-url', stderr: /E2_UNRETAINED_DEPENDENCY/,
    setup: () => {
      const external = join(directory(), 'external.js');
      writeFileSync(external, 'export const x = 1;');
      const e2 = makeE2({ files: { 'package/dist/chunk-a.js': `import '${pathToFileURL(external).href}'; export const x = 1;` } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  },
  {
    id: 'archive-path-alias', stderr: /E2_INVALID_ARCHIVE_MEMBER/,
    setup: () => {
      const e2 = makeE2({ files: { 'package/./package.json': packageJson() } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  },
  {
    id: 'ambient-package-module', stderr: /unretained type dependency missing-package/,
    setup: () => {
      const e2 = makeE2({ files: { 'package/dist/chunk-a.d.ts': `declare module 'missing-package' { export type X = string; }` } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  },
  ...[
    { id: 'runtime-jsdoc-import-type', source: `/** @typedef {import('./missing.js').X} X */\nexport const x = 1;` },
    { id: 'runtime-jsdoc-import-tag', source: `/** @import { X } from './missing.js' */\nexport const x = 1;` },
  ].map(({ id, source }) => ({
    id, stderr: /missing chunk dist\/missing\.d\.ts/,
    setup: () => {
      const e2 = makeE2({ files: { 'package/dist/chunk-a.js': source, 'package/dist/missing.js': 'export const X = 1;' } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  })),
  {
    id: 'unretained-type-package', stderr: /unretained type dependency/,
    setup: () => {
      const e2 = makeE2({ files: { 'package/dist/chunk-a.d.ts': `export type X = import('missing-package').X;` } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  },
  {
    id: 'nonexistent-tuple-file', stderr: /source-gap/,
    setup: () => {
      const e2 = makeE2(), p1 = makeP1(), host = makeHostTuple();
      rmSync(join(host.dir, host.doc.backend.archive));
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  },
  {
    id: 'tampered-tuple-file', stderr: /source-gap/,
    setup: () => {
      const e2 = makeE2(), p1 = makeP1(), host = makeHostTuple();
      writeFileSync(join(host.dir, host.doc.neutralContract.path), 'tampered');
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  },
  ...['backend', 'contract', 'lock'].map((kind) => ({
    id: `tampered-retained-${kind}`, stderr: /source-gap:.*bytes do not match/,
    setup: () => {
      const e2 = makeE2(), p1 = makeP1(), host = makeHostTuple(), out = join(directory(), 'output');
      const first = run([...e2.base, '--output-dir', out, ...p1.args, ...host.args]);
      expect(first.status, first.stderr).toBe(0);
      const provenance = readJson(join(out, 'receipts/e2-provenance.json'));
      const tuplePath = join(out, provenance.hostClosure.path);
      const tuple = readJson(tuplePath);
      const path = kind === 'backend' ? tuple.backend.archive : kind === 'contract' ? tuple.neutralContract.path : tuple.locks[0].path;
      const retained = join(dirname(tuplePath), path);
      expect(existsSync(retained), `retained ${kind} must exist`).toBe(true);
      writeFileSync(retained, 'tampered retained copy');
      rmSync(host.dir, { recursive: true });
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, '--host-tuple', tuplePath];
    },
  })),
  {
    id: 'tuple-evidence-collision', stderr: /collides with E2 evidence/,
    setup: () => {
      const e2 = makeE2(), p1 = makeP1(), host = makeHostTuple();
      const bytes = Buffer.from('host file must not overwrite provenance');
      writeFileSync(join(host.dir, 'e2-provenance.json'), bytes);
      host.doc.locks.push({ path: './e2-provenance.json', sha256: sha256(bytes) });
      writeFileSync(host.args[1]!, JSON.stringify(host.doc));
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  },
  {
    id: 'wrong-node-major', stderr: /nodeImage/,
    setup: () => {
      const e2 = makeE2(), p1 = makeP1();
      const host = makeHostTuple({ nodeImage: `node:240-bookworm-slim@sha256:${HOST_IMAGE_DIGEST}` });
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  },
  {
    id: 'malformed-digest', stderr: /nodeImage/,
    setup: () => {
      const e2 = makeE2(), p1 = makeP1();
      const host = makeHostTuple({ nodeImage: 'node:24-bookworm-slim@sha256:not-a-digest' });
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  },
];

function makeE2commentArgs(): string[] {
  const e2 = makeE2({ files: {
    'package/dist/memory-substrate.js': `import /* trailing comment */ './missing.js';\nexport { x } from './chunk-a.js';\n`,
  } });
  const p1 = makeP1(), host = makeHostTuple();
  return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
}

describe.skipIf(!hasRegisterHooks)(`E2 round-3 refusal driver${skipReason}`, () => {
  it.each(ROUND3_MUTATIONS)('refuses mutation $id', ({ setup, stderr }) => {
    const result = run(setup());
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(stderr);
  });

  it('covers every round-3 check with exactly one mutation row', () => {
    const ids = ROUND3_MUTATIONS.map((mutation) => mutation.id);
    expect([...ids].sort()).toEqual([
      'ambient-package-module', 'ambient-relative-module', 'archive-path-alias', 'comment-in-import', 'decoy-extension',
      'encoded-decoy-runtime', 'encoded-decoy-types', 'encoded-separator-%2f', 'encoded-separator-%5c',
      'external-module-reference', 'jsdoc-import-tag', 'jsdoc-import-type', 'malformed-digest',
      'missing-types-target', 'module-augmentation', 'nonexistent-tuple-file',
      'runtime-export-target', 'runtime-file-url', 'runtime-import-target',
      'runtime-jsdoc-import-tag', 'runtime-jsdoc-import-type',
      'runtime-package', 'runtime-subpath-import', 'runtime-unexported-subpath', 'runtime-unretained-file-url',
      'tampered-retained-backend', 'tampered-retained-contract', 'tampered-retained-lock',
      'tampered-tuple-file', 'tuple-evidence-collision', 'type-export-declaration', 'type-import',
      'type-import-declaration', 'type-reference-path', 'type-reference-types', 'typeof-type-import',
      'unretained-type-package', 'wrong-node-major',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// Owner's final targeted checks: each row must independently refuse binding.
const FINAL_MUTATIONS = [
  ...['import', 'require', 'package-types'].map((mode) => ({
    id: `declarations-${mode}`, stderr: /E2_UNRESOLVED_TYPE_DEPENDENCY.*missing chunk .*missing\.d\.ts/,
    setup: () => {
      const conditions = { types: { [mode]: './dist/conditional.d.ts', default: './dist/decoy.d.ts' }, import: './dist/chunk-a.js' };
      const e2 = makeE2({ exportMap: { './conditional': conditions }, files: {
        'package/dist/chunk-a.d.ts': mode === 'package-types'
          ? `export type X = import('typed-package').X;`
          : mode === 'require' ? `import X = require('@sentropic/engram/conditional'); export { X };`
          : `export type X = import('@sentropic/engram/conditional', { with: { 'resolution-mode': 'import' } }).X;`,
        'package/dist/conditional.d.ts': `export type X = import('./missing.js').X;`,
        'package/dist/decoy.d.ts': 'export type X = string;',
        'package/dist/missing.js': 'export const X = 1;',
        'package/node_modules/typed-package/package.json': JSON.stringify({ name: 'typed-package', types: './index.d.ts', main: './decoy.js' }),
        'package/node_modules/typed-package/index.d.ts': `export type X = import('./missing.js').X;`,
        'package/node_modules/typed-package/decoy.js': 'module.exports = {};',
        'package/node_modules/typed-package/decoy.d.ts': 'export type X = string;',
        'package/node_modules/typed-package/missing.js': 'export const X = 1;',
      } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  })),
  ...['require', 'module.require', 'createRequire(import.meta.url)', 'import'].flatMap((form) => [
    { kind: 'package', argument: `'missing-package'`, stderr: /E2_UNRESOLVED_DEPENDENCY/ },
    { kind: 'imports', argument: `'#missing'`, stderr: /E2_UNRESOLVED_DEPENDENCY/ },
    { kind: 'file', argument: `'file:///__engram_missing__/missing.js'`, stderr: /E2_(UNRESOLVED|UNRETAINED)_DEPENDENCY/ },
    { kind: 'relative', argument: `'./missing.js'`, stderr: /E2_(UNRESOLVED|MISSING)_DEPENDENCY/ },
    { kind: 'computed', argument: 'target', stderr: /E2_UNRESOLVED_MODULE_SPECIFIER/ },
    { kind: 'empty', argument: '', stderr: /E2_UNRESOLVED_MODULE_SPECIFIER/ },
  ].map(({ kind, argument, stderr }) => ({
    id: `call-${form}-${kind}`, stderr,
    setup: () => {
      const e2 = makeE2({ files: { 'package/dist/chunk-a.js': `${form}(${argument}); export const x = 1;` } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  }))),
  ...[
    { id: 'invalid-module-syntax', source: 'import {', stderr: /E2_INVALID_MODULE_SYNTAX/ },
    { id: 'module-call-arguments', source: `import('./chunk-a.js', options);`, stderr: /E2_UNSUPPORTED_MODULE_CALL/ },
    { id: 'unknown-require-receiver', source: `other.require('./chunk-a.js');`, stderr: /E2_UNRESOLVED_REQUIRE_BASE/ },
    { id: 'create-require-base', source: `createRequire(base)('./chunk-a.js');`, stderr: /E2_UNRESOLVED_REQUIRE_BASE/ },
    { id: 'create-require-escape', source: `const load = createRequire(import.meta.url); load('./missing.js');`, stderr: /E2_UNRESOLVED_REQUIRE_BASE/ },
    { id: 'require-escape', source: `const load = require; load('./missing.js');`, stderr: /E2_UNSUPPORTED_MODULE_CALL/ },
    { id: 'module-require-escape', source: `const load = module.require; load('./missing.js');`, stderr: /E2_UNSUPPORTED_MODULE_CALL/ },
    { id: 'require-call', source: `require.call(null, './missing.js');`, stderr: /E2_UNSUPPORTED_MODULE_CALL/ },
    { id: 'module-computed-method', source: `module[method]('./missing.js');`, stderr: /E2_UNSUPPORTED_MODULE_CALL/ },
    { id: 'aliased-create-require', source: `import { createRequire as loader } from 'node:module'; loader(import.meta.url)('./missing.js');`, stderr: /E2_UNRESOLVED_DEPENDENCY/ },
  ].map(({ id, source, stderr }) => ({
    id, stderr,
    setup: () => {
      const e2 = makeE2({ files: { 'package/dist/chunk-a.js': source } });
      const p1 = makeP1(), host = makeHostTuple();
      return [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args, ...host.args];
    },
  })),
  {
    id: 'closure-before-source-gap', stderr: /E2_MISSING_DEPENDENCY/,
    setup: () => {
      const e2 = makeE2({ files: { 'package/dist/chunk-a.js': `import './missing.js';` } });
      const host = join(directory(), 'placeholder-host.json');
      writeFileSync(host, '{}');
      return [...e2.base, '--pre-binding', '--host-tuple', host, '--output-dir', join(directory(), 'output')];
    },
  },
];

describe.skipIf(!hasRegisterHooks)(`E2 final strict refusal driver${skipReason}`, () => {
  it.each(FINAL_MUTATIONS)('refuses mutation $id', ({ setup, stderr }) => {
    const result = run(setup());
    expect(result.status, result.stdout).toBe(1);
    expect(result.stderr).toMatch(stderr);
    expect(result.stdout).not.toContain('bound');
  });

  it('covers every final check with exactly one mutation row', () => {
    const ids = FINAL_MUTATIONS.map((mutation) => mutation.id);
    const expected = [
      'declarations-import', 'declarations-require', 'declarations-package-types', 'closure-before-source-gap',
      'invalid-module-syntax', 'module-call-arguments', 'unknown-require-receiver',
      'create-require-base', 'create-require-escape', 'require-escape', 'module-require-escape',
      'require-call', 'module-computed-method', 'aliased-create-require',
      ...['require', 'module.require', 'createRequire(import.meta.url)', 'import'].flatMap((form) =>
        ['package', 'imports', 'file', 'relative', 'computed', 'empty'].map((kind) => `call-${form}-${kind}`)),
    ];
    expect([...ids].sort()).toEqual(expected.sort());
    expect(new Set(ids).size).toBe(ids.length);
  });
});


describe.skipIf(!hasRegisterHooks)(`E2 strict resolution positive controls${skipReason}`, () => {
  it.each(['require', 'module.require', 'createRequire(import.meta.url)', 'loader(import.meta.url)', 'import'])(
    'should retain the exact conditional runtime closure for %s', (form) => {
      const mode = form === 'import' ? 'import' : 'require';
      const extension = mode === 'import' ? 'mjs' : 'cjs';
      const conditions = { import: './dist/selected.mjs', require: './dist/selected.cjs' };
      const files = {
        'package/dist/chunk-a.js': `import { createRequire as loader } from 'node:module'; ${form}('@sentropic/engram/conditional');`,
        [`package/dist/selected.${extension}`]: mode === 'import' ? `import './nested.mjs';` : `module['require']('./nested.cjs');`,
        [`package/dist/nested.${extension}`]: '/* retained bytes, never executed */',
      };
      // The opposite condition deliberately names an absent file.
      const e2 = makeE2({ files, exportMap: { './conditional': conditions } });
      const host = makeHostTuple(), p1 = makeP1(), out = join(directory(), 'output');
      const result = run([...e2.base, '--output-dir', out, ...p1.args, ...host.args]);
      expect(result.status, result.stderr).toBe(0);
      const packed = readJson(join(out, 'receipts/e2-provenance.json')).packedFiles;
      for (const [path, bytes] of Object.entries(files)) {
        expect(packed).toContainEqual({ path: path.slice('package/'.length), sha256: sha256(Buffer.from(bytes)) });
      }
    },
  );

  it.each(['import', 'require', 'package-types'])(
    'should retain the transitive declarations selected by %s', (mode) => {
      const suffix = mode === 'require' ? 'cts' : 'mts';
      const extension = mode === 'require' ? 'cjs' : 'mjs';
      const target = `./dist/selected.d.${suffix}`;
      const conditions = { types: { [mode]: target, default: './dist/absent-decoy.d.ts' } };
      const declaration = mode === 'require'
        ? `import X = require('@sentropic/engram/conditional'); export { X };`
        : `export type X = import('${mode === 'import' ? '@sentropic/engram/conditional' : 'typed-package'}', { with: { 'resolution-mode': 'import' } }).X;`;
      const files = {
        'package/dist/chunk-a.d.ts': declaration,
        [`package/dist/selected.d.${suffix}`]: `export type X = import('./nested.${extension}').X;`,
        [`package/dist/nested.d.${suffix}`]: 'export type X = string;',
        'package/node_modules/typed-package/package.json': JSON.stringify({ name: 'typed-package', types: target }),
        [`package/node_modules/typed-package/dist/selected.d.${suffix}`]: `export type X = import('./nested.${extension}').X;`,
        [`package/node_modules/typed-package/dist/nested.d.${suffix}`]: 'export type X = string;',
      };
      const e2 = makeE2({ files, exportMap: { './conditional': conditions } });
      const host = makeHostTuple(), p1 = makeP1(), out = join(directory(), 'output');
      const result = run([...e2.base, '--output-dir', out, ...p1.args, ...host.args]);
      expect(result.status, result.stderr).toBe(0);
      const packed = readJson(join(out, 'receipts/e2-provenance.json')).packedFiles;
      const prefix = mode === 'package-types' ? 'node_modules/typed-package/' : '';
      for (const name of ['selected', 'nested']) {
        const path = `${prefix}dist/${name}.d.${suffix}`;
        expect(packed).toContainEqual({ path, sha256: sha256(Buffer.from(files[`package/${path}`]!)) });
      }
    },
  );
});
