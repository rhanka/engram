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
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g, // GitLab PAT
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // Slack tokens
  /\bnpm_[A-Za-z0-9]{20,}\b/g, // npm token
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /\b(?:token|secret|api[_-]?key|password|bearer)\s*[:=]\s*\S+/gi,
];

// `scheme://user:password@host` — drop the whole credentials pair.
const URL_CREDENTIALS_RE = /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/g;

// Claude Code project-slug form of a home dir (`-home-<user>-…`), which also
// shows up inside /tmp/... seed paths. Requires a following `-segment` so
// ordinary hyphenated prose ("take-home-pay") is left alone.
const DASH_SLUG_HOME_RE = /-(?:home|Users)-[A-Za-z0-9._]+(?=-)/g;

/** Replace the user's home directory prefix with `~`. */
export function redactHome(text: string, home: string): string {
  if (!home) return text;
  // Replace both the literal home and any "/home/<user>" pattern generically.
  let out = text.split(home).join("~");
  out = out.replace(/\/(?:home|Users)\/[A-Za-z0-9._-]+/g, "~");
  // Dash-slug home form (Claude project dirs), wherever it appears (~/.claude
  // /projects/-home-<user>-…, /tmp/…/-home-<user>-…).
  out = out.replace(DASH_SLUG_HOME_RE, "~");
  return out;
}

/** Strip emails, tokens, and home paths from a snippet. Order matters. */
export function redact(text: string, home = ""): string {
  if (typeof text !== "string" || text.length === 0) return "";
  let out = redactHome(text, home);
  out = out.replace(URL_CREDENTIALS_RE, "$1<token>@");
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
