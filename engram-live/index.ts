// @sentropic/engram-live — neutral live entry
// (spec/SPEC_LIVE_GIT_INDEXING.md §3, §11; plan/09 L1b).
//
// "." re-exports the data-pure contracts and the executable factory seam.
// Consumers import /contracts at the adapter boundary and /integration for
// the factory and the canonical identity derivation (cloneId/worktreeId/
// declarationId); the releases are staged neutral package → contracts →
// cluster-mesh → h2a pins (§11).

export * from "./contracts.js";
export * from "./integration.js";
