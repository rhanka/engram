import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { verifyInstalledSemantics, verifyInstalledTypes } from "../scripts/substrate-installed-acceptance.mjs";
import * as installedProof from "../scripts/substrate-installed-acceptance.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function consumer(mutate: (text: string) => string = (text) => text) {
  const dir = mkdtempSync(join(tmpdir(), "substrate-public-proof-"));
  const pkg = join(dir, "node_modules/@sentropic/engram");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@sentropic/engram", type: "module", exports: { "./memory-substrate": { types: "./dist/memory-substrate.d.ts", import: "./entry.js" } } }));
  mkdirSync(join(pkg, "dist"));
  for (const name of readdirSync(join(root, "dist")).filter((name) => name.endsWith(".d.ts"))) {
    writeFileSync(join(pkg, "dist", name), mutate(readFileSync(join(root, "dist", name), "utf8")));
  }
  writeFileSync(join(pkg, "entry.js"), `export function openModuleStorageCanonicalMemoryStoreV1() { throw new Error("PUBLIC_PACKAGE_MUTATION"); }\nexport function createMemoryPortV2() { throw new Error("PUBLIC_PACKAGE_MUTATION"); }`);
  return dir;
}

describe("installed public proof mutations (Class A, binding §10.3)", () => {
  it("rejects an installed dependency that drifted from the pinned closure", () => {
    const dir = consumer();
    try {
      const pinned = { packages: { "node_modules/dependency": { version: "1.0.0", integrity: "sha512:pinned" } } };
      writeFileSync(join(dir, "node_modules/.package-lock.json"), JSON.stringify(pinned));
      expect(installedProof.verifyLockedClosure).toBeTypeOf("function");
      expect(() => installedProof.verifyLockedClosure(dir, pinned)).not.toThrow();
      writeFileSync(join(dir, "node_modules/.package-lock.json"), JSON.stringify({ packages: { "node_modules/dependency": { version: "1.1.0", integrity: "sha512:ambient" } } }));
      expect(() => installedProof.verifyLockedClosure(dir, pinned)).toThrow("locked dependency drift");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("compiles and inventories the consumer's public exports", () => {
    const dir = consumer();
    try { expect(() => verifyInstalledTypes(dir)).not.toThrow(); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each([
    ["missing type", (text: string) => text.replace(", ClockPort,", ",")],
    ["extra type", (text: string) => `${text}\nexport type ExtraPublicType = string;`],
    ["invalid declaration", (text: string) => text.replace("interface ClockPort {", "interface ClockPort extends MissingDeclaration {")],
    ["erased crypto port", (text: string) => text.replace(/interface CryptoPort \{[\s\S]*?\n\}/, "type CryptoPort = unknown;")],
    ...["seal", "open", "destroy", "rotate"].map((method) => [
      `missing crypto ${method}`,
      (text: string) => text.replace(/interface CryptoPort \{[\s\S]*?\n\}/, (block) => block.replace(`${method}(`, `missing_${method}(`)),
    ] as const),
  ] as const)("kills %s in the installed declaration", (_name, mutate) => {
    const dir = consumer(mutate);
    try { expect(() => verifyInstalledTypes(dir)).toThrow(); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each([
    "@sentropic/engram/engram-memory/store-factory",
    "@sentropic/engram/memory-substrate/internal",
    "@sentropic/engram/dist/memory-substrate.js",
  ])("kills a leaked private subpath %s", (specifier) => {
    const dir = consumer();
    try {
      const path = join(dir, "node_modules/@sentropic/engram/package.json");
      const pkg = JSON.parse(readFileSync(path, "utf8"));
      pkg.exports[specifier.replace("@sentropic/engram/", "./")] = { types: "./dist/memory-substrate.d.ts" };
      writeFileSync(path, JSON.stringify(pkg));
      expect(() => verifyInstalledTypes(dir)).toThrow(/Unused '@ts-expect-error' directive/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("kills broken installed behavior by exercising the public package", { timeout: 30_000 }, () => {
    const dir = consumer();
    try { expect(() => verifyInstalledSemantics(dir, root)).toThrow("PUBLIC_PACKAGE_MUTATION"); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
