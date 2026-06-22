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

describe("LeftRail — T13 F2 visible-UI lock (PER-ITEM group-by checkboxes)", () => {
  it("NO 'Show ontology classes' checkbox remains (input nor label text)", () => {
    expect(railSource).not.toMatch(/Show ontology classes/i);
    // The pre-B2 checkbox handler / props are gone from the LeftRail ↔ App wiring.
    expect(railSource).not.toMatch(/onToggleOntologyClasses/);
    expect(railSource).not.toMatch(/showOntologyClasses/);
    expect(appSource).not.toMatch(/showOntologyClasses=/);
    expect(appSource).not.toMatch(/onToggleOntologyClasses=/);
  });

  it("the OLD axis selector + per-axis fold sub-menu are fully removed", () => {
    // No "Group by" axis sub-menu, no axis radiogroup, no axis handlers/props.
    expect(railSource).not.toMatch(/<Collapsible title="Group by"/);
    expect(railSource).not.toMatch(/aria-label="Group-by axis"/);
    expect(railSource).not.toMatch(/onSetAxis/);
    expect(railSource).not.toMatch(/onToggleCollapse/);
    expect(railSource).not.toMatch(/onExpandAll/);
    expect(railSource).not.toMatch(/availableAxes/);
    expect(railSource).not.toMatch(/showCommunityAxis|showOntologyAxis/);
    expect(railSource).not.toMatch(/groupBy\.axis/);
    // …and the App no longer wires any axis prop/derivation either.
    expect(appSource).not.toMatch(/availableAxes/);
    expect(appSource).not.toMatch(/onSetAxis/);
    expect(appSource).not.toMatch(/onToggleCollapse/);
    expect(appSource).not.toMatch(/setGroupAxis/);
  });

  it("each groupable Ontology CLASS node owns a per-item group-by checkbox", () => {
    // Domain + Sub-domain class headers each carry a checkbox → onToggleGroupOntology.
    expect(railSource).toMatch(/class="rail-group-check"/);
    expect(railSource).toMatch(/onToggleGroupOntology\?\.\(domain\.id\)/);
    expect(railSource).toMatch(/onToggleGroupOntology\?\.\(sub\.id\)/);
    // The checked state reflects membership in the grouped SET (per-item).
    expect(railSource).toMatch(/checked=\{ontologyGrouped\.has\(domain\.id\)\}/);
    expect(railSource).toMatch(/checked=\{ontologyGrouped\.has\(sub\.id\)\}/);
    // App passes the per-item callbacks + availability flags (NOT availableAxes).
    expect(appSource).toMatch(/onToggleGroupOntology=\{handleToggleGroupOntology\}/);
    expect(appSource).toMatch(/onToggleGroupCommunity=\{handleToggleGroupCommunity\}/);
    expect(appSource).toMatch(/\{canGroupOntology\}/);
    expect(appSource).toMatch(/\{canGroupCommunity\}/);
  });

  it("each Community row owns a per-item group-by checkbox (separate from its select)", () => {
    expect(railSource).toMatch(/onToggleGroupCommunity\?\.\(c\.key\)/);
    expect(railSource).toMatch(/checked=\{communityGrouped\.has\(c\.key\)\}/);
  });

  it("the bulk baseline + ungroup-all controls drive the grouped set (F8)", () => {
    // Bulk baseline buttons (F8): Domain / Sub-domain / Type → onFoldToLevel.
    expect(railSource).toMatch(/onFoldToLevel\?\.\(0\)/);
    expect(railSource).toMatch(/onFoldToLevel\?\.\(1\)/);
    expect(railSource).toMatch(/onFoldToLevel\?\.\(2\)/);
    // The ungroup-all reset clears the whole grouped set.
    expect(railSource).toMatch(/onClearGrouping\?\.\(/);
    expect(appSource).toMatch(/onFoldToLevel=\{handleFoldToLevel\}/);
    expect(appSource).toMatch(/onClearGrouping=\{handleClearGrouping\}/);
  });

  it("the group-by checkbox is on the LEFT (leading) with NO 'group' text (SPEC)", () => {
    // SPEC PART 1: the bare checkbox is the FIRST element on the row — it lives in
    // a `leading()` snippet (left edge), NOT in `trailing()` (right side).
    // Each group-by checkbox is immediately preceded by a `{#snippet leading()}`.
    const checkboxBlocks = railSource.split('class="rail-group-check"');
    // 3 group-by checkboxes (Domain, Sub-domain, Community) → 4 split segments.
    expect(checkboxBlocks.length).toBe(4);
    for (let i = 1; i < checkboxBlocks.length; i += 1) {
      const before = checkboxBlocks[i - 1];
      // The nearest snippet opening before the checkbox is leading(), not trailing().
      const leadIdx = before.lastIndexOf("{#snippet leading()}");
      const trailIdx = before.lastIndexOf("{#snippet trailing()}");
      expect(leadIdx, `checkbox #${i} must sit inside a leading() snippet`).toBeGreaterThan(
        trailIdx,
      );
    }
    // NO persistent "group" text label anywhere — the rail-group-hint span is gone.
    expect(railSource).not.toMatch(/rail-group-hint/);
    expect(railSource).not.toMatch(/>group<\/span>/);
    expect(railSource).not.toMatch(/aria-hidden="true">group/);
    // The HOVER signal stays: the title tooltip "Group by …" is preserved.
    expect(railSource).toMatch(/title="Group by /);
  });

  it("the Ontology FILTER facet stays SEPARATE from the group-by checkboxes", () => {
    // The Ontology accordion (taxonomy facet) renders SelectableRow + TypeShapeGlyph
    // + onToggleType — the FILTER concern, distinct from the group-by checkbox.
    expect(railSource).toMatch(/<Collapsible title="Ontology"/);
    expect(railSource).toMatch(/<TypeShapeGlyph type=\{t\.key\}/);
    expect(railSource).toMatch(/onselect=\{\(\) => onToggleType\?\.\(t\.key\)\}/);
    // The group-by checkbox calls onToggleGroupOntology, NEVER onToggleType —
    // grouping a class is not selecting/filtering it.
    expect(railSource).not.toMatch(/onToggleType\?\.\([^)]*\)[\s\S]{0,40}rail-group-check/);
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
