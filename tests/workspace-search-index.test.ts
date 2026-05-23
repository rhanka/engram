/**
 * Track G G6-2 (S1.1) — cross-entity search index.
 *
 * Token-gram inverted index over node label / id / aliases / source_file /
 * summary_excerpt. The contract is intentionally narrow: case-insensitive
 * substring/token match, no external dependency. Typo tolerance is
 * limited to exact prefix matching on each token (we do NOT pretend to
 * be a fuzzy search; callers that want Levenshtein should use a real
 * MiniSearch index).
 */
import { describe, expect, it } from "vitest";

import {
  buildWorkspaceSearchIndex,
  searchWorkspaceIndex,
  type WorkspaceSearchRecord,
} from "../src/workspace/search-index.js";

const records: WorkspaceSearchRecord[] = [
  {
    id: "holmes",
    label: "Sherlock Holmes",
    node_type: "Character",
    aliases: ["The detective", "Mr. Holmes"],
    source_file: "corpus/sherlock-holmes/a-study-in-scarlet/text.txt",
    summary_excerpt: "Consulting detective at 221B Baker Street.",
  },
  {
    id: "watson",
    label: "Dr Watson",
    node_type: "Character",
    aliases: ["John H. Watson"],
    source_file: "corpus/sherlock-holmes/a-study-in-scarlet/text.txt",
    summary_excerpt: "Army doctor, narrator.",
  },
  {
    id: "lupin",
    label: "Arsène Lupin",
    node_type: "Character",
    aliases: [],
    source_file: "corpus/arsene-lupin/text.txt",
    summary_excerpt: "Gentleman burglar.",
  },
  {
    id: "baker_street",
    label: "Baker Street",
    node_type: "Location",
    aliases: [],
    source_file: "corpus/sherlock-holmes/locations.txt",
    summary_excerpt: "London address shared by Holmes and Watson.",
  },
];

describe("Track G G6-2 — workspace search index", () => {
  it("returns the indexed records for an exact lowercase label hit", () => {
    const index = buildWorkspaceSearchIndex(records);
    const hits = searchWorkspaceIndex(index, "holmes");
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("holmes");
    expect(ids).toContain("baker_street"); // Holmes mentioned in summary.
  });

  it("is case-insensitive", () => {
    const index = buildWorkspaceSearchIndex(records);
    const lower = searchWorkspaceIndex(index, "HOLMES").map((h) => h.id);
    const upper = searchWorkspaceIndex(index, "holmes").map((h) => h.id);
    expect(lower.sort()).toEqual(upper.sort());
  });

  it("hits on aliases (Mr. Holmes / The detective)", () => {
    const index = buildWorkspaceSearchIndex(records);
    const aliasHit = searchWorkspaceIndex(index, "detective").map((h) => h.id);
    expect(aliasHit).toContain("holmes");
  });

  it("hits on node id directly", () => {
    const index = buildWorkspaceSearchIndex(records);
    const hit = searchWorkspaceIndex(index, "lupin").map((h) => h.id);
    expect(hit).toContain("lupin");
  });

  it("hits on source_file path tokens", () => {
    const index = buildWorkspaceSearchIndex(records);
    const hit = searchWorkspaceIndex(index, "arsene").map((h) => h.id);
    expect(hit).toContain("lupin");
  });

  it("hits on summary_excerpt", () => {
    const index = buildWorkspaceSearchIndex(records);
    const hit = searchWorkspaceIndex(index, "burglar").map((h) => h.id);
    expect(hit).toContain("lupin");
  });

  it("returns an empty array on empty query", () => {
    const index = buildWorkspaceSearchIndex(records);
    expect(searchWorkspaceIndex(index, "")).toEqual([]);
    expect(searchWorkspaceIndex(index, "   ")).toEqual([]);
  });

  it("supports prefix token-grams so 'sher' matches 'sherlock'", () => {
    // Token-gram contract: each token is indexed with its prefixes (length >= 3)
    // so a partial query like 'sher' still resolves to 'sherlock'. This is the
    // documented limit of the typo tolerance — no edit-distance / Levenshtein.
    const index = buildWorkspaceSearchIndex(records);
    const hits = searchWorkspaceIndex(index, "sher").map((h) => h.id);
    expect(hits).toContain("holmes");
  });

  it("ranks records that match more query tokens higher", () => {
    const index = buildWorkspaceSearchIndex(records);
    const hits = searchWorkspaceIndex(index, "holmes baker");
    expect(hits.length).toBeGreaterThan(0);
    // baker_street matches both "holmes" (summary) and "baker" (label) → top.
    expect(hits[0]?.id).toBe("baker_street");
  });

  it("does not crash on records missing aliases / summary_excerpt", () => {
    const minimal: WorkspaceSearchRecord[] = [
      { id: "x", label: "X", node_type: "T" },
      { id: "y", label: "Y" },
    ];
    const index = buildWorkspaceSearchIndex(minimal);
    expect(searchWorkspaceIndex(index, "x").map((h) => h.id)).toContain("x");
  });
});
