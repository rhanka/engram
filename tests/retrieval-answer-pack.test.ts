import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { assembleAnswerPack, ANSWER_PACK_SCHEMA } from "../src/retrieval/answer-pack.js";
import { buildSearchIndex } from "../src/search-index-emitter.js";

/** Mystery-style fixture: quote-bearing citations (the grounding case). */
function mysteryIndex() {
  const G = new Graph({ type: "undirected" });
  G.mergeNode("holmes", {
    label: "Sherlock Holmes",
    description: "the consulting detective of Baker Street",
    community: 0,
    citations: [{ source_file: "study.txt", page: 12, section: "I", quote: "the consulting detective" }],
  });
  G.mergeNode("watson", {
    label: "Doctor Watson",
    description: "the loyal companion and chronicler",
    community: 0,
    citations: [{ source_file: "study.txt", quote: "my friend Watson" }],
  });
  G.mergeNode("moriarty", {
    label: "Professor Moriarty",
    description: "the Napoleon of crime",
    community: 1,
    citations: [{ source_file: "final.txt", quote: "the Napoleon of crime" }],
  });
  G.mergeNode("london", { label: "London", description: "a foggy capital", community: 1 });
  G.mergeEdge("holmes", "watson", { confidence: "EXTRACTED", weight: 1 });
  G.mergeEdge("holmes", "moriarty", { confidence: "INFERRED" });
  G.mergeEdge("moriarty", "london", { confidence: "EXTRACTED" });
  return buildSearchIndex(G);
}

/** Code-graph-style fixture: 0 quotes (the optionality / degradation case). */
function codeIndex() {
  const G = new Graph({ type: "undirected" });
  G.mergeNode("parser", { label: "parseInput", description: "tokenizes the raw source string", community: 0 });
  G.mergeNode("lexer", { label: "lexer", description: "emits a token stream", community: 0 });
  G.mergeNode("emitter", { label: "emit", description: "writes output files", community: 1 });
  G.mergeEdge("parser", "lexer", { confidence: "EXTRACTED", weight: 2 });
  G.mergeEdge("lexer", "emitter", { confidence: "EXTRACTED" });
  return buildSearchIndex(G);
}

describe("answer-pack assembler — schema (T8 / C10)", () => {
  it("emits a valid graphify_answer_pack_v1 with seeds, PPR neighborhood, paths, grounding, answer:null", () => {
    const index = mysteryIndex();
    const pack = assembleAnswerPack(index, "detective Baker Street");

    expect(pack.schema).toBe(ANSWER_PACK_SCHEMA);
    expect(pack.schema).toBe("graphify_answer_pack_v1");
    expect(pack.question).toBe("detective Baker Street");
    expect(pack.mode).toBe("offline");

    // seeds present, fused-rank-ordered.
    expect(pack.retrieval.seeds.length).toBeGreaterThan(0);
    expect(pack.retrieval.seeds[0]!.fused_rank).toBe(1);
    expect(pack.retrieval.seeds[0]!.node_id).toBe("holmes");
    expect(pack.retrieval.fusion).toEqual({ method: "rrf", k: 60, lists: ["bm25"] });

    // PPR block, seeded by the fused-seed vector (C5a step 3).
    expect(pack.retrieval.ppr.seeded_by).toBe("fused-seed");
    expect(pack.retrieval.ppr.alpha).toBe(0.85);
    expect(pack.retrieval.ppr.iterations).toBeGreaterThan(0);
    expect(pack.retrieval.ppr.refused).toBe(false);

    // Specificity-ranked neighborhood (lift over background), descending. Every
    // entry still carries its raw personalized `ppr` mass (math unchanged).
    expect(pack.neighborhood.length).toBeGreaterThan(0);
    for (let i = 1; i < pack.neighborhood.length; i++) {
      expect(pack.neighborhood[i - 1]!.specificity).toBeGreaterThanOrEqual(pack.neighborhood[i]!.specificity);
    }
    expect(pack.neighborhood.every((n) => typeof n.ppr === "number" && typeof n.specificity === "number")).toBe(true);
    // the seed surfaces top of the specificity ranking.
    expect(pack.neighborhood[0]!.node_id).toBe("holmes");

    // grounding spans where quotes exist.
    const holmes = pack.neighborhood.find((n) => n.node_id === "holmes")!;
    expect(holmes.grounding).toBeDefined();
    expect(holmes.grounding![0]!.quote).toBe("the consulting detective");

    // communities surfaced from the self-carried community_meta.
    expect(pack.communities.length).toBeGreaterThan(0);
    expect(pack.communities.every((c) => typeof c.label === "string")).toBe(true);

    // carried graph_signature + budget; answer null in OFFLINE.
    expect(pack.graph_signature).toBe(index.graph_signature);
    expect(pack.grounding_signature).toBe(index.grounding_signature);
    expect(pack.budget.token_budget).toBe(2000);
    expect(pack.budget.relevance_tests_proposed).toBe(pack.neighborhood.length);
    expect(pack.answer).toBeNull();
  });

  it("PathRAG-pruned connecting paths carry a distance-decayed reliability", () => {
    const index = mysteryIndex();
    const pack = assembleAnswerPack(index, "detective Moriarty");
    for (const p of pack.paths) {
      expect(p.nodes.length).toBeGreaterThanOrEqual(2);
      expect(p.reliability).toBeGreaterThan(0);
      expect(p.reliability).toBeLessThanOrEqual(1);
    }
    // a 1-hop path (holmes-moriarty edge) is more reliable than a 2-hop path.
    if (pack.paths.length >= 1) {
      expect(pack.paths[0]!.reliability).toBeGreaterThanOrEqual(pack.paths.at(-1)!.reliability);
    }
  });
});

