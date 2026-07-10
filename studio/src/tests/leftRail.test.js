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
    expect(railSource).toMatch(/checked=\{ontologyCheckedSet\.has\(domain\.id\)\}/);
    expect(railSource).toMatch(/checked=\{ontologyCheckedSet\.has\(sub\.id\)\}/);
    // App passes the per-item callbacks + availability flags (NOT availableAxes).
    expect(appSource).toMatch(/onToggleGroupOntology=\{handleToggleGroupOntology\}/);
    expect(appSource).toMatch(/onToggleGroupCommunity=\{handleToggleGroupCommunity\}/);
    expect(appSource).toMatch(/\{canGroupOntology\}/);
    expect(appSource).toMatch(/\{canGroupCommunity\}/);
  });

  it("each leaf TYPE row owns its OWN group-by checkbox (§2 — fixes Type grouping)", () => {
    // The Type checkbox folds entities of that `type` → onToggleGroupType(t.key);
    // its checked state reads the type-scoped membership set.
    expect(railSource).toMatch(/onToggleGroupType\?\.\(t\.key\)/);
    expect(railSource).toMatch(/checked=\{typeCheckedSet\.has\(t\.key\)\}/);
    // It is SEPARATE from the Type FILTER SelectableRow (onToggleType) on the row.
    expect(railSource).toMatch(/rail-type-group-check/);
    expect(appSource).toMatch(/onToggleGroupType=\{handleToggleGroupType\}/);
  });

  it("the FLAT fallback (no taxonomy) ALSO offers a per-type group-by checkbox", () => {
    // FIX: when the class taxonomy is absent the Ontology facet falls back to the
    // {:else} flat list. It must still expose the Type-axis group-by (the engine
    // folds by type WITHOUT a taxonomy), so "Group by entity" is reachable there
    // too — mirroring the accordion leaf. The flat list is now a <ul> of
    // standalone rows (checkbox → onToggleGroupType, then the FILTER SelectableRow
    // → onToggleType), NOT a bare SelectableList without a group-by affordance.
    expect(railSource).toMatch(/rail-type-flat/);
    // The flat branch renders BOTH a group-by checkbox AND the filter row per type.
    expect(railSource).toMatch(
      /rail-type-flat[\s\S]*?rail-type-group-check[\s\S]*?onToggleGroupType\?\.\(t\.key\)[\s\S]*?onselect=\{\(\) => onToggleType\?\.\(t\.key\)\}/,
    );
    // There are now FIVE `--on` group-by checkboxes in the source: Domain,
    // Sub-domain, accordion Type, FLAT Type, Community (the accordion + flat Type
    // checkboxes are mutually exclusive at runtime via {#if typeTree}/{:else}).
    const onMarkers = railSource.match(/class:rail-group-check--on=/g) ?? [];
    expect(onMarkers.length).toBe(5);
  });

  it("each Community row owns a per-item group-by checkbox (separate from its select)", () => {
    expect(railSource).toMatch(/onToggleGroupCommunity\?\.\(c\.key\)/);
    expect(railSource).toMatch(/checked=\{communityCheckedSet\.has\(c\.key\)\}/);
  });

  it("the ONTOLOGY tri-state bulk buttons drive the grouped set (§4)", () => {
    // Tri-state bulk via DS Button → onBulkLevel(0|1|2), variant from the level's
    // {none|partial|all} state, a count Badge for partial, aria-pressed (NOT mixed).
    expect(railSource).toMatch(/onBulkLevel\?\.\(0\)/);
    expect(railSource).toMatch(/onBulkLevel\?\.\(1\)/);
    expect(railSource).toMatch(/onBulkLevel\?\.\(2\)/);
    expect(railSource).toMatch(/variant=\{domainBtn\.variant\}/);
    expect(railSource).toMatch(/aria-pressed=\{domainBtn\.ariaPressed\}/);
    expect(railSource).toMatch(/\{domainBtn\.badge\}/);
    // The DS Button only has primary/secondary — partial = secondary + Badge,
    // never aria-checked="mixed".
    expect(railSource).not.toMatch(/aria-checked="mixed"/);
    // Scope-local Ungroup all (ontology), native disabled when nothing ontology grouped.
    expect(railSource).toMatch(/disabled=\{!ontologyGrouped\}/);
    expect(railSource).toMatch(/onClearOntologyGrouping\?\.\(/);
    expect(appSource).toMatch(/onBulkLevel=\{handleBulkLevel\}/);
    expect(appSource).toMatch(/onClearOntologyGrouping=\{handleClearOntologyGrouping\}/);
  });

  it("the COMMUNITY section is FLAT 2-state — Group all / Ungroup all, no count (§5)", () => {
    // Group all toggles secondary↔primary (aria-pressed) on allCommunitiesGrouped.
    expect(railSource).toMatch(/onBulkCommunities\?\.\(/);
    expect(railSource).toMatch(/allCommunitiesGrouped \? "primary" : "secondary"/);
    expect(railSource).toMatch(/aria-pressed=\{allCommunitiesGrouped \? "true" : "false"\}/);
    // Community Ungroup all: native disabled when nothing community grouped.
    expect(railSource).toMatch(/disabled=\{!communityGrouped\}/);
    expect(railSource).toMatch(/onClearCommunityGrouping\?\.\(/);
    // NO partial/count badge in the community bulk (FLAT).
    expect(appSource).toMatch(/onBulkCommunities=\{handleBulkCommunities\}/);
    expect(appSource).toMatch(/onClearCommunityGrouping=\{handleClearCommunityGrouping\}/);
  });

  it("the group-by checkbox is on the LEFT with NO 'group' text (SPEC)", () => {
    // SPEC PART 1: the bare checkbox is the FIRST element on the row. There are
    // FIVE group-by checkboxes — Domain, Sub-domain, accordion Type, FLAT-fallback
    // Type, Community — each carrying the `rail-group-check` affordance (the two
    // Type ones add the `rail-type-group-check` variant; the accordion and flat
    // Type checkboxes are mutually exclusive at runtime via {#if typeTree}/{:else}).
    const onMarkers = railSource.match(/class:rail-group-check--on=/g) ?? [];
    expect(onMarkers.length).toBe(5);
    // FIX: the DS Collapsible exposes NO `leading` slot (only trailing/children),
    // so the Domain + Sub-domain group-by checkboxes are SIBLINGS *before*
    // <Collapsible> inside a `.rail-onto-head` flex row — NOT in a (silently
    // dropped) leading() snippet. That dropped slot is exactly why the
    // Domain/Sub-domain checkboxes were invisible.
    const ontoHeads = railSource.match(/<li class="rail-onto-head">/g) ?? [];
    expect(ontoHeads.length).toBe(2); // Domain + Sub-domain rows
    expect(railSource).toMatch(
      /<li class="rail-onto-head">[\s\S]*?class="rail-group-check"[\s\S]*?onToggleGroupOntology[\s\S]*?<Collapsible/,
    );
    // Regression guard: NEVER put a group-by checkbox in a Collapsible leading()
    // snippet — the DS Collapsible drops it.
    expect(railSource).not.toMatch(/<Collapsible[^>]*>\s*\{#snippet leading\(\)\}/);
    // The leaf Type checkbox sits FIRST in its flex row, BEFORE the FILTER
    // SelectableRow — left, bare, separate from the Type FILTER select (§2).
    expect(railSource).toMatch(
      /rail-type-group-check[\s\S]*?onToggleGroupType[\s\S]*?<SelectableRow/,
    );
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
