/**
 * Zero-node results are never cached — port of upstream safishamsi 1288a55
 * (#1666). Every extractable file yields at least a file node, so an empty
 * node list is anomalous (a transient hiccup); caching it makes the empty
 * byte-stable across runs and silently blinds downstream queries. The cache
 * write is skipped so a rerun self-heals.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../src/cache.js", () => ({
  loadCached: vi.fn(() => null),
  saveCached: vi.fn(),
}));

import { extractWithDiagnostics, __testing } from "../src/extract.js";
import { saveCached } from "../src/cache.js";

describe("zero-node cache guard (upstream 1288a55 / #1666)", () => {
  beforeEach(() => {
    vi.mocked(saveCached).mockClear();
  });

  it("shouldCacheExtraction rejects zero-node and error results, accepts real ones", () => {
    const { shouldCacheExtraction } = __testing;
    expect(shouldCacheExtraction({ nodes: [], edges: [] })).toBe(false);
    expect(shouldCacheExtraction({ nodes: [], edges: [], error: "boom" })).toBe(false);
    expect(
      shouldCacheExtraction({
        nodes: [{ id: "f", label: "f.py", file_type: "code", source_file: "f.py" }],
        edges: [],
      }),
    ).toBe(true);
  });

  it("caches a normal extraction (node-producing) through the gate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cache-guard-"));
    const file = join(dir, "mod.py");
    writeFileSync(file, "def run():\n    return 1\n");

    const { extraction } = await extractWithDiagnostics([file]);
    expect(extraction.nodes.length).toBeGreaterThan(0);
    // The cache write happened for the node-producing result.
    expect(vi.mocked(saveCached)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveCached).mock.calls[0]![0]).toBe(file);
  });
});
