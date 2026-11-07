import { execFileSync } from "node:child_process";
import { resolve, relative, basename, dirname, extname, sep, isAbsolute } from "node:path";
import { unionExtractionCitations } from "./citations.js";
import { type JsonValue, toJsonValue } from "./json-value.js";
import { makeNodeId } from "./node-id.js";
import { canonicalBytes } from "./ontology-guardian/canonical.js";
import { repoKey, commitId, branchId } from "./repo-key.js";
import type {
  Extraction,
  ExtractionProvenance,
  GitDetectionWindow,
  GraphEdge,
  GraphNode,
  Hyperedge,
  OntologyCanonicalEntity,
  OntologyCitation,
  OntologyEvidenceRecord,
  OntologyMapping,
  OntologyMention,
  OntologyOccurrence,
  OntologyProfile,
} from "./types.js";

export const GIT_EXTRACT_ADAPTER_VERSION = "graphify-git/1";

const DEFAULT_ACTIVE_WITHIN_DAYS = 30;

export const CODE_GIT_ONTOLOGY_PROFILE: OntologyProfile = {
  id: "code-git",
  version: 1,
  node_types: {
    Commit: {
      aliases: ["git commit", "revision"],
      source_backed: true,
    },
    Branch: {
      aliases: ["git branch", "ref"],
      source_backed: true,
    },
    // Conservative compatibility type for MODIFIES targets. Existing AST file
    // nodes do not yet stamp node_type="File", but profile validation needs a
    // declared endpoint rather than an open-world reference.
    File: {
      aliases: ["source file"],
      source_backed: true,
    },
  },
  relation_types: {
    PARENT_OF: {
      source: "Commit",
      target: "Commit",
      derivation_method: "git_parent",
    },
    ON_BRANCH: {
      source: "Commit",
      target: "Branch",
      derivation_method: "git_ref",
    },
    MODIFIES: {
      source: "Commit",
      target: "File",
      derivation_method: "git_numstat",
    },
  },
};

export interface ExtractGitOptions {
  branches?: string[];
  maxCommits?: number;
  sinceDays?: number;
  activeWithinDays?: number;
  observedAt?: string;
  fileNodeIds?: Map<string, string> | Record<string, string>;
}

interface CommitInfo {
  sha: string;
  parents: string[];
  author: string;
  authoredAt: string;
  messageSummary: string;
  messageLength: number;
}

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const maybe = err as { status?: number; stdout?: string | Buffer };
    if (maybe.status === 0 && maybe.stdout !== undefined) {
      return String(maybe.stdout).trim();
    }
    throw err;
  }
}

function tryGit(cwd: string, args: string[]): string | null {
  try {
    return runGit(cwd, args);
  } catch {
    return null;
  }
}

function emptyExtraction(): Extraction {
  return {
    nodes: [],
    edges: [],
    input_tokens: 0,
    output_tokens: 0,
  };
}

