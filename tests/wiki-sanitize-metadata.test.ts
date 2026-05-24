/**
 * Regression tests for F-0816-P4 / S4.5.
 *
 * Extends the `sanitizeMetadata` helper introduced by F-0816-P3
 * (`src/security.ts`, commit `2974b1c`) to the wiki export site.
 *
 * Scope (per P3 deviation note 2): only the free-form metadata fields
 * embedded in wiki output are sanitised — at the moment, the LLM-generated
 * `description` text and the `evidence_refs` list carried by wiki
 * description sidecars. Canonical fields (`label`, `source_file`,
 * `relation`, `confidence`) are NOT double-sanitised — they already went
 * through `sanitizeLabel` at extract/export boundaries.
 *
 * Concretely: control characters are stripped and HTML-special characters
 * are escaped in the rendered description text and evidence ref code
 * spans, so a malicious doc text propagated through an LLM-extracted
 * description cannot inject markup into the wiki article.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { toWiki } from "../src/wiki.js";
import {
  WIKI_DESCRIPTION_PROMPT_VERSION,
  WIKI_DESCRIPTION_SCHEMA,
  buildWikiDescriptionCacheKey,
  type WikiDescriptionSidecarIndex,
} from "../src/wiki-descriptions.js";

const generator = {
  mode: "assistant" as const,
  provider: "assistant",
  model: null,
  prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
};

function buildDescriptions(
  communityDesc: string,
  evidenceRefs: string[],
): WikiDescriptionSidecarIndex {
  return {
    schema: "graphify_wiki_description_index_v1",
    graph_hash: "graph-a",
    prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    communities: {
      "0": {
        schema: WIKI_DESCRIPTION_SCHEMA,
        target_id: "community:0",
        target_kind: "community",
        graph_hash: "graph-a",
        status: "generated",
        description: communityDesc,
        evidence_refs: evidenceRefs,
        confidence: 0.82,
        cache_key: buildWikiDescriptionCacheKey({
          target_id: "community:0",
          target_kind: "community",
          graph_hash: "graph-a",
          ...generator,
        }),
        generator,
      },
    },
    nodes: {},
  };
}

describe("toWiki sanitizes free-form description metadata (F-0816-P4 / S4.5)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `graphify-wiki-sanitize-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("escapes HTML-special characters in description text", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("n1", { label: "A", source_file: "a.py", community: 0 });
    G.mergeNode("n2", { label: "B", source_file: "b.py", community: 0 });
    G.mergeEdge("n1", "n2", { relation: "calls", confidence: "EXTRACTED" });
    const descriptions = buildDescriptions(
      'Module <script>alert("xss")</script> & co',
      ["a.py#A"],
    );

    toWiki(
      G,
      new Map([[0, ["n1", "n2"]]]),
      tmpDir,
      {
        communityLabels: new Map([[0, "Module"]]),
        descriptions,
      },
    );

    const article = readFileSync(join(tmpDir, "Module.md"), "utf-8");
    // The raw <script> markup must not appear verbatim in the output.
    expect(article).not.toContain("<script>");
    expect(article).not.toContain("alert(\"xss\")");
    // The escaped form (or some safe substitute) must be present in its place.
    expect(article).toMatch(/&lt;script&gt;|alert\(&quot;xss&quot;\)/);
  });

  it("strips control characters from description text", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("n1", { label: "A", source_file: "a.py", community: 0 });
    G.mergeNode("n2", { label: "B", source_file: "b.py", community: 0 });
    G.mergeEdge("n1", "n2", { relation: "calls", confidence: "EXTRACTED" });
    const descriptions = buildDescriptions(
      "Module summary\x00with\x07control\x1fchars",
      ["a.py#A"],
    );

    toWiki(
      G,
      new Map([[0, ["n1", "n2"]]]),
      tmpDir,
      {
        communityLabels: new Map([[0, "Module"]]),
        descriptions,
      },
    );

    const article = readFileSync(join(tmpDir, "Module.md"), "utf-8");
    expect(article).not.toMatch(/[\x00\x07\x1f]/);
    expect(article).toContain("Module summarywithcontrolchars");
  });

  it("escapes HTML-special characters in evidence refs", () => {
    const G = new Graph({ type: "undirected" });
    G.mergeNode("n1", { label: "A", source_file: "a.py", community: 0 });
    G.mergeNode("n2", { label: "B", source_file: "b.py", community: 0 });
    G.mergeEdge("n1", "n2", { relation: "calls", confidence: "EXTRACTED" });
    const descriptions = buildDescriptions(
      "Plain description",
      ["a.py#<script>"],
    );

    toWiki(
      G,
      new Map([[0, ["n1", "n2"]]]),
      tmpDir,
      {
        communityLabels: new Map([[0, "Module"]]),
        descriptions,
      },
    );

    const article = readFileSync(join(tmpDir, "Module.md"), "utf-8");
    expect(article).not.toContain("<script>");
    // The escaped form is present somewhere in the Evidence line.
    expect(article).toMatch(/Evidence:.*&lt;script&gt;/);
  });

  it("preserves canonical fields (label, source_file) untouched -- no double sanitization", () => {
    const G = new Graph({ type: "undirected" });
    // Canonical fields are pre-sanitised at extract time; wiki must not
    // re-escape them (otherwise legitimate paths and labels get double-escaped).
    G.mergeNode("n1", { label: "ParserAndLexer", source_file: "src/lex_parse.ts", community: 0 });
    G.mergeNode("n2", { label: "Render", source_file: "src/render.ts", community: 0 });
    G.mergeEdge("n1", "n2", { relation: "calls", confidence: "EXTRACTED" });

    toWiki(
      G,
      new Map([[0, ["n1", "n2"]]]),
      tmpDir,
      { communityLabels: new Map([[0, "Core"]]) },
    );

    const article = readFileSync(join(tmpDir, "Core.md"), "utf-8");
    // The literal `&` in canonical labels would be a sign of double-sanitising
    // because ParserAndLexer has none. The source path slash must remain as `/`.
    expect(article).toContain("ParserAndLexer");
    expect(article).toContain("src/lex_parse.ts");
    expect(article).toContain("src/render.ts");
    expect(article).not.toContain("src&#x2f;");
    expect(article).not.toContain("src&#47;");
  });
});
