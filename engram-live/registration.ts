// @sentropic/engram-live/registration — pure neutral registration helpers
// (spec/SPEC_LIVE_GIT_INDEXING.md §§2–3, 10, 12; plan/09 L6a; owner Q4 A).
//
// Pure functions over ./contracts.js DTOs: declaration creation, revision,
// revocation, the ONE canonical clone/worktree/declaration identity
// derivation, clone equality and lifecycle classification. No host state, no
// storage, no network, no projection provider: every function is
// deterministic over its arguments, never mutates its inputs, and keeps no
// module-level mutable state. Durable declarations, replay, cancellation
// and purge execution belong to the h2a (H) and cluster-mesh/sentropic (S)
// hosts consuming the contract documented in ./contracts.js.
//
// Both seats mint their opaque ids through these functions (canonicalIdKey
// in ./contracts.js + the sha256 minting below): identical identity
// components give byte-identical cloneId/worktreeId/declarationId on every
// side, so identity equality is comparison by canonical identifier. h2a
// identifiers persisted before this freeze were derived from
// newline-joined components; re-derive and rewrite them locally
// (see the MIGRATION note in ./contracts.js).

import { createHash } from "node:crypto";
import {
  ID_PREFIXES,
  IDENTITY_UNCERTAINTY_STATES,
  canonicalIdKey,
  isIdentityUncertaintyState,
  isNonActivatingLifecycleKind,
  isRevocationReason,
  normalizeCommonDirRealpath,
  validateCloneIdentity,
  validateDeclarationRevocation,
  validateWorkspaceDeclaration,
  validateWorktreeIdentity,
  INITIAL_BINDING_REVISION,
  INITIAL_DECLARATION_REVISION,
  type CloneIdentityDto,
  type DeclarationRevocationDto,
  type IdentityUncertaintyState,
  type NonActivatingLifecycleKind,
  type OidAlgorithm,
  type RevocationReason,
  type WorkspaceDeclarationDto,
  type WorktreeIdentityDto,
} from "./contracts.js";

/** Input for an explicit live declaration (revision starts at INITIAL_DECLARATION_REVISION). */
export interface CreateLiveDeclarationInput {
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
  readonly serverWorkspaceId?: string;
  readonly serverIssuer?: string;
  readonly bindingRevision?: number;
}

/** Patchable declaration fields. Identity (tenant, principal,
 * hostFingerprint, the declarationId/cloneId/worktreeId triangle,
 * liveCapability, declarationRevision) is immutable across revisions. */
export interface LiveDeclarationPatch {
  readonly authorizedRoots?: readonly string[];
  readonly policyVersion?: string;
  readonly serverWorkspaceId?: string;
  readonly serverIssuer?: string;
  readonly bindingRevision?: number;
}

const LIVE_DECLARATION_PATCH_KEYS: readonly string[] = [
  "authorizedRoots",
  "policyVersion",
  "serverWorkspaceId",
  "serverIssuer",
  "bindingRevision",
];

/** Input for deriving a clone identity from host-resolved components. */
export interface DeriveCloneIdentityInput {
  readonly hostScope: string;
  readonly commonDirRealpath: string;
  readonly commonDirProjectFingerprint?: string;
  readonly identityUncertainty?: readonly IdentityUncertaintyState[];
  readonly oidAlgorithm: OidAlgorithm;
}

/** Input for deriving a worktree identity under an already derived clone. */
export interface DeriveWorktreeIdentityInput {
  readonly hostScope: string;
  readonly clone: Pick<CloneIdentityDto, "cloneId">;
  readonly worktreePath: string;
  readonly gitDir: string;
  readonly worktreeFingerprint?: string;
  readonly identityUncertainty?: readonly IdentityUncertaintyState[];
}

/** Input for deriving the identity of one declaration under a clone/worktree. */
export interface DeriveDeclarationIdentityInput {
  readonly hostScope: string;
  readonly clone: Pick<CloneIdentityDto, "cloneId">;
  readonly worktree: Pick<WorktreeIdentityDto, "worktreeId">;
}

