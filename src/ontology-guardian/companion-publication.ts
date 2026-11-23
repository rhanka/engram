import {
  DATA_GOVERNANCE_FORMAT,
  sealModelGovernance,
  type QualifiedPin,
  type SealedModelGovernance,
} from "../model-governance.js";
import { extraKey, isRecord, isTrimmedStr, RESERVED_KEYS } from "../model-schemas.js";
import type { NormalizedOntologyProfile, OntologyProfile } from "../types.js";
import {
  checkAdmission,
  checkEntrySelections,
  checkProfilePayloadCoherence,
  isExactVersion,
  pinProblem,
  pinsEqual,
  projectProfileAdmissionEntry,
  type OwnerSelectionBinding,
  type QualificationScope,
} from "./admission.js";
import { canonicalBytes, sha256Hex } from "./canonical.js";
import type {
  OntologyPayload,
  PublicRuleSheetRef,
  RegistryAsset,
  RegistryEnvelope,
  RuleSheetRef,
} from "./catalog.js";
import { entryDigestOf, pinsDigestOf } from "./digests.js";
import {
  assertValidDeltaOperation,
  isDigest,
  type CorpusRef,
  type DeltaOperation,
  type Digest,
  type DigestEvidence,
  type Lifecycle,
  type OntologyRecord,
  type Pin,
  type PrivateDerivationRef,
  type RecordDigests,
  type TenantVisibility,
} from "./types.js";

export const DATA_GOVERNANCE_ASSET_ROLE = "data-governance" as const;

export type ParsedVisibility =
  | { readonly kind: "public" }
  | { readonly kind: "private"; readonly tenant: string };

export interface TenantVerificationReceipt {
  readonly tenant: string;
  readonly receiptRef: string;
  readonly profilePin: QualifiedPin;
  readonly governancePin: QualifiedPin;
  readonly verdict: "pass" | "fail";
}

export interface CompanionIndexEntry {
  readonly gPin: QualifiedPin;
  readonly companion: {
    readonly kind: "ontology";
    readonly id: string;
    readonly entryVersion: string;
  };
  readonly entryDigest: Digest;
}

export interface CompanionResolveQuery {
  readonly namespace: string;
  readonly id: string;
  readonly version: string;
  readonly viewerTenant?: string;
  readonly expectedEntryDigest?: Digest;
  readonly expectedGovernanceDigest?: Digest;
}

export interface CompanionPublishInput {
  readonly envelope: RegistryEnvelope;
  readonly profileRecord: OntologyRecord;
  readonly assets?: Readonly<Record<string, string>>;
  readonly profile?: OntologyProfile | NormalizedOntologyProfile;
  readonly tenantReceipt?: TenantVerificationReceipt;
  readonly expectedEntryDigest?: Digest;
  readonly admission?: {
    readonly family?: "ENG" | "EXT";
    readonly qualificationScope: QualificationScope;
    readonly ownerSelections?: readonly OwnerSelectionBinding[];
    readonly requireReference?: boolean;
  };
}

export type CompanionPublishResult =
  | {
      readonly ok: true;
      readonly indexEntry: CompanionIndexEntry;
      readonly entryDigest: Digest;
      readonly visibility: TenantVisibility;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly path: string;
      readonly reason: string;
    };

export type CompanionResolveResult =
  | {
      readonly ok: true;
      readonly indexEntry: CompanionIndexEntry;
      readonly envelope: Extract<RegistryEnvelope, { readonly kind: "ontology" }>;
      readonly visibility: TenantVisibility;
      readonly assetPath?: string;
      readonly assetBytes?: string;
      readonly tenantReceipt?: TenantVerificationReceipt;
    }
  | { readonly ok: false; readonly code: "not-found" }
  | {
      readonly ok: false;
      readonly code:
        | "invalid-pin"
        | "invalid-visibility"
        | "stale-entry-digest"
        | "digest-mismatch"
        | "substituted-asset"
        | "invalid-companion";
      readonly reason: string;
    };

const ENV_KEYS = [
  "format", "contractVersion", "kind", "id", "name", "description", "entryVersion",
  "publisher", "compatibility", "parameters", "bindings", "assets", "ontology",
  "extensions", "requiredExtensions",
] as const;

const ONT_KEYS = [
  "canonicalRef", "namespace", "owner", "domain", "profileShape", "profilePin", "stack",
  "digests", "provenance", "licenceClosure", "coverage", "conflictPolicy", "completeness",
  "corpusRef", "receipts", "migrations", "consumers", "compatibility", "linkedTools",
  "lifecycle", "deprecatedReason", "deprecatedAt", "supersededBy", "artifactKind",
  "artifactBinding", "visibility", "lineage", "ruleSheets",
] as const;

const REC_KEYS = [
  "namespace", "id", "version", "owner", "lifecycle", "completeness", "visibility",
  "profileShape", "artifactKind", "profileRef", "corpusRef", "digests", "lineage",
  "consumers", "supersededBy", "migrationRef", "deprecatedReason", "deprecatedAt",
  "catalogEntryRef",
] as const;

const ALLOWED_LICENCES = new Set(["MIT", "Apache-2.0", "CC0"]);
const QUALIFIED_EXT_KEY_RE =
  /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+(?:\/[a-z0-9][a-z0-9.-]*)?$/;
const PRIVATE_VIS_RE = /^private:([^\s:\x00-\x1f\x7f-\x9f]+)$/;
const CTRL_CHAR_RE = /[\x00-\x1f\x7f-\x9f]/;
const NOT_FOUND: CompanionResolveResult = { ok: false, code: "not-found" };

type FailureResult = Extract<CompanionPublishResult, { readonly ok: false }>;

function fail(code: string, path: string, reason: string): FailureResult {
  return { ok: false, code, path, reason };
}

function safeCanonicalBytes(value: unknown): string | null {
  try {
    return canonicalBytes(value);
  } catch {
    return null;
  }
}

function safePinsDigest(input: Parameters<typeof pinsDigestOf>[0]): Digest | null {
  try {
    return pinsDigestOf(input);
  } catch {
    return null;
  }
}

function isStrList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isTrimmedStr);
}

