/**
 * MCP-L0 Provider Manifest, Capability Gates, Elicitation Confirm Policies,
 * and Sentropic Registry / Catalog Descriptors.
 *
 * Normative alignment with SPEC-memory-mcp-v3.1.md §M7 (lines 817–1089, 1625)
 * and Sentropic `@sentropic/mcp-platform` (`97fe9f53e8079694e35771227c11544ce8658316`):
 * - `AppMcpProviderManifestWithElicitation` (`appId: 'engram'`,
 *   `providerId: 'sentropic.engram.memory'`, `version: '1.0.0'`,
 *   `displayName: 'Engram Memory'`)
 * - `CapabilityTool` descriptors (`kind: 'tool'`, `requiredScopes: ['mcp:tools:invoke']`,
 *   `requiredClaims: ['sub', 'tid']`, `redactionClass: 'high'`, `mutability`,
 *   `category`, `mutatesExternalSystem`, `idempotency`, `gates`)
 * - `ElicitationPolicy` entries (`mode: 'confirm'`, `required: true`,
 *   `ttlSeconds: 300`, `carriesSecrets: false`, `bindToClient: true`, `bindToSub: true`)
 * - Sentropic `CapabilityEntry` catalog projection (`sourceId: 'mcp:engram-memory'`)
 */

import {
  ENGRAM_MEMORY_APP_ID,
  ENGRAM_MEMORY_CONNECTOR_ID,
  ENGRAM_MEMORY_MCP_CONTRACT_VERSION,
  ENGRAM_MEMORY_PROVIDER_ID,
  MEMORY_MCP_LIMITS,
  type EngramMemoryToolName,
} from './contracts.js';
import {
  ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
  ENGRAM_MEMORY_CAPTURE_OUTPUT_SCHEMA,
  ENGRAM_MEMORY_FORGET_INPUT_SCHEMA,
  ENGRAM_MEMORY_FORGET_OUTPUT_SCHEMA,
  ENGRAM_MEMORY_GET_INPUT_SCHEMA,
  ENGRAM_MEMORY_GET_OUTPUT_SCHEMA,
  ENGRAM_MEMORY_REQUEST_ADMISSION_INPUT_SCHEMA,
  ENGRAM_MEMORY_REQUEST_ADMISSION_OUTPUT_SCHEMA,
  ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA,
  ENGRAM_MEMORY_SEARCH_OUTPUT_SCHEMA,
  ENGRAM_MEMORY_WITHDRAW_INPUT_SCHEMA,
  ENGRAM_MEMORY_WITHDRAW_OUTPUT_SCHEMA,
} from './schemas.js';

/**
 * Provenance metadata for the vendored `@sentropic/mcp-platform` manifest and
 * elicitation declarations (`packages/mcp-platform/src/manifest.ts` and
 * `packages/mcp-platform/src/experimental/manifest-elicitation.ts`).
 */
export const SENTROPIC_MCP_PLATFORM_STANDARD_PROVENANCE = {
  repository: 'sentropic',
  commit: '97fe9f53e8079694e35771227c11544ce8658316',
  manifest_path: 'packages/mcp-platform/src/manifest.ts',
  elicitation_path:
    'packages/mcp-platform/src/experimental/manifest-elicitation.ts',
} as const;

import type { CapabilityTool, CapabilityGates, IdempotencyRequirement, Mutability } from './standard/manifest.js';
import type { ElicitationPolicy, AppMcpProviderManifestWithElicitation } from './standard/experimental/manifest-elicitation.js';
export type { RedactionClass, Mutability, CapabilityGates, IdempotencyRequirement, CapabilityResource, CapabilityTool, CapabilityPrompt, AppMcpProviderManifest } from './standard/manifest.js';
export type { ElicitationPolicyMode, ElicitationPolicy, AppMcpProviderManifestWithElicitation } from './standard/experimental/manifest-elicitation.js';
export type ToolMutability = Mutability;
export type ToolCategory = 'read' | 'write';
export type ToolIdempotencyDescriptor = IdempotencyRequirement;
export type AppMcpToolDescriptor = CapabilityTool & {
  name: EngramMemoryToolName;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
};

export function elicitationPolicyIsSecretSafe(
  policy: ElicitationPolicy,
): boolean {
  return (
    policy.carriesSecrets === false &&
    policy.bindToClient === true &&
    policy.bindToSub === true &&
    policy.ttlSeconds > 0 &&
    policy.ttlSeconds <= MEMORY_MCP_LIMITS.CONFIRMATION_MAX_TTL_SECONDS
  );
}

