/**
 * Track F-0820-0827 M20 already-covered proof — Symbol node IDs for root-level
 * files do not embed the absolute parent directory name (upstream ad0c8c0, #1096).
 *
 * The Python bug was: after the c898dc6 remap, file nodes for root-level files
 * got the correct bare-stem ID (e.g. "setup"), but symbol nodes still used the
 * ABSOLUTE parent dir as a prefix (e.g. "/project/setup_run" → "projectroot_setup_run").
 *
 * In the TS fork, all extractors use `qualifiedFileStem(filePath, rootDir)` which
 * for root-level files returns just the bare stem (since `resolve(parentDir) ===
 * resolve(rootDir)`). Symbol IDs are thus `_makeId(stem, symbolName)` = "setup_run"
 * — correct and machine-independent by construction (no absolute path involved).
 *
 * This test proves already-covered status and serves as a non-regression guard.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractWithDiagnostics } from "../src/extract.js";

describe("F-0820-0827 M20 already-covered — root-level file symbol IDs are bare-stem-prefixed (ad0c8c0, #1096)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-rootsym-"));
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("symbol nodes in a root-level Python file use bare stem as prefix — no absolute dir", async () => {
    // setup.py at project root with a companion file so root is inferred correctly
    const setupFile = join(dir, "setup.py");
    const mainFile = join(dir, "main.py");
    writeFileSync(setupFile, "def run():\n    pass\nclass Builder:\n    pass\n");
    writeFileSync(mainFile, "def entry(): pass\n");

    const { extraction } = await extractWithDiagnostics([setupFile, mainFile]);

    // File node: "setup" (bare stem, no extension, no absolute dir prefix)
    const fileNodes = extraction.nodes.filter((n) => n.label === "setup.py");
    expect(fileNodes.length).toBeGreaterThanOrEqual(1);
    const fileId = fileNodes[0]!.id;
    expect(fileId).toBe("setup");

    // Symbol nodes: must start with "setup_" (not "<absolute_dir>_setup_")
    const setupSymbols = extraction.nodes.filter(
      (n) => n.source_file?.endsWith("setup.py") && n.id !== fileId,
    );
    for (const node of setupSymbols) {
      // Must NOT embed any absolute path fragment
      expect(node.id).not.toMatch(/\/|\\|^[a-z]:/i);
      // Must start with the bare stem prefix
      expect(node.id, `Symbol ${node.label} (${node.id}) must start with 'setup_'`).toMatch(/^setup_/);
    }
  });
});
