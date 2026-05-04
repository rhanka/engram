import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectFiles, extract } from "../src/extract.js";

describe("upstream v4 language surface", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-language-surface-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("collects upstream v4 code extensions", () => {
    const files = [
      "component.vue",
      "component.svelte",
      "template.blade.php",
      "main.dart",
      "module.v",
      "module.sv",
      "script.mjs",
      "template.ejs",
    ];

    for (const file of files) {
      writeFileSync(join(dir, file), "function surfaceFixture() { return 1; }\n");
    }

    expect(collectFiles(dir).map((p) => p.split("/").pop()).sort()).toEqual(files.sort());
  });

  it("collects files when the explicit project root is inside a hidden parent", () => {
    const worktreeRoot = join(dir, ".worktrees", "feature-branch");
    mkdirSync(join(worktreeRoot, "src"), { recursive: true });
    writeFileSync(join(worktreeRoot, "src", "main.ts"), "export const value = 1;\n");

    const files = collectFiles(worktreeRoot);

    expect(files).toContain(join(worktreeRoot, "src", "main.ts"));
  });

  it("does not collect sibling worktree files from the main project root", () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, ".worktrees", "feature-branch", "src"), { recursive: true });
    writeFileSync(join(dir, "src", "main.ts"), "export const main = true;\n");
    writeFileSync(join(dir, ".worktrees", "feature-branch", "src", "branch.ts"), "export const branch = true;\n");

    const files = collectFiles(dir);

    expect(files).toContain(join(dir, "src", "main.ts"));
    expect(files).not.toContain(join(dir, ".worktrees", "feature-branch", "src", "branch.ts"));
  });

  it("extracts stable nodes from regex-backed upstream v4 languages", async () => {
    writeFileSync(join(dir, "component.vue"), `
<script>
export function loadWidget() {
  return renderWidget();
}
</script>
`);
    writeFileSync(join(dir, "component.svelte"), `
<script>
function renderWidget() {
  return 1;
}
</script>
`);
    writeFileSync(join(dir, "template.blade.php"), `
@php
function bladeHelper() { return view('home'); }
@endphp
`);
    writeFileSync(join(dir, "main.dart"), `
class Greeter {}
void sayHello() {
  print('hello');
}
`);
    writeFileSync(join(dir, "module.v"), `
module counter(input clk);
endmodule
`);
    writeFileSync(join(dir, "module.sv"), `
module controller(input logic clk);
endmodule
`);
    writeFileSync(join(dir, "script.mjs"), "export function runScript() { return 1; }\n");
    writeFileSync(join(dir, "template.ejs"), "<% function renderTemplate() { return 'ok'; } %>\n");

    const files = collectFiles(dir);
    const result = await extract(files);
    const labels = result.nodes.map((node) => node.label);

    expect(labels).toContain("loadWidget()");
    expect(labels).toContain("renderWidget()");
    expect(labels).toContain("bladeHelper()");
    expect(labels).toContain("Greeter");
    expect(labels).toContain("sayHello()");
    expect(labels).toContain("counter");
    expect(labels).toContain("controller");
    expect(labels).toContain("runScript()");
    expect(labels).toContain("renderTemplate()");
  });

  it("extracts Java inheritance and interface implementation edges", async () => {
    writeFileSync(join(dir, "PaymentService.java"), `
interface Auditable {}
interface Billable extends Auditable {}
class BaseService {}
class PaymentService extends BaseService implements Billable {}
`);

    const result = await extract([join(dir, "PaymentService.java")]);
    const relations = result.edges.map((edge) => `${edge.source}:${edge.relation}:${edge.target}`);

    expect(relations).toContain("paymentservice_paymentservice:inherits:paymentservice_baseservice");
    expect(relations).toContain("paymentservice_paymentservice:implements:paymentservice_billable");
    expect(relations).toContain("paymentservice_billable:inherits:paymentservice_auditable");
  });

  it("uses project-relative file node IDs and stable relative import targets", async () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });

    writeFileSync(
      join(dir, "src", "index.ts"),
      [
        "import { helper } from './utils.js';",
        "export function alpha() {",
        "  return helper();",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "src", "utils.ts"),
      [
        "export function helper() {",
        "  return 1;",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "tests", "index.ts"),
      [
        "export function beta() {",
        "  return 2;",
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([
      join(dir, "src", "index.ts"),
      join(dir, "src", "utils.ts"),
      join(dir, "tests", "index.ts"),
    ]);

    const fileNodes = result.nodes
      .filter((node) => node.label.endsWith(".ts"))
      .map((node) => node.id)
      .sort();
    const importEdge = result.edges.find(
      (edge) => edge.source === "src_index_ts" && edge.relation === "imports_from",
    );

    expect(fileNodes).toEqual(["src_index_ts", "src_utils_ts", "tests_index_ts"]);
    expect(new Set(fileNodes).size).toBe(3);
    expect(importEdge?.target).toBe("src_utils_ts");
  });

  it("resolves tsconfig path aliases before treating JS imports as external", async () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          paths: {
            "@/*": ["src/*"],
          },
        },
      }, null, 2),
      "utf-8",
    );
    writeFileSync(
      join(dir, "src", "entry.ts"),
      [
        "import { helper } from '@/utils';",
        "export function alpha() {",
        "  return helper();",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "src", "utils.ts"),
      [
        "export function helper() {",
        "  return 1;",
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([
      join(dir, "src", "entry.ts"),
      join(dir, "src", "utils.ts"),
    ]);

    const importEdge = result.edges.find(
      (edge) => edge.source === "entry_ts" && edge.relation === "imports_from",
    );

    expect(importEdge?.target).toBe("utils_ts");
  });

  it("parses JSONC tsconfig aliases with comments and trailing commas", async () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "tsconfig.json"),
      [
        "{",
        "  // vite-style alias config",
        '  "compilerOptions": {',
        '    "paths": {',
        '      "@/*": ["src/*"],',
        "    },",
        "  },",
        "}",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(dir, "src", "entry.ts"),
      [
        "import { helper } from '@/utils';",
        "export function alpha() {",
        "  return helper();",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "src", "utils.ts"),
      [
        "export function helper() {",
        "  return 1;",
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([
      join(dir, "src", "entry.ts"),
      join(dir, "src", "utils.ts"),
    ]);

    const importEdge = result.edges.find(
      (edge) => edge.source === "entry_ts" && edge.relation === "imports_from",
    );

    expect(importEdge?.target).toBe("utils_ts");
  });

  it("resolves local dynamic imports as imports_from edges", async () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "entry.ts"),
      [
        "export async function loadHelper() {",
        "  return import('./utils');",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "src", "utils.ts"),
      [
        "export function helper() {",
        "  return 1;",
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([
      join(dir, "src", "entry.ts"),
      join(dir, "src", "utils.ts"),
    ]);

    const importEdge = result.edges.find(
      (edge) => edge.source === "entry_ts" && edge.relation === "imports_from",
    );

    expect(importEdge?.target).toBe("utils_ts");
  });

  it("resolves aliased Svelte dynamic imports via tsconfig paths", async () => {
    mkdirSync(join(dir, "src", "routes"), { recursive: true });
    mkdirSync(join(dir, "src", "lib"), { recursive: true });
    writeFileSync(
      join(dir, "tsconfig.json"),
      [
        "{",
        "  /* SvelteKit-style config */",
        '  "compilerOptions": {',
        '    "paths": {',
        '      "$lib/*": ["src/lib/*"],',
        "    },",
        "  },",
        "}",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(dir, "src", "routes", "+page.svelte"),
      [
        "<script>",
        "  export async function loadWidget() {",
        "    return import('$lib/widget');",
        "  }",
        "</script>",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "src", "lib", "widget.ts"),
      [
        "export function renderWidget() {",
        "  return 1;",
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([
      join(dir, "src", "routes", "+page.svelte"),
      join(dir, "src", "lib", "widget.ts"),
    ]);

    const pageNode = result.nodes.find((node) => node.label === "+page.svelte");
    const widgetNode = result.nodes.find((node) => node.label === "widget.ts");
    const importEdge = result.edges.find(
      (edge) => edge.source === pageNode?.id && edge.target === widgetNode?.id && edge.relation === "imports_from",
    );

    expect(pageNode?.id).toBeTruthy();
    expect(widgetNode?.id).toBeTruthy();
    expect(importEdge).toBeDefined();
  });

  it("keeps symbol node IDs distinct for same-named files in different directories", async () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "src", "index.ts"), "export function setup() { return 1; }\n");
    writeFileSync(join(dir, "tests", "index.ts"), "export function setup() { return 2; }\n");

    const result = await extract([
      join(dir, "src", "index.ts"),
      join(dir, "tests", "index.ts"),
    ]);

    const setupNodes = result.nodes.filter((node) => node.label === "setup()");
    expect(setupNodes).toHaveLength(2);
    expect(new Set(setupNodes.map((node) => node.id)).size).toBe(2);
  });
});
