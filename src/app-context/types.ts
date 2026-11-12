/**
 * Shared TypeScript contracts for the Application Context Graph (Lot L1, §2.2, §3.2, §3.4, §4.3, §5.1–§5.2).
 */

export type AppContextNodeType =
  | "Spec"
  | "SpecSection"
  | "Requirement"
  | "TrackWorkpackage"
  | "TrackItem"
  | "TrackDecision"
  | "DataEntity"
  | "DataField"
  | "Route"
  | "Component"
  | "ApiEndpoint"
  | "CodeSymbol"
  | "File"
  | "Commit"
  | "Branch"
  | "mcp_config_file"
  | "mcp_server"
  | "mcp_command"
  | "mcp_package"
  | "env_var";

/** Source-file citation on extracted nodes and edges (§6.3). */
export interface AppContextFileCitation {
  citation_kind?: "file";
  source_file: string;
  line_start: number;
  line_end: number;
  commit: string;
  excerpt_sha256?: string;
}

/** Track CLI projection citation on Track* nodes and track-derived edges (§4.3). */
export interface TrackProjectionCitation {
  citation_kind: "track_cli_projection";
  source_file: "track-projections/track-query.json" | "track-projections/track-decisions.json";
  line_start: number;    // 1-based start line of the JSON element in source_file
  line_end: number;      // 1-based end line of the JSON element in source_file
  json_pointer: string;  // RFC 6901 JSON Pointer, e.g. "/1" or "/1/wpId"
  command: "track query --format json" | "track decision ls --format json";
  cli_version: string;   // trimmed stdout of `track --version`
  commit: string;        // 40-hex checkout commit from which the projection was produced
}

export type AppContextCitation = AppContextFileCitation | TrackProjectionCitation;

/** Lossless app-context relation record stored in `graph.app_context.relations` (§3.2). */
export interface AppContextRelationRecord {
  source: string;
  target: string;
  relation: string;
  confidence: "EXTRACTED";
  derivation_methods: string[];     // sorted distinct derivation_method values
  evidence_refs: string[];          // sorted union of evidence_refs
  citations: AppContextCitation[];  // union of citations across all emissions of (source, target, relation)
}

export type AppContextRouterKind = "sveltekit" | "hash" | "pathname";
export type AppContextDataDialect = "postgres" | "mysql" | "sqlite";

export interface AppContextUiRouteConfig {
  pattern: string;
  router_kind: AppContextRouterKind;
  component: string;
  export_name?: string; // default: "default"
}

export interface AppContextHttpClientWrapperConfig {
  import_from: string;
  export_name: string;
  url_arg_index: number;
  options_arg_index?: number;
  method_option_path?: ReadonlyArray<string | number>;
}

export type AppContextUrlHelperConfig =
  | { import_from: string; export_name: string; path_arg_index: number; prefix?: string }
  | { file: string; local_symbol: string; path_arg_index: number; prefix?: string };

/** Normalized `app_context` block in `engram.yaml` (§3.4). */
export interface AppContextProjectConfig {
  enabled: boolean;                           // default: false
  spec_map?: string;                          // optional manifest, e.g. ".engram/spec-map.yaml"
  retention: { max_commits_per_repo: number };// integer >= 1, default: 10
  specs: { include: string[]; exclude: string[] }; // default include: ["docs/spec/**/*.md"]
  data_model: {
    default_dialect: AppContextDataDialect;   // default: "postgres"
    default_schema: string;                   // default: "public"
    sql_include: string[];                    // default: ["**/*.sql"]
    orm_include: string[];                    // Drizzle .ts and Prisma .prisma globs
  };
  call_graph: { max_hops: number };           // integer 1..6, default: 3
  ui: {
    routes: AppContextUiRouteConfig[];
  };
  http_client_wrappers: AppContextHttpClientWrapperConfig[];
  url_helpers: AppContextUrlHelperConfig[];
}

