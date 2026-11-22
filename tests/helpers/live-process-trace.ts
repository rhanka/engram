import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export type Phase = "setup" | "oracle";
export interface ProcessResult { status: number; stdout: Buffer; stderr: Buffer }
interface Launch {
  executable: string; cwd: string; args: string[]; phase: Phase;
  status: number; stdoutBytes: number; stderrBytes: number;
}
interface TraceEvent { event: string; sid?: string; argv?: string[]; code?: number }

// Resolve once without a shell; ignore relative PATH entries, including the fixture.
function gitExecutable(): string {
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(isAbsolute)) {
    const candidate = join(directory, process.platform === "win32" ? "git.exe" : "git");
    try { accessSync(candidate, constants.X_OK); return realpathSync(candidate); } catch { /* next */ }
  }
  throw new Error("L0 requires installed Git; no download fallback");
}

/** Trace2 records Git's own child launches in addition to direct subprocesses.
 * This corpus needs no children, even for shallow repositories.
 * Test infrastructure only: this is not a production collector or an OS sandbox.
 */
export class LiveProcessTrace {
  readonly executable = gitExecutable();
  readonly launches: Launch[] = [];
  readonly path: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly prefix: string[];

  constructor(root: string) {
    this.path = join(root, "git-trace2.jsonl");
    // No inherited GIT_DIR, index override, config injection or credentials.
    this.env = {
      PATH: [dirname(this.executable), "/usr/bin", "/bin"].join(delimiter),
      HOME: root, XDG_CONFIG_HOME: root, TMPDIR: root,
      LANG: "C", LC_ALL: "C", TZ: "UTC",
      GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_ATTR_NOSYSTEM: "1", GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1",
      GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0", GIT_TRACE2_EVENT: this.path,
      GIT_AUTHOR_NAME: "L0 Fixture", GIT_AUTHOR_EMAIL: "l0@example.invalid",
      GIT_COMMITTER_NAME: "L0 Fixture", GIT_COMMITTER_EMAIL: "l0@example.invalid",
      GIT_AUTHOR_DATE: "1700000000 +0000", GIT_COMMITTER_DATE: "1700000000 +0000",
    };
    this.prefix = ["--no-pager", "--no-optional-locks",
      "-c", "core.fsmonitor=false", "-c", `core.hooksPath=${join(root, "disabled-hooks")}`,
      "-c", "core.attributesFile=/dev/null", "-c", "core.autocrlf=false",
      "-c", "core.quotePath=true", "-c", "commit.gpgSign=false", "-c", "tag.gpgSign=false",
      "-c", "gc.auto=0", "-c", "maintenance.auto=false", "-c", "protocol.allow=never",
    ];
  }

  run(cwd: string, args: readonly string[], input?: Buffer | string, phase: Phase = "setup", env?: NodeJS.ProcessEnv): ProcessResult {
    const argv = [...this.prefix, ...args];
    const result = spawnSync(this.executable, argv, {
      cwd, env: env ? { ...this.env, ...env } : this.env,
      // Only commands that read stdin receive an input pipe write; read-only
      // oracle commands get no input so Git can never observe EPIPE on entry.
      ...(input !== undefined ? { input } : {}),
      shell: false, maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000, killSignal: "SIGKILL",
    });
    // A racing EPIPE while the child already exited must not mask its outcome:
    // expose the real status and stderr instead of reporting "unavailable".
    // No retry: the caller decides from the returned status.
    const epipe = (result.error as NodeJS.ErrnoException | undefined)?.code === "EPIPE";
    if (result.error && !(epipe && result.status !== null)) {
      throw new Error(`L0 Git subprocess unavailable: ${result.error.message}`);
    }
    if (result.status === null) throw new Error(`L0 Git terminated by ${result.signal}`);
    this.launches.push({ executable: this.executable, cwd, args: argv, phase,
      status: result.status, stdoutBytes: result.stdout.length, stderrBytes: result.stderr.length });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  async stream(cwd: string, args: string[], chunks: Iterable<string>): Promise<void> {
    const argv = [...this.prefix, ...args];
    const child = spawn(this.executable, argv, {
      cwd, env: this.env, shell: false, stdio: ["pipe", "pipe", "pipe"],
      timeout: 110_000, killSignal: "SIGKILL",
    });
    let stdoutBytes = 0;
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => { stdoutBytes += chunk.length; });
    child.stderr.on("data", (chunk: Buffer) => { stderr.push(chunk); });
    const closed = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => code === null
        ? reject(new Error(`L0 Git terminated by ${signal}`)) : resolve(code));
    });
    try {
      const [, status] = await Promise.all([pipeline(Readable.from(chunks), child.stdin), closed]);
      const error = Buffer.concat(stderr);
      this.launches.push({ executable: this.executable, cwd, args: argv, phase: "setup",
        status, stdoutBytes, stderrBytes: error.length });
      if (status !== 0) throw new Error(`L0 fast-import failed (${status}): ${error}`);
    } catch (error) {
      child.kill("SIGKILL");
      await closed.catch(() => undefined);
      throw error;
    }
  }

  private events(): TraceEvent[] {
    if (!existsSync(this.path)) throw new Error("L0 missing Git Trace2 evidence");
    return readFileSync(this.path, "utf8").trim().split("\n").map(line => JSON.parse(line));
  }

  assertSafe(): void {
    const events = this.events();
    const children = events.filter(event => event.event === "child_start");
    if (children.length) throw new Error(`L0 repository-triggered child process: ${JSON.stringify(children)}`);
    const sessions = new Map<string, TraceEvent[]>();
    for (const event of events) {
      if (typeof event.sid !== "string" || !event.sid) throw new Error("L0 incomplete Git process trace: missing sid");
      const session = sessions.get(event.sid) ?? [];
      session.push(event);
      sessions.set(event.sid, session);
    }
    const starts = events.filter(event => event.event === "start");
    if (starts.length !== this.launches.length || sessions.size !== this.launches.length) {
      throw new Error("L0 incomplete Git process trace");
    }
    for (const [index, launch] of this.launches.entries()) {
      // A start alone cannot prove that no child was launched later.
      const session = sessions.get(starts[index].sid!)!;
      const lifecycle = session.filter(event => ["start", "exit", "atexit"].includes(event.event));
      if (lifecycle.length !== 3 || lifecycle[0] !== starts[index] ||
          lifecycle[1].event !== "exit" || lifecycle[2].event !== "atexit" ||
          session[session.length - 1] !== lifecycle[2]) {
        throw new Error("L0 incomplete Git process trace: expected start, exit and atexit per sid");
      }
      if (lifecycle[1].code !== launch.status || lifecycle[2].code !== launch.status) {
        throw new Error("L0 Git process trace exit code mismatch");
      }
      if (JSON.stringify(starts[index].argv) !== JSON.stringify([launch.executable, ...launch.args])) {
        throw new Error("L0 process trace argv mismatch");
      }
      if (!launch.args.includes("core.fsmonitor=false") || !launch.args.includes("--no-optional-locks")) {
        throw new Error("L0 Git safety configuration missing");
      }
      if (launch.args.includes("diff-tree") &&
          (!launch.args.includes("--no-ext-diff") || !launch.args.includes("--no-textconv"))) {
        throw new Error("L0 unsafe diff oracle");
      }
    }
  }

  counts() {
    return { git: this.launches.length,
      setup: this.launches.filter(entry => entry.phase === "setup").length,
      oracle: this.launches.filter(entry => entry.phase === "oracle").length,
      children: this.events().filter(event => event.event === "child_start").length };
  }
}

