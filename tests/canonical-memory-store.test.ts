import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  openFencedSqliteCanonicalMemoryStoreV1,
  type AdmissionStoreInputV1,
  type FencedSqliteCanonicalMemoryStoreV1,
} from "../graphify-memory/index.js";
import { captureRequest, createL3Memory, NOW } from "./memory-l3-fixture.js";

const workspaces: string[] = [];
const FAILPOINTS = ["after_blob", "after_journal", "after_state", "after_fts", "after_outbox"] as const;

function filename(): string {
  const workspace = mkdtempSync(join(tmpdir(), "graphify-memory-sqlite-"));
  workspaces.push(workspace);
  return join(workspace, "canonical.sqlite");
}

async function open(filenameValue: string, options: Omit<Parameters<typeof openFencedSqliteCanonicalMemoryStoreV1>[0], "filename" | "clock"> = {}): Promise<FencedSqliteCanonicalMemoryStoreV1> {
  const opened = await openFencedSqliteCanonicalMemoryStoreV1({ filename: filenameValue, clock: { now: () => NOW }, ...options });
  expect(opened).toMatchObject({
    ok: true,
    value: { capabilities: { atomic_promotion: true, dense_cursor: true, accepted_only_lexical: true, fenced_single_writer: true, revocable_active_store: true } },
  });
  if (!opened.ok) throw new Error(opened.error.message);
  return opened.value;
}

async function surfaceCounts(filenameValue: string): Promise<Record<string, number>> {
  const native = await import("../graphify-memory/node_modules/better-sqlite3/lib/index.js");
  const database = new native.default(filenameValue, { readonly: true, fileMustExist: true });
  try {
    const tables = ["memory_blob", "memory_journal", "memory_state", "accepted_lexical", "accepted_lexical_fts", "memory_outbox"];
    return Object.fromEntries(tables.map((table) => [table, (database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count]));
  } finally {
    database.close();
  }
}

afterEach(() => {
  while (workspaces.length > 0) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

describe("canonical SQLite memory store", () => {
  it("rolls back blob+journal+state+fts+outbox at every injected failpoint", async () => {
    for (const failpoint of FAILPOINTS) {
      const target = filename();
      let armed = false;
      const store = await open(target, { failpoint: (stage) => { if (armed && stage === failpoint) throw new Error(`inject:${stage}`); } });
      const { memory } = createL3Memory("accept", store);
      const pending = await memory.capture(captureRequest(`idempotency-key-failpoint-${failpoint}`, "1"));
      expect(pending).toMatchObject({ ok: true, value: { status: "committed_pending" } });
      if (!pending.ok || pending.value.candidate_id === undefined) throw new Error("pending fixture failed");
      const before = await surfaceCounts(target);
      armed = true;
      await expect(memory.requestAdmission({ candidate_id: pending.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: "2026-08-16T12:40:00.000Z" }))
        .resolves.toMatchObject({ ok: false, error: { code: "STORE_UNAVAILABLE" } });
      expect(await surfaceCounts(target)).toEqual(before);
      await expect(store.readPending({ candidate_id: pending.value.candidate_id, authorization_receipt_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }))
        .resolves.toMatchObject({ ok: true, value: { control: { state: "pending" } } });
      await store.close();
    }
  });

  it("same id with different full digest is refused without writes", async () => {
    const target = filename();
    const store = await open(target);
    let acceptedInput: AdmissionStoreInputV1 | undefined;
    const observingStore = new Proxy(store, {
      get(targetStore, property) {
        const value = Reflect.get(targetStore, property, targetStore);
        if (property === "applyAdmission") return async (input: AdmissionStoreInputV1) => {
          if (input.outcome === "accept") acceptedInput = structuredClone(input);
          return (value as FencedSqliteCanonicalMemoryStoreV1["applyAdmission"]).call(targetStore, input);
        };
        return typeof value === "function" ? value.bind(targetStore) : value;
      },
    });
    const { memory } = createL3Memory("accept", observingStore);
    const first = await memory.capture(captureRequest("idempotency-key-digest-one", "1"));
    if (!first.ok || first.value.candidate_id === undefined) throw new Error("first capture failed");
    await expect(memory.requestAdmission({ candidate_id: first.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: "2026-08-16T12:40:00.000Z" }))
      .resolves.toMatchObject({ ok: true, value: { status: "accepted" } });
    if (acceptedInput === undefined || acceptedInput.outcome !== "accept") throw new Error("acceptance fixture was not observed");

    const next = await createL3Memory("accept", store).memory.capture(captureRequest("idempotency-key-digest-two", "2"));
    if (!next.ok || next.value.candidate_id === undefined) throw new Error("second capture failed");
    const differentDigest = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
    const before = await surfaceCounts(target);
    const conflict = await store.applyAdmission({
      ...acceptedInput,
      candidate_id: next.value.candidate_id,
      record: { ...acceptedInput.record, record_digest: differentDigest },
      event: { ...acceptedInput.event, event_id: "event:digest-conflict", record_digest: differentDigest },
      decision: { ...acceptedInput.decision, record_digest: differentDigest },
    });
    expect(conflict).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT" } });
    expect(await surfaceCounts(target)).toEqual(before);
    await store.close();
  });
});
