// @sentropic/engram-live/code-analysis — L5 context-bound versioned code
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3, 8, A04/A08; plan/09 L5; owner Q1 A;
//  L5-cache-design R1-R3/R5/R7/R9/R10 + A3-A5/A8-A13).
//
// One pass over caller-supplied bytes (production feeds committed blobs
// lazily through R1 retained objects; tests supply synthetic bytes):
//   1. grammar gate (R5a single point): unavailable → explicit unavailable
//      coverage, zero facts — never empty success; regex/heuristic never AST;
//   2. parse layer (R3a): injected deterministic extractor runs ONLY on a
//      requested blob, including shadow validation of unsigned cache hits —
//      NO path/tree/scope/root. Dialect is computed before parsing by a
//      versioned function; output is syntax-local only (slots/names/lexemes,
//      never final IDs/absolute paths/scope-bound diagnostics);
//   3. resolution layer (R3): binds every symbol/call/edge/unresolved/
//      diagnostic to current S/T/P/B/dialect/G/C/D/A via
//      factId = H(semanticIdentity, slot, kind, role, occurrence) (R3b: NOT
//      the cache key; schema versions never change fact identity; no
//      credential enters keys/envelopes/IDs — A9);
//   4. bounds gate (R7/A11): unknown bounds cap below complete with the
//      closed reason set reusing contract terms (policy-withheld,
//      unstable-capture, missing-key); verified-empty requires syntax
//      completeness evidence (R7b); coverage is recomputed, never cached;
//   5. unresolved refs become scoped facts for L7b-R — never dropped, never
//      model-resolved (R13: deterministic only, no model SDK in closure).
//
// Body-only changes invalidate content-derived facts (bytes rule, R7);
// repairAffectedCalls needs completeness + deletion evidence (R9): partial
// results preserve prior callers, confirmed deletion yields scoped
// unresolved facts, partial repair is withheld from publication.
//
// Neutrality: imports only neutral package modules and node:crypto.

import { createHash } from "node:crypto";
import { verifyCommitGraph, verifyGitObject, type PinnedOidDto, type ComparisonObjectsPort } from "./comparisons.js";
import {
  FACT_SCHEMA_VERSION,
  POLICY_VERSION,
  validateCodeFileDeletionFact,
  validateReasonAnchorFact,
  type BatchPolicyVersion,
  type CodeFileDeletionFactDto,
  type LiveScope,
  type QualifiedOid,
  type ReasonAnchorFactDto,
  type ReasonAnchorPinDto,
} from "./contracts.js";
import {
  ANALYSIS_EXTRACTOR_VERSION,
  L5_DIALECT_VERSION,
  L5_FACT_SCHEMA_VERSION,
  L5_RESOLVER_VERSION,
  AnalysisCache,
  type AnalysisCachePort,
  type AnalysisContextDto,
} from "./analysis-cache.js";

export const CODE_ANALYSIS_VERSION = "live-code-analysis/1";
/** R3b semantic identity version (fact IDs; cache schema excluded). */
export const L5_SEMANTIC_IDENTITY_VERSION = "live-semantic-identity/1";

export class CodeAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodeAnalysisError";
  }
}

/** The production parser could not start or finish a syntax walk. */
export class ParseUnavailableError extends CodeAnalysisError {}

export interface LiveScopeDto {
  readonly tenant: string;
  readonly clone: string;
}

export interface GrammarStatusDto {
  readonly state: "available" | "unavailable";
  readonly version: string;
  readonly digest?: string | null;
  readonly abi?: string | null;
  readonly grammarId?: string | null;
  readonly reason?: string;
  readonly bytes?: Uint8Array;
}

export interface GrammarStatusPort {
  status(language: string): GrammarStatusDto | Promise<GrammarStatusDto>;
  /** Runtime capability loads the exact verified bytes, never a version label. */
  load?(input: { bytes: Uint8Array; abi: string; language: string }): object | null | Promise<object | null>;
}

export interface RetainedObjectsPort extends ComparisonObjectsPort {}

/** Syntax-local symbol (R3: slot, never a bound graph ID). */
export interface LocalSymbol {
  readonly slot: string;
  readonly name: string;
  readonly kind: string;
  readonly bodyHash: string;
}

export interface LocalCall {
  readonly slot: string;
  readonly fromSlot: string;
  readonly targetSlotOrName: string;
  readonly external: boolean;
  readonly occurrence?: number | null;
}

export interface LocalInheritance {
  readonly slot: string;
  readonly childSlot: string;
  readonly parentSlotOrName: string;
  /** True when syntax alone cannot bind the parent in this unit. */
  readonly external?: boolean;
}

export interface SyntaxEvidence {
  readonly rootSpansBytes: boolean;
  readonly hasError: boolean;
  readonly hasMissing: boolean;
  readonly walkComplete: boolean;
}

/** Shared parse: syntax-local only (R3). Legacy path-bound units are NOT accepted here. */
export interface ParsedUnit {
  readonly symbols: readonly LocalSymbol[];
  readonly calls: readonly LocalCall[];
  readonly inheritances: readonly LocalInheritance[];
  readonly topologyHash: string;
  readonly syntax: SyntaxEvidence;
  readonly diagnostics?: readonly string[];
}

/** Legacy path-bound shapes (repair compat only; never a shared parse). */
interface LegacySymbol { readonly id: string; readonly name: string; readonly kind: string; readonly bodyHash: string; }
interface LegacyCall { readonly id: string; readonly from: string; readonly target: string; readonly external: boolean; }
interface LegacyInheritance { readonly id: string; readonly child: string; readonly parent: string; }

/** Injected deterministic parser (R3a: NO path/tree/scope/root). */
export interface DeterministicParsePort {
  parse(input: { readonly bytes: Uint8Array; readonly content: string; readonly language: string; readonly dialect: string;
    readonly grammarHandle: object; readonly syntaxOptions: Readonly<Record<string, never>> }): ParsedUnit | Promise<ParsedUnit>;
}

export interface HistoricalBoundsDto {
  readonly known: boolean;
  readonly missing?: readonly string[];
  /** Heads whose entire parent closure is verified against retained Git objects. */
  readonly heads?: readonly PinnedOidDto[];
}

/**
 * Data-pure verified L4a capture evidence for local (treeOid === null) analysis
 * (plan/09 E-ASM3 / Carbon R3-01). Produced from a verified StableCapture; a
 * bare flag or completion label never lifts `unstable-capture`.
 */
export interface VerifiedCaptureEvidenceDto {
  readonly stable: true;
  readonly scope: LiveScopeDto;
  readonly worktreeId: string;
  readonly snapshotId: string;
  readonly path: string;
  readonly contentFingerprint: string;
  readonly indexDigest: string;
  readonly attrFingerprint: string;
  readonly attempts: number;
  readonly snapshotKind?: "index" | "working-tree";
}

export interface AnalyzeCodeInput {
  readonly scope: LiveScopeDto;
  readonly language: string;
  readonly path: string;
  readonly content: string;
  readonly treeOid: string | null;
  /** Caller-declared identities; not verified configuration/dependency object evidence. */
  readonly configHash: string;
  readonly dependencyHash: string;
  readonly snapshotId?: string | null;
  readonly policyVersion?: string | null;
  readonly contentPolicyVersion?: string | null;
  readonly privacyBoundary?: string | null;
  readonly worktreeId?: string | null;
  readonly snapshotKind?: string | null;
  readonly historicalBounds: HistoricalBoundsDto | null;
  /** Optional data-pure evidence from a stable L4a capture; absent or mismatched stays `unstable-capture`. */
  readonly verifiedCapture?: VerifiedCaptureEvidenceDto | null;
}

export type CodeAnalysisState = "complete" | "partial" | "unavailable";

export interface ResolvedSymbolDto {
  readonly id: string;
  readonly slot: string;
  readonly name: string;
  readonly kind: string;
  readonly bodyHash: string;
  readonly contentHash: string;
  readonly treeOid: string | null;
  readonly path: string;
}

export interface ResolvedCallDto {
  readonly id: string;
  readonly slot: string;
  readonly from: string;
  readonly target: string;
  readonly targetSlot: string;
  readonly external: boolean;
  readonly path: string;
}

export interface ResolvedInheritanceDto {
  readonly id: string;
  readonly slot: string;
  readonly child: string;
  readonly parent: string;
  readonly path: string;
}

export interface UnresolvedFactDto {
  readonly kind: "unresolved-call" | "unresolved-type";
  readonly name: string;
  readonly fromId: string;
  readonly reason: string;
}

export interface CodeCoverageDto {
  readonly axis: "ast";
  readonly language: string;
  readonly state: "current" | "partial" | "unavailable";
  readonly reason: string;
}

export interface AnalyzeCodeOutcome {
  readonly state: CodeAnalysisState;
  readonly symbols: readonly ResolvedSymbolDto[];
  readonly calls: readonly ResolvedCallDto[];
  readonly inheritances: readonly ResolvedInheritanceDto[];
  readonly unresolved: readonly UnresolvedFactDto[];
  readonly coverage: CodeCoverageDto;
  readonly topologyHash: string;
  readonly parseCacheHit: boolean;
  readonly cacheHit: boolean;
  readonly declarationInventory?: DeclarationInventoryReceipt;
  readonly cacheMode?: "host-cache" | "no-cache";
  readonly cacheReason?: string;
  readonly diagnostics?: readonly string[];
  readonly inputProvenance?: { readonly configHash: "caller-declared"; readonly dependencyHash: "caller-declared" };
}

/** Content-verified declaration AND relation inventory, held by the operation.
 * Serialized or caller-built copies cannot verify; repair never accepts a completion label as proof. */
export interface DeclarationInventoryReceipt { readonly kind: "verified-declaration-inventory"; }
interface StoredInventory {
  readonly input: AnalyzeCodeInput;
  readonly parsed: ParsedUnit;
  readonly symbols: readonly ResolvedSymbolDto[];
}
const inventories = new WeakMap<DeclarationInventoryReceipt, StoredInventory>();
function inventoryReceipt(input: AnalyzeCodeInput, parsed: ParsedUnit, symbols: readonly ResolvedSymbolDto[]): DeclarationInventoryReceipt {
  const receipt: DeclarationInventoryReceipt = Object.freeze({ kind: "verified-declaration-inventory" });
  inventories.set(receipt, { input: structuredClone(input), parsed: structuredClone(parsed), symbols: structuredClone(symbols) });
  return receipt;
}

