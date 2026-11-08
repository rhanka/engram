export {
  EXTRACTION_CACHE_ENTRY_SCHEMA_V2,
  EXTRACTION_KEY_SCHEMA_V1,
  EXTRACTION_SEMANTICS_VERSION,
  checkCoverageGate,
  computeExtractionKey,
  createCachedExtractionEntry,
  getOrExtract,
  lookupCachedExtraction,
  normalizeExtractionIdentity,
  transitionCoverageRecord,
} from "./extraction-cache.js";
export type {
  CachedExtractionEntryV2,
  ComputeExtractionKeyResult,
  CoverageGateResult,
  CoverageKey,
  CoverageRecordV1,
  CoverageRegistryPort,
  CoverageStatus,
  CoverageTransitionInput,
  CreateCachedExtractionEntryResult,
  ExtractionCacheLookupResult,
  ExtractionCachePort,
  ExtractionChunkingV1,
  ExtractionIdentityInput,
  ExtractionIssue,
  ExtractionKey,
  ExtractionModelPolicyV1,
  ExtractionPromptIdentityV1,
  ExtractionReceiptV1,
  ExtractionRefusalCode,
  ExtractionTerminalStatus,
  GetOrExtractResult,
  NormalizedExtractionIdentityV1,
  NormalizeExtractionIdentityResult,
  ProducedExtraction,
  RefusedProduction,
} from "./extraction-cache.js";
export {
  extractionCitationKey,
  unionExtractionCitations,
} from "./citations.js";
export { mergeExtractionsWithCitations } from "./extract-git.js";
export type {
  ExtractionMergeConflict,
  ExtractionMergeConflictKind,
  MergeExtractionsOptions,
  MergeExtractionsResult,
} from "./extract-git.js";

