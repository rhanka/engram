// @sentropic/engram-live/derived-worktree-graph — D21 derived Git worktree
// graph entities and passive turn recording
// (spec/SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md §3, S1:1666; SJ §8 S4-i;
// plan/10 Row 13, PD-12).
//
// Neutral module: imports only in-package modules (zero host, storage driver,
// root package or model dependency). Never throws on hostile input: every entry
// point decodes once through the shared strict plain-record decoder and returns
// a closed DerivedWorktreeResult<T>.

import { canonicalEncodeValue } from "./batch-codec.js";
import { classifyPath } from "./content-policy.js";
import {
  ID_PREFIXES, IDENTITY_UNCERTAINTY_STATES, OID_ALGORITHMS,
  isIdentityUncertaintyState, isStrictGenerationId, readStrictNfcString, readStrictPlainRecord,
  validateCloneIdentity, validateQualifiedOid, validateWorkspaceDeclaration, validateWorktreeIdentity,
  type CloneIdentityDto, type IdentityUncertaintyState, type OidAlgorithm, type QualifiedOid,
  type WorkspaceDeclarationDto, type WorktreeIdentityDto,
} from "./contracts.js";
import { fingerprintBytes, isGitInternalPath, toPathKey } from "./filesystem.js";
import { classifyLifecycleEvent, isSameClone } from "./registration.js";
import type { StableCapture } from "./worktree.js";

export const WORKTREE_ORIGIN_KINDS = [
  "main-checkout", "linked-worktree", "h2a-job-worktree", "detached-checkout",
] as const;
export type WorktreeOriginKind = (typeof WORKTREE_ORIGIN_KINDS)[number];

export const DERIVED_WORKTREE_DIRTY_STATES = [
  "clean", "staged-only", "dirty", "conflicted", "unknown",
] as const;
export type DerivedWorktreeDirtyState = (typeof DERIVED_WORKTREE_DIRTY_STATES)[number];

export const DERIVED_WORKTREE_LIVE_INDEXING_STATES = [
  "unactivated", "bootstrap", "current", "partial", "stale", "degraded",
] as const;
export type DerivedWorktreeLiveIndexingState = (typeof DERIVED_WORKTREE_LIVE_INDEXING_STATES)[number];

export const DERIVED_WORKTREE_LIFECYCLE_STATES = [
  "active", "detached-idle", "removed-retained", "revoked-private-purged",
] as const;
export type DerivedWorktreeLifecycleState = (typeof DERIVED_WORKTREE_LIFECYCLE_STATES)[number];

export const DERIVED_WORKTREE_RELATION_TYPES = [
  "derived_from_clone", "branched_from_worktree", "pinned_at_head", "tracks_branch",
  "has_worktree_snapshot", "has_session_log", "recorded_in_worktree", "governed_by_worktree_overlay",
] as const;
export type DerivedWorktreeRelationType = (typeof DERIVED_WORKTREE_RELATION_TYPES)[number];

export const DERIVED_WORKTREE_REFUSAL_CODES = [
  "INVALID_INPUT", "INVALID_WORKTREE_ID", "INVALID_CLONE_ID", "INVALID_PATH_REF",
  "INVALID_UNCERTAINTY_STATE", "INVALID_OVERLAY_PATH", "INVALID_GIT_STATE",
  "INVALID_LIFECYCLE_STATE", "CROSS_CLONE_MERGE_FORBIDDEN", "PASSIVE_ACTIVATION_FORBIDDEN",
] as const;
export type DerivedWorktreeRefusalCode = (typeof DERIVED_WORKTREE_REFUSAL_CODES)[number];

export interface DerivedWorktreeError {
  readonly code: DerivedWorktreeRefusalCode;
  readonly message: string;
}

export type DerivedWorktreeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DerivedWorktreeError };

export type DerivedWorktreeSha256Digest = `sha256:${string}`;
export type DerivedWorktreeInstant = string;

export interface DerivedWorktreePathRefV1 {
  readonly pathRef: string;
  readonly contentFingerprint: DerivedWorktreeSha256Digest;
  readonly byteLength?: number;
  readonly lineRange?: { readonly start: number; readonly end: number };
  readonly contentDisclosureAuthorized: boolean;
}

export interface DerivedWorktreeParentOriginV1 {
  readonly parentCloneId: string;
  readonly parentWorktreeId?: string;
  readonly originKind: WorktreeOriginKind;
  readonly baseRefName?: string;
  readonly baseCommitOid?: QualifiedOid;
  readonly durableWorkspaceFingerprint?: string;
  readonly identityUncertainty: readonly IdentityUncertaintyState[];
}

export interface DerivedWorktreeGitStateV1 {
  readonly headOid: QualifiedOid | null;
  readonly symbolicBranchRef: string | null;
  readonly detached: boolean;
  readonly indexDigest?: DerivedWorktreeSha256Digest;
  readonly workingTreeFingerprint?: DerivedWorktreeSha256Digest;
  readonly dirtyState: DerivedWorktreeDirtyState;
  readonly liveIndexingState: DerivedWorktreeLiveIndexingState;
  readonly liveDeclarationId?: string;
  readonly livePublishedGenerationId?: string;
  readonly observedAt: DerivedWorktreeInstant;
}

export interface DerivedWorktreeNodeV1 {
  readonly nodeType: "derived_worktree";
  readonly derivedWorktreeId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly cloneId: string;
  readonly worktreePathRef: DerivedWorktreePathRefV1;
  readonly parentOrigin: DerivedWorktreeParentOriginV1;
  readonly gitState: DerivedWorktreeGitStateV1;
  readonly lifecycleState: DerivedWorktreeLifecycleState;
  readonly r1RetentionReceiptId?: string;
  readonly harnessOverlayRelPath: string;
  readonly createdAt: DerivedWorktreeInstant;
  readonly updatedAt: DerivedWorktreeInstant;
}

export interface DerivedWorktreeEdgeV1 {
  readonly relation: DerivedWorktreeRelationType;
  readonly source: string;
  readonly target: string;
}

export interface DerivedWorktreeGraphV1 {
  readonly nodes: readonly DerivedWorktreeNodeV1[];
  readonly edges: readonly DerivedWorktreeEdgeV1[];
}

export interface DerivedWorktreeAttachmentsV1 {
  readonly sessionPseudoIds?: readonly string[];
  readonly eventRecordIds?: readonly string[];
  readonly snapshotRefs?: readonly string[];
}

export interface BuildDerivedWorktreeNodeInput {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly clone: CloneIdentityDto;
  readonly worktree: WorktreeIdentityDto;
  readonly worktreePathRef: DerivedWorktreePathRefV1;
  readonly originKind: WorktreeOriginKind;
  readonly parentWorktreeId?: string;
  readonly baseRefName?: string;
  readonly baseCommitOid?: QualifiedOid;
  readonly durableWorkspaceFingerprint?: string;
  readonly identityUncertainty?: readonly IdentityUncertaintyState[];
  readonly headOid?: QualifiedOid | null;
  readonly symbolicBranchRef?: string | null;
  readonly detached?: boolean;
  readonly dirtyState?: DerivedWorktreeDirtyState;
  readonly stableCapture?: StableCapture;
  readonly declaration?: WorkspaceDeclarationDto;
  readonly liveIndexingState?: DerivedWorktreeLiveIndexingState;
  readonly livePublishedGenerationId?: string;
  readonly lifecycleState?: DerivedWorktreeLifecycleState;
  readonly r1RetentionReceiptId?: string;
  readonly harnessOverlayRelPath?: string;
  readonly observedAt: DerivedWorktreeInstant;
  readonly createdAt?: DerivedWorktreeInstant;
  readonly updatedAt?: DerivedWorktreeInstant;
}

