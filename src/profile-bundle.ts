import { createHash } from "node:crypto";
import { canonicalBytes, digestOfPreimage, sha256Hex } from "./ontology-guardian/canonical.js";
import { stableForHash } from "./ontology-guardian/digests.js";
import { isDigest, type Digest } from "./ontology-guardian/types.js";
import { normalizeOntologyProfile, parseOntologyProfile, validateOntologyProfile } from "./ontology-profile.js";
import type {
  NormalizedOntologyProfile,
  NormalizedOntologyRegistrySpec,
  OntologyProfile,
  RegistryRecord,
} from "./types.js";
import { toJsonValue, type JsonValue } from "./json-value.js";

export const PROFILE_BUNDLE_SCHEMA_V1 = "engram.profile-bundle/v1" as const;

export interface ProfileBundleIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface BundledRegistrySnapshotV1 {
  readonly registryId: string;
  readonly binding: Omit<NormalizedOntologyRegistrySpec, "bound_source_path">;
  readonly recordCount: number | null;
  readonly recordsDigest: Digest | null;
}

export interface ProfileBundleV1 {
  readonly schema: typeof PROFILE_BUNDLE_SCHEMA_V1;
  readonly digest: Digest;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly profileHash: string;
  readonly profile: NormalizedOntologyProfile;
  readonly documentProjection: JsonValue;
  readonly extensions: Readonly<Record<string, unknown>>;
  readonly registries: Readonly<Record<string, BundledRegistrySnapshotV1>>;
  readonly registriesMode: "full" | "bindings-only";
}

export type BundleProfileResult =
  | {
      readonly ok: true;
      readonly bundle: ProfileBundleV1;
      readonly warnings: readonly ProfileBundleIssue[];
    }
  | {
      readonly ok: false;
      readonly status: "refused";
      readonly refusalCode:
        | "invalid_profile_syntax"
        | "invalid_profile_schema"
        | "invalid_registry_data"
        | "unsupported_linking_fn";
      readonly errors: readonly ProfileBundleIssue[];
      readonly warnings: readonly ProfileBundleIssue[];
    };

export interface ProfileBreakingChange {
  readonly code: string;
  readonly path: string;
  readonly subject: string;
  readonly message: string;
  readonly before: string | null;
  readonly after: string | null;
  readonly annotations?: readonly ("covered_by_alias" | "covered_by_synonym")[];
}

export interface ProfileNonBreakingChange {
  readonly code: string;
  readonly path: string;
  readonly subject: string;
  readonly message: string;
  readonly before: string | null;
  readonly after: string | null;
}

export interface ProfileCompatibilityResult {
  readonly ok: boolean;
  readonly compatible: boolean;
  readonly oldDigest: Digest | null;
  readonly newDigest: Digest | null;
  readonly breaking: readonly ProfileBreakingChange[];
  readonly nonBreaking: readonly ProfileNonBreakingChange[];
  readonly validationIssues: readonly ProfileBundleIssue[];
}

export interface ProfileCompatibilityOptions {
  readonly classifyExtensionChange?: (change: {
    readonly path: string;
    readonly before: unknown;
    readonly after: unknown;
  }) => "breaking" | "non-breaking";
  readonly classifyModeledFieldChange?: (change: {
    readonly path: string;
    readonly before: unknown;
    readonly after: unknown;
  }) => "breaking" | "non-breaking";
}

export type ProfileComparableInput = string | OntologyProfile | ProfileBundleV1;

const CONSUMED_KEYS = new Set([
  "id", "version", "default_language", "sourcePath", "profile_hash",
  "node_types", "relation_types", "registries", "citation_policy",
  "hardening", "inference_policy", "evidence_policy", "hierarchies",
  "class_hierarchies", "outputs",
]);
const MODELED_NODE_KEYS = new Set([
  "aliases", "registry", "source_backed", "status_policy", "linking",
  "visual_encoding", "properties", "id_prefix", "definition",
]);
const MODELED_REL_KEYS = new Set([
  "source", "target", "source_types", "target_types", "requires_evidence",
  "assertion_basis", "derivation_method", "derivation_methods", "description",
]);
const GRAN_RANK: Record<string, number> = { file: 0, page: 1, section: 2, paragraph: 3 };

function isPlainObj(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function asRec(v: unknown): Record<string, unknown> {
  return isPlainObj(v) ? v : {};
}

function asStrArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return typeof v === "string" && v.trim().length > 0 ? [v] : [];
}

function setProp<T extends object>(obj: T, key: string, value: unknown): void {
  Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (desc && "value" in desc) deepFreeze(desc.value, seen);
  }
  return Object.freeze(value);
}

function findProtoPaths(value: JsonValue, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((el, i) => findProtoPaths(el, `${path}[${i}]`));
  }
  if (typeof value === "object" && value !== null) {
    const out: string[] = [];
    for (const k of Object.keys(value).sort()) {
      const p = path ? `${path}.${k}` : k;
      if (k === "__proto__") out.push(p);
      out.push(...findProtoPaths((value as Record<string, JsonValue>)[k]!, p));
    }
    return out;
  }
  return [];
}

function cmpCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function computeBundleDigest(
  docProjection: JsonValue,
  registries: Readonly<Record<string, BundledRegistrySnapshotV1>>,
  registriesMode: "full" | "bindings-only",
): Digest | null {
  const regPre: Record<string, unknown> = {};
  for (const [id, snap] of Object.entries(registries)) {
    const bProj = toJsonValue(snap.binding);
    if (!bProj.ok) return null;
    setProp(regPre, id, {
      binding: bProj.value,
      recordCount: snap.recordCount,
      recordsDigest: registriesMode === "bindings-only" ? "not_bundled" : snap.recordsDigest,
    });
  }
  return digestOfPreimage({
    schema: PROFILE_BUNDLE_SCHEMA_V1,
    document: docProjection,
    registries: regPre,
    registriesMode,
  });
}

export function computeRegistryRecordsDigest(records: readonly RegistryRecord[]): Digest | null {
  if (!Array.isArray(records)) return null;
  const items: { id: string; part: string; projected: JsonValue }[] = [];
  for (const rec of records) {
    if (
      !isPlainObj(rec) ||
      typeof rec.id !== "string" ||
      typeof rec.label !== "string" ||
      !Array.isArray(rec.aliases) ||
      !rec.aliases.every((a) => typeof a === "string") ||
      (rec.partition !== undefined && typeof rec.partition !== "string") ||
      !isPlainObj(rec.raw)
    ) {
      return null;
    }
    const proj = toJsonValue({
      id: rec.id,
      label: rec.label,
      aliases: rec.aliases,
      partition: rec.partition ?? null,
      raw: rec.raw,
    });
    if (!proj.ok) return null;
    items.push({ id: rec.id, part: rec.partition ?? "", projected: proj.value });
  }
  items.sort((a, b) => cmpCodeUnit(a.id, b.id) || cmpCodeUnit(a.part, b.part));
  for (let i = 1; i < items.length; i++) {
    if (items[i]!.id === items[i - 1]!.id && items[i]!.part === items[i - 1]!.part) return null;
  }
  const hash = createHash("sha256");
  for (const item of items) {
    hash.update(canonicalBytes(item.projected), "utf8");
    hash.update("\n", "utf8");
  }
  return hash.digest("hex");
}

interface InternalBundleOutcome {
  readonly result: BundleProfileResult;
  readonly parsedDoc?: Record<string, JsonValue>;
  readonly eligibleForStructuralRemoval?: boolean;
}

