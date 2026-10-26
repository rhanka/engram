// §2.1 diagnostic envelope: native shapes transcribed verbatim + G0 extension.
// The native Report/2 object is never mutated; diagnostics are separate copies.
import { canonicalBytes } from "./canonical.js";
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

export type DiagnosticCode = string;

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

/** Whole-report mapping: one separate copy per native index, native order kept. */
export function reportToDiagnostics(
  report: NativeReport,
  subjectRefOf: (entry: ReportEntry, index: number) => string,
  studyDispositionOf?: (entry: ReportEntry, index: number) => string | undefined,
): Report2Diagnostic[] {
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

/** Pinned closure: required fields + only repairRecipe/bindings; `options` refuses. */
export function assertValidCompiledRule(rule: Record<string, unknown>): void {
  for (const key of COMPILED_RULE_REQUIRED) {
    if (!(key in rule)) throw new Error(`compiled-rule-missing:${key}`);
  }
  for (const key of Object.keys(rule)) {
    if (!COMPILED_RULE_REQUIRED.includes(key) && !COMPILED_RULE_OPTIONAL.includes(key)) {
      throw new Error(`compiled-rule-forbidden:${key}`);
    }
  }
  if ("bindings" in rule) {
    const bindings = rule["bindings"];
    if (!Array.isArray(bindings)) throw new Error("compiled-rule-bindings-not-array");
    for (const b of bindings) assertValidBinding(b);
  }
}

function assertValidBinding(value: unknown): void {
  if (typeof value !== "object" || value === null) throw new Error("compiled-binding-not-object");
  const b = value as Record<string, unknown>;
  if (typeof b["ownerId"] !== "string" || typeof b["role"] !== "string" || typeof b["targetId"] !== "string") {
    throw new Error("compiled-binding-missing-field");
  }
}

const SETTING_ALLOWED = ["rule", "severity", "classification", "options"];

/**
 * S-COMPILED `Setting` ([BC] lint-contracts:11): `rule` and `severity`
 * (string or number, raw native severity kept) required; `classification`
 * and `options` optional; no other key permitted. `options` belongs to
 * inherited standard-rule settings; profile-local validation settings stay
 * closed to rule/severity/classification.
 */
export function assertValidSetting(setting: Record<string, unknown>): void {
  if (typeof setting["rule"] !== "string" || setting["rule"] === "") throw new Error("setting-missing:rule");
  const severity = setting["severity"];
  if (typeof severity !== "string" && typeof severity !== "number") throw new Error("setting-missing:severity");
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
export function assertValidCompiledOptions(options: CompiledLintOptionsNative): void {
  if (options.mechanismVersion !== "1") throw new Error(`compiled-options-mechanism:${String(options.mechanismVersion)}`);
  if (typeof options.profileDigest !== "string" || options.profileDigest === "") {
    throw new Error("compiled-options-missing:profileDigest");
  }
  if (typeof options.phase !== "string" || options.phase === "") throw new Error("compiled-options-missing:phase");
  if (typeof options.readinessPolicy !== "string" || options.readinessPolicy === "") {
    throw new Error("compiled-options-missing:readinessPolicy");
  }
  if (typeof options.severityPolicyDigest !== "string" || options.severityPolicyDigest === "") {
    throw new Error("compiled-options-missing:severityPolicyDigest");
  }
  for (const rule of options.compiledRules) {
    assertValidCompiledRule(rule as unknown as Record<string, unknown>);
  }
  for (const b of options.bindings) assertValidBinding(b);
}
