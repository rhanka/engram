import { describe, expect, it } from "vitest";

import {
  createInMemoryCanonicalMemoryStoreV1,
  createMemoryPortV2,
  knowledgePayloadDigest,
  receiptDigest,
  runProjectionInvalidationCascadeV1,
  type Digest,
  type MemoryEngineDependenciesV2,
  type MemoryPortV2,
  type ProjectionBatchV1,
  type ProjectionInvalidationSurfaceV1,
} from "../engram-memory/index.js";
import { captureRequest, createL3Memory, lifecycleCommand } from "./memory-l3-fixture.js";
import { FULL_ALLOWLIST, recallRequest, seedAccepted } from "./memory-l7-fixture.js";

const DEADLINE = "2026-08-16T12:40:00.000Z";

/** A derived projection surface that records the removals it was asked to invalidate. */
function recordingSurface(projection_id: string): ProjectionInvalidationSurfaceV1 & { removed: string[] } {
  const removed: string[] = [];
  return {
    projection_id,
    removed,
    async invalidate(batch: ProjectionBatchV1) {
      for (const removal of batch.removals) removed.push(removal.record_id);
      return { ok: true as const, value: { projection_id, cursor: batch.through_cursor_inclusive, digest: `sha256:${"0".repeat(64)}` as const } };
    },
  };
}

