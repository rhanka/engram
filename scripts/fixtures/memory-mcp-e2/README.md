# Published E2 evidence

`registry.json` is the result of `npm view @sentropic/engram@0.20.0 name version gitHead dist --json`.
`attestations.json` is the exact npm-registry response from the URL in `dist.attestations.url`.
Both were retained on 2026-10-18 for the superseded 0.20.0 `./memory-tools`
reference. They are superseded evidence, not inputs: the script takes no
default version and reads no fixture by itself.

The target version is a mandatory parameter. The script verifies
`pkg.exports['./memory-substrate'].import === './dist/memory-substrate.js'`,
inventories package.json, the entry JS/d.ts and every statically reached
chunk, then binds the real published tarball (npm integrity sha512, shasum,
gitHead and SLSA provenance from the retained registry evidence).

Exact command for the 0.21.1 release (run once 0.21.1 is published; the real
generation is not executed here):

```sh
npm pack @sentropic/engram@0.21.1 --pack-destination /tmp/e2-0.21.1
npm view @sentropic/engram@0.21.1 name version gitHead dist --json > /tmp/e2-0.21.1-registry.json
# fetch the exact response from dist.attestations.url into /tmp/e2-0.21.1-attestations.json
node scripts/memory-mcp-e2-manifest.mjs \
  --expected-version 0.21.1 \
  --tarball /tmp/e2-0.21.1/sentropic-engram-0.21.1.tgz \
  --registry-json /tmp/e2-0.21.1-registry.json \
  --attestations-json /tmp/e2-0.21.1-attestations.json \
  --p1-manifest /path/to/p1/pre-candidate-manifest.json \
  --p1-sha256 68181613ff36b601d7f6bb62550294fdcd2c0ad26f2ed25cc1ad2fa633fafd5a \
  --output-dir /path/to/lot2-bundle
```

Generate a draft offline (P1 digest `68181613ff36b601d7f6bb62550294fdcd2c0ad26f2ed25cc1ad2fa633fafd5a`
is passed as a parameter at bind time, never prefilled in the script):

```sh
node scripts/memory-mcp-e2-manifest.mjs --expected-version 0.21.1 \
  --tarball /path/to/sentropic-engram-0.21.1.tgz \
  --registry-json /path/to/e2-0.21.1-registry.json \
  --attestations-json /path/to/e2-0.21.1-attestations.json \
  --pre-binding --output-dir /path/to/e2-draft
```

Once P1 is delivered, replace `--pre-binding` with
`--p1-manifest /path/to/p1/pre-candidate-manifest.json --p1-sha256 <exact-manifest-sha256>`.
The output retains P1's manifest, verified archives and contract files, E2's exact archive and
evidence, and the final manifest with its SHA-256 sidecar. It does not build or qualify an engine.
Every resolution passes through the verified bytes of `ARTIFACT_MANIFEST`: no sibling sources,
no network at open. P1 is preserved and compared byte for byte, never mixed with another digest.

Run the tests offline (deterministic local tarball fixture, no registry access):

```sh
npm test -- tests/memory-mcp-e2-manifest.test.ts
```

Optionally set `ENGRAM_E2_SENTROPIC_REPO` to compare the vendored verifier bytes to their recorded Git commit.
