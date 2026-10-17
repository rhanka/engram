// G1 neutral producer: no store, cache, filesystem, clock or network. The
// host opens an authorized R1 private Git view; capture worktrees are never
// a fallback. Native Git chooses origins; raw object hashes, byte paths,
// ordered parents and both line coordinates independently bind its evidence.
import { createHash } from "node:crypto";
import {
  POLICY_VERSION, validateLiveScope, validateQualifiedOid, validateRetentionReceipt,
  type LineAuthorIdentityDto, type LineAttributionGapCause, type LineAttributionOptionsDto,
  type LineAttributionOutcomeDto, type LineAttributionRequestDto, type LineOriginDto,
  type QualifiedOid, type RetentionReceiptDto,
} from "./contracts.js";
import { GitUnavailableError, type SafeGitExecutor } from "./git-executor.js";

export const LINE_ATTRIBUTION_VERSION = "live-line-attribution/1";
export interface LineAttributionPorts {
  readonly git: SafeGitExecutor;
  /** Revalidated before reads and emission. Throws deny. The host also
   * authorizes every object/path reachable by native move/copy traversal in
   * openRetained's view; excluded objects must never enter that view. */
  authorize(request: LineAttributionRequestDto, origin?: { readonly commit: QualifiedOid; readonly path: Uint8Array }):
    Promise<"authorized" | "unauthorized" | "excluded">;
  /** Read-only view of the exact receipt's authorized object closure, with
   * no observed-worktree fallback or borrowed observed-object alternates.
   * Missing, excluded or revoked closure: return null or deny authorize.
   * configPaths includes common and worktree config, as in L2b capture. */
  openRetained(request: LineAttributionRequestDto): Promise<{
    readonly cwd: string;
    readonly configPaths: readonly string[];
    readonly receipt: RetentionReceiptDto;
  } | null>;
}
class AttributionGap extends Error {
  constructor(readonly cause: LineAttributionGapCause, message: string) { super(message); }
}
function gap(cause: LineAttributionGapCause, reason: string): never { throw new AttributionGap(cause, reason); }
function validPath(value: Uint8Array): boolean {
  if (!(value instanceof Uint8Array)) return false;
  const path = Buffer.from(value);
  return path.length > 0 && !path.includes(0) && path[0] !== 47 &&
    path.toString("latin1").split("/").every(part => part.length > 0 && part !== "." && part !== "..");
}
function pin(input: LineAttributionRequestDto): LineAttributionRequestDto {
  const o = input?.options;
  const score = (value: unknown) => value === null || Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 999999;
  if (!input || !validateLiveScope(input.scope).ok || input.scope.worktree !== undefined || !validateQualifiedOid(input.target).ok ||
      !validPath(input.path) || typeof input.generationId !== "string" || !input.generationId.trim() || input.policyVersion !== POLICY_VERSION ||
      !o || o.version !== "native-blame-options/1" || o.algorithm !== "myers" ||
      !score(o.moveMinCharacters) || !score(o.copyMinCharacters) || !["modified", "created", "all"].includes(o.copySearch) ||
      (o.copyMinCharacters !== null && o.moveMinCharacters === null) ||
      (o.copyMinCharacters === null && o.copySearch !== "all")) {
    throw new Error("line attribution requires a scoped pinned target, byte path and supported versioned policy/options");
  }
  let end = 0;
  if (!Array.isArray(input.ranges) || input.ranges.length === 0) throw new Error("line attribution requires inclusive ranges");
  for (const range of input.ranges) {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start <= end || range.end < range.start) {
      throw new Error("line attribution ranges must be positive, ordered, disjoint safe integers");
    }
    end = range.end;
  }
  return { scope: { tenant: input.scope.tenant, clone: input.scope.clone }, generationId: input.generationId,
    target: { ...input.target }, path: Uint8Array.from(input.path), ranges: input.ranges.map(range => ({ ...range })),
    policyVersion: input.policyVersion, options: { ...o } };
}
function blameArgs(input: LineAttributionRequestDto): string[] {
  const o: LineAttributionOptionsDto = input.options;
  return ["blame", "--root", "--line-porcelain", "--no-textconv", "--no-progress", "--encoding=none",
    "--ignore-revs-file", "", "--diff-algorithm=myers", "--no-indent-heuristic",
    ...(o.moveMinCharacters === null ? [] : [`-M${o.moveMinCharacters}`]),
    ...(o.copyMinCharacters === null ? [] : Array(o.copySearch === "all" ? 3 : o.copySearch === "created" ? 2 : 1).fill(`-C${o.copyMinCharacters}`)),
    ...input.ranges.flatMap(range => ["-L", `${range.start},${range.end}`]), input.target.oid, "--"];
}
interface Commit { tree: string; parents: string[]; author: LineAuthorIdentityDto }
function parseCommit(bytes: Buffer, algorithm: QualifiedOid["algorithm"]): Commit {
  const headerEnd = bytes.indexOf(Buffer.from("\n\n"));
  if (headerEnd < 0) return gap("invalid-evidence", "retained commit has no header terminator");
  const headers = bytes.subarray(0, headerEnd).toString("latin1").split("\n");
  const tree = headers.filter(line => line.startsWith("tree ")).map(line => line.slice(5));
  const parents = headers.filter(line => line.startsWith("parent ")).map(line => line.slice(7));
  const authors = headers.filter(line => line.startsWith("author "));
  const author = /^author (.*) <([^<>]*)> (-?\d+) ([+-])(\d{2})(\d{2})$/.exec(authors[0] ?? "");
  if (tree.length !== 1 || authors.length !== 1 || !author || ![tree[0]!, ...parents].every(oid => validateQualifiedOid({ algorithm, oid }).ok)) {
    return gap("invalid-evidence", "retained commit tree, ordered parents or author are malformed");
  }
  const unixSeconds = Number(author[3]);
  const hours = Number(author[5]), minutes = Number(author[6]);
  if (!Number.isSafeInteger(unixSeconds) || hours > 23 || minutes > 59) return gap("invalid-evidence", "retained author time is malformed");
  const decode = (field: string): { text: string; bytes?: Uint8Array } => {
    const raw = Buffer.from(field, "latin1"), utf8 = raw.toString("utf8");
    return Buffer.from(utf8, "utf8").equals(raw) ? { text: utf8 } : { text: field, bytes: Uint8Array.from(raw) };
  };
  const name = decode(author[1]!), email = decode(author[2]!);
  return { tree: tree[0]!, parents, author: { name: name.text, email: email.text,
    ...(name.bytes ? { nameBytes: name.bytes } : {}), ...(email.bytes ? { emailBytes: email.bytes } : {}), unixSeconds,
    offsetMinutes: (hours * 60 + minutes) * (author[4] === "-" ? -1 : 1) } };
}
function blobLines(bytes: Buffer): Buffer[] {
  const lines: Buffer[] = [];
  let start = 0;
  for (let at = 0; at < bytes.length; at++) if (bytes[at] === 10) { lines.push(bytes.subarray(start, at)); start = at + 1; }
  if (start < bytes.length) lines.push(bytes.subarray(start));
  return lines;
}
/** Git's C quoting is a byte grammar, never JSON/UTF-8 path decoding. */
function originPath(bytes: Buffer): Buffer {
  if (bytes[0] !== 34) return bytes;
  if (bytes[bytes.length - 1] !== 34) return gap("invalid-evidence", "unterminated origin path");
  const out: number[] = [];
  const escapes: Record<number, number> = { 97: 7, 98: 8, 116: 9, 110: 10, 118: 11, 102: 12, 114: 13, 34: 34, 92: 92 };
  for (let i = 1; i < bytes.length - 1; i++) {
    let byte = bytes[i]!;
    if (byte === 92) {
      byte = bytes[++i]!;
      if (byte >= 48 && byte <= 51 && /^[0-3][0-7]{2}$/.test(bytes.subarray(i, i + 3).toString("ascii"))) {
        out.push(parseInt(bytes.subarray(i, i + 3).toString("ascii"), 8)); i += 2;
      } else if (escapes[byte] !== undefined) out.push(escapes[byte]!);
      else return gap("invalid-evidence", "invalid origin path escape");
    } else out.push(byte);
  }
  return Buffer.from(out);
}
interface BlamedLine { oid: string; original: number; final: number; path: Buffer; content: Buffer }
function parseBlame(bytes: Buffer, algorithm: QualifiedOid["algorithm"]): BlamedLine[] {
  let offset = 0;
  const line = () => {
    const end = bytes.indexOf(10, offset);
    if (end < 0) return gap("invalid-evidence", "truncated blame porcelain");
    const value = bytes.subarray(offset, end); offset = end + 1; return value;
  };
  const result: BlamedLine[] = [];
  while (offset < bytes.length) {
    const header = /^([0-9a-f]+) ([1-9][0-9]*) ([1-9][0-9]*)(?: ([1-9][0-9]*))?$/.exec(line().toString("ascii"));
    if (!header || !validateQualifiedOid({ algorithm, oid: header[1] }).ok) return gap("invalid-evidence", "invalid blame origin coordinates");
    let path: Buffer | null = null;
    for (;;) {
      const value = line();
      if (value[0] === 9) {
        if (path === null || !validPath(path)) return gap("invalid-evidence", "blame origin lacks a literal byte path");
        result.push({ oid: header[1]!, original: Number(header[2]), final: Number(header[3]), path, content: value.subarray(1) });
        break;
      }
      if (value.equals(Buffer.from("boundary"))) return gap("shallow", "native blame reached a history boundary");
      if (value.subarray(0, 9).equals(Buffer.from("filename "))) {
        if (path !== null) return gap("invalid-evidence", "duplicate origin path");
        path = originPath(value.subarray(9));
      }
    }
  }
  return result;
}

