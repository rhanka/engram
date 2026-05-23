/**
 * Track F F-0816-P2 (row 6) — port of safishamsi 86109e9 (#937).
 *
 * `deduplicateByLabel` used ASCII-only character class `[^a-z0-9 ]+` in the
 * canonical dedup key, so any node whose label was entirely composed of
 * CJK / Cyrillic / Greek / accented characters collapsed to the empty
 * string and was silently skipped from the dedup pass. Upstream switched
 * to a Unicode-aware normalization: NFKC + casefold + collapse runs of
 * non-word characters. Match that behavior so CJK labels are deduplicated
 * the same way ASCII labels already were.
 *
 * The existing TS guard against short noise (`compactLabel.length <= 3`)
 * is kept as an intentional delta but must NOT silently exclude CJK
 * tokens that already carry meaningful semantic weight at 2 characters.
 */
import { describe, expect, it } from "vitest";

import { deduplicateByLabel } from "../src/build.js";
import type { Extraction } from "../src/types.js";

function ext(nodes: Extraction["nodes"], edges: Extraction["edges"] = []): Extraction {
  return {
    nodes,
    edges,
    hyperedges: [],
    input_tokens: 0,
    output_tokens: 0,
  };
}

describe("Track F F-0816-P2 (row 6) — CJK/Unicode label dedup", () => {
  it("deduplicates duplicate CJK labels across chunks", () => {
    // 前端 (Frontend) appears twice from two semantic chunks. Pre-fix:
    // both labels normalized to "" via [^a-z0-9 ] and were left intact.
    const extraction = ext([
      { id: "frontend_c1", label: "前端开发", source_file: "docs/前端.md", file_type: "document" },
      { id: "frontend", label: "前端开发", source_file: "docs/前端.md", file_type: "document" },
    ], [
      { source: "frontend_c1", target: "frontend", relation: "mentions", confidence: "EXTRACTED", source_file: "docs/前端.md" },
    ]);
    const out = deduplicateByLabel(extraction);
    // The two CJK-only labels must collapse to a single node.
    expect(out.nodes).toHaveLength(1);
    // Self-loop edges are dropped after dedup.
    expect(out.edges.filter((e) => e.source !== e.target)).toHaveLength(0);
  });

  it("deduplicates accented Latin labels via NFKC + casefold", () => {
    const extraction = ext([
      { id: "cafe_c1", label: "Café Société", source_file: "docs/cafe.md", file_type: "document" },
      { id: "cafe", label: "café société", source_file: "docs/cafe.md", file_type: "document" },
    ]);
    const out = deduplicateByLabel(extraction);
    expect(out.nodes).toHaveLength(1);
  });

  it("keeps non-CJK SKU-like labels untouched (existing TS intentional delta)", () => {
    const extraction = ext([
      { id: "sku_c1", label: "ABC-123", source_file: "data/skus.md", file_type: "document" },
      { id: "sku_c2", label: "abc-123", source_file: "data/skus2.md", file_type: "document" },
    ]);
    const out = deduplicateByLabel(extraction);
    // SKU-like labels are intentionally excluded from dedup — preserve.
    expect(out.nodes).toHaveLength(2);
  });

  it("does not over-merge distinct CJK labels", () => {
    const extraction = ext([
      { id: "frontend", label: "前端开发", source_file: "docs/frontend.md", file_type: "document" },
      { id: "backend", label: "后端开发", source_file: "docs/backend.md", file_type: "document" },
    ]);
    const out = deduplicateByLabel(extraction);
    expect(out.nodes).toHaveLength(2);
  });

  it("treats fullwidth and halfwidth digits as equivalent via NFKC", () => {
    // NFKC canonicalises fullwidth digits "１２３" to "123", letting Unicode
    // labels with mixed widths dedup the same way ASCII ones already do.
    const extraction = ext([
      { id: "topic_c1", label: "Topic１２３", source_file: "docs/t.md", file_type: "document" },
      { id: "topic_c2", label: "Topic123", source_file: "docs/t.md", file_type: "document" },
    ]);
    const out = deduplicateByLabel(extraction);
    expect(out.nodes).toHaveLength(1);
  });
});
