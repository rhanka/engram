// @sentropic/engram-live/worktree — side-effect-free index/worktree capture
// (spec/SPEC_LIVE_GIT_INDEXING.md §7; plan/09 L4a).
//
// Normative sequence: inventory-before-content, attribute verification
// (check-attr -z --stdin, in the worktree AND index contexts) over the
// union of HEAD, index and worktree paths before any read, path/type/size/
// authorization exclusions, direct safe reads of regular files and raw
// blobs (type and size checked before blob content), then before/after
// stability checks with bounded retry. Working-tree content and policy
// files (.gitattributes, info/attributes) are read through the
// descriptor-anchored safe reader: the opened descriptor's real path
// (Linux /proc/self/fd) must lie strictly under the authorized root and
// its dev/ino must match the inventory, so a replacement during the
// open is rejected and the observation re-run. Before the first Git
// invocation, the repository's local configuration files are located in
// Node and gated: any include/includeIf directive refuses the capture,
// because Git parses the local configuration — includes included —
// during repository discovery, before any --no-includes policy of the
// command itself applies (review sol4 major). Because a probe only proves
// the configuration at probe time, every round gates the configuration at
// its start AND re-probes it at its end — include directives plus a
// content fingerprint of the gated files — so a directive wired in after
// the start gate, which the round's own invocations then follow, rejects
// the round and re-runs the observation, publishing no data from it
// (review sol5). A root without its own readable .git entry is refused
// before any Git invocation, so parent repository discovery can never
// load an ungated configuration. The applicable attribute policy is
// revalidated immediately before every single content read (worktree bytes
// and staged blobs alike), so an attempt is interrupted before reading
// newly forbidden content. Worktree identity
// includes dev/ino/ctime, so same-size same-mtime replacements are caught.
// Paths stay raw bytes end-to-end (NUL records, no text decoding).
// Linked worktrees keep independent index stages; common-dir/checkout
// isolation carries the staged/unstaged distinction (immutable endpoints).

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { SafeGitExecutor } from "./git-executor.js";
import {
  defaultAttributes,
  fingerprintAttributes,
  hasTextconvDriver,
  isFiltered,
  readAttributes,
  readAttributesIndex,
  sameAttributes,
  type PathAttributes,
} from "./attributes.js";
import {
  ForbiddenPathError,
  OversizedFileError,
  ParentSymlinkError,
  UnstableReadError,
  defaultReadFileBytes,
  fingerprintBytes,
  isGitInternalPath,
  readLinkTarget,
  resolveLinkWithinRoot,
  splitNulBytes,
  toPathBytes,
  toPathKey,
  type FileIdentity,
  type PathBytes,
  type SafeFileBytes,
} from "./filesystem.js";

export class BorrowedIndexError extends Error {}

export interface IndexEntry {
  readonly path: PathBytes;
  readonly mode: string;
  readonly oid: string;
  readonly stage: number;
}

export type ExclusionReason =
  | "filtered"
  | "protected"
  | "symlink-outside-root"
  | "symlink-unresolvable"
  | "gitlink"
  | "oversized"
  | "special-file"
  | "deleted";

export type FileStatus = "present" | "deleted" | "sparse-omitted" | "excluded";

export interface CapturedFile {
  readonly path: PathBytes;
  readonly status: FileStatus;
  readonly kind: "file" | "symlink" | "gitlink" | "conflict" | "other";
  readonly mode?: string;
  readonly indexOid?: string;
  readonly stageOids?: Readonly<Record<string, string>>;
  readonly exclusionReason?: ExclusionReason;
  readonly fingerprint?: string;
  readonly size?: number;
  readonly linkTarget?: PathBytes;
  readonly blobVerified?: boolean;
  readonly textconv?: boolean;
}

export interface StableCapture {
  readonly stable: true;
  readonly attempts: number;
  readonly root: string;
  readonly gitDir: string;
  readonly commonDir: string;
  readonly indexPath: string;
  readonly headOid: string | null;
  readonly objectFormat: string;
  readonly indexDigest: string;
  readonly attrFingerprint: string;
  readonly entries: IndexEntry[];
  readonly files: CapturedFile[];
}

export interface UnstableCapture {
  readonly stable: false;
  readonly attempts: number;
  readonly root: string;
  readonly reason: string;
}

export type CaptureResult = StableCapture | UnstableCapture;

