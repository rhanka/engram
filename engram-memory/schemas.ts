const digest = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" } as const;
const opaqueRef = { type: "string", minLength: 1, maxLength: 512 } as const;
const closedInterval = {
  type: "object",
  additionalProperties: false,
  required: ["t"],
  properties: {
    t: { type: "integer" },
    t_end: { type: "integer" },
  },
} as const;
const locator = {
  type: "object",
  additionalProperties: false,
  required: ["scheme", "value"],
  properties: { scheme: { type: "string", minLength: 1 }, value: { type: "string", minLength: 1 } },
} as const;
const citation = {
  type: "object",
  additionalProperties: false,
  required: ["citation_id", "source_ref", "locator", "content_digest"],
  properties: {
    citation_id: opaqueRef,
    source_ref: opaqueRef,
    locator,
    content_digest: digest,
    observed_at: { type: "string" },
  },
} as const;
const component = {
  type: "object",
  additionalProperties: false,
  required: ["component_id", "kind", "text", "citation_ids"],
  properties: {
    component_id: opaqueRef,
    kind: { enum: ["context", "decision", "evidence"] },
    text: { type: "string", minLength: 1, maxLength: 65536 },
    citation_ids: { type: "array", minItems: 1, items: opaqueRef },
  },
} as const;
const primaryEvent = {
  type: "object",
  additionalProperties: false,
  required: ["at", "type_ref", "citation_id"],
  properties: { at: { type: "integer" }, type_ref: opaqueRef, citation_id: opaqueRef },
} as const;
const retention = {
  type: "object",
  additionalProperties: false,
  required: ["derivative_rule"],
  properties: { expires_at: { type: "string" }, derivative_rule: { enum: ["retain", "make-ineligible"] } },
} as const;
const reconciliation = {
  type: "object",
  additionalProperties: false,
  required: ["family_refs"],
  properties: { family_refs: { type: "array", items: opaqueRef } },
} as const;
const derivation = {
  type: "object",
  additionalProperties: false,
  required: ["source_record_ids", "transform_ref", "transform_receipt_digest"],
  properties: {
    source_record_ids: { type: "array", minItems: 1, maxItems: 64, items: opaqueRef },
    transform_ref: opaqueRef,
    transform_receipt_digest: digest,
  },
} as const;
const trust = {
  type: "object",
  additionalProperties: false,
  required: ["class", "evidence_digest", "verifier_id", "verifier_version", "issued_at", "revocation_epoch", "receipt_digest"],
  properties: {
    class: { enum: ["earned", "asserted", "signed"] },
    evidence_digest: digest,
    verifier_id: opaqueRef,
    verifier_version: { type: "string", minLength: 1 },
    issued_at: { type: "string" },
    expires_at: { type: "string" },
    revocation_epoch: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
    receipt_digest: digest,
  },
} as const;

const candidateProperties = {
  schema_version: { const: 2 },
  scope_ref: opaqueRef,
  purpose_ref: opaqueRef,
  valid_time: closedInterval,
  components: { type: "array", minItems: 1, maxItems: 64, items: component },
  primary_component_id: opaqueRef,
  primary_event: primaryEvent,
  citations: { type: "array", minItems: 1, maxItems: 256, items: citation },
  retention,
  reconciliation,
  derivation,
} as const;

const candidateRequired = [
  "schema_version", "scope_ref", "purpose_ref", "valid_time", "components",
  "primary_component_id", "primary_event", "citations", "retention", "reconciliation",
] as const;

/** JSON Schema companion to the exact runtime validator. */
export const CANDIDATE_PAYLOAD_V2_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: candidateRequired,
  properties: candidateProperties,
} as const;

/** JSON Schema companion to the exact immutable record validator. */
export const MEMORY_RECORD_V2_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    ...candidateRequired,
    "record_id", "payload_digest", "record_digest", "recorded_at", "recorded_cursor",
    "authorization_receipt_digest", "trust",
  ],
  properties: {
    ...candidateProperties,
    record_id: { type: "string", pattern: "^mem_[a-z2-7]+$" },
    payload_digest: digest,
    record_digest: digest,
    recorded_at: { type: "string" },
    recorded_cursor: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
    authorization_receipt_digest: digest,
    trust,
  },
} as const;
