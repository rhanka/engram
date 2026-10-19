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

export interface NeutralCommitOptions {
  readonly limits: NeutralWorkLimits;
  readonly idempotencyKey?: string;
  readonly grant: NeutralScopeGrant;
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
  readonly epoch: string;
}

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
  /** Freshness proof: throws NeutralStorageError on loss, expiry, or revocation. */
  checkFence(grant: NeutralScopeGrant): Promise<void>;
  releaseFence(): Promise<void>;
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
 * The frozen memory descriptor (binding §2.2, to co-sign C2). The digest
 * domain above is a binding value to co-sign: it records the
 * non-circularity rule (digest computed over the descriptor without
 * itself) without amending the frozen L3a text.
 */
export const MEMORY_DESCRIPTOR: NeutralModuleDescriptor = (() => {
  const body = {
    contractVersion: "memory-binding-v1",
    schemaVersions: [...MEMORY_SCHEMA_VERSIONS],
    requiredProfiles: [...MEMORY_REQUIRED_PROFILES],
    optionalProfiles: [...MEMORY_OPTIONAL_PROFILES],
    chainKinds: Object.keys(MEMORY_CHAIN_KINDS),
    queryNames: [...MEMORY_QUERY_NAMES],
    boundaries: [...MEMORY_BOUNDARIES],
    pageLimits: { maxRecords: 2000, maxEncodedBytes: 1048576 },
  };
  const contractDigest = descriptorDigest(body);
  return Object.freeze({ ...body, contractDigest }) as NeutralModuleDescriptor;
})();

/** Pinned neutral-contract digest consumed by construction (§6.3 step 1). */
export const MEMORY_CONTRACT_DIGEST: string = MEMORY_DESCRIPTOR.contractDigest;
