import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { cursorInstall, cursorUninstall } from "../src/cli.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Cursor integration contract", () => {
  it("writes a project-scoped Cursor rule", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cursor-"));
    tempDirs.push(dir);

    cursorInstall(dir);

    const rule = readFileSync(join(dir, ".cursor", "rules", "engram.mdc"), "utf-8");
    expect(rule).toContain("alwaysApply: true");
    expect(rule).toContain(".engram/GRAPH_REPORT.md");
    expect(rule).toContain("npx engram hook-rebuild");
    expect(rule).toContain("engram migrate-state --dry-run");
  });

  it("replaces a legacy graphify rule in place instead of leaving both", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cursor-legacy-"));
    tempDirs.push(dir);

    const legacyRulePath = join(dir, ".cursor", "rules", "graphify.mdc");
    mkdirSync(join(dir, ".cursor", "rules"), { recursive: true });
    writeFileSync(legacyRulePath, "---\ndescription: legacy\n---\nlegacy rule\n", "utf-8");

    cursorInstall(dir);

    expect(readFileSync(join(dir, ".cursor", "rules", "engram.mdc"), "utf-8")).toContain(
      "alwaysApply: true",
    );
    expect(existsSync(legacyRulePath)).toBe(false);
  });

  it("is idempotent and does not overwrite an existing rule", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cursor-idem-"));
    tempDirs.push(dir);

    cursorInstall(dir);
    const rulePath = join(dir, ".cursor", "rules", "engram.mdc");
    const original = readFileSync(rulePath, "utf-8");

    cursorInstall(dir);

    expect(readFileSync(rulePath, "utf-8")).toBe(original);
  });

  it("removes the Cursor rule on uninstall", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cursor-uninstall-"));
    tempDirs.push(dir);

    cursorInstall(dir);
    cursorUninstall(dir);

    expect(existsSync(join(dir, ".cursor", "rules", "engram.mdc"))).toBe(false);
  });

  it("removes a legacy graphify rule on uninstall", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cursor-legacy-uninstall-"));
    tempDirs.push(dir);

    const legacyRulePath = join(dir, ".cursor", "rules", "graphify.mdc");
    mkdirSync(join(dir, ".cursor", "rules"), { recursive: true });
    writeFileSync(legacyRulePath, "legacy rule\n", "utf-8");

    cursorUninstall(dir);

    expect(existsSync(legacyRulePath)).toBe(false);
  });

  it("is a no-op when the Cursor rule is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cursor-noop-"));
    tempDirs.push(dir);

    expect(() => cursorUninstall(dir)).not.toThrow();
  });
});
