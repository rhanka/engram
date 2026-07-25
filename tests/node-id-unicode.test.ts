/**
 * Track F residual — Unicode-safe node identity (port of safishamsi `95e2c5e`, #811).
 *
 * The TypeScript `_makeId` was byte-equivalent to upstream's pre-`95e2c5e`
 * implementation: `combined.replace(/[^a-zA-Z0-9]+/g, "_")`. Every non-ASCII
 * name was therefore erased, which is a correctness failure for a generic
 * multimodal knowledge-graph product whose corpora are routinely French,
 * Japanese, Russian or Greek prose rather than ASCII source code.
 *
 * Measured on the pre-fix implementation:
 *
 *   _makeId("doc", "日本語")  -> "doc"        // collides with the file node
 *   _makeId("doc", "中文")    -> "doc"        // ...and with every other symbol
 *   _makeId("notes", "café")  -> "notes_caf"  // composed U+00E9 dropped
 *   _makeId("notes", "café")  -> "notes_cafe" // decomposed e+U+0301 kept
 *   _makeId("notes", "Évariste") -> "notes_variste"
 *
 * The two `café` spellings are the same word and must produce the same id;
 * `日本語` and `中文` are different words and must produce different ids.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { makeNodeId, normalizeIdPart } from "../src/node-id.js";
import { extractWithDiagnostics } from "../src/extract.js";
import { codeFileNodeId } from "../src/extract-git.js";
import { queryTerms, normalizeSearchText } from "../src/search.js";
import { registryRecordsToExtraction } from "../src/profile-registry.js";
import type { NormalizedOntologyProfile, RegistryRecord } from "../src/types.js";

/** The exact pre-fix implementation, kept as the ASCII non-regression oracle. */
function legacyMakeId(...parts: string[]): string {
  const combined = parts
    .filter(Boolean)
    .map((p) => p.replace(/^[_.]+|[_.]+$/g, ""))
    .join("_");
  const cleaned = combined.replace(/[^a-zA-Z0-9]+/g, "_");
  return cleaned.replace(/^_+|_+$/g, "").toLowerCase();
}

describe("Unicode-safe node ids (upstream 95e2c5e / #811)", () => {
  it("keeps distinct non-ASCII symbols distinct instead of collapsing them", () => {
    const a = makeNodeId("doc", "日本語");
    const b = makeNodeId("doc", "中文");
    const fileNode = makeNodeId("doc");

    expect(a).not.toBe("");
    expect(b).not.toBe("");
    expect(a).not.toBe(b);
    // The pre-fix bug: both symbols degenerated onto the file node id.
    expect(a).not.toBe(fileNode);
    expect(b).not.toBe(fileNode);
    expect(a).toBe("doc_日本語");
  });

  it("NFKC-folds composed and decomposed spellings onto one id", () => {
    const composed = "café"; // café  (U+00E9)
    const decomposed = "café"; // café (e + U+0301)
    expect(composed).not.toBe(decomposed); // genuinely different JS strings

    expect(makeNodeId("notes", composed)).toBe(makeNodeId("notes", decomposed));
    expect(makeNodeId("notes", composed)).toBe("notes_café");
  });

  it("preserves accented letters rather than deleting them", () => {
    expect(makeNodeId("notes", "Évariste")).toBe("notes_évariste");
    expect(makeNodeId("notes", "enquête")).toBe("notes_enquête");
    // Distinct people must not merge just because one name is accented.
    expect(makeNodeId("notes", "Évariste")).not.toBe(makeNodeId("notes", "variste"));
  });

  it("keeps Cyrillic, Greek and fullwidth forms addressable", () => {
    expect(makeNodeId("doc", "Москва")).toBe("doc_москва");
    expect(makeNodeId("doc", "Ελλάδα")).toBe("doc_ελλάδα");
    // NFKC maps fullwidth digits onto their ASCII compatibility forms.
    expect(makeNodeId("doc", "Topic１２３")).toBe(makeNodeId("doc", "Topic123"));
  });

  it("is byte-for-byte identical to the legacy implementation for ASCII input", () => {
    // Guarantees the fix cannot churn existing ASCII graphs.
    const samples: string[][] = [
      ["setup", "run"],
      ["src.extract", "handleRequest"],
      ["mod", "handle__request"],
      ["mod", "handle-request"],
      ["mod", "handle.request"],
      ["_private_", "__init__"],
      ["a", "b", "c"],
      ["UPPER", "MixedCase"],
      ["with spaces", "and-dashes"],
      ["digits123", "456"],
      ["...dots...", "trailing___"],
      ["sym", "a-_-b"],
      ["", "only"],
    ];
    for (const parts of samples) {
      expect(makeNodeId(...parts)).toBe(legacyMakeId(...parts));
    }
  });

  it("normalizeIdPart preserves case and is ASCII-stable", () => {
    // Registry seed ids are case-preserving by contract.
    expect(normalizeIdPart("Poirot")).toBe("Poirot");
    expect(normalizeIdPart("process-std-am")).toBe("process_std_am");
    expect(normalizeIdPart("  Hercule Poirot  ")).toBe("Hercule_Poirot");
    // ...and no longer erases non-Latin record ids.
    expect(normalizeIdPart("日本語")).toBe("日本語");
    expect(normalizeIdPart("中文")).toBe("中文");
    expect(normalizeIdPart("日本語")).not.toBe(normalizeIdPart("中文"));
  });

  it("codeFileNodeId stays the extractor's twin for non-ASCII paths", () => {
    // extract-git.makeId and extract._makeId must not drift apart, otherwise
    // git-projection nodes stop joining onto code file nodes.
    expect(codeFileNodeId("/repo", "/repo/src/données.ts")).toBe(
      makeNodeId("src.données"),
    );
    expect(codeFileNodeId("/repo", "/repo/src/données.ts")).not.toBe(
      codeFileNodeId("/repo", "/repo/src/donnees.ts"),
    );
  });
});

