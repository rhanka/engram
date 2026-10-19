/**
 * Preserved export/validation entrypoint required by the h2a transfer
 * (velocity-estimator review, transfer table), conserved at this exact path
 * (spec section 9.2). This file is never renamed or removed; the
 * `src/time-reference/` implementation lives behind it.
 *
 * It re-exports the time-reference validators and separately validates the
 * `repo-knowledge@1` profile, the timing schemas and `engram-mapping.json`.
 */

export * from "./time-reference/index.js";

import type { Diagnostic } from "./time-reference/index.js";

export const REPO_KNOWLEDGE_PROFILE_ID = "repo-knowledge";
export const REPO_KNOWLEDGE_PROFILE_VERSION = "1";

export const TIMING_CLOCK_TYPES = [
  "start_to_pr_open",
  "pr_open_to_merge",
  "merge_to_installed",
  "agent_run_elapsed",
  "agent_work_seconds",
  "ci_job_service",
  "ci_envelope",
  "ci_workflow_span",
  "wait_interval",
] as const;

export const APPLICABILITY_VOCABULARY = ["applicable", "conditional-historical", "incomplete"] as const;

export const TIMING_SCHEMA_NAMES = [
  "CollectionManifestV1",
  "PullRequestTimingV1",
  "CiCheckBatchV1",
  "CohortV1",
  "QuantileSetV1",
  "TimingSeriesV1",
  "TimingEstimateV1",
  "TimingBudgetV1",
  "FigureProvenanceV1",
  "DeliveryMilestonesV1",
  "InstallationReceiptV1",
  "CommittedExportV1",
  "ReviewWaveManifestV1",
  "ReviewRoundsActualV1",
] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validate the single `repo-knowledge@1` profile (CI + architecture + timing modules). */
export function validateRepoKnowledgeProfile(v: unknown): { ok: boolean; errors: Diagnostic[] } {
  const errors: Diagnostic[] = [];
  if (!isRecord(v)) return { ok: false, errors: [{ code: "bad-type", message: "profile must be an object", path: "" }] };
  if (v["id"] !== REPO_KNOWLEDGE_PROFILE_ID) {
    errors.push({ code: "bad-profile-id", message: `profile id must be ${JSON.stringify(REPO_KNOWLEDGE_PROFILE_ID)}`, path: "id" });
  }
  if (v["version"] !== REPO_KNOWLEDGE_PROFILE_VERSION) {
    errors.push({ code: "bad-profile-version", message: "profile version must be 1", path: "version" });
  }
  const modules = v["modules"];
  if (!isRecord(modules)) {
    errors.push({ code: "bad-type", message: "profile.modules must be an object with ci, architecture and timing", path: "modules" });
  } else {
    for (const name of ["ci", "architecture", "timing"] as const) {
      if (!isRecord(modules[name])) errors.push({ code: "missing-module", message: `profile module ${JSON.stringify(name)} is required`, path: `modules.${name}` });
    }
    const timing = modules["timing"];
    if (isRecord(timing)) {
      const clocks = timing["clockTypes"];
      if (!Array.isArray(clocks) || !(TIMING_CLOCK_TYPES as readonly string[]).every((m) => (clocks as unknown[]).includes(m))) {
        errors.push({ code: "bad-clock-types", message: "timing module must declare the section 3.1 clock types", path: "modules.timing.clockTypes" });
      }
      const appl = timing["applicability"];
      if (!Array.isArray(appl) || (APPLICABILITY_VOCABULARY as readonly string[]).some((a) => !(appl as unknown[]).includes(a))) {
        errors.push({ code: "bad-applicability", message: "timing module must declare the applicability vocabulary", path: "modules.timing.applicability" });
      }
    }
  }
  if (typeof v["owner"] !== "string" || (v["owner"] as string).length === 0) {
    errors.push({ code: "bad-type", message: "profile owner must be a durable handle", path: "owner" });
  }
  if (!["draft", "published", "deprecated", "superseded"].includes(v["lifecycle"] as string)) {
    errors.push({ code: "bad-enum", message: "lifecycle must be draft | published | deprecated | superseded", path: "lifecycle" });
  }
  return { ok: errors.length === 0, errors };
}

/** Validate the timing.schema.json document: the 14 closed section 6 schemas. */
export function validateTimingSchemas(v: unknown): { ok: boolean; errors: Diagnostic[] } {
  const errors: Diagnostic[] = [];
  if (!isRecord(v)) return { ok: false, errors: [{ code: "bad-type", message: "timing schemas document must be an object", path: "" }] };
  for (const name of TIMING_SCHEMA_NAMES) {
    const s = v[name];
    if (!isRecord(s)) {
      errors.push({ code: "missing-schema", message: `schema ${name} is required`, path: name });
      continue;
    }
    if (s["type"] !== "object" || s["additionalProperties"] !== false) {
      errors.push({ code: "open-schema", message: `schema ${name} must be a closed object (additionalProperties: false)`, path: name });
    }
    const required = s["required"];
    if (!Array.isArray(required) || !required.includes("schema")) {
      errors.push({ code: "bad-schema", message: `schema ${name} must require its schema literal`, path: `${name}.required` });
    }
  }
  for (const k of Object.keys(v)) {
    if (!(TIMING_SCHEMA_NAMES as readonly string[]).includes(k)) {
      errors.push({ code: "undeclared-field", message: `undeclared schema ${JSON.stringify(k)}`, path: k });
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Validate engram-mapping.json: the versioned adapter into engram extraction vocabulary. */
export function validateEngramMapping(v: unknown): { ok: boolean; errors: Diagnostic[] } {
  const errors: Diagnostic[] = [];
  if (!isRecord(v)) return { ok: false, errors: [{ code: "bad-type", message: "mapping must be an object", path: "" }] };
  if (typeof v["mappingVersion"] !== "string" || (v["mappingVersion"] as string).length === 0) {
    errors.push({ code: "bad-type", message: "mappingVersion must be a non-empty string", path: "mappingVersion" });
  }
  const pref = v["profile"];
  if (!isRecord(pref) || pref["id"] !== REPO_KNOWLEDGE_PROFILE_ID || typeof pref["version"] !== "string") {
    errors.push({ code: "bad-type", message: "mapping.profile must pin {id: repo-knowledge, version}", path: "profile" });
  }
  if (!Array.isArray(v["adapters"])) {
    errors.push({ code: "bad-type", message: "mapping.adapters must be an array", path: "adapters" });
  }
  return { ok: errors.length === 0, errors };
}
