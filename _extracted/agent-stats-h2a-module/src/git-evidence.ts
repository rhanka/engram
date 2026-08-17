/**
 * WP9 agent-stats — git verb + ground-truth extraction shared by every parser.
 *
 * INPUT side (what the agent asked for): classify a shell command into a git
 * verb. OUTPUT side (ground truth): scrape what git/gh actually reported.
 */

import type { GitAction, GroundTruth } from "./types.js";

/** Classify a shell command string into a coarse git verb. */
export function classifyGitVerb(command: string): GitAction["verb"] | null {
  if (typeof command !== "string") return null;
  const c = command;
  // gh first (so "gh pr create" isn't swallowed by a later git check).
  if (/\bgh\s+pr\s+create\b/.test(c)) return "pr-create";
  if (/\bgh\s+pr\s+merge\b/.test(c)) return "pr-merge";
  if (/\bgit\s+checkout\s+-b\b/.test(c) || /\bgit\s+switch\s+-c\b/.test(c)) return "checkout-b";
  if (/\bgit\s+commit\b/.test(c)) return "commit";
  if (/\bgit\s+push\b/.test(c)) return "push";
  if (/\bgit\b/.test(c) || /\bgh\b/.test(c)) return "other";
  return null;
}

const COMMIT_LINE_RE = /\[([A-Za-z0-9._/\-]+)\s+([0-9a-f]{7,40})\]/g;
const PR_URL_RE = /https?:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/g;

/**
 * SPOOF-RESISTANCE (Phase 1.5): ground truth may only be scraped from the
 * OUTPUT of a command whose INPUT classified as one of these mutating git
 * verbs. A session that merely `cat`s/`grep`s another transcript or a CI log
 * must never acquire the shas / PR urls printed in that text.
 */
export const GROUND_TRUTH_VERBS: ReadonlySet<GitAction["verb"]> = new Set([
  "commit",
  "checkout-b",
  "push",
  "pr-create",
  "pr-merge",
]);

/** True when a classified verb is allowed to feed {@link scrapeGroundTruth}. */
export function isGroundTruthVerb(verb: GitAction["verb"] | null): boolean {
  return verb !== null && GROUND_TRUTH_VERBS.has(verb);
}

/** Parse the branch name out of a `git checkout -b X` / `git switch -c X`. */
export function branchFromCheckoutCommand(command: string): string | null {
  if (typeof command !== "string") return null;
  const m = command.match(/\bgit\s+(?:checkout\s+-b|switch\s+-c)\s+(?:--\s+)?([^\s;|&"']+)/);
  return m && m[1] ? m[1] : null;
}

/** Empty ground-truth accumulator. */
export function emptyGroundTruth(): GroundTruth {
  return { commitShas: [], branches: [], shaBranch: {}, prUrls: [] };
}

/**
 * Scrape a tool OUTPUT string for ground-truth git facts and merge into `acc`.
 * Recognizes:
 *   - `[branch abc1234] subject`  → commit sha + branch
 *   - `https://github.com/<repo>/pull/<n>` → PR url
 * When `originRepo` ("owner/name") is given, PR urls from other repos are
 * ignored — a session cannot acquire foreign-repo PRs.
 */
export function scrapeGroundTruth(output: string, acc: GroundTruth, originRepo?: string): void {
  if (typeof output !== "string" || output.length === 0) return;
  let m: RegExpExecArray | null;
  COMMIT_LINE_RE.lastIndex = 0;
  while ((m = COMMIT_LINE_RE.exec(output)) !== null) {
    const branch = m[1];
    const sha = m[2];
    if (branch && !acc.branches.includes(branch)) acc.branches.push(branch);
    if (sha && !acc.commitShas.includes(sha)) acc.commitShas.push(sha);
    if (branch && sha) acc.shaBranch[sha.slice(0, 7)] = branch;
  }
  PR_URL_RE.lastIndex = 0;
  while ((m = PR_URL_RE.exec(output)) !== null) {
    const url = m[0];
    if (url && prUrlInRepo(url, originRepo) && !acc.prUrls.includes(url)) acc.prUrls.push(url);
  }
}

/** True when a PR url belongs to `originRepo` ("owner/name"); permissive when unknown. */
export function prUrlInRepo(url: string, originRepo?: string): boolean {
  if (!originRepo) return true;
  return url.toLowerCase().startsWith(`https://github.com/${originRepo.toLowerCase()}/pull/`);
}

/**
 * Parse a WP label (e.g. "WP1", "wp9") out of a branch name or commit subject.
 * Returns a normalized uppercase label like `WP1`, or null. Also recognizes the
 * common `wp1-repo-keys` branch convention used in this repo.
 */
export function parseWpLabel(text: string): string | null {
  if (typeof text !== "string") return null;
  const m = text.match(/\b[wW][pP]\s?-?(\d{1,3})\b/);
  if (m) return `WP${m[1]}`;
  return null;
}
