/**
 * Optional entry `@sentropic/engram/mcp-memory`.
 *
 * Importing this module loads no provider, opens no store, performs no
 * native build and bootstraps no identity. Call `createEngramMemoryProviderV1`
 * with explicit host-injected ports to obtain the standard Sentropic
 * `AppConnectorProviderAdapter`.
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
  McpMemoryPreflightError,
  createEngramMemoryProviderV1,
  protocolError,
} from './provider.js';
export type {
  McpMemoryCapabilityList,
  McpMemoryInvokeRequest,
  McpMemoryProviderOptions,
  McpMemoryResourceRequest,
  McpMemoryStandardAdapter,
  McpMemoryStandardInvocation,
  McpMemoryStandardResult,
  McpMemoryTenantContext,
  McpMemoryTenantResolutionInput,
} from './provider.js';

export {
  MEMORY_MCP_META_KEY,
  createEngramMemoryMcpServerV1,
  discoveryMetadataForTool,
  toMcpCallToolResult,
  wrapMemoryOutputSchemaForSdk,
} from './server.js';
export type {
  EngramMemoryMcpServerV1,
  McpMemoryCallToolResult,
  McpMemoryDiscoveredTool,
  ResolveMemoryHostContext,
} from './server.js';
