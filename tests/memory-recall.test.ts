/**
 * graphify-memory v1 — the RECALL surface (SPEC_AGENT_MEMORY_SUBSTRATE, ratified
 * @87a8cd05..cd7fad55). This is the read side that makes the admitted substrate
 * usable: it recalls `MemoryNote` nodes through the SAME T5/T6 temporal predicate
 * (`overlapsTemporalWindow`, reused — never copied) and enforces the recall-surface
 * invariants that are graphify-side and MINE (charter: temporal-recall):
 *
 *   - temporal membership: T6 as-of point OR T5 window (§7 CLOSED [t,t_end]);
 *   - tenancy access (§3.6): a private note is visible ONLY to its principal_owner,
 *     capitalised notes are shared; missing tenancy fails CLOSED;
 *   - tombstone fold-out (§3.5): a tombstoned target disappears at projection,
 *     and cannot resurface through an edge that references it (edge cascade);
 *   - tier disclosure (§1): every projection RETAINS trust + review_status + provenance;
 *   - projection prohibition (§3.3.3): the surface offers NO identity-profile
 *     projection — human-subject notes are returned individually, never assembled
 *     into a UserModel; enforced AT READ, not merely documented.
 *
 * Each invariant is encoded RED-first (a passing case AND a refusing/absent case),
 * so removing a check makes its test fail. Pure, deterministic, offline, no LLM,
 * no h2a import (anti-cycle).
 */
import { describe, expect, it } from "vitest";

import * as memoryRecall from "../src/memory-recall.js";
import {
  recallMemory,
  MEMORY_RECALL_SCHEMA,
  type MemoryRecallInput,
  type MemoryTombstone,
} from "../src/memory-recall.js";

const OWNER = "human:antoinefa";
const OTHER = "human:someone-else";
const T = 1_750_000_000_000;

/** A well-formed admitted note as the admission gate stamps it. `id` names the
 *  note by a short key that is prefixed `mem:` last, so it survives the spread. */
function note(over: Record<string, unknown> = {}): Record<string, unknown> {
  const { id: key = "a", ...rest } = over;
  return {
    node_type: "MemoryNote",
    memory_kind: "decision",
    subject: "agent-work",
    t: T,
    t_src: "authored-at",
    event: { at: T, kind: "decision-taken", ref: "ref:A" },
    provenance: { cited: "correction Y was applied", source: "ref:A" },
    trust: "asserted",
    review_status: "pending",
    reconcilable: false,
    principal_owner: OWNER,
    scope: "private",
    ...rest,
    id: `mem:${String(key)}`,
  };
}

function input(nodes: Record<string, unknown>[], links: Record<string, unknown>[] = []): MemoryRecallInput {
  return { nodes, links };
}

const ctx = { principal_owner: OWNER };

describe("recallMemory — temporal predicate, reused from T5/T6 (§7)", () => {
  it("as-of point recalls a note live at the instant and excludes a closed-before one", () => {
    const doc = input([
      note({ id: "live", t: T - 10, t_end: T + 10 }),
      note({ id: "closed-before", t: T - 100, t_end: T - 50 }),
      note({ id: "open", t: T - 10 }), // t_end absent = OPEN
    ]);
    const out = recallMemory(doc, ctx, { asOf: T });
    expect(out.notes.map((n) => n.id).sort()).toEqual(["mem:live", "mem:open"]);
  });

  it("window recalls the notes overlapping [since, until] inclusively", () => {
    const doc = input([
      note({ id: "in", t: T, t_end: T + 5 }),
      note({ id: "after", t: T + 100, t_end: T + 200 }),
    ]);
    const out = recallMemory(doc, ctx, { window: { sinceMs: T - 5, untilMs: T + 10 } });
    expect(out.notes.map((n) => n.id)).toEqual(["mem:in"]);
  });

  it("requires exactly one of asOf | window", () => {
    expect(() => recallMemory(input([]), ctx, {} as never)).toThrow();
    expect(() =>
      recallMemory(input([]), ctx, { asOf: T, window: { sinceMs: null, untilMs: null } } as never),
    ).toThrow();
  });

  it("recalls ONLY MemoryNote nodes — a timed Commit is not memory", () => {
    const doc = input([
      note({ id: "n" }),
      { id: "c1", node_type: "Commit", t: T, principal_owner: OWNER, scope: "capitalised" },
    ]);
    const out = recallMemory(doc, ctx, { asOf: T });
    expect(out.notes.map((n) => n.id)).toEqual(["mem:n"]);
  });
});

