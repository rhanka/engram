import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { execGit, safeExecGit } from "./git.js";
import { resolveGraphifyPaths } from "./paths.js";
import type {
  GraphifyInputScopeMode,
  GraphifyResolvedInputScopeMode,
  InputScopeInspection,
  InputScopeSource,
} from "./types.js";

export interface InspectInputScopeOptions {
  mode?: GraphifyInputScopeMode;
  source?: InputScopeSource;
}

export interface InputScopeInventory {
  candidateFiles: string[] | null;
  scope: InputScopeInspection;
}

interface GitScopeContext {
  gitRoot: string;
  prefix: string;
  head?: string;
}

const DEFAULT_RECOMMENDATION = "Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.";

function splitGitLines(output: string | null): string[] {
  if (!output) return [];
  return output.split(/\r?\n/).filter((line) => line.length > 0);
}

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

function toRepoRelative(root: string, path: string): string {
  return toPosixPath(relative(root, path));
}

function pathspecForPrefix(prefix: string): string {
  const normalized = prefix.replace(/\/$/, "");
  return normalized.length > 0 ? normalized : ".";
}

function isGraphifyMemoryPath(path: string): boolean {
  return path === ".graphify/memory" || path.startsWith(".graphify/memory/");
}

function walkFiles(dir: string, root: string): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = lstatSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      result.push(...walkFiles(full, root));
    } else if (stat.isFile()) {
      result.push(toRepoRelative(root, full));
    }
  }
  return result;
}

function resolveGitScopeContext(root: string): GitScopeContext | null {
  try {
    const output = execGit(root, ["rev-parse", "--show-toplevel", "--show-prefix", "HEAD"]);
    const [gitRoot, prefix, head] = output.split(/\r?\n/);
    if (!gitRoot) return null;
    return {
      gitRoot: resolve(gitRoot),
      prefix: prefix ?? "",
      head,
    };
  } catch {
    const gitRoot = safeExecGit(root, ["rev-parse", "--show-toplevel"]);
    if (!gitRoot) return null;
    const prefix = safeExecGit(root, ["rev-parse", "--show-prefix"]) ?? "";
    return {
      gitRoot: resolve(gitRoot),
      prefix,
    };
  }
}

function makeScope(params: {
  requestedMode: GraphifyInputScopeMode;
  resolvedMode: GraphifyResolvedInputScopeMode;
  source: InputScopeSource;
  root: string;
  context?: GitScopeContext | null;
  candidateCount: number | null;
  includedCount: number | null;
  excludedUntrackedCount: number;
  excludedIgnoredCount: number;
  missingCommittedCount: number;
  warnings?: string[];
  recommendation?: string | null;
}): InputScopeInspection {
  return {
    requested_mode: params.requestedMode,
    resolved_mode: params.resolvedMode,
    source: params.source,
    root: params.root,
    git_root: params.context?.gitRoot,
    head: params.context?.head,
    candidate_count: params.candidateCount,
    included_count: params.includedCount,
    excluded_untracked_count: params.excludedUntrackedCount,
    excluded_ignored_count: params.excludedIgnoredCount,
    excluded_sensitive_count: 0,
    missing_committed_count: params.missingCommittedCount,
    warnings: params.warnings ?? [],
    recommendation: params.recommendation ?? null,
  };
}

function countGitPaths(context: GitScopeContext, args: string[]): number {
  return splitGitLines(execGit(context.gitRoot, args)).filter((path) => !isGraphifyMemoryPath(path)).length;
}

function gitInventory(context: GitScopeContext, mode: "committed" | "tracked"): string[] {
  const target = pathspecForPrefix(context.prefix);
  if (mode === "committed") {
    return splitGitLines(execGit(context.gitRoot, ["ls-tree", "-r", "--name-only", "HEAD", "--", target]));
  }
  return splitGitLines(execGit(context.gitRoot, ["ls-files", "--cached", "--", target]));
}

function appendMemoryFiles(root: string, candidateFiles: string[]): string[] {
  const paths = resolveGraphifyPaths({ root });
  const seen = new Set(candidateFiles);
  const result = [...candidateFiles];
  for (const file of walkFiles(paths.memoryDir, root)) {
    if (seen.has(file)) continue;
    seen.add(file);
    result.push(file);
  }
  return result;
}

function buildGitInventory(
  root: string,
  requestedMode: GraphifyInputScopeMode,
  resolvedMode: "committed" | "tracked",
  source: InputScopeSource,
  context: GitScopeContext,
): InputScopeInventory {
  const inventory = gitInventory(context, resolvedMode);
  const existingFiles: string[] = [];
  let missingCommittedCount = 0;

  for (const file of inventory) {
    const fullPath = join(context.gitRoot, file);
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      existingFiles.push(file);
    } else {
      missingCommittedCount += 1;
    }
  }

  const candidateFiles = appendMemoryFiles(root, existingFiles);
  const target = pathspecForPrefix(context.prefix);
  const excludedUntrackedCount = countGitPaths(context, ["ls-files", "--others", "--exclude-standard", "--", target]);
  const excludedIgnoredCount = countGitPaths(context, ["ls-files", "--others", "-i", "--exclude-standard", "--", target]);

  return {
    candidateFiles,
    scope: makeScope({
      requestedMode,
      resolvedMode,
      source,
      root,
      context,
      candidateCount: candidateFiles.length + missingCommittedCount,
      includedCount: candidateFiles.length,
      excludedUntrackedCount,
      excludedIgnoredCount,
      missingCommittedCount,
      recommendation: DEFAULT_RECOMMENDATION,
    }),
  };
}

function fallbackAllScope(params: {
  requestedMode: GraphifyInputScopeMode;
  source: InputScopeSource;
  root: string;
  context?: GitScopeContext | null;
  warnings?: string[];
  recommendation?: string | null;
}): InputScopeInventory {
  return {
    candidateFiles: null,
    scope: makeScope({
      requestedMode: params.requestedMode,
      resolvedMode: "all",
      source: params.source,
      root: params.root,
      context: params.context,
      candidateCount: null,
      includedCount: null,
      excludedUntrackedCount: 0,
      excludedIgnoredCount: 0,
      missingCommittedCount: 0,
      warnings: params.warnings,
      recommendation: params.recommendation,
    }),
  };
}

export function inspectInputScope(root: string, options: InspectInputScopeOptions = {}): InputScopeInventory {
  const rootResolved = resolve(root);
  const requestedMode = options.mode ?? "auto";
  const source = options.source ?? "default-auto";

  if (requestedMode === "all") {
    const context = resolveGitScopeContext(rootResolved);
    return fallbackAllScope({
      requestedMode,
      source,
      root: rootResolved,
      context,
    });
  }

  const context = resolveGitScopeContext(rootResolved);
  if (!context) {
    return fallbackAllScope({
      requestedMode,
      source,
      root: rootResolved,
      warnings: requestedMode === "auto" ? [] : ["Not a Git repository; falling back to all scope."],
      recommendation: requestedMode === "auto" ? null : DEFAULT_RECOMMENDATION,
    });
  }

  if (requestedMode === "tracked") {
    return buildGitInventory(rootResolved, requestedMode, "tracked", source, context);
  }

  if (!context.head) {
    return fallbackAllScope({
      requestedMode,
      source,
      root: rootResolved,
      context,
      warnings: ["Git repository has no HEAD; falling back to all scope."],
      recommendation: DEFAULT_RECOMMENDATION,
    });
  }

  return buildGitInventory(rootResolved, requestedMode, "committed", source, context);
}