function isPin(value: unknown): value is Pin {
  return (
    isRecord(value) &&
    pinProblem(value as unknown as Pin, "pin") === null &&
    isTrimmedStr((value as unknown as Pin).id)
  );
}

function isPinListNoDup(value: unknown): value is readonly Pin[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isPin(item)) return false;
    const key = safeCanonicalBytes(item);
    if (key === null || seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function isQPin(value: unknown): value is QualifiedPin {
  return (
    isRecord(value) &&
    extraKey(value, "namespace", "pin") === undefined &&
    isTrimmedStr(value.namespace) &&
    isPin(value.pin)
  );
}

function sameQPin(a: QualifiedPin, b: QualifiedPin): boolean {
  return a.namespace === b.namespace && pinsEqual([a.pin], [b.pin]);
}

function isQualifiedExtensionKey(key: string): boolean {
  return !RESERVED_KEYS.has(key) && QUALIFIED_EXT_KEY_RE.test(key);
}

function isRelPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.startsWith("/") || value.endsWith("/") || value.includes("\\")) return false;
  if (CTRL_CHAR_RE.test(value)) return false;
  return value.split("/").every((seg) => isTrimmedStr(seg) && seg !== "." && seg !== "..");
}

function isClosedStrPair(value: unknown, k1: string, k2: string): boolean {
  return (
    isRecord(value) &&
    extraKey(value, k1, k2) === undefined &&
    isTrimmedStr(value[k1]) &&
    isTrimmedStr(value[k2])
  );
}

function isClosedStrDigest(value: unknown, strKey: string, digKey: string): boolean {
  return (
    isRecord(value) &&
    extraKey(value, strKey, digKey) === undefined &&
    isTrimmedStr(value[strKey]) &&
    isDigest(value[digKey])
  );
}

function isDigestEvidence(value: unknown, requireResolved: boolean): value is DigestEvidence {
  if (!isRecord(value)) return false;
  if (value.evidenceState === "resolved") {
    return extraKey(value, "evidenceState", "digest") === undefined && isDigest(value.digest);
  }
  if (!requireResolved && value.evidenceState === "unresolved") {
    return extraKey(value, "evidenceState") === undefined;
  }
  return false;
}

function isRecordDigests(
  value: unknown,
  expectedContentDigest: Digest,
  requireResolved: boolean,
): value is RecordDigests {
  return (
    isRecord(value) &&
    extraKey(value, "contentDigest", "pinsDigest", "resultEvidence") === undefined &&
    value.contentDigest === expectedContentDigest &&
    isDigest(value.pinsDigest) &&
    isDigestEvidence(value.resultEvidence, requireResolved)
  );
}

function isCorpusRef(value: unknown): value is CorpusRef {
  return isClosedStrDigest(value, "ref", "digest");
}

function validateLifecycle(
  obj: Record<string, unknown>,
  allowed: readonly Lifecycle[],
  requireMigrationOnSuperseded: boolean,
): string | null {
  const lc = obj.lifecycle;
  if (!(allowed as readonly unknown[]).includes(lc)) {
    return `invalid lifecycle ${String(lc)}`;
  }
  if (lc === "draft" || lc === "published") {
    if (
      obj.deprecatedReason !== undefined ||
      obj.deprecatedAt !== undefined ||
      obj.supersededBy !== undefined
    ) {
      return `${lc} lifecycle must not carry deprecation or supersession fields`;
    }
    return null;
  }
  if (lc === "deprecated") {
    if (!isTrimmedStr(obj.deprecatedReason) || !isTrimmedStr(obj.deprecatedAt)) {
      return "deprecated lifecycle requires deprecatedReason and deprecatedAt";
    }
    if (obj.supersededBy !== undefined && !isPin(obj.supersededBy)) {
      return "deprecated supersededBy must be a valid Pin";
    }
    return null;
  }
  if (obj.deprecatedReason !== undefined || obj.deprecatedAt !== undefined) {
    return "superseded lifecycle must not carry deprecatedReason or deprecatedAt";
  }
  if (!isPin(obj.supersededBy)) {
    return "superseded lifecycle requires a valid supersededBy Pin";
  }
  if (requireMigrationOnSuperseded && !isTrimmedStr(obj.migrationRef)) {
    return "superseded record requires migrationRef";
  }
  return null;
}

