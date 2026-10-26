// §2.1 diagnostic envelope: native shapes transcribed verbatim + G0 extension.
// The native Report/2 object is never mutated; diagnostics are separate copies.
import { canonicalBytes } from "./canonical.js";
import { isDigest } from "./types.js";
import type { GuardianDiagnostic, MappingEntry } from "./types.js";

// --- S-REPORT2, transcribed verbatim [BC@63a9258:src/profile/report.ts:6–28] ---

export const resultOperations = [
  "complete",
  "normalize",
  "validate",
  "resolveTheme",
  "mapExport",
  "serializePrepared",
  "prepareExport",
  "getDefinitions",
  "getSnapshot",
  "setDefinitions",
  "applyCommands",
  "activateBusinessProfile",
  "setTheme",
  "restoreSnapshot",
  "undo",
  "redo",
  "exportPrepared",
] as const;

export const reportStages = [
  "load",
  "import",
  "complete",
  "pre-normalize",
  "normalize",
  "post-normalize",
  "layout",
  "post-layout",
  "release",
  "render",
  "export",
] as const;
export type ReportStage = (typeof reportStages)[number];

export const lossClasses = [
  "semantic-type",
  "relation-kind",
  "navigation",
  "appearance",
  "layout",
  "metadata",
  "unsupported-feature",
  "provenance-unavailable",
] as const;

export const capabilities = ["engine-byte-compatible", "structural", "unsupported"] as const;
export type Capability = (typeof capabilities)[number];

export interface Coordinate {
  readonly domain: "tree" | "profile" | "artifact" | "none";
  readonly pointer: string | null;
  readonly targetId: string | null;
  readonly provenance: "exact" | "unavailable" | "generated";
}

export interface ReportEntry {
  readonly code: string;
  readonly severity: "info" | "warn" | "error";
  readonly classification: "integrity" | "readiness" | "repairable" | "advisory" | "loss";
  readonly stage: ReportStage;
  readonly ruleId: string;
  readonly messageKey: string;
  readonly disposition: "observed" | "corrected" | "dropped" | "mapped" | "refused";
  readonly source: Coordinate;
  readonly result: Coordinate;
  readonly beforePresent: boolean;
  readonly before?: unknown;
  readonly afterPresent: boolean;
  readonly after?: unknown;
  readonly originalType?: string;
  readonly property?: string;
  readonly causedBy?: string;
  readonly pageId?: string;
  readonly occurrenceKey?: string;
  readonly emittedType?: string;
  readonly legacyCode?: string;
  readonly lossClass?: (typeof lossClasses)[number];
}

export interface IdMapping {
  readonly sourceId: string;
  readonly resultId: string;
  readonly domain: "migration" | "export";
  readonly pageId?: string;
  readonly occurrenceKey?: string;
}

export interface ReportArtifact {
  readonly format: string;
  readonly pageId?: string;
  readonly capability: Capability;
  readonly digest?: string;
  readonly entryIndexes: readonly number[];
}

export interface IdentityPin {
  readonly id: string;
  readonly version: string;
  readonly sha256: string;
}

export interface ProfileIdentity {
  readonly mechanismVersion: string;
  readonly schemaVersion: string;
  readonly profile: string;
  readonly version: string;
  readonly sha256: string;
  readonly base: IdentityPin;
  readonly descriptors: readonly IdentityPin[];
}

/** S-REPORT2 Report — G0 never adds fields inside it. */
export interface NativeReport {
  readonly reportVersion: "2";
  readonly operation: string;
  readonly sourceIdentity?: ProfileIdentity;
  readonly targetIdentity?: ProfileIdentity;
  readonly inputRevision?: string;
  readonly outputRevision?: string;
  readonly entries: readonly ReportEntry[];
  readonly rawStandardFindings: readonly unknown[];
  readonly idMap: readonly IdMapping[];
  readonly artifacts: readonly ReportArtifact[];
}

// --- Native coordinate predicates [BC@63a9258:src/profile/report.ts:30–39] ---

export function validPointer(s: string): boolean {
  return (s === "" || s.startsWith("/")) && !/~(?![01])/.test(s);
}

export function validateCoordinate(value: unknown): asserts value is Coordinate {
  if (typeof value !== "object" || value === null) failContract();
  const c = value as Record<string, unknown>;
  const keys = Object.keys(c).sort();
  if (keys.join(",") !== "domain,pointer,provenance,targetId") failContract();
  if (!["tree", "profile", "artifact", "none"].includes(c["domain"] as string)) failContract();
  if (!["exact", "unavailable", "generated"].includes(c["provenance"] as string)) failContract();
  const pointer = c["pointer"];
  const targetId = c["targetId"];
  const provenance = c["provenance"];
  const domain = c["domain"];
  if (pointer !== null) {
    if (typeof pointer !== "string" || !validPointer(pointer)) failContract();
  }
  if (targetId !== null && typeof targetId !== "string") failContract();
  if ((provenance === "unavailable" && pointer !== null) || (provenance !== "unavailable" && pointer === null)) {
    failContract();
  }
  if (domain === "none" && (pointer !== null || targetId !== null || provenance !== "unavailable")) {
    failContract();
  }
}

