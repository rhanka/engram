// @sentropic/engram-live/git-executor — safe Git invocation policy
// (spec/SPEC_LIVE_GIT_INDEXING.md §7; plan/09 L4a).
//
// The collector only ever runs allow-listed read-only Git commands in exact
// argument forms: cat-file is limited to raw reads (-p/blob/commit/tree/-s/-t with a hex
// object id, never --filters/--textconv/--path), hash-object runs only in
// its exact form hash-object --no-filters --stdin, symbolic-ref
// is limited to its read form. Every invocation carries --no-optional-locks,
// a disabled fsmonitor and a disabled hook path, and never performs a lazy
// fetch. Every attribute and configuration source outside the repository —
// system and global config, system attributes, global/XDG attributes,
// ambient GIT_ATTR_SOURCE or config injection — is neutralized (isolated
// HOME/XDG_CONFIG_HOME, GIT_CONFIG_NOSYSTEM/GIT_ATTR_NOSYSTEM,
// GIT_CONFIG_GLOBAL=/dev/null, -c core.attributesFile=/dev/null,
// -c core.excludesFile=/dev/null), so Git evaluates repository attributes
// and repository ignore files only. The one source that cannot be
// neutralized from the command line is the repository's own configuration:
// Git loads it during repository discovery on every invocation, and an
// include.path or includeIf.<cond>.path directive inside it — absolute, or
// relative to the config file's directory, with any key casing — would make
// Git read files outside the repository while parsing. The executor
// therefore refuses to collect from a repository whose local configuration
// declares any include directive (assertNoConfigIncludes, a probe run
// outside any repository against the named config file only, with include
// following off). Since the gate only proves the state of the configuration
// at probe time, every capture round re-probes it at the END of the round
// (probeNoConfigIncludes, the non-throwing twin): a directive wired in
// after the round's start gate — followed by the round's own invocations —
// or any other change of the gated files rejects that round and re-runs
// the observation, publishing nothing from it (review sol5). The command-
// line -c hardening keeps its precedence over any included value.
// Anything else — update-index, write-tree,
// checkout, status preflights, diff with ext-diff/textconv, config writes,
// network commands, output redirects — is refused before any process is
// spawned. The executor never deletes index.lock.
// G1 additionally admits native-blame-options/1 only through blame(): full
// OID, ordered numeric ranges, explicit move/copy thresholds and a literal
// final byte path. Its configuration gate also refuses ignored-revision
// files before Git could open them; run()/probe() cannot bypass that gate.

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface GitSpawnResult {
  readonly status: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

export interface GitSpawnOptions {
  readonly cwd: string;
  readonly input?: Buffer | string;
  /** Per-invocation environment merged over the isolated base environment
   * (used for the index-context attribute runs: GIT_DIR/GIT_WORK_TREE). */
  readonly env?: NodeJS.ProcessEnv;
  /** Byte-exact final argv element, used ONLY by the separately admitted
   * blame form. Injected launchers must append it without UTF-8 decoding. */
  readonly pathBytes?: Uint8Array;
}

export type GitSpawnFn = (
  gitPath: string,
  argv: readonly string[],
  options: GitSpawnOptions,
) => GitSpawnResult;

export interface SafeGitOptions {
  readonly gitPath: string;
  readonly disabledHooksDir?: string;
  readonly spawn?: GitSpawnFn;
  readonly env?: NodeJS.ProcessEnv;
}

export interface SafeGitExecutor {
  readonly gitPath: string;
  readonly disabledHooksDir: string;
  probe(cwd: string, args: readonly string[], input?: Buffer | string, env?: NodeJS.ProcessEnv): GitSpawnResult;
  run(cwd: string, args: readonly string[], input?: Buffer | string, env?: NodeJS.ProcessEnv): Buffer;
  /** args ends at `--`; the validated raw path is the final argv element.
   * Common/worktree config must pass the attribution-specific file gate. */
  blame(cwd: string, args: readonly string[], path: Uint8Array, configPaths: readonly string[]): Buffer;
  /** Refuses to collect when one of the repository's local configuration
   * files (common config, worktree config) declares an include/includeIf
   * directive: Git loads them on every invocation and would follow the
   * directive to files outside the repository. The probe runs outside any
   * repository, against the named file only, with include following off
   * (--file mode defaults to it). forBlame additionally refuses configured
   * ignore-revision files, which Git opens before processing reset flags. */
  assertNoConfigIncludes(configPaths: readonly string[], forBlame?: boolean): void;
  /** Non-throwing twin of the gate, used for the end-of-snapshot
   * configuration re-probe (review sol5): false whenever one of the
   * named local configuration files declares an include/includeIf
   * directive or the probe itself fails. The caller then rejects the
   * round and re-runs the observation instead of publishing its data;
   * a directive persisting into the next round is refused by the gate. */
  probeNoConfigIncludes(configPaths: readonly string[], forBlame?: boolean): boolean;
}

// Fail-closed allow-list: read-only plumbing the L4a capture needs. Every
// other command word — including status (never a capture preflight),
// update-index, write-tree, checkout/reset, config, the diff family and
// network commands — is refused before spawning.
const ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
  "--version",
  "blame",
  "cat-file",
  "check-attr",
  "count-objects",
  "for-each-ref",
  "hash-object",
  "ls-files",
  "ls-tree",
  "merge-base",
  "rev-parse",
  "rev-list",
  "show-ref",
  "symbolic-ref",
]);

