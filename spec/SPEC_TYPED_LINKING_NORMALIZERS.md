# Typed-linking normalizer contract (L3)

`node_types.<type>.linking` is an opt-in contract. A node type without this
block keeps its historical normalizers: reconciliation and ontology output do
not switch to cite's deaccenting matcher.

```yaml
node_types:
  Zone:
    registry: zones
    linking:
      preset: gazetteer-exact # stored in L3; expanded by L4
      normalize:
        builtin: [case_fold, dash_fold, collapse_ws]
        fn: ./zone-normalize.mjs#normalizeZoneCode
```

The ordered built-ins are `case_fold@1`, `dash_fold@1`, and
`collapse_ws@1`; they run from left to right, followed by `fn`. If `linking`
or `linking.normalize` omits `builtin`, the default is
`normalizeForMatch` (`normalize_for_match@1`). The configured record ID is
never normalized.

The `fn` module is a trusted local ESM `module#export` whose export is a
synchronous `(value: string) => string`. L3 only accepts autonomous modules:
no imports, re-exports, or dynamic imports. The normalized profile fingerprints
the bytes of that one file; allowing local transitive imports would require
fingerprinting their complete closure and is intentionally deferred.

At registry load, before corpus scanning, Graphify evaluates every registry
label and alias to verify synchronous string results, determinism, idempotence,
and no empty result for a non-empty key. It rejects a
`normalizer_collision` only when two distinct record IDs produce the same key
in the same partition. Equal keys in separate partitions remain valid.

The normalized profile stores a portable descriptor—built-in versions, export
name, module SHA-256, and normalizer hash—without an absolute module path. That
descriptor is included in `profile_hash`, so changing the module's bytes makes
existing linking and reconciliation artifacts stale.
