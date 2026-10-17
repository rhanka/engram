/** Local, serial mutation proof. No install, network, provider or dependency. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'memory-mcp-mutations-'));
const originals = new Map();
const cases = [];
function add(id, file, from, to, pattern, line, compile = false) {
  cases.push({ id, file: 'src/mcp/memory/' + file, from, to, pattern, line, compile });
}
add('R1-key-characters', 'schemas.ts', 'minLength: MEMORY_MCP_LIMITS.IDEMPOTENCY_KEY_SCHEMA_MIN_LENGTH', 'minLength: 16', 'A10-R1', 256);
add('R1-citation-bytes', 'schemas.ts', 'if (cidErr) return cidErr;', 'if (false && cidErr) return cidErr;', 'A10-R1', 281);
add('R1-component-id', 'schemas.ts', 'if (idErr) return idErr;', 'if (false && idErr) return idErr;', 'A10-R1', 272);
add('R2-lifecycle-caller', 'policy.ts', 'if (raw.callerAuthorized !== true)', 'if (raw.callerAuthorized !== undefined && raw.callerAuthorized !== true)', 'A10-R2', 525);
add('R2-lifecycle-target', 'policy.ts', 'if (isTargetTool && raw.targetAuthorized !== true)', 'if (isTargetTool && raw.targetAuthorized !== undefined && raw.targetAuthorized !== true)', 'A10-R2', 527);
add('R2-recovery-caller', 'policy.ts', 'if (rawIncoming.callerAuthorized !== true)', 'if (rawIncoming.callerAuthorized !== undefined && rawIncoming.callerAuthorized !== true)', 'A10-R2', 525);
add('R2-recovery-target', 'policy.ts', 'if (isTargetTool && rawIncoming.targetAuthorized !== true)', 'if (isTargetTool && rawIncoming.targetAuthorized !== undefined && rawIncoming.targetAuthorized !== true)', 'A10-R2', 527);
add('R2-continuation', 'schemas.ts', '(request as { reauthorized?: unknown }).reauthorized !== true', '(request as { reauthorized?: unknown }).reauthorized === false', 'Pagination|pagination', 527);
add('R2-terminal-disclosure', 'errors.ts', '(ctx as { targetAuthorized?: unknown }).targetAuthorized === true', '(ctx as { targetAuthorized?: unknown }).targetAuthorized !== false', 'A10-R2', 527);
for (const [field, literal] of [['kind', "'tool'"], ['requiredScopes', "['mcp:tools:invoke']"], ['requiredClaims', "['sub', 'tid']"], ['redactionClass', "'high'"], ['mutatesExternalSystem', 'false']]) {
  add('R3-' + field, 'gates.ts', '  ' + field + ': ' + literal + ',', '', 'M7_MANIFEST', 910);
}
add('R3-elicitation-ref', 'gates.ts', "  capabilityRef: 'engram_memory_withdraw',", "  toolName: 'engram_memory_withdraw',", 'M7_MANIFEST', 865);
add('R3-invoke-scope', 'gates.ts', "  requiredScopes: ['mcp:tools:invoke'],", "  requiredScopes: ['mcp:discover', 'mcp:tools:invoke'],", 'M7_MANIFEST', 913);
add('R3-readonly-compatibility', 'gates.ts', "  requiredScopes: ['mcp:tools:invoke'],", "  requiredScopes: ['mcp:tools:invoke'] as readonly string[],", '', 819, true);
add('R4-recapture-kind', 'policy.ts', "        admission_status: 'pending_adjudication',\n        effective_decision: 'adjudication_required',", "        admission_status: 'ILLEGAL_TRANSITION',\n        effective_decision: 'adjudication_required',", 'A10-R4', 1391);
add('R5-synthetic-audit', 'errors.ts', "    auditId === 'audit_mcp_l0_default' ||", '', 'A10-R5', 322);
add('R6-projection-optional', 'policy.ts', 'if (arguments.length > 1)', 'if (explicitProjection !== undefined)', 'A10-R6', 706);
add('R6-serialized-policy-version', 'policy.ts', 'stringifyRfc8785JcsPreservingValidatedStrings(validated.value)', "stringifyRfc8785JcsPreservingValidatedStrings(JSON.parse(JSON.stringify(validated.value, (k,v) => k === 'capture_policy_version' ? undefined : v)))", 'A10-R6', 706);
add('R6-legacy-preimage', 'policy.ts', 'if (!validRecord(incoming)) return invalid;', "if (!incoming.preimage) return { decision: 'execute_new' };\n  if (!validRecord(incoming)) return invalid;", 'A10-R6', 706);
add('R6-policy-freshness', 'policy.ts', 'recordedVersion !== incoming.active_domain_policy_version', 'incoming.active_domain_policy_version !== undefined && recordedVersion !== incoming.active_domain_policy_version', 'A10-R6', 708);
add('A02-port-version', 'topology.ts', "if (portName !== 'engine' && (port as Record<string, unknown>).contractVersion !== '1.0.0')", 'if (false)', 'L0-A02', 908);
add('A02-confirmation-domain', 'topology.ts', "(b.confirmation as Record<string, unknown>).enrolledOidcDomain !== 'sent-tech.ca'", 'false', 'L0-A02', 1607);
add('A02-digest-profile', 'topology.ts', "(b.mutationRecovery as Record<string, unknown>).digestProfile !== 'sentropic.engram.memory-mutation/v1'", 'false', 'L0-A02', 1607);
add('A03-channel', 'policy.ts', "!['in_process_verified', 'stdio_host_managed_verified', 'http_mcp_auth_dpop_verified', 'http_mcp_auth_bearer_verified'].includes(binding.channel_binding as string)", 'false', 'L0-A03', 498);
add('A03-invoke-scope', 'policy.ts', "!binding.transport_scopes.includes('mcp:tools:invoke')", 'false', 'L0-A03', 498);
add('A03-cancellation', 'policy.ts', '!isValidOpaqueRef(binding.cancellation_ref)', 'false', 'L0-A03', 221);
add('A06-delegator', 'policy.ts', 'assurance.delegation.delegator_principal_id !== expected.initiating_principal_id', 'false', 'L0-A06', 561);
add('A06-delegate', 'policy.ts', 'assurance.delegation.delegate_principal_id !== assurance.approving_human_principal_id', 'false', 'L0-A06', 561);
for (const key of ['entryJcsSha256','tarballSha256','tarballIntegrity','baseManifestSha256','effectiveManifestSha256','schemas','wireProfile','toolSchemaProfile','parameterProfile','validator','executableProvenance']) {
  add('A01-required-' + key, 'receipts.ts', 'required: Object.keys(properties),', `required: Object.keys(properties).filter(k => k !== '${key}'),`, 'L0-A01', 1606);
}
add('A01-exact-asset-bytes', 'receipts.ts', "if (!bytes || exactBytesSha256(bytes) !== a.sha256)", 'if (!bytes)', 'L0-A01', 902);
for (const key of ['backend','fence','custody','admin','retention','maintenance','pagination']) {
  add('A07-receipt-' + key, 'receipts.ts', 'required: Object.keys(properties),', `required: Object.keys(properties).filter(k => k !== '${key}'),`, 'L0-A07', 1612);
}
for (const key of ['entrySha256','profileSha256','schemaSha256','manifestSha256','indexSha256','declaredLockSha256','actualLockSha256','installedExternalClosureSha256','l5ContractSha256','l5ExportsSha256']) {
  add('A09-tuple-' + key, 'receipts.ts', 'required: Object.keys(properties),', `required: Object.keys(properties).filter(k => k !== '${key}'),`, 'L0-A09', 1614);
}
add('A09-requalification', 'receipts.ts', "if (JSON.stringify(a[key]) !== JSON.stringify(b[key]))", 'if (false)', 'L0-A09', 815);

add('R1-numeric-limit', 'contracts.ts', 'LIMIT_MAX: 50,', 'LIMIT_MAX: 51,', 'A10-R1', 239);
add('R1-component-count', 'contracts.ts', 'COMPONENTS_MAX_ITEMS: 64,', 'COMPONENTS_MAX_ITEMS: 65,', 'A10-R1', 248);
add('R1-citation-count', 'contracts.ts', 'CITATIONS_MAX_ITEMS: 256,', 'CITATIONS_MAX_ITEMS: 257,', 'A10-R1', 248);
add('R1-argument-budget', 'contracts.ts', 'MAX_ARGUMENT_OBJECT_UTF8_BYTES: 1048576,', 'MAX_ARGUMENT_OBJECT_UTF8_BYTES: 1048577,', 'A10-R1', 249);
add('A06-current-caller', 'policy.ts', 'if (expected.caller_currently_authorized !== true)', 'if (expected.caller_currently_authorized !== undefined && expected.caller_currently_authorized !== true)', 'L0-A06', 567);
add('A06-current-target', 'policy.ts', 'if (expected.target_currently_authorized !== true)', 'if (expected.target_currently_authorized !== undefined && expected.target_currently_authorized !== true)', 'L0-A06', 567);
add('A06-reconnect-verdict', 'policy.ts', 'proof.verified !== true', 'proof.verified === false', 'L0-A06', 565);
add('A06-committed-guard-bypass', 'policy.ts', '  if (continuation.elicitation_ref !== expected.elicitation_ref)', "  if (expected.reservation_state === 'committed') return { ok: true, decision: 'disclose_committed_without_repeat_effect', continuation: continuation as unknown as MemoryConfirmationContinuationV1 };\n  if (continuation.elicitation_ref !== expected.elicitation_ref)", 'L0-A06 committed', 567);
add('A06-invocation-principal', 'policy.ts', 'binding.delegation.delegate_principal_id !== binding.principal_id', 'false', 'L0-A06 invocation delegation|minor 7 ', 517);

for (const [field,value] of [['mode',"'confirm'"],['required','true'],['ttlSeconds','MEMORY_MCP_LIMITS.CONFIRMATION_MAX_TTL_SECONDS'],['requestSchema','MemoryConfirmationRequestV1Schema'],['responseSchema','MemoryConfirmationResponseV1Schema'],['carriesSecrets','false'],['bindToClient','true'],['bindToSub','true']]) {
 add('R3-elicitation-'+field,'gates.ts','  '+field+': '+value+',','', 'M7_MANIFEST',890);
}
add('R3-input-schema','gates.ts','inputSchema: ENGRAM_MEMORY_CAPTURE_INPUT_SCHEMA,','inputSchema: ENGRAM_MEMORY_SEARCH_INPUT_SCHEMA,','M7_MANIFEST',910);
add('R3-output-schema','gates.ts','outputSchema: ENGRAM_MEMORY_CAPTURE_OUTPUT_SCHEMA,','outputSchema: ENGRAM_MEMORY_SEARCH_OUTPUT_SCHEMA,','M7_MANIFEST',910);

add('R2-admission-policy-default','policy.ts','const decision = input.policy_decision;',"const decision = input.policy_decision ?? 'accept';",'A10-R2-POLICY',581);
add('R2-recapture-policy-default','policy.ts','const ordinaryDecision = input.ordinary_policy_decision;',"const ordinaryDecision = input.ordinary_policy_decision ?? 'accept';",'A10-R2-POLICY',581);

add('R4-recapture-success-kind','policy.ts','        isError: false,','        isError: true,','A10-R4',1391);
add('O1-tombstone-verdict', 'policy.ts', 'if (input.same_scope_tombstone_match !== false)', 'if (false)', 'O1 A10-R4', 525);
for (const field of ['approver_currently_enrolled_2fa', 'approver_not_revoked', 'approver_current_assurance_verified', 'host_deployment_qualified']) {
  add('O2-' + field, 'policy.ts', 'expected.' + field + ' !== true', 'false', 'O2 L0-A06', 567);
}
add('O2-issuer', 'policy.ts', 'assurance.issuer !== expected.expected_issuer', 'false', 'O2 L0-A06', 561);
add('O2-policy', 'policy.ts', '!expected.accepted_assurance_policy_versions.includes(assurance.assurance_policy_version)', 'false', 'O2 L0-A06', 561);
add('O3-generation', 'policy.ts', 'binding.active_generation !== expected.expectedActiveGeneration', 'false', 'O3 L0-A03', 547);
add('O3-epoch', 'policy.ts', 'binding.policy_epoch !== expected.expectedPolicyEpoch', 'false', 'O3 L0-A03', 547);
add('O3-key-required', 'policy.ts', "const mutating = expected.tool !== 'engram_memory_search' && expected.tool !== 'engram_memory_get';", 'const mutating = false;', 'O3 L0-A03', 592);
add('O3-key-equality', 'policy.ts', 'binding.idempotency_key !== expected.argumentIdempotencyKey', 'false', 'O3 L0-A03', 592);
add('O3-elicitation', 'policy.ts', '(DESTRUCTIVE_TOOL_SET.has(expected.tool) || expected.confirmationRequired)', 'false', 'O3 L0-A03', 542);
add('O3-purpose-binding', 'policy.ts', 'binding.purpose_ref !== expected.argumentPurposeRef', 'false', 'O3 L0-A03', 538);
add('O3-purpose-projection', 'policy.ts', '      purpose_ref: b.purpose_ref,', '', 'O3 L0-A03', 1608);
add('M2-query-nfc', 'schemas.ts', '!isWellFormedUnicode(value.query)', '!isWellFormedUnicodeAndNfc(value.query)', 'minors 5-6|A10-R1-UNICODE', 238);
add('M2-candidate-nfc', 'schemas.ts', 'return isWellFormedUnicode(value) && utf8ByteLength(value) >= 1', 'return isWellFormedUnicodeAndNfc(value) && utf8ByteLength(value) >= 1', 'minors 5-6|A10-R1-UNICODE', 244);
add('M2-opaque-trimming', 'schemas.ts', 'if (!isWellFormedUnicodeAndNfc(value))', 'if (!isWellFormedUnicodeAndNfc(value) || value.trim().length === 0)', 'minors 5-6', 279);
add('A03-delegation-expiry', 'policy.ts', '      expected.now,', '      binding.issued_at as Instant,', 'minor 7 ', 547);
add('A06-required-binding', 'policy.ts', "requiredRefs.some(k => !isValidOpaqueRef(continuation[k]) || !isValidOpaqueRef(expected[k]))", 'false', 'minor 11 ', 1602);
add('A06-reattachment-closure', 'policy.ts', "!hasExactKeys(proof, ['previous_attachment_ref', 'current_attachment_ref', 'reattachment_receipt_digest', 'verified', 'admitted_generation'])", 'false', 'minor 11 ', 1602);
add('A05-unknown-outcome-code', 'policy.ts', "if (existing.recovery_state === 'executing_unknown_outcome') {\n    return {\n      decision: 'reject',\n      error_code: 'MUTATION_OUTCOME_UNKNOWN'", "if (existing.recovery_state === 'executing_unknown_outcome') {\n    return {\n      decision: 'reject',\n      error_code: 'FENCE_LOST'", 'minors 9-10', 782);
add('A05-committed-reconcile', 'policy.ts', "return { decision: 'reconcile_canonical', canonical_replay_ref: existing.canonical_replay_ref, existing_record: existing };", "return { decision: 'reject', error_code: 'FENCE_LOST', retriable: true };", 'minors 9-10', 710);
add('A05-caller-disclosure-code', 'policy.ts', "if (rawIncoming.callerAuthorized !== true) {\n    return {\n      decision: 'reject',\n      error_code: 'UNAUTHORIZED'", "if (rawIncoming.callerAuthorized !== true) {\n    return {\n      decision: 'reject',\n      error_code: 'NOT_FOUND'", 'minor 10 ', 527);
add('A03-audit-protocol', 'policy.ts', "return { ok: false, kind: 'protocol_refusal', protocolError: TRUSTED_CONTEXT_UNAVAILABLE_PROTOCOL_ERROR };", "return { ok: false, error_code: 'UNAUTHORIZED', reason: 'Missing audit' };", 'minor 12 ', 785);
for (const field of ['capture_policy_version', 'admission_policy_version']) {
  add('A05-duplicate-' + field, 'policy.ts', "if (Object.hasOwn(r, '" + field + "') &&", 'if (false &&', 'minor 13 ', 706);
}
add('M5-lookup-key-includes-tool', 'policy.ts', 'isSameMemoryMutationLookupKeyV1(r.lookup_key, lookupKey),', 'isSameMemoryMutationLookupKeyV1(r.lookup_key, lookupKey) && r.preimage.tool_name === incoming.preimage.tool_name,', 'M5-CROSS-TOOL-KEY M:', 698);
add('A05-digest-omits-target', 'policy.ts', 'stringifyRfc8785JcsPreservingValidatedStrings(validated.value)', 'stringifyRfc8785JcsPreservingValidatedStrings(Object.fromEntries(Object.entries(validated.value).filter(([k]) => k !== "target")))', 'A05 literal changed target', 690);
add('A05-digest-omits-effective-value', 'policy.ts', 'stringifyRfc8785JcsPreservingValidatedStrings(validated.value)', 'stringifyRfc8785JcsPreservingValidatedStrings(JSON.parse(JSON.stringify(validated.value, (k,v) => k === "reason_ref" ? undefined : v)))', 'A05 literal changed effective value', 690);
add('A06-candidate-target-nfc', 'policy.ts', "continuation.capability === 'engram_memory_withdraw' ? isValidCandidateId : isValidOpaqueRef", 'isValidOpaqueRef', 'minor 5 L0-A06', 244);
add('O1-tombstone-evidence', 'policy.ts', 'if (!(evidence instanceof Set || Array.isArray(evidence)) ||\n      ![...evidence].every(isValidSha256Digest))', 'if (false)', 'O1 A10-R4', 716);

const results = [];
const selectedIds = process.env.MEMORY_MCP_MUTATION_IDS?.split(',');
const selectedCases = selectedIds ? cases.filter(c => selectedIds.includes(c.id)) : cases;
const suites = ['tests/memory-mcp-l0-contract.test.ts', 'tests/memory-mcp-sol-contract.test.ts', 'tests/memory-mcp-cofreeze.test.ts'];
const env = { ...process.env, npm_config_offline: 'true', NO_PROXY: '*', HTTP_PROXY: '', HTTPS_PROXY: '' };
try {
  // Only clean baselines can give meaningful mutation evidence.
  const baseline = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs','run',...suites], { env, encoding: 'utf8' });
  if (baseline.status !== 0) throw new Error('Baseline failed:\n' + baseline.stdout + baseline.stderr);
  for (const c of selectedCases) {
    const original = readFileSync(c.file, 'utf8'); originals.set(c.file, original);
    if (!original.includes(c.from)) throw new Error('Mutation anchor missing: ' + c.id);
    const changed = original.replace(c.from, () => c.to);
    writeFileSync(c.file, changed);
    let killed = false, failed = [];
    try {
      if (c.compile) {
        const run = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc','--noEmit','-p','.'], { env, encoding:'utf8' });
        killed = run.status !== 0 && /gates\.ts.*error TS/.test(run.stdout + run.stderr);
        failed = killed ? ['tsc: actual CapabilityTool mutable arrays'] : [];
      } else {
        const output = join(directory,'result.json');
        const run = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs','run',...suites,'-t',c.pattern,'--reporter=json','--outputFile',output], { env, encoding:'utf8' });
        const json = JSON.parse(readFileSync(output,'utf8'));
        failed = json.testResults.flatMap(f => f.assertionResults.filter(t => t.status === 'failed').map(t => t.fullName));
        killed = run.status !== 0 && failed.length > 0;
      }
    } finally { writeFileSync(c.file, original); originals.delete(c.file); }
    results.push({ ...c, killed, failed });
    process.stdout.write(`${killed ? 'KILLED' : 'SURVIVED'} ${c.id} (${failed.length})\n`);
  }
  const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
  const lines = ['# MCP-L0 Sol mutation evidence', '', 'Spec SHA-256: `f90c927964b44fdf6ad712eee9b894762250239384643a3790931c142d3aeeca`.', '', 'Reproduce: `node scripts/check-memory-mcp-mutations.mjs`. Serial source mutations; each source is restored in `finally`. No tests or fixtures are mutated. A killed mutant requires an actual failed test case (or a standard-type compiler diagnostic).', '', `Result: **${results.filter(r=>r.killed).length}/${results.length} killed**. Baseline: all three MCP contract suites pass.`, '', '| Mutation | Spec v3.1 line | Result | Failing test |', '|---|---:|---|---|'];
  for (const r of results) lines.push(`| ${r.id} | ${r.line} | ${r.killed ? 'killed' : 'SURVIVED'} | ${r.failed[0]?.replaceAll('|','/') ?? 'none'} |`);
  lines.push('', 'Restored source identities:', '');
  for (const file of [...new Set(cases.map(c=>c.file))]) lines.push(`- \`${file}\`: \`${sha(file)}\``);
  if (!selectedIds) writeFileSync('spec/MCP_L0_SOL_MUTATIONS.md', lines.join('\n')+'\n');
  if (results.some(r=>!r.killed)) process.exitCode = 1;
} finally {
  for (const [file, original] of originals) writeFileSync(file, original);
  rmSync(directory, {recursive:true,force:true});
}
