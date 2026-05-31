import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// The built SPA is served by `graphify ontology studio` from a static route.
// `base: "./"` keeps asset URLs relative so the bundle works regardless of the
// mount path the studio server picks.
export default defineConfig({
  base: "./",
  plugins: [svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/tests/**/*.test.js"],
  },
});
