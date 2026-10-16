import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createAssertionFamilyRegistryV1,
  createInMemoryCanonicalMemoryStoreV1,
  openFencedSqliteCanonicalMemoryStoreV1,
  openPostgresCanonicalMemoryStoreV1,
  receiptDigest,
  RECONCILIATION_BINARY_STATUS_FAMILY_ID,
  RECONCILIATION_REGISTRY_ID,
  type CanonicalMemoryStorePort,
  type CanonicalTransactionReceiptV1,
  type LifecycleEventV2,
} from "../engram-memory/index.js";
import { isFencedFactoryStoreV1, markFencedStoreV1, markInMemoryStoreV1 } from "../engram-memory/store-factory.js";
import { captureRequest, createL3Memory, lifecycleCommand, DEADLINE, DIGEST, NOW } from "./memory-l3-fixture.js";
import { buildMemory as buildL7Memory } from "./memory-l7-fixture.js";
import { postgresLaneDecision, startEphemeralPostgres } from "./postgres-ephemeral.js";

const MATRIX = ["16", "17"] as const;
const AUTHORIZATION = { credential: "credential:l3" } as const;
const ZERO_DIGEST = `sha256:${"0".repeat(64)}` as const;

interface IllegalTransitionObservationV1 {
  surface: "engine" | "store";
  operation: string;
  code: string;
  retryable: boolean;
}

interface ParityDigestsV1 {
  high_water_cursor: string;
  state_digest: string;
  journal_root_digest: string;
  blob_root_digest: string;
  registry_versions: ReadonlyArray<{ id: string; version: string }>;
  event_digests: ReadonlyArray<string>;
  snapshot_digest: string;
  eligibility_digest: string;
  accepted_ids: ReadonlyArray<string>;
  outbox_batch_digest: string;
  outbox_through_cursor: string;
  transaction_receipts: ReadonlyArray<CanonicalTransactionReceiptV1>;
  transaction_receipt_digests: ReadonlyArray<string>;
  engine_transaction_receipt_digests: ReadonlyArray<string>;
  duplicate_capture_receipt_digest: string;
  illegal_transitions: ReadonlyArray<IllegalTransitionObservationV1>;
  illegal_transition_mutations_executed: number;
}

interface CorpusExecutionSummaryV1 {
  transaction_receipts: ReadonlyArray<CanonicalTransactionReceiptV1>;
  transaction_receipt_digests: ReadonlyArray<string>;
  engine_transaction_receipt_digests: ReadonlyArray<string>;
  duplicate_capture_receipt_digest: string;
  illegal_transitions: ReadonlyArray<IllegalTransitionObservationV1>;
  illegal_transition_mutations_executed: number;
}

