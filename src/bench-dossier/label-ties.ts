import {
  failSvg,
  requireBool,
  requireFiniteNum,
  requireNonEmptyText,
  requirePlainObj,
  requirePositiveNum,
} from "./svg-tokens.js";
import type {
  LabelPointInput,
  LabelTieFootnote,
  MergedLabelCluster,
} from "./label-types.js";

export const DEFAULT_MARKER_RADIUS = 6;
export const LABEL_TIE_INLINE_CAP = 3;
export const LABEL_TIE_DELTA_PX = 1;

function parseLabelPoint(raw: LabelPointInput, index: number, pathPrefix: string) {
  const path = `${pathPrefix}[${index}]`;
  requirePlainObj(raw, path);
  return {
    index,
    x: requireFiniteNum(raw.x, `${path}.x`),
    y: requireFiniteNum(raw.y, `${path}.y`),
    text: requireNonEmptyText(raw.text, `${path}.text`),
    color: requireNonEmptyText(raw.color, `${path}.color`),
    highlighted: requireBool(
      raw.highlighted === undefined ? false : raw.highlighted,
      `${path}.highlighted`,
    ),
    radius: requirePositiveNum(
      raw.radius === undefined ? DEFAULT_MARKER_RADIUS : raw.radius,
      `${path}.radius`,
    ),
    priority: requireFiniteNum(raw.priority === undefined ? 0 : raw.priority, `${path}.priority`),
  };
}

/** Merge coincident points (|dx| < 1 && |dy| < 1), capping inline labels at 3 and emitting legend tie-notes. */
export function mergeCoincidentTies(
  points: readonly LabelPointInput[],
  path = "points",
): {
  readonly clusters: readonly MergedLabelCluster[];
  readonly tieFootnotes: readonly LabelTieFootnote[];
} {
  if (!Array.isArray(points)) {
    failSvg("NOT_ARRAY", path);
  }
  type ParsedPoint = ReturnType<typeof parseLabelPoint>;
  const groups: { readonly x: number; readonly y: number; readonly members: ParsedPoint[] }[] = [];
  for (let index = 0; index < points.length; index++) {
    const point = parseLabelPoint(points[index]!, index, path);
    const match = groups.find(
      (group) =>
        Math.abs(group.x - point.x) < LABEL_TIE_DELTA_PX
        && Math.abs(group.y - point.y) < LABEL_TIE_DELTA_PX,
    );
    if (match) {
      match.members.push(point);
    } else {
      groups.push({ x: point.x, y: point.y, members: [point] });
    }
  }
  const tieFootnotes: LabelTieFootnote[] = [];
  const clusters = groups.map((group, clusterIndex): MergedLabelCluster => {
    const ordered = [...group.members].sort(
      (left, right) =>
        (right.priority - left.priority)
        || (Number(right.highlighted) - Number(left.highlighted))
        || (left.index - right.index),
    );
    const parts = ordered.map(({ text, color, highlighted }) => ({ text, color, highlighted }));
    const tieCount = parts.length;
    const tieFootnoteId = tieCount > LABEL_TIE_INLINE_CAP ? tieFootnotes.length + 1 : null;
    const tieNoteSuffix = tieFootnoteId !== null ? ` (+${tieCount - 2} tied, see #${tieFootnoteId})` : null;
    const displayText = tieNoteSuffix !== null
      ? `${parts[0]!.text} / ${parts[1]!.text}${tieNoteSuffix}`
      : parts.map((part) => part.text).join(" / ");
    if (tieFootnoteId !== null) {
      const names = parts.map((part) => part.text);
      tieFootnotes.push({
        id: tieFootnoteId,
        tag: `#${tieFootnoteId}`,
        names,
        items: parts,
        text: `#${tieFootnoteId}: ${names.join(" / ")}`,
      });
    }
    return {
      clusterIndex,
      x: group.x,
      y: group.y,
      color: parts[0]!.color,
      highlighted: ordered.some((member) => member.highlighted),
      radius: Math.max(...ordered.map((member) => member.radius)),
      priority: Math.max(...ordered.map((member) => member.priority)),
      displayText,
      parts,
      tieCount,
      tieFootnoteId,
      tieNoteSuffix,
    };
  });
  return { clusters, tieFootnotes };
}