function isValidDeltaOp(value: unknown): boolean {
  if (!isRecord(value) || !isTrimmedStr(value.subject)) return false;
  if (value.op === "add") {
    return (
      extraKey(value, "op", "subject", "declaration") === undefined &&
      value.declaration !== undefined
    );
  }
  if (value.op === "narrow") {
    return (
      extraKey(value, "op", "subject", "constraint") === undefined &&
      value.constraint !== undefined
    );
  }
  if (value.op === "deprecate-term") {
    return (
      extraKey(value, "op", "subject", "reason") === undefined &&
      isTrimmedStr(value.reason)
    );
  }
  if (value.op === "rename-with-mapping") {
    if (
      extraKey(value, "op", "subject", "newName", "mappingEntry") !== undefined ||
      !isTrimmedStr(value.newName) ||
      !isRecord(value.mappingEntry) ||
      extraKey(value.mappingEntry, "kind", "from", "to") !== undefined ||
      value.mappingEntry.kind !== "rename"
    ) {
      return false;
    }
    try {
      assertValidDeltaOperation(value as unknown as DeltaOperation);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

type LineageCheckResult =
  | {
      readonly ok: true;
      readonly derivationKind: "none" | "public" | "private";
      readonly derivationRef?: PrivateDerivationRef;
    }
  | { readonly ok: false; readonly code: string; readonly reason: string };

function validateLineage(
  raw: unknown,
  visKind: "public" | "private",
  digests: RecordDigests,
  invalidCode: string,
): LineageCheckResult {
  if (!isRecord(raw)) {
    return { ok: false, code: invalidCode, reason: "lineage must be a plain object" };
  }
  if (visKind === "private") {
    if ("derivation" in raw || "operations" in raw) {
      return {
        ok: false,
        code: "private-content-leak",
        reason: "private lineage must not expose derivation or operations",
      };
    }
    if (
      extraKey(raw, "parents", "derivationRef", "mappings", "migrations") !== undefined ||
      !isPinListNoDup(raw.parents) ||
      !isStrList(raw.mappings) ||
      !isStrList(raw.migrations)
    ) {
      return { ok: false, code: invalidCode, reason: "invalid private lineage" };
    }
    if (raw.derivationRef !== undefined) {
      const ref = raw.derivationRef;
      if (
        !isRecord(ref) ||
        extraKey(ref, "base", "deltaDigest", "mappingRef") !== undefined ||
        !isPin(ref.base) ||
        !isDigest(ref.deltaDigest) ||
        (ref.mappingRef !== undefined && !isPin(ref.mappingRef))
      ) {
        return { ok: false, code: invalidCode, reason: "invalid private derivationRef" };
      }
      return {
        ok: true,
        derivationKind: "private",
        derivationRef: ref as unknown as PrivateDerivationRef,
      };
    }
    return { ok: true, derivationKind: "none" };
  }
  if (
    extraKey(raw, "parents", "derivation", "mappings", "migrations") !== undefined ||
    !isPinListNoDup(raw.parents) ||
    !isStrList(raw.mappings) ||
    !isStrList(raw.migrations)
  ) {
    return { ok: false, code: invalidCode, reason: "invalid public lineage" };
  }
  if (raw.derivation !== undefined) {
    const deriv = raw.derivation;
    const expectedDigestsBytes = safeCanonicalBytes(digests);
    if (
      !isRecord(deriv) ||
      extraKey(deriv, "base", "operations", "resultingDigests") !== undefined ||
      !isPin(deriv.base) ||
      !Array.isArray(deriv.operations) ||
      deriv.operations.length === 0 ||
      !deriv.operations.every(isValidDeltaOp) ||
      !isRecord(deriv.resultingDigests) ||
      safeCanonicalBytes(deriv.resultingDigests) !== expectedDigestsBytes
    ) {
      return { ok: false, code: invalidCode, reason: "invalid public derivation record" };
    }
    return { ok: true, derivationKind: "public" };
  }
  return { ok: true, derivationKind: "none" };
}

function validateEnvelopeV9(
  env: unknown,
):
  | { readonly ok: true; readonly env: Record<string, unknown>; readonly gPin: QualifiedPin }
  | FailureResult {
  if (!isRecord(env)) {
    return fail("invalid-envelope", "envelope", "envelope must be a plain object");
  }
  if ("entryDigest" in env) {
    return fail("entry-digest-self-embedded", "entryDigest", "entryDigest must not be self-embedded");
  }
  const envEx = extraKey(env, ...ENV_KEYS);
  if (envEx !== undefined) {
    return fail("invalid-envelope", envEx, "unknown envelope field");
  }
  const pub = env.publisher;
  if (
    env.format !== "sentropic.registry-entry/v1" ||
    !isExactVersion(env.contractVersion) ||
    env.kind !== "ontology" ||
    !isTrimmedStr(env.id) ||
    !isTrimmedStr(env.name) ||
    !isTrimmedStr(env.description) ||
    !isExactVersion(env.entryVersion) ||
    !isRecord(pub) ||
    extraKey(pub, "packageName", "packageVersion") !== undefined ||
    !isTrimmedStr(pub.packageName) ||
    !isExactVersion(pub.packageVersion)
  ) {
    return fail("invalid-envelope", "envelope", "invalid companion envelope metadata");
  }
  const comp = env.compatibility;
  if (
    !isRecord(comp) ||
    extraKey(
      comp,
      "entryContract",
      "packages",
      "schemaProfiles",
      "requiredHostFeatures",
      "optionalHostFeatures",
    ) !== undefined ||
    !isExactVersion(comp.entryContract) ||
    !Array.isArray(comp.packages) ||
    !comp.packages.every((p) => isClosedStrPair(p, "name", "range")) ||
    !isStrList(comp.schemaProfiles) ||
    !isStrList(comp.requiredHostFeatures) ||
    !isStrList(comp.optionalHostFeatures)
  ) {
    return fail("invalid-envelope", "compatibility", "invalid envelope compatibility");
  }
  const params = env.parameters;
  if (
    !isRecord(params) ||
    extraKey(params, "schemaVersion", "schema", "defaults") !== undefined ||
    !isExactVersion(params.schemaVersion) ||
    !isRecord(params.schema) ||
    !isRecord(params.defaults)
  ) {
    return fail("invalid-envelope", "parameters", "invalid envelope parameters");
  }
  if (
    !Array.isArray(env.bindings) ||
    !env.bindings.every(
      (b) =>
        isRecord(b) &&
        extraKey(b, "key", "contract", "required") === undefined &&
        isTrimmedStr(b.key) &&
        isTrimmedStr(b.contract) &&
        typeof b.required === "boolean",
    )
  ) {
    return fail("invalid-envelope", "bindings", "invalid envelope bindings");
  }
  if (!Array.isArray(env.assets)) {
    return fail("invalid-envelope", "assets", "assets must be an array");
  }
  const seenPaths = new Set<string>();
  for (const a of env.assets) {
    if (
      !isRecord(a) ||
      extraKey(a, "role", "path", "mediaType", "sha256") !== undefined ||
      !isTrimmedStr(a.role) ||
      !isRelPath(a.path) ||
      !isTrimmedStr(a.mediaType) ||
      !isDigest(a.sha256)
    ) {
      return fail("invalid-envelope", "assets", "invalid assets");
    }
    if (seenPaths.has(a.path)) {
      return fail("invalid-envelope", "assets", "duplicate asset path");
    }
    seenPaths.add(a.path);
  }
  const ext = env.extensions;
  const req = env.requiredExtensions;
  if (
    !isRecord(ext) ||
    !Object.hasOwn(ext, DATA_GOVERNANCE_FORMAT) ||
    !Array.isArray(req) ||
    req.length !== 1 ||
    req[0] !== DATA_GOVERNANCE_FORMAT
  ) {
    return fail(
      "missing-required-extension",
      "requiredExtensions",
      "missing required data-governance extension",
    );
  }
  for (const key of Object.keys(ext)) {
    if (!isQualifiedExtensionKey(key)) {
      return fail("invalid-extension", `extensions.${key}`, "extension keys must be qualified");
    }
  }
  const gPin = ext[DATA_GOVERNANCE_FORMAT];
  if (!isQPin(gPin)) {
    return fail("invalid-extension", "extensions", "extension value must be an exact QualifiedPin");
  }
  return { ok: true, env, gPin };
}

function isValidSettingShape(setting: unknown): boolean {
  if (!isRecord(setting)) return false;
  if (extraKey(setting, "rule", "severity", "classification", "options") !== undefined) {
    return false;
  }
  if (!isTrimmedStr(setting.rule) || !isTrimmedStr(setting.severity)) return false;
  if (setting.classification !== undefined && !isTrimmedStr(setting.classification)) return false;
  if (setting.options !== undefined && !isRecord(setting.options)) return false;
  return true;
}

function isValidSelectionRow(row: unknown): boolean {
  if (!isRecord(row)) return false;
  if (extraKey(row, "ruleId", "severity", "studyDisposition") !== undefined) return false;
  if (!isTrimmedStr(row.ruleId) || !isTrimmedStr(row.severity)) return false;
  if (row.studyDisposition !== undefined && !isTrimmedStr(row.studyDisposition)) return false;
  return true;
}

function validateRuleSheets(
  raw: unknown,
  visKind: "public" | "private",
  ont: Record<string, unknown>,
): FailureResult | null {
  if (!Array.isArray(raw)) {
    return fail("invalid-envelope", "ontology.ruleSheets", "ruleSheets must be an array");
  }
  const seenPins = new Set<string>();
  for (const sheet of raw) {
    if (!isRecord(sheet)) {
      return fail("invalid-envelope", "ontology.ruleSheets", "ruleSheet must be a plain object");
    }
    if (visKind === "private") {
      if ("selections" in sheet || "settings" in sheet) {
        return fail(
          "private-content-leak",
          "ontology.ruleSheets",
          "private ruleSheet must not expose selections or settings",
        );
      }
      if (extraKey(sheet, "sheetPin", "ruleIds") !== undefined) {
        return fail("invalid-envelope", "ontology.ruleSheets", "unknown private ruleSheet field");
      }
    } else {
      if (extraKey(sheet, "sheetPin", "ruleIds", "selections") !== undefined) {
        return fail("invalid-envelope", "ontology.ruleSheets", "unknown public ruleSheet field");
      }
      if (!Array.isArray(sheet.selections) || sheet.selections.length === 0) {
        return fail("invalid-envelope", "ontology.ruleSheets", "public ruleSheet requires selections");
      }
      for (const sel of sheet.selections) {
        if (
          !isRecord(sel) ||
          extraKey(sel, "phase", "readinessPolicy", "settings", "severityPolicyDigest", "rules") !==
            undefined ||
          !isTrimmedStr(sel.phase) ||
          !isTrimmedStr(sel.readinessPolicy) ||
          !isDigest(sel.severityPolicyDigest) ||
          !Array.isArray(sel.settings) ||
          !sel.settings.every(isValidSettingShape) ||
          !Array.isArray(sel.rules) ||
          !sel.rules.every(isValidSelectionRow)
        ) {
          return fail("invalid-envelope", "ontology.ruleSheets", "invalid selection metadata");
        }
      }
    }
    if (
      !isPin(sheet.sheetPin) ||
      !isStrList(sheet.ruleIds) ||
      new Set(sheet.ruleIds).size !== sheet.ruleIds.length
    ) {
      return fail("invalid-envelope", "ontology.ruleSheets", "invalid ruleSheet pin or ruleIds");
    }
    const pinKey = safeCanonicalBytes(sheet.sheetPin);
    if (pinKey === null || seenPins.has(pinKey)) {
      return fail("invalid-envelope", "ontology.ruleSheets", "duplicate or non-canonical sheetPin");
    }
    seenPins.add(pinKey);
  }
  if (visKind === "public" && raw.length > 0) {
    const firstSelections = (raw[0] as PublicRuleSheetRef).selections;
    const scopeSelections: { readonly phase: string; readonly readinessPolicy: string }[] = [];
    const seenScopes = new Set<string>();
    for (const sel of firstSelections) {
      const key = safeCanonicalBytes([sel.phase, sel.readinessPolicy]);
      if (key === null || seenScopes.has(key)) {
        return fail("invalid-envelope", "ontology.ruleSheets", "duplicate selection scope");
      }
      seenScopes.add(key);
      scopeSelections.push({ phase: sel.phase, readinessPolicy: sel.readinessPolicy });
    }
    try {
      const projected = projectProfileAdmissionEntry(
        ont as unknown as Extract<OntologyPayload, { readonly artifactKind: "profile" }>,
        {
          family: "ENG",
          qualificationScope: {
            libraries: [{ id: "rule-sheet-check", version: "1" }],
            proofSets: [],
            selections: scopeSelections,
          },
        },
      );
      const problem = checkEntrySelections(projected);
      if (problem !== null) {
        return fail("invalid-envelope", "ontology.ruleSheets", problem);
      }
    } catch (error) {
      return fail("invalid-envelope", "ontology.ruleSheets", (error as Error).message);
    }
  }
  return null;
}

function validateCompanionPayload(
  ont: Record<string, unknown>,
  visKind: "public" | "private",
): FailureResult | null {
  const ontEx = extraKey(ont, ...ONT_KEYS);
  if (ontEx !== undefined) {
    return fail("invalid-envelope", `ontology.${ontEx}`, "unknown ontology payload field");
  }
  if (
    !isTrimmedStr(ont.canonicalRef) ||
    !isTrimmedStr(ont.namespace) ||
    !isTrimmedStr(ont.owner) ||
    (ont.domain !== undefined && !isTrimmedStr(ont.domain)) ||
    !isTrimmedStr(ont.conflictPolicy) ||
    (ont.completeness !== "skeleton" && ont.completeness !== "complete") ||
    !isStrList(ont.migrations) ||
    !isStrList(ont.consumers) ||
    !isStrList(ont.linkedTools)
  ) {
    return fail("invalid-envelope", "ontology", "invalid companion ontology metadata");
  }
  if (!isClosedStrPair(ont.provenance, "sourceRef", "sourceRevision")) {
    return fail("invalid-envelope", "ontology.provenance", "invalid provenance");
  }
  if (!isCorpusRef(ont.corpusRef)) {
    return fail("invalid-envelope", "ontology.corpusRef", "invalid corpusRef");
  }
  if (!isClosedStrPair(ont.compatibility, "renderer", "adapter")) {
    return fail("invalid-envelope", "ontology.compatibility", "invalid ontology compatibility");
  }
  if (ont.licenceClosure !== undefined) {
    const lc = ont.licenceClosure;
    if (
      !isRecord(lc) ||
      extraKey(lc, "licences", "closureDigest") !== undefined ||
      !Array.isArray(lc.licences) ||
      lc.licences.length === 0 ||
      !lc.licences.every((l) => typeof l === "string" && ALLOWED_LICENCES.has(l)) ||
      !isDigest(lc.closureDigest)
    ) {
      return fail("invalid-envelope", "ontology.licenceClosure", "invalid licenceClosure");
    }
  }
  if (
    ont.coverage !== undefined &&
    !isClosedStrDigest(ont.coverage, "declaredLimits", "coverageDigest")
  ) {
    return fail("invalid-envelope", "ontology.coverage", "invalid coverage");
  }
  if (!Array.isArray(ont.receipts) || !ont.receipts.every(isRecord)) {
    return fail("invalid-envelope", "ontology.receipts", "receipts must be an array of objects");
  }
  const lifecycleErr = validateLifecycle(
    ont,
    ["draft", "published", "deprecated", "superseded"],
    false,
  );
  if (lifecycleErr !== null) {
    return fail("invalid-envelope", "ontology.lifecycle", lifecycleErr);
  }
  const coherenceErr = checkProfilePayloadCoherence(ont);
  if (coherenceErr !== null) {
    return fail("invalid-envelope", "ontology", coherenceErr);
  }
  const profilePin = ont.profilePin as Pin;
  const stack = ont.stack as readonly Pin[];
  if (!stack.every((p) => isTrimmedStr(p.id))) {
    return fail("invalid-envelope", "ontology.stack", "pin ids must be trimmed non-empty strings");
  }
  const binding = ont.artifactBinding as Record<string, unknown>;
  if (extraKey(binding, "artifactKind", "profilePin", "stack", "relationMatrixRef") !== undefined) {
    return fail("invalid-envelope", "ontology.artifactBinding", "unknown artifactBinding field");
  }
  if (visKind === "private" && !isTrimmedStr(binding.relationMatrixRef)) {
    return fail(
      "invalid-envelope",
      "ontology.artifactBinding.relationMatrixRef",
      "private profile requires relationMatrixRef",
    );
  }
  if (visKind === "public" && binding.relationMatrixRef !== undefined) {
    return fail(
      "invalid-envelope",
      "ontology.artifactBinding.relationMatrixRef",
      "public profile must omit relationMatrixRef",
    );
  }
  const requireResolved = ont.lifecycle !== "draft";
  if (!isRecordDigests(ont.digests, profilePin.contentDigest, requireResolved)) {
    return fail("invalid-envelope", "ontology.digests", "invalid companion digests");
  }
  const sheetsErr = validateRuleSheets(ont.ruleSheets, visKind, ont);
  if (sheetsErr !== null) return sheetsErr;
  const lineageRes = validateLineage(ont.lineage, visKind, ont.digests, "invalid-envelope");
  if (!lineageRes.ok) {
    return fail(lineageRes.code, "ontology.lineage", lineageRes.reason);
  }
  const sheetPins = (ont.ruleSheets as readonly RuleSheetRef[]).map((s) => s.sheetPin);
  if (lineageRes.derivationKind === "none") {
    if (ont.digests.pinsDigest !== safePinsDigest({ layers: stack, ruleSheets: sheetPins })) {
      return fail("invalid-envelope", "ontology.digests.pinsDigest", "pinsDigest mismatch");
    }
  } else if (lineageRes.derivationKind === "private") {
    const ref = lineageRes.derivationRef!;
    const expected = safePinsDigest({
      layers: stack,
      ruleSheets: sheetPins,
      deltaDigest: ref.deltaDigest,
      mappingDigest: ref.mappingRef?.contentDigest ?? null,
    });
    if (ont.digests.pinsDigest !== expected) {
      return fail("invalid-envelope", "ontology.digests.pinsDigest", "private pinsDigest mismatch");
    }
  }
  return null;
}

function validateProfileRecord(
  nRec: Record<string, unknown>,
  visKind: "public" | "private",
): FailureResult | null {
  const recEx = extraKey(nRec, ...REC_KEYS);
  if (recEx !== undefined) {
    return fail("invalid-profile-record", `profileRecord.${recEx}`, "unknown profileRecord field");
  }
  if (
    !isTrimmedStr(nRec.namespace) ||
    !isTrimmedStr(nRec.id) ||
    !isExactVersion(nRec.version) ||
    !isTrimmedStr(nRec.owner) ||
    (nRec.completeness !== "skeleton" && nRec.completeness !== "complete") ||
    nRec.profileShape !== "engram-profile" ||
    nRec.artifactKind !== "profile" ||
    !isStrList(nRec.consumers) ||
    (nRec.migrationRef !== undefined && !isTrimmedStr(nRec.migrationRef)) ||
    (nRec.catalogEntryRef !== undefined && !isTrimmedStr(nRec.catalogEntryRef))
  ) {
    return fail("invalid-profile-record", "profileRecord", "invalid N publication record");
  }
  if (!isClosedStrDigest(nRec.profileRef, "canonicalRef", "contentDigest")) {
    return fail("invalid-profile-record", "profileRecord.profileRef", "invalid N profileRef");
  }
  const profileRef = nRec.profileRef as { readonly contentDigest: Digest };
  const lifecycleErr = validateLifecycle(nRec, ["published", "deprecated", "superseded"], true);
  if (lifecycleErr !== null) {
    return fail("invalid-profile-record", "profileRecord.lifecycle", lifecycleErr);
  }
  if (!isCorpusRef(nRec.corpusRef)) {
    return fail("invalid-profile-record", "profileRecord.corpusRef", "invalid N corpusRef");
  }
  if (!isRecordDigests(nRec.digests, profileRef.contentDigest, true)) {
    return fail("invalid-profile-record", "profileRecord.digests", "invalid N digests");
  }
  const lineageRes = validateLineage(nRec.lineage, visKind, nRec.digests, "invalid-profile-record");
  if (!lineageRes.ok) {
    return fail(lineageRes.code, "profileRecord.lineage", lineageRes.reason);
  }
  return null;
}

function parseAndCanonicalizeJson(
  bytes: string,
):
  | { readonly ok: true; readonly value: Record<string, unknown>; readonly canonical: string }
  | { readonly ok: false; readonly reason: string } {
  try {
    const parsed: unknown = JSON.parse(bytes);
    if (!isRecord(parsed)) {
      return { ok: false, reason: "G asset JSON must be a plain object" };
    }
    const canonical = canonicalBytes(parsed);
    return { ok: true, value: parsed, canonical };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}

function validatePublicGovernance(
  input: CompanionPublishInput,
  govAssets: readonly RegistryAsset[],
  gPin: QualifiedPin,
  nQPin: QualifiedPin,
): FailureResult | null {
  if (input.tenantReceipt !== undefined) {
    return fail(
      "invalid-tenant-receipt",
      "tenantReceipt",
      "public companion must not carry a tenant receipt",
    );
  }
  if (govAssets.length !== 1) {
    const code = govAssets.length === 0 ? "missing-public-asset" : "duplicate-public-asset";
    return fail(code, "assets", "public companion requires exactly one data-governance asset");
  }
  const asset = govAssets[0]!;
  if (asset.mediaType !== "application/json") {
    return fail(
      "invalid-public-asset",
      "assets",
      "data-governance asset mediaType must be application/json",
    );
  }
  if (asset.sha256 !== gPin.pin.contentDigest) {
    return fail(
      "substituted-public-asset",
      "assets",
      "data-governance asset sha256 mismatches G pin",
    );
  }
  if (input.profile === undefined) {
    return fail("missing-profile", "profile", "public companion requires the verified N profile body");
  }
  const bytes =
    isRecord(input.assets) && Object.hasOwn(input.assets, asset.path)
      ? input.assets[asset.path]
      : undefined;
  if (typeof bytes !== "string") {
    return fail("missing-public-asset", "assets", "missing public data-governance asset bytes");
  }
  if (sha256Hex(bytes) !== gPin.pin.contentDigest) {
    return fail(
      "substituted-public-asset",
      "assets",
      "public data-governance asset bytes digest mismatch",
    );
  }
  const parsed = parseAndCanonicalizeJson(bytes);
  if (!parsed.ok) {
    return fail("substituted-public-asset", "assets", parsed.reason);
  }
  if (parsed.canonical !== bytes) {
    return fail(
      "substituted-public-asset",
      "assets",
      "public G asset bytes are not RFC 8785 canonical",
    );
  }
  let sealed: SealedModelGovernance;
  try {
    sealed = sealModelGovernance(input.profile, parsed.value);
  } catch (error) {
    return fail("invalid-governance", "assets", (error as Error).message);
  }
  if (!sameQPin(sealed.pin, gPin)) {
    return fail("substituted-public-asset", "assets", "public asset identity disagrees with G pin");
  }
  const gProfile = parsed.value.profile as QualifiedPin;
  if (!sameQPin(gProfile, nQPin)) {
    return fail("substituted-public-asset", "assets", "public asset profile pin disagrees with N pin");
  }
  return null;
}

function validatePrivateCompanion(
  input: CompanionPublishInput,
  govAssets: readonly RegistryAsset[],
  visNKind: "public" | "private",
  tenant: string,
  gPin: QualifiedPin,
  nQPin: QualifiedPin,
): FailureResult | null {
  if (govAssets.length !== 0) {
    return fail(
      "private-governance-asset",
      "assets",
      "private companion must omit data-governance asset",
    );
  }
  if (visNKind === "private" && input.profile !== undefined) {
    return fail(
      "private-content-leak",
      "profile",
      "private N profile body must not be supplied to the guardian",
    );
  }
  const r = input.tenantReceipt as unknown;
  if (
    !isRecord(r) ||
    extraKey(r, "tenant", "receiptRef", "profilePin", "governancePin", "verdict") !== undefined ||
    r.tenant !== tenant ||
    !isTrimmedStr(r.receiptRef) ||
    r.verdict !== "pass" ||
    !isQPin(r.profilePin) ||
    !sameQPin(r.profilePin, nQPin) ||
    !isQPin(r.governancePin) ||
    !sameQPin(r.governancePin, gPin)
  ) {
    return fail(
      "invalid-tenant-receipt",
      "tenantReceipt",
      "private companion requires matching passing tenant verification receipt",
    );
  }
  return null;
}

function validateCompanionAdmission(
  admission: NonNullable<CompanionPublishInput["admission"]>,
  ont: Extract<OntologyPayload, { readonly artifactKind: "profile" }>,
): FailureResult | null {
  if (
    !isRecord(admission) ||
    extraKey(admission, "family", "qualificationScope", "ownerSelections", "requireReference") !==
      undefined ||
    (admission.family !== undefined && admission.family !== "ENG" && admission.family !== "EXT") ||
    (admission.requireReference !== undefined && typeof admission.requireReference !== "boolean")
  ) {
    return fail("invalid-input", "admission", "invalid admission options");
  }
  try {
    const entry = projectProfileAdmissionEntry(ont, {
      family: admission.family ?? "ENG",
      qualificationScope: admission.qualificationScope,
      ...(admission.ownerSelections !== undefined
        ? { ownerSelections: admission.ownerSelections }
        : {}),
    });
    const verdict = checkAdmission({
      entry,
      receipts: ont.receipts,
      requireReference: admission.requireReference,
    });
    if (!verdict.admitted) {
      return fail(verdict.code, "ontology.receipts", verdict.reason);
    }
    return null;
  } catch (error) {
    return fail("missing-receipt", "ontology.receipts", (error as Error).message);
  }
}

export function parseVisibility(value: unknown): ParsedVisibility | null {
  if (value === "public") return { kind: "public" };
  if (typeof value !== "string") return null;
  const match = PRIVATE_VIS_RE.exec(value);
  if (!match || RESERVED_KEYS.has(match[1]!)) return null;
  return { kind: "private", tenant: match[1]! };
}

export function checkVisibilityPair(
  nVis: unknown,
  companionVis: unknown,
):
  | { readonly ok: true; readonly n: ParsedVisibility; readonly companion: ParsedVisibility }
  | { readonly ok: false; readonly path: string; readonly reason: string } {
  const n = parseVisibility(nVis);
  if (!n) {
    return {
      ok: false,
      path: "profileRecord.visibility",
      reason: "unknown or absent N visibility",
    };
  }
  const c = parseVisibility(companionVis);
  if (!c) {
    return {
      ok: false,
      path: "ontology.visibility",
      reason: "unknown or absent companion visibility",
    };
  }
  if (n.kind === "private" && (c.kind !== "private" || c.tenant !== n.tenant)) {
    return {
      ok: false,
      path: "ontology.visibility",
      reason: "private N requires exact same private:<tenant> companion",
    };
  }
  return { ok: true, n, companion: c };
}

function validateCompanionPublicationImpl(input: CompanionPublishInput): CompanionPublishResult {
  if (!isRecord(input)) {
    return fail("invalid-input", "input", "publication input must be a plain object");
  }
  const envCheck = validateEnvelopeV9(input.envelope as unknown);
  if (!envCheck.ok) return envCheck;
  const { env, gPin } = envCheck;
  const ont = env.ontology;
  if (!isRecord(ont)) {
    return fail("invalid-envelope", "ontology", "ontology payload must be a plain object");
  }
  const nRec = input.profileRecord as unknown;
  if (!isRecord(nRec)) {
    return fail("invalid-profile-record", "profileRecord", "profileRecord must be a plain object");
  }
  const vis = checkVisibilityPair(nRec.visibility, ont.visibility);
  if (!vis.ok) {
    return fail("invalid-visibility", vis.path, vis.reason);
  }
  const payloadErr = validateCompanionPayload(ont, vis.companion.kind);
  if (payloadErr !== null) return payloadErr;
  const recordErr = validateProfileRecord(nRec, vis.n.kind);
  if (recordErr !== null) return recordErr;
  const profilePin = ont.profilePin as Pin;
  const nRef = nRec.profileRef as { readonly contentDigest: Digest };
  if (
    ont.namespace !== nRec.namespace ||
    profilePin.id !== nRec.id ||
    profilePin.version !== nRec.version ||
    profilePin.contentDigest !== nRef.contentDigest
  ) {
    return fail(
      "pin-mismatch",
      "ontology.profilePin",
      "companion N pin disagrees with N publication record",
    );
  }
  let entryDigest: Digest;
  try {
    entryDigest = entryDigestOf(env);
  } catch (error) {
    return fail("invalid-envelope", "envelope", (error as Error).message);
  }
  if (input.expectedEntryDigest !== undefined && input.expectedEntryDigest !== entryDigest) {
    return fail("stale-entry-digest", "entryDigest", "P-ENTRY digest mismatch");
  }
  const govAssets = (env.assets as readonly RegistryAsset[]).filter(
    (a) => a.role === DATA_GOVERNANCE_ASSET_ROLE,
  );
  const nQPin: QualifiedPin = { namespace: ont.namespace as string, pin: profilePin };
  const tierErr =
    vis.companion.kind === "public"
      ? validatePublicGovernance(input, govAssets, gPin, nQPin)
      : validatePrivateCompanion(input, govAssets, vis.n.kind, vis.companion.tenant, gPin, nQPin);
  if (tierErr !== null) return tierErr;
  if (input.admission !== undefined) {
    const admErr = validateCompanionAdmission(
      input.admission,
      ont as unknown as Extract<OntologyPayload, { readonly artifactKind: "profile" }>,
    );
    if (admErr !== null) return admErr;
  }
  return {
    ok: true,
    indexEntry: {
      gPin,
      companion: {
        kind: "ontology",
        id: env.id as string,
        entryVersion: env.entryVersion as string,
      },
      entryDigest,
    },
    entryDigest,
    visibility: ont.visibility as TenantVisibility,
  };
}

export function validateCompanionPublication(input: CompanionPublishInput): CompanionPublishResult {
  try {
    return validateCompanionPublicationImpl(input);
  } catch (error) {
    return fail("invalid-input", "input", (error as Error).message);
  }
}

type StoredCompanion =
  | {
      readonly kind: "public";
      readonly indexEntry: CompanionIndexEntry;
      readonly envelope: Extract<RegistryEnvelope, { readonly kind: "ontology" }>;
      readonly assetPath: string;
      readonly assets: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "private";
      readonly tenant: string;
      readonly indexEntry: CompanionIndexEntry;
      readonly envelope: Extract<RegistryEnvelope, { readonly kind: "ontology" }>;
      readonly tenantReceipt: TenantVerificationReceipt;
    };

export function createCompanionIndex() {
  const byG = new Map<string, StoredCompanion>();
  const byCat = new Map<string, string>();
  const bySeries = new Map<string, Set<string>>();

  return {
    publish(input: CompanionPublishInput): CompanionPublishResult {
      let snapshot: CompanionPublishInput;
      let envCopy: Extract<RegistryEnvelope, { readonly kind: "ontology" }> | undefined;
      let assetsCopy: Readonly<Record<string, string>> | undefined;
      let receiptCopy: TenantVerificationReceipt | undefined;
      try {
        if (!isRecord(input)) {
          return fail("invalid-input", "input", "publication input must be a plain object");
        }
        const rawEnv = input.envelope as unknown;
        const envBytes = safeCanonicalBytes(rawEnv);
        if (envBytes !== null) {
          envCopy = JSON.parse(envBytes) as Extract<
            RegistryEnvelope,
            { readonly kind: "ontology" }
          >;
        }
        const rawProfileRecord = input.profileRecord;
        const rawAssets = input.assets as unknown;
        if (isRecord(rawAssets)) {
          const copied: Record<string, string> = Object.create(null);
          for (const key of Object.keys(rawAssets)) {
            const val = rawAssets[key];
            if (typeof val === "string") copied[key] = val;
          }
          assetsCopy = copied;
        }
        const rawProfile = input.profile;
        const rawReceipt = input.tenantReceipt as unknown;
        if (isRecord(rawReceipt)) {
          const rBytes = safeCanonicalBytes(rawReceipt);
          if (rBytes !== null) {
            receiptCopy = JSON.parse(rBytes) as TenantVerificationReceipt;
          }
        }
        const rawExpectedEntryDigest = input.expectedEntryDigest;
        const rawAdmission = input.admission;
        snapshot = {
          envelope: (envCopy ?? rawEnv) as RegistryEnvelope,
          profileRecord: rawProfileRecord,
          ...(assetsCopy !== undefined
            ? { assets: assetsCopy }
            : rawAssets !== undefined
              ? { assets: rawAssets as Readonly<Record<string, string>> }
              : {}),
          ...(rawProfile !== undefined ? { profile: rawProfile } : {}),
          ...(receiptCopy !== undefined
            ? { tenantReceipt: receiptCopy }
            : rawReceipt !== undefined
              ? { tenantReceipt: rawReceipt as TenantVerificationReceipt }
              : {}),
          ...(rawExpectedEntryDigest !== undefined
            ? { expectedEntryDigest: rawExpectedEntryDigest }
            : {}),
          ...(rawAdmission !== undefined ? { admission: rawAdmission } : {}),
        };
      } catch (error) {
        return fail("invalid-input", "input", (error as Error).message);
      }
      const res = validateCompanionPublication(snapshot);
      if (!res.ok) return res;
      if (envCopy === undefined) {
        return fail("invalid-envelope", "envelope", "envelope is not canonical JSON");
      }
      const { gPin, companion } = res.indexEntry;
      const gKey = JSON.stringify([gPin.namespace, gPin.pin.id, gPin.pin.version]);
      const catKey = JSON.stringify([companion.kind, companion.id, companion.entryVersion]);
      const sKey = JSON.stringify([gPin.namespace, gPin.pin.id]);
      if (byG.has(gKey)) {
        return fail("reused-governance-identity", "extensions", "reused G identity");
      }
      if (byCat.has(catKey) || bySeries.get(sKey)?.has(companion.entryVersion)) {
        return fail("reused-entry-version", "entryVersion", "G revision requires a new entryVersion");
      }
      const parsedVis = parseVisibility(res.visibility)!;
      const indexEntry = structuredClone(res.indexEntry);
      let stored: StoredCompanion;
      if (parsedVis.kind === "public") {
        const assetPath = envCopy.assets.find((a) => a.role === DATA_GOVERNANCE_ASSET_ROLE)!.path;
        stored = {
          kind: "public",
          indexEntry,
          envelope: envCopy,
          assetPath,
          assets: { [assetPath]: assetsCopy![assetPath]! },
        };
      } else {
        if (receiptCopy === undefined) {
          return fail(
            "invalid-tenant-receipt",
            "tenantReceipt",
            "tenantReceipt is not canonical JSON",
          );
        }
        stored = {
          kind: "private",
          tenant: parsedVis.tenant,
          indexEntry,
          envelope: envCopy,
          tenantReceipt: receiptCopy,
        };
      }
      byG.set(gKey, stored);
      byCat.set(catKey, gKey);
      let versions = bySeries.get(sKey);
      if (!versions) {
        versions = new Set();
        bySeries.set(sKey, versions);
      }
      versions.add(companion.entryVersion);
      return res;
    },

    resolve(
      query: CompanionResolveQuery,
      opts?: { readonly assets?: Readonly<Record<string, string>> },
    ): CompanionResolveResult {
      if (
        !isRecord(query) ||
        !isTrimmedStr(query.namespace) ||
        !isTrimmedStr(query.id) ||
        !isExactVersion(query.version)
      ) {
        return {
          ok: false,
          code: "invalid-pin",
          reason: "exact (namespace, id, version) required",
        };
      }
      const gKey = JSON.stringify([query.namespace, query.id, query.version]);
      const rec = byG.get(gKey);
      if (!rec) return NOT_FOUND;
      if (rec.kind === "private" && query.viewerTenant !== rec.tenant) {
        return NOT_FOUND;
      }
      if (
        query.expectedEntryDigest !== undefined &&
        query.expectedEntryDigest !== rec.indexEntry.entryDigest
      ) {
        return { ok: false, code: "stale-entry-digest", reason: "P-ENTRY digest mismatch" };
      }
      if (
        query.expectedGovernanceDigest !== undefined &&
        query.expectedGovernanceDigest !== rec.indexEntry.gPin.pin.contentDigest
      ) {
        return { ok: false, code: "digest-mismatch", reason: "G digest mismatch" };
      }
      if (rec.kind === "public") {
        const store = opts?.assets ?? rec.assets;
        const bytes =
          isRecord(store) && Object.hasOwn(store, rec.assetPath)
            ? store[rec.assetPath]
            : undefined;
        if (typeof bytes !== "string") return NOT_FOUND;
        if (sha256Hex(bytes) !== rec.indexEntry.gPin.pin.contentDigest) {
          return {
            ok: false,
            code: "substituted-asset",
            reason: "public G asset digest mismatch",
          };
        }
        return {
          ok: true,
          indexEntry: structuredClone(rec.indexEntry),
          envelope: structuredClone(rec.envelope),
          visibility: rec.envelope.ontology.visibility,
          assetPath: rec.assetPath,
          assetBytes: bytes,
        };
      }
      return {
        ok: true,
        indexEntry: structuredClone(rec.indexEntry),
        envelope: structuredClone(rec.envelope),
        visibility: rec.envelope.ontology.visibility,
        tenantReceipt: structuredClone(rec.tenantReceipt),
      };
    },
  };
}
