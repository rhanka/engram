import layouts from './governance-summary-layouts.json' with {type:'json'};
// Labels name the dominant flow; membership is always derived from the graph.

export function aggregateTopLevel(scene) {
  const entries = new Map([...scene.groups, ...scene.nodes].map(entry => [entry.id, entry]));
  const root = id => { while (entries.get(id)?.parentId) id = entries.get(id).parentId; return id; };
  const aggregates = new Map();
  for (const relation of scene.detailedEdges ?? scene.edges) {
    const source = root(relation.source), target = root(relation.target);
    if (source === target) continue;
    const key = `${source}:${target}`;
    if (!aggregates.has(key)) aggregates.set(key, {
      id: `summary:${key}`, source, target,
      label: scene.summaryLabels?.[key] ?? relation.label,
      class: relation.class, data: { labelFontSize: 21, pillLabel: true, marker: true, summary: true, relations: [] },
    });
    aggregates.get(key).data.relations.push({ id: relation.id, source: relation.source, target: relation.target, label: relation.label });
  }
  return [...aggregates.values()];
}

export function packTopLevel(scene) {
  const layout = layouts[scene.language ?? 'fr'];
  if (!layout) throw new Error('Prepare the bundled ELK summary geometry before building.');
  return {...scene, nodes:[], groups:layout.groups, edges:layout.edges};
}
