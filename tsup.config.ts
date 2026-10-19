import { defineConfig } from "tsup";

const optionalRuntimeDeps = [
  "@mixmark-io/domino",
  "@sentropic/agent-stats-core",
  "@sentropic/agent-stats-core/*",
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
    entry: { index: "src/index.ts", "llm-mesh": "src/llm-mesh.ts", "memory-tools": "src/memory-tools/index.ts", "time-reference": "src/time-reference/index.ts", "memory-substrate": "src/memory-substrate/index.ts" },
    format: ["esm", "cjs"],
    dts: { compilerOptions: { types: ['node'] } },
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
    format: ["esm"],
    sourcemap: true,
    target: "node20",
    splitting: false,
    external: optionalRuntimeDeps,
  },
]);
