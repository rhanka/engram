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

The host tuple (`--host-tuple`) is the sentropic delivery file carrying the
installed host-backend closure, the neutral contract, the locks, the Node 24
image by digest and the profiles. That delivery (G1/C9) does not exist yet:
the script requires the file as an explicit input, retains its bytes as
`receipts/e2-host-tuple.json` and binds them through the E2 provenance
(`hostClosure` in `receipts/e2-provenance.json`); P1 is preserved byte for
byte. A missing or incomplete tuple refuses fail-closed with `source-gap` —
no value is invented. Documented format (`e2-host-tuple/v1`):

```json
{
  "format": "e2-host-tuple/v1",
  "backend": { "name": "@sentropic/<backend>", "version": "0.3.0", "sourceHead": "<40 hex>", "archive": "host/<backend>.tgz", "sha256": "<64 hex>", "integrity": "sha512-…" },
  "neutralContract": { "path": "contracts/<contract>.d.ts", "version": "4.1.0", "sha256": "<64 hex>" },
  "locks": [{ "path": "locks/<lock>.json", "sha256": "<64 hex>" }],
  "nodeImage": "node:24-bookworm-slim@sha256:<64 hex>",
  "profiles": ["atomic-units-v1", "immutable-chains-v1", "immutable-boundaries-v1", "scope-outbox-v1", "fenced-writers-v1"]
}
```

Exact command for the 0.21.1 release (run once 0.21.1 is published; the real
generation is not executed here):

```sh
mkdir -p /tmp/e2-0.21.1
npm pack @sentropic/engram@0.21.1 --pack-destination /tmp/e2-0.21.1
npm view @sentropic/engram@0.21.1 name version gitHead dist --json > /tmp/e2-0.21.1-registry.json
curl -fsSL "$(node -p "require('/tmp/e2-0.21.1-registry.json').dist.attestations.url")" -o /tmp/e2-0.21.1-attestations.json
node scripts/memory-mcp-e2-manifest.mjs \
  --expected-version 0.21.1 \
  --tarball /tmp/e2-0.21.1/sentropic-engram-0.21.1.tgz \
  --registry-json /tmp/e2-0.21.1-registry.json \
  --attestations-json /tmp/e2-0.21.1-attestations.json \
  --host-tuple /path/to/e2-host-tuple.json \
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
  --host-tuple /path/to/e2-host-tuple.json \
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
