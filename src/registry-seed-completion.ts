/**
 * Registry-seed COMPLETION — deterministic, LLM-free repair of the
 * registry↔graph join.
 *
 * A profile `node_type` bound to a `registry:` declares that EVERY row of that
 * registry is an entity of the ontology. The extraction pipeline, however, only
 * materialises a registry record as a graph node when the corpus actually
 * MENTIONS it (the entity-linking seed path). Registries whose rows are mostly
 * unmentioned therefore land in the graph in a famished state:
 *
 *   aclp-processes      2282 rows → 2282 nodes  (every row is cited)
 *   business-objects     771 rows →  769 nodes
 *   abp-processes       2030 rows →  186 nodes  ← famished
 *   organization-units   471 rows →    0 nodes  ← absent
 *
 * That is invisible until something joins ON the registry ids. The
 * `engram_scene_hierarchies_v1` sidecar does exactly that (D2: arcs are keyed
 * by raw registry ids and pruned against the scene's `registry_record_id`s), so
 * an under-materialised registry silently collapses its whole forest into
 * `dangling_arc_count` — 1853 dropped ABP arcs, 468 dropped org arcs, an empty
 * `org_unit_tree`. The hierarchy is not wrong; the NODES it needs never existed.
 *
 * This module closes that gap at assembly time: given the loaded registries and
 * the graph's existing nodes, it returns the seed nodes for the rows that are
 * MISSING, shaped exactly like {@link registryRecordsToExtraction} output (same
 * `registry_<registry>_<id>` id scheme, same `status: "validated"`, same raw
 * payload). It is:
 *
 *   - PURE and deterministic — no I/O, no LLM, stable ordering (registry id,
 *     then record order), so two runs on the same inputs are byte-identical;
 *   - ADDITIVE ONLY — an existing node is NEVER touched, rewritten, or removed.
 *     A row is considered already materialised when either its canonical seed
 *     id or its (registry_id, registry_record_id) pair is already in the graph,
 *     so a node the pipeline seeded under the canonical id is matched exactly
 *     once and never duplicated;
 *   - LOSSLESS on the join key — `registry_record_id` carries the verbatim
 *     `id_column` value (D2), which is what the sidecar joins on.
 *
 * Completion is what makes the sidecar's pruning meaningful again: after it,
 * a `dangling_arc_count` is a REAL data defect rather than an artefact of
 * incomplete materialisation.
 */

import { registryRecordsToExtraction } from "./profile-registry.js";
import type {
  GraphNode,
  NormalizedOntologyProfile,
  RegistryRecord,
} from "./types.js";

/** Per-registry accounting of what completion found and added. */
export interface RegistrySeedCompletionStat {
  /** Rows in the registry. */
  total: number;
  /** Rows already present in the graph before completion. */
  existing: number;
  /** Rows materialised by this pass. */
  added: number;
}

export interface RegistrySeedCompletionResult {
  /** The seed nodes to APPEND to the graph, in deterministic order. */
  nodes: GraphNode[];
  /** Total number of appended nodes (== `nodes.length`). */
  added: number;
  /** Per-registry accounting, keyed by registry id. */
  byRegistry: Record<string, RegistrySeedCompletionStat>;
}

export interface CompleteRegistrySeedsOptions {
  /** Registry records already loaded (see `loadProfileRegistries`). */
  registries: Record<string, RegistryRecord[]>;
  /** The profile the seeds are stamped with. */
  profile: NormalizedOntologyProfile;
  /** The graph's CURRENT nodes. Never mutated. */
  graphNodes: readonly Pick<
    GraphNode,
    "id" | "registry_id" | "registry_record_id"
  >[];
  /**
   * Restrict completion to these registry ids. Omitted ⇒ every registry in
   * `registries` is completed. Useful to complete only the registries that back
   * a declared hierarchy.
   */
  onlyRegistries?: readonly string[];
}

/**
 * Separator for the composite (registry, record) key. A NUL cannot occur in a
 * registry id, so the two halves can never be confused; it is built via
 * fromCharCode rather than embedded literally so this file stays plain text
 * (a literal NUL makes git and grep treat the source as binary).
 */
const KEY_SEP = String.fromCharCode(0);

function pairKey(registryId: string, recordId: string): string {
  return `${registryId}${KEY_SEP}${recordId}`;
}

