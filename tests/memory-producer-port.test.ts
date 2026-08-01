/**
 * The agent-memory PRODUCER PORT — the anti-cycle seam (§9.4, ratified contract
 * SPEC_AGENT_MEMORY_SUBSTRATE). This is the STABLE signature surface h2a imports
 * to dispatch a note into graphify's admission gate: h2a imports ONLY these types
 * + method shapes and never graphify internals; graphify never imports h2a.
 *
 * The module is DATA-PURE (imports nothing) so a consumer drags in zero graphify
 * runtime. It carries the shared STRUCTURAL shape contract (`validateMemoryNoteShape`)
 * that h2a can run as a local pre-flight before dispatch — the same schema/enum,
 * subject, event-anchor, tenancy and retention checks the gate enforces, MINUS the
 * `verifyVerbatim` citation (which needs source resolution = graphify-internal).
 *
 * Each predicate is encoded RED-first (accept + reject), so a removed check fails
 * its test. Deterministic, offline, no LLM, no h2a import (anti-cycle).
 */
import { describe, expect, it } from "vitest";

import {
  MEMORY_PRODUCER_PORT_VERSION,
  validateMemoryNoteShape,
  type MemoryProducerPort,
  type MemoryRecallPort,
  type MemoryPort,
  type MemoryRecallResultView,
  type MemoryNoteInput,
} from "../src/memory-producer-port.js";

const T = 1_750_000_000_000;

function note(over: Partial<MemoryNoteInput> = {}): MemoryNoteInput {
  return {
    node_type: "MemoryNote",
    memory_kind: "decision",
    subject: "agent-work",
    t: T,
    t_src: "authored-at",
    event: { at: T, kind: "decision-taken", ref: "ref:A" },
    provenance: { cited: "correction Y was applied", source: "ref:A" },
    principal_owner: "human:antoinefa",
    scope: "private",
    ...over,
  };
}

describe("memory producer port — versioned capability (M4)", () => {
  it("declares a numeric version (mirrors the M4 versioned append capability)", () => {
    expect(MEMORY_PRODUCER_PORT_VERSION).toBe(1);
  });
});

