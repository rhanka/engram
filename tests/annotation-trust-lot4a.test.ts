// Lot 4a (1/2): correct selects a new human value (§3, §7 row 4a).
// Correct an AI value; the correction keeps its target pin.
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
const atSv = (subjectVersion: string) => ({ stream: { scopeRef: "s", subjectRef: "o", slot: "class" },
  subjectVersion, vocabulary: PROFILE_PIN });
const replay = (...fs: Entry[]) => reduceEntries(fs.map((f) => parseEntry(seal(f))), atSv("sv1"));
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
const b2 = { ...env(2), subjectVersion: "sv1", actor: analyst, exposure: shown(1), action: { kind: "confirm", judged: 1 } } satisfies Entry;
const h3 = { ...env(3), subjectVersion: "sv1", actor: analyst, exposure: { proposal: "not-shown" },
  action: { kind: "assert", value: pertinent }, replacesHuman: 2 } satisfies Entry;
describe("lot 4a correct selects a new human value (1/2)", () => {
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
    if (r.human?.kind === "value") {
      expect(r.human.action).toBe("correct");
      expect(r.human.judged?.revision).toBe(1);
      expect(r.human.judged?.author.actorRef).toBe("radar-pipeline");
      expect(r.human.selected.lastReviewedAt).toBeNull();
      expect(r.human.judged?.lastReviewedAt).toBe("2026-11-24T00:00:02Z");
    }
  });
  it.each<[string, Entry[], RegExp]>([
    ["a correct judges an eligible value", [a1, { ...c2, subjectVersion: "sv2" }], /judges no eligible value/],
    ["a corrected value stays terminal", [a1, c2, { ...c2, ...env(3), replacesHuman: 2 }], /unlisted transition/],
    ["a correct keeps its target pin", [a1, { ...c2,
      action: { kind: "correct", judged: 1, value: { ...surveiller, vocabulary: OTHER } } }], /keeps its target's pin/],
    ["a correct keeps its target kind", [a1, { ...c2,
      action: { kind: "correct", judged: 1, value: { kind: "note", text: "x" } } }], /keeps its target's pin/],
    ["a note corrected to the same text is not different", [{ ...a1,
      action: { kind: "assert", value: { kind: "note", text: "n" } } },
      { ...c2, action: { kind: "correct", judged: 1, value: { kind: "note", text: "n" } } }], /different value/],
    ["a correct names the head decision", [a1, c2, a3,
      { ...r4, action: { kind: "correct", judged: 3, value: surveiller } }], /must set replacesHuman to 2/],
    ["a correct cannot reselect an unselected value", [a1, b2, h3,
      { ...env(4), subjectVersion: "sv1", actor: analyst, exposure: shown(1),
        action: { kind: "correct", judged: 1, value: surveiller }, replacesHuman: 3 }], /unlisted transition/],
  ])("refuses %s", (_n, fs, msg) => {
    expect(() => replay(...fs)).toThrow(msg);
  });
});
