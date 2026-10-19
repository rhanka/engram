/**
 * Validators for every section 6 DTO (spec sections 6.0–6.11).
 *
 * Closed validation: undeclared fields, missing required fields and
 * out-of-enumeration values fail with a typed diagnostic. Cross-field
 * invariants stated with each DTO are enforced. Validators are pure:
 * no network, no filesystem, no process spawn. All inputs arrive as
 * explicit parameters.
 */

import { parseMergeVerdict, qualifyInstallation, type TargetQualification } from "./milestones.js";
import { fingerprintDigestOf } from "./canonical.js";
import { meetsTailSupport, parseEffectiveSizeRatio } from "./quantiles.js";
import { DIGEST_RE, INSTANT_RE, REPO_RE, SHA_RE, durationSeconds, isDigest, isInstant } from "./format.js";
import type {
  CiCheckBatchV1,
  CohortV1,
  CollectionManifestV1,
  CommittedExportV1,
  DeliveryMilestonesV1,
  FigureProvenanceV1,
  InstallationReceiptV1,
  PullRequestTimingV1,
  QuantileSetV1,
  ReviewRoundsActualV1,
  ReviewWaveManifestV1,
  TimingBudgetV1,
  TimingEstimateV1,
  TimingSeriesV1,
} from "./types.js";
import {
  SCHEMA_CI_CHECK_BATCH,
  SCHEMA_COHORT,
  SCHEMA_COLLECTION_MANIFEST,
  SCHEMA_COMMITTED_EXPORT,
  SCHEMA_DELIVERY_MILESTONES,
  SCHEMA_FIGURE_PROVENANCE,
  SCHEMA_INSTALLATION_RECEIPT,
  SCHEMA_PULL_REQUEST_TIMING,
  SCHEMA_QUANTILE_SET,
  SCHEMA_REVIEW_ROUNDS_ACTUAL,
  SCHEMA_REVIEW_WAVE_MANIFEST,
  SCHEMA_TIMING_BUDGET,
  SCHEMA_TIMING_ESTIMATE,
  SCHEMA_TIMING_SERIES,
  SUPPORTED_PROFILE_VERSIONS,
} from "./types.js";

export interface Diagnostic {
  code: string;
  message: string;
  path?: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Diagnostic[] };

export { DIGEST_RE, INSTANT_RE, REPO_RE, SHA_RE, durationSeconds, isDigest, isInstant } from "./format.js";

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

class Ctx {
  errors: Diagnostic[] = [];
  fail(code: string, message: string, path?: string): void {
    this.errors.push(path === undefined ? { code, message } : { code, message, path });
  }
  checkSchemaLiteral(v: unknown, expected: string, path: string): void {
    if (v !== expected) {
      this.fail("bad-schema-literal", `schema must be exactly ${JSON.stringify(expected)}`, path);
    }
  }
  checkNoExtra(obj: Record<string, unknown>, allowed: readonly string[], path: string): void {
    for (const k of Object.keys(obj)) {
      if (!allowed.includes(k)) {
        if (k === "held") {
          this.fail("combined-held-flag", "no combined held flag is published anywhere in the envelope", path ? `${path}.${k}` : k);
        } else {
          this.fail("undeclared-field", `undeclared field ${JSON.stringify(k)} on a closed DTO`, path ? `${path}.${k}` : k);
        }
      }
    }
  }
  checkInstant(v: unknown, path: string): void {
    if (!isInstant(v)) this.fail("bad-instant", "instant must be a UTC ISO-8601 string (second or millisecond precision)", path);
  }
  checkDigest(v: unknown, path: string): void {
    if (!isDigest(v)) this.fail("bad-digest", "digest must be sha256:<64 lowercase hex>", path);
  }
  checkRepo(v: unknown, path: string): void {
    if (typeof v !== "string" || !REPO_RE.test(v)) this.fail("bad-repo", "repo must be owner/name", path);
  }
  checkWindow(v: unknown, path: string): void {
    if (!isRecord(v)) {
      this.fail("bad-type", "window must be {from, to} UTC instants", path);
      return;
    }
    this.checkNoExtra(v, ["from", "to"], path);
    if (!isInstant(v["from"]) || !isInstant(v["to"])) {
      this.fail("bad-type", "window must be {from, to} UTC instants", path);
    }
  }
  checkIdValue(v: unknown, path: string): void {
    if (!isInt(v) && typeof v !== "string") {
      this.fail("bad-type", "identifier must be an integer or a string", path);
    }
  }
}

function done<T>(ctx: Ctx, value: unknown): ValidationResult<T> {
  return ctx.errors.length === 0 ? { ok: true, value: value as T } : { ok: false, errors: ctx.errors };
}

/**
 * Regime fingerprint components (spec section 6.4): attested model/effort
 * fields when available, review policy, workflow path and transitive
 * configuration digest, runner, toolchain, suite/shard set, job set.
 * Unattested components are explicitly `unknown`, never omitted silently
 * and never defaulted.
 */
export const FINGERPRINT_COMPONENTS = [
  "model", "effort", "reviewPolicy", "workflowPath", "configDigest",
  "runner", "toolchain", "suiteShardSet", "jobSet",
] as const;

function checkFingerprint(c: Ctx, v: unknown, path: string): void {
  if (!isRecord(v)) {
    c.fail("bad-type", "fingerprint must be an object (unattested components explicitly unknown)", path);
    return;
  }
  c.checkNoExtra(v, FINGERPRINT_COMPONENTS, path);
  for (const k of FINGERPRINT_COMPONENTS) {
    if (typeof v[k] !== "string" || (v[k] as string).length === 0) {
      c.fail("missing-fingerprint-component", `regime fingerprint component ${JSON.stringify(k)} is required, explicitly "unknown" where unattested`, `${path}.${k}`);
    }
  }
}

// --- PullRequestTimingV1 (section 6.2) ------------------------------------

const PR_FIELDS = [
  "schema", "repo", "number", "url", "createdAt", "mergedAt", "headSha",
  "mergeSha", "firstCommitAt", "firstCommitPolicy", "openToMergeSeconds",
  "commits", "commitsCollectionState",
] as const;

/** Canonical `pr_open_to_merge` sample, or null (censored/missing/quarantined). */
export function openToMergeSample(pr: Pick<PullRequestTimingV1, "createdAt" | "mergedAt">): number | null {
  if (pr.mergedAt === null) return null;
  const d = durationSeconds(pr.createdAt, pr.mergedAt);
  return d.seconds;
}