/** Input for verifying whole-file deletion against retained Git trees (L5-D). */
export interface VerifyFileDeletionInput {
  readonly scope: LiveScopeDto;
  readonly language: string;
  readonly path: string;
  readonly treeOid: string | null;
  readonly snapshotId?: string | null;
  readonly policyVersion?: string | null;
  readonly contentPolicyVersion?: string | null;
  readonly worktreeId?: string | null;
  readonly snapshotKind?: string | null;
  readonly historicalBounds: HistoricalBoundsDto | null;
}

/** Ports required to verify whole-file absence without a grammar or parse pass. */
export interface FileDeletionPorts {
  readonly objects: RetainedObjectsPort;
  readonly cache?: Pick<AnalysisCachePort, "authorize"> | null;
  readonly authorize?: (scope: LiveScopeDto) => void | Promise<void>;
}

/** Operation-held receipt proving that a path is absent in a verified Git tree (L5-D).
 * Serialized or caller-built copies cannot verify; legacy hints never substitute for it. */
export interface FileDeletionReceipt { readonly kind: "verified-file-deletion"; }
interface StoredFileDeletion {
  readonly input: VerifyFileDeletionInput;
  readonly algorithm: "sha1" | "sha256";
}
const fileDeletions = new WeakMap<FileDeletionReceipt, StoredFileDeletion>();
function fileDeletionReceipt(input: VerifyFileDeletionInput, algorithm: "sha1" | "sha256"): FileDeletionReceipt {
  const receipt: FileDeletionReceipt = Object.freeze({ kind: "verified-file-deletion" });
  fileDeletions.set(receipt, { input: structuredClone(input), algorithm });
  return receipt;
}

export interface VerifyFileDeletionOutcome {
  readonly state: "complete" | "partial";
  readonly deleted: boolean;
  readonly path: string;
  readonly treeOid: string | null;
  readonly coverage: CodeCoverageDto;
  readonly deletionReceipt?: FileDeletionReceipt;
  readonly reasons: readonly (typeof L5_REASONS)[number][];
}

/** Read-only view of an operation-held whole-file deletion receipt (returns fresh copies). */
export function readFileDeletionReceipt(receipt: FileDeletionReceipt): {
  readonly scope: LiveScopeDto;
  readonly treeOid: string | null;
  readonly path: string;
  readonly language: string;
  readonly snapshotId: string | null;
  readonly worktreeId: string | null;
} | null {
  const deletion = fileDeletions.get(receipt);
  if (!deletion) return null;
  return {
    scope: { tenant: deletion.input.scope.tenant, clone: deletion.input.scope.clone },
    treeOid: deletion.input.treeOid,
    path: deletion.input.path,
    language: deletion.input.language,
    snapshotId: deletion.input.snapshotId ?? null,
    worktreeId: deletion.input.worktreeId ?? null,
  };
}

/** Operation-held receipt authorizing emission of a typed CodeFileDeletionFactDto (L5-D). */
export interface FileDeletionPublicationReceipt { readonly kind: "verified-file-deletion-publication"; }
interface StoredFileDeletionPublication {
  readonly scope: LiveScopeDto;
  readonly worktreeId: string | null;
  readonly snapshotId: string | null;
  readonly beforeTree: QualifiedOid;
  readonly afterTree: QualifiedOid;
  readonly path: string;
  readonly language: string;
  readonly beforeContentHash: string;
  readonly beforeTopologyHash: string;
  readonly invalidatedSymbolIds: readonly string[];
  readonly invalidatedSlots: readonly string[];
  readonly unresolved: readonly UnresolvedFactDto[];
  readonly policyVersion: string;
}
const fileDeletionPublications = new WeakMap<FileDeletionPublicationReceipt, StoredFileDeletionPublication>();
function fileDeletionPublicationReceipt(record: StoredFileDeletionPublication): FileDeletionPublicationReceipt {
  const receipt: FileDeletionPublicationReceipt = Object.freeze({ kind: "verified-file-deletion-publication" });
  fileDeletionPublications.set(receipt, structuredClone(record));
  return receipt;
}

export interface CodeFileDeletionFactOptions {
  readonly pathBytes?: Uint8Array;
  readonly extractorVersion?: string;
  readonly resolverVersion?: string;
}

const CODE_FILE_DELETION_OPTION_KEYS: readonly string[] = [
  "pathBytes",
  "extractorVersion",
  "resolverVersion",
];

/** Emit a typed, validated CodeFileDeletionFactDto strictly from an operation-issued publication receipt. */
export function toCodeFileDeletionFact(
  publication: FileDeletionPublicationReceipt,
  options?: CodeFileDeletionFactOptions,
): CodeFileDeletionFactDto {
  const record = fileDeletionPublications.get(publication);
  if (!record) {
    throw new CodeAnalysisError("whole-file deletion publication requires an operation-issued publication receipt");
  }
  let opts: Partial<CodeFileDeletionFactOptions> = {};
  if (options !== undefined) {
    opts = snapshotPlainRecord(options, "whole-file deletion options", {
      allowedKeys: CODE_FILE_DELETION_OPTION_KEYS,
      unknownKeyVerb: "carry",
    });
  }
  const canonicalUtf8 = Buffer.from(record.path, "utf8");
  let pathBytes: Uint8Array;
  if (opts.pathBytes !== undefined) {
    if (!(opts.pathBytes instanceof Uint8Array) || !ArrayBuffer.isView(opts.pathBytes)) {
      throw new CodeAnalysisError("whole-file deletion pathBytes must be a Uint8Array");
    }
    const copy = Uint8Array.from(opts.pathBytes);
    if (!Buffer.from(copy).equals(canonicalUtf8)) {
      throw new CodeAnalysisError("whole-file deletion pathBytes must match the verified deleted path");
    }
    pathBytes = copy;
  } else {
    pathBytes = new Uint8Array(canonicalUtf8.buffer, canonicalUtf8.byteOffset, canonicalUtf8.byteLength).slice();
  }
  const fact: CodeFileDeletionFactDto = {
    kind: "code-file-deletion",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: record.scope.clone,
    worktreeId: record.worktreeId,
    snapshotId: record.snapshotId,
    beforeTree: { algorithm: record.beforeTree.algorithm, oid: record.beforeTree.oid },
    afterTree: { algorithm: record.afterTree.algorithm, oid: record.afterTree.oid },
    path: pathBytes,
    language: record.language,
    beforeContentHash: record.beforeContentHash,
    beforeTopologyHash: record.beforeTopologyHash,
    invalidatedSymbolIds: [...record.invalidatedSymbolIds],
    invalidatedSlots: [...record.invalidatedSlots],
    unresolved: record.unresolved.map((item) => ({
      unresolvedKind: item.kind,
      name: item.name,
      fromSymbolId: item.fromId,
      reason: item.reason,
    })),
    extractorVersion: opts.extractorVersion ?? ANALYSIS_EXTRACTOR_VERSION,
    resolverVersion: opts.resolverVersion ?? L5_RESOLVER_VERSION,
    policyVersion: record.policyVersion as BatchPolicyVersion,
  };
  const checked = validateCodeFileDeletionFact(fact);
  if (!checked.ok) throw new CodeAnalysisError(checked.errors.join(", "));
  return fact;
}

/** G2 consumes the same operation-held complete L5 inventory as repair.
 * A serialized receipt, caller-built outcome, completion label or local ID
 * cannot create evidence. Return copies, never mutable internal authority. */
export function readSymbolInventory(receipt: DeclarationInventoryReceipt): {
  readonly scope: LiveScopeDto; readonly treeOid: string | null; readonly path: string;
  readonly language: string; readonly contentHash: string; readonly symbols: readonly ResolvedSymbolDto[];
} | null {
  const inventory = inventories.get(receipt);
  if (!inventory) return null;
  return { scope: { ...inventory.input.scope }, treeOid: inventory.input.treeOid, path: inventory.input.path,
    language: inventory.input.language, contentHash: sha256Hex(inventory.input.content), symbols: structuredClone(inventory.symbols) };
}

export interface CodeAnalysisPorts {
  readonly cache?: AnalysisCachePort | null;
  readonly grammar: GrammarStatusPort;
  readonly objects: RetainedObjectsPort;
  readonly extractor: DeterministicParsePort;
}

const HEX64 = /^[0-9a-f]{64}$/;
const HEX_OID = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

