import { describe, expect, it } from "vitest";

import {
  injectOntologyClassNodes,
  applyOntologyCollapse,
  applyGroupCollapse,
  buildClassParentIndex,
  buildCommunityParentIndex,
  injectCommunityNodes,
  communityNodeId,
  mintCommunityNodeIds,
  nearestVisibleAncestor,
  readFoldAnchors,
} from "../lib/classNodes.js";
import { buildScene, computeDegrees, computeGodClass } from "../lib/graphAdapter.js";

// A small graph: two Characters (one is a clear hub), a Location, and a few
// edges. Mirrors the mystery-pack shape (node `type`, link `relation`).
function baseGraph() {
  return {
    nodes: [
      { id: "char_holmes", label: "Sherlock Holmes", type: "Character" },
      { id: "char_watson", label: "John Watson", type: "Character" },
      { id: "place_baker", label: "Baker Street", type: "Location" },
    ],
    links: [
      { source: "char_holmes", target: "char_watson", relation: "assists" },
      { source: "char_holmes", target: "place_baker", relation: "located_in" },
      { source: "char_watson", target: "place_baker", relation: "located_in" },
    ],
  };
}

// A class-hierarchies.json artifact (graphify_ontology_class_hierarchies_v1):
// Agent -> { Character (leaf, members), Location-as-leaf }. The "char_ghost"
// member is ABSENT from the graph — its has_instance edge must NOT be drawn.
function classHierarchies() {
  return {
    schema: "graphify_ontology_class_hierarchies_v1",
    generated_at: "2026-06-19T00:00:00.000Z",
    hierarchies: {
      mystery: {
        relation_type: "subclass_of",
        membership_relation_type: "has_instance",
        root_class_ids: ["class:Agent"],
        max_depth: 1,
        classes_by_id: {
          "class:Agent": {
            id: "class:Agent",
            label: "Agent",
            parent_id: null,
            child_ids: ["class:Character"],
            level: 0,
            member_node_types: [],
            member_ids: [],
            source: "profile",
            status: "reference",
          },
          "class:Character": {
            id: "class:Character",
            label: "Character",
            parent_id: "class:Agent",
            child_ids: [],
            level: 1,
            member_node_types: ["Character"],
            member_ids: ["char_holmes", "char_watson", "char_ghost"],
            source: "profile",
            status: "reference",
          },
          "class:Location": {
            id: "class:Location",
            label: "Location",
            parent_id: null,
            child_ids: [],
            level: 0,
            member_node_types: ["Location"],
            member_ids: ["place_baker"],
            source: "profile",
            status: "reference",
          },
        },
      },
    },
  };
}

describe("injectOntologyClassNodes — leaf mode (default)", () => {
  it("adds leaf class nodes + has_instance edges to PRESENT members only", () => {
    const graph = baseGraph();
    const out = injectOntologyClassNodes(graph, classHierarchies());

    // Original nodes/links are preserved, and a NEW graph is returned.
    expect(out).not.toBe(graph);
    expect(out.nodes).toHaveLength(3 + 2); // + class:Character, class:Location
    // Inner class:Agent (no member_node_types) is NOT injected in leaf mode.
    const ids = out.nodes.map((n) => n.id);
    expect(ids).toContain("class:Character");
    expect(ids).toContain("class:Location");
    expect(ids).not.toContain("class:Agent");

    const classNode = out.nodes.find((n) => n.id === "class:Character");
    expect(classNode).toMatchObject({
      id: "class:Character",
      label: "Character",
      type: "OntologyClass",
      ontology_node_kind: "class",
      ontology_class_id: "Character",
      level: 1,
    });

    // has_instance edges target ONLY members present in the graph (char_ghost
    // is absent and gets no edge); they are flagged structural + membership.
    const memberEdges = out.links.filter((e) => e.relation === "has_instance");
    expect(memberEdges).toHaveLength(3); // holmes, watson (Character) + baker (Location)
    for (const e of memberEdges) {
      expect(e.structural).toBe(true);
      expect(e.ontology_edge_kind).toBe("membership");
    }
    const charMembers = memberEdges
      .filter((e) => e.source === "class:Character")
      .map((e) => e.target)
      .sort();
    expect(charMembers).toEqual(["char_holmes", "char_watson"]);
    expect(memberEdges.some((e) => e.target === "char_ghost")).toBe(false);

    // Leaf mode draws NO inter-class subclass_of edges.
    expect(out.links.some((e) => e.relation === "subclass_of")).toBe(false);
  });

  it("never mutates the input graph", () => {
    const graph = baseGraph();
    injectOntologyClassNodes(graph, classHierarchies());
    expect(graph.nodes).toHaveLength(3);
    expect(graph.links).toHaveLength(3);
  });
});

