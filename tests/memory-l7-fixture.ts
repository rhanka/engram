import {
  createInMemoryCanonicalMemoryStoreV1,
  createMemoryPortV2,
  knowledgePayloadDigest,
  memoryJournalEventHashV1,
  receiptDigest,
  type AssertionFamilyRegistry,
  type CanonicalMemoryStorePort,
  type Digest,
  type EvidenceClass,
  type MemoryEngineDependenciesV2,
  type MemoryPortV2,
  type SemanticProjectionPort,
  type ValidIntervalV1,
  type VectorProjectionPort,
} from "../engram-memory/index.js";

export const NOW = "2026-08-16T12:34:56.789Z";
export const DEADLINE = "2026-08-16T12:40:00.000Z";
export const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Digest;

/** Full record top-level allowlist so recall returns a usable redacted record. */
export const FULL_ALLOWLIST = [
  "/authorization_receipt_digest", "/citations", "/components", "/derivation", "/payload_digest",
  "/primary_component_id", "/primary_event", "/purpose_ref", "/reconciliation", "/record_digest",
  "/record_id", "/recorded_at", "/recorded_cursor", "/retention", "/schema_version", "/scope_ref",
  "/trust", "/valid_time",
];

export interface AuthorizationRequestLike {
  operation: string;
  resource: { scope_ref?: string; record_id?: string; source_record_id?: string; target_scope_ref?: string };
  resource_digest: Digest;
  context: { credential: string; context_ref?: string };
}

export interface FixtureOptions {
  scope?: string;
  allowedFields?: string[];
  allowLineage?: boolean;
  scopeResolver?: (request: AuthorizationRequestLike) => string;
  semantic?: SemanticProjectionPort;
  vector?: VectorProjectionPort;
  store?: CanonicalMemoryStorePort;
  clock?: { now: () => string };
  authorizationExpiresAt?: string;
  assertionRegistry?: AssertionFamilyRegistry;
  /** Records the receipt digest the fake authorization port issued per call, so tests can recompute digests. */
  authorizationLog?: Array<{ operation: string; resource: unknown; receipt_digest: Digest }>;
  /** Injects the fixture's evidence verifier, which serves the per-record trust class set by `seedAccepted`. */
  seededTrustClasses?: boolean;
}

