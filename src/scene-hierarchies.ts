/**
 * workspace-bundle-contract-v1 (WP4 G2) — scene hierarchy sidecar builder.
 *
 * Pure builder for the `graphify_scene_hierarchies_v1` artifact
 * (`scene-hierarchies.json`), the AUTONOMOUS hierarchy sidecar of the
 * Workspace Consumption Bundle (frozen contract, signed 2/2):
 *
 *   - D1 (transport): the sidecar is a STANDALONE file — never embedded in
 *     scene.json (the scene is OPTIONAL per F1; the hierarchy is core).
 *   - D2 (id contract): all keys / ids in this artifact are the RAW registry
 *     ids, verbatim lossless (`AM0104.01`, `DE.AI.01`, `org:CODE`, dashed
 *     UUIDs — no `.`/`-`→`_` transformation, no id_map). Consumers join the
 *     scene via the `registry_record_id` carried by scene nodes.
 *
 * Lane rules (frozen):
 *   - LANE 1 (tree): arcs with status ∈ {reference, validated}. Mono-parent
 *     is ENFORCED — first parent wins by stable sort; losers are recorded in
 *     `conflicts[]` and demoted into `overlay_arcs`. `status` is carried by
 *     the CHILD entry. The sidecar is AUTHORITATIVE for traversal; the
 *     node-level parent_id/child_ids from G1 are display-only.
 *   - LANE 2 (overlay): the remaining statuses (guessed / proposed / inferred /
 *     candidate / rejected / superseded). Empty in v1 (the profile pipeline only produces
 *     status:"reference" arcs) apart from mono-parent demotions.
 *   - Orphan tolerance (B6): a child whose parent is absent from
 *     `sceneNodeIds` is promoted to root and listed in `orphan_ids`.
 *   - Cycle parity: roots / levels / cycles reuse `buildHierarchyIndex`;
 *     nodes on a cycle are reported in `cycles[]` and excluded from
 *     `nodes_by_id` (exactly as the index excludes them from
 *     root_ids/ancestor_paths).
 *
 * This module is PURE (no I/O). The standalone emitter lives in
 * `scene-hierarchies-emitter.ts`.
 */

import { buildHierarchyIndex } from "./ontology-hierarchies.js";
import type { OntologyHierarchyArc } from "./types.js";

export const SCENE_HIERARCHIES_SCHEMA = "graphify_scene_hierarchies_v1";

/** LANE 1 — authoritative tree statuses (frozen contract). */
const TREE_LANE_STATUSES = new Set(["reference", "validated"]);

/** Per-node entry of a hierarchy tree (LANE 1). Keyed by raw id. */
export interface SceneHierarchyNodeEntry {
  /** Raw id of the mono-parent, or null for roots (incl. promoted orphans). */
  parent_id: string | null;
  /** Raw ids of the kept (lane-1, acyclic) children, sorted. */
  child_ids: string[];
  /** Depth from the root (0 = root). */
  level: number;
  /** Optional display code (NOT the join key). */
  code?: string;
  /** Lifecycle status of the arc that attached this node to its parent. */
  status: "reference" | "validated";
  assertion_basis?: string;
  derivation_method?: string;
  /** Raw registry id, verbatim lossless (D2). Equals the entry key. */
  registry_record_id: string;
}

/** LANE 2 — overlay (non-tree) arc. Empty in v1 except mono-parent demotions. */
export interface SceneHierarchyOverlayArc {
  parent_id: string;
  child_id: string;
  status: "guessed" | "proposed" | "inferred" | "candidate" | "rejected" | "superseded";
  confidence?: number;
  evidence_refs?: string[];
  derivation_method?: string;
}

/** Mono-parent enforcement record: losers demoted into overlay_arcs. */
export interface SceneHierarchyConflict {
  child_id: string;
  kept_parent_id: string;
  demoted_parent_ids: string[];
}

export interface SceneHierarchy {
  relation_type: string;
  kind: "tree" | "forest";
  root_ids: string[];
  max_depth: number;
  nodes_by_id: Record<string, SceneHierarchyNodeEntry>;
  overlay_arcs: SceneHierarchyOverlayArc[];
  orphan_ids: string[];
  cycles: string[][];
  conflicts: SceneHierarchyConflict[];
  /** Arcs dropped without any trace elsewhere in the artifact. */
  dangling_arc_count: number;
}

export interface SceneHierarchySidecar {
  schema: typeof SCENE_HIERARCHIES_SCHEMA;
  generated_at: string;
  graph_hash: string | null;
  hierarchies: Record<string, SceneHierarchy>;
}

export interface BuildSceneHierarchySidecarOptions {
  /** All hierarchy arcs (every hierarchy mixed; grouped by hierarchy_id). */
  arcs: OntologyHierarchyArc[];
  /**
   * RAW registry ids present in the consuming scene/workspace (D2 join key —
   * the verbatim id_column values, i.e. the `registry_record_id` of scene
   * nodes, NOT the slugged native scene ids).
   */
  sceneNodeIds: Set<string>;
  /** Optional hierarchy specs (relation_type override per hierarchy_id). */
  specs?: Record<string, { relation_type?: string }>;
  /** Optional graph hash stamped on the envelope. */
  graphHash?: string;
}

