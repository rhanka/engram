/**
 * L4 shared-provenance packed proof: from the REAL packed tarball, a store
 * opened through one public entry is admitted by the engine of the other
 * entry, and a capture through the packed MCP server succeeds.
 *
 * Fails before the fix with CAPABILITY_UNAVAILABLE (one private registry per
 * bundle); passes after (one shared registry).
 */
import { expect, it } from 'vitest';
import { runSharedProvenancePacked } from '../scripts/mcp-memory-l4-shared-provenance.mjs';

it('packed cross-entry provenance: substrate engine admits the mcp-memory store and the server captures', async () => {
  const { packed, definers, probe } = await runSharedProvenancePacked();
  expect(packed.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(definers.fenced, `fenced registry definers: ${JSON.stringify(definers.fenced)}`).toHaveLength(1);
  expect(definers.inMemory, `in-memory registry definers: ${JSON.stringify(definers.inMemory)}`).toHaveLength(1);
  expect(probe.code, `probe stderr: ${probe.stderr ?? ''}`).toBe(null);
  expect(probe.ok).toBe(true);
}, 300_000);
