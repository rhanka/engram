/**
 * `graphify cite` — CJK term selection width (INC-2).
 *
 * The grounding engine never lacked CJK *support*: `normalizeForMatch` passes
 * ideographs through untouched and the main match path is by substring, not by
 * token. The one door that shuts on CJK is the WIDTH gate in `selectNodeTerms`
 * — `length >= 4` — which is calibrated for alphabetic scripts. A CJK entity of
 * four graphemes grounds today; one of two or three is dropped in silence.
 *
 * That is a width bug, not a structural incapacity, so these tests pin the
 * width rule from both sides:
 *  (1) 2- and 3-grapheme CJK terms are SELECTED (the defect);
 *  (2) 4-grapheme CJK already worked and must keep working (regression guard,
 *      and a canary: if `deaccent` ever mangles ideographs this fails first);
 *  (3) short LATIN terms stay rejected — widening CJK must not widen Latin;
 *  (4) the anti-hallucination invariant is untouched: every emitted quote is
 *      still verbatim. Widening SELECTION changes what we look for, never what
 *      we accept.
 */
import { describe, expect, it } from "vitest";
import {
  groundNodeCitations,
  normalizeForMatch,
  parseSource,
  selectNodeTerms,
  verifyVerbatim,
} from "../src/cite-grounding.js";

const CJK_PLAIN = [
  "第一章 東京の朝",
  "",
  "東京は日本の首都であり、遠くに富士山を望むことができる。",
  "",
  "ソニーは横浜に研究所を構えている。",
  "",
  "서울은 대한민국의 수도이다.",
].join("\n");

const termsOf = (label: string, extra: Record<string, unknown> = {}) =>
  selectNodeTerms({ id: "n1", label, file_type: "concept", ...extra }).terms;

describe("selectNodeTerms — CJK terms are selected on information width, not grapheme count", () => {
  it("a TWO-ideograph term is selected (東京)", () => {
    expect(termsOf("東京")).toContain("東京");
  });

  it("a THREE-ideograph term is selected (富士山)", () => {
    expect(termsOf("富士山")).toContain("富士山");
  });

  /**
   * Hangul is a deliberate NON-case for the width rule, pinned so nobody
   * "fixes" it later: `deaccent` normalizes NFKD, which decomposes precomposed
   * syllables into conjoining jamo — 서울 (2 code points) becomes 5. It therefore
   * always cleared the old `length >= 4` gate, and the stored term is the
   * DECOMPOSED form, never the NFC literal. Assert through `normalizeForMatch`
   * rather than against a source-file literal, or this compares two strings
   * that merely look alike.
   */
  it("a two-syllable Hangul term is selected, in its decomposed form (서울)", () => {
    expect(termsOf("서울")).toContain(normalizeForMatch("서울"));
    expect(normalizeForMatch("서울")).not.toBe("서울");
  });

  it("a three-mora Katakana term is selected (ソニー)", () => {
    expect(termsOf("ソニー")).toContain("ソニー");
  });

  it("a FOUR-ideograph term still works — regression guard and deaccent canary", () => {
    expect(termsOf("北京大学")).toContain("北京大学");
  });

  it("CJK aliases are selected on the same width rule", () => {
    expect(termsOf("Tokyo Metropolis", { aliases: ["東京"] })).toContain("東京");
  });

  it("a LONE ideograph stays rejected — one character is too ambiguous to ground", () => {
    expect(termsOf("日")).not.toContain("日");
  });

  it("short LATIN terms stay rejected — the Latin gate must not widen", () => {
    expect(termsOf("abc")).not.toContain("abc");
    expect(termsOf("de")).not.toContain("de");
  });

  it("a four-letter Latin term is still selected — unchanged behaviour", () => {
    expect(termsOf("abcd")).toContain("abcd");
  });
});

describe("groundNodeCitations — a short CJK entity grounds with a VERBATIM quote", () => {
  const parsed = parseSource(CJK_PLAIN, "plain-text");
  const norm = normalizeForMatch(CJK_PLAIN);
  const ground = (attrs: Record<string, unknown>) =>
    groundNodeCitations(attrs, parsed, norm, { topK: 6, sourceLabel: "cjk.txt" });

  it("東京 (2 graphemes) grounds into the body", () => {
    const cites = ground({ id: "c1", label: "東京", file_type: "concept" });
    expect(cites.length).toBeGreaterThan(0);
    expect(cites.some((c) => c.quote.includes("東京"))).toBe(true);
    for (const c of cites) expect(verifyVerbatim(c.quote, norm)).toBe(true);
  });

  it("富士山 (3 graphemes) grounds into the body", () => {
    const cites = ground({ id: "c2", label: "富士山", file_type: "concept" });
    expect(cites.length).toBeGreaterThan(0);
    expect(cites.some((c) => c.quote.includes("富士山"))).toBe(true);
    for (const c of cites) expect(verifyVerbatim(c.quote, norm)).toBe(true);
  });

  it("서울 grounds end-to-end despite the NFKD jamo decomposition", () => {
    const cites = ground({ id: "c4", label: "서울", file_type: "concept" });
    expect(cites.length).toBeGreaterThan(0);
    for (const c of cites) expect(verifyVerbatim(c.quote, norm)).toBe(true);
  });

  it("a CJK entity ABSENT from the source still emits nothing (no fabrication)", () => {
    const cites = ground({ id: "c3", label: "大阪", file_type: "concept" });
    expect(cites).toEqual([]);
  });
});
