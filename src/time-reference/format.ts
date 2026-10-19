/**
 * Leaf format helpers shared by validators and the milestone evaluator.
 * No imports from sibling modules: this file is the bottom of the
 * time-reference import graph (only `node:crypto`-free pure code here).
 */

export const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
export const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
export const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
/** Full immutable commit SHA: 40 lowercase hex. A branch name or mutable tag is refused. */
export const SHA_RE = /^[0-9a-f]{40}$/;

export function isInstant(v: unknown): v is string {
  if (typeof v !== "string" || !INSTANT_RE.test(v)) return false;
  const ms = Date.parse(v);
  // Date.parse normalizes impossible dates; require unchanged UTC components.
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 19) === v.slice(0, 19);
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
