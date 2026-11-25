// Design note (round-1 M3 / round-2 N1, same class): the parser's closed key
// lists and hand-written rules refused a valid lot 2a Entry because nothing
// checked them against the type. So this file keeps one valid fixture per
// Entry arm, each `satisfies Entry` so tsc checks it, with every optional
// key present at least once (observedAt included); one test parses every
// fixture (the round-trip that catches a missing key); negatives change one
// property of a valid fixture.
import { describe, expect, it } from "vitest";
import { digestOfPreimage } from "../src/ontology-guardian/canonical.js";
import { parseEntry } from "../src/annotation-trust/parse.js";
import { PROFILE_PIN, TEMPLATE_REF } from "../src/annotation-trust/profile.js";
import type { Entry } from "../src/annotation-trust/types.js";
const D = "a".repeat(64);
const pipe: Record<string, unknown> = { kind: "ai", actorRef: "run", model: "m", channel: "pipeline", modelVersion: null, promptDigest: D, runRef: "r" };
const elicComplete: Record<string, unknown> = { clientRef: "c", requestRef: "q", assurance: "server-asserted", trace: "complete", protocolRevision: "p", sessionRef: "s", requestDigest: D, responseDigest: D, startedAt: "2026-11-24T00:00:00Z", endedAt: "2026-11-24T00:00:01Z", auditRef: "a" };
const humanComplete: Record<string, unknown> = { kind: "human", actorRef: "u", receiptRef: "rc", channel: "mcp-elicitation", elicitation: elicComplete };
const assertNote = { kind: "assert", value: { kind: "note", text: "n" } };
const assertAmbiguous = { kind: "assert", value: { kind: "note", text: "n" }, ambiguous: true };
const confirmOne = { kind: "confirm", judged: 1 };
const uiHuman = { kind: "human", actorRef: "u", receiptRef: "rc", channel: "ui-select" };
const adapter = { kind: "adapter", actorRef: "a", channel: "import" };
const preserve = { kind: "preserve-source", row: { sourceRef: "row", sourceDigest: D } };
const shownOne = { proposal: "shown", shown: [1] };
const seal = (o: Record<string, unknown>): Record<string, unknown> => { const { contentDigest: _d, ...rest } = o; return { ...rest, contentDigest: digestOfPreimage(rest) }; };
const entry = (actor: unknown, action: unknown, exposure?: unknown, extra?: Record<string, unknown>): Record<string, unknown> => ({
  stream: { scopeRef: "s", subjectRef: "o", slot: "class" }, template: TEMPLATE_REF, profile: PROFILE_PIN, pinsDigest: D, resultDigest: D, revision: 2, expectedRevision: 1, replacesHuman: null,
  requestId: "11111111-1111-4111-8111-111111111111", commandDigest: D, recorderRef: "rec", policyRef: "pol", authorityReceiptRef: "auth", recordedAt: "2026-11-24T00:00:00Z", evidence: { citations: [], evidenceRefs: [] }, subjectVersion: "sv", actor, action, ...(exposure === undefined ? {} : { exposure }), ...extra,
});
const env = { stream: { scopeRef: "s", subjectRef: "o", slot: "class" }, template: TEMPLATE_REF, profile: PROFILE_PIN, pinsDigest: D, resultDigest: D, revision: 2, expectedRevision: 1, replacesHuman: null as number | null, requestId: "11111111-1111-4111-8111-111111111111" as Entry["requestId"], commandDigest: D, contentDigest: D, recorderRef: "rec", policyRef: "pol", authorityReceiptRef: "auth", recordedAt: "2026-11-24T00:00:00Z", evidence: { citations: [], evidenceRefs: [] } };
const fPipe = { ...env, subjectVersion: "sv", actor: { kind: "ai", actorRef: "r", model: "m", channel: "pipeline", modelVersion: null, promptDigest: D, runRef: "r", effort: "e", promptId: "p", inputDigest: D }, action: { kind: "assert", value: { kind: "note", text: "n\n" }, ambiguous: true }, observedAt: "2026-11-23T00:00:00Z", source: { sourceRef: "s", sourceDigest: D }, rationale: "r" } satisfies Entry;
const fMcp = { ...env, subjectVersion: "sv", actor: { kind: "ai", actorRef: "r", model: "m", channel: "mcp", clientRef: "c", sessionRef: "s" }, action: { kind: "uncertain", judged: 1 }, evidence: { citations: [], evidenceRefs: [], sourceRows: [{ sourceRef: "s", sourceDigest: D }], extraction: { confidence: "EXTRACTED" as const, confidence_score: 1 } } } satisfies Entry;
const fUi = { ...env, subjectVersion: "sv", replacesHuman: 1, actor: { kind: "human", actorRef: "u", receiptRef: "rc", channel: "ui-select" }, exposure: { proposal: "shown", shown: [1] }, action: { kind: "confirm", judged: 1 }, classReasonCode: "c" } satisfies Entry;
const fElic = { ...env, subjectVersion: "sv", actor: { kind: "human", actorRef: "u", receiptRef: "rc", channel: "mcp-elicitation", elicitation: { clientRef: "c", requestRef: "q", assurance: "server-asserted", trace: "complete", protocolRevision: "p", sessionRef: "s", requestDigest: D, responseDigest: D, startedAt: "2026-11-24T00:00:00Z", endedAt: "2026-11-24T00:00:01Z", auditRef: "a" } }, exposure: { proposal: "not-shown" }, action: { kind: "assert", value: { kind: "note", text: "n" } } } satisfies Entry;
const fAd = { ...env, subjectVersion: null, actor: { kind: "adapter", actorRef: "a", channel: "import" }, action: { kind: "preserve-source", row: { sourceRef: "row", sourceDigest: D, batchRef: "b", reportedSource: "s", reportedClass: "c", reportedNote: "n", reportedModel: "m", pendingHuman: true } } } satisfies Entry;
const R = (f: unknown): Record<string, unknown> => f as unknown as Record<string, unknown>;
describe("lot 2b closed parser", () => {
  it("parses a pipeline assert with modelVersion null", () => { const got = parseEntry(seal(entry(pipe, assertNote))); expect((got.actor as unknown as Record<string, unknown>).modelVersion).toBeNull(); });
  it("rejects a pipeline AI without the modelVersion key", () => { const { modelVersion: _m, ...noVer } = pipe; expect(() => parseEntry(seal(entry(noVer, assertNote)))).toThrow(/modelVersion/); });
  it("rejects a pipeline AI without promptDigest", () => { const { promptDigest: _p, ...noPd } = pipe; expect(() => parseEntry(seal(entry(noPd, assertNote)))).toThrow(/promptDigest/); });
  it("rejects an AI verdict", () => { expect(() => parseEntry(seal(entry(pipe, confirmOne)))).toThrow(/cannot decide/); });
  it("rejects a human verdict whose exposure omits the judged revision", () => { expect(() => parseEntry(seal(entry(humanComplete, confirmOne, { proposal: "shown", shown: [] })))).toThrow(/judged/); });
  it("rejects an mcp-elicitation act without trace", () => { const { elicitation: _e, ...noEl } = humanComplete; expect(() => parseEntry(seal(entry(noEl, assertNote, shownOne)))).toThrow(/^actor\.mcp-elicitation has an unexpected/); });
  it.each(["evaluationRole", "role", "validation"])("rejects a client-set %s", (k) => { expect(() => parseEntry(seal(entry(humanComplete, confirmOne, shownOne, { [k]: "blind" })))).toThrow(/^entry has an unexpected/); });
  it("rejects a live write with unknown exposure, which the import path accepts", () => { const unk = seal(entry({ kind: "human", actorRef: "u", receiptRef: "rc", channel: "ui-select" }, assertNote, { proposal: "unknown" })); expect(() => parseEntry(unk)).toThrow(/unknown/); expect(parseEntry(unk, { live: false })).toBeTruthy(); });
  it("rejects a live write with a partial trace, which the import path accepts", () => { const partial = seal(entry({ ...humanComplete, elicitation: { clientRef: "c", requestRef: "q", assurance: "server-asserted", trace: "partial", legacyRow: { sourceRef: "row", sourceDigest: D } } }, assertNote, shownOne)); expect(() => parseEntry(partial)).toThrow(/partial/); expect(parseEntry(partial, { live: false })).toBeTruthy(); });
  it("parses the human baselines", () => { expect(parseEntry(seal(entry(humanComplete, confirmOne, shownOne)))).toBeTruthy(); expect(parseEntry(seal(entry(humanComplete, assertNote, shownOne)))).toBeTruthy(); });
  it("rejects a complete trace carrying a legacyRow", () => { const bad = seal(entry({ ...humanComplete, elicitation: { ...elicComplete, legacyRow: { sourceRef: "row", sourceDigest: D } } }, assertNote, shownOne)); expect(() => parseEntry(bad)).toThrow(/^elicitation has an unexpected/); });
  it("rejects a human assert carrying ambiguous", () => { expect(() => parseEntry(seal(entry(uiHuman, assertAmbiguous, shownOne)))).toThrow(/^action\.assert has an unexpected/); });
  it("parses an adapter preserve-source with a resolved subject version", () => { expect(parseEntry(seal(entry(adapter, preserve))).subjectVersion).toBe("sv"); });
  it("parses every Entry arm (round-trip guards N1)", () => { for (const f of [fPipe, fMcp, fUi, fElic, fAd]) expect(parseEntry(seal(R(f)))).toBeTruthy(); });
  it("parses an AI assert flagged ambiguous and an adapter row without subject version", () => { expect(parseEntry(seal(R(fPipe)))).toBeTruthy(); expect(parseEntry(seal(R(fAd))).subjectVersion).toBeNull(); });
  it("refuses a bad observedAt naming observedAt", () => { expect(() => parseEntry(seal({ ...R(fPipe), observedAt: "2026-02-30T00:00:00Z" }))).toThrow(/observedAt malformed/); });
  it.each<[string, Record<string, unknown>, RegExp]>([
    ["ai channel", entry({ ...pipe, channel: "bogus" }, assertNote), /ai actor malformed/],
    ["human channel", entry({ ...uiHuman, channel: "bogus" }, assertNote, shownOne), /human actor malformed/],
    ["exposure proposal", entry(uiHuman, assertNote, { proposal: "bogus" }), /exposure proposal malformed/],
    ["adapter channel", entry({ ...adapter, channel: "bogus" }, preserve), /adapter act malformed/],
    ["reject reason", entry(uiHuman, { kind: "reject", judged: 1, reason: "bogus" }, shownOne), /reason malformed/],
  ])("refuses invalid %s (F-4)", (_k, raw, msg) => {
    expect(() => parseEntry(seal(raw))).toThrow(msg);
  });
});
