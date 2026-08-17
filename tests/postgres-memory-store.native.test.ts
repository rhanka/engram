import { afterEach, describe, expect, it } from "vitest";

import {
  openPostgresCanonicalMemoryStoreV1,
  type CanonicalMemoryStorePort,
} from "../graphify-memory/index.js";
import { captureRequest, createL3Memory, DEADLINE, NOW } from "./memory-l3-fixture.js";
import { dockerAvailable, postgresImageAvailable, startEphemeralPostgres } from "./postgres-ephemeral.js";

const MATRIX = ["16", "17"] as const;
const CLOCK = { now: () => NOW } as const;
const AUTHORIZATION = { credential: "credential:l3" } as const;

async function tableCount(connection: string, table: string): Promise<number> {
  const pg = await import("pg");
  const client = new pg.default.Client(connection);
  await client.connect();
  try {
    const result = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
    return result.rows[0]?.count ?? -1;
  } finally {
    await client.end();
  }
}

const stops: Array<() => void> = [];

afterEach(() => {
  while (stops.length > 0) stops.pop()!();
});

describe("native Postgres memory store", () => {
  const gate = dockerAvailable() && MATRIX.every(postgresImageAvailable);
  const maybe = gate ? it : it.skip;

  maybe("promotion is atomic and generation mismatch fails before mutation", async () => {
    for (const version of MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      stops.push(postgres.stop);
      const connection = postgres.connection;

      // --- promotion is atomic: an injected mid-write failpoint rolls back the whole transaction ---
      let armed = false;
      const failStore = await openPostgresCanonicalMemoryStoreV1({
        connection,
        clock: CLOCK,
        store_id: "native",
        failpoint: (stage) => { if (armed && stage === "after_state") throw new Error(`inject:${stage}`); },
      });
      expect(failStore).toMatchObject({ ok: true, value: { capabilities: { backend: "postgres", fenced_single_writer: true } } });
      if (!failStore.ok) throw new Error(`open ${version} failed: ${failStore.error.message}`);
      const failMemory = createL3Memory("accept", failStore.value).memory;
      const pending = await failMemory.capture(captureRequest("native-atomic-promotion", "1"));
      expect(pending).toMatchObject({ ok: true, value: { status: "committed_pending" } });
      if (!pending.ok || pending.value.candidate_id === undefined) throw new Error("pending fixture failed");
      const before = {
        blob: await tableCount(connection, "memory_blob"),
        journal: await tableCount(connection, "memory_journal"),
        state: await tableCount(connection, "memory_state"),
        lexical: await tableCount(connection, "accepted_lexical"),
        outbox: await tableCount(connection, "memory_outbox"),
      };
      armed = true;
      await expect(failMemory.requestAdmission({ candidate_id: pending.value.candidate_id, authorization: AUTHORIZATION, deadline_at: DEADLINE }))
        .resolves.toMatchObject({ ok: false, error: { code: "STORE_UNAVAILABLE" } });
      expect({
        blob: await tableCount(connection, "memory_blob"),
        journal: await tableCount(connection, "memory_journal"),
        state: await tableCount(connection, "memory_state"),
        lexical: await tableCount(connection, "accepted_lexical"),
        outbox: await tableCount(connection, "memory_outbox"),
      }).toEqual(before);
      await failStore.value.close();

      // --- generation mismatch fails before the first mutating statement ---
      const statements: string[] = [];
      const stale = await openPostgresCanonicalMemoryStoreV1({ connection, clock: CLOCK, store_id: "native", on_mutation_statement: (statement) => statements.push(statement) });
      if (!stale.ok) throw new Error(`stale open ${version} failed: ${stale.error.message}`);
      // A later owner opening the same logical store advances the durable generation.
      const owner: CanonicalMemoryStorePort | undefined = await (async () => {
        const opened = await openPostgresCanonicalMemoryStoreV1({ connection, clock: CLOCK, store_id: "native" });
        return opened.ok ? opened.value : undefined;
      })();
      if (owner === undefined) throw new Error("owner open failed");
      const journalBefore = await tableCount(connection, "memory_journal");
      const staleMemory = createL3Memory("accept", stale.value).memory;
      await expect(staleMemory.capture(captureRequest("native-stale-generation", "1")))
        .resolves.toMatchObject({ ok: false, error: { code: "FENCE_LOST" } });
      expect(statements).toEqual([]);
      expect(await tableCount(connection, "memory_journal")).toBe(journalBefore);
      await stale.value.close();
      await owner.close();
    }
  }, 180_000);
});
