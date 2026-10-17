import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as live from "../engram-live/index.js";
import { createSafeGitExecutor } from "../engram-live/git-executor.js";
import { POLICY_VERSION } from "../engram-live/contracts.js";
import { buildLineAttributionFixture, inventoryDigest, LiveGitSandbox, nativeLineOracle } from "./helpers/live-git-fixtures.js";
import type { LineAttributionRequestDto, LineAttributionOutcomeDto } from "../engram-live/contracts.js";
import type { LineAttributionPorts } from "../engram-live/line-attribution.js";

const boxes: LiveGitSandbox[] = [];
afterEach(() => { for (const box of boxes.splice(0)) box.dispose(); });
const options = (move: number | null = null, copy: number | null = null, search: "modified" | "created" | "all" = "all") => ({
  version: "native-blame-options/1" as const, algorithm: "myers" as const,
  moveMinCharacters: move, copyMinCharacters: copy, copySearch: search,
});
function setup(format: "sha1" | "sha256" = "sha1") {
  const box = new LiveGitSandbox(); boxes.push(box);
  const fixture = buildLineAttributionFixture(box, format);
  const request: LineAttributionRequestDto = {
    scope: { tenant: "tenant-g1", clone: "clone-g1" }, generationId: "generation-g1",
    target: { algorithm: format, oid: fixture.commits.copy }, path: Buffer.from("copied.txt"),
    ranges: [{ start: 1, end: 11 }], policyVersion: POLICY_VERSION, options: options(1, 1),
  };
  const accesses: string[] = [];
  const ports: LineAttributionPorts = {
    git: createSafeGitExecutor({ gitPath: box.trace.executable, disabledHooksDir: join(box.root, "disabled-hooks") }),
    async authorize(_request, origin) { accesses.push(origin ? `origin:${origin.commit.oid}` : "request"); return "authorized"; },
    async openRetained(input) {
      accesses.push("retained");
      return { cwd: fixture.stores.complete, configPaths: [join(fixture.stores.complete, ".git", "config")],
        receipt: { scope: input.scope, ...input.target, receivedAt: 1700000000000, backupRef: "backup-g1" } };
    },
  };
  return { box, fixture, request, ports, accesses };
}
function lines(result: LineAttributionOutcomeDto) {
  return result.origins.flatMap(origin => Array.from({ length: origin.finalRange.end - origin.finalRange.start + 1 }, (_, index) => ({
    commit: origin.commit.oid, original: origin.originalRange.start + index, final: origin.finalRange.start + index,
    pathHex: Buffer.from(origin.path).toString("hex"), author: origin.author.name,
  })));
}

