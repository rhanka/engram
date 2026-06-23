import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";

import {
  AUTO_LANGUAGE,
  FALLBACK_LANGUAGE,
  detectTextLanguage,
  languageDirectiveLine,
  normalizeLanguageSelection,
  resolveLanguage,
} from "../src/description-language.js";
import {
  buildNodeDescriptionPrompt,
  collectNodeContext,
  generateNodeDescriptions,
} from "../src/node-descriptions.js";
import {
  applyLabelLanguageDirective,
  buildLabelingPromptLines,
  labelCommunities,
  resolveLabelLanguages,
} from "../src/community-labeling.js";

const cleanupDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-desclang-"));
  cleanupDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

describe("detectTextLanguage", () => {
  it("detects French from stop words", () => {
    expect(
      detectTextLanguage("le colonel qui disparaît dans la maison avec son épouse"),
    ).toBe("fr");
  });

  it("detects French from diacritics even on short text", () => {
    expect(detectTextLanguage("L'héritière disparaît à Lausanne")).toBe("fr");
  });

  it("detects English from stop words", () => {
    expect(
      detectTextLanguage("the colonel who vanishes in the house with his wife"),
    ).toBe("en");
  });

  it("detects German", () => {
    expect(detectTextLanguage("der Oberst und die Frau in dem Haus")).toBe("de");
  });

  it("returns null when there is no signal (too short / ambiguous)", () => {
    expect(detectTextLanguage("X")).toBeNull();
    expect(detectTextLanguage("")).toBeNull();
    expect(detectTextLanguage(null)).toBeNull();
  });

  it("is deterministic for the same text", () => {
    const text = "une enquête sur le meurtre du colonel dans la grande maison";
    expect(detectTextLanguage(text)).toBe(detectTextLanguage(text));
  });
});

// ---------------------------------------------------------------------------
// resolveLanguage / normalizeLanguageSelection
// ---------------------------------------------------------------------------

describe("resolveLanguage", () => {
  it("a forced (non-auto) code always wins over detection", () => {
    expect(resolveLanguage("en", "fr", "de")).toBe("en");
  });

  it("auto falls through to the detected language", () => {
    expect(resolveLanguage("auto", "fr", "en")).toBe("fr");
    expect(resolveLanguage(undefined, "fr", "en")).toBe("fr");
  });

  it("auto with no detection falls back to the corpus default", () => {
    expect(resolveLanguage("auto", null, "fr")).toBe("fr");
  });

  it("falls back to English when nothing is known", () => {
    expect(resolveLanguage("auto", null, null)).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage(undefined, null, undefined)).toBe("en");
  });

  it("treats a corpus default of 'auto' as no default", () => {
    expect(resolveLanguage("auto", null, "auto")).toBe("en");
  });
});

describe("normalizeLanguageSelection", () => {
  it("empty / undefined → auto", () => {
    expect(normalizeLanguageSelection("")).toBe(AUTO_LANGUAGE);
    expect(normalizeLanguageSelection(undefined)).toBe(AUTO_LANGUAGE);
    expect(normalizeLanguageSelection("  ")).toBe(AUTO_LANGUAGE);
  });

  it("lowercases and trims a code", () => {
    expect(normalizeLanguageSelection("  FR ")).toBe("fr");
  });
});

describe("languageDirectiveLine", () => {
  it("names the language and the code", () => {
    expect(languageDirectiveLine("fr")).toContain("French");
    expect(languageDirectiveLine("fr")).toContain("(fr)");
  });
});

// ---------------------------------------------------------------------------
// Per-source detection on a node
// ---------------------------------------------------------------------------

function frenchEntity(): Graph {
  const G = new Graph({ type: "undirected" });
  G.addNode("ent_fr", {
    label: "Le Colonel Barclay",
    node_type: "Person",
    citations: [
      { source_file: "histoire.txt", quote: "le colonel qui disparaît dans la maison avec son épouse" },
    ],
  });
  G.addNode("ent_other", { label: "Lausanne", node_type: "Place" });
  G.addUndirectedEdge("ent_fr", "ent_other", { relation: "knows" });
  return G;
}

function englishEntity(id = "ent_en"): Graph {
  const G = new Graph({ type: "undirected" });
  G.addNode(id, {
    label: "Colonel Barclay",
    node_type: "Person",
    citations: [{ source_file: "story.txt", quote: "the colonel who vanishes in the house with his wife" }],
  });
  G.addNode("ent_o2", { label: "London", node_type: "Place" });
  G.addUndirectedEdge(id, "ent_o2", { relation: "knows" });
  return G;
}

