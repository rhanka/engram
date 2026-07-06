// Upstream e2ef4ef (#1638) — an unresolved bare npm import must not alias onto
// an unrelated same-named local file, producing a confident cross-language
// phantom edge.
//
// `import colors from "tailwindcss/colors"` in a .tsx file used to emit an
// `imports_from` edge to the bare id `colors`, which could collide with any
// unrelated local file/symbol of that stem. The fix namespaces the
// external-import fallback id with the `ref` prefix, so it can never collapse
// to a local node id; the ref target has no node, so build drops it as an
// external reference.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { extract } from "../src/extract.js";
import { buildFromJson } from "../src/build.js";

describe("phantom external import (upstream e2ef4ef #1638)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-phantom-import-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(relative: string, text: string): string {
    const path = join(dir, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    return path;
  }

  it("namespaces an unresolved bare npm import with the ref prefix", async () => {
    const tsx = write(
      "frontend/src/SomeChart.tsx",
      'import colors from "tailwindcss/colors";\n\nexport const CHART_COLOR = colors;\n',
    );

    const extraction = await extract([tsx]);
    const importEdges = extraction.edges.filter((e) => e.relation === "imports_from");
    expect(importEdges.length).toBeGreaterThan(0);
    for (const edge of importEdges) {
      // Must not be the bare last-segment id that collides with a local
      // `colors` file/symbol node.
      expect(edge.target).not.toBe("colors");
      expect(edge.target.startsWith("ref_")).toBe(true);
    }
  });

  it("namespaces an unresolved scoped package import with the ref prefix", async () => {
    const ts = write("src/thing.ts", 'import { util } from "@scope/utils";\n');

    const extraction = await extract([ts]);
    const importEdges = extraction.edges.filter((e) => e.relation === "imports_from");
    expect(importEdges.length).toBeGreaterThan(0);
    for (const edge of importEdges) {
      expect(edge.target).not.toBe("utils");
      expect(edge.target.startsWith("ref_")).toBe(true);
    }
  });

  it("emits no phantom imports_from edge from a .tsx onto an unrelated same-stem python file", async () => {
    const py = write(
      "backend/utils/colors.py",
      "def hex_to_rgb(value):\n    return (0, 0, 0)\n",
    );
    const tsx = write(
      "frontend/src/SomeChart.tsx",
      'import colors from "tailwindcss/colors";\n\nexport const CHART_COLOR = colors.blue;\n',
    );

    const extraction = await extract([py, tsx]);
    const G = buildFromJson(extraction, { root: dir });

    const pyIds = new Set<string>();
    G.forEachNode((node, attrs) => {
      if (String(attrs.source_file ?? "").endsWith("colors.py")) pyIds.add(node);
    });
    expect(pyIds.size).toBeGreaterThan(0);

    G.forEachEdge((_edge, attrs, source, target) => {
      if (attrs.relation !== "imports_from") return;
      const endpoints = [source, target];
      if (!endpoints.some((n) => pyIds.has(n))) return;
      for (const other of endpoints.filter((n) => !pyIds.has(n))) {
        const sf = String(G.getNodeAttribute(other, "source_file") ?? "");
        expect(
          sf.endsWith(".tsx") || sf.endsWith(".ts"),
          `phantom cross-language imports_from edge onto colors.py: ${source} -> ${target}`,
        ).toBe(false);
      }
    });
  });
});
