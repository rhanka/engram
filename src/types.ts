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

export type GraphifyInputScopeMode = "auto" | "committed" | "tracked" | "all";

export type GraphifyResolvedInputScopeMode = Exclude<GraphifyInputScopeMode, "auto">;

export type InputScopeSource = "cli" | "config" | "configured-default" | "default-auto";

export interface InputScopeInspection {
  requested_mode: GraphifyInputScopeMode;
  resolved_mode: GraphifyResolvedInputScopeMode;
  source: InputScopeSource;
  root: string;
  git_root?: string;
  head?: string;
  candidate_count: number | null;
  included_count: number | null;
  excluded_untracked_count: number;
  excluded_ignored_count: number;
  excluded_sensitive_count: number;
  missing_committed_count: number;
  warnings: string[];
  recommendation: string | null;
}

export interface GitDetectionWindow {
  source_owner: "git";
  source_hash: string;
  branches: string[];
  max_commits: number;
  active_within_days: number;
  since_days?: number;
}

/** A node in the knowledge graph. */
export interface GraphNode {
  id: string;
  label: string;
  // "doc_ref": architecture-decision references (ADR-NNNN / RFC NNNN) cited
  // from code comments — port of upstream safishamsi 6d3a6f1.
  file_type: "code" | "document" | "paper" | "image" | "concept" | "rationale" | "doc_ref";
  source_file: string;
  source_location?: string;
  confidence?: Confidence;
  community?: number;
  node_type?: string;
  registry_id?: string;
  registry_record_id?: string;
  registry_partition?: string;
  registry_refs?: string[];
  aliases?: string[];
  status?: OntologyStatus;
  previous_status?: OntologyStatus;
  review_status?: OntologyStatus;
  citations?: OntologyCitation[];
  /**
   * True number of distinct citations for this entity across the whole corpus
   * (size of the deduped union). Degree-independent "cited N times" signal,
   * authoritative even when the inline `citations` set is trimmed to the
   * deterministic top-K. Populated by the pre-toJson aggregation pass; the full
   * list beyond K lives in the co-derived `citations.json`. Additive/optional.
   */
  citation_count?: number;
  evidence_refs?: string[];
  confidence_handle?: string;
  provenance_handle?: string;
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
  status?: OntologyStatus;
  review_status?: OntologyStatus;
  assertion_basis?: string | string[];
  derivation_method?: string;
  evidence_refs?: string[];
  citations?: OntologyCitation[];
  evidence_text?: string;
  confidence_handle?: string;
  provenance_handle?: string;
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

/** Origin metadata for an externally produced extraction fragment. */
export interface ExtractionProvenance {
  source_owner: string;
  source_id: string;
  observed_at: string;
  source_hash: string;
  adapter_version: string;
  ttl?: string;
}

/** Output of an extraction pass. */
export interface Extraction {
  provenance?: ExtractionProvenance;
  nodes: GraphNode[];
  edges: GraphEdge[];
  hyperedges?: Hyperedge[];
  canonical_entities?: OntologyCanonicalEntity[];
  mentions?: OntologyMention[];
  occurrences?: OntologyOccurrence[];
  evidence?: OntologyEvidenceRecord[];
  mappings?: OntologyMapping[];
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
  git?: GitDetectionWindow;
  /** Present in incremental mode. */
  incremental?: boolean;
  new_files?: Record<string, string[]>;
  unchanged_files?: Record<string, string[]>;
  new_total?: number;
  deleted_files?: string[];
  scope?: InputScopeInspection;
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
export type GraphifyLlmExecutionMode = "assistant" | "direct" | "batch" | "mesh" | "off";
export type GraphifyImageArtifactSource = "ocr_crops" | "images" | "all";

export interface GraphifyProjectConfigProfile {
  path?: string;
}

export interface GraphifyProjectInputs {
  corpus?: string[];
  scope?: GraphifyInputScopeMode;
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
  write_wiki?: boolean;
  write_profile_report?: boolean;
  ontology?: GraphifyProjectOntologyOutputPolicy;
}

export interface GraphifyProjectOntologyOutputPolicy {
  reconciliation?: GraphifyProjectOntologyReconciliationPolicy;
}

export interface GraphifyProjectOntologyReconciliationPolicy {
  decisions_path?: string;
  patches_path?: string;
}

export interface GraphifyStorageMirrorConfig {
  backend: string;
  uri?: string;
  user?: string;
  database?: string;
  project?: string;
  instance?: string;
  mode?: "merge" | "replace";
  namespace?: string;
  autoPush?: boolean;
  /** SQL schema/keyspace the mirror writes into (non-secret). */
  schema?: string;
  /** Whether to require TLS on the SQL connection (non-secret). */
  ssl?: boolean;
  /** Project/tenant slug for multi-tenant deployments (non-secret). */
  citySlug?: string;
  /** Embedding config for vector-capable backends (non-secret; API key stays env-only). */
  embedding?: {
    provider?: string;
    model?: string;
    dimension?: number;
  };
}

export interface GraphifyStorageConfig {
  mirrors?: GraphifyStorageMirrorConfig[];
}

export interface GraphifyProjectConfig {
  version?: number;
  profile?: GraphifyProjectConfigProfile;
  inputs?: GraphifyProjectInputs;
  dataprep?: GraphifyDataprepPolicy;
  llm_execution?: GraphifyLlmExecutionPolicy;
  outputs?: GraphifyOutputPolicy;
  storage?: GraphifyStorageConfig;
}

export interface NormalizedStorageMirrorConfig {
  backend: string;
  uri?: string;
  user?: string;
  database?: string;
  project?: string;
  instance?: string;
  mode: "merge" | "replace";
  namespace?: string;
  autoPush: boolean;
  /** SQL schema/keyspace the mirror writes into (non-secret). */
  schema?: string;
  /** Whether to require TLS on the SQL connection (non-secret). */
  ssl?: boolean;
  /** Project/tenant slug for multi-tenant deployments (non-secret). */
  citySlug?: string;
  /** Embedding config for vector-capable backends (non-secret; API key stays env-only). */
  embedding?: {
    provider?: string;
    model?: string;
    dimension?: number;
  };
}

export interface NormalizedStorageConfig {
  mirrors: NormalizedStorageMirrorConfig[];
}

export interface NormalizedProjectProfile {
  path: string;
  resolvedPath: string;
}

export interface NormalizedProjectInputs {
  corpus: string[];
  scope: GraphifyInputScopeMode;
  scope_source: Extract<InputScopeSource, "config" | "configured-default">;
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
}

export interface NormalizedOutputPolicy {
  state_dir: string;
  write_wiki: boolean;
  write_profile_report: boolean;
  ontology: NormalizedProjectOntologyOutputPolicy;
}

export interface NormalizedProjectOntologyOutputPolicy {
  reconciliation: NormalizedProjectOntologyReconciliationPolicy;
}

export interface NormalizedProjectOntologyReconciliationPolicy {
  decisions_path: string | null;
  patches_path: string | null;
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
  storage?: NormalizedStorageConfig;
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

/**
 * Ontology lifecycle status vocabulary.
 *
 * Increment B (ACLP-AM) introduces the 5-state hierarchy-arc lifecycle:
 *   reference  — registry-bound authoritative fact (confidence 1.0).
 *                Produced in v1 for every `source:"profile"` arc under D1=1b.
 *   validated  — human-accepted (e.g. a reviewer confirmed an extracted arc).
 *   candidate  — awaiting review.
 *   proposed   — system-suggested, not yet triaged.
 *   inferred   — low-confidence derived arc.
 *
 * NOTE: candidate / validated / proposed / inferred are RESERVED for the
 * future `source:"extracted"` lane (LLM-extracted arcs, v2) and are NOT
 * produced in v1 — only `reference` is emitted by compileHierarchies().
 *
 * The legacy values (attached / needs_review / rejected / superseded) remain
 * for backward compatibility with existing entity/mapping review flows.
 */
export type OntologyStatus =
  | "inferred"
  | "proposed"
  | "guessed"
  | "candidate"
  | "validated"
  | "reference"
  | "attached"
  | "needs_review"
  | "rejected"
  | "superseded"
  | string;

/**
 * Grounding confidence of a citation's `quote`/locator. `EXTRACTED` = the quote
 * is a verified verbatim substring of the source text matched on a real term;
 * `INFERRED` = a weaker, context-derived grounding (e.g. an image's surrounding
 * prose, a description/rationale fallback). The viewer / `assertion_basis`
 * legend can flag `INFERRED` grounding visually. A bare string union (not the
 * `Confidence` enum) so it can ride on a citation independently of the
 * relationship-confidence taxonomy.
 */
export type CitationConfidence = "EXTRACTED" | "INFERRED";

export type CitationModality = "markdown" | "pdf" | "docx" | "pptx" | "image" | "plain-text" | "csv" | "web";

export interface CitedSourceRef {
  /** Content-addressed document hash, without a sha256: prefix when exchanged with Radar. */
  docSha?: string;
  /** Object-store/CAS key (for example raw/proces-verbaux-<city>/cas/<sha>.pdf). */
  rawRef?: string;
  sourceUrl?: string;
  /**
   * Source modality. Drives modality-aware completeness validation: `page` is the
   * required anchor for page-addressable modalities (pdf, pptx, image), whereas
   * markdown/plain-text/csv/web/docx are anchored by `section`/`paragraph_id`
   * instead. When absent the validator derives it from the locator suffix and
   * otherwise falls back to the lenient (non-page) path.
   */
  modality?: CitationModality;
  /** 1-based source page number. Required anchor for page-addressable modalities. */
  page?: number;
  /** Section / heading anchor for non-page modalities (markdown, plain-text, web, docx). */
  section?: string;
  /** Paragraph / text-frame / CSV-row id anchor for non-page modalities. */
  paragraph_id?: string;
  /** Normalized top-left page fractions [x0,y0,x1,y1], when available (pdf/image/pptx). */
  bbox?: [number, number, number, number];
  /** Verbatim evidence text used for text-match fallback when bbox is absent. */
  excerpt?: string;
  citation?: string;
  publishedAt?: string;
  meetingDate?: string;
  quoteSpan?: [number, number];
}

export interface OntologyCitation {
  source_file: string;
  source_url?: string;
  /** Radar/raw-store compatible object reference for source viewers. */
  rawRef?: string;
  /** Content-addressed document hash, without a sha256: prefix when exchanged with Radar. */
  docSha?: string;
  /** Public/source URL alias used by Radar DTOs; mirrors source_url when both are present. */
  sourceUrl?: string;
  page?: number | string;
  section?: string;
  paragraph_id?: string;
  figure_id?: string;
  bbox?: [number, number, number, number];
  /** Canonical normalized overlay rectangle. For Radar PDF this is [x0,y0,x1,y1] page fractions. */
  region?: [number, number, number, number];
  /** Explicit source modality for viewer routing; otherwise consumers derive it from the source. */
  modality?: CitationModality;
  /** Optional excerpt alias for Radar/text-match consumers; quote remains the graphify canonical text. */
  excerpt?: string;
  /** Optional source-text span for consumers that can map quote offsets back to layout. */
  quoteSpan?: [number, number];
  /**
   * Human-readable, modality-encoded locator string (WP #24). The display form
   * the studio shows next to a quote: `"p.12 · Section"` for OCR-markdown,
   * `"p.12"` for native PDF, the chapter/story name for plain text. The
   * structured `page`/`section` fields remain the machine locators; this is the
   * pre-rendered display string ia-aero's `ground.py` already emits. Optional,
   * NOT part of the identity key. (Mirrors `GraphNode.source_location`.)
   */
  source_location?: string;
  /**
   * Verbatim passage from the source that grounds this citation. First-class
   * optional field (WP #24): de-facto present in production already — carried by
   * `OntologyEvidenceRecord`, the mystery `citations.json` sidecar, and consumed
   * by the studio EntityPanel + the describe grounding path
   * (`collectCitationContext` reads `quote ?? text ?? snippet`) — the type
   * omission was an inconsistency. NEVER part of the citation identity key
   * (`source_file|page|section|paragraph_id`): two citations to the same locator
   * with different quotes still dedupe to one. Backward-compatible.
   */
  quote?: string;
  /**
   * Grounding confidence for the `quote`. WP #24 first-class optional field,
   * symmetric to `OntologyEvidenceRecord.confidence`. Not part of the identity
   * key. Recorded, not hidden, so weaker (INFERRED) grounding is visible.
   */
  confidence?: CitationConfidence;
}

export interface OntologyEvidenceRecord {
  id: string;
  source_file?: string;
  source_url?: string;
  citations?: OntologyCitation[];
  quote?: string;
  page?: number | string;
  section?: string;
  paragraph_id?: string;
  figure_id?: string;
  bbox?: [number, number, number, number];
  confidence?: number;
  provenance_handle?: string;
  [key: string]: unknown;
}

export interface OntologyCanonicalEntity {
  id: string;
  type?: string;
  label: string;
  aliases?: string[];
  status?: OntologyStatus;
  review_status?: OntologyStatus;
  registry_refs?: string[];
  evidence_refs?: string[];
  confidence?: number;
  confidence_handle?: string;
  provenance_handle?: string;
  [key: string]: unknown;
}

export interface OntologyMention {
  id: string;
  label: string;
  canonical_id?: string;
  node_id?: string;
  evidence_refs?: string[];
  confidence?: number;
  confidence_handle?: string;
  provenance_handle?: string;
  [key: string]: unknown;
}

export interface OntologyOccurrence {
  id: string;
  type?: string;
  summary?: string;
  linked_entity_ids?: string[];
  source_refs?: string[];
  evidence_refs?: string[];
  confidence?: number;
  confidence_handle?: string;
  provenance_handle?: string;
  [key: string]: unknown;
}

export interface TypedEntityOccurrenceV1 {
  id: string;
  node_type: string;
  raw_span: string;
  normalized: string;
  source_file: string;
  page: number | null;
  offsets: { start: number; end: number };
  detector: "lexicon" | "pattern" | "llm";
  resolution: "linked" | "unlinked" | "ambiguous";
  registry_record_id?: string;
  registry_partition: string | null;
}

export interface LinkValidationIssue {
  code: string;
  severity: "error" | "warning" | "info";
  node_type: string | null;
  message: string;
  refs: string[];
}

export interface OntologyMapping {
  id: string;
  source_id: string;
  target_id: string;
  mapping_type?: string;
  review_status?: OntologyStatus;
  assertion_basis?: string | string[];
  derivation_method?: string;
  evidence_refs?: string[];
  confidence?: number;
  confidence_handle?: string;
  provenance_handle?: string;
  [key: string]: unknown;
}

/**
 * Track C-3.5 — node shape names valid for the visual encoding override
 * carried by a profile's `node_types.*.visual_encoding`. Consumed by the
 * Studio scene builder (`studio-scene.ts`) to drive per-node-type glyphs.
 */
export type OntologyVisualEncodingShape =
  | "dot"
  | "square"
  | "triangle"
  | "box"
  | "diamond"
  | "star"
  | "hexagon";

/**
 * Glyph fill variant: "solid" (default) paints the shape in the node colour;
 * "hollow" draws the outline only (translucent fill + node-coloured border).
 * Extra encoding dimension so node types sharing a shape stay distinguishable.
 */
export type OntologyVisualEncodingFill = "solid" | "hollow";

/** Glyph border weight: "normal" (default) or "bold" (heavier outline). */
export type OntologyVisualEncodingBorder = "normal" | "bold";

export interface OntologyVisualEncoding {
  shape?: OntologyVisualEncodingShape;
  /**
   * "#RRGGBB" or "#RRGGBBAA" hex color. NOTE: INERT in the static studio — the
   * studio renderer colors nodes by community/group (categorical palette) BY
   * DESIGN, not per-node-type. This field is still format-validated by
   * validateOntologyProfile (so a malformed value is flagged) but is NOT
   * consumed by the scene builder / renderer. Kept for forward-compat / other
   * consumers; `shape` / `fill` / `border` are the encodings the studio honors.
   */
  color_hex?: string;
  /** Fill variant (default "solid"). Additive: absent keeps today's render. */
  fill?: OntologyVisualEncodingFill;
  /** Border weight (default "normal"). Additive: absent keeps today's render. */
  border?: OntologyVisualEncodingBorder;
}

/**
 * Declarative composition for a registry entity normalizer. Built-ins are
 * applied left-to-right, then the optional synchronous local ESM export runs.
 */
export interface OntologyNodeTypeNormalize {
  builtin?: string[];
  fn?: string;
}

/** Document metadata binding used to scope a partitioned registry. */
export interface OntologyLinkingPartitionFrom {
  /** Front-matter field preferred over any path-layout fallback. */
  source_frontmatter: string;
  /** Declarative fallback: zero-based segment of the source path. */
  else?: { path_segment: number };
}

/** A $0 regex detector. Matches are always intersected with registry membership. */
export interface OntologyLinkingPattern {
  form: string;
  flags?: string;
  /** Kept declarative for consumers; L4a never emits a non-member expansion. */
  expand?: { ranges?: string };
  /** Normalized to `required`; values outside the registry are never emitted. */
  membership?: "required";
}

/**
 * Bounded trigger enum deciding when the opt-in `llm` detector may propose
 * spans. There is NO free-form expression: hybrid recall only calls the model
 * when the declared condition over the $0 detectors' output holds.
 */
export type OntologyLinkLlmTrigger =
  | "zero_candidates"
  | "unresolved_candidates"
  | "below_min_candidates";

/**
 * Declarative configuration for the `llm` detector. The model PROPOSES typed
 * spans only; resolution stays with graphify's exact/none resolver + the
 * verbatim gate. Budget/dry_run are honored before any provider call is made.
 */
export interface OntologyLinkLlmConfig {
  trigger: OntologyLinkLlmTrigger;
  /** Non-negative USD ceiling. `0` disables the detector (no proposals). */
  budget_usd?: number;
  /** When true, never make a paid proposal call for this detector. */
  dry_run?: boolean;
  /** Companion threshold for `below_min_candidates` (defaults to 1). */
  min_candidates?: number;
}

export type OntologyLinkDetector =
  | "lexicon"
  | "pattern"
  | "llm"
  | { pattern: OntologyLinkingPattern }
  | { llm: OntologyLinkLlmConfig };

export interface OntologyLinkingResolve {
  mode: "exact" | "none";
}

export interface OntologyLinkingEvidence {
  verbatim: "required";
  context_window?: number;
}

/**
 * Typed entity-linking declaration. Every field is optional at the profile
 * boundary; presets are expanded into the three explicit axes at load time.
 */
export interface OntologyNodeTypeLinking {
  preset?: string;
  normalize?: OntologyNodeTypeNormalize;
  partition_from?: OntologyLinkingPartitionFrom;
  detect?: OntologyLinkDetector[];
  /** Convenience spelling for profile authors; normalized into `detect`. */
  patterns?: OntologyLinkingPattern[];
  resolve?: "exact" | "none" | OntologyLinkingResolve;
  evidence?: Partial<OntologyLinkingEvidence>;
}

/** Portable fingerprint of the effective normalizer; runtime paths are absent. */
export interface EntityNormalizerDescriptor {
  contract: "engram_entity_normalizer_v1" | "graphify_entity_normalizer_v1";
  builtins: string[];
  export?: string;
  module_sha256?: string;
  normalizer_hash: string;
}

export interface NormalizedOntologyNodeTypeLinking {
  preset?: string;
  normalize?: OntologyNodeTypeNormalize;
  partition_from?: OntologyLinkingPartitionFrom;
  detect: OntologyLinkDetector[];
  resolve: OntologyLinkingResolve;
  evidence: OntologyLinkingEvidence;
  normalizer: EntityNormalizerDescriptor;
}

export interface OntologyNodeType {
  aliases?: string[];
  registry?: string;
  source_backed?: boolean;
  status_policy?: string;
  linking?: OntologyNodeTypeLinking;
  /**
   * Per-node-type visual encoding override consumed by the static studio scene
   * builder (`studio-scene.ts`): `shape` / `fill` / `border` drive the glyph.
   * (`color_hex` is accepted + format-validated but inert — see above.)
   */
  visual_encoding?: OntologyVisualEncoding;
}

/** Node-type configuration after the L3 linking contract has been compiled. */
export interface NormalizedOntologyNodeType extends Omit<OntologyNodeType, "linking"> {
  linking?: NormalizedOntologyNodeTypeLinking;
}

export interface OntologyRelationType {
  source?: string | string[];
  target?: string | string[];
  source_types?: string[];
  target_types?: string[];
  requires_evidence?: boolean;
  assertion_basis?: string | string[];
  derivation_method?: string | string[];
  derivation_methods?: string[];
}

export interface OntologyRegistrySpec {
  source?: string;
  id_column?: string;
  label_column?: string;
  alias_columns?: string[];
  node_type?: string;
  /** Registry column that scopes label and alias identity. */
  partition_column?: string;
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
  status_transitions?: OntologyStatusTransition[];
}

export interface OntologyStatusTransition {
  from?: OntologyStatus | OntologyStatus[];
  to?: OntologyStatus | OntologyStatus[];
  from_statuses?: OntologyStatus[];
  to_statuses?: OntologyStatus[];
  requires?: string[];
}

export interface NormalizedOntologyStatusTransition {
  from_statuses: OntologyStatus[];
  to_statuses: OntologyStatus[];
  requires: string[];
}

export interface OntologyInferencePolicy {
  allow_inferred_relations?: boolean;
  allowed_relation_types?: string[];
  require_evidence_refs?: boolean;
}

export interface NormalizedOntologyInferencePolicy {
  allow_inferred_relations: boolean;
  allowed_relation_types: string[];
  require_evidence_refs: boolean;
}

export interface OntologyEvidencePolicy {
  require_evidence_refs?: boolean;
  min_refs?: number;
  node_types?: string[];
  relation_types?: string[];
}

export interface NormalizedOntologyEvidencePolicy {
  require_evidence_refs: boolean;
  min_refs: number;
  node_types: string[];
  relation_types: string[];
}

export interface OntologyHierarchySpec {
  registry?: string;
  parent_column?: string;
  child_column?: string;
  relation_type?: string;
  parent_node_type?: string;
  child_node_type?: string;
}

export interface NormalizedOntologyHierarchySpec {
  registry: string;
  parent_column: string;
  child_column: string;
  relation_type: string;
  parent_node_type: string;
  child_node_type: string;
}

/** One directed arc in a profile-declared hierarchy. */
export interface OntologyHierarchyArc {
  /** Identifier of the hierarchy (key in profile.hierarchies). */
  hierarchy_id: string;
  /** Registry-native id of the parent node. */
  parent_id: string;
  /** Registry-native id of the child node. */
  child_id: string;
  /**
   * Depth of the child relative to the root (0 = root, 1 = child of root, …).
   * Only populated by buildHierarchyIndex; kept 0 here, filled in by the index.
   */
  level: number;
  /** Relation type declared in the hierarchy spec. */
  type: string;
  /** Always "profile" for profile-declared hierarchies. */
  source: "profile";
  /**
   * Lifecycle status (increment B). Profile-declared arcs are always
   * `"reference"` — registry-bound authoritative facts under D1=1b. The other
   * states (candidate/validated/proposed/inferred) are reserved for the future
   * `source:"extracted"` lane (v2) and are NOT produced in v1.
   */
  status?: OntologyStatus;
  /**
   * Confidence in [0,1] (increment B). Profile-declared arcs are deterministic
   * structural facts and always carry `1.0`.
   */
  confidence?: number;
  /** Optional evidence references carried by the registry record. */
  evidence_refs?: string[];
}

/** Pre-computed index over a set of OntologyHierarchyArc entries. */
export interface OntologyHierarchyIndex {
  schema: "engram_ontology_hierarchies_v1" | "graphify_ontology_hierarchies_v1";
  /** Ids of nodes that have no parent in any arc. */
  root_ids: string[];
  /** Maximum depth across all arcs (0 when arcs is empty). */
  depth: number;
  /** Map: node_id → array of ancestor ids from root down to direct parent. */
  ancestor_paths: Record<string, string[]>;
  /**
   * Cycles detected during index construction.  Each entry is an ordered list
   * of node ids forming the cycle.  Nodes involved in cycles are excluded from
   * ancestor_paths and root_ids.
   */
  cycles: string[][];
}

// ---------------------------------------------------------------------------
// Class-hierarchies (EVOL 2.c) — engram_ontology_class_hierarchies_v1
// ---------------------------------------------------------------------------
//
// A SEPARATE, additive ontology artifact (`class-hierarchies.json`) describing
// the CLASS layer: a mono-parent class tree (`subclass_of`) whose leaf classes
// gather the graph's entity nodes by their `node_type` (`has_instance`). It is
// independent of the signed `engram_scene_hierarchies_v1` sidecar (which
// describes the ENTITY-instance tree); the two never share state. Class node
// ids are synthetic and namespaced `class:<ClassName>` to avoid colliding with
// raw registry / entity ids. Entities join leaf classes by their graph/scene
// node `id` (NOT registry_record_id — see the join-key ambiguity note in
// scene-hierarchies.ts / SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md).

/** One class in a profile-declared class hierarchy (profile input). */
export interface ClassHierarchyClass {
  /** Parent class name within the same hierarchy, or null for a root class. */
  parent?: string | null;
  /** Optional human-readable label (defaults to the class name). */
  label?: string;
  /**
   * Node types whose entities are instances of this (leaf) class. A node_type
   * may appear under at most one class per hierarchy; duplicates are reported
   * as conflicts and only the first (by sorted class name) wins.
   */
  member_node_types?: string[];
  /**
   * Ids of the REGISTRY hierarchies (`hierarchies:` block → the
   * `engram_scene_hierarchies_v1` sidecar) whose forest this class OWNS.
   * The taxonomy stays one tree: a consumer splices each named forest under
   * this class, so a class like `ABP` is the navigable multi-level process
   * tree instead of a node-type dead end. Purely declarative — the compiled
   * class hierarchy only carries the binding, never the forest itself (the
   * sidecar remains the autonomous transport, D1).
   */
  member_hierarchies?: string[];
}

/** A profile-declared class hierarchy (profile input). */
export interface ClassHierarchySpec {
  /** Class→parent relation (default "subclass_of"). */
  relation_type?: string;
  /** Class→entity membership relation (default "has_instance"). */
  membership_relation_type?: string;
  /** Class name → class definition. */
  classes?: Record<string, ClassHierarchyClass>;
}

/** Profile `class_hierarchies` block: hierarchy_id → spec. */
export type ClassHierarchiesProfileBlock = Record<string, ClassHierarchySpec>;

/** Normalized class definition (all optionals defaulted). */
export interface NormalizedClassHierarchyClass {
  parent: string | null;
  label: string | null;
  member_node_types: string[];
  /** Registry hierarchy ids spliced under this class (see ClassHierarchyClass). */
  member_hierarchies: string[];
}

/** Normalized class hierarchy spec (all optionals defaulted). */
export interface NormalizedClassHierarchySpec {
  relation_type: string;
  membership_relation_type: string;
  classes: Record<string, NormalizedClassHierarchyClass>;
}

/** Per-class entry of a compiled class hierarchy. Keyed by synthetic class id. */
export interface ClassHierarchyClassEntry {
  /** Synthetic class id, namespaced `class:<ClassName>`. Equals the entry key. */
  id: string;
  /** Display label (the class name when none was declared). */
  label: string;
  /** Synthetic id of the parent class, or null for roots / cycle-broken nodes. */
  parent_id: string | null;
  /** Synthetic ids of the direct child classes, sorted. */
  child_ids: string[];
  /** Depth from the root (0 = root). */
  level: number;
  /** Node types whose entities are instances of this class, sorted. */
  member_node_types: string[];
  /**
   * Registry hierarchy ids whose forest belongs under this class (sorted).
   * A consumer joins them against `scene-hierarchies.json` to render the real
   * multi-level tree in place — the taxonomy therefore stays a SINGLE tree.
   */
  member_hierarchies: string[];
  /**
   * Graph/scene node ids (NOT registry_record_id) of the entities attached to
   * this leaf class via `member_node_types`. Sorted; empty for inner classes.
   */
  member_ids: string[];
  /** Always "profile" for profile-declared classes (mirrors the arc source). */
  source: "profile";
  /** Lifecycle status — profile-declared classes are authoritative references. */
  status: "reference";
}

/** A single compiled class hierarchy. */
export interface ClassHierarchy {
  /** Class→parent relation type (e.g. "subclass_of"). */
  relation_type: string;
  /** Class→entity membership relation type (e.g. "has_instance"). */
  membership_relation_type: string;
  /** Synthetic ids of the root classes (no parent), sorted. */
  root_class_ids: string[];
  /** Maximum class depth (0 when every class is a root). */
  max_depth: number;
  /** Synthetic class id → class entry. */
  classes_by_id: Record<string, ClassHierarchyClassEntry>;
  /**
   * Class names whose declared parent is absent from the hierarchy. They are
   * promoted to roots and listed here (sorted) so consumers can flag them.
   */
  orphan_class_names: string[];
  /**
   * Cycles among the class parent links. Each entry is an ordered list of
   * synthetic class ids. Classes on a cycle are detached (parent_id=null) and
   * excluded from levels, exactly like buildHierarchyIndex.
   */
  cycles: string[][];
  /**
   * Node types claimed by more than one class. Each entry records the node_type
   * and the losing class names (the first class by sorted name keeps it).
   */
  member_node_type_conflicts: Array<{ node_type: string; dropped_classes: string[] }>;
  /**
   * Number of entity nodes whose node_type maps to no class in this hierarchy
   * (left unattached).
   */
  unattached_entity_count: number;
}

export const ONTOLOGY_CLASS_HIERARCHIES_SCHEMA = "engram_ontology_class_hierarchies_v1";

/** The `class-hierarchies.json` artifact (engram_ontology_class_hierarchies_v1). */
export interface ClassHierarchiesArtifact {
  schema: typeof ONTOLOGY_CLASS_HIERARCHIES_SCHEMA;
  generated_at: string;
  graph_hash?: string | null;
  profile_hash?: string | null;
  hierarchies: Record<string, ClassHierarchy>;
}

export type OntologyRelationExport = string | { relation_type?: string };

export interface OntologyOutputWikiPolicy {
  enabled?: boolean;
  page_node_types?: string[];
  include_backlinks?: boolean;
  include_source_snippets?: boolean;
}

export interface OntologyOutputPolicy {
  enabled?: boolean;
  artifact_schema?: string;
  canonical_node_types?: string[];
  source_node_types?: string[];
  occurrence_node_types?: string[];
  alias_fields?: string[];
  relation_exports?: OntologyRelationExport[];
  wiki?: OntologyOutputWikiPolicy;
}

export interface OntologyProfileOutputs {
  ontology?: OntologyOutputPolicy;
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
  inference_policy?: OntologyInferencePolicy;
  evidence_policy?: OntologyEvidencePolicy;
  hierarchies?: Record<string, OntologyHierarchySpec>;
  /** EVOL 2.c — class-layer hierarchies (separate from registry hierarchies). */
  class_hierarchies?: Record<string, ClassHierarchySpec>;
  outputs?: OntologyProfileOutputs;
}

export interface NormalizedOntologyRelationType {
  source_types: string[];
  target_types: string[];
  requires_evidence: boolean;
  assertion_basis: string[];
  derivation_methods: string[];
}

export interface NormalizedOntologyRegistrySpec {
  source: string;
  id_column: string;
  label_column: string;
  alias_columns: string[];
  node_type: string;
  /** Present only for registries whose labels and aliases are partition-scoped. */
  partition_column?: string;
  bound_source_path?: string;
}

export interface NormalizedOntologyOutputPolicy {
  enabled: boolean;
  artifact_schema: string;
  canonical_node_types: string[];
  source_node_types: string[];
  occurrence_node_types: string[];
  alias_fields: string[];
  relation_exports: string[];
  wiki: {
    enabled: boolean;
    page_node_types: string[];
    include_backlinks: boolean;
    include_source_snippets: boolean;
  };
}

export interface NormalizedOntologyProfileOutputs {
  ontology: NormalizedOntologyOutputPolicy;
}

export interface NormalizedOntologyProfile {
  id: string;
  version: string;
  default_language: string;
  sourcePath?: string;
  profile_hash: string;
  node_types: Record<string, NormalizedOntologyNodeType>;
  relation_types: Record<string, NormalizedOntologyRelationType>;
  registries: Record<string, NormalizedOntologyRegistrySpec>;
  citation_policy: Required<OntologyCitationPolicy>;
  hardening: Required<Omit<OntologyHardeningPolicy, "status_transitions">> & {
    status_transitions: NormalizedOntologyStatusTransition[];
  };
  inference_policy: NormalizedOntologyInferencePolicy;
  evidence_policy: NormalizedOntologyEvidencePolicy;
  hierarchies: Record<string, NormalizedOntologyHierarchySpec>;
  /**
   * EVOL 2.c — normalized class-layer hierarchies. Always populated by
   * normalizeOntologyProfile (empty when the profile omits the block), but
   * declared OPTIONAL so existing NormalizedOntologyProfile literals stay valid.
   */
  class_hierarchies?: Record<string, NormalizedClassHierarchySpec>;
  outputs: NormalizedOntologyProfileOutputs;
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
  /** Present only when the registry declares partition_column. */
  partition?: string;
  sourceFile: string;
  raw: Record<string, unknown>;
}
