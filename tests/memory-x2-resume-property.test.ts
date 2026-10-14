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
import { FULL_ALLOWLIST, recallRequest, seedAccepted } from "./memory-l7-fixture.js";
import { lifecycleCommand } from "./memory-l3-fixture.js";

const NOW_X2 = "2026-08-16T12:34:56.789Z";
const DEADLINE = "2026-08-16T12:40:00.000Z";
const LATE = "2026-08-16T12:45:00.000Z";
const DIGEST_X2 = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Digest;

/** Applies records then removals (adds-first order). */
class AddsFirstSurface implements ProjectionInvalidationSurfaceV1 {
  readonly entries = new Map<string, Digest>();
  calls = 0;
  constructor(readonly projection_id: string) {}
  async invalidate(batch: ProjectionBatchV1) {
    this.calls += 1;
    for (const record of batch.records) this.entries.set(record.record_id, record.record_digest);
    for (const removal of batch.removals) this.entries.delete(removal.record_id);
    return { ok: true as const, value: { projection_id: this.projection_id, cursor: batch.through_cursor_inclusive, digest: DIGEST_X2 } };
  }
  has(recordId: string): boolean {
    return this.entries.has(recordId);
  }
  index(recordId: string): void {
    this.entries.set(recordId, DIGEST_X2);
  }
}

/** Applies removals then records (opposite order). */
class RemovalsFirstSurface implements ProjectionInvalidationSurfaceV1 {
  readonly entries = new Map<string, Digest>();
  calls = 0;
  constructor(readonly projection_id: string) {}
  async invalidate(batch: ProjectionBatchV1) {
    this.calls += 1;
    for (const removal of batch.removals) this.entries.delete(removal.record_id);
    for (const record of batch.records) this.entries.set(record.record_id, record.record_digest);
    return { ok: true as const, value: { projection_id: this.projection_id, cursor: batch.through_cursor_inclusive, digest: DIGEST_X2 } };
  }
  has(recordId: string): boolean {
    return this.entries.has(recordId);
  }
  index(recordId: string): void {
    this.entries.set(recordId, DIGEST_X2);
  }
}

type Surface = AddsFirstSurface | RemovalsFirstSurface;

function relatedCommand(operation: "supersede" | "rewind", record_id: string, related_record_id: string, event_id: string) {
  return { ...lifecycleCommand("dispute", record_id, event_id), operation, related_record_id } as unknown as Parameters<MemoryPortV2["transition"]>[0];
}

function harness(surfaces: ReadonlyArray<ProjectionInvalidationSurfaceV1>, clock: { now: () => string }) {
  const store = createInMemoryCanonicalMemoryStoreV1({ clock });
  const authorization = {
    version: 1 as const,
    async authorize(request: { operation: string; resource: { scope_ref?: string }; resource_digest: Digest }) {
      if (request.operation === "projection_invalidate" && clock.now() >= DEADLINE) {
        return { ok: false as const, error: { code: "UNAUTHORIZED" as const, operation: request.operation, message: "expired", retryable: false as const } };
      }
      const body = {
        allowed: true as const, decision_id: "decision:x2prop", policy_version: "1", operation: request.operation,
        resource_digest: request.resource_digest, scope_ref: request.resource.scope_ref ?? "mem:scope",
        not_before: NOW_X2, expires_at: DEADLINE, revocation_epoch: "0",
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
      const src = request.source_record as { scope_ref: string; purpose_ref: string; valid_time: { t: number }; components: unknown[]; primary_component_id: string; primary_event: unknown; citations: unknown[]; retention: unknown; record_digest: Digest };
      const payload = { schema_version: 2 as const, scope_ref: src.scope_ref, purpose_ref: src.purpose_ref, valid_time: src.valid_time, components: src.components, primary_component_id: src.primary_component_id, primary_event: src.primary_event, citations: src.citations, retention: src.retention, reconciliation: { family_refs: [] } };
      const body = { payload, source_record_digest: src.record_digest, output_payload_digest: knowledgePayloadDigest(payload as never), policy_version: "1" };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("redaction-result", body) } };
    },
  };
  const policy = {
    policy_id: "policy:x2prop", policy_version: "1",
    async decide(request: { record_digest: Digest }) {
      const body = { policy_id: "policy:x2prop", policy_version: "1", record_digest: request.record_digest, decision: "accept" as const, issued_at: NOW_X2 };
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
    canonical_store: store, authorization, admission_policy: policy, crypto, activity_sources: [],
    allow_unfenced_memory_store: true, projection_surfaces: surfaces, clock,
  } as unknown as MemoryEngineDependenciesV2);
  return { memory, store };
}

