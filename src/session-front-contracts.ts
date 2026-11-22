import { createHash } from "node:crypto";
import { CanonicalJsonError, canonicalizeJcs, normalizeCanonicalJson } from "../engram-memory/dist/canonical-json.js";
import {
  assertDigest, assertExactKeys, assertInstant, assertObject, assertOpaque,
  assertSafeEpoch, assertString, assertValidTime, SchemaFailure,
} from "../engram-memory/dist/validation.js";
import type {
  H2AMandateEnvelope,
  OntologyTemplateEnvelopeRef,
  Sha256Digest,
} from './metamodel-contracts.js';
import type {
  AuthorizationContextV1,
  CitationV1,
  Cursor,
  Instant,
  OpaqueRef,
  Result,
  RetentionV1,
} from '../engram-memory/dist/contracts/index.js';

export type {
  H2AMandateEnvelope,
  LineageId,
  OntologyTemplateEnvelopeRef,
  Sha256Digest,
} from './metamodel-contracts.js';
export type {
  AuthorizationContextV1,
  CitationV1,
  Cursor,
  Instant,
  OpaqueRef,
  Result,
  RetentionV1,
} from '../engram-memory/dist/contracts/index.js';

export interface SessionDbCitationTuple {
  readonly sessionId: string;               // Neutral session-db session identifier (pseudonymized as sessionPseudoId in projections per D33)
  readonly entryId: string;                 // Immutable entry primary key in neutral session-db
  readonly ordinal: number;                 // Safe non-negative integer EntryRecord.ordinal within (sessionId, branchEpoch)
  readonly contentDigest: Sha256Digest;     // sha256:<64 lowercase hex> over UTF-8 RFC 8785 JCS bytes of the raw entry
  readonly branchEpoch?: number;            // Present when the session forks from an earlier ordinal
  readonly parentEntryId?: string;          // Parent entry anchor across a session branch
}

export type CliHostId =
  | 'claude' | 'codex' | 'gemini' | 'agy'
  | 'hermes' | 'opencode' | 'muse' | 'vibe'; // h2a:packages/h2a/src/hosts/plugin.ts:85-150

export type RawSessionEventKind =
  | 'speech_turn'
  | 'tool_result'
  | 'file_ref'
  | 'mandate_binding'
  | 'external_hmi_input'
  | 'context_saturation';

/**
 * F-07 terminal vs non-terminal extraction disposition persisted on every raw_event
 * so legitimate D7 rejections or empty-candidate turns never trigger perpetual gap alerts or re-extraction loops.
 */
export type RawEventExtractionDisposition =
  | 'pending_extraction'
  | 'proposed'
  | 'empty_verified'
  | 'withheld_d7';

export type ToolResultSignificance =
  | 'routine'
  | 'significant'
  | 'error'
  | 'security-gate'; // Drives D23 attention weighting in session history without dropping raw recording

export interface D6FileOrPathRef {
  /**
   * Deterministic path carrier:
   * - Allowed non-secret relative path when repo/content policy permits;
   * - `withheld-path:<sha256>` via protectedPathRef (engram-live/content-policy.ts:133-136)
   *   when classifyPath (:92-125) flags a secret-bearing basename/segment or when ungranted;
   * - Never an unmasked host-local absolute filesystem realpath (D6=refs, D33).
   */
  readonly pathRef: string;
  readonly contentFingerprint: Sha256Digest;
  readonly byteLength?: number;
  readonly lineRange?: { readonly start: number; readonly end: number };
  readonly contentDisclosureAuthorized: boolean; // False => zero excerpt/content reaches external models, caches, or logs (D6)
}

