import { describe, expect, it } from "vitest";
import {
  WIKI_DESCRIPTION_PROMPT_VERSION,
  WIKI_DESCRIPTION_SCHEMA,
  buildWikiDescriptionCacheKey,
  buildNodeContentHash,
  buildCommunityContentHash,
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

// T-C2: Phase 2 — per-node sidecar freshness (C2 contract)
describe("T-C2 — per-node content hash freshness (C2)", () => {
  it("buildNodeContentHash is stable for same inputs", () => {
    const h1 = buildNodeContentHash({ label: "Foo", node_type: "Function", neighbors: [{ relation: "calls", target_id: "bar" }], evidence_refs: ["src/foo.ts"] });
    const h2 = buildNodeContentHash({ label: "Foo", node_type: "Function", neighbors: [{ relation: "calls", target_id: "bar" }], evidence_refs: ["src/foo.ts"] });
    expect(h1).toBe(h2);
  });

  it("buildNodeContentHash changes when label changes", () => {
    const base = { label: "Foo", node_type: null, neighbors: [], evidence_refs: [] };
    expect(buildNodeContentHash(base)).not.toBe(buildNodeContentHash({ ...base, label: "Bar" }));
  });

  it("buildNodeContentHash changes when a neighbor is added", () => {
    const base = { label: "Foo", node_type: null, neighbors: [], evidence_refs: [] };
    const withNeighbor = { ...base, neighbors: [{ relation: "calls", target_id: "baz" }] };
    expect(buildNodeContentHash(base)).not.toBe(buildNodeContentHash(withNeighbor));
  });

  it("buildNodeContentHash is insensitive to neighbor order (sorted internally)", () => {
    const n1 = [{ relation: "calls", target_id: "a" }, { relation: "uses", target_id: "b" }];
    const n2 = [{ relation: "uses", target_id: "b" }, { relation: "calls", target_id: "a" }];
    expect(buildNodeContentHash({ label: "X", node_type: null, neighbors: n1, evidence_refs: [] }))
      .toBe(buildNodeContentHash({ label: "X", node_type: null, neighbors: n2, evidence_refs: [] }));
  });

  it("buildCommunityContentHash is stable and changes when member ids change", () => {
    const h1 = buildCommunityContentHash({ label: "Core", member_ids: ["a", "b"], source_refs: ["src/a.ts"] });
    const h2 = buildCommunityContentHash({ label: "Core", member_ids: ["b", "a"], source_refs: ["src/a.ts"] }); // order-independent
    expect(h1).toBe(h2);
    const h3 = buildCommunityContentHash({ label: "Core", member_ids: ["a", "b", "c"], source_refs: ["src/a.ts"] });
    expect(h1).not.toBe(h3);
  });

  it("checkWikiDescriptionFreshness: per-node hash path — fresh when hashes match", () => {
    const nch = buildNodeContentHash({ label: "Foo", node_type: null, neighbors: [], evidence_refs: [] });
    const sidecar = makeNodeSidecarWithNch(nch);
    const result = checkWikiDescriptionFreshness(sidecar, {
      graph_hash: "anything", // ignored when node_content_hash is present
      node_content_hash: nch,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    });
    expect(result.fresh).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("checkWikiDescriptionFreshness: per-node hash path — stale when node_content_hash mismatches", () => {
    const nch = buildNodeContentHash({ label: "Foo", node_type: null, neighbors: [], evidence_refs: [] });
    const nchChanged = buildNodeContentHash({ label: "Bar", node_type: null, neighbors: [], evidence_refs: [] });
    const sidecar = makeNodeSidecarWithNch(nch);
    const result = checkWikiDescriptionFreshness(sidecar, {
      graph_hash: "anything",
      node_content_hash: nchChanged,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    });
    expect(result.fresh).toBe(false);
    expect(result.reasons).toContain("node_content_hash_mismatch");
    // global graph_hash_mismatch must NOT be reported (ignored when per-node hash governs)
    expect(result.reasons).not.toContain("graph_hash_mismatch");
  });

  it("checkWikiDescriptionFreshness: unrelated graph.json change does NOT stale a node sidecar", () => {
    const nch = buildNodeContentHash({ label: "Foo", node_type: null, neighbors: [], evidence_refs: [] });
    const sidecar = makeNodeSidecarWithNch(nch);
    // Caller passes same node_content_hash but different graph_hash (another node changed)
    const result = checkWikiDescriptionFreshness(sidecar, {
      graph_hash: "totally-different-global-hash",
      node_content_hash: nch,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    });
    // Must still be fresh — the node's own content hasn't changed
    expect(result.fresh).toBe(true);
  });

  it("checkWikiDescriptionFreshness: backward compat — legacy sidecar (no node_content_hash) treated as stale-once when caller provides hash", () => {
    const legacySidecar = makeNodeSidecar(); // no node_content_hash field
    expect(legacySidecar.node_content_hash).toBeUndefined();
    const nch = buildNodeContentHash({ label: "foo", node_type: null, neighbors: [], evidence_refs: [] });
    const result = checkWikiDescriptionFreshness(legacySidecar, {
      graph_hash: legacySidecar.graph_hash,
      node_content_hash: nch,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    });
    expect(result.fresh).toBe(false);
    expect(result.reasons).toContain("node_content_hash_mismatch");
  });

  it("checkWikiDescriptionFreshness: legacy path — no node_content_hash on either side, falls back to graph_hash", () => {
    const sidecar = makeNodeSidecar(); // no node_content_hash
    // Match: same graph_hash, no node_content_hash in inputs
    expect(checkWikiDescriptionFreshness(sidecar, {
      graph_hash: sidecar.graph_hash,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    }).fresh).toBe(true);
    // Mismatch: different graph_hash
    expect(checkWikiDescriptionFreshness(sidecar, {
      graph_hash: "different",
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    }).reasons).toContain("graph_hash_mismatch");
  });

  it("createInsufficientEvidenceRecord stores node_content_hash when provided", () => {
    const nch = "abc123";
    const record = createInsufficientEvidenceRecord({
      target_id: "node:foo",
      target_kind: "node",
      graph_hash: "g1",
      node_content_hash: nch,
      mode: "assistant",
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    });
    expect(record.node_content_hash).toBe(nch);
  });

  it("buildWikiDescriptionCacheKey differs with vs without node_content_hash", () => {
    const base = {
      target_id: "node:foo",
      target_kind: "node" as const,
      graph_hash: "g1",
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      mode: "assistant" as const,
    };
    const withNch = buildWikiDescriptionCacheKey({ ...base, node_content_hash: "nch-value" });
    const withoutNch = buildWikiDescriptionCacheKey({ ...base });
    expect(withNch).not.toBe(withoutNch);
  });

  it("buildWikiDescriptionCacheKey: node_content_hash replaces graph_hash in key computation", () => {
    const base = {
      target_id: "node:foo",
      target_kind: "node" as const,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      mode: "assistant" as const,
    };
    // Different graph_hash but same node_content_hash → same key
    const k1 = buildWikiDescriptionCacheKey({ ...base, graph_hash: "g1", node_content_hash: "nch-stable" });
    const k2 = buildWikiDescriptionCacheKey({ ...base, graph_hash: "g2", node_content_hash: "nch-stable" });
    expect(k1).toBe(k2);
    // Same graph_hash, different node_content_hash → different key
    const k3 = buildWikiDescriptionCacheKey({ ...base, graph_hash: "g1", node_content_hash: "nch-changed" });
    expect(k1).not.toBe(k3);
  });
});

// Helpers for T-C2
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

function makeNodeSidecarWithNch(nch: string): WikiNodeDescriptionSidecar {
  const base = makeNodeSidecar();
  return {
    ...base,
    node_content_hash: nch,
    cache_key: buildWikiDescriptionCacheKey({
      target_id: base.target_id,
      target_kind: base.target_kind,
      graph_hash: base.graph_hash,
      node_content_hash: nch,
      prompt_version: base.generator.prompt_version,
      mode: base.generator.mode,
      provider: base.generator.provider,
      model: base.generator.model,
    }),
  };
}

// ─── Regression: C2 render-path symmetry ───────────────────────────────────
// Before the fix, the render path (loadFreshWikiDescriptionSidecarIndex →
// selectFreshWikiDescriptions) called checkWikiDescriptionFreshness with no
// node_content_hash.  buildWikiDescriptionCacheKey then fell back to graph_hash
// and produced a key that could never match the stored (node_content_hash-based)
// cache_key → spurious cache_key_mismatch → C2 sidecars silently dropped in
// every render, even on a byte-identical graph.
describe("C2 regression — render-path cache_key symmetry", () => {
  // Simulate exactly how tryReadGeneratedSidecar / the generator stores a sidecar:
  // cache_key is built with node_content_hash, not graph_hash.
  function makeC2GeneratedSidecar(opts: {
    nodeLabel: string;
    nodeType: string | null;
    neighbors: Array<{ relation: string; target_id: string }>;
    evidenceRefs: string[];
    graphHash: string;
  }): WikiNodeDescriptionSidecar {
    const nch = buildNodeContentHash({
      label: opts.nodeLabel,
      node_type: opts.nodeType,
      neighbors: opts.neighbors,
      evidence_refs: opts.evidenceRefs,
    });
    const cache_key = buildWikiDescriptionCacheKey({
      target_id: "node:target",
      target_kind: "node",
      graph_hash: opts.graphHash,
      node_content_hash: nch,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      mode: "assistant",
      provider: "assistant",
      model: null,
    });
    return {
      schema: WIKI_DESCRIPTION_SCHEMA,
      target_id: "node:target",
      target_kind: "node",
      graph_hash: opts.graphHash,
      node_content_hash: nch,
      status: "generated",
      description: "LLM gap-fill description for a node without node.description.",
      evidence_refs: ["corpus/doc.txt#1"],
      confidence: 0.75,
      cache_key,
      generator: {
        mode: "assistant",
        provider: "assistant",
        model: null,
        prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      },
    };
  }

  it("C2 generated sidecar is FRESH when render path passes no node_content_hash (byte-identical graph)", () => {
    const graphHash = "graph-stable-xyz";
    const sidecar = makeC2GeneratedSidecar({
      nodeLabel: "TargetNode",
      nodeType: "Function",
      neighbors: [{ relation: "calls", target_id: "helper" }],
      evidenceRefs: ["corpus/doc.txt#1"],
      graphHash,
    });
    // Render path: only passes graph_hash + prompt_version (no node_content_hash)
    const result = checkWikiDescriptionFreshness(sidecar, {
      graph_hash: graphHash,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    });
    expect(result.reasons).toEqual([]);
    expect(result.fresh).toBe(true);
  });

  it("C2 generated sidecar is STALE when the node's own attrs change (render path passes fresh hash)", () => {
    const graphHash = "graph-stable-xyz";
    const sidecar = makeC2GeneratedSidecar({
      nodeLabel: "TargetNode",
      nodeType: "Function",
      neighbors: [{ relation: "calls", target_id: "helper" }],
      evidenceRefs: ["corpus/doc.txt#1"],
      graphHash,
    });
    // Node changed: different label → different node_content_hash
    const freshNch = buildNodeContentHash({
      label: "TargetNodeRenamed",
      node_type: "Function",
      neighbors: [{ relation: "calls", target_id: "helper" }],
      evidence_refs: ["corpus/doc.txt#1"],
    });
    const result = checkWikiDescriptionFreshness(sidecar, {
      graph_hash: "graph-new-hash", // global hash changes too since node changed
      node_content_hash: freshNch,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    });
    expect(result.fresh).toBe(false);
    expect(result.reasons).toContain("node_content_hash_mismatch");
    expect(result.reasons).not.toContain("graph_hash_mismatch");
  });

  it("C2 generated sidecar is FRESH when an UNRELATED node changes (render path passes same node hash)", () => {
    const originalGraphHash = "graph-before-unrelated-change";
    const sidecar = makeC2GeneratedSidecar({
      nodeLabel: "TargetNode",
      nodeType: "Function",
      neighbors: [{ relation: "calls", target_id: "helper" }],
      evidenceRefs: ["corpus/doc.txt#1"],
      graphHash: originalGraphHash,
    });
    // Unrelated node changed → graph_hash differs, but this node's content hash is same
    const sameSidecarNch = buildNodeContentHash({
      label: "TargetNode",
      node_type: "Function",
      neighbors: [{ relation: "calls", target_id: "helper" }],
      evidence_refs: ["corpus/doc.txt#1"],
    });
    const result = checkWikiDescriptionFreshness(sidecar, {
      graph_hash: "graph-after-unrelated-change",
      node_content_hash: sameSidecarNch,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    });
    expect(result.fresh).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("C2 generated sidecar survives selectFreshWikiDescriptions on byte-identical graph (render-path integration)", () => {
    const graphHash = "graph-stable-abc";
    const sidecar = makeC2GeneratedSidecar({
      nodeLabel: "GapFillNode",
      nodeType: "Class",
      neighbors: [],
      evidenceRefs: ["corpus/src.txt#2"],
      graphHash,
    });
    const index: WikiDescriptionSidecarIndex = {
      schema: "graphify_wiki_description_index_v1",
      graph_hash: graphHash,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      nodes: { "node:target": sidecar },
    };
    // Simulate render path: no node_content_hash passed
    const { fresh, stale } = selectFreshWikiDescriptions(index, {
      graph_hash: graphHash,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
    });
    expect(stale.nodes).toEqual([]);
    expect(Object.keys(fresh.nodes)).toContain("node:target");
    expect(fresh.nodes["node:target"].description).toBe(
      "LLM gap-fill description for a node without node.description.",
    );
  });
});
