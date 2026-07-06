/**
 * Kotlin delegation_specifiers → inherits/implements edges, including
 * interface delegation (`class Foo : Bar by baz`) — port of upstream
 * safishamsi kotlin delegation handling + 9b04022 (explicit_delegation).
 *
 * tree-sitter-kotlin ships no prebuilt WASM in this repo, so the integration
 * tests soft-skip locally and assert in CI (same pattern as
 * tests/extract-swift-extensions.test.ts / the Lot-1a PowerShell/ObjC ports).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractKotlin, __testing, type ExtractionResult } from "../src/extract.js";

function grammarAvailable(result: ExtractionResult): boolean {
  return !result.error && result.nodes.length > 0;
}

/** Minimal SyntaxNode stand-in for the pure-text helper below. */
function fakeNode(type: string, start: number, end: number, children: unknown[] = []): unknown {
  return { type, startIndex: start, endIndex: end, children };
}

describe("_kotlinUserTypeName (locally-asserted unit, grammar-independent)", () => {
  it("reads the head identifier from type_identifier / simple_user_type shapes", () => {
    const source = "MutableList<T>";
    // user_type -> type_identifier("MutableList")
    const direct = fakeNode("user_type", 0, 14, [fakeNode("type_identifier", 0, 11)]);
    // user_type -> simple_user_type -> identifier("MutableList")
    const nested = fakeNode("user_type", 0, 14, [
      fakeNode("simple_user_type", 0, 11, [fakeNode("identifier", 0, 11)]),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const read = (n: unknown) => __testing.kotlinUserTypeName(n as any, source);
    expect(read(direct)).toBe("MutableList");
    expect(read(nested)).toBe("MutableList");
    expect(read(fakeNode("user_type", 0, 0, []))).toBeNull();
  });
});

function edgeLabels(result: ExtractionResult, relation: string): Array<[string, string]> {
  const labelById = new Map(result.nodes.map((n) => [n.id, n.label]));
  return result.edges
    .filter((e) => e.relation === relation)
    .map((e) => [labelById.get(e.source) ?? e.source, labelById.get(e.target) ?? e.target]);
}

describe("Kotlin delegation specifiers (upstream 9b04022 + base handling)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-kotlin-delegation-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("splits inherits (constructor_invocation) and implements (user_type)", async () => {
    const file = join(dir, "processor.kt");
    writeFileSync(file, [
      "open class BaseProcessor {}",
      "interface Loggable { fun log() }",
      "class DataProcessor : BaseProcessor(), Loggable {",
      "    override fun log() {}",
      "}",
    ].join("\n"));

    const result = await extractKotlin(file);
    if (!grammarAvailable(result)) return; // grammar absent locally — asserts in CI

    expect(edgeLabels(result, "inherits")).toContainEqual(["DataProcessor", "BaseProcessor"]);
    expect(edgeLabels(result, "implements")).toContainEqual(["DataProcessor", "Loggable"]);
  });

  it("emits implements for interface delegation (`by`) — upstream 9b04022", async () => {
    const file = join(dir, "logging.kt");
    writeFileSync(file, [
      "class LoggingList<T>(inner: MutableList<T>) : MutableList<T> by inner",
    ].join("\n"));

    const result = await extractKotlin(file);
    if (!grammarAvailable(result)) return; // grammar absent locally — asserts in CI

    expect(edgeLabels(result, "implements")).toContainEqual(["LoggingList", "MutableList"]);
  });
});
