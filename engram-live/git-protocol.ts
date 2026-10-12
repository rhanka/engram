// @sentropic/engram-live/git-protocol — L2a streaming Git read protocol
// (spec/SPEC_LIVE_GIT_INDEXING.md §6, §7, §13; plan/09 L2a).
//
// Data-pure protocol module: launch argument builders, the injected-process
// port types, and byte-accurate incremental parsers for the three plumbing
// commands composed by ./git-stream.ts. It takes no imports at all — no
// node: builtins, no host types, no loaders. Object bodies and paths are
// decoded with explicit byte counts and NUL delimitation; line-based path
// parsing is never used (spec §6).
//
// Safe-read contract (spec §7): every built argv carries --no-optional-locks
// and -c core.fsmonitor=false; the diff-tree argv additionally carries
// --no-ext-diff --no-textconv. The injected port must additionally launch the
// approved executable directly (no shell, no repository program on PATH) with
// GIT_OPTIONAL_LOCKS=0, GIT_NO_LAZY_FETCH=1, GIT_NO_REPLACE_OBJECTS=1, no
// terminal prompt and no system/global config injection; the protocol itself
// issues no fetch, no checkout, no index or ref write, so no repository
// program can run. This module never spawns a process by itself.

export const GIT_PROTOCOL_VERSION = "engram-live/git-protocol/1";

/** Commits per cat-file/diff-tree process batch; also the backpressure window. */
export const DEFAULT_COMMIT_BATCH = 1000;

/** LIVE §13: at most 4 concurrent Git children per collector. */
export const MAX_CONCURRENT_GIT_CHILDREN = 4;

/**
 * Rename detection is versioned evidence, not a guess: only 100% identical
 * content counts as a rename, matching the frozen native Git oracle.
 */
export const RENAME_DETECTION_ARGUMENT = "--find-renames=100%";

/** Object bodies above this size are refused instead of buffered. */
export const MAX_OBJECT_BYTES = 32 * 1024 * 1024;

/**
 * A single delimiter-bounded field — a rev-list line, a cat-file header
 * line, a diff-tree id echo, record header, or path — above this size is
 * refused as its bytes arrive, before the chunk carrying them is retained
 * (review L2a-sol3, finding 1): fields are charged on arrival, so an
 * unterminated field can neither grow the queue nor be copied past the bound.
 */
export const MAX_FIELD_BYTES = 64 * 1024;

/**
 * Retained diff bytes above this size are refused instead of buffered
 * (review L2a-sol2, finding 2): a single comparison's raw and numstat
 * records are charged as they are parsed, so the heap held for one diff is
 * bounded the same way cat-file bodies are. Since review L2a-sol3 every
 * received byte also counts against this budget on arrival, open fields
 * included, so a diff that never completes a field is refused as well.
 */
export const MAX_DIFF_BLOCK_BYTES = 32 * 1024 * 1024;

/**
 * Structural allowance charged per retained raw/numstat record on top of its
 * path bytes, so the accounted total tracks the retained heap and not just
 * the byte payload.
 */
export const DIFF_RECORD_STRUCTURAL_BYTES = 512;

export type GitLaunchPurpose = "rev-list-count" | "rev-list" | "cat-file" | "diff-tree";

export interface GitLaunch {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly purpose: GitLaunchPurpose;
}

export interface GitStdin {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface GitProcessExit {
  readonly code: number;
  readonly stderr: Uint8Array;
}

export interface GitProcess {
  readonly stdout: AsyncIterable<Uint8Array>;
  readonly stdin: GitStdin;
  readonly exit: Promise<GitProcessExit>;
  abort(reason: Error): Promise<void>;
}

/** Host-injected process seam: spawn the approved Git executable, nothing else. */
export interface GitProcessPort {
  start(launch: GitLaunch): Promise<GitProcess>;
}

export class GitProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitProtocolError";
  }
}

// — Launch argument builders. Safety arguments come first so repository
// configuration cannot reorder or disable the safe mode.

const SAFETY_ARGUMENTS: readonly string[] = [
  "--no-pager",
  "--no-optional-locks",
  "-c",
  "core.fsmonitor=false",
];

const DIFF_SAFETY_ARGUMENTS: readonly string[] = ["--no-ext-diff", "--no-textconv"];

