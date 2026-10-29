/**
 * L4 shared-provenance packed proof: from the REAL packed tarball, a store
 * opened through one public entry is admitted by the engine of the other
 * entry, and a capture through the packed MCP server succeeds.
 *
 * Fails before the fix with CAPABILITY_UNAVAILABLE (one private registry per
 * bundle); passes after (one shared registry).
 */
import { expect, it } from 'vitest';
import { runFencedStorePacked, runSharedProvenancePacked } from '../scripts/mcp-memory-l4-shared-provenance.mjs';

it('packed cross-entry provenance: substrate engine admits the mcp-memory store and the server captures', async () => {
  const { packed, definers, probe } = await runSharedProvenancePacked();
  expect(packed.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(definers.fenced, `fenced registry definers: ${JSON.stringify(definers.fenced)}`).toHaveLength(1);
  expect(definers.inMemory, `in-memory registry definers: ${JSON.stringify(definers.inMemory)}`).toHaveLength(1);
  expect(probe.code, `probe stderr: ${probe.stderr ?? ''}`).toBe(null);
  expect(probe.ok).toBe(true);
}, 300_000);

it('packed fenced-store provenance: substrate opener with the exemption disabled refuses the old archive and captures on the new one', async () => {
  const { byteIdentical, old, new: current } = await runFencedStorePacked();
  expect(byteIdentical).toBe(true);
  expect(old.probe.ok).toBe(false);
  expect(old.probe.code, `old probe stderr: ${old.probe.stderr ?? ''}`).toBe('CAPABILITY_UNAVAILABLE');
  expect(current.probe.code, `new probe stderr: ${current.probe.stderr ?? ''}`).toBe(null);
  expect(current.probe.ok).toBe(true);
}, 300_000);