function observeTransactionReceipts(
  rawStore: CanonicalMemoryStorePort,
  receipts: CanonicalTransactionReceiptV1[],
): CanonicalMemoryStorePort {
  const proxy = new Proxy(rawStore, {
    get(target, property, receiver) {
      if (
        property === "commitPending"
        || property === "applyAdmission"
        || property === "applyLifecycle"
        || property === "acknowledgeProjection"
      ) {
        return async (input: unknown) => {
          const method = Reflect.get(target, property, receiver) as (arg: unknown) => Promise<{ ok: boolean; value?: CanonicalTransactionReceiptV1 }>;
          const result = await method.call(target, input);
          if (result.ok && result.value !== undefined) {
            const { receipt_digest, ...body } = result.value;
            expect(receipt_digest).toBe(receiptDigest("canonical-transaction", body));
            receipts.push(result.value);
          }
          return result;
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  if (isFencedFactoryStoreV1(rawStore)) markFencedStoreV1(proxy);
  else markInMemoryStoreV1(proxy);
  return proxy;
}

async function admit(
  memory: ReturnType<typeof createL3Memory>["memory"],
  key: string,
  sequence: string,
  text: string,
  engineReceiptDigests: string[],
): Promise<string> {
  const captured = await memory.capture(captureRequest(key, sequence, text));
  if (!captured.ok || captured.value.candidate_id === undefined || captured.value.transaction_receipt_digest === undefined) {
    throw new Error(`capture ${key} failed`);
  }
  engineReceiptDigests.push(captured.value.transaction_receipt_digest);
  const admitted = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: AUTHORIZATION, deadline_at: DEADLINE });
  if (!admitted.ok || admitted.value.status !== "accepted") throw new Error(`admission ${key} did not accept`);
  engineReceiptDigests.push(admitted.value.transaction_receipt_digest);
  return admitted.value.record_id;
}

/**
 * One deterministic lifecycle corpus.  Driven by the same clock and inputs it
 * yields byte-identical journals, transaction receipts, and illegal-transition
 * refusals on every backend.
 */
async function applyParityCorpus(
  rawStore: CanonicalMemoryStorePort,
  mutationStatements: string[] = [],
  onBeforeAfterIllegalTransitions?: (phase: "before" | "after") => Promise<void>,
): Promise<CorpusExecutionSummaryV1> {
  const transactionReceipts: CanonicalTransactionReceiptV1[] = [];
  const engineReceiptDigests: string[] = [];
  const store = observeTransactionReceipts(rawStore, transactionReceipts);
  const accept = createL3Memory("accept", store).memory;
  const reject = createL3Memory("reject", store).memory;

  const rDispute = await admit(accept, "parity-accept-dispute", "1", "alpha dispute context", engineReceiptDigests);
  const rTrust = await admit(accept, "parity-accept-trust", "2", "beta trust context", engineReceiptDigests);
  const rTombstone = await admit(accept, "parity-accept-tombstone", "3", "gamma tombstone context", engineReceiptDigests);
  const rExpire = await admit(accept, "parity-accept-expire", "4", "delta expire context", engineReceiptDigests);
  const rLive = await admit(accept, "parity-accept-live", "5", "epsilon live context", engineReceiptDigests);

  const rejected = await reject.capture(captureRequest("parity-reject-candidate", "6", "zeta reject context"));
  if (!rejected.ok || rejected.value.candidate_id === undefined || rejected.value.transaction_receipt_digest === undefined) {
    throw new Error("reject capture failed");
  }
  engineReceiptDigests.push(rejected.value.transaction_receipt_digest);
  const rejection = await reject.requestAdmission({ candidate_id: rejected.value.candidate_id, authorization: AUTHORIZATION, deadline_at: DEADLINE });
  if (!rejection.ok || rejection.value.status !== "rejected") throw new Error("rejection did not reject");
  engineReceiptDigests.push(rejection.value.transaction_receipt_digest);

  for (const command of [
    lifecycleCommand("dispute", rDispute),
    lifecycleCommand("resolve_dispute", rDispute, "event:parity-resolve"),
    lifecycleCommand("mark_non_current", rDispute),
    lifecycleCommand("trust_invalidate", rTrust),
    lifecycleCommand("expire", rExpire),
    lifecycleCommand("tombstone", rTombstone),
  ]) {
    const transitioned = await accept.transition(command);
    if (!transitioned.ok) throw new Error(`lifecycle transition ${command.operation} failed: ${transitioned.error.code}`);
    engineReceiptDigests.push(transitioned.value.transaction_receipt_digest);
  }

  // One reconciliation-bound transition (F10): deterministic fixed keys so every
  // backend folds byte-identical journals.
  const reconciled = buildL7Memory({ store, assertionRegistry: createAssertionFamilyRegistryV1() }).memory;
  async function admitParityAssertion(options: { key: string; component: string; citation: string; evidence: string; value: "unknown" | "active"; t: number }): Promise<string> {
    const captured = await reconciled.capture({
      schema_version: 2 as const,
      idempotency_key: options.key,
      payload: {
        schema_version: 2 as const,
        scope_ref: "mem:scope",
        purpose_ref: "purpose:parity",
        valid_time: { t: options.t },
        components: [{ component_id: options.component, kind: "decision" as const, text: `user:parity|status|${options.value}`, citation_ids: [options.citation] }],
        primary_component_id: options.component,
        primary_event: { at: options.t, type_ref: "event:parity", citation_id: options.citation },
        citations: [{ citation_id: options.citation, source_ref: "source:parity", locator: { scheme: "document" as const, value: `parity#${options.value}` }, content_digest: DIGEST }],
        retention: { derivative_rule: "retain" as const },
        reconciliation: { family_refs: [RECONCILIATION_BINARY_STATUS_FAMILY_ID] },
      },
      evidence: { evidence_ref: options.evidence, evidence_digest: DIGEST, citation_ids: [options.citation] },
      authorization: { credential: "credential:l7" },
      source_order: { source_ref: `source:${options.key}`, sequence: "0" },
      deadline_at: DEADLINE,
      cancellation_ref: `cancel:${options.key}`,
    });
    if (!captured.ok || captured.value.candidate_id === undefined || captured.value.transaction_receipt_digest === undefined) {
      throw new Error(`parity assertion capture ${options.key} failed`);
    }
    engineReceiptDigests.push(captured.value.transaction_receipt_digest);
    const admitted = await reconciled.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE });
    if (!admitted.ok || admitted.value.status !== "accepted" || admitted.value.record_id === undefined) {
      throw new Error(`parity assertion admission ${options.key} failed`);
    }
    engineReceiptDigests.push(admitted.value.transaction_receipt_digest);
    return admitted.value.record_id;
  }
  const parityUnknown = await admitParityAssertion({ key: "idem-parity-assert-unknown-00000000", component: "component:parity-assert-unknown", citation: "citation:parity-assert-unknown", evidence: "evidence:parity-assert-unknown", value: "unknown", t: 100 });
  const parityActive = await admitParityAssertion({ key: "idem-parity-assert-active-000000000", component: "component:parity-assert-active", citation: "citation:parity-assert-active", evidence: "evidence:parity-assert-active", value: "active", t: 200 });
  const parityOutcome = await reconciled.proposeReconciliation({
    family_id: RECONCILIATION_BINARY_STATUS_FAMILY_ID,
    family_version: "1",
    left_record_id: parityUnknown,
    right_record_id: parityActive,
    authorization: { credential: "credential:l7" },
    deadline_at: DEADLINE,
  });
  if (!parityOutcome.ok || parityOutcome.value.proposal === undefined) throw new Error("parity reconciliation proposal failed");
  const parityBound = await reconciled.transition({
    operation: "dispute",
    event_id: "event:parity-bound-dispute",
    record_id: parityOutcome.value.proposal.left_record_id,
    reason_ref: "reason:parity-bound",
    event_anchor: { occurred_at: NOW, kind_ref: "kind:parity-bound", provenance_ref: "citation:parity-bound", provenance_digest: DIGEST },
    authorization: { credential: "credential:l7" },
    deadline_at: DEADLINE,
    reconciliation: { proposal: parityOutcome.value.proposal, registry_id: RECONCILIATION_REGISTRY_ID, registry_version: "1" },
  });
  if (!parityBound.ok) throw new Error(`parity bound dispute failed: ${parityBound.error.code}`);
  engineReceiptDigests.push(parityBound.value.transaction_receipt_digest);

  // Acknowledge the projection outbox batch so acknowledgeProjection transaction receipts are also compared.
  const outboxBatch = await store.nextProjectionBatch({ after: "0", limit: 1_000 });
  if (!outboxBatch.ok) throw new Error("parity nextProjectionBatch before acknowledge failed");
  const ackBody = {
    from_cursor_exclusive: outboxBatch.value.from_cursor_exclusive,
    through_cursor_inclusive: outboxBatch.value.through_cursor_inclusive,
    batch_digest: outboxBatch.value.batch_digest,
    invalidated_surfaces: ["lexical"],
    completed_at: NOW,
  };
  const acknowledged = await store.acknowledgeProjection({
    ...ackBody,
    receipt_digest: receiptDigest("projection-invalidation", ackBody),
  });
  if (!acknowledged.ok) throw new Error(`parity acknowledgeProjection failed: ${acknowledged.error.code}`);

  // Idempotent duplicate: re-capturing a bound key acknowledges and writes nothing new.
  const duplicate = await accept.capture(captureRequest("parity-accept-dispute", "1", "alpha dispute context"));
  if (!duplicate.ok || duplicate.value.status !== "duplicate_exact" || duplicate.value.transaction_receipt_digest === undefined) {
    throw new Error("duplicate capture did not return duplicate_exact with receipt digest");
  }
  expect(duplicate.value.transaction_receipt_digest).toBe(transactionReceipts[0]?.receipt_digest);

  // Illegal transitions (T-g4): must fail closed with ILLEGAL_TRANSITION and execute zero writes.
  const mutationsBeforeIllegal = mutationStatements.length;
  const readinessBeforeIllegal = await store.readiness();
  if (!readinessBeforeIllegal.ok) throw new Error("readiness before illegal transitions failed");
  const journalBeforeIllegal = await store.readJournal({ after: "0", limit: 2_000 });
  if (!journalBeforeIllegal.ok) throw new Error("readJournal before illegal transitions failed");
  const receiptsBeforeIllegal = transactionReceipts.length;
  await onBeforeAfterIllegalTransitions?.("before");

  const illegalTransitions: IllegalTransitionObservationV1[] = [];
  for (const illegalCmd of [
    lifecycleCommand("resolve_dispute", rLive, "event:parity-illegal-resolve-live"),
    lifecycleCommand("dispute", rTombstone, "event:parity-illegal-dispute-tombstoned"),
    lifecycleCommand("mark_non_current", rTombstone, "event:parity-illegal-mnc-tombstoned"),
  ]) {
    const res = await accept.transition(illegalCmd);
    expect(res.ok, `engine illegal transition ${illegalCmd.operation} must fail`).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("ILLEGAL_TRANSITION");
      illegalTransitions.push({ surface: "engine", operation: res.error.operation, code: res.error.code, retryable: res.error.retryable });
    }
  }

  const directIllegalCmd = lifecycleCommand("dispute", rTombstone, "event:parity-store-illegal-dispute-tombstoned");
  const directIllegalEventBody = {
    schema_version: 2 as const,
    event_id: directIllegalCmd.event_id,
    cursor: "0",
    recorded_at: NOW,
    operation: "dispute" as const,
    record_id: rTombstone,
    from_state: "tombstoned" as const,
    to_state: "accepted_disputed" as const,
    authorization_receipt_digest: DIGEST,
    reason_ref: directIllegalCmd.reason_ref,
    event_anchor: directIllegalCmd.event_anchor,
    previous_event_digest: ZERO_DIGEST,
  };
  const directIllegalEvent: LifecycleEventV2 = {
    ...directIllegalEventBody,
    event_digest: receiptDigest("event", directIllegalEventBody),
  };
  const directBatchBody = {
    from_cursor_exclusive: "0",
    through_cursor_inclusive: "0",
    records: [],
    removals: [{ record_id: rTombstone, reason_ref: directIllegalCmd.reason_ref }],
  };
  const directRes = await store.applyLifecycle({
    command: directIllegalCmd,
    event: directIllegalEvent,
    projection_batch: { ...directBatchBody, batch_digest: receiptDigest("projection-batch", directBatchBody) },
  });
  expect(directRes.ok, "store illegal applyLifecycle must fail").toBe(false);
  if (!directRes.ok) {
    expect(directRes.error.code).toBe("ILLEGAL_TRANSITION");
    illegalTransitions.push({ surface: "store", operation: directRes.error.operation, code: directRes.error.code, retryable: directRes.error.retryable });
  }

  await onBeforeAfterIllegalTransitions?.("after");
  const illegalMutationsExecuted = mutationStatements.length - mutationsBeforeIllegal;
  expect(illegalMutationsExecuted).toBe(0);
  expect(transactionReceipts.length).toBe(receiptsBeforeIllegal);
  const readinessAfterIllegal = await store.readiness();
  if (!readinessAfterIllegal.ok) throw new Error("readiness after illegal transitions failed");
  expect(readinessAfterIllegal.value.high_water_cursor).toBe(readinessBeforeIllegal.value.high_water_cursor);
  const journalAfterIllegal = await store.readJournal({ after: "0", limit: 2_000 });
  if (!journalAfterIllegal.ok) throw new Error("readJournal after illegal transitions failed");
  expect(journalAfterIllegal.value).toEqual(journalBeforeIllegal.value);

  const transactionReceiptDigests = transactionReceipts.map((receipt) => receipt.receipt_digest);
  // Every engine-level transaction_receipt_digest (capture, admission, transition) is the store receipt digest.
  expect(engineReceiptDigests).toEqual(transactionReceiptDigests.slice(0, engineReceiptDigests.length));

  return {
    transaction_receipts: transactionReceipts,
    transaction_receipt_digests: transactionReceiptDigests,
    engine_transaction_receipt_digests: engineReceiptDigests,
    duplicate_capture_receipt_digest: duplicate.value.transaction_receipt_digest,
    illegal_transitions: illegalTransitions,
    illegal_transition_mutations_executed: illegalMutationsExecuted,
  };
}