describe("injectOntologyClassNodes — all mode", () => {
  it("injects EVERY class + subclass_of edges between them", () => {
    const graph = baseGraph();
    const out = injectOntologyClassNodes(graph, classHierarchies(), { levels: "all" });

    const ids = out.nodes.map((n) => n.id);
    // Inner class:Agent is now injected too.
    expect(ids).toContain("class:Agent");
    expect(ids).toContain("class:Character");
    expect(ids).toContain("class:Location");

    // subclass_of: parent -> child (Agent -> Character), flagged structural.
    const subclassEdges = out.links.filter((e) => e.relation === "subclass_of");
    expect(subclassEdges).toHaveLength(1);
    expect(subclassEdges[0]).toMatchObject({
      source: "class:Agent",
      target: "class:Character",
      structural: true,
      ontology_edge_kind: "subclass",
    });

    // Member edges still only point at present entities.
    const memberEdges = out.links.filter((e) => e.relation === "has_instance");
    expect(memberEdges).toHaveLength(3);
  });
});

describe("injectOntologyClassNodes — absent / empty artifact", () => {
  it("returns the graph UNCHANGED for null / empty hierarchies", () => {
    const graph = baseGraph();
    expect(injectOntologyClassNodes(graph, null)).toBe(graph);
    expect(injectOntologyClassNodes(graph, {})).toBe(graph);
    expect(injectOntologyClassNodes(graph, { hierarchies: {} })).toBe(graph);
  });
});

describe("injectOntologyClassNodes — idempotency / dedup", () => {
  it("re-injecting over an already-injected graph is a no-op", () => {
    const graph = baseGraph();
    const once = injectOntologyClassNodes(graph, classHierarchies());
    const twice = injectOntologyClassNodes(once, classHierarchies());
    // No duplicate class nodes nor duplicate has_instance edges.
    expect(twice.nodes).toHaveLength(once.nodes.length);
    expect(twice.links).toHaveLength(once.links.length);
    // Nothing new was added, so the same graph object is returned.
    expect(twice).toBe(once);
  });
});

describe("synthetic structural edges do not change the god-class election", () => {
  it("god-class + degrees are identical with and without injected class nodes", () => {
    const graph = baseGraph();
    const injected = injectOntologyClassNodes(graph, classHierarchies());

    // Degrees over the entity nodes are unchanged: structural has_instance edges
    // are excluded from the degree count.
    const baseDeg = computeDegrees(graph.nodes, graph.links);
    const injDeg = computeDegrees(injected.nodes, injected.links);
    for (const node of graph.nodes) {
      expect(injDeg.get(node.id)).toBe(baseDeg.get(node.id));
    }
    // Class nodes themselves sit at the degree floor (0) — structural-only.
    expect(injDeg.get("class:Character")).toBe(0);
    expect(injDeg.get("class:Location")).toBe(0);

    // The god-class election (Character bucket) is identical.
    const baseMax = Math.max(...baseDeg.values());
    const injMax = Math.max(...injDeg.values());
    expect(computeGodClass(injected.nodes, injDeg, injMax)).toBe(
      computeGodClass(graph.nodes, baseDeg, baseMax),
    );
    expect(computeGodClass(injected.nodes, injDeg, injMax)).toBe("Character");
  });

  it("buildScene renders class nodes as roundedbox without disturbing entity boxes", () => {
    const graph = baseGraph();
    const injected = injectOntologyClassNodes(graph, classHierarchies());

    const baseScene = buildScene(graph, { showWeakLinks: true });
    const injScene = buildScene(injected, { showWeakLinks: true });

    // The god-class hub (most-connected Character) is the same box in both.
    const baseHolmes = baseScene.nodes.find((n) => n.id === "char_holmes");
    const injHolmes = injScene.nodes.find((n) => n.id === "char_holmes");
    expect(injHolmes.shape).toBe(baseHolmes.shape);

    // Class nodes are labelled rounded boxes carrying their passthrough fields.
    const classNode = injScene.nodes.find((n) => n.id === "class:Character");
    expect(classNode.shape).toBe("roundedbox");
    expect(classNode.type).toBe("OntologyClass");
    expect(classNode.ontology_node_kind).toBe("class");
    expect(classNode.ontology_class_id).toBe("Character");

    // The membership edge carries the dotted dash + passthrough kind.
    const memberEdge = injScene.edges.find(
      (e) => e.relation === "has_instance" && e.source === "class:Character",
    );
    expect(memberEdge.dash).toBe("dotted");
    expect(memberEdge.structural).toBe(true);
    expect(memberEdge.ontology_edge_kind).toBe("membership");
  });
});

