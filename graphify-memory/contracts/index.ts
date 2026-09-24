export type Digest = `sha256:${string}`;
export type Cursor = string;
export type Instant = string;
export type OpaqueRef = string;
export type IdempotencyKey = string;
export type JsonPointer = string;

export interface ValidIntervalV1 {
  t: number;
  t_end?: number;
}

export interface CitationLocatorV1 {
  scheme: string;
  value: string;
}

export interface CitationV1 {
  citation_id: string;
  source_ref: OpaqueRef;
  locator: CitationLocatorV1;
  content_digest: Digest;
  observed_at?: Instant;
}

export type MemoryComponentKind = "context" | "decision" | "evidence";

export interface MemoryComponentV2 {
  component_id: string;
  kind: MemoryComponentKind;
  text: string;
  citation_ids: ReadonlyArray<string>;
}

export interface PrimaryEventAnchorV1 {
  at: number;
  type_ref: OpaqueRef;
  citation_id: string;
}

export interface DerivationLineageV1 {
  source_record_ids: ReadonlyArray<string>;
  transform_ref: OpaqueRef;
  transform_receipt_digest: Digest;
}

export interface RetentionV1 {
  expires_at?: Instant;
  derivative_rule: "retain" | "make-ineligible";
}

export interface ReconciliationConsentV1 {
  family_refs: ReadonlyArray<OpaqueRef>;
}

export interface CandidatePayloadV2 {
  schema_version: 2;
  scope_ref: OpaqueRef;
  purpose_ref: OpaqueRef;
  valid_time: ValidIntervalV1;
  components: ReadonlyArray<MemoryComponentV2>;
  primary_component_id: string;
  primary_event: PrimaryEventAnchorV1;
  citations: ReadonlyArray<CitationV1>;
  retention: RetentionV1;
  reconciliation: ReconciliationConsentV1;
  derivation?: DerivationLineageV1;
}

export type EvidenceClass = "earned" | "asserted" | "signed";

export interface TrustBindingV1 {
  class: EvidenceClass;
  evidence_digest: Digest;
  verifier_id: OpaqueRef;
  verifier_version: string;
  issued_at: Instant;
  expires_at?: Instant;
  revocation_epoch: Cursor;
  receipt_digest: Digest;
}

export interface MemoryRecordV2 extends CandidatePayloadV2 {
  record_id: string;
  payload_digest: Digest;
  record_digest: Digest;
  recorded_at: Instant;
  recorded_cursor: Cursor;
  authorization_receipt_digest: Digest;
  trust: TrustBindingV1;
}

export type MemoryOperation =
  | "capture" | "cancel_capture" | "request_admission"
  | "reject" | "withdraw" | "dispute" | "resolve_dispute" | "expire" | "supersede"
  | "mark_non_current" | "rewind" | "trust_invalidate" | "tombstone"
  | "recall_current" | "recall_history" | "recall_disputed"
  | "propose_capitalisation" | "inspect_candidate"
  | "projection_invalidate" | "backup" | "restore" | "admin";

export type MemoryErrorCode =
  | "INVALID_SCHEMA" | "INVALID_DIGEST" | "DIGEST_CONFLICT"
  | "UNAUTHORIZED" | "AUTHORIZATION_EXPIRED" | "AUTHORIZATION_REVOKED"
  | "POLICY_UNAVAILABLE" | "POLICY_STALE" | "ILLEGAL_TRANSITION"
  | "NOT_FOUND" | "ALREADY_TERMINAL" | "DEADLINE_EXCEEDED" | "CANCELLED"
  | "CAPABILITY_UNAVAILABLE" | "STORE_UNAVAILABLE" | "FENCE_LOST"
  | "CURSOR_GAP" | "JOURNAL_CORRUPT" | "BLOB_MISSING"
  | "PROJECTION_STALE" | "PROJECTION_OVERSIZED" | "RANKING_UNAVAILABLE" | "STALE_PAGE"
  | "REGISTRY_VERSION_UNAVAILABLE" | "BACKUP_INVALID" | "RESTORE_REFUSED";

export interface MemoryErrorV1 {
  code: MemoryErrorCode;
  operation: MemoryOperation;
  message: string;
  retryable: boolean;
  error_receipt_digest?: Digest;
  // §5.10: an AdminProviderPort MUST set denial:true on an authorization denial, and MUST NOT set it on any
  // failure that is not an authorization decision. §5.5(d): the engine maps denial:true to code UNAUTHORIZED.
  denial?: true;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: MemoryErrorV1 };

export interface AuthorizationContextV1 {
  credential: string;
  context_ref?: OpaqueRef;
}

export interface AuthorizationResourceV1 {
  scope_ref?: OpaqueRef;
  record_id?: string;
  candidate_id?: string;
  source_record_id?: string;
  target_scope_ref?: OpaqueRef;
}

export interface AuthorizationRequestV1 {
  operation: MemoryOperation;
  resource: AuthorizationResourceV1;
  resource_digest: Digest;
  context: AuthorizationContextV1;
  issued_at: Instant;
  deadline_at: Instant;
}

