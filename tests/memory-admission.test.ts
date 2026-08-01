/**
 * The agent-memory ADMISSION GATE (ratified contract SPEC_AGENT_MEMORY_SUBSTRATE
 * @87a8cd05..d8a4a448, wire-shape §9.4). Perimeter = the admission gate ONLY:
 * schema/enum (§3.1), the persona checks (§3.3: subject + STRUCTURAL event_shaped
 * + single-note/no-profile), reconcilable:false (§3.4), retention controls
 * (§3.5), principal_owner+scope neutral hook (§3.6), verifyVerbatim citation (§4).
 * OUT: the storage write-path (injected), the D11 promotion rule, the parked exec.
 *
 * Each predicate is encoded RED-first: a passing case AND a refusing case, so a
 * removed check makes its test fail (falsifiability).
 */
import { describe, expect, it, vi } from "vitest";

import {
  admitMemoryNote,
  requestTombstone,
  type AdmissionDeps,
  type MemoryNoteInput,
} from "../src/memory-admission.js";

const T = 1_750_000_000_000;

/** A source the citation resolves to; the cited string must appear in it. */
const SOURCE_TEXT = "on 2026-08-01 correction Y was applied because Z, cf artifact A";

function deps(overrides: Partial<AdmissionDeps> = {}): AdmissionDeps {
  return {
    resolveSource: vi.fn((ref: string) => (ref === "ref:A" ? SOURCE_TEXT : null)),
    appendNode: vi.fn(async () => ({ created: true })),
    ...overrides,
  };
}

/** A complete, admissible agent-work note. */
function validNote(over: Partial<MemoryNoteInput> = {}): MemoryNoteInput {
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

describe("admitMemoryNote — schema + closed enum (§3.1)", () => {
  it("admits a well-formed agent-work note and appends it once", async () => {
    const d = deps();
    const out = await admitMemoryNote(validNote(), d);
    expect(out.admitted).toBe(true);
    expect(d.appendNode).toHaveBeenCalledTimes(1);
  });

  it("refuses a memory_kind outside the closed enum, and stores NOTHING", async () => {
    const d = deps();
    const out = await admitMemoryNote(validNote({ memory_kind: "persona" as never }), d);
    expect(out.admitted).toBe(false);
    expect(d.appendNode).not.toHaveBeenCalled(); // no silent write on refusal
  });

  it("refuses a wrong node_type", async () => {
    const out = await admitMemoryNote(validNote({ node_type: "Agent" as never }), deps());
    expect(out.admitted).toBe(false);
  });
});

describe("admitMemoryNote — persona mechanism, held by code (§3.3)", () => {
  it("admits subject agent-work and subject human:<id>", async () => {
    expect((await admitMemoryNote(validNote({ subject: "agent-work" }), deps())).admitted).toBe(true);
    expect(
      (await admitMemoryNote(
        validNote({ subject: "human:antoinefa", purpose: "self-contained requests", retention: T + 1 }),
        deps(),
      )).admitted,
    ).toBe(true);
  });

  it("REFUSES a persona/identity subject (not in {agent-work, human:<id>})", async () => {
    for (const bad of ["persona", "voice:calm", "identity", "the agent"]) {
      expect((await admitMemoryNote(validNote({ subject: bad as never }), deps())).admitted).toBe(false);
    }
  });

  it("event_shaped is STRUCTURAL: refuses a generalization with no instant `at`", async () => {
    // A standing rule ("always X") has no single instant → structurally refused.
    const noAnchor = validNote();
    delete (noAnchor as { event?: unknown }).event;
    expect((await admitMemoryNote(noAnchor, deps())).admitted).toBe(false);

    const noAt = validNote({ event: { kind: "decision-taken", ref: "ref:A" } as never });
    expect((await admitMemoryNote(noAt, deps())).admitted).toBe(false);

    const nonNumericAt = validNote({ event: { at: "always" as never, kind: "k", ref: "ref:A" } });
    expect((await admitMemoryNote(nonNumericAt, deps())).admitted).toBe(false);
  });

  it("admission is single-note: it never assembles a profile (returns one id)", async () => {
    const out = await admitMemoryNote(validNote(), deps());
    expect(out.admitted).toBe(true);
    if (out.admitted) expect(typeof out.id).toBe("string");
  });
});

describe("admitMemoryNote — citation gate, verifyVerbatim only (§4)", () => {
  it("refuses an invented citation (cited string not in the named source)", async () => {
    const out = await admitMemoryNote(
      validNote({ provenance: { cited: "a fabricated claim never in the source", source: "ref:A" } }),
      deps(),
    );
    expect(out.admitted).toBe(false);
  });

  it("refuses when the source cannot be resolved", async () => {
    const out = await admitMemoryNote(
      validNote({ provenance: { cited: "correction Y was applied", source: "ref:UNKNOWN" }, event: { at: T, kind: "k", ref: "ref:UNKNOWN" } }),
      deps(),
    );
    expect(out.admitted).toBe(false);
  });
});

describe("admitMemoryNote — retention controls for subject-human (§3.5)", () => {
  it("refuses a human-subject note missing purpose/retention", async () => {
    const noPurpose = validNote({ subject: "human:antoinefa", retention: T + 1 });
    expect((await admitMemoryNote(noPurpose, deps())).admitted).toBe(false);
    const noRetention = validNote({ subject: "human:antoinefa", purpose: "p" });
    expect((await admitMemoryNote(noRetention, deps())).admitted).toBe(false);
  });
});

describe("admitMemoryNote — tenancy neutral hook (§3.6)", () => {
  it("refuses a missing principal_owner or an invalid scope", async () => {
    expect((await admitMemoryNote(validNote({ principal_owner: "" }), deps())).admitted).toBe(false);
    expect((await admitMemoryNote(validNote({ scope: "public" as never }), deps())).admitted).toBe(false);
  });
});

describe("admitMemoryNote — the admitted node is stamped correctly", () => {
  it("stamps reconcilable:false (§3.4), trust:asserted, review_status:pending", async () => {
    const d = deps();
    await admitMemoryNote(validNote(), d);
    const appended = (d.appendNode as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(appended.reconcilable).toBe(false);
    expect(appended.trust).toBe("asserted");
    expect(appended.review_status).toBe("pending");
    expect(appended.node_type).toBe("MemoryNote");
  });
});

describe("requestTombstone — authority check at admission (§3.5)", () => {
  it("refuses erasure by a principal that does not own the target, and appends nothing", async () => {
    const appendTombstone = vi.fn(async () => ({ applied: true }));
    const out = await requestTombstone(
      { target: { kind: "node", id: "mem:x" }, principal_owner: "human:antoinefa" },
      { requester: "human:someone-else" },
      { appendTombstone },
    );
    expect(out.applied).toBe(false);
    expect(appendTombstone).not.toHaveBeenCalled();
  });

  it("allows erasure by the owner (or a mandated agent) and delegates the append", async () => {
    const appendTombstone = vi.fn(async () => ({ applied: true }));
    const out = await requestTombstone(
      { target: { kind: "node", id: "mem:x" }, principal_owner: "human:antoinefa" },
      { requester: "human:antoinefa" },
      { appendTombstone },
    );
    expect(out.applied).toBe(true);
    expect(appendTombstone).toHaveBeenCalledTimes(1);
  });
});
