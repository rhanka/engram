import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// §5.9 P1 (native; requires real better-sqlite3 + a live Linux /proc): a non-functional flock binding — a shim, or
// a misconfigured native module — whose flockSync returns success WITHOUT taking a real kernel lock must be refused
// BEFORE the store advances the durable epoch. Otherwise it would advance the epoch while a legitimate broker holds
// the real flock elsewhere, driving that broker's next #fence to a spurious FENCE_LOST and killing the live writer.
// We replace fs-ext with a no-op flock and assert the open is refused (CAPABILITY_UNAVAILABLE — NOT FENCE_LOST) and
// the durable epoch is untouched. A hoisted spy is the positive control: if the fs-ext package were simply absent,
// vi.mock would not shadow it and the open would fail for the WRONG reason (module-not-found), so we assert the
// mock was actually called AND that the refusal cause is the /proc/self/fdinfo kernel proof.
const flockSpy = vi.hoisted(() => vi.fn(() => undefined));
vi.mock("../graphify-memory/node_modules/fs-ext/fs-ext.js", () => ({ flockSync: flockSpy, default: { flockSync: flockSpy } }));

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
    // declare the ephemeral flag so the ephemeral-fs check passes on a tmpfs /tmp and the P1 kernel proof is what
    // refuses (otherwise the ephemeral refusal would fire first and the cause assertion below would miss).
    const opened = await openFencedSqliteCanonicalMemoryStoreV1({ filename: target, clock: { now: () => NOW }, allow_ephemeral_filesystem_store: true });
    expect(opened.ok).toBe(false);
    if (opened.ok) throw new Error("expected the shimmed flock to be refused");
    expect(opened.error.code).toBe("CAPABILITY_UNAVAILABLE");
    // positive control: the mock actually intercepted the native flock (else the refusal is a false pass, e.g. the
    // fs-ext package being absent — which vi.mock would not shadow).
    expect(flockSpy).toHaveBeenCalled();
    // cause: the refusal is the /proc/self/fdinfo kernel proof, not a module-not-found or other CAPABILITY_UNAVAILABLE.
    expect(opened.error.message).toContain("/proc/self/fdinfo");

    const check = new native.default(target, { readonly: true, fileMustExist: true });
    const row = check.prepare("SELECT value FROM memory_meta WHERE key = 'storage_epoch'").get() as { value: string };
    check.close();
    expect(row.value).toBe("41"); // untouched: the refused open never advanced the durable epoch
  });
});