export interface RedactionDirectiveV1 {
  mode: "field-allowlist";
  allowed_fields: ReadonlyArray<JsonPointer>;
  allow_derivation_lineage: boolean;
  max_packet_bytes: number;
}

export interface AuthorizationAllowedV1 {
  allowed: true;
  decision_id: OpaqueRef;
  policy_version: string;
  operation: MemoryOperation;
  resource_digest: Digest;
  scope_ref: OpaqueRef;
  not_before: Instant;
  expires_at: Instant;
  revocation_epoch: Cursor;
  redaction: RedactionDirectiveV1;
  authentication_receipt_digest: Digest;
  receipt_digest: Digest;
}

export interface AuthorizationDeniedV1 {
  allowed: false;
  decision_id: OpaqueRef;
  policy_version: string;
  operation: MemoryOperation;
  resource_digest: Digest;
  issued_at: Instant;
  reason_ref: OpaqueRef;
  receipt_digest: Digest;
}

export type AuthorizationResultV1 = AuthorizationAllowedV1 | AuthorizationDeniedV1;

export interface AuthorizationRevalidationV1 {
  receipt_digest: Digest;
  checked_at: Instant;
  valid: boolean;
  current_revocation_epoch: Cursor;
  reason: "valid" | "expired" | "revoked" | "unknown";
  revalidation_receipt_digest: Digest;
}

export interface RedactionRequestV1 {
  source_record: MemoryRecordV2;
  target_scope_ref: OpaqueRef;
  directive: RedactionDirectiveV1;
  authorization_receipt_digest: Digest;
}

export interface RedactionResultV1 {
  payload: CandidatePayloadV2;
  source_record_digest: Digest;
  output_payload_digest: Digest;
  policy_version: string;
  receipt_digest: Digest;
}

export interface AuthorizationPort {
  readonly version: 1;
  authorize(request: AuthorizationRequestV1): Promise<Result<AuthorizationResultV1>>;
  revalidate(receipt_digest: Digest, at: Instant): Promise<Result<AuthorizationRevalidationV1>>;
  redact(request: RedactionRequestV1): Promise<Result<RedactionResultV1>>;
}

export type AdmissionDecision = "accept" | "reject" | "adjudication_required";

export interface AdmissionPolicyRequestV1 {
  policy_id: OpaqueRef;
  policy_version: string;
  record_digest: Digest;
  payload_digest: Digest;
  candidate_envelope_ref: OpaqueRef;
  policy_evidence_digest: Digest;
  policy_evidence_ref: OpaqueRef;
  deadline_at: Instant;
}

export interface AdmissionDecisionEnvelopeV1 {
  policy_id: OpaqueRef;
  policy_version: string;
  record_digest: Digest;
  decision: AdmissionDecision;
  issued_at: Instant;
  receipt_digest: Digest;
}

export interface AdmissionPolicy {
  readonly policy_id: OpaqueRef;
  readonly policy_version: string;
  decide(request: AdmissionPolicyRequestV1): Promise<Result<AdmissionDecisionEnvelopeV1>>;
}

export interface EvidenceBundleV1 {
  evidence_ref: OpaqueRef;
  evidence_digest: Digest;
  citation_ids: ReadonlyArray<string>;
  attestation?: string;
}

export interface EvidenceVerificationRequestV1 {
  payload_digest: Digest;
  evidence: EvidenceBundleV1;
  deadline_at: Instant;
}

export interface EvidenceVerifierPort {
  readonly verifier_id: OpaqueRef;
  readonly verifier_version: string;
  classify(request: EvidenceVerificationRequestV1): Promise<Result<TrustBindingV1>>;
  revalidate(receipt_digest: Digest, at: Instant): Promise<Result<TrustRevalidationV1>>;
}

export interface TrustRevalidationV1 {
  binding_receipt_digest: Digest;
  checked_at: Instant;
  valid: boolean;
  current_revocation_epoch: Cursor;
  reason: "valid" | "expired" | "revoked" | "unknown";
  revalidation_receipt_digest: Digest;
}

export interface ActivityEvidenceV1 {
  evidence_id: OpaqueRef;
  subject_ref: OpaqueRef;
  sequence: Cursor;
  valid_time: ValidIntervalV1;
  components: ReadonlyArray<MemoryComponentV2>;
  primary_component_id: string;
  primary_event: PrimaryEventAnchorV1;
  citations: ReadonlyArray<CitationV1>;
  evidence_digest: Digest;
}

export interface ActivityEvidenceRequestV1 {
  after?: Cursor;
  limit: number;
  valid_window?: ValidIntervalV1;
  deadline_at: Instant;
  cancellation_ref: OpaqueRef;
}

export interface ActivityEvidencePageV1 {
  source_id: OpaqueRef;
  source_version: string;
  evidence: ReadonlyArray<ActivityEvidenceV1>;
  next_after?: Cursor;
  page_digest: Digest;
}

export interface ActivityEvidenceSource {
  readonly source_id: OpaqueRef;
  readonly source_version: string;
  read(request: ActivityEvidenceRequestV1): Promise<Result<ActivityEvidencePageV1>>;
  cancel(cancellation_ref: OpaqueRef): Promise<Result<{ cancelled: boolean }>>;
}