describe("projection invalidation cascade", () => {
  it("tombstone invalidates FTS nodes edges vectors caches aggregates and exports through one cursor receipt", async () => {
    const { memory, store } = createL3Memory();
    const captured = await memory.capture(captureRequest("idempotency-key-cascade-0001", "1"));
    expect(captured).toMatchObject({ ok: true, value: { status: "committed_pending" } });
    if (!captured.ok || captured.value.candidate_id === undefined) return;
    const admitted = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:l3" }, deadline_at: DEADLINE });
    expect(admitted).toMatchObject({ ok: true, value: { status: "accepted" } });
    if (!admitted.ok || admitted.value.record_id === undefined) return;
    const recordId = admitted.value.record_id;

    const tombstoned = await memory.transition(lifecycleCommand("tombstone", recordId));
    expect(tombstoned).toMatchObject({ ok: true, value: { to_state: "tombstoned", operation: "tombstone" } });
    if (!tombstoned.ok) return;
    const tombstoneCursor = tombstoned.value.cursor;

    const surfaces = ["fts", "nodes", "edges", "vectors", "caches", "aggregates", "exports"].map(recordingSurface);

    // Acknowledge everything after the acceptance cursor so the removal batch is the tombstone.
    const cascade = await runProjectionInvalidationCascadeV1({
      store,
      surfaces,
      after_cursor: "2",
      deadline_at: DEADLINE,
    });
    expect(cascade.ok).toBe(true);
    if (!cascade.ok) return;

    // The removal reached every derived surface exactly once, for the tombstoned record.
    for (const surface of surfaces) {
      expect(surface.removed).toEqual([recordId]);
    }

    // ONE cursor-acknowledged receipt covers all seven surfaces at the tombstone cursor.
    expect(cascade.value.receipt.through_cursor).toBe(tombstoneCursor);
    expect(cascade.value.receipt.complete).toBe(true);
    expect(cascade.value.receipt.projection_receipts.map((entry) => entry.projection_id).sort()).toEqual(
      ["aggregates", "caches", "edges", "exports", "fts", "nodes", "vectors"],
    );
    expect(new Set(cascade.value.receipt.projection_receipts.map((entry) => entry.cursor))).toEqual(new Set([tombstoneCursor]));
    expect(cascade.value.acknowledgement.operation).toBe("projection_invalidate");
    expect(cascade.value.acknowledgement.cursor).toBe(tombstoneCursor);
    expect(cascade.value.acknowledgement.state_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

const NOW_X2 = "2026-08-16T12:34:56.789Z";
const DIGEST_X2 = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Digest;

/** A live in-memory derived projection: it indexes batch records and drops removals, and can be queried. */
class LiveProjectionSurface implements ProjectionInvalidationSurfaceV1 {
  readonly entries = new Map<string, Digest>();
  calls = 0;
  constructor(readonly projection_id: string) {}
  async invalidate(batch: ProjectionBatchV1) {
    this.calls += 1;
    for (const record of batch.records) this.entries.set(record.record_id, record.record_digest);
    for (const removal of batch.removals) this.entries.delete(removal.record_id);
    return {
      ok: true as const,
      value: { projection_id: this.projection_id, cursor: batch.through_cursor_inclusive, digest: DIGEST_X2 },
    };
  }
  has(recordId: string): boolean {
    return this.entries.has(recordId);
  }
  /** Models the projection having ingested an accepted record through its serving path (batches carry removals). */
  index(recordId: string): void {
    this.entries.set(recordId, DIGEST_X2);
  }
}

/** Engine harness wiring optional host-owned projection surfaces, with a deniable authorization port. */
function createCascadeMemory(
  surfaces?: ReadonlyArray<ProjectionInvalidationSurfaceV1>,
  deniedOperations: ReadonlySet<string> = new Set(),
  scope = "mem:scope",
): { memory: MemoryPortV2; authorizedOperations: string[] } {
  const authorizedOperations: string[] = [];
  const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW_X2 } });
  const authorization = {
    version: 1 as const,
    async authorize(request: { operation: string; resource: { scope_ref?: string }; resource_digest: Digest }) {
      authorizedOperations.push(request.operation);
      if (deniedOperations.has(request.operation)) {
        return {
          ok: false as const,
          error: { code: "UNAUTHORIZED" as const, operation: request.operation, message: "denied by the host port", retryable: false as const },
        };
      }
      const body = {
        allowed: true as const,
        decision_id: "decision:x2",
        policy_version: "1",
        operation: request.operation,
        resource_digest: request.resource_digest,
        scope_ref: request.resource.scope_ref ?? scope,
        not_before: NOW_X2,
        expires_at: DEADLINE,
        revocation_epoch: "0",
        redaction: { mode: "field-allowlist" as const, allowed_fields: FULL_ALLOWLIST, allow_derivation_lineage: false, max_packet_bytes: 1_048_576 },
        authentication_receipt_digest: DIGEST_X2,
      };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("authorization-allowed", body) } };
    },
    async revalidate(receipt_digest: Digest, checked_at: string) {
      const body = { receipt_digest, checked_at, valid: true, current_revocation_epoch: "0", reason: "valid" as const };
      return { ok: true as const, value: { ...body, revalidation_receipt_digest: receiptDigest("authorization-revalidation", body, "revalidation_receipt_digest") } };
    },
    async redact(request: { source_record: Record<string, unknown> }) {
      const src = request.source_record as {
        scope_ref: string; purpose_ref: string; valid_time: { t: number }; components: unknown[];
        primary_component_id: string; primary_event: unknown; citations: unknown[]; retention: unknown; record_digest: Digest;
      };
      const payload = {
        schema_version: 2 as const,
        scope_ref: src.scope_ref,
        purpose_ref: src.purpose_ref,
        valid_time: src.valid_time,
        components: src.components,
        primary_component_id: src.primary_component_id,
        primary_event: src.primary_event,
        citations: src.citations,
        retention: src.retention,
        reconciliation: { family_refs: [] },
      };
      const body = {
        payload,
        source_record_digest: src.record_digest,
        output_payload_digest: knowledgePayloadDigest(payload as never),
        policy_version: "1",
      };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("redaction-result", body) } };
    },
  };
  const policy = {
    policy_id: "policy:x2",
    policy_version: "1",
    async decide(request: { record_digest: Digest }) {
      const body = { policy_id: "policy:x2", policy_version: "1", record_digest: request.record_digest, decision: "accept" as const, issued_at: NOW_X2 };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("admission-decision", body) } };
    },
  };
  const plaintext = new Map<string, string>();
  const crypto = {
    version: 1 as const,
    async seal(input: { candidate_id: string; plaintext: string }) {
      plaintext.set(input.candidate_id, input.plaintext);
      const body = { candidate_id: input.candidate_id, envelope_ref: `envelope:${input.candidate_id}`, key_ref: `key:${input.candidate_id}`, ciphertext: `ciphertext:${input.candidate_id}` };
      return { ok: true as const, value: { ...body, envelope_digest: receiptDigest("sealed-candidate", body) } };
    },
    async open(input: { sealed: { candidate_id: string } }) {
      const value = plaintext.get(input.sealed.candidate_id);
      return value === undefined
        ? { ok: false as const, error: { code: "UNAUTHORIZED" as const, operation: "inspect_candidate" as const, message: "destroyed", retryable: false } }
        : { ok: true as const, value: { plaintext: value } };
    },
    async destroy(input: { key_ref: string }) {
      const body = { destroyed: true, key_ref: input.key_ref };
      return { ok: true as const, value: { destroyed: true, receipt_digest: receiptDigest("key-destruction", body) } };
    },
    async rotate() { throw new Error("unused"); },
  };
  const memory = createMemoryPortV2({
    canonical_store: store,
    authorization,
    admission_policy: policy,
    crypto,
    activity_sources: [],
    allow_unfenced_memory_store: true,
    ...(surfaces === undefined ? {} : { projection_surfaces: surfaces }),
    clock: { now: () => NOW_X2 },
  } as unknown as MemoryEngineDependenciesV2);
  return { memory, authorizedOperations };
}

