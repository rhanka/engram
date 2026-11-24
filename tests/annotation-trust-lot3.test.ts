// Lot 3 (1/2): owned acts (§3, §7 row 3). Replays assert, question,
// `uncertain` and `confirm` through each human channel; a decline appends nothing (§2).
import { describe, expect, it } from "vitest";
import { digestOfPreimage } from "../src/ontology-guardian/canonical.js";
import { parseEntry } from "../src/annotation-trust/parse.js";
import { PROFILE_PIN, TEMPLATE_REF } from "../src/annotation-trust/profile.js";
import { reduceEntries } from "../src/annotation-trust/reduce.js";
import type { Entry, Human, ReadModel } from "../src/annotation-trust/types.js";
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
const elicited = (by: string): Human => ({ kind: "human", actorRef: by, receiptRef: `rc-${by}`, channel: "mcp-elicitation", elicitation: { clientRef: "c", requestRef: `q-${by}`, assurance: "server-asserted", trace: "complete", protocolRevision: "p", sessionRef: "s2", requestDigest: D, responseDigest: D, startedAt: "2026-11-24T00:00:00Z", endedAt: "2026-11-24T00:00:01Z", auditRef: "a" } });
const a1 = { ...env(1), subjectVersion: "sv1", actor: runA, action: { kind: "assert", value: pertinent } } satisfies Entry;
const aAmb = { ...env(1), subjectVersion: "sv1", actor: runA, action: { kind: "assert", value: pertinent, ambiguous: true } } satisfies Entry;
const mcp1 = { ...env(1), subjectVersion: "sv1", actor: assistantA, action: { kind: "assert", value: pertinent } } satisfies Entry;
const q2 = { ...env(2), subjectVersion: "sv1", actor: runA, action: { kind: "needs-elicitation", judged: 1, question: "what is the basis?" } } satisfies Entry;
const u2 = { ...env(2), subjectVersion: "sv1", actor: uiSelect("analyst-b"), exposure: { proposal: "shown", shown: [1] }, action: { kind: "uncertain", judged: 1 } } satisfies Entry;
const confirmBy = (revision: number, actor: Human, judged = 1, replacesHuman: number | null = null): Entry => ({ ...env(revision), subjectVersion: "sv1", actor, exposure: { proposal: "shown", shown: [judged] }, action: { kind: "confirm", judged }, replacesHuman });
const a3sv2 = { ...env(3), subjectVersion: "sv2", actor: runB, action: { kind: "assert", value: pertinent } } satisfies Entry;
describe("lot 3 reducer for the owned acts", () => {
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
  it("withheld cannot carry an effective value", () => {
    const r = replay(a1, q2); expect(r.trust).toBe("withheld");
    // @ts-expect-error: withheld goes with effective null
    const bad: ReadModel = { ...r, trust: "withheld", effective: r.ai };
    expect(bad.trust).toBe("withheld");
  });
});
