/**
 * `@sentropic/engram/memory-substrate` — public canonical memory substrate
 * over the injected neutral module-storage contract (0.21.0).
 *
 * A library facade over the memory engine and the Engram canonical-store
 * adaptation built on the neutral port. Importing it opens no store,
 * acquires no capability, loads no driver, starts no process, and registers
 * no tool or provider. The explicit construction receives the already
 * provisioned neutral port from the host; Engram resolves no DSN,
 * credential, pool, or backend by name, and imports no cluster-mesh package
 * and no database driver through this entry.
 *
 * Closed value list (amendment §1.2): `createMemoryPortV2` keeps its
 * existing signature and receives the Engram store, never the generic
 * handle; `openModuleStorageCanonicalMemoryStoreV1` builds the canonical
 * Engram adaptation over the injected neutral port. No default export,
 * no `export *`; the private SQL openers are not exports of this entry.
 */
export { createMemoryPortV2 } from "../../engram-memory/dist/engine.js";
export { openModuleStorageCanonicalMemoryStoreV1 } from "../../engram-memory/dist/module-storage-memory-store.js";
export type {
  Result, MemoryErrorV1, MemoryErrorCode, MemoryOperation,
  Digest, Cursor, Instant, OpaqueRef, IdempotencyKey, JsonPointer,
  ValidIntervalV1, CitationLocatorV1, CitationV1, MemoryComponentKind,
  MemoryComponentV2, PrimaryEventAnchorV1, DerivationLineageV1,
  RetentionV1, ReconciliationConsentV1, CandidatePayloadV2,
  MemoryPortV2,
  MemoryEngineDependenciesV2,
  CaptureRequestV2, CaptureAcknowledgementV1,
  AdmissionRequestV1, AdmissionOutcomeV1,
  LifecycleCommandV1, LifecycleCommandBaseV1, LifecycleEventAnchorV1,
  LifecycleReceiptV1, MemoryState, MemoryRecordV2, TrustBindingV1,
  EvidenceBundleV1,
  AuthorizationPort, AuthorizationContextV1, AuthorizationResourceV1,
  AuthorizationRequestV1, AuthorizationResultV1, AuthorizationAllowedV1,
  AuthorizationDeniedV1, AuthorizationRevalidationV1,
  RedactionDirectiveV1, RedactionRequestV1, RedactionResultV1,
  AdmissionPolicy, AdmissionPolicyRequestV1,
  AdmissionDecisionEnvelopeV1, AdmissionDecision,
  CryptoPort, SealedCandidateEnvelopeV1, ClockPort,
  CanonicalMemoryStorePort, CanonicalStoreCapabilitiesV1,
  CanonicalTransactionReceiptV1, LifecycleEventV2,
  CaptureIdempotencyRecordV1, PersistedCaptureIdempotencyV1,
  PersistedAdmissionOutcomeV1, RecoveryCheckpointManifestV1,
} from "../../engram-memory/dist/contracts/index.js";
export type {
  GuardedMemoryPortV2, MemoryFirstEffectGuardV1,
} from "../../engram-memory/dist/engine.js";
export type {
  ModuleStorageMemoryStoreOptionsV1,
} from "../../engram-memory/dist/module-storage-memory-store.js";
