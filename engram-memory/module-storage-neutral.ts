/**
 * Vendored neutral declarations for the `engram-memory` module binding.
 *
 * Provenance (no cluster-mesh import, runtime or type-level):
 * - L3a frozen port `spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md` v4.1,
 *   bytes SHA-256 `c7111c9e7293ee270a0b4dde277f1cfc40fa3c863c3915c6f9ccdd6935c46294`.
 *   Field names reused here (`AtomicUnit`, `ModuleTransaction`, `ScopeGrant`,
 *   `StorageScope`, `ChainExpectation`, …) mirror F §4.1/§5.2 exactly for the
 *   subset the memory binding consumes. Unused F unit members (relationships,
 *   barriers, purge intents, staged units) are carried as empty, documented
 *   placeholders: the memory binding never stages imports, purges, or
 *   cross-module relationships (amendment §2.1).
 * - Binding `SPEC-memory-module-binding-L3a.md` (2026-10-18, co-signed except
 *   GAP-G2-1 open; C6 asset still `unverified`): §2 (moduleId, descriptor),
 *   §3 (kinds, codecs), §4 (queries, boundaries, limits), §5 (units, index
 *   policies), §7 (scope binding), §8 (cursor, replay, receipts, checkpoint),
 *   §9 (G3 fence requirements), §11 (C1–C10 register).
 * - Structural model M2 `packages/cluster-mesh/src/comments/postgres.ts`
 *   at sentropic `origin/main` (frozen descriptor, registration factory,
 *   storage factory fixing `moduleId`).
 *
 * Status: `MEMORY_MODULE_ID`, descriptor constants, kind/key encodings and
 * the u64 representation below are binding values to co-sign (C2/C5). The
 * `MEMORY_CONTRACT_DIGEST` is computed deterministically at load over the
 * canonical encoding of the descriptor without itself (non-circularity rule
 * of the memory receipts); its literal value is pinned by the substrate
 * test suite. Equivalence with the delivered neutral asset (C6) stays
 * `unverified` until recorded.
 */
import { createHash } from "node:crypto";

import { canonicalizeJcs } from "./canonical-json.js";

/** Binding value, to co-sign (C1): the L3a module identity of canonical memory. */
export const MEMORY_MODULE_ID = "engram-memory";

/** Required L3a profiles for the memory binding (amendment §2.1). */
export const MEMORY_REQUIRED_PROFILES = Object.freeze([
  "atomic-units-v1",
  "immutable-chains-v1",
  "immutable-boundaries-v1",
  "scope-outbox-v1",
  "fenced-writers-v1",
]);

/** Optional profiles: `leased-snapshots-v1` only under a detached-reader composition. */
export const MEMORY_OPTIONAL_PROFILES = Object.freeze(["leased-snapshots-v1"]);

const PROFILE_DIGEST_DOMAIN = "graphify-memory/l3a-profile/v1\0";

/** Pinned semantic digest of a profile claim (binding §6.3 step 1, to co-sign C2/C6). */
function profileDigest(name: string, version: string): string {
  const hash = createHash("sha256");
  hash.update(PROFILE_DIGEST_DOMAIN, "utf8");
  hash.update(name, "utf8");
  hash.update("\0", "utf8");
  hash.update(version, "utf8");
  return `sha256:${hash.digest("hex")}`;
}

/**
 * Pinned profile negotiation table (binding §2.2 rule 5, §6.3 step 1):
 * every required profile is pinned to its version and semantic digest.
 * A backend advertising a missing, wrong-versioned, or digest-mismatched
 * required profile refuses at construction, never degrades silently.
 */
export const MEMORY_PINNED_PROFILES: ReadonlyArray<NeutralProfileClaim> = (() => {
  const rows: NeutralProfileClaim[] = [];
  for (const name of [...MEMORY_REQUIRED_PROFILES, ...MEMORY_OPTIONAL_PROFILES]) {
    rows.push(Object.freeze({ name, version: "1", digest: profileDigest(name, "1") }));
  }
  return Object.freeze(rows);
})();

/** Registered named queries (binding §4.1). */
export const MEMORY_QUERY_NAMES = Object.freeze([
  "memory-journal-page",
  "memory-record-by-id",
  "memory-accepted-snapshot",
  "memory-outbox-page",
  "scope-chain-index",
]);

