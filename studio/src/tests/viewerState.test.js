import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  normalizeViewerState,
  normalizeGroupAxisAvailability,
  setShowWeakLinks,
  setGroupAxis,
  toggleCollapse,
  foldToLevel,
  expandAll,
} from "../lib/viewerState.js";

describe("viewerState — group-by data model (B2)", () => {
  it("defaults to axis:none with empty per-axis collapse sets (fast-path default)", () => {
    const state = createDefaultViewerState();
    expect(state.options.groupBy.axis).toBe("none");
    expect(state.options.groupBy.ontology.collapsedClassIds).toEqual([]);
    expect(state.options.groupBy.community.collapsedKeys).toEqual([]);
    // The pre-existing weak-link default is untouched, the legacy flat fields gone.
    expect(state.options.showWeakLinks).toBe(true);
    expect(state.options.showOntologyClasses).toBeUndefined();
    expect(state.options.collapsedClassIds).toBeUndefined();
  });

  it("does not interfere with setShowWeakLinks", () => {
    const state = setGroupAxis(createDefaultViewerState(), "ontology");
    const next = setShowWeakLinks(state, false);
    expect(next.options.showWeakLinks).toBe(false);
    expect(next.options.groupBy.axis).toBe("ontology");
  });
});

describe("viewerState — T1 axis switch + out-of-enum coercion", () => {
  it("setGroupAxis cycles none → ontology → community → none", () => {
    let s = createDefaultViewerState();
    s = setGroupAxis(s, "ontology");
    expect(s.options.groupBy.axis).toBe("ontology");
    s = setGroupAxis(s, "community");
    expect(s.options.groupBy.axis).toBe("community");
    s = setGroupAxis(s, "none");
    expect(s.options.groupBy.axis).toBe("none");
  });

  it("an out-of-enum axis coerces to none (pure seam)", () => {
    const s = setGroupAxis(createDefaultViewerState(), "source-file");
    expect(s.options.groupBy.axis).toBe("none");
    expect(setGroupAxis(createDefaultViewerState(), 42).options.groupBy.axis).toBe("none");
    expect(setGroupAxis(createDefaultViewerState(), null).options.groupBy.axis).toBe("none");
  });
});

describe("viewerState — toggleCollapse (axis-dispatched)", () => {
  it("toggles a class id in the ontology axis", () => {
    let s = setGroupAxis(createDefaultViewerState(), "ontology");
    s = toggleCollapse(s, "class:People");
    expect(s.options.groupBy.ontology.collapsedClassIds).toEqual(["class:People"]);
    s = toggleCollapse(s, "class:People");
    expect(s.options.groupBy.ontology.collapsedClassIds).toEqual([]);
  });

  it("toggles a community key in the community axis (ontology set untouched)", () => {
    let s = setGroupAxis(createDefaultViewerState(), "community");
    s = toggleCollapse(s, "People of London");
    expect(s.options.groupBy.community.collapsedKeys).toEqual(["People of London"]);
    expect(s.options.groupBy.ontology.collapsedClassIds).toEqual([]);
  });

  it("is a no-op on axis:none and ignores a non-string key", () => {
    const none = createDefaultViewerState();
    expect(toggleCollapse(none, "class:X").options.groupBy.ontology.collapsedClassIds).toEqual([]);
    const onto = setGroupAxis(createDefaultViewerState(), "ontology");
    expect(toggleCollapse(onto, "").options.groupBy.ontology.collapsedClassIds).toEqual([]);
    expect(toggleCollapse(onto, null).options.groupBy.ontology.collapsedClassIds).toEqual([]);
  });
});

describe("viewerState — T3 baseline fold-to-level (F8, not a blind union)", () => {
  it("foldToLevel SETS the ontology set to exactly the level ids (moves finer)", () => {
    let s = setGroupAxis(createDefaultViewerState(), "ontology");
    // Fold to Domain (the level-0 roots).
    s = foldToLevel(s, ["class:Narration", "class:People", "class:Case", "class:Place"]);
    expect(s.options.groupBy.ontology.collapsedClassIds.sort()).toEqual([
      "class:Case",
      "class:Narration",
      "class:People",
      "class:Place",
    ]);
    // Now fold to Sub-domain: the set is REPLACED (moves finer), the Domain roots
    // do NOT remain — distinguishing from the old blind-union collapseAllTopClasses.
    s = foldToLevel(s, ["class:Dialogue", "class:Suspects"]);
    expect(s.options.groupBy.ontology.collapsedClassIds.sort()).toEqual([
      "class:Dialogue",
      "class:Suspects",
    ]);
    expect(s.options.groupBy.ontology.collapsedClassIds).not.toContain("class:Narration");
  });

  it("foldToLevel is a no-op unless the active axis is ontology", () => {
    const s = setGroupAxis(createDefaultViewerState(), "community");
    expect(foldToLevel(s, ["class:Foo"]).options.groupBy.ontology.collapsedClassIds).toEqual([]);
  });

  it("expandAll clears the active axis's set only", () => {
    let s = setGroupAxis(createDefaultViewerState(), "ontology");
    s = toggleCollapse(s, "class:People");
    s = expandAll(s);
    expect(s.options.groupBy.ontology.collapsedClassIds).toEqual([]);
  });
});

