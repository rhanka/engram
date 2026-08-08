# SPEC — Guard on direct writes to `main`

Status: **design, awaiting conductor validation — no implementation**

Date: 2026-08-08

Baseline: `main` at `64708bee`

Origin: owner decision (b) — refuse any merge/push to `main` that did not go
through the guarded lane.

## 0. The finding that reframes this spec

**`main` is not protected on GitHub.** Measured:

```
gh api repos/:owner/:repo/branches/main/protection
  -> 404 "Branch not protected"
```

That matters more than anything below, because it tells us where the governance
hole actually is. A git hook **cannot** close it:

- `git push --no-verify` skips `pre-push` entirely — one flag, no privilege needed;
- hooks live in local config (§2), so **any other clone has no hook at all**;
- the CI runner, a fresh checkout, another machine: all unguarded.

So the honest framing, and the thing to agree on before writing code:

| Layer | What it is | What it stops |
| --- | --- | --- |
| **Branch protection** (server) | the actual control | everyone, everywhere, including `--no-verify` and other clones |
| **Local hook** (this spec) | a guardrail | the *accident* — a tired agent or human typing `git push origin main` in the wrong worktree |

Both are worth having, and they are not substitutes. Building only the hook and
calling the hole closed would be the failure mode this spec exists to avoid.
**Recommendation: ship the hook (cheap, immediate, in my perimeter) AND raise
branch protection as the owner-level fix** — it is one API call, and it gates
everyone's pushes, which is precisely why it is not mine to enable.

## 1. Hard point (1) — not breaking our own guarded lane

The hook must let the guarded lane through while refusing ad-hoc writes. The
chicken-and-egg is real: a guard that blocks every write to `main` blocks the
lane that is supposed to be the sanctioned path.

**Proposal: an explicit env marker, `GRAPHIFY_GATE=1`, exported by the guarded
lane and checked by the hook.**

Why this and not a commit-format convention: a marker is *checked at the moment
of the write*, which is exactly when the decision is made. A commit-message
convention is checked after the fact and is trivially reproduced by anyone
writing the right words.

**Its honest weakness, stated up front:** `GRAPHIFY_GATE=1 git push` also passes.
The marker documents intent; it does not verify authority. That is acceptable
*only* under the framing of §0 — this is an accident guard. If we ever need it to
resist intent, the answer is branch protection, not a cleverer marker.

## 2. Hard point (2) — one hook, 76 worktrees

Already solved by the current setup, verified rather than assumed:

```
git config --show-origin --get core.hooksPath
  file:.git/config    /home/antoinefa/src/graphify/.git/hooks
git -C <a worktree> config --get core.hooksPath
  /home/antoinefa/src/graphify/.git/hooks     <- same directory
git worktree list | wc -l  ->  76
```

`core.hooksPath` is an **absolute** path in the repo's local config, and a
worktree resolves the same directory. So a single hook file covers all 76
worktrees with no per-worktree installation.

**The catch, and it is the reason not to call this "versioned":** `.git/config`
is *not* in the repository. A fresh clone has no `core.hooksPath` and therefore
no hook. Two consequences:

- the hook must be **installable by a script** (`scripts/install-hooks.sh`)
  committed to the repo, so a new clone can opt in deliberately;
- the guard can never be assumed present. Anything that *must* hold is
  branch protection.

Switching `core.hooksPath` to a versioned directory (e.g. `.githooks`) would make
the hook travel with the repo, but still requires a local `git config` to point
there — git deliberately does not let a repository configure its own hooks path,
precisely because that would be remote code execution on clone. There is no way
around the install step.

## 3. Hard point (3) — what exactly is blocked

Two distinct events, and **the obvious hook misses one of them**:

**a. Push to `origin/main`** — `pre-push`. The hook reads the refs being pushed
on stdin (`<local ref> <local sha> <remote ref> <remote sha>`) and refuses when
`<remote ref>` is `refs/heads/main` without the marker.

**b. Local merge into `main`** — `pre-merge-commit` is **not sufficient**. It
only fires when a merge *creates a commit*; a **fast-forward** merge into `main`
creates none, so `git merge --ff-only wip` silently moves `main` with no hook
firing. Since most of our lots would fast-forward, this gap would cover the
common case.

The hook that catches every local ref move is **`reference-transaction`**,
supported here (git 2.53.0, needs ≥ 2.28). It fires on *any* ref update —
fast-forward merges, `reset --hard`, `branch -f` — and can refuse the transaction
when the ref is `refs/heads/main`.

**Scope discipline:** it must refuse **only** `refs/heads/main` and stay silent
for every other ref, otherwise it interferes with all lane work across 76
worktrees. It must also ignore the `prepared`/`committed`/`aborted` phases it is
not meant to act on, and never write to stdout in a way that pollutes porcelain.

## 4. The test that must pass

Not "the hook exists" — the *behaviour*, in a throwaway clone so no experiment
can touch the real `main`:

1. **Direct push to main is BLOCKED** — `git push origin main` without the marker
   → non-zero exit, ref unmoved on the remote.
2. **Direct local merge into main is BLOCKED, including fast-forward** — the case
   `pre-merge-commit` would have missed.
3. **The guarded lane PASSES** — the same merge and push with `GRAPHIFY_GATE=1`
   → success, ref moved.
4. **Other branches are untouched** — a push/merge on any non-`main` ref is
   unaffected, proving the guard has not become a global brake.

Test 2 is the one that would fail against a naive `pre-merge-commit`
implementation, so it must exist before the hook is written, per the Track F rule
that a test which cannot fail against the wrong implementation proves nothing.

## 5. What this spec does not decide

- **Whether to enable branch protection on `main`.** It gates the owner's own
  pushes and every CI job; that is an owner call, and it is the only thing here
  that actually closes the hole.
- **Whether the marker should be `GRAPHIFY_GATE` or a call through a wrapper
  script** (`scripts/gated-merge.sh`). A wrapper is harder to invoke by accident
  and gives one place to log what was merged and by which lane; it is also one
  more thing to keep working. Conductor's call.

## 6. Cost

Small: one hook file, one install script, one test script. No change to product
code. The risk is not the code — it is shipping it as if the hole were closed.
