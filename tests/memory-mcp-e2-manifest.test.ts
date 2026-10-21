import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { checkArtifactManifest, ARTIFACT_MANIFEST_SCHEMA, FROZEN_SPEC_SHA256 } from '../scripts/vendor/memory-mcp-l5/receipt.mjs';
import { validateAgainstSchema } from '../scripts/vendor/memory-mcp-l5/schema-validator.mjs';

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

function makeE2(extra: { files?: Record<string, string>; exportMap?: Record<string, unknown> } = {}) {
  const dir = directory();
  const tarball = makeTarball({
    'package/package.json': packageJson(extra.exportMap),
    'package/dist/memory-substrate.js': ENTRY_JS,
    'package/dist/memory-substrate.d.ts': ENTRY_DTS,
    'package/dist/chunk-a.js': 'export const x = 1;\n',
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

describe('E2 handoff prerequisites', () => {
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

describe('E2 substrate entry on a local deterministic fixture (offline)', () => {
  it('should refuse a tarball whose export map is not the memory-substrate entry', () => {
    const e2 = makeE2({ exportMap: { './memory-substrate': { types: './dist/memory-tools.d.ts', import: './dist/memory-tools.js' } } });
    const p1 = makeP1();
    const result = run([...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/memory-substrate/);
  });

  it('should refuse a tarball missing a chunk required by the entry', () => {
    const e2 = makeE2({ files: { 'package/dist/memory-substrate.js': `export { x } from './chunk-missing.js';\n` } });
    const p1 = makeP1();
    const result = run([...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/missing chunk/);
  });

  it('should refuse a tarball whose integrity differs from the published npm dist', () => {
    const e2 = makeE2();
    const registry = { ...e2.registry, dist: { ...e2.registry.dist, integrity: integrity(Buffer.from('different bytes')) } };
    const reg = join(e2.dir, 'registry-tampered.json');
    writeFileSync(reg, JSON.stringify(registry, null, 2));
    const p1 = makeP1();
    const args = [...e2.base];
    args[args.indexOf('--registry-json') + 1] = reg;
    const result = run([...args, '--output-dir', join(directory(), 'output'), ...p1.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/integrity/);
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
    const args = [...e2.base, '--output-dir', join(directory(), 'output'), ...p1.args.slice(0, -1), 'f'.repeat(64)];
    const result = run(args);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/P1 manifest SHA-256 mismatch/);
  });

  it('should bind the fixture E2 and the exact P1 bytes in the closed sentropic Lot 2 schema', () => {
    const e2 = makeE2(), p1 = makeP1(), out = join(e2.dir, 'output');
    const result = run([...e2.base, '--output-dir', out, ...p1.args]);
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
    for (const path of ['package.json', 'dist/memory-substrate.js', 'dist/memory-substrate.d.ts', 'dist/chunk-a.js']) expect(packed).toContain(path);
    const provenanceBytes = readFileSync(join(out, manifest.e2Provenance.path));
    expect(sha256(provenanceBytes)).toBe(manifest.e2Provenance.sha256);
    const provenance = JSON.parse(provenanceBytes.toString());
    expect(provenance.bReference).toMatchObject({ releaseOption: 'B', tag: `v${VERSION}`, commit: GIT_HEAD });
    for (const ref of [provenance.npmRegistry, provenance.sigstore]) expect(sha256(readFileSync(join(out, ref.path)))).toBe(ref.sha256);
    expect(readFileSync(join(out, 'lot2-manifest.json.sha256'), 'utf8')).toBe(`${sha256(bytes)}  lot2-manifest.json\n`);
  });

  it('should produce identical bytes for every output on two executions', () => {
    const e2 = makeE2(), p1 = makeP1();
    const first = join(e2.dir, 'output'), second = join(directory(), 'output');
    for (const out of [first, second]) {
      const result = run([...e2.base, '--output-dir', out, ...p1.args]);
      expect(result.status, result.stderr).toBe(0);
    }
    const paths = readdirSync(first, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name).slice(first.length + 1)).sort();
    for (const path of paths) expect(readFileSync(join(first, path)).equals(readFileSync(join(second, path))), path).toBe(true);
  });

  it.each(['digest', 'archive', 'inventory'])('should fail before writing when P1 %s is altered', (kind) => {
    const e2 = makeE2(), p1 = makeP1(), out = join(directory(), 'output');
    if (kind === 'digest') p1.args[p1.args.length - 1] = 'f'.repeat(64);
    else writeFileSync(join(p1.dir, kind === 'archive' ? p1.doc.artifacts[0]!.archive : p1.doc.contractInventory[0]!.path), 'tampered');
    const result = run([...e2.base, '--output-dir', out, ...p1.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/P1 .*mismatch/);
    expect(existsSync(out)).toBe(false);
  });
});
