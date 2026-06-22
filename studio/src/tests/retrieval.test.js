import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { buildSearchIndex } from "../../../src/search-index-emitter.js";
import { buildAnswerView, formatScore } from "../lib/retrieval.js";

/**
 * Build a REAL search index from a tiny mystery graph via the actual emitter, so
 * the studio view-model is exercised over the genuine BM25 + PPR + specificity
 * pipeline (no hand-rolled postings). The Sherlock fixture mirrors the answer-pack
 * test corpus: a structural "Chapter" hub that should be DEMOTED below the
 * query-specific suspect.
 */
function makeIndex() {
  const G = new Graph({ type: "undirected" });
  G.setAttribute("community_labels", { 0: "Suspects", 1: "Places" });
  G.mergeNode("hope", {
    label: "Jefferson Hope",
    type: "Character",
    description: "the cab driver who murdered Enoch Drebber out of revenge",
    community: 0,
    citations: [{ source_file: "study.txt", quote: "Jefferson Hope confessed to the murder." }],
  });
  G.mergeNode("drebber", {
    label: "Enoch Drebber",
    type: "Character",
    description: "the murder victim found at Lauriston Gardens",
    community: 0,
  });
  G.mergeNode("holmes", {
    label: "Sherlock Holmes",
    type: "Character",
    description: "the consulting detective",
    community: 0,
  });
  G.mergeNode("chap1", {
    label: "Chapter 1",
    type: "ChapterOrStory",
    description: "the opening chapter where the murder is discovered",
    community: 1,
  });
  // The chapter is a hub (connected to everyone) — high background centrality.
  G.mergeEdge("chap1", "hope", { confidence: "EXTRACTED", weight: 1 });
  G.mergeEdge("chap1", "drebber", { confidence: "EXTRACTED", weight: 1 });
  G.mergeEdge("chap1", "holmes", { confidence: "EXTRACTED", weight: 1 });
  G.mergeEdge("hope", "drebber", { confidence: "EXTRACTED", weight: 2 });
  G.mergeEdge("holmes", "hope", { confidence: "INFERRED", weight: 1 });
  return buildSearchIndex(G);
}

describe("buildAnswerView (studio in-browser retrieval view-model)", () => {
  it("returns the empty view for a blank question", () => {
    const index = makeIndex();
    const view = buildAnswerView(index, "   ");
    expect(view.question).toBe("");
    expect(view.entities).toEqual([]);
    expect(view.top).toBeNull();
    expect(view.refused).toBe(false);
  });

  it("returns the empty view when there is no index", () => {
    const view = buildAnswerView(null, "who is the murderer?");
    expect(view.entities).toEqual([]);
    expect(view.top).toBeNull();
  });

  it("ranks relevant entities with score + type + grounding for a real query", () => {
    const index = makeIndex();
    const view = buildAnswerView(index, "who is the murderer?");

    expect(view.mode).toBe("offline");
    expect(view.refused).toBe(false);
    expect(view.entities.length).toBeGreaterThan(0);

    // Every ranked entity carries the render-ready shape.
    const first = view.entities[0];
    expect(typeof first.label).toBe("string");
    expect(typeof first.score).toBe("number");
    expect(first.rank).toBe(1);
    expect(view.top).toEqual(first);

    // The seeded suspect appears and outranks the structural chapter hub
    // (specificity + structural demotion surface the entity over the container).
    const hope = view.entities.find((e) => e.nodeId === "hope");
    const chapter = view.entities.find((e) => e.nodeId === "chap1");
    expect(hope).toBeDefined();
    expect(hope.type).toBe("Character");
    if (chapter) expect(hope.rank).toBeLessThan(chapter.rank);

    // Grounding: the verbatim quote rides through to the view-model.
    expect(hope.quote).toBe("Jefferson Hope confessed to the murder.");
  });

  it("surfaces the lexical BM25 seeds", () => {
    const index = makeIndex();
    const view = buildAnswerView(index, "murder");
    expect(view.seeds.length).toBeGreaterThan(0);
    expect(view.seeds[0]).toHaveProperty("nodeId");
    expect(view.seeds[0]).toHaveProperty("label");
  });

  it("reports refusal when nothing lexically matches", () => {
    const index = makeIndex();
    const view = buildAnswerView(index, "xyzzyqwertyunmatched");
    expect(view.refused).toBe(true);
    expect(view.entities).toEqual([]);
    // Honest: never fabricates an answer string anywhere in the model.
    expect(view).not.toHaveProperty("answer");
  });

  it("formatScore renders compactly across the dynamic range", () => {
    expect(formatScore(0)).toBe("0");
    expect(formatScore(0.834)).toBe("0.83");
    expect(formatScore(12.4)).toBe("12.4");
    expect(formatScore(250)).toBe("250");
    expect(formatScore(NaN)).toBe("—");
    expect(formatScore("nope")).toBe("—");
  });
});
