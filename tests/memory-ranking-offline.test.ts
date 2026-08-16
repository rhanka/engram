import { describe, expect, it } from "vitest";

import {
  createInMemoryCanonicalMemoryStoreV1,
  type CanonicalMemoryStorePort,
  type RevalidationPacketV1,
} from "../graphify-memory/index.js";
import { buildMemory, DEADLINE, NOW, recallRequest, seedAccepted } from "./memory-l7-fixture.js";

/** Forwards to the real store but drops `staleId` at the final revalidation gate,
 * modelling a detached-snapshot hit that canonical state has since invalidated. */
function staleRevalidationStore(store: CanonicalMemoryStorePort, staleId: () => string | undefined): CanonicalMemoryStorePort {
  return new Proxy(store, {
    get(target, property, receiver) {
      if (property === "revalidate") {
        return async (input: Parameters<CanonicalMemoryStorePort["revalidate"]>[0]) => {
          const result = await target.revalidate(input);
          const drop = staleId();
          if (!result.ok || drop === undefined) return result;
          const value: RevalidationPacketV1 = {
            ...result.value,
            eligible_record_ids: result.value.eligible_record_ids.filter((id) => id !== drop),
            removed: [...result.value.removed, { record_id: drop, reason: "tombstone" }],
          };
          return { ok: true as const, value };
        };
      }
      const resolved = Reflect.get(target, property, receiver);
      return typeof resolved === "function" ? resolved.bind(target) : resolved;
    },
  }) as CanonicalMemoryStorePort;
}

describe("offline lexical recall", () => {
  it("offline profile reads only accepted FTS and revalidation removes a stale hit", async () => {
    let stale: string | undefined;
    const inner = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
    const store = staleRevalidationStore(inner, () => stale);
    const { memory } = buildMemory({ store });

    const keep = await seedAccepted(memory, "alpha beta gamma retained knowledge");
    const removed = await seedAccepted(memory, "alpha beta gamma stale knowledge");
    stale = removed;

    // A pending (never-admitted) candidate must never enter the accepted FTS ranking.
    const pending = await memory.capture({
      schema_version: 2,
      idempotency_key: `idem-pending-${"0".repeat(16)}`,
      payload: {
        schema_version: 2, scope_ref: "mem:scope", purpose_ref: "purpose:l7", valid_time: { t: 1 },
        components: [{ component_id: "component:pending", kind: "context", text: "alpha beta gamma pending secret", citation_ids: ["citation:pending"] }],
        primary_component_id: "component:pending",
        primary_event: { at: 1, type_ref: "event:l7", citation_id: "citation:pending" },
        citations: [{ citation_id: "citation:pending", source_ref: "source:pending", locator: { scheme: "document", value: "l7#pending" }, content_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
        retention: { derivative_rule: "retain" }, reconciliation: { family_refs: [] },
      },
      evidence: { evidence_ref: "evidence:pending", evidence_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", citation_ids: ["citation:pending"] },
      authorization: { credential: "credential:l7" },
      source_order: { source_ref: "source:pending", sequence: "0" },
      deadline_at: DEADLINE, cancellation_ref: "cancel:pending",
    });
    expect(pending.ok).toBe(true);

    const recalled = await memory.recall(recallRequest("alpha beta gamma"));
    expect(recalled.ok).toBe(true);
    if (!recalled.ok) return;
    const ids = recalled.value.records.map((entry) => entry.record.record_id);
    expect(ids).toContain(keep);
    expect(ids).not.toContain(removed);            // revalidation removed the stale hit
    expect(ids).not.toContain("mem_pending");      // pending never ranked
    expect(recalled.value.rank_receipt.candidate_count).toBe(2); // both accepted docs were candidates
    expect(recalled.value.records).toHaveLength(1);
    expect(recalled.value.rank_receipt.revalidation_receipt_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(recalled.value.rank_receipt.profile).toBe("offline_lexical_v1");
  });

  it("formula profile version bounds receipt and tie order are deterministic", async () => {
    const { memory } = buildMemory({});
    // Identical text and valid-time → a pure tie broken deterministically by record_id.
    const first = await seedAccepted(memory, "delta epsilon tie");
    const second = await seedAccepted(memory, "delta epsilon tie");

    const recalled = await memory.recall(recallRequest("delta epsilon tie"));
    expect(recalled.ok).toBe(true);
    if (!recalled.ok) return;

    expect(recalled.value.rank_receipt.profile).toBe("offline_lexical_v1");
    expect(recalled.value.rank_receipt.profile_version).toBe("1.0.0");
    expect(recalled.value.rank_receipt.scoring_formula_ref).toBe("graphify-memory:offline-lexical-recency:v1");
    expect(recalled.value.rank_receipt.profile_config_digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const ids = recalled.value.records.map((entry) => entry.record.record_id);
    const expected = [first, second].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(ids).toEqual(expected);
    expect(recalled.value.records.map((entry) => entry.rank)).toEqual([1, 2]);

    // Determinism: re-running the same pinned read yields the identical packet.
    const again = await memory.recall(recallRequest("delta epsilon tie", { as_of: { system_cursor: recalled.value.rank_receipt.system_as_of, valid_time: recalled.value.rank_receipt.valid_as_of } }));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.rank_receipt.ordered_ids_digest).toBe(recalled.value.rank_receipt.ordered_ids_digest);
  });
});
