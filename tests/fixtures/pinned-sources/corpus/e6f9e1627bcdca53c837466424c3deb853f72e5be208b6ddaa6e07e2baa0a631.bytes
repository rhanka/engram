// G0 guardian contracts — pure data types (§1, §5, §6).
// Frozen spec: SPEC-G0-guardian-contracts.md.
// No I/O, no network, no registry, no MCP. Data only.

/** §1.3: full SHA-256 value, 64 lowercase hex digits. */
export type Digest = string;

export const DIGEST_RE = /^[0-9a-f]{64}$/;
export function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && DIGEST_RE.test(value);
}

/** §1.3: closed Pin — exactly { id, version, contentDigest }. */
export interface Pin {
  readonly id: string;
  readonly version: string;
  readonly contentDigest: Digest;
}

/** §1.3: ordered pin list; order is significant. */
export type PinList = readonly Pin[];

/** §1.3: tenant visibility — public, or private:<tenant>. */
export type TenantVisibility = "public" | `private:${string}`;

/** §1.3: single unresolved encoding, used in §§1.4, 3.1, 5.3, 5.5, 7.2. */
export type DigestEvidence =
  | { readonly evidenceState: "resolved"; readonly digest: Digest }
  | { readonly evidenceState: "unresolved" };

/** §1.3 private lineage types (one definition, reused §§1.4, 3.1, 5.3). */
export interface ResultingDigests {
  readonly contentDigest: Digest;
  readonly pinsDigest: Digest;
  readonly resultEvidence: DigestEvidence;
}

export interface PrivateDerivationRef {
  readonly base: Pin;
  readonly deltaDigest: Digest;
  readonly mappingRef?: Pin;
}

export type PrivateLineage = {
  readonly parents: PinList;
  readonly derivationRef?: PrivateDerivationRef;
  readonly mappings: readonly string[];
  readonly migrations: readonly string[];
};

/** §1.3: derivation-result record (not the lineage container). */
export interface PrivateDerivationRecord {
  readonly base: Pin;
  readonly deltaDigest: Digest;
  readonly mappingRef?: Pin;
  readonly resultingDigests: ResultingDigests;
}

/**
 * §1.3 reference-to-record mapping. Take base/deltaDigest/mappingRef from
 * lineage.derivationRef and resultingDigests from the enclosing digests.
 * Mismatching copies refuse (caller compares field by field).
 */
export function projectPrivateRecord(
  lineage: PrivateLineage,
  digests: ResultingDigests,
): PrivateDerivationRecord | null {
  const ref = lineage.derivationRef;
  if (ref === undefined) return null;
  const record: PrivateDerivationRecord = {
    base: ref.base,
    deltaDigest: ref.deltaDigest,
    ...(ref.mappingRef !== undefined ? { mappingRef: ref.mappingRef } : {}),
    resultingDigests: digests,
  };
  return record;
}

export type Lifecycle = "draft" | "published" | "deprecated" | "superseded";
/** §1.4/§5.3 lifecycle-dependent fields, including forbidden combinations. */
export type LifecycleFields =
  | { readonly lifecycle: "draft" | "published"; readonly deprecatedReason?: never; readonly deprecatedAt?: never; readonly supersededBy?: never }
  | { readonly lifecycle: "deprecated"; readonly deprecatedReason: string; readonly deprecatedAt: string; readonly supersededBy?: Pin }
  | { readonly lifecycle: "superseded"; readonly supersededBy: Pin; readonly deprecatedReason?: never; readonly deprecatedAt?: never };
export type Completeness = "skeleton" | "complete";
export type ProfileShape =
  | "engram-profile"
  | "diagram-profile"
  | "track-vocabulary"
  | "timing-reference"
  | "mechanism-descriptor";
export type ArtifactKind = "mechanism" | "base" | "profile" | "theme" | "corpus" | "contract";

/** §1.4 profile reference (digest only; never the private body). */
export interface ProfileRef {
  readonly canonicalRef: string;
  readonly contentDigest: Digest;
}

export interface CorpusRef {
  readonly ref: string;
  readonly digest: Digest;
}

export interface RecordDigests {
  readonly contentDigest: Digest;
  readonly pinsDigest: Digest;
  readonly resultEvidence: DigestEvidence;
}

