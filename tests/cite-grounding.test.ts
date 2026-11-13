/**
 * `graphify cite` — heuristic GROUNDING engine (WP #24).
 *
 * Golden-oracle coverage (the brief's required tests):
 *  (1) a representative OCR-markdown fixture + entities → near-100% grounding
 *      with VERBATIM quotes (mirrors ia-aero's 876/876);
 *  (2) consistency with mystery's shipped citation sidecar SHAPE
 *      ({source_file, section, quote}) on plain text;
 *  (3) the anti-hallucination invariant: never emit a non-substring quote;
 *  (4) the type-aware matchers (person section / reference [N] / acronym /
 *      concept content-word / image context);
 *  (5) union-not-clobber (existing citations preserved, fresh folded in);
 *  (6) the contract additions (quote? / confidence? / source_location? on
 *      OntologyCitation are populated and type-check).
 */
import { describe, expect, it } from "vitest";
import Graph from "graphology";
import {
  citeGraph,
  containingDocumentFor,
  detectModality,
  groundNodeCitations,
  normalizeForMatch,
  parseSource,
  selectNodeTerms,
  verifyVerbatim,
  windowQuote,
} from "../src/cite-grounding.js";
import type { OntologyCitation } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures: a representative OCR-markdown white paper (ia-aero-shaped) and a
// plain-text novel chapter (mystery-shaped).
// ---------------------------------------------------------------------------

const OCR_MARKDOWN = [
  "---",
  'graphify_source_file: "/abs/CONTRIBUTION_AI.pdf"',
  "graphify_conversion: mistral-ocr",
  "---",
  "",
  "# CONTRIBUTION DE L'IA À UNE AÉRONAUTIQUE PÉRENNE",
  "",
  "Le système CATIA V5 est au cœur de la conception assistée par ordinateur.",
  "",
  "![img-0.jpeg](AI_images/image-000.jpg)",
  "",
  "La maintenance prédictive réduit les coûts opérationnels de manière significative.",
  "",
  "---",
  "",
  "# Entretien avec Juliette Mattioli",
  "",
  "Juliette Mattioli explique que l'apprentissage automatique transforme l'industrie.",
  "",
  "Elle insiste sur l'importance de la confiance dans les modèles déployés [12].",
  "",
  "---",
  "",
  "## Bibliographie",
  "",
  "[12] Mattioli J., Confiance et IA, 2024.",
  "",
  "L'acronyme MBSE désigne le Model-Based Systems Engineering.",
].join("\n");

const PLAIN_TEXT = [
  "THE ADVENTURE OF THE EMPTY HOUSE",
  "",
  "It was in the spring of the year 1894 that all London was interested.",
  "",
  "remarkable explorations of a Norwegian named Sigerson, but little did the public know.",
  "",
  "Chapter 2",
  "",
  "Sherlock Holmes returned to Baker Street with his old friend Watson at his side.",
].join("\n");

// ---------------------------------------------------------------------------
// Normalization + verbatim verification (the anti-hallucination substrate)
// ---------------------------------------------------------------------------

describe("normalizeForMatch", () => {
  it("deaccents, lowercases, folds ligatures, collapses whitespace", () => {
    expect(normalizeForMatch("Le SYSTÈME  CŒUR")).toBe("le systeme coeur");
    expect(normalizeForMatch("Mattioli\n\tJuliette")).toBe("mattioli juliette");
  });

  it("folds spacing inside dotted initial runs without changing numeric identifiers", () => {
    expect(normalizeForMatch("A. J. Raffles")).toBe("a.j. raffles");
    expect(normalizeForMatch("A . J . Raffles")).toBe("a.j. raffles");
    expect(normalizeForMatch("a.j. raffles")).toBe("a.j. raffles");
    expect(normalizeForMatch("C-01")).not.toBe(normalizeForMatch("C-1"));
  });
});

