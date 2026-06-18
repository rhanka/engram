import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

export const QUALITY_TARGET_CONFIG_CANDIDATES = [
  "graphify.yaml",
  "graphify.yml",
  join(".graphify", "config.yaml"),
  join(".graphify", "config.yml"),
] as const;

export const CITATION_EXTRACTION_CONTRACT_SCHEMA = "graphify_citation_extraction_contract_v1";
export const ALL_EXTRACTED_CITATION_CONTRACT_ID = "graphify_all_extracted_entity_citations_v1";

export type TargetCitationExtractionMode = "all_extracted" | "bounded_sample" | "unknown";
export type TargetCitationDisplay = "inline" | "full";
export type TargetCitationInline =
  | { mode: "top_k"; top_k: number }
  | { mode: "full" };

export interface CitationExtractionContract {
  schema: typeof CITATION_EXTRACTION_CONTRACT_SCHEMA;
  id: string;
  mode: TargetCitationExtractionMode;
  requirements: {
    emit_all_extracted_citations_per_entity?: boolean;
    bounded_samples_allowed?: boolean;
    minimum_one_citation_only_allowed?: boolean;
    same_entity_merge?: string;
    inline_projection_is_not_storage?: boolean;
    full_store_required_when_display_full?: boolean;
    [key: string]: unknown;
  };
  citation_identity: string[];
}

export const ALL_EXTRACTED_CITATION_CONTRACT: CitationExtractionContract = {
  schema: CITATION_EXTRACTION_CONTRACT_SCHEMA,
  id: ALL_EXTRACTED_CITATION_CONTRACT_ID,
  mode: "all_extracted",
  requirements: {
    emit_all_extracted_citations_per_entity: true,
    bounded_samples_allowed: false,
    minimum_one_citation_only_allowed: false,
    same_entity_merge: "union_by_citation_identity",
    inline_projection_is_not_storage: true,
    full_store_required_when_display_full: true,
  },
  citation_identity: ["source_file", "page", "section", "paragraph_id"],
};

export interface QualityTargetPublicationConfig {
  blocking: boolean;
  require_resolved_manifest: boolean;
  data_only_chrome: boolean;
  chrome_reference_path: string | null;
  resolvedChromeReferencePath: string | null;
  deny_source_path_patterns: string[];
  data_allowlist: string[];
}

export interface QualityTargetCitationExtractionConfig {
  mode: TargetCitationExtractionMode;
  require_producer_proof: boolean;
  contract_id: string | null;
  allowed_contract_hashes: string[];
  require_batch_coverage: boolean;
}

export interface QualityTargetCitationsConfig {
  extraction: QualityTargetCitationExtractionConfig;
  display: TargetCitationDisplay;
  inline: TargetCitationInline;
  require_sidecar: boolean;
  min_count_by_node: Record<string, number>;
  no_shrink_by_node: Record<string, { baseline_field: string; max_drop: number }>;
}

export interface QualityTargetGraphConfig {
  min_nodes: number | null;
  min_edges: number | null;
  shrink_guard: {
    nodes?: { max_drop: number };
    edges?: { max_drop: number };
  };
  max_missing_descriptions: number | null;
  max_orphan_nodes: number | null;
  forbidden_node_id_patterns: string[];
  forbidden_source_path_patterns: string[];
  allowed_node_types: string[];
  min_degree_by_type: Record<string, number>;
}

export interface QualityTargetReconciliationConfig {
  min_candidates: number | null;
  shrink_guard: {
    candidates?: { max_drop: number };
  };
  require_groupable_by_type: boolean;
}

export interface QualityTargetCommunitiesConfig {
  require_semantic_labels: boolean;
}

