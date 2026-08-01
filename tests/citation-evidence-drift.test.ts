/**
 * `graphify_citation_evidence_v1` — schema + DRIFT guard (INC-3, local only).
 *
 * The grounding engine already knows, for every citation it emits, WHY it
 * emitted it: which term hit, which matcher fired, that the verbatim gate
 * passed, and where in the source it landed. Today that reasoning is discarded
 * the moment the citation is built. This schema gives it a name and a shape so
 * it can be recorded — it DESCRIBES state the engine already computes, it does
 * not invent policy.
 *
 * A drift test is only worth its name if it BITES. TypeScript interfaces vanish
 * at runtime, so the declared field surface lives in a runtime constant and
 * these tests assert that the BUILDER's real output matches that constant, both
 * ways. Add a field to the builder without declaring it and this fails; declare
 * one the builder never emits and this fails too.
 *
 * SCOPE: local artifact. Publishing `graphify_citation_evidence_v1` as a shared
 * cross-repo contract is parked with the principal and is NOT what this lands.
 */
import { describe, expect, it } from "vitest";
import {
  CITATION_EVIDENCE_OPTIONAL_FIELDS,
  CITATION_EVIDENCE_RELPATH,
  CITATION_EVIDENCE_REQUIRED_FIELDS,
  CITATION_EVIDENCE_SCHEMA,
  CITATION_MATCHERS,
  buildCitationEvidence,
  validateCitationEvidenceStore,
} from "../src/citation-evidence.js";
import { citationKey } from "../src/citations.js";
import type { OntologyCitation } from "../src/types.js";

const CITATION: OntologyCitation = {
  source_file: "/abs/CONTRIBUTION_AI.pdf",
  page: 2,
  section: "Entretien avec Juliette Mattioli",
  quote: "Juliette Mattioli explique que l'apprentissage automatique transforme l'industrie.",
  confidence: "EXTRACTED",
};

const evidenceOf = () =>
  buildCitationEvidence(CITATION, {
    matchedTerm: "mattioli",
    matcher: "surname",
    verbatim: true,
    confidence: "EXTRACTED",
  });

const storeOf = (evidence = [evidenceOf()]) => ({
  schema: CITATION_EVIDENCE_SCHEMA,
  graph_signature: "sig:deadbeef",
  evidence: { p1: evidence },
});

describe("graphify_citation_evidence_v1 — the declared surface", () => {
  it("pins the schema id and the store relpath", () => {
    // These two strings ARE the contract surface. Changing either is a
    // breaking change and must be a deliberate edit here, never a side effect.
    expect(CITATION_EVIDENCE_SCHEMA).toBe("graphify_citation_evidence_v1");
    expect(CITATION_EVIDENCE_RELPATH).toBe("ontology/citation-evidence.json");
  });

  it("pins the matcher vocabulary to what the engine can actually fire", () => {
    expect([...CITATION_MATCHERS].sort()).toEqual(
      ["acronym", "alias", "content-word", "image-context", "label", "reference-marker", "surname"].sort(),
    );
  });
});

describe("graphify_citation_evidence_v1 — the drift guard bites both ways", () => {
  it("the builder emits EXACTLY the declared required fields, no more", () => {
    const emitted = Object.keys(evidenceOf()).sort();
    const declared = [...CITATION_EVIDENCE_REQUIRED_FIELDS].sort();
    // Undeclared field added to the builder → caught here.
    expect(emitted.filter((f) => !declared.includes(f) && !CITATION_EVIDENCE_OPTIONAL_FIELDS.includes(f))).toEqual([]);
    // Declared field the builder stopped emitting → caught here.
    expect(declared.filter((f) => !emitted.includes(f))).toEqual([]);
  });

  it("references the citation by the repo's own identity key, not a private scheme", () => {
    expect(evidenceOf().citation_key).toBe(citationKey(CITATION));
  });

  it("carries the optional quote span through when the engine knows it", () => {
    const withSpan = buildCitationEvidence(CITATION, {
      matchedTerm: "mattioli",
      matcher: "surname",
      verbatim: true,
      confidence: "EXTRACTED",
      quoteSpan: [12, 21],
    });
    expect(withSpan.quote_span).toEqual([12, 21]);
    expect(validateCitationEvidenceStore(storeOf([withSpan])).ok).toBe(true);
  });
});

describe("validateCitationEvidenceStore — rejects every drift it is meant to catch", () => {
  it("accepts a well-formed store", () => {
    expect(validateCitationEvidenceStore(storeOf())).toEqual({ ok: true, problems: [] });
  });

  it("rejects a wrong schema id", () => {
    const bad = { ...storeOf(), schema: "graphify_citation_evidence_v2" };
    const result = validateCitationEvidenceStore(bad);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("schema");
  });

  it("rejects a missing required field", () => {
    const { matched_term: _dropped, ...rest } = evidenceOf();
    const result = validateCitationEvidenceStore(storeOf([rest as never]));
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("matched_term");
  });

  it("rejects an UNKNOWN field — silent additive drift is the failure mode", () => {
    const result = validateCitationEvidenceStore(storeOf([{ ...evidenceOf(), smuggled: "x" } as never]));
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("smuggled");
  });

  it("rejects a matcher outside the declared vocabulary", () => {
    const result = validateCitationEvidenceStore(storeOf([{ ...evidenceOf(), matcher: "vibes" } as never]));
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("matcher");
  });

  it("rejects verbatim:false — an unverified quote is not evidence", () => {
    const result = validateCitationEvidenceStore(storeOf([{ ...evidenceOf(), verbatim: false }]));
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("verbatim");
  });

  it("rejects a confidence outside the CitationConfidence union", () => {
    const result = validateCitationEvidenceStore(storeOf([{ ...evidenceOf(), confidence: "VIBES" } as never]));
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("confidence");
  });

  it("rejects a non-object store without throwing", () => {
    for (const bad of [null, undefined, 42, "store", []]) {
      expect(validateCitationEvidenceStore(bad).ok).toBe(false);
    }
  });
});
