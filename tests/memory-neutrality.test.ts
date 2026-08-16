import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

function emittedDeclaration(source: string): string {
  const output = mkdtempSync(join(tmpdir(), "memory-contract-declaration-"));
  try {
    execFileSync(process.execPath, [
      tsc,
      "--ignoreConfig",
      source,
      "--declaration",
      "--emitDeclarationOnly",
      "--target", "ES2022",
      "--module", "NodeNext",
      "--moduleResolution", "NodeNext",
      "--skipLibCheck",
      "--outDir", output,
    ], { cwd: root, stdio: "pipe" });
    return readFileSync(join(output, basename(source).replace(/\.ts$/, ".d.ts")), "utf8");
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}

function memoryPackageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return memoryPackageFiles(path);
    return entry.isFile() && statSync(path).size > 0 ? [path] : [];
  });
}

function packedMemoryClosure(): string[] {
  const memoryRoot = join(root, "graphify-memory");
  return memoryPackageFiles(memoryRoot).map((path) => readFileSync(path, "utf8"));
}

describe("memory neutrality", () => {
  it("memory package packed closure and emitted d.ts/schema use only neutral vocabulary", () => {
    const consumerNamespace = "@sen" + "tropic/";
    const closure = [
      ...packedMemoryClosure(),
      emittedDeclaration("graphify-memory/contracts/index.ts"),
    ];
    const forbiddenIdentifiers = [
      consumerNamespace,
      "h2" + "a",
      "principal_owner",
      "leg1_verdict_ref",
      "leg2_verdict_ref",
      "independence_attestation",
      "requestingPrincipal",
      "review_status",
    ];
    const violations = forbiddenIdentifiers.filter((identifier) =>
      closure.some((artifact) => artifact.includes(identifier)),
    );

    expect(
      violations,
      "memory package packed closure, emitted declarations, and schemas must not retain consumer identifiers or evaluator/topology shapes",
    ).toEqual([]);
  });

  it.todo("repo-wide @sentropic/* dependency removal is deferred to the parallel @sentropic decouple track");
});
