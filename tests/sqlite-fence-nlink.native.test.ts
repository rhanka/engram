import { linkSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCanonicalMemoryStoreFactoryV1,
  openFencedSqliteCanonicalMemoryStoreV1,
  type FencedSqliteCanonicalMemoryStoreV1,
} from "../engram-memory/index.js";
import { captureRequest, createL3Memory, NOW } from "./memory-l3-fixture.js";

// §5.9 R2-f: the fenced writer flock is held on the canonical database's OWN inode. That fence only proves
// single-writer / rename-safety if the inode is reachable by exactly ONE name — a second hard link would let the
// same bytes be opened, relinked, or resurrected through another path outside the fence's view. The store therefore
// refuses at open when st_nlink > 1. This is a native test: it takes a REAL flock and reads the REAL st_nlink, which
// a mocked fs cannot exercise.

const workspaces: string[] = [];

function filename(): string {
  const workspace = mkdtempSync(join(tmpdir(), "engram-memory-nlink-native-"));
  workspaces.push(workspace);
  return join(workspace, "canonical.sqlite");
}

// Acquire through the graphify-owned factory so the store carries this build's provenance mark and the engine's
// fencing gate admits it (a raw-opener store is refused by the gate). Mirrors the broker native test's helper.
async function open(filenameValue: string): Promise<FencedSqliteCanonicalMemoryStoreV1> {
  const factory = createCanonicalMemoryStoreFactoryV1({ open: () => openFencedSqliteCanonicalMemoryStoreV1({ filename: filenameValue, clock: { now: () => NOW }, allow_ephemeral_filesystem_store: true }) });
  const acquired = await factory.acquire({ store_id: filenameValue, backend: "sqlite", deadline_at: "2026-08-16T12:40:00.000Z" });
  if (!acquired.ok) throw new Error(acquired.error.message);
  return acquired.value as unknown as FencedSqliteCanonicalMemoryStoreV1;
}

afterEach(() => {
  while (workspaces.length > 0) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

describe("native SQLite fenced open and hard-link count", () => {
  it("admits a canonical database reachable by exactly one path (st_nlink === 1)", async () => {
    // Control: a fresh single-linked database opens and takes the fence. This is what keeps the refusal below
    // non-vacuous — the only difference from the refused case is the second link.
    const target = filename();
    const opened = await openFencedSqliteCanonicalMemoryStoreV1({ filename: target, clock: { now: () => NOW }, allow_ephemeral_filesystem_store: true });
    expect(opened).toMatchObject({ ok: true });
    if (opened.ok) await opened.value.close();
  });

  it("refuses a database whose inode carries a second hard link (st_nlink > 1)", async () => {
    const target = filename();
    // Create the inode with one name, then add a SECOND name for the same inode. The empty file never reaches
    // better-sqlite3: the nlink refusal fires inside the flock acquisition, before the database is opened.
    writeFileSync(target, "");
    linkSync(target, `${target}.alias`); // st_nlink === 2 on the shared inode
    const refused = await openFencedSqliteCanonicalMemoryStoreV1({ filename: target, clock: { now: () => NOW }, allow_ephemeral_filesystem_store: true });
    expect(refused).toMatchObject({ ok: false, error: { code: "CAPABILITY_UNAVAILABLE" } });
    if (!refused.ok) expect(refused.error.message).toMatch(/hard link/i);
  });

  it("holds operations open when a hard link appears AFTER open, and refuses only at the next reopen", async () => {
    // Freezes the open-time (not per-operation) decision: a link created while the fence is held must NOT turn a live
    // broker's operations into FENCE_LOST (that would kill a writer over a harmless `cp -al`); the refusal is deferred
    // to the next open, which re-runs the st_nlink check by whatever name is used.
    const target = filename();
    const store = await open(target);
    const { memory } = createL3Memory("accept", store);
    linkSync(target, `${target}.alias`); // a second hard link appears WHILE the store holds the fence
    // Operations continue — the per-operation fence proof (kernel flock + path (dev, ino)) is unaffected by nlink.
    await expect(memory.capture(captureRequest("idempotency-key-post-open-link", "1")))
      .resolves.toMatchObject({ ok: true });
    await store.close();
    // The next open sees st_nlink === 2 and refuses (the deferred, remediable failure).
    const reopened = await openFencedSqliteCanonicalMemoryStoreV1({ filename: target, clock: { now: () => NOW }, allow_ephemeral_filesystem_store: true });
    expect(reopened).toMatchObject({ ok: false, error: { code: "CAPABILITY_UNAVAILABLE" } });
    if (!reopened.ok) expect(reopened.error.message).toMatch(/hard link/i);
  });
});