/** Registered boundaries (binding §4.2). */
export const MEMORY_BOUNDARIES = Object.freeze(["scope-root", "exact-cursor"]);

/** Schema versions carried by the memory types (binding §2.2). */
export const MEMORY_SCHEMA_VERSIONS = Object.freeze([
  "memory-journal-1",
  "memory-record-2",
  "memory-lifecycle-event-2",
  "memory-checkpoint-1",
]);

/** The single typed chain of the memory module (binding §3.1 K1). */
export const MEMORY_CHAIN_KINDS = Object.freeze({
  "memory-journal": Object.freeze({ kind: "memory-journal-event", chain: "memory-journal" }),
});

/** Immutable-record kinds (binding §3.1 K2, K6). */
export const MEMORY_RECORD_KINDS = Object.freeze({
  "memory-record-blobs": "memory-record-blob",
  "memory-projection-outbox": "memory-outbox-batch",
});

/** Aggregate kinds (binding §3.1 K3, K4, K5, K7, K8) plus the store-meta binding record. */
export const MEMORY_AGGREGATE_KINDS = Object.freeze({
  "memory-pending-controls": "memory-pending-control",
  "memory-sealed-envelopes": "memory-sealed-envelope",
  "memory-fold-state": "memory-fold-state",
  "memory-capture-idempotency": "memory-capture-idempotency",
  "memory-admission-outcomes": "memory-admission-outcome",
  "memory-store-meta": "memory-store-meta",
});

/** Lexical projection index carried inside units as index writes (reference composition). */
export const MEMORY_LEXICAL_INDEX = "memory-accepted-lexical";

export interface NeutralEncodedValue {
  readonly format: "utf8";
  readonly data: string;
}

export function neutralUtf8(data: string): NeutralEncodedValue {
  return { format: "utf8", data };
}

/** JCS bytes of an NFC-normalized value, per the memory canonicalization (binding §3.2). */
export function neutralJcs(value: unknown): NeutralEncodedValue {
  return { format: "utf8", data: canonicalizeJcs(value) };
}

export type NeutralChainExpectation =
  | { readonly kind: "absent"; readonly allocation: string }
  | { readonly kind: "head"; readonly hash: string };

export interface NeutralRecordWrite {
  readonly kind: string;
  readonly key: string;
  readonly value: NeutralEncodedValue;
  readonly contentHash: string;
}

export interface NeutralChainAppend {
  readonly chain: string;
  readonly kind: string;
  readonly id: string;
  readonly hash: string;
  readonly value: NeutralEncodedValue;
  readonly expectation: NeutralChainExpectation;
}

export interface NeutralAggregateUpdate {
  readonly kind: string;
  readonly key: string;
  readonly value: NeutralEncodedValue;
  readonly version: string;
}

export interface NeutralIndexWrite {
  readonly index: string;
  readonly key: string;
  readonly value: NeutralEncodedValue;
}

/** Unused by the memory binding; carried for wire-shape fidelity with F §5.2. */
export interface NeutralRelationshipChange {
  readonly kind: string;
}

/** Unused by the memory binding; carried for wire-shape fidelity with F §5.2. */
export interface NeutralBarrierWrite {
  readonly kind: string;
}

/** Unused by the memory binding; carried for wire-shape fidelity with F §5.2. */
export interface NeutralAuthorizedPurgeIntent {
  readonly kind: string;
}

export interface NeutralGuard {
  readonly kind: "chain-head" | "chain-absent" | "aggregate-version";
  readonly chain?: string;
  readonly hash?: string;
  readonly allocation?: string;
  readonly aggregateKind?: string;
  readonly aggregateKey?: string;
  readonly version?: string;
}

export interface NeutralAtomicUnit {
  readonly guards: ReadonlyArray<NeutralGuard>;
  readonly records: ReadonlyArray<NeutralRecordWrite>;
  readonly appends: ReadonlyArray<NeutralChainAppend>;
  readonly updates: ReadonlyArray<NeutralAggregateUpdate>;
  readonly relationships: ReadonlyArray<NeutralRelationshipChange>;
  readonly barriers: ReadonlyArray<NeutralBarrierWrite>;
  readonly purgeIntents: ReadonlyArray<NeutralAuthorizedPurgeIntent>;
  readonly indexWrites: ReadonlyArray<NeutralIndexWrite>;
  readonly moduleResult?: NeutralEncodedValue;
}

