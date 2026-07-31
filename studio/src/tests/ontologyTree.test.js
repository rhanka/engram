import { describe, expect, it } from "vitest";

import {
  buildForestList,
  buildOntologyTree,
  selectTaxonomyHierarchy,
} from "../lib/ontologyTree.js";

/**
 * THE structural contract of the rail: ONE ontology tree, with the registry
 * process forests NESTED under their taxonomy class.
 *
 * The regression this locks: `Process → ABP → ABPProcess` was a node-type dead
 * end, the real ABP/PROCESS_STD trees lived in a SEPARATE "Hierarchies" accordion, and
 * the generic `Process` entities hung off a "Process Catalog" branch under
 * Methods. Everything below asserts the corrected shape on process-std-shaped data.
 */

/** A minimal process-std-shaped class taxonomy (the ontology-profile's am_class_tree). */
const amClassTree = {
  hierarchies: {
    am_class_tree: {
      root_class_ids: [
        "class:Process",
        "class:Tool",
        "class:Data",
        "class:Org",
        "class:Methods",
      ],
      classes_by_id: {
        "class:Process": {
          id: "class:Process",
          label: "Process",
          child_ids: ["class:ABP", "class:PROCESS_STD", "class:Unreconciled"],
        },
        "class:ABP": {
          id: "class:ABP",
          label: "ABP",
          member_node_types: ["ABPProcess"],
          member_hierarchies: ["abp_process_tree"],
        },
        "class:PROCESS_STD": {
          id: "class:PROCESS_STD",
          label: "PROCESS_STD",
          member_node_types: ["ProcessStdProcess"],
          member_hierarchies: ["process_std_process_tree"],
        },
        "class:Unreconciled": {
          id: "class:Unreconciled",
          label: "Unreconciled",
          member_node_types: ["Process"],
        },
        "class:Tool": { id: "class:Tool", label: "Tool", child_ids: ["class:Application"] },
        "class:Application": {
          id: "class:Application",
          label: "Application",
          member_node_types: ["DigitalApplicationTool"],
        },
        "class:Data": { id: "class:Data", label: "Data", child_ids: ["class:Data Objects"] },
        "class:Data Objects": {
          id: "class:Data Objects",
          label: "Data Objects",
          member_node_types: ["DataObject"],
        },
        "class:Org": {
          id: "class:Org",
          label: "Org",
          member_hierarchies: ["org_unit_tree"],
          member_node_types: ["OrganizationUnit"],
        },
        // Methods holds its types DIRECTLY — proof the tree is not capped at
        // "root → sub → types" any more.
        "class:Methods": {
          id: "class:Methods",
          label: "Methods",
          member_node_types: ["InstructionActivity", "Method"],
        },
      },
    },
  },
};

/** The scene-hierarchies sidecar: three real multi-level forests. */
const sidecar = {
  hierarchies: {
    abp_process_tree: {
      root_ids: ["DE"],
      dangling_arc_count: 0,
      orphan_ids: [],
      nodes_by_id: {
        DE: { parent_id: null, child_ids: ["DE.AI"], level: 0, label: "Develop" },
        "DE.AI": {
          parent_id: "DE",
          child_ids: ["DE.AI.01"],
          level: 1,
          label: "Architect and Integrate the Aircraft",
        },
        "DE.AI.01": { parent_id: "DE.AI", child_ids: [], level: 2, label: "Organize" },
      },
    },
    process_std_process_tree: {
      root_ids: ["AM01"],
      dangling_arc_count: 0,
      orphan_ids: [],
      nodes_by_id: {
        AM01: { parent_id: null, child_ids: ["AM0104"], level: 0, label: "Manage Safety" },
        AM0104: { parent_id: "AM01", child_ids: [], level: 1, label: "Report Occurrences" },
      },
    },
    org_unit_tree: {
      root_ids: ["AB"],
      dangling_arc_count: 0,
      orphan_ids: [],
      nodes_by_id: { AB: { parent_id: null, child_ids: [], level: 0, label: "client-org" } },
    },
  },
};

/** Live scene type counts, process-std-shaped. */
const typeList = [
  { key: "DataObject", count: 11663 },
  { key: "Process", count: 5886 },
  { key: "OrganizationUnit", count: 4280 },
  { key: "Method", count: 3531 },
  { key: "ProcessStdProcess", count: 2285 },
  { key: "ABPProcess", count: 2040 },
  { key: "InstructionActivity", count: 1434 },
  { key: "DigitalApplicationTool", count: 78 },
];

const forests = buildForestList(sidecar);
const tree = buildOntologyTree(typeList, amClassTree, forests);
const byLabel = (nodes, label) => nodes.find((n) => n.label === label);

