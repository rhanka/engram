import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  extractJava,
  type ExtractionResult,
} from "../src/extract.js";
import type { GraphEdge } from "../src/types.js";

/**
 * Lot 2 — type/field/generic-arg `references` subsystem.
 *
 * Upstream safishamsi emits `references` edges for the declared types of class
 * fields / properties / vars / generic arguments; the TS extractor had no such
 * subsystem (only SQL foreign keys emitted `references`). These tests assert the
 * ported per-language collectors. Languages whose tree-sitter grammar ships no
 * prebuilt WASM in this repo (C#, Scala, Swift) soft-skip locally and assert in
 * CI, mirroring tests/extract-swift-extensions.test.ts.
 */

/** Collect `references` edges as `{ context, targetLabel }`, resolving ids → labels. */
function typeReferences(result: ExtractionResult): Array<{ context: string | undefined; target: string }> {
  const labelById = new Map(result.nodes.map((n) => [n.id, n.label]));
  return result.edges
    .filter((e: GraphEdge) => e.relation === "references")
    .map((e) => ({
      context: e.context as string | undefined,
      target: labelById.get(e.target) ?? e.target,
    }));
}

/** Whether an extractor produced anything (grammar present). */
function grammarAvailable(result: ExtractionResult): boolean {
  return !result.error && result.nodes.length > 0;
}

describe("Lot 2: Java field type references (#1485, #1518)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-java-typeref-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("emits field + generic_arg references and skips primitives", async () => {
    const file = join(dir, "Repository.java");
    writeFileSync(file, [
      "class Repository {",
      "    Logger logger;",
      "    List<Config> configs;",
      "    int count;",
      "}",
    ].join("\n"));

    const result = await extractJava(file);
    if (!grammarAvailable(result)) return; // grammar absent — asserts in CI

    const refs = typeReferences(result);
    // Head field types -> context "field"
    expect(refs).toContainEqual({ context: "field", target: "Logger" });
    expect(refs).toContainEqual({ context: "field", target: "List" });
    // Generic argument -> context "generic_arg"
    expect(refs).toContainEqual({ context: "generic_arg", target: "Config" });
    // Primitive `int` is never referenced
    expect(refs.some((r) => r.target === "int")).toBe(false);
  });

  it("skips in-scope type parameters (#1518)", async () => {
    const file = join(dir, "Container.java");
    writeFileSync(file, [
      "class Container<T> {",
      "    T value;",
      "    List<T> items;",
      "}",
    ].join("\n"));

    const result = await extractJava(file);
    if (!grammarAvailable(result)) return; // grammar absent — asserts in CI

    const refs = typeReferences(result);
    // `T` is a type parameter, not a real type: never referenced (head or arg).
    expect(refs.some((r) => r.target === "T")).toBe(false);
    // The real container type `List` is still referenced.
    expect(refs).toContainEqual({ context: "field", target: "List" });
  });
});
