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
 * - splits on whitespace
 * - lowercases each raw token
 * - drops the token if it is composed entirely of ASCII a-z and shorter
 *   than 3 chars; non-ASCII (or mixed) tokens of any length are kept
 */
export function queryTerms(question: string): string[] {
  if (typeof question !== "string") return [];
  const out: string[] = [];
  for (const raw of question.split(/\s+/)) {
    const term = raw.toLowerCase().trim();
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