function isGitRepo(root: string): boolean {
  return tryGit(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
}

function gitRoot(root: string): string {
  return tryGit(root, ["rev-parse", "--show-toplevel"]) ?? resolve(root);
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

/** An explicitly bounded request: the only case where a commit cap applies. */
function explicitMaxCommits(options: ExtractGitOptions): number | undefined {
  if (options.maxCommits === undefined || !Number.isFinite(options.maxCommits)) return undefined;
  return Math.max(1, Math.floor(options.maxCommits));
}

/** An explicitly age-bounded request: the only case where an age cap applies. */
function explicitSinceDays(options: ExtractGitOptions): number | undefined {
  if (options.sinceDays === undefined || !Number.isFinite(options.sinceDays) || options.sinceDays <= 0) return undefined;
  return Math.floor(options.sinceDays);
}

function defaultBranch(root: string, current: string | null): string | null {
  const remoteHead = tryGit(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (remoteHead) {
    return remoteHead.replace(/^origin\//, "");
  }
  return current;
}

function discoverBranches(root: string, options: ExtractGitOptions): string[] {
  if (options.branches && options.branches.length > 0) {
    return [...new Set(options.branches.filter((branch) => branch.trim().length > 0))].sort();
  }

  const current = tryGit(root, ["branch", "--show-current"]);
  const def = defaultBranch(root, current);
  const activeWithinDays = positiveInteger(options.activeWithinDays, DEFAULT_ACTIVE_WITHIN_DAYS);
  const cutoff = Date.now() - activeWithinDays * 24 * 60 * 60 * 1000;
  const branches = new Set<string>();
  if (def) branches.add(def);
  if (current) branches.add(current);

  const refs = tryGit(root, [
    "for-each-ref",
    "--format=%(refname:short)%00%(committerdate:iso-strict)",
    "refs/heads",
  ]);
  for (const line of refs?.split("\n") ?? []) {
    if (!line.trim()) continue;
    const [name, date] = line.split("\0");
    if (!name) continue;
    const time = Date.parse(date ?? "");
    if (Number.isFinite(time) && time >= cutoff) {
      branches.add(name);
    }
  }

  return [...branches].sort();
}

function revList(root: string, branch: string, options: ExtractGitOptions): string[] {
  const args = ["rev-list"];
  const maxCommits = explicitMaxCommits(options);
  if (maxCommits !== undefined) {
    args.push(`--max-count=${maxCommits}`);
  }
  const sinceDays = explicitSinceDays(options);
  if (sinceDays !== undefined) {
    args.push(`--since=${sinceDays} days ago`);
  }
  args.push(branch);
  const out = tryGit(root, args);
  return out ? out.split("\n").filter(Boolean) : [];
}

function readCommit(root: string, sha: string): CommitInfo | null {
  const out = tryGit(root, ["show", "-s", "--format=%H%x00%P%x00%an <%ae>%x00%aI%x00%s%x00%B", sha]);
  if (!out) return null;
  const parts = out.split("\0");
  const fullMessage = parts.slice(5).join("\0");
  return {
    sha: parts[0] ?? sha,
    parents: (parts[1] ?? "").split(" ").filter(Boolean),
    author: parts[2] ?? "",
    authoredAt: parts[3] ?? "",
    messageSummary: parts[4] ?? "",
    messageLength: fullMessage.length,
  };
}

function portablePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Twin of the extractor's `_makeId`: `codeFileNodeId` must resolve to exactly
 * the file node id the extractor emits, so both share one implementation.
 */
const makeId = makeNodeId;

function qualifiedFileStem(filePath: string, rootDir: string): string {
  const resolved = resolve(filePath);
  const stem = basename(resolved, extname(resolved));
  const parentDir = dirname(resolved);
  if (resolve(parentDir) === resolve(rootDir)) return stem;
  const parent = basename(parentDir);
  return parent ? `${parent}.${stem}` : stem;
}

export function codeFileNodeId(repoRoot: string, filePath: string): string {
  const absolute = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
  return makeId(qualifiedFileStem(absolute, repoRoot));
}

export function buildCodeFileNodeIdMap(repoRoot: string, files: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    const rel = portablePath(relative(repoRoot, isAbsolute(file) ? file : resolve(repoRoot, file)));
    if (!rel || rel.startsWith("..") || rel.split(sep).includes("..")) continue;
    map.set(rel, codeFileNodeId(repoRoot, file));
  }
  return map;
}

function lookupFileNodeId(
  fileNodeIds: ExtractGitOptions["fileNodeIds"],
  path: string,
  root: string,
): string | null {
  const portable = portablePath(path);
  if (!fileNodeIds) return codeFileNodeId(root, portable);
  if (fileNodeIds instanceof Map) {
    return fileNodeIds.get(portable) ?? fileNodeIds.get(resolve(root, portable)) ?? null;
  }
  return fileNodeIds[portable] ?? fileNodeIds[resolve(root, portable)] ?? null;
}

function parseNumstatPath(raw: string): string {
  return portablePath(raw.replace(/\{([^{}]*) => ([^{}]*)\}/g, "$2"));
}

function readModifiesEdges(
  root: string,
  repo: string,
  sha: string,
  repoKeyStr: string,
  fileNodeIds: ExtractGitOptions["fileNodeIds"],
): GraphEdge[] {
  const out = tryGit(root, ["show", "--numstat", "--format=", "--find-renames", "--find-copies", sha]);
  const edges: GraphEdge[] = [];
  for (const line of out?.split("\n") ?? []) {
    if (!line.trim()) continue;
    const [addedRaw, deletedRaw, pathRaw] = line.split("\t");
    if (!pathRaw || addedRaw === "-" || deletedRaw === "-") continue;
    const filePath = parseNumstatPath(pathRaw);
    const target = lookupFileNodeId(fileNodeIds, filePath, repo);
    if (!target) continue;
    edges.push({
      source: commitId(repoKeyStr, sha),
      target,
      relation: "MODIFIES",
      confidence: "EXTRACTED",
      source_file: filePath,
      added: Number.parseInt(addedRaw ?? "0", 10) || 0,
      deleted: Number.parseInt(deletedRaw ?? "0", 10) || 0,
      file_path: filePath,
    });
  }
  return edges;
}

function commitNode(repoKeyStr: string, info: CommitInfo): GraphNode {
  const short = info.sha.slice(0, 7);
  return {
    id: commitId(repoKeyStr, info.sha),
    label: info.messageSummary ? `${short} ${info.messageSummary}` : short,
    file_type: "concept",
    source_file: "git",
    node_type: "Commit",
    repo: repoKeyStr,
    sha: info.sha,
    author: info.author,
    authoredAt: info.authoredAt,
    message_summary: info.messageSummary,
    message_length: info.messageLength,
    parents: info.parents,
  };
}

function branchNode(repoKeyStr: string, name: string, headSha: string | undefined): GraphNode {
  return {
    id: branchId(repoKeyStr, name),
    label: name,
    file_type: "concept",
    source_file: "git",
    node_type: "Branch",
    repo: repoKeyStr,
    branch_name: name,
    ...(headSha ? { head_sha: headSha } : {}),
  };
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.source}\0${edge.target}\0${edge.relation}\0${String(edge.source_file ?? "")}`;
}

export function mergeExtractions(base: Extraction, extra: Extraction): Extraction {
  const nodes = new Map<string, GraphNode>();
  for (const node of [...(base.nodes ?? []), ...(extra.nodes ?? [])]) {
    nodes.set(node.id, node);
  }
  const edges = new Map<string, GraphEdge>();
  for (const edge of [...(base.edges ?? []), ...(extra.edges ?? [])]) {
    edges.set(edgeKey(edge), edge);
  }
  return {
    ...(extra.provenance ? { provenance: extra.provenance } : base.provenance ? { provenance: base.provenance } : {}),
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    hyperedges: [...(base.hyperedges ?? []), ...(extra.hyperedges ?? [])],
    input_tokens: (base.input_tokens ?? 0) + (extra.input_tokens ?? 0),
    output_tokens: (base.output_tokens ?? 0) + (extra.output_tokens ?? 0),
  };
}

export interface MergeExtractionsOptions {
  /**
   * Edge identity scope. Default "per-source-file": (source, target, relation,
   * source_file) — keyed as today (src/extract-git.ts:307). "cross-document"
   * keys on (source, target, relation) and unions citations across files (§4(d).2).
   */
  readonly edgeKeyScope?: "per-source-file" | "cross-document";
}

export type ExtractionMergeConflictKind =
  | "node"
  | "edge"
  | "hyperedge"
  | "canonical_entity"
  | "mention"
  | "occurrence"
  | "evidence"
  | "mapping"
  | "provenance";

export interface ExtractionMergeConflict {
  readonly kind: ExtractionMergeConflictKind;
  /** Node/record id; for edges `${source}\0${target}\0${relation}` (+ `\0${source_file}` per-file scope); "provenance" for provenance. */
  readonly id: string;
  /** Dotted field path from the item root, e.g. "label", "properties.montant". */
  readonly field: string;
  /** Distinct candidate values as canonicalBytes renderings, code-unit sorted. JSON-safe by construction. */
  readonly values: readonly string[];
  /** Winning value, same rendering. The live value sits on the merged item. */
  readonly resolved: string;
  /** Distinct source_file values of the contributing copies, code-unit sorted ([""] when absent). */
  readonly sourceFiles: readonly string[];
}

export interface MergeExtractionsResult {
  readonly extraction: Extraction;
  readonly conflicts: readonly ExtractionMergeConflict[];
}

function isWellFormedString(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const unit = s.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) return false;
      i++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  return true;
}

function defineOwnProp(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function cloneJson(value: JsonValue): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => cloneJson(item));
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    defineOwnProp(out, key, cloneJson((value as Record<string, JsonValue>)[key]!));
  }
  return out;
}

function getOwnEnumerable(obj: Record<string, unknown>, key: string): { present: boolean; value: unknown } {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (!desc || !desc.enumerable || !("value" in desc) || desc.value === undefined) {
    return { present: false, value: undefined };
  }
  return { present: true, value: desc.value };
}

function collectGroupSourceFiles(copies: readonly Record<string, unknown>[]): readonly string[] {
  const files = new Set<string>();
  for (const copy of copies) {
    const sf = getOwnEnumerable(copy, "source_file");
    if (sf.present && typeof sf.value === "string" && sf.value.length > 0 && isWellFormedString(sf.value)) {
      files.add(sf.value);
    }
  }
  if (files.size === 0) {
    return Object.freeze([""]);
  }
  return Object.freeze([...files].sort());
}

function createFrozenConflict(
  kind: ExtractionMergeConflictKind,
  id: string,
  field: string,
  values: readonly string[],
  resolved: string,
  sourceFiles: readonly string[],
): ExtractionMergeConflict {
  return Object.freeze({
    kind,
    id,
    field,
    values: Object.freeze([...values]),
    resolved,
    sourceFiles,
  });
}

function confidenceLatticeRank(value: JsonValue): number {
  if (value === "EXTRACTED") return 3;
  if (value === "INFERRED") return 2;
  if (value === "AMBIGUOUS") return 1;
  return 0;
}

interface AncestorScopedRecord {
  readonly obj: Record<string, unknown>;
  readonly ancestors: ReadonlySet<object>;
}

const PLAIN_STRING_SET_FIELDS = new Set<string>([
  "evidence_refs",
  "registry_refs",
  "linked_entity_ids",
  "source_refs",
]);

function resolveNestedField(
  entries: readonly AncestorScopedRecord[],
  key: string,
  fieldPath: string,
  kind: ExtractionMergeConflictKind,
  itemKey: string,
  sourceFiles: readonly string[],
  conflicts: ExtractionMergeConflict[],
  emitConflict: boolean,
): { hasValue: boolean; value?: unknown } {
  if (!isWellFormedString(key)) {
    return { hasValue: false };
  }

  const rawPresent: { value: unknown; ancestors: ReadonlySet<object> }[] = [];
  for (const entry of entries) {
    const prop = getOwnEnumerable(entry.obj, key);
    if (!prop.present) continue;
    const v = prop.value;
    if (typeof v === "object" && v !== null && entry.ancestors.has(v)) {
      continue;
    }
    rawPresent.push({ value: v, ancestors: entry.ancestors });
  }

  if (rawPresent.length === 0) {
    return { hasValue: false };
  }

  // Partition into absent-like (null or "") vs non-absent candidates.
  const absentCandidates: { value: JsonValue; rendering: string }[] = [];
  const nonAbsentRaw: { value: unknown; ancestors: ReadonlySet<object> }[] = [];

  for (const cand of rawPresent) {
    if (cand.value === null || cand.value === "") {
      absentCandidates.push({
        value: cand.value,
        rendering: canonicalBytes(cand.value),
      });
    } else {
      nonAbsentRaw.push(cand);
    }
  }

  if (nonAbsentRaw.length === 0) {
    if (absentCandidates.length === 0) {
      return { hasValue: false };
    }
    let best = absentCandidates[0]!;
    for (let i = 1; i < absentCandidates.length; i++) {
      const c = absentCandidates[i]!;
      if (c.rendering < best.rendering) {
        best = c;
      }
    }
    return { hasValue: true, value: best.value };
  }

  // Separate valid plain-object candidates from projectable non-object leaf candidates;
  // unprojectable non-plain values fail §0.2 projection and count as absent (§4(c)).
  const plainChildren: AncestorScopedRecord[] = [];
  const leafByRendering = new Map<string, JsonValue>();

  for (const cand of nonAbsentRaw) {
    if (isPlainRecord(cand.value)) {
      const nextAncestors = new Set<object>(cand.ancestors);
      nextAncestors.add(cand.value);
      plainChildren.push({ obj: cand.value, ancestors: nextAncestors });
    } else {
      const proj = toJsonValue(cand.value);
      if (!proj.ok) continue;
      const rendering = canonicalBytes(proj.value);
      if (!leafByRendering.has(rendering)) {
        leafByRendering.set(rendering, proj.value);
      }
    }
  }

  if (plainChildren.length > 0 && leafByRendering.size === 0) {
    const childKeySet = new Set<string>();
    let hadEmptyPlainObject = false;
    for (const child of plainChildren) {
      const ownNames = Object.getOwnPropertyNames(child.obj);
      let enumerableCount = 0;
      for (const ck of ownNames) {
        if (!isWellFormedString(ck)) continue;
        const prop = getOwnEnumerable(child.obj, ck);
        if (prop.present) {
          childKeySet.add(ck);
          enumerableCount++;
        }
      }
      if (enumerableCount === 0) {
        hadEmptyPlainObject = true;
      }
    }
    const sortedChildKeys = [...childKeySet].sort();
    const mergedObj: Record<string, unknown> = {};
    let definedCount = 0;
    for (const ck of sortedChildKeys) {
      const childPath = `${fieldPath}.${ck}`;
      const childRes = resolveNestedField(
        plainChildren,
        ck,
        childPath,
        kind,
        itemKey,
        sourceFiles,
        conflicts,
        emitConflict,
      );
      if (childRes.hasValue) {
        defineOwnProp(mergedObj, ck, childRes.value);
        definedCount++;
      }
    }
    if (definedCount > 0 || hadEmptyPlainObject) {
      return { hasValue: true, value: mergedObj };
    }
    if (absentCandidates.length > 0) {
      let best = absentCandidates[0]!;
      for (let i = 1; i < absentCandidates.length; i++) {
        const c = absentCandidates[i]!;
        if (c.rendering < best.rendering) best = c;
      }
      return { hasValue: true, value: best.value };
    }
    return { hasValue: false };
  }

  // Leaf rule (all non-object leaves, or mixed plain-object and non-object leaf candidates).
  const byRendering = new Map<string, JsonValue>(leafByRendering);
  for (const child of plainChildren) {
    const proj = toJsonValue(child.obj);
    if (!proj.ok) continue;
    const rendering = canonicalBytes(proj.value);
    if (!byRendering.has(rendering)) {
      byRendering.set(rendering, proj.value);
    }
  }

  if (byRendering.size === 0) {
    if (absentCandidates.length === 0) {
      return { hasValue: false };
    }
    let best = absentCandidates[0]!;
    for (let i = 1; i < absentCandidates.length; i++) {
      const c = absentCandidates[i]!;
      if (c.rendering < best.rendering) best = c;
    }
    return { hasValue: true, value: best.value };
  }

  const sortedRenderings = [...byRendering.keys()].sort();
  const winnerRendering = sortedRenderings[0]!;
  const winnerValue = byRendering.get(winnerRendering)!;

  if (emitConflict && sortedRenderings.length >= 2) {
    conflicts.push(
      createFrozenConflict(kind, itemKey, fieldPath, sortedRenderings, winnerRendering, sourceFiles),
    );
  }

  return { hasValue: true, value: cloneJson(winnerValue) };
}

function resolveConfidenceField(
  copies: readonly Record<string, unknown>[],
  kind: ExtractionMergeConflictKind,
  itemKey: string,
  sourceFiles: readonly string[],
  conflicts: ExtractionMergeConflict[],
): { hasValue: boolean; value?: unknown } {
  const absentCandidates: { value: JsonValue; rendering: string }[] = [];
  const nonAbsentByRendering = new Map<string, JsonValue>();

  for (const copy of copies) {
    const prop = getOwnEnumerable(copy, "confidence");
    if (!prop.present) continue;
    const proj = toJsonValue(prop.value);
    if (!proj.ok) continue;
    const rendering = canonicalBytes(proj.value);
    if (proj.value === null || proj.value === "") {
      absentCandidates.push({ value: proj.value, rendering });
    } else if (!nonAbsentByRendering.has(rendering)) {
      nonAbsentByRendering.set(rendering, proj.value);
    }
  }

  if (nonAbsentByRendering.size === 0) {
    if (absentCandidates.length === 0) {
      return { hasValue: false };
    }
    let best = absentCandidates[0]!;
    for (let i = 1; i < absentCandidates.length; i++) {
      const c = absentCandidates[i]!;
      if (c.rendering < best.rendering) best = c;
    }
    return { hasValue: true, value: best.value };
  }

  const entries = [...nonAbsentByRendering.entries()].map(([rendering, value]) => ({
    rendering,
    value,
    latticeRank: confidenceLatticeRank(value),
  }));

  // Total order:
  // 1) Confidence strings: EXTRACTED(3) > INFERRED(2) > AMBIGUOUS(1)
  // 2) Other strings: maximum by code-unit order
  // 3) Non-strings: minimum by canonicalBytes rendering
  const latticeEntries = entries.filter((e) => e.latticeRank > 0);
  const otherStringEntries = entries.filter((e) => e.latticeRank === 0 && typeof e.value === "string");

  let winner = entries[0]!;
  if (latticeEntries.length > 0) {
    winner = latticeEntries[0]!;
    for (let i = 1; i < latticeEntries.length; i++) {
      const cand = latticeEntries[i]!;
      if (cand.latticeRank > winner.latticeRank) {
        winner = cand;
      }
    }
  } else if (otherStringEntries.length > 0) {
    winner = otherStringEntries[0]!;
    for (let i = 1; i < otherStringEntries.length; i++) {
      const cand = otherStringEntries[i]!;
      if ((cand.value as string) > (winner.value as string)) {
        winner = cand;
      }
    }
  } else {
    winner = entries[0]!;
    for (let i = 1; i < entries.length; i++) {
      const cand = entries[i]!;
      if (cand.rendering < winner.rendering) {
        winner = cand;
      }
    }
  }

  const hasNonConfidenceCompetitor = entries.some((e) => e.latticeRank === 0);
  if (entries.length >= 2 && hasNonConfidenceCompetitor) {
    const sortedRenderings = entries.map((e) => e.rendering).sort();
    conflicts.push(
      createFrozenConflict(kind, itemKey, "confidence", sortedRenderings, winner.rendering, sourceFiles),
    );
  }

  return { hasValue: true, value: cloneJson(winner.value) };
}

function mergeItemGroup(
  kind: Exclude<ExtractionMergeConflictKind, "provenance">,
  itemKey: string,
  copies: readonly Record<string, unknown>[],
  conflicts: ExtractionMergeConflict[],
): Record<string, unknown> {
  const sourceFiles = collectGroupSourceFiles(copies);
  const scopedCopies: AncestorScopedRecord[] = copies.map((obj) => ({
    obj,
    ancestors: new Set<object>([obj]),
  }));

  const merged: Record<string, unknown> = {};

  // 1. Identity fields
  if (kind === "edge") {
    const first = copies[0]!;
    defineOwnProp(merged, "source", getOwnEnumerable(first, "source").value);
    defineOwnProp(merged, "target", getOwnEnumerable(first, "target").value);
    defineOwnProp(merged, "relation", getOwnEnumerable(first, "relation").value);
    const sfRes = resolveNestedField(
      scopedCopies,
      "source_file",
      "source_file",
      kind,
      itemKey,
      sourceFiles,
      conflicts,
      false,
    );
    defineOwnProp(merged, "source_file", sfRes.hasValue && typeof sfRes.value === "string" ? sfRes.value : "");
  } else {
    defineOwnProp(merged, "id", itemKey);
  }

  // 2. label and aliases (§4(d).2 + §4(d).3)
  let winningLabel: unknown = undefined;
  if (copies.some((c) => getOwnEnumerable(c, "label").present)) {
    const labelRes = resolveNestedField(
      scopedCopies,
      "label",
      "label",
      kind,
      itemKey,
      sourceFiles,
      conflicts,
      true,
    );
    if (labelRes.hasValue) {
      winningLabel = labelRes.value;
      defineOwnProp(merged, "label", winningLabel);
    }
  }

  let anyCopyCarriedAliases = false;
  const aliasSet = new Set<string>();
  for (const copy of copies) {
    const lp = getOwnEnumerable(copy, "label");
    if (lp.present && typeof lp.value === "string" && lp.value.length > 0 && isWellFormedString(lp.value)) {
      const normL = lp.value.trim().normalize("NFC");
      if (normL.length > 0) aliasSet.add(normL);
    }
    const ap = getOwnEnumerable(copy, "aliases");
    if (ap.present) {
      anyCopyCarriedAliases = true;
      if (Array.isArray(ap.value)) {
        for (const entry of ap.value) {
          if (typeof entry === "string" && isWellFormedString(entry)) {
            const normA = entry.trim().normalize("NFC");
            if (normA.length > 0) aliasSet.add(normA);
          }
        }
      }
    }
  }
  if (typeof winningLabel === "string" && isWellFormedString(winningLabel)) {
    aliasSet.delete(winningLabel.trim().normalize("NFC"));
  }
  const sortedAliases = [...aliasSet].sort();
  if (sortedAliases.length > 0 || anyCopyCarriedAliases) {
    defineOwnProp(merged, "aliases", sortedAliases);
  }

  // 3. citations and citation_count (§4(d).1, §4(d).2, §4(d).4)
  const citationLists: (readonly OntologyCitation[])[] = [];
  let anyCopyHadCitationsArray = false;
  for (const copy of copies) {
    const cp = getOwnEnumerable(copy, "citations");
    if (cp.present && Array.isArray(cp.value)) {
      anyCopyHadCitationsArray = true;
      citationLists.push(cp.value as readonly OntologyCitation[]);
    }
  }
  const unionedCitations = citationLists.length > 0 ? unionExtractionCitations(citationLists) : [];
  if (unionedCitations.length > 0 || anyCopyHadCitationsArray) {
    defineOwnProp(merged, "citations", unionedCitations);
  }
  if (unionedCitations.length > 0) {
    defineOwnProp(merged, "citation_count", unionedCitations.length);
  } else {
    let hasCount = false;
    let maxCount = 0;
    for (const copy of copies) {
      const ccp = getOwnEnumerable(copy, "citation_count");
      if (ccp.present && typeof ccp.value === "number" && Number.isFinite(ccp.value)) {
        const normalized = Object.is(ccp.value, -0) ? 0 : ccp.value;
        if (!hasCount || normalized > maxCount) {
          hasCount = true;
          maxCount = normalized;
        }
      }
    }
    if (hasCount) {
      defineOwnProp(merged, "citation_count", maxCount);
    }
  }

  // 4. Plain string-set fields (§4(d).2)
  const stringSetFields = kind === "hyperedge" ? [...PLAIN_STRING_SET_FIELDS, "nodes"] : [...PLAIN_STRING_SET_FIELDS];
  for (const sf of stringSetFields) {
    let anyCarried = false;
    const set = new Set<string>();
    for (const copy of copies) {
      const prop = getOwnEnumerable(copy, sf);
      if (!prop.present) continue;
      anyCarried = true;
      if (Array.isArray(prop.value)) {
        for (const el of prop.value) {
          if (typeof el === "string" && isWellFormedString(el)) {
            set.add(el);
          }
        }
      }
    }
    if (anyCarried) {
      defineOwnProp(merged, sf, [...set].sort());
    }
  }

  // 5. assertion_basis (§4(d).2 unconditional set rule)
  let anyCarriedAssertionBasis = false;
  let allCarriedAssertionBasisString = true;
  const basisSet = new Set<string>();
  for (const copy of copies) {
    const ab = getOwnEnumerable(copy, "assertion_basis");
    if (!ab.present) continue;
    anyCarriedAssertionBasis = true;
    if (typeof ab.value === "string") {
      if (isWellFormedString(ab.value)) {
        basisSet.add(ab.value);
      }
    } else {
      allCarriedAssertionBasisString = false;
      if (Array.isArray(ab.value)) {
        for (const el of ab.value) {
          if (typeof el === "string" && isWellFormedString(el)) {
            basisSet.add(el);
          }
        }
      }
    }
  }
  if (anyCarriedAssertionBasis) {
    const sortedBasis = [...basisSet].sort();
    const basisOut = allCarriedAssertionBasisString && sortedBasis.length === 1 ? sortedBasis[0]! : sortedBasis;
    defineOwnProp(merged, "assertion_basis", basisOut);
  }

  // 6. confidence (§4(d).3 total order)
  if (copies.some((c) => getOwnEnumerable(c, "confidence").present)) {
    const confRes = resolveConfidenceField(copies, kind, itemKey, sourceFiles, conflicts);
    if (confRes.hasValue) {
      defineOwnProp(merged, "confidence", confRes.value);
    }
  }

  // 7. All remaining own enumerable keys (§4(d).3)
  const excludedKeys = new Set<string>([
    "label",
    "aliases",
    "citations",
    "citation_count",
    "evidence_refs",
    "registry_refs",
    "linked_entity_ids",
    "source_refs",
    "assertion_basis",
    "confidence",
  ]);
  if (kind === "edge") {
    excludedKeys.add("source");
    excludedKeys.add("target");
    excludedKeys.add("relation");
    excludedKeys.add("source_file");
  } else {
    excludedKeys.add("id");
    if (kind === "hyperedge") {
      excludedKeys.add("nodes");
    }
  }

  const remainingKeySet = new Set<string>();
  for (const copy of copies) {
    for (const k of Object.getOwnPropertyNames(copy)) {
      if (excludedKeys.has(k) || !isWellFormedString(k)) continue;
      if (getOwnEnumerable(copy, k).present) {
        remainingKeySet.add(k);
      }
    }
  }

  const sortedRemainingKeys = [...remainingKeySet].sort();
  for (const k of sortedRemainingKeys) {
    const res = resolveNestedField(scopedCopies, k, k, kind, itemKey, sourceFiles, conflicts, true);
    if (res.hasValue) {
      defineOwnProp(merged, k, res.value);
    }
  }

  return merged;
}

function mergeIdKeyedCollection<T>(
  extractions: readonly Extraction[],
  member:
    | "nodes"
    | "hyperedges"
    | "canonical_entities"
    | "mentions"
    | "occurrences"
    | "evidence"
    | "mappings",
  kind: Exclude<ExtractionMergeConflictKind, "provenance" | "edge">,
  conflicts: ExtractionMergeConflict[],
): { present: boolean; items: T[] } {
  let present = false;
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const ext of extractions) {
    if (!ext || typeof ext !== "object" || Array.isArray(ext)) continue;
    const rawList = (ext as unknown as Record<string, unknown>)[member];
    if (!Array.isArray(rawList)) continue;
    present = true;
    for (const item of rawList) {
      if (!isPlainRecord(item)) continue;
      const idProp = getOwnEnumerable(item, "id");
      if (
        !idProp.present ||
        typeof idProp.value !== "string" ||
        idProp.value.length === 0 ||
        !isWellFormedString(idProp.value)
      ) {
        continue;
      }
      const id = idProp.value;
      let bucket = groups.get(id);
      if (!bucket) {
        bucket = [];
        groups.set(id, bucket);
      }
      bucket.push(item);
    }
  }

  const sortedIds = [...groups.keys()].sort();
  const items: T[] = [];
  for (const id of sortedIds) {
    const copies = groups.get(id)!;
    items.push(mergeItemGroup(kind, id, copies, conflicts) as unknown as T);
  }
  return { present, items };
}

/**
 * N-way citation-preserving merge. Pure and total over `readonly Extraction[]`.
 * Defaults: `edgeKeyScope: "per-source-file"`.
 */
export function mergeExtractionsWithCitations(
  extractions: readonly Extraction[],
  options: MergeExtractionsOptions = {},
): MergeExtractionsResult {
  if (!Array.isArray(extractions) || extractions.length === 0) {
    return {
      extraction: {
        nodes: [],
        edges: [],
        hyperedges: [],
        input_tokens: 0,
        output_tokens: 0,
      },
      conflicts: Object.freeze([]),
    };
  }

  const edgeKeyScope = options?.edgeKeyScope === "cross-document" ? "cross-document" : "per-source-file";
  const conflicts: ExtractionMergeConflict[] = [];

  let inputTokens = 0;
  let outputTokens = 0;

  // Provenance candidates
  const provenanceByRendering = new Map<string, JsonValue>();
  const provenanceCopies: Record<string, unknown>[] = [];

  for (const ext of extractions) {
    if (!ext || typeof ext !== "object" || Array.isArray(ext)) continue;
    if (typeof ext.input_tokens === "number" && Number.isFinite(ext.input_tokens)) {
      inputTokens += Object.is(ext.input_tokens, -0) ? 0 : ext.input_tokens;
    }
    if (typeof ext.output_tokens === "number" && Number.isFinite(ext.output_tokens)) {
      outputTokens += Object.is(ext.output_tokens, -0) ? 0 : ext.output_tokens;
    }
    const provProp = getOwnEnumerable(ext as unknown as Record<string, unknown>, "provenance");
    if (provProp.present && isPlainRecord(provProp.value)) {
      const proj = toJsonValue(provProp.value);
      if (proj.ok && proj.value !== null && typeof proj.value === "object" && !Array.isArray(proj.value)) {
        const rendering = canonicalBytes(proj.value);
        if (!provenanceByRendering.has(rendering)) {
          provenanceByRendering.set(rendering, proj.value);
        }
        provenanceCopies.push(provProp.value);
      }
    }
  }

  let mergedProvenance: ExtractionProvenance | undefined = undefined;
  if (provenanceByRendering.size > 0) {
    const sortedProvRenderings = [...provenanceByRendering.keys()].sort();
    const winningRendering = sortedProvRenderings[0]!;
    mergedProvenance = cloneJson(provenanceByRendering.get(winningRendering)!) as unknown as ExtractionProvenance;
    if (sortedProvRenderings.length >= 2) {
      conflicts.push(
        createFrozenConflict(
          "provenance",
          "provenance",
          "provenance",
          sortedProvRenderings,
          winningRendering,
          collectGroupSourceFiles(provenanceCopies),
        ),
      );
    }
  }

  const nodesMerged = mergeIdKeyedCollection<GraphNode>(extractions, "nodes", "node", conflicts);

  // Edges
  const edgeGroups = new Map<string, Record<string, unknown>[]>();
  for (const ext of extractions) {
    if (!ext || typeof ext !== "object" || Array.isArray(ext)) continue;
    const rawEdges = (ext as unknown as Record<string, unknown>).edges;
    if (!Array.isArray(rawEdges)) continue;
    for (const edge of rawEdges) {
      if (!isPlainRecord(edge)) continue;
      const src = getOwnEnumerable(edge, "source");
      const tgt = getOwnEnumerable(edge, "target");
      const rel = getOwnEnumerable(edge, "relation");
      if (
        !src.present ||
        typeof src.value !== "string" ||
        src.value.length === 0 ||
        !isWellFormedString(src.value) ||
        !tgt.present ||
        typeof tgt.value !== "string" ||
        tgt.value.length === 0 ||
        !isWellFormedString(tgt.value) ||
        !rel.present ||
        typeof rel.value !== "string" ||
        rel.value.length === 0 ||
        !isWellFormedString(rel.value)
      ) {
        continue;
      }
      let key: string;
      if (edgeKeyScope === "cross-document") {
        key = `${src.value}\0${tgt.value}\0${rel.value}`;
      } else {
        const sf = getOwnEnumerable(edge, "source_file");
        let sfStr = "";
        if (sf.present && sf.value !== null) {
          const str = typeof sf.value === "string" ? sf.value : String(sf.value);
          if (!isWellFormedString(str)) continue;
          sfStr = str;
        }
        key = `${src.value}\0${tgt.value}\0${rel.value}\0${sfStr}`;
      }
      let bucket = edgeGroups.get(key);
      if (!bucket) {
        bucket = [];
        edgeGroups.set(key, bucket);
      }
      bucket.push(edge);
    }
  }

  const sortedEdgeKeys = [...edgeGroups.keys()].sort();
  const mergedEdges: GraphEdge[] = [];
  for (const key of sortedEdgeKeys) {
    const copies = edgeGroups.get(key)!;
    mergedEdges.push(mergeItemGroup("edge", key, copies, conflicts) as unknown as GraphEdge);
  }

  const hyperedgesMerged = mergeIdKeyedCollection<Hyperedge>(extractions, "hyperedges", "hyperedge", conflicts);
  const canonicalEntitiesMerged = mergeIdKeyedCollection<OntologyCanonicalEntity>(
    extractions,
    "canonical_entities",
    "canonical_entity",
    conflicts,
  );
  const mentionsMerged = mergeIdKeyedCollection<OntologyMention>(extractions, "mentions", "mention", conflicts);
  const occurrencesMerged = mergeIdKeyedCollection<OntologyOccurrence>(
    extractions,
    "occurrences",
    "occurrence",
    conflicts,
  );
  const evidenceMerged = mergeIdKeyedCollection<OntologyEvidenceRecord>(extractions, "evidence", "evidence", conflicts);
  const mappingsMerged = mergeIdKeyedCollection<OntologyMapping>(extractions, "mappings", "mapping", conflicts);

  conflicts.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    if (a.field !== b.field) return a.field < b.field ? -1 : 1;
    return 0;
  });

  const extractionOut: Extraction = {
    ...(mergedProvenance !== undefined ? { provenance: mergedProvenance } : {}),
    nodes: nodesMerged.items,
    edges: mergedEdges,
    ...(hyperedgesMerged.present ? { hyperedges: hyperedgesMerged.items } : {}),
    ...(canonicalEntitiesMerged.present ? { canonical_entities: canonicalEntitiesMerged.items } : {}),
    ...(mentionsMerged.present ? { mentions: mentionsMerged.items } : {}),
    ...(occurrencesMerged.present ? { occurrences: occurrencesMerged.items } : {}),
    ...(evidenceMerged.present ? { evidence: evidenceMerged.items } : {}),
    ...(mappingsMerged.present ? { mappings: mappingsMerged.items } : {}),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };

  return {
    extraction: extractionOut,
    conflicts: Object.freeze(conflicts),
  };
}

export function detectGitWindow(root: string = ".", options: ExtractGitOptions = {}): GitDetectionWindow | undefined {
  const startRoot = resolve(root);
  if (!isGitRepo(startRoot)) return undefined;
  const repo = gitRoot(startRoot);
  const head = tryGit(repo, ["rev-parse", "HEAD"]);
  if (!head) return undefined;
  const maxCommits = explicitMaxCommits(options);
  const sinceDays = explicitSinceDays(options);
  return {
    source_owner: "git",
    source_hash: head,
    branches: discoverBranches(repo, options),
    // No implicit commit window: the field is claimed only by an explicit
    // bound, and then the history is labelled partial by choice.
    ...(maxCommits !== undefined ? { max_commits: maxCommits, partial: true } : {}),
    // An explicit age bound truncates the walk exactly like a count bound,
    // so it is labelled partial too — never a silent full-history claim.
    ...(sinceDays !== undefined ? { since_days: sinceDays, partial: true } : {}),
    active_within_days: positiveInteger(options.activeWithinDays, DEFAULT_ACTIVE_WITHIN_DAYS),
  };
}

export function extractGit(root: string = ".", options: ExtractGitOptions = {}): Extraction {
  const startRoot = resolve(root);
  if (!isGitRepo(startRoot)) return emptyExtraction();

  const repo = gitRoot(startRoot);
  const head = tryGit(repo, ["rev-parse", "HEAD"]);
  if (!head) return emptyExtraction();

  const repoKeyStr = repoKey(repo);
  const branches = discoverBranches(repo, options);
  const commitsByBranch = new Map<string, string[]>();
  const allShas = new Set<string>();
  for (const branch of branches) {
    const shas = revList(repo, branch, options);
    commitsByBranch.set(branch, shas);
    for (const sha of shas) allShas.add(sha);
  }

  const commitInfos = new Map<string, CommitInfo>();
  for (const sha of [...allShas].sort()) {
    const info = readCommit(repo, sha);
    if (info) commitInfos.set(sha, info);
  }

  const nodes: GraphNode[] = [
    ...[...commitInfos.values()].map((info) => commitNode(repoKeyStr, info)),
    ...branches.map((branch) => branchNode(repoKeyStr, branch, commitsByBranch.get(branch)?.[0])),
  ];

  const includedCommits = new Set(commitInfos.keys());
  const edges: GraphEdge[] = [];
  for (const info of commitInfos.values()) {
    for (const parent of info.parents) {
      if (!includedCommits.has(parent)) continue;
      edges.push({
        source: commitId(repoKeyStr, parent),
        target: commitId(repoKeyStr, info.sha),
        relation: "PARENT_OF",
        confidence: "EXTRACTED",
        source_file: "git",
      });
    }
    edges.push(...readModifiesEdges(repo, repo, info.sha, repoKeyStr, options.fileNodeIds));
  }

  for (const [branch, shas] of commitsByBranch.entries()) {
    for (const sha of shas) {
      if (!includedCommits.has(sha)) continue;
      edges.push({
        source: commitId(repoKeyStr, sha),
        target: branchId(repoKeyStr, branch),
        relation: "ON_BRANCH",
        confidence: "EXTRACTED",
        source_file: "git",
      });
    }
  }

  const dedupedEdges = new Map<string, GraphEdge>();
  for (const edge of edges) dedupedEdges.set(edgeKey(edge), edge);

  // An explicit bound — count or age — is the only way this extraction
  // becomes partial; the default walks the whole reachable history.
  const boundedByRequest = explicitMaxCommits(options) !== undefined || explicitSinceDays(options) !== undefined;
  return {
    provenance: {
      source_owner: "git",
      source_id: repoKeyStr,
      observed_at: options.observedAt ?? new Date().toISOString(),
      source_hash: head,
      adapter_version: GIT_EXTRACT_ADAPTER_VERSION,
      ...(boundedByRequest ? { partial: true } : {}),
    },
    nodes,
    edges: [...dedupedEdges.values()],
    input_tokens: 0,
    output_tokens: 0,
  };
}
