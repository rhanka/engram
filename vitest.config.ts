import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
  },
  // Studio lib files (e.g. graphAdapter.js) imported by root tests use the
  // same source aliases the studio vite build defines, so the root vitest run
  // must resolve them too (otherwise tests/studio-scene.test.ts cannot import
  // graphAdapter.js → @graphify/graph-layout). `@sentropic/graph` is NOT
  // aliased: it resolves to the published package from node_modules.
  resolve: {
    alias: {
      "@graphify/graph-layout": resolve(here, "src/graph-layout.ts"),
    },
  },
});
