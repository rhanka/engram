// @sentropic/engram-live/filesystem — direct safe file reads
// (spec/SPEC_LIVE_GIT_INDEXING.md §7; plan/09 L4a).
//
// Authorized regular working-tree files are read through a descriptor-
// anchored sequence (owner decision D-6, production Linux target): the
// path is opened first (O_NOFOLLOW|O_NONBLOCK: no symlinked final
// component, no FIFO open block), then the opened descriptor itself is
// verified — its real path, read via readlink(/proc/self/fd/<fd>), must
// lie strictly under the authorized root (segment comparison), fstat
// must report a regular file within the size bound, and dev/ino must
// match the inventoried identity — and only then are bytes read through
// that same verified descriptor, with a final fstat stability check.
// Every verification is decided on the descriptor, never on a path
// lookup that would resolve the path again and could observe a state a
// racing writer restored between lookups (review sol2 constat 1). A
// rejected read re-runs the enclosing observation. Path-based lookups
// before the open are classification only. Off Linux the capability is
// explicitly unavailable. Git blobs are read as raw objects by the
// caller (cat-file), never through a converting command. Paths stay raw
// bytes end-to-end; devices/FIFOs/sockets are never read as sources.

import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readlinkSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { posix } from "node:path";

export const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;

export class ForbiddenPathError extends Error {}
/** A parent path component is a symlink: parents are never followed. */
export class ParentSymlinkError extends ForbiddenPathError {}
export class UnstableReadError extends Error {}
export class OversizedFileError extends ForbiddenPathError {}
/** The safe-read capability is unavailable on this platform (Linux only). */
export class SafeReadUnavailableError extends Error {}

export interface SafeFileBytes {
  readonly bytes: Buffer;
  readonly fingerprint: string;
}

/** Descriptor-anchored safe reads are a Linux-only capability (owner
 * decision D-6): verification goes through /proc/self/fd and fstat. */
export function safeReadCapability(): { state: "available" } | { state: "unavailable"; reason: string } {
  if (process.platform === "linux") return { state: "available" };
  return {
    state: "unavailable",
    reason: `descriptor-verified worktree reads require Linux /proc/self/fd; platform "${process.platform}" is not qualified`,
  };
}

/** Worktree identity of an inventoried file, as recorded by the capture. */
export interface FileIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

/** Deterministic interleaving seam over the open-to-verification window:
 * fires before every path-based access of a safe read so tests can
 * reorder the working tree exactly like a racing writer. */
export interface SafeReadSeam {
  beforePathAccess?: (op: "lstat" | "open", path: PathBytes) => void;
}

/** Repository paths are bytes end to end; strings only for caller-supplied
 * UTF-8 paths (normalized filesystem roots). */
export type PathBytes = Buffer;

export function toPathBytes(path: string | PathBytes): PathBytes {
  return typeof path === "string" ? Buffer.from(path, "utf8") : path;
}

/** Lossless byte↔key mapping (latin1 is bijective) for maps and sorting. */
export function toPathKey(bytes: PathBytes): string {
  return bytes.toString("latin1");
}

export function fromPathKey(key: string): PathBytes {
  return Buffer.from(key, "latin1");
}

/** Raw sha256 fingerprint (no filter, no object write). */
export function fingerprintBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Exact-segment .git detection: never a broad ".git" substring match, so
 * authorized hidden paths such as .github/ stay visible. */
export function isGitInternalPath(rel: string | PathBytes): boolean {
  return toPathBytes(rel).toString("latin1").split("/").includes(".git");
}

const SLASH = Buffer.from("/");

/** Split NUL-terminated records without any text decoding. */
export function splitNulBytes(output: Buffer): PathBytes[] {
  const parts: PathBytes[] = [];
  let start = 0;
  for (let index = 0; index < output.length; index++) {
    if (output[index] === 0) {
      if (index > start) parts.push(output.subarray(start, index));
      start = index + 1;
    }
  }
  if (start < output.length) parts.push(output.subarray(start));
  return parts;
}

function splitSlash(rel: PathBytes): PathBytes[] {
  const parts: PathBytes[] = [];
  let start = 0;
  for (let index = 0; index <= rel.length; index++) {
    if (index === rel.length || rel[index] === 0x2f) {
      parts.push(rel.subarray(start, index));
      start = index + 1;
    }
  }
  return parts.filter((part) => part.length > 0);
}

function normalizeRel(rel: PathBytes): PathBytes {
  const text = rel.toString("latin1");
  if (text.includes("\0")) throw new ForbiddenPathError(`live-git: NUL byte in path: ${text}`);
  const normalized = posix.normalize(text);
  if (normalized === "." || normalized.startsWith("../") || normalized.startsWith("/") || posix.isAbsolute(normalized)) {
    throw new ForbiddenPathError(`live-git: path escapes the authorized root: ${text}`);
  }
  return Buffer.from(normalized, "latin1");
}

function withinRoot(rootBuf: Buffer, target: PathBytes): boolean {
  if (target.equals(rootBuf)) return true;
  const prefix = Buffer.concat([rootBuf, SLASH]);
  return target.length > prefix.length && target.subarray(0, prefix.length).equals(prefix);
}

/** Missing/vanished paths are capture instability, permission is refusal. */
function toReadError(error: unknown, rel: string): Error {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT" || code === "ENOTDIR") return new UnstableReadError(`live-git: path vanished during read: ${rel}`);
  if (code === "EACCES" || code === "EPERM") return new ForbiddenPathError(`live-git: path unreadable: ${rel}`);
  return error as Error;
}

