// @sentropic/engram-live/comparisons — L5 pinned branch comparisons
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3, 8, A04/A08; plan/09 L5;
//  L5-cache-design R2/R7/R8 + A5/A8/A11).
//
// Every contract requires actual changed-file derivation (R8):
// before/after paths+modes, change kind, rename evidence, binary-aware
// stats. Endpoint-only profiles never qualify. Contribution derives one
// mergeBase[i]→branchTip per proven base; current-diff derives
// baseTip→branchTip (unrelated history does not prevent tree comparison);
// parent comparison derives one parent[i]→targetCommit per authoritative
// parent, order/index preserved.
//
// Claims are accepted only as verifiable evidence (R8a): a Git object is
// valid after engram recomputes the declared algorithm over
// "<type> <size>\0<body>"; merge-base sets/ancestry/bounds come from typed
// receipts or the injected Git capability — booleans and caller-supplied
// arrays are never proof. The injected comparison capability returns the
// exact (beforeTree, afterTree) pair + parent index + comparator version +
// options; engram rejects a result whose pair differs. Diff options are
// passed explicitly and override repository/global/system configuration;
// Git version + object format enter A. Deterministic only (R13): no model
// output is cached, served or used as evidence.
//
// Neutrality: node:crypto only (OID recomputation). DTOs/validation/
// derivation self-contained. Ports injected. No h2a/cluster-mesh/
// sentropic/driver/network/filesystem/loader/LLM.

import { createHash } from "node:crypto";

export const COMPARISON_VERSION = "live-branch-comparison/1";
/** R8a comparator + Git pins (A-components). */
export const COMPARISON_COMPARATOR_VERSION = "live-comparator/1";
export const COMPARISON_OBJECT_FORMAT = "sha1,sha256";

export class ComparisonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComparisonError";
  }
}

export interface PinnedOidDto {
  readonly algorithm: "sha1" | "sha256";
  readonly oid: string;
}

export type ComparisonBaseSource = "pr-base" | "default-base" | "override";
export type ComparisonKind = "contribution" | "current-diff" | "merge-parent";
export type ComparisonState = "complete" | "partial" | "unknown" | "unrelated";

export interface ComparisonEndpointsDto {
  readonly baseTip: PinnedOidDto;
  readonly branchTip: PinnedOidDto;
  readonly mergeBases: readonly PinnedOidDto[];
  /** Legacy caller hint only; outcomes derive the source from baseCandidates. */
  readonly baseSource?: ComparisonBaseSource;
}

/**
 * Typed ancestry/bounds receipt (R8a: booleans never proof). A complete
 * receipt carries a generation identity AND the merge-base set it attests;
 * endpoints.mergeBases must equal the attested set. Caller-supplied arrays
 * alone are never proof.
 */
export interface AncestryReceiptDto {
  readonly status: "complete" | "unknown";
  readonly generation?: string | null;
  readonly mergeBases?: readonly PinnedOidDto[] | null;
  readonly detail?: string | null;
}

export interface CompareBranchesInput {
  readonly scope: { readonly tenant: string; readonly clone: string };
  readonly kind: ComparisonKind;
  readonly endpoints: ComparisonEndpointsDto;
  readonly mergeParents?: readonly PinnedOidDto[];
  readonly targetCommit?: PinnedOidDto | null;
  readonly isRoot?: boolean | null;
  readonly emptyTree?: PinnedOidDto | null;
  readonly ancestry?: AncestryReceiptDto | null;
  readonly baseCandidates: {
    readonly prBase?: PinnedOidDto | null;
    readonly defaultBase?: PinnedOidDto | null;
    readonly override?: PinnedOidDto | null;
  };
  readonly diffOptions?: {
    readonly renameThreshold?: number | null;
    readonly renameLimit?: number | null;
    readonly algorithm?: string | null;
    readonly binaryDetection?: boolean | null;
  } | null;
}

