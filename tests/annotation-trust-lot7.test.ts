// Lot 7: G0 corpus manifest and cross-contract fixtures (§1, §7 row 7).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { receiptDigest } from "../engram-memory/index.js";
import { captureRequest, createL3Memory, DIGEST, NOW } from "./memory-l3-fixture.js";
import { ANNOTATION_TRUST_CORPUS_DIGEST, ANNOTATION_TRUST_CORPUS_FIXTURES,
  ANNOTATION_TRUST_CORPUS_REF } from "../src/annotation-trust/corpus.js";
import { parseEntry } from "../src/annotation-trust/parse.js";
import { baseProfile, PROFILE_PIN, TEMPLATE_REF } from "../src/annotation-trust/profile.js";
import { reduceEntries } from "../src/annotation-trust/reduce.js";
import type { Entry, Human, Shown } from "../src/annotation-trust/types.js";
import { citationKey, selectTopCitations, unionCitations } from "../src/citations.js";
import { canonicalBytes, digestOfPreimage, sha256Hex } from "../src/ontology-guardian/canonical.js";
import { checkSemanticShape } from "../src/ontology-guardian/diagram-document-shape.js";
import { migrateGenericV1ToV2, type MigDocument } from "../src/ontology-guardian/diagram-migrations.js";
import { deepFreeze, normalizeOntologyProfile, validateOntologyProfile } from "../src/ontology-profile.js";
import type { CitationConfidence, OntologyCitation } from "../src/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), D = "a".repeat(64);
const pertinent = { kind: "class", vocabulary: PROFILE_PIN, code: "pertinent" } as const;
const surveiller = { kind: "class", vocabulary: PROFILE_PIN, code: "a_surveiller" } as const;
const run = (n: number) => ({ kind: "ai", actorRef: "radar-pipeline", model: "m", channel: "pipeline",
  modelVersion: "mv", promptDigest: D, runRef: `run-${n}` }) as const;
const analyst: Human = { kind: "human", actorRef: "analyst-b", receiptRef: "rc-b", channel: "ui-select" };
const shown = (n: number): Shown => ({ proposal: "shown", shown: [n] });
const seal = (o: Entry): Record<string, unknown> => {
  const { contentDigest: _d, ...rest } = o; return { ...rest, contentDigest: digestOfPreimage(rest) };
};
const env = (n: number, sub = "o", auth = "auth", evRefs: string[] = []) => ({
  stream: { scopeRef: "s", subjectRef: sub, slot: "class" }, template: TEMPLATE_REF, profile: PROFILE_PIN,
  pinsDigest: D, resultDigest: D, revision: n, expectedRevision: n - 1, replacesHuman: null,
  requestId: `77777777-7777-4777-8777-${String(n).padStart(12, "0")}` as Entry["requestId"],
  commandDigest: D, contentDigest: D, recorderRef: "rec", policyRef: "pol", authorityReceiptRef: auth,
  recordedAt: `2026-11-24T00:00:0${n}Z`, evidence: { citations: [], evidenceRefs: evRefs },
});
const replay = (sv: string, sub: string, ...fs: Entry[]) => reduceEntries(fs.map((f) => parseEntry(seal(f))),
  { stream: { scopeRef: "s", subjectRef: sub, slot: "class" }, subjectVersion: sv, vocabulary: PROFILE_PIN });
const pairView = (r: ReturnType<typeof reduceEntries>) => r.pairs.map((p) => ({
  aiRev: p.ai.revision, value: p.ai.value, author: p.ai.author,
  human: p.human, channel: p.channel, humanValue: p.humanValue, role: p.role,
}));
const crossActs = (sv = "sv1", sub = "o"): Entry[] => [
  { ...env(1, sub), subjectVersion: sv, actor: run(1), action: { kind: "assert", value: pertinent } },
  { ...env(2, sub), subjectVersion: sv, actor: run(2), action: { kind: "assert", value: surveiller } },
  { ...env(3, sub), subjectVersion: sv, actor: analyst, exposure: shown(1),
    action: { kind: "confirm", judged: 1 } },
  { ...env(4, sub), subjectVersion: sv, actor: analyst, exposure: shown(2),
    action: { kind: "reject", judged: 2, reason: "contradicted" } },
];

