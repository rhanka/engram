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
export {
  runRefsCapability,
  runHistoryDagCapability,
  runGithubPrCapability,
  runRetentionRequestsCapability,
} from "./factory-history.js";
export type { CommittedHistoryRuntimeContext } from "./factory-history.js";
export {
  runIndexSnapshotCapability,
  runWorkingTreeCapability,
  runDiffsCapability,
  runReconciliationCapability,
  runPublicationCapability,
} from "./factory-local.js";
export * from "./facts.js";
export * from "./batch-codec.js";
export * from "./generation.js";
export * from "./line-attribution.js";
export * from "./symbol-history.js";
export { analyzeCode, repairAffectedCalls } from "./code-analysis.js";
export type { DeterministicParsePort, ParsedUnit, RepairAffectedInput, RepairAffectedOutcome, SyntaxEvidence } from "./code-analysis.js";
export { createProductionParseAdapter } from "./parse-adapter.js";
export {
  bindReusedExtractionRuntime,
  extractReused,
  extractReusedWithDiagnostics,
  resolveReusedLiveLanguage,
  REUSED_EXTRACTION_VERSION,
  LIVE_DIALECT_VERSION as REUSED_LIVE_DIALECT_VERSION,
  LIVE_GRAMMAR_ABI as REUSED_LIVE_GRAMMAR_ABI,
} from "./reused-extraction.js";
export type {
  ExtractionResult as ReusedExtractionResult,
  ExtractWithDiagnosticsResult as ReusedExtractWithDiagnosticsResult,
  LiveExtractionPorts as ReusedLiveExtractionPorts,
} from "./reused-extraction.js";
export { createSafeGitExecutor } from "./git-executor.js";
export type { SafeGitExecutor, SafeGitOptions, GitSpawnFn, GitSpawnOptions, GitSpawnResult } from "./git-executor.js";
export * from "./git-protocol.js";
export {
  GIT_STREAM_EXTRACTOR_VERSION,
  GitStreamError,
  identityIsoDate,
  streamGitHistory,
} from "./git-stream.js";
export type {
  StreamedFileChange,
  StreamedIdentity,
  StreamedParentDiff,
  StreamedCommit,
  GitStreamOptions,
  GitStreamStats,
} from "./git-stream.js";
export * from "./history.js";
export * from "./refs.js";
export * from "./repository.js";
export * from "./retention.js";
export * from "./pr-sync.js";
export * from "./pr-attribution.js";
export * from "./worktree.js";
export * from "./attributes.js";
export * from "./filesystem.js";
export * from "./diffs.js";
export * from "./snapshots.js";
export * from "./content-policy.js";
export * from "./scheduler.js";
export * from "./watch.js";
export * from "./reconcile.js";
export * from "./coverage.js";
export * from "./derived-worktree-graph.js";
