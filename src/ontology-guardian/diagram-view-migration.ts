// Engram native G0 @1 → @2 view-schema migration (SPEC-diagram-view-schema-v2
// §4, owner decisions F2-a/H1/G1). Pure functions over retained JSON view
// data. Atomic: any blocking item refuses the whole input — the exact
// original is retained, no candidate. No executor, layout or rendering.
import { canonicalBytes, sha256Hex } from "./canonical.js";
import { resolveViewSchemaVersion } from "./diagram-schemas.js";
import { checkViewShapeV1, checkViewShapeV2 } from "./diagram-view-shape.js";
import type { Digest, Pin } from "./types.js";
import type { MigrationOperation } from "./diagram-migrations.js";

export const VIEW_SCHEMA_MIGRATION_ID = "engram:migration-view-schema-1-2" as const;

/**
 * Closed view-schema refusal vocabulary (separate-list choice F2-a). Each
 * member denotes one prose meaning from the §4.2 table; subcauses and
 * attempted pins stay in `detail`. The profile entry gate is NOT a member
 * here: it reuses `incompatible-attribute-schema` inside `MigrationReport`.
 */
export type ViewSchemaRefusalReason =
  | "unknown-source-schema"
  | "source-digest-mismatch"
  | "unknown-target-schema"
  | "target-digest-mismatch"
  | "invalid-source-view"
  | "canonical-evidence-unavailable"
  | "summary-key-conflict"
  | "invalid-target-view";

export interface ViewSchemaUnmigrated {
  readonly path: string;
  readonly reason: ViewSchemaRefusalReason;
  readonly detail?: string;
}

export type ViewSchemaMigrationOutcome = "ok" | "refused";

interface ViewSchemaMigrationCommon {
  readonly migrationId: typeof VIEW_SCHEMA_MIGRATION_ID;
  readonly from: Pin;
  readonly to: Pin;
  readonly originalSha256: Digest;
  readonly originalCanonical: unknown;
  readonly operations: readonly MigrationOperation[];
}

export interface ViewSchemaMigrationSuccess extends ViewSchemaMigrationCommon {
  readonly outcome: "ok";
  readonly unmigrated: readonly [];
  /** Converted view data: one view object, or the converted view array for a retained-views stage. */
  readonly target: unknown;
}

export interface ViewSchemaMigrationRefusal extends ViewSchemaMigrationCommon {
  readonly outcome: "refused";
  readonly unmigrated: readonly [ViewSchemaUnmigrated, ...ViewSchemaUnmigrated[]];
  readonly target: null;
}

export type ViewSchemaMigrationReport = ViewSchemaMigrationSuccess | ViewSchemaMigrationRefusal;

/**
 * Boundary-preflight refusal for failures without canonical evidence
 * (non-JSON runtime data, `invalid-unicode:lone-surrogate`). Returned outside
 * `MigrationReport` and outside `ViewSchemaMigrationReport`: no digest is
 * fabricated and the supplied original/bytes are preserved where available.
 */