export type RawSessionEventPayload =
  | {
      readonly kind: 'speech_turn';
      readonly speakerRole: 'owner' | 'user' | 'assistant' | 'conductor' | 'system';
      readonly hostId: string;
      /**
       * Ingestion delivery path (M1, OQ-S1-4):
       * - `'push-hook'`: `UserPromptSubmit` / `Stop` on push-capable CLI hosts;
       * - `'post-agent-hook'`: `vibe-post-agent.mjs` / `h2a drumbeat record` turn-pair extraction;
       * - `'poll-scan'`: `SessionDbFallbackCursor` (`5_000 ms`, bounded `[1_000 ms, 30_000 ms]`) when `agy`/`muse` run inside an `h2a-runtime` PTY seat (`delegate.ts:758-810`) or on `h2a drumbeat scan`;
       * - `'mcp-opportunistic'`: immediate opportunistic flush on MCP tool calls (`h2a registry-bridge serve` / `mcp-central`) and `SessionStart` / `PreToolUse` (`plugin.ts:22-43`) for standalone `agy` / `muse` CLI sessions outside `h2a-runtime`;
       * - `'in-process'`: internal `cluster-mesh` host path.
       */
      readonly deliveryPath: 'push-hook' | 'post-agent-hook' | 'poll-scan' | 'mcp-opportunistic' | 'in-process';
      readonly sessionCitation: SessionDbCitationTuple;
      /** Bounded canonical UTF-8 text projection (`<= 65_536` bytes, F-02); omitted when ContentPolicyV1 withholds capture. */
      readonly boundedTurnText?: string;
      readonly truncatedInProjection?: boolean;
      readonly triggerTurnSweep: boolean; // True on outbound send per D12=turn
    }
  | {
      readonly kind: 'tool_result';
      readonly hostId: string;
      readonly toolName: string;
      readonly invocationId: string;
      readonly succeeded: boolean;
      readonly exitCode?: number;
      readonly significance: ToolResultSignificance;
      readonly sessionCitation: SessionDbCitationTuple;
      readonly touchedFiles: readonly D6FileOrPathRef[];
    }
  | {
      readonly kind: 'file_ref';
      readonly file: D6FileOrPathRef;
      readonly gitCommitOid?: { readonly algorithm: 'sha1' | 'sha256'; readonly oid: string };
      readonly sessionCitation?: SessionDbCitationTuple;
    }
  | {
      readonly kind: 'mandate_binding';
      /**
       * Verified by cluster-mesh against real H2AEnvelope<H2AMandate> (Spec 6A §2.3 :311-390).
       * Explicit `null` is valid and triggers proactive h2a role/rule analysis (D16).
       */
      readonly mandate: H2AMandateEnvelope | null;
      readonly unboundRoleAnalysisRequested: boolean; // Must be true when mandate === null (D16)
    }
  | {
      readonly kind: 'external_hmi_input'; // D30 separate HMI/GitHub input layer (Spec 1 Phase 1: PR flow only per F-05 / OQ-S1-5)
      readonly hmiSource: 'github-pr-sync' | 'github-webhook'; // github-issue, github-review, and project-board deferred to follow-up D30 spec (§6.1)
      readonly externalSourceId: OpaqueRef; // 1..512 UTF-8 bytes; revision-qualified for mutable entities (§6.2, F-03, F-06)
      readonly liveTrackingKind?: 'pr.merged' | 'owner.answer' | 'owner.request';
      readonly payloadDigest: Sha256Digest;
      readonly structuredAttributes: Readonly<Record<string, unknown>>;
      readonly citations: readonly CitationV1[];
    }
  | {
      readonly kind: 'context_saturation'; // D19 / D25 event trigger for local dreaming resynthesis
      readonly hostId: string;
      readonly observedTokenRatio: number; // 0..1
      readonly throughOrdinal: number;
    };

/**
 * F-03 deterministic idempotency key derivation:
 * Maps any (sourceKind, sourceId) where sourceId is OpaqueRef (1..512 UTF-8 bytes, mcp-platform/src/memory/contracts.ts:107-111)
 * to a fixed 72-byte ASCII key `"idem:v1:" + sha256Hex(canonicalJcs({ sourceKind, sourceId }))` satisfying isValidIdempotencyKey (16..256 B, :114-118).
 */
function assertNoUnpairedSurrogates(value: string, field: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = index + 1 < value.length ? value.charCodeAt(index + 1) : Number.NaN;
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new SchemaFailure(`${field} contains an unpaired surrogate`);
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new SchemaFailure(`${field} contains an unpaired surrogate`);
    }
  }
}

export function deriveSessionFrontIdempotencyKey(input: {
  readonly sourceKind: string;
  readonly sourceId: OpaqueRef;
}): string {
  assertExactKeys(input, "idempotencySource", ["sourceKind", "sourceId"], ["sourceKind", "sourceId"]);
  if (typeof input.sourceKind !== "string" || typeof input.sourceId !== "string") {
    throw new SchemaFailure("idempotencySource must have string sourceKind and sourceId");
  }
  let normalized: { readonly sourceKind: string; readonly sourceId: string };
  try {
    normalized = normalizeCanonicalJson({ sourceKind: input.sourceKind, sourceId: input.sourceId }) as unknown as {
      readonly sourceKind: string;
      readonly sourceId: string;
    };
  } catch (error) {
    if (error instanceof CanonicalJsonError) {
      throw new SchemaFailure("idempotencySource is not canonical JSON");
    }
    throw error;
  }
  assertNoUnpairedSurrogates(normalized.sourceKind, "sourceKind");
  assertNoUnpairedSurrogates(normalized.sourceId, "sourceId");
  assertOpaque(normalized.sourceKind, "sourceKind");
  assertOpaque(normalized.sourceId, "sourceId");
  const hex = createHash("sha256")
    .update(canonicalizeJcs({ sourceKind: normalized.sourceKind, sourceId: normalized.sourceId }), "utf8")
    .digest("hex");
  return `idem:v1:${hex}`;
}

/**
 * `new` (Lots `1-E1` & `1-E4`, N-01): Dedicated string predicate `/^wt:[0-9a-f]{64}$/` for worktree identifier fields
 * (`derivedWorktreeId`, `parentWorktreeId`), complementing object-level `validateWorktreeIdentity`
 * (`engram-live/contracts.ts:1180-1208`; `sentropic:packages/cluster-mesh/src/live-storage/registration.ts:166-181`),
 * which validates full `WorktreeIdentityDto` records (`cloneId`, `worktreeId`, `worktreePath`, `gitDir`, `identityUncertainty`).
 */