/** Streaming commit discovery for the given roots; never a count or age cap. */
export function revListArguments(roots: readonly string[]): readonly string[] {
  if (roots.length === 0) throw new GitProtocolError("rev-list needs at least one root");
  return [...SAFETY_ARGUMENTS, "rev-list", "--parents", ...roots];
}

/**
 * Expected-commit attestation for a discovery pass: the same roots walk as
 * revListArguments, reduced to one decimal count. A stream that ends with
 * exit code 0 after fewer lines than this count is a truncated discovery,
 * not a complete one (review L2a-sol2, finding 1); the counting costs at
 * most one extra launch per pass, inside the LIVE §13 allowance.
 */
export function revListCountArguments(roots: readonly string[]): readonly string[] {
  if (roots.length === 0) throw new GitProtocolError("rev-list needs at least one root");
  return [...SAFETY_ARGUMENTS, "rev-list", "--count", ...roots];
}

/** Batched object reads with explicit length framing (cat-file --batch). */
export function catFileArguments(): readonly string[] {
  return [...SAFETY_ARGUMENTS, "cat-file", "--batch"];
}

/**
 * Grouped diff/numstat pass. --stdin consumes one "commit [parent]" line per
 * record and --always echoes the commit id NUL-delimited for EVERY
 * comparison, including empty diffs and empty-tree roots, so each request is
 * attested by exactly one echo; --root covers parentless commits; -z keeps
 * every path byte-exact. Process count scales with batches, never commits.
 */
export function diffTreeArguments(): readonly string[] {
  return [
    ...SAFETY_ARGUMENTS,
    "diff-tree",
    ...DIFF_SAFETY_ARGUMENTS,
    "--stdin",
    "--always",
    "-r",
    "-z",
    "--raw",
    "--numstat",
    "--root",
    RENAME_DETECTION_ARGUMENT,
  ];
}

// — Byte queue: the only buffer primitive. Byte counts are explicit; no
// string decoding ever happens on paths.

class ByteQueue {
  private chunks: Uint8Array[] = [];
  private start = 0;
  private total = 0;

  append(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    this.chunks.push(chunk);
    this.total += chunk.length;
  }

  get length(): number {
    return this.total - this.start;
  }

  /** Queue-relative index of the first `byte` at or after `from`, else -1. */
  indexOfByte(byte: number, from = 0): number {
    let chunkStart = 0;
    for (const chunk of this.chunks) {
      const absolute = this.start + from;
      if (chunkStart + chunk.length > absolute) {
        const begin = Math.max(absolute - chunkStart, 0);
        const at = chunk.indexOf(byte, begin);
        if (at !== -1) return chunkStart + at - this.start;
      }
      chunkStart += chunk.length;
    }
    return -1;
  }

  at(index: number): number {
    let offset = this.start + index;
    for (const chunk of this.chunks) {
      if (offset < chunk.length) return chunk[offset]!;
      offset -= chunk.length;
    }
    throw new GitProtocolError("byte queue read past its end");
  }

  slice(begin: number, end: number): Uint8Array {
    const out = new Uint8Array(end - begin);
    let position = 0;
    let chunkStart = 0;
    for (const chunk of this.chunks) {
      if (chunkStart + chunk.length > this.start + begin && position < out.length) {
        const from = Math.max(this.start + begin - chunkStart, 0);
        const take = Math.min(chunk.length - from, out.length - position);
        out.set(chunk.subarray(from, from + take), position);
        position += take;
      }
      chunkStart += chunk.length;
      if (position >= out.length) break;
    }
    return out;
  }

  drop(count: number): void {
    this.start += count;
    if (this.start > this.total) throw new GitProtocolError("byte queue dropped past its end");
    // `total` tracks the live chunk set, not the bytes ever appended: every
    // shifted-out chunk must leave the accounting, or `length` overcounts.
    while (this.chunks.length > 0 && this.start >= this.chunks[0]!.length) {
      this.start -= this.chunks[0]!.length;
      this.total -= this.chunks[0]!.length;
      this.chunks.shift();
    }
  }
}

