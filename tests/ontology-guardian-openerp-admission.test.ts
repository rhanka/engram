// G0 admission of the openerp records (SPEC-openerp-ontology §1.5, G0 §5.5).
// FX-OP-03 observable table (§10 line -> deciding operation -> submitted input):
// | extra field refuses closure | NONE (no G0 runtime validator; compiler only, see typeproof.ts:75) | widened record NOT submitted (no operation) -> not-covered GAP-OP-03 |
// | corpusRef unresolved instead of omission refuses closure | NONE (no G0 runtime validator; compiler only, see typeproof.ts:82) | unresolved-corpus record NOT submitted (no operation) -> not-covered GAP-OP-03 |
// | admission without family-corpus refuses missing-receipt at complete/skeleton | checkAdmission (src/ontology-guardian/admission.ts:445) | recordToEntry(RECORD_OPENERP_V1, OPENERP_PIN, TEST_CORPUS_DIGEST) + [] |
// | pass receipt with unresolved resultEvidence refuses | checkAdmission (src/ontology-guardian/admission.ts:445) | entry + familyCorpusReceipt with unresolved evaluatedStack.resultEvidence |
// Draft truth: no receipt exists (OQ-OP-08), so every record refuses with
// missing-receipt. The gate behavior itself (admit on complete evidence,
// refuse on any removal or unresolved evidence) is proven with test-only
// synthetic evidence on resolved-evidence variants — never as corpus
// evidence. Corpus stays absent on the draft (no unresolved encoding).
import { describe, expect, it } from "vitest";
import { checkAdmission, deriveRequirements } from "../src/ontology-guardian/admission.js";
import type { AdmissionEntry } from "../src/ontology-guardian/admission.js";
import { pinsDigestOf } from "../src/ontology-guardian/digests.js";
import type { Digest, OntologyRecord, Pin } from "../src/ontology-guardian/types.js";
import type { Receipt } from "../src/ontology-guardian/catalog.js";
import {
  OPENERP_CONTENT_DIGEST,
  OPENERP_PIN,
  OPENERP_PINS_DIGEST,
  OPENERP_RESULT_DIGEST,
} from "../src/ontology-guardian/openerp-profile.js";
import {
  OPENERP_ARTIFACT_BINDING,
  OPENERP_CATALOG_STATIC,
  OPENERP_FIXTURE_COVERAGE,
  OPENERP_G0_CONTRACT_GAPS,
  OPENERP_LINEAGE_MAPPINGS,
  RECORD_OPENERP_V1,
  RECORD_OPENERP_V2_SUCCESSOR,
  SUCCESSOR_V2_DIGESTS,
  SUCCESSOR_V2_PIN,
} from "../src/ontology-guardian/openerp-registry.js";

const TEST_CORPUS_DIGEST = "c".repeat(64) as Digest;

/** Test-only record→entry mapping (family EXT, sheetless scope). */
function recordToEntry(record: OntologyRecord, pin: Pin, corpusDigest: Digest): AdmissionEntry {
  return {
    family: "EXT",
    artifactKind: record.artifactKind,
    profileShape: record.profileShape,
    generatedBpmn: false,
    qualificationScope: {
      libraries: [{ id: "openerp-corpus-validator", version: "1.0.0" }],
      proofSets: [],
      selections: [{ phase: "ontology", readinessPolicy: "draft" }],
    },
    ruleSheetRuleIds: [],
    stack: [pin],
    pinsDigest: pinsDigestOf({ layers: [pin] }),
    resultEvidence: record.digests!.resultEvidence,
    profilePin: pin,
    corpusDigest,
    selections: [],
    ruleSheetPins: [],
    visibility: "public",
  };
}

