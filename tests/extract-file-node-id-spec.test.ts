/**
 * Track F-0820-0827 M18 — File-level node IDs must match the skill.md spec:
 * ``{parent_dir}_{stem}`` — one parent directory level, no extension.
 *
 * Upstream c898dc6 (#1033): AST file nodes were ID'd from the full
 * relative path including extension (e.g. ``script_pipeline_step_py``) while
 * semantic subagents follow the spec (``script_pipeline_step``), so every file
 * split into two disconnected ghost nodes. The fix remaps at the chokepoint in
 * extractWithDiagnostics() → remapFileNodeIds().
 *
 * skill.md spec (canonicalized in c898dc6):
 *   - auth/session.py  → auth_session  (one parent level, no ext)
 *   - setup.py (root-level) → setup    (bare stem for root-level)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractWithDiagnostics } from "../src/extract.js";

describe("F-0820-0827 M18 — file-level node ID spec compliance (c898dc6, #1033)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-filenode-"));
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("file node ID for nested file is {parent_dir}_{stem} — no extension suffix", async () => {
    // auth/session.py at project root → auth_session, NOT auth_session_py
    // We need at least a root file alongside the nested file so inferCommonRoot
    // resolves to the project root (not the nested dir).
    mkdirSync(join(dir, "auth"), { recursive: true });
    const nestedFile = join(dir, "auth", "session.py");
    const rootFile = join(dir, "main.py");
    writeFileSync(nestedFile, "class ValidateToken:\n    pass\n");
    writeFileSync(rootFile, "def main(): pass\n");

    const { extraction } = await extractWithDiagnostics([nestedFile, rootFile]);
    const fileNodes = extraction.nodes.filter(
      (n) => n.label === "session.py",
    );

    expect(fileNodes.length).toBeGreaterThanOrEqual(1);
    const ids = fileNodes.map((n) => n.id);
    // Spec: parent_dir=auth, stem=session → auth_session
    expect(ids).toContain("auth_session");
    // Must NOT contain the extension-bearing form
    expect(ids).not.toContain("auth_session_py");
    // Must NOT contain any extension suffix
    for (const id of ids) {
      expect(id).not.toMatch(/_py$/);
    }
  });

  it("file node ID for root-level file is bare stem — no extension", async () => {
    // setup.py at project root (paired with another file so root is inferred correctly)
    const rootFile1 = join(dir, "setup.py");
    const rootFile2 = join(dir, "main.py");
    writeFileSync(rootFile1, "def run():\n    pass\n");
    writeFileSync(rootFile2, "def main(): pass\n");

    const { extraction } = await extractWithDiagnostics([rootFile1, rootFile2]);
    const setupNodes = extraction.nodes.filter((n) => n.label === "setup.py");

    expect(setupNodes.length).toBeGreaterThanOrEqual(1);
    const ids = setupNodes.map((n) => n.id);
    // Root-level: bare stem
    expect(ids).toContain("setup");
    // Must NOT have extension suffix
    for (const id of ids) {
      expect(id).not.toMatch(/_py$/);
    }
  });

  it("symbol node IDs in nested file use parent_stem prefix — no extension in prefix", async () => {
    // auth/session.py → file node auth_session, symbol auth_session_validatetoken
    mkdirSync(join(dir, "auth"), { recursive: true });
    const nestedFile = join(dir, "auth", "session.py");
    const rootFile = join(dir, "main.py");
    writeFileSync(nestedFile, "class ValidateToken:\n    pass\n");
    writeFileSync(rootFile, "def main(): pass\n");

    const { extraction } = await extractWithDiagnostics([nestedFile, rootFile]);
    const symbolNodes = extraction.nodes.filter((n) => n.label === "ValidateToken");

    expect(symbolNodes.length).toBeGreaterThanOrEqual(1);
    for (const n of symbolNodes) {
      // Should be auth_session_validatetoken, NOT auth_session_py_validatetoken
      expect(n.id).not.toMatch(/_py_/);
      // Prefix must be the spec-compliant file node ID
      expect(n.id).toMatch(/^auth_session_/);
    }
  });
});