// Arrival-time field accounting (review L2a-sol3, finding 1): charge an
// incoming chunk to the field that is still open at the tail of the queue
// and to every field the chunk closes, refusing past `cap` before the
// chunk is retained — so a field that never terminates can neither grow
// the queue nor be copied past the bound, and progression is unchanged on
// refusal. Returns the open-field byte count left after the chunk.
function chargeOpenField(delimiter: number, openBytes: number, chunk: Uint8Array, cap: number, what: string): number {
  let segment = openBytes;
  for (let index = 0; index < chunk.length; index += 1) {
    if (chunk[index] === delimiter) {
      if (segment > cap) throw new GitProtocolError(`${what} reaches ${segment} bytes, above the ${cap} byte field bound`);
      segment = 0;
    } else {
      segment += 1;
    }
  }
  if (segment > cap) throw new GitProtocolError(`${what} reaches ${segment} bytes, above the ${cap} byte field bound`);
  return segment;
}

function isHexByte(byte: number): boolean {
  return (byte >= 48 && byte <= 57) || (byte >= 97 && byte <= 102);
}

function asciiOf(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 1) out += String.fromCharCode(bytes[index]!);
  return out;
}

function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) out[index] = text.charCodeAt(index) & 0x7f;
  return out;
}

/** OID length bounds cover SHA-1 and SHA-256. */
function isOid(text: string): boolean {
  return (text.length === 40 || text.length === 64) && [...text].every((char) => isHexByte(char.charCodeAt(0)));
}

function requireOid(text: string, what: string): string {
  if (!isOid(text)) throw new GitProtocolError(`${what} is not an object id: ${text}`);
  return text;
}

function splitBytes(bytes: Uint8Array, separator: number): Uint8Array[] {
  const parts: Uint8Array[] = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === separator) {
      parts.push(bytes.subarray(start, index));
      start = index + 1;
    }
  }
  parts.push(bytes.subarray(start));
  return parts;
}

function joinBytes(parts: readonly Uint8Array[], separator: number): Uint8Array {
  if (parts.length === 0) return new Uint8Array(0);
  const size = parts.reduce((sum, part) => sum + part.length, 0) + parts.length - 1;
  const out = new Uint8Array(size);
  let position = 0;
  for (let index = 0; index < parts.length; index += 1) {
    if (index > 0) {
      out[position] = separator;
      position += 1;
    }
    out.set(parts[index]!, position);
    position += parts[index]!.length;
  }
  return out;
}

function parseCount(text: string, what: string): number {
  if (text.length === 0 || ![...text].every((char) => {
    const code = char.charCodeAt(0);
    return code >= 48 && code <= 57;
  })) {
    throw new GitProtocolError(`${what} is not a decimal count: ${text}`);
  }
  return Number.parseInt(text, 10);
}

export interface ProtocolParser<R> {
  push(chunk: Uint8Array): void;
  /** Next complete record, or null while more bytes are needed. */
  next(): R | null;
  /** Finalize the stream: return the last pending record or null; throw on truncation. */
  finish(): R | null;
}

// — rev-list --parents: one "oid parent… \n" line per commit.

export interface RevListEntry {
  readonly oid: string;
  readonly parents: readonly string[];
}

export class RevListParser implements ProtocolParser<RevListEntry> {
  private readonly queue = new ByteQueue();
  private openFieldBytes = 0;

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    // Arrival bound: the queue holds at most one chunk of leftover whole
    // lines plus one open line, so anything past that is unbounded retention.
    if (this.queue.length + chunk.length > 4 * MAX_FIELD_BYTES) {
      throw new GitProtocolError(`rev-list stream holds more than ${4 * MAX_FIELD_BYTES} unprocessed bytes`);
    }
    this.openFieldBytes = chargeOpenField(10, this.openFieldBytes, chunk, MAX_FIELD_BYTES, "rev-list line");
    this.queue.append(chunk);
  }

  next(): RevListEntry | null {
    const newline = this.queue.indexOfByte(10);
    if (newline === -1) return null;
    const line = this.queue.slice(0, newline);
    this.queue.drop(newline + 1);
    if (line.length === 0) return this.next();
    const fields = splitBytes(line, 32).map(asciiOf);
    const oid = requireOid(fields[0] ?? "", "rev-list commit id");
    const parents = fields.slice(1).map((parent) => requireOid(parent, "rev-list parent id"));
    return { oid, parents };
  }

  finish(): RevListEntry | null {
    if (this.queue.length > 0) {
      throw new GitProtocolError(
        `rev-list stream ended with a partial line (${asciiOf(this.queue.slice(0, Math.min(this.queue.length, 80)))}…)`,
      );
    }
    return null;
  }
}

