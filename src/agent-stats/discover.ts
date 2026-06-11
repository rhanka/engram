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

/** Discover Claude Code transcripts for a repo slug (`-home-antoinefa-src-foo`). */
export function discoverClaude(home: string, repoSlug: string): TranscriptFile[] {
  const dir = join(home, ".claude", "projects", repoSlug);
  const files: string[] = [];
  listFilesRec(dir, (n) => n.endsWith(".jsonl"), files);
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

/** Convert a repo root path to the Claude Code project slug. */
export function repoSlug(repoRoot: string): string {
  return repoRoot.replace(/\//g, "-");
}
