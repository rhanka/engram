import { receiptDigest } from "./digests.js";
import { isCanonicalCursor } from "./validation.js";
import type {
  AssertionComparisonInputV1,
  AssertionFamilyDescriptorV1,
  AssertionFamilyRegistry,
  Cursor,
  Digest,
  MemoryComponentKind,
  MemoryComponentV2,
  MemoryRecordV2,
  MemoryState,
  OpaqueRef,
  ReconciliationProposalV1,
  ReconciliationRelation,
  Result,
} from "./contracts/index.js";

/**
 * L5 assertion reconciliation over the accepted record/component model. The
 * registry is a versioned set of pure functions and finite tables over closed
 * assertion families. A comparator emits a proposal that mutates nothing: it
 * describes a `contradicts | supersedes | needs_adjudication` relation that an
 * authorized lifecycle event may later act on. Identity/entity similarity is
 * never, on its own, evidence of truth, contradiction, or supersession, and an
 * ambiguous temporal ordering resolves to adjudication, never last-write-wins.
 *
 * This module is backend-agnostic. It reads only the immutable record fields, so
 * it works identically over the in-memory canonical model and any persistent
 * adapter.
 */

export const RECONCILIATION_BINARY_STATUS_FAMILY_ID: OpaqueRef = "assertion-family:binary-status";

const OCCURRENCE_KEY_VERSION = "1";
const COMPARATOR_VERSION = "1";

/** Closed value set for the binary-status family; anything else is not asserted. */
const BINARY_STATUS_VALUES = ["active", "inactive", "unknown"] as const;
type BinaryStatusValue = (typeof BINARY_STATUS_VALUES)[number];

const APPLIES_TO_COMPONENT_KINDS: ReadonlyArray<MemoryComponentKind> = ["decision"];

function refusal<T>(code: "REGISTRY_VERSION_UNAVAILABLE" | "INVALID_SCHEMA", message: string): Result<T> {
  return { ok: false, error: { code, operation: "admin", message, retryable: false } };
}

/** The stored, order-invariant fields that a proposal identity binds. */
export interface ReconciliationProposalIdentityV1 {
  family_id: OpaqueRef;
  family_version: string;
  occurrence_key: string;
  left_record_id: string;
  right_record_id: string;
  relation: ReconciliationRelation;
  comparison_system_as_of: Cursor;
}

/**
 * Pure proposal identity: the digest of exactly the seven identity fields, in the
 * spec's order. Replay recomputes identity from the STORED proposal fields —
 * including the stored `family_version` — so a proposal produced under one
 * registry version is always reproducible without rerunning a newer comparator.
 */
export function reconciliationProposalIdV1(identity: ReconciliationProposalIdentityV1): Digest {
  return receiptDigest(
    "reconciliation-proposal-id",
    {
      family_id: identity.family_id,
      family_version: identity.family_version,
      occurrence_key: identity.occurrence_key,
      left_record_id: identity.left_record_id,
      right_record_id: identity.right_record_id,
      relation: identity.relation,
      comparison_system_as_of: identity.comparison_system_as_of,
    },
    // No field named `__unbound` exists, so every field above is bound.
    "__unbound",
  );
}

/**
 * Stable proposal order: by occurrence key, then left id, right id, relation.
 * Exact duplicate proposals (same `proposal_id`) collapse to one.
 */
export function sortReconciliationProposals(
  proposals: ReadonlyArray<ReconciliationProposalV1>,
): ReadonlyArray<ReconciliationProposalV1> {
  const byId = new Map<string, ReconciliationProposalV1>();
  for (const proposal of proposals) if (!byId.has(proposal.proposal_id)) byId.set(proposal.proposal_id, proposal);
  return [...byId.values()].sort((a, b) =>
    a.occurrence_key < b.occurrence_key ? -1 : a.occurrence_key > b.occurrence_key ? 1
      : a.left_record_id < b.left_record_id ? -1 : a.left_record_id > b.left_record_id ? 1
        : a.right_record_id < b.right_record_id ? -1 : a.right_record_id > b.right_record_id ? 1
          : a.relation < b.relation ? -1 : a.relation > b.relation ? 1 : 0);
}

