import { expectedInvocation } from './fixtures/memory-mcp-sol-rules.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MemoryConfirmationAssuranceV1 } from '../src/mcp/memory/index.js';
import {
  ENGRAM_MEMORY_TOOL_DESCRIPTORS, evaluateM5LifecycleTransitionV1,
  evaluateSameScopeTombstoneRecaptureGuardV1, evaluatePrincipalScopedMutationLookupV1, evaluateIdempotentMutationStateV1,
  extractMemoryMutationLookupKeyV1, computeMemoryMutationOperationDigestV1,
  projectMemoryInvocationContextV1, verifyMemoryConfirmationContinuationV1,
  validateMemoryHostBindingSetV1, validateCaptureInputV1, validateSearchInputV1,
  validateGetInputV1, validateRequestAdmissionInputV1, validateWithdrawInputV1,
  validatePublishedJsonSchemaDraft202012, validateMemoryPublisherAssetsV1, MEMORY_PUBLISHER_ASSETS_V1_SCHEMA, projectMemoryMutationPolicyVersionsV1, verifyDestructiveConfirmationGrantV1,
  validateMemoryHostStorageReceiptsV1, validateMemoryCandidateTupleV1,
  validateMemoryQualifiedTupleV1, validateCandidateQualificationOrderV1,
} from '../src/mcp/memory/index.js';
import { M2_STRING_BOUNDARY_SPEC_RULES, M2_ADDITIONAL_STRING_BOUNDARY_SPEC_RULES, M2_NUMERIC_AND_ARRAY_BOUNDARY_SPEC_RULES, M4_CLOSED_WORLD_AUTHZ_SPEC_RULES, A05_MUTATION_DIGEST_VECTORS_SPEC_RULE } from './fixtures/memory-mcp-spec-rules.js';
import { validBindings, validBinding, validContinuation, expectedBinding, capturePreimage, capturePolicyVersions, standardHashes, candidateTuple, nestedSchemaFieldRules, successEnvelopeFields, failureEnvelopeFields, failureErrorFields, publisherReceiptFields, storageReceiptFields, tupleDigestFields, absentAdmissionPolicyRule } from './fixtures/memory-mcp-sol-rules.js';

const hash = (v: Uint8Array) => createHash('sha256').update(v).digest('hex');
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const rejected = M4_CLOSED_WORLD_AUTHZ_SPEC_RULES.rejected_verdicts;

/** M2:203,260-281. Keep resolution valid while changing a bounded identifier. */
function argumentFor(field: string, value: unknown, absent = false) {
  if (field === 'query' || field === 'purpose_ref') {
    const a: any = { query: 'q', purpose_ref: 'p' }; if (!absent) a[field] = value; else delete a[field];
    return { a, tool: 'engram_memory_search', validate: validateSearchInputV1 };
  }
  if (field === 'record_id') {
    const a: any = { record_id: value, purpose_ref: 'p' }; if (absent) delete a.record_id;
    return { a, tool: 'engram_memory_get', validate: validateGetInputV1 };
  }
  if (field === 'candidate_id' || field === 'reason_ref') {
    const a: any = { candidate_id: 'candidate-1', idempotency_key: 'idem_key_00000001', ...(field === 'reason_ref' ? { reason_ref: 'reason' } : {}) };
    if (!absent) a[field] = value; else delete a[field];
    return { a, tool: field === 'reason_ref' ? 'engram_memory_withdraw' : 'engram_memory_request_admission', validate: field === 'reason_ref' ? validateWithdrawInputV1 : validateRequestAdmissionInputV1 };
  }
  const a: any = { idempotency_key: capturePreimage.idempotency_key, payload: clone(capturePreimage.effective_input.payload), evidence: clone(capturePreimage.effective_input.evidence) };
  delete a.payload.scope_ref; // selected by the trusted host, never by an argument
  if (field === 'payload.components[].component_id') a.payload.components.push({...a.payload.components[0], component_id:'comp_nonprimary'});
  if (field === 'payload.citations[].citation_id') a.payload.citations.push({...a.payload.citations[0], citation_id:'cit_unreferenced'});
  let path = field === 'content_digest' || field === 'observed_at' ? 'payload.citations[0].' + field : field.replaceAll('[]', '[0]');
  if (field === 'payload.components[].component_id' || field === 'payload.citations[].citation_id') path = path.replace('[0]', '[1]');
  const keys = path.replaceAll('[0]', '.0').replaceAll('[1]', '.1').split('.');
  let parent = a; for (const key of keys.slice(0, -1)) parent = parent[key];
  if (!absent) parent[keys.at(-1)!] = value; else delete parent[keys.at(-1)!];
  if (field === 'payload.primary_component_id' && !absent) a.payload.components[0].component_id = value;
  if (['payload.primary_event.citation_id','payload.components[].citation_ids[]','evidence.citation_ids[]'].includes(field) && !absent) {
    a.payload.citations[0].citation_id = value; a.payload.primary_event.citation_id = value;
    a.payload.components[0].citation_ids = [value]; a.evidence.citation_ids = [value];
  }

  return { a, tool: 'engram_memory_capture', validate: validateCaptureInputV1 };
}

