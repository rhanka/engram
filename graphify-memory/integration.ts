// graphify-memory/integration — the neutral surface an external host instantiates (§1 D1): factories, types,
// and ports ONLY. It carries no process, listener, supervisor, signal handler, credential store, or consumer
// import, and confers no server semantics; the external host — not graphify — supplies any process,
// supervision, and transport, and the concrete canonical-store opener it passes to the factory
// (graphify-memory/sqlite or graphify-memory/postgres, whose driver dependencies stay isolated there).
//
// Decision B (§5.10): graphify ships no built-in administrator. The host injects an AdminProviderPort and a
// CapabilityAttestationVerifierPort (typed here) — this surface exports no local-administration factory.

// Engine factory: the host constructs the memory port from injected neutral ports.
export { createMemoryPortV2 } from "./engine.js";

// Graphify-owned fenced-store factory: the host passes its own sqlite/postgres opener (§5.7).
export {
  createCanonicalMemoryStoreFactoryV1,
  type CanonicalMemoryStoreFactoryOptionsV1,
  type FencedStoreOpenerV1,
} from "./store-factory.js";

// Capability attestation predicate (§5.9), for a host that builds its own attesting store factory.
export { verifyCapabilityAttestation } from "./attestation.js";

// All data-only DTOs, port signatures, errors, and receipts.
export type * from "./contracts/index.js";
