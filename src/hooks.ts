/**
 * Git hook integration - install/uninstall graphify post-commit and post-checkout hooks.
 */
import { readFileSync, writeFileSync, existsSync, chmodSync, unlinkSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const HOOK_MARKER = "# graphify-hook-start";
const HOOK_MARKER_END = "# graphify-hook-end";
const CHECKOUT_MARKER = "# graphify-checkout-hook-start";
const CHECKOUT_MARKER_END = "# graphify-checkout-hook-end";

const NODE_DETECT = `
# Detect the correct Node.js / graphify binary
GRAPHIFY_BIN=$(command -v graphify 2>/dev/null)
if [ -z "$GRAPHIFY_BIN" ]; then
    # Try npx
    if command -v npx >/dev/null 2>&1; then
        GRAPHIFY_CMD="npx graphify"
    else
        echo "[graphify hook] graphify not found. Install with: npm install -g graphifyy"
        exit 0
    fi
else
    GRAPHIFY_CMD="graphify"
fi
`;

const HOOK_SCRIPT = `# graphify-hook-start
# Auto-rebuilds the knowledge graph after each commit (code files only, no LLM needed).
# Installed by: graphify hook install

CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null)
if [ -z "$CHANGED" ]; then
    exit 0
fi

${NODE_DETECT}
export GRAPHIFY_CHANGED="$CHANGED"
$GRAPHIFY_CMD hook-rebuild 2>/dev/null || true
# graphify-hook-end
`;

const CHECKOUT_SCRIPT = `# graphify-checkout-hook-start
# Auto-rebuilds the knowledge graph (code only) when switching branches.
# Installed by: graphify hook install

PREV_HEAD=$1
NEW_HEAD=$2
BRANCH_SWITCH=$3

# Only run on branch switches, not file checkouts
if [ "$BRANCH_SWITCH" != "1" ]; then
    exit 0
fi

# Only run if graphify-out/ exists (graph has been built before)
if [ ! -d "graphify-out" ]; then
    exit 0
fi

${NODE_DETECT}
echo "[graphify] Branch switched - rebuilding knowledge graph (code files)..."
$GRAPHIFY_CMD hook-rebuild 2>/dev/null || true
# graphify-checkout-hook-end
`;

function gitRoot(path: string): string | null {
  let current = resolve(path);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = resolve(current, "..");
    if (parent === current) return null;
    current = parent;
  }
}

function installHook(hooksDir: string, name: string, script: string, marker: string): string {
  const hookPath = join(hooksDir, name);
  if (existsSync(hookPath)) {
    const content = readFileSync(hookPath, "utf-8");
    if (content.includes(marker)) {
      return `already installed at ${hookPath}`;
    }
    writeFileSync(hookPath, content.trimEnd() + "\n\n" + script);
    return `appended to existing ${name} hook at ${hookPath}`;
  }
  writeFileSync(hookPath, "#!/bin/bash\n" + script);
  chmodSync(hookPath, 0o755);
  return `installed at ${hookPath}`;
}

function uninstallHook(hooksDir: string, name: string, marker: string, markerEnd: string): string {
  const hookPath = join(hooksDir, name);
  if (!existsSync(hookPath)) return `no ${name} hook found - nothing to remove.`;

  const content = readFileSync(hookPath, "utf-8");
  if (!content.includes(marker)) return `graphify hook not found in ${name} - nothing to remove.`;

  const regex = new RegExp(
    escapeRegExp(marker) + "[\\s\\S]*?" + escapeRegExp(markerEnd) + "\\n?",
  );
  let newContent = content.replace(regex, "").trim();

  if (!newContent || newContent === "#!/bin/bash") {
    unlinkSync(hookPath);
    return `removed ${name} hook at ${hookPath}`;
  }
  writeFileSync(hookPath, newContent + "\n");
  return `graphify removed from ${name} at ${hookPath} (other hook content preserved)`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function install(path: string = "."): string {
  const root = gitRoot(path);
  if (root === null) {
    throw new Error(`No git repository found at or above ${resolve(path)}`);
  }
  const hooksDir = join(root, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  const commitMsg = installHook(hooksDir, "post-commit", HOOK_SCRIPT, HOOK_MARKER);
  const checkoutMsg = installHook(hooksDir, "post-checkout", CHECKOUT_SCRIPT, CHECKOUT_MARKER);

  return `post-commit: ${commitMsg}\npost-checkout: ${checkoutMsg}`;
}

export function uninstall(path: string = "."): string {
  const root = gitRoot(path);
  if (root === null) {
    throw new Error(`No git repository found at or above ${resolve(path)}`);
  }
  const hooksDir = join(root, ".git", "hooks");

  const commitMsg = uninstallHook(hooksDir, "post-commit", HOOK_MARKER, HOOK_MARKER_END);
  const checkoutMsg = uninstallHook(hooksDir, "post-checkout", CHECKOUT_MARKER, CHECKOUT_MARKER_END);

  return `post-commit: ${commitMsg}\npost-checkout: ${checkoutMsg}`;
}

export function status(path: string = "."): string {
  const root = gitRoot(path);
  if (root === null) return "Not in a git repository.";

  const hooksDir = join(root, ".git", "hooks");

  function check(name: string, marker: string): string {
    const p = join(hooksDir, name);
    if (!existsSync(p)) return "not installed";
    const content = readFileSync(p, "utf-8");
    return content.includes(marker)
      ? "installed"
      : "not installed (hook exists but graphify not found)";
  }

  const commit = check("post-commit", HOOK_MARKER);
  const checkout = check("post-checkout", CHECKOUT_MARKER);
  return `post-commit: ${commit}\npost-checkout: ${checkout}`;
}
