import { describe, expect, it } from "vitest";

import {
  MEMORY_PROJECTION_RAW_BYTE_CEILING,
  buildBoundedCurrentProjectionV1,
  canonicalizeJcs,
  createInMemoryCanonicalMemoryStoreV1,
  exportBoundedCurrentProjectionV1,
  measureRawProjectionBytesV1,
  syntheticBoundedProjectionInputAtBytesV1,
  type BoundedProjectionInputV1,
  type CanonicalMemoryStorePort,
  type MemoryPortV2,
} from "../engram-memory/index.js";
import { buildMemory, DEADLINE, DIGEST, NOW, recallRequest } from "./memory-l7-fixture.js";

const PENDING_CHURN = 150;

/** Caller-pinned capture so two stores fold byte-identical records and ids. */
function pinnedCaptureRequest(tag: string, text: string, key: string) {
  return {
    schema_version: 2 as const,
    idempotency_key: key,
    payload: {
      schema_version: 2 as const,
      scope_ref: "mem:scope",
      purpose_ref: "purpose:bound",
      valid_time: { t: 1 },
      components: [{ component_id: `component:${tag}`, kind: "context" as const, text, citation_ids: [`citation:${tag}`] }],
      primary_component_id: `component:${tag}`,
      primary_event: { at: 1, type_ref: "event:bound", citation_id: `citation:${tag}` },
      citations: [{ citation_id: `citation:${tag}`, source_ref: `source:${tag}`, locator: { scheme: "document", value: `bound#${tag}` }, content_digest: DIGEST }],
      retention: { derivative_rule: "retain" as const },
      reconciliation: { family_refs: [] },
    },
    evidence: { evidence_ref: `evidence:${tag}`, evidence_digest: DIGEST, citation_ids: [`citation:${tag}`] },
    authorization: { credential: "credential:l7" },
    source_order: { source_ref: `source:${tag}`, sequence: "0" },
    deadline_at: DEADLINE,
    cancellation_ref: `cancel:${tag}`,
  };
}

async function acceptPinned(memory: MemoryPortV2, tag: string, text: string): Promise<string> {
  const captured = await memory.capture(pinnedCaptureRequest(tag, text, `idem-${tag}-${"0".repeat(16)}`));
  if (!captured.ok || captured.value.candidate_id === undefined) throw new Error(`capture ${tag} failed`);
  const admitted = await memory.requestAdmission({
    candidate_id: captured.value.candidate_id,
    authorization: { credential: "credential:l7" },
    deadline_at: DEADLINE,
  });
  if (!admitted.ok || admitted.value.record_id === undefined) throw new Error(`admission ${tag} failed`);
  return admitted.value.record_id;
}

async function capturePending(memory: MemoryPortV2, index: number): Promise<void> {
  const tag = `churn-${String(index).padStart(4, "0")}`;
  const captured = await memory.capture(pinnedCaptureRequest(tag, `churn text ${tag}`, `idem-${tag}-${"1".repeat(16)}`));
  if (!captured.ok) throw new Error(`pending capture ${tag} failed`);
}

async function projectionInputForCurrent(memory: MemoryPortV2, store: CanonicalMemoryStorePort): Promise<BoundedProjectionInputV1> {
  const readiness = await store.readiness();
  if (!readiness.ok) throw new Error("readiness failed");
  const highWater = readiness.value.high_water_cursor;
  const recalled = await memory.recall(recallRequest("north quay alpha"));
  if (!recalled.ok) throw new Error(`recall failed: ${recalled.error.code}`);
  const current = [];
  for (const entry of recalled.value.records) {
    const read = await store.readRecord({
      record_id: entry.record.record_id,
      system_as_of: highWater,
      authorization_receipt_digest: DIGEST,
    });
    if (!read.ok) throw new Error(`readRecord ${entry.record.record_id} failed`);
    current.push({
      node_id: read.value.record_id,
      record_id: read.value.record_id,
      record_digest: read.value.record_digest,
      scope_ref: read.value.scope_ref,
      valid_time: read.value.valid_time,
      projection_cursor: highWater,
      citation_refs: read.value.citations.map((citation) => citation.source_ref),
    });
  }
  return { high_water_cursor: highWater, projection_cursor: highWater, current, omitted: [] };
}

