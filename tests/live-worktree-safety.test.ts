import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readdirSync,
  readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { delimiter, dirname, join } from "node:path";
import { LiveGitSandbox, buildCorpus, inventoryDigest, recipe } from "./helpers/live-git-fixtures.js";
import { createSafeGitExecutor } from "../engram-live/git-executor.js";
import { captureWorktree, type CapturedFile, type StableCapture } from "../engram-live/worktree.js";
import { ForbiddenPathError, defaultReadFileBytes } from "../engram-live/filesystem.js";
import type { SafeReadSeam } from "../engram-live/filesystem.js";

// Review sol2 constat 2 (policy read replacement) is reproduced through the
// node:fs functions themselves: a racing writer replaces the policy file
// between its stat and its read, whatever reader implementation sits behind
// them. The wrappers delegate everything and only act on the armed
// candidate path, so every other test in this file is untouched.
const policyAttack = vi.hoisted(() => ({
  armed: false,
  candidate: null as Buffer | null,
  swap: null as (() => void) | null,
  leak: false,
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const isCandidate = (path: unknown): boolean => {
    if (!policyAttack.armed || policyAttack.candidate === null) return false;
    if (typeof path === "string") return Buffer.from(path).equals(policyAttack.candidate);
    return Buffer.isBuffer(path) && path.equals(policyAttack.candidate);
  };
  return {
    ...actual,
    readFileSync: ((path: unknown, options?: unknown) => {
      if (isCandidate(path) && policyAttack.swap) {
        policyAttack.swap();
        const bytes = actual.readFileSync(path as never, options as never);
        policyAttack.leak = true;
        return bytes;
      }
      return actual.readFileSync(path as never, options as never);
    }) as typeof actual.readFileSync,
    openSync: ((path: unknown, flags?: unknown, mode?: unknown) => {
      if (isCandidate(path) && policyAttack.swap) policyAttack.swap();
      return actual.openSync(path as never, flags as never, mode as never);
    }) as typeof actual.openSync,
  };
});

const sandboxes: LiveGitSandbox[] = [];
function sandbox(): LiveGitSandbox {
  const value = new LiveGitSandbox();
  sandboxes.push(value);
  return value;
}
afterEach(() => {
  for (const value of sandboxes.splice(0)) value.dispose();
});

function sha256Hex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pathBytes(path: string | Buffer): Buffer {
  return Buffer.isBuffer(path) ? path : Buffer.from(path);
}

/** Captured paths are raw bytes; ASCII test names compare bytewise. */
function findFile(capture: StableCapture, path: string | Buffer): CapturedFile | undefined {
  return capture.files.find((file) => file.path.equals(pathBytes(path)));
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Fail-on-call trap implemented as a shell script (no Python anywhere). */
function installPythonTrap(box: LiveGitSandbox): { dir: string; marker: string } {
  const dir = join(box.root, "trap-bin");
  mkdirSync(dir, { recursive: true });
  const marker = join(box.root, "python3-invoked");
  writeFileSync(dir + "/python3", "#!/bin/sh\nprintf 'invoked\\n' >> \"$L4A_TRAP_MARKER\"\nexit 97\n");
  chmodSync(dir + "/python3", 0o755);
  return { dir, marker };
}

function collector(box: LiveGitSandbox, log: string[][], trapDir: string, marker: string) {
  const gitDir = dirname(box.trace.executable);
  const env = {
    PATH: [trapDir, gitDir, "/usr/bin", "/bin"].join(delimiter),
    L4A_TRAP_MARKER: marker,
  };
  return createSafeGitExecutor({
    gitPath: box.trace.executable,
    disabledHooksDir: join(box.root, "disabled-hooks"),
    env,
    spawn: (gitPath, argv, options) => {
      log.push([...argv]);
      return box.trace.run(options.cwd, argv, options.input, "oracle", { ...env, ...options.env });
    },
  });
}

function findIndexLocks(root: string): string[] {
  const found: string[] = [];
  const suffix = Buffer.from("/index.lock");
  // Buffer directory walk: non-UTF-8 fixture paths (raw-ff.txt) must not
  // break the traversal through string mangling.
  const visit = (path: Buffer): void => {
    const stat = lstatSync(path);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path, { encoding: "buffer" }) as Buffer[]) {
        visit(Buffer.concat([path, Buffer.from("/"), name]));
      }
    } else if (path.subarray(path.length - suffix.length).equals(suffix)) {
      found.push(path.toString("latin1"));
    }
  };
  visit(Buffer.from(root));
  return found.sort();
}

