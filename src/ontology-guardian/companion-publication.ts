import { DATA_GOVERNANCE_FORMAT, sealModelGovernance, type QualifiedPin } from "../model-governance.js";
import { extraKey, isRecord, isTrimmedStr, RESERVED_KEYS } from "../model-schemas.js";
import type { NormalizedOntologyProfile, OntologyProfile } from "../types.js";
import {
  checkAdmission, checkEntrySelections, checkProfilePayloadCoherence, isExactVersion,
  pinListProblem, pinProblem, pinsEqual, projectProfileAdmissionEntry,
  type OwnerSelectionBinding, type QualificationScope,
} from "./admission.js";
import { parseCanonicalJsonObject, sha256Hex, tryCanonicalBytes } from "./canonical.js";
import type { OntologyPayload, PublicRuleSheetRef, RegistryAsset, RegistryEnvelope, RuleSheetRef } from "./catalog.js";
import { entryDigestOf, pinsDigestOf } from "./digests.js";
import {
  assertValidDeltaOperation, isDigest, type DeltaOperation, type Digest, type OntologyRecord,
  type Pin, type PrivateDerivationRef, type RecordDigests, type TenantVisibility,
} from "./types.js";

export const DATA_GOVERNANCE_ASSET_ROLE = "data-governance" as const;

export type ParsedVisibility = { readonly kind: "public" } | { readonly kind: "private"; readonly tenant: string };

export interface TenantVerificationReceipt {
  readonly tenant: string;
  readonly receiptRef: string;
  readonly profilePin: QualifiedPin;
  readonly governancePin: QualifiedPin;
  readonly verdict: "pass" | "fail";
}

export interface CompanionIndexEntry {
  readonly gPin: QualifiedPin;
  readonly companion: { readonly kind: "ontology"; readonly id: string; readonly entryVersion: string };
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
  | { readonly ok: false; readonly code: string; readonly path: string; readonly reason: string };

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
        | "invalid-pin" | "invalid-visibility" | "stale-entry-digest"
        | "digest-mismatch" | "substituted-asset" | "invalid-companion";
      readonly reason: string;
    };

type FailureResult = Extract<CompanionPublishResult, { readonly ok: false }>;
type Pred = (value: unknown) => boolean;
interface ClosedShape {
  readonly keys: Readonly<Record<string, Pred>>;
  readonly required: readonly string[];
  readonly check?: (obj: Record<string, unknown>) => boolean;
}

const QUALIFIED_EXT_KEY_RE = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+(?:\/[a-z0-9][a-z0-9.-]*)?$/;
const PRIVATE_VIS_RE = /^private:([^\s:\x00-\x1f\x7f-\x9f]+)$/;
const CTRL_CHAR_RE = /[\x00-\x1f\x7f-\x9f]/;
const NOT_FOUND: CompanionResolveResult = { ok: false, code: "not-found" };

const fail = (code: string, path: string, reason: string): FailureResult => ({ ok: false, code, path, reason });
const sameQPin = (a: QualifiedPin, b: QualifiedPin): boolean =>
  a.namespace === b.namespace && pinsEqual([a.pin], [b.pin]);
const anyDef: Pred = () => true;
const isBool: Pred = (v) => typeof v === "boolean";
const eq = (lit: string): Pred => (v) => v === lit;
const oneOf = (...vals: readonly string[]): Pred => (v) => typeof v === "string" && vals.includes(v);
const listOf = (pred: Pred, nonEmpty = false): Pred =>
  (v) => Array.isArray(v) && (!nonEmpty || v.length > 0) && v.every(pred);
const all = (keys: readonly string[], pred: Pred): Record<string, Pred> =>
  Object.fromEntries(keys.map((k) => [k, pred]));
const isStrList = listOf(isTrimmedStr);
const isUniqueStrList: Pred = (v) => isStrList(v) && new Set(v as string[]).size === (v as string[]).length;
const okPin: Pred = (v) => pinProblem(v as Pin, "pin") === null;
const okPinList: Pred = (v) => pinListProblem(v, "pins", true) === null;
const isRelPath: Pred = (v) =>
  typeof v === "string" &&
  !v.includes("\\") &&
  !CTRL_CHAR_RE.test(v) &&
  v.split("/").every((seg) => isTrimmedStr(seg) && seg !== "." && seg !== "..");