const RAW_CAT_FILE_VERBS: ReadonlySet<string> = new Set(["-p", "blob", "commit", "tree", "-s", "-t"]);
const HEX_OID = /^[0-9a-f]{40,64}$/;
const FULL_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REFUSED_TOKENS = ["--textconv", "--ext-diff", "--stdin-paths", "--filters"];

// Per-invocation environment overrides are limited to the index-context
// directory pair; any other variable (an external attribute or config
// source among them) is refused before spawning.
const PER_INVOCATION_ENV_KEYS: ReadonlySet<string> = new Set(["GIT_DIR", "GIT_WORK_TREE"]);

function refused(command: string, detail: string): Error {
  return new Error(
    `live-git: refused Git invocation "${command}" (${detail}; ` +
      "the collector runs exact raw read forms only)",
  );
}

function validatePerInvocationEnv(env: NodeJS.ProcessEnv | undefined, command: string): void {
  for (const key of Object.keys(env ?? {})) {
    if (!PER_INVOCATION_ENV_KEYS.has(key)) {
      throw new Error(
        `live-git: refused Git invocation "${command}" (per-invocation environment variable ` +
          `"${key}" is outside the GIT_DIR/GIT_WORK_TREE context pair; attribute and config ` +
          "sources stay repository-bound)",
      );
    }
  }
}

