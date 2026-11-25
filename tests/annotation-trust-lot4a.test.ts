// Lot 4a: protected selection and veto (§3, §7 row 4a): correct an AI value, reject
// an alternative, then the effective value; repeat a rejected class; veto a fresh AI
// head over a stale human value; same-version rejections block, earlier ones warn.
import { describe, expect, it } from "vitest";
import { digestOfPreimage } from "../src/ontology-guardian/canonical.js";
import { parseEntry } from "../src/annotation-trust/parse.js";
import { PROFILE_PIN, TEMPLATE_REF } from "../src/annotation-trust/profile.js";
import { reduceEntries } from "../src/annotation-trust/reduce.js";
import type { Entry, Human, Shown } from "../src/annotation-trust/types.js";
const D = "a".repeat(64);
const seal = (o: Entry): Record<string, unknown> => {
  const { contentDigest: _d, ...rest } = o;
  return { ...rest, contentDigest: digestOfPreimage(rest) };
};
const env = (revision: number) => ({ stream: { scopeRef: "s", subjectRef: "o", slot: "class" },
  template: TEMPLATE_REF, profile: PROFILE_PIN,
  pinsDigest: D, resultDigest: D, revision, expectedRevision: revision - 1, replacesHuman: null,
  requestId: `22222222-2222-4222-8222-22222222222${revision}` as Entry["requestId"], commandDigest: D, contentDigest: D,
  recorderRef: "rec", policyRef: "pol", authorityReceiptRef: "auth",
  recordedAt: `2026-11-24T00:00:0${revision}Z`, evidence: { citations: [], evidenceRefs: [] } });
const atSv = (subjectVersion: string) => ({ stream: { scopeRef: "s", subjectRef: "o", slot: "class" }, subjectVersion, vocabulary: PROFILE_PIN });
const replay = (...fs: Entry[]) => reduceEntries(fs.map((f) => parseEntry(seal(f))), atSv("sv1"));
const replayAt = (sv: string, ...fs: Entry[]) => reduceEntries(fs.map((f) => parseEntry(seal(f))), atSv(sv));
const pertinent = { kind: "class", vocabulary: PROFILE_PIN, code: "pertinent" } as const;
const surveiller = { kind: "class", vocabulary: PROFILE_PIN, code: "a_surveiller" } as const;
const OTHER = { id: "other", version: "0.0.1", contentDigest: D } as const;
const run = (runRef: string) => ({ kind: "ai", actorRef: "radar-pipeline", model: "m",
  channel: "pipeline", modelVersion: "mv", promptDigest: D, runRef }) as const;
const analyst: Human = { kind: "human", actorRef: "analyst-b", receiptRef: "rc-b", channel: "ui-select" };
const shown = (n: number): Shown => ({ proposal: "shown", shown: [n] });
const a1 = { ...env(1), subjectVersion: "sv1", actor: run("run-a"), action: { kind: "assert", value: pertinent } } satisfies Entry;
const c2 = { ...env(2), subjectVersion: "sv1", actor: analyst, exposure: shown(1),
  action: { kind: "correct", judged: 1, value: surveiller } } satisfies Entry;
const a3 = { ...env(3), subjectVersion: "sv1", actor: run("run-b"), action: { kind: "assert", value: pertinent } } satisfies Entry;
const r4 = { ...env(4), subjectVersion: "sv1", actor: analyst, exposure: shown(3),
  action: { kind: "reject", judged: 3, reason: "contradicted" } } satisfies Entry;
const r5 = { ...env(5), subjectVersion: "sv1", actor: analyst, exposure: shown(2),
  action: { kind: "reject", judged: 2, reason: "wrong-subject" }, replacesHuman: 2 } satisfies Entry;
const h6 = { ...env(6), subjectVersion: "sv1", actor: analyst, exposure: { proposal: "not-shown" },
  action: { kind: "assert", value: pertinent }, replacesHuman: 5 } satisfies Entry;
const b2 = { ...env(2), subjectVersion: "sv1", actor: analyst, exposure: shown(1), action: { kind: "confirm", judged: 1 } } satisfies Entry;
const b3 = { ...env(3), subjectVersion: "sv2", actor: run("run-b"), action: { kind: "assert", value: pertinent } } satisfies Entry;
const b4 = { ...env(4), subjectVersion: "sv2", actor: analyst, exposure: shown(3),
  action: { kind: "reject", judged: 3, reason: "wrong-subject" }, replacesHuman: 2 } satisfies Entry;
