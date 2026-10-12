/**
 * Git hook integration.
 *
 * Git owns the repository topology. Resolve worktree roots and hook paths with
 * `git rev-parse` so linked worktrees and gitfiles do not break installation.
 */
import { spawnSync } from "node:child_process";
import { accessSync, chmodSync, closeSync, constants, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Dirent } from "node:fs";
import { execGit, resolveFromGitCwd, resolveGitContext, safeExecGit } from "./git.js";
import type { GitContext } from "./git.js";

const POST_COMMIT_MARKER = "# graphify-hook-start";
const POST_COMMIT_MARKER_END = "# graphify-hook-end";
const POST_CHECKOUT_MARKER = "# graphify-checkout-hook-start";
const POST_CHECKOUT_MARKER_END = "# graphify-checkout-hook-end";
const POST_MERGE_MARKER = "# graphify-post-merge-hook-start";
const POST_MERGE_MARKER_END = "# graphify-post-merge-hook-end";
const POST_REWRITE_MARKER = "# graphify-post-rewrite-hook-start";
const POST_REWRITE_MARKER_END = "# graphify-post-rewrite-hook-end";

interface HookDefinition {
  name: string;
  marker: string;
  markerEnd: string;
  script: string;
}

const HOOK_HELPERS = `
# Shared graphify hook helpers. Hooks are advisory and must not block git.
graphify_should_skip() {
    GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
    [ -z "$GIT_DIR" ] && return 1
    [ -d "$GIT_DIR/rebase-merge" ] && return 0
    [ -d "$GIT_DIR/rebase-apply" ] && return 0
    [ -f "$GIT_DIR/MERGE_HEAD" ] && return 0
    [ -f "$GIT_DIR/CHERRY_PICK_HEAD" ] && return 0
    return 1
}

graphify_has_state() {
    [ -f ".graphify/graph.json" ] || [ -f "graphify-out/graph.json" ] || [ -d ".graphify" ] || [ -d "graphify-out" ]
}

graphify_mark_stale() {
    GRAPHIFY_STALE_REASON=\${1:-hook}
    mkdir -p ".graphify"
    printf "1\\n" > ".graphify/needs_update"
    if graphify_detect_cmd; then
        $GRAPHIFY_CMD hook-mark-stale "$GRAPHIFY_STALE_REASON" >/dev/null 2>&1 || true
    fi
}

graphify_detect_cmd() {
    if command -v graphify >/dev/null 2>&1; then
        GRAPHIFY_CMD="graphify"
        return 0
    fi
    echo "[graphify hook] graphify not found. Install with: npm install -g @sentropic/graphify"
    return 1
}

graphify_rebuild_code() {
    graphify_detect_cmd || return 0
    if [ -n "\${XDG_CACHE_HOME:-}" ]; then
        GRAPHIFY_CACHE_DIR="$XDG_CACHE_HOME/graphify"
    elif [ -n "\${LOCALAPPDATA:-}" ]; then
        GRAPHIFY_CACHE_DIR="$LOCALAPPDATA/graphify"
    elif [ -n "\${HOME:-}" ]; then
        GRAPHIFY_CACHE_DIR="$HOME/.cache/graphify"
    else
        GRAPHIFY_CACHE_DIR=".graphify"
    fi
    GRAPHIFY_LOG="$GRAPHIFY_CACHE_DIR/rebuild.log"
    mkdir -p "$GRAPHIFY_CACHE_DIR"
    if command -v nohup >/dev/null 2>&1; then
        nohup sh -c "$GRAPHIFY_CMD hook-rebuild || true" > "$GRAPHIFY_LOG" 2>&1 < /dev/null &
    else
        sh -c "$GRAPHIFY_CMD hook-rebuild || true" > "$GRAPHIFY_LOG" 2>&1 < /dev/null &
    fi
    disown 2>/dev/null || true
}
`;

const POST_COMMIT_SCRIPT = `${POST_COMMIT_MARKER}
# Marks graph state stale and rebuilds code-only graph after each commit.
# Installed by: graphify hook install

${HOOK_HELPERS}
graphify_should_skip && exit 0

CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null || true)
if [ -z "$CHANGED" ]; then
    exit 0
fi

graphify_mark_stale "post-commit"
export GRAPHIFY_CHANGED="$CHANGED"
graphify_rebuild_code
${POST_COMMIT_MARKER_END}
`;

const POST_CHECKOUT_SCRIPT = `${POST_CHECKOUT_MARKER}
# Marks graph state stale when switching branches and optionally rebuilds code-only graph.
# Installed by: graphify hook install

PREV_HEAD=$1
NEW_HEAD=$2
BRANCH_SWITCH=$3

# Only run on branch switches, not file checkouts.
if [ "$BRANCH_SWITCH" != "1" ]; then
    exit 0
fi

${HOOK_HELPERS}
graphify_should_skip && exit 0
graphify_has_state || exit 0
graphify_mark_stale "post-checkout"
if [ -n "$PREV_HEAD" ] && [ -n "$NEW_HEAD" ]; then
    GRAPHIFY_CHANGED=$(git diff --name-only "$PREV_HEAD" "$NEW_HEAD" 2>/dev/null || true)
    export GRAPHIFY_CHANGED
fi
graphify_rebuild_code
${POST_CHECKOUT_MARKER_END}
`;

