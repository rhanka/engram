// @sentropic/engram-live/analysis-cache — L5 context-bound analysis caches
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3, 8; plan/09 L5; owner Q1 A;
//  L5-cache-design R1/R2/R5 + amendments A1/A8-A10).
//
// One canonical scoped identity scheme (R1):
//   K(kind, inputs) = "l5-cache/v2/" + kind + "/" + SHA256(canonical(
//     {schemaVersion, kind, scope, policy, inputs}))
// The injected capability authorizes the namespace BEFORE lookup (hashing
// is not authorization). Scope appears in both the canonical identity and
// the stored envelope.
//
// Four complete keys (R2): parse binds B/language/dialect/G/versions +
// S/Q envelope; resolution additionally binds T/P/C/D + resolver versions.
// Committed context-free parsing MAY exclude T/P/C/D (payload independence
// justified below); configuration marks code-body/grammar inputs
// not-applicable but keeps its own bytes + reader version mandatory.
//
// Reuse requires current validity (R5): authorization + source context are
// revalidated, grammar availability is re-probed even on warm hits, every
// key component + envelope/payload/completion is matched, mixed snapshots
// and failed prerequisites are rejected. Corrupt/foreign entries are
// misses; a key existing with a different payload digest is an integrity
// error (R5b, never last-writer-wins).
//
// Neutrality: node:crypto only. No h2a/cluster-mesh/sentropic/driver/
// network/filesystem/loader/LLM.

import { createHash } from "node:crypto";

export const ANALYSIS_CACHE_VERSION = "live-code-analysis/1";
export const ANALYSIS_EXTRACTOR_VERSION = "live-code-extraction/1";
/** R1 canonical schema version (cache keys, never fact identity). */
export const L5_CACHE_SCHEMA_VERSION = "l5-cache/v2";
/** R1 A-components pinned here (resolver + fact schema). */
export const L5_RESOLVER_VERSION = "live-code-resolver/1";
export const L5_FACT_SCHEMA_VERSION = "live-fact-schema/1";
export const L5_DIALECT_VERSION = "live-dialect/1";

export type AnalysisCacheKind = "parse" | "resolution";

export class AnalysisCacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisCacheError";
  }
}

export interface AnalysisScopeDto {
  readonly tenant: string;
  readonly clone: string;
}

/**
 * Full analysis context (spec §8 + R1/R2). S (tenant/clone) and Q
 * (contentPolicyVersion/privacyBoundary) apply to EVERY row. Parse binds
 * B/language/dialect/G/versions; resolution additionally binds T/P/C/D.
 * A null treeOid marks snapshot-bound analysis (binds worktree slot +
 * snapshotId instead of a tree). `not-applicable` inputs use the NA tag;
 * proven absence uses ABSENT; unknown uses UNKNOWN (R1: three distinct
 * tagged values, never conflated).
 */
export interface AnalysisContextDto {
  readonly contentSha256: string;
  readonly language: string;
  readonly dialect?: string | null;
  readonly dialectVersion?: string | null;
  readonly grammarVersion: string;
  readonly grammarDigest?: string | null;
  readonly grammarAbi?: string | null;
  readonly grammarId?: string | null;
  readonly extractorVersion: string;
  readonly resolverVersion?: string | null;
  readonly tenant: string;
  readonly clone: string;
  readonly contentPolicyVersion?: string | null;
  readonly privacyBoundary?: string | null;
  readonly treeOid: string | null;
  readonly path: string;
  readonly configHash: string;
  readonly dependencyHash: string;
  readonly snapshotId?: string | null;
  readonly policyVersion?: string | null;
  readonly worktreeId?: string | null;
  readonly snapshotKind?: string | null;
}

/** Tagged markers: absence / unknown / not-applicable stay distinct (R1). */
export const ABSENT = { $absent: true } as const;
export const UNKNOWN = { $unknown: true } as const;
export const NA = { $na: true } as const;

export interface AnalysisCachePort {
  load(key: string): Promise<string | null>;
  store(key: string, value: string): Promise<void>;
  /** Authorization gate (R1/R5.1): called BEFORE any load/store. */
  authorize(scope: AnalysisScopeDto): Promise<void> | void;
}

const HEX64 = /^[0-9a-f]{64}$/;
const HEX_OID = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