const b5 = { ...env(5), subjectVersion: "sv3", actor: run("run-c"), action: { kind: "assert", value: pertinent } } satisfies Entry;
const d2 = { ...env(2), subjectVersion: "sv1", actor: run("run-b"), action: { kind: "assert", value: surveiller } } satisfies Entry;
const d3 = { ...env(3), subjectVersion: "sv1", actor: analyst, exposure: shown(1),
  action: { kind: "reject", judged: 1, reason: "duplicate" } } satisfies Entry;
const aOther1 = { ...a1, action: { kind: "assert", value: { ...pertinent, vocabulary: OTHER } } } satisfies Entry;
const h3 = { ...env(3), subjectVersion: "sv1", actor: analyst, exposure: { proposal: "not-shown" },
  action: { kind: "assert", value: pertinent }, replacesHuman: 2 } satisfies Entry;
const v3 = { ...env(3), subjectVersion: "sv1", actor: analyst, exposure: shown(2),
  action: { kind: "reject", judged: 2, reason: "duplicate" } } satisfies Entry;
const a4 = { ...env(4), subjectVersion: "sv1", actor: run("run-c"), action: { kind: "assert", value: pertinent } } satisfies Entry;
const r5keep = { ...env(5), subjectVersion: "sv1", actor: analyst, exposure: shown(4),
  action: { kind: "reject", judged: 4, reason: "duplicate" } } satisfies Entry;
const a4sv2 = { ...env(4), subjectVersion: "sv2", actor: run("run-c"),
  action: { kind: "assert", value: pertinent } } satisfies Entry;
