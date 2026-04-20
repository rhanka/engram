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

export type GraphifyPdfOcrMode = "off" | "auto" | "always" | "dry-run";
export type GraphifyLlmExecutionMode = "assistant" | "batch" | "mesh" | "off";
export type GraphifyImageArtifactSource = "ocr_crops" | "images" | "all";

export interface GraphifyProjectConfigProfile {
  path?: string;
}

export interface GraphifyProjectInputs {
  corpus?: string[];
  registries?: string[];
  generated?: string[];
  exclude?: string[];
}

export interface GraphifyImageAnalysisCalibrationPolicy {
  rules_path?: string;
  labels_path?: string;
}

export interface GraphifyImageAnalysisBatchPolicy {
  completion_window?: string;
  output_dir?: string;
}

export interface GraphifyImageAnalysisPolicy {
  enabled?: boolean;
  mode?: GraphifyLlmExecutionMode;
  artifact_source?: GraphifyImageArtifactSource;
  caption_schema?: string;
  routing_profile?: string;
  primary_model?: string;
  deep_model?: string;
  calibration?: GraphifyImageAnalysisCalibrationPolicy;
  max_markdown_context_chars?: number;
  batch?: GraphifyImageAnalysisBatchPolicy;
}

export interface GraphifyDataprepPolicy {
  pdf_ocr?: GraphifyPdfOcrMode;
  prefer_ocr_markdown?: boolean;
  use_extracted_pdf_images?: boolean;
  full_page_screenshot_vision?: boolean;
  citation_minimum?: "file" | "page" | "section" | "paragraph";
  preserve_source_structure?: boolean;
  image_analysis?: GraphifyImageAnalysisPolicy;
}

export interface GraphifyLlmExecutionTextJsonPolicy {
  model?: string;
}

export interface GraphifyLlmExecutionVisionJsonPolicy {
  primary_model?: string;
  deep_model?: string;
}

export interface GraphifyLlmExecutionBatchPolicy {
  provider?: string;
  completion_window?: string;
}

export interface GraphifyLlmExecutionMeshPolicy {
  adapter?: string;
}

export interface GraphifyLlmExecutionPolicy {
  mode?: GraphifyLlmExecutionMode;
  provider?: string;
  text_json?: GraphifyLlmExecutionTextJsonPolicy;
  vision_json?: GraphifyLlmExecutionVisionJsonPolicy;
  batch?: GraphifyLlmExecutionBatchPolicy;
  mesh?: GraphifyLlmExecutionMeshPolicy;
}

export interface GraphifyOutputPolicy {
  state_dir?: string;
  write_html?: boolean;
  write_wiki?: boolean;
  write_profile_report?: boolean;
}

export interface GraphifyProjectConfig {
  version?: number;
  profile?: GraphifyProjectConfigProfile;
  inputs?: GraphifyProjectInputs;
  dataprep?: GraphifyDataprepPolicy;
  llm_execution?: GraphifyLlmExecutionPolicy;
  outputs?: GraphifyOutputPolicy;
}

export interface NormalizedProjectProfile {
  path: string;
  resolvedPath: string;
}

export interface NormalizedProjectInputs {
  corpus: string[];
  registries: string[];
  registrySources: Record<string, string>;
  generated: string[];
  exclude: string[];
}

export interface NormalizedImageAnalysisCalibrationPolicy {
  rules_path: string | null;
  resolvedRulesPath: string | null;
  labels_path: string | null;
  resolvedLabelsPath: string | null;
}

export interface NormalizedImageAnalysisBatchPolicy {
  completion_window: string;
  output_dir: string;
}

export interface NormalizedImageAnalysisPolicy {
  enabled: boolean;
  mode: GraphifyLlmExecutionMode;
  artifact_source: GraphifyImageArtifactSource;
  caption_schema: string;
  routing_profile: string;
  primary_model: string | null;
  deep_model: string | null;
  calibration: NormalizedImageAnalysisCalibrationPolicy;
  max_markdown_context_chars: number;
  batch: NormalizedImageAnalysisBatchPolicy;
}

