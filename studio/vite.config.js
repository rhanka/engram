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
export default defineConfig(async () => ({
  base: "./",
  plugins: [svelte(), ...(await singleFilePlugins())],
  resolve: {
    alias: {
      "@sentropic/graph": resolve(here, "../packages/graph/src/index.ts"),
      // Pure, DOM-free deterministic force layout (honors fx/fy pins). Reused by
      // the reconciliation view to arrange the local subgraph around the pinned
      // twins. Same module the server build/export uses for scene.json.
      "@graphify/graph-layout": resolve(here, "../src/graph-layout.ts"),
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
