import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { acquireRebuildLock, releaseRebuildLock } from "../src/watch.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-rebuild-lock-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("watch .rebuild.lock lifecycle", () => {
  it("writes a single PID line on acquire and unlinks on release", () => {
    const dir = makeTempDir();
    const lockPath = join(dir, ".graphify", ".rebuild.lock");

    expect(acquireRebuildLock(dir)).toBe(true);
    expect(existsSync(lockPath)).toBe(true);

    const contents = readFileSync(lockPath, "utf-8");
    // Single line, current PID followed by exactly one LF.
    expect(contents).toBe(`${process.pid}\n`);

    releaseRebuildLock(dir);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("refuses a second acquire while a live PID still holds the lock", () => {
    const dir = makeTempDir();

    expect(acquireRebuildLock(dir)).toBe(true);
    // Second attempt from the same process must report 'already held'.
    expect(acquireRebuildLock(dir)).toBe(false);

    releaseRebuildLock(dir);
  });

  it("overwrites a stale lock left by a dead PID", () => {
    const dir = makeTempDir();
    const lockPath = join(dir, ".graphify", ".rebuild.lock");

    mkdirSync(dirname(lockPath), { recursive: true });
    // Use a PID outside the kernel max_pid range on every platform that runs
    // vitest. process.kill(<huge>, 0) throws ESRCH so the stale path triggers.
    writeFileSync(lockPath, "2147483646\n", "utf-8");

    expect(acquireRebuildLock(dir)).toBe(true);
    expect(readFileSync(lockPath, "utf-8")).toBe(`${process.pid}\n`);

    releaseRebuildLock(dir);
  });

  it("releaseRebuildLock is a no-op when the lock is absent", () => {
    const dir = makeTempDir();
    expect(() => releaseRebuildLock(dir)).not.toThrow();
  });

  it("ignores a lock file with garbage contents and overwrites it", () => {
    const dir = makeTempDir();
    const lockPath = join(dir, ".graphify", ".rebuild.lock");

    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, "not-a-pid\n", "utf-8");

    expect(acquireRebuildLock(dir)).toBe(true);
    expect(readFileSync(lockPath, "utf-8")).toBe(`${process.pid}\n`);

    releaseRebuildLock(dir);
  });
});
