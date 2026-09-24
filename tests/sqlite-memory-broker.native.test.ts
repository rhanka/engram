import { once } from "node:events";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCanonicalMemoryStoreFactoryV1,
  openFencedSqliteCanonicalMemoryStoreV1,
  type FencedSqliteCanonicalMemoryStoreV1,
} from "../graphify-memory/index.js";
import { captureRequest, createL3Memory, NOW } from "./memory-l3-fixture.js";

const workspaces: string[] = [];
const children: ReturnType<typeof spawn>[] = [];

function filename(): string {
  const workspace = mkdtempSync(join(tmpdir(), "graphify-memory-sqlite-native-"));
  workspaces.push(workspace);
  return join(workspace, "canonical.sqlite");
}

// §5.9: acquire through the graphify-owned factory so the store carries this build's in-process provenance mark
// (and its readiness() declares the compiled adapter identity); otherwise the engine's fencing gate refuses it.
// The marked store passes FencedSqlite-specific methods (acquireRevocableSnapshot, forceFenceLossForTesting)
// through, so the cast is safe.
async function open(filenameValue: string, options: Omit<Parameters<typeof openFencedSqliteCanonicalMemoryStoreV1>[0], "filename" | "clock"> = {}): Promise<FencedSqliteCanonicalMemoryStoreV1> {
  const factory = createCanonicalMemoryStoreFactoryV1({ open: () => openFencedSqliteCanonicalMemoryStoreV1({ filename: filenameValue, clock: { now: () => NOW }, allow_ephemeral_filesystem_store: true, ...options }) });
  const acquired = await factory.acquire({ store_id: filenameValue, backend: "sqlite", deadline_at: "2026-08-16T12:40:00.000Z" });
  if (!acquired.ok) throw new Error(acquired.error.message);
  expect(acquired.value.capabilities).toMatchObject({ fenced_single_writer: true, revocable_active_store: true, detached_snapshot: true });
  return acquired.value as unknown as FencedSqliteCanonicalMemoryStoreV1;
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
  while (children.length > 0) { try { children.pop()!.kill("SIGKILL"); } catch { /* already gone */ } }
  while (workspaces.length > 0) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

describe("native SQLite memory broker", () => {
  it("second process is refused and stale epoch fails before its first SQL statement", async () => {
    const target = filename();
    const helper = join(process.cwd(), "graphify-memory", "node_modules", "fs-ext", "fs-ext.js");
    // §5.9 v5-b: the fence is a flock on the canonical DB's OWN inode (no more `.lock` sidecar), so the competing
    // holder must flock the database file itself — that is what makes our open contend and lose.
    const child = spawn(process.execPath, ["--input-type=module", "--eval", `
      const fs = await import("node:fs");
      const flock = await import(${JSON.stringify(helper)});
      const fd = fs.openSync(process.argv[1], "a", 0o600);
      flock.flockSync(fd, "exnb");
      process.stdout.write("READY\\n");
      setInterval(() => {}, 1_000);
    `, `${target}`], { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("flock holder did not become ready")), 5_000);
      child.stdout?.on("data", (data: Buffer) => {
        if (data.toString("utf8").includes("READY")) { clearTimeout(timeout); resolve(); }
      });
      child.once("error", reject);
    });
    await expect(openFencedSqliteCanonicalMemoryStoreV1({ filename: target, clock: { now: () => NOW }, allow_ephemeral_filesystem_store: true }))
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

  it("factory acquire refuses a second live holder and FENCE_LOST is terminal with no silent re-acquire, exercised through a minimal external-host harness (graceful close, host crash, restart, stale instance)", async () => {
    const target = filename();
    const helper = join(process.cwd(), "graphify-memory", "node_modules", "fs-ext", "fs-ext.js");
    const epochOf = async (s: FencedSqliteCanonicalMemoryStoreV1): Promise<bigint> => {
      const r = await s.readiness();
      if (!r.ok) throw new Error(`readiness failed: ${r.error.code}`);
      return BigInt(r.value.storage_epoch);
    };
    const openRaw = () => openFencedSqliteCanonicalMemoryStoreV1({ filename: target, clock: { now: () => NOW }, allow_ephemeral_filesystem_store: true });

    // (1) graceful close: host A holds the fence; a concurrent second live holder is refused FENCE_LOST; after A
    // closes gracefully the flock is released, so host B opens and is admitted with an advanced durable epoch.
    const a = await open(target);
    const e0 = await epochOf(a);
    await expect(openRaw()).resolves.toMatchObject({ ok: false, error: { code: "FENCE_LOST" } }); // second live holder refused
    await a.close();
    const b = await open(target);
    expect(await epochOf(b)).toBeGreaterThan(e0);
    await b.close();

    // (2) host crash: a child process holds the real flock (a live external host); our open contends and loses;
    // SIGKILL makes the kernel release the flock (no stranded lock), so the next open is admitted.
    const child = spawn(process.execPath, ["--input-type=module", "--eval", `
      const fs = await import("node:fs");
      const flock = await import(${JSON.stringify(helper)});
      const fd = fs.openSync(process.argv[1], "a", 0o600);
      flock.flockSync(fd, "exnb");
      process.stdout.write("READY\\n");
      setInterval(() => {}, 1_000);
    `, `${target}`], { stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("flock holder did not become ready")), 5_000);
      child.stdout?.on("data", (data: Buffer) => { if (data.toString("utf8").includes("READY")) { clearTimeout(timeout); resolve(); } });
      child.once("error", reject);
    });
    await expect(openRaw()).resolves.toMatchObject({ ok: false, error: { code: "FENCE_LOST" } }); // the live host holds it
    child.kill("SIGKILL");
    await once(child, "exit");
    const afterCrash = await open(target); // the crash released the flock; a new host takes over and is admitted

    // (3) restart: successive opens advance storage_epoch strictly and never reset it to zero.
    const e1 = await epochOf(afterCrash);
    await afterCrash.close();
    const restarted = await open(target);
    const e2 = await epochOf(restarted);
    expect(e2).toBeGreaterThan(e1);
    expect(e1).toBeGreaterThan(0n); // strictly increasing across the crash/restart, never reset

    // (4) stale instance: an intruder advances the durable epoch (dispossession); the store's next op is FENCE_LOST.
    const { memory } = createL3Memory("accept", restarted);
    const native = await import("../graphify-memory/node_modules/better-sqlite3/lib/index.js");
    const setDurableEpoch = (value: string) => { const db = new native.default(target); db.prepare("UPDATE memory_meta SET value = ? WHERE key = 'storage_epoch'").run(value); db.close(); };
    setDurableEpoch("999999");
    await expect(memory.capture(captureRequest("idempotency-key-stale-1", "1"))).resolves.toMatchObject({ ok: false, error: { code: "FENCE_LOST" } });
    // TERMINAL, no silent re-acquire — the discriminating step: the intruder RESTORES the store's own epoch (e2), so
    // the live epoch-drift condition no longer holds, yet the next op is STILL FENCE_LOST. This isolates the terminal
    // `#fenceLost` latch from the live check: WITHOUT the latch (mutation M7) the store would silently re-acquire on
    // the now-matching epoch and this op would SUCCEED, turning the case red. Restoring the epoch is what makes the
    // "terminal" half of the title falsifiable rather than a façade.
    setDurableEpoch(e2.toString());
    await expect(memory.capture(captureRequest("idempotency-key-stale-2", "2"))).resolves.toMatchObject({ ok: false, error: { code: "FENCE_LOST" } });
    await restarted.close();
  });
});
