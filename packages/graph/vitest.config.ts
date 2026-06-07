import { defineConfig } from "vitest/config";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