export interface CaptureRequestV2 {
  schema_version: 2;
  idempotency_key: IdempotencyKey;
  payload: CandidatePayloadV2;
  evidence: EvidenceBundleV1;
  authorization: AuthorizationContextV1;
  source_order: { source_ref: OpaqueRef; sequence: Cursor };
  deadline_at: Instant;
  cancellation_ref: OpaqueRef;
}

export interface CaptureAcknowledgementV1 {
  status: "committed_pending" | "duplicate_exact" | "refused" | "unavailable";
  candidate_id?: string;
  record_digest?: Digest;
  cursor?: Cursor;
  transaction_receipt_digest?: Digest;
}

export interface AdmissionRequestV1 {
  candidate_id: string;
  authorization: AuthorizationContextV1;
  deadline_at: Instant;
}

export interface AdmissionOutcomeV1 {
  status: "accepted" | "rejected" | "pending_adjudication" | "duplicate_exact";
  candidate_id: string;
  record_id?: string;
  cursor: Cursor;
  decision_receipt_digest: Digest;
  transaction_receipt_digest: Digest;
}

export interface LifecycleEventAnchorV1 {
  occurred_at: Instant;
  kind_ref: OpaqueRef;
  provenance_ref: OpaqueRef;
  provenance_digest: Digest;
}

export interface LifecycleCommandBaseV1 {
  event_id: IdempotencyKey;
  reason_ref: OpaqueRef;
  event_anchor: LifecycleEventAnchorV1;
  authorization: AuthorizationContextV1;
  deadline_at: Instant;
}

export type LifecycleCommandV1 = LifecycleCommandBaseV1 & (
  | { operation: "reject" | "withdraw"; candidate_id: string }
  | { operation: "dispute" | "resolve_dispute" | "expire" |
      "mark_non_current" | "trust_invalidate" | "tombstone";
      record_id: string; valid_effective_at?: number }
  | { operation: "supersede" | "rewind";
      record_id: string; related_record_id: string; valid_effective_at?: number }
);

export type MemoryState =
  | "pending" | "rejected" | "withdrawn"
  | "accepted_current" | "accepted_disputed" | "historical"
  | "expired" | "trust_invalid" | "tombstoned";

export interface LifecycleReceiptV1 {
  event_id: IdempotencyKey;
  operation: LifecycleCommandV1["operation"];
  from_state: MemoryState;
  to_state: MemoryState;
  cursor: Cursor;
  event_digest: Digest;
  authorization_receipt_digest: Digest;
  transaction_receipt_digest: Digest;
}

export interface CapitalisationRequestV1 {
  idempotency_key: IdempotencyKey;
  source_record_id: string;
  target_scope_ref: OpaqueRef;
  purpose_ref: OpaqueRef;
  retention: RetentionV1;
  authorization: AuthorizationContextV1;
  deadline_at: Instant;
}

export interface ProjectionInvalidationRequestV1 {
  through_cursor: Cursor;
  projection_ids: ReadonlyArray<OpaqueRef>;
  deadline_at: Instant;
}

export interface ProjectionInvalidationReceiptV1 {
  through_cursor: Cursor;
  projection_receipts: ReadonlyArray<{ projection_id: OpaqueRef; cursor: Cursor; digest: Digest }>;
  complete: boolean;
  receipt_digest: Digest;
}

export interface CapabilityDescriptorV1 {
  contract_version: 2;
  profiles: ReadonlyArray<"offline_lexical_v1" | "semantic_v1">;
  canonical_backends: ReadonlyArray<"sqlite" | "postgres">;
  max_candidates: 2000;
  max_results: 100;
  // §5.9: true iff this engine was wired with `allow_unfenced_memory_store` — the non-production posture that
  // lets a module in-memory store run unfenced. It is false on a correct production deployment; a `true` here on a
  // sqlite/postgres descriptor is an operator-visible misconfiguration alarm (the fence-bypass flag is set in prod).
  unfenced_memory_store_permitted: boolean;
  ephemeral_filesystem_store_permitted: boolean; // (new in this amendment) §5.9: mirrors the store receipt's ephemeral-fs posture; true on a production descriptor is a misconfiguration alarm
  receipt_digest: Digest;
}

export interface LifecycleEventV2 {
  schema_version: 2;
  event_id: IdempotencyKey;
  cursor: Cursor;
  recorded_at: Instant;
  operation: LifecycleCommandV1["operation"] | "capture" | "accept";
  candidate_id?: string;
  record_id?: string;
  related_record_id?: string;
  from_state?: MemoryState;
  to_state: MemoryState;
  valid_effective_at?: number;
  record_digest?: Digest;
  authorization_receipt_digest: Digest;
  admission_decision?: AdmissionDecisionEnvelopeV1;
  reason_ref?: OpaqueRef;
  event_anchor?: LifecycleEventAnchorV1;
  /** L3 journal spelling; equal to previous_event_digest when emitted. */
  previous_event_hash?: Digest;
  /** L3 journal spelling; equal to event_digest when emitted. */
  event_hash?: Digest;
  previous_event_digest: Digest;
  event_digest: Digest;
}

