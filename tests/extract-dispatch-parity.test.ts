// Lot: dispatch/collect parity — upstream 2ab0867 (shebang routing for
// extensionless executables) and 1226c34 (.mts/.cts TypeScript variants).
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { extract, extractJs, extractPython, __testing } from "../src/extract.js";
import { CODE_EXTENSIONS } from "../src/detect.js";

describe("shebang routing for extensionless executables (upstream 2ab0867)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-shebang-dispatch-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("routes a python3 shebang to the python extractor", () => {
    const file = join(dir, "devctl");
    writeFileSync(file, "#!/usr/bin/env python3\ndef main():\n    pass\n");
    chmodSync(file, 0o755);
    expect(__testing.getExtractor(file)).toBe(extractPython);
  });

  it("routes a node shebang to the JS extractor", () => {
    const file = join(dir, "cli");
    writeFileSync(file, "#!/usr/bin/env node\nfunction main() {}\n");
    expect(__testing.getExtractor(file)).toBe(extractJs);
  });

  it("leaves unmapped interpreters (perl) and shebang-less files unrouted", () => {
    const perl = join(dir, "legacy");
    writeFileSync(perl, "#!/usr/bin/env perl\nprint 1;\n");
    expect(__testing.getExtractor(perl)).toBeUndefined();

    const plain = join(dir, "README");
    writeFileSync(plain, "just text\n");
    expect(__testing.getExtractor(plain)).toBeUndefined();
  });

  it("extracts an extensionless python CLI end-to-end", async () => {
    const file = join(dir, "manage");
    writeFileSync(file, "#!/usr/bin/env python3\ndef run_task():\n    return 1\n");
    chmodSync(file, 0o755);

    const extraction = await extract([file]);
    expect(extraction.nodes.map((n) => n.label)).toContain("run_task()");
  });
});

describe(".mts/.cts TypeScript module extensions (upstream 1226c34)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-mts-cts-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("classifies .mts/.cts as code extensions", () => {
    expect(CODE_EXTENSIONS.has(".mts")).toBe(true);
    expect(CODE_EXTENSIONS.has(".cts")).toBe(true);
  });

  it("dispatches .mts/.cts to the JS/TS extractor", () => {
    expect(__testing.getExtractor("mod.mts")).toBe(extractJs);
    expect(__testing.getExtractor("mod.cts")).toBe(extractJs);
  });

  const SOURCE = [
    "export type WidgetId = string;",
    "export interface Widget { id: WidgetId; }",
    "export function makeWidget(): Widget { return { id: \"w\" }; }",
    "",
  ].join("\n");

  it("parses .mts and .cts with the TS grammar (type/interface preserved)", async () => {
    writeFileSync(join(dir, "mod.ts"), SOURCE);
    writeFileSync(join(dir, "mod2.mts"), SOURCE);
    writeFileSync(join(dir, "mod3.cts"), SOURCE);

    const labelsFor = async (name: string): Promise<string[]> => {
      const extraction = await extract([join(dir, name)]);
      return extraction.nodes.map((n) => n.label).filter((l) => l !== name).sort();
    };

    const tsLabels = await labelsFor("mod.ts");
    expect(tsLabels.length).toBeGreaterThan(0);
    expect(await labelsFor("mod2.mts")).toEqual(tsLabels);
    expect(await labelsFor("mod3.cts")).toEqual(tsLabels);
  });
});
