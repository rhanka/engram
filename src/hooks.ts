/**
 * Git hook integration.
 *
 * Git owns the repository topology. Resolve worktree roots and hook paths with
 * `git rev-parse` so linked worktrees and gitfiles do not break installation.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execGit, resolveGitContext, safeExecGit } from "./git.js";

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
    if command -v npx >/dev/null 2>&1; then
        GRAPHIFY_CMD="npx graphify"
        return 0
    fi
    echo "[graphify hook] graphify not found. Install with: npm install -g graphifyy"
    return 1
}

graphify_rebuild_code() {
    graphify_detect_cmd || return 0
    GRAPHIFY_LOG="\${HOME}/.cache/graphify-rebuild.log"
    mkdir -p "$(dirname "$GRAPHIFY_LOG")"
    nohup sh -c "$GRAPHIFY_CMD hook-rebuild || true" > "$GRAPHIFY_LOG" 2>&1 < /dev/null &
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

export function install(path: string = "."): string {
  const context = resolveGitContext(path);
  if (context === null) {
    throw new Error(`No git repository found at or above ${resolve(path)}`);
  }

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

  const hookLines = HOOKS.map((definition) => (
    `${definition.name}: ${uninstallHook(context.hooksDir, definition)}`
  ));
  hookLines.push(`.gitattributes: ${uninstallGraphAttributes(context.worktreeRoot)}`);
  hookLines.push(`merge.${MERGE_DRIVER_NAME}.driver: ${uninstallMergeDriverConfig(context.worktreeRoot)}`);
  return hookLines.join("\n");
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