export function validatePullRequestTiming(v: unknown, attempts: CollectionAttemptEvidence[] = []): ValidationResult<PullRequestTimingV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "PullRequestTimingV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_PULL_REQUEST_TIMING, "schema");
  c.checkNoExtra(v, PR_FIELDS, "");
  for (const removed of ["installedAt", "reviewRoundsActual", "reportedOpenToMergeHours", "reportedFirstCommitToMergeHours", "pr", "opened", "merged", "first_commit"]) {
    if (removed in v) {
      c.fail("removed-field", `field ${JSON.stringify(removed)} is archive evidence only, rejected as current DTO input`, removed);
    }
  }
  c.checkRepo(v["repo"], "repo");
  if (!isInt(v["number"]) || (v["number"] as number) <= 0) c.fail("bad-type", "number must be an integer > 0", "number");
  if ("url" in v && typeof v["url"] !== "string") c.fail("bad-type", "url must be a string", "url");
  c.checkInstant(v["createdAt"], "createdAt");
  if (v["mergedAt"] !== null) c.checkInstant(v["mergedAt"], "mergedAt");
  for (const f of ["headSha", "mergeSha"] as const) {
    if (f in v && typeof v[f] !== "string") c.fail("bad-type", `${f} must be a string`, f);
  }
  if (v["firstCommitAt"] !== null) c.checkInstant(v["firstCommitAt"], "firstCommitAt");
  if (v["firstCommitPolicy"] !== "proxy-only-excluded-from-forecasts") {
    c.fail("bad-enum", 'firstCommitPolicy must be "proxy-only-excluded-from-forecasts"', "firstCommitPolicy");
  }
  // Canonical sample recomputation (section 3.3, 6.2 invariants).
  const expected = v["mergedAt"] === null || !isInstant(v["createdAt"]) || !isInstant(v["mergedAt"])
    ? null
    : durationSeconds(v["createdAt"] as string, v["mergedAt"] as string).seconds;
  if (v["openToMergeSeconds"] !== null && !isInt(v["openToMergeSeconds"])) {
    c.fail("bad-type", "openToMergeSeconds must be an integer or null", "openToMergeSeconds");
  } else if (v["openToMergeSeconds"] !== expected) {
    c.fail(
      "sample-mismatch",
      expected === null
        ? "absent or incoherent instants yield a null sample, never a fallback value"
        : `openToMergeSeconds must equal mergedAt-createdAt in seconds (${expected})`,
      "openToMergeSeconds",
    );
  }
  // commits / commitsCollectionState matrix (section 6.2, A6).
  const state = v["commitsCollectionState"];
  if (state !== "not-collected" && state !== "collected" && state !== "unavailable") {
    c.fail("bad-enum", "commitsCollectionState must be not-collected | collected | unavailable", "commitsCollectionState");
  } else if (state === "collected") {
    if (!Array.isArray(v["commits"])) {
      c.fail("state-mismatch", 'commitsCollectionState "collected" requires a commits array (possibly empty)', "commits");
    } else {
      (v["commits"] as unknown[]).forEach((e, i) => {
        const p = `commits.${i}`;
        if (!isRecord(e)) {
          c.fail("bad-type", "each commit must be {sha, authoredAt, committedAt} with UTC instants", p);
          return;
        }
        c.checkNoExtra(e, ["sha", "authoredAt", "committedAt"], p);
        if (typeof e["sha"] !== "string" || (e["sha"] as string).length === 0) {
          c.fail("bad-type", "commit sha must be a non-empty string", `${p}.sha`);
        }
        if (!isInstant(e["authoredAt"]) || !isInstant(e["committedAt"])) {
          c.fail("bad-type", "commit authoredAt/committedAt must be UTC instants", p);
        }
      });
    }
    if ("commitsCollected" in v) c.fail("removed-field", "no commitsCollected boolean field exists", "commitsCollected");
  } else if (v["commits"] !== null) {
    c.fail("state-mismatch", `commitsCollectionState "${state}" requires commits: null`, "commits");
  }
  // `unavailable` requires an attested failed collection attempt with a
  // documented cause (section 6.2, A6): enforced on the main validation
  // path, never in a side helper alone.
  if (state === "unavailable" && typeof v["repo"] === "string" && (typeof v["number"] === "number" || typeof v["number"] === "string")) {
    for (const e of validateCommitsUnavailable(
      { repo: v["repo"], number: v["number"], commitsCollectionState: "unavailable" },
      attempts,
    )) {
      c.fail(e.code, e.message, e.path);
    }
  } else if (state === "unavailable") {
    c.fail("missing-collection-attempt", 'commits "unavailable" requires an attested failed collection attempt with a documented cause', "commitsCollectionState");
  }
  return done(c, v);
}

/**
 * Attested collection-attempt evidence for `commitsCollectionState:
 * "unavailable"` (section 6.2, A6): the failed attempt with its documented
 * cause, kept in the collection evidence beside the pull-request record.
 */
export interface CollectionAttemptEvidence {
  repo: string;
  number: number | string;
  attemptedAt: string;
  cause: string;
}

/**
 * `unavailable` requires an attested failed collection attempt with a
 * documented cause in the collection evidence. Records in any other state
 * need no evidence; an `unavailable` record without a matching attempt, or
 * with an empty cause, is refused.
 */
export function validateCommitsUnavailable(
  pr: { repo: string; number: number | string; commitsCollectionState: PullRequestTimingV1["commitsCollectionState"] },
  attempts: CollectionAttemptEvidence[],
): Diagnostic[] {
  const errors: Diagnostic[] = [];
  if (pr.commitsCollectionState !== "unavailable") return errors;
  const matches = attempts.filter((a) => a.repo === pr.repo && String(a.number) === String(pr.number));
  if (matches.length === 0) {
    errors.push({
      code: "missing-collection-attempt",
      message: `commits "unavailable" for ${pr.repo}#${String(pr.number)} requires an attested failed collection attempt with a documented cause`,
      path: "commitsCollectionState",
    });
    return errors;
  }
  matches.forEach((a) => {
    if (!isInstant(a.attemptedAt)) {
      errors.push({ code: "bad-attempt", message: "the collection attempt carries its UTC instant", path: "attemptedAt" });
    }
    if (typeof a.cause !== "string" || a.cause.length === 0) {
      errors.push({ code: "missing-unavailability-cause", message: "the collection attempt documents its cause", path: "cause" });
    }
  });
  return errors;
}

// --- CiCheckBatchV1 (section 6.3) ------------------------------------------

const BATCH_FIELDS = [
  "schema", "repo", "number", "headSha", "source", "collectedAt",
  "totalCount", "pageSize", "page", "hasNextPage", "checks",
] as const;
const CHECK_FIELDS = [
  "id", "name", "headSha", "status", "conclusion", "startedAt", "completedAt", "url", "checkSuiteId",
] as const;

export function validateCiCheckBatch(v: unknown): ValidationResult<CiCheckBatchV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "CiCheckBatchV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_CI_CHECK_BATCH, "schema");
  c.checkNoExtra(v, BATCH_FIELDS, "");
  if ("pr" in v) c.fail("archived-spelling", 'canonical identifier is "number"; archived "pr" is rejected', "pr");
  c.checkRepo(v["repo"], "repo");
  if (!isInt(v["number"])) c.fail("bad-type", "number must be an integer", "number");
  if (typeof v["headSha"] !== "string" || (v["headSha"] as string).length === 0) {
    c.fail("bad-type", "headSha must be a non-empty string", "headSha");
  }
  if (typeof v["source"] !== "string" || (v["source"] as string).length === 0) {
    c.fail("bad-type", "source must be the exact API/source URL collected from", "source");
  }
  c.checkInstant(v["collectedAt"], "collectedAt");
  if (!isInt(v["totalCount"]) || (v["totalCount"] as number) < 0) {
    c.fail("bad-type", "totalCount must be an integer >= 0", "totalCount");
  }
  for (const f of ["pageSize", "page"] as const) {
    if (f in v && !isInt(v[f])) c.fail("bad-type", `${f} must be an integer`, f);
  }
  if ("hasNextPage" in v && typeof v["hasNextPage"] !== "boolean") {
    c.fail("bad-type", "hasNextPage must be a boolean", "hasNextPage");
  }
  if (!Array.isArray(v["checks"])) {
    c.fail("bad-type", "checks must be an array", "checks");
  } else {
    (v["checks"] as unknown[]).forEach((e, i) => {
      const p = `checks.${i}`;
      if (!isRecord(e)) {
        c.fail("bad-type", "check must be an object", p);
        return;
      }
      c.checkNoExtra(e, CHECK_FIELDS, p);
      c.checkIdValue(e["id"], `${p}.id`);
      if (typeof e["name"] !== "string" || (e["name"] as string).length === 0) {
        c.fail("bad-type", "check name must be a non-empty string", `${p}.name`);
      }
      if (typeof e["status"] !== "string" || typeof e["conclusion"] !== "string") {
        c.fail("bad-type", "check status/conclusion keep provider values as strings", p);
      }
      c.checkInstant(e["startedAt"], `${p}.startedAt`);
      c.checkInstant(e["completedAt"], `${p}.completedAt`);
      for (const f of ["headSha", "url"] as const) {
        if (f in e && typeof e[f] !== "string") c.fail("bad-type", `check ${f} must be a string`, `${p}.${f}`);
      }
      if ("checkSuiteId" in e && typeof e["checkSuiteId"] !== "number" && typeof e["checkSuiteId"] !== "string") {
        c.fail("bad-type", "check checkSuiteId must be a number or a string", `${p}.checkSuiteId`);
      }
    });
  }
  return done(c, v);
}

/** A check batch belongs to a pull-request final head only when head SHAs match. */
export function validateCheckBatchJoin(batch: CiCheckBatchV1, prHeadSha: string): ValidationResult<CiCheckBatchV1> {
  const c = new Ctx();
  if (batch.headSha !== prHeadSha) {
    c.fail("wrong-head", "batch headSha differs from the pull-request final head: a different batch, never merged", "headSha");
  }
  return done(c, batch);
}

/**
 * Integer-second gap between two millisecond readings, or null when the
 * interval is incoherent (end at or before start) or sub-second: durations
 * are stored as integer seconds, never negative and never fractional
 * (sections 3.3, 6.3). Incoherent intervals are quarantined by callers,
 * never averaged in.
 */
function integerGapSeconds(startMs: number, endMs: number): number | null {
  const ms = endMs - startMs;
  if (!(ms > 0) || ms % 1000 !== 0) return null;
  return ms / 1000;
}

/** Coherent service interval of one check, or null (skipped or quarantined). */
function coherentCheckSpan(check: { conclusion: string; startedAt: string; completedAt: string }): { start: number; end: number } | null {
  if (check.conclusion === "skipped") return null;
  if (!isInstant(check.startedAt) || !isInstant(check.completedAt)) return null;
  const start = Date.parse(check.startedAt);
  const end = Date.parse(check.completedAt);
  if (integerGapSeconds(start, end) === null) return null;
  return { start, end };
}

