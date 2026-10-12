import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalizeJcs,
  createAssertionFamilyRegistryV1,
  foldMemoryJournalV1,
  memoryJournalEventHashV1,
  openFencedSqliteCanonicalMemoryStoreV1,
  openPostgresCanonicalMemoryStoreV1,
  receiptDigest,
  RECONCILIATION_BINARY_STATUS_FAMILY_ID,
  RECONCILIATION_REGISTRY_ID,
  type CanonicalMemoryStorePort,
  type Digest,
  type MemoryPortV2,
  type MemoryRecordV2,
} from "../engram-memory/index.js";
import { buildMemory, DEADLINE, DIGEST, NOW, recallRequest, seedAccepted } from "./memory-l7-fixture.js";
import { postgresLaneDecision, startEphemeralPostgres } from "./postgres-ephemeral.js";

const FAMILY = RECONCILIATION_BINARY_STATUS_FAMILY_ID;
const EXPIRES_AT = "2026-08-16T12:36:00.000Z";
const LATER = "2026-08-16T12:37:00.000Z";
const POSTGRES_MATRIX = ["16", "17"] as const;
const sqliteWorkspaces: string[] = [];
const postgresStops: Array<() => void> = [];

afterEach(() => {
  while (postgresStops.length > 0) postgresStops.pop()!();
  while (sqliteWorkspaces.length > 0) rmSync(sqliteWorkspaces.pop()!, { recursive: true, force: true });
});

function outboxLength(store: CanonicalMemoryStorePort): number | undefined {
  const exported = (store as unknown as { exportStateForPersistence?: () => { ok: boolean; value?: { outbox?: unknown[] } } }).exportStateForPersistence?.();
  if (exported === undefined || !exported.ok || exported.value?.outbox === undefined) return undefined;
  return exported.value.outbox.length;
}

/** Recomputes a receipt domain digest independently of the package helper (SPEC D5). */
function domainDigest(domain: string, value: unknown): string {
  const hash = createHash("sha256");
  hash.update(domain, "utf8");
  hash.update(canonicalizeJcs(value as never), "utf8");
  return `sha256:${hash.digest("hex")}`;
}

function utf8Ascending(left: string, right: string): [string, string] {
  return Buffer.from(left, "utf8").toString("hex") < Buffer.from(right, "utf8").toString("hex")
    ? [left, right]
    : [right, left];
}

interface AssertionOptions {
  value: "active" | "inactive" | "unknown";
  t: number;
  tEnd?: number;
  families?: readonly string[];
  trustClass?: "asserted" | "earned" | "signed";
  subject?: string;
  retentionExpiresAt?: string;
}

/** Seeds one accepted record asserting in the binary-status family (primary component of kind decision). */
async function seedAssertion(memory: MemoryPortV2, options: AssertionOptions): Promise<string> {
  return seedAccepted(memory, `${options.subject ?? "user:1"}|status|${options.value}`, {
    componentKind: "decision",
    validTime: options.tEnd === undefined ? { t: options.t } : { t: options.t, t_end: options.tEnd },
    families: options.families ?? [FAMILY],
    ...(options.trustClass !== undefined ? { trustClass: options.trustClass } : {}),
    ...(options.retentionExpiresAt !== undefined ? { retentionExpiresAt: options.retentionExpiresAt } : {}),
  });
}

function reconciliationRequest(leftId: string, rightId: string, overrides: Partial<{ comparison_system_as_of: string; family_version: string }> = {}) {
  return {
    family_id: FAMILY,
    family_version: overrides.family_version ?? "1",
    left_record_id: leftId,
    right_record_id: rightId,
    ...(overrides.comparison_system_as_of !== undefined ? { comparison_system_as_of: overrides.comparison_system_as_of } : {}),
    authorization: { credential: "credential:l7" },
    deadline_at: DEADLINE,
  };
}