export interface RecordPassiveSessionTurnInput extends Omit<
  BuildDerivedWorktreeNodeInput,
  | "stableCapture" | "declaration" | "liveIndexingState" | "livePublishedGenerationId"
  | "lifecycleState" | "r1RetentionReceiptId" | "createdAt" | "updatedAt"
> {
  readonly sessionPseudoId: string;
  readonly eventRecordId: string;
}

type DecodedAttachments = Required<DerivedWorktreeAttachmentsV1>;
type NodeBase = Pick<
  DerivedWorktreeNodeV1,
  "derivedWorktreeId" | "tenantId" | "workspaceId" | "cloneId" | "worktreePathRef" | "parentOrigin" | "gitState"
>;

const BAD = Symbol("bad");
const HEX64_RE = /^[0-9a-f]{64}$/;
const FILE_MODE_RE = /^[0-7]{6}$/;
const SESSION_PSEUDO_RE = /^sess_pseudo:[0-9a-f]{1,128}$/;
const OPAQUE_TOKEN_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/;
const QUALIFIED_HEAD_RE = /^(?:sha1:[0-9a-f]{40}|sha256:[0-9a-f]{64})$/;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
const ABSOLUTE_OR_SCHEME_RE = /^(?:[\\/]|~|[a-zA-Z]:|[a-zA-Z][a-zA-Z0-9+.-]*:)/;
const OVERLAY_DIR_PREFIX = ".h2a/overlays/worktrees/";
const MAX_GRAPH_NODES = 10_000;
const MAX_GRAPH_EDGES = 100_000;
const MAX_CAPTURE_ITEMS = 100_000;
const MAX_ATTACHMENTS = 4_096;
const MAX_AUTHORIZED_ROOTS = 1_024;

const PASSIVE_FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "liveIndexingState", "liveCapability", "liveDeclarationId", "livePublishedGenerationId", "declaration",
]);
const STRUCTURAL_RELATIONS: ReadonlySet<DerivedWorktreeRelationType> = new Set([
  "derived_from_clone", "branched_from_worktree", "pinned_at_head", "tracks_branch", "governed_by_worktree_overlay",
]);
const CAPTURED_FILE_STATUSES = ["present", "deleted", "sparse-omitted", "excluded"] as const;
const CAPTURED_FILE_KINDS = ["file", "symlink", "gitlink", "conflict", "other"] as const;
const CAPTURED_EXCLUSION_REASONS = [
  "filtered", "protected", "symlink-outside-root", "symlink-unresolvable",
  "gitlink", "oversized", "special-file", "deleted",
] as const;

const NODE_REQ = [
  "nodeType", "derivedWorktreeId", "tenantId", "workspaceId", "cloneId", "worktreePathRef",
  "parentOrigin", "gitState", "lifecycleState", "harnessOverlayRelPath", "createdAt", "updatedAt",
] as const;
const NODE_OPT = ["r1RetentionReceiptId"] as const;
const PARENT_REQ = ["parentCloneId", "originKind", "identityUncertainty"] as const;
const PARENT_OPT = ["parentWorktreeId", "baseRefName", "baseCommitOid", "durableWorkspaceFingerprint"] as const;
const GIT_REQ = ["headOid", "symbolicBranchRef", "detached", "dirtyState", "liveIndexingState", "observedAt"] as const;
const GIT_OPT = ["indexDigest", "workingTreeFingerprint", "liveDeclarationId", "livePublishedGenerationId"] as const;
const PATH_REF_REQ = ["pathRef", "contentFingerprint", "contentDisclosureAuthorized"] as const;
const PATH_REF_OPT = ["byteLength", "lineRange"] as const;
const BUILD_REQ = [
  "tenantId", "workspaceId", "clone", "worktree", "worktreePathRef", "originKind", "observedAt",
] as const;
const PASSIVE_OPT = [
  ...PARENT_OPT, "identityUncertainty", "headOid", "symbolicBranchRef",
  "detached", "dirtyState", "harnessOverlayRelPath",
] as const;
const BUILD_OPT = [
  ...PASSIVE_OPT, "stableCapture", "declaration", "liveIndexingState",
  "livePublishedGenerationId", "lifecycleState", "r1RetentionReceiptId", "createdAt", "updatedAt",
] as const;
const PASSIVE_REQ = [...BUILD_REQ, "sessionPseudoId", "eventRecordId"] as const;
const CAPTURE_REQ = [
  "stable", "attempts", "root", "gitDir", "commonDir", "indexPath",
  "headOid", "objectFormat", "indexDigest", "attrFingerprint", "entries", "files",
] as const;
const FILE_REQ = ["path", "status", "kind"] as const;
const FILE_OPT = [
  "mode", "indexOid", "stageOids", "exclusionReason",
  "fingerprint", "size", "linkTarget", "blobVerified", "textconv",
] as const;

const ok = <T>(value: T): DerivedWorktreeResult<T> => ({ ok: true, value });
const fail = (code: DerivedWorktreeRefusalCode, message: string): DerivedWorktreeResult<never> =>
  ({ ok: false, error: { code, message } });
const isMember = <T extends string>(value: unknown, list: readonly T[]): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);
const opt = <T>(value: unknown, parse: (raw: unknown) => T | undefined): T | undefined | typeof BAD =>
  value === undefined ? undefined : (parse(value) ?? BAD);
const def = (value: unknown, fallback: unknown): unknown => (value === undefined ? fallback : value);
const isHex64Prefixed = (value: unknown, prefix: string): value is string =>
  typeof value === "string" && value.length === prefix.length + 64
  && value.startsWith(prefix) && HEX64_RE.test(value.slice(prefix.length));
const isWtId = (value: unknown): value is string => isHex64Prefixed(value, ID_PREFIXES.worktree);
const readSha256Digest = (value: unknown): DerivedWorktreeSha256Digest | undefined =>
  isHex64Prefixed(value, "sha256:") ? (value as DerivedWorktreeSha256Digest) : undefined;
const isFormatOid = (format: OidAlgorithm, value: unknown): value is string =>
  typeof value === "string" && validateQualifiedOid({ algorithm: format, oid: value }).ok;
const sameCloneAndScope = (a: DerivedWorktreeNodeV1, b: DerivedWorktreeNodeV1): boolean =>
  a.cloneId === b.cloneId && a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
const isExpectedOverlayPath = (id: string, relPath: string): boolean =>
  relPath === `${OVERLAY_DIR_PREFIX}${id}.json`
  || relPath === `${OVERLAY_DIR_PREFIX}${id.slice(ID_PREFIXES.worktree.length)}.json`;

function omitUndef<T>(obj: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

function withSeen<T>(target: object, seen: WeakSet<object>, fn: () => T): T {
  seen.add(target);
  try {
    return fn();
  } finally {
    seen.delete(target);
  }
}

function hasExactKeys(obj: Record<string, unknown>, req: readonly string[], optional: readonly string[]): boolean {
  const allowed = new Set([...req, ...optional]);
  return !Object.keys(obj).some((k) => !allowed.has(k)) && !req.some((k) => !Object.hasOwn(obj, k));
}

function readStrictExactObject(
  value: unknown,
  req: readonly string[],
  optional: readonly string[],
  seen: WeakSet<object>,
): Record<string, unknown> | undefined {
  const obj = readStrictPlainRecord(value, seen);
  return obj !== null && hasExactKeys(obj, req, optional) ? obj : undefined;
}

function readStrictDenseArray(value: unknown, maxLen: number, seen: WeakSet<object>): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value) || seen.has(value) || Object.getPrototypeOf(value) !== Array.prototype) return undefined;
    if (Object.getOwnPropertySymbols(value).length > 0) return undefined;
    const len = value.length;
    if (!Number.isSafeInteger(len) || len < 0 || len > maxLen) return undefined;
    if (Object.getOwnPropertyNames(value).length !== len + 1) return undefined;
    const out: unknown[] = [];
    for (let i = 0; i < len; i += 1) {
      const desc = Object.getOwnPropertyDescriptor(value, String(i));
      if (!desc || !desc.enumerable || !("value" in desc)) return undefined;
      out.push(desc.value);
    }
    return out;
  } catch {
    return undefined;
  }
}