describe("lot 4a protected selection and veto", () => {
  it("a correct selects its new value and keeps the AI author", () => {
    const r = replay(a1, c2);
    expect(r.trust).toBe("trusted");
    expect(r.effective?.revision).toBe(2);
    expect(r.effective?.value).toEqual(surveiller);
    expect(r.effective?.validation).toBe("human-asserted");
    expect(r.effective?.author.actorRef).toBe("analyst-b");
    expect(r.ai?.validation).toBe("corrected");
    expect(r.human?.decision).toBe(2);
    expect(r.human?.kind).toBe("value");
    expect(r.ai?.revision).toBe(1);
    expect(r.human).toMatchObject({ by: analyst,
      decidedAt: "2026-11-24T00:00:02Z", exposure: shown(1),
      selected: { createdAt: "2026-11-24T00:00:02Z",
        contentDigest: seal(c2).contentDigest } });
    if (r.human?.kind === "value") {
      expect(r.human.action).toBe("correct");
      expect(r.human.judged?.revision).toBe(1);
      expect(r.human.judged?.author.actorRef).toBe("radar-pipeline");
      expect(r.human.selected.lastReviewedAt).toBeNull();
      expect(r.human.judged?.lastReviewedAt).toBe("2026-11-24T00:00:02Z");
    }
  });
  it("rejecting an alternative keeps the head", () => {
    const r = replay(a1, c2, a3, r4);
    expect(r.trust).toBe("trusted");
    expect(r.human?.decision).toBe(2);
    expect(r.effective?.revision).toBe(2);
    expect(r.ai?.revision).toBe(3);
    expect(r.ai?.validation).toBe("rejected");
    expect(r.ai?.lastReviewedAt).toBe("2026-11-24T00:00:04Z");
  });
  it("rejecting the effective value installs a veto", () => {
    const r = replay(a1, c2, a3, r4, r5);
    expect(r.trust).toBe("withheld");
    expect(r.effective).toBeNull();
    expect(r.human?.kind).toBe("veto");
    if (r.human?.kind === "veto") {
      expect(r.human.decision).toBe(5);
      expect(r.human.judged.revision).toBe(2);
      expect(r.human.reason).toBe("wrong-subject");
      expect(r.human).toMatchObject({ by: analyst,
        decidedAt: "2026-11-24T00:00:05Z", exposure: shown(2) });
    }
  });
  it("rejecting the AI head with no human head vetoes", () => {
    const r = replay(a1, d2, v3);
    expect(r.trust).toBe("withheld");
    expect(r.human?.kind).toBe("veto");
    expect(r.human?.decision).toBe(3);
  });
  it("a human reselects a rejected class", () => {
    const r = replay(a1, c2, a3, r4, r5, h6);
    expect(r.trust).toBe("trusted");
    expect(r.effective?.revision).toBe(6);
    expect(r.effective?.value).toEqual(pertinent);
  });
  it("a stale human head withholds over a fresh AI head, then vetoes it", () => {
    const stale = replayAt("sv2", a1, b2, b3);
    expect(stale.trust).toBe("withheld");
    expect(stale.effective).toBeNull();
    expect(stale.human?.decision).toBe(2);
    expect(stale.ai?.revision).toBe(3);
    const veto = replayAt("sv2", a1, b2, b3, b4);
    expect(veto.trust).toBe("withheld");
    expect(veto.human?.kind).toBe("veto");
    expect(veto.human?.decision).toBe(4);
    const later = replayAt("sv3", a1, b2, b3, b4, b5);
    expect(later.trust).toBe("withheld");
    expect(later.effective).toBeNull();
    expect(later.human?.decision).toBe(4);
  });
  it("an earlier-version rejection warns and stays provisional", () => {
    const r = replayAt("sv2", a1, d2, d3, a4sv2);
    expect(r.trust).toBe("provisional");
    expect(r.effective?.revision).toBe(4);
    expect(r.matchingRejections).toEqual([{ decision: 3, judged: 1, subjectVersion: "sv1", reason: "duplicate" }]);
  });
  it("a same-version matching rejection withholds", () => {
    const r = replay(a1, d2, d3, a4);
    expect(r.trust).toBe("withheld");
    expect(r.effective).toBeNull();
    expect(r.matchingRejections).toEqual([{ decision: 3, judged: 1, subjectVersion: "sv1", reason: "duplicate" }]);
  });
  it("a reject under a veto keeps the head", () => {
    const r = replay(a1, d2, v3, a4, r5keep);
    expect(r.trust).toBe("withheld");
    expect(r.effective).toBeNull();
    expect(r.human?.kind).toBe("veto");
    expect(r.human?.decision).toBe(3);
  });
  it("a different pin never matches the read", () => {
    const r = replay(aOther1, d2, d3, a4);
    expect(r.trust).toBe("provisional");
    expect(r.effective?.revision).toBe(4);
    expect(r.matchingRejections).toEqual([]);
  });
  it.each<[string, Entry[], RegExp]>([
    ["a correct judges an eligible value", [a1, { ...c2, subjectVersion: "sv2" }], /judges no eligible value/],
    ["rejecting an alternative names no decision", [a1, c2, a3, { ...r4, replacesHuman: 2 }], /must set replacesHuman to null/],
    ["a veto names the head decision", [a1, c2, a3, r4, { ...r5, replacesHuman: null }], /must set replacesHuman to 2/],
    ["a corrected value stays terminal", [a1, c2, { ...c2, ...env(3), replacesHuman: 2 }], /transition at revision 3/],
    ["a correct keeps its target pin", [a1, { ...c2,
      action: { kind: "correct", judged: 1, value: { ...surveiller, vocabulary: OTHER } } }], /keeps its target's pin/],
    ["a correct keeps its target kind", [a1, { ...c2,
      action: { kind: "correct", judged: 1, value: { kind: "note", text: "x" } } }], /keeps its target's pin/],
    ["a note corrected to the same text is not different", [{ ...a1,
      action: { kind: "assert", value: { kind: "note", text: "n" } } },
      { ...c2, action: { kind: "correct", judged: 1, value: { kind: "note", text: "n" } } }], /different value/],
    ["a correct names the head decision", [a1, c2, a3,
      { ...r4, action: { kind: "correct", judged: 3, value: surveiller } }], /must set replacesHuman to 2/],
    ["a rejected alternative stays terminal", [a1, c2, a3, r4, { ...r4, ...env(5) }], /transition at revision 5/],
    ["a correct cannot reselect an unselected value", [a1, b2, h3,
      { ...env(4), subjectVersion: "sv1", actor: analyst, exposure: shown(1),
        action: { kind: "correct", judged: 1, value: surveiller }, replacesHuman: 3 }], /transition at revision 4/],
    ["a reject cannot reselect an unselected value", [a1, b2, h3,
      { ...env(4), subjectVersion: "sv1", actor: analyst, exposure: shown(1),
        action: { kind: "reject", judged: 1, reason: "duplicate" } }], /unlisted transition at revision 4/],
    ["a vetoed alternative still names nothing", [a1, d2, v3, a4, { ...r5keep, replacesHuman: 3 }], /must set replacesHuman to null/],
    ["an assert over a veto with null replacesHuman", [a1, c2, a3, r4, r5, { ...h6, replacesHuman: null }],
      /must set replacesHuman to 5/],
    ["an assert over a veto with stale replacesHuman", [a1, c2, a3, r4, r5, { ...h6, replacesHuman: 2 }],
      /must set replacesHuman to 5/],
  ])("refuses %s", (_n, fs, msg) => {
    expect(() => replay(...fs)).toThrow(msg);
  });
});
