#!/usr/bin/env bash
# Point this clone's hooks at the versioned hooks/ directory.
#
# core.hooksPath is stored in .git/config, which is not versioned, so this has to
# be run once per clone. Worktrees share the parent clone's .git/config, so one
# run covers every worktree of that clone — but a fresh clone starts unguarded.
# That is a real limit, not an oversight: the enforcement that binds every clone
# is branch protection on the remote. This only catches the local accident.
set -eu

cd "$(dirname "$0")/.."

# ABSOLU, jamais relatif. Un chemin relatif est resolu par git depuis la racine du
# WORKTREE COURANT, donc chaque worktree chercherait son propre hooks/ : ceux dont
# la branche checked-out ne porte pas encore le fichier pointeraient un repertoire
# inexistant et seraient NON GARDES, sans le moindre message. Avec le chemin
# absolu du checkout primaire, les worktrees partagent le meme hooks/ versionne.
git config core.hooksPath "$PWD/hooks"
chmod +x hooks/* 2>/dev/null || true

printf 'hooks actives depuis %s/hooks\n' "$PWD"
printf 'verifier:  git config --get core.hooksPath\n'
