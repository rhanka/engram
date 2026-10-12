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
//
// The tests marked REVIEW REPRODUCTION are the red tests for the Sol 6.1
// and Sol 2 review findings: one per BLOQUANT/MAJEUR constat of
// REVIEW-L6a-sol.out and REVIEW-L6a-sol2.out. They fail against the
// rejected contract (identical revocations for distinct declarations,
// inexpressible identity uncertainty, partial/bypassable binding,
// diverging derivations with an intransitive equality, a binding renewed
// by every revision, and a first binding at any revision other than 1)
// and pin the corrected contract.

import { describe, expect, it } from "vitest";
import {
  IDENTITY_UNCERTAINTY_STATES,
  ID_PREFIXES,
  INITIAL_BINDING_REVISION,
  INITIAL_DECLARATION_REVISION,
  NON_ACTIVATING_LIFECYCLE_KINDS,
  POLICY_VERSION,
  canonicalIdKey,
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
  deriveDeclarationIdentity,
  deriveWorktreeIdentity,
  isSameClone,
  revokeLiveDeclaration,
  reviseLiveDeclaration,
} from "../engram-live/registration.js";

function baseIdentity() {
  const clone = deriveCloneIdentity({
    hostScope: "host:a",
    commonDirRealpath: "/srv/repo/.git",
    commonDirProjectFingerprint: "proj-fingerprint-9f",
    identityUncertainty: [],
    oidAlgorithm: "sha1",
  });
  const worktree = deriveWorktreeIdentity({
    hostScope: "host:a",
    clone,
    worktreePath: "/work/repo",
    gitDir: "/srv/repo/.git",
    worktreeFingerprint: "ws:abc123",
    identityUncertainty: [],
  });
  const declaration = deriveDeclarationIdentity({ hostScope: "host:a", clone, worktree });
  return { clone, worktree, declaration };
}

