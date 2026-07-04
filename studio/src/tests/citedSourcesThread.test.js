import { describe, expect, it } from "vitest";

import { buildSelectionThread, sameCitation } from "../lib/citedSources.js";

/**
 * Increment 2 (§S.6.1): the selection-thread builder — ONE continuous grouped
 * thread over ALL citations of ALL selected entities, in the approved order:
 * selection order → document (first appearance) → page.
 */

const HOLMES = {
  id: "e:holmes",
  label: "Sherlock Holmes",
  fallbackSourceFile: "corpus/blue-study.md",
  citations: [
    // Deliberately out of document/page order to exercise the sort:
    { source_file: "corpus/casebook.pdf", page: 7, quote: "the detective rose at dawn" },
    { source_file: "corpus/blue-study.md", section: "Chapter 2", quote: "Holmes examined the ledger" },
    { source_file: "corpus/casebook.pdf", page: 2, quote: "a violin sounded upstairs" },
  ],
};

const WATSON = {
  id: "e:watson",
  label: "John Watson",
  fallbackSourceFile: "corpus/blue-study.md",
  citations: [
    { source_file: "corpus/blue-study.md", section: "Chapter 1", quote: "Watson kept his revolver close" },
    { source_file: "corpus/notes.md", section: "Notes", quote: "the doctor wrote his notes" },
  ],
};

describe("buildSelectionThread", () => {
  it("groups per entity in SELECTION order, one group per entity with citations", () => {
    const { groups, meta } = buildSelectionThread([HOLMES, WATSON]);
    expect(groups.map((g) => g.id)).toEqual(["e:holmes", "e:watson"]);
    expect(groups.map((g) => g.label)).toEqual(["Sherlock Holmes", "John Watson"]);
    expect(groups[0].refs).toHaveLength(3);
    expect(groups[1].refs).toHaveLength(2);
    // meta is parallel to groups (same ids, same lengths).
    expect(meta.map((m) => m.id)).toEqual(["e:holmes", "e:watson"]);
    expect(meta[0].citations).toHaveLength(3);
    expect(meta[1].citations).toHaveLength(2);
  });

  it("orders refs within a group document-first (first appearance) then page ascending", () => {
    const { groups } = buildSelectionThread([HOLMES]);
    // casebook.pdf appears first in the citation list → its refs come first,
    // sorted p.2 then p.7; blue-study.md follows.
    expect(groups[0].refs.map((r) => [r.rawRef, r.page ?? null])).toEqual([
      ["corpus/casebook.pdf", 2],
      ["corpus/casebook.pdf", 7],
      ["corpus/blue-study.md", null],
    ]);
  });

  it("keeps meta.citations parallel to the SORTED refs (raw citation behind each ref)", () => {
    const { groups, meta } = buildSelectionThread([HOLMES]);
    expect(meta[0].citations[0]).toBe(HOLMES.citations[2]); // p.2
    expect(meta[0].citations[1]).toBe(HOLMES.citations[0]); // p.7
    expect(meta[0].citations[2]).toBe(HOLMES.citations[1]); // blue-study
    // And the ref at each position carries that citation's quote as excerpt.
    expect(groups[0].refs[0].excerpt).toBe("a violin sounded upstairs");
    expect(groups[0].refs[1].excerpt).toBe("the detective rose at dawn");
  });

  it("skips entities without citations (no empty groups in the thread)", () => {
    const { groups } = buildSelectionThread([
      { id: "e:empty", label: "Nobody", citations: [] },
      HOLMES,
      { id: "e:null", label: "Nothing", citations: null },
    ]);
    expect(groups.map((g) => g.id)).toEqual(["e:holmes"]);
  });

  it("fills missing locators from the entity fallbackSourceFile (adapter enrichment)", () => {
    const { groups } = buildSelectionThread([
      {
        id: "e:legacy",
        label: "Legacy",
        fallbackSourceFile: "corpus/legacy.md",
        citations: [{ section: "Intro", quote: "an unlocated passage" }],
      },
    ]);
    expect(groups[0].refs[0].rawRef).toBe("corpus/legacy.md");
  });

  it("returns empty thread for an empty/absent selection", () => {
    expect(buildSelectionThread([])).toEqual({ groups: [], meta: [] });
    expect(buildSelectionThread(null)).toEqual({ groups: [], meta: [] });
  });
});

describe("sameCitation", () => {
  it("matches by reference and by (file, page, section, quote) fields", () => {
    const a = { source_file: "corpus/a.md", page: 3, section: "S", quote: "q" };
    expect(sameCitation(a, a)).toBe(true);
    expect(sameCitation(a, { ...a })).toBe(true);
    expect(sameCitation(a, { ...a, page: 4 })).toBe(false);
    expect(sameCitation(a, { ...a, quote: "other" })).toBe(false);
    expect(sameCitation(a, null)).toBe(false);
    expect(sameCitation(null, a)).toBe(false);
  });
});