export interface SealedCandidateEnvelopeV1 {
  candidate_id: string;
  envelope_ref: OpaqueRef;
  envelope_digest: Digest;
  key_ref: OpaqueRef;
  ciphertext: string;
}

export interface PendingControlV1 {
  candidate_id: string;
  envelope_digest: Digest;
  state: "pending" | "rejected" | "withdrawn";
  created_cursor: Cursor;
  policy_id: OpaqueRef;
  policy_version: string;
}

/** Encrypted pending material is returned only through the canonical-store seam. */
export interface PendingCandidateSnapshotV1 {
  control: PendingControlV1;
  sealed: SealedCandidateEnvelopeV1;
}

export interface CanonicalTransactionReceiptV1 {
  operation: MemoryOperation;
  cursor: Cursor;
  storage_epoch: Cursor;
  record_digest?: Digest;
  event_digest: Digest;
  state_digest: Digest;
  lexical_digest?: Digest;
  outbox_digest?: Digest;
  committed_at: Instant;
  receipt_digest: Digest;
}

export interface AcceptedLexicalDocumentV1 {
  record_id: string;
  fields: {
    primary: string;
    context: string;
    decision: string;
    evidence: string;
    citations: string;
  };
  valid_time: ValidIntervalV1;
  trust_class: EvidenceClass;
  record_digest: Digest;
}

export interface AcceptedCandidateSnapshotV1 {
  snapshot_id: OpaqueRef;
  cursor: Cursor;
  valid_as_of: number;
  system_as_of: Cursor;
  documents: ReadonlyArray<AcceptedLexicalDocumentV1>;
  eligibility_digest: Digest;
  snapshot_digest: Digest;
}

export interface RevalidationRequestV1 {
  record_ids: ReadonlyArray<string>;
  valid_as_of: number;
  system_as_of: Cursor;
  authorization_receipt_digest: Digest;
  operation: "recall_current" | "recall_history" | "recall_disputed";
}

export interface RevalidationPacketV1 {
  eligible_record_ids: ReadonlyArray<string>;
  removed: ReadonlyArray<{
    record_id: string;
    reason: "state" | "valid_time" | "scope" | "expired" | "trust" | "tombstone" | "redaction";
  }>;
  cursor: Cursor;
  eligibility_digest: Digest;
  authorization_receipt_digest: Digest;
  receipt_digest: Digest;
}

export interface ProjectionBatchV1 {
  from_cursor_exclusive: Cursor;
  through_cursor_inclusive: Cursor;
  records: ReadonlyArray<ProjectionRecordV1>;
  removals: ReadonlyArray<{ record_id: string; reason_ref: OpaqueRef }>;
  batch_digest: Digest;
}

export interface ProjectionRecordV1 {
  record_id: string;
  record_digest: Digest;
  scope_ref: OpaqueRef;
  valid_time: ValidIntervalV1;
  trust_class: EvidenceClass;
  component_kinds: ReadonlyArray<MemoryComponentKind>;
  citation_refs: ReadonlyArray<OpaqueRef>;
}

/** Data-only provenance that every graph, edge, or vector projection carries. */
export interface MemoryProjectionEnvelopeV2 {
  schema_version: 2;
  record_id: string;
  record_digest: Digest;
  scope_ref: OpaqueRef;
  valid_time: ValidIntervalV1;
  projection_cursor: Cursor;
  envelope_digest: Digest;
}

export interface ProjectedNodeV2 {
  node_id: string;
  projection: MemoryProjectionEnvelopeV2;
}

export interface ProjectedEdgeV2 {
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  projection: MemoryProjectionEnvelopeV2;
}

export interface ProjectedVectorV2 {
  vector_id: string;
  projection: MemoryProjectionEnvelopeV2;
}

export type ProjectedObjectV2 = ProjectedNodeV2 | ProjectedEdgeV2 | ProjectedVectorV2;

/**
 * One current-graph projection object. It carries only a current accepted
 * projection envelope and citation references; never a record body, pending
 * material, journal event, or trust receipt.
 */
export interface BoundedProjectionObjectV1 {
  node_id: string;
  projection: MemoryProjectionEnvelopeV2;
  citation_refs: ReadonlyArray<OpaqueRef>;
}

/** The bounded `graph.json`-style current projection. History never inflates it. */
export interface BoundedCurrentProjectionV1 {
  schema_version: 1;
  projection_schema_version: 1;
  high_water_cursor: Cursor;
  projection_cursor: Cursor;
  objects: ReadonlyArray<BoundedProjectionObjectV1>;
  projection_digest: Digest;
}

export type ProjectionOmissionReason =
  | "pending" | "rejected" | "withdrawn" | "accepted_disputed"
  | "historical" | "expired" | "trust_invalid" | "tombstoned";

/** A bounded export never silently drops current entries; omission is always by an explicit reason. */
export interface BoundedProjectionExportV1 {
  schema_version: 1;
  projection_schema_version: 1;
  high_water_cursor: Cursor;
  projection_cursor: Cursor;
  included_count: number;
  omitted_total: number;
  omitted_by_reason: Record<ProjectionOmissionReason, number>;
  raw_byte_size: number;
  raw_byte_ceiling: number;
  projection: BoundedCurrentProjectionV1;
  projection_digest: Digest;
  export_digest: Digest;
}