describe("verifyVerbatim — the anti-hallucination gate", () => {
  const src = normalizeForMatch(OCR_MARKDOWN);

  it("accepts a real substring (after normalization)", () => {
    expect(verifyVerbatim("Le système CATIA V5 est au cœur", src)).toBe(true);
  });

  it("accepts an ellipsis-padded window (padding is stripped before the check)", () => {
    expect(verifyVerbatim("… maintenance prédictive réduit les coûts …", src)).toBe(true);
  });

  it("REJECTS text that is not in the source (a hallucination)", () => {
    expect(verifyVerbatim("CATIA V5 costs four million dollars per seat", src)).toBe(false);
    expect(verifyVerbatim("the moon is made of green cheese", src)).toBe(false);
  });

  it("rejects an empty / ellipsis-only quote", () => {
    expect(verifyVerbatim("", src)).toBe(false);
    expect(verifyVerbatim("…  …", src)).toBe(false);
  });
});

describe("windowQuote", () => {
  it("returns RAW verbatim text snapped to boundaries, ellipsis-padded", () => {
    const text = "Alpha beta gamma. The needle is here. Delta epsilon zeta omega end.";
    const offset = text.indexOf("needle");
    const q = windowQuote(text, offset);
    expect(q).toContain("needle");
    // The windowed quote must itself be verbatim against the source.
    expect(verifyVerbatim(q, normalizeForMatch(text))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Modality parsing + page resolution (the process-std-am page:"unknown" fix)
// ---------------------------------------------------------------------------

describe("parseSource — OCR-markdown", () => {
  const parsed = parseSource(OCR_MARKDOWN, "ocr-markdown");

  it("skips the front-matter block so page numbering starts at 1, not 2", () => {
    // The first real paragraph (CATIA) is on page 1, NOT page 2.
    const catia = parsed.units.find((u) => u.text.includes("CATIA"));
    expect(catia?.page).toBe(1);
  });

  it("increments the page on each bare --- page break (real page resolution)", () => {
    const mattioli = parsed.units.find((u) => u.text.includes("apprentissage automatique"));
    expect(mattioli?.page).toBe(2); // after the first page break
    const biblio = parsed.units.find((u) => u.text.includes("[12] Mattioli"));
    expect(biblio?.page).toBe(3); // after the second page break
  });

  it("resolves section headings (#) per unit", () => {
    const catia = parsed.units.find((u) => u.text.includes("CATIA"));
    expect(catia?.section).toContain("AÉRONAUTIQUE");
    const interview = parsed.units.find((u) => u.text.includes("apprentissage automatique"));
    expect(interview?.section).toContain("Juliette Mattioli");
  });

  it("captures image context (prev/next prose)", () => {
    const img = parsed.images.get("image-000.jpg");
    expect(img).toBeDefined();
    expect(img?.prev).toContain("CATIA");
    expect(img?.next).toContain("maintenance prédictive");
    expect(img?.page).toBe(1);
  });
});

describe("detectModality", () => {
  it("classifies .md as ocr-markdown and .txt as plain-text", () => {
    expect(detectModality("converted/pdf/x.md")).toBe("ocr-markdown");
    expect(detectModality("corpus/raffles/text.txt")).toBe("plain-text");
  });
});

// ---------------------------------------------------------------------------
// (4) Type-aware matchers
// ---------------------------------------------------------------------------

describe("selectNodeTerms — type-aware term selection", () => {
  it("person → surname", () => {
    const sel = selectNodeTerms({ id: "p1", label: "Juliette Mattioli", file_type: "person" });
    expect(sel.surname).toBe("mattioli");
  });

  it("reference → [N] marker", () => {
    const sel = selectNodeTerms({ id: "ref_12", label: "Confiance et IA [12]", file_type: "reference" });
    expect(sel.refMarker).toBe("[12]");
  });

  it("acronym → the raw caps label", () => {
    const sel = selectNodeTerms({ id: "a1", label: "MBSE", file_type: "concept" });
    expect(sel.acronym).toBe("MBSE");
  });

  it("concept → most specific stopword-filtered content word", () => {
    const sel = selectNodeTerms({ id: "c1", label: "Maintenance prédictive", file_type: "concept" });
    // "maintenance" / "predictive" both survive; the longest is included.
    expect(sel.terms.some((t) => t.includes("predictive") || t.includes("maintenance"))).toBe(true);
  });
});

describe("groundNodeCitations — type-aware grounding produces VERBATIM quotes", () => {
  const parsed = parseSource(OCR_MARKDOWN, "ocr-markdown");
  const norm = normalizeForMatch(OCR_MARKDOWN);
  const ground = (attrs: Record<string, unknown>) =>
    groundNodeCitations(attrs, parsed, norm, { topK: 6, sourceLabel: "x.md" });

  it("person → grounds in the interview section, page resolved", () => {
    const cites = ground({ id: "p1", label: "Juliette Mattioli", file_type: "person" });
    expect(cites.length).toBeGreaterThan(0);
    expect(cites[0]?.quote).toContain("apprentissage automatique");
    expect(cites[0]?.page).toBe(2);
    expect(cites[0]?.confidence).toBe("EXTRACTED");
    // Anti-hallucination: every quote is verbatim.
    for (const c of cites) expect(verifyVerbatim(c.quote, norm)).toBe(true);
  });

  it("reference → resolves the [12] marker back into the body", () => {
    const cites = ground({ id: "ref_12", label: "Confiance et IA [12]", file_type: "reference" });
    expect(cites.length).toBeGreaterThan(0);
    expect(cites.some((c) => c.quote.includes("[12]"))).toBe(true);
    for (const c of cites) expect(verifyVerbatim(c.quote, norm)).toBe(true);
  });

  it("acronym → whole-word match", () => {
    const cites = ground({ id: "a1", label: "MBSE", file_type: "concept" });
    expect(cites.length).toBeGreaterThan(0);
    expect(cites[0]?.quote).toContain("MBSE");
    for (const c of cites) expect(verifyVerbatim(c.quote, norm)).toBe(true);
  });

  it("concept → content-word match", () => {
    const cites = ground({ id: "c1", label: "Maintenance prédictive", file_type: "concept" });
    expect(cites.length).toBeGreaterThan(0);
    expect(cites[0]?.quote.toLowerCase()).toContain("maintenance");
    for (const c of cites) expect(verifyVerbatim(c.quote, norm)).toBe(true);
  });

  it("image → grounds on surrounding prose with INFERRED confidence", () => {
    const cites = ground({ id: "i1", label: "Figure 1", file_type: "image", source_file: "AI_images/image-000.jpg" });
    expect(cites.length).toBeGreaterThan(0);
    expect(cites.every((c) => c.confidence === "INFERRED")).toBe(true);
    for (const c of cites) expect(verifyVerbatim(c.quote, norm)).toBe(true);
  });

  it("a node with no match in the source emits NOTHING (no fabrication)", () => {
    const cites = ground({ id: "x", label: "Quetzalcoatl Spaceport", file_type: "concept" });
    expect(cites).toHaveLength(0);
  });

  it("grounds a candidate term with compact dotted initials against spaced source initials", () => {
    const filler = "This opening sentence has no relevant name. ".repeat(8);
    const text = `${filler}The visitor introduced himself as A. J. Raffles before dinner.`;
    const parsed = parseSource(text, "plain-text");
    const norm = normalizeForMatch(text);

    const cites = groundNodeCitations(
      { id: "raffles", label: "Unmatched Entity", file_type: "entity", aliases: ["a.j. raffles"] },
      parsed,
      norm,
      { topK: 6, sourceLabel: "raffles.txt" },
    );

    expect(cites.length).toBeGreaterThan(0);
    expect(cites[0]!.quote).toContain("A. J. Raffles");
    expect(verifyVerbatim(cites[0]!.quote, norm)).toBe(true);
    expect(verifyVerbatim("A.J. Raffles invented a submarine in this chapter", norm)).toBe(false);
  });

  it("rationale fallback: a quote node grounds on its verbatim rationale span", () => {
    // The rationale wraps a verbatim source span in quotes; only the verbatim
    // part is emitted, and ONLY because it verifies against the source.
    const cites = ground({
      id: "q1",
      label: "Citation on CATIA",
      file_type: "quote",
      rationale: '"Le système CATIA V5 est au cœur de la conception" — context note that is a paraphrase.',
      source_location: "Introduction",
    });
    expect(cites.length).toBeGreaterThan(0);
    expect(cites[0]?.quote).toContain("CATIA");
    expect(cites[0]?.confidence).toBe("EXTRACTED");
    for (const c of cites) expect(verifyVerbatim(c.quote, norm)).toBe(true);
  });

  it("rationale fallback DROPS a paraphrase rationale (anti-hallucination)", () => {
    const cites = ground({
      id: "q2",
      label: "Paraphrased claim",
      file_type: "quote",
      rationale: "This entity represents a futuristic spaceport on a distant moon, never in the source.",
      source_location: "Nowhere",
    });
    expect(cites).toHaveLength(0); // paraphrase fails verifyVerbatim → emitted nothing
  });
});

describe("containingDocumentFor — image → markdown resolution", () => {
  it("maps an OCR image path back to its containing markdown document", () => {
    expect(containingDocumentFor(".graphify/converted/pdf/PAPER_abc_images/image-000.jpg")).toBe(
      ".graphify/converted/pdf/PAPER_abc.md",
    );
  });
  it("returns null for a non-image-convention path", () => {
    expect(containingDocumentFor("corpus/x/text.txt")).toBeNull();
  });
});

describe("citeGraph — image nodes ground against the containing document", () => {
  it("grounds an image node on the document's prev/next prose, labeled with the .md", () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const root = mkdtempSync(join(tmpdir(), "graphify-cite-img-"));
    mkdirSync(join(root, "doc_images"), { recursive: true });
    writeFileSync(join(root, "doc.md"), OCR_MARKDOWN, "utf-8");

    const G = new Graph();
    // The image node's own source_file is the (non-text) jpg; it must resolve to doc.md.
    G.addNode("i1", {
      id: "i1",
      label: "Figure 1",
      file_type: "image",
      source_file: "doc_images/image-000.jpg",
    });

    const result = citeGraph(G, { root, topK: 6 });
    expect(result.perNode.i1?.length).toBeGreaterThan(0);
    const c = result.perNode.i1![0]!;
    expect(c.source_file).toBe("doc.md"); // labeled with the containing document
    expect(c.confidence).toBe("INFERRED");
    expect(verifyVerbatim(c.quote, normalizeForMatch(OCR_MARKDOWN))).toBe(true);
  });

  it("REGRESSION: grounds via the containing doc even when the image FILE EXISTS on disk", () => {
    // The MAJOR bug: in real OCR output the binary image usually exists on disk,
    // so reading source_file first read the binary as text and the markdown
    // fallback never ran → the image node got 0 citations. The fix resolves the
    // containing document BEFORE attempting to read the binary.
    const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const root = mkdtempSync(join(tmpdir(), "graphify-cite-img-exists-"));
    mkdirSync(join(root, "doc_images"), { recursive: true });
    writeFileSync(join(root, "doc.md"), OCR_MARKDOWN, "utf-8");
    // The image file ACTUALLY EXISTS — a few bytes of (binary-ish) content that
    // would NOT verbatim-ground anything if read as text.
    writeFileSync(join(root, "doc_images", "image-000.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));

    const G = new Graph();
    G.addNode("i1", {
      id: "i1",
      label: "Figure 1",
      file_type: "image",
      source_file: "doc_images/image-000.jpg",
    });

    const result = citeGraph(G, { root, topK: 6 });
    // Must STILL ground (the bug made this 0).
    expect(result.groundedNodes).toBe(1);
    expect(result.perNode.i1?.length).toBeGreaterThan(0);
    const c = result.perNode.i1![0]!;
    expect(c.source_file).toBe("doc.md"); // the containing document, not the jpg
    expect(c.confidence).toBe("INFERRED");
    // The jpg path is NOT left dangling as "unresolved" when grounding succeeded.
    expect(result.unresolvedSources).not.toContain("doc_images/image-000.jpg");
    expect(verifyVerbatim(c.quote, normalizeForMatch(OCR_MARKDOWN))).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// Matcher precision: a verbatim quote MUST contain the matched term, and a
// surname must be a whole word in a heading (the two MAJOR grounding-quality
// defects).
// ---------------------------------------------------------------------------

describe("matcher precision — quote contains the term, surname is whole-word", () => {
  it("REGRESSION: under heavy/NBSP whitespace the emitted quote STILL contains the term", () => {
    // The term "concurrent" sits far into a paragraph padded with non-breaking
    // spaces and runs of whitespace. normalizeForMatch collapses those, so the
    // NORMALIZED offset is much smaller than the RAW offset — windowing on the
    // normalized offset would drift off the term. The fix maps normalized→raw
    // offsets exactly AND re-checks containment in the emit gate.
    const NBSP = String.fromCharCode(0x00a0); // a non-breaking space
    // A wide collapsible whitespace run: 8 NBSP + 3 spaces + 8 NBSP. Each
    // filler unit is ~22 raw chars but normalizes to ~5, so over 40 repeats the
    // RAW offset of "concurrent" races HUNDREDS of chars ahead of its
    // NORMALIZED offset — far enough to drift a normalized-offset window
    // entirely off the term (the exact defect the offset map fixes).
    const GAP = NBSP.repeat(8) + "   " + NBSP.repeat(8);
    const filler = (`mot${GAP}`).repeat(40);
    const para = `Introduction.${GAP}${filler} Le terme concurrent apparait ici precisement.`;
    const md = ["# Section", "", para].join("\n");
    const parsed = parseSource(md, "ocr-markdown");
    const norm = normalizeForMatch(md);

    // "concurrent" (a content word ≥5 chars, not a stopword) is the selected
    // term; it sits deep in the raw paragraph behind a long NBSP/whitespace run.
    const sel = selectNodeTerms({ id: "c1", label: "Système concurrent", file_type: "concept" });
    expect(sel.terms).toContain("concurrent");

    const cites = groundNodeCitations(
      { id: "c1", label: "Système concurrent", file_type: "concept" },
      parsed,
      norm,
      { topK: 6, sourceLabel: "x.md" },
    );
    expect(cites.length).toBeGreaterThan(0);
    // The whole point: the emitted quote must actually contain the matched term.
    expect(normalizeForMatch(cites[0]!.quote)).toContain("concurrent");
    for (const c of cites) expect(verifyVerbatim(c.quote, norm)).toBe(true);
  });

  it("REGRESSION: a surname must NOT match as a substring of a heading word", () => {
    // Surname "Mat" must NOT ground via the heading "Mathématiques" (substring
    // includes would wrongly attach the math paragraph). Likewise a generic
    // "Section" surname must not match "Section 3".
    const md = [
      "# Mathématiques appliquées",
      "",
      "Ce chapitre traite de l'algèbre linéaire et des matrices.",
      "",
      "# Section 3",
      "",
      "Cette section décrit le protocole expérimental.",
    ].join("\n");
    const parsed = parseSource(md, "ocr-markdown");
    const norm = normalizeForMatch(md);

    // "Mat" is the surname (label base is a single token used as surname).
    const matCites = groundNodeCitations(
      { id: "p_mat", label: "Mat", file_type: "person" },
      parsed,
      norm,
      { topK: 6, sourceLabel: "x.md" },
    );
    // "Mat" is < 4 chars so it isn't even selected as a surname term; but even a
    // 4-char near-miss must not substring-match a heading. Assert no false
    // grounding occurs on the math paragraph.
    expect(matCites.some((c) => c.quote.includes("algèbre"))).toBe(false);

    // A surname that IS a heading word substring but NOT a whole word.
    const sectionCites = groundNodeCitations(
      { id: "p_section", label: "Sectionneur", file_type: "person" },
      parsed,
      norm,
      { topK: 6, sourceLabel: "x.md" },
    );
    // "Sectionneur" is not a whole token in "Section 3" → no grounding here.
    expect(sectionCites.some((c) => c.quote.includes("protocole"))).toBe(false);
  });

  it("a real whole-word surname STILL grounds in its section", () => {
    const md = [
      "# Entretien avec Mattioli",
      "",
      "Le travail de recherche se concentre sur la confiance algorithmique.",
    ].join("\n");
    const parsed = parseSource(md, "ocr-markdown");
    const norm = normalizeForMatch(md);
    const cites = groundNodeCitations(
      { id: "p1", label: "Juliette Mattioli", file_type: "person" },
      parsed,
      norm,
      { topK: 6, sourceLabel: "x.md" },
    );
    expect(cites.length).toBeGreaterThan(0);
    expect(cites[0]!.quote).toContain("recherche");
  });
});

// ---------------------------------------------------------------------------
// (2) Mystery sidecar SHAPE consistency on plain text
// ---------------------------------------------------------------------------

describe("groundNodeCitations — plain text matches the mystery sidecar shape", () => {
  const parsed = parseSource(PLAIN_TEXT, "plain-text");
  const norm = normalizeForMatch(PLAIN_TEXT);

  it("emits {source_file, section, quote} with section = chapter/story, no page", () => {
    const cites = groundNodeCitations(
      { id: "alias_sigerson", label: "Sigerson", file_type: "concept" },
      parsed,
      norm,
      { topK: 6, sourceLabel: "corpus/sherlock/text.txt" },
    );
    expect(cites.length).toBeGreaterThan(0);
    const c = cites[0]!;
    expect(c.source_file).toBe("corpus/sherlock/text.txt");
    expect(c.quote).toContain("Sigerson");
    expect(c.section).toContain("EMPTY HOUSE");
    // mystery is plain text: no page field is emitted.
    expect(c.page).toBeUndefined();
    expect(verifyVerbatim(c.quote, norm)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (1) Near-100% grounding over a graph (mirrors ia-aero's 876/876)
// ---------------------------------------------------------------------------

function buildGraph(nodes: Record<string, unknown>[]): Graph {
  const G = new Graph();
  for (const n of nodes) G.addNode(n.id as string, n);
  return G;
}

describe("citeGraph — near-100% grounding (ia-aero 876/876 analogue)", () => {
  it("grounds every node whose term appears in the source", () => {
    // Write the fixture to a temp source the graph nodes point at.
    const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const root = mkdtempSync(join(tmpdir(), "graphify-cite-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "paper.md"), OCR_MARKDOWN, "utf-8");

    const G = buildGraph([
      { id: "p1", label: "Juliette Mattioli", file_type: "person", source_file: "src/paper.md" },
      { id: "ref_12", label: "Confiance et IA [12]", file_type: "reference", source_file: "src/paper.md" },
      { id: "a1", label: "MBSE", file_type: "concept", source_file: "src/paper.md" },
      { id: "c1", label: "Maintenance prédictive", file_type: "concept", source_file: "src/paper.md" },
      { id: "c2", label: "CATIA V5", file_type: "technology", source_file: "src/paper.md" },
    ]);

    const result = citeGraph(G, { root, topK: 6 });
    // All 5 grounded — the ia-aero "every entity cited" property on a small set.
    expect(result.groundedNodes).toBe(5);
    expect(result.totalCitations).toBeGreaterThanOrEqual(5);

    // Every emitted citation across the whole graph is verbatim.
    const norm = normalizeForMatch(OCR_MARKDOWN);
    G.forEachNode((_id, attrs) => {
      const cites = (attrs as { citations?: OntologyCitation[] }).citations ?? [];
      for (const c of cites) {
        if (typeof c.quote === "string") {
          expect(verifyVerbatim(c.quote, norm)).toBe(true);
        }
      }
    });
  });

  it("--only-missing skips nodes that already carry citations", () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const root = mkdtempSync(join(tmpdir(), "graphify-cite-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "paper.md"), OCR_MARKDOWN, "utf-8");

    const G = buildGraph([
      {
        id: "p1",
        label: "Juliette Mattioli",
        file_type: "person",
        source_file: "src/paper.md",
        citations: [{ source_file: "prior.txt", quote: "pre-existing" }],
      },
      { id: "a1", label: "MBSE", file_type: "concept", source_file: "src/paper.md" },
    ]);

    const result = citeGraph(G, { root, topK: 6, onlyMissing: true });
    expect(result.groundedNodes).toBe(1); // only MBSE, p1 skipped
    expect(result.perNode.a1).toBeDefined();
    expect(result.perNode.p1).toBeUndefined();
  });

  it("--types restricts grounding to the requested node kinds", () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const root = mkdtempSync(join(tmpdir(), "graphify-cite-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "paper.md"), OCR_MARKDOWN, "utf-8");

    const G = buildGraph([
      { id: "p1", label: "Juliette Mattioli", file_type: "person", source_file: "src/paper.md" },
      { id: "a1", label: "MBSE", file_type: "concept", source_file: "src/paper.md" },
    ]);

    const result = citeGraph(G, { root, topK: 6, types: ["person"] });
    expect(result.perNode.p1).toBeDefined();
    expect(result.perNode.a1).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (5) Union-not-clobber
// ---------------------------------------------------------------------------

describe("citeGraph — union-not-clobber", () => {
  it("preserves existing citations and folds fresh grounded ones in", () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const root = mkdtempSync(join(tmpdir(), "graphify-cite-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "paper.md"), OCR_MARKDOWN, "utf-8");

    const priorCite: OntologyCitation = { source_file: "earlier.txt", page: 99, quote: "earlier finding" };
    const G = buildGraph([
      { id: "a1", label: "MBSE", file_type: "concept", source_file: "src/paper.md", citations: [priorCite] },
    ]);

    citeGraph(G, { root, topK: 6 });
    const after = (G.getNodeAttribute("a1", "citations") ?? []) as OntologyCitation[];

    // The pre-existing citation survives (union-not-clobber)...
    expect(after.some((c) => c.source_file === "earlier.txt" && c.quote === "earlier finding")).toBe(true);
    // ...and a fresh grounded MBSE citation was added.
    expect(after.some((c) => c.source_file === "src/paper.md" && (c.quote ?? "").includes("MBSE"))).toBe(true);
    expect(after.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// (6) Contract additions — quote? / confidence? / source_location? type-check
// ---------------------------------------------------------------------------

describe("OntologyCitation contract additions (WP #24)", () => {
  it("accepts quote, confidence, and source_location as first-class optional fields", () => {
    const c: OntologyCitation = {
      source_file: "x.md",
      page: 12,
      section: "Intro",
      paragraph_id: "p3",
      source_location: "p.12 · Intro",
      quote: "verbatim passage",
      confidence: "EXTRACTED",
    };
    expect(c.quote).toBe("verbatim passage");
    expect(c.confidence).toBe("EXTRACTED");
    expect(c.source_location).toBe("p.12 · Intro");

    // Backward-compatible: a locator-only citation is still valid.
    const legacy: OntologyCitation = { source_file: "y.txt" };
    expect(legacy.quote).toBeUndefined();
    expect(legacy.confidence).toBeUndefined();
  });
});