export interface NormalizedQualityTarget {
  id: string;
  kind: string;
  bundle_path: string | null;
  resolvedBundlePath: string | null;
  baseline_bundle_path: string | null;
  resolvedBaselineBundlePath: string | null;
  publication: QualityTargetPublicationConfig;
  citations: QualityTargetCitationsConfig;
  graph: QualityTargetGraphConfig;
  reconciliation: QualityTargetReconciliationConfig;
  communities: QualityTargetCommunitiesConfig;
}

export interface NormalizedQualityTargetsConfig {
  sourcePath: string;
  configDir: string;
  targets: Record<string, NormalizedQualityTarget>;
}

export interface QualityTargetDiscoveryResult {
  found: boolean;
  path: string | null;
  searched: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function asPositiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function resolveMaybe(configDir: string, value: string | null): string | null {
  return value ? resolve(configDir, value) : null;
}

function normalizeExtractionMode(value: unknown): TargetCitationExtractionMode {
  return value === "all_extracted" || value === "bounded_sample" || value === "unknown"
    ? value
    : "unknown";
}

function normalizeDisplay(value: unknown): TargetCitationDisplay {
  return value === "inline" ? "inline" : "full";
}

function normalizeInline(raw: Record<string, unknown>): TargetCitationInline {
  const mode = raw.mode === "full" ? "full" : "top_k";
  if (mode === "full") return { mode: "full" };
  return { mode: "top_k", top_k: asPositiveInteger(raw.top_k ?? raw.topK, 8) };
}

function normalizeNoShrinkByNode(value: unknown): Record<string, { baseline_field: string; max_drop: number }> {
  const out: Record<string, { baseline_field: string; max_drop: number }> = {};
  for (const [id, rawRule] of Object.entries(asRecord(value))) {
    const rule = asRecord(rawRule);
    const baselineField = asString(rule.baseline_field) ?? "citation_count";
    const maxDrop = asNonNegativeNumber(rule.max_drop) ?? 0;
    out[id] = { baseline_field: baselineField, max_drop: maxDrop };
  }
  return out;
}

function normalizeMinCountByNode(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, rawCount] of Object.entries(asRecord(value))) {
    const count = asNonNegativeNumber(rawCount);
    if (count !== null) out[id] = count;
  }
  return out;
}

function normalizeMaxDrop(value: unknown): { max_drop: number } | undefined {
  const maxDrop = asNonNegativeNumber(asRecord(value).max_drop);
  return maxDrop === null ? undefined : { max_drop: maxDrop };
}

export function discoverQualityTargetsConfig(root: string = "."): QualityTargetDiscoveryResult {
  const resolvedRoot = resolve(root);
  const searched = QUALITY_TARGET_CONFIG_CANDIDATES.map((candidate) => join(resolvedRoot, candidate));
  for (const candidate of searched) {
    if (existsSync(candidate)) return { found: true, path: candidate, searched };
  }
  return { found: false, path: null, searched };
}

export function parseQualityTargetsConfig(raw: string, sourcePath: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const parsed = sourcePath.endsWith(".json") || trimmed.startsWith("{")
    ? JSON.parse(trimmed || "{}")
    : parseYaml(trimmed || "{}");
  return asRecord(parsed);
}

export function loadQualityTargetsConfig(configPath: string): NormalizedQualityTargetsConfig {
  const resolved = resolve(configPath);
  const raw = readFileSync(resolved, "utf-8");
  return normalizeQualityTargetsConfig(parseQualityTargetsConfig(raw, resolved), resolved);
}

export function normalizeQualityTargetsConfig(
  config: Record<string, unknown>,
  sourcePath: string,
): NormalizedQualityTargetsConfig {
  const resolvedSourcePath = resolve(sourcePath);
  const configDir = dirname(resolvedSourcePath);
  const quality = asRecord(config.quality);
  const targetsRaw = asRecord(quality.targets);
  const targets: Record<string, NormalizedQualityTarget> = {};
  for (const [id, rawTarget] of Object.entries(targetsRaw)) {
    targets[id] = normalizeQualityTarget(id, asRecord(rawTarget), configDir);
  }
  return { sourcePath: resolvedSourcePath, configDir, targets };
}