function lifecycleCommand(operation: "expire" | "mark_non_current" | "trust_invalidate" | "tombstone", recordId: string, eventId: string) {
  return {
    operation,
    event_id: eventId,
    reason_ref: "reason:l7",
    event_anchor: { occurred_at: NOW, kind_ref: "kind:l7", provenance_ref: "provenance:l7", provenance_digest: DIGEST },
    record_id: recordId,
    authorization: { credential: "credential:l7" },
    deadline_at: DEADLINE,
  };
}

describe("engine proposeReconciliation (L5b)", () => {
  it("proposeReconciliation reads only, allocates no cursor, and refuses CAPABILITY_UNAVAILABLE without a registry", async () => {
    const bare = buildMemory();
    const refused = await bare.memory.proposeReconciliation(reconciliationRequest("mem_aaaa", "mem_bbbb"));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("CAPABILITY_UNAVAILABLE");
    expect(refused.error.operation).toBe("propose_reconciliation");

    const { memory, store } = buildMemory({ assertionRegistry: createAssertionFamilyRegistryV1() });
    const left = await seedAssertion(memory, { value: "unknown", t: 1 });
    const right = await seedAssertion(memory, { value: "active", t: 2 });
    const before = await memory.readiness();
    const journalBefore = await store.readJournal({ after: "0", limit: 2_000 });
    const outcome = await memory.proposeReconciliation(reconciliationRequest(left, right));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.eligible).toBe(true);
    expect(outcome.value.proposal).toBeDefined();
    const after = await memory.readiness();
    expect(after.value.high_water_cursor).toBe(before.value.high_water_cursor);
    const journalAfter = await store.readJournal({ after: "0", limit: 2_000 });
    expect(journalAfter.value.length).toBe(journalBefore.value.length);
  });

  it("records ineligible at the pinned cursor (tombstoned, expired, trust-invalid, historical) yield an ineligible outcome with no proposal", async () => {
    const { memory } = buildMemory({ assertionRegistry: createAssertionFamilyRegistryV1() });
    // Tombstoned, expired, trust-invalid and historical records all fail the store's revalidation
    // at the pinned cursor, each through its own lifecycle state.
    const states: ReadonlyArray<"tombstone" | "expire" | "trust_invalidate" | "mark_non_current"> = [
      "tombstone", "expire", "trust_invalidate", "mark_non_current",
    ];
    for (const operation of states) {
      const healthy = await seedAssertion(memory, { value: "unknown", t: 1 });
      const stale = await seedAssertion(memory, { value: "active", t: 2 });
      const transitioned = await memory.transition(lifecycleCommand(operation, stale, `event:${operation}:${stale}`));
      expect(transitioned.ok).toBe(true);
      const outcome = await memory.proposeReconciliation(reconciliationRequest(healthy, stale));
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.value.eligible).toBe(false);
      expect(Object.hasOwn(outcome.value, "proposal")).toBe(false);
      expect(outcome.value.eligibility_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(outcome.value.receipt_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("a pair the eligibility gate refuses (missing opt-in, distinct trust classes) yields an ineligible outcome with no proposal, not an error", async () => {
    const { memory } = buildMemory({ assertionRegistry: createAssertionFamilyRegistryV1() });
    const optedIn = await seedAssertion(memory, { value: "unknown", t: 1 });
    const optedOut = await seedAssertion(memory, { value: "active", t: 2, families: [] });
    const missingOptIn = await memory.proposeReconciliation(reconciliationRequest(optedIn, optedOut));
    expect(missingOptIn.ok).toBe(true);
    if (!missingOptIn.ok) return;
    expect(missingOptIn.value.eligible).toBe(false);
    expect(Object.hasOwn(missingOptIn.value, "proposal")).toBe(false);

    const mixed = buildMemory({ assertionRegistry: createAssertionFamilyRegistryV1(), seededTrustClasses: true });
    const asserted = await seedAssertion(mixed.memory, { value: "unknown", t: 1 });
    const earned = await seedAssertion(mixed.memory, { value: "active", t: 2, trustClass: "earned" });
    const distinctTrust = await mixed.memory.proposeReconciliation(reconciliationRequest(asserted, earned));
    expect(distinctTrust.ok).toBe(true);
    if (!distinctTrust.ok) return;
    expect(distinctTrust.value.eligible).toBe(false);
    expect(Object.hasOwn(distinctTrust.value, "proposal")).toBe(false);
  });

  it("eligibility is decided on the system axis: a refinement whose valid intervals do not overlap is still proposed", async () => {
    const { memory } = buildMemory({ assertionRegistry: createAssertionFamilyRegistryV1() });
    const early = await seedAssertion(memory, { value: "unknown", t: 1, tEnd: 5 });
    const late = await seedAssertion(memory, { value: "active", t: 10 });
    const outcome = await memory.proposeReconciliation(reconciliationRequest(early, late));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.eligible).toBe(true);
    const proposal = outcome.value.proposal;
    expect(proposal).toBeDefined();
    expect(["left_supersedes_right", "right_supersedes_left"]).toContain(proposal!.relation);
    const [leftId, rightId] = utf8Ascending(early, late);
    expect(proposal!.left_record_id).toBe(leftId);
    expect(proposal!.right_record_id).toBe(rightId);
  });

  it("the outcome binds registry, family, pair, pin, per-record eligibility and proposal under the reconciliation-outcome and reconciliation-eligibility domains", async () => {
    const registry = createAssertionFamilyRegistryV1({ registry_version: "7" });
    const authorizationLog: Array<{ operation: string; resource: { record_id?: string }; receipt_digest: Digest }> = [];
    const { memory, store } = buildMemory({ assertionRegistry: registry, authorizationLog });
    const unknown = await seedAssertion(memory, { value: "unknown", t: 1 });
    const active = await seedAssertion(memory, { value: "active", t: 2 });
    const readiness = await memory.readiness();
    const pin = readiness.value.high_water_cursor;
    const [leftId, rightId] = utf8Ascending(unknown, active);
    // Caller order is free; the outcome normalizes to UTF-8 ascending record ids.
    const outcome = await memory.proposeReconciliation(reconciliationRequest(active, unknown, { comparison_system_as_of: pin, family_version: "7" }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const value = outcome.value;
    expect(value.registry_id).toBe(RECONCILIATION_REGISTRY_ID);
    expect(value.registry_version).toBe("7");
    expect(value.family_id).toBe(FAMILY);
    expect(value.family_version).toBe("7");
    expect(value.left_record_id).toBe(leftId);
    expect(value.right_record_id).toBe(rightId);
    expect(value.comparison_system_as_of).toBe(pin);
    expect(value.eligible).toBe(true);
    expect(value.proposal).toBeDefined();

    const records = new Map<string, MemoryRecordV2>();
    for (const id of [leftId, rightId]) {
      const read = await store.readRecord({ record_id: id, system_as_of: pin, authorization_receipt_digest: DIGEST });
      if (!read.ok) throw new Error(`readRecord failed: ${read.error.code}`);
      records.set(id, read.value);
    }
    const receipts = authorizationLog.filter((entry) => entry.operation === "propose_reconciliation" && typeof entry.resource.record_id === "string");
    const authorizationReceipts = new Map(receipts.map((entry) => [entry.resource.record_id!, entry.receipt_digest]));
    const revalidationReceipts = new Map<string, Digest>();
    for (const id of [leftId, rightId]) {
      const packet = await store.revalidateReadOnly({
        record_ids: [id],
        valid_as_of: records.get(id)!.valid_time.t,
        system_as_of: pin,
        authorization_receipt_digest: authorizationReceipts.get(id)!,
        operation: "recall_current",
      });
      if (!packet.ok) throw new Error(`revalidate failed: ${packet.error.code}`);
      revalidationReceipts.set(id, packet.value.receipt_digest);
    }
    const eligibilityBody = {
      comparison_system_as_of: pin,
      records: [leftId, rightId].map((id) => ({
        record_id: id,
        record_digest: records.get(id)!.record_digest,
        authorization_receipt_digest: authorizationReceipts.get(id)!,
        revalidation_receipt_digest: revalidationReceipts.get(id)!,
      })),
    };
    expect(value.eligibility_digest).toBe(domainDigest("graphify-memory/reconciliation-eligibility/v1\0", eligibilityBody));
    const { receipt_digest, ...outcomeBody } = value;
    expect(receipt_digest).toBe(domainDigest("graphify-memory/reconciliation-outcome/v1\0", outcomeBody));
  });

  it("an uninstalled registry version refuses reconciliation while recall stays available", async () => {
    const { memory } = buildMemory({ assertionRegistry: createAssertionFamilyRegistryV1({ registry_version: "1" }) });
    const left = await seedAssertion(memory, { value: "unknown", t: 1 });
    const right = await seedAssertion(memory, { value: "active", t: 2 });
    const refused = await memory.proposeReconciliation(reconciliationRequest(left, right, { family_version: "2" }));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("REGISTRY_VERSION_UNAVAILABLE");
    expect(refused.error.operation).toBe("propose_reconciliation");
    const recalled = await memory.recall(recallRequest("user:1"));
    expect(recalled.ok).toBe(true);
  });

  it("proposeReconciliation leaves journal and cursor unchanged when a pair member retention has expired", async () => {
    let nowValue = NOW;
    const clock = { now: () => nowValue };
    const { memory, store } = buildMemory({ assertionRegistry: createAssertionFamilyRegistryV1(), clock });
    const healthy = await seedAssertion(memory, { value: "unknown", t: 1 });
    const expiring = await seedAssertion(memory, { value: "active", t: 2, retentionExpiresAt: EXPIRES_AT });
    nowValue = LATER;
    const cursorBefore = await memory.readiness();
    const journalBefore = await store.readJournal({ after: "0", limit: 2_000 });
    const outboxBefore = outboxLength(store);
    const outcome = await memory.proposeReconciliation(reconciliationRequest(healthy, expiring));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.eligible).toBe(false);
    expect(Object.hasOwn(outcome.value, "proposal")).toBe(false);
    const cursorAfter = await memory.readiness();
    expect(cursorAfter.value.high_water_cursor).toBe(cursorBefore.value.high_water_cursor);
    const journalAfter = await store.readJournal({ after: "0", limit: 2_000 });
    expect(journalAfter.value.length).toBe(journalBefore.value.length);
    expect(outboxLength(store)).toBe(outboxBefore);
  });

  it("proposeReconciliation leaves journal and cursor unchanged when an exterior record retention has expired", async () => {
    let nowValue = NOW;
    const clock = { now: () => nowValue };
    const { memory, store } = buildMemory({ assertionRegistry: createAssertionFamilyRegistryV1(), clock });
    const left = await seedAssertion(memory, { value: "unknown", t: 1 });
    const right = await seedAssertion(memory, { value: "active", t: 2 });
    await seedAssertion(memory, { value: "active", t: 3, retentionExpiresAt: EXPIRES_AT, subject: "user:2" });
    nowValue = LATER;
    const cursorBefore = await memory.readiness();
    const journalBefore = await store.readJournal({ after: "0", limit: 2_000 });
    const outboxBefore = outboxLength(store);
    const outcome = await memory.proposeReconciliation(reconciliationRequest(left, right));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.eligible).toBe(true);
    expect(outcome.value.proposal).toBeDefined();
    const cursorAfter = await memory.readiness();
    expect(cursorAfter.value.high_water_cursor).toBe(cursorBefore.value.high_water_cursor);
    const journalAfter = await store.readJournal({ after: "0", limit: 2_000 });
    expect(journalAfter.value.length).toBe(journalBefore.value.length);
    expect(outboxLength(store)).toBe(outboxBefore);
  });

  it("proposeReconciliation performs no durable write on SQLite, with an expired pair member and an expired exterior record", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "engram-memory-reconciliation-sqlite-"));
    sqliteWorkspaces.push(workspace);
    const statements: string[] = [];
    let nowValue = NOW;
    const clock = { now: () => nowValue };
    const opened = await openFencedSqliteCanonicalMemoryStoreV1({
      filename: join(workspace, "canonical.sqlite"),
      clock,
      store_id: "reconciliation-pure-read",
      allow_ephemeral_filesystem_store: true,
      on_mutation_statement: (statement) => { statements.push(statement); },
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const store = opened.value;
    const { memory } = buildMemory({ assertionRegistry: createAssertionFamilyRegistryV1(), store, clock });
    const healthyA = await seedAssertion(memory, { value: "unknown", t: 1 });
    const healthyB = await seedAssertion(memory, { value: "unknown", t: 2, subject: "user:3" });
    const expiring = await seedAssertion(memory, { value: "active", t: 3, retentionExpiresAt: EXPIRES_AT });
    await seedAssertion(memory, { value: "active", t: 4, retentionExpiresAt: EXPIRES_AT, subject: "user:2" });
    nowValue = LATER;
    statements.length = 0;
    const cursorBefore = await memory.readiness();
    const journalBefore = await store.readJournal({ after: "0", limit: 2_000 });
    const inPair = await memory.proposeReconciliation(reconciliationRequest(healthyA, expiring));
    expect(inPair.ok).toBe(true);
    if (inPair.ok) expect(inPair.value.eligible).toBe(false);
    const exteriorOutcome = await memory.proposeReconciliation(reconciliationRequest(healthyA, healthyB));
    expect(exteriorOutcome.ok).toBe(true);
    if (exteriorOutcome.ok) expect(exteriorOutcome.value.eligible).toBe(true);
    const cursorAfter = await memory.readiness();
    expect(cursorAfter.value.high_water_cursor).toBe(cursorBefore.value.high_water_cursor);
    const journalAfter = await store.readJournal({ after: "0", limit: 2_000 });
    expect(journalAfter.value.length).toBe(journalBefore.value.length);
    expect(statements).toEqual([]);
    await store.close();
  });

  const postgresDecision = postgresLaneDecision(POSTGRES_MATRIX);
  if (postgresDecision.lane === "fail") {
    it("postgres lane prerequisites hold in required mode", () => {
      throw new Error(postgresDecision.cause);
    });
  } else {
    (postgresDecision.lane === "run" ? it : it.skip)("proposeReconciliation performs no durable write on Postgres, with an expired pair member and an expired exterior record", async () => {
    for (const version of POSTGRES_MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      postgresStops.push(postgres.stop);
      try {
        const statements: string[] = [];
        let nowValue = NOW;
        const clock = { now: () => nowValue };
        const opened = await openPostgresCanonicalMemoryStoreV1({
          connection: postgres.connection,
          clock,
          store_id: "reconciliation-pure-read",
          on_mutation_statement: (statement) => { statements.push(statement); },
        });
        expect(opened.ok).toBe(true);
        if (!opened.ok) continue;
        const store = opened.value;
        const { memory } = buildMemory({ assertionRegistry: createAssertionFamilyRegistryV1(), store, clock });
        const healthyA = await seedAssertion(memory, { value: "unknown", t: 1 });
        const healthyB = await seedAssertion(memory, { value: "unknown", t: 2, subject: "user:3" });
        const expiring = await seedAssertion(memory, { value: "active", t: 3, retentionExpiresAt: EXPIRES_AT });
        await seedAssertion(memory, { value: "active", t: 4, retentionExpiresAt: EXPIRES_AT, subject: "user:2" });
        nowValue = LATER;
        statements.length = 0;
        const cursorBefore = await memory.readiness();
        const journalBefore = await store.readJournal({ after: "0", limit: 2_000 });
        const inPair = await memory.proposeReconciliation(reconciliationRequest(healthyA, expiring));
        expect(inPair.ok).toBe(true);
        if (inPair.ok) expect(inPair.value.eligible).toBe(false);
        const exteriorOutcome = await memory.proposeReconciliation(reconciliationRequest(healthyA, healthyB));
        expect(exteriorOutcome.ok).toBe(true);
        if (exteriorOutcome.ok) expect(exteriorOutcome.value.eligible).toBe(true);
        const cursorAfter = await memory.readiness();
        expect(cursorAfter.value.high_water_cursor).toBe(cursorBefore.value.high_water_cursor);
        const journalAfter = await store.readJournal({ after: "0", limit: 2_000 });
        expect(journalAfter.value.length).toBe(journalBefore.value.length);
        expect(statements).toEqual([]);
        await store.close();
      } finally {
        postgres.stop();
        const index = postgresStops.indexOf(postgres.stop);
        if (index >= 0) postgresStops.splice(index, 1);
      }
    }
    }, 180_000);
  }
});

describe("engine reconciliation application (L5b-3)", () => {
  it("a dispute or supersede bound to a proposal persists family and registry versions in the event digest and in the journal event (visible via readJournal), and replay never calls the registry", async () => {
    const registry = createAssertionFamilyRegistryV1();
    let compareCalls = 0;
    const innerCompare = registry.compare.bind(registry);
    registry.compare = ((input: Parameters<typeof innerCompare>[0]) => {
      compareCalls += 1;
      return innerCompare(input);
    }) as typeof registry.compare;
    const { memory, store } = buildMemory({ assertionRegistry: registry });
    const disputeUnknown = await seedAssertion(memory, { value: "unknown", t: 1, subject: "user:10" });
    const disputeActive = await seedAssertion(memory, { value: "active", t: 2, subject: "user:10" });
    const supersedeUnknown = await seedAssertion(memory, { value: "unknown", t: 1, subject: "user:11" });
    const supersedeActive = await seedAssertion(memory, { value: "active", t: 2, subject: "user:11" });

    const disputeOutcome = await memory.proposeReconciliation(reconciliationRequest(disputeUnknown, disputeActive));
    expect(disputeOutcome.ok).toBe(true);
    if (!disputeOutcome.ok || disputeOutcome.value.proposal === undefined) return;
    const disputeProposal = disputeOutcome.value.proposal;
    expect(["left_supersedes_right", "right_supersedes_left"]).toContain(disputeProposal.relation);
    const disputeApplied = await memory.transition({
      operation: "dispute",
      event_id: "event:bound-dispute",
      record_id: disputeProposal.left_record_id,
      reason_ref: "reason:bound",
      event_anchor: { occurred_at: NOW, kind_ref: "kind:bound", provenance_ref: "provenance:bound", provenance_digest: DIGEST },
      authorization: { credential: "credential:l7" },
      deadline_at: DEADLINE,
      reconciliation: { proposal: disputeProposal, registry_id: RECONCILIATION_REGISTRY_ID, registry_version: "1" },
    });
    expect(disputeApplied.ok).toBe(true);
    if (!disputeApplied.ok) return;

    const supersedeOutcome = await memory.proposeReconciliation(reconciliationRequest(supersedeUnknown, supersedeActive));
    expect(supersedeOutcome.ok).toBe(true);
    if (!supersedeOutcome.ok || supersedeOutcome.value.proposal === undefined) return;
    const supersedeProposal = supersedeOutcome.value.proposal;
    expect(["left_supersedes_right", "right_supersedes_left"]).toContain(supersedeProposal.relation);
    const superseded = supersedeProposal.relation === "left_supersedes_right" ? supersedeProposal.right_record_id : supersedeProposal.left_record_id;
    const successor = supersedeProposal.relation === "left_supersedes_right" ? supersedeProposal.left_record_id : supersedeProposal.right_record_id;
    const supersedeApplied = await memory.transition({
      operation: "supersede",
      event_id: "event:bound-supersede",
      record_id: superseded,
      related_record_id: successor,
      reason_ref: "reason:bound",
      event_anchor: { occurred_at: NOW, kind_ref: "kind:bound", provenance_ref: "provenance:bound", provenance_digest: DIGEST },
      authorization: { credential: "credential:l7" },
      deadline_at: DEADLINE,
      reconciliation: { proposal: supersedeProposal, registry_id: RECONCILIATION_REGISTRY_ID, registry_version: "1" },
    });
    expect(supersedeApplied.ok).toBe(true);
    if (!supersedeApplied.ok) return;

    const journal = await store.readJournal({ after: "0", limit: 2_000 });
    expect(journal.ok).toBe(true);
    if (!journal.ok) return;
    const disputeEvent = journal.value.find((event) => event.event_id === "event:bound-dispute");
    const supersedeEvent = journal.value.find((event) => event.event_id === "event:bound-supersede");
    expect(disputeEvent?.reconciliation).toMatchObject({
      proposal_id: disputeProposal.proposal_id,
      proposal_digest: disputeProposal.proposal_digest,
      family_id: FAMILY,
      family_version: "1",
      registry_id: RECONCILIATION_REGISTRY_ID,
      registry_version: "1",
    });
    expect(supersedeEvent?.reconciliation).toMatchObject({
      proposal_id: supersedeProposal.proposal_id,
      family_id: FAMILY,
      registry_id: RECONCILIATION_REGISTRY_ID,
      registry_version: "1",
    });
    expect(disputeEvent?.event_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(supersedeEvent?.event_digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const exported = (store as unknown as { exportStateForPersistence?: () => { ok: boolean; value?: { journal: Array<Record<string, unknown>>; records: Array<Record<string, unknown>> } } }).exportStateForPersistence?.();
    expect(exported?.ok).toBe(true);
    const rawDispute = exported?.value?.journal.find((event) => event["event_id"] === "event:bound-dispute") as unknown as Parameters<typeof memoryJournalEventHashV1>[0];
    expect(rawDispute?.["reconciliation"]).toBeDefined();
    expect(memoryJournalEventHashV1(rawDispute)).toBe(disputeEvent?.event_digest);
    const { reconciliation: _dropped, ...withoutBinding } = rawDispute as Record<string, unknown>;
    expect(memoryJournalEventHashV1(withoutBinding as Parameters<typeof memoryJournalEventHashV1>[0])).not.toBe(disputeEvent?.event_digest);
    void receiptDigest;
    void _dropped;

    const callsBeforeReplay = compareCalls;
    const readiness = await store.readiness();
    expect(readiness.ok).toBe(true);
    const checkpoint = await store.checkpoint({ through_cursor: readiness.ok ? readiness.value.high_water_cursor : "0" });
    expect(checkpoint.ok).toBe(true);
    if (exported?.value !== undefined) {
      const refold = foldMemoryJournalV1({ journal: exported.value.journal as never, records: exported.value.records as never });
      expect(refold.ok).toBe(true);
    }
    expect(compareCalls).toBe(callsBeforeReplay);
    registry.compare = (() => {
      throw new Error("replay must not call the registry");
    }) as typeof registry.compare;
    const replayReadiness = await store.readiness();
    expect(replayReadiness.ok).toBe(true);
    const replayCheckpoint = await store.checkpoint({ through_cursor: replayReadiness.ok ? replayReadiness.value.high_water_cursor : "0" });
    expect(replayCheckpoint.ok).toBe(true);
  });

  it("a forged or mismatched proposal binding is refused before any cursor allocation", async () => {
    const { memory, store } = buildMemory({ assertionRegistry: createAssertionFamilyRegistryV1() });
    const unknown = await seedAssertion(memory, { value: "unknown", t: 1 });
    const active = await seedAssertion(memory, { value: "active", t: 2 });
    const outsider = await seedAssertion(memory, { value: "active", t: 3, subject: "user:2" });
    const outcome = await memory.proposeReconciliation(reconciliationRequest(unknown, active));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.value.proposal === undefined) return;
    const proposal = outcome.value.proposal;
    const bound = { proposal, registry_id: RECONCILIATION_REGISTRY_ID, registry_version: "1" };
    const anchor = { occurred_at: NOW, kind_ref: "kind:bound", provenance_ref: "provenance:bound", provenance_digest: DIGEST };

    async function cursorAndJournal(): Promise<{ cursor: string; length: number }> {
      const readiness = await memory.readiness();
      const journal = await store.readJournal({ after: "0", limit: 2_000 });
      if (!readiness.ok || !journal.ok) throw new Error("fixture failed");
      return { cursor: readiness.value.high_water_cursor, length: journal.value.length };
    }
    function forgedDigest(proposalDigest: Digest): Digest {
      const tail = proposalDigest.slice("sha256:".length);
      const flipped = tail.endsWith("0") ? "1" : "0";
      return `sha256:${tail.slice(0, -1)}${flipped}`;
    }

    const cases: Array<{ name: string; command: Record<string, unknown>; code: string }> = [
      {
        name: "forged digest",
        command: { operation: "dispute", event_id: "event:forged-digest", record_id: proposal.left_record_id, reason_ref: "reason:bound", event_anchor: anchor, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE, reconciliation: { ...bound, proposal: { ...proposal, proposal_digest: forgedDigest(proposal.proposal_digest) } } },
        code: "INVALID_DIGEST",
      },
      {
        name: "mismatched pair",
        command: { operation: "dispute", event_id: "event:mismatched-pair", record_id: outsider, reason_ref: "reason:bound", event_anchor: anchor, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE, reconciliation: bound },
        code: "ILLEGAL_TRANSITION",
      },
      {
        name: "unknown registry version",
        command: { operation: "dispute", event_id: "event:unknown-registry", record_id: proposal.left_record_id, reason_ref: "reason:bound", event_anchor: anchor, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE, reconciliation: { ...bound, registry_version: "999" } },
        code: "REGISTRY_VERSION_UNAVAILABLE",
      },
      {
        name: "supersede swapped direction",
        command: { operation: "supersede", event_id: "event:swapped-direction", record_id: proposal.relation === "left_supersedes_right" ? proposal.left_record_id : proposal.right_record_id, related_record_id: proposal.relation === "left_supersedes_right" ? proposal.right_record_id : proposal.left_record_id, reason_ref: "reason:bound", event_anchor: anchor, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE, reconciliation: bound },
        code: "ILLEGAL_TRANSITION",
      },
      {
        name: "tampered relation keeps digest",
        command: (() => {
          const inverted = proposal.relation === "left_supersedes_right" ? "right_supersedes_left" : "left_supersedes_right";
          const tampered = { ...proposal, relation: inverted };
          return { operation: "supersede", event_id: "event:tampered-relation", record_id: inverted === "left_supersedes_right" ? tampered.right_record_id : tampered.left_record_id, related_record_id: inverted === "left_supersedes_right" ? tampered.left_record_id : tampered.right_record_id, reason_ref: "reason:bound", event_anchor: anchor, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE, reconciliation: { ...bound, proposal: tampered } };
        })(),
        code: "INVALID_DIGEST",
      },
      {
        name: "forged proposal id keeps digest",
        command: { operation: "dispute", event_id: "event:forged-proposal-id", record_id: proposal.left_record_id, reason_ref: "reason:bound", event_anchor: anchor, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE, reconciliation: { ...bound, proposal: { ...proposal, proposal_id: forgedDigest(proposal.proposal_id) } } },
        code: "INVALID_DIGEST",
      },
      {
        name: "tampered occurrence key keeps digest",
        command: { operation: "dispute", event_id: "event:tampered-occurrence", record_id: proposal.left_record_id, reason_ref: "reason:bound", event_anchor: anchor, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE, reconciliation: { ...bound, proposal: { ...proposal, occurrence_key: `${proposal.occurrence_key}-tampered` } } },
        code: "INVALID_DIGEST",
      },
      {
        name: "tampered citations keep digest",
        command: { operation: "dispute", event_id: "event:tampered-citations", record_id: proposal.left_record_id, reason_ref: "reason:bound", event_anchor: anchor, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE, reconciliation: { ...bound, proposal: { ...proposal, evidence_citation_ids: [...proposal.evidence_citation_ids, "citation:zzz-tampered"].sort() } } },
        code: "INVALID_DIGEST",
      },
    ];
    for (const testCase of cases) {
      const before = await cursorAndJournal();
      const refused = await memory.transition(testCase.command as never);
      expect(refused.ok, testCase.name).toBe(false);
      if (refused.ok) continue;
      expect(refused.error.code, testCase.name).toBe(testCase.code);
      const after = await cursorAndJournal();
      expect(after.cursor, `${testCase.name} allocates no cursor`).toBe(before.cursor);
      expect(after.length, `${testCase.name} writes no journal event`).toBe(before.length);
    }
  });
});
