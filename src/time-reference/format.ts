/**
 * Leaf format helpers shared by validators and the milestone evaluator.
 * No imports from sibling modules: this file is the bottom of the
 * time-reference import graph (only `node:crypto`-free pure code here).
 */

export const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
export const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
export const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function isInstant(v: unknown): v is string {
  return typeof v === "string" && INSTANT_RE.test(v) && !Number.isNaN(Date.parse(v));
}

export function isDigest(v: unknown): v is string {
  return typeof v === "string" && DIGEST_RE.test(v);
}

/** Duration sample in seconds from two instants, or null with a reason. */
export function durationSeconds(start: string, end: string): { seconds: number | null; reason?: string } {
  if (!isInstant(start) || !isInstant(end)) return { seconds: null, reason: "absent-or-malformed-instant" };
  const ms = Date.parse(end) - Date.parse(start);
  if (ms < 0) return { seconds: null, reason: "negative-duration-quarantined" };
  if (ms === 0) return { seconds: null, reason: "zero-duration-quarantined" };
  if (ms % 1000 !== 0) return { seconds: null, reason: "subsecond-precision-not-stored" };
  return { seconds: ms / 1000 };
}