// — cat-file --batch: "<oid> <type> <size>\n" + size body bytes + "\n".

export type CatFileRecord =
  | { readonly kind: "object"; readonly oid: string; readonly type: string; readonly size: number; readonly body: Uint8Array }
  | { readonly kind: "missing"; readonly oid: string };

export class CatFileParser implements ProtocolParser<CatFileRecord> {
  private readonly queue = new ByteQueue();
  private pending: { oid: string; type: string; size: number } | null = null;
  private openFieldBytes = 0;

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    // Arrival bound: the queue holds at most one object body plus one
    // header line, so anything past that is unbounded retention.
    if (this.queue.length + chunk.length > MAX_OBJECT_BYTES + MAX_FIELD_BYTES + 16) {
      throw new GitProtocolError(`cat-file stream holds more than ${MAX_OBJECT_BYTES} unprocessed object bytes`);
    }
    // While no body is pending the tail of the queue is one open header
    // line; a pending body is bounded by its declared, already-checked size.
    this.openFieldBytes = chargeOpenField(
      10,
      this.openFieldBytes,
      chunk,
      this.pending === null ? MAX_FIELD_BYTES : MAX_OBJECT_BYTES + MAX_FIELD_BYTES,
      this.pending === null ? "cat-file header" : "cat-file object body",
    );
    this.queue.append(chunk);
  }

  next(): CatFileRecord | null {
    if (this.pending === null) {
      const newline = this.queue.indexOfByte(10);
      if (newline === -1) return null;
      const header = asciiOf(this.queue.slice(0, newline));
      this.queue.drop(newline + 1);
      const space = header.indexOf(" ");
      if (space === -1) throw new GitProtocolError(`cat-file record header is malformed: ${header}`);
      const oid = requireOid(header.slice(0, space), "cat-file object id");
      const rest = header.slice(space + 1);
      if (rest === "missing" || rest === "ambiguous") return { kind: "missing", oid };
      const split = rest.lastIndexOf(" ");
      if (split === -1) throw new GitProtocolError(`cat-file record header is malformed: ${header}`);
      const type = rest.slice(0, split);
      if (type.length === 0) throw new GitProtocolError(`cat-file record header has no type: ${header}`);
      const size = parseCount(rest.slice(split + 1), "cat-file object size");
      if (size > MAX_OBJECT_BYTES) {
        throw new GitProtocolError(`cat-file object ${oid} declares ${size} bytes, above the ${MAX_OBJECT_BYTES} byte bound`);
      }
      this.pending = { oid, type, size };
    }
    const { oid, type, size } = this.pending;
    if (this.queue.length < size + 1) return null;
    const body = this.queue.slice(0, size);
    if (this.queue.at(size) !== 10) {
      throw new GitProtocolError(`cat-file object ${oid} body is not LF framed after its declared ${size} bytes`);
    }
    this.queue.drop(size + 1);
    this.pending = null;
    return { kind: "object", oid, type, size, body };
  }

  finish(): CatFileRecord | null {
    if (this.pending !== null) {
      throw new GitProtocolError(
        `cat-file stream is truncated inside object ${this.pending.oid} (${this.pending.size} declared bytes)`,
      );
    }
    if (this.queue.length > 0) {
      throw new GitProtocolError("cat-file stream ended with a partial record header");
    }
    return null;
  }
}

// — diff-tree --stdin --always -z --raw --numstat: per comparison, one
// NUL-delimited id echo, then all raw records, then all numstat records.
// --always guarantees the echo for every comparison, empty ones included, so
// a batch of N requests must produce exactly N blocks: emptiness is carried
// by an echoed block with zero records, never by silence.

export interface RawDiffRecord {
  readonly oldMode: string;
  readonly newMode: string;
  readonly oldOid: string;
  readonly newOid: string;
  readonly status: string;
  readonly statusScore: number | null;
  readonly previousPath: Uint8Array | null;
  readonly path: Uint8Array;
}