function bundleProfileInternal(
  profileInput: string | OntologyProfile,
  registriesInput?: Readonly<Record<string, readonly RegistryRecord[]>>,
): InternalBundleOutcome {
  let parsed: unknown;
  if (typeof profileInput === "string") {
    try {
      parsed = parseOntologyProfile(profileInput);
    } catch (err) {
      return {
        result: deepFreeze({
          ok: false,
          status: "refused",
          refusalCode: "invalid_profile_syntax",
          errors: [{
            severity: "error",
            code: "invalid_profile_syntax",
            path: "profile",
            message: err instanceof Error ? err.message : String(err),
          }],
          warnings: [],
        }),
      };
    }
  } else {
    parsed = profileInput;
  }

  const proj = toJsonValue(parsed);
  if (!proj.ok || !isPlainObj(proj.value)) {
    const p = proj.ok ? "profile" : proj.path || "profile";
    const reason = proj.ok ? "non_plain_object" : proj.reason;
    return {
      result: deepFreeze({
        ok: false,
        status: "refused",
        refusalCode: "invalid_profile_schema",
        errors: [{ severity: "error", code: "invalid_profile_schema", path: p, message: `profile projection failed at ${p}: ${reason}` }],
        warnings: [],
      }),
    };
  }

  const protoPaths = findProtoPaths(proj.value);
  if (protoPaths.length > 0) {
    return {
      result: deepFreeze({
        ok: false,
        status: "refused",
        refusalCode: "invalid_profile_schema",
        errors: protoPaths.map((p) => ({
          severity: "error",
          code: "invalid_profile_schema",
          path: p,
          message: `Forbidden __proto__ key at ${p}`,
        })),
        warnings: [],
      }),
    };
  }

  const docProj = toJsonValue(stableForHash(parsed));
  if (!docProj.ok || !isPlainObj(docProj.value)) {
    const p = docProj.ok ? "profile" : docProj.path || "profile";
    const reason = docProj.ok ? "non_plain_object" : docProj.reason;
    return {
      result: deepFreeze({
        ok: false,
        status: "refused",
        refusalCode: "invalid_profile_schema",
        errors: [{ severity: "error", code: "invalid_profile_schema", path: p, message: `profile projection failed at ${p}: ${reason}` }],
        warnings: [],
      }),
    };
  }

  const parsedDoc = proj.value as Record<string, JsonValue>;
  const nodeTypesProj = asRec(parsedDoc.node_types);
  const fnIssues: ProfileBundleIssue[] = [];
  for (const id of Object.keys(nodeTypesProj).sort()) {
    const fn = asRec(asRec(asRec(nodeTypesProj[id]).linking).normalize).fn;
    if (typeof fn === "string") {
      fnIssues.push({
        severity: "error",
        code: "unsupported_linking_fn",
        path: `node_types.${id}.linking.normalize.fn`,
        message: `linking.normalize.fn is not supported in profile bundles`,
      });
    }
  }
  if (fnIssues.length > 0) {
    return {
      result: deepFreeze({
        ok: false,
        status: "refused",
        refusalCode: "unsupported_linking_fn",
        errors: fnIssues,
        warnings: [],
      }),
    };
  }

  let valErrors: string[];
  try {
    valErrors = validateOntologyProfile(parsedDoc as unknown as OntologyProfile);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    return {
      parsedDoc,
      eligibleForStructuralRemoval: true,
      result: deepFreeze({
        ok: false,
        status: "refused",
        refusalCode: "invalid_profile_schema",
        errors: rawMsg.split("\n").map((line) => {
          const token = line.replace(/^\s*-\s*/, "").trim().split(" ")[0] ?? "";
          return {
            severity: "error",
            code: "invalid_profile_schema",
            path: token.includes(".") ? token : "profile",
            message: line,
          };
        }),
        warnings: [],
      }),
    };
  }
  if (valErrors.length > 0) {
    return {
      parsedDoc,
      eligibleForStructuralRemoval: true,
      result: deepFreeze({
        ok: false,
        status: "refused",
        refusalCode: "invalid_profile_schema",
        errors: valErrors.map((msg) => {
          const sp = msg.indexOf(" ");
          return {
            severity: "error",
            code: "invalid_profile_schema",
            path: sp === -1 ? msg : msg.slice(0, sp),
            message: msg,
          };
        }),
        warnings: [],
      }),
    };
  }

  let rawNormalized: NormalizedOntologyProfile;
  try {
    rawNormalized = normalizeOntologyProfile(parsedDoc as unknown as OntologyProfile);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    return {
      parsedDoc,
      eligibleForStructuralRemoval: true,
      result: deepFreeze({
        ok: false,
        status: "refused",
        refusalCode: "invalid_profile_schema",
        errors: rawMsg.split("\n").map((line) => {
          const token = line.replace(/^\s*-\s*/, "").trim().split(" ")[0] ?? "";
          return {
            severity: "error",
            code: "invalid_profile_schema",
            path: token.includes(".") ? token : "profile",
            message: line,
          };
        }),
        warnings: [],
      }),
    };
  }

  const normProj = toJsonValue(rawNormalized);
  if (!normProj.ok || !isPlainObj(normProj.value)) {
    const p = normProj.ok ? "profile" : normProj.path || "profile";
    const reason = normProj.ok ? "non_plain_object" : normProj.reason;
    return {
      parsedDoc,
      eligibleForStructuralRemoval: true,
      result: deepFreeze({
        ok: false,
        status: "refused",
        refusalCode: "invalid_profile_schema",
        errors: [{ severity: "error", code: "invalid_profile_schema", path: p, message: `profile projection failed at ${p}: ${reason}` }],
        warnings: [],
      }),
    };
  }
  const normalized = normProj.value as unknown as NormalizedOntologyProfile;

  const registriesMode = registriesInput === undefined ? "bindings-only" : "full";
  const declaredIds = Object.keys(normalized.registries).sort();
  const snapshots: Record<string, BundledRegistrySnapshotV1> = {};

  if (registriesMode === "bindings-only") {
    for (const regId of declaredIds) {
      const { bound_source_path: _bsp, ...binding } = normalized.registries[regId]!;
      setProp(snapshots, regId, { registryId: regId, binding, recordCount: null, recordsDigest: null });
    }
  } else {
    if (!isPlainObj(registriesInput)) {
      return {
        result: deepFreeze({
          ok: false,
          status: "refused",
          refusalCode: "invalid_registry_data",
          errors: [{ severity: "error", code: "invalid_registry_data", path: "registries", message: "registriesInput must be a plain object" }],
          warnings: [],
        }),
      };
    }
    const regErrors: ProfileBundleIssue[] = [];
    for (const regId of declaredIds) {
      if (!Object.prototype.hasOwnProperty.call(registriesInput, regId) || !Array.isArray(registriesInput[regId])) {
        regErrors.push({ severity: "error", code: "invalid_registry_data", path: `registries.${regId}`, message: `Missing records for declared registry ${regId}` });
      }
    }
    for (const supId of Object.keys(registriesInput).sort()) {
      if (!Object.prototype.hasOwnProperty.call(normalized.registries, supId)) {
        regErrors.push({ severity: "error", code: "invalid_registry_data", path: `registries.${supId}`, message: `Undeclared registry ${supId}` });
      }
    }
    if (regErrors.length > 0) {
      return {
        result: deepFreeze({ ok: false, status: "refused", refusalCode: "invalid_registry_data", errors: regErrors, warnings: [] }),
      };
    }

    for (const regId of declaredIds) {
      const { bound_source_path: _bsp, ...binding } = normalized.registries[regId]!;
      const records = registriesInput[regId]!;
      const seenKeys = new Set<string>();
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const basePath = `registries.${regId}.records[${i}]`;
        if (!isPlainObj(r)) {
          regErrors.push({ severity: "error", code: "invalid_registry_data", path: basePath, message: "Invalid record object" });
          continue;
        }
        if (r.registryId !== regId) {
          regErrors.push({ severity: "error", code: "invalid_registry_data", path: `${basePath}.registryId`, message: `Expected registryId ${regId}` });
        }
        if (r.nodeType !== binding.node_type) {
          regErrors.push({ severity: "error", code: "invalid_registry_data", path: `${basePath}.nodeType`, message: `Expected nodeType ${binding.node_type}` });
        }
        const rProj = toJsonValue({
          id: r.id,
          label: r.label,
          aliases: r.aliases,
          partition: r.partition ?? null,
          raw: r.raw,
        });
        if (!rProj.ok) {
          const sub = rProj.path ? `.${rProj.path}` : "";
          regErrors.push({ severity: "error", code: "invalid_registry_data", path: `${basePath}${sub}`, message: `Record projection failed: ${rProj.reason}` });
          continue;
        }
        if (typeof r.id !== "string" || typeof r.label !== "string" || !Array.isArray(r.aliases) || !isPlainObj(r.raw)) {
          regErrors.push({ severity: "error", code: "invalid_registry_data", path: basePath, message: "Malformed record fields" });
          continue;
        }
        const dupKey = `${r.id}\0${r.partition ?? ""}`;
        if (seenKeys.has(dupKey)) {
          regErrors.push({ severity: "error", code: "invalid_registry_data", path: `${basePath}.id`, message: `Duplicate record (${r.id}, ${r.partition ?? ""})` });
        }
        seenKeys.add(dupKey);
      }
      if (regErrors.length === 0) {
        const digest = computeRegistryRecordsDigest(records);
        if (!digest) {
          regErrors.push({ severity: "error", code: "invalid_registry_data", path: `registries.${regId}`, message: "Failed to compute registry digest" });
        } else {
          setProp(snapshots, regId, { registryId: regId, binding, recordCount: records.length, recordsDigest: digest });
        }
      }
    }
    if (regErrors.length > 0) {
      return {
        result: deepFreeze({ ok: false, status: "refused", refusalCode: "invalid_registry_data", errors: regErrors, warnings: [] }),
      };
    }
  }

  const extensions: Record<string, unknown> = {};
  for (const k of Object.keys(parsedDoc)) {
    if (!CONSUMED_KEYS.has(k)) setProp(extensions, k, parsedDoc[k]);
  }

  const digest = computeBundleDigest(docProj.value, snapshots, registriesMode);
  if (!digest) {
    return {
      parsedDoc,
      result: deepFreeze({
        ok: false,
        status: "refused",
        refusalCode: "invalid_profile_schema",
        errors: [{ severity: "error", code: "invalid_profile_schema", path: "registries", message: "Failed to project registry bindings" }],
        warnings: [],
      }),
    };
  }
  const bundle: ProfileBundleV1 = {
    schema: PROFILE_BUNDLE_SCHEMA_V1,
    digest,
    profileId: normalized.id,
    profileVersion: normalized.version,
    profileHash: normalized.profile_hash,
    profile: normalized,
    documentProjection: docProj.value,
    extensions,
    registries: snapshots,
    registriesMode,
  };

  return {
    parsedDoc,
    result: deepFreeze({ ok: true, bundle, warnings: [] }),
  };
}