/** Closed reason set (R7 + A11: contract terms reused, unit/context named). */
export const L5_REASONS = [
  "grammar-unavailable", "grammar-invalid", "syntax-incomplete",
  "git-unavailable", "object-missing", "object-invalid",
  "configuration-unavailable", "configuration-invalid", "dependency-unavailable",
  "bounds-unknown", "shallow-history", "unstable-capture", "backfill-incomplete",
  "policy-withheld", "comparison-provider-unavailable",
  "derivation-failed", "result-missing", "unrelated-histories", "attribution-unknown",
  "missing-key",
] as const;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || ArrayBuffer.isView(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function snapshotPlainRecord<T extends object>(
  value: T,
  label: string,
  options: {
    readonly reservedKeys?: readonly string[];
    readonly allowedKeys?: readonly string[];
    readonly unknownKeyVerb?: "carries" | "carry";
  } = {},
): { -readonly [K in keyof T]: T[K] } {
  if (!isPlainRecord(value)) {
    throw new CodeAnalysisError(`${label} must use plain records`);
  }
  const keys = Reflect.ownKeys(value);
  const reservedKeys = options.reservedKeys ?? [];
  const allowedKeys = options.allowedKeys;
  const unknownKeyVerb = options.unknownKeyVerb ?? "carries";
  if (
    keys.some(
      (key) => typeof key === "symbol" || reservedKeys.includes(key) || (allowedKeys !== undefined && !allowedKeys.includes(key)),
    )
  ) {
    throw new CodeAnalysisError(`${label} ${unknownKeyVerb} an unknown key: refused`);
  }
  return Object.fromEntries(keys.map((key) => [key, Reflect.get(value, key)])) as { -readonly [K in keyof T]: T[K] };
}

function snapshotReasonAnchorRecord<T extends object>(
  value: T,
  reservedKeys: readonly string[] = [],
): { -readonly [K in keyof T]: T[K] } {
  return snapshotPlainRecord(value, "reason-anchor input", { reservedKeys });
}

/** Snapshot a reference from pinned Git, G1 or P1 evidence supplied by the caller. */
export function toReasonAnchorFact(
  scope: ReasonAnchorFactDto["scope"],
  pin: ReasonAnchorPinDto,
): ReasonAnchorFactDto {
  const pinSnapshot = snapshotReasonAnchorRecord(pin, ["kind", "schemaVersion", "policyVersion", "scope"]);
  const scopeSnapshot = snapshotReasonAnchorRecord<LiveScope>(scope);
  if (scopeSnapshot.worktree === undefined) delete scopeSnapshot.worktree;

  const fact = {
    ...pinSnapshot,
    kind: "reason-anchor",
    schemaVersion: FACT_SCHEMA_VERSION,
    policyVersion: POLICY_VERSION,
    scope: scopeSnapshot,
  } satisfies ReasonAnchorFactDto;

  switch (fact.anchorKind) {
    case "code":
      fact.commit = snapshotReasonAnchorRecord(fact.commit);
      fact.blob = snapshotReasonAnchorRecord(fact.blob);
      if (!(fact.path instanceof Uint8Array) || !ArrayBuffer.isView(fact.path)) {
        throw new CodeAnalysisError("reason-anchor fact.path must be raw path bytes");
      }
      fact.path = new Uint8Array(fact.path);
      fact.range = snapshotReasonAnchorRecord(fact.range);
      if (fact.calculationVersion === undefined) delete fact.calculationVersion;
      break;
    case "commit":
      fact.commit = snapshotReasonAnchorRecord(fact.commit);
      break;
    case "pr":
      fact.repository = snapshotReasonAnchorRecord(fact.repository);
      break;
  }

  const checked = validateReasonAnchorFact(fact);
  if (!checked.ok) throw new CodeAnalysisError(checked.errors.join(", "));
  return fact;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
  return `{${entries.join(",")}}`;
}

function checkScope(scope: LiveScopeDto): void {
  if (scope === null || typeof scope !== "object") {
    throw new CodeAnalysisError("analysis scope must be an object carrying tenant and clone");
  }
  for (const field of ["tenant", "clone"] as const) {
    const value = scope[field];
    if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
      throw new CodeAnalysisError(`analysis scope.${field} must be a non-empty string without NUL`);
    }
  }
}

/** R3a versioned dialect function (extension/shebang/module-kind). */
export function resolveAnalysisDialect(path: string, language: string): { dialect: string; version: string } {
  const lower = path.toLowerCase();
  if (lower.endsWith(".mts")) return { dialect: `${language}:mts-module`, version: L5_DIALECT_VERSION };
  if (lower.endsWith(".cts")) return { dialect: `${language}:cts-commonjs`, version: L5_DIALECT_VERSION };
  if (lower.endsWith(".tsx")) return { dialect: `${language}:tsx`, version: L5_DIALECT_VERSION };
  const ext = lower.slice(lower.lastIndexOf(".") + 1);
  if (ext && ext !== lower) return { dialect: `${language}:${ext}`, version: L5_DIALECT_VERSION };
  return { dialect: `${language}:default`, version: L5_DIALECT_VERSION };
}

function checkInput(input: AnalyzeCodeInput): void {
  checkScope(input.scope);
  if (typeof input.language !== "string" || input.language.length === 0) {
    throw new CodeAnalysisError("analysis language must be a non-empty string");
  }
  if (typeof input.path !== "string" || input.path.length === 0 || input.path.includes("\0")) {
    throw new CodeAnalysisError("analysis path must be a non-empty string without NUL");
  }
  if (typeof input.content !== "string") {
    throw new CodeAnalysisError("analysis content must be a string of blob bytes");
  }
  if (input.treeOid !== null && (typeof input.treeOid !== "string" || !HEX_OID.test(input.treeOid))) {
    throw new CodeAnalysisError("analysis treeOid must be null or a 40/64 character hex OID");
  }
  for (const field of ["configHash", "dependencyHash"] as const) {
    if (typeof input[field] !== "string" || !HEX64.test(input[field])) {
      throw new CodeAnalysisError(`analysis ${field} must be a 64 character lowercase hex digest`);
    }
  }
  if (input.treeOid === null && (typeof input.snapshotId !== "string" || input.snapshotId.length === 0)) {
    throw new CodeAnalysisError("analysis snapshotId is required when treeOid is null (snapshot-bound analysis)");
  }
}

function checkPorts(ports: CodeAnalysisPorts): void {
  if (ports === null || typeof ports !== "object") {
    throw new CodeAnalysisError("analysis requires injected cache/grammar/objects/extractor ports");
  }
  const cache = ports.cache as AnalysisCachePort | undefined;
  if (cache != null && (typeof cache.load !== "function" || typeof cache.store !== "function" || typeof cache.authorize !== "function")) {
    throw new CodeAnalysisError("analysis requires an injected host cache port with load/store: no source-root default exists");
  }
  if (!ports.grammar || typeof ports.grammar.status !== "function") {
    throw new CodeAnalysisError("analysis requires an injected grammar status port");
  }
  if (!ports.objects || typeof ports.objects.loadBlob !== "function") {
    throw new CodeAnalysisError("analysis requires an injected retained-object port (lazy R1 reads)");
  }
  if (!ports.extractor || typeof ports.extractor.parse !== "function") {
    throw new CodeAnalysisError("analysis requires an injected deterministic extractor port (no eager history AST)");
  }
}

const VERIFIED_CAPTURE_KEYS: readonly string[] = [
  "stable",
  "scope",
  "worktreeId",
  "snapshotId",
  "path",
  "contentFingerprint",
  "indexDigest",
  "attrFingerprint",
  "attempts",
  "snapshotKind",
];

const VERIFIED_CAPTURE_SCOPE_KEYS: readonly string[] = ["tenant", "clone", "worktree"];

function hasMatchingVerifiedCapture(input: AnalyzeCodeInput): boolean {
  const ev = input.verifiedCapture;
  if (ev === undefined || ev === null || !isPlainRecord(ev)) return false;
  const keys = Reflect.ownKeys(ev);
  if (keys.some((key) => typeof key === "symbol" || !VERIFIED_CAPTURE_KEYS.includes(key))) return false;
  if (ev.stable !== true) return false;
  if (!isPlainRecord(ev.scope)) return false;
  const scopeKeys = Reflect.ownKeys(ev.scope);
  if (scopeKeys.some((key) => typeof key === "symbol" || !VERIFIED_CAPTURE_SCOPE_KEYS.includes(key))) return false;
  const evScope = ev.scope as { tenant?: unknown; clone?: unknown; worktree?: unknown };
  if (evScope.tenant !== input.scope.tenant || evScope.clone !== input.scope.clone) return false;
  if (typeof ev.worktreeId !== "string" || ev.worktreeId.length === 0 || ev.worktreeId.includes("\0")) return false;
  if (typeof input.worktreeId !== "string" || input.worktreeId !== ev.worktreeId) return false;
  const inputScopeWorktree = (input.scope as { readonly worktree?: unknown }).worktree;
  if (inputScopeWorktree !== undefined && inputScopeWorktree !== ev.worktreeId) return false;
  if (evScope.worktree !== undefined && evScope.worktree !== ev.worktreeId) return false;
  if (typeof ev.snapshotId !== "string" || ev.snapshotId.length === 0 || ev.snapshotId.includes("\0")) return false;
  if (typeof input.snapshotId !== "string" || input.snapshotId !== ev.snapshotId) return false;
  if (typeof ev.path !== "string" || ev.path.length === 0 || ev.path.includes("\0")) return false;
  if (ev.path !== input.path) return false;
  if (typeof ev.contentFingerprint !== "string" || !HEX64.test(ev.contentFingerprint)) return false;
  if (ev.contentFingerprint !== sha256Hex(input.content)) return false;
  if (typeof ev.indexDigest !== "string" || !HEX64.test(ev.indexDigest)) return false;
  if (typeof ev.attrFingerprint !== "string" || !HEX64.test(ev.attrFingerprint)) return false;
  if (typeof ev.attempts !== "number" || !Number.isSafeInteger(ev.attempts) || ev.attempts < 1) return false;
  if (ev.snapshotKind !== undefined && ev.snapshotKind !== "index" && ev.snapshotKind !== "working-tree") return false;
  if (input.snapshotKind != null && ev.snapshotKind !== input.snapshotKind) return false;
  return true;
}

async function verifyAnalysisBounds(input: AnalyzeCodeInput, objects: RetainedObjectsPort): Promise<"bounds-unknown" | "shallow-history" | "unstable-capture" | null> {
  if (input.treeOid === null) {
    return hasMatchingVerifiedCapture(input) ? null : "unstable-capture";
  }
  const bounds = input.historicalBounds;
  if (!bounds?.known || bounds.missing?.length || !bounds.heads?.length) return "bounds-unknown";
  try {
    const graph = await verifyCommitGraph(bounds.heads, objects);
    if (![...graph.values()].some(commit => commit.tree === input.treeOid)) return "bounds-unknown";
    const algorithm = input.treeOid.length === 40 ? "sha1" as const : "sha256" as const;
    let tree: PinnedOidDto = { algorithm, oid: input.treeOid };
    const components = Buffer.from(input.path, "utf8").toString("latin1").split("/");
    for (const [index, component] of components.entries()) {
      const entries = (await verifyGitObject(tree, objects, "tree")).entries!;
      const entry = entries.find(item => item.name === component);
      if (!entry) return "bounds-unknown";
      if (index === components.length - 1) {
        if (entry.mode !== "100644" && entry.mode !== "100755") return "bounds-unknown";
        const blob = await verifyGitObject(entry.oid, objects, "blob");
        return Buffer.from(blob.body).equals(Buffer.from(input.content, "utf8")) ? null : "bounds-unknown";
      }
      if (entry.mode !== "40000") return "bounds-unknown";
      tree = entry.oid;
    }
  } catch (error) { return error instanceof Error && error.message.startsWith("shallow-history:") ? "shallow-history" : "bounds-unknown"; }
  return "bounds-unknown";
}