/**
 * One job service sample, or null: skipped checks and end-at-or-before-start
 * checks are never service samples (sections 3.4, 6.3).
 */
export function ciJobServiceSeconds(check: { status: string; conclusion: string; startedAt: string; completedAt: string }): number | null {
  const span = coherentCheckSpan(check);
  return span === null ? null : integerGapSeconds(span.start, span.end);
}

/** All-checks envelope over coherent checks; null when no coherent check exists. */
export function ciEnvelopeSeconds(batch: Pick<CiCheckBatchV1, "checks">): number | null {
  const spans = batch.checks.flatMap((ch) => {
    const span = coherentCheckSpan(ch);
    return span === null ? [] : [span];
  });
  if (spans.length === 0) return null;
  const starts = spans.map((s) => s.start);
  const ends = spans.map((s) => s.end);
  return integerGapSeconds(Math.min(...starts), Math.max(...ends));
}

/** Last-check-end to merge, or null when no coherent check exists. */
export function lastCheckEndToMergeSeconds(
  batch: Pick<CiCheckBatchV1, "checks">,
  mergedAt: string,
): number | null {
  if (!isInstant(mergedAt)) return null;
  const ends = batch.checks.flatMap((ch) => {
    const span = coherentCheckSpan(ch);
    return span === null ? [] : [span.end];
  });
  if (ends.length === 0) return null;
  return integerGapSeconds(Math.max(...ends), Date.parse(mergedAt));
}

// --- CollectionManifestV1 (section 6.1) ------------------------------------

const MANIFEST_FIELDS = [
  "schema", "ruleId", "ruleVersion", "repo", "query", "cutoff", "collectedAt",
  "firstAvailableAt", "historicalAvailability", "pageSize", "totalCount",
  "hasNextPage", "inclusionIds", "exclusionIds", "quarantine",
  "sourceRevision", "sourceUrls", "snapshotDigest",
] as const;

export function validateCollectionManifest(v: unknown): ValidationResult<CollectionManifestV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "CollectionManifestV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_COLLECTION_MANIFEST, "schema");
  c.checkNoExtra(v, MANIFEST_FIELDS, "");
  for (const f of ["ruleId", "ruleVersion", "query"] as const) {
    if (typeof v[f] !== "string" || (v[f] as string).length === 0) c.fail("bad-type", `${f} must be a non-empty string`, f);
  }
  c.checkRepo(v["repo"], "repo");
  c.checkInstant(v["cutoff"], "cutoff");
  c.checkInstant(v["collectedAt"], "collectedAt");
  if (v["firstAvailableAt"] !== null) c.checkInstant(v["firstAvailableAt"], "firstAvailableAt");
  if (v["historicalAvailability"] !== "attested" && v["historicalAvailability"] !== "unattested") {
    c.fail("bad-enum", "historicalAvailability must be attested | unattested", "historicalAvailability");
  }
  if (!isInt(v["pageSize"]) || (v["pageSize"] as number) <= 0) c.fail("bad-type", "pageSize must be an integer > 0", "pageSize");
  if (v["totalCount"] !== null && !isInt(v["totalCount"])) c.fail("bad-type", "totalCount must be an integer or null", "totalCount");
  if (typeof v["hasNextPage"] !== "boolean") c.fail("bad-type", "hasNextPage must be a boolean", "hasNextPage");
  for (const f of ["inclusionIds", "exclusionIds"] as const) {
    if (!Array.isArray(v[f])) {
      c.fail("bad-type", `${f} must be an array (possibly empty, never omitted)`, f);
    } else {
      (v[f] as unknown[]).forEach((id, i) => {
        c.checkIdValue(id, `${f}.${i}`);
      });
    }
  }
  if (!Array.isArray(v["quarantine"])) {
    c.fail("bad-type", "quarantine must be an array", "quarantine");
  } else {
    (v["quarantine"] as unknown[]).forEach((e, i) => {
      const p = `quarantine.${i}`;
      if (!isRecord(e)) {
        c.fail("bad-type", "each quarantine record must be {id, reason} with a non-empty reason", p);
        return;
      }
      c.checkNoExtra(e, ["id", "reason"], p);
      c.checkIdValue(e["id"], `${p}.id`);
      if (typeof e["reason"] !== "string" || (e["reason"] as string).length === 0) {
        c.fail("bad-type", "each quarantine record carries a non-empty reason", `${p}.reason`);
      }
    });
  }
  if (typeof v["sourceRevision"] !== "string" || !SHA_RE.test(v["sourceRevision"] as string)) {
    c.fail("bad-source-revision", "sourceRevision must be a full immutable commit SHA (40 lowercase hex); a branch name or mutable tag is refused", "sourceRevision");
  }
  if (!Array.isArray(v["sourceUrls"])) {
    c.fail("bad-type", "sourceUrls must be an array", "sourceUrls");
  } else {
    (v["sourceUrls"] as unknown[]).forEach((u, i) => {
      if (typeof u !== "string" || (u as string).length === 0) {
        c.fail("bad-type", `sourceUrls[${i}] must be a non-empty string`, `sourceUrls.${i}`);
      }
    });
  }
  c.checkDigest(v["snapshotDigest"], "snapshotDigest");
  return done(c, v);
}

/**
 * A remaining page, a provider error or a totalCount mismatch forbids a
 * `complete` claim (TR-06). Returns diagnostics; empty means complete may
 * be claimed.
 */
export function assertSnapshotComplete(manifest: Pick<CollectionManifestV1, "hasNextPage" | "totalCount" | "inclusionIds">): Diagnostic[] {
  const errors: Diagnostic[] = [];
  if (manifest.hasNextPage) {
    errors.push({ code: "remaining-page", message: "a remaining page forbids a complete claim", path: "hasNextPage" });
  }
  if (manifest.totalCount !== null && manifest.totalCount !== manifest.inclusionIds.length) {
    errors.push({ code: "count-mismatch", message: "provider total disagrees with the collected count: complete forbidden", path: "totalCount" });
  }
  return errors;
}

