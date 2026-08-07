/**
 * `graphify memory admit|recall` runner (operational slice item-3b). The store,
 * resolveSource and clock are injected, so these run offline against a mutable
 * fake operational store — admit writes, recall reads it back, a bad note is
 * refused. Deterministic, no LLM, no network.
 */
import { describe, expect, it, vi } from "vitest";

import { runMemoryAdmit, runMemoryRecall } from "../src/memory-cli.js";
import type { MemoryOperationalStore } from "../src/memory-factory.js";
import type { MemoryNoteInput } from "../src/memory-producer-port.js";

const OWNER = "human:antoinefa";
const T = 1_750_000_000_000;
const SOURCE_TEXT = "on 2026-08-01 correction Y was applied because Z";
const resolveSource = (ref: string) => (ref === "ref:A" ? SOURCE_TEXT : null);
const ctx = { principal_owner: OWNER };

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

function operationalStore() {
  const stored: Record<string, unknown>[] = [];
  const store = {
    capabilities: {
      append: { version: 1, upsert: true, requiresExistingEndpoints: true, tombstone: true },
      readback: { version: 1, tombstoneFolded: true },
    },
    appendNode: vi.fn(async (n: Record<string, unknown>) => {
      const i = stored.findIndex((s) => s.id === n.id);
      if (i >= 0) { stored[i] = n; return { created: false }; }
      stored.push(n);
      return { created: true };
    }),
    appendTombstone: vi.fn(async () => ({ applied: true })),
    loadNode: vi.fn(async (id: string) => stored.find((n) => n.id === id) ?? null),
    listMemoryNotes: vi.fn(async () => stored.filter((n) => n.node_type === "MemoryNote")),
    loadTombstones: vi.fn(async () => []),
  };
  return { store: store as unknown as MemoryOperationalStore, stored };
}

describe("runMemoryAdmit / runMemoryRecall — the graphify memory CLI runner", () => {
  it("admits a well-formed note and round-trips it back through recall", async () => {
    const { store } = operationalStore();
    const admit = await runMemoryAdmit(note(), ctx, { store, resolveSource });
    expect(admit.ok).toBe(true);
    expect(admit.text).toMatch(/^admitted mem:[0-9a-f]+ \(review_status: pending\)$/);
    expect((admit.json as { admitted: boolean }).admitted).toBe(true);

    const recall = await runMemoryRecall({ asOf: T }, ctx, { store, resolveSource });
    expect(recall.ok).toBe(true);
    expect(recall.text).toContain("[decision]");
    expect(recall.text).toContain("trust=asserted");
    expect(recall.text).toContain("review=pending");
    expect((recall.json as { notes: unknown[] }).notes).toHaveLength(1);
  });

  it("refuses a malformed note (bad memory_kind) with ok:false and stores nothing", async () => {
    const { store, stored } = operationalStore();
    const out = await runMemoryAdmit(note({ memory_kind: "persona" as never }), ctx, { store, resolveSource });
    expect(out.ok).toBe(false);
    expect(out.text).toMatch(/^refused: /);
    expect(stored).toHaveLength(0);
  });

  it("recall with no matching notes reports the empty projection honestly", async () => {
    const { store } = operationalStore();
    const recall = await runMemoryRecall({ asOf: T }, ctx, { store, resolveSource });
    expect(recall.text).toBe("(no notes recalled)");
    expect((recall.json as { projection: string }).projection).toBe("notes-only");
  });
});
