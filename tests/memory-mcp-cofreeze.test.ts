import { describe, expect, it } from 'vitest';
import {
  evaluateM5LifecycleTransitionV1, evaluateSameScopeTombstoneRecaptureGuardV1,
} from '../src/mcp/memory/index.js';

describe('L0a cofreeze counterexamples', () => {
  it('O1 A10-R4 M:525,716-718: missing tombstone evidence cannot authorize automatic acceptance', () => {
    const admission = {
      tool: 'engram_memory_request_admission', prior_state: 'pending',
      callerAuthorized: true, targetAuthorized: true, policy_decision: 'accept',
    } as const;
    for (const verdict of [undefined, null, 'false', 0, 'true', 1]) {
      expect(evaluateM5LifecycleTransitionV1({ ...admission, same_scope_tombstone_match: verdict } as any))
        .toMatchObject({ ok: false, error_code: 'POLICY_UNAVAILABLE' });
    }
    expect(evaluateM5LifecycleTransitionV1(admission)).toMatchObject({ ok: false, error_code: 'POLICY_UNAVAILABLE' });
    expect(evaluateM5LifecycleTransitionV1({ ...admission, same_scope_tombstone_match: false }))
      .toMatchObject({ ok: true, next_state: 'accepted_current' });
    expect(evaluateM5LifecycleTransitionV1({ ...admission, same_scope_tombstone_match: true }))
      .toMatchObject({ ok: true, next_state: 'pending_adjudication' });

  });

  it('O1 A10-R4 M:525,716-718: Set(undefined) is absent evidence, not an empty tombstone set', () => {
    const recapture = { scope_ref: 'scope:alpha', candidate_payload_digest: 'sha256:' + 'a'.repeat(64), ordinary_policy_decision: 'accept' } as const;
    for (const evidence of [undefined, null, false, {}, '']) {
      expect(evaluateSameScopeTombstoneRecaptureGuardV1({ ...recapture, tombstoned_payload_digests_in_scope: evidence } as any))
        .toMatchObject({ ok: false, error_code: 'POLICY_UNAVAILABLE' });
    }
    for (const evidence of [[], new Set<string>()]) {
      expect(evaluateSameScopeTombstoneRecaptureGuardV1({ ...recapture, tombstoned_payload_digests_in_scope: evidence }))
        .toMatchObject({ ok: true, value: { admission_status: 'accepted' } });
    }
  });
});