export interface DiffChangeDto {
  /** Unquoted paths in DerivedDiffDto.pathEncoding; base64url preserves arbitrary Git path bytes. */
  readonly beforePath: string | null;
  readonly afterPath: string | null;
  readonly beforeMode: string | null;
  readonly afterMode: string | null;
  readonly changeKind: "added" | "deleted" | "modified" | "renamed" | "typechange";
  readonly renameEvidence: string | null;
  readonly binary: boolean;
  readonly insertions: number;
  readonly deletions: number;
}

export interface DerivedDiffDto {
  readonly beforeTree: PinnedOidDto;
  readonly afterTree: PinnedOidDto;
  readonly parentIndex: number | null;
  readonly comparatorVersion: string;
  readonly gitVersion: string;
  readonly pathEncoding: "utf8" | "base64url";
  readonly objectFormat: "sha1" | "sha256";
  readonly options: NonNullable<CompareBranchesInput["diffOptions"]>;
  readonly changes: readonly DiffChangeDto[];
  readonly derived: true;
}

export interface PerParentComparisonDto {
  readonly parentIndex: number;
  readonly parent: PinnedOidDto;
  readonly target: PinnedOidDto | null;
  readonly state: "complete" | "unknown";
  readonly reason: string;
  readonly diff: DerivedDiffDto | null;
}

export interface ComparisonCoverageDto {
  readonly axis: "dag";
  readonly state: "current" | "partial" | "unavailable";
  readonly reason: string;
}

export interface BranchComparisonOutcome {
  readonly state: ComparisonState;
  readonly kind: ComparisonKind;
  readonly baseTip: PinnedOidDto;
  readonly branchTip: PinnedOidDto;
  readonly mergeBases: readonly PinnedOidDto[];
  readonly baseSource: ComparisonBaseSource | null;
  readonly perParent: readonly PerParentComparisonDto[];
  readonly diffs: readonly DerivedDiffDto[];
  readonly coverage: ComparisonCoverageDto;
}

export interface ComparisonObjectsPort {
  loadBlob(oid: string): Promise<Uint8Array | null>;
  loadObject?(oid: string): Promise<{ readonly type: string; readonly body: Uint8Array } | null>;
  /** Host reads retained shallow metadata, bound to these objects. */
  isShallowBoundary?(oid: PinnedOidDto): Promise<boolean>;
}

/** Trusted deterministic capability for line statistics, binary detection and rename
 * similarity evidence. We verify object identities, changed-path coverage and types,
 * but do not reimplement Git's diff algorithms. Its actual Git version is recorded. */
export interface ComparisonCapabilityPort {
  compare(input: {
    readonly beforeTree: PinnedOidDto;
    readonly afterTree: PinnedOidDto;
    readonly parentIndex: number | null;
    readonly options: NonNullable<CompareBranchesInput["diffOptions"]>;
  }): Promise<DerivedDiffDto>;
}

export interface CompareBranchesPorts {
  readonly objects: ComparisonObjectsPort;
  readonly comparator?: ComparisonCapabilityPort | null;
}

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
export const DEFAULT_DIFF_OPTIONS = Object.freeze({
  algorithm: "histogram", binaryDetection: true, renameLimit: 1000, renameThreshold: 50,
});
function sameOid(a: PinnedOidDto, b: PinnedOidDto): boolean {
  return !!a && !!b && a.algorithm === b.algorithm && a.oid === b.oid;
}
function key(oid: PinnedOidDto): string { return oid.algorithm + ":" + oid.oid; }
function checkOid(oid: PinnedOidDto): void {
  if (!oid || !((oid.algorithm === "sha1" ? HEX40 : oid.algorithm === "sha256" ? HEX64 : /(?!) /).test(oid.oid))) {
    throw new ComparisonError("object-invalid: expected an algorithm-qualified lowercase OID");
  }
}
export interface ValidatedCommit { readonly tree: string; readonly parents: readonly string[]; }
export interface ValidatedTreeEntry { readonly mode: string; readonly name: string; readonly oid: PinnedOidDto; }
export interface VerifiedObject { readonly body: Uint8Array; readonly commit?: ValidatedCommit; readonly entries?: readonly ValidatedTreeEntry[]; }