function readStrictBytes(value: unknown): Uint8Array | undefined {
  try {
    if (!(value instanceof Uint8Array)) return undefined;
    const proto = Object.getPrototypeOf(value);
    if ((proto !== Uint8Array.prototype && !Buffer.isBuffer(value)) || Object.getOwnPropertySymbols(value).length > 0) {
      return undefined;
    }
    return Uint8Array.from(value);
  } catch {
    return undefined;
  }
}

const readStrictSafeInt = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined =>
  typeof v === "number" && !Object.is(v, -0) && Number.isSafeInteger(v) && v >= min && v <= max ? v : undefined;

function readStrictInstant(value: unknown): DerivedWorktreeInstant | undefined {
  const s = readStrictNfcString(value);
  if (s === undefined || !INSTANT_RE.test(s)) return undefined;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString() !== s ? undefined : s;
}

function readStrictOpaqueToken(value: unknown): string | undefined {
  const s = readStrictNfcString(value);
  if (s === undefined || s.length === 0 || s !== s.trim() || Buffer.byteLength(s, "utf8") > 256) return undefined;
  return OPAQUE_TOKEN_RE.test(s) ? s : undefined;
}

function readStrictGitRef(value: unknown, prefix: string): string | undefined {
  const s = readStrictNfcString(value);
  return s !== undefined && s.length > prefix.length && s === s.trim() && s.startsWith(prefix)
    && Buffer.byteLength(s, "utf8") <= 512 && !CONTROL_CHAR_RE.test(s) && !/\s/.test(s)
    && !s.includes("\\") && !s.includes("..") && !s.includes("//") && !s.endsWith("/") && !s.endsWith(".")
    ? s
    : undefined;
}

function decodeQualifiedOid(value: unknown, seen: WeakSet<object>): QualifiedOid | undefined {
  const obj = readStrictPlainRecord(value, seen);
  return obj !== null && validateQualifiedOid(obj).ok
    ? { algorithm: obj.algorithm as OidAlgorithm, oid: obj.oid as string }
    : undefined;
}

function decodeIdentityUncertainty(
  value: unknown,
  seen: WeakSet<object>,
): DerivedWorktreeResult<readonly IdentityUncertaintyState[]> {
  const arr = readStrictDenseArray(value, IDENTITY_UNCERTAINTY_STATES.length, seen);
  if (arr === undefined) {
    return fail("INVALID_UNCERTAINTY_STATE", "identityUncertainty must be a dense array of declared states");
  }
  const unique = new Set<IdentityUncertaintyState>();
  const out: IdentityUncertaintyState[] = [];
  for (const entry of arr) {
    if (!isIdentityUncertaintyState(entry) || unique.has(entry)) {
      return fail("INVALID_UNCERTAINTY_STATE", "identityUncertainty contains an undeclared or duplicate state");
    }
    unique.add(entry);
    out.push(entry);
  }
  return ok(out);
}

function decodePathRef(value: unknown, seen: WeakSet<object>): DerivedWorktreeResult<DerivedWorktreePathRefV1> {
  const obj = readStrictExactObject(value, PATH_REF_REQ, PATH_REF_OPT, seen);
  if (obj === undefined) return fail("INVALID_PATH_REF", "worktreePathRef must be a closed plain object");
  return withSeen(value as object, seen, () => {
    const pathRef = readStrictNfcString(obj.pathRef);
    if (pathRef === undefined || pathRef.length === 0 || Buffer.byteLength(pathRef, "utf8") > 4096) {
      return fail("INVALID_PATH_REF", "worktreePathRef.pathRef must be a bounded string");
    }
    const contentFingerprint = readSha256Digest(obj.contentFingerprint);
    if (contentFingerprint === undefined || typeof obj.contentDisclosureAuthorized !== "boolean") {
      return fail("INVALID_PATH_REF", "worktreePathRef requires sha256 contentFingerprint and boolean disclosure flag");
    }
    if (pathRef.startsWith("withheld-path:")) {
      if (!isHex64Prefixed(pathRef, "withheld-path:") || obj.contentDisclosureAuthorized !== false) {
        return fail("INVALID_PATH_REF", "withheld worktreePathRef must be withheld-path:<64 hex>, disclosure false");
      }
    } else if (
      pathRef !== pathRef.trim() || CONTROL_CHAR_RE.test(pathRef) || ABSOLUTE_OR_SCHEME_RE.test(pathRef)
      || pathRef.includes("\\") || pathRef.includes("//") || pathRef.endsWith("/")
      || pathRef.split("/").some((seg) => seg.length === 0 || seg === "." || seg === "..")
      || isGitInternalPath(pathRef) || !classifyPath(pathRef).allowed
    ) {
      return fail("INVALID_PATH_REF", "worktreePathRef must be a safe non-secret relative path ref");
    }
    const byteLength = opt(obj.byteLength, (v) => readStrictSafeInt(v, 0));
    if (byteLength === BAD) return fail("INVALID_PATH_REF", "worktreePathRef.byteLength must be a non-negative int");
    let lineRange: { readonly start: number; readonly end: number } | undefined;
    if (obj.lineRange !== undefined) {
      const r = readStrictExactObject(obj.lineRange, ["start", "end"], [], seen);
      const start = r === undefined ? undefined : readStrictSafeInt(r.start, 1);
      const end = start === undefined ? undefined : readStrictSafeInt(r!.end, start);
      if (start === undefined || end === undefined) {
        return fail("INVALID_PATH_REF", "worktreePathRef.lineRange requires 1 <= start <= end");
      }
      lineRange = { start, end };
    }
    return ok(omitUndef<DerivedWorktreePathRefV1>({
      pathRef, contentFingerprint, byteLength, lineRange,
      contentDisclosureAuthorized: obj.contentDisclosureAuthorized,
    }));
  });
}

function decodeParentOriginFields(
  obj: Record<string, unknown>,
  parentCloneId: string,
  expectedCloneId: string,
  selfWorktreeId: string,
  identityUncertainty: readonly IdentityUncertaintyState[],
  seen: WeakSet<object>,
): DerivedWorktreeResult<DerivedWorktreeParentOriginV1> {
  if (!isMember(obj.originKind, WORKTREE_ORIGIN_KINDS)) {
    return fail("INVALID_INPUT", "parentOrigin.originKind must be a declared WorktreeOriginKind");
  }
  const parentWorktreeId = opt(
    obj.parentWorktreeId,
    (v) => (isWtId(v) && obj.originKind !== "main-checkout" ? v : undefined),
  );
  if (parentWorktreeId === BAD) {
    return fail("INVALID_WORKTREE_ID", "parentOrigin.parentWorktreeId must be wt:<64 hex> on non-main checkout");
  }
  const baseRefName = opt(obj.baseRefName, (v) => readStrictGitRef(v, "refs/"));
  const baseCommitOid = opt(obj.baseCommitOid, (v) => decodeQualifiedOid(v, seen));
  const durableWorkspaceFingerprint = opt(
    obj.durableWorkspaceFingerprint,
    (v) => (isHex64Prefixed(v, "ws:") ? v : undefined),
  );
  if (baseRefName === BAD || baseCommitOid === BAD || durableWorkspaceFingerprint === BAD) {
    return fail("INVALID_INPUT", "parentOrigin optional base or fingerprint field is invalid");
  }
  if (parentCloneId !== expectedCloneId) {
    return fail("CROSS_CLONE_MERGE_FORBIDDEN", "parentOrigin.parentCloneId must equal node.cloneId");
  }
  if (parentWorktreeId === selfWorktreeId) {
    return fail("INVALID_WORKTREE_ID", "parentOrigin.parentWorktreeId must not equal derivedWorktreeId");
  }
  return ok(omitUndef<DerivedWorktreeParentOriginV1>({
    parentCloneId, parentWorktreeId, originKind: obj.originKind,
    baseRefName, baseCommitOid, durableWorkspaceFingerprint, identityUncertainty,
  }));
}

