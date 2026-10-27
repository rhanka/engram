import { labelSize, PORT_SLOT_COUNT, textWidth } from './architecture-layout.js';

// A 21px, one-line edge pill is 38px tall and needs 6px to the next card.
export const ROUTE_CLEARANCE = 28;
export const EDGE_LABEL_HEIGHT = 24;

const PORT_OFFSET = 28;
const EDGE_ROUTE_CLEARANCE = 6;
const EDGE_STROKE_PADDING = 2;
const OUTER_OFFSET = 44;
const TURN_PENALTY = 28;
const EPSILON = 0.001;

const dimensions = (node) => ({
  width: node.width ?? node.measured?.width ?? 230,
  height: node.height ?? node.measured?.height ?? 118,
});

export function nodeRect(node, padding = 0) {
  const { width, height } = dimensions(node);
  return {
    id: node.id,
    left: node.position.x - padding,
    right: node.position.x + width + padding,
    top: node.position.y - padding,
    bottom: node.position.y + height + padding,
  };
}

const center = (rect) => ({
  x: (rect.left + rect.right) / 2,
  y: (rect.top + rect.bottom) / 2,
});

function chooseSides(source, target, sidePorts = false) {
  const sourceCenter = center(source);
  const targetCenter = center(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (sidePorts) return dx >= 0
    ? { sourceSide: 'right', targetSide: 'left' }
    : { sourceSide: 'left', targetSide: 'right' };
  const horizontalGap = dx >= 0
    ? target.left - source.right
    : source.left - target.right;
  const verticalGap = dy >= 0
    ? target.top - source.bottom
    : source.top - target.bottom;

  if (Math.abs(dx) >= Math.abs(dy) || horizontalGap > verticalGap) {
    return dx >= 0
      ? { sourceSide: 'right', targetSide: 'left' }
      : { sourceSide: 'left', targetSide: 'right' };
  }

  return dy >= 0
    ? { sourceSide: 'bottom', targetSide: 'top' }
    : { sourceSide: 'top', targetSide: 'bottom' };
}

function handlePoint(rect, side, slot = Math.floor(PORT_SLOT_COUNT / 2)) {
  const fraction = (slot + 1) / (PORT_SLOT_COUNT + 1);
  if (side === 'left') return { x: rect.left, y: rect.top + (rect.bottom - rect.top) * fraction };
  if (side === 'right') return { x: rect.right, y: rect.top + (rect.bottom - rect.top) * fraction };
  if (side === 'top') return { x: rect.left + (rect.right - rect.left) * fraction, y: rect.top };
  return { x: rect.left + (rect.right - rect.left) * fraction, y: rect.bottom };
}

function offsetPoint(point, side, amount = PORT_OFFSET) {
  if (side === 'left') return { x: point.x - amount, y: point.y };
  if (side === 'right') return { x: point.x + amount, y: point.y };
  if (side === 'top') return { x: point.x, y: point.y - amount };
  return { x: point.x, y: point.y + amount };
}

function pointInsideRect(point, rect) {
  if (rect.parallelOnly) return false;
  return point.x > rect.left + EPSILON
    && point.x < rect.right - EPSILON
    && point.y > rect.top + EPSILON
    && point.y < rect.bottom - EPSILON;
}

export function segmentCrossesRect(a, b, rect) {
  if (rect.parallelOnly === 'vertical' && a.y === b.y) return false;
  if (rect.parallelOnly === 'horizontal' && a.x === b.x) return false;
  if (Math.abs(a.y - b.y) < EPSILON) {
    if (a.y <= rect.top + EPSILON || a.y >= rect.bottom - EPSILON) return false;
    const segmentLeft = Math.min(a.x, b.x);
    const segmentRight = Math.max(a.x, b.x);
    return Math.max(segmentLeft, rect.left) < Math.min(segmentRight, rect.right) - EPSILON;
  }

  if (Math.abs(a.x - b.x) < EPSILON) {
    if (a.x <= rect.left + EPSILON || a.x >= rect.right - EPSILON) return false;
    const segmentTop = Math.min(a.y, b.y);
    const segmentBottom = Math.max(a.y, b.y);
    return Math.max(segmentTop, rect.top) < Math.min(segmentBottom, rect.bottom) - EPSILON;
  }

  throw new Error('Architecture routes must remain orthogonal.');
}

const segmentIsClear = (a, b, obstacles) => (
  obstacles.every((rect) => !segmentCrossesRect(a, b, rect))
);

function simplify(points) {
  const unique = points.filter((point, index) => (
    index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y
  ));

  return unique.filter((point, index) => {
    if (index === 0 || index === unique.length - 1) return true;
    const previous = unique[index - 1];
    const next = unique[index + 1];
    return !(
      (previous.x === point.x && point.x === next.x)
      || (previous.y === point.y && point.y === next.y)
    );
  });
}

function buildVisibilityGraph(start, end, obstacles) {
  const xs = new Set([start.x, end.x]);
  const ys = new Set([start.y, end.y]);

  for (const rect of obstacles) {
    xs.add(rect.left);
    xs.add(rect.right);
    ys.add(rect.top);
    ys.add(rect.bottom);
  }

  const left = Math.min(...[...xs]) - OUTER_OFFSET;
  const right = Math.max(...[...xs]) + OUTER_OFFSET;
  const top = Math.min(...[...ys]) - OUTER_OFFSET;
  const bottom = Math.max(...[...ys]) + OUTER_OFFSET;
  xs.add(left);
  xs.add(right);
  ys.add(top);
  ys.add(bottom);

  const points = [], sortedYs = [...ys].sort((a, b) => a - b);
  const rows = sortedYs.map(() => []), columns = [];
  for (const x of [...xs].sort((a, b) => a - b)) {
    const column = obstacles.filter(rect => !rect.parallelOnly
      && x > rect.left + EPSILON && x < rect.right - EPSILON).sort((a, b) => a.top - b.top);
    const entries = [];
    columns.push(entries);
    let obstacleIndex = 0, blockedUntil = -Infinity;
    for (const [row, y] of sortedYs.entries()) {
      while (obstacleIndex < column.length && y > column[obstacleIndex].top + EPSILON) {
        blockedUntil = Math.max(blockedUntil, column[obstacleIndex++].bottom);
      }
      if (y < blockedUntil - EPSILON) continue;
      const point = { x, y, index: points.length };
      points.push(point); entries.push(point); rows[row].push(point);
    }
  }

  // Stable numeric identities avoid coordinate-string allocation in the grid
  // and every search relaxation; insertion and tie-breaking order stay intact.
  const neighbors = new Int32Array(points.length * 4).fill(-1);
  const connectAxis = (axis, crossAxis) => {
    for (const group of axis === 'x' ? rows : columns) {
      if (!group.length) continue;
      // Only rectangles crossing this scanline can block its segments.
      const coordinate = group[0][crossAxis];
      const lineObstacles = obstacles.filter(rect => axis === 'x'
      ? rect.parallelOnly !== 'vertical' && coordinate > rect.top + EPSILON && coordinate < rect.bottom - EPSILON
      : rect.parallelOnly !== 'horizontal' && coordinate > rect.left + EPSILON && coordinate < rect.right - EPSILON)
        .map(rect => axis === 'x' ? [rect.left, rect.right] : [rect.top, rect.bottom])
        .filter(([low, high]) => high - low > EPSILON).sort((a, b) => a[0] - b[0]);
      // Grid insertion already orders both scanline axes monotonically.
      // Sweep obstacle intervals once instead of testing every segment against
      // every rectangle. Preserve segmentCrossesRect's strict epsilon bounds.
      let obstacleIndex = 0, blockedUntil = -Infinity;
      const offset = axis === 'x' ? 0 : 2;
      for (let i = 1; i < group.length; i++) {
        const a = group[i - 1], b = group[i];
        while (obstacleIndex < lineObstacles.length && lineObstacles[obstacleIndex][0] < b[axis] - EPSILON) {
          blockedUntil = Math.max(blockedUntil, lineObstacles[obstacleIndex++][1]);
        }
        if (b[axis] - a[axis] > EPSILON && blockedUntil > a[axis] + EPSILON) continue;
        neighbors[a.index * 4 + offset + 1] = b.index;
        neighbors[b.index * 4 + offset] = a.index;
      }
    }
  };

  connectAxis('x', 'y');
  connectAxis('y', 'x');
  return { points, neighbors };
}

function shortestOrthogonalPath(start, end, obstacles) {
  const { points: grid, neighbors } = buildVisibilityGraph(start, end, obstacles);
  const startIndex = grid.findIndex(p => p.x === start.x && p.y === start.y);
  const targetIndex = grid.findIndex(p => p.x === end.x && p.y === end.y);
  const startState = startIndex * 3;
  const distances = new Float64Array(grid.length * 3).fill(Infinity);
  distances[startState] = 0;
  const previous = new Int32Array(grid.length * 3).fill(-1);
  // A binary min-heap avoids sorting the whole frontier for every grid point.
  // This matters when a fold introduces additional frame-avoidance corridors.
  const pending = [];
  const enqueue = item => {
    item.priority = item.cost + Math.abs(item.point.x - end.x) + Math.abs(item.point.y - end.y);
    pending.push(item);
    let i = pending.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pending[parent].priority <= item.priority) break;
      pending[i] = pending[parent]; i = parent;
    }
    pending[i] = item;
  };
  const dequeue = () => {
    const first = pending[0], last = pending.pop();
    if (pending.length) {
      let i = 0;
      while (i * 2 + 1 < pending.length) {
        let child = i * 2 + 1;
        if (child + 1 < pending.length && pending[child + 1].priority < pending[child].priority) child++;
        if (pending[child].priority >= last.priority) break;
        pending[i] = pending[child]; i = child;
      }
      pending[i] = last;
    }
    return first;
  };
  enqueue({ state: startState, point: grid[startIndex], cost: 0 });
  let winningState = null;

  while (pending.length > 0) {
    const current = dequeue();
    if (current.cost !== distances[current.state]) continue;
    if (current.point.index === targetIndex) {
      winningState = current.state;
      break;
    }

    // Compact adjacency retains left/right, then up/down insertion order.
    for (let i = 0; i < 4; i++) {
      const index = neighbors[current.point.index * 4 + i];
      if (index === -1) continue;
      const point = grid[index], direction = i < 2 ? 1 : 2;
      const distance = i < 2 ? Math.abs(point.x - current.point.x) : Math.abs(point.y - current.point.y);
      const turnCost = current.state % 3 !== 0 && current.state % 3 !== direction
        ? TURN_PENALTY
        : 0;
      const cost = current.cost + distance + turnCost;
      const state = index * 3 + direction;
      if (cost >= distances[state]) continue;
      distances[state] = cost;
      previous[state] = current.state;
      enqueue({ state, point, cost });
    }
  }

  if (winningState === null) {
    const outerY = Math.min(start.y, end.y, ...obstacles.map((rect) => rect.top)) - OUTER_OFFSET;
    return simplify([start, { x: start.x, y: outerY }, { x: end.x, y: outerY }, end]);
  }

  const points = [];
  let state = winningState;
  while (state !== -1) {
    const { x, y } = grid[Math.floor(state / 3)];
    points.push({ x, y });
    state = previous[state];
  }

  return simplify(points.reverse());
}

