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
import { parseAgyChats } from "./agy-chat.js";
import { parseClaudeTranscript } from "./claude-transcript.js";
import { parseCodexRollout } from "./codex-rollout.js";
import { correlate, detectCommitConflicts, type CommitConflict, type GitCommitMeta, type PrMergeMeta } from "./correlate.js";
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
import { aggregate, costWeightedTokens, formatSessionsTable, formatStatsTable } from "./stats.js";
import {
  appendLinks,
  ensureStore,
  linkKey,
  loadCursors,
  loadFacts,
  loadLinks,
  resolveStore,
  saveCursors,
  saveFacts,
  type AgentStore,
} from "./store.js";
import { githubRepoFromRemote } from "../pr.js";
import { parseWpLabel, prUrlInRepo } from "./git-evidence.js";
import {
  buildProjectGraph,
  sessionFactToInput,
  PROJECT_GRAPH_SCHEMA,
  type ProjectGraph,
  type ProjectIdentity,
  type SessionInput,
} from "./project-graph.js";
import type {
  AgentStatsRow,
  AttributionResidual,
  CorrelationLink,
  FileCursor,
  SessionFact,
} from "./types.js";

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

export interface ReadGitCommitsOptions {
  /** Hybrid skeleton window: bounded history, default 6 months. */
  since?: string;
  /** Safety cap for visualization exports, default 2000. */
  maxCount?: number;
}

/** Read a bounded `git log --all` for correlation and project-graph skeletons. */
export function readGitCommits(repoRoot: string, opts: ReadGitCommitsOptions = {}): GitCommitMeta[] {
  // Reuse the project's ESM-safe git helper (the bundler cannot dynamic-require
  // child_process). Pipe-delimited; `%cI` (strict ISO-8601) sits BETWEEN the sha
  // and the subject. ISO-8601 contains no pipe, so a subject that itself holds
  // pipes still survives intact (everything after the 2nd pipe is the subject).
  const args = ["log", "--all", `--max-count=${opts.maxCount ?? 2000}`];
  if (opts.since !== "all") args.push(`--since=${opts.since ?? "6 months ago"}`);
  args.push("--format=%H|%P|%cI|%s");
  const out = safeExecGit(repoRoot, args);
  if (!out) return [];
  const commits: GitCommitMeta[] = [];
  for (const line of out.split("\n")) {
    const i1 = line.indexOf("|");
    if (i1 < 7) continue;
    const i2 = line.indexOf("|", i1 + 1);
    if (i2 < 0) continue;
    const i3 = line.indexOf("|", i2 + 1);
    if (i3 < 0) continue;
    const sha = line.slice(0, i1);
    if (sha.length < 7) continue;
    const parents = line.slice(i1 + 1, i2).trim();
    const dateIso = line.slice(i2 + 1, i3);
    const subject = line.slice(i3 + 1);
    const ms = Date.parse(dateIso);
    commits.push({
      sha,
      parentShas: parents ? parents.split(/\s+/).filter(Boolean) : [],
      subject,
      committedAtMs: Number.isFinite(ms) ? ms : undefined,
    });
  }
  return commits;
}

export interface GitBranchHead {
  name: string;
  sha: string;
}

/** Read local branch heads for the project graph skeleton. */
export function readGitBranchHeads(repoRoot: string): GitBranchHead[] {
  const out = safeExecGit(repoRoot, ["for-each-ref", "--format=%(refname:short)|%(objectname)", "refs/heads"]);
  if (!out) return [];
  return out
    .split("\n")
    .map((line) => {
      const i = line.indexOf("|");
      if (i <= 0) return undefined;
      const name = line.slice(0, i);
      const sha = line.slice(i + 1);
      return sha.length >= 7 ? { name, sha } : undefined;
    })
    .filter((x): x is GitBranchHead => !!x);
}

