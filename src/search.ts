export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Split a query into searchable terms, filtering only short pure-English
 * tokens (length <= 2 ASCII chars). Centralised here so the MCP CLI,
 * `query_graph`, and any future benchmark/scoring code share the same
 * tokenisation rule. Mirrors upstream `graphify.serve._query_terms`
 * (safishamsi 020cca2 / #964): two-character CJK / Cyrillic / Greek
 * terms must remain searchable, English stopwords like "to"/"of" stay
 * filtered.
 *
 * Behaviour:
 * - tokenises on Unicode word runs (mirrors Python `re.findall(r"\w+")`,
 *   upstream 80301a0 / #994) so punctuation is stripped: "extract?" matches
 *   the "extract" node and "ok?" is filtered like "ok"
 * - lowercases each raw token
 * - drops the token if it is composed entirely of ASCII a-z and shorter
 *   than 3 chars; non-ASCII (or mixed) tokens of any length are kept
 */
export function queryTerms(question: string): string[] {
  if (typeof question !== "string") return [];
  const out: string[] = [];
  // \p{L}\p{N}_ runs ≈ Python's unicode-aware \w+ (upstream 80301a0 / #994):
  // CJK / Cyrillic / accented tokens survive, punctuation splits and drops.
  for (const raw of question.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []) {
    const term = raw;
    if (!term) continue;
    let englishOnly = true;
    for (let i = 0; i < term.length; i++) {
      const ch = term.charCodeAt(i);
      // 0x61..0x7A is "a".."z"; anything else (digits, punctuation, CJK,
      // accented letters) breaks the "pure English" classification.
      if (ch < 0x61 || ch > 0x7a) {
        englishOnly = false;
        break;
      }
    }
    if (englishOnly && term.length <= 2) continue;
    out.push(term);
  }
  return out;
}

/**
 * English question/filler words dropped from QUERY terms so content words
 * drive BFS seeding. Without this, "how does the frontier cache work" seeds
 * on "how"/"the"/"work" (which prefix-match prose labels like "Working
 * Principles") instead of "frontier"/"cache", and lands in the wrong part of
 * the graph. Port of upstream safishamsi 6e97088.
 *
 * IMPORTANT: applied to query terms only, never to node/index text — the
 * BM25 index side (`src/retrieval/bm25.ts` tokenizeField) keeps calling the
 * unfiltered `queryTerms`, so a symbol literally named `work` stays findable.
 * `work`/`works`/`working` are included because "how does X work" is the most
 * common question phrasing. Tokens of length <= 2 ("is", "be", …) are already
 * dropped by `queryTerms`' short-English filter but stay listed for parity
 * with the upstream set (harmless).
 */
export const QUERY_STOPWORDS: ReadonlySet<string> = new Set([
  "how", "what", "why", "when", "where", "which", "who", "whom", "whose",
  "does", "did", "is", "are", "was", "were", "be", "been", "being",
  "can", "could", "should", "would", "will", "shall", "may", "might", "must",
  "has", "have", "had", "the", "and", "but", "not", "for", "from", "with",
  "without", "into", "onto", "off", "that", "this", "these", "those", "there",
  "here", "its", "their", "them", "they", "about", "any", "all", "some",
  "work", "works", "working",
]);

/**
 * Drop question/filler stopwords from already-tokenized QUERY terms, falling
 * back to the unfiltered terms when the query is all stopwords ("how does it
 * work" still seeds on something). Port of upstream 6e97088; see
 * `QUERY_STOPWORDS` for scope (query side only).
 */
export function dropQueryStopwords(terms: string[]): string[] {
  const content = terms.filter((term) => !QUERY_STOPWORDS.has(term));
  return content.length > 0 ? content : terms;
}

export function textMatchesQuery(text: string, query: string): boolean {
  const normalizedText = normalizeSearchText(text);
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  return terms.every((term) => normalizedText.includes(term));
}

export function scoreSearchText(label: string, source: string, terms: string[]): number {
  const normalizedLabel = normalizeSearchText(label);
  const normalizedSource = normalizeSearchText(source);
  const query = terms.join(" ").trim();
  let score = 0;

  if (query.length > 0) {
    if (normalizedLabel === query) score += 100;
    else if (normalizedLabel.startsWith(`${query} `) || normalizedLabel.endsWith(` ${query}`)) score += 20;

    if (normalizedSource === query) score += 40;
    else if (normalizedSource.endsWith(`/${query}`) || normalizedSource.endsWith(`\\${query}`)) score += 10;
  }

  score += terms.reduce((total, term) => total + (normalizedLabel.includes(term) ? 1 : 0), 0);
  score += terms.reduce((total, term) => total + (normalizedSource.includes(term) ? 0.5 : 0), 0);
  return score;
}
