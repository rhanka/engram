// Test-only corpus I/O. Production modules carry data and pure functions.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CorpusEntry } from "../src/ontology-guardian/diagram-corpus.js";

export const testsDir = process.env.DIAGRAM_TESTS_DIR ?? dirname(fileURLToPath(import.meta.url));
export const corpusDir = join(testsDir, "fixtures/pinned-sources/corpus");
export const sourceIndex = JSON.parse(readFileSync(join(corpusDir, "index.json"), "utf8")) as (CorpusEntry & { fixture: string })[];
export function corpusBytes(id: string): Buffer {
  const entry = sourceIndex.find(entry => entry.id === id);
  if (entry === undefined) throw new Error(`missing pinned corpus source: ${id}`);
  return readFileSync(join(corpusDir, entry.fixture));
}
export function corpusJson<T = Record<string, unknown>>(id: string): T {
  return JSON.parse(corpusBytes(id).toString("utf8")) as T;
}