/** One derived projection surface (FTS, nodes, edges, vectors, caches, aggregates, exports). */
export interface ProjectionInvalidationSurfaceV1 {
  readonly projection_id: OpaqueRef;
  invalidate(batch: ProjectionBatchV1): Promise<Result<{ projection_id: OpaqueRef; cursor: Cursor; digest: Digest }>>;
}

export interface CanonicalStoreCapabilitiesV1 {
  atomic_promotion: true;
  dense_cursor: true;
  accepted_only_lexical: true;
  fenced_single_writer: boolean;
  revocable_active_store: boolean;
  detached_snapshot: boolean;
  bounded_cancellation: boolean;
  backend: "memory" | "sqlite" | "postgres";
  // (new in this amendment) §5.9: OPTIONAL — true iff the fenced SQLite store was opened with
  // allow_ephemeral_filesystem_store (a NON-production opt-in permitting a tmpfs/overlayfs database). Omitted by
  // stores to which it does not apply; a true here on a production deployment is a misconfiguration alarm.
  ephemeral_filesystem_store_permitted?: boolean;
}

export type AdmissionStoreInputV1 =
  | {
      outcome: "accept";
      candidate_id: string;
      record: MemoryRecordV2;
      decision: AdmissionDecisionEnvelopeV1 & { decision: "accept" };
      event: LifecycleEventV2;
      lexical_document: AcceptedLexicalDocumentV1;
      projection_batch: ProjectionBatchV1;
    }
  | {
      outcome: "reject";
      candidate_id: string;
      decision: AdmissionDecisionEnvelopeV1 & { decision: "reject" };
      event: LifecycleEventV2;
    };

export interface CanonicalMemoryStorePort {
  readonly version: 1;
  readonly capabilities: CanonicalStoreCapabilitiesV1;
  commitPending(input: {
    control: PendingControlV1;
    sealed: SealedCandidateEnvelopeV1;
    capture_event: LifecycleEventV2;
  }): Promise<Result<CanonicalTransactionReceiptV1>>;
  readPending(input: {
    candidate_id: string;
    authorization_receipt_digest: Digest;
  }): Promise<Result<PendingCandidateSnapshotV1>>;
  applyAdmission(input: AdmissionStoreInputV1): Promise<Result<CanonicalTransactionReceiptV1>>;
  applyLifecycle(input: {
    command: LifecycleCommandV1;
    event: LifecycleEventV2;
    projection_batch: ProjectionBatchV1;
  }): Promise<Result<CanonicalTransactionReceiptV1>>;
  readRecord(input: {
    record_id: string;
    system_as_of: Cursor;
    authorization_receipt_digest: Digest;
  }): Promise<Result<MemoryRecordV2>>;
  acceptedSnapshot(input: {
    valid_as_of: number;
    system_as_of: Cursor;
    authorization_receipt_digest: Digest;
    max_candidates: number;
  }): Promise<Result<AcceptedCandidateSnapshotV1>>;
  revalidate(input: RevalidationRequestV1): Promise<Result<RevalidationPacketV1>>;
  readJournal(input: { after: Cursor; limit: number }): Promise<Result<ReadonlyArray<LifecycleEventV2>>>;
  checkpoint(input: { through_cursor: Cursor }): Promise<Result<RecoveryCheckpointManifestV1>>;
  nextProjectionBatch(input: { after: Cursor; limit: number }): Promise<Result<ProjectionBatchV1>>;
  acknowledgeProjection(input: ProjectionInvalidationReceiptV1): Promise<Result<CanonicalTransactionReceiptV1>>;
  readiness(): Promise<Result<OperationalCapabilityReceiptV1>>;
  close(): Promise<Result<{ closed: true }>>;
}

export interface GraphProjectionPort {
  readonly version: 1;
  apply(batch: ProjectionBatchV1): Promise<Result<ProjectionInvalidationReceiptV1>>;
}

export interface VectorQueryInputV1 {
  snapshot_id: OpaqueRef;
  eligible_record_ids: ReadonlyArray<string>;
  query_text: string;
  limit: number;
}

export interface VectorQueryOutputV1 {
  matches: ReadonlyArray<{ record_id: string; score: number }>;
  model_ref: OpaqueRef;
  projection_cursor: Cursor;
  receipt_digest: Digest;
}

export interface VectorProjectionPort {
  readonly version: 1;
  query(input: VectorQueryInputV1): Promise<Result<VectorQueryOutputV1>>;
  apply(batch: ProjectionBatchV1): Promise<Result<ProjectionInvalidationReceiptV1>>;
}

export interface SemanticAdjacencyV1 {
  record_ids: ReadonlyArray<string>;
  offsets: ReadonlyArray<number>;
  neighbours: ReadonlyArray<number>;
  weights: ReadonlyArray<number>;
  projection_cursor: Cursor;
  adjacency_digest: Digest;
}

