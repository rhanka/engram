// RLO-L1 acceptance fixtures F1, F2, F3 (spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md §8.2, Amendment A1).
// F1 exercises the real G0 helpers (digestOfPreimage, pinsDigestOf, isDigest, checkAdmission)
// and the pinned registry constants (spec §2.2). F3 exercises composeApplicability/refusedOutcome
// (G0 §2.5, D-B7): composition over the TRK family is refused with operation-not-applicable /
// compose-not-offered. No computeOntologyCanonicalDigest, verifyOntologyPinDigest or
// composeOntologies symbol is imported: none exists in src/.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LEGACY_TRACK_STAGE_ALIASES,
  REQUEST_LIFECYCLE_STAGES,
  normalizeRequestLifecycleStage,
} from "../src/request-lifecycle/stage-normalizer.js";
import { digestOfPreimage } from "../src/ontology-guardian/canonical.js";
import { pinsDigestOf } from "../src/ontology-guardian/digests.js";
import { isDigest } from "../src/ontology-guardian/types.js";
import { checkAdmission } from "../src/ontology-guardian/admission.js";
import type { AdmissionEntry } from "../src/ontology-guardian/admission.js";
import { composeApplicability, refusedOutcome } from "../src/ontology-guardian/diagnostics.js";
import {
  RECORD_REQUEST_LIFECYCLE_V1,
  REQUEST_LIFECYCLE_PIN,
  REQUEST_LIFECYCLE_PINS_DIGEST,
  REQUEST_LIFECYCLE_CONTENT_DIGEST,
} from "../src/request-lifecycle/registry.js";

const profileUrl = new URL("../profiles/request-lifecycle/1/profile.json", import.meta.url);
const mappingUrl = new URL("../profiles/request-lifecycle/1/engram-mapping.json", import.meta.url);

/** §1.1 language invariant: English ASCII identifiers, zero French tokens. */
const LOWERCASE_ASCII_ID = /^[a-z][a-z0-9_]*$/;
const DASHED_ASCII_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function isAscii(token: string): boolean {
  return /^[\x20-\x7E]+$/.test(token);
}

function loadProfileFiles(): { profile: Record<string, unknown>; mapping: Record<string, unknown> } {
  return {
    profile: JSON.parse(readFileSync(profileUrl, "utf8")) as Record<string, unknown>,
    mapping: JSON.parse(readFileSync(mappingUrl, "utf8")) as Record<string, unknown>,
  };
}

function trackModule(profile: Record<string, unknown>): Record<string, unknown> {
  return (profile["modules"] as Record<string, Record<string, unknown>>)["track"];
}

