/**
 * L4 packed-test local prerequisites (Node only).
 *
 * Single shared gate for the packed tests that need resources present only
 * on the developer machine. The P3 pre-candidate manifest itself is NOT
 * local-only: it is read from the tracked fixture
 * `tests/fixtures/l4-full-suite-evidence/frozen-p3-manifest.json.gz`
 * (raw sha256 verified). Only these remain local-only:
 * - the P3 peer archives under the sentropic handoff directory;
 * - the frozen L4 archives (r5 pre-fix, r9 fix) under `.graphify/scratch`,
 *   which is git-ignored.
 *
 * When a prerequisite is absent the caller SKIPS the test with an explicit
 * reason naming the missing file. Nothing here passes vacuously: a missing
 * entry always yields a non-empty list, and callers use `it.skipIf`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = dirname(HERE);

/** Tracked fixture holding the frozen P3 pre-candidate manifest bytes. */
export const FROZEN_P3_FIXTURE_REL = 'tests/fixtures/l4-full-suite-evidence/frozen-p3-manifest.json.gz';
/** Raw (gunzipped) sha256 of the fixture; equals the frozen P3 identity. */
export const FROZEN_P3_RAW_SHA256 = '1c96bada2a749155f29aae763fa73ea6379c385d619f70614110f59b6b10b730';
/**
 * Local-only staging directory holding the P3 peer archives.
 * `MCP_L4_P3_BASE` overrides it (CI simulation only: point it at an absent
 * path to reproduce the no-sentropic CI state on the developer machine).
 */
export const P3_BASE = process.env.MCP_L4_P3_BASE ?? '/home/antoinefa/src/sentropic/.tmp/engram-l4-handoff-p2/tools/memory-mcp-l5/artifacts';
/** Frozen L4 archives under test: r5 (pre-fix) must refuse, r9 (fix) must capture. */
export const L4_R5_TARBALL_REL = '.graphify/scratch/l4-r5-artifacts/sentropic-engram-0.22.0.tgz';
export const L4_R5_SHA256 = '965c93e326df9866584261061f4e49571cfd74dfe1dc258c0c6894eea121a4e9';
export const L4_R9_TARBALL_REL = '.graphify/scratch/l4-r9-artifacts/sentropic-engram-0.22.0.tgz';
export const L4_R9_SHA256 = '238cc00ec37ecc12036adfcea07727432eb56911cf319e76bb9fd516c592050c';

/**
 * Read the P3 manifest from the tracked fixture, verifying its raw sha256
 * against the frozen P3 identity. Throws on mismatch or unreadable fixture:
 * the fixture is tracked, so that is a repository defect, never a skip.
 */
export function readFrozenP3Manifest(rootDir = DEFAULT_ROOT) {
  const raw = gunzipSync(readFileSync(join(rootDir, FROZEN_P3_FIXTURE_REL)));
  if (createHash('sha256').update(raw).digest('hex') !== FROZEN_P3_RAW_SHA256) {
    throw new Error('P3 manifest identity mismatch');
  }
  return JSON.parse(raw.toString('utf8'));
}

/** Peer archive paths for a P3 manifest, under the local staging directory. */
export function p3ArchivePathsForManifest(manifest, base = P3_BASE) {
  return manifest.artifacts.map((artifact) =>
    join(base, artifact.archive.replace(/^tools\/memory-mcp-l5\/artifacts\//, '')),
  );
}

/** Missing P3 peer archives, each naming the absent file and package. */
export function missingP3PeerArchives(rootDir = DEFAULT_ROOT) {
  const manifest = readFrozenP3Manifest(rootDir);
  const missing = [];
  for (const artifact of manifest.artifacts) {
    const archivePath = join(P3_BASE, artifact.archive.replace(/^tools\/memory-mcp-l5\/artifacts\//, ''));
    if (!existsSync(archivePath)) missing.push(`P3 peer archive ${archivePath} (${artifact.name})`);
  }
  return missing;
}

function missingScratchTarball(rootDir, rel, label) {
  return existsSync(join(rootDir, rel)) ? [] : [`frozen archive ${join(rootDir, rel)} (${label})`];
}

/** Prerequisites for the packed acceptance run (P3 peer archives only). */
export function missingPackedAcceptancePrereqs(rootDir = DEFAULT_ROOT) {
  return missingP3PeerArchives(rootDir);
}

/** Prerequisites for the cross-entry shared-provenance run (P3 archives only). */
export function missingSharedProvenancePrereqs(rootDir = DEFAULT_ROOT) {
  return missingP3PeerArchives(rootDir);
}

/** Prerequisites for the fenced-store run (P3 archives plus r5 and r8). */
export function missingFencedStorePrereqs(rootDir = DEFAULT_ROOT) {
  return [
    ...missingP3PeerArchives(rootDir),
    ...missingScratchTarball(rootDir, L4_R5_TARBALL_REL, 'r5 pre-fix'),
    ...missingScratchTarball(rootDir, L4_R9_TARBALL_REL, 'r9 fix'),
  ];
}

/** Skip-trailer for a test title, naming every missing prerequisite. */
export function skipReasonFor(missing) {
  return missing.length ? ` (skipped: missing local prerequisite(s): ${missing.join('; ')})` : '';
}
