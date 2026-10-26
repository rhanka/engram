/**
 * Refresh `candidate-manifest.json` from the packed candidate tarball (Node only).
 *
 * Run after `npm run build && npm pack`. Derives `exports` from the PACKED
 * `package.json` (exact equality, no filtering), backfills the publisher
 * receipt's tarball/code-archive binding (`registry/publisher-assets.v1.json`
 * is unpacked precisely because a packed file cannot contain its own pack's
 * hash), re-validates the receipt against the exact tarball bytes, and
 * records artifact digests. The `sdkFloorProbe` field stays `pending` until
 * the packed acceptance passes and flips it to `pass` (acceptance-owned).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const NPM = process.env.MCP_L4_NPM_BIN ?? '/home/antoinefa/.npm-global/bin/npm';
const BUILT_AGAINST = '1c96bada2a749155f29aae763fa73ea6379c385d619f70614110f59b6b10b730';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function integrityOf(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}
function canonicalize(value) {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  throw new Error('unsupported canonical JSON value');
}

export async function refreshCandidateManifest() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const tarballName = `sentropic-engram-${pkg.version}.tgz`;
  const tarballPath = join(ROOT, tarballName);
  if (!existsSync(tarballPath)) {
    throw new Error(`packed tarball missing (run npm pack first): ${tarballPath}`);
  }
  const tarballBytes = readFileSync(tarballPath);
  const tarballSha256 = sha256(tarballBytes);
  const tarballIntegrity = integrityOf(tarballBytes);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

  const work = mkdtempSync(join(tmpdir(), 'mcp-l4-manifest-'));
  try {
    execFileSync('tar', ['-xzf', tarballPath, '-C', work]);
    const packedRoot = join(work, 'package');
    const packedPkg = JSON.parse(readFileSync(join(packedRoot, 'package.json'), 'utf8'));
    if (packedPkg.name !== '@sentropic/engram') throw new Error('packed package name drifted');
    if (existsSync(join(packedRoot, 'candidate-manifest.json'))) {
      throw new Error('candidate-manifest.json must not be published in the npm files');
    }
    for (const [name, range] of Object.entries(packedPkg.peerDependencies ?? {})) {
      if (typeof range === 'string' && range.startsWith('file:')) throw new Error(`file: dependency in ${name}`);
    }

    // Registry closure: every entry asset must match between worktree and
    // tarball, and the receipt must validate against the exact tarball bytes.
    const entries = JSON.parse(readFileSync(join(ROOT, 'registry', 'entries.v1.json'), 'utf8'));
    const packedAssets = new Map();
    for (const asset of entries.entries[0].assets) {
      const packedBytes = readFileSync(join(packedRoot, asset.path));
      const worktreeBytes = readFileSync(join(ROOT, asset.path));
      if (sha256(packedBytes) !== asset.sha256) {
        throw new Error(`entry asset digest drift for ${asset.path} (packed bytes)`);
      }
      if (sha256(worktreeBytes) !== asset.sha256) {
        throw new Error(`entry asset digest drift for ${asset.path} (worktree bytes)`);
      }
      packedAssets.set(asset.path, new Uint8Array(packedBytes));
    }
    const { validateMemoryPublisherAssetsV1 } = await import('../dist/mcp-memory.js');
    const receiptPath = join(ROOT, 'registry', 'publisher-assets.v1.json');
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    receipt.tarballSha256 = tarballSha256;
    receipt.tarballIntegrity = tarballIntegrity;
    receipt.executableProvenance.sourceHead = head;
    receipt.executableProvenance.codeArchiveSha256 = tarballSha256;
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    const receiptCheck = validateMemoryPublisherAssetsV1(receipt, packedAssets);
    if (!receiptCheck.ok) throw new Error(`publisher receipt invalid after backfill: ${receiptCheck.reason}`);
    if (receipt.entryJcsSha256 !== sha256(Buffer.from(canonicalize(entries.entries[0]), 'utf8'))) {
      throw new Error('receipt entryJcsSha256 drifted from registry/entries.v1.json');
    }

    const digestOf = (path) => sha256(readFileSync(join(ROOT, path)));
    const sdkInstalled = JSON.parse(readFileSync(join(ROOT, 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'), 'utf8'));
    const manifest = {
      builtAgainstPreCandidateSha256: BUILT_AGAINST,
      engramSourceCommit: head,
      tarball: { filename: tarballName, sha256: tarballSha256, integrity: tarballIntegrity },
      // Exports derived from the PACKED package.json, exact and unfiltered.
      exports: packedPkg.exports,
      registryArtifacts: {
        'registry/entries.v1.json': digestOf('registry/entries.v1.json'),
        registryEntryDigest: sha256(Buffer.from(canonicalize(entries.entries[0]), 'utf8')),
        'registry/publisher-assets.v1.json': digestOf('registry/publisher-assets.v1.json'),
        ...Object.fromEntries(entries.entries[0].assets.map(asset => [asset.path, digestOf(asset.path)])),
      },
      peerDependencies: {
        '@sentropic/mcp-platform': packedPkg.peerDependencies['@sentropic/mcp-platform'],
        '@sentropic/mcp-broker': packedPkg.peerDependencies['@sentropic/mcp-broker'],
      },
      sdkFloor: packedPkg.optionalDependencies?.['@modelcontextprotocol/sdk'] ?? null,
      sdkPinned: sdkInstalled.version,
      sdkFloorProbe: 'pending-acceptance',
      unverified: [
        'L5 qualification of the staged P3 pre-candidate archives (received with matching sha256/integrity, not re-qualified here)',
        'Deployed host bindings, tenancy and policy values (host-supplied at composition; acceptance uses test host ports)',
        'Postgres canonical parity and native-addon suites (environmental: no native toolchain or addons in this container)',
      ],
    };
    writeFileSync(join(ROOT, 'candidate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`MCP-L4-MANIFEST-OK tarball=${tarballSha256}`);
    return manifest;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  refreshCandidateManifest().then(
    () => {},
    (error) => { console.error(error); process.exit(1); },
  );
}
