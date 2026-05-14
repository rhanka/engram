import { describe, expect, it } from "vitest";
import {
  WIKI_DESCRIPTION_PROMPT_VERSION,
  WIKI_DESCRIPTION_SCHEMA,
  buildWikiDescriptionCacheKey,
  checkWikiDescriptionFreshness,
  createInsufficientEvidenceRecord,
  selectFreshWikiDescriptions,
  validateWikiDescriptionSidecar,
  type WikiDescriptionSidecar,
  type WikiDescriptionSidecarIndex,
  type WikiNodeDescriptionSidecar,
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

describe("wiki description cache invalidation", () => {
  function makeNodeSidecar(overrides: Partial<WikiNodeDescriptionSidecar> = {}): WikiNodeDescriptionSidecar {
    const base: WikiNodeDescriptionSidecar = {
      schema: WIKI_DESCRIPTION_SCHEMA,
      target_id: "node:foo",
      target_kind: "node",
      graph_hash: "graph-a",
      status: "generated",
      description: "foo does X.",
      evidence_refs: ["src/foo.ts#foo"],
      confidence: 0.8,
      cache_key: "",
      generator: {
        mode: "assistant",
        provider: "assistant",
        model: null,
        prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      },
    };
    const merged: WikiNodeDescriptionSidecar = { ...base, ...overrides, generator: { ...base.generator, ...(overrides.generator ?? {}) } };
    merged.cache_key = buildWikiDescriptionCacheKey({
      target_id: merged.target_id,
      target_kind: merged.target_kind,
      graph_hash: merged.graph_hash,
      prompt_version: merged.generator.prompt_version,
      mode: merged.generator.mode,
      provider: merged.generator.provider,
      model: merged.generator.model,
    });
    return merged;
  }

  it("returns fresh when graph_hash, prompt_version, mode, provider and model all match", () => {
    const sidecar = makeNodeSidecar();
    const result = checkWikiDescriptionFreshness(sidecar, {
      graph_hash: "graph-a",
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      mode: "assistant",
      provider: "assistant",
      model: null,
    });
    expect(result.fresh).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("flags graph_hash, prompt_version, mode, provider and model mismatches independently", () => {
    const sidecar = makeNodeSidecar();

    expect(
      checkWikiDescriptionFreshness(sidecar, {
        graph_hash: "graph-b",
        prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      }).reasons,
    ).toEqual(expect.arrayContaining(["graph_hash_mismatch", "cache_key_mismatch"]));

    expect(
      checkWikiDescriptionFreshness(sidecar, {
        graph_hash: "graph-a",
        prompt_version: "wiki-description-v2",
      }).reasons,
    ).toEqual(expect.arrayContaining(["prompt_version_mismatch", "cache_key_mismatch"]));

    expect(
      checkWikiDescriptionFreshness(sidecar, {
        graph_hash: "graph-a",
        prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
        mode: "direct",
      }).reasons,
    ).toContain("mode_mismatch");

    expect(
      checkWikiDescriptionFreshness(sidecar, {
        graph_hash: "graph-a",
        prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
        provider: "openai",
      }).reasons,
    ).toContain("provider_mismatch");

    expect(
      checkWikiDescriptionFreshness(sidecar, {
        graph_hash: "graph-a",
        prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
        model: "gpt-test",
      }).reasons,
    ).toContain("model_mismatch");
  });

  it("ignores mode/provider/model checks when caller does not pass them", () => {
    const sidecar = makeNodeSidecar();
    expect(
      checkWikiDescriptionFreshness(sidecar, {
        graph_hash: "graph-a",
        prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      }).fresh,
    ).toBe(true);
  });

  it("filters node and community sidecars and reports stale ids", () => {
    const fresh = makeNodeSidecar({ target_id: "node:fresh" });
    const stale = makeNodeSidecar({ target_id: "node:stale", graph_hash: "graph-old" });
    const communityBase = makeNodeSidecar({ target_id: "community:1", target_kind: "community" });
    // Recompute cache_key with target_kind=community since makeNodeSidecar already does it.
    const community = communityBase as unknown as WikiDescriptionSidecar<"community">;
    const index: WikiDescriptionSidecarIndex = {
      schema: "graphify_wiki_description_index_v1",
      graph_hash: "graph-a",
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      nodes: { "node:fresh": fresh, "node:stale": stale },
      communities: { "community:1": community },
    };

    const result = selectFreshWikiDescriptions(index, {
      graph_hash: "graph-a",
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    });

    expect(Object.keys(result.fresh.nodes)).toEqual(["node:fresh"]);
    expect(result.fresh.communities && Object.keys(result.fresh.communities)).toEqual(["community:1"]);
    expect(result.stale.nodes).toEqual(["node:stale"]);
    expect(result.stale.communities).toEqual([]);
  });
});
