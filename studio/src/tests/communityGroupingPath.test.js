import { describe, expect, it } from "vitest";

import {
  injectCommunityNodes,
  buildCommunityParentIndex,
  injectOntologyClassNodes,
  buildClassParentIndex,
  applyGroupCollapse,
  mintCommunityNodeIds,
} from "../lib/classNodes.js";
import { communityStats, nodeCommunity, buildScene } from "../lib/graphAdapter.js";
import {
  createDefaultViewerState,
  toggleGroupCommunity,
  toggleGroupOntology,
  splitGroupedKeys,
} from "../lib/viewerState.js";

/**
 * B2 — END-TO-END community grouping path (the App `groupedGraph` derivation).
 *
 * The unit tests above drive `injectCommunityNodes` / `buildCommunityParentIndex`
 * / `applyGroupCollapse` with a HAND-WIRED ctx whose `liveKeys` and `communityOf`
 * already agree. This suite instead replicates the REAL App runtime chain
 * (App.svelte `communityCtx` + `groupedGraph`) verbatim against MYSTERY-SHAPED
 * data — every node carries BOTH a numeric `community` AND a string
 * `community_name`, exactly like the public-pack graph.json. It exists to catch a
 * key/id mismatch ANYWHERE along communityStats → mintCommunityNodeIds →
 * injectCommunityNodes → buildCommunityParentIndex.collapseTargetByKey →
 * applyGroupCollapse that the hand-wired unit tests cannot see.
 */

// Mystery-shaped fixture: numeric `community` AND string `community_name` on
// every node, mirroring public-pack graph.json. Two named communities ("Raffles"
// = 4 members, "Hound" = 3 members) plus a community-less Location.
function mysteryGraph() {
  return {
    nodes: [
      { id: "raffles", label: "A.J. Raffles", type: "Character", community: 12, community_name: "Raffles" },
      { id: "bunny", label: "Bunny Manders", type: "Character", community: 12, community_name: "Raffles" },
      { id: "crawshay", label: "Crawshay", type: "Character", community: 12, community_name: "Raffles" },
      { id: "alias_amateur", label: "Amateur Cracksman", type: "Alias", community: 12, community_name: "Raffles" },
      { id: "holmes", label: "Sherlock Holmes", type: "Character", community: 51, community_name: "Hound" },
      { id: "watson", label: "John Watson", type: "Character", community: 51, community_name: "Hound" },
      { id: "baskerville", label: "Henry Baskerville", type: "Character", community: 51, community_name: "Hound" },
      { id: "baker", label: "Baker Street", type: "Location" },
    ],
    links: [
      { source: "raffles", target: "bunny", relation: "assists", evidence_refs: ["e1"] },
      { source: "raffles", target: "crawshay", relation: "opposes", evidence_refs: ["e2"] },
      { source: "alias_amateur", target: "raffles", relation: "alias_of", evidence_refs: ["e3"] },
      { source: "holmes", target: "watson", relation: "assists", evidence_refs: ["e4"] },
      { source: "holmes", target: "baskerville", relation: "assists", evidence_refs: ["e5"] },
      // cross-community + anchor edges so both communities are "live" (degree > 0)
      { source: "raffles", target: "holmes", relation: "mentions", evidence_refs: ["e6"] },
      { source: "holmes", target: "baker", relation: "located_in", evidence_refs: ["e7"] },
      { source: "raffles", target: "baker", relation: "located_in", evidence_refs: ["e8"] },
    ],
  };
}

/**
 * Faithful replica of App.svelte's `communityCtx` $derived. The set fed to the
 * injector/index is the GROUPED ∩ LIVE keys (the root-cause fix): only the
 * communities the user checked get a fold node, so non-grouped live communities
 * never spawn an orphan box.
 */
function buildCommunityCtx(graph, communityKeys) {
  const groupedSet = new Set(communityKeys);
  const live = communityStats(graph).live.filter((c) => groupedSet.has(c.key));
  if (live.length === 0) return null;
  const liveKeys = live.map((c) => c.key);
  const idByKey = mintCommunityNodeIds(liveKeys, new Set((graph?.nodes ?? []).map((n) => n.id)));
  const toneKeyByKey = new Map(live.map((c) => [c.key, c.groupKey ?? c.key]));
  return {
    liveKeys,
    idByKey,
    communityOf: nodeCommunity,
    toneKeyOf: (k) => toneKeyByKey.get(k),
    labelOf: (k) => k,
  };
}

/**
 * Faithful replica of App.svelte's `groupedGraph` $derived (lines ~151-192) for
 * an arbitrary grouped-key set. Returns the COLLAPSED graph the scene is built
 * from.
 */
