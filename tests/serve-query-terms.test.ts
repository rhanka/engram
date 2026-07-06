/**
 * Track F F-0816-P2 (row 12) — port of safishamsi 020cca2 (#964).
 *
 * Upstream `serve.py` and `benchmark.py` filtered every query token with
 * `len > 2`, which dropped two-character Chinese / Japanese / Korean
 * terms (e.g. 前端, 依赖, 安装) while trying to suppress short English
 * noise. Upstream introduced a centralised `_query_terms()` helper that
 * applies the length gate only to pure-English tokens so mixed and
 * non-English terms remain searchable. Port the same contract via
 * `queryTerms()` in src/search.ts and route the MCP `query_graph`
 * tokenization through it.
 */
import { describe, expect, it } from "vitest";

import { dropQueryStopwords, queryTerms } from "../src/search.js";
import { tokenizeField } from "../src/retrieval/bm25.js";

describe("Track F F-0816-P2 (row 12) — queryTerms", () => {
  it("keeps two-character non-English terms (CJK)", () => {
    expect(queryTerms("前端 dependency 依赖 install 安装 to of 包管理器 项目约定 a前"))
      .toEqual(["前端", "dependency", "依赖", "install", "安装", "包管理器", "项目约定", "a前"]);
  });

  it("filters short pure-English noise (<=2 chars)", () => {
    expect(queryTerms("to of by a an it of in on")).toEqual([]);
    expect(queryTerms("the cat is on a mat")).toEqual(["the", "cat", "mat"]);
  });

  it("normalises case for English tokens", () => {
    expect(queryTerms("AlphaService BetaRepository")).toEqual([
      "alphaservice",
      "betarepository",
    ]);
  });

  it("returns empty array on empty / whitespace input", () => {
    expect(queryTerms("")).toEqual([]);
    expect(queryTerms("   \n\t")).toEqual([]);
  });

  it("treats mixed ASCII+CJK tokens as non-English (kept)", () => {
    // Single ASCII char prefixed before CJK ("a前") is not pure English -
    // upstream keeps it. Same goes for words like "前end" or "café".
    expect(queryTerms("a前 café résumé")).toEqual(["a前", "café", "résumé"]);
  });

  it("strips punctuation from terms (upstream 80301a0 / #994)", () => {
    // Python tokenises with re.findall(r"\w+", raw.lower()): "extract?"
    // must match the "extract" node, and a trailing "?" must not smuggle
    // short English stopwords past the length filter ("ok?" -> dropped).
    expect(queryTerms("what calls extract?")).toEqual(["what", "calls", "extract"]);
    expect(queryTerms("ok? graph.json!")).toEqual(["graph", "json"]);
  });

  it("filters short Latin-with-diacritic tokens like é but keeps semantic CJK pairs", () => {
    // A single accented letter like "é" alone is still short noise; the
    // upstream helper does not treat single accented chars as semantic.
    // We follow the upstream rule: short non-English (length <= 2) tokens
    // that contain ANY non-ASCII char are kept.
    expect(queryTerms("é 前 ok hello")).toEqual(["é", "前", "hello"]);
  });
});

describe("query stopwords (upstream 6e97088)", () => {
  it("drops question/filler words so content terms drive seeding", () => {
    // "how does the frontier cache work" must reduce to the content terms,
    // or it seeds on "how"/"the"/"work" (which prefix-match prose labels
    // like "Working Principles") instead of "frontier"/"cache".
    expect(dropQueryStopwords(queryTerms("how does the frontier cache work")))
      .toEqual(["frontier", "cache"]);
    expect(dropQueryStopwords(queryTerms("what calls extract?")))
      .toEqual(["calls", "extract"]);
  });

  it("falls back to the unfiltered terms when the query is all stopwords", () => {
    // queryTerms drops "it" (short English), leaving all-stopword terms;
    // the fallback keeps them rather than seeding on nothing.
    expect(dropQueryStopwords(queryTerms("how does it work")))
      .toEqual(["how", "does", "work"]);
  });

  it("never filters the index side: node text keeps stopword tokens", () => {
    // The BM25F index tokenizer must stay unfiltered so a symbol literally
    // named `work` (or a "Working Principles" doc heading) stays findable.
    expect(tokenizeField("Working Principles")).toEqual(["working", "principles"]);
    expect(queryTerms("workQueue does_work")).toEqual(["workqueue", "does_work"]);
  });
});