/** Exact Git framing, expected type, and syntax; a digest alone is never a type proof. */
export async function verifyGitObject(oid: PinnedOidDto, objects: ComparisonObjectsPort, type: "commit" | "tree" | "blob"): Promise<VerifiedObject> {
  checkOid(oid);
  if (!objects.loadObject) throw new ComparisonError("comparison-provider-unavailable: typed retained objects required");
  const loaded = await objects.loadObject(oid.oid);
  if (!loaded) throw new ComparisonError("object-missing: " + key(oid));
  const body = Uint8Array.from(loaded.body); // pin once; providers cannot mutate the hashed buffer
  if (loaded.type !== type || createHash(oid.algorithm).update(type + " " + body.length + "\0").update(body).digest("hex") !== oid.oid) {
    throw new ComparisonError("object-invalid: Git type or OID mismatch for " + key(oid));
  }
  if (type === "blob") return { body };
  if (type === "commit") {
    const text = Buffer.from(body).toString("utf8");
    const boundary = text.indexOf("\n\n");
    if (boundary < 0 || text.includes("\0")) throw new ComparisonError("object-invalid: malformed commit headers");
    const lines = text.slice(0, boundary).split("\n");
    const hex = oid.algorithm === "sha1" ? HEX40 : HEX64;
    if (!lines[0]?.startsWith("tree ") || !hex.test(lines[0].slice(5))) throw new ComparisonError("object-invalid: commit tree");
    const parents: string[] = [];
    let cursor = 1;
    while (lines[cursor]?.startsWith("parent ")) {
      const parent = lines[cursor++]!.slice(7);
      if (!hex.test(parent)) throw new ComparisonError("object-invalid: commit parent format");
      parents.push(parent);
    }
    const identity = /^(?:author|committer) [^\n]* <[^<>\n]*> -?\d+ [+-]\d{4}$/;
    if (!lines[cursor]?.startsWith("author ") || !identity.test(lines[cursor]!)
      || !lines[cursor + 1]?.startsWith("committer ") || !identity.test(lines[cursor + 1]!)
      || lines.slice(cursor + 2).some(line => line.startsWith("tree ") || line.startsWith("parent "))) {
      throw new ComparisonError("object-invalid: commit header order");
    }
    return { body, commit: { tree: lines[0].slice(5), parents } };
  }
  const entries: ValidatedTreeEntry[] = [];
  const bytes = Buffer.from(body);
  const oidBytes = oid.algorithm === "sha1" ? 20 : 32;
  let cursor = 0;
  let previous: Buffer | null = null;
  const names = new Set<string>();
  while (cursor < bytes.length) {
    const space = bytes.indexOf(32, cursor);
    const nul = bytes.indexOf(0, space + 1);
    if (space < cursor || nul < space || nul + 1 + oidBytes > bytes.length) throw new ComparisonError("object-invalid: truncated Git tree");
    const mode = bytes.subarray(cursor, space).toString("ascii");
    const nameBytes = bytes.subarray(space + 1, nul);
    const name = nameBytes.toString("latin1"); // lossless byte identity
    if (!["40000", "100644", "100755", "120000", "160000"].includes(mode)
      || !nameBytes.length || name.includes("/") || name === "." || name === ".." || names.has(name)) {
      throw new ComparisonError("object-invalid: Git tree entry");
    }
    const order = Buffer.concat([nameBytes, Buffer.from(mode === "40000" ? "/" : "\0")]);
    if (previous && Buffer.compare(previous, order) >= 0) throw new ComparisonError("object-invalid: unordered Git tree");
    previous = order; names.add(name);
    const child = bytes.subarray(nul + 1, nul + 1 + oidBytes).toString("hex");
    if (/^0+$/.test(child)) throw new ComparisonError("object-invalid: null tree entry OID");
    entries.push({ mode, name, oid: { algorithm: oid.algorithm, oid: child } });
    cursor = nul + 1 + oidBytes;
  }
  return { body, entries };
}