export interface VirtualScheduleClock {
  now(): number;
  setNow(nextMs: number): void;
  advance(ms: number): void;
  schedule(ms: number, callback: () => void): () => void;
  pendingCount(): number;
  clearAll(): void;
}

/** Deterministic virtual timer clock (zero real OS timers) for L9-E factory tests. */
export function createVirtualScheduleClock(startAt: number): VirtualScheduleClock {
  let current = startAt;
  const timers = new Set<{ readonly at: number; readonly callback: () => void }>();
  return {
    now: () => current,
    setNow: (nextMs: number) => {
      current = nextMs;
    },
    advance: (ms: number) => {
      current += ms;
      for (;;) {
        let fired = false;
        for (const entry of [...timers]) {
          if (entry.at <= current) {
            timers.delete(entry);
            entry.callback();
            fired = true;
          }
        }
        if (!fired) break;
      }
    },
    schedule: (ms: number, callback: () => void) => {
      const delay = Number.isFinite(ms) && ms > 0 ? ms : 0;
      const entry = { at: current + delay, callback };
      timers.add(entry);
      return () => {
        timers.delete(entry);
      };
    },
    pendingCount: () => timers.size,
    clearAll: () => {
      timers.clear();
    },
  };
}

/** Ensures assembled `engram-live/dist` is fresher than all `engram-live/*.ts` inputs, with bounded locking and build timeout. */
export function ensureAssembledDistFresh(repoRoot: string): void {
  const liveRoot = join(repoRoot, "engram-live");
  const buildScript = join(repoRoot, "scripts", "build-live.mjs");
  const distIntegration = join(liveRoot, "dist", "integration.js");
  const distIndex = join(liveRoot, "dist", "index.js");

  const inputs: string[] = [];
  for (const entry of readdirSync(liveRoot, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name === "grammar-manifest.json" || entry.name === "package.json")) {
      inputs.push(join(liveRoot, entry.name));
    }
  }
  const newestInput = Math.max(...inputs.map((p) => statSync(p).mtimeMs));
  const needsBuild =
    !existsSync(distIntegration) ||
    !existsSync(distIndex) ||
    statSync(distIntegration).mtimeMs < newestInput;
  if (!needsBuild) return;

  const lockPath = join(tmpdir(), "engram-live-build.lock");
  for (let attempt = 0; ; attempt += 1) {
    if (attempt > 900) throw new Error("engram-live build lock timeout");
    let fd: number | undefined;
    try {
      fd = openSync(lockPath, "wx");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code && code !== "EEXIST") {
        throw error;
      }
      try {
        if (statSync(lockPath).mtimeMs < Date.now() - 180_000) unlinkSync(lockPath);
      } catch {
        /* lock released concurrently; sleep briefly and retry up to attempt limit */
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      continue;
    }
    try {
      execFileSync(process.execPath, [buildScript], {
        cwd: repoRoot,
        stdio: "inherit",
        timeout: 60_000,
        killSignal: "SIGKILL",
      });
      return;
    } finally {
      try {
        if (fd !== undefined) closeSync(fd);
      } catch {
        /* ignore */
      }
      try {
        unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    }
  }
}

interface ProducerGitLaunchRecord {
  readonly executable: string;
  readonly cwd: string;
  readonly args: readonly string[];
  readonly status: number;
  readonly purpose?: string;
}

export interface ProducerArtifactTraceOptions {
  readonly trace: LiveProcessTrace;
  readonly allowedHostDirs: readonly string[];
  readonly observedRoots: readonly string[];
  readonly isolatedTmpDir?: string;
  readonly mustStayEmptyDirs?: readonly string[];
  readonly probeAudit?: { readonly probeDir: string; readonly expectedFiles: readonly string[] };
}