export interface NeutralWorkLimits {
  readonly maxAppends: number;
  readonly maxRecords: number;
  readonly maxEncodedBytes: number;
}

/** Writer-fence identity carried on every guarded verification and transaction (binding §§9.3–9.6). */
export interface NeutralWriterFence {
  readonly fenceId: string;
  readonly epoch: string;
}

export interface NeutralCommitOptions {
  readonly limits: NeutralWorkLimits;
  readonly idempotencyKey?: string;
  readonly grant: NeutralScopeGrant;
  /** Live acquisition identity: verified at entry, after waits, and at final commit validation. */
  readonly fence: NeutralWriterFence;
}

export interface NeutralCommitReceipt {
  readonly commitId: string;
  readonly journalCursor: string;
}

export interface NeutralAggregateRead {
  readonly kind: string;
  readonly key: string;
  readonly version: string;
  readonly value: NeutralEncodedValue;
}

export interface NeutralRecordRead {
  readonly kind: string;
  readonly key: string;
  readonly value: NeutralEncodedValue;
  readonly contentHash: string;
}

export interface NeutralChainRecord {
  readonly id: string;
  readonly hash: string;
  readonly value: NeutralEncodedValue;
}

export interface NeutralChainPage {
  readonly chain: string;
  readonly records: ReadonlyArray<NeutralChainRecord>;
}

export interface NeutralIdempotencySelector {
  readonly commitIdentity: string;
}

export interface NeutralIdempotencyEntry {
  readonly key: string;
  readonly intentHash: string;
  readonly moduleResult: NeutralEncodedValue;
}

export interface NeutralModuleTransaction {
  readAggregate(kind: string, key: string): Promise<NeutralAggregateRead | null>;
  readRecords(kind: string, keys: ReadonlyArray<string>): Promise<ReadonlyArray<NeutralRecordRead>>;
  readChain(input: { chain: string; afterAllocation?: string; limit: number }): Promise<NeutralChainPage>;
  findIdempotency(selector: NeutralIdempotencySelector): Promise<NeutralIdempotencyEntry | null>;
  apply(unit: NeutralAtomicUnit): Promise<void>;
}

export interface NeutralStorageScope {
  readonly tenantId: string;
  readonly workspaceId: string;
}

export type NeutralGrantLifetime =
  | { readonly kind: "invocation"; readonly invocationId: string }
  | { readonly kind: "lease"; readonly expiresAt: string };

export interface NeutralScopeGrant {
  readonly token: string;
  readonly moduleId: string;
  readonly scope: NeutralStorageScope;
  readonly principalId: string;
  readonly operations: ReadonlyArray<string>;
  readonly issuer: string;
  readonly authorityRevision: string;
  readonly policyRevision: string;
  readonly lifetime: NeutralGrantLifetime;
}

export interface NeutralProfileClaim {
  readonly name: string;
  readonly version: string;
  readonly digest: string;
}

export interface NeutralModuleDescriptor {
  readonly contractVersion: string;
  readonly contractDigest: string;
  readonly schemaVersions: ReadonlyArray<string>;
  readonly requiredProfiles: ReadonlyArray<string>;
  readonly optionalProfiles: ReadonlyArray<string>;
  readonly chainKinds: ReadonlyArray<string>;
  readonly queryNames: ReadonlyArray<string>;
  readonly boundaries: ReadonlyArray<string>;
  readonly pageLimits: { readonly maxRecords: number; readonly maxEncodedBytes: number };
}

export type NeutralStorageErrorCode =
  | "fence-lost"
  | "fence-conflict"
  | "unauthorized"
  | "authorization-expired"
  | "authorization-revoked"
  | "capability-unavailable"
  | "cas-conflict"
  | "digest-conflict"
  | "limit-exceeded"
  | "store-unavailable"
  | "not-found"
  | "invalid-schema";