export function isValidWorktreeId(id: unknown): id is string {
  return typeof id === "string" && id.length === 67 && /^wt:[0-9a-f]{64}$/.test(id);
}

export interface RawSessionEventEnvelope {
  readonly schemaVersion: 'engram.session-event/v1';
  /** 16..256 UTF-8 bytes; MUST equal `deriveSessionFrontIdempotencyKey({ sourceKind, sourceId })` (`72` ASCII bytes, F-03). */
  readonly idempotencyKey: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  /**
   * Canonical derived worktree entity id (`wt:<64 lowercase hex>`, §3, F-15, N-01):
   * MUST pass `isValidWorktreeId` (`/^wt:[0-9a-f]{64}$/`, `new` in `1-E1`/`1-E4`, matching `ID_PREFIXES.worktree` at `engram-live/contracts.ts:699`);
   * raw filesystem paths or non-`wt:<64hex>` strings are rejected (`INVALID_SCHEMA`) so zero host paths leak into D24 sync.
   */
  readonly derivedWorktreeId: string;
  readonly cloneId: string;
  /** D33 deterministic pseudonym (`sess_pseudo:<hex>`) derived from neutral sessionId under scope key (§5.1). */
  readonly sessionPseudoId: string;
  /** D33 deterministic pseudonym (`actor_pseudo:<hex>`) of the emitting human or NHI instance (§5.1). */
  readonly actorPseudoId: string;
  /** Verified mandate ref when bound; null triggers D16 proactive h2a analysis. */
  readonly mandateRef: H2AMandateEnvelope | null;
  /**
   * Dedicated capture purpose ref (`D11=dedicated`, §5.5):
   * `'memory.capture.session/v1'` for CLI session capture, `'memory.capture.hmi/v1'` for D30 external HMI input.
   */
  readonly purposeRef: 'memory.capture.session/v1' | 'memory.capture.hmi/v1';
  /** Host audit retention bound (`D13=host`, bounded by `computeRetentionDeadline` when `ContentPolicyV1` is finite, §5.3, F-15). */
  readonly retention: RetentionV1;
  readonly occurredAt: Instant;
  readonly payload: RawSessionEventPayload;
  readonly authorization: AuthorizationContextV1;
  readonly deadlineAt: Instant;
}

export interface RawSessionEventReceipt {
  readonly status: 'recorded' | 'duplicate_exact';
  readonly eventRecordId: string;             // Canonical raw_event identifier (`raw_<base32(recordDigest)>`)
  readonly recordDigest: Sha256Digest;
  readonly cursor: Cursor;
  readonly extractionDisposition: RawEventExtractionDisposition; // Initial 'pending_extraction' on 'recorded' (F-07)
  readonly syncState: 'synced' | 'queued-degraded' | 'local-only';
  /** Present and non-null whenever D17=degraded mode is active; surfaced across all 8 CLI hosts via operator-notices.ts + status-surface.ts (6A-H3). */
  readonly degradedBanner?: string;
  /** Ready context slice identifiers eligible for immediate non-blocking hook delivery (D15=slices). */
  readonly readySlices: readonly ('track' | 'git' | 'architecture' | 'rules' | 'memory')[];
  /**
   * Optional pre-rendered UTF-8 slice text keyed by `readySlices` entry (`M1`, `D15=slices`):
   * Enables host hooks to inject ready slices in one non-blocking round-trip.
   */
  readonly readySlicePayloads?: Partial<Record<'track' | 'git' | 'architecture' | 'rules' | 'memory', string>>;
  /** Set true when mandateRef === null so h2a schedules proactive role/rule analysis (D16). */
  readonly h2aProactiveRoleAnalysisQueued: boolean;
  /** Set true when D12=turn sweep or D19 saturation schedules asynchronous post-record extraction/dreaming. */
  readonly extractionSweepScheduled: boolean;
  readonly transactionReceiptDigest: Sha256Digest;
}

export type ExtractionBackendKind =
  | 'light-permanent-llm'
  | 'session-llm'
  | 'specialized-model';

export interface ExtractedCandidateItem {
  readonly localCandidateKey: string;
  /** D3 / D31 mandatory domain split: project (-> Track control & .track/) vs harness (-> h2a & .h2a/). */
  readonly domain: 'project' | 'harness';
  /**
   * Neutral template pin (Spec 0 §2.1 :149-154): (lineage, templateId, templateVersion, templateDigestSha256).
   * Required for all domain-typed candidates; zero closed list of Track or h2a types in engram (T-M-C).
   */
  readonly templateRef: OntologyTemplateEnvelopeRef;
  /** Open template-declared node or decision type id, validated against the registered ProfileBundleV1. */
  readonly candidateEntityTypeId: string;
  readonly candidateRelations: readonly {
    readonly relationTypeId: string;
    readonly targetRef: string;
    readonly attributes?: Readonly<Record<string, unknown>>;
  }[];
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly validTime: { readonly t: number; readonly t_end?: number };
  /** Grounded citations back to committed raw_event records and/or D6 file refs. */
  readonly sourceEventRecordIds: readonly string[];
  readonly citations: readonly CitationV1[];
  /** Live-tracking classification when extracted or reconciled from a live-tracking signal (§6). */
  readonly liveTrackingBinding?: {
    readonly eventKind: 'pr.merged' | 'owner.answer' | 'owner.request';
    readonly sourceId: OpaqueRef;             // Full 1..512 B sourceId preserved alongside derived 72 B idempotencyKey (F-03)
  };
}

