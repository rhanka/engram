/**
 * MCP-L4 provider adapter over the in-process memory facade.
 *
 * Optional public entry `@sentropic/engram/mcp-memory`. Importing this module
 * loads no provider, opens no store, performs no native build and bootstraps
 * no identity. The factory below requires explicit host-injected ports; every
 * host field (audit, scope, principal, store, policy, deadline, cancellation)
 * comes from the verified host invocation context, never from model arguments
 * and never from a fabricated default.
 *
 * No code-graph tools. No sibling aliases. Six tools only.
 */

import type {
  MemoryReadFacetsV1,
} from '../../engram-memory/dist/reads.js';
import type {
  AuthorizationContextV1,
} from '../../engram-memory/dist/contracts/index.js';
import {
  ENGRAM_MEMORY_CONNECTOR_ID,
  ENGRAM_MEMORY_PROVIDER_ID,
  ENGRAM_MEMORY_TOOL_NAMES,
  type EngramMemoryToolName,
  type PublicMemoryErrorCode,
  type ToolResultV1,
} from '../mcp/memory/contracts.js';
import {
  ENGRAM_MEMORY_PROVIDER_MANIFEST,
  ENGRAM_MEMORY_TOOL_DESCRIPTORS,
} from '../mcp/memory/gates.js';
import {
  ENGRAM_MEMORY_WIRE_PROFILE_V1,
  MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1,
  MEMORY_MCP_WIRE_PROFILE_ID_V1,
} from '../mcp/memory/schemas.js';
import {
  createToolSuccessEnvelope,
  mapNeutralMemoryErrorToPublic,
} from '../mcp/memory/errors.js';
import {
  createMemoryReadToolsV1,
  type MemoryReadHostV1,
  type MemoryReadInvocationV1,
  type MemoryReadPageStoreV1,
} from '../memory-tools/reads.js';
import {
  createMemoryWriteToolsV1,
  type MemoryWriteFacetsV1,
  type MemoryWriteHostV1,
  type MemoryWriteInvocationV1,
} from '../memory-tools/writes.js';

export const MEMORY_WIRE_PROFILE_ID = MEMORY_MCP_WIRE_PROFILE_ID_V1;
export const MEMORY_TOOL_SCHEMA_PROFILE_ID = MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1;
export const MEMORY_PROVIDER_ID = ENGRAM_MEMORY_PROVIDER_ID;
export const MEMORY_CONNECTOR_ID = ENGRAM_MEMORY_CONNECTOR_ID;
export const MEMORY_TOOL_NAMES = ENGRAM_MEMORY_TOOL_NAMES;
export const MEMORY_WIRE_PROFILE = ENGRAM_MEMORY_WIRE_PROFILE_V1;
export const MEMORY_PROVIDER_MANIFEST = ENGRAM_MEMORY_PROVIDER_MANIFEST;
export const MEMORY_TOOL_DESCRIPTORS = ENGRAM_MEMORY_TOOL_DESCRIPTORS;

export type { EngramMemoryToolName, PublicMemoryErrorCode, ToolResultV1 };
export type { MemoryReadHostV1, MemoryReadInvocationV1, MemoryReadPageStoreV1 };
export type { MemoryWriteFacetsV1, MemoryWriteHostV1, MemoryWriteInvocationV1 };

export interface McpMemoryProviderOptions {
  readonly readFacets: MemoryReadFacetsV1;
  readonly writeFacets: MemoryWriteFacetsV1;
  readonly readHost: MemoryReadHostV1;
  readonly writeHost: MemoryWriteHostV1;
  readonly policyId: string;
}

export interface McpMemoryInvokeEnvelope {
  readonly idempotencyKey?: string;
  readonly elicitationRef?: string;
}

export interface McpMemoryCallToolResult {
  readonly isError: boolean;
  readonly structuredContent: ToolResultV1<unknown>;
  readonly content: [{ readonly type: 'text'; readonly text: string }];
}

const PROTOCOL_CODE = -32603;
const PROTOCOL_MESSAGE = 'Trusted invocation context unavailable';

