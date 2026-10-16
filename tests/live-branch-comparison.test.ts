// L5: verified Git objects, ancestry, exact comparison receipts and independent native oracles.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareBranches, DEFAULT_DIFF_OPTIONS, COMPARISON_COMPARATOR_VERSION,
  type ComparisonCapabilityPort, type CompareBranchesInput, type PinnedOidDto, type DiffChangeDto } from "../engram-live/comparisons.js";
const scope = { tenant: "owner", clone: "clone" };
const ORACLE_GIT_VERSION = "git/2.53.0";
function makeRepo(algorithm: "sha1" | "sha256" = "sha1") {
  const stored = new Map<string, { type: string; body: Uint8Array }>();
  function object(type: string, bytes: Uint8Array | string): PinnedOidDto {
    const body = typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
    const oid = createHash(algorithm).update(type + " " + body.length + "\0").update(body).digest("hex");
    stored.set(oid, { type, body }); return { algorithm, oid };
  }
  function tree(text: string) {
    const blob = object("blob", text);
    return object("tree", Buffer.concat([Buffer.from("100644 cart.ts\0"), Buffer.from(blob.oid, "hex")]));
  }
  function commit(label: string, tree: PinnedOidDto, parents: readonly PinnedOidDto[] = []) {
    return object("commit", ["tree " + tree.oid, ...parents.map(p => "parent " + p.oid),
      "author L5 <l5@example.test> 0 +0000", "committer L5 <l5@example.test> 0 +0000", "", label, ""].join("\n"));
  }
  const port = { async loadBlob(oid: string) { return stored.get(oid)?.body ?? null; },
    async loadObject(oid: string) { return stored.get(oid) ?? null; } };
  const seen: Parameters<ComparisonCapabilityPort["compare"]>[0][] = [];
  const comparator: ComparisonCapabilityPort = { async compare(input) {
    seen.push(input);
    // This deterministic test capability derives facts from served binary tree entries and blobs.
    // The native oracle below cross-checks this narrow, equal-line replacement fixture.
    const textOf = (oid: PinnedOidDto): string | null => {
      const bytes = Buffer.from(stored.get(oid.oid)!.body);
      if (!bytes.length) return null;
      const nul = bytes.indexOf(0); const blob = bytes.subarray(nul + 1).toString("hex");
      return Buffer.from(stored.get(blob)!.body).toString("utf8");
    };
    const before = textOf(input.beforeTree), after = textOf(input.afterTree);
    const changes: DiffChangeDto[] = before === after ? [] : [{ beforePath: before === null ? null : "cart.ts",
      afterPath: after === null ? null : "cart.ts", beforeMode: before === null ? null : "100644", afterMode: after === null ? null : "100644",
      changeKind: before === null ? "added" : after === null ? "deleted" : "modified", binary: false,
      insertions: after === null ? 0 : after.trimEnd().split("\n").length,
      deletions: before === null ? 0 : before.trimEnd().split("\n").length, renameEvidence: null }];
    return { ...input, comparatorVersion: COMPARISON_COMPARATOR_VERSION, gitVersion: ORACLE_GIT_VERSION, pathEncoding: "utf8",
      objectFormat: algorithm, derived: true, changes };
  } };
  return { stored, object, tree, commit, port, seen, comparator };
}
function inputFor(base: PinnedOidDto, tip: PinnedOidDto, bases: readonly PinnedOidDto[], kind: CompareBranchesInput["kind"] = "contribution"): CompareBranchesInput {
  return { scope, kind, baseCandidates: { defaultBase: base },
    ancestry: { status: "complete", generation: "borrowed-generation", mergeBases: bases },
    endpoints: { baseTip: base, branchTip: tip, mergeBases: bases, baseSource: "default-base" } };
}

