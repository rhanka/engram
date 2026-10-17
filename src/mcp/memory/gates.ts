/**
 * MCP-L0 Provider Manifest, Capability Gates, Elicitation Confirm Policies,
 * and Sentropic Registry / Catalog Descriptors.
 *
 * Normative alignment with SPEC-memory-mcp-v2.md §M7:
 * - `AppMcpProviderManifest` (`appId: 'engram'`, `providerId: 'engram-memory'`,
 *   `version: '1.0.0'`, `displayName: 'Engram Memory'`)
 * - `AppMcpToolDescriptor` (`read-only` / `append` / `state-transition`,
 *   `read` / `write`, `externalMutation`, `idempotency`)
 * - `CapabilityGates` (`requiresElicitation`, `requiresHumanConfirmation`,
 *   `requiresPrincipalGate`, `requiresPolicy`)
 * - Sentropic `CapabilityEntry` catalog projection (`sourceId: 'mcp:engram-memory'`)
 * - Host connector registration (`connectorId: 'engram-memory'`) with `confirm`
 *   elicitation policies for `engram_memory_withdraw` and `engram_memory_forget`.
 */

import {
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

export type ToolMutability = 'read-only' | 'append' | 'state-transition';
export type ToolCategory = 'read' | 'write';

export type ToolIdempotencyDescriptor =
  | { readonly required: false }
  | { readonly required: true; readonly scope: 'principal' };

export interface CapabilityGates {
  readonly requiresElicitation: false;
  readonly requiresHumanConfirmation: boolean;
  readonly requiresPrincipalGate: false;
  readonly requiresPolicy: true;
}

export const CONFIRM_ELICITATION_REQUEST_SCHEMA = {
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

export const CONFIRM_ELICITATION_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['approved'],
  properties: {
    approved: { type: 'boolean' },
  },
} as const;

export interface ElicitationConfirmPolicyV1 {
  readonly kind: 'confirm';
  readonly required: boolean;
  readonly maxTtlSeconds: 300;
  readonly boundToMcpClient: true;
  readonly boundToPrincipal: true;
  readonly noSecretBearingFields: true;
  readonly requestSchema: typeof CONFIRM_ELICITATION_REQUEST_SCHEMA;
  readonly responseSchema: typeof CONFIRM_ELICITATION_RESPONSE_SCHEMA;
  readonly failureCode: 'gate_failed';
}

export const DESTRUCTIVE_ELICITATION_CONFIRM_POLICY: ElicitationConfirmPolicyV1 =
  {
    kind: 'confirm',
    required: true,
    maxTtlSeconds: MEMORY_MCP_LIMITS.CONFIRMATION_MAX_TTL_SECONDS,
    boundToMcpClient: true,
    boundToPrincipal: true,
    noSecretBearingFields: true,
    requestSchema: CONFIRM_ELICITATION_REQUEST_SCHEMA,
    responseSchema: CONFIRM_ELICITATION_RESPONSE_SCHEMA,
    failureCode: 'gate_failed',
  } as const;

export interface AppMcpToolDescriptor {
  readonly name: EngramMemoryToolName;
  readonly description: string;
  readonly mutability: ToolMutability;
  readonly category: ToolCategory;
  readonly externalMutation: boolean;
  readonly idempotency: ToolIdempotencyDescriptor;
  readonly gates: CapabilityGates;
  readonly elicitationPolicy?: ElicitationConfirmPolicyV1;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
}

export interface AppMcpProviderManifest {
  readonly appId: 'engram';
  readonly providerId: 'engram-memory';
  readonly version: '1.0.0';
  readonly displayName: 'Engram Memory';
  readonly resources: readonly [];
  readonly tools: readonly AppMcpToolDescriptor[];
  readonly prompts: readonly [];
  readonly authz: {
    readonly requiredClaims: readonly ['sub', 'tid'];
    readonly scopes: readonly ['mcp:discover', 'mcp:tools:invoke'];
    readonly tenantResolution: 'custom-resolver';
  };
  readonly audit: {
    readonly eventKinds: readonly ['invoke'];
    readonly piiClass: 'high';
  };
  readonly durability: Readonly<Record<string, never>>;
  readonly secrets: readonly [];
}

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

export const ENGRAM_MEMORY_TOOL_DESCRIPTORS: readonly AppMcpToolDescriptor[] = [
  {
    name: 'engram_memory_search',
    description:
      'Bounded relevance recall over admitted current memory records (accepted_current only) in the caller resolved scope.',
    mutability: 'read-only',
    category: 'read',
    externalMutation: false,
    idempotency: { required: false },
    gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_search,
    inputSchema: ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_SEARCH_OUTPUT_SCHEMA,
  },
  {
    name: 'engram_memory_get',
    description:
      'Bounded point-read of a single admitted current memory record (accepted_current only) by record_id in the caller resolved scope.',
    mutability: 'read-only',
    category: 'read',
    externalMutation: false,
    idempotency: { required: false },
    gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_get,
    inputSchema: ENGRAM_MEMORY_GET_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_GET_OUTPUT_SCHEMA,
  },
  {
    name: 'engram_memory_capture',
    description:
      'Idempotent capture of a pending candidate memory record with verified evidence under host retention and reconciliation policy.',
    mutability: 'append',
    category: 'write',
    externalMutation: true,
    idempotency: { required: true, scope: 'principal' },
    gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_capture,
    inputSchema: ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_CAPTURE_OUTPUT_SCHEMA,
  },
  {
    name: 'engram_memory_request_admission',
    description:
      'Idempotent request for host policy and evidence evaluation to adjudicate a pending candidate memory record.',
    mutability: 'state-transition',
    category: 'write',
    externalMutation: true,
    idempotency: { required: true, scope: 'principal' },
    gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_request_admission,
    inputSchema: ENGRAM_MEMORY_REQUEST_ADMISSION_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_REQUEST_ADMISSION_OUTPUT_SCHEMA,
  },
  {
    name: 'engram_memory_withdraw',
    description:
      'Confirmed withdrawal of a pending candidate memory record (pending -> withdrawn) under host elicitation confirmation.',
    mutability: 'state-transition',
    category: 'write',
    externalMutation: true,
    idempotency: { required: true, scope: 'principal' },
    gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_withdraw,
    elicitationPolicy: DESTRUCTIVE_ELICITATION_CONFIRM_POLICY,
    inputSchema: ENGRAM_MEMORY_WITHDRAW_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_WITHDRAW_OUTPUT_SCHEMA,
  },
  {
    name: 'engram_memory_forget',
    description:
      'Confirmed irreversible tombstone of an admitted or post-admission memory record under host elicitation confirmation.',
    mutability: 'state-transition',
    category: 'write',
    externalMutation: true,
    idempotency: { required: true, scope: 'principal' },
    gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_forget,
    elicitationPolicy: DESTRUCTIVE_ELICITATION_CONFIRM_POLICY,
    inputSchema: ENGRAM_MEMORY_FORGET_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_FORGET_OUTPUT_SCHEMA,
  },
] as const;

export const ENGRAM_MEMORY_PROVIDER_MANIFEST: AppMcpProviderManifest = {
  appId: 'engram',
  providerId: 'engram-memory',
  version: '1.0.0',
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
} as const;

export interface HostConnectorRegistrationV1 {
  readonly connectorId: 'engram-memory';
  readonly appId: 'engram';
  readonly providerId: 'engram-memory';
  readonly elicitationPolicies: Readonly<
    Record<
      'engram_memory_withdraw' | 'engram_memory_forget',
      ElicitationConfirmPolicyV1
    >
  >;
}

export const ENGRAM_MEMORY_CONNECTOR_REGISTRATION: HostConnectorRegistrationV1 =
  {
    connectorId: 'engram-memory',
    appId: 'engram',
    providerId: 'engram-memory',
    elicitationPolicies: {
      engram_memory_withdraw: DESTRUCTIVE_ELICITATION_CONFIRM_POLICY,
      engram_memory_forget: DESTRUCTIVE_ELICITATION_CONFIRM_POLICY,
    },
  } as const;

/**
 * M7 Sentropic `CapabilityEntry` catalog projection for each of the six tools.
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
      sideEffect: descriptor.externalMutation,
      requiresApproval:
        descriptor.name === 'engram_memory_withdraw' ||
        descriptor.name === 'engram_memory_forget',
    },
    gates: descriptor.gates,
  };
}

export const SENTROPIC_MEMORY_CATALOG_ENTRIES: readonly SentropicMemoryCatalogEntryV1[] =
  ENGRAM_MEMORY_TOOL_DESCRIPTORS.map(buildSentropicMemoryCatalogEntry);

export interface GateEvaluationContextV1 {
  readonly hasPolicyGate: boolean;
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
 * Evaluates the exact M7 `CapabilityGates` booleans for a tool invocation.
 */
export function evaluateToolGateRequirements(
  toolName: EngramMemoryToolName,
  ctx: GateEvaluationContextV1,
): GateEvaluationResultV1 {
  const gates = ENGRAM_MEMORY_CAPABILITY_GATES[toolName];

  if (ctx.withinRateLimit === false) {
    return {
      allowed: false,
      failed_gate: 'rateLimit',
      error_code: 'RATE_LIMITED',
    };
  }

  if (gates.requiresPolicy && !ctx.hasPolicyGate) {
    return {
      allowed: false,
      failed_gate: 'requiresPolicy',
      error_code: 'gate_failed',
    };
  }

  if (gates.requiresHumanConfirmation && !ctx.hasHumanConfirmation) {
    return {
      allowed: false,
      failed_gate: 'requiresHumanConfirmation',
      error_code: 'gate_failed',
    };
  }

  if (gates.requiresElicitation && !ctx.hasElicitationGate) {
    return {
      allowed: false,
      failed_gate: 'requiresElicitation',
      error_code: 'gate_failed',
    };
  }

  if (gates.requiresPrincipalGate && !ctx.hasPrincipalGate) {
    return {
      allowed: false,
      failed_gate: 'requiresPrincipalGate',
      error_code: 'gate_failed',
    };
  }

  return { allowed: true };
}