/** Typed backend failure (binding §9.6 rule 2: loss, contention, revocation and unavailability stay distinct). */
export class NeutralStorageError extends Error {
  readonly code: NeutralStorageErrorCode;
  constructor(code: NeutralStorageErrorCode, message: string) {
    super(message);
    this.name = "NeutralStorageError";
    this.code = code;
  }
}

export interface NeutralFenceProof {
  readonly fenceId: string;
  readonly epoch: string;
}

/**
 * Identified neutral-contract asset (binding §1.2/C6): the frozen L3a
 * v4.1 bytes this vendored declaration is equivalent to, plus the
 * additive installed contract recorded below. Equivalence is by the
 * recorded field-name mirror (F §4.1/§5.2 names reused exactly); every
 * member without a frozen counterpart is listed in
 * NEUTRAL_ADDITIVE_ASSETS, never silently merged.
 */
export const NEUTRAL_CONTRACT_ASSET = Object.freeze({
  name: "l3a-generic-module-storage-port",
  version: "v4.1",
  digest: "c7111c9e7293ee270a0b4dde277f1cfc40fa3c863c3915c6f9ccdd6935c46294",
});

/** Additive installed contract beyond the frozen bytes, explicitly listed (C6). */
export const NEUTRAL_ADDITIVE_ASSETS: ReadonlyArray<string> = Object.freeze([
  "acquireFence/checkFence/releaseFence canonical-instance acquisition (binding §9)",
  "CommitOptions.fence writer-fence identity (binding §§9.3–9.6)",
  "readCommitResult scoped original-result recovery (R-G4-7, binding §8.2)",
  "profileClaims with pinned versions and semantic digests (binding §6.3)",
  "memory-* named queries and scope-chain-index for memory-journal (binding §4.1)",
  "memory key encodings, codec manifest, and index policies in the contract digest (binding §§2.2.3, 3.1, 3.2, 5.3)",
]);

export interface NeutralMemoryHandle {
  readonly moduleId: string;
  readonly descriptor: NeutralModuleDescriptor;
  /** Closed backend class (G5 stays blocked: no Spanner member). */
  readonly backend: "memory" | "sqlite" | "postgres";
  readonly profiles: ReadonlyArray<NeutralProfileClaim>;
  transact<T>(
    options: NeutralCommitOptions,
    operation: (transaction: NeutralModuleTransaction) => Promise<T>,
  ): Promise<{ readonly value: T; readonly receipt: NeutralCommitReceipt }>;
  /** Registered named queries of §4.1 (JCS in, JCS out). */
  query(name: string, input: NeutralEncodedValue, grant: NeutralScopeGrant): Promise<NeutralEncodedValue>;
  /** Snapshot aggregate read outside a transaction (grant-checked). */
  readAggregate(kind: string, key: string, grant: NeutralScopeGrant): Promise<NeutralAggregateRead | null>;
  /**
   * Scoped, authority- and ownership-checked commit-result recovery (R-G4-7).
   * Null when absent. Optional: a port without it degrades post-restart
   * original-receipt replay to an explicit refusal (C4 open), never to a
   * recomputed substitute.
   */
  readCommitResult?(commitIdentity: string, grant: NeutralScopeGrant): Promise<NeutralEncodedValue | null>;
  /** Canonical-instance acquisition (R-G3-1): refuses a second live holder, never queues. */
  acquireFence(input: { scope: NeutralStorageScope; store_id: string; grant: NeutralScopeGrant }): Promise<NeutralFenceProof>;
  /**
   * Freshness proof bound to the acquisition identity (binding §§9.3–9.6):
   * throws NeutralStorageError on loss, expiry, revocation, or epoch/fence mismatch.
   */
  checkFence(grant: NeutralScopeGrant, fence: NeutralWriterFence): Promise<void>;
  /** Acquisition-bound release: only the live holder clears the fence; a stale identity never clears a successor. */
  releaseFence(fence: NeutralWriterFence): Promise<void>;
}

/**
 * Grant-bound scoped surface returned by a binding `bind` call: the grant
 * is captured at bind time, so methods carry no per-call grant.
 */