function isParsedUnit(value: unknown): value is ParsedUnit {
  if (value === null || typeof value !== "object") return false;
  const unit = value as Record<string, unknown>;
  if (!Array.isArray(unit.symbols) || !Array.isArray(unit.calls) || !Array.isArray(unit.inheritances)) return false;
  const nonEmpty = (v: unknown): boolean => typeof v === "string" && v.length > 0 && !v.includes("\0");
  if (!unit.symbols.every(s => s && nonEmpty(s.slot) && nonEmpty(s.name) && nonEmpty(s.kind) && nonEmpty(s.bodyHash))
    || !unit.calls.every(c => c && nonEmpty(c.slot) && nonEmpty(c.fromSlot) && nonEmpty(c.targetSlotOrName) && typeof c.external === "boolean")
    || !unit.inheritances.every(e => e && nonEmpty(e.slot) && nonEmpty(e.childSlot) && nonEmpty(e.parentSlotOrName)
      && (e.external === undefined || typeof e.external === "boolean"))) return false;
  if (typeof unit.topologyHash !== "string") return false;
  const syntax = unit.syntax as Record<string, unknown> | undefined;
  if (!syntax || typeof syntax !== "object") return false;
  return typeof syntax.rootSpansBytes === "boolean" && typeof syntax.hasError === "boolean"
    && typeof syntax.hasMissing === "boolean" && typeof syntax.walkComplete === "boolean";
}

/** R3: reject path-bound/absolute/scope-bound parse payloads as shared syntax. */
function assertSyntaxLocal(unit: ParsedUnit): void {
  const texts: string[] = [];
  for (const s of unit.symbols) texts.push(s.slot, s.name);
  for (const c of unit.calls) texts.push(c.slot, c.fromSlot, c.targetSlotOrName);
  for (const e of unit.inheritances) texts.push(e.slot, e.childSlot, e.parentSlotOrName);
  for (const text of texts) {
    if (typeof text !== "string" || text.length === 0 || text.includes("\0")) {
      throw new CodeAnalysisError("deterministic extractor returned an empty/NUL slot or name");
    }
    if (text.includes("/") || text.includes("\\") || text.includes("#") || text.startsWith("other-path")) {
      throw new CodeAnalysisError(`shared parse must be syntax-local: bound identity "${text.slice(0, 48)}" belongs to resolution`);
    }
  }
}

function emptyOutcome(
  language: string,
  state: CodeAnalysisState,
  coverageState: CodeCoverageDto["state"],
  reason: string,
): AnalyzeCodeOutcome {
  return {
    state,
    symbols: [],
    calls: [],
    inheritances: [],
    unresolved: [],
    coverage: { axis: "ast", language, state: coverageState, reason },
    topologyHash: "",
    parseCacheHit: false,
    cacheHit: false,
  };
}

/** R3b semantic identity digest (fact IDs; cache schema excluded — A9). */
function semanticDigestFor(input: AnalyzeCodeInput, dialect: string, grammarDigest: string, grammarAbi: string, grammarId: string): string {
  return sha256Hex(canonical({
    content: { sha256: sha256Hex(input.content) },
    dependencies: { digest: input.dependencyHash, provenance: "caller-declared" },
    config: { digest: input.configHash, provenance: "caller-declared" },
    dialect,
    grammar: { abi: grammarAbi, digest: grammarDigest, id: grammarId },
    language: input.language,
    path: input.path,
    scope: { clone: input.scope.clone, tenant: input.scope.tenant },
    source: input.treeOid !== null
      ? { tree: { algorithm: input.treeOid.length === 40 ? "sha1" : "sha256", oid: input.treeOid } }
      : {
        snapshotId: input.snapshotId ?? null,
        snapshotKind: input.snapshotKind ?? null,
        worktreeId: input.worktreeId ?? null,
      },
    versions: {
      extractor: ANALYSIS_EXTRACTOR_VERSION,
      factSchema: L5_FACT_SCHEMA_VERSION,
      resolver: L5_RESOLVER_VERSION,
      semantic: L5_SEMANTIC_IDENTITY_VERSION,
    },
  }));
}

function factId(semanticDigest: string, slot: string, kind: string, role: string, occurrence: number): string {
  return sha256Hex([semanticDigest, slot, kind, role, String(occurrence)].join("\0"));
}

function cacheContextFor(
  input: AnalyzeCodeInput,
  contentHash: string,
  dialect: string,
  grammarVersion: string,
  grammarDigest: string,
  grammarAbi: string,
  grammarId: string,
  parseOnly: boolean,
): AnalysisContextDto {
  return {
    clone: input.scope.clone,
    configHash: input.configHash,
    contentPolicyVersion: input.contentPolicyVersion ?? null,
    contentSha256: contentHash,
    dependencyHash: input.dependencyHash,
    dialect,
    dialectVersion: L5_DIALECT_VERSION,
    extractorVersion: ANALYSIS_EXTRACTOR_VERSION,
    grammarAbi,
    grammarId,
    grammarDigest,
    grammarVersion,
    language: input.language,
    path: parseOnly ? "" : input.path,
    policyVersion: input.policyVersion ?? null,
    privacyBoundary: input.privacyBoundary ?? null,
    resolverVersion: L5_RESOLVER_VERSION,
    snapshotId: input.snapshotId ?? null,
    snapshotKind: input.snapshotKind ?? null,
    tenant: input.scope.tenant,
    treeOid: input.treeOid,
    worktreeId: input.worktreeId ?? null,
  };
}

/**
 * Analyze one blob in one context (R1/R2/R5/R7). Lazy at every layer;
 * grammar is re-probed even on warm hits (R5); coverage is recomputed,
 * never taken from the cache (R7); failed/partial/unavailable aggregates
 * are never reused as success (R5/R7).
 */
export async function analyzeCode(input: AnalyzeCodeInput, ports: CodeAnalysisPorts): Promise<AnalyzeCodeOutcome> {
  const diagnostics: string[] = [];
  const outcome = await analyzeCodePinned(structuredClone(input), ports, diagnostics);
  const cacheMode = ports.cache != null && input.treeOid !== null ? "host-cache" : "no-cache";
  return { ...outcome, diagnostics, inputProvenance: { configHash: "caller-declared", dependencyHash: "caller-declared" },
    cacheMode, cacheReason: cacheMode === "host-cache" ? "injected authorized host cache"
    : input.treeOid === null ? "private persistence disabled pending sealed latest-only storage" : "no host cache configured" };
}

