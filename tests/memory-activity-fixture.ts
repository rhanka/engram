import { expect } from "vitest";
import {
  createMemoryPortV2, createLogicalMemoryBackupV1, receiptDigest,
  type ActivityEvidenceSource, type ActivityEvidenceV1, type ActivityIngestionRequestV1,
  type CanonicalMemoryStorePort, type CanonicalTransactionReceiptV1, type CaptureAcknowledgementV1, type Digest,
  type MemoryEngineDependenciesV2,
} from "../engram-memory/index.js";

export const ACTIVITY_NOW = "2026-08-16T12:34:56.789Z";
const DEADLINE = "2026-08-16T12:40:00.000Z";
const DIGEST = `sha256:${"a".repeat(64)}` as Digest;
const OTHER = `sha256:${"b".repeat(64)}` as Digest;
export const ACTIVITY_STAGES = [
  "pending", "pending_adjudication", "rejected", "withdrawn", "accepted_current",
  "accepted_disputed", "historical", "expired", "trust_invalid", "tombstoned",
] as const;
type Stage = typeof ACTIVITY_STAGES[number];

export function activityEvidence(id = "ev:matrix"): ActivityEvidenceV1 {
  return {
    evidence_id: id, sequence: "1", subject_ref: "subject:opaque", valid_time: { t: 1, t_end: 10 },
    components: [
      { component_id: "component:a", kind: "context", text: "first", citation_ids: ["citation:a", "citation:b"] },
      { component_id: "component:b", kind: "context", text: "second", citation_ids: ["citation:a", "citation:b"] },
    ],
    primary_component_id: "component:a",
    primary_event: { at: 2, type_ref: "event:activity", citation_id: "citation:a" },
    citations: ["a", "b", "c"].map((id) => ({
      citation_id: `citation:${id}`, source_ref: "source:document",
      locator: { scheme: "document" as const, value: `doc#${id}` }, content_digest: DIGEST,
      observed_at: ACTIVITY_NOW,
    })),
    evidence_digest: DIGEST,
  };
}

// Each mutation changes ONE independently valid field. In particular the
// alternate primary component/citation already exists in the baseline.
export const ACTIVITY_MUTATIONS: Array<[string, (e: ActivityEvidenceV1) => void]> = [
  ["components.text", e => { e.components[0]!.text = "changed"; }],
  ["components.kind", e => { e.components[0]!.kind = "decision"; }],
  ["components.component_id", e => { e.components[1]!.component_id = "component:c"; }],
  ["components.citation_ids", e => { e.components[1]!.citation_ids = ["citation:b"]; }],
  ["primary_component_id", e => { e.primary_component_id = "component:b"; }],
  ["valid_time.t", e => { e.valid_time.t = 0; }],
  ["valid_time.t_end", e => { e.valid_time.t_end = 11; }],
  ["primary_event.at", e => { e.primary_event.at = 3; }],
  ["primary_event.type_ref", e => { e.primary_event.type_ref = "event:other"; }],
  ["primary_event.citation_id", e => { e.primary_event.citation_id = "citation:b"; }],
  ["citations.citation_id", e => { e.citations[2]!.citation_id = "citation:d"; }],
  ["citations.source_ref", e => { e.citations[0]!.source_ref = "source:other"; }],
  ["citations.locator.scheme", e => { e.citations[0]!.locator.scheme = "file"; }],
  ["citations.locator.value", e => { e.citations[0]!.locator.value = "doc#changed"; }],
  ["citations.content_digest", e => { e.citations[0]!.content_digest = OTHER; }],
  ["citations.observed_at", e => { e.citations[0]!.observed_at = "2026-08-16T12:34:55.789Z"; }],
  ["evidence_digest", e => { e.evidence_digest = OTHER; }],
];

