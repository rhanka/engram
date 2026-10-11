import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const memoryRoot = join(root, "engram-memory");
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

// The package program: every module tsc sees from the package tsconfigs,
// main plus contracts (the ./contracts subpath is emitted by the contracts
// build, not the main one).
function packageProgram(): Set<string> {
  const listed: string[] = [];
  for (const config of ["tsconfig.json", "contracts/tsconfig.json"]) {
    const raw = execFileSync(process.execPath, [
      tsc, "-p", join(memoryRoot, config), "--listFilesOnly",
    ], { cwd: root, encoding: "utf8" });
    listed.push(...raw.split("\n").map((line) => line.trim()).filter((line) => line.length > 0));
  }
  // tsc --listFilesOnly emits "/" separators even on Windows while join()
  // uses "\" there: compare normalized forms so the check holds on both.
  return new Set(listed.map((line) => line.replace(/\\/g, "/")));
}

// Maps an export artifact to the package source module it is built from:
// ./dist/<name>.js|.d.ts -> engram-memory/<name>.ts,
// ./contracts/dist/<name>.d.ts -> engram-memory/contracts/<name>.ts.
// Anything else is an explicit failure (fail-closed on new artifact forms).
function exportSource(artifact: string): string {
  let match = artifact.match(/^\.\/dist\/(.+)\.(js|d\.ts)$/);
  if (match) return join(root, "engram-memory", `${match[1]}.ts`);
  match = artifact.match(/^\.\/contracts\/dist\/(.+)\.d\.ts$/);
  if (match) return join(root, "engram-memory", "contracts", `${match[1]}.ts`);
  throw new Error(`export artifact has an unknown form, extend exportSource first: ${artifact}`);
}

describe("engram-memory package exports", () => {
  it("every engram-memory export subpath is built from a module of the package program", () => {
    const pkg = JSON.parse(readFileSync(join(memoryRoot, "package.json"), "utf8")) as {
      exports: Record<string, Record<string, string>>;
    };
    const program = packageProgram();

    // The include list must not dangle: every entry resolves to an existing
    // module (catches the deleted service.ts).
    const tsconfig = JSON.parse(readFileSync(join(memoryRoot, "tsconfig.json"), "utf8")) as {
      include: string[];
    };
    for (const entry of tsconfig.include) {
      expect(
        existsSync(join(memoryRoot, entry)),
        `tsconfig include must resolve to an existing module (no dangling entry): ${entry}`,
      ).toBe(true);
    }

    for (const [subpath, targets] of Object.entries(pkg.exports)) {
      const artifacts = [...new Set(Object.values(targets))];
      expect(artifacts.length, `${subpath} must map to at least one artifact`).toBeGreaterThan(0);
      for (const artifact of artifacts) {
        const source = exportSource(artifact).replace(/\\/g, "/");
        expect(
          program.has(source),
          `${subpath} -> ${artifact} is not built from a module of the package program (source: ${source})`,
        ).toBe(true);
        expect(
          existsSync(join(memoryRoot, artifact)),
          `package build must emit ${artifact} (run npm --prefix engram-memory run build)`,
        ).toBe(true);
      }
    }
  });
});
