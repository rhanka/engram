// engram-memory/integration — the neutral surface an external host instantiates (§1 D1): factories, types,
// and ports ONLY. It carries no process, listener, supervisor, signal handler, credential store, or consumer
// import, and confers no server semantics; the external host — not graphify — supplies any process,
// supervision, and transport, and the concrete canonical-store opener it passes to the factory
// (engram-memory/sqlite or engram-memory/postgres, whose driver dependencies stay isolated there).
//
// Decision B (§5.10): graphify ships no built-in administrator. The host injects an AdminProviderPort (typed
// here) — this surface exports no local-administration factory. Store provenance (§5.9) is graphify-owned (the
// factory's in-process mark + compiled identity), not an injected verifier.

// Engine factory: the host constructs the memory port from injected neutral ports.
export { createMemoryPortV2 } from "./engine.js";

// Graphify-owned fenced-store factory (§5.7) + its §5.9 in-process provenance mark and admission predicate:
// the host passes its own sqlite/postgres opener; graphify stamps and verifies provenance (no key, no signature).
export {
  createCanonicalMemoryStoreFactoryV1,
  isFencedFactoryStoreV1,
  verifyStoreProvenance,
  ENGRAM_MEMORY_ADAPTER_IDENTITY,
  type CanonicalMemoryStoreFactoryOptionsV1,
  type FencedStoreOpenerV1,
} from "./store-factory.js";

// §10 conformance harness the host runs against its injected AdminProviderPort (§5.10 denial invariant).
export {
  assertAdminProviderConformance,
  type AdminProviderConformanceCasesV1,
} from "./admin-conformance.js";

// All data-only DTOs, port signatures, errors, and receipts.
export type * from "./contracts/index.js";
