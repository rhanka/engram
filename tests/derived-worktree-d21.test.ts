import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isValidWorktreeId } from "../src/session-front-contracts.js";
import { protectedPathRef } from "../engram-live/content-policy.js";
import {
  IDENTITY_UNCERTAINTY_STATES,
  POLICY_VERSION,
  validatePullRequestFact,
  validateWorktreeIdentity,
  type PullRequestFactDto,
} from "../engram-live/contracts.js";
import {
  createLiveDeclaration,
  deriveCloneIdentity,
  deriveDeclarationIdentity,
  deriveWorktreeIdentity,
} from "../engram-live/registration.js";
import type { StableCapture } from "../engram-live/worktree.js";
import {
  DERIVED_WORKTREE_DIRTY_STATES,
  DERIVED_WORKTREE_LIFECYCLE_STATES,
  DERIVED_WORKTREE_LIVE_INDEXING_STATES,
  DERIVED_WORKTREE_REFUSAL_CODES,
  DERIVED_WORKTREE_RELATION_TYPES,
  WORKTREE_ORIGIN_KINDS,
  buildDerivedWorktreeNode,
  recordPassiveSessionTurn,
  upsertDerivedWorktreeNode,
  validateDerivedWorktreeNode,
  type DerivedWorktreeGraphV1,
  type DerivedWorktreeNodeV1,
  type DerivedWorktreePathRefV1,
  type DerivedWorktreeRefusalCode,
} from "../engram-live/derived-worktree-graph.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE_ROOT = join(ROOT, "engram-live");
const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");

const TENANT_ID = "tenant:engram-e4";
const WORKSPACE_ID = "ws-scope:engram-e4";
const HOST_SCOPE = "host:workstation-a";
const CREATED_AT = "2026-11-22T18:00:00.000Z";
const OBSERVED_AT = "2026-11-22T18:05:00.000Z";
const UPDATED_AT = "2026-11-22T18:10:00.000Z";
const LATER_AT = "2026-11-22T18:15:00.000Z";

const SHA1_HEAD = "a".repeat(40);
const SHA1_BASE = "b".repeat(40);
const SHA1_MERGE = "c".repeat(40);
const SHA256_CONTENT = `sha256:${"1".repeat(64)}` as const;
const SHA256_INDEX_HEX = "2".repeat(64);
const SHA256_ATTR_HEX = "3".repeat(64);
const SHA256_FILE_HEX = "4".repeat(64);
const WS_FINGERPRINT = `ws:${"5".repeat(64)}`;
const SESSION_PSEUDO_1 = `sess_pseudo:${"6".repeat(64)}`;
const SESSION_PSEUDO_2 = `sess_pseudo:${"7".repeat(64)}`;
const EVENT_RECORD_1 = "raw_event_0001";
const EVENT_RECORD_2 = "raw_event_0002";
const RETENTION_RECEIPT_1 = "r1-rcpt:retained-0001";

const EMPTY_GRAPH: DerivedWorktreeGraphV1 = { nodes: [], edges: [] };

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function makePathRef(pathRef = "worktrees/feature-d21"): DerivedWorktreePathRefV1 {
  return {
    pathRef,
    contentFingerprint: SHA256_CONTENT,
    contentDisclosureAuthorized: false,
  };
}

function makeCheckoutIdentities(label = "alpha") {
  const clone = deriveCloneIdentity({
    hostScope: HOST_SCOPE,
    commonDirRealpath: `/srv/checkouts/${label}/.git`,
    commonDirProjectFingerprint: "proj-fp-shared-0001",
    identityUncertainty: [],
    oidAlgorithm: "sha1",
  });
  const mainWorktree = deriveWorktreeIdentity({
    hostScope: HOST_SCOPE,
    clone,
    worktreePath: `/srv/checkouts/${label}`,
    gitDir: `/srv/checkouts/${label}/.git`,
    worktreeFingerprint: WS_FINGERPRINT,
    identityUncertainty: [],
  });
  const linkedWorktree = deriveWorktreeIdentity({
    hostScope: HOST_SCOPE,
    clone,
    worktreePath: `/srv/checkouts/${label}-wt-job`,
    gitDir: `/srv/checkouts/${label}/.git/worktrees/job-1`,
    worktreeFingerprint: WS_FINGERPRINT,
    identityUncertainty: [],
  });
  return { clone, mainWorktree, linkedWorktree };
}

function makeValidNode(
  overrides: Partial<DerivedWorktreeNodeV1> = {},
): DerivedWorktreeNodeV1 {
  const { clone, mainWorktree } = makeCheckoutIdentities("valid");
  return {
    nodeType: "derived_worktree",
    derivedWorktreeId: mainWorktree.worktreeId,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    cloneId: clone.cloneId,
    worktreePathRef: makePathRef("checkouts/main"),
    parentOrigin: {
      parentCloneId: clone.cloneId,
      originKind: "main-checkout",
      baseRefName: "refs/heads/main",
      baseCommitOid: { algorithm: "sha1", oid: SHA1_BASE },
      durableWorkspaceFingerprint: WS_FINGERPRINT,
      identityUncertainty: [],
    },
    gitState: {
      headOid: { algorithm: "sha1", oid: SHA1_HEAD },
      symbolicBranchRef: "refs/heads/main",
      detached: false,
      dirtyState: "clean",
      liveIndexingState: "unactivated",
      observedAt: OBSERVED_AT,
    },
    lifecycleState: "active",
    harnessOverlayRelPath: `.h2a/overlays/worktrees/${mainWorktree.worktreeId}.json`,
    createdAt: CREATED_AT,
    updatedAt: OBSERVED_AT,
    ...overrides,
  };
}

function makeValidChildNode(): DerivedWorktreeNodeV1 {
  const { clone, mainWorktree, linkedWorktree } = makeCheckoutIdentities("child");
  return {
    nodeType: "derived_worktree",
    derivedWorktreeId: linkedWorktree.worktreeId,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    cloneId: clone.cloneId,
    worktreePathRef: makePathRef("checkouts/job-1"),
    parentOrigin: {
      parentCloneId: clone.cloneId,
      parentWorktreeId: mainWorktree.worktreeId,
      originKind: "h2a-job-worktree",
      baseRefName: "refs/heads/main",
      baseCommitOid: { algorithm: "sha1", oid: SHA1_BASE },
      durableWorkspaceFingerprint: WS_FINGERPRINT,
      identityUncertainty: [],
    },
    gitState: {
      headOid: { algorithm: "sha1", oid: SHA1_HEAD },
      symbolicBranchRef: null,
      detached: true,
      dirtyState: "dirty",
      liveIndexingState: "unactivated",
      observedAt: OBSERVED_AT,
    },
    lifecycleState: "active",
    harnessOverlayRelPath: `.h2a/overlays/worktrees/${linkedWorktree.worktreeId}.json`,
    createdAt: CREATED_AT,
    updatedAt: OBSERVED_AT,
  };
}

function makeStableCapture(overrides: Partial<StableCapture> = {}): StableCapture {
  return {
    stable: true,
    attempts: 1,
    root: "/srv/checkouts/valid",
    gitDir: "/srv/checkouts/valid/.git",
    commonDir: "/srv/checkouts/valid/.git",
    indexPath: "/srv/checkouts/valid/.git/index",
    headOid: SHA1_HEAD,
    objectFormat: "sha1",
    indexDigest: SHA256_INDEX_HEX,
    attrFingerprint: SHA256_ATTR_HEX,
    entries: [
      {
        path: new TextEncoder().encode("src/index.ts"),
        mode: "100644",
        oid: SHA1_BASE,
        stage: 0,
      },
    ],
    files: [
      {
        path: new TextEncoder().encode("src/index.ts"),
        status: "present",
        kind: "file",
        mode: "100644",
        indexOid: SHA1_BASE,
        fingerprint: SHA256_FILE_HEX,
        size: 128,
        blobVerified: true,
      },
    ],
    ...overrides,
  };
}

function makePullRequestFact(
  overrides: Partial<PullRequestFactDto> = {},
): PullRequestFactDto {
  return {
    repositoryOwner: "sentropic",
    repositoryRepo: "engram",
    number: 520,
    state: "merged",
    isDraft: false,
    updatedAt: 1_763_840_000_000,
    headOid: { algorithm: "sha1", oid: SHA1_HEAD },
    headRef: "refs/pull/520/head",
    baseOid: { algorithm: "sha1", oid: SHA1_BASE },
    baseRef: "refs/heads/main",
    mergeOid: { algorithm: "sha1", oid: SHA1_MERGE },
    mergeStrategy: "squash",
    mergedAt: 1_763_839_900_000,
    ...overrides,
  };
}

function listAllLiveTsFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const rel = prefix.length > 0 ? `${prefix}/${entry.name}` : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listAllLiveTsFiles(full, rel));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(rel);
    }
  }
  return out.sort();
}

