/**
 * Track F-0820-0827 M4 already-covered proof — Dart child node IDs are
 * stem-based (not absolute-path-based) in the TS fork (upstream baaab5f, #999).
 *
 * The TS fork routes `.dart` through `extractRegexBackedCode` which uses
 * `qualifiedFileStem(filePath, rootDir)` for both the file node and all symbol
 * nodes. This is machine-independent by construction — no `str(path)` or
 * absolute path is ever embedded in a child node ID.
 *
 * This test proves already-covered status by verifying the output and serves
 * as a non-regression guard.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractWithDiagnostics } from "../src/extract.js";

describe("F-0820-0827 M4 already-covered — Dart child node IDs are stem-based (baaab5f, #999)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-dart-"));
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("Dart class and function nodes use qualifiedFileStem as ID prefix — no absolute path fragment", async () => {
    mkdirSync(join(dir, "mydir"), { recursive: true });
    const dartFile = join(dir, "mydir", "sample.dart");
    // Additional file to anchor root at dir (not mydir)
    const rootFile = join(dir, "main.py");
    writeFileSync(dartFile, "class MyClass {}\nvoid myFunc() {}\n");
    writeFileSync(rootFile, "# anchor\n");

    const { extraction } = await extractWithDiagnostics([dartFile, rootFile]);

    // File node: mydir_sample
    const fileNodes = extraction.nodes.filter((n) => n.label === "sample.dart");
    expect(fileNodes.length).toBeGreaterThanOrEqual(1);
    const fileId = fileNodes[0]!.id;
    expect(fileId).toBe("mydir_sample");
    expect(fileId).not.toMatch(/_dart$/);

    // Symbol nodes: mydir_sample_myclass, mydir_sample_myfunc
    const classNodes = extraction.nodes.filter((n) => n.label === "MyClass");
    if (classNodes.length > 0) {
      expect(classNodes[0]!.id).toBe("mydir_sample_myclass");
      // Must NOT contain any path separator fragment or absolute path part
      expect(classNodes[0]!.id).not.toMatch(/\//);
      expect(classNodes[0]!.id).not.toMatch(/^\//);
    }

    // All child node IDs must not embed any absolute path component
    for (const node of extraction.nodes) {
      if (node.source_file && node.source_file.includes("sample.dart") && node.id !== fileId) {
        expect(node.id, `Symbol ${node.label} ID must not embed absolute path`).not.toMatch(
          /\/|\\|^[a-z]:/i,
        );
        // Must start with the stem prefix
        expect(node.id).toMatch(/^mydir_sample_/);
      }
    }
  });
});
