import { createHash } from 'node:crypto';
import type { MemoryPortV2 } from '../../engram-memory/dist/contracts/index.js';
import type {
  AuthorizationContextV1,
  ClockPort,
  Cursor,
  Digest,
  IdempotencyKey,
  MemoryErrorV1,
  OpaqueRef,
} from '../../engram-memory/dist/contracts/index.js';
import type {
  CaptureInputV1,
  CaptureOutputV1,
  EngramMemoryToolName,
  ForgetInputV1,
  ForgetOutputV1,
  PublicMemoryErrorCode,
  RequestAdmissionInputV1,
  RequestAdmissionOutputV1,
  ToolResultV1,
  WithdrawInputV1,
  WithdrawOutputV1,
} from '../mcp/memory/contracts.js';
import {
  createToolSuccessEnvelope,
  isValidTrustedAuditId,
  mapNeutralMemoryErrorToPublic,
  mapUnexpectedDependencyExceptionToPublic,
  TrustedContextUnavailableProtocolError,
} from '../mcp/memory/errors.js';
import {
  isValidCursor,
  isValidInstant,
  isValidOpaqueRef,
  validateCaptureInputV1,
  validateCaptureOutputV1,
  validateForgetInputV1,
  validateForgetOutputV1,
  validateRequestAdmissionInputV1,
  validateRequestAdmissionOutputV1,
  validateWithdrawInputV1,
  validateWithdrawOutputV1,
} from '../mcp/memory/schemas.js';
import {
  ENGRAM_MEMORY_CONNECTOR_ID,
  ENGRAM_MEMORY_MCP_CONTRACT_VERSION,
  ENGRAM_MEMORY_PROVIDER_ID,
} from '../mcp/memory/contracts.js';
import {
  computeMemoryMutationOperationDigestV1,
  createHostLifecycleEventAnchorV1,
  evaluatePrincipalScopedMutationLookupV1,
  extractMemoryMutationLookupKeyV1,
  projectMemoryMutationPolicyVersionsV1,
  resolveCaptureReconciliationConsentV1,
  resolveCaptureRetentionPolicyV1,
  validateMemoryMutationPreimageV1,
  type DestructiveMemoryToolName,
  type EffectiveMemoryMutationInputV1,
  type HostReconciliationPolicyConfigV1,
  type HostRetentionPolicyConfigV1,
  type MemoryMutationBindingV1,
  type MemoryMutationPolicyVersionsV1,
  type MemoryMutationPreimageV1,
  type MemoryMutationRecoveryPortV1,
  type MutatingMemoryToolName,
} from '../mcp/memory/policy.js';

export type WriteTool = 'engram_memory_capture' | 'engram_memory_request_admission' | 'engram_memory_withdraw' | 'engram_memory_forget';

export interface MemoryWriteInvocationV1 {
  auditId: string;
  authorization: AuthorizationContextV1;
  scope_ref: string;
  store_id: string;
  principal_namespace: string;
  principal_id: string;
  tenant_id: string;
  connector_instance_ref: string;
  agent_id: string;
  session_id: string;
  generation: string;
  deadline_at: string;
}

export interface MemoryWriteFacetsV1 {
  scope_ref: string;
  store_id: string;
  engine: MemoryPortV2;
}

export interface MemoryWriteConfirmationV1 {
  capability: DestructiveMemoryToolName;
  target_ref: string;
  operation_digest: Digest;
  reservation_ref: string;
}

export interface MemoryWriteHostV1 {
  clock: ClockPort;
  /** Verifies out-of-band identity, authoritative tenant, session and selection. */
  authenticate(context: MemoryWriteInvocationV1, tool: WriteTool): Promise<boolean>;
  /** Independent per-tool invocation authorization, including exact scope/target. */
  authorize(context: MemoryWriteInvocationV1, tool: WriteTool, purpose_ref: string): Promise<boolean>;
  /** Durable reservation/replay authority (host-supplied, restart-safe). */
  reservation: MemoryMutationRecoveryPortV1<unknown>;
  /** Durable host audit sink; completion may follow the canonical commit. */
  audit: { append(entry: Record<string, unknown>): Promise<void> };
  policy: {
    capturePolicyVersion(): Promise<string>;
    admissionPolicyVersion(): Promise<string>;
    retention: HostRetentionPolicyConfigV1;
    reconciliation: HostReconciliationPolicyConfigV1;
    anchorKindRef: string;
    provenanceDigest(): Promise<Digest>;
    nextSourceOrder(): Promise<{ source_ref: string; sequence: string }>;
  };
  /** Operation-bound confirmation for withdraw/forget; literal true only. */
  confirm(binding: MemoryWriteConfirmationV1): Promise<boolean>;
  /** Pending-body key custody receipts for withdraw. */
  keyCustody: { confirmDestroyed(candidate_id: string): Promise<boolean> };
  /** Derived-surface coverage receipts for forget. */
  coverage: { verify(through_cursor: Cursor): Promise<{ complete: boolean; coverage_digest?: Digest }> };
}

