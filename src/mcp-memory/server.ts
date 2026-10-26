/**
 * MCP SDK wiring for the memory provider. The SDK is loaded lazily inside
 * `createEngramMemoryMcpServerV1` so importing this module (or the package
 * entry) never requires the SDK, the provider, or the store.
 *
 * Discovery publishes the full required schemas and qualified metadata
 * within what the SDK `ToolSchema` accepts:
 * - `inputSchema` unchanged (closed object root per M2);
 * - `outputSchema` with an object root preserving the complete closed
 *   success/failure envelope branches (`oneOf` carried verbatim);
 * - `annotations` carrying the mutability/idempotency/confirmation hints;
 * - `_meta['sentropic.engram/memory']` carrying the wire profile ids,
 *   provider/connector identity, selected source identity, mutability,
 *   idempotency, gates, required scopes/claims and redaction class.
 * Fields the SDK cannot carry stay authoritative in the provider manifest
 * and are asserted there. The host context resolver runs inside the
 * sanitizing boundary: a resolver throw is the constant protocol refusal and
 * never reaches the provider.
 */

import type { AppConnectorProviderAdapter, StpConnectorContext } from '@sentropic/mcp-platform/memory';
import {
  MEMORY_CONNECTOR_ID as P2_CONNECTOR_ID,
  MEMORY_PROVIDER_ID as P2_PROVIDER_ID,
  MEMORY_TOOLS_PROFILE_ID as P2_TOOLS_PROFILE_ID,
  MEMORY_WIRE_PROFILE_ID as P2_WIRE_PROFILE_ID,
  MemoryTrustedContextError,
  requireTrustedInvocationContext,
} from '@sentropic/mcp-platform/memory';
import { MemoryDispatchRefusal } from '@sentropic/mcp-broker/memory';
import {
  MEMORY_ERROR_MAPPING_TABLE,
  TrustedContextUnavailableProtocolError,
} from '../mcp/memory/errors.js';
import { MEMORY_MCP_LIMITS } from '../mcp/memory/contracts.js';

/** Combined escaped CallToolResult ceiling in UTF-8 bytes (M2). */
const COMBINED_RESULT_CEILING_BYTES =
  MEMORY_MCP_LIMITS.MAX_TRANSPORT_COMBINED_SERIALIZED_UTF8_BYTES;

export const MEMORY_MCP_META_KEY = 'sentropic.engram/memory';

export interface McpMemoryDiscoveredTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: unknown;
  readonly outputSchema: unknown;
  readonly annotations: {
    readonly readOnlyHint: boolean;
    readonly destructiveHint: boolean;
    readonly idempotentHint: boolean;
    readonly openWorldHint: boolean;
  };
  readonly _meta: Record<string, unknown>;
}

export interface McpMemoryCallToolResult {
  readonly isError: boolean;
  readonly structuredContent: unknown;
  readonly content: [{ readonly type: 'text'; readonly text: string }];
}

export type ResolveMemoryHostContext = (
  tool: string,
  args: unknown,
) => unknown | Promise<unknown>;

