import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// The single-file build is gated by GRAPHIFY_STUDIO_SINGLEFILE=1. It is a
// SEPARATE Vite pass (distinct outDir, the vite-plugin-singlefile plugin loaded
// only when the flag is set) that produces a self-contained HTML with all JS and
// CSS inlined. The default `npm run build` (flag unset) keeps emitting the
// MULTI-FILE server bundle (index.html + assets/) BYTE-UNCHANGED — that bundle is
// the artifact `resolveStudioAppDir()` resolves and the live studio server serves
// (INV-2 / INV-4). The two builds never overwrite each other (distinct dirs).
const singleFile = process.env.GRAPHIFY_STUDIO_SINGLEFILE === "1";

// vite-plugin-singlefile is an OPTIONAL dev dependency loaded lazily so the
// default multi-file build does not require it to be installed.
async function singleFilePlugins() {
  if (!singleFile) return [];
  const { viteSingleFile } = await import("vite-plugin-singlefile");
  // useRecommendedBuildConfig keeps a single chunk + inlines all assets; the
  // exporter then injects the window.__GRAPHIFY_BUNDLE__ data script into the
  // resulting self-contained HTML.
  return [viteSingleFile()];
}

// The built SPA is served by `graphify ontology studio` from a static route.
// `base: "./"` keeps asset URLs relative so the bundle works regardless of the
// mount path the studio server picks.
export default defineConfig(async ({ mode }) => ({
  base: "./",
  plugins: [svelte(), ...(await singleFilePlugins())],
  resolve: {
    // Under vitest (mode "test"), prefer the BROWSER build of packages —
    // otherwise `svelte` resolves to its server entry and `mount()` throws
    // (needed by the component render smokes, e.g. citedSourceViewer.test.js).
    // Additive condition, test-mode only: the build output is untouched.
    ...(mode === "test" ? { conditions: ["browser"] } : {}),
    alias: {
      "@sentropic/graph": resolve(here, "../packages/graph/src/index.ts"),
      // Pure, DOM-free deterministic force layout (honors fx/fy pins). Reused by
      // the reconciliation view to arrange the local subgraph around the pinned
      // twins. Same module the server build/export uses for scene.json.
      "@graphify/graph-layout": resolve(here, "../src/graph-layout.ts"),
      // Work-stream C offline retrieval. The answer-pack assembler runs the SAME
      // BM25 + RRF + PPR + specificity/structural-demotion pipeline the CLI/MCP
      // `answer` does, in-browser, over the bundled search-index.json (zero
      // network, no key, no LLM). The whole chain (answer-pack → query/ppr →
      // bm25/rrf → search) is dependency-free pure TS (INV-5), so it bundles into
      // the SPA byte-for-byte with the Node build. search-index.ts is imported
      // type-only by the assembler, so its node:crypto value import is erased.
      "@graphify/retrieval": resolve(here, "../src/retrieval/answer-pack.ts"),
    },
  },
  build: {
    // The single-file pass writes to a DISTINCT dir so it never clobbers the
    // multi-file `dist/`. build-studio-app.mjs lifts dist-singlefile/index.html
    // to dist/studio-template.html (the template the exporter resolves).
    outDir: singleFile ? "dist-singlefile" : "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/tests/**/*.test.js"],
  },
}));
