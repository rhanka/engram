import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createDefaultViewerState,
  normalizeViewerState,
  clearSelection,
  toggleGroupOntology,
  toggleGroupCommunity,
  toggleEntity,
  splitGroupedKeys,
  groupKeyForOntology,
} from "../lib/viewerState.js";

const appSource = readFileSync(resolve(process.cwd(), "src/App.svelte"), "utf8");

/**
 * B2 regression (per-item grouped set): an active group-by must SURVIVE a model
 * switch. In the per-item model the grouped SET lives in
 * `viewerState.options.groupBy.grouped`; a model switch only clears the
 * SELECTION/focus (clearSelection), never the grouping. So unlike the old
 * axis-scoped model — where `classHierarchies = null` transiently downgraded the
 * axis to "none" and the grouping silently vanished — there is no axis to lose:
 * the grouped keys persist verbatim. The App still re-fetches the per-model
 * taxonomy eagerly (loadActiveModel) so grouped ONTOLOGY keys re-apply against the
 * new model's class ids.
 */
describe("model switch — grouped set survives (B2 per-item regression)", () => {
  it("clearSelection (run on every model switch) leaves the grouped set untouched", () => {
    // User has BOTH an ontology class and a community grouped, plus a selection.
    let state = createDefaultViewerState();
    state = toggleGroupOntology(state, "class:People");
    state = toggleGroupCommunity(state, "Baker Street");
    state = toggleEntity(state, "holmes"); // a live selection + focus

    expect(state.selection.entities).toEqual(["holmes"]);
    expect(state.focusId).toBe("holmes");

    // The model switch clears the selection/focus (ids don't carry across models)…
    const switched = clearSelection(state);
    expect(switched.selection.entities).toEqual([]);
    expect(switched.focusId).toBeNull();

    // …but the grouped SET is preserved verbatim (grouping is model-agnostic).
    const { ontologyClassIds, communityKeys } = splitGroupedKeys(
      switched.options.groupBy.grouped,
    );
    expect(ontologyClassIds).toEqual(["class:People"]);
    expect(communityKeys).toEqual(["Baker Street"]);
  });

  it("a grouped ontology key re-applies once the new model's taxonomy lands (same class id)", () => {
    // Persisted grouped set referencing a class id the new model also provides.
    let state = normalizeViewerState({
      options: { groupBy: { grouped: [groupKeyForOntology("class:People")] } },
    });
    // Switch in flight: clearSelection runs; the grouped key is unaffected.
    state = clearSelection(state);
    // Once the new model's taxonomy (with class:People) is fetched, the SAME
    // ontology grouped key folds again — nothing had to be "reasserted".
    expect(splitGroupedKeys(state.options.groupBy.grouped).ontologyClassIds).toEqual([
      "class:People",
    ]);
  });

  it("a grouped key for a class the new model LACKS simply contributes no fold (engine ignores it)", () => {
    // Per the App's groupedGraph wiring, an ontology grouped key whose class id is
    // absent from the new taxonomy yields no collapse target — it neither errors
    // nor is silently dropped from the persisted set. Here we assert it is retained
    // (so a switch BACK to a model that has it re-folds).
    let state = normalizeViewerState({
      options: { groupBy: { grouped: [groupKeyForOntology("class:ModelOnlyClass")] } },
    });
    state = clearSelection(state);
    expect(state.options.groupBy.grouped).toEqual([groupKeyForOntology("class:ModelOnlyClass")]);
  });

  it("handleSelectModel preserves the grouped set + re-fetches the taxonomy (source guard)", () => {
    // Source assertion (jsdom can't mount the GraphCanvas-bearing App tree — same
    // convention as appHeader/leftRail tests). Guards the regression from returning.
    const handler =
      appSource.match(/async function handleSelectModel\([\s\S]*?\n  }\n/)?.[0] ?? "";
    expect(handler).not.toBe("");

    // The switch captures whether any ONTOLOGY item was grouped BEFORE dropping the
    // per-model taxonomy artifact (classHierarchies=null).
    expect(handler).toMatch(
      /splitGroupedKeys\([\s\S]*?\)\.ontologyClassIds\.length > 0;[\s\S]*classHierarchies = null;/,
    );
    // It clears only the SELECTION (never the grouped set).
    expect(handler).toMatch(/viewerState = clearSelection\(viewerState\)/);
    // And it re-fetches the taxonomy after loadActiveModel() so grouped ontology
    // keys re-apply against the new model's class ids.
    expect(handler).toMatch(/await loadActiveModel\(\);/);
    expect(handler).toMatch(/hadOntologyGroup[\s\S]*await ensureClassHierarchies\(\)/);
    // The old axis-restore machinery is GONE.
    expect(handler).not.toMatch(/setGroupAxis/);
    expect(handler).not.toMatch(/normalizeGroupAxisAvailability/);
  });
});
