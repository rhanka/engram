/** Option B in-process reads. Importing this module activates nothing. */
export { createMemoryReadToolsV1, createMemoryReadPageStoreV1 } from './reads.js';
export type { MemoryReadHostV1, MemoryReadInvocationV1, MemoryReadPageStoreV1, MemoryReadPageStateV1 } from './reads.js';
export type { MemoryReadFacetBindingV1, MemoryReadFacetsV1 } from '../../engram-memory/dist/reads.js';
/** Option B in-process writes. Importing this module activates nothing; tools stay disabled until a host injects its ports. */
export { createMemoryWriteToolsV1 } from './writes.js';
export type { MemoryWriteConfirmationV1, MemoryWriteFacetsV1, MemoryWriteHostV1, MemoryWriteInvocationV1, WriteTool } from './writes.js';