function findDeclaredOrExportedNames(sourceText: string, targetName: string): string[] {
  const sourceFile = ts.createSourceFile(
    "scan.ts",
    sourceText,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
  const hits: string[] = [];
  const visit = (node: import("typescript").Node): void => {
    if (
      (ts.isFunctionDeclaration(node)
        || ts.isClassDeclaration(node)
        || ts.isInterfaceDeclaration(node)
        || ts.isTypeAliasDeclaration(node)
        || ts.isEnumDeclaration(node))
      && node.name?.text === targetName
    ) {
      hits.push(`declaration:${targetName}`);
    } else if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === targetName
    ) {
      hits.push(`variable:${targetName}`);
    } else if (ts.isExportSpecifier(node)) {
      if (node.name.text === targetName || node.propertyName?.text === targetName) {
        hits.push(`export:${targetName}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits;
}

function expectClosedRefusal(
  result: { readonly ok: boolean; readonly error?: { readonly code: string; readonly message: string } },
  expectedCode: DerivedWorktreeRefusalCode,
  mutantNote: string,
  forbiddenLeak?: string,
): void {
  // Kills a mutant that accepts invalid input instead of returning a closed refusal.
  expect(result.ok, mutantNote).toBe(false);
  if (result.ok) {
    return;
  }
  // Kills a mutant that emits an undeclared or open refusal code outside DERIVED_WORKTREE_REFUSAL_CODES.
  expect(
    (DERIVED_WORKTREE_REFUSAL_CODES as readonly string[]).includes(result.error!.code),
    `${mutantNote} (closed refusal code)`,
  ).toBe(true);
  // Kills a mutant that maps this rejection to the wrong refusal code.
  expect(result.error!.code, `${mutantNote} (exact refusal code)`).toBe(expectedCode);
  // Kills a mutant that returns an empty diagnostic message.
  expect(result.error!.message.length, `${mutantNote} (non-empty message)`).toBeGreaterThan(0);
  if (forbiddenLeak !== undefined) {
    // Kills a mutant that leaks raw caller path or secret input into error messages.
    expect(result.error!.message, `${mutantNote} (opaque error)`).not.toContain(forbiddenLeak);
  }
}

describe("Row 13 · 1-E4 — Derived worktree graph (D21)", () => {
  it("a raw absolute host path or an id that is not wt:<64 hex> is refused", () => {
    const base = makeValidNode();
    const baseCheck = validateDerivedWorktreeNode(base);
    // Kills a mutant that breaks positive control validation of a well-formed node.
    expect(baseCheck.ok).toBe(true);

    const invalidWorktreeIds: readonly unknown[] = [
      "/home/alice/src/repo",
      "/var/tmp/worktree",
      "C:\\Users\\alice\\repo",
      "C:/Users/alice/repo",
      "\\\\server\\share\\repo",
      "~/src/repo",
      "file:///home/alice/repo",
      "wt:packed",
      "wt:",
      `wt:${"a".repeat(63)}`,
      `wt:${"a".repeat(65)}`,
      `wt:${"A".repeat(64)}`,
      `wt:${"g".repeat(64)}`,
      `wt:${"a".repeat(64)}\n`,
      ` wt:${"a".repeat(64)}`,
      `wt:${"a".repeat(64)} `,
      `wt:${"a".repeat(63)}\0`,
      `clone:${"a".repeat(64)}`,
      "",
      null,
      42,
    ];
    for (const badId of invalidWorktreeIds) {
      const leak = typeof badId === "string" && badId.includes("alice") ? "alice" : undefined;
      const nodeResult = validateDerivedWorktreeNode({
        ...base,
        derivedWorktreeId: badId,
      });
      expectClosedRefusal(
        nodeResult,
        "INVALID_WORKTREE_ID",
        `Kills a mutant that accepts invalid derivedWorktreeId ${JSON.stringify(badId)}`,
        leak,
      );

      const child = makeValidChildNode();
      const parentResult = validateDerivedWorktreeNode({
        ...child,
        parentOrigin: {
          ...child.parentOrigin,
          parentWorktreeId: badId,
        },
      });
      expectClosedRefusal(
        parentResult,
        "INVALID_WORKTREE_ID",
        `Kills a mutant that accepts invalid parentWorktreeId ${JSON.stringify(badId)}`,
        leak,
      );
    }

    const rawOrForbiddenPathRefs: readonly string[] = [
      "/home/alice/src/repo",
      "/etc/passwd",
      "C:\\Users\\alice\\repo",
      "C:/Users/alice/repo",
      "\\\\fileserver\\share\\repo",
      "~/repo",
      "file:///home/alice/repo",
      "../escape/worktree",
      "worktrees/../secret",
      "worktrees/./dot",
      "worktrees/.env.local",
      "worktrees/id_rsa",
      "worktrees/secrets/key.pem",
      ".git",
      ".git/config",
      "worktrees/.git/HEAD",
      "worktrees/path\0nul",
      "worktrees/line\nbreak",
      "withheld-path:short",
      `withheld-path:${"A".repeat(64)}`,
    ];
    for (const badPathRef of rawOrForbiddenPathRefs) {
      const leak = badPathRef.includes("alice") ? "alice" : undefined;
      const result = validateDerivedWorktreeNode({
        ...base,
        worktreePathRef: makePathRef(badPathRef),
      });
      expectClosedRefusal(
        result,
        "INVALID_PATH_REF",
        `Kills a mutant that admits forbidden worktreePathRef ${JSON.stringify(badPathRef)}`,
        leak,
      );
    }

    // Kills a mutant that uses a broad ".git" substring match instead of exact segment matching.
    const githubWorkflowRef = validateDerivedWorktreeNode({
      ...base,
      worktreePathRef: makePathRef(".github/workflows/ci.yml"),
    });
    expect(githubWorkflowRef.ok).toBe(true);

    // Kills a mutant that allows withheld-path:<64hex> with contentDisclosureAuthorized: true.
    const leakedWithheld = validateDerivedWorktreeNode({
      ...base,
      worktreePathRef: {
        pathRef: `withheld-path:${"a".repeat(64)}`,
        contentFingerprint: SHA256_CONTENT,
        contentDisclosureAuthorized: true,
      },
    });
    expectClosedRefusal(
      leakedWithheld,
      "INVALID_PATH_REF",
      "Kills a mutant that admits withheld-path with contentDisclosureAuthorized=true",
    );

    // Kills a mutant that allows raw absolute host paths in harnessOverlayRelPath or mismatched id.
    const badOverlays: readonly string[] = [
      `/home/alice/.h2a/overlays/worktrees/${base.derivedWorktreeId}.json`,
      `../.h2a/overlays/worktrees/${base.derivedWorktreeId}.json`,
      `.track/overlays/worktrees/${base.derivedWorktreeId}.json`,
      `.h2a/overlays/worktrees/wt:${"f".repeat(64)}.json`,
      `.h2a/overlays/worktrees/${base.derivedWorktreeId}.txt`,
    ];
    for (const badOverlay of badOverlays) {
      const result = validateDerivedWorktreeNode({
        ...base,
        harnessOverlayRelPath: badOverlay,
      });
      expectClosedRefusal(
        result,
        "INVALID_OVERLAY_PATH",
        `Kills a mutant that admits bad harnessOverlayRelPath ${JSON.stringify(badOverlay)}`,
        badOverlay.includes("alice") ? "alice" : undefined,
      );
    }

    // Kills a mutant that accepts a WorktreeIdentityDto failing object-level validateWorktreeIdentity
    // or non-canonical short wt:packed worktreeId when building a derived worktree node.
    const { clone } = makeCheckoutIdentities("short-id");
    const nonCanonicalWorktree = {
      cloneId: clone.cloneId,
      worktreeId: "wt:packed",
      worktreePath: "/srv/checkouts/short-id",
      gitDir: "/srv/checkouts/short-id/.git",
      worktreeFingerprint: WS_FINGERPRINT,
      identityUncertainty: [],
    };
    // Kills a mutant that changes object-level validateWorktreeIdentity's original prefix contract.
    expect(validateWorktreeIdentity(nonCanonicalWorktree).ok).toBe(true);
    const builtFromShortId = buildDerivedWorktreeNode({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone,
      worktree: nonCanonicalWorktree,
      worktreePathRef: makePathRef("checkouts/short"),
      originKind: "main-checkout",
      observedAt: OBSERVED_AT,
    });
    expectClosedRefusal(
      builtFromShortId,
      "INVALID_WORKTREE_ID",
      "Kills a mutant that accepts non-64-hex wt:packed when building DerivedWorktreeNodeV1",
    );

    const invalidObjectIdentity = {
      cloneId: clone.cloneId,
      worktreeId: `wt:${"d".repeat(64)}`,
      worktreePath: "/srv/checkouts/missing-fp",
      gitDir: "/srv/checkouts/missing-fp/.git",
      identityUncertainty: [],
    };
    // Kills a mutant that weakens object-level validateWorktreeIdentity missing_history requirement.
    expect(validateWorktreeIdentity(invalidObjectIdentity).ok).toBe(false);
    const builtFromInvalidIdentity = buildDerivedWorktreeNode({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone,
      worktree: invalidObjectIdentity,
      worktreePathRef: makePathRef("checkouts/missing-fp"),
      originKind: "main-checkout",
      observedAt: OBSERVED_AT,
    });
    expectClosedRefusal(
      builtFromInvalidIdentity,
      "INVALID_INPUT",
      "Kills a mutant that skips object-level validateWorktreeIdentity before building a node",
    );

    // Kills a mutant that allows self-parenting (parentWorktreeId === derivedWorktreeId).
    const selfParent = validateDerivedWorktreeNode({
      ...makeValidChildNode(),
      parentOrigin: {
        ...makeValidChildNode().parentOrigin,
        parentWorktreeId: makeValidChildNode().derivedWorktreeId,
      },
    });
    expectClosedRefusal(
      selfParent,
      "INVALID_WORKTREE_ID",
      "Kills a mutant that allows a worktree to declare itself as parentWorktreeId",
    );

    // Kills a mutant that allows main-checkout to carry a parentWorktreeId.
    const mainWithParent = validateDerivedWorktreeNode({
      ...base,
      parentOrigin: {
        ...base.parentOrigin,
        parentWorktreeId: `wt:${"e".repeat(64)}`,
      },
    });
    expectClosedRefusal(
      mainWithParent,
      "INVALID_WORKTREE_ID",
      "Kills a mutant that allows a main-checkout node to specify parentWorktreeId",
    );
  });

  it("an uncertainty state outside the two declared ones is refused", () => {
    // Kills a mutant that drifts IDENTITY_UNCERTAINTY_STATES from the two declared states.
    expect([...IDENTITY_UNCERTAINTY_STATES]).toEqual(["missing_history", "shallow_history"]);

    const base = makeValidNode();
    for (const validUncertainty of [
      [],
      ["missing_history"],
      ["shallow_history"],
      ["missing_history", "shallow_history"],
    ] as const) {
      const ok = validateDerivedWorktreeNode({
        ...base,
        parentOrigin: {
          ...base.parentOrigin,
          identityUncertainty: [...validUncertainty],
        },
      });
      // Kills a mutant that rejects valid combinations of declared uncertainty states.
      expect(ok.ok, `valid uncertainty ${JSON.stringify(validUncertainty)}`).toBe(true);
    }

    const invalidStates: readonly unknown[] = [
      ["grafted"],
      ["unborn"],
      ["detached"],
      ["unknown"],
      ["MISSING_HISTORY"],
      ["missing_history "],
      [""],
      [null],
      [undefined],
      [123],
      ["missing_history", "bogus"],
      ["missing_history", "missing_history"],
      ["shallow_history", "shallow_history"],
    ];
    for (const badStates of invalidStates) {
      const result = validateDerivedWorktreeNode({
        ...base,
        parentOrigin: {
          ...base.parentOrigin,
          identityUncertainty: badStates as readonly ("missing_history" | "shallow_history")[],
        },
      });
      expectClosedRefusal(
        result,
        "INVALID_UNCERTAINTY_STATE",
        `Kills a mutant that accepts undeclared or duplicate uncertainty ${JSON.stringify(badStates)}`,
      );
    }

    // Kills a mutant that accepts sparse arrays in identityUncertainty.
    // eslint-disable-next-line no-sparse-arrays
    const sparseUncertainty = [, "missing_history"] as unknown as readonly ("missing_history" | "shallow_history")[];
    const sparseResult = validateDerivedWorktreeNode({
      ...base,
      parentOrigin: {
        ...base.parentOrigin,
        identityUncertainty: sparseUncertainty,
      },
    });
    expectClosedRefusal(
      sparseResult,
      "INVALID_UNCERTAINTY_STATE",
      "Kills a mutant that allows a sparse array for identityUncertainty",
    );

    // Kills a mutant that admits unknown uncertainty states in buildDerivedWorktreeNode.
    const { clone, mainWorktree } = makeCheckoutIdentities("uncert");
    const builtBadUncert = buildDerivedWorktreeNode({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone,
      worktree: mainWorktree,
      worktreePathRef: makePathRef("checkouts/uncert"),
      originKind: "main-checkout",
      identityUncertainty: ["missing_history", "invented_state"],
      observedAt: OBSERVED_AT,
    });
    expectClosedRefusal(
      builtBadUncert,
      "INVALID_UNCERTAINTY_STATE",
      "Kills a mutant that accepts undeclared uncertainty in buildDerivedWorktreeNode",
    );
  });

  it("two distinct checkouts are never merged across clones", () => {
    const checkoutA = makeCheckoutIdentities("clone-a");
    const checkoutB = makeCheckoutIdentities("clone-b");
    // Kills a mutant that collapses two distinct checkouts sharing project fingerprint into one cloneId.
    expect(checkoutA.clone.cloneId).not.toBe(checkoutB.clone.cloneId);
    // Kills a mutant that collapses two distinct checkouts into one worktreeId.
    expect(checkoutA.mainWorktree.worktreeId).not.toBe(checkoutB.mainWorktree.worktreeId);

    const nodeA = buildDerivedWorktreeNode({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone: checkoutA.clone,
      worktree: checkoutA.mainWorktree,
      worktreePathRef: makePathRef("checkouts/shared-label"),
      originKind: "main-checkout",
      durableWorkspaceFingerprint: WS_FINGERPRINT,
      observedAt: OBSERVED_AT,
    });
    const nodeB = buildDerivedWorktreeNode({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone: checkoutB.clone,
      worktree: checkoutB.mainWorktree,
      worktreePathRef: makePathRef("checkouts/shared-label"),
      originKind: "main-checkout",
      durableWorkspaceFingerprint: WS_FINGERPRINT,
      observedAt: OBSERVED_AT,
    });
    // Kills a mutant that fails to build valid independent nodes for two distinct clones.
    expect(nodeA.ok).toBe(true);
    expect(nodeB.ok).toBe(true);
    if (!nodeA.ok || !nodeB.ok) {
      return;
    }

    // Kills a mutant that builds a node when clone and worktree come from different clones.
    const mismatchedBuild = buildDerivedWorktreeNode({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone: checkoutA.clone,
      worktree: checkoutB.mainWorktree,
      worktreePathRef: makePathRef("checkouts/mismatch"),
      originKind: "main-checkout",
      observedAt: OBSERVED_AT,
    });
    expectClosedRefusal(
      mismatchedBuild,
      "CROSS_CLONE_MERGE_FORBIDDEN",
      "Kills a mutant that binds a worktree from clone B onto clone A",
    );

    // Kills a mutant that accepts a node whose parentOrigin.parentCloneId differs from node.cloneId.
    const crossCloneParentOrigin = validateDerivedWorktreeNode({
      ...nodeB.value,
      parentOrigin: {
        ...nodeB.value.parentOrigin,
        parentCloneId: checkoutA.clone.cloneId,
      },
    });
    expectClosedRefusal(
      crossCloneParentOrigin,
      "CROSS_CLONE_MERGE_FORBIDDEN",
      "Kills a mutant that permits parentOrigin.parentCloneId !== cloneId",
    );

    // Distinct clones sharing durableWorkspaceFingerprint and pathRef stay two distinct nodes in the graph.
    const g1 = upsertDerivedWorktreeNode(EMPTY_GRAPH, nodeA.value);
    // Kills a mutant that drops the first checkout node on upsert.
    expect(g1.ok).toBe(true);
    if (!g1.ok) {
      return;
    }
    const g2 = upsertDerivedWorktreeNode(g1.value, nodeB.value);
    // Kills a mutant that fails to insert a second clone's checkout into the same graph.
    expect(g2.ok).toBe(true);
    if (!g2.ok) {
      return;
    }
    // Kills a mutant that merges two distinct checkouts sharing durableWorkspaceFingerprint into one node.
    expect(g2.value.nodes).toHaveLength(2);
    // Kills a mutant that overwrites clone A's id with clone B's id.
    expect(new Set(g2.value.nodes.map((n) => n.cloneId))).toEqual(
      new Set([checkoutA.clone.cloneId, checkoutB.clone.cloneId]),
    );

    // Kills a mutant that allows re-upserting an existing derivedWorktreeId under a different cloneId.
    const forgedSameWtDifferentClone: DerivedWorktreeNodeV1 = {
      ...nodeB.value,
      derivedWorktreeId: nodeA.value.derivedWorktreeId,
      harnessOverlayRelPath: nodeA.value.harnessOverlayRelPath,
    };
    const crossCloneUpsert = upsertDerivedWorktreeNode(g1.value, forgedSameWtDifferentClone);
    expectClosedRefusal(
      crossCloneUpsert,
      "CROSS_CLONE_MERGE_FORBIDDEN",
      "Kills a mutant that merges a conflicting cloneId onto an existing derivedWorktreeId",
    );

    // Kills a mutant that allows a child in clone B to set parentWorktreeId to a node in clone A.
    const crossCloneBranchChild: DerivedWorktreeNodeV1 = {
      ...nodeB.value,
      parentOrigin: {
        parentCloneId: checkoutB.clone.cloneId,
        parentWorktreeId: nodeA.value.derivedWorktreeId,
        originKind: "linked-worktree",
        identityUncertainty: [],
      },
    };
    const crossCloneBranchUpsert = upsertDerivedWorktreeNode(g1.value, crossCloneBranchChild);
    expectClosedRefusal(
      crossCloneBranchUpsert,
      "CROSS_CLONE_MERGE_FORBIDDEN",
      "Kills a mutant that allows branched_from_worktree across two different clones",
    );
  });

  it(
    "the derived worktree node binds clone and worktree identity, parent origin, "
      + "stable capture digests, the removed-retained state and the optional mergedAt",
    () => {
      const { clone, mainWorktree, linkedWorktree } = makeCheckoutIdentities("full");
      const rawHostPath = "/home/alice/private/repo-wt-job";
      const withheldPathRef: DerivedWorktreePathRefV1 = {
        pathRef: new TextDecoder().decode(protectedPathRef(Buffer.from(rawHostPath, "utf8"))),
        contentFingerprint: SHA256_CONTENT,
        contentDisclosureAuthorized: false,
      };
      // Kills a mutant that leaks the raw host path instead of withheld-path:<64hex>.
      expect(withheldPathRef.pathRef).toBe(`withheld-path:${sha256Hex(rawHostPath)}`);

      const mainNodeResult = buildDerivedWorktreeNode({
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        clone,
        worktree: mainWorktree,
        worktreePathRef: makePathRef("repos/engram-main"),
        originKind: "main-checkout",
        baseRefName: "refs/heads/main",
        baseCommitOid: { algorithm: "sha1", oid: SHA1_BASE },
        durableWorkspaceFingerprint: WS_FINGERPRINT,
        headOid: { algorithm: "sha1", oid: SHA1_HEAD },
        symbolicBranchRef: "refs/heads/main",
        detached: false,
        dirtyState: "clean",
        observedAt: CREATED_AT,
      });
      // Kills a mutant that rejects building a valid main-checkout node.
      expect(mainNodeResult.ok).toBe(true);
      if (!mainNodeResult.ok) {
        return;
      }

      const capture = makeStableCapture();
      const declIdentity = deriveDeclarationIdentity({
        hostScope: HOST_SCOPE,
        clone,
        worktree: linkedWorktree,
      });
      const declaration = createLiveDeclaration({
        tenant: TENANT_ID,
        principal: "owner:local",
        hostFingerprint: WS_FINGERPRINT,
        identityUncertainty: [],
        declarationId: declIdentity.declarationId,
        cloneId: clone.cloneId,
        worktreeId: linkedWorktree.worktreeId,
        authorizedRoots: [linkedWorktree.worktreePath],
        liveCapability: "live",
        policyVersion: POLICY_VERSION,
      });

      const jobNodePassive = buildDerivedWorktreeNode({
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        clone,
        worktree: linkedWorktree,
        worktreePathRef: withheldPathRef,
        originKind: "h2a-job-worktree",
        parentWorktreeId: mainWorktree.worktreeId,
        baseRefName: "refs/heads/main",
        baseCommitOid: { algorithm: "sha1", oid: SHA1_BASE },
        durableWorkspaceFingerprint: WS_FINGERPRINT,
        stableCapture: capture,
        symbolicBranchRef: null,
        detached: true,
        dirtyState: "staged-only",
        observedAt: OBSERVED_AT,
      });
      // Kills a mutant that fails to build a child h2a-job-worktree node with parentOrigin and StableCapture.
      expect(jobNodePassive.ok).toBe(true);
      if (!jobNodePassive.ok) {
        return;
      }
      // Kills a mutant that fails to bind deriveCloneIdentity.cloneId.
      expect(jobNodePassive.value.cloneId).toBe(clone.cloneId);
      // Kills a mutant that fails to bind deriveWorktreeIdentity.worktreeId.
      expect(jobNodePassive.value.derivedWorktreeId).toBe(linkedWorktree.worktreeId);
      // Kills a mutant that drops parentOrigin.parentWorktreeId.
      expect(jobNodePassive.value.parentOrigin.parentWorktreeId).toBe(mainWorktree.worktreeId);
      // Kills a mutant that drops headOid from StableCapture.
      expect(jobNodePassive.value.gitState.headOid).toEqual({ algorithm: "sha1", oid: SHA1_HEAD });
      // Kills a mutant that fails to map StableCapture.indexDigest into sha256:<64hex>.
      expect(jobNodePassive.value.gitState.indexDigest).toBe(`sha256:${SHA256_INDEX_HEX}`);
      // Kills a mutant that omits or corrupts workingTreeFingerprint from StableCapture.
      expect(jobNodePassive.value.gitState.workingTreeFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
      // Kills a mutant that constructs the wrong S1 harnessOverlayRelPath.
      expect(jobNodePassive.value.harnessOverlayRelPath).toBe(
        `.h2a/overlays/worktrees/${linkedWorktree.worktreeId}.json`,
      );
      // Kills a mutant that activates live indexing without an explicit WorkspaceDeclarationDto.
      expect(jobNodePassive.value.gitState.liveIndexingState).toBe("unactivated");

      // Portable S4:535 hex overlay path is also accepted bijectively for the same derivedWorktreeId.
      const portableOverlay = `.h2a/overlays/worktrees/${linkedWorktree.worktreeId.slice(3)}.json`;
      const portableNodeCheck = validateDerivedWorktreeNode({
        ...jobNodePassive.value,
        harnessOverlayRelPath: portableOverlay,
      });
      // Kills a mutant that rejects the S4:535 portable-hex overlay path for the same worktree id.
      expect(portableNodeCheck.ok).toBe(true);

      // Explicit live activation binds declarationId and publishedGenerationId on the same derivedWorktreeId.
      const activated = buildDerivedWorktreeNode({
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        clone,
        worktree: linkedWorktree,
        worktreePathRef: withheldPathRef,
        originKind: "h2a-job-worktree",
        parentWorktreeId: mainWorktree.worktreeId,
        baseRefName: "refs/heads/main",
        baseCommitOid: { algorithm: "sha1", oid: SHA1_BASE },
        durableWorkspaceFingerprint: WS_FINGERPRINT,
        stableCapture: capture,
        declaration,
        liveIndexingState: "current",
        livePublishedGenerationId: "gen:0000000007",
        symbolicBranchRef: null,
        detached: true,
        dirtyState: "staged-only",
        observedAt: UPDATED_AT,
        createdAt: OBSERVED_AT,
        updatedAt: UPDATED_AT,
      });
      // Kills a mutant that rejects explicit WorkspaceDeclarationDto activation.
      expect(activated.ok).toBe(true);
      if (!activated.ok) {
        return;
      }
      // Kills a mutant that drops declarationId on explicit live activation.
      expect(activated.value.gitState.liveDeclarationId).toBe(declaration.declarationId);
      // Kills a mutant that fails to advance liveIndexingState to current.
      expect(activated.value.gitState.liveIndexingState).toBe("current");
      // Kills a mutant that drops livePublishedGenerationId.
      expect(activated.value.gitState.livePublishedGenerationId).toBe("gen:0000000007");
      // Kills a mutant that alters workingTreeFingerprint across identical StableCaptures.
      expect(activated.value.gitState.workingTreeFingerprint).toBe(
        jobNodePassive.value.gitState.workingTreeFingerprint,
      );

      // Graph edges bind all S1 §3.2 relation types (clone, parent, head, branch, snapshot, session, event, overlay).
      const graphWithMain = upsertDerivedWorktreeNode(EMPTY_GRAPH, mainNodeResult.value);
      // Kills a mutant that rejects inserting a valid main-checkout node into an empty graph.
      expect(graphWithMain.ok).toBe(true);
      if (!graphWithMain.ok) {
        return;
      }
      const graphWithJob = upsertDerivedWorktreeNode(
        graphWithMain.value,
        activated.value,
        {
          sessionPseudoIds: [SESSION_PSEUDO_1],
          eventRecordIds: [EVENT_RECORD_1],
          snapshotRefs: ["snap:0000000007"],
        },
      );
      // Kills a mutant that rejects attaching valid session, event, and snapshot refs on upsert.
      expect(graphWithJob.ok).toBe(true);
      if (!graphWithJob.ok) {
        return;
      }
      const relations = new Set(graphWithJob.value.edges.map((edge) => edge.relation));
      // Kills a mutant that omits any of the 8 S1 §3.2 graph relation types.
      expect(relations).toEqual(new Set(DERIVED_WORKTREE_RELATION_TYPES));
      // Kills a mutant that emits the wrong branched_from_worktree edge direction.
      expect(graphWithJob.value.edges).toContainEqual({
        relation: "branched_from_worktree",
        source: linkedWorktree.worktreeId,
        target: mainWorktree.worktreeId,
      });
      // Kills a mutant that emits the wrong governed_by_worktree_overlay edge.
      expect(graphWithJob.value.edges).toContainEqual({
        relation: "governed_by_worktree_overlay",
        source: linkedWorktree.worktreeId,
        target: `.h2a/overlays/worktrees/${linkedWorktree.worktreeId}.json`,
      });

      // R1 removed-retained state preserves identity, parent origin, overlay and session logs.
      const retained = validateDerivedWorktreeNode({
        ...activated.value,
        lifecycleState: "removed-retained",
        r1RetentionReceiptId: RETENTION_RECEIPT_1,
        updatedAt: LATER_AT,
      });
      // Kills a mutant that rejects a valid removed-retained node with R1 receipt.
      expect(retained.ok).toBe(true);
      if (!retained.ok) {
        return;
      }
      // Kills a mutant that fails to preserve lifecycleState removed-retained.
      expect(retained.value.lifecycleState).toBe("removed-retained");
      // Kills a mutant that drops r1RetentionReceiptId.
      expect(retained.value.r1RetentionReceiptId).toBe(RETENTION_RECEIPT_1);

      const graphAfterRemoval = upsertDerivedWorktreeNode(graphWithJob.value, retained.value);
      // Kills a mutant that rejects upserting a removed-retained node over an active node.
      expect(graphAfterRemoval.ok).toBe(true);
      if (graphAfterRemoval.ok) {
        // Kills a mutant that deletes attached session logs when worktree enters removed-retained.
        expect(graphAfterRemoval.value.edges).toContainEqual({
          relation: "has_session_log",
          source: linkedWorktree.worktreeId,
          target: SESSION_PSEUDO_1,
        });
        // Kills a mutant that deletes raw_event provenance when worktree enters removed-retained.
        expect(graphAfterRemoval.value.edges).toContainEqual({
          relation: "recorded_in_worktree",
          source: EVENT_RECORD_1,
          target: linkedWorktree.worktreeId,
        });
      }

      // Kills a mutant that allows removed-retained without an R1 retention receipt.
      const retainedWithoutReceipt = validateDerivedWorktreeNode({
        ...activated.value,
        lifecycleState: "removed-retained",
      });
      expectClosedRefusal(
        retainedWithoutReceipt,
        "INVALID_LIFECYCLE_STATE",
        "Kills a mutant that admits removed-retained without r1RetentionReceiptId",
      );

      // Optional PullRequestFactDto.mergedAt (B2, S1:1666).
      const mergedWithTimestamp = makePullRequestFact({ mergedAt: 1_763_839_900_000 });
      const mergedWithNull = makePullRequestFact({ mergedAt: null });
      const mergedOmitted: PullRequestFactDto = {
        repositoryOwner: "sentropic",
        repositoryRepo: "engram",
        number: 521,
        state: "merged",
        isDraft: false,
        updatedAt: 1_763_840_000_000,
        headOid: { algorithm: "sha1", oid: SHA1_HEAD },
        headRef: "refs/pull/521/head",
        baseOid: { algorithm: "sha1", oid: SHA1_BASE },
        baseRef: "refs/heads/main",
        mergeOid: { algorithm: "sha1", oid: SHA1_MERGE },
        mergeStrategy: "unknown",
      };
      // Kills a mutant that omits mergedAt from PULL_REQUEST_FACT_KEYS.
      expect(validatePullRequestFact(mergedWithTimestamp).ok).toBe(true);
      // Kills a mutant that rejects mergedAt: null on a PullRequestFactDto.
      expect(validatePullRequestFact(mergedWithNull).ok).toBe(true);
      // Kills a mutant that makes mergedAt mandatory instead of optional.
      expect(validatePullRequestFact(mergedOmitted).ok).toBe(true);
      // Kills a mutant that alters WORKTREE_ORIGIN_KINDS cardinality.
      expect(WORKTREE_ORIGIN_KINDS).toHaveLength(4);
      // Kills a mutant that alters DERIVED_WORKTREE_DIRTY_STATES cardinality.
      expect(DERIVED_WORKTREE_DIRTY_STATES).toHaveLength(5);
      // Kills a mutant that alters DERIVED_WORKTREE_LIVE_INDEXING_STATES cardinality.
      expect(DERIVED_WORKTREE_LIVE_INDEXING_STATES).toHaveLength(6);
      // Kills a mutant that alters DERIVED_WORKTREE_LIFECYCLE_STATES cardinality.
      expect(DERIVED_WORKTREE_LIFECYCLE_STATES).toHaveLength(4);
    },
  );

  it("passive turn recording keeps liveIndexingState unactivated", () => {
    const { clone, mainWorktree } = makeCheckoutIdentities("passive-a01");

    const afterTurn1 = recordPassiveSessionTurn(EMPTY_GRAPH, {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone,
      worktree: mainWorktree,
      worktreePathRef: makePathRef("checkouts/passive-a01"),
      originKind: "main-checkout",
      sessionPseudoId: SESSION_PSEUDO_1,
      eventRecordId: EVENT_RECORD_1,
      observedAt: OBSERVED_AT,
      headOid: { algorithm: "sha1", oid: SHA1_HEAD },
      symbolicBranchRef: "refs/heads/main",
      detached: false,
    });
    // Kills a mutant that rejects passive turn recording on an unactivated checkout.
    expect(afterTurn1.ok).toBe(true);
    if (!afterTurn1.ok) {
      return;
    }
    const node1 = afterTurn1.value.nodes.find(
      (entry) => entry.derivedWorktreeId === mainWorktree.worktreeId,
    );
    // Kills a mutant that fails to create the passive derived_worktree node.
    expect(node1).toBeDefined();
    // Kills a mutant that implicitly activates live indexing on session turn recording (A01).
    expect(node1?.gitState.liveIndexingState).toBe("unactivated");
    // Kills a mutant that fabricates a liveDeclarationId during passive turn recording.
    expect(node1?.gitState.liveDeclarationId).toBeUndefined();
    // Kills a mutant that fabricates a livePublishedGenerationId during passive turn recording.
    expect(node1?.gitState.livePublishedGenerationId).toBeUndefined();
    // Kills a mutant that omits has_session_log on passive turn recording.
    expect(afterTurn1.value.edges).toContainEqual({
      relation: "has_session_log",
      source: mainWorktree.worktreeId,
      target: SESSION_PSEUDO_1,
    });
    // Kills a mutant that omits recorded_in_worktree on passive turn recording.
    expect(afterTurn1.value.edges).toContainEqual({
      relation: "recorded_in_worktree",
      source: EVENT_RECORD_1,
      target: mainWorktree.worktreeId,
    });

    // Recording a second turn refreshes non-activating Git state and path ref while keeping
    // liveIndexingState unactivated and preserving prior provenance.
    const updatedPathRef = makePathRef("checkouts/passive-a01-refreshed");
    const afterTurn2 = recordPassiveSessionTurn(afterTurn1.value, {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone,
      worktree: mainWorktree,
      worktreePathRef: updatedPathRef,
      originKind: "main-checkout",
      sessionPseudoId: SESSION_PSEUDO_2,
      eventRecordId: EVENT_RECORD_2,
      observedAt: UPDATED_AT,
      headOid: { algorithm: "sha1", oid: SHA1_BASE },
      symbolicBranchRef: "refs/heads/feature-e4",
      detached: false,
      dirtyState: "dirty",
    });
    // Kills a mutant that rejects a second passive session turn on the same unactivated worktree.
    expect(afterTurn2.ok).toBe(true);
    if (!afterTurn2.ok) {
      return;
    }
    const node2 = afterTurn2.value.nodes[0];
    // Kills a mutant that flips liveIndexingState on subsequent passive turns.
    expect(node2?.gitState.liveIndexingState).toBe("unactivated");
    // Kills a mutant that discards refreshed headOid on subsequent passive turns (MAJOR 1).
    expect(node2?.gitState.headOid).toEqual({ algorithm: "sha1", oid: SHA1_BASE });
    // Kills a mutant that discards refreshed symbolicBranchRef on subsequent passive turns.
    expect(node2?.gitState.symbolicBranchRef).toBe("refs/heads/feature-e4");
    // Kills a mutant that discards refreshed detached flag on subsequent passive turns.
    expect(node2?.gitState.detached).toBe(false);
    // Kills a mutant that discards refreshed dirtyState on subsequent passive turns.
    expect(node2?.gitState.dirtyState).toBe("dirty");
    // Kills a mutant that leaves gitState.observedAt frozen on subsequent passive turns.
    expect(node2?.gitState.observedAt).toBe(UPDATED_AT);
    // Kills a mutant that discards refreshed worktreePathRef on subsequent passive turns.
    expect(node2?.worktreePathRef).toEqual(updatedPathRef);
    // Kills a mutant that fails to update pinned_at_head edge after a passive turn HEAD change.
    expect(afterTurn2.value.edges).toContainEqual({
      relation: "pinned_at_head",
      source: mainWorktree.worktreeId,
      target: `sha1:${SHA1_BASE}`,
    });
    // Kills a mutant that fails to update tracks_branch edge after a passive turn branch change.
    expect(afterTurn2.value.edges).toContainEqual({
      relation: "tracks_branch",
      source: mainWorktree.worktreeId,
      target: "refs/heads/feature-e4",
    });
    // Kills a mutant that drops earlier session log edges when appending a new turn.
    expect(afterTurn2.value.edges).toContainEqual({
      relation: "has_session_log",
      source: mainWorktree.worktreeId,
      target: SESSION_PSEUDO_1,
    });
    // Kills a mutant that fails to append the new session log edge on a subsequent passive turn.
    expect(afterTurn2.value.edges).toContainEqual({
      relation: "has_session_log",
      source: mainWorktree.worktreeId,
      target: SESSION_PSEUDO_2,
    });

    // Omitting optional Git fields preserves prior headOid/branch/dirtyState; detached: true clears
    // symbolicBranchRef; explicit headOid: null clears headOid.
    const afterTurn3 = recordPassiveSessionTurn(afterTurn2.value, {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone,
      worktree: mainWorktree,
      worktreePathRef: makePathRef("checkouts/passive-a01-partial"),
      originKind: "main-checkout",
      sessionPseudoId: SESSION_PSEUDO_2,
      eventRecordId: "raw_event_0003",
      observedAt: LATER_AT,
    });
    expect(afterTurn3.ok).toBe(true);
    if (afterTurn3.ok) {
      const node3 = afterTurn3.value.nodes[0]!;
      // Kills a mutant that wipes headOid/branch/dirtyState when omitted on a subsequent passive turn.
      expect(node3.gitState.headOid).toEqual({ algorithm: "sha1", oid: SHA1_BASE });
      expect(node3.gitState.symbolicBranchRef).toBe("refs/heads/feature-e4");
      expect(node3.gitState.dirtyState).toBe("dirty");
      expect(node3.gitState.observedAt).toBe(LATER_AT);
      const afterDetach = recordPassiveSessionTurn(afterTurn3.value, {
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        clone,
        worktree: mainWorktree,
        worktreePathRef: makePathRef("checkouts/passive-a01-detached"),
        originKind: "main-checkout",
        sessionPseudoId: SESSION_PSEUDO_2,
        eventRecordId: "raw_event_0004",
        observedAt: LATER_AT,
        headOid: null,
        detached: true,
      });
      expect(afterDetach.ok).toBe(true);
      if (afterDetach.ok) {
        const detachedNode = afterDetach.value.nodes[0]!;
        // Kills a mutant that leaves stale branch or headOid when passive turn detaches/clears HEAD.
        expect(detachedNode.gitState.detached).toBe(true);
        expect(detachedNode.gitState.symbolicBranchRef).toBeNull();
        expect(detachedNode.gitState.headOid).toBeNull();
        expect(
          afterDetach.value.edges.some(
            (e) => e.relation === "tracks_branch" || e.relation === "pinned_at_head",
          ),
        ).toBe(false);
      }
    }

    // Recording a passive turn onto an already-activated, removed-retained node refreshes
    // non-activating Git state and path ref while preserving activation, lifecycle and receipt.
    const declId = deriveDeclarationIdentity({
      hostScope: HOST_SCOPE,
      clone,
      worktree: mainWorktree,
    });
    const decl = createLiveDeclaration({
      tenant: TENANT_ID,
      principal: "owner:local",
      hostFingerprint: WS_FINGERPRINT,
      identityUncertainty: [],
      declarationId: declId.declarationId,
      cloneId: clone.cloneId,
      worktreeId: mainWorktree.worktreeId,
      authorizedRoots: [mainWorktree.worktreePath],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
    });
    const activatedRetained = buildDerivedWorktreeNode({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone,
      worktree: mainWorktree,
      worktreePathRef: makePathRef("checkouts/activated-before"),
      originKind: "main-checkout",
      stableCapture: makeStableCapture(),
      declaration: decl,
      liveIndexingState: "current",
      livePublishedGenerationId: "gen:0000000009",
      lifecycleState: "removed-retained",
      r1RetentionReceiptId: RETENTION_RECEIPT_1,
      symbolicBranchRef: "refs/heads/main",
      detached: false,
      dirtyState: "clean",
      observedAt: OBSERVED_AT,
      createdAt: CREATED_AT,
      updatedAt: OBSERVED_AT,
    });
    expect(activatedRetained.ok).toBe(true);
    if (activatedRetained.ok) {
      const seededActivated = upsertDerivedWorktreeNode(EMPTY_GRAPH, activatedRetained.value);
      expect(seededActivated.ok).toBe(true);
      if (seededActivated.ok) {
        const detachedPathRef = makePathRef("checkouts/activated-after");
        const afterActivatedTurn = recordPassiveSessionTurn(seededActivated.value, {
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          clone,
          worktree: mainWorktree,
          worktreePathRef: detachedPathRef,
          originKind: "main-checkout",
          sessionPseudoId: SESSION_PSEUDO_1,
          eventRecordId: EVENT_RECORD_1,
          observedAt: LATER_AT,
          headOid: { algorithm: "sha1", oid: SHA1_MERGE },
          symbolicBranchRef: null,
          detached: true,
          dirtyState: "staged-only",
        });
        expect(afterActivatedTurn.ok).toBe(true);
        if (afterActivatedTurn.ok) {
          const merged = afterActivatedTurn.value.nodes[0]!;
          // Kills a mutant that drops refreshed Git fields when updating an activated node.
          expect(merged.gitState.headOid).toEqual({ algorithm: "sha1", oid: SHA1_MERGE });
          expect(merged.gitState.symbolicBranchRef).toBeNull();
          expect(merged.gitState.detached).toBe(true);
          expect(merged.gitState.dirtyState).toBe("staged-only");
          expect(merged.gitState.observedAt).toBe(LATER_AT);
          expect(merged.worktreePathRef).toEqual(detachedPathRef);
          // Kills a mutant that clobbers live activation or digests during a passive turn.
          expect(merged.gitState.liveIndexingState).toBe("current");
          expect(merged.gitState.liveDeclarationId).toBe(decl.declarationId);
          expect(merged.gitState.livePublishedGenerationId).toBe("gen:0000000009");
          expect(merged.gitState.indexDigest).toBe(activatedRetained.value.gitState.indexDigest);
          expect(merged.gitState.workingTreeFingerprint).toBe(
            activatedRetained.value.gitState.workingTreeFingerprint,
          );
          // Kills a mutant that clobbers lifecycleState, R1 receipt, or createdAt during a passive turn.
          expect(merged.lifecycleState).toBe("removed-retained");
          expect(merged.r1RetentionReceiptId).toBe(RETENTION_RECEIPT_1);
          expect(merged.createdAt).toBe(CREATED_AT);
          expect(merged.updatedAt).toBe(LATER_AT);
        }
      }
    }

    // Kills a mutant that allows smuggling live activation keys into passive turn recording.
    for (const smuggled of [
      { liveIndexingState: "current" },
      { liveCapability: "live" },
      { liveDeclarationId: `decl:${"9".repeat(64)}` },
      { declaration: {} },
    ]) {
      const refused = recordPassiveSessionTurn(EMPTY_GRAPH, {
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        clone,
        worktree: mainWorktree,
        worktreePathRef: makePathRef("checkouts/passive-a01"),
        originKind: "main-checkout",
        sessionPseudoId: SESSION_PSEUDO_1,
        eventRecordId: EVENT_RECORD_1,
        observedAt: OBSERVED_AT,
        ...smuggled,
      });
      expectClosedRefusal(
        refused,
        "PASSIVE_ACTIVATION_FORBIDDEN",
        `Kills a mutant that accepts smuggled activation key ${Object.keys(smuggled)[0]} in passive turn`,
      );
    }

    // Kills a mutant that allows an unactivated node to carry a liveDeclarationId.
    const unactivatedWithDecl = validateDerivedWorktreeNode({
      ...makeValidNode(),
      gitState: {
        ...makeValidNode().gitState,
        liveIndexingState: "unactivated",
        liveDeclarationId: `decl:${"8".repeat(64)}`,
      },
    });
    expectClosedRefusal(
      unactivatedWithDecl,
      "INVALID_GIT_STATE",
      "Kills a mutant that allows liveDeclarationId while liveIndexingState is unactivated",
    );

    // Kills a mutant that allows an active liveIndexingState without a liveDeclarationId.
    const activeWithoutDecl = validateDerivedWorktreeNode({
      ...makeValidNode(),
      gitState: {
        ...makeValidNode().gitState,
        liveIndexingState: "current",
      },
    });
    expectClosedRefusal(
      activeWithoutDecl,
      "INVALID_GIT_STATE",
      "Kills a mutant that allows liveIndexingState=current without liveDeclarationId",
    );
  });

  it(
    "the product predicate and derived-worktree record acceptance agree on the shared vector, "
      + "with no second definition of isValidWorktreeId",
    async () => {
      const baseMain = makeValidNode();
      const baseChild = makeValidChildNode();
      const validHexA = "0123456789abcdef".repeat(4);
      const validHexB = "fedcba9876543210".repeat(4);

      const sharedVector: readonly unknown[] = [
        `wt:${validHexA}`,
        `wt:${validHexB}`,
        `wt:${"0".repeat(64)}`,
        `wt:${"f".repeat(64)}`,
        `wt:${"a".repeat(63)}`,
        `wt:${"a".repeat(65)}`,
        `wt:${"A".repeat(64)}`,
        `wt:${validHexA.slice(0, 63)}A`,
        `wt:${validHexA.slice(0, 63)}g`,
        `wt:${validHexA}\n`,
        `\nwt:${validHexA}`,
        ` wt:${validHexA}`,
        `wt:${validHexA} `,
        `wt:${validHexA.slice(0, 63)}\0`,
        `wt:${validHexA.slice(0, 63)}é`,
        "wt:",
        "wt:packed",
        "wt",
        `WT:${validHexA}`,
        `clone:${validHexA}`,
        `decl:${validHexA}`,
        `sha256:${validHexA}`,
        "/home/dev/workspace",
        "C:\\Users\\dev\\workspace",
        "~/workspace",
        "file:///tmp/wt",
        "",
        null,
        undefined,
        0,
        123,
        true,
        false,
        {},
        [],
        Symbol("wt"),
      ];

      for (const candidate of sharedVector) {
        const productAccepted = isValidWorktreeId(candidate);
        const overlayPath = typeof candidate === "string"
          ? `.h2a/overlays/worktrees/${candidate}.json`
          : baseMain.harnessOverlayRelPath;
        const derivedNodeAccepted = validateDerivedWorktreeNode({
          ...baseMain,
          derivedWorktreeId: candidate as string,
          harnessOverlayRelPath: overlayPath,
        }).ok;
        // Kills a mutant where derivedWorktreeId acceptance diverges from isValidWorktreeId.
        expect(
          derivedNodeAccepted,
          `derivedWorktreeId agreement on ${String(candidate)}`,
        ).toBe(productAccepted);

        const parentCandidate = candidate === baseChild.derivedWorktreeId
          ? `wt:${validHexB}`
          : candidate;
        const parentProductAccepted = isValidWorktreeId(parentCandidate);
        const parentRes = validateDerivedWorktreeNode({
          ...baseChild,
          parentOrigin: {
            ...baseChild.parentOrigin,
            parentWorktreeId: parentCandidate as string,
          },
        });
        if (parentCandidate === undefined) {
          // Kills a mutant that rejects explicit undefined on optional parentWorktreeId.
          expect(parentRes.ok, "explicit undefined optional parentWorktreeId").toBe(true);
          if (parentRes.ok) {
            expect(parentRes.value.parentOrigin.parentWorktreeId).toBeUndefined();
          }
        } else {
          // Kills a mutant where parentWorktreeId acceptance diverges from isValidWorktreeId.
          expect(
            parentRes.ok,
            `parentWorktreeId agreement on ${String(parentCandidate)}`,
          ).toBe(parentProductAccepted);
        }
      }

      // AST guard: ZERO declarations or exports of isValidWorktreeId anywhere under engram-live/.
      const liveFiles = listAllLiveTsFiles(LIVE_ROOT);
      // Kills a mutant where listAllLiveTsFiles skips engram-live/derived-worktree-graph.ts.
      expect(liveFiles).toContain("derived-worktree-graph.ts");
      expect(liveFiles).toContain("contracts.ts");
      for (const rel of liveFiles) {
        const content = readFileSync(join(LIVE_ROOT, rel), "utf8");
        const hits = findDeclaredOrExportedNames(content, "isValidWorktreeId");
        // Kills a mutant that redeclares or re-exports isValidWorktreeId inside engram-live/.
        expect(hits, `engram-live/${rel} must never declare or export isValidWorktreeId`).toEqual([]);
      }

      // Runtime export guard: no engram-live entry exports isValidWorktreeId.
      const liveIndex = await import("../engram-live/index.js");
      const liveContracts = await import("../engram-live/contracts.js");
      const liveDerived = await import("../engram-live/derived-worktree-graph.js");
      // Kills a mutant that exports isValidWorktreeId from engram-live/index.ts.
      expect(Object.hasOwn(liveIndex, "isValidWorktreeId")).toBe(false);
      // Kills a mutant that exports isValidWorktreeId from engram-live/contracts.ts.
      expect(Object.hasOwn(liveContracts, "isValidWorktreeId")).toBe(false);
      // Kills a mutant that exports isValidWorktreeId from engram-live/derived-worktree-graph.ts.
      expect(Object.hasOwn(liveDerived, "isValidWorktreeId")).toBe(false);

      // Positive control: the ONE definition exists in src/session-front-contracts.ts.
      const productSource = readFileSync(join(ROOT, "src", "session-front-contracts.ts"), "utf8");
      // Kills a mutant where the AST scanner fails to detect a real isValidWorktreeId declaration.
      expect(findDeclaredOrExportedNames(productSource, "isValidWorktreeId")).toEqual([
        "declaration:isValidWorktreeId",
      ]);
    },
  );

  it("hostile inputs never throw and are closed-refused at every entry point", () => {
    const base = makeValidNode();
    const throwingProxy = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("hostile getPrototypeOf trap");
        },
        ownKeys() {
          throw new Error("hostile ownKeys trap");
        },
        getOwnPropertyDescriptor() {
          throw new Error("hostile descriptor trap");
        },
      },
    );

    const protoKeyNode = JSON.parse(
      `{"__proto__":{"polluted":true},"nodeType":"derived_worktree"}`,
    ) as unknown;

    let getterInvoked = false;
    const getterNode = { ...base };
    Object.defineProperty(getterNode, "tenantId", {
      enumerable: true,
      configurable: true,
      get() {
        getterInvoked = true;
        return TENANT_ID;
      },
    });

    const nonEnumerableNode = { ...base };
    Object.defineProperty(nonEnumerableNode, "hidden", {
      enumerable: false,
      value: "secret-hidden",
    });

    const symbolKeyNode: Record<PropertyKey, unknown> = { ...base };
    symbolKeyNode[Symbol("smuggled")] = "value";

    const inheritedProto = Object.create({ tenantId: TENANT_ID });
    Object.assign(inheritedProto, base);

    const circular: Record<string, unknown> = { ...base };
    circular.self = circular;

    const arrayWithExtraProp = Object.assign(["missing_history"], { extra: true });
    const arrayWithGetter = ["missing_history"];
    Object.defineProperty(arrayWithGetter, "0", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "missing_history";
      },
    });

    const nfcCollisionNode: Record<string, unknown> = { ...base };
    nfcCollisionNode["e\u0301"] = 1;
    nfcCollisionNode["\u00e9"] = 2;

    const unpairedSurrogateNode = {
      ...base,
      tenantId: "tenant-\uD800-bad",
    };

    const hostileValues: readonly unknown[] = [
      undefined,
      null,
      false,
      0,
      -0,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      BigInt(1),
      "string",
      Symbol("hostile"),
      () => {},
      [],
      new Date(),
      /regex/,
      new Map(),
      new Set(),
      new Uint8Array([1, 2, 3]),
      throwingProxy,
      protoKeyNode,
      getterNode,
      nonEnumerableNode,
      symbolKeyNode,
      inheritedProto,
      circular,
      nfcCollisionNode,
      unpairedSurrogateNode,
      { ...base, unknownKey: "x" },
      { ...base, parentOrigin: { ...base.parentOrigin, identityUncertainty: arrayWithExtraProp } },
      { ...base, parentOrigin: { ...base.parentOrigin, identityUncertainty: arrayWithGetter } },
      { ...base, worktreePathRef: { ...base.worktreePathRef, byteLength: -0 } },
      { ...base, worktreePathRef: { ...base.worktreePathRef, byteLength: 1.5 } },
      { ...base, worktreePathRef: { ...base.worktreePathRef, byteLength: Number.MAX_SAFE_INTEGER + 1 } },
      { ...base, createdAt: "2026-02-30T00:00:00.000Z" },
      { ...base, createdAt: UPDATED_AT, updatedAt: CREATED_AT },
      { ...base, gitState: { ...base.gitState, detached: true, symbolicBranchRef: "refs/heads/main" } },
    ];

    const { clone, mainWorktree } = makeCheckoutIdentities("decl-hostile");
    for (const hostile of hostileValues) {
      // Kills a mutant that throws or accepts hostile input in validateDerivedWorktreeNode.
      expect(validateDerivedWorktreeNode(hostile).ok).toBe(false);
      // Kills a mutant that throws or accepts hostile input in buildDerivedWorktreeNode.
      expect(buildDerivedWorktreeNode(hostile).ok).toBe(false);
      // Kills a mutant that throws or accepts hostile stableCapture in buildDerivedWorktreeNode.
      if (hostile !== undefined) {
        expect(
          buildDerivedWorktreeNode({
            tenantId: TENANT_ID,
            workspaceId: WORKSPACE_ID,
            clone,
            worktree: mainWorktree,
            worktreePathRef: makePathRef("checkouts/hostile-cap"),
            originKind: "main-checkout",
            stableCapture: hostile,
            observedAt: OBSERVED_AT,
          }).ok,
        ).toBe(false);
      }
      // Kills a mutant that throws or accepts hostile graph in upsertDerivedWorktreeNode.
      expect(upsertDerivedWorktreeNode(hostile, base).ok).toBe(false);
      // Kills a mutant that throws or accepts hostile input in recordPassiveSessionTurn.
      expect(recordPassiveSessionTurn(EMPTY_GRAPH, hostile).ok).toBe(false);
    }

    // Kills a mutant that accepts a forged graph edge carrying a raw host path.
    const forgedEdgeGraph = {
      nodes: [base],
      edges: [
        {
          relation: "derived_from_clone",
          source: "/home/alice/raw",
          target: base.cloneId,
        },
      ],
    };
    expectClosedRefusal(
      upsertDerivedWorktreeNode(forgedEdgeGraph, base),
      "INVALID_WORKTREE_ID",
      "Kills a mutant that accepts raw host paths inside graph edges",
      "alice",
    );

    // Kills a mutant that invokes getters on declaration.authorizedRoots when building a node.
    const declId = deriveDeclarationIdentity({
      hostScope: HOST_SCOPE,
      clone,
      worktree: mainWorktree,
    });
    const validDecl = createLiveDeclaration({
      tenant: TENANT_ID,
      principal: "owner:local",
      hostFingerprint: WS_FINGERPRINT,
      identityUncertainty: [],
      declarationId: declId.declarationId,
      cloneId: clone.cloneId,
      worktreeId: mainWorktree.worktreeId,
      authorizedRoots: [mainWorktree.worktreePath],
      liveCapability: "live",
      policyVersion: POLICY_VERSION,
    });
    const getterRoots = [mainWorktree.worktreePath];
    Object.defineProperty(getterRoots, "0", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return mainWorktree.worktreePath;
      },
    });
    const hostileDecl = { ...validDecl, authorizedRoots: getterRoots };
    // Kills a mutant that executes getter elements on declaration.authorizedRoots.
    expect(
      buildDerivedWorktreeNode({
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        clone,
        worktree: mainWorktree,
        worktreePathRef: makePathRef("checkouts/decl-hostile"),
        originKind: "main-checkout",
        declaration: hostileDecl,
        observedAt: OBSERVED_AT,
      }).ok,
    ).toBe(false);

    // Kills a mutant that skips worktreePathRef validation on passive turns for existing nodes.
    const seededGraph = recordPassiveSessionTurn(EMPTY_GRAPH, {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone,
      worktree: mainWorktree,
      worktreePathRef: makePathRef("checkouts/decl-hostile"),
      originKind: "main-checkout",
      sessionPseudoId: SESSION_PSEUDO_1,
      eventRecordId: EVENT_RECORD_1,
      observedAt: OBSERVED_AT,
    });
    // Kills a mutant that fails to seed the existing node before testing poisoned update rejection.
    expect(seededGraph.ok).toBe(true);
    if (seededGraph.ok) {
      const poisonedUpdate = recordPassiveSessionTurn(seededGraph.value, {
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        clone,
        worktree: mainWorktree,
        worktreePathRef: makePathRef("/home/alice/secret"),
        originKind: "main-checkout",
        sessionPseudoId: SESSION_PSEUDO_2,
        eventRecordId: EVENT_RECORD_2,
        observedAt: UPDATED_AT,
      });
      expectClosedRefusal(
        poisonedUpdate,
        "INVALID_PATH_REF",
        "Kills a mutant that skips worktreePathRef validation when updating an existing node",
        "alice",
      );
    }

    // Kills a mutant that accepts nested circular references inside pathRef.lineRange.
    const cyclicPathRef: Record<string, unknown> = { ...makePathRef("checkouts/cycle") };
    cyclicPathRef.lineRange = cyclicPathRef;
    // Kills a mutant that recurses or accepts a nested circular reference inside pathRef.lineRange.
    expect(
      validateDerivedWorktreeNode({ ...base, worktreePathRef: cyclicPathRef }).ok,
    ).toBe(false);

    // Kills a mutant that invokes accessor getters instead of checking property descriptors first.
    expect(getterInvoked).toBe(false);
  });

  it("validates every StableCapture file field, explicit undefined optionals, and graph scope/edge invariants", () => {
    const { clone, mainWorktree, linkedWorktree } = makeCheckoutIdentities("r1-hardening");
    const baseBuild = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone,
      worktree: mainWorktree,
      worktreePathRef: makePathRef("checkouts/r1-hardening"),
      originKind: "main-checkout" as const,
      observedAt: OBSERVED_AT,
    };

    // MAJOR 3: invalid mode, indexOid, exclusionReason, or stageOids on StableCapture.files refused.
    const badFileCases: readonly Record<string, unknown>[] = [
      { mode: "not-octal" },
      { mode: { nested: "bad" } },
      { indexOid: "not-a-hex-oid" },
      { indexOid: "a".repeat(64) },
      { exclusionReason: "invented-reason" },
      { exclusionReason: 123 },
      { stageOids: { "0": SHA1_HEAD } },
      { stageOids: { "4": SHA1_HEAD } },
      { stageOids: { "1": "not-an-oid" } },
      { stageOids: { "1": "a".repeat(64) } },
    ];
    for (const badFields of badFileCases) {
      const badCapture = makeStableCapture({
        files: [
          {
            path: new TextEncoder().encode("src/index.ts"),
            status: "present",
            kind: "file",
            ...badFields,
          } as unknown as StableCapture["files"][number],
        ],
      });
      const res = buildDerivedWorktreeNode({ ...baseBuild, stableCapture: badCapture });
      expectClosedRefusal(
        res,
        "INVALID_GIT_STATE",
        `Kills a mutant that accepts unvalidated StableCapture file field ${JSON.stringify(badFields)}`,
      );
    }

    // MAJOR 3: valid mode, indexOid, exclusionReason, stageOids and canonical tiebreaker across
    // duplicate (path, status, kind).
    const fileVariantA: StableCapture["files"][number] = {
      path: new TextEncoder().encode("src/conflict.ts"),
      status: "excluded",
      kind: "conflict",
      mode: "100644",
      indexOid: SHA1_BASE,
      exclusionReason: "oversized",
      stageOids: { "1": SHA1_BASE, "2": SHA1_HEAD, "3": SHA1_MERGE },
      size: 2048,
      fingerprint: undefined,
      linkTarget: undefined,
      blobVerified: undefined,
      textconv: undefined,
    };
    const fileVariantB: StableCapture["files"][number] = {
      path: new TextEncoder().encode("src/conflict.ts"),
      status: "excluded",
      kind: "conflict",
      mode: "100755",
      indexOid: SHA1_HEAD,
      exclusionReason: "protected",
      stageOids: { "1": SHA1_HEAD, "2": SHA1_MERGE },
      size: 512,
    };
    const capAB = buildDerivedWorktreeNode({
      ...baseBuild,
      stableCapture: makeStableCapture({ files: [fileVariantA, fileVariantB] }),
    });
    const capBA = buildDerivedWorktreeNode({
      ...baseBuild,
      stableCapture: makeStableCapture({ files: [fileVariantB, fileVariantA] }),
    });
    // Kills a mutant that rejects valid stageOids/exclusionReason/explicit-undefined file fields.
    expect(capAB.ok).toBe(true);
    expect(capBA.ok).toBe(true);
    if (capAB.ok && capBA.ok) {
      // Kills a mutant whose StableCapture file sort lacks a canonical tiebreaker beyond (path,status,kind).
      expect(capAB.value.gitState.workingTreeFingerprint).toBe(
        capBA.value.gitState.workingTreeFingerprint,
      );
    }

    // MINOR 1: explicit undefined on optional properties is treated as absent everywhere.
    const explicitUndefinedBuild = buildDerivedWorktreeNode({
      ...baseBuild,
      worktreePathRef: {
        ...makePathRef("checkouts/opt-undef"),
        byteLength: undefined,
        lineRange: undefined,
      },
      parentWorktreeId: undefined,
      baseRefName: undefined,
      baseCommitOid: undefined,
      durableWorkspaceFingerprint: undefined,
      identityUncertainty: undefined,
      headOid: undefined,
      symbolicBranchRef: undefined,
      detached: undefined,
      dirtyState: undefined,
      stableCapture: undefined,
      declaration: undefined,
      liveIndexingState: undefined,
      livePublishedGenerationId: undefined,
      lifecycleState: undefined,
      r1RetentionReceiptId: undefined,
      harnessOverlayRelPath: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    });
    // Kills a mutant that rejects explicit undefined on optional buildDerivedWorktreeNode properties.
    expect(explicitUndefinedBuild.ok).toBe(true);
    if (explicitUndefinedBuild.ok) {
      const explicitUndefinedNode = validateDerivedWorktreeNode({
        ...explicitUndefinedBuild.value,
        r1RetentionReceiptId: undefined,
        worktreePathRef: {
          ...explicitUndefinedBuild.value.worktreePathRef,
          byteLength: undefined,
          lineRange: undefined,
        },
        parentOrigin: {
          ...explicitUndefinedBuild.value.parentOrigin,
          parentWorktreeId: undefined,
          baseRefName: undefined,
          baseCommitOid: undefined,
          durableWorkspaceFingerprint: undefined,
        },
        gitState: {
          ...explicitUndefinedBuild.value.gitState,
          indexDigest: undefined,
          workingTreeFingerprint: undefined,
          liveDeclarationId: undefined,
          livePublishedGenerationId: undefined,
        },
      });
      // Kills a mutant that rejects explicit undefined on optional DerivedWorktreeNodeV1 properties.
      expect(explicitUndefinedNode.ok).toBe(true);
      const explicitUndefinedAtt = upsertDerivedWorktreeNode(
        EMPTY_GRAPH,
        explicitUndefinedBuild.value,
        {
          sessionPseudoIds: undefined,
          eventRecordIds: undefined,
          snapshotRefs: undefined,
        },
      );
      // Kills a mutant that rejects explicit undefined on optional attachment properties.
      expect(explicitUndefinedAtt.ok).toBe(true);
      // Kills a mutant that admits unknown keys even when their value is undefined.
      const unknownUndef = validateDerivedWorktreeNode({
        ...explicitUndefinedBuild.value,
        unexpectedKey: undefined,
      });
      expectClosedRefusal(
        unknownUndef,
        "INVALID_INPUT",
        "Kills a mutant that ignores unknown keys whose value is undefined",
      );
    }

    // MINOR 3: tenantId/workspaceId checks on parent links and structural edge consistency in decodeGraph.
    const parentNodeRes = buildDerivedWorktreeNode(baseBuild);
    const childOtherTenantRes = buildDerivedWorktreeNode({
      ...baseBuild,
      tenantId: "tenant:other",
      worktree: linkedWorktree,
      originKind: "linked-worktree",
      parentWorktreeId: mainWorktree.worktreeId,
    });
    const childOtherWorkspaceRes = buildDerivedWorktreeNode({
      ...baseBuild,
      workspaceId: "ws-scope:other",
      worktree: linkedWorktree,
      originKind: "linked-worktree",
      parentWorktreeId: mainWorktree.worktreeId,
    });
    expect(parentNodeRes.ok && childOtherTenantRes.ok && childOtherWorkspaceRes.ok).toBe(true);
    if (parentNodeRes.ok && childOtherTenantRes.ok && childOtherWorkspaceRes.ok) {
      const parentGraph = upsertDerivedWorktreeNode(EMPTY_GRAPH, parentNodeRes.value);
      expect(parentGraph.ok).toBe(true);
      if (parentGraph.ok) {
        // Kills a mutant that allows parentWorktreeId across different tenantId in upsert.
        expectClosedRefusal(
          upsertDerivedWorktreeNode(parentGraph.value, childOtherTenantRes.value),
          "CROSS_CLONE_MERGE_FORBIDDEN",
          "Kills a mutant that allows cross-tenant parentWorktreeId in upsert",
        );
        // Kills a mutant that allows parentWorktreeId across different workspaceId in upsert.
        expectClosedRefusal(
          upsertDerivedWorktreeNode(parentGraph.value, childOtherWorkspaceRes.value),
          "CROSS_CLONE_MERGE_FORBIDDEN",
          "Kills a mutant that allows cross-workspace parentWorktreeId in upsert",
        );
        // Kills a mutant that allows cross-tenant parent links in decodeGraph.
        expectClosedRefusal(
          upsertDerivedWorktreeNode(
            { nodes: [parentNodeRes.value, childOtherTenantRes.value], edges: [] },
            parentNodeRes.value,
          ),
          "CROSS_CLONE_MERGE_FORBIDDEN",
          "Kills a mutant that allows cross-tenant parent links inside decodeGraph",
        );
        // Kills a mutant that skips derived_from_clone edge vs node.cloneId consistency in decodeGraph.
        const wrongCloneEdgeGraph = {
          nodes: [parentNodeRes.value],
          edges: [
            {
              relation: "derived_from_clone",
              source: parentNodeRes.value.derivedWorktreeId,
              target: `clone:${"9".repeat(64)}`,
            },
          ],
        };
        expectClosedRefusal(
          upsertDerivedWorktreeNode(wrongCloneEdgeGraph, parentNodeRes.value),
          "CROSS_CLONE_MERGE_FORBIDDEN",
          "Kills a mutant that accepts mismatched derived_from_clone edge in decodeGraph",
        );
        // Kills a mutant that skips governed_by_worktree_overlay edge vs node overlay consistency.
        const wrongOverlayEdgeGraph = {
          nodes: [parentNodeRes.value],
          edges: [
            {
              relation: "governed_by_worktree_overlay",
              source: parentNodeRes.value.derivedWorktreeId,
              target: `.h2a/overlays/worktrees/${parentNodeRes.value.derivedWorktreeId.slice(3)}.json`,
            },
          ],
        };
        expectClosedRefusal(
          upsertDerivedWorktreeNode(wrongOverlayEdgeGraph, parentNodeRes.value),
          "INVALID_OVERLAY_PATH",
          "Kills a mutant that accepts mismatched governed_by_worktree_overlay edge in decodeGraph",
        );
      }
    }

    // MAJOR 2: single strict plain-record decoder and single surrogate regex in contracts.ts only.
    const derivedSource = readFileSync(join(LIVE_ROOT, "derived-worktree-graph.ts"), "utf8");
    const contractsSource = readFileSync(join(LIVE_ROOT, "contracts.ts"), "utf8");
    // Kills a mutant that re-introduces a duplicate strict plain-object decoder or surrogate regex.
    expect(findDeclaredOrExportedNames(derivedSource, "readStrictPlainObject")).toEqual([]);
    expect(derivedSource).not.toContain("\\uD800");
    expect(findDeclaredOrExportedNames(contractsSource, "readStrictPlainRecord")).toEqual([
      "declaration:readStrictPlainRecord",
    ]);
  });

  it("validatePullRequestFact accepts optional mergedAt and refuses malformed or incoherent mergedAt values", () => {
    const openNoMergedAt = makePullRequestFact({
      state: "open",
      mergeOid: null,
      mergeStrategy: undefined,
      mergedAt: undefined,
    });
    const openNullMergedAt = makePullRequestFact({
      state: "open",
      mergeOid: null,
      mergeStrategy: undefined,
      mergedAt: null,
    });
    // Kills a mutant that rejects open PRs when mergedAt is absent or null.
    expect(validatePullRequestFact(openNoMergedAt).ok).toBe(true);
    expect(validatePullRequestFact(openNullMergedAt).ok).toBe(true);

    const closedNullMergedAt = makePullRequestFact({
      state: "closed",
      mergeOid: null,
      mergeStrategy: undefined,
      mergedAt: null,
    });
    // Kills a mutant that rejects closed PRs when mergedAt is null.
    expect(validatePullRequestFact(closedNullMergedAt).ok).toBe(true);

    const openWithNumericMergedAt = makePullRequestFact({
      state: "open",
      mergeOid: null,
      mergeStrategy: undefined,
      mergedAt: 1_763_839_900_000,
    });
    // Kills a mutant that accepts a non-null numeric mergedAt on an open PR.
    expect(validatePullRequestFact(openWithNumericMergedAt).ok).toBe(false);

    const closedWithNumericMergedAt = makePullRequestFact({
      state: "closed",
      mergeOid: null,
      mergeStrategy: undefined,
      mergedAt: 1_763_839_900_000,
    });
    // Kills a mutant that accepts a non-null numeric mergedAt on a closed unmerged PR.
    expect(validatePullRequestFact(closedWithNumericMergedAt).ok).toBe(false);

    const badMergedAtValues: readonly unknown[] = [
      0,
      -0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      "2026-11-22T18:00:00.000Z",
      "1763839900000",
      true,
      false,
      {},
      [],
    ];
    for (const badMergedAt of badMergedAtValues) {
      const checked = validatePullRequestFact({
        ...makePullRequestFact(),
        mergedAt: badMergedAt,
      });
      // Kills a mutant that admits malformed mergedAt value.
      expect(
        checked.ok,
        `Kills a mutant that admits mergedAt=${String(badMergedAt)}`,
      ).toBe(false);
    }

    // Hostile object checks on validatePullRequestFact: getters, __proto__, symbols, throwing Proxy.
    let prGetterInvoked = false;
    const getterFact = { ...makePullRequestFact() };
    Object.defineProperty(getterFact, "mergedAt", {
      enumerable: true,
      get() {
        prGetterInvoked = true;
        return 1_763_839_900_000;
      },
    });
    // Kills a mutant that triggers accessor getters in validatePullRequestFact.
    expect(validatePullRequestFact(getterFact).ok).toBe(false);
    expect(prGetterInvoked).toBe(false);

    const protoFact = JSON.parse(
      `{"__proto__":{"token":"leak"},${JSON.stringify(makePullRequestFact()).slice(1)}`,
    ) as unknown;
    // Kills a mutant that accepts own __proto__ property on PullRequestFactDto.
    expect(validatePullRequestFact(protoFact).ok).toBe(false);

    const symFact: Record<PropertyKey, unknown> = { ...makePullRequestFact() };
    symFact[Symbol("extra")] = "x";
    // Kills a mutant that accepts symbol keys on PullRequestFactDto.
    expect(validatePullRequestFact(symFact).ok).toBe(false);

    const throwingProxy = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("boom");
        },
      },
    );
    // Kills a mutant that throws instead of returning { ok: false } on a hostile Proxy.
    expect(validatePullRequestFact(throwingProxy).ok).toBe(false);

    const nfcFact: Record<string, unknown> = { ...makePullRequestFact() };
    nfcFact["e\u0301"] = 1;
    nfcFact["\u00e9"] = 2;
    // Kills a mutant that accepts NFC-colliding keys on PullRequestFactDto.
    expect(validatePullRequestFact(nfcFact).ok).toBe(false);

    let nestedGetterInvoked = false;
    const nestedHead = { algorithm: "sha1", oid: SHA1_HEAD };
    Object.defineProperty(nestedHead, "oid", {
      enumerable: true,
      get() {
        nestedGetterInvoked = true;
        return SHA1_HEAD;
      },
    });
    // Kills a mutant that invokes getters on nested headOid inside validatePullRequestFact.
    expect(validatePullRequestFact({ ...makePullRequestFact(), headOid: nestedHead }).ok).toBe(false);
    expect(nestedGetterInvoked).toBe(false);
  });

  it("out-of-order passive turn observedAt keeps newer Git state and still records provenance edges", () => {
    const { clone, mainWorktree } = makeCheckoutIdentities("passive-out-of-order");
    const newerPathRef = makePathRef("checkouts/out-of-order-newer");
    const stalePathRef = makePathRef("checkouts/out-of-order-stale");

    const afterNewer = recordPassiveSessionTurn(EMPTY_GRAPH, {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone,
      worktree: mainWorktree,
      worktreePathRef: newerPathRef,
      originKind: "main-checkout",
      sessionPseudoId: SESSION_PSEUDO_1,
      eventRecordId: EVENT_RECORD_1,
      observedAt: UPDATED_AT,
      headOid: { algorithm: "sha1", oid: SHA1_HEAD },
      symbolicBranchRef: "refs/heads/main",
      detached: false,
      dirtyState: "dirty",
    });
    expect(afterNewer.ok).toBe(true);
    if (!afterNewer.ok) {
      return;
    }

    const afterStale = recordPassiveSessionTurn(afterNewer.value, {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone,
      worktree: mainWorktree,
      worktreePathRef: stalePathRef,
      originKind: "main-checkout",
      sessionPseudoId: SESSION_PSEUDO_2,
      eventRecordId: EVENT_RECORD_2,
      observedAt: OBSERVED_AT,
      headOid: { algorithm: "sha1", oid: SHA1_BASE },
      symbolicBranchRef: null,
      detached: true,
      dirtyState: "clean",
    });
    expect(afterStale.ok).toBe(true);
    if (!afterStale.ok) {
      return;
    }

    const node = afterStale.value.nodes[0]!;
    // Kills a mutant that regresses worktreePathRef or Git state on an out-of-order observedAt.
    expect(node.worktreePathRef).toEqual(newerPathRef);
    expect(node.gitState.headOid).toEqual({ algorithm: "sha1", oid: SHA1_HEAD });
    expect(node.gitState.symbolicBranchRef).toBe("refs/heads/main");
    expect(node.gitState.detached).toBe(false);
    expect(node.gitState.dirtyState).toBe("dirty");
    expect(node.gitState.observedAt).toBe(UPDATED_AT);
    expect(node.updatedAt).toBe(UPDATED_AT);
    expect(node.gitState.liveIndexingState).toBe("unactivated");

    // Kills a mutant that regresses structural HEAD/branch edges on an out-of-order turn.
    expect(afterStale.value.edges).toContainEqual({
      relation: "pinned_at_head",
      source: mainWorktree.worktreeId,
      target: `sha1:${SHA1_HEAD}`,
    });
    expect(afterStale.value.edges).toContainEqual({
      relation: "tracks_branch",
      source: mainWorktree.worktreeId,
      target: "refs/heads/main",
    });
    expect(
      afterStale.value.edges.some(
        (e) => e.relation === "pinned_at_head" && e.target === `sha1:${SHA1_BASE}`,
      ),
    ).toBe(false);

    // Kills a mutant that drops provenance edges when ignoring out-of-order Git state.
    expect(afterStale.value.edges).toContainEqual({
      relation: "has_session_log",
      source: mainWorktree.worktreeId,
      target: SESSION_PSEUDO_1,
    });
    expect(afterStale.value.edges).toContainEqual({
      relation: "recorded_in_worktree",
      source: EVENT_RECORD_1,
      target: mainWorktree.worktreeId,
    });
    expect(afterStale.value.edges).toContainEqual({
      relation: "has_session_log",
      source: mainWorktree.worktreeId,
      target: SESSION_PSEUDO_2,
    });
    expect(afterStale.value.edges).toContainEqual({
      relation: "recorded_in_worktree",
      source: EVENT_RECORD_2,
      target: mainWorktree.worktreeId,
    });

    // Equal observedAt still merges refreshed Git state and path ref (>= boundary).
    const equalPathRef = makePathRef("checkouts/out-of-order-equal");
    const afterEqual = recordPassiveSessionTurn(afterStale.value, {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone,
      worktree: mainWorktree,
      worktreePathRef: equalPathRef,
      originKind: "main-checkout",
      sessionPseudoId: SESSION_PSEUDO_2,
      eventRecordId: "raw_event_0003",
      observedAt: UPDATED_AT,
      headOid: { algorithm: "sha1", oid: SHA1_MERGE },
      symbolicBranchRef: "refs/heads/feature-equal",
      detached: false,
      dirtyState: "staged-only",
    });
    expect(afterEqual.ok).toBe(true);
    if (afterEqual.ok) {
      const equalNode = afterEqual.value.nodes[0]!;
      expect(equalNode.worktreePathRef).toEqual(equalPathRef);
      expect(equalNode.gitState.headOid).toEqual({ algorithm: "sha1", oid: SHA1_MERGE });
      expect(equalNode.gitState.symbolicBranchRef).toBe("refs/heads/feature-equal");
      expect(equalNode.gitState.dirtyState).toBe("staged-only");
      expect(equalNode.gitState.observedAt).toBe(UPDATED_AT);
    }
  });

  it("mixed oid algorithms between clone and capture, headOid, or baseCommitOid refuse with INVALID_GIT_STATE", () => {
    const sha256Head = "a".repeat(64);
    const sha256Base = "b".repeat(64);
    const { clone: sha1Clone, mainWorktree: sha1Worktree } = makeCheckoutIdentities("mixed-oid-sha1");
    const sha256Clone = deriveCloneIdentity({
      hostScope: HOST_SCOPE,
      commonDirRealpath: "/srv/checkouts/mixed-oid-sha256/.git",
      commonDirProjectFingerprint: "proj-fp-sha256-0001",
      identityUncertainty: [],
      oidAlgorithm: "sha256",
    });
    const sha256Worktree = deriveWorktreeIdentity({
      hostScope: HOST_SCOPE,
      clone: sha256Clone,
      worktreePath: "/srv/checkouts/mixed-oid-sha256",
      gitDir: "/srv/checkouts/mixed-oid-sha256/.git",
      worktreeFingerprint: WS_FINGERPRINT,
      identityUncertainty: [],
    });

    const makeSha256Capture = (headOid: string | null): StableCapture =>
      makeStableCapture({
        objectFormat: "sha256",
        headOid,
        entries: [
          {
            path: new TextEncoder().encode("src/index.ts"),
            mode: "100644",
            oid: sha256Base,
            stage: 0,
          },
        ],
        files: [
          {
            path: new TextEncoder().encode("src/index.ts"),
            status: "present",
            kind: "file",
            mode: "100644",
            indexOid: sha256Base,
            fingerprint: SHA256_FILE_HEX,
            size: 128,
            blobVerified: true,
          },
        ],
      });

    const sha1Base = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone: sha1Clone,
      worktree: sha1Worktree,
      worktreePathRef: makePathRef("checkouts/mixed-oid-sha1"),
      originKind: "main-checkout" as const,
      observedAt: OBSERVED_AT,
    };

    // Kills a mutant that accepts sha256 stableCapture.objectFormat on a sha1 clone.
    expectClosedRefusal(
      buildDerivedWorktreeNode({
        ...sha1Base,
        stableCapture: makeSha256Capture(sha256Head),
      }),
      "INVALID_GIT_STATE",
      "Kills a mutant that accepts sha256 stableCapture on a sha1 clone",
    );

    // Kills a mutant that accepts sha256 stableCapture.objectFormat when headOid is null.
    expectClosedRefusal(
      buildDerivedWorktreeNode({
        ...sha1Base,
        stableCapture: makeSha256Capture(null),
      }),
      "INVALID_GIT_STATE",
      "Kills a mutant that skips capture.objectFormat === clone.oidAlgorithm when headOid is null",
    );

    // Kills a mutant that accepts sha256 headOid on a sha1 clone.
    expectClosedRefusal(
      buildDerivedWorktreeNode({
        ...sha1Base,
        headOid: { algorithm: "sha256", oid: sha256Head },
      }),
      "INVALID_GIT_STATE",
      "Kills a mutant that accepts sha256 headOid on a sha1 clone",
    );

    // Kills a mutant that accepts sha256 baseCommitOid on a sha1 clone.
    expectClosedRefusal(
      buildDerivedWorktreeNode({
        ...sha1Base,
        headOid: { algorithm: "sha1", oid: SHA1_HEAD },
        baseCommitOid: { algorithm: "sha256", oid: sha256Base },
      }),
      "INVALID_GIT_STATE",
      "Kills a mutant that accepts sha256 baseCommitOid on a sha1 clone",
    );

    // Kills a mutant that accepts all three as sha256 on a sha1 clone.
    expectClosedRefusal(
      buildDerivedWorktreeNode({
        ...sha1Base,
        stableCapture: makeSha256Capture(sha256Head),
        headOid: { algorithm: "sha256", oid: sha256Head },
        baseCommitOid: { algorithm: "sha256", oid: sha256Base },
      }),
      "INVALID_GIT_STATE",
      "Kills a mutant that accepts sha256 capture, headOid, and baseCommitOid on a sha1 clone",
    );

    // Kills a mutant that accepts mixed oid algorithms during passive turn recording.
    expectClosedRefusal(
      recordPassiveSessionTurn(EMPTY_GRAPH, {
        ...sha1Base,
        sessionPseudoId: SESSION_PSEUDO_1,
        eventRecordId: EVENT_RECORD_1,
        headOid: { algorithm: "sha256", oid: sha256Head },
      }),
      "INVALID_GIT_STATE",
      "Kills a mutant that accepts sha256 headOid in recordPassiveSessionTurn on a sha1 clone",
    );

    const sha256BaseInput = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      clone: sha256Clone,
      worktree: sha256Worktree,
      worktreePathRef: makePathRef("checkouts/mixed-oid-sha256"),
      originKind: "main-checkout" as const,
      observedAt: OBSERVED_AT,
    };

    // Reverse direction: sha256 clone refuses sha1 capture, headOid, and baseCommitOid.
    expectClosedRefusal(
      buildDerivedWorktreeNode({
        ...sha256BaseInput,
        stableCapture: makeStableCapture(),
      }),
      "INVALID_GIT_STATE",
      "Kills a mutant that accepts sha1 stableCapture on a sha256 clone",
    );
    expectClosedRefusal(
      buildDerivedWorktreeNode({
        ...sha256BaseInput,
        headOid: { algorithm: "sha1", oid: SHA1_HEAD },
      }),
      "INVALID_GIT_STATE",
      "Kills a mutant that accepts sha1 headOid on a sha256 clone",
    );
    expectClosedRefusal(
      buildDerivedWorktreeNode({
        ...sha256BaseInput,
        baseCommitOid: { algorithm: "sha1", oid: SHA1_BASE },
      }),
      "INVALID_GIT_STATE",
      "Kills a mutant that accepts sha1 baseCommitOid on a sha256 clone",
    );

    // Matching sha256 clone, capture, headOid, and baseCommitOid are accepted.
    const matchingSha256 = buildDerivedWorktreeNode({
      ...sha256BaseInput,
      stableCapture: makeSha256Capture(sha256Head),
      headOid: { algorithm: "sha256", oid: sha256Head },
      baseCommitOid: { algorithm: "sha256", oid: sha256Base },
    });
    expect(matchingSha256.ok).toBe(true);
  });
});
