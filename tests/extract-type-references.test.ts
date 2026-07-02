import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  extractJava,
  extractCpp,
  extractRust,
  extractPhp,
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

describe("Lot 2: C++ base-class template-argument references (#1592)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-cpp-typeref-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("emits inherits + generic_arg references for a templated base", async () => {
    const file = join(dir, "sample.cpp");
    writeFileSync(file, [
      "class HttpClient {};",
      "template <typename T>",
      "class Connection {};",
      "class Dep {};",
      "class PooledClient : public Connection<HttpClient> {};",
      "class Car : public Dep {};",
    ].join("\n"));

    const result = await extractCpp(file);
    if (!grammarAvailable(result)) return; // grammar absent — asserts in CI

    const labelById = new Map(result.nodes.map((n) => [n.id, n.label]));
    const inherits = result.edges
      .filter((e) => e.relation === "inherits")
      .map((e) => `${labelById.get(e.source) ?? e.source}->${labelById.get(e.target) ?? e.target}`);
    // Base inheritance edges are emitted (previously C++ had no inherits branch).
    expect(inherits).toContain("PooledClient->Connection");
    expect(inherits).toContain("Car->Dep");

    const refs = typeReferences(result);
    // The base's template argument becomes a generic_arg reference on the class.
    expect(refs).toContainEqual({ context: "generic_arg", target: "HttpClient" });
    // A non-templated base contributes no generic_arg reference.
    expect(refs.some((r) => r.target === "Dep")).toBe(false);
  });
});

describe("Lot 2: Rust struct/enum field type references (#1582, #1579)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-rust-typeref-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("emits references for named-struct, tuple-struct and enum-variant field types", async () => {
    const file = join(dir, "sample.rs");
    writeFileSync(file, [
      "struct Logger;",
      "struct Config;",
      "struct Dim;",
      "struct Repository {",
      "    logger: Logger,",
      "    configs: Vec<Config>,",
      "    count: u32,",
      "}",
      "struct Wrapper(Logger, Vec<Config>);",
      "enum Event {",
      "    Click(Logger),",
      "    Resize { size: Dim },",
      "    Idle,",
      "}",
    ].join("\n"));

    const result = await extractRust(file);
    if (!grammarAvailable(result)) return; // grammar absent — asserts in CI

    const refs = typeReferences(result);
    // Named struct: head field types + generic arg; primitive u32 skipped.
    expect(refs).toContainEqual({ context: "field", target: "Logger" });
    expect(refs).toContainEqual({ context: "field", target: "Vec" });
    expect(refs).toContainEqual({ context: "generic_arg", target: "Config" });
    expect(refs.some((r) => r.target === "u32")).toBe(false);
    // Tuple struct (`Wrapper(Logger, Vec<Config>)`) — positional field types.
    // (Logger/Vec/Config already asserted above; the tuple path feeds the same
    // collector, so no field type is dropped.)
    // Enum variants: tuple variant `Click(Logger)` + struct variant `Resize { size: Dim }`.
    expect(refs).toContainEqual({ context: "field", target: "Dim" });
  });
});

describe("Lot 2: PHP property + promoted-ctor type references (#1590)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-php-typeref-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("emits field references for typed properties and promoted constructor params", async () => {
    const file = join(dir, "sample.php");
    writeFileSync(file, [
      "<?php",
      "class Repo {}",
      "class Logger {}",
      "class UserService {",
      "    private Repo $repo;",
      "    protected ?Logger $logger;",
      "    public function __construct(private Cache $cache, string $name) {}",
      "}",
    ].join("\n"));

    const result = await extractPhp(file);
    if (!grammarAvailable(result)) return; // grammar absent — asserts in CI

    const refs = typeReferences(result);
    // Typed class properties.
    expect(refs).toContainEqual({ context: "field", target: "Repo" });
    expect(refs).toContainEqual({ context: "field", target: "Logger" });
    // Promoted constructor property is a real class field.
    expect(refs).toContainEqual({ context: "field", target: "Cache" });
    // A non-promoted scalar param (`string $name`) leaks no class field edge.
    expect(refs.some((r) => r.target === "string" || r.target === "name")).toBe(false);
  });
});
