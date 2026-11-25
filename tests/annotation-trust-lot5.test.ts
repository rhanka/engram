// Lot 5: §4 evaluation pairs, roles and reports. Displayed verdicts pair anchored
// or known-error; prior judgments pair blind; later pairs win.
import { describe, expect, it } from "vitest";
import { digestOfPreimage } from "../src/ontology-guardian/canonical.js";
import { parseEntry } from "../src/annotation-trust/parse.js";
import { PROFILE_PIN, TEMPLATE_REF } from "../src/annotation-trust/profile.js";
import { reduceEntries } from "../src/annotation-trust/reduce.js";
import type { Entry, Human, Shown, Value } from "../src/annotation-trust/types.js";
const D = "a".repeat(64), D2 = "b".repeat(64);
const seal = (o: Entry): Record<string, unknown> => {
  const { contentDigest: _d, ...rest } = o;
  return { ...rest, contentDigest: digestOfPreimage(rest) };
};
const env = (n: number) => ({
  stream: { scopeRef: "s", subjectRef: "o", slot: "class" }, template: TEMPLATE_REF,
  profile: PROFILE_PIN, pinsDigest: D, resultDigest: D, revision: n,
  expectedRevision: n - 1, replacesHuman: null, commandDigest: D,
  requestId: `55555555-5555-4555-8555-${String(n).padStart(12, "0")}` as Entry["requestId"],
  contentDigest: D, recorderRef: "rec", policyRef: "pol", authorityReceiptRef: "auth",
  recordedAt: new Date(Date.UTC(2026, 10, 24, 0, 0, n)).toISOString(),
  evidence: { citations: [], evidenceRefs: [] },
});
const atSv = (sv: string, subjectRef = "o") => ({ stream: { scopeRef: "s", subjectRef, slot: "class" },
  subjectVersion: sv, vocabulary: PROFILE_PIN });
const replay = (...fs: Entry[]) => reduceEntries(fs.map((f) => parseEntry(seal(f))), atSv("sv1"));
const replayAt = (sv: string, ...fs: Entry[]) => reduceEntries(fs.map((f) => parseEntry(seal(f))), atSv(sv));
const pertinent = { kind: "class", vocabulary: PROFILE_PIN, code: "pertinent" } as const;
const watcher = { kind: "class", vocabulary: PROFILE_PIN, code: "a_surveiller" } as const;
const note = (text: string) => ({ kind: "note", text }) as const;
const run = (id: string) =>
  ({ kind: "ai", actorRef: "radar-pipeline", model: "m", channel: "pipeline",
    modelVersion: "mv", promptDigest: D, runRef: id }) as const;
const analyst: Human = { kind: "human", actorRef: "analyst-b", receiptRef: "rc-b", channel: "ui-select" };
const elicited: Human = { kind: "human", actorRef: "a-c", receiptRef: "r-c",
  channel: "mcp-elicitation", elicitation: { clientRef: "c", requestRef: "q",
  assurance: "server-asserted", trace: "complete", protocolRevision: "p", sessionRef: "s",
  requestDigest: D, responseDigest: D, startedAt: "2026-11-24T00:00:00Z",
  endedAt: "2026-11-24T00:00:01Z", auditRef: "a" } };
const shown = (n: number): Shown => ({ proposal: "shown", shown: [n] });
const ai = (n: number, value: Value = pertinent, id = `run-${n}`) =>
  ({ ...env(n), subjectVersion: "sv1", actor: run(id), action: { kind: "assert", value } }) satisfies Entry;
const confirm = (n: number, j: number, head: number | null = null) => ({ ...env(n),
  subjectVersion: "sv1", actor: analyst, exposure: shown(j),
  action: { kind: "confirm", judged: j }, replacesHuman: head }) satisfies Entry;
const correct = (n: number, j: number, head: number | null = null) => ({ ...env(n),
  subjectVersion: "sv1", actor: analyst, exposure: shown(j),
  action: { kind: "correct", judged: j, value: watcher }, replacesHuman: head }) satisfies Entry;
const hAssert = (n: number, head: number | null = null) => ({ ...env(n),
  subjectVersion: "sv1", actor: analyst, exposure: { proposal: "not-shown" },
  action: { kind: "assert", value: pertinent }, replacesHuman: head }) satisfies Entry;
const hundred = (): Entry[] => {
  const fs: Entry[] = [];
  let head: number | null = null;
  for (let i = 1; i <= 100; i++) {
    fs.push(ai(2 * i - 1, pertinent, `run-${i}`));
    fs.push(i > 81 ? correct(2 * i, 2 * i - 1, head) : confirm(2 * i, 2 * i - 1, head));
    head = 2 * i;
  }
  return fs;
};
describe("lot 5 evaluation pairs and reports", () => {
  it("100 displayed proposals pair 81 anchored and 19 known-error, never blind", () => {
    const r = replay(...hundred());
    expect(r.pairs).toHaveLength(100);
    expect(r.pairs.map((p) => p.ai.revision)).toEqual(Array.from({ length: 100 }, (_, i) => 2 * i + 1));
    expect(r.pairs[0]).toMatchObject({ human: 2, channel: "ui-select", humanValue: pertinent, role: "anchored" });
    expect(r.pairs.filter((p) => p.role === "anchored")).toHaveLength(81);
    expect(r.pairs.filter((p) => p.role === "known-error")).toHaveLength(19);
    expect(r.pairs.some((p) => p.role === "blind")).toBe(false);
  });
  it("a later rejection replaces the earlier anchored pair for the same run", () => {
    const v = { ...env(3), subjectVersion: "sv1", actor: analyst, exposure: shown(1),
      action: { kind: "reject", judged: 1, reason: "contradicted" }, replacesHuman: 2 } satisfies Entry;
    const r = replay(ai(1), confirm(2, 1), v);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]).toMatchObject({ human: 3, channel: "ui-select",
      humanValue: { rejected: "contradicted" }, role: "known-error" });
    expect(r.pairs[0]?.ai.revision).toBe(1);
  });
  it("runs B and C of the §3 worked correction stay unpaired", () => {
    const r = replay(ai(1, pertinent, "run-a"), correct(2, 1), ai(3, pertinent, "run-b"), ai(4, pertinent, "run-c"));
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]).toMatchObject({ human: 2, channel: "ui-select", role: "known-error" });
    expect(r.pairs[0]?.ai.revision).toBe(1);
    expect(r.pairs[0]?.humanValue).toEqual(watcher);
  });
  it("pairs sort by AI revision even when judged out of order", () => {
    const r = replay(ai(1), ai(2), confirm(3, 2), confirm(4, 1, 3));
    expect(r.pairs.map((p) => p.ai.revision)).toEqual([1, 2]);
  });
  it("a verdict on a human value forms no pair", () => {
    expect(replay(hAssert(1), confirm(2, 1, 1)).pairs).toEqual([]);
  });
  it("inquiries form no pair", () => {
    const u = { ...env(2), subjectVersion: "sv1", actor: analyst, exposure: shown(1),
      action: { kind: "uncertain", judged: 1 } } satisfies Entry;
    expect(replay(ai(1), u).pairs).toEqual([]);
    const q = { ...env(2), subjectVersion: "sv1", actor: analyst, exposure: shown(1),
      action: { kind: "needs-elicitation", judged: 1, question: "why?" } } satisfies Entry;
    expect(replay(ai(1), q).pairs).toEqual([]);
  });
});