describe("answer-pack quote optionality (T9 / INV-6)", () => {
  it("code graph (0 quotes) → valid pack, label+description grounding, NO crash / NO required quote", () => {
    const index = codeIndex();
    const pack = assembleAnswerPack(index, "tokenizes source");

    expect(pack.schema).toBe("graphify_answer_pack_v1");
    expect(pack.neighborhood.length).toBeGreaterThan(0);
    // no neighborhood entry carries a grounding[] (no quotes in this corpus)…
    expect(pack.neighborhood.every((n) => n.grounding === undefined)).toBe(true);
    // …but descriptions are present (label+description grounding).
    expect(pack.neighborhood.some((n) => typeof n.description === "string")).toBe(true);
    expect(pack.answer).toBeNull();
  });

  it("mystery graph → quotes attached on quote-bearing nodes", () => {
    const index = mysteryIndex();
    const pack = assembleAnswerPack(index, "Napoleon of crime");
    const moriarty = pack.neighborhood.find((n) => n.node_id === "moriarty");
    expect(moriarty?.grounding?.[0]!.quote).toBe("the Napoleon of crime");
  });
});

describe("answer-pack one core, three modes (T10 / INV-2)", () => {
  it("OFFLINE / ONLINE / AGENT produce the SAME schema from the SAME code path", () => {
    const index = mysteryIndex();
    const offline = assembleAnswerPack(index, "detective", { mode: "offline" });
    const online = assembleAnswerPack(index, "detective", { mode: "online" });
    const agent = assembleAnswerPack(index, "detective", { mode: "agent" });

    for (const pack of [offline, online, agent]) {
      expect(pack.schema).toBe("graphify_answer_pack_v1");
      expect(Object.keys(pack.retrieval)).toEqual(["seeds", "fusion", "ppr"]);
    }
    // same retrieval substrate across modes (same seeds + PPR ranking).
    expect(online.neighborhood.map((n) => n.node_id)).toEqual(offline.neighborhood.map((n) => n.node_id));
    expect(agent.neighborhood.map((n) => n.node_id)).toEqual(offline.neighborhood.map((n) => n.node_id));

    // mode differs only in `mode` + who fills `answer`.
    expect(offline.mode).toBe("offline");
    expect(online.mode).toBe("online");
    expect(agent.mode).toBe("agent");
    // OFFLINE/AGENT leave answer null; ONLINE may fill it.
    expect(offline.answer).toBeNull();
    expect(agent.answer).toBeNull();
    expect(online.answer).toBeNull(); // no LLM configured → still null
    const onlineFilled = assembleAnswerPack(index, "detective", { mode: "online", answer: "Holmes is a detective." });
    expect(onlineFilled.answer).toBe("Holmes is a detective.");
  });

  it("refuses gracefully when no lexical seed matches (refused:true, empty neighborhood)", () => {
    const index = mysteryIndex();
    const pack = assembleAnswerPack(index, "zzzznomatchquery");
    expect(pack.retrieval.ppr.refused).toBe(true);
    expect(pack.retrieval.seeds.length).toBe(0);
    expect(pack.neighborhood.length).toBe(0);
    expect(pack.paths.length).toBe(0);
  });

  it("host multi-query sub-queries are RRF-fused into the seed seam", () => {
    const index = mysteryIndex();
    const pack = assembleAnswerPack(index, "detective", { subQueries: ["Napoleon of crime"] });
    expect(pack.retrieval.fusion.lists.length).toBe(2);
    expect(pack.retrieval.fusion.lists[1]).toContain("multiquery:");
  });
});