export interface SessionExtractionProposalBatch {
  readonly schemaVersion: 'engram.session-extraction/v1';
  readonly idempotencyKey: string;            // 16..256 UTF-8 bytes (`idem:v1:<64hex>`)
  readonly tenantId: string;
  readonly workspaceId: string;
  /** Canonical `wt:<64 lowercase hex>` validated via `isValidWorktreeId` (F-15, N-01). */
  readonly derivedWorktreeId: string;
  readonly sessionPseudoId: string;
  /** Every referenced raw_event MUST already exist in engram and belong to `(tenantId, workspaceId)` (F-01, NOT_FOUND / 403). */
  readonly sourceEventRecordIds: readonly string[];
  readonly extractor: {
    readonly kind: ExtractionBackendKind;
    readonly modelOrAdapterId: string;        // Resolved via @sentropic/llm-mesh
    readonly extractionSemanticsVersion: string; // Pinned to EXTRACTION_SEMANTICS_VERSION (src/extraction-batch.ts)
    readonly llmMeshAttemptRef: string;       // Verifiable PreparedRouteAttempt.attemptRef (routing-contracts.ts:198, F-13)
  };
  readonly purposeRef: 'memory.capture.session/v1' | 'memory.capture.hmi/v1';
  readonly retention: RetentionV1;
  readonly candidates: readonly ExtractedCandidateItem[];
  readonly authorization: AuthorizationContextV1;
  readonly deadlineAt: Instant;
}

export interface RecordedExtractionOutcome {
  readonly localCandidateKey: string;
  readonly candidateId: string;
  readonly domain: 'project' | 'harness';
  /**
   * Initial post-extraction review status (`Point 5B`, `m1`):
   * - `domain === 'project'` ALWAYS enters `'proposed'` (`proposalDisposition: 'stays-proposed'`, `verdict: null`
   *   under the 5-state `engram-track.md:83-88,154-165` bijection in §2.3:
   *   `'proposed' | 'recorded-bounded-type' | 'promotion-draft-awaiting-third-party' | 'approved' | 'rejected'`)
   *   with `verdictAuthority: 'track'` and awaits an authoritative `TrackControlVerdict`.
   * - `domain === 'harness'` enters `'proposed'` unless a verified h2a mandate + master/overlay rule
   *   explicitly authorizes local overlay recording (`'accepted-harness-local'`, `D3`, `D4`, `D31`, `Point 4B`).
   */
  readonly reviewStatus: 'proposed' | 'accepted-harness-local';
  readonly verdictAuthority: 'track' | 'h2a';
  readonly recordDigest: Sha256Digest;
}

export interface SessionExtractionReceipt {
  readonly status: 'committed' | 'duplicate_exact';
  readonly batchCursor: Cursor;
  readonly outcomes: readonly RecordedExtractionOutcome[];
  readonly d7BlockedKeys: readonly string[];  // Candidates withheld by engram's D7 confidentiality deny-list
  /** Updated extractionDisposition per sourceEventRecordId (`proposed` | `empty_verified` | `withheld_d7`, F-07). */
  readonly sourceDispositions: Readonly<Record<string, Exclude<RawEventExtractionDisposition, 'pending_extraction'>>>;
  readonly transactionReceiptDigest: Sha256Digest;
}

export interface EngramSessionIngestFrontPort {
  readonly version: 1;
  recordSessionEvent(envelope: RawSessionEventEnvelope): Promise<Result<RawSessionEventReceipt>>;
  recordExtraction(batch: SessionExtractionProposalBatch): Promise<Result<SessionExtractionReceipt>>;
}

export { createEngramSessionIngestFront, type EngramSessionIngestFrontOptionsV1 } from "./session-front/ingest.js";
export type {
  SessionFrontCommitV1,
  SessionFrontDeliveryV1,
  SessionFrontScopeV1,
  SessionFrontStoreV1,
  SessionFrontTransactionV1,
} from "../engram-memory/dist/session-front-engine.js";

const commonFields = [
  "schemaVersion", "idempotencyKey", "tenantId", "workspaceId", "derivedWorktreeId", "sessionPseudoId",
  "purposeRef", "retention", "authorization", "deadlineAt",
];
const liveTrackingKinds = ["pr.merged", "owner.answer", "owner.request"];

function requireValue(condition: boolean, field: string): void {
  if (!condition) throw new SchemaFailure(`${field} is invalid`);
}

function choice(value: unknown, field: string, choices: readonly unknown[]): void {
  requireValue(choices.includes(value), field);
}

function shape(value: unknown, field: string, required: readonly string[], optional: readonly string[] = []):
  asserts value is Record<string, unknown> {
  assertExactKeys(value, field, [...required, ...optional], required);
}

function integer(value: unknown, field: string, minimum = 0): asserts value is number {
  assertSafeEpoch(value, field);
  requireValue(value >= minimum, field);
}

