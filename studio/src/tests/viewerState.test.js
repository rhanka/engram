import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  normalizeViewerState,
  setShowOntologyClasses,
  setShowWeakLinks,
  toggleCollapseClass,
  expandAllClasses,
  collapseAllTopClasses,
} from "../lib/viewerState.js";

describe("viewerState — showOntologyClasses (EVOL 2.a)", () => {
  it("defaults OFF (today's behaviour unchanged)", () => {
    const state = createDefaultViewerState();
    expect(state.options.showOntologyClasses).toBe(false);
    // The pre-existing weak-link default is untouched.
    expect(state.options.showWeakLinks).toBe(true);
  });

  it("setShowOntologyClasses flips the option (coerced to boolean)", () => {
    const off = createDefaultViewerState();
    const on = setShowOntologyClasses(off, true);
    expect(on.options.showOntologyClasses).toBe(true);
    // Other options are preserved.
    expect(on.options.showWeakLinks).toBe(true);

    const back = setShowOntologyClasses(on, false);
    expect(back.options.showOntologyClasses).toBe(false);

    // Truthy/falsy values coerce to a real boolean.
    expect(setShowOntologyClasses(off, 1).options.showOntologyClasses).toBe(true);
    expect(setShowOntologyClasses(off, 0).options.showOntologyClasses).toBe(false);
  });

  it("does not interfere with setShowWeakLinks", () => {
    const state = setShowOntologyClasses(createDefaultViewerState(), true);
    const next = setShowWeakLinks(state, false);
    expect(next.options.showWeakLinks).toBe(false);
    expect(next.options.showOntologyClasses).toBe(true);
  });

  it("normalizeViewerState restores the option from a partial state", () => {
    const normalized = normalizeViewerState({ options: { showOntologyClasses: true } });
    expect(normalized.options.showOntologyClasses).toBe(true);
    // Missing option falls back to the default.
    expect(normalizeViewerState({}).options.showOntologyClasses).toBe(false);
  });
});

describe("viewerState — collapsedClassIds (EVOL 2.b/2.d)", () => {
  it("defaults to an empty collapsed set", () => {
    expect(createDefaultViewerState().options.collapsedClassIds).toEqual([]);
  });

  it("toggleCollapseClass adds then removes a class id", () => {
    const base = createDefaultViewerState();
    const collapsed = toggleCollapseClass(base, "class:Character");
    expect(collapsed.options.collapsedClassIds).toEqual(["class:Character"]);
    const expanded = toggleCollapseClass(collapsed, "class:Character");
    expect(expanded.options.collapsedClassIds).toEqual([]);
  });

  it("toggleCollapseClass keeps multiple distinct ids", () => {
    let s = toggleCollapseClass(createDefaultViewerState(), "class:Person");
    s = toggleCollapseClass(s, "class:Place");
    expect(s.options.collapsedClassIds.sort()).toEqual(["class:Person", "class:Place"]);
  });

  it("toggleCollapseClass ignores a non-string id", () => {
    const base = createDefaultViewerState();
    expect(toggleCollapseClass(base, "").options.collapsedClassIds).toEqual([]);
    expect(toggleCollapseClass(base, null).options.collapsedClassIds).toEqual([]);
  });

  it("expandAllClasses clears the collapsed set", () => {
    let s = toggleCollapseClass(createDefaultViewerState(), "class:Person");
    s = toggleCollapseClass(s, "class:Place");
    expect(expandAllClasses(s).options.collapsedClassIds).toEqual([]);
  });

  it("collapseAllTopClasses unions the given ids with the current set", () => {
    const s = toggleCollapseClass(createDefaultViewerState(), "class:Person");
    const next = collapseAllTopClasses(s, ["class:Place", "class:Person"]);
    expect(next.options.collapsedClassIds.sort()).toEqual(["class:Person", "class:Place"]);
  });

  it("turning the class layer OFF clears any pending collapse", () => {
    let s = setShowOntologyClasses(createDefaultViewerState(), true);
    s = toggleCollapseClass(s, "class:Person");
    expect(s.options.collapsedClassIds).toEqual(["class:Person"]);
    const off = setShowOntologyClasses(s, false);
    expect(off.options.collapsedClassIds).toEqual([]);
  });

  it("normalizeViewerState restores collapsedClassIds from a partial state", () => {
    const normalized = normalizeViewerState({
      options: { collapsedClassIds: ["class:Person", "class:Person", "class:Place"] },
    });
    // De-duplicated by uniqueStrings.
    expect(normalized.options.collapsedClassIds.sort()).toEqual([
      "class:Person",
      "class:Place",
    ]);
    expect(normalizeViewerState({}).options.collapsedClassIds).toEqual([]);
  });
});
