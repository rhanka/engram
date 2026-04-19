/**
 * Git hook integration.
 *
 * Git owns the repository topology. Resolve worktree roots and hook paths with
 * `git rev-parse` so linked worktrees and gitfiles do not break installation.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveGitContext } from "./git.js";

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
    $GRAPHIFY_CMD hook-rebuild >/dev/null 2>&1 || true
}
`;

const POST_COMMIT_SCRIPT = `${POST_COMMIT_MARKER}
# Marks graph state stale and rebuilds code-only graph after each commit.
# Installed by: graphify hook install

CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null || true)
if [ -z "$CHANGED" ]; then
    exit 0
fi

${HOOK_HELPERS}
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

export function install(path: string = "."): string {
  const context = resolveGitContext(path);
  if (context === null) {
    throw new Error(`No git repository found at or above ${resolve(path)}`);
  }

  mkdirSync(context.hooksDir, { recursive: true });
  return HOOKS.map((definition) => (
    `${definition.name}: ${installHook(context.hooksDir, definition)}`
  )).join("\n");
}

export function uninstall(path: string = "."): string {
  const context = resolveGitContext(path);
  if (context === null) {
    throw new Error(`No git repository found at or above ${resolve(path)}`);
  }

  return HOOKS.map((definition) => (
    `${definition.name}: ${uninstallHook(context.hooksDir, definition)}`
  )).join("\n");
}

export function status(path: string = "."): string {
  const context = resolveGitContext(path);
  if (context === null) return "Not in a git repository.";

  return HOOKS.map((definition) => {
    const hookPath = join(context.hooksDir, definition.name);
    if (!existsSync(hookPath)) return `${definition.name}: not installed`;
    const content = readFileSync(hookPath, "utf-8");
    const hookStatus = content.includes(definition.marker)
      ? "installed"
      : "not installed (hook exists but graphify not found)";
    return `${definition.name}: ${hookStatus}`;
  }).join("\n");
}