/* ===========================================================================
 * EVOL 2.b + 2.d — applyOntologyCollapse (category collapse + link inheritance)
 *
 * A two-level taxonomy:
 *   class:Agent (root)
 *     └─ class:Person (intermediate)
 *          ├─ class:Character (leaf) : holmes, watson
 *          └─ class:Villain   (leaf) : moriarty
 *   class:Place (root, leaf)         : baker
 *
 * Entity edges (the displayed topology, NOT the synthetic class edges):
 *   holmes --assists--> watson        (intra-Character)
 *   holmes --pursues--> moriarty      (Character -> Villain, cross-leaf)
 *   watson --pursues--> moriarty      (Character -> Villain, parallel after fold)
 *   holmes --located_in--> baker      (Person -> Place)
 *   moriarty --located_in--> baker    (Villain -> Place)
 * ======================================================================== */
function taxonomyGraph() {
  return {
    nodes: [
      { id: "holmes", label: "Holmes", type: "Character" },
      { id: "watson", label: "Watson", type: "Character" },
      { id: "moriarty", label: "Moriarty", type: "Villain" },
      { id: "baker", label: "Baker Street", type: "Location" },
    ],
    links: [
      { source: "holmes", target: "watson", relation: "assists", evidence_refs: ["e1"] },
      { source: "holmes", target: "moriarty", relation: "pursues", evidence_refs: ["e2"] },
      { source: "watson", target: "moriarty", relation: "pursues", evidence_refs: ["e3"] },
      { source: "holmes", target: "baker", relation: "located_in", evidence_refs: ["e4"] },
      { source: "moriarty", target: "baker", relation: "located_in", evidence_refs: ["e5"] },
    ],
  };
}