const POST_MERGE_SCRIPT = `${POST_MERGE_MARKER}
# Marks graph state stale after merges and optionally rebuilds code-only graph.
# Installed by: graphify hook install

${HOOK_HELPERS}
graphify_should_skip && exit 0
graphify_has_state || exit 0
graphify_mark_stale "post-merge"
GRAPHIFY_CHANGED=$(git diff --name-only ORIG_HEAD HEAD 2>/dev/null || true)
export GRAPHIFY_CHANGED
graphify_rebuild_code
${POST_MERGE_MARKER_END}
`;

const POST_REWRITE_SCRIPT = `${POST_REWRITE_MARKER}
# Marks graph state stale after history rewrites and optionally rebuilds code-only graph.
# Installed by: graphify hook install

${HOOK_HELPERS}
graphify_should_skip && exit 0
graphify_has_state || exit 0
graphify_mark_stale "post-rewrite"
unset GRAPHIFY_CHANGED
graphify_rebuild_code
${POST_REWRITE_MARKER_END}
`;

const HOOKS: HookDefinition[] = [
  {
    name: "post-commit",
    marker: POST_COMMIT_MARKER,
    markerEnd: POST_COMMIT_MARKER_END,
    script: POST_COMMIT_SCRIPT,
  },
  {
    name: "post-checkout",
    marker: POST_CHECKOUT_MARKER,
    markerEnd: POST_CHECKOUT_MARKER_END,
    script: POST_CHECKOUT_SCRIPT,
  },
  {
    name: "post-merge",
    marker: POST_MERGE_MARKER,
    markerEnd: POST_MERGE_MARKER_END,
    script: POST_MERGE_SCRIPT,
  },
  {
    name: "post-rewrite",
    marker: POST_REWRITE_MARKER,
    markerEnd: POST_REWRITE_MARKER_END,
    script: POST_REWRITE_SCRIPT,
  },
];

const GRAPH_GITATTR_LINES = [
  ".graphify/graph.json merge=graphify-json",
  "graphify-out/graph.json merge=graphify-json",
];
const MERGE_DRIVER_NAME = "graphify-json";
const MERGE_DRIVER_COMMAND = "graphify merge-driver %O %A %B";
const MERGE_DRIVER_LABEL = "graphify graph.json merge driver";

function installHook(hooksDir: string, definition: HookDefinition): string {
  const hookPath = join(hooksDir, definition.name);
  const script = definition.script.trimEnd() + "\n";

  if (existsSync(hookPath)) {
    const content = readFileSync(hookPath, "utf-8");
    if (content.includes(definition.marker)) {
      const regex = hookBlockRegex(definition.marker, definition.markerEnd);
      const updated = content.replace(regex, script);
      if (updated === content) return `already installed at ${hookPath}`;
      writeFileSync(hookPath, updated.trimEnd() + "\n", "utf-8");
      chmodSync(hookPath, 0o755);
      return `updated at ${hookPath}`;
    }
    writeFileSync(hookPath, content.trimEnd() + "\n\n" + script, "utf-8");
    chmodSync(hookPath, 0o755);
    return `appended to existing ${definition.name} hook at ${hookPath}`;
  }

  writeFileSync(hookPath, "#!/bin/sh\n" + script, "utf-8");
  chmodSync(hookPath, 0o755);
  return `installed at ${hookPath}`;
}

function uninstallHook(hooksDir: string, definition: HookDefinition): string {
  const hookPath = join(hooksDir, definition.name);
  if (!existsSync(hookPath)) return `no ${definition.name} hook found - nothing to remove.`;

  const content = readFileSync(hookPath, "utf-8");
  if (!content.includes(definition.marker)) {
    return `graphify hook not found in ${definition.name} - nothing to remove.`;
  }

  const newContent = content.replace(hookBlockRegex(definition.marker, definition.markerEnd), "").trim();

  if (!newContent || ["#!/bin/bash", "#!/bin/sh"].includes(newContent)) {
    unlinkSync(hookPath);
    return `removed ${definition.name} hook at ${hookPath}`;
  }
  writeFileSync(hookPath, newContent + "\n", "utf-8");
  chmodSync(hookPath, 0o755);
  return `graphify removed from ${definition.name} at ${hookPath} (other hook content preserved)`;
}