export function bundleProfile(
  profileInput: string | OntologyProfile,
  registriesInput?: Readonly<Record<string, readonly RegistryRecord[]>>,
): BundleProfileResult {
  return bundleProfileInternal(profileInput, registriesInput).result;
}

function renderCanon(v: unknown): string | null {
  if (v === undefined) return null;
  const p = toJsonValue(v);
  return p.ok ? canonicalBytes(p.value) : canonicalBytes(`unprojectable:${p.reason}`);
}

function renderTrunc(s: string | null): string | null {
  if (s === null) return null;
  return s.length <= 512 ? s : `sha256:${sha256Hex(s)}`;
}

function isStringMap(v: unknown): v is Record<string, string> {
  return isPlainObj(v) && Object.values(v).every((x) => typeof x === "string");
}

function isStrArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isValidRegistryBinding(b: unknown, allowBoundSourcePath = false): b is BundledRegistrySnapshotV1["binding"] {
  if (!isPlainObj(b)) return false;
  if (Object.values(b).some((v) => v === undefined)) return false;
  return (
    typeof b.source === "string" &&
    typeof b.id_column === "string" &&
    typeof b.label_column === "string" &&
    typeof b.node_type === "string" &&
    isStrArray(b.alias_columns) &&
    (b.partition_column === undefined || typeof b.partition_column === "string") &&
    (allowBoundSourcePath ? b.bound_source_path === undefined || typeof b.bound_source_path === "string" : !Object.prototype.hasOwnProperty.call(b, "bound_source_path")) &&
    toJsonValue(b).ok
  );
}

function isValidNormalizedProfile(p: unknown): p is NormalizedOntologyProfile {
  if (!isPlainObj(p)) return false;
  const cit = asRec(p.citation_policy), hard = asRec(p.hardening), inf = asRec(p.inference_policy), ev = asRec(p.evidence_policy);
  const out = asRec(asRec(p.outputs).ontology), wiki = asRec(out.wiki);
  if (
    typeof p.id !== "string" ||
    typeof p.version !== "string" ||
    typeof p.default_language !== "string" ||
    typeof p.profile_hash !== "string" ||
    (p.sourcePath !== undefined && typeof p.sourcePath !== "string") ||
    !isPlainObj(p.node_types) ||
    !isPlainObj(p.relation_types) ||
    !isPlainObj(p.registries) ||
    !isPlainObj(p.citation_policy) ||
    typeof cit.minimum_granularity !== "string" ||
    !Object.prototype.hasOwnProperty.call(GRAN_RANK, cit.minimum_granularity) ||
    typeof cit.require_source_file !== "boolean" ||
    (cit.allow_bbox !== true && cit.allow_bbox !== false && cit.allow_bbox !== "when_available") ||
    !isPlainObj(p.hardening) ||
    !isStrArray(hard.statuses) ||
    typeof hard.default_status !== "string" ||
    !isStrArray(hard.promotion_requires) ||
    !Array.isArray(hard.status_transitions) ||
    !isPlainObj(p.inference_policy) ||
    typeof inf.allow_inferred_relations !== "boolean" ||
    !isStrArray(inf.allowed_relation_types) ||
    typeof inf.require_evidence_refs !== "boolean" ||
    !isPlainObj(p.evidence_policy) ||
    typeof ev.require_evidence_refs !== "boolean" ||
    typeof ev.min_refs !== "number" ||
    !Number.isFinite(ev.min_refs) ||
    !isStrArray(ev.node_types) ||
    !isStrArray(ev.relation_types) ||
    !isPlainObj(p.hierarchies) ||
    (p.class_hierarchies !== undefined && !isPlainObj(p.class_hierarchies)) ||
    !isPlainObj(p.outputs) ||
    !isPlainObj(p.outputs.ontology) ||
    typeof out.enabled !== "boolean" ||
    (out.artifact_schema !== undefined && typeof out.artifact_schema !== "string") ||
    !isStrArray(out.canonical_node_types) ||
    !isStrArray(out.source_node_types) ||
    (out.occurrence_node_types !== undefined && !isStrArray(out.occurrence_node_types)) ||
    (out.alias_fields !== undefined && !isStrArray(out.alias_fields)) ||
    !isStrArray(out.relation_exports) ||
    !isPlainObj(out.wiki) ||
    typeof wiki.enabled !== "boolean" ||
    !isStrArray(wiki.page_node_types) ||
    typeof wiki.include_backlinks !== "boolean" ||
    typeof wiki.include_source_snippets !== "boolean"
  ) {
    return false;
  }
  for (const nt of Object.values(p.node_types)) {
    if (
      !isPlainObj(nt) ||
      (nt.aliases !== undefined && !isStrArray(nt.aliases)) ||
      (nt.registry !== undefined && typeof nt.registry !== "string") ||
      (nt.status_policy !== undefined && typeof nt.status_policy !== "string") ||
      (nt.source_backed !== undefined && typeof nt.source_backed !== "boolean")
    ) {
      return false;
    }
  }
  for (const rt of Object.values(p.relation_types)) {
    if (
      !isPlainObj(rt) ||
      !isStrArray(rt.source_types) ||
      !isStrArray(rt.target_types) ||
      typeof rt.requires_evidence !== "boolean" ||
      !isStrArray(rt.assertion_basis) ||
      !isStrArray(rt.derivation_methods)
    ) {
      return false;
    }
  }
  for (const reg of Object.values(p.registries)) {
    if (!isValidRegistryBinding(reg, true)) return false;
  }
  for (const tr of hard.status_transitions) {
    if (!isPlainObj(tr) || !isStrArray(tr.from_statuses) || !isStrArray(tr.to_statuses) || !isStrArray(tr.requires)) {
      return false;
    }
  }
  for (const h of Object.values(p.hierarchies)) {
    if (
      !isPlainObj(h) ||
      typeof h.registry !== "string" ||
      typeof h.parent_column !== "string" ||
      typeof h.child_column !== "string" ||
      typeof h.relation_type !== "string" ||
      typeof h.parent_node_type !== "string" ||
      typeof h.child_node_type !== "string"
    ) {
      return false;
    }
  }
  return true;
}