export function normalizeQualityTarget(
  id: string,
  raw: Record<string, unknown>,
  configDir: string,
): NormalizedQualityTarget {
  const publicationRaw = asRecord(raw.publication);
  const citationsRaw = asRecord(raw.citations);
  const extractionRaw = asRecord(citationsRaw.extraction);
  const graphRaw = asRecord(raw.graph);
  const reconciliationRaw = asRecord(raw.reconciliation);
  const communitiesRaw = asRecord(raw.communities);
  const bundlePath = asString(raw.bundle_path);
  const baselineBundlePath = asString(raw.baseline_bundle_path);
  const chromeReferencePath = asString(publicationRaw.chrome_reference_path);

  const graphShrinkGuardRaw = asRecord(graphRaw.shrink_guard);
  const reconciliationShrinkGuardRaw = asRecord(reconciliationRaw.shrink_guard);

  return {
    id,
    kind: asString(raw.kind) ?? "studio-static-bundle",
    bundle_path: bundlePath,
    resolvedBundlePath: resolveMaybe(configDir, bundlePath),
    baseline_bundle_path: baselineBundlePath,
    resolvedBaselineBundlePath: resolveMaybe(configDir, baselineBundlePath),
    publication: {
      blocking: asBoolean(publicationRaw.blocking, false),
      require_resolved_manifest: asBoolean(publicationRaw.require_resolved_manifest, false),
      data_only_chrome: asBoolean(publicationRaw.data_only_chrome, false),
      chrome_reference_path: chromeReferencePath,
      resolvedChromeReferencePath: resolveMaybe(configDir, chromeReferencePath),
      deny_source_path_patterns: asStringArray(publicationRaw.deny_source_path_patterns),
      data_allowlist: asStringArray(publicationRaw.data_allowlist),
    },
    citations: {
      extraction: {
        mode: normalizeExtractionMode(extractionRaw.mode),
        require_producer_proof: asBoolean(extractionRaw.require_producer_proof, false),
        contract_id: asString(extractionRaw.contract_id),
        allowed_contract_hashes: asStringArray(extractionRaw.allowed_contract_hashes),
        require_batch_coverage: asBoolean(extractionRaw.require_batch_coverage, false),
      },
      display: normalizeDisplay(citationsRaw.display),
      inline: normalizeInline(asRecord(citationsRaw.inline)),
      require_sidecar: asBoolean(citationsRaw.require_sidecar, false),
      min_count_by_node: normalizeMinCountByNode(citationsRaw.min_count_by_node),
      no_shrink_by_node: normalizeNoShrinkByNode(citationsRaw.no_shrink_by_node),
    },
    graph: {
      min_nodes: asNonNegativeNumber(graphRaw.min_nodes),
      min_edges: asNonNegativeNumber(graphRaw.min_edges),
      shrink_guard: {
        nodes: normalizeMaxDrop(graphShrinkGuardRaw.nodes),
        edges: normalizeMaxDrop(graphShrinkGuardRaw.edges),
      },
      max_missing_descriptions: asNonNegativeNumber(graphRaw.max_missing_descriptions),
      max_orphan_nodes: asNonNegativeNumber(graphRaw.max_orphan_nodes),
      forbidden_node_id_patterns: asStringArray(graphRaw.forbidden_node_id_patterns),
      forbidden_source_path_patterns: asStringArray(graphRaw.forbidden_source_path_patterns),
      allowed_node_types: asStringArray(graphRaw.allowed_node_types),
      min_degree_by_type: normalizeMinCountByNode(graphRaw.min_degree_by_type),
    },
    reconciliation: {
      min_candidates: asNonNegativeNumber(reconciliationRaw.min_candidates),
      shrink_guard: {
        candidates: normalizeMaxDrop(reconciliationShrinkGuardRaw.candidates),
      },
      require_groupable_by_type: asBoolean(reconciliationRaw.require_groupable_by_type, false),
    },
    communities: {
      require_semantic_labels: asBoolean(communitiesRaw.require_semantic_labels, false),
    },
  };
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return out;
}

