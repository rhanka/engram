import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectFiles, extract, extractWithDiagnostics } from "../src/extract.js";

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

  it("collects Markdown, MDX and Quarto structural documents", () => {
    const files = ["guide.md", "component.mdx", "notebook.qmd"];

    for (const file of files) {
      writeFileSync(join(dir, file), "# Title\n\n```ts\nconst value = 1;\n```\n");
    }

    expect(collectFiles(dir).map((p) => p.split("/").pop()).sort()).toEqual(files.sort());
  });

  it("collects selected no-Python upstream fallback language extensions", () => {
    const files = ["Spec.groovy", "build.gradle", "module.luau", "analysis.R", "solver.F90"];

    for (const file of files) {
      writeFileSync(join(dir, file), "function fallbackFixture() { return 1; }\n");
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

  it("resolves tsconfig path aliases through an extends chain", async () => {
    mkdirSync(join(dir, "src", "lib"), { recursive: true });
    writeFileSync(
      join(dir, "tsconfig.base.json"),
      [
        "{",
        '  "compilerOptions": {',
        '    "baseUrl": ".",',
        '    "paths": {',
        '      "@lib/*": ["src/lib/*"]',
        "    }",
        "  }",
        "}",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(dir, "tsconfig.json"),
      [
        "{",
        '  "extends": "./tsconfig.base.json"',
        "}",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(dir, "src", "entry.ts"),
      [
        "import { helper } from '@lib/helper';",
        "export function alpha() {",
        "  return helper();",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "src", "lib", "helper.ts"),
      [
        "export function helper() {",
        "  return 1;",
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([
      join(dir, "src", "entry.ts"),
      join(dir, "src", "lib", "helper.ts"),
    ]);

    const importEdge = result.edges.find(
      (edge) => edge.source === "entry_ts" && edge.relation === "imports_from",
    );

    expect(importEdge?.target).toBe("lib_helper_ts");
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

  it("resolves template-layer Svelte dynamic imports via tsconfig paths", async () => {
    mkdirSync(join(dir, "src", "routes"), { recursive: true });
    mkdirSync(join(dir, "src", "lib"), { recursive: true });
    writeFileSync(
      join(dir, "tsconfig.json"),
      [
        "{",
        '  "compilerOptions": {',
        '    "paths": {',
        '      "$lib/*": ["src/lib/*"]',
        "    }",
        "  }",
        "}",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(dir, "src", "routes", "+layout.svelte"),
      [
        "<div>",
        "  {#await import('$lib/widget') then widget}",
        "    <svelte:component this={widget.default} />",
        "  {/await}",
        "</div>",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(dir, "src", "lib", "widget.ts"),
      [
        "export default function Widget() {",
        "  return 1;",
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([
      join(dir, "src", "routes", "+layout.svelte"),
      join(dir, "src", "lib", "widget.ts"),
    ]);

    const layoutNode = result.nodes.find((node) => node.label === "+layout.svelte");
    const widgetNode = result.nodes.find((node) => node.label === "widget.ts");
    const importEdge = result.edges.find(
      (edge) => edge.source === layoutNode?.id && edge.target === widgetNode?.id && edge.relation === "imports_from",
    );

    expect(layoutNode?.id).toBeTruthy();
    expect(widgetNode?.id).toBeTruthy();
    expect(importEdge).toBeDefined();
  });

  it("continues extraction when a file overflows recursive AST traversal", async () => {
    const deepPath = join(dir, "deep.ts");
    const normalPath = join(dir, "normal.ts");
    const depth = 12_000;
    const deepExpression = `${"(".repeat(depth)}1${")".repeat(depth)}`;
    writeFileSync(deepPath, `export const value = ${deepExpression};\n`, "utf-8");
    writeFileSync(normalPath, "export function keepMe() { return 1; }\n", "utf-8");

    const result = await extractWithDiagnostics([deepPath, normalPath]);

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: deepPath,
          error: expect.stringMatching(/call stack|recursion/i),
        }),
      ]),
    );
    expect(result.extraction.nodes.some((node) => node.source_file === normalPath)).toBe(true);
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

  it("extracts CommonJS require imports and local required symbols", async () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "entry.js"),
      [
        "const utils = require('./utils');",
        "const { helper, renamed: localRenamed } = require('./utils');",
        "const pick = require('./utils').renamed;",
        "var legacy = require('./utils');",
        "function run() {",
        "  return helper() + pick() + legacy.renamed();",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "src", "utils.js"),
      [
        "function helper() { return 1; }",
        "function renamed() { return 2; }",
        "module.exports = { helper, renamed };",
        "",
      ].join("\n"),
    );

    const result = await extract([
      join(dir, "src", "entry.js"),
      join(dir, "src", "utils.js"),
    ]);

    const entryNode = result.nodes.find((node) => node.label === "entry.js");
    const utilsNode = result.nodes.find((node) => node.label === "utils.js");
    const helperNode = result.nodes.find((node) => node.label === "helper()");
    const renamedNode = result.nodes.find((node) => node.label === "renamed()");
    const importEdges = result.edges.filter(
      (edge) => edge.source === entryNode?.id && edge.target === utilsNode?.id && edge.relation === "imports_from",
    );
    const symbolTargets = result.edges
      .filter((edge) => edge.source === entryNode?.id && edge.relation === "imports")
      .map((edge) => edge.target);

    expect(entryNode?.id).toBeTruthy();
    expect(utilsNode?.id).toBeTruthy();
    expect(helperNode?.id).toBeTruthy();
    expect(renamedNode?.id).toBeTruthy();
    expect(importEdges.length).toBeGreaterThanOrEqual(4);
    expect(symbolTargets).toContain(helperNode?.id);
    expect(symbolTargets).toContain(renamedNode?.id);
  });

  it("extracts TypeScript declarations, module constants, and constructor calls", async () => {
    const servicePath = join(dir, "service.ts");
    writeFileSync(
      servicePath,
      [
        "interface Service { run(): number }",
        "type ServiceFactory = () => Service;",
        "enum Status { Ready }",
        "class Worker implements Service {",
        "  run() { return 1; }",
        "}",
        "export const registry = new Worker();",
        "export function buildWorker() {",
        "  return new Worker();",
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([servicePath]);
    const labels = result.nodes.map((node) => node.label);
    const workerNode = result.nodes.find((node) => node.label === "Worker");
    const buildNode = result.nodes.find((node) => node.label === "buildWorker()");
    const constructorCall = result.edges.find(
      (edge) => edge.source === buildNode?.id && edge.target === workerNode?.id && edge.relation === "calls",
    );

    expect(labels).toContain("Service");
    expect(labels).toContain("ServiceFactory");
    expect(labels).toContain("Status");
    expect(labels).toContain("registry");
    expect(constructorCall).toBeDefined();
  });

  it("uses TSX grammar for JSX call expressions", async () => {
    const viewPath = join(dir, "View.tsx");
    writeFileSync(
      viewPath,
      [
        "function formatName(name: string) {",
        "  return name.toUpperCase();",
        "}",
        "export function Card() {",
        "  return <section>{formatName('Ada')}</section>;",
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([viewPath]);
    const formatNode = result.nodes.find((node) => node.label === "formatName()");
    const cardNode = result.nodes.find((node) => node.label === "Card()");
    const jsxCall = result.edges.find(
      (edge) => edge.source === cardNode?.id && edge.target === formatNode?.id && edge.relation === "calls",
    );

    expect(formatNode?.id).toBeTruthy();
    expect(cardNode?.id).toBeTruthy();
    expect(jsxCall).toBeDefined();
  });

  it("extracts Markdown heading hierarchy and fenced code blocks", async () => {
    const guidePath = join(dir, "guide.md");
    writeFileSync(
      guidePath,
      [
        "# Guide",
        "",
        "Intro text.",
        "",
        "## Install",
        "",
        "```ts",
        "const value = 1;",
        "```",
        "",
        "### Verify",
        "",
      ].join("\n"),
    );

    const result = await extract([guidePath]);
    const fileNode = result.nodes.find((node) => node.label === "guide.md");
    const guideNode = result.nodes.find((node) => node.label === "Guide");
    const installNode = result.nodes.find((node) => node.label === "Install");
    const verifyNode = result.nodes.find((node) => node.label === "Verify");
    const codeNode = result.nodes.find((node) => node.label.startsWith("code:ts"));

    expect(fileNode?.id).toBeTruthy();
    expect(guideNode?.id).toBeTruthy();
    expect(installNode?.id).toBeTruthy();
    expect(verifyNode?.id).toBeTruthy();
    expect(codeNode?.id).toBeTruthy();
    expect(result.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: fileNode?.id, target: guideNode?.id, relation: "contains" }),
      expect.objectContaining({ source: guideNode?.id, target: installNode?.id, relation: "contains" }),
      expect.objectContaining({ source: installNode?.id, target: verifyNode?.id, relation: "contains" }),
      expect.objectContaining({ source: installNode?.id, target: codeNode?.id, relation: "contains" }),
    ]));
  });

  it("extracts portable fallback nodes for Groovy, R and Fortran without Python dependencies", async () => {
    const specPath = join(dir, "DemoSpec.groovy");
    const rPath = join(dir, "analysis.R");
    const fortranPath = join(dir, "solver.F90");
    writeFileSync(
      specPath,
      [
        "class DemoSpec {",
        "  def \"does useful work\"() {",
        "    expect: true",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(rPath, "score_value <- function(x) x + 1\n");
    writeFileSync(
      fortranPath,
      [
        "module MathMod",
        "contains",
        "subroutine solve_case()",
        "end subroutine solve_case",
        "end module MathMod",
        "",
      ].join("\n"),
    );

    const result = await extract([specPath, rPath, fortranPath]);
    const labels = result.nodes.map((node) => node.label);

    expect(labels).toContain("DemoSpec");
    expect(labels).toContain("does useful work()");
    expect(labels).toContain("score_value()");
    expect(labels).toContain("MathMod");
    expect(labels).toContain("solve_case()");
  });

  it("extracts SQL ALTER TABLE foreign keys and schema-qualified table names", async () => {
    const schemaPath = join(dir, "schema.sql");
    writeFileSync(schemaPath, [
      "CREATE TABLE Sales.Customer (",
      "  CustomerID SERIAL PRIMARY KEY,",
      "  Name TEXT NOT NULL",
      ");",
      "",
      "CREATE TABLE Sales.SalesOrder (",
      "  OrderID SERIAL PRIMARY KEY,",
      "  CustomerID INT REFERENCES Sales.Customer(CustomerID)",
      ");",
      "",
      "ALTER TABLE Sales.SalesOrder ADD CONSTRAINT fk_cust FOREIGN KEY (CustomerID) REFERENCES Sales.Customer(CustomerID);",
      "",
    ].join("\n"));

    const result = await extract([schemaPath]);
    const labels = result.nodes.map((node) => node.label);
    const references = result.edges.filter((edge) => edge.relation === "references");
    const nodeIds = new Set(result.nodes.map((node) => node.id));

    expect(labels).toContain("Sales.Customer");
    expect(labels).toContain("Sales.SalesOrder");
    expect(references.length).toBeGreaterThanOrEqual(2);
    for (const edge of references) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
    expect(references.some((edge) =>
      result.nodes.find((node) => node.id === edge.source)?.label === "Sales.SalesOrder" &&
      result.nodes.find((node) => node.id === edge.target)?.label === "Sales.Customer"
    )).toBe(true);
  });
});
