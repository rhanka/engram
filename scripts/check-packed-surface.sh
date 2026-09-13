#!/usr/bin/env bash
set -euo pipefail

# CI uses --installed after its normal build/pack/install steps. For a local
# environment that has already built dist but cannot run the repository's full
# build wrapper, GRAPHIFY_PACKED_SKIP_BUILD=1 skips only that first build step.
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture_dir="$repository_root/scripts/fixtures/packed-surface"
temporary_root=""

cleanup() {
  if [[ -n "$temporary_root" && -d "$temporary_root" ]]; then
    rm -rf "$temporary_root"
  fi
}
trap cleanup EXIT

if [[ "${1:-}" == "--installed" ]]; then
  if [[ $# -ne 2 || ! -d "$2/node_modules/@sentropic/graphify" ]]; then
    echo "usage: $0 --installed <clean-install-directory>" >&2
    exit 2
  fi
  installed_dir="$(cd "$2" && pwd)"
else
  if [[ $# -ne 0 ]]; then
    echo "usage: $0 [--installed <clean-install-directory>]" >&2
    exit 2
  fi

  temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/graphify-packed-surface.XXXXXX")"
  installed_dir="$temporary_root/consumer"
  mkdir "$installed_dir"

  cd "$repository_root"
  if [[ "${GRAPHIFY_PACKED_SKIP_BUILD:-0}" != "1" ]]; then
    npm run build
  fi
  tarball_name="$(npm pack --pack-destination "$temporary_root" 2>/dev/null | tail -1)"

  cd "$installed_dir"
  npm init -y --silent
  npm install "$temporary_root/$tarball_name" typescript@6.0.3 @types/node@25.8.0
fi

check_dir="$installed_dir/.packed-surface-check"
rm -rf "$check_dir"
mkdir "$check_dir"
cp "$fixture_dir"/* "$check_dir/"

cd "$check_dir"
node check-cjs.cjs
node check-esm.mjs
../node_modules/.bin/tsc --noEmit --project tsconfig.json

echo "Packed CommonJS root, ESM mesh runtime, ESM-only require guard, and mesh declarations verified"
