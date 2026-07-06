/**
 * TypeScript/JavaScript decorator references — port of upstream safishamsi
 * 3540416. `@Component`, `@Injectable`, `@Input`, `@Inject`, `@Entity`, …
 * previously produced no edge: the `decorator` node kind was never walked.
 * Decorators are framework-critical (Angular, NestJS, TypeORM): they are the
 * primary signal of what a class is and does.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractJs, type ExtractionResult } from "../src/extract.js";
import type { GraphEdge } from "../src/types.js";

/** Collect decorator `references` edges as { sourceLabel, targetLabel }. */
function decoratorRefs(result: ExtractionResult): Array<{ source: string; target: string }> {
  const labelById = new Map(result.nodes.map((n) => [n.id, n.label]));
  return result.edges
    .filter((e: GraphEdge) => e.relation === "references" && e.context === "decorator")
    .map((e) => ({
      source: labelById.get(e.source) ?? e.source,
      target: labelById.get(e.target) ?? e.target,
    }));
}

describe("TS/JS decorator references (upstream 3540416)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-ts-decorators-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("emits class-level decorator references (bare, factory, namespaced, exported)", async () => {
    const file = join(dir, "widgets.ts");
    writeFileSync(file, [
      "import { Component, Injectable } from '@angular/core';",
      "import * as orm from 'typeorm';",
      "",
      "@Injectable",
      "class PlainService {}",
      "",
      "@Component({ selector: 'app-widget' })",
      "export class WidgetComponent {}",
      "",
      "@orm.Entity()",
      "class OrderRow {}",
    ].join("\n"));

    const result = await extractJs(file);
    expect(result.error).toBeUndefined();

    const refs = decoratorRefs(result);
    expect(refs).toContainEqual({ source: "PlainService", target: "Injectable" });
    // Decorator factory on an exported class (decorator wraps the export).
    expect(refs).toContainEqual({ source: "WidgetComponent", target: "Component" });
    // Namespaced decorator resolves to the imported symbol, not the alias.
    expect(refs).toContainEqual({ source: "OrderRow", target: "Entity" });
    expect(refs.some((r) => r.target === "orm")).toBe(false);
  });

  it("attributes method decorators to the method node and field/param decorators to the class", async () => {
    const file = join(dir, "controller.ts");
    writeFileSync(file, [
      "import { Get, Input, Inject } from 'somewhere';",
      "",
      "class UsersController {",
      "  @Input() name: string;",
      "",
      "  @Get('/users')",
      "  list(@Inject(TOKEN) svc: Service): void {}",
      "}",
    ].join("\n"));

    const result = await extractJs(file);
    expect(result.error).toBeUndefined();

    const refs = decoratorRefs(result);
    // Method decorator → owned by the method node (label `.list()`).
    expect(refs).toContainEqual({ source: ".list()", target: "Get" });
    // Field decorator (field is not a node) → attributed to the class.
    expect(refs).toContainEqual({ source: "UsersController", target: "Input" });
    // Parameter decorator inside the method → owned by the method node.
    expect(refs).toContainEqual({ source: ".list()", target: "Inject" });
  });

  it("emits no decorator references for undecorated classes", async () => {
    const file = join(dir, "plain.ts");
    writeFileSync(file, [
      "class NothingSpecial {",
      "  run(): void {}",
      "}",
    ].join("\n"));

    const result = await extractJs(file);
    expect(result.error).toBeUndefined();
    expect(decoratorRefs(result)).toEqual([]);
  });
});