/**
 * Collects the folded canonical digests.  It is called on a freshly reopened
 * store so the digests reflect what was durably persisted and reloaded — a
 * backend persistence divergence therefore shows up as a digest mismatch.
 */
async function collectParityDigests(store: CanonicalMemoryStorePort, execution: CorpusExecutionSummaryV1): Promise<ParityDigestsV1> {
  const readiness = await store.readiness();
  if (!readiness.ok) throw new Error("readiness failed");
  const highWater = readiness.value.high_water_cursor;
  const journal = await store.readJournal({ after: "0", limit: 2_000 });
  if (!journal.ok) throw new Error("readJournal failed");
  const checkpoint = await store.checkpoint({ through_cursor: highWater });
  if (!checkpoint.ok) throw new Error("checkpoint failed");
  const snapshot = await store.acceptedSnapshot({ valid_as_of: 1, system_as_of: highWater, authorization_receipt_digest: DIGEST, max_candidates: 50 });
  if (!snapshot.ok) throw new Error("acceptedSnapshot failed");
  // Folds the persisted projection outbox so a persistence divergence there is caught too.
  const outbox = await store.nextProjectionBatch({ after: "0", limit: 1_000 });
  if (!outbox.ok) throw new Error("nextProjectionBatch failed");

  expect(checkpoint.value.registry_versions).toEqual([{ id: RECONCILIATION_REGISTRY_ID, version: "1" }]);

  return {
    high_water_cursor: highWater,
    state_digest: checkpoint.value.state_digest,
    journal_root_digest: checkpoint.value.journal_root_digest,
    blob_root_digest: checkpoint.value.blob_root_digest,
    registry_versions: checkpoint.value.registry_versions,
    event_digests: journal.value.map((event) => event.event_digest),
    snapshot_digest: snapshot.value.snapshot_digest,
    eligibility_digest: snapshot.value.eligibility_digest,
    accepted_ids: snapshot.value.documents.map((document) => document.record_id),
    outbox_batch_digest: outbox.value.batch_digest,
    outbox_through_cursor: outbox.value.through_cursor_inclusive,
    transaction_receipts: execution.transaction_receipts,
    transaction_receipt_digests: execution.transaction_receipt_digests,
    engine_transaction_receipt_digests: execution.engine_transaction_receipt_digests,
    duplicate_capture_receipt_digest: execution.duplicate_capture_receipt_digest,
    illegal_transitions: execution.illegal_transitions,
    illegal_transition_mutations_executed: execution.illegal_transition_mutations_executed,
  };
}