function list(value: unknown, field: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new SchemaFailure(`${field} must be an array`);
}

function checkPseudonym(value: unknown, field: "sessionPseudoId" | "actorPseudoId"): void {
  assertOpaque(value, field);
  requireValue(
    field === "sessionPseudoId"
      ? /^sess_pseudo:[0-9a-f]+$/.test(value)
      : /^actor_pseudo:[0-9a-f]+$/.test(value),
    field,
  );
}

function checkHostId(value: unknown, field: string): void {
  assertOpaque(value, field);
  requireValue(typeof value === "string" && value.trim().length > 0, field);
}

function checkCommon(value: Record<string, unknown>): void {
  assertString(value.idempotencyKey, "idempotencyKey", 16, 256);
  requireValue(isValidWorktreeId(value.derivedWorktreeId), "derivedWorktreeId");
  for (const field of ["tenantId", "workspaceId"]) assertOpaque(value[field], field);
  checkPseudonym(value.sessionPseudoId, "sessionPseudoId");
  choice(value.purposeRef, "purposeRef", ["memory.capture.session/v1", "memory.capture.hmi/v1"]);
  shape(value.retention, "retention", ["derivative_rule"], ["expires_at"]);
  choice(value.retention.derivative_rule, "retention.derivative_rule", ["retain", "make-ineligible"]);
  if (Object.hasOwn(value.retention, "expires_at")) assertInstant(value.retention.expires_at, "retention.expires_at");
  shape(value.authorization, "authorization", ["credential"], ["context_ref"]);
  assertString(value.authorization.credential, "authorization.credential", 1, 512);
  requireValue(
    typeof value.authorization.credential === "string" && value.authorization.credential.trim().length > 0,
    "authorization.credential",
  );
  if (Object.hasOwn(value.authorization, "context_ref")) assertOpaque(value.authorization.context_ref, "authorization.context_ref");
  assertInstant(value.deadlineAt, "deadlineAt");
}

function checkTuple(value: unknown): void {
  shape(value, "sessionCitation", ["sessionId", "entryId", "ordinal", "contentDigest"], ["branchEpoch", "parentEntryId"]);
  assertOpaque(value.sessionId, "sessionCitation.sessionId");
  assertOpaque(value.entryId, "sessionCitation.entryId");
  integer(value.ordinal, "sessionCitation.ordinal");
  assertDigest(value.contentDigest, "sessionCitation.contentDigest");
  if (Object.hasOwn(value, "branchEpoch")) integer(value.branchEpoch, "sessionCitation.branchEpoch");
  if (Object.hasOwn(value, "parentEntryId")) assertOpaque(value.parentEntryId, "sessionCitation.parentEntryId");
}

function checkCitations(value: unknown): void {
  list(value, "citations");
  requireValue(value.length <= 256, "citations");
  const seen = new Set<unknown>();
  for (const citation of value) {
    shape(citation, "citation", ["citation_id", "source_ref", "locator", "content_digest"], ["observed_at"]);
    assertOpaque(citation.citation_id, "citation.citation_id");
    requireValue(!seen.has(citation.citation_id), "citation.citation_id");
    seen.add(citation.citation_id);
    assertOpaque(citation.source_ref, "citation.source_ref");
    shape(citation.locator, "citation.locator", ["scheme", "value"]);
    assertOpaque(citation.locator.scheme, "citation.locator.scheme");
    assertOpaque(citation.locator.value, "citation.locator.value");
    assertDigest(citation.content_digest, "citation.content_digest");
    if (Object.hasOwn(citation, "observed_at")) assertInstant(citation.observed_at, "citation.observed_at");
  }
}

const SECRET_BASENAMES: ReadonlySet<string> = new Set([
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "credentials.json",
  "secrets.json",
  "service-account.json",
]);

const SECRET_PATH_SEGMENTS: ReadonlySet<string> = new Set(["secret", "secrets", "credentials"]);

const SECRET_TEXT_SIGNALS: readonly RegExp[] = [
  /:\/\/[^/\s:]+:[^/\s@]+@/,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /(password|passwd|pwd|secret|api[_-]?key)\s*[:=]\s*\S+/i,
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9]{20,}/,
];

function carriesSecret(pathRef: string): boolean {
  const segments = pathRef.split(/[\\/]/);
  const base = segments[segments.length - 1] ?? "";
  if (base.startsWith(".env")) return true;
  if ((base.endsWith(".pem") || base.endsWith(".key")) && base.length > 4) return true;
  if (SECRET_BASENAMES.has(base)) return true;
  for (const segment of segments) {
    if (SECRET_PATH_SEGMENTS.has(segment)) return true;
  }
  for (const signal of SECRET_TEXT_SIGNALS) {
    if (signal.test(pathRef)) return true;
  }
  return false;
}