/** Duplicate pages never double n: stable dedupe preserving first order. */
export function dedupeIds(ids: Array<number | string>): Array<number | string> {
  const seen = new Set<string>();
  const out: Array<number | string> = [];
  for (const id of ids) {
    const k = `${typeof id}:${String(id)}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(id);
    }
  }
  return out;
}

// --- CohortV1 (section 6.4) --------------------------------------------------

const COHORT_FIELDS = [
  "schema", "cohortKey", "repo", "metric", "manifestRef", "memberIds", "n", "window", "fingerprint", "purpose",
] as const;

const METRICS = [
  "start_to_pr_open", "pr_open_to_merge", "merge_to_installed", "agent_run_elapsed",
  "agent_work_seconds", "ci_job_service", "ci_envelope", "ci_workflow_span", "wait_interval",
] as const;

const FROZEN_COHORT_KEYS = ["astra-merged-desc/1", "sol-created-desc/1", "enriched", "older"] as const;

export function validateCohort(v: unknown): ValidationResult<CohortV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "CohortV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_COHORT, "schema");
  c.checkNoExtra(v, COHORT_FIELDS, "");
  if (typeof v["cohortKey"] !== "string" || (v["cohortKey"] as string).length === 0) {
    c.fail("bad-type", "cohortKey must be a non-empty versioned identifier", "cohortKey");
  }
  c.checkRepo(v["repo"], "repo");
  if (!(METRICS as readonly string[]).includes(v["metric"] as string)) {
    c.fail("bad-enum", "metric must be a section 3.1 metric identifier; a cohort mixing metrics is refused", "metric");
  }
  const ref = v["manifestRef"];
  if (!isRecord(ref)) {
    c.fail("bad-type", "manifestRef must be {ruleId, snapshotDigest}", "manifestRef");
  } else {
    c.checkNoExtra(ref, ["ruleId", "snapshotDigest"], "manifestRef");
    if (typeof ref["ruleId"] !== "string" || (ref["ruleId"] as string).length === 0) {
      c.fail("bad-type", "manifestRef.ruleId must be a non-empty versioned rule identifier", "manifestRef.ruleId");
    }
    c.checkDigest(ref["snapshotDigest"], "manifestRef.snapshotDigest");
  }
  if (!Array.isArray(v["memberIds"])) {
    c.fail("bad-type", "memberIds must be an array in manifest order", "memberIds");
  } else {
    const seen = new Set<string>();
    for (const id of v["memberIds"] as unknown[]) {
      if (!isInt(id) && typeof id !== "string") {
        c.fail("bad-type", "cohort members must be integer or string identifiers", "memberIds");
        break;
      }
      const k = `${typeof id}:${String(id)}`;
      if (seen.has(k)) {
        c.fail("duplicate-member", "duplicate cohort members are rejected before counting or computing quantiles", "memberIds");
        break;
      }
      seen.add(k);
    }
    if (v["n"] !== (v["memberIds"] as unknown[]).length) {
      c.fail("count-mismatch", "n must equal memberIds.length after quarantine removal", "n");
    }
  }
  if (!isInt(v["n"]) || (v["n"] as number) < 0) c.fail("bad-type", "n must be an integer >= 0", "n");
  c.checkWindow(v["window"], "window");
  checkFingerprint(c, v["fingerprint"], "fingerprint");
  if (typeof v["purpose"] !== "string" || (v["purpose"] as string).length === 0) {
    c.fail("bad-type", "purpose must be a non-empty string", "purpose");
  } else if ((FROZEN_COHORT_KEYS as readonly string[]).includes(v["cohortKey"] as string)) {
    if (v["purpose"] !== "retrospective-frozen-evidence") {
      c.fail("bad-enum", "bootstrap cohorts carry purpose retrospective-frozen-evidence", "purpose");
    }
    if (v["metric"] !== "pr_open_to_merge") {
      c.fail("bad-enum", "bootstrap cohorts sample pr_open_to_merge only", "metric");
    }
  }
  return done(c, v);
}

// --- QuantileSetV1 (section 6.5) ---------------------------------------------

const QUANTILE_FIELDS = [
  "schema", "quantileMethod", "support", "calibrated", "sampleCount", "nEff",
  "p50Seconds", "p80Seconds", "p95Seconds", "maxSeconds", "tailQualification", "weightsPolicy",
] as const;

const SUPPORTS = ["descriptive", "uncalibrated-conditional", "calibrated", "insufficient-evidence"] as const;

export function validateQuantileSet(v: unknown): ValidationResult<QuantileSetV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "QuantileSetV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_QUANTILE_SET, "schema");
  c.checkNoExtra(v, QUANTILE_FIELDS, "");
  if (v["quantileMethod"] !== "nearest-rank/1" && v["quantileMethod"] !== "weighted-ecdf/1") {
    c.fail("bad-enum", "quantileMethod must be nearest-rank/1 | weighted-ecdf/1", "quantileMethod");
  }
  if (!(SUPPORTS as readonly string[]).includes(v["support"] as string)) {
    c.fail("bad-enum", "support must be a section 4.3 tier", "support");
  }
  if (typeof v["calibrated"] !== "boolean") {
    c.fail("bad-type", "calibrated must be a boolean", "calibrated");
  } else if (v["calibrated"] !== (v["support"] === "calibrated")) {
    c.fail("support-mismatch", "calibrated and support must agree (calibrated:true requires support:calibrated)", "calibrated");
  }
  if (!isInt(v["sampleCount"]) || (v["sampleCount"] as number) < 0) {
    c.fail("bad-type", "sampleCount must be an integer >= 0", "sampleCount");
  }
  let nEffRatio: { numerator: string; denominator: string } | null = null;
  try {
    nEffRatio = parseEffectiveSizeRatio(v["nEff"]);
    if (v["quantileMethod"] === "nearest-rank/1" && isInt(v["sampleCount"])) {
      if (nEffRatio.numerator !== String(v["sampleCount"]) || nEffRatio.denominator !== "1") {
        c.fail("neff-mismatch", "unit weights give nEff = sampleCount/1", "nEff");
      }
    }
  } catch (e) {
    c.fail("invalid-neff", (e as Error).message, "nEff");
  }
  const tails = [v["p50Seconds"], v["p80Seconds"], v["p95Seconds"]];
  tails.forEach((t, i) => {
    if (t !== null && (!isInt(t) || (t as number) < 0)) {
      c.fail("bad-type", "quantile values are integer seconds or null", `p${["50", "80", "95"][i]}Seconds`);
    }
  });
  const anyNull = tails.some((t) => t === null);
  if (v["support"] === "insufficient-evidence") {
    if (!tails.every((t) => t === null)) {
      c.fail("support-mismatch", "insufficient-evidence publishes null quantiles with a reason, never zero", "support");
    }
  }
  if (v["sampleCount"] === 0 && !tails.every((t) => t === null)) {
    c.fail("support-mismatch", "n = 0 abstains: quantiles are null", "sampleCount");
  }
  if (anyNull && (typeof v["tailQualification"] !== "string" || (v["tailQualification"] as string).length === 0)) {
    c.fail("missing-tail-reason", "a null quantile requires tailQualification with effective-observation and campaign counts", "tailQualification");
  }
  // Effective tail readability (section 4.3): a calibrated quantile is
  // displayed only with at least 5 effective observations beyond it.
  if (v["support"] === "calibrated" && nEffRatio !== null) {
    const levels: Array<[unknown, number, string]> = [
      [v["p50Seconds"], 0.5, "p50Seconds"],
      [v["p80Seconds"], 0.8, "p80Seconds"],
      [v["p95Seconds"], 0.95, "p95Seconds"],
    ];
    for (const [t, p, name] of levels) {
      if (t !== null && !meetsTailSupport(nEffRatio, p)) {
        c.fail("weak-tail-support", `calibrated ${name} needs at least 5 effective observations beyond it (nEff ${nEffRatio.numerator}/${nEffRatio.denominator})`, name);
      }
    }
  }
  // Displayed tails outside a calibrated claim carry their qualification
  // (section 6.5): effective-observation count beyond the quantile and the
  // independent-campaign count.
  if ((v["support"] === "descriptive" || v["support"] === "uncalibrated-conditional")
    && tails.some((t) => t !== null)
    && (typeof v["tailQualification"] !== "string" || (v["tailQualification"] as string).length === 0)) {
    c.fail("missing-tail-reason", "a displayed non-calibrated tail requires tailQualification with effective-observation and campaign counts", "tailQualification");
  }
  if ("maxSeconds" in v && (!isInt(v["maxSeconds"]) || (v["maxSeconds"] as number) < 0)) {
    c.fail("bad-type", "maxSeconds must be an integer >= 0", "maxSeconds");
  }
  if ("weightsPolicy" in v && typeof v["weightsPolicy"] !== "string") {
    c.fail("bad-type", "weightsPolicy must be a versioned policy identifier", "weightsPolicy");
  }
  return done(c, v);
}

// --- TimingSeries / Estimate / Budget (section 6.6) --------------------------

const SERIES_FIELDS = [
  "schema", "seriesId", "subject", "metric", "cohortRef", "quantiles", "unit",
  "window", "estimatorVersion", "policyVersion", "missingCount", "censoredCount",
  "exclusions", "fingerprint", "measured",
] as const;

export function validateTimingSeries(v: unknown): ValidationResult<TimingSeriesV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "TimingSeriesV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_TIMING_SERIES, "schema");
  c.checkNoExtra(v, SERIES_FIELDS, "");
  for (const f of ["seriesId", "subject", "estimatorVersion", "policyVersion"] as const) {
    if (typeof v[f] !== "string" || (v[f] as string).length === 0) c.fail("bad-type", `${f} must be a non-empty string`, f);
  }
  if (!(METRICS as readonly string[]).includes(v["metric"] as string)) c.fail("bad-enum", "metric must be a section 3.1 identifier", "metric");
  const ref = v["cohortRef"];
  if (!isRecord(ref)) {
    c.fail("bad-type", "cohortRef must be {cohortKey, snapshotDigest}", "cohortRef");
  } else {
    c.checkNoExtra(ref, ["cohortKey", "snapshotDigest"], "cohortRef");
    if (typeof ref["cohortKey"] !== "string" || (ref["cohortKey"] as string).length === 0) {
      c.fail("bad-type", "cohortRef.cohortKey must be a non-empty versioned cohort key", "cohortRef.cohortKey");
    }
    c.checkDigest(ref["snapshotDigest"], "cohortRef.snapshotDigest");
  }
  const q = validateQuantileSet(v["quantiles"]);
  if (!q.ok) for (const e of q.errors) c.fail(e.code, e.message, e.path === undefined ? "quantiles" : `quantiles.${e.path}`);
  if (v["unit"] !== "second") c.fail("bad-enum", 'unit is always "second"; no field stores days', "unit");
  c.checkWindow(v["window"], "window");
  for (const f of ["missingCount", "censoredCount"] as const) {
    if (!isInt(v[f]) || (v[f] as number) < 0) c.fail("bad-type", `${f} must be an integer >= 0`, f);
  }
  if (!Array.isArray(v["exclusions"])) {
    c.fail("bad-type", "exclusions is required (possibly empty, never omitted)", "exclusions");
  } else {
    const seen = new Set<string>();
    (v["exclusions"] as unknown[]).forEach((e, i) => {
      const p = `exclusions.${i}`;
      if (!isRecord(e)) {
        c.fail("bad-type", "each exclusion must be {id, reason}", p);
        return;
      }
      c.checkNoExtra(e, ["id", "reason"], p);
      c.checkIdValue(e["id"], `${p}.id`);
      if (typeof e["reason"] !== "string" || (e["reason"] as string).length === 0) {
        c.fail("missing-exclusion-reason", "every exclusion carries a non-empty reason", `${p}.reason`);
      }
      const k = `${typeof e["id"]}:${String(e["id"])}`;
      if (seen.has(k)) c.fail("duplicate-exclusion", "duplicate exclusion identifier", p);
      seen.add(k);
    });
  }
  checkFingerprint(c, v["fingerprint"], "fingerprint");
  if (typeof v["measured"] !== "boolean") c.fail("bad-type", "measured must be a boolean", "measured");
  return done(c, v);
}

/**
 * The `exclusions` identifier set equals the manifest `exclusionIds` set:
 * exactly one record per excluded identifier, no duplicate, no member
 * overlap, non-empty reasons (series-side reasons checked above).
 */
export function validateSeriesAgainstManifest(
  series: Pick<TimingSeriesV1, "exclusions" | "cohortRef">,
  manifest: Pick<CollectionManifestV1, "exclusionIds" | "inclusionIds" | "snapshotDigest">,
): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const exIds = series.exclusions.map((e) => `${typeof e.id}:${String(e.id)}`).sort();
  const manIds = [...manifest.exclusionIds].map((id) => `${typeof id}:${String(id)}`).sort();
  if (exIds.length !== manIds.length || exIds.some((k, i) => k !== manIds[i])) {
    errors.push({ code: "exclusion-manifest-mismatch", message: "series exclusions must be set-equal to the manifest exclusionIds", path: "exclusions" });
  }
  const members = new Set(manifest.inclusionIds.map((id) => `${typeof id}:${String(id)}`));
  for (const e of series.exclusions) {
    if (members.has(`${typeof e.id}:${String(e.id)}`)) {
      errors.push({ code: "exclusion-member-overlap", message: `excluded identifier ${String(e.id)} is also a cohort member`, path: "exclusions" });
    }
  }
  if (series.cohortRef.snapshotDigest !== manifest.snapshotDigest) {
    errors.push({ code: "cohort-manifest-mismatch", message: "series cohortRef must pin the producing manifest snapshotDigest", path: "cohortRef" });
  }
  return errors;
}

const ESTIMATE_FIELDS = [
  "schema", "estimateId", "seriesRef", "quantiles", "applicability", "freshness", "support", "limitations",
] as const;

export function validateTimingEstimate(v: unknown): ValidationResult<TimingEstimateV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "TimingEstimateV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_TIMING_ESTIMATE, "schema");
  c.checkNoExtra(v, ESTIMATE_FIELDS, "");
  if (typeof v["estimateId"] !== "string" || (v["estimateId"] as string).length === 0) {
    c.fail("bad-type", "estimateId must be a non-empty string", "estimateId");
  }
  const ref = v["seriesRef"];
  if (!isRecord(ref)) {
    c.fail("bad-type", "seriesRef must be {seriesId, snapshotDigest}", "seriesRef");
  } else {
    c.checkNoExtra(ref, ["seriesId", "snapshotDigest"], "seriesRef");
    if (typeof ref["seriesId"] !== "string" || (ref["seriesId"] as string).length === 0) {
      c.fail("bad-type", "seriesRef.seriesId must be a non-empty stable identifier", "seriesRef.seriesId");
    }
    c.checkDigest(ref["snapshotDigest"], "seriesRef.snapshotDigest");
  }
  const q = validateQuantileSet(v["quantiles"]);
  if (!q.ok) for (const e of q.errors) c.fail(e.code, e.message, e.path === undefined ? "quantiles" : `quantiles.${e.path}`);
  if (v["applicability"] !== "applicable" && v["applicability"] !== "conditional-historical" && v["applicability"] !== "incomplete") {
    c.fail("bad-enum", "applicability must be applicable | conditional-historical | incomplete", "applicability");
  }
  const f = v["freshness"];
  if (!isRecord(f)) {
    c.fail("bad-type", "freshness must carry window{from,to}, collectedAt and referencePublishedAt", "freshness");
  } else {
    c.checkNoExtra(f, ["window", "collectedAt", "referencePublishedAt"], "freshness");
    c.checkWindow(f["window"], "freshness.window");
    if (!isInstant(f["collectedAt"])) c.fail("bad-type", "freshness.collectedAt must be a UTC instant", "freshness.collectedAt");
    if (!isInstant(f["referencePublishedAt"])) {
      c.fail("bad-type", "freshness.referencePublishedAt must be a UTC instant", "freshness.referencePublishedAt");
    }
  }
  if (q.ok && v["support"] !== (v["quantiles"] as QuantileSetV1).support) {
    c.fail("support-mismatch", "estimate support must equal its quantiles support", "support");
  } else if (!q.ok && !(SUPPORTS as readonly string[]).includes(v["support"] as string)) {
    c.fail("bad-enum", "support must be a section 4.3 tier", "support");
  }
  if (!Array.isArray(v["limitations"])) c.fail("bad-type", "limitations is required (possibly empty, never omitted)", "limitations");
  return done(c, v);
}

const BUDGET_FIELDS = [
  "schema", "budgetId", "subject", "targetSeconds", "boundSeconds", "rationale", "decisionRef", "owner", "revisitTrigger",
] as const;

export function validateTimingBudget(v: unknown): ValidationResult<TimingBudgetV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "TimingBudgetV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_TIMING_BUDGET, "schema");
  c.checkNoExtra(v, BUDGET_FIELDS, "");
  for (const evidence of ["sampleCount", "nEff", "p50Seconds", "p80Seconds", "p95Seconds", "quantiles"] as const) {
    if (evidence in v) c.fail("budget-carries-evidence", `a budget carries no sample count and no confidence claim (${evidence} refused)`, evidence);
  }
  for (const f of ["budgetId", "subject", "rationale", "decisionRef", "owner", "revisitTrigger"] as const) {
    if (typeof v[f] !== "string" || (v[f] as string).length === 0) c.fail("bad-type", `${f} must be a non-empty string`, f);
  }
  const hasTarget = "targetSeconds" in v;
  const hasBound = "boundSeconds" in v;
  if (hasTarget === hasBound) {
    c.fail("bad-budget-bound", "a budget carries exactly one of targetSeconds or boundSeconds", "targetSeconds");
  }
  for (const f of ["targetSeconds", "boundSeconds"] as const) {
    if (f in v && (!isInt(v[f]) || (v[f] as number) < 0)) c.fail("bad-type", `${f} must be integer seconds`, f);
  }
  return done(c, v);
}

// --- FigureProvenanceV1 (section 6.7) ---------------------------------------

const PROVENANCE_FIELDS = [
  "schema", "figureRef", "cohortKey", "ruleId", "snapshotDigest", "referenceDigest",
  "referencePublishedAt", "referencePublicationRevision", "collectedAt",
  "firstAvailableAt", "appliesToRevision", "fingerprintDigest",
  "estimatorVersion", "policyVersion", "quantileMethod",
] as const;

export function validateFigureProvenance(v: unknown): ValidationResult<FigureProvenanceV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "FigureProvenanceV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_FIGURE_PROVENANCE, "schema");
  c.checkNoExtra(v, PROVENANCE_FIELDS, "");
  for (const f of ["figureRef", "cohortKey", "ruleId", "referencePublicationRevision", "appliesToRevision", "estimatorVersion", "policyVersion"] as const) {
    if (typeof v[f] !== "string" || (v[f] as string).length === 0) c.fail("bad-type", `${f} must be a non-empty string`, f);
  }
  c.checkDigest(v["snapshotDigest"], "snapshotDigest");
  c.checkDigest(v["referenceDigest"], "referenceDigest");
  c.checkDigest(v["fingerprintDigest"], "fingerprintDigest");
  c.checkInstant(v["referencePublishedAt"], "referencePublishedAt");
  c.checkInstant(v["collectedAt"], "collectedAt");
  if (v["firstAvailableAt"] !== null) c.checkInstant(v["firstAvailableAt"], "firstAvailableAt");
  if (v["quantileMethod"] !== "nearest-rank/1" && v["quantileMethod"] !== "weighted-ecdf/1") {
    c.fail("bad-enum", "quantileMethod must be nearest-rank/1 | weighted-ecdf/1", "quantileMethod");
  }
  return done(c, v);
}

// --- DeliveryMilestonesV1 (section 6.9) --------------------------------------

const MILESTONES_FIELDS = ["schema", "repo", "lotRef", "forecastRevision", "mergeSha", "mergeMilestone", "installMilestones"] as const;

export function validateDeliveryMilestones(v: unknown): ValidationResult<DeliveryMilestonesV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "DeliveryMilestonesV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_DELIVERY_MILESTONES, "schema");
  c.checkNoExtra(v, MILESTONES_FIELDS, "");
  c.checkRepo(v["repo"], "repo");
  for (const f of ["lotRef", "forecastRevision"] as const) {
    if (typeof v[f] !== "string" || (v[f] as string).length === 0) c.fail("bad-type", `${f} must be a non-empty identified context`, f);
  }
  if (v["mergeSha"] !== null && typeof v["mergeSha"] !== "string") {
    c.fail("bad-type", "mergeSha must be a string or null until merged", "mergeSha");
  }
  const m = v["mergeMilestone"];
  if (!isRecord(m)) {
    c.fail("bad-type", "mergeMilestone must be an object", "mergeMilestone");
  } else {
    if (m["forecastAt"] !== null) c.checkInstant(m["forecastAt"], "mergeMilestone.forecastAt");
    if (m["mergedAt"] !== null) c.checkInstant(m["mergedAt"], "mergeMilestone.mergedAt");
    const recomputed = parseMergeVerdict(
      m["forecastAt"] === null ? null : String(m["forecastAt"]),
      m["mergedAt"] === null ? null : String(m["mergedAt"]),
    );
    if (m["verdict"] !== recomputed) {
      c.fail("verdict-mismatch", `merge verdict must be computed from the two instants (${recomputed})`, "mergeMilestone.verdict");
    }
    for (const k of Object.keys(m)) {
      if (!["forecastAt", "mergedAt", "verdict"].includes(k)) {
        c.fail("undeclared-field", `undeclared field ${JSON.stringify(k)} in mergeMilestone`, `mergeMilestone.${k}`);
      }
    }
  }
  if (!Array.isArray(v["installMilestones"])) {
    c.fail("bad-type", "installMilestones must be an array (possibly empty)", "installMilestones");
  } else {
    const seen = new Set<string>();
    (v["installMilestones"] as unknown[]).forEach((e, i) => {
      const p = `installMilestones.${i}`;
      if (!isRecord(e)) {
        c.fail("bad-type", "install entry must be an object", p);
        return;
      }
      c.checkNoExtra(e, ["targetId", "forecastAt", "installedAt", "verdict", "receiptRef"], p);
      if (typeof e["targetId"] !== "string" || (e["targetId"] as string).length === 0) {
        c.fail("bad-type", "targetId must be a non-empty string", `${p}.targetId`);
      } else if (seen.has(e["targetId"] as string)) {
        c.fail("duplicate-target", "installMilestones contains at most one entry per targetId", p);
      } else {
        seen.add(e["targetId"] as string);
      }
      if (e["forecastAt"] !== null) c.checkInstant(e["forecastAt"], `${p}.forecastAt`);
      const installed = e["installedAt"];
      if (installed !== "unknown") c.checkInstant(installed, `${p}.installedAt`);
      const verdict = e["verdict"];
      if (installed === "unknown") {
        if (verdict !== "unknown") c.fail("verdict-mismatch", 'verdict is "unknown" whenever installedAt is "unknown"', `${p}.verdict`);
      } else if (e["forecastAt"] === null || !isInstant(e["forecastAt"]) || !isInstant(installed)) {
        c.fail("verdict-mismatch", "a known installedAt requires a dated forecast endpoint for its verdict", `${p}.verdict`);
      } else {
        const want = Date.parse(String(installed)) <= Date.parse(String(e["forecastAt"])) ? "held" : "missed";
        if (verdict !== want) c.fail("verdict-mismatch", `installation verdict must be computed from the two instants (${want})`, `${p}.verdict`);
      }
      if (installed !== "unknown"
        && (typeof e["receiptRef"] !== "string" || (e["receiptRef"] as string).length === 0)) {
        c.fail("missing-receipt-ref", "a known installedAt resolves to a matching qualified receipt via receiptRef", `${p}.receiptRef`);
      } else if ("receiptRef" in e && typeof e["receiptRef"] !== "string") {
        c.fail("bad-type", "receiptRef must be a string", `${p}.receiptRef`);
      }
    });
  }
  return done(c, v);
}

/**
 * Identified repository/lot context a receipt resolution is bound to
 * (sections 6.9, 7.2): a receipt from another repository or lot
 * occurrence never backs an installation actual.
 */
export interface MilestoneScope {
  repo: string;
  lotOccurrence: string;
}

/**
 * Every known installation actual resolves to exactly one matching
 * qualified receipt (section 6.9): `receiptRef` names the receipt, which
 * must be structurally valid, belong to the identified repository/lot,
 * target the same target, and reproduce the published `installedAt` under
 * the frozen target declaration. An arbitrary `receiptRef` naming no
 * supplied receipt, or a receipt from another repository or lot, fails.
 * Unknown actuals need no receipt.
 */
export function validateMilestonesAgainstReceipts(
  record: Pick<DeliveryMilestonesV1, "installMilestones" | "repo">,
  receipts: Record<string, InstallationReceiptV1>,
  quals: Record<string, TargetQualification>,
  scope: MilestoneScope,
): Diagnostic[] {
  const errors: Diagnostic[] = [];
  if (record.repo !== scope.repo) {
    errors.push({ code: "scope-mismatch", message: `milestones record for ${JSON.stringify(record.repo)} is resolved against scope ${JSON.stringify(scope.repo)}`, path: "repo" });
    return errors;
  }
  record.installMilestones.forEach((entry, i) => {
    const p = `installMilestones.${i}`;
    if (entry.installedAt === "unknown") return;
    if (typeof entry.receiptRef !== "string" || entry.receiptRef.length === 0) {
      errors.push({ code: "missing-receipt-ref", message: "a known installedAt resolves to a matching qualified receipt via receiptRef", path: `${p}.receiptRef` });
      return;
    }
    const receipt = receipts[entry.receiptRef];
    if (receipt === undefined) {
      errors.push({ code: "unresolved-receipt", message: `receiptRef ${JSON.stringify(entry.receiptRef)} names no supplied receipt for target ${JSON.stringify(entry.targetId)}`, path: `${p}.receiptRef` });
      return;
    }
    if (receipt.targetId !== entry.targetId || receipt.repo !== scope.repo || receipt.lotOccurrence !== scope.lotOccurrence) {
      errors.push({ code: "unresolved-receipt", message: `receipt ${JSON.stringify(entry.receiptRef)} is not a same-target receipt of the identified repository/lot for target ${JSON.stringify(entry.targetId)}`, path: p });
      return;
    }
    if (!validateInstallationReceipt(receipt).ok) {
      errors.push({ code: "unresolved-receipt", message: `receipt ${JSON.stringify(entry.receiptRef)} is structurally invalid and backs no installedAt`, path: p });
      return;
    }
    const qual = quals[entry.targetId];
    if (qual === undefined) {
      errors.push({ code: "missing-target-declaration", message: `no frozen target declaration for target ${JSON.stringify(entry.targetId)}`, path: p });
      return;
    }
    const reproduced = qualifyInstallation(
      { targetId: entry.targetId, forecastAt: entry.forecastAt, receipt },
      qual,
    ).installedAt === entry.installedAt;
    if (!reproduced) {
      errors.push({ code: "unresolved-receipt", message: `no qualified receipt reproduces installedAt ${JSON.stringify(entry.installedAt)} for target ${JSON.stringify(entry.targetId)}`, path: p });
    }
  });
  return errors;
}

/**
 * Primary milestone validation (sections 6.9, 7.2): structural validation
 * plus receipt resolution bound to the identified repository/lot. This is
 * the path callers use to accept a `DeliveryMilestonesV1` with known
 * installation actuals; structural validation alone never accepts one.
 */
export function validateDeliveryMilestonesWithReceipts(
  record: unknown,
  receipts: Record<string, InstallationReceiptV1>,
  quals: Record<string, TargetQualification>,
  scope: MilestoneScope,
): ValidationResult<DeliveryMilestonesV1> {
  const structural = validateDeliveryMilestones(record);
  if (!structural.ok) return structural;
  const errors = validateMilestonesAgainstReceipts(structural.value, receipts, quals, scope);
  return errors.length === 0 ? { ok: true, value: structural.value } : { ok: false, errors };
}

// --- InstallationReceiptV1 (section 6.10) ------------------------------------

const RECEIPT_FIELDS = [
  "schema", "repo", "lotOccurrence", "mergeSha", "releaseSourceSha", "ancestryEvidence",
  "targetId", "targetKind", "platform", "installationScope", "expectedVersion",
  "observedVersion", "expectedTuple", "observedTuple", "artifactIntegrity",
  "resolvedExecutable", "installStartedAt", "installCompletedAt", "smokeCompletedAt",
  "installOutcome", "smokeOutcome", "clockSource", "producerIdentity", "evidenceDigests",
] as const;

export function validateInstallationReceipt(v: unknown): ValidationResult<InstallationReceiptV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "InstallationReceiptV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_INSTALLATION_RECEIPT, "schema");
  c.checkNoExtra(v, RECEIPT_FIELDS, "");
  c.checkRepo(v["repo"], "repo");
  for (const f of ["lotOccurrence", "mergeSha", "releaseSourceSha", "ancestryEvidence", "targetId", "platform",
    "installationScope", "expectedVersion", "observedVersion", "expectedTuple", "observedTuple",
    "artifactIntegrity", "resolvedExecutable", "clockSource", "producerIdentity"] as const) {
    if (typeof v[f] !== "string" || (v[f] as string).length === 0) c.fail("bad-type", `${f} must be a non-empty string`, f);
  }
  if (v["targetKind"] !== "ci-runner" && v["targetKind"] !== "delivery-environment") {
    c.fail("bad-enum", "targetKind must be ci-runner | delivery-environment", "targetKind");
  }
  c.checkInstant(v["installStartedAt"], "installStartedAt");
  c.checkInstant(v["installCompletedAt"], "installCompletedAt");
  c.checkInstant(v["smokeCompletedAt"], "smokeCompletedAt");
  if (isInstant(v["installStartedAt"]) && isInstant(v["installCompletedAt"]) && isInstant(v["smokeCompletedAt"])) {
    const a = Date.parse(v["installStartedAt"] as string);
    const b = Date.parse(v["installCompletedAt"] as string);
    const d = Date.parse(v["smokeCompletedAt"] as string);
    if (!(a <= b && b <= d)) {
      c.fail("incoherent-timestamps", "receipt timestamps must satisfy installStartedAt <= installCompletedAt <= smokeCompletedAt", "smokeCompletedAt");
    }
  }
  for (const f of ["installOutcome", "smokeOutcome"] as const) {
    if (v[f] !== "success" && v[f] !== "failure") c.fail("bad-enum", `${f} must be success | failure`, f);
  }
  if (!Array.isArray(v["evidenceDigests"])) {
    c.fail("bad-type", "evidenceDigests must be an array", "evidenceDigests");
  } else {
    (v["evidenceDigests"] as unknown[]).forEach((e, i) => {
      if (!isDigest(e)) c.fail("bad-digest", "every evidence digest must be sha256:<64 lowercase hex>", `evidenceDigests.${i}`);
    });
  }
  return done(c, v);
}

// --- CommittedExportV1 (section 6.8) -----------------------------------------

const EXPORT_FIELDS = [
  "schema", "repo", "serviceRevision", "profileRef", "window", "generatedAt",
  "generator", "series", "estimates", "budgets", "milestones", "provenance", "exportDigest",
] as const;

export function validateCommittedExport(v: unknown): ValidationResult<CommittedExportV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "CommittedExportV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_COMMITTED_EXPORT, "schema");
  c.checkNoExtra(v, EXPORT_FIELDS, "");
  c.checkRepo(v["repo"], "repo");
  if (typeof v["serviceRevision"] !== "string" || (v["serviceRevision"] as string).length === 0) {
    c.fail("missing-service-binding", "an export without serviceRevision binding is refused", "serviceRevision");
  }
  const pref = v["profileRef"];
  if (!isRecord(pref)) {
    c.fail("missing-profile-pin", "profileRef must be {id: repo-knowledge, version, contentDigest}", "profileRef");
  } else {
    c.checkNoExtra(pref, ["id", "version", "contentDigest"], "profileRef");
    if (pref["id"] !== "repo-knowledge" || typeof pref["version"] !== "string"
      || (pref["version"] as string).length === 0 || !isDigest(pref["contentDigest"])) {
      c.fail("missing-profile-pin", "profileRef must be {id: repo-knowledge, version, contentDigest}", "profileRef");
    } else if (!(SUPPORTED_PROFILE_VERSIONS as readonly string[]).includes(pref["version"] as string)) {
      c.fail("unsupported-profile-version", `profileRef version ${JSON.stringify(pref["version"])} is not a supported profile pin; unknown versions refuse, never fall back`, "profileRef.version");
    }
  }
  c.checkWindow(v["window"], "window");
  c.checkInstant(v["generatedAt"], "generatedAt");
  const g = v["generator"];
  if (!isRecord(g)) {
    c.fail("bad-type", "generator must be {name, version} (Node/TypeScript generator identity)", "generator");
  } else {
    c.checkNoExtra(g, ["name", "version"], "generator");
    if (typeof g["name"] !== "string" || typeof g["version"] !== "string") {
      c.fail("bad-type", "generator must be {name, version} (Node/TypeScript generator identity)", "generator");
    }
  }
  for (const [field, fn] of [
    ["series", validateTimingSeries],
    ["estimates", validateTimingEstimate],
    ["budgets", validateTimingBudget],
  ] as const) {
    if (!Array.isArray(v[field])) {
      c.fail("bad-type", `${field} must be an array`, field);
    } else {
      (v[field] as unknown[]).forEach((e, i) => {
        const r = (fn as (x: unknown) => ValidationResult<unknown>)(e);
        if (!r.ok) for (const e2 of r.errors) c.fail(e2.code, e2.message, e2.path === undefined ? `${field}.${i}` : `${field}.${i}.${e2.path}`);
      });
    }
  }
  if (!("milestones" in v)) {
    c.fail("missing-milestones", "an envelope without the milestones field is refused", "milestones");
  } else if (!Array.isArray(v["milestones"])) {
    c.fail("bad-type", "milestones must be an array (possibly empty)", "milestones");
  } else {
    (v["milestones"] as unknown[]).forEach((e, i) => {
      const r = validateDeliveryMilestones(e);
      if (!r.ok) for (const e2 of r.errors) c.fail(e2.code, e2.message, e2.path === undefined ? `milestones.${i}` : `milestones.${i}.${e2.path}`);
    });
  }
  if (!Array.isArray(v["provenance"])) {
    c.fail("bad-type", "provenance must be an array", "provenance");
  } else {
    (v["provenance"] as unknown[]).forEach((e, i) => {
      const r = validateFigureProvenance(e);
      if (!r.ok) for (const e2 of r.errors) c.fail(e2.code, e2.message, e2.path === undefined ? `provenance.${i}` : `provenance.${i}.${e2.path}`);
    });
  }
  c.checkDigest(v["exportDigest"], "exportDigest");
  // Provenance coverage (section 6.7): exactly one matching record per
  // published quantile set. Equal values never merge provenance: a record
  // whose method, versions, cohort, snapshot or fingerprint contradict the
  // figure it cites is refused.
  if (Array.isArray(v["series"]) && Array.isArray(v["estimates"]) && Array.isArray(v["provenance"])) {
    const seriesById = new Map<string, Record<string, unknown>>();
    for (const s of v["series"] as unknown[]) {
      if (isRecord(s) && typeof s["seriesId"] === "string") seriesById.set(s["seriesId"], s);
    }
    const estimatesById = new Map<string, Record<string, unknown>>();
    for (const e of v["estimates"] as unknown[]) {
      if (isRecord(e) && typeof e["estimateId"] === "string") estimatesById.set(e["estimateId"], e);
    }
    const records = v["provenance"] as unknown[];
    const countByRef = new Map<string, number>();
    records.forEach((p, i) => {
      if (!isRecord(p) || typeof p["figureRef"] !== "string") return;
      const ref = p["figureRef"];
      countByRef.set(ref, (countByRef.get(ref) ?? 0) + 1);
      const series = seriesById.get(ref);
      const estimate = series === undefined ? estimatesById.get(ref) : undefined;
      if (series === undefined && estimate === undefined) {
        c.fail("provenance-unresolved", `figureRef ${JSON.stringify(ref)} resolves to no series or estimate`, `provenance.${i}.figureRef`);
        return;
      }
      const figure = (series ?? estimate) as Record<string, unknown>;
      const quantiles = figure["quantiles"];
      // A structurally invalid figure already failed above; matching is
      // skipped for it rather than crashing on its missing refs.
      if (isRecord(quantiles) && p["quantileMethod"] !== quantiles["quantileMethod"]) {
        c.fail("provenance-mismatch", `provenance quantileMethod contradicts the published figure ${JSON.stringify(ref)}`, `provenance.${i}.quantileMethod`);
      }
      // The computation the figure was read from: series versions for a
      // series figure, the referenced series versions for an estimate.
      let wantEstimator: unknown;
      let wantPolicy: unknown;
      let wantCohortKey: unknown;
      let wantSnapshot: unknown;
      let wantFingerprint: unknown;
      if (series !== undefined) {
        wantEstimator = series["estimatorVersion"];
        wantPolicy = series["policyVersion"];
        const cr = series["cohortRef"];
        if (isRecord(cr)) {
          wantCohortKey = cr["cohortKey"];
          wantSnapshot = cr["snapshotDigest"];
        }
        wantFingerprint = series["fingerprint"];
      } else {
        const sr = (estimate as Record<string, unknown>)["seriesRef"];
        if (!isRecord(sr)) return;
        wantSnapshot = sr["snapshotDigest"];
        const target = seriesById.get(sr["seriesId"] as string);
        if (target !== undefined) {
          wantEstimator = target["estimatorVersion"];
          wantPolicy = target["policyVersion"];
          const cr = target["cohortRef"];
          if (isRecord(cr)) wantCohortKey = cr["cohortKey"];
          wantFingerprint = target["fingerprint"];
        }
      }
      if (wantEstimator !== undefined && p["estimatorVersion"] !== wantEstimator) {
        c.fail("provenance-mismatch", `provenance estimatorVersion contradicts the published figure ${JSON.stringify(ref)}`, `provenance.${i}.estimatorVersion`);
      }
      if (wantPolicy !== undefined && p["policyVersion"] !== wantPolicy) {
        c.fail("provenance-mismatch", `provenance policyVersion contradicts the published figure ${JSON.stringify(ref)}`, `provenance.${i}.policyVersion`);
      }
      if (wantCohortKey !== undefined && p["cohortKey"] !== wantCohortKey) {
        c.fail("provenance-mismatch", `provenance cohortKey contradicts the published figure ${JSON.stringify(ref)}`, `provenance.${i}.cohortKey`);
      }
      if (wantSnapshot !== undefined && p["snapshotDigest"] !== wantSnapshot) {
        c.fail("provenance-mismatch", `provenance snapshotDigest contradicts the published figure ${JSON.stringify(ref)}`, `provenance.${i}.snapshotDigest`);
      }
      if (isRecord(wantFingerprint)) {
        try {
          if (p["fingerprintDigest"] !== fingerprintDigestOf(wantFingerprint)) {
            c.fail("provenance-mismatch", `provenance fingerprintDigest contradicts the published figure ${JSON.stringify(ref)}`, `provenance.${i}.fingerprintDigest`);
          }
        } catch {
          c.fail("provenance-mismatch", `provenance fingerprint of ${JSON.stringify(ref)} is not digestible`, `provenance.${i}.fingerprintDigest`);
        }
      }
    });
    for (const id of [...seriesById.keys(), ...estimatesById.keys()]) {
      const n = countByRef.get(id) ?? 0;
      if (n === 0) c.fail("provenance-missing", `published quantile set ${JSON.stringify(id)} has no provenance record`, "provenance");
      else if (n > 1) c.fail("duplicate-provenance", `published quantile set ${JSON.stringify(id)} carries ${n} provenance records, exactly one is required`, "provenance");
    }
  }
  return done(c, v);
}

// --- Review records (section 6.11) --------------------------------------------

const WAVE_FIELDS = [
  "schema", "repo", "lotOccurrence", "roundId", "candidateRevision", "submittedAt",
  "submissionEvidenceRefs", "requestEvidenceRefs", "reviewerRuns",
  "resultEvidenceRefs", "closureEvidenceRefs", "closedAt",
] as const;

export function validateReviewWaveManifest(v: unknown): ValidationResult<ReviewWaveManifestV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "ReviewWaveManifestV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_REVIEW_WAVE_MANIFEST, "schema");
  c.checkNoExtra(v, WAVE_FIELDS, "");
  c.checkRepo(v["repo"], "repo");
  for (const f of ["lotOccurrence", "roundId", "candidateRevision"] as const) {
    if (typeof v[f] !== "string" || (v[f] as string).length === 0) c.fail("bad-type", `${f} must be a non-empty string`, f);
  }
  if (v["submittedAt"] !== null) c.checkInstant(v["submittedAt"], "submittedAt");
  if (!Array.isArray(v["submissionEvidenceRefs"]) || (v["submissionEvidenceRefs"] as unknown[]).length === 0) {
    c.fail("bad-type", "submissionEvidenceRefs must be a non-empty array", "submissionEvidenceRefs");
  }
  for (const f of ["requestEvidenceRefs", "resultEvidenceRefs", "closureEvidenceRefs"] as const) {
    if (!Array.isArray(v[f])) c.fail("bad-type", `${f} must be an array`, f);
  }
  if (!Array.isArray(v["reviewerRuns"])) {
    c.fail("bad-type", "reviewerRuns must be an array", "reviewerRuns");
  } else {
    (v["reviewerRuns"] as unknown[]).forEach((e, i) => {
      const p = `reviewerRuns.${i}`;
      if (!isRecord(e)) {
        c.fail("bad-type", "each reviewer run must be {runId, evidenceRefs}", p);
        return;
      }
      c.checkNoExtra(e, ["runId", "evidenceRefs"], p);
      if (typeof e["runId"] !== "string" || (e["runId"] as string).length === 0) {
        c.fail("bad-type", "reviewer runId must be a non-empty string", `${p}.runId`);
      }
      if (!Array.isArray(e["evidenceRefs"])
        || (e["evidenceRefs"] as unknown[]).some((x) => typeof x !== "string")) {
        c.fail("bad-type", "reviewer evidenceRefs must be an array of strings", `${p}.evidenceRefs`);
      }
    });
  }
  if (v["closedAt"] !== null) c.checkInstant(v["closedAt"], "closedAt");
  return done(c, v);
}

const ACTUAL_FIELDS = [
  "schema", "repo", "lotOccurrence", "convention", "status", "completedCount",
  "openRoundIds", "reviewerRunCount", "roundIds", "coverageManifestRef", "evidenceRefs", "missingReason",
] as const;

export function validateReviewRoundsActual(v: unknown): ValidationResult<ReviewRoundsActualV1> {
  const c = new Ctx();
  if (!isRecord(v)) {
    c.fail("bad-type", "ReviewRoundsActualV1 must be an object", "");
    return done(c, v);
  }
  c.checkSchemaLiteral(v["schema"], SCHEMA_REVIEW_ROUNDS_ACTUAL, "schema");
  c.checkNoExtra(v, ACTUAL_FIELDS, "");
  c.checkRepo(v["repo"], "repo");
  if (typeof v["lotOccurrence"] !== "string" || (v["lotOccurrence"] as string).length === 0) {
    c.fail("bad-type", "lotOccurrence must be a non-empty string", "lotOccurrence");
  }
  if (v["convention"] !== "review-round/1") c.fail("bad-enum", 'convention must be "review-round/1"', "convention");
  if (v["status"] !== "complete" && v["status"] !== "partial" && v["status"] !== "unknown") {
    c.fail("bad-enum", "status must be complete | partial | unknown", "status");
  }
  if (v["completedCount"] !== null && (!isInt(v["completedCount"]) || (v["completedCount"] as number) < 0)) {
    c.fail("bad-type", "completedCount must be an integer >= 0 or null", "completedCount");
  }
  if (v["reviewerRunCount"] !== null && (!isInt(v["reviewerRunCount"]) || (v["reviewerRunCount"] as number) < 0)) {
    c.fail("bad-type", "reviewerRunCount must be an integer >= 0 or null", "reviewerRunCount");
  }
  for (const f of ["openRoundIds", "roundIds", "evidenceRefs"] as const) {
    if (!Array.isArray(v[f])) c.fail("bad-type", `${f} must be an array`, f);
  }
  if (v["coverageManifestRef"] !== null && typeof v["coverageManifestRef"] !== "string") {
    c.fail("bad-type", "coverageManifestRef must be a string or null", "coverageManifestRef");
  }
  if (v["coverageManifestRef"] === null || v["coverageManifestRef"] === undefined) {
    if (v["completedCount"] !== null) {
      c.fail("coverage-missing", "without a coverageManifestRef, completedCount is null with an explicit reason, never a count", "completedCount");
    }
    if (v["reviewerRunCount"] !== null) {
      c.fail("coverage-missing", "without a coverageManifestRef, reviewerRunCount is null with an explicit reason", "reviewerRunCount");
    }
    if (typeof v["missingReason"] !== "string" || (v["missingReason"] as string).length === 0) {
      c.fail("missing-reason", "a null total requires missingReason", "missingReason");
    }
    if (v["status"] === "complete") {
      c.fail("status-mismatch", "status is complete only when coverage is attested", "status");
    }
  } else if (v["completedCount"] === 0) {
    if (v["status"] !== "complete") {
      c.fail("status-mismatch", "zero requires status complete with attested coverage", "completedCount");
    }
    if (!Array.isArray(v["evidenceRefs"]) || (v["evidenceRefs"] as unknown[]).length === 0) {
      c.fail("missing-evidence", "zero requires evidence that no round occurred", "evidenceRefs");
    }
  }
  return done(c, v);
}