/** Traverse every parent to a validated root; no generation/status label is evidence. */
export async function verifyCommitGraph(heads: readonly PinnedOidDto[], objects: ComparisonObjectsPort): Promise<Map<string, ValidatedCommit>> {
  if (!heads.length) throw new ComparisonError("bounds-unknown: no pinned heads");
  const commits = new Map<string, ValidatedCommit>();
  const pending = [...heads];
  while (pending.length) {
    const oid = pending.pop()!;
    if (commits.has(key(oid))) continue;
    const checked = await verifyGitObject(oid, objects, "commit");
    const commit = checked.commit!;
    if (commit.parents.length && await objects.isShallowBoundary?.(oid)) {
      throw new ComparisonError("shallow-history: retained commit is a shallow boundary " + key(oid));
    }
    commits.set(key(oid), commit);
    pending.push(...commit.parents.map(parent => ({ algorithm: oid.algorithm, oid: parent })));
  }
  return commits;
}
function ancestorSet(head: PinnedOidDto, graph: Map<string, ValidatedCommit>): Set<string> {
  const result = new Set<string>(); const pending = [key(head)];
  while (pending.length) {
    const current = pending.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    const commit = graph.get(current)!;
    pending.push(...commit.parents.map(parent => head.algorithm + ":" + parent));
  }
  return result;
}
function bestMergeBases(base: PinnedOidDto, tip: PinnedOidDto, graph: Map<string, ValidatedCommit>): string[] {
  const a = ancestorSet(base, graph); const b = ancestorSet(tip, graph);
  const common = [...a].filter(k => b.has(k));
  const dominated = new Set<string>();
  for (const current of common) {
    // Common ancestry is closed under parents; mark direct parents once (linear work).
    for (const parent of graph.get(current)!.parents) dominated.add(base.algorithm + ":" + parent);
  }
  return common.filter(k => !dominated.has(k)).sort();
}

interface TreeFile { readonly mode: string; readonly oid: PinnedOidDto; }
/** Convert the explicitly encoded wire path to the lossless tree byte-string. */
function pathBytes(path: string, encoding: DerivedDiffDto["pathEncoding"]): string {
  const bytes = Buffer.from(path, encoding === "base64url" ? "base64url" : "utf8");
  if (bytes.toString(encoding) !== path || !bytes.length || bytes.includes(0) || bytes[0] === 47
    || bytes.toString("latin1").split("/").some(part => !part || part === "." || part === "..")) {
    throw new ComparisonError("derivation-failed: malformed encoded Git path");
  }
  return bytes.toString("latin1");
}
async function treeInventory(root: PinnedOidDto, objects: ComparisonObjectsPort): Promise<Map<string, TreeFile>> {
  const files = new Map<string, TreeFile>();
  const pending = [{ tree: root, prefix: "" }];
  while (pending.length) {
    const { tree, prefix } = pending.pop()!;
    const entries = (await verifyGitObject(tree, objects, "tree")).entries!;
    for (const entry of entries) {
      const path = prefix + entry.name; // lossless Latin-1 byte-path representation
      if (entry.mode === "40000") pending.push({ tree: entry.oid, prefix: path + "/" });
      else files.set(path, { mode: entry.mode, oid: entry.oid });
    }
  }
  return files;
}

