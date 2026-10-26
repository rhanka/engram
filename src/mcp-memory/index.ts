/**
 * Optional entry `@sentropic/engram/mcp-memory`.
 *
 * Importing this module loads no provider, opens no store, performs no
 * native build and bootstraps no identity. Call `createEngramMemoryProviderV1`
 * with explicit host-injected ports to obtain the provider.
 */

export {
  MEMORY_CONNECTOR_ID,
  MEMORY_PROVIDER_ID,
  MEMORY_PROVIDER_MANIFEST,
  MEMORY_TOOL_DESCRIPTORS,
  MEMORY_TOOL_NAMES,
  MEMORY_TOOL_SCHEMA_PROFILE_ID,
  MEMORY_WIRE_PROFILE,
  MEMORY_WIRE_PROFILE_ID,
  createEngramMemoryProviderV1,
  createToolSuccessEnvelopeForMemory,
  protocolError,
} from './provider.js';
export type {
  EngramMemoryProviderV1,
  McpMemoryCallToolResult,
  McpMemoryInvokeEnvelope,
  McpMemoryProviderOptions,
} from './provider.js';

export { createEngramMemoryMcpServerV1 } from './server.js';
export type { EngramMemoryMcpServerV1 } from './server.js';
