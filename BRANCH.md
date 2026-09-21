# feat/agent-memory-312-obligations — external-host amendment (#312) obligations

Base: `origin/main` 1a723695. Scope: **embedded-local** (external-host activation out of scope until the operating agreement is signed, §12 W-C/ARCH-06; the obligations still bind embedded-local). Test-first; ≤150 lines/commit; selective staging; boxes checked in the commit; no AI attribution; no merge without review + owner gate.

## R1a — contracts (data-only DTOs + shape validator)
- [x] DTOs (§5.10/§5.7/§5.9): `AdminProviderPort`, `AdminBootstrapRequestV1`/`AdminRotateRequestV1`/`AdminRevokeRequestV1`, `AdminEpochReceiptV1`, `AdminOperationRequestV1`, `CanonicalMemoryStoreFactoryV1`+`FencedStoreConstructionV1`, `AttestationSignature`+attestation fields on `OperationalCapabilityReceiptV1`, `admin_provider?` on `MemoryEngineDependenciesV2`.
- [x] `validateAdminOperationRequest` shape gate + RED→GREEN `tests/memory-admin-contract.test.ts`.

## R1b — `MemoryPortV2.admin` entry point + dispatch  [PENDING]
- [ ] admin() on MemoryPortV2 + engine dispatch: `FENCE_LOST` (bad/absent storage_epoch before dispatch) · dispatch bootstrap|rotate|revoke · `UNAUTHORIZED` on provider denial · `CAPABILITY_UNAVAILABLE` when no `admin_provider`. `tests/memory-admin-entry.test.ts`.

## R1c — `CanonicalMemoryStoreFactoryV1.acquire` (fence-at-construction, single-broker refusal)  [PENDING]
- [ ] `tests/canonical-store-factory.test.ts`.

## R1d — capability attestation verification in `createMemoryPortV2`  [PENDING]
- [ ] `tests/capability-attestation.test.ts`.

## R1e — `graphify-memory/integration` surface (factories/types/ports only)  [PENDING]
- [ ] `tests/integration-surface-neutrality.test.ts`.

## R1f — retire `createLocalAdministratorV1` + rework local-administrator + v1-removal  [PENDING]
- [ ] `tests/memory-v1-removal.test.ts`.
