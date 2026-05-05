import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import type { ProfileState } from "./configured-dataprep.js";
import type {
  DetectionResult,
  NormalizedOntologyProfile,
  NormalizedProjectConfig,
  RegistryRecord,
} from "./types.js";

export const ONTOLOGY_DISCOVERY_SAMPLE_SCHEMA = "graphify_ontology_discovery_sample_v1";
export const ONTOLOGY_DISCOVERY_PROPOSALS_SCHEMA = "graphify_ontology_discovery_proposals_v1";
export const ONTOLOGY_PROFILE_DIFF_SCHEMA = "graphify_ontology_profile_diff_v1";

export type OntologyDiscoveryProposalKind =
  | "node_type"
  | "relation_type"
  | "registry_binding"
  | "hardening_rule";

export type OntologyDiscoveryProposalAction = "add" | "update" | "remove";

export interface OntologyDiscoverySampleOptions {
  maxFiles?: number;
  maxCharsPerFile?: number;
  maxRegistryRecords?: number;
}

export interface OntologyDiscoverySampleFile {
  id: string;
  path: string;
  file_type: string;
  words: number;
  excerpt?: string;
}

export interface OntologyDiscoverySampleRegistryRecord {
  id: string;
  registry_id: string;
  record_id: string;
  label: string;
  node_type: string;
  aliases: string[];
}

export interface OntologyDiscoverySample {
  schema: typeof ONTOLOGY_DISCOVERY_SAMPLE_SCHEMA;
  profile_id: string;
  profile_version: string;
  profile_hash: string;
  sample_hash: string;
  limits: Required<OntologyDiscoverySampleOptions>;
  existing_profile: {
    node_types: string[];
    relation_types: string[];
    registries: string[];
    statuses: string[];
  };
  files: OntologyDiscoverySampleFile[];
  registry_records: OntologyDiscoverySampleRegistryRecord[];
  instructions: string[];
}

export interface OntologyDiscoveryProposal {
  id: string;
  kind: OntologyDiscoveryProposalKind;
  action: OntologyDiscoveryProposalAction;
  path: string;
  value?: unknown;
  evidence_refs?: string[];
  confidence?: number;
  rationale?: string;
}

export interface OntologyDiscoveryProposalsFile {
  schema: typeof ONTOLOGY_DISCOVERY_PROPOSALS_SCHEMA;
  profile_hash: string;
  sample_hash?: string;
  generated_by?: Record<string, unknown>;
  proposals: OntologyDiscoveryProposal[];
}

export interface OntologyProfileDiffIssue {
  proposal_id?: string;
  severity: "error" | "warning";
  message: string;
}

export interface OntologyProfileDiffOperation {
  op: OntologyDiscoveryProposalAction;
  path: string;
  value?: unknown;
  proposal_id: string;
  evidence_refs: string[];
  review_status: "needs_review";
}

export interface OntologyProfileDiff {
  schema: typeof ONTOLOGY_PROFILE_DIFF_SCHEMA;
  base_profile_hash: string;
  proposal_hash: string;
  sample_hash?: string;
  mutates_profile: false;
  requires_user_approval: true;
  valid: boolean;
  issues: OntologyProfileDiffIssue[];
  operations: OntologyProfileDiffOperation[];
  summary: {
    node_types_added: number;
    relation_types_added: number;
    registry_bindings_added: number;
    hardening_rules_added: number;
  };
}

export interface OntologyDiscoveryContext {
  profileState: ProfileState;
  profile: NormalizedOntologyProfile;
  projectConfig?: NormalizedProjectConfig;
  semanticDetection?: DetectionResult;
  registries?: Record<string, RegistryRecord[]>;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortJson(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  );
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf-8")) as T;
}

