import { describe, expect, it } from "vitest";
import { normalizeSearchText, scoreSearchText, textMatchesQuery } from "../src/search.js";

describe("search normalization", () => {
  it("matches labels regardless of diacritics and case", () => {
    expect(normalizeSearchText("Résumé")).toBe("resume");
    expect(textMatchesQuery("Résumé Parser", "resume")).toBe(true);
    expect(textMatchesQuery("Déjà Vu Analyzer", "deja analyzer")).toBe(true);
  });

  it("prefers exact label matches over longer substring matches", () => {
    const terms = normalizeSearchText("MyFunction").split(/\s+/).filter(Boolean);

    const exact = scoreSearchText("MyFunction", "src/exact.ts", terms);
    const substring = scoreSearchText("MyFunctionHelpers", "src/helpers.ts", terms);

    expect(exact).toBeGreaterThan(substring);
  });
});