export interface EngramMemoryMcpServerV1 {
  listTools(): Promise<{ tools: McpMemoryDiscoveredTool[] }>;
  callTool(
    name: string,
    args: unknown,
    ctx: unknown,
    envelope?: { idempotencyKey?: string; elicitationRef?: string },
    signal?: AbortSignal,
  ): Promise<McpMemoryCallToolResult>;
  connectViaInMemory(
    resolveContext: ResolveMemoryHostContext,
  ): Promise<{
    client: {
      listTools(): Promise<{ tools: McpMemoryDiscoveredTool[] }>;
      callTool(
        params: { name: string; arguments?: unknown },
        options?: { signal?: AbortSignal },
      ): Promise<McpMemoryCallToolResult>;
    };
    close(): Promise<void>;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Wrap a closed envelope schema with the object root the SDK `ToolSchema`
 * requires, preserving every branch verbatim. Schemas that already carry an
 * object root pass through unchanged.
 */
export function wrapMemoryOutputSchemaForSdk(outputSchema: unknown): Record<string, unknown> {
  if (isRecord(outputSchema) && outputSchema.type === 'object') {
    return outputSchema;
  }
  if (isRecord(outputSchema)) {
    return { type: 'object', ...outputSchema };
  }
  return { type: 'object', description: 'Closed memory result envelope.' };
}

export function discoveryMetadataForTool(tool: {
  name: string;
  description?: string;
  mutability: string;
  mutatesExternalSystem: boolean;
  idempotency: { required: boolean; scope?: string };
  gates: { requiresHumanConfirmation: boolean; requiresElicitation: boolean };
  requiredScopes: readonly string[];
  requiredClaims: readonly string[];
  redactionClass: string;
  sourceId: string;
}): Pick<McpMemoryDiscoveredTool, 'annotations' | '_meta'> {
  const readOnly = tool.mutability === 'read-only';
  return {
    annotations: {
      readOnlyHint: readOnly,
      destructiveHint: tool.mutatesExternalSystem,
      idempotentHint: !tool.idempotency.required,
      openWorldHint: false,
    },
    _meta: {
      [MEMORY_MCP_META_KEY]: {
        wireProfile: P2_WIRE_PROFILE_ID,
        toolsProfile: P2_TOOLS_PROFILE_ID,
        providerId: P2_PROVIDER_ID,
        connectorId: P2_CONNECTOR_ID,
        sourceId: tool.sourceId,
        mutability: tool.mutability,
        mutatesExternalSystem: tool.mutatesExternalSystem,
        idempotency: tool.idempotency,
        gates: tool.gates,
        requiredScopes: [...tool.requiredScopes],
        requiredClaims: [...tool.requiredClaims],
        redactionClass: tool.redactionClass,
      },
    },
  };
}

/**
 * Rebuild the closed MCP `CallToolResult` from a standard provider result.
 * The size guard measures the complete serialized response: the text copy,
 * the structured copy and JSON escaping. The fallback envelope is bounded
 * and always carries the verified audit reference, never a synthetic id.
 */
export function toMcpCallToolResult(
  result: {
    ok: boolean;
    output?: unknown;
    auditId: string;
    redactionClass: string;
    error?: { code: string; message: string; retriable: boolean };
  },
): McpMemoryCallToolResult {
  const envelope = result.ok
    ? {
      ok: true as const,
      output: result.output as { schema_version: number; value: unknown },
      auditId: result.auditId,
      redactionClass: result.redactionClass,
    }
    : {
      ok: false as const,
      auditId: result.auditId,
      redactionClass: result.redactionClass,
      error: {
        code: result.error?.code ?? 'STORE_UNAVAILABLE',
        message: result.error?.message ?? 'Memory substrate store is temporarily unavailable.',
        retriable: result.error?.retriable ?? false,
      },
    };
  const text = JSON.stringify(envelope);
  const candidate: McpMemoryCallToolResult = {
    isError: !envelope.ok,
    structuredContent: envelope,
    content: [{ type: 'text', text }],
  };
  const bytes = Buffer.byteLength(JSON.stringify(candidate), 'utf8');
  if (bytes <= COMBINED_RESULT_CEILING_BYTES) {
    return candidate;
  }
  const fallback = {
    ok: false as const,
    auditId: result.auditId,
    redactionClass: 'high',
    error: {
      code: 'RESULT_TOO_LARGE' as const,
      message: MEMORY_ERROR_MAPPING_TABLE.RESULT_TOO_LARGE.default_sanitized_message,
      retriable: false,
    },
  };
  const fallbackText = JSON.stringify(fallback);
  return { isError: true, structuredContent: fallback, content: [{ type: 'text', text: fallbackText }] };
}

export async function createEngramMemoryMcpServerV1(
  provider: AppConnectorProviderAdapter,
): Promise<EngramMemoryMcpServerV1> {
  const { McpError } = (await import('@modelcontextprotocol/sdk/types.js')) as unknown as {
    McpError: new (code: number, message: string) => Error;
  };
  const tools = [...provider.manifest.tools];

  function toSdkError(error: unknown, toolName: string): Error {
    if (
      error instanceof MemoryTrustedContextError ||
      error instanceof TrustedContextUnavailableProtocolError
    ) {
      return new McpError(-32603, 'Trusted invocation context unavailable');
    }
    if (error instanceof MemoryDispatchRefusal) {
      if (error.refusalCode === 'unknown_tool') {
        return new McpError(-32602, `Unknown tool: ${toolName}`);
      }
      // Constant message: refusal details may carry binding values.
      return new McpError(-32603, 'Trusted invocation context unavailable');
    }
    if (error instanceof McpError) return error;
    return new McpError(-32603, 'Trusted invocation context unavailable');
  }

  function discoveryList(): McpMemoryDiscoveredTool[] {
    return tools.map((tool) => {
      const meta = discoveryMetadataForTool({
        name: tool.name,
        description: tool.description,
        mutability: tool.mutability,
        mutatesExternalSystem: tool.mutatesExternalSystem,
        idempotency: tool.idempotency as { required: boolean; scope?: string },
        gates: tool.gates as { requiresHumanConfirmation: boolean; requiresElicitation: boolean },
        requiredScopes: tool.requiredScopes as readonly string[],
        requiredClaims: tool.requiredClaims as readonly string[],
        redactionClass: (tool as { redactionClass?: string }).redactionClass ?? 'high',
        sourceId: 'mcp:engram-memory',
      });
      return {
        name: tool.name,
        ...(tool.description === undefined ? {} : { description: tool.description }),
        inputSchema: tool.inputSchema,
        outputSchema: wrapMemoryOutputSchemaForSdk(tool.outputSchema),
        annotations: meta.annotations,
        _meta: meta._meta,
      };
    });
  }

  async function dispatch(
    name: string,
    args: unknown,
    ctx: unknown,
    envelope?: { idempotencyKey?: string; elicitationRef?: string },
    signal?: AbortSignal,
  ): Promise<McpMemoryCallToolResult> {
    const known = tools.some((tool) => tool.name === name);
    if (!known) {
      throw new McpError(-32602, `Unknown tool: ${name}`);
    }
    // Guard before provider dispatch: a missing or untrusted context is the
    // constant protocol refusal with zero provider invocations.
    try {
      const trusted = requireTrustedInvocationContext(ctx as StpConnectorContext | undefined | null);
      const binding = trusted.memory?.binding;
      if (binding?.provider_id !== 'sentropic.engram.memory' ||
          binding.connector_id !== 'engram-memory' ||
          binding.selected_source_id !== 'mcp:engram-memory') {
        throw new Error('source binding mismatch');
      }
    } catch {
      throw new McpError(-32603, 'Trusted invocation context unavailable');
    }
    try {
      const result = await provider.invokeTool({
        capabilityRef: name,
        input: args,
        ctx: ctx as never,
        ...(envelope?.idempotencyKey !== undefined ? { idempotencyKey: envelope.idempotencyKey } : {}),
        ...(envelope?.elicitationRef !== undefined ? { elicitationRef: envelope.elicitationRef } : {}),
        ...(signal !== undefined ? { signal } : {}),
      } as never);
      if (typeof result === 'string') {
        throw new McpError(-32603, 'Trusted invocation context unavailable');
      }
      return toMcpCallToolResult(result as {
        ok: boolean;
        output?: unknown;
        auditId: string;
        redactionClass: string;
        error?: { code: string; message: string; retriable: boolean };
      });
    } catch (error) {
      throw toSdkError(error, name);
    }
  }

  return {
    async listTools() {
      return { tools: discoveryList() };
    },
    async callTool(name, args, ctx, envelope, signal) {
      return dispatch(name, args, ctx, envelope, signal);
    },
    async connectViaInMemory(resolveContext: ResolveMemoryHostContext) {
      const [{ Server }, { InMemoryTransport }, types, { Client }] = await Promise.all([
        import('@modelcontextprotocol/sdk/server/index.js'),
        import('@modelcontextprotocol/sdk/inMemory.js'),
        import('@modelcontextprotocol/sdk/types.js'),
        import('@modelcontextprotocol/sdk/client/index.js'),
      ]);
      const server = new Server({ name: 'engram-memory', version: '1.0.0' }, { capabilities: { tools: {} } }) as unknown as {
        setRequestHandler(schema: unknown, handler: (request: never, extra: { signal: AbortSignal }) => Promise<unknown>): void;
        connect(transport: unknown): Promise<void>;
        close(): Promise<void>;
      };
      server.setRequestHandler(types.ListToolsRequestSchema, async () => ({
        tools: discoveryList(),
      }));
      server.setRequestHandler(types.CallToolRequestSchema, (async (
        request: unknown,
        extra: { signal: AbortSignal },
      ) => {
        try {
          const params = (request as { params: { name: string; arguments?: unknown } }).params;
          const name = params.name;
          const args = params.arguments ?? {};
          const existing = tools.find((tool) => tool.name === name);
          if (!existing) throw new McpError(-32602, `Unknown tool: ${name}`);
          // The host context resolver runs INSIDE the sanitizing boundary:
          // any resolver throw becomes the constant trusted-context protocol
          // refusal with no message passthrough, and the provider is never
          // invoked on this path (zero provider invocations).
          let ctx: unknown;
          try {
            ctx = await resolveContext(name, args);
          } catch {
            throw new McpError(-32603, 'Trusted invocation context unavailable');
          }
          const envelope = deriveEnvelope(args, ctx);
          const result = await dispatch(name, args, ctx, envelope, extra.signal);
          return result as unknown as Record<string, unknown>;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw toSdkError(error, '');
        }
      }) as (request: never, extra: { signal: AbortSignal }) => Promise<unknown>);
      const [clientTransport, serverTransport] = (InMemoryTransport as unknown as { createLinkedPair(): [unknown, unknown] }).createLinkedPair();
      const client = new Client({ name: 'engram-memory-test', version: '1.0.0' }, { capabilities: {} }) as {
        listTools(): Promise<{ tools: McpMemoryDiscoveredTool[] }>;
        callTool(
          params: { name: string; arguments?: Record<string, unknown> },
          resultSchema?: unknown,
          options?: { signal?: AbortSignal },
        ): Promise<unknown>;
        connect(transport: unknown): Promise<void>;
        close(): Promise<void>;
      };
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      return {
        client: {
          async listTools() {
            const out = await client.listTools();
            return { tools: out.tools };
          },
          async callTool(params, options) {
            const out = await client.callTool(
              { name: params.name, arguments: (params.arguments ?? {}) as Record<string, unknown> },
              undefined,
              options !== undefined && options.signal !== undefined ? { signal: options.signal } : undefined,
            );
            return out as unknown as McpMemoryCallToolResult;
          },
        },
        async close() {
          await Promise.all([client.close(), server.close()]);
        },
      };
    },
  };
}

/**
 * Derive the trusted mutation-envelope bindings server-side: the idempotency
 * key travels in the tool arguments, the elicitation reference comes from
 * the verified host binding. The adapter re-checks both against the trusted
 * projection before any effect.
 */
function deriveEnvelope(
  args: unknown,
  ctx: unknown,
): { idempotencyKey?: string; elicitationRef?: string } | undefined {
  let idempotencyKey: string | undefined;
  if (isRecord(args) && typeof args.idempotency_key === 'string') {
    idempotencyKey = args.idempotency_key;
  }
  let elicitationRef: string | undefined;
  if (isRecord(ctx)) {
    const binding = (ctx as { memory?: { binding?: { elicitation_ref?: unknown } } }).memory?.binding;
    if (typeof binding?.elicitation_ref === 'string') {
      elicitationRef = binding.elicitation_ref;
    }
  }
  if (idempotencyKey === undefined && elicitationRef === undefined) return undefined;
  return {
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    ...(elicitationRef !== undefined ? { elicitationRef } : {}),
  };
}
