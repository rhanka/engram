import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as integration from "../graphify-memory/integration.js";

const moduleSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "graphify-memory", "integration.ts"), "utf8");

describe("graphify-memory/integration surface (§1 D1, R1e)", () => {
  it("exposes the host-facing factories as runtime functions (factories only)", () => {
    expect(typeof integration.createMemoryPortV2).toBe("function");
    expect(typeof integration.createCanonicalMemoryStoreFactoryV1).toBe("function");
  });

  it("re-exports only from the neutral internal modules — no driver, node runtime, listener, or consumer import", () => {
    const sources = [...moduleSource.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const allowed = new Set(["./engine.js", "./store-factory.js", "./attestation.js", "./admin-conformance.js", "./contracts/index.js"]);
    expect(sources.filter((s) => !allowed.has(s ?? "")), "integration must import only the neutral engine/factory/attestation/contracts modules").toEqual([]);
    // the driver-bound adapters stay in their own subpaths and confer no server semantics here.
    expect(moduleSource).not.toContain("./sqlite.js");
    expect(moduleSource).not.toContain("./postgres.js");
    expect(moduleSource).not.toContain("better-sqlite3");
    expect(moduleSource).not.toContain("node:");
  });

  it("does not re-export the retired built-in administrator or any local-administration factory (Decision B)", () => {
    expect((integration as Record<string, unknown>).createLocalAdministratorV1).toBeUndefined();
    expect(moduleSource).not.toContain("service.js");
    expect(moduleSource).not.toContain("LocalAdministrat");
  });

  it("exports no value implementing AdminProviderPort and no admin-provider/administrator factory (Decision B, symbol-level)", () => {
    // Module-agnostic: the import allowlist cannot tell a harness from a provider lodged in the same module,
    // so encode Decision B on the exported symbols directly — graphify ships no administrator, only the type.
    const isProviderShape = (v: unknown): boolean => {
      if (typeof v !== "object" || v === null) return false;
      const o = v as Record<string, unknown>;
      return typeof o.bootstrap === "function" && typeof o.rotate === "function" && typeof o.revoke === "function";
    };
    for (const [name, value] of Object.entries(integration)) {
      expect(isProviderShape(value), `${name} must not be an AdminProviderPort instance`).toBe(false);
      expect(/^create.*Admin(istrator|Provider)/.test(name) && typeof value === "function", `${name} must not be an admin-provider/administrator factory`).toBe(false);
    }
  });
});
