/**
 * Slice 1 — App-neutral MCP provider manifest & capability schemas.
 *
 * Concrete TypeScript transcription of SPEC_EVOL_APP_MCP_PROVIDER_PLATFORM §4.2
 * and §4.3 (closed capability schemas). These are pure type declarations: the
 * generic platform contract any Sentropic application or connector implements.
 *
 * Faithfulness notes:
 * - Read-only capabilities (resources, prompts) declare the closed read-only
 *   exception EXPLICITLY (`mutatesExternalSystem: false`,
 *   `idempotency: { required: false }`) — never left implicitly undefined (§4.3).
 * - Per-capability gates/idempotency/redaction/freshness are authoritative on
 *   each capability; manifest-level `authz`/`audit` fields are defaults/discovery
 *   only and never override a stricter per-capability declaration (§4.2).
 */

// Closed redaction classification, reused by capabilities, audit and results (§4.3).
export type RedactionClass = 'none' | 'low' | 'moderate' | 'high' | 'secret';

// Closed mutability classification (§4.3).
export type Mutability = 'read-only' | 'state-transition' | 'append' | 'patch' | 'delete';

// Idempotency requirement for a capability invocation (§4.3).
export type IdempotencyRequirement = {
  required: boolean; // when true, the caller MUST supply idempotencyKey
  scope?: 'principal' | 'tenant' | 'connector-instance';
};

// Per-capability human/PRINCIPAL/elicitation gates (§4.3).
export type CapabilityGates = {
  requiresElicitation: boolean; // a typed, validated elicitation step MUST complete first
  requiresHumanConfirmation: boolean;
  requiresPrincipalGate: boolean; // owner / PRINCIPAL decision required before invocation
  // Forward-compat (BR-42l, owner-ratified 2026-07-12): deny-as-missing via a tenant policy
  // resolver — an unauthorized tool is ABSENT from discovery, not errored. Optional/additive.
  requiresPolicy?: boolean;
};

// Auth freshness expectation for a capability or the manifest default (§4.3, §6.5).
export type AuthFreshnessPolicy = {
  maxAgeSeconds: number; // token auth_time MUST be within this window
  acr?: string[]; // required authentication context class(es)
  amr?: string[]; // required authentication method(s)
  stepUp: 'auth' | 'scope' | 'either'; // which step-up satisfies a staleness failure
};

export type CapabilityResource = {
  kind: 'resource';
  name: string;
  uriTemplate: string;
  description: string;
  requiredScopes: string[];
  requiredClaims: string[];
  outputSchema: unknown; // JSON Schema, closed at the adapter
  redactionClass: RedactionClass;
  mutability: 'read-only';
  mutatesExternalSystem: false; // closed read-only exception: never mutates external state
  idempotency: { required: false }; // idempotency-key requirement N/A for read-only — declared, never implicit
  freshness?: AuthFreshnessPolicy;
  gates: CapabilityGates;
};

export type CapabilityTool = {
  kind: 'tool';
  name: string;
  description: string;
  requiredScopes: string[];
  requiredClaims: string[];
  inputSchema: unknown; // JSON Schema, closed at the adapter
  outputSchema: unknown;
  redactionClass: RedactionClass;
  mutability: Mutability;
  // Forward-compat (BR-42l, owner-ratified 2026-07-12): coarse write-affordance category,
  // visible from the read stage so phase-2 write tools don't break the frozen contract (Wave).
  // Optional/additive; complements `mutability`/`mutatesExternalSystem`.
  category?: 'read' | 'write' | 'workflow' | 'transaction';
  mutatesExternalSystem: boolean; // generic write flag (replaces connector-specific flags)
  idempotency: IdempotencyRequirement;
  freshness?: AuthFreshnessPolicy;
  gates: CapabilityGates;
};

export type CapabilityPrompt = {
  kind: 'prompt';
  name: string;
  description: string;
  requiredScopes: string[];
  requiredClaims: string[];
  argumentSchema: unknown; // JSON Schema (input), closed at the adapter
  outputSchema: unknown; // JSON Schema (output), closed at the adapter
  redactionClass: RedactionClass;
  mutability: 'read-only';
  mutatesExternalSystem: false; // closed read-only exception: never mutates external state
  idempotency: { required: false }; // idempotency-key requirement N/A for read-only — declared, never implicit
  freshness?: AuthFreshnessPolicy;
  gates: CapabilityGates;
};

export type AppCapability = CapabilityResource | CapabilityTool | CapabilityPrompt;

// Secret a connector instance requires, declared per scope; always sensitive (§4.3).
export type ConnectorSecretRequirement = {
  name: string;
  // Mirrors SecretStatus.scope — 'operator' added for the bank-connector delta
  // (SPEC_EVOL_MCP_PLATFORM_ACTIVATION §4; union member only in 0.1.0).
  scope: 'operator' | 'principal' | 'tenant' | 'workspace' | 'connector-instance';
  sensitive: true; // always treated as secret; never model-visible
  rotation?: 'manual' | 'scheduled' | 'provider-driven';
  description?: string;
};

// Input the core hands to an adapter resolveTenant() (§4.3 / §4.4).
export type ConnectorTenantResolutionInput = {
  principalSub: string; // core-authoritative subject
  tenantRef: string; // core-authorized tenant
  workspaceRef?: string;
  connectorInstanceId: string;
  selectorHints?: Record<string, unknown>; // raw client/model-supplied ids, advisory only
};

// Authoritative scoping resolved for a single invocation. Produced by core; an
// adapter resolveTenant() MAY ONLY narrow within it, never broaden (§4.3 / §4.4).
export type ConnectorTenantContext = {
  principalRef: string; // core-authoritative principal
  tenantRef: string; // core-authorized tenant
  workspaceRef?: string;
  connectorInstanceId: string;
  domainScopeRef?: string; // adapter-internal scope (e.g. Wave businessId)
  defaults?: Record<string, unknown>;
};

// R1b (BR-42l): `ElicitationPolicyMode`, `ElicitationPolicy` and
// `elicitationPolicyIsSecretSafe` moved OUT of the frozen manifest to
// `./experimental/manifest-elicitation.ts` — they are provisional/architect-gated
// (F8) and must not sit on the frozen root surface.

/**
 * Applications/connectors expose capabilities through a manifest (§4.2).
 * Manifest-level `authz`/`audit`/`durability` fields are defaults/discovery only
 * and never override a stricter per-capability declaration (§4.3).
 */
export type AppMcpProviderManifest = {
  appId: string;
  providerId: string;
  version: string;
  displayName: string;
  resources: CapabilityResource[];
  tools: CapabilityTool[];
  prompts: CapabilityPrompt[];
  // R1 (BR-42l): `elicitation?` REMOVED from the frozen manifest — a read-only adapter
  // never declares elicitation policy, and ElicitationPolicy is provisional/architect-gated
  // (F8). Mutation-capable hosts re-add it via the experimental manifest extension
  // `AppMcpProviderManifestWithElicitation` (subpath `./experimental`).
  authz: {
    requiredClaims: string[];
    scopes: string[];
    tenantResolution: 'sentropic-account' | 'app-org' | 'connector-instance' | 'custom-resolver';
    freshness?: AuthFreshnessPolicy;
  };
  audit: {
    eventKinds: string[];
    piiClass?: 'none' | 'low' | 'moderate' | 'high';
    retentionClass?: string;
  };
  durability: {
    longRunningTools?: string[];
    workflowBackedTools?: string[];
  };
  secrets?: ConnectorSecretRequirement[];
};
