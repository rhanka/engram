import { relative } from "node:path";

import type {
  Extraction,
  NormalizedOntologyProfile,
  NormalizedProjectConfig,
  RegistryRecord,
} from "./types.js";

export interface ProfilePromptState {
  profile: NormalizedOntologyProfile;
  projectConfig?: NormalizedProjectConfig;
  registries?: Record<string, RegistryRecord[]>;
}

export interface ProfilePromptOptions {
  maxRegistrySamplesPerRegistry?: number;
}

export interface ProfilePromptChunk {
  filePath: string;
  fileType: string;
  text?: string;
}

function sampleLimit(options: ProfilePromptOptions): number {
  return Math.max(0, options.maxRegistrySamplesPerRegistry ?? 3);
}

function rel(config: NormalizedProjectConfig, path: string): string {
  const value = relative(config.configDir, path).replace(/\\/g, "/");
  return value || ".";
}

function nodeTypeSection(profile: NormalizedOntologyProfile): string {
  const lines = Object.entries(profile.node_types).map(([nodeType, spec]) => {
    const details = [
      spec.registry ? `registry=${spec.registry}` : "",
      spec.source_backed ? "source_backed=true" : "",
      spec.status_policy ? `status_policy=${spec.status_policy}` : "",
    ].filter(Boolean);
    return `- ${nodeType}${details.length > 0 ? ` (${details.join(", ")})` : ""}`;
  });
  return ["## Allowed node types", ...lines].join("\n");
}

function relationTypeSection(profile: NormalizedOntologyProfile): string {
  const lines = Object.entries(profile.relation_types).map(([relation, spec]) =>
    `- ${relation}: ${spec.source_types.join(" | ")} -> ${spec.target_types.join(" | ")}`,
  );
  return ["## Allowed relation types", ...lines].join("\n");
}

function registrySection(state: ProfilePromptState, options: ProfilePromptOptions): string {
  const limit = sampleLimit(options);
  const lines = ["## Registry matching rules"];
  for (const [registryId, registrySpec] of Object.entries(state.profile.registries)) {
    const records = state.registries?.[registryId] ?? [];
    lines.push(`- ${registryId}: ${records.length} records, node_type=${registrySpec.node_type}`);
    for (const record of records.slice(0, limit)) {
      const aliases = record.aliases.length > 0 ? ` aliases=${record.aliases.join(", ")}` : "";
      lines.push(`  - sample ${record.id}: ${record.label}${aliases}`);
    }
  }
  lines.push("- Link registry-backed nodes with registry_id and registry_record_id when a match is available.");
  lines.push("- Do not invent registry matches; use needs_review when evidence is insufficient.");
  return lines.join("\n");
}

function citationSection(profile: NormalizedOntologyProfile): string {
  return [
    "## Citation policy",
    `- minimum_granularity: ${profile.citation_policy.minimum_granularity}`,
    `- require_source_file: ${profile.citation_policy.require_source_file}`,
    `- allow_bbox: ${profile.citation_policy.allow_bbox}`,
  ].join("\n");
}

function hardeningSection(profile: NormalizedOntologyProfile): string {
  return [
    "## Status and hardening rules",
    `- allowed_statuses: ${profile.hardening.statuses.join(", ")}`,
    `- default_status: ${profile.hardening.default_status}`,
    `- promotion_requires: ${profile.hardening.promotion_requires.join(", ") || "none"}`,
  ].join("\n");
}

function inputHintsSection(state: ProfilePromptState): string {
  const config = state.projectConfig;
  if (!config) return ["## Configured input hints", "- No project config was provided."].join("\n");
  return [
    "## Configured input hints",
    `- corpus: ${config.inputs.corpus.map((path) => rel(config, path)).join(", ") || "none"}`,
    `- generated: ${config.inputs.generated.map((path) => rel(config, path)).join(", ") || "none"}`,
    `- excluded: ${config.inputs.exclude.map((path) => rel(config, path)).join(", ") || "none"}`,
  ].join("\n");
}

function schemaSection(): string {
  return [
    "## JSON Extraction output schema",
    "- Return one JSON object with keys: nodes, edges, hyperedges, input_tokens, output_tokens.",
    "- nodes require: id, label, file_type, source_file.",
    "- profile nodes should include: node_type, status, citations, and registry identifiers when matched.",
    "- edges require: source, target, relation, confidence, source_file.",
    "- profile edges should include citations and status.",
  ].join("\n");
}

function genericSafetySection(): string {
  return [
    "## Generic product boundary",
    "- Do not invent customer, partner, project, proprietary ontology, or private domain content.",
    "- Use only the configured generic profile, registries, and evidence in the current chunk.",
    "- Keep examples synthetic and product-generic.",
  ].join("\n");
}

function chunkGuidance(fileType: string): string {
  if (fileType === "image") {
    return [
      "## Image guidance",
      "- extract depicted figures and visual evidence only when visible.",
      "- cite the image file and available bounding boxes when present.",
    ].join("\n");
  }
  if (fileType === "paper") {
    return [
      "## Paper guidance",
      "- extract methods, procedures, cited components, tools, figures, and explicit relationships.",
      "- preserve page-level citations when available.",
    ].join("\n");
  }
  return [
    "## Document guidance",
    "- extract procedures, processes, components, tools, and cited evidence.",
    "- prefer explicit source text over inference; use AMBIGUOUS for weak evidence.",
  ].join("\n");
}

export function buildProfileExtractionPrompt(
  state: ProfilePromptState,
  options: ProfilePromptOptions = {},
): string {
  return [
    `# Graphify Ontology Dataprep Extraction Prompt`,
    ``,
    `Profile: ${state.profile.id} ${state.profile.version}`,
    `Profile hash: ${state.profile.profile_hash}`,
    ``,
    nodeTypeSection(state.profile),
    ``,
    relationTypeSection(state.profile),
    ``,
    registrySection(state, options),
    ``,
    citationSection(state.profile),
    ``,
    hardeningSection(state.profile),
    ``,
    inputHintsSection(state),
    ``,
    schemaSection(),
    ``,
    genericSafetySection(),
  ].join("\n");
}

export function buildProfileChunkPrompt(
  state: ProfilePromptState,
  chunk: ProfilePromptChunk,
  options: ProfilePromptOptions = {},
): string {
  return [
    buildProfileExtractionPrompt(state, options),
    ``,
    `# Current Chunk`,
    `File: ${chunk.filePath}`,
    `Chunk type: ${chunk.fileType}`,
    ``,
    chunkGuidance(chunk.fileType),
    ``,
    `## Chunk content`,
    chunk.text ?? "",
  ].join("\n");
}

export function buildProfileValidationPrompt(
  state: ProfilePromptState,
  extraction: Extraction,
  options: ProfilePromptOptions = {},
): string {
  return [
    `# Graphify Profile Validation Prompt`,
    ``,
    `Validate this Graphify Extraction against the ontology dataprep profile.`,
    `First apply the base Graphify Extraction schema.`,
    `Then apply profile-aware node_type, relation, citation, status, and registry rules.`,
    ``,
    buildProfileExtractionPrompt(state, options),
    ``,
    `# Extraction To Validate`,
    JSON.stringify(extraction, null, 2),
  ].join("\n");
}