function validateGitState(
  raw: Record<string, unknown>,
  headOid: QualifiedOid | null | undefined,
  symbolicBranchRef: string | null | undefined,
): DerivedWorktreeResult<DerivedWorktreeGitStateV1> {
  if (
    headOid === undefined || symbolicBranchRef === undefined
    || typeof raw.detached !== "boolean" || (raw.detached && symbolicBranchRef !== null)
  ) {
    return fail("INVALID_GIT_STATE", "gitState headOid, branch ref, or detached flag is invalid");
  }
  const indexDigest = opt(raw.indexDigest, readSha256Digest);
  const workingTreeFingerprint = opt(raw.workingTreeFingerprint, readSha256Digest);
  if (
    indexDigest === BAD || workingTreeFingerprint === BAD
    || !isMember(raw.dirtyState, DERIVED_WORKTREE_DIRTY_STATES)
    || !isMember(raw.liveIndexingState, DERIVED_WORKTREE_LIVE_INDEXING_STATES)
  ) {
    return fail("INVALID_GIT_STATE", "gitState digests, dirtyState, or liveIndexingState is invalid");
  }
  const liveDeclarationId = opt(
    raw.liveDeclarationId,
    (v) => (isHex64Prefixed(v, ID_PREFIXES.declaration) ? v : undefined),
  );
  const livePublishedGenerationId = opt(
    raw.livePublishedGenerationId,
    (v) => (isStrictGenerationId(v) ? v : undefined),
  );
  const observedAt = readStrictInstant(raw.observedAt);
  if (liveDeclarationId === BAD || livePublishedGenerationId === BAD || observedAt === undefined) {
    return fail("INVALID_GIT_STATE", "gitState declarationId, generationId, or observedAt is invalid");
  }
  if (raw.liveIndexingState === "unactivated") {
    if (liveDeclarationId !== undefined || livePublishedGenerationId !== undefined) {
      return fail("INVALID_GIT_STATE", "unactivated worktree must not carry live declaration or generation ids");
    }
  } else if (liveDeclarationId === undefined) {
    return fail("INVALID_GIT_STATE", "activated liveIndexingState requires a canonical liveDeclarationId");
  }
  return ok(omitUndef<DerivedWorktreeGitStateV1>({
    headOid, symbolicBranchRef, detached: raw.detached, indexDigest, workingTreeFingerprint,
    dirtyState: raw.dirtyState, liveIndexingState: raw.liveIndexingState,
    liveDeclarationId, livePublishedGenerationId, observedAt,
  }));
}

function finalizeNode(base: NodeBase, raw: Record<string, unknown>): DerivedWorktreeResult<DerivedWorktreeNodeV1> {
  if (!isMember(raw.lifecycleState, DERIVED_WORKTREE_LIFECYCLE_STATES)) {
    return fail("INVALID_LIFECYCLE_STATE", "lifecycleState must be a declared lifecycle state");
  }
  const r1RetentionReceiptId = opt(raw.r1RetentionReceiptId, readStrictOpaqueToken);
  if (
    r1RetentionReceiptId === BAD
    || (raw.lifecycleState === "removed-retained" && r1RetentionReceiptId === undefined)
    || (raw.lifecycleState === "revoked-private-purged"
      && (base.gitState.liveIndexingState !== "unactivated"
        || base.gitState.indexDigest !== undefined
        || base.gitState.workingTreeFingerprint !== undefined))
  ) {
    return fail("INVALID_LIFECYCLE_STATE", "lifecycleState violates R1 retention or purge invariants");
  }
  const harnessOverlayRelPath = readStrictNfcString(raw.harnessOverlayRelPath);
  if (harnessOverlayRelPath === undefined || !isExpectedOverlayPath(base.derivedWorktreeId, harnessOverlayRelPath)) {
    return fail("INVALID_OVERLAY_PATH", "harnessOverlayRelPath must match .h2a/overlays/worktrees/{id}.json");
  }
  const createdAt = readStrictInstant(raw.createdAt);
  const updatedAt = readStrictInstant(raw.updatedAt);
  if (createdAt === undefined || updatedAt === undefined || updatedAt < createdAt) {
    return fail("INVALID_INPUT", "createdAt and updatedAt must be valid UTC instants with updatedAt >= createdAt");
  }
  return ok(omitUndef<DerivedWorktreeNodeV1>({
    nodeType: "derived_worktree", ...base, lifecycleState: raw.lifecycleState,
    r1RetentionReceiptId, harnessOverlayRelPath, createdAt, updatedAt,
  }));
}

function decodeNode(input: unknown, seen: WeakSet<object>): DerivedWorktreeResult<DerivedWorktreeNodeV1> {
  const obj = readStrictExactObject(input, NODE_REQ, NODE_OPT, seen);
  if (obj === undefined) return fail("INVALID_INPUT", "derived worktree node must be a closed plain object");
  return withSeen(input as object, seen, () => {
    if (obj.nodeType !== "derived_worktree") return fail("INVALID_INPUT", 'nodeType must equal "derived_worktree"');
    if (!isWtId(obj.derivedWorktreeId)) return fail("INVALID_WORKTREE_ID", "derivedWorktreeId must be wt:<64 hex>");
    if (!isHex64Prefixed(obj.cloneId, ID_PREFIXES.clone)) {
      return fail("INVALID_CLONE_ID", "cloneId must be clone:<64 lowercase hex>");
    }
    const tenantId = readStrictOpaqueToken(obj.tenantId);
    const workspaceId = readStrictOpaqueToken(obj.workspaceId);
    if (tenantId === undefined || workspaceId === undefined) {
      return fail("INVALID_INPUT", "tenantId and workspaceId must be bounded opaque identifiers");
    }
    const pathRef = decodePathRef(obj.worktreePathRef, seen);
    if (!pathRef.ok) return pathRef;
    const pObj = readStrictExactObject(obj.parentOrigin, PARENT_REQ, PARENT_OPT, seen);
    if (pObj === undefined) return fail("INVALID_INPUT", "parentOrigin must be a closed plain object");
    const parentOrigin = withSeen(obj.parentOrigin as object, seen, () => {
      if (!isHex64Prefixed(pObj.parentCloneId, ID_PREFIXES.clone)) {
        return fail("INVALID_CLONE_ID", "parentOrigin.parentCloneId must be clone:<64 lowercase hex>");
      }
      const uncert = decodeIdentityUncertainty(pObj.identityUncertainty, seen);
      if (!uncert.ok) return uncert;
      return decodeParentOriginFields(
        pObj, pObj.parentCloneId, obj.cloneId as string, obj.derivedWorktreeId as string, uncert.value, seen,
      );
    });
    if (!parentOrigin.ok) return parentOrigin;
    const gObj = readStrictExactObject(obj.gitState, GIT_REQ, GIT_OPT, seen);
    if (gObj === undefined) return fail("INVALID_GIT_STATE", "gitState must be a closed plain object");
    const gitState = withSeen(obj.gitState as object, seen, () =>
      validateGitState(
        gObj,
        gObj.headOid === null ? null : decodeQualifiedOid(gObj.headOid, seen),
        gObj.symbolicBranchRef === null ? null : readStrictGitRef(gObj.symbolicBranchRef, "refs/heads/"),
      ),
    );
    if (!gitState.ok) return gitState;
    return finalizeNode(
      {
        derivedWorktreeId: obj.derivedWorktreeId, tenantId, workspaceId, cloneId: obj.cloneId,
        worktreePathRef: pathRef.value, parentOrigin: parentOrigin.value, gitState: gitState.value,
      },
      obj,
    );
  });
}