async function analyzeCodePinned(input: AnalyzeCodeInput, ports: CodeAnalysisPorts, diagnostics: string[]): Promise<AnalyzeCodeOutcome> {
  checkInput(input);
  checkPorts(ports);

  // R5a single grammar point (A3): record the requesting unit; a null or
  // failed load is grammar-unavailable, never an empty success. Without an
  // injected usable handle there is no source-root resolution.
  let grammar: GrammarStatusDto;
  try { grammar = await ports.grammar.status(input.language); }
  catch { return emptyOutcome(input.language, "unavailable", "unavailable", "grammar-unavailable: current grammar probe failed"); }
  if (grammar === null || typeof grammar !== "object" || (grammar.state !== "available" && grammar.state !== "unavailable")) {
    throw new CodeAnalysisError(`grammar port returned an invalid status for "${input.language}"`);
  }
  if (grammar.state === "unavailable") {
    return emptyOutcome(
      input.language,
      "unavailable",
      "unavailable",
      `grammar-unavailable: ${grammar.reason ?? `no packaged grammar is pinned for "${input.language}"`} (unit path "${input.path}")`,
    );
  }
  if (typeof grammar.version !== "string" || grammar.version.length === 0) {
    throw new CodeAnalysisError(`grammar port returned an empty version for available language "${input.language}"`);
  }
  const grammarBytes = grammar.bytes instanceof Uint8Array ? Uint8Array.from(grammar.bytes) : null;
  if (!grammarBytes || !WebAssembly.validate(grammarBytes) || !grammar.digest || !HEX64.test(grammar.digest)
    || createHash("sha256").update(grammarBytes).digest("hex") !== grammar.digest
    || !grammar.abi || !grammar.grammarId || typeof ports.grammar.load !== "function") {
    return emptyOutcome(input.language, "unavailable", "unavailable", `grammar-invalid: bytes/digest/ABI/runtime missing for unit "${input.path}"`);
  }
  const grammarDigest = grammar.digest;
  const grammarAbi = grammar.abi;
  const grammarId = grammar.grammarId;
  let grammarHandle: object | null;
  try { grammarHandle = await ports.grammar.load({ bytes: grammarBytes, abi: grammarAbi, language: input.language }); }
  catch { grammarHandle = null; }
  if (!grammarHandle || typeof grammarHandle !== "object") {
    return emptyOutcome(input.language, "unavailable", "unavailable", `grammar-invalid: verified bytes could not be loaded for unit "${input.path}"`);
  }
  const cache = new AnalysisCache(input.treeOid === null ? { authorize() {}, async load() { return null; }, async store() {} }
    : ports.cache ?? { authorize() {}, async load() { return null; }, async store() {} });
  if (ports.cache) await ports.cache.authorize(input.scope);
  const contentHash = sha256Hex(input.content);
  const { dialect } = resolveAnalysisDialect(input.path, input.language);

  // Committed parse identity excludes T/P/C/D; private identities bind the worktree slot.
  const parseContext = cacheContextFor(input, contentHash, dialect, grammar.version, grammarDigest, grammarAbi, grammarId, true);
  // Resolution identity binds everything (R2).
  const resolutionContext = cacheContextFor(input, contentHash, dialect, grammar.version, grammarDigest, grammarAbi, grammarId, false);

  // An unsigned cache cannot authenticate its own expected syntax inventory.
  // Shadow derivation uses the pinned input and usable grammar handle on every hit.
  let fresh: ParsedUnit;
  try {
    fresh = structuredClone(await ports.extractor.parse({ bytes: Buffer.from(input.content, "utf8"), content: input.content,
      dialect, language: input.language, grammarHandle, syntaxOptions: {} }));
  } catch (error) {
    if (!(error instanceof ParseUnavailableError)) throw error;
    return emptyOutcome(input.language, "unavailable", "unavailable", `parser-unavailable: ${error.message} (unit path "${input.path}")`);
  }
  if (!isParsedUnit(fresh)) throw new CodeAnalysisError("deterministic extractor returned invalid syntax evidence");
  assertSyntaxLocal(fresh);
  const parsed: ParsedUnit = fresh;
  const cachedParse = await cache.loadParse(parseContext);
  const parseCacheHit = cachedParse !== null && canonical(cachedParse) === canonical(fresh);
  // Private persistence remains disabled until the host supplies sealed latest-only storage.
  if (!parseCacheHit && input.treeOid !== null && fresh.syntax.rootSpansBytes && !fresh.syntax.hasError
    && !fresh.syntax.hasMissing && fresh.syntax.walkComplete) await cache.storeParse(parseContext, fresh).catch(() => {
      diagnostics.push("derivation-failed: parse cache integrity/storage failure; fresh analysis retained");
    });

  // R7b syntax completeness (A12): root spans every byte, no error, no
  // MISSING, walk-completion marker emitted. Incomplete syntax prevents
  // complete coverage even if every surviving node produced output (R7).
  const syntaxComplete = parsed.syntax.rootSpansBytes && !parsed.syntax.hasError
    && !parsed.syntax.hasMissing && parsed.syntax.walkComplete;
  const syntaxDetail = `syntax-incomplete: parser recovery for unit path "${input.path}" `
    + `(rootSpansBytes=${String(parsed.syntax.rootSpansBytes)} hasError=${String(parsed.syntax.hasError)} `
    + `hasMissing=${String(parsed.syntax.hasMissing)} walkComplete=${String(parsed.syntax.walkComplete)})`;

  const cachedResolution = await cache.loadResolution(resolutionContext);
  let symbols: readonly ResolvedSymbolDto[];
  let calls: readonly ResolvedCallDto[];
  let inheritances: readonly ResolvedInheritanceDto[];
  let unresolved: readonly UnresolvedFactDto[];
  let cacheHit = true;
  if (
    cachedResolution !== null && typeof cachedResolution === "object"
    && Array.isArray((cachedResolution as { symbols?: unknown }).symbols)
  ) {
    const stored = cachedResolution as {
      symbols: ResolvedSymbolDto[]; calls: ResolvedCallDto[]; inheritances: ResolvedInheritanceDto[]; unresolved: UnresolvedFactDto[];
      semanticDigest?: unknown; topologyHash?: unknown;
    };
    // R5.4/R7: validate scope/context/unit/provenance on every hit.
    const expectedSemantic = semanticDigestFor(input, dialect, grammarDigest, grammarAbi, grammarId);
    if (stored.semanticDigest !== expectedSemantic || stored.topologyHash !== parsed.topologyHash) {
      cacheHit = false;
      ({ calls, inheritances, symbols, unresolved } = await deriveAndStore());
    } else {
      symbols = stored.symbols;
      calls = stored.calls;
      inheritances = stored.inheritances;
      unresolved = stored.unresolved;
      // R7: missing/duplicate/foreign records invalidate completion even on hit.
      if (!resolutionMatchesParse(parsed, symbols, calls, inheritances, unresolved, expectedSemantic)) {
        cacheHit = false;
        ({ calls, inheritances, symbols, unresolved } = await deriveAndStore());
      }
    }
  } else {
    cacheHit = false;
    ({ calls, inheritances, symbols, unresolved } = await deriveAndStore());
  }

  /**
   * R3/R5.4 single binding path (M3): derivation AND hit validation share
   * this function, so a cached entry validates only when EVERY bound fact —
   * symbol names/kinds, call endpoints, inheritance edges, unresolved facts
   * — equals the full-key recomputation. Checksums alone never suffice.
   */
  function bindResolution(
    parsedUnit: ParsedUnit,
    semanticDigestValue: string,
    binding: { contentHash: string; path: string; treeOid: string | null; tenant: string },
  ): {
    symbols: ResolvedSymbolDto[]; calls: ResolvedCallDto[];
    inheritances: ResolvedInheritanceDto[]; unresolved: UnresolvedFactDto[];
  } {
    const boundSymbols: ResolvedSymbolDto[] = parsedUnit.symbols.map((symbol) => ({
      bodyHash: symbol.bodyHash,
      contentHash: binding.contentHash,
      id: factId(semanticDigestValue, symbol.slot, symbol.kind, "decl", 0),
      kind: symbol.kind,
      name: symbol.name,
      path: binding.path,
      slot: symbol.slot,
      treeOid: binding.treeOid,
    }));
    const slotToId = new Map(boundSymbols.map((s) => [s.slot, s.id]));
    const boundCalls: ResolvedCallDto[] = parsedUnit.calls.map((call, index) => {
      const occurrence = call.occurrence ?? index;
      const from = slotToId.get(call.fromSlot) ?? factId(semanticDigestValue, call.fromSlot, "function", "decl-ref", occurrence);
      const target = call.external
        ? `external:${call.targetSlotOrName}`
        : (slotToId.get(call.targetSlotOrName) ?? factId(semanticDigestValue, call.targetSlotOrName, "function", "decl-ref", occurrence));
      return {
        external: call.external,
        from,
        id: factId(semanticDigestValue, call.slot, "call", "edge", occurrence),
        path: binding.path,
        slot: call.slot,
        target,
        targetSlot: call.targetSlotOrName,
      };
    });
    const boundInheritances: ResolvedInheritanceDto[] = parsedUnit.inheritances.map((edge, index) => {
      const child = slotToId.get(edge.childSlot) ?? factId(semanticDigestValue, edge.childSlot, "class", "decl-ref", index);
      const parent = (edge.external ? undefined : slotToId.get(edge.parentSlotOrName)) ?? `external:${edge.parentSlotOrName}`;
      return {
        child,
        id: factId(semanticDigestValue, edge.slot, "inherits", "edge", index),
        parent,
        path: binding.path,
        slot: edge.slot,
      };
    });
    const scoped: UnresolvedFactDto[] = [];
    const knownSlots = new Set(parsedUnit.symbols.map((s) => s.slot));
    for (const call of parsedUnit.calls) {
      if (call.external && !knownSlots.has(call.targetSlotOrName)) {
        const from = slotToId.get(call.fromSlot) ?? call.fromSlot;
        scoped.push({
          fromId: from,
          kind: "unresolved-call",
          name: call.targetSlotOrName,
          reason: `unresolved-call: external target "${call.targetSlotOrName}" has no declaration in context path "${binding.path}" `
            + `(tenant ${binding.tenant}): left unresolved for cross-repository resolution`,
        });
      }
    }
    for (const edge of parsedUnit.inheritances) {
      if (edge.external || (!knownSlots.has(edge.parentSlotOrName)
        && !parsedUnit.symbols.some((s) => s.name === edge.parentSlotOrName))) {
        const from = slotToId.get(edge.childSlot) ?? edge.childSlot;
        scoped.push({
          fromId: from,
          kind: "unresolved-type",
          name: edge.parentSlotOrName,
          reason: `unresolved-type: parent "${edge.parentSlotOrName}" has no declaration in context path "${binding.path}" `
            + `(tenant ${binding.tenant}): left unresolved for cross-repository resolution`,
        });
      }
    }
    return { calls: boundCalls, inheritances: boundInheritances, symbols: boundSymbols, unresolved: scoped };
  }

  function currentBinding(): { contentHash: string; path: string; treeOid: string | null; tenant: string } {
    return { contentHash, path: input.path, tenant: input.scope.tenant, treeOid: input.treeOid };
  }

  async function deriveAndStore(): Promise<{
    symbols: ResolvedSymbolDto[]; calls: ResolvedCallDto[];
    inheritances: ResolvedInheritanceDto[]; unresolved: UnresolvedFactDto[];
  }> {
    const semanticDigest = semanticDigestFor(input, dialect, grammarDigest, grammarAbi, grammarId);
    const { calls: boundCalls, inheritances: boundInheritances, symbols: boundSymbols, unresolved: scoped } =
      bindResolution(parsed, semanticDigest, currentBinding());
    // Private persistence is disabled, rather than storing an unprotected journal.
    if (input.treeOid !== null && syntaxComplete) {
      await cache.storeResolution(resolutionContext, {
        calls: boundCalls,
        inheritances: boundInheritances,
        semanticDigest,
        symbols: boundSymbols,
        topologyHash: parsed.topologyHash,
        unresolved: scoped,
      }).catch(() => { diagnostics.push("derivation-failed: resolution cache integrity/storage failure; fresh analysis retained"); });
    }
    return { calls: boundCalls, inheritances: boundInheritances, symbols: boundSymbols, unresolved: scoped };
  }

  /**
   * M3 full-key validation: recompute the entire bound resolution from the
   * parsed unit under the current full key (context, path, content) and
   * require deep equality — symbol names/kinds, call endpoints, inheritance
   * edges and unresolved facts included. A foreign entry with a recomputed
   * checksum still mismatches and becomes a miss.
   */
  function resolutionMatchesParse(
    parse: ParsedUnit,
    boundSymbols: readonly ResolvedSymbolDto[],
    boundCalls: readonly ResolvedCallDto[],
    boundEdges: readonly ResolvedInheritanceDto[],
    boundUnresolved: readonly UnresolvedFactDto[],
    semanticDigest: string,
  ): boolean {
    if (!Array.isArray(boundSymbols) || !Array.isArray(boundCalls) || !Array.isArray(boundEdges) || !Array.isArray(boundUnresolved)) return false;
    const expected = bindResolution(parse, semanticDigest, currentBinding());
    if (boundSymbols.length !== expected.symbols.length) return false;
    if (boundCalls.length !== expected.calls.length) return false;
    if (boundEdges.length !== expected.inheritances.length) return false;
    if (boundUnresolved.length !== expected.unresolved.length) return false;
    const same = (actual: unknown, wanted: unknown): boolean => canonical(actual) === canonical(wanted);
    if (!same(boundSymbols, expected.symbols)) return false;
    if (!same(boundCalls, expected.calls)) return false;
    if (!same(boundEdges, expected.inheritances)) return false;
    if (!same(boundUnresolved, expected.unresolved)) return false;
    // No duplicate versioned IDs in the stored entry.
    const ids = new Set<string>();
    for (const symbol of boundSymbols) {
      if (ids.has(symbol.id)) return false;
      ids.add(symbol.id);
    }
    for (const call of boundCalls) {
      if (ids.has(call.id)) return false;
      ids.add(call.id);
    }
    for (const edge of boundEdges) {
      if (ids.has(edge.id)) return false;
      ids.add(edge.id);
    }
    return true;
  }

  // R7 expected-work manifest (independent of result arrays): syntax must be
  // complete AND every parsed slot must bind exactly once with no
  // duplicates/foreign records. Verified-empty (complete syntax + zero
  // yield + walk marker) is valid; empty alone proves nothing (R7/R7b).
  const expectedUnits = parsed.symbols.length + parsed.calls.length + parsed.inheritances.length;
  const derivedUnits = symbols.length + calls.length + inheritances.length;
  const manifestOk = syntaxComplete && derivedUnits === expectedUnits
    && resolutionMatchesParse(parsed, symbols, calls, inheritances, unresolved, semanticDigestFor(input, dialect, grammarDigest, grammarAbi, grammarId));

  if (!syntaxComplete) {
    diagnostics.push(syntaxDetail);
    return {
      cacheHit,
      calls,
      coverage: { axis: "ast", language: input.language, reason: syntaxDetail, state: "partial" },
      inheritances,
      parseCacheHit,
      state: "partial",
      symbols,
      topologyHash: parsed.topologyHash,
      unresolved,
    };
  }

  // M5a bounds gate FIRST (R7/A11): unknown bounds cap below complete for
  // EVERY shape — including verified-empty. An empty result with unknown
  // bounds is partial, never complete/current.
  const boundsGap = await verifyAnalysisBounds(input, ports.objects);
  if (boundsGap) {
    const missing = input.historicalBounds?.missing;
    const detail = Array.isArray(missing) && missing.length > 0
      ? ` (missing bounds: ${missing.slice(0, 3).join(", ")})`
      : "";
    const gap = boundsGap === "unstable-capture" ? "local capture verification is unavailable" : `historical bounds are incomplete${detail}`;
    return {
      cacheHit,
      calls,
      coverage: {
        axis: "ast",
        language: input.language,
        reason: `${boundsGap}: ${gap} for unit path "${input.path}": analysis is partial, never complete`,
        state: "partial",
      },
      inheritances,
      parseCacheHit,
      state: "partial",
      symbols,
      topologyHash: parsed.topologyHash,
      unresolved,
    };
  }

  if (expectedUnits === 0) {
    // Verified-empty: complete syntax + walk marker with zero yield.
    return {
      declarationInventory: manifestOk ? inventoryReceipt(input, parsed, symbols) : undefined,
      cacheHit,
      calls,
      coverage: {
        axis: "ast",
        language: input.language,
        reason: `verified-empty: complete syntax with zero declarations in context ${input.treeOid ?? input.snapshotId}`,
        state: "current",
      },
      inheritances,
      parseCacheHit,
      state: manifestOk ? "complete" : "partial",
      symbols,
      topologyHash: parsed.topologyHash,
      unresolved,
    };
  }

  if (!manifestOk) {
    return {
      cacheHit,
      calls,
      coverage: {
        axis: "ast",
        language: input.language,
        reason: `result-missing: expected ${expectedUnits} bound units for unit path "${input.path}", derived ${derivedUnits}`,
        state: "partial",
      },
      inheritances,
      parseCacheHit,
      state: "partial",
      symbols,
      topologyHash: parsed.topologyHash,
      unresolved,
    };
  }

  return {
    declarationInventory: inventoryReceipt(input, parsed, symbols),
    cacheHit,
    calls,
    coverage: {
      axis: "ast",
      language: input.language,
      reason: `supplied grammar bytes verified and loaded with pinned bounds in context ${input.treeOid ?? input.snapshotId}`,
      state: "current",
    },
    inheritances,
    parseCacheHit,
    state: "complete",
    symbols,
    topologyHash: parsed.topologyHash,
    unresolved,
  };
}