function familyCorpusReceipt(entry: AdmissionEntry, digest: Digest): Receipt {
  return {
    receiptKind: "family-corpus",
    libraryId: "openerp-corpus-validator",
    libraryVersion: "1.0.0",
    corpusDigest: entry.corpusDigest,
    validatorRole: "retained-check",
    verdict: "pass",
    issuedAt: "2026-10-27",
    evaluatedStack: {
      stack: [...entry.stack],
      pinsDigest: entry.pinsDigest,
      resultEvidence: { evidenceState: "resolved", digest },
    },
    family: "EXT",
    fixtureDigest: entry.corpusDigest,
    severityPolicyDigest: null,
    ruleVerdicts: [],
  } as Receipt;
}

describe("§1.3 record closure (FX-OP-03)", () => {
  it("holds the exact closed field set with corpusRef absent", () => {
    expect(Object.keys(RECORD_OPENERP_V1).sort()).toEqual(
      [
        "artifactKind",
        "completeness",
        "consumers",
        "digests",
        "id",
        "lifecycle",
        "lineage",
        "namespace",
        "owner",
        "profileRef",
        "profileShape",
        "version",
        "visibility",
      ].sort(),
    );
    expect("corpusRef" in RECORD_OPENERP_V1).toBe(false);
    expect("catalogEntryRef" in RECORD_OPENERP_V1).toBe(false);
    expect("migrationRef" in RECORD_OPENERP_V1).toBe(false);
    expect("supersededBy" in RECORD_OPENERP_V1).toBe(false);
  });

  it("carries identity, digests and lineage from the exact preimages", () => {
    expect([RECORD_OPENERP_V1.namespace, RECORD_OPENERP_V1.id, RECORD_OPENERP_V1.version]).toEqual([
      "openerp",
      "openerp",
      "1",
    ]);
    expect(RECORD_OPENERP_V1.owner).toBe("openerp");
    expect(RECORD_OPENERP_V1.lifecycle).toBe("draft");
    expect(RECORD_OPENERP_V1.completeness).toBe("complete");
    expect(RECORD_OPENERP_V1.profileRef).toEqual({
      canonicalRef: "openerp@1",
      contentDigest: OPENERP_CONTENT_DIGEST,
    });
    expect(RECORD_OPENERP_V1.digests).toEqual({
      contentDigest: OPENERP_CONTENT_DIGEST,
      pinsDigest: OPENERP_PINS_DIGEST,
      resultEvidence: { evidenceState: "resolved", digest: OPENERP_RESULT_DIGEST },
    });
    expect(RECORD_OPENERP_V1.lineage).toEqual({ parents: [], mappings: [...OPENERP_LINEAGE_MAPPINGS], migrations: [] });
    expect(RECORD_OPENERP_V1.consumers).toEqual([]);
  });

  it("binds the catalog profile variant without inventing payload values", () => {
    expect(OPENERP_ARTIFACT_BINDING).toEqual({
      artifactKind: "profile",
      profilePin: OPENERP_PIN,
      stack: [OPENERP_PIN],
    });
    expect(OPENERP_CATALOG_STATIC.profilePin).toEqual(OPENERP_PIN);
    expect(OPENERP_CATALOG_STATIC.conflictPolicy).toContain("never silent overwrite");
    expect(OPENERP_CATALOG_STATIC.provenance.sourceRevision).toBe("d06d5ece");
    expect(OPENERP_CATALOG_STATIC.licenceLicences).toEqual(["MIT"]);
  });

  it("documents FX-OP-03 record closure as not-covered (GAP-OP-03)", () => {
    expect(OPENERP_FIXTURE_COVERAGE["FX-OP-03"]).toEqual({ status: "not-covered", gap: "GAP-OP-03" });
    expect(OPENERP_G0_CONTRACT_GAPS.find((g) => g.id === "GAP-OP-03")).toMatchObject({ owner: "engram" });
    expect("corpusRef" in RECORD_OPENERP_V1).toBe(false);
    expect("catalogEntryRef" in RECORD_OPENERP_V1).toBe(false);
  });

  it.todo("FX-OP-03 record closure (extra field): missing G0 record-closure validator (GAP-OP-03, owner engram)");

  it.todo("FX-OP-03 record closure (corpusRef unresolved): missing G0 record-closure validator (GAP-OP-03, owner engram)");
});

