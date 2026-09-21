# feat/agent-memory-312-obligations — external-host amendment (#312) obligations

Base: `origin/main` 1a723695. Scope: **embedded-local** (external-host activation out of scope until the operating agreement is signed, §12 W-C/ARCH-06; the obligations still bind embedded-local). Test-first; ≤150 lines/commit; selective staging; boxes checked in the commit; no AI attribution; no merge without review + owner gate.

## R1a — contracts (data-only DTOs + shape validator)
- [x] DTOs (§5.10/§5.7/§5.9): `AdminProviderPort`, `AdminBootstrapRequestV1`/`AdminRotateRequestV1`/`AdminRevokeRequestV1`, `AdminEpochReceiptV1`, `AdminOperationRequestV1`, `CanonicalMemoryStoreFactoryV1`+`FencedStoreConstructionV1`, `AttestationSignature`+attestation fields on `OperationalCapabilityReceiptV1`, `admin_provider?` on `MemoryEngineDependenciesV2`.
- [x] `validateAdminOperationRequest` shape gate + RED→GREEN `tests/memory-admin-contract.test.ts`.

## R1b — `MemoryPortV2.admin` entry point + dispatch  [admin-entry DONE · retirement PENDING]
- [x] admin() on MemoryPortV2 + engine dispatch: `CAPABILITY_UNAVAILABLE` when no `admin_provider` (before any other check) · `INVALID_SCHEMA` on malformed request · bootstrap `FENCE_LOST` unless `request.storage_epoch` equals the live fence epoch (before dispatch) · dispatch bootstrap|rotate|revoke per discriminant · provider denial passes through as `UNAUTHORIZED`. `tests/memory-admin-entry.test.ts` (7 cases). Comment-anchors on the 5 non-type-expressible constraints + SHAPE-GATE note on `validateAdminOperationRequest` (g-arch review items 1–2).
- [ ] Retire `createLocalAdministratorV1` (index.ts:59 / service.ts:199) + wire the `CAPABILITY_UNAVAILABLE` refusal "rather than shipping a default administrator" (§5.10); rework `tests/local-administrator.test.ts` + extend `tests/memory-v1-removal.test.ts`. Pulled forward from R1f per g-arch: R1a widened the window (the port now exists, a consumer could adopt the retired path).

### Conformance note — why `admin()` was deferred from R1a to R1b (g-arch review item 4)
Both ways of making R1a compile with `admin()` present violate the spec, so neither was shipped in R1a:
- **optional `admin?()`** weakens the §5.5 mandate that admin is the single graphify-mediated entry point (dispatch becomes skippable);
- **required `admin()` + a stub** ships a default administrator that §5.10 explicitly retires.
Deferring the method (not just avoiding a tsc break) is therefore the only spec-faithful option — the interface stays consistent with §5.5/§5.10 until the dispatch lands in R1b.

## R1c — `CanonicalMemoryStoreFactoryV1.acquire` (fence-at-construction, single-broker refusal)  [PENDING]
- [ ] `tests/canonical-store-factory.test.ts`.

## R1d — capability attestation verification in `createMemoryPortV2`  [PENDING]
- [ ] `tests/capability-attestation.test.ts`.

## R1e — `graphify-memory/integration` surface (factories/types/ports only)  [PENDING]
- [ ] `tests/integration-surface-neutrality.test.ts`.

## R1f — retire `createLocalAdministratorV1` + rework local-administrator + v1-removal  [PENDING]
- [ ] `tests/memory-v1-removal.test.ts`.
