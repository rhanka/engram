/**
 * JS/TS rationale comments + ADR/RFC doc references — port of upstream
 * safishamsi 6d3a6f1. Parity with the Python rationale pass: JS/TS comments
 * were previously discarded entirely, so `// NOTE:`-style rationale and
 * ADR/RFC citations never joined the graph.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractJs, type ExtractionResult } from "../src/extract.js";

function rationaleNodes(result: ExtractionResult) {
  return result.nodes.filter((n) => n.file_type === "rationale");
}

function docRefNodes(result: ExtractionResult) {
  return result.nodes.filter((n) => n.file_type === "doc_ref");
}

describe("JS/TS rationale + doc references (upstream 6d3a6f1)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-js-rationale-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("extracts a line rationale comment with a rationale_for edge to the file node", async () => {
    const file = join(dir, "build.ts");
    writeFileSync(file, [
      "// NOTE: must run before compile() or the linker will fail",
      "export function build(): void {}",
    ].join("\n"));

    const result = await extractJs(file);
    expect(result.error).toBeUndefined();
    const rationale = rationaleNodes(result);
    expect(rationale.some((n) => n.label.includes("NOTE"))).toBe(true);
    const edge = result.edges.find((e) => e.relation === "rationale_for");
    expect(edge).toBeDefined();
    // The edge target is the real file node emitted by the extractor.
    expect(result.nodes.some((n) => n.id === edge!.target && n.label === "build.ts")).toBe(true);
  });

  it("extracts block-comment rationale variants (* WHY:)", async () => {
    const file = join(dir, "fetch.ts");
    writeFileSync(file, [
      "/**",
      " * WHY: retries are capped because the upstream rate-limits at 10 rps.",
      " */",
      "export function fetchData(): void {}",
    ].join("\n"));

    const result = await extractJs(file);
    expect(rationaleNodes(result).some((n) => n.label.includes("rate-limits"))).toBe(true);
  });

  it("first-classes ADR references with cites edges", async () => {
    const file = join(dir, "route.ts");
    writeFileSync(file, [
      "// Gateway pattern per ADR-0002; provider selection per ADR-0015.",
      "export function route(): void {}",
    ].join("\n"));

    const result = await extractJs(file);
    const labels = docRefNodes(result).map((n) => n.label);
    expect(labels).toContain("ADR-0002");
    expect(labels).toContain("ADR-0015");
    expect(result.edges.filter((e) => e.relation === "cites")).toHaveLength(2);
  });

  it("normalizes and dedupes ADR spellings to one node", async () => {
    const file = join(dir, "guard.ts");
    writeFileSync(file, [
      "// See ADR-11 for the trust boundary.",
      "// ADR 0011 also governs the injection containment below.",
      "export function guard(): void {}",
    ].join("\n"));

    const result = await extractJs(file);
    expect(docRefNodes(result).map((n) => n.label)).toEqual(["ADR-0011"]);
    expect(result.edges.filter((e) => e.relation === "cites")).toHaveLength(1);
  });

  it("keeps RFC numbers unpadded and ignores ADRs in string literals", async () => {
    const file = join(dir, "tcp.ts");
    writeFileSync(file, [
      "// Sequence numbers follow RFC 793.",
      "const msg = 'see ADR-0099 for details';",
      "export function connect(): void { return void msg; }",
    ].join("\n"));

    const result = await extractJs(file);
    const labels = docRefNodes(result).map((n) => n.label);
    expect(labels).toContain("RFC-793");
    // Non-comment lines never contribute doc refs.
    expect(labels).not.toContain("ADR-0099");
  });
});