function resolveComparableSide(input: ProfileComparableInput): {
  readonly bundle: ProfileBundleV1 | null;
  readonly parsedDoc?: Record<string, JsonValue>;
  readonly eligibleForStructuralRemoval?: boolean;
  readonly issues: readonly ProfileBundleIssue[];
} {
  if (isPlainObj(input) && input.schema === PROFILE_BUNDLE_SCHEMA_V1) {
    const b = input as unknown as ProfileBundleV1;
    const docProj = isPlainObj(b.documentProjection) ? toJsonValue(b.documentProjection) : null;
    const validBasic =
      isDigest(b.digest) &&
      typeof b.profileId === "string" &&
      typeof b.profileVersion === "string" &&
      typeof b.profileHash === "string" &&
      isValidNormalizedProfile(b.profile) &&
      isPlainObj(b.extensions) &&
      isPlainObj(b.registries) &&
      (b.registriesMode === "full" || b.registriesMode === "bindings-only") &&
      docProj !== null &&
      docProj.ok &&
      isPlainObj(docProj.value) &&
      findProtoPaths(docProj.value).length === 0;
    if (validBasic) {
      let regsOk = true;
      const projectedRegistries: Record<string, BundledRegistrySnapshotV1> = {};
      for (const [id, snap] of Object.entries(b.registries)) {
        if (
          !isPlainObj(snap) ||
          snap.registryId !== id ||
          !isValidRegistryBinding(snap.binding, false) ||
          (b.registriesMode === "bindings-only"
            ? snap.recordCount !== null || snap.recordsDigest !== null
            : typeof snap.recordCount !== "number" || !Number.isInteger(snap.recordCount) || snap.recordCount < 0 || !isDigest(snap.recordsDigest))
        ) {
          regsOk = false;
          break;
        }
        const bProj = toJsonValue(snap.binding);
        if (!bProj.ok) {
          regsOk = false;
          break;
        }
        setProp(projectedRegistries, id, {
          registryId: id,
          binding: bProj.value as unknown as BundledRegistrySnapshotV1["binding"],
          recordCount: snap.recordCount,
          recordsDigest: snap.recordsDigest,
        });
      }
      if (regsOk && computeBundleDigest(docProj.value, projectedRegistries, b.registriesMode) === b.digest) {
        const rederived = bundleProfileInternal(docProj.value as unknown as OntologyProfile);
        if (rederived.result.ok) {
          const rb = rederived.result.bundle;
          const bProfProj = toJsonValue(stableForHash(b.profile));
          const rbProfProj = toJsonValue(stableForHash(rb.profile));
          const bExtProj = toJsonValue(stableForHash(b.extensions));
          const rbExtProj = toJsonValue(stableForHash(rb.extensions));
          if (
            b.profileId === rb.profileId &&
            b.profileVersion === rb.profileVersion &&
            b.profileHash === rb.profileHash &&
            bProfProj.ok &&
            rbProfProj.ok &&
            canonicalBytes(bProfProj.value) === canonicalBytes(rbProfProj.value) &&
            bExtProj.ok &&
            rbExtProj.ok &&
            canonicalBytes(bExtProj.value) === canonicalBytes(rbExtProj.value)
          ) {
            const resolvedBundle: ProfileBundleV1 = {
              schema: PROFILE_BUNDLE_SCHEMA_V1,
              digest: b.digest,
              profileId: rb.profileId,
              profileVersion: rb.profileVersion,
              profileHash: rb.profileHash,
              profile: rb.profile,
              documentProjection: docProj.value,
              extensions: rb.extensions,
              registries: projectedRegistries,
              registriesMode: b.registriesMode,
            };
            return { bundle: resolvedBundle, parsedDoc: docProj.value as Record<string, JsonValue>, eligibleForStructuralRemoval: true, issues: [] };
          }
        }
      }
    }
    return {
      bundle: null,
      issues: [{ severity: "error", code: "invalid_profile_schema", path: "digest", message: "Invalid profile bundle or digest mismatch" }],
    };
  }
  const out = bundleProfileInternal(input as string | OntologyProfile);
  if (out.result.ok) {
    return { bundle: out.result.bundle, parsedDoc: out.parsedDoc, eligibleForStructuralRemoval: true, issues: [] };
  }
  return { bundle: null, parsedDoc: out.parsedDoc, eligibleForStructuralRemoval: out.eligibleForStructuralRemoval, issues: out.result.errors };
}