function checkFile(value: unknown): void {
  shape(value, "file", ["pathRef", "contentFingerprint", "contentDisclosureAuthorized"], ["byteLength", "lineRange"]);
  assertString(value.pathRef, "file.pathRef", 1, 4096);
  if (value.pathRef.startsWith("withheld-path:")) {
    requireValue(/^withheld-path:[0-9a-f]{64}(?![\s\S])/.test(value.pathRef) && value.contentDisclosureAuthorized === false, "file.pathRef");
  } else {
    const absoluteOrTraversal = /^(?:[\\/]|[a-z]:|file:)|(?:^|[\\/])\.\.(?:[\\/]|$)|\0/i;
    requireValue(!absoluteOrTraversal.test(value.pathRef), "file.pathRef");
    requireValue(!/^~/.test(value.pathRef), "file.pathRef");
    requireValue(!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value.pathRef), "file.pathRef");
    requireValue(!/[\0-\x1f\x7f]/.test(value.pathRef), "file.pathRef");
    requireValue(!carriesSecret(value.pathRef), "file.pathRef");
  }
  assertDigest(value.contentFingerprint, "file.contentFingerprint");
  choice(value.contentDisclosureAuthorized, "file.contentDisclosureAuthorized", [true, false]);
  if (Object.hasOwn(value, "byteLength")) integer(value.byteLength, "file.byteLength");
  if (Object.hasOwn(value, "lineRange")) {
    shape(value.lineRange, "file.lineRange", ["start", "end"]);
    integer(value.lineRange.start, "file.lineRange.start", 1);
    integer(value.lineRange.end, "file.lineRange.end", value.lineRange.start);
  }
}

function checkMandate(value: unknown): void {
  if (value === null) return;
  shape(value, "mandate", ["mandateId", "instance", "role", "scope", "rights", "envelopeDigest", "signatures"], ["expiresAt"]);
  for (const field of ["mandateId", "instance", "scope"]) assertOpaque(value[field], field);
  choice(value.role, "mandate.role", ["PRINCIPAL", "EXECUTIF", "CONDUCTOR", "AGENTS", "CONTROL", "MANDATAIRE", null]);
  list(value.rights, "mandate.rights");
  for (const right of value.rights) assertOpaque(right, "mandate.right");
  assertDigest(value.envelopeDigest, "mandate.envelopeDigest");
  if (Object.hasOwn(value, "expiresAt")) assertInstant(value.expiresAt, "mandate.expiresAt");
  list(value.signatures, "mandate.signatures");
  requireValue(value.signatures.length >= 1, "mandate.signatures");
  for (const signature of value.signatures) {
    shape(signature, "mandate.signature", ["by", "alg", "value"]);
    assertOpaque(signature.by, "mandate.signature.by");
    assertOpaque(signature.alg, "mandate.signature.alg");
    assertString(signature.value, "mandate.signature.value", 1, 4096);
  }
}

function checkPayload(payload: unknown): void {
  assertObject(payload, "payload");
  switch (payload.kind) {
    case "speech_turn":
      shape(payload, "payload", ["kind", "speakerRole", "hostId", "deliveryPath", "sessionCitation", "triggerTurnSweep"],
        ["boundedTurnText", "truncatedInProjection"]);
      choice(payload.speakerRole, "speakerRole", ["owner", "user", "assistant", "conductor", "system"]);
      checkHostId(payload.hostId, "hostId");
      choice(payload.deliveryPath, "deliveryPath", ["push-hook", "post-agent-hook", "poll-scan", "mcp-opportunistic", "in-process"]);
      checkTuple(payload.sessionCitation);
      if (Object.hasOwn(payload, "boundedTurnText")) assertString(payload.boundedTurnText, "boundedTurnText", 0, Infinity);
      if (Object.hasOwn(payload, "truncatedInProjection")) choice(payload.truncatedInProjection, "truncatedInProjection", [true, false]);
      choice(payload.triggerTurnSweep, "triggerTurnSweep", [true, false]);
      return;
    case "tool_result":
      shape(payload, "payload", ["kind", "hostId", "toolName", "invocationId", "succeeded", "significance", "sessionCitation", "touchedFiles"],
        ["exitCode"]);
      checkHostId(payload.hostId, "hostId");
      assertOpaque(payload.toolName, "toolName");
      assertOpaque(payload.invocationId, "invocationId");
      choice(payload.succeeded, "succeeded", [true, false]);
      choice(payload.significance, "significance", ["routine", "significant", "error", "security-gate"]);
      if (Object.hasOwn(payload, "exitCode")) assertSafeEpoch(payload.exitCode, "exitCode");
      checkTuple(payload.sessionCitation);
      list(payload.touchedFiles, "touchedFiles");
      for (const file of payload.touchedFiles) checkFile(file);
      return;
    case "file_ref":
      shape(payload, "payload", ["kind", "file"], ["gitCommitOid", "sessionCitation"]);
      checkFile(payload.file);
      if (Object.hasOwn(payload, "sessionCitation")) checkTuple(payload.sessionCitation);
      if (Object.hasOwn(payload, "gitCommitOid")) {
        shape(payload.gitCommitOid, "gitCommitOid", ["algorithm", "oid"]);
        choice(payload.gitCommitOid.algorithm, "gitCommitOid.algorithm", ["sha1", "sha256"]);
        const size = payload.gitCommitOid.algorithm === "sha1" ? 40 : 64;
        assertString(payload.gitCommitOid.oid, "gitCommitOid.oid", size, size);
        requireValue(!/[^0-9a-f]/.test(payload.gitCommitOid.oid), "gitCommitOid.oid");
      }
      return;
    case "mandate_binding":
      shape(payload, "payload", ["kind", "mandate", "unboundRoleAnalysisRequested"]);
      checkMandate(payload.mandate);
      choice(payload.unboundRoleAnalysisRequested, "unboundRoleAnalysisRequested", payload.mandate === null ? [true] : [true, false]);
      return;
    case "external_hmi_input":
      shape(payload, "payload", ["kind", "hmiSource", "externalSourceId", "payloadDigest", "structuredAttributes", "citations"],
        ["liveTrackingKind"]);
      choice(payload.hmiSource, "hmiSource", ["github-pr-sync", "github-webhook"]);
      assertOpaque(payload.externalSourceId, "externalSourceId");
      if (Object.hasOwn(payload, "liveTrackingKind")) choice(payload.liveTrackingKind, "liveTrackingKind", liveTrackingKinds);
      assertDigest(payload.payloadDigest, "payloadDigest");
      assertObject(payload.structuredAttributes, "structuredAttributes");
      checkCitations(payload.citations);
      return;
    case "context_saturation":
      shape(payload, "payload", ["kind", "hostId", "observedTokenRatio", "throughOrdinal"]);
      checkHostId(payload.hostId, "hostId");
      requireValue(typeof payload.observedTokenRatio === "number" && payload.observedTokenRatio >= 0 && payload.observedTokenRatio <= 1,
        "observedTokenRatio");
      integer(payload.throughOrdinal, "throughOrdinal");
      return;
    default:
      throw new SchemaFailure("payload.kind is invalid");
  }
}