describe("§5.5 admission verdicts on openerp records", () => {
  const entries = [
    { record: RECORD_OPENERP_V1, pin: OPENERP_PIN },
    { record: RECORD_OPENERP_V2_SUCCESSOR, pin: SUCCESSOR_V2_PIN },
  ] as const;

  it("derives exactly one obligation per record (family-corpus for EXT)", () => {
    for (const { record, pin } of entries) {
      const entry = recordToEntry(record, pin, TEST_CORPUS_DIGEST);
      expect(deriveRequirements(entry)).toEqual([
        { receiptKind: "family-corpus", libraryId: "openerp-corpus-validator", libraryVersion: "1.0.0" },
      ]);
    }
  });

  it("refuses every record without receipts (OQ-OP-08 evidence outstanding)", () => {
    for (const { record, pin } of entries) {
      const entry = recordToEntry(record, pin, TEST_CORPUS_DIGEST);
      const verdict = checkAdmission({ entry, receipts: [] });
      expect(verdict.admitted).toBe(false);
      if (verdict.admitted !== false) throw new Error("admission");
      expect(verdict.code).toBe("missing-receipt");
    }
  });

  it("refuses at skeleton completeness with the same missing-receipt code", () => {
    const skeleton = { ...RECORD_OPENERP_V1, completeness: "skeleton" } as OntologyRecord;
    const entry = recordToEntry(skeleton, OPENERP_PIN, TEST_CORPUS_DIGEST);
    const verdict = checkAdmission({ entry, receipts: [] });
    expect(verdict.admitted).toBe(false);
    if (verdict.admitted !== false) throw new Error("admission");
    expect(verdict.code).toBe("missing-receipt");
  });

  it("refuses a pass receipt with unresolved result evidence (FX-RCPT-UNRESOLVED)", () => {
    const entry = recordToEntry(RECORD_OPENERP_V1, OPENERP_PIN, TEST_CORPUS_DIGEST);
    const receipt = {
      ...familyCorpusReceipt(entry, OPENERP_RESULT_DIGEST),
      evaluatedStack: {
        stack: [OPENERP_PIN],
        pinsDigest: entry.pinsDigest,
        resultEvidence: { evidenceState: "unresolved" },
      },
    } as Receipt;
    const verdict = checkAdmission({ entry, receipts: [receipt] });
    expect(verdict.admitted).toBe(false);
    if (verdict.admitted !== false) throw new Error("admission");
    expect(verdict.code).toBe("missing-receipt");
  });

  it("admits a resolved-evidence variant with test-only evidence and refuses on removal", () => {
    const entry = recordToEntry(RECORD_OPENERP_V1, OPENERP_PIN, TEST_CORPUS_DIGEST);
    const receipt = familyCorpusReceipt(entry, OPENERP_RESULT_DIGEST);
    expect(checkAdmission({ entry, receipts: [receipt] })).toEqual({ admitted: true });
    expect(checkAdmission({ entry, receipts: [] }).admitted).toBe(false);
    const tampered = { ...receipt, corpusDigest: "d".repeat(64) } as Receipt;
    expect(checkAdmission({ entry, receipts: [tampered] }).admitted).toBe(false);
  });

  it("carries the successor pins without touching the v1 record (G0 R-2)", () => {
    expect(SUCCESSOR_V2_PIN).toEqual({
      id: "openerp",
      version: "2",
      contentDigest: SUCCESSOR_V2_DIGESTS.contentDigest,
    });
    expect(RECORD_OPENERP_V2_SUCCESSOR.profileRef).toEqual({
      canonicalRef: "openerp@2",
      contentDigest: SUCCESSOR_V2_DIGESTS.contentDigest,
    });
    expect(RECORD_OPENERP_V1.digests!.contentDigest).toBe(OPENERP_CONTENT_DIGEST);
  });
});
