/**
 * Regression tests for F-0816-P4 / S4.2.
 *
 * Port of upstream safishamsi/graphify commit `9e6192a` (PR #945 / #947):
 * when no `.graphifyignore` exists in a directory, fall back to `.gitignore`
 * in the same directory so projects that already maintain a gitignore get
 * sensible defaults without having to duplicate it. `.graphifyignore` keeps
 * absolute priority — if it exists, `.gitignore` is ignored entirely (no
 * merging).
 *
 * Also asserts that `.worktrees/` is part of the always-skipped directory
 * set (the upstream patch adds it to `_SKIP_DIRS` so sibling git worktree
 * checkouts are never indexed redundantly).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detect } from "../src/detect.js";

describe("detect .gitignore fallback (F-0816-P4 / S4.2, upstream #945)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `graphify-detect-gitignore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("honors .gitignore when no .graphifyignore exists", () => {
    // Mark this as a repo root so loadGraphifyignore walks stop here
    mkdirSync(join(tmpDir, ".git"));
    writeFileSync(join(tmpDir, ".gitignore"), "vendor/\n*.generated.py\n");
    mkdirSync(join(tmpDir, "vendor"));
    writeFileSync(join(tmpDir, "vendor", "lib.py"), "x = 1");
    writeFileSync(join(tmpDir, "main.py"), "print('hi')");
    writeFileSync(join(tmpDir, "schema.generated.py"), "x = 1");

    const result = detect(tmpDir);
    const code = result.files.code;

    expect(code.some((f) => f.endsWith("main.py"))).toBe(true);
    expect(code.some((f) => f.includes("vendor"))).toBe(false);
    expect(code.some((f) => f.includes("generated"))).toBe(false);
  });

  it("prefers .graphifyignore over .gitignore when both exist", () => {
    mkdirSync(join(tmpDir, ".git"));
    // .gitignore would exclude main.py; .graphifyignore excludes only other.py
    writeFileSync(join(tmpDir, ".gitignore"), "main.py\n");
    writeFileSync(join(tmpDir, ".graphifyignore"), "other.py\n");
    writeFileSync(join(tmpDir, "main.py"), "x = 1");
    writeFileSync(join(tmpDir, "other.py"), "x = 2");

    const result = detect(tmpDir);
    const code = result.files.code;

    // .gitignore must NOT be applied because .graphifyignore exists
    expect(code.some((f) => f.endsWith("main.py"))).toBe(true);
    // .graphifyignore IS applied
    expect(code.some((f) => f.endsWith("other.py"))).toBe(false);
  });

  it("does nothing extra when neither ignore file exists", () => {
    mkdirSync(join(tmpDir, ".git"));
    writeFileSync(join(tmpDir, "main.py"), "x = 1");
    writeFileSync(join(tmpDir, "other.py"), "x = 2");

    const result = detect(tmpDir);

    expect(result.files.code).toHaveLength(2);
    expect(result.graphifyignore_patterns).toBe(0);
  });

  it("treats an explicit empty .graphifyignore as no patterns (no fallback)", () => {
    // User intent: empty .graphifyignore explicitly disables fallback.
    mkdirSync(join(tmpDir, ".git"));
    writeFileSync(join(tmpDir, ".graphifyignore"), "");
    writeFileSync(join(tmpDir, ".gitignore"), "main.py\n");
    writeFileSync(join(tmpDir, "main.py"), "x = 1");

    const result = detect(tmpDir);

    expect(result.files.code.some((f) => f.endsWith("main.py"))).toBe(true);
    expect(result.graphifyignore_patterns).toBe(0);
  });

  it("skips files under .worktrees/ (F-0816-P4 / S4.2, upstream #947)", () => {
    mkdirSync(join(tmpDir, ".worktrees", "feature-branch"), { recursive: true });
    writeFileSync(join(tmpDir, ".worktrees", "feature-branch", "main.py"), "x = 1");
    writeFileSync(join(tmpDir, "app.py"), "y = 2");

    const result = detect(tmpDir);
    const code = result.files.code;

    expect(code.some((f) => f.endsWith("app.py"))).toBe(true);
    expect(code.some((f) => f.includes(".worktrees"))).toBe(false);
  });
});
