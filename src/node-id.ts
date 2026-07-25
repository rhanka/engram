/**
 * Canonical, Unicode-safe node identity.
 *
 * Ports safishamsi `95e2c5e` (#811) to TypeScript. Upstream keeps
 * `extract._make_id` and `build._normalize_id` byte-for-byte equivalent:
 *
 * ```python
 * s = unicodedata.normalize("NFKC", s)
 * cleaned = re.sub(r"[^\w]+", "_", s, flags=re.UNICODE)
 * cleaned = re.sub(r"_+", "_", cleaned)
 * return cleaned.strip("_").casefold()
 * ```
 *
 * Two JavaScript-specific spellings are required:
 *
 * - Python's `\w` under `re.UNICODE` is "alphanumeric in any script, or
 *   underscore". JavaScript's `\W` is ASCII-only even with the `u` flag, so the
 *   inverted class is spelled explicitly as `[^\p{L}\p{N}_]`.
 * - JavaScript has no `str.casefold()`. `toLowerCase()` is used instead, which
 *   is the same convention already shipped by the `86109e9` label-dedup port in
 *   `src/build.ts`. The residual delta is limited to characters whose full case
 *   folding differs from simple lowercasing (German `ß`/`SS`, Greek final sigma
 *   `ς`/`σ`); it is recorded in `UPSTREAM_GAP.md`.
 *
 * NFKC is what makes composed and decomposed spellings of the same word agree:
 * without it `café` (U+00E9) and `café` (`e` + U+0301) are two different nodes.
 *
 * Known limitation, matching upstream: combining marks (Unicode `M*`) are not
 * word characters for either Python's `\w` or `\p{L}\p{N}`, so scripts that
 * carry meaning in spacing marks (Devanagari matras, Thai vowel signs) are
 * still degraded. Recorded as an open residual rather than silently diverging
 * from the parity source.
 */

/** Everything that is not a Unicode letter, digit, or underscore. */
const NON_ID_WORD = /[^\p{L}\p{N}_]+/gu;

/**
 * NFKC-normalize, collapse non-word runs to a single `_`, and trim separators.
 * Case-preserving: callers that need a case-folded id use {@link makeNodeId}.
 *
 * For pure-ASCII input this is byte-for-byte identical to the previous
 * `[^A-Za-z0-9]+` behaviour, so existing ASCII node ids never move.
 */
export function normalizeIdPart(value: string): string {
  return value
    .trim()
    .normalize("NFKC")
    .replace(NON_ID_WORD, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Build a stable node ID from one or more name parts.
 *
 * Preserves Unicode letters/digits (CJK, Cyrillic, Greek, Arabic, accented
 * Latin) so non-ASCII identifiers produce distinct ids instead of collapsing
 * onto a single per-file node.
 */
export function makeNodeId(...parts: string[]): string {
  const combined = parts
    .filter(Boolean)
    .map((p) => p.replace(/^[_.]+|[_.]+$/g, ""))
    .join("_");
  return normalizeIdPart(combined).toLowerCase();
}