const refs = ['scope_ref', 'store_id', 'principal_namespace', 'principal_id', 'tenant_id', 'connector_instance_ref', 'agent_id', 'session_id'] as const;

/** M13 option B: explicit in-process operations, no listener, broker or activation. Importing this module activates nothing. */
export function createMemoryWriteToolsV1(options: { facets: MemoryWriteFacetsV1; host?: MemoryWriteHostV1 }) {
  const { facets, host } = options;
  const disabled =
    host === undefined || typeof host !== 'object'
    || typeof host.clock?.now !== 'function'
    || typeof host.authenticate !== 'function' || typeof host.authorize !== 'function'
    || typeof host.reservation?.reserveOrLoad !== 'function' || typeof host.reservation?.attachConfirmation !== 'function'
    || typeof host.reservation?.claimFencedExecution !== 'function' || typeof host.reservation?.reconcileCanonicalOutcome !== 'function'
    || typeof host.reservation?.recordCompletion !== 'function' || typeof host.audit?.append !== 'function'
    || typeof host.policy?.capturePolicyVersion !== 'function' || typeof host.policy?.admissionPolicyVersion !== 'function'
    || typeof host.policy?.retention !== 'object' || typeof host.policy?.reconciliation !== 'object'
    || typeof host.policy?.anchorKindRef !== 'string' || typeof host.policy?.provenanceDigest !== 'function'
    || typeof host.policy?.nextSourceOrder !== 'function' || typeof host.confirm !== 'function'
    || typeof host.keyCustody?.confirmDestroyed !== 'function' || typeof host.coverage?.verify !== 'function'
    || typeof facets?.engine?.capture !== 'function' || typeof facets?.engine?.requestAdmission !== 'function'
    || typeof facets?.engine?.transition !== 'function' || facets?.engine?.version !== 2;

  async function context(input: MemoryWriteInvocationV1, tool: WriteTool): Promise<MemoryWriteInvocationV1> {
    let ctx: MemoryWriteInvocationV1;
    try { ctx = structuredClone(input); } catch { throw new TrustedContextUnavailableProtocolError(); }
    if (!ctx || !isValidTrustedAuditId(ctx.auditId) || refs.some(k => !isValidOpaqueRef(ctx[k])) || !isValidCursor(ctx.generation) || !isValidInstant(ctx.deadline_at)
      || !ctx.authorization || typeof ctx.authorization.credential !== 'string' || Object.keys(ctx.authorization).some(k => !['credential', 'context_ref'].includes(k))
      || (ctx.authorization.context_ref !== undefined && !isValidOpaqueRef(ctx.authorization.context_ref))) throw new TrustedContextUnavailableProtocolError();
    if (disabled) return ctx;
    try {
      if (await host!.authenticate(structuredClone(ctx), tool) !== true) throw new TrustedContextUnavailableProtocolError();
    } catch { throw new TrustedContextUnavailableProtocolError(); }
    return ctx;
  }

  const failure = (tool: EngramMemoryToolName, ctx: MemoryWriteInvocationV1, code: PublicMemoryErrorCode) =>
    mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code, invocationAuthorized: false }).structuredContent;
  const neutralFailure = (tool: EngramMemoryToolName, ctx: MemoryWriteInvocationV1, error: MemoryErrorV1) =>
    mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, error, invocationAuthorized: true, targetAuthorized: true }).structuredContent;

  function check(ctx: MemoryWriteInvocationV1): PublicMemoryErrorCode | undefined {
    if (disabled) return 'CAPABILITY_UNAVAILABLE';
    const now = host!.clock.now();
    if (!isValidInstant(now)) return 'STORE_UNAVAILABLE';
    const remaining = Date.parse(ctx.deadline_at) - Date.parse(now);
    if (remaining <= 0) return 'DEADLINE_EXCEEDED';
    if (remaining > 30_000) return 'INVALID_SCHEMA';
    if (ctx.scope_ref !== facets.scope_ref || ctx.store_id !== facets.store_id) return 'UNAUTHORIZED';
    return undefined;
  }

  async function audit(ctx: MemoryWriteInvocationV1, entry: Record<string, unknown>): Promise<void> {
    if (disabled) return;
    try { await host!.audit.append({ auditId: ctx.auditId, at: host!.clock.now(), ...entry }); } catch { /* audit never masks the outcome */ }
  }

  /** Closed submitted-domain comparison (M5 l.686): agent values only, never host-resolved defaults. */
  function submittedEqual(left: EffectiveMemoryMutationInputV1, right: EffectiveMemoryMutationInputV1): boolean {
    if (left.tool_name !== right.tool_name) return false;
    const pick = (input: EffectiveMemoryMutationInputV1): unknown => {
      switch (input.tool_name) {
        case 'engram_memory_capture': return { payload: input.payload, evidence: input.evidence };
        case 'engram_memory_request_admission': return { candidate_id: input.candidate_id };
        case 'engram_memory_withdraw': return { candidate_id: input.candidate_id, reason_ref: input.reason_ref };
        case 'engram_memory_forget': return { record_id: input.record_id, reason_ref: input.reason_ref };
      }
    };
    return stable(pick(left)) === stable(pick(right));
  }

  function stable(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }

  function reservationRefOf(tool: WriteTool, ctx: MemoryWriteInvocationV1, idempotencyKey: string): string {
    const material = [ctx.principal_namespace, ctx.principal_id, ctx.tenant_id, ctx.store_id, ctx.connector_instance_ref, ctx.scope_ref, tool, idempotencyKey].join('\n');
    return `reservation_${createHash('sha256').update(material, 'utf8').digest('hex')}`;
  }

  async function reserve(
    tool: MutatingMemoryToolName, ctx: MemoryWriteInvocationV1, effectiveInput: EffectiveMemoryMutationInputV1,
    target: MemoryMutationPreimageV1['target'], idempotencyKey: string,
  ): Promise<{ preimage: MemoryMutationPreimageV1; digest: Digest; versions: MemoryMutationPolicyVersionsV1 } | { failure: ToolResultV1<never> }> {
    const preimage: MemoryMutationPreimageV1 = {
      profile: 'sentropic.engram.memory-mutation/v1',
      reservation_ref: reservationRefOf(tool as WriteTool, ctx, idempotencyKey),
      provider_id: ENGRAM_MEMORY_PROVIDER_ID, provider_contract_version: ENGRAM_MEMORY_MCP_CONTRACT_VERSION,
      principal_namespace: ctx.principal_namespace, principal_id: ctx.principal_id, tenant_id: ctx.tenant_id,
      store_id: ctx.store_id, connector_id: ENGRAM_MEMORY_CONNECTOR_ID, connector_instance_ref: ctx.connector_instance_ref,
      scope_ref: ctx.scope_ref, tool_name: tool, idempotency_key: idempotencyKey as IdempotencyKey,
      target, effective_input: effectiveInput,
    };
    if (!validateMemoryMutationPreimageV1(preimage).ok) {
      const out = failure(tool, ctx, 'INVALID_SCHEMA');
      await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: 'INVALID_SCHEMA' });
      return { failure: out };
    }
    const digest = computeMemoryMutationOperationDigestV1(preimage);
    if (!digest.ok) {
      const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: digest.error_code, invocationAuthorized: false }).structuredContent;
      await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: digest.error_code });
      return { failure: out };
    }
    return { preimage, digest: digest.value.operation_digest, versions: digest.value.policy_versions };
  }

  async function decide(
    tool: MutatingMemoryToolName, ctx: MemoryWriteInvocationV1, idempotencyKey: string, candidate: MemoryMutationPreimageV1,
  ): Promise<{ binding: MemoryMutationBindingV1<unknown>; adopted: MemoryMutationPreimageV1; reconciling: boolean } | { failure: ToolResultV1<never> }> {
    let binding: MemoryMutationBindingV1<unknown>;
    try {
      const reserved = await host!.reservation.reserveOrLoad(extractMemoryMutationLookupKeyV1(candidate), candidate);
      if (!reserved.ok) {
        const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: reserved.error_code, invocationAuthorized: true, targetAuthorized: true }).structuredContent;
        await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: reserved.error_code });
        return { failure: out };
      }
      binding = reserved.value;
    } catch {
      const out = failure(tool, ctx, 'STORE_UNAVAILABLE');
      await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: 'STORE_UNAVAILABLE' });
      return { failure: out };
    }
    // Same digest: the binding already holds this operation (created now or
    // recorded earlier) — adopt it. Otherwise the submitted agent values
    // decide between retry-with-host-defaults (adopt stored) and conflict.
    const candidateDigest = computeMemoryMutationOperationDigestV1(candidate);
    if (!candidateDigest.ok || binding.operation_digest !== candidateDigest.value.operation_digest) {
      if (candidateDigest.ok && submittedEqual(candidate.effective_input, binding.preimage.effective_input)) {
        return decideStored(tool, ctx, idempotencyKey, binding);
      }
      const out = failure(tool, ctx, 'DIGEST_CONFLICT');
      await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: 'DIGEST_CONFLICT' });
      return { failure: out };
    }
    return decideStored(tool, ctx, idempotencyKey, binding, candidate);
  }

  async function decideStored(
    tool: MutatingMemoryToolName, ctx: MemoryWriteInvocationV1, idempotencyKey: string, binding: MemoryMutationBindingV1<unknown>, candidate?: MemoryMutationPreimageV1,
  ): Promise<{ binding: MemoryMutationBindingV1<unknown>; adopted: MemoryMutationPreimageV1; reconciling: boolean } | { failure: ToolResultV1<never> }> {
    const adopted = binding.preimage;
    const versions = projectMemoryMutationPolicyVersionsV1(adopted.effective_input);
    const active = tool === 'engram_memory_capture' ? await host!.policy.capturePolicyVersion()
      : tool === 'engram_memory_request_admission' ? await host!.policy.admissionPolicyVersion() : undefined;
    const evaluation = evaluatePrincipalScopedMutationLookupV1([binding], {
      preimage: adopted, callerAuthorized: true as unknown as boolean, targetAuthorized: true as unknown as boolean,
      ...(active === undefined ? {} : { active_domain_policy_version: active }),
    });
    void versions;
    void candidate;
    switch (evaluation.decision) {
      case 'execute_new':
        return { binding, adopted, reconciling: false };
      case 'resume_incomplete':
        return { binding: evaluation.existing_record as MemoryMutationBindingV1<unknown>, adopted, reconciling: false };
      case 'replay_completed': {
        const replayed = await refreshReplay(tool, evaluation.output as Record<string, unknown>, binding);
        const checked = tool === 'engram_memory_capture' ? validateCaptureOutputV1(replayed)
          : tool === 'engram_memory_request_admission' ? validateRequestAdmissionOutputV1(replayed)
          : tool === 'engram_memory_withdraw' ? validateWithdrawOutputV1(replayed) : validateForgetOutputV1(replayed);
        if (!checked.ok) {
          const out = failure(tool, ctx, 'STORE_UNAVAILABLE');
          await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: 'STORE_UNAVAILABLE' });
          return { failure: out };
        }
        await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'replay', reservation_ref: binding.preimage.reservation_ref });
        return { failure: createToolSuccessEnvelope(replayed, ctx.auditId).structuredContent as ToolResultV1<never> };
      }
      case 'reconcile_canonical':
        return { binding: evaluation.existing_record as MemoryMutationBindingV1<unknown>, adopted, reconciling: true };
      case 'reject': {
        const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: evaluation.error_code, invocationAuthorized: true, targetAuthorized: true }).structuredContent;
        await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: evaluation.error_code });
        return { failure: out };
      }
    }
  }

  function markReplayed(tool: MutatingMemoryToolName, output: Record<string, unknown>): Record<string, unknown> {
    return tool === 'engram_memory_capture' ? { ...output, status: 'duplicate_exact' } : { ...output, replayed: true };
  }

  /** Volatile attestations (custody, coverage) are re-verified on every replay; only the canonical receipt is stable. */
  async function refreshReplay(tool: MutatingMemoryToolName, output: Record<string, unknown>, binding: MemoryMutationBindingV1<unknown>): Promise<Record<string, unknown>> {
    if (tool === 'engram_memory_withdraw') {
      const target = binding.preimage.target;
      const candidateId = target.kind === 'candidate' ? target.candidate_id : '';
      const destroyed = await host!.keyCustody.confirmDestroyed(candidateId).catch(() => false);
      return { ...output, replayed: true, key_destruction: destroyed === true ? 'complete' : 'pending' };
    }
    if (tool === 'engram_memory_forget') {
      const receipt = output.receipt as { cursor?: Cursor } | undefined;
      const coverage = receipt?.cursor === undefined
        ? { complete: false as boolean, coverage_digest: undefined }
        : await host!.coverage.verify(receipt.cursor).catch(() => ({ complete: false as boolean, coverage_digest: undefined }));
      const { coverage_receipt_digest: _dropped, ...rest } = output;
      return {
        ...rest, replayed: true,
        projection_invalidation: coverage.complete === true ? 'complete' : 'pending',
        ...(coverage.complete === true && coverage.coverage_digest !== undefined ? { coverage_receipt_digest: coverage.coverage_digest } : {}),
      };
    }
    return markReplayed(tool, output);
  }

  async function confirmIfRequired(tool: WriteTool, ctx: MemoryWriteInvocationV1, idempotencyKey: string, binding: MemoryMutationBindingV1<unknown>, digest: Digest, targetRef: string): Promise<ToolResultV1<never> | undefined> {
    if (tool !== 'engram_memory_withdraw' && tool !== 'engram_memory_forget') return undefined;
    if (binding.confirmation_ref !== undefined) return undefined;
    let approved = false;
    try {
      approved = await host!.confirm({ capability: tool, target_ref: targetRef, operation_digest: digest, reservation_ref: binding.preimage.reservation_ref }) === true;
    } catch { approved = false; }
    if (approved !== true) {
      const out = failure(tool, ctx, 'gate_failed');
      await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: 'gate_failed' });
      return out;
    }
    try {
      const attached = await host!.reservation.attachConfirmation(binding.preimage.reservation_ref, `confirmation:${binding.preimage.reservation_ref}`, digest);
      if (!attached.ok) {
        const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: attached.error_code, invocationAuthorized: true, targetAuthorized: true }).structuredContent;
        await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: attached.error_code });
        return out;
      }
    } catch {
      const out = failure(tool, ctx, 'STORE_UNAVAILABLE');
      await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: 'STORE_UNAVAILABLE' });
      return out;
    }
    return undefined;
  }

  /** Best-effort canonical reconciliation right after the engine commit, before completion is recorded. Never fails the call: the effect is already committed. */
  async function reconcile(ctx: MemoryWriteInvocationV1, idempotencyKey: string, binding: MemoryMutationBindingV1<unknown>, replayRef: string): Promise<void> {
    try {
      await host!.reservation.reconcileCanonicalOutcome(binding.preimage.reservation_ref, replayRef);
    } catch { /* the canonical effect is already committed */ }
    await audit(ctx, { tool: 'reconcile', idempotency_key: idempotencyKey, decision: 'reconcile', reservation_ref: binding.preimage.reservation_ref });
  }

  async function claim(tool: EngramMemoryToolName, ctx: MemoryWriteInvocationV1, idempotencyKey: string, binding: MemoryMutationBindingV1<unknown>): Promise<ToolResultV1<never> | undefined> {
    try {
      const claimed = await host!.reservation.claimFencedExecution(binding.preimage.reservation_ref, ctx.generation);
      if (!claimed.ok) {
        const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: claimed.error_code, invocationAuthorized: true, targetAuthorized: true }).structuredContent;
        await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: claimed.error_code });
        return out;
      }
    } catch {
      const out = mapUnexpectedDependencyExceptionToPublic({ tool, commitPhaseEntered: false, auditId: ctx.auditId }).structuredContent;
      await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: 'STORE_UNAVAILABLE' });
      return out;
    }
    return undefined;
  }

  async function complete<T>(tool: EngramMemoryToolName, ctx: MemoryWriteInvocationV1, idempotencyKey: string, binding: MemoryMutationBindingV1<unknown>, output: T, validate: (value: unknown) => { ok: boolean }): Promise<ToolResultV1<T>> {
    if (!validate(output).ok) {
      await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: 'STORE_UNAVAILABLE' });
      return mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: 'STORE_UNAVAILABLE', invocationAuthorized: true, targetAuthorized: true }).structuredContent as ToolResultV1<T>;
    }
    try {
      await host!.reservation.recordCompletion(binding.preimage.reservation_ref, output);
    } catch { /* the canonical effect and its output are already committed */ }
    await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'complete', reservation_ref: binding.preimage.reservation_ref });
    return createToolSuccessEnvelope(output, ctx.auditId).structuredContent as ToolResultV1<T>;
  }

  async function capture(input: unknown, invocation: MemoryWriteInvocationV1): Promise<ToolResultV1<CaptureOutputV1>> {
    const tool = 'engram_memory_capture';
    const ctx = await context(invocation, tool);
    const checked = validateCaptureInputV1(input);
    if (!checked.ok) return failure(tool, ctx, 'INVALID_SCHEMA');
    const arg = checked.value as CaptureInputV1;
    const error = check(ctx);
    if (error) return failure(tool, ctx, error);
    if (await host!.authorize(structuredClone(ctx), tool, arg.payload.purpose_ref) !== true) return failure(tool, ctx, 'UNAUTHORIZED');
    const now = host!.clock.now();
    const retention = resolveCaptureRetentionPolicyV1({ captured_at: now, host_policy: host!.policy.retention, caller_retention: arg.payload.retention });
    if (!retention.ok) {
      const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: retention.error_code, invocationAuthorized: true, targetAuthorized: true }).structuredContent;
      await audit(ctx, { tool, idempotency_key: arg.idempotency_key, decision: 'refuse', error_code: retention.error_code });
      return out as ToolResultV1<CaptureOutputV1>;
    }
    const reconciliation = resolveCaptureReconciliationConsentV1({ host_policy: host!.policy.reconciliation, caller_reconciliation: arg.payload.reconciliation });
    if (!reconciliation.ok) {
      const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: reconciliation.error_code, invocationAuthorized: true, targetAuthorized: true }).structuredContent;
      await audit(ctx, { tool, idempotency_key: arg.idempotency_key, decision: 'refuse', error_code: reconciliation.error_code });
      return out as ToolResultV1<CaptureOutputV1>;
    }
    const sourceOrder = await host!.policy.nextSourceOrder();
    const reserved = await reserve(tool, ctx, {
      tool_name: tool, payload: { ...arg.payload, scope_ref: ctx.scope_ref, retention: retention.value, reconciliation: reconciliation.value },
      evidence: arg.evidence, capture_policy_version: await host!.policy.capturePolicyVersion(),
    }, { kind: 'capture_source', source_ref: sourceOrder.source_ref, sequence: sourceOrder.sequence }, arg.idempotency_key);
    if ('failure' in reserved) return reserved.failure as ToolResultV1<CaptureOutputV1>;
    const decided = await decide(tool, ctx, arg.idempotency_key, reserved.preimage);
    if ('failure' in decided) return decided.failure as ToolResultV1<CaptureOutputV1>;
    const claimed = await claim(tool, ctx, arg.idempotency_key, decided.binding);
    if (claimed) return claimed as ToolResultV1<CaptureOutputV1>;
    const effective = decided.adopted.effective_input;
    if (effective.tool_name !== 'engram_memory_capture') return failure(tool, ctx, 'STORE_UNAVAILABLE');
    let ack;
    try {
      ack = await facets.engine.capture({
        schema_version: 2, idempotency_key: arg.idempotency_key, payload: effective.payload, evidence: effective.evidence,
        authorization: ctx.authorization, source_order: { source_ref: sourceOrder.source_ref, sequence: sourceOrder.sequence },
        deadline_at: ctx.deadline_at, cancellation_ref: `cancel:${tool}:${arg.idempotency_key}`,
      });
    } catch {
      return mapUnexpectedDependencyExceptionToPublic({ tool, commitPhaseEntered: true, auditId: ctx.auditId }).structuredContent as ToolResultV1<CaptureOutputV1>;
    }
    if (!ack.ok) return neutralFailure(tool, ctx, ack.error) as ToolResultV1<CaptureOutputV1>;
    if (ack.value.status !== 'committed_pending' && ack.value.status !== 'duplicate_exact'
      || ack.value.candidate_id === undefined || ack.value.cursor === undefined || ack.value.transaction_receipt_digest === undefined) {
      return failure(tool, ctx, 'STORE_UNAVAILABLE');
    }
    const output: CaptureOutputV1 = {
      status: ack.value.status, candidate_id: ack.value.candidate_id,
      ...(ack.value.record_digest === undefined ? {} : { record_digest: ack.value.record_digest }),
      cursor: ack.value.cursor, transaction_receipt_digest: ack.value.transaction_receipt_digest,
    };
    await reconcile(ctx, arg.idempotency_key, decided.binding, ack.value.transaction_receipt_digest);
    return complete(tool, ctx, arg.idempotency_key, decided.binding, output, validateCaptureOutputV1);
  }

  async function requestAdmission(input: unknown, invocation: MemoryWriteInvocationV1): Promise<ToolResultV1<RequestAdmissionOutputV1>> {
    const tool = 'engram_memory_request_admission';
    const ctx = await context(invocation, tool);
    const checked = validateRequestAdmissionInputV1(input);
    if (!checked.ok) return failure(tool, ctx, 'INVALID_SCHEMA');
    const arg = checked.value as RequestAdmissionInputV1;
    const error = check(ctx);
    if (error) return failure(tool, ctx, error);
    if (await host!.authorize(structuredClone(ctx), tool, '') !== true) return failure(tool, ctx, 'UNAUTHORIZED');
    const reserved = await reserve(tool, ctx, {
      tool_name: tool, candidate_id: arg.candidate_id, admission_policy_version: await host!.policy.admissionPolicyVersion(),
    }, { kind: 'candidate', candidate_id: arg.candidate_id }, arg.idempotency_key);
    if ('failure' in reserved) return reserved.failure as ToolResultV1<RequestAdmissionOutputV1>;
    const decided = await decide(tool, ctx, arg.idempotency_key, reserved.preimage);
    if ('failure' in decided) return decided.failure as ToolResultV1<RequestAdmissionOutputV1>;
    const claimed = await claim(tool, ctx, arg.idempotency_key, decided.binding);
    if (claimed) return claimed as ToolResultV1<RequestAdmissionOutputV1>;
    let outcome;
    try {
      outcome = await facets.engine.requestAdmission({ candidate_id: arg.candidate_id, authorization: ctx.authorization, deadline_at: ctx.deadline_at });
    } catch {
      return mapUnexpectedDependencyExceptionToPublic({ tool, commitPhaseEntered: true, auditId: ctx.auditId }).structuredContent as ToolResultV1<RequestAdmissionOutputV1>;
    }
    if (!outcome.ok) {
      if ((outcome.error.code === 'ILLEGAL_TRANSITION' || outcome.error.code === 'ALREADY_TERMINAL')) {
        const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: 'MUTATION_OUTCOME_UNKNOWN', invocationAuthorized: true, targetAuthorized: true }).structuredContent;
        await audit(ctx, { tool, idempotency_key: arg.idempotency_key, decision: 'unknown', error_code: 'MUTATION_OUTCOME_UNKNOWN' });
        return out as ToolResultV1<RequestAdmissionOutputV1>;
      }
      return neutralFailure(tool, ctx, outcome.error) as ToolResultV1<RequestAdmissionOutputV1>;
    }
    await reconcile(ctx, arg.idempotency_key, decided.binding, outcome.value.transaction_receipt_digest);
    return complete(tool, ctx, arg.idempotency_key, decided.binding, { outcome: outcome.value, replayed: decided.reconciling }, validateRequestAdmissionOutputV1);
  }

  async function withdraw(input: unknown, invocation: MemoryWriteInvocationV1): Promise<ToolResultV1<WithdrawOutputV1>> {
    const tool = 'engram_memory_withdraw';
    const ctx = await context(invocation, tool);
    const checked = validateWithdrawInputV1(input);
    if (!checked.ok) return failure(tool, ctx, 'INVALID_SCHEMA');
    const arg = checked.value as WithdrawInputV1;
    const error = check(ctx);
    if (error) return failure(tool, ctx, error);
    if (await host!.authorize(structuredClone(ctx), tool, '') !== true) return failure(tool, ctx, 'UNAUTHORIZED');
    const anchor = createHostLifecycleEventAnchorV1({
      occurred_at: host!.clock.now(), kind_ref: host!.policy.anchorKindRef,
      provenance_ref: ctx.auditId, provenance_digest: await host!.policy.provenanceDigest(),
    });
    if (!anchor.ok) {
      const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: anchor.error_code, invocationAuthorized: true, targetAuthorized: true }).structuredContent;
      await audit(ctx, { tool, idempotency_key: arg.idempotency_key, decision: 'refuse', error_code: anchor.error_code });
      return out as ToolResultV1<WithdrawOutputV1>;
    }
    const reserved = await reserve(tool, ctx, {
      tool_name: tool, candidate_id: arg.candidate_id, reason_ref: arg.reason_ref,
      event_id: `event:${tool}:${arg.idempotency_key}`, event_anchor: anchor.value,
    }, { kind: 'candidate', candidate_id: arg.candidate_id }, arg.idempotency_key);
    if ('failure' in reserved) return reserved.failure as ToolResultV1<WithdrawOutputV1>;
    const decided = await decide(tool, ctx, arg.idempotency_key, reserved.preimage);
    if ('failure' in decided) return decided.failure as ToolResultV1<WithdrawOutputV1>;
    const adopted = decided.adopted.effective_input;
    if (adopted.tool_name !== 'engram_memory_withdraw') return failure(tool, ctx, 'STORE_UNAVAILABLE');
    const confirmed = await confirmIfRequired(tool, ctx, arg.idempotency_key, decided.binding, decided.binding.operation_digest, arg.candidate_id);
    if (confirmed) return confirmed as ToolResultV1<WithdrawOutputV1>;
    const claimed = await claim(tool, ctx, arg.idempotency_key, decided.binding);
    if (claimed) return claimed as ToolResultV1<WithdrawOutputV1>;
    let receipt;
    try {
      receipt = await facets.engine.transition({
        operation: 'withdraw', candidate_id: arg.candidate_id, event_id: adopted.event_id,
        reason_ref: adopted.reason_ref, event_anchor: adopted.event_anchor, authorization: ctx.authorization, deadline_at: ctx.deadline_at,
      });
    } catch {
      return mapUnexpectedDependencyExceptionToPublic({ tool, commitPhaseEntered: true, auditId: ctx.auditId }).structuredContent as ToolResultV1<WithdrawOutputV1>;
    }
    if (!receipt.ok) {
      if (receipt.error.code === 'ILLEGAL_TRANSITION' || receipt.error.code === 'ALREADY_TERMINAL') {
        const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: 'MUTATION_OUTCOME_UNKNOWN', invocationAuthorized: true, targetAuthorized: true }).structuredContent;
        await audit(ctx, { tool, idempotency_key: arg.idempotency_key, decision: 'unknown', error_code: 'MUTATION_OUTCOME_UNKNOWN' });
        return out as ToolResultV1<WithdrawOutputV1>;
      }
      return neutralFailure(tool, ctx, receipt.error) as ToolResultV1<WithdrawOutputV1>;
    }
    if (receipt.value.operation !== 'withdraw' || receipt.value.from_state !== 'pending' || receipt.value.to_state !== 'withdrawn') {
      return failure(tool, ctx, 'STORE_UNAVAILABLE');
    }
    const destroyed = await host!.keyCustody.confirmDestroyed(arg.candidate_id).catch(() => false);
    await reconcile(ctx, arg.idempotency_key, decided.binding, receipt.value.transaction_receipt_digest);
    return complete(tool, ctx, arg.idempotency_key, decided.binding, {
      receipt: receipt.value, replayed: decided.reconciling, key_destruction: destroyed === true ? 'complete' : 'pending',
    }, validateWithdrawOutputV1);
  }

  async function forget(input: unknown, invocation: MemoryWriteInvocationV1): Promise<ToolResultV1<ForgetOutputV1>> {
    const tool = 'engram_memory_forget';
    const ctx = await context(invocation, tool);
    const checked = validateForgetInputV1(input);
    if (!checked.ok) return failure(tool, ctx, 'INVALID_SCHEMA');
    const arg = checked.value as ForgetInputV1;
    const error = check(ctx);
    if (error) return failure(tool, ctx, error);
    if (await host!.authorize(structuredClone(ctx), tool, '') !== true) return failure(tool, ctx, 'UNAUTHORIZED');
    const anchor = createHostLifecycleEventAnchorV1({
      occurred_at: host!.clock.now(), kind_ref: host!.policy.anchorKindRef,
      provenance_ref: ctx.auditId, provenance_digest: await host!.policy.provenanceDigest(),
    });
    if (!anchor.ok) {
      const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: anchor.error_code, invocationAuthorized: true, targetAuthorized: true }).structuredContent;
      await audit(ctx, { tool, idempotency_key: arg.idempotency_key, decision: 'refuse', error_code: anchor.error_code });
      return out as ToolResultV1<ForgetOutputV1>;
    }
    const reserved = await reserve(tool, ctx, {
      tool_name: tool, record_id: arg.record_id, reason_ref: arg.reason_ref,
      event_id: `event:${tool}:${arg.idempotency_key}`, event_anchor: anchor.value,
    }, { kind: 'record', record_id: arg.record_id }, arg.idempotency_key);
    if ('failure' in reserved) return reserved.failure as ToolResultV1<ForgetOutputV1>;
    const decided = await decide(tool, ctx, arg.idempotency_key, reserved.preimage);
    if ('failure' in decided) return decided.failure as ToolResultV1<ForgetOutputV1>;
    const adopted = decided.adopted.effective_input;
    if (adopted.tool_name !== 'engram_memory_forget') return failure(tool, ctx, 'STORE_UNAVAILABLE');
    const confirmed = await confirmIfRequired(tool, ctx, arg.idempotency_key, decided.binding, decided.binding.operation_digest, arg.record_id);
    if (confirmed) return confirmed as ToolResultV1<ForgetOutputV1>;
    const claimed = await claim(tool, ctx, arg.idempotency_key, decided.binding);
    if (claimed) return claimed as ToolResultV1<ForgetOutputV1>;
    let receipt;
    try {
      receipt = await facets.engine.transition({
        operation: 'tombstone', record_id: arg.record_id, event_id: adopted.event_id,
        reason_ref: adopted.reason_ref, event_anchor: adopted.event_anchor, authorization: ctx.authorization, deadline_at: ctx.deadline_at,
      });
    } catch {
      return mapUnexpectedDependencyExceptionToPublic({ tool, commitPhaseEntered: true, auditId: ctx.auditId }).structuredContent as ToolResultV1<ForgetOutputV1>;
    }
    if (!receipt.ok) {
      if (receipt.error.code === 'ILLEGAL_TRANSITION' || receipt.error.code === 'ALREADY_TERMINAL') {
        const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: 'MUTATION_OUTCOME_UNKNOWN', invocationAuthorized: true, targetAuthorized: true }).structuredContent;
        await audit(ctx, { tool, idempotency_key: arg.idempotency_key, decision: 'unknown', error_code: 'MUTATION_OUTCOME_UNKNOWN' });
        return out as ToolResultV1<ForgetOutputV1>;
      }
      return neutralFailure(tool, ctx, receipt.error) as ToolResultV1<ForgetOutputV1>;
    }
    if (receipt.value.operation !== 'tombstone' || receipt.value.to_state !== 'tombstoned') {
      return failure(tool, ctx, 'STORE_UNAVAILABLE');
    }
    const coverage = await host!.coverage.verify(receipt.value.cursor).catch(() => ({ complete: false as boolean, coverage_digest: undefined }));
    await reconcile(ctx, arg.idempotency_key, decided.binding, receipt.value.transaction_receipt_digest);
    return complete(tool, ctx, arg.idempotency_key, decided.binding, {
      receipt: receipt.value, replayed: decided.reconciling,
      projection_invalidation: coverage.complete === true ? 'complete' : 'pending',
      ...(coverage.complete === true && coverage.coverage_digest !== undefined ? { coverage_receipt_digest: coverage.coverage_digest } : {}),
    }, validateForgetOutputV1);
  }

  return { capture, requestAdmission, withdraw, forget };
}

export type {
  CaptureInputV1, CaptureOutputV1, ForgetInputV1, ForgetOutputV1,
  RequestAdmissionInputV1, RequestAdmissionOutputV1, WithdrawInputV1, WithdrawOutputV1,
};