/** Opaque declaration identity: the declaration and its clone/worktree attachment. */
export interface DeclarationIdentityDto {
  readonly declarationId: string;
  readonly cloneId: string;
  readonly worktreeId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCloneIdReference(value: unknown): value is string {
  return isNonEmptyString(value) && value.startsWith(ID_PREFIXES.clone);
}

function isWorktreeIdReference(value: unknown): value is string {
  return isNonEmptyString(value) && value.startsWith(ID_PREFIXES.worktree);
}

function sha256Hex(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function checkUncertainty(
  uncertainty: readonly IdentityUncertaintyState[] | undefined,
): readonly IdentityUncertaintyState[] {
  const states = [...(uncertainty ?? [])];
  if (states.some((state) => !isIdentityUncertaintyState(state))) {
    throw new Error(
      `identity uncertainty states must be one of ${IDENTITY_UNCERTAINTY_STATES.join(", ")}`,
    );
  }
  return states;
}

/**
 * Create the initial live declaration for one workspace. Requires the
 * explicit "live" capability and the full identity triangle
 * (declarationId/cloneId/worktreeId, minted by the canonical derivation
 * below): any other opt-in value (bind, upload, session kinds) is refused,
 * so no lifecycle event can implicitly activate live. The declaration
 * revision starts at the frozen INITIAL_DECLARATION_REVISION.
 */
export function createLiveDeclaration(input: CreateLiveDeclarationInput): WorkspaceDeclarationDto {
  if (!isRecord(input as unknown as Record<string, unknown>)) {
    throw new Error("createLiveDeclaration requires a declaration input object");
  }
  const declaration: WorkspaceDeclarationDto = {
    tenant: input.tenant,
    principal: input.principal,
    ...(input.hostFingerprint !== undefined ? { hostFingerprint: input.hostFingerprint } : {}),
    identityUncertainty: [...input.identityUncertainty],
    declarationId: input.declarationId,
    cloneId: input.cloneId,
    worktreeId: input.worktreeId,
    authorizedRoots: [...input.authorizedRoots],
    liveCapability: input.liveCapability,
    policyVersion: input.policyVersion,
    declarationRevision: INITIAL_DECLARATION_REVISION,
    ...(input.serverWorkspaceId !== undefined ? { serverWorkspaceId: input.serverWorkspaceId } : {}),
    ...(input.serverIssuer !== undefined ? { serverIssuer: input.serverIssuer } : {}),
    ...(input.bindingRevision !== undefined ? { bindingRevision: input.bindingRevision } : {}),
  };
  if (input.bindingRevision !== undefined && input.bindingRevision !== INITIAL_BINDING_REVISION) {
    throw new Error(
      `createLiveDeclaration requires the first product binding to carry bindingRevision ${INITIAL_BINDING_REVISION} (FROZEN L6a convention; rebinds and revalidations grow strictly from there)`,
    );
  }
  const checked = validateWorkspaceDeclaration(declaration);
  if (!checked.ok) {
    throw new Error(`invalid live workspace declaration: ${checked.errors.join("; ")}`);
  }
  return declaration;
}

/**
 * Revise a declaration as a pure revision increment. The revision grows by
 * exactly one; tenant, principal, hostFingerprint, the identity triangle
 * and the live capability are immutable. The product binding is the
 * complete (serverWorkspaceId, serverIssuer, bindingRevision) triplet.
 * A revision outside the binding (roots, policy version) PRESERVES the
 * binding: no renewal is imposed. Only a change of serverWorkspaceId or
 * serverIssuer, or an explicit bindingRevision revalidation, renews the
 * binding — and then strictly increasingly: the first binding carries
 * exactly INITIAL_BINDING_REVISION, and every rebind/revalidation carries
 * a strictly greater bindingRevision; binding revisions never go
 * backwards. The host must additionally refuse to redirect in-flight
 * collection/publication when a rebind lands.
 */
export function reviseLiveDeclaration(
  previous: WorkspaceDeclarationDto,
  patch: LiveDeclarationPatch,
): WorkspaceDeclarationDto {
  const previousCheck = validateWorkspaceDeclaration(previous);
  if (!previousCheck.ok) {
    throw new Error(`invalid previous declaration: ${previousCheck.errors.join("; ")}`);
  }
  if (!isRecord(patch as unknown as Record<string, unknown>)) {
    throw new Error("reviseLiveDeclaration requires a patch object");
  }
  const patchRecord = patch as unknown as Record<string, unknown>;
  for (const key of Object.keys(patchRecord)) {
    if (!LIVE_DECLARATION_PATCH_KEYS.includes(key)) {
      throw new Error(`reviseLiveDeclaration refuses patch key "${key}": identity fields are immutable across revisions`);
    }
  }
  const workspaceChanged = patch.serverWorkspaceId !== undefined &&
    patch.serverWorkspaceId !== previous.serverWorkspaceId;
  const issuerChanged = patch.serverIssuer !== undefined &&
    patch.serverIssuer !== previous.serverIssuer;
  const bindingTouched = patch.bindingRevision !== undefined || workspaceChanged || issuerChanged;
  // A revision outside the product binding preserves it; only a workspace or
  // issuer change, or an explicit revalidation, renews it — strictly
  // increasingly, starting the first binding at INITIAL_BINDING_REVISION.
  let nextBindingRevision = previous.bindingRevision;
  if (bindingTouched) {
    if (patch.bindingRevision === undefined) {
      throw new Error("reviseLiveDeclaration requires a fresh strictly increasing bindingRevision when the server workspace or issuer changes (revalidation)");
    }
    if (previous.bindingRevision === undefined) {
      if (patch.bindingRevision !== INITIAL_BINDING_REVISION) {
        throw new Error(`reviseLiveDeclaration requires the first product binding to carry bindingRevision ${INITIAL_BINDING_REVISION} (FROZEN L6a convention)`);
      }
    } else if (patch.bindingRevision <= previous.bindingRevision) {
      throw new Error("reviseLiveDeclaration requires a strictly increasing bindingRevision (binding revisions are monotonic)");
    }
    nextBindingRevision = patch.bindingRevision;
  }
  const next: WorkspaceDeclarationDto = {
    ...previous,
    authorizedRoots: patch.authorizedRoots !== undefined ? [...patch.authorizedRoots] : [...previous.authorizedRoots],
    policyVersion: patch.policyVersion !== undefined ? patch.policyVersion : previous.policyVersion,
    serverWorkspaceId: patch.serverWorkspaceId !== undefined
      ? patch.serverWorkspaceId
      : previous.serverWorkspaceId,
    serverIssuer: patch.serverIssuer !== undefined ? patch.serverIssuer : previous.serverIssuer,
    bindingRevision: nextBindingRevision,
    declarationRevision: previous.declarationRevision + 1,
  };
  const checked = validateWorkspaceDeclaration(next);
  if (!checked.ok) {
    throw new Error(`invalid revised declaration: ${checked.errors.join("; ")}`);
  }
  return next;
}

/**
 * Revoke exactly one declaration as a pure private-purge request. The
 * returned DTO names the single target by its opaque declarationId and
 * carries the declaration's cloneId/worktreeId attachment and revision, so
 * the recipient can never confuse two declarations of one tenant that
 * happen to share public fingerprints or revisions. The host stops work,
 * rejects delayed jobs and purges private snapshots, derived indexes and
 * decryptability, while preserving authorized committed history.
 * Revocation deletes no committed facts.
 */
export function revokeLiveDeclaration(
  declaration: WorkspaceDeclarationDto,
  reason: RevocationReason,
): DeclarationRevocationDto {
  const checked = validateWorkspaceDeclaration(declaration);
  if (!checked.ok) {
    throw new Error(`invalid declaration: ${checked.errors.join("; ")}`);
  }
  if (!isRevocationReason(reason)) {
    throw new Error(`invalid revocation reason: ${String(reason)}`);
  }
  const revocation: DeclarationRevocationDto = {
    declarationId: declaration.declarationId,
    tenant: declaration.tenant,
    cloneId: declaration.cloneId,
    worktreeId: declaration.worktreeId,
    declarationRevision: declaration.declarationRevision,
    reason,
    requestPrivatePurge: {
      purgePrivateSnapshots: true,
      purgeDerivedIndexes: true,
      revokeDecryptability: true,
      preserveCommittedHistory: true,
    },
  };
  const revocationCheck = validateDeclarationRevocation(revocation);
  if (!revocationCheck.ok) {
    throw new Error(`invalid revocation: ${revocationCheck.errors.join("; ")}`);
  }
  return revocation;
}

/**
 * Derive the clone identity for one common-dir — the ONE canonical clone
 * derivation. The key components (hostScope, normalized common-dir
 * realpath, common-dir project fingerprint) serialize through
 * canonicalIdKey (unambiguous, NUL-refusing) and hash to the opaque
 * cloneId: equal fingerprints under different realpaths derive distinct
 * clones, while linked worktrees sharing one common-dir derive the same
 * clone. The fingerprint may be absent only under explicit
 * "missing_history" uncertainty; the hostScope + realpath components keep
 * clones distinct even then (LIVE §12). The realpath stays host-local;
 * only cloneId is shared. Deterministic and free of I/O.
 */
export function deriveCloneIdentity(input: DeriveCloneIdentityInput): CloneIdentityDto {
  if (!isRecord(input as unknown as Record<string, unknown>)) {
    throw new Error("deriveCloneIdentity requires a clone input object");
  }
  if (!isNonEmptyString(input.hostScope)) {
    throw new Error("deriveCloneIdentity requires a non-empty hostScope");
  }
  if (!isNonEmptyString(input.commonDirRealpath)) {
    throw new Error("deriveCloneIdentity requires a non-empty commonDirRealpath");
  }
  const uncertainty = checkUncertainty(input.identityUncertainty);
  if (
    input.commonDirProjectFingerprint !== undefined &&
    !isNonEmptyString(input.commonDirProjectFingerprint)
  ) {
    throw new Error("deriveCloneIdentity requires a non-empty commonDirProjectFingerprint when present");
  }
  if (
    input.commonDirProjectFingerprint === undefined &&
    !uncertainty.includes("missing_history")
  ) {
    throw new Error('deriveCloneIdentity omits commonDirProjectFingerprint only under explicit "missing_history" uncertainty');
  }
  if (input.oidAlgorithm !== "sha1" && input.oidAlgorithm !== "sha256") {
    throw new Error('deriveCloneIdentity requires oidAlgorithm "sha1" or "sha256"');
  }
  const normalizedRealpath = normalizeCommonDirRealpath(input.commonDirRealpath);
  // canonicalIdKey refuses NUL inside any component.
  const canonical = canonicalIdKey("clone", [
    input.hostScope,
    normalizedRealpath,
    input.commonDirProjectFingerprint ?? "",
  ]);
  const identity: CloneIdentityDto = {
    hostScope: input.hostScope,
    commonDirRealpath: normalizedRealpath,
    ...(input.commonDirProjectFingerprint !== undefined
      ? { commonDirProjectFingerprint: input.commonDirProjectFingerprint }
      : {}),
    cloneId: `${ID_PREFIXES.clone}${sha256Hex(canonical)}`,
    oidAlgorithm: input.oidAlgorithm,
    identityUncertainty: [...uncertainty],
  };
  const checked = validateCloneIdentity(identity);
  if (!checked.ok) {
    throw new Error(`invalid derived clone identity: ${checked.errors.join("; ")}`);
  }
  return identity;
}

/**
 * Derive the identity of one worktree under an already derived clone —
 * the ONE canonical worktree derivation. Worktrees of one clone share
 * cloneId and keep an isolated host-scoped worktreeId plus per-worktree
 * git-dir, fingerprint and path. The worktree fingerprint may be absent
 * only under explicit "missing_history" uncertainty (LIVE §12).
 */
export function deriveWorktreeIdentity(input: DeriveWorktreeIdentityInput): WorktreeIdentityDto {
  if (!isRecord(input as unknown as Record<string, unknown>)) {
    throw new Error("deriveWorktreeIdentity requires a worktree input object");
  }
  if (!isRecord(input.clone as unknown as Record<string, unknown>) || !isCloneIdReference(input.clone.cloneId)) {
    throw new Error("deriveWorktreeIdentity requires a derived clone carrying a canonical cloneId");
  }
  if (!isNonEmptyString(input.hostScope)) {
    throw new Error("deriveWorktreeIdentity requires a non-empty hostScope");
  }
  if (!isNonEmptyString(input.worktreePath)) {
    throw new Error("deriveWorktreeIdentity requires a non-empty worktreePath");
  }
  if (!isNonEmptyString(input.gitDir)) {
    throw new Error("deriveWorktreeIdentity requires a non-empty gitDir");
  }
  const uncertainty = checkUncertainty(input.identityUncertainty);
  if (
    input.worktreeFingerprint !== undefined &&
    !isNonEmptyString(input.worktreeFingerprint)
  ) {
    throw new Error("deriveWorktreeIdentity requires a non-empty worktreeFingerprint when present");
  }
  if (input.worktreeFingerprint === undefined && !uncertainty.includes("missing_history")) {
    throw new Error('deriveWorktreeIdentity omits worktreeFingerprint only under explicit "missing_history" uncertainty');
  }
  const canonical = canonicalIdKey("worktree", [input.hostScope, input.gitDir]);
  const identity: WorktreeIdentityDto = {
    cloneId: input.clone.cloneId,
    worktreeId: `${ID_PREFIXES.worktree}${sha256Hex(canonical)}`,
    worktreePath: input.worktreePath,
    gitDir: input.gitDir,
    ...(input.worktreeFingerprint !== undefined
      ? { worktreeFingerprint: input.worktreeFingerprint }
      : {}),
    identityUncertainty: [...uncertainty],
  };
  const checked = validateWorktreeIdentity(identity);
  if (!checked.ok) {
    throw new Error(`invalid derived worktree identity: ${checked.errors.join("; ")}`);
  }
  return identity;
}

/**
 * Derive the identity of one declaration — the ONE canonical declaration
 * derivation. One declaration per activated worktree: the declarationId
 * binds the host scope, the clone and the worktree, so two worktrees of
 * one clone (and two clones of one project) derive distinct declarationIds
 * even without fingerprints. Stable across every revision of the same
 * declaration. Deterministic and free of I/O.
 */
export function deriveDeclarationIdentity(input: DeriveDeclarationIdentityInput): DeclarationIdentityDto {
  if (!isRecord(input as unknown as Record<string, unknown>)) {
    throw new Error("deriveDeclarationIdentity requires a declaration identity input object");
  }
  if (!isRecord(input.clone as unknown as Record<string, unknown>) || !isCloneIdReference(input.clone.cloneId)) {
    throw new Error("deriveDeclarationIdentity requires a derived clone carrying a canonical cloneId");
  }
  if (!isRecord(input.worktree as unknown as Record<string, unknown>) || !isWorktreeIdReference(input.worktree.worktreeId)) {
    throw new Error("deriveDeclarationIdentity requires a derived worktree carrying a canonical worktreeId");
  }
  if (!isNonEmptyString(input.hostScope)) {
    throw new Error("deriveDeclarationIdentity requires a non-empty hostScope");
  }
  const canonical = canonicalIdKey("declaration", [
    input.hostScope,
    input.clone.cloneId,
    input.worktree.worktreeId,
  ]);
  const identity: DeclarationIdentityDto = {
    declarationId: `${ID_PREFIXES.declaration}${sha256Hex(canonical)}`,
    cloneId: input.clone.cloneId,
    worktreeId: input.worktree.worktreeId,
  };
  return identity;
}

/**
 * Decide whether two clone references denote the same clone, by canonical
 * identifier only: the cloneId minted by the shared canonical derivation is
 * the clone identity, so the comparison is an equivalence (transitive and
 * consistent between full DTOs and opaque references). Throws when either
 * reference lacks a cloneId — equality is never guessed from components.
 */
export function isSameClone(
  a: Pick<CloneIdentityDto, "cloneId">,
  b: Pick<CloneIdentityDto, "cloneId">,
): boolean {
  if (!isNonEmptyString(a.cloneId) || !isNonEmptyString(b.cloneId)) {
    throw new Error("isSameClone compares canonical clone ids: both references must carry a non-empty cloneId");
  }
  return a.cloneId === b.cloneId;
}

/**
 * Classify a host lifecycle event against live declarations. Bind, upload,
 * code-workspace creation and session open/end never activate or remove a
 * declaration: the only outcome is "no-activation-change". Unknown kinds
 * are refused.
 */
export function classifyLifecycleEvent(kind: NonActivatingLifecycleKind): "no-activation-change" {
  if (!isNonActivatingLifecycleKind(kind)) {
    throw new Error(`unknown lifecycle kind: ${String(kind)}`);
  }
  return "no-activation-change";
}