/**
 * The specificity (lift-over-background) re-rank fixture. A high-degree HUB is
 * wired to MANY satellites, so it carries the most query-personalized PPR mass
 * for ANY seed (it is universally central) — exactly the mystery-graph pathology
 * where the book / intro-chapter / "Sherlock Holmes" drown the actual answer. A
 * low-degree, query-SPECIFIC answer node sits two hops from the seed. Plain PPR
 * ranks the hub first; the specificity ranking (ppr / (background+eps)) demotes
 * the hub and surfaces the seed-specific answer.
 */
function hubIndex() {
  const G = new Graph({ type: "undirected" });
  // The universally-central hub + its many satellites (high degree → high
  // background centrality AND high personalized mass for every query).
  G.mergeNode("hub", { label: "generic central hub", description: "connected to everything", community: 0 });
  for (let i = 0; i < 20; i++) {
    G.mergeNode(`sat${i}`, { label: `satellite ${i}`, description: "a generic satellite", community: 0 });
    G.mergeEdge("hub", `sat${i}`, { confidence: "EXTRACTED", weight: 1 });
  }
  // The seed the query matches lexically, and the SPECIFIC answer two hops away.
  // The seed also touches the hub (so the hub gets personalized mass too).
  G.mergeNode("seednode", { label: "rare zorptacular keyword", description: "the lexical seed", community: 1 });
  G.mergeNode("answer", { label: "the specific zorptacular answer", description: "the query-specific answer", community: 1 });
  G.mergeEdge("seednode", "answer", { confidence: "EXTRACTED", weight: 1 });
  G.mergeEdge("seednode", "hub", { confidence: "EXTRACTED", weight: 1 });
  G.mergeEdge("answer", "hub", { confidence: "EXTRACTED", weight: 1 });
  return buildSearchIndex(G);
}