function closed(
  keys: Readonly<Record<string, Pred>>,
  optional: readonly string[] = [],
  check?: (obj: Record<string, unknown>) => boolean,
): ClosedShape {
  const opt = new Set(optional);
  return { keys, required: Object.keys(keys).filter((k) => !opt.has(k)), check };
}

function matchesShape(value: unknown, shape: ClosedShape): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const allowed = Object.keys(shape.keys);
  if (extraKey(value, ...allowed) !== undefined) return false;
  for (const key of shape.required) {
    if (value[key] === undefined) return false;
  }
  for (const key of allowed) {
    if (value[key] !== undefined && !shape.keys[key]!(value[key])) return false;
  }
  return shape.check ? shape.check(value) : true;
}

const of = (shape: ClosedShape): Pred => (v) => matchesShape(v, shape);
const strDig = (a: string, b: string): Pred => of(closed({ [a]: isTrimmedStr, [b]: isDigest }));

function validLifecycle(obj: Record<string, unknown>, allowDraft: boolean, requireMigration: boolean): boolean {
  const lc = obj.lifecycle;
  const hasDep = obj.deprecatedReason !== undefined || obj.deprecatedAt !== undefined;
  if (lc === "published" || (allowDraft && lc === "draft")) return !hasDep && obj.supersededBy === undefined;
  if (lc === "deprecated") {
    return (
      isTrimmedStr(obj.deprecatedReason) &&
      isTrimmedStr(obj.deprecatedAt) &&
      (obj.supersededBy === undefined || okPin(obj.supersededBy))
    );
  }
  if (lc === "superseded") {
    return !hasDep && okPin(obj.supersededBy) && (!requireMigration || isTrimmedStr(obj.migrationRef));
  }
  return false;
}

const resolvedEvidence = closed({ evidenceState: eq("resolved"), digest: isDigest });
const unresolvedEvidence = closed({ evidenceState: eq("unresolved") });
const resolvedDigests = closed({
  ...all(["contentDigest", "pinsDigest"], isDigest),
  resultEvidence: of(resolvedEvidence),
});
const draftDigests = closed({
  ...all(["contentDigest", "pinsDigest"], isDigest),
  resultEvidence: (v) => matchesShape(v, resolvedEvidence) || matchesShape(v, unresolvedEvidence),
});
const qPin = closed({ namespace: isTrimmedStr, pin: okPin });
const asset = closed({ ...all(["role", "mediaType"], isTrimmedStr), path: isRelPath, sha256: isDigest });
const setting = closed(
  { ...all(["rule", "severity", "classification"], isTrimmedStr), options: isRecord },
  ["classification", "options"],
);
const selRow = closed(all(["ruleId", "severity", "studyDisposition"], isTrimmedStr), ["studyDisposition"]);
const selMeta = closed({
  ...all(["phase", "readinessPolicy"], isTrimmedStr),
  settings: listOf(of(setting)),
  severityPolicyDigest: isDigest,
  rules: listOf(of(selRow)),
});

const DELTA_OP_SHAPES: Readonly<Record<string, ClosedShape>> = {
  add: closed({ op: eq("add"), subject: isTrimmedStr, declaration: anyDef }),
  narrow: closed({ op: eq("narrow"), subject: isTrimmedStr, constraint: anyDef }),
  "deprecate-term": closed({ op: eq("deprecate-term"), ...all(["subject", "reason"], isTrimmedStr) }),
  "rename-with-mapping": closed(
    {
      op: eq("rename-with-mapping"),
      ...all(["subject", "newName"], isTrimmedStr),
      mappingEntry: of(closed({ kind: eq("rename"), ...all(["from", "to"], isTrimmedStr) })),
    },
    [],
    (o) => {
      try {
        assertValidDeltaOperation(o as unknown as DeltaOperation);
        return true;
      } catch {
        return false;
      }
    },
  ),
};
const isDeltaOp: Pred = (v) =>
  isRecord(v) &&
  typeof v.op === "string" &&
  Object.hasOwn(DELTA_OP_SHAPES, v.op) &&
  matchesShape(v, DELTA_OP_SHAPES[v.op]!);

