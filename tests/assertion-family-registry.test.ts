import { expect, it } from "vitest";

import {
  createAssertionFamilyRegistryV1,
  knowledgePayloadDigest,
  memoryRecordDigest,
  reconciliationProposalIdV1,
  recordIdFromDigest,
  RECONCILIATION_BINARY_STATUS_FAMILY_ID,
  type EvidenceClass,
  type MemoryRecordV2,
} from "../graphify-memory/index.js";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const ZERO = `sha256:${"0".repeat(64)}` as const;
const NOW = "2026-08-16T12:34:56.789Z";
const FAMILY = RECONCILIATION_BINARY_STATUS_FAMILY_ID;

interface RecordOptions {
  scope?: string;
  trustClass?: EvidenceClass;
  familyRefs?: readonly string[];
  subject?: string;
  predicate?: string;
  value: "active" | "inactive" | "unknown";
  t?: number;
  cursor?: string;
}

function buildRecord(options: RecordOptions): MemoryRecordV2 {
  const {
    scope = "scope:test",
    trustClass = "asserted",
    familyRefs = [FAMILY],
    subject = "user:1",
    predicate = "status",
    value,
    t = 1,
    cursor = "1",
  } = options;
  const payload = {
    schema_version: 2 as const,
    scope_ref: scope,
    purpose_ref: "purpose:test",
    valid_time: { t },
    components: [
      { component_id: "c1", kind: "decision" as const, text: `${subject}|${predicate}|${value}`, citation_ids: ["cit1"] },
    ],
    primary_component_id: "c1",
    primary_event: { at: t, type_ref: "event:test", citation_id: "cit1" },
    citations: [
      { citation_id: "cit1", source_ref: "src", locator: { scheme: "document", value: "d#1" }, content_digest: DIGEST },
    ],
    retention: { derivative_rule: "retain" as const },
    reconciliation: { family_refs: [...familyRefs] },
  };
  const payload_digest = knowledgePayloadDigest(payload);
  const preliminary = {
    ...payload,
    record_id: "mem_pending",
    payload_digest,
    record_digest: ZERO,
    recorded_at: NOW,
    recorded_cursor: cursor,
    authorization_receipt_digest: DIGEST,
    trust: {
      class: trustClass,
      evidence_digest: DIGEST,
      verifier_id: "verifier:test",
      verifier_version: "1",
      issued_at: NOW,
      revocation_epoch: "0",
      receipt_digest: DIGEST,
    },
  };
  const record_digest = memoryRecordDigest(preliminary);
  return { ...preliminary, record_id: recordIdFromDigest(record_digest), record_digest } as MemoryRecordV2;
}

function input(left: MemoryRecordV2, right: MemoryRecordV2, family_version = "1", cursor = "9") {
  return { family_id: FAMILY, family_version, left, right, comparison_system_as_of: cursor };
}

it("same-family same-scope same-trust opt-in is required before proposing", () => {
  const registry = createAssertionFamilyRegistryV1();

  // A genuine same-family, same-scope, same-trust contradiction (active vs inactive).
  const optedIn = registry.compare(
    input(buildRecord({ value: "active" }), buildRecord({ value: "inactive" })),
  );
  expect(optedIn).toMatchObject({ ok: true });
  if (!optedIn.ok) return;
  expect(optedIn.value?.relation).toBe("contradicts");

  // Default empty family_refs on either side is the opt-out: no silent pairing.
  const optedOutLeft = registry.compare(
    input(buildRecord({ value: "active", familyRefs: [] }), buildRecord({ value: "inactive" })),
  );
  expect(optedOutLeft).toMatchObject({ ok: true });
  if (!optedOutLeft.ok) return;
  expect(optedOutLeft.value).toBeUndefined();

  const optedOutRight = registry.compare(
    input(buildRecord({ value: "active" }), buildRecord({ value: "inactive", familyRefs: [] })),
  );
  expect(optedOutRight).toMatchObject({ ok: true });
  if (!optedOutRight.ok) return;
  expect(optedOutRight.value).toBeUndefined();

  // Cross-scope never pairs even when both opt in.
  const crossScope = registry.compare(
    input(buildRecord({ value: "active", scope: "scope:a" }), buildRecord({ value: "inactive", scope: "scope:b" })),
  );
  expect(crossScope).toMatchObject({ ok: true });
  if (!crossScope.ok) return;
  expect(crossScope.value).toBeUndefined();

  // Cross-trust-tier is rejected even when both opt in.
  const crossTrust = registry.compare(
    input(buildRecord({ value: "active", trustClass: "asserted" }), buildRecord({ value: "inactive", trustClass: "signed" })),
  );
  expect(crossTrust).toMatchObject({ ok: true });
  if (!crossTrust.ok) return;
  expect(crossTrust.value).toBeUndefined();
});

