import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createAssertionFamilyRegistryV1,
  openFencedSqliteCanonicalMemoryStoreV1,
  openPostgresCanonicalMemoryStoreV1,
  RECONCILIATION_BINARY_STATUS_FAMILY_ID,
  RECONCILIATION_REGISTRY_ID,
  type CanonicalMemoryStorePort,
} from "../engram-memory/index.js";
import { captureRequest, createL3Memory, lifecycleCommand, DEADLINE, DIGEST, NOW } from "./memory-l3-fixture.js";
import { buildMemory as buildL7Memory } from "./memory-l7-fixture.js";
import { postgresLaneDecision, startEphemeralPostgres } from "./postgres-ephemeral.js";

const MATRIX = ["16", "17"] as const;
const AUTHORIZATION = { credential: "credential:l3" } as const;

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
}

async function admit(memory: ReturnType<typeof createL3Memory>["memory"], key: string, sequence: string, text: string): Promise<string> {
  const captured = await memory.capture(captureRequest(key, sequence, text));
  if (!captured.ok || captured.value.candidate_id === undefined) throw new Error(`capture ${key} failed`);
  const admitted = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: AUTHORIZATION, deadline_at: DEADLINE });
  if (!admitted.ok || admitted.value.status !== "accepted") throw new Error(`admission ${key} did not accept`);
  return admitted.value.record_id;
}

/**
 * One deterministic lifecycle corpus.  Driven by the same clock and inputs it
 * yields byte-identical journals on every backend.
 */
async function applyParityCorpus(store: CanonicalMemoryStorePort): Promise<void> {
  const accept = createL3Memory("accept", store).memory;
  const reject = createL3Memory("reject", store).memory;

  const rDispute = await admit(accept, "parity-accept-dispute", "1", "alpha dispute context");
  const rTrust = await admit(accept, "parity-accept-trust", "2", "beta trust context");
  const rTombstone = await admit(accept, "parity-accept-tombstone", "3", "gamma tombstone context");
  const rExpire = await admit(accept, "parity-accept-expire", "4", "delta expire context");
  await admit(accept, "parity-accept-live", "5", "epsilon live context");

  const rejected = await reject.capture(captureRequest("parity-reject-candidate", "6", "zeta reject context"));
  if (!rejected.ok || rejected.value.candidate_id === undefined) throw new Error("reject capture failed");
  const rejection = await reject.requestAdmission({ candidate_id: rejected.value.candidate_id, authorization: AUTHORIZATION, deadline_at: DEADLINE });
  if (!rejection.ok || rejection.value.status !== "rejected") throw new Error("rejection did not reject");

  await accept.transition(lifecycleCommand("dispute", rDispute));
  await accept.transition(lifecycleCommand("resolve_dispute", rDispute, "event:parity-resolve"));
  await accept.transition(lifecycleCommand("mark_non_current", rDispute));
  await accept.transition(lifecycleCommand("trust_invalidate", rTrust));
  await accept.transition(lifecycleCommand("expire", rExpire));
  await accept.transition(lifecycleCommand("tombstone", rTombstone));

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
    if (!captured.ok || captured.value.candidate_id === undefined) throw new Error(`parity assertion capture ${options.key} failed`);
    const admitted = await reconciled.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE });
    if (!admitted.ok || admitted.value.status !== "accepted" || admitted.value.record_id === undefined) throw new Error(`parity assertion admission ${options.key} failed`);
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

  // Idempotent duplicate: re-capturing a bound key acknowledges and writes nothing new.
  await accept.capture(captureRequest("parity-accept-dispute", "1", "alpha dispute context"));
}

/**
 * Collects the folded canonical digests.  It is called on a freshly reopened
 * store so the digests reflect what was durably persisted and reloaded — a
 * backend persistence divergence therefore shows up as a digest mismatch.
 */
async function collectParityDigests(store: CanonicalMemoryStorePort): Promise<ParityDigestsV1> {
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
  };
}

const sqliteWorkspaces: string[] = [];
const stops: Array<() => void> = [];

async function sqliteDigests(): Promise<ParityDigestsV1> {
  const workspace = mkdtempSync(join(tmpdir(), "engram-memory-parity-sqlite-"));
  sqliteWorkspaces.push(workspace);
  const filename = join(workspace, "canonical.sqlite");
  const writer = await openFencedSqliteCanonicalMemoryStoreV1({ filename, clock: { now: () => NOW }, store_id: "parity", allow_ephemeral_filesystem_store: true });
  if (!writer.ok) throw new Error(`sqlite open failed: ${writer.error.message}`);
  await applyParityCorpus(writer.value);
  await writer.value.close();
  // Reopen so the digests are folded from durably persisted rows, not process state.
  const reader = await openFencedSqliteCanonicalMemoryStoreV1({ filename, clock: { now: () => NOW }, store_id: "parity", allow_ephemeral_filesystem_store: true });
  if (!reader.ok) throw new Error(`sqlite reopen failed: ${reader.error.message}`);
  try {
    return await collectParityDigests(reader.value);
  } finally {
    await reader.value.close();
  }
}

afterEach(() => {
  while (stops.length > 0) stops.pop()!();
  while (sqliteWorkspaces.length > 0) rmSync(sqliteWorkspaces.pop()!, { recursive: true, force: true });
});

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

  maybe("SQLite and Postgres produce identical canonical state digests for the lifecycle corpus", async () => {
    const sqlite = await sqliteDigests();
    for (const version of MATRIX) {
      const postgres = await startEphemeralPostgres(version);
      stops.push(postgres.stop);
      try {
        const writer = await openPostgresCanonicalMemoryStoreV1({ connection: postgres.connection, clock: { now: () => NOW }, store_id: "parity" });
        expect(writer).toMatchObject({ ok: true, value: { capabilities: { backend: "postgres", atomic_promotion: true, dense_cursor: true, accepted_only_lexical: true, fenced_single_writer: true } } });
        if (!writer.ok) throw new Error(`postgres ${version} open failed: ${writer.error.message}`);
        await applyParityCorpus(writer.value);
        await writer.value.close();
        // Reopen so the digests fold Postgres-persisted rows, not process state.
        const reader = await openPostgresCanonicalMemoryStoreV1({ connection: postgres.connection, clock: { now: () => NOW }, store_id: "parity" });
        if (!reader.ok) throw new Error(`postgres ${version} reopen failed: ${reader.error.message}`);
        try {
          const digests = await collectParityDigests(reader.value);
          expect(digests, `postgres:${version} must match SQLite canonical digests`).toEqual(sqlite);
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
});
