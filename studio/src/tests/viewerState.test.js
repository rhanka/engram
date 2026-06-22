import { describe, expect, it } from "vitest";

import {
  GROUP_KIND,
  createDefaultViewerState,
  normalizeViewerState,
  setShowWeakLinks,
  groupKeyForOntology,
  groupKeyForCommunity,
  splitGroupedKeys,
  toggleGroupItem,
  toggleGroupOntology,
  toggleGroupCommunity,
  isOntologyGrouped,
  isCommunityGrouped,
  clearGrouping,
  foldOntologyToLevel,
  ONTOLOGY_LEVELS,
} from "../lib/viewerState.js";

/* ===========================================================================
 * B2 — PER-ITEM grouped-set model.
 *
 * groupBy is now `{ grouped: [ "ontology:<classId>" | "community:<key>", … ] }`:
 * a flat SET of namespaced keys. Checking a groupable rail item (an Ontology
 * class node OR a community) adds its namespaced key; unchecking removes it.
 * MULTI-SELECT (several ontology classes + communities) is the default — every
 * key folds at once. An empty set === nothing grouped (fast path, A3). The FILTER
 * facet (selection.types) stays STRICTLY SEPARATE from these checkboxes.
 * ======================================================================== */

describe("viewerState — group-by data model (B2 per-item grouped set)", () => {
  it("defaults to an EMPTY grouped set (fast-path default — nothing grouped)", () => {
    const state = createDefaultViewerState();
    expect(state.options.groupBy.grouped).toEqual([]);
    // The pre-existing weak-link default is untouched; legacy axis/flat fields gone.
    expect(state.options.showWeakLinks).toBe(true);
    expect(state.options.groupBy.axis).toBeUndefined();
    expect(state.options.showOntologyClasses).toBeUndefined();
    expect(state.options.collapsedClassIds).toBeUndefined();
  });

  it("namespaced key builders round-trip through splitGroupedKeys (colons preserved)", () => {
    expect(groupKeyForOntology("class:People")).toBe(`${GROUP_KIND.ontology}:class:People`);
    expect(groupKeyForCommunity("People of London")).toBe(
      `${GROUP_KIND.community}:People of London`,
    );
    // A community key may itself contain colons — split on the FIRST `:` only.
    const grouped = [
      groupKeyForOntology("class:People"),
      groupKeyForCommunity("scope:central:42"),
    ];
    const { ontologyClassIds, communityKeys } = splitGroupedKeys(grouped);
    expect(ontologyClassIds).toEqual(["class:People"]);
    expect(communityKeys).toEqual(["scope:central:42"]);
  });

  it("splitGroupedKeys ignores malformed / unknown-prefixed / empty keys", () => {
    const { ontologyClassIds, communityKeys } = splitGroupedKeys([
      "ontology:class:Person",
      "community:Baker Street",
      "bogus:whatever", // unknown kind → dropped
      "ontology:", // empty rest → dropped
      "", // empty → dropped
      "noseparator", // no `:` → dropped
      42, // non-string → dropped
    ]);
    expect(ontologyClassIds).toEqual(["class:Person"]);
    expect(communityKeys).toEqual(["Baker Street"]);
  });

  it("does not interfere with setShowWeakLinks (and grouped set survives)", () => {
    const grouped = toggleGroupOntology(createDefaultViewerState(), "class:People");
    const next = setShowWeakLinks(grouped, false);
    expect(next.options.showWeakLinks).toBe(false);
    expect(next.options.groupBy.grouped).toEqual([groupKeyForOntology("class:People")]);
  });
});