it("identity similarity alone proposes nothing and ambiguous ties require adjudication", () => {
  const registry = createAssertionFamilyRegistryV1();

  // Same entity (subject) but a different predicate: identity similarity, unrelated occurrence.
  const differentPredicate = registry.compare(
    input(
      buildRecord({ subject: "user:1", predicate: "status", value: "active" }),
      buildRecord({ subject: "user:1", predicate: "role", value: "inactive" }),
    ),
  );
  expect(differentPredicate).toMatchObject({ ok: true });
  if (!differentPredicate.ok) return;
  expect(differentPredicate.value).toBeUndefined();

  // Same occurrence, identical assertion value: agreement is not a proposal.
  const agreement = registry.compare(
    input(buildRecord({ value: "active", t: 1 }), buildRecord({ value: "active", t: 2 })),
  );
  expect(agreement).toMatchObject({ ok: true });
  if (!agreement.ok) return;
  expect(agreement.value).toBeUndefined();

  // A refinement pair (unknown vs active) with an equal valid time is an ambiguous
  // temporal tie: adjudication, never last-write-wins.
  const ambiguous = registry.compare(
    input(
      buildRecord({ subject: "user:2", value: "unknown", t: 5 }),
      buildRecord({ subject: "user:2", value: "active", t: 5 }),
    ),
  );
  expect(ambiguous).toMatchObject({ ok: true });
  if (!ambiguous.ok) return;
  expect(ambiguous.value?.relation).toBe("needs_adjudication");

  // The same refinement pair with an unambiguous later concrete value supersedes.
  const superseding = registry.compare(
    input(
      buildRecord({ subject: "user:3", value: "unknown", t: 5 }),
      buildRecord({ subject: "user:3", value: "active", t: 9 }),
    ),
  );
  expect(superseding).toMatchObject({ ok: true });
  if (!superseding.ok) return;
  expect(superseding.value?.relation).toBe("supersedes");
});

it("replay uses stored registry version while a new version creates a new proposal id", () => {
  const left = buildRecord({ value: "active" });
  const right = buildRecord({ value: "inactive" });

  const v1 = createAssertionFamilyRegistryV1({ registry_version: "1" });
  const v2 = createAssertionFamilyRegistryV1({ registry_version: "2" });

  const first = v1.compare(input(left, right, "1"));
  const second = v2.compare(input(left, right, "2"));
  expect(first).toMatchObject({ ok: true });
  expect(second).toMatchObject({ ok: true });
  if (!first.ok || !second.ok || first.value === undefined || second.value === undefined) {
    throw new Error("both registries must produce a proposal");
  }

  // A new registry version stamps a new family version and therefore a new identity.
  expect(first.value.family_version).toBe("1");
  expect(second.value.family_version).toBe("2");
  expect(first.value.proposal_id).not.toBe(second.value.proposal_id);

  // Replay recomputes identity from the STORED proposal fields (stored version),
  // never by rerunning a newer comparator.
  const replayed = reconciliationProposalIdV1({
    family_id: first.value.family_id,
    family_version: first.value.family_version,
    occurrence_key: first.value.occurrence_key,
    left_record_id: first.value.left_record_id,
    right_record_id: first.value.right_record_id,
    relation: first.value.relation,
    comparison_system_as_of: first.value.comparison_system_as_of,
  });
  expect(replayed).toBe(first.value.proposal_id);

  // The new version's identity is reproducible from its own stored fields, and is
  // distinct purely because the stored family version differs.
  const replayedNew = reconciliationProposalIdV1({
    family_id: second.value.family_id,
    family_version: second.value.family_version,
    occurrence_key: second.value.occurrence_key,
    left_record_id: second.value.left_record_id,
    right_record_id: second.value.right_record_id,
    relation: second.value.relation,
    comparison_system_as_of: second.value.comparison_system_as_of,
  });
  expect(replayedNew).toBe(second.value.proposal_id);
  expect(replayedNew).not.toBe(replayed);

  // Determinism: rerunning the same version reproduces the same identity.
  const again = v1.compare(input(left, right, "1"));
  expect(again).toMatchObject({ ok: true });
  if (!again.ok || again.value === undefined) throw new Error("expected a proposal");
  expect(again.value.proposal_id).toBe(first.value.proposal_id);
});
