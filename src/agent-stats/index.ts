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
import { correlate, type GitCommitMeta, type PrMergeMeta } from "./correlate.js";
import { indexTrackItems, loadTrackItems, type TrackIndex, type TrackItem } from "./track-join.js";
import { getPullRequestMerge, listPullRequests, type CommandRunner } from "../pr.js";
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

/**
 * Extract a PR number from a `gh pr` URL (`…/pull/<n>`) the session printed.
 */
export function prNumberFromUrl(url: string): number | undefined {
  const m = url.match(/\/pull\/(\d+)/);
  return m && m[1] ? Number(m[1]) : undefined;
}

/**
 * Build merged-PR attributions for every branch a session worked. A PR number
 * comes from (a) a `gh pr create`/push URL the session printed, or (b) a
 * branch → open/merged `gh pr list` lookup. For each, we fetch the merge commit
 * via `gh pr view`. Network failures degrade gracefully to an empty list.
 *
 * `runner` is injectable for tests (no live `gh` needed). When omitted, the real
 * `gh` CLI is used; if `gh` is unavailable the whole step is skipped.
 */
export function collectPrMerges(repoRoot: string, facts: SessionFact[], runner?: CommandRunner): PrMergeMeta[] {
  // Gather candidate (branch, prNumber) pairs from session evidence.
  const prByBranch = new Map<string, number>();
  const branches = new Set<string>();
  for (const fact of facts) {
    for (const b of fact.branchesObserved) if (b && b !== "HEAD") branches.add(b);
    for (const url of fact.groundTruth.prUrls) {
      const n = prNumberFromUrl(url);
      if (n === undefined) continue;
      // The PR url belongs to a branch the session pushed; tie it to the first
      // non-trivial branch the session observed (best effort).
      const branch = fact.branchesObserved.find((b) => b && b !== "HEAD");
      if (branch && !prByBranch.has(branch)) prByBranch.set(branch, n);
    }
  }
  if (branches.size === 0) return [];

  // Resolve remaining branches → PR numbers via a single `gh pr list` (merged).
  const unresolved = Array.from(branches).filter((b) => !prByBranch.has(b));
  if (unresolved.length > 0) {
    try {
      const merged = listPullRequests({ cwd: repoRoot, runner, state: "merged", limit: 100 });
      for (const pr of merged) {
        if (branches.has(pr.headRefName) && !prByBranch.has(pr.headRefName)) {
          prByBranch.set(pr.headRefName, pr.number);
        }
      }
    } catch {
      /* gh unavailable / offline — keep only URL-derived PR numbers. */
    }
  }

  const merges: PrMergeMeta[] = [];
  const seen = new Set<number>();
  for (const [branch, number] of prByBranch) {
    if (seen.has(number)) continue;
    seen.add(number);
    try {
      const info = getPullRequestMerge(number, { cwd: repoRoot, runner });
      if (info.mergeCommit) {
        merges.push({ number, branch: info.headRefName ?? branch, mergeCommit: info.mergeCommit });
      }
    } catch {
      /* PR view failed (deleted/offline) — skip this PR. */
    }
  }
  return merges;
}

export interface ComputeResult {
  rows: AgentStatsRow[];
  links: CorrelationLink[];
  facts: SessionFact[];
  instances: H2aInstance[];
  trackItems: Map<string, TrackItem>;
}

export interface ComputeOptions {
  /** Injected git log for tests (skips `git log`). */
  injectedCommits?: GitCommitMeta[];
  storeOverride?: AgentStore;
  /** Injected merged-PR attributions for tests (skips `gh`). */
  injectedPrMerges?: PrMergeMeta[];
  /** Injected Track items for tests (skips reading `.track/events.jsonl`). */
  injectedTrackItems?: Map<string, TrackItem>;
  /** Skip the live `gh` PR-merge collection (default false). */
  skipPrMerges?: boolean;
}

/**
 * Load persisted facts, correlate (commit-sha + PR-merge + Track-WP + h2a +
 * worktree evidence), and aggregate. All external inputs are injectable for
 * tests so the suite needs no live `~/.claude`, `gh`, or `git log`.
 */
