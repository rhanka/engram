import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXPECTED_TYPES } from "../scripts/fixtures/substrate-type-inventory.mjs";
import { verifyInstalledSemantics, verifyInstalledTypes } from "../scripts/substrate-installed-acceptance.mjs";
import * as installedProof from "../scripts/substrate-installed-acceptance.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function consumer(mutate: (text: string) => string = (text) => text) {
  const dir = mkdtempSync(join(tmpdir(), "substrate-public-proof-"));
  const pkg = join(dir, "node_modules/@sentropic/engram");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@sentropic/engram", type: "module", exports: { "./memory-substrate": { types: "./entry.d.ts", import: "./entry.js" } } }));
  const special = new Set(["Result", "CanonicalMemoryStorePort", "ModuleStorageMemoryStoreOptionsV1"]);
  writeFileSync(join(pkg, "entry.d.ts"), mutate([
    ...EXPECTED_TYPES.filter((name) => !special.has(name)).map((name) => `export type ${name} = unknown;`),
    "export type Result<T> = { ok: true; value: T };",
    "export interface CanonicalMemoryStorePort { version: 1 }",
    "export interface ModuleStorageMemoryStoreOptionsV1 { handle: unknown }",
    "export declare function openModuleStorageCanonicalMemoryStoreV1(options: ModuleStorageMemoryStoreOptionsV1): Promise<Result<CanonicalMemoryStorePort>>;",
    "export declare function createMemoryPortV2(): unknown;",
  ].join("\n")));
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
    ["missing type", (text: string) => text.replace("export type ClockPort = unknown;", "")],
    ["extra type", (text: string) => `${text}\nexport type ExtraPublicType = string;`],
    ["invalid declaration", (text: string) => text.replace("export type ClockPort = unknown;", "export type ClockPort = MissingDeclaration;")],
  ] as const)("kills %s in the installed declaration", (_name, mutate) => {
    const dir = consumer(mutate);
    try { expect(() => verifyInstalledTypes(dir)).toThrow(); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("kills broken installed behavior by exercising the public package", { timeout: 30_000 }, () => {
    const dir = consumer();
    try { expect(() => verifyInstalledSemantics(dir, root)).toThrow("PUBLIC_PACKAGE_MUTATION"); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
