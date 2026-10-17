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

// G1: inclusive, one-based ranges over exact committed blob bytes. These
// facts are mapped/persisted by L3a; no producer-side cache grants authority.
export interface LineRangeDto { readonly start: number; readonly end: number }
/** UTF-8 identities retain their normal strings. For each non-UTF-8 field,
 * the raw bytes are authoritative and its string is a reversible latin1
 * projection, independent of any declared commit encoding. */
export interface LineAuthorIdentityDto extends HistoryIdentityDto {
  readonly nameBytes?: Uint8Array;
  readonly emailBytes?: Uint8Array;
}
export interface LineAttributionOptionsDto {
  readonly version: "native-blame-options/1";
  readonly algorithm: "myers";
  readonly moveMinCharacters: number | null;
  /** Copy detection requires an explicit non-null move threshold. */
  readonly copyMinCharacters: number | null;
  /** With copy disabled only the canonical value "all" is admitted. */
  readonly copySearch: "modified" | "created" | "all";
}
export interface LineAttributionRequestDto {
  readonly scope: LiveScope;
  readonly generationId: string;
  readonly target: QualifiedOid;
  readonly path: Uint8Array;
  readonly ranges: readonly LineRangeDto[];
  readonly policyVersion: string;
  readonly options: LineAttributionOptionsDto;
}
export interface LineOriginDto {
  readonly commit: QualifiedOid;
  readonly author: LineAuthorIdentityDto;
  readonly path: Uint8Array;
  readonly originalRange: LineRangeDto;
  readonly finalRange: LineRangeDto;
}
export interface LineParentEvidenceDto {
  readonly commit: QualifiedOid;
  readonly parents: readonly QualifiedOid[];
}
export type LineAttributionGapCause = "missing-retention" | "missing-object" | "missing-path" |
  "shallow" | "excluded" | "unauthorized" | "invalid-range" | "invalid-evidence" | "git-unavailable";
export interface LineAttributionGapDto {
  readonly cause: LineAttributionGapCause;
  readonly reason: string;
}
export interface LineAttributionOutcomeDto extends LineAttributionRequestDto {
  readonly calculationVersion: string;
  readonly gitVersion: string | null;
  /** R1 root whose verified ordered-parent closure contains target; null
   * on partial results, which disclose no additional retained evidence. */
  readonly retainedRoot: QualifiedOid | null;
  readonly state: "complete" | "partial";
  readonly origins: readonly LineOriginDto[];
  readonly parentEvidence: readonly LineParentEvidenceDto[];
  readonly coverage: {
    readonly axis: "line-attribution";
    readonly state: "current" | "partial";
    readonly gaps: readonly LineAttributionGapDto[];
  };
}

/**
 * Explicit live workspace declaration (L6a). Every declaration carries its
 * opaque identity triangle: declarationId (unique per declaration, stable
 * across every revision), plus its cloneId and worktreeId attachment, so a
 * revocation can target exactly one declaration. Identity uncertainty is
 * explicit (LIVE §12): an absent hostFingerprint is valid only when
 * identityUncertainty contains "missing_history". The product binding, when
 * present, is the complete (serverWorkspaceId, serverIssuer, bindingRevision)
 * triplet — never a partial binding.
 */
export interface WorkspaceDeclarationDto {
  readonly tenant: string;
  readonly principal: string;
  readonly hostFingerprint?: string;
  readonly identityUncertainty: readonly IdentityUncertaintyState[];
  readonly declarationId: string;
  readonly cloneId: string;
  readonly worktreeId: string;
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function hasNul(value: unknown): boolean {
  return typeof value === "string" && value.includes("\0");
}

/** Opaque scoped id as minted by the canonical derivation (prefixed, NUL-free). */
function isOpaqueId(value: unknown, prefix: string): value is string {
  return isNonEmptyString(value) && !hasNul(value) && value.startsWith(prefix);
}

function isUncertaintyList(value: unknown): value is readonly IdentityUncertaintyState[] {
  return Array.isArray(value) && value.every((state) => isIdentityUncertaintyState(state));
}

// Exact-key enforcement (L6a): every DTO validator rejects unknown keys so
// a misspelled or smuggled field can never pass as a valid declaration,
// clone, worktree, batch or revocation.
function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]): void {
  // Opaque refusal: unknown keys are caller-supplied data and may carry
  // private text, so the key itself is never interpolated into diagnostics.
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      void key;
      errors.push(`${path} carries an unknown key: refused`);
      return;
    }
  }
}

const LIVE_SCOPE_KEYS: readonly string[] = ["tenant", "clone", "worktree"];

/**
 * Strict opaque scope identifiers (L4b M1: no free text toward the sink).
 * Lowercase alphanumerics plus `.`, `_`, `:` and `-` only: private code with
 * spaces, parentheses or braces never validates as an identifier.
 */
const STRICT_SCOPE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;

function isStrictScopeId(value: unknown): value is string {
  return typeof value === "string" && STRICT_SCOPE_ID.test(value);
}

/** Strict opaque batch/generation/key identifiers: prefixed, charset-closed. */
export function isStrictBatchId(value: unknown, prefix: string): value is string {
  return isStrictScopeId(value) && value.startsWith(prefix) && value.length > prefix.length;
}

/**
 * Fixed-width generation identifiers (L4b-2 m9): `gen:` plus exactly
 * GENERATION_ID_WIDTH zero-padded decimal digits. Lexicographic order is
 * numeric order (`gen:0000000010` > `gen:0000000009`), so a newer delivery
 * is never durably rejected as stale. Producers mint monotone ids per
 * target; the host keeps only the highest accepted generation per target.
 */
export const GENERATION_ID_WIDTH = 10;

