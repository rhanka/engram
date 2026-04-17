/** Branch/worktree lifecycle metadata stored under .graphify/. */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveGitContext, safeExecGit, safeGitRevParse } from "./git.js";
import { resolveGraphifyPaths } from "./paths.js";

const SCHEMA_VERSION = 1;

export interface WorktreeMetadata {
  schemaVersion: number;
  worktreePath: string;
  gitDir: string | null;
  commonGitDir: string | null;
  firstSeenHead: string | null;
  lastSeenHead: string | null;
  lastAnalyzedHead: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BranchMetadata {
  schemaVersion: number;
  branchName: string | null;
  worktreePath: string;
  upstream: string | null;
  mergeBase: string | null;
  firstSeenHead: string | null;
  lastSeenHead: string | null;
  lastAnalyzedHead: string | null;
  stale: boolean;
  staleReason: string | null;
  staleSince: string | null;
  lifecycleEvent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LifecycleMetadata {
  worktree: WorktreeMetadata;
  branch: BranchMetadata;
}

export interface RefreshLifecycleOptions {
  analyzed?: boolean;
  stale?: boolean;
  reason?: string | null;
  lifecycleEvent?: string | null;
}

export interface PruneCandidate {
  path: string;
  reason: string;
}

export interface PrunePlan {
  destructive: false;
  candidates: PruneCandidate[];
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function currentHead(root: string): string | null {
  return safeGitRevParse(root, ["HEAD"]);
}

function currentBranch(root: string): string | null {
  const branch = safeGitRevParse(root, ["--abbrev-ref", "HEAD"]);
  return branch && branch !== "HEAD" ? branch : null;
}

function upstreamRef(root: string): string | null {
  return safeGitRevParse(root, ["--abbrev-ref", "--symbolic-full-name", "@{u}"]);
}

function mergeBase(root: string, upstream: string | null): string | null {
  return upstream ? safeExecGit(root, ["merge-base", "HEAD", upstream]) : null;
}

export function lifecyclePaths(root: string = "."): { worktree: string; branch: string } {
  const paths = resolveGraphifyPaths({ root });
  return {
    worktree: join(paths.stateDir, "worktree.json"),
    branch: join(paths.stateDir, "branch.json"),
  };
}

export function readLifecycleMetadata(root: string = "."): LifecycleMetadata | null {
  const paths = lifecyclePaths(root);
  const worktree = readJson<WorktreeMetadata>(paths.worktree);
  const branch = readJson<BranchMetadata>(paths.branch);
  return worktree && branch ? { worktree, branch } : null;
}

export function refreshLifecycleMetadata(
  root: string = ".",
  options: RefreshLifecycleOptions = {},
): LifecycleMetadata {
  const rootResolved = resolve(root);
  const paths = resolveGraphifyPaths({ root: rootResolved });
  const metadataPaths = lifecyclePaths(rootResolved);
  const existingWorktree = readJson<WorktreeMetadata>(metadataPaths.worktree);
  const existingBranch = readJson<BranchMetadata>(metadataPaths.branch);
  const context = resolveGitContext(rootResolved);
  const now = new Date().toISOString();
  const head = context ? currentHead(rootResolved) : null;
  const branchName = context ? currentBranch(rootResolved) : null;
  const upstream = context ? upstreamRef(rootResolved) : null;
  const base = context ? mergeBase(rootResolved, upstream) : null;
  const worktreePath = context?.worktreeRoot ?? rootResolved;
  const analyzed = options.analyzed === true;
  const sameBranch = existingBranch?.branchName === branchName;
  const stale = analyzed ? false : options.stale ?? existingBranch?.stale ?? false;
  const staleSince = stale
    ? existingBranch?.staleSince ?? now
    : null;

  mkdirSync(paths.stateDir, { recursive: true });

  const worktree: WorktreeMetadata = {
    schemaVersion: SCHEMA_VERSION,
    worktreePath,
    gitDir: context?.gitDir ?? null,
    commonGitDir: context?.commonGitDir ?? null,
    firstSeenHead: existingWorktree?.firstSeenHead ?? head,
    lastSeenHead: head,
    lastAnalyzedHead: analyzed ? head : existingWorktree?.lastAnalyzedHead ?? null,
    createdAt: existingWorktree?.createdAt ?? now,
    updatedAt: now,
  };

  const branch: BranchMetadata = {
    schemaVersion: SCHEMA_VERSION,
    branchName,
    worktreePath,
    upstream,
    mergeBase: base,
    firstSeenHead: sameBranch
      ? existingBranch.firstSeenHead
      : head,
    lastSeenHead: head,
    lastAnalyzedHead: analyzed ? head : sameBranch ? existingBranch?.lastAnalyzedHead ?? null : null,
    stale,
    staleReason: stale ? options.reason ?? existingBranch?.staleReason ?? "unknown" : null,
    staleSince,
    lifecycleEvent: stale ? options.lifecycleEvent ?? existingBranch?.lifecycleEvent ?? null : null,
    createdAt: sameBranch
      ? existingBranch.createdAt
      : now,
    updatedAt: now,
  };

  writeJson(metadataPaths.worktree, worktree);
  writeJson(metadataPaths.branch, branch);

  if (stale) {
    writeFileSync(paths.needsUpdate, "1", "utf-8");
  } else if (existsSync(paths.needsUpdate)) {
    unlinkSync(paths.needsUpdate);
  }

  return { worktree, branch };
}

export function markLifecycleStale(root: string = ".", reason: string = "manual"): LifecycleMetadata {
  return refreshLifecycleMetadata(root, {
    stale: true,
    reason,
    lifecycleEvent: reason,
  });
}

export function markLifecycleAnalyzed(root: string = "."): LifecycleMetadata {
  return refreshLifecycleMetadata(root, { analyzed: true, stale: false, reason: null });
}

export function planLifecyclePrune(root: string = "."): PrunePlan {
  const paths = resolveGraphifyPaths({ root });
  const candidates: PruneCandidate[] = [];

  // Current layout is worktree-local and flat; there are no per-branch folders
  // to delete yet. Expose an explicit dry plan so future branch archives can be
  // pruned intentionally without adding destructive hook behavior.
  const metadata = readLifecycleMetadata(root);
  if (metadata?.branch.stale && !existsSync(paths.graph)) {
    candidates.push({
      path: paths.needsUpdate,
      reason: "stale marker exists but no graph artifact is present",
    });
  }

  return { destructive: false, candidates };
}
