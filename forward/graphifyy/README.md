# graphifyy → moved to `@sentropic/graphify`

This package is **deprecated**. It is a thin forwarding shim that depends on and re-exports [`@sentropic/graphify`](https://www.npmjs.com/package/@sentropic/graphify).

```bash
npm install -g @sentropic/graphify
```

- `require('graphifyy')` re-exports `@sentropic/graphify` (API unchanged).
- The `graphify` CLI bin re-runs `@sentropic/graphify`'s CLI with the same arguments.

The CLI and skill command are unchanged — still `graphify`. Please migrate to `@sentropic/graphify`.

## Publishing this shim (maintainers)

This shim is published separately from the main package and only needs a fresh publish when the pinned `@sentropic/graphify` version changes:

```bash
cd forward/graphifyy
npm publish            # publishes graphifyy@<version>
npm deprecate graphifyy "moved to @sentropic/graphify"
```
