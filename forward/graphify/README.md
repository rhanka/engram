# @sentropic/graphify → Engram (`@sentropic/engram`)

> Deprecated: `graphify` has become **Engram** (`@sentropic/engram`) — a different product (agent memory substrate), not a rename-in-place. This package is a forwarding shim: it installs and re-exports Engram so existing `graphify` installs keep working. Migrate: `npm i @sentropic/engram`, use bin `engram`, `ENGRAM_*`, `.engram/`. Heritage note: Engram descends from `graphify`; no further releases occur under this name.

```bash
npm install -g @sentropic/engram
```

- `require('@sentropic/graphify')` re-exports `@sentropic/engram` (API unchanged).
- The `graphify` CLI bin re-runs `@sentropic/engram`'s CLI with the same arguments, printing a one-line stderr deprecation notice (silenced by `ENGRAM_QUIET_DEPRECATION=1`).

The CLI is now `engram`. Please migrate to `@sentropic/engram`.

## Publishing this shim (maintainers)

This shim is published separately from the main package and only needs a fresh publish when the pinned `@sentropic/engram` version changes:

```bash
cd forward/graphify
npm publish            # publishes @sentropic/graphify@<version> as a shim
npm deprecate @sentropic/graphify@"<version>" "graphify has become Engram (@sentropic/engram)"
```

The old npm name is deprecated, never unpublished: existing installs keep resolving.
