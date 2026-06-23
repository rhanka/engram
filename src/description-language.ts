/**
 * Per-source description language selection (field report ia-aero).
 *
 * PROBLEM: `graphify describe` / `graphify label` on a 100% French corpus
 * produced MIXED FR/EN output because no language directive was ever injected
 * into the prompt — the backend picked a language at its own whim, per batch,
 * non-deterministically.
 *
 * FIX: the description / label language is PILOTED PER SOURCE. We detect the
 * dominant language of each node from the text we already have on hand (its
 * label and citation/evidence snippets — i.e. the SOURCE document's words),
 * then inject an explicit "write in <language>" directive into every prompt:
 * the assistant batch-NNN files AND the direct API path. A node from a French
 * source gets a French directive; a node from an English source gets English —
 * even inside one mixed corpus. `--description-lang auto|fr|en|…` overrides the
 * per-source detection with a single forced language when the user wants it.
 *
 * This module is intentionally DEPENDENCY-FREE (no langdetect / franc / CLD):
 * the detector is a small stop-word + diacritic scorer covering the languages
 * graphify corpora actually use. It is deterministic (same text → same code),
 * which is the whole point — reproducible language, not a coin flip.
 */

/**
 * Requested language for descriptions / labels:
 * - "auto" (default): detect the dominant language PER SOURCE/NODE.
 * - a language code ("fr", "en", "de", …): force that language for every node.
 */
export type LanguageSelection = string;

/** The sentinel meaning "detect per source". */
export const AUTO_LANGUAGE: LanguageSelection = "auto";

/** Fallback language code when nothing can be detected and none is forced. */
export const FALLBACK_LANGUAGE = "en";

/**
 * Human-readable names for the language codes we can detect / direct. Used to
 * phrase the prompt directive ("Write every description in French.") rather
 * than leaking a bare code the model may not honor. Unknown codes fall back to
 * the code itself.
 */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
};

/**
 * Per-language stop-word sets. Deliberately small and high-signal — common
 * function words that rarely cross languages. Diacritic-bearing words help
 * separate the Romance/Germanic group from English.
 */
const STOP_WORDS: Record<string, Set<string>> = {
  en: new Set([
    "the", "and", "of", "to", "in", "is", "that", "with", "for", "as", "was",
    "which", "this", "from", "by", "an", "are", "who", "his", "her", "it",
  ]),
  fr: new Set([
    "le", "la", "les", "des", "une", "un", "du", "et", "dans", "qui", "que",
    "est", "pour", "avec", "sur", "au", "aux", "ce", "ses", "son", "sa", "par",
    "elle", "il", "ne", "pas", "plus", "où",
  ]),
  es: new Set([
    "el", "la", "los", "las", "una", "uno", "del", "que", "con", "para", "por",
    "como", "una", "pero", "más", "su", "sus", "es", "en", "y", "se",
  ]),
  de: new Set([
    "der", "die", "das", "und", "den", "dem", "ein", "eine", "ist", "mit",
    "von", "auf", "für", "nicht", "auch", "sich", "im", "zu", "als", "aus",
  ]),
  it: new Set([
    "il", "la", "lo", "gli", "che", "con", "per", "una", "uno", "del", "della",
    "nel", "non", "più", "come", "sono", "questo", "alla", "dei", "delle",
  ]),
  pt: new Set([
    "o", "a", "os", "as", "um", "uma", "do", "da", "dos", "das", "que", "com",
    "para", "por", "não", "mais", "como", "seu", "sua", "em",
  ]),
  nl: new Set([
    "de", "het", "een", "en", "van", "in", "is", "dat", "die", "op", "te",
    "met", "voor", "niet", "aan", "ook", "zijn", "naar", "door", "om",
  ]),
};

/** Characters that strongly indicate a non-English Latin-script language. */
const DIACRITIC_RE = /[àâäçéèêëîïôöùûüÿœæñß]/i;

/**
 * Per-language characteristic letters. A short accented phrase
 * ("L'héritière disparaît à Lausanne") is scored by how many of a language's
 * characteristic letters appear, so French (â ç è é ê ë î ï ô œ ù û) outscores
 * Italian (à è é ì ò ù) on text that uses the French-only accents — resolving
 * the right language instead of tying across the whole non-English group.
 */
const LANGUAGE_CHARS: Record<string, string[]> = {
  fr: ["à", "â", "ç", "è", "é", "ê", "ë", "î", "ï", "ô", "œ", "ù", "û", "ÿ", "æ"],
  de: ["ä", "ö", "ü", "ß"],
  es: ["ñ"],
  pt: ["ã", "õ", "ç"],
  it: ["à", "è", "é", "ì", "ò", "ù"],
};