function decodeContractRecord(
  input: unknown,
  seen: WeakSet<object>,
  decl: boolean,
): DerivedWorktreeResult<Record<string, unknown>> {
  const obj = readStrictPlainRecord(input, seen);
  if (obj === null) return fail("INVALID_INPUT", "contract record must be a plain object");
  return withSeen(input as object, seen, () => {
    const uncert = decodeIdentityUncertainty(obj.identityUncertainty, seen);
    if (!uncert.ok) return uncert;
    const code: DerivedWorktreeRefusalCode = decl ? "INVALID_GIT_STATE" : "INVALID_INPUT";
    const out: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(obj)) {
      if (k === "identityUncertainty") out[k] = uncert.value;
      else if (decl && k === "authorizedRoots") {
        const roots = readStrictDenseArray(v, MAX_AUTHORIZED_ROOTS, seen)?.map(readStrictNfcString);
        if (!roots || roots.some((r) => r === undefined)) return fail(code, "authorizedRoots must be clean strings");
        out[k] = roots;
      } else if (v === undefined) out[k] = undefined;
      else if (typeof v === "string") {
        const s = readStrictNfcString(v);
        if (s === undefined) return fail(code, "contract record contains malformed string");
        out[k] = s;
      } else if (decl && typeof v === "number") {
        const n = readStrictSafeInt(v, 1);
        if (n === undefined) return fail(code, "declaration contains invalid integer");
        out[k] = n;
      } else return fail(code, "contract record contains unsupported value");
    }
    return ok(out);
  });
}

function decodeIdentityPair(cloneInput: unknown, worktreeInput: unknown, seen: WeakSet<object>) {
  const cleanClone = decodeContractRecord(cloneInput, seen, false);
  if (!cleanClone.ok) return cleanClone;
  const cleanWorktree = decodeContractRecord(worktreeInput, seen, false);
  if (!cleanWorktree.ok) return cleanWorktree;
  if (!validateCloneIdentity(cleanClone.value).ok || !validateWorktreeIdentity(cleanWorktree.value).ok) {
    return fail("INVALID_INPUT", "clone or worktree identity failed contract validation");
  }
  const clone = cleanClone.value as unknown as CloneIdentityDto;
  const worktree = cleanWorktree.value as unknown as WorktreeIdentityDto;
  if (!isHex64Prefixed(clone.cloneId, ID_PREFIXES.clone) || !isHex64Prefixed(worktree.cloneId, ID_PREFIXES.clone)) {
    return fail("INVALID_CLONE_ID", "cloneId must be clone:<64 lowercase hex>");
  }
  if (!isWtId(worktree.worktreeId)) return fail("INVALID_WORKTREE_ID", "worktreeId must be wt:<64 lowercase hex>");
  return isSameClone(clone, worktree)
    ? ok({ clone, worktree })
    : fail("CROSS_CLONE_MERGE_FORBIDDEN", "worktree.cloneId must equal clone.cloneId");
}

function decodeDeclaration(
  value: unknown,
  expectedCloneId: string,
  expectedWorktreeId: string,
  seen: WeakSet<object>,
): DerivedWorktreeResult<WorkspaceDeclarationDto> {
  const clean = decodeContractRecord(value, seen, true);
  if (!clean.ok) return clean;
  if (!validateWorkspaceDeclaration(clean.value).ok) return fail("INVALID_GIT_STATE", "declaration validation failed");
  const decl = clean.value as unknown as WorkspaceDeclarationDto;
  if (decl.cloneId !== expectedCloneId) return fail("CROSS_CLONE_MERGE_FORBIDDEN", "declaration.cloneId mismatch");
  if (decl.worktreeId !== expectedWorktreeId) return fail("INVALID_WORKTREE_ID", "declaration.worktreeId mismatch");
  if (!isHex64Prefixed(decl.declarationId, ID_PREFIXES.declaration)) {
    return fail("INVALID_GIT_STATE", "declaration.declarationId must be decl:<64 hex>");
  }
  return ok(decl);
}

function decodeCapturedFile(rawFile: unknown, format: OidAlgorithm, seen: WeakSet<object>) {
  const f = readStrictExactObject(rawFile, FILE_REQ, FILE_OPT, seen);
  if (f === undefined) return undefined;
  return withSeen(rawFile as object, seen, () => {
    const path = readStrictBytes(f.path);
    if (path === undefined || !isMember(f.status, CAPTURED_FILE_STATUSES) || !isMember(f.kind, CAPTURED_FILE_KINDS)) {
      return undefined;
    }
    const mode = opt(f.mode, (v) => (typeof v === "string" && FILE_MODE_RE.test(v) ? v : undefined));
    const indexOid = opt(f.indexOid, (v) => (isFormatOid(format, v) ? v : undefined));
    const stageOids = opt(f.stageOids, (v) => {
      const stages = readStrictPlainRecord(v, seen);
      if (stages === null) return undefined;
      const out: Record<string, string> = Object.create(null);
      for (const [stage, oid] of Object.entries(stages)) {
        if ((stage !== "1" && stage !== "2" && stage !== "3") || !isFormatOid(format, oid)) return undefined;
        out[stage] = oid;
      }
      return out;
    });
    const exclusionReason = opt(f.exclusionReason, (v) => (isMember(v, CAPTURED_EXCLUSION_REASONS) ? v : undefined));
    const fingerprint = opt(f.fingerprint, (v) => (typeof v === "string" && HEX64_RE.test(v) ? v : undefined));
    const size = opt(f.size, (v) => readStrictSafeInt(v, 0));
    const linkTarget = opt(f.linkTarget, readStrictBytes);
    const blobVerified = opt(f.blobVerified, (v) => (typeof v === "boolean" ? v : undefined));
    const textconv = opt(f.textconv, (v) => (typeof v === "boolean" ? v : undefined));
    if (
      mode === BAD || indexOid === BAD || stageOids === BAD || exclusionReason === BAD
      || fingerprint === BAD || size === BAD || linkTarget === BAD || blobVerified === BAD || textconv === BAD
    ) {
      return undefined;
    }
    const record: Record<string, unknown> = {
      path, status: f.status, kind: f.kind,
      mode, indexOid, stageOids, exclusionReason, fingerprint, size, linkTarget, blobVerified, textconv,
    };
    const canonical = Buffer.from(canonicalEncodeValue(record)).toString("utf8");
    return {
      key: `${toPathKey(Buffer.from(path))}\0${f.status}\0${f.kind}\0${canonical}`,
      record,
      isConflict: f.kind === "conflict",
    };
  });
}

