import { expect, it } from 'vitest';
import { runPackedAcceptance } from '../scripts/mcp-memory-l4-packed-acceptance.mjs';

it('MCP-L4 packed candidate: SDK, gates, refusals and disabled install', async () => {
  const { packed } = await runPackedAcceptance();
  expect(packed.sha256).toMatch(/^[0-9a-f]{64}$/);
}, 300_000);
