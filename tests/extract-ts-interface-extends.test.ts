/**
 * Tests for F-0820-0827 M21 (upstream 88a8e3b, #1095):
 * Two gaps in TypeScript inheritance extraction:
 *
 * 1. interface heritage uses an `extends_type_clause` node (NOT `class_heritage`),
 *    so the walker never saw it — `interface A extends B` produced no inherits
 *    edge.  Fix: add an extends_type_clause branch in the TS/JS class handler.
 *
 * 2. A same-file superclass has no import alias, so only imported bases
 *    resolved; same-file extends/implements produced no edge.  Fix: resolve
 *    against seenIds in the emitHeritage helper before falling back to a stub.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extract } from "../src/extract.js";

describe("TypeScript interface-extends and same-file class heritage (F-0820-0827 M21, 88a8e3b #1095)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-m21-heritage-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("interface extends emits an inherits edge (extends_type_clause)", async () => {
    writeFileSync(
      join(dir, "iface.ts"),
      [
        "interface IBase {",
        "  id(): string;",
        "}",
        "",
        "interface IDerived extends IBase {",
        "  name(): string;",
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([join(dir, "iface.ts")]);

    // Both interfaces must be nodes.
    const labels = result.nodes.map((n) => n.label);
    expect(labels).toContain("IBase");
    expect(labels).toContain("IDerived");

    // IDerived must have an inherits edge pointing to IBase.
    const derivedNode = result.nodes.find((n) => n.label === "IDerived");
    const baseNode = result.nodes.find((n) => n.label === "IBase");
    expect(derivedNode).toBeDefined();
    expect(baseNode).toBeDefined();

    const inheritsEdge = result.edges.find(
      (e) =>
        e.relation === "inherits" &&
        e.source === derivedNode!.id &&
        e.target === baseNode!.id,
    );
    expect(inheritsEdge).toBeDefined();
  });

  it("interface extends multiple bases emits one inherits edge per base", async () => {
    writeFileSync(
      join(dir, "multi.ts"),
      [
        "interface IA { a(): void; }",
        "interface IB { b(): void; }",
        "interface IC extends IA, IB { c(): void; }",
        "",
      ].join("\n"),
    );

    const result = await extract([join(dir, "multi.ts")]);

    const cNode = result.nodes.find((n) => n.label === "IC");
    const aNode = result.nodes.find((n) => n.label === "IA");
    const bNode = result.nodes.find((n) => n.label === "IB");
    expect(cNode).toBeDefined();
    expect(aNode).toBeDefined();
    expect(bNode).toBeDefined();

    const inheritsEdges = result.edges.filter(
      (e) => e.relation === "inherits" && e.source === cNode!.id,
    );
    const targets = new Set(inheritsEdges.map((e) => e.target));
    expect(targets.has(aNode!.id)).toBe(true);
    expect(targets.has(bNode!.id)).toBe(true);
  });

  it("class extends in the same file emits an inherits edge", async () => {
    writeFileSync(
      join(dir, "classes.ts"),
      [
        "class Animal {",
        "  speak(): string { return ''; }",
        "}",
        "",
        "class Dog extends Animal {",
        "  bark(): string { return 'woof'; }",
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([join(dir, "classes.ts")]);

    const animalNode = result.nodes.find((n) => n.label === "Animal");
    const dogNode = result.nodes.find((n) => n.label === "Dog");
    expect(animalNode).toBeDefined();
    expect(dogNode).toBeDefined();

    const inheritsEdge = result.edges.find(
      (e) =>
        e.relation === "inherits" &&
        e.source === dogNode!.id &&
        e.target === animalNode!.id,
    );
    expect(inheritsEdge).toBeDefined();
  });

  it("class implements same-file interface emits an implements edge", async () => {
    writeFileSync(
      join(dir, "impl.ts"),
      [
        "interface Serializable {",
        "  serialize(): string;",
        "}",
        "",
        "class Config implements Serializable {",
        "  serialize(): string { return '{}'; }",
        "}",
        "",
      ].join("\n"),
    );

    const result = await extract([join(dir, "impl.ts")]);

    const ifaceNode = result.nodes.find((n) => n.label === "Serializable");
    const classNode = result.nodes.find((n) => n.label === "Config");
    expect(ifaceNode).toBeDefined();
    expect(classNode).toBeDefined();

    const implementsEdge = result.edges.find(
      (e) =>
        e.relation === "implements" &&
        e.source === classNode!.id &&
        e.target === ifaceNode!.id,
    );
    expect(implementsEdge).toBeDefined();
  });
});
