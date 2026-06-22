import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * B2 — T13 (F2 visible-UI lock) + the tracked badge-relocation / reactive-count
 * change. The studio's component tests assert against the .svelte SOURCE (jsdom
 * has no Canvas2D, so we don't mount the GraphCanvas-bearing tree — same
 * source-assertion style as appHeader.test.js / reconciliationView.test.js).
 */
const railSource = readFileSync(
  resolve(process.cwd(), "src/components/LeftRail.svelte"),
  "utf8",
);
const appSource = readFileSync(resolve(process.cwd(), "src/App.svelte"), "utf8");

describe("LeftRail — T13 F2 visible-UI lock (group-by replaces the checkbox)", () => {
  it("NO 'Show ontology classes' checkbox remains (input nor label text)", () => {
    expect(railSource).not.toMatch(/Show ontology classes/i);
    // The pre-B2 checkbox handler / props are gone from the LeftRail ↔ App wiring.
    expect(railSource).not.toMatch(/onToggleOntologyClasses/);
    expect(railSource).not.toMatch(/showOntologyClasses/);
    expect(appSource).not.toMatch(/showOntologyClasses=/);
    expect(appSource).not.toMatch(/onToggleOntologyClasses=/);
  });

  it("the group-by axis control appears under Options with a 3-way None/Community/Ontology selector", () => {
    expect(railSource).toMatch(/<Collapsible title="Options"/);
    expect(railSource).toMatch(/<Collapsible title="Group by"/);
    expect(railSource).toMatch(/role="radiogroup"[\s\S]*aria-label="Group-by axis"/);
    // The three axis buttons.
    expect(railSource).toMatch(/onSetAxis\?\.\("none"\)/);
    expect(railSource).toMatch(/onSetAxis\?\.\("community"\)/);
    expect(railSource).toMatch(/onSetAxis\?\.\("ontology"\)/);
  });

  it("absent axes are OMITTED from the picker (driven by availableAxes, not hard-coded)", () => {
    // Community / Ontology buttons are gated on availability flags derived from
    // the availableAxes prop — not always rendered.
    expect(railSource).toMatch(/showCommunityAxis = \$derived\(axisAvailable\.has\("community"\)\)/);
    expect(railSource).toMatch(/showOntologyAxis = \$derived\(axisAvailable\.has\("ontology"\)\)/);
    expect(railSource).toMatch(/{#if showCommunityAxis}/);
    expect(railSource).toMatch(/{#if showOntologyAxis}/);
    // App computes availableAxes from artifact presence + liveCount and passes it.
    expect(appSource).toMatch(/availableAxes = \$derived\(\[/);
    expect(appSource).toMatch(/communityInfo\.liveCount > 0 \? \["community"\]/);
    expect(appSource).toMatch(/classHierarchies\?\.hierarchies \? \["ontology"\]/);
    expect(appSource).toMatch(/<LeftRail[\s\S]*\{availableAxes\}/);
  });

  it("the ontology fold tree uses fold pills/glyphs, NOT selectable rows (Two-Concepts)", () => {
    // Group-by renders fold pills + state glyphs.
    expect(railSource).toMatch(/class="rail-fold-pill"/);
    expect(railSource).toMatch(/onToggleCollapse\?\.\(/);
    // Bulk baseline buttons (F8): Domain / Sub-domain / Type.
    expect(railSource).toMatch(/onFoldToLevel\?\.\(0\)/);
    expect(railSource).toMatch(/onFoldToLevel\?\.\(1\)/);
    expect(railSource).toMatch(/onFoldToLevel\?\.\(2\)/);
    // Leaf Type rows are read-only in v1 (no fold pill on the leaf class label).
    expect(railSource).toMatch(/rail-fold-leaf/);
  });

  it("the Ontology FILTER facet stays separate (selectable rows + shape glyphs, own toggle)", () => {
    // The Ontology accordion (taxonomy facet) still renders SelectableRow + TypeShapeGlyph + onToggleType.
    expect(railSource).toMatch(/<Collapsible title="Ontology"/);
    expect(railSource).toMatch(/<TypeShapeGlyph type=\{t\.key\}/);
    expect(railSource).toMatch(/onselect=\{\(\) => onToggleType\?\.\(t\.key\)\}/);
    // Group-by toggles call onToggleCollapse, never onToggleType — and vice-versa.
    expect(railSource).not.toMatch(/onToggleType\?\.\([^)]*\)[\s\S]{0,40}rail-fold-pill/);
  });
});

describe("LeftRail — tracked UI: count badges relocated + reactive filtered count", () => {
  it("the count badges live under the search bar, not in the header", () => {
    expect(railSource).toMatch(/class="rail-search"[\s\S]*class="rail-stats"/);
    expect(railSource).toMatch(/aria-label="Graph summary"/);
    // edges / groups come from the passed-in scene stats.
    expect(railSource).toMatch(/\{stats\.edgeCount\} edges/);
    expect(railSource).toMatch(/\{stats\.communityCount\} groups/);
  });

  it("the nodes badge is REACTIVE to the search query: 'x / total nodes'", () => {
    // entityTotal = the count matching the query; totalNodeCount = the full graph.
    expect(railSource).toMatch(/totalNodeCount = \$derived\(graphNodes\(graph\)\.length\)/);
    expect(railSource).toMatch(/hasQuery = \$derived\(query\.trim\(\)\.length > 0\)/);
    // The badge shows "x / total nodes" while filtering, "total nodes" otherwise.
    expect(railSource).toMatch(/\{#if hasQuery\}\{entityTotal\} \/ \{totalNodeCount\} nodes/);
    expect(railSource).toMatch(/\{:else\}\{totalNodeCount\} nodes\{\/if\}/);
  });
});
