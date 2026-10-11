import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  LiveGitSandbox, buildCorpus, buildHistory, detectGitCapabilities,
  observeCorpus, normalizeOracle, inventoryDigest, recipe,
} from "./helpers/live-git-fixtures.js";

const sandboxes: LiveGitSandbox[] = [];
function sandbox() {
  const value = new LiveGitSandbox();
  sandboxes.push(value);
  return value;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const value of sandboxes.splice(0)) value.dispose();
});

describe("L0 review regressions", () => {
  it("merge parent numstats discriminate a repeated first parent", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const actual = normalizeOracle(observeCorpus(box, corpus), corpus);
    expect(actual["merge.left"]).toBe(recipe.oracle["merge.left"]);
    expect(actual["merge.right"]).toBe(recipe.oracle["merge.right"]);
    expect(actual["merge.right"]).not.toBe(actual["merge.left"]);
    box.trace.assertSafe();
  });

  it.each([
    "start only", "missing exit", "missing atexit", "foreign sid",
    "exit status mismatch", "atexit status mismatch", "reversed terminals", "reused sid",
  ])("process trace rejects %s evidence", (fault) => {
    const box = sandbox();
    // Identical argv must still correspond to distinct, complete sessions.
    box.git(box.root, ["--version"]);
    box.git(box.root, ["--version"]);
    box.trace.assertSafe();
    const events = readFileSync(box.trace.path, "utf8").trim().split("\n").map(line => JSON.parse(line));
    const starts = events.filter(event => event.event === "start");
    const sid = starts[1].sid;
    let corrupt = events;
    if (fault === "start only") corrupt = events.filter(event => event.sid !== sid || event.event === "start");
    if (fault === "missing exit") corrupt = events.filter(event => event.sid !== sid || event.event !== "exit");
    if (fault === "missing atexit") corrupt = events.filter(event => event.sid !== sid || event.event !== "atexit");
    if (fault === "foreign sid") events.find(event => event.sid === sid && event.event === "atexit").sid = "unrecorded-session";
    if (fault === "exit status mismatch") events.find(event => event.sid === sid && event.event === "exit").code = 97;
    if (fault === "atexit status mismatch") events.find(event => event.sid === sid && event.event === "atexit").code = 97;
    if (fault === "reversed terminals") {
      const exit = events.findIndex(event => event.sid === sid && event.event === "exit");
      const atexit = events.findIndex(event => event.sid === sid && event.event === "atexit");
      [events[exit], events[atexit]] = [events[atexit], events[exit]];
    }
    if (fault === "reused sid") for (const event of events) if (event.sid === sid) event.sid = starts[0].sid;
    writeFileSync(box.trace.path, corrupt.map(event => JSON.stringify(event)).join("\n") + "\n");
    expect(() => box.trace.assertSafe()).toThrow(/L0 .*process trace/);
  });

  it("process trace accepts a complete nonzero exit and rejects a child launch", () => {
    const box = sandbox();
    expect(box.probe(box.root, ["--l0-invalid-option"]).status).not.toBe(0);
    box.trace.assertSafe();
    const trace = readFileSync(box.trace.path, "utf8");
    const start = trace.trim().split("\n").map(line => JSON.parse(line)).find(event => event.event === "start");
    // Inject evidence only; never run a repository program.
    writeFileSync(box.trace.path, trace + JSON.stringify({ event: "child_start", sid: start.sid, argv: ["tripwire"] }) + "\n");
    expect(() => box.trace.assertSafe()).toThrow(/repository-triggered child process/);
  });

  it("unknown hash algorithm remains an unsupported SHA-256 capability with its diagnostic", () => {
    const box = sandbox();
    const probe = box.probe.bind(box);
    const diagnostic = "fatal: unknown hash algorithm 'sha256'\n";
    vi.spyOn(box, "probe").mockImplementation((cwd, args, phase, input) =>
      args.includes("--object-format=sha256")
        ? { status: 128, stdout: Buffer.alloc(0), stderr: Buffer.from(diagnostic) }
        : probe(cwd, args, phase, input));
    const capabilities = detectGitCapabilities(box);
    expect(capabilities.objectFormats).toEqual(["sha1"]);
    expect(capabilities.unsupported.sha256).toBe(diagnostic.trim());
    box.trace.assertSafe();
  });

  it("constructor failure removes its temporary fixture before rethrowing", () => {
    const parent = dirname(sandbox().root);
    const before = readdirSync(parent).sort();
    vi.stubEnv("PATH", "");
    try {
      expect(() => new LiveGitSandbox()).toThrow("L0 requires installed Git");
      expect(readdirSync(parent).sort()).toEqual(before);
    } finally {
      vi.unstubAllEnvs();
      // Also clean up when exercising the pre-fix/mutated constructor.
      for (const name of readdirSync(parent)) {
        if (!before.includes(name)) rmSync(join(parent, name), { recursive: true, force: true });
      }
    }
  });
});

