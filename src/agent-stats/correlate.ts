/**
 * WP9 agent-stats — evidence-ranked correlation.
 *
 * The whole point of WP9: re-derive WHICH AGENT produced a given commit/branch,
 * using session evidence, never git authorship. Each correlation link is tagged
 * with the rule that produced it, an anonymized evidence string, and a
 * confidence band. Ranks (1 = strongest):
 *
 *   rank 1  commit-sha-output  — a commit sha the session itself printed in a
 *           `git commit` tool OUTPUT, confirmed present in `git log`. This is
 *           the ground truth: the session demonstrably created that commit.
 *   rank 2  pr-merge           — a PR's merged main commit (squash/rebase erases
 *           the per-commit shas the session printed). We attribute the merge
 *           commit to the session that worked the PR's branch.
 *   rank 3  track-wp-thread-id / track-wp-h2a-id — the Track ledger mandated a
 *           work-package to this session's Codex thread-id (or its matched h2a
 *           instance id). Attributes the WP to the agent. (WP identity.)
 *   rank 4  h2a-registry       — the session's (host, cwd) maps to a registered
 *           h2a instance id; that id IS the agent identity. (Identity, not
 *           commit-level proof.)
 *   rank 5  worktree-branch-window — the session worked on branch B in a
 *           worktree whose lifetime overlaps the branch's commits. Weakest.
 */

import { branchFromCheckoutCommand } from "./git-evidence.js";
import { matchInstance, type H2aInstance } from "./registry.js";
import { resolveIdentity } from "./identity.js";
import type { TrackIndex, TrackItem } from "./track-join.js";
import type { CorrelationLink, SessionFact } from "./types.js";

export interface GitCommitMeta {
  sha: string; // full or abbreviated
  /** Parent commit shas, in git-log order. Present when read for graph skeletons. */
  parentShas?: string[];
  /** Branch/ref name when the commit was reached from a branch-specific query. */
  branch?: string;
  subject?: string;
  /**
   * Committer date (`git log %cI`) as epoch-MILLISECONDS, when known. T2: the
   * ground-truth point-in-time for the commit, stamped onto Commit nodes as the
   * shared-scene-contract `t` (see project-graph.ts). COMMITTER-date — not
   * author-date — because rebase / cherry-pick rewrite the committer-date to
   * when the commit actually landed, which is what a timeline should show.
   */
  committedAtMs?: number;
}

/**
 * Merged-PR attribution input (one per PR a session worked). `branch` ties the
 * PR to the session that worked that branch; `mergeCommit` is the squashed
 * commit that actually landed on main.
 */
export interface PrMergeMeta {
  number: number;
  branch?: string;
  /** Full sha of the commit that landed on the base branch (if merged). */
  mergeCommit?: string;
  /** PR url, when known (for the link target). */
  url?: string;
}

export interface CorrelateInput {
  facts: SessionFact[];
  instances: H2aInstance[];
  /** Known commits in the repo (`git log`), keyed for sha-prefix matching. */
  commits: GitCommitMeta[];
  /** Track-ledger WP join index (thread-id / h2a-id → WP). Optional. */
  trackIndex?: TrackIndex;
  /** Merged-PR attribution (PR number → merge commit), keyed for branch join. */
  prMerges?: PrMergeMeta[];
}

/** Index commits by their abbreviated (7-char) sha prefix for fast lookup. */
function indexCommits(commits: GitCommitMeta[]): Map<string, GitCommitMeta> {
  const byPrefix = new Map<string, GitCommitMeta>();
  for (const c of commits) {
    const full = c.sha;
    if (full.length >= 7) byPrefix.set(full.slice(0, 7), c);
  }
  return byPrefix;
}

/** True when `observed` (>=7 chars) identifies the same commit as `known`. */
function shaMatches(observed: string, known: string): boolean {
  const a = observed.toLowerCase();
  const b = known.toLowerCase();
  const n = Math.min(a.length, b.length);
  return n >= 7 && a.slice(0, n) === b.slice(0, n);
}

/**
 * Branches the session DEMONSTRABLY worked: a branch its own `git commit`
 * output named (`[branch sha]`), or one it created via `checkout -b` /
 * `switch -c`. Merely OBSERVING a branch (host metadata) is not work — that
 * is what made rank-2/4/5 spoofable on read-only sessions.
 */
export function workedBranches(fact: SessionFact): Set<string> {
  const out = new Set<string>(fact.groundTruth.branches);
  for (const action of fact.gitActions) {
    if (action.verb !== "checkout-b") continue;
    const branch = branchFromCheckoutCommand(action.command);
    if (branch) out.add(branch);
  }
  return out;
}

/**
 * Produce ranked, evidence-tagged correlation links for every session.
 * A session may emit multiple links (e.g. one per commit it created, plus its
 * h2a identity link).
 */
