import { describe, expect, it } from "vitest";
import {
  WIKI_DESCRIPTION_PROMPT_VERSION,
  WIKI_DESCRIPTION_SCHEMA,
  buildWikiDescriptionCacheKey,
  createInsufficientEvidenceRecord,
  validateWikiDescriptionSidecar,
  type WikiDescriptionSidecar,
} from "../src/wiki-descriptions.js";

const generator = {
  mode: "assistant" as const,
  provider: "assistant",
  model: null,
  prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
};

describe("wiki description sidecars", () => {
  it("builds deterministic cache keys that change when invalidation inputs change", () => {
    const base = {
      target_id: "node:buildWiki",
      target_kind: "node" as const,
      graph_hash: "graph-a",
      mode: "assistant" as const,
      provider: "assistant",
      model: null,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    };

    expect(buildWikiDescriptionCacheKey(base)).toBe(buildWikiDescriptionCacheKey({ ...base }));
    expect(buildWikiDescriptionCacheKey(base)).not.toBe(
      buildWikiDescriptionCacheKey({ ...base, graph_hash: "graph-b" }),
    );
    expect(buildWikiDescriptionCacheKey(base)).not.toBe(
      buildWikiDescriptionCacheKey({ ...base, prompt_version: "wiki-description-v2" }),
    );
    expect(buildWikiDescriptionCacheKey(base)).not.toBe(
      buildWikiDescriptionCacheKey({ ...base, mode: "direct", provider: "openai", model: "gpt-test" }),
    );
  });

  it("accepts a generated node description with source evidence refs", () => {
    const cache_key = buildWikiDescriptionCacheKey({
      target_id: "node:buildWiki",
      target_kind: "node",
      graph_hash: "graph-a",
      ...generator,
    });
    const sidecar: WikiDescriptionSidecar = {
      schema: WIKI_DESCRIPTION_SCHEMA,
      target_id: "node:buildWiki",
      target_kind: "node",
      graph_hash: "graph-a",
      status: "generated",
      description: "buildWiki writes wiki pages from the graph structure using source-backed metadata.",
      evidence_refs: ["src/wiki.ts#buildWiki"],
      confidence: 0.87,
      cache_key,
      generator,
      created_at: "2026-05-08T12:00:00.000Z",
    };

    expect(validateWikiDescriptionSidecar(sidecar)).toEqual([]);
  });

  it("rejects a generated description without evidence refs", () => {
    const sidecar = {
      schema: WIKI_DESCRIPTION_SCHEMA,
      target_id: "node:buildWiki",
      target_kind: "node",
      graph_hash: "graph-a",
      status: "generated",
      description: "This must not be rendered because it is not grounded.",
      evidence_refs: [],
      confidence: 0.8,
      cache_key: "cache-key",
      generator,
    };

    expect(validateWikiDescriptionSidecar(sidecar)).toContain(
      "generated descriptions require at least one evidence ref",
    );
  });

  it("creates valid insufficient-evidence community records without renderable descriptions", () => {
    const sidecar = createInsufficientEvidenceRecord({
      target_id: "community:12",
      target_kind: "community",
      graph_hash: "graph-a",
      mode: "batch",
      provider: "openai",
      model: "gpt-test",
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    });

    expect(sidecar.status).toBe("insufficient_evidence");
    expect(sidecar.description).toBeNull();
    expect(sidecar.evidence_refs).toEqual([]);
    expect(validateWikiDescriptionSidecar(sidecar)).toEqual([]);
  });
});
