import { describe, expect, it } from "vitest";
import {
  CITATION_POLICY_GLOBAL_DEFAULT,
  resolveCitationPolicy,
  resolveCorpusType,
} from "../src/citation-policy.js";

/**
 * A minimal `.graphify_detect.json`-shaped fixture. `resolveCorpusType` reads
 * only `files` buckets + `total_words`; everything else is ignored.
 */
function detect(
  files: Partial<Record<"code" | "document" | "paper" | "image" | "video", number>>,
  totalWords = 0,
): { files: Record<string, string[]>; total_words: number } {
  const buckets: Record<string, string[]> = {
    code: [], document: [], paper: [], image: [], video: [],
  };
  for (const [bucket, count] of Object.entries(files)) {
    buckets[bucket] = Array.from({ length: count ?? 0 }, (_v, i) => `${bucket}/${i}.txt`);
  }
  const total_files = Object.values(buckets).reduce((s, v) => s + v.length, 0);
  return { files: buckets, total_words: totalWords, total_files } as never;
}

describe("resolveCorpusType", () => {
  it("classifies a code-only corpus as 'code'", () => {
    expect(resolveCorpusType(detect({ code: 40 }, 12_000))).toBe("code");
  });

  it("classifies long-form prose above the corpus-warn threshold as 'long-document'", () => {
    // documents present + total_words past the 50k warn threshold.
    expect(resolveCorpusType(detect({ document: 12 }, 120_000))).toBe("long-document");
  });

  it("classifies a paper-heavy corpus above the threshold as 'long-document'", () => {
    expect(resolveCorpusType(detect({ paper: 8 }, 80_000))).toBe("long-document");
  });

  it("classifies ontology/profile mode as 'entity-corpus' regardless of buckets", () => {
    expect(resolveCorpusType(detect({ document: 3 }, 1_000), { profileMode: true })).toBe(
      "entity-corpus",
    );
  });

  it("falls back to 'mixed' for a small mixed corpus below the threshold", () => {
    expect(resolveCorpusType(detect({ code: 5, document: 3 }, 5_000))).toBe("mixed");
  });

  it("treats short documents (below warn threshold) as 'mixed', not 'long-document'", () => {
    expect(resolveCorpusType(detect({ document: 2 }, 4_000))).toBe("mixed");
  });

  it("treats a missing / empty detect as 'mixed'", () => {
    expect(resolveCorpusType(null)).toBe("mixed");
    expect(resolveCorpusType({} as never)).toBe("mixed");
  });
});

describe("resolveCitationPolicy — corpus-type defaults", () => {
  it("code → describe cap 3, inline K 3", () => {
    const p = resolveCitationPolicy({ corpusType: "code" });
    expect(p.describeCap).toBe(3);
    expect(p.inlineTopK).toBe(3);
  });

  it("mixed (default) → describe cap 10, inline K 8", () => {
    const p = resolveCitationPolicy({ corpusType: "mixed" });
    expect(p.describeCap).toBe(10);
    expect(p.inlineTopK).toBe(8);
  });

  it("long-document → describe cap 'all', inline K 8", () => {
    const p = resolveCitationPolicy({ corpusType: "long-document" });
    expect(p.describeCap).toBe("all");
    expect(p.inlineTopK).toBe(8);
  });

  it("entity-corpus → describe cap 'all', inline K 8", () => {
    const p = resolveCitationPolicy({ corpusType: "entity-corpus" });
    expect(p.describeCap).toBe("all");
    expect(p.inlineTopK).toBe(8);
  });

  it("no corpus type → the global default (cap 10, K 8)", () => {
    const p = resolveCitationPolicy({});
    expect(p.describeCap).toBe(CITATION_POLICY_GLOBAL_DEFAULT.describeCap);
    expect(p.inlineTopK).toBe(CITATION_POLICY_GLOBAL_DEFAULT.inlineTopK);
    expect(p.describeCap).toBe(10);
    expect(p.inlineTopK).toBe(8);
  });
});

describe("resolveCitationPolicy — precedence (CLI > config > corpus-type > global)", () => {
  it("CLI flag overrides everything", () => {
    const p = resolveCitationPolicy({
      corpusType: "long-document", // would give cap 'all'
      config: { describeCap: 25, inlineTopK: 12 },
      cli: { describeCap: 4, inlineTopK: 2 },
    });
    expect(p.describeCap).toBe(4);
    expect(p.inlineTopK).toBe(2);
  });

  it("config overrides corpus-type default when no CLI flag", () => {
    const p = resolveCitationPolicy({
      corpusType: "code", // would give cap 3 / K 3
      config: { describeCap: 50, inlineTopK: 6 },
    });
    expect(p.describeCap).toBe(50);
    expect(p.inlineTopK).toBe(6);
  });

  it("corpus-type default applies when neither CLI nor config set it", () => {
    const p = resolveCitationPolicy({ corpusType: "code" });
    expect(p.describeCap).toBe(3);
    expect(p.inlineTopK).toBe(3);
  });

  it("the two knobs resolve independently (CLI K only, config cap only)", () => {
    const p = resolveCitationPolicy({
      corpusType: "long-document",
      config: { describeCap: 30 },
      cli: { inlineTopK: 5 },
    });
    // cap: no CLI cap → config cap 30 wins over corpus 'all'
    expect(p.describeCap).toBe(30);
    // K: CLI K 5 wins over corpus 8
    expect(p.inlineTopK).toBe(5);
  });

  it("accepts 'all' as a CLI describe cap override", () => {
    const p = resolveCitationPolicy({ corpusType: "code", cli: { describeCap: "all" } });
    expect(p.describeCap).toBe("all");
  });
});
