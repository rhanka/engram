/**
 * Ontology increment A — profile-declared hierarchy artefacts.
 *
 * Compiles `hierarchies.json` (list of OntologyHierarchyArc) and
 * `hierarchy-index.json` (OntologyHierarchyIndex) from the hierarchy
 * declarations in a NormalizedOntologyProfile.
 *
 * Scope: DECLARATIVE path only (profile → artefact).  The derivation path
 * (reconciliation candidates → hierarchy arcs) is owned by the D1/D2
 * decisions and lives in ontology-reconciliation.ts / ontology-patch.ts —
 * those modules are NOT touched here.
 */

import type {
  NormalizedOntologyHierarchySpec,
  OntologyHierarchyArc,
  OntologyHierarchyIndex,
  RegistryRecord,
} from "./types.js";

// ---------------------------------------------------------------------------
// compileHierarchies
// ---------------------------------------------------------------------------

export interface CompileHierarchiesOptions {
  /** Normalized hierarchies from the profile (profile.hierarchies). */
  hierarchies: Record<string, NormalizedOntologyHierarchySpec>;
  /** Registry records keyed by registry id, as loaded from disk. */
  registries: Record<string, RegistryRecord[]>;
}

/**
 * Build the flat list of hierarchy arcs from profile-declared hierarchies.
 *
 * For each hierarchy spec, iterates over the bound registry rows and reads
 * `parent_column` / `child_column` from each raw record.  Records that
 * lack either column value are silently skipped (they represent roots or
 * orphaned leaves, which the index will surface via root_ids / depth).
 *
 * IDs used are the registry-native ids exactly as declared — no remapping
 * to canonical ids here (that would be decision D2).
 */
export function compileHierarchies(options: CompileHierarchiesOptions): OntologyHierarchyArc[] {
  const { registries } = options;
  const hierarchies = options.hierarchies ?? {};
  const arcs: OntologyHierarchyArc[] = [];

  for (const [hierarchyId, spec] of Object.entries(hierarchies)) {
    const records = registries[spec.registry] ?? [];
    for (const record of records) {
      const raw = record.raw;
      const parentValue = columnValue(raw, spec.parent_column);
      const childValue = columnValue(raw, spec.child_column);

      // A row contributes an arc only when BOTH parent and child are present.
      // Rows where child_column equals the row's own id_column value but
      // parent_column is blank are roots — they don't produce an arc.
      if (!parentValue || !childValue) continue;
      // Skip self-loops (id == parent means "this is a root" in some schemas)
      if (parentValue === childValue) continue;

      // Q3-1 — Arc↔scene-node join contract:
      //   parent_id and child_id are REGISTRY-NATIVE NODE IDS (the value of
      //   the id_column declared in the profile registry spec, e.g. process_id).
      //   They match the `id` field on the corresponding scene node in
      //   scene.json / graph.json.  The `code` field on a scene node is a
      //   SEPARATE display field (e.g. "AM-01-04" for node id "AM0104") and is
      //   NOT the join key.  Always join arcs to scene nodes by `id`, not `code`.
      arcs.push({
        hierarchy_id: hierarchyId,
        parent_id: parentValue,
        child_id: childValue,
        level: 0, // filled in by buildHierarchyIndex
        type: spec.relation_type,
        source: "profile",
        // Increment B (D1=1b): registry-bound arcs are deterministic structural
        // facts, so they are authoritative references with full confidence.
        status: "reference",
        confidence: 1.0,
      });
    }
  }

  return arcs;
}

function columnValue(raw: Record<string, unknown>, column: string): string {
  const v = raw[column];
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s;
}

// ---------------------------------------------------------------------------
// buildHierarchyIndex
// ---------------------------------------------------------------------------

/**
 * Build the OntologyHierarchyIndex from a flat list of arcs.
 *
 * Cycle detection: Tarjan-style DFS.  Any node whose ancestor path leads
 * back to itself is part of a cycle.  Cycles are reported in `cycles[]` and
 * the nodes involved are excluded from `ancestor_paths` and `root_ids`.
 *
 * Handles disconnected forests (multiple trees / multiple registries).
 */
