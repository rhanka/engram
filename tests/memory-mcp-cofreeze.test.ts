import { describe, expect, it } from 'vitest';
import {
  evaluateM5LifecycleTransitionV1, evaluateSameScopeTombstoneRecaptureGuardV1,
  verifyMemoryConfirmationContinuationV1,
  projectMemoryInvocationContextV1,
  validateSearchInputV1, validateWithdrawInputV1, isValidOpaqueRef, isValidIdempotencyKey,
  computeMemoryMutationOperationDigestV1,
  evaluatePrincipalScopedMutationLookupV1, evaluateIdempotentMutationStateV1,
  extractMemoryMutationLookupKeyV1,
} from '../src/mcp/memory/index.js';
import { validBinding, validContinuation, expectedBinding, expectedInvocation } from './fixtures/memory-mcp-sol-rules.js';
import { A05_MUTATION_DIGEST_VECTORS_SPEC_RULE } from './fixtures/memory-mcp-spec-rules.js';

describe('L0a cofreeze counterexamples', () => {
  it('minor 12 A10-R5 M:322-326,785: invalid audit is a protocol refusal before other projection checks', () => {
    for (const audit_id of [undefined, null, '', 'audit_mcp_l0_default', '\ud800', 'a'.repeat(513)]) {
      for (const expected of [expectedInvocation, undefined]) {
        const result = (projectMemoryInvocationContextV1 as any)({ ...validBinding, audit_id }, expected);
        expect(result).toEqual({ ok: false, kind: 'protocol_refusal', protocolError: { code: -32603, message: 'Trusted invocation context unavailable' } });
        expect(result).not.toHaveProperty('error_code');
        expect(result).not.toHaveProperty('structuredContent');
      }
    }
  });

  it('minors 9-10 M:527,567,704,710,777,782: current caller admission precedes target disclosure and unknown effects require reconciliation', () => {
    const vector = A05_MUTATION_DIGEST_VECTORS_SPEC_RULE.vectors.capture_v1;
    const preimage = vector.preimage;
    const record: any = { lookup_key: extractMemoryMutationLookupKeyV1(preimage), preimage, operation_digest: vector.expected_digest,
      policy_versions: { tool_name: 'engram_memory_capture', capture_policy_version: 'capture-policy/v1' },
      audit_id: 'audit_01', execution_generation: '1', recovery_state: 'executing_unknown_outcome' };
    const incoming = { preimage, callerAuthorized: true, active_domain_policy_version: 'capture-policy/v1' };
    expect(evaluatePrincipalScopedMutationLookupV1([record], incoming))
      .toMatchObject({ decision: 'reject', error_code: 'MUTATION_OUTCOME_UNKNOWN' });
    for (const recovery_state of ['canonical_committed_receipt', 'completed_response']) {
      expect(evaluatePrincipalScopedMutationLookupV1([{ ...record, recovery_state, canonical_replay_ref: 'canonical_01' }], incoming))
        .toMatchObject({ decision: 'reconcile_canonical', canonical_replay_ref: 'canonical_01' });
      expect(evaluatePrincipalScopedMutationLookupV1([{ ...record, recovery_state }], incoming))
        .toMatchObject({ decision: 'reject', error_code: 'MUTATION_OUTCOME_UNKNOWN' });
    }
  });

  it('minor 10 M:527,777: caller admission precedes inaccessible-target normalization', () => {
    const targetPreimage = A05_MUTATION_DIGEST_VECTORS_SPEC_RULE.vectors.request_admission_v1.preimage;
    for (const targetAuthorized of [undefined, false, true]) {
      expect(evaluatePrincipalScopedMutationLookupV1([], { preimage: targetPreimage, targetAuthorized }))
        .toMatchObject({ decision: 'reject', error_code: 'UNAUTHORIZED' });
      expect(evaluateM5LifecycleTransitionV1({ tool: 'engram_memory_request_admission', prior_state: 'pending', targetAuthorized }))
        .toMatchObject({ ok: false, error_code: 'UNAUTHORIZED' });
      expect(evaluateIdempotentMutationStateV1(undefined, { key: { tool_name: 'engram_memory_request_admission' }, targetAuthorized } as any))
        .toMatchObject({ decision: 'reject', error_code: 'UNAUTHORIZED' });
    }
    expect(evaluatePrincipalScopedMutationLookupV1([], { preimage: targetPreimage, callerAuthorized: true }))
      .toMatchObject({ decision: 'reject', error_code: 'NOT_FOUND' });
  });

  it('minor 7 M:517,525,547: invocation uses the delegate authority and verifies expiry at the effect guard', () => {
    const delegation = {
      delegator_principal_id: 'usr_bob', delegate_principal_id: validBinding.principal_id,
      delegation_receipt_digest: 'sha256:' + 'd'.repeat(64), verified_by_host_resolver: true,
      expires_at: '2026-10-17T12:00:05.000Z',
    };
    expect(projectMemoryInvocationContextV1({ ...validBinding, delegation }, expectedInvocation).ok).toBe(true);
    expect(projectMemoryInvocationContextV1({ ...validBinding, delegation: { ...delegation, delegator_principal_id: validBinding.principal_id, delegate_principal_id: 'usr_bob' } }, expectedInvocation).ok).toBe(false);
    expect(projectMemoryInvocationContextV1({ ...validBinding, delegation }, { ...expectedInvocation, now: delegation.expires_at }).ok).toBe(false);
    expect(projectMemoryInvocationContextV1(validBinding, { ...expectedInvocation, now: validBinding.deadline_at }).ok).toBe(false);
    expect(projectMemoryInvocationContextV1(validBinding, { ...expectedInvocation, now: '2026-10-17T11:59:59.999Z' }).ok).toBe(false);
  });

  it('minor 11 M:1602,561,565: missing required bindings cannot match an equally incomplete expected object', () => {
    for (const field of ['tenant_id', 'target_ref', 'reservation_ref', 'initiating_principal_namespace', 'initiating_principal_id', 'agent_id', 'mcp_client_id', 'store_id', 'scope_ref', 'connector_instance_ref', 'logical_session_ref', 'transport_attachment_ref', 'active_generation']) {
      const continuation: any = { ...validContinuation }; delete continuation[field];
      const expected: any = { ...expectedBinding }; delete expected[field];
      expect(verifyMemoryConfirmationContinuationV1(continuation, expected).ok, field).toBe(false);
    }
    const proof = { previous_attachment_ref: 'attach_01', current_attachment_ref: 'attach_02', reattachment_receipt_digest: 'sha256:' + 'd'.repeat(64), verified: true, admitted_generation: '1' };
    for (const transport_attachment_ref of ['attach_01', 'attach_02']) {
      const expected = { ...expectedBinding, transport_attachment_ref };
      expect(verifyMemoryConfirmationContinuationV1({ ...validContinuation, reattachment_proof: { ...proof, extra: 'unexpected' } }, expected).ok).toBe(false);
    }
  });

  it('minors 5-6 M:238,241-244,279,688: accept untrimmed strings and require NFC only on declared fields', () => {
    expect(isValidOpaqueRef(' \t')).toBe(true);
    expect(isValidIdempotencyKey(' '.repeat(16))).toBe(true);
    for (const text of ['e\u0301', ' \t']) {
      expect(validateSearchInputV1({ query: text, purpose_ref: ' ' }).ok).toBe(true);
      expect(validateWithdrawInputV1({ candidate_id: text, reason_ref: ' ', idempotency_key: ' '.repeat(16) }).ok).toBe(true);
      const p = A05_MUTATION_DIGEST_VECTORS_SPEC_RULE.vectors.request_admission_v1.preimage;
      expect(computeMemoryMutationOperationDigestV1({ ...p, target: { kind: 'candidate', candidate_id: text }, effective_input: { ...p.effective_input, candidate_id: text } }).ok).toBe(true);
    }
    expect(isValidOpaqueRef('e\u0301')).toBe(false);
  });

  it('O3 L0-A03 M:525,545-547,592,1608: missing host expectations never waive freshness or envelope binding', () => {
    const expected: any = {
      tool: 'engram_memory_forget', expectedActiveGeneration: '1', expectedPolicyEpoch: '4',
      now: validBinding.issued_at, confirmationRequired: false,
      argumentIdempotencyKey: validBinding.idempotency_key,
    };
    expect((projectMemoryInvocationContextV1 as any)(validBinding).ok).toBe(false);
    for (const field of ['tool', 'expectedActiveGeneration', 'expectedPolicyEpoch', 'now', 'confirmationRequired']) {
      const missing = { ...expected }; delete missing[field];
      expect(projectMemoryInvocationContextV1(validBinding, missing).ok).toBe(false);
    }
    expect(projectMemoryInvocationContextV1({ ...validBinding, active_generation: '0' }, expected))
      .toMatchObject({ ok: false, error_code: 'AUTHORIZATION_REVOKED' });
    expect(projectMemoryInvocationContextV1({ ...validBinding, policy_epoch: '3' }, expected))
      .toMatchObject({ ok: false, error_code: 'POLICY_STALE' });
    for (const tool of ['engram_memory_capture', 'engram_memory_request_admission', 'engram_memory_withdraw', 'engram_memory_forget']) {
      const e = { ...expected, tool, argumentPurposeRef: validBinding.purpose_ref };
      expect(projectMemoryInvocationContextV1({ ...validBinding, idempotency_key: undefined }, e).ok).toBe(false);
      expect(projectMemoryInvocationContextV1(validBinding, { ...e, argumentIdempotencyKey: undefined }).ok).toBe(false);
      expect(projectMemoryInvocationContextV1(validBinding, { ...e, argumentIdempotencyKey: 'different_key_01234' }).ok).toBe(false);
    }
    for (const tool of ['engram_memory_withdraw', 'engram_memory_forget']) {
      expect(projectMemoryInvocationContextV1({ ...validBinding, elicitation_ref: undefined }, { ...expected, tool }).ok).toBe(false);
    }
    for (const tool of ['engram_memory_search', 'engram_memory_get', 'engram_memory_capture']) {
      const e = { ...expected, tool, argumentPurposeRef: validBinding.purpose_ref };
      expect(projectMemoryInvocationContextV1({ ...validBinding, elicitation_ref: undefined }, { ...e, confirmationRequired: true }).ok).toBe(false);
      for (const argumentPurposeRef of [undefined, 'purpose:other']) {
        expect(projectMemoryInvocationContextV1(validBinding, { ...e, argumentPurposeRef }).ok).toBe(false);
      }
      const projected = projectMemoryInvocationContextV1(validBinding, e);
      expect(projected).toMatchObject({ ok: true, value: { purpose_ref: validBinding.purpose_ref } });
    }
  });

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