function extractCaptureDigests(capture: unknown, seen: WeakSet<object>) {
  const obj = readStrictExactObject(capture, CAPTURE_REQ, [], seen);
  if (obj === undefined) return fail("INVALID_INPUT", "stableCapture must be a closed plain object");
  return withSeen(capture as object, seen, () => {
    const format = obj.objectFormat;
    const badPath = (["root", "gitDir", "commonDir", "indexPath"] as const).some((k) => {
      const s = readStrictNfcString(obj[k]);
      return s === undefined || s.trim().length === 0 || s.includes("\0");
    });
    if (
      badPath || obj.stable !== true || readStrictSafeInt(obj.attempts, 1) === undefined
      || !isMember(format, OID_ALGORITHMS) || typeof obj.indexDigest !== "string" || !HEX64_RE.test(obj.indexDigest)
      || typeof obj.attrFingerprint !== "string" || !HEX64_RE.test(obj.attrFingerprint)
    ) {
      return fail("INVALID_GIT_STATE", "stableCapture carries invalid top-level capture metadata");
    }
    const headOid = obj.headOid === null
      ? null
      : isFormatOid(format, obj.headOid) ? { algorithm: format, oid: obj.headOid } : undefined;
    if (headOid === undefined) return fail("INVALID_GIT_STATE", "stableCapture.headOid does not match objectFormat");
    const rawFiles = readStrictDenseArray(obj.files, MAX_CAPTURE_ITEMS, seen);
    if (readStrictDenseArray(obj.entries, MAX_CAPTURE_ITEMS, seen) === undefined || rawFiles === undefined) {
      return fail("INVALID_GIT_STATE", "stableCapture entries and files must be dense arrays");
    }
    const keyedFiles: Array<{ readonly key: string; readonly record: Record<string, unknown> }> = [];
    let hasConflicts = false;
    for (const rawFile of rawFiles) {
      const decoded = decodeCapturedFile(rawFile, format, seen);
      if (decoded === undefined) return fail("INVALID_GIT_STATE", "stableCapture file carries invalid metadata");
      if (decoded.isConflict) hasConflicts = true;
      keyedFiles.push({ key: decoded.key, record: decoded.record });
    }
    keyedFiles.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const wtHash = fingerprintBytes(
      canonicalEncodeValue([
        "dwt-capture/v1", format, headOid?.oid ?? null, obj.indexDigest, obj.attrFingerprint,
        keyedFiles.map((entry) => entry.record),
      ]),
    );
    return ok({
      objectFormat: format,
      headOid,
      indexDigest: `sha256:${obj.indexDigest}` as DerivedWorktreeSha256Digest,
      workingTreeFingerprint: `sha256:${wtHash}` as DerivedWorktreeSha256Digest,
      hasConflicts,
    });
  });
}

function decodeAttachments(input: unknown, seen: WeakSet<object>): DerivedWorktreeResult<DecodedAttachments> {
  if (input === undefined) return ok({ sessionPseudoIds: [], eventRecordIds: [], snapshotRefs: [] });
  const obj = readStrictExactObject(input, [], ["sessionPseudoIds", "eventRecordIds", "snapshotRefs"], seen);
  if (obj === undefined) return fail("INVALID_INPUT", "attachments must be a closed plain object");
  return withSeen(input as object, seen, () => {
    const readList = (key: string, check: (v: unknown) => string | undefined): string[] | undefined => {
      if (obj[key] === undefined) return [];
      const out = readStrictDenseArray(obj[key], MAX_ATTACHMENTS, seen)?.map(check);
      return out === undefined || out.some((v) => v === undefined) ? undefined : (out as string[]);
    };
    const sessionPseudoIds = readList("sessionPseudoIds", (v) =>
      typeof v === "string" && SESSION_PSEUDO_RE.test(v) ? v : undefined,
    );
    const eventRecordIds = readList("eventRecordIds", readStrictOpaqueToken);
    const snapshotRefs = readList("snapshotRefs", readStrictOpaqueToken);
    return sessionPseudoIds === undefined || eventRecordIds === undefined || snapshotRefs === undefined
      ? fail("INVALID_INPUT", "attachments contain malformed identifiers")
      : ok({ sessionPseudoIds, eventRecordIds, snapshotRefs });
  });
}

function structuralEdgesForNode(node: DerivedWorktreeNodeV1): DerivedWorktreeEdgeV1[] {
  const id = node.derivedWorktreeId;
  const head = node.gitState.headOid;
  return [
    { relation: "derived_from_clone", source: id, target: node.cloneId },
    { relation: "governed_by_worktree_overlay", source: id, target: node.harnessOverlayRelPath },
    ...(node.parentOrigin.parentWorktreeId !== undefined
      ? [{ relation: "branched_from_worktree" as const, source: id, target: node.parentOrigin.parentWorktreeId }]
      : []),
    ...(head !== null
      ? [{ relation: "pinned_at_head" as const, source: id, target: `${head.algorithm}:${head.oid}` }]
      : []),
    ...(node.gitState.symbolicBranchRef !== null
      ? [{ relation: "tracks_branch" as const, source: id, target: node.gitState.symbolicBranchRef }]
      : []),
  ];
}

function dedupeSortedEdges(edges: readonly DerivedWorktreeEdgeV1[]): readonly DerivedWorktreeEdgeV1[] {
  const byKey = new Map(edges.map((e) => [`${e.relation}\0${e.source}\0${e.target}`, e] as const));
  return [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, e]) => e);
}

type EdgeChecker = (source: string, target: string) => DerivedWorktreeRefusalCode | null;
const EDGE_CHECKERS: Readonly<Record<DerivedWorktreeRelationType, EdgeChecker>> = {
  derived_from_clone: (s, t) => (isWtId(s) && isHex64Prefixed(t, ID_PREFIXES.clone) ? null : "INVALID_WORKTREE_ID"),
  branched_from_worktree: (s, t) => (isWtId(s) && isWtId(t) && s !== t ? null : "INVALID_WORKTREE_ID"),
  pinned_at_head: (s, t) => (isWtId(s) && QUALIFIED_HEAD_RE.test(t) ? null : "INVALID_GIT_STATE"),
  tracks_branch: (s, t) => (isWtId(s) && readStrictGitRef(t, "refs/heads/") !== undefined ? null : "INVALID_GIT_STATE"),
  has_worktree_snapshot: (s, t) => (isWtId(s) && readStrictOpaqueToken(t) !== undefined ? null : "INVALID_INPUT"),
  has_session_log: (s, t) => (isWtId(s) && SESSION_PSEUDO_RE.test(t) ? null : "INVALID_INPUT"),
  recorded_in_worktree: (s, t) => (readStrictOpaqueToken(s) !== undefined && isWtId(t) ? null : "INVALID_WORKTREE_ID"),
  governed_by_worktree_overlay: (s, t) => (isWtId(s) && isExpectedOverlayPath(s, t) ? null : "INVALID_OVERLAY_PATH"),
};

function decodeEdge(value: unknown, seen: WeakSet<object>): DerivedWorktreeResult<DerivedWorktreeEdgeV1> {
  const obj = readStrictExactObject(value, ["relation", "source", "target"], [], seen);
  if (obj === undefined) return fail("INVALID_INPUT", "graph edge must be a closed plain object");
  if (!isMember(obj.relation, DERIVED_WORKTREE_RELATION_TYPES)) {
    return fail("INVALID_INPUT", "graph edge carries an undeclared relation type");
  }
  const source = readStrictNfcString(obj.source);
  const target = readStrictNfcString(obj.target);
  if (source === undefined || target === undefined) return fail("INVALID_INPUT", "edge endpoints must be strings");
  const errCode = EDGE_CHECKERS[obj.relation](source, target);
  return errCode === null ? ok({ relation: obj.relation, source, target }) : fail(errCode, "invalid edge endpoints");
}

