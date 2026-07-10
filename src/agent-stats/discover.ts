/**
 * WP9 agent-stats — transcript discovery across the three hosts.
 *
 * Returns absolute paths to every candidate transcript on disk. Repo-scope
 * filtering happens later (after parse) since cwd is inside the file content
 * for claude/codex and only `projectHash` for agy.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type Host = "claude" | "codex" | "agy";

export interface TranscriptFile {
  host: Host;
  path: string;
  /** Session id parsed from the filename (best effort). */
  sessionId: string;
}

function listFilesRec(dir: string, filter: (name: string) => boolean, out: string[], depth = 0): void {
  if (depth > 6 || !existsSync(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) listFilesRec(full, filter, out, depth + 1);
    else if (filter(name)) out.push(full);
  }
}

/**
 * Discover Claude Code transcripts for a repo slug (`-home-user-src-foo`).
 *
 * The host derives one project dir PER CWD, so worktree sessions live in
 * sibling dirs like `<slug>--claude-worktrees-agent-x` (`.`→`-`), NOT under
 * `<slug>`. We therefore scan every dir whose name is the slug or extends it
 * (`<slug>-…`); repo membership is re-checked later from the parsed cwd, so
 * over-inclusion (e.g. a `<slug>-sibling` repo) is filtered out downstream.
 */
export function discoverClaude(home: string, repoSlug: string): TranscriptFile[] {
  const projectsDir = join(home, ".claude", "projects");
  let entries: string[] = [];
  try {
    entries = readdirSync(projectsDir);
  } catch {
    return [];
  }
  const files: string[] = [];
  const legacySlashSlug = repoSlug.replace(/--/g, "-");
  for (const name of entries) {
    const modernMatch = name === repoSlug || name.startsWith(repoSlug + "-");
    const legacyMatch = name === legacySlashSlug || name.startsWith(legacySlashSlug + "-");
    const legacyNonSlashMatch = repoSlug.length === name.length &&
      Array.from(repoSlug).every((ch, i) => ch === name[i] || (ch === "-" && name[i] !== "/"));
    if (!modernMatch && !legacyMatch && !legacyNonSlashMatch) continue;
    listFilesRec(join(projectsDir, name), (n) => n.endsWith(".jsonl"), files);
  }
  return files.map((path) => ({ host: "claude" as const, path, sessionId: basenameNoExt(path) }));
}

/** Discover Codex rollouts (all dates; repo filter applied after parse). */
export function discoverCodex(home: string): TranscriptFile[] {
  const dir = join(home, ".codex", "sessions");
  const files: string[] = [];
  listFilesRec(dir, (n) => n.startsWith("rollout-") && n.endsWith(".jsonl"), files);
  return files.map((path) => ({ host: "codex" as const, path, sessionId: codexThreadId(path) }));
}

/** Discover agy chats (all project hashes; repo filter applied after parse). */
export function discoverAgy(home: string): TranscriptFile[] {
  const dir = join(home, ".gemini", "tmp");
  const files: string[] = [];
  listFilesRec(dir, (n) => n.startsWith("session-") && n.endsWith(".jsonl"), files);
  return files.map((path) => ({ host: "agy" as const, path, sessionId: basenameNoExt(path) }));
}

function basenameNoExt(p: string): string {
  const b = p.split("/").pop() ?? p;
  return b.replace(/\.jsonl$/, "");
}

/** rollout-<ts>-<thread_uuid>.jsonl → thread uuid. */
function codexThreadId(p: string): string {
  const b = basenameNoExt(p);
  const m = b.match(/rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return m && m[1] ? m[1] : b;
}

/**
 * Convert a repo root path to the Claude Code project slug. The host maps
 * EVERY non-alphanumeric character to `-` (not just `/`): a worktree under
 * `<root>/.claude/worktrees/x` becomes `<slug>--claude-worktrees-x`.
 */
export function repoSlug(repoRoot: string): string {
  return repoRoot.replace(/[^A-Za-z0-9]/g, "-");
}
