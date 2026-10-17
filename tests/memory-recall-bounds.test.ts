import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryCanonicalMemoryStoreV1,
  receiptDigest,
  type CaptureRequestV2,
  type MemoryPortV2,
  type Result,
  type SemanticProjectionPort,
  type VectorProjectionPort,
} from "../engram-memory/index.js";
import { captureRequest } from "./memory-l3-fixture.js";
import { buildMemory, DEADLINE, DIGEST, NOW, recallRequest, seedAccepted } from "./memory-l7-fixture.js";

function expectInvalid(result: Result<unknown>, operation: "capture" | "recall_current") {
  expect(result).toMatchObject({
    ok: false,
    error: { code: "INVALID_SCHEMA", operation, retryable: false },
  });
}

/** Real canonical store, with spies at the two ranking input boundaries. */
function recallFixture(profile: "offline_lexical_v1" | "semantic_v1") {
  const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
  const snapshot = vi.spyOn(store, "acceptedSnapshot");
  const revalidate = vi.spyOn(store, "revalidate");
  const vectorQuery = vi.fn<VectorProjectionPort["query"]>(async (input) => {
    const body = {
      matches: input.eligible_record_ids.map((record_id) => ({ record_id, score: 1 })),
      model_ref: "vector:model:bounds",
      projection_cursor: "0",
    };
    return { ok: true, value: { ...body, receipt_digest: receiptDigest("vector-query", body) } };
  });
  const semantic: SemanticProjectionPort = {
    version: 1,
    async inducedAdjacency(input) {
      const body = {
        record_ids: [...input.eligible_record_ids],
        offsets: Array(input.eligible_record_ids.length + 1).fill(0) as number[],
        neighbours: [], weights: [], projection_cursor: input.system_as_of,
      };
      return { ok: true, value: { ...body, adjacency_digest: receiptDigest("semantic-adjacency", body) } };
    },
  };
  const vector: VectorProjectionPort = {
    version: 1, query: vectorQuery,
    async apply() { throw new Error("unused"); },
  };
  const { memory } = buildMemory({ store, ...(profile === "semantic_v1" ? { semantic, vector } : {}) });
  return { memory, store, snapshot, revalidate, vectorQuery };
}

describe.each(["offline_lexical_v1", "semantic_v1"] as const)("%s bounded lexical inputs (EVOL §4/§7/§10)", (profile) => {
  it("accepts exactly 8192 UTF-8 query bytes and refuses 8193 before reading candidates", async () => {
    const { memory, snapshot, vectorQuery } = recallFixture(profile);
    const id = await seedAccepted(memory, "needle bounded query");
    const query = "needle  " + "🧠".repeat(2046);
    expect(Buffer.byteLength(query, "utf8")).toBe(8192);
    expect(query.length).toBeLessThan(8192);

    const accepted = await memory.recall(recallRequest(query));
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error(accepted.error.code);
    expect(accepted.value.rank_receipt.profile).toBe(profile);
    expect(accepted.value.records.map((entry) => entry.record.record_id)).toEqual([id]);
    expect(snapshot).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ max_candidates: 2000 }));
    if (profile === "semantic_v1") {
      expect(vectorQuery).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ query_text: query, limit: 2000 }));
    } else expect(vectorQuery).not.toHaveBeenCalled();

    snapshot.mockClear();
    vectorQuery.mockClear();
    expect(Buffer.byteLength(query + "a", "utf8")).toBe(8193);
    expectInvalid(await memory.recall(recallRequest(query + "a")), "recall_current");
    expect(snapshot).not.toHaveBeenCalled();
    expect(vectorQuery).not.toHaveBeenCalled();
  });

  it("accepts a one-byte query and refuses an empty query", async () => {
    const { memory, snapshot } = recallFixture(profile);
    expect((await memory.recall(recallRequest("x"))).ok).toBe(true);
    snapshot.mockClear();
    expectInvalid(await memory.recall(recallRequest("")), "recall_current");
    expect(snapshot).not.toHaveBeenCalled();
  });

  it("forwards candidate budgets through 2000 and bounds the snapshot and revalidation", async () => {
    const { memory, snapshot, revalidate, vectorQuery } = recallFixture(profile);
    const ids = await Promise.all([
      seedAccepted(memory, "needle first"),
      seedAccepted(memory, "needle second"),
      seedAccepted(memory, "needle third"),
    ]);
    for (const cap of [1, 2, 2000]) {
      const request = recallRequest("needle");
      request.budgets.max_candidates = cap;
      const result = await memory.recall(request);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.code);
      expect(snapshot).toHaveBeenLastCalledWith(expect.objectContaining({ max_candidates: cap }));
      const snap = await snapshot.mock.results.at(-1)!.value;
      expect(snap.ok).toBe(true);
      if (!snap.ok) throw new Error(snap.error.code);
      const eligible = [...ids].sort().slice(0, cap);
      expect(snap.value.documents.map((doc) => doc.record_id)).toEqual(eligible);
      expect(result.value.rank_receipt.candidate_count).toBe(eligible.length);
      expect(result.value.records.map((entry) => entry.record.record_id).sort()).toEqual(eligible);
      expect(revalidate).toHaveBeenLastCalledWith(expect.objectContaining({ record_ids: expect.arrayContaining(eligible) }));
      expect(revalidate.mock.calls.at(-1)![0].record_ids).toHaveLength(eligible.length);
      if (profile === "semantic_v1") {
        expect(vectorQuery).toHaveBeenLastCalledWith(expect.objectContaining({ eligible_record_ids: eligible, limit: 2000 }));
      } else expect(vectorQuery).not.toHaveBeenCalled();
    }
  });

  it.each([0, 2001])("refuses candidate budget %i before any lexical or vector read", async (cap) => {
    const { memory, snapshot, revalidate, vectorQuery } = recallFixture(profile);
    const request = recallRequest("needle");
    request.budgets.max_candidates = cap;
    expectInvalid(await memory.recall(request), "recall_current");
    expect(snapshot).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
    expect(vectorQuery).not.toHaveBeenCalled();
  });
});

