/**
 * THE ontology tree of the left rail — one tree, built from the two artifacts
 * that describe an ontology:
 *
 *   - `class-hierarchies.json` (graphify_ontology_class_hierarchies_v1): the
 *     CLASS taxonomy. A class gathers node types (`member_node_types`) and may
 *     DECLARE that it owns a registry hierarchy (`member_hierarchies`).
 *   - `scene-hierarchies.json` (graphify_scene_hierarchies_v1): the registry
 *     FORESTS themselves (ABP / PROCESS_STD / org unit trees).
 *
 * The rail used to show these as two sibling accordions, which made a class
 * like `ABP` a node-type dead end while the real multi-level tree sat
 * elsewhere. Here the forest is SPLICED under the class that declares it, so
 * expanding `ABP` walks the actual `DE → DE.AI → DE.AI.01 → …` tree.
 *
 * Generic on purpose: nothing here knows about ABP/PROCESS_STD. Which class owns which
 * forest is declared by the repo's ontology profile and travels in the compiled
 * artifact. Two forests bound to one class stay TWO root sets — never merged.
 */

/** A taxonomy must cover this share of the scene's nodes to be trusted. */
export const TAXONOMY_MIN_COVERAGE = 0.5;

/**
 * Canonical first-level order (mirrors the verified native PROCESS_STD viewer
 * taxonomy). Roots not named here follow, ordered by label.
 */
export const CANONICAL_ROOT_ORDER = ["Process", "Tool", "Data", "Org"];

/**
 * Sum of live node counts for the DISTINCT `member_node_types` a hierarchy's
 * classes declare — i.e. how much of the scene that taxonomy actually covers.
 */
export function taxonomyCoveredCount(hierarchy, countByType) {
  const seen = new Set();
  let covered = 0;
  for (const cls of Object.values(hierarchy?.classes_by_id ?? {})) {
    for (const t of cls.member_node_types ?? []) {
      if (seen.has(t)) continue;
      seen.add(t);
      covered += countByType.get(t) ?? 0;
    }
  }
  return covered;
}

/**
 * Pick the FIRST VALID type-taxonomy by CONVENTION, not JSON object order.
 *
 * A `class-hierarchies.json` may carry several hierarchies, and a mis-built
 * bundle can even emit a registry PROCESS forest into that file. Rendering one
 * blindly is what produced the "Other 47575" bucket. So: prefer the
 * conventional `am_class_tree` id, then any other, but always gate on shape
 * (classes with member node types) AND coverage. Returns null ⇒ the caller
 * falls back to a flat type list.
 */
export function selectTaxonomyHierarchy(hierarchies, countByType, total) {
  if (!hierarchies || total <= 0) return null;
  const ids = Object.keys(hierarchies);
  const ordered = ids.includes("am_class_tree")
    ? ["am_class_tree", ...ids.filter((id) => id !== "am_class_tree")]
    : ids;
  for (const id of ordered) {
    const h = hierarchies[id];
    if (!h?.classes_by_id || !h.root_class_ids?.length) continue;
    const hasLeafTypes = Object.values(h.classes_by_id).some(
      (c) => (c.member_node_types?.length ?? 0) > 0,
    );
    if (!hasLeafTypes) continue;
    if (taxonomyCoveredCount(h, countByType) / total >= TAXONOMY_MIN_COVERAGE) return h;
  }
  return null;
}

/**
 * Normalize the scene-hierarchies sidecar into render-ready forest descriptors.
 * `labelFor` maps a hierarchy id to its display label (defaults to a
 * de-underscored key).
 */
export function buildForestList(sceneHierarchies) {
  const hs = sceneHierarchies?.hierarchies;
  if (!hs || typeof hs !== "object") return [];
  return Object.entries(hs).map(([key, h]) => ({
    key,
    label: key.replace(/_/g, " "),
    hierarchy: h,
    rootIds: Array.isArray(h?.root_ids) ? h.root_ids : [],
    nodeCount: h?.nodes_by_id ? Object.keys(h.nodes_by_id).length : 0,
    orphanCount: Array.isArray(h?.orphan_ids) ? h.orphan_ids.length : 0,
    danglingCount: typeof h?.dangling_arc_count === "number" ? h.dangling_arc_count : 0,
  }));
}