export interface BoundaryPreflightRefusal {
  readonly boundary: "pre-canonical";
  readonly outcome: "refused";
  readonly reason: "non-json-input" | "canonical-evidence-unavailable";
  readonly detail: string;
  readonly original?: unknown;
  readonly target: null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedKeys(record: Readonly<Record<string, unknown>> | undefined): string[] {
  return Object.keys(record ?? {}).sort();
}

export function boundaryPreflightRefusal(
  reason: BoundaryPreflightRefusal["reason"], detail: string, original?: unknown,
): BoundaryPreflightRefusal {
  return original === undefined
    ? { boundary: "pre-canonical", outcome: "refused", reason, detail, target: null }
    : { boundary: "pre-canonical", outcome: "refused", reason, detail, original, target: null };
}

/** Canonical evidence for a supplied value, or the boundary refusal. */
function canonicalEvidence(value: unknown): { ok: true; bytes: string } | { ok: false; refusal: BoundaryPreflightRefusal } {
  try {
    return { ok: true, bytes: canonicalBytes(value) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const reason = detail.startsWith("invalid-unicode") ? "canonical-evidence-unavailable" : "non-json-input";
    return { ok: false, refusal: boundaryPreflightRefusal(reason, detail, value) };
  }
}

function viewRefusal(
  from: Pin, to: Pin, source: unknown, bytes: string,
  unmigrated: [ViewSchemaUnmigrated, ...ViewSchemaUnmigrated[]],
): ViewSchemaMigrationRefusal {
  return {
    migrationId: VIEW_SCHEMA_MIGRATION_ID, from, to,
    originalSha256: sha256Hex(bytes),
    originalCanonical: structuredClone(source),
    operations: [], unmigrated, outcome: "refused", target: null,
  };
}

function describePin(pin: unknown): string {
  if (!isRecord(pin)) return String(pin);
  return `${String(pin.id)}/${String(pin.version)}#${String(pin.contentDigest)}`;
}

interface PinCause {
  readonly reason: ViewSchemaRefusalReason;
  readonly detail: string;
}

/**
 * Pure pin-selection cause, computed before canonical evidence so a bad pin
 * cannot be masked by evidence ordering. The refusal itself is built once
 * evidence exists; without evidence the boundary refusal applies instead.
 */
function checkPinCause(pin: Pin, role: "source" | "target", requiredVersion: string): PinCause | null {
  const unknownReason = role === "source" ? "unknown-source-schema" : "unknown-target-schema";
  const digestReason = role === "source" ? "source-digest-mismatch" : "target-digest-mismatch";
  if (!isRecord(pin as unknown)) {
    return {
      reason: unknownReason,
      detail: `${role} schema selection unavailable or inadmissible: ${describePin(pin as unknown)}`,
    };
  }
  const known = pin.id === "diagram-view-schema" ? resolveViewSchemaVersion(pin.version) : undefined;
  if (known === undefined || pin.version !== requiredVersion) {
    return {
      reason: unknownReason,
      detail: `${role} schema selection unavailable or inadmissible: ${describePin(pin)}`,
    };
  }
  if (known.digest !== pin.contentDigest) {
    return { reason: digestReason, detail: `${role} schema digest mismatch for ${describePin(pin)}` };
  }
  return null;
}

/**
 * Single-view @1 → @2 conversion under exact pins (H1: an absent summary id
 * is derived from its existing map key; a conflicting present id refuses).
 */
export function migrateViewSchemaV1ToV2(
  view: unknown, pins: { readonly source: Pin; readonly target: Pin },
): ViewSchemaMigrationReport | BoundaryPreflightRefusal {
  const { source, target } = (pins ?? {}) as { readonly source: Pin; readonly target: Pin };
  const operations: MigrationOperation[] = [];
  const sourceCause = checkPinCause(source, "source", "1");
  const targetCause = checkPinCause(target, "target", "2");
  const evidence = canonicalEvidence(view);
  if (!evidence.ok) return evidence.refusal;
  const bytes = evidence.bytes;
  if (sourceCause !== null) {
    return viewRefusal(source, target, view, bytes,
      [{ path: "", reason: sourceCause.reason, detail: sourceCause.detail }]);
  }
  if (targetCause !== null) {
    return viewRefusal(source, target, view, bytes,
      [{ path: "", reason: targetCause.reason, detail: targetCause.detail }]);
  }
  const sourceFailure = checkViewShapeV1(view);
  if (sourceFailure !== null) {
    return viewRefusal(source, target, view, bytes, [{
      path: sourceFailure, reason: "invalid-source-view",
      detail: `source view fails its exact selected schema (diagram-view-schema/1) at ${sourceFailure}`,
    }]);
  }
  const candidate = structuredClone(view) as Record<string, unknown>;
  const summaries = candidate["summaryLabels"];
  const conflicts: ViewSchemaUnmigrated[] = [];
  if (isRecord(summaries)) {
    for (const key of sortedKeys(summaries)) {
      const summary = summaries[key];
      if (!isRecord(summary)) continue;
      if (!Object.hasOwn(summary, "id")) {
        summary["id"] = key;
        operations.push({
          path: `summaryLabels.${key}.id`, action: "derive-summary-id-from-key",
          detail: "H1: copy the existing map key into the absent own id",
        });
      } else if (summary["id"] !== key) {
        conflicts.push({
          path: `summaryLabels.${key}.id`, reason: "summary-key-conflict",
          detail: `record-key-mismatch: existing summary id differs from its map key ${JSON.stringify(key)}`,
        });
      }
    }
  }
  if (conflicts.length > 0) {
    return viewRefusal(source, target, view, bytes,
      conflicts as [ViewSchemaUnmigrated, ...ViewSchemaUnmigrated[]]);
  }
  const targetFailure = checkViewShapeV2(candidate);
  if (targetFailure !== null) {
    return viewRefusal(source, target, view, bytes, [{
      path: targetFailure, reason: "invalid-target-view",
      detail: `converted view fails the exact governed @2 schema at ${targetFailure}`,
    }]);
  }
  return {
    migrationId: VIEW_SCHEMA_MIGRATION_ID, from: source, to: target,
    originalSha256: sha256Hex(bytes),
    originalCanonical: structuredClone(view),
    operations, outcome: "ok", unmigrated: [], target: candidate,
  };
}

/**
 * Direct @2 adoption under its exact pin. Shape-only: empty labels and
 * supplied occurrence lists are preserved, never rewritten; id-less bytes
 * refuse at the summary id path with no derivation and no @1 fallback.
 */
export function adoptViewSchemaV2(
  view: unknown, target: Pin,
): ViewSchemaMigrationReport | BoundaryPreflightRefusal {
  const operations: MigrationOperation[] = [];
  const targetCause = checkPinCause(target, "target", "2");
  const evidence = canonicalEvidence(view);
  if (!evidence.ok) return evidence.refusal;
  if (targetCause !== null) {
    return viewRefusal(target, target, view, evidence.bytes,
      [{ path: "", reason: targetCause.reason, detail: targetCause.detail }]);
  }
  const bytes = evidence.bytes;
  const failure = checkViewShapeV2(view);
  if (failure !== null) {
    return viewRefusal(target, target, view, bytes, [{
      path: failure, reason: "invalid-source-view",
      detail: `source view fails its exact selected schema (diagram-view-schema/2) at ${failure}`,
    }]);
  }
  const candidate = structuredClone(view) as Record<string, unknown>;
  return {
    migrationId: VIEW_SCHEMA_MIGRATION_ID, from: target, to: target,
    originalSha256: sha256Hex(bytes),
    originalCanonical: structuredClone(view),
    operations, outcome: "ok", unmigrated: [], target: candidate,
  };
}

/** Atomic multi-view @1 → @2 stage: one failure refuses every retained view. */
export function migrateRetainedViewsV1ToV2(
  views: readonly unknown[], pins: { readonly source: Pin; readonly target: Pin },
): ViewSchemaMigrationReport | BoundaryPreflightRefusal {
  const { source, target } = (pins ?? {}) as { readonly source: Pin; readonly target: Pin };
  const operations: MigrationOperation[] = [];
  const failures: ViewSchemaUnmigrated[] = [];
  const evidence = canonicalEvidence(views);
  if (!evidence.ok) return evidence.refusal;
  const converted: Record<string, unknown>[] = [];
  for (let index = 0; index < views.length; index++) {
    const report = migrateViewSchemaV1ToV2(views[index], pins);
    if ("boundary" in report) {
      failures.push({
        path: `views.${viewKey(views[index], index)}`, reason: "canonical-evidence-unavailable", detail: report.detail,
      });
      continue;
    }
    if (report.outcome === "refused") {
      for (const item of report.unmigrated) {
        failures.push({
          ...item,
          path: `views.${viewKey(views[index], index)}${item.path === "" ? "" : `.${item.path}`}`,
        });
      }
      continue;
    }
    converted.push(report.target as Record<string, unknown>);
    for (const operation of report.operations) {
      operations.push({ ...operation, path: `views.${viewKey(views[index], index)}.${operation.path}` });
    }
  }
  if (failures.length > 0) {
    failures.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return viewRefusal(source, target, views, evidence.bytes,
      failures as [ViewSchemaUnmigrated, ...ViewSchemaUnmigrated[]]);
  }
  return {
    migrationId: VIEW_SCHEMA_MIGRATION_ID, from: source, to: target,
    originalSha256: sha256Hex(evidence.bytes),
    originalCanonical: structuredClone(views),
    operations, outcome: "ok", unmigrated: [], target: converted,
  };
}

function viewKey(view: unknown, index: number): string {
  return isRecord(view) && typeof view["viewId"] === "string" ? view["viewId"] : String(index);
}