describe("viewerState — per-item toggle (ontology + community, independent)", () => {
  it("toggleGroupOntology adds then removes an ontology key (idempotent toggle)", () => {
    let s = createDefaultViewerState();
    s = toggleGroupOntology(s, "class:People");
    expect(s.options.groupBy.grouped).toEqual([groupKeyForOntology("class:People")]);
    expect(isOntologyGrouped(s, "class:People")).toBe(true);
    s = toggleGroupOntology(s, "class:People");
    expect(s.options.groupBy.grouped).toEqual([]);
    expect(isOntologyGrouped(s, "class:People")).toBe(false);
  });

  it("toggleGroupCommunity adds a community key WITHOUT touching ontology keys", () => {
    let s = toggleGroupOntology(createDefaultViewerState(), "class:People");
    s = toggleGroupCommunity(s, "People of London");
    expect(isOntologyGrouped(s, "class:People")).toBe(true);
    expect(isCommunityGrouped(s, "People of London")).toBe(true);
    const { ontologyClassIds, communityKeys } = splitGroupedKeys(s.options.groupBy.grouped);
    expect(ontologyClassIds).toEqual(["class:People"]);
    expect(communityKeys).toEqual(["People of London"]);
  });

  it("toggleGroupItem is a no-op for a non-string / empty key", () => {
    const s = createDefaultViewerState();
    expect(toggleGroupItem(s, "").options.groupBy.grouped).toEqual([]);
    expect(toggleGroupItem(s, null).options.groupBy.grouped).toEqual([]);
    expect(toggleGroupOntology(s, "").options.groupBy.grouped).toEqual([]);
    expect(toggleGroupCommunity(s, null).options.groupBy.grouped).toEqual([]);
  });

  it("MULTI-SELECT: several ontology classes + communities group simultaneously", () => {
    let s = createDefaultViewerState();
    s = toggleGroupOntology(s, "class:People");
    s = toggleGroupOntology(s, "class:Place");
    s = toggleGroupCommunity(s, "Baker Street");
    s = toggleGroupCommunity(s, "Scotland Yard");
    const { ontologyClassIds, communityKeys } = splitGroupedKeys(s.options.groupBy.grouped);
    expect(ontologyClassIds.sort()).toEqual(["class:People", "class:Place"]);
    expect(communityKeys.sort()).toEqual(["Baker Street", "Scotland Yard"]);
    // Removing ONE class leaves the rest of the multi-selection intact.
    s = toggleGroupOntology(s, "class:People");
    const after = splitGroupedKeys(s.options.groupBy.grouped);
    expect(after.ontologyClassIds).toEqual(["class:Place"]);
    expect(after.communityKeys.sort()).toEqual(["Baker Street", "Scotland Yard"]);
  });

  it("the grouped set is deduped (re-checking the same item never duplicates)", () => {
    let s = createDefaultViewerState();
    s = toggleGroupOntology(s, "class:People");
    // A direct toggleGroupItem with the SAME namespaced key removes it (toggle),
    // so re-adding via toggleGroupOntology again yields exactly one entry.
    s = toggleGroupOntology(s, "class:People"); // off
    s = toggleGroupOntology(s, "class:People"); // on again
    expect(s.options.groupBy.grouped).toEqual([groupKeyForOntology("class:People")]);
  });

  it("clearGrouping empties the whole grouped set (ungroup everything)", () => {
    let s = createDefaultViewerState();
    s = toggleGroupOntology(s, "class:People");
    s = toggleGroupCommunity(s, "Baker Street");
    s = clearGrouping(s);
    expect(s.options.groupBy.grouped).toEqual([]);
  });
});

describe("viewerState — T3 baseline fold-to-level (F8, ontology grouped keys only)", () => {
  it("foldOntologyToLevel SETS the ontology grouped keys to EXACTLY the level ids", () => {
    let s = createDefaultViewerState();
    // Fold to Domain (the level-0 roots).
    s = foldOntologyToLevel(s, [
      "class:Narration",
      "class:People",
      "class:Case",
      "class:Place",
    ]);
    expect(splitGroupedKeys(s.options.groupBy.grouped).ontologyClassIds.sort()).toEqual([
      "class:Case",
      "class:Narration",
      "class:People",
      "class:Place",
    ]);
    // Now fold to Sub-domain: the ontology keys are REPLACED (moves finer); the
    // Domain roots do NOT remain — distinguishing from a blind union.
    s = foldOntologyToLevel(s, ["class:Dialogue", "class:Suspects"]);
    const ids = splitGroupedKeys(s.options.groupBy.grouped).ontologyClassIds.sort();
    expect(ids).toEqual(["class:Dialogue", "class:Suspects"]);
    expect(ids).not.toContain("class:Narration");
  });

  it("foldOntologyToLevel REPLACES only ontology keys; community keys are untouched", () => {
    let s = createDefaultViewerState();
    s = toggleGroupCommunity(s, "Baker Street");
    s = toggleGroupOntology(s, "class:OldClass");
    s = foldOntologyToLevel(s, ["class:People", "class:Place"]);
    const { ontologyClassIds, communityKeys } = splitGroupedKeys(s.options.groupBy.grouped);
    // The stale ontology key was dropped; the level ids replaced it.
    expect(ontologyClassIds.sort()).toEqual(["class:People", "class:Place"]);
    expect(ontologyClassIds).not.toContain("class:OldClass");
    // The community fold survived the ontology-level baseline.
    expect(communityKeys).toEqual(["Baker Street"]);
  });

  it("foldOntologyToLevel with [] clears the ontology keys but keeps communities", () => {
    let s = createDefaultViewerState();
    s = toggleGroupCommunity(s, "Baker Street");
    s = toggleGroupOntology(s, "class:People");
    s = foldOntologyToLevel(s, []);
    const { ontologyClassIds, communityKeys } = splitGroupedKeys(s.options.groupBy.grouped);
    expect(ontologyClassIds).toEqual([]);
    expect(communityKeys).toEqual(["Baker Street"]);
  });

  it("exposes ONTOLOGY_LEVELS as the Domain/Sub-domain/Type baseline indices", () => {
    expect(ONTOLOGY_LEVELS).toEqual({ domain: 0, subDomain: 1, type: 2 });
  });
});