function checkCanonicalPath(path: string, label: string): void {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0")) {
    throw new CodeAnalysisError(`${label} must be a non-empty string without NUL`);
  }
  if (path.startsWith("/") || path.endsWith("/")) {
    throw new CodeAnalysisError(`${label} must be a canonical relative Git path`);
  }
  const parts = path.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new CodeAnalysisError(`${label} must be a canonical relative Git path`);
  }
}

function checkDeletionInput(input: VerifyFileDeletionInput): void {
  checkScope(input.scope);
  if (typeof input.language !== "string" || input.language.length === 0 || input.language.includes("\0")) {
    throw new CodeAnalysisError("deletion language must be a non-empty string without NUL");
  }
  checkCanonicalPath(input.path, "deletion path");
  if (input.treeOid !== null && (typeof input.treeOid !== "string" || !HEX_OID.test(input.treeOid))) {
    throw new CodeAnalysisError("deletion treeOid must be null or a 40/64 character hex OID");
  }
  if (input.treeOid === null && (typeof input.snapshotId !== "string" || input.snapshotId.length === 0)) {
    throw new CodeAnalysisError("deletion snapshotId is required when treeOid is null (snapshot-bound deletion)");
  }
}

function checkDeletionPorts(ports: FileDeletionPorts): void {
  if (ports === null || typeof ports !== "object") {
    throw new CodeAnalysisError("deletion verification requires injected retained-object ports");
  }
  if (!ports.objects || typeof ports.objects.loadBlob !== "function") {
    throw new CodeAnalysisError("deletion verification requires an injected retained-object port (lazy R1 reads)");
  }
  if (ports.cache != null && typeof ports.cache.authorize !== "function") {
    throw new CodeAnalysisError("deletion verification cache port must expose authorize");
  }
  if (ports.authorize != null && typeof ports.authorize !== "function") {
    throw new CodeAnalysisError("deletion verification authorize port must be a function");
  }
}

async function verifyDeletionBounds(
  input: VerifyFileDeletionInput,
  objects: RetainedObjectsPort,
): Promise<
  | { readonly ok: true; readonly algorithm: "sha1" | "sha256" }
  | {
      readonly ok: false;
      readonly reasonCode: "unstable-capture" | "bounds-unknown" | "shallow-history" | "object-missing" | "object-invalid" | "result-missing";
      readonly detail: string;
    }
> {
  if (input.treeOid === null) {
    return {
      ok: false,
      reasonCode: "unstable-capture",
      detail: `unstable-capture: local capture verification is unavailable for unit path "${input.path}": whole-file deletion is partial, never complete`,
    };
  }
  const bounds = input.historicalBounds;
  if (!bounds?.known || bounds.missing?.length || !bounds.heads?.length) {
    const missing = bounds?.missing;
    const suffix = Array.isArray(missing) && missing.length > 0 ? ` (missing bounds: ${missing.slice(0, 3).join(", ")})` : "";
    return {
      ok: false,
      reasonCode: "bounds-unknown",
      detail: `bounds-unknown: historical bounds are incomplete${suffix} for unit path "${input.path}": whole-file deletion is partial, never complete`,
    };
  }
  try {
    const graph = await verifyCommitGraph(bounds.heads, objects);
    const algorithm = input.treeOid.length === 40 ? ("sha1" as const) : ("sha256" as const);
    if (![...graph.entries()].some(([commitKey, commit]) => commitKey.startsWith(`${algorithm}:`) && commit.tree === input.treeOid)) {
      return {
        ok: false,
        reasonCode: "bounds-unknown",
        detail: `bounds-unknown: tree ${input.treeOid} is not bound to verified historical heads for unit path "${input.path}"`,
      };
    }
    let tree: PinnedOidDto = { algorithm, oid: input.treeOid };
    const components = Buffer.from(input.path, "utf8").toString("latin1").split("/");
    for (const [index, component] of components.entries()) {
      const entries = (await verifyGitObject(tree, objects, "tree")).entries!;
      const entry = entries.find((item) => item.name === component);
      if (!entry) {
        return { ok: true, algorithm };
      }
      if (index === components.length - 1) {
        return {
          ok: false,
          reasonCode: "result-missing",
          detail: `result-missing: unit path "${input.path}" is still present in tree ${input.treeOid} (mode ${entry.mode}): whole-file deletion withheld`,
        };
      }
      if (entry.mode !== "40000") {
        // Ancestor path is a non-directory entry (file/symlink/gitlink), so the nested path cannot exist.
        return { ok: true, algorithm };
      }
      tree = entry.oid;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const reasonCode = message.startsWith("shallow-history:")
      ? "shallow-history"
      : message.startsWith("object-missing:")
        ? "object-missing"
        : message.startsWith("object-invalid:")
          ? "object-invalid"
          : "bounds-unknown";
    return {
      ok: false,
      reasonCode,
      detail: `${reasonCode}: could not verify tree absence for unit path "${input.path}": whole-file deletion is partial, never complete`,
    };
  }
  return {
    ok: false,
    reasonCode: "bounds-unknown",
    detail: `bounds-unknown: tree absence could not be established for unit path "${input.path}"`,
  };
}

/**
 * Verify whole-file absence against retained Git objects and issue an opaque
 * operation-held FileDeletionReceipt (L5-D). Fails closed on present paths,
 * typechanges, missing/corrupt trees, shallow/unknown bounds and unverified
 * local captures (`treeOid === null`).
 */
export async function verifyFileDeletion(
  input: VerifyFileDeletionInput,
  ports: FileDeletionPorts,
): Promise<VerifyFileDeletionOutcome> {
  if (typeof input !== "object" || input === null || Array.isArray(input) || ArrayBuffer.isView(input)) {
    throw new CodeAnalysisError("deletion input must be a plain object");
  }
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) {
    throw new CodeAnalysisError("deletion input must be a plain object");
  }
  let pinned: VerifyFileDeletionInput;
  try {
    pinned = structuredClone(input);
  } catch {
    throw new CodeAnalysisError("deletion input must be data-pure and cloneable");
  }
  checkDeletionInput(pinned);
  checkDeletionPorts(ports);

  if (ports.authorize) await ports.authorize({ tenant: pinned.scope.tenant, clone: pinned.scope.clone });
  if (ports.cache) await ports.cache.authorize({ tenant: pinned.scope.tenant, clone: pinned.scope.clone });

  const verified = await verifyDeletionBounds(pinned, ports.objects);
  if (!verified.ok) {
    return {
      state: "partial",
      deleted: false,
      path: pinned.path,
      treeOid: pinned.treeOid,
      coverage: {
        axis: "ast",
        language: pinned.language,
        state: "partial",
        reason: verified.detail,
      },
      reasons: [verified.reasonCode],
    };
  }

  return {
    state: "complete",
    deleted: true,
    path: pinned.path,
    treeOid: pinned.treeOid,
    coverage: {
      axis: "ast",
      language: pinned.language,
      state: "current",
      reason: `verified-file-deletion: path "${pinned.path}" is absent in verified tree ${pinned.treeOid}`,
    },
    deletionReceipt: fileDeletionReceipt(pinned, verified.algorithm),
    reasons: [],
  };
}

