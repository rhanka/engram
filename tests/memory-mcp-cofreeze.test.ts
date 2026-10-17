import { describe, expect, it } from 'vitest';
import {
  evaluateM5LifecycleTransitionV1, evaluateSameScopeTombstoneRecaptureGuardV1,
  verifyMemoryConfirmationContinuationV1,
} from '../src/mcp/memory/index.js';
import { validContinuation, expectedBinding } from './fixtures/memory-mcp-sol-rules.js';

describe('L0a cofreeze counterexamples', () => {
  it('O2 L0-A06 M:525,559,561,567: historical assurance cannot replace current host verdicts or accepted configuration', () => {
    for (const reservation_state of ['uncommitted', 'committed'] as const) {
      const expected: any = {
        ...expectedBinding, reservation_state,
        approving_human_principal_id: 'usr_alice', approving_subject_sub: 'sub_alice_2fa',
        approver_currently_enrolled_2fa: true, approver_not_revoked: true, approver_current_assurance_verified: true,
        expected_issuer: 'https://oidc.sent-tech.ca', accepted_assurance_policy_versions: ['assurance-policy/v1'],
        host_deployment_qualified: true,
      };
      for (const field of ['approver_currently_enrolled_2fa', 'approver_not_revoked', 'approver_current_assurance_verified', 'host_deployment_qualified']) {
        for (const verdict of [undefined, null, false, 'true', 1]) {
          expect(verifyMemoryConfirmationContinuationV1(validContinuation, { ...expected, [field]: verdict }))
            .toMatchObject({ ok: false, error_code: 'gate_failed' });
        }
        const missing = { ...expected }; delete missing[field];
        expect(verifyMemoryConfirmationContinuationV1(validContinuation, missing).ok).toBe(false);
      }
      for (const change of [
        { expected_issuer: 'https://different.sent-tech.ca' }, { expected_issuer: undefined },
        { accepted_assurance_policy_versions: [] }, { accepted_assurance_policy_versions: undefined },
        { accepted_assurance_policy_versions: ['assurance-policy/v2'] },
        { approving_human_principal_id: 'usr_bob' }, { approving_subject_sub: 'sub_bob' },
      ]) expect(verifyMemoryConfirmationContinuationV1(validContinuation, { ...expected, ...change }).ok).toBe(false);
      const assurance: any = { ...validContinuation.assurance }; delete assurance.host_deployment_qualification_status;
      expect(verifyMemoryConfirmationContinuationV1({ ...validContinuation, assurance }, expected).ok).toBe(true);
    }
  });

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