function baseDeclarationInput() {
  const { declaration } = baseIdentity();
  return {
    tenant: "local:owner",
    principal: "h2a-local-owner",
    hostFingerprint: "ws:abc123",
    identityUncertainty: [] as const,
    declarationId: declaration.declarationId,
    cloneId: declaration.cloneId,
    worktreeId: declaration.worktreeId,
    authorizedRoots: ["/work/repo"],
    liveCapability: "live" as const,
    policyVersion: POLICY_VERSION,
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
    expect(first.declarationRevision).toBe(INITIAL_DECLARATION_REVISION);
    // Frozen input is never mutated by a pure constructor.
    expect(input).toEqual(baseDeclarationInput());

    // Deterministic: the same input yields the same bytes, JSON-stable.
    const again = createLiveDeclaration(baseDeclarationInput());
    expect(again).toEqual(first);
    expect(validateWorkspaceDeclaration(JSON.parse(JSON.stringify(first))).ok).toBe(true);

    // Revision is a pure increment preserving the identity triangle.
    const second = reviseLiveDeclaration(first, { authorizedRoots: ["/work/repo", "/work/other"] });
    expect(second.declarationRevision).toBe(INITIAL_DECLARATION_REVISION + 1);
    expect(second.tenant).toBe(first.tenant);
    expect(second.principal).toBe(first.principal);
    expect(second.hostFingerprint).toBe(first.hostFingerprint);
    expect(second.declarationId).toBe(first.declarationId);
    expect(second.cloneId).toBe(first.cloneId);
    expect(second.worktreeId).toBe(first.worktreeId);
    expect(validateWorkspaceDeclaration(second).ok).toBe(true);

    // Product binding joins later as an explicit revision, never silently,
    // and is the complete server/issuer/revision triplet.
    const third = reviseLiveDeclaration(second, {
      serverWorkspaceId: "srv-ws-1",
      serverIssuer: "https://sentropic.example",
      bindingRevision: INITIAL_BINDING_REVISION,
    });
    expect(third.declarationRevision).toBe(INITIAL_DECLARATION_REVISION + 2);
    expect(third.bindingRevision).toBe(INITIAL_BINDING_REVISION);
    expect(validateWorkspaceDeclaration(third).ok).toBe(true);

    // Identity fields are immutable across revisions; capability stays live.
    expect(() =>
      reviseLiveDeclaration(first, { tenant: "local:intruder" } as unknown as Record<string, unknown>),
    ).toThrow();
    expect(() =>
      reviseLiveDeclaration(first, { liveCapability: "bind" } as unknown as Record<string, unknown>),
    ).toThrow();

    // Revocation is a pure private-purge request naming its exact target.
    const revocation = revokeLiveDeclaration(third, "workspace-remove");
    expect(validateDeclarationRevocation(revocation).ok).toBe(true);
    expect(revocation.declarationId).toBe(third.declarationId);
    expect(revocation.declarationRevision).toBe(third.declarationRevision);
  });

  it("equal fingerprints in two clones remain distinct", () => {
    const left = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirRealpath: "/srv/clone-one/.git",
      commonDirProjectFingerprint: "proj-fingerprint-9f",
      identityUncertainty: [],
      oidAlgorithm: "sha1",
    });
    const right = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirRealpath: "/srv/clone-two/.git",
      commonDirProjectFingerprint: "proj-fingerprint-9f",
      identityUncertainty: [],
      oidAlgorithm: "sha1",
    });
    expect(validateCloneIdentity(left).ok).toBe(true);
    expect(validateCloneIdentity(right).ok).toBe(true);
    expect(left.cloneId).not.toBe(right.cloneId);
    expect(isSameClone(left, right)).toBe(false);

    // Control: identical triple derives the identical clone.
    const same = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirRealpath: "/srv/clone-one/.git",
      commonDirProjectFingerprint: "proj-fingerprint-9f",
      identityUncertainty: [],
      oidAlgorithm: "sha1",
    });
    expect(same.cloneId).toBe(left.cloneId);
    expect(isSameClone(left, same)).toBe(true);

    // The canonical key binds scope, realpath and fingerprint: the same
    // fingerprint under different paths never collapses.
    expect(
      canonicalIdKey("clone", ["host:a", "/srv/clone-one/.git", "proj-fingerprint-9f"]),
    ).not.toEqual(canonicalIdKey("clone", ["host:a", "/srv/clone-two/.git", "proj-fingerprint-9f"]));
  });

  it("linked worktrees share one common-dir clone", () => {
    const { clone } = baseIdentity();
    const main = deriveWorktreeIdentity({
      hostScope: "host:a",
      clone,
      worktreePath: "/srv/repo",
      gitDir: "/srv/repo/.git",
      worktreeFingerprint: "ws:main",
      identityUncertainty: [],
    });
    const linked = deriveWorktreeIdentity({
      hostScope: "host:a",
      clone,
      worktreePath: "/srv/repo-wt-feature",
      gitDir: "/srv/repo/.git/worktrees/feature",
      worktreeFingerprint: "ws:feature",
      identityUncertainty: [],
    });
    expect(validateWorktreeIdentity(main).ok).toBe(true);
    expect(validateWorktreeIdentity(linked).ok).toBe(true);
    // One clone shared… with isolated worktree identities.
    expect(main.cloneId).toBe(clone.cloneId);
    expect(linked.cloneId).toBe(clone.cloneId);
    expect(main.worktreeId).not.toBe(linked.worktreeId);
    expect(main.gitDir).not.toBe(linked.gitDir);
    expect(main.worktreeFingerprint).not.toBe(linked.worktreeFingerprint);
    expect(isSameClone(
      { cloneId: main.cloneId } as CloneIdentityDto,
      { cloneId: linked.cloneId } as CloneIdentityDto,
    )).toBe(true);
  });

  it("bind, upload, code-workspace creation or session events never activate or remove a declaration", () => {
    for (const kind of NON_ACTIVATING_LIFECYCLE_KINDS) {
      expect(classifyLifecycleEvent(kind)).toBe("no-activation-change");
    }
    expect(NON_ACTIVATING_LIFECYCLE_KINDS).toContain("bind");
    expect(NON_ACTIVATING_LIFECYCLE_KINDS).toContain("upload");
    expect(NON_ACTIVATING_LIFECYCLE_KINDS).toContain("session-open");
    expect(NON_ACTIVATING_LIFECYCLE_KINDS).toContain("session-end");

    // Positive control: a valid declaration validates before the guard is
    // exercised, so the negative assertions below only ever fail because
    // of the capability, not a broken fixture.
    const valid = createLiveDeclaration(baseDeclarationInput());
    expect(validateWorkspaceDeclaration(valid).ok).toBe(true);

    // A lifecycle kind is not an opt-in: only the explicit "live"
    // capability validates as a declaration, changing nothing else.
    for (const capability of ["bind", "upload", "session-open", "session-end", ""]) {
      const candidate: WorkspaceDeclarationDto = { ...valid, liveCapability: capability as "live" };
      const checked = validateWorkspaceDeclaration(candidate);
      expect(checked.ok).toBe(false);
      expect(checked.errors.some((error) => error.includes("liveCapability"))).toBe(true);
    }
    // A lifecycle event leaves the declaration revision untouched: there is
    // no transition to apply, only the constant classification above.
    const declaration: WorkspaceDeclarationDto = createLiveDeclaration(baseDeclarationInput());
    expect(declaration.declarationRevision).toBe(INITIAL_DECLARATION_REVISION);

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
    const { clone } = baseIdentity();
    expect(validateCloneIdentity({ ...clone, unexpected: true }).ok).toBe(false);
    const worktree = deriveWorktreeIdentity({
      hostScope: "host:a",
      clone,
      worktreePath: "/srv/r",
      gitDir: "/srv/r/.git",
      worktreeFingerprint: "ws:x",
      identityUncertainty: [],
    });
    expect(validateWorktreeIdentity({ ...worktree, unexpected: true }).ok).toBe(false);
    const revocation = revokeLiveDeclaration(declaration, "owner-request");
    expect(validateDeclarationRevocation({ ...revocation, unexpected: true }).ok).toBe(false);
  });

  // — REVIEW REPRODUCTION, constat 1 [BLOQUANT] —
  it("revocation targets exactly one declaration, never a fuzzy fingerprint scope", () => {
    // Two declarations of one tenant with the SAME public fingerprint and
    // the SAME revision, but different roots/clones/worktrees. The
    // rejected contract produced strictly identical revocations here;
    // the corrected contract names each declaration unambiguously.
    const cloneA = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirRealpath: "/repo/a/.git",
      commonDirProjectFingerprint: "proj-fingerprint-9f",
      identityUncertainty: [],
      oidAlgorithm: "sha1",
    });
    const worktreeA = deriveWorktreeIdentity({
      hostScope: "host:a",
      clone: cloneA,
      worktreePath: "/repo/a",
      gitDir: "/repo/a/.git",
      worktreeFingerprint: "ws:same",
      identityUncertainty: [],
    });
    const cloneB = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirRealpath: "/repo/b/.git",
      commonDirProjectFingerprint: "proj-fingerprint-9f",
      identityUncertainty: [],
      oidAlgorithm: "sha1",
    });
    const worktreeB = deriveWorktreeIdentity({
      hostScope: "host:a",
      clone: cloneB,
      worktreePath: "/repo/b",
      gitDir: "/repo/b/.git",
      worktreeFingerprint: "ws:same",
      identityUncertainty: [],
    });
    const identityA = deriveDeclarationIdentity({ hostScope: "host:a", clone: cloneA, worktree: worktreeA });
    const identityB = deriveDeclarationIdentity({ hostScope: "host:a", clone: cloneB, worktree: worktreeB });
    const shared = {
      tenant: "local:owner",
      principal: "h2a-local-owner",
      hostFingerprint: "ws:same",
      identityUncertainty: [] as const,
      authorizedRoots: ["/repo/a"],
      liveCapability: "live" as const,
      policyVersion: POLICY_VERSION,
    };
    const declarationA = createLiveDeclaration({ ...shared, ...identityA });
    const declarationB = createLiveDeclaration({ ...shared, ...identityB, authorizedRoots: ["/repo/b"] });
    expect(declarationA.declarationRevision).toBe(declarationB.declarationRevision);

    const revocationA = revokeLiveDeclaration(declarationA, "workspace-remove");
    const revocationB = revokeLiveDeclaration(declarationB, "workspace-remove");
    expect(revocationA).not.toEqual(revocationB);
    expect(revocationA.declarationId).toBe(declarationA.declarationId);
    expect(revocationB.declarationId).toBe(declarationB.declarationId);
    expect(revocationA.declarationId).not.toBe(revocationB.declarationId);
    expect(revocationA.cloneId).not.toBe(revocationB.cloneId);
    expect(revocationA.worktreeId).not.toBe(revocationB.worktreeId);
    expect(validateDeclarationRevocation(revocationA).ok).toBe(true);
    expect(validateDeclarationRevocation(revocationB).ok).toBe(true);
  });

  // — REVIEW REPRODUCTION, constat 2 [MAJEUR] —
  it("missing or shallow history is explicit uncertainty, never a refused or merged identity (LIVE §12)", () => {
    // A repo without history derives a clone with NO project fingerprint
    // under explicit "missing_history" — the rejected contract refused it.
    const noHistory = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirRealpath: "/srv/empty/.git",
      identityUncertainty: ["missing_history"],
      oidAlgorithm: "sha1",
    });
    expect(validateCloneIdentity(noHistory).ok).toBe(true);
    expect(noHistory.commonDirProjectFingerprint).toBeUndefined();
    expect(noHistory.identityUncertainty).toEqual(["missing_history"]);

    // Two history-less clones stay distinct through hostScope + realpath.
    const noHistorySibling = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirRealpath: "/srv/empty-sibling/.git",
      identityUncertainty: ["missing_history"],
      oidAlgorithm: "sha1",
    });
    expect(isSameClone(noHistory, noHistorySibling)).toBe(false);

    // The worktree fingerprint is optional only under missing_history.
    const bareWorktree = deriveWorktreeIdentity({
      hostScope: "host:a",
      clone: noHistory,
      worktreePath: "/srv/empty",
      gitDir: "/srv/empty/.git",
      identityUncertainty: ["missing_history"],
    });
    expect(validateWorktreeIdentity(bareWorktree).ok).toBe(true);
    expect(bareWorktree.worktreeFingerprint).toBeUndefined();

    // A declaration without hostFingerprint is expressible and valid.
    const identity = deriveDeclarationIdentityFor(noHistory, bareWorktree);
    const bareDeclaration = createLiveDeclaration({
      tenant: "local:owner",
      principal: "h2a-local-owner",
      identityUncertainty: ["missing_history"],
      declarationId: identity.declarationId,
      cloneId: identity.cloneId,
      worktreeId: identity.worktreeId,
      authorizedRoots: ["/srv/empty"],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
    });
    expect(validateWorkspaceDeclaration(bareDeclaration).ok).toBe(true);
    expect(bareDeclaration.hostFingerprint).toBeUndefined();

    // Shallow history keeps its fingerprints and declares the graft.
    const shallow = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirRealpath: "/srv/shallow/.git",
      commonDirProjectFingerprint: "proj-fingerprint-9f",
      identityUncertainty: ["shallow_history"],
      oidAlgorithm: "sha1",
    });
    expect(validateCloneIdentity(shallow).ok).toBe(true);

    // An absent fingerprint without the explicit uncertainty is refused.
    expect(() =>
      deriveCloneIdentity({
        hostScope: "host:a",
        commonDirRealpath: "/srv/empty/.git",
        identityUncertainty: [],
        oidAlgorithm: "sha1",
      }),
    ).toThrow();
    const missingFingerprintClone: Record<string, unknown> = {
      ...noHistory,
      identityUncertainty: [],
    };
    delete missingFingerprintClone.commonDirProjectFingerprint;
    expect(validateCloneIdentity(missingFingerprintClone).ok).toBe(false);

    // Unknown uncertainty states stay refused (exact vocabulary).
    expect(validateCloneIdentity({ ...noHistory, identityUncertainty: ["no_history"] }).ok).toBe(false);
    expect(IDENTITY_UNCERTAINTY_STATES).toEqual(["missing_history", "shallow_history"]);
  });

  // — REVIEW REPRODUCTION, constat 3 [MAJEUR] —
  it("the product binding is the complete server/issuer/revision triplet and cannot be renewed at a flat revision", () => {
    const first = createLiveDeclaration(baseDeclarationInput());

    // Partial bindings are refused: workspace without issuer, workspace
    // without revision, issuer alone.
    expect(validateWorkspaceDeclaration({
      ...first,
      serverWorkspaceId: "srv-ws-1",
    }).ok).toBe(false);
    expect(validateWorkspaceDeclaration({
      ...first,
      serverWorkspaceId: "srv-ws-1",
      bindingRevision: INITIAL_BINDING_REVISION,
    }).ok).toBe(false);
    expect(validateWorkspaceDeclaration({
      ...first,
      serverIssuer: "https://sentropic.example",
    }).ok).toBe(false);

    // A workspace change without a fresh revision is refused…
    expect(() =>
      reviseLiveDeclaration(first, { serverWorkspaceId: "srv-ws-1", serverIssuer: "https://sentropic.example" }),
    ).toThrow();
    // …the first product binding carries exactly INITIAL_BINDING_REVISION
    // (FROZEN convention): a first binding at any other revision is
    // refused, both at creation and at the first binding revision…
    expect(() =>
      reviseLiveDeclaration(first, {
        serverWorkspaceId: "srv-ws-1",
        serverIssuer: "https://sentropic.example",
        bindingRevision: 7,
      }),
    ).toThrow();
    expect(() =>
      createLiveDeclaration({
        ...baseDeclarationInput(),
        serverWorkspaceId: "srv-ws-1",
        serverIssuer: "https://sentropic.example",
        bindingRevision: 7,
      }),
    ).toThrow();
    const bound = reviseLiveDeclaration(first, {
      serverWorkspaceId: "srv-ws-1",
      serverIssuer: "https://sentropic.example",
      bindingRevision: INITIAL_BINDING_REVISION,
    });
    expect(bound.bindingRevision).toBe(INITIAL_BINDING_REVISION);
    // …so is a workspace change with the SAME revision (flat rebind)…
    expect(() =>
      reviseLiveDeclaration(bound, { serverWorkspaceId: "srv-ws-8", bindingRevision: INITIAL_BINDING_REVISION }),
    ).toThrow();
    // …and so is an issuer change without a strictly greater revision.
    expect(() =>
      reviseLiveDeclaration(bound, { serverIssuer: "https://other.example", bindingRevision: INITIAL_BINDING_REVISION }),
    ).toThrow();

    // The complete triplet with a strictly increasing revision rebinds.
    const rebound = reviseLiveDeclaration(bound, {
      serverWorkspaceId: "srv-ws-8",
      serverIssuer: "https://sentropic.example",
      bindingRevision: INITIAL_BINDING_REVISION + 1,
    });
    expect(rebound.serverWorkspaceId).toBe("srv-ws-8");
    expect(rebound.bindingRevision).toBe(INITIAL_BINDING_REVISION + 1);
    expect(validateWorkspaceDeclaration(rebound).ok).toBe(true);

    // A revalidation of the same target still requires a strictly greater
    // binding revision; revisions never go backwards.
    expect(() =>
      reviseLiveDeclaration(rebound, { bindingRevision: INITIAL_BINDING_REVISION + 1 }),
    ).toThrow();
    expect(() =>
      reviseLiveDeclaration(rebound, { bindingRevision: INITIAL_BINDING_REVISION }),
    ).toThrow();
    const revalidated = reviseLiveDeclaration(rebound, { bindingRevision: INITIAL_BINDING_REVISION + 2 });
    expect(revalidated.bindingRevision).toBe(INITIAL_BINDING_REVISION + 2);
    expect(validateWorkspaceDeclaration(revalidated).ok).toBe(true);
  });

  // — REVIEW REPRODUCTION, Sol 2 constat 1 [MAJEUR] —
  it("a revision of a bound declaration that does not touch the binding preserves it", () => {
    const first = createLiveDeclaration(baseDeclarationInput());
    const bound = reviseLiveDeclaration(first, {
      serverWorkspaceId: "srv-ws-1",
      serverIssuer: "https://sentropic.example",
      bindingRevision: INITIAL_BINDING_REVISION,
    });

    // A root mutation on a BOUND declaration is accepted WITHOUT renewing
    // the binding: the rejected contract forced an artificially greater
    // bindingRevision for every revision of a bound declaration (7 <= 7).
    const revised = reviseLiveDeclaration(bound, {
      authorizedRoots: ["/work/repo", "/work/other"],
    });
    expect(revised.authorizedRoots).toEqual(["/work/repo", "/work/other"]);
    expect(revised.declarationRevision).toBe(bound.declarationRevision + 1);
    expect(revised.serverWorkspaceId).toBe("srv-ws-1");
    expect(revised.serverIssuer).toBe("https://sentropic.example");
    expect(revised.bindingRevision).toBe(INITIAL_BINDING_REVISION);
    expect(validateWorkspaceDeclaration(revised).ok).toBe(true);
    // Further non-binding revisions keep preserving the binding.
    const again = reviseLiveDeclaration(revised, { authorizedRoots: ["/work/repo"] });
    expect(again.bindingRevision).toBe(INITIAL_BINDING_REVISION);
    expect(again.declarationRevision).toBe(revised.declarationRevision + 1);

    // A workspace change without a fresh strictly increasing binding
    // revision is refused — with or without an explicit flat revision…
    expect(() =>
      reviseLiveDeclaration(bound, {
        serverWorkspaceId: "srv-ws-2",
        serverIssuer: "https://sentropic.example",
      }),
    ).toThrow();
    expect(() =>
      reviseLiveDeclaration(bound, {
        serverWorkspaceId: "srv-ws-2",
        serverIssuer: "https://sentropic.example",
        bindingRevision: INITIAL_BINDING_REVISION,
      }),
    ).toThrow();
    // …and so is an issuer change.
    expect(() =>
      reviseLiveDeclaration(bound, { serverIssuer: "https://other.example" }),
    ).toThrow();
    expect(() =>
      reviseLiveDeclaration(bound, {
        serverIssuer: "https://other.example",
        bindingRevision: INITIAL_BINDING_REVISION,
      }),
    ).toThrow();
    // The same non-binding patch also stays accepted on a local (unbound)
    // declaration.
    expect(() =>
      reviseLiveDeclaration(first, { authorizedRoots: ["/work/repo", "/work/other"] }),
    ).not.toThrow();
  });

  // — REVIEW REPRODUCTION, constats 4 et 5 [MAJEUR/MINEUR] —
  it("one canonical derivation mints every opaque id and identity equality is transitive", () => {
    // The same identity components derived twice (as E, H and S each would)
    // give byte-identical ids — the rejected contract let each seat hash
    // its own key and diverge.
    const components = {
      hostScope: "host:a",
      commonDirRealpath: "/srv/repo/.git",
      commonDirProjectFingerprint: "proj-fingerprint-9f",
      identityUncertainty: [] as const,
      oidAlgorithm: "sha1" as const,
    };
    const seatE = deriveCloneIdentity(components);
    const seatH = deriveCloneIdentity(components);
    const seatS = deriveCloneIdentity(components);
    expect(seatH.cloneId).toBe(seatE.cloneId);
    expect(seatS.cloneId).toBe(seatE.cloneId);

    // Equality by canonical identifier is transitive between full DTOs and
    // opaque references: A≈B, A≈{cloneId:A} and B≈{cloneId:A} all hold.
    const a = deriveCloneIdentity(components);
    const b = deriveCloneIdentity(components);
    const reference = { cloneId: a.cloneId } as CloneIdentityDto;
    expect(isSameClone(a, b)).toBe(true);
    expect(isSameClone(a, reference)).toBe(true);
    expect(isSameClone(b, reference)).toBe(true);
    expect(isSameClone(b, { cloneId: b.cloneId } as CloneIdentityDto)).toBe(true);

    // The serialization is unambiguous: no component value can shift a
    // boundary, and NUL is refused outright.
    expect(canonicalIdKey("clone", ["a", "bc"])).not.toBe(canonicalIdKey("clone", ["ab", "c"]));
    expect(() => canonicalIdKey("clone", ["host:a\0b", "c"])).toThrow();
    expect(() => canonicalIdKey("clone", ["host:a", "b\0c"])).toThrow();
    expect(() =>
      deriveCloneIdentity({
        hostScope: "host:a\0b",
        commonDirRealpath: "/srv/x/.git",
        commonDirProjectFingerprint: "p",
        identityUncertainty: [],
        oidAlgorithm: "sha1",
      }),
    ).toThrow();

    // The declaration identity is per worktree: two worktrees of one clone
    // (even without fingerprints) derive distinct declarationIds.
    const bare = deriveCloneIdentity({
      hostScope: "host:a",
      commonDirRealpath: "/srv/empty/.git",
      identityUncertainty: ["missing_history"],
      oidAlgorithm: "sha1",
    });
    const mainWt = deriveWorktreeIdentity({
      hostScope: "host:a",
      clone: bare,
      worktreePath: "/srv/empty",
      gitDir: "/srv/empty/.git",
      identityUncertainty: ["missing_history"],
    });
    const linkedWt = deriveWorktreeIdentity({
      hostScope: "host:a",
      clone: bare,
      worktreePath: "/srv/empty-wt",
      gitDir: "/srv/empty/.git/worktrees/wt",
      identityUncertainty: ["missing_history"],
    });
    const mainDecl = deriveDeclarationIdentity({ hostScope: "host:a", clone: bare, worktree: mainWt });
    const linkedDecl = deriveDeclarationIdentity({ hostScope: "host:a", clone: bare, worktree: linkedWt });
    expect(mainDecl.declarationId).not.toBe(linkedDecl.declarationId);
    expect(mainDecl.declarationId.startsWith(ID_PREFIXES.declaration)).toBe(true);
    expect(mainDecl.worktreeId.startsWith(ID_PREFIXES.worktree)).toBe(true);
    expect(mainDecl.cloneId).toBe(bare.cloneId);

    // Deriving the same declaration identity twice is deterministic.
    expect(deriveDeclarationIdentity({ hostScope: "host:a", clone: bare, worktree: mainWt })).toEqual(mainDecl);
  });
});

// Local helper mirroring deriveDeclarationIdentity for the uncertainty
// test; defined after the suite to keep the describe block readable.
function deriveDeclarationIdentityFor(
  clone: CloneIdentityDto,
  worktree: ReturnType<typeof deriveWorktreeIdentity>,
): ReturnType<typeof deriveDeclarationIdentity> {
  return deriveDeclarationIdentity({ hostScope: "host:a", clone, worktree });
}
