// X1 INVARIANTS (FIN §4.1) — breaker class per invariant:
// I1 pull hôte: l'activité n'entre qu'en capture pending via ingestActivity; la source n'admet jamais / casse: admission dans le chemin d'ingestion.
// I2 idempotence (source_id, sequence, evidence_id): même clé = même candidate_id, zéro écriture / casse: membre omis (collision) ou digest inclus (rejeu dupliqué).
// I3 preuve modifiée sous même clé = DIGEST_CONFLICT sans écriture (curseur inchangé) / casse: contenu dans la clé ou écriture avant comparaison.
// I4 valeurs hôte (scope, purpose, retention, consent) dans chaque capture; subject_ref lié par evidence_digest seul / casse: défaut déduit ou subject promu.
// I5 premier échec stoppe la page, erreurs en opération capture, reçu lié activity-ingestion / casse: suite après échec ou reçu non lié.
import { describe, expect, it } from "vitest";
import { ACTIVITY_NOW, ACTIVITY_STAGES, assertActivityReplayAfterLogicalRestore, activityEvidence, activityHarness, assertActivityReplayAtStage } from "./memory-activity-fixture.js";
import type { InMemoryStoreStateV1 } from "../engram-memory/memory-store.js";

import {
  createInMemoryCanonicalMemoryStoreV1,
  createMemoryPortV2,
  receiptDigest,
  type ActivityEvidenceV1,
  type CanonicalMemoryStorePort,
  type Digest,
  type MemoryEngineDependenciesV2,
  type MemoryPortV2,
} from "../engram-memory/index.js";

const NOW = "2026-08-16T12:34:56.789Z";
const DEADLINE = "2026-08-16T12:40:00.000Z";
const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Digest;
const DIGEST_B = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Digest;
const PAGE_DIGEST = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as Digest;
const SCOPE = "scope:x1";
const PURPOSE = "purpose:x1";

describe("X1 lifecycle backend matrix / memory", () => {
  it("storage_epoch keeps readiness and capture receipts aligned", async () => {
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW }, storage_epoch: "7" });
    const h = activityHarness();
    expect(await h.build(store).ingestActivity(h.request)).toMatchObject({ ok: true });
    const ready = await store.readiness();
    expect(ready).toMatchObject({ ok: true, value: { storage_epoch: "7" } });
    expect(h.receipts[0]!.storage_epoch).toBe("7");
  });

  it.each([null, { content: "invalid" }, { content: DIGEST_B }, { cursor: "999" }, { record_digest: "invalid" }, { receipt_digest: "invalid" }])(
    "corrupt registry entries refuse readiness explicitly: %j", async corruption => {
      const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
      const h = activityHarness();
      expect(await h.build(store).ingestActivity(h.request)).toMatchObject({ ok: true });
      const state = store.exportStateForPersistence();
      if (!state.ok) throw new Error(JSON.stringify(state));
      const entries = [corruption === null ? null : { ...state.value.capture_idempotency![0]!, ...corruption }];
      const reopened = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW },
        persistence: { ...state.value, capture_idempotency: entries as InMemoryStoreStateV1["capture_idempotency"] } });
      expect(await reopened.readiness()).toMatchObject({ ok: false, error: { code: "JOURNAL_CORRUPT" } });
    },
  );

  it("Opus a1: logical restore preserves exact replay and content conflicts without writes", async () => {
    const open = () => createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    await assertActivityReplayAfterLogicalRestore(open(), open());
  });
  it.each(ACTIVITY_STAGES)("%s: durable reload, exact replay and isolated content conflicts write nothing", async stage => {
    let state: InMemoryStoreStateV1 | undefined;
    await assertActivityReplayAtStage(async () => {
      const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW }, persistence: state });
      const close = store.close.bind(store);
      store.close = async () => {
        const exported = store.exportStateForPersistence();
        if (exported.ok) state = exported.value;
        return close();
      };
      return store;
    }, stage);
  });

  it("accepts a conforming V1 commitPending direct receipt without optional X1 methods", async () => {
    const h = activityHarness();
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    // A V1 implementer returns the canonical receipt itself, never a wrapper.
    const commit = store.commitPending.bind(store);
    store.commitPending = async input => {
      const result = await commit(input);
      if (!result.ok) return result;
      const value = result.value as unknown as Record<string, unknown>;
      return { ok: true, value: (value.receipt ?? value) as never };
    };
    Object.defineProperty(store, "readCaptureIdempotency", { value: undefined });
    Object.defineProperty(store, "recordCaptureIdempotency", { value: undefined });
    const memory = h.build(store);
    // Exercise ordinary capture; the original store contract remains usable.
    const evidence = (await h.source.read({ limit: 1, deadline_at: h.request.deadline_at, cancellation_ref: h.request.cancellation_ref }));
    if (!evidence.ok) throw new Error("fixture failed");
    const e = evidence.value.evidence[0]!;
    const result = await memory.capture({ schema_version: 2, idempotency_key: "capture:legacy-v1", source_order: { source_ref: "source:legacy", sequence: "1" },
      payload: { schema_version: 2, scope_ref: h.request.scope_ref, purpose_ref: h.request.purpose_ref, retention: h.request.retention, reconciliation: h.request.reconciliation,
        valid_time: e.valid_time, components: e.components, primary_component_id: e.primary_component_id, primary_event: e.primary_event, citations: e.citations },
      evidence: { evidence_ref: e.evidence_id, evidence_digest: e.evidence_digest, citation_ids: ["citation:a", "citation:b", "citation:c"] },
      authorization: h.request.authorization, deadline_at: h.request.deadline_at, cancellation_ref: h.request.cancellation_ref });
    expect(result).toMatchObject({ ok: true, value: { status: "committed_pending", cursor: "1" } });
  });
});