function validateInvocation(args: readonly string[], input?: Buffer | string): void {
  const command = args[0] as string;
  for (const token of args) {
    if (REFUSED_TOKENS.includes(token) || token.startsWith("--output")) {
      throw refused(command, `argument "${token}" is conversion-bearing or output-writing`);
    }
  }
  if (command === "blame") {
    // native-blame-options/1: no revision expressions, reverse/first-parent,
    // contents files, ignored revisions, textconv or caller-selected flags.
    const fixed = ["blame", "--root", "--line-porcelain", "--no-textconv", "--no-progress",
      "--encoding=none", "--ignore-revs-file", "", "--diff-algorithm=myers", "--no-indent-heuristic"];
    let i = fixed.length;
    if (!fixed.every((arg, index) => args[index] === arg)) throw refused(command, "requires native-blame-options/1 exact porcelain form");
    const score = /^-[MC][1-9][0-9]{0,5}$/;
    const hasMove = args[i]?.startsWith("-M") && score.test(args[i]!);
    if (hasMove) i++;
    const copies: string[] = [];
    while (args[i]?.startsWith("-C") && score.test(args[i]!)) copies.push(args[i++]!);
    if (copies.length && !hasMove) throw refused(command, "copy detection requires an explicit move threshold");
    if (copies.length > 3 || copies.some(arg => arg !== copies[0])) throw refused(command, "copy search requires one to three identical thresholds");
    let lastEnd = 0;
    let count = 0;
    while (args[i] === "-L") {
      const range = /^([1-9][0-9]*),([1-9][0-9]*)$/.exec(args[i + 1] ?? "");
      const start = Number(range?.[1]), end = Number(range?.[2]);
      if (!range || !Number.isSafeInteger(end) || start <= lastEnd || start > end) throw refused(command, "requires ordered positive inclusive ranges");
      lastEnd = end; count++; i += 2;
    }
    if (!count || args.length !== i + 3 || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(args[i] ?? "") || args[i + 1] !== "--") {
      throw refused(command, "requires ranges, one full OID, -- and one literal path");
    }
    assertBlamePath(Buffer.from(args[i + 2]!));
    return;
  }
  if (command === "cat-file") {
    // Raw batches admit only a bounded stdin list of full literal OIDs;
    // no revision/path expressions, custom formats or conversion flags.
    if (args.length === 2 && args[1] === "--batch") {
      const bytes = input === undefined ? Buffer.alloc(0) : Buffer.from(input);
      const ids = bytes.toString("latin1").split("\n");
      if (bytes.length > 65 * 128 || ids.pop() !== "" || !ids.length || ids.length > 128 || !ids.every(oid => FULL_OID.test(oid))) {
        throw refused(command, "raw batches require 1 to 128 newline-terminated full OIDs");
      }
      return;
    }
    // Other raw object reads: no --filters/--textconv/--path forms.
    if (args.length !== 3 || !RAW_CAT_FILE_VERBS.has(args[1] as string) || !HEX_OID.test(args[2] as string)) {
      throw refused(command, "cat-file is limited to cat-file -p|blob|commit|tree|-s|-t <hex-oid>");
    }
    return;
  }
  if (command === "rev-list") {
    if (args.length !== 3 || !FULL_OID.test(args[1] ?? "") || args[2] !== "--") {
      throw refused(command, "ancestry listing requires one full OID followed by --");
    }
    return;
  }
  if (command === "merge-base") {
    if (args.length !== 4 || args[1] !== "--is-ancestor" || !args.slice(2).every(oid => FULL_OID.test(oid))) {
      throw refused(command, "retention membership requires --is-ancestor and two full OIDs");
    }
    return;
  }
  if (command === "hash-object") {
    // Exact raw stdin form only: on the same command line --filters would
    // re-enable the repository clean filter (verified on Git 2.53), so the
    // presence of --no-filters proves nothing. Every other arrangement —
    // writing, path-bearing, type-flag or filter-reactivating — is refused
    // before any process is spawned (review sol2 constat 3).
    if (args.length !== 3 || args[1] !== "--no-filters" || args[2] !== "--stdin") {
      throw refused(command, "hash-object is limited to its exact form hash-object --no-filters --stdin");
    }
    return;
  }
  if (command === "symbolic-ref") {
    // symbolic-ref HEAD <target> would write a ref: only the read form runs.
    if (args.length !== 2 || (args[1] as string).startsWith("-")) {
      throw refused(command, "symbolic-ref is limited to its read form symbolic-ref <ref>");
    }
    return;
  }
}

function assertBlamePath(path: Uint8Array): void {
  const bytes = Buffer.from(path);
  if (!bytes.length || bytes.includes(0) || bytes[0] === 47 ||
      bytes.toString("latin1").split("/").some(part => !part || part === "." || part === "..")) {
    throw refused("blame", "requires one literal repository-relative byte path");
  }
}

function defaultSpawn(gitPath: string, argv: readonly string[], options: GitSpawnOptions, baseEnv: NodeJS.ProcessEnv): GitSpawnResult {
  const path = options.pathBytes === undefined ? null : Buffer.from(options.pathBytes);
  const utf8 = path?.toString("utf8");
  const raw = path !== null && !Buffer.from(utf8!, "utf8").equals(path);
  // Node's argv strings cannot carry invalid UTF-8. On the qualified Linux
  // platform a fixed system-shell trampoline decodes ONLY octal data, then
  // execs the approved Git executable. No eval, interpolation into code or
  // repository executable; the sentinel preserves trailing newlines too.
  const encoded = raw ? [...path!].map(byte => `\\0${byte.toString(8).padStart(3, "0")}`).join("") : "";
  const result = spawnSync(raw ? "/bin/sh" : gitPath, raw
    ? ["-c", 'p=$(printf "%b." "$1"); shift; exec "$@" "${p%.}"', "live-blame", encoded, gitPath, ...argv]
    : [...argv, ...(path === null ? [] : [utf8!])], {
    cwd: options.cwd,
    input: options.input,
    env: options.env ? { ...baseEnv, ...options.env } : baseEnv,
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000,
    killSignal: "SIGKILL",
  });
  if (result.error) throw new Error(`live-git: Git subprocess unavailable: ${(result.error as Error).message}`);
  if (result.status === null) throw new Error(`live-git: Git terminated by ${result.signal}`);
  return { status: result.status, stdout: result.stdout as Buffer, stderr: result.stderr as Buffer };
}

