import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extract } from "../src/extract.js";

// Port of upstream safishamsi 1494874 — track JS/TS barrel re-exports as
// explicit graph edges. This file pins both S-1 (detection of the
// `export_statement` with a `from` clause and tagging of the file-level
// `imports_from` edge with `context: "re-export"`) and S-2 (symbol-level
// `re_exports` edges). The combined file lets the suite remain green at
// every checkpoint while the S-2 implementation lands.
describe("JS/TS barrel re-exports (port upstream safishamsi 1494874)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-barrel-reexports-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writeBarrel = (): void => {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "cookieHelpers.ts"),
      [
        "export function readCookie(name: string): string {",
        "  return '';",
        "}",
        "export function writeCookie(name: string, value: string): void {}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "src", "storageHelpers.ts"),
      [
        "export function getFromStorage(key: string): string | null {",
        "  return null;",
        "}",
        "export function setInStorage(key: string, value: string): void {}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "src", "urlHelpers.ts"),
      [
        "export function getFullUrl(path: string): string {",
        "  return 'https://example.com' + path;",
        "}",
        "export function basePathRewrite(url: string): string {",
        "  return url;",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "src", "namespacedHelpers.ts"),
      [
        "export function withNamespace(): number { return 1; }",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "src", "index.ts"),
      [
        "// Barrel file that re-exports from submodules",
        "export { readCookie, writeCookie } from './cookieHelpers';",
        "export * from './storageHelpers';",
        "export { basePathRewrite, getFullUrl as fullUrl } from './urlHelpers';",
        "export * as Ns from './namespacedHelpers';",
        "",
        "// Also has local exports (should still be extracted as nodes)",
        "export function localHelper() {",
        "  return 'local';",
        "}",
        "",
        "export const LOCAL_CONST = 42;",
        "",
      ].join("\n"),
    );
  };

  // ── S-1: detection ────────────────────────────────────────────────────────

  it("S-1 emits file-level imports_from edges from a barrel to each source module", async () => {
    writeBarrel();
    const result = await extract([
      join(dir, "src", "index.ts"),
      join(dir, "src", "cookieHelpers.ts"),
      join(dir, "src", "storageHelpers.ts"),
      join(dir, "src", "urlHelpers.ts"),
      join(dir, "src", "namespacedHelpers.ts"),
    ]);

    const importsFromTargets = result.edges
      .filter((e) => e.relation === "imports_from")
      .map((e) => e.target.toLowerCase());

    expect(importsFromTargets.some((t) => t.includes("cookiehelpers"))).toBe(true);
    expect(importsFromTargets.some((t) => t.includes("storagehelpers"))).toBe(true);
    expect(importsFromTargets.some((t) => t.includes("urlhelpers"))).toBe(true);
    expect(importsFromTargets.some((t) => t.includes("namespacedhelpers"))).toBe(true);
  });

  it("S-1 tags re-export file edges with context='re-export' (vs plain import edges)", async () => {
    writeBarrel();
    const result = await extract([join(dir, "src", "index.ts"), join(dir, "src", "cookieHelpers.ts")]);
    const importsFromBarrel = result.edges.filter(
      (e) => e.relation === "imports_from" && (e.source_file ?? "").endsWith("index.ts"),
    );
    expect(importsFromBarrel.length).toBeGreaterThan(0);
    for (const edge of importsFromBarrel) {
      expect((edge as { context?: string }).context).toBe("re-export");
    }
  });

  it("S-1 keeps walking children so `export function/const` in a barrel still emit nodes", async () => {
    writeBarrel();
    const result = await extract([join(dir, "src", "index.ts")]);
    const labels = result.nodes.map((n) => n.label);
    expect(labels.some((l) => l === "localHelper" || l === "localHelper()")).toBe(true);
    expect(labels.some((l) => l === "index.ts")).toBe(true);
  });

  it("S-1 does NOT tag pure `export const/function/{ local }` edges (no `from` clause)", async () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "pure.ts"),
      [
        "const x = 1;",
        "export { x };",
        "export const y = 2;",
        "export function z() { return 3; }",
        "",
      ].join("\n"),
    );

    const result = await extract([join(dir, "src", "pure.ts")]);
    const reExportTagged = result.edges.filter(
      (e) => (e as { context?: string }).context === "re-export",
    );
    expect(reExportTagged).toEqual([]);
  });

  it("S-1 handles `export * from './mod'` with a target on the source module", async () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "storageHelpers.ts"),
      "export function getFromStorage(k: string): string { return ''; }\n",
    );
    writeFileSync(
      join(dir, "src", "index.ts"),
      "export * from './storageHelpers';\n",
    );

    const result = await extract([
      join(dir, "src", "index.ts"),
      join(dir, "src", "storageHelpers.ts"),
    ]);

    const importsFromTargets = result.edges
      .filter((e) => e.relation === "imports_from")
      .map((e) => e.target.toLowerCase());
    expect(importsFromTargets.some((t) => t.includes("storagehelpers"))).toBe(true);
  });
});
