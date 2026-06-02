import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extract } from "../src/extract.js";

/**
 * Track F-0819-P1 (upstream #1077): two phantom-node sources.
 *  - JS/TS: a `const`/`let` inside an arrow-function callback must NOT emit a
 *    bare-named node (it collides across files into a phantom god-node).
 *  - Markdown: fenced code blocks must NOT emit orphan nodes.
 */
describe("F-0819-P1 #1077 — no phantom nodes from arrow-fn locals or md code blocks", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-f0819-1077-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("does not emit nodes for locals declared inside an arrow callback", async () => {
    writeFileSync(
      join(dir, "a.ts"),
      [
        "export function setup() {",
        "  register(() => {",
        "    const phantomLocal = new Set();", // local inside arrow callback
        "    const helper = () => 42;",
        "    return phantomLocal.size + helper();",
        "  });",
        "}",
        "const moduleLevelConst = 7;", // module-level — this one MAY be a node
        "",
      ].join("\n"),
    );
    const result = await extract([join(dir, "a.ts")]);
    const labels = result.nodes.map((n) => n.label);
    expect(labels).not.toContain("phantomLocal");
    expect(labels).not.toContain("helper");
  });

  it("does not emit orphan nodes for markdown fenced code blocks", async () => {
    writeFileSync(
      join(dir, "doc.md"),
      [
        "# Title",
        "",
        "Some prose.",
        "",
        "```ts",
        "const x = 1;",
        "console.log(x);",
        "```",
        "",
        "## Section",
        "",
      ].join("\n"),
    );
    const result = await extract([join(dir, "doc.md")]);
    // No node whose id/label marks a code block.
    const codeBlockNodes = result.nodes.filter(
      (n) => n.id.includes("codeblock_") || /^code:/.test(n.label ?? ""),
    );
    expect(codeBlockNodes).toEqual([]);
    // The heading nodes still exist (code-block skipping must not eat headings).
    expect(result.nodes.some((n) => (n.label ?? "").includes("Title"))).toBe(true);
    expect(result.nodes.some((n) => (n.label ?? "").includes("Section"))).toBe(true);
  });
});