function groupedGraphFor(graph, classHierarchies, groupedKeys) {
  const { ontologyClassIds, communityKeys } = splitGroupedKeys(groupedKeys);
  const hasOntologyGroup = ontologyClassIds.length > 0;
  const hasCommunityGroup = communityKeys.length > 0;
  if (!hasOntologyGroup && !hasCommunityGroup) return graph;

  let injected = graph;
  const parentById = new Map();
  const descendantsByTarget = new Map();
  const collapseTargets = [];

  if (hasOntologyGroup && classHierarchies?.hierarchies) {
    injected = injectOntologyClassNodes(injected, classHierarchies, { levels: "all" });
    const { parentById: classParents, descendantClassIds } = buildClassParentIndex(classHierarchies);
    for (const [k, v] of classParents) parentById.set(k, v);
    for (const [k, v] of descendantClassIds) descendantsByTarget.set(k, v);
    for (const id of ontologyClassIds) collapseTargets.push(id);
  }

  const communityCtx = hasCommunityGroup ? buildCommunityCtx(graph, communityKeys) : null;
  if (hasCommunityGroup && communityCtx) {
    injected = injectCommunityNodes(injected, communityCtx);
    const {
      parentById: commParents,
      descendantsByTarget: commDesc,
      collapseTargetByKey,
    } = buildCommunityParentIndex(injected, communityCtx);
    for (const [k, v] of commParents) {
      if (!parentById.has(k)) parentById.set(k, v);
    }
    for (const [k, v] of commDesc) descendantsByTarget.set(k, v);
    for (const key of communityKeys) {
      const id = collapseTargetByKey(key);
      if (typeof id === "string") collapseTargets.push(id);
    }
  }

  if (collapseTargets.length === 0) return injected;
  return applyGroupCollapse(injected, { parentById, collapseTargets, descendantsByTarget });
}

describe("B2 — community grouping path (App groupedGraph derivation, mystery-shaped data)", () => {
  it("checking a live community collapses its members into the community fold node", () => {
    const graph = mysteryGraph();

    // The rail row passes `c.key` from communityStats(graph).live to
    // onToggleGroupCommunity — so drive the SAME key the UI would.
    const live = communityStats(graph).live;
    const raffles = live.find((c) => c.key === "Raffles");
    expect(raffles, "Raffles must be a live community").toBeTruthy();
    expect(raffles.count).toBe(4); // raffles, bunny, crawshay, alias_amateur

    let state = createDefaultViewerState();
    state = toggleGroupCommunity(state, raffles.key);

    const out = groupedGraphFor(graph, null, state.options.groupBy.grouped);
    const ids = out.nodes.map((n) => n.id);

    // The community's 4 member entities folded away...
    for (const member of ["raffles", "bunny", "crawshay", "alias_amateur"]) {
      expect(ids, `member ${member} must fold into the community node`).not.toContain(member);
    }
    // ...a community fold node is present in their place...
    const communityNode = out.nodes.find((n) => n.community_node_kind === "community");
    expect(communityNode, "a community fold node must be present").toBeTruthy();
    expect(communityNode.community_key).toBe("Raffles");
    expect(communityNode.collapsed).toBe(true);
    expect(communityNode.hidden_node_count).toBe(4);

    // ...and the OTHER community (Hound) + the free Location stay visible.
    for (const kept of ["holmes", "watson", "baskerville", "baker"]) {
      expect(ids).toContain(kept);
    }

    // Node count DROPS: 8 entities -> 4 visible entities + 1 community node = 5.
    // DIAGNOSTIC: exactly ONE community fold node must survive (the grouped one);
    // a fold node for a NON-grouped live community must never be injected.
    const survivingCommunityNodes = out.nodes.filter((n) => n.community_node_kind === "community");
    expect(survivingCommunityNodes.map((n) => n.community_key)).toEqual(["Raffles"]);
    expect(out.nodes.length).toBe(5);
    expect(out.nodes.length).toBeLessThan(graph.nodes.length);

    // The scene built from the collapsed graph carries the fold node too.
    const scene = buildScene(out, { showWeakLinks: true });
    expect(scene.nodes.some((n) => n.community_node_kind === "community")).toBe(true);
  });

  it("unchecking the community restores the full graph (round-trip)", () => {
    const graph = mysteryGraph();
    let state = createDefaultViewerState();
    state = toggleGroupCommunity(state, "Raffles");
    state = toggleGroupCommunity(state, "Raffles"); // toggle back off
    const out = groupedGraphFor(graph, null, state.options.groupBy.grouped);
    expect(out).toBe(graph); // fast path: nothing grouped
    expect(out.nodes.length).toBe(graph.nodes.length);
  });

  it("multi-select: 2 communities + 1 ontology class collapse together", () => {
    const graph = mysteryGraph();
    // A taxonomy with one ontology class (Location) holding `baker`.
    const classHierarchies = {
      schema: "graphify_ontology_class_hierarchies_v1",
      hierarchies: {
        mystery: {
          root_class_ids: ["class:Place"],
          classes_by_id: {
            "class:Place": {
              id: "class:Place",
              label: "Place",
              parent_id: null,
              child_ids: [],
              level: 0,
              member_node_types: ["Location"],
              member_ids: ["baker"],
            },
          },
        },
      },
    };

    let state = createDefaultViewerState();
    state = toggleGroupCommunity(state, "Raffles");
    state = toggleGroupCommunity(state, "Hound");
    state = toggleGroupOntology(state, "class:Place");

    const out = groupedGraphFor(graph, classHierarchies, state.options.groupBy.grouped);
    const ids = out.nodes.map((n) => n.id);

    // BOTH communities folded: none of their 7 member entities remain.
    for (const member of ["raffles", "bunny", "crawshay", "alias_amateur", "holmes", "watson", "baskerville"]) {
      expect(ids, `${member} must fold`).not.toContain(member);
    }
    // baker folded into class:Place.
    expect(ids).not.toContain("baker");
    expect(ids).toContain("class:Place");

    // Two community fold nodes are present.
    const communityNodes = out.nodes.filter((n) => n.community_node_kind === "community");
    expect(communityNodes).toHaveLength(2);
    const keys = communityNodes.map((n) => n.community_key).sort();
    expect(keys).toEqual(["Hound", "Raffles"]);

    // Final graph: 2 community nodes + 1 ontology class node = 3 visible nodes.
    expect(out.nodes.length).toBe(3);
  });
});
