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
  return terms.reduce((score, term) => score + (normalizedLabel.includes(term) ? 1 : 0), 0)
    + terms.reduce((score, term) => score + (normalizedSource.includes(term) ? 0.5 : 0), 0);
}