function protocolError(): { code: number; message: string } {
  return { code: PROTOCOL_CODE, message: PROTOCOL_MESSAGE };
}

function toCallToolResult(envelope: ToolResultV1<unknown>): McpMemoryCallToolResult {
  const text = JSON.stringify(envelope);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > 2097152) {
    const tooLarge = {
      ok: false,
      auditId: (envelope as { auditId?: string }).auditId ?? 'unknown',
      redactionClass: 'high',
      error: { code: 'RESULT_TOO_LARGE', message: 'Combined CallToolResult exceeds 2 MiB.', retriable: false },
    } as unknown as ToolResultV1<unknown>;
    const fallback = JSON.stringify(tooLarge);
    return { isError: true, structuredContent: tooLarge, content: [{ type: 'text', text: fallback }] };
  }
  return { isError: !envelope.ok, structuredContent: envelope, content: [{ type: 'text', text }] };
}

function failure(
  tool: EngramMemoryToolName,
  auditId: string,
  code: PublicMemoryErrorCode,
): ToolResultV1<never> {
  return mapNeutralMemoryErrorToPublic({ tool, auditId, code, invocationAuthorized: false })
    .structuredContent as ToolResultV1<never>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPurposeRef(tool: EngramMemoryToolName, input: unknown, fallback?: string): string | undefined {
  if (!isPlainObject(input)) return fallback;
  if (tool === 'engram_memory_search' || tool === 'engram_memory_get') {
    return typeof input.purpose_ref === 'string' ? input.purpose_ref : undefined;
  }
  if (tool === 'engram_memory_capture') {
    const payload = input.payload;
    if (isPlainObject(payload) && typeof payload.purpose_ref === 'string') return payload.purpose_ref;
    return undefined;
  }
  return fallback;
}

function readIdempotencyKey(input: unknown): string | undefined {
  if (!isPlainObject(input) || typeof input.idempotency_key !== 'string') return undefined;
  return input.idempotency_key;
}

export interface EngramMemoryProviderV1 {
  readonly providerId: typeof ENGRAM_MEMORY_PROVIDER_ID;
  readonly connectorId: typeof ENGRAM_MEMORY_CONNECTOR_ID;
  readonly manifest: typeof ENGRAM_MEMORY_PROVIDER_MANIFEST;
  listTools(): typeof ENGRAM_MEMORY_TOOL_DESCRIPTORS;
  invokeTool(
    tool: EngramMemoryToolName,
    input: unknown,
    ctx: unknown,
    envelope?: McpMemoryInvokeEnvelope,
    signal?: AbortSignal,
  ): Promise<McpMemoryCallToolResult>;
  createMcpServerBindings(): Promise<{
    tools: typeof ENGRAM_MEMORY_TOOL_DESCRIPTORS;
    callTool: EngramMemoryProviderV1['invokeTool'];
  }>;
}

export function createEngramMemoryProviderV1(options: McpMemoryProviderOptions): EngramMemoryProviderV1 {
  const { readFacets, writeFacets, readHost, writeHost, policyId } = options;
  if (!readFacets || !writeFacets || !readHost || !writeHost || typeof policyId !== 'string' || policyId.length === 0) {
    throw new Error('McpMemoryProvider requires explicit injected host ports and policyId.');
  }
  const readers = createMemoryReadToolsV1({ facets: readFacets, host: readHost });
  const writers = createMemoryWriteToolsV1({ facets: writeFacets, host: writeHost });

  async function invokeTool(
    tool: EngramMemoryToolName,
    input: unknown,
    ctx: unknown,
    envelope: McpMemoryInvokeEnvelope = {},
    signal?: AbortSignal,
  ): Promise<McpMemoryCallToolResult> {
    if (!MEMORY_TOOL_NAMES.includes(tool as EngramMemoryToolName)) {
      throw Object.assign(new Error(`Unknown tool: ${String(tool)}`), { code: PROTOCOL_CODE });
    }
    if (signal?.aborted) {
      const early = await ensureContext(tool, ctx, input, envelope);
      if (!early.ok) throw Object.assign(new Error(PROTOCOL_MESSAGE), { code: PROTOCOL_CODE });
      return toCallToolResult(failure(tool, early.auditId, 'CANCELLED'));
    }
    const ensured = await ensureContext(tool, ctx, input, envelope);
    if (!ensured.ok) throw Object.assign(new Error(PROTOCOL_MESSAGE), { code: PROTOCOL_CODE });
    const { projection, auditId } = ensured;
    if (signal?.aborted) return toCallToolResult(failure(tool, auditId, 'CANCELLED'));

    const inputKey = readIdempotencyKey(input);
    if (inputKey !== undefined && envelope.idempotencyKey !== undefined && inputKey !== envelope.idempotencyKey) {
      return toCallToolResult(failure(tool, auditId, 'DIGEST_CONFLICT'));
    }

    const readInvocation: MemoryReadInvocationV1 = {
      auditId,
      authorization: projection.neutral_authorization as AuthorizationContextV1,
      scope_ref: projection.neutral_scope_ref,
      store_id: projection.trusted_context.store_id,
      principal_namespace: projection.neutral_principal.principal_namespace,
      principal_id: projection.neutral_principal.principal_id,
      tenant_id: projection.neutral_principal.tenant_id,
      connector_instance_id: projection.routing_provenance.connector_instance_ref,
      agent_id: projection.agent_id,
      session_id: projection.session_attachment.logical_session_ref,
      generation: projection.routing_provenance.active_generation,
      policy_id: policyId,
      policy_version: projection.routing_provenance.policy_epoch,
      authorization_epoch: projection.trusted_context.policy_epoch ?? projection.routing_provenance.policy_epoch,
      deadline_at: projection.lifecycle_binding.deadline_at,
    };
    const writeInvocation: MemoryWriteInvocationV1 = {
      auditId,
      authorization: projection.neutral_authorization as AuthorizationContextV1,
      scope_ref: projection.neutral_scope_ref,
      store_id: projection.trusted_context.store_id,
      principal_namespace: projection.neutral_principal.principal_namespace,
      principal_id: projection.neutral_principal.principal_id,
      tenant_id: projection.neutral_principal.tenant_id,
      connector_instance_ref: projection.routing_provenance.connector_instance_ref,
      agent_id: projection.agent_id,
      session_id: projection.session_attachment.logical_session_ref,
      generation: projection.routing_provenance.active_generation,
      deadline_at: projection.lifecycle_binding.deadline_at,
    };

    try {
      switch (tool) {
        case 'engram_memory_search': {
          const out = await readers.search(input, readInvocation);
          return toCallToolResult(out as ToolResultV1<unknown>);
        }
        case 'engram_memory_get': {
          const out = await readers.get(input, readInvocation);
          return toCallToolResult(out as ToolResultV1<unknown>);
        }
        case 'engram_memory_capture': {
          const out = await writers.capture(input, writeInvocation);
          return toCallToolResult(out as ToolResultV1<unknown>);
        }
        case 'engram_memory_request_admission': {
          const out = await writers.requestAdmission(input, writeInvocation);
          return toCallToolResult(out as ToolResultV1<unknown>);
        }
        case 'engram_memory_withdraw': {
          const out = await writers.withdraw(input, writeInvocation);
          return toCallToolResult(out as ToolResultV1<unknown>);
        }
        case 'engram_memory_forget': {
          const out = await writers.forget(input, writeInvocation);
          return toCallToolResult(out as ToolResultV1<unknown>);
        }
        default:
          throw Object.assign(new Error(`Unknown tool: ${String(tool)}`), { code: PROTOCOL_CODE });
      }
    } catch (error) {
      if (error !== null && typeof error === 'object' && (error as { protocolCode?: number }).protocolCode === PROTOCOL_CODE) {
        throw Object.assign(new Error(PROTOCOL_MESSAGE), { code: PROTOCOL_CODE });
      }
      if (error !== null && typeof error === 'object' && (error as { name?: string }).name === 'MemoryTrustedContextError') {
        throw Object.assign(new Error(PROTOCOL_MESSAGE), { code: PROTOCOL_CODE });
      }
      throw error;
    }
  }

  async function ensureContext(
    tool: EngramMemoryToolName,
    ctx: unknown,
    input: unknown,
    envelope: McpMemoryInvokeEnvelope,
  ): Promise<{ ok: true; projection: Awaited<ReturnType<typeof loadProjection>>; auditId: string } | { ok: false }> {
    try {
      const projection = await loadProjection(tool, ctx, input, envelope);
      return { ok: true, projection, auditId: projection.envelope_bindings.audit_id };
    } catch {
      return { ok: false };
    }
  }

  async function loadProjection(tool: EngramMemoryToolName, ctx: unknown, input: unknown, envelope: McpMemoryInvokeEnvelope) {
    const platform = await import('@sentropic/mcp-platform/memory');
    const trusted = platform.requireTrustedInvocationContext(ctx as never);
    void envelope;
    const hostBinding = (trusted as unknown as { memory?: { binding?: { purpose_ref?: string } } }).memory?.binding;
    const fallbackPurpose = typeof hostBinding?.purpose_ref === 'string' ? hostBinding.purpose_ref : undefined;
    const purposeRef = readPurposeRef(tool, input, fallbackPurpose);
    if (typeof purposeRef !== 'string' || purposeRef.length === 0) {
      throw new platform.MemoryTrustedContextError('purpose binding missing');
    }
    const projection = platform.projectMemoryContext(trusted, purposeRef);
    const failures = platform.validateMemoryProjection(projection);
    if (failures.length > 0) throw new platform.MemoryTrustedContextError(failures.join('; '));
    verifySourceBinding(tool, trusted, projection);
    return projection;
  }

  function verifySourceBinding(
    tool: string,
    trusted: {
      memory?: {
        binding?: { provider_id?: unknown; connector_id?: unknown; selected_source_id?: unknown };
        expectedActiveGeneration?: unknown;
      };
    },
    projection: { routing_provenance: { provider_id: string; connector_id: string; selected_source_id: string; active_generation: string } },
  ): void {
    const binding = trusted.memory?.binding as
      | { provider_id?: unknown; connector_id?: unknown; selected_source_id?: unknown }
      | undefined;
    if (!binding) throw new Error('missing source binding');
    if (
      binding.provider_id !== ENGRAM_MEMORY_PROVIDER_ID ||
      binding.connector_id !== ENGRAM_MEMORY_CONNECTOR_ID ||
      binding.selected_source_id !== 'mcp:engram-memory'
    ) {
      throw new Error('source binding mismatch');
    }
    if (
      projection.routing_provenance.provider_id !== ENGRAM_MEMORY_PROVIDER_ID ||
      projection.routing_provenance.connector_id !== ENGRAM_MEMORY_CONNECTOR_ID ||
      projection.routing_provenance.selected_source_id !== 'mcp:engram-memory'
    ) {
      throw new Error('source binding mismatch');
    }
    const expected = trusted.memory?.expectedActiveGeneration;
    if (typeof expected === 'string' && projection.routing_provenance.active_generation !== expected) {
      throw new Error('stale generation');
    }
    void tool;
  }

  function listTools(): typeof ENGRAM_MEMORY_TOOL_DESCRIPTORS {
    return ENGRAM_MEMORY_TOOL_DESCRIPTORS;
  }

  async function createMcpServerBindings() {
    return { tools: ENGRAM_MEMORY_TOOL_DESCRIPTORS, callTool: invokeTool };
  }

  return {
    providerId: ENGRAM_MEMORY_PROVIDER_ID,
    connectorId: ENGRAM_MEMORY_CONNECTOR_ID,
    manifest: ENGRAM_MEMORY_PROVIDER_MANIFEST,
    listTools,
    invokeTool,
    createMcpServerBindings,
  };
}

export { protocolError };
export function createToolSuccessEnvelopeForMemory<T>(value: T, auditId: string) {
  return createToolSuccessEnvelope(value, auditId);
}