function fail(message: string): never {
  throw new AnalysisCacheError(message);
}

function requireHex64(value: unknown, field: string): void {
  if (typeof value !== "string" || !HEX64.test(value)) {
    fail(`analysis context.${field} must be a 64 character lowercase hex digest`);
  }
}

function requireNonEmpty(value: unknown, field: string): void {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail(`analysis context.${field} must be a non-empty string without NUL`);
  }
}

function requireScopeTenantClone(context: AnalysisContextDto): void {
  requireNonEmpty(context.tenant, "tenant");
  requireNonEmpty(context.clone, "clone");
  if (context.tenant.includes("/") && context.tenant.length === 0) fail("analysis context.tenant is empty");
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

function oidDescriptor(treeOid: string | null): unknown {
  if (treeOid === null) return NA;
  if (typeof treeOid !== "string" || !HEX_OID.test(treeOid)) {
    fail("analysis context.treeOid must be null or an algorithm-qualified hex OID (40 or 64 characters)");
  }
  return { algorithm: treeOid.length === 40 ? "sha1" : "sha256", oid: treeOid };
}

function checkParseFields(context: AnalysisContextDto): void {
  requireHex64(context.contentSha256, "contentSha256");
  requireNonEmpty(context.language, "language");
  requireNonEmpty(context.grammarVersion, "grammarVersion");
  requireNonEmpty(context.extractorVersion, "extractorVersion");
  requireScopeTenantClone(context);
  if (context.dialect !== undefined && context.dialect !== null
    && (typeof context.dialect !== "string" || context.dialect.length === 0 || context.dialect.includes("\0"))) {
    fail("analysis context.dialect, when present, must be a non-empty string without NUL");
  }
  for (const field of ["grammarDigest", "grammarAbi", "grammarId", "dialectVersion", "resolverVersion",
    "contentPolicyVersion", "privacyBoundary", "worktreeId", "snapshotKind"] as const) {
    const value = context[field];
    if (value !== undefined && value !== null
      && (typeof value !== "string" || value.length === 0 || (value.includes("\0")))) {
      fail(`analysis context.${field}, when present, must be a non-empty string without NUL`);
    }
  }
}

function checkResolutionFields(context: AnalysisContextDto): void {
  checkParseFields(context);
  oidDescriptor(context.treeOid);
  requireNonEmpty(context.path, "path");
  requireHex64(context.configHash, "configHash");
  requireHex64(context.dependencyHash, "dependencyHash");
  if (context.treeOid === null) {
    if (typeof context.snapshotId !== "string" || context.snapshotId.length === 0) {
      fail("analysis context.snapshotId is required when treeOid is null (snapshot-bound analysis)");
    }
  }
  for (const field of ["snapshotId", "policyVersion"] as const) {
    const value = context[field];
    if (value !== undefined && value !== null && (typeof value !== "string" || value.length === 0 || value.includes("\0"))) {
      fail(`analysis context.${field}, when present, must be a non-empty string without NUL`);
    }
  }
}

/** R1 scope block (authorization is a gate, not a hashed credential — A9). */
function scopeBlock(context: AnalysisContextDto): unknown {
  return { clone: context.clone, tenant: context.tenant };
}

/** R1 Q block (A9: content-policy version + privacy only, no auth revision). */
function policyBlock(context: AnalysisContextDto): unknown {
  return {
    contentPolicyVersion: context.contentPolicyVersion ?? NA,
    privacyBoundary: context.privacyBoundary ?? NA,
  };
}

function parseInputs(context: AnalysisContextDto): unknown {
  // R2a: private parse binds {worktreeId, snapshotKind} + B, never the
  // volatile snapshotId; committed bytes equal to the committed blob reuse
  // the committed parse (B-only + slot). Resolution keeps snapshot binding.
  const local = context.treeOid !== null
    ? NA
    : { snapshotKind: context.snapshotKind ?? NA, worktreeId: context.worktreeId ?? NA };
  return {
    content: { sha256: context.contentSha256 },
    dialect: context.dialect ?? NA,
    dialectVersion: context.dialectVersion ?? L5_DIALECT_VERSION,
    extractorVersion: context.extractorVersion,
    grammar: {
      abi: context.grammarAbi ?? NA,
      id: context.grammarId ?? NA,
      digest: context.grammarDigest ?? NA,
      version: context.grammarVersion,
    },
    language: context.language,
    local,
    syntaxOptions: NA,
  };
}

function resolutionInputs(context: AnalysisContextDto): unknown {
  return {
    config: { digest: context.configHash, provenance: "caller-declared" },
    dependencies: { digest: context.dependencyHash, provenance: "caller-declared" },
    factSchemaVersion: L5_FACT_SCHEMA_VERSION,
    parse: parseInputs(context),
    path: {
      entryKind: NA,
      mode: NA,
      pathBytes: context.path,
      stage: NA,
    },
    policyVersion: context.policyVersion ?? NA,
    resolverVersion: context.resolverVersion ?? L5_RESOLVER_VERSION,
    snapshot: context.treeOid !== null ? NA : {
      snapshotId: context.snapshotId ?? UNKNOWN,
      snapshotKind: context.snapshotKind ?? NA,
      worktreeId: context.worktreeId ?? NA,
    },
    source: context.treeOid !== null
      ? { tree: oidDescriptor(context.treeOid) }
      : {
        snapshotId: context.snapshotId ?? UNKNOWN,
        snapshotKind: context.snapshotKind ?? NA,
        sourceVectorDigest: NA,
        worktreeId: context.worktreeId ?? NA,
      },
  };
}

function canonicalPayload(context: AnalysisContextDto, kind: AnalysisCacheKind): string {
  if (kind !== "parse") checkResolutionFields(context);
  else checkParseFields(context);
  const body = {
    inputs: kind === "parse" ? parseInputs(context) : resolutionInputs(context),
    kind,
    policy: policyBlock(context),
    schemaVersion: L5_CACHE_SCHEMA_VERSION,
    scope: scopeBlock(context),
  };
  return canonical(body);
}

/**
 * Derive the opaque cache key for one context and layer (R1: one builder
 * for every cache, including reused extraction which now shares the
 * l5-cache/v2 prefix via src/cache liveExtractionKey).
 */
export function deriveAnalysisCacheKey(context: AnalysisContextDto, kind: AnalysisCacheKind): string {
  if (kind !== "parse" && kind !== "resolution") {
    fail(`unknown analysis cache kind "${String(kind)}": expected "parse" or "resolution"`);
  }
  const digest = createHash("sha256").update(canonicalPayload(context, kind), "utf8").digest("hex");
  return `l5-cache/v2/${kind}/${digest}`;
}

/** Declared key schema used to generate the R2 perturbation list (R12d). */
export function declaredKeyComponents(kind: AnalysisCacheKind): readonly string[] {
  return kind === "parse"
    ? ["contentSha256", "language", "dialect", "grammarVersion", "grammarDigest", "grammarAbi", "grammarId",
      "extractorVersion", "tenant", "clone", "contentPolicyVersion", "privacyBoundary", "worktreeSlot"]
    : ["parse", "treeOid", "path", "configHash", "dependencyHash", "snapshotId",
      "policyVersion", "tenant", "clone", "resolverVersion"];
}

function checkPort(port: AnalysisCachePort): void {
  if (port === null || typeof port !== "object") {
    fail("analysis cache requires an injected host AnalysisCachePort: no source-root default exists on this path");
  }
  if (typeof port.load !== "function" || typeof port.store !== "function" || typeof port.authorize !== "function") {
    fail("analysis cache requires an injected host AnalysisCachePort with authorize/load/store: no source-root default exists on this path");
  }
}

function envelopeFor(kind: AnalysisCacheKind, context: AnalysisContextDto, payload: unknown): string {
  const inputsDigest = createHash("sha256").update(canonicalPayload(context, kind), "utf8").digest("hex");
  const payloadText = JSON.stringify(payload);
  const payloadDigest = createHash("sha256").update(payloadText, "utf8").digest("hex");
  return JSON.stringify({
    completion: { state: "complete" },
    inputsDigest,
    kind,
    payload,
    payloadDigest,
    policy: policyBlock(context),
    provenance: {
      dialectVersion: context.dialectVersion ?? L5_DIALECT_VERSION,
      extractorVersion: context.extractorVersion,
      factSchemaVersion: L5_FACT_SCHEMA_VERSION,
      resolverVersion: context.resolverVersion ?? L5_RESOLVER_VERSION,
      schemaVersion: L5_CACHE_SCHEMA_VERSION,
    },
    schemaVersion: L5_CACHE_SCHEMA_VERSION,
    scope: scopeBlock(context),
  });
}

function readEnvelope(raw: string, kind: AnalysisCacheKind, context: AnalysisContextDto): unknown | null {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (envelope === null || typeof envelope !== "object") return null;
  if (envelope.schemaVersion !== L5_CACHE_SCHEMA_VERSION || envelope.kind !== kind) return null;
  const scope = envelope.scope as { tenant?: unknown; clone?: unknown } | undefined;
  if (!scope || scope.tenant !== context.tenant || scope.clone !== context.clone) return null;
  const expectedInputs = createHash("sha256").update(canonicalPayload(context, kind), "utf8").digest("hex");
  if (envelope.inputsDigest !== expectedInputs) return null;
  if (!envelope.payloadDigest || !envelope.payload) return null;
  const recomputed = createHash("sha256").update(JSON.stringify(envelope.payload), "utf8").digest("hex");
  if (recomputed !== envelope.payloadDigest) return null;
  const completion = envelope.completion as { state?: unknown } | undefined;
  if (!completion || completion.state !== "complete") return null;
  return envelope.payload;
}

/**
 * Context-bound cache facade over the injected host port. Authorization
 * precedes lookup (R1/R5.1); every hit revalidates scope/envelope/payload
 * (R5.4); corrupt/foreign/mismatched entries are misses (R5); conflicting
 * payloads under one key are integrity errors (R5b).
 */
export class AnalysisCache {
  private readonly port: AnalysisCachePort;

  constructor(port: AnalysisCachePort) {
    checkPort(port);
    this.port = port;
  }

  keyOf(context: AnalysisContextDto, kind: AnalysisCacheKind): string {
    return deriveAnalysisCacheKey(context, kind);
  }

  private async authorize(context: AnalysisContextDto): Promise<void> {
    await this.port.authorize({ clone: context.clone, tenant: context.tenant });
  }

  async loadParse(context: AnalysisContextDto): Promise<unknown | null> {
    return this.loadKind(context, "parse");
  }

  async storeParse(context: AnalysisContextDto, value: unknown): Promise<void> {
    await this.authorize(context);
    const key = deriveAnalysisCacheKey(context, "parse");
    const next = envelopeFor("parse", context, value);
    const existing = await this.port.load(key).catch(() => null);
    if (existing !== null) {
      const prev = readEnvelope(existing, "parse", context);
      if (prev !== null) {
        const prevDigest = createHash("sha256").update(JSON.stringify(prev), "utf8").digest("hex");
        const nextDigest = createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
        if (prevDigest !== nextDigest) {
          throw new AnalysisCacheError("derivation-failed: conflicting payloads under one parse key (non-determinism)");
        }
        return;
      }
    }
    await this.port.store(key, next);
  }

  async loadResolution(context: AnalysisContextDto): Promise<unknown | null> {
    return this.loadKind(context, "resolution");
  }

  async storeResolution(context: AnalysisContextDto, value: unknown): Promise<void> {
    await this.authorize(context);
    const key = deriveAnalysisCacheKey(context, "resolution");
    const next = envelopeFor("resolution", context, value);
    const existing = await this.port.load(key).catch(() => null);
    if (existing !== null) {
      const prev = readEnvelope(existing, "resolution", context);
      if (prev !== null) {
        const prevDigest = createHash("sha256").update(JSON.stringify(prev), "utf8").digest("hex");
        const nextDigest = createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
        if (prevDigest !== nextDigest) {
          throw new AnalysisCacheError("derivation-failed: conflicting payloads under one resolution key (non-determinism)");
        }
        return;
      }
    }
    await this.port.store(key, next);
  }

  private async loadKind(context: AnalysisContextDto, kind: AnalysisCacheKind): Promise<unknown | null> {
    await this.authorize(context);
    let raw: string | null;
    try {
      raw = await this.port.load(deriveAnalysisCacheKey(context, kind));
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      return readEnvelope(raw, kind, context);
    } catch {
      return null;
    }
  }
}