export const MemoryConfirmationRequestV1Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['capability', 'target_ref', 'operation_digest'],
  properties: {
    capability: {
      enum: ['engram_memory_withdraw', 'engram_memory_forget'],
    },
    target_ref: {
      type: 'string',
      minLength: MEMORY_MCP_LIMITS.OPAQUE_REF_MIN_UTF8_BYTES,
      maxLength: MEMORY_MCP_LIMITS.OPAQUE_REF_MAX_UTF8_BYTES,
    },
    operation_digest: {
      type: 'string',
      pattern: MEMORY_MCP_LIMITS.DIGEST_PATTERN,
    },
  },
} as const;

export const CONFIRM_ELICITATION_REQUEST_SCHEMA =
  MemoryConfirmationRequestV1Schema;

export const MemoryConfirmationResponseV1Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['approved'],
  properties: {
    approved: { type: 'boolean' },
  },
} as const;

export const CONFIRM_ELICITATION_RESPONSE_SCHEMA =
  MemoryConfirmationResponseV1Schema;

export const WITHDRAW_ELICITATION_POLICY: ElicitationPolicy = {
  capabilityRef: 'engram_memory_withdraw',
  mode: 'confirm',
  required: true,
  ttlSeconds: MEMORY_MCP_LIMITS.CONFIRMATION_MAX_TTL_SECONDS,
  requestSchema: MemoryConfirmationRequestV1Schema,
  responseSchema: MemoryConfirmationResponseV1Schema,
  carriesSecrets: false,
  bindToClient: true,
  bindToSub: true,
} as const satisfies ElicitationPolicy;

export const FORGET_ELICITATION_POLICY: ElicitationPolicy = {
  capabilityRef: 'engram_memory_forget',
  mode: 'confirm',
  required: true,
  ttlSeconds: MEMORY_MCP_LIMITS.CONFIRMATION_MAX_TTL_SECONDS,
  requestSchema: MemoryConfirmationRequestV1Schema,
  responseSchema: MemoryConfirmationResponseV1Schema,
  carriesSecrets: false,
  bindToClient: true,
  bindToSub: true,
} as const satisfies ElicitationPolicy;

export const ENGRAM_MEMORY_ELICITATION_POLICIES: ElicitationPolicy[] =
  [WITHDRAW_ELICITATION_POLICY, FORGET_ELICITATION_POLICY];

export const ENGRAM_MEMORY_CAPABILITY_GATES: Readonly<
  Record<EngramMemoryToolName, CapabilityGates>
> = {
  engram_memory_search: {
    requiresElicitation: false,
    requiresHumanConfirmation: false,
    requiresPrincipalGate: false,
    requiresPolicy: true,
  },
  engram_memory_get: {
    requiresElicitation: false,
    requiresHumanConfirmation: false,
    requiresPrincipalGate: false,
    requiresPolicy: true,
  },
  engram_memory_capture: {
    requiresElicitation: false,
    requiresHumanConfirmation: false,
    requiresPrincipalGate: false,
    requiresPolicy: true,
  },
  engram_memory_request_admission: {
    requiresElicitation: false,
    requiresHumanConfirmation: false,
    requiresPrincipalGate: false,
    requiresPolicy: true,
  },
  engram_memory_withdraw: {
    requiresElicitation: false,
    requiresHumanConfirmation: true,
    requiresPrincipalGate: false,
    requiresPolicy: true,
  },
  engram_memory_forget: {
    requiresElicitation: false,
    requiresHumanConfirmation: true,
    requiresPrincipalGate: false,
    requiresPolicy: true,
  },
} as const;

export const searchTool = {
  kind: 'tool',
  name: 'engram_memory_search' as const,
  description:
    'Search authorized current memory with citations and ranking receipts.',
  requiredScopes: ['mcp:tools:invoke'],
  requiredClaims: ['sub', 'tid'],
  inputSchema: ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA,
  outputSchema: ENGRAM_MEMORY_SEARCH_OUTPUT_SCHEMA,
  redactionClass: 'high',
  mutability: 'read-only',
  category: 'read',
  mutatesExternalSystem: false,
  idempotency: { required: false },
  gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_search,
} satisfies CapabilityTool;

export const getTool = {
  kind: 'tool',
  name: 'engram_memory_get' as const,
  description:
    'Read one authorized currently eligible canonical memory record.',
  requiredScopes: ['mcp:tools:invoke'],
  requiredClaims: ['sub', 'tid'],
  inputSchema: ENGRAM_MEMORY_GET_INPUT_SCHEMA,
  outputSchema: ENGRAM_MEMORY_GET_OUTPUT_SCHEMA,
  redactionClass: 'high',
  mutability: 'read-only',
  category: 'read',
  mutatesExternalSystem: false,
  idempotency: { required: false },
  gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_get,
} satisfies CapabilityTool;