export function buildMemory(options: FixtureOptions = {}): { memory: MemoryPortV2; store: CanonicalMemoryStorePort; dependencies: MemoryEngineDependenciesV2 } {
  const scope = options.scope ?? "mem:scope";
  const clock = options.clock ?? { now: () => NOW };
  const store = options.store ?? createInMemoryCanonicalMemoryStoreV1({ clock });

  const authorization = {
    version: 1 as const,
    async authorize(request: AuthorizationRequestLike) {
      const resolved = options.scopeResolver ? options.scopeResolver(request) : (request.resource.scope_ref ?? scope);
      const body = {
        allowed: true as const,
        decision_id: "decision:l7",
        policy_version: "1",
        operation: request.operation,
        resource_digest: request.resource_digest,
        scope_ref: resolved,
        not_before: NOW,
        expires_at: options.authorizationExpiresAt ?? DEADLINE,
        revocation_epoch: "0",
        redaction: {
          mode: "field-allowlist" as const,
          allowed_fields: options.allowedFields ?? FULL_ALLOWLIST,
          allow_derivation_lineage: options.allowLineage ?? false,
          max_packet_bytes: 1_048_576,
        },
        authentication_receipt_digest: DIGEST,
      };
      const allowed = { ...body, receipt_digest: receiptDigest("authorization-allowed", body) };
      options.authorizationLog?.push({ operation: request.operation, resource: request.resource, receipt_digest: allowed.receipt_digest });
      return { ok: true as const, value: allowed };
    },
    async revalidate(receipt_digest: Digest, checked_at: string) {
      const body = { receipt_digest, checked_at, valid: true, current_revocation_epoch: "0", reason: "valid" as const };
      return { ok: true as const, value: { ...body, revalidation_receipt_digest: receiptDigest("authorization-revalidation", body, "revalidation_receipt_digest") } };
    },
    async redact(request: { source_record: Record<string, unknown>; target_scope_ref: string }) {
      const src = request.source_record as {
        scope_ref: string; purpose_ref: string; valid_time: ValidIntervalV1; components: unknown[];
        primary_component_id: string; primary_event: unknown; citations: unknown[]; retention: unknown; record_digest: Digest;
      };
      const payload = {
        schema_version: 2 as const,
        scope_ref: src.scope_ref,
        purpose_ref: src.purpose_ref,
        valid_time: src.valid_time,
        components: src.components,
        primary_component_id: src.primary_component_id,
        primary_event: src.primary_event,
        citations: src.citations,
        retention: src.retention,
        reconciliation: { family_refs: [] },
      };
      const body = {
        payload,
        source_record_digest: src.record_digest,
        output_payload_digest: knowledgePayloadDigest(payload as never),
        policy_version: "1",
      };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("redaction-result", body) } };
    },
  };

  const policy = {
    policy_id: "policy:l7",
    policy_version: "1",
    async decide(request: { record_digest: Digest }) {
      const body = { policy_id: "policy:l7", policy_version: "1", record_digest: request.record_digest, decision: "accept" as const, issued_at: NOW };
      return { ok: true as const, value: { ...body, receipt_digest: receiptDigest("admission-decision", body) } };
    },
  };

  const plaintext = new Map<string, string>();
  const crypto = {
    version: 1 as const,
    async seal(input: { candidate_id: string; plaintext: string }) {
      plaintext.set(input.candidate_id, input.plaintext);
      const body = { candidate_id: input.candidate_id, envelope_ref: `envelope:${input.candidate_id}`, key_ref: `key:${input.candidate_id}`, ciphertext: `ciphertext:${input.candidate_id}` };
      return { ok: true as const, value: { ...body, envelope_digest: receiptDigest("sealed-candidate", body) } };
    },
    async open(input: { sealed: { candidate_id: string } }) {
      const value = plaintext.get(input.sealed.candidate_id);
      return value === undefined
        ? { ok: false as const, error: { code: "UNAUTHORIZED" as const, operation: "inspect_candidate" as const, message: "destroyed", retryable: false } }
        : { ok: true as const, value: { plaintext: value } };
    },
    async destroy(input: { key_ref: string }) {
      const body = { destroyed: true, key_ref: input.key_ref };
      return { ok: true as const, value: { destroyed: true, receipt_digest: receiptDigest("key-destruction", body) } };
    },
    async rotate() { throw new Error("unused"); },
  };

  const dependencies = {
    canonical_store: store,
    authorization,
    admission_policy: policy,
    crypto,
    activity_sources: [],
    // §5.9: non-production embedded harness — opt into the neutral in-memory store (inert when a fenced store is injected).
    allow_unfenced_memory_store: true,
    ...(options.semantic ? { semantic_projection: options.semantic } : {}),
    ...(options.vector ? { vector_projection: options.vector } : {}),
    ...(options.assertionRegistry ? { assertion_registry: options.assertionRegistry } : {}),
    ...(options.seededTrustClasses ? { evidence_verifier: seededTrustVerifier() } : {}),
    clock,
  } as unknown as MemoryEngineDependenciesV2;
  const memory = createMemoryPortV2(dependencies);
  return { memory, store, dependencies };
}

export interface SeedOptions {
  scope?: string;
  validTime?: ValidIntervalV1;
  componentKind?: "context" | "decision" | "evidence";
  /** Reconciliation families the record opts into; `[]` leaves it out of every family. */
  families?: readonly string[];
  /** Trust class the fixture's evidence verifier returns for this record (needs `seededTrustClasses`). */
  trustClass?: EvidenceClass;
  /** Retention expiry instant (`retention.expires_at`); omitted means no expiry. */
  retentionExpiresAt?: string;
}

/** Per-record trust classes served by the fixture's evidence verifier, keyed by the capture's evidence_ref. */
const seededTrustClassByEvidenceRef = new Map<string, EvidenceClass>();

/** The fixture's evidence verifier: serves the per-record trust class chosen in `seedAccepted`. */
function seededTrustVerifier() {
  return {
    version: 1 as const,
    verifier_id: "verifier:l7",
    verifier_version: "1",
    async classify(request: { payload_digest: Digest; evidence: { evidence_ref: string } }) {
      const trustClass = seededTrustClassByEvidenceRef.get(request.evidence.evidence_ref) ?? "asserted";
      const body = {
        class: trustClass,
        evidence_digest: DIGEST,
        verifier_id: "verifier:l7",
        verifier_version: "1",
        issued_at: NOW,
        revocation_epoch: "0",
      };
      return {
        ok: true as const,
        value: { ...body, receipt_digest: receiptDigest(`${trustClass}-trust`, { ...body, payload_digest: request.payload_digest }) },
      };
    },
    async revalidate() {
      throw new Error("unused");
    },
  };
}

let sequenceCounter = 0;

