#!/usr/bin/env bash
# Behavioural tests for hooks/reference-transaction, in a throwaway clone.
#
# Test 2 is the one that matters, and it is written to fail against the obvious
# wrong implementation: a naive pre-merge-commit hook. That hook does not run at
# all for a fast-forward merge, so it lets main move without a word. A test that
# passes against both implementations would prove nothing about this defect.
#
# Setup steps run under GRAPHIFY_GATE=1 on purpose. Preparing a case means moving
# main (reset, branch -f), which the hook refuses — the first version of this
# harness was refused at setup, left main where it was, and the merge under test
# became a silent no-op that reported success. The lesson: read the ref, not the
# exit code of a step you did not verify.
set -u

HOOK="$(cd "$(dirname "$0")/.." && pwd)/hooks/reference-transaction"
R="$(mktemp -d)"
trap 'rm -rf "$R"' EXIT
fail=0

ok() { printf '  ok    %s\n' "$1"; }
ko() { printf '  FAIL  %s\n' "$1"; fail=1; }

cd "$R"
git init -q -b main .
git config user.email t@example.invalid
git config user.name test
echo a > f && git add f && git commit -qm init
git branch -f feat
git checkout -q feat && echo b > g && git add g && git commit -qm ahead
git checkout -q main
BASE=$(git rev-parse main)

# --- Test 1: the naive implementation is blind to a fast-forward merge.
printf '#!/bin/sh\ntouch "%s/naive-fired"\nexit 1\n' "$R" > .git/hooks/pre-merge-commit
chmod +x .git/hooks/pre-merge-commit
git merge feat >/dev/null 2>&1
if [ -e "$R/naive-fired" ]; then
	ko "test 1: pre-merge-commit naif s'est declenche (le defaut n'existerait pas)"
else
	ok "test 1: pre-merge-commit naif NE se declenche PAS sur un ff-merge"
fi
[ "$(git rev-parse main)" != "$BASE" ] && ok "test 1: et main a bouge sous le hook naif" \
	|| ko "test 1: main n'a pas bouge, le cas n'est pas un ff-merge"
rm -f .git/hooks/pre-merge-commit

# --- Install the real hook, and rewind main under the gate (setup, not a test).
cp "$HOOK" .git/hooks/reference-transaction
chmod +x .git/hooks/reference-transaction
GRAPHIFY_GATE=1 git reset -q --hard "$BASE"
BASE=$(git rev-parse main)

# --- Test 2: the same fast-forward merge is refused, and main does not move.
git merge feat >/dev/null 2>&1
if [ "$(git rev-parse main)" = "$BASE" ]; then
	ok "test 2: ff-merge BLOQUE, main inchange"
else
	ko "test 2: main a bouge — le garde-fou ne tient pas"
fi

# --- Test 3: the documented escape hatch still works.
GRAPHIFY_GATE=1 git merge feat >/dev/null 2>&1
[ "$(git rev-parse main)" != "$BASE" ] && ok "test 3: GRAPHIFY_GATE=1 laisse passer" \
	|| ko "test 3: la derogation ne passe pas"

# --- Test 4: branches other than main are not slowed down at all.
git checkout -q -b autre
echo c > h && git add h
if git commit -qm other >/dev/null 2>&1; then
	ok "test 4: une autre branche n'est pas entravee"
else
	ko "test 4: une autre branche est entravee"
fi

[ "$fail" -eq 0 ] && printf 'TOUS LES TESTS PASSENT\n' || printf 'AU MOINS UN TEST ECHOUE\n'
exit "$fail"