export interface CaptureHooks {
  /** Deterministic-test seam between inventory and content reads.
   * Production callers omit it; tests mutate attributes/symlinks here. */
  readonly betweenInventoryAndContent?: () => void;
  /** Deterministic-test seam fired inside every snapshot round, immediately
   * after the round's configuration gate and before the round's Git
   * invocations. Production callers omit it; tests wire a racing
   * configuration change here (review sol5). */
  readonly afterConfigGate?: () => void;
}

export interface CaptureOptions {
  readonly authorizedRoots: string[];
  readonly maxAttempts?: number;
  readonly maxFileBytes?: number;
  readonly hooks?: CaptureHooks;
  readonly readFileBytes?: (rootReal: string, relPosix: PathBytes, expected?: FileIdentity) => SafeFileBytes;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const ZERO_OID = /^0+$/;
const SLASH = Buffer.from("/");

function absPath(rootReal: string, rel: PathBytes): PathBytes {
  return Buffer.concat([Buffer.from(rootReal, "utf8"), SLASH, rel]);
}

function trimText(output: Buffer): string {
  return output.toString("utf8").trim();
}

function parseLsFilesStage(output: Buffer): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const record of splitNulBytes(output)) {
    const tab = record.indexOf(0x09);
    if (tab <= 0) continue;
    const head = record.subarray(0, tab).toString("latin1").split(" ");
    entries.push({
      mode: head[0] as string,
      oid: head[1] as string,
      stage: Number(head[2]),
      path: record.subarray(tab + 1),
    });
  }
  return entries;
}

/** `ls-files -v -z` records: tag SP path NUL (paths verbatim, no quoting). */
function parseLsFilesVerbose(output: Buffer): Map<string, string> {
  const flags = new Map<string, string>();
  for (const record of splitNulBytes(output)) {
    if (record.length < 3) continue;
    flags.set(toPathKey(record.subarray(2)), String.fromCharCode(record[0] as number));
  }
  return flags;
}

function parseOthers(output: Buffer): PathBytes[] {
  return splitNulBytes(output).filter((path) => !isGitInternalPath(path));
}

/** `ls-tree -r -z` records: mode SP type SP oid TAB path NUL — the full
 * HEAD inventory, not just the last commit's changes. */
function parseLsTree(output: Buffer, paths: PathBytes[]): void {
  for (const record of splitNulBytes(output)) {
    const tab = record.indexOf(0x09);
    if (tab <= 0) continue;
    paths.push(record.subarray(tab + 1));
  }
}

function digestIndex(stageRaw: Buffer, verboseRaw: Buffer): string {
  return fingerprintBytes(Buffer.concat([Buffer.from("index\0"), stageRaw, Buffer.from("verbose\0"), verboseRaw]));
}

function isProtectedPath(rel: PathBytes): boolean {
  const base = rel.toString("latin1").split("/").pop() as string;
  return base.startsWith(".env") || base.endsWith(".pem") || base.endsWith(".key");
}

function gitBlobHash(objectFormat: string, bytes: Buffer): string {
  const header = Buffer.from(`blob ${bytes.length}\0`);
  const algorithm = objectFormat === "sha256" ? "sha256" : "sha1";
  return createHash(algorithm).update(header).update(bytes).digest("hex");
}

interface LocalConfigResolution {
  readonly gitDir: string | null;
  readonly commonDir: string | null;
  readonly paths: string[];
}

/** Resolve the repository's git dir, common dir and local configuration
 * files in Node only, before any Git invocation: repository discovery
 * itself parses the local configuration — include directives included —
 * so the include gate must run first, against files located without Git.
 * The linked-worktree forms are covered: a `.git` file pointing at the
 * worktree's git dir, and the git dir's `commondir` pointer back at the
 * main repository. Returns empty paths when the root is not a repository;
 * the first rev-parse then reports it. */