const sqliteWorkspaces: string[] = [];
const stops: Array<() => void> = [];

async function sqliteSurfaceCounts(filenameValue: string): Promise<Record<string, number>> {
  const native = await import("../engram-memory/node_modules/better-sqlite3/lib/index.js");
  const database = new native.default(filenameValue, { readonly: true, fileMustExist: true });
  try {
    const tables = [
      "memory_blob",
      "memory_journal",
      "memory_state",
      "memory_control",
      "memory_envelope",
      "memory_capture_idempotency",
      "accepted_lexical",
      "accepted_lexical_fts",
      "memory_outbox",
    ];
    return Object.fromEntries(
      tables.map((table) => [table, (database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count]),
    );
  } finally {
    database.close();
  }
}

async function sqliteDigests(): Promise<ParityDigestsV1> {
  const workspace = mkdtempSync(join(tmpdir(), "engram-memory-parity-sqlite-"));
  sqliteWorkspaces.push(workspace);
  const filename = join(workspace, "canonical.sqlite");
  const mutationStatements: string[] = [];
  const writer = await openFencedSqliteCanonicalMemoryStoreV1({
    filename,
    clock: { now: () => NOW },
    store_id: "parity",
    allow_ephemeral_filesystem_store: true,
    on_mutation_statement: (stage) => mutationStatements.push(stage),
  });
  if (!writer.ok) throw new Error(`sqlite open failed: ${writer.error.message}`);
  let countsBeforeIllegal: Record<string, number> | undefined;
  let countsAfterIllegal: Record<string, number> | undefined;
  const execution = await applyParityCorpus(writer.value, mutationStatements, async (phase) => {
    if (phase === "before") countsBeforeIllegal = await sqliteSurfaceCounts(filename);
    else countsAfterIllegal = await sqliteSurfaceCounts(filename);
  });
  expect(mutationStatements.length).toBeGreaterThan(0);
  expect(countsAfterIllegal).toEqual(countsBeforeIllegal);
  await writer.value.close();
  // Reopen so the digests are folded from durably persisted rows, not process state.
  const reader = await openFencedSqliteCanonicalMemoryStoreV1({ filename, clock: { now: () => NOW }, store_id: "parity", allow_ephemeral_filesystem_store: true });
  if (!reader.ok) throw new Error(`sqlite reopen failed: ${reader.error.message}`);
  try {
    return await collectParityDigests(reader.value, execution);
  } finally {
    await reader.value.close();
  }
}

async function inMemoryReferenceDigests(): Promise<ParityDigestsV1> {
  const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW }, store_id: "parity", storage_epoch: "1" });
  const execution = await applyParityCorpus(store);
  return collectParityDigests(store, execution);
}

