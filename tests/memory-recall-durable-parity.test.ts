/**
 * Durable-store recall parity (finalization sub-scope 2).
 *
 * `MemoryPortV2.recall` — offline_lexical_v1, semantic_v1, and pagination —
 * must return the same packet on the durable SQLite and Postgres stores as on
 * the in-memory reference store for one fixed corpus.
 *
 * The SQLite section runs locally. The Postgres sections run only in CI, in
 * the `memory-postgres` job (required lane over the job's ephemeral Postgres
 * 16/17 bases); without Docker they skip instead of passing silently.
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
  type MemoryPortV2,
  type RecallPacketV2,
  type SemanticProjectionPort,
  type VectorProjectionPort,
} from "../engram-memory/index.js";
import { buildMemory, DEADLINE, DIGEST, NOW, recallRequest } from "./memory-l7-fixture.js";
import { postgresLaneDecision, startEphemeralPostgres } from "./postgres-ephemeral.js";

const MATRIX = ["16", "17"] as const;
const QUERY = "harbor ledger page";

const CORPUS = [
  "harbor ledger page term alpha",
  "harbor ledger page term beta",
  "harbor ledger page term gamma",
  "harbor ledger page term delta",
  "harbor ledger page term epsilon",
  "unrelated opera nightingale",
] as const;

const workspaces: string[] = [];
const stops: Array<() => void> = [];

afterEach(() => {
  while (stops.length > 0) stops.pop()!();
  while (workspaces.length > 0) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

function vectorPort(): VectorProjectionPort {
  return {
    version: 1,
    async query(input) {
      const body = {
        matches: input.eligible_record_ids.map((record_id, index) => ({ record_id, score: 1 / (index + 1) })),
        model_ref: "vector:model:v1",
        projection_cursor: "1" as Cursor,
      };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest("vector-query", body) } };
    },
    async apply() { throw new Error("unused"); },
  };
}

function semanticPort(): SemanticProjectionPort {
  return {
    version: 1,
    async inducedAdjacency(input) {
      const ids = [...input.eligible_record_ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const offsets: number[] = [0];
      const neighbours: number[] = [];
      const weights: number[] = [];
      for (let i = 0; i < ids.length; i++) {
        if (i + 1 < ids.length) { neighbours.push(i + 1); weights.push(1); }
        if (i - 1 >= 0) { neighbours.push(i - 1); weights.push(1); }
        offsets.push(neighbours.length);
      }
      const body = { record_ids: ids, offsets, neighbours, weights, projection_cursor: input.system_as_of };
      return { ok: true, value: { ...body, adjacency_digest: receiptDigest("semantic-adjacency", body) } };
    },
  };
}

/**
 * Seeds one fixed corpus with caller-pinned identity keys so every backend
 * folds byte-identical payloads and record ids. (`seedAccepted` uses a
 * process-global sequence counter, which would diverge across backends.)
 */
async function seedRecallCorpus(memory: MemoryPortV2): Promise<string[]> {
  const recordIds: string[] = [];
  for (let index = 0; index < CORPUS.length; index++) {
    const tag = `recall-durable-${String(index).padStart(2, "0")}`;
    const captured = await memory.capture({
      schema_version: 2 as const,
      idempotency_key: `idem-${tag}-${"0".repeat(16)}`,
      payload: {
        schema_version: 2 as const,
        scope_ref: "mem:scope",
        purpose_ref: "purpose:l7",
        valid_time: { t: 1 },
        components: [{ component_id: `component:${tag}`, kind: "context" as const, text: CORPUS[index]!, citation_ids: [`citation:${tag}`] }],
        primary_component_id: `component:${tag}`,
        primary_event: { at: 1, type_ref: "event:l7", citation_id: `citation:${tag}` },
        citations: [{ citation_id: `citation:${tag}`, source_ref: `source:${tag}`, locator: { scheme: "document", value: `l7#${tag}` }, content_digest: DIGEST }],
        retention: { derivative_rule: "retain" as const },
        reconciliation: { family_refs: [] },
      },
      evidence: { evidence_ref: `evidence:${tag}`, evidence_digest: DIGEST, citation_ids: [`citation:${tag}`] },
      authorization: { credential: "credential:l7" },
      source_order: { source_ref: `source:${tag}`, sequence: "0" },
      deadline_at: DEADLINE,
      cancellation_ref: `cancel:${tag}`,
    });
    if (!captured.ok) throw new Error(`recall corpus capture ${tag} failed: ${captured.error.code} ${captured.error.message} (operation=${captured.error.operation} retryable=${captured.error.retryable})`);
    if (captured.value.candidate_id === undefined) throw new Error(`recall corpus capture ${tag} failed: no candidate_id (status=${captured.value.status})`);
    const admitted = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE });
    if (!admitted.ok) throw new Error(`recall corpus admission ${tag} failed: ${admitted.error.code} ${admitted.error.message} (operation=${admitted.error.operation} retryable=${admitted.error.retryable})`);
    if (admitted.value.record_id === undefined) throw new Error(`recall corpus admission ${tag} not accepted: status=${admitted.value.status} ${JSON.stringify(admitted.value)}`);
    recordIds.push(admitted.value.record_id);
  }
  return recordIds;
}

