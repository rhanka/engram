import { describe, expect, it } from "vitest";

import {
  computeDisplayHiddenIds,
  applyVisibilityToScene,
} from "../lib/entityVisibility.js";
import {
  groupKeyForOntology,
  groupKeyForCommunity,
  groupKeyForType,
} from "../lib/viewerState.js";

/* ===========================================================================
 * 4-STATE VISIBILITY — the D1 display mask + the scene filter.
 *
 * D1 (both review passes DISSENT from spec §6.1): Normal ABSTAINS; Hidden = union
 * suppression (a node hides iff ANY owning entity is stored-Hidden); the ≥1-visible
 * whitelist union applies ONLY inside the Solo tier. Hide must NOT be a no-op at
 * mystery scale (every node is also owned by its Normal-by-default type/class).
 * ======================================================================== */

// Entity ids: holmes/watson (Character, Hound), moriarty (Character, Web),
// yard (Organization, Hound), baker (Location, Hound).
function mysteryNodes() {
  return [
    { id: "holmes", type: "Character", community_name: "Hound" },
    { id: "watson", type: "Character", community_name: "Hound" },
    { id: "moriarty", type: "Character", community_name: "Web" },
    { id: "yard", type: "Organization", community_name: "Hound" },
    { id: "baker", type: "Location", community_name: "Hound" },
  ];
}

// Domain class:People → {class:Detective(holmes,watson), class:Villain(moriarty)};
// Domain class:Place → {class:Location(baker)}. yard has no ontology class.
const classHierarchies = {
  hierarchies: {
    h: {
      root_class_ids: ["class:People", "class:Place"],
      classes_by_id: {
        "class:People": { id: "class:People", level: 0, child_ids: ["class:Detective", "class:Villain"] },
        "class:Detective": { id: "class:Detective", level: 1, member_ids: ["holmes", "watson"] },
        "class:Villain": { id: "class:Villain", level: 1, member_ids: ["moriarty"] },
        "class:Place": { id: "class:Place", level: 0, child_ids: ["class:Location"] },
        "class:Location": { id: "class:Location", level: 1, member_ids: ["baker"] },
      },
    },
  },
};

const hidden = (ids) => new Set([...ids].sort());
const asSet = (s) => new Set([...s].sort());

describe("computeDisplayHiddenIds — Hidden tier (union suppression, Normal abstains)", () => {
  it("hiding a TYPE hides EVERY node of that type — even in Normal communities (NOT a no-op)", () => {
    const out = computeDisplayHiddenIds({
      nodes: mysteryNodes(),
      hiddenKeys: [groupKeyForType("Character")],
      soloKeys: [],
      classHierarchies,
    });
    // holmes/watson/moriarty are Characters; their communities are Normal but ABSTAIN.
    expect(asSet(out)).toEqual(hidden(["holmes", "watson", "moriarty"]));
  });

  it("hiding a COMMUNITY hides its members across types", () => {
    const out = computeDisplayHiddenIds({
      nodes: mysteryNodes(),
      hiddenKeys: [groupKeyForCommunity("Hound")],
      soloKeys: [],
      classHierarchies,
    });
    expect(asSet(out)).toEqual(hidden(["holmes", "watson", "yard", "baker"]));
  });

  it("hiding a DOMAIN class hides its whole subtree (ancestor expansion)", () => {
    const out = computeDisplayHiddenIds({
      nodes: mysteryNodes(),
      hiddenKeys: [groupKeyForOntology("class:People")],
      soloKeys: [],
      classHierarchies,
    });
    // Detective (holmes,watson) + Villain (moriarty) fold under People; baker/yard stay.
    expect(asSet(out)).toEqual(hidden(["holmes", "watson", "moriarty"]));
  });

  it("multi-entity CROSS-AXIS hidden keys UNION (any Hidden owner hides)", () => {
    const out = computeDisplayHiddenIds({
      nodes: mysteryNodes(),
      hiddenKeys: [groupKeyForCommunity("Hound"), groupKeyForType("Character")],
      soloKeys: [],
      classHierarchies,
    });
    // Hound {holmes,watson,yard,baker} ∪ Characters {holmes,watson,moriarty} = all.
    expect(asSet(out)).toEqual(hidden(["holmes", "watson", "moriarty", "yard", "baker"]));
  });

  it("an EMPTY override yields an empty mask", () => {
    expect(
      computeDisplayHiddenIds({ nodes: mysteryNodes(), hiddenKeys: [], soloKeys: [], classHierarchies }).size,
    ).toBe(0);
  });
});

