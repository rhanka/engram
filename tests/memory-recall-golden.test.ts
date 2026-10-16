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
 * - semantic fuses [lexical, ppr, vector]; every node points to C (including
 *   C's self-loop), so induced PPR orders C > A > B. Vector orders ids descending.
 * Closed-interval decay is tested separately at the scoring seam: canonical
 * temporal eligibility excludes a record whose t_end precedes valid_as_of.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
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
const PPR = { alpha: 0.85, lazy: 0.6, tolerance: 1e-6, max_iterations: 100 } as const;
const FIELD_WEIGHTS = { primary: 3.0, decision: 2.0, evidence: 1.5, context: 1.0, citations: 0.5 } as const;
type LexicalField = keyof typeof FIELD_WEIGHTS;
const LEXICAL_FIELDS = ["primary", "decision", "evidence", "context", "citations"] as const;

const QUERY = "harbor ledger";
const TEXT_A = "harbor harbor harbor ledger north quay";
const TEXT_B = "harbor ledger south quay";
const TEXT_C = "unrelated opera nightingale";

const MATRIX = ["16", "17"] as const;

function refCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(refCanonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${refCanonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Independent SHA/JCS calculation; no recall constants or digest helpers. */
function refProfileDigest(profile: "offline_lexical_v1" | "semantic_v1", systemAsOf: string): Digest {
  const config = {
    profile, tokenizer_version: "graphify-memory:tokenizer:v1",
    bm25: { k1: BM25_K1, b: BM25_B }, field_weights: FIELD_WEIGHTS,
    rrf_k: RRF_K, max_lexical_variants: 8, half_life_ms: HALF_LIFE_MS,
    weights: { lexical: LEXICAL_WEIGHT, recency: RECENCY_WEIGHT },
    ...(profile === "semantic_v1" ? {
      ppr: PPR, vector_model_ref: "vector:model:v1",
      channels: { lexical: true, induced_ppr: true, vector: true },
      projection_cursors: { adjacency: systemAsOf, vector: "1" },
    } : {}),
  };
  return `sha256:${createHash("sha256").update("graphify-memory/recall-profile-config/v1\0" + refCanonical(config)).digest("hex")}` as Digest;
}

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

/** All eligible nodes have a real outgoing edge to the chosen hub. */
function semanticStub(hub: () => string): SemanticProjectionPort {
  return {
    version: 1,
    async inducedAdjacency(input) {
      const ids = [...input.eligible_record_ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const hubIndex = ids.indexOf(hub());
      const body = {
        record_ids: ids,
        // If the hub is ineligible, induction removes every edge to it.
        offsets: Array.from({ length: ids.length + 1 }, (_, index) => hubIndex < 0 ? 0 : index),
        neighbours: hubIndex < 0 ? [] : ids.map(() => hubIndex),
        weights: hubIndex < 0 ? [] : ids.map(() => 1),
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
  let hub = "";
  const { memory } = profile === "semantic_v1"
    ? buildMemory({ store, semantic: semanticStub(() => hub), vector: vectorStub() })
    : buildMemory({ store });
  const ids = [
    await seedAccepted(memory, TEXT_A),
    await seedAccepted(memory, TEXT_B),
    await seedAccepted(memory, TEXT_C),
  ] as [string, string, string];
  hub = ids[2];
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
    candidate_count: number; ordered_ids_digest: Digest; profile_config_digest: Digest; system_as_of: string;
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
  expect(packet.rank_receipt.profile_config_digest).toBe(refProfileDigest("offline_lexical_v1", packet.rank_receipt.system_as_of));
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
    candidate_count: number; projection_receipt_digests: ReadonlyArray<Digest>; profile_config_digest: Digest; system_as_of: string;
  };
}): void {
  const docs = refDocs(corpus.ids, corpus.citations);
  const validTimeById = new Map(corpus.ids.map((id) => [id, { t: 1 }] as const));
  const lexicalScores = refBm25f(docs, refTokenize(QUERY));
  const lexicalOrder = refRankedList(lexicalScores);
  // Solve the star's stationary equations independently of the engine's CSR
  // iteration: r_i = (1-a)p_i/(1-a*l) off-hub; the remaining mass sits at C.
  const total = [...lexicalScores.values()].reduce((sum, score) => sum + score, 0);
  const factor = (1 - PPR.alpha) / (1 - PPR.alpha * PPR.lazy);
  const ppr = new Map(corpus.ids.map((id) => [id, factor * (lexicalScores.get(id) ?? 0) / total]));
  ppr.set(corpus.ids[2], 1 - factor);
  const pprOrder = refRankedList(ppr);
  expect(pprOrder).toEqual([corpus.ids[2], corpus.ids[0], corpus.ids[1]]);
  const vectorOrder = [...corpus.ids].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const expected = refCombine(refRrf([lexicalOrder, pprOrder, vectorOrder]), validTimeById, corpus.validAsOf);
  expect(lexicalOrder).toEqual([corpus.ids[0], corpus.ids[1]]);

  expect(packet.rank_receipt.profile).toBe("semantic_v1");
  expect(packet.rank_receipt.profile_config_digest).toBe(refProfileDigest("semantic_v1", packet.rank_receipt.system_as_of));
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
  it.each(["offline_lexical_v1", "semantic_v1"] as const)("%s scores a closed interval at the independent half-life reference", async (profile) => {
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
    let hub = "";
    const { memory } = buildMemory({ store, ...(profile === "semantic_v1"
      ? { semantic: semanticStub(() => hub), vector: vectorStub() } : {}) });
    const validAsOf = Date.parse(NOW);
    const closedEnd = validAsOf - 2_592_000_000;
    const closedTime = { t: 1, t_end: closedEnd };
    const closed = await seedAccepted(memory, TEXT_A, { validTime: closedTime });
    const open = await seedAccepted(memory, TEXT_A);
    hub = closed;
    const request = recallRequest(QUERY, { minimum_channels: profile === "semantic_v1" ? "lexical_and_semantic" : "lexical" });
    try {
      const ordinary = await memory.recall(request);
      if (!ordinary.ok) throw new Error(ordinary.error.code);
      expect(ordinary.value.records.map(({ record }) => record.record_id)).toEqual([open]);
      // D4 scoring seam only. Keep the real admitted historical document, but
      // let the store supply/revalidate it at its closed endpoint. The ranker
      // still receives validAsOf (one half-life later). No temporal claim is
      // made about a production store serving a closed-before candidate.
      const snapshot = store.acceptedSnapshot.bind(store);
      const revalidate = store.revalidate.bind(store);
      store.acceptedSnapshot = (input) => snapshot({ ...input, valid_as_of: closedEnd });
      store.revalidate = (input) => revalidate({ ...input, valid_as_of: closedEnd });
      const recalled = await memory.recall(request);
      if (!recalled.ok) throw new Error(recalled.error.code);
      expect(recalled.value.rank_receipt.valid_as_of).toBe(validAsOf);
      expect(recalled.value.rank_receipt.candidate_count).toBe(2);
      const lexical = [closed, open].sort(); // identical texts/lengths: BM25F tie, id asc
      const lists = profile === "semantic_v1"
        ? [lexical, [closed, open], [closed, open].sort().reverse()] : [lexical];
      const expected = refCombine(refRrf(lists), new Map([[closed, closedTime], [open, { t: 1 }]]), validAsOf);
      // 30 elapsed days / 30-day half-life: derived without the engine's exp formula.
      const expectedRecency = 2 ** (-((validAsOf - closedEnd) / 86_400_000) / 30);
      expect(expectedRecency).toBe(0.5);
      expect(refRecency(closedTime, validAsOf)).toBeCloseTo(expectedRecency, 15);
      expect(recalled.value.records.map(({ record }) => record.record_id)).toEqual(expected.map(({ id }) => id));
      for (const { id, score } of expected) {
        const entry = recalled.value.records.find(({ record }) => record.record_id === id)!;
        expect(entry.score).toBeCloseTo(score, 12);
      }
      expect(recalled.value.rank_receipt.profile_config_digest).toBe(refProfileDigest(profile, recalled.value.rank_receipt.system_as_of));
    } finally {
      await store.close();
    }
  });

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