/**
 * Build the rail's single ontology tree.
 *
 * @param typeList  [{ key, count }] live node-type counts for the scene.
 * @param classHierarchies the parsed `class-hierarchies.json` (or null).
 * @param forestList the output of `buildForestList` (or []).
 * @returns an array of root class nodes
 *          `{ id, label, count, types[], forests[], subs[] }`,
 *          or null when no taxonomy is trustworthy (⇒ flat-list fallback).
 */
export function buildOntologyTree(typeList, classHierarchies, forestList = []) {
  const countByType = new Map(typeList.map((t) => [t.key, t.count]));
  const total = typeList.reduce((n, t) => n + t.count, 0);
  const h = selectTaxonomyHierarchy(classHierarchies?.hierarchies, countByType, total);
  if (!h) return null;

  const classes = h.classes_by_id;
  const labelOf = (id) => classes[id]?.label || String(id).replace(/^class:/, "");
  const forestFor = (key) => forestList.find((f) => f.key === key) ?? null;
  const seenTypes = new Set();
  const forestsUsed = new Set();
  // A compiled taxonomy is acyclic, but never trust an artifact enough to
  // recurse without a visited set.
  const walked = new Set();

  function buildClass(classId) {
    if (walked.has(classId)) return null;
    walked.add(classId);
    const cls = classes[classId];
    if (!cls) return null;
    const types = (cls.member_node_types ?? []).map((t) => {
      seenTypes.add(t);
      return { key: t, count: countByType.get(t) ?? 0 };
    });
    const forests = (cls.member_hierarchies ?? [])
      .map((key) => {
        const forest = forestFor(key);
        if (forest) forestsUsed.add(key);
        return forest;
      })
      .filter(Boolean);
    const subs = (cls.child_ids ?? []).map(buildClass).filter(Boolean);
    const count =
      types.reduce((n, t) => n + t.count, 0) + subs.reduce((n, s) => n + s.count, 0);
    return { id: classId, label: labelOf(classId), types, forests, subs, count };
  }

  const roots = (h.root_class_ids ?? [])
    .map(buildClass)
    // A class with nothing under it (no type, no forest, no populated child) is
    // noise, not navigation.
    .filter((d) => d && (d.types.length || d.forests.length || d.subs.length));

  roots.sort((a, b) => {
    const ia = CANONICAL_ROOT_ORDER.indexOf(a.label);
    const ib = CANONICAL_ROOT_ORDER.indexOf(b.label);
    const ra = ia < 0 ? CANONICAL_ROOT_ORDER.length : ia;
    const rb = ib < 0 ? CANONICAL_ROOT_ORDER.length : ib;
    return ra - rb || a.label.localeCompare(b.label);
  });

  // Types the taxonomy does not cover (and not synthetic class nodes) keep a
  // home so nothing disappears from the facet. With a full-coverage taxonomy
  // this bucket is EMPTY (no "Other 47575").
  const other = typeList.filter((t) => !seenTypes.has(t.key) && t.key !== "OntologyClass");
  if (other.length) {
    const types = other.map((t) => ({ key: t.key, count: t.count }));
    roots.push({
      id: "__other__",
      label: "Other",
      count: types.reduce((n, t) => n + t.count, 0),
      types,
      forests: [],
      subs: [],
    });
  }

  // A sidecar forest that NO class claims still belongs to this ontology: it
  // becomes a root class here rather than a second accordion, so the rail always
  // shows exactly ONE ontology tree.
  for (const forest of forestList.filter((f) => !forestsUsed.has(f.key))) {
    roots.push({
      id: `__hierarchy__:${forest.key}`,
      label: forest.label,
      count: forest.nodeCount,
      types: [],
      forests: [forest],
      subs: [],
    });
  }

  return roots;
}
