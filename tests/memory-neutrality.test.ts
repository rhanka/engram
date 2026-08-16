import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

function rootDependencies(): string[] {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
  return ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
    .flatMap((section) => Object.keys((manifest[section] ?? {}) as Record<string, unknown>));
}

describe("memory neutrality", () => {
  it("packed dependency/import closure is one-way and emitted d.ts/schema uses only the normative vocabulary", () => {
    const consumerNamespace = "@sen" + "tropic/";
    const consumerDependencies = rootDependencies().filter((dependency) => dependency.startsWith(consumerNamespace));
    const declarations = [emittedDeclaration("graphify-memory/contracts/index.ts")];
    const legacyPort = join(root, "src", "memory-producer-port.ts");
    if (existsSync(legacyPort)) declarations.push(emittedDeclaration("src/memory-producer-port.ts"));
    const forbiddenIdentifiers = [consumerNamespace, "h2" + "a"];
    const found = forbiddenIdentifiers.filter((identifier) => declarations.some((declaration) => declaration.includes(identifier)));

    const violations = [
      ...consumerDependencies.map((dependency) => `dependency:${dependency}`),
      ...found.map((identifier) => `emitted-declaration:${identifier}`),
    ];

    expect(
      violations,
      "packed dependency/import closure and emitted public declarations must not retain consumer identifiers",
    ).toEqual([]);
  });

  it("evaluator and topology-shaped public objects are rejected even without forbidden imports", () => {
    const legacyPort = join(root, "src", "memory-producer-port.ts");
    const declarations = [emittedDeclaration("graphify-memory/contracts/index.ts")];
    if (existsSync(legacyPort)) declarations.push(emittedDeclaration("src/memory-producer-port.ts"));
    const forbiddenFields = [
      "principal_owner",
      "leg1_verdict_ref",
      "leg2_verdict_ref",
      "independence_attestation",
      "requestingPrincipal",
      "review_status",
    ];
    const found = forbiddenFields.filter((field) => declarations.some((declaration) => declaration.includes(field)));

    expect(found, "public declarations must not expose evaluator or authority-topology fields").toEqual([]);
  });
});
