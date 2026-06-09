/**
 * Regression tests for F-0820-0827 M5 (upstream 80301a0, #916):
 * Language built-ins used as call targets must never accumulate "calls" edges
 * and therefore cannot become god-nodes in the ranking.
 *
 * Before the fix: `String(x)`, `Number(x)`, `print(msg)`, etc. each resolve
 * against the file's labelToNid, and if a symbol with that exact name existed
 * elsewhere in the corpus they would receive a spurious edge from every call
 * site — making them look like highly-connected hub nodes.  Even within a
 * single file the filter prevents spurious self-links when a function is named
 * after a built-in.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extract, LANGUAGE_BUILTIN_GLOBALS } from "../src/extract.js";

describe("builtin god-node filter (F-0820-0827 M5, 80301a0 #916)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-m5-builtin-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("LANGUAGE_BUILTIN_GLOBALS contains expected JS/TS built-ins", () => {
    // Verify the set includes the most common offenders from the upstream fix.
    for (const name of [
      "String", "Number", "Boolean", "Array", "Object",
      "Promise", "Map", "Set", "Error", "JSON", "Math",
      "parseInt", "parseFloat", "console",
    ]) {
      expect(LANGUAGE_BUILTIN_GLOBALS.has(name)).toBe(true);
    }
  });

  it("LANGUAGE_BUILTIN_GLOBALS contains Python built-ins", () => {
    for (const name of [
      "str", "int", "float", "bool", "list", "dict",
      "print", "len", "range", "isinstance", "type", "super",
    ]) {
      expect(LANGUAGE_BUILTIN_GLOBALS.has(name)).toBe(true);
    }
  });

  it("calls to JS/TS built-ins do not produce calls edges", async () => {
    // Two functions that call JS built-ins.  The built-ins must NOT appear as
    // edge targets and must NOT appear as nodes.
    writeFileSync(
      join(dir, "util.ts"),
      [
        "export function formatId(raw: unknown): string {",
        "  return String(raw).trim();",   // String() — built-in
        "}",
        "",
        "export function parseNum(s: string): number {",
        "  return Number(s);",            // Number() — built-in
        "}",
        "",
        "export function logIt(msg: string): void {",
        "  console.log(msg);",            // console — built-in (member call)
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([join(dir, "util.ts")]);

    // No "calls" edge should target a built-in node id.
    const callEdges = result.edges.filter((e) => e.relation === "calls");
    const callTargets = new Set(callEdges.map((e) => e.target));

    // Built-in names must not appear as call-edge targets.
    for (const builtinName of ["String", "Number", "console"]) {
      const hasBuiltinEdge = [...callTargets].some((tgt) =>
        tgt.toLowerCase().includes(builtinName.toLowerCase()),
      );
      expect(hasBuiltinEdge).toBe(false);
    }
  });

  it("calls to Python built-ins do not produce calls edges", async () => {
    writeFileSync(
      join(dir, "utils.py"),
      [
        "def process(items):",
        "    result = list(items)",          // list() — built-in
        "    n = len(result)",               // len()  — built-in
        "    return str(n)",                 // str()  — built-in
        "",
        "def validate(x):",
        "    return isinstance(x, int)",     // isinstance() — built-in
        "",
      ].join("\n"),
    );

    const result = await extract([join(dir, "utils.py")]);

    const callEdges = result.edges.filter((e) => e.relation === "calls");
    const callTargets = new Set(callEdges.map((e) => e.target));

    for (const builtinName of ["list", "len", "str", "isinstance"]) {
      const hasBuiltinEdge = [...callTargets].some((tgt) =>
        tgt === builtinName || tgt.endsWith(`_${builtinName}`),
      );
      expect(hasBuiltinEdge).toBe(false);
    }
  });

  it("a user-defined function named identically to a built-in is still a node but not a call target", async () => {
    // A user defines `function str() {}` — it should be a node, but calls to
    // `str(x)` from other functions should not emit a "calls" edge to it via
    // the built-in filter (the filter short-circuits before any resolution).
    writeFileSync(
      join(dir, "mymodule.ts"),
      [
        "// deliberately shadows the built-in name (edge case)",
        "export function str(x: unknown): string {",
        "  return `${x}`;",
        "}",
        "",
        "export function callStr(v: number): string {",
        "  return str(v);",   // call to the user-defined str()
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([join(dir, "mymodule.ts")]);
    const nodeLabels = result.nodes.map((n) => n.label);

    // The user-defined str() must still be extracted as a node.
    expect(nodeLabels.some((l) => l === "str()")).toBe(true);

    // However, the call edge to str() is filtered by the built-in guard, so
    // no "calls" edge targets the str node.  This is an acceptable trade-off:
    // naming a function identically to a built-in is unusual; the filter
    // prevents far more false positives than it might suppress here.
    const callEdges = result.edges.filter((e) => e.relation === "calls");
    const callTargets = new Set(callEdges.map((e) => e.target));
    const strNodeId = result.nodes.find((n) => n.label === "str()")?.id;
    if (strNodeId) {
      // The built-in filter fires before resolution: no calls edge to str().
      expect(callTargets.has(strNodeId)).toBe(false);
    }
  });
});
