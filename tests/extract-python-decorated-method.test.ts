/**
 * Regression tests for F-0820-0827 M6 (upstream 9f73400, #1050):
 * Python @property / @staticmethod / @classmethod decorated methods must emit
 * a class-qualified node id (e.g. `file_bar_baz`) not a class-unqualified one
 * (`file_baz`).  The bug: tree-sitter-python wraps each decorated method in a
 * `decorated_definition` node; the generic walk() used to recurse into it with
 * parentClassNid=null, which produced an unqualified id and left the rationale
 * edge dangling.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractPython } from "../src/extract.js";

describe("Python decorated method node IDs (F-0820-0827 M6, 9f73400 #1050)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-m6-decor-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("@property method gets class-qualified node id", async () => {
    writeFileSync(
      join(dir, "mymodule.py"),
      [
        "class Bar:",
        "    @property",
        "    def baz(self) -> int:",
        "        return 1",
        "",
      ].join("\n"),
    );

    const result = await extractPython(join(dir, "mymodule.py"), dir);

    // The method node id must end with _bar_baz (class-qualified).
    const bazNode = result.nodes.find(
      (n) => n.label === ".baz()" || n.id.endsWith("_bar_baz"),
    );
    expect(bazNode).toBeDefined();
    expect(bazNode!.id).toMatch(/_bar_baz$/);

    // The unqualified (buggy) form must not exist.
    const unqualified = result.nodes.find(
      (n) => n.id.endsWith("_baz") && !n.id.endsWith("_bar_baz"),
    );
    expect(unqualified).toBeUndefined();
  });

  it("@staticmethod gets class-qualified node id", async () => {
    writeFileSync(
      join(dir, "mod.py"),
      [
        "class Foo:",
        "    @staticmethod",
        "    def helper() -> int:",
        "        return 2",
        "",
      ].join("\n"),
    );

    const result = await extractPython(join(dir, "mod.py"), dir);

    const helperNode = result.nodes.find(
      (n) => n.label === ".helper()" || n.id.endsWith("_foo_helper"),
    );
    expect(helperNode).toBeDefined();
    expect(helperNode!.id).toMatch(/_foo_helper$/);

    // No unqualified _helper node (the buggy form).
    const unqualified = result.nodes.find(
      (n) => n.id.endsWith("_helper") && !n.id.endsWith("_foo_helper"),
    );
    expect(unqualified).toBeUndefined();
  });

  it("@classmethod gets class-qualified node id", async () => {
    writeFileSync(
      join(dir, "cm.py"),
      [
        "class MyClass:",
        "    @classmethod",
        "    def factory(cls) -> 'MyClass':",
        "        return cls()",
        "",
      ].join("\n"),
    );

    const result = await extractPython(join(dir, "cm.py"), dir);

    const factoryNode = result.nodes.find(
      (n) => n.label === ".factory()" || n.id.endsWith("_myclass_factory"),
    );
    expect(factoryNode).toBeDefined();
    expect(factoryNode!.id).toMatch(/_myclass_factory$/);
  });

  it("undecorated method still gets class-qualified id (baseline)", async () => {
    writeFileSync(
      join(dir, "base.py"),
      [
        "class Base:",
        "    def normal(self) -> int:",
        "        return 3",
        "",
      ].join("\n"),
    );

    const result = await extractPython(join(dir, "base.py"), dir);

    const normalNode = result.nodes.find((n) => n.label === ".normal()");
    expect(normalNode).toBeDefined();
    expect(normalNode!.id).toMatch(/_base_normal$/);
  });
});