export function correlate(input: CorrelateInput): CorrelationLink[] {
  const links: CorrelationLink[] = [];
  const byPrefix = indexCommits(input.commits);
  const mergeByBranch = indexPrMergesByBranch(input.prMerges ?? []);

  // COMMITTER PRECEDENCE (Phase 2): which facts have COMMIT-level evidence on
  // each branch (their own `git commit` output named it). Used to keep a
  // pr-merge squash commit away from a session that merely `checkout -b`'d
  // the branch when somebody else demonstrably authored the work.
  const committersByBranch = new Map<string, Set<string>>();
  for (const fact of input.facts) {
    for (const branch of fact.groundTruth.branches) {
      let set = committersByBranch.get(branch);
      if (!set) committersByBranch.set(branch, (set = new Set()));
      set.add(fact.factId);
    }
  }

  for (const fact of input.facts) {
    const inst = matchInstance(input.instances, fact.host, fact.cwds);
    const agentId = resolveIdentity(fact, inst).agentId;
    const worked = workedBranches(fact);

    // ----- rank 1: commit-sha from this session's own git commit output -----
    for (const observed of fact.groundTruth.commitShas) {
      const known = byPrefix.get(observed.slice(0, 7).toLowerCase());
      const match = known && shaMatches(observed, known.sha) ? known : findByScan(observed, input.commits);
      if (match) {
        // Prefer the branch git log reports; fall back to the branch the session
        // itself printed alongside this sha in the `[branch sha]` commit line.
        const branch = match.branch ?? fact.groundTruth.shaBranch[observed.slice(0, 7)];
        links.push({
          factId: fact.factId,
          agentId,
          target: { kind: "commit", sha: match.sha, branch },
          rank: 1,
          rule: "commit-sha-output",
          confidence: "high",
          evidence: `session printed "[${branch ?? "?"} ${observed.slice(0, 7)}]" in a git commit output; sha is present in git log`,
        });
      }
    }

    // ----- rank 2: PR-merge — squash/rebase erases per-commit shas -----
    // For each branch the session demonstrably worked, if a merged PR for that
    // branch landed a (squashed) commit on the base, attribute THAT commit to
    // the session. The merge commit's sha is never one the session printed, so
    // rank 1 can't catch it; this is the bridge from branch work to main.
    for (const branch of new Set([...fact.branchesObserved, ...worked])) {
      if (isHousekeepingBranch(branch)) continue;
      const merge = mergeByBranch.get(branch);
      if (!merge || !merge.mergeCommit) continue;
      // BRANCH-SCOPED: the session must have committed on / created THAT
      // branch — committing somewhere else does not earn this squash commit.
      if (!worked.has(branch)) continue;
      // COMMITTER PRECEDENCE: when this session only CREATED the branch
      // (checkout -b) and ANOTHER session demonstrably committed on it, the
      // squash commit belongs to the committer(s), not the scaffolder.
      const committers = committersByBranch.get(branch);
      const isCommitter = fact.groundTruth.branches.includes(branch);
      if (!isCommitter && committers && committers.size > 0) continue;
      links.push({
        factId: fact.factId,
        agentId,
        target: { kind: "commit", sha: merge.mergeCommit, branch },
        rank: 2,
        rule: "pr-merge",
        confidence: "high",
        evidence: `session ${isCommitter ? "committed on" : "created"} branch "${branch}"; PR #${merge.number} merged it as commit ${merge.mergeCommit.slice(0, 7)} on the base branch`,
      });
    }

    // ----- rank 3: Track-WP join via Codex thread-id / h2a instance id -----
    // The Track ledger mandated a WP to this session's Codex thread-id (the
    // session_meta.id / parent_thread_id) or to its matched h2a instance id.
    if (input.trackIndex) {
      const seenWp = new Set<string>();
      const emitWp = (item: TrackItem, rule: "track-wp-thread-id" | "track-wp-h2a-id", evidence: string) => {
        if (seenWp.has(item.trackItemId)) return;
        seenWp.add(item.trackItemId);
        links.push({
          factId: fact.factId,
          agentId,
          target: { kind: "wp", trackItemId: item.trackItemId, wp: item.wp ?? undefined },
          rank: 3,
          rule,
          confidence: "medium",
          evidence,
        });
      };
      // Codex session_meta.id == sessionId; parent_thread_id is the spawner.
      const threadCandidates = [fact.sessionId, fact.parent?.parentThreadId].filter(
        (x): x is string => Boolean(x),
      );
      for (const tid of threadCandidates) {
        // MULTI-WP: an id mandated to several WPs links to ALL of them.
        for (const item of input.trackIndex.byThreadId.get(tid.toLowerCase()) ?? []) {
          emitWp(
            item,
            "track-wp-thread-id",
            `Track ledger mandated ${item.wp ?? item.trackItemId} to Codex thread-id ${tid.slice(0, 8)}… (session_meta/parent_thread)`,
          );
        }
      }
      // h2a instance id (registered) appears in delegation envelopes.
      if (inst) {
        for (const item of input.trackIndex.byH2aId.get(inst.id) ?? []) {
          emitWp(
            item,
            "track-wp-h2a-id",
            `Track ledger mandated ${item.wp ?? item.trackItemId} to h2a instance "${inst.id}"`,
          );
        }
      }
    }

    // ----- rank 4: h2a registry identity (IDENTITY ONLY) -----
    // The registry proves WHO the session is, never WHAT it shipped. A branch
    // label is attached only when the session committed on / created that
    // exact branch itself; merely sitting on a branch earns nothing.
    if (inst) {
      const evidencedBranch = Array.from(worked).find((b) => !isHousekeepingBranch(b));
      links.push({
        factId: fact.factId,
        agentId,
        target: { kind: "branch", branch: evidencedBranch ?? "(workspace)" },
        rank: 4,
        rule: "h2a-registry",
        confidence: "medium",
        evidence: `session cwd is under registered h2a workspace "${inst.label}" (${inst.id})`,
      });
    }

    // ----- rank 5: worktree × branch × time window (weak) -----
    for (const branch of fact.branchesObserved) {
      if (isHousekeepingBranch(branch)) continue;
      // Only emit when the session actually performed a commit/checkout-b on
      // THAT branch and we have NOT already proven it via rank 1 or rank 2.
      const provenStrong = links.some(
        (l) =>
          l.factId === fact.factId &&
          l.rank <= 2 &&
          l.target.kind === "commit" &&
          l.target.branch === branch,
      );
      if (provenStrong) continue;
      if (!worked.has(branch)) continue;
      links.push({
        factId: fact.factId,
        agentId,
        target: { kind: "branch", branch },
        rank: 5,
        rule: "worktree-branch-window",
        confidence: "low",
        evidence: `session worked on branch "${branch}" in cwd window [${fact.startedAt ?? "?"}..${fact.endedAt ?? "?"}]`,
      });
    }
  }

  return links;
}

