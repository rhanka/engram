// @sentropic/engram-live/repository — L2b clone/common-dir/worktree identity
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3–4, 12, 15; plan/09 L2b).
//
// Pure composition over the canonical L6a derivations in ./registration.js:
// the clone identity is derived ONCE from the host-resolved common dir, and
// every registered worktree derives its own isolated identity under that one
// shared clone. Equal h2a project fingerprints under two clone paths remain
// distinct clones (the fingerprint is never the clone key); linked worktrees
// sharing one common dir share one clone identity while keeping isolated
// worktree identities, per-worktree fingerprints and their own HEAD
// observation (GitNexus common-dir/checkout/immutable-content identity,
// reimplemented; spec §15). Checkout isolation is structural: nothing
// worktree-specific ever enters the clone identity, and immutable analyses
// are shared only through the clone.
//
// The host resolves every path (common dir realpath, git dirs) before
// calling; this module performs no I/O. A worktree whose git dir is neither
// the common dir nor a linked git dir under it is refused: a foreign worktree
// is never silently attributed to this clone (CodeGraph common-dir resolution,
// reimplemented; spec §15).

import {
  IDENTITY_UNCERTAINTY_STATES,
  isIdentityUncertaintyState,
  isValidQualifiedOid,
  normalizeCommonDirRealpath,
  type CloneIdentityDto,
  type IdentityUncertaintyState,
  type OidAlgorithm,
  type QualifiedOid,
  type WorktreeIdentityDto,
  type WorktreeHead,
} from "./contracts.js";
import { deriveCloneIdentity, deriveWorktreeIdentity } from "./registration.js";

/** One registered worktree as the host observed it. */
export interface WorktreeObservationInput {
  readonly worktreePath: string;
  /** Host-resolved absolute git dir of this worktree. */
  readonly gitDir: string;
  readonly worktreeFingerprint?: string;
  readonly head: WorktreeHead;
  readonly identityUncertainty?: readonly IdentityUncertaintyState[];
}

export interface RepositoryObservationInput {
  readonly hostScope: string;
  /** Host-resolved realpath of the common dir (host-local, never published). */
  readonly commonDirRealpath: string;
  /**
   * The h2a workspace `ws:` project fingerprint, as computed over the
   * common-dir history. Optional only under "missing_history" uncertainty;
   * never the clone key by itself.
   */
  readonly commonDirProjectFingerprint?: string;
  readonly oidAlgorithm: OidAlgorithm;
  readonly identityUncertainty?: readonly IdentityUncertaintyState[];
  readonly worktrees: readonly WorktreeObservationInput[];
  /** Grafted shallow boundary OIDs, host-read from the shallow file. */
  readonly shallowBoundary?: readonly string[];
}

export interface ObservedWorktreeDto {
  readonly identity: WorktreeIdentityDto;
  readonly head: WorktreeHead;
}

export interface RepositoryObservationDto {
  readonly clone: CloneIdentityDto;
  readonly worktrees: readonly ObservedWorktreeDto[];
  readonly shallowBoundary: readonly QualifiedOid[];
}

function checkUncertainty(states: readonly IdentityUncertaintyState[] | undefined): readonly IdentityUncertaintyState[] {
  const list = [...(states ?? [])];
  if (list.some((state) => !isIdentityUncertaintyState(state))) {
    throw new Error(`identity uncertainty states must be one of ${IDENTITY_UNCERTAINTY_STATES.join(", ")}`);
  }
  return list;
}

/**
 * Observe one repository: derive the shared clone identity from the common
 * dir through the ONE canonical derivation, then derive each registered
 * worktree's isolated identity under that clone (also canonical). Linked
 * worktrees therefore share the clone while each keeps an isolated identity
 * and HEAD; two clones with the same fingerprint under different realpaths
 * stay distinct because the realpath is a key component, not the fingerprint.
 */
export function observeRepository(input: RepositoryObservationInput): RepositoryObservationDto {
  if (input.worktrees.length === 0) {
    throw new Error("observeRepository requires at least one registered worktree: a clone is observed through its worktrees");
  }
  const uncertainty = checkUncertainty(input.identityUncertainty);
  // The clone is derived ONCE from the common dir: linked worktrees share it.
  const clone = deriveCloneIdentity({
    hostScope: input.hostScope,
    commonDirRealpath: input.commonDirRealpath,
    commonDirProjectFingerprint: input.commonDirProjectFingerprint,
    identityUncertainty: uncertainty,
    oidAlgorithm: input.oidAlgorithm,
  });
  const commonDir = normalizeCommonDirRealpath(input.commonDirRealpath);
  const worktrees: ObservedWorktreeDto[] = [];
  const seenWorktreeIds = new Set<string>();
  for (const worktree of input.worktrees) {
    const gitDir = normalizeCommonDirRealpath(worktree.gitDir);
    // The main worktree's git dir IS the common dir; a linked worktree's git
    // dir lives under it. Anything else belongs to another clone.
    if (gitDir !== commonDir && !gitDir.startsWith(`${commonDir}/`)) {
      throw new Error(
        `worktree ${worktree.worktreePath} git dir ${gitDir} belongs to neither the common dir nor a linked worktree under it: refusing to attribute a foreign worktree to clone ${clone.cloneId}`,
      );
    }
    const identity = deriveWorktreeIdentity({
      hostScope: input.hostScope,
      clone,
      worktreePath: worktree.worktreePath,
      gitDir: worktree.gitDir,
      worktreeFingerprint: worktree.worktreeFingerprint,
      identityUncertainty: checkUncertainty(worktree.identityUncertainty),
    });
    if (seenWorktreeIds.has(identity.worktreeId)) {
      throw new Error(`worktree identity ${identity.worktreeId} was derived twice: two registered worktrees share one git dir`);
    }
    seenWorktreeIds.add(identity.worktreeId);
    if (worktree.head.kind === "detached" &&
      !isValidQualifiedOid({ algorithm: input.oidAlgorithm, oid: worktree.head.oid })) {
      throw new Error(`detached worktree head OID ${worktree.head.oid} is not a valid ${input.oidAlgorithm} OID`);
    }
    worktrees.push({ identity, head: worktree.head });
  }
  const shallowBoundary: QualifiedOid[] = [];
  for (const oid of input.shallowBoundary ?? []) {
    const qualified = { algorithm: input.oidAlgorithm, oid };
    if (!isValidQualifiedOid(qualified)) {
      throw new Error(`shallow boundary OID ${oid} is not a valid ${input.oidAlgorithm} OID`);
    }
    shallowBoundary.push(qualified);
  }
  return { clone, worktrees, shallowBoundary };
}