async function captureAndAdmit(memory: MemoryPortV2, request: CaptureRequestV2) {
  const captured = await memory.capture(request);
  expect(captured.ok).toBe(true);
  if (!captured.ok) throw new Error(captured.error.code);
  const admitted = await memory.requestAdmission({
    candidate_id: captured.value.candidate_id!, authorization: request.authorization, deadline_at: DEADLINE,
  });
  if (!admitted.ok) throw new Error(`admission: ${admitted.error.code}: ${admitted.error.message}`);
  expect(admitted.value.status).toBe("accepted");
  if (!admitted.value.record_id) throw new Error("admission must accept");
  return admitted.value.record_id;
}

describe("indexed document source bounds (EVOL §4)", () => {
  it.each(["context", "decision", "evidence"] as const)("indexes a %s component at 65536 UTF-8 bytes and refuses 65537", async (kind) => {
    const { memory, store } = buildMemory({ scope: "scope:l3" });
    const text = "needle " + "é".repeat(32764) + "x";
    expect(Buffer.byteLength(text, "utf8")).toBe(65_536);
    expect(text.length).toBeLessThan(65_536);
    const base = captureRequest(`bounds-${kind}-${"0".repeat(16)}`, "0", text);
    const request = { ...base, payload: { ...base.payload, components: [{ ...base.payload.components[0]!, kind }] } };
    const id = await captureAndAdmit(memory, request);
    const recalled = await memory.recall(recallRequest("needle"));
    expect(recalled.ok).toBe(true);
    if (!recalled.ok) throw new Error(recalled.error.code);
    expect(recalled.value.records.map((entry) => entry.record.record_id)).toEqual([id]);
    const snapshot = await store.acceptedSnapshot({
      valid_as_of: Date.parse(NOW), system_as_of: recalled.value.rank_receipt.system_as_of,
      authorization_receipt_digest: DIGEST, max_candidates: 2000,
    });
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) throw new Error(snapshot.error.code);
    expect(snapshot.value.documents).toHaveLength(1);
    expect(snapshot.value.documents[0]!.fields.primary).toBe(text);
    expect(snapshot.value.documents[0]!.fields[kind]).toBe(text);

    const commit = vi.spyOn(store, "commitPending");
    request.payload.components[0]!.text += "a";
    expect(Buffer.byteLength(request.payload.components[0]!.text, "utf8")).toBe(65_537);
    expectInvalid(await memory.capture(request), "capture");
    expect(commit).not.toHaveBeenCalled();
  });

  it("bounds an indexed document to 64 components, with a typed refusal at 65", async () => {
    const { memory, store } = buildMemory({ scope: "scope:l3" });
    const request = captureRequest(`bounds-components-${"0".repeat(16)}`, "0");
    const component = request.payload.components[0]!;
    request.payload.components = Array.from({ length: 64 }, (_, index) => ({
      ...component, component_id: index === 0 ? component.component_id : `component:${index}`, text: `needle ${index}`,
    }));
    const id = await captureAndAdmit(memory, request);
    const recalled = await memory.recall(recallRequest("needle"));
    expect(recalled.ok).toBe(true);
    if (!recalled.ok) throw new Error(recalled.error.code);
    expect(recalled.value.records[0]!.record.record_id).toBe(id);
    expect(recalled.value.records[0]!.record.components).toHaveLength(64);
    const snapshot = await store.acceptedSnapshot({
      valid_as_of: Date.parse(NOW), system_as_of: recalled.value.rank_receipt.system_as_of,
      authorization_receipt_digest: DIGEST, max_candidates: 2000,
    });
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) throw new Error(snapshot.error.code);
    expect(snapshot.value.documents[0]!.fields.context).toBe(request.payload.components.map((entry) => entry.text).join("\n"));

    const commit = vi.spyOn(store, "commitPending");
    request.payload.components.push({ ...component, component_id: "component:65" });
    expect(request.payload.components).toHaveLength(65);
    expectInvalid(await memory.capture(request), "capture");
    expect(commit).not.toHaveBeenCalled();
  });
});