export interface NumstatRecord {
  readonly added: number | null;
  readonly deleted: number | null;
  readonly previousPath: Uint8Array | null;
  readonly path: Uint8Array;
}

export interface DiffTreeBlock {
  readonly oid: string;
  readonly raw: readonly RawDiffRecord[];
  readonly numstat: readonly NumstatRecord[];
}

const STATUS_RE = /^[A-Z]\d*$/;

type PendingPaths =
  | { kind: "raw"; fields: Partial<RawDiffRecord>; collected: Uint8Array[]; remaining: number }
  | { kind: "numstat"; fields: { added: number | null; deleted: number | null }; collected: Uint8Array[]; remaining: number }
  | null;

export class DiffTreeParser implements ProtocolParser<DiffTreeBlock> {
  private readonly queue = new ByteQueue();
  private block: { oid: string; raw: RawDiffRecord[]; numstat: NumstatRecord[] } | null = null;
  private pendingPaths: PendingPaths = null;
  // Retained-byte accounting for the open block (review L2a-sol2, finding 2):
  // every byte that enters a record of the current block is charged here, so
  // one comparison can never grow the heap past MAX_DIFF_BLOCK_BYTES.
  private blockBytes = 0;
  // Bytes received so far for the field still open at the tail of the
  // queue: the queue holds no NUL past it, so this is exactly the unparsed
  // tail, charged on arrival (review L2a-sol3, finding 1).
  private openFieldBytes = 0;