describe("L4a safe index and worktree capture", () => {
  it("collection never launches clean process textconv external diff fsmonitor or a repository program", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const roots = [realpathSync(corpus.root)];
    const before = {
      index: sha256Hex(box.read(corpus.repo, ["ls-files", "--stage", "-z"])),
      refs: sha256Hex(box.read(corpus.repo, ["for-each-ref"])),
      checkout: inventoryDigest(corpus),
      locks: findIndexLocks(corpus.root),
    };
    for (const worktree of [corpus.repo, corpus.linked, corpus.sparse, corpus.detached]) {
      const capture = captureWorktree(exec, worktree, { authorizedRoots: roots });
      expect(capture.stable).toBe(true);
      if (capture.stable) expect(capture.attempts).toBe(1);
    }
    expect(log.length).toBeGreaterThan(0);
    for (const argv of log) {
      expect(argv).toContain("--no-optional-locks");
      expect(argv).toContain("core.fsmonitor=false");
      expect(argv.join("\0")).not.toMatch(/python3/);
    }
    const firstCheckAttr = log.findIndex((argv) => argv.includes("check-attr"));
    const firstRead = log.findIndex((argv) => argv.includes("cat-file") || argv.includes("hash-object"));
    expect(firstCheckAttr).toBeGreaterThanOrEqual(0);
    expect(firstRead).toBeGreaterThanOrEqual(0);
    expect(firstCheckAttr).toBeLessThan(firstRead);
    expect(log.flat().filter((word) => word === "-w")).toEqual([]);
    expect(log.some((argv) => argv.includes("update-index") || argv.includes("write-tree"))).toBe(false);
    expect(existsSync(corpus.tripwireMarker)).toBe(false);
    expect(existsSync(marker)).toBe(false);
    box.trace.assertSafe();
    expect(sha256Hex(box.read(corpus.repo, ["ls-files", "--stage", "-z"]))).toBe(before.index);
    expect(sha256Hex(box.read(corpus.repo, ["for-each-ref"]))).toBe(before.refs);
    expect(inventoryDigest(corpus)).toBe(before.checkout);
    expect(findIndexLocks(corpus.root)).toEqual(before.locks);
  });

  it("concurrent add and commit see no collector index lock or collector index mutation", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const roots = [realpathSync(corpus.root)];
    const locksBefore = findIndexLocks(corpus.root);
    // Plumbing-level concurrency in the tripwire repo: real index.lock
    // writers (update-index) and ref updates (update-ref) around captures.
    // Porcelain add/commit is excluded here on purpose: refreshing the
    // stat-dirty filtered.dat would legitimately invoke the L0 tripwire
    // filter, which must never run.
    const tree = box.read(corpus.repo, ["rev-parse", `${corpus.commits.main}^{tree}`]).toString().trim();
    let tip = corpus.commits.main;
    for (let index = 0; index < 3; index++) {
      box.git(corpus.repo, ["update-index", "--index-info"], `100644 ${corpus.blobs.base} 0\tconcurrent-${index}.txt\n`);
      tip = box.git(corpus.repo, ["commit-tree", tree, "-p", tip], `concurrent ${index}\n`).toString().trim();
      box.git(corpus.repo, ["update-ref", "refs/heads/concurrent", tip]);
      for (const capture of [
        captureWorktree(exec, corpus.repo, { authorizedRoots: roots }),
        captureWorktree(exec, corpus.linked, { authorizedRoots: roots }),
      ]) {
        expect(capture.stable).toBe(true);
      }
    }
    box.git(corpus.repo, ["update-ref", "-d", "refs/heads/concurrent"]);
    // Porcelain-level concurrency in a plain repo without tripwire config:
    // literal add/commit interleaved with captures.
    const plain = box.init(join(box.root, "plain"));
    box.git(plain, ["commit", "--allow-empty", "-q", "-m", "base"]);
    const plainRoots = [realpathSync(box.root)];
    for (let index = 0; index < 3; index++) {
      const name = `concurrent-${index}.txt`;
      writeFileSync(join(plain, name), `concurrent ${index}\n`);
      box.git(plain, ["add", "--", name]);
      box.git(plain, ["commit", "-q", "-m", `concurrent ${index}`]);
      expect(captureWorktree(exec, plain, { authorizedRoots: plainRoots }).stable).toBe(true);
    }
    expect(findIndexLocks(corpus.root)).toEqual(locksBefore);
    expect(log.some((argv) => argv.includes("update-index") || argv.includes("write-tree"))).toBe(false);
    expect(existsSync(corpus.tripwireMarker)).toBe(false);
    expect(existsSync(marker)).toBe(false);
    box.trace.assertSafe();
  });

  it("attributes and symlink changes during capture cause retry before forbidden content is read", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const roots = [realpathSync(corpus.root)];
    const reads: string[] = [];
    const readFileBytes = (rootReal: string, rel: Buffer) => {
      reads.push(rel.toString("latin1"));
      const bytes = readFileSync(Buffer.concat([Buffer.from(rootReal), Buffer.from("/"), rel]));
      return { bytes, fingerprint: sha256Hex(bytes) };
    };
    writeFileSync(join(corpus.repo, "a.txt"), "public bytes\n");
    let fired = false;
    const first = captureWorktree(exec, corpus.repo, {
      authorizedRoots: roots,
      readFileBytes,
      hooks: {
        betweenInventoryAndContent: () => {
          if (fired) return;
          fired = true;
          writeFileSync(join(corpus.repo, ".gitattributes"), "a.txt filter=tripwire\n", { flag: "a" });
          writeFileSync(join(corpus.repo, "a.txt"), "FORBIDDEN-FILTERED-BYTES\n");
        },
      },
    });
    expect(first.stable).toBe(true);
    if (first.stable) {
      expect(first.attempts).toBe(2);
      const entry = findFile(first, "a.txt");
      expect(entry?.status).toBe("excluded");
      expect(entry?.exclusionReason).toBe("filtered");
    }
    expect(reads).not.toContain("a.txt");
    expect(JSON.stringify(first)).not.toMatch(/FORBIDDEN-FILTERED-BYTES/);

    writeFileSync(join(corpus.repo, "inner.txt"), "inner\n");
    symlinkSync("inner.txt", join(corpus.repo, "link2"));
    let linkFired = false;
    const second = captureWorktree(exec, corpus.repo, {
      authorizedRoots: roots,
      readFileBytes,
      hooks: {
        betweenInventoryAndContent: () => {
          if (linkFired) return;
          linkFired = true;
          rmSync(join(corpus.repo, "link2"));
          symlinkSync("../outside-secret", join(corpus.repo, "link2"));
        },
      },
    });
    expect(second.stable).toBe(true);
    if (second.stable) {
      expect(second.attempts).toBe(2);
      const entry = findFile(second, "link2");
      expect(entry?.status).toBe("excluded");
      expect(entry?.exclusionReason).toBe("symlink-outside-root");
    }
    expect(reads.some((rel) => rel.includes("outside-secret"))).toBe(false);
    expect(JSON.stringify(second)).not.toMatch(/must not follow symlink/);

    let unstableFired = 0;
    const third = captureWorktree(exec, corpus.repo, {
      authorizedRoots: roots,
      maxAttempts: 3,
      hooks: {
        betweenInventoryAndContent: () => {
          unstableFired++;
          // Growing content: size changes on every attempt, so no clock
          // granularity can hide the instability.
          writeFileSync(join(corpus.repo, "churn.txt"), "x".repeat(unstableFired * 64) + "\n");
        },
      },
    });
    expect(third.stable).toBe(false);
    if (!third.stable) expect(third.attempts).toBe(3);
  });

  it("linked worktrees keep independent index stages and authorized hidden files including github remain visible", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const roots = [realpathSync(corpus.root)];
    const main = captureWorktree(exec, corpus.repo, { authorizedRoots: roots });
    const linked = captureWorktree(exec, corpus.linked, { authorizedRoots: roots });
    expect(main.stable).toBe(true);
    expect(linked.stable).toBe(true);
    if (main.stable && linked.stable) {
      const mainStages = main.entries.filter((entry) => entry.path.equals(Buffer.from("conflict.txt"))).map((entry) => entry.stage).sort();
      expect(mainStages).toContain(1);
      expect(mainStages).toContain(2);
      expect(mainStages).toContain(3);
      const linkedStages = linked.entries.filter((entry) => entry.path.equals(Buffer.from("conflict.txt"))).map((entry) => entry.stage);
      expect(linkedStages).toEqual([0]);
      expect(main.indexPath).not.toBe(linked.indexPath);
      for (const capture of [main, linked]) {
        const workflow = findFile(capture, ".github/workflows/ci.yml");
        expect(workflow?.status).toBe("present");
        for (const file of capture.files) {
          expect(file.path.toString("latin1").split("/")).not.toContain(".git");
        }
      }
    }
    const sparse = captureWorktree(exec, corpus.sparse, { authorizedRoots: roots });
    expect(sparse.stable).toBe(true);
    if (sparse.stable) {
      expect(findFile(sparse, "sparse/omitted.txt")?.status).toBe("sparse-omitted");
    }
  });

  it("reads never follow a symlinked parent out of the authorized root", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const outside = join(box.root, "outside-dir");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "secret.txt"), "PARENT-SYMLINK-LEAK\n");
    symlinkSync(outside, join(corpus.repo, "danger"));
    box.git(corpus.repo, ["update-index", "--add", "--cacheinfo", `100644,${corpus.blobs.base},danger/secret.txt`]);
    // Direct unit level: the safe read itself must refuse the parent symlink.
    expect(() => defaultReadFileBytes(corpus.repo, "danger/secret.txt")).toThrow(ForbiddenPathError);
    const capture = captureWorktree(exec, corpus.repo, { authorizedRoots: [realpathSync(corpus.root)] });
    expect(capture.stable).toBe(true);
    if (capture.stable) {
      const entry = findFile(capture, "danger/secret.txt");
      expect(entry?.status).toBe("excluded");
      expect(entry?.exclusionReason).toBe("symlink-outside-root");
      const link = findFile(capture, "danger");
      expect(link?.status).toBe("excluded");
      expect(link?.exclusionReason).toBe("symlink-outside-root");
    }
    expect(JSON.stringify(capture)).not.toMatch(/PARENT-SYMLINK-LEAK/);
    expect(existsSync(join(outside, "secret.txt"))).toBe(true);
    expect(existsSync(corpus.tripwireMarker)).toBe(false);
  });

  it("an attribute change during the collection loop stops the attempt before the newly forbidden file is read", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    writeFileSync(join(corpus.repo, "a.txt"), "public a\n");
    writeFileSync(join(corpus.repo, "b.txt"), "FORBIDDEN-MIDLOOP\n");
    // b.txt is tracked, so its staged blob is a read endpoint too: the
    // worktree policy must be revalidated before that blob is read (review
    // sol3 minor), not only before the worktree bytes.
    const bOid = box.git(corpus.repo, ["hash-object", "-w", "--no-filters", "--stdin"], "FORBIDDEN-MIDLOOP\n").toString().trim();
    box.git(corpus.repo, ["update-index", "--add", "--cacheinfo", `100644,${bOid},b.txt`]);
    const reads: string[] = [];
    let fired = false;
    const capture = captureWorktree(exec, corpus.repo, {
      authorizedRoots: [realpathSync(corpus.root)],
      readFileBytes: (rootReal, rel) => {
        reads.push(rel.toString("latin1"));
        // Mutate the policy from inside the a.txt read, after a.txt passed
        // its own revalidation: only a per-read revalidation of b.txt can
        // interrupt the attempt before its content is read.
        if (!fired && rel.equals(Buffer.from("a.txt"))) {
          fired = true;
          writeFileSync(join(corpus.repo, ".gitattributes"), "b.txt filter=tripwire\n", { flag: "a" });
        }
        const bytes = readFileSync(Buffer.concat([Buffer.from(rootReal), Buffer.from("/"), rel]));
        return { bytes, fingerprint: sha256Hex(bytes) };
      },
    });
    expect(capture.stable).toBe(true);
    if (capture.stable) {
      expect(capture.attempts).toBe(2);
      const entry = findFile(capture, "b.txt");
      expect(entry?.status).toBe("excluded");
      expect(entry?.exclusionReason).toBe("filtered");
    }
    expect(reads).not.toContain("b.txt");
    // The staged blob of the newly forbidden path is never read either.
    expect(log.some((argv) => argv.includes("cat-file") && argv.includes(bOid))).toBe(false);
    expect(JSON.stringify(capture)).not.toMatch(/FORBIDDEN-MIDLOOP/);
    expect(existsSync(corpus.tripwireMarker)).toBe(false);
  });

  it("repository-external attribute and config sources are never consulted by collector invocations", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    // Review sol3 major: core.attributesFile wired into the repository's
    // own configuration points at a file outside the authorized root, and
    // ambient environment injection replays the same value. Neither may
    // reach check-attr: only repository attributes are evaluated.
    const outsideAttrs = join(box.root, "outside-attrs");
    writeFileSync(outsideAttrs, "binary.dat filter=tripwire\n");
    box.git(corpus.repo, ["config", "core.attributesFile", outsideAttrs]);
    const injected = {
      GIT_ATTR_SOURCE: "HEAD",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.attributesFile",
      GIT_CONFIG_VALUE_0: outsideAttrs,
    };
    for (const [key, value] of Object.entries(injected)) process.env[key] = value;
    // Production spawn path: the executor builds the environment and argv
    // itself, with no test seam prefix that could mask an external source.
    const exec = createSafeGitExecutor({
      gitPath: box.trace.executable,
      disabledHooksDir: join(box.root, "disabled-hooks"),
    });
    let capture: ReturnType<typeof captureWorktree> | undefined;
    try {
      capture = captureWorktree(exec, corpus.repo, { authorizedRoots: [realpathSync(corpus.root)] });
    } finally {
      for (const key of Object.keys(injected)) delete process.env[key];
    }
    expect(capture?.stable).toBe(true);
    if (capture?.stable) {
      // binary.dat carries no filter rule in any repository source, so it
      // stays present only if the outside file's rule was never applied.
      expect(findFile(capture, "binary.dat")?.status).toBe("present");
      // The repository's own rule is unaffected by the neutralization.
      expect(findFile(capture, "filtered.dat")?.exclusionReason).toBe("filtered");
    }
    expect(existsSync(corpus.tripwireMarker)).toBe(false);
  });

  it("local config include directives are refused before Git loads them", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const roots = [realpathSync(corpus.root)];
    // Review sol4 major: include.path wired into the repository's own
    // .git/config points at a non-config file outside the authorized root,
    // first by absolute path, then relative to the .git directory. Both are
    // refused before any invocation loads the configuration: without the
    // gate, Git itself dies on the injected file's content ("bad config
    // line 1"), proving the out-of-root read reached the config loader.
    const outsideConfig = join(box.root, "outside-config");
    writeFileSync(outsideConfig, "THIS IS NOT A CONFIG FILE\n");
    // One repository per variant: writing the second include would already
    // make Git parse the first one during the setup invocation itself.
    const variants: Array<[string, string]> = [["include-abs", outsideConfig], ["include-rel", "../../../outside-config"]];
    for (const [name, value] of variants) {
      const repo = box.init(join(corpus.root, name));
      box.git(repo, ["commit", "--allow-empty", "-q", "-m", "base"]);
      box.git(repo, ["config", "--local", "include.path", value]);
      expect(() => captureWorktree(exec, repo, { authorizedRoots: roots }))
        .toThrow(/include\/includeIf/);
    }
    // Raw-written forms Git normalizes while parsing: includeIf with a
    // condition, and an uppercase section — both still match ^include.
    {
      const repo = box.init(join(corpus.root, "include-raw"));
      box.git(repo, ["commit", "--allow-empty", "-q", "-m", "base"]);
      writeFileSync(join(repo, ".git", "config"),
        `\n[includeIf "gitdir:/"]\n\tpath = ${outsideConfig}\n[INCLUDE]\n\tpath = ${outsideConfig}\n`, { flag: "a" });
      expect(() => captureWorktree(exec, repo, { authorizedRoots: roots }))
        .toThrow(/include\/includeIf/);
    }
    // The gate probes the repository's own configuration file by path,
    // OUTSIDE any repository (the disabled hooks directory), with include
    // following off: `config --file <config> --no-includes --get-regexp
    // ^include`. In-repository probes are useless — repository discovery
    // parses the local configuration, includes included, before any
    // --no-includes policy applies (verified on Git 2.53) — and the gate
    // runs before any other collector invocation.
    const first = log[0] as string[];
    expect(first.slice(-6, -4)).toEqual(["config", "--file"]);
    expect(first.slice(-3)).toEqual(["--no-includes", "--get-regexp", "^include"]);
    expect(first.at(-4)).toMatch(/\/config(\.worktree)?$/);
    // A repository without includes captures normally through the same gate.
    const capture = captureWorktree(exec, corpus.repo, { authorizedRoots: roots });
    expect(capture.stable).toBe(true);
    expect(existsSync(marker)).toBe(false);
  });

  it("an include wired into the config during the capture refuses the attempt", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const roots = [realpathSync(corpus.root)];
    // Review sol4 major, racing form: the include appears in the
    // repository configuration between the inventory and the content
    // reads. The snapshot-round gate refuses the attempt before Git ever
    // loads the directive, instead of reading through it.
    const outsideConfig = join(box.root, "outside-config");
    writeFileSync(outsideConfig, "THIS IS NOT A CONFIG FILE\n");
    let armed = false;
    expect(() => captureWorktree(exec, corpus.repo, {
      authorizedRoots: roots,
      hooks: {
        betweenInventoryAndContent: () => {
          if (armed) return;
          armed = true;
          writeFileSync(join(corpus.repo, ".git", "config"),
            `\n[include]\n\tpath = ${outsideConfig}\n`, { flag: "a" });
        },
      },
    })).toThrow(/include\/includeIf/);
    expect(armed).toBe(true);
    expect(existsSync(marker)).toBe(false);
  });

  it("an include added after a round's config gate rejects that snapshot and the capture re-runs", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const roots = [realpathSync(corpus.root)];
    // Review sol5 major: an include wired into the repository configuration
    // AFTER a round's start probe is still followed by that round's own Git
    // invocations — a later probe cannot undo that read. The end-of-round
    // re-probe (directives plus the fingerprint of the gated files) must
    // reject the contaminated round and re-run the observation, publishing
    // no data from it. The included file is a valid configuration, so the
    // round's invocations succeed while following the directive: only the
    // re-probe can catch it.
    const outsideConfig = join(box.root, "outside-config");
    writeFileSync(outsideConfig, "[core]\n\tfsmonitor = true\n");
    const configPath = join(corpus.repo, ".git", "config");
    const original = readFileSync(configPath);
    let injected = false;
    let restored = false;
    const capture = captureWorktree(exec, corpus.repo, {
      authorizedRoots: roots,
      hooks: {
        afterConfigGate: () => {
          if (injected) return;
          injected = true;
          writeFileSync(configPath,
            Buffer.concat([original, Buffer.from(`\n[include]\n\tpath = ${outsideConfig}\n`)]));
        },
        betweenInventoryAndContent: () => {
          // The racing writer withdraws the directive before the next
          // round's gate, so the capture must succeed — on a fresh round,
          // never on the contaminated one.
          if (!injected || restored) return;
          restored = true;
          writeFileSync(configPath, original);
        },
      },
    });
    expect(capture.stable).toBe(true);
    // The contaminated first round is rejected: the published capture is
    // the re-run one (one extra bounded attempt).
    if (capture.stable) expect(capture.attempts).toBe(2);
    expect(injected).toBe(true);
    expect(existsSync(marker)).toBe(false);
  });

  it("a root without its own .git entry is refused before any Git discovery invocation", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    // Review sol5 major 2: a directory inside a repository is not a
    // repository root; discovery would search the parents and load their
    // configuration — include directives included — before the refusal.
    // The refusal must precede every Git invocation, gated or not.
    const nested = join(corpus.repo, "nested-not-a-root");
    mkdirSync(nested, { recursive: true });
    expect(() => captureWorktree(exec, nested, { authorizedRoots: [realpathSync(corpus.root)] }))
      .toThrow(ForbiddenPathError);
    expect(log).toHaveLength(0);
    expect(existsSync(marker)).toBe(false);
  });

  it("collector -c hardening keeps precedence over configuration pulled in by an include", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    // Driver decision sol5: during the window where an include can be
    // followed (added after a round's probe, withdrawn before the
    // end-of-round re-probe rejects the round), the collector's own -c
    // overrides stay decisive: command-line -c values outrank every
    // file-borne setting, included or not, so an included configuration
    // cannot re-point core.attributesFile or core.excludesFile outside the
    // repository or re-enable fsmonitor; textconv and filters stay refused
    // by exact argument form.
    const outsideAttrs = join(box.root, "outside-attrs");
    writeFileSync(outsideAttrs, "binary.dat filter=tripwire\n");
    const outsideIgnore = join(box.root, "outside-ignore");
    writeFileSync(outsideIgnore, "outside-ignored.txt\n");
    writeFileSync(join(corpus.repo, "outside-ignored.txt"), "OUTSIDE-IGNORED\n");
    const included = join(box.root, "included-config");
    writeFileSync(included,
      `[core]\n\tattributesFile = ${outsideAttrs}\n\texcludesFile = ${outsideIgnore}\n\tfsmonitor = true\n`);
    box.git(corpus.repo, ["config", "--local", "include.path", included]);
    // Direct collector invocations in exactly the configuration state the
    // end-of-round re-probe exists to reject: Git follows the include while
    // parsing, yet the -c hardening decides what is evaluated.
    const attrs = exec.run(corpus.repo, ["check-attr", "filter", "--", "binary.dat"]).toString();
    expect(attrs).not.toContain("tripwire");
    const others = exec.run(corpus.repo, ["ls-files", "--others", "--exclude-standard", "-z"]);
    expect(others.includes(Buffer.from("outside-ignored.txt"))).toBe(true);
    expect(existsSync(marker)).toBe(false);
  });

  it("HEAD-only paths removed from the index and ignored still pass attribute checks", () => {
    const box = sandbox();
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const plain = box.init(join(box.root, "headonly"));
    box.git(plain, ["commit", "--allow-empty", "-q", "-m", "base"]);
    writeFileSync(join(plain, ".gitattributes"), "hidden-filtered.dat filter=tripwire\n");
    writeFileSync(join(plain, ".gitignore"), "hidden-filtered.dat\n");
    writeFileSync(join(plain, "hidden-filtered.dat"), "HIDDEN-HEAD-ONLY-LEAK\n");
    box.git(plain, ["add", "-f", "--", ".gitattributes", ".gitignore", "hidden-filtered.dat"]);
    box.git(plain, ["commit", "-q", "-m", "add hidden"]);
    // Removed from the index, still on disk, still in HEAD, ignored.
    box.git(plain, ["update-index", "--force-remove", "--", "hidden-filtered.dat"]);
    const capture = captureWorktree(exec, plain, { authorizedRoots: [realpathSync(box.root)] });
    expect(capture.stable).toBe(true);
    if (capture.stable) {
      const entry = findFile(capture, "hidden-filtered.dat");
      expect(entry?.status).toBe("excluded");
      expect(entry?.exclusionReason).toBe("filtered");
    }
    expect(JSON.stringify(capture)).not.toMatch(/HIDDEN-HEAD-ONLY-LEAK/);
    expect(existsSync(marker)).toBe(false);
  });

  it("staged attribute rules gate staged blob reads independently of the worktree copy", () => {
    const box = sandbox();
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const plain = box.init(join(box.root, "indexattr"));
    box.git(plain, ["commit", "--allow-empty", "-q", "-m", "base"]);
    // Staged .gitattributes carries filter=tripwire; the worktree copy does
    // not. Only the index-context attribute check can gate the staged blob.
    const attrOid = box.git(plain, ["hash-object", "-w", "--no-filters", "--stdin"], "x.dat filter=tripwire\n").toString().trim();
    box.git(plain, ["update-index", "--add", "--cacheinfo", `100644,${attrOid},.gitattributes`]);
    writeFileSync(join(plain, ".gitattributes"), "# worktree copy without the rule\n");
    const xOid = box.git(plain, ["hash-object", "-w", "--no-filters", "--stdin"], "STAGED-TRIPWIRE-LEAK\n").toString().trim();
    box.git(plain, ["update-index", "--add", "--cacheinfo", `100644,${xOid},x.dat`]);
    writeFileSync(join(plain, "x.dat"), "STAGED-TRIPWIRE-LEAK\n");
    const capture = captureWorktree(exec, plain, { authorizedRoots: [realpathSync(box.root)] });
    expect(capture.stable).toBe(true);
    if (capture.stable) {
      const entry = findFile(capture, "x.dat");
      expect(entry?.status).toBe("excluded");
      expect(entry?.exclusionReason).toBe("filtered");
    }
    expect(JSON.stringify(capture)).not.toMatch(/STAGED-TRIPWIRE-LEAK/);
    expect(existsSync(marker)).toBe(false);
  });

  it("the executor refuses conversion-bearing and writing argument forms", () => {
    const box = sandbox();
    const exec = createSafeGitExecutor({
      gitPath: box.trace.executable,
      spawn: () => ({ status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }),
    });
    const oid = "e".repeat(40);
    // cat-file is limited to raw reads.
    expect(() => exec.probe(box.root, ["cat-file", "--filters", oid])).toThrow();
    expect(() => exec.probe(box.root, ["cat-file", "--textconv", oid])).toThrow();
    expect(() => exec.probe(box.root, ["cat-file", "--path=evil.txt", "-p", oid])).toThrow();
    expect(() => exec.probe(box.root, ["cat-file", "--batch-command"])).toThrow();
    // hash-object requires --no-filters and never writes or reads by path.
    expect(() => exec.probe(box.root, ["hash-object", "--path=evil.txt", "--stdin"])).toThrow();
    expect(() => exec.probe(box.root, ["hash-object", "-wt", "blob", "--stdin"])).toThrow();
    expect(() => exec.probe(box.root, ["hash-object", "-w", "--no-filters", "--stdin"])).toThrow();
    expect(() => exec.probe(box.root, ["hash-object", "--stdin-paths"])).toThrow();
    // symbolic-ref is limited to its read form (symbolic-ref HEAD <target> writes).
    expect(() => exec.probe(box.root, ["symbolic-ref", "HEAD", "refs/heads/evil"])).toThrow();
    // Diff-family conversions and output redirects are refused outright.
    expect(() => exec.probe(box.root, ["diff", "--ext-diff", "--textconv", "a", "b"])).toThrow();
    expect(() => exec.probe(box.root, ["diff", "--output=/etc/passwd", "a", "b"])).toThrow();
    expect(() => exec.probe(box.root, ["ls-files", "--output=/tmp/evil", "-z"])).toThrow();
    // The exact raw read forms the collector needs still run.
    expect(exec.probe(box.root, ["cat-file", "-p", oid]).status).toBe(0);
    expect(exec.probe(box.root, ["cat-file", "blob", oid]).status).toBe(0);
    expect(exec.probe(box.root, ["cat-file", "-s", oid]).status).toBe(0);
    expect(exec.probe(box.root, ["cat-file", "-t", oid]).status).toBe(0);
    expect(exec.probe(box.root, ["hash-object", "--no-filters", "--stdin"]).status).toBe(0);
    expect(exec.probe(box.root, ["symbolic-ref", "HEAD"]).status).toBe(0);
    expect(exec.probe(box.root, ["ls-files", "--stage", "-z"]).status).toBe(0);
    expect(exec.probe(box.root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).status).toBe(0);
  });

  it("non-UTF-8 and control-character paths survive byte-exactly", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const capture = captureWorktree(exec, corpus.repo, { authorizedRoots: [realpathSync(corpus.root)] });
    expect(capture.stable).toBe(true);
    if (capture.stable) {
      const rawPath = Buffer.from(recipe.rawPathHex, "hex");
      const entry = findFile(capture, rawPath);
      expect(entry?.status).toBe("present");
      expect(entry?.kind).toBe("file");
      expect(entry?.fingerprint).toBe(sha256Hex("non UTF-8 path\n"));
      expect(capture.entries.some((indexEntry) => indexEntry.path.equals(rawPath))).toBe(true);
      const tabbed = findFile(capture, Buffer.from("tab\tline\n.txt"));
      expect(tabbed?.status).toBe("present");
      expect(tabbed?.kind).toBe("file");
    }
    expect(existsSync(marker)).toBe(false);
  });

  it("the common dir resolves absolutely for main linked and separate repositories", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const roots = [realpathSync(corpus.root)];
    const main = captureWorktree(exec, corpus.repo, { authorizedRoots: roots });
    const linked = captureWorktree(exec, corpus.linked, { authorizedRoots: roots });
    const shallow = captureWorktree(exec, corpus.shallow, { authorizedRoots: roots });
    expect(main.stable).toBe(true);
    expect(linked.stable).toBe(true);
    expect(shallow.stable).toBe(true);
    if (main.stable && linked.stable && shallow.stable) {
      expect(main.commonDir).toBe(realpathSync(join(corpus.repo, ".git")));
      expect(linked.commonDir).toBe(main.commonDir);
      expect(linked.commonDir).not.toBe(linked.gitDir);
      expect(shallow.commonDir).toBe(realpathSync(join(corpus.shallow, ".git")));
      expect(existsSync(main.commonDir)).toBe(true);
      // The old form echoed its own flag back with a success status.
      expect(main.commonDir).not.toBe("--absolute-git-common-dir");
    }
    expect(existsSync(marker)).toBe(false);
  });

  it("a same-size same-mtime replacement is detected and retried", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const churn = join(corpus.repo, "churn.txt");
    const replacement = join(box.root, "churn-replacement.txt");
    writeFileSync(churn, "OLD-CHURN-CONTENT\n");
    writeFileSync(replacement, "NEW-CHURN-CONTENT\n");
    const fixedTime = new Date(1700000000000);
    utimesSync(churn, fixedTime, fixedTime);
    utimesSync(replacement, fixedTime, fixedTime);
    let fired = false;
    const capture = captureWorktree(exec, corpus.repo, {
      authorizedRoots: [realpathSync(corpus.root)],
      hooks: {
        betweenInventoryAndContent: () => {
          if (fired) return;
          fired = true;
          // Same size, same mtime (rename preserves it): only inode/ctime
          // identity can tell the states apart.
          const { renameSync } = require("node:fs") as typeof import("node:fs");
          renameSync(replacement, churn);
        },
      },
    });
    expect(capture.stable).toBe(true);
    if (capture.stable) {
      expect(capture.attempts).toBe(2);
      const entry = findFile(capture, "churn.txt");
      expect(entry?.status).toBe("present");
      expect(entry?.fingerprint).toBe(sha256Hex("NEW-CHURN-CONTENT\n"));
    }
    expect(existsSync(marker)).toBe(false);
  });

  it("captures overlap real index writers and an occupied index lock without blocking or mutation", async () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const roots = [realpathSync(corpus.root)];
    const git = box.trace.executable;
    const writerEnv = {
      PATH: [dirname(git), "/usr/bin", "/bin"].join(delimiter),
      HOME: box.root,
      LANG: "C",
      LC_ALL: "C",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
    };
    const stageLines = () =>
      box.read(corpus.repo, ["ls-files", "--stage", "-z"]).toString("latin1").split("\0").filter(Boolean).sort();
    const indexBefore = stageLines();
    // A truly concurrent writer process churns the real index (each
    // update-index takes index.lock) while captures are in flight. The
    // writer neutralises the repo's tripwire exactly like the trace prefix:
    // update-index runs post-index-change and queries core.fsmonitor, so
    // both must be overridden for writing to stay legitimate and hook-free.
    const writerScript = `for i in 1 2 3 4 5 6 7 8; do printf '100644 ${corpus.blobs.base} 0\\twriter.txt\\n' | ${JSON.stringify(git)} -c core.hooksPath=${JSON.stringify(join(box.root, "disabled-hooks"))} -c core.fsmonitor=false update-index --index-info || exit 9; done`;
    const writer = spawn("/bin/sh", ["-c", writerScript], { cwd: corpus.repo, env: writerEnv, stdio: "ignore" });
    const overlapped: ReturnType<typeof captureWorktree>[] = [];
    while (writer.exitCode === null && overlapped.length < 2) {
      overlapped.push(captureWorktree(exec, corpus.repo, { authorizedRoots: roots }));
      await sleep(20);
    }
    const writerCode = await new Promise<number | null>((resolve) => {
      if (writer.exitCode !== null) resolve(writer.exitCode);
      else writer.once("exit", resolve);
    });
    expect(writerCode).toBe(0);
    for (const capture of overlapped) {
      // The writer churns the index, so instability is allowed; blocking,
      // throwing or mutating is not.
      expect(capture.attempts).toBeLessThanOrEqual(3);
    }
    // After the writers settle, the capture is stable and the index shows
    // exactly the writer's change and nothing from the collector.
    const settled = captureWorktree(exec, corpus.repo, { authorizedRoots: roots });
    expect(settled.stable).toBe(true);
    expect(stageLines()).toEqual([...indexBefore, `100644 ${corpus.blobs.base} 0\twriter.txt`].sort());
    expect(log.some((argv) => argv.includes("update-index") || argv.includes("write-tree"))).toBe(false);
    // A capture during a held index.lock completes without touching the lock;
    // the holder releases it only when signalled, after the capture returned.
    const gitDir = box.read(corpus.repo, ["rev-parse", "--absolute-git-dir"]).toString("utf8").trim();
    const lockPath = join(gitDir, "index.lock");
    const goPath = join(box.root, "holder-go");
    const holder = spawn(
      "/bin/sh",
      ["-c", `printf held > ${JSON.stringify(lockPath)} && while [ ! -f ${JSON.stringify(goPath)} ]; do sleep 0.1; done && rm -f ${JSON.stringify(lockPath)}`],
      { cwd: corpus.repo, env: writerEnv, stdio: "ignore" },
    );
    await sleep(200);
    expect(existsSync(lockPath)).toBe(true);
    const during = captureWorktree(exec, corpus.repo, { authorizedRoots: roots });
    expect(during.stable).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
    writeFileSync(goPath, "");
    const holderCode = await new Promise<number | null>((resolve) => {
      if (holder.exitCode !== null) resolve(holder.exitCode);
      else holder.once("exit", resolve);
    });
    expect(holderCode).toBe(0);
    expect(existsSync(lockPath)).toBe(false);
    expect(findIndexLocks(corpus.root)).toEqual([]);
    expect(existsSync(corpus.tripwireMarker)).toBe(false);
    expect(existsSync(marker)).toBe(false);
    box.trace.assertSafe();
  });

  it("oversized staged blobs are excluded before any content read", () => {
    const box = sandbox();
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    const plain = box.init(join(box.root, "hugeblob"));
    const maxFileBytes = 1024 * 1024;
    // Larger than the 16 MiB subprocess buffer: reading it would fail the
    // capture instead of producing an exclusion.
    const huge = "H".repeat(17 * 1024 * 1024) + "\n";
    const hugeOid = box.git(plain, ["hash-object", "-w", "--no-filters", "--stdin"], huge).toString().trim();
    const smallOid = box.git(plain, ["hash-object", "-w", "--no-filters", "--stdin"], "small\n").toString().trim();
    // Conflict stages carrying a huge stage blob, with a small worktree file.
    box.git(plain, ["update-index", "--index-info"],
      `100644 ${hugeOid} 1\thuge-conflict.txt\n100644 ${smallOid} 2\thuge-conflict.txt\n100644 ${smallOid} 3\thuge-conflict.txt\n`);
    writeFileSync(join(plain, "huge-conflict.txt"), "tiny\n");
    // Stage-0 huge blob with a small worktree file.
    box.git(plain, ["update-index", "--index-info"], `100644 ${hugeOid} 0\thuge-stage.txt\n`);
    writeFileSync(join(plain, "huge-stage.txt"), "tiny\n");
    const capture = captureWorktree(exec, plain, { authorizedRoots: [realpathSync(box.root)], maxFileBytes });
    expect(capture.stable).toBe(true);
    if (capture.stable) {
      const conflict = findFile(capture, "huge-conflict.txt");
      expect(conflict?.status).toBe("excluded");
      expect(conflict?.exclusionReason).toBe("oversized");
      expect(conflict?.size).toBe(huge.length);
      const staged = findFile(capture, "huge-stage.txt");
      expect(staged?.status).toBe("excluded");
      expect(staged?.exclusionReason).toBe("oversized");
      expect(staged?.size).toBe(huge.length);
    }
    // Type and size were probed, but the huge content was never read.
    expect(log.some((argv) => argv.includes("-t") && argv.includes(hugeOid))).toBe(true);
    expect(log.some((argv) => argv.includes("-s") && argv.includes(hugeOid))).toBe(true);
    expect(log.some((argv) => argv.includes("-p") && argv.includes(hugeOid))).toBe(false);
    expect(existsSync(marker)).toBe(false);
  });

  it("a parent redirected during the open is rejected through the opened descriptor and the observation re-run", () => {
    const box = sandbox();
    // Review sol2 constat 1: the parent is a symlink to an outside
    // directory exactly while the final path is opened, and a real
    // directory again for every other access. Only the opened descriptor
    // itself can expose the substitution; path-based re-checks resolve the
    // path separately on every call and can each observe a restored state.
    const root = join(box.root, "m1-race");
    mkdirSync(join(root, "loophole"), { recursive: true });
    writeFileSync(join(root, "loophole", "secret.txt"), "IN-ROOT-BYTES\n");
    const outside = join(box.root, "m1-outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "secret.txt"), "OUTSIDE-DESCRIPTOR-LEAK\n");
    const parent = join(root, "loophole");
    const finalAbs = Buffer.from(join(root, "loophole", "secret.txt"));
    const seam: SafeReadSeam = {
      beforePathAccess: (op, path) => {
        const redirectToOutside = op === "open" && path.equals(finalAbs);
        rmSync(parent, { recursive: true, force: true });
        if (redirectToOutside) {
          symlinkSync(outside, parent);
        } else {
          mkdirSync(parent);
          writeFileSync(join(parent, "secret.txt"), "IN-ROOT-BYTES\n");
        }
      },
    };
    let outcome = "returned";
    let bytes: Buffer = Buffer.alloc(0);
    try {
      const read = defaultReadFileBytes(root, "loophole/secret.txt", undefined, undefined, seam);
      bytes = read.bytes;
      outcome = bytes.includes(Buffer.from("OUTSIDE-DESCRIPTOR-LEAK")) ? "leak" : "returned";
    } catch {
      outcome = "rejected";
    }
    expect(outcome).toBe("rejected");
    expect(bytes.toString("latin1")).not.toMatch(/OUTSIDE-DESCRIPTOR-LEAK/);
    expect(existsSync(join(outside, "secret.txt"))).toBe(true);
  });

  it("a policy file replaced between stat and read is never read through", () => {
    const box = sandbox();
    const corpus = buildCorpus(box, "sha1", "files");
    const { dir: trapDir, marker } = installPythonTrap(box);
    const log: string[][] = [];
    const exec = collector(box, log, trapDir, marker);
    // Review sol2 constat 2: after the stat, the working-tree
    // .gitattributes is replaced by a symlink to an outside secret; the
    // policy read must go through the safe descriptor reader, which
    // refuses the substitution, instead of readFileSync following it.
    const candidate = join(corpus.repo, ".gitattributes");
    const secret = join(box.root, "policy-outside-secret");
    writeFileSync(secret, "POLICY-SYMLINK-LEAK\n");
    policyAttack.candidate = Buffer.from(candidate);
    policyAttack.leak = false;
    policyAttack.swap = () => {
      rmSync(candidate, { force: true });
      symlinkSync(secret, candidate);
    };
    policyAttack.armed = true;
    let capture: ReturnType<typeof captureWorktree>;
    try {
      capture = captureWorktree(exec, corpus.repo, { authorizedRoots: [realpathSync(corpus.root)] });
    } finally {
      policyAttack.armed = false;
      policyAttack.candidate = null;
      policyAttack.swap = null;
    }
    expect(policyAttack.leak).toBe(false);
    expect(capture.stable).toBe(true);
    expect(JSON.stringify(capture)).not.toMatch(/POLICY-SYMLINK-LEAK/);
    expect(existsSync(secret)).toBe(true);
    expect(existsSync(corpus.tripwireMarker)).toBe(false);
  });

  it("hash-object accepts only its exact raw form and a filter reactivator is refused", () => {
    const box = sandbox();
    const exec = createSafeGitExecutor({
      gitPath: box.trace.executable,
      spawn: () => ({ status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }),
    });
    // Review sol2 constat 3: on the same command line --filters re-enables
    // the repository clean filter (verified on Git 2.53), so the presence
    // of --no-filters alone proves nothing; only the exact raw stdin form
    // is accepted and every other arrangement is refused before spawning.
    expect(exec.probe(box.root, ["hash-object", "--no-filters", "--stdin"]).status).toBe(0);
    expect(() => exec.probe(box.root, ["hash-object", "--no-filters", "--filters", "--stdin"])).toThrow();
    expect(() => exec.probe(box.root, ["hash-object", "--filters", "--no-filters", "--stdin"])).toThrow();
    expect(() => exec.probe(box.root, ["hash-object", "--no-filters", "--filters", "filtered.dat"])).toThrow();
    expect(() => exec.probe(box.root, ["hash-object", "--no-filters", "-t", "blob", "--stdin"])).toThrow();
    expect(() => exec.probe(box.root, ["hash-object", "--no-filters", "--path=filtered.dat", "--stdin"])).toThrow();
  });
});
