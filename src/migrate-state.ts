import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { resolveGitContext, safeExecGit } from "./git.js";
import { LEGACY_GRAPHIFY_STATE_DIR, resolveGraphifyPaths } from "./paths.js";

export type MigrationAction = "copy" | "overwrite" | "skip";
export type MigrationEntryType = "file" | "directory";

export interface MigrationEntry {
  relativePath: string;
  source: string;
  target: string;
  type: MigrationEntryType;
  action: MigrationAction;
  reason?: string;
}

export interface MigrationGitAdvice {
  isGitRepository: boolean;
  hasCommits: boolean;
  legacyTrackedCount: number;
  legacyPath: string;
  targetPath: string;
  targetIgnored: boolean;
  status: string[];
  recommendedCommands: string[];
  notes: string[];
}

export interface GraphifyOutMigrationPlan {
  root: string;
  sourceDir: string;
  targetDir: string;
  sourceExists: boolean;
  targetExists: boolean;
  force: boolean;
  entries: MigrationEntry[];
  git: MigrationGitAdvice;
}

export interface GraphifyOutMigrationResult extends GraphifyOutMigrationPlan {
  dryRun: boolean;
  copied: number;
  overwritten: number;
  skipped: number;
}

export interface MigrationOptions {
  root?: string;
  force?: boolean;
  dryRun?: boolean;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

function normalizeGitPath(value: string): string {
  return value.split("\\").join("/");
}

function collectEntries(sourceDir: string, targetDir: string, force: boolean, base = ""): MigrationEntry[] {
  const entries: MigrationEntry[] = [];
  const items = readdirSync(join(sourceDir, base), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const item of items) {
    const relativePath = base ? join(base, item.name) : item.name;
    const source = join(sourceDir, relativePath);
    const target = join(targetDir, relativePath);
    const targetExists = existsSync(target);
    const type: MigrationEntryType = item.isDirectory() ? "directory" : "file";
    const action: MigrationAction = targetExists ? (force && type === "file" ? "overwrite" : "skip") : "copy";

    entries.push({
      relativePath: normalizeGitPath(relativePath),
      source,
      target,
      type,
      action,
      reason: targetExists && action === "skip" ? "target already exists" : undefined,
    });

    if (item.isDirectory()) {
      entries.push(...collectEntries(sourceDir, targetDir, force, relativePath));
    }
  }

  return entries;
}

function gitAdvice(root: string, sourceDir: string, targetDir: string): MigrationGitAdvice {
  const context = resolveGitContext(root);
  if (!context) {
    return {
      isGitRepository: false,
      hasCommits: false,
      legacyTrackedCount: 0,
      legacyPath: LEGACY_GRAPHIFY_STATE_DIR,
      targetPath: ".graphify",
      targetIgnored: false,
      status: [],
      recommendedCommands: [],
      notes: ["No git repository detected; local state migration does not need a commit."],
    };
  }

  const legacyPath = normalizeGitPath(relative(context.worktreeRoot, sourceDir));
  const targetPath = normalizeGitPath(relative(context.worktreeRoot, targetDir));
  const hasCommits = safeExecGit(context.worktreeRoot, ["rev-parse", "--verify", "HEAD"]) !== null;
  const trackedOutput = safeExecGit(context.worktreeRoot, ["ls-files", "--", legacyPath]) ?? "";
  const legacyTrackedCount = trackedOutput.split("\n").map((line) => line.trim()).filter(Boolean).length;
  const statusOutput = safeExecGit(context.worktreeRoot, ["status", "--short", "--", legacyPath, targetPath]) ?? "";
  const targetIgnored = safeExecGit(context.worktreeRoot, ["check-ignore", targetPath]) !== null;
  const recommendedCommands: string[] = [];
  const notes: string[] = [];

  if (hasCommits && legacyTrackedCount > 0) {
    recommendedCommands.push("git mv -f " + shellQuote(legacyPath) + " " + shellQuote(targetPath));
    recommendedCommands.push('git commit -m "chore: migrate graphify state directory"');
    notes.push("Tracked legacy graph artifacts detected; use git mv before copying if you want Git history to show a rename.");
    if (targetIgnored) {
      notes.push(".graphify is ignored by default; git mv -f should only be used when you intentionally track graph artifacts.");
    }
  } else {
    notes.push("No tracked graphify-out artifacts detected; .graphify is runtime state and normally should stay uncommitted.");
  }

  return {
    isGitRepository: true,
    hasCommits,
    legacyTrackedCount,
    legacyPath,
    targetPath,
    targetIgnored,
    status: statusOutput.split("\n").map((line) => line.trim()).filter(Boolean),
    recommendedCommands,
    notes,
  };
}

export function planGraphifyOutMigration(options: MigrationOptions = {}): GraphifyOutMigrationPlan {
  const root = resolve(options.root ?? ".");
  const force = options.force === true;
  const paths = resolveGraphifyPaths({ root });
  const sourceDir = resolve(root, LEGACY_GRAPHIFY_STATE_DIR);
  const targetDir = paths.stateDir;
  const sourceExists = existsSync(sourceDir) && statSync(sourceDir).isDirectory();
  const targetExists = existsSync(targetDir);

  return {
    root,
    sourceDir,
    targetDir,
    sourceExists,
    targetExists,
    force,
    entries: sourceExists ? collectEntries(sourceDir, targetDir, force) : [],
    git: gitAdvice(root, sourceDir, targetDir),
  };
}

function applyEntry(entry: MigrationEntry): void {
  if (entry.action === "skip") return;
  if (entry.type === "directory") {
    mkdirSync(entry.target, { recursive: true });
    return;
  }

  mkdirSync(dirname(entry.target), { recursive: true });
  copyFileSync(entry.source, entry.target);
}

export function migrateGraphifyOut(options: MigrationOptions = {}): GraphifyOutMigrationResult {
  const plan = planGraphifyOutMigration(options);
  if (!options.dryRun && plan.sourceExists) {
    mkdirSync(plan.targetDir, { recursive: true });
    for (const entry of plan.entries) {
      applyEntry(entry);
    }
  }

  return {
    ...plan,
    dryRun: options.dryRun === true,
    copied: plan.entries.filter((entry) => entry.action === "copy").length,
    overwritten: plan.entries.filter((entry) => entry.action === "overwrite").length,
    skipped: plan.entries.filter((entry) => entry.action === "skip").length,
  };
}

export function migrationResultToText(result: GraphifyOutMigrationResult): string {
  const lines: string[] = [];
  lines.push(result.dryRun ? "graphify state migration dry-run" : "graphify state migration");
  lines.push("source: " + result.sourceDir);
  lines.push("target: " + result.targetDir);

  if (!result.sourceExists) {
    lines.push("status: no legacy graphify-out directory found");
  } else {
    lines.push("status: " + result.copied + " copy, " + result.overwritten + " overwrite, " + result.skipped + " skip");
  }

  const changed = result.entries.filter((entry) => entry.action !== "skip");
  if (changed.length > 0) {
    lines.push("");
    lines.push(result.dryRun ? "planned writes:" : "writes:");
    for (const entry of changed.slice(0, 40)) {
      lines.push("- " + entry.action + " " + entry.relativePath);
    }
    if (changed.length > 40) {
      lines.push("- ... " + (changed.length - 40) + " more");
    }
  }

  const skipped = result.entries.filter((entry) => entry.action === "skip");
  if (skipped.length > 0) {
    lines.push("");
    lines.push("skipped:");
    for (const entry of skipped.slice(0, 20)) {
      lines.push("- " + entry.relativePath + ": " + (entry.reason ?? "skipped"));
    }
    if (skipped.length > 20) {
      lines.push("- ... " + (skipped.length - 20) + " more");
    }
  }

  lines.push("");
  lines.push("git advice:");
  for (const note of result.git.notes) {
    lines.push("- " + note);
  }
  if (result.git.recommendedCommands.length > 0) {
    lines.push("recommended tracked migration:");
    for (const command of result.git.recommendedCommands) {
      lines.push("  " + command);
    }
  }
  if (result.git.status.length > 0) {
    lines.push("current git status for graphify state:");
    for (const line of result.git.status) {
      lines.push("  " + line);
    }
  }

  return lines.join("\n");
}