describe("F1 — request-lifecycle@1 profile, mapping and canonical digest", () => {
  it("copies the repo-knowledge file shapes exactly", () => {
    const { profile, mapping } = loadProfileFiles();
    expect(Object.keys(profile).sort()).toEqual(["description", "id", "lifecycle", "modules", "owner", "version"]);
    expect(profile["id"]).toBe("request-lifecycle");
    expect(profile["version"]).toBe("1");
    expect(Object.keys(mapping).sort()).toEqual(["adapters", "description", "mappingVersion", "profile"]);
    expect(mapping["profile"]).toEqual({ id: "request-lifecycle", version: "1" });
    for (const adapter of mapping["adapters"] as Record<string, unknown>[]) {
      expect(Object.keys(adapter).sort()).toEqual(["extractionTarget", "note", "timingRecord"]);
    }
  });

  it("declares the 7 entity types, the 12 relation types and the requestLifecycleStages axis", () => {
    const { profile } = loadProfileFiles();
    const track = trackModule(profile);
    const entityIds = (track["entityTypes"] as { id: string }[]).map((entity) => entity.id).sort();
    expect(entityIds).toEqual(["decision", "lot", "production", "pull_request", "release", "request", "spec"]);
    const relationIds = (track["relationTypes"] as { id: string }[]).map((relation) => relation.id);
    expect(relationIds).toHaveLength(12);
    expect([...relationIds].sort()).toEqual([
      "decision_cites_spec",
      "lot_blocked_by_entity",
      "lot_child_of_lot",
      "lot_governed_by_decision",
      "lot_implemented_by_pr",
      "lot_specified_by_spec",
      "pr_cites_spec",
      "pr_ships_in_release",
      "release_deployed_to_production",
      "request_governed_by_decision",
      "request_promoted_to_lot",
      "request_specified_by_spec",
    ]);
    const axes = track["axes"] as Record<string, string[]>;
    expect(axes["requestLifecycleStages"]).toEqual(["spec", "dev", "pr", "review", "merged", "published", "deployed"]);
    expect(axes["requestLifecycleStages"]).toEqual([...REQUEST_LIFECYCLE_STAGES]);
  });

  it("carries zero French tokens in entityTypes, relationTypes and axes under modules.track", () => {
    const { profile } = loadProfileFiles();
    const track = trackModule(profile);
    for (const entity of track["entityTypes"] as { id: string }[]) {
      expect(isAscii(entity.id), entity.id).toBe(true);
      expect(LOWERCASE_ASCII_ID.test(entity.id) || DASHED_ASCII_ID.test(entity.id), entity.id).toBe(true);
    }
    for (const relation of track["relationTypes"] as { id: string }[]) {
      expect(isAscii(relation.id), relation.id).toBe(true);
      expect(LOWERCASE_ASCII_ID.test(relation.id) || DASHED_ASCII_ID.test(relation.id), relation.id).toBe(true);
    }
    const axes = track["axes"] as Record<string, string[]>;
    for (const [axis, tokens] of Object.entries(axes)) {
      expect(isAscii(axis), axis).toBe(true);
      for (const token of tokens) {
        expect(isAscii(token), `${axis}:${token}`).toBe(true);
      }
    }
  });

  it("recomputes the pinned content and pins digests", () => {
    const { profile } = loadProfileFiles();
    const contentDigest = digestOfPreimage(profile);
    expect(isDigest(contentDigest)).toBe(true);
    expect(contentDigest).toBe(REQUEST_LIFECYCLE_CONTENT_DIGEST);
    expect(contentDigest).toBe(REQUEST_LIFECYCLE_PIN.contentDigest);
    const pinsDigest = pinsDigestOf({ layers: [REQUEST_LIFECYCLE_PIN] });
    expect(isDigest(pinsDigest)).toBe(true);
    expect(pinsDigest).toBe(REQUEST_LIFECYCLE_PINS_DIGEST);
    const recordDigests = RECORD_REQUEST_LIFECYCLE_V1.digests;
    if (recordDigests !== undefined) {
      expect(recordDigests.pinsDigest).toBe(pinsDigest);
    }
  });

  it("detects a one-field tamper as a different recomputed digest", () => {
    const { profile } = loadProfileFiles();
    const tampered = structuredClone(profile);
    const modules = (tampered as Record<string, unknown>)["modules"] as Record<string, Record<string, unknown>>;
    modules["track"]["description"] = "tampered: Track-aligned vocabulary module.";
    expect(digestOfPreimage(tampered)).not.toBe(REQUEST_LIFECYCLE_PIN.contentDigest);
  });

  it("refuses admission without receipts through the missing-receipt arm", () => {
    // OQ-RL-6: no family-corpus receipt fixture exists for a TRK entry, so the {admitted: true}
    // arm is not covered and this test does not fabricate a receipt. corpusDigest and the
    // resolved resultEvidence below are fixture values: checkAdmission only checks their
    // well-formedness before the receipt loop; the real values are unknown (OQ-RL-6, OQ-RL-8).
    const entry: AdmissionEntry = {
      family: "TRK",
      artifactKind: "profile",
      profileShape: "track-vocabulary",
      generatedBpmn: false,
      qualificationScope: {
        libraries: [{ id: "@sentropic/track", version: "0.98.7" }],
        proofSets: [],
        selections: [{ phase: "import", readinessPolicy: "draft" }],
      },
      ruleSheetRuleIds: [],
      stack: [REQUEST_LIFECYCLE_PIN],
      pinsDigest: REQUEST_LIFECYCLE_PINS_DIGEST,
      resultEvidence: { evidenceState: "resolved", digest: REQUEST_LIFECYCLE_CONTENT_DIGEST },
      profilePin: REQUEST_LIFECYCLE_PIN,
      corpusDigest: REQUEST_LIFECYCLE_PINS_DIGEST,
      selections: [],
      ruleSheetPins: [],
      visibility: "public",
    };
    const verdict = checkAdmission({ entry, receipts: [] });
    if (verdict.admitted) {
      throw new Error("expected the missing-receipt refusal arm (admitted arm not covered, OQ-RL-6)");
    }
    expect(verdict.code).toBe("missing-receipt");
    expect(typeof verdict.reason).toBe("string");
    expect(verdict.reason.length).toBeGreaterThan(0);
    expect(verdict.reason).toContain("family-corpus");
    expect(verdict.reason).toContain("@sentropic/track@0.98.7");
  });
});

