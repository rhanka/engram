import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { extractJs } from "../src/extract.js";

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("AST call edge confidence", () => {
  it("marks JS call edges as EXTRACTED with full weight", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-extract-js-"));
    cleanupDirs.push(dir);

    const filePath = join(dir, "sample.js");
    writeFileSync(
      filePath,
      [
        "function helper() { return 1; }",
        "export function demo() { return helper(); }",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = await extractJs(filePath);
    const calls = result.edges.filter((edge) => edge.relation === "calls");

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((edge) => edge.confidence === "EXTRACTED")).toBe(true);
    expect(calls.every((edge) => edge.weight === 1.0)).toBe(true);
  });
});
