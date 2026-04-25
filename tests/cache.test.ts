import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkSemanticCache,
  clearCache,
  fileHash,
  loadCached,
  saveCached,
  saveSemanticCache,
} from "../src/cache.js";

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

  it("keeps generic and profile cache entries isolated", () => {
    const f = join(tmpDir, "doc.md");
    writeFileSync(f, "# Synthetic manual\n");

    saveCached(f, { nodes: [{ id: "generic" }], edges: [] }, tmpDir);
    saveCached(f, { nodes: [{ id: "profile-a" }], edges: [] }, tmpDir, { profileHash: "profile-a-hash" });

    expect(loadCached(f, tmpDir)).toEqual({ nodes: [{ id: "generic" }], edges: [] });
    expect(loadCached(f, tmpDir, { profileHash: "profile-a-hash" })).toEqual({
      nodes: [{ id: "profile-a" }],
      edges: [],
    });
    expect(loadCached(f, tmpDir, { profileHash: "profile-b-hash" })).toBeNull();
  });

  it("does not satisfy profile semantic cache from generic cache hits", () => {
    const f = join(tmpDir, "doc.md");
    writeFileSync(f, "# Synthetic manual\n");
    saveSemanticCache(
      [{ id: "generic", label: "Generic", source_file: f }],
      [],
      [],
      tmpDir,
    );

    const [genericNodes, , , genericUncached] = checkSemanticCache([f], tmpDir);
    const [profileNodes, , , profileUncached] = checkSemanticCache([f], tmpDir, {
      namespace: "profile-profile-a-hash",
    });

    expect(genericNodes).toEqual([{ id: "generic", label: "Generic", source_file: f }]);
    expect(genericUncached).toEqual([]);
    expect(profileNodes).toEqual([]);
    expect(profileUncached).toEqual([f]);
  });

  it("reuses semantic cache for the same profile hash only", () => {
    const f = join(tmpDir, "doc.md");
    writeFileSync(f, "# Synthetic manual\n");
    saveSemanticCache(
      [{ id: "profile-a", label: "Profile A", source_file: f }],
      [],
      [],
      tmpDir,
      { profileHash: "profile-a-hash" },
    );

    const [sameProfileNodes, , , sameProfileUncached] = checkSemanticCache([f], tmpDir, {
      profileHash: "profile-a-hash",
    });
    const [otherProfileNodes, , , otherProfileUncached] = checkSemanticCache([f], tmpDir, {
      profileHash: "profile-b-hash",
    });

    expect(sameProfileNodes).toEqual([{ id: "profile-a", label: "Profile A", source_file: f }]);
    expect(sameProfileUncached).toEqual([]);
    expect(otherProfileNodes).toEqual([]);
    expect(otherProfileUncached).toEqual([f]);
  });

  it("ignores markdown frontmatter-only changes when hashing", () => {
    const f = join(tmpDir, "doc.md");
    writeFileSync(f, "---\nreviewed: 2026-01-01\n---\n\n# Title\n\nBody text.");
    const h1 = fileHash(f);
    writeFileSync(f, "---\nreviewed: 2026-04-09\n---\n\n# Title\n\nBody text.");
    const h2 = fileHash(f);
    expect(h1).toBe(h2);
  });

  it("still changes markdown hashes when the body changes", () => {
    const f = join(tmpDir, "doc.md");
    writeFileSync(f, "---\nreviewed: 2026-01-01\n---\n\n# Title\n\nOriginal body.");
    const h1 = fileHash(f);
    writeFileSync(f, "---\nreviewed: 2026-04-09\n---\n\n# Title\n\nChanged body.");
    const h2 = fileHash(f);
    expect(h1).not.toBe(h2);
  });

  it("rejects directory paths in fileHash with a clear error", () => {
    const dirPath = join(tmpDir, "docs");
    mkdirSync(dirPath, { recursive: true });

    expect(() => fileHash(dirPath)).toThrow("fileHash requires a file");
  });

  it("skips directory source_file entries when saving semantic cache", () => {
    const dirPath = join(tmpDir, "docs");
    mkdirSync(dirPath, { recursive: true });

    const saved = saveSemanticCache(
      [{ id: "dir-node", label: "DirNode", source_file: dirPath }],
      [{ source: "dir-node", target: "other", relation: "uses", confidence: "EXTRACTED", source_file: dirPath }],
      [],
      tmpDir,
    );

    expect(saved).toBe(0);
    const [nodes, edges, hyperedges, uncached] = checkSemanticCache([dirPath], tmpDir);
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
    expect(hyperedges).toEqual([]);
    expect(uncached).toEqual([dirPath]);
  });
});
