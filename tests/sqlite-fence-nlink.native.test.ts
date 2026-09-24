import { linkSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openFencedSqliteCanonicalMemoryStoreV1 } from "../engram-memory/index.js";
import { NOW } from "./memory-l3-fixture.js";

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
});