export function createSafeGitExecutor(options: SafeGitOptions): SafeGitExecutor {
  if (!options.gitPath) throw new Error("live-git: a resolved Git executable path is required");
  const disabledHooksDir = options.disabledHooksDir ?? mkdtempSync(join(tmpdir(), "engram-live-no-hooks-"));
  const baseEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
    ...options.env,
    // Non-overridable hardening, applied after any caller environment: no
    // attribute or configuration source outside the repository survives
    // into an invocation (review sol3 major). HOME/XDG_CONFIG_HOME point at
    // the empty hooks directory, the global config file and the global
    // attributes default are neutralized, the system files are disabled,
    // and environment-borne sources are scrubbed below.
    HOME: disabledHooksDir,
    XDG_CONFIG_HOME: disabledHooksDir,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_GRAFT_FILE: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const key of Object.keys(baseEnv)) {
    if (
      key === "GIT_ATTR_SOURCE" ||
      key === "GIT_CONFIG_COUNT" ||
      key === "GIT_CONFIG_PARAMETERS" ||
      key === "GIT_CONFIG_SYSTEM" ||
      key.startsWith("GIT_CONFIG_KEY_") ||
      key.startsWith("GIT_CONFIG_VALUE_")
    ) {
      delete baseEnv[key];
    }
  }
  const spawnWithEnv: GitSpawnFn = options.spawn
    ? options.spawn
    : (gitPath, argv, spawnOptions) => defaultSpawn(gitPath, argv, spawnOptions, baseEnv);

  // Shared hardening prefix: no pager, no optional locks, no hooks, no
  // fsmonitor, no gc/maintenance, no network, and no attribute or ignore
  // source outside the repository even when one is wired into the
  // repository's own configuration (single-valued overrides at the
  // highest precedence).
  const hardeningArgs = [
    "--no-pager",
    "--no-optional-locks",
    "-c",
    "core.fsmonitor=false",
    "-c",
    `core.hooksPath=${disabledHooksDir}`,
    "-c",
    "core.attributesFile=/dev/null",
    "-c",
    "core.excludesFile=/dev/null",
    "-c",
    "gc.auto=0",
    "-c",
    "maintenance.auto=false",
    "-c",
    "protocol.allow=never",
    "-c",
    "core.quotePath=true",
    "-c",
    "mailmap.file=/dev/null",
    "-c",
    "mailmap.blob=",
  ];

  function buildArgv(args: readonly string[], input?: Buffer | string): string[] {
    if (args.length === 0) throw new Error("live-git: refused empty Git invocation");
    const command = args[0] as string;
    if (!ALLOWED_COMMANDS.has(command)) {
      throw new Error(
        `live-git: refused Git command "${command}" (collector runs allow-listed reads only; ` +
          "no update-index, write-tree, checkout/reset, status preflight, config, worktree mutation or network command)",
      );
    }
    validateInvocation(args, input);
    return [...hardeningArgs, ...args];
  }

  // Shared probe of one gated configuration file: outside any repository
  // (the empty hooks directory), against the named file only, with include
  // following off (--file mode defaults to it). The repository's own
  // configuration is the one out-of-repository read source that no
  // command-line flag can neutralize: Git loads the local configuration
  // during repository discovery on EVERY invocation — before any
  // --no-includes policy of the command itself applies (verified on Git
  // 2.53: `config --no-includes --local` still follows includes) — and
  // an include.path or includeIf.<cond>.path directive inside it, absolute
  // or relative to the config file's directory, makes Git read files
  // outside the repository while parsing. An in-repository --local probe
  // would itself follow the directive during discovery, so the gate and
  // the end-of-snapshot re-probe both use the --file form. Directive
  // targets are never inspected or resolved: an include pointing anywhere,
  // even inside the repository, is refused. Git normalizes section and
  // key casing while parsing, so any written casing of include/includeIf
  // matches ^include.
  const includeDirectivesIn = (configPath: string): GitSpawnResult =>
    spawnWithEnv(options.gitPath, [
      ...hardeningArgs,
      "config",
      "--file",
      configPath,
      "--no-includes",
      "--get-regexp",
      "^include",
    ], { cwd: disabledHooksDir });

  // blame.ignoreRevsFile is multivalued: neither a later -c empty value nor
  // --ignore-revs-file "" prevents Git from OPENING earlier configured files.
  // For attribution only, refuse the key before repository discovery/blame.
  const blameFileConfigIn = (configPath: string): GitSpawnResult =>
    spawnWithEnv(options.gitPath, [...hardeningArgs, "config", "--file", configPath,
      "--no-includes", "--get-all", "blame.ignoreRevsFile"], { cwd: disabledHooksDir });

  function assertNoConfigIncludes(configPaths: readonly string[], forBlame = false): void {
    // Any include directive found in a gated file refuses the capture
    // outright (review sol4 major).
    for (const configPath of configPaths) {
      const result = includeDirectivesIn(configPath);
      if (result.status === 1) {
        if (forBlame && blameFileConfigIn(configPath).status !== 1) {
          throw refused("blame", "repository declares blame.ignoreRevsFile or its configuration cannot be gated");
        }
        continue; // no include/includeIf directive at all
      }
      if (result.status === 0) {
        throw new Error(
          "live-git: refused capture: the repository configuration declares include/includeIf " +
            `directives (${configPath}: ${result.stdout.toString("utf8").trim()}); the collector reads no ` +
            "configuration or attribute file outside the repository",
        );
      }
      throw new Error(`live-git: include gate failed (${configPath}, ${result.status}): ${result.stderr.toString()}`);
    }
  }

  function probeNoConfigIncludes(configPaths: readonly string[], forBlame = false): boolean {
    // Fail-closed re-probe (review sol5): a directive found after a round's
    // start gate — or any probe failure — invalidates that round only.
    return configPaths.every((configPath) => includeDirectivesIn(configPath).status === 1 &&
      (!forBlame || blameFileConfigIn(configPath).status === 1));
  }

  return {
    gitPath: options.gitPath,
    disabledHooksDir,
    assertNoConfigIncludes,
    probeNoConfigIncludes,
    probe(cwd: string, args: readonly string[], input?: Buffer | string, env?: NodeJS.ProcessEnv): GitSpawnResult {
      if (args[0] === "blame") throw refused("blame", "requires the separately gated byte-path blame method");
      const argv = buildArgv(args, input);
      validatePerInvocationEnv(env, args[0] as string);
      return spawnWithEnv(options.gitPath, argv, { cwd, input, env });
    },
    run(cwd: string, args: readonly string[], input?: Buffer | string, env?: NodeJS.ProcessEnv): Buffer {
      if (args[0] === "blame") throw refused("blame", "requires the separately gated byte-path blame method");
      const argv = buildArgv(args, input);
      validatePerInvocationEnv(env, args[0] as string);
      const result = spawnWithEnv(options.gitPath, argv, { cwd, input, env });
      if (result.status !== 0) {
        throw new Error(`live-git: git ${args.join(" ")} failed (${result.status}): ${result.stderr.toString()}`);
      }
      return result.stdout;
    },
    blame(cwd, args, path, configPaths) {
      if (args[0] !== "blame") throw refused("blame", "requires the separately admitted blame command");
      assertBlamePath(path);
      const argv = buildArgv([...args, "byte-path"]).slice(0, -1);
      if (!configPaths?.length) throw refused("blame", "requires gated retained-view configuration paths");
      assertNoConfigIncludes(configPaths, true);
      const result = spawnWithEnv(options.gitPath, argv, { cwd, pathBytes: Buffer.from(path) });
      if (result.status !== 0) throw new Error("live-git: retained blame objects unavailable");
      return result.stdout;
    },
  };
}