/**
 * Compute the registry seed nodes MISSING from a graph.
 *
 * Returns only the additions — the caller appends them (`graph.nodes.push(...)`)
 * and re-derives whatever it derives from the node set. Existing nodes are left
 * strictly untouched, so this is safe to run on an already-complete graph, where
 * it is a no-op returning `added: 0`.
 */
export function completeRegistrySeeds(
  options: CompleteRegistrySeedsOptions,
): RegistrySeedCompletionResult {
  const { registries, profile, graphNodes, onlyRegistries } = options;

  const wanted = onlyRegistries ? new Set(onlyRegistries) : null;
  const selected: Record<string, RegistryRecord[]> = {};
  for (const registryId of Object.keys(registries).sort()) {
    if (wanted && !wanted.has(registryId)) continue;
    // Non-null: the key comes from Object.keys of the same record.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    selected[registryId] = registries[registryId]!;
  }

  // Index the graph twice: by node id (the canonical seed id the pipeline uses)
  // and by (registry_id, registry_record_id) (a seed the pipeline materialised
  // under a different id, e.g. a semantic node later linked to the record).
  const existingIds = new Set<string>();
  const existingPairs = new Set<string>();
  for (const node of graphNodes) {
    existingIds.add(node.id);
    if (node.registry_id && node.registry_record_id) {
      existingPairs.add(pairKey(node.registry_id, node.registry_record_id));
    }
  }

  // Reuse the canonical seed shaping so a completed node is INDISTINGUISHABLE
  // from one the pipeline seeded itself (same id scheme, fields and payload).
  const candidates = registryRecordsToExtraction(selected, profile).nodes;

  const byRegistry: Record<string, RegistrySeedCompletionStat> = {};
  for (const [registryId, records] of Object.entries(selected)) {
    byRegistry[registryId] = { total: records.length, existing: 0, added: 0 };
  }

  const nodes: GraphNode[] = [];
  for (const candidate of candidates) {
    const registryId = candidate.registry_id;
    const recordId = candidate.registry_record_id;
    // registryRecordsToExtraction always stamps both on a registry seed; guard
    // defensively rather than assert, so a malformed spec cannot throw here.
    if (!registryId || !recordId) continue;
    const stat = byRegistry[registryId];
    const known =
      existingIds.has(candidate.id) || existingPairs.has(pairKey(registryId, recordId));
    if (known) {
      if (stat) stat.existing += 1;
      continue;
    }
    if (stat) stat.added += 1;
    // Claim the id so a duplicate row (defensive — loadProfileRegistry already
    // rejects duplicate ids) cannot be emitted twice.
    existingIds.add(candidate.id);
    existingPairs.add(pairKey(registryId, recordId));
    nodes.push(candidate);
  }

  return { nodes, added: nodes.length, byRegistry };
}

/**
 * Raw registry id → DISPLAY LABEL, for every loaded registry row that carries a
 * label distinct from its own id.
 *
 * The hierarchy sidecar renders tree ROWS keyed by raw registry id, and its
 * labels are normally harvested from the graph's nodes. That harvest is only as
 * good as the extraction: a registry whose rows were seeded before the source
 * carried human names materialises SELF-LABELLED nodes (`label === id`), and the
 * rail then shows nothing but bare codes (`AM0104`) forever — even after the
 * registry itself gained real names. The registry is the authority on what a
 * record is CALLED, so this index lets a consumer repair exactly those rows.
 *
 * Self-labelled rows are omitted: repeating the key as a label is noise, and
 * their absence is what makes "the graph label is only a code" detectable.
 * A row present in several registries resolves to the FIRST by sorted registry
 * id, so the index is single-valued and deterministic.
 */
export function registryDisplayLabels(
  registries: Record<string, readonly RegistryRecord[]>,
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const registryId of Object.keys(registries).sort()) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    for (const record of registries[registryId]!) {
      const label = typeof record.label === "string" ? record.label.trim() : "";
      if (!label || label === record.id) continue;
      if (!labels.has(record.id)) labels.set(record.id, label);
    }
  }
  return labels;
}

/**
 * The registry ids referenced by a profile's declared `hierarchies` block —
 * the registries whose completeness the hierarchy sidecar depends on.
 */
export function registriesBackingHierarchies(
  profile: Pick<NormalizedOntologyProfile, "hierarchies">,
): string[] {
  const specs = profile.hierarchies ?? {};
  const ids = new Set<string>();
  for (const spec of Object.values(specs)) {
    const registryId = (spec as { registry?: unknown }).registry;
    if (typeof registryId === "string" && registryId) ids.add(registryId);
  }
  return [...ids].sort();
}
