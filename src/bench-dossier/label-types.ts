export interface LabelPointInput {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly color: string;
  readonly highlighted?: boolean;
  readonly radius?: number;
  readonly priority?: number;
}

export interface LabelPart {
  readonly text: string;
  readonly color: string;
  readonly highlighted: boolean;
}

export interface MergedLabelCluster {
  readonly clusterIndex: number;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly highlighted: boolean;
  readonly radius: number;
  readonly priority: number;
  readonly displayText: string;
  readonly parts: readonly LabelPart[];
  readonly tieCount: number;
  readonly tieFootnoteId: number | null;
  readonly tieNoteSuffix: string | null;
}

export interface LabelTieFootnote {
  readonly id: number;
  readonly tag: string;
  readonly names: readonly string[];
  readonly items: readonly LabelPart[];
  readonly text: string;
}

export interface LabelBox {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface LeaderSegment {
  readonly sx: number;
  readonly sy: number;
  readonly tx: number;
  readonly ty: number;
  readonly length: number;
}

export interface LabelLayout {
  readonly ml: number;
  readonly mt: number;
  readonly baseIw: number;
  readonly baseIh: number;
  readonly baseMr: number;
}

export interface GreedyCandidate {
  readonly box: LabelBox;
  readonly distance: number;
  readonly angleIndex: number;
  readonly cost: number;
  readonly leader: LeaderSegment | null;
}

export interface GreedySearchContext {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly width: number;
  readonly height: number;
  readonly ownMarkerIndex: number;
  readonly frame: LabelBox;
  readonly placedBoxes: readonly LabelBox[];
  readonly markerBoxes: readonly LabelBox[];
  readonly haloBoxes: readonly (LabelBox | null)[];
  readonly lineDots: readonly LabelBox[];
  readonly leaderDots: readonly LabelBox[];
}

export interface LabelObstacleInput {
  readonly x: number;
  readonly y: number;
  readonly radius?: number;
}

export interface LabelSegmentInput {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface PlaceLabelsInput {
  readonly layout: LabelLayout;
  readonly points: readonly LabelPointInput[];
  readonly fontSize?: number;
  readonly obstacles?: readonly LabelObstacleInput[];
  readonly segments?: readonly LabelSegmentInput[];
}
