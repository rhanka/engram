/**
 * WP9 agent-stats — public orchestration API consumed by the CLI.
 *
 * Pipeline: discover transcripts → (incrementally) parse each host → normalize
 * to SessionFact → filter to THIS repo → persist facts + cursors → correlate
 * against `git log` and the h2a registry → aggregate per-agent stats.
 */

import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { safeExecGit } from "../git.js";
import { resolveIdentity } from "./identity.js";
import { parseAgyChat } from "./agy-chat.js";
import { parseClaudeTranscript } from "./claude-transcript.js";
import { parseCodexRollout } from "./codex-rollout.js";
import { correlate, type GitCommitMeta } from "./correlate.js";
import {
  discoverAgy,
  discoverClaude,
  discoverCodex,
  repoSlug,
  type TranscriptFile,
} from "./discover.js";
import {
  agyProjectHash,
  factInRepo,
  makeRepoScope,
  normalizeAgy,
  normalizeClaude,
  normalizeCodex,
  type RepoScope,
} from "./normalize.js";
import { loadH2aInstances, matchInstance, type H2aInstance } from "./registry.js";
import { aggregate, formatSessionsTable, formatStatsTable } from "./stats.js";
import {
  ensureStore,
  loadCursors,
  loadFacts,
  resolveStore,
  saveCursors,
  saveFacts,
  type AgentStore,
} from "./store.js";
import type { AgentStatsRow, CorrelationLink, FileCursor, SessionFact } from "./types.js";

export interface SyncOptions {
  repoRoot: string;
  home?: string;
  /** Force a full re-parse, ignoring cursors. */
  full?: boolean;
}

export interface SyncResult {
  scanned: number;
  parsed: number;
  inRepo: number;
  /** Codex rollouts skipped via the cheap header cwd pre-filter. */
  skipped: number;
  factsTotal: number;
}

/** Read `git log --all` for the repo as correlation ground truth. */
export function readGitCommits(repoRoot: string): GitCommitMeta[] {
  // Reuse the project's ESM-safe git helper (the bundler cannot dynamic-require
  // child_process). Pipe-delimited so subjects with spaces survive intact.
  const out = safeExecGit(repoRoot, ["log", "--all", "--format=%H|%s"]);
  if (!out) return [];
  const commits: GitCommitMeta[] = [];
  for (const line of out.split("\n")) {
    const idx = line.indexOf("|");
    if (idx < 7) continue;
    const sha = line.slice(0, idx);
    const subject = line.slice(idx + 1);
    if (sha.length >= 7) commits.push({ sha, subject });
  }
  return commits;
}