describe("validateMemoryNoteShape — the shared structural contract (§3.1/§3.3/§3.6/§3.5)", () => {
  it("accepts a well-formed agent-work note", () => {
    expect(validateMemoryNoteShape(note())).toEqual({ ok: true });
  });

  it("accepts a well-formed human-subject note carrying purpose + retention", () => {
    const out = validateMemoryNoteShape(
      note({ subject: "human:antoinefa", memory_kind: "context", purpose: "self-contained requests", retention: T + 1 }),
    );
    expect(out).toEqual({ ok: true });
  });

  it("rejects a wrong node_type", () => {
    const out = validateMemoryNoteShape(note({ node_type: "Agent" as never }));
    expect(out.ok).toBe(false);
  });

  it("rejects a memory_kind outside the closed enum", () => {
    expect(validateMemoryNoteShape(note({ memory_kind: "persona" as never })).ok).toBe(false);
  });

  it("rejects a persona/identity subject (not agent-work | human:<id>)", () => {
    for (const bad of ["persona", "voice:calm", "identity", "the agent"]) {
      expect(validateMemoryNoteShape(note({ subject: bad })).ok).toBe(false);
    }
  });

  it("rejects a non-anchored event (structural event_shaped): no at, non-numeric at, missing kind/ref", () => {
    const noEvent = note();
    delete (noEvent as { event?: unknown }).event;
    expect(validateMemoryNoteShape(noEvent).ok).toBe(false);
    expect(validateMemoryNoteShape(note({ event: { kind: "k", ref: "ref:A" } as never })).ok).toBe(false);
    expect(validateMemoryNoteShape(note({ event: { at: "always" as never, kind: "k", ref: "ref:A" } })).ok).toBe(false);
    expect(validateMemoryNoteShape(note({ event: { at: T, kind: "", ref: "ref:A" } })).ok).toBe(false);
    expect(validateMemoryNoteShape(note({ event: { at: T, kind: "k", ref: "" } })).ok).toBe(false);
  });

  it("rejects missing principal_owner or an invalid scope (§3.6)", () => {
    expect(validateMemoryNoteShape(note({ principal_owner: "" })).ok).toBe(false);
    expect(validateMemoryNoteShape(note({ scope: "public" as never })).ok).toBe(false);
  });

  it("rejects a human-subject note missing purpose or retention (§3.5)", () => {
    expect(validateMemoryNoteShape(note({ subject: "human:antoinefa", retention: T + 1 })).ok).toBe(false);
    expect(validateMemoryNoteShape(note({ subject: "human:antoinefa", purpose: "p" })).ok).toBe(false);
  });

  it("rejects a missing/ill-typed provenance shape (still NOT verifyVerbatim — shape only)", () => {
    const noProv = note();
    delete (noProv as { provenance?: unknown }).provenance;
    expect(validateMemoryNoteShape(noProv).ok).toBe(false);
    expect(validateMemoryNoteShape(note({ provenance: { cited: "x" } as never })).ok).toBe(false);
  });

  it("returns a reason string on rejection (so a caller can act)", () => {
    const out = validateMemoryNoteShape(note({ subject: "persona" }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(typeof out.reason).toBe("string");
  });
});

describe("MemoryProducerPort — the three entry points a consumer codes against (§9.4)", () => {
  it("a consumer can implement the port; each method yields its discriminated outcome", async () => {
    // This stub stands in for h2a's consumer: it depends ONLY on the port types.
    const consumer: MemoryProducerPort = {
      async admitMemoryNote() {
        return { admitted: true, id: "mem:x" };
      },
      async promoteNote() {
        return { promoted: false, reason: "awaiting the D11 double-consensus artefacts" };
      },
      async requestTombstone() {
        return { applied: false, reason: "erasure requires the principal_owner" };
      },
    };

    const ctx = { principal_owner: "human:antoinefa" };
    const admit = await consumer.admitMemoryNote(note(), ctx);
    expect(admit.admitted).toBe(true);
    const promote = await consumer.promoteNote(
      "mem:x",
      { leg1_verdict_ref: "a", leg2_verdict_ref: "b", independence_attestation: "c" },
      ctx,
    );
    expect(promote.promoted).toBe(false);
    const tomb = await consumer.requestTombstone(
      { kind: "node", id: "mem:x" },
      { requester: "human:someone-else" },
      ctx,
    );
    expect(tomb.applied).toBe(false);
  });
});

describe("MemoryRecallPort — the read-side wake-recall surface (§3.3.3/§7)", () => {
  const view: MemoryRecallResultView = {
    schema: "graphify.memory-recall/v1",
    notes: [],
    projection: "notes-only",
    requestingPrincipal: "human:antoinefa",
    freshness: "unverified",
    unpaged: true,
  };

  it("a consumer can implement the recall port; the projection discloses notes-only + freshness", async () => {
    const consumer: MemoryRecallPort = {
      async recallMemory() {
        return view;
      },
    };
    const out = await consumer.recallMemory({ asOf: T }, { principal_owner: "human:antoinefa" });
    // projection prohibition disclosed structurally, and the T6 no-truncation contract.
    expect(out.projection).toBe("notes-only");
    expect(out.freshness).toBe("unverified");
    expect(out.unpaged).toBe(true);
  });

  it("a consumer can depend on the combined MemoryPort (write-side + read-side)", async () => {
    const port: MemoryPort = {
      async admitMemoryNote() {
        return { admitted: true, id: "mem:x" };
      },
      async promoteNote() {
        return { promoted: false, reason: "awaiting the D11 double-consensus artefacts" };
      },
      async requestTombstone() {
        return { applied: false };
      },
      async recallMemory() {
        return view;
      },
    };
    const ctx = { principal_owner: "human:antoinefa" };
    // Both sides reachable through one imported surface (data-pure, anti-cycle).
    expect((await port.recallMemory({ window: { sinceMs: null, untilMs: T } }, ctx)).notes).toEqual([]);
    expect((await port.admitMemoryNote(note(), ctx)).admitted).toBe(true);
  });
});