function edgeObstacleRects(edges) {
  return edges.flatMap((edge) => edgeSegments(edge).flatMap((segment, segmentIndex) => {
    // Distinct port slots leave enough room for incident edges; every routed
    // segment therefore remains a solid obstacle, including endpoint segments.
    const isHorizontal = Math.abs(segment.from.y - segment.to.y) < EPSILON;
    if (isHorizontal) {
      return {
        id: `edge-obstacle:${edge.id}:${segmentIndex}`,
        left: Math.min(segment.from.x, segment.to.x) - EDGE_ROUTE_CLEARANCE,
        right: Math.max(segment.from.x, segment.to.x) + EDGE_ROUTE_CLEARANCE,
        top: segment.from.y - EDGE_ROUTE_CLEARANCE,
        bottom: segment.from.y + EDGE_ROUTE_CLEARANCE,
      };
    }
    return {
      id: `edge-obstacle:${edge.id}:${segmentIndex}`,
      left: segment.from.x - EDGE_ROUTE_CLEARANCE,
      right: segment.from.x + EDGE_ROUTE_CLEARANCE,
      top: Math.min(segment.from.y, segment.to.y) - EDGE_ROUTE_CLEARANCE,
      bottom: Math.max(segment.from.y, segment.to.y) + EDGE_ROUTE_CLEARANCE,
    };
  }));
}

