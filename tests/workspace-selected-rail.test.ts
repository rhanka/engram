/**
 * Track G G6-2 (S1.3) — SELECTED rail (memory chips).
 *
 * Pinning an entity or a type appends it to selectedEntities /
 * selectedTypes. Removing a chip drops it from the same arrays. The
 * pinned ids survive the URL round-trip via the G3 reducer.
 */
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  viewerStateToQuery,
  viewerStateFromQuery,
  workspaceReducer,
} from "../src/workspace/index.js";

describe("Track G G6-2 — SELECTED rail (memory chips)", () => {
  it("PIN_ENTITY adds a chip and PIN_ENTITY again is idempotent", () => {
    const state0 = createDefaultViewerState();
    const state1 = workspaceReducer(state0, { type: "PIN_ENTITY", entityId: "holmes" });
    expect(state1.selectedEntities).toContain("holmes");
    const state2 = workspaceReducer(state1, { type: "PIN_ENTITY", entityId: "holmes" });
    expect(state2.selectedEntities).toEqual(["holmes"]);
  });

  it("UNPIN_ENTITY removes a chip", () => {
    const state0 = workspaceReducer(createDefaultViewerState(), {
      type: "PIN_ENTITY",
      entityId: "holmes",
    });
    const state1 = workspaceReducer(state0, { type: "PIN_ENTITY", entityId: "watson" });
    const state2 = workspaceReducer(state1, { type: "UNPIN_ENTITY", entityId: "holmes" });
    expect(state2.selectedEntities).toEqual(["watson"]);
  });

  it("PIN_TYPE / UNPIN_TYPE manage selectedTypes the same way", () => {
    let state = createDefaultViewerState();
    state = workspaceReducer(state, { type: "PIN_TYPE", typeId: "Character" });
    state = workspaceReducer(state, { type: "PIN_TYPE", typeId: "Location" });
    state = workspaceReducer(state, { type: "PIN_TYPE", typeId: "Character" });
    expect(state.selectedTypes).toEqual(["Character", "Location"]);
    state = workspaceReducer(state, { type: "UNPIN_TYPE", typeId: "Character" });
    expect(state.selectedTypes).toEqual(["Location"]);
  });

  it("preserves pinned ids through the URL round-trip", () => {
    let state = createDefaultViewerState();
    state = workspaceReducer(state, { type: "PIN_ENTITY", entityId: "holmes" });
    state = workspaceReducer(state, { type: "PIN_ENTITY", entityId: "watson" });
    state = workspaceReducer(state, { type: "PIN_TYPE", typeId: "Character" });
    state = workspaceReducer(state, { type: "PIN_TYPE", typeId: "Location" });
    const query = viewerStateToQuery(state);
    const restored = viewerStateFromQuery(query);
    expect(restored.selectedEntities.sort()).toEqual(["holmes", "watson"]);
    expect(restored.selectedTypes.sort()).toEqual(["Character", "Location"]);
  });
});