interface BinaryStatusAssertion {
  subject: string;
  predicate: string;
  value: BinaryStatusValue;
}

function primaryComponent(record: MemoryRecordV2): MemoryComponentV2 | undefined {
  return record.components.find((component) => component.component_id === record.primary_component_id);
}

function isBinaryStatusValue(value: string): value is BinaryStatusValue {
  return (BINARY_STATUS_VALUES as ReadonlyArray<string>).includes(value);
}

/**
 * Parses the closed structured assertion out of a record's primary component.
 * Returns `undefined` when the record does not assert in this family (wrong
 * component kind, unparseable text, or a value outside the closed set) — such a
 * record is simply not a candidate; it is not an error.
 */
function extractBinaryStatus(record: MemoryRecordV2): BinaryStatusAssertion | undefined {
  const component = primaryComponent(record);
  if (component === undefined || !APPLIES_TO_COMPONENT_KINDS.includes(component.kind)) return undefined;
  const parts = component.text.split("|");
  if (parts.length !== 3) return undefined;
  const [subject, predicate, value] = parts as [string, string, string];
  if (subject.length === 0 || predicate.length === 0 || !isBinaryStatusValue(value)) return undefined;
  return { subject, predicate, value };
}

function occurrenceKeyFor(
  record: MemoryRecordV2,
  familyId: OpaqueRef,
  familyVersion: string,
): string | undefined {
  const assertion = extractBinaryStatus(record);
  if (assertion === undefined) return undefined;
  return receiptDigest(
    "reconciliation-occurrence-key",
    {
      family_id: familyId,
      family_version: familyVersion,
      occurrence_key_version: OCCURRENCE_KEY_VERSION,
      scope_ref: record.scope_ref,
      subject: assertion.subject,
      predicate: assertion.predicate,
    },
    "__unbound",
  );
}

function isConcrete(value: BinaryStatusValue): boolean {
  return value !== "unknown";
}

/**
 * The finite comparator table for the binary-status family. Given two assertion
 * values and their valid-time positions, it returns the reconciliation relation
 * or `undefined` when the pair warrants no proposal.
 *
 * - equal values agree → no proposal
 * - two distinct concrete values are mutually exclusive → `contradicts`
 * - a concrete value refining an earlier `unknown` → `supersedes`
 * - a refinement whose temporal order is a tie or a regression → `needs_adjudication`
 */
function relateBinaryStatus(
  leftValue: BinaryStatusValue,
  leftValidTime: number,
  rightValue: BinaryStatusValue,
  rightValidTime: number,
): ReconciliationRelation | undefined {
  if (leftValue === rightValue) return undefined;
  if (isConcrete(leftValue) && isConcrete(rightValue)) return "contradicts";
  // Exactly one side is `unknown`; the other is a concrete refinement.
  const unknownValidTime = leftValue === "unknown" ? leftValidTime : rightValidTime;
  const concreteValidTime = leftValue === "unknown" ? rightValidTime : leftValidTime;
  if (concreteValidTime > unknownValidTime) return "supersedes";
  return "needs_adjudication";
}

function familyRefsInclude(record: MemoryRecordV2, familyId: OpaqueRef): boolean {
  return record.reconciliation.family_refs.includes(familyId);
}

function visibleAt(record: MemoryRecordV2, systemAsOf: Cursor): boolean {
  return isCanonicalCursor(record.recorded_cursor)
    && isCanonicalCursor(systemAsOf)
    && BigInt(record.recorded_cursor) <= BigInt(systemAsOf);
}

/**
 * Record-intrinsic eligibility that a comparator can decide from the two records
 * alone: explicit opt-in on both sides, identical scope, a matching immutable
 * trust class, and both records visible at the pinned comparison cursor. A `false`
 * result means "no silent pairing" — the comparator returns no proposal rather
 * than an error.
 */
