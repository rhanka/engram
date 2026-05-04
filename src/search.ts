export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
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