// Ports belong to a complete side bank, never to an individual routing attempt.
// L-R1: one connection uses the exact centre; multiple connections use an
// evenly spaced, symmetric bank. Sorting by the remote coordinate limits bends.
function allocatePorts(edges, nodes, sides) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const banks = new Map(), result = new Map();
  for (const edge of edges) for (const end of ['source', 'target']) {
    const side = sides.get(edge.id)[end + 'Side'], id = edge[end];
    const key = id + ':' + side;
    if (!banks.has(key)) banks.set(key, []);
    banks.get(key).push({edge, end, side, node:byId.get(id)});
  }
  for (const bank of banks.values()) {
    const {side, node} = bank[0], axis = ['left','right'].includes(side) ? 'y' : 'x';
    const direction = !node.collapsed && bank.every(({edge,end}) => sides.get(edge.id)[(end === 'source' ? 'target' : 'source') + 'Side'] === side) ? -1 : 1;
    bank.sort((a,b) => direction * (center(nodeRect(byId.get(a.edge[a.end === 'source' ? 'target' : 'source'])))[axis]
      - center(nodeRect(byId.get(b.edge[b.end === 'source' ? 'target' : 'source'])))[axis]) || a.edge.id.localeCompare(b.edge.id));
    const length = axis === 'y' ? node.height : node.width;
    const spacing = Math.min(64, length / (bank.length + 1));
    bank.forEach(({edge,end},rank) => {
      if (!result.has(edge.id)) result.set(edge.id, {...sides.get(edge.id)});
      result.get(edge.id)[end + 'Slot'] = 5 + (rank - (bank.length - 1)/2) * spacing * 12 / length;
    });
  }
  return result;
}