describe("computeDisplayHiddenIds — Solo tier (union whitelist, complement hidden)", () => {
  it("solo a TYPE shows only that type, hiding the complement", () => {
    const out = computeDisplayHiddenIds({
      nodes: mysteryNodes(),
      hiddenKeys: [],
      soloKeys: [groupKeyForType("Character")],
      classHierarchies,
    });
    // Visible = Characters; hidden = the complement {yard, baker}.
    expect(asSet(out)).toEqual(hidden(["yard", "baker"]));
  });

  it("MULTI-Solo shows the UNION of the solo entities", () => {
    const out = computeDisplayHiddenIds({
      nodes: mysteryNodes(),
      hiddenKeys: [],
      soloKeys: [groupKeyForCommunity("Web"), groupKeyForType("Organization")],
      classHierarchies,
    });
    // Visible = Web {moriarty} ∪ Organization {yard}; hidden = the rest.
    expect(asSet(out)).toEqual(hidden(["holmes", "watson", "baker"]));
  });

  it("Solo OVERRIDES the entity's OWN stored Hidden (storedHidden \\ solo)", () => {
    const out = computeDisplayHiddenIds({
      nodes: mysteryNodes(),
      hiddenKeys: [groupKeyForCommunity("Hound")],
      soloKeys: [groupKeyForCommunity("Hound")],
      classHierarchies,
    });
    // Hound is both hidden AND solo → effective-hidden = ∅; Hound members are shown.
    expect(asSet(out)).toEqual(hidden(["moriarty"]));
  });

  it("a NON-solo stored Hidden still suppresses INSIDE the Solo whitelist", () => {
    const out = computeDisplayHiddenIds({
      nodes: mysteryNodes(),
      hiddenKeys: [groupKeyForCommunity("Hound")],
      soloKeys: [groupKeyForType("Character")],
      classHierarchies,
    });
    // Solo Characters {holmes,watson,moriarty}, MINUS Hound-suppressed {holmes,watson}
    // ⇒ only moriarty visible; everyone else hidden.
    expect(asSet(out)).toEqual(hidden(["holmes", "watson", "yard", "baker"]));
  });
});

describe("computeDisplayHiddenIds — a group node's visibility FOLLOWS its entity", () => {
  it("masks community / type / class SYNTHETIC nodes via their own predicates (no id parsing)", () => {
    const nodes = [
      ...mysteryNodes(),
      { id: "community-node:Hound", community_node_kind: "community", community_key: "Hound" },
      { id: "type-node:Character", type_node_kind: "type", type_name: "Character" },
      { id: "class:Detective", ontology_node_kind: "class" },
    ];
    // Hiding the community also hides its group node.
    let out = computeDisplayHiddenIds({
      nodes,
      hiddenKeys: [groupKeyForCommunity("Hound")],
      soloKeys: [],
      classHierarchies,
    });
    expect(out.has("community-node:Hound")).toBe(true);
    expect(out.has("type-node:Character")).toBe(false);
    // Hiding the Domain hides its descendant class group node (class:Detective).
    out = computeDisplayHiddenIds({
      nodes,
      hiddenKeys: [groupKeyForOntology("class:People")],
      soloKeys: [],
      classHierarchies,
    });
    expect(out.has("class:Detective")).toBe(true);
    // Hiding the type hides the type group node.
    out = computeDisplayHiddenIds({
      nodes,
      hiddenKeys: [groupKeyForType("Character")],
      soloKeys: [],
      classHierarchies,
    });
    expect(out.has("type-node:Character")).toBe(true);
  });
});

describe("applyVisibilityToScene — scene filter", () => {
  const scene = () => ({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    edges: [
      { source: "a", target: "b" },
      { source: "b", target: "c", weak: true },
    ],
    stats: { nodeCount: 3, edgeCount: 2, weakEdgeCount: 1, communityCount: 2 },
  });

  it("drops hidden nodes + dangling edges and recomputes counts", () => {
    const out = applyVisibilityToScene(scene(), new Set(["b"]));
    expect(out.nodes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(out.edges).toEqual([]); // both edges touched b
    expect(out.stats.nodeCount).toBe(2);
    expect(out.stats.edgeCount).toBe(0);
    expect(out.stats.weakEdgeCount).toBe(0);
    // communityCount is left stable (like applyTimeFilter).
    expect(out.stats.communityCount).toBe(2);
  });

  it("an EMPTY mask returns the SAME scene reference (byte-identity fast path)", () => {
    const s = scene();
    expect(applyVisibilityToScene(s, new Set())).toBe(s);
    expect(applyVisibilityToScene(s, [])).toBe(s);
  });

  it("hide-EVERYTHING yields a graceful empty scene (no crash, no refit)", () => {
    const out = applyVisibilityToScene(scene(), new Set(["a", "b", "c"]));
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
    expect(out.stats.nodeCount).toBe(0);
  });
});