function hookBlockRegex(marker: string, markerEnd: string): RegExp {
  return new RegExp(escapeRegExp(marker) + "[\\s\\S]*?" + escapeRegExp(markerEnd) + "\\n?", "m");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readTextFile(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function installGraphAttributes(worktreeRoot: string): string {
  const attrPath = join(worktreeRoot, ".gitattributes");
  const existing = readTextFile(attrPath);
  const normalized = existing.replace(/\r\n/g, "\n");
  const lines = normalized.length > 0 ? normalized.trimEnd().split("\n") : [];
  const missing = GRAPH_GITATTR_LINES.filter((line) => !lines.includes(line));
  if (missing.length === 0) {
    return "already installed";
  }
  const updatedLines = [...lines, ...missing];
  writeFileSync(attrPath, updatedLines.join("\n") + "\n", "utf-8");
  return existing.length > 0 ? "updated" : "installed";
}

function uninstallGraphAttributes(worktreeRoot: string): string {
  const attrPath = join(worktreeRoot, ".gitattributes");
  if (!existsSync(attrPath)) {
    return "not installed";
  }
  const existing = readTextFile(attrPath).replace(/\r\n/g, "\n");
  const lines = existing.trimEnd().split("\n");
  const filtered = lines.filter((line) => !GRAPH_GITATTR_LINES.includes(line));
  if (filtered.length === lines.length) {
    return "not installed";
  }
  if (filtered.length === 0) {
    unlinkSync(attrPath);
  } else {
    writeFileSync(attrPath, filtered.join("\n") + "\n", "utf-8");
  }
  return "removed";
}

function mergeDriverConfigStatus(path: string): "installed" | "not installed" {
  const driver = safeExecGit(path, ["config", "--local", "--get", `merge.${MERGE_DRIVER_NAME}.driver`]);
  return driver === MERGE_DRIVER_COMMAND ? "installed" : "not installed";
}

function installMergeDriverConfig(path: string): string {
  const currentDriver = safeExecGit(path, ["config", "--local", "--get", `merge.${MERGE_DRIVER_NAME}.driver`]);
  const currentName = safeExecGit(path, ["config", "--local", "--get", `merge.${MERGE_DRIVER_NAME}.name`]);
  if (currentDriver === MERGE_DRIVER_COMMAND && currentName === MERGE_DRIVER_LABEL) {
    return "already installed";
  }
  execGit(path, ["config", "--local", `merge.${MERGE_DRIVER_NAME}.name`, MERGE_DRIVER_LABEL]);
  execGit(path, ["config", "--local", `merge.${MERGE_DRIVER_NAME}.driver`, MERGE_DRIVER_COMMAND]);
  return currentDriver || currentName ? "updated" : "installed";
}

function uninstallMergeDriverConfig(path: string): string {
  const currentDriver = safeExecGit(path, ["config", "--local", "--get", `merge.${MERGE_DRIVER_NAME}.driver`]);
  const currentName = safeExecGit(path, ["config", "--local", "--get", `merge.${MERGE_DRIVER_NAME}.name`]);
  if (!currentDriver && !currentName) {
    return "not installed";
  }
  safeExecGit(path, ["config", "--local", "--unset-all", `merge.${MERGE_DRIVER_NAME}.driver`]);
  safeExecGit(path, ["config", "--local", "--unset-all", `merge.${MERGE_DRIVER_NAME}.name`]);
  return "removed";
}

/**
 * Canonical comparison basis: the path resolved through symlinks. Existing
 * paths resolve with `realpath` outright; a still-non-existing tail is
 * re-joined onto the nearest existing ancestor so a symlink that exists at
 * check time cannot redirect the result.
 */
function canonicalPath(p: string): string {
  return resolveExistingRealpath(resolve(p));
}

/**
 * Strict segment-based containment between canonical paths: `candidate` is
 * inside `parent` when `path.relative` yields a non-empty, non-absolute path
 * that is neither `..` nor `..`-segment-prefixed. A leading `..` inside a
 * single name (e.g. a `..signals` directory) is a child of `parent`, not an
 * escape: only a whole `..` path component counts.
 */
function pathIsInside(candidate: string, parent: string): boolean {
  const rel = relative(canonicalPath(parent), canonicalPath(candidate));
  return rel !== "" && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}

/**
 * Containment including equality between canonical paths: used by the live
 * signal path only. Validating a live hooks directory must accept the
 * worktree root itself (legacy `core.hooksPath = .` places hooks there).
 */
function pathIsInsideOrEqual(candidate: string, parent: string): boolean {
  const rel = relative(canonicalPath(parent), canonicalPath(candidate));
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

/**
 * Legacy install/uninstall containment, kept exactly as on HEAD: a purely
 * lexical comparison that does not resolve symlinks, so a `.git/hooks`
 * symbolic link to a shared hooks directory outside the repository keeps
 * working for the explicit non-live install. Symlink-aware strictness
 * applies to the live signal path and its sinks only.
 */
function legacyHooksDirAllowed(hooksDir: string, worktreeRoot: string, commonGitDir: string): boolean {
  return [worktreeRoot, commonGitDir].some((parent) => {
    const rel = relative(parent, hooksDir);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  });
}

function validateHooksDir(context: GitContext): void {
  if (legacyHooksDirAllowed(context.hooksDir, context.worktreeRoot, context.commonGitDir)) {
    return;
  }
  throw new Error(
    `Refusing to install graphify hooks outside repository git directories: ${context.hooksDir}`,
  );
}

export function install(path: string = "."): string {
  const context = resolveGitContext(path);
  if (context === null) {
    throw new Error(`No git repository found at or above ${resolve(path)}`);
  }
  validateHooksDir(context);

  mkdirSync(context.hooksDir, { recursive: true });
  const hookLines = HOOKS.map((definition) => (
    `${definition.name}: ${installHook(context.hooksDir, definition)}`
  ));
  hookLines.push(`.gitattributes: ${installGraphAttributes(context.worktreeRoot)}`);
  hookLines.push(`merge.${MERGE_DRIVER_NAME}.driver: ${installMergeDriverConfig(context.worktreeRoot)}`);
  return hookLines.join("\n");
}

export function uninstall(path: string = "."): string {
  const context = resolveGitContext(path);
  if (context === null) {
    throw new Error(`No git repository found at or above ${resolve(path)}`);
  }
  validateHooksDir(context);

  const hookLines = HOOKS.map((definition) => (
    `${definition.name}: ${uninstallHook(context.hooksDir, definition)}`
  ));
  hookLines.push(`.gitattributes: ${uninstallGraphAttributes(context.worktreeRoot)}`);
  hookLines.push(`merge.${MERGE_DRIVER_NAME}.driver: ${uninstallMergeDriverConfig(context.worktreeRoot)}`);
  return hookLines.join("\n");
}

// ---------------------------------------------------------------------------
// H0 — Installed, signal-only live hooks (LIVE §7, A05/A06/A17).
//
// Additive to the explicit legacy install()/uninstall()/status() above, which
// keep their rebuild/attribute/merge-driver behavior untouched. The live path
// below installs only short bounded signals: a pinned/verified installed
// executable plus an injected host sink. It never invokes npm/npx, never
// writes graph attributes or Git config, never touches `.graphify/needs_update`
// (or any worktree marker), performs no rebuild/export/network work, and
// preserves third-party hook content. Live activation never calls an
// installer; there is no activation entry point in this module to do so.
// ---------------------------------------------------------------------------

export const LIVE_SIGNAL_MARKER = "# engram-live-signal-start";
export const LIVE_SIGNAL_MARKER_END = "# engram-live-signal-end";
/** Host-injected directory receiving live signals; never defaults to the worktree. */
export const LIVE_SIGNAL_ENV_VAR = "ENGRAM_LIVE_SIGNAL_DIR";
/** Compatibility probe answered by a current `hook-signal` dispatch (see cli.ts). */
export const LIVE_SIGNAL_PROBE_ARG = "--engram-probe";
export const LIVE_SIGNAL_PROBE_OUTPUT = "engram-hook-signal:1";
/** Hard bound on one serialized signal line, in bytes. */
export const LIVE_SIGNAL_LINE_LIMIT = 1024;
/** Execution budget for the pinned executable inside a hook, in seconds. */
export const LIVE_SIGNAL_EXEC_BUDGET_SECONDS = 2;
/** SIGKILL grace once the execution budget has elapsed, in seconds. */
export const LIVE_SIGNAL_KILL_GRACE_SECONDS = 1;
export const LIVE_HOOK_NAMES = [
  "post-commit",
  "post-checkout",
  "post-merge",
  "post-rewrite",
  "reference-transaction",
] as const;
export type LiveHookName = (typeof LIVE_HOOK_NAMES)[number];
const LIVE_HOOK_SET: ReadonlySet<string> = new Set(LIVE_HOOK_NAMES);
/** Installed-executable lookup order. `npm`/`npx` are never candidates. */
const INSTALLED_EXECUTABLE_CANDIDATES = ["engram", "graphify"] as const;
/** Suffix naming the preserved third-party hook chained by the dispatcher. */
const LIVE_CHAIN_SUFFIX = ".engram-live-user";
const EXECUTABLE_PROBE_TIMEOUT_MS = 2000;

export interface LiveSignal {
  v: 1;
  hook: LiveHookName;
  at: string;
  root: string;
  phase?: string;
}

export interface LiveSignalSink {
  emit(signal: LiveSignal): void;
}

export interface LiveSignalOutcome {
  emitted: boolean;
  reason: string;
}

/**
 * Resolve the pinned installed executable from PATH without any implicit
 * package-manager resolution. Returns null when neither candidate is an
 * executable file; callers must fail explicitly instead of falling back.
 */
export function resolveInstalledExecutablePath(opts: { pathEnv?: string } = {}): string | null {
  const raw = opts.pathEnv ?? process.env.PATH ?? "";
  const delimiter = process.platform === "win32" ? ";" : ":";
  for (const dir of raw.split(delimiter)) {
    if (dir.length === 0) continue;
    for (const candidate of INSTALLED_EXECUTABLE_CANDIDATES) {
      const full = resolve(join(dir, candidate));
      try {
        if (statSync(full).isFile()) {
          accessSync(full, constants.X_OK);
          return full;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Verify the selected executable actually supports the `hook-signal` dispatch:
 * a stat/X_OK check alone would pin `/usr/bin/true` or an outdated `graphify`
 * and produce silently inoperative hooks. The probe must exit 0 and answer
 * with the exact expected token.
 */
function probeSupportsHookSignal(executablePath: string): boolean {
  try {
    const result = spawnSync(executablePath, ["hook-signal", LIVE_SIGNAL_PROBE_ARG], {
      encoding: "utf-8",
      timeout: EXECUTABLE_PROBE_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error !== undefined || result.status !== 0) return false;
    return (result.stdout ?? "").trim() === LIVE_SIGNAL_PROBE_OUTPUT;
  } catch {
    return false;
  }
}

function verifyInstalledExecutable(explicit: string | undefined, pathEnv: string | undefined): string {
  const full = (() => {
    if (explicit !== undefined) {
      const resolved = resolve(explicit);
      try {
        if (!statSync(resolved).isFile()) throw new Error("not a regular file");
        accessSync(resolved, constants.X_OK);
      } catch {
        throw new Error(`Live hook setup refuses ${resolved}: not an installed executable file.`);
      }
      return resolved;
    }
    const found = resolveInstalledExecutablePath(pathEnv === undefined ? {} : { pathEnv });
    if (found === null) {
      throw new Error(
        "Live hook setup found no installed engram executable in PATH " +
          "(looked for `engram`, then `graphify`). Refusing implicit package-manager " +
          "fallback: install the binary first, then rerun this explicit command.",
      );
    }
    return found;
  })();
  if (!probeSupportsHookSignal(full)) {
    throw new Error(
      `Live hook setup refuses ${full}: it does not answer \`hook-signal ${LIVE_SIGNAL_PROBE_ARG}\` ` +
        "(incompatible or outdated executable). Pin a current engram executable instead.",
    );
  }
  return full;
}

/**
 * Resolve the hooks directory Git actually executes: `git rev-parse
 * --git-path hooks` gives the effective path, including `core.hooksPath`.
 * Only Husky's `.husky/_` wrapper directory steps up to the user-editable
 * `.husky/`; any other effective path (e.g. `<git-dir>/_`) is kept as-is so
 * installed hooks are exactly where Git looks for them.
 */
function resolveLiveHooksDir(cwd: string): string | null {
  const raw = safeExecGit(cwd, ["rev-parse", "--git-path", "hooks"]);
  if (raw === null || raw.length === 0 || /[\n\r\0]/.test(raw)) return null;
  const effective = resolveFromGitCwd(cwd, raw);
  if (basename(effective) === "_" && basename(dirname(effective)) === ".husky") {
    return dirname(effective);
  }
  return effective;
}

function validateLiveHooksDir(hooksDir: string, context: GitContext): void {
  if (
    pathIsInsideOrEqual(hooksDir, context.worktreeRoot) ||
    pathIsInsideOrEqual(hooksDir, context.gitDir) ||
    pathIsInsideOrEqual(hooksDir, context.commonGitDir)
  ) {
    return;
  }
  throw new Error(
    `Live hook setup refuses to install outside repository git directories: ${hooksDir}. ` +
      "An external core.hooksPath (e.g. a global hooks directory) is deliberately not supported.",
  );
}

function quoteShellWord(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Dispatcher installed as `<hook>`: chain a preserved third-party hook (if
 * any) as its own executable — its interpreter, arguments and stdin are kept
 * and its exit code always wins — then run the bounded live signal through
 * the pinned executable with `timeout`, and exit with the third-party status.
 */
function liveDispatcherScript(name: LiveHookName, executablePath: string, chainPath: string | null): string {
  const exe = quoteShellWord(executablePath);
  const lines: string[] = [
    "#!/bin/sh",
    LIVE_SIGNAL_MARKER,
    "# Signal-only live hook. Installed by: engram hook install-live (explicit).",
    "# Advisory: never blocks git; silent no-op when the pinned executable, the",
    "# host sink or `timeout` is missing. No rebuild, export, network or worktree write.",
  ];
  if (chainPath !== null) {
    lines.push(
      "# A preserved third-party hook is chained first as its own executable:",
      "# it keeps its interpreter, arguments and stdin, and its exit code always wins.",
      "__engram_live_status=0",
      `if [ -x ${quoteShellWord(chainPath)} ]; then`,
      `    ${quoteShellWord(chainPath)} "$@"`,
      "    __engram_live_status=$?",
      "fi",
    );
  } else {
    lines.push("__engram_live_status=0");
  }
  lines.push(`if [ -x ${exe} ] && command -v timeout >/dev/null 2>&1; then`);
  if (name === "reference-transaction") {
    lines.push(
      '    if [ "$1" = "committed" ]; then',
      `        timeout -k ${LIVE_SIGNAL_KILL_GRACE_SECONDS} ${LIVE_SIGNAL_EXEC_BUDGET_SECONDS} ${exe} hook-signal reference-transaction "$1" </dev/null >/dev/null 2>&1 || true`,
      "    fi",
    );
  } else {
    lines.push(
      `    timeout -k ${LIVE_SIGNAL_KILL_GRACE_SECONDS} ${LIVE_SIGNAL_EXEC_BUDGET_SECONDS} ${exe} hook-signal ${name} </dev/null >/dev/null 2>&1 || true`,
    );
  }
  lines.push("fi", "exit $__engram_live_status", LIVE_SIGNAL_MARKER_END);
  return lines.join("\n") + "\n";
}

function liveHookBlockRegex(): RegExp {
  return new RegExp(escapeRegExp(LIVE_SIGNAL_MARKER) + "[\\s\\S]*?" + escapeRegExp(LIVE_SIGNAL_MARKER_END) + "\\n?", "m");
}

function liveChainPath(hooksDir: string, name: string): string {
  return join(hooksDir, `${name}${LIVE_CHAIN_SUFFIX}`);
}

function installLiveHook(hooksDir: string, name: LiveHookName, executablePath: string): string {
  const hookPath = join(hooksDir, name);
  const chainPath = liveChainPath(hooksDir, name);

  if (existsSync(chainPath)) {
    // Already chained once: the hook file is ours, regenerate it.
    if (existsSync(hookPath) && !readFileSync(hookPath, "utf-8").includes(LIVE_SIGNAL_MARKER)) {
      throw new Error(
        `Live hook setup refuses to chain ${hookPath}: a preserved third-party hook already exists at ${chainPath}.`,
      );
    }
    const script = liveDispatcherScript(name, executablePath, chainPath);
    if (existsSync(hookPath) && readFileSync(hookPath, "utf-8") === script) {
      return `already installed at ${hookPath} (chaining ${chainPath})`;
    }
    writeFileSync(hookPath, script, "utf-8");
    chmodSync(hookPath, 0o755);
    return `updated at ${hookPath} (chaining ${chainPath})`;
  }

  if (existsSync(hookPath)) {
    const content = readFileSync(hookPath, "utf-8");
    if (!content.includes(LIVE_SIGNAL_MARKER)) {
      // Preserve the third-party hook as a distinct chained executable.
      renameSync(hookPath, chainPath);
      const script = liveDispatcherScript(name, executablePath, chainPath);
      writeFileSync(hookPath, script, "utf-8");
      chmodSync(hookPath, 0o755);
      return `chained third-party ${name} hook at ${hookPath} (preserved at ${chainPath})`;
    }
    const script = liveDispatcherScript(name, executablePath, null);
    if (content === script) return `already installed at ${hookPath}`;
    writeFileSync(hookPath, script, "utf-8");
    chmodSync(hookPath, 0o755);
    return `updated at ${hookPath}`;
  }

  const script = liveDispatcherScript(name, executablePath, null);
  writeFileSync(hookPath, script, "utf-8");
  chmodSync(hookPath, 0o755);
  return `installed at ${hookPath}`;
}

function uninstallLiveHook(hooksDir: string, name: string): string {
  const hookPath = join(hooksDir, name);
  const chainPath = liveChainPath(hooksDir, name);
  const chained = existsSync(chainPath);

  if (!existsSync(hookPath)) {
    if (chained) {
      renameSync(chainPath, hookPath);
      return `restored third-party ${name} hook at ${hookPath}`;
    }
    return `no ${name} hook found - nothing to remove.`;
  }

  const content = readFileSync(hookPath, "utf-8");
  if (!content.includes(LIVE_SIGNAL_MARKER)) {
    return `live signal not found in ${name} - nothing to remove.`;
  }

  if (chained) {
    renameSync(chainPath, hookPath);
    return `removed live ${name} hook and restored the third-party hook at ${hookPath}`;
  }

  const newContent = content.replace(liveHookBlockRegex(), "").trim();

  if (!newContent || ["#!/bin/bash", "#!/bin/sh"].includes(newContent)) {
    unlinkSync(hookPath);
    return `removed ${name} hook at ${hookPath}`;
  }
  writeFileSync(hookPath, newContent + "\n", "utf-8");
  chmodSync(hookPath, 0o755);
  return `live signal removed from ${name} at ${hookPath} (other hook content preserved)`;
}

/**
 * Explicit live-signal setup, outside the live cycle: installs only short
 * signals for the five live hooks into the effective hooks directory Git
 * executes. Touches neither `.gitattributes` nor Git config, and never calls
 * an installer implicitly.
 */
export function installLiveSignals(path: string = ".", opts: { executable?: string; pathEnv?: string } = {}): string {
  const context = resolveGitContext(path);
  if (context === null) {
    throw new Error(`No git repository found at or above ${resolve(path)}`);
  }
  const hooksDir = resolveLiveHooksDir(resolve(path));
  if (hooksDir === null) {
    throw new Error(`Unable to resolve the effective hooks directory at ${resolve(path)}`);
  }
  validateLiveHooksDir(hooksDir, context);

  const executablePath = verifyInstalledExecutable(opts.executable, opts.pathEnv);
  mkdirSync(hooksDir, { recursive: true });
  return LIVE_HOOK_NAMES.map((name) => (
    `${name}: ${installLiveHook(hooksDir, name, executablePath)}`
  )).join("\n");
}

/** Remove only live-signal dispatchers; legacy and third-party content is restored. */
export function uninstallLiveSignals(path: string = "."): string {
  const context = resolveGitContext(path);
  if (context === null) {
    throw new Error(`No git repository found at or above ${resolve(path)}`);
  }
  const hooksDir = resolveLiveHooksDir(resolve(path));
  if (hooksDir === null) {
    throw new Error(`Unable to resolve the effective hooks directory at ${resolve(path)}`);
  }
  validateLiveHooksDir(hooksDir, context);

  return LIVE_HOOK_NAMES.map((name) => (
    `${name}: ${uninstallLiveHook(hooksDir, name)}`
  )).join("\n");
}

/** Open-flag refusing a final symbolic-link component, where the platform provides it. */
const O_NOFOLLOW_FLAG: number = (constants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
/** Upper bound on files inspected while collecting protected inodes. */
const LIVE_SIGNAL_INODE_SCAN_LIMIT = 65536;

/**
 * Open the marker for a verified append. Creation uses `O_CREAT|O_EXCL` so
 * no pre-existing inode can be substituted; an existing marker is reopened
 * with `O_NOFOLLOW|O_APPEND`. Both opens refuse a symbolic-link final
 * component, and the returned descriptor — never the path — is what the
 * signal is written through after fstat verification. `created` tells the
 * caller this call created the marker, so a later verification refusal can
 * remove it instead of leaving an empty file at the host sink.
 */
function openMarkerForVerifiedAppend(markerPath: string): { fd: number; created: boolean } {
  try {
    return {
      fd: openSync(markerPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | O_NOFOLLOW_FLAG, 0o644),
      created: true,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
  return {
    fd: openSync(markerPath, constants.O_WRONLY | constants.O_APPEND | O_NOFOLLOW_FLAG),
    created: false,
  };
}

/**
 * Collect `{dev}:{ino}` of every regular file under the protected
 * directories (observed worktree and git directories). Returns null when
 * the scan exceeds its bound: the marker can then not be verified as
 * foreign, so the caller must refuse the write. Symbolic links are skipped:
 * a link inside a protected directory is not itself a protected file.
 */
function collectProtectedInodes(dirs: string[]): Set<string> | null {
  const inodes = new Set<string>();
  const pending = dirs.map((dir) => canonicalPath(dir));
  let scanned = 0;
  while (pending.length > 0) {
    const dir = pending.pop() as string;
    let entries: Dirent<string>[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push(full);
      } else if (entry.isFile()) {
        if (++scanned > LIVE_SIGNAL_INODE_SCAN_LIMIT) return null;
        try {
          const st = statSync(full);
          inodes.add(`${st.dev}:${st.ino}`);
        } catch {
          // Vanished or unreadable: it cannot be the marker we hold open.
        }
      }
    }
  }
  return inodes;
}

/**
 * File-backed host sink: one bounded JSON line per signal, outside any
 * worktree. The marker is opened with `O_NOFOLLOW` (created only through
 * `O_CREAT|O_EXCL`), then the open descriptor is verified with fstat: the
 * write is refused when the file is not regular, shares its inode with
 * another link (a hard link to a worktree or repository file), or its
 * `dev`/`ino` match any file of the observed worktree or git directories.
 * The signal line is written only through that verified descriptor. A
 * marker this call created but never wrote is removed instead of lingering
 * empty at the host sink.
 */
export class FileLiveSignalSink implements LiveSignalSink {
  constructor(private readonly dir: string) {}

  emit(signal: LiveSignal): void {
    const line = JSON.stringify(signal) + "\n";
    if (Buffer.byteLength(line, "utf-8") > LIVE_SIGNAL_LINE_LIMIT) return;
    const root = nearestWorktreeRoot(signal.root);
    const protectedDirs = root === null ? [] : worktreeProtectedDirs(root);
    const sinkDir = canonicalPath(resolve(this.dir));
    if (protectedDirs.some((dir) => pathIsInsideOrEqual(sinkDir, dir))) {
      throw new Error(`Live signal sink refuses a sink directory inside the worktree or git directories: ${this.dir}`);
    }
    mkdirSync(this.dir, { recursive: true });
    const markerPath = join(this.dir, `${signal.hook}.jsonl`);
    const { fd, created } = openMarkerForVerifiedAppend(markerPath);
    try {
      const st = fstatSync(fd);
      if (!st.isFile()) {
        throw new Error(`Live signal sink refuses a non-regular marker file: ${markerPath}`);
      }
      if (st.nlink > 1) {
        throw new Error(`Live signal sink refuses a marker file with more than one link: ${markerPath}`);
      }
      const inodes = root === null ? new Set<string>() : collectProtectedInodes(protectedDirs);
      if (inodes === null) {
        throw new Error(`Live signal sink cannot verify the marker against the worktree: ${markerPath}`);
      }
      if (inodes.has(`${st.dev}:${st.ino}`)) {
        throw new Error(`Live signal sink refuses a marker file sharing an inode with the worktree or repository: ${markerPath}`);
      }
      let offset = 0;
      while (offset < line.length) {
        offset += writeSync(fd, offset === 0 ? line : line.slice(offset));
      }
    } catch (err) {
      // A refusal must not leave an empty marker behind at the host sink:
      // when this call created it and no byte was written, remove it.
      if (created) {
        try {
          if (fstatSync(fd).size === 0) unlinkSync(markerPath);
        } catch {
          // Best-effort cleanup only.
        }
      }
      throw err;
    } finally {
      closeSync(fd);
    }
  }
}

function buildLiveSignal(name: string, detail: string | undefined, root: string, now: string): LiveSignal | null {
  if (!LIVE_HOOK_SET.has(name)) return null;
  const hook = name as LiveHookName;
  if (hook === "reference-transaction") {
    if (detail !== "committed") return null;
    return { v: 1, hook, at: now, root, phase: "committed" };
  }
  return { v: 1, hook, at: now, root };
}

/**
 * Resolve the nearest existing ancestor through symlinks (`realpath`) and
 * rejoin the non-existing tail: the resulting path cannot be redirected by a
 * symlink that existed at check time.
 */
function resolveExistingRealpath(p: string): string {
  let current = p;
  const tail: string[] = [];
  for (;;) {
    if (existsSync(current)) {
      try {
        return join(realpathSync(current), ...tail);
      } catch {
        return join(current, ...tail);
      }
    }
    tail.unshift(basename(current));
    const parent = dirname(current);
    if (parent === current) return join(current, ...tail);
    current = parent;
  }
}

/**
 * Nearest worktree root above `cwd` (after symlink resolution): the first
 * ancestor holding a `.git` entry (directory or gitfile, so linked worktrees
 * count). Filesystem-only, no Git call.
 */
function nearestWorktreeRoot(cwd: string): string | null {
  let dir = resolveExistingRealpath(resolve(cwd));
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Filesystem-only resolution of the observed worktree's git directories:
 * `<root>/.git` directly, or the gitfile target for linked worktrees plus
 * the common git directory. No Git call: signals never take an index lock.
 */
function worktreeProtectedDirs(root: string): string[] {
  const dirs = [root];
  const dotGit = join(root, ".git");
  let st: ReturnType<typeof statSync> | null = null;
  try {
    st = statSync(dotGit);
  } catch {
    return dirs;
  }
  if (st.isDirectory()) {
    dirs.push(canonicalPath(dotGit));
    return dirs;
  }
  try {
    const match = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, "utf-8"));
    if (match === null || match[1] === undefined) return dirs;
    const gitDir = canonicalPath(resolve(match[1]));
    dirs.push(gitDir);
    if (basename(dirname(gitDir)) === "worktrees") {
      dirs.push(dirname(dirname(gitDir)));
    }
  } catch {
    // Unreadable or not a gitfile: the worktree root alone remains protected.
  }
  return dirs;
}

/**
 * True when the sink directory — or the complete signal target, the sink
 * directory joined with the marker file, resolved through symlinks — lands
 * inside the observed worktree (the one running the hook) or one of its git
 * directories: live signals must never write there, whatever the source of
 * the sink path. The marker file is part of the check so a symbolic-link
 * marker redirecting the append into the worktree is refused before the
 * sink ever opens it.
 */
function signalTargetRefused(sinkDir: string, hook: LiveHookName, cwd: string): boolean {
  const root = nearestWorktreeRoot(cwd);
  if (root === null) return false;
  const protectedDirs = worktreeProtectedDirs(root);
  const sink = canonicalPath(resolve(sinkDir));
  if (protectedDirs.some((dir) => pathIsInsideOrEqual(sink, dir))) return true;
  const target = join(sink, `${hook}.jsonl`);
  return protectedDirs.some((dir) => pathIsInside(target, dir));
}

/**
 * Bounded live-signal dispatch for the `hook-signal` CLI entry. Uses only the
 * sink injected by the host (parameter or the real process environment; the
 * CLI dispatch runs before any repo-owned `.env` is loaded): without one it
 * is a silent no-op, and the complete destination — sink directory plus
 * marker file, symlinks resolved — is refused whenever it lands inside the
 * observed worktree or one of its git directories, so a repository can
 * never provoke worktree writes and a symbolic-link marker can never
 * redirect the append. The sink then verifies the marker through its open
 * descriptor: a non-regular file, a shared inode with the worktree or
 * repository, or more than one link is refused. Oversized signals are dropped instead of written. Performs
 * no Git call (hence no index lock), no rebuild, no export and no network
 * access, and never throws so hooks stay advisory.
 */
export function emitLiveSignalFromHook(
  name: string,
  detail?: string,
  opts: { sinkDir?: string; cwd?: string; now?: string } = {},
): LiveSignalOutcome {
  const sinkDir = (opts.sinkDir ?? process.env[LIVE_SIGNAL_ENV_VAR] ?? "").trim();
  if (sinkDir.length === 0) return { emitted: false, reason: "no-signal-sink" };
  const signal = buildLiveSignal(name, detail, resolve(opts.cwd ?? "."), opts.now ?? new Date().toISOString());
  if (signal === null) {
    return { emitted: false, reason: name === "reference-transaction" ? "phase-not-committed" : "unknown-hook" };
  }
  if (signalTargetRefused(sinkDir, signal.hook, signal.root)) {
    return { emitted: false, reason: "sink-inside-worktree" };
  }
  if (Buffer.byteLength(JSON.stringify(signal) + "\n", "utf-8") > LIVE_SIGNAL_LINE_LIMIT) {
    return { emitted: false, reason: "signal-too-large" };
  }
  try {
    new FileLiveSignalSink(sinkDir).emit(signal);
  } catch {
    return { emitted: false, reason: "sink-error" };
  }
  return { emitted: true, reason: "emitted" };
}

export function status(path: string = "."): string {
  const context = resolveGitContext(path);
  if (context === null) return "Not in a git repository.";

  const statuses = HOOKS.map((definition) => {
    const hookPath = join(context.hooksDir, definition.name);
    if (!existsSync(hookPath)) return `${definition.name}: not installed`;
    const content = readFileSync(hookPath, "utf-8");
    const hookStatus = content.includes(definition.marker)
      ? "installed"
      : "not installed (hook exists but graphify not found)";
    return `${definition.name}: ${hookStatus}`;
  });
  const attrContent = readTextFile(join(context.worktreeRoot, ".gitattributes"));
  const attrInstalled = GRAPH_GITATTR_LINES.every((line) => attrContent.includes(line));
  statuses.push(`.gitattributes: ${attrInstalled ? "installed" : "not installed"}`);
  statuses.push(`merge.${MERGE_DRIVER_NAME}.driver: ${mergeDriverConfigStatus(context.worktreeRoot)}`);
  return statuses.join("\n");
}