export interface RepairExternalCaller {
  readonly id: string;
  readonly from: string;
  readonly target: string;
  readonly targetSlot?: string | null;
  readonly external: boolean;
}

export interface RepairAffectedInput {
  readonly before: ParsedUnit | { symbols: readonly (LocalSymbol | LegacySymbol)[]; calls: readonly unknown[]; inheritances: readonly unknown[]; topologyHash: string };
  /** Parsed unit for the updated file, or null when repairing a whole-file deletion (L5-D). */
  readonly after: ParsedUnit | { symbols: readonly (LocalSymbol | LegacySymbol)[]; calls: readonly unknown[]; inheritances: readonly unknown[]; topologyHash: string } | null;
  /** Calls from OTHER files into this file's symbols (cross-file edges). */
  readonly externalCallers: readonly RepairExternalCaller[];
  /** Optional downgrade only. Completeness is computed from operation-issued inventories. */
  readonly afterCompleteness?: "complete" | "partial";
  /**
   * R9 deletion evidence: only operation-issued before/after inventories or a
   * before inventory paired with an operation-issued whole-file deletion receipt
   * (L5-D) can authorize publication. The legacy deletedSlots/completeInventory
   * forms remain inert downgrade-only inputs: they never prove deletion or
   * completeness. Without verified receipts, prior callers are preserved as pending.
   */
  readonly deletionEvidence?: { readonly deletedSlots: readonly string[] }
    | { readonly completeInventory: true } | { readonly completeInventory: false }
    | { readonly before: DeclarationInventoryReceipt; readonly after: DeclarationInventoryReceipt }
    | { readonly before: DeclarationInventoryReceipt; readonly deletedFile: FileDeletionReceipt };
}

export interface RepairAffectedOutcome {
  readonly symbols: readonly LocalSymbol[];
  readonly calls: readonly (LocalCall | LegacyCall)[];
  readonly preservedExternalCallers: readonly RepairExternalCaller[];
  readonly inheritances: readonly LocalInheritance[];
  /** Slots whose content-derived facts die (removed, or same slot new body). */
  readonly invalidatedSymbolIds: readonly string[];
  readonly unresolved: readonly UnresolvedFactDto[];
  /** R9 publication boundary: partial repair is withheld from current. */
  readonly publishable: boolean;
  readonly coverageState: "current" | "partial";
  readonly coverageReasons: readonly (typeof L5_REASONS)[number][];
  readonly coverageReason: string;
  /** Present only when a verified whole-file deletion is publishable (L5-D). */
  readonly deletionPublication?: FileDeletionPublicationReceipt;
}

function slotOfSymbol(symbol: LocalSymbol | LegacySymbol): string {
  if (typeof (symbol as LocalSymbol).slot === "string") return (symbol as LocalSymbol).slot;
  const id = (symbol as LegacySymbol).id;
  const hash = id.includes("#") ? id.slice(id.indexOf("#") + 1) : id;
  return hash.includes(":") ? hash : `legacy:${(symbol as LegacySymbol).name}`;
}

function nameOfSymbol(symbol: LocalSymbol | LegacySymbol): string {
  return (symbol as LocalSymbol | LegacySymbol).name;
}

function kindOfSymbol(symbol: LocalSymbol | LegacySymbol): string {
  return (symbol as LocalSymbol | LegacySymbol).kind;
}

function bodyOfSymbol(symbol: LocalSymbol | LegacySymbol): string {
  return (symbol as LocalSymbol | LegacySymbol).bodyHash;
}

function edgeChildSlot(edge: LocalInheritance | LegacyInheritance): string {
  if (typeof (edge as LocalInheritance).childSlot === "string") return (edge as LocalInheritance).childSlot;
  const child = (edge as LegacyInheritance).child;
  return child.includes("#") ? child.slice(child.indexOf("#") + 1) : child;
}

function edgeParentSlot(edge: LocalInheritance | LegacyInheritance): string {
  if (typeof (edge as LocalInheritance).parentSlotOrName === "string") return (edge as LocalInheritance).parentSlotOrName;
  return (edge as LegacyInheritance).parent;
}

function callerTargetSlot(caller: RepairExternalCaller): string {
  if (typeof caller.targetSlot === "string" && caller.targetSlot.length > 0) return caller.targetSlot;
  const target = caller.target;
  if (target.includes("#")) return target.slice(target.indexOf("#") + 1);
  return target;
}

/**
 * Reconcile affected calls/inheritance after a file change (R9). Bytes
 * decide invalidation; topology never validates. Missing symbols in a
 * PARTIAL result are unknown: prior callers/edges are preserved in the
 * prior generation, pending/stale coverage is reported, and the partially
 * repaired replacement is withheld from publication. Confirmed deletion
 * (complete inventory + evidence) yields scoped unresolved facts without
 * deleting surviving caller declarations.
 */
