# Apply payload — branch protection on `main`

Companion to `SPEC_MAIN_BRANCH_PROTECTION.md`. **Nothing here is applied.** This
exists so the owner's two answers turn straight into a reviewable command instead of
another round trip.

## Blocking pre-check — run this FIRST, every time

A required check that never runs on a PR blocks that PR forever. Confirm the names on
a real PR before applying:

```sh
gh pr checks <a-real-pr-number> --json name,state --jq '.[].name' | sort -u
```

Require only names that appear in that output. If `test (20)`, `test (22)`,
`test (24)`, `golden-webgl` or `smoke-test` is missing from it, **do not apply** —
the job was renamed, and naming it here would deadlock every merge.

## The command

`APPROVALS` and `ENFORCE_ADMINS` are the owner's two open arbitrations. Substitute,
do not guess.

```sh
# APPROVALS      : 0 (conductor gate is the review) | 1 (a human clicks per merge)
# ENFORCE_ADMINS : false (keeps the admin-merge-on-quota escape) | true (binds admins too)
APPROVALS=0
ENFORCE_ADMINS=false

gh api -X PUT repos/rhanka/graphify/branches/main/protection \
  --input - <<JSON
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["test (20)", "test (22)", "test (24)", "golden-webgl", "smoke-test"]
  },
  "enforce_admins": ${ENFORCE_ADMINS},
  "required_pull_request_reviews": {
    "required_approving_review_count": ${APPROVALS},
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

Note on `APPROVALS=0`: GitHub accepts the block with a count of 0, which still forces
changes through a pull request while requiring no approval. Dropping the
`required_pull_request_reviews` block entirely is **not** the same thing — that
removes the PR requirement, which is the whole point.

## Rollback

One call, and `main` is back to its current unprotected state:

```sh
gh api -X DELETE repos/rhanka/graphify/branches/main/protection
```

That is what makes applying this reversible: the risk is not the protection itself but
applying it *before* the lane is PR-based, which strands the held lots.

## Verification, in order

```sh
# 1. protection is live and says what we think it says
gh api repos/rhanka/graphify/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts, strict: .required_status_checks.strict,
         approvals: .required_pull_request_reviews.required_approving_review_count,
         admins: .enforce_admins.enabled}'

# 2. a direct push is REFUSED (expect a non-zero exit and a rejection message)
git push origin main

# 3. --no-verify changes nothing — proves this is server-side, not the local hook
git push --no-verify origin main

# 4. a PR with the required checks green MERGES
```

Step 2 failing to fail is the only outcome that means the apply did not work. Do not
report success on the API response alone.
