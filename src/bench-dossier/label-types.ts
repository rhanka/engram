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