async function captureAdmitTombstone(memory: MemoryPortV2, key: string, sequence: string): Promise<string> {
  const captured = await memory.capture(captureRequest(key, sequence));
  expect(captured.ok).toBe(true);
  if (!captured.ok || captured.value.candidate_id === undefined) throw new Error("capture failed");
  const admitted = await memory.requestAdmission({ candidate_id: captured.value.candidate_id, authorization: { credential: "credential:x2" }, deadline_at: DEADLINE });
  expect(admitted.ok).toBe(true);
  if (!admitted.ok || admitted.value.record_id === undefined) throw new Error("admission failed");
  const recordId = admitted.value.record_id;
  const tombstoned = await memory.transition(lifecycleCommand("tombstone", recordId));
  expect(tombstoned.ok).toBe(true);
  if (!tombstoned.ok) throw new Error("tombstone failed");
  return recordId;
}

describe("MemoryPortV2.invalidateProjections wiring", () => {
  it("MemoryPortV2.invalidateProjections authorizes projection_invalidate, runs the cascade over the configured surfaces and returns one cursor receipt", async () => {
    const graph = new LiveProjectionSurface("graph");
    const vector = new LiveProjectionSurface("vector");
    const { memory, authorizedOperations } = createCascadeMemory([graph, vector], new Set(), "scope:l3");
    const recordId = await captureAdmitTombstone(memory, "idempotency-key-x2-0001", "1");
    graph.index(recordId);
    vector.index(recordId);
    const readiness = await memory.readiness();
    expect(readiness.ok).toBe(true);
    if (!readiness.ok) return;
    const invalidated = await memory.invalidateProjections({
      through_cursor: readiness.value.high_water_cursor,
      authorization: { credential: "credential:x2" },
      deadline_at: DEADLINE,
    });
    expect(invalidated.ok).toBe(true);
    if (!invalidated.ok) return;
    // The engine authorized through the injected port — never self-asserted.
    expect(authorizedOperations).toContain("projection_invalidate");
    // One cursor-acknowledged receipt covers every configured surface.
    expect(invalidated.value.projection_receipts.map((entry) => entry.projection_id).sort()).toEqual(["graph", "vector"]);
    expect(new Set(invalidated.value.projection_receipts.map((entry) => entry.cursor))).toEqual(new Set([invalidated.value.through_cursor]));
    // The tombstoned record reached every surface exactly once and is gone from each live index.
    for (const surface of [graph, vector] as const) {
      expect(surface.has(recordId)).toBe(false);
    }
  });

  it("a denied projection_invalidate is UNAUTHORIZED before any cascade round", async () => {
    const graph = new LiveProjectionSurface("graph");
    const { memory, authorizedOperations } = createCascadeMemory([graph], new Set(["projection_invalidate"]), "scope:l3");
    await captureAdmitTombstone(memory, "idempotency-key-x2-0002", "1");
    const refused = await memory.invalidateProjections({
      through_cursor: "1",
      authorization: { credential: "credential:x2" },
      deadline_at: DEADLINE,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toMatchObject({ code: "UNAUTHORIZED", operation: "projection_invalidate" });
    expect(authorizedOperations).toContain("projection_invalidate");
    expect(graph.calls).toBe(0);
  });

  it("an unknown projection id is INVALID_SCHEMA and absent surfaces is CAPABILITY_UNAVAILABLE", async () => {
    const graph = recordingSurface("graph");
    const { memory } = createCascadeMemory([graph]);
    // A lot exists, so an untouched surface proves refusal before any round — not an empty store.
    await seedAccepted(memory, "x2 unknown id probe term");
    const unknown = await memory.invalidateProjections({
      through_cursor: "0",
      projection_ids: ["projection:nope"],
      authorization: { credential: "credential:x2" },
      deadline_at: DEADLINE,
    });
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.error).toMatchObject({ code: "INVALID_SCHEMA", operation: "projection_invalidate" });
    // Checked before any cascade round: the configured surface saw nothing.
    expect(graph.removed).toEqual([]);

    for (const surfaces of [undefined, []] as const) {
      const { memory: bare, authorizedOperations: bareAuthorized } = createCascadeMemory(surfaces);
      const refused = await bare.invalidateProjections({
        through_cursor: "0",
        authorization: { credential: "credential:x2" },
        deadline_at: DEADLINE,
      });
      expect(refused.ok).toBe(false);
      if (refused.ok) continue;
      expect(refused.error).toMatchObject({ code: "CAPABILITY_UNAVAILABLE", operation: "projection_invalidate" });
      // Capability is checked before authorization: the port saw no authorization call.
      expect(bareAuthorized).toEqual([]);
    }
  });

  it("a through_cursor above the readiness high-water mark is STALE_PAGE", async () => {
    const { memory } = createCascadeMemory([recordingSurface("graph")]);
    const refused = await memory.invalidateProjections({
      through_cursor: "99",
      authorization: { credential: "credential:x2" },
      deadline_at: DEADLINE,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toMatchObject({ code: "STALE_PAGE", operation: "projection_invalidate" });
  });

  it("a live graph and vector projection drops a tombstoned record after the cascade and a re-read does not resurrect it", async () => {
    const graph = new LiveProjectionSurface("graph");
    const vector = new LiveProjectionSurface("vector");
    const { memory } = createCascadeMemory([graph, vector]);
    const keep = await seedAccepted(memory, "x2 keep query term");
    const doomed = await seedAccepted(memory, "x2 doomed query term");
    for (const surface of [graph, vector] as const) {
      surface.index(keep);
      surface.index(doomed);
    }
    const tombstoned = await memory.transition(lifecycleCommand("tombstone", doomed));
    expect(tombstoned.ok).toBe(true);
    if (!tombstoned.ok) return;
    const invalidated = await memory.invalidateProjections({
      through_cursor: tombstoned.value.cursor,
      authorization: { credential: "credential:x2" },
      deadline_at: DEADLINE,
    });
    expect(invalidated.ok).toBe(true);
    if (!invalidated.ok) return;
    // Matrix over every configured surface: the kept record stays indexed, the tombstoned one is gone.
    for (const surface of [graph, vector] as const) {
      expect(surface.has(keep)).toBe(true);
      expect(surface.has(doomed)).toBe(false);
    }
    // Accepted lexical surface: recall serves the kept record, never the tombstoned one.
    const recalled = await memory.recall(recallRequest("x2"));
    expect(recalled.ok).toBe(true);
    if (!recalled.ok) return;
    const ids = recalled.value.records.map((entry) => entry.record.record_id);
    expect(ids).toContain(keep);
    expect(ids).not.toContain(doomed);
    // Re-read: a second cascade and a second recall never resurrect the tombstoned record.
    const reread = await memory.invalidateProjections({
      through_cursor: tombstoned.value.cursor,
      authorization: { credential: "credential:x2" },
      deadline_at: DEADLINE,
    });
    expect(reread.ok).toBe(true);
    for (const surface of [graph, vector] as const) {
      expect(surface.has(doomed)).toBe(false);
    }
    const recalledAgain = await memory.recall(recallRequest("x2"));
    expect(recalledAgain.ok).toBe(true);
    if (!recalledAgain.ok) return;
    expect(recalledAgain.value.records.map((entry) => entry.record.record_id)).not.toContain(doomed);
  });

  it("a named subset invalidates only the named surfaces; empty, duplicate and past-deadline requests refuse", async () => {
    const graph = new LiveProjectionSurface("graph");
    const vector = new LiveProjectionSurface("vector");
    const { memory } = createCascadeMemory([graph, vector]);
    const doomed = await seedAccepted(memory, "x2 subset probe term");
    for (const surface of [graph, vector] as const) surface.index(doomed);
    const tombstoned = await memory.transition(lifecycleCommand("tombstone", doomed));
    expect(tombstoned.ok).toBe(true);
    if (!tombstoned.ok) return;
    const readiness = await memory.readiness();
    expect(readiness.ok).toBe(true);
    if (!readiness.ok) return;
    const highWater = readiness.value.high_water_cursor;
    const subset = await memory.invalidateProjections({
      through_cursor: highWater,
      projection_ids: ["graph"],
      authorization: { credential: "credential:x2" },
      deadline_at: DEADLINE,
    });
    expect(subset.ok).toBe(true);
    if (!subset.ok) return;
    expect(subset.value.projection_receipts.map((entry) => entry.projection_id)).toEqual(["graph"]);
    expect(graph.has(doomed)).toBe(false);
    // The unnamed surface was never driven.
    expect(vector.calls).toBe(0);
    expect(vector.has(doomed)).toBe(true);
    const callsBefore = graph.calls;
    for (const [request, code] of [
      [{ projection_ids: [] as string[] }, "INVALID_SCHEMA"],
      [{ projection_ids: ["graph", "graph"] }, "INVALID_SCHEMA"],
      [{ deadline_at: "2026-08-16T12:34:00.000Z" }, "DEADLINE_EXCEEDED"],
    ] as const) {
      const refused = await memory.invalidateProjections({
        through_cursor: highWater,
        authorization: { credential: "credential:x2" },
        deadline_at: DEADLINE,
        ...request,
      });
      expect(refused.ok).toBe(false);
      if (refused.ok) continue;
      expect(refused.error).toMatchObject({ code, operation: "projection_invalidate" });
    }
    expect(graph.calls).toBe(callsBefore);
  });
});

/** A live derived projection applying removals BEFORE records (opposite order from LiveProjectionSurface). */
class RemovalsFirstProjectionSurface implements ProjectionInvalidationSurfaceV1 {
  readonly entries = new Map<string, Digest>();
  calls = 0;
  constructor(readonly projection_id: string) {}
  async invalidate(batch: ProjectionBatchV1) {
    this.calls += 1;
    for (const removal of batch.removals) this.entries.delete(removal.record_id);
    for (const record of batch.records) this.entries.set(record.record_id, record.record_digest);
    return {
      ok: true as const,
      value: { projection_id: this.projection_id, cursor: batch.through_cursor_inclusive, digest: DIGEST_X2 },
    };
  }
  has(recordId: string): boolean {
    return this.entries.has(recordId);
  }
  /** Models the projection having ingested an accepted record through its serving path. */
  index(recordId: string): void {
    this.entries.set(recordId, DIGEST_X2);
  }
}

/** Wraps a live surface and acks a stale cursor on one invalidate call (a simulated lagging surface). */
class LaggingSurface implements ProjectionInvalidationSurfaceV1 {
  calls = 0;
  constructor(
    readonly projection_id: string,
    private readonly inner: LiveProjectionSurface,
    public lagOnCall: number | null,
  ) {}
  async invalidate(batch: ProjectionBatchV1) {
    this.calls += 1;
    // A lagging round applies nothing and acks the previous cursor: the surface is genuinely behind.
    if (this.lagOnCall === this.calls) {
      return { ok: true as const, value: { projection_id: this.projection_id, cursor: batch.from_cursor_exclusive, digest: DIGEST_X2 } };
    }
    await this.inner.invalidate(batch);
    return { ok: true as const, value: { projection_id: this.projection_id, cursor: batch.through_cursor_inclusive, digest: DIGEST_X2 } };
  }
  has(recordId: string): boolean {
    return this.inner.has(recordId);
  }
  index(recordId: string): void {
    this.inner.index(recordId);
  }
}

describe("projection cascade ordering and incomplete rounds (X2 tour 2)", () => {
  it("dispute then resolve_dispute keeps the record on adds-first surfaces: journal order, no disappearance", async () => {
    const graph = new LiveProjectionSurface("graph");
    const vector = new LiveProjectionSurface("vector");
    const { memory } = createCascadeMemory([graph, vector]);
    const recordId = await seedAccepted(memory, "x2 order probe term");
    for (const surface of [graph, vector] as const) surface.index(recordId);
    const disputed = await memory.transition(lifecycleCommand("dispute", recordId));
    expect(disputed.ok).toBe(true);
    if (!disputed.ok) return;
    const resolved = await memory.transition(lifecycleCommand("resolve_dispute", recordId));
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const readiness = await memory.readiness();
    expect(readiness.ok).toBe(true);
    if (!readiness.ok) return;
    const invalidated = await memory.invalidateProjections({
      through_cursor: readiness.value.high_water_cursor,
      authorization: { credential: "credential:x2" },
      deadline_at: DEADLINE,
    });
    expect(invalidated.ok).toBe(true);
    if (!invalidated.ok) return;
    expect(invalidated.value.complete).toBe(true);
    // The journal ends with a re-add: the record stays on every surface, like the store's accepted_current.
    for (const surface of [graph, vector] as const) expect(surface.has(recordId)).toBe(true);
    const recalled = await memory.recall(recallRequest("x2"));
    expect(recalled.ok).toBe(true);
    if (!recalled.ok) return;
    expect(recalled.value.records.map((entry) => entry.record.record_id)).toContain(recordId);
  });

  it("resolve_dispute then tombstone drops the record on removals-first surfaces: journal order, no resurrection", async () => {
    const graph = new RemovalsFirstProjectionSurface("graph");
    const vector = new RemovalsFirstProjectionSurface("vector");
    const { memory } = createCascadeMemory([graph, vector]);
    const recordId = await seedAccepted(memory, "x2 tombstone probe term");
    for (const surface of [graph, vector] as const) surface.index(recordId);
    const disputed = await memory.transition(lifecycleCommand("dispute", recordId));
    expect(disputed.ok).toBe(true);
    if (!disputed.ok) return;
    const resolved = await memory.transition(lifecycleCommand("resolve_dispute", recordId));
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const tombstoned = await memory.transition(lifecycleCommand("tombstone", recordId));
    expect(tombstoned.ok).toBe(true);
    if (!tombstoned.ok) return;
    const invalidated = await memory.invalidateProjections({
      through_cursor: tombstoned.value.cursor,
      authorization: { credential: "credential:x2" },
      deadline_at: DEADLINE,
    });
    expect(invalidated.ok).toBe(true);
    if (!invalidated.ok) return;
    expect(invalidated.value.complete).toBe(true);
    // The journal ends with a terminal tombstone: the record is gone from every surface, permanently.
    for (const surface of [graph, vector] as const) expect(surface.has(recordId)).toBe(false);
    const recalled = await memory.recall(recallRequest("x2"));
    expect(recalled.ok).toBe(true);
    if (!recalled.ok) return;
    expect(recalled.value.records.map((entry) => entry.record.record_id)).not.toContain(recordId);
    // Re-read never resurrects the tombstoned record.
    const reread = await memory.invalidateProjections({
      through_cursor: tombstoned.value.cursor,
      authorization: { credential: "credential:x2" },
      deadline_at: DEADLINE,
    });
    expect(reread.ok).toBe(true);
    if (!reread.ok) return;
    expect(reread.value.complete).toBe(true);
    for (const surface of [graph, vector] as const) expect(surface.has(recordId)).toBe(false);
  });

  it("an incomplete intermediate round pins the receipt to the last complete cursor, on each lagging surface", async () => {
    for (const laggedId of ["graph", "vector"] as const) {
      const inners = { graph: new LiveProjectionSurface("graph"), vector: new LiveProjectionSurface("vector") };
      const lagging = new LaggingSurface(laggedId, inners[laggedId], 3);
      const healthy = laggedId === "graph" ? inners.vector : inners.graph;
      const { memory } = createCascadeMemory(
        laggedId === "graph" ? [lagging, inners.vector] : [inners.graph, lagging],
      );
      const keep = await seedAccepted(memory, "x2 lag keep term");
      const doomed = await seedAccepted(memory, "x2 lag doomed term");
      for (const surface of [inners.graph, inners.vector] as const) {
        surface.index(keep);
        surface.index(doomed);
      }
      const tombstoned = await memory.transition(lifecycleCommand("tombstone", doomed));
      expect(tombstoned.ok).toBe(true);
      if (!tombstoned.ok) return;
      // One more lot AFTER the tombstone round: its round must not mask the lagging round.
      await seedAccepted(memory, "x2 lag later term");
      const readiness = await memory.readiness();
      expect(readiness.ok).toBe(true);
      if (!readiness.ok) return;
      const highWater = readiness.value.high_water_cursor;
      const first = await memory.invalidateProjections({
        through_cursor: highWater,
        authorization: { credential: "credential:x2" },
        deadline_at: DEADLINE,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      // The lagging round stops the cascade: the receipt is explicitly incomplete and pinned
      // to the last complete cursor, and no round ran past the gap.
      expect(first.value.complete).toBe(false);
      expect(BigInt(first.value.through_cursor) < BigInt(highWater)).toBe(true);
      expect(lagging.calls).toBe(3);
      expect(healthy.calls).toBe(3);
      const laggedEntry = first.value.projection_receipts.find((entry) => entry.projection_id === laggedId);
      const healthyEntry = first.value.projection_receipts.find((entry) => entry.projection_id !== laggedId);
      expect(laggedEntry?.cursor).toBe(first.value.through_cursor);
      expect(healthyEntry?.cursor).not.toBe(first.value.through_cursor);
      // The tombstone applied only where its round completed.
      expect(lagging.has(doomed)).toBe(true);
      expect(healthy.has(doomed)).toBe(false);
      // Heal and replay: the receipt completes and the terminal tombstone never resurrects.
      lagging.lagOnCall = null;
      const second = await memory.invalidateProjections({
        through_cursor: highWater,
        authorization: { credential: "credential:x2" },
        deadline_at: DEADLINE,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value.complete).toBe(true);
      expect(second.value.through_cursor).toBe(highWater);
      for (const surface of [inners.graph, inners.vector] as const) {
        expect(surface.has(keep)).toBe(true);
        expect(surface.has(doomed)).toBe(false);
      }
    }
  });
});
