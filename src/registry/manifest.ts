/**
 * `./registry/manifest` — the Sentropic registry-package envelope for
 * `sentropic.engram.memory` (NOT the bare provider manifest).
 *
 * Single source of truth: `registry/entries.v1.json`, generated at build time
 * by `scripts/gen-mcp-memory-assets.mjs` (after bundling, before packing)
 * and packed alongside `dist`. This module loads that JSON data file only —
 * no provider, no store, no native build, no identity bootstrap — so the
 * exported envelope always equals the packed entries, with zero staleness by
 * construction (a static bundle-time inline would lag the generated digests
 * by one build).
 */

import { createRequire } from 'node:module';
import type { MemoryRegistryPackageV1 } from '../mcp/memory/receipts.js';

// Anchor for the runtime data load: the ESM bundle uses `import.meta.url`,
// the CJS twin (unreachable via the package exports, which expose only
// `import`) falls back to `__filename`. Both resolve to the same
// package-root `registry/entries.v1.json`.
const anchor: string =
  (typeof import.meta !== 'undefined' &&
    typeof (import.meta as { url?: unknown }).url === 'string'
    ? (import.meta as { url: string }).url
    : undefined) ??
  (typeof __filename === 'string' ? __filename : undefined) ??
  (() => { throw new Error('registry manifest envelope anchor unavailable'); })();
const require = createRequire(anchor);

// Package-root-anchored: the packed layout always ships
// `registry/entries.v1.json` next to `dist/`, and the source checkout keeps
// it at the repository root for the same relative location. The path is
// assembled dynamically so the bundler leaves this as a runtime data load
// instead of inlining a stale copy at bundle time.
const entriesPath = ['..', '..', 'registry', 'entries.v1.json'].join('/');
const loaded = require(entriesPath) as MemoryRegistryPackageV1;

if (
  loaded === undefined || loaded === null || typeof loaded !== 'object' ||
  (loaded as { format?: unknown }).format !== 'sentropic.registry-package/v1' ||
  !Array.isArray((loaded as { entries?: unknown }).entries)
) {
  throw new Error('registry manifest envelope is missing or malformed');
}

/** The registry-package envelope (`sentropic.registry-package/v1`). */
export const manifest: MemoryRegistryPackageV1 = loaded;
export default manifest;
