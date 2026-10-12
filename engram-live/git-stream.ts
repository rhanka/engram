// @sentropic/engram-live/git-stream — L2a bounded streaming Git reader
// (spec/SPEC_LIVE_GIT_INDEXING.md §6, §13; plan/09 L2a).
//
// Streams complete commit metadata and changed-file facts from an injected
// host process port (./git-protocol.ts) without any commit-count or age cap:
// the live chain never sends a ceiling, and no maxCommits-like option exists
// here. Process count scales with batches, not commits: one rev-list per
// pass, then one cat-file and one grouped diff-tree per batch of
// DEFAULT_COMMIT_BATCH commits — every comparison of a batch, whatever the
// parent count, is served by that single process.
//
// Explicit response delimitation (review L2a-sol, finding 1): diff-tree runs
// with --always, so every request — empty diffs included — is attested by
// exactly one echoed block, and the batch ends with a sentinel request that
// repeats the first comparison and must byte-match its first block. Every
// response is verified (count, order, raw/numstat zip, sentinel) BEFORE any
// commit of the batch is emitted, so a response truncated at any byte fails
// the pass without advancing progress.
//
// Bounded memory (review finding 2): discovery is streamed. rev-list output
// is parsed and filtered while it is read, at most one batch window of
// entries is ever buffered, and the reader stops pulling while a batch is
// being processed, so memory is a function of the batch size, never of the
// history length. Backpressure additionally paces request writes by parsed
// responses. Nothing loads the history into a graph object; records are
// yielded as complete facts and progress advances only on fully assembled
// commits, so a malformed or truncated stream fails the pass without
// advancing past the damaged batch (spec §6). The content of a single diff
// is bounded the same way: the diff-tree parser charges every retained
// record byte against MAX_DIFF_BLOCK_BYTES and refuses past it, so one
// comparison cannot grow the heap without limit (review L2a-sol2, finding 2);
// since review L2a-sol3 every received byte is also charged on arrival, open
// fields included, so a field that never terminates is refused as well.
//
// No stream end is ever presumed complete without proof (review L2a-sol2,
// finding 1): before discovery streams, a `rev-list --count` launch on the
// same roots fixes the expected entry count, and the pass only completes
// when the received count equals it — exit code 0 alone attests nothing.
// That counting launch is the one extra process per pass the LIVE §13
// allowance admits, and the batch window itself is floored at
// DEFAULT_COMMIT_BATCH: a smaller accepted `batchCommits` would multiply
// launches past the LIVE §13 bound (review L2a-sol2, finding 3), so it is
// refused rather than silently breaking the process contract.

import {
  CatFileParser,
  DEFAULT_COMMIT_BATCH,
  DiffTreeParser,
  GitProtocolError,
  MAX_CONCURRENT_GIT_CHILDREN,
  RevListParser,
  catFileArguments,
  diffTreeArguments,
  protocolAsciiBytes,
  revListArguments,
  revListCountArguments,
  type CatFileRecord,
  type DiffTreeBlock,
  type GitLaunch,
  type GitLaunchPurpose,
  type GitProcess,
  type GitProcessExit,
  type GitProcessPort,
  type GitStdin,
  type NumstatRecord,
  type ProtocolParser,
  type RawDiffRecord,
  type RevListEntry,
} from "./git-protocol.js";

export type { GitLaunch, GitLaunchPurpose, GitProcess, GitProcessExit, GitProcessPort, GitStdin } from "./git-protocol.js";
export { DEFAULT_COMMIT_BATCH, MAX_CONCURRENT_GIT_CHILDREN, GitProtocolError } from "./git-protocol.js";

export const GIT_STREAM_EXTRACTOR_VERSION = "engram-live/git-stream/1";

// The live protocol transports bytes; this is the only place bytes become
// text, and it is lossless for names, messages and diagnostics.
const UTF8 = new TextDecoder();

