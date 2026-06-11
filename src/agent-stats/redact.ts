/**
 * WP9 agent-stats — anonymization.
 *
 * PRIVACY (decided): we store ONLY derived facts plus anonymized short
 * citation/excerpt snippets as evidence (e.g. a git command and its sha
 * output). We NEVER store raw prompt/response text, and we strip anything
 * sensitive/personal before persisting:
 *   - email addresses        → <email>
 *   - bearer / api / gh tokens → <token>
 *   - absolute home paths     → ~  (so /home/<user>/… never lands on disk)
 *
 * All parser/normalizer evidence MUST pass through {@link redact} before it is
 * written to `.graphify/agents/facts.jsonl`.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Common secret shapes: gh_/github_pat_, sk-/api keys, JWT-ish, long hex blobs,
// and explicit token=… / Authorization: Bearer … assignments.
const TOKEN_PATTERNS: RegExp[] = [
  /\bgh[posru]_[A-Za-z0-9]{20,}\b/g, // GitHub PAT (ghp_, gho_, ghs_, ghu_, ghr_)
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g, // OpenAI-style
  /\b(?:AIza)[A-Za-z0-9_-]{20,}\b/g, // Google API key
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /\b(?:token|secret|api[_-]?key|password|bearer)\s*[:=]\s*\S+/gi,
];

/** Replace the user's home directory prefix with `~`. */
export function redactHome(text: string, home: string): string {
  if (!home) return text;
  // Replace both the literal home and any "/home/<user>" pattern generically.
  let out = text.split(home).join("~");
  out = out.replace(/\/(?:home|Users)\/[A-Za-z0-9._-]+/g, "~");
  return out;
}

/** Strip emails, tokens, and home paths from a snippet. Order matters. */
export function redact(text: string, home = ""): string {
  if (typeof text !== "string" || text.length === 0) return "";
  let out = redactHome(text, home);
  out = out.replace(EMAIL_RE, "<email>");
  for (const re of TOKEN_PATTERNS) out = out.replace(re, "<token>");
  return out;
}

/** Clamp an excerpt to a max length, redact, and collapse whitespace runs. */
export function redactExcerpt(text: string, home = "", max = 200): string {
  const collapsed = String(text ?? "").replace(/\s+/g, " ").trim();
  const clipped = collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
  return redact(clipped, home);
}
