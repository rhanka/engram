/**
 * EVOL 2.c — class-hierarchies builder (graphify_ontology_class_hierarchies_v1).
 *
 * Pure builder for the SEPARATE, additive `class-hierarchies.json` artifact:
 * the CLASS layer of the ontology. A class hierarchy is a mono-parent tree
 * (`subclass_of`) of synthetic classes; its leaf classes gather the graph's
 * entity nodes by their `node_type` (`has_instance`).
 *
 * Contract (frozen consensus, see .graphify/scratch/design-evol.md):
 *   - This module does NOT touch the signed `graphify_scene_hierarchies_v1`
 *     sidecar (src/scene-hierarchies.ts). The class layer is independent.
 *   - Class node ids are SYNTHETIC and namespaced `class:<ClassName>` so they
 *     never collide with raw registry / entity ids.
 *   - Entities join leaf classes by their graph/scene node `id` (NOT
 *     registry_record_id — there is a documented join-key ambiguity between
 *     scene-hierarchies.ts [registry_record_id] and the lifecycle spec [scene
 *     id]; the class layer deliberately uses the entity node id).
 *   - Mono-parent tree v1: each class declares at most one parent. Roots,
 *     child_ids, level, max_depth are derived from the parent links; cycles and
 *     missing parents are tolerated (excluded / promoted), mirroring
 *     buildHierarchyIndex.
 *
 * PURE (no I/O). The standalone emitter lives in
 * `ontology-class-hierarchies-emitter.ts`.
 */

import { buildHierarchyIndex } from "./ontology-hierarchies.js";
import {
  ONTOLOGY_CLASS_HIERARCHIES_SCHEMA,
  type ClassHierarchiesArtifact,
  type ClassHierarchy,
  type ClassHierarchyClassEntry,
  type NormalizedClassHierarchyClass,
  type NormalizedClassHierarchySpec,
  type OntologyHierarchyArc,
} from "./types.js";

export { ONTOLOGY_CLASS_HIERARCHIES_SCHEMA } from "./types.js";

/** Synthetic class-id prefix (F-CLASSID-NS). */
export const CLASS_ID_PREFIX = "class:";

/** Build the synthetic, namespaced id for a class name. */
export function classNodeId(className: string): string {
  return `${CLASS_ID_PREFIX}${className}`;
}

/** Minimal shape of a graph node consumed by the builder (id + node_type). */
export interface ClassHierarchyGraphNode {
  id?: unknown;
  node_type?: unknown;
  type?: unknown;
  [key: string]: unknown;
}

export interface BuildClassHierarchiesOptions {
  /** Optional graph hash stamped on the envelope. */
  graphHash?: string | null;
  /** Optional profile hash stamped on the envelope. */
  profileHash?: string | null;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function entityNodeType(node: ClassHierarchyGraphNode): string {
  // Prefer the ontology `node_type`; fall back to the generic `type` (the spec
  // describes member_node_types as a node_type → leaf-class map, but graphs
  // produced without an ontology only carry `type`).
  const nt = node.node_type;
  if (typeof nt === "string" && nt.trim().length > 0) return nt.trim();
  const t = node.type;
  if (typeof t === "string" && t.trim().length > 0) return t.trim();
  return "";
}

function entityNodeId(node: ClassHierarchyGraphNode): string {
  return typeof node.id === "string" ? node.id : "";
}

/**
 * Build one compiled class hierarchy from its normalized spec and the graph
 * nodes. Deterministic: every list is stably sorted, so identical inputs yield
 * identical output regardless of class / node insertion order.
 */
function buildOneClassHierarchy(
  spec: NormalizedClassHierarchySpec,
  nodes: ClassHierarchyGraphNode[],
): ClassHierarchy {
  const classNames = Object.keys(spec.classes).sort(compareStrings);

  // --- node_type → leaf class (first class by sorted name wins) -------------
  const classByNodeType = new Map<string, string>();
  const memberNodeTypesByClass = new Map<string, string[]>();
  const conflictsByNodeType = new Map<string, string[]>();
  for (const className of classNames) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const klass: NormalizedClassHierarchyClass = spec.classes[className]!;
    const kept: string[] = [];
    for (const nodeType of klass.member_node_types) {
      const owner = classByNodeType.get(nodeType);
      if (owner === undefined) {
        classByNodeType.set(nodeType, className);
        kept.push(nodeType);
      } else {
        const dropped = conflictsByNodeType.get(nodeType) ?? [];
        dropped.push(className);
        conflictsByNodeType.set(nodeType, dropped);
      }
    }
    memberNodeTypesByClass.set(className, [...new Set(kept)].sort(compareStrings));
  }

  // --- attach entity nodes to their leaf class by node_type -----------------
  const memberIdsByClass = new Map<string, string[]>();
  let unattachedEntityCount = 0;
  for (const node of nodes) {
    const id = entityNodeId(node);
    if (!id) continue;
    const nodeType = entityNodeType(node);
    const className = nodeType ? classByNodeType.get(nodeType) : undefined;
    if (className === undefined) {
      unattachedEntityCount += 1;
      continue;
    }
    const bucket = memberIdsByClass.get(className);
    if (bucket) bucket.push(id);
    else memberIdsByClass.set(className, [id]);
  }