function sideChoices(edge, nodes) {
  const a = nodeRect(nodes.find(n=>n.id===edge.source)), b = nodeRect(nodes.find(n=>n.id===edge.target));
  const preferred = chooseSides(a,b,edge.data?.summary);
  if (edge.data?.summary) return [preferred];
  const horizontal = center(a).x <= center(b).x ? {sourceSide:'right',targetSide:'left'} : {sourceSide:'left',targetSide:'right'};
  const vertical = center(a).y <= center(b).y ? {sourceSide:'bottom',targetSide:'top'} : {sourceSide:'top',targetSide:'bottom'};
  return [
    ...(nodes.find(n=>n.id===edge.source).parentId !== nodes.find(n=>n.id===edge.target).parentId && center(a).y === center(b).y ? [{sourceSide:'bottom',targetSide:'bottom'}] : []),
    preferred, horizontal, vertical,
    ...['left','right','bottom','top'].flatMap(sourceSide=>['left','right','bottom','top'].map(targetSide=>({sourceSide,targetSide})))
  ].filter((p,i,all)=>all.findIndex(q=>q.sourceSide===p.sourceSide&&q.targetSide===p.targetSide)===i)
   .filter(p=>!(nodes.find(n=>n.id===edge.source).collapsed&&p.sourceSide==='top')
     && !(nodes.find(n=>n.id===edge.target).collapsed&&p.targetSide==='top'));
}

function frameObstacles(edge, nodes, groups) {
  // Expanded frames permit transit in card gutters, while headers stay solid.
  return groups.filter(group => !group.collapsed).map(group => (
    { id: `header:${group.id}`, left: group.position.x, right: group.position.x + group.width, top: group.position.y, bottom: group.position.y + (group.headerTextHeight ?? group.headerHeight ?? 66) }
  ));
}

function compactTop(node, groups) {
  return groups.some(g => !g.collapsed && node.parentId === g.id
    && Math.abs(node.position.y - g.position.y - g.headerTextHeight - 8) < .01);
}

export function routeEdge(edge, nodes, previousEdges = [], sceneEdges = [edge], groups = [], ports) {
  ports ??= allocatePorts(sceneEdges, nodes, new Map(sceneEdges.map(e => [e.id, sideChoices(e, nodes)[0]]))).get(edge.id);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sourceNode = nodeById.get(edge.source);
  const targetNode = nodeById.get(edge.target);
  if (!sourceNode || !targetNode) throw new Error(`Unknown route endpoint for edge ${edge.id}.`);

  const sourceRect = nodeRect(sourceNode);
  const targetRect = nodeRect(targetNode);
  const insetTop = node => compactTop(node, groups);
  const previousLabels = edge.data?.pillLabel ? placeLabels(previousEdges, nodes, groups) : [];
  const obstacles = [
    ...nodes.map(node => {
      const endpoint = node.id === sourceNode.id || node.id === targetNode.id;
      const rect = nodeRect(node, endpoint ? 0 : ROUTE_CLEARANCE);
      if (!endpoint && insetTop(node)) rect.top = node.position.y - 4;
      return rect;
    }),
    // A route may meet its endpoint normally, but may not skim any of its
    // four borders. Keep the same directional clearance as expanded frames.
    ...[sourceRect, targetRect].flatMap((r,i) => [
      ...[r.left,r.right].map(x => ({left:x-12,right:x+12,top:r.top,bottom:r.bottom,parallelOnly:'vertical'})),
      ...[r.top,r.bottom].map((y,side) => {
        const gap = side === 0 && insetTop(i ? targetNode : sourceNode) ? 4 : 12;
        return {left:r.left,right:r.right,top:y-gap,bottom:y+gap,parallelOnly:'horizontal'};
      }),
    ]),
    ...edgeObstacleRects(previousEdges),
    // Route around the occupied pill, not just around its carrier line.
    ...previousLabels.map(previous => previous.data.labelBox).filter(Boolean).map(rect => ({
      ...rect, left: rect.left - 6, right: rect.right + 6,
      top: rect.top - 6, bottom: rect.bottom + 6,
    })),
    ...frameObstacles(edge, nodes, groups),
    // A relation may cross a frame boundary perpendicularly, but must never
    // overlap its stroke. A 4px frame clearance leaves the compact inset usable.
    ...groups.filter(group => !group.collapsed && frameObstacles(edge, nodes, groups).some(rect => rect.id === `header:${group.id}`)).flatMap(group => {
      const r = nodeRect(group), gap = 4;
      return [
        ...[r.left, r.right].map(x => ({ left:x-gap, right:x+gap, top:r.top, bottom:r.bottom, parallelOnly:'vertical' })),
        ...[r.top, r.bottom].map(y => ({ left:r.left, right:r.right, top:y-gap, bottom:y+gap, parallelOnly:'horizontal' })),
      ];
    }),
  ];
  let selected = null;
  const {sourceSide, targetSide, sourceSlot, targetSlot} = ports;
  const sourceHandle = handlePoint(sourceRect, sourceSide, sourceSlot);
  const targetHandle = handlePoint(targetRect, targetSide, targetSlot);
  if ((sourceHandle.x === targetHandle.x || sourceHandle.y === targetHandle.y)
      && segmentIsClear(sourceHandle, targetHandle, obstacles)) {
    selected = {...ports, points:[sourceHandle,targetHandle]};
  }
  // Larger labels must fit the selected path, not merely its centreline.
  const labelFits = points => {
    if (!edge.data?.labelFontSize) return true;
    try {
      placeLabels([...previousEdges, { ...edge, data: { ...edge.data, routedPoints: points } }], nodes, groups);
      return true;
    } catch { return false; }
  };
  if (selected && !labelFits(selected.points)) selected = null;

  // Try inexpensive one/two-bend corridors across every port before building
  // a visibility grid. Most frame transitions have one such clear corridor.
  const cheapPaths = (start, end) => {
    const xs = new Set([start.x, end.x]), ys = new Set([start.y, end.y]);
    obstacles.forEach(r => { xs.add(r.left); xs.add(r.right); ys.add(r.top); ys.add(r.bottom); });
    const pillHeight = Math.ceil((edge.data?.labelFontSize ?? 14) * 1.3 + 10);
    for (const previous of previousLabels) {
      const r = previous.data.labelBox;
      if (r) { ys.add(r.top - pillHeight / 2 - 6); ys.add(r.bottom + pillHeight / 2 + 6); }
    }
    if (groups.some(g=>!g.collapsed)) for (const coordinates of [xs,ys]) {
      const sorted=[...coordinates].sort((a,b)=>a-b);
      sorted.slice(1).forEach((value,i)=>coordinates.add((value+sorted[i])/2));
    }
    return [
      ...[...xs].map(x => [start, {x, y:start.y}, {x, y:end.y}, end]),
      ...[...ys].map(y => [start, {x:start.x, y}, {x:end.x, y}, end]),
    ].map(simplify).sort((a,b) => {
      const cost = p => p.slice(1).reduce((n,q,i) => n + Math.abs(q.x-p[i].x) + Math.abs(q.y-p[i].y), p.length * TURN_PENALTY);
      return cost(a)-cost(b);
    });
  };
  for (const strategy of ['corridor', 'grid']) {
    if (selected) break;
    const start = offsetPoint(sourceHandle, sourceSide, sourceSide === 'top' && insetTop(sourceNode) ? 4 : PORT_OFFSET);
    const end = offsetPoint(targetHandle, targetSide, targetSide === 'top' && insetTop(targetNode) ? 4 : PORT_OFFSET);
    if (obstacles.some((rect) => pointInsideRect(start, rect) || pointInsideRect(end, rect))) continue;
    const paths = strategy === 'corridor' ? cheapPaths(start, end) : [shortestOrthogonalPath(start, end, obstacles)];
    for (const routed of paths) {
      const points = simplify([sourceHandle, ...routed, targetHandle]);
      const isClear = points.slice(1).every((point, index) => segmentIsClear(points[index], point, obstacles));
      if (!isClear || !labelFits(points)) continue;
      selected = { sourceSide, targetSide, sourceSlot, targetSlot, points };
      break;
    }
  }

  if (!selected) throw new Error(`No clear orthogonal route for edge ${edge.id}.`);

  return {
    ...edge,
    type: selected.points.length === 2 ? 'straight' : 'architecture',
    sourceHandle: `source-${selected.sourceSide}-${selected.sourceSlot}`,
    targetHandle: `target-${selected.targetSide}-${selected.targetSlot}`,
    data: {
      ...(edge.data ?? {}),
      routePoints: selected.points.slice(1, -1),
      routedPoints: selected.points,
      clearance: ROUTE_CLEARANCE,
      obstacleDetour: selected.points.length > 2,
    },
  };
}

