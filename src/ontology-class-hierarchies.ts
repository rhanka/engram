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
  type NormalizedOntologyHierarchySpec,
  type OntologyHierarchyArc,
  type RegistryRecord,
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
  /**
   * Registry-bound `hierarchies:` specs (profile.hierarchies). When supplied
   * with {@link registries}, each is DERIVED into a class hierarchy (one class
   * per registry row) and merged into the artifact. Absent ⇒ profile-only.
   */
  registryHierarchies?: Record<string, NormalizedOntologyHierarchySpec>;
  /** Loaded registry rows keyed by registry id (for the registry-derived path). */
  registries?: Record<string, RegistryRecord[]>;
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

// ===========================================================================
// Registry-DERIVED class hierarchies (registry parent-column trees).
//
// For a project whose hierarchy is defined by registry PARENT COLUMNS (a
// self-referential process/org tree, e.g. process-std-AM's ~2300 processes), the
// hand-authored `class_hierarchies` block is infeasible. Instead we DERIVE the
// same `graphify_ontology_class_hierarchies_v1` artifact directly from the
// registry-bound `hierarchies:` specs the project already declares: ONE class
// per registry row, `parent` = the class of the row's parent_column value,
// `level` from the parent chain, `member_node_types` = the registry's node_type,
// `member_ids` = the graph node(s) resolved by `registry_record_id` (the join
// key `registryRecordsToExtraction` stamps, native id `registry_<reg>_<row>`).
//
// The output is SHAPE-IDENTICAL to `buildOneClassHierarchy` (same reuse of
// `buildHierarchyIndex` for roots/levels/cycles), so the studio consumes it
// UNCHANGED. Deterministic + LLM-free.
// ===========================================================================