export function isStrictGenerationId(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^gen:[0-9]{${GENERATION_ID_WIDTH}}$`).test(value);
}

export function validateLiveScope(scope: unknown): ValidationResult {
  if (!isRecord(scope)) return { ok: false, errors: ["scope must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(scope, LIVE_SCOPE_KEYS, "scope", errors);
  if (!isStrictScopeId(scope.tenant)) errors.push("scope.tenant must be a strict opaque identifier");
  if (!isStrictScopeId(scope.clone)) errors.push("scope.clone must be a strict opaque identifier");
  if (scope.worktree !== undefined && !isStrictScopeId(scope.worktree)) {
    errors.push("scope.worktree, when present, must be a strict opaque identifier");
  }
  return { ok: errors.length === 0, errors };
}

const WORKSPACE_DECLARATION_KEYS: readonly string[] = [
  "tenant",
  "principal",
  "hostFingerprint",
  "identityUncertainty",
  "declarationId",
  "cloneId",
  "worktreeId",
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
  if (!isNonEmptyString(declaration.tenant) || hasNul(declaration.tenant)) {
    errors.push("declaration.tenant must be a non-empty string without NUL");
  }
  if (!isNonEmptyString(declaration.principal) || hasNul(declaration.principal)) {
    errors.push("declaration.principal must be a non-empty string without NUL");
  }
  if (!isUncertaintyList(declaration.identityUncertainty)) {
    errors.push(`declaration.identityUncertainty must be an array of uncertainty states (${IDENTITY_UNCERTAINTY_STATES.join(", ")})`);
  }
  if (declaration.hostFingerprint !== undefined) {
    if (!isNonEmptyString(declaration.hostFingerprint) || hasNul(declaration.hostFingerprint)) {
      errors.push("declaration.hostFingerprint, when present, must be a non-empty string without NUL");
    }
  } else if (!isUncertaintyList(declaration.identityUncertainty) ||
    !(declaration.identityUncertainty as readonly string[]).includes("missing_history")) {
    errors.push('declaration.hostFingerprint is absent: identityUncertainty must explicitly contain "missing_history" (LIVE §12)');
  }
  if (!isOpaqueId(declaration.declarationId, ID_PREFIXES.declaration)) {
    errors.push(`declaration.declarationId must be a non-empty opaque id starting with "${ID_PREFIXES.declaration}"`);
  }
  if (!isOpaqueId(declaration.cloneId, ID_PREFIXES.clone)) {
    errors.push(`declaration.cloneId must be a non-empty opaque id starting with "${ID_PREFIXES.clone}"`);
  }
  if (!isOpaqueId(declaration.worktreeId, ID_PREFIXES.worktree)) {
    errors.push(`declaration.worktreeId must be a non-empty opaque id starting with "${ID_PREFIXES.worktree}"`);
  }
  if (!Array.isArray(declaration.authorizedRoots) || declaration.authorizedRoots.length === 0) {
    errors.push("declaration.authorizedRoots must be a non-empty array");
  } else if (declaration.authorizedRoots.some((path: unknown) => !isNonEmptyString(path) || hasNul(path))) {
    errors.push("declaration.authorizedRoots entries must be non-empty strings without NUL");
  }
  if (declaration.liveCapability !== "live") {
    errors.push('declaration.liveCapability must be the explicit string "live" (bind/upload is not activation)');
  }
  if (declaration.policyVersion !== POLICY_VERSION) {
    errors.push(`declaration.policyVersion must be the fixed live policy version "${POLICY_VERSION}"`);
  }
  if (!isPositiveInteger(declaration.declarationRevision) ||
    declaration.declarationRevision < INITIAL_DECLARATION_REVISION) {
    errors.push(`declaration.declarationRevision must be an integer >= ${INITIAL_DECLARATION_REVISION}`);
  }
  const hasServerWorkspace = declaration.serverWorkspaceId !== undefined;
  const hasServerIssuer = declaration.serverIssuer !== undefined;
  const hasBindingRevision = declaration.bindingRevision !== undefined;
  if (hasServerWorkspace && (!isNonEmptyString(declaration.serverWorkspaceId) || hasNul(declaration.serverWorkspaceId))) {
    errors.push("declaration.serverWorkspaceId, when present, must be a non-empty string without NUL");
  }
  if (hasServerIssuer && (!isNonEmptyString(declaration.serverIssuer) || hasNul(declaration.serverIssuer))) {
    errors.push("declaration.serverIssuer, when present, must be a non-empty string without NUL");
  }
  if (hasBindingRevision && (!isPositiveInteger(declaration.bindingRevision) ||
    declaration.bindingRevision < INITIAL_BINDING_REVISION)) {
    errors.push(`declaration.bindingRevision, when present, must be an integer >= ${INITIAL_BINDING_REVISION}`);
  }
  // Product live intent binds the complete server/issuer/revision triplet
  // (spec §12): a workspace without its issuer or binding revision, an
  // issuer or revision without the workspace, is not a valid product
  // binding. Absence of all three is a valid local-only declaration
  // requiring no enrollment.
  if ((hasServerWorkspace || hasServerIssuer || hasBindingRevision) &&
    !(hasServerWorkspace && hasServerIssuer && hasBindingRevision)) {
    errors.push("the product binding must be the complete serverWorkspaceId + serverIssuer + bindingRevision triplet: a partial binding is not a valid product intent");
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

function validateBatchFact(fact: unknown, index: number): ValidationResult {
  const path = `batch.facts[${index}]`;
  if (!isRecord(fact)) return { ok: false, errors: [`${path} must be an object`] };
  // Sink-bound fact control: every L4b-shaped fact is re-validated at the
  // batch boundary, so a diff carrying transient clair can never ride into
  // a sink inside an otherwise valid envelope. Facts of unknown shape
  // belong to other lots and pass through structurally.
  if ("files" in fact) {
    const checked = validateLocalDiffShape(fact, true);
    if (!checked.ok) return { ok: false, errors: checked.errors.map((error) => `${path}: ${error}`) };
    return { ok: true, errors: [] };
  }
  if ("snapshotId" in fact) {
    const checked = validateLocalSnapshot(fact);
    if (!checked.ok) return { ok: false, errors: checked.errors.map((error) => `${path}: ${error}`) };
    return { ok: true, errors: [] };
  }
  if ("axis" in fact && "state" in fact && "reason" in fact) {
    const checked = validateLocalCoverage(fact);
    if (!checked.ok) return { ok: false, errors: checked.errors.map((error) => `${path}: ${error}`) };
    return { ok: true, errors: [] };
  }
  return { ok: true, errors: [] };
}

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
  if (batch.policyVersion !== CONTENT_POLICY_VERSION) {
    errors.push(`batch.policyVersion must be "${CONTENT_POLICY_VERSION}"`);
  }
  if (!isStrictGenerationId(batch.generationId)) errors.push(`batch.generationId must be a fixed-width generation id ("gen:" plus ${GENERATION_ID_WIDTH} zero-padded digits)`);
  if (!isStrictBatchId(batch.batchId, "batch:")) errors.push("batch.batchId must be a strict opaque batch id");
  if (typeof batch.batchDigest !== "string" || !/^[0-9a-f]{64}$/.test(batch.batchDigest)) {
    errors.push("batch.batchDigest must be a 64 character lowercase hex digest");
  }
  if (!Array.isArray(batch.facts)) {
    errors.push("batch.facts must be an array");
  } else {
    batch.facts.forEach((fact: unknown, index: number) => {
      const checked = validateBatchFact(fact, index);
      if (!checked.ok) errors.push(...checked.errors);
    });
  }
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
// - Opaque identity triangle: every declaration carries a declarationId
//   (unique per declaration, stable across revisions) attached to its
//   cloneId and worktreeId. A revocation names exactly one declaration;
//   withdrawing a whole clone means revoking each of its declarations,
//   each revocation naming its exact declarationId.
// - Workspace fingerprint vs clone identity: the public h2a `ws:`
//   fingerprint stays on the declaration (hostFingerprint) and is never
//   the sole clone key. The clone key is the (hostScope, common-dir
//   realpath, common-dir project fingerprint) triple. Two clones with an
//   equal project fingerprint remain distinct; linked worktrees sharing one
//   common-dir share one clone with isolated worktree identities. The
//   common-dir realpath is host-local and never published to sentropic:
//   share only the opaque cloneId.
// - Identity uncertainty (LIVE §12): a repo without history (unborn HEAD)
//   or with grafted (shallow) history declares explicit uncertainty
//   states; a fingerprint may be absent only under "missing_history".
//   Uncertainty never merges clones: the hostScope + common-dir realpath
//   key components keep them distinct.
// - Revisions increment by exactly one, preserve tenant/principal/
//   hostFingerprint, and preserve the product binding unless the binding
//   itself changes: a revision outside the binding (roots, policy version)
//   keeps it, while a changed serverWorkspaceId or serverIssuer — or an
//   explicit revalidation — requires a strictly increasing
//   bindingRevision (the first binding carries exactly 1). The host must
//   additionally refuse to redirect in-flight collection/publication on
//   rebind.
// - Revocation is a private-purge request: the host stops work, rejects
//   delayed jobs, and purges private snapshots, derived indexes and
//   decryptability, while preserving authorized committed history. Purging
//   never deletes committed facts.
//
// FROZEN L6a CONVENTIONS — both seats align on these values:
// - POLICY_VERSION ("live-git-indexing/1") is the one policy name stamped
//   on every live declaration; h2a's provisional "live-git-1" retires.
// - INITIAL_DECLARATION_REVISION (1): the explicit activation itself is
//   the first revision; there is no revision-0 declaration.
// - INITIAL_BINDING_REVISION (1): the first product binding carries 1,
//   and every rebind/revalidation carries a strictly greater
//   bindingRevision.
// - Identity uncertainty vocabulary: "missing_history", "shallow_history"
//   (the labels H already produces under LIVE §12).
// - Opaque ids are minted ONLY through the canonical derivation below
//   (canonicalIdKey + the sha256 minting in ./registration.js): the same
//   inputs give H, S and E byte-identical cloneId/worktreeId/
//   declarationId. MIGRATION (H): identifiers already persisted by h2a
//   were hashed from newline-joined "hostScope\nrealpath\nfingerprint"
//   (clone), "hostScope\ngitDir" (worktree) and
//   "hostScope\ncommonDirRealpath\nws:" (declaration); that scheme is
//   ambiguous and diverges from this contract. Re-derive every persisted
//   id with the canonical derivation and rewrite the local h2a store; no
//   old id has crossed to sentropic (L6a is not consumed yet), so the
//   migration is a purely local rewrite with no product-side replay.

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
 * Explicit identity-coverage uncertainty states (LIVE §12). A repo with no
 * history (unborn HEAD) declares "missing_history"; a grafted (shallow)
 * history declares "shallow_history" while keeping its fingerprints, whose
 * coverage stays uncertain. An absent fingerprint is valid only under
 * "missing_history"; uncertainty never merges clones.
 */
export const IDENTITY_UNCERTAINTY_STATES = ["missing_history", "shallow_history"] as const;

export type IdentityUncertaintyState = (typeof IDENTITY_UNCERTAINTY_STATES)[number];

export function isIdentityUncertaintyState(value: unknown): value is IdentityUncertaintyState {
  return (
    typeof value === "string" &&
    (IDENTITY_UNCERTAINTY_STATES as readonly string[]).includes(value)
  );
}

/** First declaration revision: the explicit activation is revision 1. */
export const INITIAL_DECLARATION_REVISION = 1;

/** First product binding revision; every rebind carries a strictly greater one. */
export const INITIAL_BINDING_REVISION = 1;

/** The three opaque id kinds minted by the canonical derivation. */
export const ID_KINDS = ["clone", "worktree", "declaration"] as const;

export type IdKind = (typeof ID_KINDS)[number];

/** Opaque id prefixes; a valid id of a kind starts with its prefix. */
export const ID_PREFIXES: Readonly<Record<IdKind, string>> = {
  clone: "clone:",
  worktree: "wt:",
  declaration: "decl:",
};

export function isIdKind(value: unknown): value is IdKind {
  return (
    typeof value === "string" &&
    (ID_KINDS as readonly string[]).includes(value)
  );
}

/**
 * THE canonical identity serialization shared by every live opaque id
 * (cloneId, worktreeId, declarationId). Both seats and engram mint ids
 * from this exact function, so the same identity components always give
 * the same id on every side. The serialization is unambiguous: a JSON
 * array of the kind plus the components in order, so no component value
 * can shift a boundary. NUL is refused outright in every component, so the
 * ambiguous couples ("a\0b", "c") vs ("a", "b\0c") can never be
 * constructed. Pure and total over valid inputs; throws on malformed
 * components so no silent normalization can produce a colliding key.
 */
export function canonicalIdKey(kind: IdKind, components: readonly string[]): string {
  if (!isIdKind(kind)) {
    throw new Error(`canonicalIdKey requires a known id kind (${ID_KINDS.join(", ")})`);
  }
  for (const component of components) {
    if (typeof component !== "string") {
      throw new Error("canonicalIdKey requires string components");
    }
    if (component.includes("\0")) {
      throw new Error("canonicalIdKey refuses NUL in identity components");
    }
  }
  return JSON.stringify([kind, ...components]);
}

/**
 * Local clone identity. hostScope bounds the clone to one host;
 * commonDirProjectFingerprint is the project fingerprint computed over the
 * common-dir history with the empty main-worktree component (spec §12) and
 * is optional: it may be absent only when identityUncertainty explicitly
 * contains "missing_history" (LIVE §12) — the hostScope + common-dir
 * realpath components keep clones distinct even then;
 * commonDirRealpath is the host-resolved common-dir path (host-local only,
 * never published to sentropic); cloneId is the scoped opaque identifier
 * minted from canonicalIdKey and safe to share; oidAlgorithm records the
 * repository object format.
 */
export interface CloneIdentityDto {
  readonly hostScope: string;
  readonly commonDirRealpath: string;
  readonly commonDirProjectFingerprint?: string;
  readonly cloneId: string;
  readonly oidAlgorithm: OidAlgorithm;
  readonly identityUncertainty: readonly IdentityUncertaintyState[];
}

/**
 * Worktree identity: one shared cloneId plus its own host-scoped opaque
 * worktreeId, isolated per-worktree fingerprint, path and resolved
 * git-dir. Linked worktrees share only authorized immutable analyses;
 * index snapshots and context-dependent resolution stay worktree-local
 * (spec §§3, 15). The worktree fingerprint is optional: absent only under
 * explicit "missing_history" uncertainty (LIVE §12).
 */
export interface WorktreeIdentityDto {
  readonly cloneId: string;
  readonly worktreeId: string;
  readonly worktreePath: string;
  readonly gitDir: string;
  readonly worktreeFingerprint?: string;
  readonly identityUncertainty: readonly IdentityUncertaintyState[];
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

/**
 * Revocation of exactly one declaration: the opaque declarationId names the
 * single target (stable across that declaration's revisions, unique per
 * declaration), and cloneId/worktreeId carry its clone/worktree
 * attachment so the recipient purges the right scope without consulting
 * ambiguous public values. Withdrawing a whole clone revokes each of its
 * declarations, one unambiguous revocation each.
 */
export interface DeclarationRevocationDto {
  readonly declarationId: string;
  readonly tenant: string;
  readonly cloneId: string;
  readonly worktreeId: string;
  readonly declarationRevision: number;
  readonly reason: RevocationReason;
  readonly requestPrivatePurge: PrivatePurgeRequestDto;
}

const CLONE_IDENTITY_KEYS: readonly string[] = [
  "hostScope",
  "commonDirRealpath",
  "commonDirProjectFingerprint",
  "cloneId",
  "oidAlgorithm",
  "identityUncertainty",
];

const WORKTREE_IDENTITY_KEYS: readonly string[] = [
  "cloneId",
  "worktreeId",
  "worktreePath",
  "gitDir",
  "worktreeFingerprint",
  "identityUncertainty",
];

// — L2b: roots, retained DAG and OID completion
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3–4, 6; plan/09 L2b). Data-pure DTOs,
// constants and validators only; the engine lives in ./history.js and the
// ref/repository models in ./refs.js and ./repository.js. Every fact and
// lookup below is scoped by clone and qualified by OID algorithm.

/**
 * The follow-up window for branch activity (spec §4). It selects followed
 * branches only; it never limits commit count, commit age, retained DAG
 * facts or already acquired PR history, and it never prunes anything.
 */
export const ACTIVITY_WINDOW_DAYS = 30;

/** A full ref name's kind, from its name alone. Tags are inventoried but never traversal roots. */
export type RefKind = "local-branch" | "remote-branch" | "pr-head" | "tag" | "other";

/** Which signal made a root a root (spec §4: record which signal selected it). */
export type RootSelectionSignal =
  | "default-branch" // the default branch, even when old
  | "active-window" // a local or known remote branch active within the window
  | "pr-head" // a PR head of any state, regardless of age
  | "worktree-head" // a registered worktree HEAD, including a detached one
  | "previously-ingested"; // an old root retained for investigation

/** The two activity signals (spec §4): bootstrap tip committer time, or a later observed target change. */
export type ActivitySignalKind = "bootstrap-committer-time" | "observed-target-change";

/** An OID qualified by its object-format algorithm: equal OIDs under different algorithms are never the same object. */
export interface QualifiedOid {
  readonly algorithm: OidAlgorithm;
  readonly oid: string;
}

/** Hex length of an OID under one algorithm. */
export function oidHexLength(algorithm: OidAlgorithm): 40 | 64 {
  return algorithm === "sha1" ? 40 : 64;
}

/** Strict algorithm-qualified OID check: lowercase hex of the algorithm's exact length. */
export function isValidQualifiedOid(value: QualifiedOid): boolean {
  return (
    (value.algorithm === "sha1" || value.algorithm === "sha256") &&
    new RegExp(`^[0-9a-f]{${oidHexLength(value.algorithm)}}$`).test(value.oid)
  );
}

export function validateQualifiedOid(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["qualifiedOid must be an object"] };
  const errors: string[] = [];
  if (value.algorithm !== "sha1" && value.algorithm !== "sha256") {
    errors.push('qualifiedOid.algorithm must be "sha1" or "sha256"');
  }
  if (typeof value.oid !== "string" || !/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(value.oid)) {
    errors.push("qualifiedOid.oid must be a 40 or 64 character lowercase hex string");
  } else if ((value.algorithm === "sha1" || value.algorithm === "sha256") &&
    value.oid.length !== oidHexLength(value.algorithm)) {
    errors.push(`qualifiedOid.oid must have exactly ${oidHexLength(value.algorithm)} hex characters under ${value.algorithm}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * One host observation of one ref (spec §3: Ref/RefObservation). `observedAt`
 * is polling time, never activity. `absent` marks a deletion observation: the
 * ref no longer resolves at this generation. `tipCommitterUnixSeconds` is the
 * bootstrap activity signal over the observed target; supplying it again on a
 * later observation of the same target refreshes nothing.
 */
export interface RawRefObservationDto {
  readonly refName: string;
  /** Observed target OID; empty when `absent` is true. */
  readonly oid: string;
  readonly observedAt: number;
  readonly absent?: boolean;
  readonly tipCommitterUnixSeconds?: number;
}

const RAW_REF_OBSERVATION_KEYS: readonly string[] = [
  "refName", "oid", "observedAt", "absent", "tipCommitterUnixSeconds",
];

export function validateRawRefObservation(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["ref observation must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, RAW_REF_OBSERVATION_KEYS, "ref observation", errors);
  if (!isNonEmptyString(value.refName) || hasNul(value.refName) || !value.refName.startsWith("refs/")) {
    errors.push("ref observation.refName must be a non-empty full ref name starting with \"refs/\" and without NUL");
  }
  if (typeof value.oid !== "string" || !/^[0-9a-f]{0,64}$/.test(value.oid)) {
    errors.push("ref observation.oid must be a lowercase hex string");
  }
  if (typeof value.observedAt !== "number" || !Number.isSafeInteger(value.observedAt) || value.observedAt <= 0) {
    errors.push("ref observation.observedAt must be a positive safe integer (milliseconds)");
  }
  if (value.absent !== undefined && typeof value.absent !== "boolean") {
    errors.push("ref observation.absent, when present, must be a boolean");
  }
  if (value.absent === true && value.oid !== "") {
    errors.push("ref observation.oid must be empty on an absent (deletion) observation");
  }
  if (value.tipCommitterUnixSeconds !== undefined &&
    (typeof value.tipCommitterUnixSeconds !== "number" || !Number.isSafeInteger(value.tipCommitterUnixSeconds))) {
    errors.push("ref observation.tipCommitterUnixSeconds, when present, must be an integer (unix seconds)");
  }
  return { ok: errors.length === 0, errors };
}

/** The activity provenance of a tracked ref: when it was last really worked on, and how that is known. */
export interface RefActivityDto {
  readonly activityAt: number;
  readonly signal: ActivitySignalKind;
}

/**
 * The neutral tracked state of one ref: creation, deletion and recreation are
 * separate observations (generation bumps once per reappearance after an
 * absence). `oid` is null exactly while the latest observation is a deletion;
 * `activity` is never refreshed by merely observing the same target again.
 */
export interface TrackedRefDto {
  readonly refName: string;
  readonly kind: RefKind;
  readonly oid: string | null;
  readonly generation: number;
  readonly activity: RefActivityDto | null;
  readonly deletedAt: number | null;
  readonly lastObservedAt: number;
}

/** The HEAD of one registered worktree, as the host resolved it. */
export type WorktreeHead =
  | { readonly kind: "branch"; readonly refName: string }
  | { readonly kind: "detached"; readonly oid: string }
  | { readonly kind: "unborn" };

/** One provenance record of why an OID is a root. */
export interface RootSourceDto {
  readonly signal: RootSelectionSignal;
  readonly refName: string | null;
  readonly worktreeId: string | null;
  readonly activityAt: number | null;
  readonly generation: number | null;
}

/** A selected history root: one qualified OID plus every provenance source that selected it. */
export interface SelectedRootDto {
  readonly qualifiedOid: QualifiedOid;
  /** Rev expression for the walk: always the observed OID (ref names are mobile provenance, never walk input). */
  readonly rev: string;
  readonly sources: readonly RootSourceDto[];
}

/**
 * A previously ingested root, retained for investigation whatever later
 * happens to its ref (expiry, deletion, recreation, force-push). Durable
 * retention/reconstruction itself is R1's lot; this record is the neutral
 * retained-root fact the persistence port keeps queryable.
 */
export interface RetainedRootDto {
  readonly cloneId: string;
  readonly algorithm: OidAlgorithm;
  readonly oid: string;
  readonly firstSeenAt: number;
  readonly firstSignal: RootSelectionSignal;
  readonly refName: string | null;
}

/** Authorized author/committer identity of a commit, as recorded in the object. */
export interface HistoryIdentityDto {
  readonly name: string;
  readonly email: string;
  readonly unixSeconds: number;
  readonly offsetMinutes: number;
}

/**
 * One immutable commit fact of the retained DAG (spec §3 Commit/Parent):
 * algorithm-qualified OID, tree, ORDERED parents, authorized identities and
 * message, extraction and policy versions. Shared immutably by every branch,
 * PR head and worktree that reaches it; there is no commit × branch edge.
 */
/**
 * One changed file of a commit against one ordered parent: the path is kept
 * as raw bytes (never line-parsed) and the line counts come from numstat
 * (null when the content is binary or non-textual).
 */
export interface HistoryFileChangeDto {
  readonly path: Uint8Array;
  readonly previousPath: Uint8Array | null;
  readonly status: string;
  readonly statusScore: number | null;
  readonly oldMode: string;
  readonly newMode: string;
  readonly oldOid: string;
  readonly newOid: string;
  readonly added: number | null;
  readonly deleted: number | null;
}

/** The changed files of one commit against one of its ordered parents. */
export interface HistoryParentDiffDto {
  /** -1 means the empty-tree comparison of a parentless (root) commit. */
  readonly parentIndex: number;
  readonly files: readonly HistoryFileChangeDto[];
}

export interface HistoryCommitFactDto {
  readonly cloneId: string;
  readonly algorithm: OidAlgorithm;
  readonly oid: string;
  readonly tree: string;
  readonly parents: readonly string[];
  readonly author: HistoryIdentityDto;
  readonly committer: HistoryIdentityDto;
  readonly subject: string;
  readonly message: Uint8Array;
  /** Changed files per ordered parent (L2a extraction); part of the durable fact. */
  readonly parentDiffs: readonly HistoryParentDiffDto[];
  readonly extractorVersion: string;
  readonly policyVersion: string;
}

/**
 * An extraction checkpoint (spec §6): an OID is marked extracted for one
 * extraction version only after the required fact set has durable
 * acknowledgement. A checkpoint is extraction progress, never complete
 * ancestry by itself: ancestry completeness is the separately derived
 * frontier (closure over recorded parents). A known-but-partial OID is not
 * a checkpoint and not a traversal stop.
 */
export interface HistoryCheckpointDto {
  readonly cloneId: string;
  readonly algorithm: OidAlgorithm;
  readonly oid: string;
  readonly tree: string;
  readonly parents: readonly string[];
  readonly extractorVersion: string;
  readonly policyVersion: string;
}

export interface HistoryCompletionQuery {
  readonly cloneId: string;
  readonly algorithm: OidAlgorithm;
  readonly extractorVersion: string;
  readonly policyVersion: string;
}

export interface HistoryCompletionState {
  /** OIDs extracted for this extractor version (extraction checkpoints). */
  readonly knownComplete: readonly string[];
  /**
   * The checkpoints behind knownComplete, parents included: the engine derives
   * the ancestry frontier (closure over parents) from these, so a checkpoint
   * whose parents are not durable never counts as complete ancestry.
   */
  readonly checkpoints: readonly HistoryCheckpointDto[];
  readonly retainedRoots: readonly RetainedRootDto[];
}

/**
 * THE injected persistence port (plan/09 L2b: a port, never a base). Engram
 * defines the contract only; cluster-mesh (L3) and the app implement it. The
 * interface deliberately exposes no commit × branch edge and no query surface
 * beyond completion and retained roots: branch membership is derived from the
 * retained DAG and current refs, never persisted (spec §4).
 */
export interface HistoryPersistencePort {
  loadCompletion(query: HistoryCompletionQuery): Promise<HistoryCompletionState>;
  persistCommitFact(fact: HistoryCommitFactDto): Promise<{ received: true }>;
  recordCompletion(checkpoint: HistoryCheckpointDto): Promise<{ received: true }>;
  recordRetainedRoot(root: RetainedRootDto): Promise<{ received: true }>;
}

/**
 * Explicit dag coverage (spec §4, A04): shallow boundaries, missing objects
 * and inaccessible roots are explicit gaps; a gap never silently degrades
 * into a current/complete claim.
 */
/**
 * Structured cause of a dag coverage gap: a missing object (an OID the clone
 * does not hold) versus a grafted shallow boundary (ancestry cut by the host
 * declaration). Anything else is a protocol failure the caller sees as a
 * thrown error, never as coverage.
 */
export type HistoryCoverageCause = "missing-object" | "shallow-boundary";

export interface HistoryCoverageReportDto {
  readonly axis: "dag";
  readonly state: CoverageState;
  readonly reason: string;
  readonly cause: HistoryCoverageCause;
  /** Grafted shallow boundary OIDs (state "partial"). */
  readonly boundary?: readonly QualifiedOid[];
  /** Missing object OIDs (state "unavailable"). */
  readonly missing?: readonly QualifiedOid[];
}

const PRIVATE_PURGE_REQUEST_KEYS: readonly string[] = [
  "purgePrivateSnapshots",
  "purgeDerivedIndexes",
  "revokeDecryptability",
  "preserveCommittedHistory",
];

const DECLARATION_REVOCATION_KEYS: readonly string[] = [
  "declarationId",
  "tenant",
  "cloneId",
  "worktreeId",
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

export function validateCloneIdentity(identity: unknown): ValidationResult {
  if (!isRecord(identity)) return { ok: false, errors: ["cloneIdentity must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(identity, CLONE_IDENTITY_KEYS, "cloneIdentity", errors);
  if (!isNonEmptyString(identity.hostScope) || hasNul(identity.hostScope)) {
    errors.push("cloneIdentity.hostScope must be a non-empty string without NUL");
  }
  if (!isNonEmptyString(identity.commonDirRealpath) || hasNul(identity.commonDirRealpath)) {
    errors.push("cloneIdentity.commonDirRealpath must be a non-empty string without NUL");
  }
  if (identity.commonDirProjectFingerprint !== undefined &&
    (!isNonEmptyString(identity.commonDirProjectFingerprint) || hasNul(identity.commonDirProjectFingerprint))) {
    errors.push("cloneIdentity.commonDirProjectFingerprint, when present, must be a non-empty string without NUL");
  } else if (identity.commonDirProjectFingerprint === undefined &&
    (!isUncertaintyList(identity.identityUncertainty) ||
      !(identity.identityUncertainty as readonly string[]).includes("missing_history"))) {
    errors.push('cloneIdentity.commonDirProjectFingerprint is absent: identityUncertainty must explicitly contain "missing_history" (LIVE §12)');
  }
  if (!isOpaqueId(identity.cloneId, ID_PREFIXES.clone)) {
    errors.push(`cloneIdentity.cloneId must be a non-empty opaque id starting with "${ID_PREFIXES.clone}"`);
  }
  if (identity.oidAlgorithm !== "sha1" && identity.oidAlgorithm !== "sha256") {
    errors.push('cloneIdentity.oidAlgorithm must be "sha1" or "sha256"');
  }
  if (!isUncertaintyList(identity.identityUncertainty)) {
    errors.push(`cloneIdentity.identityUncertainty must be an array of uncertainty states (${IDENTITY_UNCERTAINTY_STATES.join(", ")})`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateWorktreeIdentity(identity: unknown): ValidationResult {
  if (!isRecord(identity)) return { ok: false, errors: ["worktreeIdentity must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(identity, WORKTREE_IDENTITY_KEYS, "worktreeIdentity", errors);
  if (!isOpaqueId(identity.cloneId, ID_PREFIXES.clone)) {
    errors.push(`worktreeIdentity.cloneId must be a non-empty opaque id starting with "${ID_PREFIXES.clone}"`);
  }
  if (!isOpaqueId(identity.worktreeId, ID_PREFIXES.worktree)) {
    errors.push(`worktreeIdentity.worktreeId must be a non-empty opaque id starting with "${ID_PREFIXES.worktree}"`);
  }
  if (!isNonEmptyString(identity.worktreePath) || hasNul(identity.worktreePath)) {
    errors.push("worktreeIdentity.worktreePath must be a non-empty string without NUL");
  }
  if (!isNonEmptyString(identity.gitDir) || hasNul(identity.gitDir)) {
    errors.push("worktreeIdentity.gitDir must be a non-empty string without NUL");
  }
  if (identity.worktreeFingerprint !== undefined &&
    (!isNonEmptyString(identity.worktreeFingerprint) || hasNul(identity.worktreeFingerprint))) {
    errors.push("worktreeIdentity.worktreeFingerprint, when present, must be a non-empty string without NUL");
  } else if (identity.worktreeFingerprint === undefined &&
    (!isUncertaintyList(identity.identityUncertainty) ||
      !(identity.identityUncertainty as readonly string[]).includes("missing_history"))) {
    errors.push('worktreeIdentity.worktreeFingerprint is absent: identityUncertainty must explicitly contain "missing_history" (LIVE §12)');
  }
  if (!isUncertaintyList(identity.identityUncertainty)) {
    errors.push(`worktreeIdentity.identityUncertainty must be an array of uncertainty states (${IDENTITY_UNCERTAINTY_STATES.join(", ")})`);
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

// — R1: private retention of every ingested root
// (spec/SPEC_LIVE_GIT_INDEXING.md §4, A02/A04; plan/09 R1). Data-pure DTOs,
// constants and validators only; the engine lives in ./retention.js.
//
// Consumer contract for the h2a (H) seat. H owns the private Git object
// store (live-object-store.ts) and the retention handoff (delegate.ts);
// engram owns only this data-pure contract plus the pure derivation in
// ./retention.js. Read this block before implementing the host side.
//
// - Private retention: every ingested root (default branch even when old,
//   active local/remote branches, PR heads of all states, detached worktree
//   HEADs, previously ingested roots) requires one scoped durable receipt.
//   No commit-count or commit-age limit exists; nothing is ever erased here.
// - Requests carry ONLY the algorithm-qualified OID plus its scope and
//   provenance signal: no file content, no plaintext, no patch, no derived
//   text. Uncommitted plaintext is never added to the private store.
// - Receipts are scoped by tenant + clone (never by worktree, never global)
//   and durable: the host records them through the injected port before any
//   reconstructible-coverage claim. A missing receipt is an explicit
//   object-availability gap, never a silent current claim.
// - Acquisition (H) uses pinned OIDs and private refs, without writing into
//   the observed clone, without borrowing an alternates store that may be
//   GC'd, and without invoking repository-controlled programs. If removal
//   wins the acquisition race, H reports the gap instead of inventing
//   retention. Quotas pause further work without deleting protected roots.
// - Receipts expose an opaque coordinated-backup reference (backupRef) for
//   L8 backup coordination; P1 reuses this facility for PR roots. No raw
//   private pack is published to Postgres through this contract.

/** The coverage axis retention reports on: object availability, never DAG currency. */
export const RETENTION_COVERAGE_AXIS = "object-availability" as const;

/** Why a retention coverage gap exists: a required receipt is not durably recorded. */
export type RetentionCoverageCause = "missing-receipt";

export interface RetentionCoverageReportDto {
  readonly axis: "object-availability";
  readonly state: CoverageState;
  readonly reason: string;
  readonly cause: RetentionCoverageCause;
  /** Required OIDs without a scoped durable receipt (state "unavailable"). */
  readonly missing?: readonly QualifiedOid[];
}

/**
 * One scoped retention request: the neutral producer asks the host to
 * acquire and protect the pinned committed object. Scope is tenant + clone
 * (clone-scoped, never worktree-scoped, never global). `firstSignal` is the
 * current pass's first L2b selection source for the OID (sources are
 * precedence-ordered: default, worktree, PR, window, then retained), and
 * `refName` carries the current pass's selecting ref when one exists, else
 * null (detached/retained roots). Neither is the historic first ingestion:
 * that provenance stays on RetainedRootDto (firstSignal/refName at first
 * sighting, kept queryable by the history persistence port), so a deleted
 * ref re-requested as previously-ingested loses no history — the historic
 * record is read there, not overwritten here.
 * No content field exists by construction.
 */
export interface RetentionRequestDto {
  readonly scope: LiveScope;
  readonly algorithm: OidAlgorithm;
  readonly oid: string;
  readonly firstSignal: RootSelectionSignal;
  readonly refName: string | null;
  readonly requestedAt: number;
}

/**
 * One scoped durable receipt: the host confirms the pinned object is
 * protected in its private store. `backupRef` is the opaque
 * coordinated-backup reference L8 coordinates (stable per scope/OID);
 * it carries no content and never publishes a raw pack.
 */
export interface RetentionReceiptDto {
  readonly scope: LiveScope;
  readonly algorithm: OidAlgorithm;
  readonly oid: string;
  readonly receivedAt: number;
  readonly backupRef: string;
}

/** The receipt lookup scope: tenant + clone plus the object-format algorithm. */
export interface RetentionReceiptQuery {
  readonly scope: LiveScope;
  readonly algorithm: OidAlgorithm;
}

const RETENTION_REQUEST_KEYS: readonly string[] = [
  "scope",
  "algorithm",
  "oid",
  "firstSignal",
  "refName",
  "requestedAt",
];

const RETENTION_RECEIPT_KEYS: readonly string[] = [
  "scope",
  "algorithm",
  "oid",
  "receivedAt",
  "backupRef",
];

const RETENTION_SIGNALS: readonly string[] = [
  "default-branch",
  "active-window",
  "pr-head",
  "worktree-head",
  "previously-ingested",
];

function isRetentionScope(scope: unknown): scope is LiveScope {
  return validateLiveScope(scope).ok;
}

export function validateRetentionRequest(request: unknown): ValidationResult {
  if (!isRecord(request)) return { ok: false, errors: ["retention request must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(request, RETENTION_REQUEST_KEYS, "retention request", errors);
  const scope = validateLiveScope(request.scope);
  if (!scope.ok) errors.push(...scope.errors.map((error) => `retention request.scope: ${error}`));
  else if (isRetentionScope(request.scope) && request.scope.worktree !== undefined) {
    errors.push("retention request.scope must be clone-scoped: worktree must be absent (retention is per tenant + clone)");
  }
  if (request.algorithm !== "sha1" && request.algorithm !== "sha256") {
    errors.push('retention request.algorithm must be "sha1" or "sha256"');
  }
  if (typeof request.oid !== "string" || !/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(request.oid)) {
    errors.push("retention request.oid must be a 40 or 64 character lowercase hex string");
  } else if ((request.algorithm === "sha1" || request.algorithm === "sha256") &&
    request.oid.length !== oidHexLength(request.algorithm)) {
    errors.push(`retention request.oid must have exactly ${oidHexLength(request.algorithm)} hex characters under ${request.algorithm}`);
  }
  if (typeof request.firstSignal !== "string" || !RETENTION_SIGNALS.includes(request.firstSignal)) {
    errors.push(`retention request.firstSignal must be one of ${RETENTION_SIGNALS.join(", ")}`);
  }
  if (request.refName !== null &&
    (!isNonEmptyString(request.refName) || hasNul(request.refName) || !request.refName.startsWith("refs/"))) {
    errors.push('retention request.refName must be null or a non-empty full ref name starting with "refs/" without NUL');
  }
  if (typeof request.requestedAt !== "number" || !Number.isSafeInteger(request.requestedAt) || request.requestedAt <= 0) {
    errors.push("retention request.requestedAt must be a positive safe integer (milliseconds)");
  }
  return { ok: errors.length === 0, errors };
}

export function validateRetentionReceipt(receipt: unknown): ValidationResult {
  if (!isRecord(receipt)) return { ok: false, errors: ["retention receipt must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(receipt, RETENTION_RECEIPT_KEYS, "retention receipt", errors);
  const scope = validateLiveScope(receipt.scope);
  if (!scope.ok) errors.push(...scope.errors.map((error) => `retention receipt.scope: ${error}`));
  else if (isRetentionScope(receipt.scope) && receipt.scope.worktree !== undefined) {
    errors.push("retention receipt.scope must be clone-scoped: worktree must be absent (retention is per tenant + clone)");
  }
  if (receipt.algorithm !== "sha1" && receipt.algorithm !== "sha256") {
    errors.push('retention receipt.algorithm must be "sha1" or "sha256"');
  }
  if (typeof receipt.oid !== "string" || !/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(receipt.oid)) {
    errors.push("retention receipt.oid must be a 40 or 64 character lowercase hex string");
  } else if ((receipt.algorithm === "sha1" || receipt.algorithm === "sha256") &&
    receipt.oid.length !== oidHexLength(receipt.algorithm)) {
    errors.push(`retention receipt.oid must have exactly ${oidHexLength(receipt.algorithm)} hex characters under ${receipt.algorithm}`);
  }
  if (typeof receipt.receivedAt !== "number" || !Number.isSafeInteger(receipt.receivedAt) || receipt.receivedAt <= 0) {
    errors.push("retention receipt.receivedAt must be a positive safe integer (milliseconds)");
  }
  if (!isNonEmptyString(receipt.backupRef) || hasNul(receipt.backupRef)) {
    errors.push("retention receipt.backupRef must be a non-empty string without NUL (opaque L8 coordination reference)");
  }
  return { ok: errors.length === 0, errors };
}

export function validateDeclarationRevocation(revocation: unknown): ValidationResult {
  if (!isRecord(revocation)) return { ok: false, errors: ["revocation must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(revocation, DECLARATION_REVOCATION_KEYS, "revocation", errors);
  if (!isOpaqueId(revocation.declarationId, ID_PREFIXES.declaration)) {
    errors.push(`revocation.declarationId must be a non-empty opaque id starting with "${ID_PREFIXES.declaration}"`);
  }
  if (!isNonEmptyString(revocation.tenant) || hasNul(revocation.tenant)) {
    errors.push("revocation.tenant must be a non-empty string without NUL");
  }
  if (!isOpaqueId(revocation.cloneId, ID_PREFIXES.clone)) {
    errors.push(`revocation.cloneId must be a non-empty opaque id starting with "${ID_PREFIXES.clone}"`);
  }
  if (!isOpaqueId(revocation.worktreeId, ID_PREFIXES.worktree)) {
    errors.push(`revocation.worktreeId must be a non-empty opaque id starting with "${ID_PREFIXES.worktree}"`);
  }
  if (!isPositiveInteger(revocation.declarationRevision) ||
    revocation.declarationRevision < INITIAL_DECLARATION_REVISION) {
    errors.push(`revocation.declarationRevision must be an integer >= ${INITIAL_DECLARATION_REVISION}`);
  }
  if (!isRevocationReason(revocation.reason)) {
    errors.push(`revocation.reason must be one of ${REVOCATION_REASONS.join(", ")}`);
  }
  const purge = validatePrivatePurgeRequest(revocation.requestPrivatePurge);
  if (!purge.ok) errors.push(...purge.errors.map((error) => `revocation.${error}`));
  return { ok: errors.length === 0, errors };
}

// — P1: all-state GitHub PR synchronization (spec/SPEC_LIVE_GIT_INDEXING.md
// §§3–5; plan/09 P1). Data-pure DTOs, constants and validators only; the
// engines live in ./pr-sync.js (pagination/overlap/sweeps, neutral PR/object
// jobs) and ./pr-attribution.js (pinned historical attribution).
//
// Consumer contracts for the H: (h2a transport) and S: (cluster-mesh mapping)
// seats. H owns the approved installed `gh`/Git executor, host-controlled
// credentials, private object acquisition into service-owned refs and
// retention; S owns adapter mappings/receipts when the L3 contract needs
// PR-specific typed fields. Read this block before implementing either side.
//
// - PRs of every state (open, closed, merged) plus drafts (open + isDraft)
//   are indexed, with no count or age limit and nothing erased: a state
//   change, a force-push or a merge strategy change is a new pinned
//   observation, never a substitution or deletion of the previous one.
// - The GitHub transport is INJECTED (GithubPrTransportPort is implemented by
//   the host test fake here and by the H executor in production): engram
//   performs no network call, persists no token, and never invokes a
//   repository-selected credential helper or executable. Tokens never enter
//   facts, logs or rows: PR_FACT_FORBIDDEN_KEYS are rejected by validation.
// - No end of list without proof: a page with hasMore false must carry
//   endProof "end-of-list"; a page with hasMore true must carry a non-empty
//   nextCursor. A truncated or unproven sweep fails the pass with an
//   explicit gap instead of completing.
// - Metadata and objects advance independently: a metadata cursor success
//   never completes a failed object job, and metadata receipts never
//   acknowledge failed private acquisition (canAcknowledgePrObjects in
//   ./pr-sync.js, consumed by the S mapping).
// - Attribution is pinned history, not ancestry: pinPrAttribution in
//   ./pr-attribution.js requires observed head/base bounds plus merge-base
//   evidence for "complete"; unknown bounds stay "partial" while the
//   acquired ancestry remains available. No REST commit array proves
//   exhaustiveness; merge, squash and rebase stay distinguished.
// - Private acquisition contract for H: acquire only the observed head OID
//   into PRIVATE_PR_REF_PREFIX service refs inside the private store, verify
//   the acquired target against the observed OID, and report a moving head
//   as another observation. Never move refs or touch the user clone index.

/** Every PR state indexed by live (drafts are open + isDraft true). */
export const PULL_REQUEST_STATES = ["open", "closed", "merged"] as const;

export type PullRequestState = (typeof PULL_REQUEST_STATES)[number];

export function isPullRequestState(value: unknown): value is PullRequestState {
  return (
    typeof value === "string" &&
    (PULL_REQUEST_STATES as readonly string[]).includes(value)
  );
}

/** Merge strategies stay distinguished; unknown means not yet evidenced. */
export const PULL_REQUEST_MERGE_STRATEGIES = ["merge", "squash", "rebase", "unknown"] as const;

export type PullRequestMergeStrategy = (typeof PULL_REQUEST_MERGE_STRATEGIES)[number];

export function isPullRequestMergeStrategy(value: unknown): value is PullRequestMergeStrategy {
  return (
    typeof value === "string" &&
    (PULL_REQUEST_MERGE_STRATEGIES as readonly string[]).includes(value)
  );
}

/** Transport failure kinds: each preserves last success with stale coverage. */
export const PR_SYNC_ERROR_KINDS = ["offline", "auth_required", "rate_limited", "unavailable", "protocol"] as const;

export type PrSyncErrorKind = (typeof PR_SYNC_ERROR_KINDS)[number];

export function isPrSyncErrorKind(value: unknown): value is PrSyncErrorKind {
  return (
    typeof value === "string" &&
    (PR_SYNC_ERROR_KINDS as readonly string[]).includes(value)
  );
}

/** Neutral object-job lifecycle, independent of the metadata cursor. */
export const PR_OBJECT_JOB_STATES = ["pending", "acquired", "failed"] as const;

export type PrObjectJobState = (typeof PR_OBJECT_JOB_STATES)[number];

export function isPrObjectJobState(value: unknown): value is PrObjectJobState {
  return (
    typeof value === "string" &&
    (PR_OBJECT_JOB_STATES as readonly string[]).includes(value)
  );
}

/** PR coverage axes (spec §12): metadata, objects and attribution separate. */
export const PR_COVERAGE_AXES = ["pr-metadata", "object-availability", "pr-attribution"] as const;

export type PrCoverageAxis = (typeof PR_COVERAGE_AXES)[number];

/** Explicit end-of-list proof: the only accepted complete-sweep terminator. */
export const PR_END_PROOF = "end-of-list" as const;

export type PrEndProof = typeof PR_END_PROOF;

/** Service-owned refs for private PR acquisition (H executor, never the clone). */
export const PRIVATE_PR_REF_PREFIX = "refs/live-private/pr/";

/** Keys that must never enter a PR fact (tokens stay out of rows/logs). */
export const PR_FACT_FORBIDDEN_KEYS = ["token", "credential", "secret", "authorization"] as const;

/** A GitHub repository identity (owner + name, no URL, no credential). */
export interface GithubRepositoryDto {
  readonly owner: string;
  readonly repo: string;
}

/**
 * One neutral PR observation: identity, all-state state/dates, pinned
 * head/base observations and merge evidence. Historical bounds are pinned
 * values, never derived from today's base.
 */
export interface PullRequestFactDto {
  readonly repositoryOwner: string;
  readonly repositoryRepo: string;
  readonly number: number;
  readonly state: PullRequestState;
  readonly isDraft: boolean;
  readonly updatedAt: number;
  readonly headOid: QualifiedOid;
  readonly headRef: string;
  readonly baseOid: QualifiedOid;
  readonly baseRef: string;
  readonly mergeOid?: QualifiedOid | null;
  readonly mergeStrategy?: PullRequestMergeStrategy;
}

/** One transport page item: same shape as the persisted observation. */
export type PrPageItemDto = PullRequestFactDto;

/**
 * One GitHub listing page over the INJECTED transport. Termination is
 * coherent: hasMore false requires endProof AND a null nextCursor (a
 * continuation cursor with an end proof is contradictory, never complete);
 * hasMore true requires a non-empty nextCursor and carries no endProof.
 * page.etag, when present, is the validator for this exact
 * (repository, filter, cursor) position only, never for another page.
 */
export interface PrPageDto {
  readonly items: readonly PrPageItemDto[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly endProof?: PrEndProof;
  readonly etag?: string | null;
}

/**
 * Durable sync cursor: continuation/retry state with overlap discipline.
 * Validators stay bound to their position: etagsByCursor maps one ETag per
 * requested (filter, cursor) position so a conditional retry never sends
 * page N's validator for page M. lastEtag keeps the most recently seen
 * validator for hosts that only read a scalar.
 */
export interface PrSyncCursorDto {
  readonly repositoryOwner: string;
  readonly repositoryRepo: string;
  readonly updatedAtCursor: number | null;
  readonly lastSuccessAt: number | null;
  readonly lastEtag: string | null;
  readonly etagsByCursor?: Record<string, string> | null;
  readonly sweepKind: "incremental" | "full";
  readonly pendingRetry?: {
    readonly kind: PrSyncErrorKind;
    readonly attempts: number;
    readonly nextAfter: number;
  } | null;
}

/** One neutral object-acquisition job, independent of the metadata cursor. */
export interface PrObjectJobDto {
  readonly repositoryOwner: string;
  readonly repositoryRepo: string;
  readonly prNumber: number;
  readonly headOid: QualifiedOid;
  readonly state: PrObjectJobState;
  readonly attempts: number;
  readonly lastError?: PrSyncErrorKind | null;
  readonly acquiredOid?: QualifiedOid | null;
  readonly totalCommits?: number | null;
  readonly acquiredCommits?: number | null;
}

/**
 * Pinned historical attribution, separate from ancestry. "complete" needs
 * observed head/base bounds plus at least one merge-base OID; anything else
 * is "partial" while the acquired ancestry stays available. An unknown base
 * stays an explicit null (never replaced by the head OID): a null baseOid
 * is always "partial".
 */
export interface PrAttributionDto {
  readonly repositoryOwner: string;
  readonly repositoryRepo: string;
  readonly prNumber: number;
  readonly baseOid: QualifiedOid | null;
  readonly headOid: QualifiedOid;
  readonly mergeBaseOids: readonly QualifiedOid[];
  readonly mergeOid?: QualifiedOid | null;
  readonly mergeStrategy: PullRequestMergeStrategy;
  readonly status: "complete" | "partial";
  readonly reason: string;
}

/** Explicit PR coverage per axis; unknown is never current. */
export interface PrCoverageDto {
  readonly axis: PrCoverageAxis;
  readonly state: CoverageState;
  readonly reason: string;
  readonly lastSuccessAt?: number | null;
}

/**
 * Metadata receipt for the S mapping: metadata completion never implies
 * object completion. S refuses to acknowledge a failed private acquisition.
 */
export interface PrMetadataReceiptDto {
  readonly batchId: string;
  readonly repositoryOwner: string;
  readonly repositoryRepo: string;
  readonly prNumbers: readonly number[];
  readonly cursor: PrSyncCursorDto;
  readonly metadataComplete: boolean;
  readonly objectComplete: boolean;
}

/** Private acquisition request for the H executor (pinned OID, service ref). */
export interface PrivateObjectAcquisitionRequestDto {
  readonly repositoryOwner: string;
  readonly repositoryRepo: string;
  readonly prNumber: number;
  readonly headOid: QualifiedOid;
  readonly serviceRef: string;
}

const GITHUB_REPOSITORY_KEYS: readonly string[] = ["owner", "repo"];

export function validateGithubRepository(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["github repository must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, GITHUB_REPOSITORY_KEYS, "github repository", errors);
  if (!isNonEmptyString(value.owner) || hasNul(value.owner)) {
    errors.push("github repository.owner must be a non-empty string without NUL");
  }
  if (!isNonEmptyString(value.repo) || hasNul(value.repo)) {
    errors.push("github repository.repo must be a non-empty string without NUL");
  }
  return { ok: errors.length === 0, errors };
}

const PULL_REQUEST_FACT_KEYS: readonly string[] = [
  "repositoryOwner",
  "repositoryRepo",
  "number",
  "state",
  "isDraft",
  "updatedAt",
  "headOid",
  "headRef",
  "baseOid",
  "baseRef",
  "mergeOid",
  "mergeStrategy",
];

export function validatePullRequestFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["PR fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, PULL_REQUEST_FACT_KEYS, "PR fact", errors);
  for (const forbidden of PR_FACT_FORBIDDEN_KEYS) {
    if (forbidden in value) errors.push(`PR fact must never carry "${forbidden}" (tokens stay out of facts/logs/rows)`);
  }
  if (!isNonEmptyString(value.repositoryOwner) || hasNul(value.repositoryOwner)) {
    errors.push("PR fact.repositoryOwner must be a non-empty string without NUL");
  }
  if (!isNonEmptyString(value.repositoryRepo) || hasNul(value.repositoryRepo)) {
    errors.push("PR fact.repositoryRepo must be a non-empty string without NUL");
  }
  if (typeof value.number !== "number" || !Number.isSafeInteger(value.number) || value.number <= 0) {
    errors.push("PR fact.number must be a positive safe integer");
  }
  if (!isPullRequestState(value.state)) {
    errors.push(`PR fact.state must be one of ${PULL_REQUEST_STATES.join(", ")}`);
  }
  if (typeof value.isDraft !== "boolean") {
    errors.push("PR fact.isDraft must be a boolean (drafts are open + isDraft true)");
  }
  if (typeof value.updatedAt !== "number" || !Number.isSafeInteger(value.updatedAt) || value.updatedAt <= 0) {
    errors.push("PR fact.updatedAt must be a positive safe integer (milliseconds)");
  }
  const head = validateQualifiedOid(value.headOid);
  if (!head.ok) errors.push(...head.errors.map((error) => `PR fact.headOid: ${error}`));
  if (!isNonEmptyString(value.headRef) || hasNul(value.headRef)) {
    errors.push("PR fact.headRef must be a non-empty string without NUL");
  }
  const base = validateQualifiedOid(value.baseOid);
  if (!base.ok) errors.push(...base.errors.map((error) => `PR fact.baseOid: ${error}`));
  if (!isNonEmptyString(value.baseRef) || hasNul(value.baseRef)) {
    errors.push("PR fact.baseRef must be a non-empty string without NUL");
  }
  if (value.mergeOid !== undefined && value.mergeOid !== null) {
    const merge = validateQualifiedOid(value.mergeOid);
    if (!merge.ok) errors.push(...merge.errors.map((error) => `PR fact.mergeOid: ${error}`));
  }
  if (value.mergeStrategy !== undefined && !isPullRequestMergeStrategy(value.mergeStrategy)) {
    errors.push(`PR fact.mergeStrategy, when present, must be one of ${PULL_REQUEST_MERGE_STRATEGIES.join(", ")}`);
  }
  return { ok: errors.length === 0, errors };
}

const PR_PAGE_KEYS: readonly string[] = ["items", "nextCursor", "hasMore", "endProof", "etag"];

export function validatePrPage(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["PR page must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, PR_PAGE_KEYS, "PR page", errors);
  if (!Array.isArray(value.items)) {
    errors.push("PR page.items must be an array");
  } else {
    value.items.forEach((item: unknown, index: number) => {
      const checked = validatePullRequestFact(item);
      if (!checked.ok) errors.push(...checked.errors.map((error) => `PR page.items[${index}]: ${error}`));
    });
  }
  if (value.nextCursor !== null && !isNonEmptyString(value.nextCursor)) {
    errors.push("PR page.nextCursor must be a non-empty string or null");
  }
  if (typeof value.hasMore !== "boolean") {
    errors.push("PR page.hasMore must be a boolean");
  }
  // No end of list without proof, and no contradictory terminator: a page
  // is complete only with hasMore false, the explicit end-of-list proof and
  // a null nextCursor. A continuation cursor beside an end proof, or an end
  // proof on a continuing page, is a protocol failure, never a completion.
  if (value.hasMore === false && value.endProof !== PR_END_PROOF) {
    errors.push(`PR page with hasMore false must carry endProof "${PR_END_PROOF}" (no silent end of list)`);
  }
  if (value.hasMore === false && value.nextCursor !== null) {
    errors.push("PR page with hasMore false must carry nextCursor null (a continuation cursor beside an end proof is contradictory)");
  }
  if (value.hasMore === true && !isNonEmptyString(value.nextCursor)) {
    errors.push("PR page with hasMore true must carry a non-empty nextCursor");
  }
  if (value.hasMore === true && value.endProof !== undefined) {
    errors.push("PR page with hasMore true must not carry an endProof (a continuation excludes the end-of-list proof)");
  }
  if (value.etag !== undefined && value.etag !== null && !isNonEmptyString(value.etag)) {
    errors.push("PR page.etag, when present, must be a non-empty string or null");
  }
  return { ok: errors.length === 0, errors };
}

const PR_SYNC_CURSOR_KEYS: readonly string[] = [
  "repositoryOwner",
  "repositoryRepo",
  "updatedAtCursor",
  "lastSuccessAt",
  "lastEtag",
  "etagsByCursor",
  "sweepKind",
  "pendingRetry",
];

export function validatePrSyncCursor(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["PR cursor must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, PR_SYNC_CURSOR_KEYS, "PR cursor", errors);
  if (!isNonEmptyString(value.repositoryOwner) || hasNul(value.repositoryOwner)) {
    errors.push("PR cursor.repositoryOwner must be a non-empty string without NUL");
  }
  if (!isNonEmptyString(value.repositoryRepo) || hasNul(value.repositoryRepo)) {
    errors.push("PR cursor.repositoryRepo must be a non-empty string without NUL");
  }
  if (value.updatedAtCursor !== null &&
    (typeof value.updatedAtCursor !== "number" || !Number.isSafeInteger(value.updatedAtCursor) || value.updatedAtCursor <= 0)) {
    errors.push("PR cursor.updatedAtCursor must be a positive safe integer or null");
  }
  if (value.lastSuccessAt !== null &&
    (typeof value.lastSuccessAt !== "number" || !Number.isSafeInteger(value.lastSuccessAt) || value.lastSuccessAt <= 0)) {
    errors.push("PR cursor.lastSuccessAt must be a positive safe integer or null");
  }
  if (value.lastEtag !== null && value.lastEtag !== undefined && !isNonEmptyString(value.lastEtag)) {
    errors.push("PR cursor.lastEtag must be a non-empty string or null");
  }
  if (value.etagsByCursor !== undefined && value.etagsByCursor !== null) {
    if (!isRecord(value.etagsByCursor)) {
      errors.push("PR cursor.etagsByCursor, when present, must be a record of non-empty ETag strings or null");
    } else {
      for (const [key, etag] of Object.entries(value.etagsByCursor)) {
        if (!isNonEmptyString(etag) || hasNul(etag as string)) {
          errors.push(`PR cursor.etagsByCursor[${key}] must be a non-empty string without NUL`);
        }
      }
    }
  }
  if (value.sweepKind !== "incremental" && value.sweepKind !== "full") {
    errors.push('PR cursor.sweepKind must be "incremental" or "full"');
  }
  if (value.pendingRetry !== undefined && value.pendingRetry !== null) {
    if (!isRecord(value.pendingRetry)) {
      errors.push("PR cursor.pendingRetry, when present, must be an object or null");
    } else {
      if (!isPrSyncErrorKind(value.pendingRetry.kind)) {
        errors.push(`PR cursor.pendingRetry.kind must be one of ${PR_SYNC_ERROR_KINDS.join(", ")}`);
      }
      if (typeof value.pendingRetry.attempts !== "number" || !Number.isSafeInteger(value.pendingRetry.attempts) || value.pendingRetry.attempts <= 0) {
        errors.push("PR cursor.pendingRetry.attempts must be a positive safe integer");
      }
      if (typeof value.pendingRetry.nextAfter !== "number" || !Number.isSafeInteger(value.pendingRetry.nextAfter)) {
        errors.push("PR cursor.pendingRetry.nextAfter must be a safe integer");
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

const PR_OBJECT_JOB_KEYS: readonly string[] = [
  "repositoryOwner",
  "repositoryRepo",
  "prNumber",
  "headOid",
  "state",
  "attempts",
  "lastError",
  "acquiredOid",
  "totalCommits",
  "acquiredCommits",
];

export function validatePrObjectJob(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["PR object job must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, PR_OBJECT_JOB_KEYS, "PR object job", errors);
  if (!isNonEmptyString(value.repositoryOwner) || hasNul(value.repositoryOwner)) {
    errors.push("PR object job.repositoryOwner must be a non-empty string without NUL");
  }
  if (!isNonEmptyString(value.repositoryRepo) || hasNul(value.repositoryRepo)) {
    errors.push("PR object job.repositoryRepo must be a non-empty string without NUL");
  }
  if (typeof value.prNumber !== "number" || !Number.isSafeInteger(value.prNumber) || value.prNumber <= 0) {
    errors.push("PR object job.prNumber must be a positive safe integer");
  }
  const head = validateQualifiedOid(value.headOid);
  if (!head.ok) errors.push(...head.errors.map((error) => `PR object job.headOid: ${error}`));
  if (!isPrObjectJobState(value.state)) {
    errors.push(`PR object job.state must be one of ${PR_OBJECT_JOB_STATES.join(", ")}`);
  }
  if (typeof value.attempts !== "number" || !Number.isSafeInteger(value.attempts) || value.attempts < 0) {
    errors.push("PR object job.attempts must be a non-negative safe integer");
  }
  if (value.lastError !== undefined && value.lastError !== null && !isPrSyncErrorKind(value.lastError)) {
    errors.push(`PR object job.lastError, when present, must be one of ${PR_SYNC_ERROR_KINDS.join(", ")}`);
  }
  if (value.acquiredOid !== undefined && value.acquiredOid !== null) {
    const acquired = validateQualifiedOid(value.acquiredOid);
    if (!acquired.ok) errors.push(...acquired.errors.map((error) => `PR object job.acquiredOid: ${error}`));
  }
  for (const field of ["totalCommits", "acquiredCommits"] as const) {
    const count = (value as Record<string, unknown>)[field];
    if (count !== undefined && count !== null &&
      (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)) {
      errors.push(`PR object job.${field}, when present, must be a non-negative safe integer (no cap, exact count)`);
    }
  }
  return { ok: errors.length === 0, errors };
}

const PR_ATTRIBUTION_KEYS: readonly string[] = [
  "repositoryOwner",
  "repositoryRepo",
  "prNumber",
  "baseOid",
  "headOid",
  "mergeBaseOids",
  "mergeOid",
  "mergeStrategy",
  "status",
  "reason",
];

export function validatePrAttribution(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["PR attribution must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, PR_ATTRIBUTION_KEYS, "PR attribution", errors);
  if (!isNonEmptyString(value.repositoryOwner) || hasNul(value.repositoryOwner)) {
    errors.push("PR attribution.repositoryOwner must be a non-empty string without NUL");
  }
  if (!isNonEmptyString(value.repositoryRepo) || hasNul(value.repositoryRepo)) {
    errors.push("PR attribution.repositoryRepo must be a non-empty string without NUL");
  }
  if (typeof value.prNumber !== "number" || !Number.isSafeInteger(value.prNumber) || value.prNumber <= 0) {
    errors.push("PR attribution.prNumber must be a positive safe integer");
  }
  // An unknown base stays an explicit null and is always partial; only an
  // observed base bound can support a complete attribution.
  if (value.baseOid === null) {
    if (value.status === "complete") {
      errors.push('PR attribution with baseOid null must stay "partial" (an unknown bound is never complete)');
    }
  } else {
    const base = validateQualifiedOid(value.baseOid);
    if (!base.ok) errors.push(...base.errors.map((error) => `PR attribution.baseOid: ${error}`));
  }
  const head = validateQualifiedOid(value.headOid);
  if (!head.ok) errors.push(...head.errors.map((error) => `PR attribution.headOid: ${error}`));
  if (!Array.isArray(value.mergeBaseOids)) {
    errors.push("PR attribution.mergeBaseOids must be an array");
  } else {
    value.mergeBaseOids.forEach((oid: unknown, index: number) => {
      const checked = validateQualifiedOid(oid);
      if (!checked.ok) errors.push(...checked.errors.map((error) => `PR attribution.mergeBaseOids[${index}]: ${error}`));
    });
    if (value.status === "complete" && value.mergeBaseOids.length === 0) {
      errors.push('PR attribution with status "complete" requires at least one merge-base OID (no proof-less completeness)');
    }
  }
  if (value.mergeOid !== undefined && value.mergeOid !== null) {
    const merge = validateQualifiedOid(value.mergeOid);
    if (!merge.ok) errors.push(...merge.errors.map((error) => `PR attribution.mergeOid: ${error}`));
  }
  if (!isPullRequestMergeStrategy(value.mergeStrategy)) {
    errors.push(`PR attribution.mergeStrategy must be one of ${PULL_REQUEST_MERGE_STRATEGIES.join(", ")}`);
  }
  if (value.status !== "complete" && value.status !== "partial") {
    errors.push('PR attribution.status must be "complete" or "partial"');
  }
  if (!isNonEmptyString(value.reason)) {
    errors.push("PR attribution.reason must be a non-empty string");
  }
  return { ok: errors.length === 0, errors };
}

const PRIVATE_ACQUISITION_KEYS: readonly string[] = [
  "repositoryOwner",
  "repositoryRepo",
  "prNumber",
  "headOid",
  "serviceRef",
];

export function validatePrivateObjectAcquisitionRequest(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["private acquisition request must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, PRIVATE_ACQUISITION_KEYS, "private acquisition request", errors);
  if (!isNonEmptyString(value.repositoryOwner) || hasNul(value.repositoryOwner)) {
    errors.push("private acquisition request.repositoryOwner must be a non-empty string without NUL");
  }
  if (!isNonEmptyString(value.repositoryRepo) || hasNul(value.repositoryRepo)) {
    errors.push("private acquisition request.repositoryRepo must be a non-empty string without NUL");
  }
  if (typeof value.prNumber !== "number" || !Number.isSafeInteger(value.prNumber) || value.prNumber <= 0) {
    errors.push("private acquisition request.prNumber must be a positive safe integer");
  }
  const head = validateQualifiedOid(value.headOid);
  if (!head.ok) errors.push(...head.errors.map((error) => `private acquisition request.headOid: ${error}`));
  if (!isNonEmptyString(value.serviceRef) || hasNul(value.serviceRef)) {
    errors.push("private acquisition request.serviceRef must be a non-empty string without NUL");
  } else if (!(value.serviceRef as string).startsWith(PRIVATE_PR_REF_PREFIX)) {
    errors.push(`private acquisition request.serviceRef must stay under "${PRIVATE_PR_REF_PREFIX}" (private store only, never the user clone)`);
  }
  return { ok: errors.length === 0, errors };
}

// — L4b: diffs and encrypted latest local content
// (spec/SPEC_LIVE_GIT_INDEXING.md §§8, 10, A08/A09; plan/09 L4b; owner Q2 B).
// Data-pure DTOs, constants and validators only; the engines live in
// ./diffs.js (neutral derivation), ./content-policy.js (deterministic
// pre-persistence secret/path policy) and ./snapshots.js (latest-only
// staging through the injected protection/store/sink ports).
//
// Consumer contract for the S seat (cluster-mesh protected-payload/sqlite)
// and the H seat (h2a live-key-provider). S and H implement the durable and
// cryptographic sides; engram owns only this data-pure contract plus the
// pure derivation. Read this block before implementing either host side.
//
// - Neutral snapshots/diff/hunk/range facts with versioned normalization
//   (LOCAL_DIFF_NORMALIZER_VERSION): staged, unstaged and conflict-stage
//   diffs are distinct kinds with immutable recorded endpoints
//   (staged = HEAD → index, unstaged = index → worktree, conflict =
//   index → index with separate stage 1/2/3 OIDs). An optional cumulative
//   HEAD → worktree view is never produced here: only the three L4b kinds
//   validate.
// - Deterministic pre-persistence secret/path policy (CONTENT_POLICY_VERSION),
//   applied to EVERY surface — patch text, symbol names, citation quotes,
//   search snippets, context excerpts — before any batch is assembled or
//   stored. Persist-then-mask is structurally refused: the sink-bound
//   validator (validateSealedLocalDiff) rejects transient open hunk lines.
// - Latest authorized encrypted state only (Q2 B): replacement is indexed
//   by target and generation at the sink (L4b M2) — the sink keeps only the
//   highest accepted generation per target, durably rejects any delivery at
//   or below the held generation, and retires every older generation when it
//   accepts a newer one; no list/history accessor exists on the port by
//   construction. Snapshots carry no predecessor pointer. The target
//   includes the diff kind (L4b-2): staged, unstaged and conflict snapshots
//   hold distinct targets, and generation ids are fixed-width numeric
//   (`gen:` plus GENERATION_ID_WIDTH digits) so lexicographic order is
//   numeric order.
// - Without a protection key: allowed metadata/ranges only, explicit
//   content_unavailable (CONTENT_UNAVAILABLE) coverage, and the revocation
//   private-purge request (L6a DeclarationRevocationDto) purges private
//   snapshots, derived indexes and decryptability while preserving
//   authorized committed history.
// - .gitignore is never a secrecy guarantee: no gitignore input exists
//   anywhere in this contract or in the engines; a negation cannot unblock
//   a protected path.
// - Binaries, oversized files, filtered paths, protected paths, symlinks,
//   gitlinks, deletions and unstable captures are explicit exclusions or
//   coverage, never invented text hunks.

/** Versioned local-diff normalization evidence (spec §8: rename detection and thresholds are versioned evidence). */
export const LOCAL_DIFF_NORMALIZER_VERSION = "local-diff-normalizer/1";

/** Versioned deterministic content-policy rules stamped on every L4b fact. */
export const CONTENT_POLICY_VERSION = "live-content-policy/1";

/** Explicit coverage marker when no protection key authorizes local content. */
export const CONTENT_UNAVAILABLE = "content_unavailable";

/** Files larger than this are excluded before any content read (matches the L4a capture bound). */
export const LOCAL_MAX_FILE_BYTES = 1_048_576;

/** The three distinct local comparisons (spec §8; GitNexus staged/unstaged/reference distinction). */
export const LOCAL_DIFF_KINDS = ["staged", "unstaged", "conflict"] as const;

export type LocalDiffKind = (typeof LOCAL_DIFF_KINDS)[number];

export function isLocalDiffKind(value: unknown): value is LocalDiffKind {
  return (
    typeof value === "string" &&
    (LOCAL_DIFF_KINDS as readonly string[]).includes(value)
  );
}

/** Immutable recorded endpoint of one local comparison. */
export const LOCAL_DIFF_ENDPOINT_LABELS = ["HEAD", "index", "worktree", "empty-tree", "oid"] as const;

export type LocalDiffEndpointLabel = (typeof LOCAL_DIFF_ENDPOINT_LABELS)[number];

export interface LocalDiffEndpointDto {
  readonly label: LocalDiffEndpointLabel;
  /** Null exactly for the worktree and empty-tree endpoints; otherwise an algorithm hex OID/digest. */
  readonly oid: string | null;
}

/** Why a path carries metadata only, never an invented text hunk. */
export const LOCAL_EXCLUSION_REASONS = [
  "binary",
  "oversized",
  "unknown-size",
  "filtered",
  "protected",
  "symlink",
  "gitlink",
  "unstable-capture",
  "deleted",
] as const;

export type LocalExclusionReason = (typeof LOCAL_EXCLUSION_REASONS)[number];

/**
 * Closed withheld reasons (L4b M1: no free text toward the sink).
 * Secret-rule values name the matched deterministic rule only; the secret
 * itself never appears. `withheld-no-protection-key` is the no-key
 * downgrade of a single hunk.
 */
export const LOCAL_WITHHELD_REASONS = [
  "withheld-secret-aws-access-key",
  "withheld-secret-github-token",
  "withheld-secret-private-key-block",
  "withheld-secret-credential-assignment",
  "withheld-secret-credentialed-url",
  "withheld-secret-unknown",
  "withheld-no-protection-key",
] as const;

export type LocalWithheldReason = (typeof LOCAL_WITHHELD_REASONS)[number];

export function isLocalWithheldReason(value: unknown): value is LocalWithheldReason {
  return typeof value === "string" && (LOCAL_WITHHELD_REASONS as readonly string[]).includes(value);
}

/** Closed withheld reason for a matched deterministic secret rule (the secret itself never appears). */
export function withheldReasonForSecretRule(rule: string | null): LocalWithheldReason {
  const candidate = `withheld-secret-${rule ?? "unknown"}`;
  return isLocalWithheldReason(candidate) ? candidate : "withheld-secret-unknown";
}

/** Closed seal algorithm allowlist (L4b M1: the S seat extends this list by contract amendment). */
export const LOCAL_SEAL_ALGORITHMS = ["fake-seal/1"] as const;

export type LocalSealAlgorithm = (typeof LOCAL_SEAL_ALGORITHMS)[number];

export function isLocalSealAlgorithm(value: unknown): value is LocalSealAlgorithm {
  return typeof value === "string" && (LOCAL_SEAL_ALGORITHMS as readonly string[]).includes(value);
}

/**
 * Strict opaque key reference (L4b M1: host key custody identifier, never
 * free text). Charset-closed; the H seat mints values within this charset.
 */
export function isStrictKeyRef(value: unknown): value is string {
  return isStrictScopeId(value);
}

/**
 * Closed coverage reasons (L4b M1: no free sentence toward the sink).
 * Values carrying `content_unavailable` mark the explicit no-content
 * downgrade (CONTENT_UNAVAILABLE).
 */
export const LOCAL_COVERAGE_REASONS = [
  "content_unavailable:no-key",
  "content_unavailable:unstable-capture",
  "content_unavailable:unknown-size",
  "content_unavailable:conflict-inventory-mismatch",
  "content_unavailable:policy-withheld",
  "partial:no-snapshot-payload",
  "current:sealed-latest",
] as const;

export type LocalCoverageReason = (typeof LOCAL_COVERAGE_REASONS)[number];

export function isLocalCoverageReason(value: unknown): value is LocalCoverageReason {
  return typeof value === "string" && (LOCAL_COVERAGE_REASONS as readonly string[]).includes(value);
}

/** Closed snapshot metadata-only reasons (L4b M1: the no-key downgrade reason; L4b-2: the secret-exclusion reason). */
export const LOCAL_SNAPSHOT_METADATA_REASONS = [
  "metadata:unstable-capture",
  "metadata:no-key",
  "metadata:no-payload",
  "metadata:policy-withheld",
] as const;

export type LocalSnapshotMetadataReason = (typeof LOCAL_SNAPSHOT_METADATA_REASONS)[number];

export function isLocalSnapshotMetadataReason(value: unknown): value is LocalSnapshotMetadataReason {
  return (
    typeof value === "string" && (LOCAL_SNAPSHOT_METADATA_REASONS as readonly string[]).includes(value)
  );
}

/** Strict snapshot identity: `lsnap:` plus the 64 hex characters minted at staging. */
export function isStrictSnapshotId(value: unknown): value is string {
  return typeof value === "string" && /^lsnap:[0-9a-f]{64}$/.test(value);
}

/**
 * Hunk payload states. "open-lines" is transient pre-persistence evidence
 * only: it never reaches a sink or a store (validateSealedLocalDiff refuses
 * it). "sealed" is host-encrypted bytes; "withheld" is an explicit refusal.
 */
export type LocalHunkPayloadDto =
  | { readonly state: "open-lines"; readonly lines: readonly string[] }
  | { readonly state: "sealed"; readonly algorithm: LocalSealAlgorithm; readonly keyRef: string; readonly ciphertext: Uint8Array }
  | { readonly state: "withheld"; readonly reason: LocalWithheldReason };

export interface LocalHunkDto {
  readonly startBefore: number;
  readonly countBefore: number;
  readonly startAfter: number;
  readonly countAfter: number;
  readonly payload: LocalHunkPayloadDto;
}

export const LOCAL_FILE_STATUSES = ["added", "modified", "deleted", "conflict"] as const;

export type LocalFileStatus = (typeof LOCAL_FILE_STATUSES)[number];

export interface LocalFileChangeDto {
  /** Raw path bytes, byte-exact (never line-parsed); a protected path stays as metadata with an explicit exclusion while its content is withheld. */
  readonly path: Uint8Array;
  readonly previousPath: Uint8Array | null;
  readonly status: LocalFileStatus;
  readonly oldMode: string;
  readonly newMode: string;
  readonly oldOid: string;
  readonly newOid: string;
  /** Numstat line counts; null for binary/non-textual content (spec §8). */
  readonly added: number | null;
  readonly deleted: number | null;
  readonly exclusion?: LocalExclusionReason;
  /** Conflict stages 1/2/3 as separate facts, present on conflict diffs only. */
  readonly stageOids?: Readonly<Record<string, string>>;
  readonly hunks: readonly LocalHunkDto[];
}

/** Explicit index/working-tree coverage (spec §12; A04/A09). */
export const LOCAL_COVERAGE_CAUSES = ["unstable-capture", "missing-key", "policy-withheld"] as const;

export type LocalCoverageCause = (typeof LOCAL_COVERAGE_CAUSES)[number];

export interface LocalCoverageReportDto {
  readonly axis: "index" | "working-tree";
  readonly state: CoverageState;
  readonly reason: LocalCoverageReason;
  readonly cause?: LocalCoverageCause;
}

/**
 * One neutral local diff: immutable endpoints, versioned normalization,
 * policy-screened files. A cumulative HEAD → worktree view is not a valid
 * L4b kind and never validates.
 */
export interface LocalDiffDto {
  readonly scope: LiveScope;
  readonly worktreeId: string;
  readonly kind: LocalDiffKind;
  readonly base: LocalDiffEndpointDto;
  readonly tip: LocalDiffEndpointDto;
  readonly comparedParent?: number | null;
  readonly mergeBase?: string | null;
  readonly normalizerVersion: string;
  readonly policyVersion: string;
  readonly files: readonly LocalFileChangeDto[];
  readonly coverage?: LocalCoverageReportDto;
}

/**
 * The sealed latest-state payload (Q2 B). "sealed" is host-encrypted bytes
 * produced BEFORE any persistent write; "metadata-only" is the no-key
 * downgrade carrying ranges/metadata alone.
 */
export type SealedSnapshotPayloadDto =
  | { readonly state: "sealed"; readonly algorithm: LocalSealAlgorithm; readonly keyRef: string; readonly ciphertext: Uint8Array }
  | { readonly state: "metadata-only"; readonly reason: LocalSnapshotMetadataReason };

/**
 * The latest authorized local state only (Q2 B): no history is retained.
 * Replacement is indexed by target and generation at the sink (L4b M2):
 * the snapshot carries no predecessor pointer, so two concurrent captures
 * can never each retire only their own predecessor and leave two states.
 * The target includes the diff kind (L4b-2): staged and conflict snapshots
 * share the "index" axis but hold distinct targets, so a conflict arrival
 * never replaces the staged state.
 */
export interface LocalSnapshotDto {
  readonly scope: LiveScope;
  readonly worktreeId: string;
  readonly snapshotId: string;
  readonly kind: "index" | "working-tree";
  /** Which local comparison this state holds: staged and conflict are distinct index targets. */
  readonly diffKind: LocalDiffKind;
  readonly capturedAt: number;
  readonly diffDigest: string;
  readonly sealed: SealedSnapshotPayloadDto;
  readonly policyVersion: string;
}

const LOCAL_DIFF_ENDPOINT_KEYS: readonly string[] = ["label", "oid"];

const LOCAL_HUNK_KEYS: readonly string[] = [
  "startBefore",
  "countBefore",
  "startAfter",
  "countAfter",
  "payload",
];

const OPEN_LINES_PAYLOAD_KEYS: readonly string[] = ["state", "lines"];

const SEALED_HUNK_PAYLOAD_KEYS: readonly string[] = ["state", "algorithm", "keyRef", "ciphertext"];

const WITHHELD_PAYLOAD_KEYS: readonly string[] = ["state", "reason"];

const LOCAL_FILE_CHANGE_KEYS: readonly string[] = [
  "path",
  "previousPath",
  "status",
  "oldMode",
  "newMode",
  "oldOid",
  "newOid",
  "added",
  "deleted",
  "exclusion",
  "stageOids",
  "hunks",
];

const LOCAL_DIFF_KEYS: readonly string[] = [
  "scope",
  "worktreeId",
  "kind",
  "base",
  "tip",
  "comparedParent",
  "mergeBase",
  "normalizerVersion",
  "policyVersion",
  "files",
  "coverage",
];

const LOCAL_COVERAGE_KEYS: readonly string[] = ["axis", "state", "reason", "cause"];

const LOCAL_SNAPSHOT_KEYS: readonly string[] = [
  "scope",
  "worktreeId",
  "snapshotId",
  "kind",
  "diffKind",
  "capturedAt",
  "diffDigest",
  "sealed",
  "policyVersion",
];

const SEALED_SNAPSHOT_PAYLOAD_KEYS: readonly string[] = ["state", "algorithm", "keyRef", "ciphertext"];

const METADATA_SNAPSHOT_PAYLOAD_KEYS: readonly string[] = ["state", "reason"];

function isHexOid(value: unknown): value is string {
  return typeof value === "string" && (/^[0-9a-f]{40}$/.test(value) || /^[0-9a-f]{64}$/.test(value));
}

function isPathBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

export function validateLocalDiffEndpoint(endpoint: unknown): ValidationResult {
  if (!isRecord(endpoint)) return { ok: false, errors: ["diff endpoint must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(endpoint, LOCAL_DIFF_ENDPOINT_KEYS, "diff endpoint", errors);
  if (typeof endpoint.label !== "string" ||
    !(LOCAL_DIFF_ENDPOINT_LABELS as readonly string[]).includes(endpoint.label)) {
    errors.push(`diff endpoint.label must be one of ${LOCAL_DIFF_ENDPOINT_LABELS.join(", ")}`);
  }
  if (endpoint.label === "worktree" || endpoint.label === "empty-tree") {
    if (endpoint.oid !== null) {
      errors.push("diff endpoint.oid must be null for the worktree and empty-tree endpoints");
    }
  } else if (!isHexOid(endpoint.oid)) {
    errors.push("diff endpoint.oid must be a 40 or 64 character lowercase hex string");
  }
  return { ok: errors.length === 0, errors };
}

function validateLocalHunkPayload(payload: unknown, sealed: boolean): ValidationResult {
  if (!isRecord(payload)) return { ok: false, errors: ["hunk payload must be an object"] };
  const errors: string[] = [];
  // Per-variant exact keys (sink-bound proof): a "sealed" payload carrying
  // a foreign "lines" key is clair under seal and never validates, in either
  // mode. Shared key sets across variants are what let clair pass.
  if (payload.state === "open-lines") {
    rejectUnknownKeys(payload, OPEN_LINES_PAYLOAD_KEYS, "hunk payload", errors);
    if (sealed) {
      errors.push("hunk payload \"open-lines\" is transient pre-persistence evidence and never reaches a sink or a store");
    } else if (!Array.isArray(payload.lines) ||
      payload.lines.some((line: unknown) => typeof line !== "string" || line.includes("\0"))) {
      errors.push("hunk payload.lines must be an array of NUL-free strings");
    }
  } else if (payload.state === "sealed") {
    rejectUnknownKeys(payload, SEALED_HUNK_PAYLOAD_KEYS, "hunk payload", errors);
    if (!isLocalSealAlgorithm(payload.algorithm)) {
      errors.push(`hunk payload.algorithm must be one of ${LOCAL_SEAL_ALGORITHMS.join(", ")}`);
    }
    if (!isStrictKeyRef(payload.keyRef)) {
      errors.push("hunk payload.keyRef must be a strict opaque key reference");
    }
    if (!(payload.ciphertext instanceof Uint8Array) || payload.ciphertext.length === 0) {
      errors.push("hunk payload.ciphertext must be a non-empty byte array");
    }
    if ("lines" in payload) {
      errors.push("hunk payload.lines is clair and never coexists with a sealed state");
    }
  } else if (payload.state === "withheld") {
    rejectUnknownKeys(payload, WITHHELD_PAYLOAD_KEYS, "hunk payload", errors);
    if (!isLocalWithheldReason(payload.reason)) {
      errors.push(`hunk payload.reason must be one of ${LOCAL_WITHHELD_REASONS.join(", ")}`);
    }
  } else {
    errors.push('hunk payload.state must be "open-lines", "sealed" or "withheld"');
  }
  return { ok: errors.length === 0, errors };
}

function validateLocalHunk(hunk: unknown, path: string, sealed: boolean): ValidationResult {
  if (!isRecord(hunk)) return { ok: false, errors: [`${path} must be an object`] };
  const errors: string[] = [];
  rejectUnknownKeys(hunk, LOCAL_HUNK_KEYS, path, errors);
  for (const bound of ["startBefore", "countBefore", "startAfter", "countAfter"] as const) {
    const value = hunk[bound];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      errors.push(`${path}.${bound} must be a non-negative safe integer (immutable range bound)`);
    }
  }
  const payload = validateLocalHunkPayload(hunk.payload, sealed);
  if (!payload.ok) errors.push(...payload.errors.map((error) => `${path}.${error}`));
  return { ok: errors.length === 0, errors };
}

function validateLocalFileChange(file: unknown, path: string, sealed: boolean): ValidationResult {
  if (!isRecord(file)) return { ok: false, errors: [`${path} must be an object`] };
  const errors: string[] = [];
  rejectUnknownKeys(file, LOCAL_FILE_CHANGE_KEYS, path, errors);
  if (!isPathBytes(file.path) || file.path.length === 0) {
    errors.push(`${path}.path must be non-empty raw path bytes`);
  }
  if (file.previousPath !== null && (!isPathBytes(file.previousPath) || file.previousPath.length === 0)) {
    errors.push(`${path}.previousPath must be null or non-empty raw path bytes`);
  }
  if (typeof file.status !== "string" ||
    !(LOCAL_FILE_STATUSES as readonly string[]).includes(file.status)) {
    errors.push(`${path}.status must be one of ${LOCAL_FILE_STATUSES.join(", ")}`);
  }
  for (const mode of ["oldMode", "newMode"] as const) {
    if (typeof file[mode] !== "string" || !/^[0-7]{6}$/.test(file[mode])) {
      errors.push(`${path}.${mode} must be a six-digit octal file mode`);
    }
  }
  for (const oid of ["oldOid", "newOid"] as const) {
    if (!isHexOid(file[oid]) && file[oid] !== "0".repeat(40) && file[oid] !== "0".repeat(64)) {
      errors.push(`${path}.${oid} must be a hex OID or the zero OID`);
    }
  }
  if (file.added !== null && (typeof file.added !== "number" || !Number.isSafeInteger(file.added) || file.added < 0)) {
    errors.push(`${path}.added must be null or a non-negative safe integer (null for binary/non-textual content)`);
  }
  if (file.deleted !== null && (typeof file.deleted !== "number" || !Number.isSafeInteger(file.deleted) || file.deleted < 0)) {
    errors.push(`${path}.deleted must be null or a non-negative safe integer (null for binary/non-textual content)`);
  }
  if (file.exclusion !== undefined) {
    if (typeof file.exclusion !== "string" ||
      !(LOCAL_EXCLUSION_REASONS as readonly string[]).includes(file.exclusion)) {
      errors.push(`${path}.exclusion must be one of ${LOCAL_EXCLUSION_REASONS.join(", ")}`);
    }
    if (Array.isArray(file.hunks) && file.hunks.length > 0) {
      errors.push(`${path} is excluded: excluded files carry metadata only, never text hunks`);
    }
    if (file.added !== null || file.deleted !== null) {
      errors.push(`${path} is excluded: excluded files carry null numstat counts, never invented counts`);
    }
  }
  if (file.stageOids !== undefined) {
    if (!isRecord(file.stageOids)) {
      errors.push(`${path}.stageOids must be an object keyed by conflict stage`);
    } else {
      // Opaque refusal: the rejected stage key is caller-supplied data and
      // may itself carry private text, so it is never interpolated.
      for (const stage of Object.keys(file.stageOids)) {
        if (stage !== "1" && stage !== "2" && stage !== "3") {
          errors.push(`${path}.stageOids carries an unknown conflict stage: only conflict stages 1/2/3 exist`);
        } else if (!isHexOid((file.stageOids as Record<string, unknown>)[stage])) {
          errors.push(`${path}.stageOids holds a non-OID value: every present stage must be a hex OID`);
        }
      }
    }
  }
  if (!Array.isArray(file.hunks)) {
    errors.push(`${path}.hunks must be an array`);
  } else {
    file.hunks.forEach((hunk: unknown, index: number) => {
      const checked = validateLocalHunk(hunk, `${path}.hunks[${index}]`, sealed);
      if (!checked.ok) errors.push(...checked.errors);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function validateLocalCoverage(coverage: unknown): ValidationResult {
  if (!isRecord(coverage)) return { ok: false, errors: ["diff coverage must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(coverage, LOCAL_COVERAGE_KEYS, "diff coverage", errors);
  if (coverage.axis !== "index" && coverage.axis !== "working-tree") {
    errors.push('diff coverage.axis must be "index" or "working-tree"');
  }
  if (typeof coverage.state !== "string" ||
    !["current", "pending", "partial", "stale", "unavailable"].includes(coverage.state)) {
    errors.push("diff coverage.state must be an explicit coverage state, never an empty success");
  }
  if (!isLocalCoverageReason(coverage.reason)) {
    errors.push(`diff coverage.reason must be one of ${LOCAL_COVERAGE_REASONS.join(", ")}`);
  }
  if (coverage.cause !== undefined &&
    (typeof coverage.cause !== "string" ||
      !(LOCAL_COVERAGE_CAUSES as readonly string[]).includes(coverage.cause))) {
    errors.push(`diff coverage.cause must be one of ${LOCAL_COVERAGE_CAUSES.join(", ")}`);
  }
  return { ok: errors.length === 0, errors };
}

function checkLocalDiffEndpoints(kind: LocalDiffKind, base: LocalDiffEndpointDto, tip: LocalDiffEndpointDto): string[] {
  if (kind === "staged" && (base.label !== "HEAD" || tip.label !== "index")) {
    return ['a "staged" diff is HEAD → index only: staged, unstaged and conflict stages never share endpoints'];
  }
  if (kind === "unstaged" && (base.label !== "index" || tip.label !== "worktree")) {
    return ['an "unstaged" diff is index → worktree only: staged, unstaged and conflict stages never share endpoints'];
  }
  if (kind === "conflict" && (base.label !== "index" || tip.label !== "index")) {
    return ['a "conflict" diff is index → index with stage 1/2/3 OIDs only'];
  }
  return [];
}

function validateLocalDiffShape(diff: unknown, sealed: boolean): ValidationResult {
  if (!isRecord(diff)) return { ok: false, errors: ["local diff must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(diff, LOCAL_DIFF_KEYS, "local diff", errors);
  const scope = validateLiveScope(diff.scope);
  if (!scope.ok) errors.push(...scope.errors.map((error) => `local diff.scope: ${error}`));
  if (!isStrictBatchId(diff.worktreeId, ID_PREFIXES.worktree)) {
    errors.push(`local diff.worktreeId must be a strict opaque id starting with "${ID_PREFIXES.worktree}"`);
  }
  const kindOk = isLocalDiffKind(diff.kind);
  if (!kindOk) {
    errors.push(`local diff.kind must be one of ${LOCAL_DIFF_KINDS.join(", ")} (no cumulative HEAD → worktree view validates here)`);
  }
  const base = validateLocalDiffEndpoint(diff.base);
  if (!base.ok) errors.push(...base.errors.map((error) => `local diff.base: ${error}`));
  const tip = validateLocalDiffEndpoint(diff.tip);
  if (!tip.ok) errors.push(...tip.errors.map((error) => `local diff.tip: ${error}`));
  if (kindOk && base.ok && tip.ok) {
    errors.push(...checkLocalDiffEndpoints(
      diff.kind as LocalDiffKind,
      diff.base as LocalDiffEndpointDto,
      diff.tip as LocalDiffEndpointDto,
    ));
  }
  if (diff.comparedParent !== undefined && diff.comparedParent !== null &&
    (typeof diff.comparedParent !== "number" || !Number.isSafeInteger(diff.comparedParent) || diff.comparedParent < 0)) {
    errors.push("local diff.comparedParent, when present, must be null or a non-negative safe integer");
  }
  if (diff.mergeBase !== undefined && diff.mergeBase !== null && !isHexOid(diff.mergeBase)) {
    errors.push("local diff.mergeBase, when present, must be null or a hex OID");
  }
  if (diff.normalizerVersion !== LOCAL_DIFF_NORMALIZER_VERSION) {
    errors.push(`local diff.normalizerVersion must be "${LOCAL_DIFF_NORMALIZER_VERSION}" (normalization is versioned evidence)`);
  }
  if (diff.policyVersion !== CONTENT_POLICY_VERSION) {
    errors.push(`local diff.policyVersion must be "${CONTENT_POLICY_VERSION}"`);
  }
  if (!Array.isArray(diff.files)) {
    errors.push("local diff.files must be an array");
  } else {
    diff.files.forEach((file: unknown, index: number) => {
      const checked = validateLocalFileChange(file, `local diff.files[${index}]`, sealed);
      if (!checked.ok) errors.push(...checked.errors);
    });
  }
  if (diff.coverage !== undefined) {
    const coverage = validateLocalCoverage(diff.coverage);
    if (!coverage.ok) errors.push(...coverage.errors.map((error) => `local diff.${error}`));
  }
  return { ok: errors.length === 0, errors };
}

/** Structural validation of a derived (possibly transient) local diff. */
export function validateLocalDiff(diff: unknown): ValidationResult {
  return validateLocalDiffShape(diff, false);
}

/**
 * Sink/store-bound validation: transient "open-lines" hunk payloads are
 * refused, so persist-then-mask cannot validate. Seal through the injected
 * host protection port first, or withhold explicitly.
 */
export function validateSealedLocalDiff(diff: unknown): ValidationResult {
  return validateLocalDiffShape(diff, true);
}

function validateSealedSnapshotPayload(payload: unknown): ValidationResult {
  if (!isRecord(payload)) return { ok: false, errors: ["snapshot sealed payload must be an object"] };
  const errors: string[] = [];
  if (payload.state === "sealed") {
    rejectUnknownKeys(payload, SEALED_SNAPSHOT_PAYLOAD_KEYS, "snapshot sealed payload", errors);
    if (!isLocalSealAlgorithm(payload.algorithm)) {
      errors.push(`snapshot sealed payload.algorithm must be one of ${LOCAL_SEAL_ALGORITHMS.join(", ")}`);
    }
    if (!isStrictKeyRef(payload.keyRef)) {
      errors.push("snapshot sealed payload.keyRef must be a strict opaque key reference (host key custody, never in the database)");
    }
    if (!(payload.ciphertext instanceof Uint8Array) || payload.ciphertext.length === 0) {
      errors.push("snapshot sealed payload.ciphertext must be a non-empty byte array");
    }
    if ("lines" in payload || "reason" in payload) {
      errors.push("a sealed snapshot payload carries ciphertext only, never clair or downgrade reasons");
    }
  } else if (payload.state === "metadata-only") {
    rejectUnknownKeys(payload, METADATA_SNAPSHOT_PAYLOAD_KEYS, "snapshot sealed payload", errors);
    if (!isLocalSnapshotMetadataReason(payload.reason)) {
      errors.push(`snapshot sealed payload.reason must be one of ${LOCAL_SNAPSHOT_METADATA_REASONS.join(", ")}`);
    }
  } else {
    errors.push('snapshot sealed payload.state must be "sealed" or "metadata-only"');
  }
  return { ok: errors.length === 0, errors };
}

/** Structural validation of the latest authorized local state (Q2 B). */
export function validateLocalSnapshot(snapshot: unknown): ValidationResult {
  if (!isRecord(snapshot)) return { ok: false, errors: ["local snapshot must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(snapshot, LOCAL_SNAPSHOT_KEYS, "local snapshot", errors);
  const scope = validateLiveScope(snapshot.scope);
  if (!scope.ok) errors.push(...scope.errors.map((error) => `local snapshot.scope: ${error}`));
  if (!isStrictBatchId(snapshot.worktreeId, ID_PREFIXES.worktree)) {
    errors.push(`local snapshot.worktreeId must be a strict opaque id starting with "${ID_PREFIXES.worktree}"`);
  }
  if (!isStrictSnapshotId(snapshot.snapshotId)) {
    errors.push("local snapshot.snapshotId must be a strict lsnap hex snapshot id");
  }
  if (snapshot.kind !== "index" && snapshot.kind !== "working-tree") {
    errors.push('local snapshot.kind must be "index" or "working-tree"');
  }
  if (!isLocalDiffKind(snapshot.diffKind)) {
    errors.push('local snapshot.diffKind must be one of "staged", "unstaged", "conflict" (staged and conflict hold distinct index targets)');
  }
  // MINEUR 2 (Opus tour 2): kind/diffKind pairing — `unstaged` goes with
  // `working-tree` only; `staged`/`conflict` go with `index` only.
  if ((snapshot.kind === "index" || snapshot.kind === "working-tree") &&
    isLocalDiffKind(snapshot.diffKind)) {
    const coherent =
      (snapshot.diffKind === "unstaged" && snapshot.kind === "working-tree") ||
      (snapshot.diffKind !== "unstaged" && snapshot.kind === "index");
    if (!coherent) {
      errors.push('local snapshot.kind/diffKind mismatch: "unstaged" pairs with "working-tree" only, "staged"/"conflict" pair with "index" only');
    }
  }
  if (typeof snapshot.capturedAt !== "number" || !Number.isSafeInteger(snapshot.capturedAt) || snapshot.capturedAt <= 0) {
    errors.push("local snapshot.capturedAt must be a positive safe integer (milliseconds)");
  }
  if (typeof snapshot.diffDigest !== "string" || !/^[0-9a-f]{64}$/.test(snapshot.diffDigest)) {
    errors.push("local snapshot.diffDigest must be a 64 character lowercase hex digest of the screened diff");
  }
  const sealed = validateSealedSnapshotPayload(snapshot.sealed);
  if (!sealed.ok) errors.push(...sealed.errors.map((error) => `local snapshot.${error}`));
  if (snapshot.policyVersion !== CONTENT_POLICY_VERSION) {
    errors.push(`local snapshot.policyVersion must be "${CONTENT_POLICY_VERSION}"`);
  }
  return { ok: errors.length === 0, errors };
}
