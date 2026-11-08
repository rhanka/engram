/**
 * L4 shared-provenance guard: exactly ONE private provenance registry across
 * the public ESM entries that share it.
 *
 * Regression test for the duplicated fenced-store WeakSet: with self-contained
 * bundles, `dist/mcp-memory.js` and `dist/memory-substrate.js` each carried
 * their own `fencedFactoryStores`/`inMemoryStores`, so a store opened through
 * one entry was unknown to the other (CAPABILITY_UNAVAILABLE). With code
 * splitting the shared internals live in one internal chunk imported by both
 * entries. The gate stays private: no public export of the WeakSet or of any
 * internal registry function.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const FENCED_DEF = /fencedFactoryStores\s*=\s*(?:\/\*[^*]*\*\/\s*)?new WeakSet/;
const IN_MEMORY_DEF = /inMemoryStores\s*=\s*(?:\/\*[^*]*\*\/\s*)?new WeakSet/;
/** Internal registry surface: never a public export of either entry. */
const INTERNAL_NAMES = [
  "fencedFactoryStores",
  "inMemoryStores",
  "markFencedStoreV1",
  "markInMemoryStoreV1",
  "verifyStoreProvenance",
  "isFencedFactoryStoreV1",
];

function esmModules(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".map")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "studio-app") continue;
      out.push(...esmModules(full));
      continue;
    }
    if (name.endsWith(".js") && !name.endsWith(".cjs")) out.push(full);
  }
  return out;
}

function definers(pattern: RegExp): string[] {
  return esmModules(dist).filter((file) => pattern.test(readFileSync(file, "utf8")));
}

