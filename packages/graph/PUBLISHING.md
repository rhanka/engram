# Publishing `@sentropic/graph`

**This repository does not publish `@sentropic/graph` any more.**

The package now lives in — and is published from — the Sent Tech design system:

<https://github.com/rhanka/sent-tech-design-system>

That repository owns the source of record for `@sentropic/graph` and is its sole
publisher. It builds and publishes the package from its own workspace on a
`graph-v*` tag, via npm Trusted Publishing (OIDC). Version planning, changelog and
release cadence for the package belong there.

## What changed here

- The `publish-graph` job is removed from `.github/workflows/typescript-ci.yml`, and
  `graph-v*` is no longer part of that workflow's tag trigger. No tag in this
  repository can publish the package.
- `packages/graph/package.json` is `"private": true` (and no longer carries
  `publishConfig` or a `prepublishOnly` hook), so `npm publish` refuses it outright.

## What `packages/graph` is still for, in this repository

It stays in-tree as the **local build/test source** of the studio renderer. Nothing
about that consumption path changed:

- `vitest.config.ts` and `studio/vite.config.js` alias `@sentropic/graph` to
  `packages/graph/src/index.ts`, so the root tests and the studio SPA build against
  the in-tree source.
- The root `prebuild` script runs `build:graph` and then `scripts/sync-graph-dist.mjs`,
  which copies the freshly built `packages/graph/dist` into
  `node_modules/@sentropic/graph` so the root `tsup --dts` build resolves the local
  types.
- `npm run test:graph`, `npm run bench:graph` and the CI `golden-webgl` lane run the
  package's own suites.
- At a consumer's runtime, the published `@sentropic/graphify` keeps resolving
  `@sentropic/graph` from npm as an external dependency (see the `dependencies` entry
  in the root `package.json`) — now served by the design system's releases.

## If a renderer change is needed

Make it in the design system repository and let that repository publish it. Changing
`packages/graph` here only affects this repository's own studio build and tests; it
cannot reach npm.
