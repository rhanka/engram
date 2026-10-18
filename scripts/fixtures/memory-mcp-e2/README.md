# Published E2 evidence

`registry.json` is the result of `npm view @sentropic/engram@0.20.0 name version gitHead dist --json`.
`attestations.json` is the exact npm-registry response from the URL in `dist.attestations.url`.
Both were retained on 2026-10-18; the producer pins their SHA-256 digests and the published SHA-512
integrity. It checks the SLSA subject, source commit and tag bindings, retains the complete Sigstore
bundle, and does not claim offline verification against Sigstore trust roots.

The published tarball SHA-256 is `6057c13905e7b63a16bfde7b70ed77bc9073076aba65f8e69e2188501351be66`.
The archive is deliberately supplied by the caller, never rebuilt from the working tree.
Its public memory surface is `./memory-tools` (in-process tools with an injected engine);
the archive does not export the canonical engine or store factory. These receipts identify the
published option-B reference, not a new engine build or L5 qualification.

Generate a draft offline:

```sh
node scripts/memory-mcp-e2-manifest.mjs --tarball /path/to/sentropic-engram-0.20.0.tgz --pre-binding --output-dir /path/to/e2-draft
```

Once P1 is delivered, replace `--pre-binding` with
`--p1-manifest /path/to/p1/pre-candidate-manifest.json --p1-sha256 <exact-manifest-sha256>`.
The output retains P1's manifest, verified archives and contract files, E2's exact archive and
evidence, and the final manifest with its SHA-256 sidecar. It does not build or qualify an engine.

Run the tests offline against the published archive (synthetic P1 inputs exist only inside tests):

```sh
ENGRAM_E2_TARBALL=/path/to/sentropic-engram-0.20.0.tgz npm test -- tests/memory-mcp-e2-manifest.test.ts
```

Without that environment variable, only the prerequisite tests run. Optionally set
`ENGRAM_E2_SENTROPIC_REPO` to compare the vendored verifier bytes to their recorded Git commit.