/**
 * Build the `graphify_scene_hierarchies_v1` sidecar. Pure and deterministic:
 * every list is stably sorted, so identical inputs yield identical artifacts
 * regardless of arc order (only `generated_at` varies).
 */
export function buildSceneHierarchySidecar(
  options: BuildSceneHierarchySidecarOptions,
): SceneHierarchySidecar {
  const { arcs, sceneNodeIds, specs, graphHash } = options;

  const byHierarchy = new Map<string, OntologyHierarchyArc[]>();
  for (const arc of arcs) {
    const bucket = byHierarchy.get(arc.hierarchy_id);
    if (bucket) bucket.push(arc);
    else byHierarchy.set(arc.hierarchy_id, [arc]);
  }

  const hierarchies: Record<string, SceneHierarchy> = {};
  for (const hierarchyId of [...byHierarchy.keys()].sort()) {
    // Non-null: the key comes straight from the map.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const hierarchyArcs = byHierarchy.get(hierarchyId)!;
    hierarchies[hierarchyId] = buildOneHierarchy(
      hierarchyArcs,
      sceneNodeIds,
      specs?.[hierarchyId],
    );
  }

  return {
    schema: SCENE_HIERARCHIES_SCHEMA,
    generated_at: new Date().toISOString(),
    graph_hash: graphHash ?? null,
    hierarchies,
  };
}

function arcStatus(arc: OntologyHierarchyArc): string {
  // Profile-declared arcs always carry status:"reference"; tolerate absent
  // status on legacy artifacts by defaulting to the authoritative lane.
  return arc.status ?? "reference";
}

function treeStatus(value: string): "reference" | "validated" {
  return value === "validated" ? "validated" : "reference";
}

type SceneHierarchyOverlayStatus = SceneHierarchyOverlayArc["status"];

