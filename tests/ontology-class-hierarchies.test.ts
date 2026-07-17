import { describe, expect, it } from "vitest";

import {
  buildClassHierarchies,
  classNodeId,
  CLASS_ID_PREFIX,
  ONTOLOGY_CLASS_HIERARCHIES_SCHEMA,
} from "../src/ontology-class-hierarchies.js";
import type {
  ClassHierarchiesArtifact,
  NormalizedClassHierarchySpec,
} from "../src/types.js";

/** Build a normalized class spec from a terse class map (test ergonomics). */
function spec(
  classes: Record<
    string,
    { parent?: string | null; label?: string | null; member_node_types?: string[] }
  >,
  overrides: Partial<NormalizedClassHierarchySpec> = {},
): NormalizedClassHierarchySpec {
  return {
    relation_type: overrides.relation_type ?? "subclass_of",
    membership_relation_type: overrides.membership_relation_type ?? "has_instance",
    classes: Object.fromEntries(
      Object.entries(classes).map(([name, klass]) => [
        name,
        {
          parent: klass.parent ?? null,
          label: klass.label ?? null,
          member_node_types: klass.member_node_types ?? [],
        },
      ]),
    ),
  };
}

function node(id: string, nodeType: string): { id: string; node_type: string } {
  return { id, node_type: nodeType };
}

/** Strip the only non-deterministic field for full-value comparisons. */
function stable(
  artifact: ClassHierarchiesArtifact,
): Omit<ClassHierarchiesArtifact, "generated_at"> {
  const { generated_at: _generatedAt, ...rest } = artifact;
  return rest;
}

