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
    entry: { index: "src/index.ts", "llm-mesh": "src/llm-mesh.ts", "memory-tools": "src/memory-tools/index.ts", "time-reference": "src/time-reference/index.ts", "memory-substrate": "src/memory-substrate/index.ts", "mcp-memory": "src/mcp-memory/index.ts", "registry/manifest": "src/registry/manifest.ts", "registry/definitions": "src/registry/definitions.ts", "registry/validator": "src/registry/validator.ts" },
    format: ["esm"],
    esbuildPlugins: [jsonPdfjsGlyphs],
    // DTS-only self-reference mapping: `src/registry/definitions.ts` lazily
    // imports the public subpath `@sentropic/engram/mcp-memory`, deliberately
    // kept external in the JS bundle (see `external` above). A clean checkout
    // has no dist/, so the DTS step cannot resolve it through the package
    // self-reference; map it to the source entry for types only. Scoped to
    // this DTS step: the runtime specifier stays external, no provider copy
    // is inlined. Chosen over ordering the builds because the entries of this
    // block compile in parallel workers, so an order-based fix would be racy.
    dts: {
      compilerOptions: {
        types: ['node'],
        paths: { '@sentropic/engram/mcp-memory': ['./src/mcp-memory/index.ts'] },
      },
    },
    sourcemap: true,
    clean: true,
    target: "node20",
    // Shared provenance (L4): entries that share the private fenced-store
    // registry must resolve to ONE module instance. Splitting puts the
    // shared internals in one internal chunk imported by both ESM entries.
    splitting: true,
    external: optionalRuntimeDeps,
  },
  {
    // CJS build without splitting, as 0.21.3 did: `import.meta.url` would
    // otherwise survive in the CJS output and crash every require() caller.
    // Same entries, externals, plugins and target as the ESM block above.
    // No DTS here (generated once, by the ESM block) and no clean here (the
    // ESM block owns the single clean so it cannot wipe this block's output).
    entry: { index: "src/index.ts", "llm-mesh": "src/llm-mesh.ts", "memory-tools": "src/memory-tools/index.ts", "time-reference": "src/time-reference/index.ts", "memory-substrate": "src/memory-substrate/index.ts", "mcp-memory": "src/mcp-memory/index.ts", "registry/manifest": "src/registry/manifest.ts", "registry/definitions": "src/registry/definitions.ts", "registry/validator": "src/registry/validator.ts" },
    format: ["cjs"],
    esbuildPlugins: [jsonPdfjsGlyphs],
    dts: false,
    sourcemap: true,
    clean: false,
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