function resolveLocalConfig(rootReal: string): LocalConfigResolution {
  let gitDir: string | null = null;
  try {
    const dotGit = join(rootReal, ".git");
    const stat = statSync(dotGit);
    if (stat.isDirectory()) {
      gitDir = dotGit;
    } else if (stat.isFile()) {
      const raw = readFileSync(dotGit, "utf8").trim();
      if (raw.startsWith("gitdir:")) {
        const target = raw.slice("gitdir:".length).trim();
        gitDir = isAbsolute(target) ? target : resolve(rootReal, target);
      }
    }
  } catch {
    // No readable .git entry at the root: not a repository root; the
    // rev-parse below produces the caller-facing error.
  }
  if (gitDir === null) return { gitDir: null, commonDir: null, paths: [] };
  let commonDir = gitDir;
  try {
    const raw = readFileSync(join(gitDir, "commondir"), "utf8").trim();
    if (raw) commonDir = isAbsolute(raw) ? raw : resolve(gitDir, raw);
  } catch {
    // Primary repository: the git dir is the common dir.
  }
  // Git reads the common config for every repository and worktree, and the
  // per-worktree config only under extensions.worktreeConfig; probing it
  // whenever it exists is the stricter, fail-closed choice.
  const paths: string[] = [];
  for (const candidate of [join(commonDir, "config"), join(gitDir, "config.worktree")]) {
    if (existsSync(candidate)) paths.push(candidate);
  }
  return { gitDir, commonDir, paths };
}

interface Snapshot {
  headOid: string | null;
  indexDigest: string;
  attrFingerprint: string;
  policyFingerprint: string;
  treeFingerprint: string;
  configFingerprint: string;
  configStable: boolean;
  entries: IndexEntry[];
  flags: Map<string, string>;
  others: PathBytes[];
  attrPaths: PathBytes[];
  worktreeAttrs: Map<string, PathAttributes>;
  indexAttrs: Map<string, PathAttributes>;
  identities: Map<string, FileIdentity>;
}

/** Content fingerprint of the gated local configuration files (review
 * sol5): the start gate asserts the directives, this fingerprint catches
 * every other change — a gated file replaced, rewritten or removed
 * between the round's start gate and its end re-probe invalidates the
 * round, the same before/after stability the inventoried files get. */
function fingerprintLocalConfig(paths: readonly string[]): string {
  const parts: Buffer[] = [];
  for (const path of paths) {
    const record = Buffer.from(path + "\0");
    try {
      if (!lstatSync(path).isFile()) throw new Error("not a regular file");
      parts.push(record, readFileSync(path), Buffer.from("\0"));
    } catch {
      // Absent or unreadable: recorded as such, so a readable-then-gone
      // (or gone-then-readable) transition changes the fingerprint.
      parts.push(record, Buffer.from("unreadable\0"));
    }
  }
  return fingerprintBytes(Buffer.concat(parts));
}

