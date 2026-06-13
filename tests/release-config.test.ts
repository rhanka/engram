import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release configuration", () => {
  it("tracks the 0.13.1 release across package metadata and changelog", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as { name?: string; version?: string };
    const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf-8")) as {
      name?: string;
      version?: string;
      packages?: Record<string, { name?: string; version?: string }>;
    };
    const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf-8");

    expect(pkg.name).toBe("@sentropic/graphify");
    expect(pkg.version).toBe("0.13.1");
    expect(lock.name).toBe("@sentropic/graphify");
    expect(lock.version).toBe("0.13.1");
    expect(lock.packages?.[""]?.version).toBe("0.13.1");
    expect(changelog).toContain("## 0.13.1 (2026-06-13)");
  });

  it("runs the main TypeScript CI test matrix on Node 20, 22, and 24", () => {
    const workflow = readFileSync(new URL("../.github/workflows/typescript-ci.yml", import.meta.url), "utf-8");

    expect(workflow).toContain('node-version: ["20", "22", "24"]');
    expect(workflow).toContain("matrix.node-version == '24'");
  });
});