/** Resolve a symlink target without following it when it leaves the root;
 * returns the real path when inside, null when outside or unresolvable.
 * The native realpath is required: the JS one corrupts non-UTF-8 bytes. */
export function resolveLinkWithinRoot(rootReal: string, linkPath: string | PathBytes): PathBytes | null {
  try {
    const target = realpathNative(toPathBytes(linkPath));
    return withinRoot(Buffer.from(rootReal, "utf8"), target) ? target : null;
  } catch {
    return null;
  }
}

function realpathNative(path: PathBytes): PathBytes {
  return realpathSync.native(path, { encoding: "buffer" }) as Buffer;
}

/** Strictly-below comparison by path segments: the descriptor's real path
 * must be deeper than the authorized root, segment by segment. */
function strictlyUnderRoot(rootBuf: Buffer, target: Buffer): boolean {
  const rootSegments = splitSlash(rootBuf);
  const targetSegments = splitSlash(target);
  if (targetSegments.length <= rootSegments.length) return false;
  for (let index = 0; index < rootSegments.length; index++) {
    const rootSegment = rootSegments[index];
    const targetSegment = targetSegments[index];
    if (rootSegment === undefined || targetSegment === undefined || !targetSegment.equals(rootSegment)) return false;
  }
  return true;
}

export function defaultReadFileBytes(
  rootReal: string,
  relPosix: string | PathBytes,
  maxBytes: number = DEFAULT_MAX_FILE_BYTES,
  expected?: FileIdentity,
  seam?: SafeReadSeam,
): SafeFileBytes {
  const capability = safeReadCapability();
  if (capability.state === "unavailable") {
    throw new SafeReadUnavailableError(`live-git: ${capability.reason}`);
  }
  const rel = normalizeRel(toPathBytes(relPosix));
  const relText = rel.toString("latin1");
  if (isGitInternalPath(rel)) {
    throw new ForbiddenPathError(`live-git: refusing git-internal path: ${relText}`);
  }
  const rootBuf = Buffer.from(rootReal, "utf8");
  const segments = splitSlash(rel);
  if (segments.length === 0) throw new ForbiddenPathError(`live-git: refusing empty path`);
  // Classification only, never the acceptance decision: a permanently
  // symlinked parent is refused up front so the capture can report a
  // symlink exclusion instead of a generic special file. A parent
  // redirected only during the open is caught after it, on the
  // descriptor itself.
  let current = rootBuf;
  for (const segment of segments.slice(0, -1)) {
    current = Buffer.concat([current, SLASH, segment]);
    seam?.beforePathAccess?.("lstat", current);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(current, { bigint: true });
    } catch (error) {
      throw toReadError(error, relText);
    }
    if (!stat.isDirectory()) {
      throw new ParentSymlinkError(`live-git: refusing non-directory parent (symlinked parents are never followed): ${relText}`);
    }
  }
  const finalPath = Buffer.concat([current, SLASH, segments[segments.length - 1] as PathBytes]);
  seam?.beforePathAccess?.("open", finalPath);
  let fd: number;
  try {
    // O_NOFOLLOW refuses a symlinked final component at open time;
    // O_NONBLOCK keeps a swapped-in FIFO from blocking the open.
    fd = openSync(finalPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOOP") {
      throw new ForbiddenPathError(`live-git: refusing symlinked final component: ${relText}`);
    }
    throw toReadError(error, relText);
  }
  try {
    // Verification happens AFTER the open, on the descriptor itself
    // (owner decision D-6): no path lookup can validate or invalidate
    // what the kernel already resolved at open time. Bigint stats so
    // the identity and stability comparisons below are exact.
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new ForbiddenPathError(`live-git: refusing non-regular file: ${relText}`);
    if (before.size > BigInt(maxBytes)) throw new OversizedFileError(`live-git: file exceeds ${maxBytes} bytes: ${relText}`);
    // The real path of the opened descriptor must be strictly under the
    // authorized root, by segments: a parent redirected during the open
    // (and restored for any later path lookup) is exposed here and only
    // here.
    const realPath = readlinkSync(Buffer.from(`/proc/self/fd/${fd}`), { encoding: "buffer" }) as Buffer;
    if (!strictlyUnderRoot(rootBuf, realPath)) {
      throw new UnstableReadError(`live-git: opened descriptor resolves outside the authorized root: ${relText}`);
    }
    if (expected !== undefined && (expected.dev !== before.dev || expected.ino !== before.ino)) {
      throw new UnstableReadError(`live-git: opened descriptor does not match the inventoried file: ${relText}`);
    }
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const read = readSync(fd, bytes, offset, bytes.length - offset, null);
      if (read === 0) break;
      offset += read;
    }
    const after = fstatSync(fd, { bigint: true });
    if (
      before.dev !== after.dev || before.ino !== after.ino ||
      before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
    ) {
      throw new UnstableReadError(`live-git: file changed during read: ${relText}`);
    }
    return { bytes: bytes.subarray(0, offset), fingerprint: fingerprintBytes(bytes.subarray(0, offset)) };
  } finally {
    closeSync(fd);
  }
}

/** Symlink target as raw bytes (targets are byte strings in Git). */
export function readLinkTarget(rootReal: string, relPosix: string | PathBytes): PathBytes {
  const rel = normalizeRel(toPathBytes(relPosix));
  try {
    return readlinkSync(Buffer.concat([Buffer.from(rootReal, "utf8"), SLASH, rel]), { encoding: "buffer" }) as Buffer;
  } catch (error) {
    throw toReadError(error, rel.toString("latin1"));
  }
}
