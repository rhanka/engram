/**
 * Tests for cache source_file relativization (F-0831-P2d, port of upstream 25df580).
 *
 * Covers: saveCached/saveSemanticCache write relative source_file to disk;
 * loadCached/checkSemanticCache re-anchor to absolute; idempotency for already-relative
 * and out-of-root paths; skill-runtime-style round-trip.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  _resetStatIndexForTesting,
  checkSemanticCache,
  loadCached,
  saveCached,
  saveSemanticCache,
} from "../src/cache.js";
import { resolveGraphifyPaths } from "../src/paths.js";

/** Recursively collect all .json files under dir, skipping stat-index. */
function collectJsonFiles(dir: string): string[] {
  const results: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...collectJsonFiles(abs));
    } else if (e.isFile() && e.name.endsWith(".json") && e.name !== "stat-index.json") {
      results.push(abs);
    }
  }
  return results;
}

describe("cache source_file relativization (25df580 residual)", () => {
  let tmpDir: string;
  let srcFile: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `graphify-test-relpath-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    srcFile = join(tmpDir, "src", "foo.ts");
    writeFileSync(srcFile, "export const x = 1;\n");
    _resetStatIndexForTesting();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── saveCached ──────────────────────────────────────────────────────────────

  it("saveCached: stores relative source_file on disk when given an absolute path", () => {
    const payload = {
      nodes: [{ id: "x", source_file: srcFile }],
      edges: [{ source: "x", target: "y", source_file: srcFile }],
      hyperedges: [{ id: "h1", source_file: srcFile }],
    };
    saveCached(srcFile, payload, tmpDir);

    const { cacheDir } = resolveGraphifyPaths({ root: tmpDir });
    const files = collectJsonFiles(cacheDir);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(files[0]!, "utf-8")) as Record<string, unknown>;
    const nodes = written.nodes as Array<Record<string, unknown>>;
    const edges = written.edges as Array<Record<string, unknown>>;
    const hyperedges = written.hyperedges as Array<Record<string, unknown>>;

    // Must be relative — no tmpDir prefix, no leading slash
    expect(nodes[0]!.source_file).toBe("src/foo.ts");
    expect(edges[0]!.source_file).toBe("src/foo.ts");
    expect(hyperedges[0]!.source_file).toBe("src/foo.ts");
  });

  it("saveCached: does NOT mutate the caller's result object", () => {
    const payload = {
      nodes: [{ id: "x", source_file: srcFile }],
      edges: [] as Array<Record<string, unknown>>,
      hyperedges: [] as Array<Record<string, unknown>>,
    };
    const originalSourceFile = payload.nodes[0]!.source_file;
    saveCached(srcFile, payload, tmpDir);
    // Caller's dict must be unchanged
    expect(payload.nodes[0]!.source_file).toBe(originalSourceFile);
  });

  // ── loadCached ──────────────────────────────────────────────────────────────

  it("loadCached: re-anchors relative source_file back to absolute on load", () => {
    const payload = {
      nodes: [{ id: "x", source_file: srcFile }],
      edges: [{ source: "x", target: "y", source_file: srcFile }],
      hyperedges: [{ id: "h1", source_file: srcFile }],
    };
    saveCached(srcFile, payload, tmpDir);

    const loaded = loadCached(srcFile, tmpDir);
    expect(loaded).not.toBeNull();
    const nodes = loaded!.nodes as Array<Record<string, unknown>>;
    const edges = loaded!.edges as Array<Record<string, unknown>>;
    const hyperedges = loaded!.hyperedges as Array<Record<string, unknown>>;

    const expectedAbs = resolve(tmpDir, "src/foo.ts");
    expect(nodes[0]!.source_file).toBe(expectedAbs);
    expect(edges[0]!.source_file).toBe(expectedAbs);
    expect(hyperedges[0]!.source_file).toBe(expectedAbs);
  });

  // ── idempotency: already-relative ──────────────────────────────────────────

  it("saveCached + loadCached: already-relative source_file is re-anchored to absolute on load", () => {
    // Write payload with already-relative source_file (idempotent save)
    const payloadRelative = {
      nodes: [{ id: "x", source_file: "src/foo.ts" }],
      edges: [] as Array<Record<string, unknown>>,
      hyperedges: [] as Array<Record<string, unknown>>,
    };
    saveCached(srcFile, payloadRelative, tmpDir);

    // On disk: still "src/foo.ts" (already relative)
    const { cacheDir } = resolveGraphifyPaths({ root: tmpDir });
    const files = collectJsonFiles(cacheDir);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(files[0]!, "utf-8")) as Record<string, unknown>;
    const diskNodes = written.nodes as Array<Record<string, unknown>>;
    expect(diskNodes[0]!.source_file).toBe("src/foo.ts");

    // On load: re-anchored to absolute
    const loaded = loadCached(srcFile, tmpDir);
    expect(loaded).not.toBeNull();
    const loadedNodes = loaded!.nodes as Array<Record<string, unknown>>;
    expect(loadedNodes[0]!.source_file).toBe(resolve(tmpDir, "src/foo.ts"));
  });

  // ── idempotency: out-of-root path ───────────────────────────────────────────

  it("saveCached: source_file outside root passes through unchanged on disk", () => {
    // A path outside tmpDir — must not be relativized (no ../.. escape)
    const outsidePath = "/etc/hosts";
    const payloadOutside = {
      nodes: [{ id: "ext", source_file: outsidePath }],
      edges: [] as Array<Record<string, unknown>>,
      hyperedges: [] as Array<Record<string, unknown>>,
    };
    saveCached(srcFile, payloadOutside, tmpDir);

    const { cacheDir } = resolveGraphifyPaths({ root: tmpDir });
    const files = collectJsonFiles(cacheDir);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(files[0]!, "utf-8")) as Record<string, unknown>;
    const nodes = written.nodes as Array<Record<string, unknown>>;
    // Out-of-root: kept as absolute on disk
    expect(nodes[0]!.source_file).toBe(outsidePath);
  });

  it("loadCached: legacy cache entry with absolute source_file passes through unchanged (no double-absolutize)", () => {
    // Simulate a legacy cache entry written before this fix — already has absolute paths on disk.
    // loadCached must not re-join root with an already-absolute path.
    const payload = {
      nodes: [{ id: "x", source_file: srcFile }],
      edges: [] as Array<Record<string, unknown>>,
      hyperedges: [] as Array<Record<string, unknown>>,
    };

    // Compute the hash that fileHash would produce for srcFile under tmpDir
    const raw = readFileSync(srcFile);
    const h = createHash("sha256");
    h.update(raw);
    h.update("\0");
    h.update("src/foo.ts"); // relative path component used by fileHash
    const digest = h.digest("hex");

    // Write the legacy file directly with absolute source_file (no relativization)
    const { cacheDir } = resolveGraphifyPaths({ root: tmpDir });
    const kindDir = join(cacheDir, "ast");
    mkdirSync(kindDir, { recursive: true });
    writeFileSync(join(kindDir, `${digest}.json`), JSON.stringify(payload));

    const loaded = loadCached(srcFile, tmpDir);
    expect(loaded).not.toBeNull();
    const nodes = loaded!.nodes as Array<Record<string, unknown>>;
    // Already absolute — must pass through unchanged
    expect(nodes[0]!.source_file).toBe(srcFile);
  });

  // ── saveSemanticCache / checkSemanticCache round-trip ──────────────────────

  it("saveSemanticCache: writes relative source_file to disk; checkSemanticCache re-anchors to absolute", () => {
    const nodes = [
      { id: "A", label: "Alpha", source_file: srcFile },
    ];
    const edges = [
      { source: "A", target: "B", relation: "uses", confidence: "EXTRACTED", source_file: srcFile },
    ];
    const hyperedges = [
      { id: "he1", source_file: srcFile },
    ];

    saveSemanticCache(nodes, edges, hyperedges, tmpDir);

    // Check what's on disk: must be relative
    const { cacheDir } = resolveGraphifyPaths({ root: tmpDir });
    const files = collectJsonFiles(cacheDir);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(files[0]!, "utf-8")) as Record<string, unknown>;
    const diskNodes = written.nodes as Array<Record<string, unknown>>;
    const diskEdges = written.edges as Array<Record<string, unknown>>;
    const diskHyperedges = written.hyperedges as Array<Record<string, unknown>>;
    expect(diskNodes[0]!.source_file).toBe("src/foo.ts");
    expect(diskEdges[0]!.source_file).toBe("src/foo.ts");
    expect(diskHyperedges[0]!.source_file).toBe("src/foo.ts");

    // checkSemanticCache re-anchors to absolute
    const [cachedNodes, cachedEdges, cachedHyperedges, uncached] = checkSemanticCache([srcFile], tmpDir);
    const expectedAbs = resolve(tmpDir, "src/foo.ts");
    expect(uncached).toEqual([]);
    expect(cachedNodes[0]!.source_file).toBe(expectedAbs);
    expect(cachedEdges[0]!.source_file).toBe(expectedAbs);
    expect(cachedHyperedges[0]!.source_file).toBe(expectedAbs);
  });

  it("skill-runtime-style round-trip: saveSemanticCache direct (no makeExtractionPortable) stores relative paths", () => {
    // Mimics src/skill-runtime.ts:~1050 and src/cli.ts:~864 calling saveSemanticCache
    // directly on an extraction with absolute source_file paths (no makeExtractionPortable).
    const absNodes = [
      { id: "SR", label: "SkillRuntime", source_file: srcFile },
      { id: "SR2", label: "Also", source_file: srcFile },
    ];
    const absEdges = [
      { source: "SR", target: "SR2", relation: "calls", confidence: "EXTRACTED", source_file: srcFile },
    ];

    const saved = saveSemanticCache(absNodes, absEdges, null, tmpDir);
    expect(saved).toBe(1);

    // Cache file on disk must have relative paths
    const { cacheDir } = resolveGraphifyPaths({ root: tmpDir });
    const files = collectJsonFiles(cacheDir);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(files[0]!, "utf-8")) as Record<string, unknown>;
    const diskNodes = written.nodes as Array<Record<string, unknown>>;
    expect(diskNodes[0]!.source_file).toBe("src/foo.ts");
    expect(diskNodes[1]!.source_file).toBe("src/foo.ts");

    // Load back: must re-anchor to absolute
    const [loadedNodes, loadedEdges] = checkSemanticCache([srcFile], tmpDir);
    const expectedAbs = resolve(tmpDir, "src/foo.ts");
    expect(loadedNodes[0]!.source_file).toBe(expectedAbs);
    expect(loadedNodes[1]!.source_file).toBe(expectedAbs);
    expect(loadedEdges[0]!.source_file).toBe(expectedAbs);
  });
});