export function edgeSegments(edge) {
  const points = edge.data?.routedPoints ?? [];
  return points.slice(1).map((point, index) => ({
    from: points[index],
    to: point,
  }));
}

export function labelDimensions(label = '', size) {
  return labelSize(label, size);
}

function rectsOverlap(a, b, padding = 0) {
  return a.left < b.right + padding
    && a.right > b.left - padding
    && a.top < b.bottom + padding
    && a.bottom > b.top - padding;
}

function boxAt(point, dimensions) {
  return {
    left: point.x - dimensions.width / 2,
    right: point.x + dimensions.width / 2,
    top: point.y - dimensions.height / 2,
    bottom: point.y + dimensions.height / 2,
  };
}

function closestPointOnBox(point, box) {
  return {
    x: Math.max(box.left, Math.min(box.right, point.x)),
    y: Math.max(box.top, Math.min(box.bottom, point.y)),
  };
}

function segmentLength(segment) {
  return Math.abs(segment.to.x - segment.from.x) + Math.abs(segment.to.y - segment.from.y);
}

function pathAnchor(edge, fraction) {
  const segments = edgeSegments(edge);
  const total = segments.reduce((sum, segment) => sum + segmentLength(segment), 0);
  let travelled = 0;
  const target = total * fraction;

  for (const segment of segments) {
    const length = segmentLength(segment);
    if (travelled + length >= target) {
      const ratio = length === 0 ? 0 : (target - travelled) / length;
      return {
        point: {
          x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
          y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
        },
        segment,
      };
    }
    travelled += length;
  }

  const segment = segments.at(-1);
  return { point: segment?.to ?? { x: 0, y: 0 }, segment };
}

