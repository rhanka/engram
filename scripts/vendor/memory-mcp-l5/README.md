# Sentropic artifact-manifest verifier snapshot

These files are unmodified bytes read with `git -C /home/antoinefa/src/sentropic show origin/main:<path>`.
`provenance.json` records the resolved commit, upstream paths and SHA-256 digests.
The checkpoint schema and proof catalog are required imports of Sentropic's verifier; only
`checkArtifactManifest` is used by the E2 producer. This snapshot adds no npm dependency.

The authoritative source is Sentropic's `tools/memory-mcp-l5/`. Updating this snapshot requires
retaining its new source commit and digests, and rerunning the E2 schema tests.
