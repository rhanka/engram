# Publishing `@sentropic/graph`

`@sentropic/graph` is the canonical renderer + layout package. It is **NOT** wired
into CI — the tag-driven `publish` job in `.github/workflows/typescript-ci.yml`
publishes the main `@sentropic/graphify` package only. Publishing this package is a
**manual maintainer action**.

## Why this matters (the recurring tech-debt)

`@sentropic/graphify` depends on `@sentropic/graph` and resolves the **published**
tarball at runtime (tsup keeps `@sentropic/graph` external). npm `latest` was stuck
at **0.1.0**, which predates the layout-registry exports
(`computeTypedLayerPositions`, `computeTimeOrientedPositions`, the typed-layer /
time-oriented layouts). Because those exports were absent from the installed
package, graphify had to **vendor** them into `src/typed-layer-layout.ts` to keep the
installed CLI from crashing at import with:

```
SyntaxError: ... does not provide an export named 'computeTypedLayerPositions'
```

Publishing **0.2.0** (which exports the full layout surface) lets graphify import
them normally again and delete the vendored copy.

## Manual publish (the exact sequence)

You need npm auth with publish rights to the `@sentropic` scope. From the repo root:

```sh
cd packages/graph
npm run build      # tsup → dist/ (esm + cjs + d.ts). prepublishOnly also runs test + build.
npm publish        # version 0.2.0, publishConfig.access = "public"
```

Notes:

- The package version is **0.2.0** (clean MINOR — it adds public API: the layout
  registry `registerLayout` / `getLayout` / `createLayoutEngine`, the layout id
  consts, `computeTypedLayerPositions`, `computeTimeOrientedPositions`, and the
  `TypedLayerLayoutOptions` / `TimeOrientedLayoutOptions` types).
- `publishConfig.access` is `"public"`, so no extra `--access public` flag is needed,
  but it is harmless to pass it explicitly: `npm publish --access public`.
- `files` ships only `dist`, `README.md`, `FEATURES.md`. `dist/` is gitignored and
  rebuilt by `npm run build` (and again by `prepublishOnly`); do not commit it.

## After the publish lands on npm

Once `@sentropic/graph@0.2.0` is live on npm, **land the Part-2 un-vendor commit**
(the second commit on the `chore/publish-graph-pkg-prep` branch / PR). That commit:

1. bumps graphify's `@sentropic/graph` dependency `^0.1.0` → `^0.2.0`, and
2. switches `src/scene-layout.ts` to import `computeTypedLayerPositions` /
   `computeTimeOrientedPositions` (+ the option types) from `@sentropic/graph`
   again, reducing `src/typed-layer-layout.ts` to a thin re-export shim.

Do **not** merge that un-vendor commit before the publish — graphify resolves the
**published** package at runtime, so it would re-introduce the install-time
`SyntaxError` until 0.2.0 is actually on npm.

## Future (out of scope here)

Consider adding `@sentropic/graph` to a tag-driven CI publish job (mirroring the
`@sentropic/graphify` `publish` job) so this stops being a manual step. Tracked
separately.