function adjacentLabelCandidates(edge) {
  const dimensions = labelDimensions(edge.label, edge.data?.labelFontSize);
  const fractions = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8, 0.15, 0.85, 0.1, 0.9, 0.05, 0.95];
  const segments = edgeSegments(edge);
  const total = segments.reduce((sum, segment) => sum + segmentLength(segment), 0);
  let travelled = 0;
  for (const segment of segments) {
    fractions.push((travelled + segmentLength(segment) / 2) / total);
    travelled += segmentLength(segment);
  }
  const offsets = [4, 12]; // Keep labels attached to their edge; retry routing if needed.
  const candidates = [];

  for (const offset of offsets) {
    for (const fraction of fractions) {
      const { point: anchor, segment } = pathAnchor(edge, fraction);
      if (!segment) continue;
      if (Math.abs(segment.from.y - segment.to.y) < EPSILON) {
        candidates.push({ point: { x: anchor.x, y: anchor.y - offset - dimensions.height / 2 }, anchor, fraction, offset });
        candidates.push({ point: { x: anchor.x, y: anchor.y + offset + dimensions.height / 2 }, anchor, fraction, offset });
      } else {
        candidates.push({ point: { x: anchor.x - offset - dimensions.width / 2, y: anchor.y }, anchor, fraction, offset });
        candidates.push({ point: { x: anchor.x + offset + dimensions.width / 2, y: anchor.y }, anchor, fraction, offset });
      }
    }
  }
  return candidates;
}

function labelCandidates(edge, allowShift = false) {
  if (!edge.data?.pillLabel) return adjacentLabelCandidates(edge);
  const size = edge.data.labelFontSize ?? 14;
  const segments = edgeSegments(edge);
  const total = segments.reduce((sum, segment) => sum + segmentLength(segment), 0);
  let travelled = 0;
  const candidates = [];
  for (const segment of segments) {
    const length = segmentLength(segment);
    const horizontal = segment.from.y === segment.to.y;
    const point = { x: (segment.from.x + segment.to.x) / 2, y: (segment.from.y + segment.to.y) / 2 };
    for (const limit of [Infinity, 240, 180, 128, 104]) {
      const maxWidth = Math.min(limit, horizontal ? length - 24 : Infinity);
      if (maxWidth <= 24) continue;
      const lines = [];
      for (const word of edge.label.split(/\s+/)) {
        const candidate = lines.length ? `${lines.at(-1)} ${word}` : word;
        if (lines.length && labelDimensions(candidate, size).width <= maxWidth) lines[lines.length - 1] = candidate;
        else lines.push(word);
      }
      const dimensions = { width: Math.max(...lines.map(line => labelDimensions(line, size).width)), height: Math.ceil(lines.length * size * 1.3 + 10) };
      if (dimensions.width > maxWidth || (horizontal ? dimensions.width : dimensions.height) > length - 24) continue;
      for (const fraction of allowShift ? [.5,.25,.75] : [.5]) {
        const inset = (horizontal ? dimensions.width : dimensions.height) / 2 + 12;
        const offset = Math.max(inset,Math.min(length-inset,length*fraction)), ratio=offset/length;
        const anchor = fraction===.5 ? point : {x:segment.from.x+(segment.to.x-segment.from.x)*ratio,y:segment.from.y+(segment.to.y-segment.from.y)*ratio};
        candidates.push({ point:anchor, anchor, fraction: (travelled + offset) / total, offset: 0, segment, dimensions, lines });
      }
    }
    travelled += length;
  }
  return candidates.sort((a, b) => a.lines.length - b.lines.length || Math.abs(a.fraction - .5) - Math.abs(b.fraction - .5));
}