function decodeGraph(input: unknown, seen: WeakSet<object>): DerivedWorktreeResult<DerivedWorktreeGraphV1> {
  const obj = readStrictExactObject(input, ["nodes", "edges"], [], seen);
  if (obj === undefined) return fail("INVALID_INPUT", "derived worktree graph must be a closed plain object");
  return withSeen(input as object, seen, () => {
    const rawNodes = readStrictDenseArray(obj.nodes, MAX_GRAPH_NODES, seen);
    const rawEdges = readStrictDenseArray(obj.edges, MAX_GRAPH_EDGES, seen);
    if (rawNodes === undefined || rawEdges === undefined) {
      return fail("INVALID_INPUT", "graph nodes and edges must be dense arrays");
    }
    const nodesById = new Map<string, DerivedWorktreeNodeV1>();
    for (const rawNode of rawNodes) {
      const decoded = decodeNode(rawNode, seen);
      if (!decoded.ok) return decoded;
      if (nodesById.has(decoded.value.derivedWorktreeId)) return fail("INVALID_INPUT", "duplicate derivedWorktreeId");
      nodesById.set(decoded.value.derivedWorktreeId, decoded.value);
    }
    for (const node of nodesById.values()) {
      const pid = node.parentOrigin.parentWorktreeId;
      const parent = pid !== undefined ? nodesById.get(pid) : undefined;
      if (parent !== undefined && !sameCloneAndScope(parent, node)) {
        return fail("CROSS_CLONE_MERGE_FORBIDDEN", "graph contains cross-clone or cross-scope parent link");
      }
    }
    const edges: DerivedWorktreeEdgeV1[] = [];
    for (const rawEdge of rawEdges) {
      const decoded = decodeEdge(rawEdge, seen);
      if (!decoded.ok) return decoded;
      const edge = decoded.value;
      const src = nodesById.get(edge.source);
      if (edge.relation === "branched_from_worktree") {
        const dst = nodesById.get(edge.target);
        if (src !== undefined && dst !== undefined && !sameCloneAndScope(src, dst)) {
          return fail("CROSS_CLONE_MERGE_FORBIDDEN", "graph contains cross-clone or cross-scope branch edge");
        }
      } else if (edge.relation === "derived_from_clone" && src !== undefined && edge.target !== src.cloneId) {
        return fail("CROSS_CLONE_MERGE_FORBIDDEN", "derived_from_clone edge disagrees with node.cloneId");
      } else if (
        edge.relation === "governed_by_worktree_overlay" && src !== undefined
        && edge.target !== src.harnessOverlayRelPath
      ) {
        return fail("INVALID_OVERLAY_PATH", "governed_by_worktree_overlay edge disagrees with node overlay path");
      }
      edges.push(edge);
    }
    const nodes = [...nodesById.values()].sort((a, b) => (a.derivedWorktreeId < b.derivedWorktreeId ? -1 : 1));
    return ok({ nodes, edges: dedupeSortedEdges(edges) });
  });
}

function buildNodeFromObject(
  obj: Record<string, unknown>,
  seen: WeakSet<object>,
): DerivedWorktreeResult<DerivedWorktreeNodeV1> {
  const identities = decodeIdentityPair(obj.clone, obj.worktree, seen);
  if (!identities.ok) return identities;
  const { clone, worktree } = identities.value;
  const tenantId = readStrictOpaqueToken(obj.tenantId);
  const workspaceId = readStrictOpaqueToken(obj.workspaceId);
  if (tenantId === undefined || workspaceId === undefined) {
    return fail("INVALID_INPUT", "tenantId and workspaceId must be bounded opaque identifiers");
  }
  const worktreePathRef = decodePathRef(obj.worktreePathRef, seen);
  if (!worktreePathRef.ok) return worktreePathRef;
  const uncertaintyRes = obj.identityUncertainty !== undefined
    ? decodeIdentityUncertainty(obj.identityUncertainty, seen)
    : ok(IDENTITY_UNCERTAINTY_STATES.filter(
        (s) => clone.identityUncertainty.includes(s) || worktree.identityUncertainty.includes(s),
      ));
  if (!uncertaintyRes.ok) return uncertaintyRes;
  const parentOrigin = decodeParentOriginFields(
    obj, clone.cloneId, clone.cloneId, worktree.worktreeId, uncertaintyRes.value, seen,
  );
  if (!parentOrigin.ok) return parentOrigin;
  const captureRes = obj.stableCapture !== undefined ? extractCaptureDigests(obj.stableCapture, seen) : undefined;
  if (captureRes !== undefined && !captureRes.ok) return captureRes;
  const capture = captureRes?.value;
  let headOid: QualifiedOid | null = capture?.headOid ?? null;
  if (obj.headOid !== undefined) {
    const parsed = obj.headOid === null ? null : decodeQualifiedOid(obj.headOid, seen);
    if (parsed === undefined) return fail("INVALID_GIT_STATE", "headOid must be null or a valid QualifiedOid");
    headOid = parsed;
    if (
      capture !== undefined
      && (capture.headOid?.algorithm !== headOid?.algorithm || capture.headOid?.oid !== headOid?.oid)
    ) {
      return fail("INVALID_GIT_STATE", "headOid disagrees with stableCapture.headOid");
    }
  }
  if (
    (capture !== undefined && capture.objectFormat !== clone.oidAlgorithm)
    || (headOid !== null && headOid.algorithm !== clone.oidAlgorithm)
    || (parentOrigin.value.baseCommitOid !== undefined
      && parentOrigin.value.baseCommitOid.algorithm !== clone.oidAlgorithm)
  ) {
    return fail("INVALID_GIT_STATE", "objectFormat, headOid, and baseCommitOid must match clone.oidAlgorithm");
  }
  let liveDeclarationId: string | undefined;
  let liveIndexingState: unknown = "unactivated";
  if (obj.declaration !== undefined) {
    const parsedDecl = decodeDeclaration(obj.declaration, clone.cloneId, worktree.worktreeId, seen);
    if (!parsedDecl.ok) return parsedDecl;
    liveDeclarationId = parsedDecl.value.declarationId;
    liveIndexingState = def(obj.liveIndexingState, "bootstrap");
  } else if (obj.liveIndexingState !== undefined && obj.liveIndexingState !== "unactivated") {
    return fail("PASSIVE_ACTIVATION_FORBIDDEN", "non-unactivated liveIndexingState requires WorkspaceDeclarationDto");
  }
  const detached = def(obj.detached, false);
  if (typeof detached !== "boolean") return fail("INVALID_GIT_STATE", "detached must be a boolean");
  const symbolicBranchRef = obj.symbolicBranchRef === undefined || obj.symbolicBranchRef === null
    ? null
    : readStrictGitRef(obj.symbolicBranchRef, "refs/heads/");
  const observedAt = readStrictInstant(obj.observedAt);
  if (observedAt === undefined) return fail("INVALID_GIT_STATE", "observedAt must be RFC 3339 UTC");
  const gitState = validateGitState(
    {
      detached,
      dirtyState: def(obj.dirtyState, capture?.hasConflicts ? "conflicted" : "unknown"),
      liveIndexingState, observedAt,
      indexDigest: capture?.indexDigest, workingTreeFingerprint: capture?.workingTreeFingerprint,
      liveDeclarationId, livePublishedGenerationId: obj.livePublishedGenerationId,
    },
    headOid, symbolicBranchRef,
  );
  if (!gitState.ok) return gitState;
  return finalizeNode(
    {
      derivedWorktreeId: worktree.worktreeId, tenantId, workspaceId, cloneId: clone.cloneId,
      worktreePathRef: worktreePathRef.value, parentOrigin: parentOrigin.value, gitState: gitState.value,
    },
    {
      lifecycleState: def(obj.lifecycleState, detached ? "detached-idle" : "active"),
      r1RetentionReceiptId: obj.r1RetentionReceiptId,
      harnessOverlayRelPath: def(obj.harnessOverlayRelPath, `${OVERLAY_DIR_PREFIX}${worktree.worktreeId}.json`),
      createdAt: def(obj.createdAt, observedAt),
      updatedAt: def(obj.updatedAt, observedAt),
    },
  );
}