describe('Sol MCP-L0 independent spec counterexamples', () => {
  it('A10-R3-STANDARD M7:819: preserves the exact standard declarations and mutable-array compatibility', () => {
    for (const [path, expected] of Object.entries(standardHashes)) {
      expect(hash(readFileSync(join(import.meta.dirname, '../src/mcp/memory/standard', path)))).toBe(expected);
    }
  });

  it('A10-R3-SCHEMAS M2:203,266-277,330-364: published nested schemas and envelope types use spec field rules', () => {
    const check = (schema: any, fields: Record<string,string>) => {
      expect(schema.type).toBe('object'); expect(schema.additionalProperties).toBe(false);
      expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(fields).sort());
      expect([...schema.required].sort()).toEqual(Object.entries(fields).filter(([,v])=>!v.endsWith('?')).map(([k])=>k).sort());
      for (const [key, kind] of Object.entries(fields)) {
        const actual = schema.properties[key], type = kind.replace('?', '');
        if (type==='enum') expect(Array.isArray(actual.enum)).toBe(true);
        else if (type==='const') expect(Object.hasOwn(actual,'const')).toBe(true);
        else expect(actual.type).toBe(type);
      }
    };
    for (const row of nestedSchemaFieldRules) {
      let schema: any = ENGRAM_MEMORY_TOOL_DESCRIPTORS.find(t=>t.name===row.tool)!;
      for (const key of row.path) schema = schema[key];
      check(schema,row.fields);
    }
    for (const descriptor of ENGRAM_MEMORY_TOOL_DESCRIPTORS) {
      const schema: any = descriptor.outputSchema;
      check(schema.oneOf[0],successEnvelopeFields); check(schema.oneOf[1],failureEnvelopeFields); check(schema.oneOf[1].properties.error,failureErrorFields);
      expect(schema.oneOf[0].properties.ok.const).toBe(true); expect(schema.oneOf[1].properties.ok.const).toBe(false);
      expect(schema.oneOf[0].properties.output.properties.schema_version.const).toBe(1);
    }
  });

  for (const rule of [...M2_STRING_BOUNDARY_SPEC_RULES, ...M2_ADDITIONAL_STRING_BOUNDARY_SPEC_RULES]) {
    it(`A10-R1-BYTES M2:${rule.spec_line}: ${rule.field_path} has no ignored fixture`, () => {
      const valid = [rule.exact_limit_ascii, rule.exact_min_multibyte, rule.exact_min_four_byte, rule.exact_max_multibyte].filter(v => v !== undefined);
      for (const value of valid) {
        const { a, tool, validate } = argumentFor(rule.field_path, value);
        const schema = ENGRAM_MEMORY_TOOL_DESCRIPTORS.find(d => d.name === tool)!.inputSchema;
        expect(validatePublishedJsonSchemaDraft202012(schema, a).ok, 'published schema: ' + rule.field_path).toBe(true);
        expect(validate(a).ok, 'semantic validator: ' + rule.field_path).toBe(true);
      }
      for (const value of [rule.over_limit_ascii, rule.over_max_multibyte, rule.empty_value, rule.non_ascii_rejection_sample].filter(v => v !== undefined)) {
        const { a, validate } = argumentFor(rule.field_path, value);
        expect(validate(a).ok, rule.field_path + ' must refuse invalid byte/grammar value').toBe(false);
      }
      const { a, tool, validate } = argumentFor(rule.field_path, undefined, true);
      const schema = ENGRAM_MEMORY_TOOL_DESCRIPTORS.find(d => d.name === tool)!.inputSchema;
      expect(validate(a).ok).toBe(rule.field_path === 'observed_at');
      expect(validatePublishedJsonSchemaDraft202012(schema, a).ok).toBe(rule.field_path === 'observed_at');
      if (rule.field_path === 'observed_at') expect(validate(argumentFor(rule.field_path, null).a).ok).toBe(false);
    });
  }

  it('A10-R1-UNICODE M2:268,269,274 / M5:688: preserves well-formed body strings and requires NFC only where specified', () => {
    const nfd = 'e\u0301';
    for (const rule of M2_STRING_BOUNDARY_SPEC_RULES.filter(r => !r.is_ascii_grammar)) {
      const { a, tool, validate } = argumentFor(rule.field_path, nfd);
      const schema = ENGRAM_MEMORY_TOOL_DESCRIPTORS.find(d => d.name === tool)!.inputSchema;
      expect(validate(a).ok, rule.field_path).toBe(!rule.requires_nfc);
      if (rule.requires_nfc) continue;
      expect(validatePublishedJsonSchemaDraft202012(schema, a).ok, rule.field_path).toBe(true);
      const before = JSON.stringify(a);
      const result = validate(a);
      expect(result.ok).toBe(true);
      if (result.ok) expect(JSON.stringify(result.value)).toBe(before);
      // Nonempty well-formed strings include whitespace; no trimming or normalization is specified.
      expect(validate(argumentFor(rule.field_path, ' \t').a).ok, rule.field_path).toBe(true);
      for (const invalid of ['', '\ud800', '\udc00', 'a\ud800z']) {
        expect(validate(argumentFor(rule.field_path, invalid).a).ok, rule.field_path).toBe(false);
      }
      if (tool !== 'engram_memory_capture') continue;
      const preimage = { ...clone(capturePreimage), effective_input: {
        ...clone(capturePreimage.effective_input), payload: { ...a.payload, scope_ref: capturePreimage.scope_ref },
      } };
      const digest = computeMemoryMutationOperationDigestV1(preimage);
      const normalized = computeMemoryMutationOperationDigestV1(JSON.parse(JSON.stringify(preimage).normalize('NFC')));
      expect(digest.ok).toBe(true); expect(normalized.ok).toBe(true);
      if (digest.ok && normalized.ok) {
        expect(digest.value.canonical_jcs_utf8).toContain(nfd);
        expect(digest.value.operation_digest).not.toBe(normalized.value.operation_digest);
      }
    }
  });

  it('A10-R1-BOUNDS M2:239-249,275: numeric, collection and complete argument boundaries use independent spec limits', () => {
    const rules = M2_NUMERIC_AND_ARRAY_BOUNDARY_SPEC_RULES;
    for (const field of ['limit', 'max_packet_bytes'] as const) {
      const r = rules[field];
      for (const n of [r.min, r.max]) expect(validateSearchInputV1({query:'q',purpose_ref:'p',[field]:n}).ok).toBe(true);
      for (const n of [r.below_min, r.above_max, '', 'é', null]) expect(validateSearchInputV1({query:'q',purpose_ref:'p',[field]:n}).ok).toBe(false);
      expect(validateSearchInputV1({query:'q',purpose_ref:'p'}).ok).toBe(true);
    }
    for (const field of ['components','citations','citation_ids','family_refs']) {
      const r = field === 'components' ? rules.components_array : field === 'citations' ? rules.citations_array : field === 'citation_ids' ? rules.component_citation_ids_array : rules.reconciliation_family_refs_array;
      for (const count of [...new Set([0, r.min_items, r.max_items, r.above_max])]) {
        const a = argumentFor('payload.components[].text','t').a;
        if (field === 'components') a.payload.components = Array.from({length:count},(_,i)=>({...a.payload.components[0],component_id:i===0?'comp_1':'comp_'+(i+1)}));
        if (field === 'citations' || field === 'citation_ids') {
          a.payload.citations = Array.from({length:count},(_,i)=>({...a.payload.citations[0],citation_id:'cit_'+(i+1)}));
          if (field === 'citation_ids') a.payload.components[0].citation_ids = a.payload.citations.map(c=>c.citation_id);
        }
        if (field === 'family_refs') a.payload.reconciliation.family_refs = Array.from({length:count},(_,i)=>'family_'+i).sort();
        const schema = ENGRAM_MEMORY_TOOL_DESCRIPTORS.find(d=>d.name==='engram_memory_capture')!.inputSchema;
        expect(validateCaptureInputV1(a).ok, field+' '+count).toBe(count >= r.min_items && count <= r.max_items);
        expect(validatePublishedJsonSchemaDraft202012(schema,a).ok).toBe(count >= r.min_items && count <= r.max_items);
      }
    }
    for (const multibyte of [false,true]) {
      const a = argumentFor('payload.components[].text','t').a;
      const maxText = M2_STRING_BOUNDARY_SPEC_RULES.find(r=>r.field_path==='payload.components[].text')!.max_utf8_bytes;
      a.payload.components = Array.from({length:Math.ceil(rules.argument_object_max_utf8_bytes.max/maxText)+1},(_,i)=>({...a.payload.components[0],component_id:i===0?'comp_1':'comp_'+(i+1),text:'t'}));
      let remaining = rules.argument_object_max_utf8_bytes.max - Buffer.byteLength(JSON.stringify(a));
      for (const component of a.payload.components) {
        const amount = Math.min(remaining,maxText-1);
        component.text += multibyte ? 'é'.repeat(Math.floor(amount/2))+'x'.repeat(amount%2) : 'x'.repeat(amount);
        remaining -= amount;
      }
      expect(remaining).toBe(0); expect(Buffer.byteLength(JSON.stringify(a))).toBe(rules.argument_object_max_utf8_bytes.max);
      expect(validateCaptureInputV1(a).ok).toBe(true);
      a.payload.components.at(-1)!.text += 'x'; expect(validateCaptureInputV1(a).ok).toBe(false);
    }
  });

  it('A10-R2-TRUE M4:525-527: every lifecycle entry refuses absent or non-Boolean caller and target verdicts', () => {
    for (const tool of ['engram_memory_capture', 'engram_memory_request_admission', 'engram_memory_withdraw', 'engram_memory_forget'] as const) {
      const input: any = { tool, prior_state: tool === 'engram_memory_capture' ? 'absent' : 'tombstoned', callerAuthorized: true, targetAuthorized: true };
      for (const field of tool === 'engram_memory_capture' ? ['callerAuthorized'] : ['callerAuthorized', 'targetAuthorized']) {
        for (const value of rejected) {
          expect(evaluateM5LifecycleTransitionV1({ ...input, [field]: value })).toEqual({ ok: false, isError: true, error_code: field === 'callerAuthorized' ? 'UNAUTHORIZED' : 'NOT_FOUND' });
        }
        const omitted = { ...input }; delete omitted[field];
        expect(evaluateM5LifecycleTransitionV1(omitted).ok).toBe(false);
      }
    }
  });

  it('A10-R2-TRUE M4:525-527: canonical reservation lookup refuses every omitted and non-Boolean verdict before lookup/effect', () => {
    const vectors = A05_MUTATION_DIGEST_VECTORS_SPEC_RULE.vectors;
    for (const vector of [vectors.capture_v1, vectors.request_admission_v1, vectors.withdraw_v1, vectors.forget_v1]) {
      const preimage = vector.preimage;
      const incoming: any = { preimage, callerAuthorized:true,targetAuthorized:true,active_domain_policy_version:preimage.tool_name === 'engram_memory_capture' ? 'capture-policy/v1' : 'admission-policy/v1' };
      expect(evaluatePrincipalScopedMutationLookupV1([], incoming).decision).toBe('execute_new');
      for (const field of preimage.tool_name === 'engram_memory_capture' ? ['callerAuthorized'] : ['callerAuthorized','targetAuthorized']) {
        for (const value of rejected) expect(evaluatePrincipalScopedMutationLookupV1([], {...incoming,[field]:value}).decision).toBe('reject');
        const omitted = {...incoming}; delete omitted[field]; expect(evaluatePrincipalScopedMutationLookupV1([], omitted).decision).toBe('reject');
      }
    }
  });

  it('A10-R2-POLICY M5:581: missing host admission policy never defaults to acceptance', () => {
    const rule = absentAdmissionPolicyRule;
    for (const decision of rejected) {
      expect(evaluateM5LifecycleTransitionV1({tool:rule.tool,prior_state:rule.prior_state,callerAuthorized:true,targetAuthorized:true,same_scope_tombstone_match:rule.same_scope_tombstone_match,policy_decision:decision as any})).toEqual({ok:false,isError:true,error_code:rule.error_code});
      const result = evaluateSameScopeTombstoneRecaptureGuardV1({scope_ref:'scope',candidate_payload_digest:'sha256:'+'a'.repeat(64),tombstoned_payload_digests_in_scope:[],ordinary_policy_decision:decision as any});
      expect(result.ok).toBe(false); if (!result.ok) expect(result.error_code).toBe(rule.error_code);
    }
  });

  it('A10-R6-POLICY M5:706-708: refuses missing projections/preimages on both reservation entry points after reopen', () => {
    for (const vector of [A05_MUTATION_DIGEST_VECTORS_SPEC_RULE.vectors.capture_v1, A05_MUTATION_DIGEST_VECTORS_SPEC_RULE.vectors.request_admission_v1]) {
      const preimage = clone(vector.preimage);
      const computed = computeMemoryMutationOperationDigestV1(preimage); expect(computed.ok).toBe(true); if (!computed.ok) throw new Error('fixture');
      const pv = computed.value.policy_versions;
      expect(projectMemoryMutationPolicyVersionsV1(preimage.effective_input, undefined).ok).toBe(false);
      const active = pv.tool_name === 'engram_memory_capture' ? pv.capture_policy_version : pv.tool_name === 'engram_memory_request_admission' ? pv.admission_policy_version : undefined;
      const record: any = { lookup_key: extractMemoryMutationLookupKeyV1(preimage), preimage, operation_digest: vector.expected_digest, policy_versions: pv, audit_id: 'audit_01', execution_generation: '1', recovery_state: 'authorized_uncommitted' };
      const incoming: any = { preimage, callerAuthorized: true, targetAuthorized: true, active_domain_policy_version: active };
      expect(evaluatePrincipalScopedMutationLookupV1([clone(record)], incoming).decision).toBe('resume_incomplete');
      for (const field of ['policy_versions', 'preimage']) {
        const corrupt = clone(record); delete corrupt[field];
        expect(evaluatePrincipalScopedMutationLookupV1([corrupt], incoming).decision).toBe('reject');
      }
      const key = { ...record.lookup_key, tool_name: preimage.tool_name, tool_contract_version: '1.0.0', target_ref: preimage.target.kind === 'capture_source' ? preimage.target.source_ref : preimage.target.candidate_id };
      const legacy: any = { key, preimage, policy_versions: pv, normalized_input_digest: vector.expected_digest, status: 'failed_retryable', created_at: '2026-10-17T12:00:00.000Z', audit_id:'audit_01',execution_generation:'1' };
      const legacyIn: any = { ...incoming, key, policy_versions: pv, normalized_input_digest: vector.expected_digest };
      expect(evaluateIdempotentMutationStateV1(clone(legacy), legacyIn).decision).toBe('resume_incomplete');
      for (const field of ['policy_versions', 'preimage']) {
        const corrupt = clone(legacy); delete corrupt[field];
        expect(evaluateIdempotentMutationStateV1(corrupt, legacyIn).decision).toBe('reject');
        const badInput = { ...legacyIn }; delete badInput[field];
        expect(evaluateIdempotentMutationStateV1(undefined, badInput).decision).toBe('reject');
      }
      expect(evaluatePrincipalScopedMutationLookupV1([record], { ...incoming, active_domain_policy_version: undefined }).decision).toBe('reject');
      const corrupt = clone(record); corrupt.policy_versions = { ...pv, tool_name: 'engram_memory_forget' };
      expect(evaluatePrincipalScopedMutationLookupV1([corrupt], incoming).decision).toBe('reject');
    }
  });

  it('L0-A02 M7:908 / A02:1607: refuses empty or version-incompatible ports, wrong digest profile and wrong confirmation domain', () => {
    expect(validateMemoryHostBindingSetV1(validBindings).ok).toBe(true);
    for (const field of ['wireProfileId','wireProfileSha256','toolSchemaProfileId','toolSchemaProfileSha256','parameterProfileId','parameterSchemaVersion','parameterProfileSha256']) {
      const b: any = clone(validBindings); delete b.profileBindings[field]; expect(validateMemoryHostBindingSetV1(b).ok).toBe(false);
    }
    expect(validateMemoryHostBindingSetV1({...validBindings,profileBindings:{...validBindings.profileBindings,parameterSchemaVersion:'999'}}).ok).toBe(false);
    for (const name of ['invocation','authorization','domainPolicy','engine','mutationRecovery','confirmation','audit','pagination','lifecycle']) {
      expect(validateMemoryHostBindingSetV1({ ...validBindings, [name]: {} }).ok).toBe(false);
      if (name !== 'engine') expect(validateMemoryHostBindingSetV1({ ...validBindings, [name]: { ...validBindings[name], contractVersion: '999' } }).ok).toBe(false);
    }
    expect(validateMemoryHostBindingSetV1({ ...validBindings, confirmation: { ...validBindings.confirmation, enrolledOidcDomain: 'other.ca' } }).ok).toBe(false);
    expect(validateMemoryHostBindingSetV1({ ...validBindings, mutationRecovery: { ...validBindings.mutationRecovery, digestProfile: 'other' } }).ok).toBe(false);
  });

  it('L0-A03 M2:221 / M4:498 / A03:1608: requires and preserves verified channel, transport scopes, deadline and cancellation', () => {
    const res = projectMemoryInvocationContextV1(validBinding, expectedInvocation); expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.agent_id).toBe('agent_coder');
      expect(res.value.channel_binding).toBe('in_process_verified'); expect(res.value.transport_scopes).toEqual(['mcp:tools:invoke']);
      expect(res.value.lifecycle_binding).toEqual({ deadline_at: '2026-10-17T12:00:30.000Z', cancellation_ref: 'cancel_01' });
    }
    for (const field of ['channel_binding','transport_scopes','cancellation_ref']) {
      const b = clone(validBinding) as any; delete b[field]; expect(projectMemoryInvocationContextV1(b, expectedInvocation).ok).toBe(false);
    }
    for (const scopes of [[], ['mcp:discover'], ['anything'], ['mcp:tools:invoke', 'anything']]) expect(projectMemoryInvocationContextV1({ ...validBinding, transport_scopes: scopes }, expectedInvocation).ok).toBe(false);
    expect(projectMemoryInvocationContextV1({ ...validBinding, channel_binding: 'unbound' }, expectedInvocation).ok).toBe(false);
    expect(projectMemoryInvocationContextV1({ ...validBinding, deadline_at: '2026-10-17T12:00:30.001Z' }, expectedInvocation).ok).toBe(false);
  });

  it('L0-A06 invocation delegation M4:561: should reject a delegation unrelated to the bound principal', () => {
    const delegation = {
      delegator_principal_id: 'usr_bob', delegate_principal_id: 'usr_carol',
      delegation_receipt_digest: 'sha256:' + 'd'.repeat(64), verified_by_host_resolver: true,
      expires_at: '2026-10-17T12:05:00.000Z',
    };
    expect(projectMemoryInvocationContextV1({ ...validBinding, delegation }, expectedInvocation))
      .toMatchObject({ ok: false, error_code: 'UNAUTHORIZED' });
    for (const field of ['delegator_principal_id', 'delegate_principal_id']) {
      const related = { ...delegation, [field]: validBinding.principal_id };
      const result = projectMemoryInvocationContextV1({ ...validBinding, delegation: related }, expectedInvocation);
      expect(result.ok).toBe(field === 'delegate_principal_id');
      if (result.ok) expect(result.value.delegation).toEqual(related);
      for (const invalid of [{ verified_by_host_resolver: false }, { expires_at: validBinding.issued_at }]) {
        expect(projectMemoryInvocationContextV1({ ...validBinding, delegation: { ...related, ...invalid } }, expectedInvocation))
          .toMatchObject({ ok: false, error_code: 'UNAUTHORIZED' });
      }
    }
  });

  it('L0-A06 M4:561 / A06:1611: a verified delegation must connect initiating Alice to approving Bob', () => {
    const expectedApprover = { ...expectedBinding, approving_human_principal_id: 'usr_bob' };
    const base: any = clone(validContinuation); base.assurance.approving_human_principal_id = 'usr_bob';
    const delegation = { delegator_principal_id:'usr_alice', delegate_principal_id:'usr_bob', delegation_receipt_digest:'sha256:'+'d'.repeat(64), verified_by_host_resolver:true, expires_at:'2026-10-17T12:05:00.000Z' };
    expect(verifyMemoryConfirmationContinuationV1(base, expectedApprover).ok).toBe(false);
    base.assurance.delegation = delegation;
    expect(verifyMemoryConfirmationContinuationV1(base, expectedApprover).ok).toBe(true);
    for (const change of [{delegator_principal_id:'usr_carol'}, {delegate_principal_id:'usr_dave'}, {delegator_principal_id:'usr_bob',delegate_principal_id:'usr_alice'}]) {
      expect(verifyMemoryConfirmationContinuationV1({ ...base, assurance: { ...base.assurance, delegation: { ...delegation, ...change } } }, expectedApprover).ok).toBe(false);
    }
    expect(verifyDestructiveConfirmationGrantV1(base, expectedApprover).ok).toBe(true);
    expect(verifyDestructiveConfirmationGrantV1({...base,assurance:undefined}, expectedApprover).ok).toBe(false);
    for (const verdict of rejected) expect(verifyMemoryConfirmationContinuationV1({ ...base, assurance: { ...base.assurance, delegation: { ...delegation, verified_by_host_resolver: verdict } } }, expectedApprover).ok).toBe(false);
  });

  it.each([
    ['continuation', verifyMemoryConfirmationContinuationV1],
    ['destructive grant', verifyDestructiveConfirmationGrantV1],
  ] as const)('L0-A06 committed %s M4:567: rejects the Argon counterexample and retains every approval guard', (_name, verify) => {
    const committed = { ...expectedBinding, active_generation: '1', reservation_state: 'committed' } as const;
    expect(verify({
      ...validContinuation, approved: false,
      assurance: undefined as unknown as MemoryConfirmationAssuranceV1, active_generation: '0',
    }, committed)).toMatchObject({ ok: false, error_code: 'gate_failed' });

    const badContinuations = [
      ...rejected.map(approved => ({ ...validContinuation, approved })),
      { ...validContinuation, assurance: undefined },
      ...['authenticated', 'enrolled_2fa', 'step_up_assurance_verified'].flatMap(field =>
        rejected.map(verdict => ({ ...validContinuation, assurance: { ...validContinuation.assurance, [field]: verdict } }))),
      { ...validContinuation, assurance: { ...validContinuation.assurance, enrolled_oidc_domain: 'other.ca' } },
      { ...validContinuation, assurance: { ...validContinuation.assurance, approving_human_principal_id: 'usr_bob' } },
      { ...validContinuation, assurance: { ...validContinuation.assurance, delegation: {
        delegator_principal_id: 'usr_carol', delegate_principal_id: 'usr_alice',
        delegation_receipt_digest: 'sha256:' + 'd'.repeat(64), verified_by_host_resolver: true,
        expires_at: '2026-10-17T12:05:00.000Z',
      } } },
      { ...validContinuation, active_generation: '0' },
      { ...validContinuation, elicitation_ref: 'elic_other' },
      { ...validContinuation, logical_session_ref: 'session_other' },
      { ...validContinuation, transport_attachment_ref: 'attachment_other' },
      { ...validContinuation, issued_at: 'invalid' },
      { ...validContinuation, expires_at: 'invalid' },
      { ...validContinuation, expires_at: validContinuation.issued_at },
      { ...validContinuation, expires_at: '2026-10-17T11:59:59.999Z' },
      { ...validContinuation, expires_at: '2026-10-17T12:05:00.001Z' },
    ];
    for (const continuation of badContinuations) {
      expect(verify(continuation, committed)).toMatchObject({ ok: false, error_code: 'gate_failed' });
    }
    expect(verify(validContinuation, { ...committed, now: '2026-10-17T11:59:59.999Z' }))
      .toMatchObject({ ok: false, error_code: 'gate_failed' });
    expect(verify(validContinuation, { ...committed, now: 'invalid' }))
      .toMatchObject({ ok: false, error_code: 'gate_failed' });
    // M4:567 permits disclosure at/after expiry; the original affirmative evidence remains mandatory.
    for (const now of [validContinuation.expires_at, '2026-10-17T12:10:00.000Z']) {
      const expected = { ...committed, now, execution_deadline_at: now };
      expect(verify(validContinuation, expected).ok).toBe(true);
      expect(verifyMemoryConfirmationContinuationV1(validContinuation, expected))
        .toMatchObject({ ok: true, decision: 'disclose_committed_without_repeat_effect' });
    }
  });

  it('L0-A06 M4:525,561-567: every current authorization and reconnect verdict is closed-world', () => {
    for (const field of ['caller_currently_authorized','target_currently_authorized']) {
      for (const v of rejected) expect(verifyMemoryConfirmationContinuationV1(validContinuation,{...expectedBinding,[field]:v}).ok).toBe(false);
      const omitted: any = {...expectedBinding}; delete omitted[field]; expect(verifyMemoryConfirmationContinuationV1(validContinuation,omitted).ok).toBe(false);
    }
    const unknown: any = {...expectedBinding}; delete unknown.reservation_state;
    expect(verifyMemoryConfirmationContinuationV1(validContinuation,unknown).ok).toBe(false);
    const proof = {previous_attachment_ref:'attach_01',current_attachment_ref:'attach_02',reattachment_receipt_digest:'sha256:'+'d'.repeat(64),verified:true,admitted_generation:'1'};
    const expected = {...expectedBinding,transport_attachment_ref:'attach_02'};
    expect(verifyMemoryConfirmationContinuationV1({...validContinuation,reattachment_proof:proof},expected).ok).toBe(true);
    for (const v of rejected) expect(verifyMemoryConfirmationContinuationV1({...validContinuation,reattachment_proof:{...proof,verified:v}},expected).ok).toBe(false);
  });

  it('L0-A01 M7:900-908 / A01:1606: digests/assets resolve to exact packed bytes and cannot escape or duplicate paths', () => {
    const bytes = new TextEncoder().encode('{}'); const digest = hash(bytes);
    const roles = ['manifest','wire-profile','tool-schema-profile','parameter-schema','validator'];
    const names = ['search','get','capture','request_admission','withdraw','forget'].map(n => 'engram_memory_' + n);
    const assets = roles.map(role => ({role,path:'registry/'+role+'.json',mediaType:'application/json',sha256:digest}));
    for (const tool of names) for (const direction of ['input','output']) assets.push({role:'schema',path:'registry/'+tool+'-'+direction+'.json',mediaType:'application/json',sha256:digest});
    const packed = new Map(assets.map(a => [a.path, bytes]));
    const receipt: any = { schema_version:1,publisher:{packageName:'@sentropic/engram',packageVersion:'0.21.0-test'},entryVersion:'1.0.0',manifestVersion:'1.0.0',providerContractVersion:'1.0.0',assets,
      entryJcsSha256:'1'.repeat(64),tarballSha256:'2'.repeat(64),tarballIntegrity:'sha512-fixture',baseManifestSha256:digest,effectiveManifestSha256:digest,
      schemas:names.map(tool => ({tool,inputAsset:'registry/'+tool+'-input.json',outputAsset:'registry/'+tool+'-output.json'})),
      wireProfile:{id:'sentropic.engram.memory-wire/v1',version:'1.0.0',sha256:digest},toolSchemaProfile:{id:'sentropic.engram.memory-tools/2020-12-v1',version:'1.0.0',sha256:digest},parameterProfile:{id:'sentropic.parameters/2020-12-bounded-v1',version:'1.0.0',sha256:digest},validator:{id:'fixture-validator',version:'1.0.0',sha256:digest},executableProvenance:{sourceHead:'fixture-head',codeArchiveSha256:'3'.repeat(64),dependencyClosureSha256:'4'.repeat(64)} };
    expect(validateMemoryPublisherAssetsV1(receipt, packed).ok).toBe(true);
    for (const field of publisherReceiptFields) {
      const bad = clone(receipt); delete bad[field]; expect(validateMemoryPublisherAssetsV1(bad, packed).ok).toBe(false);
      expect(validatePublishedJsonSchemaDraft202012(MEMORY_PUBLISHER_ASSETS_V1_SCHEMA, bad).ok).toBe(false);
    }
    for (const path of ['../manifest.json','/manifest.json','registry/../manifest.json','registry\\manifest.json', assets[1]!.path]) {
      const bad = clone(receipt); bad.assets[0].path = path; expect(validateMemoryPublisherAssetsV1(bad, packed).ok).toBe(false);
    }
    const changed = new Map(packed); changed.set(assets[0]!.path, new TextEncoder().encode('{ }'));
    expect(validateMemoryPublisherAssetsV1(receipt, changed).ok).toBe(false);
    expect(validateMemoryPublisherAssetsV1({...receipt,entryJcsSha256:undefined}, packed).ok).toBe(false);
  });

  it('L0-A07 A07:1612: backend, fence, custody, admin, retention, maintenance and pagination require versioned receipts', () => {
    const receipt: any = {schema_version:1,host:'sentropic',store_id:'fixture-store',recall_port_version:3,read_port_version:1,independent_store:true,cross_host_memory_calls:false};
    for (const key of storageReceiptFields) receipt[key] = {id:'fixture-'+key,version:'1',receipt_sha256:'a'.repeat(64)};
    expect(validateMemoryHostStorageReceiptsV1(receipt).ok).toBe(true);
    for (const key of storageReceiptFields) {
      const bad = clone(receipt); delete bad[key]; expect(validateMemoryHostStorageReceiptsV1(bad).ok).toBe(false);
    }
    for (const key of storageReceiptFields) for (const field of ['id','version','receipt_sha256']) {
      const bad = clone(receipt); delete bad[key][field]; expect(validateMemoryHostStorageReceiptsV1(bad).ok).toBe(false);
    }
    expect(validateMemoryHostStorageReceiptsV1({...receipt,raw_signing_key:'forbidden'}).ok).toBe(false);
    expect(validateMemoryHostStorageReceiptsV1({...receipt,independent_store:false}).ok).toBe(false);
  });

  it('L0-A09 M7:809-815 / M11:1432-1436 / A09:1614: changing any qualified artifact or closure requires requalification', () => {
    expect(validateMemoryCandidateTupleV1(candidateTuple).ok).toBe(true);
    expect(validateMemoryQualifiedTupleV1(candidateTuple,{...candidateTuple,status:'published'}).ok).toBe(true);
    for (const key of tupleDigestFields) {
      const bad = {...candidateTuple,[key]:'f'.repeat(64)};
      expect(validateMemoryQualifiedTupleV1(candidateTuple,bad).ok).toBe(false);
      const absent: any = clone(candidateTuple); delete absent[key]; expect(validateMemoryCandidateTupleV1(absent).ok).toBe(false);
    }
    const exit = {l4_candidate_prepared:true,l5_qualified_on_l4_candidate:true,workflow_store_impl:'SqliteMemoryWorkflowStoreV1',forged_call_refusal_verified:true,source_binding_verified:true,l5_checkpoint_id:'L5-MEMORY-V1',l4_exit_claimed:true};
    expect(validateCandidateQualificationOrderV1(exit).ok).toBe(false);
    expect(validateCandidateQualificationOrderV1({...exit,qualified_tuple:candidateTuple,consumed_tuple:candidateTuple}).ok).toBe(true);
  });
});