/** Resolve the origin GitHub repo ("owner/name") for PR-url scoping. */
export function resolveOriginRepo(repoRoot: string, runner?: CommandRunner): string | undefined {
  try {
    const url = runner
      ? runner.run("git", ["remote", "get-url", "origin"], repoRoot)
      : safeExecGit(repoRoot, ["remote", "get-url", "origin"]);
    return url ? githubRepoFromRemote(url) : undefined;
  } catch {
    return undefined;
  }
}

function parseFile(
  file: TranscriptFile,
  home: string,
  scope?: { repoRoot: string; originRepo?: string },
): { fact: SessionFact; agyHash?: string }[] {
  let content: string;
  try {
    content = readFileSync(file.path, "utf-8");
  } catch {
    return [];
  }
  const parseOpts = { scopeRoot: scope?.repoRoot, originRepo: scope?.originRepo };
  if (file.host === "claude") {
    return [{ fact: normalizeClaude(parseClaudeTranscript(content, file.sessionId, home, parseOpts)) }];
  }
  if (file.host === "codex") {
    return [{ fact: normalizeCodex(parseCodexRollout(content, file.sessionId, home, parseOpts)) }];
  }
  // agy: a single chat file may hold several logical sessions.
  // projectHash is on the header; if absent, derive from the dir name.
  const projectHashFromDir = file.path.match(/\.gemini\/tmp\/([^/]+)\//)?.[1];
  return parseAgyChats(content, file.sessionId, home, parseOpts).map((raw) => ({
    fact: normalizeAgy(raw),
    agyHash: raw.projectHash ?? projectHashFromDir,
  }));
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

/**
 * Cheap codex pre-filter for the project-graph loader: like
 * {@link codexHeaderMaybeInRepo} but tests the header cwd against ANY of the
 * project's rename-lineage path prefixes. Conservative: if no cwd is found in
 * the head, parse (return true).
 */
function codexHeaderMaybeInPrefixes(path: string, prefixes: string[]): boolean {
  const head = readHead(path, 4 * 1024);
  if (!head) return true;
  const m = head.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m || typeof m[1] !== "string") return true;
  const cwd = m[1].replace(/\\(.)/g, "$1");
  return prefixes.some((p) => {
    const pp = p.replace(/\/+$/, "");
    return cwd === pp || cwd.startsWith(pp + "/");
  });
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
  const originRepo = resolveOriginRepo(opts.repoRoot);
  const facts = loadFacts(store);
  const cursors = loadCursors(store, home);

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

    const results = parseFile(file, home, { repoRoot: opts.repoRoot, originRepo });
    cursors.set(file.path, cursorCurrent(prev, file.path)!);
    if (results.length === 0) continue;
    parsed++;
    for (const { fact, agyHash } of results) {
      if (!factInRepo(fact, scope, agyHash)) continue;
      inRepo++;
      facts.set(fact.factId, fact);
    }
  }

  saveFacts(store, facts);
  saveCursors(store, cursors, home);
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
  // ORIGIN SCOPING: PR urls a session printed are only trusted when they
  // belong to this repo's origin — a pasted/echoed foreign-repo PR url must
  // not seed an attribution lookup.
  const originRepo = resolveOriginRepo(repoRoot, runner);
  // Gather candidate (branch, prNumber) pairs from session evidence.
  const prByBranch = new Map<string, number>();
  const branches = new Set<string>();
  for (const fact of facts) {
    for (const b of fact.branchesObserved) if (b && b !== "HEAD") branches.add(b);
    for (const url of fact.groundTruth.prUrls) {
      if (!prUrlInRepo(url, originRepo)) continue;
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
  /** Honest coverage: commits in git log NOT attributed to any agent. */
  residual?: AttributionResidual;
  /** Commits claimed by more than one agent (spoof / data-quality signal). */
  conflicts: CommitConflict[];
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

  const derived = correlate({ facts, instances, commits, trackIndex, prMerges });

  // PERSISTED ATTRIBUTION (append-only, re-derivable): keep every resolved
  // link in `.graphify/agents/links.jsonl` so attribution does not decay when
  // a branch is GC'd or a squash hides the original shas from `git log`.
  const persisted = loadLinks(store);
  const seen = new Set(derived.map(linkKey));
  const links = [...derived];
  for (const link of persisted) {
    const key = linkKey(link);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }
  try {
    appendLinks(store, derived);
  } catch {
    /* read-only store — stats still work, persistence is best-effort */
  }

  const rows = aggregate({ facts, links, instances });

  // Residual coverage: commits nobody claimed (by 7-char sha prefix).
  const attributed = new Set<string>();
  for (const link of links) {
    if (link.target.kind === "commit") attributed.add(link.target.sha.slice(0, 7).toLowerCase());
  }
  const unattributedCommits = commits.filter((c) => !attributed.has(c.sha.slice(0, 7).toLowerCase())).length;
  const residual: AttributionResidual = { totalCommits: commits.length, unattributedCommits };

  // CONFLICTS: a commit claimed by >1 distinct agent is surfaced, not hidden.
  const conflicts = detectCommitConflicts(links);

  return { rows, links, facts, instances, trackItems, residual, conflicts };
}

export interface WpAgentStatsResult {
  item?: TrackItem;
  /** Correlation links targeting this track item (Track-WP joins). */
  links: CorrelationLink[];
  /** MANDATED sessions (Track-ledger join), with their resolved identity. */
  sessions: { fact: SessionFact; agentId: string; rule: CorrelationLink["rule"] }[];
  /** EVIDENCED deliverers: sessions with commit-level proof on a WP branch. */
  evidenced: { fact: SessionFact; agentId: string; via: string }[];
  /** True when the mandated and evidenced agent sets disagree (both known). */
  mismatch: boolean;
  /** Per-WP rollup over the attributed sessions. */
  rollup: { tokens: number; tokensWeighted: number; commits: number };
  /** All track items (for an "unknown id" error message in the CLI). */
  allItems: TrackItem[];
}

/**
 * Conductor view: everything attributed to one Track work-package item.
 * Shows BOTH sides of attribution:
 *   - mandated   — the ledger said this session/agent owns the WP;
 *   - evidenced  — a session printed commit-level proof on a WP-labelled
 *                  branch (rank 1/2), whether or not it was mandated.
 * The two disagreeing is itself a signal, so it is surfaced, not hidden.
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

  // Evidenced deliverers: rank-1/2 commit links on a branch carrying this WP
  // label (e.g. `wp9-…`). Independent of the mandate — that is the point.
  const evidenced: WpAgentStatsResult["evidenced"] = [];
  const evidencedSeen = new Set<string>();
  if (item?.wp) {
    for (const l of links) {
      if (l.rank > 2 || l.target.kind !== "commit" || !l.target.branch) continue;
      if (parseWpLabel(l.target.branch) !== item.wp) continue;
      if (evidencedSeen.has(l.factId)) continue;
      evidencedSeen.add(l.factId);
      const fact = factById.get(l.factId);
      if (fact) evidenced.push({ fact, agentId: l.agentId, via: `${l.rule} on ${l.target.branch}` });
    }
  }

  const mandatedAgents = new Set(sessions.map((s) => s.agentId));
  const evidencedAgents = new Set(evidenced.map((s) => s.agentId));
  const mismatch =
    mandatedAgents.size > 0 &&
    evidencedAgents.size > 0 &&
    (Array.from(evidencedAgents).some((a) => !mandatedAgents.has(a)) ||
      Array.from(mandatedAgents).some((a) => !evidencedAgents.has(a)));

  // Per-WP rollup over the union of attributed sessions.
  const rollupFacts = new Map<string, SessionFact>();
  for (const s of sessions) rollupFacts.set(s.fact.factId, s.fact);
  for (const s of evidenced) rollupFacts.set(s.fact.factId, s.fact);
  const commitShas = new Set<string>();
  for (const l of links) {
    if (l.rank > 2 || l.target.kind !== "commit") continue;
    if (!rollupFacts.has(l.factId)) continue;
    commitShas.add(l.target.sha.slice(0, 7));
  }
  let tokens = 0;
  let tokensWeighted = 0;
  for (const f of rollupFacts.values()) {
    tokens += f.tokens.total || 0;
    tokensWeighted += costWeightedTokens(f.tokens, f.host);
  }
  const rollup = { tokens, tokensWeighted, commits: commitShas.size };

  return { item, links: wpLinks, sessions, evidenced, mismatch, rollup, allItems };
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
  if (result.sessions.length === 0 && result.evidenced.length === 0) {
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
  lines.push("", `Mandated sessions (${result.sessions.length}):`);
  for (const s of result.sessions) {
    lines.push(`  ${s.fact.host}:${s.fact.sessionId.slice(0, 8)}  ${s.agentId}  (${s.rule})`);
  }
  lines.push("", `Evidenced deliverers (${result.evidenced.length}):`);
  if (result.evidenced.length === 0) lines.push("  (no commit-level proof on a WP-labelled branch)");
  for (const s of result.evidenced) {
    lines.push(`  ${s.fact.host}:${s.fact.sessionId.slice(0, 8)}  ${s.agentId}  (${s.via})`);
  }
  if (result.mismatch) {
    lines.push(
      "",
      "WARNING: mandated and evidenced agents disagree — the ledger mandate and the commit-level evidence point at different sessions.",
    );
  }
  lines.push(
    "",
    `Rollup: ${result.rollup.commits} commit(s), ${result.rollup.tokens} tokens (${result.rollup.tokensWeighted} cost-weighted) across ${result.sessions.length + result.evidenced.length} session(s).`,
  );
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

/**
 * PROJECT/CONVERSATION GRAPH — rename-aware.
 *
 * Load every session across a project's rename lineage (sentropic → graphify →
 * regraphify …) and build a graphify graph.json from it. Unlike the per-repo
 * stats store (which is scoped to ONE cwd path), this scans the transcripts of
 * EVERY alias path-prefix the project has lived at, so renames reconcile into a
 * single project node. Pure builder lives in `project-graph.ts`; this is the
 * fs-touching loader that feeds it.
 */
export interface LoadSessionsOptions {
  identity: ProjectGraphIdentity;
  home?: string;
}

/**
 * Discover + parse transcripts for every alias of a project identity, returning
 * deduped session inputs (one per factId, latest wins). Reuses the same host
 * parsers as `sync`, but discovers across ALL the project's historical paths.
 */
export function loadSessionsForIdentity(opts: LoadSessionsOptions): SessionInput[] {
  const home = opts.home ?? homedir();
  const aliasPrefixes = opts.identity.aliases.flatMap((a) =>
    a.pathPrefixes.map((p) => (p.startsWith("~") ? p.replace(/^~/, home) : p)),
  );
  const inIdentity = (cwds: string[]): boolean =>
    cwds.some((c) => {
      const abs = c.startsWith("~") ? c.replace(/^~/, home) : c;
      return aliasPrefixes.some((p) => abs === p || abs.startsWith(p.replace(/\/+$/, "") + "/"));
    });

  // Discover: Claude transcripts per alias slug; codex/agy scanned globally and
  // filtered by parsed cwd (their discovery is path-agnostic).
  const seenPaths = new Set<string>();
  const files: TranscriptFile[] = [];
  for (const prefix of aliasPrefixes) {
    for (const f of discoverClaude(home, repoSlug(prefix))) {
      if (!seenPaths.has(f.path)) {
        seenPaths.add(f.path);
        files.push(f);
      }
    }
  }
  for (const f of [...discoverCodex(home), ...discoverAgy(home)]) {
    if (!seenPaths.has(f.path)) {
      seenPaths.add(f.path);
      files.push(f);
    }
  }

  const instances = loadH2aInstances(opts.identity.repoRootForRegistry ?? aliasPrefixes[0] ?? ".");
  const byFactId = new Map<string, SessionInput>();
  for (const file of files) {
    // Cheap codex pre-filter: ~3000 rollouts mostly belong to OTHER repos. Skip a
    // multi-MB read when the session_meta header cwd is outside this project's
    // rename lineage (same header trick `sync` uses, generalized to N prefixes).
    if (file.host === "codex" && !codexHeaderMaybeInPrefixes(file.path, aliasPrefixes)) {
      continue;
    }
    let results;
    try {
      results = parseFile(file, home);
    } catch {
      continue;
    }
    for (const { fact } of results) {
      // Tilde-normalize cwds for the membership test (parsers redact to `~`).
      const cwds = fact.cwds.map((c) => (c.startsWith("~") ? c.replace(/^~/, home) : c));
      if (!inIdentity(cwds)) continue;
      const inst = matchInstance(instances, fact.host, fact.cwds);
      const agentId = resolveIdentity(fact, inst).agentId;
      byFactId.set(fact.factId, sessionFactToInput(fact, agentId));
    }
  }
  return Array.from(byFactId.values());
}

/** Identity passed to the project-graph loader (adds a registry-root hint). */
export type ProjectGraphIdentity = ProjectIdentity & { repoRootForRegistry?: string };

/**
 * End-to-end: load every session across the rename lineage and build the
 * graph.json object. Returns the graph plus a small summary for the CLI.
 */
export function buildProjectGraphForIdentity(
  identity: ProjectGraphIdentity,
  opts: {
    home?: string;
    includeCommits?: boolean;
    includeBranches?: boolean;
    /** Inject git commits (skips `git log`); else read bounded history from the registry root. */
    commits?: GitCommitMeta[];
    /** Inject branch heads; else read from the registry root. */
    branchHeads?: GitBranchHead[];
    gitSince?: string;
    gitMaxCount?: number;
    includeHubEdges?: boolean;
  } = {},
): { graph: ProjectGraph; sessions: number } {
  const home = opts.home ?? homedir();
  const sessions = loadSessionsForIdentity({ identity, home });
  // T2: stamp Commit nodes (and widen derived Branch/Agent/Project spans) from
  // git committer-dates. Read `git log` from the registry / current-incarnation
  // root (the same root loadSessionsForIdentity uses for the h2a registry). A
  // missing / non-repo root degrades to [] (safeExecGit returns "") — the graph
  // then stays byte-identical to pre-T2 output.
  const gitRoot =
    identity.repoRootForRegistry ??
    (identity.aliases[0]?.pathPrefixes[0]
      ? identity.aliases[0]!.pathPrefixes[0]!.replace(/^~/, home)
      : undefined);
  const commits = opts.commits ?? (gitRoot ? readGitCommits(gitRoot, { since: opts.gitSince, maxCount: opts.gitMaxCount }) : []);
  const branchHeads = opts.branchHeads ?? (gitRoot ? readGitBranchHeads(gitRoot) : []);
  const graph = buildProjectGraph({
    identity,
    sessions,
    includeCommits: opts.includeCommits,
    includeBranches: opts.includeBranches,
    commits,
    branchHeads,
    includeHubEdges: opts.includeHubEdges,
    provenance: {
      tool: "graphify agent-stats project-graph",
      schema: PROJECT_GRAPH_SCHEMA,
      generatedAt: new Date().toISOString(),
      project: identity.canonicalId,
      aliases: identity.aliases.map((a) => a.name),
    },
  });
  return { graph, sessions: sessions.length };
}

export {
  formatStatsTable,
  formatSessionsTable,
  agyProjectHash,
  type RepoScope,
  type AgentStore,
  type TrackItem,
};
export { detectCommitConflicts, type CommitConflict } from "./correlate.js";
export {
  buildProjectGraph,
  sessionFactToInput,
  aliasForCwd,
  PROJECT_GRAPH_SCHEMA,
  type ProjectGraph,
  type ProjectIdentity,
  type ProjectAlias,
  type SessionInput,
} from "./project-graph.js";
export {
  AGENT_STATS_SCHEMA,
  SESSIONS_SCHEMA,
  buildReport,
  buildSessionsReport,
  filterReportAgents,
  formatReportMarkdown,
  formatReportText,
  type AgentReport,
  type AgentStatsReport,
  type SessionsReport,
} from "./report.js";