describe("answer-pack specificity re-rank (lift over background)", () => {
  it("a high-degree hub dominates PLAIN PPR but a seed-specific node wins after specificity normalization", () => {
    const index = hubIndex();
    const pack = assembleAnswerPack(index, "zorptacular");

    const byPpr = [...pack.neighborhood].sort((a, b) => b.ppr - a.ppr);
    // Raw personalized PPR: the universally-central hub carries the most mass.
    expect(byPpr[0]!.node_id).toBe("hub");

    // But the neighborhood is RANKED by specificity, and the hub's huge
    // background centrality divides it down: the seed-specific answer ranks above
    // the hub. The hub is demoted out of the top of the specificity ranking.
    const hubSpecRank = pack.neighborhood.findIndex((n) => n.node_id === "hub");
    const seedRank = pack.neighborhood.findIndex((n) => n.node_id === "seednode");
    const answerRank = pack.neighborhood.findIndex((n) => n.node_id === "answer");
    expect(seedRank).toBeGreaterThanOrEqual(0);
    expect(answerRank).toBeGreaterThanOrEqual(0);
    // Seed-specific nodes (seed + answer) out-rank the hub under specificity…
    expect(seedRank).toBeLessThan(hubSpecRank);
    expect(answerRank).toBeLessThan(hubSpecRank);
    // …yet the hub still carries (and reports) the highest raw personalized ppr,
    // proving the re-rank is what flipped the order, not the underlying PPR math.
    const hub = pack.neighborhood.find((n) => n.node_id === "hub")!;
    const answer = pack.neighborhood.find((n) => n.node_id === "answer")!;
    expect(hub.ppr).toBeGreaterThan(answer.ppr);
    expect(answer.specificity).toBeGreaterThan(hub.specificity);
  });

  it("a larger specificityPrior smooths the lift (less leaf-explosion) and stays deterministic", () => {
    const index = hubIndex();
    const a = assembleAnswerPack(index, "zorptacular");
    const b = assembleAnswerPack(index, "zorptacular");
    // deterministic.
    expect(a.neighborhood.map((n) => n.node_id)).toEqual(b.neighborhood.map((n) => n.node_id));
    // The prior is honored: prior=0 is the bare ratio, a positive prior shifts scores.
    const bare = assembleAnswerPack(index, "zorptacular", { specificityPrior: 0 });
    const smoothed = assembleAnswerPack(index, "zorptacular", { specificityPrior: 1 });
    const bareSeed = bare.neighborhood.find((n) => n.node_id === "seednode")!;
    const smoothSeed = smoothed.neighborhood.find((n) => n.node_id === "seednode")!;
    expect(bareSeed.specificity).not.toBe(smoothSeed.specificity);
  });
});

/**
 * Two structurally-IDENTICAL nodes (same seed distance, same degree → same
 * specificity), differing ONLY in `type`: a structural ChapterOrStory vs an
 * entity Character. Only the type demotion can separate them — this is the
 * mystery pathology where chapters/works crowd the answer entities out.
 */
function typedTwinIndex() {
  const G = new Graph({ type: "undirected" });
  G.mergeNode("seed", { label: "rare zorptacular keyword", type: "Fact", community: 0 });
  G.mergeNode("chap", { label: "the narrating twin", type: "ChapterOrStory", community: 1 });
  G.mergeNode("char", { label: "the culprit twin", type: "Character", community: 2 });
  G.mergeEdge("seed", "chap", { confidence: "EXTRACTED", weight: 1 });
  G.mergeEdge("seed", "char", { confidence: "EXTRACTED", weight: 1 });
  return buildSearchIndex(G);
}

describe("answer-pack structural-type demotion (entities over chapters/works)", () => {
  it("demotes a structural ChapterOrStory below a structurally-identical Character entity", () => {
    const index = typedTwinIndex();
    const pack = assembleAnswerPack(index, "zorptacular");
    const chap = pack.neighborhood.findIndex((n) => n.node_id === "chap");
    const char = pack.neighborhood.findIndex((n) => n.node_id === "char");
    expect(chap).toBeGreaterThanOrEqual(0);
    expect(char).toBeGreaterThanOrEqual(0);
    // The entity ranks ABOVE the structurally-identical chapter…
    expect(char).toBeLessThan(chap);
    // …purely via the type demotion: their underlying specificity is equal.
    const cn = pack.neighborhood.find((n) => n.node_id === "char")!;
    const ch = pack.neighborhood.find((n) => n.node_id === "chap")!;
    expect(cn.specificity).toBeCloseTo(ch.specificity, 6);
    expect(ch.type).toBe("ChapterOrStory");
  });

  it("structuralDemotion:1 disables it — type-less / code graphs are unaffected", () => {
    const index = typedTwinIndex();
    // With demotion off, equal-specificity twins fall back to deterministic docId
    // order ("chap" < "char"), so the Character is NOT lifted by type.
    const pack = assembleAnswerPack(index, "zorptacular", { structuralDemotion: 1 });
    const chap = pack.neighborhood.findIndex((n) => n.node_id === "chap");
    const char = pack.neighborhood.findIndex((n) => n.node_id === "char");
    expect(chap).toBeLessThan(char);
  });
});
