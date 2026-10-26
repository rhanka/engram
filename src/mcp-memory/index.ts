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
  McpMemoryDispatchPlanV1,
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

/**
 * Host-composition helpers (L4 acceptance and host provisioning only).
 *
 * Re-exported canonical constructors and closed policy functions so a host
 * can provision the REAL canonical implementation (in-memory non-native
 * store, guarded engine, read facets, operation digests) behind the injected
 * ports without forking contracts. Production hosts supply their own durable
 * backend; these helpers change no product behavior.
 */
export { createMemoryPortV2 } from '../../engram-memory/dist/engine.js';
export { createMemoryReadFacetsV1 } from '../../engram-memory/dist/reads.js';
export { createInMemoryCanonicalMemoryStoreV1 } from '../../engram-memory/dist/memory-store.js';
export {
  computeMemoryMutationOperationDigestV1,
  extractMemoryMutationLookupKeyV1,
  projectMemoryMutationPolicyVersionsV1,
  validateMemoryMutationPreimageV1,
} from '../mcp/memory/policy.js';
export {
  ENGRAM_MEMORY_WIRE_PROFILE_V1,
  MEMORY_MCP_JSON_SCHEMA_DIALECT_V1,
} from '../mcp/memory/schemas.js';
export { validateMemoryPublisherAssetsV1 } from '../mcp/memory/receipts.js';
export type { MemoryPublisherAssetsV1 } from '../mcp/memory/receipts.js';