describe("bounded current projection", () => {
  it("raw projection at cap passes and cap plus one byte fails without silent omission", () => {
    expect(MEMORY_PROJECTION_RAW_BYTE_CEILING).toBe(52_428_800);

    const atCapInput = syntheticBoundedProjectionInputAtBytesV1(MEMORY_PROJECTION_RAW_BYTE_CEILING);
    const overCapInput = syntheticBoundedProjectionInputAtBytesV1(MEMORY_PROJECTION_RAW_BYTE_CEILING + 1);

    // The synthetic fixture is deterministic and byte-exact, not a dirty artifact.
    expect(measureRawProjectionBytesV1(buildBoundedCurrentProjectionV1(atCapInput))).toBe(52_428_800);
    expect(measureRawProjectionBytesV1(buildBoundedCurrentProjectionV1(overCapInput))).toBe(52_428_801);

    const accepted = exportBoundedCurrentProjectionV1(atCapInput);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.value.raw_byte_size).toBe(52_428_800);
    expect(accepted.value.raw_byte_ceiling).toBe(52_428_800);
    expect(accepted.value.projection_schema_version).toBe(1);
    expect(accepted.value.included_count).toBe(1);
    expect(accepted.value.omitted_total).toBe(2);
    expect(accepted.value.omitted_by_reason.pending).toBe(1);
    expect(accepted.value.omitted_by_reason.tombstoned).toBe(1);
    expect(accepted.value.high_water_cursor).toBe("2");
    expect(accepted.value.projection_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(accepted.value.export_digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    // The bounded projection carries only envelopes, citation refs, and metadata:
    // never record bodies, journal events, receipts, or trust bindings.
    const raw = canonicalizeJcs(accepted.value.projection);
    expect(raw.includes("\"components\"")).toBe(false);
    expect(raw.includes("\"trust\"")).toBe(false);
    expect(raw.includes("\"ciphertext\"")).toBe(false);
    expect(raw.includes("\"event_hash\"")).toBe(false);

    const refused = exportBoundedCurrentProjectionV1(overCapInput);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe("PROJECTION_OVERSIZED");
    expect(refused.error.operation).toBe("projection_invalidate");
    // No silent top-N loss: the refusal names the full count it declined to truncate.
    expect(refused.error.message).toContain(String(52_428_801));
    expect(refused.error.message).toContain(`${overCapInput.current.length} objects`);
  });

  it("fixed current cardinality does not grow with journal length", async () => {
    // Same final accepted state, two very different journal lengths: the long
    // journal carries PENDING_CHURN extra pending captures that never enter
    // the accepted current set. A projection that leaked journal history
    // would differ in bytes, count, or digest; it must not.
    const shortStore = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
    const { memory: shortMemory } = buildMemory({ store: shortStore });
    await acceptPinned(shortMemory, "bound-00", "north quay alpha ledger");
    await acceptPinned(shortMemory, "bound-01", "north quay alpha ledger annex");

    const longStore = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
    const { memory: longMemory } = buildMemory({ store: longStore });
    await acceptPinned(longMemory, "bound-00", "north quay alpha ledger");
    await acceptPinned(longMemory, "bound-01", "north quay alpha ledger annex");
    for (let i = 0; i < PENDING_CHURN; i++) await capturePending(longMemory, i);

    const shortJournal = await shortStore.readJournal({ after: "0", limit: 2000 });
    const longJournal = await longStore.readJournal({ after: "0", limit: 2000 });
    if (!shortJournal.ok || !longJournal.ok) throw new Error("readJournal failed");
    expect(longJournal.value.length - shortJournal.value.length).toBeGreaterThanOrEqual(PENDING_CHURN);
    expect(longJournal.value.length).toBeGreaterThan(10 * shortJournal.value.length);

    const shortInput = await projectionInputForCurrent(shortMemory, shortStore);
    const longInput = await projectionInputForCurrent(longMemory, longStore);
    expect(shortInput.current.map((entry) => entry.record_id).sort()).toEqual(
      longInput.current.map((entry) => entry.record_id).sort(),
    );
    expect(shortInput.current).toHaveLength(2);
    expect(longInput.current).toHaveLength(2);

    const shortProjection = buildBoundedCurrentProjectionV1(shortInput);
    const longProjection = buildBoundedCurrentProjectionV1(longInput);
    // Only the cursor pin (value + the digest binding it) may differ between
    // journals; every cursor-independent envelope field must be identical.
    const stripCursor = (objects: typeof shortProjection.objects) =>
      objects.map(({ projection: { projection_cursor: _cursor, envelope_digest: _digest, ...rest }, ...objectRest }) => ({
        ...objectRest,
        projection: rest,
      }));
    expect(longProjection.objects).toHaveLength(2);
    expect(stripCursor(longProjection.objects)).toEqual(stripCursor(shortProjection.objects));
    // No linear growth: 150+ extra journal events move raw bytes by cursor
    // digits only, while the journal grew by two orders of magnitude.
    const byteDelta = Math.abs(measureRawProjectionBytesV1(longProjection) - measureRawProjectionBytesV1(shortProjection));
    expect(byteDelta).toBeLessThan(100);
    expect(longJournal.value.length - shortJournal.value.length).toBeGreaterThan(byteDelta);

    const shortExport = exportBoundedCurrentProjectionV1(shortInput);
    const longExport = exportBoundedCurrentProjectionV1(longInput);
    expect(shortExport.ok).toBe(true);
    expect(longExport.ok).toBe(true);
    if (!shortExport.ok || !longExport.ok) return;
    expect(shortExport.value.included_count).toBe(2);
    expect(longExport.value.included_count).toBe(2);
    expect(longExport.value.omitted_total).toBe(shortExport.value.omitted_total);
  });
});