/** A changed file, with lossless path bytes and both historical endpoints. */
export interface StreamedFileChange {
  readonly path: Uint8Array;
  readonly previousPath: Uint8Array | null;
  readonly status: string;
  readonly statusScore: number | null;
  readonly oldMode: string;
  readonly newMode: string;
  readonly oldOid: string;
  readonly newOid: string;
  /** Line counts; null when the content is binary or non-textual. */
  readonly added: number | null;
  readonly deleted: number | null;
}

export interface StreamedIdentity {
  readonly name: string;
  readonly email: string;
  readonly unixSeconds: number;
  /** Signed offset from UTC in minutes, as recorded in the commit object. */
  readonly offsetMinutes: number;
}

/** Changes of one commit against one of its ordered parents. */
export interface StreamedParentDiff {
  /** -1 means the empty-tree comparison of a parentless (root) commit. */
  readonly parentIndex: number;
  readonly files: readonly StreamedFileChange[];
}

/** A complete commit record: full metadata plus per-parent changed files. */
export interface StreamedCommit {
  readonly oid: string;
  readonly tree: string;
  readonly parents: readonly string[];
  readonly author: StreamedIdentity;
  readonly committer: StreamedIdentity;
  readonly message: Uint8Array;
  readonly subject: string;
  readonly parentDiffs: readonly StreamedParentDiff[];
}

export class GitStreamError extends Error {
  readonly phase: GitLaunchPurpose | "assembly";
  readonly batchIndex: number | undefined;

  constructor(message: string, phase: GitLaunchPurpose | "assembly", batchIndex?: number) {
    super(message);
    this.name = "GitStreamError";
    this.phase = phase;
    this.batchIndex = batchIndex;
  }
}

export interface GitStreamOptions {
  /** Approved host process seam; the collector never spawns Git itself. */
  readonly port: GitProcessPort;
  readonly cwd: string;
  /** Revs (refs or object ids) to walk. No count or age cap is ever applied. */
  readonly roots: readonly string[];
  /** Object ids already durably complete for this extractor version. */
  readonly knownComplete?: ReadonlySet<string>;
  /**
   * Commits per cat-file/diff-tree batch; also the backpressure window.
   * Must be at least DEFAULT_COMMIT_BATCH: a smaller window would multiply
   * process launches past the LIVE §13 bound, so it is refused.
   */
  readonly batchCommits?: number;
}

export interface GitStreamStats {
  readonly commitsExtracted: number;
  readonly commitsSkippedComplete: number;
  readonly batches: number;
  readonly gitLaunches: number;
}

interface CommitMeta {
  tree: string;
  parents: string[];
  author: StreamedIdentity;
  committer: StreamedIdentity;
  message: Uint8Array;
  subject: string;
}

/** One comparison requested from the grouped diff-tree pass. */
interface DiffTarget {
  readonly oid: string;
  /** -1 for the empty-tree comparison of a parentless (root) commit. */
  readonly parentIndex: number;
}

function wrapPhase(error: unknown, phase: GitLaunchPurpose | "assembly", batchIndex?: number): GitStreamError {
  if (error instanceof GitStreamError) return error;
  const detail = error instanceof Error ? error.message : String(error);
  const at = batchIndex === undefined ? "" : ` (batch ${batchIndex})`;
  return new GitStreamError(`${phase} streaming failed${at}: ${detail}`, phase, batchIndex);
}

async function launchProcess(options: GitStreamOptions, stats: { gitLaunches: number }, purpose: GitLaunchPurpose, args: readonly string[]): Promise<GitProcess> {
  const launch: GitLaunch = { cwd: options.cwd, args, purpose };
  const process = await options.port.start(launch);
  stats.gitLaunches += 1;
  return process;
}

async function exitOrThrow(child: GitProcess, purpose: GitLaunchPurpose, batchIndex: number | undefined, exit: GitProcessExit): Promise<void> {
  if (exit.code !== 0) {
    const stderr = UTF8.decode(exit.stderr.subarray(0, 400));
    throw new GitStreamError(`${purpose} exited ${exit.code}: ${stderr}`, purpose, batchIndex);
  }
}