describe("viewerState — T7 pure migration of LEGACY shapes INTO the grouped set", () => {
  it("migrates legacy flat showOntologyClasses + collapsedClassIds → ontology keys", () => {
    const normalized = normalizeViewerState({
      options: {
        showOntologyClasses: true,
        collapsedClassIds: ["class:Person", "class:Person", "class:Place"],
      },
    });
    const { ontologyClassIds, communityKeys } = splitGroupedKeys(
      normalized.options.groupBy.grouped,
    );
    expect(ontologyClassIds.sort()).toEqual(["class:Person", "class:Place"]);
    expect(communityKeys).toEqual([]);
    // The subsumed legacy flat fields are dropped so they cannot drift.
    expect(normalized.options.showOntologyClasses).toBeUndefined();
    expect(normalized.options.collapsedClassIds).toBeUndefined();
    // No stale `axis` survives either.
    expect(normalized.options.groupBy.axis).toBeUndefined();
  });

  it("an absent / showOntologyClasses:false groupBy migrates to an EMPTY grouped set", () => {
    expect(normalizeViewerState({}).options.groupBy.grouped).toEqual([]);
    expect(
      normalizeViewerState({ options: { showOntologyClasses: false } }).options.groupBy.grouped,
    ).toEqual([]);
  });

  it("migrates the older axis-scoped groupBy.axis:'ontology' collapse set → ontology keys", () => {
    const normalized = normalizeViewerState({
      options: {
        groupBy: {
          axis: "ontology",
          ontology: { collapsedClassIds: ["class:People", "class:Place"] },
        },
      },
    });
    const { ontologyClassIds, communityKeys } = splitGroupedKeys(
      normalized.options.groupBy.grouped,
    );
    expect(ontologyClassIds.sort()).toEqual(["class:People", "class:Place"]);
    expect(communityKeys).toEqual([]);
    expect(normalized.options.groupBy.axis).toBeUndefined();
  });

  it("migrates the older axis-scoped groupBy.axis:'community' collapse set → community keys", () => {
    const normalized = normalizeViewerState({
      options: {
        groupBy: {
          axis: "community",
          community: { collapsedKeys: ["Baker Street", "Scotland Yard"] },
        },
      },
    });
    const { ontologyClassIds, communityKeys } = splitGroupedKeys(
      normalized.options.groupBy.grouped,
    );
    expect(communityKeys.sort()).toEqual(["Baker Street", "Scotland Yard"]);
    expect(ontologyClassIds).toEqual([]);
  });

  it("BOTH legacy axis collapse sets fold in regardless of which axis was 'active'", () => {
    // The persisted axis was "community", but per-item grouping has no single
    // active axis — every fold is live, so the ontology set folds in too.
    const normalized = normalizeViewerState({
      options: {
        groupBy: {
          axis: "community",
          ontology: { collapsedClassIds: ["class:People"] },
          community: { collapsedKeys: ["Baker Street"] },
        },
      },
    });
    const { ontologyClassIds, communityKeys } = splitGroupedKeys(
      normalized.options.groupBy.grouped,
    );
    expect(ontologyClassIds).toEqual(["class:People"]);
    expect(communityKeys).toEqual(["Baker Street"]);
  });

  it("a per-item grouped set is preserved as-is (normalized + deduped)", () => {
    const normalized = normalizeViewerState({
      options: {
        groupBy: {
          grouped: [
            groupKeyForOntology("class:People"),
            groupKeyForOntology("class:People"), // dup
            groupKeyForCommunity("Baker Street"),
            "", // dropped
          ],
        },
      },
    });
    expect(normalized.options.groupBy.grouped.sort()).toEqual(
      [groupKeyForOntology("class:People"), groupKeyForCommunity("Baker Street")].sort(),
    );
  });
});
