// Lot 3: reducer for open states and trust (§3, §7 row 3). Replays assert,
// question, `uncertain` and `confirm` through each human channel, including a
// confirmation by a human who did not run the proposing assistant session.
// Both authors survive, an elicited confirmation reads `trusted`, and a
// decline leaves `provisional` (a decline appends nothing, §2).
import { describe, expect, it } from "vitest";
import { digestOfPreimage } from "../src/ontology-guardian/canonical.js";
import { parseEntry } from "../src/annotation-trust/parse.js";
import { PROFILE_PIN, TEMPLATE_REF } from "../src/annotation-trust/profile.js";
import { reduceEntries } from "../src/annotation-trust/reduce.js";
import type { AI, Entry, Human, ReadModel, Shown } from "../src/annotation-trust/types.js";
const D = "a".repeat(64);
const seal = (o: Entry): Record<string, unknown> => { const { contentDigest: _d, ...rest } = o; return { ...rest, contentDigest: digestOfPreimage(rest) }; };
const env = (revision: number) => ({
  stream: { scopeRef: "s", subjectRef: "o", slot: "class" }, template: TEMPLATE_REF, profile: PROFILE_PIN,
  pinsDigest: D, resultDigest: D, revision, expectedRevision: revision - 1, replacesHuman: null,
  requestId: `11111111-1111-4111-8111-11111111111${revision}` as Entry["requestId"],
  commandDigest: D, contentDigest: D, recorderRef: "rec", policyRef: "pol",
  authorityReceiptRef: "auth", recordedAt: `2026-11-24T00:00:0${revision}Z`, evidence: { citations: [], evidenceRefs: [] },
});
const atSv1 = { stream: { scopeRef: "s", subjectRef: "o", slot: "class" }, subjectVersion: "sv1", vocabulary: PROFILE_PIN };
const replay = (...fs: Entry[]) => reduceEntries(fs.map((f) => parseEntry(seal(f))), atSv1);
const replayAt = (subjectVersion: string, ...fs: Entry[]) => reduceEntries(fs.map((f) => parseEntry(seal(f))), { ...atSv1, subjectVersion });
const pertinent = { kind: "class", vocabulary: PROFILE_PIN, code: "pertinent" } as const;
const runA = { kind: "ai", actorRef: "radar-pipeline", model: "m", channel: "pipeline", modelVersion: "mv", promptDigest: D, runRef: "run-a" } as const;
const assistantA = { kind: "ai", actorRef: "assistant-a", model: "m", channel: "mcp", clientRef: "c", sessionRef: "s1" } as const;
const runB = { kind: "ai", actorRef: "radar-pipeline", model: "m", channel: "pipeline", modelVersion: "mv", promptDigest: D, runRef: "run-b" } as const;
const uiSelect = (by: string): Human => ({ kind: "human", actorRef: by, receiptRef: `rc-${by}`, channel: "ui-select" });
const uiThumbs = (by: string): Human => ({ kind: "human", actorRef: by, receiptRef: `rc-${by}`, channel: "ui-thumbs" });
const elicited = (by: string): Human => ({ kind: "human", actorRef: by, receiptRef: `rc-${by}`, channel: "mcp-elicitation",
  elicitation: { clientRef: "c", requestRef: `q-${by}`, assurance: "server-asserted", trace: "complete", protocolRevision: "p", sessionRef: "s2", requestDigest: D, responseDigest: D, startedAt: "2026-11-24T00:00:00Z", endedAt: "2026-11-24T00:00:01Z", auditRef: "a" } });