/** A commit claimed by more than one agent (spoof / data-quality signal). */
export interface CommitConflict {
  /** 7-char lowercase sha prefix identifying the contested commit. */
  sha: string;
  branch?: string;
  /** The competing claims, strongest rank first. */
  agents: { agentId: string; rule: CorrelationLink["rule"]; confidence: CorrelationLink["confidence"]; rank: number }[];
}

/**
 * Detect commits attributed to MORE THAN ONE distinct agent. Two sessions of
 * the SAME agent claiming a commit is normal (resumed session); two different
 * agents claiming it is not — it means a spoof slipped through or the evidence
 * is ambiguous. Surfaced in the report instead of silently picking a winner.
 */
export function detectCommitConflicts(links: CorrelationLink[]): CommitConflict[] {
  const bySha = new Map<string, { branch?: string; claims: Map<string, CommitConflict["agents"][number]> }>();
  for (const l of links) {
    if (l.target.kind !== "commit") continue;
    const key = l.target.sha.slice(0, 7).toLowerCase();
    let entry = bySha.get(key);
    if (!entry) bySha.set(key, (entry = { branch: l.target.branch, claims: new Map() }));
    if (!entry.branch && l.target.branch) entry.branch = l.target.branch;
    const prev = entry.claims.get(l.agentId);
    if (!prev || l.rank < prev.rank) {
      entry.claims.set(l.agentId, { agentId: l.agentId, rule: l.rule, confidence: l.confidence, rank: l.rank });
    }
  }
  const conflicts: CommitConflict[] = [];
  for (const [sha, entry] of bySha) {
    if (entry.claims.size < 2) continue;
    conflicts.push({
      sha,
      branch: entry.branch,
      agents: Array.from(entry.claims.values()).sort((a, b) => a.rank - b.rank || a.agentId.localeCompare(b.agentId)),
    });
  }
  return conflicts.sort((a, b) => a.sha.localeCompare(b.sha));
}

/** Index merged-PR attributions by branch (skips entries without a branch). */
function indexPrMergesByBranch(merges: PrMergeMeta[]): Map<string, PrMergeMeta> {
  const out = new Map<string, PrMergeMeta>();
  for (const m of merges) {
    if (m.branch && m.mergeCommit && !out.has(m.branch)) out.set(m.branch, m);
  }
  return out;
}

function findByScan(observed: string, commits: GitCommitMeta[]): GitCommitMeta | undefined {
  return commits.find((c) => shaMatches(observed, c.sha));
}

/** Default/housekeeping branches never earn branch credit (incl. `main`). */
export function isHousekeepingBranch(branch: string): boolean {
  return (
    branch === "HEAD" ||
    branch === "" ||
    branch === "main" ||
    branch === "master" ||
    branch.startsWith("worktree-agent-")
  );
}
