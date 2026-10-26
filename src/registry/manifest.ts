/**
 * `./registry/manifest` — standard provider manifest for `sentropic.engram.memory`.
 *
 * Pure data export. Importing this module loads no provider, opens no store,
 * performs no native build and bootstraps no identity.
 */

import { ENGRAM_MEMORY_PROVIDER_MANIFEST } from '../mcp/memory/gates.js';

export const manifest = ENGRAM_MEMORY_PROVIDER_MANIFEST;
export default manifest;
