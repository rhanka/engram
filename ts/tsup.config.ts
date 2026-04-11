import { defineConfig } from "tsup";

const optionalRuntimeDeps = [
  "@mixmark-io/domino",
  "@modelcontextprotocol/sdk",
  "@modelcontextprotocol/sdk/*",
  "chokidar",
  "exceljs",
  "mammoth",
  "neo4j-driver",
  "pdf-parse",
  "turndown",
];

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node20",
    splitting: false,
    external: optionalRuntimeDeps,
  },
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: true,
    target: "node20",
    splitting: false,
    external: optionalRuntimeDeps,
  },
  {
    entry: { "skill-runtime": "src/skill-runtime.ts" },
    format: ["esm"],
    sourcemap: true,
    target: "node20",
    splitting: false,
    external: optionalRuntimeDeps,
  },
]);
