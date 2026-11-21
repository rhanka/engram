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

// G2 is a comparison of two retained versions, not a historical identity or
// a DAG traversal. Readers own history, parent views, pagination and storage.
export interface SymbolHistoryOptionsDto {
  readonly version: "exact-l5-body/1";
  /** Exact equality of nonempty SHA-256 L5 body fingerprints only. These
   * percentages are intentionally fixed; fuzzy matching needs a new policy. */
  readonly renameThreshold: 100;
  readonly moveThreshold: 100;
  readonly copyThreshold: 100;
}
export interface SymbolHistoryRequestDto {
  readonly scope: LiveScope;
  readonly generationId: string;
  readonly before: QualifiedOid;
  readonly after: QualifiedOid;
  readonly policyVersion: string;
  readonly options: SymbolHistoryOptionsDto;
}
export interface SymbolHistoryAnchorDto {
  readonly commit: QualifiedOid;
  readonly tree: QualifiedOid;
  readonly blob: QualifiedOid;
  readonly path: Uint8Array;
  /** Version-local L5 identity; never a continuity key. */
  readonly symbolId: string;
  readonly slot: string;
  readonly name: string;
  readonly kind: string;
  readonly language: string;
  readonly bodyHash: string;
  /** Explicitly unavailable until L5 supplies verified declaration ranges. */
  readonly range: LineRangeDto | null;
}
export interface SymbolCorrespondenceDto {
  readonly before: readonly SymbolHistoryAnchorDto[];
  readonly after: readonly SymbolHistoryAnchorDto[];
  readonly relation: "unchanged" | "renamed" | "moved" | "renamed-and-moved" | "ambiguous";
  /** Fan-out is not proof of a split or copy; fan-in is not proof of a
   * semantic merge. A changed/split/merged body below policy stays missing. */
  readonly reason: "unique-exact-body" | "split-or-copy" | "merge" | "duplicate" | "missing";
  readonly similarity: 100 | null;
}
export type SymbolHistoryGapCause = "unauthorized" | "excluded" | "missing-retention" | "missing-object" |
  "invalid-evidence" | "inventory-unavailable" | "path-unavailable" | "unsupported-entry" | "bounds-exceeded";
export interface SymbolHistoryOutcomeDto extends SymbolHistoryRequestDto {
  readonly calculationVersion: string;
  readonly extractorVersion: string;
  readonly state: "complete" | "partial";
  readonly correspondences: readonly SymbolCorrespondenceDto[];
  readonly parentEvidence: readonly LineParentEvidenceDto[];
  readonly coverage: {
    readonly axis: "symbol-correspondence";
    /** Current means both entire regular-blob inventories were verified;
     * individual correspondences may still be ambiguous. No causal claim. */
    readonly state: "current" | "partial";
    readonly gaps: readonly { readonly cause: SymbolHistoryGapCause; readonly reason: string }[];
  };
}
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
  readonly facts: readonly LiveFactDto[];
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
  if (typeof value !== "object" || value === null || Array.isArray(value) || value instanceof Uint8Array) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
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
  const checked = validateLiveFact(fact);
  if (!checked.ok) {
    return { ok: false, errors: checked.errors.map((error) => `${path}: ${error}`) };
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
  if (!isBatchPolicyVersion(batch.policyVersion)) {
    errors.push(`batch.policyVersion must be one of ${BATCH_POLICY_VERSIONS.join(", ")}`);
  }
  if (!isStrictGenerationId(batch.generationId)) errors.push(`batch.generationId must be a fixed-width generation id ("gen:" plus ${GENERATION_ID_WIDTH} zero-padded digits)`);
  if (!isStrictBatchId(batch.batchId, "batch:")) errors.push("batch.batchId must be a strict opaque batch id");
  if (typeof batch.batchDigest !== "string" || !/^[0-9a-f]{64}$/.test(batch.batchDigest)) {
    errors.push("batch.batchDigest must be a 64 character lowercase hex digest");
  }
  if (!Array.isArray(batch.facts)) {
    errors.push("batch.facts must be an array");
  } else {
    const batchScope = scope.ok ? (batch.scope as LiveScope) : null;
    let l4bWorktreeId: string | null = null;
    const localCoverageIndices: number[] = [];

    batch.facts.forEach((fact: unknown, index: number) => {
      const checked = validateBatchFact(fact, index);
      if (!checked.ok) {
        errors.push(...checked.errors);
        return;
      }
      if (batchScope === null) return;
      const path = `batch.facts[${index}]`;
      const kind = classifyLiveFactKind(fact);
      const record = fact as Record<string, unknown>;

      if (typeof record.cloneId === "string" && record.cloneId !== batchScope.clone) {
        errors.push(`${path}: fact.cloneId does not match batch.scope.clone`);
      }

      if (isRecord(record.scope)) {
        const factScope = record.scope as unknown as LiveScope;
        if (factScope.tenant !== batchScope.tenant) {
          errors.push(`${path}: fact.scope.tenant does not match batch.scope.tenant`);
        }
        if (factScope.clone !== batchScope.clone) {
          errors.push(`${path}: fact.scope.clone does not match batch.scope.clone`);
        }
        if (
          (kind === "local-diff" || kind === "local-snapshot") &&
          (factScope.worktree ?? undefined) !== (batchScope.worktree ?? undefined)
        ) {
          errors.push(`${path}: fact.scope.worktree does not match batch.scope.worktree`);
        }
      }

      if (typeof record.worktreeId === "string") {
        if (batchScope.worktree !== undefined && record.worktreeId !== batchScope.worktree) {
          errors.push(`${path}: fact.worktreeId does not match batch.scope.worktree`);
        }
        if (kind === "local-diff" || kind === "local-snapshot") {
          if (l4bWorktreeId === null) {
            l4bWorktreeId = record.worktreeId;
          } else if (l4bWorktreeId !== record.worktreeId) {
            errors.push(`${path}: L4b structural facts in one batch must bind a single worktreeId`);
          }
        }
      }

      if (kind === "local-coverage") {
        localCoverageIndices.push(index);
      }
    });

    if (batchScope !== null && localCoverageIndices.length > 0 && batchScope.worktree === undefined && l4bWorktreeId === null) {
      for (const index of localCoverageIndices) {
        errors.push(`batch.facts[${index}]: local-coverage fact requires batch.scope.worktree or a worktree-bound L4b fact in the same batch`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function isFactBatchDto(batch: unknown): batch is FactBatchDto {
  return validateFactBatch(batch).ok;
}

export function parseFactBatch(
  batch: unknown,
): { readonly ok: true; readonly value: FactBatchDto } | { readonly ok: false; readonly errors: readonly string[] } {
  const checked = validateFactBatch(batch);
  if (!checked.ok) return { ok: false, errors: checked.errors };
  return { ok: true, value: batch as FactBatchDto };
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

const QUALIFIED_OID_KEYS: readonly string[] = ["algorithm", "oid"];

export function validateQualifiedOid(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["qualifiedOid must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, QUALIFIED_OID_KEYS, "qualifiedOid", errors);
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
      rejectUnknownKeys(value.pendingRetry, ["kind", "attempts", "nextAfter"], "PR cursor.pendingRetry", errors);
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


// — L3a-E1: versioned typed facts, closed union and exact-key validators
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3, 6, 13; spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md
// §§12.3, 17.4; plan/09 L3a-E1).
//
// Data-pure definitions only: zero imports, zero Node builtins, zero host or
// database types. The three L4b shapes already emitted by ./snapshots.js
// (LocalDiffDto, LocalSnapshotDto, LocalCoverageReportDto) keep their exact
// bytes and gain no kind key; validateLiveFact discriminates them structurally
// and refuses any shape that matches no member of LiveFactDto.

/** Version of the typed fact schema stamped on every tagged LiveFactDto. */
export const FACT_SCHEMA_VERSION = 1 as const;

/** Fixed maximum canonical wire size of one emitted batch (4 MiB; LIVE §13, SPEC_L3A §12.3). */
export const MAX_FACT_BATCH_BYTES = 4 * 1024 * 1024;

/** Version of the canonical wire codec and digest domain separation. */
export const BATCH_CODEC_VERSION = "engram-live-batch-codec/1" as const;

/** Closed set of policy versions accepted on FactBatchDto envelopes. */
export const BATCH_POLICY_VERSIONS = [POLICY_VERSION, CONTENT_POLICY_VERSION] as const;

export type BatchPolicyVersion = (typeof BATCH_POLICY_VERSIONS)[number];

export function isBatchPolicyVersion(value: unknown): value is BatchPolicyVersion {
  return (
    typeof value === "string" &&
    (BATCH_POLICY_VERSIONS as readonly string[]).includes(value)
  );
}

/** Tagged fact kinds carrying `kind` and `schemaVersion: FACT_SCHEMA_VERSION`. */
export const TAGGED_FACT_KINDS = [
  "ref-observation",
  "ref-state",
  "commit",
  "changed-file",
  "pr-observation",
  "pr-attribution",
  "retention-receipt",
  "branch-comparison",
  "code-analysis",
  "code-relation",
  "line-attribution",
  "symbol-correspondence",
  "coverage",
  "progress",
] as const;

export type TaggedFactKind = (typeof TAGGED_FACT_KINDS)[number];

/** Structural L4b fact kinds emitted directly without adding a kind wrapper. */
export const STRUCTURAL_L4B_FACT_KINDS = [
  "local-diff",
  "local-snapshot",
  "local-coverage",
] as const;

export type StructuralL4bFactKind = (typeof STRUCTURAL_L4B_FACT_KINDS)[number];

/** Complete closed set of live fact kinds admitted in FactBatchDto.facts. */
export const LIVE_FACT_KINDS = [
  ...TAGGED_FACT_KINDS,
  ...STRUCTURAL_L4B_FACT_KINDS,
] as const;

export type LiveFactKind = (typeof LIVE_FACT_KINDS)[number];

export const REF_KINDS = ["local-branch", "remote-branch", "pr-head", "tag", "other"] as const;
export const ACTIVITY_SIGNAL_KINDS = ["bootstrap-committer-time", "observed-target-change"] as const;
export const GIT_FILE_CHANGE_STATUSES = ["A", "C", "D", "M", "R", "T", "U", "X", "B"] as const;
export type GitFileChangeStatus = (typeof GIT_FILE_CHANGE_STATUSES)[number];

export const COMPARISON_KINDS = ["contribution", "current-diff", "merge-parent"] as const;
export type BranchComparisonKind = (typeof COMPARISON_KINDS)[number];
export const COMPARISON_STATES = ["complete", "partial", "unknown", "unrelated"] as const;
export type BranchComparisonState = (typeof COMPARISON_STATES)[number];
export const COMPARISON_BASE_SOURCES = ["pr-base", "default-base", "override"] as const;
export type BranchComparisonBaseSource = (typeof COMPARISON_BASE_SOURCES)[number];
export const DIFF_CHANGE_KINDS = ["added", "deleted", "modified", "renamed", "typechange"] as const;
export type BranchDiffChangeKind = (typeof DIFF_CHANGE_KINDS)[number];
export const BRANCH_DIFF_ALGORITHMS = ["histogram", "minimal", "myers", "patience"] as const;
export type BranchDiffAlgorithm = (typeof BRANCH_DIFF_ALGORITHMS)[number];

export const CODE_ANALYSIS_STATES = ["complete", "partial", "unavailable"] as const;
export type CodeAnalysisFactState = (typeof CODE_ANALYSIS_STATES)[number];
export const CODE_RELATION_ROLES = ["calls", "inherits"] as const;
export type CodeRelationRole = (typeof CODE_RELATION_ROLES)[number];
export const CODE_UNRESOLVED_KINDS = ["unresolved-call", "unresolved-type"] as const;
export type CodeUnresolvedKind = (typeof CODE_UNRESOLVED_KINDS)[number];

export const LINE_ATTRIBUTION_GAP_CAUSES = [
  "missing-retention",
  "missing-object",
  "missing-path",
  "shallow",
  "excluded",
  "unauthorized",
  "invalid-range",
  "invalid-evidence",
  "git-unavailable",
] as const;

export const SYMBOL_HISTORY_GAP_CAUSES = [
  "unauthorized",
  "excluded",
  "missing-retention",
  "missing-object",
  "invalid-evidence",
  "inventory-unavailable",
  "path-unavailable",
  "unsupported-entry",
  "bounds-exceeded",
] as const;

export const SYMBOL_CORRESPONDENCE_RELATIONS = [
  "unchanged",
  "renamed",
  "moved",
  "renamed-and-moved",
  "ambiguous",
] as const;

export const SYMBOL_CORRESPONDENCE_REASONS = [
  "unique-exact-body",
  "split-or-copy",
  "merge",
  "duplicate",
  "missing",
] as const;

export const COVERAGE_FACT_AXES = [
  "refs",
  "dag",
  "pr-metadata",
  "object-availability",
  "pr-attribution",
  "ast",
  "index",
  "working-tree",
  "remote-publication",
  "line-attribution",
  "symbol-correspondence",
] as const;
export type CoverageFactAxis = (typeof COVERAGE_FACT_AXES)[number];

export const COVERAGE_FACT_STATES = [
  "unknown",
  "pending",
  "backfill",
  "current",
  "stale",
  "partial",
  "unstable",
  "degraded",
  "auth_required",
  "unavailable",
] as const;
export type CoverageFactState = (typeof COVERAGE_FACT_STATES)[number];

export const PROGRESS_FACT_KINDS = [
  "history-checkpoint",
  "retained-root",
  "pr-cursor",
  "pr-object-job",
  "reconcile-checkpoint",
] as const;
export type ProgressFactKind = (typeof PROGRESS_FACT_KINDS)[number];

/** One ref observation fact carrying its explicit ref-observation identity (SPEC_L3A §12.3). */
export interface RefObservationFactDto {
  readonly kind: "ref-observation";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly observationId: string;
  readonly cloneId: string;
  readonly refName: string;
  readonly refKind: RefKind;
  readonly algorithm: OidAlgorithm;
  readonly target: QualifiedOid | null;
  readonly observedAt: number;
  readonly absent: boolean;
  readonly generation: number;
  readonly tipCommitterUnixSeconds?: number;
}

/** Tracked ref state folded over its ref observations (creation/deletion/recreation distinct). */
export interface TrackedRefFactDto {
  readonly kind: "ref-state";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly cloneId: string;
  readonly refName: string;
  readonly refKind: RefKind;
  readonly target: QualifiedOid | null;
  readonly generation: number;
  readonly activity: RefActivityDto | null;
  readonly deletedAt: number | null;
  readonly lastObservedAt: number;
}

/** Immutable commit fact with algorithm-qualified OIDs and ordered parents. */
export interface CommitFactDto {
  readonly kind: "commit";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly cloneId: string;
  readonly commit: QualifiedOid;
  readonly tree: QualifiedOid;
  readonly parents: readonly QualifiedOid[];
  readonly author: HistoryIdentityDto;
  readonly committer: HistoryIdentityDto;
  readonly subject: string;
  readonly message: Uint8Array;
  readonly extractorVersion: string;
  readonly policyVersion: string;
}

/** One changed file of a commit against one ordered parent (-1 for a root commit). */
export interface ChangedFileFactDto {
  readonly kind: "changed-file";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly cloneId: string;
  readonly commit: QualifiedOid;
  readonly parentIndex: number;
  readonly parentCommit: QualifiedOid | null;
  readonly path: Uint8Array;
  readonly previousPath: Uint8Array | null;
  readonly status: GitFileChangeStatus;
  readonly statusScore: number | null;
  readonly oldMode: string;
  readonly newMode: string;
  readonly oldBlob: QualifiedOid | null;
  readonly newBlob: QualifiedOid | null;
  readonly added: number | null;
  readonly deleted: number | null;
  readonly extractorVersion: string;
  readonly policyVersion: string;
}

/** One all-state GitHub PR observation fact (no tokens/credentials). */
export interface PullRequestObservationFactDto {
  readonly kind: "pr-observation";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly observationId: string;
  readonly cloneId: string;
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

/** Pinned historical PR attribution fact, separate from raw ancestry. */
export interface PrAttributionFactDto {
  readonly kind: "pr-attribution";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly cloneId: string;
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

/** Scoped durable retention receipt fact (clone-scoped, algorithm-qualified target). */
export interface RetentionReceiptFactDto {
  readonly kind: "retention-receipt";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly scope: LiveScope;
  readonly target: QualifiedOid;
  readonly receivedAt: number;
  readonly backupRef: string;
}

export interface BranchComparisonDiffChangeFactDto {
  readonly beforePath: Uint8Array | null;
  readonly afterPath: Uint8Array | null;
  readonly beforeMode: string | null;
  readonly afterMode: string | null;
  readonly changeKind: BranchDiffChangeKind;
  readonly renameEvidence: string | null;
  readonly binary: boolean;
  readonly insertions: number;
  readonly deletions: number;
}

export interface BranchComparisonDiffOptionsFactDto {
  readonly algorithm: BranchDiffAlgorithm;
  readonly binaryDetection: boolean;
  readonly renameLimit: number;
  readonly renameThreshold: number;
}

export interface BranchComparisonDiffFactDto {
  readonly beforeTree: QualifiedOid;
  readonly afterTree: QualifiedOid;
  readonly parentIndex: number | null;
  readonly comparatorVersion: string;
  readonly gitVersion: string;
  readonly objectFormat: OidAlgorithm;
  readonly options: BranchComparisonDiffOptionsFactDto;
  readonly changes: readonly BranchComparisonDiffChangeFactDto[];
}

export interface BranchComparisonParentFactDto {
  readonly parentIndex: number;
  readonly parent: QualifiedOid;
  readonly target: QualifiedOid | null;
  readonly state: "complete" | "unknown";
  readonly reason: string;
  readonly diff: BranchComparisonDiffFactDto | null;
}

/** Pinned branch/PR/parent comparison fact with verified merge-bases and derived diffs. */
export interface BranchComparisonFactDto {
  readonly kind: "branch-comparison";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly cloneId: string;
  readonly comparisonKind: BranchComparisonKind;
  readonly state: BranchComparisonState;
  readonly baseTip: QualifiedOid;
  readonly branchTip: QualifiedOid;
  readonly mergeBases: readonly QualifiedOid[];
  readonly baseSource: BranchComparisonBaseSource | null;
  readonly comparatorVersion: string;
  readonly gitVersion: string | null;
  readonly policyVersion: string;
  readonly perParent: readonly BranchComparisonParentFactDto[];
  readonly diffs: readonly BranchComparisonDiffFactDto[];
}

/** Complete endpoint of a versioned code relationship (SPEC_L3A §12.3, LIVE §3). */
export interface CodeRelationEndpointDto {
  readonly symbolId: string;
  readonly slot: string;
  readonly path: Uint8Array;
  readonly tree: QualifiedOid | null;
  readonly commit?: QualifiedOid | null;
}

export interface CodeSymbolFactDto {
  readonly symbolId: string;
  readonly slot: string;
  readonly name: string;
  readonly kind: string;
  readonly bodyHash: string;
  readonly contentHash: string;
  readonly path: Uint8Array;
  readonly tree: QualifiedOid | null;
}

export interface CodeRelationItemDto {
  readonly relationId: string;
  readonly role: CodeRelationRole;
  readonly source: CodeRelationEndpointDto;
  readonly target: CodeRelationEndpointDto;
  readonly external: boolean;
  readonly extractorVersion: string;
  readonly resolverVersion: string;
}

export interface CodeUnresolvedFactDto {
  readonly unresolvedKind: CodeUnresolvedKind;
  readonly name: string;
  readonly fromSymbolId: string;
  readonly reason: string;
}

/** Context-bound versioned code analysis fact (L5). */
export interface CodeAnalysisFactDto {
  readonly kind: "code-analysis";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly cloneId: string;
  readonly worktreeId: string | null;
  readonly snapshotId: string | null;
  readonly tree: QualifiedOid | null;
  readonly blob: QualifiedOid | null;
  readonly path: Uint8Array;
  readonly language: string;
  readonly dialect: string;
  readonly state: CodeAnalysisFactState;
  readonly topologyHash: string;
  readonly contentHash: string;
  readonly configHash: string;
  readonly dependencyHash: string;
  readonly grammarVersion: string | null;
  readonly grammarDigest?: string | null;
  readonly grammarId?: string | null;
  readonly extractorVersion: string;
  readonly resolverVersion: string;
  readonly policyVersion: string;
  readonly symbols: readonly CodeSymbolFactDto[];
  readonly relations: readonly CodeRelationItemDto[];
  readonly unresolved: readonly CodeUnresolvedFactDto[];
}

/** Standalone versioned code relationship with complete endpoints, role and versions. */
export interface CodeRelationFactDto {
  readonly kind: "code-relation";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly cloneId: string;
  readonly relationId: string;
  readonly role: CodeRelationRole;
  readonly source: CodeRelationEndpointDto;
  readonly target: CodeRelationEndpointDto;
  readonly external: boolean;
  readonly extractorVersion: string;
  readonly resolverVersion: string;
  readonly policyVersion: string;
}

/** G1 line attribution fact bound to pinned target OID, ranges, options and parent evidence. */
export interface LineAttributionFactDto {
  readonly kind: "line-attribution";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly cloneId: string;
  readonly target: QualifiedOid;
  readonly path: Uint8Array;
  readonly ranges: readonly LineRangeDto[];
  readonly policyVersion: string;
  readonly options: LineAttributionOptionsDto;
  readonly calculationVersion: string;
  readonly gitVersion: string | null;
  readonly retainedRoot: QualifiedOid | null;
  readonly state: "complete" | "partial";
  readonly origins: readonly LineOriginDto[];
  readonly parentEvidence: readonly LineParentEvidenceDto[];
  readonly gaps: readonly LineAttributionGapDto[];
}

export interface SymbolHistoryGapDto {
  readonly cause: SymbolHistoryGapCause;
  readonly reason: string;
}

/** G2 cross-version symbol correspondence fact bound to pinned before/after endpoints. */
export interface SymbolCorrespondenceFactDto {
  readonly kind: "symbol-correspondence";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly cloneId: string;
  readonly before: QualifiedOid;
  readonly after: QualifiedOid;
  readonly policyVersion: string;
  readonly options: SymbolHistoryOptionsDto;
  readonly calculationVersion: string;
  readonly extractorVersion: string;
  readonly state: "complete" | "partial";
  readonly correspondences: readonly SymbolCorrespondenceDto[];
  readonly parentEvidence: readonly LineParentEvidenceDto[];
  readonly gaps: readonly SymbolHistoryGapDto[];
}

/** Explicit coverage fact for any live axis. */
export interface CoverageFactDto {
  readonly kind: "coverage";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly axis: CoverageFactAxis;
  readonly state: CoverageFactState;
  readonly reason: string;
  readonly checkedAt: number;
  readonly language?: string;
  readonly cause?: string;
  readonly pendingCount?: number;
  readonly pendingFrontier?: string | null;
  readonly boundary?: readonly QualifiedOid[];
  readonly missing?: readonly QualifiedOid[];
  readonly lastSuccessAt?: number | null;
}

export interface HistoryCheckpointProgressFactDto {
  readonly kind: "progress";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly progressKind: "history-checkpoint";
  readonly cloneId: string;
  readonly commit: QualifiedOid;
  readonly tree: QualifiedOid;
  readonly parents: readonly QualifiedOid[];
  readonly extractorVersion: string;
  readonly policyVersion: string;
}

export interface RetainedRootProgressFactDto {
  readonly kind: "progress";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly progressKind: "retained-root";
  readonly cloneId: string;
  readonly root: QualifiedOid;
  readonly firstSeenAt: number;
  readonly firstSignal: RootSelectionSignal;
  readonly refName: string | null;
}

export interface PrCursorProgressFactDto {
  readonly kind: "progress";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly progressKind: "pr-cursor";
  readonly cloneId: string;
  readonly cursor: PrSyncCursorDto;
}

export interface PrObjectJobProgressFactDto {
  readonly kind: "progress";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly progressKind: "pr-object-job";
  readonly cloneId: string;
  readonly job: PrObjectJobDto;
}

export interface ReconcileCheckpointProgressFactDto {
  readonly kind: "progress";
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly progressKind: "reconcile-checkpoint";
  readonly cloneId: string;
  readonly worktreeId: string | null;
  readonly checkpointId: string;
  readonly pendingCount: number;
  readonly frontier: string | null;
  readonly complete: boolean;
  readonly recordedAt: number;
}

/** Durable progress and checkpoint facts (discriminated per progressKind with exact keys). */
export type ProgressFactDto =
  | HistoryCheckpointProgressFactDto
  | RetainedRootProgressFactDto
  | PrCursorProgressFactDto
  | PrObjectJobProgressFactDto
  | ReconcileCheckpointProgressFactDto;

/**
 * Closed typed union of every fact admitted inside FactBatchDto.facts.
 * Includes the 14 tagged fact kinds and the 3 structural L4b fact shapes
 * emitted directly by snapshots.ts without altering their bytes.
 */
export type LiveFactDto =
  | RefObservationFactDto
  | TrackedRefFactDto
  | CommitFactDto
  | ChangedFileFactDto
  | PullRequestObservationFactDto
  | PrAttributionFactDto
  | RetentionReceiptFactDto
  | BranchComparisonFactDto
  | CodeAnalysisFactDto
  | CodeRelationFactDto
  | LineAttributionFactDto
  | SymbolCorrespondenceFactDto
  | CoverageFactDto
  | ProgressFactDto
  | LocalDiffDto
  | LocalSnapshotDto
  | LocalCoverageReportDto;

// — Exact-key pure validators for every typed fact and nested structure.

function hasNulByte(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

function isNonEmptySafePathBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && value.length > 0 && !hasNulByte(value);
}

function isHex64String(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isOctalMode6(value: unknown): value is string {
  return typeof value === "string" && /^[0-7]{6}$/.test(value);
}

function isTreeOctalMode(value: unknown): value is string {
  return typeof value === "string" && /^[0-7]{5,6}$/.test(value);
}

function isNonNegativeSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isSafeText(value: unknown): value is string {
  return typeof value === "string" && !hasNul(value);
}

function isNonEmptySafeText(value: unknown): value is string {
  return isNonEmptyString(value) && !hasNul(value);
}

function isVersionString(value: unknown): value is string {
  return isNonEmptySafeText(value) && value.length <= 256;
}

function isInList<T extends string>(value: unknown, list: readonly T[]): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

const HISTORY_IDENTITY_KEYS: readonly string[] = ["name", "email", "unixSeconds", "offsetMinutes"];
const LINE_AUTHOR_IDENTITY_KEYS: readonly string[] = [
  "name", "email", "unixSeconds", "offsetMinutes", "nameBytes", "emailBytes",
];
const REF_ACTIVITY_KEYS: readonly string[] = ["activityAt", "signal"];
const LINE_RANGE_KEYS: readonly string[] = ["start", "end"];
const LINE_ATTRIBUTION_OPTIONS_KEYS: readonly string[] = [
  "version", "algorithm", "moveMinCharacters", "copyMinCharacters", "copySearch",
];
const LINE_ORIGIN_KEYS: readonly string[] = ["commit", "author", "path", "originalRange", "finalRange"];
const LINE_PARENT_EVIDENCE_KEYS: readonly string[] = ["commit", "parents"];
const LINE_ATTRIBUTION_GAP_KEYS: readonly string[] = ["cause", "reason"];
const SYMBOL_HISTORY_OPTIONS_KEYS: readonly string[] = [
  "version", "renameThreshold", "moveThreshold", "copyThreshold",
];
const SYMBOL_HISTORY_ANCHOR_KEYS: readonly string[] = [
  "commit", "tree", "blob", "path", "symbolId", "slot", "name", "kind", "language", "bodyHash", "range",
];
const SYMBOL_CORRESPONDENCE_ITEM_KEYS: readonly string[] = [
  "before", "after", "relation", "reason", "similarity",
];
const SYMBOL_HISTORY_GAP_KEYS: readonly string[] = ["cause", "reason"];

const REF_OBSERVATION_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "observationId", "cloneId", "refName", "refKind",
  "algorithm", "target", "observedAt", "absent", "generation", "tipCommitterUnixSeconds",
];
const TRACKED_REF_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "cloneId", "refName", "refKind",
  "target", "generation", "activity", "deletedAt", "lastObservedAt",
];
const COMMIT_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "cloneId", "commit", "tree", "parents",
  "author", "committer", "subject", "message", "extractorVersion", "policyVersion",
];
const CHANGED_FILE_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "cloneId", "commit", "parentIndex", "parentCommit",
  "path", "previousPath", "status", "statusScore", "oldMode", "newMode",
  "oldBlob", "newBlob", "added", "deleted", "extractorVersion", "policyVersion",
];
const PR_OBSERVATION_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "observationId", "cloneId", "repositoryOwner", "repositoryRepo",
  "number", "state", "isDraft", "updatedAt", "headOid", "headRef", "baseOid", "baseRef",
  "mergeOid", "mergeStrategy",
];
const PR_ATTRIBUTION_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "cloneId", "repositoryOwner", "repositoryRepo",
  "prNumber", "baseOid", "headOid", "mergeBaseOids", "mergeOid",
  "mergeStrategy", "status", "reason",
];
const RETENTION_RECEIPT_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "scope", "target", "receivedAt", "backupRef",
];
const BRANCH_COMPARISON_DIFF_CHANGE_KEYS: readonly string[] = [
  "beforePath", "afterPath", "beforeMode", "afterMode", "changeKind",
  "renameEvidence", "binary", "insertions", "deletions",
];
const BRANCH_COMPARISON_DIFF_OPTIONS_KEYS: readonly string[] = [
  "algorithm", "binaryDetection", "renameLimit", "renameThreshold",
];
const BRANCH_COMPARISON_DIFF_KEYS: readonly string[] = [
  "beforeTree", "afterTree", "parentIndex", "comparatorVersion",
  "gitVersion", "objectFormat", "options", "changes",
];
const BRANCH_COMPARISON_PARENT_KEYS: readonly string[] = [
  "parentIndex", "parent", "target", "state", "reason", "diff",
];
const BRANCH_COMPARISON_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "cloneId", "comparisonKind", "state", "baseTip", "branchTip",
  "mergeBases", "baseSource", "comparatorVersion", "gitVersion", "policyVersion",
  "perParent", "diffs",
];
const CODE_RELATION_ENDPOINT_KEYS: readonly string[] = [
  "symbolId", "slot", "path", "tree", "commit",
];
const CODE_SYMBOL_FACT_KEYS: readonly string[] = [
  "symbolId", "slot", "name", "kind", "bodyHash", "contentHash", "path", "tree",
];
const CODE_RELATION_ITEM_KEYS: readonly string[] = [
  "relationId", "role", "source", "target", "external", "extractorVersion", "resolverVersion",
];
const CODE_UNRESOLVED_FACT_KEYS: readonly string[] = [
  "unresolvedKind", "name", "fromSymbolId", "reason",
];
const CODE_ANALYSIS_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "cloneId", "worktreeId", "snapshotId", "tree", "blob",
  "path", "language", "dialect", "state", "topologyHash", "contentHash",
  "configHash", "dependencyHash", "grammarVersion", "grammarDigest", "grammarId",
  "extractorVersion", "resolverVersion", "policyVersion",
  "symbols", "relations", "unresolved",
];
const CODE_RELATION_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "cloneId", "relationId", "role", "source", "target",
  "external", "extractorVersion", "resolverVersion", "policyVersion",
];
const LINE_ATTRIBUTION_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "cloneId", "target", "path", "ranges", "policyVersion",
  "options", "calculationVersion", "gitVersion", "retainedRoot", "state",
  "origins", "parentEvidence", "gaps",
];
const SYMBOL_CORRESPONDENCE_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "cloneId", "before", "after", "policyVersion", "options",
  "calculationVersion", "extractorVersion", "state", "correspondences",
  "parentEvidence", "gaps",
];
const COVERAGE_FACT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "axis", "state", "reason", "checkedAt",
  "language", "cause", "pendingCount", "pendingFrontier", "boundary", "missing", "lastSuccessAt",
];
const PROGRESS_HISTORY_CHECKPOINT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "progressKind", "cloneId", "commit", "tree", "parents",
  "extractorVersion", "policyVersion",
];
const PROGRESS_RETAINED_ROOT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "progressKind", "cloneId", "root", "firstSeenAt", "firstSignal", "refName",
];
const PROGRESS_PR_CURSOR_KEYS: readonly string[] = [
  "kind", "schemaVersion", "progressKind", "cloneId", "cursor",
];
const PROGRESS_PR_OBJECT_JOB_KEYS: readonly string[] = [
  "kind", "schemaVersion", "progressKind", "cloneId", "job",
];
const PROGRESS_RECONCILE_CHECKPOINT_KEYS: readonly string[] = [
  "kind", "schemaVersion", "progressKind", "cloneId", "worktreeId",
  "checkpointId", "pendingCount", "frontier", "complete", "recordedAt",
];