export function activityHarness(initial = activityEvidence()) {
  let evidence = initial;
  let now = ACTIVITY_NOW;
  let decision: "accept" | "reject" | "adjudication_required" = "accept";
  const writes = { seal: 0, commit: 0, registry: 0 };
  const plaintext = new Map<string, string>();
  const receipts: CanonicalTransactionReceiptV1[] = [];
  const commits: Parameters<CanonicalMemoryStorePort["commitPending"]>[0][] = [];
  const acknowledgements: CaptureAcknowledgementV1[] = [];
  const instrumented = new WeakSet<object>();
  const source: ActivityEvidenceSource = {
    source_id: "source:matrix", source_version: "1",
    async read() { return { ok: true, value: {
      source_id: source.source_id, source_version: "1", evidence: [evidence], page_digest: DIGEST,
    } }; },
    async cancel() { return { ok: true, value: { cancelled: true } }; },
  };
  const request: ActivityIngestionRequestV1 = {
    source_id: source.source_id, limit: 10, scope_ref: "scope:matrix", purpose_ref: "purpose:matrix",
    retention: { derivative_rule: "retain" }, reconciliation: { family_refs: [] },
    authorization: { credential: "credential:matrix" }, deadline_at: DEADLINE, cancellation_ref: "cancel:matrix",
  };
  const authorization: MemoryEngineDependenciesV2["authorization"] = {
    version: 1,
    async authorize(r) {
      const body = {
        allowed: true as const, decision_id: "decision:matrix", policy_version: "1", operation: r.operation,
        resource_digest: r.resource_digest, scope_ref: request.scope_ref, not_before: ACTIVITY_NOW, expires_at: DEADLINE,
        revocation_epoch: "0", authentication_receipt_digest: DIGEST,
        redaction: { mode: "field-allowlist" as const, allowed_fields: [], allow_derivation_lineage: false, max_packet_bytes: 4096 },
      };
      return { ok: true, value: { ...body, receipt_digest: receiptDigest("authorization-allowed", body) } };
    },
    async revalidate(digest, at) {
      const body = { receipt_digest: digest, checked_at: at, valid: true, current_revocation_epoch: "0", reason: "valid" as const };
      return { ok: true, value: { ...body, revalidation_receipt_digest: receiptDigest("authorization-revalidation", body, "revalidation_receipt_digest") } };
    },
    async redact() { throw new Error("unused"); },
  };
  const crypto: MemoryEngineDependenciesV2["crypto"] = {
    version: 1,
    async seal(input) {
      writes.seal++;
      plaintext.set(input.candidate_id, input.plaintext);
      const body = { candidate_id: input.candidate_id, envelope_ref: `envelope:${input.candidate_id}`, key_ref: `key:${input.candidate_id}`, ciphertext: "ciphertext" };
      return { ok: true, value: { ...body, envelope_digest: receiptDigest("sealed-candidate", body) } };
    },
    async open({ sealed }) {
      const value = plaintext.get(sealed.candidate_id);
      if (value === undefined) throw new Error("envelope destroyed");
      return { ok: true, value: { plaintext: value } };
    },
    async destroy({ key_ref }) {
      plaintext.delete(key_ref.slice("key:".length));
      return { ok: true, value: { destroyed: true, receipt_digest: DIGEST } };
    },
    async rotate() { throw new Error("unused"); },
  };
  return {
    request, source, writes, plaintext, receipts, commits, acknowledgements, authorization,
    setEvidence(value: ActivityEvidenceV1) { evidence = value; },
    advanceClock() { now = "2026-08-16T12:35:56.789Z"; },
    setDecision(value: typeof decision) { decision = value; },
    build(store: CanonicalMemoryStorePort) {
      if (!instrumented.has(store)) {
        instrumented.add(store);
        const commit = store.commitPending.bind(store);
        store.commitPending = async input => {
          writes.commit++; commits.push(structuredClone(input));
          const result = await commit(input);
          if (result.ok) receipts.push(result.value as CanonicalTransactionReceiptV1);
          return result;
        };
        const record = store.recordCaptureIdempotency?.bind(store);
        if (record) store.recordCaptureIdempotency = async input => { writes.registry++; return record(input); };
      }
      const memory = createMemoryPortV2({
        canonical_store: store, authorization, crypto, activity_sources: [source], clock: { now: () => now },
        allow_unfenced_memory_store: true,
        admission_policy: {
          policy_id: "policy:matrix", policy_version: "1",
          async decide(r) {
            const body = { policy_id: "policy:matrix", policy_version: "1", record_digest: r.record_digest, decision, issued_at: ACTIVITY_NOW };
            return { ok: true, value: { ...body, receipt_digest: receiptDigest("admission-decision", body) } };
          },
        },
      });
      const capture = memory.capture;
      memory.capture = async input => {
        const result = await capture(input);
        if (result.ok) acknowledgements.push(result.value);
        return result;
      };
      return memory;
    },
  };
}