/** §3.1 public derivation record (result of a derivation). */
export interface PublicDerivationRecord {
  readonly base: Pin;
  readonly operations: readonly DeltaOperation[];
  readonly resultingDigests: ResultingDigests;
}

export type LineageDerivation =
  | { readonly scope: "public"; readonly record: PublicDerivationRecord }
  | { readonly scope: "private"; readonly record: PrivateDerivationRecord };

/** §1.4 ontology record (closed). */
export interface OntologyRecordBase {
  readonly namespace: string;
  readonly id: string;
  readonly version: string;
  readonly owner: string;
  readonly completeness: Completeness;
  readonly visibility: TenantVisibility;
  readonly profileShape: ProfileShape;
  readonly artifactKind: ArtifactKind;
  readonly profileRef: ProfileRef;
  readonly consumers: readonly string[];
  readonly migrationRef?: string;
  readonly catalogEntryRef?: string;
}

/**
 * §1.4 public lineage arm: closed object with parents in stack order,
 * the derivation record of §3 (or absent), mapping and migration references.
 * Discriminated by the enclosing record visibility, not by an added field.
 */
export interface PublicLineage {
  readonly parents: PinList;
  readonly derivation?: PublicDerivationRecord;
  readonly mappings: readonly string[];
  readonly migrations: readonly string[];
}

/** §1.4 lineage union, discriminated by the enclosing record visibility. */
export type RecordLineage = PublicLineage | PrivateLineage;

export type OntologyRecord = LifecycleFields & (
  | (OntologyRecordBase & {
      readonly visibility: "public";
      readonly lineage: PublicLineage;
    })
  | (OntologyRecordBase & {
      readonly visibility: `private:${string}`;
      readonly lineage: PrivateLineage;
    })) & (
      | { readonly lifecycle: "superseded"; readonly migrationRef: string }
      | { readonly lifecycle: "draft" | "published" | "deprecated" }
    ) & (
      | { readonly lifecycle: "draft"; readonly corpusRef?: CorpusRef; readonly digests?: RecordDigests }
      | { readonly lifecycle: "published" | "deprecated" | "superseded"; readonly corpusRef: CorpusRef; readonly digests: RecordDigests }
    );

// ---------------------------------------------------------------------------
// §3.2 delta operations (closed set) and §3.3 mapping entries (closed set)
// ---------------------------------------------------------------------------

export type DeltaOperation =
  | { readonly op: "add"; readonly subject: string; readonly declaration: unknown }
  | { readonly op: "narrow"; readonly subject: string; readonly constraint: unknown }
  | {
      readonly op: "rename-with-mapping";
      readonly subject: string;
      readonly newName: string;
      /**
       * §3.2 MappingEntry arm `rename` living in the mapping file pinned by
       * `mappingRef`: kind rename, from equals subject, to equals newName.
       */
      readonly mappingEntry: { readonly kind: "rename"; readonly from: string; readonly to: string };
    }
  | { readonly op: "deprecate-term"; readonly subject: string; readonly reason: string };

/**
 * §3.2 rename consistency: the rename arm keeps the old name decodable —
 * `from` equals the operation subject, `to` equals the new name.
 * Throws on mismatch; a rename without this entry refuses (§3.4 unmapped-rename).
 */
export function assertValidDeltaOperation(op: DeltaOperation): void {
  if (op.op !== "rename-with-mapping") return;
  if (op.mappingEntry.from !== op.subject) {
    throw new Error(`rename-mapping-subject-mismatch:${op.mappingEntry.from}:${op.subject}`);
  }
  if (op.mappingEntry.to !== op.newName) {
    throw new Error(`rename-mapping-newname-mismatch:${op.mappingEntry.to}:${op.newName}`);
  }
}

export type MappingEntry =
  | { readonly kind: "rename"; readonly from: string; readonly to: string }
  | { readonly kind: "endpoint"; readonly from: string; readonly to: string; readonly role: string }
  | { readonly kind: "type"; readonly from: string; readonly to: string }
  | { readonly kind: "vocabulary"; readonly from: string; readonly to: string }
  | { readonly kind: "cardinality"; readonly subject: string; readonly chosenMin: number; readonly chosenMax: number }
  | {
      readonly kind: "hierarchy";
      readonly relationId: string;
      readonly chosenShape: "tree" | "dag";
      readonly parentRole: string;
      readonly childRole: string;
    }
  | {
      readonly kind: "severity";
      readonly ruleId: string;
      readonly phase: string;
      readonly readinessPolicy: string;
      readonly chosenSeverity: string;
    };

