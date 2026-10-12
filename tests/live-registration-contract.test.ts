// L6a (engram seat) — neutral registration contract.
// Spec: spec/SPEC_LIVE_GIT_INDEXING.md §§2–3, 10, 12 (Q4 A: explicit
// one-time activation per workspace through h2a/cluster-mesh; engram stays
// neutral and imports neither h2a nor sentropic; the host owns durable
// state). Plan: plan/09-BRANCH_LIVE_GIT_INDEXING.md, lot L6a, E cases.
//
// These cases run with no projection provider, no database and no host:
// the contract is data-pure (DTOs, exact-key validators, canonical keys)
// and registration.ts exposes pure functions only (no host state, no
// storage, no network).

import { describe, expect, it } from "vitest";
import {
  NON_ACTIVATING_LIFECYCLE_KINDS,
  canonicalCloneKey,
  validateCloneIdentity,
  validateDeclarationRevocation,
  validateWorkspaceDeclaration,
  validateWorktreeIdentity,
  type CloneIdentityDto,
  type DeclarationRevocationDto,
  type WorkspaceDeclarationDto,
} from "../engram-live/contracts.js";
import {
  classifyLifecycleEvent,
  createLiveDeclaration,
  deriveCloneIdentity,
  deriveWorktreeIdentity,
  isSameClone,
  revokeLiveDeclaration,
  reviseLiveDeclaration,
} from "../engram-live/registration.js";

function baseDeclarationInput() {
  return {
    tenant: "local:owner",
    principal: "h2a-local-owner",
    hostFingerprint: "ws:abc123",
    authorizedRoots: ["/work/repo"],
    liveCapability: "live" as const,
    policyVersion: "live-git-indexing/1",
  };
}

function freeze<T>(value: T): T {
  return Object.freeze(
    Array.isArray(value)
      ? (value as unknown[]).map((entry) =>
          entry !== null && typeof entry === "object" ? freeze(entry) : entry,
        )
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
              key,
              entry !== null && typeof entry === "object" ? freeze(entry) : entry,
            ]),
          )
        : value,
  ) as T;
}

