import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileHash, loadCached, saveCached, clearCache } from "../src/cache.js";

describe("cache", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `graphify-test-cache-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fileHash returns consistent hash", () => {
    const f = join(tmpDir, "test.py");
    writeFileSync(f, "print('hello')");
    const h1 = fileHash(f);
    const h2 = fileHash(f);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA256 hex
  });

  it("fileHash changes when content changes", () => {
    const f = join(tmpDir, "test.py");
    writeFileSync(f, "v1");
    const h1 = fileHash(f);
    writeFileSync(f, "v2");
    const h2 = fileHash(f);
    expect(h1).not.toBe(h2);
  });

  it("saveCached + loadCached roundtrip", () => {
    const f = join(tmpDir, "test.py");
    writeFileSync(f, "print('hello')");
    const data = { nodes: [{ id: "a", label: "A" }], edges: [] };
    saveCached(f, data, tmpDir);
    const loaded = loadCached(f, tmpDir);
    expect(loaded).toEqual(data);
  });

  it("loadCached returns null for uncached file", () => {
    const f = join(tmpDir, "test.py");
    writeFileSync(f, "print('hello')");
    const loaded = loadCached(f, tmpDir);
    expect(loaded).toBeNull();
  });

  it("clearCache removes all cached files", () => {
    const f = join(tmpDir, "test.py");
    writeFileSync(f, "print('hello')");
    saveCached(f, { nodes: [], edges: [] }, tmpDir);
    expect(loadCached(f, tmpDir)).not.toBeNull();
    clearCache(tmpDir);
    expect(loadCached(f, tmpDir)).toBeNull();
  });
});