export function placeLabels(edges, nodes, groups = []) {
  const nodeBoxes = nodes.map((node) => nodeRect(node, 6));
  const roots = groups.filter(group => !group.parentId);
  const bounds = roots.length ? {
    left: Math.min(...roots.map(group => group.position.x)),
    right: Math.max(...roots.map(group => group.position.x + group.width)),
  } : null;
  const allSegments = edges.flatMap((edge) => edgeSegments(edge).map((segment) => ({
    ...segment,
    edgeId: edge.id,
  })));
  const placed = [];

  return edges.map((edge) => {
    if (!edge.label?.trim()) return edge;
    let dimensions = labelDimensions(edge.label, edge.data?.labelFontSize);
    const frames = frameObstacles(edge, nodes, groups);
    const placement = labelCandidates(edge,groups.some(g=>!g.collapsed)).find((candidate) => {
      const box = boxAt(candidate.point, candidate.dimensions ?? dimensions);
      if (bounds && groups.every(g=>g.collapsed) && (box.left < bounds.left || box.right > bounds.right)) return false;
      const strokePaddedBox = {
        left: box.left - 6,
        right: box.right + 6,
        top: box.top - 6,
        bottom: box.bottom + 6,
      };
      if (nodeBoxes.some((nodeBox) => rectsOverlap(box, nodeBox))) return false;
      if (frames.some(frame => rectsOverlap(box, frame, 4))) return false;
      // Keep labels out of the compact header-to-child inset.
      if (groups.some(g=>!g.collapsed && rectsOverlap(box, {
        ...nodeRect(g), bottom:g.position.y+g.headerTextHeight+8,
      },4))) return false;
      if (placed.some(({ box: placedBox }) => rectsOverlap(box, placedBox, 6))) return false;
      return allSegments.every((segment) => (
        (segment.edgeId === edge.id && (!edge.data?.pillLabel ||
          segment.from.x === candidate.segment.from.x && segment.from.y === candidate.segment.from.y &&
          segment.to.x === candidate.segment.to.x && segment.to.y === candidate.segment.to.y))
        || !segmentCrossesRect(segment.from, segment.to, strokePaddedBox)
      ));
    });

    if (!placement) throw new Error(`No clear label position near the route median for edge ${edge.id}.`);
    dimensions = placement.dimensions ?? dimensions;
    const point = placement.point;
    const box = boxAt(point, dimensions);
    // Keep the moved pill at an explicit carrier midpoint without adding a bend.
    const routedPoints = edge.data.routedPoints.flatMap((p,i,all)=>{
      const s=placement.segment, next=all[i+1];
      if(!s||!next||p.x!==s.from.x||p.y!==s.from.y||next.x!==s.to.x||next.y!==s.to.y)return [p];
      const distance=q=>Math.abs(point.x-q.x)+Math.abs(point.y-q.y);
      if(Math.abs(distance(p)-distance(next))<EPSILON)return [p];
      const end=distance(p)<distance(next)?p:next;
      return [p,{x:2*point.x-end.x,y:2*point.y-end.y}];
    });
    placed.push({ edgeId: edge.id, box });
    return {
      ...edge,
      data: {
        ...(edge.data ?? {}),
        labelPoint: point,
        labelBox: box,
        routedPoints, routePoints:routedPoints.slice(1,-1),
        ...(placement.lines ? { labelLines: placement.lines } : {}),
        labelAnchor: placement.anchor,
        labelEdgeFraction: placement.fraction,
        labelLeader: placement.offset > 64
          ? { from: placement.anchor, to: closestPointOnBox(placement.anchor, box) }
          : null,
      },
    };
  });
}

