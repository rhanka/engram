// Lot 2a type-level proof: every `@ts-expect-error` below must fail compilation
// when the transcribed shape drifts. Checked by
// `npm run test:annotation-trust-types`; vitest runs this file for its
// runtime assertions only.
import { describe, expect, it } from "vitest";
import type { AI, Entry, Human } from "../src/annotation-trust/types.js";
import { PROFILE_PIN, TEMPLATE_REF } from "../src/annotation-trust/profile.js";

const digest = "a".repeat(64);
const pipeline: AI = { kind: "ai", actorRef: "run", model: "m", channel: "pipeline",
  modelVersion: null, promptDigest: digest, runRef: "r" };
const elicited: Human = { kind: "human", actorRef: "u", receiptRef: "rc", channel: "mcp-elicitation",
  elicitation: { clientRef: "c", requestRef: "q", assurance: "server-asserted",
    trace: "partial", legacyRow: { sourceRef: "row", sourceDigest: digest } } };
const completeFields = { clientRef: "c", requestRef: "q", assurance: "server-asserted", protocolRevision: "p",
  sessionRef: "s", startedAt: "2026-11-24T00:00:00Z", endedAt: "2026-11-24T00:00:01Z", auditRef: "a" } as const;
const completeElicited: Human = { kind: "human", actorRef: "u", receiptRef: "rc", channel: "mcp-elicitation",
  elicitation: { ...completeFields, trace: "complete", requestDigest: digest, responseDigest: digest } };
const envelope = {
  stream: { scopeRef: "s", subjectRef: "o", slot: "class" },
  template: TEMPLATE_REF, profile: PROFILE_PIN,
  pinsDigest: digest, resultDigest: digest, revision: 2, expectedRevision: 1,
  replacesHuman: null as number | null, requestId: "req" as Entry["requestId"],
  commandDigest: digest, contentDigest: digest, recorderRef: "rec", policyRef: "pol",
  authorityReceiptRef: "auth", recordedAt: "2026-11-24T00:00:00Z",
  evidence: { citations: [], evidenceRefs: [] },
};
const aiAssert: Entry = { ...envelope, subjectVersion: "sv",
  actor: pipeline, action: { kind: "assert", value: { kind: "note", text: "n" } } };
const humanConfirm: Entry = { ...envelope, subjectVersion: "sv",
  actor: elicited, exposure: { proposal: "shown", shown: [1] }, action: { kind: "confirm", judged: 1 } };

describe("lot 2a discriminated types", () => {
  it("holds an AI assertion and an elicited confirmation", () => {
    expect(aiAssert.actor.kind).toBe("ai");
    expect(humanConfirm.actor.kind).toBe("human");
    expect(completeElicited.channel).toBe("mcp-elicitation");
    expect(aiAssert.action.kind).toBe("assert");
    expect(humanConfirm.action.kind).toBe("confirm");
  });
});

// @ts-expect-error AI asserts or inquires, never decides
const aiDecide: Entry = { ...envelope, subjectVersion: "sv", actor: pipeline, exposure: { proposal: "shown", shown: [1] }, action: { kind: "confirm", judged: 1 } };
// @ts-expect-error a verdict without shown exposure is refused
const verdictNotShown: Entry = { ...envelope, subjectVersion: "sv", actor: elicited, exposure: { proposal: "not-shown" }, action: { kind: "confirm", judged: 1 } };
// @ts-expect-error the modelVersion key is required even when unknown
const noModelVersion: AI = { kind: "ai", actorRef: "run", model: "m", channel: "pipeline", promptDigest: digest, runRef: "r" };
// @ts-expect-error promptDigest is required for pipeline runs
const noPromptDigest: AI = { kind: "ai", actorRef: "run", model: "m", channel: "pipeline", modelVersion: null, runRef: "r" };
// @ts-expect-error promptDigest is never null for pipeline runs
const nullPromptDigest: AI = { kind: "ai", actorRef: "run", model: "m", channel: "pipeline", modelVersion: null, promptDigest: null, runRef: "r" };
// @ts-expect-error the elicitation trace is required
const noTrace: Human = { kind: "human", actorRef: "u", receiptRef: "rc", channel: "mcp-elicitation" };
// @ts-expect-error a complete trace without digests is refused
const noCompleteDigests: Human = { kind: "human", actorRef: "u", receiptRef: "rc", channel: "mcp-elicitation", elicitation: { ...completeFields, trace: "complete" } };

void [aiDecide, verdictNotShown, noModelVersion, noPromptDigest, nullPromptDigest, noTrace, noCompleteDigests];
