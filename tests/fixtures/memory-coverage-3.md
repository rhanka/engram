# Memory coverage-3 evidence — 2026-10-16

Scope: A–D of the owner request, based on `fd649ee7`. No production behavior
change, dependency installation, Python, external network call, image pull or push.

- **A:** all 101 interfaces in EVOL's TypeScript blocks are compared by member
  name and optionality. The inventory explicitly rejects the prose matches
  `interface graphify` and `interface so`. The complete `restoreLogical`
  signature additionally locks `target_store` and `LogicalBackupImportReceiptV1`.
- **B:** each of the six full pins in EVOL §2 is read with `git show pin:path`.
  The historical admission/recall/factory/CLI fixtures execute against their
  pinned modules; admission refusals never enter the corpus. Recall captures
  inputs before filtering, including `live`, `closed-before`, private and
  tombstoned notes. The operational round-trip literal and storage graph/SQL
  fixtures are extracted without opening their old database modules. Producer
  shape-only examples are not stored records. Even the pre-port pins contain
  the graph storage fixture `other`; those matrix cells are therefore nonempty.
  Admission identities hash the actual pin's canonical array (which changes at
  `70dcfb96`); graph/SQL fixtures retain their actual stored ids. Original fields,
  including the SQL `props` representation, enter `migrateRetainedNeutralRecordsV1`
  without manufactured V2 digests/citations. All real historical inputs currently
  receive `missing_digest`; expected exclusion and ledger digests use an independent
  sorted-key JSON + SHA-256 reference in the test. This proves explicit exclusion,
  not a legacy-to-V2 converter. CI checkout retains history for these offline reads.
- **C:** both profile digests are independently calculated from the pinned
  half-life, tokenizer, BM25F weights, RRF and PPR configuration. Nonempty induced
  adjacency sends every eligible node to C, including its self-loop; an independent
  stationary-equation solution predicts PPR's C > A > B order. For each profile,
  an admitted closed interval first proves canonical exclusion. A documented
  scoring seam then supplies/revalidates it at its endpoint while the ranker
  receives a date 30 days later: independently expected recency is exactly 1/2.
  This does not claim a production temporal store serves closed-before records.
- **D:** all 1,344 replay/fault cells remain (24 tests × 56 cells); all 162 directed
  graph shapes/orders remain (18 tests × 9 cases). Each has a 60-second timeout
  and an assertion of its exact case count. The previously uncalled live Postgres
  temporal/recallAsOf block is now included in the mandatory lane.

Mutation runs produced assertion failures, then restored every edited source byte
for byte: all 101 interface optionalities (101), prose inventory (1), restore target
(1), all six ledger generations (6), dropping `closed-before` (3), silent exclusion
loss (6), doubled half-life (2), profile citation weight (2), PPR parameter (2), zero
PPR mass without changing configuration (2), lost graph node ownership across every
property shard (42). Local detailed reports are under
`.graphify/scratch/coverage-3/`; that directory is ignored.

Gate: `npx --no-install vitest run --fileParallelism=false` over the six changed or
newly wired suites: **213 passed, zero skipped**, plus **2 passed** in
`postgres-ephemeral.test.ts`; `npx tsc --noEmit -p .` and `git diff --check` pass.
The local run maps both matrix slots to the already present `postgres:17-alpine`;
**only Postgres 17 was executed locally**, with `--pull=never`, and every owned
container was removed. It does not claim a local Postgres 16 qualification.

**Unclosed EVOL §10 clause:** the migration ledger carries only a digest, no
signature. The “signed exclusion ledger” requirement remains unsatisfied and is
not reinterpreted. Package/generated-artifact archival and the host projection
obligations/owner ratification identified by the reviews remain outside this lot.
