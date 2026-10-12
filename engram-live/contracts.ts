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