const COMMON_REC_KEYS = {
  ...all(["namespace", "owner"], isTrimmedStr),
  ...all(["lifecycle", "visibility", "lineage", "deprecatedReason", "deprecatedAt", "supersededBy"], anyDef),
  completeness: oneOf("skeleton", "complete"),
  corpusRef: strDig("ref", "digest"),
  consumers: isStrList,
};
const COMMON_REC_OPT = ["visibility", "lineage", "deprecatedReason", "deprecatedAt", "supersededBy"];

const SHAPES = {
  qPin,
  envelope: closed(
    {
      format: eq("sentropic.registry-entry/v1"),
      kind: eq("ontology"),
      ...all(["contractVersion", "entryVersion"], isExactVersion),
      ...all(["id", "name", "description"], isTrimmedStr),
      publisher: of(closed({ packageName: isTrimmedStr, packageVersion: isExactVersion })),
      compatibility: of(
        closed({
          entryContract: isExactVersion,
          packages: listOf(of(closed(all(["name", "range"], isTrimmedStr)))),
          ...all(["schemaProfiles", "requiredHostFeatures", "optionalHostFeatures"], isStrList),
        }),
      ),
      parameters: of(closed({ schemaVersion: isExactVersion, ...all(["schema", "defaults"], isRecord) })),
      bindings: listOf(of(closed({ ...all(["key", "contract"], isTrimmedStr), required: isBool }))),
      assets: (v) =>
        Array.isArray(v) &&
        v.every(of(asset)) &&
        new Set((v as RegistryAsset[]).map((a) => a.path)).size === v.length,
      ontology: isRecord,
      ...all(["extensions", "requiredExtensions"], anyDef),
    },
    ["extensions", "requiredExtensions"],
  ),
  privSheet: closed({ sheetPin: anyDef, ruleIds: isUniqueStrList }),
  pubSheet: closed({ sheetPin: anyDef, ruleIds: isUniqueStrList, selections: listOf(of(selMeta), true) }),
  privLineage: closed(
    {
      parents: okPinList,
      derivationRef: of(closed({ base: okPin, deltaDigest: isDigest, mappingRef: okPin }, ["mappingRef"])),
      ...all(["mappings", "migrations"], isStrList),
    },
    ["derivationRef"],
  ),
  pubLineage: closed(
    {
      parents: okPinList,
      derivation: of(closed({ base: okPin, operations: listOf(isDeltaOp, true), resultingDigests: isRecord })),
      ...all(["mappings", "migrations"], isStrList),
    },
    ["derivation"],
  ),
  ontology: closed(
    {
      ...COMMON_REC_KEYS,
      ...all(["canonicalRef", "domain", "conflictPolicy"], isTrimmedStr),
      ...all(["migrations", "linkedTools"], isStrList),
      ...all(["profileShape", "profilePin", "stack", "digests", "artifactKind", "ruleSheets"], anyDef),
      provenance: of(closed(all(["sourceRef", "sourceRevision"], isTrimmedStr))),
      licenceClosure: of(
        closed({ licences: listOf(oneOf("MIT", "Apache-2.0", "CC0"), true), closureDigest: isDigest }),
      ),
      coverage: strDig("declaredLimits", "coverageDigest"),
      receipts: listOf(isRecord),
      compatibility: of(closed(all(["renderer", "adapter"], isTrimmedStr))),
      artifactBinding: of(
        closed(
          { ...all(["artifactKind", "profilePin", "stack"], anyDef), relationMatrixRef: isTrimmedStr },
          ["relationMatrixRef"],
        ),
      ),
    },
    [
      ...COMMON_REC_OPT, "domain", "profileShape", "profilePin", "stack",
      "licenceClosure", "coverage", "artifactKind", "ruleSheets",
    ],
    (o) =>
      validLifecycle(o, true, false) &&
      matchesShape(o.digests, o.lifecycle === "draft" ? draftDigests : resolvedDigests),
  ),
  profileRecord: closed(
    {
      ...COMMON_REC_KEYS,
      ...all(["id", "migrationRef", "catalogEntryRef"], isTrimmedStr),
      version: isExactVersion,
      profileShape: eq("engram-profile"),
      artifactKind: eq("profile"),
      profileRef: strDig("canonicalRef", "contentDigest"),
      digests: of(resolvedDigests),
    },
    [...COMMON_REC_OPT, "migrationRef", "catalogEntryRef"],
    (r) =>
      validLifecycle(r, false, true) &&
      (r.digests as RecordDigests).contentDigest === (r.profileRef as { contentDigest: Digest }).contentDigest,
  ),
  tenantReceipt: closed({
    ...all(["tenant", "receiptRef"], isTrimmedStr),
    ...all(["profilePin", "governancePin"], of(qPin)),
    verdict: eq("pass"),
  }),
  admission: closed(
    {
      family: oneOf("ENG", "EXT"),
      ...all(["qualificationScope", "ownerSelections"], anyDef),
      requireReference: isBool,
    },
    ["family", "qualificationScope", "ownerSelections", "requireReference"],
  ),
} as const satisfies Record<string, ClosedShape>;