/**
 * Expected-commit attestation for the discovery pass (review L2a-sol2,
 * finding 1): `rev-list --count` walks the same roots before the streaming
 * pass, and the streamed entry count must equal it for the discovery to be
 * complete. Exit code 0 alone proves nothing — a stream cut after any
 * complete line ends cleanly — so the count is the end-of-discovery proof.
 * It costs exactly one launch per pass, inside the LIVE §13 allowance.
 */
async function expectedCommitCount(options: GitStreamOptions, stats: { gitLaunches: number }): Promise<number> {
  const child = await launchProcess(options, stats, "rev-list-count", revListCountArguments(options.roots));
  const chunks: Uint8Array[] = [];
  let total = 0;
  let failure: unknown;
  try {
    for await (const chunk of child.stdout) {
      total += chunk.length;
      // A count is a few ASCII digits: anything longer is not a count.
      if (total > 32) {
        throw new GitProtocolError("rev-list --count output is longer than a decimal count");
      }
      chunks.push(chunk);
    }
  } catch (error) {
    failure = error;
    await child.abort(error instanceof Error ? error : new Error("rev-list --count failed")).catch(() => undefined);
  }
  if (failure !== undefined) {
    throw wrapPhase(failure, "rev-list-count");
  }
  await exitOrThrow(child, "rev-list-count", undefined, await child.exit);
  const all = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    all.set(chunk, position);
    position += chunk.length;
  }
  const text = UTF8.decode(all).trim();
  const count = /^[0-9]+$/.test(text) ? Number.parseInt(text, 10) : NaN;
  if (!Number.isSafeInteger(count)) {
    throw new GitStreamError(`rev-list --count returned "${text.slice(0, 40)}", not a commit count`, "rev-list-count");
  }
  return count;
}

/**
 * One paced request/response exchange: request writes are backpressured by
 * parsed responses, so memory stays bounded by `window` records even when the
 * host process produces nothing. Each request must be answered by exactly
 * one record — the count is the end-of-exchange attestation — and the child
 * is aborted the moment either branch fails, so a blocked stdin write or a
 * stalled stdout can never wait on the other branch to unwind (review
 * L2a-sol, finding 4).
 */