export async function assertActivityReplayAtStage(open: () => Promise<CanonicalMemoryStorePort>, stage: Stage, sqlWrites: () => number = () => 0) {
  const baseline = activityEvidence(`ev:${stage}`);
  const h = activityHarness(baseline);
  let store = await open();
  try {
    let memory = h.build(store);
    const first = await memory.ingestActivity(h.request);
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (!first.ok) throw new Error("first capture failed");
    const item = first.value.items[0]!;
    expect(item.status).toBe("committed_pending");
    // D5 and V1: a direct receipt, bound to the live epoch, on the FIRST commit.
    const receipt = h.receipts[0]!;
    expect(receipt).toHaveProperty("storage_epoch");
    expect(receipt).not.toHaveProperty("receipt");
    expect(receipt).not.toHaveProperty("outcome");
    expect(receipt.receipt_digest).toBe(receiptDigest("canonical-transaction", receipt));
    const ready = await store.readiness();
    expect(ready.ok && receipt.storage_epoch).toBe(ready.ok && ready.value.storage_epoch);
    const auth = { authorization: h.request.authorization, deadline_at: DEADLINE };
    if (stage !== "pending" && stage !== "withdrawn") {
      if (stage === "rejected") h.setDecision("reject");
      if (stage === "pending_adjudication") h.setDecision("adjudication_required");
      const admitted = await memory.requestAdmission({ candidate_id: item.candidate_id, ...auth });
      expect(admitted.ok, JSON.stringify(admitted)).toBe(true);
      if (!admitted.ok) throw new Error("admission failed");
      const operations = { accepted_disputed: "dispute", historical: "mark_non_current", expired: "expire", trust_invalid: "trust_invalidate", tombstoned: "tombstone" } as const;
      if (stage in operations) {
        const operation = operations[stage as keyof typeof operations];
        const transitioned = await memory.transition({ operation, record_id: admitted.value.record_id!, event_id: `event:${stage}`, reason_ref: "reason:matrix",
          event_anchor: { occurred_at: ACTIVITY_NOW, kind_ref: "kind:matrix", provenance_ref: "citation:a", provenance_digest: DIGEST }, ...auth });
        expect(transitioned.ok, JSON.stringify(transitioned)).toBe(true);
      }
    }
    if (stage === "withdrawn") {
      const result = await memory.transition({ operation: "withdraw", candidate_id: item.candidate_id, event_id: "event:withdrawn", reason_ref: "reason:matrix",
        event_anchor: { occurred_at: ACTIVITY_NOW, kind_ref: "kind:matrix", provenance_ref: "citation:a", provenance_digest: DIGEST }, ...auth });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      // Model key destruction after withdrawal as well as the automatic
      // destruction performed by requestAdmission after accept/reject.
      h.plaintext.clear();
    }
    const registered = await store.readCaptureIdempotency!({ candidate_id: item.candidate_id });
    expect(registered.ok).toBe(true);
    if (!registered.ok) throw new Error("registry missing");
    expect(registered.value.record_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(registered.value.capture_receipt_digest).toBe(receipt.receipt_digest);
    await store.close();
    store = await open();
    const loaded = await store.readCaptureIdempotency!({ candidate_id: item.candidate_id });
    expect(loaded).toEqual(registered);
    h.advanceClock();
    memory = h.build(store);
    const water = await store.readiness();
    const journal = await store.readJournal({ after: "0", limit: 2000 });
    expect(journal.ok && journal.value.at(-1)?.to_state).toBe(stage === "pending_adjudication" ? "pending" : stage);
    const writes = { ...h.writes, sql: sqlWrites() };
    const plaintext = [...h.plaintext];
    for (const [name, mutate] of [["exact", undefined], ...ACTIVITY_MUTATIONS, ["exact restored", undefined]] as Array<[string, ((e: ActivityEvidenceV1) => void) | undefined]>) {
      const changed = structuredClone(baseline);
      mutate?.(changed);
      h.setEvidence(changed);
      // A fresh port for every row prevents a local cache from masking a
      // broken durable content comparison.
      memory = h.build(store);
      const result = await memory.ingestActivity(h.request);
      if (mutate) expect(result, name).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT", operation: "capture" } });
      else {
        expect(result, name).toMatchObject({ ok: true, value: { items: [{ ...item, status: "duplicate_exact" }] } });
        expect(h.acknowledgements.at(-1), name).toEqual({ ...h.acknowledgements[0], status: "duplicate_exact" });
      }
      expect({ ...h.writes, sql: sqlWrites() }, name).toEqual(writes);
      expect([...h.plaintext], name).toEqual(plaintext);
      expect(await store.readJournal({ after: "0", limit: 2000 }), name).toEqual(journal);
      const after = await store.readiness();
      expect(after.ok && after.value.high_water_cursor, name).toBe(water.ok && water.value.high_water_cursor);
    }
    // The V1 store seam also preserves its no-write and D5 contracts after
    // admission/destruction, independently of the engine pre-check.
    const direct = await store.commitPending(h.commits[0]!);
    expect(direct.ok).toBe(true);
    if (!direct.ok) throw new Error("direct replay failed");
    expect(direct.value.receipt_digest).toBe(receiptDigest("canonical-transaction", direct.value));
    expect(direct.value.cursor).toBe(item.cursor);
    const active = await store.readiness();
    expect(direct.value.storage_epoch).toBe(active.ok && active.value.storage_epoch);
    const conflicted = await store.commitPending({ ...h.commits[0]!, control: { ...h.commits[0]!.control, capture_content_digest: OTHER } });
    expect(conflicted).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT", operation: "capture" } });
    expect(sqlWrites()).toBe(writes.sql);
  } finally { await store.close(); }
}

// Opus a1: accepted AND pending identities survive the logical X4 quarantine.
export async function assertActivityReplayAfterLogicalRestore(
  sourceStore: CanonicalMemoryStorePort, target: CanonicalMemoryStorePort, sqlWrites: () => number = () => 0,
) {
  const h = activityHarness();
  const source = h.build(sourceStore);
  const originals = [activityEvidence("ev:restore-accepted"), activityEvidence("ev:restore-pending")];
  const items = [];
  for (const evidence of originals) {
    h.setEvidence(evidence);
    const ingested = await source.ingestActivity(h.request);
    if (!ingested.ok) throw new Error(JSON.stringify(ingested));
    items.push(ingested.value.items[0]!);
  }
  const admitted = await source.requestAdmission({ candidate_id: items[0]!.candidate_id,
    authorization: h.request.authorization, deadline_at: DEADLINE });
  expect(admitted.ok, JSON.stringify(admitted)).toBe(true);
  const water = await sourceStore.readiness();
  if (!water.ok) throw new Error(JSON.stringify(water));
  let plaintext = "";
  const backup = createLogicalMemoryBackupV1({
    store: sourceStore, authorization: h.authorization, clock: { now: () => ACTIVITY_NOW },
    backup_key: { version: 1,
      async seal(input) { plaintext = input.plaintext; return { ok: true, value: {
        ciphertext: "opaque:backup", ciphertext_digest: DIGEST, key_receipt_digest: DIGEST,
      } }; },
      async open() { return { ok: true, value: { plaintext, key_receipt_digest: DIGEST } }; },
    },
    backup_object: { version: 1,
      async put() { return { ok: true, value: { object_ref: "object:backup", object_receipt_digest: DIGEST } }; },
      async get() { return { ok: true, value: { ciphertext: "opaque:backup", object_receipt_digest: DIGEST } }; },
    },
  });
  const exported = await backup.exportLogical({ through_cursor: water.value.high_water_cursor,
    authorization: h.request.authorization, object_target_ref: "target:backup", encryption_key_ref: "key:backup", deadline_at: DEADLINE });
  if (!exported.ok) throw new Error(JSON.stringify(exported));
  const restored = await backup.restoreLogical({ manifest: exported.value,
    authorization: h.request.authorization, source_ref: "target:backup", decryption_key_ref: "key:backup",
    deadline_at: DEADLINE, target_store: target });
  expect(restored.ok, JSON.stringify(restored)).toBe(true);
  if (!restored.ok) return;
  const payload = JSON.parse(plaintext);
  expect(payload.schema_version).toBe(3);
  expect(payload.capture_idempotency).toHaveLength(2);
  expect(payload).not.toHaveProperty("controls");
  expect(payload).not.toHaveProperty("envelopes");
  expect(restored.value.capture_idempotency_digest).toBe(exported.value.capture_idempotency_digest);
  expect(restored.value.canonical_state_digest).toBe(exported.value.state_digest);
  expect(restored.value.receipt_digest).toBe(receiptDigest("logical-restore", restored.value));
  const prefix = { through_cursor: water.value.high_water_cursor };
  expect(await target.readCaptureIdempotencyEntries!(prefix)).toEqual(await sourceStore.readCaptureIdempotencyEntries!(prefix));
  const memory = h.build(target);
  const baselineWrites = { ...h.writes };
  const baselineSql = sqlWrites();
  // Same clock, then +1 min: the recorded acknowledgement is independent of time.
  for (const advanced of [false, true]) {
    if (advanced) h.advanceClock();
    for (const [index, evidence] of originals.entries()) {
      h.setEvidence(evidence);
      const replay = await memory.ingestActivity(h.request);
      expect(replay, JSON.stringify(replay)).toMatchObject({ ok: true, value: { items: [{ ...items[index]!, status: "duplicate_exact" }] } });
      expect(h.writes).toEqual(baselineWrites);
      expect(sqlWrites()).toBe(baselineSql);
      const changed = structuredClone(evidence);
      changed.components[0]!.text = "modified after restore";
      h.setEvidence(changed);
      expect(await memory.ingestActivity(h.request)).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT" } });
      expect(h.writes).toEqual(baselineWrites);
      expect(sqlWrites()).toBe(baselineSql);
    }
  }
  expect(await target.readiness()).toMatchObject({ ok: true, value: { high_water_cursor: water.value.high_water_cursor } });
  // The pending envelope stays quarantined; only its hash acknowledgement survives.
  expect(await target.readPending({ candidate_id: items[1]!.candidate_id, authorization_receipt_digest: DIGEST }))
    .toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
}
