import { join } from "node:path";
import { cpSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import * as live from "../engram-live/index.js";
import { createSafeGitExecutor } from "../engram-live/git-executor.js";
import { POLICY_VERSION } from "../engram-live/contracts.js";
import { buildHistory, buildLineAttributionFixture, inventoryDigest, LiveGitSandbox, nativeLineOracle } from "./helpers/live-git-fixtures.js";
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
    git: createSafeGitExecutor({ gitPath: box.trace.executable, disabledHooksDir: join(box.root, "disabled-hooks"),
      env: { GIT_TRACE2_EVENT: join(box.root, "attribution-trace.jsonl") } }),
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
        { name: "move", path: Buffer.from("renamed.txt"), end: 10, policy: options(1), oracle: ["-M1"] },
        { name: "copy", path: Buffer.from("copied.txt"), end: 11, policy: options(1, 1, "modified"), oracle: ["-M1", "-C1"] },
        { name: "copy", path: Buffer.from("copied.txt"), end: 11, policy: options(1, 1, "created"), oracle: ["-M1", "-C1", "-C1"] },
        { name: "copy", path: Buffer.from("copied.txt"), end: 11, policy: options(1, 1, "all"), oracle: ["-M1", "-C1", "-C1", "-C1"] },
        { name: "root", path: Buffer.from("nested/inner.txt"), end: 3, policy: options() },
      ];
      const observations: ReturnType<typeof lines>[] = [];
      for (const test of cases) {
        const input = { ...request, target: { algorithm: format, oid: f.commits[test.name] }, path: test.path,
          ranges: [{ start: 1, end: test.end }], options: test.policy };
        const expected = nativeLineOracle(box, f.repo, input.target.oid, input.path, input.ranges, test.oracle);
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
          const [name, email, seconds, date] = box.read(f.repo, ["show", "-s", "--format=%an%x00%ae%x00%at%x00%aI", origin.commit.oid]).toString().trim().split("\0");
          expect(date).toMatch(/(?:Z|[+-]\d\d:\d\d)$/);
          const zone = /([+-])(\d\d):(\d\d)$/.exec(date);
          expect(origin.author).toEqual({ name, email, unixSeconds: Number(seconds),
            offsetMinutes: zone ? (Number(zone[2]) * 60 + Number(zone[3])) * (zone[1] === "-" ? -1 : 1) : 0 });
        }
        observations.push(lines(actual));
      }
      expect(observations[3]).not.toEqual(observations[4]); // -M is consequential.
      expect(observations[5]).not.toEqual(observations[7]); // -C search is consequential.
      const sparse = { ...request, ranges: [{ start: 2, end: 3 }, { start: 8, end: 9 }] };
      expect(lines(await live.attributeLines(sparse, ports))).toEqual(nativeLineOracle(box, f.repo, request.target.oid,
        Buffer.from(request.path), sparse.ranges, ["-M1", "-C1", "-C1", "-C1"]));
      const merge = await live.attributeLines({ ...request, target: { algorithm: format, oid: f.commits.merge }, path: f.rawPath, ranges: [{ start: 1, end: 10 }] }, ports);
      expect(merge.parentEvidence.find(e => e.commit.oid === f.commits.merge)?.parents.map(p => p.oid)).toEqual([f.commits.left, f.commits.right]);
      expect(merge.origins.some(origin => origin.commit.oid === f.commits.merge)).toBe(true);
      expect(merge.origins.some(origin => Buffer.from(origin.path).equals(f.rawPath))).toBe(true);
      const coveredByTip = await live.attributeLines({ ...request, target: { algorithm: format, oid: f.commits.merge }, path: f.rawPath, ranges: [{ start: 1, end: 10 }] }, {
        ...ports, async openRetained(input) {
          const view = await ports.openRetained(input);
          return { ...view!, receipt: { ...view!.receipt, oid: f.commits.copy } };
        },
      });
      expect(coveredByTip.state).toBe("complete");
      expect(coveredByTip.retainedRoot?.oid).toBe(f.commits.copy);
      expect(lines(coveredByTip)).toEqual(lines(merge));
      expect(inventoryDigest(f)).toBe(before);
      expect(inventoryDigest({ root: f.privateRoot })).toBe(retainedBefore);
      const trace = readFileSync(join(box.root, "attribution-trace.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
      expect(trace.filter(event => event.event === "child_start")).toEqual([]);
      expect(trace.filter(event => event.event === "start").length).toBeGreaterThan(0);
      for (const start of trace.filter(event => event.event === "start")) {
        expect(start.argv).toContain("--no-optional-locks");
        expect(start.argv).toContain("protocol.allow=never");
      }
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
      expect(actual.parentEvidence).toEqual([]);
      expect(actual.retainedRoot).toBeNull();
      return actual;
    };
    for (const store of ["missing", "missing-blob", "shallow"]) {
      await expectPartial(request, { ...ports, async openRetained(input) {
        const retained = await ports.openRetained(input);
        return { ...retained!, cwd: f.stores[store], configPaths: [join(f.stores[store], ".git", "config")] };
      } }, store === "shallow" ? "shallow" : "missing-object");
    }
    await expectPartial(request, { ...ports, async openRetained() { return null; } }, "missing-retention");
    let blameCalled = false;
    await expectPartial(request, { ...ports,
      git: { ...ports.git, blame() { blameCalled = true; throw new Error("must never launch"); } },
      async openRetained(input) {
        const view = await ports.openRetained(input);
        return { ...view!, cwd: f.stores["external-config"], configPaths: [join(f.stores["external-config"], ".git", "config")] };
      },
    }, "git-unavailable");
    expect(blameCalled).toBe(false);
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

  it("rejects implicit move detection and inactive copy search before accessing retained objects", async () => {
    const { box, fixture: f, request, ports, accesses } = setup();
    // Native -C alone moves lines at Git's implicit threshold. The oracle
    // receives literal flags, independently of the producer's DTO mapping.
    const path = Buffer.from("renamed.txt"), ranges = [{ start: 1, end: 10 }];
    const plain = nativeLineOracle(box, f.repo, f.commits.move, path, ranges);
    const implicitMove = nativeLineOracle(box, f.repo, f.commits.move, path, ranges, ["-C1"]);
    expect(implicitMove).not.toEqual(plain);
    expect(implicitMove).toEqual(nativeLineOracle(box, f.repo, f.commits.move, path, ranges, ["-M20", "-C1"]));
    await expect(live.attributeLines({ ...request, options: options(null, 1) }, ports)).rejects.toThrow();
    expect(accesses).toEqual([]);
  });

  it.each(["modified", "created"] as const)("rejects inactive %s copy search before accessing retained objects", async search => {
    const { request, ports, accesses } = setup();
    await expect(live.attributeLines({ ...request, options: options(1, null, search) }, ports)).rejects.toThrow();
    expect(accesses).toEqual([]);
  });

  it("reads only target ancestry in object batches and limits parent evidence to that ancestry", async () => {
    const { box, fixture: f, request, ports } = setup();
    for (const name of ["root", "merge"] as const) {
      const target = f.commits[name];
      const ancestors = box.read(f.repo, ["rev-list", target, "--"]).toString().trim().split("\n");
      const reads: string[][] = [], authorized = new Set<string>();
      const actual = await live.attributeLines({ ...request, target: { ...request.target, oid: target },
        path: f.rawPath, ranges: [{ start: 1, end: 9 }] }, {
        ...ports,
        async openRetained(input) {
          const view = await ports.openRetained(input);
          return { ...view!, receipt: { ...view!.receipt, oid: f.commits.copy } };
        },
        async authorize(_input, origin) {
          if (origin) { authorized.add(origin.commit.oid); return ancestors.includes(origin.commit.oid) ? "authorized" : "excluded"; }
          return "authorized";
        },
        git: { ...ports.git, run(cwd, args, input, env) {
          if (args[0] === "cat-file") {
            expect(args).toEqual(["cat-file", "--batch"]);
            reads.push(input!.toString().trim().split("\n"));
          }
          return ports.git.run(cwd, args, input, env);
        } },
      });
      expect(actual.state, JSON.stringify(actual.coverage)).toBe("complete");
      expect(actual.parentEvidence.map(e => e.commit.oid).sort()).toEqual(ancestors.sort());
      expect([...authorized].sort()).toEqual(ancestors);
      expect(reads[0].sort()).toEqual(ancestors);
      expect(reads.every(batch => batch.length <= 128)).toBe(true);
    }
    const outside = await live.attributeLines({ ...request, target: { ...request.target, oid: f.commits.right },
      path: f.rawPath, ranges: [{ start: 1, end: 9 }] }, {
      ...ports, async openRetained(input) {
        const view = await ports.openRetained(input);
        return { ...view!, receipt: { ...view!.receipt, oid: f.commits.left } };
      },
    });
    expect(outside.state).toBe("partial");
    expect(outside.coverage.gaps[0]?.cause).toBe("missing-retention");
    expect(outside.parentEvidence).toEqual([]);
  });

  it("admits only pinned ancestry checks and bounded batches of literal object IDs", () => {
    let launches = 0;
    const git = createSafeGitExecutor({ gitPath: "/usr/bin/git", disabledHooksDir: "/tmp", spawn() {
      launches++; return { status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    } });
    const oid = "a".repeat(40), other = "b".repeat(64);
    git.run("/tmp", ["rev-list", oid, "--"]);
    git.probe("/tmp", ["merge-base", "--is-ancestor", oid, oid]);
    git.run("/tmp", ["cat-file", "--batch"], `${oid}\n${other}\n`);
    const count = launches;
    for (const args of [["rev-list", "--all"], ["rev-list", "HEAD", "--"], ["rev-list", oid, "--", "file"],
      ["merge-base", oid, oid], ["merge-base", "--is-ancestor", "HEAD", oid], ["cat-file", "--batch", "--filters"]]) {
      expect(() => git.run("/tmp", args)).toThrow();
    }
    for (const input of [undefined, "", `${oid}`, "HEAD\n", `${oid}:file\n`, `${oid}\n\n`, `${oid}\n`.repeat(129), Buffer.from([255, 10])]) {
      expect(() => git.probe("/tmp", ["cat-file", "--batch"], input)).toThrow();
    }
    expect(launches).toBe(count);
  });

  it("splits long target ancestry into bounded commit batches without reading the retained tip descendants", async () => {
    const { box, fixture: f, request, ports } = setup();
    const history = await buildHistory(box, { main: 260, pr: 1 });
    cpSync(join(history.repo, ".git", "objects"), join(f.stores.complete, ".git", "objects"), { recursive: true });
    const tip = box.read(history.repo, ["rev-parse", "main"]).toString().trim();
    const target = box.read(history.repo, ["rev-parse", "main~130"]).toString().trim();
    const expected = box.read(history.repo, ["rev-list", target, "--"]).toString().trim().split("\n");
    const batches: string[][] = [];
    const actual = await live.attributeLines({ ...request, target: { ...request.target, oid: target },
      path: Buffer.from("history.txt"), ranges: [{ start: 1, end: 1 }], options: options() }, {
      ...ports, async openRetained(input) {
        const view = await ports.openRetained(input);
        return { ...view!, receipt: { ...view!.receipt, oid: tip } };
      }, git: { ...ports.git, run(cwd, args, input, env) {
        if (args[0] === "cat-file") batches.push(input!.toString().trim().split("\n"));
        return ports.git.run(cwd, args, input, env);
      } },
    });
    expect(actual.state, JSON.stringify(actual.coverage)).toBe("complete");
    expect(batches.slice(0, 2).map(batch => batch.length)).toEqual([128, 2]);
    expect(batches.slice(0, 2).flat().sort()).toEqual(expected.sort());
    expect(actual.parentEvidence.map(e => e.commit.oid).sort()).toEqual(expected);
    expect(batches).toHaveLength(4); // Two commit batches, one target tree and one blob.
  });

  it("admits only the exact versioned blame form and preserves a literal final byte argument", () => {
    const launches: { args: readonly string[]; path?: Uint8Array }[] = [];
    const executor = createSafeGitExecutor({ gitPath: "/usr/bin/git", disabledHooksDir: "/tmp",
      spawn: (_git, args, input) => {
        if (args.includes("config")) return { status: 1, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
        launches.push({ args, path: input.pathBytes }); return { status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      } });
    const oid = "a".repeat(40);
    const base = ["blame", "--root", "--line-porcelain", "--no-textconv", "--no-progress", "--encoding=none",
      "--ignore-revs-file", "", "--diff-algorithm=myers", "--no-indent-heuristic"];
    const suffix = ["-L", "1,2", oid, "--", "safe.txt"];
    for (const flags of [[], ["-M1"], ["-M20", "-C20"], ["-M5", "-C40", "-C40"], ["-M20", "-C40", "-C40", "-C40"]]) {
      executor.blame("/tmp", [...base, ...flags, ...suffix.slice(0, -1)], Buffer.from("safe.txt"), ["/tmp/config"]);
    }
    const count = launches.length;
    const refused = [
      ["blame", "--line-porcelain", oid, "--", "safe.txt"],
      [...base.filter(arg => arg !== "--no-textconv"), ...suffix],
      [...base, "--textconv", ...suffix], [...base, "--reverse", ...suffix],
      [...base, "--first-parent", ...suffix], [...base, "--contents", "secret", ...suffix],
      [...base, "--output=/tmp/forbidden", ...suffix], [...base, "-M0", ...suffix],
      ...[["-C1"], ["-C40", "-C40"], ["-C40", "-C40", "-C40"]].map(flags => [...base, ...flags, ...suffix]),
      [...base, "-C20", "-C40", ...suffix], [...base, "-C20", "-C20", "-C20", "-C20", ...suffix],
      [...base, "-L", "0,2", oid, "--", "safe.txt"],
      [...base, "-L", "1,3", "-L", "3,5", oid, "--", "safe.txt"],
      [...base, "-L", "1,2", "main", "--", "safe.txt"],
      [...base, "-L", "1,2", "a".repeat(41), "--", "safe.txt"],
      ...["../escape", "/absolute", "nul\0path"].map(path => [...base, ...suffix.slice(0, -1), path]),
    ];
    for (const args of refused) expect(() => executor.blame("/tmp", args.slice(0, -1), Buffer.from(args.at(-1)!), ["/tmp/config"])).toThrow();
    expect(() => executor.run("/tmp", [...base, ...suffix])).toThrow();
    expect(() => executor.run("/tmp", [...base, ...suffix], "unapproved input")).toThrow();
    expect(() => executor.probe("/tmp", [...base, ...suffix], undefined, { GIT_DIR: "/tmp/other" })).toThrow();
    expect(() => executor.blame("/tmp", ["ls-files", "--"], Buffer.from("path"), ["/tmp/config"])).toThrow();
    expect(launches).toHaveLength(count); // Every refusal happens before spawn.
    const bytes = Buffer.from("2d2428746f7563682070726f68696269746564293bff0a", "hex");
    executor.blame("/tmp", [...base, ...suffix.slice(0, -1)], bytes, ["/tmp/config"]);
    expect(Buffer.from(launches[count].path!)).toEqual(bytes);
    expect(launches[count].args.at(-1)).toBe("--");
    for (const launch of launches) {
      expect(launch.args).toContain("--no-optional-locks");
      expect(launch.args).toContain("core.fsmonitor=false");
      expect(launch.args).toContain("protocol.allow=never");
      expect(launch.args).toContain("core.quotePath=true");
    }
  });

  it("rejects corrupted native coordinates object bytes truncated porcelain and revocation before emission", async () => {
    const { fixture: f, request, ports } = setup();
    const before = inventoryDigest(f);
    const corruptions = [
      (bytes: Buffer) => Buffer.from(bytes.toString("latin1").replace(/^([a-f0-9]+) (\d+) (\d+)/, (_, oid, original, final) => `${oid} ${original} ${Number(final) + 1}`), "latin1"),
      (bytes: Buffer) => Buffer.from(bytes.toString("latin1").replace(/^([a-f0-9]+) (\d+) (\d+)/, (_, oid, original, final) => `${oid} ${Number(original) + 1} ${final}`), "latin1"),
      (bytes: Buffer) => bytes.subarray(0, bytes.length - 5),
      (bytes: Buffer) => Buffer.from(bytes.toString("latin1").replace(/^[a-f0-9]+/, "a".repeat(40)), "latin1"),
      (bytes: Buffer) => Buffer.from(bytes.toString("latin1").replace(/\\377/g, "\\777"), "latin1"),
    ];
    for (const corrupt of corruptions) {
      const actual = await live.attributeLines(request, { ...ports, git: { ...ports.git,
        blame: (cwd, args, path, configs) => corrupt(ports.git.blame(cwd, args, path, configs)),
      } });
      expect(actual.state).toBe("partial");
      expect(actual.origins).toEqual([]);
      expect(actual.parentEvidence).toEqual([]);
      expect(actual.coverage.gaps[0]?.cause).toBe("invalid-evidence");
    }
    const wrongObject = await live.attributeLines(request, { ...ports, git: { ...ports.git,
      run(cwd, args, input, env) {
        const bytes = ports.git.run(cwd, args, input, env);
        return args[0] === "cat-file" ? Buffer.concat([bytes, Buffer.from("corruption")]) : bytes;
      },
    } });
    expect(wrongObject.coverage.gaps[0]?.cause).toBe("invalid-evidence");
    let revoked = false;
    const denied = await live.attributeLines(request, { ...ports,
      async authorize() { return revoked ? "unauthorized" : "authorized"; },
      git: { ...ports.git, probeNoConfigIncludes() { revoked = true; return true; } },
    });
    expect(denied.state).toBe("partial");
    expect(denied.coverage.gaps[0]?.cause).toBe("unauthorized");
    expect(denied.origins).toEqual([]);
    expect(denied.parentEvidence).toEqual([]);
    const changedConfig = await live.attributeLines(request, { ...ports, git: { ...ports.git, probeNoConfigIncludes() { return false; } } });
    expect(changedConfig.coverage.gaps[0]?.cause).toBe("git-unavailable");
    expect(inventoryDigest(f)).toBe(before);
  });

  it("pins scope OID path ranges options and generation across caller and authorization-port mutations", async () => {
    const { request, ports } = setup();
    const expected = await live.attributeLines(request, ports);
    expect(expected.state).toBe("complete");
    const mutable = { ...request, target: { ...request.target }, scope: { ...request.scope },
      path: Buffer.from(request.path), ranges: request.ranges.map(range => ({ ...range })), options: { ...request.options } };
    let changed = false;
    const actual = await live.attributeLines(mutable, { ...ports, async authorize(portInput, origin) {
      if (!changed) {
        changed = true;
        mutable.target.oid = "a".repeat(40); mutable.scope.tenant = "foreign"; mutable.path.fill(120);
        mutable.ranges[0].end = 1; mutable.options.copyMinCharacters = null; mutable.generationId = "foreign-generation";
      }
      // Mutation through the copied port arguments cannot alter the facts.
      (portInput.path as Uint8Array).fill(121);
      (portInput.target as { oid: string }).oid = "b".repeat(40);
      if (origin) (origin.path as Uint8Array).fill(122);
      return "authorized";
    } });
    expect(actual).toEqual(expected);
  });
});