describe("viewerState — T6 per-axis collapse MEMORY (setGroupAxis never wipes)", () => {
  it("Ontology(fold A) → Community(fold K) → Ontology restores fold A", () => {
    let s = setGroupAxis(createDefaultViewerState(), "ontology");
    s = toggleCollapse(s, "class:People");
    expect(s.options.groupBy.ontology.collapsedClassIds).toEqual(["class:People"]);

    s = setGroupAxis(s, "community");
    s = toggleCollapse(s, "Baker Street");
    // The ontology fold survived the axis switch.
    expect(s.options.groupBy.ontology.collapsedClassIds).toEqual(["class:People"]);
    expect(s.options.groupBy.community.collapsedKeys).toEqual(["Baker Street"]);

    s = setGroupAxis(s, "ontology");
    // Restored — setGroupAxis NEVER wipes.
    expect(s.options.groupBy.ontology.collapsedClassIds).toEqual(["class:People"]);
    expect(s.options.groupBy.community.collapsedKeys).toEqual(["Baker Street"]);
  });
});

describe("viewerState — T7 pure migration (no graph context)", () => {
  it("migrates legacy showOntologyClasses + collapsedClassIds → groupBy", () => {
    const normalized = normalizeViewerState({
      options: {
        showOntologyClasses: true,
        collapsedClassIds: ["class:Person", "class:Person", "class:Place"],
      },
    });
    expect(normalized.options.groupBy.axis).toBe("ontology");
    expect(normalized.options.groupBy.ontology.collapsedClassIds.sort()).toEqual([
      "class:Person",
      "class:Place",
    ]);
    expect(normalized.options.showOntologyClasses).toBeUndefined();
    expect(normalized.options.collapsedClassIds).toBeUndefined();
  });

  it("showOntologyClasses:false/absent migrates to axis:none", () => {
    expect(normalizeViewerState({}).options.groupBy.axis).toBe("none");
    expect(
      normalizeViewerState({ options: { showOntologyClasses: false } }).options.groupBy.axis,
    ).toBe("none");
  });

  it("an out-of-enum persisted axis → none; a valid axis:community is PRESERVED", () => {
    expect(
      normalizeViewerState({ options: { groupBy: { axis: "bogus" } } }).options.groupBy.axis,
    ).toBe("none");
    // Enum-valid: availability is NOT checked in the pure seam (that is T11).
    expect(
      normalizeViewerState({ options: { groupBy: { axis: "community" } } }).options.groupBy.axis,
    ).toBe("community");
  });

  it("an explicit groupBy.axis wins over the legacy showOntologyClasses flag", () => {
    const normalized = normalizeViewerState({
      options: { showOntologyClasses: true, groupBy: { axis: "community" } },
    });
    expect(normalized.options.groupBy.axis).toBe("community");
  });
});

describe("viewerState — T11 availability coercion (App seam, with context)", () => {
  it("downgrades an unavailable persisted axis → none, retaining collapse sets", () => {
    const persisted = normalizeViewerState({
      options: {
        groupBy: {
          axis: "community",
          ontology: { collapsedClassIds: ["class:People"] },
          community: { collapsedKeys: ["Baker Street"] },
        },
      },
    });
    // Graph has NO communities (availableAxes excludes community).
    const coerced = normalizeGroupAxisAvailability(persisted, ["none", "ontology"]);
    expect(coerced.options.groupBy.axis).toBe("none");
    // The per-axis sets are RETAINED across the downgrade (F3 survives).
    expect(coerced.options.groupBy.community.collapsedKeys).toEqual(["Baker Street"]);
    expect(coerced.options.groupBy.ontology.collapsedClassIds).toEqual(["class:People"]);
  });

  it("passes through an available axis and axis:none; is idempotent", () => {
    const community = normalizeViewerState({ options: { groupBy: { axis: "community" } } });
    const ok = normalizeGroupAxisAvailability(community, ["none", "community"]);
    expect(ok.options.groupBy.axis).toBe("community");
    const none = createDefaultViewerState();
    expect(normalizeGroupAxisAvailability(none, ["none"]).options.groupBy.axis).toBe("none");
    // Idempotent.
    const once = normalizeGroupAxisAvailability(community, ["none", "ontology"]);
    const twice = normalizeGroupAxisAvailability(once, ["none", "ontology"]);
    expect(twice.options.groupBy.axis).toBe("none");
  });

  it("the pure normalizer (no availableAxes) does NOT downgrade", () => {
    const normalized = normalizeViewerState({ options: { groupBy: { axis: "community" } } });
    expect(normalized.options.groupBy.axis).toBe("community");
  });
});