const shown1: Shown = { proposal: "shown", shown: [1] };
const a1 = { ...env(1), subjectVersion: "sv1", actor: runA, action: { kind: "assert", value: pertinent } } satisfies Entry;
const aAmb = { ...env(1), subjectVersion: "sv1", actor: runA, action: { kind: "assert", value: pertinent, ambiguous: true } } satisfies Entry;
const mcp1 = { ...env(1), subjectVersion: "sv1", actor: assistantA, action: { kind: "assert", value: pertinent } } satisfies Entry;
const q2 = { ...env(2), subjectVersion: "sv1", actor: runA, action: { kind: "needs-elicitation", judged: 1, question: "what is the basis?" } } satisfies Entry;
const u2 = { ...env(2), subjectVersion: "sv1", actor: uiSelect("analyst-b"), exposure: shown1, action: { kind: "uncertain", judged: 1 } } satisfies Entry;
const aiUnc = (actor: AI): Entry => ({ ...env(2), subjectVersion: "sv1", actor, action: { kind: "uncertain", judged: 1 } });
const hAssert1 = { ...env(1), subjectVersion: "sv1", actor: uiSelect("analyst-b"), exposure: { proposal: "not-shown" }, action: { kind: "assert", value: pertinent } } satisfies Entry;
const hAssert2 = (actor: Human, replacesHuman: number | null): Entry => ({ ...env(2), subjectVersion: "sv1", actor, exposure: { proposal: "not-shown" }, action: { kind: "assert", value: pertinent }, replacesHuman });
const confirmBy = (revision: number, actor: Human, judged = 1, replacesHuman: number | null = null): Entry => ({ ...env(revision), subjectVersion: "sv1", actor, exposure: { proposal: "shown", shown: [judged] }, action: { kind: "confirm", judged }, replacesHuman });
const uncH14 = { ...env(2), subjectVersion: "sv1", actor: uiSelect("analyst-b"), exposure: shown1, action: { kind: "uncertain", judged: 1 }, replacesHuman: 1 } satisfies Entry;
const hUncC = { ...env(2), subjectVersion: "sv1", actor: uiSelect("analyst-c"), exposure: shown1, action: { kind: "uncertain", judged: 1 } } satisfies Entry;
const u2sv2 = { ...env(2), subjectVersion: "sv2", actor: uiSelect("analyst-b"), exposure: shown1, action: { kind: "uncertain", judged: 1 } } satisfies Entry;
const a2sv2 = { ...env(2), subjectVersion: "sv2", actor: runB, action: { kind: "assert", value: pertinent } } satisfies Entry;
const correct2 = { ...env(2), subjectVersion: "sv1", actor: uiSelect("analyst-b"), exposure: shown1, action: { kind: "correct", judged: 1, value: pertinent } } satisfies Entry;
const reject2 = { ...env(2), subjectVersion: "sv1", actor: uiSelect("analyst-b"), exposure: shown1, action: { kind: "reject", judged: 1, reason: "wrong-subject" } } satisfies Entry;
const a3sv2 = { ...env(3), subjectVersion: "sv2", actor: runB, action: { kind: "assert", value: pertinent } } satisfies Entry;
const hAssertSv2 = { ...env(2), subjectVersion: "sv2", actor: uiSelect("analyst-b"), exposure: { proposal: "not-shown" }, action: { kind: "assert", value: pertinent } } satisfies Entry;
const ps3 = { ...env(3), subjectVersion: "sv0-legacy", actor: { kind: "adapter", actorRef: "importer", channel: "import" }, action: { kind: "preserve-source", row: { sourceRef: "legacy-1", sourceDigest: D } } } satisfies Entry;
const otherStream = { ...env(2), subjectVersion: "sv1", stream: { scopeRef: "s", subjectRef: "other", slot: "class" }, actor: runA, action: { kind: "assert", value: pertinent } } satisfies Entry;
const dupB2 = { ...env(2), subjectVersion: "sv1", actor: runB, action: { kind: "assert", value: pertinent } } satisfies Entry;
const aOtherVocab = { ...env(1), subjectVersion: "sv1", actor: runA, action: { kind: "assert", value: { kind: "class", vocabulary: { id: "other", version: "0.0.1", contentDigest: D }, code: "pertinent" } } } satisfies Entry;
describe("lot 3 reducer for open states and trust", () => {
  it("reads an AI assert as provisional with the AI value", () => { const r = replay(a1); expect(r.trust).toBe("provisional"); expect(r.effective?.revision).toBe(1); expect(r.effective?.author.actorRef).toBe("radar-pipeline"); expect(r.human).toBeNull(); });
  it("reads an ambiguous AI assert as uncertain and withholds", () => { const r = replay(aAmb); expect(r.trust).toBe("withheld"); expect(r.effective).toBeNull(); expect(r.ai?.validation).toBe("uncertain"); });
  it("records a question without an answer and withholds", () => { const r = replay(a1, q2); expect(r.trust).toBe("withheld"); expect(r.effective).toBeNull(); expect(r.human).toBeNull(); expect(r.ai?.validation).toBe("awaiting-elicitation"); });
  it("records uncertainty without selecting and withholds", () => { const r = replay(a1, u2); expect(r.trust).toBe("withheld"); expect(r.effective).toBeNull(); expect(r.human).toBeNull(); expect(r.ai?.validation).toBe("uncertain"); });
  it.each([["ui-select", "analyst-b"], ["ui-thumbs", "analyst-c"], ["mcp-elicitation", "analyst-d"]] as const)("a %s confirm reads trusted with both authors", (channel, by) => {
    const actor = channel === "mcp-elicitation" ? elicited(by) : channel === "ui-thumbs" ? uiThumbs(by) : uiSelect(by);
    const r = replay(a1, confirmBy(2, actor));
    expect(r.trust).toBe("trusted"); expect(r.effective?.value).toEqual(pertinent);
    expect(r.effective?.author.actorRef).toBe("radar-pipeline"); expect(r.human?.by.actorRef).toBe(by);
    expect(r.human?.judged?.revision).toBe(1); expect(r.human?.judged?.author.actorRef).toBe("radar-pipeline");
    expect(r.ai?.author.actorRef).toBe("radar-pipeline");
    expect(r.human?.kind).toBe("value");
    if (r.human?.kind === "value") { expect(r.human.selected.createdAt).toBe("2026-11-24T00:00:01Z"); expect(r.human.selected.lastReviewedAt).toBe("2026-11-24T00:00:02Z"); }
  });
  it("a confirm by a human who did not run the proposing assistant session reads trusted", () => {
    const r = replay(mcp1, confirmBy(2, elicited("analyst-b")));
    expect(r.trust).toBe("trusted"); expect(r.effective?.author.actorRef).toBe("assistant-a"); expect(r.human?.by.actorRef).toBe("analyst-b");
  });
  it("a decline appends nothing so revision 1 stays provisional", () => { const r = replay(mcp1); expect(r.trust).toBe("provisional"); expect(r.revision).toBe(1); expect(r.human).toBeNull(); });
  it("a stale human head withholds with no effective value", () => {
    const r = replayAt("sv2", a1, confirmBy(2, uiSelect("analyst-b")), a3sv2);
    expect(r.trust).toBe("withheld"); expect(r.effective).toBeNull();
    expect(r.human?.decision).toBe(2); expect(r.ai?.revision).toBe(3);
  });
  it("a replacing human assert supersedes the head", () => { const r = replay(hAssert1, hAssert2(uiThumbs("analyst-c"), 1)); expect(r.trust).toBe("trusted"); expect(r.human?.decision).toBe(2); expect(r.effective?.revision).toBe(2); });
  it("a confirm of the selected human-asserted value reads trusted", () => { const r = replay(hAssert1, confirmBy(2, elicited("analyst-d"), 1, 1)); expect(r.trust).toBe("trusted"); expect(r.human?.action).toBe("confirm"); expect(r.human?.judged?.revision).toBe(1); });
  it.each([
    ["an AI inquiry cannot rewrite a human decision", () => replay(hAssert1, aiUnc(runA)), /unlisted transition at revision 2/],
    ["only the authoring AI may mark its own value", () => replay(a1, aiUnc(assistantA)), /unlisted transition at revision 2/],
    ["a different pipeline run cannot mark the author value", () => replay(a1, aiUnc(runB)), /unlisted transition at revision 2/],
    ["a confirmed revision cannot be confirmed again", () => replay(a1, confirmBy(2, uiSelect("analyst-b")), confirmBy(3, uiThumbs("analyst-c"), 1, 2)), /unlisted transition at revision 3/],
    ["replacing a human head must name its decision", () => replay(hAssert1, hAssert2(uiThumbs("analyst-c"), null)), /must set replacesHuman to 1/],
    ["a confirm cannot reselect an unselected value", () => replay(hAssert1, hAssert2(uiThumbs("analyst-c"), 1), confirmBy(3, elicited("analyst-d"), 1, 2)), /unlisted transition at revision 3/],
    ["a confirm needs an eligible value target", () => replay(a1, q2, confirmBy(3, uiSelect("analyst-b"), 2)), /judges no eligible value/],
    ["an inquiry carries no replacesHuman", () => replay(a1, uncH14), /must set replacesHuman to null/],
    ["a human uncertain cannot target a human decision", () => replay(hAssert1, hUncC), /unlisted transition at revision 2/],
    ["a confirm cannot target an older-version value", () => replayAt("sv2", a1, a2sv2, { ...confirmBy(3, uiSelect("analyst-b"), 1), subjectVersion: "sv2" }), /judges no eligible value/],
    ["an uncertain recorded on a new version judges nothing open", () => replay(a1, u2sv2), /unlisted transition at revision 2/],
    ["a correct needs a different value", () => replay(a1, correct2), /different value/],
    ["a reject is not live yet", () => replay(a1, reject2), /unlisted transition at revision 2/],
  ])("refuses %s", (_name, run, msg) => { expect(run).toThrow(msg); });
  it("a duplicated revision is refused, never trusted", () => { expect(() => replay(a1, hAssert2(uiSelect("analyst-b"), null), dupB2)).toThrow(/breaks the committed sequence/); });
  it("two AI asserts in reverse order refuse on sequence only", () => { expect(() => replay(dupB2, a1)).toThrow(/breaks the committed sequence/); });
  it("an entry from another stream is refused", () => { expect(() => replay(a1, otherStream)).toThrow(/breaks the committed sequence/); });
  it("an empty stream reads withheld with empty heads", () => { const r = reduceEntries([], atSv1); expect(r.trust).toBe("withheld"); expect(r.human).toBeNull(); expect(r.ai).toBeNull(); });
  it("a preserve-source keeps both heads and exposes its row", () => {
    const r = replay(a1, confirmBy(2, uiSelect("analyst-b")), ps3);
    expect(r.trust).toBe("trusted"); expect(r.subjectVersion).toBe("sv1"); expect(r.ai?.revision).toBe(1);
    expect(r.unverifiedSources).toEqual([{ revision: 3, row: { sourceRef: "legacy-1", sourceDigest: D } }]);
  });
  it("both authors survive across subject versions", () => {
    const r = replayAt("sv2", a1, hAssertSv2);
    expect(r.trust).toBe("trusted"); expect(r.subjectVersion).toBe("sv2");
    expect(r.effective?.revision).toBe(2); expect(r.ai?.revision).toBe(1);
  });
  it("a class value with a mismatched vocabulary pin is withheld", () => {
    const r = replay(aOtherVocab);
    expect(r.trust).toBe("withheld"); expect(r.effective).toBeNull(); expect(r.ai?.revision).toBe(1);
  });
  it("withheld cannot carry an effective value", () => {
    const r = replay(a1, q2); expect(r.trust).toBe("withheld");
    // @ts-expect-error: withheld goes with effective null
    const bad: ReadModel = { ...r, trust: "withheld", effective: r.ai };
    expect(bad.trust).toBe("withheld");
  });
});
