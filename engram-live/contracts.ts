// @sentropic/engram-live/contracts — built, data-pure contract export
// (spec/SPEC_LIVE_GIT_INDEXING.md §3, §11; plan/09 L1b).
//
// This module is data-pure: DTOs, constants and validators only. It takes no
// imports at all — neither node: builtins, host types, model modules nor
// storage drivers. The executable factory lives in ./integration.js; hosts
// import only this contract at the adapter boundary and lazily load the
// factory when they compose live (§3).

export const CONTRACT_NAME = "@sentropic/engram-live/contracts";
export const CONTRACT_VERSION = 1;
export const PRODUCER_NAME = "engram-live";
export const POLICY_VERSION = "live-git-indexing/1";

// The L1b package supplies package/factory seams and grammar loading only.
// Extraction reuse lands in L5 with its cache/grammar injection and a
// closure recheck; every capability below stays explicitly unavailable
// until its lot implements and verifies it.
export type CapabilityId =
  | "refs"
  | "history-dag"
  | "github-pr"
  | "index-snapshot"
  | "working-tree"
  | "diffs"
  | "code-analysis"
  | "retention-requests"
  | "reconciliation"
  | "publication";

export const CAPABILITY_IDS: readonly CapabilityId[] = [
  "refs",
  "history-dag",
  "github-pr",
  "index-snapshot",
  "working-tree",
  "diffs",
  "code-analysis",
  "retention-requests",
  "reconciliation",
  "publication",
];

/** The lot that implements each capability; part of the advertised contract. */
export const CAPABILITY_PLANNED_LOTS: Readonly<Record<CapabilityId, string>> = {
  "refs": "L2a",
  "history-dag": "L2b",
  "github-pr": "P1",
  "index-snapshot": "L4a",
  "working-tree": "L4a",
  "diffs": "L4b",
  "code-analysis": "L5",
  "retention-requests": "R1",
  "reconciliation": "L6b",
  "publication": "L6b",
};

export const NOT_IMPLEMENTED_REASON =
  "engram-live L1b supplies the package/factory seams and grammar loading only; this capability is explicitly unavailable until its lot lands";

export type CapabilityState = "available" | "unavailable";

export interface CapabilityStatus {
  readonly capability: CapabilityId;
  readonly state: CapabilityState;
  readonly reason: string;
  readonly plannedLot: string;
}

export function describeCapabilities(): readonly CapabilityStatus[] {
  return CAPABILITY_IDS.map((capability) => ({
    capability,
    state: "unavailable" as const,
    reason: NOT_IMPLEMENTED_REASON,
    plannedLot: CAPABILITY_PLANNED_LOTS[capability],
  }));
}

// — Coverage (spec §12): every axis distinguishes current work from explicit
// unavailability; a missing capability is never an empty success.

export type CoverageState = "current" | "pending" | "partial" | "stale" | "unavailable";

export const COVERAGE_AXES: readonly string[] = [
  "refs",
  "dag",
  "pr-metadata",
  "object-availability",
  "pr-attribution",
  "ast",
  "index",
  "working-tree",
  "remote-publication",
];

export interface CoverageReport {
  readonly axis: string;
  readonly language?: string;
  readonly state: CoverageState;
  readonly reason?: string;
  readonly checkedAt: number;
}

// — Core scope DTOs (spec §3): every fact and lookup is scoped by tenant and
// clone, then by worktree as applicable. Copyable, data-pure.

export interface LiveScope {
  readonly tenant: string;
  readonly clone: string;
  readonly worktree?: string;
}

export interface WorkspaceDeclarationDto {
  readonly tenant: string;
  readonly principal: string;
  readonly hostFingerprint: string;
  readonly authorizedRoots: readonly string[];
  readonly liveCapability: "live";
  readonly policyVersion: string;
  readonly declarationRevision: number;
  readonly serverWorkspaceId?: string;
}

export interface FactBatchDto {
  readonly scope: LiveScope;
  readonly producerName: string;
  readonly contractVersion: number;
  readonly policyVersion: string;
  readonly generationId: string;
  readonly batchId: string;
  readonly batchDigest: string;
  readonly facts: readonly unknown[];
}

// — Grammar coverage: the packaged WASM matrix is explicit; an absent
// grammar reports unavailable coverage and is never silently skipped.

export interface GrammarCoverageDto {
  readonly axis: "ast";
  readonly language: string;
  readonly state: CoverageState;
  readonly reason: string;
}

