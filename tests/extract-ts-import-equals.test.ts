/**
 * Test-confirmation for upstream safishamsi 9811def (must-audit row of the
 * 2026-07-06 drift re-scan): the TS import-equals form
 * `import x = require("./m")` must emit an imports_from edge.
 *
 * Upstream's `_import_js` scanned only DIRECT children for the module string
 * and missed the one nested in `import_require_clause`. The TS port's
 * `readStringSpecifier` recurses through descendants, so the form was
 * already covered — this test pins that coverage.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractJs } from "../src/extract.js";

describe("TS import-equals form (upstream 9811def — already covered, pinned)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-import-equals-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("emits imports_from for `import x = require('./m')`", async () => {
    writeFileSync(join(dir, "m.ts"), "export function helper(): number { return 1; }\n");
    const file = join(dir, "main.ts");
    writeFileSync(file, [
      "import m = require('./m');",
      "export function run(): number { return m.helper(); }",
    ].join("\n"));

    const result = await extractJs(file, dir);
    expect(result.error).toBeUndefined();
    const importEdges = result.edges.filter((e) => e.relation === "imports_from");
    expect(importEdges).toHaveLength(1);
    // Per-file ids carry the resolved path of m.ts (the corpus pass remaps
    // them to project-relative form); the tail uniquely identifies the module.
    expect(/(^|_)m_ts$/.test(importEdges[0]!.target)).toBe(true);
  });
});