interface RecallSuiteV1 {
  offline: RecallPacketV2;
  semantic: RecallPacketV2;
  paged_ids: string[];
  page_count: number;
}

/**
 * Full recall coverage on one seeded memory for one profile: ranked recall
 * plus a page-size-2 walk pinned to the same profile and dual-as-of pair.
 * The offline profile requires memories built without projection ports (the
 * engine prefers semantic_v1 whenever they are configured); the semantic
 * profile requires them.
 */
async function runRecallSuite(
  memory: MemoryPortV2,
  profile: "offline_lexical_v1" | "semantic_v1",
): Promise<RecallSuiteV1> {
  const request = profile === "semantic_v1"
    ? recallRequest(QUERY, { minimum_channels: "lexical_and_semantic" })
    : recallRequest(QUERY);
  const ranked = await memory.recall(request);
  if (!ranked.ok) throw new Error(`${profile} recall failed: ${ranked.error.code}`);
  expect(ranked.value.rank_receipt.profile).toBe(profile);
  expect(ranked.value.rank_receipt.scoring_formula_ref).toBe(
    profile === "semantic_v1"
      ? "graphify-memory:semantic-rrf-recency:v1"
      : "graphify-memory:offline-lexical-recency:v1",
  );
  // Offline: five corpus documents carry the query terms and the unrelated
  // sixth is filtered. Semantic: the vector channel admits every eligible id,
  // so the unrelated sixth also fuses into the candidate set.
  const expectedCount = profile === "semantic_v1" ? 6 : 5;
  expect(ranked.value.records).toHaveLength(expectedCount);
  expect(ranked.value.rank_receipt.candidate_count).toBe(expectedCount);
  if (profile === "semantic_v1") expect(ranked.value.rank_receipt.projection_receipt_digests).toHaveLength(2);

  // Pagination walks the same pinned profile and dual-as-of pair to the end.
  const collected: string[] = [];
  const profiles = new Set<string>();
  const pins = new Set<string>();
  let cursor: string | undefined;
  let pages = 0;
  do {
    const pageRequest = profile === "semantic_v1"
      ? recallRequest(QUERY, { minimum_channels: "lexical_and_semantic", page: cursor === undefined ? { size: 2 } : { size: 2, cursor } })
      : recallRequest(QUERY, { page: cursor === undefined ? { size: 2 } : { size: 2, cursor } });
    const page = await memory.recall(pageRequest);
    if (!page.ok) throw new Error(`${profile} paged recall failed: ${page.error.code}`);
    profiles.add(page.value.rank_receipt.profile);
    pins.add(`${page.value.rank_receipt.valid_as_of}@${page.value.rank_receipt.system_as_of}`);
    for (const entry of page.value.records) collected.push(entry.record.record_id);
    cursor = page.value.next_page_cursor;
    pages += 1;
    expect(pages).toBeLessThanOrEqual(10);
  } while (cursor !== undefined);
  expect(profiles).toEqual(new Set([profile]));
  expect(pins.size).toBe(1);
  expect(pages).toBeGreaterThanOrEqual(3);
  expect(collected).toEqual(ranked.value.records.map((entry) => entry.record.record_id));

  return {
    offline: ranked.value,
    semantic: ranked.value,
    paged_ids: collected,
    page_count: pages,
  };
}

async function buildSeededMemory(store: CanonicalMemoryStorePort, profile: "offline_lexical_v1" | "semantic_v1"): Promise<MemoryPortV2> {
  const { memory } = profile === "semantic_v1"
    ? buildMemory({ store, semantic: semanticPort(), vector: vectorPort() })
    : buildMemory({ store });
  await seedRecallCorpus(memory);
  return memory;
}

