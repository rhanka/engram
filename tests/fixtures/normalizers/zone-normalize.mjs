// Deliberately autonomous: L3 fingerprints this file itself, not an import graph.
export function normalizeZoneCode(value) {
  return value
    .replace(/^(\d+)\s*([a-z]+)$/u, "$2-$1")
    .replace(/^([a-z]+)\s*(\d+)$/u, "$1-$2");
}

export function collapseDigits(value) {
  return value.replace(/\d+/gu, "");
}

export function nonIdempotent(value) {
  return `${value}!`;
}