/** Raw input shape for the `app_context` block in `engram.yaml` (§3.4). */
export interface AppContextProjectConfigInput {
  enabled?: boolean;
  spec_map?: string;
  retention?: { max_commits_per_repo?: number };
  specs?: { include?: string[]; exclude?: string[] };
  data_model?: {
    default_dialect?: AppContextDataDialect;
    default_schema?: string;
    sql_include?: string[];
    orm_include?: string[];
  };
  call_graph?: { max_hops?: number };
  ui?: {
    routes?: AppContextUiRouteConfig[];
  };
  http_client_wrappers?: AppContextHttpClientWrapperConfig[];
  url_helpers?: AppContextUrlHelperConfig[];
}

/** Exact Track CLI item record (§4.3). */
export interface TrackCliItem {
  id: string;
  title: string;
  kind: string;          // e.g. "feature" | "bug" | "chore"
  workspace: string;
  bucket: string;        // e.g. "AWAITED" | "TO-DO" | "DONE" | "DROPPED"
  realization: string;   // e.g. "to-do" | "in-progress" | "done" | "cancelled"
  acceptance: string;    // e.g. "unknown"
  priority?: number;
  accountable?: string;
  wpId?: string;
  wpLabel?: string;
  detail?: { summary?: string; acceptanceLabel?: string };
}

/** Exact Track CLI decision record (§4.3). */
export interface TrackCliDecision {
  id: string;
  title: string;
  workspace: string;
  decisionKind: string;  // e.g. "orientation" | "commitment"
  realization: string;
  outcome: string;       // e.g. "go"
  structured: boolean;
  structure: string;     // "structured" | "unstructured"
  accountable?: string;
  optionCount: number;
  openQuestionCount: number;
  hasRecommendation: boolean;
  contextExcerpt?: string;
  options: Array<{ id: string; summary: string; title: string }>;
  recommendation?: { optionId: string; rationale: string };
  selectedOptionId?: string;
}

export type TargetSelector =
  | { kind: "component"; file: string; exportName?: string }
  | { kind: "route"; pattern: string; routerKind?: AppContextRouterKind }
  | { kind: "endpoint"; method: string; pathTemplate: string }
  | { kind: "entity"; name: string; schema?: string; dialect?: AppContextDataDialect }
  | { kind: "field"; entity: string; field: string; schema?: string; dialect?: AppContextDataDialect }
  | { kind: "symbol"; file: string; symbolName: string };

export interface SpecSelector {
  path?: string;          // repo-relative POSIX path, or
  specId?: string;        // declared frontmatter/manifest id
  sectionSlug?: string;   // optional SpecSection slugPath filter
  requirementId?: string; // optional Requirement reqId filter
}

export type AppContextErrorCode =
  | "commit-not-indexed"
  | "target-not-found"
  | "target-ambiguous"
  | "cursor-invalid"
  | "profile-incompatible"
  | "budget-too-small";

export type AppContextToolName =
  | "engram_context_for_target"
  | "engram_specs_for_target"
  | "engram_targets_for_spec"
  | "engram_read_spec_section"
  | "engram_get_context_item";

export interface AppContextAuditEntryV1 {
  timestamp: string;
  requestId: string;
  tenantId: string;
  appId: string;
  userSub: string;
  tool: AppContextToolName;
  repo: string;
  commit: string;
  boundGraphId: string;
  status: "ok" | "error";
  errorCode?: AppContextErrorCode;
}

export interface AppContextAuditSinkV1 {
  record(entry: AppContextAuditEntryV1): Promise<void>;
}

export interface AppContextCallerAuditClaim {
  userSub: string;
  tenantId: string;
  appId: string;
  requestId: string;
}

export type AppContextDiagnosticCode =
  | "target-unresolved"
  | "target-ambiguous"
  | "schema-conflict"
  | "track-id-unresolved"
  | "dynamic-component"
  | "endpoint-unresolved"
  | "unsupported-construct";

export interface AppContextDiagnosticCandidate {
  file: string;
  startLine: number;
  endLine: number;
  label: string;
}

export interface AppContextDiagnostic {
  id: string;
  code: AppContextDiagnosticCode;
  message: string;
  file?: string;
  line?: number;
  candidates?: AppContextDiagnosticCandidate[];
}

export interface AppContextGraphMetadata {
  profile_id: "app-context";
  profile_version: "1";
  profile_hash: string;
  repo: string;
  relations: AppContextRelationRecord[];
}
