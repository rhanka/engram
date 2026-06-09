/**
 * Track F-0820-0827 M17 — detect() must sort file lists lexicographically for
 * deterministic graph output (upstream 8db19d6, #1090).
 *
 * OS filesystem walk order is non-deterministic (b-tree / inode order varies
 * across mounts and cache states). Sorting the gathered file list stabilises
 * graph.json without changing any semantics.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { detect } from "../src/detect.js";

describe("F-0820-0827 M17 — detect() file list lexicographic sort (8db19d6)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-detect-sort-"));
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("returns code files in lexicographic order regardless of filesystem order", () => {
    // Create files whose names would be returned in non-sorted order by
    // a naive walk on most filesystems (z before a in ext4 hash order).
    for (const name of ["zeta.py", "alpha.py", "mango.py", "beta.py"]) {
      writeFileSync(join(dir, name), `# ${name}\n`);
    }

    const result = detect(dir);
    const names = result.files.code.map((f) => f.slice(f.lastIndexOf("/") + 1));

    // Must be in lexicographic order
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it("returns files in subdirectories in lexicographic order across dirs", () => {
    mkdirSync(join(dir, "subz"), { recursive: true });
    mkdirSync(join(dir, "suba"), { recursive: true });
    writeFileSync(join(dir, "subz", "file.py"), "# z\n");
    writeFileSync(join(dir, "suba", "file.py"), "# a\n");
    writeFileSync(join(dir, "root.py"), "# root\n");

    const result = detect(dir);
    const paths = result.files.code;

    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });

  it("each per-FileType list is also sorted", () => {
    writeFileSync(join(dir, "z.py"), "# z\n");
    writeFileSync(join(dir, "a.py"), "# a\n");
    writeFileSync(join(dir, "z.md"), "# z\n");
    writeFileSync(join(dir, "a.md"), "# a\n");

    const result = detect(dir);

    for (const [ftype, list] of Object.entries(result.files)) {
      if (list.length < 2) continue;
      const sorted = [...list].sort();
      expect(list, `${ftype} file list must be sorted`).toEqual(sorted);
    }
  });
});