/** The denominator comes from validated tree contents, independently of the provider's arrays. */
async function verifyDiffManifest(diff: DerivedDiffDto, objects: ComparisonObjectsPort): Promise<boolean> {
  const before = await treeInventory(diff.beforeTree, objects);
  const after = await treeInventory(diff.afterTree, objects);
  const changed = new Set([...before.keys(), ...after.keys()].filter(path => {
    const a = before.get(path), b = after.get(path);
    return !a || !b || a.mode !== b.mode || !sameOid(a.oid, b.oid);
  }));
  const coveredBefore = new Set<string>(), coveredAfter = new Set<string>();
  for (const encoded of diff.changes) {
    const change = { ...encoded, beforePath: encoded.beforePath === null ? null : pathBytes(encoded.beforePath, diff.pathEncoding),
      afterPath: encoded.afterPath === null ? null : pathBytes(encoded.afterPath, diff.pathEncoding) };
    const a = change.beforePath === null ? undefined : before.get(change.beforePath);
    const b = change.afterPath === null ? undefined : after.get(change.afterPath);
    if (change.beforePath !== null && (!a || a.mode !== change.beforeMode || !changed.has(change.beforePath)
      || coveredBefore.has(change.beforePath))) return false;
    if (change.afterPath !== null && (!b || b.mode !== change.afterMode || !changed.has(change.afterPath)
      || coveredAfter.has(change.afterPath))) return false;
    if (change.changeKind === "added" && before.has(change.afterPath!)) return false;
    if (change.changeKind === "deleted" && after.has(change.beforePath!)) return false;
    if (change.changeKind === "renamed" && (after.has(change.beforePath!) || before.has(change.afterPath!))) return false;
    if ((change.changeKind === "modified" || change.changeKind === "typechange") && change.beforePath !== change.afterPath) return false;
    const entryType = (mode: string) => mode === "100644" || mode === "100755" ? "file" : mode;
    if (a && b && (change.changeKind === "typechange" ? entryType(a.mode) === entryType(b.mode)
      : change.changeKind === "modified" && entryType(a.mode) !== entryType(b.mode))) return false;
    if (change.beforePath !== null) coveredBefore.add(change.beforePath);
    if (change.afterPath !== null) coveredAfter.add(change.afterPath);
  }
  return [...changed].every(path => (!before.has(path) || coveredBefore.has(path)) && (!after.has(path) || coveredAfter.has(path)))
    && diff.changes.length > 0 === (changed.size > 0);
}

