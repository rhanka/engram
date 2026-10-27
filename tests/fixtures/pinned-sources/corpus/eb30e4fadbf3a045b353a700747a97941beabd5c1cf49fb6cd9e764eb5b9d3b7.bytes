import { aggregateTopLevel, packTopLevel } from './governance-summary.js';
import { routeScene } from './architecture-routing.js';
import { packGovernanceScene } from './governance-layout.js';
import preparedRoutes from './governance-routes.json' with { type: 'json' };

// Revisited mixed folds reuse exact geometry, without any eager route work.
const runtimeRoutes = new Map();

// Fold the responsibility tree, measuring visible content on both axes.
// Relations internal to a folded box disappear; external relations reach its border.
export function collapseGovernanceScene(scene, collapsedIds = [], usePrepared = true) {
  if (scene.id !== 'central' || !collapsedIds.length) return scene;
  const collapsed = new Set(collapsedIds);
  const originals = new Map([...scene.groups, ...scene.nodes].map(entry => [entry.id, entry]));
  const representative = id => {
    let visible = id;
    for (let parent = originals.get(id)?.parentId; parent; parent = originals.get(parent)?.parentId) {
      if (collapsed.has(parent)) visible = parent;
    }
    return visible;
  };
  const summary = scene.projectionKey === 'overview' && scene.groups.filter(g => !g.parentId).every(g => collapsed.has(g.id));
  const packed = summary ? packTopLevel(scene) : packGovernanceScene(scene, collapsedIds);
  const visibleGroups = packed.groups, nodes = packed.nodes;
  const projectedEdges = scene.edges.map(edge => ({
    ...edge, source: representative(edge.source), target: representative(edge.target),
    data: { labelFontSize: edge.data.labelFontSize, marker: edge.data.marker, pillLabel: edge.data.pillLabel },
  })).filter(edge => edge.source !== edge.target);
  const byEndpoints = new Map();
  for (const edge of projectedEdges) {
    const key = `${edge.source}:${edge.target}`;
    const aggregate = byEndpoints.get(key);
    const relation = { id: edge.id, label: edge.label };
    if (aggregate) {
      aggregate.data.relations.push(relation);
      aggregate.label = `${aggregate.data.relations.length} ${scene.language === 'en' ? 'links' : 'liaisons'}`;
    } else byEndpoints.set(key, { ...edge, data: { ...edge.data, relations: [relation] } });
  }
  const edges = summary ? aggregateTopLevel(scene) : [...byEndpoints.values()];
  const routeInput = { ...scene, groups: visibleGroups,
    nodes: [...nodes, ...visibleGroups.filter(group => group.collapsed)], edges };
  // As with expanded projections, common folds are prepared at build time.
  // Exact geometry guards the cache when card dimensions or routes change.
  const routingSignature = JSON.stringify([
    [...visibleGroups, ...nodes].map(entry => [entry.id, entry.parentId, entry.position.x, entry.position.y, entry.width, entry.height, entry.headerTextHeight, entry.collapsed]),
    edges.map(edge => [edge.id, edge.source, edge.target, edge.label, edge.class, edge.data.labelFontSize, edge.data.marker, edge.data.relations, edge.data.pillLabel]),
  ]);
  const prepared = usePrepared && ((preparedRoutes[scene.language ?? 'fr'] ?? preparedRoutes).folded?.find(entry => entry.signature === routingSignature)
    ?? runtimeRoutes.get(routingSignature));
  const routed = summary ? {...routeInput, edges:packed.edges}
    : prepared ? { ...routeInput, edges: prepared.edges } : routeScene(routeInput);
  if (usePrepared && !summary && !prepared) {
    if (runtimeRoutes.size === 32) runtimeRoutes.delete(runtimeRoutes.keys().next().value);
    runtimeRoutes.set(routingSignature, { edges: routed.edges });
  }
  return { ...routed, nodes, edges: routed.edges.map(edge => ({ ...edge,
    data: { ...edge.data, obstacleDetour: edge.type !== 'straight' } })), collapsedIds, routingSignature };
}