  /** Charge retained bytes to the open block, refusing past the bound. */
  private chargeBlockBytes(count: number): void {
    this.blockBytes += count;
    if (this.blockBytes > MAX_DIFF_BLOCK_BYTES) {
      throw new GitProtocolError(
        `diff-tree block for ${this.block?.oid ?? "unknown"} retains more than ${MAX_DIFF_BLOCK_BYTES} bytes`,
      );
    }
  }

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    // Arrival accounting (review L2a-sol3, finding 1): every received byte
    // is charged to the open block's budget the moment it arrives, an open
    // field included, so a path sent in small pieces without its NUL is
    // refused while the retained bytes are still inside the bound — before
    // this chunk is retained and before any copy of it is made.
    if (this.blockBytes + this.queue.length + chunk.length > MAX_DIFF_BLOCK_BYTES) {
      throw new GitProtocolError(
        `diff-tree block for ${this.block?.oid ?? "unknown"} exceeds the ${MAX_DIFF_BLOCK_BYTES} byte bound: ` +
          `${this.blockBytes} retained, ${this.queue.length + chunk.length} unprocessed`,
      );
    }
    this.openFieldBytes = chargeOpenField(
      0,
      this.openFieldBytes,
      chunk,
      MAX_FIELD_BYTES,
      `diff-tree field of ${this.block?.oid ?? "unknown"}`,
    );
    this.queue.append(chunk);
  }

  private readPathField(): Uint8Array | null {
    const nul = this.queue.indexOfByte(0);
    if (nul === -1) return null;
    const path = this.queue.slice(0, nul);
    this.queue.drop(nul + 1);
    this.chargeBlockBytes(nul + 1);
    return path;
  }

  private completePending(): void {
    const pending = this.pendingPaths!;
    if (pending.remaining > 0) return;
    const previousPath = pending.collected.length === 2 ? pending.collected[0]! : null;
    const path = pending.collected[pending.collected.length - 1]!;
    if (pending.kind === "raw") {
      this.block?.raw.push({
        oldMode: pending.fields.oldMode!,
        newMode: pending.fields.newMode!,
        oldOid: pending.fields.oldOid!,
        newOid: pending.fields.newOid!,
        status: pending.fields.status!,
        statusScore: pending.fields.statusScore ?? null,
        previousPath,
        path,
      });
    } else {
      this.block?.numstat.push({
        added: pending.fields.added,
        deleted: pending.fields.deleted,
        previousPath,
        path,
      });
    }
    this.pendingPaths = null;
  }

  next(): DiffTreeBlock | null {
    for (;;) {
      if (this.pendingPaths !== null) {
        const field = this.readPathField();
        if (field === null) return null;
        this.pendingPaths.collected.push(field);
        this.pendingPaths.remaining -= 1;
        this.completePending();
        continue;
      }
      const nul = this.queue.indexOfByte(0);
      if (nul === -1) return null;
      const token = this.queue.slice(0, nul);
      const text = asciiOf(token);
      const isIdEcho = (token.length === 40 || token.length === 64) && [...token].every(isHexByte);
      if (isIdEcho) {
        if (this.block !== null) {
          const done = this.block;
          this.block = null;
          return done;
        }
        this.queue.drop(nul + 1);
        // The echo opens a block: its accounting starts at its own bytes.
        this.blockBytes = nul + 1;
        this.block = { oid: text, raw: [], numstat: [] };
        continue;
      }
      if (token.length > 0 && token[0] === 58) {
        if (this.block === null) {
          throw new GitProtocolError(`diff-tree raw record appeared before a commit id echo: ${text}`);
        }
        const header = text.slice(1);
        const fields = header.split(" ");
        if (fields.length !== 5) throw new GitProtocolError(`diff-tree raw record is malformed: ${text}`);
        const [oldMode, newMode, oldOid, newOid, status] = fields as [string, string, string, string, string];
        if (!/^\d{6}$/.test(oldMode!) || !/^\d{6}$/.test(newMode!)) {
          throw new GitProtocolError(`diff-tree raw record has malformed modes: ${text}`);
        }
        requireOid(oldOid!, "diff-tree raw old id");
        requireOid(newOid!, "diff-tree raw new id");
        if (!STATUS_RE.test(status!)) throw new GitProtocolError(`diff-tree raw record has malformed status: ${text}`);
        const letter = status!.slice(0, 1);
        const score = status!.length > 1 ? parseCount(status!.slice(1), "diff-tree status score") : null;
        this.queue.drop(nul + 1);
        this.chargeBlockBytes(nul + 1 + DIFF_RECORD_STRUCTURAL_BYTES);
        this.pendingPaths = {
          kind: "raw",
          fields: { oldMode: oldMode!, newMode: newMode!, oldOid: oldOid!, newOid: newOid!, status: status!, statusScore: score },
          collected: [],
          remaining: letter === "R" || letter === "C" ? 2 : 1,
        };
        continue;
      }
      if (token.includes(9)) {
        if (this.block === null) {
          throw new GitProtocolError(`diff-tree numstat record appeared before a commit id echo: ${text}`);
        }
        const fields = splitBytes(token, 9);
        const addedText = asciiOf(fields[0]!);
        const deletedText = asciiOf(fields[1]!);
        const added = addedText === "-" ? null : parseCount(addedText, "diff-tree numstat added");
        const deleted = deletedText === "-" ? null : parseCount(deletedText, "diff-tree numstat deleted");
        const pathPrefix = joinBytes(fields.slice(2), 9);
        this.queue.drop(nul + 1);
        this.chargeBlockBytes(nul + 1 + DIFF_RECORD_STRUCTURAL_BYTES);
        if (pathPrefix.length === 0) {
          this.pendingPaths = { kind: "numstat", fields: { added, deleted }, collected: [], remaining: 2 };
        } else {
          this.block.numstat.push({ added, deleted, previousPath: null, path: pathPrefix });
        }
        continue;
      }
      if (token.includes(10)) {
        // A well-formed NUL-delimited record never carries a bare newline
        // (paths may contain one, but only inside a numstat path field):
        // a line where a NUL-delimited record was expected is a foreign
        // emission and is rejected instead of being misparsed.
        throw new GitProtocolError(`diff-tree stream carries a line where a NUL-delimited record was expected: ${text.slice(0, 80)}`);
      }
      throw new GitProtocolError(`diff-tree stream is malformed at record: ${text.slice(0, 80)}`);
    }
  }

  finish(): DiffTreeBlock | null {
    if (this.pendingPaths !== null) {
      throw new GitProtocolError("diff-tree stream is truncated inside a path field");
    }
    if (this.queue.length > 0) {
      throw new GitProtocolError("diff-tree stream ended with a partial record");
    }
    const done = this.block;
    this.block = null;
    return done;
  }
}

export { asciiBytes as protocolAsciiBytes };
