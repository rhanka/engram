import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { pdfjsGlyphData } from "../scripts/pdfjs-glyph-data.mjs";

const root = join(import.meta.dirname, "..");
const pdfjs = join(dirname(createRequire(import.meta.url).resolve("unpdf")), "pdfjs.mjs");

describe("published PDF.js glyph data", () => {
  it("preserves every upstream glyph assignment as a JSON dictionary", () => {
    const original = readFileSync(pdfjs, "utf8");
    const factory = original.match(/function\(([$\w]+)\)\{\1\.A=65,\1\.AE=198,[^{}]+\}/)![0];
    const converted = pdfjsGlyphData(original);
    const jsonFactory = converted.match(/function\(([$\w]+)\)\{Object\.assign\(\1, JSON\.parse\([^\n]+?\)\);\}/)![0];
    const before = Object.create(null), after = Object.create(null);
    runInNewContext(`(${factory})`)(before);
    runInNewContext(`(${jsonFactory})`)(after);
    expect(Object.keys(before).length).toBeGreaterThan(4000);
    expect(Object.getOwnPropertyDescriptors(after)).toEqual(Object.getOwnPropertyDescriptors(before));
    expect(Object.keys(after)).toEqual(Object.keys(before));
  });

  it("passes the unchanged closure scanner without relying on JIT stack optimizations", () => {
    execFileSync(process.execPath, ["--jitless", "--input-type=module", "-e", `
      import { readFileSync } from "node:fs";
      import { pdfjsGlyphData } from "./scripts/pdfjs-glyph-data.mjs";
      import { staticEdges } from "./scripts/substrate-tarball-acceptance.mjs";
      staticEdges(pdfjsGlyphData(readFileSync(${JSON.stringify(pdfjs)}, "utf8")));
    `], { cwd: root, stdio: "pipe" });
  });
});
