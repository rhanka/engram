import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { checkArtifactManifest, ARTIFACT_MANIFEST_SCHEMA, FROZEN_SPEC_SHA256 } from '../scripts/vendor/memory-mcp-l5/receipt.mjs';
import { validateAgainstSchema } from '../scripts/vendor/memory-mcp-l5/schema-validator.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/memory-mcp-e2-manifest.mjs');
const TARBALL = process.env.ENGRAM_E2_TARBALL;
const EXPECTED_E2_SHA256 = '6057c13905e7b63a16bfde7b70ed77bc9073076aba65f8e69e2188501351be66';
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
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

describe('E2 handoff prerequisites', () => {
  it.each([[], ['--p1-sha256', 'a'.repeat(64)], ['--p1-manifest', 'missing.json'], ['--p1-sha256', 'ABC']].map((binding) => ({ binding })))('should refuse a final manifest without complete P1 binding: $binding', ({ binding }) => {
    const out = join(directory(), 'output');
    const result = run(['--tarball', 'missing.tgz', '--output-dir', out, ...binding]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Final manifest requires --p1-sha256/);
    expect(existsSync(out)).toBe(false);
  });

  it('should reject a substituted archive even in pre-binding mode', () => {
    const dir = directory(), fake = join(dir, 'fake.tgz');
    writeFileSync(fake, 'a local rebuild cannot stand in for the published release');
    const result = run(['--tarball', fake, '--output-dir', join(dir, 'output'), '--pre-binding']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/published npm integrity/);
    expect(existsSync(join(dir, 'output'))).toBe(false);
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

// No test downloads packages. Supply the exact npm-pack archive to exercise release generation.
describe.skipIf(!TARBALL)('E2 published archive integration (ENGRAM_E2_TARBALL)', () => {
  const args = (out: string) => ['--tarball', TARBALL!, '--output-dir', out];

  it('should emit only an explicitly marked draft before P1 exists', () => {
    const out = directory(), result = run([...args(out), '--pre-binding']);
    expect(result.status, result.stderr).toBe(0);
    const draft = readJson(join(out, 'lot2-manifest.pre-binding.json'));
    expect(draft.status).toBe('pre-binding');
    expect(draft.e2ArtifactSha256).toBe(EXPECTED_E2_SHA256);
    expect(draft.preCandidateManifestSha256).toBeUndefined();
    expect(validateAgainstSchema(draft, ARTIFACT_MANIFEST_SCHEMA).length).toBeGreaterThan(0);
    expect(existsSync(join(out, 'lot2-manifest.json'))).toBe(false);
    const mixed = run([...args(out), '--pre-binding', '--p1-sha256', 'a'.repeat(64)]);
    expect(mixed.status).toBe(1);
  });

  it('should bind the published E2 and exact P1 bytes in the closed sentropic Lot 2 schema', () => {
    const p1 = makeP1(), out = directory(), result = run([...args(out), ...p1.args]);
    expect(result.status, result.stderr).toBe(0);
    const bytes = readFileSync(join(out, 'lot2-manifest.json')), manifest = JSON.parse(bytes.toString());
    expect(validateAgainstSchema(manifest, ARTIFACT_MANIFEST_SCHEMA)).toEqual([]);
    expect(checkArtifactManifest(manifest, { retainedContractInventory: p1.doc.contractInventory })).toEqual([]);
    expect(manifest.stage).toBe('lot2');
    expect(manifest.preCandidateManifestSha256).toBe(p1.digest);
    expect(sha256(readFileSync(join(out, 'pre-candidate-manifest.json')))).toBe(p1.digest);
    expect(manifest.source).toEqual(p1.doc.source);
    expect(manifest.e2ArtifactSha256).toBe(EXPECTED_E2_SHA256);
    for (const artifact of manifest.artifacts) {
      const archive = readFileSync(join(out, artifact.archive));
      expect(sha256(archive)).toBe(artifact.sha256);
      expect(integrity(archive)).toBe(artifact.integrity);
    }
    const provenanceBytes = readFileSync(join(out, manifest.e2Provenance.path));
    expect(sha256(provenanceBytes)).toBe(manifest.e2Provenance.sha256);
    const provenance = JSON.parse(provenanceBytes.toString());
    expect(provenance.bReference).toMatchObject({ releaseOption: 'B', tag: 'v0.20.0', commit: 'af60f9d7f5e02fc31755fd81927c8dd2a44b117f' });
    for (const ref of [provenance.npmRegistry, provenance.sigstore]) expect(sha256(readFileSync(join(out, ref.path)))).toBe(ref.sha256);
    expect(readFileSync(join(out, 'lot2-manifest.json.sha256'), 'utf8')).toBe(`${sha256(bytes)}  lot2-manifest.json\n`);
  });

  it('should produce identical bytes for every output on two executions', () => {
    const p1 = makeP1(), first = directory(), second = directory();
    for (const out of [first, second]) {
      const result = run([...args(out), ...p1.args]);
      expect(result.status, result.stderr).toBe(0);
    }
    const paths = readdirSync(first, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name).slice(first.length + 1)).sort();
    for (const path of paths) expect(readFileSync(join(first, path)).equals(readFileSync(join(second, path))), path).toBe(true);
  });

  it.each(['digest', 'archive', 'inventory'])('should fail before writing when P1 %s is altered', (kind) => {
    const p1 = makeP1(), out = join(directory(), 'output');
    if (kind === 'digest') p1.args[p1.args.length - 1] = 'f'.repeat(64);
    else writeFileSync(join(p1.dir, kind === 'archive' ? p1.doc.artifacts[0]!.archive : p1.doc.contractInventory[0]!.path), 'tampered');
    const result = run([...args(out), ...p1.args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/P1 .*mismatch/);
    expect(existsSync(out)).toBe(false);
  });
});
