/**
 * `./registry/definitions` — pure local lazy definition shell.
 *
 * No side effects at import. No provider load, no store open, no native
 * build, no identity bootstrap: this module only carries the local
 * descriptor metadata (ids, versions, tool names, wire profiles), the full
 * tool descriptor set, the provider manifest and the per-tool closed schemas
 * (all static data from the L0 contracts), plus the literal loader bound to
 * the optional public entry `@sentropic/engram/mcp-memory` (package subpath
 * `./mcp-memory`), kept external at bundle time so the packed loader imports
 * the public entry instead of an inlined copy.
 */

import {
  ENGRAM_MEMORY_CONNECTOR_ID,
  ENGRAM_MEMORY_MCP_CONTRACT_VERSION,
  ENGRAM_MEMORY_PROVIDER_ID,
} from '../mcp/memory/contracts.js';
import {
  ENGRAM_MEMORY_PROVIDER_MANIFEST,
  ENGRAM_MEMORY_TOOL_DESCRIPTORS,
} from '../mcp/memory/gates.js';
import {
  MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1,
  MEMORY_MCP_WIRE_PROFILE_ID_V1,
} from '../mcp/memory/schemas.js';

export interface MemoryLazyDefinitionMetadataV1 {
  readonly providerId: typeof ENGRAM_MEMORY_PROVIDER_ID;
  readonly connectorId: typeof ENGRAM_MEMORY_CONNECTOR_ID;
  readonly entryVersion: '1.0.0';
  readonly manifestVersion: typeof ENGRAM_MEMORY_MCP_CONTRACT_VERSION;
  readonly wireProfile: typeof MEMORY_MCP_WIRE_PROFILE_ID_V1;
  readonly toolsProfile: typeof MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1;
  readonly toolNames: readonly string[];
  /** Full static tool descriptor set (qualified metadata source). */
  readonly descriptor: typeof ENGRAM_MEMORY_TOOL_DESCRIPTORS;
  /** Standard provider manifest (static L0 data). */
  readonly manifest: typeof ENGRAM_MEMORY_PROVIDER_MANIFEST;
  /** Closed per-tool input/output schemas, keyed by tool name. */
  readonly schemas: Readonly<Record<string, { readonly inputSchema: unknown; readonly outputSchema: unknown }>>;
}

export interface MemoryLazyDefinitionV1 {
  readonly kind: 'LazyDefinition';
  readonly id: 'sentropic.engram.memory';
  readonly providerId: 'sentropic.engram.memory';
  readonly connectorId: 'engram-memory';
  readonly entryVersion: '1.0.0';
  readonly metadata: MemoryLazyDefinitionMetadataV1;
  readonly load: () => Promise<unknown>;
}

const schemas: Record<string, { inputSchema: unknown; outputSchema: unknown }> = {};
for (const tool of ENGRAM_MEMORY_TOOL_DESCRIPTORS) {
  schemas[tool.name] = { inputSchema: tool.inputSchema, outputSchema: tool.outputSchema };
}

export const memoryDefinitionMetadata: MemoryLazyDefinitionMetadataV1 = {
  providerId: ENGRAM_MEMORY_PROVIDER_ID,
  connectorId: ENGRAM_MEMORY_CONNECTOR_ID,
  entryVersion: '1.0.0',
  manifestVersion: ENGRAM_MEMORY_MCP_CONTRACT_VERSION,
  wireProfile: MEMORY_MCP_WIRE_PROFILE_ID_V1,
  toolsProfile: MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1,
  toolNames: ENGRAM_MEMORY_TOOL_DESCRIPTORS.map((tool) => tool.name),
  descriptor: ENGRAM_MEMORY_TOOL_DESCRIPTORS,
  manifest: ENGRAM_MEMORY_PROVIDER_MANIFEST,
  schemas,
};

export const memoryDefinition: MemoryLazyDefinitionV1 = {
  kind: 'LazyDefinition',
  id: 'sentropic.engram.memory',
  providerId: 'sentropic.engram.memory',
  connectorId: 'engram-memory',
  entryVersion: '1.0.0',
  metadata: memoryDefinitionMetadata,
  // Literal loader bound to the optional entry `@sentropic/engram/mcp-memory`
  // (public subpath `./mcp-memory`). The bundler keeps this specifier
  // external: the packed loader imports the public entry at load time and is
  // never replaced by an inlined provider copy.
  load: () => import('@sentropic/engram/mcp-memory'),
};
