import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  normalizeViewerState,
  normalizeGroupAxisAvailability,
  setGroupAxis,
} from "../lib/viewerState.js";

const appSource = readFileSync(resolve(process.cwd(), "src/App.svelte"), "utf8");

/**
 * B2 regression: an active Ontology group-by axis must SURVIVE a model switch in
 * a multi-model bundle when the new model exposes the same taxonomy.
 *
 * The bug: handleSelectModel() nulled `classHierarchies` synchronously BEFORE the
 * new model's taxonomy landed. While null, the derived `availableAxes` drops
 * "ontology" and the availability $effect (normalizeGroupAxisAvailability)
 * downgrades groupBy.axis "ontology" → "none". The re-fetched taxonomy re-enables
 * the axis, but nothing restored it — so the active grouping silently vanished
 * (the per-axis collapse set survived in viewerState, but the axis was lost so
 * nothing folded).
 *
 * The fix captures the intended axis before the switch and re-asserts it once the
 * artifact lands IF the new model supports it again.
 */
describe("model switch — group-by axis survives (B2 regression)", () => {
  // Model the App's `availableAxes` derivation for the ontology axis: it is
  // present iff the class-hierarchies artifact is loaded. (Community stays atomic
  // with the graph swap and is exercised separately.)
  const availableAxesFor = ({ ontologyLoaded }) => [
    "none",
    ...(ontologyLoaded ? ["ontology"] : []),
  ];

  it("downgrade-then-restore: an active ontology axis is reasserted once the new model's taxonomy lands", () => {
    // User has Ontology grouping active with a fold in place (F3 collapse set).
    let state = normalizeViewerState({
      options: {
        groupBy: {
          axis: "ontology",
          ontology: { collapsedClassIds: ["class:People"] },
        },
      },
    });
    expect(state.options.groupBy.axis).toBe("ontology");

    // The handler captures the intended axis BEFORE dropping per-model artifacts.
    const intendedAxis = state.options.groupBy.axis;

    // --- model switch in flight: classHierarchies = null --------------------
    // availableAxes drops "ontology"; the availability $effect downgrades the axis.
    state = normalizeGroupAxisAvailability(state, availableAxesFor({ ontologyLoaded: false }));
    expect(state.options.groupBy.axis).toBe("none"); // the transient downgrade
    // The per-axis collapse set is RETAINED across the downgrade (F3 survives).
    expect(state.options.groupBy.ontology.collapsedClassIds).toEqual(["class:People"]);

    // --- new model's taxonomy lands: classHierarchies set again -------------
    const availableAxes = availableAxesFor({ ontologyLoaded: true });
    // The fix re-asserts the intended axis when it is available again.
    if (intendedAxis !== state.options.groupBy.axis && availableAxes.includes(intendedAxis)) {
      state = setGroupAxis(state, intendedAxis);
    }

    // Restored: the active grouping (axis + its fold) is back.
    expect(state.options.groupBy.axis).toBe("ontology");
    expect(state.options.groupBy.ontology.collapsedClassIds).toEqual(["class:People"]);
  });

  it("does NOT restore an axis the new model genuinely lacks (no taxonomy)", () => {
    let state = normalizeViewerState({ options: { groupBy: { axis: "ontology" } } });
    const intendedAxis = state.options.groupBy.axis;

    // Switch into a model WITHOUT a class-hierarchies artifact: ontology stays
    // unavailable even after the load settles.
    const availableAxes = availableAxesFor({ ontologyLoaded: false });
    state = normalizeGroupAxisAvailability(state, availableAxes);
    if (intendedAxis !== state.options.groupBy.axis && availableAxes.includes(intendedAxis)) {
      state = setGroupAxis(state, intendedAxis);
    }
    // Correctly stays "none" — the restore is gated on real availability.
    expect(state.options.groupBy.axis).toBe("none");
  });

  it("handleSelectModel captures the intended axis and re-asserts it after the artifact lands", () => {
    // Source assertion (jsdom can't mount the GraphCanvas-bearing App tree — same
    // convention as appHeader/leftRail tests). This step is ABSENT in the buggy
    // version, so this guards against the regression returning.
    const handler =
      appSource.match(/async function handleSelectModel\([\s\S]*?\n  }\n/)?.[0] ?? "";
    expect(handler).not.toBe("");

    // Captures the axis BEFORE dropping per-model artifacts (classHierarchies=null).
    expect(handler).toMatch(
      /const intendedAxis = viewerState\.options\.groupBy\.axis;[\s\S]*classHierarchies = null;/,
    );
    // Re-asserts the intended axis after loadActiveModel(), gated on availability.
    expect(handler).toMatch(/await loadActiveModel\(\);/);
    expect(handler).toMatch(
      /availableAxes\.includes\(intendedAxis\)[\s\S]*viewerState = setGroupAxis\(viewerState, intendedAxis\)/,
    );
  });
});
