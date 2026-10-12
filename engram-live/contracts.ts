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
  readonly serverIssuer?: string;
  readonly bindingRevision?: number;
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

// Exact-key enforcement (L6a): every DTO validator rejects unknown keys so
// a misspelled or smuggled field can never pass as a valid declaration,
// clone, worktree, batch or revocation.
function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key} is not a known key`);
  }
}

const LIVE_SCOPE_KEYS: readonly string[] = ["tenant", "clone", "worktree"];

export function validateLiveScope(scope: unknown): ValidationResult {
  if (!isRecord(scope)) return { ok: false, errors: ["scope must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(scope, LIVE_SCOPE_KEYS, "scope", errors);
  if (!isNonEmptyString(scope.tenant)) errors.push("scope.tenant must be a non-empty string");
  if (!isNonEmptyString(scope.clone)) errors.push("scope.clone must be a non-empty string");
  if (scope.worktree !== undefined && !isNonEmptyString(scope.worktree)) {
    errors.push("scope.worktree, when present, must be a non-empty string");
  }
  return { ok: errors.length === 0, errors };
}

const WORKSPACE_DECLARATION_KEYS: readonly string[] = [
  "tenant",
  "principal",
  "hostFingerprint",
  "authorizedRoots",
  "liveCapability",
  "policyVersion",
  "declarationRevision",
  "serverWorkspaceId",
  "serverIssuer",
  "bindingRevision",
];

export function validateWorkspaceDeclaration(declaration: unknown): ValidationResult {
  if (!isRecord(declaration)) return { ok: false, errors: ["declaration must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(declaration, WORKSPACE_DECLARATION_KEYS, "declaration", errors);
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
  if (declaration.serverIssuer !== undefined && !isNonEmptyString(declaration.serverIssuer)) {
    errors.push("declaration.serverIssuer, when present, must be a non-empty string");
  }
  if (declaration.bindingRevision !== undefined && !isNonNegativeInteger(declaration.bindingRevision)) {
    errors.push("declaration.bindingRevision, when present, must be a non-negative integer");
  }
  // Product live intent binds server/issuer, (serverWorkspaceId,
  // hostFingerprint) and binding revision together (spec §12): a server
  // workspace without its binding revision, or an issuer/revision without
  // the server workspace, is not a valid product binding. Absence of all
  // three is a valid local-only declaration requiring no enrollment.
  if (declaration.serverWorkspaceId !== undefined && declaration.bindingRevision === undefined) {
    errors.push("declaration.bindingRevision is required when declaration.serverWorkspaceId is present");
  }
  if (declaration.serverIssuer !== undefined && declaration.serverWorkspaceId === undefined) {
    errors.push("declaration.serverWorkspaceId is required when declaration.serverIssuer is present");
  }
  if (declaration.bindingRevision !== undefined && declaration.serverWorkspaceId === undefined) {
    errors.push("declaration.serverWorkspaceId is required when declaration.bindingRevision is present");
  }
  return { ok: errors.length === 0, errors };
}

const FACT_BATCH_KEYS: readonly string[] = [
  "scope",
  "producerName",
  "contractVersion",
  "policyVersion",
  "generationId",
  "batchId",
  "batchDigest",
  "facts",
];

export function validateFactBatch(batch: unknown): ValidationResult {
  if (!isRecord(batch)) return { ok: false, errors: ["batch must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(batch, FACT_BATCH_KEYS, "batch", errors);
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

// — L6a: explicit host declarations and clone identity
// (spec/SPEC_LIVE_GIT_INDEXING.md §§2–3, 10, 12; plan/09 L6a; owner Q4 A).
//
// Consumer contract for the h2a (H) and cluster-mesh/sentropic (S) seats.
// H owns durable local declarations plus clone/worktree resolution
// (live-registration.ts, live-declarations.ts, data-pure DTOs); S owns the
// registration persistence, product declarations and migrations; engram
// owns only this data-pure contract and the pure functions in
// ./registration.js. Read this block before implementing either host side.
//
// - Explicit opt-in, once per workspace, through h2a/cluster-mesh. Only
//   liveCapability "live" (EXPLICIT_LIVE_CAPABILITY) activates collection.
//   Bind, upload, code-workspace creation, session opening or session
//   ending never activate or remove a declaration
//   (NON_ACTIVATING_LIFECYCLE_KINDS). Replay of a stored declaration after
//   projection loss resumes work without renewed activation.
// - Engram neutrality: this module takes no imports of any kind (no h2a,
//   no sentropic, no storage driver, no network); registration.ts adds pure
//   functions with no host state, no storage and no network. Durable state
//   belongs to the hosts — local h2a state outside source roots plus
//   app-operated product persistence — independent of the live projection.
// - Workspace fingerprint vs clone identity: the public h2a `ws:`
//   fingerprint stays on the declaration (hostFingerprint) and is never
//   the sole clone key. The clone key is the (hostScope, common-dir
//   project fingerprint, common-dir realpath) triple. Two clones with an
//   equal project fingerprint remain distinct; linked worktrees sharing one
//   common-dir share one clone with isolated worktree identities. The
//   common-dir realpath is host-local and never published to sentropic:
//   share only the opaque cloneId.
// - Revisions increment by exactly one, preserve tenant/principal/
//   hostFingerprint, and revalidate rebinding (a changed serverWorkspaceId
//   requires a new bindingRevision). The host must additionally refuse to
//   redirect in-flight collection/publication on rebind.
// - Revocation is a private-purge request: the host stops work, rejects
//   delayed jobs, and purges private snapshots, derived indexes and
//   decryptability, while preserving authorized committed history. Purging
//   never deletes committed facts.

/** The only capability value that activates live collection (Q4 A). */
export const EXPLICIT_LIVE_CAPABILITY = "live" as const;

/**
 * Lifecycle kinds that never activate or remove a live declaration:
 * enrollment bind, transcript upload, code-workspace creation and agent
 * session open/end are distinct capabilities (spec §12).
 */
export const NON_ACTIVATING_LIFECYCLE_KINDS = [
  "bind",
  "upload",
  "code-workspace-create",
  "session-open",
  "session-end",
] as const;

export type NonActivatingLifecycleKind = (typeof NON_ACTIVATING_LIFECYCLE_KINDS)[number];

export function isNonActivatingLifecycleKind(value: unknown): value is NonActivatingLifecycleKind {
  return (
    typeof value === "string" &&
    (NON_ACTIVATING_LIFECYCLE_KINDS as readonly string[]).includes(value)
  );
}

export const OID_ALGORITHMS = ["sha1", "sha256"] as const;

export type OidAlgorithm = (typeof OID_ALGORITHMS)[number];

export const REVOCATION_REASONS = ["workspace-remove", "owner-request", "policy-withdrawn"] as const;

export type RevocationReason = (typeof REVOCATION_REASONS)[number];

export function isRevocationReason(value: unknown): value is RevocationReason {
  return (
    typeof value === "string" &&
    (REVOCATION_REASONS as readonly string[]).includes(value)
  );
}

/**
 * Local clone identity. hostScope bounds the clone to one host;
 * commonDirProjectFingerprint is the project fingerprint computed over the
 * common-dir history with the empty main-worktree component (spec §12);
 * commonDirRealpath is the host-resolved common-dir path (host-local only,
 * never published to sentropic); cloneId is the scoped opaque identifier
 * safe to share; oidAlgorithm records the repository object format.
 */
export interface CloneIdentityDto {
  readonly hostScope: string;
  readonly commonDirProjectFingerprint: string;
  readonly commonDirRealpath: string;
  readonly cloneId: string;
  readonly oidAlgorithm: OidAlgorithm;
}

/**
 * Worktree identity: one shared cloneId plus an isolated per-worktree
 * fingerprint, path and resolved git-dir. Linked worktrees share only
 * authorized immutable analyses; index snapshots and context-dependent
 * resolution stay worktree-local (spec §§3, 15).
 */
export interface WorktreeIdentityDto {
  readonly cloneId: string;
  readonly worktreePath: string;
  readonly gitDir: string;
  readonly worktreeFingerprint: string;
}

/**
 * Private-purge request carried by every revocation. All purges are `true`
 * and committed history is always preserved: there is no field authorizing
 * deletion of committed facts.
 */
export interface PrivatePurgeRequestDto {
  readonly purgePrivateSnapshots: true;
  readonly purgeDerivedIndexes: true;
  readonly revokeDecryptability: true;
  readonly preserveCommittedHistory: true;
}

/** Revocation of one declaration revision: purge private state, keep history. */
export interface DeclarationRevocationDto {
  readonly tenant: string;
  readonly hostFingerprint: string;
  readonly declarationRevision: number;
  readonly reason: RevocationReason;
  readonly requestPrivatePurge: PrivatePurgeRequestDto;
}

const CLONE_IDENTITY_KEYS: readonly string[] = [
  "hostScope",
  "commonDirProjectFingerprint",
  "commonDirRealpath",
  "cloneId",
  "oidAlgorithm",
];

const WORKTREE_IDENTITY_KEYS: readonly string[] = [
  "cloneId",
  "worktreePath",
  "gitDir",
  "worktreeFingerprint",
];

const PRIVATE_PURGE_REQUEST_KEYS: readonly string[] = [
  "purgePrivateSnapshots",
  "purgeDerivedIndexes",
  "revokeDecryptability",
  "preserveCommittedHistory",
];

const DECLARATION_REVOCATION_KEYS: readonly string[] = [
  "tenant",
  "hostFingerprint",
  "declarationRevision",
  "reason",
  "requestPrivatePurge",
];

/**
 * Lexical normalization applied to the host-resolved common-dir realpath
 * before key derivation: trailing slashes are stripped (the filesystem
 * root alone is kept). The host resolves symlinks to the realpath before
 * calling; this function performs no I/O.
 */
export function normalizeCommonDirRealpath(realpath: string): string {
  if (realpath.length > 1) {
    const stripped = realpath.replace(/\/+$/, "");
    return stripped.length === 0 ? "/" : stripped;
  }
  return realpath;
}

/**
 * Canonical clone key binding host scope, project fingerprint and normalized
 * common-dir realpath, NUL-joined so no component boundary is ambiguous.
 * Hosts hash this string (e.g. SHA-256) to mint the opaque cloneId; the
 * canonical key itself stays host-local with the realpath.
 */
export function canonicalCloneKey(input: {
  readonly hostScope: string;
  readonly commonDirProjectFingerprint: string;
  readonly commonDirRealpath: string;
}): string {
  const normalized = normalizeCommonDirRealpath(input.commonDirRealpath);
  return `${input.hostScope}\0${input.commonDirProjectFingerprint}\0${normalized}`;
}

export function validateCloneIdentity(identity: unknown): ValidationResult {
  if (!isRecord(identity)) return { ok: false, errors: ["cloneIdentity must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(identity, CLONE_IDENTITY_KEYS, "cloneIdentity", errors);
  if (!isNonEmptyString(identity.hostScope)) errors.push("cloneIdentity.hostScope must be a non-empty string");
  if (!isNonEmptyString(identity.commonDirProjectFingerprint)) {
    errors.push("cloneIdentity.commonDirProjectFingerprint must be a non-empty string");
  }
  if (!isNonEmptyString(identity.commonDirRealpath)) {
    errors.push("cloneIdentity.commonDirRealpath must be a non-empty string");
  }
  if (!isNonEmptyString(identity.cloneId)) {
    errors.push("cloneIdentity.cloneId must be a non-empty string");
  } else if (!(identity.cloneId as string).startsWith("clone:")) {
    errors.push('cloneIdentity.cloneId must be a scoped opaque id starting with "clone:"');
  }
  if (identity.oidAlgorithm !== "sha1" && identity.oidAlgorithm !== "sha256") {
    errors.push('cloneIdentity.oidAlgorithm must be "sha1" or "sha256"');
  }
  return { ok: errors.length === 0, errors };
}

export function validateWorktreeIdentity(identity: unknown): ValidationResult {
  if (!isRecord(identity)) return { ok: false, errors: ["worktreeIdentity must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(identity, WORKTREE_IDENTITY_KEYS, "worktreeIdentity", errors);
  if (!isNonEmptyString(identity.cloneId)) errors.push("worktreeIdentity.cloneId must be a non-empty string");
  if (!isNonEmptyString(identity.worktreePath)) {
    errors.push("worktreeIdentity.worktreePath must be a non-empty string");
  }
  if (!isNonEmptyString(identity.gitDir)) errors.push("worktreeIdentity.gitDir must be a non-empty string");
  if (!isNonEmptyString(identity.worktreeFingerprint)) {
    errors.push("worktreeIdentity.worktreeFingerprint must be a non-empty string");
  }
  return { ok: errors.length === 0, errors };
}

export function validatePrivatePurgeRequest(request: unknown): ValidationResult {
  if (!isRecord(request)) return { ok: false, errors: ["requestPrivatePurge must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(request, PRIVATE_PURGE_REQUEST_KEYS, "requestPrivatePurge", errors);
  if (request.purgePrivateSnapshots !== true) {
    errors.push("requestPrivatePurge.purgePrivateSnapshots must be true (revocation always purges private snapshots)");
  }
  if (request.purgeDerivedIndexes !== true) {
    errors.push("requestPrivatePurge.purgeDerivedIndexes must be true (revocation always purges derived indexes)");
  }
  if (request.revokeDecryptability !== true) {
    errors.push("requestPrivatePurge.revokeDecryptability must be true (revocation always revokes decryptability)");
  }
  if (request.preserveCommittedHistory !== true) {
    errors.push("requestPrivatePurge.preserveCommittedHistory must be true (revocation never deletes committed history)");
  }
  return { ok: errors.length === 0, errors };
}

export function validateDeclarationRevocation(revocation: unknown): ValidationResult {
  if (!isRecord(revocation)) return { ok: false, errors: ["revocation must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(revocation, DECLARATION_REVOCATION_KEYS, "revocation", errors);
  if (!isNonEmptyString(revocation.tenant)) errors.push("revocation.tenant must be a non-empty string");
  if (!isNonEmptyString(revocation.hostFingerprint)) {
    errors.push("revocation.hostFingerprint must be a non-empty string");
  }
  if (!isNonNegativeInteger(revocation.declarationRevision)) {
    errors.push("revocation.declarationRevision must be a non-negative integer");
  }
  if (!isRevocationReason(revocation.reason)) {
    errors.push(`revocation.reason must be one of ${REVOCATION_REASONS.join(", ")}`);
  }
  const purge = validatePrivatePurgeRequest(revocation.requestPrivatePurge);
  if (!purge.ok) errors.push(...purge.errors.map((error) => `revocation.${error}`));
  return { ok: errors.length === 0, errors };
}