export async function compareBranches(input: CompareBranchesInput, ports: CompareBranchesPorts): Promise<BranchComparisonOutcome> {
  input = structuredClone(input);
  if (!input || !input.scope?.tenant || !input.scope.clone || !ports?.objects) throw new ComparisonError("comparison requires scope and retained objects");
  const { endpoints } = input;
  checkOid(endpoints.baseTip); checkOid(endpoints.branchTip);
  if (endpoints.baseTip.algorithm !== endpoints.branchTip.algorithm) throw new ComparisonError("object-invalid: mixed object formats");
  if (!["contribution", "current-diff", "merge-parent"].includes(input.kind) || !Array.isArray(endpoints.mergeBases)) throw new ComparisonError("invalid comparison contract");
  endpoints.mergeBases.forEach(checkOid);
  const parents = [...(input.mergeParents ?? [])]; parents.forEach(checkOid);
  const diffs: DerivedDiffDto[] = []; const perParent: PerParentComparisonDto[] = [];
  let verifiedBases: PinnedOidDto[] = [];
  let ancestryGap: string | null = null;
  let baseSource: ComparisonBaseSource | null = null;
  function outcome(state: ComparisonState, reason: string): BranchComparisonOutcome {
    return { ...endpoints, baseSource, mergeBases: verifiedBases, kind: input.kind, state, diffs, perParent,
      coverage: { axis: "dag", state: state === "complete" ? "current" : state === "partial" ? "partial" : "unavailable", reason } };
  }
  const options = input.diffOptions === undefined || input.diffOptions === null ? DEFAULT_DIFF_OPTIONS : input.diffOptions;
  if (typeof options.algorithm !== "string" || !["histogram", "minimal", "myers", "patience"].includes(options.algorithm)
    || typeof options.binaryDetection !== "boolean" || !Number.isInteger(options.renameLimit) || options.renameLimit! < 0
    || !Number.isInteger(options.renameThreshold) || options.renameThreshold! < 0 || options.renameThreshold! > 100) {
    return outcome("partial", "configuration-invalid: explicit complete diff options required");
  }
  const candidates = input.baseCandidates;
  if (!candidates) return outcome("partial", "configuration-unavailable: base candidates required");
  const selected = candidates.override ?? candidates.prBase ?? candidates.defaultBase;
  if (!selected) return outcome("partial", "configuration-unavailable: no comparison base candidate");
  checkOid(selected);
  baseSource = candidates.override ? "override" : candidates.prBase ? "pr-base" : "default-base";
  if (!sameOid(selected, endpoints.baseTip)) return outcome("partial", "configuration-invalid: selected comparison base differs from pinned endpoint");
  try {
    const algorithm = endpoints.baseTip.algorithm;
    const base = (await verifyGitObject(endpoints.baseTip, ports.objects, "commit")).commit!;
    const tip = (await verifyGitObject(endpoints.branchTip, ports.objects, "commit")).commit!;
    const treeOf = (commit: ValidatedCommit): PinnedOidDto => ({ algorithm, oid: commit.tree });
    const pairs: { before: PinnedOidDto; after: PinnedOidDto; index: number | null }[] = [];
    let graph: Map<string, ValidatedCommit> | null = null;
    try { graph = await verifyCommitGraph([endpoints.baseTip, endpoints.branchTip], ports.objects); }
    catch (error) { ancestryGap = error instanceof ComparisonError && error.message.startsWith("shallow-history:")
      ? error.message : "bounds-unknown: " + String(error); }
    if (input.ancestry?.status === "unknown") ancestryGap = "bounds-unknown: ancestry explicitly incomplete";
    if (graph) {
      const computed = bestMergeBases(endpoints.baseTip, endpoints.branchTip, graph);
      const claimed = endpoints.mergeBases.map(key).sort();
      if (computed.length !== claimed.length || computed.some((k, i) => k !== claimed[i]) || new Set(claimed).size !== claimed.length) {
        return outcome("partial", "result-missing: merge-base set differs from verified ancestry");
      }
      verifiedBases = endpoints.mergeBases.map(base => ({ ...base }));
    }
    if (input.kind === "contribution") {
      if (ancestryGap || !graph) return outcome("unknown", ancestryGap ?? "bounds-unknown: no verified graph");
      if (!verifiedBases.length) return outcome("unrelated", "unrelated-histories: complete validated ancestry has no merge-base");
      for (const mergeBase of verifiedBases) pairs.push({ before: treeOf(graph.get(key(mergeBase))!), after: treeOf(tip), index: null });
    } else if (input.kind === "current-diff") {
      pairs.push({ before: treeOf(base), after: treeOf(tip), index: null });
    } else {
      if (!Array.isArray(input.mergeParents) || !input.targetCommit) return outcome("partial", "result-missing: authoritative target and parent list required");
      if (graph && !ancestorSet(endpoints.branchTip, graph).has(key(input.targetCommit))) {
        return outcome("partial", "result-missing: target commit is outside the compared branch ancestry");
      }
      const target = (await verifyGitObject(input.targetCommit, ports.objects, "commit")).commit!;
      if (input.targetCommit.algorithm !== algorithm || target.parents.length !== parents.length
        || parents.some((p, i) => p.algorithm !== algorithm || p.oid !== target.parents[i])) return outcome("partial", "result-missing: target parent order differs");
      if (!parents.length) {
        if (input.isRoot !== true || !input.emptyTree) return outcome("partial", "result-missing: root requires an explicit empty tree");
        const empty = await verifyGitObject(input.emptyTree, ports.objects, "tree");
        if (empty.entries!.length) return outcome("partial", "object-invalid: claimed empty tree contains entries");
        pairs.push({ before: input.emptyTree, after: treeOf(target), index: null });
      } else {
        for (const [index, parent] of parents.entries()) {
          const before = (await verifyGitObject(parent, ports.objects, "commit")).commit!;
          pairs.push({ before: treeOf(before), after: treeOf(target), index });
        }
      }
    }
    for (const pair of pairs) {
      if (pair.before.algorithm !== pair.after.algorithm) return outcome("partial", "object-invalid: mixed tree formats");
      await verifyGitObject(pair.before, ports.objects, "tree");
      await verifyGitObject(pair.after, ports.objects, "tree");
      if (!ports.comparator?.compare) return outcome("partial", "comparison-provider-unavailable: no deterministic comparator");
      const diff = structuredClone(await ports.comparator.compare(structuredClone({ beforeTree: pair.before, afterTree: pair.after, parentIndex: pair.index, options })));
      const rejected = checkDiff(diff, pair.before, pair.after, pair.index, options);
      if (rejected) return outcome("partial", rejected);
      if (!await verifyDiffManifest(diff, ports.objects)) return outcome("partial", "result-missing: changed-file manifest differs from verified tree contents");
      diffs.push(diff);
      if (pair.index !== null) perParent.push({ parentIndex: pair.index, parent: parents[pair.index]!, target: input.targetCommit!, state: "complete", reason: "validated parent pair derived", diff });
    }
    if (ancestryGap) return outcome("partial", ancestryGap + "; requested tree pairs derived, aggregate history remains incomplete");
    return outcome("complete", input.kind + " comparison: every required tree pair validated and derived (" + COMPARISON_COMPARATOR_VERSION
      + "; Git versions: " + [...new Set(diffs.map(diff => diff.gitVersion))].join(", ") + ")");
  } catch (error) {
    return outcome("partial", error instanceof Error ? error.message : "derivation-failed: " + String(error));
  }
}
function checkDiff(diff: DerivedDiffDto, before: PinnedOidDto, after: PinnedOidDto, index: number | null, options: NonNullable<CompareBranchesInput["diffOptions"]>): string | null {
  if (!diff || diff.derived !== true || !sameOid(diff.beforeTree, before) || !sameOid(diff.afterTree, after)
    || diff.parentIndex !== index || diff.comparatorVersion !== COMPARISON_COMPARATOR_VERSION
    || typeof diff.gitVersion !== "string" || !/^git\/\d+\.\d+(?:\.\d+)?(?:[.\w+-]*)$/.test(diff.gitVersion)
    || !["utf8", "base64url"].includes(diff.pathEncoding) || diff.objectFormat !== before.algorithm
    || !diff.options || Object.keys(diff.options).sort().join(",") !== "algorithm,binaryDetection,renameLimit,renameThreshold"
    || diff.options.algorithm !== options.algorithm || diff.options.binaryDetection !== options.binaryDetection
    || diff.options.renameLimit !== options.renameLimit || diff.options.renameThreshold !== options.renameThreshold) {
    return "comparison-provider-unavailable: pair/version/options evidence mismatch";
  }
  if (!Array.isArray(diff.changes)) return "derivation-failed: no changed-file derivation";
  for (const change of diff.changes) {
    if (!change || !["added", "deleted", "modified", "renamed", "typechange"].includes(change.changeKind)
      || !Number.isInteger(change.insertions) || change.insertions < 0 || !Number.isInteger(change.deletions) || change.deletions < 0
      || typeof change.binary !== "boolean") return "derivation-failed: malformed changed-file facts";
    const path = (p: unknown): boolean => typeof p === "string" && p.length > 0 && !p.includes("\0");
    const mode = (m: unknown): boolean => typeof m === "string" && /^(100644|100755|120000|160000)$/.test(m);
    if (change.changeKind === "added" ? change.beforePath !== null || change.beforeMode !== null || !path(change.afterPath) || !mode(change.afterMode)
      : change.changeKind === "deleted" ? change.afterPath !== null || change.afterMode !== null || !path(change.beforePath) || !mode(change.beforeMode)
      : !path(change.beforePath) || !path(change.afterPath) || !mode(change.beforeMode) || !mode(change.afterMode)) return "derivation-failed: path/mode mismatch";
    if (change.changeKind === "renamed" && !change.renameEvidence) return "derivation-failed: rename evidence missing";
  }
  return null;
}