function checkSources(value: unknown): asserts value is string[] {
  list(value, "sourceEventRecordIds");
  for (const id of value) assertOpaque(id, "sourceEventRecordId");
}

function checkCandidate(value: unknown): asserts value is ExtractedCandidateItem {
  shape(value, "candidate", ["localCandidateKey", "domain", "templateRef", "candidateEntityTypeId", "candidateRelations",
    "attributes", "validTime", "sourceEventRecordIds", "citations"], ["liveTrackingBinding"]);
  assertOpaque(value.localCandidateKey, "localCandidateKey");
  choice(value.domain, "domain", ["project", "harness"]);
  shape(value.templateRef, "templateRef", ["lineage", "templateId", "templateVersion", "templateDigestSha256"]);
  choice(value.templateRef.lineage, "templateRef.lineage", ["archi", "h2a", "track", "engram"]);
  assertOpaque(value.templateRef.templateId, "templateRef.templateId");
  assertOpaque(value.templateRef.templateVersion, "templateRef.templateVersion");
  assertDigest(value.templateRef.templateDigestSha256, "templateRef.templateDigestSha256");
  assertOpaque(value.candidateEntityTypeId, "candidateEntityTypeId");
  list(value.candidateRelations, "candidateRelations");
  for (const relation of value.candidateRelations) {
    shape(relation, "relation", ["relationTypeId", "targetRef"], ["attributes"]);
    assertOpaque(relation.relationTypeId, "relationTypeId");
    assertOpaque(relation.targetRef, "targetRef");
    if (Object.hasOwn(relation, "attributes")) assertObject(relation.attributes, "relation.attributes");
  }
  assertObject(value.attributes, "attributes");
  assertValidTime(value.validTime);
  checkSources(value.sourceEventRecordIds);
  requireValue(value.sourceEventRecordIds.length >= 1, "sourceEventRecordIds");
  checkCitations(value.citations);
  if (Object.hasOwn(value, "liveTrackingBinding")) {
    shape(value.liveTrackingBinding, "liveTrackingBinding", ["eventKind", "sourceId"]);
    choice(value.liveTrackingBinding.eventKind, "liveTrackingBinding.eventKind", liveTrackingKinds);
    assertOpaque(value.liveTrackingBinding.sourceId, "liveTrackingBinding.sourceId");
  }
}

function validated<T>(input: unknown, check: (snapshot: unknown) => void): Result<T> {
  try {
    const normalized = normalizeCanonicalJson(input);
    check(normalized);
    return { ok: true, value: normalized as T };
  } catch (error) {
    const message = error instanceof SchemaFailure ? error.message : "Session-front input is not canonical JSON.";
    return { ok: false, error: { code: "INVALID_SCHEMA", operation: "capture", message, retryable: false } };
  }
}

/** Strict, side-effect-free validation of the wire envelope. */
export function validateRawSessionEventEnvelope(input: unknown): Result<RawSessionEventEnvelope> {
  return validated(input, (value) => {
    shape(value, "envelope", [...commonFields, "cloneId", "actorPseudoId", "mandateRef", "occurredAt", "payload"]);
    choice(value.schemaVersion, "schemaVersion", ["engram.session-event/v1"]);
    checkCommon(value);
    assertOpaque(value.cloneId, "cloneId");
    checkPseudonym(value.actorPseudoId, "actorPseudoId");
    checkMandate(value.mandateRef);
    assertInstant(value.occurredAt, "occurredAt");
    checkPayload(value.payload);
    assertObject(value.payload, "payload");
    requireValue((value.payload.kind === "external_hmi_input") === (value.purposeRef === "memory.capture.hmi/v1"), "purposeRef");
    if (value.payload.kind === "mandate_binding") {
      const refNull = value.mandateRef === null;
      const payloadNull = value.payload.mandate === null;
      requireValue(refNull === payloadNull, "mandateRef");
      if (!refNull && !payloadNull) {
        requireValue(canonicalizeJcs(value.mandateRef) === canonicalizeJcs(value.payload.mandate), "mandateRef");
      }
    }
  });
}