export interface MappingFile {
  readonly mappingId: string;
  readonly version: string;
  readonly contentDigest: Digest;
  readonly entries: readonly MappingEntry[];
}

export interface RetiredFixture {
  readonly fixtureRef: string;
  readonly reason: string;
}

export interface RetiredRule {
  readonly ruleId: string;
  readonly reason: string;
}

export type DeltaInput =
  | {
      readonly scope: "public";
      readonly base: Pin;
      readonly operations: readonly DeltaOperation[];
      readonly mappingRef?: Pin;
      readonly retiredFixtures: readonly RetiredFixture[];
      readonly retiredRules: readonly RetiredRule[];
    }
  | { readonly scope: "private"; readonly ref: PrivateDerivationRef };

export type DerivedCandidate =
  | {
      readonly outcome: "ok";
      readonly candidate: OntologyRecordBase & {
        readonly lifecycle: "draft";
        readonly corpusRef: CorpusRef;
        readonly digests: RecordDigests;
      };
      readonly derivation: LineageDerivation;
      readonly diagnostics: readonly GuardianDiagnostic[];
    }
  | { readonly outcome: "refused"; readonly diagnostics: readonly GuardianDiagnostic[] };

// ---------------------------------------------------------------------------
// Closed diagnostic code lists (§§2.4, 3.4, 4.2/4.3)
// ---------------------------------------------------------------------------

export const STACK_ERROR_CODES = [
  "parent-type-removal",
  "cardinality-widening",
  "attribute-redeclaration",
  "endpoint-without-join",
  "unpinned-parent",
  "digest-mismatch",
  "unregistered-dialect",
  "gate-weakening",
  "excluded-dependency",
  "severity-conflict",
  "parent-rule-removal",
  "duplicate-pin",
  "unresolved-conflict",
  "operation-not-applicable",
  "private-content-refusal",
] as const;
export type StackErrorCode = (typeof STACK_ERROR_CODES)[number];

export const STACK_SUCCESS_CODES = ["hierarchy-cycle-detached"] as const;

export const DERIVE_ERROR_CODES = [
  "attribute-redeclaration",
  "cardinality-widening",
  "base-edit-refusal",
  "unmapped-rename",
  "excluded-dependency",
  "gate-weakening",
  "profile-source-unavailable",
  "digest-mismatch",
  "missing-relation-matrix",
  "inherited-fixture-unretired",
  "retired-rule-without-delta",
  "severity-conflict",
  "operation-not-applicable",
  "unknown-delta-operation",
] as const;
export type DeriveErrorCode = (typeof DERIVE_ERROR_CODES)[number];

export const MERGE_CONFLICT_CODES = [
  "type-id-collision",
  "relation-endpoint-incompatible",
  "cardinality-conflict",
  "hierarchy-shape-conflict",
  "attribute-redefinition",
  "status-vocabulary-divergence",
] as const;
export type MergeConflictCode = (typeof MERGE_CONFLICT_CODES)[number];

export const MERGE_ERROR_CODES = [
  ...MERGE_CONFLICT_CODES,
  "gate-weakening",
  "severity-conflict",
  "non-deterministic-merge",
  "digest-mismatch",
  "excluded-dependency",
  "homonym-unification-refusal",
  "provenance-mismatch",
  "operation-not-applicable",
] as const;
export type MergeErrorCode = (typeof MERGE_ERROR_CODES)[number];

export type GuardianCode = StackErrorCode | DeriveErrorCode | MergeErrorCode | (typeof STACK_SUCCESS_CODES)[number];

/** Families that never compose (§2.5, D-B7): TRK + H2A by version+mapping, MEM never stacks. */
export type NonComposableFamily = "TRK" | "H2A" | "MEM";

/** Minimal guardian diagnostic shape (full envelope lives in diagnostics.ts). */
export interface GuardianDiagnostic {
  readonly origin: "guardian";
  readonly code: GuardianCode;
  readonly nativeCode: GuardianCode;
  readonly ruleId: string | null;
  readonly subjectRef: string;
  readonly severity: "error" | "warning" | "info";
  readonly path: string | null;
  readonly messageKey: string;
}