describe("X1 failure and authority boundaries", () => {
  it("a checkpoint pins registry entries to its cursor and recovery preserves later entries through the tail", async () => {
    const h = activityHarness();
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    const memory = h.build(store);
    const first = await memory.ingestActivity(h.request);
    if (!first.ok) throw new Error(JSON.stringify(first));
    const checkpoint = store.exportCheckpointForRecovery("1");
    if (!checkpoint.ok) throw new Error(JSON.stringify(checkpoint));
    h.setEvidence(activityEvidence("ev:tail"));
    const second = await memory.ingestActivity(h.request);
    if (!second.ok) throw new Error(JSON.stringify(second));
    const candidate_id = second.value.items[0]!.candidate_id;
    const pinned = store.exportCheckpointForRecovery("1");
    if (!pinned.ok) throw new Error(JSON.stringify(pinned));
    expect(pinned.value.capture_idempotency?.map(e => e.candidate_id)).toEqual([first.value.items[0]!.candidate_id]);
    expect((await memory.requestAdmission({ candidate_id, authorization: h.request.authorization, deadline_at: h.request.deadline_at })).ok).toBe(true);
    const tail = store.exportTailForRecovery("1");
    if (!tail.ok) throw new Error(JSON.stringify(tail));
    const recovered = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW }, recovery: { checkpoint: checkpoint.value, tail: tail.value } });
    const writes = { ...h.writes };
    h.advanceClock();
    expect(await h.build(recovered).ingestActivity(h.request)).toMatchObject({ ok: true, value: { items: [{ ...second.value.items[0], status: "duplicate_exact" }] } });
    expect(h.writes).toEqual(writes);
  });

  it("concurrent direct V1 commits compare content before the first receipt has resolved", async () => {
    const h = activityHarness();
    const seed = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    expect((await h.build(seed).ingestActivity(h.request)).ok).toBe(true);
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    const input = h.commits[0]!;
    const [first, modified] = await Promise.all([
      store.commitPending(input),
      store.commitPending({ ...input, control: { ...input.control, capture_content_digest: DIGEST_B } }),
    ]);
    expect(first.ok).toBe(true);
    expect(modified).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT", operation: "capture" } });
    const journal = await store.readJournal({ after: "0", limit: 10 });
    expect(journal.ok && journal.value.length).toBe(1);
  });

  it("each identity member distinguishes captures in one shared store", async () => {
    const h = activityHarness();
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    const memory = h.build(store);
    const keys: string[] = [];
    const ids: string[] = [];
    for (const field of ["baseline", "sequence", "evidence_id", "source_id"]) {
      const evidence = activityEvidence();
      if (field === "sequence") evidence.sequence = "2";
      if (field === "evidence_id") evidence.evidence_id = "ev:other";
      h.setEvidence(evidence);
      if (field === "source_id") {
        Object.assign(h.source, { source_id: "source:matrix-b" });
        h.request.source_id = "source:matrix-b";
      }
      const result = await memory.ingestActivity(h.request);
      expect(result.ok, field).toBe(true);
      if (!result.ok) throw new Error(JSON.stringify(result));
      ids.push(result.value.items[0]!.candidate_id);
      const key = h.commits.at(-1)!.capture_event.event_id;
      keys.push(key);
      expect(key, field).toBe(`activity:${receiptDigest("activity-idempotency", {
        source_id: h.request.source_id, sequence: evidence.sequence, evidence_id: evidence.evidence_id,
      }).slice("sha256:".length)}`);
    }
    expect(new Set(ids).size).toBe(4);
    expect(new Set(keys).size).toBe(4);
  });

  it("a partially ingested page stops on failure and retries its durable prefix without rewriting it", async () => {
    const h = activityHarness();
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    let page = [activityEvidence("ev:one"), activityEvidence("ev:two"), activityEvidence("ev:three")];
    page[1]!.components[0]!.text = ""; // invalid capture, after the first durable item
    const reads: unknown[] = [];
    h.source.read = async input => { reads.push(input); return { ok: true, value: {
      source_id: h.source.source_id, source_version: "1", evidence: page, next_after: "3", page_digest: PAGE_DIGEST,
    } }; };
    const request = { ...h.request, after: "0", valid_window: { t: 1 } };
    expect(await h.build(store).ingestActivity(request)).toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA", operation: "capture" } });
    expect(h.writes.seal).toBe(1);
    expect(h.writes.commit).toBe(1);
    const firstPlaintext = [...h.plaintext][0]!;
    page = [activityEvidence("ev:one"), activityEvidence("ev:two"), activityEvidence("ev:three")];
    h.advanceClock();
    const result = await h.build(store).ingestActivity(request);
    expect(result).toMatchObject({ ok: true, value: { next_after: "3", items: [
      { status: "duplicate_exact", cursor: "1" }, { status: "committed_pending", cursor: "2" }, { status: "committed_pending", cursor: "3" },
    ] } });
    expect(h.writes.seal).toBe(3);
    expect(h.writes.commit).toBe(3);
    expect(h.plaintext.get(firstPlaintext[0])).toBe(firstPlaintext[1]);
    expect(reads).toEqual([1, 2].map(() => ({ after: "0", limit: request.limit, valid_window: { t: 1 }, deadline_at: request.deadline_at, cancellation_ref: request.cancellation_ref })));
  });

  it.each(["throw", "typed error"])("a registry read %s never falls through to sealing", async mode => {
    const h = activityHarness();
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    const memory = h.build(store);
    store.readCaptureIdempotency = async () => {
      if (mode === "throw") throw new Error("registry unavailable");
      return { ok: false, error: { code: "STORE_UNAVAILABLE", operation: "capture", message: "unavailable", retryable: false } };
    };
    const result = await memory.ingestActivity(h.request);
    expect(result.ok).toBe(false);
    expect(h.writes).toEqual({ seal: 0, commit: 0, registry: 0 });
  });

  it.each(["pending", "accepted"])("interrupted acknowledgement recording at %s still replays without any write", async stage => {
    const h = activityHarness();
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    store.recordCaptureIdempotency = async () => { throw new Error("interrupted completion"); };
    let memory = h.build(store);
    const first = await memory.ingestActivity(h.request);
    if (!first.ok) throw new Error(JSON.stringify(first));
    if (stage === "accepted") {
      const admitted = await memory.requestAdmission({ candidate_id: first.value.items[0]!.candidate_id, authorization: h.request.authorization, deadline_at: h.request.deadline_at });
      expect(admitted.ok).toBe(true);
      expect(h.plaintext.size).toBe(0);
    }
    h.advanceClock();
    memory = h.build(store);
    const writes = { ...h.writes };
    const replay = await memory.ingestActivity(h.request);
    expect(replay).toMatchObject({ ok: true, value: { items: [{ ...first.value.items[0], status: "duplicate_exact" }] } });
    const changed = activityEvidence(); changed.evidence_digest = DIGEST_B;
    h.setEvidence(changed);
    memory = h.build(store);
    expect(await memory.ingestActivity(h.request)).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT" } });
    expect(h.writes).toEqual(writes);
  });

  it("two fresh ports racing with different content have one winner before any losing seal", async () => {
    const a = activityHarness();
    const changed = activityEvidence(); changed.components[0]!.text = "competing content";
    const b = activityHarness(changed);
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    const [one, two] = await Promise.all([a.build(store).ingestActivity(a.request), b.build(store).ingestActivity(b.request)]);
    expect([one, two].filter(r => r.ok)).toHaveLength(1);
    expect([one, two].find(r => !r.ok)).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT" } });
    expect(a.writes.seal + b.writes.seal).toBe(1);
  });

  it("a source injecting admission and host carriers still yields only an ordinary pending host capture", async () => {
    const forged = { ...activityEvidence(), state: "accepted_current", admission: { decision: "accept" },
      scope_ref: "scope:source", purpose_ref: "purpose:source", retention: { derivative_rule: "make-ineligible" }, reconciliation: { family_refs: ["family:source"] } };
    const h = activityHarness(forged);
    const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => ACTIVITY_NOW } });
    const result = await h.build(store).ingestActivity(h.request);
    expect(result.ok).toBe(true);
    const envelope = JSON.parse([...h.plaintext.values()][0]!);
    for (const field of ["scope_ref", "purpose_ref", "retention", "reconciliation"] as const) expect(envelope.payload[field]).toEqual(h.request[field]);
    expect(envelope.payload).not.toHaveProperty("subject_ref");
    expect(envelope.payload).not.toHaveProperty("state");
    const journal = await store.readJournal({ after: "0", limit: 10 });
    expect(journal.ok && journal.value.map(e => [e.operation, e.to_state])).toEqual([["capture", "pending"]]);
  });
});

