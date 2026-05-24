/**
 * Regression tests for F-0816-P4 / S4.3.
 *
 * Port of upstream safishamsi/graphify commit `9e6192a` (PR #947):
 * `--exclude <pattern>` is a repeatable CLI flag that injects extra ignore
 * patterns at the scan root. The patterns win over `.graphifyignore` /
 * `.gitignore` because they're appended last and gitignore semantics keep
 * the last-matching rule.
 *
 * The TS port exposes this as `extraExcludes` on `DetectOptions` so all
 * `detect()` call sites (CLI, watch, pipeline, skill-runtime,
 * configured-dataprep) can forward `--exclude` patterns without each one
 * re-implementing glob handling.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detect } from "../src/detect.js";

describe("detect --exclude / extraExcludes (F-0816-P4 / S4.3, upstream #947)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `graphify-detect-exclude-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("excludes a single file pattern via extraExcludes", () => {
    writeFileSync(join(tmpDir, "main.py"), "x = 1");
    writeFileSync(join(tmpDir, "internal.py"), "x = 2");

    const result = detect(tmpDir, { extraExcludes: ["internal.py"] });
    const code = result.files.code;

    expect(code.some((f) => f.endsWith("main.py"))).toBe(true);
    expect(code.some((f) => f.endsWith("internal.py"))).toBe(false);
  });

  it("excludes a directory pattern via extraExcludes", () => {
    writeFileSync(join(tmpDir, "main.py"), "x = 1");
    mkdirSync(join(tmpDir, "legacy"));
    writeFileSync(join(tmpDir, "legacy", "old.py"), "y = 2");

    const result = detect(tmpDir, { extraExcludes: ["legacy/"] });
    const code = result.files.code;

    expect(code.some((f) => f.endsWith("main.py"))).toBe(true);
    expect(code.some((f) => f.includes("legacy"))).toBe(false);
  });

  it("supports repeated --exclude patterns (additive)", () => {
    writeFileSync(join(tmpDir, "main.py"), "x = 1");
    writeFileSync(join(tmpDir, "internal.py"), "x = 2");
    mkdirSync(join(tmpDir, "legacy"));
    writeFileSync(join(tmpDir, "legacy", "old.py"), "x = 3");

    const result = detect(tmpDir, { extraExcludes: ["internal.py", "legacy/"] });
    const code = result.files.code;

    expect(code.some((f) => f.endsWith("main.py"))).toBe(true);
    expect(code.some((f) => f.endsWith("internal.py"))).toBe(false);
    expect(code.some((f) => f.includes("legacy"))).toBe(false);
  });

  it("supports glob patterns (suffix *)", () => {
    writeFileSync(join(tmpDir, "main.py"), "x = 1");
    writeFileSync(join(tmpDir, "schema.generated.py"), "x = 2");
    writeFileSync(join(tmpDir, "types.generated.py"), "x = 3");

    const result = detect(tmpDir, { extraExcludes: ["*.generated.py"] });
    const code = result.files.code;

    expect(code.some((f) => f.endsWith("main.py"))).toBe(true);
    expect(code.some((f) => f.includes("generated"))).toBe(false);
  });

  it("--exclude wins over .graphifyignore negations (appended last)", () => {
    // .graphifyignore would re-include negated.py; --exclude must still ban it.
    writeFileSync(join(tmpDir, ".graphifyignore"), "*.py\n!negated.py\n");
    writeFileSync(join(tmpDir, "negated.py"), "x = 1");
    writeFileSync(join(tmpDir, "main.py"), "x = 2");

    const result = detect(tmpDir, { extraExcludes: ["negated.py"] });

    expect(result.files.code.some((f) => f.endsWith("negated.py"))).toBe(false);
    expect(result.files.code.some((f) => f.endsWith("main.py"))).toBe(false);
  });

  it("undefined / empty extraExcludes is a no-op", () => {
    writeFileSync(join(tmpDir, "main.py"), "x = 1");
    writeFileSync(join(tmpDir, "internal.py"), "x = 2");

    const r1 = detect(tmpDir);
    const r2 = detect(tmpDir, { extraExcludes: [] });
    const r3 = detect(tmpDir, { extraExcludes: undefined });

    expect(r1.files.code).toHaveLength(2);
    expect(r2.files.code).toHaveLength(2);
    expect(r3.files.code).toHaveLength(2);
  });
});