function validateLineage(
  raw: unknown,
  visKind: "public" | "private",
  digests: RecordDigests,
  code: string,
  path: string,
):
  | { readonly ok: true; readonly deriv: "none" | "public" | "private"; readonly ref?: PrivateDerivationRef }
  | FailureResult {
  if (visKind === "private") {
    if (isRecord(raw) && ("derivation" in raw || "operations" in raw)) {
      return fail("private-content-leak", path, "private lineage leak");
    }
    if (!matchesShape(raw, SHAPES.privLineage)) return fail(code, path, "invalid private lineage");
    return raw.derivationRef !== undefined
      ? { ok: true, deriv: "private", ref: raw.derivationRef as PrivateDerivationRef }
      : { ok: true, deriv: "none" };
  }
  if (!matchesShape(raw, SHAPES.pubLineage)) return fail(code, path, "invalid public lineage");
  if (raw.derivation !== undefined) {
    const expected = tryCanonicalBytes(digests);
    const actual = tryCanonicalBytes((raw.derivation as { resultingDigests: unknown }).resultingDigests);
    if (expected === null || actual !== expected) return fail(code, path, "invalid public derivation record");
    return { ok: true, deriv: "public" };
  }
  return { ok: true, deriv: "none" };
}

function validateRuleSheets(
  raw: unknown,
  visKind: "public" | "private",
  ont: Record<string, unknown>,
): FailureResult | null {
  if (!Array.isArray(raw)) return fail("invalid-envelope", "ontology.ruleSheets", "ruleSheets must be an array");
  for (const sheet of raw) {
    if (visKind === "private" && isRecord(sheet) && ("selections" in sheet || "settings" in sheet)) {
      return fail("private-content-leak", "ontology.ruleSheets", "private ruleSheet must not expose selections");
    }
    if (!matchesShape(sheet, visKind === "private" ? SHAPES.privSheet : SHAPES.pubSheet)) {
      return fail("invalid-envelope", "ontology.ruleSheets", "invalid ruleSheet");
    }
  }
  if (pinListProblem(raw.map((s) => (s as Record<string, unknown>).sheetPin), "ruleSheets", true) !== null) {
    return fail("invalid-envelope", "ontology.ruleSheets", "duplicate or non-canonical sheetPin");
  }
  if (visKind === "public" && raw.length > 0) {
    const selections = (raw[0] as PublicRuleSheetRef).selections.map((s) => ({
      phase: s.phase,
      readinessPolicy: s.readinessPolicy,
    }));
    try {
      const projected = projectProfileAdmissionEntry(
        ont as unknown as Extract<OntologyPayload, { readonly artifactKind: "profile" }>,
        {
          family: "ENG",
          qualificationScope: { libraries: [{ id: "rule-sheet-check", version: "1" }], proofSets: [], selections },
        },
      );
      const problem = checkEntrySelections(projected);
      if (problem !== null) return fail("invalid-envelope", "ontology.ruleSheets", problem);
    } catch (error) {
      return fail("invalid-envelope", "ontology.ruleSheets", (error as Error).message);
    }
  }
  return null;
}