async function pacedExchange<R>(
  options: GitStreamOptions,
  stats: { gitLaunches: number },
  purpose: GitLaunchPurpose,
  args: readonly string[],
  requests: readonly Uint8Array[],
  window: number,
  parser: ProtocolParser<R>,
  batchIndex: number | undefined,
): Promise<R[]> {
  const child = await launchProcess(options, stats, purpose, args);
  const records: R[] = [];
  let written = 0;
  let parsed = 0;
  let readerDone = false;
  let failed = false;
  const waiters: (() => void)[] = [];
  const wakeWriters = (): void => {
    for (const wake of waiters.splice(0)) wake();
  };
  // Kill the child at once on the first branch failure: a pending stdin
  // write then rejects and the stdout iterator ends on their own, so
  // neither branch can wait on the other before the exchange unwinds.
  const failExchange = (error: unknown): void => {
    if (failed) return;
    failed = true;
    void child.abort(error instanceof Error ? error : new Error(`${purpose} exchange failed`)).catch(() => undefined);
    wakeWriters();
  };
  // Records are parsed incrementally as chunks arrive, so a stalled child
  // can never deadlock the exchange on a full pipe.
  const drain = (): void => {
    for (;;) {
      const record = parser.next();
      if (record === null) break;
      records.push(record);
      parsed += 1;
    }
    wakeWriters();
  };
  const writer = (async (): Promise<void> => {
    for (const request of requests) {
      while (written - parsed >= window) {
        if (readerDone || failed) {
          throw new GitProtocolError(`${purpose} ended with ${written - parsed} unanswered requests`);
        }
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
      await child.stdin.write(request);
      written += 1;
    }
    await child.stdin.close();
  })();
  const reader = (async (): Promise<void> => {
    try {
      for await (const chunk of child.stdout) {
        parser.push(chunk);
        drain();
      }
      drain();
      const last = parser.finish();
      if (last !== null) {
        records.push(last);
        parsed += 1;
        wakeWriters();
      }
    } finally {
      readerDone = true;
      wakeWriters();
    }
  })();
  const [writerOutcome, readerOutcome] = await Promise.allSettled([
    writer.catch((error: unknown) => {
      failExchange(error);
      throw error;
    }),
    reader.catch((error: unknown) => {
      failExchange(error);
      throw error;
    }),
  ]);
  // The reader owns the truth: a malformed or truncated stream must surface
  // as its parser error, not as the writer's collateral pipe failure.
  const failure = readerOutcome.status === "rejected" ? readerOutcome : writerOutcome.status === "rejected" ? writerOutcome : undefined;
  if (failure !== undefined) {
    throw wrapPhase((failure as PromiseRejectedResult).reason, purpose, batchIndex);
  }
  await exitOrThrow(child, purpose, batchIndex, await child.exit);
  if (records.length !== requests.length) {
    throw new GitStreamError(
      `${purpose} answered ${records.length} of ${requests.length} requests`,
      purpose,
      batchIndex,
    );
  }
  return records;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function fileChangeEqual(left: StreamedFileChange, right: StreamedFileChange): boolean {
  return left.status === right.status && left.statusScore === right.statusScore && left.oldMode === right.oldMode &&
    left.newMode === right.newMode && left.oldOid === right.oldOid && left.newOid === right.newOid &&
    left.added === right.added && left.deleted === right.deleted &&
    (left.previousPath === null) === (right.previousPath === null) &&
    (left.previousPath === null || bytesEqual(left.previousPath, right.previousPath!)) &&
    bytesEqual(left.path, right.path);
}

function fileChangesEqual(left: readonly StreamedFileChange[], right: readonly StreamedFileChange[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!fileChangeEqual(left[index]!, right[index]!)) return false;
  }
  return true;
}

/** Zip the raw and numstat halves of one diff block into change records. */
function zipBlock(block: DiffTreeBlock, batchIndex: number): StreamedFileChange[] {
  if (block.raw.length !== block.numstat.length) {
    throw new GitStreamError(
      `diff-tree commit ${block.oid} emitted ${block.raw.length} raw records and ${block.numstat.length} numstat records`,
      "diff-tree",
      batchIndex,
    );
  }
  const files: StreamedFileChange[] = [];
  for (let index = 0; index < block.raw.length; index += 1) {
    const raw = block.raw[index]!;
    const stat = block.numstat[index]!;
    if (!bytesEqual(raw.path, stat.path) || (raw.previousPath === null) !== (stat.previousPath === null) ||
        (raw.previousPath !== null && stat.previousPath !== null && !bytesEqual(raw.previousPath, stat.previousPath))) {
      throw new GitStreamError(`diff-tree commit ${block.oid} raw and numstat records disagree on paths`, "diff-tree", batchIndex);
    }
    files.push({
      path: raw.path,
      previousPath: raw.previousPath,
      status: raw.status,
      statusScore: raw.statusScore,
      oldMode: raw.oldMode,
      newMode: raw.newMode,
      oldOid: raw.oldOid,
      newOid: raw.newOid,
      added: stat.added,
      deleted: stat.deleted,
    });
  }
  return files;
}

function parseIdentity(line: string): StreamedIdentity {
  const open = line.indexOf(" <");
  const close = line.indexOf("> ", open === -1 ? 0 : open);
  if (open === -1 || close === -1) throw new GitProtocolError(`commit identity line is malformed: ${line}`);
  const name = line.slice(0, open);
  const email = line.slice(open + 2, close);
  const tail = line.slice(close + 2);
  const match = /^(\d+) ([+-]\d{4})$/.exec(tail);
  if (match === null) throw new GitProtocolError(`commit identity date is malformed: ${line}`);
  const offset = match[2]!;
  const sign = offset[0] === "-" ? -1 : 1;
  const offsetMinutes = sign * (Number.parseInt(offset.slice(1, 3)!, 10) * 60 + Number.parseInt(offset.slice(3, 5)!, 10));
  return { name, email, unixSeconds: Number.parseInt(match[1]!, 10), offsetMinutes };
}

function parseCommitObject(record: Extract<CatFileRecord, { kind: "object" }>, batchIndex: number): CommitMeta {
  if (record.type !== "commit") {
    throw new GitStreamError(`cat-file returned a ${record.type} where commit ${record.oid} was requested`, "cat-file", batchIndex);
  }
  const body = record.body;
  let position = 0;
  const headers: string[] = [];
  for (;;) {
    const newline = body.indexOf(10, position);
    if (newline === -1) throw new GitStreamError(`commit ${record.oid} object has no message separator`, "cat-file", batchIndex);
    if (newline === position) {
      // The header block ends at its first empty line; the message starts
      // after that separator, which is itself a LF byte.
      position = newline + 1;
      break;
    }
    headers.push(UTF8.decode(body.subarray(position, newline)));
    position = newline + 1;
  }
  const message = body.subarray(position);
  let tree: string | null = null;
  const parents: string[] = [];
  let author: StreamedIdentity | null = null;
  let committer: StreamedIdentity | null = null;
  for (const header of headers) {
    if (header.startsWith("tree ")) tree = header.slice(5);
    else if (header.startsWith("parent ")) parents.push(header.slice(7));
    else if (header.startsWith("author ")) author = parseIdentity(header.slice(7));
    else if (header.startsWith("committer ")) committer = parseIdentity(header.slice(10));
    // Continuation lines (gpgsig and other extensions) start with a space and
    // are preserved implicitly inside the message boundary, not interpreted.
  }
  const oidPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
  if (tree === null || !oidPattern.test(tree) || parents.some((parent) => !oidPattern.test(parent)) ||
      author === null || committer === null) {
    throw new GitStreamError(`commit ${record.oid} object lacks its mandatory headers`, "cat-file", batchIndex);
  }
  return { tree, parents, author, committer, message, subject: subjectOf(message) };
}

function subjectOf(message: Uint8Array): string {
  let end = 0;
  for (let index = 0; index + 1 < message.length; index += 1) {
    if (message[index] === 10 && message[index + 1] === 10) {
      end = index;
      break;
    }
    end = index + 2;
  }
  if (end > message.length) end = message.length;
  while (end > 0 && message[end - 1] === 10) end -= 1;
  // The subject is decoded as UTF-8 (git's own %s encoding): byte-wise
  // fromCharCode here corrupted every non-ASCII subject (review finding 5).
  // The original message bytes stay the source of truth in `message`.
  const text = UTF8.decode(message.subarray(0, end));
  return text.replaceAll("\n", " ").replaceAll("\r", " ").trimEnd();
}

/** Strict ISO-8601 date in the identity's own recorded offset (git %aI form). */
export function identityIsoDate(identity: StreamedIdentity): string {
  const shifted = (identity.unixSeconds + identity.offsetMinutes * 60) * 1000;
  const date = new Date(shifted);
  const pad = (value: number): string => String(value).padStart(2, "0");
  const iso = `${date.getUTCFullYear().toString().padStart(4, "0")}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  const sign = identity.offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(identity.offsetMinutes);
  // Git's strict %aI form renders a zero offset as "Z", not "+00:00".
  const suffix = identity.offsetMinutes === 0 ? "Z" : `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
  return `${iso}${suffix}`;
}

/**
 * Stream every commit reachable from `roots` that is not already known
 * complete. Discovery itself is streamed: rev-list output is parsed, filtered
 * and consumed batch by batch while it is produced, so no phase ever holds
 * the whole history (review L2a-sol, finding 2). Records are yielded
 * oldest-batch-first in rev-list order and are complete: metadata plus
 * changed files for every ordered parent. The generator's return value
 * carries the pass statistics.
 */
export async function* streamGitHistory(options: GitStreamOptions): AsyncGenerator<StreamedCommit, GitStreamStats> {
  const batch = options.batchCommits ?? DEFAULT_COMMIT_BATCH;
  // LIVE §13 (review L2a-sol2, finding 3): launches scale with batches, so a
  // window below the default batch would multiply them past the bound
  // (batchCommits 64 on a 1478-commit history costs 49 launches where 14
  // are allowed). Raising the window only lowers the count and is accepted.
  if (!Number.isSafeInteger(batch) || batch < DEFAULT_COMMIT_BATCH) {
    throw new GitStreamError(
      `batchCommits must be an integer of at least ${DEFAULT_COMMIT_BATCH} (LIVE §13 process bound), got ${String(options.batchCommits)}`,
      "assembly",
    );
  }
  const stats = { commitsExtracted: 0, commitsSkippedComplete: 0, batches: 0, gitLaunches: 0 };
  if (options.roots.length === 0) return stats;

  const expectedCount = await expectedCommitCount(options, stats);
  const knownComplete = options.knownComplete;
  const revList = await launchProcess(options, stats, "rev-list", revListArguments(options.roots));
  const parser = new RevListParser();
  const stdout = revList.stdout[Symbol.asyncIterator]();
  // Bounded discovery buffer: at most `batch` pending entries, filled from
  // the parser queue and fresh chunks only while a batch is being assembled.
  const pending: RevListEntry[] = [];
  let streamDone = false;
  let revListClean = false;
  let batchIndex = 0;
  // Entries seen on the stream, whether emitted or skipped: this received
  // count is the completeness witness against `expectedCount`.
  let received = 0;

  const admit = (entry: RevListEntry): void => {
    received += 1;
    if (knownComplete !== undefined && knownComplete.has(entry.oid)) {
      stats.commitsSkippedComplete += 1;
      return;
    }
    pending.push(entry);
  };
  // Parse only while the batch window has room: leftover bytes stay in the
  // parser queue, so neither the buffer nor the queue can grow with history.
  const parseAvailable = (): void => {
    while (pending.length < batch) {
      const entry = parser.next();
      if (entry === null) return;
      admit(entry);
    }
  };
  const fillBatch = async (): Promise<boolean> => {
    parseAvailable();
    while (pending.length < batch && !streamDone) {
      const step = await stdout.next();
      if (step.done) {
        streamDone = true;
        parser.finish();
        break;
      }
      parser.push(step.value);
      parseAvailable();
    }
    return pending.length > 0;
  };

  try {
    while (await fillBatch()) {
      const slice = pending.splice(0, batch);
      stats.batches += 1;
      const current = batchIndex;
      batchIndex += 1;

      // Metadata: complete commit objects, byte-count framed.
      const metaRecords = await pacedExchange<CatFileRecord>(
        options, stats, "cat-file", catFileArguments(),
        slice.map((entry) => protocolAsciiBytes(`${entry.oid}\n`)),
        slice.length, new CatFileParser(), current,
      );
      const metas = new Map<string, CommitMeta>();
      for (const record of metaRecords) {
        if (record.kind === "missing") {
          throw new GitStreamError(`object ${record.oid} is missing from the repository`, "cat-file", current);
        }
        metas.set(record.oid, parseCommitObject(record, current));
      }
      if (metas.size !== slice.length) {
        throw new GitStreamError(
          `cat-file answered ${metas.size} of ${slice.length} requested commits`,
          "cat-file",
          current,
        );
      }
      for (const entry of slice) {
        const meta = metas.get(entry.oid)!;
        if (meta.parents.length !== entry.parents.length ||
            meta.parents.some((parent, index) => parent !== entry.parents[index])) {
          throw new GitStreamError(
            `commit ${entry.oid} metadata disagrees with rev-list parents`,
            "assembly",
            current,
          );
        }
      }

      // Changed files: every comparison of the batch — root commits against
      // the empty tree, others against each ordered parent — goes through
      // ONE grouped diff-tree process, so octopus merges cannot multiply
      // launches (review finding 3). The final request is a sentinel that
      // repeats the first comparison: --always attests each request with an
      // echoed block, and the sentinel must byte-match the first block, so
      // a response truncated at any byte fails below, before any commit is
      // emitted (review finding 1).
      const requests: Uint8Array[] = [];
      const targets: DiffTarget[] = [];
      for (const entry of slice) {
        if (entry.parents.length === 0) {
          requests.push(protocolAsciiBytes(`${entry.oid}\n`));
          targets.push({ oid: entry.oid, parentIndex: -1 });
        } else {
          for (let parentIndex = 0; parentIndex < entry.parents.length; parentIndex += 1) {
            requests.push(protocolAsciiBytes(`${entry.oid} ${entry.parents[parentIndex]}\n`));
            targets.push({ oid: entry.oid, parentIndex });
          }
        }
      }
      requests.push(requests[0]!);
      targets.push(targets[0]!);
      const blocks = await pacedExchange<DiffTreeBlock>(
        options, stats, "diff-tree", diffTreeArguments(),
        requests, requests.length, new DiffTreeParser(), current,
      );

      // Verify every response of the batch before assembling or yielding.
      const filesByRequest: StreamedFileChange[][] = [];
      for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index]!;
        if (block.oid !== targets[index]!.oid) {
          throw new GitStreamError(
            `diff-tree answered ${block.oid} where ${targets[index]!.oid} was requested`,
            "diff-tree",
            current,
          );
        }
        filesByRequest.push(zipBlock(block, current));
      }
      const last = filesByRequest.length - 1;
      if (!fileChangesEqual(filesByRequest[last]!, filesByRequest[0]!)) {
        throw new GitStreamError(
          `diff-tree batch ${current} ended without attesting its last comparison`,
          "diff-tree",
          current,
        );
      }

      const diffs = new Map<string, StreamedParentDiff[]>();
      for (let index = 0; index < last; index += 1) {
        const target = targets[index]!;
        const existing = diffs.get(target.oid) ?? [];
        existing.push({ parentIndex: target.parentIndex, files: filesByRequest[index]! });
        diffs.set(target.oid, existing);
      }

      // Assembly: yield only complete records; progress advances batch-locally,
      // never past a failure inside this batch.
      for (const entry of slice) {
        const meta = metas.get(entry.oid)!;
        stats.commitsExtracted += 1;
        yield {
          oid: entry.oid,
          tree: meta.tree,
          parents: [...entry.parents],
          author: meta.author,
          committer: meta.committer,
          message: meta.message,
          subject: meta.subject,
          parentDiffs: (diffs.get(entry.oid) ?? []).sort((left, right) => left.parentIndex - right.parentIndex),
        };
      }
    }
    await exitOrThrow(revList, "rev-list", undefined, await revList.exit);
    revListClean = true;
    // End-of-discovery attestation (review L2a-sol2, finding 1): exit code 0
    // is not completeness — a stream cut after a complete line ends normally.
    // The discovery is only complete when every expected entry was received;
    // a mismatch rejects the pass even though the child exited cleanly.
    if (received !== expectedCount) {
      throw new GitStreamError(
        `rev-list streamed ${received} of ${expectedCount} commits: the discovery stream ended without attesting its end`,
        "rev-list",
      );
    }
    return stats;
  } finally {
    if (!revListClean) {
      // Consumer break, parse error or batch failure: never leave the
      // discovery child running behind an abandoned generator.
      await revList.abort(new Error("rev-list pass cancelled")).catch(() => undefined);
    }
  }
}