describe("buildClassHierarchies — graphify_ontology_class_hierarchies_v1", () => {
  it("returns the envelope with hierarchies:{} for an empty profile block", () => {
    const artifact = buildClassHierarchies({}, []);
    expect(artifact.schema).toBe(ONTOLOGY_CLASS_HIERARCHIES_SCHEMA);
    expect(artifact.schema).toBe("graphify_ontology_class_hierarchies_v1");
    expect(artifact.hierarchies).toEqual({});
    expect(artifact.graph_hash).toBeNull();
    expect(artifact.profile_hash).toBeNull();
    expect(typeof artifact.generated_at).toBe("string");
  });

  it("stamps graph_hash and profile_hash when provided", () => {
    const artifact = buildClassHierarchies({}, [], {
      graphHash: "g1",
      profileHash: "p1",
    });
    expect(artifact.graph_hash).toBe("g1");
    expect(artifact.profile_hash).toBe("p1");
  });

  it("namespaces class ids under class:<ClassName>", () => {
    expect(classNodeId("Person")).toBe("class:Person");
    expect(CLASS_ID_PREFIX).toBe("class:");
  });

  it("builds a class tree: roots, levels, child_ids, max_depth", () => {
    const block = {
      tax: spec({
        Thing: { parent: null },
        Agent: { parent: "Thing" },
        Person: { parent: "Agent", member_node_types: ["Character"] },
        Place: { parent: "Thing", member_node_types: ["Location"] },
      }),
    };
    const artifact = buildClassHierarchies(block, []);
    const h = artifact.hierarchies["tax"]!;

    expect(h.relation_type).toBe("subclass_of");
    expect(h.membership_relation_type).toBe("has_instance");
    expect(h.root_class_ids).toEqual(["class:Thing"]);
    expect(h.max_depth).toBe(2);
    expect(h.orphan_class_names).toEqual([]);
    expect(h.cycles).toEqual([]);

    expect(h.classes_by_id["class:Thing"]).toMatchObject({
      id: "class:Thing",
      label: "Thing",
      parent_id: null,
      child_ids: ["class:Agent", "class:Place"],
      level: 0,
      source: "profile",
      status: "reference",
    });
    expect(h.classes_by_id["class:Agent"]).toMatchObject({
      parent_id: "class:Thing",
      level: 1,
      child_ids: ["class:Person"],
    });
    expect(h.classes_by_id["class:Person"]).toMatchObject({
      parent_id: "class:Agent",
      level: 2,
      child_ids: [],
      member_node_types: ["Character"],
    });
  });

  it("uses the declared label, defaulting to the class name", () => {
    const block = {
      tax: spec({
        Thing: { parent: null, label: "Root Thing" },
        Person: { parent: "Thing" },
      }),
    };
    const h = buildClassHierarchies(block, []).hierarchies["tax"]!;
    expect(h.classes_by_id["class:Thing"]!.label).toBe("Root Thing");
    expect(h.classes_by_id["class:Person"]!.label).toBe("Person");
  });

  it("attaches entities to leaf classes by node_type, keyed by node id", () => {
    const block = {
      tax: spec({
        Thing: { parent: null },
        Person: { parent: "Thing", member_node_types: ["Character"] },
        Place: { parent: "Thing", member_node_types: ["Location"] },
      }),
    };
    const nodes = [
      node("n_holmes", "Character"),
      node("n_watson", "Character"),
      node("n_bakerst", "Location"),
      node("n_clue", "Evidence"), // unknown node_type → unattached
    ];
    const h = buildClassHierarchies(block, nodes).hierarchies["tax"]!;

    expect(h.classes_by_id["class:Person"]!.member_ids).toEqual([
      "n_holmes",
      "n_watson",
    ]);
    expect(h.classes_by_id["class:Place"]!.member_ids).toEqual(["n_bakerst"]);
    // Inner class gathers no entities directly.
    expect(h.classes_by_id["class:Thing"]!.member_ids).toEqual([]);
    expect(h.unattached_entity_count).toBe(1);
  });

  it("falls back to node.type when node_type is absent", () => {
    const block = {
      tax: spec({
        Person: { parent: null, member_node_types: ["Character"] },
      }),
    };
    const nodes = [{ id: "n1", type: "Character" }];
    const h = buildClassHierarchies(block, nodes).hierarchies["tax"]!;
    expect(h.classes_by_id["class:Person"]!.member_ids).toEqual(["n1"]);
    expect(h.unattached_entity_count).toBe(0);
  });

  it("promotes a class with a missing parent to root and flags it as an orphan", () => {
    const block = {
      tax: spec({
        Person: { parent: "Agent" }, // Agent is not declared
        Place: { parent: null },
      }),
    };
    const h = buildClassHierarchies(block, []).hierarchies["tax"]!;
    expect(h.orphan_class_names).toEqual(["Person"]);
    expect(h.classes_by_id["class:Person"]!.parent_id).toBeNull();
    expect(h.classes_by_id["class:Person"]!.level).toBe(0);
    expect(h.root_class_ids).toEqual(["class:Person", "class:Place"]);
  });

  it("tolerates a parent cycle: detaches the cycle and reports it", () => {
    const block = {
      tax: spec({
        A: { parent: "B" },
        B: { parent: "A" },
        C: { parent: null },
      }),
    };
    const h = buildClassHierarchies(block, []).hierarchies["tax"]!;
    expect(h.cycles.length).toBeGreaterThan(0);
    // Cycle members are detached (no parent, level 0) and excluded from roots.
    expect(h.classes_by_id["class:A"]!.parent_id).toBeNull();
    expect(h.classes_by_id["class:B"]!.parent_id).toBeNull();
    expect(h.root_class_ids).toEqual(["class:C"]);
  });

  it("resolves a node_type claimed by two classes (first by sorted name wins)", () => {
    const block = {
      tax: spec({
        // Beta sorts after Alpha → Alpha keeps Character, Beta is the conflict.
        Alpha: { parent: null, member_node_types: ["Character"] },
        Beta: { parent: null, member_node_types: ["Character"] },
      }),
    };
    const h = buildClassHierarchies(block, [node("n1", "Character")]).hierarchies[
      "tax"
    ]!;
    expect(h.classes_by_id["class:Alpha"]!.member_node_types).toEqual(["Character"]);
    expect(h.classes_by_id["class:Beta"]!.member_node_types).toEqual([]);
    expect(h.classes_by_id["class:Alpha"]!.member_ids).toEqual(["n1"]);
    expect(h.member_node_type_conflicts).toEqual([
      { node_type: "Character", dropped_classes: ["Beta"] },
    ]);
  });

  it("honours custom relation_type / membership_relation_type", () => {
    const block = {
      tax: spec(
        { Thing: { parent: null } },
        { relation_type: "is_a", membership_relation_type: "instance_of" },
      ),
    };
    const h = buildClassHierarchies(block, []).hierarchies["tax"]!;
    expect(h.relation_type).toBe("is_a");
    expect(h.membership_relation_type).toBe("instance_of");
  });

  it("is deterministic regardless of class / node insertion order", () => {
    const blockA = {
      tax: spec({
        Thing: { parent: null },
        Agent: { parent: "Thing" },
        Person: { parent: "Agent", member_node_types: ["Character"] },
        Place: { parent: "Thing", member_node_types: ["Location"] },
      }),
    };
    const blockB = {
      tax: spec({
        Place: { parent: "Thing", member_node_types: ["Location"] },
        Person: { parent: "Agent", member_node_types: ["Character"] },
        Agent: { parent: "Thing" },
        Thing: { parent: null },
      }),
    };
    const nodesA = [node("b", "Character"), node("a", "Character"), node("c", "Location")];
    const nodesB = [node("c", "Location"), node("a", "Character"), node("b", "Character")];

    const a = stable(buildClassHierarchies(blockA, nodesA, { graphHash: "g" }));
    const b = stable(buildClassHierarchies(blockB, nodesB, { graphHash: "g" }));
    expect(a).toEqual(b);
    // member_ids stay sorted regardless of node order.
    expect(
      a.hierarchies["tax"]!.classes_by_id["class:Person"]!.member_ids,
    ).toEqual(["a", "b"]);
  });

  it("compiles multiple hierarchies independently", () => {
    const block = {
      taxA: spec({ Thing: { parent: null }, Person: { parent: "Thing" } }),
      taxB: spec({ Root: { parent: null } }),
    };
    const artifact = buildClassHierarchies(block, []);
    expect(Object.keys(artifact.hierarchies).sort()).toEqual(["taxA", "taxB"]);
    expect(artifact.hierarchies["taxA"]!.max_depth).toBe(1);
    expect(artifact.hierarchies["taxB"]!.root_class_ids).toEqual(["class:Root"]);
  });
});