export const captureTool = {
  kind: 'tool',
  name: 'engram_memory_capture' as const,
  description:
    'Durably submit cited material as an encrypted pending candidate.',
  requiredScopes: ['mcp:tools:invoke'],
  requiredClaims: ['sub', 'tid'],
  inputSchema: ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
  outputSchema: ENGRAM_MEMORY_CAPTURE_OUTPUT_SCHEMA,
  redactionClass: 'high',
  mutability: 'append',
  category: 'write',
  mutatesExternalSystem: true,
  idempotency: { required: true, scope: 'principal' },
  gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_capture,
} satisfies CapabilityTool;

export const requestAdmissionTool = {
  kind: 'tool',
  name: 'engram_memory_request_admission' as const,
  description:
    'Request the configured admission policy decision for a pending candidate.',
  requiredScopes: ['mcp:tools:invoke'],
  requiredClaims: ['sub', 'tid'],
  inputSchema: ENGRAM_MEMORY_REQUEST_ADMISSION_INPUT_SCHEMA,
  outputSchema: ENGRAM_MEMORY_REQUEST_ADMISSION_OUTPUT_SCHEMA,
  redactionClass: 'high',
  mutability: 'state-transition',
  category: 'write',
  mutatesExternalSystem: true,
  idempotency: { required: true, scope: 'principal' },
  gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_request_admission,
} satisfies CapabilityTool;

export const withdrawTool = {
  kind: 'tool',
  name: 'engram_memory_withdraw' as const,
  description: 'Withdraw an authorized pending candidate with confirmed key-destruction status.',
  requiredScopes: ['mcp:tools:invoke'],
  requiredClaims: ['sub', 'tid'],
  inputSchema: ENGRAM_MEMORY_WITHDRAW_INPUT_SCHEMA,
  outputSchema: ENGRAM_MEMORY_WITHDRAW_OUTPUT_SCHEMA,
  redactionClass: 'high',
  mutability: 'state-transition',
  category: 'write',
  mutatesExternalSystem: true,
  idempotency: { required: true, scope: 'principal' },
  gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_withdraw,
} satisfies CapabilityTool;

export const forgetTool = {
  kind: 'tool',
  name: 'engram_memory_forget' as const,
  description:
    'Forget an authorized admitted memory with accurate cleanup status.',
  requiredScopes: ['mcp:tools:invoke'],
  requiredClaims: ['sub', 'tid'],
  inputSchema: ENGRAM_MEMORY_FORGET_INPUT_SCHEMA,
  outputSchema: ENGRAM_MEMORY_FORGET_OUTPUT_SCHEMA,
  redactionClass: 'high',
  mutability: 'state-transition',
  category: 'write',
  mutatesExternalSystem: true,
  idempotency: { required: true, scope: 'principal' },
  gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_forget,
} satisfies CapabilityTool;

export const ENGRAM_MEMORY_TOOL_DESCRIPTORS: AppMcpToolDescriptor[] = [
  searchTool,
  getTool,
  captureTool,
  requestAdmissionTool,
  withdrawTool,
  forgetTool,
];

export const ENGRAM_MEMORY_PROVIDER_MANIFEST = {
  appId: ENGRAM_MEMORY_APP_ID,
  providerId: ENGRAM_MEMORY_PROVIDER_ID,
  version: ENGRAM_MEMORY_MCP_CONTRACT_VERSION,
  displayName: 'Engram Memory',
  resources: [],
  tools: ENGRAM_MEMORY_TOOL_DESCRIPTORS,
  prompts: [],
  authz: {
    requiredClaims: ['sub', 'tid'],
    scopes: ['mcp:discover', 'mcp:tools:invoke'],
    tenantResolution: 'custom-resolver',
  },
  audit: {
    eventKinds: ['invoke'],
    piiClass: 'high',
  },
  durability: {},
  secrets: [],
  elicitation: ENGRAM_MEMORY_ELICITATION_POLICIES,
} satisfies AppMcpProviderManifestWithElicitation;

export interface HostConnectorRegistrationV1 {
  readonly connectorId: typeof ENGRAM_MEMORY_CONNECTOR_ID;
  readonly appId: typeof ENGRAM_MEMORY_APP_ID;
  readonly providerId: typeof ENGRAM_MEMORY_PROVIDER_ID;
  readonly elicitation: readonly ElicitationPolicy[];
  readonly elicitationPolicies: Readonly<
    Record<'engram_memory_withdraw' | 'engram_memory_forget', ElicitationPolicy>
  >;
}