export interface NeutralBoundScope {
  transact<T>(
    options: Omit<NeutralCommitOptions, "grant">,
    operation: (transaction: NeutralModuleTransaction) => Promise<T>,
  ): Promise<{ readonly value: T; readonly receipt: NeutralCommitReceipt }>;
  query(name: string, input: NeutralEncodedValue): Promise<NeutralEncodedValue>;
  readAggregate(kind: string, key: string): Promise<NeutralAggregateRead | null>;
  readCommitResult?(commitIdentity: string): Promise<NeutralEncodedValue | null>;
  acquireFence(input: { scope: NeutralStorageScope; store_id: string }): Promise<NeutralFenceProof>;
  checkFence(fence: NeutralWriterFence): Promise<void>;
  releaseFence(fence: NeutralWriterFence): Promise<void>;
}

/**
 * Specified binding interface (binding §6.2, L3a §6.3): the composition
 * binds a grant to a scope and receives the scoped surface. The delivered
 * generic binding is synchronous while the Postgres binding is
 * asynchronous; the constructor awaits either shape and MUST NOT assume
 * one. A pre-bound flat NeutralMemoryHandle stays consumable as-is.
 */
export interface NeutralModuleStorageBinding {
  readonly moduleId: string;
  readonly descriptor: NeutralModuleDescriptor;
  /** Closed backend class (G5 stays blocked: no Spanner member). */
  readonly backend: "memory" | "sqlite" | "postgres";
  readonly profiles: ReadonlyArray<NeutralProfileClaim>;
  bind(grant: NeutralScopeGrant): NeutralBoundScope | Promise<NeutralBoundScope>;
}

/** Compound identity-key encodings (binding §3.1; M2 `canonicalRecordKey` precedent). */
export function memoryRecordKey(recordId: string): string {
  return JSON.stringify(["memory-record-v1", recordId]);
}

export function memoryControlKey(candidateId: string): string {
  return JSON.stringify(["memory-pending-control-v1", candidateId]);
}

export function memoryEnvelopeKey(candidateId: string): string {
  return JSON.stringify(["memory-sealed-envelope-v1", candidateId]);
}

export function memoryStateKey(entityKind: "candidate" | "record", entityId: string): string {
  return JSON.stringify(["memory-state-v1", entityKind, entityId]);
}

export function memoryOutboxKey(throughCursorInclusive: string, batchDigest: string): string {
  return JSON.stringify(["memory-outbox-v1", throughCursorInclusive, batchDigest]);
}

export function memoryCaptureKey(candidateId: string): string {
  return JSON.stringify(["memory-capture-idempotency-v1", candidateId]);
}

export function memoryOutcomeKey(candidateId: string): string {
  return JSON.stringify(["memory-admission-outcome-v1", candidateId]);
}

export function memoryStoreMetaKey(): string {
  return JSON.stringify(["memory-store-meta-v1", "binding"]);
}

export function memoryLexicalKey(scopeRef: string, recordId: string): string {
  return JSON.stringify(["memory-lexical-v1", scopeRef, recordId]);
}

/**
 * Canonical lexical removal marker (binding §3.4 rule 2): the neutral index
 * write carries no delete primitive, so a transition out of
 * `accepted_current` writes the JCS null tombstone under the same key in the
 * same unit. Readers treat the tombstone as absent; recovery rebuilds the
 * surface from K1+K2 and never resurrects it.
 */
export function memoryLexicalTombstone(): NeutralEncodedValue {
  return { format: "utf8", data: "null" };
}

/** The single journal chain identity (binding §7.4). */
export function memoryJournalChain(): string {
  return "memory-journal";
}

/** Zero hash opening a genesis chain (binding §8.1). */
export function memoryZeroHash(): string {
  return `sha256:${"0".repeat(64)}`;
}

const MAX_U64 = 18_446_744_073_709_551_615n;
const U64_PATTERN = /^(0|[1-9][0-9]*)$/;

/** Canonical unsigned-64 decimal transport (binding §3.2 rule 6, R-G4-6): BigInt end to end, never Number. */
export function isCanonicalU64(value: unknown): value is string {
  if (typeof value !== "string" || !U64_PATTERN.test(value)) return false;
  try {
    return BigInt(value) <= MAX_U64;
  } catch {
    return false;
  }
}