function overlayStatus(value: string): SceneHierarchyOverlayStatus {
  return value === "guessed" ||
    value === "inferred" ||
    value === "candidate" ||
    value === "rejected" ||
    value === "superseded"
    ? value
    : "proposed";
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function overlayArcFrom(
  arc: OntologyHierarchyArc,
  status: SceneHierarchyOverlayStatus,
  derivationMethod?: string,
): SceneHierarchyOverlayArc {
  const out: SceneHierarchyOverlayArc = {
    parent_id: arc.parent_id,
    child_id: arc.child_id,
    status,
  };
  if (typeof arc.confidence === "number") out.confidence = arc.confidence;
  if (Array.isArray(arc.evidence_refs) && arc.evidence_refs.length > 0) {
    out.evidence_refs = arc.evidence_refs;
  }
  if (derivationMethod) out.derivation_method = derivationMethod;
  return out;
}

function buildOneHierarchy(
  arcs: OntologyHierarchyArc[],
  sceneNodeIds: Set<string>,
  spec: { relation_type?: string } | undefined,
): SceneHierarchy {
  let danglingArcCount = 0;
  const overlayArcs: SceneHierarchyOverlayArc[] = [];
  /** LANE 1 arcs with both endpoints present, grouped per child. */
  const treeArcsByChild = new Map<string, OntologyHierarchyArc[]>();
  /** LANE 1 arcs whose child is present but parent is absent (orphan path). */
  const absentParentArcsByChild = new Map<string, OntologyHierarchyArc[]>();

  for (const arc of arcs) {
    const status = arcStatus(arc);
    if (TREE_LANE_STATUSES.has(status)) {
      // LANE 1 — tree candidates.
      if (!sceneNodeIds.has(arc.child_id)) {
        danglingArcCount += 1; // child unknown: nothing to attach, no trace
        continue;
      }
      if (!sceneNodeIds.has(arc.parent_id)) {
        const bucket = absentParentArcsByChild.get(arc.child_id);
        if (bucket) bucket.push(arc);
        else absentParentArcsByChild.set(arc.child_id, [arc]);
        continue;
      }
      const bucket = treeArcsByChild.get(arc.child_id);
      if (bucket) bucket.push(arc);
      else treeArcsByChild.set(arc.child_id, [arc]);
    } else {
      // LANE 2 — overlay passthrough (requires both endpoints present).
      if (!sceneNodeIds.has(arc.child_id) || !sceneNodeIds.has(arc.parent_id)) {
        danglingArcCount += 1;
        continue;
      }
      overlayArcs.push(overlayArcFrom(arc, overlayStatus(status)));
    }
  }

  // --- Mono-parent enforcement (LANE 1) -----------------------------------
  // First parent wins by STABLE sort on parent_id (deterministic regardless
  // of input arc order); losers → conflicts[] + demoted into overlay_arcs.
  const conflicts: SceneHierarchyConflict[] = [];
  const keptArcs: OntologyHierarchyArc[] = [];
  const keptArcByChild = new Map<string, OntologyHierarchyArc>();

  for (const child of [...treeArcsByChild.keys()].sort(compareStrings)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const candidates = [...treeArcsByChild.get(child)!].sort((a, b) =>
      compareStrings(a.parent_id, b.parent_id),
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const winner = candidates[0]!;
    keptArcs.push(winner);
    keptArcByChild.set(child, winner);

    // Losers with DISTINCT parents are conflicts; exact duplicates of the
    // winner are silently collapsed (they are already represented).
    const demoted = candidates
      .slice(1)
      .filter((arc) => arc.parent_id !== winner.parent_id);
    const demotedParentIds = [...new Set(demoted.map((arc) => arc.parent_id))].sort(
      compareStrings,
    );
    if (demotedParentIds.length > 0) {
      conflicts.push({
        child_id: child,
        kept_parent_id: winner.parent_id,
        demoted_parent_ids: demotedParentIds,
      });
      const seenDemotedParents = new Set<string>();
      for (const arc of demoted) {
        if (seenDemotedParents.has(arc.parent_id)) continue;
        seenDemotedParents.add(arc.parent_id);
        overlayArcs.push(
          overlayArcFrom(arc, "proposed", "mono_parent_demotion"),
        );
      }
    }
  }

  // --- Orphan tolerance (B6) ----------------------------------------------
  // A child whose EVERY lane-1 parent is absent from the scene is promoted
  // to root and listed in orphan_ids. If the child also has a present
  // parent, the absent-parent arcs are simply dangling.
  const orphanIds: string[] = [];
  const orphanStatusByChild = new Map<string, "reference" | "validated">();
  for (const [child, missingArcs] of absentParentArcsByChild) {
    if (keptArcByChild.has(child)) {
      danglingArcCount += missingArcs.length;
      continue;
    }
    orphanIds.push(child);
    const sorted = [...missingArcs].sort((a, b) => compareStrings(a.parent_id, b.parent_id));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    orphanStatusByChild.set(child, treeStatus(arcStatus(sorted[0]!)));
    // One tolerated arc carries the promotion; extra absent parents leave no trace.
    danglingArcCount += missingArcs.length - 1;
  }
  orphanIds.sort(compareStrings);

  // --- Roots / levels / cycles: buildHierarchyIndex parity -----------------
  const index = buildHierarchyIndex(keptArcs);
  const cycleNodes = new Set(index.cycles.flat());

  // Entry universe: acyclic nodes reachable from the index roots, plus
  // promoted orphans (which may be absent from the index when they have no
  // kept arcs at all).
  const entryIds = new Set<string>(Object.keys(index.ancestor_paths));
  for (const orphan of orphanIds) {
    if (!cycleNodes.has(orphan)) entryIds.add(orphan);
  }

  const childIdsByParent = new Map<string, string[]>();
  for (const arc of keptArcs) {
    if (!entryIds.has(arc.parent_id) || !entryIds.has(arc.child_id)) continue;
    const bucket = childIdsByParent.get(arc.parent_id);
    if (bucket) bucket.push(arc.child_id);
    else childIdsByParent.set(arc.parent_id, [arc.child_id]);
  }

  const nodesById: Record<string, SceneHierarchyNodeEntry> = {};
  for (const id of [...entryIds].sort(compareStrings)) {
    const keptArc = keptArcByChild.get(id);
    const parentId =
      keptArc && entryIds.has(keptArc.parent_id) ? keptArc.parent_id : null;
    const status = keptArc
      ? treeStatus(arcStatus(keptArc))
      : // Roots/orphans have no attaching arc: orphan keeps the tolerated
        // arc's status; plain roots default to the authoritative lane.
        (orphanStatusByChild.get(id) ?? "reference");
    nodesById[id] = {
      parent_id: parentId,
      child_ids: (childIdsByParent.get(id) ?? []).sort(compareStrings),
      level: index.ancestor_paths[id]?.length ?? 0,
      status,
      // D2: the entry key IS the raw registry id; repeated verbatim so each
      // entry is self-describing once detached from the map.
      registry_record_id: id,
    };
  }

  const rootIds = [...new Set([...index.root_ids, ...orphanIds])]
    .filter((id) => entryIds.has(id))
    .sort(compareStrings);

  overlayArcs.sort(
    (a, b) =>
      compareStrings(a.child_id, b.child_id) ||
      compareStrings(a.parent_id, b.parent_id) ||
      compareStrings(a.status, b.status),
  );

  return {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    relation_type: spec?.relation_type ?? arcs[0]!.type,
    kind: rootIds.length === 1 ? "tree" : "forest",
    root_ids: rootIds,
    max_depth: index.depth,
    nodes_by_id: nodesById,
    overlay_arcs: overlayArcs,
    orphan_ids: orphanIds,
    cycles: index.cycles,
    conflicts,
    dangling_arc_count: danglingArcCount,
  };
}