function failContract(): never {
  throw new Error("contract-violation");
}

// --- Native lint barrier [BC@63a9258:src/profile/lint-contracts.ts:94–96] ---

export function lintSummary(entries: readonly Pick<ReportEntry, "severity" | "disposition">[]): {
  readonly ok: boolean;
  readonly counts: { info: number; warn: number; error: number };
} {
  const counts = { info: 0, warn: 0, error: 0 };
  for (const e of entries) {
    if (!["info", "warn", "error"].includes(e.severity)) throw new Error("contract-violation");
    if (!["corrected", "dropped", "mapped"].includes(e.disposition)) counts[e.severity]++;
  }
  return { ok: counts.error === 0, counts };
}

// --- S-DSDIAG, S-ENGISSUE, S-COMPILED (verbatim, §2.1.0) ---

/**
 * S-DSDIAG `DiagnosticCode`, transcribed verbatim from the pinned source
 * ([DS] `packages/diagram-core/src/diagnostics.ts:13` at `25c0f3d3`).
 * Closed union: an invented code is a type error, never a silent value.
 */
export type DiagnosticCode =
  | "dangling-reference"
  | "reference-type-mismatch"
  | "hierarchy-cycle"
  | "attribute-not-in-schema"
  | "quantity-unit-missing"
  | "collection-bound-exceeded"
  | "unknown-schema-major"
  | "revision-conflict"
  | "extension-unsupported"
  | "malformed-ref"
  | "duplicate-id"
  | "record-key-mismatch"
  | "schema-version-malformed"
  | "schema-migration-required"
  | "document-not-an-object"
  | "unknown-profile"
  | "profile-not-declared"
  | "unknown-entity-type"
  | "unknown-relation-type"
  | "unknown-port-type"
  | "type-definition-conflict"
  | "attribute-type-mismatch"
  | "attribute-required-missing"
  | "enum-value-not-allowed"
  | "quantity-unit-not-allowed"
  | "text-too-long"
  | "date-not-iso8601"
  | "unique-attribute-violation"
  | "endpoint-role-unknown"
  | "endpoint-cardinality-violation"
  | "endpoint-target-not-allowed"
  | "hierarchy-multiple-parents"
  | "port-direction-not-allowed"
  | "port-owner-mismatch"
  | "view-document-mismatch"
  | "revision-divergence"
  | "occurrence-endpoint-mismatch"
  | "value-not-finite"
  | "value-not-serialisable"
  | "limit-exceeded"
  | "unknown-command"
  | "target-already-exists"
  | "target-missing"
  | "delete-policy-required"
  | "delete-policy-refused"
  | "placement-kind-mismatch"
  | "inverse-budget-exceeded"
  | "extension-hash-mismatch"
  | "extension-source-not-retained"
  | "view-already-exists";

export type DsDiagnosticSeverity = "error" | "warning";
export interface DsDiagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DsDiagnosticSeverity;
  readonly path: string;
  readonly message: string;
  readonly refs?: readonly string[];
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export type EngramSeverity = "error" | "warning" | "info";
export interface EngramIssue {
  readonly severity: EngramSeverity;
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly nodeId?: string;
  readonly edgeIndex?: number;
}

export const lintStages = ["import", "pre-normalize", "post-normalize", "post-layout", "release"] as const;
export interface CompiledSetting {
  readonly rule: string;
  readonly severity: string | number;
  readonly classification?: string;
  readonly options?: Readonly<Record<string, unknown>>;
}
export interface CompiledRule {
  readonly id: string;
  readonly phase: string;
  readonly select: unknown;
  readonly assert: unknown;
  readonly code: string;
  readonly message: string;
  readonly classification: string;
  readonly repairRecipe?: unknown;
  readonly bindings?: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[];
}

export interface CompiledLintOptionsNative {
  readonly mechanismVersion: "1";
  readonly profileDigest: string;
  readonly phase: string;
  readonly readinessPolicy: string;
  readonly compiledRules: readonly CompiledRule[];
  readonly bindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[];
  readonly severityPolicyDigest: string;
}

// --- G0 envelope (§2.1): discriminated union on origin ---

export interface Report2Diagnostic extends ReportEntry {
  readonly origin: "report2";
  readonly nativeCode: string;
  readonly subjectRef: string;
  readonly reportEntryIndex: number;
  readonly studyDisposition?: string;
}