function validateHistoryIdentity(value: unknown, path: string, allowRawBytes: boolean): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: [`${path} must be an object`] };
  const errors: string[] = [];
  rejectUnknownKeys(value, allowRawBytes ? LINE_AUTHOR_IDENTITY_KEYS : HISTORY_IDENTITY_KEYS, path, errors);
  if (!isSafeText(value.name)) errors.push(`${path}.name must be a string without NUL`);
  if (!isSafeText(value.email)) errors.push(`${path}.email must be a string without NUL`);
  if (!isSafeInt(value.unixSeconds)) errors.push(`${path}.unixSeconds must be a safe integer`);
  if (!isSafeInt(value.offsetMinutes) || value.offsetMinutes < -1439 || value.offsetMinutes > 1439) {
    errors.push(`${path}.offsetMinutes must be a safe integer in [-1439, 1439]`);
  }
  if (allowRawBytes) {
    if (value.nameBytes !== undefined && (!(value.nameBytes instanceof Uint8Array) || value.nameBytes.length === 0)) {
      errors.push(`${path}.nameBytes, when present, must be a non-empty Uint8Array`);
    }
    if (value.emailBytes !== undefined && (!(value.emailBytes instanceof Uint8Array) || value.emailBytes.length === 0)) {
      errors.push(`${path}.emailBytes, when present, must be a non-empty Uint8Array`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateLineRange(value: unknown, path: string): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: [`${path} must be an object`] };
  const errors: string[] = [];
  rejectUnknownKeys(value, LINE_RANGE_KEYS, path, errors);
  if (!isPositiveInteger(value.start)) errors.push(`${path}.start must be a positive safe integer`);
  if (!isPositiveInteger(value.end)) errors.push(`${path}.end must be a positive safe integer`);
  if (isPositiveInteger(value.start) && isPositiveInteger(value.end) && value.end < value.start) {
    errors.push(`${path}.end must be >= ${path}.start`);
  }
  return { ok: errors.length === 0, errors };
}

function validateLineParentEvidence(value: unknown, path: string, expectedAlgorithm?: OidAlgorithm): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: [`${path} must be an object`] };
  const errors: string[] = [];
  rejectUnknownKeys(value, LINE_PARENT_EVIDENCE_KEYS, path, errors);
  const commit = validateQualifiedOid(value.commit);
  if (!commit.ok) errors.push(...commit.errors.map((e) => `${path}.commit: ${e}`));
  const alg = commit.ok ? (value.commit as QualifiedOid).algorithm : expectedAlgorithm;
  if (commit.ok && expectedAlgorithm !== undefined && (value.commit as QualifiedOid).algorithm !== expectedAlgorithm) {
    errors.push(`${path}.commit.algorithm must match ${expectedAlgorithm}`);
  }
  if (!Array.isArray(value.parents)) {
    errors.push(`${path}.parents must be an array`);
  } else {
    value.parents.forEach((parent: unknown, idx: number) => {
      const checked = validateQualifiedOid(parent);
      if (!checked.ok) errors.push(...checked.errors.map((e) => `${path}.parents[${idx}]: ${e}`));
      else if (alg !== undefined && (parent as QualifiedOid).algorithm !== alg) {
        errors.push(`${path}.parents[${idx}].algorithm must match ${alg}`);
      }
    });
  }
  return { ok: errors.length === 0, errors };
}