describe("lot 7 cross-contract fixtures and G0 corpus manifest", () => {
  it("pins G0 corpus fixtures, raw-byte digests, deep freeze and zero-I/O closure (C01-C05)", () => {
    expect(ANNOTATION_TRUST_CORPUS_REF).toBe("engram:annotation-trust-feedback-corpus/0.2.3");
    expect(ANNOTATION_TRUST_CORPUS_FIXTURES).toHaveLength(2);
    expect(ANNOTATION_TRUST_CORPUS_FIXTURES.map((f) => f.path)).toEqual([
      "tests/fixtures/annotation-trust/prefix-bindings.json",
      "tests/fixtures/annotation-trust/worked-correction.jsonld",
    ]);
    expect(new Set(ANNOTATION_TRUST_CORPUS_FIXTURES.map((f) => f.path)).size).toBe(2);
    expect(Object.isFrozen(ANNOTATION_TRUST_CORPUS_FIXTURES)).toBe(true);
    for (const f of ANNOTATION_TRUST_CORPUS_FIXTURES) {
      expect(Object.isFrozen(f)).toBe(true);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(createHash("sha256").update(readFileSync(join(ROOT, f.path))).digest("hex")).toBe(f.sha256);
    }
    const [f0, f1] = ANNOTATION_TRUST_CORPUS_FIXTURES;
    expect(ANNOTATION_TRUST_CORPUS_DIGEST).toBe(
      sha256Hex(canonicalBytes({ corpus: ANNOTATION_TRUST_CORPUS_REF, fixtures: [f0, f1] })));
    for (const bad of [
      { corpus: "engram:annotation-trust-feedback-corpus/0.2.4", fixtures: [f0, f1] },
      { corpus: ANNOTATION_TRUST_CORPUS_REF, fixtures: [{ ...f0!, path: "tests/fixtures/other.json" }, f1] },
      { corpus: ANNOTATION_TRUST_CORPUS_REF, fixtures: [{ ...f0!, sha256: "f".repeat(64) }, f1] },
    ]) expect(sha256Hex(canonicalBytes(bad))).not.toBe(ANNOTATION_TRUST_CORPUS_DIGEST);
    expect(readFileSync(join(ROOT, "src/annotation-trust/corpus.ts"), "utf8"))
      .not.toMatch(/node:|engram-memory|\bif\s*\(|\.\/export/);
  });
  it("preserves citation selection, profile policy and non-promotion of confidence_score (C06-C07)", () => {
    const bp = baseProfile();
    expect(validateOntologyProfile(bp)).toEqual([]);
    expect(normalizeOntologyProfile(bp).citation_policy.require_source_file).toBe(false);
    const conf: CitationConfidence = "EXTRACTED", cites: OntologyCitation[] = [
      { source_file: "b.md", page: 2, quote: "q1", confidence: conf },
      { source_file: "a.md", section: "s1", quote: "q2", confidence: conf },
      { source_file: "a.md", page: 1, quote: "q3", confidence: conf },
    ];
    const all = unionCitations([[cites[0]!, cites[2]!], [cites[1]!, cites[0]!]]);
    expect(all.map((c) => citationKey(c))).toEqual(["a.md||s1|", "a.md|1||", "b.md|2||"]);
    expect(selectTopCitations(all, 2).map((c) => citationKey(c))).toEqual(["a.md||s1|", "b.md|2||"]);
    expect(selectTopCitations(all, 3).map((c) => citationKey(c))).toEqual(["a.md||s1|", "a.md|1||", "b.md|2||"]);
    expect(selectTopCitations(all, 4).map((c) => citationKey(c))).toEqual(["a.md||s1|", "a.md|1||", "b.md|2||"]);
    expect(selectTopCitations(all, 0)).toEqual([]);
    const ctrl = crossActs(), [a1, a2, cf3, rj4] = ctrl;
    const cited: Entry[] = [{ ...a1!, evidence: { citations: all, evidenceRefs: ["ev-1"],
      extraction: { confidence: conf, confidence_score: 1 } } }, a2!, cf3!, rj4!];
    const pCited = replay("sv1", "o", cited[0]!), pCtrl = replay("sv1", "o", a1!);
    expect([pCited.trust, pCited.effective?.value]).toEqual(["provisional", pertinent]);
    expect([pCtrl.trust, pCtrl.effective?.value]).toEqual(["provisional", pertinent]);
    const noScore = parseEntry(seal({ ...a1!, evidence: { ...a1!.evidence, extraction: { confidence: conf } } }));
    expect(noScore.evidence.extraction?.confidence_score).toBeUndefined();
    expect(Object.hasOwn(noScore.evidence.extraction!, "confidence_score")).toBe(false);
    expect(parseEntry(seal(a1!)).evidence.extraction?.confidence_score).toBeUndefined();
    const rCited = replay("sv1", "o", ...cited), rCtrl = replay("sv1", "o", ...ctrl);
    expect([rCited.trust, rCited.effective?.value]).toEqual(["trusted", pertinent]);
    expect([rCtrl.trust, rCtrl.effective?.value]).toEqual(["trusted", pertinent]);
    expect(pairView(rCited)).toEqual(pairView(rCtrl));
    expect(rCited.pairs.map((p) => [p.ai.revision, p.role])).toEqual([[1, "anchored"], [2, "known-error"]]);
    for (const bad of [{ page: 1 }, { source_file: " " }, { source_file: " a.md" }])
      expect(() => parseEntry(seal({ ...a1!, evidence: { citations: [bad as unknown as OntologyCitation],
        evidenceRefs: [] } }))).toThrow(/evidence malformed/);
  });
  it("preserves unvalidated diagram extensions and annotation trust/pairs invariance (C08-C09)", () => {
    const ext = [{ namespace: "urn:foreign", schemaVersion: "1", scope: { kind: "document" as const },
      validation: "preserved-unvalidated" as const, contentHash: "b".repeat(64), source: "<raw/>" }];
    const raw = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/generic-v1-minimal-document.json"), "utf8"));
    const doc = deepFreeze({ schemaVersion: { major: 1, minor: 1 }, ports: {}, resources: {},
      typeDefinitions: {}, ...(raw as MigDocument), extensions: ext }) as MigDocument;
    expect(checkSemanticShape(doc)).toBeNull();
    const origBytes = canonicalBytes(doc), origSha = sha256Hex(origBytes);
    const report = migrateGenericV1ToV2(doc, { viewSchemas: {} });
    expect(report.outcome).toBe("ok");
    if (report.outcome === "ok") expect([report.target.extensions, report.target.profileRefs])
      .toEqual([ext, ["generic@2"]]);
    expect(doc.extensions).toEqual(ext);
    expect(canonicalBytes(doc)).toBe(origBytes);
    const rDiag = replay(origSha, doc.documentId, ...crossActs(origSha, doc.documentId));
    const rCtrl = replay("sv1", "o", ...crossActs());
    expect([rDiag.trust, rDiag.effective?.value]).toEqual(["trusted", pertinent]);
    expect([rCtrl.trust, rCtrl.effective?.value]).toEqual(["trusted", pertinent]);
    expect(pairView(rDiag)).toEqual(pairView(rCtrl));
    expect(rDiag.pairs.map((p) => [p.ai.revision, p.role])).toEqual([[1, "anchored"], [2, "known-error"]]);
  });
  it("references memory receipts without transitioning store or changing trust/pairs (C10)", async () => {
    const { memory, store } = createL3Memory();
    const cap = await memory.capture(captureRequest("idempotency-key-lot7-0001", "1"));
    expect(cap.ok).toBe(true);
    if (!cap.ok || cap.value.candidate_id === undefined) throw new Error("capture failed");
    const adm = await memory.requestAdmission({
      candidate_id: cap.value.candidate_id, authorization: { credential: "credential:l3" },
      deadline_at: "2026-08-16T12:40:00.000Z",
    });
    expect(adm.ok).toBe(true);
    if (!adm.ok || adm.value.record_id === undefined) throw new Error("admission failed");
    const revArg = { record_ids: [adm.value.record_id], valid_as_of: 1, system_as_of: "2",
      authorization_receipt_digest: DIGEST, operation: "recall_current" as const };
    const snapArg = { valid_as_of: 1, system_as_of: "2",
      authorization_receipt_digest: receiptDigest("fixture-auth", { now: NOW }), max_candidates: 10 };
    const beforeJ = await store.readJournal({ after: "0", limit: 10 });
    const beforeR = await store.revalidate(revArg);
    const beforeS = await store.acceptedSnapshot(snapArg);
    expect(beforeJ).toMatchObject({ ok: true, value: [{ cursor: "1", operation: "capture" },
      { cursor: "2", operation: "accept" }] });
    expect(beforeR).toMatchObject({ ok: true, value: { eligible_record_ids: [adm.value.record_id] } });
    expect(beforeS).toMatchObject({ ok: true, value: { documents: [{ record_id: adm.value.record_id }] } });
    const vetoActs = (auth = "auth", evRefs: string[] = []): Entry[] => [
      { ...env(1, "o", auth, evRefs), subjectVersion: "sv1", actor: run(1),
        action: { kind: "assert", value: pertinent } },
      { ...env(2, "o", auth, evRefs), subjectVersion: "sv1", actor: analyst, exposure: shown(1),
        action: { kind: "confirm", judged: 1 } },
      { ...env(3, "o", auth, evRefs), subjectVersion: "sv1", actor: run(3),
        action: { kind: "assert", value: surveiller } },
      { ...env(4, "o", auth, evRefs), subjectVersion: "sv1", replacesHuman: 2, actor: analyst,
        exposure: shown(1), action: { kind: "reject", judged: 1, reason: "contradicted" } },
    ];
    const rMem = replay("sv1", "o", ...vetoActs(adm.value.decision_receipt_digest, [adm.value.record_id]));
    const rCtrl = replay("sv1", "o", ...vetoActs());
    expect([rMem.trust, rMem.effective, rMem.human?.kind]).toEqual(["withheld", null, "veto"]);
    expect([rCtrl.trust, rCtrl.effective, rCtrl.human?.kind]).toEqual(["withheld", null, "veto"]);
    expect(pairView(rMem)).toEqual(pairView(rCtrl));
    expect(rMem.pairs.map((p) => [p.ai.revision, p.role])).toEqual([[1, "known-error"]]);
    expect(await store.readJournal({ after: "0", limit: 10 })).toEqual(beforeJ);
    expect(await store.revalidate(revArg)).toEqual(beforeR);
    expect(await store.acceptedSnapshot(snapArg)).toEqual(beforeS);
  });
});
