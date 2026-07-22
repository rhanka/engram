/**
 * Compatibility Contract guard (SPEC_STORAGE_BACKENDS.md): importing the
 * public index or any storage module must never evaluate a store driver.
 * Two complementary checks:
 * - static: src/storage/*.ts contains no static import/require of a driver
 *   package (dynamic `import("pkg")` at call time stays allowed);
 * - runtime: a mocked neo4j-driver records whether it gets evaluated while
 *   importing src/index.ts and the storage modules, with a positive control
 *   proving the probe actually trips when the driver is imported.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import Graph from "graphology";

const driverProbe = vi.hoisted(() => ({ evaluated: false }));

vi.mock("neo4j-driver", () => {
  driverProbe.evaluated = true;
  return { default: {} };
});

const storageDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "storage");
const vectorStorageDir = join(storageDir, "vector");

const DRIVER_PACKAGES = [
  "neo4j-driver",
  "@google-cloud/spanner",
  "better-sqlite3",
  "pg",
  "pgvector",
];

const FORBIDDEN_VECTOR_PROVIDER_PACKAGES = [
  "@sentropic/llm-gateway",
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "@mistralai/mistralai",
  "cohere-ai",
  "ollama",
  "openai",
];

/** Recursively collect every .ts file under src/storage (incl. vector/). */
function collectStorageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectStorageFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("storage import guard", () => {
  it("src/storage has no static driver imports", () => {
    const files = collectStorageFiles(storageDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const pkg of DRIVER_PACKAGES) {
        const escaped = pkg.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
        // `import ... from "pkg"` and `export ... from "pkg"`.
        expect(content, `${file} must not statically import ${pkg}`).not.toMatch(
          new RegExp(`(import|export)[^;()]*from\\s*["']${escaped}["']`),
        );
        // Bare side-effect `import "pkg"` (dynamic import("pkg") not matched).
        expect(content, `${file} must not statically import ${pkg}`).not.toMatch(
          new RegExp(`import\\s+["']${escaped}["']`),
        );
        // CJS require("pkg").
        expect(content, `${file} must not require ${pkg}`).not.toMatch(
          new RegExp(`require\\(\\s*["']${escaped}["']\\s*\\)`),
        );
      }
    }
  });

  it("keeps vector storage provider-neutral and gateway-unaware", () => {
    const files = collectStorageFiles(vectorStorageDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const pkg of FORBIDDEN_VECTOR_PROVIDER_PACKAGES) {
        const escaped = pkg.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
        expect(content, `${file} must not import or require ${pkg}`).not.toMatch(
          new RegExp(`(from\\s*|import\\s*\\(|require\\(\\s*)["']${escaped}["']`),
        );
      }
    }
  });

  it("importing the public index and storage modules does not evaluate neo4j-driver", async () => {
    const api = await import("../src/index.js");
    await import("../src/storage/types.js");
    await import("../src/storage/registry.js");
    await import("../src/storage/file.js");
    expect(driverProbe.evaluated).toBe(false);

    // Positive control: the probe trips once the driver is really imported
    // (pushToNeo4j resolves it dynamically), so the assertion above measures
    // evaluation instead of vacuously passing.
    await api
      .pushToNeo4j(new Graph(), "bolt://localhost:7687", "user", "password")
      .catch(() => {});
    expect(driverProbe.evaluated).toBe(true);
  });
});
