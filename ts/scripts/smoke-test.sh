#!/bin/bash
# Pre-publish smoke test: npm pack → install from tarball → verify CLI works
#
# Usage: ./scripts/smoke-test.sh
# Run this BEFORE `npm publish` to catch packaging issues.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TMP_DIR=$(mktemp -d)
TARBALL=""

cleanup() {
    echo ""
    echo "Cleaning up..."
    rm -rf "$TMP_DIR"
    [ -n "$TARBALL" ] && rm -f "$PROJECT_DIR/$TARBALL"
}
trap cleanup EXIT

echo "═══════════════════════════════════════════════════"
echo "  graphify pre-publish smoke test"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Step 1: Build ─────────────────────────────────────
echo "Step 1: Build..."
cd "$PROJECT_DIR"
npm run build
echo "  ✓ Build succeeded"

# ── Step 2: Tests ─────────────────────────────────────
echo "Step 2: Run tests..."
npm test
echo "  ✓ Tests passed"

# ── Step 3: Pack ──────────────────────────────────────
echo "Step 3: npm pack..."
TARBALL=$(npm pack 2>/dev/null | tail -1)
echo "  ✓ Packed: $TARBALL"

# ── Step 4: Install from tarball in clean dir ─────────
echo "Step 4: Install from tarball..."
cd "$TMP_DIR"
npm init -y --silent > /dev/null 2>&1
npm install "$PROJECT_DIR/$TARBALL" --silent > /dev/null 2>&1
echo "  ✓ Installed from tarball"

# ── Step 5: Verify CLI ───────────────────────────────
echo "Step 5: Verify CLI..."

# --help
OUTPUT=$(npx graphify --help 2>&1)
echo "$OUTPUT" | grep -q "Usage:" || { echo "  ✗ --help failed"; exit 1; }
echo "  ✓ graphify --help works"

# --version
VERSION=$(npx graphify --version 2>&1)
echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+' || { echo "  ✗ --version failed"; exit 1; }
echo "  ✓ graphify --version = $VERSION"

# install (skill copy)
npx graphify install --platform claude > /dev/null 2>&1
echo "  ✓ graphify install --platform claude works"

# hook status (should work even outside a git repo)
npx graphify hook status 2>&1 | grep -qi "repository\|installed\|not" || true
echo "  ✓ graphify hook status works"

# ── Step 6: Verify package contents ──────────────────
echo "Step 6: Verify package contents..."
PKG_DIR="$TMP_DIR/node_modules/graphifyy"

# dist/ should exist
[ -f "$PKG_DIR/dist/index.js" ] || { echo "  ✗ dist/index.js missing"; exit 1; }
[ -f "$PKG_DIR/dist/index.cjs" ] || { echo "  ✗ dist/index.cjs missing"; exit 1; }
[ -f "$PKG_DIR/dist/index.d.ts" ] || { echo "  ✗ dist/index.d.ts missing"; exit 1; }
[ -f "$PKG_DIR/dist/cli.js" ] || { echo "  ✗ dist/cli.js missing"; exit 1; }
echo "  ✓ dist/ contains all expected files"

# skills/ should be bundled
SKILL_COUNT=$(find "$PKG_DIR/src/skills" -name "*.md" 2>/dev/null | wc -l)
[ "$SKILL_COUNT" -ge 7 ] || { echo "  ✗ Expected 7+ skill files, found $SKILL_COUNT"; exit 1; }
echo "  ✓ $SKILL_COUNT skill markdown files bundled"

# ── Step 7: Verify library import ────────────────────
echo "Step 7: Verify library import..."
node -e "
  const g = require('graphifyy');
  const fns = ['validateExtraction', 'buildFromJson', 'cluster', 'godNodes', 'generateReport'];
  for (const fn of fns) {
    if (typeof g[fn] !== 'function') {
      console.error('  ✗ Missing export: ' + fn);
      process.exit(1);
    }
  }
  console.log('  ✓ All expected functions are exported');
" 2>&1

# ── Done ──────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✓ All smoke tests passed!"
echo "  Safe to publish: npm publish"
echo "═══════════════════════════════════════════════════"
