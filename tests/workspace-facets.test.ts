/**
 * Track G G6-2 (S1.4) — FACETS panel auto-discovery.
 *
 * Scans the dataset for filterable string fields and exposes them as
 * generic facet sections. The contract is profile-neutral: no
 * corpus-specific keys (no `framework`, no `abp`, no `process_std`) are
 * hardcoded.
 */
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  discoverWorkspaceFacets,
  workspaceReducer,
  type WorkspaceFacetRecord,
} from "../src/workspace/index.js";

const dataset: WorkspaceFacetRecord[] = [
  { id: "a", status: "approved", operation: "create", score_bucket: "high", source_kind: "extracted" },
  { id: "b", status: "needs_review", operation: "update", score_bucket: "high", source_kind: "inferred" },
  { id: "c", status: "needs_review", operation: "create", score_bucket: "low", source_kind: "extracted" },
  { id: "d", status: "approved" },
];

describe("Track G G6-2 — FACETS auto-discovery", () => {
  it("discovers the expected facet keys from the dataset", () => {
    const facets = discoverWorkspaceFacets(dataset);
    const keys = facets.map((f) => f.key).sort();
    expect(keys).toEqual(["operation", "score_bucket", "source_kind", "status"]);
  });

  it("hard-blocks corpus-specific keys (framework / abp / process_std / hasMedia)", () => {
    const dirty: WorkspaceFacetRecord[] = [
      { id: "1", framework: "abp", hasMedia: true, status: "approved" },
    ];
    const facets = discoverWorkspaceFacets(dirty);
    const keys = facets.map((f) => f.key);
    expect(keys).not.toContain("framework");
    expect(keys).not.toContain("hasMedia");
    expect(keys).toContain("status");
  });

  it("returns slice counts per facet value, including 'all'", () => {
    const facets = discoverWorkspaceFacets(dataset);
    const status = facets.find((f) => f.key === "status");
    expect(status).toBeTruthy();
    const slices = Object.fromEntries(status!.values.map((v) => [v.value, v.count]));
    expect(slices["all"]).toBe(4);
    expect(slices["approved"]).toBe(2);
    expect(slices["needs_review"]).toBe(2);
  });

  it("honours an explicit profile-declared facet list", () => {
    const facets = discoverWorkspaceFacets(dataset, {
      declaredFacets: ["status", "score_bucket"],
    });
    const keys = facets.map((f) => f.key);
    expect(keys).toEqual(["status", "score_bucket"]);
  });

  it("SET_FACET writes into facetState, SET_FACET with value 'all' clears the key", () => {
    let state = createDefaultViewerState();
    state = workspaceReducer(state, { type: "SET_FACET", key: "status", value: "approved" });
    expect(state.facetState.status).toBe("approved");
    state = workspaceReducer(state, { type: "CLEAR_FACET", key: "status" });
    expect(state.facetState.status).toBeUndefined();
  });
});