const FULL_ALLOWLIST = [
  "/authorization_receipt_digest", "/citations", "/components", "/derivation", "/payload_digest",
  "/primary_component_id", "/primary_event", "/purpose_ref", "/reconciliation", "/record_digest",
  "/record_id", "/recorded_at", "/recorded_cursor", "/retention", "/schema_version", "/scope_ref",
  "/trust", "/valid_time",
];

function makeEvidence(overrides: Partial<ActivityEvidenceV1> & { evidence_id: string; sequence: string }): ActivityEvidenceV1 {
  const tag = overrides.evidence_id;
  return {
    evidence_id: overrides.evidence_id,
    subject_ref: "subject:x1",
    sequence: overrides.sequence,
    valid_time: { t: 1 },
    components: [{ component_id: `component:${tag}`, kind: "context", text: `body ${tag}`, citation_ids: [`citation:${tag}`] }],
    primary_component_id: `component:${tag}`,
    primary_event: { at: 1, type_ref: "event:x1", citation_id: `citation:${tag}` },
    citations: [{
      citation_id: `citation:${tag}`,
      source_ref: "source:x1",
      locator: { scheme: "document", value: `x1#${tag}` },
      content_digest: DIGEST,
    }],
    evidence_digest: DIGEST,
    ...overrides,
  };
}

interface SourceHarness {
  source: {
    source_id: string;
    source_version: string;
    read: (request: unknown) => Promise<{ ok: true; value: unknown }>;
    cancel: () => Promise<{ ok: true; value: { cancelled: boolean } }>;
  };
  calls: unknown[];
}

function activitySource(sourceId: string, evidences: ActivityEvidenceV1[]): SourceHarness {
  const calls: unknown[] = [];
  return {
    calls,
    source: {
      source_id: sourceId,
      source_version: "7",
      async read(request: unknown) {
        calls.push(request);
        return {
          ok: true as const,
          value: {
            source_id: sourceId,
            source_version: "7",
            evidence: evidences,
            next_after: "2",
            page_digest: PAGE_DIGEST,
          },
        };
      },
      async cancel() {
        return { ok: true as const, value: { cancelled: true } };
      },
    },
  };
}

function createX1Memory(sources: unknown[]): { memory: MemoryPortV2; store: CanonicalMemoryStorePort } {
  const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
  const authorization = {
    version: 1 as const,
    async authorize(request: { operation: string; resource_digest: Digest }) {
      const body = {
        allowed: true as const,
        decision_id: "decision:x1",
        policy_version: "1",
        operation: request.operation,
        resource_digest: request.resource_digest,
        scope_ref: SCOPE,
        not_before: NOW,
        expires_at: DEADLINE,
        revocation_epoch: "0",
        redaction: { mode: "field-allowlist" as const, allowed_fields: FULL_ALLOWLIST, allow_derivation_lineage: false, max_packet_bytes: 1_048_576 },
        authentication_receipt_digest: DIGEST,
      };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("authorization-allowed", body) } };
    },
    async revalidate(receipt_digest: Digest, checked_at: string) {
      const body = { receipt_digest, checked_at, valid: true, current_revocation_epoch: "0", reason: "valid" as const };
      return { ok: true as const, value: { ...body, revalidation_receipt_digest: receiptDigest("authorization-revalidation", body, "revalidation_receipt_digest") } };
    },
    async redact() { throw new Error("unused"); },
  };
  const policy = {
    policy_id: "policy:x1",
    policy_version: "1",
    async decide(request: { record_digest: Digest }) {
      const body = { policy_id: "policy:x1", policy_version: "1", record_digest: request.record_digest, decision: "accept" as const, issued_at: NOW };
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
    activity_sources: sources,
    allow_unfenced_memory_store: true,
    clock: { now: () => NOW },
  } as unknown as MemoryEngineDependenciesV2);
  return { memory, store };
}

function ingestionRequest(sourceId: string, overrides: Record<string, unknown> = {}) {
  return {
    source_id: sourceId,
    limit: 10,
    scope_ref: SCOPE,
    purpose_ref: PURPOSE,
    retention: { derivative_rule: "retain" },
    reconciliation: { family_refs: [] },
    authorization: { credential: "credential:x1" },
    deadline_at: DEADLINE,
    cancellation_ref: "cancel:x1",
    ...overrides,
  };
}

function expectedKey(sourceId: string, sequence: string, evidenceId: string): string {
  return `activity:${receiptDigest("activity-idempotency", { source_id: sourceId, sequence, evidence_id: evidenceId }).slice("sha256:".length)}`;
}

function recallX1() {
  return {
    query: "x1",
    purpose_ref: PURPOSE,
    authorization: { credential: "credential:x1" },
    capability_policy: { minimum_channels: "lexical" as const, network: "forbid" as const },
    budgets: { max_candidates: 2000, max_results: 100, max_packet_bytes: 1_048_576, deadline_at: DEADLINE },
  };
}