export function sha256Prefixed(bytes: string | Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function hashCitationExtractionContract(contract: CitationExtractionContract): string {
  return sha256Prefixed(canonicalJson(contract));
}

export function hashQualityTarget(target: NormalizedQualityTarget): string {
  const {
    resolvedBaselineBundlePath: _resolvedBaselineBundlePath,
    resolvedBundlePath: _resolvedBundlePath,
    publication,
    ...targetForHash
  } = target;
  const {
    resolvedChromeReferencePath: _resolvedChromeReferencePath,
    ...publicationForHash
  } = publication;
  return sha256Prefixed(canonicalJson({
    ...targetForHash,
    publication: publicationForHash,
  }));
}

export function validateCitationExtractionContractForTarget(
  target: NormalizedQualityTarget,
  contract: CitationExtractionContract,
): string[] {
  const errors: string[] = [];
  const extraction = target.citations.extraction;
  if (!extraction.require_producer_proof) return errors;
  if (contract.schema !== CITATION_EXTRACTION_CONTRACT_SCHEMA) {
    errors.push("citations.extraction.contract.schema must be graphify_citation_extraction_contract_v1");
  }
  if (contract.mode !== extraction.mode) {
    errors.push(`citations.extraction.contract.mode must be ${extraction.mode}`);
  }
  if (extraction.contract_id !== null && contract.id !== extraction.contract_id) {
    errors.push(`citations.extraction.contract.id must be ${extraction.contract_id}`);
  }
  const hash = hashCitationExtractionContract(contract);
  if (!extraction.allowed_contract_hashes.includes(hash)) {
    errors.push(`citations.extraction.contract hash ${hash} is not allowlisted`);
  }
  if (
    extraction.mode === "all_extracted" &&
    contract.requirements.minimum_one_citation_only_allowed !== false
  ) {
    errors.push("citations.extraction.contract must reject minimum-one-citation-only producers");
  }
  if (
    extraction.mode === "all_extracted" &&
    contract.requirements.bounded_samples_allowed !== false
  ) {
    errors.push("citations.extraction.contract must reject bounded samples");
  }
  return errors;
}

export function validateQualityTarget(target: NormalizedQualityTarget): string[] {
  const errors: string[] = [];
  const extraction = target.citations.extraction;
  if (target.publication.blocking && target.publication.require_resolved_manifest !== true) {
    errors.push("publication.require_resolved_manifest must be true for blocking targets");
  }
  if (target.publication.data_only_chrome && !target.publication.resolvedChromeReferencePath) {
    errors.push("publication.chrome_reference_path is required when data_only_chrome is true");
  }
  if (
    target.publication.data_only_chrome &&
    target.resolvedBundlePath &&
    target.publication.resolvedChromeReferencePath === target.resolvedBundlePath
  ) {
    errors.push("publication.chrome_reference_path must not resolve to the bundle path");
  }
  if (extraction.require_producer_proof) {
    if (extraction.contract_id === null) errors.push("citations.extraction.contract_id is required");
    if (extraction.allowed_contract_hashes.length === 0) {
      errors.push("citations.extraction.allowed_contract_hashes must not be empty");
    }
  }
  if (target.citations.display === "full" && target.citations.require_sidecar !== true) {
    errors.push("citations.require_sidecar must be true when citations.display is full");
  }
  for (const pattern of target.graph.forbidden_node_id_patterns) {
    try {
      new RegExp(pattern);
    } catch {
      errors.push(`graph.forbidden_node_id_patterns contains invalid RegExp: ${pattern}`);
    }
  }
  return errors;
}
