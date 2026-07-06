/**
 * Ruby containers + mixins — ports of upstream safishamsi 13e2bdd (#1640
 * extraction slice) and 6631af7 (#1668 mixes_in slice).
 *
 * - `module Foo` becomes a container node (methods attach via `method`).
 * - `Foo = Struct.new(...) do … end`, `Foo = Class.new(Super)`,
 *   `Result = Data.define(...)` synthesize a class node named after the
 *   constant; `Class.new(Super)` also emits `inherits`.
 * - `include`/`extend`/`prepend <Const>` in a class/module body emits a
 *   `mixes_in` edge (constant args only; `extend self` is skipped).
 *
 * Upstream resolves mixin/receiver targets through its cross-file Ruby
 * resolver; the TS analog is the sourceless-stub + corpus-rewire pattern
 * already used by the inherits ports. The #1634 constant-receiver call
 * resolution and #1669 affected seeding require the (absent) TS member-call
 * resolver subsystem and are NOT ported here.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractRuby, type ExtractionResult } from "../src/extract.js";

function grammarAvailable(result: ExtractionResult): boolean {
  return !result.error && result.nodes.length > 0;
}

function edgeLabels(result: ExtractionResult, relation: string): Array<[string, string]> {
  const labelById = new Map(result.nodes.map((n) => [n.id, n.label]));
  return result.edges
    .filter((e) => e.relation === relation)
    .map((e) => [labelById.get(e.source) ?? e.source, labelById.get(e.target) ?? e.target]);
}

describe("Ruby module/factory containers (upstream 13e2bdd / #1640)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-ruby-containers-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("emits a container node for `module Foo` with attached methods", async () => {
    const file = join(dir, "tax_calculator.rb");
    writeFileSync(file, [
      "module TaxCalculator",
      "  def self.rate_for(region)",
      "    0.2",
      "  end",
      "end",
    ].join("\n"));

    const result = await extractRuby(file);
    if (!grammarAvailable(result)) return; // grammar absent — asserts in CI

    const labels = result.nodes.map((n) => n.label);
    expect(labels).toContain("TaxCalculator");
    expect(labels).toContain(".rate_for()");
    expect(edgeLabels(result, "method")).toContainEqual(["TaxCalculator", ".rate_for()"]);
  });

  it("synthesizes a class from Struct.new with block methods attached", async () => {
    const file = join(dir, "point.rb");
    writeFileSync(file, [
      "Point = Struct.new(:x, :y) do",
      "  def area",
      "    x * y",
      "  end",
      "end",
    ].join("\n"));

    const result = await extractRuby(file);
    if (!grammarAvailable(result)) return;

    const labels = result.nodes.map((n) => n.label);
    expect(labels).toContain("Point");
    expect(labels).toContain(".area()");
    expect(edgeLabels(result, "method")).toContainEqual(["Point", ".area()"]);
  });

  it("synthesizes Class.new(Super) with an inherits edge, and Data.define", async () => {
    const file = join(dir, "factories.rb");
    writeFileSync(file, [
      "SpecialError = Class.new(StandardError)",
      "Result = Data.define(:code, :body)",
      "MAX = 100",
    ].join("\n"));

    const result = await extractRuby(file);
    if (!grammarAvailable(result)) return;

    const labels = result.nodes.map((n) => n.label);
    expect(labels).toContain("SpecialError");
    expect(labels).toContain("Result");
    // Plain constant assignments stay untouched.
    expect(labels).not.toContain("MAX");
    expect(edgeLabels(result, "inherits")).toContainEqual(["SpecialError", "StandardError"]);
  });
});

describe("Ruby mixes_in edges (upstream 6631af7 / #1668)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-ruby-mixins-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("emits mixes_in for include/extend/prepend with constant args", async () => {
    const file = join(dir, "payment.rb");
    writeFileSync(file, [
      "module Taxable",
      "end",
      "class Payment",
      "  include Taxable",
      "  extend Billing::Helpers",
      "  prepend Auditable",
      "  def process",
      "  end",
      "end",
    ].join("\n"));

    const result = await extractRuby(file);
    if (!grammarAvailable(result)) return;

    const mixes = edgeLabels(result, "mixes_in");
    expect(mixes).toContainEqual(["Payment", "Taxable"]);
    // Namespaced constant resolves by its bare tail name.
    expect(mixes).toContainEqual(["Payment", "Helpers"]);
    expect(mixes).toContainEqual(["Payment", "Auditable"]);
    // Mixins are never mislabeled as calls.
    const calls = edgeLabels(result, "calls");
    expect(calls.some(([, tgt]) => tgt === "Taxable")).toBe(false);
  });

  it("skips `extend self` and non-constant arguments", async () => {
    const file = join(dir, "util.rb");
    writeFileSync(file, [
      "module Util",
      "  extend self",
      "  include some_dynamic_module",
      "  def helper",
      "  end",
      "end",
    ].join("\n"));

    const result = await extractRuby(file);
    if (!grammarAvailable(result)) return;

    expect(edgeLabels(result, "mixes_in")).toEqual([]);
  });
});