describe("Unicode-safe node ids — prose extraction path", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-uid-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("gives every CJK/accented markdown heading its own non-empty node id", async () => {
    // The markdown extractor is the prose path — the one that matters for a
    // multimodal corpus. Pre-fix, all of these headings collapsed onto the
    // file node id (or an empty id) inside one document.
    const doc = join(dir, "récit.md");
    const other = join(dir, "notes.md");
    writeFileSync(
      doc,
      [
        "# 日本語",
        "本文。",
        "",
        "# 中文",
        "正文。",
        "",
        "# Enquête à Paris",
        "Texte.",
        "",
        "# Москва",
        "Текст.",
        "",
      ].join("\n"),
    );
    writeFileSync(other, "# Intro\n\nText.\n");

    const { extraction } = await extractWithDiagnostics([doc, other]);
    const ids = extraction.nodes.map((n) => n.id);

    // No node may carry an empty id.
    expect(ids.filter((id) => !id || id.length === 0)).toEqual([]);

    // The document's own file node keeps its accented stem.
    const fileNode = extraction.nodes.find((n) => n.label === "récit.md");
    expect(fileNode).toBeDefined();
    expect(fileNode!.id).toBe("récit");

    // Each heading id is derived from the heading text, not from a positional
    // fallback. Pre-fix, `récit` folded to `r_cit` and EVERY heading collapsed
    // onto it, so the extractor's duplicate guard silently swapped in a
    // line-number id (`r_cit_1`, `r_cit_4`, ...) — distinct, but semantically
    // empty and unstable under any edit above the heading.
    const headingLabels = ["日本語", "中文", "Enquête à Paris", "Москва"];
    for (const label of headingLabels) {
      const node = extraction.nodes.find((n) => n.label === label);
      expect(node, `missing node for heading ${label}`).toBeDefined();
      expect(node!.id).toBe(makeNodeId("récit", label));
    }

    const headingIds = headingLabels.map(
      (label) => extraction.nodes.find((n) => n.label === label)!.id,
    );
    expect(new Set(headingIds).size).toBe(headingLabels.length);
    expect(headingIds).not.toContain(fileNode!.id);
  });
});

describe("Unicode-safe node ids — entity registry seeds", () => {
  it("no longer drops non-Latin registry records as duplicates", () => {
    const profile = {
      id: "people",
      version: "1",
      profile_hash: "profile-hash",
    } as unknown as NormalizedOntologyProfile;

    const extraction = registryRecordsToExtraction(
      {
        people: [
          {
            registryId: "people",
            id: "日本語",
            label: "日本語",
            aliases: [],
            nodeType: "Person",
            sourceFile: "/tmp/people.csv",
            raw: {},
          },
          {
            registryId: "people",
            id: "中文",
            label: "中文",
            aliases: [],
            nodeType: "Person",
            sourceFile: "/tmp/people.csv",
            raw: {},
          },
          {
            registryId: "people",
            id: "Évariste",
            label: "Évariste Galois",
            aliases: [],
            nodeType: "Person",
            sourceFile: "/tmp/people.csv",
            raw: {},
          },
        ],
      } as Record<string, RegistryRecord[]>,
      profile,
    );

    // Pre-fix, all three ids folded to `registry_people_` and the `seen` guard
    // silently discarded the 2nd and 3rd records.
    expect(extraction.nodes).toHaveLength(3);
    const ids = extraction.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain("registry_people_日本語");
    expect(ids).toContain("registry_people_中文");
    expect(ids).toContain("registry_people_Évariste");
  });
});

describe("CLI query tokenisation shares the central rule (upstream 020cca2 / #964)", () => {
  it("keeps two-character non-ASCII terms that the CLI path used to drop", () => {
    // The `graphify query` command used to run
    // `normalizeSearchText(q).split(/\s+/).filter((t) => t.length > 2)`,
    // applying the short-token gate to every script.
    const question = "前端 依赖 install";
    const legacy = normalizeSearchText(question)
      .split(/\s+/)
      .filter((t) => t.length > 2);
    expect(legacy).not.toContain("前端");
    expect(legacy).not.toContain("依赖");

    const terms = queryTerms(normalizeSearchText(question));
    expect(terms).toContain("前端");
    expect(terms).toContain("依赖");
    expect(terms).toContain("install");
  });

  it("still drops short English filler and deaccents to match label scoring", () => {
    const terms = queryTerms(normalizeSearchText("Where is the café to be found"));
    expect(terms).not.toContain("is");
    expect(terms).not.toContain("to");
    // scoreSearchText compares against deaccented labels, so terms deaccent too.
    expect(terms).toContain("cafe");
  });
});