describe("collectNodeContext detects the per-source language", () => {
  it("detects French from a French node's label + citations", () => {
    const ctx = collectNodeContext(frenchEntity(), "ent_fr");
    expect(ctx.sourceLang).toBe("fr");
  });

  it("an explicit node `lang` attribute is authoritative", () => {
    const G = new Graph({ type: "undirected" });
    G.addNode("ent_x", { label: "the house", node_type: "Place", lang: "DE" });
    const ctx = collectNodeContext(G, "ent_x");
    expect(ctx.sourceLang).toBe("de");
  });

  it("code symbols are language-neutral (null)", () => {
    const G = new Graph({ type: "undirected" });
    G.addNode("src_a_fn", { label: "resolveConfig()", file_type: "code" });
    const ctx = collectNodeContext(G, "src_a_fn");
    expect(ctx.sourceLang).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Prompt directive — uniform vs mixed (per-source)
// ---------------------------------------------------------------------------

describe("buildNodeDescriptionPrompt language directive", () => {
  it("auto on a French source injects a French directive (one language)", () => {
    const G = frenchEntity();
    const ctx = collectNodeContext(G, "ent_fr");
    const prompt = buildNodeDescriptionPrompt([ctx], { descriptionLang: "auto" });
    expect(prompt).toContain("Write every description in French (fr)");
    expect(prompt).not.toContain("lang=");
  });

  it("a forced 'en' overrides the detected French source", () => {
    const G = frenchEntity();
    const ctx = collectNodeContext(G, "ent_fr");
    const prompt = buildNodeDescriptionPrompt([ctx], { descriptionLang: "en" });
    expect(prompt).toContain("Write every description in English (en)");
    expect(prompt).not.toContain("French");
  });

  it("a mixed corpus emits a per-node lang= marker for each source", () => {
    const G = new Graph({ type: "undirected" });
    G.addNode("ent_fr", {
      label: "Le Colonel",
      node_type: "Person",
      citations: [{ quote: "le colonel qui disparaît dans la maison avec son épouse" }],
    });
    G.addNode("ent_en", {
      label: "The Colonel",
      node_type: "Person",
      citations: [{ quote: "the colonel who vanishes in the house with his wife" }],
    });
    const ctxFr = collectNodeContext(G, "ent_fr");
    const ctxEn = collectNodeContext(G, "ent_en");
    const prompt = buildNodeDescriptionPrompt([ctxFr, ctxEn], { descriptionLang: "auto" });
    // Per-node markers, not a single header directive.
    expect(prompt).toContain("lang=fr");
    expect(prompt).toContain("lang=en");
    expect(prompt).toContain("match each node's source language individually");
  });

  it("uses the corpus default when a node has no detectable signal", () => {
    const G = new Graph({ type: "undirected" });
    // Single ambiguous token → no detection.
    G.addNode("ent_amb", { label: "X", node_type: "Thing", citations: [{ quote: "X" }] });
    const ctx = collectNodeContext(G, "ent_amb");
    expect(ctx.sourceLang).toBeNull();
    const prompt = buildNodeDescriptionPrompt([ctx], {
      descriptionLang: "auto",
      corpusDefaultLang: "fr",
    });
    expect(prompt).toContain("Write every description in French (fr)");
  });
});

// ---------------------------------------------------------------------------
// Directive flows to BOTH the assistant batch files and the direct API path
// ---------------------------------------------------------------------------

describe("language directive flows into the assistant batch-NNN instruction file", () => {
  it("emits a French directive for a French corpus (auto)", async () => {
    const G = frenchEntity();
    const dir = tempDir();
    const result = await generateNodeDescriptions(G, {
      mode: "assistant",
      instructionDir: dir,
      quiet: true,
      descriptionLang: "auto",
    });
    expect(result.source).toBe("assistant");
    const md = readdirSync(dir).find((f) => f.endsWith(".md"))!;
    const text = readFileSync(join(dir, md), "utf-8");
    expect(text).toContain("Write every description in French (fr)");
  });

  it("a forced --description-lang en wins in the emitted file", async () => {
    const G = frenchEntity();
    const dir = tempDir();
    await generateNodeDescriptions(G, {
      mode: "assistant",
      instructionDir: dir,
      quiet: true,
      descriptionLang: "en",
    });
    const md = readdirSync(dir).find((f) => f.endsWith(".md"))!;
    const text = readFileSync(join(dir, md), "utf-8");
    expect(text).toContain("Write every description in English (en)");
    expect(text).not.toContain("French");
  });
});

describe("language directive flows into the direct (API) prompt", () => {
  it("the direct caller's prompt carries the per-source French directive", async () => {
    const G = frenchEntity();
    let captured = "";
    await generateNodeDescriptions(G, {
      provider: "anthropic",
      descriptionLang: "auto",
      callLlm: async (prompt: string) => {
        captured = prompt;
        return JSON.stringify({ ent_fr: "Le colonel Barclay." });
      },
      quiet: true,
    });
    expect(captured).toContain("Write every description in French (fr)");
  });

  it("a forced en directive reaches the direct caller's prompt", async () => {
    const G = frenchEntity();
    let captured = "";
    await generateNodeDescriptions(G, {
      provider: "anthropic",
      descriptionLang: "en",
      callLlm: async (prompt: string) => {
        captured = prompt;
        return JSON.stringify({ ent_fr: "Colonel Barclay." });
      },
      quiet: true,
    });
    expect(captured).toContain("Write every description in English (en)");
  });
});

// ---------------------------------------------------------------------------
// Community labels — per-source language
// ---------------------------------------------------------------------------

function frenchCommunities(): {
  G: Graph;
  communities: Map<number, string[]>;
} {
  const G = new Graph({ type: "undirected" });
  G.addNode("n0", { label: "le meurtre du colonel dans la maison" });
  G.addNode("n1", { label: "une enquête sur la disparition mystérieuse" });
  G.addUndirectedEdge("n0", "n1", {});
  const communities = new Map<number, string[]>([[0, ["n0", "n1"]]]);
  return { G, communities };
}

describe("resolveLabelLanguages", () => {
  it("auto detects the community language from sampled node names", () => {
    const { G, communities } = frenchCommunities();
    const { labeledCids, sampledNames } = buildLabelingPromptLines(G, communities, []);
    const byCid = resolveLabelLanguages(labeledCids, sampledNames, "auto", null);
    expect(byCid.get(0)).toBe("fr");
  });

  it("a forced code overrides detection", () => {
    const { G, communities } = frenchCommunities();
    const { labeledCids, sampledNames } = buildLabelingPromptLines(G, communities, []);
    const byCid = resolveLabelLanguages(labeledCids, sampledNames, "en", null);
    expect(byCid.get(0)).toBe("en");
  });
});

describe("applyLabelLanguageDirective", () => {
  it("uniform language → one directive, lines unchanged", () => {
    const { directive, lines } = applyLabelLanguageDirective(
      ["Community 0: a, b"],
      [0],
      new Map([[0, "fr"]]),
    );
    expect(directive.join(" ")).toContain("French");
    expect(lines[0]).toBe("Community 0: a, b");
  });

  it("mixed languages → per-line [lang=] markers", () => {
    const { directive, lines } = applyLabelLanguageDirective(
      ["Community 0: a", "Community 1: b"],
      [0, 1],
      new Map([
        [0, "fr"],
        [1, "en"],
      ]),
    );
    expect(directive.join(" ")).toContain("[lang=…]");
    expect(lines[0]).toContain("[lang=fr]");
    expect(lines[1]).toContain("[lang=en]");
  });
});

describe("labelCommunities injects the language directive into the naming prompt", () => {
  it("auto French corpus → French directive in the prompt", async () => {
    const { G, communities } = frenchCommunities();
    let captured = "";
    await labelCommunities(G, communities, {
      provider: "anthropic",
      labelLang: "auto",
      callLlm: async (prompt: string) => {
        captured = prompt;
        return JSON.stringify({ "0": "Enquête Policière" });
      },
    });
    expect(captured).toContain("Write every name in French (fr)");
  });

  it("forced en overrides the detected French community", async () => {
    const { G, communities } = frenchCommunities();
    let captured = "";
    await labelCommunities(G, communities, {
      provider: "anthropic",
      labelLang: "en",
      callLlm: async (prompt: string) => {
        captured = prompt;
        return JSON.stringify({ "0": "Police Investigation" });
      },
    });
    expect(captured).toContain("Write every name in English (en)");
  });
});
