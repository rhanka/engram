/**
 * Recall golden references (EVOL §10 `recall` row: "receipts match goldens").
 *
 * The durable-parity suite proves every backend returns the SAME packet; it
 * cannot prove the packet is CORRECT. This file is the independent second
 * opinion: a self-contained reference implementation of the pinned §7/D4
 * scoring formula (written from the SPEC constants, importing nothing from
 * `engram-memory/recall.ts`) predicts the exact rank order and scores for a
 * fixed corpus, for both profiles. A drift in tokenizer, BM25F, RRF k,
 * profile weights, half-life, or receipt fields turns these tests red.
 *
 * Hand derivation for the fixed corpus (query "harbor ledger", all records
 * open so D4 recency = 1):
 * - lexical BM25F order is A > B (A carries "harbor" x3, B x1; same idf),
 *   C carries no query term and is not a candidate (candidate_count = 2);
 * - offline RRF over the single lexical list [A, B] with k=60 gives fused
 *   1/61 and 1/62, i.e. normalized lexical 1 and 61/62;
 * - combined = 0.85 * lexical + 0.15 * 1, so A scores exactly 1.0 and B
 *   scores 0.85 * (61/62) + 0.15 = 0.9862903225806451…;
 * - semantic fuses [lexical, ppr, vector] where the empty-adjacency PPR
 *   reproduces the lexical order and the vector stub ranks ids descending.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createInMemoryCanonicalMemoryStoreV1,
  openFencedSqliteCanonicalMemoryStoreV1,
  openPostgresCanonicalMemoryStoreV1,
  receiptDigest,
  type CanonicalMemoryStorePort,
  type Cursor,
  type Digest,
  type MemoryPortV2,
  type SemanticProjectionPort,
  type VectorProjectionPort,
} from "../engram-memory/index.js";
import { buildMemory, DEADLINE, DIGEST, NOW, recallRequest, seedAccepted } from "./memory-l7-fixture.js";
import { postgresLaneDecision, startEphemeralPostgres } from "./postgres-ephemeral.js";

/* Pinned SPEC constants (EVOL §7 / D4). Literals, not engine imports. */
const HALF_LIFE_MS = 2_592_000_000;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const RRF_K = 60;
const LEXICAL_WEIGHT = 0.85;
const RECENCY_WEIGHT = 0.15;
const FIELD_WEIGHTS = { primary: 3.0, decision: 2.0, evidence: 1.5, context: 1.0, citations: 0.5 } as const;
type LexicalField = keyof typeof FIELD_WEIGHTS;
const LEXICAL_FIELDS = ["primary", "decision", "evidence", "context", "citations"] as const;

const QUERY = "harbor ledger";
const TEXT_A = "harbor harbor harbor ledger north quay";
const TEXT_B = "harbor ledger south quay";
const TEXT_C = "unrelated opera nightingale";

const MATRIX = ["16", "17"] as const;

/* Independent reference: unicode-word tokenizer (SPEC §7). */
function refTokenize(value: string | undefined | null): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const raw of value.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []) {
    let englishOnly = true;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      if (ch < 0x61 || ch > 0x7a) { englishOnly = false; break; }
    }
    if (englishOnly && raw.length <= 2) continue;
    out.push(raw);
  }
  return out;
}

interface RefDoc { id: string; fields: Record<LexicalField, string[]> }

function refIdf(n: number, df: number): number {
  return Math.max(0, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
}

/* Independent reference: BM25F over the five accepted-record fields. */
function refBm25f(docs: RefDoc[], queryTokens: string[]): Map<string, number> {
  const n = docs.length;
  const scores = new Map<string, number>();
  const avg = {} as Record<LexicalField, number>;
  for (const field of LEXICAL_FIELDS) {
    let total = 0;
    for (const doc of docs) total += doc.fields[field].length;
    avg[field] = total / n;
  }
  const df = new Map<string, number>();
  for (const term of new Set(queryTokens)) {
    let count = 0;
    for (const doc of docs) {
      if (LEXICAL_FIELDS.some((field) => doc.fields[field].includes(term))) count += 1;
    }
    if (count > 0) df.set(term, count);
  }
  for (const doc of docs) {
    let score = 0;
    for (const term of new Set(queryTokens)) {
      const documentFrequency = df.get(term);
      if (documentFrequency === undefined) continue;
      const termIdf = refIdf(n, documentFrequency);
      if (termIdf <= 0) continue;
      let fieldScore = 0;
      for (const field of LEXICAL_FIELDS) {
        const tf = doc.fields[field].filter((token) => token === term).length;
        if (tf === 0) continue;
        const norm = 1 - BM25_B + BM25_B * (doc.fields[field].length / (avg[field] || 1));
        fieldScore += FIELD_WEIGHTS[field] * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norm));
      }
      if (fieldScore > 0) score += termIdf * fieldScore;
    }
    if (score > 0) scores.set(doc.id, score);
  }
  return scores;
}