/** Tokenize a free-text blob into lowercase word tokens. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFC")
    .split(/[^a-zàâäçéèêëîïôöùûüÿœæñß'-]+/u)
    .filter((t) => t.length > 0);
}

/**
 * Detect the dominant language of a free-text blob and return its code, or
 * `null` when there is not enough signal to decide. Deterministic.
 *
 * Scoring: each token that is a stop word for a language scores 1 for that
 * language; a diacritic in the blob adds a small bonus to every non-English
 * language (English uses no diacritics). The highest score wins, but only if it
 * clears a minimum-signal floor so a single shared word ("a", "de") does not
 * mis-trigger. Ties (e.g. too little text) return `null` so the caller can fall
 * back to a forced/default language.
 */
export function detectTextLanguage(text: string | null | undefined): string | null {
  if (!text) return null;
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;

  const scores: Record<string, number> = {};
  for (const lang of Object.keys(STOP_WORDS)) scores[lang] = 0;

  for (const token of tokens) {
    for (const [lang, words] of Object.entries(STOP_WORDS)) {
      if (words.has(token)) scores[lang] = (scores[lang] ?? 0) + 1;
    }
  }

  // Diacritics: a clear "not English" signal. First nudge each language whose
  // CHARACTERISTIC letters appear (disambiguates the non-English group on short
  // accented text). If accents are present but none is language-specific, fall
  // back to a flat non-English nudge so we still prefer a Latin language.
  if (DIACRITIC_RE.test(text)) {
    const lower = text.toLowerCase();
    let matchedSpecific = false;
    for (const [lang, chars] of Object.entries(LANGUAGE_CHARS)) {
      // Score by the count of DISTINCT characteristic letters present (0.6 each)
      // so a language using more of its own accents wins the tie-break.
      let hits = 0;
      for (const ch of chars) if (lower.includes(ch)) hits += 1;
      if (hits > 0) {
        scores[lang] = (scores[lang] ?? 0) + 0.6 * hits;
        matchedSpecific = true;
      }
    }
    if (!matchedSpecific) {
      for (const lang of Object.keys(scores)) {
        if (lang !== "en") scores[lang] = (scores[lang] ?? 0) + 1.5;
      }
    }
  }

  let best: string | null = null;
  let bestScore = 0;
  let runnerUp = 0;
  // Deterministic order: iterate a stable, sorted key list.
  for (const lang of Object.keys(scores).sort()) {
    const score = scores[lang] ?? 0;
    if (score > bestScore) {
      runnerUp = bestScore;
      bestScore = score;
      best = lang;
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  // Minimum-signal floor: need at least one stop-word/diacritic hit AND a clear
  // margin over the runner-up, otherwise we are guessing.
  if (best === null || bestScore < 1 || bestScore - runnerUp < 0.5) return null;
  return best;
}

/**
 * Resolve the language for a single node/source.
 * - An explicit, non-"auto" `requested` always wins (forced language).
 * - Otherwise detect from the node's own text (`detected`).
 * - Otherwise fall back to a corpus default, then `FALLBACK_LANGUAGE`.
 */
export function resolveLanguage(
  requested: LanguageSelection | undefined,
  detected: string | null,
  corpusDefault?: string | null,
): string {
  if (requested && requested.trim() && requested.trim().toLowerCase() !== AUTO_LANGUAGE) {
    return requested.trim().toLowerCase();
  }
  if (detected) return detected;
  const fallback = corpusDefault?.trim().toLowerCase();
  if (fallback && fallback !== AUTO_LANGUAGE) return fallback;
  return FALLBACK_LANGUAGE;
}

/** Human-readable display name for a language code (falls back to the code). */
export function languageDisplayName(code: string): string {
  return LANGUAGE_DISPLAY_NAMES[code] ?? code;
}

/**
 * One prompt directive line pinning the output language. Phrased with both the
 * display name and the code so the backend cannot drift — this is what stops
 * the mixed FR/EN output reported from the field.
 */
export function languageDirectiveLine(code: string, subject = "description"): string {
  const name = languageDisplayName(code);
  return `Write every ${subject} in ${name} (${code}). Do not switch languages.`;
}

/**
 * Normalize a raw `--description-lang` / `--label-lang` flag value into a
 * `LanguageSelection`. Empty / undefined → "auto". Trims and lowercases a code.
 */
export function normalizeLanguageSelection(raw: string | undefined): LanguageSelection {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) return AUTO_LANGUAGE;
  return trimmed;
}
