// @sentropic/engram-live/registration — pure neutral registration helpers
// (spec/SPEC_LIVE_GIT_INDEXING.md §§2–3, 10, 12; plan/09 L6a; owner Q4 A).
//
// Pure functions over ./contracts.js DTOs: declaration creation, revision,
// revocation, common-dir clone derivation, worktree derivation, clone
// equality and lifecycle classification. No host state, no storage, no
// network, no projection provider: every function is deterministic over its
// arguments, never mutates its inputs, and keeps no module-level mutable
// state. Durable declarations, replay, cancellation and purge execution
// belong to the h2a (H) and cluster-mesh/sentropic (S) hosts consuming the
// contract documented in ./contracts.js.

import { createHash } from "node:crypto";
import {
  canonicalCloneKey,
  isNonActivatingLifecycleKind,
  isRevocationReason,
  normalizeCommonDirRealpath,
  validateCloneIdentity,
  validateDeclarationRevocation,
  validateWorkspaceDeclaration,
  validateWorktreeIdentity,
  type CloneIdentityDto,
  type DeclarationRevocationDto,
  type NonActivatingLifecycleKind,
  type OidAlgorithm,
  type RevocationReason,
  type WorkspaceDeclarationDto,
  type WorktreeIdentityDto,
} from "./contracts.js";

/** Input for an explicit live declaration (revision starts at 0). */
export interface CreateLiveDeclarationInput {
  readonly tenant: string;
  readonly principal: string;
  readonly hostFingerprint: string;
  readonly authorizedRoots: readonly string[];
  readonly liveCapability: "live";
  readonly policyVersion: string;
  readonly serverWorkspaceId?: string;
  readonly serverIssuer?: string;
  readonly bindingRevision?: number;
}