/** Languages with a pinned, packaged tree-sitter WASM grammar (L1b matrix). */
export const ADVERTISED_LANGUAGES: readonly string[] = [
  "c",
  "cpp",
  "go",
  "java",
  "javascript",
  "php",
  "python",
  "ruby",
  "rust",
  "typescript",
  "tsx",
];

export const GRAMMAR_UNAVAILABLE_REASON = "no packaged grammar is pinned for this language; AST coverage is explicitly unavailable";

// — Pure validators. Every unknown input yields an explicit error list;
// validators never throw, call a host, or normalize silently.

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function validateLiveScope(scope: unknown): ValidationResult {
  if (!isRecord(scope)) return { ok: false, errors: ["scope must be an object"] };
  const errors: string[] = [];
  if (!isNonEmptyString(scope.tenant)) errors.push("scope.tenant must be a non-empty string");
  if (!isNonEmptyString(scope.clone)) errors.push("scope.clone must be a non-empty string");
  if (scope.worktree !== undefined && !isNonEmptyString(scope.worktree)) {
    errors.push("scope.worktree, when present, must be a non-empty string");
  }
  return { ok: errors.length === 0, errors };
}

export function validateWorkspaceDeclaration(declaration: unknown): ValidationResult {
  if (!isRecord(declaration)) return { ok: false, errors: ["declaration must be an object"] };
  const errors: string[] = [];
  if (!isNonEmptyString(declaration.tenant)) errors.push("declaration.tenant must be a non-empty string");
  if (!isNonEmptyString(declaration.principal)) errors.push("declaration.principal must be a non-empty string");
  if (!isNonEmptyString(declaration.hostFingerprint)) {
    errors.push("declaration.hostFingerprint must be a non-empty string");
  }
  if (!Array.isArray(declaration.authorizedRoots) || declaration.authorizedRoots.length === 0) {
    errors.push("declaration.authorizedRoots must be a non-empty array");
  } else if (declaration.authorizedRoots.some((path: unknown) => !isNonEmptyString(path))) {
    errors.push("declaration.authorizedRoots entries must be non-empty strings");
  }
  if (declaration.liveCapability !== "live") {
    errors.push('declaration.liveCapability must be the explicit string "live" (bind/upload is not activation)');
  }
  if (!isNonEmptyString(declaration.policyVersion)) {
    errors.push("declaration.policyVersion must be a non-empty string");
  }
  if (!isNonNegativeInteger(declaration.declarationRevision)) {
    errors.push("declaration.declarationRevision must be a non-negative integer");
  }
  if (declaration.serverWorkspaceId !== undefined && !isNonEmptyString(declaration.serverWorkspaceId)) {
    errors.push("declaration.serverWorkspaceId, when present, must be a non-empty string");
  }
  return { ok: errors.length === 0, errors };
}

export function validateFactBatch(batch: unknown): ValidationResult {
  if (!isRecord(batch)) return { ok: false, errors: ["batch must be an object"] };
  const errors: string[] = [];
  const scope = validateLiveScope(batch.scope);
  if (!scope.ok) errors.push(...scope.errors.map((error) => `batch.scope: ${error}`));
  if (batch.producerName !== PRODUCER_NAME) errors.push(`batch.producerName must be "${PRODUCER_NAME}"`);
  if (batch.contractVersion !== CONTRACT_VERSION) {
    errors.push(`batch.contractVersion must be ${CONTRACT_VERSION}`);
  }
  if (!isNonEmptyString(batch.policyVersion)) errors.push("batch.policyVersion must be a non-empty string");
  if (!isNonEmptyString(batch.generationId)) errors.push("batch.generationId must be a non-empty string");
  if (!isNonEmptyString(batch.batchId)) errors.push("batch.batchId must be a non-empty string");
  if (!isNonEmptyString(batch.batchDigest)) errors.push("batch.batchDigest must be a non-empty string");
  if (!Array.isArray(batch.facts)) errors.push("batch.facts must be an array");
  return { ok: errors.length === 0, errors };
}

// Same identity, same bytes is idempotent; same identity, different bytes is
// refused (spec §3). Pure decision over validated batches.
export function classifyDuplicateBatch(
  previous: FactBatchDto,
  next: FactBatchDto,
): "idempotent" | "refused" {
  if (previous.batchId !== next.batchId) {
    throw new Error("classifyDuplicateBatch compares the same batch identity only");
  }
  return previous.batchDigest === next.batchDigest ? "idempotent" : "refused";
}