/** Strict, side-effect-free validation of the wire extraction batch. */
export function validateSessionExtractionProposalBatch(input: unknown): Result<SessionExtractionProposalBatch> {
  return validated(input, (value) => {
    shape(value, "batch", [...commonFields, "sourceEventRecordIds", "extractor", "candidates"]);
    choice(value.schemaVersion, "schemaVersion", ["engram.session-extraction/v1"]);
    checkCommon(value);
    checkSources(value.sourceEventRecordIds);
    requireValue(value.sourceEventRecordIds.length >= 1, "sourceEventRecordIds");
    shape(value.extractor, "extractor", ["kind", "modelOrAdapterId", "extractionSemanticsVersion", "llmMeshAttemptRef"]);
    choice(value.extractor.kind, "extractor.kind", ["light-permanent-llm", "session-llm", "specialized-model"]);
    for (const field of ["modelOrAdapterId", "extractionSemanticsVersion", "llmMeshAttemptRef"]) assertOpaque(value.extractor[field], field);
    list(value.candidates, "candidates");
    const keys = new Set<string>();
    const batchIds = new Set<string>(value.sourceEventRecordIds);
    for (const candidate of value.candidates) {
      checkCandidate(candidate);
      requireValue(!keys.has(candidate.localCandidateKey), "localCandidateKey");
      keys.add(candidate.localCandidateKey);
      requireValue(candidate.sourceEventRecordIds.length >= 1, "sourceEventRecordIds");
      for (const id of candidate.sourceEventRecordIds) requireValue(batchIds.has(id), "sourceEventRecordIds");
    }
  });
}

// ── Block A (SJ-1a): selector, Track scope reference, query, watermark,
// request, item reference, delivery, policy. One definition per symbol;
// amendments, the wire codec and history matches belong to later lots.
export type SessionContextSelectorMatchV1 = { readonly kind: "text"; readonly text: string } | { readonly kind: "ref"; readonly ref: string } | { readonly kind: "withheld"; readonly textDigest: Sha256Digest };
export interface SessionContextSelectorV1 { readonly selectorId: string; readonly match: SessionContextSelectorMatchV1; readonly by: "agent" | "shadow"; readonly authorModelRef?: string; readonly sourceEventRecordIds: readonly string[]; }
export interface SessionTrackScopeRefV1 { readonly repoKey: string; readonly workspace: string; readonly aggregateId: string; readonly role: string; readonly aggregateKind: string; readonly baselineCommit?: string; readonly decisionGateId?: string; readonly decisionGateDigest?: Sha256Digest; }
export interface SessionContextQueryV1 { readonly schemaVersion: "engram.session-context-query/v1"; readonly queryId: string; readonly version: number; readonly digest: Sha256Digest; readonly tenantId: string; readonly workspaceId: string; readonly derivedWorktreeId: string; readonly roleRef?: string; readonly mandateDigest?: Sha256Digest; readonly objectiveLoopId?: string; readonly trackScope: readonly SessionTrackScopeRefV1[]; readonly ontologies: readonly OntologyTemplateEnvelopeRef[]; readonly pinnedEventRecordIds: readonly string[]; readonly selectors: readonly SessionContextSelectorV1[]; }
export interface SessionContextWatermarkV1 { readonly queryId: string; readonly queryVersion: number; readonly cursor: Cursor; }
export interface SessionContextRequestV1 { readonly held?: SessionContextWatermarkV1; readonly reset?: "compaction" | "clear" | "restart"; readonly hostSignal?: string; readonly loop?: { readonly objectiveLoopId: string; readonly trackScope: readonly SessionTrackScopeRefV1[] }; }
export interface SessionContextItemRefV1 { readonly ref: string; readonly digest: Sha256Digest; readonly slice: RawSessionEventReceipt["readySlices"][number]; readonly change: "added" | "withdrawn"; readonly disclosure: "text" | "reference"; readonly authoredBy: "code" | "shadow" | "main_model" | "dreaming"; readonly authorModelRef?: string; readonly sourceEventRecordIds: readonly string[]; }
export interface SessionContextDeliveryV1 { readonly mode: "diff" | "full"; readonly watermark: SessionContextWatermarkV1; readonly queryDigest: Sha256Digest; readonly byteLength: number; readonly items: readonly SessionContextItemRefV1[]; readonly annotatedThroughOrdinal?: number; readonly overflow?: "pinned_request_over_ceiling"; }
export interface SessionContextPolicyV1 { readonly journalEnabled: boolean; readonly maxSelectors: number; readonly viewMaxTokens: number; readonly rebuildAtTokens: number; }
