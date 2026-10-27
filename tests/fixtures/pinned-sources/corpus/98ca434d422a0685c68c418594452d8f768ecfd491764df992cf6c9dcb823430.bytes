import { groupContent, nodeContent, frameHeaderContent, CARD_WIDTH, CARD_STACK_GAP } from './architecture-layout.js';

// The owner-selected dossier card has one width in every frame and language.
export { CARD_WIDTH };
// Collapsed frames retain their approved footprint independently of leaf height.
export const COLLAPSED_CARD_HEIGHT = 272;
// Unrelated frames reserve 54 px on either side for routing and label pills.
const GAP = 160;
const PAD = 16;
const row = (...items) => ({ axis: 'x', items });
const column = (...items) => ({ axis: 'y', items });
const layouts = {
  h2a: row('h2a-roles', 'h2a-focus', 'h2a-track', 'h2a-agent'),
  surfaces: row('surf-ai', 'surf-cowork', 'surf-cli', 'surf-cloud'),
  'cluster-mesh': row(column('cm-apis', 'cm-workflow'), 'cm-catalog', 'cm-storage', 'cm-security', 'cm-cluster'),
  'cm-catalog': column('cat-mcp', row('cat-ai', 'cat-ui', 'cat-resources')),
  'cat-mcp': row('mcp-comments', 'mcp-tools', 'mcp-connectors'),
  'cm-storage': column('store-models', 'store-artifacts'),
  'cm-security': column('sec-access', 'sec-observe'),
  'cm-cluster': column('cluster-instances', 'cluster-infra'),
  engram: row('eng-memory', 'eng-ontologies'),
  'design-system': row('ds-annotations', 'ds-diagram', 'ds-dossier', 'ds-components'),
};

export function packGovernanceScene(scene, collapsedIds = []) {
  const collapsed = new Set(collapsedIds);
  const entries = new Map([...scene.groups, ...scene.nodes].map(entry => [entry.id, {
    ...entry, position: { x: 0, y: 0 }, ...(entry.data ? { data: { ...entry.data } } : {}),
  }]));
  for (const entry of entries.values()) if (entry.data) {
    entry.data.cardTier = 'service';
    entry.data.layoutWidth = CARD_WIDTH;
    delete entry.data.layoutHeight;
    const measured = nodeContent(entry.data);
    entry.width = measured.width; entry.height = measured.height; entry.data.text = measured.text;
  }
  const measure = layout => {
    if (typeof layout === 'string') {
      const entry = entries.get(layout);
      let content;
      if (!entry.data) {
        entry.collapsed = collapsed.has(entry.id);
        entry.headerOffset = 0;
        content = entry.collapsed ? null : measure(layouts[layout]);
        entry.width = content ? content.width + PAD * 2 : CARD_WIDTH;
        Object.assign(entry, groupContent(entry, entry.width, entry.collapsed));
        const header = frameHeaderContent(entry, entry.width);
        if (entry.collapsed || header.kicker) {
          Object.assign(entry, header);
          entry.headerHeight = header.headerTextHeight + (entry.collapsed ? 0 : 8);
        }
        entry.height = entry.collapsed ? COLLAPSED_CARD_HEIGHT : entry.headerHeight + content.height + PAD;
      }
      return {
        entry, content, width: entry.width, height: entry.height,
        place(x, y) {
          entry.position = { x, y };
          content?.place(x + PAD, y + entry.headerHeight);
        },
      };
    }
    const items = layout.items.map(measure), horizontal = layout.axis === 'x';
    if (horizontal) {
      const headers = items.filter(item => item.entry && !item.entry.data && !item.entry.collapsed);
      const height = Math.max(0, ...headers.map(item => item.entry.headerHeight));
      for (const item of headers) {
        const offset = height - item.entry.headerHeight;
        item.height = item.entry.height += offset;
        item.entry.headerOffset = offset;
        item.entry.headerHeight = height;
        item.entry.headerTextHeight += offset;
      }
    }
    const gaps = items.slice(1).map((item, i) => horizontal ? GAP : item.entry?.data && items[i].entry?.data ? CARD_STACK_GAP : GAP);
    const width = horizontal ? items.reduce((sum, item) => sum + item.width, 0) + GAP * (items.length - 1) : Math.max(...items.map(item => item.width));
    const height = horizontal ? Math.max(...items.map(item => item.height)) : items.reduce((sum, item) => sum + item.height, 0) + gaps.reduce((sum, gap) => sum + gap, 0);
    const result = {
      axis: layout.axis, width, height,
      place(x, y) {
        for (const [index, item] of items.entries()) {
          item.place(horizontal ? x : x + (width - item.width) / 2, y);
          if (horizontal) x += item.width + GAP;
          else y += item.height + (gaps[index] ?? 0);
        }
      },
    };
    return result;
  };
  measure(column(row('h2a', 'surfaces'), 'cluster-mesh', row('engram', 'design-system'))).place(0, 0);
  if (scene.groups.filter(group => !group.parentId).every(group => collapsed.has(group.id))) {
    const place = (id, x, y, w) => {
      const entry = entries.get(id);
      entry.width = w; entry.position = { x, y };
      Object.assign(entry, groupContent(entry, w, true), frameHeaderContent(entry, w));
      entry.height = COLLAPSED_CARD_HEIGHT;
      return entry;
    };
    const band = (ids, y, offset = 0) => {
      const items = ids.map((id, i) => place(id, offset + i * (CARD_WIDTH + GAP), y, CARD_WIDTH));
      const height = Math.max(...items.map(item => item.height));
      return y + height + GAP;
    };
    const y = band(['h2a', 'surfaces'], 0, (CARD_WIDTH + GAP) / 2);
    band(['engram', 'cluster-mesh', 'design-system'], y);
  }
  const visible = entry => {
    for (let parent = entry.parentId; parent; parent = entries.get(parent)?.parentId) if (collapsed.has(parent)) return false;
    return true;
  };
  for (const entry of entries.values()) if (entry.data) entry.data.layoutHeight = entry.height;
  return { ...scene,
    groups: scene.groups.map(group => entries.get(group.id)).filter(visible),
    nodes: scene.nodes.map(node => entries.get(node.id)).filter(visible),
  };
}