function applyUpsert(
  graph: DerivedWorktreeGraphV1,
  incoming: DerivedWorktreeNodeV1,
  att: DecodedAttachments,
): DerivedWorktreeResult<DerivedWorktreeGraphV1> {
  const nodesById = new Map(graph.nodes.map((entry) => [entry.derivedWorktreeId, entry]));
  const wtId = incoming.derivedWorktreeId;
  const existing = nodesById.get(wtId);
  const pid = incoming.parentOrigin.parentWorktreeId;
  const parent = pid !== undefined ? nodesById.get(pid) : undefined;
  if (
    (existing !== undefined && !sameCloneAndScope(existing, incoming))
    || (parent !== undefined && !sameCloneAndScope(parent, incoming))
  ) {
    return fail("CROSS_CLONE_MERGE_FORBIDDEN", "worktree or parent belongs to a different clone or scope");
  }
  for (const other of nodesById.values()) {
    if (other.derivedWorktreeId !== wtId && other.parentOrigin.parentWorktreeId === wtId
      && !sameCloneAndScope(other, incoming)) {
      return fail("CROSS_CLONE_MERGE_FORBIDDEN", "existing child worktree belongs to a different clone or scope");
    }
  }
  for (const edge of graph.edges) {
    if (edge.relation === "branched_from_worktree" && edge.target === wtId) {
      const src = nodesById.get(edge.source);
      if (src !== undefined && !sameCloneAndScope(src, incoming)) {
        return fail("CROSS_CLONE_MERGE_FORBIDDEN", "existing branched_from_worktree edge crosses clone or scope");
      }
    }
  }
  nodesById.set(wtId, incoming);
  const keptEdges = graph.edges.filter((edge) => {
    const owned = edge.relation === "recorded_in_worktree" ? edge.target === wtId : edge.source === wtId;
    if (!owned) return true;
    if (STRUCTURAL_RELATIONS.has(edge.relation)) return false;
    return !(incoming.lifecycleState === "revoked-private-purged" && edge.relation === "has_worktree_snapshot");
  });
  const nextEdges: DerivedWorktreeEdgeV1[] = [
    ...structuralEdgesForNode(incoming),
    ...att.sessionPseudoIds.map((target) => ({ relation: "has_session_log" as const, source: wtId, target })),
    ...att.eventRecordIds.map((source) => ({ relation: "recorded_in_worktree" as const, source, target: wtId })),
    ...(incoming.lifecycleState === "revoked-private-purged"
      ? []
      : att.snapshotRefs.map((target) => ({ relation: "has_worktree_snapshot" as const, source: wtId, target }))),
  ];
  const nodes = [...nodesById.values()].sort((a, b) => (a.derivedWorktreeId < b.derivedWorktreeId ? -1 : 1));
  return ok({ nodes, edges: dedupeSortedEdges([...keptEdges, ...nextEdges]) });
}

export function validateDerivedWorktreeNode(input: unknown): DerivedWorktreeResult<DerivedWorktreeNodeV1> {
  return decodeNode(input, new WeakSet<object>());
}

export function buildDerivedWorktreeNode(input: unknown): DerivedWorktreeResult<DerivedWorktreeNodeV1> {
  const seen = new WeakSet<object>();
  const obj = readStrictExactObject(input, BUILD_REQ, BUILD_OPT, seen);
  if (obj === undefined) return fail("INVALID_INPUT", "buildDerivedWorktreeNode input must be a closed plain object");
  return withSeen(input as object, seen, () => buildNodeFromObject(obj, seen));
}

export function upsertDerivedWorktreeNode(
  graph: unknown,
  node: unknown,
  attachments?: unknown,
): DerivedWorktreeResult<DerivedWorktreeGraphV1> {
  const seen = new WeakSet<object>();
  const validatedGraph = decodeGraph(graph, seen);
  if (!validatedGraph.ok) return validatedGraph;
  const validatedNode = decodeNode(node, seen);
  if (!validatedNode.ok) return validatedNode;
  const parsedAtt = decodeAttachments(attachments, seen);
  if (!parsedAtt.ok) return parsedAtt;
  return applyUpsert(validatedGraph.value, validatedNode.value, parsedAtt.value);
}

export function recordPassiveSessionTurn(
  graph: unknown,
  input: unknown,
): DerivedWorktreeResult<DerivedWorktreeGraphV1> {
  const seen = new WeakSet<object>();
  const validatedGraph = decodeGraph(graph, seen);
  if (!validatedGraph.ok) return validatedGraph;
  const obj = readStrictPlainRecord(input, seen);
  if (obj === null) return fail("INVALID_INPUT", "passive session turn input must be a closed plain object");
  if (Object.keys(obj).some((key) => PASSIVE_FORBIDDEN_KEYS.has(key))) {
    return fail("PASSIVE_ACTIVATION_FORBIDDEN", "passive session turn never accepts live activation fields (A01)");
  }
  if (!hasExactKeys(obj, PASSIVE_REQ, PASSIVE_OPT)) {
    return fail("INVALID_INPUT", "passive session turn input carries unexpected or missing keys");
  }
  if (classifyLifecycleEvent("session-open") !== "no-activation-change") {
    return fail("PASSIVE_ACTIVATION_FORBIDDEN", "session lifecycle classification violated A01 non-activation rule");
  }
  const sessionPseudoId = obj.sessionPseudoId;
  if (typeof sessionPseudoId !== "string" || !SESSION_PSEUDO_RE.test(sessionPseudoId)) {
    return fail("INVALID_INPUT", "sessionPseudoId must match sess_pseudo:<hex>");
  }
  const eventRecordId = readStrictOpaqueToken(obj.eventRecordId);
  if (eventRecordId === undefined) return fail("INVALID_INPUT", "eventRecordId must be a bounded opaque identifier");
  const built = withSeen(input as object, seen, () => buildNodeFromObject(obj, seen));
  if (!built.ok) return built;
  const attachments: DecodedAttachments = {
    sessionPseudoIds: [sessionPseudoId],
    eventRecordIds: [eventRecordId],
    snapshotRefs: [],
  };
  const existing = validatedGraph.value.nodes.find((e) => e.derivedWorktreeId === built.value.derivedWorktreeId);
  if (existing === undefined) return applyUpsert(validatedGraph.value, built.value, attachments);
  if (!sameCloneAndScope(existing, built.value)) {
    return fail("CROSS_CLONE_MERGE_FORBIDDEN", "passive turn targets existing worktree under different clone or scope");
  }
  const observedAt = built.value.gitState.observedAt;
  const updatedAt = observedAt > existing.updatedAt ? observedAt : existing.updatedAt;
  if (observedAt < existing.gitState.observedAt) {
    return applyUpsert(validatedGraph.value, { ...existing, updatedAt }, attachments);
  }
  const hasDetached = obj.detached !== undefined;
  const hasBranch = obj.symbolicBranchRef !== undefined;
  const detached = hasDetached
    ? built.value.gitState.detached
    : hasBranch && built.value.gitState.symbolicBranchRef !== null ? false : existing.gitState.detached;
  const symbolicBranchRef = hasBranch
    ? built.value.gitState.symbolicBranchRef
    : detached ? null : existing.gitState.symbolicBranchRef;
  const merged: DerivedWorktreeNodeV1 = {
    ...existing,
    worktreePathRef: built.value.worktreePathRef,
    gitState: {
      ...existing.gitState,
      headOid: obj.headOid !== undefined ? built.value.gitState.headOid : existing.gitState.headOid,
      symbolicBranchRef,
      detached,
      dirtyState: obj.dirtyState !== undefined ? built.value.gitState.dirtyState : existing.gitState.dirtyState,
      observedAt,
    },
    updatedAt,
  };
  return applyUpsert(validatedGraph.value, merged, attachments);
}
