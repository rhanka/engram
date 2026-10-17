/**
 * MCP-L0 Provider Manifest, Capability Gates, Confirmation Policy, and
 * Sentropic Registry / Catalog Descriptors.
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

export type ToolMutability = 'read' | 'write';
export type ToolCategory = 'query' | 'mutation' | 'destructive';

export interface CapabilityGates {
  readonly requiresScope: boolean;
  readonly requiresPrincipal: boolean;
  readonly requiresCapabilityToken: boolean;
  readonly requiresPolicyVerdict: boolean;
  readonly requiresEvidence: boolean;
  readonly requiresUserConfirmation: boolean;
  readonly enforcesQuota: boolean;
  readonly rateLimited: boolean;
}

export interface ToolConfirmationPolicyV1 {
  readonly required: boolean;
  readonly mechanism: 'none' | 'mcp-elicitation-or-host-token';
  readonly allow_input_boolean_bypass: false;
  readonly token_ttl_seconds: number;
  readonly bound_fields: readonly (
    | 'memory_id'
    | 'reason_code'
    | 'content_digest_or_status'
    | 'principal_id'
    | 'scope_ref'
  )[];
  readonly refusal_code_when_unconfirmed: 'gate_failed';
}

export interface AppMcpToolDescriptor {
  readonly name: EngramMemoryToolName;
  readonly description: string;
  readonly mutability: ToolMutability;
  readonly category: ToolCategory;
  readonly externalMutation: false;
  readonly idempotent: true;
  readonly gates: CapabilityGates;
  readonly confirmation: ToolConfirmationPolicyV1;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
}

export interface AppMcpProviderManifest {
  readonly appId: 'engram-memory';
  readonly appVersion: string;
  readonly contractVersion: '1.0.0';
  readonly transport: 'stdio' | 'in-process';
  readonly defaultEnabled: false;
  readonly tools: readonly AppMcpToolDescriptor[];
}

export const NO_CONFIRMATION_POLICY: ToolConfirmationPolicyV1 = {
  required: false,
  mechanism: 'none',
  allow_input_boolean_bypass: false,
  token_ttl_seconds: 0,
  bound_fields: [],
  refusal_code_when_unconfirmed: 'gate_failed',
} as const;

export const DESTRUCTIVE_CONFIRMATION_POLICY: ToolConfirmationPolicyV1 = {
  required: true,
  mechanism: 'mcp-elicitation-or-host-token',
  allow_input_boolean_bypass: false,
  token_ttl_seconds: MEMORY_MCP_LIMITS.CONFIRMATION_TOKEN_TTL_SECONDS,
  bound_fields: [
    'memory_id',
    'reason_code',
    'content_digest_or_status',
    'principal_id',
    'scope_ref',
  ],
  refusal_code_when_unconfirmed: 'gate_failed',
} as const;

export const ENGRAM_MEMORY_CAPABILITY_GATES: Readonly<
  Record<EngramMemoryToolName, CapabilityGates>
> = {
  engram_memory_search: {
    requiresScope: true,
    requiresPrincipal: true,
    requiresCapabilityToken: true,
    requiresPolicyVerdict: false,
    requiresEvidence: false,
    requiresUserConfirmation: false,
    enforcesQuota: false,
    rateLimited: true,
  },
  engram_memory_get: {
    requiresScope: true,
    requiresPrincipal: true,
    requiresCapabilityToken: true,
    requiresPolicyVerdict: false,
    requiresEvidence: false,
    requiresUserConfirmation: false,
    enforcesQuota: false,
    rateLimited: true,
  },
  engram_memory_capture: {
    requiresScope: true,
    requiresPrincipal: true,
    requiresCapabilityToken: true,
    requiresPolicyVerdict: true,
    requiresEvidence: true,
    requiresUserConfirmation: false,
    enforcesQuota: true,
    rateLimited: true,
  },
  engram_memory_request_admission: {
    requiresScope: true,
    requiresPrincipal: true,
    requiresCapabilityToken: true,
    requiresPolicyVerdict: true,
    requiresEvidence: true,
    requiresUserConfirmation: false,
    enforcesQuota: true,
    rateLimited: true,
  },
  engram_memory_withdraw: {
    requiresScope: true,
    requiresPrincipal: true,
    requiresCapabilityToken: true,
    requiresPolicyVerdict: true,
    requiresEvidence: false,
    requiresUserConfirmation: true,
    enforcesQuota: false,
    rateLimited: true,
  },
  engram_memory_forget: {
    requiresScope: true,
    requiresPrincipal: true,
    requiresCapabilityToken: true,
    requiresPolicyVerdict: true,
    requiresEvidence: false,
    requiresUserConfirmation: true,
    enforcesQuota: false,
    rateLimited: true,
  },
} as const;

export const ENGRAM_MEMORY_TOOL_DESCRIPTORS: readonly AppMcpToolDescriptor[] = [
  {
    name: 'engram_memory_search',
    description:
      'Bounded relevance recall over admitted (and optionally disputed) memory records in the caller trusted scope.',
    mutability: 'read',
    category: 'query',
    externalMutation: false,
    idempotent: true,
    gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_search,
    confirmation: NO_CONFIRMATION_POLICY,
    inputSchema: ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_SEARCH_OUTPUT_SCHEMA,
  },
  {
    name: 'engram_memory_get',
    description:
      'Bounded point-read of 1..10 memory records by ID within the caller trusted scope.',
    mutability: 'read',
    category: 'query',
    externalMutation: false,
    idempotent: true,
    gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_get,
    confirmation: NO_CONFIRMATION_POLICY,
    inputSchema: ENGRAM_MEMORY_GET_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_GET_OUTPUT_SCHEMA,
  },
  {
    name: 'engram_memory_capture',
    description:
      'Idempotent capture of a candidate or quarantined memory record with verified citations under host retention and reconciliation policy.',
    mutability: 'write',
    category: 'mutation',
    externalMutation: false,
    idempotent: true,
    gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_capture,
    confirmation: NO_CONFIRMATION_POLICY,
    inputSchema: ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_CAPTURE_OUTPUT_SCHEMA,
  },
  {
    name: 'engram_memory_request_admission',
    description:
      'Idempotent request for host policy evaluation to transition a candidate or quarantined memory record to admitted.',
    mutability: 'write',
    category: 'mutation',
    externalMutation: false,
    idempotent: true,
    gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_request_admission,
    confirmation: NO_CONFIRMATION_POLICY,
    inputSchema: ENGRAM_MEMORY_REQUEST_ADMISSION_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_REQUEST_ADMISSION_OUTPUT_SCHEMA,
  },
  {
    name: 'engram_memory_withdraw',
    description:
      'Confirmed withdrawal of a non-terminal memory record from active retrieval while preserving its audit trail.',
    mutability: 'write',
    category: 'destructive',
    externalMutation: false,
    idempotent: true,
    gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_withdraw,
    confirmation: DESTRUCTIVE_CONFIRMATION_POLICY,
    inputSchema: ENGRAM_MEMORY_WITHDRAW_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_WITHDRAW_OUTPUT_SCHEMA,
  },
  {
    name: 'engram_memory_forget',
    description:
      'Confirmed irreversible cryptographic/payload erasure of a memory record and its derived recall artifacts, leaving a tombstone.',
    mutability: 'write',
    category: 'destructive',
    externalMutation: false,
    idempotent: true,
    gates: ENGRAM_MEMORY_CAPABILITY_GATES.engram_memory_forget,
    confirmation: DESTRUCTIVE_CONFIRMATION_POLICY,
    inputSchema: ENGRAM_MEMORY_FORGET_INPUT_SCHEMA,
    outputSchema: ENGRAM_MEMORY_FORGET_OUTPUT_SCHEMA,
  },
] as const;

export const ENGRAM_MEMORY_PROVIDER_MANIFEST: AppMcpProviderManifest = {
  appId: 'engram-memory',
  appVersion: '0.20.0',
  contractVersion: '1.0.0',
  transport: 'in-process',
  defaultEnabled: false,
  tools: ENGRAM_MEMORY_TOOL_DESCRIPTORS,
} as const;

export interface SentropicMemoryCatalogEntryV1 {
  readonly toolName: EngramMemoryToolName;
  readonly providerAppId: 'engram-memory';
  readonly clusterMeshModule: '/memory';
  readonly voluntaryInheritanceOnly: true;
  readonly defaultEnabled: false;
  readonly mutability: ToolMutability;
  readonly category: ToolCategory;
  readonly externalMutation: false;
  readonly idempotent: true;
  readonly gates: CapabilityGates;
}

export const SENTROPIC_MEMORY_CATALOG_ENTRIES: readonly SentropicMemoryCatalogEntryV1[] =
  ENGRAM_MEMORY_TOOL_DESCRIPTORS.map((descriptor) => ({
    toolName: descriptor.name,
    providerAppId: 'engram-memory',
    clusterMeshModule: '/memory',
    voluntaryInheritanceOnly: true,
    defaultEnabled: false,
    mutability: descriptor.mutability,
    category: descriptor.category,
    externalMutation: descriptor.externalMutation,
    idempotent: descriptor.idempotent,
    gates: descriptor.gates,
  }));

export interface GateEvaluationContextV1 {
  readonly hasTrustedScope: boolean;
  readonly hasTrustedPrincipal: boolean;
  readonly hasCapabilityToken: boolean;
  readonly hasPolicyVerdict: boolean;
  readonly hasVerifiedEvidence: boolean;
  readonly hasUserConfirmation: boolean;
  readonly withinQuota: boolean;
  readonly withinRateLimit: boolean;
}

export type GateEvaluationResultV1 =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly failed_gate: keyof CapabilityGates;
      readonly error_code:
        | 'SCOPE_VIOLATION'
        | 'UNAUTHORIZED_PRINCIPAL'
        | 'QUOTA_EXCEEDED'
        | 'RATE_LIMITED'
        | 'gate_failed';
    };

/**
 * Evaluates the exact per-tool `CapabilityGates` booleans against a runtime
 * invocation context.
 */
