// Lot 5: §4 evaluation pairs, roles and reports. Displayed verdicts pair anchored
// or known-error; prior judgments pair blind; later pairs win.
import { describe, expect, it } from "vitest";
import { digestOfPreimage } from "../src/ontology-guardian/canonical.js";
import { parseEntry } from "../src/annotation-trust/parse.js";
import { PROFILE_PIN, TEMPLATE_REF } from "../src/annotation-trust/profile.js";
import { reduceEntries, reportEvaluation } from "../src/annotation-trust/reduce.js";
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
const ecarte = { kind: "class", vocabulary: PROFILE_PIN, code: "ecarte" } as const;
const note = (text: string) => ({ kind: "note", text }) as const;
const run = (id: string) =>
  ({ kind: "ai", actorRef: "radar-pipeline", model: "m", channel: "pipeline",
    modelVersion: "mv", promptDigest: D, runRef: id }) as const;
const mcp = (id: string, model: string, client: string) =>
  ({ kind: "ai", actorRef: `asst-${id}`, model, channel: "mcp", clientRef: client }) as const;
const analyst: Human = { kind: "human", actorRef: "analyst-b", receiptRef: "rc-b", channel: "ui-select" };
const thumb: Human = { ...analyst, channel: "ui-thumbs" };
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
  it("a prior judgment pairs blind with later runs, agreement and disagreement", () => {
    const r = replay(hAssert(1), ai(2, pertinent, "run-b"), ai(3, watcher, "run-c"));
    expect(r.pairs).toHaveLength(2);
    expect(r.pairs.every((p) => p.role === "blind" && p.human === 1)).toBe(true);
    expect(r.pairs.map((p) => p.ai.revision)).toEqual([2, 3]);
    expect(r.pairs.map((p) => p.channel)).toEqual(["ui-select", "ui-select"]);
    expect(r.pairs[0]?.humanValue).toEqual(pertinent);
    expect(r.pairs[1]?.humanValue).toEqual(pertinent);
  });
  it("a not-shown assert after an AI value forms no pair", () => {
    const c2 = { ...env(2), subjectVersion: "sv1", actor: elicited,
      exposure: shown(1), action: { kind: "confirm", judged: 1 } } satisfies Entry;
    const h3 = { ...env(3), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "not-shown" },
      action: { kind: "assert", value: pertinent }, replacesHuman: 2 } satisfies Entry;
    const r = replay(ai(1), c2, h3, ai(4, pertinent, "run-b"));
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]).toMatchObject({ ai: { revision: 1 }, human: 2, role: "anchored", channel: "mcp-elicitation" });
  });
  it("a blind pair and a later verdict coexist on one run", () => {
    const r = replay(hAssert(1), ai(2, pertinent, "run-b"), confirm(3, 2, 1));
    expect(r.pairs).toHaveLength(2);
    expect(r.pairs.map((p) => p.role)).toEqual(["blind", "anchored"]);
    expect(r.pairs.map((p) => p.channel)).toEqual(["ui-select", "ui-select"]);
    expect(r.pairs[1]?.humanValue).toEqual(pertinent);
  });
  it("the latest blind pair wins per AI revision", () => {
    const h2 = { ...env(2), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "not-shown" },
      action: { kind: "assert", value: watcher }, replacesHuman: 1 } satisfies Entry;
    const r = replay(hAssert(1), h2, ai(3));
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]).toMatchObject({ human: 2, role: "blind" });
    expect(r.pairs[0]?.humanValue).toEqual(watcher);
  });
  it("a prior judgment pairs blind at any read version, same-version AI only", () => {
    const other = { ...env(3), subjectVersion: "sv2", actor: run("run-c"),
      action: { kind: "assert", value: pertinent } } satisfies Entry;
    expect(replay(hAssert(1), ai(2, pertinent, "run-b"), other).pairs).toHaveLength(1);
    const r = replayAt("sv2", hAssert(1), ai(2, pertinent, "run-b"));
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]).toMatchObject({ human: 1, role: "blind" });
    expect(r.pairs[0]?.ai.revision).toBe(2);
    const a0 = { ...env(1), subjectVersion: "sv0", actor: run("run-a"),
      action: { kind: "assert", value: pertinent } } satisfies Entry;
    expect(replay(a0, hAssert(2), ai(3, pertinent, "run-b")).pairs).toEqual([]);
  });
  it("a shown assert pairs anchored when equal, known-error when different", () => {
    const eq = { ...env(2), subjectVersion: "sv1", actor: analyst,
      exposure: shown(1), action: { kind: "assert", value: pertinent } } satisfies Entry;
    expect(replay(ai(1), eq).pairs[0]).toMatchObject({ human: 2, role: "anchored", channel: "ui-select" });
    const diff = { ...env(2), subjectVersion: "sv1", actor: analyst,
      exposure: shown(1), action: { kind: "assert", value: watcher } } satisfies Entry;
    const r = replay(ai(1), diff);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]).toMatchObject({ human: 2, role: "known-error", channel: "ui-select" });
    expect(r.pairs[0]?.humanValue).toEqual(watcher);
  });
  it("shown lists that never name a same-version earlier AI form no pair", () => {
    const h2 = { ...env(2), subjectVersion: "sv1", actor: analyst,
      exposure: shown(1), action: { kind: "assert", value: pertinent }, replacesHuman: 1 } satisfies Entry;
    expect(replay(hAssert(1), h2).pairs).toEqual([]);
    const a1 = { ...env(1), subjectVersion: "sv2", actor: run("run-a"),
      action: { kind: "assert", value: pertinent } } satisfies Entry;
    const h2b = { ...env(2), subjectVersion: "sv1", actor: analyst,
      exposure: shown(1), action: { kind: "assert", value: pertinent } } satisfies Entry;
    expect(replay(a1, h2b).pairs).toEqual([]);
    const h1 = { ...env(1), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "shown", shown: [2] },
      action: { kind: "assert", value: pertinent } } satisfies Entry;
    expect(replay(h1, ai(2)).pairs).toEqual([]);
  });
  it("a correction of a human value pairs its shown AI revisions", () => {
    const h2 = { ...env(2), subjectVersion: "sv1", actor: analyst,
      exposure: shown(1), action: { kind: "assert", value: watcher } } satisfies Entry;
    const c3 = { ...env(3), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "shown", shown: [1, 2] },
      action: { kind: "correct", judged: 2, value: pertinent }, replacesHuman: 2 } satisfies Entry;
    const r = replay(ai(1), h2, c3);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]).toMatchObject({ human: 3, role: "anchored" });
    expect(r.pairs[0]?.ai.revision).toBe(1);
    expect(r.pairs[0]?.humanValue).toEqual(pertinent);
  });
  it("notes form no evaluation pair", () => {
    const n1 = { ...env(1), subjectVersion: "sv1", actor: run("run-a"),
      action: { kind: "assert", value: note("n") } } satisfies Entry;
    const c2 = { ...env(2), subjectVersion: "sv1", actor: analyst,
      exposure: shown(1), action: { kind: "confirm", judged: 1 } } satisfies Entry;
    const r2 = { ...env(2), subjectVersion: "sv1", actor: analyst, exposure: shown(1),
      action: { kind: "reject", judged: 1, reason: "contradicted" } } satisfies Entry;
    expect(replay(n1, c2).pairs).toEqual([]);
    expect(replay(n1, r2).pairs).toEqual([]);
    const qbNote = { ...env(2), subjectVersion: "sv1", actor: analyst, exposure: shown(1),
      action: { kind: "assert", value: note("private text") } } satisfies Entry;
    const qb = replay(ai(1), qbNote);
    expect(qb.pairs).toEqual([]);
    expect(reportEvaluation(qb.pairs)).toEqual([]);
    const qb3 = { ...qbNote, ...env(3), replacesHuman: 2 } satisfies Entry;
    expect(reportEvaluation(replay(ai(1), confirm(2, 1), qb3).pairs)[0]).toMatchObject(
      { anchored: 1, knownErrors: 0, blind: 0, rate: null, confusions: [] });
    const corrNote = { ...env(3), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "shown", shown: [1, 2] },
      action: { kind: "correct", judged: 2, value: note("revised") }, replacesHuman: 2 } satisfies Entry;
    expect(replay(ai(1), qbNote, corrNote).pairs).toEqual([]);
    const qcNote = { ...env(1), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "not-shown" }, action: { kind: "assert", value: note("private") } } satisfies Entry;
    const qc = replay(qcNote, ai(2));
    expect(qc.pairs).toEqual([]);
    expect(reportEvaluation(qc.pairs)).toEqual([]);
    const quNote = { ...env(2), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "unknown" }, action: { kind: "assert", value: note("legacy") } } satisfies Entry;
    expect(reduceEntries([ai(1), quNote].map((f) => parseEntry(seal(f), { live: false })), atSv("sv1")).pairs)
      .toEqual([]);
  });
  it("unknown records pair unscored with same-version AI values", () => {
    const u = { ...env(1), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "unknown" }, action: { kind: "assert", value: pertinent } } satisfies Entry;
    const r = reduceEntries([u, ai(2)].map((f) => parseEntry(seal(f), { live: false })), atSv("sv1"));
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]).toMatchObject({ human: 1, role: "unscored" });
    expect(reportEvaluation(r.pairs)[0]).toMatchObject(
      { rate: null, knownErrors: 0, anchored: 0, ceiling: null, unscored: 1 });
    const u2 = { ...env(2), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "unknown" }, action: { kind: "assert", value: pertinent } } satisfies Entry;
    const r2 = reduceEntries([ai(1), u2].map((f) => parseEntry(seal(f), { live: false })), atSv("sv1"));
    expect(r2.pairs).toHaveLength(1);
    expect(r2.pairs[0]).toMatchObject({ human: 2, role: "unscored" });
  });
  it("100 displayed proposals give no rate, 19 known errors and a 0.81 ceiling", () => {
    const g = reportEvaluation(replay(...hundred()).pairs);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ blind: 0, rate: null, knownErrors: 19, anchored: 81 });
    expect(g[0]?.ceiling).toBeCloseTo(0.81, 10);
    expect(g[0]?.confusions).toHaveLength(1);
    expect(g[0]?.confusions[0]).toMatchObject({ count: 19 });
  });
  it("blind agreements over blind pairs yield the rate", () => {
    const g = reportEvaluation(replay(hAssert(1), ai(2, pertinent, "run-b"), ai(3, watcher, "run-c")).pairs);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ blind: 2, agreements: 1, rate: 0.5, knownErrors: 0, anchored: 0, ceiling: null });
  });
  it("anchored confirmations stay out of the rate", () => {
    const r = replay(hAssert(1), ai(2, pertinent, "run-b"), ai(3, watcher, "run-c"), confirm(4, 3, 1));
    expect(reportEvaluation(r.pairs)[0]).toMatchObject({ blind: 2, agreements: 1, rate: 0.5, anchored: 1, ceiling: 1 });
  });
  it("known errors keep full ai-to-human confusions", () => {
    const a3 = { ...env(3), subjectVersion: "sv1", actor: run("run-c"),
      action: { kind: "assert", value: ecarte } } satisfies Entry;
    const v6 = { ...env(6), subjectVersion: "sv1", actor: analyst, exposure: shown(5),
      action: { kind: "reject", judged: 5, reason: "contradicted" } } satisfies Entry;
    const v8 = { ...env(8), subjectVersion: "sv1", actor: analyst, exposure: shown(7),
      action: { kind: "reject", judged: 7, reason: "duplicate" } } satisfies Entry;
    const r = replay(ai(1, pertinent, "run-a"), correct(2, 1), a3, correct(4, 3, 2),
      ai(5, pertinent, "run-d"), v6, ai(7, pertinent, "run-e"), v8);
    const g = reportEvaluation(r.pairs);
    expect(g).toHaveLength(1);
    expect(g[0]?.confusions).toEqual([
      { ai: pertinent, human: watcher, count: 1 },
      { ai: ecarte, human: watcher, count: 1 },
      { ai: pertinent, human: { rejected: "contradicted" }, count: 1 },
      { ai: pertinent, human: { rejected: "duplicate" }, count: 1 },
    ]);
  });
  it("reports group by model, version, digest, channel and client", () => {
    const actors = [run("ra"), { ...run("rb"), modelVersion: null }, { ...run("rc"), promptDigest: D2 },
      mcp("d", "dm", "c1"), mcp("e", "dm", "c2")];
    const fs: Entry[] = [];
    let head: number | null = null;
    actors.forEach((actor, i) => {
      const n = 2 * i + 1;
      fs.push({ ...env(n), subjectVersion: "sv1", actor,
        action: { kind: "assert", value: pertinent } } satisfies Entry);
      fs.push({ ...env(n + 1), subjectVersion: "sv1", actor: analyst,
        exposure: shown(n), action: { kind: "confirm", judged: n }, replacesHuman: head } satisfies Entry);
      head = n + 1;
    });
    const g = reportEvaluation(reduceEntries(fs.map((f) => parseEntry(seal(f))), atSv("sv1")).pairs);
    expect(g).toHaveLength(5);
    expect(g.map((x) => x.model)).toEqual(["m", "m", "m", "dm", "dm"]);
    expect(g.map((x) => x.ceiling)).toEqual([1, 1, 1, 1, 1]);
    expect(g.map((x) => x.modelVersion)).toEqual(["mv", null, "mv", null, null]);
    expect(g.map((x) => x.promptDigest)).toEqual([D, D, D2, null, null]);
    expect(g.map((x) => x.channel)).toEqual(["ui-select", "ui-select", "ui-select", "ui-select", "ui-select"]);
    expect(g.map((x) => x.declared)).toEqual([false, false, false, true, true]);
    expect(g.map((x) => x.clientRef)).toEqual([null, null, null, "c1", "c2"]);
  });
  it("reports group by the pair human channel", () => {
    const c3 = { ...env(3), subjectVersion: "sv1", actor: thumb, exposure: shown(2),
      action: { kind: "confirm", judged: 2 }, replacesHuman: 1 } satisfies Entry;
    const g = reportEvaluation(replay(hAssert(1), ai(2), c3).pairs);
    expect(g).toHaveLength(2);
    expect(g.map((x) => x.channel)).toEqual(["ui-select", "ui-thumbs"]);
  });
  it("a correction pins its new value provenance to its own record", () => {
    const c2 = correct(2, 1);
    const r = replay(ai(1), c2);
    expect(r.effective?.contentDigest).toBe(seal(c2).contentDigest as string);
    expect(r.effective?.createdAt).toBe(c2.recordedAt);
    expect(r.effective?.author.actorRef).toBe("analyst-b");
    expect(r.effective?.lastReviewedAt).toBeNull();
  });
  it("zero rate and zero ceiling stay 0 rather than null", () => {
    const r1 = reportEvaluation(replay(hAssert(1), ai(2, watcher)).pairs);
    expect(r1).toHaveLength(1);
    expect(r1[0]).toMatchObject({ blind: 1, agreements: 0, rate: 0, ceiling: null });
    const r2 = reportEvaluation(replay(ai(1), correct(2, 1)).pairs);
    expect(r2).toHaveLength(1);
    expect(r2[0]).toMatchObject({ knownErrors: 1, anchored: 0, ceiling: 0, rate: null });
  });
  it("unscored pairs stay out of both rate and ceiling in mixed groups", () => {
    const u1 = { ...env(1), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "unknown" }, action: { kind: "assert", value: pertinent } } satisfies Entry;
    const fs = [u1, hAssert(2, 1), ai(3, watcher), ai(4, pertinent), confirm(5, 4, 2)];
    const r = reduceEntries(fs.map((f) => parseEntry(seal(f), { live: false })), atSv("sv1"));
    const g = reportEvaluation(r.pairs);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      blind: 2, agreements: 1, rate: 0.5, anchored: 1, knownErrors: 0, unscored: 1, ceiling: 1,
    });
  });
  it("unknown scope, other-slot displacement and AI-note prior barrier", () => {
    const unk = (n: number, sv = "sv1", head: number | null = null) => ({ ...env(n),
      subjectVersion: sv, actor: analyst, exposure: { proposal: "unknown" },
      action: { kind: "assert", value: pertinent }, replacesHuman: head }) satisfies Entry;
    const imp = (...fs: Entry[]) =>
      reduceEntries(fs.map((f) => parseEntry(seal(f), { live: false })), atSv("sv1"));
    const r1 = imp(ai(1), unk(2), ai(3));
    expect(r1.pairs.map((p) => [p.ai.revision, p.human, p.role])).toEqual([[1, 2, "unscored"]]);
    expect(imp(ai(1), unk(2, "sv2")).pairs).toEqual([]);
    const r3 = imp(ai(1), confirm(2, 1), unk(3, "sv1", 2));
    expect(r3.pairs.map((p) => [p.ai.revision, p.human, p.role])).toEqual([[1, 3, "unscored"]]);
    expect(replay(ai(1, note("n")), hAssert(2), ai(3)).pairs).toEqual([]);
  });
  it("a correction of a human value to a different class pairs known-error", () => {
    const h2 = { ...env(2), subjectVersion: "sv1", actor: analyst,
      exposure: shown(1), action: { kind: "assert", value: watcher } } satisfies Entry;
    const c3 = { ...env(3), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "shown", shown: [1, 2] },
      action: { kind: "correct", judged: 2, value: ecarte }, replacesHuman: 2 } satisfies Entry;
    const r = replay(ai(1), h2, c3);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]).toMatchObject({ ai: { revision: 1 }, human: 3,
      role: "known-error", humanValue: ecarte });
  });
  it("blind agreements and confusions compare vocabulary pins", () => {
    const otherPin = { id: "other", version: "0.0.1", contentDigest: D } as const;
    const otherPert = { kind: "class", vocabulary: otherPin, code: "pertinent" } as const;
    const otherWatch = { kind: "class", vocabulary: otherPin, code: "a_surveiller" } as const;
    const h1 = { ...env(1), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "not-shown" }, action: { kind: "assert", value: otherPert } } satisfies Entry;
    const g1 = reportEvaluation(replay(h1, ai(2, pertinent)).pairs);
    expect(g1).toHaveLength(1);
    expect(g1[0]).toMatchObject({ blind: 1, agreements: 0, rate: 0 });
    const h4 = { ...env(4), subjectVersion: "sv1", actor: analyst, exposure: shown(3),
      action: { kind: "assert", value: watcher }, replacesHuman: 2 } satisfies Entry;
    const h6 = { ...env(6), subjectVersion: "sv1", actor: analyst, exposure: shown(5),
      action: { kind: "assert", value: otherWatch }, replacesHuman: 4 } satisfies Entry;
    const g2 = reportEvaluation(replay(
      ai(1, pertinent), correct(2, 1), ai(3, otherPert), h4, ai(5, pertinent), h6).pairs);
    expect(g2).toHaveLength(1);
    expect(g2[0]?.confusions).toHaveLength(3);
  });
  it("reports pin model key, repeated rejections and mixed-role ratios", () => {
    const m2 = { ...env(3), subjectVersion: "sv1", actor: { ...run("rb"), model: "m2" },
      action: { kind: "assert", value: pertinent } } satisfies Entry;
    const gm = reportEvaluation(replay(ai(1), confirm(2, 1), m2, confirm(4, 3, 2)).pairs);
    expect(gm.map((x) => x.model)).toEqual(["m", "m2"]);
    const rej = (n: number, j: number) => ({ ...env(n), subjectVersion: "sv1", actor: analyst,
      exposure: shown(j), action: { kind: "reject", judged: j, reason: "contradicted" } }) satisfies Entry;
    const gr = reportEvaluation(replay(ai(1), rej(2, 1), ai(3), rej(4, 3)).pairs);
    expect(gr).toHaveLength(1);
    expect(gr[0]).toMatchObject({ knownErrors: 2, anchored: 0, ceiling: 0, unscored: 0,
      confusions: [{ ai: pertinent, human: { rejected: "contradicted" }, count: 2 }] });
    const u1 = { ...env(1), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "unknown" }, action: { kind: "assert", value: pertinent } } satisfies Entry;
    const mixed = [u1, hAssert(2, 1), ai(3, watcher), ai(4, pertinent), ai(5, pertinent),
      confirm(6, 4, 2), correct(7, 5, 6)].map((f) => parseEntry(seal(f), { live: false }));
    const g = reportEvaluation(reduceEntries(mixed, atSv("sv1")).pairs);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ blind: 3, agreements: 2, anchored: 1, knownErrors: 1, unscored: 1,
      ceiling: 0.5, confusions: [{ ai: pertinent, human: watcher, count: 1 }] });
    expect(g[0]?.rate).toBeCloseTo(2 / 3, 10);
  });
  it("pairShown iterates all shown AI revisions and compares vocabulary pins", () => {
    const c3 = { ...correct(3, 1), exposure: { proposal: "shown", shown: [1, 2] } } satisfies Entry;
    const r1 = replay(ai(1, pertinent), ai(2, watcher), c3);
    expect(r1.pairs.map((p) => [p.ai.revision, p.role])).toEqual([[1, "known-error"], [2, "anchored"]]);
    const otherPin = { id: "other", version: "0.0.1", contentDigest: D } as const;
    const otherPert = { kind: "class", vocabulary: otherPin, code: "pertinent" } as const;
    const h2 = { ...env(2), subjectVersion: "sv1", actor: analyst,
      exposure: shown(1), action: { kind: "assert", value: otherPert } } satisfies Entry;
    const r2 = replay(ai(1, pertinent), h2);
    expect(r2.pairs.map((p) => p.role)).toEqual(["known-error"]);
  });
  it("preserve-source blocks subsequent blind pairing and unknown forward-pairing (O-2)", () => {
    const ps = (n: number, sv: string | null = "sv1") => ({
      ...env(n), subjectVersion: sv, actor: { kind: "adapter", actorRef: "imp", channel: "import" },
      action: { kind: "preserve-source", row: { sourceRef: "legacy-1", sourceDigest: D } },
    }) satisfies Entry;
    const unk = (n: number) => ({
      ...env(n), subjectVersion: "sv1", actor: analyst,
      exposure: { proposal: "unknown" }, action: { kind: "assert", value: pertinent },
    }) satisfies Entry;
    const imp = (...fs: Entry[]) =>
      reduceEntries(fs.map((f) => parseEntry(seal(f), { live: false })), atSv("sv1"));
    expect(replay(ps(1), hAssert(2), ai(3)).pairs).toEqual([]);
    expect(replay(ps(1, null), hAssert(2), ai(3)).pairs).toEqual([]);
    expect(imp(ps(1), unk(2), ai(3)).pairs).toEqual([]);
    expect(imp(ps(1, null), unk(2), ai(3)).pairs).toEqual([]);
    expect(imp(ai(1), ps(2), unk(3), ai(4)).pairs.map((p) => [p.ai.revision, p.human, p.role]))
      .toEqual([[1, 3, "unscored"]]);
    expect(imp(unk(1), ps(2), ai(3)).pairs.map((p) => [p.ai.revision, p.human, p.role]))
      .toEqual([[3, 1, "unscored"]]);
  });
});