describe("recallMemory — tenancy access, private is not cross-tenant (§3.6/§3.5)", () => {
  it("recalls the requester's own private note and any capitalised note", () => {
    const doc = input([
      note({ id: "mine", scope: "private", principal_owner: OWNER }),
      note({ id: "shared", scope: "capitalised", principal_owner: OTHER }),
    ]);
    const out = recallMemory(doc, ctx, { asOf: T });
    expect(out.notes.map((n) => n.id).sort()).toEqual(["mem:mine", "mem:shared"]);
  });

  it("NEVER recalls another principal's private note", () => {
    const doc = input([note({ id: "theirs", scope: "private", principal_owner: OTHER })]);
    const out = recallMemory(doc, ctx, { asOf: T });
    expect(out.notes).toHaveLength(0);
  });

  it("fails CLOSED on a note with missing/invalid tenancy", () => {
    const doc = input([
      note({ id: "no-owner", principal_owner: "" }),
      note({ id: "bad-scope", scope: "public" }),
    ]);
    const out = recallMemory(doc, ctx, { asOf: T });
    expect(out.notes).toHaveLength(0);
  });
});

describe("recallMemory — tombstone fold-out at projection (§3.5, A2 with teeth)", () => {
  it("folds a tombstoned note out of the projection", () => {
    const doc = input([note({ id: "keep" }), note({ id: "erased" })]);
    const tombstones: MemoryTombstone[] = [
      { target: { kind: "node", id: "mem:erased" }, principal_owner: OWNER },
    ];
    const out = recallMemory(doc, ctx, { asOf: T }, tombstones);
    expect(out.notes.map((n) => n.id)).toEqual(["mem:keep"]);
  });

  it("a tombstoned note cannot resurface through an edge that references it (edge cascade)", () => {
    const doc = input(
      [note({ id: "keep" }), note({ id: "erased" })],
      [{ source: "mem:keep", target: "mem:erased", relation: "CITES", t: T }],
    );
    const tombstones: MemoryTombstone[] = [
      { target: { kind: "node", id: "mem:erased" }, principal_owner: OWNER },
    ];
    const out = recallMemory(doc, ctx, { asOf: T }, tombstones);
    expect(out.notes.map((n) => n.id)).toEqual(["mem:keep"]);
  });
});

describe("recallMemory — tier disclosure (§1: every projection retains tier + provenance)", () => {
  it("retains trust, review_status, and provenance on each recalled note", () => {
    const out = recallMemory(input([note({ id: "n" })]), ctx, { asOf: T });
    const recalled = out.notes[0];
    expect(recalled.trust).toBe("asserted");
    expect(recalled.review_status).toBe("pending");
    expect(recalled.provenance).toEqual({ cited: "correction Y was applied", source: "ref:A" });
  });
});

describe("recallMemory — projection prohibition (§3.3.3, enforced at READ)", () => {
  it("returns human-subject notes INDIVIDUALLY, never collapsed into one profile", () => {
    const doc = input([
      note({ id: "h1", subject: "human:antoinefa", memory_kind: "context", t: T - 20 }),
      note({ id: "h2", subject: "human:antoinefa", memory_kind: "context", t: T }),
    ]);
    const out = recallMemory(doc, ctx, { window: { sinceMs: T - 100, untilMs: T } });
    // Two distinct events, two distinct notes — NOT one assembled UserModel.
    expect(out.notes.map((n) => n.id)).toEqual(["mem:h1", "mem:h2"]);
    expect(out.projection).toBe("notes-only");
  });

  it("the module offers NO identity-profile/persona/UserModel projection export", () => {
    const forbidden = /profile|persona|usermodel|identity|assemble/i;
    const offenders = Object.keys(memoryRecall).filter((name) => forbidden.test(name));
    expect(offenders).toEqual([]);
  });

  it("exposes the disclosed schema and is unpaged (T6: never silently truncates)", () => {
    const out = recallMemory(input([note({ id: "n" })]), ctx, { asOf: T });
    expect(out.schema).toBe(MEMORY_RECALL_SCHEMA);
    expect(out.unpaged).toBe(true);
  });
});