describe("live registration contract", () => {
  it("declaration revisions and revocation are data-pure and independent of projection availability", () => {
    // No projection provider exists on these functions: fixed arity proves
    // no hidden storage/host argument is consumed.
    expect(createLiveDeclaration.length).toBe(1);
    expect(reviseLiveDeclaration.length).toBe(2);
    expect(revokeLiveDeclaration.length).toBe(2);

    const input = freeze(baseDeclarationInput());
    const first = createLiveDeclaration(input);
    expect(validateWorkspaceDeclaration(first).ok).toBe(true);
    expect(first.declarationRevision).toBe(0);
    // Frozen input is never mutated by a pure constructor.
    expect(input).toEqual(baseDeclarationInput());

    // Deterministic: the same input yields the same bytes, JSON-stable.
    const again = createLiveDeclaration(baseDeclarationInput());
    expect(again).toEqual(first);
    expect(validateWorkspaceDeclaration(JSON.parse(JSON.stringify(first))).ok).toBe(true);

    // Revision is a pure increment preserving workspace identity.
    const second = reviseLiveDeclaration(first, { authorizedRoots: ["/work/repo", "/work/other"] });
    expect(second.declarationRevision).toBe(1);
    expect(second.tenant).toBe(first.tenant);
    expect(second.principal).toBe(first.principal);
    expect(second.hostFingerprint).toBe(first.hostFingerprint);
    expect(validateWorkspaceDeclaration(second).ok).toBe(true);

    // Product binding joins later as an explicit revision, never silently.
    const third = reviseLiveDeclaration(second, {
      serverWorkspaceId: "srv-ws-1",
      serverIssuer: "https://sentropic.example",
      bindingRevision: 0,
    });
    expect(third.declarationRevision).toBe(2);
    expect(validateWorkspaceDeclaration(third).ok).toBe(true);

    // Identity fields are immutable across revisions; capability stays live.
    expect(() =>
      reviseLiveDeclaration(first, { tenant: "local:intruder" } as unknown as Record<string, unknown>),
    ).toThrow();
    expect(() =>
      reviseLiveDeclaration(first, { liveCapability: "bind" } as unknown as Record<string, unknown>),
    ).toThrow();

    // Revocation is a pure private-purge request, independent of any store.
    const revocation = revokeLiveDeclaration(third, "workspace-remove");
    expect(validateDeclarationRevocation(revocation).ok).toBe(true);
    expect(revocation.declarationRevision).toBe(third.declarationRevision);
  });

  it("equal fingerprints in two clones remain distinct", () => {
    const left = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirProjectFingerprint: "proj-fingerprint-9f",
      commonDirRealpath: "/srv/clone-one/.git",
      oidAlgorithm: "sha1",
    });
    const right = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirProjectFingerprint: "proj-fingerprint-9f",
      commonDirRealpath: "/srv/clone-two/.git",
      oidAlgorithm: "sha1",
    });
    expect(validateCloneIdentity(left).ok).toBe(true);
    expect(validateCloneIdentity(right).ok).toBe(true);
    expect(left.cloneId).not.toBe(right.cloneId);
    expect(isSameClone(left, right)).toBe(false);

    // Control: identical triple derives the identical clone.
    const same = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirProjectFingerprint: "proj-fingerprint-9f",
      commonDirRealpath: "/srv/clone-one/.git",
      oidAlgorithm: "sha1",
    });
    expect(same.cloneId).toBe(left.cloneId);
    expect(isSameClone(left, same)).toBe(true);

    // The canonical key binds scope, project fingerprint and realpath: the
    // same fingerprint under different paths never collapses.
    expect(canonicalCloneKey(left)).not.toBe(canonicalCloneKey(right));
  });

  it("linked worktrees share one common-dir clone", () => {
    const clone = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirProjectFingerprint: "proj-fingerprint-9f",
      commonDirRealpath: "/srv/repo/.git",
      oidAlgorithm: "sha256",
    });
    const main = deriveWorktreeIdentity({
      clone,
      worktreePath: "/srv/repo",
      gitDir: "/srv/repo/.git",
      worktreeFingerprint: "ws:main",
    });
    const linked = deriveWorktreeIdentity({
      clone,
      worktreePath: "/srv/repo-wt-feature",
      gitDir: "/srv/repo/.git/worktrees/feature",
      worktreeFingerprint: "ws:feature",
    });
    expect(validateWorktreeIdentity(main).ok).toBe(true);
    expect(validateWorktreeIdentity(linked).ok).toBe(true);
    // One clone shared…
    expect(main.cloneId).toBe(clone.cloneId);
    expect(linked.cloneId).toBe(clone.cloneId);
    expect(isSameClone(
      { cloneId: main.cloneId } as CloneIdentityDto,
      { cloneId: linked.cloneId } as CloneIdentityDto,
    )).toBe(true);
    // …with isolated worktree identities.
    expect(main.gitDir).not.toBe(linked.gitDir);
    expect(main.worktreeFingerprint).not.toBe(linked.worktreeFingerprint);
  });

  it("bind, upload, code-workspace creation or session events never activate or remove a declaration", () => {
    for (const kind of NON_ACTIVATING_LIFECYCLE_KINDS) {
      expect(classifyLifecycleEvent(kind)).toBe("no-activation-change");
    }
    expect(NON_ACTIVATING_LIFECYCLE_KINDS).toContain("bind");
    expect(NON_ACTIVATING_LIFECYCLE_KINDS).toContain("upload");
    expect(NON_ACTIVATING_LIFECYCLE_KINDS).toContain("session-open");
    expect(NON_ACTIVATING_LIFECYCLE_KINDS).toContain("session-end");

    // A lifecycle kind is not an opt-in: only the explicit "live"
    // capability validates as a declaration.
    for (const capability of ["bind", "upload", "session-open", "session-end", ""]) {
      const candidate: Record<string, unknown> = {
        ...baseDeclarationInput(),
        liveCapability: capability,
      };
      expect(validateWorkspaceDeclaration(candidate).ok).toBe(false);
    }
    // A lifecycle event leaves the declaration revision untouched: there is
    // no transition to apply, only the constant classification above.
    const declaration: WorkspaceDeclarationDto = createLiveDeclaration(baseDeclarationInput());
    expect(declaration.declarationRevision).toBe(0);

    expect(() =>
      classifyLifecycleEvent("activate" as unknown as (typeof NON_ACTIVATING_LIFECYCLE_KINDS)[number]),
    ).toThrow();
  });

  it("revocation requests private purge without deleting committed history", () => {
    const declaration = reviseLiveDeclaration(createLiveDeclaration(baseDeclarationInput()), {
      authorizedRoots: ["/work/repo"],
    });
    const revocation: DeclarationRevocationDto = revokeLiveDeclaration(declaration, "owner-request");
    expect(validateDeclarationRevocation(revocation).ok).toBe(true);
    expect(revocation.requestPrivatePurge.purgePrivateSnapshots).toBe(true);
    expect(revocation.requestPrivatePurge.purgeDerivedIndexes).toBe(true);
    expect(revocation.requestPrivatePurge.revokeDecryptability).toBe(true);
    // Committed history survives: no revocation field may authorize deletion.
    expect(revocation.requestPrivatePurge.preserveCommittedHistory).toBe(true);
    expect("deleteCommittedHistory" in revocation.requestPrivatePurge).toBe(false);
    expect("pruneCommits" in (revocation as unknown as Record<string, unknown>)).toBe(false);

    // Weakening the purge or dropping the preservation is rejected.
    expect(
      validateDeclarationRevocation({
        ...revocation,
        requestPrivatePurge: { ...revocation.requestPrivatePurge, preserveCommittedHistory: false },
      }).ok,
    ).toBe(false);
    expect(
      validateDeclarationRevocation({
        ...revocation,
        requestPrivatePurge: { ...revocation.requestPrivatePurge, purgePrivateSnapshots: false },
      }).ok,
    ).toBe(false);
  });

  it("validators use exact keys", () => {
    const declaration = createLiveDeclaration(baseDeclarationInput());
    expect(
      validateWorkspaceDeclaration({ ...declaration, unexpected: true }).ok,
    ).toBe(false);
    const clone = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirProjectFingerprint: "p",
      commonDirRealpath: "/srv/r/.git",
      oidAlgorithm: "sha1",
    });
    expect(validateCloneIdentity({ ...clone, unexpected: true }).ok).toBe(false);
    const worktree = deriveWorktreeIdentity({
      clone,
      worktreePath: "/srv/r",
      gitDir: "/srv/r/.git",
      worktreeFingerprint: "ws:x",
    });
    expect(validateWorktreeIdentity({ ...worktree, unexpected: true }).ok).toBe(false);
  });
});
