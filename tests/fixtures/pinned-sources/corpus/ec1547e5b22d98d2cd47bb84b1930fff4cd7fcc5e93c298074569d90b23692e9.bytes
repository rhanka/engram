import { cardFontMetrics } from './governance-font-metrics.js';
// Shared by the live diagram and its SVG/geometry validator, in CSS pixels.
export const NODE_PADDING = 12;
export const NODE_TEXT_GAP = 4;
export const NODE_TEXT = {
  title: { size: 16, lineHeight: 20, weight: 700 },
  function: { size: 14, lineHeight: 18, weight: 650 },
  detail: { size: 14, lineHeight: 18, weight: 400 },
};
export const EDGE_LABEL_SIZE = 14;
export const MIN_DIAGRAM_ZOOM = 1;
export const PORT_SLOT_COUNT = 11; // Includes a true centre port.
// radar-immobilier fa8133c2, focus/scenes.js:13; reference CSS pixels (scale 1).
export const CARD_WIDTH = 460;
export const CARD_HEIGHT = 200;
export const CARD_STACK_GAP = 72;

const textWidths = new Map();
export function textWidth(text, size) {
  const key = `${size}\0${text}`;
  if (textWidths.has(key)) return textWidths.get(key);
  // Conservative sans-serif metrics; explicit wrapping is identical in HTML/SVG.
  const width = [...String(text)].reduce((width, char) => width + size * (
    /\s/.test(char) ? 0.34 : /[ilI.,:;'!|]/.test(char) ? 0.34
      : /[MW@%Œœ]/.test(char) ? 0.95 : 0.62
  ), 0);
  // Label fitting retries the same strings across ports and fold states.
  if (textWidths.size === 1024) textWidths.delete(textWidths.keys().next().value);
  textWidths.set(key, width);
  return width;
}

export function cardTextWidth(text, size, metric) {
  return [...text].reduce((sum, char) => sum + (cardFontMetrics[metric].widths[char] ?? .7) * size, 0) + 2;
}

export function wrapText(text, width, size, metric) {
  const lines = [];
  for (const word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    const candidate = lines.length ? `${lines.at(-1)} ${word}` : word;
    const measured = metric ? cardTextWidth(candidate, size, metric) : textWidth(candidate, size);
    if (lines.length && measured <= width) lines[lines.length - 1] = candidate;
    else lines.push(word);
  }
  return lines;
}

export function nodeContent(data) {
  const styles = nodeTextStyles(data);
  const naturalWidth = Math.max(...Object.entries(styles)
    .map(([key, style]) => textWidth(data[key] ?? '', style.size)));
  const width = data.cardIcon ? CARD_WIDTH : data.layoutWidth ?? Math.ceil(Math.max(248, Math.min(296, naturalWidth + NODE_PADDING * 2 + 2)));
  const text = Object.fromEntries(Object.entries(styles).map(([key, style]) => [
    key, wrapText(data[key], width - NODE_PADDING * 2 - 2 - (data.cardIcon && key === 'title' ? 66 : 0), style.size, data.cardIcon ? { title:'influenceTitle', function:'influenceBody', detail:'influenceDetail' }[key] : undefined),
  ]));
  if (data.cardIcon) return { width, height: CARD_HEIGHT, text };
  const blocks = Object.entries(styles).filter(([key]) => text[key].length);
  const height = NODE_PADDING * 2 + 2 + NODE_TEXT_GAP * (blocks.length - 1)
    + blocks.reduce((sum, [key, style]) => sum + text[key].length * style.lineHeight, 0);
  return { width, height: Math.max(height, data.layoutHeight ?? 0), text };
}

// Frame headings share the cards' SVG-unit scale and content flow.
export function frameHeaderContent(group, width) {
  const product = { h2a: 'H2A', 'cluster-mesh': 'SENTROPIC', engram: 'ENGRAM', 'design-system': 'DESIGN SYSTEM' }[group.id];
  const kicker = product ?? (group.id === 'surfaces'
    ? (group.title === 'Access surfaces' ? 'SENTROPIC & 3RD PARTIES' : 'SENTROPIC & TIERS')
    : /h2a/i.test(group.title) ? 'H2A' : /engram/i.test(group.title) ? 'ENGRAM'
      : /\bDS\b|design system/i.test(group.title) ? 'DESIGN SYSTEM' : 'SENTROPIC');
  const kickerLines = wrapText(kicker, width - 178, 22, 'body');
  const titleLines = wrapText(product ? group.title.replace(/^[^·]+ · /u, '') : group.title, width - 178, 32, 'title');
  // Match the cards' CSS line boxes, including Chromium's 1/64px layout grid.
  const kickerLineHeight = Math.floor(22 * 1.3 * 64) / 64;
  const titleLineHeight = Math.floor(32 * 1.3 * 64) / 64;
  const contentHeadHeight = Math.max(70, kickerLineHeight * kickerLines.length + titleLineHeight * titleLines.length);
  // Routing clearance stays independent of the rendered content flow.
  const slotKickerLines = wrapText(kicker, width - 178, 22 * 1.125, 'body');
  const slotTitleLines = wrapText(product ? group.title.replace(/^[^·]+ · /u, '') : group.title, width - 178, 32 * 1.125, 'title');
  const headHeight = Math.max(70, (22 * slotKickerLines.length + 32 * slotTitleLines.length) * 1.125 * 1.3);
  const subtitleLines = wrapText(group.subtitle, Math.min(width, CARD_WIDTH) - 26, 24, 'body');
  const slotSubtitleLines = wrapText(group.subtitle, Math.min(width, CARD_WIDTH) - 26, 24 * 1.125, 'body');
  // Chromium's embedded body font ends 8px below the subtitle baseline.
  const subtitleBottom = 16 + contentHeadHeight + 6 + 22 + (subtitleLines.length - 1) * 24 * 1.3 + 8;
  return { kicker, kickerLines, kickerLineHeight, titleLines, titleLineHeight, headHeight, contentHeadHeight, subtitleLines,
    headerTextHeight: group.collapsed
      ? Math.ceil(16 + headHeight + 6 + slotSubtitleLines.length * 24 * 1.125 * 1.3 + 16)
      : subtitleBottom + 4 + 8 };
}

export function groupContent(group, width, collapsed = false) {
  const title = group.title.replace(/ · (\p{Ll})/gu, (_, c) => ' · ' + c.toUpperCase());
  const header = frameHeaderContent({ ...group, title, collapsed }, width);
  return { title, ...header, headerHeight: header.headerTextHeight + (collapsed ? 0 : 8) };
}

export function nodeTextStyles(data) {
  const scale = data.fontScale ?? 1;
  return Object.fromEntries(Object.entries(NODE_TEXT).map(([key, style]) => [key, {
    ...style, size: Math.round(style.size * scale),
    lineHeight: scale > 1 ? Math.max(Math.round(style.lineHeight * scale), Math.ceil(Math.round(style.size * scale) * 1.4)) : style.lineHeight,
  }]));
}

export function labelSize(label, size = EDGE_LABEL_SIZE) {
  return { width: Math.ceil(Math.max(48, textWidth(label, size) + 16)), height: Math.max(24, size + 10) };
}

export function sceneFrame(scene) {
  const boxes = [
    ...(scene.groups ?? []).map(n => ({ left: n.position.x, top: n.position.y, right: n.position.x + n.width, bottom: n.position.y + n.height })),
    ...scene.nodes.map(n => ({ left: n.position.x, top: n.position.y, right: n.position.x + n.width, bottom: n.position.y + n.height })),
    ...scene.edges.map(e => e.data?.labelBox).filter(Boolean),
    ...scene.edges.flatMap(e => (e.data?.routedPoints ?? []).map(p => ({ left: p.x, top: p.y, right: p.x, bottom: p.y }))),
    ...(scene.bands ?? []).map(b => ({ left: b.x ?? 0, top: b.y - (b.fontSize ?? 16), right: (b.x ?? 0) + textWidth(b.title, b.fontSize ?? 16), bottom: b.y + 4 })),
  ];
  let left = Math.min(...boxes.map(b => b.left)) - 24;
  let top = Math.min(...boxes.map(b => b.top)) - 24;
  let width = Math.ceil(Math.max(...boxes.map(b => b.right)) - left + 24);
  let height = Math.ceil(Math.max(...boxes.map(b => b.bottom)) - top + 24);
  const allCollapsed = scene.id === 'central' && !scene.nodes.length
    && scene.groups.length && scene.groups.every(group => group.collapsed);
  if (!allCollapsed) {
    if (width / height < 16 / 9) { const next=height*16/9; left-=(next-width)/2; width=next; }
    else { const next=width*9/16; top-=(next-height)/2; height=next; }
  }
  return {
    left, top,
    width, height,
    viewport: { x: -left, y: -top, zoom: MIN_DIAGRAM_ZOOM },
  };
}