export interface IsolatedProducerProbeOptions {
  readonly trace: LiveProcessTrace;
  readonly isolatedTmpDir: string;
  readonly allowedHostDirs: readonly string[];
  readonly writableHostDirs?: readonly string[];
  readonly mustStayEmptyDirs?: readonly string[];
  readonly observedRoots: readonly string[];
  readonly hostHomeDir: string;
  readonly hostXdgDir: string;
  readonly entryModuleUrl: string;
  readonly contractsModuleUrl: string;
  readonly batchCodecModuleUrl: string;
  readonly generationModuleUrl: string;
  readonly repoRoot: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly scriptBody: string;
  readonly timeoutMs?: number;
}

function normalizeBoundaryPath(targetPath: string): string {
  const resolved = resolve(targetPath);
  return resolved.length > 1 ? resolved.replace(/\/+$/, "") : resolved;
}

function isInsideOrEqualBoundary(candidate: string, rootDir: string): boolean {
  const normCand = normalizeBoundaryPath(candidate);
  const normRoot = normalizeBoundaryPath(rootDir);
  return normCand === normRoot || normCand.startsWith(normRoot + "/");
}

function snapshotTreeDigest(dirPath: string): Map<string, string> {
  const out = new Map<string, string>();
  const slash = Buffer.from("/");
  const visit = (absBuf: Buffer, relBuf: Buffer): void => {
    const st = lstatSync(absBuf);
    const key = relBuf.toString("hex");
    if (st.isSymbolicLink()) {
      const target = readlinkSync(absBuf, { encoding: "buffer" }) as Buffer;
      out.set(key, `symlink:${st.mode}:${target.toString("hex")}`);
      return;
    }
    if (st.isDirectory()) {
      out.set(key, `dir:${st.mode}`);
      for (const name of readdirSync(absBuf, { encoding: "buffer" }).sort(Buffer.compare)) {
        const nextRel = relBuf.length > 0 ? Buffer.concat([relBuf, slash, name]) : name;
        visit(Buffer.concat([absBuf, slash, name]), nextRel);
      }
      return;
    }
    const hash = createHash("sha256").update(readFileSync(absBuf)).digest("hex");
    out.set(key, `file:${st.mode}:${st.size}:${hash}`);
  };
  if (existsSync(dirPath)) {
    visit(Buffer.from(dirPath, "utf8"), Buffer.alloc(0));
  }
  return out;
}

function listRecursiveEntries(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  const entries: string[] = [];
  const slash = Buffer.from("/");
  const visit = (absBuf: Buffer, relBuf: Buffer): void => {
    for (const name of readdirSync(absBuf, { encoding: "buffer" }).sort(Buffer.compare)) {
      const childAbs = Buffer.concat([absBuf, slash, name]);
      const childRel = relBuf.length > 0 ? Buffer.concat([relBuf, slash, name]) : name;
      entries.push(childRel.toString("latin1"));
      const st = lstatSync(childAbs);
      if (st.isDirectory() && !st.isSymbolicLink()) {
        visit(childAbs, childRel);
      }
    }
  };
  visit(Buffer.from(dirPath, "utf8"), Buffer.alloc(0));
  return entries.sort();
}

function assertTrace2FileSafe(trace2Path: string, recordedLaunches: readonly ProducerGitLaunchRecord[]): void {
  if (!existsSync(trace2Path)) {
    if (recordedLaunches.length === 0) return;
    throw new Error(`L9-E producer Trace2 log missing despite ${recordedLaunches.length} Git launch(es)`);
  }
  const raw = readFileSync(trace2Path, "utf8").trim();
  const events = raw ? raw.split("\n").map((line) => JSON.parse(line) as TraceEvent) : [];
  const children = events.filter((e) => e.event === "child_start");
  if (children.length > 0) {
    throw new Error(`L9-E repository-triggered child process detected: ${JSON.stringify(children)}`);
  }
  const starts = events.filter((e) => e.event === "start");
  if (starts.length !== recordedLaunches.length) {
    throw new Error(`L9-E Git Trace2 start count (${starts.length}) disagrees with recorded launches (${recordedLaunches.length})`);
  }
  const sessions = new Map<string, TraceEvent[]>();
  for (const event of events) {
    if (!event.sid) throw new Error("L9-E incomplete Trace2 event missing sid");
    const bucket = sessions.get(event.sid) ?? [];
    bucket.push(event);
    sessions.set(event.sid, bucket);
  }
  if (sessions.size !== recordedLaunches.length) {
    throw new Error(`L9-E Git Trace2 session count (${sessions.size}) disagrees with launches (${recordedLaunches.length})`);
  }
  for (const [idx, launch] of recordedLaunches.entries()) {
    const sid = starts[idx]!.sid!;
    const session = sessions.get(sid) ?? [];
    const lifecycle = session.filter((e) => e.event === "start" || e.event === "exit" || e.event === "atexit");
    if (lifecycle.length !== 3 || lifecycle[1]!.code !== launch.status || lifecycle[2]!.code !== launch.status) {
      throw new Error(`L9-E incomplete or mismatched Git Trace2 lifecycle for launch ${idx}`);
    }
    if (launch.args.some((a) => a.includes("engram-live-no-hooks-"))) {
      throw new Error(`L9-E fallback hooks directory detected in Git argv: ${JSON.stringify(launch.args)}`);
    }
  }
}

