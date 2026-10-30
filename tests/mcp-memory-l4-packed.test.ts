import { expect, it } from 'vitest';
import { missingPackedAcceptancePrereqs, skipReasonFor } from '../scripts/mcp-memory-l4-local-prereqs.mjs';
import { runPackedAcceptance } from '../scripts/mcp-memory-l4-packed-acceptance.mjs';

const missing = missingPackedAcceptancePrereqs();

it.skipIf(missing.length > 0)(
  `MCP-L4 packed candidate: SDK, gates, refusals and disabled install${skipReasonFor(missing)}`,
  async () => {
    const { packed, floor } = await runPackedAcceptance();
    expect(packed.sha256).toMatch(/^[0-9a-f]{64}$/);
    // The SDK floor proof is acceptance-owned: a floor failure fails the run
    // outright (never `unverified`), and success flips the manifest field.
    expect(floor).toBe('pass');
  },
  300_000,
);
