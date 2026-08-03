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

// Secret-bearing ENVIRONMENT ASSIGNMENTS, i.e. the `NAME=VALUE` shape emitted by
// `printenv` / `env` / `docker inspect` / a k8s Secret dump.
//
// WHY THIS EXISTS (2026-07-30). An agent ran `kubectl exec … -- printenv | grep -iE
// 's3|aws'` meaning to list variable NAMES; `printenv` emits `NAME=VALUE`, so the
// grep matched whole lines and live OVH Object Storage credentials landed in a
// transcript in clear. The generic pattern below did not fire: it requires
// `secret`/`api_key` IMMEDIATELY before the `=`, and `S3_SECRET_KEY=` has a `_KEY`
// in between. `S3_ACCESS_KEY=`, `AWS_SECRET_ACCESS_KEY=` and `POSTGRES_PASSWORD=`
// all sailed through.
//
// We match on the SUFFIX of the name, not on it merely containing a word: that is
// the actual naming convention (`*_SECRET`, `*_TOKEN`, `*_KEY`…) and it keeps
// identifiers like `secretName=sentropic-postgres` readable — a Secret's NAME is
// diagnostic, its VALUE never is. `_KEY` is in the list because env vars ending in
// `_KEY` are overwhelmingly credentials; the cost is that `PUBLIC_KEY=` gets masked
// too, which is the safe direction to be wrong in.
//
// The NAME is preserved on purpose: "which variable leaked" is the whole diagnostic
// value, and keeping it means a reader never needs the original to understand.
const SECRET_ENV_ASSIGNMENT_RE =
  /\b([A-Za-z][A-Za-z0-9_]*_(?:SECRETS?|PASSWORD|PASSWD|PWD|TOKEN|CREDENTIALS?|KEY)|SECRETS?|PASSWORD|PASSWD|TOKEN|CREDENTIALS?)\s*=\s*\S+/gi;

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
  // Replace both the literal home and any "/home/<user>" pattern generically.
  // The generic patterns run even when `home` is unknown (defense in depth).
  let out = home ? text.split(home).join("~") : text;
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
  // Runs before TOKEN_PATTERNS so the variable name survives instead of being
  // swallowed by the coarser `token|secret|…=` rule.
  out = out.replace(SECRET_ENV_ASSIGNMENT_RE, "$1=<token>");
  for (const re of TOKEN_PATTERNS) out = out.replace(re, "<token>");
  return out;
}

/** Clamp an excerpt to a max length, redact, and collapse whitespace runs. */
export function redactExcerpt(text: string, home = "", max = 200): string {
  const collapsed = String(text ?? "").replace(/\s+/g, " ").trim();
  const clipped = collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
  return redact(clipped, home);
}