afterEach(() => {
  while (stops.length > 0) stops.pop()!();
  while (sqliteWorkspaces.length > 0) rmSync(sqliteWorkspaces.pop()!, { recursive: true, force: true });
});

describe("SQLite canonical parity with reference transaction receipts and illegal-transition guard", () => {
  it("SQLite produces identical transaction-receipt digests to the reference store and writes nothing on illegal transitions", async () => {
    const sqlite = await sqliteDigests();
    const reference = await inMemoryReferenceDigests();
    expect(sqlite.transaction_receipt_digests.length).toBe(24);
    expect(sqlite.illegal_transitions).toEqual([
      { surface: "engine", operation: "resolve_dispute", code: "ILLEGAL_TRANSITION", retryable: false },
      { surface: "engine", operation: "dispute", code: "ILLEGAL_TRANSITION", retryable: false },
      { surface: "engine", operation: "mark_non_current", code: "ILLEGAL_TRANSITION", retryable: false },
      { surface: "store", operation: "dispute", code: "ILLEGAL_TRANSITION", retryable: false },
    ]);
    expect(sqlite.illegal_transition_mutations_executed).toBe(0);
    expect(sqlite).toEqual(reference);
  });
});

async function postgresSurfaceCounts(connection: string): Promise<Record<string, number>> {
  const pg = await import("pg");
  const client = new pg.default.Client(connection);
  await client.connect();
  try {
    const tables = [
      "memory_blob",
      "memory_journal",
      "memory_state",
      "memory_control",
      "memory_envelope",
      "memory_capture_idempotency",
      "accepted_lexical",
      "accepted_lexical_fts",
      "memory_outbox",
    ];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const result = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
      counts[table] = result.rows[0]?.count ?? -1;
    }
    const hw = await client.query<{ cursor: number }>("SELECT cursor::int AS cursor FROM memory_highwater WHERE id = 1");
    counts.memory_highwater_cursor = hw.rows[0]?.cursor ?? -1;
    return counts;
  } finally {
    await client.end();
  }
}

