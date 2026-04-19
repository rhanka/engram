import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
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
});
