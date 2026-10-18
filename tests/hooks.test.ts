import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { install, uninstall, status } from "../src/hooks.js";
import { main } from "../src/cli.js";

describe("hooks", () => {
  let tmpDir: string;
  let envDir: string;
  let prevEnv: Record<string, string | undefined>;
  // Captured at collection time, before beforeEach redirects HOME into temp.
  // (node:os homedir() follows $HOME, so it cannot serve as the reference.)
  const realHome = process.env.HOME ?? "";

  beforeEach(() => {
    // Isolate every git invocation from the real user/global/system config.
    // Without this, `git rev-parse --git-path hooks` follows a real global
    // core.hooksPath (e.g. ~/.config/git/hooks): hook writes land
    // outside the temp repo and global hooks fire during `git init`.
    envDir = mkdtempSync(join(tmpdir(), "graphify-test-gitenv-"));
    const fakeHome = join(envDir, "home");
    mkdirSync(fakeHome, { recursive: true });
    const fakeGlobal = join(envDir, "gitconfig-global");
    writeFileSync(fakeGlobal, "", "utf-8");
    const fakeSystem = join(envDir, "gitconfig-system");
    writeFileSync(fakeSystem, "", "utf-8");
    prevEnv = {
      HOME: process.env.HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
      GIT_CONFIG_SYSTEM: process.env.GIT_CONFIG_SYSTEM,
    };
    process.env.HOME = fakeHome;
    process.env.XDG_CONFIG_HOME = join(fakeHome, ".config");
    process.env.GIT_CONFIG_GLOBAL = fakeGlobal;
    process.env.GIT_CONFIG_SYSTEM = fakeSystem;

    tmpDir = mkdtempSync(join(tmpdir(), "graphify-test-hooks-"));
    git(tmpDir, ["init", "-q"]);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(envDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function git(cwd: string, args: string[]): string {
    try {
      return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf-8" }).trim();
    } catch (err) {
      const maybe = err as { status?: number; stdout?: string | Buffer };
      if (maybe.status === 0 && maybe.stdout !== undefined) return String(maybe.stdout).trim();
      throw err;
    }
  }

  function hookPath(cwd: string, name: string): string {
    const hooksDir = git(cwd, ["rev-parse", "--git-path", "hooks"]);
    return join(isAbsolute(hooksDir) ? hooksDir : resolve(cwd, hooksDir), name);
  }

  it("GUARD: hook installation never writes outside the isolated git config", () => {
    // Isolation contract: every hook test runs with HOME, XDG_CONFIG_HOME,
    // GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM redirected into a temp dir, so
    // `git rev-parse --git-path hooks` can never resolve to the real global
    // hooks directory (e.g. ~/.config/git/hooks).
    expect(process.env.HOME).not.toBe(realHome);
    expect(process.env.HOME?.startsWith(tmpdir())).toBe(true);
    const globalConfig = process.env.GIT_CONFIG_GLOBAL ?? "";
    expect(globalConfig.length).toBeGreaterThan(0);
    expect(globalConfig.startsWith(tmpdir())).toBe(true);

    install(tmpDir);
    expect(readFileSync(globalConfig, "utf-8")).not.toContain("hooksPath");
    const globalHooksDir = join(process.env.HOME ?? "", ".config", "git", "hooks");
    expect(existsSync(join(globalHooksDir, "reference-transaction"))).toBe(false);
  });

  it("targets the user-editable .husky dir on Husky 9 repos (core.hooksPath=.husky/_)", () => {
    git(tmpDir, ["config", "core.hooksPath", ".husky/_"]);

    install(tmpDir);

    // Husky 9 auto-generates wrappers under .husky/_; user hooks live in .husky/.
    expect(existsSync(join(tmpDir, ".husky", "post-commit"))).toBe(true);
    expect(existsSync(join(tmpDir, ".husky", "_", "post-commit"))).toBe(false);
  });

  it("installs all lifecycle hooks", () => {
    const result = install(tmpDir);

    expect(result).toContain("post-commit: installed");
    expect(result).toContain("post-checkout: installed");
    expect(result).toContain("post-merge: installed");
    expect(result).toContain("post-rewrite: installed");
    expect(result).toContain(".gitattributes:");
    expect(result).toContain("merge.graphify-json.driver:");
    for (const name of ["post-commit", "post-checkout", "post-merge", "post-rewrite"]) {
      const content = readFileSync(hookPath(tmpDir, name), "utf-8");
      expect(content.startsWith("#!/bin/sh\n")).toBe(true);
      expect(content).toContain("graphify_mark_stale");
      expect(content).toContain("rebase-merge");
      expect(content).toContain("rebase-apply");
      expect(content).toContain("MERGE_HEAD");
      expect(content).toContain("CHERRY_PICK_HEAD");
    }
    const postCommit = readFileSync(hookPath(tmpDir, "post-commit"), "utf-8");
    expect(postCommit).toContain("LOCALAPPDATA");
    expect(postCommit).toContain("XDG_CACHE_HOME");
    expect(postCommit).toContain("GRAPHIFY_LOG=\"$GRAPHIFY_CACHE_DIR/rebuild.log\"");
    expect(postCommit).toContain("nohup");
    expect(postCommit).toContain("command -v nohup");
    expect(postCommit).toContain("disown");
    expect(readFileSync(join(tmpDir, ".gitattributes"), "utf-8")).toContain(".graphify/graph.json merge=graphify-json");
    expect(readFileSync(join(tmpDir, ".gitattributes"), "utf-8")).toContain("graphify-out/graph.json merge=graphify-json");
    expect(git(tmpDir, ["config", "--local", "--get", "merge.graphify-json.driver"])).toContain("graphify merge-driver %O %A %B");
  });

  it("detects already installed hooks", () => {
    install(tmpDir);
    const result = install(tmpDir);
    expect(result).toContain("post-commit: already installed");
    expect(result).toContain("post-rewrite: already installed");
  });

  it("updates stale graphify hook blocks", () => {
    writeFileSync(
      hookPath(tmpDir, "post-commit"),
      "#!/bin/sh\n# graphify-hook-start\necho stale\n# graphify-hook-end\n",
      "utf-8",
    );

    const result = install(tmpDir);
    const content = readFileSync(hookPath(tmpDir, "post-commit"), "utf-8");

    expect(result).toContain("post-commit: updated");
    expect(content).not.toContain("echo stale");
    expect(content).toContain("graphify_mark_stale");
  });

  it("uninstalls hooks", () => {
    install(tmpDir);
    const result = uninstall(tmpDir);
    expect(result).toContain("post-commit: removed");
    expect(result).toContain("post-rewrite: removed");
    expect(result).toContain(".gitattributes:");
    expect(result).toContain("merge.graphify-json.driver:");
  });

  it("reports status correctly", () => {
    const before = status(tmpDir);
    expect(before).toContain("post-commit: not installed");
    expect(before).toContain("post-rewrite: not installed");
    expect(before).toContain(".gitattributes: not installed");
    expect(before).toContain("merge.graphify-json.driver: not installed");

    install(tmpDir);
    const after = status(tmpDir);
    expect(after).toContain("post-commit: installed");
    expect(after).toContain("post-rewrite: installed");
    expect(after).toContain(".gitattributes: installed");
    expect(after).toContain("merge.graphify-json.driver: installed");
  });

  it("appends to existing hook without overwriting", () => {
    const path = hookPath(tmpDir, "post-commit");
    writeFileSync(path, "#!/bin/bash\necho 'existing hook'\n", "utf-8");

    install(tmpDir);
    const content = readFileSync(path, "utf-8");

    expect(content).toContain("existing hook");
    expect(content).toContain("graphify-hook-start");
  });

  it("preserves other hook content on uninstall", () => {
    const path = hookPath(tmpDir, "post-commit");
    writeFileSync(path, "#!/bin/bash\necho 'keep me'\n", "utf-8");

    install(tmpDir);
    uninstall(tmpDir);
    const content = readFileSync(path, "utf-8");

    expect(content).toContain("keep me");
    expect(content).not.toContain("graphify-hook-start");
  });

  it("installs into the common hooks directory from a linked worktree", () => {
    const worktreeDir = join(tmpDir, "linked-worktree");
    git(tmpDir, ["worktree", "add", "-q", worktreeDir, "-b", "graphify-test-worktree"]);

    const result = install(worktreeDir);

    expect(result).toContain("post-commit: installed");
    expect(readFileSync(join(worktreeDir, ".git"), "utf-8")).toContain("gitdir:");
    expect(existsSync(hookPath(worktreeDir, "post-commit"))).toBe(true);
    expect(hookPath(worktreeDir, "post-commit")).toBe(hookPath(tmpDir, "post-commit"));
    expect(status(worktreeDir)).toContain("post-rewrite: installed");
  });

  it("refuses to install hooks outside the repository git directories", () => {
    const outsideHooksDir = mkdtempSync(join(tmpdir(), "graphify-external-hooks-"));
    try {
      git(tmpDir, ["config", "--local", "core.hooksPath", outsideHooksDir]);

      expect(() => install(tmpDir)).toThrow("Refusing to install graphify hooks outside");
    } finally {
      rmSync(outsideHooksDir, { recursive: true, force: true });
    }
  });

  it("installs hooks with legacy core.hooksPath=. at the worktree root", () => {
    // `core.hooksPath = .` places hooks directly in the worktree root: a
    // legacy configuration that must stay installable. The containment
    // predicate has to accept the root itself, not only strict children.
    git(tmpDir, ["config", "--local", "core.hooksPath", "."]);

    const result = install(tmpDir);

    expect(result).toContain("post-commit: installed");
    for (const name of ["post-commit", "post-checkout", "post-merge", "post-rewrite"]) {
      expect(existsSync(join(tmpDir, name))).toBe(true);
    }
    expect(() => uninstall(tmpDir)).not.toThrow();
    for (const name of ["post-commit", "post-checkout", "post-merge", "post-rewrite"]) {
      expect(existsSync(join(tmpDir, name))).toBe(false);
    }
  });

  it("installs into a shared hooks directory reached through a .git/hooks symbolic link", () => {
    // HEAD compatibility: `.git/hooks` may be a symbolic link to a shared
    // hooks directory outside the repository (e.g. dotfiles-managed). The
    // legacy install keeps HEAD's purely lexical containment check, so this
    // configuration stays installable and third-party hooks stay preserved;
    // symlink-aware strictness applies to the live signal path only.
    const sharedHooks = mkdtempSync(join(tmpdir(), "graphify-shared-hooks-"));
    try {
      writeFileSync(join(sharedHooks, "post-commit"), "#!/bin/sh\necho 'keep me'\n", "utf-8");
      rmSync(join(tmpDir, ".git", "hooks"), { recursive: true, force: true });
      symlinkSync(sharedHooks, join(tmpDir, ".git", "hooks"));

      const result = install(tmpDir);

      expect(result).toContain("post-commit: appended to existing post-commit hook");
      const content = readFileSync(join(sharedHooks, "post-commit"), "utf-8");
      expect(content).toContain("keep me");
      expect(content).toContain("graphify-hook-start");
      expect(status(tmpDir)).toContain("post-commit: installed");

      expect(() => uninstall(tmpDir)).not.toThrow();
      const after = readFileSync(join(sharedHooks, "post-commit"), "utf-8");
      expect(after).toContain("keep me");
      expect(after).not.toContain("graphify-hook-start");
    } finally {
      rmSync(sharedHooks, { recursive: true, force: true });
    }
  });

  // Non-regression for upstream 0fdfded (hook interpreter injection hardening).
  //
  // The Python port of graphify embeds sys.executable at install time as a
  // "_PINNED_PYTHON_" placeholder, which required allowlist sanitisation to
  // prevent shell metacharacters in the interpreter path from being injected
  // into the generated hook scripts (upstream fix 0fdfded).
  //
  // The TypeScript implementation uses a fundamentally different architecture:
  // no interpreter path is ever embedded at install time.  The hook scripts
  // discover the command at *runtime* via `command -v graphify`, a hard-coded
  // literal string in the template.  There is therefore no
  // filesystem-sourced path injection vector.
  //
  // These tests pin that invariant so future refactors cannot accidentally
  // introduce the pinned-interpreter pattern.
  describe("hook injection safety (0fdfded non-regression)", () => {
    it("does not embed any interpreter path placeholder in generated hook scripts", () => {
      install(tmpDir);
      for (const name of ["post-commit", "post-checkout", "post-merge", "post-rewrite"]) {
        const content = readFileSync(hookPath(tmpDir, name), "utf-8");
        // No Python-style pinned-interpreter placeholder must appear.
        expect(content).not.toContain("__PINNED_PYTHON__");
        expect(content).not.toContain("__PINNED_NODE__");
        expect(content).not.toContain("__PINNED_GRAPHIFY__");
        // No absolute filesystem path derived from process.execPath is embedded.
        // The only interpreter reference is the hard-coded literal used by
        // graphify_detect_cmd(), not a path taken from the environment.
        expect(content).not.toMatch(/GRAPHIFY_CMD="\/[^"]+"/);
      }
    });

    it("hook scripts set GRAPHIFY_CMD only to the known safe literal value and never an npm/npx fallback", () => {
      install(tmpDir);
      const content = readFileSync(hookPath(tmpDir, "post-commit"), "utf-8");
      // The detect function must assign only the safe, static value.
      expect(content).toContain('GRAPHIFY_CMD="graphify"');
      // The implicit package-manager fallback must never be distributed.
      expect(content).not.toContain("npx");
      // Shell metacharacters must not appear in any GRAPHIFY_CMD assignment.
      const assignmentLines = content
        .split("\n")
        .filter((l) => l.trimStart().startsWith("GRAPHIFY_CMD="));
      for (const line of assignmentLines) {
        expect(line).not.toMatch(/[;`$(){}|<>\\]/);
      }
    });

    it("nohup exec line properly quotes the log path redirect", () => {
      install(tmpDir);
      const content = readFileSync(hookPath(tmpDir, "post-commit"), "utf-8");
      // The redirect target must be double-quoted so paths with spaces work.
      expect(content).toContain('> "$GRAPHIFY_LOG"');
      // nohup must be present for background execution.
      expect(content).toContain("nohup sh -c");
    });
  });

  // H0 — Installed, Signal-Only Hooks (LIVE §7, A05/A06/A17).
  //
  // The live path is additive: explicit legacy `install()` keeps its
  // rebuild/attribute/merge-driver behavior untouched (see the GUARD on
  // separation below), while `installLiveSignals()` installs only short
  // bounded signals through a pinned, probe-verified installed executable
  // into the effective hooks directory Git executes. Third-party hooks are
  // chained as distinct executables; the live sink comes exclusively from
  // the host environment, never from repo-owned `.env`/config, and any
  // destination inside a git worktree is refused. Dynamic imports keep these
  // cases RED-isolated.
  describe("H0 live signal-only hooks (LIVE section 7)", () => {
    const LIVE_NAMES = [
      "post-commit",
      "post-checkout",
      "post-merge",
      "post-rewrite",
      "reference-transaction",
    ];

    interface LiveHooksApi {
      installLiveSignals(path?: string, opts?: { executable?: string; pathEnv?: string }): string;
      uninstallLiveSignals(path?: string): string;
      resolveInstalledExecutablePath(opts?: { pathEnv?: string }): string | null;
      emitLiveSignalFromHook(
        name: string,
        detail?: string,
        opts?: { sinkDir?: string; cwd?: string; now?: string },
      ): { emitted: boolean; reason: string };
    }

    interface LivePathsApi {
      hasEngramState(root: string): boolean;
      detectWorktreeStateKind(root: string): "engram" | "graphify" | "graphify-out" | null;
    }

    async function liveHooks(): Promise<LiveHooksApi> {
      return (await import("../src/hooks.js")) as unknown as LiveHooksApi;
    }

    async function livePaths(): Promise<LivePathsApi> {
      return (await import("../src/paths.js")) as unknown as LivePathsApi;
    }

    function shellQuote(s: string): string {
      return `'${s.replaceAll("'", "'\\''")}'`;
    }

    // A PATH entry holding only failing npm/npx shims: any package-manager
    // fallback executed by a hook lands here and is observed.
    function makePackageManagerShims(): { dir: string; marker: string } {
      const dir = mkdtempSync(join(tmpdir(), "graphify-h0-shims-"));
      const marker = join(dir, "pm-invoked");
      for (const name of ["npm", "npx"]) {
        writeFileSync(
          join(dir, name),
          `#!/bin/sh\nprintf 'invoked\\n' >> ${shellQuote(marker)}\nexit 99\n`,
          "utf-8",
        );
        chmodSync(join(dir, name), 0o755);
      }
      return { dir, marker };
    }

    // A fake installed executable recording its argv, standing in for the
    // pinned engram binary without building the package. `probe` and `signal`
    // vary the answers to the dispatch-compatibility probe and the runtime
    // signal call.
    function makeStubExecutable(
      tag: string,
      opts: { probe?: "ok" | "silent" | "fail"; signal?: "fast" | "hang" } = {},
    ): { path: string; log: string } {
      const dir = mkdtempSync(join(tmpdir(), `graphify-h0-bin-${tag}-`));
      const log = join(dir, "calls.log");
      const probe =
        opts.probe === "silent"
          ? "exit 0"
          : opts.probe === "fail"
            ? "exit 1"
            : `printf 'engram-hook-signal:1\\n'\nexit 0`;
      const signal = opts.signal === "hang" ? "sleep 30" : "exit 0";
      const path = join(dir, "engram");
      writeFileSync(
        path,
        `#!/bin/sh\nif [ "$1" = "hook-signal" ] && [ "$2" = "--engram-probe" ]; then\n    ${probe}\nfi\nprintf '%s\\n' "$*" >> ${shellQuote(log)}\n${signal}\n`,
        "utf-8",
      );
      chmodSync(path, 0o755);
      return { path, log };
    }

    function stubCalls(log: string): string {
      return existsSync(log) ? readFileSync(log, "utf-8") : "";
    }

    function runHookScript(hookFile: string, args: string[], pathEnv: string, opts: { input?: string } = {}): number {
      const result = spawnSync("sh", [hookFile, ...args], {
        env: { ...process.env, PATH: `${pathEnv}:/usr/bin:/bin` },
        encoding: "utf-8",
        input: opts.input ?? "",
      });
      return result.status ?? -1;
    }

    async function runCliHookSignal(args: string[], cwd: string): Promise<void> {
      const previousArgv = process.argv;
      const previousCwd = process.cwd();
      process.argv = ["node", "engram", "hook-signal", ...args];
      process.chdir(cwd);
      try {
        await main();
      } finally {
        process.chdir(previousCwd);
        process.argv = previousArgv;
      }
    }

    function digestFile(path: string): string {
      return createHash("sha256").update(readFileSync(path)).digest("hex");
    }

    it("a missing installed executable never invokes npm or npx", async () => {
      const api = await liveHooks();
      const { dir: shimDir, marker } = makePackageManagerShims();

      // Pure resolution: a PATH without an installed binary resolves to null
      // instead of falling back to a package manager.
      expect(api.resolveInstalledExecutablePath({ pathEnv: shimDir })).toBeNull();

      // Explicit live setup refuses instead of resolving implicitly.
      expect(() => api.installLiveSignals(tmpDir, { pathEnv: shimDir })).toThrow(
        /no installed .* executable/i,
      );

      // Pin a stub, then remove it: the installed live hooks must be silent
      // no-ops that never reach the npm/npx shims.
      const stub = makeStubExecutable("missing");
      api.installLiveSignals(tmpDir, { executable: stub.path });
      for (const name of LIVE_NAMES) {
        const content = readFileSync(hookPath(tmpDir, name), "utf-8");
        expect(content).not.toMatch(/npx/);
        expect(content).not.toMatch(/npm/);
      }
      rmSync(stub.path, { force: true });
      expect(runHookScript(hookPath(tmpDir, "post-commit"), [], shimDir)).toBe(0);
      expect(runHookScript(hookPath(tmpDir, "reference-transaction"), ["committed"], shimDir)).toBe(0);
      expect(existsSync(marker)).toBe(false);
    });

    it("live hook setup refuses executables incompatible with the hook-signal dispatch", async () => {
      const api = await liveHooks();

      // Exits 0 for anything but never answers the probe (like /usr/bin/true):
      // a stat/X_OK check alone would pin it and produce silently dead hooks.
      const silent = makeStubExecutable("silent-true", { probe: "silent" });
      expect(() => api.installLiveSignals(tmpDir, { executable: silent.path })).toThrow(
        /does not answer `hook-signal --engram-probe`/,
      );

      // An outdated binary rejects the probe command outright.
      const outdated = makeStubExecutable("outdated", { probe: "fail" });
      expect(() => api.installLiveSignals(tmpDir, { executable: outdated.path })).toThrow(
        /does not answer `hook-signal --engram-probe`/,
      );

      if (existsSync("/usr/bin/true")) {
        expect(() => api.installLiveSignals(tmpDir, { executable: "/usr/bin/true" })).toThrow(
          /does not answer `hook-signal --engram-probe`/,
        );
      }

      // The refused attempts installed nothing anywhere.
      expect(existsSync(hookPath(tmpDir, "post-commit"))).toBe(false);

      // A current executable answering the probe is accepted.
      const current = makeStubExecutable("current");
      expect(api.installLiveSignals(tmpDir, { executable: current.path })).toContain(
        "post-commit: installed",
      );
    });

    it("the hook-signal CLI dispatch ignores repo-controlled .env and never writes into a worktree", async () => {
      const api = await liveHooks();
      const outsideSink = mkdtempSync(join(tmpdir(), "graphify-h0-cli-sink-"));
      const originalSinkEnv = process.env.ENGRAM_LIVE_SIGNAL_DIR;
      delete process.env.ENGRAM_LIVE_SIGNAL_DIR;

      // A repo-owned .env tries to select the sink: the real CLI dispatch must
      // run before any repo-controlled configuration is loaded, so nothing
      // is emitted at all.
      writeFileSync(join(tmpDir, ".env"), `ENGRAM_LIVE_SIGNAL_DIR=${outsideSink}\n`, "utf-8");
      const statusBefore = git(tmpDir, ["status", "--porcelain", "--untracked-files=all"]);
      try {
        await runCliHookSignal(["post-commit"], tmpDir);
      } finally {
        if (originalSinkEnv === undefined) delete process.env.ENGRAM_LIVE_SIGNAL_DIR;
        else process.env.ENGRAM_LIVE_SIGNAL_DIR = originalSinkEnv;
      }
      expect(readdirSync(outsideSink)).toHaveLength(0);
      expect(existsSync(join(tmpDir, ".engram"))).toBe(false);
      expect(git(tmpDir, ["status", "--porcelain", "--untracked-files=all"])).toBe(statusBefore);

      // Even a host-injected sink inside the worktree is refused (no write).
      expect(api.emitLiveSignalFromHook("post-commit", undefined, {
        sinkDir: join(tmpDir, ".engram"),
        cwd: tmpDir,
      })).toEqual({ emitted: false, reason: "sink-inside-worktree" });
      expect(existsSync(join(tmpDir, ".engram"))).toBe(false);

      // Positive control: only the real host environment can select the sink,
      // and the same CLI dispatch emits through it.
      process.env.ENGRAM_LIVE_SIGNAL_DIR = outsideSink;
      try {
        await runCliHookSignal(["post-commit"], tmpDir);
        expect(readdirSync(outsideSink)).toEqual(["post-commit.jsonl"]);
      } finally {
        if (originalSinkEnv === undefined) delete process.env.ENGRAM_LIVE_SIGNAL_DIR;
        else process.env.ENGRAM_LIVE_SIGNAL_DIR = originalSinkEnv;
      }
      expect(git(tmpDir, ["status", "--porcelain", "--untracked-files=all"])).toBe(statusBefore);
    });

    it("sink destinations inside a worktree are refused after symlink resolution", async () => {
      const api = await liveHooks();
      const holder = mkdtempSync(join(tmpdir(), "graphify-h0-sym-"));
      try {
        const target = join(tmpDir, "inside-target");
        mkdirSync(target, { recursive: true });
        symlinkSync(target, join(holder, "sink-link"));

        // Lexically outside the worktree, but resolving inside it: refused.
        expect(api.emitLiveSignalFromHook("post-commit", undefined, {
          sinkDir: join(holder, "sink-link"),
          cwd: tmpDir,
        })).toEqual({ emitted: false, reason: "sink-inside-worktree" });
        expect(existsSync(join(target, "post-commit.jsonl"))).toBe(false);

        // A plain absolute path inside the worktree is refused too.
        expect(api.emitLiveSignalFromHook("post-commit", undefined, {
          sinkDir: join(tmpDir, "abs-sink"),
          cwd: tmpDir,
        })).toEqual({ emitted: false, reason: "sink-inside-worktree" });

        // A genuine host sink outside any worktree still works.
        const realSink = mkdtempSync(join(tmpdir(), "graphify-h0-sym-ok-"));
        expect(api.emitLiveSignalFromHook("post-commit", undefined, {
          sinkDir: realSink,
          cwd: tmpDir,
        })).toEqual({ emitted: true, reason: "emitted" });
        rmSync(realSink, { recursive: true, force: true });
      } finally {
        rmSync(holder, { recursive: true, force: true });
      }
    });

    it("a sink directory named '..signals' is still a worktree directory and refused", async () => {
      // A leading '..' in a single segment must not be confused with the
      // parent component: from the worktree root, '..signals' names a
      // directory of the worktree itself, so the signal must never be written.
      const originalSinkEnv = process.env.ENGRAM_LIVE_SIGNAL_DIR;
      process.env.ENGRAM_LIVE_SIGNAL_DIR = "..signals";
      const statusBefore = git(tmpDir, ["status", "--porcelain", "--untracked-files=all"]);
      try {
        // The hook process runs at the worktree root, like a real git hook.
        await runCliHookSignal(["post-commit"], tmpDir);
      } finally {
        if (originalSinkEnv === undefined) delete process.env.ENGRAM_LIVE_SIGNAL_DIR;
        else process.env.ENGRAM_LIVE_SIGNAL_DIR = originalSinkEnv;
      }
      expect(existsSync(join(tmpDir, "..signals"))).toBe(false);
      expect(git(tmpDir, ["status", "--porcelain", "--untracked-files=all"])).toBe(statusBefore);
    });

    it("a marker file that is a symbolic link never redirects the signal", async () => {
      const api = await liveHooks();
      const sink = mkdtempSync(join(tmpdir(), "graphify-h0-link-marker-"));
      try {
        // The marker points at a tracked worktree file: the complete target
        // (sink directory plus marker) is controlled, so the append is
        // refused before the sink ever opens the marker.
        const tracked = join(tmpDir, "tracked.txt");
        writeFileSync(tracked, "before\n", "utf-8");
        symlinkSync(tracked, join(sink, "post-commit.jsonl"));
        expect(api.emitLiveSignalFromHook("post-commit", undefined, {
          sinkDir: sink,
          cwd: tmpDir,
        })).toEqual({ emitted: false, reason: "sink-inside-worktree" });
        expect(readFileSync(tracked, "utf-8")).toBe("before\n");

        // Even towards another host location outside any worktree, opening
        // a symbolic-link marker is refused outright.
        const elsewhere = mkdtempSync(join(tmpdir(), "graphify-h0-link-elsewhere-"));
        try {
          const otherFile = join(elsewhere, "host.log");
          writeFileSync(otherFile, "host\n", "utf-8");
          symlinkSync(otherFile, join(sink, "post-merge.jsonl"));
          expect(api.emitLiveSignalFromHook("post-merge", undefined, {
            sinkDir: sink,
            cwd: tmpDir,
          })).toEqual({ emitted: false, reason: "sink-error" });
          expect(readFileSync(otherFile, "utf-8")).toBe("host\n");
        } finally {
          rmSync(elsewhere, { recursive: true, force: true });
        }
      } finally {
        rmSync(sink, { recursive: true, force: true });
      }
    });

    it("a marker file sharing an inode with a worktree file never receives the signal", async () => {
      const api = await liveHooks();
      const sink = mkdtempSync(join(tmpdir(), "graphify-h0-hardlink-marker-"));
      try {
        // The marker is a hard link to a worktree file: realpath keeps the
        // outer path and lstat reports no symbolic link, so only the open
        // descriptor can reveal the shared inode. The write must be refused.
        const tracked = join(tmpDir, "tracked.txt");
        writeFileSync(tracked, "before\n", "utf-8");
        const marker = join(sink, "post-commit.jsonl");
        linkSync(tracked, marker);
        const before = readFileSync(tracked, "utf-8");
        expect(api.emitLiveSignalFromHook("post-commit", undefined, {
          sinkDir: sink,
          cwd: tmpDir,
        })).toEqual({ emitted: false, reason: "sink-error" });
        expect(readFileSync(tracked, "utf-8")).toBe(before);

        // The same sink stays usable: a fresh single-link marker is created
        // through the verified descriptor and appended to atomically.
        expect(api.emitLiveSignalFromHook("post-merge", undefined, {
          sinkDir: sink,
          cwd: tmpDir,
        })).toEqual({ emitted: true, reason: "emitted" });
        expect(api.emitLiveSignalFromHook("post-merge", undefined, {
          sinkDir: sink,
          cwd: tmpDir,
        })).toEqual({ emitted: true, reason: "emitted" });
        const lines = readFileSync(join(sink, "post-merge.jsonl"), "utf-8").trimEnd().split("\n");
        expect(lines).toHaveLength(2);
        expect(JSON.parse(lines[0]).hook).toBe("post-merge");
      } finally {
        rmSync(sink, { recursive: true, force: true });
      }
    });

    it("a marker created for an unverifiable worktree is removed instead of left empty", async () => {
      // More files than the protected-inode scan bound means the marker
      // cannot be verified as foreign, so the emission is refused; the
      // marker this refusal created must not linger empty at the host sink.
      const api = await liveHooks();
      const bulk = join(tmpDir, "bulk");
      mkdirSync(bulk);
      for (let i = 0; i <= 65536; i++) {
        writeFileSync(join(bulk, `f${i}`), "", "utf-8");
      }
      const sink = mkdtempSync(join(tmpdir(), "graphify-h0-bulk-sink-"));
      try {
        expect(api.emitLiveSignalFromHook("post-commit", undefined, {
          sinkDir: sink,
          cwd: tmpDir,
        })).toEqual({ emitted: false, reason: "sink-error" });
        expect(existsSync(join(sink, "post-commit.jsonl"))).toBe(false);
      } finally {
        rmSync(sink, { recursive: true, force: true });
      }
    }, 30000);

    it("engram-only state is recognized and grants no write permission", async () => {
      const api = await liveHooks();
      const paths = await livePaths();

      mkdirSync(join(tmpDir, ".engram"), { recursive: true });
      const stateFile = join(tmpDir, ".engram", "graph.json");
      writeFileSync(stateFile, JSON.stringify({ version: 1 }), "utf-8");
      const stateBefore = readFileSync(stateFile, "utf-8");

      // `.engram/` alone (no legacy state dir) is recognized.
      expect(paths.hasEngramState(tmpDir)).toBe(true);
      expect(paths.detectWorktreeStateKind(tmpDir)).toBe("engram");

      // Recognition grants no write permission: state bytes are identical, no
      // legacy state dir appears and live signals never land in the worktree.
      const stub = makeStubExecutable("state");
      api.installLiveSignals(tmpDir, { executable: stub.path });
      const sinkDir = mkdtempSync(join(tmpdir(), "graphify-h0-state-sink-"));
      expect(api.emitLiveSignalFromHook("post-commit", undefined, { sinkDir, cwd: tmpDir }).emitted).toBe(true);
      expect(readFileSync(stateFile, "utf-8")).toBe(stateBefore);
      expect(existsSync(join(tmpDir, ".graphify"))).toBe(false);
      expect(existsSync(join(tmpDir, "graphify-out"))).toBe(false);
      expect(existsSync(join(tmpDir, ".engram", "needs_update"))).toBe(false);
    });

    it("third-party hooks are chained with interpreter, args, stdin and exit code preserved", async () => {
      const api = await liveHooks();
      const stub = makeStubExecutable("chain");
      const thirdPartyLog = join(tmpDir, "third-party.log");

      // A non-sh third-party reference-transaction hook vetoing `prepared`.
      const thirdParty = [
        `#!${process.execPath}`,
        "const fs = require('node:fs');",
        `const log = ${JSON.stringify(thirdPartyLog)};`,
        "let stdin = '';",
        "try { stdin = fs.readFileSync(0, 'utf-8'); } catch { stdin = ''; }",
        "fs.appendFileSync(log, JSON.stringify({ phase: process.argv[2], stdin }) + '\\n');",
        "process.exit(process.argv[2] === 'prepared' ? 1 : 0);",
        "",
      ].join("\n");
      const hookFile = hookPath(tmpDir, "reference-transaction");
      writeFileSync(hookFile, thirdParty, "utf-8");
      chmodSync(hookFile, 0o755);
      const bytesBefore = readFileSync(hookFile, "utf-8");

      const result = api.installLiveSignals(tmpDir, { executable: stub.path });
      expect(result).toContain("chained third-party reference-transaction");
      const chainFile = `${hookFile}.engram-live-user`;
      expect(readFileSync(chainFile, "utf-8")).toBe(bytesBefore);

      // prepared: the third-party veto (exit 1) reaches git; no signal.
      const { dir: shimDir } = makePackageManagerShims();
      expect(runHookScript(hookFile, ["prepared"], shimDir, { input: "refs/heads/main\n" })).toBe(1);
      expect(
        readFileSync(thirdPartyLog, "utf-8").trim().split("\n").map((line) => JSON.parse(line)),
      ).toEqual([{ phase: "prepared", stdin: "refs/heads/main\n" }]);
      expect(stubCalls(stub.log)).toBe("");

      // committed: the third-party hook runs again, then the bounded signal.
      expect(runHookScript(hookFile, ["committed"], shimDir, { input: "refs/heads/main\n" })).toBe(0);
      expect(stubCalls(stub.log)).toContain("hook-signal reference-transaction committed");

      // Removal restores the third-party hook byte-for-byte.
      const removed = api.uninstallLiveSignals(tmpDir);
      expect(removed).toContain("restored the third-party hook");
      expect(readFileSync(hookFile, "utf-8")).toBe(bytesBefore);
      expect(existsSync(chainFile)).toBe(false);
    });

    it("live signals resolve the effective hooks directory git executes", async () => {
      const api = await liveHooks();
      const stub = makeStubExecutable("effective");

      // A configured `core.hooksPath` ending in `_` inside the git dir: Git
      // executes exactly there, so the live install must keep that path
      // (no blanket trailing-`_` stripping) and Git really runs the signal.
      const underscoredHooks = join(tmpDir, ".git", "_");
      git(tmpDir, ["config", "core.hooksPath", underscoredHooks]);
      expect(api.installLiveSignals(tmpDir, { executable: stub.path })).toContain("post-commit:");
      expect(hookPath(tmpDir, "post-commit")).toBe(join(underscoredHooks, "post-commit"));
      expect(readFileSync(hookPath(tmpDir, "post-commit"), "utf-8")).toContain(
        "engram-live-signal-start",
      );
      git(tmpDir, ["config", "user.email", "h0@example.test"]);
      git(tmpDir, ["config", "user.name", "h0"]);
      writeFileSync(join(tmpDir, "f.txt"), "x\n", "utf-8");
      git(tmpDir, ["add", "f.txt"]);
      git(tmpDir, ["commit", "-qm", "h0"]);
      expect(stubCalls(stub.log)).toContain("hook-signal post-commit");

      // Husky only: `.husky/_` auto-generated wrappers step up to `.husky/`.
      git(tmpDir, ["config", "core.hooksPath", ".husky/_"]);
      api.installLiveSignals(tmpDir, { executable: stub.path });
      expect(existsSync(join(tmpDir, ".husky", "post-commit"))).toBe(true);
      expect(existsSync(join(tmpDir, ".husky", "_", "post-commit"))).toBe(false);

      // A controlled global configuration pointing outside the repository is
      // refused with zero mutation: nothing is written to the external dir.
      git(tmpDir, ["config", "--unset", "core.hooksPath"]);
      const externalHooks = mkdtempSync(join(tmpdir(), "graphify-h0-external-"));
      const globalConfig = join(tmpDir, "h0-global-config");
      writeFileSync(globalConfig, `[core]\n\thooksPath = ${externalHooks}\n`, "utf-8");
      const previousGlobal = process.env.GIT_CONFIG_GLOBAL;
      process.env.GIT_CONFIG_GLOBAL = globalConfig;
      try {
        expect(() => api.installLiveSignals(tmpDir, { executable: stub.path })).toThrow(
          /refuses to install outside repository git directories/,
        );
        expect(readdirSync(externalHooks)).toHaveLength(0);
      } finally {
        if (previousGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
        else process.env.GIT_CONFIG_GLOBAL = previousGlobal;
        rmSync(externalHooks, { recursive: true, force: true });
      }
    });

    it("live hooks emit a bounded signal without rebuild, export or network work", async () => {
      const api = await liveHooks();
      const sinkDir = mkdtempSync(join(tmpdir(), "graphify-h0-sink-"));
      const stub = makeStubExecutable("bounded");
      api.installLiveSignals(tmpDir, { executable: stub.path });

      // The installed dispatchers invoke only the pinned executable with the
      // signal dispatch, under an execution budget: no rebuild, export,
      // marker write, downloader or package manager.
      for (const name of LIVE_NAMES) {
        const content = readFileSync(hookPath(tmpDir, name), "utf-8");
        expect(content).not.toMatch(/hook-rebuild|hook-mark-stale|needs_update/);
        expect(content).not.toMatch(/curl|wget|npm|npx/);
        expect(content).toContain("timeout -k 1 2");
      }
      const { dir: shimDir, marker } = makePackageManagerShims();
      expect(runHookScript(hookPath(tmpDir, "post-commit"), [], shimDir)).toBe(0);
      expect(stubCalls(stub.log)).toContain("hook-signal post-commit");
      expect(stubCalls(stub.log)).not.toContain("hook-rebuild");
      expect(existsSync(marker)).toBe(false);

      // The real emission path uses only the injected host sink and performs
      // no network work even when fetch would explode on use.
      const originalFetch = globalThis.fetch;
      let fetchCalls = 0;
      globalThis.fetch = (async () => {
        fetchCalls += 1;
        throw new Error("network forbidden on the live signal path");
      }) as typeof fetch;
      try {
        const outcome = api.emitLiveSignalFromHook("post-commit", undefined, {
          sinkDir,
          cwd: tmpDir,
          now: "2026-10-11T00:00:00.000Z",
        });
        expect(outcome).toEqual({ emitted: true, reason: "emitted" });
      } finally {
        globalThis.fetch = originalFetch;
      }
      expect(fetchCalls).toBe(0);

      const files = readdirSync(sinkDir);
      expect(files).toHaveLength(1);
      const line = readFileSync(join(sinkDir, files[0]), "utf-8");
      expect(line.endsWith("\n")).toBe(true);
      expect(Buffer.byteLength(line, "utf-8")).toBeLessThanOrEqual(1024);
      expect(JSON.parse(line)).toMatchObject({ hook: "post-commit" });

      // Nothing was rebuilt, exported or marked inside the worktree.
      expect(existsSync(join(tmpDir, ".graphify", "needs_update"))).toBe(false);
      expect(existsSync(join(tmpDir, ".engram", "needs_update"))).toBe(false);
      expect(git(tmpDir, ["status", "--porcelain", "--ignored", "--untracked-files=all"])).toBe("");
    });

    it("an oversized signal is refused instead of written", async () => {
      const api = await liveHooks();

      // A valid worktree root of >1500 characters: the serialized line would
      // exceed the 1024-byte bound, so the emission is dropped, not written.
      let deep = tmpDir;
      while (deep.length < 1560) {
        deep = join(deep, "d".repeat(63));
      }
      mkdirSync(deep, { recursive: true });
      git(deep, ["init", "-q"]);

      const sinkDir = mkdtempSync(join(tmpdir(), "graphify-h0-size-"));
      expect(api.emitLiveSignalFromHook("post-commit", undefined, { sinkDir, cwd: deep })).toEqual({
        emitted: false,
        reason: "signal-too-large",
      });
      expect(readdirSync(sinkDir)).toHaveLength(0);
    });

    it("a hanging pinned executable cannot delay git beyond the execution budget", async () => {
      const api = await liveHooks();
      const stub = makeStubExecutable("hang", { signal: "hang" });
      api.installLiveSignals(tmpDir, { executable: stub.path });

      // Outer safety timeout only: the dispatcher itself must return within
      // its 2s execution budget (+ SIGKILL grace), not block git indefinitely.
      const started = Date.now();
      const result = spawnSync("sh", [hookPath(tmpDir, "post-commit")], {
        env: { ...process.env, PATH: "/usr/bin:/bin" },
        encoding: "utf-8",
        input: "",
        timeout: 15_000,
      });
      const elapsed = Date.now() - started;
      expect(result.status).toBe(0);
      expect(result.error).toBeUndefined();
      expect(elapsed).toBeLessThan(10_000);
    });

    it("live signals install into the common hooks directory from a linked worktree", async () => {
      const api = await liveHooks();
      const worktreeDir = join(tmpDir, "linked-live-worktree");
      git(tmpDir, ["worktree", "add", "-q", worktreeDir, "-b", "graphify-test-live"]);

      const stub = makeStubExecutable("linked");
      const result = api.installLiveSignals(worktreeDir, { executable: stub.path });
      expect(result).toContain("post-commit:");
      expect(hookPath(worktreeDir, "post-commit")).toBe(hookPath(tmpDir, "post-commit"));
      expect(readFileSync(hookPath(worktreeDir, "post-commit"), "utf-8")).toContain(
        "engram-live-signal-start",
      );
    });

    it("legacy hook installation distributes no npm/npx fallback", () => {
      install(tmpDir);
      for (const name of ["post-commit", "post-checkout", "post-merge", "post-rewrite"]) {
        const content = readFileSync(hookPath(tmpDir, name), "utf-8");
        expect(content).toContain('GRAPHIFY_CMD="graphify"');
        expect(content).not.toContain("npx");
      }

      // Runtime: with only npm/npx shims on PATH and no installed graphify,
      // the legacy hook never reaches a package manager.
      const { dir: shimDir, marker } = makePackageManagerShims();
      git(tmpDir, ["config", "user.email", "h0@example.test"]);
      git(tmpDir, ["config", "user.name", "h0"]);
      writeFileSync(join(tmpDir, "a.txt"), "a\n", "utf-8");
      git(tmpDir, ["add", "a.txt"]);
      git(tmpDir, ["commit", "-qm", "h0 fixture"]);
      writeFileSync(join(tmpDir, "a.txt"), "b\n", "utf-8");
      const result = spawnSync("sh", [hookPath(tmpDir, "post-commit")], {
        env: { ...process.env, PATH: `${shimDir}:/usr/bin:/bin` },
        encoding: "utf-8",
        input: "",
        cwd: tmpDir,
      });
      expect(result.status).toBe(0);
      expect(existsSync(marker)).toBe(false);
    });

    it("GUARD: activation and live signals leave tracked untracked ignored files gitattributes and Git config unchanged", async () => {
      const api = await liveHooks();
      git(tmpDir, ["config", "user.email", "h0@example.test"]);
      git(tmpDir, ["config", "user.name", "h0"]);
      git(tmpDir, ["config", "h0.sentinel", "kept"]);

      writeFileSync(join(tmpDir, "tracked.txt"), "tracked\n", "utf-8");
      git(tmpDir, ["add", "tracked.txt"]);
      git(tmpDir, ["commit", "-qm", "h0 fixture"]);
      writeFileSync(join(tmpDir, "untracked.txt"), "untracked\n", "utf-8");
      writeFileSync(join(tmpDir, ".gitignore"), "ignored.txt\n", "utf-8");
      writeFileSync(join(tmpDir, "ignored.txt"), "ignored\n", "utf-8");
      writeFileSync(join(tmpDir, ".gitattributes"), "*.txt text\n", "utf-8");

      const sinkDir = mkdtempSync(join(tmpdir(), "graphify-h0-guard-sink-"));
      const stub = makeStubExecutable("guard");
      api.installLiveSignals(tmpDir, { executable: stub.path });

      const snapshot = (): string => JSON.stringify({
        status: git(tmpDir, ["status", "--porcelain", "--ignored", "--untracked-files=all"]),
        config: execFileSync("git", ["-C", tmpDir, "config", "--local", "--list"], {
          encoding: "utf-8",
        }),
        attributes: readFileSync(join(tmpDir, ".gitattributes"), "utf-8"),
        tracked: digestFile(join(tmpDir, "tracked.txt")),
        untracked: digestFile(join(tmpDir, "untracked.txt")),
        ignored: digestFile(join(tmpDir, "ignored.txt")),
      });
      const before = snapshot();

      // Activation-equivalent reads plus every live signal, including the
      // committed reference-transaction phase.
      status(tmpDir);
      const { dir: shimDir } = makePackageManagerShims();
      for (const name of LIVE_NAMES) {
        const args = name === "reference-transaction" ? ["committed"] : [];
        expect(runHookScript(hookPath(tmpDir, name), args, shimDir)).toBe(0);
        const outcome = api.emitLiveSignalFromHook(name, args[0], { sinkDir, cwd: tmpDir });
        expect(outcome.emitted).toBe(true);
      }

      expect(snapshot()).toBe(before);
      expect(existsSync(join(tmpDir, ".graphify"))).toBe(false);
    });

    it("GUARD: reference-transaction signals only committed transactions and explicit non-live installation remains separate", async () => {
      const api = await liveHooks();
      const sinkDir = mkdtempSync(join(tmpdir(), "graphify-h0-phase-sink-"));
      const stub = makeStubExecutable("phase");
      api.installLiveSignals(tmpDir, { executable: stub.path });

      // Non-committed phases never emit, at either the shell or dispatch layer.
      const { dir: shimDir } = makePackageManagerShims();
      for (const phase of ["prepared", "aborted"]) {
        expect(runHookScript(hookPath(tmpDir, "reference-transaction"), [phase], shimDir)).toBe(0);
        expect(api.emitLiveSignalFromHook("reference-transaction", phase, {
          sinkDir,
          cwd: tmpDir,
        })).toEqual({ emitted: false, reason: expect.any(String) });
      }
      expect(stubCalls(stub.log)).toBe("");
      expect(readdirSync(sinkDir)).toHaveLength(0);

      expect(runHookScript(hookPath(tmpDir, "reference-transaction"), ["committed"], shimDir)).toBe(0);
      expect(stubCalls(stub.log)).toContain("hook-signal reference-transaction committed");
      expect(
        api.emitLiveSignalFromHook("reference-transaction", "committed", { sinkDir, cwd: tmpDir }),
      ).toEqual({ emitted: true, reason: "emitted" });

      // Explicit legacy non-live installation stays a separate operation:
      // rebuild hooks plus graph attributes and merge-driver config.
      const legacyDir = mkdtempSync(join(tmpdir(), "graphify-h0-legacy-"));
      try {
        execFileSync("git", ["-C", legacyDir, "init", "-q"]);
        const legacyResult = install(legacyDir);
        expect(legacyResult).toContain(".gitattributes:");
        expect(legacyResult).toContain("merge.graphify-json.driver:");
        const legacyHook = readFileSync(
          join(legacyDir, ".git", "hooks", "post-commit"),
          "utf-8",
        );
        expect(legacyHook).toContain("graphify_mark_stale");
        expect(legacyHook).not.toContain("engram-live-signal-start");

        // And the live installation carries none of the legacy machinery.
        const liveHook = readFileSync(hookPath(tmpDir, "post-commit"), "utf-8");
        expect(liveHook).toContain("engram-live-signal-start");
        expect(liveHook).not.toContain("graphify_mark_stale");
        expect(existsSync(join(tmpDir, ".gitattributes"))).toBe(false);
        const liveConfig = execFileSync("git", ["-C", tmpDir, "config", "--local", "--list"], {
          encoding: "utf-8",
        });
        expect(liveConfig).not.toContain("merge.graphify-json");
      } finally {
        rmSync(legacyDir, { recursive: true, force: true });
      }
    });
  });
});
