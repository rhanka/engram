import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  normalizeViewerState,
  viewerStateFromQuery,
  viewerStateToQuery,
  workspaceReducer,
  type WorkspaceAction,
  type WorkspaceViewerState,
} from "../src/workspace/index.js";

describe("Track G G3 — workspace viewer state model", () => {
  describe("createDefaultViewerState", () => {
    it("returns the documented defaults", () => {
      const s = createDefaultViewerState();
      expect(s.activeView).toBe("workspace");
      expect(s.activeType).toBe("all");
      expect(s.facetState).toEqual({});
      expect(s.selectedTypes).toEqual([]);
      expect(s.selectedEntities).toEqual([]);
      expect(s.displayRef).toBeNull();
      expect(s.selectionState).toEqual({
        kind: "overview",
        ref: "selection:all",
        entityIds: [],
      });
      expect(s.focusEntityId).toBeNull();
      expect(s.drawerOpen).toBe(false);
      expect(s.viewState.graph).toEqual({
        mode: "selection",
        showWeakLinks: false,
        aggregation: "type",
        focusHops: 1,
      });
      expect(s.viewState.evidence).toEqual({ mode: "focus" });
      expect(s.viewState.profileExtensions).toEqual({});
    });

    it("returns a fresh deep copy every call (no shared references)", () => {
      const a = createDefaultViewerState();
      const b = createDefaultViewerState();
      a.selectedTypes.push("Character");
      a.viewState.graph.focusHops = 7;
      a.viewState.profileExtensions.foo = "bar";
      expect(b.selectedTypes).toEqual([]);
      expect(b.viewState.graph.focusHops).toBe(1);
      expect(b.viewState.profileExtensions).toEqual({});
    });
  });

  describe("normalizeViewerState", () => {
    it("returns defaults when given garbage", () => {
      expect(normalizeViewerState(null)).toEqual(createDefaultViewerState());
      expect(normalizeViewerState(undefined)).toEqual(createDefaultViewerState());
      expect(normalizeViewerState([])).toEqual(createDefaultViewerState());
      expect(normalizeViewerState(42)).toEqual(createDefaultViewerState());
    });

    it("dedupes and trims selectedTypes/selectedEntities/selectionState.entityIds", () => {
      const s = normalizeViewerState({
        selectedTypes: [" Character", "Character", "Crime", "", "  "],
        selectedEntities: ["e1", "e1", " e2 ", "  "],
        selectionState: { kind: "members", ref: "type:Crime", entityIds: ["a", "a", " b"] },
      });
      expect(s.selectedTypes).toEqual(["Character", "Crime"]);
      expect(s.selectedEntities).toEqual(["e1", "e2"]);
      expect(s.selectionState.entityIds).toEqual(["a", "b"]);
    });

    it("rejects invalid graph mode/aggregation/focusHops and falls back to defaults", () => {
      const s = normalizeViewerState({
        viewState: {
          graph: { mode: "bogus", aggregation: "nope", focusHops: -3, showWeakLinks: "yes" },
        },
      });
      expect(s.viewState.graph.mode).toBe("selection");
      expect(s.viewState.graph.aggregation).toBe("type");
      expect(s.viewState.graph.focusHops).toBe(1);
      expect(s.viewState.graph.showWeakLinks).toBe(false);
    });

    it("preserves profileExtensions verbatim without interpreting them", () => {
      const s = normalizeViewerState({
        viewState: { profileExtensions: { processes: { activeTree: "abp" }, deep: { x: [1, 2] } } },
      });
      expect(s.viewState.profileExtensions.processes).toEqual({ activeTree: "abp" });
      expect(s.viewState.profileExtensions.deep).toEqual({ x: [1, 2] });
    });

    it("accepts null displayRef and null focusEntityId explicitly", () => {
      const s = normalizeViewerState({ displayRef: null, focusEntityId: null });
      expect(s.displayRef).toBeNull();
      expect(s.focusEntityId).toBeNull();
    });

    it("coerces drawerOpen to a boolean", () => {
      expect(normalizeViewerState({ drawerOpen: 1 }).drawerOpen).toBe(true);
      expect(normalizeViewerState({ drawerOpen: 0 }).drawerOpen).toBe(false);
      expect(normalizeViewerState({ drawerOpen: "yes" }).drawerOpen).toBe(true);
      expect(normalizeViewerState({ drawerOpen: "" }).drawerOpen).toBe(false);
    });
  });

  describe("URL query round-trip", () => {
    it("emits an empty query for the default state", () => {
      expect(viewerStateToQuery(createDefaultViewerState())).toEqual({});
    });

    it("round-trips a populated state through the query map", () => {
      const initial: WorkspaceViewerState = {
        activeView: "studio",
        activeType: "Character",
        facetState: { framework: "rules", season: "winter" },
        selectedTypes: ["Character", "Crime"],
        selectedEntities: ["sherlock", "lupin"],
        displayRef: "candidate:c-42",
        selectionState: { kind: "members", ref: "type:Crime", entityIds: ["c1", "c2"] },
        focusEntityId: "sherlock",
        drawerOpen: true,
        viewState: {
          graph: { mode: "focus", showWeakLinks: true, aggregation: "community", focusHops: 3 },
          evidence: { mode: "all" },
          profileExtensions: { processes: { activeTree: "abp" } },
        },
      };
      const query = viewerStateToQuery(initial);
      const restored = viewerStateFromQuery(query);
      expect(restored.activeView).toBe("studio");
      expect(restored.activeType).toBe("Character");
      expect(restored.selectedTypes).toEqual(["Character", "Crime"]);
      expect(restored.selectedEntities).toEqual(["sherlock", "lupin"]);
      expect(restored.displayRef).toBe("candidate:c-42");
      expect(restored.selectionState).toEqual({
        kind: "members",
        ref: "type:Crime",
        entityIds: ["c1", "c2"],
      });
      expect(restored.focusEntityId).toBe("sherlock");
      expect(restored.drawerOpen).toBe(true);
      expect(restored.viewState.graph).toEqual({
        mode: "focus",
        showWeakLinks: true,
        aggregation: "community",
        focusHops: 3,
      });
      expect(restored.viewState.evidence.mode).toBe("all");
      expect(restored.facetState).toEqual({ framework: "rules", season: "winter" });
      // profileExtensions are intentionally NOT round-tripped through the query
      // (they are profile-owned; their persistence happens via the profile adapter).
      expect(restored.viewState.profileExtensions).toEqual({});
    });

    it("ignores facet keys whose value is 'all' (defaults shouldn't bloat URLs)", () => {
      const s = createDefaultViewerState();
      s.facetState.framework = "all";
      s.facetState.season = "winter";
      const q = viewerStateToQuery(s);
      expect(q).toEqual({ "facet.season": "winter" });
    });
  });

  describe("workspaceReducer", () => {
    const dispatch = (state: WorkspaceViewerState, ...actions: WorkspaceAction[]) =>
      actions.reduce((s, a) => workspaceReducer(s, a), state);

    it("SET_ACTIVE_TYPE updates the field without touching anything else", () => {
      const before = createDefaultViewerState();
      const after = workspaceReducer(before, { type: "SET_ACTIVE_TYPE", activeType: "Crime" });
      expect(after.activeType).toBe("Crime");
      expect(after.selectionState).toBe(before.selectionState);
    });

    it("TOGGLE_DRAWER flips the drawerOpen flag", () => {
      const s0 = createDefaultViewerState();
      const s1 = workspaceReducer(s0, { type: "TOGGLE_DRAWER" });
      const s2 = workspaceReducer(s1, { type: "TOGGLE_DRAWER" });
      expect(s0.drawerOpen).toBe(false);
      expect(s1.drawerOpen).toBe(true);
      expect(s2.drawerOpen).toBe(false);
    });

    it("SET_SELECTION dedupes entity ids and resets to overview-like ref when given", () => {
      const s = workspaceReducer(createDefaultViewerState(), {
        type: "SET_SELECTION",
        kind: "candidate-queue",
        ref: "queue:needs_review",
        entityIds: ["c1", "c1", "c2"],
      });
      expect(s.selectionState).toEqual({
        kind: "candidate-queue",
        ref: "queue:needs_review",
        entityIds: ["c1", "c2"],
      });
    });

    it("SET_FOCUS_HOPS rejects negative or non-integer values", () => {
      const s0 = createDefaultViewerState();
      expect(workspaceReducer(s0, { type: "SET_FOCUS_HOPS", hops: -1 }).viewState.graph.focusHops).toBe(1);
      expect(workspaceReducer(s0, { type: "SET_FOCUS_HOPS", hops: 1.5 }).viewState.graph.focusHops).toBe(1);
      expect(workspaceReducer(s0, { type: "SET_FOCUS_HOPS", hops: 4 }).viewState.graph.focusHops).toBe(4);
    });

    it("RESET returns to the default state", () => {
      const s = dispatch(
        createDefaultViewerState(),
        { type: "SET_ACTIVE_TYPE", activeType: "Crime" },
        { type: "SET_DISPLAY_REF", displayRef: "entity:sherlock" },
        { type: "TOGGLE_DRAWER" },
      );
      expect(s.activeType).toBe("Crime");
      expect(s.displayRef).toBe("entity:sherlock");
      const reset = workspaceReducer(s, { type: "RESET" });
      expect(reset).toEqual(createDefaultViewerState());
    });

    it("SET_FACET / CLEAR_FACET are profile-agnostic", () => {
      const s = dispatch(
        createDefaultViewerState(),
        { type: "SET_FACET", key: "season", value: "winter" },
        { type: "SET_FACET", key: "framework", value: "rules" },
      );
      expect(s.facetState).toEqual({ season: "winter", framework: "rules" });
      const cleared = workspaceReducer(s, { type: "CLEAR_FACET", key: "season" });
      expect(cleared.facetState).toEqual({ framework: "rules" });
    });
  });
});
