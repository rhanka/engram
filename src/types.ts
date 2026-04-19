/** File type classification for corpus files. */
export enum FileType {
  CODE = "code",
  DOCUMENT = "document",
  PAPER = "paper",
  IMAGE = "image",
  VIDEO = "video",
}

/** Confidence level for extracted relationships. */
export type Confidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

/** A node in the knowledge graph. */
export interface GraphNode {
  id: string;
  label: string;
  file_type: "code" | "document" | "paper" | "image" | "rationale";
  source_file: string;
  source_location?: string;
  confidence?: Confidence;
  community?: number;
  [key: string]: unknown;
}

/** An edge in the knowledge graph. */
export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence: Confidence;
  source_file: string;
  source_location?: string;
  confidence_score?: number;
  weight?: number;
  /** Original source direction (preserved for display). */
  _src?: string;
  /** Original target direction (preserved for display). */
  _tgt?: string;
  [key: string]: unknown;
}

/** A hyperedge grouping multiple nodes. */
export interface Hyperedge {
  id: string;
  label: string;
  nodes: string[];
  relation: string;
  confidence: Confidence;
  source_file: string;
  confidence_score?: number;
  [key: string]: unknown;
}

/** Output of an extraction pass. */
export interface Extraction {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hyperedges?: Hyperedge[];
  input_tokens: number;
  output_tokens: number;
}

/** Output of the detect() function. */
export interface DetectionResult {
  files: Record<string, string[]>;
  total_files: number;
  total_words: number;
  needs_graph: boolean;
  warning: string | null;
  skipped_sensitive: string[];
  graphifyignore_patterns: number;
  /** Present in incremental mode. */
  incremental?: boolean;
  new_files?: Record<string, string[]>;
  unchanged_files?: Record<string, string[]>;
  new_total?: number;
  deleted_files?: string[];
}

/** A god node (most connected entity). */
export interface GodNodeEntry {
  id: string;
  label: string;
  edges: number;
  degree?: number;
}

/** A surprising connection. */
export interface SurpriseEntry {
  source: string;
  target: string;
  source_files: [string, string];
  confidence: Confidence;
  relation: string;
  note?: string;
  why?: string;
  confidence_score?: number;
}

/** A suggested question. */
export interface SuggestedQuestion {
  type: string;
  question: string | null;
  why: string;
}

/** Benchmark result. */
export interface BenchmarkResult {
  corpus_tokens?: number;
  corpus_words?: number;
  nodes?: number;
  edges?: number;
  avg_query_tokens?: number;
  reduction_ratio?: number;
  per_question?: Array<{ question: string; query_tokens: number; reduction: number }>;
  error?: string;
}

/** Graph diff between two snapshots. */
export interface GraphDiffResult {
  new_nodes: Array<{ id: string; label: string }>;
  removed_nodes: Array<{ id: string; label: string }>;
  new_edges: Array<{ source: string; target: string; relation: string; confidence: string }>;
  removed_edges: Array<{ source: string; target: string; relation: string; confidence: string }>;
  summary: string;
}

/** Platform configuration for skill installation. */
export interface PlatformConfig {
  skill_file: string;
  skill_dst: string;
  claude_md: boolean;
}
