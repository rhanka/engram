import { once } from "node:events";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCanonicalMemoryStoreFactoryV1,
  createLogicalMemoryBackupV1,
  openFencedSqliteCanonicalMemoryStoreV1,
  receiptDigest,
  runProjectionInvalidationCascadeV1,
  type Digest,
  type FencedSqliteCanonicalMemoryStoreV1,
  type LogicalBackupManifestV1,
  type ProjectionBatchV1,
  type ProjectionInvalidationSurfaceV1,
} from "../engram-memory/index.js";
import {
  raiseSqliteMinimumVersionForTestingV1,
  resetSqliteMinimumVersionForTestingV1,
} from "../engram-memory/sqlite.js";
import { captureRequest, createL3Memory, lifecycleCommand, NOW } from "./memory-l3-fixture.js";
import { ACTIVITY_NOW, ACTIVITY_STAGES, activityHarness, assertActivityReplayAfterLogicalRestore, assertActivityReplayAtStage } from "./memory-activity-fixture.js";

describe("X1 lifecycle backend matrix / SQLite", () => {
  it.each(["malformed digest", "different content", "invalid JSON"])("corrupt registry at open refuses JOURNAL_CORRUPT: %s", async corruption => {
    const dir = mkdtempSync(join(process.cwd(), ".graphify/scratch/x1-corrupt-"));
    const filename = join(dir, "memory.sqlite");
    const open = () => openFencedSqliteCanonicalMemoryStoreV1({ filename, clock: { now: () => ACTIVITY_NOW }, allow_ephemeral_filesystem_store: true });
    try {
      const opened = await open();
      if (!opened.ok) throw new Error(JSON.stringify(opened));
      const h = activityHarness();
      expect(await h.build(opened.value).ingestActivity(h.request)).toMatchObject({ ok: true });
      await opened.value.close();
      const native = await import("../engram-memory/node_modules/better-sqlite3/lib/index.js");
      const db = new native.default(filename);
      try {
        const row = db.prepare("SELECT body FROM memory_capture_idempotency").get() as { body: string };
        const entry = JSON.parse(row.body);
        entry.content = corruption === "malformed digest" ? "invalid" : `sha256:${"b".repeat(64)}`;
        db.prepare("UPDATE memory_capture_idempotency SET body = ?").run(corruption === "invalid JSON" ? "{" : JSON.stringify(entry));
      } finally { db.close(); }
      const reopened = await open();
      if (reopened.ok) await reopened.value.close();
      expect(reopened).toMatchObject({ ok: false, error: { code: "JOURNAL_CORRUPT" } });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("Opus a1: logical restore preserves exact replay and content conflicts without writes", async () => {
    const dir = mkdtempSync(join(process.cwd(), ".graphify/scratch/x1-restore-"));
    const stores: FencedSqliteCanonicalMemoryStoreV1[] = [];
    let mutations = 0;
    const factory = createCanonicalMemoryStoreFactoryV1({
      open: async construction => {
        const opened = await openFencedSqliteCanonicalMemoryStoreV1({ filename: join(dir, construction.store_id + ".sqlite"),
          clock: { now: () => ACTIVITY_NOW }, allow_ephemeral_filesystem_store: true,
          on_mutation_statement: () => { mutations++; } });
        if (opened.ok) stores.push(opened.value);
        return opened;
      } });
    try {
      const source = await factory.acquire({ store_id: "source", backend: "sqlite", deadline_at: X4_DEADLINE });
      const target = await factory.acquire({ store_id: "target", backend: "sqlite", deadline_at: X4_DEADLINE });
      if (!source.ok || !target.ok) throw new Error(JSON.stringify({ source, target }));
      await assertActivityReplayAfterLogicalRestore(source.value, target.value, () => mutations);
    } finally { for (const store of stores) await store.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it.each(ACTIVITY_STAGES)("%s: durable reopen, exact replay and isolated content conflicts write nothing", async stage => {
    const dir = mkdtempSync(join(tmpdir(), "engram-x1-"));
    let mutations = 0;
    try {
      await assertActivityReplayAtStage(async () => {
        const opened = await openFencedSqliteCanonicalMemoryStoreV1({ filename: join(dir, "memory.sqlite"), clock: { now: () => ACTIVITY_NOW },
          allow_ephemeral_filesystem_store: true, on_mutation_statement: () => { mutations++; } });
        if (!opened.ok) throw new Error(JSON.stringify(opened));
        return opened.value;
      }, stage, () => mutations);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

const X4_DEADLINE = "2026-08-16T12:40:00.000Z";
const X4_DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Digest;
const X4_ZERO = "sha256:0000000000000000000000000000000000000000000000000000000000000000" as Digest;

function x4AuthorizationPort() {
  return {
    version: 1 as const,
    async authorize(request: { operation: string; resource_digest: Digest }) {
      const body = {
        allowed: true as const,
        decision_id: "decision:x4-backup",
        policy_version: "1",
        operation: request.operation,
        resource_digest: request.resource_digest,
        scope_ref: "scope:l3",
        not_before: NOW,
        expires_at: X4_DEADLINE,
        revocation_epoch: "0",
        redaction: { mode: "field-allowlist" as const, allowed_fields: [], allow_derivation_lineage: false, max_packet_bytes: 4_096 },
        authentication_receipt_digest: X4_DIGEST,
      };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("authorization-allowed", body) } };
    },
    async revalidate() { throw new Error("unused"); },
    async redact() { throw new Error("unused"); },
  };
}

function x4BackupPorts() {
  const vault = new Map<string, { plaintext: string; context_digest: Digest }>();
  const objects = new Map<string, { ciphertext: string; ciphertext_digest: Digest }>();
  const sealedPlaintexts: string[] = [];
  const key = {
    version: 1 as const,
    async seal(input: { key_ref: string; plaintext: string; context_digest: Digest }) {
      const ciphertext_digest = receiptDigest("test-backup-ciphertext", { plaintext: input.plaintext, context_digest: input.context_digest });
      const ciphertext = ciphertext_digest;
      vault.set(ciphertext, { plaintext: input.plaintext, context_digest: input.context_digest });
      sealedPlaintexts.push(input.plaintext);
      return { ok: true as const, value: { ciphertext, ciphertext_digest, key_receipt_digest: receiptDigest("test-backup-key", { key_ref: input.key_ref, context_digest: input.context_digest }) } };
    },
    async open(input: { key_ref: string; ciphertext: string; context_digest: Digest }) {
      const entry = vault.get(input.ciphertext);
      if (entry === undefined || entry.context_digest !== input.context_digest) {
        return { ok: false as const, error: { code: "BACKUP_INVALID" as const, operation: "restore" as const, message: "context digest mismatch", retryable: false } };
      }
      return { ok: true as const, value: { plaintext: entry.plaintext, key_receipt_digest: receiptDigest("test-backup-key", { key_ref: input.key_ref, context_digest: input.context_digest }) } };
    },
  };
  const object = {
    version: 1 as const,
    async put(input: { object_id: string; ciphertext: string; ciphertext_digest: Digest }) {
      objects.set(input.object_id, { ciphertext: input.ciphertext, ciphertext_digest: input.ciphertext_digest });
      return { ok: true as const, value: { object_ref: input.object_id, object_receipt_digest: receiptDigest("test-backup-object", { object_id: input.object_id, ciphertext_digest: input.ciphertext_digest }) } };
    },
    async get(input: { object_ref: string; expected_ciphertext_digest: Digest }) {
      const stored = objects.get(input.object_ref);
      if (stored === undefined || stored.ciphertext_digest !== input.expected_ciphertext_digest) {
        return { ok: false as const, error: { code: "BACKUP_INVALID" as const, operation: "restore" as const, message: "object missing or digest mismatch", retryable: false } };
      }
      return { ok: true as const, value: { ciphertext: stored.ciphertext, object_receipt_digest: receiptDigest("test-backup-object", { object_id: input.object_ref, ciphertext_digest: stored.ciphertext_digest }) } };
    },
  };
  return { key, object, sealedPlaintexts };
}

const X4_EXPECTED_CODES: Record<string, string> = {
  manifest_digest: "BACKUP_INVALID",
  state_digest: "RESTORE_REFUSED",
  journal_root_digest: "BACKUP_INVALID",
  records_root_digest: "BACKUP_INVALID",
  terminal_ledger_digest: "RESTORE_REFUSED",
  ciphertext_digest: "BACKUP_INVALID",
  object_ref: "BACKUP_INVALID",
  high_water_cursor: "BACKUP_INVALID",
  generation: "BACKUP_INVALID",
  included_classes: "BACKUP_INVALID",
  excluded_counts: "BACKUP_INVALID",
  key_receipt_digest: "BACKUP_INVALID",
  object_receipt_digest: "BACKUP_INVALID",
};

function x4MutatedBody(manifest: LogicalBackupManifestV1, part: string): Omit<LogicalBackupManifestV1, "manifest_digest"> {
  const { manifest_digest: _dropped, ...body } = manifest;
  switch (part) {
    case "state_digest": return { ...body, state_digest: X4_ZERO };
    case "journal_root_digest": return { ...body, journal_root_digest: X4_ZERO };
    case "records_root_digest": return { ...body, records_root_digest: X4_ZERO };
    case "terminal_ledger_digest": return { ...body, terminal_ledger_digest: X4_ZERO };
    case "ciphertext_digest": return { ...body, ciphertext_digest: X4_ZERO };
    case "object_ref": return { ...body, object_ref: `${body.object_ref}-tampered` };
    case "high_water_cursor": return { ...body, high_water_cursor: "1" };
    case "generation": return { ...body, generation: "1" };
    case "included_classes": return { ...body, included_classes: [] as unknown as LogicalBackupManifestV1["included_classes"] };
    case "excluded_counts": return { ...body, excluded_counts: { ...body.excluded_counts, pending: body.excluded_counts.pending + 100 } };
    case "key_receipt_digest": return { ...body, key_receipt_digest: X4_ZERO };
    case "object_receipt_digest": return { ...body, object_receipt_digest: X4_ZERO };
    default: throw new Error(`unknown manifest part ${part}`);
  }
}

function x4Tampered(manifest: LogicalBackupManifestV1, part: string): LogicalBackupManifestV1 {
  // `manifest_digest` alone is corrupted (digest mismatch). Every other part
  // is re-signed so the tamper reaches its own field check instead of dying
  // on the outer manifest-digest gate.
  if (part === "manifest_digest") return { ...manifest, manifest_digest: X4_ZERO };
  const body = x4MutatedBody(manifest, part);
  return { ...body, manifest_digest: receiptDigest("logical-backup-manifest", body) };
}

const workspaces: string[] = [];
const children: ReturnType<typeof spawn>[] = [];

function filename(): string {
  const workspace = mkdtempSync(join(tmpdir(), "engram-memory-sqlite-native-"));
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
  const native = await import("../engram-memory/node_modules/better-sqlite3/lib/index.js");
  const database = new native.default(filenameValue, { readonly: true, fileMustExist: true });
  try {
    return (database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count;
  } finally {
    database.close();
  }
}

afterEach(async () => {
  // Deterministic teardown: SIGKILL every spawned child AND await its exit before removing the workspace, so a
  // still-live flock holder cannot outlast the test or race the rmSync below. A child already reaped inline
  // (exitCode/signalCode set) is skipped so the await never hangs on an exit event that already fired.
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill("SIGKILL"); await once(child, "exit"); } catch { /* already gone */ }
    }
  }
  while (workspaces.length > 0) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

describe("native SQLite memory broker", () => {
  it("second process is refused and stale epoch fails before its first SQL statement", async () => {
    const target = filename();
    const helper = join(process.cwd(), "engram-memory", "node_modules", "fs-ext", "fs-ext.js");
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
    children.push(child); // safety net: afterEach reaps it even if the assertion below throws before the inline kill
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
    const native = await import("../engram-memory/node_modules/better-sqlite3/lib/index.js");
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
    const helper = join(process.cwd(), "engram-memory", "node_modules", "fs-ext", "fs-ext.js");
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
    const native = await import("../engram-memory/node_modules/better-sqlite3/lib/index.js");
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

  it("a logical backup of a SQLite store restores the same canonical digests", async () => {
    const statements: string[] = [];
    const sourceFile = filename();
    const source = await open(sourceFile, { on_mutation_statement: (statement) => statements.push(statement) });

    const { memory } = createL3Memory("accept", source);
    const acceptOne = async (key: string, seq: string, text = "x4 order shared memory body") => {
      const captured = await memory.capture(captureRequest(key, seq, text));
      if (!captured.ok || captured.value.candidate_id === undefined) throw new Error(`x4 ${key} capture failed`);
      const admission = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: X4_DEADLINE });
      if (!admission.ok || admission.value.record_id === undefined) throw new Error(`x4 ${key} admission failed`);
      return admission.value.record_id as string;
    };
    // Ordre prouvé par au moins 3 courants + les deux recalculs lexicaux
    // (resolve_dispute, rewind) : 5 courants au total.
    const survivorA = await acceptOne("idempotency-key-x4-survivor-a", "1", "x4 order shared alpha meridian");
    const survivorB = await acceptOne("idempotency-key-x4-survivor-b", "2", "x4 order shared beta meridian");
    const survivorC = await acceptOne("idempotency-key-x4-survivor-c", "3", "x4 order shared gamma meridian");
    const resolvedId = await acceptOne("idempotency-key-x4-resolved", "4", "x4 order shared resolved meridian");
    await expect(memory.transition(lifecycleCommand("dispute", resolvedId, "event:x4-dispute-resolved"))).resolves.toMatchObject({ ok: true });
    await expect(memory.transition(lifecycleCommand("resolve_dispute", resolvedId, "event:x4-resolve"))).resolves.toMatchObject({ ok: true });
    const successorId = await acceptOne("idempotency-key-x4-successor", "5", "x4 order shared successor meridian");
    const rewoundId = await acceptOne("idempotency-key-x4-rewound", "6", "x4 order shared rewound meridian");
    await expect(memory.transition(lifecycleCommand("mark_non_current", rewoundId, "event:x4-historical-rewound"))).resolves.toMatchObject({ ok: true });
    await expect(memory.transition({
      operation: "rewind",
      event_id: "event:x4-rewind",
      record_id: rewoundId,
      related_record_id: successorId,
      reason_ref: "reason:rewind",
      event_anchor: { occurred_at: NOW, kind_ref: "kind:rewind", provenance_ref: "citation:l3", provenance_digest: X4_DIGEST },
      authorization: { credential: "credential:l3" },
      deadline_at: X4_DEADLINE,
    })).resolves.toMatchObject({ ok: true });
    const tombstonedId = await acceptOne("idempotency-key-x4-tomb", "7");
    await expect(memory.transition(lifecycleCommand("tombstone", tombstonedId, "event:x4-tombstone"))).resolves.toMatchObject({ ok: true });
    // Each lifecycle record carries a distinct payload: reusing the tombstoned
    // default body here would trip the same-scope recapture guard
    // (pending_adjudication instead of the accepted record this corpus needs).
    const disputedId = await acceptOne("idempotency-key-x4-disputed", "8", "x4 order shared disputed meridian");
    await expect(memory.transition(lifecycleCommand("dispute", disputedId, "event:x4-dispute"))).resolves.toMatchObject({ ok: true });
    const historicalId = await acceptOne("idempotency-key-x4-historical", "9", "x4 order shared historical meridian");
    await expect(memory.transition(lifecycleCommand("mark_non_current", historicalId, "event:x4-historical"))).resolves.toMatchObject({ ok: true });
    const expiredId = await acceptOne("idempotency-key-x4-expired", "10", "x4 order shared expired meridian");
    await expect(memory.transition(lifecycleCommand("expire", expiredId, "event:x4-expire"))).resolves.toMatchObject({ ok: true });
    const distrustedId = await acceptOne("idempotency-key-x4-distrust", "11", "x4 order shared distrust meridian");
    await expect(memory.transition(lifecycleCommand("trust_invalidate", distrustedId, "event:x4-distrust"))).resolves.toMatchObject({ ok: true });
    const survivorId = survivorA;
    const expectedCurrent = [survivorA, survivorB, survivorC, resolvedId, rewoundId].sort((a, b) => a.localeCompare(b));
    const expectedRemoved = [successorId, tombstonedId, disputedId, historicalId, expiredId, distrustedId].sort((a, b) => a.localeCompare(b));

    const pending = await memory.capture(captureRequest("idempotency-key-x4-pending", "12"));
    if (!pending.ok || pending.value.candidate_id === undefined) throw new Error("x4 pending capture failed");
    const rejectMemory = createL3Memory("reject", source);
    const rejected = await rejectMemory.memory.capture(captureRequest("idempotency-key-x4-rejected", "13"));
    if (!rejected.ok || rejected.value.candidate_id === undefined) throw new Error("x4 rejected capture failed");
    await expect(rejectMemory.memory.requestAdmission({ candidate_id: rejected.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: X4_DEADLINE }))
      .resolves.toMatchObject({ ok: true, value: { status: "rejected" } });

    const readiness = await source.readiness();
    if (!readiness.ok) throw new Error("x4 readiness failed");
    const through = readiness.value.high_water_cursor;
    const checkpoint = await source.checkpoint({ through_cursor: through });
    if (!checkpoint.ok) throw new Error("x4 checkpoint failed");
    const sourceJournal = await source.readJournal({ after: "0", limit: 2_000 });
    if (!sourceJournal.ok) throw new Error("x4 readJournal failed");

    statements.length = 0;
    const { key, object, sealedPlaintexts } = x4BackupPorts();
    const backup = createLogicalMemoryBackupV1({ store: source, authorization: x4AuthorizationPort(), backup_key: key, backup_object: object, clock: { now: () => NOW } });
    const exported = await backup.exportLogical({ through_cursor: through, authorization: { credential: "credential:l3" }, object_target_ref: "target:x4", encryption_key_ref: "key:x4", deadline_at: X4_DEADLINE });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    // Export is read-only: no durable mutation statement may run.
    expect(statements).toEqual([]);
    expect(exported.value.state_digest).toBe(checkpoint.value.state_digest);
    expect(exported.value.journal_root_digest).toBe(checkpoint.value.journal_root_digest);
    expect(exported.value.high_water_cursor).toBe(through);
    expect(exported.value.excluded_counts.pending).toBe(1);
    expect(exported.value.excluded_counts.rejected).toBe(1);
    expect(exported.value.excluded_counts.derived_projections).toBeGreaterThan(0);
    expect([...exported.value.included_classes].sort()).toEqual(["accepted_current", "accepted_disputed", "historical", "terminal_ledger"]);

    // Pending quarantine: the sealed payload carries no envelope, FTS or projection material.
    expect(sealedPlaintexts).toHaveLength(1);
    const plaintext = sealedPlaintexts[0]!;
    expect(plaintext.includes("ciphertext:")).toBe(false);
    expect(plaintext.includes("\"lexical\"")).toBe(false);
    expect(plaintext.includes("\"fields\"")).toBe(false);
    expect(plaintext.includes("\"outbox\"")).toBe(false);
    expect(plaintext.includes("\"batch_digest\"")).toBe(false);

    // Restore WRITES into a fresh empty target store and reproduces the canonical digests.
    const targetFile = filename();
    const target = await open(targetFile);
    const restored = await backup.restoreLogical({ manifest: exported.value, authorization: { credential: "credential:l3" }, source_ref: "target:x4", decryption_key_ref: "key:x4", deadline_at: X4_DEADLINE, target_store: target });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.restored_cursor).toBe(through);
    expect(restored.value.canonical_state_digest).toBe(exported.value.state_digest);

    const targetReadiness = await target.readiness();
    if (!targetReadiness.ok) throw new Error("x4 target readiness failed");
    expect(targetReadiness.value.high_water_cursor).toBe(through);
    const targetJournal = await target.readJournal({ after: "0", limit: 2_000 });
    if (!targetJournal.ok) throw new Error("x4 target readJournal failed");
    expect(targetJournal.value.map((event) => event.event_digest)).toEqual(sourceJournal.value.map((event) => event.event_digest));
    const targetCheckpoint = await target.checkpoint({ through_cursor: through });
    if (!targetCheckpoint.ok) throw new Error("x4 target checkpoint failed");
    expect(targetCheckpoint.value.state_digest).toBe(checkpoint.value.state_digest);
    expect(targetCheckpoint.value.journal_root_digest).toBe(checkpoint.value.journal_root_digest);
    expect(targetCheckpoint.value.blob_root_digest).toBe(checkpoint.value.blob_root_digest);
    // MINEUR 1 : le manifeste de checkpoint() est identique après restauration
    // (policy_versions dérive du journal, pas des contrôles exclus par quarantaine).
    expect(targetCheckpoint.value.policy_versions).toEqual(checkpoint.value.policy_versions);
    expect(targetCheckpoint.value.policy_versions).toEqual([{ id: "policy:l3", version: "1" }]);
    expect(targetCheckpoint.value.registry_versions).toEqual(checkpoint.value.registry_versions);
    {
      const { manifest_digest: _td, storage_epoch: _te, ...targetBody } = targetCheckpoint.value;
      const { manifest_digest: _sd, storage_epoch: _se, ...sourceBody } = checkpoint.value;
      expect(targetBody).toEqual(sourceBody);
    }

    // Classe X4 : le rappel lexical et tous les chemins publics rendent les
    // mêmes résultats, dans le même ordre, que la source (5 courants : l'ordre
    // exact est prouvé, pas vrai par construction).
    const snapshotInput = { valid_as_of: 1, system_as_of: through, authorization_receipt_digest: X4_DIGEST, max_candidates: 50 } as const;
    const sourceSnapshot = await source.acceptedSnapshot(snapshotInput);
    const targetSnapshot = await target.acceptedSnapshot(snapshotInput);
    expect(sourceSnapshot.ok).toBe(true);
    expect(targetSnapshot.ok).toBe(true);
    if (!sourceSnapshot.ok || !targetSnapshot.ok) throw new Error("x4 snapshot failed");
    expect(sourceSnapshot.value.documents.map((document) => document.record_id)).toEqual(expectedCurrent);
    expect(sourceSnapshot.value.documents).toHaveLength(5);
    expect(targetSnapshot.value.documents).toEqual(sourceSnapshot.value.documents);
    expect(targetSnapshot.value.eligibility_digest).toBe(sourceSnapshot.value.eligibility_digest);
    expect(targetSnapshot.value.snapshot_digest).toBe(sourceSnapshot.value.snapshot_digest);
    // Aucune résurrection : les classes non courantes ne figurent pas au rappel.
    for (const removed of expectedRemoved) {
      expect(sourceSnapshot.value.documents.map((document) => document.record_id)).not.toContain(removed);
    }
    const sourceRecord = await source.readRecord({ record_id: survivorId, system_as_of: through, authorization_receipt_digest: X4_DIGEST });
    const targetRecord = await target.readRecord({ record_id: survivorId, system_as_of: through, authorization_receipt_digest: X4_DIGEST });
    expect(targetRecord).toEqual(sourceRecord);
    expect(await tableCount(sourceFile, "accepted_lexical")).toBe(5);
    expect(await tableCount(targetFile, "accepted_lexical")).toBe(5);
    expect(await tableCount(targetFile, "accepted_lexical_fts")).toBe(5);
    const sourceBatch = await source.nextProjectionBatch({ after: "0", limit: 100 });
    const targetBatch = await target.nextProjectionBatch({ after: "0", limit: 100 });
    expect(sourceBatch.ok).toBe(true);
    expect(targetBatch.ok).toBe(true);
    if (!sourceBatch.ok || !targetBatch.ok) throw new Error("x4 projection batch failed");
    expect(targetBatch.value.records.map((record) => record.record_id).sort()).toEqual(expectedCurrent);
    // MINEUR 6 : le batch de reconstruction porte les retraits (rebuild depuis zéro).
    expect(targetBatch.value.removals.map((removal) => removal.record_id).sort()).toEqual(expectedRemoved);
    expect(targetBatch.value.through_cursor_inclusive).toBe(through);

    // Import is atomic into an empty store only: a second import refuses.
    await expect(backup.restoreLogical({ manifest: exported.value, authorization: { credential: "credential:l3" }, source_ref: "target:x4", decryption_key_ref: "key:x4", deadline_at: X4_DEADLINE, target_store: target }))
      .resolves.toMatchObject({ ok: false, error: { code: "RESTORE_REFUSED" } });

    // Chaque partie falsifiée refuse avec son propre code, après re-signature.
    for (const part of Object.keys(X4_EXPECTED_CODES)) {
      const bad = await backup.restoreLogical({ manifest: x4Tampered(exported.value, part), authorization: { credential: "credential:l3" }, source_ref: "target:x4", decryption_key_ref: "key:x4", deadline_at: X4_DEADLINE });
      expect(bad.ok, `tampered manifest part ${part} must refuse`).toBe(false);
      if (!bad.ok) expect(bad.error.code, `tampered part ${part}`).toBe(X4_EXPECTED_CODES[part]);
    }

    await source.close();
    await target.close();
  });

  it("a logical backup import is atomic under an after_journal failpoint and succeeds after reopen", async () => {
    const sourceFile = filename();
    const source = await open(sourceFile);
    const { memory } = createL3Memory("accept", source);
    const captured = await memory.capture(captureRequest("idempotency-key-x4-atomic", "1"));
    if (!captured.ok || captured.value.candidate_id === undefined) throw new Error("x4 atomic capture failed");
    const admission = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: X4_DEADLINE });
    if (!admission.ok) throw new Error("x4 atomic admission failed");
    const readiness = await source.readiness();
    if (!readiness.ok) throw new Error("x4 atomic readiness failed");
    const through = readiness.value.high_water_cursor;
    const { key, object } = x4BackupPorts();
    const backup = createLogicalMemoryBackupV1({ store: source, authorization: x4AuthorizationPort(), backup_key: key, backup_object: object, clock: { now: () => NOW } });
    const exported = await backup.exportLogical({ through_cursor: through, authorization: { credential: "credential:l3" }, object_target_ref: "target:x4-atomic", encryption_key_ref: "key:x4-atomic", deadline_at: X4_DEADLINE });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const targetFile = filename();
    let armed = true;
    const failing = await open(targetFile, { failpoint: (stage) => { if (armed && stage === "after_journal") throw new Error("inject:after_journal"); } });
    await expect(backup.restoreLogical({ manifest: exported.value, authorization: { credential: "credential:l3" }, source_ref: "target:x4-atomic", decryption_key_ref: "key:x4-atomic", deadline_at: X4_DEADLINE, target_store: failing }))
      .resolves.toMatchObject({ ok: false });
    await failing.close();

    // Réouverture : la cible reste vide (curseur 0), puis le nouvel essai réussit.
    const reopened = await open(targetFile);
    const reopenedReadiness = await reopened.readiness();
    if (!reopenedReadiness.ok) throw new Error("x4 atomic reopen readiness failed");
    expect(reopenedReadiness.value.high_water_cursor).toBe("0");
    void armed;
    const retried = await backup.restoreLogical({ manifest: exported.value, authorization: { credential: "credential:l3" }, source_ref: "target:x4-atomic", decryption_key_ref: "key:x4-atomic", deadline_at: X4_DEADLINE, target_store: reopened });
    expect(retried.ok).toBe(true);
    const snapshotInput = { valid_as_of: 1, system_as_of: through, authorization_receipt_digest: X4_DIGEST, max_candidates: 10 } as const;
    const sourceSnapshot = await source.acceptedSnapshot(snapshotInput);
    const targetSnapshot = await reopened.acceptedSnapshot(snapshotInput);
    if (!sourceSnapshot.ok || !targetSnapshot.ok) throw new Error("x4 atomic snapshot failed");
    expect(targetSnapshot.value.documents).toEqual(sourceSnapshot.value.documents);
    await source.close();
    await reopened.close();
  });

  it("an open refuses CAPABILITY_UNAVAILABLE when the runtime is below the required minimum", async () => {
    // The seam only raises: a floor at or below the default admits nothing new, so it throws.
    expect(() => raiseSqliteMinimumVersionForTestingV1("3.0.0")).toThrow();
    expect(() => raiseSqliteMinimumVersionForTestingV1("3.51.3")).toThrow();
    expect(() => raiseSqliteMinimumVersionForTestingV1("not-a-version")).toThrow();
    // No lowering happened: the bundled runtime still opens.
    const probe = await open(filename());
    await probe.close();
    // Raised above the bundled runtime, the open is refused before any durable write.
    raiseSqliteMinimumVersionForTestingV1("99.0.0");
    try {
      await expect(openFencedSqliteCanonicalMemoryStoreV1({ filename: filename(), clock: { now: () => NOW }, allow_ephemeral_filesystem_store: true }))
        .resolves.toMatchObject({ ok: false, error: { code: "CAPABILITY_UNAVAILABLE" } });
    } finally {
      resetSqliteMinimumVersionForTestingV1();
    }
    // The reset restored the default floor: opens are admitted again.
    const reopened = await open(filename());
    await reopened.close();
  });

  it("a lower second raise never lowers the active floor (ABA 99.0.0 -> 3.51.4)", async () => {
    // Revue Sol tour 1/3 (MAJEUR) : last-write-wins (comparer au dernier seuil
    // demandé) réautorisait le runtime embarqué après raise("99.0.0") puis
    // raise("3.51.4"). Cette variante est réfutée ici : seul le MAXIMUM monotone
    // des seuils est retenu, et seule une réinitialisation explicite le réarme.
    resetSqliteMinimumVersionForTestingV1();
    raiseSqliteMinimumVersionForTestingV1("99.0.0");
    try {
      // The bundled runtime is refused under the raised floor.
      await expect(openFencedSqliteCanonicalMemoryStoreV1({ filename: filename(), clock: { now: () => NOW }, allow_ephemeral_filesystem_store: true }))
        .resolves.toMatchObject({ ok: false, error: { code: "CAPABILITY_UNAVAILABLE" } });
      // A lower threshold does not raise: it is refused instead of admitted...
      expect(() => raiseSqliteMinimumVersionForTestingV1("3.51.4")).toThrow();
      // ...and the open stays refused until an explicit reset.
      await expect(openFencedSqliteCanonicalMemoryStoreV1({ filename: filename(), clock: { now: () => NOW }, allow_ephemeral_filesystem_store: true }))
        .resolves.toMatchObject({ ok: false, error: { code: "CAPABILITY_UNAVAILABLE" } });
    } finally {
      resetSqliteMinimumVersionForTestingV1();
    }
    // The explicit reset restored the default floor: opens are admitted again.
    const reopened = await open(filename());
    await reopened.close();
  });

  it("projection outbox survives reopen: the tombstone removal reaches the surface through one cursor receipt", async () => {
    const target = filename();
    const store = await open(target);
    const { memory } = createL3Memory("accept", store);
    const captured = await memory.capture(captureRequest("idempotency-key-projection-outbox", "1"));
    if (!captured.ok || captured.value.candidate_id === undefined) throw new Error("capture fixture failed");
    const admitted = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: "2026-08-16T12:40:00.000Z" });
    if (!admitted.ok || admitted.value.record_id === undefined) throw new Error("admission fixture failed");
    const recordId = admitted.value.record_id;
    const tombstoned = await memory.transition(lifecycleCommand("tombstone", recordId));
    expect(tombstoned.ok).toBe(true);
    if (!tombstoned.ok) throw new Error("tombstone fixture failed");
    const tombstoneCursor = tombstoned.value.cursor;
    await store.close();
    // The outbox is durable: after reopen, a fenced cascade from "0" still delivers the terminal removal
    // through the store's fenced nextProjectionBatch and acknowledgeProjection transaction.
    const reopened = await open(target);
    const removed: string[] = [];
    const cascade = await runProjectionInvalidationCascadeV1({
      store: reopened,
      surfaces: [{
        projection_id: "sqlite-probe",
        async invalidate(batch: ProjectionBatchV1) {
          for (const removal of batch.removals) removed.push(removal.record_id);
          return { ok: true as const, value: { projection_id: "sqlite-probe", cursor: batch.through_cursor_inclusive, digest: `sha256:${"0".repeat(64)}` as Digest } };
        },
      }],
      after_cursor: "0",
      deadline_at: "2026-08-16T12:40:00.000Z",
    });
    expect(cascade.ok).toBe(true);
    if (!cascade.ok) throw new Error("cascade fixture failed");
    // The terminal tombstone is delivered exactly once — never resurrected by an earlier add in the window.
    expect(removed.filter((entry) => entry === recordId)).toHaveLength(1);
    expect(cascade.value.receipt.complete).toBe(true);
    expect(cascade.value.receipt.through_cursor).toBe(tombstoneCursor);
    await reopened.close();
  });

  it("engine invalidateProjections drives the fenced SQLite store: tombstone converges, replay never resurrects", async () => {
    const target = filename();
    const store = await open(target);
    const entries = new Map<string, Digest>();
    const surface: ProjectionInvalidationSurfaceV1 = {
      projection_id: "sqlite-engine-probe",
      async invalidate(batch: ProjectionBatchV1) {
        for (const record of batch.records) entries.set(record.record_id, record.record_digest);
        for (const removal of batch.removals) entries.delete(removal.record_id);
        return { ok: true as const, value: { projection_id: "sqlite-engine-probe", cursor: batch.through_cursor_inclusive, digest: `sha256:${"0".repeat(64)}` as Digest } };
      },
    };
    // X2 tour 4 (MINEUR-5): the engine lane — not the direct cascade — over the fenced SQLite store.
    const { memory } = createL3Memory("accept", store, [surface]);
    const captured = await memory.capture(captureRequest("idempotency-key-projection-engine", "1"));
    if (!captured.ok || captured.value.candidate_id === undefined) throw new Error("capture fixture failed");
    const admitted = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: "2026-08-16T12:40:00.000Z" });
    if (!admitted.ok || admitted.value.record_id === undefined) throw new Error("admission fixture failed");
    const recordId = admitted.value.record_id;
    entries.set(recordId, `sha256:${"0".repeat(64)}` as Digest);
    const tombstoned = await memory.transition(lifecycleCommand("tombstone", recordId));
    expect(tombstoned.ok).toBe(true);
    if (!tombstoned.ok) throw new Error("tombstone fixture failed");
    const readiness = await memory.readiness();
    expect(readiness.ok).toBe(true);
    if (!readiness.ok) throw new Error("readiness fixture failed");
    const invalidated = await memory.invalidateProjections({
      through_cursor: readiness.value.high_water_cursor,
      authorization: { credential: "credential:l3" },
      deadline_at: "2026-08-16T12:40:00.000Z",
    });
    expect(invalidated.ok).toBe(true);
    if (!invalidated.ok) throw new Error("engine invalidation failed");
    expect(invalidated.value.complete).toBe(true);
    expect(entries.has(recordId)).toBe(false);
    await store.close();
    // After reopen, a stale projection replayed through the engine lane converges without resurrecting.
    const reopened = await open(target);
    entries.set(recordId, `sha256:${"0".repeat(64)}` as Digest);
    const { memory: revived } = createL3Memory("accept", reopened, [surface]);
    const replayed = await revived.invalidateProjections({
      through_cursor: readiness.value.high_water_cursor,
      authorization: { credential: "credential:l3" },
      deadline_at: "2026-08-16T12:40:00.000Z",
    });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) throw new Error("engine replay failed");
    expect(replayed.value.complete).toBe(true);
    expect(entries.has(recordId)).toBe(false);
    await reopened.close();
  });
});
