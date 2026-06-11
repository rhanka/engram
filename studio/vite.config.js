import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// The built SPA is served by `graphify ontology studio` from a static route.
// `base: "./"` keeps asset URLs relative so the bundle works regardless of the
// mount path the studio server picks.
export default defineConfig({
  base: "./",
  plugins: [svelte()],
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
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/tests/**/*.test.js"],
  },
});
