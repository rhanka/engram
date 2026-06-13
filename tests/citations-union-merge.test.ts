import { describe, expect, it } from "vitest";
import { buildFromJson } from "../src/build.js";
import { mergeCliAstAndSemantic } from "../src/cli.js";
import { mergeSemanticArtifacts, mergeAstAndSemantic } from "../src/skill-runtime.js";
import type { Extraction, OntologyCitation } from "../src/types.js";

function node(id: string, citations: OntologyCitation[]) {
  return { id, label: id, source_file: "doc.txt", file_type: "document" as const, citations };
}

function extraction(nodes: ReturnType<typeof node>[]): Extraction {
  return { nodes, edges: [], hyperedges: [], input_tokens: 0, output_tokens: 0 };
}

describe("union at assembly merge (build.ts mergeNode)", () => {
  it("unions citations across duplicate node ids instead of last-write-wins", () => {
    // Same entity emitted in two chunks, each with a distinct citation set.
    const G = buildFromJson(
      extraction([
        node("sherlock", [{ source_file: "study.txt", page: 1 }]),
        node("sherlock", [{ source_file: "sign.txt", page: 2 }]),
        node("sherlock", [{ source_file: "study.txt", page: 1 }]), // dup of chunk 1
      ]),
    );
    const cites = G.getNodeAttribute("sherlock", "citations") as OntologyCitation[];
    // UNION (deduped), not just the last chunk's single citation.
    expect(cites).toHaveLength(2);
    const sources = cites.map((c) => `${c.source_file}:${c.page}`).sort();
    expect(sources).toEqual(["sign.txt:2", "study.txt:1"]);
  });

  it("keeps a single chunk's citations intact for non-duplicated nodes", () => {
    const G = buildFromJson(
      extraction([node("watson", [{ source_file: "study.txt", page: 5 }])]),
    );
    expect(G.getNodeAttribute("watson", "citations")).toHaveLength(1);
  });
});

describe("union at skip-duplicate assembly (cli + skill-runtime)", () => {
  function chunkExtraction(citations: OntologyCitation[]): Partial<Extraction> {
    return { nodes: [node("hub", citations)], edges: [], input_tokens: 0, output_tokens: 0 };
  }

  it("mergeCliAstAndSemantic folds the duplicate's citations into the kept node", () => {
    const merged = mergeCliAstAndSemantic(
      chunkExtraction([{ source_file: "a.txt", page: 1 }]),
      chunkExtraction([{ source_file: "b.txt", page: 2 }]),
    );
    const hub = merged.nodes.find((n) => n.id === "hub")!;
    expect(hub.citations).toHaveLength(2);
  });

  it("mergeSemanticArtifacts folds the duplicate's citations into the kept node", () => {
    const merged = mergeSemanticArtifacts(
      chunkExtraction([{ source_file: "a.txt", page: 1 }]),
      chunkExtraction([{ source_file: "b.txt", page: 2 }, { source_file: "a.txt", page: 1 }]),
    );
    const hub = merged.nodes.find((n) => n.id === "hub")!;
    // deduped union: a:1, b:2
    expect(hub.citations).toHaveLength(2);
  });

  it("mergeAstAndSemantic folds the duplicate's citations into the kept node", () => {
    const merged = mergeAstAndSemantic(
      chunkExtraction([{ source_file: "a.txt", page: 1 }]),
      chunkExtraction([{ source_file: "c.txt", page: 3 }]),
    );
    const hub = merged.nodes.find((n) => n.id === "hub")!;
    expect(hub.citations).toHaveLength(2);
  });

  it("does not crash when neither side carries citations", () => {
    const merged = mergeCliAstAndSemantic(
      { nodes: [{ id: "x", label: "x", source_file: "d", file_type: "code" }], edges: [], input_tokens: 0, output_tokens: 0 },
      { nodes: [{ id: "x", label: "x", source_file: "d", file_type: "code" }], edges: [], input_tokens: 0, output_tokens: 0 },
    );
    expect(merged.nodes).toHaveLength(1);
  });
});