  // --- class parent links → arcs → reuse buildHierarchyIndex ----------------
  // Only links whose parent class is DECLARED contribute an arc; a class whose
  // declared parent is unknown is promoted to root and flagged as an orphan.
  const knownClasses = new Set(classNames);
  const orphanClassNames: string[] = [];
  const arcs: OntologyHierarchyArc[] = [];
  for (const className of classNames) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const klass: NormalizedClassHierarchyClass = spec.classes[className]!;
    const parent = klass.parent;
    if (parent === null) continue; // declared root
    if (!knownClasses.has(parent)) {
      orphanClassNames.push(className); // dangling parent → promote to root
      continue;
    }
    arcs.push({
      hierarchy_id: "class",
      parent_id: classNodeId(parent),
      child_id: classNodeId(className),
      level: 0,
      type: spec.relation_type,
      source: "profile",
      status: "reference",
      confidence: 1.0,
    });
  }
  orphanClassNames.sort(compareStrings);

  const index = buildHierarchyIndex(arcs);
  const cycleNodes = new Set(index.cycles.flat());

  // child_ids per class (acyclic arcs only, both endpoints declared).
  const childIdsByParent = new Map<string, string[]>();
  for (const arc of arcs) {
    if (cycleNodes.has(arc.parent_id) || cycleNodes.has(arc.child_id)) continue;
    const bucket = childIdsByParent.get(arc.parent_id);
    if (bucket) bucket.push(arc.child_id);
    else childIdsByParent.set(arc.parent_id, [arc.child_id]);
  }

  // parent_id per class (the kept mono-parent arc; null for roots / cycles).
  const parentIdByClassId = new Map<string, string>();
  for (const arc of arcs) {
    if (cycleNodes.has(arc.parent_id) || cycleNodes.has(arc.child_id)) continue;
    parentIdByClassId.set(arc.child_id, arc.parent_id);
  }

  const classesById: Record<string, ClassHierarchyClassEntry> = {};
  for (const className of classNames) {
    const id = classNodeId(className);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const klass: NormalizedClassHierarchyClass = spec.classes[className]!;
    const parentId = cycleNodes.has(id) ? null : (parentIdByClassId.get(id) ?? null);
    classesById[id] = {
      id,
      label: klass.label ?? className,
      parent_id: parentId,
      child_ids: (childIdsByParent.get(id) ?? []).sort(compareStrings),
      level: index.ancestor_paths[id]?.length ?? 0,
      member_node_types: memberNodeTypesByClass.get(className) ?? [],
      member_ids: (memberIdsByClass.get(className) ?? []).sort(compareStrings),
      source: "profile",
      status: "reference",
    };
  }

  // Roots = index roots (no parent / cycle-detached) + declared roots + orphans.
  const rootClassIds = new Set<string>();
  for (const id of index.root_ids) rootClassIds.add(id);
  for (const className of classNames) {
    const id = classNodeId(className);
    if (cycleNodes.has(id)) continue;
    if ((parentIdByClassId.get(id) ?? null) === null) rootClassIds.add(id);
  }
  for (const className of orphanClassNames) {
    const id = classNodeId(className);
    if (!cycleNodes.has(id)) rootClassIds.add(id);
  }

  const memberNodeTypeConflicts = [...conflictsByNodeType.entries()]
    .map(([nodeType, dropped]) => ({
      node_type: nodeType,
      dropped_classes: [...new Set(dropped)].sort(compareStrings),
    }))
    .sort((a, b) => compareStrings(a.node_type, b.node_type));

  return {
    relation_type: spec.relation_type,
    membership_relation_type: spec.membership_relation_type,
    root_class_ids: [...rootClassIds].sort(compareStrings),
    max_depth: index.depth,
    classes_by_id: classesById,
    orphan_class_names: orphanClassNames,
    cycles: index.cycles,
    member_node_type_conflicts: memberNodeTypeConflicts,
    unattached_entity_count: unattachedEntityCount,
  };
}

/**
 * Build the `graphify_ontology_class_hierarchies_v1` artifact from the profile
 * `class_hierarchies` block and the graph nodes. Pure and deterministic (only
 * `generated_at` varies between runs over identical inputs).
 */
export function buildClassHierarchies(
  profileClassHierarchies: Record<string, NormalizedClassHierarchySpec>,
  graphNodes: ClassHierarchyGraphNode[],
  options: BuildClassHierarchiesOptions = {},
): ClassHierarchiesArtifact {
  const hierarchies: Record<string, ClassHierarchy> = {};
  for (const hierarchyId of Object.keys(profileClassHierarchies).sort(compareStrings)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    hierarchies[hierarchyId] = buildOneClassHierarchy(
      profileClassHierarchies[hierarchyId]!,
      graphNodes,
    );
  }

  const artifact: ClassHierarchiesArtifact = {
    schema: ONTOLOGY_CLASS_HIERARCHIES_SCHEMA,
    generated_at: new Date().toISOString(),
    graph_hash: options.graphHash ?? null,
    profile_hash: options.profileHash ?? null,
    hierarchies,
  };
  return artifact;
}