function recordIntrinsicallyPairable(
  left: MemoryRecordV2,
  right: MemoryRecordV2,
  familyId: OpaqueRef,
  systemAsOf: Cursor,
): boolean {
  return familyRefsInclude(left, familyId)
    && familyRefsInclude(right, familyId)
    && left.scope_ref === right.scope_ref
    && left.trust.class === right.trust.class
    && visibleAt(left, systemAsOf)
    && visibleAt(right, systemAsOf);
}

/** Lifecycle status a caller resolves from the canonical fold for the full gate. */
export interface ReconciliationRecordStatusV1 {
  record_id: string;
  state: MemoryState;
  dependency_eligible: boolean;
  unexpired: boolean;
}

/**
 * The full eligibility gate that must pass BEFORE any candidate scoring. It layers
 * the caller-resolved lifecycle status (accepted/current, unexpired,
 * dependency-eligible) on top of the record-intrinsic checks. Cross-tier and
 * cross-scope pairs are rejected. This gate mutates nothing and never implies
 * consent from purpose alone.
 */
export function evaluateReconciliationEligibilityV1(
  input: AssertionComparisonInputV1,
  statuses: { left: ReconciliationRecordStatusV1; right: ReconciliationRecordStatusV1 },
): Result<{ eligible: true }> {
  const { left, right, family_id, comparison_system_as_of } = input;
  if (statuses.left.record_id !== left.record_id || statuses.right.record_id !== right.record_id) {
    return refusal("INVALID_SCHEMA", "status does not bind the compared records");
  }
  const currentAndEligible = (status: ReconciliationRecordStatusV1): boolean =>
    status.state === "accepted_current" && status.unexpired && status.dependency_eligible;
  if (!recordIntrinsicallyPairable(left, right, family_id, comparison_system_as_of)
    || !currentAndEligible(statuses.left)
    || !currentAndEligible(statuses.right)) {
    return refusal("INVALID_SCHEMA", "records are not reconcilable under the eligibility gate");
  }
  return { ok: true, value: { eligible: true } };
}

function primaryEvidenceCitationIds(left: MemoryRecordV2, right: MemoryRecordV2): ReadonlyArray<string> {
  const ids = new Set<string>();
  for (const record of [left, right]) {
    const component = primaryComponent(record);
    for (const citationId of component?.citation_ids ?? []) ids.add(citationId);
  }
  return [...ids].sort();
}

export interface AssertionFamilyRegistryOptionsV1 {
  /** Registry version; the closed family's version equals it, so a new registry
   * version stamps a new family version and therefore a new proposal identity. */
  registry_version?: string;
}

export const RECONCILIATION_REGISTRY_ID: OpaqueRef = "registry:graphify-assertions";

/**
 * Builds the versioned assertion-family registry. Every proposal stores the
 * family and (via the registry-derived family) the registry version, so replay
 * consumes the stored proposal and a new registry version creates fresh proposal
 * identities without rewriting old ones.
 */
