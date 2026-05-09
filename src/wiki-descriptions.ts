import { createHash } from "node:crypto";
import type { LlmExecutionMode } from "./llm-execution.js";

export const WIKI_DESCRIPTION_SCHEMA = "graphify_wiki_description_v1" as const;
export const WIKI_DESCRIPTION_PROMPT_VERSION = "wiki-description-v1" as const;

export type WikiDescriptionTargetKind = "node" | "community";
export type WikiDescriptionStatus = "generated" | "insufficient_evidence";
export type WikiDescriptionExecutionMode = LlmExecutionMode;
export type WikiDescriptionEvidenceRef = string;

export interface WikiDescriptionGenerator<
  TMode extends WikiDescriptionExecutionMode = WikiDescriptionExecutionMode,
  TModel extends string | null = string | null,
> {
  mode: TMode;
  provider: string | null;
  model: TModel;
  prompt_version: string;
}

export interface WikiDescriptionCacheKeyInput<
  TTargetKind extends WikiDescriptionTargetKind = WikiDescriptionTargetKind,
  TMode extends WikiDescriptionExecutionMode = WikiDescriptionExecutionMode,
> {
  target_id: string;
  target_kind: TTargetKind;
  graph_hash: string;
  prompt_version: string;
  mode: TMode;
  provider?: string | null;
  model?: string | null;
}

interface WikiDescriptionSidecarBase<
  TTargetKind extends WikiDescriptionTargetKind,
  TTargetId extends string,
  TMode extends WikiDescriptionExecutionMode,
> {
  schema: typeof WIKI_DESCRIPTION_SCHEMA;
  target_id: TTargetId;
  target_kind: TTargetKind;
  graph_hash: string;
  status: WikiDescriptionStatus;
  cache_key: string;
  generator: WikiDescriptionGenerator<TMode>;
  created_at?: string;
}

export interface WikiGeneratedDescriptionSidecar<
  TTargetKind extends WikiDescriptionTargetKind = WikiDescriptionTargetKind,
  TEvidenceRef extends WikiDescriptionEvidenceRef = WikiDescriptionEvidenceRef,
  TTargetId extends string = string,
  TMode extends WikiDescriptionExecutionMode = WikiDescriptionExecutionMode,
> extends WikiDescriptionSidecarBase<TTargetKind, TTargetId, TMode> {
  status: "generated";
  description: string;
  evidence_refs: [TEvidenceRef, ...TEvidenceRef[]];
  confidence: number;
}

export interface WikiInsufficientEvidenceSidecar<
  TTargetKind extends WikiDescriptionTargetKind = WikiDescriptionTargetKind,
  TTargetId extends string = string,
  TMode extends WikiDescriptionExecutionMode = WikiDescriptionExecutionMode,
> extends WikiDescriptionSidecarBase<TTargetKind, TTargetId, TMode> {
  status: "insufficient_evidence";
  description: null;
  evidence_refs: [];
  confidence: null;
}

export type WikiDescriptionSidecar<
  TTargetKind extends WikiDescriptionTargetKind = WikiDescriptionTargetKind,
  TEvidenceRef extends WikiDescriptionEvidenceRef = WikiDescriptionEvidenceRef,
  TTargetId extends string = string,
  TMode extends WikiDescriptionExecutionMode = WikiDescriptionExecutionMode,
> =
  | WikiGeneratedDescriptionSidecar<TTargetKind, TEvidenceRef, TTargetId, TMode>
  | WikiInsufficientEvidenceSidecar<TTargetKind, TTargetId, TMode>;

export type WikiNodeDescriptionSidecar<
  TEvidenceRef extends WikiDescriptionEvidenceRef = WikiDescriptionEvidenceRef,
  TTargetId extends string = string,
  TMode extends WikiDescriptionExecutionMode = WikiDescriptionExecutionMode,
> = WikiDescriptionSidecar<"node", TEvidenceRef, TTargetId, TMode>;

export type WikiCommunityDescriptionSidecar<
  TEvidenceRef extends WikiDescriptionEvidenceRef = WikiDescriptionEvidenceRef,
  TTargetId extends string = string,
  TMode extends WikiDescriptionExecutionMode = WikiDescriptionExecutionMode,
> = WikiDescriptionSidecar<"community", TEvidenceRef, TTargetId, TMode>;

export interface WikiDescriptionSidecarIndex<
  TNodeId extends string = string,
  TCommunityId extends string = string,
> {
  schema: "graphify_wiki_description_index_v1";
  graph_hash: string;
  prompt_version: string;
  nodes: Record<TNodeId, WikiNodeDescriptionSidecar>;
  communities?: Record<TCommunityId, WikiCommunityDescriptionSidecar>;
}

export interface CreateInsufficientEvidenceRecordInput<
  TTargetKind extends WikiDescriptionTargetKind = WikiDescriptionTargetKind,
  TTargetId extends string = string,
  TMode extends WikiDescriptionExecutionMode = WikiDescriptionExecutionMode,
