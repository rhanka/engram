/**
 * Track G G6-2 (S1.2) — TYPES filter in the left rail.
 *
 * The rail renders one row per node_type id discovered in the dataset,
 * ordered by count desc, with a synthetic "all" entry first. Each row
 * carries an interactive affordance (data-action="set-type") that the
 * client-side handler turns into a SET_ACTIVE_TYPE action.
 */
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  getWorkspaceTokens,
  renderWorkspaceShell,
  workspaceReducer,
  type GraphLike,
} from "../src/workspace/index.js";

const tokens = getWorkspaceTokens("dark");

const graph: GraphLike = {
  nodes: [
    { id: "holmes", label: "Sherlock Holmes", node_type: "Character" },
    { id: "watson", label: "Dr Watson", node_type: "Character" },
    { id: "moriarty", label: "Moriarty", node_type: "Character" },
    { id: "baker", label: "Baker Street", node_type: "Location" },
    { id: "study", label: "A Study in Scarlet", node_type: "Work" },
  ],
  edges: [],
};

describe("Track G G6-2 — TYPES filter", () => {
  it("renders the TYPES section with rows ordered by count desc and an 'all' entry first", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: createDefaultViewerState(),
      graph,
    });
    expect(html).toContain('data-rail-section="types"');
    // 'all' row plus the discovered type rows.
    expect(html).toContain('data-type-id="all"');
    expect(html).toContain('data-type-id="Character"');
    expect(html).toContain('data-type-id="Location"');
    expect(html).toContain('data-type-id="Work"');
    // Order: Character (3) before Location (1) before Work (1).
    const idxChar = html.indexOf('data-type-id="Character"');
    const idxLoc = html.indexOf('data-type-id="Location"');
    const idxWork = html.indexOf('data-type-id="Work"');
    expect(idxChar).toBeLessThan(idxLoc);
    expect(idxLoc).toBeLessThan(idxWork);
  });

  it("emits the 'N shown / M total' summary next to the TYPES heading", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: createDefaultViewerState(),
      graph,
    });
    // 5 records shown / 5 total in the default state.
    expect(html).toMatch(/data-rail-counter="types-shown"[^>]*>\s*5\s*</);
    expect(html).toMatch(/data-rail-counter="types-total"[^>]*>\s*5\s*</);
  });

  it("marks the active row with aria-pressed=true (default activeType=all)", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: createDefaultViewerState(),
      graph,
    });
    expect(html).toMatch(/data-type-id="all"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-type-id="Character"[^>]*aria-pressed="false"/);
  });

  it("reflects activeType in aria-pressed (Character active)", () => {
    const state = { ...createDefaultViewerState(), activeType: "Character" };
    const html = renderWorkspaceShell({ tokens, title: "Workspace", state, graph });
    expect(html).toMatch(/data-type-id="Character"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-type-id="all"[^>]*aria-pressed="false"/);
  });

  it("does not introduce any corpus-specific type id (framework / abp / process_std / Process / Org / Tool)", () => {
    const html = renderWorkspaceShell({
      tokens,
      title: "Workspace",
      state: createDefaultViewerState(),
      graph,
    });
    expect(html).not.toMatch(/\b(?:framework|abp|process_std|ABPProcess|ProcessStdProcess|BusinessObject|DigitalApplicationTool)\b/);
  });

  it("SET_ACTIVE_TYPE updates the state via the reducer", () => {
    const state = workspaceReducer(createDefaultViewerState(), {
      type: "SET_ACTIVE_TYPE",
      activeType: "Character",
    });
    expect(state.activeType).toBe("Character");
  });
});