function refRankedList(scores: Map<string, number>): string[] {
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id]) => id);
}

function refRrf(lists: string[][]): Map<string, number> {
  const fused = new Map<string, number>();
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const id = list[i]!;
      fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + (i + 1)));
    }
  }
  return fused;
}

/* Independent reference: D4 recency (valid-time only). Open intervals score 1. */
function refRecency(validTime: { t: number; t_end?: number }, validAsOf: number): number {
  const anchor = validTime.t_end === undefined ? validAsOf : Math.min(validAsOf, validTime.t_end);
  return Math.exp((-Math.LN2 * Math.max(0, validAsOf - anchor)) / HALF_LIFE_MS);
}

/* Independent reference: normalize fused, combine, deterministic tie-break. */
function refCombine(
  fused: Map<string, number>,
  validTimeById: Map<string, { t: number; t_end?: number }>,
  validAsOf: number,
): Array<{ id: string; score: number }> {
  const maxFused = Math.max(0, ...fused.values());
  const combined: Array<{ id: string; score: number; recency: number }> = [];
  for (const [id, fusedScore] of fused) {
    const validTime = validTimeById.get(id);
    if (validTime === undefined) continue;
    const recency = refRecency(validTime, validAsOf);
    combined.push({ id, score: LEXICAL_WEIGHT * (maxFused > 0 ? fusedScore / maxFused : 0) + RECENCY_WEIGHT * recency, recency });
  }
  combined.sort((a, b) => b.score - a.score || b.recency - a.recency || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return combined.map(({ id, score }) => ({ id, score }));
}

function refDocs(ids: readonly [string, string, string], citations: readonly [string, string, string]): RefDoc[] {
  const texts = [TEXT_A, TEXT_B, TEXT_C];
  return ids.map((id, i) => ({
    id,
    fields: {
      primary: refTokenize(texts[i]),
      decision: [],
      evidence: [],
      context: refTokenize(texts[i]),
      citations: refTokenize(citations[i]),
    },
  }));
}

const workspaces: string[] = [];
const stops: Array<() => void> = [];

afterEach(() => {
  while (stops.length > 0) stops.pop()!();
  while (workspaces.length > 0) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

function sqliteStore(): Promise<CanonicalMemoryStorePort> {
  const workspace = mkdtempSync(join(tmpdir(), "engram-memory-recall-golden-"));
  workspaces.push(workspace);
  return openFencedSqliteCanonicalMemoryStoreV1({
    filename: join(workspace, "golden.sqlite"),
    clock: { now: () => NOW },
    store_id: "recall-golden",
    allow_ephemeral_filesystem_store: true,
  }).then((opened) => {
    if (!opened.ok) throw new Error(`sqlite golden open failed: ${opened.error.message}`);
    return opened.value;
  });
}

/** Empty-adjacency semantic stub: with no edges every node dangles, so the
 * induced PPR converges to the normalized lexical teleport in one step and
 * reproduces the lexical order. */
function semanticStub(): SemanticProjectionPort {
  return {
    version: 1,
    async inducedAdjacency(input) {
      const ids = [...input.eligible_record_ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const body = {
        record_ids: ids,
        offsets: new Array(ids.length + 1).fill(0),
        neighbours: [] as number[],
        weights: [] as number[],
        projection_cursor: input.system_as_of,
      };
      return { ok: true, value: { ...body, adjacency_digest: receiptDigest("semantic-adjacency", body) } };
    },
  };
}

/** Vector stub with a fixed, content-independent order (ids descending) so
 * the fused RRF input is exactly predictable. */
function vectorStub(): VectorProjectionPort {
  return {
    version: 1,
    async query(input) {
      const ranked = [...input.eligible_record_ids].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
      const body = {
        matches: ranked.map((record_id, index) => ({ record_id, score: 1 / (index + 1) })),
        model_ref: "vector:model:v1",
        projection_cursor: "1" as Cursor,
      };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest("vector-query", body) } };
    },
    async apply() { throw new Error("unused"); },
  };
}

interface GoldenCorpus {
  memory: MemoryPortV2;
  ids: [string, string, string];
  citations: [string, string, string];
  validAsOf: number;
}

async function seedGoldenCorpus(
  store: CanonicalMemoryStorePort,
  profile: "offline_lexical_v1" | "semantic_v1",
): Promise<GoldenCorpus> {
  const { memory } = profile === "semantic_v1"
    ? buildMemory({ store, semantic: semanticStub(), vector: vectorStub() })
    : buildMemory({ store });
  const ids = [
    await seedAccepted(memory, TEXT_A),
    await seedAccepted(memory, TEXT_B),
    await seedAccepted(memory, TEXT_C),
  ] as [string, string, string];
  const recalled = await memory.recall(recallRequest(QUERY));
  if (!recalled.ok) throw new Error(`golden seed recall failed: ${recalled.error.code}`);
  // Citation source_refs carry the fixture sequence counter; read them back
  // from the accepted snapshot so the reference replicates the exact fields.
  const snapshot = await store.acceptedSnapshot({
    valid_as_of: recalled.value.rank_receipt.valid_as_of,
    system_as_of: recalled.value.rank_receipt.system_as_of,
    authorization_receipt_digest: DIGEST,
    max_candidates: 50,
  });
  if (!snapshot.ok) throw new Error("golden snapshot failed");
  const citationById = new Map(
    snapshot.value.documents.map((document) => [document.record_id, document.fields.citations] as const),
  );
  return {
    memory,
    ids,
    citations: ids.map((id) => citationById.get(id) ?? "") as [string, string, string],
    validAsOf: recalled.value.rank_receipt.valid_as_of,
  };
}

function expectOfflineGolden(corpus: GoldenCorpus, packet: {
  records: Array<{ record: { record_id: string }; score: number; rank: number }>;
  rank_receipt: {
    profile: string; profile_version: string; scoring_formula_ref: string;
    candidate_count: number; ordered_ids_digest: Digest;
  };
}): void {
  const docs = refDocs(corpus.ids, corpus.citations);
  const validTimeById = new Map(corpus.ids.map((id) => [id, { t: 1 }] as const));
  const lexical = refBm25f(docs, refTokenize(QUERY));
  // C carries no query term: not a candidate. A outranks B on term frequency.
  expect(refRankedList(lexical)).toEqual([corpus.ids[0], corpus.ids[1]]);
  const expected = refCombine(refRrf([refRankedList(lexical)]), validTimeById, corpus.validAsOf);
  expect(expected.map((entry) => entry.id)).toEqual([corpus.ids[0], corpus.ids[1]]);
  // Hand-closed form: single-list RRF k=60 gives fused 1/61, 1/62.
  expect(expected[1]!.score).toBeCloseTo(LEXICAL_WEIGHT * (61 / 62) + RECENCY_WEIGHT, 12);
  expect(expected[0]!.score).toBeCloseTo(1, 12);

  expect(packet.rank_receipt.profile).toBe("offline_lexical_v1");
  expect(packet.rank_receipt.profile_version).toBe("1.0.0");
  expect(packet.rank_receipt.scoring_formula_ref).toBe("graphify-memory:offline-lexical-recency:v1");
  expect(packet.rank_receipt.candidate_count).toBe(2);
  expect(packet.records.map((entry) => entry.record.record_id)).toEqual(expected.map((entry) => entry.id));
  expect(packet.records.map((entry) => entry.rank)).toEqual([1, 2]);
  for (let i = 0; i < expected.length; i++) {
    expect(packet.records[i]!.score).toBeCloseTo(expected[i]!.score, 12);
  }
  expect(packet.rank_receipt.ordered_ids_digest).toBe(
    receiptDigest("recall-ordered", { ordered_ids: expected.map((entry) => entry.id) }, "ordered_ids_digest"),
  );
}

function expectSemanticGolden(corpus: GoldenCorpus, packet: {
  records: Array<{ record: { record_id: string }; score: number; rank: number }>;
  rank_receipt: {
    profile: string; profile_version: string; scoring_formula_ref: string;
    candidate_count: number; projection_receipt_digests: ReadonlyArray<Digest>;
  };
}): void {
  const docs = refDocs(corpus.ids, corpus.citations);
  const validTimeById = new Map(corpus.ids.map((id) => [id, { t: 1 }] as const));
  const lexicalOrder = refRankedList(refBm25f(docs, refTokenize(QUERY)));
  // Empty adjacency: PPR reproduces the lexical order. The vector channel
  // admits every eligible id, so C fuses in too (candidate_count = 3).
  const pprOrder = [...lexicalOrder];
  const vectorOrder = [...corpus.ids].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const expected = refCombine(refRrf([lexicalOrder, pprOrder, vectorOrder]), validTimeById, corpus.validAsOf);
  expect(lexicalOrder).toEqual([corpus.ids[0], corpus.ids[1]]);

  expect(packet.rank_receipt.profile).toBe("semantic_v1");
  expect(packet.rank_receipt.profile_version).toBe("1.0.0");
  expect(packet.rank_receipt.scoring_formula_ref).toBe("graphify-memory:semantic-rrf-recency:v1");
  expect(packet.rank_receipt.projection_receipt_digests).toHaveLength(2);
  expect(packet.rank_receipt.candidate_count).toBe(3);
  expect(packet.records.map((entry) => entry.record.record_id)).toEqual(expected.map((entry) => entry.id));
  for (let i = 0; i < expected.length; i++) {
    expect(packet.records[i]!.score).toBeCloseTo(expected[i]!.score, 12);
  }
}

async function runOfflineGolden(store: CanonicalMemoryStorePort, label: string): Promise<void> {
  const corpus = await seedGoldenCorpus(store, "offline_lexical_v1");
  const recalled = await corpus.memory.recall(recallRequest(QUERY));
  if (!recalled.ok) throw new Error(`${label} offline recall failed: ${recalled.error.code}`);
  expectOfflineGolden(corpus, recalled.value);
  // Pagination walks the same pinned order to the end.
  const collected: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await corpus.memory.recall(
      recallRequest(QUERY, { page: cursor === undefined ? { size: 1 } : { size: 1, cursor } }),
    );
    if (!page.ok) throw new Error(`${label} offline paged recall failed: ${page.error.code}`);
    for (const entry of page.value.records) collected.push(entry.record.record_id);
    cursor = page.value.next_page_cursor;
  } while (cursor !== undefined);
  expect(collected, `${label} pagination must replay the golden order`).toEqual(
    recalled.value.records.map((entry) => entry.record.record_id),
  );
}

async function runSemanticGolden(store: CanonicalMemoryStorePort, label: string): Promise<void> {
  const corpus = await seedGoldenCorpus(store, "semantic_v1");
  const recalled = await corpus.memory.recall(recallRequest(QUERY, { minimum_channels: "lexical_and_semantic" }));
  if (!recalled.ok) throw new Error(`${label} semantic recall failed: ${recalled.error.code}`);
  expectSemanticGolden(corpus, recalled.value);
}

describe("recall golden references", () => {
  it("offline_lexical_v1 and semantic_v1 match the independent reference on the in-memory store", async () => {
    const inMemory = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
    await runOfflineGolden(inMemory, "in-memory");
    const inMemorySemantic = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
    await runSemanticGolden(inMemorySemantic, "in-memory");
  });

  it("offline_lexical_v1 and semantic_v1 match the independent reference on SQLite", async () => {
    const sqlite = await sqliteStore();
    try {
      await runOfflineGolden(sqlite, "sqlite");
    } finally {
      await sqlite.close();
    }
    const sqliteSemantic = await sqliteStore();
    try {
      await runSemanticGolden(sqliteSemantic, "sqlite");
    } finally {
      await sqliteSemantic.close();
    }
  });
});

const pgDecision = postgresLaneDecision(MATRIX);
if (pgDecision.lane === "fail") {
  const cause = pgDecision.cause;
  describe("recall golden references on Postgres", () => {
    it("postgres lane prerequisites hold in required mode", () => {
      throw new Error(cause);
    });
  });
} else {
  describe.skipIf(pgDecision.lane !== "run")("recall golden references on Postgres", () => {
    it("offline_lexical_v1 and semantic_v1 match the independent reference on Postgres 16/17", async () => {
      for (const version of MATRIX) {
        // One fresh database per profile: each run seeds the same three
        // texts, so sharing a database would stack two corpora (6 eligible
        // records) and the golden counts would no longer hold.
        for (const profile of ["offline_lexical_v1", "semantic_v1"] as const) {
          const postgres = await startEphemeralPostgres(version);
          stops.push(postgres.stop);
          try {
            const opened = await openPostgresCanonicalMemoryStoreV1({
              connection: postgres.connection,
              clock: { now: () => NOW },
              store_id: "recall-golden",
            });
            if (!opened.ok) throw new Error(`postgres ${version} golden open failed: ${opened.error.message}`);
            try {
              if (profile === "offline_lexical_v1") await runOfflineGolden(opened.value, `postgres:${version}`);
              else await runSemanticGolden(opened.value, `postgres:${version}`);
            } finally {
              await opened.value.close();
            }
          } finally {
            postgres.stop();
            const index = stops.indexOf(postgres.stop);
            if (index >= 0) stops.splice(index, 1);
          }
        }
      }
    }, 180_000);
  });
}