describe("activity ingestion", () => {
  it("activity evidence becomes a pending capture through the injected source, idempotent per source, sequence and evidence id, and the source cannot admit", async () => {
    const first = activitySource("source:x1", [makeEvidence({ evidence_id: "ev:one", sequence: "1" }), makeEvidence({ evidence_id: "ev:two", sequence: "2" })]);
    const { memory, store } = createX1Memory([first.source]);
    const request = ingestionRequest("source:x1", { valid_window: { t: 1 } });

    const ingested = await (memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!(request);
    expect(ingested.ok).toBe(true);
    if (!ingested.ok) throw new Error("ingestion failed");
    const receipt = ingested.value as unknown as {
      source_id: string; source_version: string; page_digest: Digest; next_after?: string;
      items: Array<{ evidence_id: string; sequence: string; status: string; candidate_id: string; cursor: string }>;
      receipt_digest: Digest;
    };
    expect(receipt.source_id).toBe("source:x1");
    expect(receipt.source_version).toBe("7");
    expect(receipt.page_digest).toBe(PAGE_DIGEST);
    expect(receipt.next_after).toBe("2");
    expect(receipt.items.map((item) => [item.evidence_id, item.sequence, item.status])).toEqual([
      ["ev:one", "1", "committed_pending"],
      ["ev:two", "2", "committed_pending"],
    ]);
    const [firstId, secondId] = receipt.items.map((item) => item.candidate_id);
    expect(firstId).not.toBe(secondId);
    expect(receipt.items.map((item) => item.cursor)).toEqual(["1", "2"]);
    // The receipt digest binds the whole page outcome (kind activity-ingestion).
    expect(receipt.receipt_digest).toBe(receiptDigest("activity-ingestion", {
      source_id: receipt.source_id,
      source_version: receipt.source_version,
      page_digest: receipt.page_digest,
      next_after: receipt.next_after,
      items: receipt.items,
    }));
    // Host carriers are forwarded to the source read untouched.
    expect(first.calls).toHaveLength(1);
    expect(first.calls[0]).toMatchObject({ limit: 10, valid_window: { t: 1 }, deadline_at: DEADLINE, cancellation_ref: "cancel:x1" });

    // Rejeu exact : mêmes candidate_id, mêmes curseurs, aucun curseur alloué.
    const replayed = await (memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!(request);
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) throw new Error("replay failed");
    const replay = replayed.value as unknown as typeof receipt;
    expect(replay.items.map((item) => item.candidate_id)).toEqual([firstId, secondId]);
    expect(replay.items.map((item) => item.cursor)).toEqual(["1", "2"]);
    const water = await store.readiness();
    expect(water.ok && water.value.high_water_cursor).toBe("2");

    // Matrice de clés : chaque membre (source, séquence, id de preuve) distingue la capture.
    const other = activitySource("source:x1-b", [makeEvidence({ evidence_id: "ev:one", sequence: "1" })]);
    const keyed = createX1Memory([first.source, other.source]);
    const crossSource = await (keyed.memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!(ingestionRequest("source:x1-b"));
    expect(crossSource.ok).toBe(true);
    if (!crossSource.ok) throw new Error("cross-source ingestion failed");
    const crossItems = (crossSource.value as unknown as typeof receipt).items;
    expect(crossItems).toHaveLength(1);
    expect(crossItems[0]!.candidate_id).not.toBe(firstId);
    const sameSourceNewEvidence = activitySource("source:x1", [makeEvidence({ evidence_id: "ev:other", sequence: "1" })]);
    const keyedEvidence = createX1Memory([sameSourceNewEvidence.source]);
    const newEvidence = await (keyedEvidence.memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!(ingestionRequest("source:x1"));
    if (!newEvidence.ok) throw new Error("new-evidence ingestion failed");
    expect((newEvidence.value as unknown as typeof receipt).items[0]!.candidate_id).not.toBe(firstId);
    const sameSourceNewSequence = activitySource("source:x1", [makeEvidence({ evidence_id: "ev:one", sequence: "9" })]);
    const keyedSequence = createX1Memory([sameSourceNewSequence.source]);
    const newSequence = await (keyedSequence.memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!(ingestionRequest("source:x1"));
    if (!newSequence.ok) throw new Error("new-sequence ingestion failed");
    expect((newSequence.value as unknown as typeof receipt).items[0]!.candidate_id).not.toBe(firstId);
    // La clé d'idempotence exacte est observable via le candidate_id dérivé.
    const candidateOf = (key: string) =>
      `candidate_${receiptDigest("capture-identity", { source_ref: "source:x1", sequence: "1", idempotency_key: key }).slice("sha256:".length)}`;
    expect(firstId).toBe(candidateOf(expectedKey("source:x1", "1", "ev:one")));

    // La source ne peut pas admettre : l'item reste pending jusqu'à requestAdmission.
    const before = await memory.recall(recallX1() as never);
    expect(before.ok && (before.value as unknown as { records: unknown[] }).records).toEqual([]);
    const admitted = await memory.requestAdmission({ candidate_id: firstId!, authorization: { credential: "credential:x1" }, deadline_at: DEADLINE });
    if (!admitted.ok) throw new Error("admission failed");
    expect(admitted.ok).toBe(true);
    expect((admitted.value as unknown as { status: string }).status).toBe("accepted");
    const after = await memory.recall(recallX1() as never);
    expect(after.ok && (after.value as unknown as { records: unknown[] }).records).toHaveLength(1);

    // Gardes compactes : source inconnue, schéma inexact, limite hors borne, délai dépassé.
    await expect((memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!(ingestionRequest("source:unknown")))
      .resolves.toMatchObject({ ok: false, error: { code: "CAPABILITY_UNAVAILABLE", operation: "capture" } });
    await expect((memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!({ ...request, limit: 0 }))
      .resolves.toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA", operation: "capture" } });
    await expect((memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!({ ...request, limit: 10, unexpected: true }))
      .resolves.toMatchObject({ ok: false, error: { code: "INVALID_SCHEMA", operation: "capture" } });
    await expect((memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!({ ...request, deadline_at: NOW }))
      .resolves.toMatchObject({ ok: false, error: { code: "DEADLINE_EXCEEDED", operation: "capture" } });
  });

  it("changed evidence under the same source, sequence and evidence id is DIGEST_CONFLICT with no write", async () => {
    const baseline = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
    const harness = activitySource("source:x1", baseline);
    const { memory, store } = createX1Memory([harness.source]);
    let commits = 0;
    const rawCommit = store.commitPending.bind(store);
    store.commitPending = (async (input: Parameters<CanonicalMemoryStorePort["commitPending"]>[0]) => {
      commits += 1;
      return rawCommit(input);
    }) as CanonicalMemoryStorePort["commitPending"];

    const first = await (memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!(ingestionRequest("source:x1"));
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("baseline ingestion failed");
    expect(commits).toBe(1);
    const candidateId = ((first.value as unknown as { items: Array<{ candidate_id: string }> }).items[0] as { candidate_id: string }).candidate_id;

    // Preuve modifiée sur chaque champ porté par la capture : conflit, curseur inchangé, zéro commit.
    const mutations: Array<{ name: string; change: (evidence: ActivityEvidenceV1) => void }> = [
      { name: "text", change: (evidence) => { evidence.components[0]!.text = "rewritten body"; } },
      { name: "valid_time", change: (evidence) => { evidence.valid_time = { t: 2 }; } },
      { name: "primary_event", change: (evidence) => { evidence.primary_event = { ...evidence.primary_event, at: 2 }; } },
      { name: "citation", change: (evidence) => { evidence.citations = [{ ...evidence.citations[0]!, content_digest: DIGEST_B }]; } },
      { name: "evidence_digest", change: (evidence) => { evidence.evidence_digest = DIGEST_B; } },
    ];
    for (const mutation of mutations) {
      // La source rejoue la preuve modifiée sous la même clé.
      const mutated = makeEvidence({ evidence_id: "ev:one", sequence: "1" });
      mutation.change(mutated);
      harness.source.read = async (request: unknown) => {
        harness.calls.push(request);
        return {
          ok: true as const,
          value: { source_id: "source:x1", source_version: "7", evidence: [mutated], next_after: "1", page_digest: PAGE_DIGEST },
        };
      };
      const conflicted = await (memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!(ingestionRequest("source:x1"));
      expect(conflicted, mutation.name).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT", operation: "capture" } });
    }
    const water = await store.readiness();
    expect(water.ok && water.value.high_water_cursor).toBe("1");
    expect(commits).toBe(1);

    // subject_ref seul (evidence_digest inchangé) : contenu de capture identique, donc doublon idempotent.
    const resubjected = makeEvidence({ evidence_id: "ev:one", sequence: "1", subject_ref: "subject:other" });
    harness.source.read = (async () => ({
      ok: true as const,
      value: { source_id: "source:x1", source_version: "7", evidence: [resubjected], next_after: "1", page_digest: PAGE_DIGEST },
    })) as SourceHarness["source"]["read"];
    const resubject = await (memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!(ingestionRequest("source:x1"));
    expect(resubject.ok).toBe(true);
    if (!resubject.ok) throw new Error("resubject failed");
    const resubjectItems = (resubject.value as unknown as { items: Array<{ candidate_id: string; cursor: string }> }).items;
    expect(resubjectItems[0]!.candidate_id).toBe(candidateId);
    expect(resubjectItems[0]!.cursor).toBe("1");
    const afterWater = await store.readiness();
    expect(afterWater.ok && afterWater.value.high_water_cursor).toBe("1");
  });
});

// X1 Sol tour 2 (MAJEUR-1/2) — idempotence durable : le digest est vérifié avant
// toute écriture dans la même transaction que la réservation de la clé, et le
// rejeu exact est un no-op (zéro sceau, zéro commit) indépendant de l'horloge.
function mutableSource(sourceId: string, current: () => ActivityEvidenceV1[]) {
  const calls: unknown[] = [];
  return {
    calls,
    source: {
      source_id: sourceId,
      source_version: "7",
      async read(request: unknown) {
        calls.push(request);
        return {
          ok: true as const,
          value: {
            source_id: sourceId,
            source_version: "7",
            evidence: current(),
            next_after: "1",
            page_digest: PAGE_DIGEST,
          },
        };
      },
      async cancel() {
        return { ok: true as const, value: { cancelled: true } };
      },
    },
  };
}

interface ClockedX1 {
  memory: MemoryPortV2;
  store: CanonicalMemoryStorePort;
  crypto: { seals: string[]; plaintext: Map<string, string> };
  commits: () => number;
  seals: () => number;
  setNow: (now: string) => void;
  buildMemory: (sources: unknown[]) => MemoryPortV2;
}

function createClockedX1Memory(sources: unknown[], initialNow = NOW): ClockedX1 {
  let now = initialNow;
  let commits = 0;
  const seals: string[] = [];
  const plaintext = new Map<string, string>();
  const store = createInMemoryCanonicalMemoryStoreV1({ clock: { now: () => NOW } });
  const rawCommit = store.commitPending.bind(store);
  store.commitPending = (async (input: Parameters<CanonicalMemoryStorePort["commitPending"]>[0]) => {
    commits += 1;
    return rawCommit(input);
  }) as CanonicalMemoryStorePort["commitPending"];
  const authorization = {
    version: 1 as const,
    async authorize(request: { operation: string; resource_digest: Digest }) {
      const body = {
        allowed: true as const,
        decision_id: "decision:x1",
        policy_version: "1",
        operation: request.operation,
        resource_digest: request.resource_digest,
        scope_ref: SCOPE,
        not_before: NOW,
        expires_at: DEADLINE,
        revocation_epoch: "0",
        redaction: { mode: "field-allowlist" as const, allowed_fields: FULL_ALLOWLIST, allow_derivation_lineage: false, max_packet_bytes: 1_048_576 },
        authentication_receipt_digest: DIGEST,
      };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("authorization-allowed", body) } };
    },
    async revalidate(receipt_digest: Digest, checked_at: string) {
      const body = { receipt_digest, checked_at, valid: true, current_revocation_epoch: "0", reason: "valid" as const };
      return { ok: true as const, value: { ...body, revalidation_receipt_digest: receiptDigest("authorization-revalidation", body, "revalidation_receipt_digest") } };
    },
    async redact() { throw new Error("unused"); },
  };
  const policy = {
    policy_id: "policy:x1",
    policy_version: "1",
    async decide(request: { record_digest: Digest }) {
      const body = { policy_id: "policy:x1", policy_version: "1", record_digest: request.record_digest, decision: "accept" as const, issued_at: NOW };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("admission-decision", body) } };
    },
  };
  const crypto = {
    version: 1 as const,
    async seal(input: { candidate_id: string; plaintext: string }) {
      seals.push(input.candidate_id);
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
  const buildMemory = (activitySources: unknown[]) => createMemoryPortV2({
    canonical_store: store,
    authorization,
    admission_policy: policy,
    crypto,
    activity_sources: activitySources,
    allow_unfenced_memory_store: true,
    clock: { now: () => now },
  } as unknown as MemoryEngineDependenciesV2);
  return {
    memory: buildMemory(sources),
    store,
    crypto: { seals, plaintext },
    commits: () => commits,
    seals: () => seals.length,
    setNow: (value: string) => { now = value; },
    buildMemory,
  };
}

type EvidenceMutation = { name: string; change: (evidence: ActivityEvidenceV1) => void };

const EVERY_FIELD_MUTATIONS: EvidenceMutation[] = [
  { name: "text", change: (evidence) => { evidence.components[0]!.text = "rewritten body"; } },
  { name: "valid_time", change: (evidence) => { evidence.valid_time = { t: 2 }; } },
  {
    name: "primary_component_id",
    change: (evidence) => {
      evidence.components = [
        ...evidence.components,
        { component_id: "component:second", kind: "context", text: "second body", citation_ids: ["citation:second"] },
      ];
      evidence.citations = [
        ...evidence.citations,
        { citation_id: "citation:second", source_ref: "source:x1", locator: { scheme: "document", value: "x1#second" }, content_digest: DIGEST },
      ];
      evidence.primary_component_id = "component:second";
      evidence.primary_event = { ...evidence.primary_event, citation_id: "citation:second" };
    },
  },
  { name: "primary_event.at", change: (evidence) => { evidence.primary_event = { ...evidence.primary_event, at: 2 }; } },
  { name: "primary_event.type_ref", change: (evidence) => { evidence.primary_event = { ...evidence.primary_event, type_ref: "event:other" }; } },
  {
    name: "citation_id",
    change: (evidence) => {
      evidence.citations = [{ ...evidence.citations[0]!, citation_id: "citation:renamed" }];
      evidence.components = [{ ...evidence.components[0]!, citation_ids: ["citation:renamed"] }];
      evidence.primary_event = { ...evidence.primary_event, citation_id: "citation:renamed" };
    },
  },
  { name: "citation.content_digest", change: (evidence) => { evidence.citations = [{ ...evidence.citations[0]!, content_digest: DIGEST_B }]; } },
  { name: "citation.source_ref", change: (evidence) => { evidence.citations = [{ ...evidence.citations[0]!, source_ref: "source:other" }]; } },
  { name: "citation.locator", change: (evidence) => { evidence.citations = [{ ...evidence.citations[0]!, locator: { scheme: "document", value: "x1#moved" } }]; } },
  { name: "evidence_digest", change: (evidence) => { evidence.evidence_digest = DIGEST_B; } },
];

async function ingestOnce(memory: MemoryPortV2, sourceId = "source:x1") {
  const ingested = await (memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!(ingestionRequest(sourceId));
  if (!ingested.ok) throw new Error(`ingestion failed: ${JSON.stringify(ingested)}`);
  return ingested.value as unknown as {
    items: Array<{ evidence_id: string; sequence: string; status: string; candidate_id: string; cursor: string }>;
  };
}

async function ingestSettled(memory: MemoryPortV2, sourceId = "source:x1") {
  return (memory as unknown as Record<string, (r: unknown) => Promise<never>>).ingestActivity!(ingestionRequest(sourceId)) as Promise<
    | { ok: true; value: { items: Array<{ evidence_id: string; sequence: string; status: string; candidate_id: string; cursor: string }> } }
    | { ok: false; error: { code: string; operation: string } }
  >;
}

describe("activity ingestion durable idempotence", () => {
  it("matrice : chaque champ modifié sous la même clé = DIGEST_CONFLICT sans écriture, mutant annulé ensuite", async () => {
    let current = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
    const harness = mutableSource("source:x1", () => current);
    const env = createClockedX1Memory([harness.source]);

    const first = await ingestOnce(env.memory);
    expect(first.items[0]!.status).toBe("committed_pending");
    const candidateId = first.items[0]!.candidate_id;
    expect(env.commits()).toBe(1);
    expect(env.seals()).toBe(1);
    const baselinePlaintext = env.crypto.plaintext.get(candidateId);
    expect(baselinePlaintext).toBeDefined();

    for (const mutation of EVERY_FIELD_MUTATIONS) {
      const mutated = makeEvidence({ evidence_id: "ev:one", sequence: "1" });
      mutation.change(mutated);
      current = [mutated];
      const conflicted = await ingestSettled(env.memory);
      expect(conflicted, mutation.name).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT", operation: "capture" } });
      // Aucune écriture : ni sceau, ni commit, ni curseur, ni plaintext.
      expect(env.commits(), mutation.name).toBe(1);
      expect(env.seals(), mutation.name).toBe(1);
      const water = await env.store.readiness();
      expect(water.ok && water.value.high_water_cursor, mutation.name).toBe("1");
      expect(env.crypto.plaintext.get(candidateId), mutation.name).toBe(baselinePlaintext);

      // Mutant annulé : la source rejoue la preuve d'origine, le rejeu est un no-op enregistré.
      current = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
      const replayed = await ingestOnce(env.memory);
      expect(replayed.items[0]!.candidate_id).toBe(candidateId);
      expect(replayed.items[0]!.cursor).toBe("1");
      expect(replayed.items[0]!.status).toBe("duplicate_exact");
      expect(env.commits(), mutation.name).toBe(1);
      expect(env.seals(), mutation.name).toBe(1);
    }

    // subject_ref seul (evidence_digest inchangé) : contenu identique, doublon idempotent.
    current = [makeEvidence({ evidence_id: "ev:one", sequence: "1", subject_ref: "subject:other" })];
    const resubject = await ingestOnce(env.memory);
    expect(resubject.items[0]!.candidate_id).toBe(candidateId);
    expect(resubject.items[0]!.status).toBe("duplicate_exact");
    expect(env.commits()).toBe(1);
    expect(env.seals()).toBe(1);
  });

  it("N rejeux = 0 écriture supplémentaire, horloge injectée variable", async () => {
    const current = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
    const harness = mutableSource("source:x1", () => current);
    const env = createClockedX1Memory([harness.source]);

    const first = await ingestOnce(env.memory);
    const reference = first.items;
    expect(env.commits()).toBe(1);
    expect(env.seals()).toBe(1);

    // Rejeux à horloge fixe puis avancée : aucun ne réécrit, tous rejouent l'acquittement enregistré.
    const clocks = [NOW, NOW, "2026-08-16T12:34:57.789Z", "2026-08-16T12:35:56.789Z", "2026-08-16T12:39:56.789Z"];
    for (const at of clocks) {
      env.setNow(at);
      const replayed = await ingestOnce(env.memory);
      expect(replayed.items).toEqual(reference.map((item) => ({ ...item, status: "duplicate_exact" })));
      expect(env.commits(), at).toBe(1);
      expect(env.seals(), at).toBe(1);
    }
    const water = await env.store.readiness();
    expect(water.ok && water.value.high_water_cursor).toBe("1");
  });

  it("recréation du port sur le même store : rejeu no-op, preuve modifiée en conflit, sans écriture", async () => {
    let current = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
    const harness = mutableSource("source:x1", () => current);
    const env = createClockedX1Memory([harness.source]);

    const first = await ingestOnce(env.memory);
    const candidateId = first.items[0]!.candidate_id;
    const baselinePlaintext = env.crypto.plaintext.get(candidateId);
    const recreated = env.buildMemory([harness.source]);

    const replayed = await ingestOnce(recreated);
    expect(replayed.items[0]!.candidate_id).toBe(candidateId);
    expect(replayed.items[0]!.cursor).toBe("1");
    expect(replayed.items[0]!.status).toBe("duplicate_exact");
    expect(env.commits()).toBe(1);
    expect(env.seals()).toBe(1);

    current = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
    current[0]!.components[0]!.text = "rewritten after restart";
    current[0]!.evidence_digest = DIGEST_B;
    const conflicted = await ingestSettled(recreated);
    expect(conflicted).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT", operation: "capture" } });
    expect(env.commits()).toBe(1);
    expect(env.seals()).toBe(1);
    expect(env.crypto.plaintext.get(candidateId)).toBe(baselinePlaintext);
    const water = await env.store.readiness();
    expect(water.ok && water.value.high_water_cursor).toBe("1");
  });

  it("concurrence sur la même clé : un seul gagnant, zéro écriture surnuméraire", async () => {
    const current = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
    const harness = mutableSource("source:x1", () => current);
    const env = createClockedX1Memory([harness.source]);

    // Première ingestion concurrente du même contenu : un commit, un sceau.
    const [winner, loser] = await Promise.all([ingestSettled(env.memory), ingestSettled(env.memory)]);
    expect(winner.ok && loser.ok).toBe(true);
    if (!winner.ok || !loser.ok) throw new Error("concurrent first ingestion failed");
    const statuses = [winner.value.items[0]!.status, loser.value.items[0]!.status].sort();
    expect(statuses).toEqual(["committed_pending", "duplicate_exact"]);
    expect(winner.value.items[0]!.candidate_id).toBe(loser.value.items[0]!.candidate_id);
    expect(env.commits()).toBe(1);
    expect(env.seals()).toBe(1);

    // Deux contenus différents en concurrence depuis un port neuf : double conflit, zéro écriture.
    const recreated = env.buildMemory([harness.source]);
    const mutantA = makeEvidence({ evidence_id: "ev:one", sequence: "1" });
    mutantA.components[0]!.text = "concurrent A";
    const mutantB = makeEvidence({ evidence_id: "ev:one", sequence: "1" });
    mutantB.components[0]!.text = "concurrent B";
    let turn: ActivityEvidenceV1[] = [mutantA];
    (harness.source.read as unknown as (request: unknown) => Promise<{ ok: true; value: unknown }>) = async (request: unknown) => ({
      ok: true as const,
      value: { source_id: "source:x1", source_version: "7", evidence: turn, next_after: "1", page_digest: PAGE_DIGEST },
    });
    const race = await Promise.all([
      (async () => { turn = [mutantA]; return ingestSettled(recreated); })(),
      (async () => { turn = [mutantB]; return ingestSettled(recreated); })(),
    ]);
    for (const outcome of race) {
      expect(outcome).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT", operation: "capture" } });
    }
    expect(env.commits()).toBe(1);
    expect(env.seals()).toBe(1);
    const water = await env.store.readiness();
    expect(water.ok && water.value.high_water_cursor).toBe("1");
  });

  it("store partagé : les trois membres de la clé discriminent les collisions inter-sources", async () => {
    const sourceA = mutableSource("source:x1", () => [makeEvidence({ evidence_id: "ev:one", sequence: "1" })]);
    const sourceB = mutableSource("source:x1-b", () => [makeEvidence({ evidence_id: "ev:one", sequence: "1" })]);
    const env = createClockedX1Memory([sourceA.source, sourceB.source]);

    const fromA = await ingestOnce(env.memory, "source:x1");
    const fromB = await ingestOnce(env.memory, "source:x1-b");
    expect(fromB.items[0]!.candidate_id).not.toBe(fromA.items[0]!.candidate_id);
    expect([fromA.items[0]!.cursor, fromB.items[0]!.cursor].sort()).toEqual(["1", "2"]);
    const water = await env.store.readiness();
    expect(water.ok && water.value.high_water_cursor).toBe("2");
  });

  it("pages malformées : erreurs typées du contrat Result, zéro écriture", async () => {
    const pages: Array<{ name: string; page: unknown }> = [
      { name: "sans evidence", page: { source_id: "source:x1", source_version: "7", next_after: "1", page_digest: PAGE_DIGEST } },
      {
        name: "preuve sans citations",
        page: {
          source_id: "source:x1",
          source_version: "7",
          evidence: [{ ...makeEvidence({ evidence_id: "ev:one", sequence: "1" }), citations: undefined }],
          next_after: "1",
          page_digest: PAGE_DIGEST,
        },
      },
      {
        name: "sans source_version",
        page: {
          source_id: "source:x1",
          evidence: [makeEvidence({ evidence_id: "ev:one", sequence: "1" })],
          next_after: "1",
          page_digest: PAGE_DIGEST,
        },
      },
      {
        name: "page_digest invalide",
        page: {
          source_id: "source:x1",
          source_version: "7",
          evidence: [makeEvidence({ evidence_id: "ev:one", sequence: "1" })],
          next_after: "1",
          page_digest: "not-a-digest",
        },
      },
    ];
    for (const { name, page } of pages) {
      const source = {
        source_id: "source:x1",
        source_version: "7",
        async read() { return { ok: true as const, value: page }; },
        async cancel() { return { ok: true as const, value: { cancelled: true } }; },
      };
      const env = createClockedX1Memory([source]);
      const settled = await ingestSettled(env.memory);
      expect(settled.ok, name).toBe(false);
      if (!settled.ok) expect(settled.error.operation, name).toBe("capture");
      expect(env.commits(), name).toBe(0);
      expect(env.seals(), name).toBe(0);
    }
  });
});

// X1 Sol tour 3 (REVIEW-X1-sol2) — idempotence APRÈS ADMISSION et reçu valide :
// le registre d'idempotence survit au cycle de vie de la capture (pending puis
// admise) et à la recréation du port ; le rejeu exact rejoue le résultat
// enregistré sans écriture, la preuve modifiée est un conflit sans écriture ;
// aucun champ post-digest ne peut invalider le reçu canonique.
describe("activity ingestion after admission", () => {
  async function admitCandidate(env: ClockedX1, candidateId: string) {
    const admitted = await env.memory.requestAdmission({
      candidate_id: candidateId,
      authorization: { credential: "credential:x1" },
      deadline_at: DEADLINE,
    });
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) throw new Error("admission failed");
    expect((admitted.value as unknown as { status: string }).status).toBe("accepted");
  }

  async function highWater(env: ClockedX1): Promise<string> {
    const water = await env.store.readiness();
    expect(water.ok).toBe(true);
    if (!water.ok) throw new Error("readiness failed");
    return water.value.high_water_cursor;
  }

  it("rejeu exact après admission : résultat enregistré, zéro sceau, zéro commit", async () => {
    let current = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
    const harness = mutableSource("source:x1", () => current);
    const env = createClockedX1Memory([harness.source]);

    const first = await ingestOnce(env.memory);
    const candidateId = first.items[0]!.candidate_id;
    const cursor = first.items[0]!.cursor;
    const baselinePlaintext = env.crypto.plaintext.get(candidateId);
    await admitCandidate(env, candidateId);
    const admittedWater = await highWater(env);
    const seals = env.seals();
    const commits = env.commits();

    // Rejeu exact sur le même port : mêmes identifiants, aucune écriture.
    const replayed = await ingestOnce(env.memory);
    expect(replayed.items[0]).toMatchObject({ candidate_id: candidateId, cursor, status: "duplicate_exact" });
    expect(env.seals()).toBe(seals);
    expect(env.commits()).toBe(commits);
    expect(await highWater(env)).toBe(admittedWater);

    // Preuve modifiée sous la même clé : conflit, sans écriture ni altération.
    current = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
    current[0]!.components[0]!.text = "rewritten after admission";
    current[0]!.evidence_digest = DIGEST_B;
    const conflicted = await ingestSettled(env.memory);
    expect(conflicted).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT", operation: "capture" } });
    expect(env.seals()).toBe(seals);
    expect(env.commits()).toBe(commits);
    expect(await highWater(env)).toBe(admittedWater);
    expect(env.crypto.plaintext.get(candidateId)).toBe(baselinePlaintext);

    // Retour à la preuve d'origine : de nouveau le résultat enregistré.
    current = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
    const healed = await ingestOnce(env.memory);
    expect(healed.items[0]).toMatchObject({ candidate_id: candidateId, cursor, status: "duplicate_exact" });
    expect(env.seals()).toBe(seals);
    expect(env.commits()).toBe(commits);
  });

  it("port recréé après admission : rejeu no-op, preuve modifiée en conflit, sans écriture", async () => {
    let current = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
    const harness = mutableSource("source:x1", () => current);
    const env = createClockedX1Memory([harness.source]);

    const first = await ingestOnce(env.memory);
    const candidateId = first.items[0]!.candidate_id;
    const cursor = first.items[0]!.cursor;
    const baselinePlaintext = env.crypto.plaintext.get(candidateId);
    await admitCandidate(env, candidateId);
    const admittedWater = await highWater(env);
    const seals = env.seals();
    const commits = env.commits();
    const recreated = env.buildMemory([harness.source]);

    const replayed = await ingestOnce(recreated);
    expect(replayed.items[0]).toMatchObject({ candidate_id: candidateId, cursor, status: "duplicate_exact" });
    expect(env.seals()).toBe(seals);
    expect(env.commits()).toBe(commits);
    expect(await highWater(env)).toBe(admittedWater);

    current = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
    current[0]!.components[0]!.text = "rewritten after restart";
    current[0]!.evidence_digest = DIGEST_B;
    const conflicted = await ingestSettled(recreated);
    expect(conflicted).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT", operation: "capture" } });
    expect(env.seals()).toBe(seals);
    expect(env.commits()).toBe(commits);
    expect(await highWater(env)).toBe(admittedWater);
    expect(env.crypto.plaintext.get(candidateId)).toBe(baselinePlaintext);
  });

  it("reçus de capture : digest canonique valide sur première capture et doublon, conflit sans écriture", async () => {
    const current = [makeEvidence({ evidence_id: "ev:one", sequence: "1" })];
    const harness = mutableSource("source:x1", () => current);
    const env = createClockedX1Memory([harness.source]);

    type CommitInput = Parameters<CanonicalMemoryStorePort["commitPending"]>[0];
    const inputs: CommitInput[] = [];
    const rawCommit = env.store.commitPending.bind(env.store);
    env.store.commitPending = (async (input: CommitInput) => {
      inputs.push(input);
      return rawCommit(input);
    }) as CanonicalMemoryStorePort["commitPending"];
    const expectValidReceipt = (value: unknown, path: string) => {
      const body = value as Record<string, unknown> & { receipt_digest: Digest; cursor: string };
      expect(body.receipt_digest, path).toBe(receiptDigest("canonical-transaction", body));
      expect(body, path).not.toHaveProperty("outcome");
      expect(body, path).not.toHaveProperty("receipt");
      return body;
    };

    // Première capture : le reçu direct conserve son digest D5.
    const first = await ingestOnce(env.memory);
    expect(first.items[0]!.status).toBe("committed_pending");
    expect(inputs).toHaveLength(1);
    const before = await env.store.commitPending(inputs[0]!);
    expect(before.ok).toBe(true);
    if (!before.ok) throw new Error("first receipt unavailable");
    const firstBody = expectValidReceipt(before.value, "first");
    expect(firstBody.cursor).toBe(first.items[0]!.cursor);

    // Doublon exact rejoué au store : même curseur, reçu direct valide.
    const second = await env.store.commitPending(inputs[0]!);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("duplicate receipt unavailable");
    const secondBody = expectValidReceipt(second.value, "duplicate");
    expect(secondBody.cursor).toBe(firstBody.cursor);
    expect(await highWater(env)).toBe(firstBody.cursor);

    // Contenu altéré sous la même clé : conflit, curseur inchangé.
    const tampered: CommitInput = {
      ...inputs[0]!,
      control: { ...inputs[0]!.control, capture_content_digest: DIGEST_B },
    };
    const conflicted = await env.store.commitPending(tampered);
    expect(conflicted).toMatchObject({ ok: false, error: { code: "DIGEST_CONFLICT", operation: "capture" } });
    expect(await highWater(env)).toBe(firstBody.cursor);
  });
});