export const ENGRAM_MEMORY_CONNECTOR_REGISTRATION: HostConnectorRegistrationV1 =
  {
    connectorId: ENGRAM_MEMORY_CONNECTOR_ID,
    appId: ENGRAM_MEMORY_APP_ID,
    providerId: ENGRAM_MEMORY_PROVIDER_ID,
    elicitation: ENGRAM_MEMORY_ELICITATION_POLICIES,
    elicitationPolicies: {
      engram_memory_withdraw: WITHDRAW_ELICITATION_POLICY,
      engram_memory_forget: FORGET_ELICITATION_POLICY,
    },
  } as const;

/**
 * M7 Sentropic `CapabilityEntry` catalog projection for each of the six tools
 * (SPEC-memory-mcp-v3.1.md lines 1064–1089).
 */
export interface SentropicMemoryCatalogEntryV1 {
  readonly kind: 'tool';
  readonly sourceId: 'mcp:engram-memory';
  readonly metadata: {
    readonly name: EngramMemoryToolName;
    readonly description: string;
    readonly version: '1.0.0';
    readonly category: 'mcp';
    readonly authzRequirements: {
      readonly permissions: readonly [EngramMemoryToolName];
    };
  };
  readonly rawName: EngramMemoryToolName;
  readonly tool: {
    readonly name: EngramMemoryToolName;
    readonly description: string;
    readonly inputSchema: Record<string, unknown>;
    readonly outputSchema: Record<string, unknown>;
    readonly sideEffect: boolean;
    readonly requiresApproval: boolean;
  };
  readonly gates: CapabilityGates;
}

export function buildSentropicMemoryCatalogEntry(
  descriptor: AppMcpToolDescriptor,
): SentropicMemoryCatalogEntryV1 {
  return {
    kind: 'tool',
    sourceId: 'mcp:engram-memory',
    metadata: {
      name: descriptor.name,
      description: descriptor.description,
      version: '1.0.0',
      category: 'mcp',
      authzRequirements: {
        permissions: [descriptor.name],
      },
    },
    rawName: descriptor.name,
    tool: {
      name: descriptor.name,
      description: descriptor.description,
      inputSchema: descriptor.inputSchema,
      outputSchema: descriptor.outputSchema,
      sideEffect: descriptor.mutatesExternalSystem,
      requiresApproval: descriptor.gates.requiresHumanConfirmation === true,
    },
    gates: descriptor.gates,
  };
}

export const SENTROPIC_MEMORY_CATALOG_ENTRIES: readonly SentropicMemoryCatalogEntryV1[] =
  ENGRAM_MEMORY_TOOL_DESCRIPTORS.map(buildSentropicMemoryCatalogEntry);

export interface GateEvaluationContextV1 {
  readonly hasPolicyGate?: boolean;
  readonly hasHumanConfirmation?: boolean;
  readonly hasElicitationGate?: boolean;
  readonly hasPrincipalGate?: boolean;
  readonly withinRateLimit?: boolean;
}

export type GateEvaluationResultV1 =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly failed_gate: keyof CapabilityGates | 'rateLimit';
      readonly error_code: 'gate_failed' | 'RATE_LIMITED';
    };

/**
 * Evaluates the exact M7 `CapabilityGates` booleans for a tool invocation
 * using M4 closed-world literal-`true` (`=== true`) semantics.
 */
export function evaluateToolGateRequirements(
  toolName: EngramMemoryToolName,
  ctx: GateEvaluationContextV1,
): GateEvaluationResultV1 {
  const gates = ENGRAM_MEMORY_CAPABILITY_GATES[toolName];
  const rawCtx = ctx as Record<string, unknown>;

  if (
    rawCtx.withinRateLimit !== undefined &&
    rawCtx.withinRateLimit !== true
  ) {
    return {
      allowed: false,
      failed_gate: 'rateLimit',
      error_code: 'RATE_LIMITED',
    };
  }

  if (gates.requiresPolicy && rawCtx.hasPolicyGate !== true) {
    return {
      allowed: false,
      failed_gate: 'requiresPolicy',
      error_code: 'gate_failed',
    };
  }

  if (
    gates.requiresHumanConfirmation &&
    rawCtx.hasHumanConfirmation !== true
  ) {
    return {
      allowed: false,
      failed_gate: 'requiresHumanConfirmation',
      error_code: 'gate_failed',
    };
  }

  if (gates.requiresElicitation && rawCtx.hasElicitationGate !== true) {
    return {
      allowed: false,
      failed_gate: 'requiresElicitation',
      error_code: 'gate_failed',
    };
  }

  if (gates.requiresPrincipalGate && rawCtx.hasPrincipalGate !== true) {
    return {
      allowed: false,
      failed_gate: 'requiresPrincipalGate',
      error_code: 'gate_failed',
    };
  }

  return { allowed: true };
}
