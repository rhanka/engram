import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join } from "node:path";
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