export function computeAgentStats(
  repoRoot: string,
  injectedCommitsOrOpts?: GitCommitMeta[] | ComputeOptions,
  storeOverride?: AgentStore,
): ComputeResult {
  const opts: ComputeOptions = Array.isArray(injectedCommitsOrOpts)
    ? { injectedCommits: injectedCommitsOrOpts, storeOverride }
    : { ...injectedCommitsOrOpts, storeOverride: injectedCommitsOrOpts?.storeOverride ?? storeOverride };

  const store = opts.storeOverride ?? resolveStore(repoRoot);
  const facts = Array.from(loadFacts(store).values());
  const instances = loadH2aInstances(repoRoot);
  const commits = opts.injectedCommits ?? readGitCommits(repoRoot);

  const trackItems = opts.injectedTrackItems ?? loadTrackItems(repoRoot);
  const trackIndex: TrackIndex = indexTrackItems(trackItems);

  const prMerges = opts.injectedPrMerges
    ?? (opts.skipPrMerges ? [] : collectPrMerges(repoRoot, facts));

  const links = correlate({ facts, instances, commits, trackIndex, prMerges });
  const rows = aggregate({ facts, links, instances });
  return { rows, links, facts, instances, trackItems };
}

export interface WpAgentStatsResult {
  item?: TrackItem;
  /** Correlation links targeting this track item (Track-WP joins). */
  links: CorrelationLink[];
  /** Sessions attributed to this WP, with their resolved agent identity. */
  sessions: { fact: SessionFact; agentId: string; rule: CorrelationLink["rule"] }[];
  /** All track items (for an "unknown id" error message in the CLI). */
  allItems: TrackItem[];
}

/**
 * Conductor view: everything attributed to one Track work-package item. Joins
 * sessions to the WP via the Track ledger (Codex thread-id / h2a instance id).
 */
export function wpAgentStats(
  repoRoot: string,
  trackItemId: string,
  opts: ComputeOptions = {},
): WpAgentStatsResult {
  const { links, facts, trackItems } = computeAgentStats(repoRoot, opts);
  const allItems = Array.from(trackItems.values());
  // Accept the exact id or a WP label (e.g. "WP9") as a convenience.
  const item = trackItems.get(trackItemId)
    ?? allItems.find((i) => i.wp && i.wp.toLowerCase() === trackItemId.toLowerCase());

  const factById = new Map(facts.map((f) => [f.factId, f]));
  const wpLinks = links.filter(
    (l) => l.target.kind === "wp" && item && l.target.trackItemId === item.trackItemId,
  );
  const sessions = wpLinks
    .map((l) => {
      const fact = factById.get(l.factId);
      return fact ? { fact, agentId: l.agentId, rule: l.rule } : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return { item, links: wpLinks, sessions, allItems };
}

/** Render the `agent-stats wp <id>` conductor view as a text block. */
export function formatWpView(result: WpAgentStatsResult, trackItemId: string): string {
  if (!result.item) {
    const known = result.allItems
      .filter((i) => i.wp)
      .map((i) => `  ${i.trackItemId}  ${i.wp}  ${i.title.slice(0, 48)}`)
      .join("\n");
    return `No Track work-package matches "${trackItemId}".` + (known ? `\nKnown WP items:\n${known}` : "");
  }
  const item = result.item;
  const lines = [
    `Work-package: ${item.wp ?? "(no WP label)"}  [${item.trackItemId}]`,
    `Title: ${item.title}`,
    `Mandated thread-ids: ${item.threadIds.length ? item.threadIds.map((t) => t.slice(0, 8) + "…").join(", ") : "-"}`,
    `Mandated h2a instances: ${item.h2aInstanceIds.length ? item.h2aInstanceIds.join(", ") : "-"}`,
    "",
  ];
  if (result.sessions.length === 0) {
    lines.push("No sessions joined to this WP yet (run `agent-stats sync` first, or no transcript matched a mandated id).");
    return lines.join("\n");
  }
  const agents = new Map<string, { sessions: number; rules: Set<string> }>();
  for (const s of result.sessions) {
    let a = agents.get(s.agentId);
    if (!a) {
      a = { sessions: 0, rules: new Set() };
      agents.set(s.agentId, a);
    }
    a.sessions += 1;
    a.rules.add(s.rule);
  }
  lines.push(`Agents (${agents.size}):`);
  for (const [agentId, a] of agents) {
    lines.push(`  ${agentId}  —  ${a.sessions} session(s)  via ${Array.from(a.rules).join(",")}`);
  }
  lines.push("", `Sessions (${result.sessions.length}):`);
  for (const s of result.sessions) {
    lines.push(`  ${s.fact.host}:${s.fact.sessionId.slice(0, 8)}  ${s.agentId}  (${s.rule})`);
  }
  return lines.join("\n");
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
  type TrackItem,
};
