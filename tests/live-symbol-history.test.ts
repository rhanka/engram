import { createHash } from "node:crypto";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as live from "../engram-live/index.js";
import { analyzeCode, type DeclarationInventoryReceipt } from "../engram-live/code-analysis.js";
import { createSafeGitExecutor } from "../engram-live/git-executor.js";
import { POLICY_VERSION } from "../engram-live/contracts.js";
import { inventoryDigest, LiveGitSandbox } from "./helpers/live-git-fixtures.js";
import type { SymbolHistoryPorts } from "../engram-live/symbol-history.js";
import type { SymbolHistoryRequestDto } from "../engram-live/contracts.js";

const boxes: LiveGitSandbox[] = [];
afterEach(() => { for (const box of boxes.splice(0)) box.dispose(); });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const fn = (name: string, value: string) => `export function ${name}() { return ${value}; }\n`;

function setup(format: "sha1" | "sha256" = "sha1") {
  const box = new LiveGitSandbox(); boxes.push(box);
  const repo = box.init(join(box.root, "retained"), format);
  // Fixture creation alone writes Git objects. No checkout, index, filters,
  // hooks or producer-derived expectations participate in this oracle.
  const commit = (files: Record<string, string>, parents: string[] = []) => {
    const entries = Object.entries(files).sort().map(([path, content]) => {
      const oid = box.git(repo, ["hash-object", "-w", "--no-filters", "--stdin"], content).toString().trim();
      return `100644 blob ${oid}\t${path}\0`;
    });
    const tree = box.git(repo, ["mktree", "-z"], entries.join("")).toString().trim();
    return box.git(repo, ["commit-tree", tree, ...parents.flatMap(parent => ["-p", parent])], "G2 fixture\n").toString().trim();
  };
  const before = commit({
    "same.ts": fn("stable", "101"), "rename.ts": fn("oldName", "202"), "old.ts": fn("travel", "303"),
    "split.ts": fn("whole", "401 + 402"), "merge.ts": fn("left", "501") + fn("right", "502"),
    "duplicate.ts": fn("d1", "601") + fn("d2", "601"), "missing.ts": fn("gone", "701"),
    "copy.ts": fn("original", "801"), "fanin.ts": fn("a", "901") + fn("b", "901"),
    "reuse.ts": fn("reused", "1001"),
  });
  const after = commit({
    "same.ts": fn("stable", "101"), "rename.ts": fn("newName", "202"), "new.ts": fn("travel", "303"),
    "split.ts": fn("part1", "401") + fn("part2", "402"), "merge.ts": fn("joined", "501 + 502"),
    "duplicate.ts": fn("d3", "601") + fn("d4", "601"), "added.ts": fn("born", "702"),
    "copy.ts": fn("original", "801") + fn("copy", "801"), "fanin.ts": fn("joined", "901"),
    "reuse.ts": fn("reused", "1002"),
  }, [before]);
  const git = createSafeGitExecutor({ gitPath: box.trace.executable, disabledHooksDir: join(box.root, "disabled-hooks") });
  const configPaths = [join(repo, ".git", "config")];
  const objects = {
    async loadBlob(oid: string) { return git.run(repo, ["cat-file", "blob", oid]); },
    async loadObject(oid: string) {
      const bytes = git.run(repo, ["cat-file", "--batch"], oid + "\n");
      const end = bytes.indexOf(10), fields = bytes.subarray(0, end).toString().split(" ");
      if (fields[1] === "missing") return null;
      return { type: fields[1]!, body: bytes.subarray(end + 1, end + 1 + Number(fields[2])) };
    },
    async isShallowBoundary() { return false; },
  };
  const request: SymbolHistoryRequestDto = { scope: { tenant: "g2-owner", clone: "g2-clone" },
    generationId: "g2-generation", before: { algorithm: format, oid: before }, after: { algorithm: format, oid: after },
    policyVersion: POLICY_VERSION, options: { version: "exact-l5-body/1", renameThreshold: 100, moveThreshold: 100, copyThreshold: 100 } };
  const receipts: DeclarationInventoryReceipt[] = [];
  const ports: SymbolHistoryPorts = {
    async authorize() { return "authorized"; },
    async openRetained(_request, endpoint) {
      git.assertNoConfigIncludes(configPaths, true);
      return { objects, receipt: { scope: request.scope, ...endpoint, receivedAt: 1700000000000, backupRef: "g2-backup" } };
    },
    async inventory(input) {
      const content = Buffer.from((await objects.loadObject(input.blob.oid))!.body).toString("utf8");
      const result = await analyzeCode({ scope: request.scope, path: Buffer.from(input.path).toString("utf8"), content,
        language: "typescript", treeOid: input.tree.oid, configHash: hash("config"), dependencyHash: hash("dependencies"),
        historicalBounds: { known: true, heads: [input.commit] } }, {
        objects,
        grammar: { status() { const bytes = Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0]);
          return { state: "available", version: "fixture-grammar/1", bytes,
            digest: createHash("sha256").update(bytes).digest("hex"), abi: "fixture/1", grammarId: "fixture-ts" }; }, load() { return {}; } },
        // Deliberately bounded fixture parser, not a production AST claim.
        // Expected relations below come from the native Git source oracle.
        extractor: { parse({ content }) { return {
          symbols: [...content.matchAll(/^export function (\w+)\(\) \{ return (.+); \}$/gm)].map((match, index) => ({
            slot: `function:${index}`, name: match[1]!, kind: "function", bodyHash: hash(match[2]!),
          })), calls: [], inheritances: [], topologyHash: hash(content),
          syntax: { rootSpansBytes: true, walkComplete: true, hasError: false, hasMissing: false },
        }; } },
      });
      expect(result.state, result.coverage.reason).toBe("complete");
      receipts.push(result.declarationInventory!);
      return result.declarationInventory!;
    },
  };
  return { box, repo, commit, request, ports, objects, receipts };
}