function taxonomyHierarchies() {
  return {
    schema: "graphify_ontology_class_hierarchies_v1",
    hierarchies: {
      mystery: {
        relation_type: "subclass_of",
        membership_relation_type: "has_instance",
        root_class_ids: ["class:Agent", "class:Place"],
        max_depth: 2,
        classes_by_id: {
          "class:Agent": {
            id: "class:Agent",
            label: "Agent",
            parent_id: null,
            child_ids: ["class:Person"],
            level: 0,
            member_node_types: [],
            member_ids: [],
          },
          "class:Person": {
            id: "class:Person",
            label: "Person",
            parent_id: "class:Agent",
            child_ids: ["class:Character", "class:Villain"],
            level: 1,
            member_node_types: [],
            member_ids: [],
          },
          "class:Character": {
            id: "class:Character",
            label: "Character",
            parent_id: "class:Person",
            child_ids: [],
            level: 2,
            member_node_types: ["Character"],
            member_ids: ["holmes", "watson"],
          },
          "class:Villain": {
            id: "class:Villain",
            label: "Villain",
            parent_id: "class:Person",
            child_ids: [],
            level: 2,
            member_node_types: ["Villain"],
            member_ids: ["moriarty"],
          },
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
}

// The injected ("all" levels) graph that collapse actually runs on.
function injectedTaxonomyGraph() {
  return injectOntologyClassNodes(taxonomyGraph(), taxonomyHierarchies(), { levels: "all" });
}

describe("buildClassParentIndex", () => {
  it("indexes class parents AND entity->leaf-class, plus class descendants", () => {
    const { parentById, classIdByMemberId, descendantClassIds } =
      buildClassParentIndex(taxonomyHierarchies());

    // Class parent chain.
    expect(parentById.get("class:Agent")).toBe(null);
    expect(parentById.get("class:Person")).toBe("class:Agent");
    expect(parentById.get("class:Character")).toBe("class:Person");

    // Entity -> its leaf class (both legs: parentById and classIdByMemberId).
    expect(parentById.get("holmes")).toBe("class:Character");
    expect(parentById.get("moriarty")).toBe("class:Villain");
    expect(classIdByMemberId.get("holmes")).toBe("class:Character");
    expect(classIdByMemberId.get("baker")).toBe("class:Place");

    // Transitive class descendants.
    expect([...descendantClassIds.get("class:Agent")].sort()).toEqual([
      "class:Character",
      "class:Person",
      "class:Villain",
    ]);
    expect([...descendantClassIds.get("class:Character")]).toEqual([]);
  });
});

describe("nearestVisibleAncestor", () => {
  it("returns the id itself when visible", () => {
    const { parentById } = buildClassParentIndex(taxonomyHierarchies());
    const visible = new Set(["holmes", "class:Character"]);
    expect(nearestVisibleAncestor("holmes", visible, parentById)).toBe("holmes");
  });

  it("walks up to the nearest visible ancestor when the id is hidden", () => {
    const { parentById } = buildClassParentIndex(taxonomyHierarchies());
    // Character + entities hidden; Person visible -> holmes resolves to Person.
    const visible = new Set(["class:Person", "class:Agent"]);
    expect(nearestVisibleAncestor("holmes", visible, parentById)).toBe("class:Person");
  });

  it("returns null when nothing in the chain is visible", () => {
    const { parentById } = buildClassParentIndex(taxonomyHierarchies());
    expect(nearestVisibleAncestor("holmes", new Set(), parentById)).toBe(null);
  });
});

describe("applyOntologyCollapse — empty set", () => {
  it("returns the graph unchanged when nothing is collapsed", () => {
    const g = injectedTaxonomyGraph();
    expect(applyOntologyCollapse(g, taxonomyHierarchies(), { collapsedClassIds: [] })).toBe(g);
    expect(applyOntologyCollapse(g, taxonomyHierarchies())).toBe(g);
  });
});

describe("applyOntologyCollapse — leaf class", () => {
  it("folds member entities into the leaf class, rerouting external edges", () => {
    const g = injectedTaxonomyGraph();
    const out = applyOntologyCollapse(g, taxonomyHierarchies(), {
      collapsedClassIds: ["class:Character"],
    });

    // holmes + watson are hidden; the class node stays.
    const ids = out.nodes.map((n) => n.id);
    expect(ids).not.toContain("holmes");
    expect(ids).not.toContain("watson");
    expect(ids).toContain("class:Character");
    expect(ids).toContain("moriarty");
    expect(ids).toContain("baker");

    const cls = out.nodes.find((n) => n.id === "class:Character");
    expect(cls.collapsed).toBe(true);
    expect(cls.hidden_node_count).toBe(2); // holmes + watson
    // Edges that became self-loops inside Character: the real assists edge
    // (holmes->watson) PLUS the two synthetic has_instance edges
    // (class:Character->holmes / ->watson) injected at "all" levels -> 3 total.
    expect(cls.internal_edge_count).toBe(3);
    // Visual cue: the label carries the folded count.
    expect(cls.label).toBe("Character (+2)");

    // holmes/watson --pursues--> moriarty both reroute to class:Character and
    // AGGREGATE into one edge (count 2, evidence unioned). The has_instance
    // structural edges to holmes/watson also became self-loops and dropped.
    const pursues = out.links.filter((e) => e.relation === "pursues");
    expect(pursues).toHaveLength(1);
    expect(pursues[0].source).toBe("class:Character");
    expect(pursues[0].target).toBe("moriarty");
    expect(pursues[0].aggregate_count).toBe(2);
    expect(pursues[0].evidence_refs).toEqual(["e2", "e3"]);
    // Aggregated entity edges are NOT structural (they came from real edges).
    expect(pursues[0].structural).toBeUndefined();

    // holmes --located_in--> baker reroutes to class:Character (single edge).
    const located = out.links.filter((e) => e.relation === "located_in");
    expect(located.some((e) => e.source === "class:Character" && e.target === "baker")).toBe(
      true,
    );
    // moriarty --located_in--> baker is untouched (moriarty still visible).
    expect(located.some((e) => e.source === "moriarty" && e.target === "baker")).toBe(true);

    // No self-loops survive.
    expect(out.links.every((e) => e.source !== e.target)).toBe(true);
  });
});

describe("applyOntologyCollapse — intermediate super-class (2.d multi-level)", () => {
  it("folds the WHOLE subtree into the collapsed intermediate class", () => {
    const g = injectedTaxonomyGraph();
    const out = applyOntologyCollapse(g, taxonomyHierarchies(), {
      collapsedClassIds: ["class:Person"],
    });

    const ids = out.nodes.map((n) => n.id);
    // The entire Person subtree (Character, Villain, holmes, watson, moriarty) folds.
    for (const hidden of ["holmes", "watson", "moriarty", "class:Character", "class:Villain"]) {
      expect(ids).not.toContain(hidden);
    }
    expect(ids).toContain("class:Person");
    expect(ids).toContain("class:Agent"); // ancestor stays visible
    expect(ids).toContain("baker");

    const person = out.nodes.find((n) => n.id === "class:Person");
    expect(person.collapsed).toBe(true);
    // 5 hidden: 2 sub-classes + 3 entities.
    expect(person.hidden_node_count).toBe(5);

    // assists + both pursues become internal self-loops (3 entity edges) PLUS the
    // synthetic has_instance / subclass_of edges that now self-loop within Person.
    expect(person.internal_edge_count).toBeGreaterThanOrEqual(3);

    // holmes/moriarty --located_in--> baker BOTH reroute to class:Person and
    // aggregate into a single Person->baker edge (count 2).
    const located = out.links.filter((e) => e.relation === "located_in");
    expect(located).toHaveLength(1);
    expect(located[0]).toMatchObject({ source: "class:Person", target: "baker" });
    expect(located[0].aggregate_count).toBe(2);
    expect(located[0].evidence_refs).toEqual(["e4", "e5"]);

    // No pursues/assists edges survive (all folded internally).
    expect(out.links.some((e) => e.relation === "pursues")).toBe(false);
    expect(out.links.some((e) => e.relation === "assists")).toBe(false);
  });

  it("renders an external edge at the nearest VISIBLE level when an inner class is NOT collapsed", () => {
    // Collapse only Villain. Character stays expanded, so the Character->Villain
    // edges reroute to class:Villain but keep holmes/watson as the source (their
    // nearest visible ancestor is themselves).
    const g = injectedTaxonomyGraph();
    const out = applyOntologyCollapse(g, taxonomyHierarchies(), {
      collapsedClassIds: ["class:Villain"],
    });

    const ids = out.nodes.map((n) => n.id);
    expect(ids).not.toContain("moriarty");
    expect(ids).toContain("class:Villain");
    expect(ids).toContain("holmes"); // Character not collapsed -> entity stays
    expect(ids).toContain("watson");

    // holmes/watson --pursues--> moriarty reroute target to class:Villain but
    // keep distinct sources (holmes, watson) -> two separate edges, not aggregated.
    const pursues = out.links.filter((e) => e.relation === "pursues");
    expect(pursues).toHaveLength(2);
    expect(pursues.map((e) => e.source).sort()).toEqual(["holmes", "watson"]);
    expect(pursues.every((e) => e.target === "class:Villain")).toBe(true);
  });
});

describe("applyOntologyCollapse — expand restores + determinism", () => {
  it("collapsing then removing the class from the set restores the original topology", () => {
    const g = injectedTaxonomyGraph();
    const collapsed = applyOntologyCollapse(g, taxonomyHierarchies(), {
      collapsedClassIds: ["class:Character"],
    });
    expect(collapsed.nodes.length).toBeLessThan(g.nodes.length);

    // Removing it from the set (empty) yields the injected graph unchanged.
    const restored = applyOntologyCollapse(g, taxonomyHierarchies(), { collapsedClassIds: [] });
    expect(restored).toBe(g);
  });

  it("is deterministic — same input yields identical output", () => {
    const a = applyOntologyCollapse(injectedTaxonomyGraph(), taxonomyHierarchies(), {
      collapsedClassIds: ["class:Person"],
    });
    const b = applyOntologyCollapse(injectedTaxonomyGraph(), taxonomyHierarchies(), {
      collapsedClassIds: ["class:Person"],
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("never mutates the input graph", () => {
    const g = injectedTaxonomyGraph();
    const beforeNodes = g.nodes.length;
    const beforeLinks = g.links.length;
    applyOntologyCollapse(g, taxonomyHierarchies(), { collapsedClassIds: ["class:Person"] });
    expect(g.nodes.length).toBe(beforeNodes);
    expect(g.links.length).toBe(beforeLinks);
    // The class node was not stamped with collapsed:true on the source graph.
    expect(g.nodes.find((n) => n.id === "class:Person").collapsed).toBeUndefined();
  });
});

/* ===========================================================================
 * B2 — applyGroupCollapse + community axis (T2, T4, T5, T8, T9, T10).
 * ======================================================================== */

describe("B2 — T2 fine sub-domain fold (mixed-depth, sibling stays expanded)", () => {
  it("folds ONE sub-class subtree while its sibling sub-class stays expanded", () => {
    const g = injectedTaxonomyGraph();
    // Fold only class:Character (one leaf under Person); class:Villain sibling stays.
    const out = applyOntologyCollapse(g, taxonomyHierarchies(), {
      collapsedClassIds: ["class:Character"],
    });
    const ids = out.nodes.map((n) => n.id);
    // Character members folded...
    expect(ids).not.toContain("holmes");
    expect(ids).not.toContain("watson");
    expect(ids).toContain("class:Character");
    // ...but the SIBLING sub-domain (Villain / moriarty) is untouched/expanded:
    // both the sibling class node AND its member entity stay visible.
    expect(ids).toContain("moriarty");
    expect(ids).toContain("class:Villain");
  });
});

describe("B2 — applyGroupCollapse empty set (T8 engine fast-path)", () => {
  it("returns the input graph unchanged when there is nothing to collapse", () => {
    const g = injectedTaxonomyGraph();
    expect(applyGroupCollapse(g, { collapseTargets: [] })).toBe(g);
    expect(applyGroupCollapse(g, {})).toBe(g);
  });
});

// A graph whose communities map cleanly: { holmes, watson } in "People",
// { moriarty } in "Villains"; baker is community-less. Edges mirror the
// taxonomy graph so the community fold is comparable to a single-level ontology
// fold of the SAME partition.
function communityGraph() {
  return {
    nodes: [
      { id: "holmes", label: "Holmes", type: "Character", community_name: "People" },
      { id: "watson", label: "Watson", type: "Character", community_name: "People" },
      { id: "moriarty", label: "Moriarty", type: "Villain", community_name: "Villains" },
      { id: "baker", label: "Baker Street", type: "Location" },
    ],
    links: [
      { source: "holmes", target: "watson", relation: "assists", evidence_refs: ["e1"] },
      { source: "holmes", target: "moriarty", relation: "pursues", evidence_refs: ["e2"] },
      { source: "watson", target: "moriarty", relation: "pursues", evidence_refs: ["e3"] },
      { source: "holmes", target: "baker", relation: "located_in", evidence_refs: ["e4"] },
      { source: "moriarty", target: "baker", relation: "located_in", evidence_refs: ["e5"] },
    ],
  };
}

const communityOf = (n) => n.community_name ?? null;

describe("communityNodeId + mintCommunityNodeIds (A2 helper)", () => {
  it("mints namespaced ids and disambiguates a collision deterministically", () => {
    expect(communityNodeId("People")).toBe("community-node:People");
    // A real node already owns the naive id -> the mint must NOT reuse it.
    const existing = new Set(["community-node:People", "watson"]);
    const ids = mintCommunityNodeIds(["People", "Villains"], existing);
    expect(ids.get("People")).not.toBe("community-node:People");
    expect(ids.get("People")).toBe("community-node:People#1");
    expect(ids.get("Villains")).toBe("community-node:Villains");
    // No minted id collides with an existing id.
    for (const id of ids.values()) expect(existing.has(id)).toBe(false);
  });
});

describe("B2 — injectCommunityNodes (synthetic nodes + has_member edges)", () => {
  it("injects one node per LIVE key carrying kind + community_key + tone", () => {
    const g = communityGraph();
    const out = injectCommunityNodes(g, {
      communityOf,
      liveKeys: ["People", "Villains"],
      toneKeyOf: (k) => k,
    });
    const peopleId = out.idByKey.get("People");
    const node = out.nodes.find((n) => n.id === peopleId);
    expect(node).toMatchObject({
      community_node_kind: "community",
      community_key: "People",
      type: "OntologyCommunity",
    });
    // has_member edges: community node -> each live member present in the graph.
    const memberEdges = out.links.filter((e) => e.relation === "has_member");
    expect(memberEdges).toHaveLength(3); // holmes, watson (People) + moriarty (Villains)
    expect(memberEdges.every((e) => e.structural === true)).toBe(true);
    // baker (community-less) gets NO has_member edge.
    expect(memberEdges.some((e) => e.target === "baker")).toBe(false);
  });
});

describe("B2 — T4 community/ontology collapse PARITY (shared engine)", () => {
  it("a community fold matches the same partition expressed as a 1-level ontology fold", () => {
    // --- Community fold of "People" via the community index + engine. ---
    const cg = communityGraph();
    const ctx = { communityOf, liveKeys: ["People", "Villains"], toneKeyOf: (k) => k };
    const injectedC = injectCommunityNodes(cg, ctx);
    const { parentById, descendantsByTarget, collapseTargetByKey, idByKey } =
      buildCommunityParentIndex(cg, { ...ctx, idByKey: injectedC.idByKey });
    const peopleId = idByKey.get("People");
    const communityOut = applyGroupCollapse(injectedC, {
      parentById,
      collapseTargets: [collapseTargetByKey("People")],
      descendantsByTarget,
    });

    // --- Equivalent SINGLE-LEVEL ontology fold: one class "People" holding
    //     holmes+watson, one class "Villains" holding moriarty, baker free. ---
    const og = communityGraph(); // same edges; community_name fields are ignored by ontology
    const flatHierarchies = {
      schema: "graphify_ontology_class_hierarchies_v1",
      hierarchies: {
        flat: {
          root_class_ids: [peopleId, idByKey.get("Villains")],
          classes_by_id: {
            [peopleId]: {
              id: peopleId, label: "People", parent_id: null, child_ids: [], level: 0,
              member_node_types: ["Character"], member_ids: ["holmes", "watson"],
            },
            [idByKey.get("Villains")]: {
              id: idByKey.get("Villains"), label: "Villains", parent_id: null, child_ids: [], level: 0,
              member_node_types: ["Villain"], member_ids: ["moriarty"],
            },
          },
        },
      },
    };
    const injectedO = injectOntologyClassNodes(og, flatHierarchies, { levels: "all" });
    const { parentById: pOnt, descendantClassIds } = buildClassParentIndex(flatHierarchies);
    const ontologyOut = applyGroupCollapse(injectedO, {
      parentById: pOnt,
      collapseTargets: [peopleId],
      descendantsByTarget: descendantClassIds,
    });

    // The re-endpointed REAL TOPOLOGY (source|target|relation, aggregate counts)
    // is identical — proving the engine is shared, not forked. The structural
    // membership edges differ only in label (has_member vs has_instance, an
    // injection detail), so compare the non-structural data edges.
    const topo = (out) =>
      out.links
        .filter((e) => !e.structural)
        .map((e) => `${e.source}|${e.target}|${e.relation}|${e.aggregate_count ?? 1}`)
        .sort();
    expect(topo(communityOut)).toEqual(topo(ontologyOut));

    // Same fold-node annotations: People holds 2 hidden + the (+2) label.
    const cPeople = communityOut.nodes.find((n) => n.id === peopleId);
    const oPeople = ontologyOut.nodes.find((n) => n.id === peopleId);
    expect(cPeople.hidden_node_count).toBe(2);
    expect(oPeople.hidden_node_count).toBe(2);
    expect(cPeople.label).toBe(oPeople.label);
  });
});

describe("B2 — T5 link-bubbling invariant (community axis)", () => {
  it("aggregates parallels, drops self-loops, unions evidence, deterministic order", () => {
    const cg = communityGraph();
    const ctx = { communityOf, liveKeys: ["People", "Villains"], toneKeyOf: (k) => k };
    const injected = injectCommunityNodes(cg, ctx);
    const { parentById, descendantsByTarget, collapseTargetByKey, idByKey } =
      buildCommunityParentIndex(cg, { ...ctx, idByKey: injected.idByKey });
    const peopleId = idByKey.get("People");
    const out = applyGroupCollapse(injected, {
      parentById,
      collapseTargets: [collapseTargetByKey("People")],
      descendantsByTarget,
    });

    // holmes/watson --pursues--> moriarty AGGREGATE into one People->moriarty edge.
    const pursues = out.links.filter((e) => e.relation === "pursues");
    expect(pursues).toHaveLength(1);
    expect(pursues[0]).toMatchObject({ source: peopleId, target: "moriarty", aggregate_count: 2 });
    expect(pursues[0].evidence_refs).toEqual(["e2", "e3"]);

    // holmes--assists-->watson became an internal self-loop (both fold to People).
    expect(out.links.some((e) => e.relation === "assists")).toBe(false);
    const people = out.nodes.find((n) => n.id === peopleId);
    // assists (1) + the People->holmes/watson has_member edges (2) self-loop = 3.
    expect(people.internal_edge_count).toBe(3);

    // No self-loops survive; output edge order is deterministic (sorted).
    expect(out.links.every((e) => e.source !== e.target)).toBe(true);
    const keys = out.links.map((e) => `${e.source}|${e.target}|${e.relation}`);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("B2 — T9 A1 live-key guard (no vanish into a missing ancestor)", () => {
  it("a fold key that is NOT live maps no entity, hides nothing", () => {
    const cg = communityGraph();
    // "Villains" is the only LIVE key we inject; a persisted fold of the NON-live
    // "Ghosts" key must hide nothing (its members map to no community node).
    const ctx = { communityOf, liveKeys: ["Villains"], toneKeyOf: (k) => k };
    const injected = injectCommunityNodes(cg, ctx);
    const { parentById, descendantsByTarget, idByKey } = buildCommunityParentIndex(cg, {
      ...ctx,
      idByKey: injected.idByKey,
    });
    // People entities have NO parent in the index (People is not live).
    expect(parentById.has("holmes")).toBe(false);
    expect(parentById.has("watson")).toBe(false);

    // Collapsing a non-existent / non-live target hides nothing — engine no-op
    // (empty collapseTargets) returns the input.
    const out = applyGroupCollapse(injected, {
      parentById,
      collapseTargets: [], // "Ghosts"/"People" produced no synthetic id
      descendantsByTarget,
    });
    expect(out).toBe(injected);
    // holmes/watson remain visible (never vanished via a missing ancestor).
    expect(injected.nodes.some((n) => n.id === "holmes")).toBe(true);
    expect(injected.nodes.some((n) => n.id === "watson")).toBe(true);
  });
});

describe("B2 — T10 id-collision safety (A2, NORMATIVE)", () => {
  it("never mints two nodes with the same id when a real node owns the naive id", () => {
    // A real entity whose id literally equals the naive community-node id.
    const collidingGraph = {
      nodes: [
        { id: "community-node:People", label: "Decoy", type: "Character" },
        { id: "holmes", label: "Holmes", type: "Character", community_name: "People" },
      ],
      links: [{ source: "holmes", target: "community-node:People", relation: "knows" }],
    };
    const ctx = { communityOf, liveKeys: ["People"], toneKeyOf: (k) => k };
    const out = injectCommunityNodes(collidingGraph, ctx);

    // The synthetic id was disambiguated; the real node is untouched.
    const peopleId = out.idByKey.get("People");
    expect(peopleId).not.toBe("community-node:People");
    // No two nodes share an id post-injection.
    const idCounts = new Map();
    for (const n of out.nodes) idCounts.set(n.id, (idCounts.get(n.id) ?? 0) + 1);
    for (const [, count] of idCounts) expect(count).toBe(1);
    // The decoy real node still exists with its original id.
    expect(out.nodes.find((n) => n.id === "community-node:People").label).toBe("Decoy");
  });
});

/* ===========================================================================
 * Collapse/expand ANIMATION — fold-anchor metadata exposure (additive).
 *
 * applyGroupCollapse surfaces, for the studio's collapse/expand tween, each
 * hidden (folded) node id → its group-node ANCHOR (the nearest collapsed
 * ancestor). It is attached NON-ENUMERABLY and read only via readFoldAnchors, so
 * no existing caller/test can observe it.
 * ======================================================================== */
describe("applyGroupCollapse — fold-anchor metadata (readFoldAnchors)", () => {
  it("maps every folded descendant to its nearest collapsed ancestor (multi-level)", () => {
    const g = injectedTaxonomyGraph();
    // Collapse the intermediate class:Person → its whole subtree folds into it:
    // class:Character, class:Villain (sub-classes) + holmes, watson, moriarty.
    const out = applyOntologyCollapse(g, taxonomyHierarchies(), {
      collapsedClassIds: ["class:Person"],
    });
    const anchors = readFoldAnchors(out);
    expect(anchors).toBeInstanceOf(Map);
    // Every hidden node folds into class:Person (the collapse target).
    expect(anchors.get("holmes")).toBe("class:Person");
    expect(anchors.get("watson")).toBe("class:Person");
    expect(anchors.get("moriarty")).toBe("class:Person");
    expect(anchors.get("class:Character")).toBe("class:Person");
    expect(anchors.get("class:Villain")).toBe("class:Person");
    // The target itself is visible, never folded into itself.
    expect(anchors.has("class:Person")).toBe(false);
    // Non-folded nodes (Place subtree) carry no anchor.
    expect(anchors.has("baker")).toBe(false);
    // Deterministic: same input → identical mapping.
    const again = readFoldAnchors(
      applyOntologyCollapse(g, taxonomyHierarchies(), { collapsedClassIds: ["class:Person"] }),
    );
    expect([...again.entries()].sort()).toEqual([...anchors.entries()].sort());
  });

  it("attributes each folded node to the NEAREST collapsed ancestor when nested", () => {
    const g = injectedTaxonomyGraph();
    // Collapse BOTH class:Person and its child class:Character. holmes/watson are
    // under class:Character (nearer) → they fold into Character, not Person.
    const out = applyOntologyCollapse(g, taxonomyHierarchies(), {
      collapsedClassIds: ["class:Person", "class:Character"],
    });
    const anchors = readFoldAnchors(out);
    expect(anchors.get("holmes")).toBe("class:Character");
    expect(anchors.get("watson")).toBe("class:Character");
    // moriarty (under class:Villain, not itself collapsed) folds to Person.
    expect(anchors.get("moriarty")).toBe("class:Person");
  });

  it("is non-enumerable — invisible to spread / Object.keys / toEqual", () => {
    const g = injectedTaxonomyGraph();
    const out = applyOntologyCollapse(g, taxonomyHierarchies(), {
      collapsedClassIds: ["class:Character"],
    });
    // The metadata does not leak into the enumerable graph shape.
    expect(Object.keys(out)).toEqual(["nodes", "links"]);
    const spread = { ...out };
    expect(readFoldAnchors(spread).size).toBe(0);
    // Still readable on the original object.
    expect(readFoldAnchors(out).get("holmes")).toBe("class:Character");
  });

  it("returns an empty map for a graph with no fold metadata (fast path)", () => {
    expect(readFoldAnchors(taxonomyGraph()).size).toBe(0);
    expect(readFoldAnchors(null).size).toBe(0);
    expect(readFoldAnchors(undefined).size).toBe(0);
    // The engine fast-path (nothing collapsed) returns the input unchanged.
    const g = injectedTaxonomyGraph();
    expect(readFoldAnchors(applyGroupCollapse(g, { collapseTargets: [] })).size).toBe(0);
  });
});
