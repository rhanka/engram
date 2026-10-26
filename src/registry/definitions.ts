/**
 * `./registry/definitions` — pure local lazy definition shell.
 *
 * No side effects at import. No provider load, no store open, no native
 * build, no identity bootstrap. The loader is a literal bound to the
 * optional `@sentropic/engram/mcp-memory` export (package subpath
 * `./mcp-memory`), never to a path or command read from JSON.
 */

export interface MemoryLazyDefinitionV1 {
  readonly kind: 'LazyDefinition';
  readonly id: 'sentropic.engram.memory';
  readonly providerId: 'sentropic.engram.memory';
  readonly connectorId: 'engram-memory';
  readonly entryVersion: '1.0.0';
  readonly load: () => Promise<unknown>;
}

export const memoryDefinition: MemoryLazyDefinitionV1 = {
  kind: 'LazyDefinition',
  id: 'sentropic.engram.memory',
  providerId: 'sentropic.engram.memory',
  connectorId: 'engram-memory',
  entryVersion: '1.0.0',
  // Literal loader bound to the optional entry `./mcp-memory`
  // (public specifier `@sentropic/engram/mcp-memory`).
  load: () => import('../mcp-memory/index.js'),
};
