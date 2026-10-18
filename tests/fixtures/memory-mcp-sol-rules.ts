/** Independent fixtures from SPEC-memory-mcp-v3.2.md (sha256 18c697c1cd91287fd9f814c059910ffb4b39ddb1be46af547f384c7d912177b2; restored D10 delta, v3.1 co-freeze f90c927964b44fdf6ad712eee9b894762250239384643a3790931c142d3aeeca superseded for D10).
 * SOL regression rules: M4:525-527, M7:819-908, M5:706-708, A01-A09:1606-1614.
 * These are contract examples, never deployment/qualification evidence.
 */
import { A05_MUTATION_DIGEST_VECTORS_SPEC_RULE } from './memory-mcp-spec-rules.js';

export const validBindings = {
  profileBindings: { wireProfileId:'sentropic.engram.memory-wire/v1',wireProfileSha256:'a'.repeat(64),toolSchemaProfileId:'sentropic.engram.memory-tools/2020-12-v1',toolSchemaProfileSha256:'b'.repeat(64),parameterProfileId:'sentropic.parameters/2020-12-bounded-v1',parameterSchemaVersion:'1.0.0',parameterProfileSha256:'c'.repeat(64) },
        hostBindingRef: 'binding_h2a_local_01',
        invocation: { contractVersion: '1.0.0' },
        authorization: { contractVersion: '1.0.0' },
        domainPolicy: { contractVersion: '1.0.0' },
        engine: {
          mutationPortVersion: 2,
          recallPortVersion: 3,
          readPortVersion: 1,
          engineId: 'eng_01',
          canonicalStoreId: 'store_01',
          fenceProvenanceId: 'fence_01',
        },
        mutationRecovery: {
          contractVersion: '1.0.0',
          digestProfile: 'sentropic.engram.memory-mutation/v1',
        },
        confirmation: {
          contractVersion: '1.0.0',
          enrolledOidcDomain: 'sent-tech.ca',
        },
        audit: { contractVersion: '1.0.0' },
        pagination: {
          contractVersion: '1.0.0',
          engramOwnsSigningSecret: false,
        },
        lifecycle: { contractVersion: '1.0.0' },
      } as const;

export const validBinding = {
        issuer: 'https://auth.sent-tech.ca',
        sub: 'sub_user_alice',
        tid: 'ten_01',
        claims: ['sub', 'tid'],
        claims_provenance_receipt: 'sha256:' + 'a'.repeat(64),
        principal_namespace: 'ns:sent-tech.ca',
        principal_id: 'usr_alice',
        tenant_id: 'ten_01',
        tenant_membership_receipt: 'sha256:' + 'b'.repeat(64),
        tenant_resolution_source: 'authoritative_membership',
        workspace_id: 'ws_different_from_tenant_99',
        agent_id: 'agent_coder',
        mcp_client_id: 'client_h2a',
        logical_session_ref: 'sess_logical_01',
        transport_attachment_ref: 'attach_01',
        connection_proof_digest: 'sha256:' + 'c'.repeat(64),
        publisher_id: 'sentropic.engram.memory',
        provider_id: 'sentropic.engram.memory',
        connector_id: 'engram-memory',
        connector_instance_ref: 'conn_inst_01',
        selected_source_id: 'mcp:engram-memory',
        store_id: 'store_local_01',
        scope_ref: 'scope:project:alpha',
        purpose_ref: 'purpose:engineering',
        active_generation: '1',
        policy_epoch: '4',
        audit_id: 'audit_trusted_01',
        correlation_ref: 'corr_01',
        deadline_at: '2026-10-17T12:00:30.000Z',
        issued_at: '2026-10-17T12:00:00.000Z',
        cancellation_ref: 'cancel_01',
        channel_binding: 'in_process_verified',
        transport_scopes: ['mcp:tools:invoke'],
        idempotency_key: 'idem_0123456789abcdef0123456789',
        elicitation_ref: 'elic_01',
        neutral_credential: 'host_resolved_cred_01',
        neutral_context_ref: 'ctx_ref_01',
      } as const;

/** A03 M:525,545-547,592: trusted current host expectations, never optional call flags. */
export const expectedInvocation = {
  tool: 'engram_memory_forget', expectedActiveGeneration: '1', expectedPolicyEpoch: '4',
  now: '2026-10-17T12:00:00.000Z', confirmationRequired: true,
  argumentIdempotencyKey: 'idem_0123456789abcdef0123456789',
} as const;

