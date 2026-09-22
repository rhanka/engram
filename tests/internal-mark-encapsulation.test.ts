import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// §5.9 encapsulation guard. The in-process marks are the whole trust boundary: if any non-test source file could
// import markInMemoryStoreV1 (or, from v5-b, markFencedStoreV1) it could stamp an arbitrary store and defeat the
// gate. The package barrel and package.json `exports` already keep them off the host surface; this test keeps them
// off the IN-REPO surface too — only their defining module and their one sanctioned caller may name them. Tests are
// exempt (a test helper legitimately marks bespoke embedded fakes). If this fails, a new importer leaked the mark.
const MARKS: ReadonlyArray<{ symbol: string; allowed: ReadonlyArray<string> }> = [
  // store-factory.ts DEFINES it; memory-store.ts is the only production caller.
  { symbol: "markInMemoryStoreV1", allowed: ["graphify-memory/store-factory.ts", "graphify-memory/memory-store.ts"] },
];

const ROOTS = ["graphify-memory", "src"];
const SKIP_DIRS = new Set(["node_modules", "dist", "tests", ".git"]);

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts") && !entry.endsWith(".test.ts")) out.push(full);
    }
  };
  walk(root);
  return out;
}

describe("internal §5.9 marks stay encapsulated", () => {
  const files = ROOTS.flatMap(sourceFiles);

  it("scans a non-empty set of source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const { symbol, allowed } of MARKS) {
    it(`only ${allowed.join(", ")} may reference ${symbol}`, () => {
      const referencing = files.filter((file) => readFileSync(file, "utf8").includes(symbol)).map((file) => file.replace(/\\/g, "/"));
      const unexpected = referencing.filter((file) => !allowed.some((ok) => file.endsWith(ok)));
      expect(unexpected).toEqual([]);
      // Not vacuous: the sanctioned files must actually still reference the mark (guards a silent rename/drop).
      for (const ok of allowed) expect(referencing.some((file) => file.endsWith(ok))).toBe(true);
    });
  }
});
