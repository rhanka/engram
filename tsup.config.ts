import { defineConfig } from "tsup";
import { readFile } from "node:fs/promises";
import { pdfjsGlyphData } from "./scripts/pdfjs-glyph-data.mjs";

const jsonPdfjsGlyphs = {
  name: "json-pdfjs-glyphs",
  setup(build) {
    build.onLoad({ filter: /[\\/]unpdf[\\/]dist[\\/]pdfjs\.mjs$/ }, async ({ path }) => ({
      loader: "js", contents: pdfjsGlyphData(await readFile(path, "utf8")),
    }));
  },
};

// file-type's two literal imports otherwise go through import(specifier).
// Resolve that helper while bundling; the published closure stays inspectable.
const literalFileTypeImports = {
  name: "literal-file-type-imports",
  setup(build: { onLoad: (filter: { filter: RegExp }, load: (args: { path: string }) => Promise<{ contents: string; loader: "js" }>) => void }) {
    build.onLoad({ filter: /[\\/]file-type[\\/]source[\\/]index\.js$/ }, async ({ path }) => {
      const source = await readFile(path, "utf8");
      const helper = "function importAtRuntime(specifier) {\n\treturn import(specifier);\n}";
      if (!source.includes(helper)) throw new Error("file-type import helper changed; verify its closed targets");
      return { loader: "js", contents: source.replace(helper, `function importAtRuntime(specifier) {
        if (specifier === "node:fs/promises") return import("node:fs/promises");
        if (specifier === "strtok3") return import("strtok3");
        throw new Error("unsupported file-type import");
      }`) };
    });
  },
};

const optionalRuntimeDeps = [
  "@mixmark-io/domino",
  "@sentropic/agent-stats-core",
  "@sentropic/agent-stats-core/*",
  "@sentropic/engram/mcp-memory",
  "@sentropic/mcp-broker",
  "@sentropic/mcp-broker/*",
  "@sentropic/mcp-platform",
  "@sentropic/mcp-platform/*",
  "better-sqlite3",
  "fs-ext",
  "@modelcontextprotocol/sdk",
  "@modelcontextprotocol/sdk/*",
  "chokidar",
  "exceljs",
  "mammoth",
  "neo4j-driver",
  "pdf-parse",
  "faster-whisper-ts",
  "turndown",
];

export default defineConfig([
  {
    entry: { index: "src/index.ts", "llm-mesh": "src/llm-mesh.ts", "memory-tools": "src/memory-tools/index.ts", "time-reference": "src/time-reference/index.ts", "memory-substrate": "src/memory-substrate/index.ts", "mcp-memory": "src/mcp-memory/index.ts", "registry/manifest": "src/registry/manifest.ts", "registry/definitions": "src/registry/definitions.ts" },
    format: ["esm", "cjs"],
    esbuildPlugins: [jsonPdfjsGlyphs],
    dts: { compilerOptions: { types: ['node'] } },
    sourcemap: true,
    clean: true,
    target: "node20",
    splitting: false,
    external: optionalRuntimeDeps,
  },
  {
    entry: { cli: "src/cli.ts" },
    esbuildPlugins: [literalFileTypeImports, jsonPdfjsGlyphs],
    format: ["esm"],
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: true,
    target: "node20",
    splitting: false,
    external: optionalRuntimeDeps,
  },
  {
    entry: { "cli-compat": "src/cli-compat.ts" },
    format: ["esm"],
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: false,
    target: "node20",
    splitting: false,
    external: optionalRuntimeDeps,
  },
  {
    entry: { "skill-runtime": "src/skill-runtime.ts" },
    esbuildPlugins: [jsonPdfjsGlyphs],
    format: ["esm"],
    sourcemap: true,
    target: "node20",
    splitting: false,
    external: optionalRuntimeDeps,
  },
]);