function validateEnvelopeV9(
  env: unknown,
): { readonly ok: true; readonly env: Record<string, unknown>; readonly gPin: QualifiedPin } | FailureResult {
  if (!isRecord(env)) return fail("invalid-envelope", "envelope", "envelope must be a plain object");
  if ("entryDigest" in env) return fail("entry-digest-self-embedded", "entryDigest", "entryDigest self-embedded");
  if (!matchesShape(env, SHAPES.envelope)) return fail("invalid-envelope", "envelope", "invalid companion envelope");
  const ext = env.extensions;
  const req = env.requiredExtensions;
  if (
    !isRecord(ext) ||
    !Object.hasOwn(ext, DATA_GOVERNANCE_FORMAT) ||
    !Array.isArray(req) ||
    req.length !== 1 ||
    req[0] !== DATA_GOVERNANCE_FORMAT
  ) {
    return fail("missing-required-extension", "requiredExtensions", "missing required data-governance extension");
  }
  if (!Object.keys(ext).every((k) => QUALIFIED_EXT_KEY_RE.test(k))) {
    return fail("invalid-extension", "extensions", "extension keys must be qualified");
  }
  const gPinVal = ext[DATA_GOVERNANCE_FORMAT];
  if (!matchesShape(gPinVal, SHAPES.qPin)) {
    return fail("invalid-extension", "extensions", "extension value must be an exact QualifiedPin");
  }
  return { ok: true, env, gPin: gPinVal as unknown as QualifiedPin };
}

function validateCompanionPayload(ont: Record<string, unknown>, visKind: "public" | "private"): FailureResult | null {
  if (!matchesShape(ont, SHAPES.ontology)) return fail("invalid-envelope", "ontology", "invalid ontology payload");
  const coherenceErr = checkProfilePayloadCoherence(ont);
  if (coherenceErr !== null) return fail("invalid-envelope", "ontology", coherenceErr);
  const binding = ont.artifactBinding as Record<string, unknown>;
  if ((visKind === "private") !== (binding.relationMatrixRef !== undefined)) {
    return fail("invalid-envelope", "ontology.artifactBinding.relationMatrixRef", "invalid relationMatrixRef");
  }
  const sheetsErr = validateRuleSheets(ont.ruleSheets, visKind, ont);
  if (sheetsErr !== null) return sheetsErr;
  const digests = ont.digests as RecordDigests;
  const lineageRes = validateLineage(ont.lineage, visKind, digests, "invalid-envelope", "ontology.lineage");
  if (!lineageRes.ok) return lineageRes;
  if (lineageRes.deriv !== "public") {
    const layers = ont.stack as readonly Pin[];
    const ruleSheets = (ont.ruleSheets as readonly RuleSheetRef[]).map((s) => s.sheetPin);
    const ref = lineageRes.ref;
    try {
      const expected = pinsDigestOf(
        ref
          ? { layers, ruleSheets, deltaDigest: ref.deltaDigest, mappingDigest: ref.mappingRef?.contentDigest ?? null }
          : { layers, ruleSheets },
      );
      if (digests.pinsDigest !== expected) {
        return fail("invalid-envelope", "ontology.digests.pinsDigest", "pinsDigest mismatch");
      }
    } catch {
      return fail("invalid-envelope", "ontology.digests.pinsDigest", "pinsDigest computation failed");
    }
  }
  return null;
}