function writeJson(path: string, value: unknown): void {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function relPath(context: OntologyDiscoveryContext, path: string): string {
  const base = context.projectConfig?.configDir ?? dirname(resolve(context.profileState.project_config_path));
  const value = relative(base, resolve(path)).replace(/\\/g, "/");
  return value || ".";
}

function sortedSemanticFiles(detection?: DetectionResult): Array<{ fileType: string; path: string }> {
  if (!detection) return [];
  const order = ["document", "paper", "image", "video", "code"];
  return order.flatMap((fileType) =>
    [...(detection.files[fileType] ?? [])]
      .sort((left, right) => left.localeCompare(right))
      .map((path) => ({ fileType, path })),
  );
}

function sampleFile(
  context: OntologyDiscoveryContext,
  file: { fileType: string; path: string },
  index: number,
  maxChars: number,
): OntologyDiscoverySampleFile {
  let excerpt: string | undefined;
  let words = 0;
  if (file.fileType !== "image" && existsSync(file.path)) {
    try {
      const text = readFileSync(file.path, "utf-8");
      words = wordCount(text);
      excerpt = text.slice(0, maxChars);
    } catch {
      words = 0;
    }
  }
  return {
    id: `sample-file-${String(index + 1).padStart(3, "0")}`,
    path: relPath(context, file.path),
    file_type: file.fileType,
    words,
    ...(excerpt ? { excerpt } : {}),
  };
}

function registrySamples(
  registries: Record<string, RegistryRecord[]> = {},
  maxRecords: number,
): OntologyDiscoverySampleRegistryRecord[] {
  const records: OntologyDiscoverySampleRegistryRecord[] = [];
  for (const [registryId, registryRecords] of Object.entries(registries).sort(([left], [right]) => left.localeCompare(right))) {
    registryRecords.slice(0, maxRecords).forEach((record, index) => {
      records.push({
        id: `sample-registry-${registryId}-${String(index + 1).padStart(3, "0")}`,
        registry_id: registryId,
        record_id: record.id,
        label: record.label,
        node_type: record.nodeType,
        aliases: record.aliases,
      });
    });
  }
  return records;
}

export function buildOntologyDiscoverySample(
  context: OntologyDiscoveryContext,
  options: OntologyDiscoverySampleOptions = {},
): OntologyDiscoverySample {
  const limits = {
    maxFiles: Math.max(0, options.maxFiles ?? 20),
    maxCharsPerFile: Math.max(0, options.maxCharsPerFile ?? 1200),
    maxRegistryRecords: Math.max(0, options.maxRegistryRecords ?? 5),
  };
  const sampleBase = {
    schema: ONTOLOGY_DISCOVERY_SAMPLE_SCHEMA,
    profile_id: context.profile.id,
    profile_version: context.profile.version,
    profile_hash: context.profile.profile_hash,
    limits,
    existing_profile: {
      node_types: Object.keys(context.profile.node_types).sort(),
      relation_types: Object.keys(context.profile.relation_types).sort(),
      registries: Object.keys(context.profile.registries).sort(),
      statuses: [...context.profile.hardening.statuses].sort(),
    },
    files: sortedSemanticFiles(context.semanticDetection)
      .slice(0, limits.maxFiles)
      .map((file, index) => sampleFile(context, file, index, limits.maxCharsPerFile)),
    registry_records: registrySamples(context.registries, limits.maxRegistryRecords),
    instructions: [
      "Use this sample only to propose generic ontology profile changes.",
      "Do not mutate profile files from discovery.",
      "Do not add customer, partner, project, proprietary ontology, or private domain examples to Graphify package fixtures or docs.",
      "Every proposal must cite sample evidence_refs and remain needs_review until explicitly approved.",
    ],
  } satisfies Omit<OntologyDiscoverySample, "sample_hash">;
  return {
    ...sampleBase,
    sample_hash: sha256(sampleBase),
  };
}

function knownEvidenceRefs(sample?: OntologyDiscoverySample): Set<string> | null {
  if (!sample) return null;
  return new Set([
    ...sample.files.map((file) => file.id),
    ...sample.registry_records.map((record) => record.id),
  ]);
}

function allowedPathFor(kind: OntologyDiscoveryProposalKind, path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.includes("..")) return false;
  if (kind === "node_type") return path.startsWith("/node_types/");
  if (kind === "relation_type") return path.startsWith("/relation_types/");
  if (kind === "registry_binding") return path.startsWith("/registries/");
  return (
    path.startsWith("/hardening/") ||
    path.startsWith("/inference_policy/") ||
    path.startsWith("/evidence_policy/") ||
    path.startsWith("/hierarchies/")
  );
}

function summarize(operations: OntologyProfileDiffOperation[]): OntologyProfileDiff["summary"] {
  return {
    node_types_added: operations.filter((op) => op.op === "add" && op.path.startsWith("/node_types/")).length,
    relation_types_added: operations.filter((op) => op.op === "add" && op.path.startsWith("/relation_types/")).length,
    registry_bindings_added: operations.filter((op) => op.op === "add" && op.path.startsWith("/registries/")).length,
    hardening_rules_added: operations.filter((op) =>
      op.op === "add" &&
      (op.path.startsWith("/hardening/") ||
        op.path.startsWith("/inference_policy/") ||
        op.path.startsWith("/evidence_policy/") ||
        op.path.startsWith("/hierarchies/")),
    ).length,
  };
}

