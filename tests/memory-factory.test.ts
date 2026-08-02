/**
 * Agent-memory factory cabling (SPEC_AGENT_MEMORY_SUBSTRATE §9.4/§5). This binds
 * the ctx-carrying ports (MemoryProducerPort / MemoryRecallPort) to their concrete
 * graphify impls (memory-admission, memory-recall) AND the REAL storage D5 append
 * port (GraphStore.appendNode/appendTombstone, capabilities.append v1).
 *
 * This module is graphify-INTERNAL glue: h2a imports only the data-pure PORT types,
 * never this factory, so it may import storage + admission freely (anti-cycle holds
 * — no h2a import). Verified at build: `grep h2a src/memory-factory.ts` is empty.
 *
 * Each behaviour is encoded RED-first (a passing case AND a refusing/absent case).
 * Deterministic, offline, no LLM.
 */
import { describe, expect, it, vi } from "vitest";

import {
  createMemoryProducer,
  createMemoryRecall,
  createMemoryPort,
  type MemoryAppendStore,
} from "../src/memory-factory.js";
import type { MemoryNoteInput } from "../src/memory-producer-port.js";

const OWNER = "human:antoinefa";
const T = 1_750_000_000_000;
const SOURCE_TEXT = "on 2026-08-01 correction Y was applied because Z";

/** A store fake declaring the D5 append capability with real (spy) methods. */
function appendStore(over: Partial<MemoryAppendStore> = {}): MemoryAppendStore {
  return {
    capabilities: { append: { version: 1, upsert: true, requiresExistingEndpoints: true, tombstone: true } },
    appendNode: vi.fn(async () => ({ created: true })),
    appendTombstone: vi.fn(async () => ({ applied: true })),
    ...over,
  } as MemoryAppendStore;
}

function note(over: Partial<MemoryNoteInput> = {}): MemoryNoteInput {
  return {
    node_type: "MemoryNote",
    memory_kind: "decision",
    subject: "agent-work",
    t: T,
    t_src: "authored-at",
    event: { at: T, kind: "decision-taken", ref: "ref:A" },
    provenance: { cited: "correction Y was applied", source: "ref:A" },
    principal_owner: OWNER,
    scope: "private",
    ...over,
  };
}

const resolveSource = (ref: string) => (ref === "ref:A" ? SOURCE_TEXT : null);
const ctx = { principal_owner: OWNER };

describe("createMemoryProducer — admit cabled to the real storage append port (§5)", () => {
  it("admits a well-formed note and appends it through store.appendNode once", async () => {
    const store = appendStore();
    const producer = createMemoryProducer({ store, resolveSource });
    const out = await producer.admitMemoryNote(note(), ctx);
    expect(out.admitted).toBe(true);
    expect(store.appendNode).toHaveBeenCalledTimes(1);
    // the appended node carries the fixed admission stamps
    const appended = (store.appendNode as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(appended.trust).toBe("asserted");
    expect(appended.review_status).toBe("pending");
    expect(appended.reconcilable).toBe(false);
  });

  it("REFUSES a cross-tenant write: ctx principal != note principal, appends nothing (§3.6)", async () => {
    const store = appendStore();
    const producer = createMemoryProducer({ store, resolveSource });
    const out = await producer.admitMemoryNote(note({ principal_owner: "human:someone-else" }), ctx);
    expect(out.admitted).toBe(false);
    expect(store.appendNode).not.toHaveBeenCalled();
  });

  it("refuses to CABLE a store without the D5 append capability (M4: omit-entirely, never a no-op)", () => {
    const noCap = appendStore({ capabilities: { append: undefined } });
    expect(() => createMemoryProducer({ store: noCap, resolveSource })).toThrow(/append/i);
    const noMethod = appendStore({ appendTombstone: undefined });
    expect(() => createMemoryProducer({ store: noMethod, resolveSource })).toThrow();
  });
});

describe("createMemoryProducer — tombstone authority cabled to storage (§3.5)", () => {
  it("owner erasure appends a tombstone through storage", async () => {
    const store = appendStore();
    const producer = createMemoryProducer({ store, resolveSource });
    const out = await producer.requestTombstone(
      { kind: "node", id: "mem:x" },
      { requester: OWNER },
      ctx,
    );
    expect(out.applied).toBe(true);
    expect(store.appendTombstone).toHaveBeenCalledTimes(1);
  });

  it("non-owner erasure is refused and appends nothing", async () => {
    const store = appendStore();
    const producer = createMemoryProducer({ store, resolveSource });
    const out = await producer.requestTombstone(
      { kind: "node", id: "mem:x" },
      { requester: "human:someone-else" },
      ctx,
    );
    expect(out.applied).toBe(false);
    expect(store.appendTombstone).not.toHaveBeenCalled();
  });
});

describe("createMemoryProducer — promoteNote (D11) is honestly not-yet-cabled (§9.3)", () => {
  it("returns a discriminated {promoted:false, reason}, never a fabricated promotion", async () => {
    const store = appendStore();
    const producer = createMemoryProducer({ store, resolveSource });
    const out = await producer.promoteNote(
      "mem:x",
      { leg1_verdict_ref: "a", leg2_verdict_ref: "b", independence_attestation: "c" },
      ctx,
    );
    expect(out.promoted).toBe(false);
    if (!out.promoted) expect(out.reason).toMatch(/D11|orchestration/i);
  });
});

describe("createMemoryRecall — recall cabled to a read source (§3.3.3/§7)", () => {
  const recalled = (over = {}) => ({
    id: "mem:a",
    node_type: "MemoryNote",
    memory_kind: "decision",
    subject: "agent-work",
    t: T,
    trust: "asserted",
    review_status: "pending",
    scope: "private",
    principal_owner: OWNER,
    provenance: { cited: "x", source: "ref:A" },
    event: { at: T, kind: "k", ref: "ref:A" },
    ...over,
  });

  it("loads the graph + tombstones and projects notes-only with freshness disclosed", async () => {
    const loadGraph = vi.fn(async () => ({ nodes: [recalled()] }));
    const recall = createMemoryRecall({ loadGraph });
    const out = await recall.recallMemory({ asOf: T }, ctx);
    expect(out.projection).toBe("notes-only");
    expect(out.freshness).toBe("unverified");
    expect(out.unpaged).toBe(true);
    expect(out.notes.map((n) => n.id)).toEqual(["mem:a"]);
    expect(loadGraph).toHaveBeenCalledTimes(1);
  });

  it("folds a tombstoned note out end-to-end (§3.5)", async () => {
    const loadGraph = async () => ({ nodes: [recalled({ id: "mem:keep" }), recalled({ id: "mem:erased" })] });
    const loadTombstones = async () => [{ target: { kind: "node" as const, id: "mem:erased" }, principal_owner: OWNER }];
    const recall = createMemoryRecall({ loadGraph, loadTombstones });
    const out = await recall.recallMemory({ asOf: T }, ctx);
    expect(out.notes.map((n) => n.id)).toEqual(["mem:keep"]);
  });
});

describe("createMemoryPort — the whole port cabled (write + read)", () => {
  it("composes producer + recall behind ONE surface", async () => {
    const store = appendStore();
    const port = createMemoryPort({ store, resolveSource, loadGraph: async () => ({ nodes: [] }) });
    expect((await port.admitMemoryNote(note(), ctx)).admitted).toBe(true);
    expect((await port.recallMemory({ asOf: T }, ctx)).notes).toEqual([]);
  });
});