export function evaluateToolGateRequirements(
  toolName: EngramMemoryToolName,
  ctx: GateEvaluationContextV1,
): GateEvaluationResultV1 {
  const gates = ENGRAM_MEMORY_CAPABILITY_GATES[toolName];

  if (gates.requiresScope && !ctx.hasTrustedScope) {
    return {
      allowed: false,
      failed_gate: 'requiresScope',
      error_code: 'SCOPE_VIOLATION',
    };
  }
  if (gates.requiresPrincipal && !ctx.hasTrustedPrincipal) {
    return {
      allowed: false,
      failed_gate: 'requiresPrincipal',
      error_code: 'UNAUTHORIZED_PRINCIPAL',
    };
  }
  if (gates.requiresCapabilityToken && !ctx.hasCapabilityToken) {
    return {
      allowed: false,
      failed_gate: 'requiresCapabilityToken',
      error_code: 'gate_failed',
    };
  }
  if (gates.rateLimited && !ctx.hasCapabilityToken) {
    return {
      allowed: false,
      failed_gate: 'requiresCapabilityToken',
      error_code: 'gate_failed',
    };
  }
  if (gates.rateLimited && !ctx.withinRateLimit) {
    return {
      allowed: false,
      failed_gate: 'rateLimited',
      error_code: 'RATE_LIMITED',
    };
  }
  if (gates.enforcesQuota && !ctx.withinQuota) {
    return {
      allowed: false,
      failed_gate: 'enforcesQuota',
      error_code: 'QUOTA_EXCEEDED',
    };
  }
  if (gates.requiresPolicyVerdict && !ctx.hasPolicyVerdict) {
    return {
      allowed: false,
      failed_gate: 'requiresPolicyVerdict',
      error_code: 'gate_failed',
    };
  }
  if (gates.requiresEvidence && !ctx.hasVerifiedEvidence) {
    return {
      allowed: false,
      failed_gate: 'requiresEvidence',
      error_code: 'gate_failed',
    };
  }
  if (gates.requiresUserConfirmation && !ctx.hasUserConfirmation) {
    return {
      allowed: false,
      failed_gate: 'requiresUserConfirmation',
      error_code: 'gate_failed',
    };
  }

  return { allowed: true };
}