export function repairAffectedCalls(input: RepairAffectedInput): RepairAffectedOutcome {
  if (input === null || typeof input !== "object") {
    throw new CodeAnalysisError("repair requires before/after parsed units and external callers");
  }
  const beforeUnit = (input as unknown as Record<string, unknown>).before as Record<string, unknown> | undefined;
  if (!beforeUnit || typeof beforeUnit !== "object" || !Array.isArray(beforeUnit.symbols)) {
    throw new CodeAnalysisError("repair.before must be a parsed unit");
  }
  const afterUnit = (input as unknown as Record<string, unknown>).after as Record<string, unknown> | null | undefined;
  if (afterUnit !== null && (!afterUnit || typeof afterUnit !== "object" || !Array.isArray(afterUnit.symbols))) {
    throw new CodeAnalysisError("repair.after must be a parsed unit or null");
  }
  if (!Array.isArray(input.externalCallers)) {
    throw new CodeAnalysisError("repair.externalCallers must be an array");
  }
  if (input.afterCompleteness !== undefined && input.afterCompleteness !== "complete" && input.afterCompleteness !== "partial") {
    throw new CodeAnalysisError('repair.afterCompleteness must be "complete" or "partial"');
  }
  // The expected declarations AND relations come from the content-verified parse
  // or tree-absence receipt, held privately in operation WeakMaps. A label (even
  // with no missing declarations) cannot establish a denominator or authorize
  // dropping a relation.
  const receiptPair = readReceiptPair(input);
  const verified = verifyRepairEvidence(input, receiptPair);
  const completeness = verified && input.afterCompleteness !== "partial" ? "complete" : "partial";
  const reasons = new Set<(typeof L5_REASONS)[number]>();
  if (!verified) reasons.add("result-missing");
  if (!receiptPair) reasons.add("missing-key");
  const syntax = input.after === null ? undefined : (input.after as ParsedUnit).syntax;
  if (syntax && (!syntax.rootSpansBytes || syntax.hasError || syntax.hasMissing || !syntax.walkComplete)) reasons.add("syntax-incomplete");
  if (input.afterCompleteness === "partial") reasons.add("backfill-incomplete");
  const beforeSymbols = (input.before.symbols ?? []) as (LocalSymbol | LegacySymbol)[];
  const afterSymbols = (input.after === null ? [] : (input.after.symbols ?? [])) as (LocalSymbol | LegacySymbol)[];
  const beforeBySlot = new Map(beforeSymbols.map((s) => [slotOfSymbol(s), s]));
  const afterBySlot = new Map(afterSymbols.map((s) => [slotOfSymbol(s), s]));
  const missingSlots = [...beforeBySlot.keys()].filter(slot => !afterBySlot.has(slot));
  const pending = new Set(missingSlots.filter(slot => !deletionConfirmed(slot, verified)));

  const invalidated: string[] = [];
  for (const [slot, beforeSymbol] of beforeBySlot) {
    const afterSymbol = afterBySlot.get(slot);
    if (afterSymbol === undefined) {
      // R9: omission alone never proves deletion — only a COMPLETE result
      // with deletion evidence invalidates the missing slot here. Partial
      // omission stays unknown (preserved below, unpublished).
      if (completeness === "complete" && deletionConfirmed(slot, verified)) {
        invalidated.push(slot);
      }
    } else if (bodyOfSymbol(afterSymbol) !== bodyOfSymbol(beforeSymbol)) {
      invalidated.push(slot);
    }
  }

  const survivingSlots = new Set(afterBySlot.keys());
  const survivingNames = new Set(afterSymbols.map(nameOfSymbol));
  const preserved: RepairExternalCaller[] = [];
  const unresolved: UnresolvedFactDto[] = [];
  for (const caller of input.externalCallers) {
    const targetSlot = callerTargetSlot(caller);
    if (survivingSlots.has(targetSlot)) {
      preserved.push(caller);
      continue;
    }
    // Target missing after the edit or whole-file deletion.
    if (completeness === "partial" || !deletionConfirmed(targetSlot, verified)) {
      // R9: unknown in a partial result — preserve the prior caller edge,
      // report pending coverage, withhold from publication.
      preserved.push(caller);
      pending.add(targetSlot);
      continue;
    }
    unresolved.push({
      fromId: caller.from,
      kind: "unresolved-call",
      name: caller.target,
      reason: verified?.mode === "whole-file-deletion"
        ? `unresolved-call: caller target slot "${targetSlot}" has confirmed whole-file deletion: `
          + `kept as an unresolved fact, never deleted by a partial repair`
        : `unresolved-call: caller target slot "${targetSlot}" has confirmed deletion after the edit: `
          + `kept as an unresolved fact, never deleted by a partial repair`,
    });
  }

  const beforeEdges = ((input.before as { inheritances?: readonly unknown[] }).inheritances ?? []) as (LocalInheritance | LegacyInheritance)[];
  const afterEdges = input.after === null
    ? []
    : [...(((input.after as { inheritances?: readonly unknown[] }).inheritances ?? []) as (LocalInheritance | LegacyInheritance)[])];
  if (completeness === "partial" || pending.size) {
    const slotOf = (edge: LocalInheritance | LegacyInheritance): string => "slot" in edge ? edge.slot : edge.id;
    for (const edge of beforeEdges) {
      const index = afterEdges.findIndex(after => slotOf(after) === slotOf(edge));
      if (index < 0) afterEdges.push(edge);
      else afterEdges[index] = edge; // pending repair preserves the published relation
    }
  }
  const inheritances: LocalInheritance[] = [];
  for (const edge of afterEdges) {
    const childSlot = edgeChildSlot(edge);
    const parentSlot = edgeParentSlot(edge);
    if (!survivingSlots.has(childSlot)) pending.add(childSlot);
    const external = "external" in edge && edge.external;
    if (!external && (survivingSlots.has(parentSlot) || survivingNames.has(parentSlot))) {
      inheritances.push(
        typeof (edge as LocalInheritance).childSlot === "string"
          ? (edge as LocalInheritance)
          : { childSlot, parentSlotOrName: parentSlot, slot: (edge as LegacyInheritance).id },
      );
      continue;
    }
    if (external || (!beforeBySlot.has(parentSlot) && !beforeSymbols.some(s => nameOfSymbol(s) === parentSlot))) {
      // A parent outside this unit was never a declaration to repair/delete.
      // Keep the relation and emit the explicit cross-file unresolved fact.
      inheritances.push(typeof (edge as LocalInheritance).childSlot === "string" ? edge as LocalInheritance
        : { childSlot, parentSlotOrName: parentSlot, slot: (edge as LegacyInheritance).id });
      unresolved.push({ fromId: childSlot, kind: "unresolved-type", name: parentSlot,
        reason: `unresolved-type: parent "${parentSlot}" is outside the analyzed unit` });
      continue;
    }
    if (completeness === "partial" || !deletionConfirmed(parentSlot, verified)) {
      // Ambiguous parent (rename/move/overload/nesting) stays pending until
      // resolved — the edge is preserved as-is, publication withheld.
      inheritances.push(
        typeof (edge as LocalInheritance).childSlot === "string"
          ? (edge as LocalInheritance)
          : { childSlot, parentSlotOrName: parentSlot, slot: (edge as LegacyInheritance).id },
      );
      pending.add(parentSlot);
      continue;
    }
    unresolved.push({
      fromId: childSlot,
      kind: "unresolved-type",
      name: parentSlot,
      reason: `unresolved-type: parent slot "${parentSlot}" has confirmed deletion after the edit: kept as an unresolved fact`,
    });
    inheritances.push(typeof (edge as LocalInheritance).childSlot === "string" ? edge as LocalInheritance
      : { childSlot, parentSlotOrName: parentSlot, slot: (edge as LegacyInheritance).id });
  }

  // Body-only edits preserve valid callers through declaration
  // correspondence (slot, NOT versioned IDs and NOT names alone — R3).
  const expectedRelationsPresent = verified !== null && (
    verified.mode === "whole-file-deletion"
      ? inheritances.length === 0
      : canonical(inheritances) === canonical(verified.after.parsed.inheritances)
  );
  if (!expectedRelationsPresent) reasons.add("result-missing");
  const publishable = completeness === "complete" && expectedRelationsPresent && pending.size === 0
    && beforeBySlot.size === beforeSymbols.length && afterBySlot.size === afterSymbols.length;
  if (pending.size || beforeBySlot.size !== beforeSymbols.length || afterBySlot.size !== afterSymbols.length) reasons.add("result-missing");
  const coverageReason = publishable
    ? verified?.mode === "whole-file-deletion"
      ? "whole-file deletion repair complete: content-derived before inventory and tree absence receipt verified; publishable"
      : "repair complete: content-derived declaration and relation inventories verified; publishable"
    : `${[...reasons].join(", ")}: repair partial; prior relations preserved, replacement withheld from publication`;
  const calls = input.after === null ? [] : [...input.after.calls] as (LocalCall | LegacyCall)[];
  if (!publishable) {
    for (const call of (input.before.calls ?? []) as (LocalCall | LegacyCall)[]) {
      const slot = "slot" in call ? call.slot : call.id;
      const index = calls.findIndex(after => ("slot" in after ? after.slot : after.id) === slot);
      if (index < 0) calls.push(call); else calls[index] = call;
    }
  }

  let deletionPublication: FileDeletionPublicationReceipt | undefined;
  if (publishable && verified !== null && verified.mode === "whole-file-deletion") {
    const beforeTreeOid = verified.before.input.treeOid!;
    const afterTreeOid = verified.deletion.input.treeOid!;
    const alg = verified.deletion.algorithm;
    deletionPublication = fileDeletionPublicationReceipt({
      scope: { tenant: verified.before.input.scope.tenant, clone: verified.before.input.scope.clone },
      worktreeId: verified.deletion.input.worktreeId ?? null,
      snapshotId: verified.deletion.input.snapshotId ?? null,
      beforeTree: { algorithm: alg, oid: beforeTreeOid },
      afterTree: { algorithm: alg, oid: afterTreeOid },
      path: verified.before.input.path,
      language: verified.before.input.language,
      beforeContentHash: sha256Hex(verified.before.input.content),
      beforeTopologyHash: verified.before.parsed.topologyHash,
      invalidatedSymbolIds: verified.before.symbols.map((s) => s.id),
      invalidatedSlots: verified.before.symbols.map((s) => s.slot),
      unresolved,
      policyVersion:
        verified.deletion.input.policyVersion
        ?? verified.deletion.input.contentPolicyVersion
        ?? verified.before.input.policyVersion
        ?? verified.before.input.contentPolicyVersion
        ?? POLICY_VERSION,
    });
  }

  return {
    calls,
    coverageState: publishable ? "current" : "partial",
    coverageReasons: [...reasons],
    coverageReason,
    ...(deletionPublication !== undefined ? { deletionPublication } : {}),
    inheritances,
    invalidatedSymbolIds: invalidated,
    preservedExternalCallers: preserved,
    publishable,
    symbols: afterSymbols.map((s) => ({
      bodyHash: bodyOfSymbol(s),
      kind: kindOfSymbol(s),
      name: nameOfSymbol(s),
      slot: slotOfSymbol(s),
    })),
    unresolved,
  };
}

type ReceiptPair =
  | { readonly mode: "edit"; readonly before: DeclarationInventoryReceipt; readonly after: DeclarationInventoryReceipt }
  | { readonly mode: "whole-file-deletion"; readonly before: DeclarationInventoryReceipt; readonly deletedFile: FileDeletionReceipt };

type VerifiedRepair =
  | { readonly mode: "edit"; readonly before: StoredInventory; readonly after: StoredInventory }
  | { readonly mode: "whole-file-deletion"; readonly before: StoredInventory; readonly deletion: StoredFileDeletion };

function readReceiptPair(input: RepairAffectedInput): ReceiptPair | null {
  const evidence: unknown = input.deletionEvidence;
  if (!isPlainRecord(evidence)) return null;
  const keys = Reflect.ownKeys(evidence);
  const secondKey = input.after === null ? "deletedFile" : "after";
  if (keys.length !== 2 || !keys.includes("before") || !keys.includes(secondKey)) return null;
  const before = evidence.before;
  const second = evidence[secondKey];
  if (!isPlainRecord(before) || !isPlainRecord(second)) return null;
  return secondKey === "deletedFile"
    ? {
        mode: "whole-file-deletion",
        before: before as unknown as DeclarationInventoryReceipt,
        deletedFile: second as unknown as FileDeletionReceipt,
      }
    : {
        mode: "edit",
        before: before as unknown as DeclarationInventoryReceipt,
        after: second as unknown as DeclarationInventoryReceipt,
      };
}

function verifyRepairEvidence(input: RepairAffectedInput, pair: ReceiptPair | null): VerifiedRepair | null {
  if (!pair) return null;
  if (pair.mode === "whole-file-deletion") {
    if (input.after !== null) return null;
    const before = inventories.get(pair.before);
    const deletion = fileDeletions.get(pair.deletedFile);
    if (!before || !deletion) return null;
    const beforePolicy = before.input.policyVersion ?? before.input.contentPolicyVersion ?? POLICY_VERSION;
    const deletionPolicy = deletion.input.policyVersion ?? deletion.input.contentPolicyVersion ?? POLICY_VERSION;
    if (
      canonical(before.input.scope) !== canonical(deletion.input.scope)
      || before.input.path !== deletion.input.path
      || before.input.language !== deletion.input.language
      || (before.input.worktreeId ?? null) !== (deletion.input.worktreeId ?? null)
      || (before.input.snapshotId ?? null) !== (deletion.input.snapshotId ?? null)
      || before.input.treeOid === null
      || deletion.input.treeOid === null
      || before.input.treeOid === deletion.input.treeOid
      || before.input.treeOid.length !== deletion.input.treeOid.length
      || beforePolicy !== deletionPolicy
      || canonical(before.parsed) !== canonical(input.before)
    ) {
      return null;
    }
    return { mode: "whole-file-deletion", before, deletion };
  }
  if (input.after === null) return null;
  const before = inventories.get(pair.before);
  const after = inventories.get(pair.after);
  if (!before || !after || canonical(before.input.scope) !== canonical(after.input.scope)
    || before.input.path !== after.input.path || before.input.language !== after.input.language
    || canonical(before.parsed) !== canonical(input.before) || canonical(after.parsed) !== canonical(input.after)) return null;
  return { mode: "edit", before, after };
}

function deletionConfirmed(slot: string, verified: VerifiedRepair | null): boolean {
  if (!verified) return false;
  const { before } = verified;
  const old = before.parsed.symbols.filter(s => s.slot === slot);
  if (old.length !== 1 || new Set(before.parsed.symbols.map(s => s.slot)).size !== before.parsed.symbols.length) {
    return false;
  }
  if (verified.mode === "whole-file-deletion") return true;
  const { after } = verified;
  return new Set(after.parsed.symbols.map(s => s.slot)).size === after.parsed.symbols.length
    && !after.parsed.symbols.some(s => s.slot === slot || (s.name === old[0]!.name && s.kind === old[0]!.kind));
}