/** Scoped process and artifact boundary tracer for L9-E producer cycles. */
export class ProducerArtifactTrace {
  readonly trace: LiveProcessTrace;
  readonly trace2Path: string;
  private readonly allowedHostDirs: string[];
  private readonly observedRoots: string[];
  private readonly isolatedTmpDir: string | undefined;
  private readonly mustStayEmptyDirs: string[];
  private readonly probeAudit: { readonly probeDir: string; readonly expectedFiles: readonly string[] } | undefined;
  private readonly baselineSnapshots = new Map<string, Map<string, string>>();
  private readonly launches: ProducerGitLaunchRecord[] = [];
  private readonly recordedWrites = new Set<string>();
  private readonly activeReapers = new Set<() => Promise<void>>();

  constructor(options: ProducerArtifactTraceOptions) {
    this.trace = options.trace;
    const baseDir = dirname(options.trace.path);
    this.trace2Path = join(baseDir, `producer-trace2-${Math.random().toString(16).slice(2, 10)}.jsonl`);
    this.allowedHostDirs = options.allowedHostDirs.map(normalizeBoundaryPath);
    this.observedRoots = options.observedRoots.map(normalizeBoundaryPath);
    this.isolatedTmpDir = options.isolatedTmpDir ? normalizeBoundaryPath(options.isolatedTmpDir) : undefined;
    this.mustStayEmptyDirs = (options.mustStayEmptyDirs ?? []).map(normalizeBoundaryPath);
    this.probeAudit = options.probeAudit
      ? {
          probeDir: normalizeBoundaryPath(options.probeAudit.probeDir),
          expectedFiles: [...options.probeAudit.expectedFiles].sort(),
        }
      : undefined;
    for (const rootDir of this.observedRoots) {
      this.baselineSnapshots.set(rootDir, snapshotTreeDigest(rootDir));
    }
  }

  async dispose(): Promise<void> {
    const reapers = [...this.activeReapers];
    this.activeReapers.clear();
    await Promise.allSettled(reapers.map((reap) => reap()));
  }

  recordFileWrite(targetPath: string): void {
    this.recordedWrites.add(normalizeBoundaryPath(targetPath));
  }

  wrapGitPort(options: { disabledHooksDir: string; processTimeoutMs?: number }) {
    const executable = this.trace.executable;
    const trace2Path = this.trace2Path;
    const launches = this.launches;
    const activeReapers = this.activeReapers;
    const hardenedBaseEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      LANG: "C",
      LC_ALL: "C",
      TZ: "UTC",
      HOME: options.disabledHooksDir,
      XDG_CONFIG_HOME: options.disabledHooksDir,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_ATTR_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_NO_LAZY_FETCH: "1",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_GRAFT_FILE: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      GIT_TRACE2_EVENT: trace2Path,
    };

    const gitSpawn = (
      gitPath: string,
      argv: readonly string[],
      spawnOpts: { cwd: string; input?: Buffer | string; env?: NodeJS.ProcessEnv; pathBytes?: Uint8Array },
    ) => {
      const pathBuf = spawnOpts.pathBytes === undefined ? null : Buffer.from(spawnOpts.pathBytes);
      const utf8 = pathBuf?.toString("utf8");
      const raw = pathBuf !== null && !Buffer.from(utf8!, "utf8").equals(pathBuf);
      const encoded = raw ? [...pathBuf!].map((byte) => `\\0${byte.toString(8).padStart(3, "0")}`).join("") : "";
      const effectiveEnv = {
        ...hardenedBaseEnv,
        ...(spawnOpts.env ?? {}),
        HOME: options.disabledHooksDir,
        XDG_CONFIG_HOME: options.disabledHooksDir,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_TRACE2_EVENT: trace2Path,
      };
      const result = spawnSync(raw ? "/bin/sh" : gitPath, raw
        ? ["-c", 'p=$(printf "%b." "$1"); shift; exec "$@" "${p%.}"', "live-blame", encoded, gitPath, ...argv]
        : [...argv, ...(pathBuf === null ? [] : [utf8!])], {
        cwd: spawnOpts.cwd,
        input: spawnOpts.input,
        env: effectiveEnv,
        shell: false,
        maxBuffer: 16 * 1024 * 1024,
        timeout: 30_000,
        killSignal: "SIGKILL",
      });
      if (result.error) throw result.error;
      if (result.status === null) {
        throw new Error(`L9-E Git terminated by ${result.signal ?? "unknown signal"}`);
      }
      const status = result.status;
      launches.push({ executable: gitPath, cwd: spawnOpts.cwd, args: [...argv], status });
      return { status, stdout: result.stdout as Buffer, stderr: result.stderr as Buffer };
    };

