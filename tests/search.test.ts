import { describe, expect, it } from "vitest";
import { normalizeSearchText, textMatchesQuery } from "../src/search.js";

describe("search normalization", () => {
  it("matches labels regardless of diacritics and case", () => {
    expect(normalizeSearchText("Résumé")).toBe("resume");
    expect(textMatchesQuery("Résumé Parser", "resume")).toBe(true);
    expect(textMatchesQuery("Déjà Vu Analyzer", "deja analyzer")).toBe(true);
  });
});