function validatePublicGovernance(
  input: CompanionPublishInput,
  govAssets: readonly RegistryAsset[],
  gPinVal: QualifiedPin,
  nQPin: QualifiedPin,
): FailureResult | null {
  if (input.tenantReceipt !== undefined) return fail("invalid-tenant-receipt", "tenantReceipt", "public receipt");
  if (govAssets.length !== 1) {
    return fail(govAssets.length === 0 ? "missing-public-asset" : "duplicate-public-asset", "assets", "need 1 G asset");
  }
  const govAsset = govAssets[0]!;
  if (govAsset.mediaType !== "application/json") return fail("invalid-public-asset", "assets", "bad mediaType");
  if (govAsset.sha256 !== gPinVal.pin.contentDigest) {
    return fail("substituted-public-asset", "assets", "asset sha256 mismatches G pin");
  }
  if (input.profile === undefined) return fail("missing-profile", "profile", "public companion requires N profile");
  const bytes =
    isRecord(input.assets) && Object.hasOwn(input.assets, govAsset.path) ? input.assets[govAsset.path] : undefined;
  if (typeof bytes !== "string") return fail("missing-public-asset", "assets", "missing public G asset bytes");
  if (sha256Hex(bytes) !== gPinVal.pin.contentDigest) {
    return fail("substituted-public-asset", "assets", "public G asset bytes digest mismatch");
  }
  const parsed = parseCanonicalJsonObject(bytes);
  if (!parsed.ok) return fail("substituted-public-asset", "assets", parsed.reason);
  let sealed;
  try {
    sealed = sealModelGovernance(input.profile, parsed.value);
  } catch (error) {
    return fail("invalid-governance", "assets", (error as Error).message);
  }
  if (!sameQPin(sealed.pin, gPinVal) || !sameQPin(parsed.value.profile as QualifiedPin, nQPin)) {
    return fail("substituted-public-asset", "assets", "public asset identity or profile pin mismatch");
  }
  return null;
}

function validatePrivateCompanion(
  input: CompanionPublishInput,
  govAssets: readonly RegistryAsset[],
  visNKind: "public" | "private",
  tenant: string,
  gPinVal: QualifiedPin,
  nQPin: QualifiedPin,
): FailureResult | null {
  if (govAssets.length !== 0) return fail("private-governance-asset", "assets", "private companion omits G asset");
  if (visNKind === "private" && input.profile !== undefined) {
    return fail("private-content-leak", "profile", "private N profile body must not be supplied");
  }
  const r = input.tenantReceipt as unknown;
  if (
    !matchesShape(r, SHAPES.tenantReceipt) ||
    r.tenant !== tenant ||
    !sameQPin(r.profilePin as QualifiedPin, nQPin) ||
    !sameQPin(r.governancePin as QualifiedPin, gPinVal)
  ) {
    return fail("invalid-tenant-receipt", "tenantReceipt", "private companion requires matching passing receipt");
  }
  return null;
}

function validateCompanionAdmission(
  admission: NonNullable<CompanionPublishInput["admission"]>,
  ont: Extract<OntologyPayload, { readonly artifactKind: "profile" }>,
): FailureResult | null {
  if (!matchesShape(admission, SHAPES.admission)) return fail("invalid-input", "admission", "invalid admission");
  try {
    const entry = projectProfileAdmissionEntry(ont, {
      family: admission.family ?? "ENG",
      qualificationScope: admission.qualificationScope,
      ...(admission.ownerSelections !== undefined ? { ownerSelections: admission.ownerSelections } : {}),
    });
    const verdict = checkAdmission({ entry, receipts: ont.receipts, requireReference: admission.requireReference });
    return verdict.admitted ? null : fail(verdict.code, "ontology.receipts", verdict.reason);
  } catch (error) {
    return fail("missing-receipt", "ontology.receipts", (error as Error).message);
  }
}

export function parseVisibility(value: unknown): ParsedVisibility | null {
  if (value === "public") return { kind: "public" };
  if (typeof value !== "string") return null;
  const match = PRIVATE_VIS_RE.exec(value);
  return match && !RESERVED_KEYS.has(match[1]!) ? { kind: "private", tenant: match[1]! } : null;
}

export function checkVisibilityPair(
  nVis: unknown,
  companionVis: unknown,
):
  | { readonly ok: true; readonly n: ParsedVisibility; readonly companion: ParsedVisibility }
  | { readonly ok: false; readonly path: string; readonly reason: string } {
  const n = parseVisibility(nVis);
  if (!n) return { ok: false, path: "profileRecord.visibility", reason: "unknown or absent N visibility" };
  const c = parseVisibility(companionVis);
  if (!c) return { ok: false, path: "ontology.visibility", reason: "unknown or absent companion visibility" };
  if (n.kind === "private" && (c.kind !== "private" || c.tenant !== n.tenant)) {
    return { ok: false, path: "ontology.visibility", reason: "private N requires same private:<tenant> companion" };
  }
  return { ok: true, n, companion: c };
}