// ---------------------------------------------------------------------------
// Registry-DERIVED class hierarchies (one class per registry row).
// ---------------------------------------------------------------------------

import type {
  NormalizedOntologyHierarchySpec,
  RegistryRecord,
} from "../src/types.js";
import { registryClassNodeId } from "../src/ontology-class-hierarchies.js";

/** A registry-bound `hierarchies:` spec over a self-referential parent column. */
function hierarchySpec(
  overrides: Partial<NormalizedOntologyHierarchySpec> = {},
): NormalizedOntologyHierarchySpec {
  return {
    registry: overrides.registry ?? "procs",
    parent_column: overrides.parent_column ?? "parent_id",
    child_column: overrides.child_column ?? "id",
    relation_type: overrides.relation_type ?? "parent_process",
    parent_node_type: overrides.parent_node_type ?? "Proc",
    child_node_type: overrides.child_node_type ?? "Proc",
  };
}

/** A terse RegistryRecord builder (raw carries the parent column). */
function rec(
  id: string,
  parentId: string,
  label?: string,
  nodeType = "Proc",
): RegistryRecord {
  return {
    registryId: "procs",
    id,
    label: label ?? id,
    aliases: [],
    nodeType,
    sourceFile: "/procs.csv",
    raw: { id, parent_id: parentId, label: label ?? id },
  };
}

