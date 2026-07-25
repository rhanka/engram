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
// The ontology CLASS row markup lives in the recursive OntologyClassNode (the
// tree is no longer capped at Domain → Sub-domain → Type), so the per-row locks
// below assert against that component.
const classNodeSource = readFileSync(
  resolve(process.cwd(), "src/components/OntologyClassNode.svelte"),
  "utf8",
);

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
    expect(classNodeSource).toMatch(
      /import EntityStateControl from "\.\/EntityStateControl\.svelte"/,
    );
    // ONE recursive row definition now covers EVERY class level (not just two),
    // keyed by the namespaced ontology key of the class it renders.
    expect(classNodeSource).toMatch(/groupKeyForOntology\(node\.id\)/);
    // The displayed state comes from the D2 storage (Solo > Hidden > Grouped > Normal).
    expect(classNodeSource).toMatch(/state=\{ctx\.entityStateOf\(key\)\}/);
    expect(classNodeSource).toMatch(/onSetState=\{ctx\.onSetEntityState\}/);
    // …and the rail renders one node per taxonomy root, recursing from there.
    expect(railSource).toMatch(/<OntologyClassNode node=\{domain\} ctx=\{ontologyCtx\} \/>/);
    // App wires the reducer setter + the visibility overlay + availability flags.
    expect(appSource).toMatch(/onSetEntityState=\{handleSetEntityState\}/);
    expect(appSource).toMatch(/visibility=\{viewerState\.options\.visibility\}/);
    expect(appSource).toMatch(/\{canGroupOntology\}/);
    expect(appSource).toMatch(/\{canGroupCommunity\}/);
  });

  it("each leaf TYPE row owns its OWN visibility control (§2), separate from the FILTER row", () => {
    // The Type control targets that `type`'s namespaced key; it is a SEPARATE
    // concern from the Type FILTER SelectableRow (onToggleType) that follows it.
    expect(classNodeSource).toMatch(/key=\{groupKeyForType\(t\.key\)\}/);
    expect(classNodeSource).toMatch(/state=\{ctx\.entityStateOf\(groupKeyForType\(t\.key\)\)\}/);
    expect(classNodeSource).toMatch(/rail-type-group-check/);
    // Its own control is disabled (absorbed) when ANY ancestor class is grouped —
    // at any depth now, via the inherited `childAbsorbedBy`.
    expect(classNodeSource).toMatch(/disabled=\{childAbsorbedBy != null\}/);
    expect(classNodeSource).toMatch(
      /absorbedBy \?\? \(ctx\.ontologyCheckedSet\.has\(node\.id\) \? node\.label : null\)/,
    );
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
    // The rail itself keeps only the Community control; the class + leaf-type
    // controls moved into the recursive node (one definition, every depth).
    expect((railSource.match(/<EntityStateControl/g) ?? []).length).toBe(1);
    expect((classNodeSource.match(/<EntityStateControl/g) ?? []).length).toBe(2);
    // The old bare-checkbox affordance is gone (no <input type="checkbox"> group-by).
    expect(railSource).not.toMatch(/class="rail-group-check"/);
    expect(railSource).not.toMatch(/class:rail-group-check--on=/);
    // FIX (preserved): the DS Collapsible exposes NO `leading` slot, so the class
    // control is a SIBLING *before* <Collapsible> in a `.rail-onto-head` flex row
    // — NOT in a (silently dropped) leading() snippet.
    expect(classNodeSource).toMatch(
      /<li class="rail-onto-head">\s*<EntityStateControl[\s\S]*?<Collapsible/,
    );
    // Regression guard: NEVER put the control in a Collapsible leading() snippet.
    expect(classNodeSource).not.toMatch(/<Collapsible[^>]*>\s*\{#snippet leading\(\)\}/);
    expect(railSource).not.toMatch(/<Collapsible[^>]*>\s*\{#snippet leading\(\)\}/);
    // The leaf Type control sits FIRST in its flex row, BEFORE the FILTER
    // SelectableRow — separate from the Type FILTER select (§2).
    expect(classNodeSource).toMatch(
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
    expect(classNodeSource).toMatch(/<TypeShapeGlyph type=\{t\.key\}/);
    expect(classNodeSource).toMatch(/onselect=\{\(\) => ctx\.onToggleType\?\.\(t\.key\)\}/);
    // The group-by checkbox calls onToggleGroupOntology, NEVER onToggleType —
    // grouping a class is not selecting/filtering it.
    expect(railSource).not.toMatch(/onToggleType\?\.\([^)]*\)[\s\S]{0,40}rail-group-check/);
  });
});

describe("LeftRail — Lot 1: strict taxonomy validation (kills 'Other 47575')", () => {
  it("no longer blindly takes the FIRST class-hierarchy (hs[keys[0]])", () => {
    // The blind first-key pick is what let an ABP process forest masquerade as an
    // ontology taxonomy → the 'Other 47575' bucket. It must be gone.
    expect(railSource).not.toMatch(/hs\[Object\.keys\(hs\)\[0\]\]/);
  });

  it("selects a taxonomy by CONVENTION + coverage, else falls back to the flat list", () => {
    // A dedicated validator picks the first VALID type-taxonomy: prefers the
    // conventional `am_class_tree`, requires leaf classes with member_node_types,
    // and gates on a coverage threshold; returns null ⇒ flat SelectableList.
    const treeSource = readFileSync(
      resolve(process.cwd(), "src/lib/ontologyTree.js"),
      "utf8",
    );
    expect(treeSource).toMatch(/export function selectTaxonomyHierarchy/);
    expect(treeSource).toMatch(/TAXONOMY_MIN_COVERAGE/);
    expect(treeSource).toMatch(/am_class_tree/);
    expect(treeSource).toMatch(/selectTaxonomyHierarchy\(classHierarchies\?\.hierarchies/);
    // Canonical first-level order mirrors the native viewer taxonomy.
    expect(treeSource).toMatch(
      /CANONICAL_ROOT_ORDER = \["Process", "Tool", "Data", "Org"\]/,
    );
  });
});

describe("LeftRail — ONE ontology: the process forests are NESTED, not a second accordion", () => {
  it("has NO separate 'Hierarchies' accordion any more", () => {
    // The trees ARE the ontology's Process branch; a parallel accordion was the
    // design error. Communities keep their own accordion (they are not ontology).
    expect(railSource).not.toMatch(/<Collapsible title="Hierarchies"/);
    expect(railSource).not.toMatch(/hierarchyList/);
    expect(railSource).toMatch(/<Collapsible title="Communities"/);
  });

  it("splices each forest under the CLASS that declares member_hierarchies", () => {
    // The binding is read off the compiled taxonomy (class-hierarchies.json), so
    // the mapping stays repo-declared — nothing process-std-specific in studio core.
    // (The derivation itself is unit-tested in ontologyTree.test.js.)
    expect(railSource).toMatch(
      /buildOntologyTree\(typeList, classHierarchies, forestList\)/,
    );
    expect(railSource).toMatch(/buildForestList\(sceneHierarchies\)/);
    expect(classNodeSource).toMatch(/\{#each node\.forests as forest \(forest\.key\)\}/);
    expect(classNodeSource).toMatch(/<HierarchyTreeNode/);
    expect(classNodeSource).toMatch(
      /onSelectSubtree=\{\(raw\) => ctx\.onSelectSubtree\(forest\.hierarchy, raw\)\}/,
    );
    expect(railSource).toMatch(/function selectSubtree\(hierarchy, rootRawId\)/);
    // The join maps raw registry ids (scene-hierarchies keys) to scene-node ids.
    expect(railSource).toMatch(/registry_record_id/);
  });

  it("never merges two forests on one class", () => {
    // Several forests on one class ⇒ one sub-accordion EACH (separate root sets).
    expect(classNodeSource).toMatch(/\{#if node\.forests\.length === 1\}/);
  });

  it("renders classes RECURSIVELY (no 2-level cap)", () => {
    expect(classNodeSource).toMatch(/import Self from "\.\/OntologyClassNode\.svelte"/);
    expect(classNodeSource).toMatch(
      /<Self node=\{sub\} absorbedBy=\{childAbsorbedBy\} depth=\{childDepth\} \{ctx\} \/>/,
    );
    // A class renders its forests, then its child classes, then its own types.
    expect(classNodeSource).toMatch(
      /node\.forests[\s\S]*?\{#if node\.subs\.length\}[\s\S]*?\{#if node\.types\.length\}/,
    );
  });

  it("App threads the sidecar + subtree-select handler to the rail", () => {
    expect(appSource).toMatch(/\{sceneHierarchies\}/);
    expect(appSource).toMatch(/onToggleHierarchySubtree=\{handleToggleHierarchySubtree\}/);
    expect(appSource).toMatch(/fetchSceneHierarchies/);
    expect(appSource).toMatch(/toggleEntitySet/);
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

/* --- the RENDERED row: the eye is there, at every depth ------------------ */
const treeNodeSource = readFileSync(
  resolve(process.cwd(), "src/components/HierarchyTreeNode.svelte"),
  "utf8",
);

/** Drop JS/CSS block comments + HTML comments so prose never fakes a code lock. */
function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the tree ROW carries the same affordances as a class row", () => {
  it("renders the 4-state visibility control keyed by its hierarchy key", () => {
    expect(treeNodeSource).toMatch(/import EntityStateControl from "\.\/EntityStateControl\.svelte"/);
    expect(treeNodeSource).toMatch(/<EntityStateControl/);
    expect(treeNodeSource).toMatch(/groupKeyForHierarchy\(String\(forestKey\), String\(nodeId\)\)/);
    expect(treeNodeSource).toMatch(/state=\{ctx\.entityStateOf\(key\)\}/);
    expect(treeNodeSource).toMatch(/onSetState=\{ctx\.onSetEntityState\}/);
  });

  it("keeps the subtree SELECTION affordance next to the new control", () => {
    expect(treeNodeSource).toMatch(/onSelectSubtree\(nodeId\)/);
  });

  it("absorbs a row under a GROUPED ancestor, exactly like a class row", () => {
    expect(treeNodeSource).toMatch(/childAbsorbedBy = \$derived\(absorbedBy \?\? \(grouped \? label : null\)\)/);
    expect(treeNodeSource).toMatch(/disabled=\{absorbedBy != null\}/);
  });

  it("is handed the forest key + the rail context by the class that splices it", () => {
    expect(classNodeSource).toMatch(/forestKey=\{forest\.key\}/);
    expect(classNodeSource).toMatch(/absorbedBy=\{childAbsorbedBy\}/);
  });

  it("indents ADAPTIVELY from the shared ladder, never from a hardcoded step", () => {
    expect(treeNodeSource).toMatch(/import \{ indentStepCss \} from "\.\.\/lib\/railIndent\.js"/);
    expect(treeNodeSource).toMatch(/indentStepCss\(depth\)/);
    expect(treeNodeSource).toMatch(/depth=\{depth \+ 1\}/);
    // The step is applied inline; no fixed padding survives in the stylesheet.
    expect(treeNodeSource).toMatch(/style=\{`padding-left: \$\{childIndent\}`\}/);
    expect(stripComments(treeNodeSource)).not.toMatch(
      /\.rail-hier-children\s*\{[^}]*padding-left\s*:/,
    );
    expect(stripComments(classNodeSource)).not.toMatch(
      /ul\.rail-hier-root\s*\{[^}]*padding\s*:\s*0\s+0\s+0\s+[\d.]/,
    );
  });

  it("stays generic — no repo, forest or process code is hardcoded in studio core", () => {
    // Prose may name ABP/PROCESS_STD as the motivating example; the CODE may not.
    for (const source of [treeNodeSource, classNodeSource]) {
      const code = stripComments(source);
      expect(code).not.toMatch(/\bABP\b/);
      expect(code).not.toMatch(/\bPROCESS_STD\b/);
      expect(code).not.toMatch(/abp_process_tree|process_std_process_tree/);
    }
  });
});
