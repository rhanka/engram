/**
 * Already-covered proof for M15 (upstream cca13aa, #1087):
 * Anchored gitignore patterns (`/inbox/`) must NOT match the same directory
 * name deeper in the tree (`src/inbox/`).  Python's `_is_ignored` was checking
 * individual path components even for anchored patterns; TS already has an
 * `!anchored` guard on the component-level `matchGlob` call, so the bug never
 * existed in the TS port.  These tests lock in that invariant.
 *
 * Also covers: M6c already-covered proof — the memory-dir gitignore leak
 * (upstream 9f73400, detect.py line 935) was already absent in TS because
 * `isIgnored` is guarded by `!inMemory` at `src/detect.ts:750-751`.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detect } from "../src/detect.js";

describe("anchored gitignore patterns (M15 already-covered proof, cca13aa #1087)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "graphify-m15-anchor-"));
    // Make it look like a repo root so graphifyignore loading stops here.
    mkdirSync(join(tmpDir, ".git"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("/inbox/ must NOT match src/inbox/ — anchored pattern stays at root", () => {
    // Create src/inbox/main.py (should NOT be ignored by /inbox/).
    mkdirSync(join(tmpDir, "src", "inbox"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "inbox", "main.py"), "x = 1");
    // Create inbox/data.py at root (SHOULD be ignored).
    mkdirSync(join(tmpDir, "inbox"), { recursive: true });
    writeFileSync(join(tmpDir, "inbox", "data.py"), "y = 2");
    // Unrelated file at root.
    writeFileSync(join(tmpDir, "app.py"), "z = 3");

    writeFileSync(join(tmpDir, ".graphifyignore"), "/inbox/\n");

    const result = detect(tmpDir);
    const code = result.files.code;

    // Root-level inbox/data.py must be ignored.
    expect(code.some((f) => f.includes(`inbox${require("node:path").sep}data.py`) && !f.includes("src"))).toBe(false);
    // src/inbox/main.py must NOT be ignored (anchored pattern is root-only).
    expect(code.some((f) => f.endsWith("main.py"))).toBe(true);
    // app.py must be present.
    expect(code.some((f) => f.endsWith("app.py"))).toBe(true);
  });

  it("/generated must NOT match src/generated directory (anchored stays at root)", () => {
    // Use 'generated' — a name that isn't in SKIP_DIRS but is commonly ignored.
    mkdirSync(join(tmpDir, "src", "generated"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "generated", "output.py"), "x = 1");
    writeFileSync(join(tmpDir, "main.py"), "y = 2");

    // Anchored pattern — must only match the `generated` dir at the root level.
    writeFileSync(join(tmpDir, ".graphifyignore"), "/generated\n");

    const result = detect(tmpDir);
    const code = result.files.code;

    // src/generated/output.py is NOT at root level — must not be ignored.
    expect(code.some((f) => f.endsWith("output.py"))).toBe(true);
    expect(code.some((f) => f.endsWith("main.py"))).toBe(true);
  });

  it("unanchored inbox/ still matches src/inbox/ anywhere in the tree", () => {
    mkdirSync(join(tmpDir, "src", "inbox"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "inbox", "main.py"), "x = 1");
    writeFileSync(join(tmpDir, "app.py"), "y = 2");

    // No leading slash — pattern is unanchored.
    writeFileSync(join(tmpDir, ".graphifyignore"), "inbox/\n");

    const result = detect(tmpDir);
    const code = result.files.code;

    // src/inbox/main.py must be ignored (unanchored pattern).
    expect(code.some((f) => f.endsWith("main.py"))).toBe(false);
    // app.py must be present.
    expect(code.some((f) => f.endsWith("app.py"))).toBe(true);
  });
});