export function createAssertionFamilyRegistryV1(
  options: AssertionFamilyRegistryOptionsV1 = {},
): AssertionFamilyRegistry {
  const registryVersion = options.registry_version ?? "1";
  const familyVersion = registryVersion;

  const descriptorWithoutDigest = {
    family_id: RECONCILIATION_BINARY_STATUS_FAMILY_ID,
    version: familyVersion,
    applies_to_component_kinds: APPLIES_TO_COMPONENT_KINDS,
    occurrence_key_version: OCCURRENCE_KEY_VERSION,
    comparator_version: COMPARATOR_VERSION,
  };
  const descriptor: AssertionFamilyDescriptorV1 = {
    ...descriptorWithoutDigest,
    descriptor_digest: receiptDigest("assertion-family-descriptor", descriptorWithoutDigest, "descriptor_digest"),
  };

  function resolveDescriptor(input: AssertionComparisonInputV1): Result<AssertionFamilyDescriptorV1> {
    if (input.family_id !== descriptor.family_id) {
      return refusal("REGISTRY_VERSION_UNAVAILABLE", "unknown assertion family");
    }
    if (input.family_version !== descriptor.version) {
      return refusal("REGISTRY_VERSION_UNAVAILABLE", "requested family version is not installed");
    }
    return { ok: true, value: descriptor };
  }

  function occurrenceKey(input: AssertionComparisonInputV1): Result<string> {
    const resolved = resolveDescriptor(input);
    if (!resolved.ok) return resolved;
    const leftKey = occurrenceKeyFor(input.left, descriptor.family_id, descriptor.version);
    const rightKey = occurrenceKeyFor(input.right, descriptor.family_id, descriptor.version);
    if (leftKey === undefined || rightKey === undefined) {
      return refusal("INVALID_SCHEMA", "a record does not assert in this family");
    }
    if (leftKey !== rightKey) {
      return refusal("INVALID_SCHEMA", "records do not share an occurrence key");
    }
    return { ok: true, value: leftKey };
  }

  function compare(input: AssertionComparisonInputV1): Result<ReconciliationProposalV1 | undefined> {
    const resolved = resolveDescriptor(input);
    if (!resolved.ok) return resolved;

    // Normalize input ordering to UTF-8 ascending record id so proposal identity
    // is stable regardless of caller order.
    const ordered = input.left.record_id <= input.right.record_id
      ? { left: input.left, right: input.right }
      : { left: input.right, right: input.left };
    if (ordered.left.record_id === ordered.right.record_id) return { ok: true, value: undefined };

    // Eligibility gate BEFORE candidate scoring — no silent pairing.
    if (!recordIntrinsicallyPairable(ordered.left, ordered.right, descriptor.family_id, input.comparison_system_as_of)) {
      return { ok: true, value: undefined };
    }

    const leftAssertion = extractBinaryStatus(ordered.left);
    const rightAssertion = extractBinaryStatus(ordered.right);
    if (leftAssertion === undefined || rightAssertion === undefined) return { ok: true, value: undefined };

    const leftKey = occurrenceKeyFor(ordered.left, descriptor.family_id, descriptor.version);
    const rightKey = occurrenceKeyFor(ordered.right, descriptor.family_id, descriptor.version);
    // Different occurrence keys means the records assert about different subjects
    // or predicates — identity similarity alone is never a proposal.
    if (leftKey === undefined || rightKey === undefined || leftKey !== rightKey) return { ok: true, value: undefined };

    const relation = relateBinaryStatus(
      leftAssertion.value,
      ordered.left.valid_time.t,
      rightAssertion.value,
      ordered.right.valid_time.t,
    );
    if (relation === undefined) return { ok: true, value: undefined };

    const identity: ReconciliationProposalIdentityV1 = {
      family_id: descriptor.family_id,
      family_version: descriptor.version,
      occurrence_key: leftKey,
      left_record_id: ordered.left.record_id,
      right_record_id: ordered.right.record_id,
      relation,
      comparison_system_as_of: input.comparison_system_as_of,
    };
    const proposalWithoutDigest = {
      proposal_id: reconciliationProposalIdV1(identity),
      family_id: identity.family_id,
      family_version: identity.family_version,
      occurrence_key: identity.occurrence_key,
      left_record_id: identity.left_record_id,
      right_record_id: identity.right_record_id,
      relation: identity.relation,
      comparison_system_as_of: identity.comparison_system_as_of,
      evidence_citation_ids: primaryEvidenceCitationIds(ordered.left, ordered.right),
    };
    const proposal: ReconciliationProposalV1 = {
      ...proposalWithoutDigest,
      proposal_digest: receiptDigest("reconciliation-proposal", proposalWithoutDigest, "proposal_digest"),
    };
    return { ok: true, value: proposal };
  }

  return {
    registry_id: RECONCILIATION_REGISTRY_ID,
    registry_version: registryVersion,
    descriptors: () => [descriptor],
    occurrenceKey,
    compare,
  };
}