    const processPort = {
      async start(launch: { purpose: string; cwd: string; args: readonly string[]; env?: NodeJS.ProcessEnv }) {
        const timeoutMs = options.processTimeoutMs ?? 30_000;
        const child = spawn(executable, launch.args, {
          cwd: launch.cwd,
          env: {
            ...hardenedBaseEnv,
            ...(launch.env ?? {}),
            HOME: options.disabledHooksDir,
            XDG_CONFIG_HOME: options.disabledHooksDir,
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_TRACE2_EVENT: trace2Path,
          },
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
        });
        const destroyStreams = (): void => {
          if (!child.stdin.destroyed) child.stdin.destroy();
          if (!child.stdout.destroyed) child.stdout.destroy();
          if (!child.stderr.destroyed) child.stderr.destroy();
        };
        const stderrChunks: Buffer[] = [];
        const onStderr = (chunk: Buffer): void => {
          stderrChunks.push(chunk);
        };
        child.stderr.on("data", onStderr);
        let closed = false;
        let timedOut = false;
        let killTimer: ReturnType<typeof setTimeout> | undefined;
        let reap!: () => Promise<void>;

        const exited = new Promise<{ code: number; stderr: Uint8Array }>((resolveExit, rejectExit) => {
          const cleanupTimer = (): void => {
            if (killTimer !== undefined) {
              clearTimeout(killTimer);
              killTimer = undefined;
            }
          };
          child.once("error", (error: Error) => {
            closed = true;
            cleanupTimer();
            activeReapers.delete(reap);
            destroyStreams();
            rejectExit(error);
          });
          child.once("close", (code, signal) => {
            closed = true;
            cleanupTimer();
            activeReapers.delete(reap);
            if (timedOut) {
              rejectExit(new Error(`L9-E Git process timed out after ${timeoutMs}ms (${signal ?? "SIGKILL"})`));
              return;
            }
            const status = code ?? -1;
            launches.push({
              executable,
              cwd: launch.cwd,
              args: [...launch.args],
              status,
              purpose: launch.purpose,
            });
            resolveExit({ code: status, stderr: Buffer.concat(stderrChunks) });
          });
        });

        reap = async (): Promise<void> => {
          if (killTimer !== undefined) {
            clearTimeout(killTimer);
            killTimer = undefined;
          }
          if (!closed) {
            try { child.kill("SIGKILL"); } catch { /* ignore */ }
            destroyStreams();
            let reapTimer: ReturnType<typeof setTimeout> | undefined;
            try {
              await Promise.race([
                exited.catch(() => undefined),
                new Promise<void>((res) => {
                  reapTimer = setTimeout(res, 2_000);
                  reapTimer.unref?.();
                }),
              ]);
            } finally {
              if (reapTimer !== undefined) clearTimeout(reapTimer);
            }
          }
        };
        activeReapers.add(reap);

        killTimer = setTimeout(() => {
          if (!closed) {
            timedOut = true;
            try { child.kill("SIGKILL"); } catch { /* ignore */ }
            destroyStreams();
          }
        }, timeoutMs);
        killTimer.unref?.();

        child.stdin.on("error", () => undefined);
        const stdoutChunks: Buffer[] = [];
        let ended = false;
        const wakeups: Array<() => void> = [];
        child.stdout.pause();
        const onStdoutData = (chunk: Buffer): void => {
          stdoutChunks.push(chunk);
          child.stdout.pause();
          for (const wake of wakeups.splice(0)) wake();
        };
        const finish = (): void => {
          ended = true;
          for (const wake of wakeups.splice(0)) wake();
        };
        child.stdout.on("data", onStdoutData);
        child.stdout.once("end", finish);
        child.stdout.once("close", finish);
        child.stdout.once("error", finish);
        const stdout = (async function* (): AsyncGenerator<Uint8Array> {
          try {
            for (;;) {
              while (stdoutChunks.length === 0 && !ended) {
                child.stdout.resume();
                await new Promise<void>((res) => wakeups.push(res));
              }
              if (stdoutChunks.length === 0) return;
              yield stdoutChunks.shift()!;
            }
          } finally {
            ended = true;
            child.stdout.removeListener("data", onStdoutData);
            child.stdout.removeListener("end", finish);
            child.stdout.removeListener("close", finish);
            child.stdout.removeListener("error", finish);
            for (const wake of wakeups.splice(0)) wake();
          }
        })();
        return {
          stdout,
          stdin: {
            async write(chunk: Uint8Array): Promise<void> {
              if (child.stdin.destroyed || child.stdin.writableEnded || !child.stdin.writable) {
                throw new Error("L9-E Git stdin is closed or destroyed");
              }
              await new Promise<void>((resolveWrite, rejectWrite) => {
                let settled = false;
                const cleanup = (): void => {
                  child.stdin.removeListener("error", onError);
                  child.stdin.removeListener("close", onClose);
                  child.stdin.removeListener("drain", onDrain);
                };
                const onError = (error: Error): void => {
                  if (settled) return;
                  settled = true;
                  cleanup();
                  rejectWrite(error);
                };
                const onClose = (): void => {
                  if (settled) return;
                  settled = true;
                  cleanup();
                  rejectWrite(new Error("L9-E Git stdin closed before write completed"));
                };
                const onDrain = (): void => {
                  if (settled) return;
                  settled = true;
                  cleanup();
                  resolveWrite();
                };
                child.stdin.once("error", onError);
                child.stdin.once("close", onClose);
                if (child.stdin.write(chunk)) {
                  onDrain();
                } else {
                  child.stdin.once("drain", onDrain);
                }
              });
            },
            async close(): Promise<void> {
              if (child.stdin.destroyed || child.stdin.writableEnded || child.stdin.writableFinished) {
                return;
              }
              await new Promise<void>((resolveClose) => {
                let settled = false;
                const cleanup = (): void => {
                  child.stdin.removeListener("finish", settle);
                  child.stdin.removeListener("close", settle);
                  child.stdin.removeListener("error", settle);
                };
                const settle = (): void => {
                  if (settled) return;
                  settled = true;
                  cleanup();
                  resolveClose();
                };
                child.stdin.once("finish", settle);
                child.stdin.once("close", settle);
                child.stdin.once("error", settle);
                child.stdin.end(settle);
              });
            },
          },
          exit: exited,
          async abort(): Promise<void> {
            await reap();
          },
        };
      },
    };

