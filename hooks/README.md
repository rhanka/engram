# Versioned git hooks

Tracked hooks for this repository. Activate them once per clone with:

```sh
sh scripts/install-hooks.sh
```

That sets `core.hooksPath` to this directory (absolute path of the primary
checkout, so every worktree is guarded) and makes the hooks executable.
Verify with `git config --get core.hooksPath`.

## Hooks

- **`reference-transaction`** -- refuses direct writes to `refs/heads/main`
  (main goes through a PR; escape hatch `GRAPHIFY_GATE=1` for gated merges).

- **`commit-msg`** -- anti-attribution-trailer guard. Rejects a commit whose
  message contains a line that (stripped and lowercased) begins with
  `co-authored-by:` or `claude-session:`, or that contains
  `generated with claude code`.

- **`pre-push`** -- anti-attribution-trailer guard. Reads the ref-update list
  from STDIN, skips deletions, bounds the pushed range
  (`<lsha> --not --remotes` for a new branch, otherwise `<rsha>..<lsha>`), and
  refuses the push if any commit message in that range matches
  `^(co-authored-by|claude-session|generated with)` (case-insensitive).

The matching CI workflow (`.github/workflows/no-attribution.yml`) additionally
scans the pull request **description**, which local hooks cannot see.

The anti-trailer hooks are POSIX `sh` + `git` only -- no third-party
dependency, and no coupling to the graphify application or to h2a.
