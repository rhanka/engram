# Provenance of the vendored L0-D fixtures

The four files in this directory are byte-identical copies of the frozen
h2a L0-D evidence at h2a commit `41d647342` (PR h2a #376), recorded in the
h2a worktree `BRANCH.md` fixture-integrity section (lines 70–74) and in
section 2.2 of the engram time-reference contract
(`SPEC-time-reference-contract.md`, Tour 3 revision, 2026-10-18).

Source path:
`packages/agent-stats/tests/fixtures/velocity/` of the h2a checkout.

| Fixture | SHA-256 | Bytes |
|---|---|---:|
| `github-sample.json` | `5f46c9f98fc97e0efd9caa7bfdb39a9cca3088a7c7fb6204b119d1724ce1452a` | 171533 |
| `engram-enriched.json` | `37a9c54032d3b56dd0c78f0aab886da260502a7805b2c898e7fa7377b2596ab7` | 15317 |
| `engram-older.json` | `be8e2abc21fec7a775b9db26329915ff1be7e275abec790dead565eedeceb97f` | 28540 |
| `skipped-check-anomalies.json` | `c2f53819003af26509f0df38fb4c2b7eb4c4a7edfb53ed154c6d43ec56022a65` | 8439 |

These bytes are replayable archive evidence only. The canonical DTOs accept
exactly one shared form (spec section 15): archived spellings (`pr`,
pull-request-level `installedAt` / `reviewRoundsActual`, reported-hours
fields, snake_case instants) are rejected as current DTO input. No
re-canonicalized copy passes as the archive (TR-01).