describe("live line attribution", () => {
  it("pinned line origins match native Git including origin paths original and final ranges ordered parents and explicit move copy options", async () => {
    expect(typeof live.attributeLines).toBe("function");
    for (const format of ["sha1", "sha256"] as const) {
      const { box, fixture: f, request, ports } = setup(format);
      const before = inventoryDigest(f);
      const retainedBefore = inventoryDigest({ root: f.privateRoot });
      const cases = [
        { name: "root", path: f.rawPath, end: 9, policy: options() },
        { name: "merge", path: f.rawPath, end: 10, policy: options() },
        { name: "rename", path: Buffer.from("renamed.txt"), end: 10, policy: options() },
        { name: "move", path: Buffer.from("renamed.txt"), end: 10, policy: options() },
        { name: "move", path: Buffer.from("renamed.txt"), end: 10, policy: options(1) },
        ...(["modified", "created", "all"] as const).map(search => ({ name: "copy", path: Buffer.from("copied.txt"), end: 11, policy: options(1, 1, search) })),
      ];
      const observations: ReturnType<typeof lines>[] = [];
      for (const test of cases) {
        const input = { ...request, target: { algorithm: format, oid: f.commits[test.name] }, path: test.path,
          ranges: [{ start: 1, end: test.end }], options: test.policy };
        const expected = nativeLineOracle(box, f.repo, input.target.oid, input.path, input.ranges,
          test.policy.moveMinCharacters, test.policy.copyMinCharacters, test.policy.copySearch);
        expect(expected).toHaveLength(test.end);
        const actual = await live.attributeLines(input, ports);
        expect(actual.state, JSON.stringify(actual.coverage)).toBe("complete");
        expect(actual.coverage.state).toBe("current");
        expect(actual.coverage.gaps).toEqual([]);
        expect(lines(actual)).toEqual(expected);
        expect(actual.target).toEqual(input.target);
        expect(Buffer.from(actual.path)).toEqual(input.path);
        expect(actual.ranges).toEqual(input.ranges);
        expect(actual.options).toEqual(input.options);
        expect(actual.policyVersion).toBe(POLICY_VERSION);
        expect(actual.calculationVersion).toBe("live-line-attribution/1");
        expect(actual.gitVersion).toMatch(/^git version /);
        expect(await live.attributeLines(input, ports)).toEqual(actual);
        for (const evidence of actual.parentEvidence) {
          const parents = box.read(f.repo, ["rev-list", "--parents", "--no-walk", evidence.commit.oid]).toString().trim().split(" ").slice(1);
          expect(evidence.parents.map(parent => parent.oid)).toEqual(parents);
        }
        for (const origin of actual.origins) {
          expect(origin.author).toEqual({ name: "L0 Fixture", email: "l0@example.invalid", unixSeconds: 1700000000, offsetMinutes: 0 });
        }
        observations.push(lines(actual));
      }
      expect(observations[3]).not.toEqual(observations[4]); // -M is consequential.
      expect(observations[5]).not.toEqual(observations[7]); // -C search is consequential.
      const sparse = { ...request, ranges: [{ start: 2, end: 3 }, { start: 8, end: 9 }] };
      expect(lines(await live.attributeLines(sparse, ports))).toEqual(nativeLineOracle(box, f.repo, request.target.oid,
        Buffer.from(request.path), sparse.ranges, 1, 1));
      const merge = await live.attributeLines({ ...request, target: { algorithm: format, oid: f.commits.merge }, path: f.rawPath, ranges: [{ start: 1, end: 10 }] }, ports);
      expect(merge.parentEvidence.find(e => e.commit.oid === f.commits.merge)?.parents.map(p => p.oid)).toEqual([f.commits.left, f.commits.right]);
      expect(merge.origins.some(origin => origin.commit.oid === f.commits.merge)).toBe(true);
      expect(merge.origins.some(origin => Buffer.from(origin.path).equals(f.rawPath))).toBe(true);
      expect(inventoryDigest(f)).toBe(before);
      expect(inventoryDigest({ root: f.privateRoot })).toBe(retainedBefore);
    }
  }, 30000);

  it("missing shallow excluded or unauthorized origins remain partial and attribution writes nothing into any observed worktree or Git directory", async () => {
    expect(typeof live.attributeLines).toBe("function");
    const { fixture: f, request, ports, accesses } = setup();
    const before = inventoryDigest(f);
    const retainedBefore = inventoryDigest({ root: f.privateRoot });
    const expectPartial = async (input: LineAttributionRequestDto, using: LineAttributionPorts, cause: string) => {
      const actual = await live.attributeLines(input, using);
      expect(actual.state).toBe("partial");
      expect(actual.coverage.state).toBe("partial");
      expect(actual.coverage.gaps.some(gap => gap.cause === cause), JSON.stringify(actual.coverage)).toBe(true);
      expect(actual.origins).toEqual([]);
      return actual;
    };
    for (const store of ["missing", "missing-blob", "shallow"]) {
      await expectPartial(request, { ...ports, async openRetained(input) {
        const retained = await ports.openRetained(input);
        return { ...retained!, cwd: f.stores[store], configPaths: [join(f.stores[store], ".git", "config")] };
      } }, store === "shallow" ? "shallow" : "missing-object");
    }
    await expectPartial(request, { ...ports, async openRetained() { return null; } }, "missing-retention");
    await expectPartial(request, { ...ports, async openRetained(input) {
      const retained = await ports.openRetained(input);
      return { ...retained!, receipt: { ...retained!.receipt, scope: { tenant: "foreign", clone: "clone-g1" } } };
    } }, "missing-retention");
    for (const denial of ["unauthorized", "excluded"] as const) {
      accesses.length = 0;
      await expectPartial(request, { ...ports, async authorize() { return denial; } }, denial);
      expect(accesses).toEqual([]); // Authorization precedes every retained-store access.
      await expectPartial(request, { ...ports, async authorize(_input, origin) { return origin ? denial : "authorized"; } }, denial);
    }
    let checks = 0;
    await expectPartial(request, { ...ports, async authorize() { return ++checks > 1 ? "unauthorized" : "authorized"; } }, "unauthorized");
    await expectPartial({ ...request, path: Buffer.from("absent.txt") }, ports, "missing-path");
    await expectPartial({ ...request, ranges: [{ start: 10, end: 99 }] }, ports, "invalid-range");
    for (const input of [
      { ...request, path: Buffer.from("../escape") },
      { ...request, target: { algorithm: "sha1" as const, oid: "main" } },
      { ...request, ranges: [{ start: 4, end: 3 }] },
      { ...request, options: { ...request.options, version: "unknown" as never } },
    ]) await expect(live.attributeLines(input, ports)).rejects.toThrow();
    expect(inventoryDigest(f)).toBe(before);
    expect(inventoryDigest({ root: f.privateRoot })).toBe(retainedBefore);
  }, 30000);
});
