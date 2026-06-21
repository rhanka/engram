import { describe, expect, it } from "vitest";

import {
  buildBm25Index,
  defaultBm25Params,
  idf,
  scoreBm25,
  type Bm25Doc,
} from "../src/retrieval/bm25.js";
import { queryTerms } from "../src/search.js";

function topDoc(index: ReturnType<typeof buildBm25Index>, query: string): number {
  const hits = scoreBm25(index, queryTerms(query));
  return hits.length > 0 ? hits[0]!.doc : -1;
}

describe("BM25 core (T1 — it is REAL BM25, not term-overlap)", () => {
  it("exhibits IDF: a rare term outranks a common term at equal TF", () => {
    // "common" appears in every doc; "zebra" in exactly one. A query for both
    // should rank the doc that has the rare term, even though every doc has
    // "common" once.
    const docs: Bm25Doc[] = [
      { label: "common alpha" },
      { label: "common beta" },
      { label: "common zebra" },
      { label: "common gamma" },
    ];
    const index = buildBm25Index(docs);
    // A term in every doc (df==N) has near-zero IDF; a rare term (df=1) has a
    // much higher IDF — so the rare term dominates the ranking.
    expect(idf(4, 1)).toBeGreaterThan(idf(4, 4));
    expect(idf(4, 4)).toBeLessThan(0.2);
    expect(topDoc(index, "common zebra")).toBe(2);
  });

  it("exhibits TF saturation (k1): a 2nd occurrence adds less than the 1st", () => {
    const docs: Bm25Doc[] = [{ label: "alpha" }, { label: "alpha alpha" }, { label: "beta" }];
    const index = buildBm25Index(docs);
    const hits = scoreBm25(index, queryTerms("alpha"));
    const s1 = hits.find((h) => h.doc === 0)!.score;
    const s2 = hits.find((h) => h.doc === 1)!.score;
    // doc1 has tf=2 (but length 2) and doc0 tf=1 (length 1). With saturation +
    // length-norm the marginal gain of the second occurrence is sub-linear:
    // the second occurrence does NOT double the score.
    expect(s2).toBeLessThan(2 * s1);
  });

  it("exhibits length-norm (b): a term in a short doc outranks the same term in a long doc", () => {
    const longText = `target ${"filler ".repeat(40)}`.trim();
    const docs: Bm25Doc[] = [
      { label: "target" }, // short
      { label: longText }, // long, target diluted
    ];
    const index = buildBm25Index(docs);
    const hits = scoreBm25(index, queryTerms("target"));
    const short = hits.find((h) => h.doc === 0)!.score;
    const long = hits.find((h) => h.doc === 1)!.score;
    expect(short).toBeGreaterThan(long);
  });

  it("reads the entity BODY (description + quote), not just the label", () => {
    // scoreSearchText never reads the body; BM25F does.
    const docs: Bm25Doc[] = [
      { label: "node one", description: "the suspect confessed at midnight" },
      { label: "node two", quote: "a verbatim murder weapon was found" },
      { label: "node three" },
    ];
    const index = buildBm25Index(docs);
    expect(topDoc(index, "confessed")).toBe(0); // matched in description
    expect(topDoc(index, "weapon")).toBe(1); // matched in quote
  });

  it("label field outweighs body fields (BM25F weighting)", () => {
    const docs: Bm25Doc[] = [
      { label: "poison", description: "unrelated text here padding padding" },
      { label: "unrelated", description: "poison mentioned in passing here" },
    ];
    const index = buildBm25Index(docs);
    expect(topDoc(index, "poison")).toBe(0); // label hit beats description hit
  });

  it("is deterministic and ties break by doc index ascending", () => {
    const docs: Bm25Doc[] = [{ label: "alpha" }, { label: "alpha" }, { label: "alpha" }];
    const index = buildBm25Index(docs);
    const a = scoreBm25(index, queryTerms("alpha"));
    const b = scoreBm25(index, queryTerms("alpha"));
    expect(a).toEqual(b);
    expect(a.map((h) => h.doc)).toEqual([0, 1, 2]);
  });

  it("returns [] for an empty query or empty corpus", () => {
    const index = buildBm25Index([{ label: "alpha" }]);
    expect(scoreBm25(index, [])).toEqual([]);
    expect(scoreBm25(buildBm25Index([]), queryTerms("alpha"))).toEqual([]);
  });

  it("degrades field-by-field: quote/description absent simply not indexed (INV-6)", () => {
    const withBody: Bm25Doc[] = [{ label: "node", description: "rich body", quote: "a quote span" }];
    const labelOnly: Bm25Doc[] = [{ label: "node" }];
    const i1 = buildBm25Index(withBody);
    const i2 = buildBm25Index(labelOnly);
    // The label-only index has a strictly smaller postings vocabulary.
    expect(Object.keys(i2.postings).length).toBeLessThan(Object.keys(i1.postings).length);
    // ...but querying the label still works in both.
    expect(topDoc(i2, "node")).toBe(0);
  });

  it("uses the SAME tokenizer as queryTerms (index = query)", () => {
    const params = defaultBm25Params();
    // queryTerms drops pure-English tokens of length <= 2 ("of") but keeps "id".
    const docs: Bm25Doc[] = [{ label: "of an extraction" }];
    const index = buildBm25Index(docs, params);
    // pure-English tokens of length <= 2 ("of", "an") are dropped by queryTerms.
    expect(index.postings.of).toBeUndefined();
    expect(index.postings.an).toBeUndefined();
    expect(index.postings.extraction).toBeDefined();
  });
});
