import type { MemoryHostProfileBindingsV1 } from '../mcp/memory/receipts.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Exact bytes emitted from the frozen L0 profiles (two-space JSON + LF).
 * The asset generator verifies these pins against the shipped bytes. */
export const MEMORY_FROZEN_PROFILE_BINDINGS_V1: Readonly<MemoryHostProfileBindingsV1> = Object.freeze({
  wireProfileId: 'sentropic.engram.memory-wire/v1',
  wireProfileSha256: '19cd5fd28c4412c11e9a52061c0584549b3abc4dc136fccf92e6c16ddfc7c974',
  toolSchemaProfileId: 'sentropic.engram.memory-tools/2020-12-v1',
  toolSchemaProfileSha256: '5ea308592fae260753230a48329e0300968edc642305288aedc7caa02c3a3ad0',
  parameterProfileId: 'sentropic.parameters/2020-12-bounded-v1',
  parameterSchemaVersion: '1.0.0',
  parameterProfileSha256: 'c9edd6402957c92f96c7461f30f29b64801c6f17c224c4258984e6ee3beaca47',
});

/** Read the actual shipped assets at activation, before advertising tools. */
export function verifyMemoryFrozenProfileAssetsV1(): boolean {
  const base = new URL(import.meta.url.endsWith('.ts') ? '../../dist/registry/' : './registry/', import.meta.url);
  try {
    for (const [name, identityKey, id, digest] of [
      ['wire-profile', 'wireProfileId', MEMORY_FROZEN_PROFILE_BINDINGS_V1.wireProfileId, MEMORY_FROZEN_PROFILE_BINDINGS_V1.wireProfileSha256],
      ['tool-schema-profile', 'id', MEMORY_FROZEN_PROFILE_BINDINGS_V1.toolSchemaProfileId, MEMORY_FROZEN_PROFILE_BINDINGS_V1.toolSchemaProfileSha256],
      ['parameter-schema', '$id', 'https://sentropic.dev/schemas/engram/memory/parameters-v1.json', MEMORY_FROZEN_PROFILE_BINDINGS_V1.parameterProfileSha256],
    ] as const) {
      const bytes = readFileSync(new URL(name + '.json', base));
      if (createHash('sha256').update(bytes).digest('hex') !== digest || JSON.parse(bytes.toString('utf8'))[identityKey] !== id) return false;
    }
    return true;
  } catch { return false; }
}