describe("buildOntologyTree — ONE ontology with the process forests nested", () => {
  it("orders the first level Process / Tool / Data / Org first", () => {
    expect(tree.map((n) => n.label).slice(0, 4)).toEqual([
      "Process",
      "Tool",
      "Data",
      "Org",
    ]);
  });

  it("ABP and PROCESS_STD expand into their REAL multi-level tree, not a node-type dead end", () => {
    const process = byLabel(tree, "Process");
    const abp = byLabel(process.subs, "ABP");
    const process_std = byLabel(process.subs, "PROCESS_STD");

    // Each owns exactly ONE forest — they are NEVER merged into a single tree.
    expect(abp.forests.map((f) => f.key)).toEqual(["abp_process_tree"]);
    expect(process_std.forests.map((f) => f.key)).toEqual(["process_std_process_tree"]);

    // …and that forest is the real navigable hierarchy (DE → DE.AI → DE.AI.01).
    const abpNodes = abp.forests[0].hierarchy.nodes_by_id;
    expect(abp.forests[0].rootIds).toEqual(["DE"]);
    expect(abpNodes["DE"].child_ids).toEqual(["DE.AI"]);
    expect(abpNodes["DE.AI"].child_ids).toEqual(["DE.AI.01"]);
    expect(abpNodes["DE.AI.01"].level).toBe(2);

    const processStdNodes = process_std.forests[0].hierarchy.nodes_by_id;
    expect(process_std.forests[0].rootIds).toEqual(["AM01"]);
    expect(processStdNodes["AM01"].child_ids).toEqual(["AM0104"]);
  });

  it("puts the generic Process entities under Process/Unreconciled — NEVER under Methods", () => {
    const process = byLabel(tree, "Process");
    const unreconciled = byLabel(process.subs, "Unreconciled");
    expect(unreconciled.types).toEqual([{ key: "Process", count: 5886 }]);

    const methods = byLabel(tree, "Methods");
    const methodTypes = methods.types.map((t) => t.key);
    expect(methodTypes).not.toContain("Process");
    // Methods carries ONLY the activity/method types, directly (no sub-branch).
    expect(methodTypes.sort()).toEqual(["InstructionActivity", "Method"]);
    expect(methods.subs).toEqual([]);
    expect(methods.count).toBe(1434 + 3531);
    // "Process Catalog" is gone as a branch anywhere in the tree.
    const labels = [];
    const walk = (n) => {
      labels.push(n.label);
      n.subs.forEach(walk);
    };
    tree.forEach(walk);
    expect(labels).not.toContain("Process Catalog");
    expect(labels).not.toContain("Methods & Activities");
  });

  it("counts a class from its own types plus its descendants", () => {
    const process = byLabel(tree, "Process");
    // 2040 (ABP) + 2285 (PROCESS_STD) + 5886 (Unreconciled). The forest is navigation,
    // not an extra population — it never double-counts.
    expect(process.count).toBe(2040 + 2285 + 5886);
    expect(byLabel(process.subs, "ABP").count).toBe(2040);
  });

  it("a class may carry a forest AND its own types (Org)", () => {
    const org = byLabel(tree, "Org");
    expect(org.forests.map((f) => f.key)).toEqual(["org_unit_tree"]);
    expect(org.types).toEqual([{ key: "OrganizationUnit", count: 4280 }]);
  });

  it("leaves NO 'Other' bucket when the taxonomy covers every live type", () => {
    expect(tree.map((n) => n.label)).not.toContain("Other");
  });

  it("keeps an unclaimed forest inside the SAME tree (never a second accordion)", () => {
    const noOrgBinding = structuredClone(amClassTree);
    delete noOrgBinding.hierarchies.am_class_tree.classes_by_id["class:Org"]
      .member_hierarchies;
    const t = buildOntologyTree(typeList, noOrgBinding, forests);
    const orphanRoot = t.find((n) => n.id === "__hierarchy__:org_unit_tree");
    expect(orphanRoot).toBeTruthy();
    expect(orphanRoot.forests[0].key).toBe("org_unit_tree");
  });

  it("still refuses a non-taxonomy hierarchy (the 'Other 47575' regression)", () => {
    // A registry PROCESS forest mis-emitted into class-hierarchies.json has no
    // member_node_types ⇒ never selected ⇒ the rail falls back to the flat list.
    const bogus = {
      hierarchies: {
        abp_process_tree: {
          root_class_ids: ["class:DE"],
          classes_by_id: { "class:DE": { id: "class:DE", label: "DE", child_ids: [] } },
        },
      },
    };
    expect(selectTaxonomyHierarchy(bogus.hierarchies, new Map(), 47762)).toBeNull();
    expect(buildOntologyTree(typeList, bogus, [])).toBeNull();
    expect(buildOntologyTree(typeList, null, [])).toBeNull();
  });
});