/** Capture and admit one accepted record; returns its canonical record_id. */
export async function seedAccepted(memory: MemoryPortV2, text: string, options: SeedOptions = {}): Promise<string> {
  const sequence = String(sequenceCounter++);
  const scope = options.scope ?? "mem:scope";
  if (options.trustClass !== undefined) seededTrustClassByEvidenceRef.set(`evidence:${sequence}`, options.trustClass);
  const request = {
    schema_version: 2 as const,
    idempotency_key: `idem-${sequence}-${"0".repeat(16)}`,
    payload: {
      schema_version: 2 as const,
      scope_ref: scope,
      purpose_ref: "purpose:l7",
      valid_time: options.validTime ?? { t: 1 },
      components: [{ component_id: `component:${sequence}`, kind: options.componentKind ?? ("context" as const), text, citation_ids: [`citation:${sequence}`] }],
      primary_component_id: `component:${sequence}`,
      primary_event: { at: 1, type_ref: "event:l7", citation_id: `citation:${sequence}` },
      citations: [{ citation_id: `citation:${sequence}`, source_ref: `source:${sequence}`, locator: { scheme: "document", value: `l7#${sequence}` }, content_digest: DIGEST }],
      retention: options.retentionExpiresAt === undefined
        ? { derivative_rule: "retain" as const }
        : { derivative_rule: "retain" as const, expires_at: options.retentionExpiresAt },
      reconciliation: { family_refs: [...(options.families ?? [])] },
    },
    evidence: { evidence_ref: `evidence:${sequence}`, evidence_digest: DIGEST, citation_ids: [`citation:${sequence}`] },
    authorization: { credential: "credential:l7" },
    source_order: { source_ref: `source:${sequence}`, sequence: "0" },
    deadline_at: DEADLINE,
    cancellation_ref: `cancel:${sequence}`,
  };
  const captured = await memory.capture(request);
  if (!captured.ok) throw new Error(`capture failed: ${captured.error.code} ${captured.error.message}`);
  const candidateId = captured.value.candidate_id!;
  const admitted = await memory.requestAdmission({ candidate_id: candidateId, authorization: { credential: "credential:l7" }, deadline_at: DEADLINE });
  if (!admitted.ok) throw new Error(`admission failed: ${admitted.error.code} ${admitted.error.message}`);
  if (admitted.value.record_id === undefined) throw new Error(`admission did not accept: ${admitted.value.status}`);
  return admitted.value.record_id;
}

/**
 * Builds a canonical store prefilled with `count` chained filler capture
 * events (a valid hash chain cloned from a real capture event) for
 * over-page journal tests. The engine under test then runs over a journal
 * whose tombstones sit past the first 2000-event page.
 */
export function createDeepJournalStoreV1(
  templateEvent: unknown, count: number, clock: { now(): string },
): CanonicalMemoryStorePort {
  const { event_hash: _dropped, ...body } = templateEvent as Record<string, unknown>;
  const events: unknown[] = [];
  let previous = (templateEvent as { previous_event_hash: string }).previous_event_hash;
  for (let i = 0; i < count; i++) {
    const event = {
      ...body, event_id: `filler:event:${i}`, candidate_id: `candidate:filler:${i}`,
      cursor: String(i + 1), previous_event_hash: previous,
    };
    const event_hash = memoryJournalEventHashV1(event as never);
    events.push({ ...event, event_hash });
    previous = event_hash;
  }
  return createInMemoryCanonicalMemoryStoreV1({
    clock,
    persistence: { journal: events as never, controls: [], envelopes: [], records: [], lexical: [], outbox: [] },
  });
}

export function recallRequest(query: string, overrides: Partial<{
  minimum_channels: "lexical" | "lexical_and_semantic";
  network: "forbid" | "allow";
  as_of: { valid_time?: number; system_cursor?: string };
  page: { size: number; cursor?: string };
  max_results: number;
  max_packet_bytes: number;
}> = {}) {
  return {
    query,
    purpose_ref: "purpose:l7",
    ...(overrides.as_of ? { as_of: overrides.as_of } : {}),
    authorization: { credential: "credential:l7" },
    capability_policy: { minimum_channels: overrides.minimum_channels ?? ("lexical" as const), network: overrides.network ?? ("forbid" as const) },
    budgets: {
      max_candidates: 2000,
      max_results: overrides.max_results ?? 100,
      max_packet_bytes: overrides.max_packet_bytes ?? 1_048_576,
      deadline_at: DEADLINE,
    },
    ...(overrides.page ? { page: overrides.page } : {}),
  };
}