export function compareU64(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Successor, or undefined at u64 exhaustion (refusal only at `2^64 - 1`, never a wrap). */
export function nextU64(value: string): string | undefined {
  const next = BigInt(value) + 1n;
  return next > MAX_U64 ? undefined : next.toString();
}

export function maxU64(): string {
  return MAX_U64.toString();
}

/** Named-query inputs/outputs in memory terms; the wire encoding stays JCS bytes (binding §4.1). */
export interface MemoryJournalPageInput {
  readonly after: string;
  readonly limit: number;
}

export interface MemoryRecordByIdInput {
  readonly record_id: string;
}

export interface MemoryAcceptedSnapshotInput {
  readonly system_as_of: string;
  readonly scope_ref?: string;
  readonly max_candidates: number;
}

export interface MemoryOutboxPageInput {
  readonly after: string;
  readonly limit: number;
}

export interface ScopeChainIndexOutput {
  readonly chain: string;
  readonly head: string;
  readonly allocation: string;
}

const DESCRIPTOR_DIGEST_DOMAIN = "graphify-memory/l3a-module-descriptor/v1\0";

function descriptorDigest(body: Record<string, unknown>): string {
  const hash = createHash("sha256");
  hash.update(DESCRIPTOR_DIGEST_DOMAIN, "utf8");
  hash.update(canonicalizeJcs(body), "utf8");
  return `sha256:${hash.digest("hex")}`;
}

/**
 * Codec identifiers and digest domains covered by the contract digest
 * (binding §3.2, to co-sign C2).
 */
export const MEMORY_CODEC_MANIFEST: ReadonlyArray<string> = Object.freeze([
  "jcs-rfc8785+nfc",
  "graphify-memory/payload/v2",
  "graphify-memory/record/v2",
  "graphify-memory/memory-journal-event/v1",
  "graphify-memory/memory-journal-intent/v1",
  "graphify-memory/canonical-transaction/v1",
  "graphify-memory/recovery-checkpoint/v1",
  "graphify-memory/accepted-lexical/v1",
  "graphify-memory/projection-outbox/v1",
  "graphify-memory/projection-batch/v1",
  "graphify-memory/capture-idempotency/v1",
  "graphify-memory/operational-capability/v1",
]);

/**
 * Registered kind and identity-key encodings covered by the contract digest
 * (binding §3.1, to co-sign C2).
 */
export const MEMORY_KEY_MANIFEST: ReadonlyArray<string> = Object.freeze([
  "memory-journal",
  "memory-record-v1",
  "memory-pending-control-v1",
  "memory-sealed-envelope-v1",
  "memory-state-v1",
  "memory-outbox-v1",
  "memory-capture-idempotency-v1",
  "memory-admission-outcome-v1",
  "memory-store-meta-v1",
  "memory-lexical-v1",
]);

/**
 * Registered index policies covered by the contract digest
 * (binding §5.3, to co-sign C2).
 */
export const MEMORY_POLICY_MANIFEST: ReadonlyArray<string> = Object.freeze([
  "first-proof-immutable:memory-capture-idempotency",
  "first-proof-immutable:memory-admission-outcomes",
  "journal-identity:memory-journal-event",
]);

/**
 * Registered kind mappings covered by the contract digest (binding §3.1,
 * to co-sign C2): selection/aggregate name → record kind and chain
 * derivation, mirroring the M2 `COMMENTS_CHAIN_KINDS` registry.
 */
export const MEMORY_KIND_MANIFEST: {
  readonly chains: Record<string, { readonly kind: string; readonly chain: string }>;
  readonly records: Record<string, string>;
  readonly aggregates: Record<string, string>;
} = Object.freeze({
  chains: { ...MEMORY_CHAIN_KINDS },
  records: { ...MEMORY_RECORD_KINDS },
  aggregates: { ...MEMORY_AGGREGATE_KINDS },
});

/**
 * Registered identity-key formats covered by the contract digest (binding
 * §3.1, to co-sign C2): the exact compound encodings each key helper emits.
 * Tags alone do not encode these formats, so every format is pinned here.
 */
export const MEMORY_KEY_FORMATS: ReadonlyArray<string> = Object.freeze([
  '["memory-record-v1","<record_id>"]',
  '["memory-pending-control-v1","<candidate_id>"]',
  '["memory-sealed-envelope-v1","<candidate_id>"]',
  '["memory-state-v1","candidate|record","<entity_id>"]',
  '["memory-outbox-v1","<through_cursor_inclusive>","<batch_digest>"]',
  '["memory-capture-idempotency-v1","<candidate_id>"]',
  '["memory-admission-outcome-v1","<candidate_id>"]',
  '["memory-store-meta-v1","binding"]',
  '["memory-lexical-v1","<scope_ref>","<record_id>"]',
]);

/**
 * Registered contract assets covered by the contract digest (binding §1.2,
 * to co-sign C2/C6): the frozen neutral bytes plus the explicitly listed
 * additive installed contract.
 */
export const MEMORY_ASSET_MANIFEST: {
  readonly contract: { readonly name: string; readonly version: string; readonly digest: string };
  readonly additive: ReadonlyArray<string>;
} = Object.freeze({
  contract: { ...NEUTRAL_CONTRACT_ASSET },
  additive: [...NEUTRAL_ADDITIVE_ASSETS],
});

/**
 * The frozen memory descriptor (binding §2.2, to co-sign C2). The digest
 * domain above is a binding value to co-sign: it records the
 * non-circularity rule (digest computed over the descriptor without
 * itself) without amending the frozen L3a text.
 *
 * The contract digest covers the complete registered contract manifest
 * (binding §2.2.3): descriptor fields, pinned profile claims with versions
 * and semantic digests, codecs and digest domains, kind/key encodings, and
 * index policies. Host-owned backend assets (migrations, projections) are
 * recorded at backend qualification (C8), never silently.
 */
/**
 * The complete registered contract manifest covered by the contract digest
 * (binding §2.2.3, to co-sign C2): descriptor fields, pinned profile claims
 * with versions and semantic digests, codecs and digest domains, kind
 * mappings, key tags and their formats, index policies, and asset digests.
 * Exported so every section gets its own digest-mutation test.
 */
export function memoryContractManifest(): Record<string, unknown> {
  return {
    contractVersion: "memory-binding-v1",
    schemaVersions: [...MEMORY_SCHEMA_VERSIONS],
    requiredProfiles: [...MEMORY_REQUIRED_PROFILES],
    optionalProfiles: [...MEMORY_OPTIONAL_PROFILES],
    chainKinds: Object.keys(MEMORY_CHAIN_KINDS),
    queryNames: [...MEMORY_QUERY_NAMES],
    boundaries: [...MEMORY_BOUNDARIES],
    pageLimits: { maxRecords: 2000, maxEncodedBytes: 1048576 },
    profileClaims: MEMORY_PINNED_PROFILES.map((claim) => ({ ...claim })),
    codecs: [...MEMORY_CODEC_MANIFEST],
    keys: [...MEMORY_KEY_MANIFEST],
    keyFormats: [...MEMORY_KEY_FORMATS],
    kinds: {
      chains: { ...MEMORY_KIND_MANIFEST.chains },
      records: { ...MEMORY_KIND_MANIFEST.records },
      aggregates: { ...MEMORY_KIND_MANIFEST.aggregates },
    },
    policies: [...MEMORY_POLICY_MANIFEST],
    assets: {
      contract: { ...MEMORY_ASSET_MANIFEST.contract },
      additive: [...MEMORY_ASSET_MANIFEST.additive],
    },
  };
}

/** Contract digest over a manifest, for mutation tests (binding §2.2.3). */
export function memoryDescriptorDigest(manifest: Record<string, unknown>): string {
  return descriptorDigest(manifest);
}

export const MEMORY_DESCRIPTOR: NeutralModuleDescriptor = (() => {
  const manifest = memoryContractManifest();
  const contractDigest = descriptorDigest(manifest);
  const {
    profileClaims: _claims, codecs: _codecs, keys: _keys, keyFormats: _formats,
    kinds: _kinds, policies: _policies, assets: _assets, ...body
  } = manifest;
  void _claims; void _codecs; void _keys; void _formats; void _kinds; void _policies; void _assets;
  return Object.freeze({ ...body, contractDigest }) as NeutralModuleDescriptor;
})();

/** Pinned neutral-contract digest consumed by construction (§6.3 step 1). */
export const MEMORY_CONTRACT_DIGEST: string = MEMORY_DESCRIPTOR.contractDigest;
