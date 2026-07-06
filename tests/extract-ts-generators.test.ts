/**
 * TS/JS generator functions as nodes — port of upstream safishamsi 09aeb97.
 *
 * `function* g()` parses as `generator_function_declaration` (absent from
 * function_types → no node); `const h = function*(){}` parses as
 * `generator_function` (absent from the function-value types → never
 * captured at module level). Generator methods (`*gen()` in a class) were
 * already covered — they parse as `method_definition`.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractJs } from "../src/extract.js";

describe("TS/JS generator functions (upstream 09aeb97)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-ts-generators-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("emits a node for a generator function declaration", async () => {
    const file = join(dir, "gen.ts");
    writeFileSync(file, [
      "export function* walkTree(): Generator<number> {",
      "  yield 1;",
      "}",
      "function plain(): void {}",
    ].join("\n"));

    const result = await extractJs(file);
    expect(result.error).toBeUndefined();
    const labels = result.nodes.map((n) => n.label);
    expect(labels).toContain("walkTree()");
    expect(labels).toContain("plain()");
  });

  it("captures a module-level generator (and plain function) expression const", async () => {
    const file = join(dir, "genexpr.js");
    writeFileSync(file, [
      "const pump = function* () {",
      "  yield 1;",
      "};",
      "const legacy = function () { return 2; };",
      "module.exports = { pump, legacy };",
    ].join("\n"));

    const result = await extractJs(file);
    expect(result.error).toBeUndefined();
    const labels = result.nodes.map((n) => n.label);
    expect(labels).toContain("pump()");
    expect(labels).toContain("legacy()");
  });

  it("still extracts generator methods inside classes (already-covered path)", async () => {
    const file = join(dir, "genmethod.ts");
    writeFileSync(file, [
      "class Store {",
      "  *entries(): Generator<string> {",
      "    yield 'a';",
      "  }",
      "}",
    ].join("\n"));

    const result = await extractJs(file);
    expect(result.error).toBeUndefined();
    expect(result.nodes.map((n) => n.label)).toContain(".entries()");
  });

  it("resolves calls made from inside a generator body", async () => {
    const file = join(dir, "gencalls.ts");
    writeFileSync(file, [
      "function helper(): number { return 1; }",
      "export function* produce(): Generator<number> {",
      "  yield helper();",
      "}",
    ].join("\n"));

    const result = await extractJs(file);
    expect(result.error).toBeUndefined();
    const labelById = new Map(result.nodes.map((n) => [n.id, n.label]));
    const calls = result.edges
      .filter((e) => e.relation === "calls")
      .map((e) => [labelById.get(e.source), labelById.get(e.target)]);
    expect(calls).toContainEqual(["produce()", "helper()"]);
  });
});
