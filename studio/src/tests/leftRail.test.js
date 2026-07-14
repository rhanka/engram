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

  it("each groupable Ontology CLASS node owns a per-entity visibility control (D6)", () => {
    // The old group checkbox is SUPERSEDED by EntityStateControl (Normal · Grouped
    // · Hidden · Solo). Domain + Sub-domain class headers each instantiate it,
    // keyed by the namespaced ontology key + wired to onSetEntityState.
    expect(railSource).toMatch(/import EntityStateControl from "\.\/EntityStateControl\.svelte"/);
    expect(railSource).toMatch(/key=\{groupKeyForOntology\(domain\.id\)\}/);
    expect(railSource).toMatch(/key=\{groupKeyForOntology\(sub\.id\)\}/);
    // The displayed state comes from the D2 storage (Solo > Hidden > Grouped > Normal).
    expect(railSource).toMatch(/state=\{entityStateOf\(groupKeyForOntology\(domain\.id\)\)\}/);
    expect(railSource).toMatch(/state=\{entityStateOf\(groupKeyForOntology\(sub\.id\)\)\}/);
    expect(railSource).toMatch(/onSetState=\{onSetEntityState\}/);
    // App wires the reducer setter + the visibility overlay + availability flags.
    expect(appSource).toMatch(/onSetEntityState=\{handleSetEntityState\}/);
    expect(appSource).toMatch(/visibility=\{viewerState\.options\.visibility\}/);
    expect(appSource).toMatch(/\{canGroupOntology\}/);
    expect(appSource).toMatch(/\{canGroupCommunity\}/);
  });

  it("each leaf TYPE row owns its OWN visibility control (§2), separate from the FILTER row", () => {
    // The Type control targets that `type`'s namespaced key; it is a SEPARATE
    // concern from the Type FILTER SelectableRow (onToggleType) that follows it.
    expect(railSource).toMatch(/key=\{groupKeyForType\(t\.key\)\}/);
    expect(railSource).toMatch(/state=\{entityStateOf\(groupKeyForType\(t\.key\)\)\}/);
    expect(railSource).toMatch(/rail-type-group-check/);
    // Its own control is disabled (absorbed) when a parent Sub-domain/Domain is grouped.
    expect(railSource).toMatch(/disabled=\{ontologyCheckedSet\.has\(sub\.id\) \|\|/);
    expect(appSource).toMatch(/onSetEntityState=\{handleSetEntityState\}/);
  });

  it("each Community row owns its OWN visibility control (separate from its select)", () => {
    expect(railSource).toMatch(/key=\{groupKeyForCommunity\(c\.key\)\}/);
    expect(railSource).toMatch(/state=\{entityStateOf\(groupKeyForCommunity\(c\.key\)\)\}/);
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

  it("the visibility control is on the LEFT of every row, superseding the checkbox (D6)", () => {
    // D6: the per-entity control is the FIRST element on the row. There are FOUR
    // EntityStateControl instances — Domain, Sub-domain, Type, Community.
    const controls = railSource.match(/<EntityStateControl/g) ?? [];
    expect(controls.length).toBe(4);
    // The old bare-checkbox affordance is gone (no <input type="checkbox"> group-by).
    expect(railSource).not.toMatch(/class="rail-group-check"/);
    expect(railSource).not.toMatch(/class:rail-group-check--on=/);
    // FIX (preserved): the DS Collapsible exposes NO `leading` slot, so the Domain
    // + Sub-domain controls are SIBLINGS *before* <Collapsible> in a `.rail-onto-head`
    // flex row — NOT in a (silently dropped) leading() snippet.
    const ontoHeads = railSource.match(/<li class="rail-onto-head">/g) ?? [];
    expect(ontoHeads.length).toBe(2); // Domain + Sub-domain rows
    expect(railSource).toMatch(
      /<li class="rail-onto-head">[\s\S]*?<EntityStateControl[\s\S]*?groupKeyForOntology[\s\S]*?<Collapsible/,
    );
    // Regression guard: NEVER put the control in a Collapsible leading() snippet.
    expect(railSource).not.toMatch(/<Collapsible[^>]*>\s*\{#snippet leading\(\)\}/);
    // The leaf Type control sits FIRST in its flex row, BEFORE the FILTER
    // SelectableRow — separate from the Type FILTER select (§2).
    expect(railSource).toMatch(
      /rail-type-group-check[\s\S]*?<EntityStateControl[\s\S]*?<SelectableRow/,
    );
    // NO persistent "group" text label anywhere — the rail-group-hint span is gone.
    expect(railSource).not.toMatch(/rail-group-hint/);
    expect(railSource).not.toMatch(/>group<\/span>/);
    // The global "Reset visibility" affordance lives under the search stats (D6).
    expect(railSource).toMatch(/aria-label="Reset all entity visibility"/);
    expect(railSource).toMatch(/Reset visibility/);
    expect(railSource).toMatch(/disabled=\{!hasVisibilityOverride\}/);
    expect(appSource).toMatch(/onResetVisibility=\{handleResetVisibility\}/);
    expect(appSource).toMatch(/hasVisibilityOverride=\{anyVisibilityOverride\}/);
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