function computeStructuralRemovals(oldDoc: Record<string, JsonValue>, newDoc: Record<string, JsonValue>): ProfileBreakingChange[] {
  const breaking: ProfileBreakingChange[] = [];
  const oldNodes = asRec(oldDoc.node_types), newNodes = asRec(newDoc.node_types);
  const survivingAliases = new Set(
    Object.values(newNodes).flatMap((nt) => asStrArr(asRec(nt).aliases).map((a) => a.toLowerCase())),
  );
  for (const id of Object.keys(oldNodes)) {
    if (!Object.prototype.hasOwnProperty.call(newNodes, id)) {
      const covered = survivingAliases.has(id.toLowerCase());
      breaking.push({
        code: "removed_node_type", path: `node_types.${id}`, subject: id,
        message: `Removed node type ${id}`, before: renderCanon(oldNodes[id]), after: null,
        ...(covered ? { annotations: ["covered_by_alias"] as const } : {}),
      });
    }
  }
  const oldRels = asRec(oldDoc.relation_types), newRels = asRec(newDoc.relation_types);
  const syn = isStringMap(newDoc.synonym_relations) ? newDoc.synonym_relations : null;
  for (const id of Object.keys(oldRels)) {
    if (!Object.prototype.hasOwnProperty.call(newRels, id)) {
      const mapped = syn && typeof syn[id] === "string" && Object.prototype.hasOwnProperty.call(newRels, syn[id]);
      breaking.push({
        code: "removed_relation_type", path: `relation_types.${id}`, subject: id,
        message: `Removed relation type ${id}`, before: renderCanon(oldRels[id]), after: null,
        ...(mapped ? { annotations: ["covered_by_synonym"] as const } : {}),
      });
    }
  }
  const oldRegs = asRec(oldDoc.registries), newRegs = asRec(newDoc.registries);
  for (const id of Object.keys(oldRegs)) {
    if (!Object.prototype.hasOwnProperty.call(newRegs, id)) {
      breaking.push({
        code: "removed_registry", path: `registries.${id}`, subject: id,
        message: `Removed registry ${id}`, before: renderCanon(oldRegs[id]), after: null,
      });
    }
  }
  const oldSt = Array.isArray(asRec(oldDoc.hardening).statuses) ? asStrArr(asRec(oldDoc.hardening).statuses) : [];
  const newSt = new Set(Array.isArray(asRec(newDoc.hardening).statuses) ? asStrArr(asRec(newDoc.hardening).statuses) : []);
  for (const s of oldSt) {
    if (!newSt.has(s)) {
      breaking.push({
        code: "removed_status", path: `hardening.statuses.${s}`, subject: s,
        message: `Removed status ${s}`, before: canonicalBytes(s), after: null,
      });
    }
  }
  return breaking;
}