/** Patchable declaration fields. Identity (tenant, principal, hostFingerprint,
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
  readonly commonDirProjectFingerprint: string;
  readonly commonDirRealpath: string;
  readonly oidAlgorithm: OidAlgorithm;
}

/** Input for deriving a worktree identity under an already derived clone. */
export interface DeriveWorktreeIdentityInput {
  readonly clone: Pick<CloneIdentityDto, "cloneId">;
  readonly worktreePath: string;
  readonly gitDir: string;
  readonly worktreeFingerprint: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sha256Hex(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Create the initial live declaration for one workspace. Requires the
 * explicit "live" capability: any other opt-in value (bind, upload, session
 * kinds) is refused, so no lifecycle event can implicitly activate live.
 */
export function createLiveDeclaration(input: CreateLiveDeclarationInput): WorkspaceDeclarationDto {
  if (!isRecord(input as unknown as Record<string, unknown>)) {
    throw new Error("createLiveDeclaration requires a declaration input object");
  }
  const declaration: WorkspaceDeclarationDto = {
    tenant: input.tenant,
    principal: input.principal,
    hostFingerprint: input.hostFingerprint,
    authorizedRoots: [...input.authorizedRoots],
    liveCapability: input.liveCapability,
    policyVersion: input.policyVersion,
    declarationRevision: 0,
    ...(input.serverWorkspaceId !== undefined ? { serverWorkspaceId: input.serverWorkspaceId } : {}),
    ...(input.serverIssuer !== undefined ? { serverIssuer: input.serverIssuer } : {}),
    ...(input.bindingRevision !== undefined ? { bindingRevision: input.bindingRevision } : {}),
  };
  const checked = validateWorkspaceDeclaration(declaration);
  if (!checked.ok) {
    throw new Error(`invalid live workspace declaration: ${checked.errors.join("; ")}`);
  }
  return declaration;
}

/**
 * Revise a declaration as a pure revision increment. The revision grows by
 * exactly one; tenant, principal, hostFingerprint and the live capability
 * are immutable. A changed serverWorkspaceId requires a fresh
 * bindingRevision (revalidation); a bindingRevision without a server
 * workspace is refused. The host must additionally refuse to redirect
 * in-flight collection/publication when a rebind lands.
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
  const next: WorkspaceDeclarationDto = {
    ...previous,
    authorizedRoots: patch.authorizedRoots !== undefined ? [...patch.authorizedRoots] : [...previous.authorizedRoots],
    policyVersion: patch.policyVersion !== undefined ? patch.policyVersion : previous.policyVersion,
    serverWorkspaceId: patch.serverWorkspaceId !== undefined
      ? patch.serverWorkspaceId
      : previous.serverWorkspaceId,
    serverIssuer: patch.serverIssuer !== undefined ? patch.serverIssuer : previous.serverIssuer,
    bindingRevision: patch.bindingRevision !== undefined ? patch.bindingRevision : previous.bindingRevision,
    declarationRevision: previous.declarationRevision + 1,
  };
  if (
    patch.serverWorkspaceId !== undefined &&
    patch.serverWorkspaceId !== previous.serverWorkspaceId &&
    patch.bindingRevision === undefined
  ) {
    throw new Error("reviseLiveDeclaration requires a fresh bindingRevision when the server workspace binding changes (revalidation)");
  }
  const checked = validateWorkspaceDeclaration(next);
  if (!checked.ok) {
    throw new Error(`invalid revised declaration: ${checked.errors.join("; ")}`);
  }
  return next;
}

/**
 * Revoke one declaration revision as a pure private-purge request. The
 * returned DTO asks the host to stop work, reject delayed jobs and purge
 * private snapshots, derived indexes and decryptability, while preserving
 * authorized committed history. Revocation deletes no committed facts.
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
    tenant: declaration.tenant,
    hostFingerprint: declaration.hostFingerprint,
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
 * Derive the clone identity for one common-dir. The triple (hostScope,
 * common-dir project fingerprint, host-resolved common-dir realpath) is
 * the clone key: equal fingerprints under different realpaths derive
 * distinct opaque cloneIds, while linked worktrees sharing one common-dir
 * derive the same clone. The realpath stays host-local; only cloneId is
 * shared. Deterministic and free of I/O.
 */
export function deriveCloneIdentity(input: DeriveCloneIdentityInput): CloneIdentityDto {
  if (!isRecord(input as unknown as Record<string, unknown>)) {
    throw new Error("deriveCloneIdentity requires a clone input object");
  }
  if (!isNonEmptyString(input.hostScope)) {
    throw new Error("deriveCloneIdentity requires a non-empty hostScope");
  }
  if (!isNonEmptyString(input.commonDirProjectFingerprint)) {
    throw new Error("deriveCloneIdentity requires a non-empty commonDirProjectFingerprint");
  }
  if (!isNonEmptyString(input.commonDirRealpath)) {
    throw new Error("deriveCloneIdentity requires a non-empty commonDirRealpath");
  }
  if (input.oidAlgorithm !== "sha1" && input.oidAlgorithm !== "sha256") {
    throw new Error('deriveCloneIdentity requires oidAlgorithm "sha1" or "sha256"');
  }
  const normalizedRealpath = normalizeCommonDirRealpath(input.commonDirRealpath);
  const canonical = canonicalCloneKey({
    hostScope: input.hostScope,
    commonDirProjectFingerprint: input.commonDirProjectFingerprint,
    commonDirRealpath: normalizedRealpath,
  });
  const identity: CloneIdentityDto = {
    hostScope: input.hostScope,
    commonDirProjectFingerprint: input.commonDirProjectFingerprint,
    commonDirRealpath: normalizedRealpath,
    cloneId: `clone:${sha256Hex(canonical)}`,
    oidAlgorithm: input.oidAlgorithm,
  };
  const checked = validateCloneIdentity(identity);
  if (!checked.ok) {
    throw new Error(`invalid derived clone identity: ${checked.errors.join("; ")}`);
  }
  return identity;
}

/**
 * Derive the identity of one worktree under an already derived clone.
 * Worktrees of one clone share cloneId and keep isolated git-dir,
 * fingerprint and path.
 */
export function deriveWorktreeIdentity(input: DeriveWorktreeIdentityInput): WorktreeIdentityDto {
  if (!isRecord(input as unknown as Record<string, unknown>)) {
    throw new Error("deriveWorktreeIdentity requires a worktree input object");
  }
  if (!isRecord(input.clone as unknown as Record<string, unknown>) || !isNonEmptyString(input.clone.cloneId)) {
    throw new Error("deriveWorktreeIdentity requires a derived clone carrying cloneId");
  }
  if (!isNonEmptyString(input.worktreePath)) {
    throw new Error("deriveWorktreeIdentity requires a non-empty worktreePath");
  }
  if (!isNonEmptyString(input.gitDir)) {
    throw new Error("deriveWorktreeIdentity requires a non-empty gitDir");
  }
  if (!isNonEmptyString(input.worktreeFingerprint)) {
    throw new Error("deriveWorktreeIdentity requires a non-empty worktreeFingerprint");
  }
  const identity: WorktreeIdentityDto = {
    cloneId: input.clone.cloneId,
    worktreePath: input.worktreePath,
    gitDir: input.gitDir,
    worktreeFingerprint: input.worktreeFingerprint,
  };
  const checked = validateWorktreeIdentity(identity);
  if (!checked.ok) {
    throw new Error(`invalid derived worktree identity: ${checked.errors.join("; ")}`);
  }
  return identity;
}

type CloneLike = Pick<CloneIdentityDto, "cloneId"> &
  Partial<Pick<CloneIdentityDto, "hostScope" | "commonDirProjectFingerprint" | "commonDirRealpath">>;

/**
 * Decide whether two clone references denote the same clone. When both
 * carry the full (hostScope, project fingerprint, realpath) triple the
 * triple decides (realpaths normalize identically to derivation);
 * otherwise the opaque cloneId decides.
 */
export function isSameClone(a: CloneLike, b: CloneLike): boolean {
  const aFull = isNonEmptyString(a.hostScope) &&
    isNonEmptyString(a.commonDirProjectFingerprint) &&
    isNonEmptyString(a.commonDirRealpath);
  const bFull = isNonEmptyString(b.hostScope) &&
    isNonEmptyString(b.commonDirProjectFingerprint) &&
    isNonEmptyString(b.commonDirRealpath);
  if (aFull && bFull) {
    return canonicalCloneKey({
      hostScope: a.hostScope as string,
      commonDirProjectFingerprint: a.commonDirProjectFingerprint as string,
      commonDirRealpath: a.commonDirRealpath as string,
    }) === canonicalCloneKey({
      hostScope: b.hostScope as string,
      commonDirProjectFingerprint: b.commonDirProjectFingerprint as string,
      commonDirRealpath: b.commonDirRealpath as string,
    });
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