/** Sanitize a value into the id part `registryRecordsToExtraction` uses. */
function safeIdPart(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Synthetic class id for a registry-derived class (namespaced by hierarchy). */
export function registryClassNodeId(hierarchyId: string, rowId: string): string {
  return `${CLASS_ID_PREFIX}${hierarchyId}:${rowId}`;
}

interface RegistryJoinIndex {
  /** node_type → (registry_record_id → graph node ids). */
  byTypeAndRecordId: Map<string, Map<string, string[]>>;
  /** Every graph node id (for the predicted `registry_<reg>_<row>` fallback). */
  idSet: Set<string>;
  /** node_type → count of graph nodes carrying it (for unattached tallies). */
  countByType: Map<string, number>;
}

/** Index the graph once for the registry member-join (reused across hierarchies). */
function indexGraphForRegistryJoin(nodes: ClassHierarchyGraphNode[]): RegistryJoinIndex {
  const byTypeAndRecordId = new Map<string, Map<string, string[]>>();
  const idSet = new Set<string>();
  const countByType = new Map<string, number>();
  for (const node of nodes) {
    const id = entityNodeId(node);
    if (id) idSet.add(id);
    const nodeType = entityNodeType(node);
    if (nodeType) countByType.set(nodeType, (countByType.get(nodeType) ?? 0) + 1);
    const rri = node.registry_record_id;
    if (!id || !nodeType || typeof rri !== "string" || rri.length === 0) continue;
    let byRecord = byTypeAndRecordId.get(nodeType);
    if (!byRecord) {
      byRecord = new Map<string, string[]>();
      byTypeAndRecordId.set(nodeType, byRecord);
    }
    const bucket = byRecord.get(rri);
    if (bucket) bucket.push(id);
    else byRecord.set(rri, [id]);
  }
  return { byTypeAndRecordId, idSet, countByType };
}

/** Graph node ids that are instances of the registry row `rowId`. */
function memberIdsForRow(
  spec: NormalizedOntologyHierarchySpec,
  rowId: string,
  index: RegistryJoinIndex,
): string[] {
  const nodeType = spec.child_node_type;
  const members = new Set<string>();
  // Primary join: graph node whose `registry_record_id` equals the row id AND
  // whose node_type matches the registry's node_type (the canonical convention).
  for (const id of index.byTypeAndRecordId.get(nodeType)?.get(rowId) ?? []) members.add(id);
  // Fallback: the id `registryRecordsToExtraction` would mint for the row, for
  // graphs that stamp the native id but not `registry_record_id`.
  const predicted = `registry_${safeIdPart(spec.registry)}_${safeIdPart(rowId)}`;
  if (index.idSet.has(predicted)) members.add(predicted);
  return [...members].sort(compareStrings);
}

/**
 * Build ONE registry-derived class hierarchy: one class per registry row, parent
 * links read from `spec.parent_column`, member entities joined by
 * `registry_record_id`. Reuses `buildHierarchyIndex` for roots / levels / cycles
 * so the output matches `buildOneClassHierarchy`'s contract exactly.
 */
function buildOneRegistryClassHierarchy(
  hierarchyId: string,
  spec: NormalizedOntologyHierarchySpec,
  records: RegistryRecord[],
  index: RegistryJoinIndex,
): ClassHierarchy {
  const nodeType = spec.child_node_type;
  const rowIds = new Set(records.map((record) => record.id));

  // --- class parent links → arcs (mono-parent; unknown/self parents dropped) --
  const orphanClassNames: string[] = [];
  const arcs: OntologyHierarchyArc[] = [];
  for (const record of records) {
    const rawParent = record.raw[spec.parent_column];
    const parentRowId =
      rawParent === null || rawParent === undefined ? "" : String(rawParent).trim();
    if (!parentRowId || parentRowId === record.id) continue; // root (no arc)
    if (!rowIds.has(parentRowId)) {
      orphanClassNames.push(record.id); // dangling parent → promote to root
      continue;
    }
    arcs.push({
      hierarchy_id: hierarchyId,
      parent_id: registryClassNodeId(hierarchyId, parentRowId),
      child_id: registryClassNodeId(hierarchyId, record.id),
      level: 0,
      type: "subclass_of",
      source: "profile",
      status: "reference",
      confidence: 1.0,
    });
  }
  orphanClassNames.sort(compareStrings);

  const idx = buildHierarchyIndex(arcs);
  const cycleNodes = new Set(idx.cycles.flat());

  const childIdsByParent = new Map<string, string[]>();
  const parentIdByClassId = new Map<string, string>();
  for (const arc of arcs) {
    if (cycleNodes.has(arc.parent_id) || cycleNodes.has(arc.child_id)) continue;
    const bucket = childIdsByParent.get(arc.parent_id);
    if (bucket) bucket.push(arc.child_id);
    else childIdsByParent.set(arc.parent_id, [arc.child_id]);
    parentIdByClassId.set(arc.child_id, arc.parent_id);
  }

  const classesById: Record<string, ClassHierarchyClassEntry> = {};
  const attachedMemberIds = new Set<string>();
  for (const record of records) {
    const id = registryClassNodeId(hierarchyId, record.id);
    const parentId = cycleNodes.has(id) ? null : (parentIdByClassId.get(id) ?? null);
    const memberIds = memberIdsForRow(spec, record.id, index);
    for (const memberId of memberIds) attachedMemberIds.add(memberId);
    classesById[id] = {
      id,
      label: record.label || record.id,
      parent_id: parentId,
      child_ids: (childIdsByParent.get(id) ?? []).sort(compareStrings),
      level: idx.ancestor_paths[id]?.length ?? 0,
      // Every process row is BOTH an entity AND a category, so every class
      // carries the registry node_type — the studio's Type axis / leaf detection
      // then attaches per-node members at any depth.
      member_node_types: [nodeType],
      member_ids: memberIds,
      source: "profile",
      status: "reference",
    };
  }

  // Roots = index roots (no parent / cycle-detached) + declared roots + orphans.
  const rootClassIds = new Set<string>();
  for (const id of idx.root_ids) rootClassIds.add(id);
  for (const record of records) {
    const id = registryClassNodeId(hierarchyId, record.id);
    if (cycleNodes.has(id)) continue;
    if ((parentIdByClassId.get(id) ?? null) === null) rootClassIds.add(id);
  }
  for (const rowId of orphanClassNames) {
    const id = registryClassNodeId(hierarchyId, rowId);
    if (!cycleNodes.has(id)) rootClassIds.add(id);
  }

  // Unattached = graph entities of this node_type not joined to any class.
  const totalOfType = index.countByType.get(nodeType) ?? 0;
  const unattachedEntityCount = Math.max(0, totalOfType - attachedMemberIds.size);

  return {
    relation_type: "subclass_of",
    membership_relation_type: "has_instance",
    root_class_ids: [...rootClassIds].sort(compareStrings),
    max_depth: idx.depth,
    classes_by_id: classesById,
    orphan_class_names: orphanClassNames,
    cycles: idx.cycles,
    member_node_type_conflicts: [],
    unattached_entity_count: unattachedEntityCount,
  };
}

/**
 * Build the `graphify_ontology_class_hierarchies_v1` artifact from the profile
 * `class_hierarchies` block and the graph nodes. Pure and deterministic (only
 * `generated_at` varies between runs over identical inputs).
 *
 * When `options.registryHierarchies` (the registry-bound `hierarchies:` specs)
 * and `options.registries` (the loaded registry rows) are supplied, each spec is
 * ALSO DERIVED into a class hierarchy (one class per registry row) and merged in
 * under its hierarchy id — so a registry-hierarchical project (process-std-AM) lights
 * up the studio's native ontology accordion with no hand-authored classes. A
 * hand-authored `class_hierarchies` entry wins on an id collision.
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

  const registryHierarchies = options.registryHierarchies;
  const registries = options.registries;
  if (registryHierarchies && registries) {
    const index = indexGraphForRegistryJoin(graphNodes);
    for (const hierarchyId of Object.keys(registryHierarchies).sort(compareStrings)) {
      if (hierarchies[hierarchyId]) continue; // profile class_hierarchies wins.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const spec = registryHierarchies[hierarchyId]!;
      const records = registries[spec.registry] ?? [];
      if (records.length === 0) continue; // nothing to derive (registry absent).
      hierarchies[hierarchyId] = buildOneRegistryClassHierarchy(
        hierarchyId,
        spec,
        records,
        index,
      );
    }
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