export const validContinuation = {
        continuation_ref: 'cont_01',
        elicitation_ref: 'elic_forget_01',
        mode: 'confirm',
        capability: 'engram_memory_forget',
        provider_id: 'sentropic.engram.memory',
        provider_contract_version: '1.0.0',
        connector_id: 'engram-memory',
        connector_instance_ref: 'conn_inst_01',
        tenant_id: 'ten_01',
        initiating_principal_namespace: 'ns:sent-tech.ca',
        initiating_principal_id: 'usr_alice',
        agent_id: 'agent_coder',
        mcp_client_id: 'client_h2a',
        logical_session_ref: 'sess_logical_01',
        transport_attachment_ref: 'attach_01',
        active_generation: '1',
        store_id: 'store_local_01',
        scope_ref: 'scope:project:alpha',
        target_ref: 'mem_abcdef234567',
        reservation_ref: 'resv_04',
        operation_digest: 'sha256:' + 'a'.repeat(64),
        approved: true,
        issued_at: '2026-10-17T12:00:00.000Z',
        expires_at: '2026-10-17T12:05:00.000Z',
        assurance: {
          enrolled_oidc_domain:
            'sent-tech.ca',
          issuer: 'https://oidc.sent-tech.ca',
          approving_subject_sub: 'sub_alice_2fa',
          approving_human_principal_id: 'usr_alice',
          enrollment_receipt_digest: 'sha256:' + 'b'.repeat(64),
          step_up_2fa_receipt_digest: 'sha256:' + 'c'.repeat(64),
          assurance_policy_version: 'assurance-policy/v1',
          authenticated: true,
          enrolled_2fa: true,
          step_up_assurance_verified: true,
          hardware_key_required:
            false,
          identity_source: 'enrolled_oidc_2fa',
        },
      } as const;

export const expectedBinding = {
        elicitation_ref: 'elic_forget_01',
        capability: 'engram_memory_forget',
        provider_id: 'sentropic.engram.memory',
        provider_contract_version: '1.0.0',
        connector_id: 'engram-memory',
        connector_instance_ref: 'conn_inst_01',
        tenant_id: 'ten_01',
        initiating_principal_namespace: 'ns:sent-tech.ca',
        initiating_principal_id: 'usr_alice',
        agent_id: 'agent_coder',
        mcp_client_id: 'client_h2a',
        logical_session_ref: 'sess_logical_01',
        transport_attachment_ref: 'attach_01',
        active_generation: '1',
        store_id: 'store_local_01',
        scope_ref: 'scope:project:alpha',
        target_ref: 'mem_abcdef234567',
        reservation_ref: 'resv_04',
        operation_digest: 'sha256:' + 'a'.repeat(64),
        now: '2026-10-17T12:01:00.000Z',
        execution_deadline_at: '2026-10-17T12:01:30.000Z',
        caller_currently_authorized: true,
        target_currently_authorized: true,
        approving_human_principal_id: 'usr_alice', approving_subject_sub: 'sub_alice_2fa',
        approver_currently_enrolled_2fa: true, approver_not_revoked: true, approver_current_assurance_verified: true,
        expected_issuer: 'https://oidc.sent-tech.ca', accepted_assurance_policy_versions: ['assurance-policy/v1'],
        host_deployment_qualified: true,
        reservation_state: 'uncommitted',
      } as const;

/** M11:1432-1436 / A09:1614. Synthetic candidate identities for structural tests only. */
export const candidateTuple = {
  schema_version: 1, status: 'candidate',
  source: { head: '31cfdc82', base: '5b18561c', merge: 'test-merge', checkout: '31cfdc82' },
  ci: { run_id: 'fixture-run', attempt: 1 },
  artifacts: [{ packageName: '@sentropic/engram', packageVersion: '0.21.0-test', tarballSha256: '1'.repeat(64), integrity: 'sha512-fixture' }],
  entrySha256: '2'.repeat(64), profileSha256: '3'.repeat(64), schemaSha256: '4'.repeat(64), manifestSha256: '5'.repeat(64), indexSha256: '6'.repeat(64),
  declaredLockSha256: '7'.repeat(64), actualLockSha256: '7'.repeat(64), installedExternalClosureSha256: '8'.repeat(64),
  l5ContractSha256: '9'.repeat(64), l5ExportsSha256: 'a'.repeat(64), referenceImplementationRevision: 'fixture-only-l5',
} as const;
/** M5:706-708 / A05:1610. A complete durable reservation with a sealed preimage. */
export const capturePreimage = A05_MUTATION_DIGEST_VECTORS_SPEC_RULE.vectors.capture_v1.preimage;
export const capturePolicyVersions = { tool_name: 'engram_memory_capture', capture_policy_version: 'capture-policy/v1' } as const;
/** M7:819: exact-byte standard oracle, not a local look-alike. */
export const standardHashes = {
 'manifest.ts': 'b2b7babf18bba56ac455451e189ecc641f37d44095eccdd4b854e4921d657dc3',
 'experimental/manifest-elicitation.ts': 'ab088b40259e554826cc6b98a5f99efeca03f7afb94d3e6efa71bc6d05e64979',
};
/** M2:821-852, M7:890: both complete schemas are independently specified. */
export const confirmRequestSchema = { type: 'object', additionalProperties: false, required: ['capability','target_ref','operation_digest'], properties: {
 capability: { enum: ['engram_memory_withdraw', 'engram_memory_forget'] }, target_ref: { type:'string', minLength:1, maxLength:512 }, operation_digest: { type:'string', pattern:'^sha256:[0-9a-f]{64}$' }
} };
export const confirmResponseSchema = { type:'object', additionalProperties:false, required:['approved'], properties:{ approved:{type:'boolean'} } };
/** M2:151-198 / 330-364: fields and types of each tool schema, independent of production. */
export const toolSchemaFields = {
 engram_memory_search: { input: { query:'string', purpose_ref:'string', limit:'integer?', max_packet_bytes:'integer?', capability_policy:'object?', page_cursor:'string?' }, output:{ records:'array',rank_receipt:'object',next_page_cursor:'string?',response_digest:'string' } },
 engram_memory_get: { input: { record_id:'string',purpose_ref:'string',max_packet_bytes:'integer?' }, output:{record:'object',redacted_fields:'array',redaction_receipt_digest:'string',read_receipt:'object',packet_digest:'string'} },
 engram_memory_capture: { input: { idempotency_key:'string',payload:'object',evidence:'object' }, output:{status:'enum',candidate_id:'string',cursor:'string',transaction_receipt_digest:'string',record_digest:'string?'} },
 engram_memory_request_admission: { input:{candidate_id:'string',idempotency_key:'string'},output:{outcome:'object',replayed:'boolean'} },
 engram_memory_withdraw: { input:{candidate_id:'string',idempotency_key:'string',reason_ref:'string'}, output:{receipt:'object',replayed:'boolean',key_destruction:'enum'} },
 engram_memory_forget: { input:{record_id:'string',idempotency_key:'string',reason_ref:'string'},output:{receipt:'object',replayed:'boolean',projection_invalidation:'enum',coverage_receipt_digest:'string?'} },
} as const;