export interface SemanticProjectionPort {
  readonly version: 1;
  inducedAdjacency(input: {
    eligible_record_ids: ReadonlyArray<string>;
    system_as_of: Cursor;
  }): Promise<Result<SemanticAdjacencyV1>>;
}

export interface CryptoPort {
  readonly version: 1;
  seal(input: { candidate_id: string; plaintext: string; context_digest: Digest }): Promise<Result<SealedCandidateEnvelopeV1>>;
  open(input: { sealed: SealedCandidateEnvelopeV1; context_digest: Digest }): Promise<Result<{ plaintext: string }>>;
  destroy(input: { key_ref: OpaqueRef; idempotency_key: IdempotencyKey }): Promise<Result<{ destroyed: boolean; receipt_digest: Digest }>>;
  rotate(input: { key_ref: OpaqueRef; idempotency_key: IdempotencyKey }): Promise<Result<{ key_ref: OpaqueRef; receipt_digest: Digest }>>;
}

export interface BackupKeyPort {
  readonly version: 1;
  seal(input: {
    key_ref: OpaqueRef;
    plaintext: string;
    context_digest: Digest;
  }): Promise<Result<{
    ciphertext: string;
    ciphertext_digest: Digest;
    key_receipt_digest: Digest;
  }>>;
  open(input: {
    key_ref: OpaqueRef;
    ciphertext: string;
    context_digest: Digest;
  }): Promise<Result<{ plaintext: string; key_receipt_digest: Digest }>>;
}

export interface BackupObjectPort {
  readonly version: 1;
  put(input: {
    target_ref: OpaqueRef;
    object_id: OpaqueRef;
    ciphertext: string;
    ciphertext_digest: Digest;
  }): Promise<Result<{ object_ref: OpaqueRef; object_receipt_digest: Digest }>>;
  get(input: {
    source_ref: OpaqueRef;
    object_ref: OpaqueRef;
    expected_ciphertext_digest: Digest;
  }): Promise<Result<{ ciphertext: string; object_receipt_digest: Digest }>>;
}

export interface RecoveryCheckpointManifestV1 {
  schema_version: 1;
  high_water_cursor: Cursor;
  storage_epoch: Cursor;
  state_digest: Digest;
  journal_root_digest: Digest;
  blob_root_digest: Digest;
  policy_versions: ReadonlyArray<{ id: OpaqueRef; version: string }>;
  registry_versions: ReadonlyArray<{ id: OpaqueRef; version: string }>;
  included_classes: ReadonlyArray<MemoryState | "pending_envelope" | "journal" | "blob_ref">;
  external_blob_refs: ReadonlyArray<{ ref: OpaqueRef; digest: Digest }>;
  manifest_digest: Digest;
}

export interface LogicalBackupManifestV1 {
  schema_version: 1;
  generation: Cursor;
  high_water_cursor: Cursor;
  included_classes: ReadonlyArray<"accepted_current" | "accepted_disputed" | "historical" | "terminal_ledger">;
  excluded_counts: { pending: number; rejected: number; withdrawn: number; derived_projections: number };
  records_root_digest: Digest;
  journal_root_digest: Digest;
  state_digest: Digest;
  terminal_ledger_digest: Digest;
  object_ref: OpaqueRef;
  ciphertext_digest: Digest;
  key_receipt_digest: Digest;
  object_receipt_digest: Digest;
  manifest_digest: Digest;
}

export interface MemoryBackupPort {
  readonly version: 1;
  exportLogical(input: {
    through_cursor: Cursor;
    authorization: AuthorizationContextV1;
    object_target_ref: OpaqueRef;
    encryption_key_ref: OpaqueRef;
    deadline_at: Instant;
  }): Promise<Result<LogicalBackupManifestV1>>;
  restoreLogical(input: {
    manifest: LogicalBackupManifestV1;
    authorization: AuthorizationContextV1;
    source_ref: OpaqueRef;
    decryption_key_ref: OpaqueRef;
    deadline_at: Instant;
  }): Promise<Result<{ restored_cursor: Cursor; canonical_state_digest: Digest; receipt_digest: Digest }>>;
}

export interface OperationalCapabilityReceiptV1 {
  store_id: OpaqueRef;
  backend: "memory" | "sqlite" | "postgres";
  storage_epoch: Cursor;
  high_water_cursor: Cursor;
  capabilities: CanonicalStoreCapabilitiesV1;
  // §5.9 declared adapter identity (all three present or all absent). A production store's fenced factory stamps
  // these from its module's compiled identity; the engine compares them to its own compiled identity, and pairs
  // that with an in-process provenance mark (§5.9, graphify-memory/store-factory). There is no signature.
  adapter_id?: OpaqueRef;
  adapter_version?: string;
  adapter_build_digest?: Digest;
  issued_at: Instant;
  expires_at: Instant;
  // §5.9 non-circularity: computed over the receipt WITHOUT receipt_digest.
  receipt_digest: Digest;
}

export interface ClockPort {
  now(): Instant;
}

export interface AssertionComparisonInputV1 {
  family_id: OpaqueRef;
  family_version: string;
  left: MemoryRecordV2;
  right: MemoryRecordV2;
  comparison_system_as_of: Cursor;
}

