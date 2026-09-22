import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// §5.9 P1 (native; requires real better-sqlite3 + a live Linux /proc): a non-functional flock binding — a shim, or
// a misconfigured native module — whose flockSync returns success WITHOUT taking a real kernel lock must be refused
// BEFORE the store advances the durable epoch. Otherwise it would advance the epoch while a legitimate broker holds
// the real flock elsewhere, driving that broker's next #fence to a spurious FENCE_LOST and killing the live writer.
// We replace fs-ext with a no-op flock and assert the open is refused (CAPABILITY_UNAVAILABLE — NOT FENCE_LOST, which
// is reserved for genuine contention) and the durable epoch is untouched.
vi.mock("../graphify-memory/node_modules/fs-ext/fs-ext.js", () => ({ flockSync: () => undefined, default: { flockSync: () => undefined } }));

const NOW = "2026-09-21T12:00:00.000Z";
const dirs: string[] = [];
afterEach(() => { while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("native SQLite fence rejects a non-functional flock binding", () => {
  it("refuses the open with CAPABILITY_UNAVAILABLE and advances nothing (the kernel proof runs before any write)", async () => {
    const { openFencedSqliteCanonicalMemoryStoreV1 } = await import("../graphify-memory/index.js");
    const native = await import("../graphify-memory/node_modules/better-sqlite3/lib/index.js");
    const dir = mkdtempSync(join(tmpdir(), "graphify-memory-shim-"));
    dirs.push(dir);
    const target = join(dir, "canonical.sqlite");
    // Pre-seed a storage_epoch with a raw connection (no flock) so a mutation by the refused open would be visible.
    const seed = new native.default(target);
    seed.exec("CREATE TABLE IF NOT EXISTS memory_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    seed.prepare("INSERT INTO memory_meta(key, value) VALUES ('storage_epoch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run("41");
    seed.close();

    // fs-ext.flockSync is mocked to a no-op, so no real kernel lock is taken; /proc/self/fdinfo shows nothing, and
    // the opener's post-flock kernel proof refuses the store before it opens better-sqlite3 or touches the epoch.
    const opened = await openFencedSqliteCanonicalMemoryStoreV1({ filename: target, clock: { now: () => NOW } });
    expect(opened).toMatchObject({ ok: false, error: { code: "CAPABILITY_UNAVAILABLE" } });

    const check = new native.default(target, { readonly: true, fileMustExist: true });
    const row = check.prepare("SELECT value FROM memory_meta WHERE key = 'storage_epoch'").get() as { value: string };
    check.close();
    expect(row.value).toBe("41"); // untouched: the refused open never advanced the durable epoch
  });
});
