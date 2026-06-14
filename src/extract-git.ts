import { execFileSync } from "node:child_process";
import { resolve, relative, basename, dirname, extname, sep, isAbsolute } from "node:path";
import { repoKey, commitId, branchId } from "./repo-key.js";
import type { Extraction, GitDetectionWindow, GraphEdge, GraphNode, OntologyProfile } from "./types.js";

export const GIT_EXTRACT_ADAPTER_VERSION = "graphify-git/1";

const DEFAULT_MAX_COMMITS = 200;
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
  const maxCommits = positiveInteger(options.maxCommits, DEFAULT_MAX_COMMITS);
  const args = ["rev-list", `--max-count=${maxCommits}`];
  if (options.sinceDays !== undefined && Number.isFinite(options.sinceDays) && options.sinceDays > 0) {
    args.push(`--since=${Math.floor(options.sinceDays)} days ago`);
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

function makeId(...parts: string[]): string {
  const combined = parts
    .filter(Boolean)
    .map((p) => p.replace(/^[_.]+|[_.]+$/g, ""))
    .join("_");
  const cleaned = combined.replace(/[^a-zA-Z0-9]+/g, "_");
  return cleaned.replace(/^_+|_+$/g, "").toLowerCase();
}

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

export function detectGitWindow(root: string = ".", options: ExtractGitOptions = {}): GitDetectionWindow | undefined {
  const startRoot = resolve(root);
  if (!isGitRepo(startRoot)) return undefined;
  const repo = gitRoot(startRoot);
  const head = tryGit(repo, ["rev-parse", "HEAD"]);
  if (!head) return undefined;
  return {
    source_owner: "git",
    source_hash: head,
    branches: discoverBranches(repo, options),
    max_commits: positiveInteger(options.maxCommits, DEFAULT_MAX_COMMITS),
    active_within_days: positiveInteger(options.activeWithinDays, DEFAULT_ACTIVE_WITHIN_DAYS),
    ...(options.sinceDays !== undefined && Number.isFinite(options.sinceDays) && options.sinceDays > 0
      ? { since_days: Math.floor(options.sinceDays) }
      : {}),
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

  return {
    provenance: {
      source_owner: "git",
      source_id: repoKeyStr,
      observed_at: options.observedAt ?? new Date().toISOString(),
      source_hash: head,
      adapter_version: GIT_EXTRACT_ADAPTER_VERSION,
    },
    nodes,
    edges: [...dedupedEdges.values()],
    input_tokens: 0,
    output_tokens: 0,
  };
}