export interface AssertionFamilyDescriptorV1 {
  family_id: OpaqueRef;
  version: string;
  applies_to_component_kinds: ReadonlyArray<MemoryComponentKind>;
  occurrence_key_version: string;
  comparator_version: string;
  descriptor_digest: Digest;
}

export type ReconciliationRelation = "contradicts" | "supersedes" | "needs_adjudication";

export interface ReconciliationProposalV1 {
  proposal_id: Digest;
  family_id: OpaqueRef;
  family_version: string;
  occurrence_key: string;
  left_record_id: string;
  right_record_id: string;
  relation: ReconciliationRelation;
  comparison_system_as_of: Cursor;
  evidence_citation_ids: ReadonlyArray<string>;
  proposal_digest: Digest;
}

export interface AssertionFamilyRegistry {
  readonly registry_id: OpaqueRef;
  readonly registry_version: string;
  descriptors(): ReadonlyArray<AssertionFamilyDescriptorV1>;
  occurrenceKey(input: AssertionComparisonInputV1): Result<string>;
  compare(input: AssertionComparisonInputV1): Result<ReconciliationProposalV1 | undefined>;
}

export interface RecallCapabilityPolicyV1 {
  minimum_channels: "lexical" | "lexical_and_semantic";
  network: "forbid" | "allow";
}

export interface RecallRequestV2 {
  query: string;
  purpose_ref: OpaqueRef;
  as_of?: { valid_time?: number; system_cursor?: Cursor };
  authorization: AuthorizationContextV1;
  capability_policy: RecallCapabilityPolicyV1;
  budgets: {
    max_candidates: number;
    max_results: number;
    max_packet_bytes: number;
    deadline_at: Instant;
  };
  page?: { size: number; cursor?: OpaqueRef };
}

export interface RankReceiptV1 {
  request_digest: Digest;
  authorization_receipt_digest: Digest;
  profile: "offline_lexical_v1" | "semantic_v1";
  profile_version: string;
  profile_config_digest: Digest;
  valid_as_of: number;
  system_as_of: Cursor;
  snapshot_id: OpaqueRef;
  snapshot_digest: Digest;
  candidate_count: number;
  candidate_ids_digest: Digest;
  scoring_formula_ref: OpaqueRef;
  ordered_ids_digest: Digest;
  revalidation_receipt_digest: Digest;
  projection_receipt_digests: ReadonlyArray<Digest>;
  issued_at: Instant;
  receipt_digest: Digest;
}

export interface RecallRecordPacketV2 {
  record: MemoryRecordV2;
  redacted_fields: ReadonlyArray<JsonPointer>;
  redaction_receipt_digest: Digest;
  score: number;
  rank: number;
}

export interface RecallPacketV2 {
  records: ReadonlyArray<RecallRecordPacketV2>;
  rank_receipt: RankReceiptV1;
  next_page_cursor?: OpaqueRef;
  packet_digest: Digest;
}

export interface FencedStoreConstructionV1 {
  store_id: OpaqueRef;
  backend: "sqlite" | "postgres";
  deadline_at: Instant;
}

export interface CanonicalMemoryStoreFactoryV1 {
  readonly version: 1;
  readonly adapter_id: OpaqueRef;
  readonly adapter_version: string;
  acquire(input: FencedStoreConstructionV1): Promise<Result<CanonicalMemoryStorePort>>;
}

export interface AdminBootstrapRequestV1 {
  store_id: OpaqueRef;
  // §5.5(b): MUST equal the live storage fence epoch; the engine refuses FENCE_LOST before any dispatch otherwise.
  storage_epoch: Cursor;
  // graphify never interprets admin_credential_ref (§5.10) — it is opaque and handed to the AdminProviderPort verbatim.
  admin_credential_ref: OpaqueRef;
  deadline_at: Instant;
}

export interface AdminRotateRequestV1 {
  store_id: OpaqueRef;
  current_authorization_epoch: Cursor;
  authorization: AuthorizationContextV1;
  deadline_at: Instant;
}

export interface AdminRevokeRequestV1 {
  store_id: OpaqueRef;
  current_authorization_epoch: Cursor;
  credential_digest: Digest;
  authorization: AuthorizationContextV1;
  deadline_at: Instant;
}

export interface AdminEpochReceiptV1 {
  store_id: OpaqueRef;
  storage_epoch: Cursor;
  operation: "bootstrap" | "rotate" | "revoke";
  // §5.10: the AuthorizationPort revocation_epoch counter — distinct from TrustBindingV1.revocation_epoch AND from storage_epoch (three neighbouring epochs).
  authorization_epoch: Cursor;
  credential_digest: Digest;
  issued_at: Instant;
  // §5.10: MUST be ≤ 5 min after issued_at and bound to authorization_epoch; rotate/revoke invalidates earlier receipts atomically.
  expires_at: Instant;
  // §5.9 non-circularity: computed over the receipt WITHOUT receipt_digest.
  receipt_digest: Digest;
}

