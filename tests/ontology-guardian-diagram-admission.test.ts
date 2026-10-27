// G0 admission of the diagram lot records (frozen spec M3-R4 deb64b75, §7.4).
// S1 truth: no receipt exists (U-QUAL), so every governed record refuses with
// missing-receipt. The gate behavior itself (admit on complete evidence,
// refuse on any removal) is proven with test-only synthetic evidence on
// resolved-evidence variants — never as corpus evidence. The A.3 specimen
// additionally exercises the record→entry→requirement mapping on fixture data.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = process.env.DIAGRAM_TESTS_DIR ?? dirname(fileURLToPath(import.meta.url));

import { checkAdmission, deriveRequirements } from "../src/ontology-guardian/admission.js";
import type { AdmissionEntry } from "../src/ontology-guardian/admission.js";
import { pinsDigestOf } from "../src/ontology-guardian/digests.js";
import type { Digest, OntologyRecord, Pin } from "../src/ontology-guardian/types.js";
import type { Receipt } from "../src/ontology-guardian/catalog.js";
import {
  ARCHIMATE_V2_PIN,
  CONTRACT_PIN,
  ENVELOPE_ARCHIMATE_V2,
  ENVELOPE_CONTRACT,
  ENVELOPE_GENERIC_V2,
  ENVELOPE_UML_V2,
  GENERIC_V2_PIN,
  PAYLOAD_ARCHIMATE_V2,
  PAYLOAD_CONTRACT,
  PAYLOAD_GENERIC_V2,
  PAYLOAD_UML_V2,
  RECORD_ARCHIMATE_V1,
  RECORD_ARCHIMATE_V2,
  RECORD_CONTRACT,
  RECORD_GENERIC_V1,
  RECORD_GENERIC_V2,
  RECORD_UML_V1,
  RECORD_UML_V2,
  SUPERSESSION,
  UML_V2_PIN,
  contractBindingOf,
} from "../src/ontology-guardian/diagram-registry.js";
import { DIAGRAM_PRESENTATION_CONTRACT_SCHEMA } from "../src/ontology-guardian/diagram-schemas.js";

const specimen = JSON.parse(
  readFileSync(join(testsDir, "fixtures", "pinned-sources", "m3-a3-serialization-specimen.json"), "utf8"),
);