describe("L0 Git corpus and native oracles", () => {
  it("native Git oracle distinguishes refs, ordered merge parents, index stages and linked worktrees", async () => {
    const box = sandbox();
    const capabilities = detectGitCapabilities(box);
    console.info("L0 capabilities", JSON.stringify(capabilities));
    for (const format of capabilities.objectFormats) {
      for (const refs of capabilities.refFormats) {
        const corpus = buildCorpus(box, format, refs);
        const before = inventoryDigest(corpus);
        const actual = observeCorpus(box, corpus);
        expect(normalizeOracle(actual, corpus)).toEqual(recipe.oracle);
        expect(inventoryDigest(corpus)).toBe(before);
        expect(box.read(corpus.repo, ["rev-parse", "--show-object-format"]).toString().trim()).toBe(format);
        expect(box.read(corpus.repo, ["rev-parse", "--show-ref-format"]).toString().trim()).toBe(refs);
        expect(corpus.commits.root).toBe(recipe.rootOids[format]);
        for (const worktree of [corpus.linked, corpus.detached, corpus.sparse]) {
          expect(lstatSync(join(worktree, ".git")).isFile()).toBe(true);
          expect(readFileSync(join(worktree, ".git"), "utf8")).toMatch(/^gitdir: /);
          expect(box.read(worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).toString().trim()).toBe(join(corpus.repo, ".git"));
        }
        expect(corpus.detached).toMatch(/[/\\]\.h2a[/\\]jobs[/\\]l0[/\\]wt$/);
        expect(box.probe(corpus.detached, ["symbolic-ref", "-q", "HEAD"], "oracle").status).toBe(1);
        expect(box.read(corpus.detached, ["rev-parse", "HEAD"]).toString().trim()).toBe(corpus.commits.merge);
        if (refs === "files") {
          expect(readFileSync(join(corpus.repo, ".git", "packed-refs"), "utf8")).toContain("refs/heads/main");
          expect(existsSync(join(corpus.repo, ".git", "refs", "heads", "main"))).toBe(false);
        }
      }
    }
    box.trace.assertSafe();
    console.info("L0 native oracle processes", box.trace.counts());
  });

  it("the corpus exposes empty, shallow, sparse, binary, renamed, filtered and non-UTF-8 paths without running repository programs", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    // An existing user-owned lock remains untouched by all oracle reads.
    writeFileSync(join(corpus.repo, ".git", "index.lock"), "fixture owner lock\n");
    const before = inventoryDigest(corpus);
    expect(box.read(corpus.empty, ["for-each-ref"]).length).toBe(0);
    expect(box.probe(corpus.empty, ["rev-parse", "--verify", "HEAD"], "oracle").status).not.toBe(0);
    expect(box.read(corpus.shallow, ["rev-parse", "--is-shallow-repository"]).toString()).toBe("true\n");
    expect(box.read(corpus.shallow, ["rev-list", "--count", "HEAD"]).toString()).toBe("1\n");
    expect(existsSync(join(corpus.sparse, "sparse", "omitted.txt"))).toBe(false);
    expect(box.read(corpus.sparse, ["ls-files", "-v", "--", "sparse/omitted.txt"]).toString()).toBe("S sparse/omitted.txt\n");
    expect(lstatSync(join(corpus.repo, "link")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(corpus.repo, "link"))).toBe("../outside-secret");
    expect(readFileSync(join(corpus.repo, ".env"), "utf8")).toBe("FIXTURE_SECRET=protected\n");
    expect(readFileSync(join(corpus.repo, ".github", "workflows", "ci.yml"), "utf8")).toBe("name: fixture\n");
    expect(box.read(corpus.repo, ["cat-file", "blob", corpus.blobs.binary])).toEqual(Buffer.from(recipe.binaryHex, "hex"));
    expect(box.read(corpus.repo, ["cat-file", "blob", corpus.blobs.filtered]).toString()).toBe("raw filtered bytes\n");
    const names = box.read(corpus.repo, ["ls-tree", "-rz", "--name-only", corpus.commits.main]);
    expect(names.includes(Buffer.from(recipe.rawPathHex + "00", "hex"))).toBe(true);
    expect(names.includes(Buffer.from("tab\tline\n.txt\0"))).toBe(true);
    expect(readFileSync(Buffer.concat([Buffer.from(corpus.repo + "/"), Buffer.from(recipe.rawPathHex, "hex")]), "utf8")).toBe("non UTF-8 path\n");
    expect(normalizeOracle(observeCorpus(box, corpus), corpus)).toEqual(recipe.oracle);
    expect(box.read(corpus.repo, ["check-attr", "-z", "--stdin", "filter", "diff"], Buffer.from("filtered.dat\0"))).toEqual(Buffer.from("filtered.dat\0filter\0tripwire\0filtered.dat\0diff\0tripwire\0"));
    expect(readFileSync(join(corpus.repo, "conflict.txt"), "utf8")).toBe("unstaged conflict\n");
    expect(box.read(corpus.repo, ["cat-file", "blob", corpus.blobs.staged]).toString()).toBe("staged rename\n");
    expect(box.read(corpus.repo, ["cat-file", "blob", `${corpus.commits.main}:new.txt`]).toString()).toBe("rename without edits\n");
    expect(readFileSync(join(corpus.repo, "new.txt"), "utf8")).toBe("unstaged rename\n");
    expect(box.read(corpus.linked, ["ls-files", "--unmerged", "-z"]).length).toBe(0);
    expect(inventoryDigest(corpus)).toBe(before);
    expect(existsSync(corpus.tripwireMarker)).toBe(false);
    box.trace.assertSafe();
    console.info("L0 GUARD processes", box.trace.counts());
  });

  it("small generated history exercises the same main and PR ancestry without network", async () => {
    const box = sandbox();
    const history = await buildHistory(box, recipe.history.routine);
    expect(box.read(history.repo, ["rev-list", "--count", "refs/heads/main"]).toString()).toBe(`${recipe.history.routine.main}\n`);
    expect(box.read(history.repo, ["rev-list", "--count", `${history.base}..refs/pull/1/head`]).toString()).toBe(`${recipe.history.routine.pr}\n`);
    expect(box.read(history.repo, ["rev-list", "--count", "--all"]).toString()).toBe(`${recipe.history.routine.main + recipe.history.routine.pr}\n`);
    expect(box.read(history.repo, ["remote"]).length).toBe(0);
    box.trace.assertSafe();
    console.info("L0 routine history", { ...recipe.history.routine, ...box.trace.counts() });
  });

  // Qualification tier, opt in: LIVE_GIT_QUALIFICATION=1 npx vitest run tests/live-fixtures.test.ts
  it.skipIf(process.env.LIVE_GIT_QUALIFICATION !== "1")("generated history exceeds 100000 commits and includes a 1501-commit PR without a network dependency", async () => {
    const box = sandbox();
    const history = await buildHistory(box, recipe.history.qualification);
    expect(Number(box.read(history.repo, ["rev-list", "--count", "refs/heads/main"]))).toBe(100001);
    expect(Number(box.read(history.repo, ["rev-list", "--count", `${history.base}..refs/pull/1/head`]))).toBe(1501);
    expect(Number(box.read(history.repo, ["rev-list", "--count", "--all"]))).toBe(101502);
    expect(box.read(history.repo, ["remote"]).length).toBe(0);
    box.trace.assertSafe();
    console.info("L0 QUALIFICATION", { ...recipe.history.qualification, ...box.trace.counts() });
  }, 120_000);
});
