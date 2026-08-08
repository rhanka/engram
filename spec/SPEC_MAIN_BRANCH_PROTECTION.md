# SPEC — Branch protection on `main`

Status: **RATIFIED by the owner 2026-08-08 — still NOT applied** (apply is sequenced
after the lane becomes PR-based; see §3)

Both open arbitrations were decided as proposed: **0 approvals** and
**`enforce_admins: false`**. The §2 table below records the reasoning that was on the
table when that call was made, including the arguments against — those do not stop
being true now that the decision went the other way, and they are what to re-read if
the rule ever needs revisiting.

Date: 2026-08-08 · Baseline `main` = `64708bee` · Repo `rhanka/graphify`

Owner decision: branch protection is the real close; the local hook
(`SPEC_MAIN_BRANCH_WRITE_GUARD.md`, `e4648dd6`) is an accident guard only.

## 0. Measured facts

- **`main` is currently unprotected** — `gh api …/branches/main/protection` → 404.
- **I hold `admin: true`** on `rhanka/graphify` (and `push: true`). I *can* apply
  this. I am **not** applying it: it gates every push from everyone including the
  owner and CI, which is the same class of act as the machine-wide `docker prune`
  that was routed to the owner.
- Exact check names on `main` today:
  - deterministic, per-commit: `test (20)`, `test (22)`, `test (24)`,
    `golden-webgl`, `smoke-test`, `build`
  - **quota-flaky**: `direct-llm-uat (anthropic|cohere|gemini|mistral|openai)`
  - **release-only**: `publish`, `publish-graph`, `post-publish-check`,
    `release-guard`, `deploy`, `report-build-status`

## 1. The trap that must not be sprung

**A required check that never runs on a PR blocks that PR forever.** GitHub waits
for the context indefinitely; there is no timeout. Two ways to fall in:

1. naming a check that does not exist (typo, renamed job);
2. naming a check that exists but only runs on **tags/releases** — that is exactly
   what `publish`, `publish-graph`, `post-publish-check`, `release-guard` and
   `deploy` are here. They are release-driven (npm publish is tag-driven in this
   repo), so a PR would never produce them.

**Therefore, before applying: open one throwaway PR and read the check names it
actually produces.** Require only names observed on that PR. This is the single
verification that must precede `PUT`.

## 2. Proposed ruleset

| Field | Proposed | Why |
| --- | --- | --- |
| `required_status_checks.contexts` | `test (20)`, `test (22)`, `test (24)`, `golden-webgl`, `smoke-test` | the conductor's list — deterministic and per-commit. `build` is a candidate if the PR produces it; add only after §1 observation. |
| — **excluded** | the 5 `direct-llm-uat (*)` | provider-quota flakes. There is already a documented practice of admin-merging when the *only* red check is `direct-llm-uat` on exhausted quota. Requiring them would make every merge hostage to a third-party quota. |
| `required_status_checks.strict` | **`false`** | `true` forces every PR to be up-to-date with `main` before merging. `main` moved ~60 times in one day here; `strict:true` would put every lot into a rebase treadmill and serialise the whole fleet. |
| `required_pull_request_reviews` | **0 required approvals** (PR still required) | the conductor gate *is* the review. Requiring ≥1 approval in a single-owner org means the owner must click on every lot, recreating the bottleneck protection is meant to remove. **Trade-off stated: with 0 approvals, the PR is a channel and a checks-gate, not a human review.** If the conductor wants a human in the loop per merge, set it to 1 and accept the click. |
| `enforce_admins` | **`false`** (proposed) | keeps an owner escape hatch. With `true`, the documented admin-merge-on-quota-flake practice becomes impossible, and an urgent fix during a provider outage has no path. **Counter-argument, honestly:** `false` means the protection does not bind the person most able to bypass it by habit, which weakens it to a convention for admins. If the owner wants the rule to bind everyone including themselves, `true` is defensible — it just must be a deliberate choice, not a default. |
| `allow_force_pushes` | `false` | force-push to `main` rewrites shared history. |
| `allow_deletions` | `false` | |
| `restrictions` | `null` | no per-actor allowlist; the PR requirement is the control. |

Requiring a PR is what removes direct push: with protection on and no `restrictions`
bypass, `git push origin main` is refused server-side — including `--no-verify`,
including from any other clone. That is the property the local hook could not give.

## 3. Sequencing — the chicken-and-egg, and it is real

**Adapt the guarded lane BEFORE enabling protection.** Order:

1. **Convert the lane** to PR-based: branch → `gh pr create` → wait for required
   checks → `gh pr merge`. (Build lot, `gpt-5.6-terra` xhigh, needs a slot.)
2. **Drain or convert the 4 HELD lots** — `2608c1ed`, `1008471b`, `bbaab6fb`,
   `e4648dd6`. They are currently destined for a direct guarded merge; once
   protection is on, that path is gone and they are stuck until someone opens PRs
   for them.
3. **Observe a throwaway PR** and freeze the exact required-check names (§1).
4. **Apply** the protection.
5. **Verify** (§4).

Doing 4 before 1-2 breaks the guarded lane and strands every HELD lot — the exact
failure the conductor flagged.

## 4. Verification, after apply

1. **PR-based merge PASSES** — a real PR with green required checks merges.
2. **Direct push is BLOCKED** — `git push origin main` from a clean clone →
   rejected by the server, ref unmoved.
3. **A quota-flaky `direct-llm-uat` red does NOT block** — proving the exclusion
   in §2 works, since that was the whole point of excluding it.
4. **`--no-verify` does not help** — same rejection, proving this is server-side
   and not the local hook.

## 5. Who applies

I have the rights but this is owner-level: it gates the owner's own pushes and
every CI job. **Recommendation: the conductor has the `PUT` validated by the
owner**, same route as the `docker prune`. I can hand the exact `gh api` call for
review; I will not run it unasked.