async function highWater(memory: MemoryPortV2): Promise<string> {
  const readiness = await memory.readiness();
  expect(readiness.ok).toBe(true);
  if (!readiness.ok) throw new Error("readiness failed");
  return readiness.value.high_water_cursor;
}

async function recallIds(memory: MemoryPortV2): Promise<string[]> {
  const recalled = await memory.recall(recallRequest("x2prop"));
  expect(recalled.ok).toBe(true);
  if (!recalled.ok) throw new Error("recall failed");
  return recalled.value.records.map((entry) => entry.record.record_id).sort();
}

function expectReceiptCoherent(receipt: { through_cursor: string; projection_receipts: ReadonlyArray<{ projection_id: string; cursor: string; digest: Digest }>; complete: boolean; receipt_digest: Digest }) {
  const body = { through_cursor: receipt.through_cursor, projection_receipts: receipt.projection_receipts, complete: receipt.complete };
  expect(receipt.receipt_digest).toBe(receiptDigest("projection-invalidation", body));
}

describe("X2 resume property: recover(J,H,resume,faults) = Ref(H)", () => {
  it.each([
    ["dispute-resolve", "adds-first"],
    ["dispute-resolve", "removals-first"],
    ["supersede-rewind", "adds-first"],
    ["supersede-rewind", "removals-first"],
  ])("tombstoned record never resurfaces at any resume point: %s / %s", async (history, order) => {
    let nowValue = NOW_X2;
    const clock = { now: () => nowValue };
    const mk = (id: string): Surface => (order === "adds-first" ? new AddsFirstSurface(id) : new RemovalsFirstSurface(id));
    const graph = mk("graph");
    const vector = mk("vector");
    const { memory, store } = harness([graph, vector], clock);
    const keep = await seedAccepted(memory, "x2prop keep term");
    const doomed = await seedAccepted(memory, "x2prop doomed term");
    let successor: string | undefined;
    if (history === "dispute-resolve") {
      expect((await memory.transition(lifecycleCommand("dispute", doomed, "event:x2prop-dispute"))).ok).toBe(true);
      expect((await memory.transition(lifecycleCommand("resolve_dispute", doomed, "event:x2prop-resolve"))).ok).toBe(true);
    } else {
      successor = await seedAccepted(memory, "x2prop successor term");
      expect((await memory.transition(relatedCommand("supersede", doomed, successor, "event:x2prop-supersede"))).ok).toBe(true);
      expect((await memory.transition(relatedCommand("rewind", doomed, successor, "event:x2prop-rewind"))).ok).toBe(true);
    }
    expect((await memory.transition(lifecycleCommand("tombstone", doomed, "event:x2prop-tomb"))).ok).toBe(true);
    for (const surface of [graph, vector] as const) {
      surface.index(keep);
      surface.index(doomed);
      if (successor !== undefined) surface.index(successor);
    }
    const head = await highWater(memory);
    // Converge once through the head.
    const converged = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(converged.ok).toBe(true);
    if (!converged.ok) return;
    expect(converged.value.complete).toBe(true);
    expectReceiptCoherent(converged.value);
    const oracle = await recallIds(memory);
    expect(oracle).toContain(keep);
    expect(oracle).not.toContain(doomed);
    for (const surface of [graph, vector] as const) {
      expect([...surface.entries.keys()].sort()).toEqual(oracle);
    }
    // Store-level: no window may carry a currently-tombstoned record in `records`, at any page partition.
    for (const limit of [1, 2000]) {
      let after = "0";
      for (;;) {
        const batch = await store.nextProjectionBatch({ after, limit });
        if (!batch.ok) break;
        expect(batch.value.records.map((entry) => entry.record_id)).not.toContain(doomed);
        if (BigInt(batch.value.through_cursor_inclusive) >= BigInt(head)) break;
        after = batch.value.through_cursor_inclusive;
      }
    }
    // Every resume point T in [1, H], from already-converged surfaces restarted at "0".
    for (let cursor = 1n; cursor <= BigInt(head); cursor += 1n) {
      const resumed = await memory.invalidateProjections({ through_cursor: cursor.toString(), authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
      expect(resumed.ok).toBe(true);
      if (!resumed.ok) return;
      expectReceiptCoherent(resumed.value);
      expect(BigInt(resumed.value.through_cursor) >= cursor).toBe(true);
      for (const surface of [graph, vector] as const) {
        expect(surface.has(doomed)).toBe(false);
        // X2 tour 4 (MINEUR-1): exact oracle equality at every resume point, not inclusion —
        // an older through_cursor must never leave a surface behind or ahead of the reference.
        expect([...surface.entries.keys()].sort()).toEqual(oracle);
      }
    }
    expect(nowValue).toBe(NOW_X2);
  });

  it("surface NOT_FOUND becomes PROJECTION_STALE, never success; recovery converges", async () => {
    let nowValue = NOW_X2;
    const clock = { now: () => nowValue };
    const graph = new AddsFirstSurface("graph");
    const inner = new AddsFirstSurface("vector");
    let armed = true;
    const flaky: ProjectionInvalidationSurfaceV1 = {
      projection_id: "vector",
      async invalidate(batch: ProjectionBatchV1) {
        if (armed && batch.removals.some((entry) => entry.record_id === doomedId)) {
          return { ok: false as const, error: { code: "NOT_FOUND" as const, operation: "projection_invalidate" as const, message: "vector lost its generation", retryable: false as const } };
        }
        return inner.invalidate(batch);
      },
    };
    const { memory } = harness([graph, flaky], clock);
    const keep = await seedAccepted(memory, "x2prop nf keep term");
    const doomed = await seedAccepted(memory, "x2prop nf doomed term");
    const doomedId = doomed;
    graph.index(keep);
    graph.index(doomed);
    inner.index(keep);
    inner.index(doomed);
    expect((await memory.transition(lifecycleCommand("dispute", doomed, "event:x2prop-nf-dispute"))).ok).toBe(true);
    expect((await memory.transition(lifecycleCommand("resolve_dispute", doomed, "event:x2prop-nf-resolve"))).ok).toBe(true);
    expect((await memory.transition(lifecycleCommand("tombstone", doomed, "event:x2prop-nf-tomb"))).ok).toBe(true);
    const head = await highWater(memory);
    const failed = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error).toMatchObject({ code: "PROJECTION_STALE", operation: "projection_invalidate" });
    // The healthy surface kept its committed progress; the failed one never certified the tombstone round.
    expect(graph.has(doomed)).toBe(false);
    // Faults cease: recovery converges to the reference.
    armed = false;
    const recovered = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.value.complete).toBe(true);
    expectReceiptCoherent(recovered.value);
    expect(graph.has(doomed)).toBe(false);
    expect(inner.has(doomed)).toBe(false);
    expect([...inner.entries.keys()].sort()).toEqual(await recallIds(memory));
    expect(nowValue).toBe(NOW_X2);
  });

  it("surface exception becomes a typed failure", async () => {
    let nowValue = NOW_X2;
    const clock = { now: () => nowValue };
    const graph = new AddsFirstSurface("graph");
    const inner = new AddsFirstSurface("vector");
    let armed = true;
    const throwing: ProjectionInvalidationSurfaceV1 = {
      projection_id: "vector",
      async invalidate(batch: ProjectionBatchV1) {
        if (armed && batch.removals.length > 0) throw new Error("vector transport blew up");
        return inner.invalidate(batch);
      },
    };
    const { memory } = harness([graph, throwing], clock);
    const doomed = await seedAccepted(memory, "x2prop ex doomed term");
    graph.index(doomed);
    inner.index(doomed);
    expect((await memory.transition(lifecycleCommand("tombstone", doomed, "event:x2prop-ex-tomb"))).ok).toBe(true);
    const head = await highWater(memory);
    const failed = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error).toMatchObject({ operation: "projection_invalidate" });
    expect(failed.error.code).toBe("PROJECTION_STALE");
    armed = false;
    const recovered = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.value.complete).toBe(true);
    expect(graph.has(doomed)).toBe(false);
    expect(inner.has(doomed)).toBe(false);
    expect(nowValue).toBe(NOW_X2);
  });

  it("deadline after the re-add round refuses, resurrects nothing, then recovers", async () => {
    let nowValue = NOW_X2;
    const clock = { now: () => nowValue };
    const graph = new RemovalsFirstSurface("graph");
    const vector = new RemovalsFirstSurface("vector");
    const { memory } = harness([graph, vector], clock);
    const doomed = await seedAccepted(memory, "x2prop dl doomed term");
    graph.index(doomed);
    vector.index(doomed);
    expect((await memory.transition(lifecycleCommand("dispute", doomed, "event:x2prop-dl-dispute"))).ok).toBe(true);
    const resolved = await memory.transition(lifecycleCommand("resolve_dispute", doomed, "event:x2prop-dl-resolve"));
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const resolveCursor = resolved.value.cursor;
    expect((await memory.transition(lifecycleCommand("tombstone", doomed, "event:x2prop-dl-tomb"))).ok).toBe(true);
    const head = await highWater(memory);
    expect(BigInt(head) > BigInt(resolveCursor)).toBe(true);
    // Expire the clock right after the resolve-cursor round is applied (fix-independent trip point).
    let tripped = false;
    const tripAfter = (raw: (batch: ProjectionBatchV1) => Promise<{ ok: true; value: { projection_id: string; cursor: string; digest: Digest } }>) =>
      async (batch: ProjectionBatchV1) => {
        const out = await raw(batch);
        if (!tripped && batch.through_cursor_inclusive === resolveCursor) {
          tripped = true;
          nowValue = LATE;
        }
        return out;
      };
    graph.invalidate = tripAfter(graph.invalidate.bind(graph));
    vector.invalidate = tripAfter(vector.invalidate.bind(vector));
    const cut = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(tripped).toBe(true);
    expect(cut.ok).toBe(false);
    if (cut.ok) return;
    expect(cut.error).toMatchObject({ code: "DEADLINE_EXCEEDED", operation: "projection_invalidate" });
    // The interrupted re-add round left no visible tombstoned record on any surface.
    for (const surface of [graph, vector] as const) expect(surface.has(doomed)).toBe(false);
    nowValue = NOW_X2;
    const recovered = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.value.complete).toBe(true);
    expect(recovered.value.through_cursor).toBe(head);
    expectReceiptCoherent(recovered.value);
    for (const surface of [graph, vector] as const) expect(surface.has(doomed)).toBe(false);
  });

  it("interrupted accepted record never loses canonical acceptance; concurrent advance still converges", async () => {
    let nowValue = NOW_X2;
    const clock = { now: () => nowValue };
    const graph = new AddsFirstSurface("graph");
    const vector = new AddsFirstSurface("vector");
    const { memory } = harness([graph, vector], clock);
    const keep = await seedAccepted(memory, "x2prop p9 keep term");
    const live = await seedAccepted(memory, "x2prop p9 live term");
    graph.index(keep);
    graph.index(live);
    vector.index(keep);
    vector.index(live);
    expect((await memory.transition(lifecycleCommand("dispute", live, "event:x2prop-p9-dispute"))).ok).toBe(true);
    expect((await memory.transition(lifecycleCommand("resolve_dispute", live, "event:x2prop-p9-resolve"))).ok).toBe(true);
    const head = await highWater(memory);
    // Expire the clock right after the dispute-removal round is applied.
    let tripped = false;
    const rawGraph = graph.invalidate.bind(graph);
    const rawVector = vector.invalidate.bind(vector);
    graph.invalidate = async (batch: ProjectionBatchV1) => {
      const out = await rawGraph(batch);
      if (!tripped && batch.removals.some((entry) => entry.record_id === live)) {
        tripped = true;
        nowValue = LATE;
      }
      return out;
    };
    vector.invalidate = async (batch: ProjectionBatchV1) => {
      const out = await rawVector(batch);
      if (!tripped && batch.removals.some((entry) => entry.record_id === live)) {
        tripped = true;
        nowValue = LATE;
      }
      return out;
    };
    const interrupted = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(interrupted.ok).toBe(false);
    if (interrupted.ok) return;
    expect(interrupted.error).toMatchObject({ code: "DEADLINE_EXCEEDED", operation: "projection_invalidate" });
    // Canonical acceptance is untouched: recall still serves the live record once the clock is restored.
    nowValue = NOW_X2;
    expect(await recallIds(memory)).toContain(live);
    // Concurrent canonical advance while projections lag, then full recovery converges to the new head.
    const newcomer = await seedAccepted(memory, "x2prop p9 newcomer term");
    graph.index(newcomer);
    vector.index(newcomer);
    const head2 = await highWater(memory);
    expect(BigInt(head2) > BigInt(head)).toBe(true);
    const recovered = await memory.invalidateProjections({ through_cursor: head2, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.value.complete).toBe(true);
    expect(recovered.value.through_cursor).toBe(head2);
    expectReceiptCoherent(recovered.value);
    for (const surface of [graph, vector] as const) {
      expect([...surface.entries.keys()].sort()).toEqual(await recallIds(memory));
      expect(surface.has(live)).toBe(true);
      expect(surface.has(newcomer)).toBe(true);
    }
  });

  it("an older through_cursor never rolls a converged surface back (P10: restored record stays)", async () => {
    let nowValue = NOW_X2;
    const clock = { now: () => nowValue };
    const graph = new AddsFirstSurface("graph");
    const vector = new RemovalsFirstSurface("vector");
    const { memory } = harness([graph, vector], clock);
    const keep = await seedAccepted(memory, "x2prop p10 keep term");
    const doomed = await seedAccepted(memory, "x2prop p10 doomed term");
    for (const surface of [graph, vector] as const) {
      surface.index(keep);
      surface.index(doomed);
    }
    const disputed = await memory.transition(lifecycleCommand("dispute", doomed, "event:x2prop-p10-dispute"));
    expect(disputed.ok).toBe(true);
    if (!disputed.ok) return;
    const disputeCursor = disputed.value.cursor;
    expect((await memory.transition(lifecycleCommand("resolve_dispute", doomed, "event:x2prop-p10-resolve"))).ok).toBe(true);
    const head = await highWater(memory);
    const converged = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(converged.ok).toBe(true);
    if (!converged.ok) return;
    const oracle = await recallIds(memory);
    expect(oracle).toContain(doomed);
    // Replaying to the older dispute cursor must not roll either surface back past the restore.
    const replayed = await memory.invalidateProjections({ through_cursor: disputeCursor, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expectReceiptCoherent(replayed.value);
    for (const surface of [graph, vector] as const) {
      expect(surface.has(doomed)).toBe(true);
      expect([...surface.entries.keys()].sort()).toEqual(oracle);
    }
    expect(nowValue).toBe(NOW_X2);
  });

  it("an older through_cursor never rolls a converged surface back (P11: trust_invalid stays gone)", async () => {
    let nowValue = NOW_X2;
    const clock = { now: () => nowValue };
    const graph = new AddsFirstSurface("graph");
    const vector = new RemovalsFirstSurface("vector");
    const { memory } = harness([graph, vector], clock);
    const keep = await seedAccepted(memory, "x2prop p11 keep term");
    const doomed = await seedAccepted(memory, "x2prop p11 doomed term");
    for (const surface of [graph, vector] as const) {
      surface.index(keep);
      surface.index(doomed);
    }
    expect((await memory.transition(lifecycleCommand("dispute", doomed, "event:x2prop-p11-dispute"))).ok).toBe(true);
    const resolved = await memory.transition(lifecycleCommand("resolve_dispute", doomed, "event:x2prop-p11-resolve"));
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const resolveCursor = resolved.value.cursor;
    expect((await memory.transition(lifecycleCommand("trust_invalidate", doomed, "event:x2prop-p11-trust"))).ok).toBe(true);
    const head = await highWater(memory);
    const converged = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(converged.ok).toBe(true);
    if (!converged.ok) return;
    const oracle = await recallIds(memory);
    expect(oracle).not.toContain(doomed);
    // Replaying to the older resolve cursor must not make the trust_invalid record visible again.
    const replayed = await memory.invalidateProjections({ through_cursor: resolveCursor, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expectReceiptCoherent(replayed.value);
    for (const surface of [graph, vector] as const) {
      expect(surface.has(doomed)).toBe(false);
      expect([...surface.entries.keys()].sort()).toEqual(oracle);
    }
    expect(nowValue).toBe(NOW_X2);
  });

  it("overlapping invalidations serialize: a stale held batch never resurfaces a tombstoned record (P12)", async () => {
    let nowValue = NOW_X2;
    const clock = { now: () => nowValue };
    const graph = new AddsFirstSurface("graph");
    const innerVector = new AddsFirstSurface("vector");
    let resolveCursor = "";
    // The vector holds call A's resolve batch on a deferred gate, so a tombstone commit plus a second
    // overlapping call can interleave before the held batch applies.
    let releaseHeld: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { releaseHeld = resolve; });
    let heldSeen = false;
    let active = 0;
    let maxActive = 0;
    const vector: ProjectionInvalidationSurfaceV1 = {
      projection_id: "vector",
      async invalidate(batch: ProjectionBatchV1) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        try {
          if (!heldSeen && batch.through_cursor_inclusive === resolveCursor) {
            heldSeen = true;
            await held;
          }
          return innerVector.invalidate(batch);
        } finally {
          active -= 1;
        }
      },
    };
    const { memory } = harness([graph, vector], clock);
    const keep = await seedAccepted(memory, "x2prop p12 keep term");
    const doomed = await seedAccepted(memory, "x2prop p12 doomed term");
    for (const surface of [graph, innerVector] as const) {
      surface.index(keep);
      surface.index(doomed);
    }
    expect((await memory.transition(lifecycleCommand("dispute", doomed, "event:x2prop-p12-dispute"))).ok).toBe(true);
    const resolved = await memory.transition(lifecycleCommand("resolve_dispute", doomed, "event:x2prop-p12-resolve"));
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    resolveCursor = resolved.value.cursor;
    // Call A starts first and blocks inside the vector on the resolve batch.
    const requestedA = memory.invalidateProjections({ through_cursor: resolveCursor, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    for (let i = 0; i < 5_000 && !heldSeen; i += 1) await new Promise((resolve) => setTimeout(resolve, 1));
    expect(heldSeen).toBe(true);
    // The tombstone commits while A is held; call B starts while A is still in flight (overlap).
    expect((await memory.transition(lifecycleCommand("tombstone", doomed, "event:x2prop-p12-tomb"))).ok).toBe(true);
    const head = await highWater(memory);
    const requestedB = memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    // Overlap window: an unserialized B drives the held vector here; a serialized B stays queued.
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseHeld?.();
    const [callA, callB] = await Promise.all([requestedA, requestedB]);
    expect(callA.ok).toBe(true);
    expect(callB.ok).toBe(true);
    if (!callA.ok || !callB.ok) return;
    expect(callA.value.complete).toBe(true);
    expect(callB.value.complete).toBe(true);
    expectReceiptCoherent(callA.value);
    expectReceiptCoherent(callB.value);
    // Overlap property: at most one invalidation is ever in flight per port — the calls serialized.
    expect(maxActive).toBeLessThanOrEqual(1);
    // The tombstoned record is gone from both surfaces and from recall, on both apply orders.
    for (const surface of [graph, innerVector] as const) expect(surface.has(doomed)).toBe(false);
    const oracle = await recallIds(memory);
    expect(oracle).toContain(keep);
    expect(oracle).not.toContain(doomed);
    for (const surface of [graph, innerVector] as const) expect([...surface.entries.keys()].sort()).toEqual(oracle);
    expect(nowValue).toBe(NOW_X2);
  });

  it("deadline tripped after the final round applies refuses without certifying (P14)", async () => {
    let nowValue = NOW_X2;
    const clock = { now: () => nowValue };
    const graph = new AddsFirstSurface("graph");
    const inner = new AddsFirstSurface("vector");
    let headCursor = "";
    let tripped = false;
    const vector: ProjectionInvalidationSurfaceV1 = {
      projection_id: "vector",
      async invalidate(batch: ProjectionBatchV1) {
        const out = await inner.invalidate(batch);
        if (!tripped && batch.through_cursor_inclusive === headCursor) {
          tripped = true;
          nowValue = LATE;
        }
        return out;
      },
    };
    const { memory } = harness([graph, vector], clock);
    const keep = await seedAccepted(memory, "x2prop p14 keep term");
    const doomed = await seedAccepted(memory, "x2prop p14 doomed term");
    for (const surface of [graph, inner] as const) {
      surface.index(keep);
      surface.index(doomed);
    }
    expect((await memory.transition(lifecycleCommand("tombstone", doomed, "event:x2prop-p14-tomb"))).ok).toBe(true);
    const head = await highWater(memory);
    headCursor = head;
    // The clock trips past the deadline right after the final round applied: no success receipt may
    // certify it — the caller retries and converges.
    const cut = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(cut.ok).toBe(false);
    if (cut.ok) return;
    expect(cut.error).toMatchObject({ code: "DEADLINE_EXCEEDED", operation: "projection_invalidate" });
    nowValue = NOW_X2;
    const recovered = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.value.complete).toBe(true);
    expect(recovered.value.through_cursor).toBe(head);
    const oracle = await recallIds(memory);
    for (const surface of [graph, inner] as const) expect([...surface.entries.keys()].sort()).toEqual(oracle);
  });

  it("interrupted replay never hides an accepted record from surfaces (P9)", async () => {
    let nowValue = NOW_X2;
    const clock = { now: () => nowValue };
    const graph = new AddsFirstSurface("graph");
    const inner = new AddsFirstSurface("vector");
    let liveId = "";
    let tripped = false;
    const tripAfterDispute = (raw: (batch: ProjectionBatchV1) => Promise<{ ok: true; value: { projection_id: string; cursor: string; digest: Digest } }>) =>
      async (batch: ProjectionBatchV1) => {
        const out = await raw(batch);
        if (!tripped && batch.removals.some((entry) => entry.record_id === liveId)) {
          tripped = true;
          nowValue = LATE;
        }
        return out;
      };
    graph.invalidate = tripAfterDispute(graph.invalidate.bind(graph));
    const vector: ProjectionInvalidationSurfaceV1 = {
      projection_id: "vector",
      async invalidate(batch: ProjectionBatchV1) {
        return tripAfterDispute(inner.invalidate.bind(inner))(batch);
      },
    };
    const { memory } = harness([graph, vector], clock);
    const keep = await seedAccepted(memory, "x2prop p9b keep term");
    const live = await seedAccepted(memory, "x2prop p9b live term");
    liveId = live;
    for (const surface of [graph, inner] as const) {
      surface.index(keep);
      surface.index(live);
    }
    expect((await memory.transition(lifecycleCommand("dispute", live, "event:x2prop-p9b-dispute"))).ok).toBe(true);
    expect((await memory.transition(lifecycleCommand("resolve_dispute", live, "event:x2prop-p9b-resolve"))).ok).toBe(true);
    const head = await highWater(memory);
    const interrupted = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(tripped).toBe(true);
    expect(interrupted.ok).toBe(false);
    if (interrupted.ok) return;
    expect(interrupted.error).toMatchObject({ code: "DEADLINE_EXCEEDED", operation: "projection_invalidate" });
    // Invisible replay: the interruption certifies nothing, and no accepted record disappeared —
    // both surfaces still serve the live record with no recovery call yet.
    for (const surface of [graph, inner] as const) {
      expect(surface.has(live)).toBe(true);
      expect(surface.has(keep)).toBe(true);
    }
    nowValue = NOW_X2;
    expect(await recallIds(memory)).toContain(live);
    const recovered = await memory.invalidateProjections({ through_cursor: head, authorization: { credential: "credential:x2prop" }, deadline_at: DEADLINE });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.value.complete).toBe(true);
    expect(recovered.value.through_cursor).toBe(head);
    expectReceiptCoherent(recovered.value);
    const oracle = await recallIds(memory);
    for (const surface of [graph, inner] as const) expect([...surface.entries.keys()].sort()).toEqual(oracle);
  });

  it("direct cascade partitions agree: limit 1 and full window settle the same reference", async () => {
    let nowValue = NOW_X2;
    const clock = { now: () => nowValue };
    const { memory, store } = harness([], clock);
    const keep = await seedAccepted(memory, "x2prop part keep term");
    const doomed = await seedAccepted(memory, "x2prop part doomed term");
    expect((await memory.transition(lifecycleCommand("dispute", doomed, "event:x2prop-part-dispute"))).ok).toBe(true);
    expect((await memory.transition(lifecycleCommand("resolve_dispute", doomed, "event:x2prop-part-resolve"))).ok).toBe(true);
    expect((await memory.transition(lifecycleCommand("tombstone", doomed, "event:x2prop-part-tomb"))).ok).toBe(true);
    const head = await highWater(memory);
    const settle = async (limit: number): Promise<string[]> => {
      const surface = new AddsFirstSurface(`probe-${limit}`);
      surface.index(keep);
      surface.index(doomed);
      let after = "0";
      for (;;) {
        const out = await runProjectionInvalidationCascadeV1({ store, surfaces: [surface], after_cursor: after, limit, deadline_at: DEADLINE });
        if (!out.ok) break;
        if (BigInt(out.value.receipt.through_cursor) >= BigInt(head)) break;
        if (BigInt(out.value.receipt.through_cursor) <= BigInt(after)) break;
        after = out.value.receipt.through_cursor;
      }
      return [...surface.entries.keys()].sort();
    };
    expect(await settle(1)).toEqual([keep]);
    expect(await settle(2000)).toEqual([keep]);
    expect(await settle(1)).toEqual(await settle(2000));
    expect(head).toMatch(/^[0-9]+$/);
    expect(nowValue).toBe(NOW_X2);
  });
});
