/**
 * TypeScript namespace/module container nodes — port of upstream safishamsi
 * 869aaf7. `namespace Foo {}` parses as `internal_module`, `module Bar {}`
 * and ambient `declare module "pkg" {}` as `module`. None was in
 * class_types/function_types nor handled by an extra-walk, so the container
 * produced no node — members were still reached by the default recurse but
 * the namespace itself was invisible.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractJs } from "../src/extract.js";

describe("TS namespace/module containers (upstream 869aaf7)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-ts-namespace-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("emits a node for `namespace Foo {}` and keeps extracting its members", async () => {
    const file = join(dir, "ns.ts");
    writeFileSync(file, [
      "namespace Geometry {",
      "  export function area(r: number): number { return r * r; }",
      "  export class Circle {}",
      "}",
    ].join("\n"));

    const result = await extractJs(file);
    expect(result.error).toBeUndefined();
    const labels = result.nodes.map((n) => n.label);
    expect(labels).toContain("Geometry");
    // Members are still reached (file-contained, parity with C# namespaces).
    expect(labels).toContain("area()");
    expect(labels).toContain("Circle");
  });

  it("emits a node for `module Bar {}` and ambient `declare module \"pkg\"`", async () => {
    const file = join(dir, "mod.ts");
    writeFileSync(file, [
      "module Legacy {",
      "  export const VERSION = { major: 1 };",
      "}",
      "declare module \"left-pad\" {",
      "  export default function leftPad(s: string, n: number): string;",
      "}",
    ].join("\n"));

    const result = await extractJs(file);
    expect(result.error).toBeUndefined();
    const labels = result.nodes.map((n) => n.label);
    expect(labels).toContain("Legacy");
    // Ambient module: quoted name is unwrapped.
    expect(labels).toContain("left-pad");
  });

  it("handles nested namespace names (`namespace A.B {}`)", async () => {
    const file = join(dir, "nested.ts");
    writeFileSync(file, [
      "namespace App.Models {",
      "  export interface User { id: string; }",
      "}",
    ].join("\n"));

    const result = await extractJs(file);
    expect(result.error).toBeUndefined();
    const labels = result.nodes.map((n) => n.label);
    expect(labels).toContain("App.Models");
    expect(labels).toContain("User");
  });
});
