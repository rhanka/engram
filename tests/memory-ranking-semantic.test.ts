import { describe, expect, it } from "vitest";

import {
  receiptDigest,
  type Cursor,
  type SemanticAdjacencyV1,
  type SemanticProjectionPort,
  type VectorProjectionPort,
} from "../graphify-memory/index.js";
import { buildMemory, recallRequest, seedAccepted } from "./memory-l7-fixture.js";

function vectorPort(): VectorProjectionPort {
  return {
    version: 1,
    async query(input) {
      const body = {
        matches: input.eligible_record_ids.map((record_id, index) => ({ record_id, score: 1 / (index + 1) })),
        model_ref: "vector:model:v1",
        projection_cursor: "1" as Cursor,
      };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest("vector-query", body) } };
    },
    async apply() { throw new Error("unused"); },
  };
}

describe("semantic recall", () => {
  it("removed neighbour has zero contribution after induced-subgraph PPR", async () => {
    let observedEligible: readonly string[] = [];
    // The induced adjacency is built ONLY over ids the engine passes as eligible.
    // A removed/tombstoned neighbour is never in that set, so it earns zero PPR mass
    // and can never surface — the adjacency the engine hands us proves it.
    const semantic: SemanticProjectionPort = {
      version: 1,
      async inducedAdjacency(input) {
        observedEligible = input.eligible_record_ids;
        const ids = [...input.eligible_record_ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        // Chain adjacency among eligible ids only.
        const offsets: number[] = [0];
        const neighbours: number[] = [];
        const weights: number[] = [];
        for (let i = 0; i < ids.length; i++) {
          if (i + 1 < ids.length) { neighbours.push(i + 1); weights.push(1); }
          if (i - 1 >= 0) { neighbours.push(i - 1); weights.push(1); }
          offsets.push(neighbours.length);
        }
        const body: Omit<SemanticAdjacencyV1, "adjacency_digest"> = { record_ids: ids, offsets, neighbours, weights, projection_cursor: input.system_as_of };
        return { ok: true, value: { ...body, adjacency_digest: receiptDigest("semantic-adjacency", body) } };
      },
    };

    const { memory } = buildMemory({ semantic, vector: vectorPort() });
    const seed = await seedAccepted(memory, "sigma anchor query term");
    const neighbour = await seedAccepted(memory, "sigma connected context");
    const removed = await seedAccepted(memory, "sigma doomed neighbour");

    // Tombstone `removed` so it drops out of the accepted snapshot and the induced graph.
    const tombstone = await memory.transition({
      operation: "tombstone", event_id: `evt-tombstone-${"0".repeat(16)}`, record_id: removed,
      reason_ref: "reason:tombstone",
      event_anchor: { occurred_at: "2026-08-16T12:34:56.789Z", kind_ref: "kind:tombstone", provenance_ref: "citation:x", provenance_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      authorization: { credential: "credential:l7" }, deadline_at: "2026-08-16T12:40:00.000Z",
    });
    expect(tombstone.ok).toBe(true);

    const recalled = await memory.recall(recallRequest("sigma anchor", { minimum_channels: "lexical_and_semantic" }));
    expect(recalled.ok).toBe(true);
    if (!recalled.ok) return;

    expect(recalled.value.rank_receipt.profile).toBe("semantic_v1");
    expect(recalled.value.rank_receipt.scoring_formula_ref).toBe("graphify-memory:semantic-rrf-recency:v1");
    // The removed neighbour was never offered to the induced-subgraph builder.
    expect(observedEligible).not.toContain(removed);
    expect(observedEligible).toContain(seed);
    expect(observedEligible).toContain(neighbour);
    const ids = recalled.value.records.map((entry) => entry.record.record_id);
    expect(ids).not.toContain(removed);
    expect(ids).toContain(seed);
    // Projection receipts (adjacency + vector) are bound into the rank receipt.
    expect(recalled.value.rank_receipt.projection_receipt_digests.length).toBe(2);
  });

  it("semantic requirement returns typed unavailable and never raw lexical fallback", async () => {
    // No semantic/vector ports configured, but the caller requires the semantic channel.
    const { memory } = buildMemory({});
    await seedAccepted(memory, "omega lexical hit that must not be returned");

    const recalled = await memory.recall(recallRequest("omega lexical hit", { minimum_channels: "lexical_and_semantic" }));
    expect(recalled.ok).toBe(false);
    if (recalled.ok) return;
    expect(recalled.error.code).toBe("RANKING_UNAVAILABLE");
    expect(recalled.error.operation).toBe("recall_current");
  });
});