export function captureWorktree(
  exec: SafeGitExecutor,
  root: string,
  options: CaptureOptions,
): CaptureResult {
  const authorized = options.authorizedRoots.map((candidate) => realpathSync(candidate));
  const rootReal = realpathSync(root);
  if (!authorized.some((candidate) => rootReal === candidate || rootReal.startsWith(candidate + sep))) {
    throw new ForbiddenPathError(`live-git: worktree outside authorized roots: ${root}`);
  }
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxFileBytes = options.maxFileBytes;
  const readBytes = options.readFileBytes ?? ((real, rel, expected) => defaultReadFileBytes(real, rel, maxFileBytes, expected));
  // Before ANY invocation — including the rev-parse discovery below — and
  // again at the start of every snapshot round: the repository's local
  // configuration must declare no include/includeIf directive, or Git
  // would follow it while parsing the configuration during repository
  // discovery and read files outside the repository (review sol4 major).
  // The gate runs outside any repository against the files located above;
  // a directive wired into the configuration mid-capture refuses the
  // attempt instead of ever being loaded.
  const localConfig = resolveLocalConfig(rootReal);
  exec.assertNoConfigIncludes(localConfig.paths);
  // Refused BEFORE any Git invocation (review sol5 major 2): without a
  // readable .git entry directly under the root, repository discovery
  // would search the parents and load their configuration — include
  // directives included — before any refusal could run, so an ungated
  // configuration would already have been parsed.
  if (localConfig.gitDir === null || localConfig.commonDir === null) {
    throw new ForbiddenPathError(`live-git: no local configuration resolved under repository root ${rootReal}`);
  }
  const gitDir = trimText(exec.run(rootReal, ["rev-parse", "--absolute-git-dir"]));
  // --path-format=absolute is required: plain --absolute-git-common-dir is
  // not a rev-parse option and echoes itself back with a success status.
  const commonDir = trimText(exec.run(rootReal, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  // The manual resolution and Git's own discovery must agree: a mismatch
  // means the gated files were not the ones Git loads, so the capture is
  // refused rather than collected against an ungated configuration.
  if (
    realpathSync(gitDir) !== realpathSync(localConfig.gitDir) ||
    realpathSync(commonDir) !== realpathSync(localConfig.commonDir)
  ) {
    throw new ForbiddenPathError(`live-git: resolved git dir disagrees with rev-parse for worktree ${rootReal}`);
  }
  const objectFormat = trimText(exec.run(rootReal, ["rev-parse", "--show-object-format"]));
  const indexPath = gitDir + "/index";
  const borrowed = process.env.GIT_INDEX_FILE;
  if (borrowed && realpathSync(borrowed) !== realpathSync(indexPath)) {
    throw new BorrowedIndexError(`live-git: refusing borrowed index ${borrowed} for worktree ${rootReal}`);
  }

  const snapshot = (): Snapshot => {
    // Every snapshot round re-runs the include gate on freshly located
    // configuration files, so an include wired into the repository
    // configuration between two rounds refuses the capture instead of ever
    // being loaded by a collector invocation. The gated files are also
    // fingerprinted: the END-of-round re-probe below (review sol5) gives
    // the configuration the same before/after stability the inventoried
    // files get.
    const gatedPaths = resolveLocalConfig(rootReal).paths;
    exec.assertNoConfigIncludes(gatedPaths);
    const configFingerprint = fingerprintLocalConfig(gatedPaths);
    options.hooks?.afterConfigGate?.();
    let headOid: string | null = null;
    try {
      headOid = trimText(exec.run(rootReal, ["rev-parse", "HEAD"]));
    } catch {
      headOid = null;
    }
    const stageRaw = exec.run(rootReal, ["ls-files", "--stage", "-z"]);
    const verboseRaw = exec.run(rootReal, ["ls-files", "-v", "-z"]);
    const othersRaw = exec.run(rootReal, ["ls-files", "--others", "--exclude-standard", "-z"]);
    const entries = parseLsFilesStage(stageRaw);
    const flags = parseLsFilesVerbose(verboseRaw);
    const others = parseOthers(othersRaw);
    const headPaths: PathBytes[] = [];
    if (headOid !== null) {
      parseLsTree(exec.run(rootReal, ["ls-tree", "-r", "-z", headOid]), headPaths);
    }
    // Union of HEAD, index and worktree paths, built before any attribute
    // check, so no inventoried path escapes attribute verification.
    const unionKeys = new Set<string>();
    const attrPaths: PathBytes[] = [];
    for (const path of [...entries.map((entry) => entry.path), ...others, ...headPaths]) {
      const key = toPathKey(path);
      if (unionKeys.has(key)) continue;
      unionKeys.add(key);
      attrPaths.push(path);
    }
    attrPaths.sort(Buffer.compare);
    const worktreeAttrs = readAttributes(exec, rootReal, attrPaths);
    const indexAttrs = readAttributesIndex(exec, gitDir, attrPaths);
    let policyBuffer = Buffer.from("absent\0");
    for (const candidate of [rootReal + "/.gitattributes", commonDir + "/info/attributes"]) {
      try {
        // Classification only (absent vs unreadable); the content itself is
        // read through the safe descriptor reader, so a policy file replaced
        // by a symlink or a FIFO between this stat and the read is refused
        // instead of followed (review sol2 constat 2).
        if (!lstatSync(candidate).isFile()) continue;
        const read = defaultReadFileBytes(dirname(candidate), basename(candidate));
        policyBuffer = Buffer.concat([policyBuffer, Buffer.from(candidate + "\0"), read.bytes]);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") continue;
        policyBuffer = Buffer.concat([policyBuffer, Buffer.from(`${candidate}\0unreadable\0`)]);
      }
    }
    // Worktree identity per inventoried path: mode/size/mtime plus dev/ino/
    // ctime and symlink targets, so replacements that preserve size and
    // mtime (utimes/touch) cannot pass as the same state.
    let treeBuffer = Buffer.alloc(0);
    const identities = new Map<string, FileIdentity>();
    for (const path of attrPaths) {
      const record = Buffer.from(`${toPathKey(path)}\0`);
      try {
        const identity = lstatSync(absPath(rootReal, path), { bigint: true });
        identities.set(toPathKey(path), { dev: identity.dev, ino: identity.ino });
        let extra: PathBytes = Buffer.alloc(0);
        if (identity.isSymbolicLink()) {
          try {
            extra = readLinkTarget(rootReal, path);
          } catch {
            extra = Buffer.from("unreadable");
          }
        }
        treeBuffer = Buffer.concat([
          treeBuffer, record,
          Buffer.from(
            `${String(identity.mode)}\0${String(identity.size)}\0${String(identity.mtimeNs)}\0` +
              `${String(identity.dev)}\0${String(identity.ino)}\0${String(identity.ctimeNs)}\0`,
          ),
          extra, Buffer.from("\0"),
        ]);
      } catch {
        treeBuffer = Buffer.concat([treeBuffer, record, Buffer.from("missing\0")]);
      }
    }
    return {
      headOid,
      indexDigest: digestIndex(stageRaw, verboseRaw),
      attrFingerprint: fingerprintAttributes(worktreeAttrs, indexAttrs),
      policyFingerprint: fingerprintBytes(policyBuffer),
      treeFingerprint: fingerprintBytes(treeBuffer),
      // End-of-round configuration re-probe (review sol5): the
      // configuration is mutable state like the inventoried files. A
      // directive wired in after the gate above is followed by this
      // round's own invocations — the probe cannot undo that read — so
      // the round is rejected and the observation re-run, publishing
      // nothing collected against the changed configuration.
      configStable:
        exec.probeNoConfigIncludes(resolveLocalConfig(rootReal).paths) &&
        fingerprintLocalConfig(resolveLocalConfig(rootReal).paths) === configFingerprint,
      configFingerprint,
      entries,
      flags,
      others,
      attrPaths,
      worktreeAttrs,
      indexAttrs,
      identities,
    };
  };

  const sameSnapshot = (left: Snapshot, right: Snapshot): boolean => {
    return (
      left.configStable &&
      right.configStable &&
      left.configFingerprint === right.configFingerprint &&
      left.headOid === right.headOid &&
      left.indexDigest === right.indexDigest &&
      left.attrFingerprint === right.attrFingerprint &&
      left.policyFingerprint === right.policyFingerprint &&
      left.treeFingerprint === right.treeFingerprint
    );
  };

  const sameState = (before: Snapshot): boolean => sameSnapshot(before, snapshot());

  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts++;
    const before = snapshot();
    options.hooks?.betweenInventoryAndContent?.();
    const revalidated = snapshot();
    if (!sameSnapshot(before, revalidated)) {
      continue;
    }
    try {
      const files = collectFiles(exec, rootReal, gitDir, revalidated, objectFormat, readBytes, maxFileBytes);
      if (!sameState(before)) continue;
      return {
        stable: true,
        attempts,
        root: rootReal,
        gitDir,
        commonDir,
        indexPath,
        headOid: before.headOid,
        objectFormat,
        indexDigest: before.indexDigest,
        attrFingerprint: before.attrFingerprint,
        entries: before.entries,
        files,
      };
    } catch (error) {
      if (error instanceof UnstableReadError) continue;
      throw error;
    }
  }
  return { stable: false, attempts, root: rootReal, reason: "unstable: inputs changed on every bounded attempt" };
}

/** Fresh single-path attribute check in the applicable context; a change
 * since the snapshot interrupts the attempt before the content is read. */
function revalidateWorktreePolicy(exec: SafeGitExecutor, rootReal: string, path: PathBytes, expected: PathAttributes): void {
  const fresh = readAttributes(exec, rootReal, [path]).get(toPathKey(path)) ?? defaultAttributes();
  if (!sameAttributes(fresh, expected)) {
    throw new UnstableReadError(`live-git: worktree attributes changed during capture: ${toPathKey(path)}`);
  }
}

function revalidateIndexPolicy(exec: SafeGitExecutor, gitDir: string, path: PathBytes, expected: PathAttributes): void {
  const fresh = readAttributesIndex(exec, gitDir, [path]).get(toPathKey(path)) ?? defaultAttributes();
  if (!sameAttributes(fresh, expected)) {
    throw new UnstableReadError(`live-git: index attributes changed during capture: ${toPathKey(path)}`);
  }
}

function collectFiles(
  exec: SafeGitExecutor,
  rootReal: string,
  gitDir: string,
  snap: Snapshot,
  objectFormat: string,
  readBytes: (rootReal: string, relPosix: PathBytes, expected?: FileIdentity) => SafeFileBytes,
  maxFileBytes: number | undefined,
): CapturedFile[] {
  const byPath = new Map<string, IndexEntry[]>();
  for (const entry of snap.entries) {
    const key = toPathKey(entry.path);
    const group = byPath.get(key) ?? [];
    group.push(entry);
    byPath.set(key, group);
  }
  const files: CapturedFile[] = [];
  for (const path of snap.attrPaths) {
    if (isGitInternalPath(path)) continue;
    files.push(capturePath(exec, rootReal, gitDir, path, byPath.get(toPathKey(path)) ?? [], snap, objectFormat, readBytes, maxFileBytes));
  }
  return files;
}

interface BlobCheck {
  readonly oversized: boolean;
  readonly wrongType: boolean;
  readonly size: number;
}

/** Type and size of a blob are verified before its content is ever read,
 * so an oversized staged blob is excluded instead of read past the
 * subprocess buffer. The attribute policy of BOTH contexts is revalidated
 * first, so a path that became filtered is interrupted before its staged
 * blob is read at all (review sol3 minor), not only before the worktree
 * bytes. */
function checkBlobBeforeRead(
  exec: SafeGitExecutor,
  rootReal: string,
  gitDir: string,
  path: PathBytes,
  expectedIndex: PathAttributes,
  expectedWorktree: PathAttributes,
  oid: string,
  maxFileBytes: number | undefined,
): BlobCheck {
  revalidateIndexPolicy(exec, gitDir, path, expectedIndex);
  revalidateWorktreePolicy(exec, rootReal, path, expectedWorktree);
  const type = trimText(exec.run(rootReal, ["cat-file", "-t", oid]));
  if (type !== "blob") return { oversized: false, wrongType: true, size: 0 };
  const size = Number(trimText(exec.run(rootReal, ["cat-file", "-s", oid])));
  if (maxFileBytes !== undefined && size > maxFileBytes) return { oversized: true, wrongType: false, size };
  return { oversized: false, wrongType: false, size };
}

function capturePath(
  exec: SafeGitExecutor,
  rootReal: string,
  gitDir: string,
  path: PathBytes,
  entries: IndexEntry[],
  snap: Snapshot,
  objectFormat: string,
  readBytes: (rootReal: string, relPosix: PathBytes, expected?: FileIdentity) => SafeFileBytes,
  maxFileBytes: number | undefined,
): CapturedFile {
  const key = toPathKey(path);
  const attrWorktree = snap.worktreeAttrs.get(key) ?? defaultAttributes();
  const attrIndex = snap.indexAttrs.get(key) ?? defaultAttributes();
  const textconv = hasTextconvDriver(attrWorktree);
  // Either context marking the path filtered excludes every endpoint of
  // the path: worktree bytes and staged blobs alike.
  if (isFiltered(attrWorktree) || isFiltered(attrIndex)) {
    return { path, status: "excluded", kind: "other", exclusionReason: "filtered", textconv };
  }
  if (isProtectedPath(path)) {
    return { path, status: "excluded", kind: "other", exclusionReason: "protected", textconv };
  }
  const stages = entries.map((entry) => entry.stage).sort();
  const primary = entries.find((entry) => entry.stage === 0) ?? entries[0];
  const full = absPath(rootReal, path);
  let stat: ReturnType<typeof lstatSync> | null = null;
  try {
    stat = lstatSync(full);
  } catch {
    stat = null;
  }
  const flag = (snap.flags.get(key) ?? "").toUpperCase();
  if (stat === null) {
    if (flag === "S") return { path, status: "sparse-omitted", kind: "other", mode: primary?.mode, indexOid: primary?.oid };
    return { path, status: "deleted", kind: "other", mode: primary?.mode, indexOid: primary?.oid };
  }
  if (primary?.mode === "160000") {
    return { path, status: "present", kind: "gitlink", mode: primary.mode, indexOid: primary.oid };
  }
  if (primary?.mode === "120000" || stat.isSymbolicLink()) {
    let target: PathBytes;
    try {
      target = readLinkTarget(rootReal, path);
    } catch {
      return { path, status: "excluded", kind: "symlink", exclusionReason: "symlink-unresolvable" };
    }
    if (resolveLinkWithinRoot(rootReal, full) === null) {
      return { path, status: "excluded", kind: "symlink", exclusionReason: "symlink-outside-root", linkTarget: target };
    }
    return {
      path, status: "present", kind: "symlink", mode: primary?.mode ?? "120000",
      fingerprint: fingerprintBytes(target), linkTarget: target,
    };
  }
  if (!stat.isFile()) {
    return { path, status: "excluded", kind: "other", exclusionReason: "special-file" };
  }
  if (maxFileBytes !== undefined && stat.size > maxFileBytes) {
    return { path, status: "excluded", kind: "other", exclusionReason: "oversized", size: stat.size };
  }
  if (stages.length > 1 || (stages.length > 0 && stages[0] !== 0)) {
    const stageOids: Record<string, string> = {};
    for (const entry of entries) stageOids[String(entry.stage)] = entry.oid;
    let verified = true;
    for (const entry of entries) {
      if (ZERO_OID.test(entry.oid)) {
        verified = false;
        continue;
      }
      const check = checkBlobBeforeRead(exec, rootReal, gitDir, path, attrIndex, attrWorktree, entry.oid, maxFileBytes);
      if (check.oversized) {
        return { path, status: "excluded", kind: "conflict", exclusionReason: "oversized", size: check.size, stageOids };
      }
      if (check.wrongType) {
        return { path, status: "excluded", kind: "conflict", exclusionReason: "special-file", stageOids };
      }
      const raw = exec.run(rootReal, ["cat-file", "-p", entry.oid]);
      if (gitBlobHash(objectFormat, raw) !== entry.oid) {
        throw new UnstableReadError(`live-git: stage blob changed during capture: ${key}`);
      }
    }
    revalidateWorktreePolicy(exec, rootReal, path, attrWorktree);
    let fingerprint: string | undefined;
    let size: number | undefined;
    try {
      const read = readBytes(rootReal, path, snap.identities.get(key));
      fingerprint = read.fingerprint;
      size = read.bytes.length;
    } catch (error) {
      if (error instanceof OversizedFileError) {
        return { path, status: "excluded", kind: "conflict", exclusionReason: "oversized", size: stat.size, stageOids };
      }
      if (error instanceof ParentSymlinkError) {
        return { path, status: "excluded", kind: "conflict", exclusionReason: "symlink-outside-root", stageOids };
      }
      if (error instanceof ForbiddenPathError) {
        return { path, status: "excluded", kind: "conflict", exclusionReason: "special-file", stageOids };
      }
      throw error;
    }
    return { path, status: "present", kind: "conflict", mode: primary?.mode, stageOids, fingerprint, size, blobVerified: verified, textconv };
  }
  const indexOid = primary?.oid;
  if (indexOid !== undefined && !ZERO_OID.test(indexOid)) {
    const check = checkBlobBeforeRead(exec, rootReal, gitDir, path, attrIndex, attrWorktree, indexOid, maxFileBytes);
    if (check.oversized) {
      return { path, status: "excluded", kind: "file", mode: primary?.mode, indexOid, exclusionReason: "oversized", size: check.size, textconv };
    }
    if (check.wrongType) {
      return { path, status: "excluded", kind: "file", mode: primary?.mode, indexOid, exclusionReason: "special-file", textconv };
    }
    const raw = exec.run(rootReal, ["cat-file", "-p", indexOid]);
    if (gitBlobHash(objectFormat, raw) !== indexOid) {
      throw new UnstableReadError(`live-git: index blob changed during capture: ${key}`);
    }
  }
  revalidateWorktreePolicy(exec, rootReal, path, attrWorktree);
  let read: SafeFileBytes;
  try {
    read = readBytes(rootReal, path, snap.identities.get(key));
  } catch (error) {
    if (error instanceof OversizedFileError) {
      return { path, status: "excluded", kind: "file", mode: primary?.mode, indexOid, exclusionReason: "oversized", size: stat.size, textconv };
    }
    if (error instanceof ParentSymlinkError) {
      return { path, status: "excluded", kind: "file", mode: primary?.mode, indexOid, exclusionReason: "symlink-outside-root", textconv };
    }
    if (error instanceof ForbiddenPathError) {
      return { path, status: "excluded", kind: "file", mode: primary?.mode, indexOid, exclusionReason: "special-file", textconv };
    }
    throw error;
  }
  return {
    path, status: "present", kind: "file", mode: primary?.mode, indexOid,
    fingerprint: read.fingerprint, size: read.bytes.length, blobVerified: indexOid !== undefined, textconv,
  };
}