export interface DiagramCoreDiagnostic extends DsDiagnostic {
  readonly origin: "diagram-core";
  readonly nativeCode: string;
  readonly subjectRef: string;
  readonly studyDisposition?: string;
}

export interface EngramDiagnostic extends EngramIssue {
  readonly origin: "engram";
  readonly nativeCode: string;
  readonly subjectRef: string;
}

export type Diagnostic = Report2Diagnostic | DiagramCoreDiagnostic | EngramDiagnostic | GuardianDiagnostic;

export type DiagnosticOrigin = Diagnostic["origin"];

// --- Native report boundary validation (pure; §2.1.0 closure, §6.2) ---
//
// Malformed native input refuses here with a typed error and never reaches
// the §2.1.1 mapping. Mirrors the pinned `validateReport`, `validateEntry`,
// `sortIdMap`, `validateIdentity` and `validateBindingKeys`
// ([BC@63a9258:src/profile/report.ts:40–112], `boundary.ts`).

function reportFail(reason: string): never {
  throw new Error(`native-report-${reason}`);
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  what: string,
): void {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) reportFail(`${what}-missing:${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!required.includes(key) && !optional.includes(key)) reportFail(`${what}-forbidden:${key}`);
  }
}

function nonEmptyText(value: unknown, what: string): void {
  if (typeof value !== "string" || value.length === 0) reportFail(`invalid:${what}`);
}

function assertValidIdentityPin(value: unknown, what: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) reportFail(`invalid:${what}`);
  const p = value as Record<string, unknown>;
  exactKeys(p, ["id", "version", "sha256"], [], what);
  nonEmptyText(p["id"], `${what}.id`);
  nonEmptyText(p["version"], `${what}.version`);
  if (!isDigest(p["sha256"])) reportFail(`invalid:${what}.sha256`);
}

function assertValidProfileIdentity(value: unknown, what: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) reportFail(`invalid:${what}`);
  const identity = value as Record<string, unknown>;
  exactKeys(identity, ["mechanismVersion", "schemaVersion", "profile", "version", "sha256", "base", "descriptors"], [], what);
  if (identity["mechanismVersion"] !== "1") reportFail(`invalid:${what}.mechanismVersion`);
  if (identity["schemaVersion"] !== "1.0.0") reportFail(`invalid:${what}.schemaVersion`);
  const profile = identity["profile"];
  if (typeof profile !== "string" || !/^[A-Za-z_][A-Za-z0-9_.:/-]*$/.test(profile)) {
    reportFail(`invalid:${what}.profile`);
  }
  if (typeof identity["version"] !== "string" || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(identity["version"])) {
    reportFail(`invalid:${what}.version`);
  }
  if (!isDigest(identity["sha256"])) reportFail(`invalid:${what}.sha256`);
  assertValidIdentityPin(identity["base"], `${what}.base`);
  if (!Array.isArray(identity["descriptors"]) || identity["descriptors"].length === 0) {
    reportFail(`invalid:${what}.descriptors`);
  }
  const ids = new Set<string>();
  for (const descriptor of identity["descriptors"] as unknown[]) {
    assertValidIdentityPin(descriptor, `${what}.descriptor`);
    const id = (descriptor as { id: string }).id;
    if (ids.has(id)) reportFail(`duplicate:${what}.descriptor:${id}`);
    ids.add(id);
  }
}

const ENTRY_REQUIRED = [
  "code",
  "severity",
  "classification",
  "stage",
  "ruleId",
  "messageKey",
  "disposition",
  "source",
  "result",
  "beforePresent",
  "afterPresent",
] as const;
const ENTRY_OPTIONAL = [
  "originalType",
  "property",
  "before",
  "after",
  "causedBy",
  "pageId",
  "occurrenceKey",
  "emittedType",
  "legacyCode",
  "lossClass",
] as const;
const ENTRY_TEXT_KEYS = [
  "code",
  "ruleId",
  "messageKey",
  "originalType",
  "property",
  "causedBy",
  "pageId",
  "occurrenceKey",
  "emittedType",
  "legacyCode",
] as const;

/** Pinned `validateEntry`: closed fields, presence flags, loss discipline. */
export function assertValidNativeEntry(value: unknown): asserts value is ReportEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) reportFail("invalid:entry");
  const e = value as Record<string, unknown>;
  exactKeys(e, ENTRY_REQUIRED, ENTRY_OPTIONAL, "entry");
  for (const key of ENTRY_TEXT_KEYS) {
    if (Object.hasOwn(e, key)) nonEmptyText(e[key], `entry.${key}`);
  }
  if (!(reportStages as readonly string[]).includes(e["stage"] as string)) reportFail("invalid:entry.stage");
  if (!["info", "warn", "error"].includes(e["severity"] as string)) reportFail("invalid:entry.severity");
  if (!["integrity", "readiness", "repairable", "advisory", "loss"].includes(e["classification"] as string)) {
    reportFail("invalid:entry.classification");
  }
  if (!["observed", "corrected", "dropped", "mapped", "refused"].includes(e["disposition"] as string)) {
    reportFail("invalid:entry.disposition");
  }
  try {
    validateCoordinate(e["source"]);
  } catch {
    reportFail("invalid:entry.source");
  }
  try {
    validateCoordinate(e["result"]);
  } catch {
    reportFail("invalid:entry.result");
  }
  for (const key of ["before", "after"] as const) {
    const present = e[`${key}Present`];
    if (typeof present !== "boolean" || present !== Object.hasOwn(e, key)) {
      reportFail(`invalid:entry.${key}-presence`);
    }
  }
  if (e["classification"] === "loss") {
    if (!(lossClasses as readonly string[]).includes(e["lossClass"] as string)) {
      reportFail("invalid:entry.lossClass");
    }
  } else if (Object.hasOwn(e, "lossClass")) {
    reportFail("forbidden:entry.lossClass");
  }
}

function nativeComponent(a: unknown, b: unknown): number {
  const x = a ?? undefined;
  const y = b ?? undefined;
  if (x === y) return 0;
  if (x === undefined) return -1;
  if (y === undefined) return 1;
  return compareText(String(x), String(y));
}

/** Pinned `compareEntries`: stage rank, then rule/coordinate/code/presence keys. */
export function compareNativeEntries(a: ReportEntry, b: ReportEntry): number {
  const stage = reportStages.indexOf(a.stage) - reportStages.indexOf(b.stage);
  if (stage !== 0) return stage;
  const left = [
    a.ruleId,
    a.source.domain,
    a.source.pointer,
    a.source.targetId,
    a.code,
    a.pageId,
    a.occurrenceKey,
    a.beforePresent ? canonicalBytes(a.before) : undefined,
    a.afterPresent ? canonicalBytes(a.after) : undefined,
  ];
  const right = [
    b.ruleId,
    b.source.domain,
    b.source.pointer,
    b.source.targetId,
    b.code,
    b.pageId,
    b.occurrenceKey,
    b.beforePresent ? canonicalBytes(b.before) : undefined,
    b.afterPresent ? canonicalBytes(b.after) : undefined,
  ];
  for (let i = 0; i < left.length; i++) {
    const order = nativeComponent(left[i], right[i]);
    if (order !== 0) return order;
  }
  return 0;
}

const IDMAP_SORT_KEYS = ["domain", "pageId", "occurrenceKey", "sourceId", "resultId"] as const;

/** Pinned `sortIdMap` order: the supplied array must already be sorted. */
export function assertValidNativeIdMap(value: unknown): asserts value is IdMapping[] {
  if (!Array.isArray(value)) reportFail("invalid:idMap");
  const items = value as Record<string, unknown>[];
  const maps: IdMapping[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) reportFail("invalid:idMap-entry");
    exactKeys(item, ["sourceId", "resultId", "domain"], ["pageId", "occurrenceKey"], "idMap-entry");
    if (item["domain"] !== "migration" && item["domain"] !== "export") reportFail("invalid:idMap-entry.domain");
    for (const key of ["sourceId", "resultId", "pageId", "occurrenceKey"] as const) {
      if (Object.hasOwn(item, key)) nonEmptyText(item[key], `idMap-entry.${key}`);
    }
    maps.push(item as unknown as IdMapping);
  }
  for (let i = 1; i < maps.length; i++) {
    const previous = maps[i - 1] as IdMapping;
    const current = maps[i] as IdMapping;
    let order = 0;
    for (const key of IDMAP_SORT_KEYS) {
      order = nativeComponent(previous[key], current[key]);
      if (order !== 0) break;
    }
    if (order > 0) reportFail("idMap-unsorted");
  }
}

function assertValidNativeArtifacts(value: unknown, entryCount: number, classifications: readonly string[]): void {
  if (!Array.isArray(value)) reportFail("invalid:artifacts");
  const reachable = new Set<number>();
  for (const item of value as unknown[]) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) reportFail("invalid:artifact");
    const artifact = item as Record<string, unknown>;
    exactKeys(artifact, ["format", "capability", "entryIndexes"], ["pageId", "digest"], "artifact");
    nonEmptyText(artifact["format"], "artifact.format");
    if (!(capabilities as readonly string[]).includes(artifact["capability"] as string)) {
      reportFail("invalid:artifact.capability");
    }
    if (Object.hasOwn(artifact, "pageId")) nonEmptyText(artifact["pageId"], "artifact.pageId");
    if (Object.hasOwn(artifact, "digest")) {
      if (!isDigest(artifact["digest"])) reportFail("invalid:artifact.digest");
      if (artifact["capability"] === "unsupported") reportFail("artifact-digest-unsupported");
    }
    if (!Array.isArray(artifact["entryIndexes"])) reportFail("invalid:artifact.entryIndexes");
    const seen = new Set<number>();
    let previous = -1;
    for (const index of artifact["entryIndexes"] as unknown[]) {
      if (!Number.isSafeInteger(index) || (index as number) < 0 || (index as number) >= entryCount) {
        reportFail("invalid:artifact.entryIndex-range");
      }
      const n = index as number;
      if (seen.has(n) || n <= previous) reportFail("invalid:artifact.entryIndex-order");
      seen.add(n);
      previous = n;
      reachable.add(n);
    }
  }
  classifications.forEach((classification, index) => {
    if (classification === "loss" && !reachable.has(index)) reportFail(`loss-unreachable:${String(index)}`);
  });
}

const REPORT_REQUIRED = ["reportVersion", "operation", "entries", "rawStandardFindings", "idMap", "artifacts"] as const;
const REPORT_OPTIONAL = ["sourceIdentity", "targetIdentity", "inputRevision", "outputRevision"] as const;

/**
 * Pinned `validateReport`: closed top-level object, native entry validation,
 * exact duplicate refusal, native order, sorted idMap, artifact discipline
 * with loss reachability. Unknown fields refuse anywhere in the report.
 */
export function assertValidNativeReport(report: unknown): asserts report is NativeReport {
  if (typeof report !== "object" || report === null || Array.isArray(report)) reportFail("invalid:report");
  const r = report as Record<string, unknown>;
  exactKeys(r, REPORT_REQUIRED, REPORT_OPTIONAL, "report");
  if (r["reportVersion"] !== "2") reportFail("invalid:reportVersion");
  nonEmptyText(r["operation"], "report.operation");
  if (Object.hasOwn(r, "sourceIdentity")) assertValidProfileIdentity(r["sourceIdentity"], "report.sourceIdentity");
  if (Object.hasOwn(r, "targetIdentity")) assertValidProfileIdentity(r["targetIdentity"], "report.targetIdentity");
  for (const key of ["inputRevision", "outputRevision"] as const) {
    if (Object.hasOwn(r, key) && !isDigest(r[key])) reportFail(`invalid:report.${key}`);
  }
  if (!Array.isArray(r["entries"])) reportFail("invalid:report.entries");
  const entries = r["entries"] as unknown[];
  for (const entry of entries) assertValidNativeEntry(entry);
  const typed = entries as ReportEntry[];
  const seen = new Set<string>();
  typed.forEach((entry, index) => {
    const bytes = canonicalBytes(entry);
    if (seen.has(bytes)) reportFail("duplicate-entry");
    seen.add(bytes);
    if (index > 0 && compareNativeEntries(typed[index - 1] as ReportEntry, entry) > 0) {
      reportFail("out-of-order");
    }
  });
  if (!Array.isArray(r["rawStandardFindings"])) reportFail("invalid:report.rawStandardFindings");
  assertValidNativeIdMap(r["idMap"]);
  assertValidNativeArtifacts(
    r["artifacts"],
    typed.length,
    typed.map((entry) => entry.classification),
  );
}

// --- §2.1.1 separate reversible mapping and ordering ---

const G0_ONLY_KEYS = new Set(["origin", "nativeCode", "subjectRef", "reportEntryIndex", "studyDisposition"]);

/** Enrich one native entry into its separate G0 copy; the native entry is untouched. */
export function toReport2Diagnostic(
  entry: ReportEntry,
  index: number,
  subjectRef: string,
  studyDisposition?: string,
): Report2Diagnostic {
  return {
    ...entry,
    source: { ...entry.source },
    result: { ...entry.result },
    origin: "report2",
    nativeCode: entry.code,
    subjectRef,
    reportEntryIndex: index,
    ...(studyDisposition !== undefined ? { studyDisposition } : {}),
  };
}

/**
 * Whole-report mapping: one separate copy per native index, native order kept.
 * The native report is validated at the boundary first; malformed input
 * refuses with a typed error and never reaches the mapping.
 */
export function reportToDiagnostics(
  report: NativeReport,
  subjectRefOf: (entry: ReportEntry, index: number) => string,
  studyDispositionOf?: (entry: ReportEntry, index: number) => string | undefined,
): Report2Diagnostic[] {
  assertValidNativeReport(report);
  return report.entries.map((entry, index) =>
    toReport2Diagnostic(entry, index, subjectRefOf(entry, index), studyDispositionOf?.(entry, index)),
  );
}

/** Inverse: strip exactly the G0 routing fields, native presence/values unchanged. */
export function nativeEntryOf(diagnostic: Report2Diagnostic): ReportEntry {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(diagnostic)) {
    if (!G0_ONLY_KEYS.has(key)) copy[key] = value;
  }
  return copy as unknown as ReportEntry;
}

/**
 * Prescribed inverse (rejects missing/duplicate/out-of-range indexes, field mismatches).
 * Non-entry Report fields stay in `report`; only entries round-trip here.
 */
export function diagnosticsToNativeEntries(
  report: NativeReport,
  diagnostics: readonly Report2Diagnostic[],
): ReportEntry[] {
  if (diagnostics.length !== report.entries.length) {
    throw new Error(`diagnostic-count-mismatch: ${diagnostics.length} vs ${report.entries.length}`);
  }
  const placed: (ReportEntry | null)[] = report.entries.map(() => null);
  for (const d of diagnostics) {
    if (d.origin !== "report2") throw new Error("diagnostic-origin-mismatch");
    const i = d.reportEntryIndex;
    if (!Number.isInteger(i) || i < 0 || i >= report.entries.length) {
      throw new Error(`diagnostic-index-out-of-range: ${String(i)}`);
    }
    if (placed[i] !== null) throw new Error(`diagnostic-duplicate-index: ${String(i)}`);
    const native = nativeEntryOf(d);
    const expected = report.entries[i];
    if (d.nativeCode !== d.code || d.code !== (expected as ReportEntry).code) {
      throw new Error("diagnostic-code-mismatch");
    }
    // §2.1.1 exact canonical equality: canonically equal values with reordered
    // keys still invert (§2.1.1 prescribes canonical comparison); field
    // presence is preserved because absent and present keys hash differently.
    if (canonicalBytes(native) !== canonicalBytes(expected)) {
      throw new Error(`diagnostic-field-mismatch at index ${String(i)}`);
    }
    placed[i] = native;
  }
  return placed as ReportEntry[];
}

function locatorOf(d: Diagnostic): string | null {
  switch (d.origin) {
    case "report2":
      return d.source.pointer;
    case "guardian":
      return d.path;
    case "diagram-core":
      return d.path;
    case "engram":
      return d.path ?? null;
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Ordering rule for G0 diagnostics only: (code, subjectRef, locator),
 * null locators first; report2 ties keep reportEntryIndex order.
 * Never applied to the native Report.
 */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  const byCode = compareText(a.code, b.code);
  if (byCode !== 0) return byCode;
  const bySubject = compareText(a.subjectRef, b.subjectRef);
  if (bySubject !== 0) return bySubject;
  const la = locatorOf(a);
  const lb = locatorOf(b);
  if (la === null && lb === null) {
    if (a.origin === "report2" && b.origin === "report2") return a.reportEntryIndex - b.reportEntryIndex;
    return 0;
  }
  if (la === null) return -1;
  if (lb === null) return 1;
  const byLocator = compareText(la, lb);
  if (byLocator !== 0) return byLocator;
  // §2.1.1: whenever all three G0 keys tie, report2 diagnostics keep
  // reportEntryIndex order — including non-null locator ties.
  if (a.origin === "report2" && b.origin === "report2") return a.reportEntryIndex - b.reportEntryIndex;
  return 0;
}

export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(compareDiagnostics);
}

// --- Composition outcomes (§§2.2, 3.1, 4.1) + scoped refusals (§2.5, D-B7) ---

export function refusedOutcome(diagnostics: readonly GuardianDiagnostic[]): {
  readonly outcome: "refused";
  readonly diagnostics: readonly GuardianDiagnostic[];
} {
  if (!diagnostics.some((d) => d.severity === "error")) {
    throw new Error("refused-requires-error");
  }
  return { outcome: "refused", diagnostics: [...diagnostics] };
}

export function guardianDiagnostic(
  code: string,
  subjectRef: string,
  severity: GuardianDiagnostic["severity"],
  messageKey: string,
  path: string | null = null,
  ruleId: string | null = null,
): GuardianDiagnostic {
  return { origin: "guardian", code, nativeCode: code, ruleId, subjectRef, severity, path, messageKey };
}

function notApplicable(family: string, operation: "compose" | "derive" | "merge"): GuardianDiagnostic {
  return guardianDiagnostic(
    "operation-not-applicable",
    family,
    "error",
    `${operation}-not-offered`,
    null,
    null,
  );
}

/**
 * §2.5 + D-B7: compose is not offered over TRK, H2A, MEM vocabularies/families.
 * Returns the refusal diagnostics; empty means compose applies.
 */
export function composeApplicability(family: string): GuardianDiagnostic[] {
  if (family === "TRK" || family === "H2A" || family === "MEM") return [notApplicable(family, "compose")];
  return [];
}

/** §3.4: inheritance derivation over TRK/H2A, record semantics from MEM. */
export function deriveApplicability(family: string, derivesRecordSemantics = false): GuardianDiagnostic[] {
  if (family === "TRK" || family === "H2A") return [notApplicable(family, "derive")];
  if (family === "MEM" && derivesRecordSemantics) return [notApplicable(family, "derive")];
  return [];
}

/** §4.2: no merge over MEM families or records. */
export function mergeApplicability(family: string): GuardianDiagnostic[] {
  if (family === "MEM") return [notApplicable(family, "merge")];
  return [];
}

// --- Typed resolution predicates (§4.2, FX-MAP-01, FX-CF-01..04/11) ---

/**
 * Whether a mapping file resolves a conflict. Cardinality/hierarchy/severity
 * conflicts resolve only through their own typed arm; a bare rename-style
 * {from, kind, to} entry never resolves them (FX-MAP-01).
 */
export function mappingResolvesConflict(
  code: "type-id-collision" | "relation-endpoint-incompatible" | "cardinality-conflict" | "hierarchy-shape-conflict" | "severity-conflict",
  subject: string,
  entries: readonly MappingEntry[],
): boolean {
  switch (code) {
    case "type-id-collision":
      return entries.some((e) => e.kind === "type" && (e.from === subject || e.to === subject));
    case "relation-endpoint-incompatible":
      return entries.some((e) => e.kind === "endpoint" && (e.from === subject || e.to === subject));
    case "cardinality-conflict":
      return entries.some((e) => e.kind === "cardinality" && e.subject === subject);
    case "hierarchy-shape-conflict":
      return entries.some((e) => e.kind === "hierarchy" && e.relationId === subject);
    case "severity-conflict":
      return entries.some((e) => e.kind === "severity" && e.ruleId === subject);
  }
}

// --- Compiled-rule closure ([BC] lint-contracts:81–93, FX-COMPILED-01) ---

const COMPILED_RULE_REQUIRED = ["id", "phase", "select", "assert", "code", "message", "classification"];
const COMPILED_RULE_OPTIONAL = ["repairRecipe", "bindings"];

/**
 * Pinned rule closure, mirroring the pinned `validateCompiledOptions` rule
 * loop ([BC] lint-contracts:86–92): required `id, phase, select, assert,
 * code, message, classification` with only `repairRecipe, bindings` allowed
 * (`options` refuses); `id, code, message` are non-empty text, `phase` and
 * `classification` are strings, per-rule bindings are closed triples.
 */
export function assertValidCompiledRule(rule: Record<string, unknown>): void {
  for (const key of COMPILED_RULE_REQUIRED) {
    if (!(key in rule)) throw new Error(`compiled-rule-missing:${key}`);
  }
  for (const key of Object.keys(rule)) {
    if (!COMPILED_RULE_REQUIRED.includes(key) && !COMPILED_RULE_OPTIONAL.includes(key)) {
      throw new Error(`compiled-rule-forbidden:${key}`);
    }
  }
  for (const key of ["id", "code", "message"] as const) {
    if (typeof rule[key] !== "string" || (rule[key] as string).length === 0) {
      throw new Error(`compiled-rule-invalid:${key}`);
    }
  }
  if (typeof rule["phase"] !== "string" || typeof rule["classification"] !== "string") {
    throw new Error("compiled-rule-invalid:type");
  }
  if ("bindings" in rule) {
    const bindings = rule["bindings"];
    if (!Array.isArray(bindings)) throw new Error("compiled-rule-bindings-not-array");
    for (const b of bindings) assertValidBinding(b);
  }
}

/**
 * Binding triple, closed to exactly `ownerId, role, targetId`
 * ([BC] lint-contracts:107–116 `validateBindingKeys`).
 */
function assertValidBinding(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("compiled-binding-not-object");
  }
  const b = value as Record<string, unknown>;
  if (Object.keys(b).sort().join(",") !== "ownerId,role,targetId") {
    throw new Error("compiled-binding-forbidden-field");
  }
  for (const key of ["ownerId", "role", "targetId"] as const) {
    if (typeof b[key] !== "string" || (b[key] as string).length === 0) {
      throw new Error(`compiled-binding-missing-field:${key}`);
    }
  }
}

const SETTING_ALLOWED = ["rule", "severity", "classification", "options"];

/** Pinned native severity vocabulary ([BC] lint-contracts:14–18). */
export const NATIVE_SEVERITIES = ["off", "warn", "error", "info"] as const;
export type NativeSeverity = (typeof NATIVE_SEVERITIES)[number];

/**
 * Pinned native severity predicate ([BC] lint-contracts:14–18): numbers map
 * `0/1/2/3` to `off/warn/error/info`; words pass through unchanged; anything
 * else (out-of-range numbers, non-integers, booleans, unknown words) refuses.
 * Effective `info` travels upstream as `warn`; the adapter restores `info`
 * from the effective policy row, never by rewriting the native entry.
 */
export function nativeEffectiveSeverity(value: unknown): NativeSeverity {
  const effective = typeof value === "number" ? NATIVE_SEVERITIES[value] : value;
  if (typeof effective !== "string" || !(NATIVE_SEVERITIES as readonly string[]).includes(effective)) {
    throw new Error(`setting-invalid:severity:${String(value)}`);
  }
  return effective as NativeSeverity;
}

/** Upstream transport category: effective `info` travels as `warn`. */
export function nativeTransportSeverity(value: unknown): NativeSeverity {
  const effective = nativeEffectiveSeverity(value);
  return effective === "info" ? "warn" : effective;
}

/**
 * S-COMPILED `Setting` ([BC] lint-contracts:11): `rule` and `severity`
 * (string or number, raw native severity kept) required; `classification`
 * and `options` optional; no other key permitted. `options` belongs to
 * inherited standard-rule settings; profile-local validation settings stay
 * closed to rule/severity/classification. The severity value itself must
 * satisfy the pinned native predicate.
 */
export function assertValidSetting(setting: Record<string, unknown>): void {
  if (typeof setting["rule"] !== "string" || setting["rule"] === "") throw new Error("setting-missing:rule");
  const severity = setting["severity"];
  if (typeof severity !== "string" && typeof severity !== "number") throw new Error("setting-missing:severity");
  nativeEffectiveSeverity(severity);
  if ("classification" in setting && typeof setting["classification"] !== "string") {
    throw new Error("setting-invalid:classification");
  }
  if ("options" in setting) {
    const options = setting["options"];
    if (typeof options !== "object" || options === null || Array.isArray(options)) {
      throw new Error("setting-invalid:options");
    }
  }
  for (const key of Object.keys(setting)) {
    if (!SETTING_ALLOWED.includes(key)) throw new Error(`setting-forbidden:${key}`);
  }
}

/**
 * S-COMPILED `CompiledLintOptions` closure ([BC] lint-contracts:46–95):
 * literal mechanismVersion `"1"`, required profile/phase/policy/digests,
 * every compiled rule closed, top-level bindings valid and separate from
 * per-rule bindings. Throws on the first violation.
 */
/**
 * S-COMPILED `CompiledLintOptions` closure, mirroring the pinned
 * `validateCompiledOptions` ([BC] lint-contracts:82–93): literal mechanism
 * version `"1"`, digest discipline on both digests, phase in `lintStages`,
 * readiness policy `draft`/`accept`, top-level bindings closed and pairwise
 * unique, every compiled rule closed with a matching phase, typed text
 * fields and no duplicate id.
 */
export function assertValidCompiledOptions(options: CompiledLintOptionsNative): void {
  if (options.mechanismVersion !== "1") throw new Error(`compiled-options-mechanism:${String(options.mechanismVersion)}`);
  if (!isDigest(options.profileDigest)) {
    throw new Error("compiled-options-invalid:profileDigest");
  }
  if (!(lintStages as readonly string[]).includes(options.phase)) {
    throw new Error(`compiled-options-invalid:phase:${String(options.phase)}`);
  }
  if (options.readinessPolicy !== "draft" && options.readinessPolicy !== "accept") {
    throw new Error(`compiled-options-invalid:readinessPolicy:${String(options.readinessPolicy)}`);
  }
  if (!isDigest(options.severityPolicyDigest)) {
    throw new Error("compiled-options-invalid:severityPolicyDigest");
  }
  const ids = new Set<string>();
  for (const rule of options.compiledRules) {
    assertValidCompiledRule(rule as unknown as Record<string, unknown>);
    const id = (rule as unknown as Record<string, unknown>)["id"] as string;
    if ((rule as unknown as Record<string, unknown>)["phase"] !== options.phase) {
      throw new Error(`compiled-rule-wrong-phase:${String(id)}`);
    }
    if (ids.has(id)) throw new Error(`compiled-rule-duplicate:${String(id)}`);
    ids.add(id);
  }
  const seen = new Set<string>();
  for (const b of options.bindings) {
    assertValidBinding(b);
    const key = JSON.stringify([(b as { ownerId: string }).ownerId, (b as { role: string }).role]);
    if (seen.has(key)) throw new Error("compiled-binding-duplicate");
    seen.add(key);
  }
}