function parseFile(file: TranscriptFile, home: string): { fact: SessionFact; agyHash?: string } | null {
  let content: string;
  try {
    content = readFileSync(file.path, "utf-8");
  } catch {
    return null;
  }
  if (file.host === "claude") {
    return { fact: normalizeClaude(parseClaudeTranscript(content, file.sessionId, home)) };
  }
  if (file.host === "codex") {
    return { fact: normalizeCodex(parseCodexRollout(content, file.sessionId, home)) };
  }
  const raw = parseAgyChat(content, file.sessionId);
  // agy projectHash is on the header; if absent, derive from the dir name.
  const projectHashFromDir = file.path.match(/\.gemini\/tmp\/([^/]+)\//)?.[1];
  return { fact: normalizeAgy(raw), agyHash: raw.projectHash ?? projectHashFromDir };
}

/** Read up to `maxBytes` from the start of a file (cheap header peek). */
function readHead(path: string, maxBytes = 64 * 1024): string {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const buf = Buffer.alloc(maxBytes);
    const n = readSync(fd, buf, 0, maxBytes, 0);
    return buf.toString("utf-8", 0, n);
  } catch {
    return "";
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Codex rollouts are large (multi-MB) and mostly belong to OTHER repos. The
 * first JSONL `session_meta` line can itself be huge (it embeds the full
 * `base_instructions.text`), but `payload.cwd` appears within the first ~200
 * bytes — well before the first newline. So we regex the cwd out of a small
 * head read instead of JSON-parsing the whole (possibly multi-KB) first line.
 * Returns true when the rollout might belong to the repo (parse it), false to
 * skip. Conservative: if we cannot find a cwd, we parse.
 */
function codexHeaderMaybeInRepo(path: string, repoRoot: string): boolean {
  const head = readHead(path, 4 * 1024);
  if (!head) return true;
  const m = head.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m || typeof m[1] !== "string") return true;
  const cwd = m[1].replace(/\\(.)/g, "$1"); // unescape JSON string
  return cwd === repoRoot || cwd.startsWith(repoRoot + "/");
}

function cursorCurrent(prev: FileCursor | undefined, path: string): FileCursor | null {
  try {
    const st = statSync(path);
    return { path, offset: Number(st.size), size: Number(st.size), mtimeMs: st.mtimeMs };
  } catch {
    return prev ?? null;
  }
}

/**
 * Sync: discover + parse + filter + persist. Incremental by default — a file is
 * re-parsed only when its size or mtime changed since the last cursor (full
 * re-parse per file, since JSONL sessions are small; byte-offset cursors are
 * stored so a future streaming implementation can resume mid-file).
 */
export function syncAgentStats(opts: SyncOptions): SyncResult {
  const home = opts.home ?? homedir();
  const store = resolveStore(opts.repoRoot);
  ensureStore(store);
  const scope = makeRepoScope(opts.repoRoot);
  const facts = loadFacts(store);
  const cursors = loadCursors(store);

  const files: TranscriptFile[] = [
    ...discoverClaude(home, repoSlug(opts.repoRoot)),
    ...discoverCodex(home),
    ...discoverAgy(home),
  ];

  let parsed = 0;
  let inRepo = 0;
  let skipped = 0;
  for (const file of files) {
    let st;
    try {
      st = statSync(file.path);
    } catch {
      continue;
    }
    const prev = cursors.get(file.path);
    const unchanged = prev && !opts.full && prev.size === Number(st.size) && prev.mtimeMs === st.mtimeMs;
    if (unchanged) continue;

    // Cheap repo pre-filter for Codex (13GB+ of mostly-other-repo rollouts):
    // skip a full read when the session_meta header cwd is outside this repo.
    if (file.host === "codex" && !codexHeaderMaybeInRepo(file.path, opts.repoRoot)) {
      cursors.set(file.path, cursorCurrent(prev, file.path)!);
      skipped++;
      continue;
    }

    const result = parseFile(file, home);
    cursors.set(file.path, cursorCurrent(prev, file.path)!);
    if (!result) continue;
    parsed++;
    const { fact, agyHash } = result;
    if (!factInRepo(fact, scope, agyHash)) continue;
    inRepo++;
    facts.set(fact.factId, fact);
  }

  saveFacts(store, facts);
  saveCursors(store, cursors);
  return { scanned: files.length, parsed, inRepo, skipped, factsTotal: facts.size };
}

export interface ComputeResult {
  rows: AgentStatsRow[];
  links: CorrelationLink[];
  facts: SessionFact[];
  instances: H2aInstance[];
}

/** Load persisted facts, correlate, and aggregate. `injectedCommits` is for tests. */
export function computeAgentStats(
  repoRoot: string,
  injectedCommits?: GitCommitMeta[],
  storeOverride?: AgentStore,
): ComputeResult {
  const store = storeOverride ?? resolveStore(repoRoot);
  const facts = Array.from(loadFacts(store).values());
  const instances = loadH2aInstances(repoRoot);
  const commits = injectedCommits ?? readGitCommits(repoRoot);
  const links = correlate({ facts, instances, commits });
  const rows = aggregate({ facts, links, instances });
  return { rows, links, facts, instances };
}

export interface SessionFilter {
  agent?: string;
  branch?: string;
  since?: string;
}

/** Filtered session list for `agent-stats sessions`. */
export function listSessions(repoRoot: string, filter: SessionFilter, storeOverride?: AgentStore): {
  facts: SessionFact[];
  instances: H2aInstance[];
} {
  const store = storeOverride ?? resolveStore(repoRoot);
  const instances = loadH2aInstances(repoRoot);
  let facts = Array.from(loadFacts(store).values());
  if (filter.branch) {
    facts = facts.filter(
      (f) =>
        f.branchesObserved.includes(filter.branch!) ||
        f.groundTruth.branches.includes(filter.branch!),
    );
  }
  if (filter.since) {
    facts = facts.filter((f) => (f.endedAt ?? f.startedAt ?? "") >= filter.since!);
  }
  if (filter.agent) {
    facts = facts.filter((f) => {
      const inst = matchInstance(instances, f.host, f.cwds);
      return resolveIdentity(f, inst).agentId.includes(filter.agent!);
    });
  }
  facts.sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""));
  return { facts, instances };
}

export {
  formatStatsTable,
  formatSessionsTable,
  agyProjectHash,
  type RepoScope,
  type AgentStore,
};
