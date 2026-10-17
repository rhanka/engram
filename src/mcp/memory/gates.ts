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

export type RedactionClass = 'none' | 'low' | 'medium' | 'high';
export type Mutability = 'read-only' | 'append' | 'state-transition';
export type ToolMutability = Mutability;
export type ToolCategory = 'read' | 'write' | 'admin';

export interface CapabilityGates {
  readonly requiresElicitation: boolean;
  readonly requiresHumanConfirmation: boolean;
  readonly requiresPrincipalGate: boolean;
  readonly requiresPolicy: boolean;
}

export interface IdempotencyRequirement {
  readonly required: boolean;
  readonly scope?: 'session' | 'principal' | 'global';
}

export type ToolIdempotencyDescriptor = IdempotencyRequirement;

export interface CapabilityResource {
  readonly kind: 'resource';
  readonly uriTemplate: string;
  readonly name: string;
  readonly description: string;
  readonly mimeType: string;
  readonly requiredScopes: readonly string[];
  readonly requiredClaims: readonly string[];
  readonly redactionClass: RedactionClass;
  readonly maxBytes: number;
  readonly cacheTtlSeconds: number;
}

export interface CapabilityTool {
  readonly kind: 'tool';
  readonly name: string;
  readonly description: string;
  readonly requiredScopes: readonly string[];
  readonly requiredClaims: readonly string[];
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
  readonly redactionClass: RedactionClass;
  readonly mutability: Mutability;
  readonly category: 'read' | 'write' | 'admin';
  readonly mutatesExternalSystem: boolean;
  readonly idempotency: IdempotencyRequirement;
  readonly gates: CapabilityGates;
}

export type AppMcpToolDescriptor = CapabilityTool & {
  readonly name: EngramMemoryToolName;
  readonly outputSchema: Record<string, unknown>;
};

export interface CapabilityPrompt {
  readonly kind: 'prompt';
  readonly name: string;
  readonly description: string;
  readonly requiredScopes: readonly string[];
  readonly requiredClaims: readonly string[];
  readonly arguments: readonly {
    readonly name: string;
    readonly description: string;
    readonly required: boolean;
  }[];
  readonly redactionClass: RedactionClass;
}

export interface AppMcpProviderManifest {
  readonly appId: string;
  readonly providerId: string;
  readonly version: string;
  readonly displayName: string;
  readonly resources: readonly CapabilityResource[];
  readonly tools: readonly CapabilityTool[];
  readonly prompts: readonly CapabilityPrompt[];
  readonly authz: {
    readonly requiredClaims: readonly string[];
    readonly scopes: readonly string[];
    readonly tenantResolution: 'tid-claim' | 'header' | 'custom-resolver';
  };
  readonly audit: {
    readonly eventKinds: readonly ('discover' | 'read' | 'invoke' | 'prompt')[];
    readonly piiClass: RedactionClass;
  };
  readonly durability: {
    readonly queueTopic?: string;
    readonly dlqTopic?: string;
  };
  readonly secrets: readonly string[];
}

export type ElicitationPolicyMode = 'confirm' | 'select' | 'form';

export interface ElicitationPolicy {
  readonly toolName: string;
  readonly mode: ElicitationPolicyMode;
  readonly required: boolean;
  readonly ttlSeconds: number;
  readonly requestSchema: Record<string, unknown>;
  readonly responseSchema: Record<string, unknown>;
  readonly carriesSecrets: false;
  readonly bindToClient: true;
  readonly bindToSub: true;
}

export interface AppMcpProviderManifestWithElicitation
  extends AppMcpProviderManifest {
  readonly elicitation?: readonly ElicitationPolicy[];
}

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
  toolName: 'engram_memory_withdraw',
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
  toolName: 'engram_memory_forget',
  mode: 'confirm',
  required: true,
  ttlSeconds: MEMORY_MCP_LIMITS.CONFIRMATION_MAX_TTL_SECONDS,
  requestSchema: MemoryConfirmationRequestV1Schema,
  responseSchema: MemoryConfirmationResponseV1Schema,
  carriesSecrets: false,
  bindToClient: true,
  bindToSub: true,
} as const satisfies ElicitationPolicy;

export const ENGRAM_MEMORY_ELICITATION_POLICIES: readonly ElicitationPolicy[] =
  [WITHDRAW_ELICITATION_POLICY, FORGET_ELICITATION_POLICY] as const;

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
  name: 'engram_memory_search',
  description:
    'Search admitted current memory records within the caller scope.',
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
} as const satisfies CapabilityTool;

export const getTool = {
  kind: 'tool',
  name: 'engram_memory_get',
  description:
    'Read one admitted current memory record by ID within the caller scope.',
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
} as const satisfies CapabilityTool;

export const captureTool = {
  kind: 'tool',
  name: 'engram_memory_capture',
  description:
    'Record a pending memory candidate with citations and evidence.',
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
} as const satisfies CapabilityTool;

export const requestAdmissionTool = {
  kind: 'tool',
  name: 'engram_memory_request_admission',
  description:
    'Evaluate a pending memory candidate for admission under host policy.',
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
} as const satisfies CapabilityTool;

export const withdrawTool = {
  kind: 'tool',
  name: 'engram_memory_withdraw',
  description: 'Withdraw a pending memory candidate before admission.',
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
} as const satisfies CapabilityTool;

export const forgetTool = {
  kind: 'tool',
  name: 'engram_memory_forget',
  description:
    'Tombstone an admitted or historical memory record and trigger projection cleanup.',
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
} as const satisfies CapabilityTool;

export const ENGRAM_MEMORY_TOOL_DESCRIPTORS: readonly AppMcpToolDescriptor[] = [
  searchTool,
  getTool,
  captureTool,
  requestAdmissionTool,
  withdrawTool,
  forgetTool,
] as const;

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
} as const satisfies AppMcpProviderManifestWithElicitation;

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