function validateCompanionPublicationImpl(input: CompanionPublishInput): CompanionPublishResult {
  if (!isRecord(input)) return fail("invalid-input", "input", "publication input must be a plain object");
  const envCheck = validateEnvelopeV9(input.envelope as unknown);
  if (!envCheck.ok) return envCheck;
  const { env, gPin: gPinVal } = envCheck;
  const ont = env.ontology as Record<string, unknown>;
  const nRec = input.profileRecord as unknown;
  if (!isRecord(nRec)) return fail("invalid-profile-record", "profileRecord", "profileRecord must be a plain object");
  const vis = checkVisibilityPair(nRec.visibility, ont.visibility);
  if (!vis.ok) return fail("invalid-visibility", vis.path, vis.reason);
  const payloadErr = validateCompanionPayload(ont, vis.companion.kind);
  if (payloadErr !== null) return payloadErr;
  if (!matchesShape(nRec, SHAPES.profileRecord)) {
    return fail("invalid-profile-record", "profileRecord", "invalid N publication record");
  }
  const nLineage = validateLineage(
    nRec.lineage,
    vis.n.kind,
    nRec.digests as RecordDigests,
    "invalid-profile-record",
    "profileRecord.lineage",
  );
  if (!nLineage.ok) return nLineage;
  const profilePin = ont.profilePin as Pin;
  const nRef = nRec.profileRef as { readonly contentDigest: Digest };
  if (
    ont.namespace !== nRec.namespace ||
    profilePin.id !== nRec.id ||
    profilePin.version !== nRec.version ||
    profilePin.contentDigest !== nRef.contentDigest
  ) {
    return fail("pin-mismatch", "ontology.profilePin", "companion N pin disagrees with N publication record");
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
  const govAssets = (env.assets as readonly RegistryAsset[]).filter((a) => a.role === DATA_GOVERNANCE_ASSET_ROLE);
  const nQPin: QualifiedPin = { namespace: ont.namespace as string, pin: profilePin };
  const tierErr =
    vis.companion.kind === "public"
      ? validatePublicGovernance(input, govAssets, gPinVal, nQPin)
      : validatePrivateCompanion(input, govAssets, vis.n.kind, vis.companion.tenant, gPinVal, nQPin);
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
      gPin: gPinVal,
      companion: { kind: "ontology", id: env.id as string, entryVersion: env.entryVersion as string },
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

type StoredCompanion = {
  readonly indexEntry: CompanionIndexEntry;
  readonly envelope: Extract<RegistryEnvelope, { readonly kind: "ontology" }>;
} & (
  | { readonly kind: "public"; readonly assetPath: string; readonly assets: Readonly<Record<string, string>> }
  | { readonly kind: "private"; readonly tenant: string; readonly tenantReceipt: TenantVerificationReceipt }
);

function cloneCanonical<T>(value: unknown): T | undefined {
  const bytes = tryCanonicalBytes(value);
  return bytes === null ? undefined : (JSON.parse(bytes) as T);
}

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
        if (!isRecord(input)) return fail("invalid-input", "input", "publication input must be a plain object");
        const rawEnv = input.envelope as unknown;
        envCopy = cloneCanonical(rawEnv);
        const rawProfileRecord = input.profileRecord;
        const rawAssets = input.assets as unknown;
        if (isRecord(rawAssets)) {
          assetsCopy = Object.assign(
            Object.create(null),
            Object.fromEntries(Object.entries(rawAssets).filter(([, v]) => typeof v === "string")),
          );
        }
        const rawProfile = input.profile;
        const rawReceipt = input.tenantReceipt as unknown;
        if (isRecord(rawReceipt)) receiptCopy = cloneCanonical(rawReceipt);
        snapshot = {
          envelope: (envCopy ?? rawEnv) as RegistryEnvelope,
          profileRecord: rawProfileRecord,
          assets: (assetsCopy ?? rawAssets) as Readonly<Record<string, string>> | undefined,
          profile: rawProfile,
          tenantReceipt: (receiptCopy ?? rawReceipt) as TenantVerificationReceipt | undefined,
          expectedEntryDigest: input.expectedEntryDigest,
          admission: input.admission,
        };
      } catch (error) {
        return fail("invalid-input", "input", (error as Error).message);
      }
      const res = validateCompanionPublication(snapshot);
      if (!res.ok) return res;
      if (envCopy === undefined) return fail("invalid-envelope", "envelope", "envelope is not canonical JSON");
      const { gPin: gPinVal, companion } = res.indexEntry;
      const gKey = JSON.stringify([gPinVal.namespace, gPinVal.pin.id, gPinVal.pin.version]);
      const catKey = JSON.stringify([companion.kind, companion.id, companion.entryVersion]);
      const sKey = JSON.stringify([gPinVal.namespace, gPinVal.pin.id]);
      if (byG.has(gKey)) return fail("reused-governance-identity", "extensions", "reused G identity");
      if (byCat.has(catKey) || bySeries.get(sKey)?.has(companion.entryVersion)) {
        return fail("reused-entry-version", "entryVersion", "G revision requires a new entryVersion");
      }
      const parsedVis = parseVisibility(res.visibility)!;
      if (parsedVis.kind === "private" && receiptCopy === undefined) {
        return fail("invalid-tenant-receipt", "tenantReceipt", "tenantReceipt is not canonical JSON");
      }
      const indexEntry = structuredClone(res.indexEntry);
      const assetPath =
        parsedVis.kind === "public" ? envCopy.assets.find((a) => a.role === DATA_GOVERNANCE_ASSET_ROLE)!.path : "";
      const stored: StoredCompanion =
        parsedVis.kind === "public"
          ? {
              kind: "public",
              indexEntry,
              envelope: envCopy,
              assetPath,
              assets: { [assetPath]: assetsCopy![assetPath]! },
            }
          : { kind: "private", tenant: parsedVis.tenant, indexEntry, envelope: envCopy, tenantReceipt: receiptCopy! };
      byG.set(gKey, stored);
      byCat.set(catKey, gKey);
      bySeries.set(sKey, (bySeries.get(sKey) ?? new Set()).add(companion.entryVersion));
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
        return { ok: false, code: "invalid-pin", reason: "exact (namespace, id, version) required" };
      }
      const rec = byG.get(JSON.stringify([query.namespace, query.id, query.version]));
      if (!rec || (rec.kind === "private" && query.viewerTenant !== rec.tenant)) return NOT_FOUND;
      if (query.expectedEntryDigest !== undefined && query.expectedEntryDigest !== rec.indexEntry.entryDigest) {
        return { ok: false, code: "stale-entry-digest", reason: "P-ENTRY digest mismatch" };
      }
      if (
        query.expectedGovernanceDigest !== undefined &&
        query.expectedGovernanceDigest !== rec.indexEntry.gPin.pin.contentDigest
      ) {
        return { ok: false, code: "digest-mismatch", reason: "G digest mismatch" };
      }
      const base = {
        ok: true as const,
        indexEntry: structuredClone(rec.indexEntry),
        envelope: structuredClone(rec.envelope),
        visibility: rec.envelope.ontology.visibility,
      };
      if (rec.kind === "public") {
        const store = opts?.assets ?? rec.assets;
        const bytes = isRecord(store) && Object.hasOwn(store, rec.assetPath) ? store[rec.assetPath] : undefined;
        if (typeof bytes !== "string") return NOT_FOUND;
        if (sha256Hex(bytes) !== rec.indexEntry.gPin.pin.contentDigest) {
          return { ok: false, code: "substituted-asset", reason: "public G asset digest mismatch" };
        }
        return { ...base, assetPath: rec.assetPath, assetBytes: bytes };
      }
      return { ...base, tenantReceipt: structuredClone(rec.tenantReceipt) };
    },
  };
}