/** Test-only record→entry mapping (§7.4.5 step 1: obligations from the entry). */
function recordToEntry(record: OntologyRecord, pin: Pin, corpusDigest: Digest): AdmissionEntry {
  const contract = record.artifactKind === "contract";
  return {
    family: "DIA",
    artifactKind: record.artifactKind,
    profileShape: record.profileShape,
    generatedBpmn: false,
    qualificationScope: {
      libraries: [{ id: "diagram-corpus-validator", version: "1.0.0" }],
      proofSets: [],
      selections: [{ phase: "diagram", readinessPolicy: "draft" }],
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
    ...(contract
      ? {
          contractSchemaPin: DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.pin,
          compatibilityMatrixVersion: "1",
        }
      : {}),
  };
}

function familyCorpusReceipt(entry: AdmissionEntry, digest: Digest): Receipt {
  return {
    receiptKind: "family-corpus",
    libraryId: "diagram-corpus-validator",
    libraryVersion: "1.0.0",
    corpusDigest: entry.corpusDigest,
    validatorRole: "retained-check",
    verdict: "pass",
    issuedAt: "2026-10-27",
    evaluatedStack: { stack: [...entry.stack], pinsDigest: entry.pinsDigest, resultEvidence: { evidenceState: "resolved", digest } },
    family: "DIA",
    fixtureDigest: entry.corpusDigest,
    severityPolicyDigest: null,
    ruleVerdicts: [],
  } as Receipt;
}

describe("§7.4.2 family field mapping", () => {
  const rows = [
    { record: RECORD_GENERIC_V2, pin: GENERIC_V2_PIN, payload: PAYLOAD_GENERIC_V2, envelope: ENVELOPE_GENERIC_V2, canonicalRef: "engram:generic@2" },
    { record: RECORD_ARCHIMATE_V2, pin: ARCHIMATE_V2_PIN, payload: PAYLOAD_ARCHIMATE_V2, envelope: ENVELOPE_ARCHIMATE_V2, canonicalRef: "engram:archimate@2" },
    { record: RECORD_UML_V2, pin: UML_V2_PIN, payload: PAYLOAD_UML_V2, envelope: ENVELOPE_UML_V2, canonicalRef: "engram:uml@2" },
  ] as const;

  it("mirrors namespace/owner/pin/digests across record, payload and envelope", () => {
    for (const { record, pin, payload, envelope, canonicalRef } of rows) {
      expect(record.namespace).toBe("diagram");
      expect(record.owner).toBe("engram");
      expect(record.profileRef.canonicalRef).toBe(canonicalRef);
      expect(record.profileRef.contentDigest).toBe(pin.contentDigest);
      expect(record.digests!.contentDigest).toBe(pin.contentDigest);
      expect(payload.canonicalRef).toBe(canonicalRef);
      expect(payload.profilePin).toEqual(pin);
      expect(payload.stack).toEqual([pin]);
      expect(payload.digests.contentDigest).toBe(pin.contentDigest);
      expect(payload.namespace).toBe(record.namespace);
      expect(payload.owner).toBe(record.owner);
      expect(envelope.kind).toBe("ontology");
      if (envelope.kind !== "ontology") throw new Error("envelope kind");
      expect(envelope.ontology.profilePin).toEqual(pin);
      // Base stack/lineage: own pin only, empty composition ancestry.
      expect(payload.lineage.parents).toEqual([]);
      expect(record.lineage.parents).toEqual([]);
    }
  });

  it("binds the contract record to its schema pin, never to a semantic stack", () => {
    expect(RECORD_CONTRACT.profileShape).toBe("mechanism-descriptor");
    expect(RECORD_CONTRACT.artifactKind).toBe("contract");
    expect(contractBindingOf()).toEqual({
      artifactKind: "contract",
      schemaPin: DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.pin,
      compatibilityMatrixVersion: "1",
    });
    expect(PAYLOAD_CONTRACT.artifactBinding).toEqual(contractBindingOf());
    expect(ENVELOPE_CONTRACT.kind).toBe("ontology");
  });

  it("marks executor/adapter compatibility explicitly transitional (U-QUAL)", () => {
    for (const payload of [PAYLOAD_GENERIC_V2, PAYLOAD_ARCHIMATE_V2, PAYLOAD_UML_V2, PAYLOAD_CONTRACT]) {
      expect(payload.compatibility.renderer.startsWith("transitional:")).toBe(true);
      expect(payload.compatibility.adapter.startsWith("transitional:")).toBe(true);
    }
  });

  it("holds supersession with empty ancestry and immutable predecessors (§3.13.4)", () => {
    expect(SUPERSESSION.map((r) => r.migrationRef).sort()).toEqual([
      "engram:migration-archimate-1-2",
      "engram:migration-generic-1-2",
      "engram:migration-uml-1-2",
    ]);
    for (const row of [RECORD_GENERIC_V1, RECORD_ARCHIMATE_V1, RECORD_UML_V1]) {
      expect(row.lifecycle).toBe("superseded");
      expect(row.lineage.parents).toEqual([]);
      if (row.lifecycle !== "superseded") throw new Error("lifecycle");
      const superRow = SUPERSESSION.find((s) => s.from.contentDigest === row.profileRef.contentDigest);
      expect(superRow?.migrationRef).toBe(row.migrationRef);
      expect(superRow?.supersededBy).toEqual(row.supersededBy);
    }
    expect(RECORD_ARCHIMATE_V1.completeness).toBe("skeleton");
    expect(RECORD_UML_V1.completeness).toBe("skeleton");
    expect(RECORD_GENERIC_V1.completeness).toBe("complete");
  });
});

describe("§7.4.5 admission verdicts on governed records", () => {
  const entries = [
    { record: RECORD_GENERIC_V2, pin: GENERIC_V2_PIN },
    { record: RECORD_ARCHIMATE_V2, pin: ARCHIMATE_V2_PIN },
    { record: RECORD_UML_V2, pin: UML_V2_PIN },
    { record: RECORD_CONTRACT, pin: CONTRACT_PIN },
    { record: RECORD_GENERIC_V1, pin: { id: "generic", version: "1.0.0", contentDigest: RECORD_GENERIC_V1.profileRef.contentDigest } },
    { record: RECORD_ARCHIMATE_V1, pin: { id: "archimate", version: "1.0.0", contentDigest: RECORD_ARCHIMATE_V1.profileRef.contentDigest } },
    { record: RECORD_UML_V1, pin: { id: "uml", version: "1.0.0", contentDigest: RECORD_UML_V1.profileRef.contentDigest } },
  ] as const;

  it("derives exactly one obligation per record (family-corpus / contract-verdict)", () => {
    for (const { record, pin } of entries) {
      const entry = recordToEntry(record, pin, record.corpusRef!.digest);
      const requirements = deriveRequirements(entry);
      expect(requirements.length).toBe(1);
      expect(requirements[0]!.libraryId).toBe("diagram-corpus-validator");
      expect(requirements[0]!.receiptKind).toBe(record.artifactKind === "contract" ? "contract-verdict" : "family-corpus");
    }
  });

  it("refuses every record without receipts (S1: U-QUAL evidence outstanding)", () => {
    for (const { record, pin } of entries) {
      const entry = recordToEntry(record, pin, record.corpusRef!.digest);
      const verdict = checkAdmission({ entry, receipts: [] });
      expect(verdict.admitted).toBe(false);
      if (verdict.admitted !== false) throw new Error("admission");
      expect(verdict.code).toBe("missing-receipt");
    }
  });

  it("admits a resolved-evidence variant with test-only evidence and refuses on removal", () => {
    const digest = "c".repeat(64);
    const entry: AdmissionEntry = {
      ...recordToEntry(RECORD_GENERIC_V2, GENERIC_V2_PIN, RECORD_GENERIC_V2.corpusRef!.digest),
      resultEvidence: { evidenceState: "resolved", digest },
    };
    const receipt = familyCorpusReceipt(entry, digest);
    expect(checkAdmission({ entry, receipts: [receipt] })).toEqual({ admitted: true });
    expect(checkAdmission({ entry, receipts: [] }).admitted).toBe(false);
    const tampered = { ...receipt, corpusDigest: "d".repeat(64) } as Receipt;
    expect(checkAdmission({ entry, receipts: [tampered] }).admitted).toBe(false);
  });
});

describe("A.3 specimen mapping oracles (serialization, not evidence)", () => {
  it("maps the specimen base record to one family-corpus obligation", () => {
    const record = specimen.base.record;
    const entry: AdmissionEntry = {
      family: "DIA",
      artifactKind: "base",
      profileShape: "diagram-profile",
      generatedBpmn: false,
      qualificationScope: {
        libraries: [{ id: "fixture-validator", version: "1" }],
        proofSets: [],
        selections: [{ phase: "serialization", readinessPolicy: "oracle" }],
      },
      ruleSheetRuleIds: [],
      stack: specimen.base.envelope.ontology.stack,
      pinsDigest: record.digests.pinsDigest,
      resultEvidence: record.digests.resultEvidence,
      profilePin: specimen.base.envelope.ontology.profilePin,
      corpusDigest: record.corpusRef.digest,
      selections: [],
      ruleSheetPins: [],
      visibility: "public",
    };
    const requirements = deriveRequirements(entry);
    expect(requirements).toEqual([
      { receiptKind: "family-corpus", libraryId: "fixture-validator", libraryVersion: "1" },
    ]);
    const receipt = specimen.base.envelope.ontology.receipts[0];
    expect(receipt.libraryId).toBe(requirements[0]!.libraryId);
    expect(receipt.libraryVersion).toBe(requirements[0]!.libraryVersion);
    // The specimen receipt is a serialization oracle, not executed evidence:
    // its fixtureDigest (case-inputs bytes) differs from the corpus digest by
    // design, so the gate refuses — exactly the oracle/evidence boundary.
    expect(checkAdmission({ entry, receipts: [receipt] })).toEqual({
      admitted: false,
      code: "missing-receipt",
      reason: "required receipt family-corpus from fixture-validator@1 missing: family-corpus fixtureDigest mismatch",
    });
    expect(checkAdmission({ entry, receipts: [] }).admitted).toBe(false);
  });
});