describe("owner comparison class", () => {
  it("base selection derives override then PR then default precedence and requires candidates", async () => {
    const repo = makeRepo(), tree = repo.tree("same\n");
    const fallback = repo.commit("default", tree), pr = repo.commit("pr", tree, [fallback]), override = repo.commit("override", tree, [pr]);
    const tip = repo.commit("tip", tree, [override]);
    for (const [candidates, selected, expected] of [
      [{ defaultBase: fallback }, fallback, "default-base"],
      [{ defaultBase: fallback, prBase: pr }, pr, "pr-base"],
      [{ defaultBase: fallback, prBase: pr, override }, override, "override"],
    ] as const) {
      const out = await compareBranches({ ...inputFor(selected, tip, [selected]), baseCandidates: candidates,
        endpoints: { baseTip: selected, branchTip: tip, mergeBases: [selected], baseSource: "default-base" } },
      { objects: repo.port, comparator: repo.comparator });
      expect(out.state).toBe("complete"); expect(out.baseSource).toBe(expected);
    }
    for (const candidates of [undefined, {}, { override }]) {
      const out = await compareBranches({ ...inputFor(fallback, tip, [fallback]), baseCandidates: candidates as never },
        { objects: repo.port, comparator: repo.comparator });
      expect(out.state).toBe("partial"); expect(out.coverage.reason).toMatch(/configuration-(unavailable|invalid)/);
    }
  });
  it.each(["utf8", "base64url"] as const)("Git paths use explicit lossless %s encoding and record the actual Git version", async encoding => {
    const repo = makeRepo();
    const name = encoding === "utf8" ? Buffer.from("café-樹.ts") : Buffer.from([0x66, 0xff, 0xfe, 0x2e, 0x74, 0x73]);
    const before = repo.object("tree", ""), blob = repo.object("blob", "a\n");
    const after = repo.object("tree", Buffer.concat([Buffer.from("100644 "), name, Buffer.from([0]), Buffer.from(blob.oid, "hex")]));
    const base = repo.commit("base", before), tip = repo.commit("tip", after, [base]);
    const comparator: ComparisonCapabilityPort = { async compare(input) {
      return { ...input, derived: true, comparatorVersion: COMPARISON_COMPARATOR_VERSION, gitVersion: "git/2.51.1.vendor.3",
        objectFormat: "sha1", pathEncoding: encoding, changes: [{ beforePath: null, beforeMode: null,
          afterPath: name.toString(encoding), afterMode: "100644", changeKind: "added", binary: false, insertions: 1, deletions: 0, renameEvidence: null }] };
    } };
    const out = await compareBranches(inputFor(base, tip, [base]), { objects: repo.port, comparator });
    expect(out.state).toBe("complete");
    expect(out.diffs[0]!.gitVersion).toBe("git/2.51.1.vendor.3");
    expect(out.diffs[0]!.changes[0]!.afterPath).toBe(name.toString(encoding));
    expect(out.coverage.reason).toContain("git/2.51.1.vendor.3");
  });
  it("shallow boundaries retain a distinct history gap", async () => {
    const repo = makeRepo(), tree = repo.tree("a\n"), base = repo.commit("base", tree), tip = repo.commit("tip", tree, [base]);
    repo.stored.delete(base.oid);
    const out = await compareBranches(inputFor(tip, tip, [tip]), { objects: { ...repo.port,
      async isShallowBoundary(oid) { return oid.oid === tip.oid; } }, comparator: repo.comparator });
    expect(out.state).toBe("unknown"); expect(out.coverage.reason).toMatch(/^shallow-history:/);
  });
  it.each(["contribution", "current-diff", "merge-parent"] as const)("C3 borrowed generation cannot prove foreign merge-base ancestry in %s", async kind => {
    const repo = makeRepo(); const tree = repo.tree("same\n");
    const base = repo.commit("base", tree), tip = repo.commit("tip", tree), foreign = repo.commit("foreign", tree);
    const out = await compareBranches({ ...inputFor(base, tip, [foreign], kind), mergeParents: [],
      targetCommit: tip, isRoot: true, emptyTree: repo.object("tree", "") }, { objects: repo.port, comparator: repo.comparator });
    expect(out.state).not.toBe("complete"); expect(out.coverage.state).not.toBe("current");
    expect(repo.seen).toHaveLength(0);
  });
  it.each(["sha1", "sha256"] as const)("C3 verifies every best merge-base and ordered parent in %s", async algorithm => {
    for (const baseSource of ["pr-base", "default-base", "override"] as const) {
      for (const count of [1, 2, 3]) {
        const repo = makeRepo(algorithm); const old = repo.tree("before\n"), next = repo.tree("after\n");
        const root = repo.commit("root", old);
        const bases = Array.from({ length: count }, (_, i) => repo.commit("common-" + i, old, [root]));
        const base = repo.commit("base", old, bases), tip = repo.commit("tip", next, [...bases].reverse());
        for (const kind of ["contribution", "current-diff", "merge-parent"] as const) {
          const input = { ...inputFor(base, tip, bases, kind), baseCandidates: baseSource === "override" ? { override: base }
            : baseSource === "pr-base" ? { prBase: base } : { defaultBase: base }, endpoints: { ...inputFor(base, tip, bases).endpoints, baseSource },
            mergeParents: [...bases].reverse(), targetCommit: tip };
          const out = await compareBranches(input, { objects: repo.port, comparator: repo.comparator });
          expect(out.state, baseSource + "/" + kind + "/" + count).toBe("complete");
          expect(out.diffs).toHaveLength(kind === "current-diff" ? 1 : count);
          expect(out.diffs.every(d => d.changes.length === 1)).toBe(true);
          if (kind === "merge-parent") expect(out.perParent.map(p => p.parent)).toEqual([...bases].reverse());
        }
        if (count > 1) {
          const missing = await compareBranches(inputFor(base, tip, bases.slice(1)), { objects: repo.port, comparator: repo.comparator });
          expect(missing.state).not.toBe("complete");
        }
        const duplicate = await compareBranches(inputFor(base, tip, [...bases, bases[0]!]), { objects: repo.port, comparator: repo.comparator });
        expect(duplicate.state).not.toBe("complete");
        repo.stored.delete(root.oid);
        const incomplete = await compareBranches(inputFor(base, tip, bases), { objects: repo.port, comparator: repo.comparator });
        expect(incomplete.state).toBe("unknown");
      }
    }
  });
  it.each(["sha1", "sha256"] as const)("Opus2 merge-parent target must belong to the compared branch in %s", async algorithm => {
    const repo = makeRepo(algorithm), tree = repo.tree("same\n");
    const root = repo.commit("root", tree), base = repo.commit("base-only", tree, [root]);
    const parent = repo.commit("branch-parent", tree, [root]), tip = repo.commit("tip", tree, [parent]);
    const foreign = repo.commit("foreign", tree, [root]);
    for (const [target, parents, belongs] of [
      [tip, [parent], true], [parent, [root], true], [root, [], true],
      [base, [root], false], [foreign, [root], false],
    ] as const) {
      repo.seen.length = 0;
      const out = await compareBranches({ ...inputFor(base, tip, [root], "merge-parent"), targetCommit: target,
        mergeParents: parents, isRoot: parents.length === 0, emptyTree: repo.object("tree", "") },
      { objects: repo.port, comparator: repo.comparator });
      expect(out.state, target.oid).toBe(belongs ? "complete" : "partial");
      if (!belongs) {
        expect(out.coverage.reason).toMatch(/^result-missing:/);
        expect(out.diffs).toEqual([]);
        expect(out.perParent).toEqual([]);
        expect(repo.seen).toHaveLength(0);
      }
    }
  });
  it.each(["wrong-version", "wrong-git", "wrong-format", "wrong-options", "wrong-pair", "wrong-index", "no-changes"])(
    "C3 rejects comparator receipt %s", async mutation => {
      const repo = makeRepo(); const tree = repo.tree("old\n"), newTree = repo.tree("new\n");
      const base = repo.commit("base", tree), tip = repo.commit("tip", newTree, [base]);
      const comparator: ComparisonCapabilityPort = { async compare(input) {
        const diff = await repo.comparator.compare(input);
        if (mutation === "wrong-version") return { ...diff, comparatorVersion: "foreign" };
        if (mutation === "wrong-git") return { ...diff, gitVersion: "foreign" };
        if (mutation === "wrong-format") return { ...diff, objectFormat: "sha256" };
        if (mutation === "wrong-options") return { ...diff, options: { ...input.options, renameThreshold: 99 } };
        if (mutation === "wrong-pair") return { ...diff, afterTree: tree };
        if (mutation === "wrong-index") return { ...diff, parentIndex: 12 };
        return { ...diff, changes: null as never };
      } };
      const out = await compareBranches(inputFor(base, tip, [base]), { objects: repo.port, comparator });
      expect(out.state).not.toBe("complete"); expect(out.coverage.state).not.toBe("current");
    });
  it.each(["empty", "foreign-path", "foreign-mode", "duplicate-change"])(
    "C3 completion manifest is derived from tree contents, not provider arrays: %s", async variant => {
      const repo = makeRepo(), tree = repo.tree("old\n"), next = repo.tree("new\n");
      const base = repo.commit("base", tree), tip = repo.commit("tip", next, [base]);
      const comparator: ComparisonCapabilityPort = { async compare(input) {
        const diff = await repo.comparator.compare(input);
        if (variant === "empty") return { ...diff, changes: [] };
        if (variant === "foreign-path") return { ...diff, changes: [{ ...diff.changes[0]!, afterPath: "foreign.ts" }] };
        if (variant === "foreign-mode") return { ...diff, changes: [{ ...diff.changes[0]!, afterMode: "100755" }] };
        return { ...diff, changes: [...diff.changes, ...diff.changes] };
      } };
      const out = await compareBranches(inputFor(base, tip, [base]), { objects: repo.port, comparator });
      expect(out.state).not.toBe("complete");
    });
  it.each([{}, { ...DEFAULT_DIFF_OPTIONS, renameThreshold: -1 }, { ...DEFAULT_DIFF_OPTIONS, binaryDetection: null }])(
    "C3 rejects incomplete or invalid diff options %j", async diffOptions => {
      const repo = makeRepo(), tree = repo.tree("line\n"), base = repo.commit("base", tree), tip = repo.commit("tip", tree, [base]);
      const out = await compareBranches({ ...inputFor(base, tip, [base]), diffOptions }, { objects: repo.port, comparator: repo.comparator });
      expect(out.state).not.toBe("complete"); expect(repo.seen).toHaveLength(0);
    });
  it.each(["malformed", "truncated", "nonempty", "wrong-oid"])("C3 root requires a valid empty Git tree: %s", async variant => {
    const repo = makeRepo(), tree = repo.tree("line\n"), root = repo.commit("root", tree);
    let empty = repo.object("tree", "");
    if (variant === "malformed") empty = repo.object("tree", "not a git tree");
    if (variant === "truncated") empty = repo.object("tree", Buffer.from("100644 file\0short"));
    if (variant === "nonempty") empty = tree;
    if (variant === "wrong-oid") repo.stored.set(empty.oid, { type: "tree", body: Buffer.from("wrong") });
    const out = await compareBranches({ ...inputFor(root, root, [], "merge-parent"), emptyTree: empty,
      isRoot: true, mergeParents: [], targetCommit: root }, { objects: repo.port, comparator: repo.comparator });
    expect(out.state).not.toBe("complete"); expect(repo.seen).toHaveLength(0);
  });
  it("C3 distinguishes unrelated ancestry, unknown frontier, valid root and verified empty diff", async () => {
    const repo = makeRepo(), tree = repo.tree("line\n"), base = repo.commit("base", tree), tip = repo.commit("tip", tree);
    const unrelated = await compareBranches(inputFor(base, tip, []), { objects: repo.port, comparator: repo.comparator });
    expect(unrelated.state).toBe("unrelated");
    const current = await compareBranches(inputFor(base, tip, [], "current-diff"), { objects: repo.port, comparator: repo.comparator });
    expect(current.state).toBe("complete"); expect(current.diffs[0]!.changes).toEqual([]);
    const empty = repo.object("tree", "");
    const root = await compareBranches({ ...inputFor(base, tip, [], "merge-parent"), mergeParents: [], targetCommit: tip,
      isRoot: true, emptyTree: empty }, { objects: repo.port, comparator: repo.comparator });
    expect(root.state).toBe("complete"); expect(root.diffs[0]!.changes[0]!.changeKind).toBe("added");
    const unknown = await compareBranches({ ...inputFor(base, tip, []), ancestry: { status: "unknown" } }, { objects: repo.port, comparator: repo.comparator });
    expect(unknown.state).toBe("unknown");
    const nonRoot = repo.commit("non-root", tree, [base]);
    const lie = await compareBranches({ ...inputFor(base, nonRoot, [], "merge-parent"), mergeParents: [], targetCommit: nonRoot,
      isRoot: true, emptyTree: empty }, { objects: repo.port, comparator: repo.comparator });
    expect(lie.state).not.toBe("complete");
  });
  it("C3 native Git fixture agrees with retained-object comparison including statistics", async () => {
    const fixture = JSON.parse(readFileSync(new URL("fixtures/live-code-context.json", import.meta.url), "utf8")).verifiedGitOracle;
    expect(fixture.gitVersion).toBe("2.53.0");
    const repo = makeRepo();
    for (const object of fixture.objects) repo.stored.set(object.oid, { type: object.type, body: Buffer.from(object.bodyB64, "base64") });
    const oid = (hex: string): PinnedOidDto => ({ algorithm: "sha1", oid: hex });
    const out = await compareBranches({ ...inputFor(oid(fixture.base), oid(fixture.tip), [oid(fixture.base)], "current-diff"),
      diffOptions: fixture.options }, { objects: repo.port, comparator: repo.comparator });
    expect(out.state).toBe("complete");
    expect(out.diffs[0]!.changes).toEqual(fixture.changes);
  });
});
