/**
 * MCP SDK wiring for the memory provider. The SDK is loaded lazily inside
 * `createEngramMemoryMcpServerV1` so importing this module (or the package
 * entry) never requires the SDK, the provider, or the store.
 */

import type { EngramMemoryProviderV1 } from './provider.js';

export type ResolveMemoryHostContext = (
  tool: string,
  args: unknown,
) => unknown | Promise<unknown>;

export interface EngramMemoryMcpServerV1 {
  listTools(): Promise<{ tools: Array<{ name: string; description: string; inputSchema: unknown }> }>;
  callTool(
    name: string,
    args: unknown,
    ctx: unknown,
    envelope?: { idempotencyKey?: string; elicitationRef?: string },
    signal?: AbortSignal,
  ): Promise<{ isError: boolean; structuredContent: unknown; content: Array<{ type: 'text'; text: string }> }>;
  connectViaInMemory(
    resolveContext: ResolveMemoryHostContext,
  ): Promise<{
    client: {
      listTools(): Promise<{ tools: Array<{ name: string }> }>;
      callTool(
        params: { name: string; arguments?: unknown },
        envelope?: { idempotencyKey?: string; elicitationRef?: string },
      ): Promise<{ isError: boolean; structuredContent: unknown; content: Array<{ type: 'text'; text: string }> }>;
    };
    close(): Promise<void>;
  }>;
}

export async function createEngramMemoryMcpServerV1(
  provider: EngramMemoryProviderV1,
): Promise<EngramMemoryMcpServerV1> {
  const tools = provider.listTools();

  async function dispatch(
    name: string,
    args: unknown,
    ctx: unknown,
    envelope?: { idempotencyKey?: string; elicitationRef?: string },
    signal?: AbortSignal,
  ) {
    const known = tools.some((tool) => tool.name === name);
    if (!known) {
      const error = Object.assign(new Error(`Unknown tool: ${name}`), { code: -32603 });
      throw error;
    }
    return provider.invokeTool(
      name as Parameters<EngramMemoryProviderV1['invokeTool']>[0],
      args,
      ctx,
      envelope,
      signal,
    );
  }

  return {
    async listTools() {
      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
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
        setRequestHandler(schema: unknown, handler: (request: never) => Promise<unknown>): void;
        connect(transport: unknown): Promise<void>;
        close(): Promise<void>;
      };
      const clientProto = { listTools: async () => ({ tools: [] }), callTool: async () => ({}), connect: async () => {}, close: async () => {} };
      void clientProto;
      server.setRequestHandler(types.ListToolsRequestSchema, async () => ({
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Record<string, unknown>,
          outputSchema: (tool as { outputSchema?: unknown }).outputSchema as Record<string, unknown> | undefined,
        })),
      }));
      server.setRequestHandler(types.CallToolRequestSchema, (async (request: unknown) => {
        const params = (request as { params: { name: string; arguments?: unknown } }).params;
        const name = params.name;
        const args = params.arguments ?? {};
        const existing = tools.find((tool) => tool.name === name);
        if (!existing) throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
        const ctx = await resolveContext(name, args);
        const envelope = extractEnvelope(args);
        const result = await dispatch(name, args, ctx, envelope);
        return result as unknown as Record<string, unknown>;
      }) as (request: never) => Promise<unknown>);
      const [clientTransport, serverTransport] = (InMemoryTransport as unknown as { createLinkedPair(): [unknown, unknown] }).createLinkedPair();
      const client = new Client({ name: 'engram-memory-test', version: '1.0.0' }, { capabilities: {} }) as {
        listTools(): Promise<{ tools: Array<{ name: string }> }>;
        callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
        connect(transport: unknown): Promise<void>;
        close(): Promise<void>;
      };
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const wrapped = {
        async listTools() {
          const out = await client.listTools();
          return { tools: out.tools.map((tool: { name: string }) => ({ name: tool.name })) };
        },
        async callTool(
          params: { name: string; arguments?: unknown },
          envelope?: { idempotencyKey?: string; elicitationRef?: string },
        ) {
          void envelope;
          const out = await client.callTool({ name: params.name, arguments: (params.arguments ?? {}) as Record<string, unknown> });
          return out as unknown as { isError: boolean; structuredContent: unknown; content: Array<{ type: 'text'; text: string }> };
        },
      };
      return {
        client: wrapped,
        async close() {
          await Promise.all([client.close(), server.close()]);
        },
      };
    },
  };
}

function extractEnvelope(args: unknown): { idempotencyKey?: string; elicitationRef?: string } | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined;
  const record = args as Record<string, unknown>;
  const idempotencyKey = record.idempotency_key;
  if (typeof idempotencyKey === 'string') return { idempotencyKey };
  return undefined;
}