export function buildOntologyDiscoveryDiff(
  profile: NormalizedOntologyProfile,
  proposalsFile: OntologyDiscoveryProposalsFile,
  sample?: OntologyDiscoverySample,
): OntologyProfileDiff {
  const issues: OntologyProfileDiffIssue[] = [];
  const operations: OntologyProfileDiffOperation[] = [];
  const evidenceRefs = knownEvidenceRefs(sample);

  if (proposalsFile.schema !== ONTOLOGY_DISCOVERY_PROPOSALS_SCHEMA) {
    issues.push({ severity: "error", message: `Unsupported discovery proposals schema: ${proposalsFile.schema}` });
  }
  if (proposalsFile.profile_hash !== profile.profile_hash) {
    issues.push({
      severity: "error",
      message: `Proposal profile_hash ${proposalsFile.profile_hash} does not match ${profile.profile_hash}`,
    });
  }
  if (sample && proposalsFile.sample_hash && proposalsFile.sample_hash !== sample.sample_hash) {
    issues.push({
      severity: "error",
      message: `Proposal sample_hash ${proposalsFile.sample_hash} does not match ${sample.sample_hash}`,
    });
  }

  for (const proposal of proposalsFile.proposals ?? []) {
    const proposalIssues: string[] = [];
    if (!allowedPathFor(proposal.kind, proposal.path)) {
      proposalIssues.push(`Path ${proposal.path} is not valid for proposal kind ${proposal.kind}`);
    }
    const refs = proposal.evidence_refs ?? [];
    if (refs.length === 0) {
      proposalIssues.push("Discovery proposals require at least one evidence_ref");
    }
    if (evidenceRefs) {
      for (const ref of refs) {
        if (!evidenceRefs.has(ref)) proposalIssues.push(`Unknown evidence_ref: ${ref}`);
      }
    }
    for (const message of proposalIssues) {
      issues.push({ proposal_id: proposal.id, severity: "error", message });
    }
    if (proposalIssues.length > 0) continue;
    operations.push({
      op: proposal.action,
      path: proposal.path,
      ...(proposal.value !== undefined ? { value: proposal.value } : {}),
      proposal_id: proposal.id,
      evidence_refs: refs,
      review_status: "needs_review",
    });
  }

  return {
    schema: ONTOLOGY_PROFILE_DIFF_SCHEMA,
    base_profile_hash: profile.profile_hash,
    proposal_hash: sha256(proposalsFile),
    ...(proposalsFile.sample_hash ? { sample_hash: proposalsFile.sample_hash } : {}),
    mutates_profile: false,
    requires_user_approval: true,
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
    operations,
    summary: summarize(operations),
  };
}

export function ontologyDiscoveryDiffToMarkdown(diff: OntologyProfileDiff): string {
  const issueLines = diff.issues.length === 0
    ? ["- none"]
    : diff.issues.map((issue) => `- ${issue.severity}: ${issue.proposal_id ? `${issue.proposal_id}: ` : ""}${issue.message}`);
  const operationLines = diff.operations.length === 0
    ? ["- none"]
    : diff.operations.map((operation) =>
      `- ${operation.op} ${operation.path} (${operation.review_status}, evidence: ${operation.evidence_refs.join(", ")})`,
    );
  return [
    "# Graphify Ontology Discovery Diff",
    "",
    `Profile hash: ${diff.base_profile_hash}`,
    `Proposal hash: ${diff.proposal_hash}`,
    `Valid: ${diff.valid}`,
    `Mutates profile: ${diff.mutates_profile}`,
    `Requires user approval: ${diff.requires_user_approval}`,
    "",
    "## Summary",
    `- node_types_added: ${diff.summary.node_types_added}`,
    `- relation_types_added: ${diff.summary.relation_types_added}`,
    `- registry_bindings_added: ${diff.summary.registry_bindings_added}`,
    `- hardening_rules_added: ${diff.summary.hardening_rules_added}`,
    "",
    "## Issues",
    ...issueLines,
    "",
    "## Operations",
    ...operationLines,
    "",
  ].join("\n");
}

export function loadOntologyDiscoveryContext(profileStatePath: string): OntologyDiscoveryContext {
  const resolvedStatePath = resolve(profileStatePath);
  const profileDir = dirname(resolvedStatePath);
  const registriesDir = join(profileDir, "registries");
  const registries: Record<string, RegistryRecord[]> = {};
  if (existsSync(registriesDir)) {
    for (const file of readdirSync(registriesDir)) {
      if (file.endsWith(".json")) {
        registries[file.slice(0, -".json".length)] = readJson<RegistryRecord[]>(join(registriesDir, file));
      }
    }
  }
  const projectConfigPath = join(profileDir, "project-config.normalized.json");
  const semanticDetectionPath = join(profileDir, "semantic-detection.json");
  return {
    profileState: readJson<ProfileState>(resolvedStatePath),
    profile: readJson<NormalizedOntologyProfile>(join(profileDir, "ontology-profile.normalized.json")),
    ...(existsSync(projectConfigPath) ? { projectConfig: readJson<NormalizedProjectConfig>(projectConfigPath) } : {}),
    ...(existsSync(semanticDetectionPath) ? { semanticDetection: readJson<DetectionResult>(semanticDetectionPath) } : {}),
    registries,
  };
}

export function writeOntologyDiscoverySample(path: string, sample: OntologyDiscoverySample): void {
  writeJson(path, sample);
}

export function writeOntologyDiscoveryDiff(path: string, diff: OntologyProfileDiff): void {
  writeJson(path, diff);
}