describe("F2 — normalizeRequestLifecycleStage", () => {
  it("maps the 7 canonical English stages 1:1", () => {
    expect(REQUEST_LIFECYCLE_STAGES).toEqual(["spec", "dev", "pr", "review", "merged", "published", "deployed"]);
    for (const stage of REQUEST_LIFECYCLE_STAGES) {
      expect(normalizeRequestLifecycleStage(stage)).toBe(stage);
    }
  });

  it("normalizes the legacy Track aliases PR, mergé and déployé", () => {
    expect(LEGACY_TRACK_STAGE_ALIASES).toEqual({ PR: "pr", "mergé": "merged", "déployé": "deployed" });
    expect(normalizeRequestLifecycleStage("PR")).toBe("pr");
    expect(normalizeRequestLifecycleStage("mergé")).toBe("merged");
    expect(normalizeRequestLifecycleStage("déployé")).toBe("deployed");
  });

  it("returns undefined for unknown values without throwing", () => {
    expect(normalizeRequestLifecycleStage("bogus-stage")).toBeUndefined();
    expect(normalizeRequestLifecycleStage(undefined)).toBeUndefined();
    expect(() => normalizeRequestLifecycleStage("bogus-stage")).not.toThrow();
    expect(() => normalizeRequestLifecycleStage(undefined)).not.toThrow();
  });
});

describe("F3 — composeApplicability refuses TRK composition", () => {
  it("returns exactly one operation-not-applicable diagnostic for the TRK family", () => {
    const diagnostics = composeApplicability("TRK");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual({
      origin: "guardian",
      code: "operation-not-applicable",
      nativeCode: "operation-not-applicable",
      ruleId: null,
      subjectRef: "TRK",
      severity: "error",
      path: null,
      messageKey: "compose-not-offered",
    });
  });

  it("wraps the refusal in a refused outcome without throwing", () => {
    const diagnostics = composeApplicability("TRK");
    expect(refusedOutcome(diagnostics)).toEqual({ outcome: "refused", diagnostics });
    expect(() => refusedOutcome(diagnostics)).not.toThrow();
  });

  it("reads no ok, status or reason property from the compose result", () => {
    // Negative check (Amendment A1): the previous fixture read result.ok, result.status and
    // result.reason from a composeOntologies call that never existed. Composition of
    // request-lifecycle@1 with repo-knowledge@1 is refused at the family level (TRK);
    // per-profile compose arguments are not covered and no such API is called.
    const outcome = refusedOutcome(composeApplicability("TRK"));
    expect(Object.hasOwn(outcome, "ok")).toBe(false);
    expect(Object.hasOwn(outcome, "status")).toBe(false);
    expect(Object.hasOwn(outcome, "reason")).toBe(false);
    expect(outcome.outcome).toBe("refused");
  });
});