function validateCodeRelationEndpoint(value: unknown, path: string): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: [`${path} must be an object`] };
  const errors: string[] = [];
  rejectUnknownKeys(value, CODE_RELATION_ENDPOINT_KEYS, path, errors);
  if (!isNonEmptySafeText(value.symbolId)) errors.push(`${path}.symbolId must be a non-empty string without NUL`);
  if (!isNonEmptySafeText(value.slot)) errors.push(`${path}.slot must be a non-empty string without NUL`);
  if (!isNonEmptySafePathBytes(value.path)) errors.push(`${path}.path must be non-empty NUL-free raw path bytes`);
  if (value.tree !== null) {
    const tree = validateQualifiedOid(value.tree);
    if (!tree.ok) errors.push(...tree.errors.map((e) => `${path}.tree: ${e}`));
  }
  if (value.commit !== undefined && value.commit !== null) {
    const commit = validateQualifiedOid(value.commit);
    if (!commit.ok) errors.push(...commit.errors.map((e) => `${path}.commit: ${e}`));
    if (commit.ok && value.tree !== null && validateQualifiedOid(value.tree).ok &&
      (value.commit as QualifiedOid).algorithm !== (value.tree as QualifiedOid).algorithm) {
      errors.push(`${path}.commit.algorithm must match ${path}.tree.algorithm`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateRefObservationFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["ref-observation fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, REF_OBSERVATION_FACT_KEYS, "ref-observation fact", errors);
  if (value.kind !== "ref-observation") errors.push('ref-observation fact.kind must be "ref-observation"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`ref-observation fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isStrictScopeId(value.observationId)) errors.push("ref-observation fact.observationId must be a strict opaque identifier");
  if (!isStrictScopeId(value.cloneId)) errors.push("ref-observation fact.cloneId must be a strict opaque identifier");
  if (!isNonEmptySafeText(value.refName) || !value.refName.startsWith("refs/")) {
    errors.push('ref-observation fact.refName must be a non-empty full ref name starting with "refs/" without NUL');
  }
  if (!isInList(value.refKind, REF_KINDS)) errors.push(`ref-observation fact.refKind must be one of ${REF_KINDS.join(", ")}`);
  if (value.algorithm !== "sha1" && value.algorithm !== "sha256") {
    errors.push('ref-observation fact.algorithm must be "sha1" or "sha256"');
  }
  if (typeof value.absent !== "boolean") {
    errors.push("ref-observation fact.absent must be a boolean");
  } else if (value.absent) {
    if (value.target !== null) errors.push("ref-observation fact.target must be null when absent is true");
  } else {
    const target = validateQualifiedOid(value.target);
    if (!target.ok) errors.push(...target.errors.map((e) => `ref-observation fact.target: ${e}`));
    else if ((value.algorithm === "sha1" || value.algorithm === "sha256") &&
      (value.target as QualifiedOid).algorithm !== value.algorithm) {
      errors.push(`ref-observation fact.target.algorithm must match ${value.algorithm}`);
    }
  }
  if (!isPositiveInteger(value.observedAt)) errors.push("ref-observation fact.observedAt must be a positive safe integer");
  if (value.absent === true) {
    if (!isNonNegativeSafeInt(value.generation)) {
      errors.push("ref-observation fact.generation must be a non-negative safe integer when absent is true");
    }
  } else if (!isPositiveInteger(value.generation)) {
    errors.push("ref-observation fact.generation must be a positive safe integer");
  }
  if (value.tipCommitterUnixSeconds !== undefined && !isSafeInt(value.tipCommitterUnixSeconds)) {
    errors.push("ref-observation fact.tipCommitterUnixSeconds, when present, must be a safe integer");
  }
  return { ok: errors.length === 0, errors };
}

export function validateTrackedRefFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["ref-state fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, TRACKED_REF_FACT_KEYS, "ref-state fact", errors);
  if (value.kind !== "ref-state") errors.push('ref-state fact.kind must be "ref-state"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`ref-state fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isStrictScopeId(value.cloneId)) errors.push("ref-state fact.cloneId must be a strict opaque identifier");
  if (!isNonEmptySafeText(value.refName) || !value.refName.startsWith("refs/")) {
    errors.push('ref-state fact.refName must be a non-empty full ref name starting with "refs/" without NUL');
  }
  if (!isInList(value.refKind, REF_KINDS)) errors.push(`ref-state fact.refKind must be one of ${REF_KINDS.join(", ")}`);
  if (value.target !== null) {
    const target = validateQualifiedOid(value.target);
    if (!target.ok) errors.push(...target.errors.map((e) => `ref-state fact.target: ${e}`));
  }
  if (!isNonNegativeSafeInt(value.generation)) errors.push("ref-state fact.generation must be a non-negative safe integer");
  if (value.activity !== null) {
    if (!isRecord(value.activity)) {
      errors.push("ref-state fact.activity must be an object or null");
    } else {
      rejectUnknownKeys(value.activity, REF_ACTIVITY_KEYS, "ref-state fact.activity", errors);
      if (!isSafeInt(value.activity.activityAt)) errors.push("ref-state fact.activity.activityAt must be a safe integer");
      if (!isInList(value.activity.signal, ACTIVITY_SIGNAL_KINDS)) {
        errors.push(`ref-state fact.activity.signal must be one of ${ACTIVITY_SIGNAL_KINDS.join(", ")}`);
      }
    }
  }
  if (value.deletedAt !== null && !isPositiveInteger(value.deletedAt)) {
    errors.push("ref-state fact.deletedAt must be null or a positive safe integer");
  }
  if (value.deletedAt !== null && value.target !== null) {
    errors.push("ref-state fact.target must be null when deletedAt is non-null");
  }
  if (!isNonNegativeSafeInt(value.lastObservedAt)) {
    errors.push("ref-state fact.lastObservedAt must be a non-negative safe integer");
  }
  return { ok: errors.length === 0, errors };
}

export function validateCommitFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["commit fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, COMMIT_FACT_KEYS, "commit fact", errors);
  if (value.kind !== "commit") errors.push('commit fact.kind must be "commit"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`commit fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isStrictScopeId(value.cloneId)) errors.push("commit fact.cloneId must be a strict opaque identifier");
  const commit = validateQualifiedOid(value.commit);
  if (!commit.ok) errors.push(...commit.errors.map((e) => `commit fact.commit: ${e}`));
  const alg = commit.ok ? (value.commit as QualifiedOid).algorithm : undefined;
  const tree = validateQualifiedOid(value.tree);
  if (!tree.ok) errors.push(...tree.errors.map((e) => `commit fact.tree: ${e}`));
  else if (alg !== undefined && (value.tree as QualifiedOid).algorithm !== alg) {
    errors.push(`commit fact.tree.algorithm must match ${alg}`);
  }
  if (!Array.isArray(value.parents)) {
    errors.push("commit fact.parents must be an array");
  } else {
    value.parents.forEach((parent: unknown, idx: number) => {
      const checked = validateQualifiedOid(parent);
      if (!checked.ok) errors.push(...checked.errors.map((e) => `commit fact.parents[${idx}]: ${e}`));
      else if (alg !== undefined && (parent as QualifiedOid).algorithm !== alg) {
        errors.push(`commit fact.parents[${idx}].algorithm must match ${alg}`);
      }
    });
  }
  const author = validateHistoryIdentity(value.author, "commit fact.author", false);
  if (!author.ok) errors.push(...author.errors);
  const committer = validateHistoryIdentity(value.committer, "commit fact.committer", false);
  if (!committer.ok) errors.push(...committer.errors);
  if (!isSafeText(value.subject)) errors.push("commit fact.subject must be a string without NUL");
  if (!(value.message instanceof Uint8Array)) errors.push("commit fact.message must be a Uint8Array");
  if (!isVersionString(value.extractorVersion)) errors.push("commit fact.extractorVersion must be a non-empty version string");
  if (value.policyVersion !== POLICY_VERSION) errors.push(`commit fact.policyVersion must be "${POLICY_VERSION}"`);
  return { ok: errors.length === 0, errors };
}

export function validateChangedFileFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["changed-file fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, CHANGED_FILE_FACT_KEYS, "changed-file fact", errors);
  if (value.kind !== "changed-file") errors.push('changed-file fact.kind must be "changed-file"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`changed-file fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isStrictScopeId(value.cloneId)) errors.push("changed-file fact.cloneId must be a strict opaque identifier");
  const commit = validateQualifiedOid(value.commit);
  if (!commit.ok) errors.push(...commit.errors.map((e) => `changed-file fact.commit: ${e}`));
  const alg = commit.ok ? (value.commit as QualifiedOid).algorithm : undefined;
  if (!isSafeInt(value.parentIndex) || value.parentIndex < -1) {
    errors.push("changed-file fact.parentIndex must be a safe integer >= -1");
  } else if (value.parentIndex === -1) {
    if (value.parentCommit !== null) errors.push("changed-file fact.parentCommit must be null when parentIndex is -1");
  } else {
    const parent = validateQualifiedOid(value.parentCommit);
    if (!parent.ok) errors.push(...parent.errors.map((e) => `changed-file fact.parentCommit: ${e}`));
    else if (alg !== undefined && (value.parentCommit as QualifiedOid).algorithm !== alg) {
      errors.push(`changed-file fact.parentCommit.algorithm must match ${alg}`);
    }
  }
  if (!isNonEmptySafePathBytes(value.path)) errors.push("changed-file fact.path must be non-empty NUL-free raw path bytes");
  if (value.previousPath !== null && !isNonEmptySafePathBytes(value.previousPath)) {
    errors.push("changed-file fact.previousPath must be null or non-empty NUL-free raw path bytes");
  }
  if (!isInList(value.status, GIT_FILE_CHANGE_STATUSES)) {
    errors.push(`changed-file fact.status must be one of ${GIT_FILE_CHANGE_STATUSES.join(", ")}`);
  }
  if (value.statusScore !== null && (!isSafeInt(value.statusScore) || value.statusScore < 0 || value.statusScore > 100)) {
    errors.push("changed-file fact.statusScore must be null or an integer in [0, 100]");
  }
  if (!isOctalMode6(value.oldMode)) errors.push("changed-file fact.oldMode must be a six-digit octal file mode");
  if (!isOctalMode6(value.newMode)) errors.push("changed-file fact.newMode must be a six-digit octal file mode");
  for (const field of ["oldBlob", "newBlob"] as const) {
    const blob = value[field];
    if (blob !== null) {
      const checked = validateQualifiedOid(blob);
      if (!checked.ok) errors.push(...checked.errors.map((e) => `changed-file fact.${field}: ${e}`));
      else if (alg !== undefined && (blob as QualifiedOid).algorithm !== alg) {
        errors.push(`changed-file fact.${field}.algorithm must match ${alg}`);
      }
    }
  }
  if (value.added !== null && !isNonNegativeSafeInt(value.added)) {
    errors.push("changed-file fact.added must be null or a non-negative safe integer");
  }
  if (value.deleted !== null && !isNonNegativeSafeInt(value.deleted)) {
    errors.push("changed-file fact.deleted must be null or a non-negative safe integer");
  }
  if (!isVersionString(value.extractorVersion)) errors.push("changed-file fact.extractorVersion must be a non-empty version string");
  if (value.policyVersion !== POLICY_VERSION) errors.push(`changed-file fact.policyVersion must be "${POLICY_VERSION}"`);
  return { ok: errors.length === 0, errors };
}

export function validatePullRequestObservationFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["pr-observation fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, PR_OBSERVATION_FACT_KEYS, "pr-observation fact", errors);
  for (const forbidden of PR_FACT_FORBIDDEN_KEYS) {
    if (forbidden in value) errors.push("pr-observation fact must never carry credential keys");
  }
  if (value.kind !== "pr-observation") errors.push('pr-observation fact.kind must be "pr-observation"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`pr-observation fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isStrictScopeId(value.observationId)) errors.push("pr-observation fact.observationId must be a strict opaque identifier");
  if (!isStrictScopeId(value.cloneId)) errors.push("pr-observation fact.cloneId must be a strict opaque identifier");
  if (!isNonEmptySafeText(value.repositoryOwner)) errors.push("pr-observation fact.repositoryOwner must be a non-empty string without NUL");
  if (!isNonEmptySafeText(value.repositoryRepo)) errors.push("pr-observation fact.repositoryRepo must be a non-empty string without NUL");
  if (!isPositiveInteger(value.number)) errors.push("pr-observation fact.number must be a positive safe integer");
  if (!isPullRequestState(value.state)) errors.push(`pr-observation fact.state must be one of ${PULL_REQUEST_STATES.join(", ")}`);
  if (typeof value.isDraft !== "boolean") errors.push("pr-observation fact.isDraft must be a boolean");
  if (!isPositiveInteger(value.updatedAt)) errors.push("pr-observation fact.updatedAt must be a positive safe integer");
  const head = validateQualifiedOid(value.headOid);
  if (!head.ok) errors.push(...head.errors.map((e) => `pr-observation fact.headOid: ${e}`));
  if (!isNonEmptySafeText(value.headRef)) errors.push("pr-observation fact.headRef must be a non-empty string without NUL");
  const base = validateQualifiedOid(value.baseOid);
  if (!base.ok) errors.push(...base.errors.map((e) => `pr-observation fact.baseOid: ${e}`));
  if (!isNonEmptySafeText(value.baseRef)) errors.push("pr-observation fact.baseRef must be a non-empty string without NUL");
  if (value.mergeOid !== undefined && value.mergeOid !== null) {
    const merge = validateQualifiedOid(value.mergeOid);
    if (!merge.ok) errors.push(...merge.errors.map((e) => `pr-observation fact.mergeOid: ${e}`));
  }
  if (value.mergeStrategy !== undefined && !isPullRequestMergeStrategy(value.mergeStrategy)) {
    errors.push(`pr-observation fact.mergeStrategy, when present, must be one of ${PULL_REQUEST_MERGE_STRATEGIES.join(", ")}`);
  }
  return { ok: errors.length === 0, errors };
}

export function validatePrAttributionFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["pr-attribution fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, PR_ATTRIBUTION_FACT_KEYS, "pr-attribution fact", errors);
  if (value.kind !== "pr-attribution") errors.push('pr-attribution fact.kind must be "pr-attribution"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`pr-attribution fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isStrictScopeId(value.cloneId)) errors.push("pr-attribution fact.cloneId must be a strict opaque identifier");
  if (!isNonEmptySafeText(value.repositoryOwner)) errors.push("pr-attribution fact.repositoryOwner must be a non-empty string without NUL");
  if (!isNonEmptySafeText(value.repositoryRepo)) errors.push("pr-attribution fact.repositoryRepo must be a non-empty string without NUL");
  if (!isPositiveInteger(value.prNumber)) errors.push("pr-attribution fact.prNumber must be a positive safe integer");
  if (value.baseOid === null) {
    if (value.status === "complete") {
      errors.push('pr-attribution fact with baseOid null must stay "partial"');
    }
  } else {
    const base = validateQualifiedOid(value.baseOid);
    if (!base.ok) errors.push(...base.errors.map((e) => `pr-attribution fact.baseOid: ${e}`));
  }
  const head = validateQualifiedOid(value.headOid);
  if (!head.ok) errors.push(...head.errors.map((e) => `pr-attribution fact.headOid: ${e}`));
  if (!Array.isArray(value.mergeBaseOids)) {
    errors.push("pr-attribution fact.mergeBaseOids must be an array");
  } else {
    value.mergeBaseOids.forEach((oid: unknown, idx: number) => {
      const checked = validateQualifiedOid(oid);
      if (!checked.ok) errors.push(...checked.errors.map((e) => `pr-attribution fact.mergeBaseOids[${idx}]: ${e}`));
    });
    if (value.status === "complete" && value.mergeBaseOids.length === 0) {
      errors.push('pr-attribution fact with status "complete" requires at least one mergeBaseOid');
    }
  }
  if (value.mergeOid !== undefined && value.mergeOid !== null) {
    const merge = validateQualifiedOid(value.mergeOid);
    if (!merge.ok) errors.push(...merge.errors.map((e) => `pr-attribution fact.mergeOid: ${e}`));
  }
  if (!isPullRequestMergeStrategy(value.mergeStrategy)) {
    errors.push(`pr-attribution fact.mergeStrategy must be one of ${PULL_REQUEST_MERGE_STRATEGIES.join(", ")}`);
  }
  if (value.status !== "complete" && value.status !== "partial") {
    errors.push('pr-attribution fact.status must be "complete" or "partial"');
  }
  if (!isNonEmptySafeText(value.reason)) errors.push("pr-attribution fact.reason must be a non-empty string without NUL");
  return { ok: errors.length === 0, errors };
}

export function validateRetentionReceiptFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["retention-receipt fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, RETENTION_RECEIPT_FACT_KEYS, "retention-receipt fact", errors);
  if (value.kind !== "retention-receipt") errors.push('retention-receipt fact.kind must be "retention-receipt"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`retention-receipt fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  const scope = validateLiveScope(value.scope);
  if (!scope.ok) errors.push(...scope.errors.map((e) => `retention-receipt fact.scope: ${e}`));
  else if ((value.scope as LiveScope).worktree !== undefined) {
    errors.push("retention-receipt fact.scope must be clone-scoped: worktree must be absent");
  }
  const target = validateQualifiedOid(value.target);
  if (!target.ok) errors.push(...target.errors.map((e) => `retention-receipt fact.target: ${e}`));
  if (!isPositiveInteger(value.receivedAt)) errors.push("retention-receipt fact.receivedAt must be a positive safe integer");
  if (!isNonEmptySafeText(value.backupRef)) errors.push("retention-receipt fact.backupRef must be a non-empty string without NUL");
  return { ok: errors.length === 0, errors };
}

function validateBranchComparisonDiffChange(value: unknown, path: string): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: [`${path} must be an object`] };
  const errors: string[] = [];
  rejectUnknownKeys(value, BRANCH_COMPARISON_DIFF_CHANGE_KEYS, path, errors);
  if (value.beforePath !== null && !isNonEmptySafePathBytes(value.beforePath)) {
    errors.push(`${path}.beforePath must be null or non-empty NUL-free raw path bytes`);
  }
  if (value.afterPath !== null && !isNonEmptySafePathBytes(value.afterPath)) {
    errors.push(`${path}.afterPath must be null or non-empty NUL-free raw path bytes`);
  }
  if (value.beforePath === null && value.afterPath === null) {
    errors.push(`${path} must carry at least one of beforePath or afterPath`);
  }
  if (value.beforeMode !== null && !isTreeOctalMode(value.beforeMode)) {
    errors.push(`${path}.beforeMode must be null or an octal file mode`);
  }
  if (value.afterMode !== null && !isTreeOctalMode(value.afterMode)) {
    errors.push(`${path}.afterMode must be null or an octal file mode`);
  }
  if (!isInList(value.changeKind, DIFF_CHANGE_KINDS)) {
    errors.push(`${path}.changeKind must be one of ${DIFF_CHANGE_KINDS.join(", ")}`);
  }
  if (value.renameEvidence !== null && !isNonEmptySafeText(value.renameEvidence)) {
    errors.push(`${path}.renameEvidence must be null or a non-empty string without NUL`);
  }
  if (typeof value.binary !== "boolean") errors.push(`${path}.binary must be a boolean`);
  if (!isNonNegativeSafeInt(value.insertions)) errors.push(`${path}.insertions must be a non-negative safe integer`);
  if (!isNonNegativeSafeInt(value.deletions)) errors.push(`${path}.deletions must be a non-negative safe integer`);
  return { ok: errors.length === 0, errors };
}

function validateBranchComparisonDiff(value: unknown, path: string, expectedAlg?: OidAlgorithm): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: [`${path} must be an object`] };
  const errors: string[] = [];
  rejectUnknownKeys(value, BRANCH_COMPARISON_DIFF_KEYS, path, errors);
  const before = validateQualifiedOid(value.beforeTree);
  if (!before.ok) errors.push(...before.errors.map((e) => `${path}.beforeTree: ${e}`));
  const after = validateQualifiedOid(value.afterTree);
  if (!after.ok) errors.push(...after.errors.map((e) => `${path}.afterTree: ${e}`));
  if (value.objectFormat !== "sha1" && value.objectFormat !== "sha256") {
    errors.push(`${path}.objectFormat must be "sha1" or "sha256"`);
  }
  const alg = expectedAlg ?? (value.objectFormat === "sha1" || value.objectFormat === "sha256" ? value.objectFormat : undefined);
  if (alg !== undefined) {
    if (before.ok && (value.beforeTree as QualifiedOid).algorithm !== alg) errors.push(`${path}.beforeTree.algorithm must match ${alg}`);
    if (after.ok && (value.afterTree as QualifiedOid).algorithm !== alg) errors.push(`${path}.afterTree.algorithm must match ${alg}`);
    if ((value.objectFormat === "sha1" || value.objectFormat === "sha256") && value.objectFormat !== alg) {
      errors.push(`${path}.objectFormat must match ${alg}`);
    }
  }
  if (value.parentIndex !== null && (!isSafeInt(value.parentIndex) || value.parentIndex < -1)) {
    errors.push(`${path}.parentIndex must be null or a safe integer >= -1`);
  }
  if (!isVersionString(value.comparatorVersion)) errors.push(`${path}.comparatorVersion must be a non-empty version string`);
  if (!isVersionString(value.gitVersion)) errors.push(`${path}.gitVersion must be a non-empty version string`);
  if (!isRecord(value.options)) {
    errors.push(`${path}.options must be an object`);
  } else {
    rejectUnknownKeys(value.options, BRANCH_COMPARISON_DIFF_OPTIONS_KEYS, `${path}.options`, errors);
    if (!isInList(value.options.algorithm, BRANCH_DIFF_ALGORITHMS)) {
      errors.push(`${path}.options.algorithm must be one of ${BRANCH_DIFF_ALGORITHMS.join(", ")}`);
    }
    if (typeof value.options.binaryDetection !== "boolean") {
      errors.push(`${path}.options.binaryDetection must be a boolean`);
    }
    if (!isNonNegativeSafeInt(value.options.renameLimit)) {
      errors.push(`${path}.options.renameLimit must be a non-negative safe integer`);
    }
    if (!isNonNegativeSafeInt(value.options.renameThreshold) || value.options.renameThreshold > 100) {
      errors.push(`${path}.options.renameThreshold must be a safe integer in [0, 100]`);
    }
  }
  if (!Array.isArray(value.changes)) {
    errors.push(`${path}.changes must be an array`);
  } else {
    value.changes.forEach((change: unknown, idx: number) => {
      const checked = validateBranchComparisonDiffChange(change, `${path}.changes[${idx}]`);
      if (!checked.ok) errors.push(...checked.errors);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function validateBranchComparisonFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["branch-comparison fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, BRANCH_COMPARISON_FACT_KEYS, "branch-comparison fact", errors);
  if (value.kind !== "branch-comparison") errors.push('branch-comparison fact.kind must be "branch-comparison"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`branch-comparison fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isStrictScopeId(value.cloneId)) errors.push("branch-comparison fact.cloneId must be a strict opaque identifier");
  if (!isInList(value.comparisonKind, COMPARISON_KINDS)) {
    errors.push(`branch-comparison fact.comparisonKind must be one of ${COMPARISON_KINDS.join(", ")}`);
  }
  if (!isInList(value.state, COMPARISON_STATES)) {
    errors.push(`branch-comparison fact.state must be one of ${COMPARISON_STATES.join(", ")}`);
  }
  const baseTip = validateQualifiedOid(value.baseTip);
  if (!baseTip.ok) errors.push(...baseTip.errors.map((e) => `branch-comparison fact.baseTip: ${e}`));
  const alg = baseTip.ok ? (value.baseTip as QualifiedOid).algorithm : undefined;
  const branchTip = validateQualifiedOid(value.branchTip);
  if (!branchTip.ok) errors.push(...branchTip.errors.map((e) => `branch-comparison fact.branchTip: ${e}`));
  else if (alg !== undefined && (value.branchTip as QualifiedOid).algorithm !== alg) {
    errors.push(`branch-comparison fact.branchTip.algorithm must match ${alg}`);
  }
  if (!Array.isArray(value.mergeBases)) {
    errors.push("branch-comparison fact.mergeBases must be an array");
  } else {
    value.mergeBases.forEach((mb: unknown, idx: number) => {
      const checked = validateQualifiedOid(mb);
      if (!checked.ok) errors.push(...checked.errors.map((e) => `branch-comparison fact.mergeBases[${idx}]: ${e}`));
      else if (alg !== undefined && (mb as QualifiedOid).algorithm !== alg) {
        errors.push(`branch-comparison fact.mergeBases[${idx}].algorithm must match ${alg}`);
      }
    });
  }
  if (value.baseSource !== null && !isInList(value.baseSource, COMPARISON_BASE_SOURCES)) {
    errors.push(`branch-comparison fact.baseSource must be null or one of ${COMPARISON_BASE_SOURCES.join(", ")}`);
  }
  if (!isVersionString(value.comparatorVersion)) errors.push("branch-comparison fact.comparatorVersion must be a non-empty version string");
  if (value.gitVersion !== null && !isVersionString(value.gitVersion)) {
    errors.push("branch-comparison fact.gitVersion must be null or a non-empty version string");
  }
  if (value.policyVersion !== POLICY_VERSION) errors.push(`branch-comparison fact.policyVersion must be "${POLICY_VERSION}"`);
  if (!Array.isArray(value.perParent)) {
    errors.push("branch-comparison fact.perParent must be an array");
  } else {
    value.perParent.forEach((entry: unknown, idx: number) => {
      const path = `branch-comparison fact.perParent[${idx}]`;
      if (!isRecord(entry)) {
        errors.push(`${path} must be an object`);
        return;
      }
      rejectUnknownKeys(entry, BRANCH_COMPARISON_PARENT_KEYS, path, errors);
      if (!isNonNegativeSafeInt(entry.parentIndex)) errors.push(`${path}.parentIndex must be a non-negative safe integer`);
      const parent = validateQualifiedOid(entry.parent);
      if (!parent.ok) errors.push(...parent.errors.map((e) => `${path}.parent: ${e}`));
      else if (alg !== undefined && (entry.parent as QualifiedOid).algorithm !== alg) {
        errors.push(`${path}.parent.algorithm must match ${alg}`);
      }
      if (entry.target !== null) {
        const target = validateQualifiedOid(entry.target);
        if (!target.ok) errors.push(...target.errors.map((e) => `${path}.target: ${e}`));
        else if (alg !== undefined && (entry.target as QualifiedOid).algorithm !== alg) {
          errors.push(`${path}.target.algorithm must match ${alg}`);
        }
      }
      if (entry.state !== "complete" && entry.state !== "unknown") errors.push(`${path}.state must be "complete" or "unknown"`);
      if (!isNonEmptySafeText(entry.reason)) errors.push(`${path}.reason must be a non-empty string without NUL`);
      if (entry.diff !== null) {
        const diff = validateBranchComparisonDiff(entry.diff, `${path}.diff`, alg);
        if (!diff.ok) errors.push(...diff.errors);
      }
    });
  }
  if (!Array.isArray(value.diffs)) {
    errors.push("branch-comparison fact.diffs must be an array");
  } else {
    value.diffs.forEach((entry: unknown, idx: number) => {
      const diff = validateBranchComparisonDiff(entry, `branch-comparison fact.diffs[${idx}]`, alg);
      if (!diff.ok) errors.push(...diff.errors);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function validateCodeRelationFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["code-relation fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, CODE_RELATION_FACT_KEYS, "code-relation fact", errors);
  if (value.kind !== "code-relation") errors.push('code-relation fact.kind must be "code-relation"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`code-relation fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isStrictScopeId(value.cloneId)) errors.push("code-relation fact.cloneId must be a strict opaque identifier");
  if (!isNonEmptySafeText(value.relationId)) errors.push("code-relation fact.relationId must be a non-empty string without NUL");
  if (!isInList(value.role, CODE_RELATION_ROLES)) {
    errors.push(`code-relation fact.role must be one of ${CODE_RELATION_ROLES.join(", ")}`);
  }
  const source = validateCodeRelationEndpoint(value.source, "code-relation fact.source");
  if (!source.ok) errors.push(...source.errors);
  const target = validateCodeRelationEndpoint(value.target, "code-relation fact.target");
  if (!target.ok) errors.push(...target.errors);
  if (typeof value.external !== "boolean") errors.push("code-relation fact.external must be a boolean");
  if (!isVersionString(value.extractorVersion)) errors.push("code-relation fact.extractorVersion must be a non-empty version string");
  if (!isVersionString(value.resolverVersion)) errors.push("code-relation fact.resolverVersion must be a non-empty version string");
  if (!isBatchPolicyVersion(value.policyVersion)) {
    errors.push(`code-relation fact.policyVersion must be one of ${BATCH_POLICY_VERSIONS.join(", ")}`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateCodeAnalysisFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["code-analysis fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, CODE_ANALYSIS_FACT_KEYS, "code-analysis fact", errors);
  if (value.kind !== "code-analysis") errors.push('code-analysis fact.kind must be "code-analysis"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`code-analysis fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isStrictScopeId(value.cloneId)) errors.push("code-analysis fact.cloneId must be a strict opaque identifier");
  if (value.worktreeId !== null && !isStrictScopeId(value.worktreeId)) {
    errors.push("code-analysis fact.worktreeId must be null or a strict opaque identifier");
  }
  if (value.snapshotId !== null && !isStrictSnapshotId(value.snapshotId)) {
    errors.push("code-analysis fact.snapshotId must be null or a strict lsnap hex snapshot id");
  }
  let alg: OidAlgorithm | undefined;
  if (value.tree !== null) {
    const tree = validateQualifiedOid(value.tree);
    if (!tree.ok) errors.push(...tree.errors.map((e) => `code-analysis fact.tree: ${e}`));
    else alg = (value.tree as QualifiedOid).algorithm;
  }
  if (value.blob !== null) {
    const blob = validateQualifiedOid(value.blob);
    if (!blob.ok) errors.push(...blob.errors.map((e) => `code-analysis fact.blob: ${e}`));
    else if (alg !== undefined && (value.blob as QualifiedOid).algorithm !== alg) {
      errors.push(`code-analysis fact.blob.algorithm must match ${alg}`);
    }
  }
  if (!isNonEmptySafePathBytes(value.path)) errors.push("code-analysis fact.path must be non-empty NUL-free raw path bytes");
  if (!isNonEmptySafeText(value.language)) errors.push("code-analysis fact.language must be a non-empty string without NUL");
  if (!isNonEmptySafeText(value.dialect)) errors.push("code-analysis fact.dialect must be a non-empty string without NUL");
  if (!isInList(value.state, CODE_ANALYSIS_STATES)) {
    errors.push(`code-analysis fact.state must be one of ${CODE_ANALYSIS_STATES.join(", ")}`);
  }
  if (value.state !== "unavailable" && value.tree === null && value.snapshotId === null) {
    errors.push('code-analysis fact requires tree or snapshotId when state is not "unavailable"');
  }
  if (value.state === "unavailable") {
    if (value.topologyHash !== "" && !isHex64String(value.topologyHash)) {
      errors.push("code-analysis fact.topologyHash must be empty or a 64 character lowercase hex digest when unavailable");
    }
  } else if (!isHex64String(value.topologyHash)) {
    errors.push("code-analysis fact.topologyHash must be a 64 character lowercase hex digest");
  }
  for (const field of ["contentHash", "configHash", "dependencyHash"] as const) {
    if (!isHex64String(value[field])) errors.push(`code-analysis fact.${field} must be a 64 character lowercase hex digest`);
  }
  if (value.state === "unavailable") {
    if (value.grammarVersion !== null && !isVersionString(value.grammarVersion)) {
      errors.push("code-analysis fact.grammarVersion must be null or a non-empty version string when unavailable");
    }
  } else if (!isVersionString(value.grammarVersion)) {
    errors.push("code-analysis fact.grammarVersion must be a non-empty version string");
  }
  if (value.grammarDigest !== undefined && value.grammarDigest !== null && !isHex64String(value.grammarDigest)) {
    errors.push("code-analysis fact.grammarDigest, when present, must be null or a 64 character lowercase hex digest");
  }
  if (value.grammarId !== undefined && value.grammarId !== null && !isVersionString(value.grammarId)) {
    errors.push("code-analysis fact.grammarId, when present, must be null or a non-empty version string");
  }
  if (!isVersionString(value.extractorVersion)) errors.push("code-analysis fact.extractorVersion must be a non-empty version string");
  if (!isVersionString(value.resolverVersion)) errors.push("code-analysis fact.resolverVersion must be a non-empty version string");
  if (!isBatchPolicyVersion(value.policyVersion)) {
    errors.push(`code-analysis fact.policyVersion must be one of ${BATCH_POLICY_VERSIONS.join(", ")}`);
  }
  if (!Array.isArray(value.symbols)) {
    errors.push("code-analysis fact.symbols must be an array");
  } else {
    value.symbols.forEach((sym: unknown, idx: number) => {
      const path = `code-analysis fact.symbols[${idx}]`;
      if (!isRecord(sym)) {
        errors.push(`${path} must be an object`);
        return;
      }
      rejectUnknownKeys(sym, CODE_SYMBOL_FACT_KEYS, path, errors);
      if (!isNonEmptySafeText(sym.symbolId)) errors.push(`${path}.symbolId must be a non-empty string without NUL`);
      if (!isNonEmptySafeText(sym.slot)) errors.push(`${path}.slot must be a non-empty string without NUL`);
      if (!isNonEmptySafeText(sym.name)) errors.push(`${path}.name must be a non-empty string without NUL`);
      if (!isNonEmptySafeText(sym.kind)) errors.push(`${path}.kind must be a non-empty string without NUL`);
      if (!isHex64String(sym.bodyHash)) errors.push(`${path}.bodyHash must be a 64 character lowercase hex digest`);
      if (!isHex64String(sym.contentHash)) errors.push(`${path}.contentHash must be a 64 character lowercase hex digest`);
      if (!isNonEmptySafePathBytes(sym.path)) errors.push(`${path}.path must be non-empty NUL-free raw path bytes`);
      if (sym.tree !== null) {
        const tree = validateQualifiedOid(sym.tree);
        if (!tree.ok) errors.push(...tree.errors.map((e) => `${path}.tree: ${e}`));
      }
    });
  }
  if (!Array.isArray(value.relations)) {
    errors.push("code-analysis fact.relations must be an array");
  } else {
    value.relations.forEach((rel: unknown, idx: number) => {
      const path = `code-analysis fact.relations[${idx}]`;
      if (!isRecord(rel)) {
        errors.push(`${path} must be an object`);
        return;
      }
      rejectUnknownKeys(rel, CODE_RELATION_ITEM_KEYS, path, errors);
      if (!isNonEmptySafeText(rel.relationId)) errors.push(`${path}.relationId must be a non-empty string without NUL`);
      if (!isInList(rel.role, CODE_RELATION_ROLES)) errors.push(`${path}.role must be one of ${CODE_RELATION_ROLES.join(", ")}`);
      const src = validateCodeRelationEndpoint(rel.source, `${path}.source`);
      if (!src.ok) errors.push(...src.errors);
      const dst = validateCodeRelationEndpoint(rel.target, `${path}.target`);
      if (!dst.ok) errors.push(...dst.errors);
      if (typeof rel.external !== "boolean") errors.push(`${path}.external must be a boolean`);
      if (!isVersionString(rel.extractorVersion)) errors.push(`${path}.extractorVersion must be a non-empty version string`);
      if (!isVersionString(rel.resolverVersion)) errors.push(`${path}.resolverVersion must be a non-empty version string`);
    });
  }
  if (!Array.isArray(value.unresolved)) {
    errors.push("code-analysis fact.unresolved must be an array");
  } else {
    value.unresolved.forEach((item: unknown, idx: number) => {
      const path = `code-analysis fact.unresolved[${idx}]`;
      if (!isRecord(item)) {
        errors.push(`${path} must be an object`);
        return;
      }
      rejectUnknownKeys(item, CODE_UNRESOLVED_FACT_KEYS, path, errors);
      if (!isInList(item.unresolvedKind, CODE_UNRESOLVED_KINDS)) {
        errors.push(`${path}.unresolvedKind must be one of ${CODE_UNRESOLVED_KINDS.join(", ")}`);
      }
      if (!isNonEmptySafeText(item.name)) errors.push(`${path}.name must be a non-empty string without NUL`);
      if (!isNonEmptySafeText(item.fromSymbolId)) errors.push(`${path}.fromSymbolId must be a non-empty string without NUL`);
      if (!isNonEmptySafeText(item.reason)) errors.push(`${path}.reason must be a non-empty string without NUL`);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function validateLineAttributionFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["line-attribution fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, LINE_ATTRIBUTION_FACT_KEYS, "line-attribution fact", errors);
  if (value.kind !== "line-attribution") errors.push('line-attribution fact.kind must be "line-attribution"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`line-attribution fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isStrictScopeId(value.cloneId)) errors.push("line-attribution fact.cloneId must be a strict opaque identifier");
  const target = validateQualifiedOid(value.target);
  if (!target.ok) errors.push(...target.errors.map((e) => `line-attribution fact.target: ${e}`));
  const alg = target.ok ? (value.target as QualifiedOid).algorithm : undefined;
  if (!isNonEmptySafePathBytes(value.path)) errors.push("line-attribution fact.path must be non-empty NUL-free raw path bytes");
  if (!Array.isArray(value.ranges) || value.ranges.length === 0) {
    errors.push("line-attribution fact.ranges must be a non-empty array");
  } else {
    let prevEnd = 0;
    value.ranges.forEach((range: unknown, idx: number) => {
      const checked = validateLineRange(range, `line-attribution fact.ranges[${idx}]`);
      if (!checked.ok) errors.push(...checked.errors);
      else {
        const r = range as LineRangeDto;
        if (r.start <= prevEnd) errors.push(`line-attribution fact.ranges[${idx}] must be strictly ordered and disjoint`);
        prevEnd = r.end;
      }
    });
  }
  if (value.policyVersion !== POLICY_VERSION) errors.push(`line-attribution fact.policyVersion must be "${POLICY_VERSION}"`);
  if (!isRecord(value.options)) {
    errors.push("line-attribution fact.options must be an object");
  } else {
    rejectUnknownKeys(value.options, LINE_ATTRIBUTION_OPTIONS_KEYS, "line-attribution fact.options", errors);
    const o = value.options;
    if (o.version !== "native-blame-options/1") errors.push('line-attribution fact.options.version must be "native-blame-options/1"');
    if (o.algorithm !== "myers") errors.push('line-attribution fact.options.algorithm must be "myers"');
    const scoreOk = (v: unknown): boolean => v === null || (isSafeInt(v) && v >= 1 && v <= 999999);
    if (!scoreOk(o.moveMinCharacters)) errors.push("line-attribution fact.options.moveMinCharacters must be null or integer in [1, 999999]");
    if (!scoreOk(o.copyMinCharacters)) errors.push("line-attribution fact.options.copyMinCharacters must be null or integer in [1, 999999]");
    if (o.copySearch !== "modified" && o.copySearch !== "created" && o.copySearch !== "all") {
      errors.push('line-attribution fact.options.copySearch must be "modified", "created" or "all"');
    }
    if (o.copyMinCharacters !== null && o.moveMinCharacters === null) {
      errors.push("line-attribution fact.options.copyMinCharacters requires a non-null moveMinCharacters");
    }
    if (o.copyMinCharacters === null && o.copySearch !== "all") {
      errors.push('line-attribution fact.options.copySearch must be "all" when copyMinCharacters is null');
    }
  }
  if (!isVersionString(value.calculationVersion)) errors.push("line-attribution fact.calculationVersion must be a non-empty version string");
  if (value.gitVersion !== null && !isVersionString(value.gitVersion)) {
    errors.push("line-attribution fact.gitVersion must be null or a non-empty version string");
  }
  if (value.state !== "complete" && value.state !== "partial") {
    errors.push('line-attribution fact.state must be "complete" or "partial"');
  }
  if (value.retainedRoot !== null) {
    const root = validateQualifiedOid(value.retainedRoot);
    if (!root.ok) errors.push(...root.errors.map((e) => `line-attribution fact.retainedRoot: ${e}`));
    else if (alg !== undefined && (value.retainedRoot as QualifiedOid).algorithm !== alg) {
      errors.push(`line-attribution fact.retainedRoot.algorithm must match ${alg}`);
    }
    if (value.state === "partial") errors.push("line-attribution fact.retainedRoot must be null when state is partial");
  }
  if (!Array.isArray(value.origins)) {
    errors.push("line-attribution fact.origins must be an array");
  } else {
    value.origins.forEach((origin: unknown, idx: number) => {
      const path = `line-attribution fact.origins[${idx}]`;
      if (!isRecord(origin)) {
        errors.push(`${path} must be an object`);
        return;
      }
      rejectUnknownKeys(origin, LINE_ORIGIN_KEYS, path, errors);
      const commit = validateQualifiedOid(origin.commit);
      if (!commit.ok) errors.push(...commit.errors.map((e) => `${path}.commit: ${e}`));
      else if (alg !== undefined && (origin.commit as QualifiedOid).algorithm !== alg) {
        errors.push(`${path}.commit.algorithm must match ${alg}`);
      }
      const author = validateHistoryIdentity(origin.author, `${path}.author`, true);
      if (!author.ok) errors.push(...author.errors);
      if (!isNonEmptySafePathBytes(origin.path)) errors.push(`${path}.path must be non-empty NUL-free raw path bytes`);
      const origRange = validateLineRange(origin.originalRange, `${path}.originalRange`);
      if (!origRange.ok) errors.push(...origRange.errors);
      const finalRange = validateLineRange(origin.finalRange, `${path}.finalRange`);
      if (!finalRange.ok) errors.push(...finalRange.errors);
    });
  }
  if (!Array.isArray(value.parentEvidence)) {
    errors.push("line-attribution fact.parentEvidence must be an array");
  } else {
    value.parentEvidence.forEach((pe: unknown, idx: number) => {
      const checked = validateLineParentEvidence(pe, `line-attribution fact.parentEvidence[${idx}]`, alg);
      if (!checked.ok) errors.push(...checked.errors);
    });
  }
  if (!Array.isArray(value.gaps)) {
    errors.push("line-attribution fact.gaps must be an array");
  } else {
    value.gaps.forEach((gap: unknown, idx: number) => {
      const path = `line-attribution fact.gaps[${idx}]`;
      if (!isRecord(gap)) {
        errors.push(`${path} must be an object`);
        return;
      }
      rejectUnknownKeys(gap, LINE_ATTRIBUTION_GAP_KEYS, path, errors);
      if (!isInList(gap.cause, LINE_ATTRIBUTION_GAP_CAUSES)) {
        errors.push(`${path}.cause must be one of ${LINE_ATTRIBUTION_GAP_CAUSES.join(", ")}`);
      }
      if (!isNonEmptySafeText(gap.reason)) errors.push(`${path}.reason must be a non-empty string without NUL`);
    });
  }
  return { ok: errors.length === 0, errors };
}

function validateSymbolHistoryAnchor(value: unknown, path: string, expectedAlg?: OidAlgorithm): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: [`${path} must be an object`] };
  const errors: string[] = [];
  rejectUnknownKeys(value, SYMBOL_HISTORY_ANCHOR_KEYS, path, errors);
  for (const field of ["commit", "tree", "blob"] as const) {
    const checked = validateQualifiedOid(value[field]);
    if (!checked.ok) errors.push(...checked.errors.map((e) => `${path}.${field}: ${e}`));
    else if (expectedAlg !== undefined && (value[field] as QualifiedOid).algorithm !== expectedAlg) {
      errors.push(`${path}.${field}.algorithm must match ${expectedAlg}`);
    }
  }
  if (!isNonEmptySafePathBytes(value.path)) errors.push(`${path}.path must be non-empty NUL-free raw path bytes`);
  if (!isNonEmptySafeText(value.symbolId)) errors.push(`${path}.symbolId must be a non-empty string without NUL`);
  if (!isNonEmptySafeText(value.slot)) errors.push(`${path}.slot must be a non-empty string without NUL`);
  if (!isNonEmptySafeText(value.name)) errors.push(`${path}.name must be a non-empty string without NUL`);
  if (!isNonEmptySafeText(value.kind)) errors.push(`${path}.kind must be a non-empty string without NUL`);
  if (!isNonEmptySafeText(value.language)) errors.push(`${path}.language must be a non-empty string without NUL`);
  if (!isHex64String(value.bodyHash)) errors.push(`${path}.bodyHash must be a 64 character lowercase hex digest`);
  if (value.range !== null) {
    const range = validateLineRange(value.range, `${path}.range`);
    if (!range.ok) errors.push(...range.errors);
  }
  return { ok: errors.length === 0, errors };
}

export function validateSymbolCorrespondenceFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["symbol-correspondence fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, SYMBOL_CORRESPONDENCE_FACT_KEYS, "symbol-correspondence fact", errors);
  if (value.kind !== "symbol-correspondence") errors.push('symbol-correspondence fact.kind must be "symbol-correspondence"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`symbol-correspondence fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isStrictScopeId(value.cloneId)) errors.push("symbol-correspondence fact.cloneId must be a strict opaque identifier");
  const before = validateQualifiedOid(value.before);
  if (!before.ok) errors.push(...before.errors.map((e) => `symbol-correspondence fact.before: ${e}`));
  const alg = before.ok ? (value.before as QualifiedOid).algorithm : undefined;
  const after = validateQualifiedOid(value.after);
  if (!after.ok) errors.push(...after.errors.map((e) => `symbol-correspondence fact.after: ${e}`));
  else if (alg !== undefined && (value.after as QualifiedOid).algorithm !== alg) {
    errors.push(`symbol-correspondence fact.after.algorithm must match ${alg}`);
  }
  if (value.policyVersion !== POLICY_VERSION) errors.push(`symbol-correspondence fact.policyVersion must be "${POLICY_VERSION}"`);
  if (!isRecord(value.options)) {
    errors.push("symbol-correspondence fact.options must be an object");
  } else {
    rejectUnknownKeys(value.options, SYMBOL_HISTORY_OPTIONS_KEYS, "symbol-correspondence fact.options", errors);
    if (value.options.version !== "exact-l5-body/1") errors.push('symbol-correspondence fact.options.version must be "exact-l5-body/1"');
    if (value.options.renameThreshold !== 100) errors.push("symbol-correspondence fact.options.renameThreshold must be 100");
    if (value.options.moveThreshold !== 100) errors.push("symbol-correspondence fact.options.moveThreshold must be 100");
    if (value.options.copyThreshold !== 100) errors.push("symbol-correspondence fact.options.copyThreshold must be 100");
  }
  if (!isVersionString(value.calculationVersion)) errors.push("symbol-correspondence fact.calculationVersion must be a non-empty version string");
  if (!isVersionString(value.extractorVersion)) errors.push("symbol-correspondence fact.extractorVersion must be a non-empty version string");
  if (value.state !== "complete" && value.state !== "partial") {
    errors.push('symbol-correspondence fact.state must be "complete" or "partial"');
  }
  if (!Array.isArray(value.correspondences)) {
    errors.push("symbol-correspondence fact.correspondences must be an array");
  } else {
    value.correspondences.forEach((item: unknown, idx: number) => {
      const path = `symbol-correspondence fact.correspondences[${idx}]`;
      if (!isRecord(item)) {
        errors.push(`${path} must be an object`);
        return;
      }
      rejectUnknownKeys(item, SYMBOL_CORRESPONDENCE_ITEM_KEYS, path, errors);
      for (const side of ["before", "after"] as const) {
        if (!Array.isArray(item[side])) {
          errors.push(`${path}.${side} must be an array`);
        } else {
          (item[side] as unknown[]).forEach((anchor, aIdx) => {
            const checked = validateSymbolHistoryAnchor(anchor, `${path}.${side}[${aIdx}]`, alg);
            if (!checked.ok) errors.push(...checked.errors);
          });
        }
      }
      if (!isInList(item.relation, SYMBOL_CORRESPONDENCE_RELATIONS)) {
        errors.push(`${path}.relation must be one of ${SYMBOL_CORRESPONDENCE_RELATIONS.join(", ")}`);
      }
      if (!isInList(item.reason, SYMBOL_CORRESPONDENCE_REASONS)) {
        errors.push(`${path}.reason must be one of ${SYMBOL_CORRESPONDENCE_REASONS.join(", ")}`);
      }
      if (item.similarity !== 100 && item.similarity !== null) {
        errors.push(`${path}.similarity must be 100 or null`);
      }
    });
  }
  if (!Array.isArray(value.parentEvidence)) {
    errors.push("symbol-correspondence fact.parentEvidence must be an array");
  } else {
    value.parentEvidence.forEach((pe: unknown, idx: number) => {
      const checked = validateLineParentEvidence(pe, `symbol-correspondence fact.parentEvidence[${idx}]`, alg);
      if (!checked.ok) errors.push(...checked.errors);
    });
  }
  if (!Array.isArray(value.gaps)) {
    errors.push("symbol-correspondence fact.gaps must be an array");
  } else {
    value.gaps.forEach((gap: unknown, idx: number) => {
      const path = `symbol-correspondence fact.gaps[${idx}]`;
      if (!isRecord(gap)) {
        errors.push(`${path} must be an object`);
        return;
      }
      rejectUnknownKeys(gap, SYMBOL_HISTORY_GAP_KEYS, path, errors);
      if (!isInList(gap.cause, SYMBOL_HISTORY_GAP_CAUSES)) {
        errors.push(`${path}.cause must be one of ${SYMBOL_HISTORY_GAP_CAUSES.join(", ")}`);
      }
      if (!isNonEmptySafeText(gap.reason)) errors.push(`${path}.reason must be a non-empty string without NUL`);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function validateCoverageFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["coverage fact must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, COVERAGE_FACT_KEYS, "coverage fact", errors);
  if (value.kind !== "coverage") errors.push('coverage fact.kind must be "coverage"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`coverage fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isInList(value.axis, COVERAGE_FACT_AXES)) {
    errors.push(`coverage fact.axis must be one of ${COVERAGE_FACT_AXES.join(", ")}`);
  }
  if (!isInList(value.state, COVERAGE_FACT_STATES)) {
    errors.push(`coverage fact.state must be one of ${COVERAGE_FACT_STATES.join(", ")}`);
  }
  if (!isNonEmptySafeText(value.reason)) errors.push("coverage fact.reason must be a non-empty string without NUL");
  if (!isNonNegativeSafeInt(value.checkedAt)) errors.push("coverage fact.checkedAt must be a non-negative safe integer");
  if (value.language !== undefined && !isNonEmptySafeText(value.language)) {
    errors.push("coverage fact.language, when present, must be a non-empty string without NUL");
  }
  if (value.cause !== undefined && !isNonEmptySafeText(value.cause)) {
    errors.push("coverage fact.cause, when present, must be a non-empty string without NUL");
  }
  if (value.pendingCount !== undefined && !isNonNegativeSafeInt(value.pendingCount)) {
    errors.push("coverage fact.pendingCount, when present, must be a non-negative safe integer");
  }
  if (value.pendingFrontier !== undefined && value.pendingFrontier !== null && !isNonEmptySafeText(value.pendingFrontier)) {
    errors.push("coverage fact.pendingFrontier, when present, must be null or a non-empty string without NUL");
  }
  for (const field of ["boundary", "missing"] as const) {
    const list = value[field];
    if (list !== undefined) {
      if (!Array.isArray(list)) {
        errors.push(`coverage fact.${field}, when present, must be an array`);
      } else {
        list.forEach((oid: unknown, idx: number) => {
          const checked = validateQualifiedOid(oid);
          if (!checked.ok) errors.push(...checked.errors.map((e) => `coverage fact.${field}[${idx}]: ${e}`));
        });
      }
    }
  }
  if (value.lastSuccessAt !== undefined && value.lastSuccessAt !== null && !isPositiveInteger(value.lastSuccessAt)) {
    errors.push("coverage fact.lastSuccessAt, when present, must be null or a positive safe integer");
  }
  return { ok: errors.length === 0, errors };
}

export function validateProgressFact(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["progress fact must be an object"] };
  const errors: string[] = [];
  if (value.kind !== "progress") errors.push('progress fact.kind must be "progress"');
  if (value.schemaVersion !== FACT_SCHEMA_VERSION) errors.push(`progress fact.schemaVersion must be ${FACT_SCHEMA_VERSION}`);
  if (!isStrictScopeId(value.cloneId)) errors.push("progress fact.cloneId must be a strict opaque identifier");

  switch (value.progressKind) {
    case "history-checkpoint": {
      rejectUnknownKeys(value, PROGRESS_HISTORY_CHECKPOINT_KEYS, "progress(history-checkpoint) fact", errors);
      const commit = validateQualifiedOid(value.commit);
      if (!commit.ok) errors.push(...commit.errors.map((e) => `progress fact.commit: ${e}`));
      const alg = commit.ok ? (value.commit as QualifiedOid).algorithm : undefined;
      const tree = validateQualifiedOid(value.tree);
      if (!tree.ok) errors.push(...tree.errors.map((e) => `progress fact.tree: ${e}`));
      else if (alg !== undefined && (value.tree as QualifiedOid).algorithm !== alg) {
        errors.push(`progress fact.tree.algorithm must match ${alg}`);
      }
      if (!Array.isArray(value.parents)) {
        errors.push("progress fact.parents must be an array");
      } else {
        value.parents.forEach((parent: unknown, idx: number) => {
          const checked = validateQualifiedOid(parent);
          if (!checked.ok) errors.push(...checked.errors.map((e) => `progress fact.parents[${idx}]: ${e}`));
          else if (alg !== undefined && (parent as QualifiedOid).algorithm !== alg) {
            errors.push(`progress fact.parents[${idx}].algorithm must match ${alg}`);
          }
        });
      }
      if (!isVersionString(value.extractorVersion)) errors.push("progress fact.extractorVersion must be a non-empty version string");
      if (value.policyVersion !== POLICY_VERSION) errors.push(`progress fact.policyVersion must be "${POLICY_VERSION}"`);
      break;
    }
    case "retained-root": {
      rejectUnknownKeys(value, PROGRESS_RETAINED_ROOT_KEYS, "progress(retained-root) fact", errors);
      const root = validateQualifiedOid(value.root);
      if (!root.ok) errors.push(...root.errors.map((e) => `progress fact.root: ${e}`));
      if (!isPositiveInteger(value.firstSeenAt)) errors.push("progress fact.firstSeenAt must be a positive safe integer");
      if (typeof value.firstSignal !== "string" || !RETENTION_SIGNALS.includes(value.firstSignal)) {
        errors.push(`progress fact.firstSignal must be one of ${RETENTION_SIGNALS.join(", ")}`);
      }
      if (value.refName !== null && (!isNonEmptySafeText(value.refName) || !value.refName.startsWith("refs/"))) {
        errors.push('progress fact.refName must be null or a non-empty full ref name starting with "refs/" without NUL');
      }
      break;
    }
    case "pr-cursor": {
      rejectUnknownKeys(value, PROGRESS_PR_CURSOR_KEYS, "progress(pr-cursor) fact", errors);
      const cursor = validatePrSyncCursor(value.cursor);
      if (!cursor.ok) errors.push(...cursor.errors.map((e) => `progress fact.cursor: ${e}`));
      break;
    }
    case "pr-object-job": {
      rejectUnknownKeys(value, PROGRESS_PR_OBJECT_JOB_KEYS, "progress(pr-object-job) fact", errors);
      const job = validatePrObjectJob(value.job);
      if (!job.ok) errors.push(...job.errors.map((e) => `progress fact.job: ${e}`));
      break;
    }
    case "reconcile-checkpoint": {
      rejectUnknownKeys(value, PROGRESS_RECONCILE_CHECKPOINT_KEYS, "progress(reconcile-checkpoint) fact", errors);
      if (value.worktreeId !== null && !isStrictScopeId(value.worktreeId)) {
        errors.push("progress fact.worktreeId must be null or a strict opaque identifier");
      }
      if (!isStrictScopeId(value.checkpointId)) errors.push("progress fact.checkpointId must be a strict opaque identifier");
      if (!isNonNegativeSafeInt(value.pendingCount)) errors.push("progress fact.pendingCount must be a non-negative safe integer");
      if (value.frontier !== null && !isNonEmptySafeText(value.frontier)) {
        errors.push("progress fact.frontier must be null or a non-empty string without NUL");
      }
      if (typeof value.complete !== "boolean") errors.push("progress fact.complete must be a boolean");
      if (!isPositiveInteger(value.recordedAt)) errors.push("progress fact.recordedAt must be a positive safe integer");
      break;
    }
    default:
      errors.push(`progress fact.progressKind must be one of ${PROGRESS_FACT_KINDS.join(", ")}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Classify a candidate fact into its closed LiveFactKind without mutating it.
 * Tagged facts resolve by their exact `kind`; the three L4b shapes emitted
 * directly by snapshots.ts keep their bytes and resolve structurally; any
 * unknown or unrecognized shape returns null and is refused by validateLiveFact.
 */
export function classifyLiveFactKind(fact: unknown): LiveFactKind | null {
  if (!isRecord(fact)) return null;
  if (Object.prototype.hasOwnProperty.call(fact, "kind")) {
    const kind = fact.kind;
    if (typeof kind !== "string") return null;
    if ((TAGGED_FACT_KINDS as readonly string[]).includes(kind)) {
      return kind as TaggedFactKind;
    }
    if (isLocalDiffKind(kind)) return "local-diff";
    if (kind === "index" || kind === "working-tree") return "local-snapshot";
    return null;
  }
  if ("axis" in fact && "state" in fact && "reason" in fact) {
    return "local-coverage";
  }
  return null;
}

/**
 * Exact-key pure validator over the closed LiveFactDto union.
 * Sink-bound: L4b diffs validate through validateSealedLocalDiff (transient
 * "open-lines" is refused), and every unknown kind or extra key is refused.
 */
export function validateLiveFact(fact: unknown): ValidationResult {
  if (!isRecord(fact)) return { ok: false, errors: ["fact must be an object"] };
  const kind = classifyLiveFactKind(fact);
  if (kind === null) {
    return { ok: false, errors: ["unknown or unrecognized fact kind: refused"] };
  }
  switch (kind) {
    case "ref-observation":
      return validateRefObservationFact(fact);
    case "ref-state":
      return validateTrackedRefFact(fact);
    case "commit":
      return validateCommitFact(fact);
    case "changed-file":
      return validateChangedFileFact(fact);
    case "pr-observation":
      return validatePullRequestObservationFact(fact);
    case "pr-attribution":
      return validatePrAttributionFact(fact);
    case "retention-receipt":
      return validateRetentionReceiptFact(fact);
    case "branch-comparison":
      return validateBranchComparisonFact(fact);
    case "code-analysis":
      return validateCodeAnalysisFact(fact);
    case "code-relation":
      return validateCodeRelationFact(fact);
    case "line-attribution":
      return validateLineAttributionFact(fact);
    case "symbol-correspondence":
      return validateSymbolCorrespondenceFact(fact);
    case "coverage":
      return validateCoverageFact(fact);
    case "progress":
      return validateProgressFact(fact);
    case "local-diff":
      return validateSealedLocalDiff(fact);
    case "local-snapshot":
      return validateLocalSnapshot(fact);
    case "local-coverage":
      return validateLocalCoverage(fact);
  }
}

export function isLiveFactDto(fact: unknown): fact is LiveFactDto {
  return validateLiveFact(fact).ok;
}

// — L3a-E2: generation correlation and completion control messages
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3, 6, 9, 12;
// spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md §§2.3, 5.1, 12.1–12.3, 17.4;
// plan/09 L3a-E2).
//
// Data-pure definitions only: zero imports, zero Node builtins, zero host or
// database types. Generation correlation and completion are control messages,
// NOT batch facts — LIVE_FACT_KINDS and LiveFactDto stay unchanged. Producer
// generation IDs remain correlation identities mapped durably to kernel-issued
// generations; a producer-supplied string is never a storage capability, and a
// final batch receipt never implies publication.

/** Version of the neutral generation correlation and completion control protocol. */
export const GENERATION_CONTROL_VERSION = "engram-live-generation-control/1" as const;

/** Fixed role stamped on producer correlation/completion messages (never a storage capability). */
export const GENERATION_CORRELATION_ROLE = "producer-correlation" as const;

/** Fixed authority stamped on storage-returned correlation records and completion outcomes. */
export const STORAGE_KERNEL_AUTHORITY = "storage-kernel" as const;

/** Live view kinds (SPEC_L3A §12.1): committed per canonical clone; private per clone/worktree. */
export const LIVE_VIEW_KINDS = ["committed", "private"] as const;

export type LiveViewKind = (typeof LIVE_VIEW_KINDS)[number];

export function isLiveViewKind(value: unknown): value is LiveViewKind {
  return isInList(value, LIVE_VIEW_KINDS);
}

/** Private source-boundary fingerprint policy (SPEC_L3A §§5.1, 12.2): never unkeyed. */
export const PRIVATE_FINGERPRINT_MODES = ["none", "disposable-keyed"] as const;

export type PrivateFingerprintMode = (typeof PRIVATE_FINGERPRINT_MODES)[number];

export function isPrivateFingerprintMode(value: unknown): value is PrivateFingerprintMode {
  return isInList(value, PRIVATE_FINGERPRINT_MODES);
}

/** Neutral producer completion states (LIVE §9; SPEC_L3A §12.3). */
export const GENERATION_COMPLETION_STATES = ["complete", "partial", "aborted"] as const;

export type GenerationCompletionState = (typeof GENERATION_COMPLETION_STATES)[number];

export function isGenerationCompletionState(value: unknown): value is GenerationCompletionState {
  return isInList(value, GENERATION_COMPLETION_STATES);
}

/** Storage-returned completion outcome statuses (SPEC_L3A §§12.2–12.3). */
export const GENERATION_COMPLETION_OUTCOME_STATUSES = [
  "published",
  "staged",
  "aborted",
  "rejected",
] as const;

export type GenerationCompletionOutcomeStatus =
  (typeof GENERATION_COMPLETION_OUTCOME_STATUSES)[number];

/** Closed storage rejection codes for a completion outcome. */
export const GENERATION_REJECTION_CODES = [
  "stale-base",
  "fenced",
  "missing-batch",
  "digest-mismatch",
  "unauthorized",
  "incomplete-coverage",
  "invalid-completion",
  "incarnation-mismatch",
] as const;

export type GenerationRejectionCode = (typeof GENERATION_REJECTION_CODES)[number];

function isHex64Digest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isBoundedOpaqueId(value: unknown, maxLength = 1024): value is string {
  return isNonEmptySafeText(value) && value.length <= maxLength;
}

function isTrimmedBoundedId(value: unknown, maxLength = 1024): value is string {
  return isBoundedOpaqueId(value, maxLength) && value.trim() === value;
}

/**
 * Recognizes a kernel-issued storage generation identity: a bounded, non-empty,
 * NUL-free, whitespace-trimmed opaque string that is strictly outside the
 * producer correlation ID namespace (`gen:*`). No producer-namespaced `gen:*`
 * identifier ever satisfies this predicate or can be substituted as a storage
 * capability.
 */
export function isStorageIssuedGenerationId(value: unknown): value is string {
  return isTrimmedBoundedId(value, 1024) && !value.startsWith("gen:");
}

/**
 * Exact L6a authorizing declaration reference accompanying every generation
 * correlation and completion message (SPEC_L3A §12.1: an authorizing
 * declaration accompanies committed work; sharing a clone does not make
 * worktree declarations interchangeable).
 */
export interface AuthorizingDeclarationRefDto {
  readonly declarationId: string;
  readonly cloneId: string;
  readonly worktreeId: string;
  readonly declarationRevision: number;
}

/** Source boundary of a committed (clone-scoped) capture pass. */
export interface CommittedSourceBoundaryDto {
  readonly view: "committed";
  readonly oidAlgorithm: OidAlgorithm;
  readonly observedAt: number;
  readonly refsFingerprint: string;
  readonly headCommit: QualifiedOid | null;
  readonly rootOids: readonly QualifiedOid[];
  readonly configAttributesFingerprint: string;
  readonly completeHistoryFrontier: boolean;
}

/**
 * Source boundary of a private (worktree-scoped) capture pass.
 * Enforces SPEC_L3A §§5.1, 12.2 disposable-fingerprint policy: private content
 * never carries an unkeyed confirmation digest.
 */
export interface PrivateSourceBoundaryDto {
  readonly view: "private";
  readonly oidAlgorithm: OidAlgorithm;
  readonly observedAt: number;
  readonly worktreeId: string;
  readonly headCommit: QualifiedOid | null;
  readonly captureStable: boolean;
  readonly snapshotIds: readonly string[];
  readonly configAttributesFingerprint: string;
  readonly contentFingerprintMode: PrivateFingerprintMode;
  readonly disposableContentFingerprint?: string;
  readonly disposableKeyRef?: string;
}

export type GenerationSourceBoundaryDto =
  | CommittedSourceBoundaryDto
  | PrivateSourceBoundaryDto;

/**
 * Producer-side generation correlation envelope (SPEC_L3A §12.3).
 * Carries ONLY a producer correlation identity (`role: "producer-correlation"`),
 * never a storage-issued generation id, incarnation, pointer version or seal.
 */
export interface ProducerGenerationCorrelationDto {
  readonly controlVersion: typeof GENERATION_CONTROL_VERSION;
  readonly kind: "generation-correlation";
  readonly role: typeof GENERATION_CORRELATION_ROLE;
  readonly producerGenerationId: string;
  readonly producerName: typeof PRODUCER_NAME;
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly policyVersion: BatchPolicyVersion;
  readonly view: LiveViewKind;
  readonly scope: LiveScope;
  readonly authorizingDeclaration: AuthorizingDeclarationRefDto;
  readonly sourceBoundary: GenerationSourceBoundaryDto;
}

/**
 * Storage-kernel-owned durable mapping between a producer correlation identity
 * and its distinct kernel-issued storage generation identity (SPEC_L3A §12.3).
 * Never minted by the neutral producer.
 */
export interface StorageGenerationCorrelationRecordDto {
  readonly controlVersion: typeof GENERATION_CONTROL_VERSION;
  readonly kind: "storage-generation-correlation";
  readonly authority: typeof STORAGE_KERNEL_AUTHORITY;
  readonly producerGenerationId: string;
  readonly storageGenerationId: string;
  readonly storeIncarnation: string;
  readonly view: LiveViewKind;
  readonly scope: LiveScope;
  readonly mappedAt: number;
}

/**
 * Durable acknowledgement of one complete delivered fact batch (SPEC_L3A §12.3).
 * `published` is ALWAYS `false`, even when `finalBatch` is `true`: a final
 * batch receipt never implies publication, and a prefix is never acknowledged.
 */
export interface BatchDeliveryReceiptDto {
  readonly controlVersion: typeof GENERATION_CONTROL_VERSION;
  readonly kind: "batch-receipt";
  readonly received: true;
  readonly published: false;
  readonly completeBatch: true;
  readonly producerGenerationId: string;
  readonly batchId: string;
  readonly batchDigest: string;
  readonly receiptId: string;
  readonly byteLength: number;
  readonly finalBatch?: boolean;
  readonly receivedAt: number;
}

/** Manifest entry for one durably receipted batch inside a completion message. */
export interface BatchManifestEntryDto {
  readonly batchId: string;
  readonly batchDigest: string;
  readonly receiptId: string;
  readonly byteLength: number;
}

/** Per-axis coverage summary carried by a generation completion control message. */
export interface GenerationCoverageSummaryDto {
  readonly axis: CoverageFactAxis;
  readonly state: CoverageFactState;
  readonly reason: string;
  readonly pendingCount: number;
  readonly complete: boolean;
}

/**
 * Separate neutral completion control message emitted after batch delivery
 * (SPEC_L3A §12.3; LIVE §§3, 9). Carries an order-independent
 * `logicalBatchSetRoot`, truthful coverage/exclusions/errors/remainingWork,
 * and a canonical `messageDigest`. Never carries a storage-issued capability.
 */
export interface GenerationCompletionMessageDto {
  readonly controlVersion: typeof GENERATION_CONTROL_VERSION;
  readonly kind: "generation-completion";
  readonly role: typeof GENERATION_CORRELATION_ROLE;
  readonly producerGenerationId: string;
  readonly producerName: typeof PRODUCER_NAME;
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly policyVersion: BatchPolicyVersion;
  readonly view: LiveViewKind;
  readonly scope: LiveScope;
  readonly authorizingDeclaration: AuthorizingDeclarationRefDto;
  readonly sourceBoundary: GenerationSourceBoundaryDto;
  readonly completionState: GenerationCompletionState;
  readonly expectedBatchCount: number;
  readonly batches: readonly BatchManifestEntryDto[];
  readonly logicalBatchSetRoot: string;
  readonly coverage: readonly GenerationCoverageSummaryDto[];
  readonly exclusions: readonly string[];
  readonly errors: readonly string[];
  readonly remainingWork: number;
  readonly abortReason?: string;
  readonly completedAt: number;
  readonly messageDigest: string;
}

export interface PublishedGenerationOutcomeDto {
  readonly controlVersion: typeof GENERATION_CONTROL_VERSION;
  readonly kind: "generation-completion-outcome";
  readonly authority: typeof STORAGE_KERNEL_AUTHORITY;
  readonly status: "published";
  readonly published: true;
  readonly producerGenerationId: string;
  readonly completionMessageDigest: string;
  readonly view: LiveViewKind;
  readonly scope: LiveScope;
  readonly storageGenerationId: string;
  readonly storeIncarnation: string;
  readonly pointerVersion: number;
  readonly publicationReceiptId: string;
  readonly publishedAt: number;
}

export interface StagedGenerationOutcomeDto {
  readonly controlVersion: typeof GENERATION_CONTROL_VERSION;
  readonly kind: "generation-completion-outcome";
  readonly authority: typeof STORAGE_KERNEL_AUTHORITY;
  readonly status: "staged";
  readonly published: false;
  readonly producerGenerationId: string;
  readonly completionMessageDigest: string;
  readonly view: LiveViewKind;
  readonly scope: LiveScope;
  readonly storageGenerationId: string;
  readonly storeIncarnation: string;
  readonly stagedAt: number;
}

export interface AbortedGenerationOutcomeDto {
  readonly controlVersion: typeof GENERATION_CONTROL_VERSION;
  readonly kind: "generation-completion-outcome";
  readonly authority: typeof STORAGE_KERNEL_AUTHORITY;
  readonly status: "aborted";
  readonly published: false;
  readonly producerGenerationId: string;
  readonly completionMessageDigest: string;
  readonly view: LiveViewKind;
  readonly scope: LiveScope;
  readonly reason: string;
  readonly abortedAt: number;
  readonly storageGenerationId?: string;
  readonly storeIncarnation?: string;
}

export interface RejectedGenerationOutcomeDto {
  readonly controlVersion: typeof GENERATION_CONTROL_VERSION;
  readonly kind: "generation-completion-outcome";
  readonly authority: typeof STORAGE_KERNEL_AUTHORITY;
  readonly status: "rejected";
  readonly published: false;
  readonly producerGenerationId: string;
  readonly completionMessageDigest: string;
  readonly view: LiveViewKind;
  readonly scope: LiveScope;
  readonly rejectionCode: GenerationRejectionCode;
  readonly reason: string;
  readonly rejectedAt: number;
}

/** Storage-returned outcome for a neutral completion control message. */
export type GenerationCompletionOutcomeDto =
  | PublishedGenerationOutcomeDto
  | StagedGenerationOutcomeDto
  | AbortedGenerationOutcomeDto
  | RejectedGenerationOutcomeDto;

const AUTHORIZING_DECLARATION_REF_KEYS: readonly string[] = [
  "declarationId",
  "cloneId",
  "worktreeId",
  "declarationRevision",
];

const COMMITTED_SOURCE_BOUNDARY_KEYS: readonly string[] = [
  "view",
  "oidAlgorithm",
  "observedAt",
  "refsFingerprint",
  "headCommit",
  "rootOids",
  "configAttributesFingerprint",
  "completeHistoryFrontier",
];

const PRIVATE_SOURCE_BOUNDARY_KEYS: readonly string[] = [
  "view",
  "oidAlgorithm",
  "observedAt",
  "worktreeId",
  "headCommit",
  "captureStable",
  "snapshotIds",
  "configAttributesFingerprint",
  "contentFingerprintMode",
  "disposableContentFingerprint",
  "disposableKeyRef",
];

const PRODUCER_GENERATION_CORRELATION_KEYS: readonly string[] = [
  "controlVersion",
  "kind",
  "role",
  "producerGenerationId",
  "producerName",
  "contractVersion",
  "policyVersion",
  "view",
  "scope",
  "authorizingDeclaration",
  "sourceBoundary",
];

const STORAGE_GENERATION_CORRELATION_KEYS: readonly string[] = [
  "controlVersion",
  "kind",
  "authority",
  "producerGenerationId",
  "storageGenerationId",
  "storeIncarnation",
  "view",
  "scope",
  "mappedAt",
];

const BATCH_DELIVERY_RECEIPT_KEYS: readonly string[] = [
  "controlVersion",
  "kind",
  "received",
  "published",
  "completeBatch",
  "producerGenerationId",
  "batchId",
  "batchDigest",
  "receiptId",
  "byteLength",
  "finalBatch",
  "receivedAt",
];

const BATCH_MANIFEST_ENTRY_KEYS: readonly string[] = [
  "batchId",
  "batchDigest",
  "receiptId",
  "byteLength",
];

const GENERATION_COVERAGE_SUMMARY_KEYS: readonly string[] = [
  "axis",
  "state",
  "reason",
  "pendingCount",
  "complete",
];

const GENERATION_COMPLETION_MESSAGE_KEYS: readonly string[] = [
  "controlVersion",
  "kind",
  "role",
  "producerGenerationId",
  "producerName",
  "contractVersion",
  "policyVersion",
  "view",
  "scope",
  "authorizingDeclaration",
  "sourceBoundary",
  "completionState",
  "expectedBatchCount",
  "batches",
  "logicalBatchSetRoot",
  "coverage",
  "exclusions",
  "errors",
  "remainingWork",
  "abortReason",
  "completedAt",
  "messageDigest",
];

const PUBLISHED_GENERATION_OUTCOME_KEYS: readonly string[] = [
  "controlVersion",
  "kind",
  "authority",
  "status",
  "published",
  "producerGenerationId",
  "completionMessageDigest",
  "view",
  "scope",
  "storageGenerationId",
  "storeIncarnation",
  "pointerVersion",
  "publicationReceiptId",
  "publishedAt",
];

const STAGED_GENERATION_OUTCOME_KEYS: readonly string[] = [
  "controlVersion",
  "kind",
  "authority",
  "status",
  "published",
  "producerGenerationId",
  "completionMessageDigest",
  "view",
  "scope",
  "storageGenerationId",
  "storeIncarnation",
  "stagedAt",
];

const ABORTED_GENERATION_OUTCOME_KEYS: readonly string[] = [
  "controlVersion",
  "kind",
  "authority",
  "status",
  "published",
  "producerGenerationId",
  "completionMessageDigest",
  "view",
  "scope",
  "reason",
  "abortedAt",
  "storageGenerationId",
  "storeIncarnation",
];

const REJECTED_GENERATION_OUTCOME_KEYS: readonly string[] = [
  "controlVersion",
  "kind",
  "authority",
  "status",
  "published",
  "producerGenerationId",
  "completionMessageDigest",
  "view",
  "scope",
  "rejectionCode",
  "reason",
  "rejectedAt",
];

function validateViewScopedLiveScope(
  scope: unknown,
  view: unknown,
  path: string,
  errors: string[],
): LiveScope | null {
  const checked = validateLiveScope(scope);
  if (!checked.ok) {
    errors.push(...checked.errors.map((e) => `${path}: ${e}`));
    return null;
  }
  const typed = scope as LiveScope;
  if (view === "committed" && typed.worktree !== undefined) {
    errors.push(`${path}.worktree must be absent for a committed view`);
  }
  if (view === "private" && typed.worktree === undefined) {
    errors.push(`${path}.worktree is required for a private view`);
  }
  return typed;
}

export function validateAuthorizingDeclarationRef(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["authorizingDeclaration must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, AUTHORIZING_DECLARATION_REF_KEYS, "authorizingDeclaration", errors);
  if (!isStrictBatchId(value.declarationId, ID_PREFIXES.declaration)) {
    errors.push(`authorizingDeclaration.declarationId must be a strict opaque id starting with "${ID_PREFIXES.declaration}"`);
  }
  if (!isStrictBatchId(value.cloneId, ID_PREFIXES.clone)) {
    errors.push(`authorizingDeclaration.cloneId must be a strict opaque id starting with "${ID_PREFIXES.clone}"`);
  }
  if (!isStrictBatchId(value.worktreeId, ID_PREFIXES.worktree)) {
    errors.push(`authorizingDeclaration.worktreeId must be a strict opaque id starting with "${ID_PREFIXES.worktree}"`);
  }
  if (!isPositiveInteger(value.declarationRevision) || value.declarationRevision < INITIAL_DECLARATION_REVISION) {
    errors.push(`authorizingDeclaration.declarationRevision must be an integer >= ${INITIAL_DECLARATION_REVISION}`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateGenerationSourceBoundary(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["sourceBoundary must be an object"] };
  const errors: string[] = [];
  if (value.view === "committed") {
    rejectUnknownKeys(value, COMMITTED_SOURCE_BOUNDARY_KEYS, "sourceBoundary(committed)", errors);
    if (value.oidAlgorithm !== "sha1" && value.oidAlgorithm !== "sha256") {
      errors.push('sourceBoundary.oidAlgorithm must be "sha1" or "sha256"');
    }
    const alg = value.oidAlgorithm === "sha1" || value.oidAlgorithm === "sha256" ? value.oidAlgorithm : undefined;
    if (!isPositiveInteger(value.observedAt)) {
      errors.push("sourceBoundary.observedAt must be a positive safe integer");
    }
    if (!isHex64Digest(value.refsFingerprint)) {
      errors.push("sourceBoundary.refsFingerprint must be a 64 character lowercase hex digest");
    }
    if (value.headCommit !== null) {
      const head = validateQualifiedOid(value.headCommit);
      if (!head.ok) errors.push(...head.errors.map((e) => `sourceBoundary.headCommit: ${e}`));
      else if (alg !== undefined && (value.headCommit as QualifiedOid).algorithm !== alg) {
        errors.push(`sourceBoundary.headCommit.algorithm must match ${alg}`);
      }
    }
    if (!Array.isArray(value.rootOids)) {
      errors.push("sourceBoundary.rootOids must be an array");
    } else {
      value.rootOids.forEach((oid: unknown, idx: number) => {
        const checked = validateQualifiedOid(oid);
        if (!checked.ok) errors.push(...checked.errors.map((e) => `sourceBoundary.rootOids[${idx}]: ${e}`));
        else if (alg !== undefined && (oid as QualifiedOid).algorithm !== alg) {
          errors.push(`sourceBoundary.rootOids[${idx}].algorithm must match ${alg}`);
        }
      });
    }
    if (!isHex64Digest(value.configAttributesFingerprint)) {
      errors.push("sourceBoundary.configAttributesFingerprint must be a 64 character lowercase hex digest");
    }
    if (typeof value.completeHistoryFrontier !== "boolean") {
      errors.push("sourceBoundary.completeHistoryFrontier must be a boolean");
    }
  } else if (value.view === "private") {
    rejectUnknownKeys(value, PRIVATE_SOURCE_BOUNDARY_KEYS, "sourceBoundary(private)", errors);
    if (value.oidAlgorithm !== "sha1" && value.oidAlgorithm !== "sha256") {
      errors.push('sourceBoundary.oidAlgorithm must be "sha1" or "sha256"');
    }
    const alg = value.oidAlgorithm === "sha1" || value.oidAlgorithm === "sha256" ? value.oidAlgorithm : undefined;
    if (!isPositiveInteger(value.observedAt)) {
      errors.push("sourceBoundary.observedAt must be a positive safe integer");
    }
    if (!isStrictBatchId(value.worktreeId, ID_PREFIXES.worktree)) {
      errors.push(`sourceBoundary.worktreeId must be a strict opaque id starting with "${ID_PREFIXES.worktree}"`);
    }
    if (value.headCommit !== null) {
      const head = validateQualifiedOid(value.headCommit);
      if (!head.ok) errors.push(...head.errors.map((e) => `sourceBoundary.headCommit: ${e}`));
      else if (alg !== undefined && (value.headCommit as QualifiedOid).algorithm !== alg) {
        errors.push(`sourceBoundary.headCommit.algorithm must match ${alg}`);
      }
    }
    if (typeof value.captureStable !== "boolean") {
      errors.push("sourceBoundary.captureStable must be a boolean");
    }
    if (!Array.isArray(value.snapshotIds)) {
      errors.push("sourceBoundary.snapshotIds must be an array");
    } else {
      const seenSnapshots = new Set<string>();
      value.snapshotIds.forEach((id: unknown, idx: number) => {
        if (!isStrictSnapshotId(id)) {
          errors.push(`sourceBoundary.snapshotIds[${idx}] must be a strict lsnap hex snapshot id`);
        } else if (seenSnapshots.has(id)) {
          errors.push(`sourceBoundary.snapshotIds[${idx}] duplicates snapshot id`);
        } else {
          seenSnapshots.add(id);
        }
      });
    }
    if (!isHex64Digest(value.configAttributesFingerprint)) {
      errors.push("sourceBoundary.configAttributesFingerprint must be a 64 character lowercase hex digest");
    }
    if (!isPrivateFingerprintMode(value.contentFingerprintMode)) {
      errors.push(`sourceBoundary.contentFingerprintMode must be one of ${PRIVATE_FINGERPRINT_MODES.join(", ")}`);
    } else if (value.contentFingerprintMode === "disposable-keyed") {
      if (!isHex64Digest(value.disposableContentFingerprint)) {
        errors.push("sourceBoundary.disposableContentFingerprint must be a 64 character lowercase hex digest when contentFingerprintMode is disposable-keyed");
      }
      if (!isStrictKeyRef(value.disposableKeyRef)) {
        errors.push("sourceBoundary.disposableKeyRef must be a strict opaque key reference when contentFingerprintMode is disposable-keyed");
      }
    } else {
      if (value.disposableContentFingerprint !== undefined) {
        errors.push("sourceBoundary.disposableContentFingerprint must be absent when contentFingerprintMode is none");
      }
      if (value.disposableKeyRef !== undefined) {
        errors.push("sourceBoundary.disposableKeyRef must be absent when contentFingerprintMode is none");
      }
    }
  } else {
    errors.push(`sourceBoundary.view must be one of ${LIVE_VIEW_KINDS.join(", ")}`);
  }
  return { ok: errors.length === 0, errors };
}

function validateGenerationEnvelopeCommon(
  value: Record<string, unknown>,
  label: string,
  errors: string[],
): {
  readonly view: LiveViewKind | null;
  readonly scope: LiveScope | null;
  readonly boundary: GenerationSourceBoundaryDto | null;
} {
  if (value.controlVersion !== GENERATION_CONTROL_VERSION) {
    errors.push(`${label}.controlVersion must be "${GENERATION_CONTROL_VERSION}"`);
  }
  if (value.role !== GENERATION_CORRELATION_ROLE) {
    errors.push(`${label}.role must be "${GENERATION_CORRELATION_ROLE}"`);
  }
  if (!isStrictGenerationId(value.producerGenerationId)) {
    errors.push(`${label}.producerGenerationId must be a fixed-width correlation id ("gen:" plus ${GENERATION_ID_WIDTH} zero-padded digits)`);
  }
  if (value.producerName !== PRODUCER_NAME) {
    errors.push(`${label}.producerName must be "${PRODUCER_NAME}"`);
  }
  if (value.contractVersion !== CONTRACT_VERSION) {
    errors.push(`${label}.contractVersion must be ${CONTRACT_VERSION}`);
  }
  const view = isLiveViewKind(value.view) ? value.view : null;
  if (view === null) {
    errors.push(`${label}.view must be one of ${LIVE_VIEW_KINDS.join(", ")}`);
  }
  if (view === "committed") {
    if (value.policyVersion !== POLICY_VERSION) {
      errors.push(`${label}.policyVersion must be "${POLICY_VERSION}" for a committed view`);
    }
  } else if (!isBatchPolicyVersion(value.policyVersion)) {
    errors.push(`${label}.policyVersion must be one of ${BATCH_POLICY_VERSIONS.join(", ")}`);
  }
  const scope = validateViewScopedLiveScope(value.scope, view, `${label}.scope`, errors);
  const declChecked = validateAuthorizingDeclarationRef(value.authorizingDeclaration);
  if (!declChecked.ok) {
    errors.push(...declChecked.errors.map((e) => `${label}.${e}`));
  }
  const boundaryChecked = validateGenerationSourceBoundary(value.sourceBoundary);
  if (!boundaryChecked.ok) {
    errors.push(...boundaryChecked.errors.map((e) => `${label}.${e}`));
  }
  const boundary = boundaryChecked.ok ? (value.sourceBoundary as GenerationSourceBoundaryDto) : null;
  if (declChecked.ok && scope !== null) {
    const decl = value.authorizingDeclaration as AuthorizingDeclarationRefDto;
    if (decl.cloneId !== scope.clone) {
      errors.push(`${label}.authorizingDeclaration.cloneId must match ${label}.scope.clone`);
    }
    if (view === "private" && scope.worktree !== undefined && decl.worktreeId !== scope.worktree) {
      errors.push(`${label}.authorizingDeclaration.worktreeId must match ${label}.scope.worktree`);
    }
  }
  if (boundary !== null && view !== null) {
    if (boundary.view !== view) {
      errors.push(`${label}.sourceBoundary.view must match ${label}.view`);
    }
    if (boundary.view === "private" && scope !== null && scope.worktree !== undefined && boundary.worktreeId !== scope.worktree) {
      errors.push(`${label}.sourceBoundary.worktreeId must match ${label}.scope.worktree`);
    }
  }
  return { view, scope, boundary };
}

export function validateProducerGenerationCorrelation(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["generation correlation must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, PRODUCER_GENERATION_CORRELATION_KEYS, "generation correlation", errors);
  if (value.kind !== "generation-correlation") {
    errors.push('generation correlation.kind must be "generation-correlation"');
  }
  validateGenerationEnvelopeCommon(value, "generation correlation", errors);
  return { ok: errors.length === 0, errors };
}

export function isProducerGenerationCorrelationDto(value: unknown): value is ProducerGenerationCorrelationDto {
  return validateProducerGenerationCorrelation(value).ok;
}

export function validateStorageGenerationCorrelationRecord(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["storage generation correlation record must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, STORAGE_GENERATION_CORRELATION_KEYS, "storage generation correlation record", errors);
  if (value.controlVersion !== GENERATION_CONTROL_VERSION) {
    errors.push(`storage generation correlation record.controlVersion must be "${GENERATION_CONTROL_VERSION}"`);
  }
  if (value.kind !== "storage-generation-correlation") {
    errors.push('storage generation correlation record.kind must be "storage-generation-correlation"');
  }
  if (value.authority !== STORAGE_KERNEL_AUTHORITY) {
    errors.push(`storage generation correlation record.authority must be "${STORAGE_KERNEL_AUTHORITY}"`);
  }
  if (!isStrictGenerationId(value.producerGenerationId)) {
    errors.push(`storage generation correlation record.producerGenerationId must be a fixed-width correlation id ("gen:" plus ${GENERATION_ID_WIDTH} zero-padded digits)`);
  }
  if (!isStorageIssuedGenerationId(value.storageGenerationId)) {
    errors.push("storage generation correlation record.storageGenerationId must be a kernel-issued identity distinct from producer correlation ids");
  } else if (value.storageGenerationId === value.producerGenerationId) {
    errors.push("storage generation correlation record.storageGenerationId must not equal producerGenerationId");
  }
  if (!isBoundedOpaqueId(value.storeIncarnation, 1024)) {
    errors.push("storage generation correlation record.storeIncarnation must be a bounded non-empty string without NUL");
  }
  const view = isLiveViewKind(value.view) ? value.view : null;
  if (view === null) {
    errors.push(`storage generation correlation record.view must be one of ${LIVE_VIEW_KINDS.join(", ")}`);
  }
  validateViewScopedLiveScope(value.scope, view, "storage generation correlation record.scope", errors);
  if (!isPositiveInteger(value.mappedAt)) {
    errors.push("storage generation correlation record.mappedAt must be a positive safe integer");
  }
  return { ok: errors.length === 0, errors };
}

export function validateBatchDeliveryReceipt(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["batch delivery receipt must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, BATCH_DELIVERY_RECEIPT_KEYS, "batch delivery receipt", errors);
  if (value.controlVersion !== GENERATION_CONTROL_VERSION) {
    errors.push(`batch delivery receipt.controlVersion must be "${GENERATION_CONTROL_VERSION}"`);
  }
  if (value.kind !== "batch-receipt") {
    errors.push('batch delivery receipt.kind must be "batch-receipt"');
  }
  if (value.received !== true) {
    errors.push("batch delivery receipt.received must be true");
  }
  if (value.published !== false) {
    errors.push("batch delivery receipt.published must be false (a batch receipt never implies publication)");
  }
  if (value.completeBatch !== true) {
    errors.push("batch delivery receipt.completeBatch must be true (a prefix is never acknowledged)");
  }
  if (!isStrictGenerationId(value.producerGenerationId)) {
    errors.push(`batch delivery receipt.producerGenerationId must be a fixed-width correlation id ("gen:" plus ${GENERATION_ID_WIDTH} zero-padded digits)`);
  }
  if (!isStrictBatchId(value.batchId, "batch:")) {
    errors.push("batch delivery receipt.batchId must be a strict opaque batch id");
  }
  if (!isHex64Digest(value.batchDigest)) {
    errors.push("batch delivery receipt.batchDigest must be a 64 character lowercase hex digest");
  }
  if (!isBoundedOpaqueId(value.receiptId, 256)) {
    errors.push("batch delivery receipt.receiptId must be a bounded non-empty string without NUL");
  }
  if (!isPositiveInteger(value.byteLength) || value.byteLength > MAX_FACT_BATCH_BYTES) {
    errors.push(`batch delivery receipt.byteLength must be a positive safe integer <= ${MAX_FACT_BATCH_BYTES}`);
  }
  if (value.finalBatch !== undefined && typeof value.finalBatch !== "boolean") {
    errors.push("batch delivery receipt.finalBatch, when present, must be a boolean");
  }
  if (!isPositiveInteger(value.receivedAt)) {
    errors.push("batch delivery receipt.receivedAt must be a positive safe integer");
  }
  return { ok: errors.length === 0, errors };
}

export function isBatchDeliveryReceiptDto(value: unknown): value is BatchDeliveryReceiptDto {
  return validateBatchDeliveryReceipt(value).ok;
}

export function validateGenerationCompletionMessage(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["generation completion message must be an object"] };
  const errors: string[] = [];
  rejectUnknownKeys(value, GENERATION_COMPLETION_MESSAGE_KEYS, "generation completion message", errors);
  if (value.kind !== "generation-completion") {
    errors.push('generation completion message.kind must be "generation-completion"');
  }
  const { boundary } = validateGenerationEnvelopeCommon(value, "generation completion message", errors);

  const state = isGenerationCompletionState(value.completionState) ? value.completionState : null;
  if (state === null) {
    errors.push(`generation completion message.completionState must be one of ${GENERATION_COMPLETION_STATES.join(", ")}`);
  }
  if (!isNonNegativeSafeInt(value.expectedBatchCount)) {
    errors.push("generation completion message.expectedBatchCount must be a non-negative safe integer");
  }
  if (!Array.isArray(value.batches)) {
    errors.push("generation completion message.batches must be an array");
  } else {
    const seenBatchIds = new Set<string>();
    value.batches.forEach((entry: unknown, idx: number) => {
      const path = `generation completion message.batches[${idx}]`;
      if (!isRecord(entry)) {
        errors.push(`${path} must be an object`);
        return;
      }
      rejectUnknownKeys(entry, BATCH_MANIFEST_ENTRY_KEYS, path, errors);
      if (!isStrictBatchId(entry.batchId, "batch:")) {
        errors.push(`${path}.batchId must be a strict opaque batch id`);
      } else if (seenBatchIds.has(entry.batchId)) {
        errors.push(`${path}.batchId duplicates an earlier batch entry`);
      } else {
        seenBatchIds.add(entry.batchId);
      }
      if (!isHex64Digest(entry.batchDigest)) {
        errors.push(`${path}.batchDigest must be a 64 character lowercase hex digest`);
      }
      if (!isBoundedOpaqueId(entry.receiptId, 256)) {
        errors.push(`${path}.receiptId must be a bounded non-empty string without NUL`);
      }
      if (!isPositiveInteger(entry.byteLength) || entry.byteLength > MAX_FACT_BATCH_BYTES) {
        errors.push(`${path}.byteLength must be a positive safe integer <= ${MAX_FACT_BATCH_BYTES}`);
      }
    });
    if (isNonNegativeSafeInt(value.expectedBatchCount)) {
      if (state === "aborted") {
        if (value.batches.length > value.expectedBatchCount) {
          errors.push("generation completion message.batches length cannot exceed expectedBatchCount");
        }
      } else if (value.batches.length !== value.expectedBatchCount) {
        errors.push("generation completion message.batches length must equal expectedBatchCount");
      }
    }
  }
  if (!isHex64Digest(value.logicalBatchSetRoot)) {
    errors.push("generation completion message.logicalBatchSetRoot must be a 64 character lowercase hex digest");
  }

  let hasIncompleteAxis = false;
  if (!Array.isArray(value.coverage)) {
    errors.push("generation completion message.coverage must be an array");
  } else {
    const seenAxes = new Set<string>();
    value.coverage.forEach((item: unknown, idx: number) => {
      const path = `generation completion message.coverage[${idx}]`;
      if (!isRecord(item)) {
        errors.push(`${path} must be an object`);
        return;
      }
      rejectUnknownKeys(item, GENERATION_COVERAGE_SUMMARY_KEYS, path, errors);
      if (!isInList(item.axis, COVERAGE_FACT_AXES)) {
        errors.push(`${path}.axis must be one of ${COVERAGE_FACT_AXES.join(", ")}`);
      } else if (seenAxes.has(item.axis)) {
        errors.push(`${path}.axis duplicates an earlier coverage entry`);
      } else {
        seenAxes.add(item.axis);
      }
      if (!isInList(item.state, COVERAGE_FACT_STATES)) {
        errors.push(`${path}.state must be one of ${COVERAGE_FACT_STATES.join(", ")}`);
      }
      if (!isBoundedOpaqueId(item.reason, 1024)) {
        errors.push(`${path}.reason must be a bounded non-empty string without NUL`);
      }
      if (!isNonNegativeSafeInt(item.pendingCount)) {
        errors.push(`${path}.pendingCount must be a non-negative safe integer`);
      }
      if (typeof item.complete !== "boolean") {
        errors.push(`${path}.complete must be a boolean`);
      }
      if (item.complete === true && (item.state !== "current" || item.pendingCount !== 0)) {
        errors.push(`${path}: complete coverage entry must have state "current" and pendingCount 0`);
      }
      if (item.complete !== true || item.state !== "current" || item.pendingCount !== 0) {
        hasIncompleteAxis = true;
      }
    });
  }

  if (!Array.isArray(value.exclusions)) {
    errors.push("generation completion message.exclusions must be an array");
  } else {
    value.exclusions.forEach((item: unknown, idx: number) => {
      if (!isBoundedOpaqueId(item, 512)) {
        errors.push(`generation completion message.exclusions[${idx}] must be a bounded non-empty string without NUL`);
      }
    });
  }
  if (!Array.isArray(value.errors)) {
    errors.push("generation completion message.errors must be an array");
  } else {
    value.errors.forEach((item: unknown, idx: number) => {
      if (!isBoundedOpaqueId(item, 512)) {
        errors.push(`generation completion message.errors[${idx}] must be a bounded non-empty string without NUL`);
      }
    });
  }
  if (!isNonNegativeSafeInt(value.remainingWork)) {
    errors.push("generation completion message.remainingWork must be a non-negative safe integer");
  }
  if (state === "aborted") {
    if (!isBoundedOpaqueId(value.abortReason, 512)) {
      errors.push("generation completion message.abortReason is required and must be bounded without NUL when completionState is aborted");
    }
  } else if (value.abortReason !== undefined) {
    errors.push("generation completion message.abortReason is permitted only when completionState is aborted");
  }

  if (state === "complete") {
    if (isNonNegativeSafeInt(value.remainingWork) && value.remainingWork !== 0) {
      errors.push("generation completion message cannot declare complete with non-zero remainingWork");
    }
    if (Array.isArray(value.errors) && value.errors.length > 0) {
      errors.push("generation completion message cannot declare complete with errors");
    }
    if (!Array.isArray(value.coverage) || value.coverage.length === 0) {
      errors.push("generation completion message declaring complete must include at least one coverage summary");
    } else if (hasIncompleteAxis) {
      errors.push("generation completion message declaring complete cannot include incomplete or non-current coverage axes");
    }
    if (boundary !== null) {
      if (boundary.view === "committed" && !boundary.completeHistoryFrontier) {
        errors.push("generation completion message cannot declare complete with an incomplete history frontier");
      }
      if (boundary.view === "private" && !boundary.captureStable) {
        errors.push("generation completion message cannot declare complete with an unstable private capture");
      }
    }
  }

  if (!isPositiveInteger(value.completedAt)) {
    errors.push("generation completion message.completedAt must be a positive safe integer");
  }
  if (!isHex64Digest(value.messageDigest)) {
    errors.push("generation completion message.messageDigest must be a 64 character lowercase hex digest");
  }
  return { ok: errors.length === 0, errors };
}

export function isGenerationCompletionMessageDto(value: unknown): value is GenerationCompletionMessageDto {
  return validateGenerationCompletionMessage(value).ok;
}

export function validateGenerationCompletionOutcome(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ["generation completion outcome must be an object"] };
  const errors: string[] = [];
  if (value.controlVersion !== GENERATION_CONTROL_VERSION) {
    errors.push(`generation completion outcome.controlVersion must be "${GENERATION_CONTROL_VERSION}"`);
  }
  if (value.kind !== "generation-completion-outcome") {
    errors.push('generation completion outcome.kind must be "generation-completion-outcome"');
  }
  if (value.authority !== STORAGE_KERNEL_AUTHORITY) {
    errors.push(`generation completion outcome.authority must be "${STORAGE_KERNEL_AUTHORITY}"`);
  }
  if (!isStrictGenerationId(value.producerGenerationId)) {
    errors.push(`generation completion outcome.producerGenerationId must be a fixed-width correlation id ("gen:" plus ${GENERATION_ID_WIDTH} zero-padded digits)`);
  }
  if (!isHex64Digest(value.completionMessageDigest)) {
    errors.push("generation completion outcome.completionMessageDigest must be a 64 character lowercase hex digest");
  }
  const view = isLiveViewKind(value.view) ? value.view : null;
  if (view === null) {
    errors.push(`generation completion outcome.view must be one of ${LIVE_VIEW_KINDS.join(", ")}`);
  }
  validateViewScopedLiveScope(value.scope, view, "generation completion outcome.scope", errors);

  switch (value.status) {
    case "published": {
      rejectUnknownKeys(value, PUBLISHED_GENERATION_OUTCOME_KEYS, "generation completion outcome(published)", errors);
      if (value.published !== true) errors.push("published outcome must set published: true");
      if (!isStorageIssuedGenerationId(value.storageGenerationId)) {
        errors.push("published outcome.storageGenerationId must be a kernel-issued identity distinct from producer correlation ids");
      } else if (value.storageGenerationId === value.producerGenerationId) {
        errors.push("published outcome.storageGenerationId must not equal producerGenerationId");
      }
      if (!isBoundedOpaqueId(value.storeIncarnation, 1024)) {
        errors.push("published outcome.storeIncarnation must be a bounded non-empty string without NUL");
      }
      if (!isPositiveInteger(value.pointerVersion)) {
        errors.push("published outcome.pointerVersion must be a positive safe integer");
      }
      if (!isBoundedOpaqueId(value.publicationReceiptId, 256)) {
        errors.push("published outcome.publicationReceiptId must be a bounded non-empty string without NUL");
      }
      if (!isPositiveInteger(value.publishedAt)) {
        errors.push("published outcome.publishedAt must be a positive safe integer");
      }
      break;
    }
    case "staged": {
      rejectUnknownKeys(value, STAGED_GENERATION_OUTCOME_KEYS, "generation completion outcome(staged)", errors);
      if (value.published !== false) errors.push("staged outcome must set published: false");
      if (!isStorageIssuedGenerationId(value.storageGenerationId)) {
        errors.push("staged outcome.storageGenerationId must be a kernel-issued identity distinct from producer correlation ids");
      } else if (value.storageGenerationId === value.producerGenerationId) {
        errors.push("staged outcome.storageGenerationId must not equal producerGenerationId");
      }
      if (!isBoundedOpaqueId(value.storeIncarnation, 1024)) {
        errors.push("staged outcome.storeIncarnation must be a bounded non-empty string without NUL");
      }
      if (!isPositiveInteger(value.stagedAt)) {
        errors.push("staged outcome.stagedAt must be a positive safe integer");
      }
      break;
    }
    case "aborted": {
      rejectUnknownKeys(value, ABORTED_GENERATION_OUTCOME_KEYS, "generation completion outcome(aborted)", errors);
      if (value.published !== false) errors.push("aborted outcome must set published: false");
      if (!isBoundedOpaqueId(value.reason, 1024)) {
        errors.push("aborted outcome.reason must be a bounded non-empty string without NUL");
      }
      if (!isPositiveInteger(value.abortedAt)) {
        errors.push("aborted outcome.abortedAt must be a positive safe integer");
      }
      if (value.storageGenerationId !== undefined) {
        if (!isStorageIssuedGenerationId(value.storageGenerationId) || value.storageGenerationId === value.producerGenerationId) {
          errors.push("aborted outcome.storageGenerationId, when present, must be a kernel-issued identity distinct from producer correlation ids");
        }
      }
      if (value.storeIncarnation !== undefined && !isBoundedOpaqueId(value.storeIncarnation, 1024)) {
        errors.push("aborted outcome.storeIncarnation, when present, must be a bounded non-empty string without NUL");
      }
      break;
    }
    case "rejected": {
      rejectUnknownKeys(value, REJECTED_GENERATION_OUTCOME_KEYS, "generation completion outcome(rejected)", errors);
      if (value.published !== false) errors.push("rejected outcome must set published: false");
      if (!isInList(value.rejectionCode, GENERATION_REJECTION_CODES)) {
        errors.push(`rejected outcome.rejectionCode must be one of ${GENERATION_REJECTION_CODES.join(", ")}`);
      }
      if (!isBoundedOpaqueId(value.reason, 1024)) {
        errors.push("rejected outcome.reason must be a bounded non-empty string without NUL");
      }
      if (!isPositiveInteger(value.rejectedAt)) {
        errors.push("rejected outcome.rejectedAt must be a positive safe integer");
      }
      break;
    }
    default:
      errors.push(`generation completion outcome.status must be one of ${GENERATION_COMPLETION_OUTCOME_STATUSES.join(", ")}`);
  }
  return { ok: errors.length === 0, errors };
}

export function isGenerationCompletionOutcomeDto(value: unknown): value is GenerationCompletionOutcomeDto {
  return validateGenerationCompletionOutcome(value).ok;
}

export function isPublishedGenerationOutcome(value: unknown): value is PublishedGenerationOutcomeDto {
  return validateGenerationCompletionOutcome(value).ok &&
    (value as GenerationCompletionOutcomeDto).status === "published";
}
