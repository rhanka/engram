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

/** Empty ground-truth accumulator. */
export function emptyGroundTruth(): GroundTruth {
  return { commitShas: [], branches: [], shaBranch: {}, prUrls: [] };
}

/**
 * Scrape a tool OUTPUT string for ground-truth git facts and merge into `acc`.
 * Recognizes:
 *   - `[branch abc1234] subject`  → commit sha + branch
 *   - `https://github.com/<repo>/pull/<n>` → PR url
 */
export function scrapeGroundTruth(output: string, acc: GroundTruth): void {
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
    if (url && !acc.prUrls.includes(url)) acc.prUrls.push(url);
  }
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