/** Each field/type row below is transcribed from M2:203,266-277,330-364 and M7:821-852. */
export const nestedSchemaFieldRules = [
 {tool:'engram_memory_capture',path:['inputSchema','properties','payload'],fields:{schema_version:'const',purpose_ref:'string',valid_time:'object',components:'array',primary_component_id:'string',primary_event:'object',citations:'array',retention:'object?',reconciliation:'object?'}},
 {tool:'engram_memory_capture',path:['inputSchema','properties','payload','properties','valid_time'],fields:{t:'integer',t_end:'integer?'}},
 {tool:'engram_memory_capture',path:['inputSchema','properties','payload','properties','primary_event'],fields:{at:'integer',type_ref:'string',citation_id:'string'}},
 {tool:'engram_memory_capture',path:['inputSchema','properties','payload','properties','components','items'],fields:{component_id:'string',kind:'enum',text:'string',citation_ids:'array'}},
 {tool:'engram_memory_capture',path:['inputSchema','properties','payload','properties','citations','items'],fields:{citation_id:'string',source_ref:'string',locator:'object',content_digest:'string',observed_at:'string?'}},
 {tool:'engram_memory_capture',path:['inputSchema','properties','payload','properties','citations','items','properties','locator'],fields:{scheme:'string',value:'string'}},
 {tool:'engram_memory_capture',path:['inputSchema','properties','evidence'],fields:{evidence_ref:'string',evidence_digest:'string',citation_ids:'array',attestation:'string?'}},
 {tool:'engram_memory_get',path:['outputSchema','oneOf','0','properties','output','properties','value','properties','read_receipt'],fields:{record_id:'string',record_digest:'string',valid_as_of:'integer',system_as_of:'string',validated_through_cursor:'string',authorization_receipt_digest:'string',revalidation_receipt_digest:'string',checked_at:'string',receipt_digest:'string'}},
] as const;
/** M7:819,890: independent envelope field/type rules. */
export const successEnvelopeFields = {ok:'const',output:'object',auditId:'string',redactionClass:'const'};
export const failureEnvelopeFields = {ok:'const',error:'object',auditId:'string',redactionClass:'const'};
export const failureErrorFields = {code:'enum',message:'string',retriable:'boolean'};
/** A01:1606 / A07:1612 / A09:1614: required receipt field contracts. */
export const publisherReceiptFields = ['assets','entryJcsSha256','tarballSha256','tarballIntegrity','baseManifestSha256','effectiveManifestSha256','schemas','wireProfile','toolSchemaProfile','parameterProfile','validator','executableProvenance'];
export const storageReceiptFields = ['backend','fence','custody','admin','retention','maintenance','pagination'];
export const tupleDigestFields = ['entrySha256','profileSha256','schemaSha256','manifestSha256','indexSha256','declaredLockSha256','actualLockSha256','installedExternalClosureSha256','l5ContractSha256','l5ExportsSha256'];

/** M5:581: admission follows an explicit configured policy decision, never absence-as-acceptance. */
export const absentAdmissionPolicyRule = { spec_line:581, tool:'engram_memory_request_admission', prior_state:'pending', same_scope_tombstone_match:false, error_code:'POLICY_UNAVAILABLE' } as const;