describe("SQLite and Postgres canonical parity", () => {
  const decision = postgresLaneDecision(MATRIX);
  if (decision.lane === "fail") {
    const cause = decision.cause;
    it("postgres lane prerequisites hold in required mode", () => {
      throw new Error(cause);
    });
    return;
  }
  const maybe = decision.lane === "run" ? it : it.skip;

  maybe("SQLite and Postgres produce identical canonical state digests, transaction-receipt digests, and illegal-transition zero-write behavior for the lifecycle corpus", async () => {
    const sqlite = await sqliteDigests();
    for (const version of MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      stops.push(postgres.stop);
      try {
        const mutationStatements: string[] = [];
        const writer = await openPostgresCanonicalMemoryStoreV1({
          connection: postgres.connection,
          clock: { now: () => NOW },
          store_id: "parity",
          on_mutation_statement: (stage) => mutationStatements.push(stage),
        });
        expect(writer).toMatchObject({ ok: true, value: { capabilities: { backend: "postgres", atomic_promotion: true, dense_cursor: true, accepted_only_lexical: true, fenced_single_writer: true } } });
        if (!writer.ok) throw new Error(`postgres ${version} open failed: ${writer.error.message}`);
        let countsBeforeIllegal: Record<string, number> | undefined;
        let countsAfterIllegal: Record<string, number> | undefined;
        const execution = await applyParityCorpus(writer.value, mutationStatements, async (phase) => {
          if (phase === "before") countsBeforeIllegal = await postgresSurfaceCounts(postgres.connection);
          else countsAfterIllegal = await postgresSurfaceCounts(postgres.connection);
        });
        expect(mutationStatements.length).toBeGreaterThan(0);
        expect(countsAfterIllegal).toEqual(countsBeforeIllegal);
        await writer.value.close();
        // Reopen so the digests fold Postgres-persisted rows, not process state.
        const reader = await openPostgresCanonicalMemoryStoreV1({ connection: postgres.connection, clock: { now: () => NOW }, store_id: "parity" });
        if (!reader.ok) throw new Error(`postgres ${version} reopen failed: ${reader.error.message}`);
        try {
          const digests = await collectParityDigests(reader.value, execution);
          expect(digests, `postgres:${version} must match SQLite canonical and transaction-receipt digests`).toEqual(sqlite);
        } finally {
          await reader.value.close();
        }
      } finally {
        postgres.stop();
        const idx = stops.indexOf(postgres.stop);
        if (idx >= 0) stops.splice(idx, 1);
      }
    }
  }, 180_000);

  it("enforces the temporal boundary intervals (start, end, just-before, just-after, open-end, point) identically on in-memory and SQLite canonical stores", async () => {
    const cursor = 1_750_000_000_000;
    const cases: ReadonlyArray<{ key: string; valid_time: { t: number; t_end?: number }; visible: boolean }> = [
      { key: "tb-open", valid_time: { t: cursor - 2 }, visible: true },
      { key: "tb-touches-cursor", valid_time: { t: cursor - 1, t_end: cursor }, visible: true },
      { key: "tb-point", valid_time: { t: cursor, t_end: cursor }, visible: true },
      { key: "tb-start", valid_time: { t: cursor, t_end: cursor + 2 }, visible: true },
      { key: "tb-ended-before", valid_time: { t: cursor - 2, t_end: cursor - 1 }, visible: false },
      { key: "tb-starts-after", valid_time: { t: cursor + 1, t_end: cursor + 2 }, visible: false },
    ];

    async function runTemporalBoundaryOnStore(store: CanonicalMemoryStorePort): Promise<string[]> {
      const { memory } = createL3Memory("accept", store);
      const recordIdToKey = new Map<string, string>();
      for (const [idx, item] of cases.entries()) {
        const req = captureRequest(`tb-${item.key}-${"0".repeat(16)}`, String(idx + 1), `temporal boundary ${item.key}`);
        req.payload.valid_time = item.valid_time;
        req.payload.primary_event.at = item.valid_time.t;
        const captured = await memory.capture(req);
        if (!captured.ok || !captured.value.candidate_id) throw new Error(`capture ${item.key} failed`);
        const admitted = await memory.requestAdmission({
          candidate_id: captured.value.candidate_id,
          authorization: AUTHORIZATION,
          deadline_at: DEADLINE,
        });
        if (!admitted.ok || admitted.value.status !== "accepted") throw new Error(`admit ${item.key} failed`);
        recordIdToKey.set(admitted.value.record_id, item.key);
      }
      const readiness = await store.readiness();
      if (!readiness.ok) throw new Error("readiness failed");
      const snap = await store.acceptedSnapshot({
        valid_as_of: cursor,
        system_as_of: readiness.value.high_water_cursor,
        authorization_receipt_digest: DIGEST,
        max_candidates: 50,
      });
      if (!snap.ok) throw new Error("acceptedSnapshot failed");
      return snap.value.documents.map((doc) => recordIdToKey.get(doc.record_id) ?? doc.record_id).sort();
    }

    const inMem = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW }, store_id: "tb-parity", storage_epoch: "1" });
    const inMemVisible = await runTemporalBoundaryOnStore(inMem);

    const workspace = mkdtempSync(join(tmpdir(), "engram-memory-tb-sqlite-"));
    sqliteWorkspaces.push(workspace);
    const sqliteRes = await openFencedSqliteCanonicalMemoryStoreV1({
      filename: join(workspace, "tb.sqlite"),
      clock: { now: () => NOW },
      store_id: "tb-parity",
      allow_ephemeral_filesystem_store: true,
    });
    if (!sqliteRes.ok) throw new Error(sqliteRes.error.message);
    const sqliteVisible = await runTemporalBoundaryOnStore(sqliteRes.value);
    await sqliteRes.value.close();

    const expectedVisible = ["tb-open", "tb-point", "tb-start", "tb-touches-cursor"];
    expect(inMemVisible).toEqual(expectedVisible);
    expect(sqliteVisible).toEqual(expectedVisible);
  });

  maybe("enforces the temporal boundary intervals identically on Postgres canonical store", async () => {
    const cursor = 1_750_000_000_000;
    const cases: ReadonlyArray<{ key: string; valid_time: { t: number; t_end?: number } }> = [
      { key: "tb-open", valid_time: { t: cursor - 2 } },
      { key: "tb-touches-cursor", valid_time: { t: cursor - 1, t_end: cursor } },
      { key: "tb-point", valid_time: { t: cursor, t_end: cursor } },
      { key: "tb-start", valid_time: { t: cursor, t_end: cursor + 2 } },
      { key: "tb-ended-before", valid_time: { t: cursor - 2, t_end: cursor - 1 } },
      { key: "tb-starts-after", valid_time: { t: cursor + 1, t_end: cursor + 2 } },
    ];
    const postgres = await startEphemeralPostgres("16");
    stops.push(postgres.stop);
    try {
      const pgRes = await openPostgresCanonicalMemoryStoreV1({
        connection: postgres.connection,
        clock: { now: () => NOW },
        store_id: "tb-parity",
      });
      if (!pgRes.ok) throw new Error(pgRes.error.message);
      try {
        const { memory } = createL3Memory("accept", pgRes.value);
        const recordIdToKey = new Map<string, string>();
        for (const [idx, item] of cases.entries()) {
          const req = captureRequest(`tb-${item.key}-${"0".repeat(16)}`, String(idx + 1), `temporal boundary ${item.key}`);
          req.payload.valid_time = item.valid_time;
          req.payload.primary_event.at = item.valid_time.t;
          const captured = await memory.capture(req);
          if (!captured.ok || !captured.value.candidate_id) throw new Error(`capture ${item.key} failed`);
          const admitted = await memory.requestAdmission({
            candidate_id: captured.value.candidate_id,
            authorization: AUTHORIZATION,
            deadline_at: DEADLINE,
          });
          if (!admitted.ok || admitted.value.status !== "accepted") throw new Error(`admit ${item.key} failed`);
          recordIdToKey.set(admitted.value.record_id, item.key);
        }
        const readiness = await pgRes.value.readiness();
        if (!readiness.ok) throw new Error("readiness failed");
        const snap = await pgRes.value.acceptedSnapshot({
          valid_as_of: cursor,
          system_as_of: readiness.value.high_water_cursor,
          authorization_receipt_digest: DIGEST,
          max_candidates: 50,
        });
        if (!snap.ok) throw new Error("acceptedSnapshot failed");
        const pgVisible = snap.value.documents.map((doc) => recordIdToKey.get(doc.record_id) ?? doc.record_id).sort();
        expect(pgVisible).toEqual(["tb-open", "tb-point", "tb-start", "tb-touches-cursor"]);
      } finally {
        await pgRes.value.close();
      }
    } finally {
      postgres.stop();
      const idx = stops.indexOf(postgres.stop);
      if (idx >= 0) stops.splice(idx, 1);
    }
  }, 120_000);
});