describe("live symbol history", () => {
  it("symbol correspondences retain rename and move evidence while split merge duplicate and missing matches remain ambiguous", async () => {
    expect(typeof live.correspondSymbols).toBe("function");
    for (const format of ["sha1", "sha256"] as const) {
      const { box, repo, request, ports } = setup(format);
      const before = inventoryDigest({ root: repo });
      // Independent native tree/source/parent checks, not the producer's hash
      // matcher or a snapshot generated from its returned correspondences.
      expect(box.read(repo, ["show", `${request.before.oid}:old.ts`]).toString()).toBe(fn("travel", "303"));
      expect(box.read(repo, ["show", `${request.after.oid}:new.ts`]).toString()).toBe(fn("travel", "303"));
      expect(box.read(repo, ["diff-tree", "--no-commit-id", "--name-status", "-r", "-M100%", request.before.oid, request.after.oid]).toString()).toContain("R100\told.ts\tnew.ts");
      const actual = await live.correspondSymbols(request, ports);
      expect(actual.state, JSON.stringify(actual.coverage)).toBe("complete");
      expect(actual.options).toEqual(request.options);
      expect(actual.calculationVersion).toBe("live-symbol-history/1");
      const from = (name: string) => actual.correspondences.find(row => row.before.some(symbol => symbol.name === name))!;
      for (const [name, relation, reason, targets] of [
        ["stable", "unchanged", "unique-exact-body", ["stable"]],
        ["oldName", "renamed", "unique-exact-body", ["newName"]],
        ["travel", "moved", "unique-exact-body", ["travel"]],
        ["whole", "ambiguous", "missing", []],
        ["left", "ambiguous", "missing", []],
        ["d1", "ambiguous", "duplicate", ["d3", "d4"]],
        ["gone", "ambiguous", "missing", []],
        ["original", "ambiguous", "split-or-copy", ["original", "copy"]],
        ["a", "ambiguous", "merge", ["joined"]],
        ["reused", "ambiguous", "missing", []],
      ] as const) {
        expect(from(name), name).toMatchObject({ relation, reason });
        expect(from(name).after.map(symbol => symbol.name).sort()).toEqual([...targets].sort());
      }
      expect(actual.correspondences.some(row => row.before.length === 0 && row.after.some(s => s.name === "born") && row.reason === "missing")).toBe(true);
      expect(Buffer.from(from("travel").before[0]!.path)).toEqual(Buffer.from("old.ts"));
      expect(Buffer.from(from("travel").after[0]!.path)).toEqual(Buffer.from("new.ts"));
      expect(from("stable").before[0]!.symbolId).not.toBe(from("stable").after[0]!.symbolId);
      expect(actual.parentEvidence.find(p => p.commit.oid === request.after.oid)?.parents).toEqual([request.before]);
      for (const row of actual.correspondences) for (const symbol of [...row.before, ...row.after]) {
        expect(symbol.range).toBeNull(); // L5 currently supplies no source ranges.
        expect(box.read(repo, ["rev-parse", `${symbol.commit.oid}^{tree}`]).toString().trim()).toBe(symbol.tree.oid);
        expect(box.read(repo, ["rev-parse", `${symbol.commit.oid}:${Buffer.from(symbol.path).toString()}`]).toString().trim()).toBe(symbol.blob.oid);
      }
      expect(await live.correspondSymbols(request, ports)).toEqual(actual);
      expect(inventoryDigest({ root: repo })).toBe(before);
    }
  }, 30000);

  it("missing forged foreign or incomplete L5 inventories cannot establish continuity", async () => {
    const { request, ports, receipts } = setup();
    const partial = async (using: SymbolHistoryPorts, cause: string) => {
      const result = await live.correspondSymbols(request, using);
      expect(result.state).toBe("partial");
      expect(result.coverage.gaps[0]!.cause).toBe(cause);
      expect(result.correspondences).toEqual([]);
      expect(result.parentEvidence).toEqual([]);
    };
    await partial({ ...ports, inventory: async () => null }, "inventory-unavailable");
    await partial({ ...ports, inventory: async () => ({ kind: "verified-declaration-inventory" }) }, "inventory-unavailable");
    await partial({ ...ports, async inventory(input) { return structuredClone(await ports.inventory(input)); } }, "inventory-unavailable");
    await live.correspondSymbols(request, ports);
    // A genuine complete receipt from a different path/tree also fails.
    await partial({ ...ports, inventory: async () => receipts[0]! }, "inventory-unavailable");
    await partial({ ...ports, inventory: async () => { throw new Error("grammar unavailable"); } }, "inventory-unavailable");
    await partial({ ...ports, async openRetained(input, endpoint) {
      const view = (await ports.openRetained(input, endpoint))!;
      return { ...view, receipt: { ...view.receipt, scope: { ...input.scope, tenant: "foreign" } } };
    } }, "missing-retention");
  });

  it("authorization retention and raw object gaps suppress all evidence including revocation before emission", async () => {
    const { request, ports } = setup();
    const partial = async (using: SymbolHistoryPorts, cause: string) => {
      const result = await live.correspondSymbols(request, using);
      expect(result.state).toBe("partial");
      expect(result.coverage.gaps[0]!.cause).toBe(cause);
      expect(result.correspondences).toEqual([]);
      expect(result.parentEvidence).toEqual([]);
    };
    let opened = false;
    await partial({ ...ports, authorize: async () => "unauthorized", async openRetained() { opened = true; return null; } }, "unauthorized");
    expect(opened).toBe(false);
    await partial({ ...ports, async authorize(_request, origin) { return origin ? "excluded" : "authorized"; } }, "excluded");
    let scopeChecks = 0;
    await partial({ ...ports, async authorize(_request, origin) {
      return !origin && ++scopeChecks > 1 ? "unauthorized" : "authorized";
    } }, "unauthorized");
    let origins = 0;
    await partial({ ...ports, async authorize(_request, origin) {
      // Twenty paths were read; revocation on final path checks also denies.
      return origin && ++origins > 20 ? "excluded" : "authorized";
    } }, "excluded");
    await partial({ ...ports, openRetained: async () => null }, "missing-retention");
    for (const variant of ["missing", "throws", "corrupt", "oversized"] as const) {
      await partial({ ...ports, async openRetained(input, endpoint) {
        const view = (await ports.openRetained(input, endpoint))!;
        return { ...view, objects: { ...view.objects, async loadObject(oid) {
          if (variant === "throws") throw new Error("private view unavailable");
          if (variant === "missing") return null;
          const raw = (await view.objects.loadObject!(oid))!;
          return { ...raw, body: variant === "oversized" ? new Uint8Array(16 * 1024 * 1024 + 1) : Buffer.from("corrupt") };
        } } };
      } }, variant === "oversized" ? "bounds-exceeded" : variant === "corrupt" ? "invalid-evidence" : "missing-object");
    }
  });

  it("empty inventories combined rename moves and merge parents are explicit without traversing history", async () => {
    const { box, repo, commit, request, ports } = setup();
    const empty = commit({});
    const noSymbols = await live.correspondSymbols({ ...request, before: { ...request.before, oid: empty }, after: { ...request.after, oid: empty } }, ports);
    expect(noSymbols.state).toBe("complete");
    expect(noSymbols.correspondences).toEqual([]);
    const before = commit({ "a.ts": fn("oldName", "42") });
    const secondParent = commit({ "a.ts": fn("side", "43") });
    const after = commit({ "b.ts": fn("newName", "42") }, [before, secondParent]);
    const result = await live.correspondSymbols({ ...request, before: { ...request.before, oid: before }, after: { ...request.after, oid: after } }, ports);
    expect(result.correspondences).toHaveLength(1);
    expect(result.correspondences[0]).toMatchObject({ relation: "renamed-and-moved", reason: "unique-exact-body" });
    const nativeParents = box.read(repo, ["rev-list", "--parents", "--no-walk", after]).toString().trim().split(" ").slice(1);
    expect(result.parentEvidence[1]!.parents.map(parent => parent.oid)).toEqual(nativeParents);
    expect(nativeParents).toEqual([before, secondParent]);
  });

  it("caller and port mutations cannot alter pinned bindings and unsupported thresholds fail before reads", async () => {
    const { request, ports } = setup();
    const original = structuredClone(request);
    const actual = await live.correspondSymbols(request, { ...ports, async authorize(input, origin) {
      Object.assign(request.before, { oid: "f".repeat(40) });
      Object.assign(input.scope, { tenant: "mutated" });
      Object.assign(input.before, { oid: "e".repeat(40) });
      origin?.path.fill(0);
      return "authorized";
    }, async inventory(input) {
      // Keep fixture analysis scoped to the original request.
      Object.assign(request.before, original.before);
      return ports.inventory(input);
    } });
    expect(actual.before).toEqual(original.before);
    expect(actual.scope).toEqual(original.scope);
    expect(actual.state).toBe("complete");
    for (const options of [{ ...original.options, renameThreshold: 50 }, { ...original.options, moveThreshold: 99 },
      { ...original.options, copyThreshold: 0 }, { ...original.options, version: "future/2" }]) {
      let calls = 0;
      await expect(live.correspondSymbols({ ...original, options } as SymbolHistoryRequestDto,
        { ...ports, async authorize() { calls++; return "authorized"; } })).rejects.toThrow("versioned thresholds");
      expect(calls).toBe(0);
    }
  });
});