describe("shared provenance registry (L4)", () => {
  it("defines the fenced-store WeakSet in exactly one ESM module file", () => {
    const found = definers(FENCED_DEF);
    expect(found.map((file) => file.replace(`${dist}/`, ""))).toHaveLength(1);
  });

  it("defines the in-memory-store WeakSet in exactly one ESM module file", () => {
    const found = definers(IN_MEMORY_DEF);
    expect(found.map((file) => file.replace(`${dist}/`, ""))).toHaveLength(1);
  });

  it("both public entries resolve to the shared definition, never their own", () => {
    const fenced = definers(FENCED_DEF);
    const inMemory = definers(IN_MEMORY_DEF);
    expect(fenced).toHaveLength(1);
    expect(inMemory).toHaveLength(1);
    expect(fenced[0]).toBe(inMemory[0]);
    const sharedBase = fenced[0]!.split("/").pop()!;
    for (const entry of ["memory-substrate.js", "mcp-memory.js"]) {
      const content = readFileSync(join(dist, entry), "utf8");
      expect(content, `${entry} must not define its own registry`).not.toMatch(FENCED_DEF);
      expect(content, `${entry} must not define its own registry`).not.toMatch(IN_MEMORY_DEF);
      expect(content, `${entry} must import the shared module`).toContain(sharedBase);
    }
  });

  it("exposes no registry internals from either public entry source", async () => {
    const substrate = await import("../src/memory-substrate/index.js") as Record<string, unknown>;
    const mcpMemory = await import("../src/mcp-memory/index.js") as Record<string, unknown>;
    for (const name of INTERNAL_NAMES) {
      expect(substrate[name], `substrate exports ${name}`).toBeUndefined();
      expect(mcpMemory[name], `mcp-memory exports ${name}`).toBeUndefined();
    }
  });

  it("keeps the public exports map unchanged", async () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      exports: Record<string, Record<string, string>>;
    };
    const manifest = JSON.parse(readFileSync(join(root, "candidate-manifest.json"), "utf8")) as {
      exports: Record<string, Record<string, string>>;
    };
    expect(Object.keys(pkg.exports).sort()).toEqual(Object.keys(manifest.exports).sort());
    expect(pkg.exports["./archi"]).toEqual({
      types: "./dist/archi.d.ts",
      import: "./dist/archi.js",
    });
    expect(pkg.exports["./archi-mermaid"]).toEqual({
      types: "./dist/archi-mermaid.d.ts",
      import: "./dist/archi-mermaid.js",
    });
    for (const [key, value] of Object.entries(manifest.exports)) {
      expect(pkg.exports[key], `exports[${key}]`).toEqual(value);
    }
    const archi = (await import("../src/archi.js")) as Record<string, unknown>;
    expect(Object.keys(archi).sort()).toEqual([
      "ARCHI_CARDS_CONTENT",
      "ARCHI_CARDS_PIN",
      "ARCHI_DIAGNOSTIC_CODES",
      "ARCHI_MANIFEST_PATH",
      "ARCHI_MMD_PATH",
      "ARCHI_V1",
      "ARCHI_V1_PIN",
      "CONTRACT_PIN",
      "GENERIC_V2",
      "REQUIRED_ACCEPTANCE_KEYS",
      "VIEW_SCHEMA_V2_PIN",
      "archiSummaries",
      "assertValidArchiDiagnosticEnvelope",
      "buildArchiSourceView",
      "canonicalBytes",
      "checkArchi",
      "checkArchiAcceptanceShape",
      "checkArchiDocumentInvariants",
      "checkArchiManifestShape",
      "checkArchiSourceTriple",
      "checkArchiView",
      "checkArchiViewBindingShape",
      "checkArchiViewSpecShape",
      "createAtomicArchiWriter",
      "createGitReadAt",
      "createMemoryArchiWriter",
      "ingestArchitecture",
      "parseStrictIJson",
      "projectArchiCards",
      "toArchiDsDiagnostic",
      "verifyArchiBinding",
      "verifyArchiViewBinding",
    ]);
    expect(typeof archi["checkArchi"]).toBe("function");
    expect(typeof archi["projectArchiCards"]).toBe("function");
    expect(typeof archi["archiSummaries"]).toBe("function");
    expect(typeof archi["buildArchiSourceView"]).toBe("function");
    expect(typeof archi["checkArchiView"]).toBe("function");
    expect(typeof archi["canonicalBytes"]).toBe("function");
    expect(archi["ARCHI_V1_PIN"]).toBeDefined();
    expect(archi["ARCHI_CARDS_PIN"]).toBeDefined();
    expect(archi["CONTRACT_PIN"]).toBeDefined();
    expect(archi["VIEW_SCHEMA_V2_PIN"]).toBeDefined();
    expect(archi["ARCHI_V1"]).toBeDefined();
    expect(archi["GENERIC_V2"]).toBeDefined();
    expect(archi["ARCHI_CARDS_CONTENT"]).toBeDefined();

    const archiMermaid = (await import("../src/archi-mermaid/index.js")) as Record<string, unknown>;
    expect(Object.keys(archiMermaid).sort()).toEqual([
      "ARCHI_CARRIER_DIAGNOSTIC_CODES",
      "ARCHI_MERMAID_DIAGNOSTIC_CODES",
      "checkArchiCarrier",
      "decodeArchiCarrier",
      "encodeArchiCarrier",
      "formatArchiMermaid",
      "parseArchiMermaid",
      "printArchiMermaid",
    ]);
    expect(typeof archiMermaid["parseArchiMermaid"]).toBe("function");
    expect(typeof archiMermaid["printArchiMermaid"]).toBe("function");
    expect(typeof archiMermaid["formatArchiMermaid"]).toBe("function");
    expect(typeof archiMermaid["encodeArchiCarrier"]).toBe("function");
    expect(typeof archiMermaid["decodeArchiCarrier"]).toBe("function");
    expect(typeof archiMermaid["checkArchiCarrier"]).toBe("function");
    expect(archiMermaid["ARCHI_MERMAID_DIAGNOSTIC_CODES"]).toBeDefined();
    expect(archiMermaid["ARCHI_CARRIER_DIAGNOSTIC_CODES"]).toBeDefined();
  });
});