describe("buildClassHierarchies — registry-derived (parent columns)", () => {
  const RECORDS: RegistryRecord[] = [
    rec("A", "", "Root A"),
    rec("A.1", "A", "Child A1"),
    rec("A.1.1", "A.1", "Leaf A11"),
    rec("B", "", "Root B"),
    rec("C", "MISSING", "Orphan C"), // dangling parent → promoted to root
  ];
  // Graph nodes: A + A.1 + B joined by registry_record_id; A.1.1 has NO node.
  const NODES = [
    { id: "registry_procs_A", node_type: "Proc", registry_record_id: "A" },
    { id: "registry_procs_A_1", node_type: "Proc", registry_record_id: "A.1" },
    { id: "registry_procs_B", node_type: "Proc", registry_record_id: "B" },
    { id: "unrelated", node_type: "Other" },
  ];

  function build() {
    return buildClassHierarchies({}, NODES, {
      registryHierarchies: { proc_tree: hierarchySpec() },
      registries: { procs: RECORDS },
    }).hierarchies["proc_tree"]!;
  }

  it("builds one class per registry row, nested by parent column", () => {
    const h = build();
    expect(Object.keys(h.classes_by_id).sort()).toEqual(
      [
        registryClassNodeId("proc_tree", "A"),
        registryClassNodeId("proc_tree", "A.1"),
        registryClassNodeId("proc_tree", "A.1.1"),
        registryClassNodeId("proc_tree", "B"),
        registryClassNodeId("proc_tree", "C"),
      ].sort(),
    );
    const a = h.classes_by_id[registryClassNodeId("proc_tree", "A")]!;
    const a1 = h.classes_by_id[registryClassNodeId("proc_tree", "A.1")]!;
    const a11 = h.classes_by_id[registryClassNodeId("proc_tree", "A.1.1")]!;
    expect(a.parent_id).toBeNull();
    expect(a.child_ids).toEqual([registryClassNodeId("proc_tree", "A.1")]);
    expect(a1.parent_id).toBe(registryClassNodeId("proc_tree", "A"));
    expect(a1.child_ids).toEqual([registryClassNodeId("proc_tree", "A.1.1")]);
    expect(a11.parent_id).toBe(registryClassNodeId("proc_tree", "A.1"));
  });

  it("derives roots (incl. dangling-parent orphans), levels and depth", () => {
    const h = build();
    expect(h.root_class_ids).toEqual(
      [
        registryClassNodeId("proc_tree", "A"),
        registryClassNodeId("proc_tree", "B"),
        registryClassNodeId("proc_tree", "C"),
      ].sort(),
    );
    expect(h.orphan_class_names).toEqual(["C"]);
    expect(h.classes_by_id[registryClassNodeId("proc_tree", "A")]!.level).toBe(0);
    expect(h.classes_by_id[registryClassNodeId("proc_tree", "A.1")]!.level).toBe(1);
    expect(h.classes_by_id[registryClassNodeId("proc_tree", "A.1.1")]!.level).toBe(2);
    expect(h.max_depth).toBe(2);
  });

  it("joins member_ids by registry_record_id (empty when no graph node)", () => {
    const h = build();
    expect(h.classes_by_id[registryClassNodeId("proc_tree", "A")]!.member_ids).toEqual([
      "registry_procs_A",
    ]);
    expect(h.classes_by_id[registryClassNodeId("proc_tree", "A.1")]!.member_ids).toEqual([
      "registry_procs_A_1",
    ]);
    // No graph node for A.1.1 ⇒ empty members (the tree class still exists).
    expect(h.classes_by_id[registryClassNodeId("proc_tree", "A.1.1")]!.member_ids).toEqual([]);
  });

  it("labels each class from the registry label; carries the node_type", () => {
    const h = build();
    expect(h.classes_by_id[registryClassNodeId("proc_tree", "A")]!.label).toBe("Root A");
    expect(h.classes_by_id[registryClassNodeId("proc_tree", "A.1")]!.member_node_types).toEqual([
      "Proc",
    ]);
    expect(h.relation_type).toBe("subclass_of");
    expect(h.membership_relation_type).toBe("has_instance");
  });

  it("falls back to the predicted registry_<reg>_<row> node id (no rri)", () => {
    // A graph node that carries the native id but NOT registry_record_id.
    const nodes = [{ id: "registry_procs_A", node_type: "Proc" }];
    const h = buildClassHierarchies({}, nodes, {
      registryHierarchies: { proc_tree: hierarchySpec() },
      registries: { procs: [rec("A", "")] },
    }).hierarchies["proc_tree"]!;
    expect(h.classes_by_id[registryClassNodeId("proc_tree", "A")]!.member_ids).toEqual([
      "registry_procs_A",
    ]);
  });

  it("tallies unattached entities of the node_type", () => {
    // 3 Proc graph nodes, all attached (A, A.1, B) ⇒ 0 unattached.
    expect(build().unattached_entity_count).toBe(0);
    // A registry with a row that has NO matching graph node, plus a stray Proc
    // node that matches no row ⇒ that stray is unattached.
    const h = buildClassHierarchies(
      {},
      [{ id: "registry_procs_Z", node_type: "Proc", registry_record_id: "Z" }],
      {
        registryHierarchies: { proc_tree: hierarchySpec() },
        registries: { procs: [rec("A", "")] },
      },
    ).hierarchies["proc_tree"]!;
    expect(h.unattached_entity_count).toBe(1);
  });

  it("merges registry-derived and hand-authored hierarchies (profile wins on key)", () => {
    const artifact = buildClassHierarchies(
      { tax: spec({ Thing: { parent: null } }) },
      NODES,
      {
        registryHierarchies: { proc_tree: hierarchySpec() },
        registries: { procs: RECORDS },
      },
    );
    expect(Object.keys(artifact.hierarchies).sort()).toEqual(["proc_tree", "tax"]);
    expect(artifact.hierarchies["tax"]!.root_class_ids).toEqual(["class:Thing"]);
  });

  it("is a no-op for the registry path when no registries are supplied", () => {
    const artifact = buildClassHierarchies({}, NODES, {
      registryHierarchies: { proc_tree: hierarchySpec() },
    });
    expect(artifact.hierarchies).toEqual({});
  });
});
