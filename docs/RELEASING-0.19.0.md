# Releasing 0.19.0 — owner-only steps

First release of the NEW package `@sentropic/engram@0.19.0`. The normal
tag-driven flow (`.github/workflows/typescript-ci.yml`: `release-guard` →
`publish` → `post-publish-check` on a `v*` tag) cannot do this release on its
own, because npm trusted publishing (OIDC) requires a trusted publisher
configured on an EXISTING npm package. `@sentropic/engram` does not exist on
npm yet, so there is nothing to attach the publisher to. Do the steps below in
order. No push, no publish, and no tag have been done from the release branch.

## (a) First publish of `@sentropic/engram@0.19.0` (manual)

From a clean checkout of merged `main`, with the owner's npm account (2FA):

```bash
npm ci && npm run build && npm publish --access public
```

This must be manual: the `publish` job's `npm publish` authenticates via OIDC
trusted publishing, which has no publisher to assume for a package that does
not exist yet. Verify with `npm view @sentropic/engram@0.19.0 version`.

## (b) Configure npm trusted publishers (on npmjs.com)

- `@sentropic/engram`: add a trusted publisher — repository `rhanka/engram`,
  workflow `typescript-ci.yml`. This enables tag-driven publishes from 0.19.1 on.
- `@sentropic/graphify`: update its existing trusted publisher to repository
  `rhanka/engram` (it still points at `rhanka/graphify`), workflow
  `typescript-ci.yml`.

## (c) Publish the shim `forward/graphify`

```bash
cd forward/graphify
npm publish --access public
```

This publishes `@sentropic/graphify@0.19.0`, a forwarding shim pinned to
`@sentropic/engram@0.19.0`. It is NOT published by the tag workflow (the
workflow's `publish` job only publishes the repository root package).

## (d) Deprecate the old name

```bash
npm deprecate @sentropic/graphify@"<=0.19.0" "graphify has become Engram (@sentropic/engram) — a different product (agent memory substrate), not a rename-in-place. This package is a forwarding shim: install @sentropic/engram and use bin engram, ENGRAM_*, .engram/ instead."
```

Message source: `forward/graphify/README.md`. Never unpublish the old name.

## (e) Tag `v0.19.0` — skip the tag-triggered publish for this release

Recommendation: do NOT push tag `v0.19.0` (or push it only to mark the commit,
accepting a red `publish` job). What a `v0.19.0` tag push would do, job by job:

- `test`, `golden-webgl`, `smoke-test`, `direct-llm-uat` (gated): run as usual.
- `release-guard` (needs `test` + `smoke-test`, tag only): PASSES — the tag
  would be on merged `main` and `package.json` says `0.19.0`, matching the tag.
- `publish` (needs `release-guard`, tag only): runs `npm ci`,
  `npm run build`, then `npm publish` for `@sentropic/engram@0.19.0` — which
  step (a) already published. npm rejects republishing an existing version, so
  this job FAILS (version already exists). It does not publish the shim.
- `post-publish-check` (needs `publish`, tag only): SKIPPED, because `publish`
  failed — and even if it ran, it installs and verifies
  `@sentropic/graphify@latest` (hardcoded old name), so it cannot validate the
  `@sentropic/engram` release anyway.

Because the tag publish job would fail against the already-published 0.19.0
and the post-publish check targets the old package name, skip pushing
`v0.19.0` for this one release. Resume the normal tag-driven flow from 0.19.1,
once the step-(b) trusted publishers are in place.
