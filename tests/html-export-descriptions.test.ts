/**
 * Track G G-studio-lot4 (part A) — node descriptions in the HTML export.
 *
 * The blocker: `graphify export html` had no way to receive the wiki
 * description sidecar, and node descriptions never rendered. toHtml now
 * accepts a `descriptions` sidecar index and attaches the per-node
 * description to the node payload so the node-info panel can show it.
 *
 * insufficient_evidence => no description is attached (parity with wiki).
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { toHtml } from "../src/export.js";
import type { WikiDescriptionSidecarIndex } from "../src/wiki-descriptions.js";

function sidecar(): WikiDescriptionSidecarIndex {
  return {
    schema: "graphify_wiki_description_index_v1",
    graph_hash: "h",
    prompt_version: "wiki-description-v1",
    nodes: {
      holmes: {
        schema: "graphify_wiki_description_v1",
        target_id: "holmes",
        target_kind: "node",
        graph_hash: "h",
        status: "generated",
        description: "Consulting detective of 221B Baker Street.",
        evidence_refs: ["corpus/holmes.txt#1"],
        confidence: 0.9,
        cache_key: "k",
        generator: { mode: "assistant", provider: "pack", model: null, prompt_version: "wiki-description-v1" },
      },
      watson: {
        schema: "graphify_wiki_description_v1",
        target_id: "watson",
        target_kind: "node",
        graph_hash: "h",
        status: "insufficient_evidence",
        description: null,
        evidence_refs: [],
        confidence: null,
        cache_key: "k2",
        generator: { mode: "assistant", provider: "pack", model: null, prompt_version: "wiki-description-v1" },
      },
    },
  } as unknown as WikiDescriptionSidecarIndex;
}

function render(withDescriptions: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-html-descr-"));
  const htmlPath = join(dir, "graph.html");
  const g = new Graph();
  g.addNode("holmes", { label: "Sherlock Holmes", source_file: "corpus/holmes.txt", file_type: "document", node_type: "Character" });
  g.addNode("watson", { label: "Dr Watson", source_file: "corpus/watson.txt", file_type: "document", node_type: "Character" });
  g.addUndirectedEdge("holmes", "watson", { relation: "works_with", confidence: "EXTRACTED" });
  const communities = new Map([[0, ["holmes", "watson"]]]);
  toHtml(g, communities, htmlPath, {
    communityLabels: new Map([[0, "Detectives"]]),
    ...(withDescriptions ? { descriptions: sidecar() } : {}),
  });
  const html = readFileSync(htmlPath, "utf-8");
  rmSync(dir, { recursive: true, force: true });
  return html;
}

describe("Track G G-studio-lot4 — node descriptions in HTML export (part A)", () => {
  it("prefers graph.json node.description over a wiki sidecar", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-html-inline-descr-"));
    const htmlPath = join(dir, "graph.html");
    const g = new Graph();
    g.addNode("holmes", {
      label: "Sherlock Holmes",
      source_file: "corpus/holmes.txt",
      file_type: "document",
      node_type: "Character",
      description: "Inline graph description wins.",
    });
    const communities = new Map([[0, ["holmes"]]]);

    toHtml(g, communities, htmlPath, {
      communityLabels: new Map([[0, "Detectives"]]),
      descriptions: sidecar(),
    });

    const html = readFileSync(htmlPath, "utf-8");
    rmSync(dir, { recursive: true, force: true });
    expect(html).toMatch(/"id":"holmes"[\s\S]*?"description":"Inline graph description wins\."/);
    expect(html).not.toContain("Consulting detective of 221B Baker Street.");
  });

  it("attaches the generated node description to the node payload", () => {
    const html = render(true);
    expect(html).toMatch(/"id":"holmes"[\s\S]*?"description":"Consulting detective of 221B Baker Street\."/);
  });

  it("omits the description for insufficient_evidence nodes (no placeholder)", () => {
    const html = render(true);
    // The node JSON is a single line; isolate watson's object and assert it
    // carries no description field (holmes does; watson must not).
    const watsonMatch = html.match(/\{"id":"watson"[^}]*?(?:"highlight":\{[^}]*\})?[^}]*?\}/);
    // Simpler + robust: the watson description string must never appear.
    expect(html).not.toContain('Dr Watson description');
    // And only one node carries a generated description (holmes).
    expect((html.match(/"description":"/g) ?? []).length).toBe(1);
    expect(watsonMatch ? watsonMatch[0] : "").not.toContain('"description":"');
  });

  it("the node-info panel template renders the description field when present", () => {
    const html = render(true);
    // The showInfo() template surfaces the description.
    expect(html).toContain("_description");
  });

  it("does not attach descriptions when none are supplied (byte-stable default)", () => {
    const withDescr = render(true);
    const without = render(false);
    expect(without).not.toContain('"description":"Consulting detective');
    // The description field machinery still ships (template references it) but
    // no node carries a generated description without the sidecar.
    expect(withDescr).not.toBe(without);
  });
});