export function buildHierarchyIndex(arcs: OntologyHierarchyArc[]): OntologyHierarchyIndex {
  if (arcs.length === 0) {
    return {
      schema: "graphify_ontology_hierarchies_v1",
      root_ids: [],
      depth: 0,
      ancestor_paths: {},
      cycles: [],
    };
  }

  // Build adjacency maps
  const childrenOf = new Map<string, Set<string>>();
  const parentsOf = new Map<string, Set<string>>();
  const allNodes = new Set<string>();

  for (const arc of arcs) {
    allNodes.add(arc.parent_id);
    allNodes.add(arc.child_id);
    if (!childrenOf.has(arc.parent_id)) childrenOf.set(arc.parent_id, new Set());
    childrenOf.get(arc.parent_id)!.add(arc.child_id);
    if (!parentsOf.has(arc.child_id)) parentsOf.set(arc.child_id, new Set());
    parentsOf.get(arc.child_id)!.add(arc.parent_id);
  }

  // Detect cycles via iterative DFS (Tarjan SCC condensed to cycle sets)
  const cycleNodes = new Set<string>();
  const cycles: string[][] = [];

  {
    const WHITE = 0, GREY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const n of allNodes) color.set(n, WHITE);

    // Stack-based DFS: each frame = [node, iterator over children, path]
    for (const start of allNodes) {
      if (color.get(start) !== WHITE) continue;
      // [node, childrenIterator, pathStack]
      const stack: Array<{ node: string; children: Iterator<string>; path: string[] }> = [];
      const pathSet = new Set<string>();

      color.set(start, GREY);
      pathSet.add(start);
      stack.push({
        node: start,
        children: (childrenOf.get(start) ?? new Set<string>()).values(),
        path: [start],
      });

      while (stack.length > 0) {
        // stack.length > 0 guarantees the element exists; non-null assertion is safe.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const frame = stack[stack.length - 1]!;
        const { done, value: child } = frame.children.next();
        if (done) {
          color.set(frame.node, BLACK);
          pathSet.delete(frame.node);
          stack.pop();
          continue;
        }
        const childColor = color.get(child) ?? WHITE;
        if (childColor === BLACK) continue;
        if (childColor === GREY) {
          // Back edge → cycle found
          const cycleStart = frame.path.indexOf(child);
          const cyclePath = frame.path.slice(cycleStart);
          cycles.push([...cyclePath, child]); // close the cycle
          for (const n of cyclePath) cycleNodes.add(n);
          cycleNodes.add(child);
          continue;
        }
        // WHITE — push new frame
        const newPath = [...frame.path, child];
        color.set(child, GREY);
        pathSet.add(child);
        stack.push({
          node: child,
          children: (childrenOf.get(child) ?? new Set<string>()).values(),
          path: newPath,
        });
      }
    }
  }

  // Compute root_ids (nodes with no parents, excluding cycle nodes)
  const root_ids: string[] = [];
  for (const node of allNodes) {
    if (cycleNodes.has(node)) continue;
    const parents = parentsOf.get(node);
    if (!parents || parents.size === 0) root_ids.push(node);
  }

  // BFS from roots to compute ancestor_paths and depth
  const ancestor_paths: Record<string, string[]> = {};
  let maxDepth = 0;

  for (const root of root_ids) {
    ancestor_paths[root] = [];
    const queue: Array<{ node: string; ancestors: string[] }> = [{ node: root, ancestors: [] }];
    const visited = new Set<string>([root]);

    while (queue.length > 0) {
      const { node, ancestors } = queue.shift()!;
      const depth = ancestors.length;
      if (depth > maxDepth) maxDepth = depth;

      const children = childrenOf.get(node);
      if (!children) continue;
      for (const child of children) {
        if (cycleNodes.has(child)) continue;
        if (visited.has(child)) continue;
        visited.add(child);
        const childAncestors = [...ancestors, node];
        ancestor_paths[child] = childAncestors;
        if (childAncestors.length > maxDepth) maxDepth = childAncestors.length;
        queue.push({ node: child, ancestors: childAncestors });
      }
    }
  }

  return {
    schema: "graphify_ontology_hierarchies_v1",
    root_ids: root_ids.sort(),
    depth: maxDepth,
    ancestor_paths,
    cycles,
  };
}