export type AdminOperationRequestV1 =
  | { operation: "bootstrap"; bootstrap: AdminBootstrapRequestV1 }
  | { operation: "rotate"; rotate: AdminRotateRequestV1 }
  | { operation: "revoke"; revoke: AdminRevokeRequestV1 };

// §5.10 D2 — the injected administrator replacing the retired built-in. Six normative requirements the types cannot express:
// (1) default-deny before the first valid receipt; (2) receipts ≤5 min bound to the authorization epoch;
// (3) rotate/revoke atomically increments the epoch and invalidates earlier receipts; (4) no bypass on credential loss;
// (5) six-field admission envelope (§5.3); (6) minimal-allowlist redaction. bootstrap succeeds only on EMPTY admin state under an active fence.
export interface AdminProviderPort {
  readonly version: 1;
  bootstrap(request: AdminBootstrapRequestV1): Promise<Result<AdminEpochReceiptV1>>;
  rotate(request: AdminRotateRequestV1): Promise<Result<AdminEpochReceiptV1>>;
  revoke(request: AdminRevokeRequestV1): Promise<Result<AdminEpochReceiptV1>>;
}

// §5.9 capability attestation, by IN-PROCESS PROVENANCE (not cryptography — the trust boundary is deployment
// topology, l.1045). A production store is admitted for a fencing-dependent op ONLY when it is a member of this
// build's fence-mark registry — a mark the sqlite/postgres OPENER applies after taking a REAL kernel writer fence
// (sqlite: a flock on the DB inode + a /proc/self/fdinfo liveness proof; postgres: the advisory-lock generation),
// which the factory propagates to the store it returns. There is NO signer, key, or signature, and NO declared-
// identity comparison: membership alone is the admission basis (the retired identity check added nothing — a
// same-module store always matched — and a self-asserted boolean is of the same forgeable family). This identity
// type remains only as the shape of the receipt's DECLARED adapter identity, which is INFORMATIONAL/diagnostic
// (a duplicate package or version drift is legible in the receipt), never the admission basis. See
// graphify-memory/store-factory (verifyStoreProvenance and the internal opener-applied fence mark).
export interface CapabilityAttestationIdentityV1 {
  readonly adapter_id: OpaqueRef;
  readonly adapter_version: string;
  readonly adapter_build_digest: Digest;
}

export interface MemoryPortV2 {
  readonly version: 2;
  capabilities(): Promise<Result<CapabilityDescriptorV1>>;
  validate(payload: CandidatePayloadV2): Result<{ payload_digest: Digest }>;
  capture(request: CaptureRequestV2): Promise<Result<CaptureAcknowledgementV1>>;
  cancelCapture(cancellation_ref: OpaqueRef): Promise<Result<{ cancelled: boolean }>>;
  requestAdmission(request: AdmissionRequestV1): Promise<Result<AdmissionOutcomeV1>>;
  transition(command: LifecycleCommandV1): Promise<Result<LifecycleReceiptV1>>;
  recall(request: RecallRequestV2): Promise<Result<RecallPacketV2>>;
  proposeCapitalisation(request: CapitalisationRequestV1): Promise<Result<CaptureAcknowledgementV1>>;
  invalidateProjections(request: ProjectionInvalidationRequestV1): Promise<Result<ProjectionInvalidationReceiptV1>>;
  readiness(): Promise<Result<OperationalCapabilityReceiptV1>>;
  // §5.5: the single graphify-mediated admin entry point. Engine steps: no admin_provider => CAPABILITY_UNAVAILABLE;
  // shape-invalid => INVALID_SCHEMA; bootstrap => FENCE_LOST unless request.storage_epoch equals the live fence epoch (before dispatch);
  // then dispatch to admin_provider per discriminant and pass its Result through (a port denial surfaces as UNAUTHORIZED).
  admin(request: AdminOperationRequestV1): Promise<Result<AdminEpochReceiptV1>>;
}

export interface MemoryEngineDependenciesV2 {
  canonical_store: CanonicalMemoryStorePort;
  authorization: AuthorizationPort;
  admission_policy: AdmissionPolicy;
  admin_provider?: AdminProviderPort;
  // §5.9: production is fail-closed — an unfenced store (not built by this build's fenced factory) is refused
  // unless this is explicitly set for a NON-production embedded fake. Never inferred from the receipt's backend
  // string (forgeable): a "memory"-labelled store wired in production must not bypass fencing.
  allow_unfenced_memory_store?: boolean;
  // §5.9 (v5-c): optional observability hook fired ONCE at engine construction when `allow_unfenced_memory_store`
  // is set, so a host logs/audits the non-production posture at startup (the neutral package emits no console).
  on_unfenced_memory_store_permitted?: () => void;
  evidence_verifier?: EvidenceVerifierPort;
  crypto: CryptoPort;
  activity_sources: ReadonlyArray<ActivityEvidenceSource>;
  graph_projection?: GraphProjectionPort;
  vector_projection?: VectorProjectionPort;
  semantic_projection?: SemanticProjectionPort;
  assertion_registry?: AssertionFamilyRegistry;
  backup_object?: BackupObjectPort;
  backup_key?: BackupKeyPort;
  clock: ClockPort;
}
