import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { extract, extractGo, extractJs, extractPhp } from "../src/extract.js";

function strip(label: string | undefined): string {
  return String(label ?? "").replace(/\(?\)$/g, "").replace(/^\./, "");
}

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("AST call edge confidence", () => {
  it("marks JS call edges as EXTRACTED with full weight", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-extract-js-"));
    cleanupDirs.push(dir);

    const filePath = join(dir, "sample.js");
    writeFileSync(
      filePath,
      [
        "function helper() { return 1; }",
        "export function demo() { return helper(); }",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = await extractJs(filePath);
    const calls = result.edges.filter((edge) => edge.relation === "calls");

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((edge) => edge.confidence === "EXTRACTED")).toBe(true);
    expect(calls.every((edge) => edge.weight === 1.0)).toBe(true);
  });

  it("does not phantom-link a lowercase call to a different-case definition in case-sensitive languages", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-extract-case-"));
    cleanupDirs.push(dir);

    const filePath = join(dir, "sample.js");
    writeFileSync(
      filePath,
      [
        "function Render() { return 1; }",
        "function caller() { return render(); }",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = await extractJs(filePath);
    const renderNode = result.nodes.find((n) => strip(n.label) === "Render");
    const calls = result.edges.filter((edge) => edge.relation === "calls");

    // `render()` (lowercase) must NOT resolve to the `Render` definition: JS is case-sensitive.
    expect(renderNode).toBeDefined();
    expect(calls.some((edge) => edge.target === renderNode!.id)).toBe(false);
  });

  it("resolves calls case-insensitively in PHP", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-extract-php-case-"));
    cleanupDirs.push(dir);

    const filePath = join(dir, "sample.php");
    writeFileSync(
      filePath,
      [
        "<?php",
        "function Render() { return 1; }",
        "function caller() { return render(); }",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = await extractPhp(filePath);
    const renderNode = result.nodes.find((n) => strip(n.label) === "Render");
    const calls = result.edges.filter((edge) => edge.relation === "calls");

    // PHP function names are case-insensitive: `render()` resolves to `Render`.
    expect(renderNode).toBeDefined();
    expect(calls.some((edge) => edge.target === renderNode!.id)).toBe(true);
  });

  it("uses namespaced Go package import IDs to avoid local file collisions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-extract-go-"));
    cleanupDirs.push(dir);

    const filePath = join(dir, "main.go");
    writeFileSync(
      filePath,
      [
        "package demo",
        "",
        "import \"context\"",
        "",
        "func main() {",
        "  _ = context.Background()",
        "}",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = await extractGo(filePath);
    const importEdge = result.edges.find((edge) => edge.relation === "imports_from");

    expect(importEdge?.target).toBe("go_pkg_context");
  });

  it("skips ambiguous call targets when multiple symbols share the same name", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-extract-js-ambiguous-"));
    cleanupDirs.push(dir);

    const filePath = join(dir, "sample.js");
    writeFileSync(
      filePath,
      [
        "function log() { return 'global'; }",
        "class Logger {",
        "  log() { return 'method'; }",
        "}",
        "export function demo() {",
        "  return log();",
        "}",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = await extractJs(filePath);
    const demoNode = result.nodes.find((node) => node.label === "demo()");
    const callTargets = result.edges
      .filter((edge) => edge.relation === "calls" && edge.source === demoNode?.id)
      .map((edge) => edge.target);

    expect(demoNode).toBeDefined();
    expect(callTargets).toEqual([]);
  });

  it("keeps Rust scoped calls tied to the matching local type", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-extract-rust-scoped-"));
    cleanupDirs.push(dir);

    const filePath = join(dir, "sample.rs");
    writeFileSync(
      filePath,
      [
        "pub fn parse(input: &str) -> usize {",
        "  input.len()",
        "}",
        "",
        "pub struct Server;",
        "",
        "impl Server {",
        "  pub fn run(&self) {",
        "    let _ = Server::start();",
        "    let _ = Url::parse(\"http://example.com\");",
        "  }",
        "",
        "  fn start() -> bool {",
        "    false",
        "  }",
        "}",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = await extract([filePath]);
    const runNode = result.nodes.find((node) => node.label === ".run()");
    const startNode = result.nodes.find((node) => node.label === ".start()");
    const parseNode = result.nodes.find((node) => node.label === "parse()");
    const callTargets = result.edges
      .filter((edge) => edge.relation === "calls" && edge.source === runNode?.id)
      .map((edge) => edge.target);

    expect(runNode).toBeDefined();
    expect(startNode).toBeDefined();
    expect(parseNode).toBeDefined();
    expect(callTargets).toContain(startNode?.id);
    expect(callTargets).not.toContain(parseNode?.id);
  });
});