export interface NormalizedDataprepPolicy {
  pdf_ocr: GraphifyPdfOcrMode;
  prefer_ocr_markdown: boolean;
  use_extracted_pdf_images: boolean;
  full_page_screenshot_vision: boolean;
  citation_minimum: "file" | "page" | "section" | "paragraph";
  preserve_source_structure: boolean;
  image_analysis: NormalizedImageAnalysisPolicy;
}

export interface NormalizedLlmExecutionPolicy {
  mode: GraphifyLlmExecutionMode;
  provider: string | null;
  text_json: { model: string };
  vision_json: { primary_model: string; deep_model: string };
  batch: { provider: string; completion_window: string };
  mesh: { adapter: string };
}

export interface NormalizedOutputPolicy {
  state_dir: string;
  write_html: boolean;
  write_wiki: boolean;
  write_profile_report: boolean;
}

export interface NormalizedProjectConfig {
  version: number;
  sourcePath: string;
  configDir: string;
  profile: NormalizedProjectProfile;
  inputs: NormalizedProjectInputs;
  dataprep: NormalizedDataprepPolicy;
  llm_execution: NormalizedLlmExecutionPolicy;
  outputs: NormalizedOutputPolicy;
}

export interface ProjectConfigDiscoveryResult {
  found: boolean;
  path: string | null;
  searched: string[];
}

export interface ProjectConfigValidationIssue {
  path: string;
  message: string;
}

export type OntologyStatus =
  | "candidate"
  | "attached"
  | "needs_review"
  | "validated"
  | "rejected"
  | "superseded"
  | string;

export interface OntologyNodeType {
  aliases?: string[];
  registry?: string;
  source_backed?: boolean;
  status_policy?: string;
}

export interface OntologyRelationType {
  source?: string | string[];
  target?: string | string[];
  source_types?: string[];
  target_types?: string[];
}

export interface OntologyRegistrySpec {
  source?: string;
  id_column?: string;
  label_column?: string;
  alias_columns?: string[];
  node_type?: string;
  bound_source_path?: string;
}

export interface OntologyCitationPolicy {
  minimum_granularity?: "file" | "page" | "section" | "paragraph";
  require_source_file?: boolean;
  allow_bbox?: boolean | "when_available";
}

export interface OntologyHardeningPolicy {
  statuses?: OntologyStatus[];
  default_status?: OntologyStatus;
  promotion_requires?: string[];
}

export interface OntologyProfile {
  id?: string;
  version?: string | number;
  default_language?: string;
  sourcePath?: string;
  profile_hash?: string;
  node_types?: Record<string, OntologyNodeType>;
  relation_types?: Record<string, OntologyRelationType>;
  registries?: Record<string, OntologyRegistrySpec>;
  citation_policy?: OntologyCitationPolicy;
  hardening?: OntologyHardeningPolicy;
}

export interface NormalizedOntologyRelationType {
  source_types: string[];
  target_types: string[];
}

export interface NormalizedOntologyRegistrySpec {
  source: string;
  id_column: string;
  label_column: string;
  alias_columns: string[];
  node_type: string;
  bound_source_path?: string;
}

export interface NormalizedOntologyProfile {
  id: string;
  version: string;
  default_language: string;
  sourcePath?: string;
  profile_hash: string;
  node_types: Record<string, OntologyNodeType>;
  relation_types: Record<string, NormalizedOntologyRelationType>;
  registries: Record<string, NormalizedOntologyRegistrySpec>;
  citation_policy: Required<OntologyCitationPolicy>;
  hardening: Required<OntologyHardeningPolicy>;
}

export interface ProfileBinding {
  profile: NormalizedOntologyProfile;
  projectConfig: NormalizedProjectConfig;
}

export interface RegistryRecord {
  registryId: string;
  id: string;
  label: string;
  aliases: string[];
  nodeType: string;
  sourceFile: string;
  raw: Record<string, unknown>;
}