export function routeScene(scene) {
  const obstacleNodes = [...scene.nodes, ...(scene.bands ?? []).map((band, index) => ({
    id: `band:${index}`, position: { x: band.x ?? 0, y: band.y - (band.fontSize ?? 16) },
    width: textWidth(band.title, band.fontSize ?? 16), height: (band.fontSize ?? 16) + 4,
  }))];
  const degree = new Map(scene.nodes.map((node) => [node.id, 0]));
  const nodeById = new Map(scene.nodes.map((node) => [node.id, node]));
  for (const edge of scene.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const entries = scene.edges.map((edge, index) => {
    const sourceCenter = center(nodeRect(nodeById.get(edge.source)));
    const targetCenter = center(nodeRect(nodeById.get(edge.target)));
    return {
      edge,
      index,
      priority: (degree.get(edge.source) ?? 0) + (degree.get(edge.target) ?? 0),
      distance: Math.abs(sourceCenter.x - targetCenter.x) + Math.abs(sourceCenter.y - targetCenter.y),
    };
  });
  // Preserve clear aligned connections first. Other relations prefer unused
  // sides so they do not displace an otherwise straight centre-to-centre link.
  const aligned = new Set(), reserved = new Map();
  for (const edge of scene.edges) {
    const sides = sideChoices(edge, scene.nodes)[0];
    const from = handlePoint(nodeRect(nodeById.get(edge.source)), sides.sourceSide);
    const to = handlePoint(nodeRect(nodeById.get(edge.target)), sides.targetSide);
    if (sides.sourceSide !== sides.targetSide && (from.x === to.x || from.y === to.y) && segmentIsClear(from, to, [
      ...obstacleNodes.map(n => nodeRect(n)), ...frameObstacles(edge, scene.nodes, scene.groups ?? []),
    ])) {
      aligned.add(edge.id);
      reserved.set(`${edge.source}:${sides.sourceSide}`, edge.id);
      reserved.set(`${edge.target}:${sides.targetSide}`, edge.id);
    }
  }
  const priorityOrder = [...entries]
    .sort((a, b) => {
      return b.priority - a.priority || a.index - b.index;
    });
  const routingOrders = [
    [...entries].sort((a,b) => Number(aligned.has(b.edge.id))-Number(aligned.has(a.edge.id)) || a.distance-b.distance),
    [...entries].sort((a, b) => a.distance - b.distance || b.priority - a.priority || a.index - b.index),
    priorityOrder,
    [...entries].sort((a, b) => b.priority - a.priority || b.index - a.index),
    [...entries].sort((a, b) => b.distance - a.distance || b.priority - a.priority || a.index - b.index),
    [...entries].sort((a, b) => a.distance - b.distance || b.priority - a.priority || a.index - b.index),
    entries,
    [...entries].reverse(),
  ];
  for (let offset = 1; offset < entries.length; offset += 1) {
    routingOrders.push([...entries.slice(offset), ...entries.slice(0, offset)]);
  }
  const reversedEntries = [...entries].reverse();
  for (let offset = 1; offset < reversedEntries.length; offset += 1) {
    routingOrders.push([...reversedEntries.slice(offset), ...reversedEntries.slice(0, offset)]);
  }
  // Dense projections with larger labels can need a different port ordering.
  if (scene.id === 'central') {
    let seed = 17;
    for (let attempt = 0; attempt < 96; attempt += 1) {
      const order = [...entries];
      for (let i = order.length - 1; i > 0; i -= 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
      routingOrders.push(order);
    }
  }
  // Retrying a side plan often repeats the same routed prefix. Reuse both
  // successes and failures within this immutable scene, preserving route order.
  const routeAttempts = new Map();
  const attempted = new Set();
  let lastError = null;
  let promoted = 0;

  const choices = new Map(scene.edges.map(e=>[e.id,sideChoices(e,scene.nodes).filter(plan => {
    const headers = frameObstacles(e, scene.nodes, scene.groups ?? []);
    return ['source','target'].every(end => {
      const handle = handlePoint(nodeRect(nodeById.get(e[end])), plan[end+'Side']);
      const node = nodeById.get(e[end]), side = plan[end+'Side'];
      return segmentIsClear(handle, offsetPoint(handle, side, side === 'top' && compactTop(node, scene.groups ?? []) ? 4 : PORT_OFFSET), headers);
    });
  }).sort((a,b)=>{
    const penalty = p => ['source','target'].reduce((sum,end)=>{
      const owner=reserved.get(`${e[end]}:${p[end+'Side']}`);
      return sum + (owner && owner!==e.id ? 1 : 0);
    },0);
    return penalty(a)-penalty(b);
  })]));
  for (const routingOrder of routingOrders) {
    const signature = routingOrder.map(({ edge }) => edge.id).join('|');
    if (attempted.has(signature)) continue;
    attempted.add(signature);
    const choice = new Map(scene.edges.map(e=>[e.id,0]));
    let blocked;
    // A failed corridor changes the side plan, then reallocates EVERY affected
    // port. A route with a shifted or asymmetric bank is never returned.
    for (let attempt=0; attempt<scene.edges.length*16+1; attempt++) {
      const sides = new Map(scene.edges.map(e=>[e.id,choices.get(e.id)[choice.get(e.id)]]));
      const ports = allocatePorts(scene.edges,scene.nodes,sides);
      const routedEdges = [];
      let failed;
      try {
        for (const {edge} of routingOrder) {
          failed = edge.id;
          const key = JSON.stringify([edge.id, ports.get(edge.id),
            routedEdges.map(previous => [previous.id, previous.data.routedPoints])]);
          let result = routeAttempts.get(key);
          if (!result) {
            try { result = { edge: routeEdge(edge,obstacleNodes,routedEdges,scene.edges,scene.groups ?? [],ports.get(edge.id)) }; }
            catch (error) { result = { error }; }
            routeAttempts.set(key, result);
          }
          if (result.error) throw result.error;
          routedEdges.push(result.edge);
        }
        const routedById = new Map(routedEdges.map(e=>[e.id,e]));
        // Keep the validated incremental label order when frames are open.
        const labelOrder = scene.groups?.some(g=>!g.collapsed) ? routedEdges : scene.edges.map(e=>routedById.get(e.id));
        const placedById = new Map(placeLabels(labelOrder,obstacleNodes,scene.groups ?? []).map(e=>[e.id,e]));
        return {...scene,edges:scene.edges.map(e=>placedById.get(e.id))};
      } catch (error) { lastError=error; blocked=failed; }
      let index = routingOrder.findIndex(({edge})=>edge.id===failed);
      while (index >= 0 && choice.get(failed)+1 >= choices.get(failed).length) {
        choice.set(failed,0);
        failed = routingOrder[--index]?.edge.id;
      }
      if (index < 0) break;
      choice.set(failed,choice.get(failed)+1);
    }
    // Give a blocked relation its corridor before shorter routes enclose it.
    if (blocked && promoted++ < scene.edges.length * 2) {
      const next = [routingOrder.find(({edge})=>edge.id===blocked), ...routingOrder.filter(({edge})=>edge.id!==blocked)];
      routingOrders.splice(routingOrders.indexOf(routingOrder)+1,0,next);
    }
  }

  throw new Error(`No collision-free routing order for scene: ${lastError?.message ?? 'unknown error'}`);
}

export function routeAvoidsNodes(edge, nodes) {
  const points = edge.data?.routedPoints ?? [];
  const obstacles = nodes
    .filter((node) => node.id !== edge.source && node.id !== edge.target)
    .map((node) => nodeRect(node, ROUTE_CLEARANCE));

  for (let index = 1; index < points.length; index += 1) {
    if (!segmentIsClear(points[index - 1], points[index], obstacles)) return false;
  }
  return true;
}
