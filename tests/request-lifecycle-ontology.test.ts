// RLO-L1 acceptance fixtures F1, F2, F3 (spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md §8.2).
// F1 and F3 exercise the G0 contracts computeOntologyCanonicalDigest,
// verifyOntologyPinDigest and composeOntologies (spec §2.2, §2.1.2, §8.2),
// loaded dynamically so each fixture reports its own missing G0 export.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LEGACY_TRACK_STAGE_ALIASES,
  REQUEST_LIFECYCLE_STAGES,
  normalizeRequestLifecycleStage,
} from "../src/request-lifecycle/stage-normalizer.js";

const profileUrl = new URL("../profiles/request-lifecycle/1/profile.json", import.meta.url);
const correspondencesUrl = new URL("../profiles/request-lifecycle/1/correspondences.json", import.meta.url);

/** §1.1 language invariant: English ASCII identifiers, zero French tokens. */
const LOWERCASE_ASCII_ID = /^[a-z][a-z0-9_]*$/;
const DASHED_ASCII_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function isAscii(token: string): boolean {
  return /^[\x20-\x7E]+$/.test(token);
}

describe("F1 — request-lifecycle@1 profile, correspondences and canonical digest", () => {
  const profile = JSON.parse(readFileSync(profileUrl, "utf8")) as Record<string, unknown>;
  const correspondences = JSON.parse(readFileSync(correspondencesUrl, "utf8")) as Record<string, unknown>;

  it("canonical digest matches the catalog entry for request-lifecycle@1 and verifies on disk", async () => {
    const guardian = (await import("../src/ontology-guardian/catalog.js")) as Record<string, unknown>;
    const computeOntologyCanonicalDigest = guardian["computeOntologyCanonicalDigest"] as (
      files: Readonly<Record<string, string>>,
    ) => string;
    const verifyOntologyPinDigest = guardian["verifyOntologyPinDigest"] as (
      entry: unknown,
      files: Readonly<Record<string, string>>,
    ) => unknown;
    const files = {
      "correspondences.json": readFileSync(correspondencesUrl, "utf8"),
      "profile.json": readFileSync(profileUrl, "utf8"),
    };
    const digest = computeOntologyCanonicalDigest(files);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const entry = guardian["REQUEST_LIFECYCLE_CATALOG_ENTRY"] as { digest: string };
    expect(entry.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(digest).toBe(entry.digest);
    expect(() => verifyOntologyPinDigest(entry, files)).not.toThrow();
  });

  it("declares all 7 entity types and the correspondences coordinate", () => {
    const entityIds = (profile["entityTypes"] as { id: string }[]).map((e) => e.id).sort();
    expect(entityIds).toEqual(["decision", "lot", "production", "pull_request", "release", "request", "spec"]);
    expect(profile["id"]).toBe("request-lifecycle");
    expect(profile["version"]).toBe(1);
    expect(profile["coordinate"]).toBe("request-lifecycle@1");
    expect(profile["domain"]).toBe("track");
    expect(profile["visibility"]).toBe("public");
    expect(profile["specPath"]).toBe("spec/SPEC_REQUEST_LIFECYCLE_ONTOLOGY.md");
    expect(correspondences["coordinate"]).toBe("request-lifecycle@1");
    expect(Array.isArray(correspondences["rules"])).toBe(true);
    expect((correspondences["rules"] as unknown[]).length).toBeGreaterThan(0);
  });

  it("carries zero French tokens in entityTypes, relationTypes and axes", () => {
    for (const entity of profile["entityTypes"] as { id: string }[]) {
      expect(isAscii(entity.id), entity.id).toBe(true);
      expect(LOWERCASE_ASCII_ID.test(entity.id) || DASHED_ASCII_ID.test(entity.id), entity.id).toBe(true);
    }
    for (const relation of profile["relationTypes"] as { id: string }[]) {
      expect(isAscii(relation.id), relation.id).toBe(true);
      expect(LOWERCASE_ASCII_ID.test(relation.id) || DASHED_ASCII_ID.test(relation.id), relation.id).toBe(true);
    }
    const axes = profile["axes"] as Record<string, string[]>;
    for (const [axis, tokens] of Object.entries(axes)) {
      expect(isAscii(axis), axis).toBe(true);
      for (const token of tokens) {
        expect(isAscii(token), `${axis}:${token}`).toBe(true);
      }
    }
  });

  it("declares all Track origin/main axes per §1.4.2 and all 7 requestLifecycleStages", () => {
    expect(profile["axes"]).toEqual({
      itemKinds: ["feature", "bug", "chore", "decision", "defect"],
      itemRoles: ["workpackage", "spec-phase", "stream"],
      specStatuses: ["to-specify", "specified", "n/a"],
      realizationStatuses: ["to-do", "in-progress", "done", "cancelled", "rejected"],
      reopenMotives: ["closed-without-owner-uat", "regression-observed"],
      decisionGates: ["orientation", "commitment"],
      gateDispositions: ["required", "skipped", "not-applicable", "completed"],
      acceptanceStatuses: ["fail", "waived", "unknown", "stale", "pass", "n/a"],
      evidenceKinds: ["unit", "integration", "e2e", "manual"],
      decisionOutcomes: ["pending", "go", "no-go", "deferred"],
      demandTypes: ["feature", "defect", "chore"],
      demandStatuses: ["raised", "qualifying", "agreed", "rejected", "duplicate", "parked"],
      demandSourceKinds: ["human", "agent", "h2a", "import", "external"],
      blockerKinds: ["decision", "dependency"],
      blockerResolutionRules: ["linked-done", "linked-accepted", "manual"],
      blockerScopes: ["intra", "extra"],
      reportBuckets: ["AWAITED", "DROPPED", "DONE", "TO-DO"],
      reportStatuses: [
        "progressing",
        "unforeseen",
        "blocked",
        "decision-awaited",
        "not-qualified",
        "withdrawn",
      ],
      requestLifecycleStages: ["spec", "dev", "pr", "review", "merged", "published", "deployed"],
    });
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

describe("F3 — composeOntologies refuses the composition", () => {
  it("returns operation-not-applicable for request-lifecycle@1 composed with repo-knowledge@1", async () => {
    const guardian = (await import("../src/ontology-guardian/catalog.js")) as Record<string, unknown>;
    const composeOntologies = guardian["composeOntologies"] as (request: {
      id: string;
      version: number;
      left: string;
      right: string;
    }) => { ok: boolean; status: string; reason?: string };
    const result = composeOntologies({ id: "composed", version: 1, left: "request-lifecycle@1", right: "repo-knowledge@1" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("operation-not-applicable");
    expect(typeof result.reason).toBe("string");
    expect((result.reason ?? "").length).toBeGreaterThan(0);
  });
});
