import { once } from "node:events";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import {
  openFencedSqliteCanonicalMemoryStoreV1,
  type FencedSqliteCanonicalMemoryStoreV1,
} from "../graphify-memory/index.js";
import { captureRequest, createL3Memory, NOW } from "./memory-l3-fixture.js";

const workspaces: string[] = [];

function filename(): string {
  const workspace = mkdtempSync(join(tmpdir(), "graphify-memory-sqlite-native-"));
  workspaces.push(workspace);
  return join(workspace, "canonical.sqlite");
}

async function open(filenameValue: string, options: Omit<Parameters<typeof openFencedSqliteCanonicalMemoryStoreV1>[0], "filename" | "clock"> = {}): Promise<FencedSqliteCanonicalMemoryStoreV1> {
  const opened = await openFencedSqliteCanonicalMemoryStoreV1({ filename: filenameValue, clock: { now: () => NOW }, ...options });
  expect(opened).toMatchObject({ ok: true, value: { capabilities: { fenced_single_writer: true, revocable_active_store: true, detached_snapshot: true } } });
  if (!opened.ok) throw new Error(opened.error.message);
  return opened.value;
}

async function tableCount(filenameValue: string, table: string): Promise<number> {
  const native = await import("../graphify-memory/node_modules/better-sqlite3/lib/index.js");
  const database = new native.default(filenameValue, { readonly: true, fileMustExist: true });
  try {
    return (database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count;
  } finally {
    database.close();
  }
}

afterEach(() => {
  while (workspaces.length > 0) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

describe("native SQLite memory broker", () => {
  it("second process is refused and stale epoch fails before its first SQL statement", async () => {
    const target = filename();
    const helper = join(process.cwd(), "graphify-memory", "node_modules", "fs-ext", "fs-ext.js");
    const child = spawn(process.execPath, ["--input-type=module", "--eval", `
      const fs = await import("node:fs");
      const flock = await import(${JSON.stringify(helper)});
      const fd = fs.openSync(process.argv[1], "a", 0o600);
      flock.flockSync(fd, "exnb");
      process.stdout.write("READY\\n");
      setInterval(() => {}, 1_000);
    `, `${target}.lock`], { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("flock holder did not become ready")), 5_000);
      child.stdout?.on("data", (data: Buffer) => {
        if (data.toString("utf8").includes("READY")) { clearTimeout(timeout); resolve(); }
      });
      child.once("error", reject);
    });
    await expect(openFencedSqliteCanonicalMemoryStoreV1({ filename: target, clock: { now: () => NOW } }))
      .resolves.toMatchObject({ ok: false, error: { code: "FENCE_LOST" } });
    child.kill("SIGKILL");
    await once(child, "exit");

    const statements: string[] = [];
    const store = await open(target, { on_mutation_statement: (statement) => statements.push(statement) });
    const native = await import("../graphify-memory/node_modules/better-sqlite3/lib/index.js");
    const intruder = new native.default(target);
    intruder.prepare("UPDATE memory_meta SET value = ? WHERE key = 'storage_epoch'").run("999");
    intruder.close();
    const { memory } = createL3Memory("accept", store);
    await expect(memory.capture(captureRequest("idempotency-key-stale-epoch", "1")))
      .resolves.toMatchObject({ ok: false, error: { code: "FENCE_LOST" } });
    expect(statements).toEqual([]);
    expect(await tableCount(target, "memory_journal")).toBe(0);
    await store.close();
  });

  it("lock loss before commit rolls back and revokes active readers", async () => {
    const target = filename();
    let store: FencedSqliteCanonicalMemoryStoreV1 | undefined;
    store = await open(target, { before_commit: () => store?.forceFenceLossForTesting() });
    const reader = await store.acquireRevocableSnapshot({ lease_ms: 10_000, purpose: "ranking" });
    expect(reader).toMatchObject({ ok: true, value: { purpose: "ranking" } });
    if (!reader.ok) throw new Error("reader fixture failed");
    const { memory } = createL3Memory("accept", store);
    await expect(memory.capture(captureRequest("idempotency-key-fence-loss", "1")))
      .resolves.toMatchObject({ ok: false, error: { code: "FENCE_LOST" } });
    await expect(reader.value.readAcceptedLexicalDocuments()).resolves.toMatchObject({ ok: false, error: { code: "FENCE_LOST" } });
    expect(await tableCount(target, "memory_journal")).toBe(0);
    await store.close();
  });

  it("detached ranking and backup copies never retain the active WAL", async () => {
    const target = filename();
    const store = await open(target);
    const { memory } = createL3Memory("accept", store);
    const captured = await memory.capture(captureRequest("idempotency-key-detached-copy", "1"));
    if (!captured.ok || captured.value.candidate_id === undefined) throw new Error("capture fixture failed");
    await expect(memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: "2026-08-16T12:40:00.000Z" }))
      .resolves.toMatchObject({ ok: true, value: { status: "accepted" } });
    const ranking = await store.acquireRevocableSnapshot({ lease_ms: 10_000, purpose: "ranking" });
    const backup = await store.acquireRevocableSnapshot({ lease_ms: 10_000, purpose: "backup" });
    expect(ranking).toMatchObject({ ok: true, value: { purpose: "ranking" } });
    expect(backup).toMatchObject({ ok: true, value: { purpose: "backup" } });
    if (!ranking.ok || !backup.ok) throw new Error("detached snapshot fixture failed");
    await expect(ranking.value.readAcceptedLexicalDocuments()).resolves.toMatchObject({ ok: true, value: { length: 1 } });
    await expect(backup.value.readAcceptedLexicalDocuments()).resolves.toMatchObject({ ok: true, value: { length: 1 } });
    const copies = readdirSync(join(target, "..")).filter((entry) => entry.startsWith("canonical.sqlite.detached-"));
    expect(copies).toHaveLength(2);
    const active = statSync(target);
    for (const copy of copies) {
      const copyPath = join(target, "..", copy);
      const identity = statSync(copyPath);
      expect([identity.dev, identity.ino]).not.toEqual([active.dev, active.ino]);
      expect(existsSync(`${copyPath}-wal`)).toBe(false);
      expect(existsSync(`${copyPath}-shm`)).toBe(false);
    }
    await ranking.value.close();
    await backup.value.close();
    await store.close();
  });
});