export function checkProfileCompatibility(
  oldProfile: ProfileComparableInput,
  newProfile: ProfileComparableInput,
  options?: ProfileCompatibilityOptions,
): ProfileCompatibilityResult {
  try {
  const oldSide = resolveComparableSide(oldProfile);
  const newSide = resolveComparableSide(newProfile);
  const sortChanges = <T extends { path: string; code: string; subject: string }>(arr: T[]): T[] =>
    arr.sort((a, b) => cmpCodeUnit(a.path, b.path) || cmpCodeUnit(a.code, b.code) || cmpCodeUnit(a.subject, b.subject));

  if (!oldSide.bundle || !newSide.bundle) {
    const validationIssues: ProfileBundleIssue[] = [
      ...oldSide.issues.map((i) => ({ ...i, path: `old.${i.path}` })),
      ...newSide.issues.map((i) => ({ ...i, path: `new.${i.path}` })),
    ];
    const canExtractRemovals =
      oldSide.parsedDoc !== undefined &&
      newSide.parsedDoc !== undefined &&
      oldSide.eligibleForStructuralRemoval === true &&
      newSide.eligibleForStructuralRemoval === true;
    const breaking = canExtractRemovals ? sortChanges(computeStructuralRemovals(oldSide.parsedDoc!, newSide.parsedDoc!)) : [];
    return deepFreeze({
      ok: false,
      compatible: false,
      oldDigest: oldSide.bundle?.digest ?? null,
      newDigest: newSide.bundle?.digest ?? null,
      breaking,
      nonBreaking: [],
      validationIssues,
    });
  }

  const oldB = oldSide.bundle, newB = newSide.bundle;
  const oldP = oldB.profile, newP = newB.profile;
  const oldDoc = asRec(oldB.documentProjection), newDoc = asRec(newB.documentProjection);
  const breaking: ProfileBreakingChange[] = [];
  const nonBreaking: ProfileNonBreakingChange[] = [];

  const pushB = (code: string, path: string, subject: string, before: string | null, after: string | null, message = `${code} at ${path}`, annotations?: readonly ("covered_by_alias" | "covered_by_synonym")[]) => {
    breaking.push({ code, path, subject, message, before, after, ...(annotations ? { annotations } : {}) });
  };
  const pushNB = (code: string, path: string, subject: string, before: string | null, after: string | null, message = `${code} at ${path}`) => {
    nonBreaking.push({ code, path, subject, message, before, after });
  };

  const checkResidual = (path: string, subject: string, oldVal: unknown, newVal: unknown) => {
    const rOld = renderCanon(oldVal), rNew = renderCanon(newVal);
    const before = renderTrunc(rOld), after = renderTrunc(rNew);
    const unproj = (oldVal !== undefined && !toJsonValue(oldVal).ok) || (newVal !== undefined && !toJsonValue(newVal).ok);
    if (unproj) {
      pushB("changed_modeled_field", path, subject, before, after);
      return;
    }
    if (rOld === rNew) return;
    if (options?.classifyModeledFieldChange) {
      try {
        if (options.classifyModeledFieldChange({ path, before: oldVal, after: newVal }) === "non-breaking") {
          pushNB("classified_modeled_field_change", path, subject, before, after);
          return;
        }
      } catch (err) {
        pushB("changed_modeled_field", path, subject, before, after, `changed_modeled_field at ${path}: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }
    pushB("changed_modeled_field", path, subject, before, after);
  };

  if (oldP.id !== newP.id) pushB("changed_profile_id", "id", "id", canonicalBytes(oldP.id), canonicalBytes(newP.id));
  if (oldP.default_language !== newP.default_language) pushB("changed_default_language", "default_language", "default_language", canonicalBytes(oldP.default_language), canonicalBytes(newP.default_language));
  if (oldP.version !== newP.version) pushNB("bumped_profile_version", "version", "version", canonicalBytes(oldP.version), canonicalBytes(newP.version));

  // Node types
  const oldDocNodes = asRec(oldDoc.node_types), newDocNodes = asRec(newDoc.node_types);
  const survivingAliases = new Set(Object.values(newP.node_types).flatMap((nt) => (nt.aliases ?? []).map((a) => a.toLowerCase())));
  for (const t of Object.keys(oldP.node_types)) {
    if (!Object.prototype.hasOwnProperty.call(newP.node_types, t)) {
      pushB("removed_node_type", `node_types.${t}`, t, renderCanon(oldDocNodes[t] ?? oldP.node_types[t]), null, `Removed node type ${t}`, survivingAliases.has(t.toLowerCase()) ? ["covered_by_alias"] : undefined);
    }
  }
  for (const t of Object.keys(newP.node_types)) {
    if (!Object.prototype.hasOwnProperty.call(oldP.node_types, t)) {
      pushNB("added_node_type", `node_types.${t}`, t, null, renderCanon(newDocNodes[t] ?? newP.node_types[t]));
    }
  }
  for (const t of Object.keys(oldP.node_types)) {
    if (!Object.prototype.hasOwnProperty.call(newP.node_types, t)) continue;
    const oNT = oldP.node_types[t]!, nNT = newP.node_types[t]!;
    const oRaw = asRec(oldDocNodes[t]), nRaw = asRec(newDocNodes[t]);
    if (typeof oRaw.id_prefix === "string" && oRaw.id_prefix !== nRaw.id_prefix) {
      pushB("changed_node_id_prefix", `node_types.${t}.id_prefix`, t, renderCanon(oRaw.id_prefix), renderCanon(nRaw.id_prefix));
    }
    if (renderCanon(oRaw.definition) !== renderCanon(nRaw.definition)) {
      pushNB("changed_node_definition", `node_types.${t}.definition`, t, renderCanon(oRaw.definition), renderCanon(nRaw.definition));
    }
    const oAl = new Set(asStrArr(oNT.aliases)), nAl = new Set(asStrArr(nNT.aliases));
    if ([...oAl].some((a) => !nAl.has(a))) pushB("removed_node_alias", `node_types.${t}.aliases`, t, canonicalBytes([...oAl].sort()), canonicalBytes([...nAl].sort()));
    if ([...nAl].some((a) => !oAl.has(a))) pushNB("added_node_alias", `node_types.${t}.aliases`, t, canonicalBytes([...oAl].sort()), canonicalBytes([...nAl].sort()));

    const oProps = asRec(oRaw.properties), nProps = asRec(nRaw.properties);
    for (const p of Object.keys(oProps)) {
      if (!Object.prototype.hasOwnProperty.call(nProps, p)) {
        pushB("removed_node_property", `node_types.${t}.properties.${p}`, `${t}.${p}`, renderCanon(oProps[p]), null);
      } else {
        const oD = asRec(oProps[p]), nD = asRec(nProps[p]);
        const allKeys = new Set([...Object.keys(oD), ...Object.keys(nD)]);
        const nonDescDiff =
          !isPlainObj(oProps[p]) || !isPlainObj(nProps[p]) ||
          oD.type !== nD.type || oD.format !== nD.format ||
          [...allKeys].some((k) => k !== "type" && k !== "format" && k !== "description" && renderCanon(oD[k]) !== renderCanon(nD[k]));
        if (nonDescDiff) {
          pushB("changed_node_property_type", `node_types.${t}.properties.${p}`, `${t}.${p}`, renderCanon(oProps[p]), renderCanon(nProps[p]));
        } else if (renderCanon(oD.description) !== renderCanon(nD.description)) {
          pushNB("changed_node_property_description", `node_types.${t}.properties.${p}.description`, `${t}.${p}`, renderCanon(oD.description), renderCanon(nD.description));
        }
      }
    }
    for (const p of Object.keys(nProps)) {
      if (!Object.prototype.hasOwnProperty.call(oProps, p)) {
        pushNB("added_node_property", `node_types.${t}.properties.${p}`, `${t}.${p}`, null, renderCanon(nProps[p]));
      }
    }
    if ((oNT.registry ?? null) !== (nNT.registry ?? null)) pushB("changed_node_registry", `node_types.${t}.registry`, t, renderCanon(oNT.registry), renderCanon(nNT.registry));
    if ((oNT.status_policy ?? null) !== (nNT.status_policy ?? null)) pushB("changed_node_status_policy", `node_types.${t}.status_policy`, t, renderCanon(oNT.status_policy), renderCanon(nNT.status_policy));
    const oSB = oNT.source_backed === true, nSB = nNT.source_backed === true;
    if (!oSB && nSB) pushB("tightened_node_source_backed", `node_types.${t}.source_backed`, t, renderCanon(oNT.source_backed ?? false), "true");
    else if (oSB && !nSB) pushNB("relaxed_node_source_backed", `node_types.${t}.source_backed`, t, "true", renderCanon(nNT.source_backed ?? false));

    checkResidual(`node_types.${t}.linking`, t, oNT.linking, nNT.linking);
    checkResidual(`node_types.${t}.visual_encoding`, t, oNT.visual_encoding, nNT.visual_encoding);

    const oRem: Record<string, unknown> = {}, nRem: Record<string, unknown> = {};
    for (const k of Object.keys(oRaw)) if (!MODELED_NODE_KEYS.has(k)) setProp(oRem, k, oRaw[k]);
    for (const k of Object.keys(nRaw)) if (!MODELED_NODE_KEYS.has(k)) setProp(nRem, k, nRaw[k]);
    if (renderCanon(oRem) !== renderCanon(nRem)) {
      pushB("changed_unmodeled_block", `node_types.${t}`, t, renderTrunc(renderCanon(oRem)), renderTrunc(renderCanon(nRem)));
    }
  }

  // Relation types
  const oldDocRels = asRec(oldDoc.relation_types), newDocRels = asRec(newDoc.relation_types);
  const syn = isStringMap(newB.extensions.synonym_relations) ? newB.extensions.synonym_relations : null;
  for (const r of Object.keys(oldP.relation_types)) {
    if (!Object.prototype.hasOwnProperty.call(newP.relation_types, r)) {
      const mapped = syn && typeof syn[r] === "string" && Object.prototype.hasOwnProperty.call(newP.relation_types, syn[r]);
      pushB("removed_relation_type", `relation_types.${r}`, r, renderCanon(oldDocRels[r] ?? oldP.relation_types[r]), null, `Removed relation type ${r}`, mapped ? ["covered_by_synonym"] : undefined);
    }
  }
  for (const r of Object.keys(newP.relation_types)) {
    if (!Object.prototype.hasOwnProperty.call(oldP.relation_types, r)) {
      pushNB("added_relation_type", `relation_types.${r}`, r, null, renderCanon(newDocRels[r] ?? newP.relation_types[r]));
    }
  }
  for (const r of Object.keys(oldP.relation_types)) {
    if (!Object.prototype.hasOwnProperty.call(newP.relation_types, r)) continue;
    const oRel = oldP.relation_types[r]!, nRel = newP.relation_types[r]!;
    const oRaw = asRec(oldDocRels[r]), nRaw = asRec(newDocRels[r]);
    const cmpEndpoint = (field: "source_types" | "target_types", bCode: string, nbCode: string) => {
      const oS = new Set(oRel[field]), nS = new Set(nRel[field]);
      const bStr = canonicalBytes([...oS].sort()), aStr = canonicalBytes([...nS].sort());
      if ([...oS].some((x) => !nS.has(x))) pushB(bCode, `relation_types.${r}.${field}`, r, bStr, aStr);
      else if ([...nS].some((x) => !oS.has(x))) pushNB(nbCode, `relation_types.${r}.${field}`, r, bStr, aStr);
    };
    cmpEndpoint("source_types", "narrowed_relation_source", "widened_relation_source");
    cmpEndpoint("target_types", "narrowed_relation_target", "widened_relation_target");
    if (!oRel.requires_evidence && nRel.requires_evidence) pushB("tightened_relation_requires_evidence", `relation_types.${r}.requires_evidence`, r, "false", "true");
    else if (oRel.requires_evidence && !nRel.requires_evidence) pushNB("relaxed_relation_requires_evidence", `relation_types.${r}.requires_evidence`, r, "true", "false");
    cmpEndpoint("assertion_basis" as "source_types", "changed_relation_assertion_basis", "widened_relation_assertion_basis");
    cmpEndpoint("derivation_methods" as "source_types", "changed_relation_derivation_methods", "widened_relation_derivation_methods");

    const oRem: Record<string, unknown> = {}, nRem: Record<string, unknown> = {};
    for (const k of Object.keys(oRaw)) if (!MODELED_REL_KEYS.has(k)) setProp(oRem, k, oRaw[k]);
    for (const k of Object.keys(nRaw)) if (!MODELED_REL_KEYS.has(k)) setProp(nRem, k, nRaw[k]);
    if (renderCanon(oRem) !== renderCanon(nRem)) {
      pushB("changed_unmodeled_block", `relation_types.${r}`, r, renderTrunc(renderCanon(oRem)), renderTrunc(renderCanon(nRem)));
    } else if (renderCanon(oRaw.description) !== renderCanon(nRaw.description)) {
      pushNB("changed_relation_description", `relation_types.${r}`, r, renderCanon(oRaw.description), renderCanon(nRaw.description));
    }
  }

  // Registries
  for (const regId of Object.keys(oldB.registries)) {
    if (!Object.prototype.hasOwnProperty.call(newB.registries, regId)) {
      pushB("removed_registry", `registries.${regId}`, regId, renderCanon(oldB.registries[regId]!.binding), null);
    }
  }
  for (const regId of Object.keys(newB.registries)) {
    if (!Object.prototype.hasOwnProperty.call(oldB.registries, regId)) {
      pushNB("added_registry", `registries.${regId}`, regId, null, renderCanon(newB.registries[regId]!.binding));
    }
  }
  if (oldB.registriesMode !== newB.registriesMode) {
    const renderModeSide = (b: ProfileBundleV1) =>
      b.registriesMode === "bindings-only"
        ? "not_bundled"
        : canonicalBytes(Object.fromEntries(Object.entries(b.registries).map(([k, v]) => [k, v.recordsDigest])));
    pushB("changed_registry_records", "registries", "registries", renderModeSide(oldB), renderModeSide(newB));
  }
  for (const regId of Object.keys(oldB.registries)) {
    if (!Object.prototype.hasOwnProperty.call(newB.registries, regId)) continue;
    const oSnap = oldB.registries[regId]!, nSnap = newB.registries[regId]!;
    const normB = (b: BundledRegistrySnapshotV1["binding"]) => ({ ...b, alias_columns: [...new Set(b.alias_columns)].sort(), partition_column: b.partition_column ?? null });
    if (renderCanon(normB(oSnap.binding)) !== renderCanon(normB(nSnap.binding))) {
      pushB("changed_registry_binding", `registries.${regId}.binding`, regId, renderCanon(oSnap.binding), renderCanon(nSnap.binding));
    }
    if (oldB.registriesMode === "full" && newB.registriesMode === "full" && oSnap.recordsDigest !== nSnap.recordsDigest) {
      pushB("changed_registry_records", `registries.${regId}.recordsDigest`, regId, renderCanon(oSnap.recordsDigest), renderCanon(nSnap.recordsDigest));
    }
  }

  // Hardening
  const oSt = new Set(oldP.hardening.statuses), nSt = new Set(newP.hardening.statuses);
  for (const s of oSt) if (!nSt.has(s)) pushB("removed_status", `hardening.statuses.${s}`, s, canonicalBytes(s), null);
  for (const s of nSt) if (!oSt.has(s)) pushNB("added_status", `hardening.statuses.${s}`, s, null, canonicalBytes(s));
  if (oldP.hardening.default_status !== newP.hardening.default_status) {
    pushB("changed_default_status", "hardening.default_status", "default_status", canonicalBytes(oldP.hardening.default_status), canonicalBytes(newP.hardening.default_status));
  }
  const groupTrans = (list: typeof oldP.hardening.status_transitions) => {
    const byFrom = new Map<string, Set<string>>();
    const byFromTo = new Map<string, Set<string>>();
    for (const tr of list) {
      const fKey = [...new Set(tr.from_statuses)].sort().join(",");
      const tSet = byFrom.get(fKey) ?? new Set<string>();
      for (const t of tr.to_statuses) tSet.add(t);
      byFrom.set(fKey, tSet);
      const ftKey = `${fKey}->${[...new Set(tr.to_statuses)].sort().join(",")}`;
      const rSet = byFromTo.get(ftKey) ?? new Set<string>();
      for (const r of tr.requires) rSet.add(r);
      byFromTo.set(ftKey, rSet);
    }
    return { byFrom, byFromTo };
  };
  const oTr = groupTrans(oldP.hardening.status_transitions), nTr = groupTrans(newP.hardening.status_transitions);
  for (const [fKey, oTo] of oTr.byFrom) {
    const nTo = nTr.byFrom.get(fKey) ?? new Set<string>();
    if ([...oTo].some((t) => !nTo.has(t))) pushB("narrowed_status_transition", "hardening.status_transitions", fKey, canonicalBytes([...oTo].sort()), canonicalBytes([...nTo].sort()));
    else if ([...nTo].some((t) => !oTo.has(t))) pushNB("widened_status_transition", "hardening.status_transitions", fKey, canonicalBytes([...oTo].sort()), canonicalBytes([...nTo].sort()));
  }
  for (const [fKey, nTo] of nTr.byFrom) {
    if (!oTr.byFrom.has(fKey)) pushNB("widened_status_transition", "hardening.status_transitions", fKey, null, canonicalBytes([...nTo].sort()));
  }
  for (const [ftKey, oReq] of oTr.byFromTo) {
    const nReq = nTr.byFromTo.get(ftKey);
    if (!nReq) continue;
    if ([...nReq].some((r) => !oReq.has(r))) pushB("narrowed_status_transition", "hardening.status_transitions", ftKey, canonicalBytes([...oReq].sort()), canonicalBytes([...nReq].sort()));
    if ([...oReq].some((r) => !nReq.has(r))) pushNB("widened_status_transition", "hardening.status_transitions", ftKey, canonicalBytes([...oReq].sort()), canonicalBytes([...nReq].sort()));
  }
  checkResidual("hardening.promotion_requires", "promotion_requires", oldP.hardening.promotion_requires, newP.hardening.promotion_requires);

  // Citation policy
  const oCit = oldP.citation_policy, nCit = newP.citation_policy;
  if (GRAN_RANK[nCit.minimum_granularity]! > GRAN_RANK[oCit.minimum_granularity]!) {
    pushB("tightened_citation_policy", "citation_policy.minimum_granularity", "minimum_granularity", canonicalBytes(oCit.minimum_granularity), canonicalBytes(nCit.minimum_granularity));
  } else if (GRAN_RANK[nCit.minimum_granularity]! < GRAN_RANK[oCit.minimum_granularity]!) {
    pushNB("relaxed_citation_policy", "citation_policy.minimum_granularity", "minimum_granularity", canonicalBytes(oCit.minimum_granularity), canonicalBytes(nCit.minimum_granularity));
  }
  if (!oCit.require_source_file && nCit.require_source_file) pushB("tightened_citation_policy", "citation_policy.require_source_file", "require_source_file", "false", "true");
  else if (oCit.require_source_file && !nCit.require_source_file) pushNB("relaxed_citation_policy", "citation_policy.require_source_file", "require_source_file", "true", "false");
  if (oCit.allow_bbox !== nCit.allow_bbox) {
    if ((oCit.allow_bbox === true || oCit.allow_bbox === "when_available") && nCit.allow_bbox === false) {
      pushB("tightened_citation_policy", "citation_policy.allow_bbox", "allow_bbox", canonicalBytes(oCit.allow_bbox), "false");
    } else {
      pushNB("changed_citation_policy", "citation_policy.allow_bbox", "allow_bbox", canonicalBytes(oCit.allow_bbox), canonicalBytes(nCit.allow_bbox));
    }
  }

  // Evidence policy
  const oEv = oldP.evidence_policy, nEv = newP.evidence_policy;
  if (!oEv.require_evidence_refs && nEv.require_evidence_refs) pushB("tightened_evidence_policy", "evidence_policy.require_evidence_refs", "require_evidence_refs", "false", "true");
  else if (oEv.require_evidence_refs && !nEv.require_evidence_refs) pushNB("relaxed_evidence_policy", "evidence_policy.require_evidence_refs", "require_evidence_refs", "true", "false");
  if (nEv.min_refs > oEv.min_refs) pushB("tightened_evidence_policy", "evidence_policy.min_refs", "min_refs", String(oEv.min_refs), String(nEv.min_refs));
  else if (nEv.min_refs < oEv.min_refs) pushNB("relaxed_evidence_policy", "evidence_policy.min_refs", "min_refs", String(oEv.min_refs), String(nEv.min_refs));
  if (oEv.require_evidence_refs && nEv.require_evidence_refs) {
    const cmpEff = (field: "node_types" | "relation_types", oDecl: Record<string, unknown>, nDecl: Record<string, unknown>) => {
      const shared = Object.keys(oDecl).filter((k) => Object.prototype.hasOwnProperty.call(nDecl, k));
      const oRaw = oEv[field].length === 0 ? new Set(Object.keys(oDecl)) : new Set(oEv[field]);
      const nRaw = nEv[field].length === 0 ? new Set(Object.keys(nDecl)) : new Set(nEv[field]);
      const oEff = new Set(shared.filter((k) => oRaw.has(k)));
      const nEff = new Set(shared.filter((k) => nRaw.has(k)));
      const bStr = canonicalBytes([...oEff].sort()), aStr = canonicalBytes([...nEff].sort());
      if ([...nEff].some((k) => !oEff.has(k))) pushB("tightened_evidence_policy", `evidence_policy.${field}`, field, bStr, aStr);
      if ([...oEff].some((k) => !nEff.has(k))) pushNB("relaxed_evidence_policy", `evidence_policy.${field}`, field, bStr, aStr);
    };
    cmpEff("node_types", oldP.node_types, newP.node_types);
    cmpEff("relation_types", oldP.relation_types, newP.relation_types);
  }

  // Inference policy
  const oInf = oldP.inference_policy, nInf = newP.inference_policy;
  if (oInf.allow_inferred_relations && !nInf.allow_inferred_relations) pushB("tightened_inference_policy", "inference_policy.allow_inferred_relations", "allow_inferred_relations", "true", "false");
  else if (!oInf.allow_inferred_relations && nInf.allow_inferred_relations) pushNB("relaxed_inference_policy", "inference_policy.allow_inferred_relations", "allow_inferred_relations", "false", "true");
  const oInfR = new Set(oInf.allowed_relation_types), nInfR = new Set(nInf.allowed_relation_types);
  if ([...oInfR].some((x) => !nInfR.has(x))) pushB("tightened_inference_policy", "inference_policy.allowed_relation_types", "allowed_relation_types", canonicalBytes([...oInfR].sort()), canonicalBytes([...nInfR].sort()));
  if ([...nInfR].some((x) => !oInfR.has(x))) pushNB("relaxed_inference_policy", "inference_policy.allowed_relation_types", "allowed_relation_types", canonicalBytes([...oInfR].sort()), canonicalBytes([...nInfR].sort()));
  if (!oInf.require_evidence_refs && nInf.require_evidence_refs) pushB("tightened_inference_policy", "inference_policy.require_evidence_refs", "require_evidence_refs", "false", "true");
  else if (oInf.require_evidence_refs && !nInf.require_evidence_refs) pushNB("relaxed_inference_policy", "inference_policy.require_evidence_refs", "require_evidence_refs", "true", "false");

  // Hierarchies
  for (const h of Object.keys(oldP.hierarchies)) {
    if (!Object.prototype.hasOwnProperty.call(newP.hierarchies, h)) pushB("changed_hierarchy", `hierarchies.${h}`, h, renderCanon(oldP.hierarchies[h]), null);
    else if (renderCanon(oldP.hierarchies[h]) !== renderCanon(newP.hierarchies[h])) pushB("changed_hierarchy", `hierarchies.${h}`, h, renderCanon(oldP.hierarchies[h]), renderCanon(newP.hierarchies[h]));
  }
  for (const h of Object.keys(newP.hierarchies)) {
    if (!Object.prototype.hasOwnProperty.call(oldP.hierarchies, h)) pushNB("added_hierarchy", `hierarchies.${h}`, h, null, renderCanon(newP.hierarchies[h]));
  }

  // Class hierarchies (modeled residual units)
  const chIds = new Set([...Object.keys(oldP.class_hierarchies ?? {}), ...Object.keys(newP.class_hierarchies ?? {})]);
  for (const id of chIds) checkResidual(`class_hierarchies.${id}`, id, oldP.class_hierarchies?.[id], newP.class_hierarchies?.[id]);

  // Outputs
  const oOut = oldP.outputs.ontology, nOut = newP.outputs.ontology;
  if (oOut.enabled && !nOut.enabled) pushB("narrowed_outputs", "outputs.ontology.enabled", "enabled", "true", "false");
  else if (!oOut.enabled && nOut.enabled) pushNB("widened_outputs", "outputs.ontology.enabled", "enabled", "false", "true");
  for (const f of ["canonical_node_types", "source_node_types", "relation_exports"] as const) {
    const oS = new Set(oOut[f]), nS = new Set(nOut[f]);
    const bStr = canonicalBytes([...oS].sort()), aStr = canonicalBytes([...nS].sort());
    if ([...oS].some((x) => !nS.has(x))) pushB("narrowed_outputs", `outputs.ontology.${f}`, f, bStr, aStr);
    if ([...nS].some((x) => !oS.has(x))) pushNB("widened_outputs", `outputs.ontology.${f}`, f, bStr, aStr);
  }
  checkResidual("outputs.ontology.artifact_schema", "artifact_schema", oOut.artifact_schema, nOut.artifact_schema);
  checkResidual("outputs.ontology.occurrence_node_types", "occurrence_node_types", oOut.occurrence_node_types, nOut.occurrence_node_types);
  checkResidual("outputs.ontology.alias_fields", "alias_fields", oOut.alias_fields, nOut.alias_fields);
  checkResidual("outputs.ontology.wiki", "wiki", oOut.wiki, nOut.wiki);

  // Extensions
  const extKeys = new Set([...Object.keys(oldB.extensions), ...Object.keys(newB.extensions)]);
  for (const k of extKeys) {
    const oVal = oldB.extensions[k], nVal = newB.extensions[k];
    const rOld = renderCanon(oVal), rNew = renderCanon(nVal);
    if (rOld === rNew) continue;
    const path = `extensions.${k}`;
    const before = renderTrunc(rOld), after = renderTrunc(rNew);
    if (options?.classifyExtensionChange) {
      try {
        if (options.classifyExtensionChange({ path, before: oVal, after: nVal }) === "non-breaking") {
          pushNB("classified_extension_change", path, k, before, after);
          continue;
        }
      } catch (err) {
        pushB("changed_unmodeled_block", path, k, before, after, `changed_unmodeled_block at ${path}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }
    pushB("changed_unmodeled_block", path, k, before, after);
  }

  sortChanges(breaking);
  sortChanges(nonBreaking);

  return deepFreeze({
    ok: true,
    compatible: breaking.length === 0,
    oldDigest: oldB.digest,
    newDigest: newB.digest,
    breaking,
    nonBreaking,
    validationIssues: [],
  });
  } catch (err) {
    return deepFreeze({
      ok: false,
      compatible: false,
      oldDigest: null,
      newDigest: null,
      breaking: [],
      nonBreaking: [],
      validationIssues: [{
        severity: "error",
        code: "invalid_profile_schema",
        path: "profile",
        message: err instanceof Error ? err.message : String(err),
      }],
    });
  }
}