    return {
      gitPath: executable,
      disabledHooksDir: options.disabledHooksDir,
      spawn: gitSpawn,
      process: processPort,
    };
  }

  assertSafe(): void {
    this.trace.assertSafe();
    assertTrace2FileSafe(this.trace2Path, this.launches);
  }

  assertBoundaryClean(): void {
    this.assertSafe();
    if (this.isolatedTmpDir !== undefined) {
      const remaining = listRecursiveEntries(this.isolatedTmpDir);
      if (remaining.length > 0) {
        throw new Error(`L9-E temporary directory boundary violated: ${JSON.stringify(remaining)}`);
      }
    }
    for (const emptyDir of this.mustStayEmptyDirs) {
      const entries = listRecursiveEntries(emptyDir);
      if (entries.length > 0) {
        throw new Error(`L9-E injected host directory must remain empty (${emptyDir}): ${JSON.stringify(entries)}`);
      }
    }
    if (this.probeAudit !== undefined) {
      const actualEntries = listRecursiveEntries(this.probeAudit.probeDir);
      const expected = this.probeAudit.expectedFiles;
      if (
        actualEntries.length !== expected.length ||
        actualEntries.some((name, index) => name !== expected[index])
      ) {
        throw new Error(
          `L9-E unexpected file in probeDir (${this.probeAudit.probeDir}): found ${JSON.stringify(actualEntries)}, expected ${JSON.stringify(expected)}`,
        );
      }
    }
    for (const [rootDir, before] of this.baselineSnapshots.entries()) {
      const after = snapshotTreeDigest(rootDir);
      if (before.size !== after.size) {
        throw new Error(`L9-E observed root boundary mutated (entry count ${before.size} -> ${after.size}): ${rootDir}`);
      }
      for (const [relPath, digest] of before.entries()) {
        if (after.get(relPath) !== digest) {
          throw new Error(`L9-E observed root artifact changed (${relPath}): ${rootDir}`);
        }
      }
    }
    for (const writePath of this.recordedWrites) {
      if (writePath.includes("engram-live-no-hooks-")) {
        throw new Error(`L9-E forbidden fallback temp dir write: ${writePath}`);
      }
      const inHostDir = this.allowedHostDirs.some((dir) => isInsideOrEqualBoundary(writePath, dir));
      if (!inHostDir) {
        throw new Error(`L9-E write boundary outside injected host locations: ${writePath}`);
      }
    }
  }

  static async runIsolatedProducerProbe(options: IsolatedProducerProbeOptions): Promise<ProducerArtifactTrace> {
    const probeDir = join(dirname(options.trace.path), `l9e-probe-${Math.random().toString(16).slice(2, 10)}`);
    mkdirSync(probeDir, { recursive: true });
    const eventsPath = join(probeDir, "events.json");
    const launchesPath = join(probeDir, "launches.json");
    const dataPath = join(probeDir, "data.json");
    const runnerPath = join(probeDir, "probe-runner.mjs");

    const boundaryTrace = new ProducerArtifactTrace({
      trace: options.trace,
      allowedHostDirs: options.allowedHostDirs,
      observedRoots: options.observedRoots,
      isolatedTmpDir: options.isolatedTmpDir,
      mustStayEmptyDirs: options.mustStayEmptyDirs ?? [options.hostHomeDir, options.hostXdgDir],
      probeAudit: {
        probeDir,
        expectedFiles: ["data.json", "events.json", "launches.json", "probe-runner.mjs"],
      },
    });

    writeFileSync(
      dataPath,
      JSON.stringify({
        isolatedTmpDir: options.isolatedTmpDir,
        entryModuleUrl: options.entryModuleUrl,
        contractsModuleUrl: options.contractsModuleUrl,
        batchCodecModuleUrl: options.batchCodecModuleUrl,
        generationModuleUrl: options.generationModuleUrl,
        repoRoot: options.repoRoot,
        payload: options.payload,
        gitExecutable: options.trace.executable,
        trace2Path: boundaryTrace.trace2Path,
        eventsPath,
        launchesPath,
      }),
      "utf8",
    );

    const preamble = `
      import { readFileSync as __readFileSync, writeFileSync as __writeFileSync } from "node:fs";
      import { spawn as __spawn, spawnSync as __spawnSync } from "node:child_process";
      const __meta = JSON.parse(__readFileSync(${JSON.stringify(dataPath)}, "utf8"));
      const __recordedLaunches = [];
      const __recordedWrites = [];
      const __activeChildren = new Set();
      const __destroyChildStreams = (child) => {
        try { if (child.stdin && !child.stdin.destroyed) child.stdin.destroy(); } catch {}
        try { if (child.stdout && !child.stdout.destroyed) child.stdout.destroy(); } catch {}
        try { if (child.stderr && !child.stderr.destroyed) child.stderr.destroy(); } catch {}
      };
      const __disposeChildren = async () => {
        const list = [...__activeChildren];
        __activeChildren.clear();
        await Promise.allSettled(list.map((reap) => reap()));
      };
      process.on("exit", () => {
        for (const item of __activeChildren) {
          if (item.child) {
            try { item.child.kill("SIGKILL"); } catch {}
            __destroyChildStreams(item.child);
          }
        }
        __activeChildren.clear();
      });
      const __tracedGitPort = (opts) => {
        const __gitEnv = (extra) => ({
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          LANG: "C",
          LC_ALL: "C",
          TZ: "UTC",
          ...(extra ?? {}),
          HOME: opts.disabledHooksDir,
          XDG_CONFIG_HOME: opts.disabledHooksDir,
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_ATTR_NOSYSTEM: "1",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_NO_LAZY_FETCH: "1",
          GIT_NO_REPLACE_OBJECTS: "1",
          GIT_GRAFT_FILE: "/dev/null",
          GIT_TERMINAL_PROMPT: "0",
          GIT_TRACE2_EVENT: __meta.trace2Path,
        });
        return {
        gitPath: __meta.gitExecutable,
        disabledHooksDir: opts.disabledHooksDir,
        spawn(gitPath, argv, spawnOpts) {
          const pathBuf = spawnOpts.pathBytes === undefined ? null : Buffer.from(spawnOpts.pathBytes);
          const utf8 = pathBuf === null ? undefined : pathBuf.toString("utf8");
          const raw = pathBuf !== null && !Buffer.from(utf8, "utf8").equals(pathBuf);
          const encoded = raw ? [...pathBuf].map((b) => "\\\\0" + b.toString(8).padStart(3, "0")).join("") : "";
          const result = __spawnSync(raw ? "/bin/sh" : gitPath, raw
            ? ["-c", 'p=$(printf "%b." "$1"); shift; exec "$@" "\${p%.}"', "live-blame", encoded, gitPath, ...argv]
            : [...argv, ...(pathBuf === null ? [] : [utf8])], {
            cwd: spawnOpts.cwd,
            input: spawnOpts.input,
            env: __gitEnv(spawnOpts.env),
            shell: false,
            maxBuffer: 16 * 1024 * 1024,
            timeout: 30_000,
            killSignal: "SIGKILL",
          });
          if (result.error) throw result.error;
          if (result.status === null) {
            throw new Error("L9-E Git terminated by " + (result.signal ?? "unknown signal"));
          }
          const status = result.status;
          __recordedLaunches.push({ executable: gitPath, cwd: spawnOpts.cwd, args: [...argv], status });
          return { status, stdout: result.stdout, stderr: result.stderr };
        },
        process: {
          async start(launch) {
            const timeoutMs = opts.processTimeoutMs ?? 30_000;
            const child = __spawn(__meta.gitExecutable, launch.args, {
              cwd: launch.cwd,
              env: __gitEnv(launch.env),
              shell: false,
              stdio: ["pipe", "pipe", "pipe"],
            });
            const stderrChunks = [];
            child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
            let closed = false;
            let timedOut = false;
            let killTimer;
            let reapEntry;
            const exited = new Promise((resolveExit, rejectExit) => {
              const clearTimer = () => {
                if (killTimer !== undefined) {
                  clearTimeout(killTimer);
                  killTimer = undefined;
                }
              };
              child.once("error", (err) => {
                closed = true;
                clearTimer();
                __activeChildren.delete(reapEntry);
                __destroyChildStreams(child);
                rejectExit(err);
              });
              child.once("close", (code, signal) => {
                closed = true;
                clearTimer();
                __activeChildren.delete(reapEntry);
                if (timedOut) {
                  rejectExit(new Error("L9-E Git process timed out after " + timeoutMs + "ms (" + (signal ?? "SIGKILL") + ")"));
                  return;
                }
                const status = code ?? -1;
                __recordedLaunches.push({
                  executable: __meta.gitExecutable,
                  cwd: launch.cwd,
                  args: [...launch.args],
                  status,
                  purpose: launch.purpose,
                });
                resolveExit({ code: status, stderr: Buffer.concat(stderrChunks) });
              });
            });
            const reapFn = async () => {
              if (killTimer !== undefined) {
                clearTimeout(killTimer);
                killTimer = undefined;
              }
              if (!closed) {
                try { child.kill("SIGKILL"); } catch {}
                __destroyChildStreams(child);
                let reapTimer;
                try {
                  await Promise.race([
                    exited.catch(() => undefined),
                    new Promise((r) => {
                      reapTimer = setTimeout(r, 2_000);
                      reapTimer.unref?.();
                    }),
                  ]);
                } finally {
                  if (reapTimer !== undefined) clearTimeout(reapTimer);
                }
              }
            };
            reapEntry = Object.assign(reapFn, { child });
            __activeChildren.add(reapEntry);
            killTimer = setTimeout(() => {
              if (!closed) {
                timedOut = true;
                try { child.kill("SIGKILL"); } catch {}
                __destroyChildStreams(child);
              }
            }, timeoutMs);
            killTimer.unref?.();

            child.stdin.on("error", () => undefined);
            const stdoutChunks = [];
            let ended = false;
            const wakeups = [];
            child.stdout.pause();
            const onStdoutData = (chunk) => {
              stdoutChunks.push(chunk);
              child.stdout.pause();
              for (const wake of wakeups.splice(0)) wake();
            };
            const finish = () => {
              ended = true;
              for (const wake of wakeups.splice(0)) wake();
            };
            child.stdout.on("data", onStdoutData);
            child.stdout.once("end", finish);
            child.stdout.once("close", finish);
            child.stdout.once("error", finish);
            const stdout = (async function* () {
              try {
                for (;;) {
                  while (stdoutChunks.length === 0 && !ended) {
                    child.stdout.resume();
                    await new Promise((res) => wakeups.push(res));
                  }
                  if (stdoutChunks.length === 0) return;
                  yield stdoutChunks.shift();
                }
              } finally {
                ended = true;
                child.stdout.removeListener("data", onStdoutData);
                child.stdout.removeListener("end", finish);
                child.stdout.removeListener("close", finish);
                child.stdout.removeListener("error", finish);
                for (const wake of wakeups.splice(0)) wake();
              }
            })();
            return {
              stdout,
              stdin: {
                async write(chunk) {
                  if (child.stdin.destroyed || child.stdin.writableEnded || !child.stdin.writable) {
                    throw new Error("L9-E Git stdin is closed or destroyed");
                  }
                  await new Promise((resolveWrite, rejectWrite) => {
                    let settled = false;
                    const cleanup = () => {
                      child.stdin.removeListener("error", onError);
                      child.stdin.removeListener("close", onClose);
                      child.stdin.removeListener("drain", onDrain);
                    };
                    const onError = (error) => {
                      if (settled) return;
                      settled = true;
                      cleanup();
                      rejectWrite(error);
                    };
                    const onClose = () => {
                      if (settled) return;
                      settled = true;
                      cleanup();
                      rejectWrite(new Error("L9-E Git stdin closed before write completed"));
                    };
                    const onDrain = () => {
                      if (settled) return;
                      settled = true;
                      cleanup();
                      resolveWrite();
                    };
                    child.stdin.once("error", onError);
                    child.stdin.once("close", onClose);
                    if (child.stdin.write(chunk)) onDrain();
                    else child.stdin.once("drain", onDrain);
                  });
                },
                async close() {
                  if (child.stdin.destroyed || child.stdin.writableEnded || child.stdin.writableFinished) {
                    return;
                  }
                  await new Promise((resolveClose) => {
                    let settled = false;
                    const cleanup = () => {
                      child.stdin.removeListener("finish", settle);
                      child.stdin.removeListener("close", settle);
                      child.stdin.removeListener("error", settle);
                    };
                    const settle = () => {
                      if (settled) return;
                      settled = true;
                      cleanup();
                      resolveClose();
                    };
                    child.stdin.once("finish", settle);
                    child.stdin.once("close", settle);
                    child.stdin.once("error", settle);
                    child.stdin.end(settle);
                  });
                },
              },
              exit: exited,
              async abort() {
                await reapFn();
              },
            };
          },
        },
      };
      };
      const DATA = {
        ...__meta,
        tracedGitPort: __tracedGitPort,
        recordWrite(p) { __recordedWrites.push(String(p)); },
      };
    `;
    const epilogue = `
      await __disposeChildren();
      __writeFileSync(__meta.launchesPath, JSON.stringify(__recordedLaunches), "utf8");
      __writeFileSync(__meta.eventsPath, JSON.stringify(__recordedWrites), "utf8");
    `;
    writeFileSync(runnerPath, `${preamble}\n${options.scriptBody}\n${epilogue}\n`, "utf8");

    const writableRoots = new Set<string>();
    for (const candidate of [...(options.writableHostDirs ?? options.allowedHostDirs), probeDir, options.isolatedTmpDir]) {
      const normalized = normalizeBoundaryPath(candidate);
      writableRoots.add(normalized);
      try {
        writableRoots.add(realpathSync(normalized));
      } catch {
        /* ignore unresolved paths */
      }
    }
    const permissionArgs = [
      "--permission",
      "--allow-fs-read=*",
      ...[...writableRoots].map((dirPath) => `--allow-fs-write=${dirPath}`),
      "--allow-child-process",
    ];
    const timeoutMs = options.timeoutMs ?? 20_000;
    const maxBuffer = 16 * 1024 * 1024;

    await new Promise<void>((resolveProbe, rejectProbe) => {
      const child = spawn(process.execPath, [...permissionArgs, runnerPath], {
        cwd: probeDir,
        detached: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_PATH: "",
          TMPDIR: options.isolatedTmpDir,
          TMP: options.isolatedTmpDir,
          TEMP: options.isolatedTmpDir,
          HOME: options.hostHomeDir,
          XDG_CONFIG_HOME: options.hostXdgDir,
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_TRACE2_EVENT: boundaryTrace.trace2Path,
        },
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;
      let timedOut = false;
      let bufferExceeded = false;
      let closed = false;

      const killProcessGroup = (): void => {
        if (child.pid !== undefined) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            try {
              child.kill("SIGKILL");
            } catch {
              /* already exited */
            }
          }
        } else {
          try {
            child.kill("SIGKILL");
          } catch {
            /* already exited */
          }
        }
        if (child.stdout && !child.stdout.destroyed) child.stdout.destroy();
        if (child.stderr && !child.stderr.destroyed) child.stderr.destroy();
      };

      const finishTimer = setTimeout(() => {
        if (closed) return;
        timedOut = true;
        killProcessGroup();
      }, timeoutMs);
      finishTimer.unref?.();

      const onData = (bucket: Buffer[]) => (chunk: Buffer): void => {
        totalBytes += chunk.byteLength;
        if (totalBytes > maxBuffer) {
          bufferExceeded = true;
          killProcessGroup();
          return;
        }
        bucket.push(chunk);
      };
      child.stdout.on("data", onData(stdoutChunks));
      child.stderr.on("data", onData(stderrChunks));

      child.once("error", (error: Error) => {
        closed = true;
        clearTimeout(finishTimer);
        killProcessGroup();
        if (!settled) {
          settled = true;
          rejectProbe(error);
        }
      });

      child.once("close", (code, signal) => {
        closed = true;
        clearTimeout(finishTimer);
        if (settled) return;
        settled = true;
        const stdout = Buffer.concat(stdoutChunks).toString("utf8");
        const stderr = Buffer.concat(stderrChunks).toString("utf8");
        if (timedOut) {
          rejectProbe(new Error(`L9-E isolated producer probe timed out after ${timeoutMs}ms (SIGKILL):\n${stdout}\n${stderr}`));
          return;
        }
        if (bufferExceeded) {
          rejectProbe(new Error(`L9-E isolated producer probe exceeded maxBuffer (${maxBuffer} bytes)`));
          return;
        }
        if (signal !== null || code !== 0) {
          rejectProbe(
            new Error(`L9-E isolated producer probe failed (exit ${String(code)}, signal ${String(signal)}):\n${stdout}\n${stderr}`),
          );
          return;
        }
        resolveProbe();
      });
    });

    const recordedLaunches = JSON.parse(readFileSync(launchesPath, "utf8")) as ProducerGitLaunchRecord[];
    const recordedWrites = JSON.parse(readFileSync(eventsPath, "utf8")) as string[];
    for (const item of recordedLaunches) boundaryTrace.launches.push(item);
    for (const item of recordedWrites) boundaryTrace.recordFileWrite(item);
    return boundaryTrace;
  }
}
