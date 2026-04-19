import { describe, expect, it } from "vitest";
import Graph from "graphology";

import { buildCommitRecommendation, commitRecommendationToText } from "../src/recommend.js";
import type { LifecycleMetadata } from "../src/lifecycle.js";

function makeGraph(): Graph {
  const G = new Graph({ type: "undirected" });
  G.setAttribute("community_labels", {
    "0": "Core Services",
    "1": "Docs + Analysis",
  });
  G.addNode("alpha", {
    label: "AlphaService",
    source_file: "src/alpha.ts",
    community: 0,
  });
  G.addNode("alphaTest", {
    label: "AlphaService test",
    source_file: "tests/alpha.test.ts",
    community: 0,
  });
  G.addNode("docs", {
    label: "Architecture Notes",
    source_file: "docs/architecture.md",
    community: 1,
  });
  G.addUndirectedEdge("alpha", "alphaTest", { relation: "validated_by", confidence: "EXTRACTED" });
  G.addUndirectedEdge("alpha", "docs", { relation: "documents", confidence: "EXTRACTED" });
  return G;
}

function lifecycle(overrides: Partial<LifecycleMetadata["branch"]> = {}): LifecycleMetadata {
  const now = "2026-04-16T00:00:00.000Z";
  return {
    worktree: {
      schemaVersion: 1,
      worktreePath: "/repo",
      gitDir: "/repo/.git",
      commonGitDir: "/repo/.git",
      firstSeenHead: "aaa",
      lastSeenHead: "aaa",
      lastAnalyzedHead: "aaa",
      createdAt: now,
      updatedAt: now,
    },
    branch: {
      schemaVersion: 1,
      branchName: "feature",
      worktreePath: "/repo",
      upstream: "origin/feature",
      mergeBase: "base",
      firstSeenHead: "aaa",
      lastSeenHead: "aaa",
      lastAnalyzedHead: "aaa",
      stale: false,
      staleReason: null,
      staleSince: null,
      lifecycleEvent: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    },
  };
}

describe("commit recommendation", () => {
  it("groups graph-backed changes while staying advisory-only", () => {
    const recommendation = buildCommitRecommendation(makeGraph(), ["src/alpha.ts", ".graphify/graph.json"], {
      lifecycle: lifecycle(),
      graphAvailable: true,
    });

    expect(recommendation.advisory_only).toBe(true);
    expect(recommendation.actor).toBe("user");
    expect(recommendation.forbidden_actions).toEqual(["auto-stage", "auto-commit", "branch-mutation"]);
    expect(recommendation.changed_files).toEqual(["src/alpha.ts"]);
    expect(recommendation.staleness.stale).toBe(false);
    expect(recommendation.confidence).toBe("high");
    expect(recommendation.groups).toHaveLength(1);
    expect(recommendation.groups[0]).toMatchObject({
      title: "Core Services changes",
      suggested_commit_message: "core-services: update src/alpha.ts",
      files: ["src/alpha.ts"],
      confidence: "high",
    });
    expect(recommendation.groups[0]!.graph_impact.impacted_files).toContain("tests/alpha.test.ts");
  });

  it("downgrades confidence for stale state and rebase/rewrite signals", () => {
    const recommendation = buildCommitRecommendation(makeGraph(), ["src/alpha.ts"], {
      lifecycle: lifecycle({
        stale: true,
        staleReason: "post-rewrite rebase",
        lifecycleEvent: "post-rewrite",
        lastAnalyzedHead: "old",
        lastSeenHead: "new",
      }),
      needsUpdate: true,
      graphAvailable: true,
    });

    expect(recommendation.staleness.stale).toBe(true);
    expect(recommendation.confidence).toBe("low");
    expect(recommendation.staleness.reasons).toContain(".graphify/needs_update exists");
    expect(recommendation.staleness.reasons).toContain("branch history rewrite/rebase signal present");
    expect(recommendation.staleness.reasons).toContain("branch metadata is stale: post-rewrite rebase");
    expect(commitRecommendationToText(recommendation)).toContain("Advisory only: no staging, no commits, no branch mutations performed.");
  });

  it("falls back to path grouping for partial graphs", () => {
    const recommendation = buildCommitRecommendation(makeGraph(), ["src/missing.ts"], {
      lifecycle: lifecycle(),
      graphAvailable: true,
    });

    expect(recommendation.confidence).toBe("low");
    expect(recommendation.groups[0]).toMatchObject({
      title: "src changes",
      suggested_commit_message: "src: update src/missing.ts",
      files: ["src/missing.ts"],
      confidence: "low",
    });
    expect(recommendation.groups[0]!.graph_impact.changed_nodes).toBe(0);
    expect(recommendation.confidence_reasons).toContain("no changed file maps to a graph node");
  });
});