interface BackendSuitesV1 {
  offline: RecallSuiteV1;
  semantic: RecallSuiteV1;
}

async function sqliteSuites(): Promise<BackendSuitesV1> {
  const suites = {} as BackendSuitesV1;
  for (const profile of ["offline_lexical_v1", "semantic_v1"] as const) {
    const workspace = mkdtempSync(join(tmpdir(), "engram-memory-recall-sqlite-"));
    workspaces.push(workspace);
    const opened = await openFencedSqliteCanonicalMemoryStoreV1({
      filename: join(workspace, "recall.sqlite"),
      clock: { now: () => NOW },
      store_id: "recall",
      allow_ephemeral_filesystem_store: true,
    });
    if (!opened.ok) throw new Error(`sqlite recall open failed: ${opened.error.message}`);
    try {
      suites[profile === "offline_lexical_v1" ? "offline" : "semantic"] = await runRecallSuite(
        await buildSeededMemory(opened.value, profile), profile,
      );
    } finally {
      await opened.value.close();
    }
  }
  return suites;
}

async function inMemorySuites(): Promise<BackendSuitesV1> {
  const suites = {} as BackendSuitesV1;
  for (const profile of ["offline_lexical_v1", "semantic_v1"] as const) {
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
    suites[profile === "offline_lexical_v1" ? "offline" : "semantic"] = await runRecallSuite(
      await buildSeededMemory(store, profile), profile,
    );
  }
  return suites;
}

function expectSameSuites(actual: BackendSuitesV1, reference: BackendSuitesV1, label: string): void {
  expect(actual.offline.offline, `${label} offline recall must match`).toEqual(reference.offline.offline);
  expect(actual.offline.paged_ids, `${label} offline pagination must match`).toEqual(reference.offline.paged_ids);
  expect(actual.offline.page_count, `${label} offline page count must match`).toBe(reference.offline.page_count);
  expect(actual.semantic.semantic, `${label} semantic recall must match`).toEqual(reference.semantic.semantic);
  expect(actual.semantic.paged_ids, `${label} semantic pagination must match`).toEqual(reference.semantic.paged_ids);
  expect(actual.semantic.page_count, `${label} semantic page count must match`).toBe(reference.semantic.page_count);
}

describe("recall on durable SQLite matches the in-memory reference", () => {
  it("offline_lexical_v1, semantic_v1, and pagination return identical packets", async () => {
    expectSameSuites(await sqliteSuites(), await inMemorySuites(), "sqlite");
  });
});

describe("recall on durable Postgres matches the in-memory reference (CI only)", () => {
  const decision = postgresLaneDecision(MATRIX);
  if (decision.lane === "fail") {
    const cause = decision.cause;
    it("postgres lane prerequisites hold in required mode", () => {
      throw new Error(cause);
    });
    return;
  }
  const maybe = decision.lane === "run" ? it : it.skip;

  maybe("offline_lexical_v1, semantic_v1, and pagination return identical packets on Postgres 16/17", async () => {
    const reference = await inMemorySuites();
    for (const version of MATRIX) {
      const suites = {} as BackendSuitesV1;
      for (const profile of ["offline_lexical_v1", "semantic_v1"] as const) {
        // One fresh database per profile: both profiles seed the same fixed
        // idempotency keys, so sharing a database turns the second profile's
        // captures into duplicate_exact with no seal in its crypto port, and
        // the follow-up admission fails with NOT_FOUND (nothing pending).
        // This mirrors sqliteSuites, which uses a fresh file per profile.
        const postgres = await startEphemeralPostgres(version);
        stops.push(postgres.stop);
        try {
          const opened = await openPostgresCanonicalMemoryStoreV1({
            connection: postgres.connection,
            clock: { now: () => NOW },
            store_id: "recall",
          });
          if (!opened.ok) throw new Error(`postgres ${version} recall open failed: ${opened.error.message}`);
          try {
            suites[profile === "offline_lexical_v1" ? "offline" : "semantic"] = await runRecallSuite(
              await buildSeededMemory(opened.value, profile), profile,
            );
          } finally {
            await opened.value.close();
          }
        } finally {
          postgres.stop();
          const index = stops.indexOf(postgres.stop);
          if (index >= 0) stops.splice(index, 1);
        }
      }
      expectSameSuites(suites, reference, `postgres:${version}`);
    }
  }, 180_000);
});