> extends WikiDescriptionCacheKeyInput<TTargetKind, TMode> {
  target_id: TTargetId;
  created_at?: string;
}

const VALID_TARGET_KINDS = new Set<WikiDescriptionTargetKind>(["node", "community"]);
const VALID_STATUSES = new Set<WikiDescriptionStatus>(["generated", "insufficient_evidence"]);
const VALID_MODES = new Set<WikiDescriptionExecutionMode>(["assistant", "direct", "batch", "mesh"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildWikiDescriptionCacheKey(input: WikiDescriptionCacheKeyInput): string {
  return sha256(JSON.stringify({
    schema: WIKI_DESCRIPTION_SCHEMA,
    target_id: input.target_id,
    target_kind: input.target_kind,
    graph_hash: input.graph_hash,
    prompt_version: input.prompt_version,
    mode: input.mode,
    provider: input.provider ?? null,
    model: input.model ?? null,
  }));
}

export function createInsufficientEvidenceRecord<
  TTargetKind extends WikiDescriptionTargetKind,
  TTargetId extends string,
  TMode extends WikiDescriptionExecutionMode,
>(
  input: CreateInsufficientEvidenceRecordInput<TTargetKind, TTargetId, TMode>,
): WikiInsufficientEvidenceSidecar<TTargetKind, TTargetId, TMode> {
  const provider = input.provider ?? input.mode;
  const model = input.model ?? null;
  const record: WikiInsufficientEvidenceSidecar<TTargetKind, TTargetId, TMode> = {
    schema: WIKI_DESCRIPTION_SCHEMA,
    target_id: input.target_id,
    target_kind: input.target_kind,
    graph_hash: input.graph_hash,
    status: "insufficient_evidence",
    description: null,
    evidence_refs: [],
    confidence: null,
    cache_key: buildWikiDescriptionCacheKey({ ...input, provider, model }),
    generator: {
      mode: input.mode,
      provider,
      model,
      prompt_version: input.prompt_version,
    },
  };
  if (input.created_at !== undefined) record.created_at = input.created_at;
  return record;
}

export function validateWikiDescriptionSidecar(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["wiki description sidecar must be a JSON object"];

  if (value.schema !== WIKI_DESCRIPTION_SCHEMA) {
    issues.push(`schema must be ${WIKI_DESCRIPTION_SCHEMA}`);
  }
  if (!isNonEmptyString(value.target_id)) issues.push("target_id is required");
  if (!VALID_TARGET_KINDS.has(String(value.target_kind) as WikiDescriptionTargetKind)) {
    issues.push("target_kind must be one of node, community");
  }
  if (!isNonEmptyString(value.graph_hash)) issues.push("graph_hash is required");
  if (!VALID_STATUSES.has(String(value.status) as WikiDescriptionStatus)) {
    issues.push("status must be one of generated, insufficient_evidence");
  }
  if (!isNonEmptyString(value.cache_key)) issues.push("cache_key is required");
  if (value.created_at !== undefined && !isNonEmptyString(value.created_at)) {
    issues.push("created_at must be a non-empty ISO-8601 string when present");
  }

  if (!isRecord(value.generator)) {
    issues.push("generator is required");
  } else {
    if (!VALID_MODES.has(String(value.generator.mode) as WikiDescriptionExecutionMode)) {
      issues.push("generator.mode must be one of assistant, direct, batch, mesh");
    }
    if (!isStringOrNull(value.generator.provider) || value.generator.provider === "") {
      issues.push("generator.provider must be a string or null");
    }
    if (!isStringOrNull(value.generator.model)) {
      issues.push("generator.model must be a string or null");
    }
    if (!isNonEmptyString(value.generator.prompt_version)) {
      issues.push("generator.prompt_version is required");
    }
  }

  if (value.status === "generated") {
    if (!isNonEmptyString(value.description)) {
      issues.push("generated descriptions require a non-empty description");
    }
    if (!isStringArray(value.evidence_refs)) {
      issues.push("evidence_refs must be a string array");
    } else if (value.evidence_refs.length === 0) {
      issues.push("generated descriptions require at least one evidence ref");
    } else if (value.evidence_refs.some((item) => item.trim().length === 0)) {
      issues.push("evidence_refs must not contain empty refs");
    }
    if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
      issues.push("generated confidence must be a number between 0 and 1");
    }
  }

  if (value.status === "insufficient_evidence") {
    if (value.description !== null) {
      issues.push("insufficient_evidence descriptions must be null");
    }
    if (!Array.isArray(value.evidence_refs) || value.evidence_refs.length !== 0) {
      issues.push("insufficient_evidence records must have no evidence refs");
    }
    if (value.confidence !== null) {
      issues.push("insufficient_evidence confidence must be null");
    }
  }

  return issues;
}
