import { expect, it } from 'vitest';
import { runPackedAcceptance } from '../scripts/mcp-memory-l4-packed-acceptance.mjs';

it('MCP-L4 packed candidate: SDK, gates, refusals and disabled install', async () => {
  const { packed, floor } = await runPackedAcceptance();
  expect(packed.sha256).toMatch(/^[0-9a-f]{64}$/);
  // The SDK floor proof is acceptance-owned: a floor failure fails the run
  // outright (never `unverified`), and success flips the manifest field.
  expect(floor).toBe('pass');
}, 300_000);
