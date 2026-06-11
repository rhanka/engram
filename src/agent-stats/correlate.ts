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
 *   rank 2  h2a-registry       — the session's (host, cwd) maps to a registered
 *           h2a instance id; that id IS the agent identity. (Identity, not
 *           commit-level proof.)
 *   rank 3  worktree-branch-window — the session worked on branch B in a
 *           worktree whose lifetime overlaps the branch's commits. Weakest.
 *
 * Phase-1 hooks (NOT implemented here, intentionally left as TODOs):
 *   - Codex thread-id ↔ Track-WP join (attribute a sub-agent thread to a WP via
 *     the Track ledger).
 *   - PR-merge join (attribute the squashed/merge commit on main to the branch
 *     author session via the PR number parsed from `gh pr` output).
 */

import { matchInstance, type H2aInstance } from "./registry.js";
import { resolveIdentity } from "./identity.js";
import type { CorrelationLink, SessionFact } from "./types.js";

export interface GitCommitMeta {
  sha: string; // full or abbreviated
  branch?: string;
  subject?: string;
}

export interface CorrelateInput {
  facts: SessionFact[];
  instances: H2aInstance[];
  /** Known commits in the repo (`git log`), keyed for sha-prefix matching. */
  commits: GitCommitMeta[];
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
 * Produce ranked, evidence-tagged correlation links for every session.
 * A session may emit multiple links (e.g. one per commit it created, plus its
 * h2a identity link).
 */
export function correlate(input: CorrelateInput): CorrelationLink[] {
  const links: CorrelationLink[] = [];
  const byPrefix = indexCommits(input.commits);

  for (const fact of input.facts) {
    const inst = matchInstance(input.instances, fact.host, fact.cwds);
    const agentId = resolveIdentity(fact, inst).agentId;

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

    // ----- rank 2: h2a registry identity -----
    if (inst) {
      links.push({
        factId: fact.factId,
        agentId,
        target: { kind: "branch", branch: fact.branchesObserved[0] ?? "(workspace)" },
        rank: 2,
        rule: "h2a-registry",
        confidence: "medium",
        evidence: `session cwd is under registered h2a workspace "${inst.label}" (${inst.id})`,
      });
    }

    // ----- rank 3: worktree × branch × time window (weak) -----
    for (const branch of fact.branchesObserved) {
      if (isHousekeepingBranch(branch)) continue;
      // Only emit when the session actually performed a commit/checkout-b on it
      // and we have NOT already proven it via rank 1.
      const provenViaRank1 = links.some(
        (l) => l.factId === fact.factId && l.rank === 1 && l.target.kind === "commit" && l.target.branch === branch,
      );
      if (provenViaRank1) continue;
      const didWork = fact.gitActions.some((a) => a.verb === "commit" || a.verb === "checkout-b");
      if (!didWork) continue;
      links.push({
        factId: fact.factId,
        agentId,
        target: { kind: "branch", branch },
        rank: 3,
        rule: "worktree-branch-window",
        confidence: "low",
        evidence: `session worked on branch "${branch}" in cwd window [${fact.startedAt ?? "?"}..${fact.endedAt ?? "?"}]`,
      });
    }

    // TODO(Phase 1): codex thread-id ↔ Track-WP join via .graphify/track ledger.
    // TODO(Phase 1): PR-merge join — attribute main-branch squash/merge commit to
    //   the branch session using the PR number parsed from `gh pr` output
    //   (fact.groundTruth.prUrls) cross-referenced with the merge commit subject.
  }

  return links;
}

function findByScan(observed: string, commits: GitCommitMeta[]): GitCommitMeta | undefined {
  return commits.find((c) => shaMatches(observed, c.sha));
}

function isHousekeepingBranch(branch: string): boolean {
  return branch === "HEAD" || branch === "" || branch.startsWith("worktree-agent-");
}