export async function attributeLines(input: LineAttributionRequestDto, ports: LineAttributionPorts): Promise<LineAttributionOutcomeDto> {
  const request = pin(input); // Snapshot caller-owned byte arrays before the first await.
  const qualified = (oid: string): QualifiedOid => ({ algorithm: request.target.algorithm, oid });
  let gitVersion: string | null = null;
  let retainedRoot: QualifiedOid | null = null;
  const authorize = async (origin?: { commit: QualifiedOid; path: Uint8Array }) => {
    let decision: string;
    // Ports receive fresh copies, so a host's mutation cannot change bindings.
    try { decision = await ports.authorize(pin(request), origin && { commit: { ...origin.commit }, path: Uint8Array.from(origin.path) }); }
    catch { return gap("unauthorized", "line attribution authorization unavailable"); }
    if (decision !== "authorized") gap(decision === "excluded" ? "excluded" : "unauthorized", "line attribution scope or origin is not authorized");
  };
  const base = () => ({ ...request, calculationVersion: LINE_ATTRIBUTION_VERSION, gitVersion, retainedRoot });
  try {
    await authorize();
    let retained: Awaited<ReturnType<LineAttributionPorts["openRetained"]>>;
    try { retained = await ports.openRetained(pin(request)); }
    catch { return gap("missing-retention", "authorized R1 retained view unavailable"); }
    const receipt = retained?.receipt;
    if (!retained || !receipt || !validateRetentionReceipt(receipt).ok || receipt.scope.worktree !== undefined ||
        receipt.scope.tenant !== request.scope.tenant || receipt.scope.clone !== request.scope.clone ||
        receipt.algorithm !== request.target.algorithm || !retained.configPaths.length) {
      return gap("missing-retention", "target lacks its scoped R1 retention receipt");
    }
    retainedRoot = qualified(receipt.oid);
    const { cwd, configPaths } = retained;
    const git = ports.git;
    try {
      git.assertNoConfigIncludes(configPaths, true);
      gitVersion = git.run(cwd, ["--version"]).toString("utf8").trim();
      if (!/^git version .+/.test(gitVersion)) gap("git-unavailable", "native Git version unavailable");
      const shallow = git.run(cwd, ["rev-parse", "--is-shallow-repository"]).toString().trim();
      if (shallow === "true") gap("shallow", "R1 view has a shallow boundary; no complete origin is claimed");
      if (shallow !== "false") gap("invalid-evidence", "retained shallow metadata unavailable");
    } catch (error) {
      if (error instanceof AttributionGap) throw error;
      return gap("git-unavailable", "retained Git view or configuration gate unavailable");
    }
    const objects = new Map<string, Buffer>();
    const readBatch = (type: "commit" | "tree" | "blob", ids: readonly string[]): void => {
      const missing = [...new Set(ids)].filter(oid => !objects.has(`${type}:${oid}`));
      for (let start = 0; start < missing.length; start += 128) {
        const batch = missing.slice(start, start + 128);
        let bytes: Buffer;
        try { bytes = git.run(cwd, ["cat-file", "--batch"], batch.join("\n") + "\n"); }
        catch (error) { return gap(error instanceof GitUnavailableError ? "git-unavailable" : "missing-object",
          "required R1 object batch unavailable; no fetch or checkout fallback"); }
        let offset = 0;
        for (const oid of batch) {
          const end = bytes.indexOf(10, offset);
          if (end < 0) return gap("invalid-evidence", "truncated retained object batch header");
          const header = bytes.subarray(offset, end).toString("latin1");
          if (header === `${oid} missing`) return gap("missing-object", "required R1 object unavailable");
          const fields = header.split(" ");
          const size = Number(fields[2]);
          if (fields.length !== 3 || fields[0] !== oid || fields[1] !== type || !/^(0|[1-9][0-9]*)$/.test(fields[2]!) ||
              !Number.isSafeInteger(size) || size > bytes.length - end - 2 || bytes[end + 1 + size] !== 10) {
            return gap("invalid-evidence", "retained object batch type, order or length is malformed");
          }
          const body = bytes.subarray(end + 1, end + 1 + size);
          const digest = createHash(request.target.algorithm === "sha1" ? "sha1" : "sha256")
            .update(`${type} ${body.length}\0`).update(body).digest("hex");
          if (digest !== oid) return gap("invalid-evidence", "retained raw object does not match its OID");
          objects.set(`${type}:${oid}`, body); offset = end + size + 2;
        }
        if (offset !== bytes.length) return gap("invalid-evidence", "unexpected trailing retained object batch bytes");
      }
    };
    const read = (type: "commit" | "tree" | "blob", oid: string): Buffer => {
      readBatch(type, [oid]); return objects.get(`${type}:${oid}`)!;
    };
    let ancestry: string[];
    try {
      // Membership is a native reachability check, not materialized evidence
      // about every descendant and side branch of the retained root.
      if (receipt.oid !== request.target.oid) {
        const membership = git.probe(cwd, ["merge-base", "--is-ancestor", request.target.oid, receipt.oid]);
        if (membership.status === 1) gap("missing-retention", "pinned target is outside the scoped R1 root ancestry");
        if (membership.status !== 0) gap("missing-object", "retained root membership could not be verified");
      }
      ancestry = git.run(cwd, ["rev-list", request.target.oid, "--"]).toString("latin1").trim().split("\n");
    } catch (error) {
      if (error instanceof AttributionGap) throw error;
      return gap(error instanceof GitUnavailableError ? "git-unavailable" : "missing-object", "pinned target ancestry unavailable");
    }
    if (!ancestry.every(oid => validateQualifiedOid(qualified(oid)).ok) || new Set(ancestry).size !== ancestry.length) {
      return gap("invalid-evidence", "native target ancestry contains invalid or repeated OIDs");
    }
    const commits = new Map<string, Commit>();
    for (let start = 0; start < ancestry.length; start += 128) {
      const batch = ancestry.slice(start, start + 128);
      for (const oid of batch) await authorize({ commit: qualified(oid), path: request.path });
      readBatch("commit", batch);
      for (const oid of batch) commits.set(oid, parseCommit(read("commit", oid), request.target.algorithm));
    }
    const targetAncestry = new Set<string>();
    const pending = [request.target.oid];
    while (pending.length) {
      const oid = pending.pop()!; if (targetAncestry.has(oid)) continue;
      const commit = commits.get(oid);
      if (!commit) return gap("invalid-evidence", "native ancestry omits a verified parent");
      targetAncestry.add(oid); pending.push(...commit.parents);
    }
    if (targetAncestry.size !== commits.size) return gap("invalid-evidence", "native ancestry includes commits outside the target closure");
    const file = (oid: string, path: Uint8Array): Buffer[] => {
      const commit = commits.get(oid);
      if (!commit || !targetAncestry.has(oid)) return gap("invalid-evidence", "origin is outside the pinned target ancestry");
      let tree = commit.tree;
      const parts = Buffer.from(path).toString("latin1").split("/").map(part => Buffer.from(part, "latin1"));
      for (let i = 0; i < parts.length; i++) {
        const bytes = read("tree", tree);
        let offset = 0, found = false;
        while (offset < bytes.length) {
          const space = bytes.indexOf(32, offset), nul = bytes.indexOf(0, space + 1);
          const length = request.target.algorithm === "sha1" ? 20 : 32;
          if (space < offset || nul < space || nul + 1 + length > bytes.length) return gap("invalid-evidence", "malformed retained tree");
          const mode = bytes.subarray(offset, space).toString("ascii");
          const child = bytes.subarray(nul + 1, nul + 1 + length).toString("hex");
          if (bytes.subarray(space + 1, nul).equals(parts[i]!)) {
            found = true;
            if (i === parts.length - 1) {
              if (mode !== "100644" && mode !== "100755") return gap("excluded", "line attribution requires a regular committed blob");
              return blobLines(read("blob", child));
            }
            if (mode !== "40000") return gap("missing-path", "path traverses a non-tree entry");
            tree = child; break;
          }
          offset = nul + 1 + length;
        }
        if (!found) return gap("missing-path", "literal byte path absent at the pinned commit");
      }
      return gap("missing-path", "literal byte path unavailable");
    };
    const targetLines = file(request.target.oid, request.path);
    if (request.ranges.some(range => range.end > targetLines.length)) return gap("invalid-range", "requested range exceeds the pinned blob");
    let output: Buffer;
    try { output = git.blame(cwd, blameArgs(request), request.path, configPaths); }
    catch (error) { return gap(error instanceof GitUnavailableError ? "git-unavailable" : "missing-object",
      "native attribution could not resolve retained origins"); }
    const blamed = parseBlame(output, request.target.algorithm);
    const expected = request.ranges.flatMap(range => Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i));
    if (blamed.length !== expected.length) return gap("invalid-evidence", "native attribution did not cover every requested line");
    const origins: LineOriginDto[] = [];
    for (let i = 0; i < blamed.length; i++) {
      const line = blamed[i]!;
      if (line.final !== expected[i] || !Number.isSafeInteger(line.original) || !targetLines[line.final - 1]?.equals(line.content)) {
        return gap("invalid-evidence", "native attribution disagrees with pinned final coordinates or bytes");
      }
      await authorize({ commit: qualified(line.oid), path: line.path });
      if (!file(line.oid, line.path)[line.original - 1]?.equals(line.content)) return gap("invalid-evidence", "native original coordinates or bytes disagree with the retained origin");
      const previous = origins[origins.length - 1];
      if (previous && previous.commit.oid === line.oid && Buffer.from(previous.path).equals(line.path) &&
          previous.originalRange.end + 1 === line.original && previous.finalRange.end + 1 === line.final) {
        origins[origins.length - 1] = { ...previous, originalRange: { start: previous.originalRange.start, end: line.original },
          finalRange: { start: previous.finalRange.start, end: line.final } };
      } else origins.push({ commit: qualified(line.oid), author: { ...commits.get(line.oid)!.author }, path: Uint8Array.from(line.path),
        originalRange: { start: line.original, end: line.original }, finalRange: { start: line.final, end: line.final } });
    }
    try {
      if (!git.probeNoConfigIncludes(configPaths, true)) gap("git-unavailable", "retained configuration changed during attribution");
    } catch (error) {
      if (error instanceof AttributionGap) throw error;
      return gap("git-unavailable", "retained configuration re-probe unavailable");
    }
    // Authorization is not a cache: revocation during native Git computation
    // or origin verification suppresses all facts, including parent evidence.
    await authorize();
    for (const origin of origins) await authorize(origin);
    return { ...base(), state: "complete", origins,
      parentEvidence: [...commits].sort(([a], [b]) => a.localeCompare(b)).map(([oid, commit]) => ({
        commit: qualified(oid), parents: commit.parents.map(qualified),
      })), coverage: { axis: "line-attribution", state: "current", gaps: [] } };
  } catch (error) {
    if (!(error instanceof AttributionGap)) throw error;
    retainedRoot = null;
    return { ...base(), state: "partial", origins: [], parentEvidence: [],
      coverage: { axis: "line-attribution", state: "partial", gaps: [{ cause: error.cause, reason: error.message }] } };
  }
}
