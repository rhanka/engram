import { createHash } from 'node:crypto';
import type { GuardedMemoryPortV2, MemoryFirstEffectGuardV1 } from '../../engram-memory/dist/engine.js';
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
  engine: GuardedMemoryPortV2;
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

  /**
   * Closed submitted-domain comparison (M5 l.602, l.686): caller-originated
   * values decide between retry and conflict; host-resolved defaults never do.
   * A changed target, tool or caller domain value (including an explicitly
   * supplied expiry or reconciliation family) conflicts. An omitted expiry or
   * family list reuses the persisted resolution instead of conflicting with
   * its own clock-advanced recomputation, as do the once-allocated source
   * order and policy versions. Lifecycle event identity/anchor is
   * host-derived (`event:<tool>:<key>`, current clock) and always reused.
   */
  function submittedEqual(
    left: EffectiveMemoryMutationInputV1, right: EffectiveMemoryMutationInputV1,
    submitted?: { retention?: { derivative_rule?: string; expires_at?: string }; reconciliation?: { family_refs?: ReadonlyArray<string> } },
  ): boolean {
    if (left.tool_name !== right.tool_name) return false;
    switch (left.tool_name) {
      case 'engram_memory_capture': {
        if (right.tool_name !== 'engram_memory_capture') return false;
        const { retention: _leftRetention, reconciliation: _leftReconciliation, ...leftRest } = left.payload;
        const { retention: _rightRetention, reconciliation: _rightReconciliation, ...rightRest } = right.payload;
        if (stable(leftRest) !== stable(rightRest)) return false;
        if (stable(left.evidence) !== stable(right.evidence)) return false;
        const storedRetention = _rightRetention as { derivative_rule?: unknown; expires_at?: unknown } | undefined;
        const callerRetention = submitted?.retention ?? {};
        if ((callerRetention.derivative_rule ?? 'make-ineligible') !== storedRetention?.derivative_rule) return false;
        if (callerRetention.expires_at !== undefined && callerRetention.expires_at !== storedRetention?.expires_at) return false;
        const storedFamilies = (_rightReconciliation as { family_refs?: unknown } | undefined)?.family_refs ?? [];
        const callerFamilies = submitted?.reconciliation?.family_refs ?? [];
        if (stable(callerFamilies) !== stable(storedFamilies)) return false;
        return true;
      }
      case 'engram_memory_request_admission':
        return right.tool_name === 'engram_memory_request_admission' && left.candidate_id === right.candidate_id;
      case 'engram_memory_withdraw':
        return right.tool_name === 'engram_memory_withdraw' && left.candidate_id === right.candidate_id && left.reason_ref === right.reason_ref;
      case 'engram_memory_forget':
        return right.tool_name === 'engram_memory_forget' && left.record_id === right.record_id && left.reason_ref === right.reason_ref;
    }
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

  /**
   * M4 l.521 + M5 l.710: `execute` claims the fence and performs the first
   * canonical effect; `recover` re-drives the canonical engine with the
   * reservation's stored inputs instead of serving a cached output. Recovery
   * revalidates the current neutral authority (a revoked caller is refused,
   * never replayed) and replays the durable canonical proof — a committed
   * result survives a lost acknowledgement or an unrecorded completion, and
   * an uncommitted reservation resumes without a second effect.
   */
  type DecidedMutationV1 =
    | { kind: 'failure'; failure: ToolResultV1<never> }
    | { kind: 'execute'; binding: MemoryMutationBindingV1<unknown> }
    | { kind: 'recover'; binding: MemoryMutationBindingV1<unknown> };

  async function decide(
    tool: MutatingMemoryToolName, ctx: MemoryWriteInvocationV1, idempotencyKey: string, candidate: MemoryMutationPreimageV1,
    submitted?: { retention?: { derivative_rule?: string; expires_at?: string }; reconciliation?: { family_refs?: ReadonlyArray<string> } },
  ): Promise<DecidedMutationV1> {
    let binding: MemoryMutationBindingV1<unknown>;
    try {
      const reserved = await host!.reservation.reserveOrLoad(extractMemoryMutationLookupKeyV1(candidate), candidate);
      if (!reserved.ok) {
        const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: reserved.error_code, invocationAuthorized: true, targetAuthorized: true }).structuredContent;
        await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: reserved.error_code });
        return { kind: 'failure', failure: out };
      }
      binding = reserved.value;
    } catch {
      const out = failure(tool, ctx, 'STORE_UNAVAILABLE');
      await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: 'STORE_UNAVAILABLE' });
      return { kind: 'failure', failure: out };
    }
    // Same digest: the binding already holds this operation (created now or
    // recorded earlier). Otherwise the caller-originated submitted values
    // decide between retry-with-persisted-resolution (adopt stored) and
    // conflict.
    const candidateDigest = computeMemoryMutationOperationDigestV1(candidate);
    if (!candidateDigest.ok || binding.operation_digest !== candidateDigest.value.operation_digest) {
      if (candidateDigest.ok && submittedEqual(candidate.effective_input, binding.preimage.effective_input, submitted)) {
        return decideStored(tool, ctx, idempotencyKey, binding);
      }
      const out = failure(tool, ctx, 'DIGEST_CONFLICT');
      await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: 'DIGEST_CONFLICT' });
      return { kind: 'failure', failure: out };
    }
    return decideStored(tool, ctx, idempotencyKey, binding);
  }

  async function decideStored(
    tool: MutatingMemoryToolName, ctx: MemoryWriteInvocationV1, idempotencyKey: string, binding: MemoryMutationBindingV1<unknown>,
  ): Promise<DecidedMutationV1> {
    const adopted = binding.preimage;
    const active = tool === 'engram_memory_capture' ? await host!.policy.capturePolicyVersion()
      : tool === 'engram_memory_request_admission' ? await host!.policy.admissionPolicyVersion() : undefined;
    const evaluation = evaluatePrincipalScopedMutationLookupV1([binding], {
      preimage: adopted, callerAuthorized: true as unknown as boolean, targetAuthorized: true as unknown as boolean,
      ...(active === undefined ? {} : { active_domain_policy_version: active }),
    });
    switch (evaluation.decision) {
      case 'execute_new':
        return { kind: 'execute', binding };
      case 'resume_incomplete':
        return { kind: 'execute', binding: evaluation.existing_record as MemoryMutationBindingV1<unknown> };
      case 'replay_completed':
      case 'reconcile_canonical':
        await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'replay', reservation_ref: binding.preimage.reservation_ref });
        return { kind: 'recover', binding: evaluation.decision === 'reconcile_canonical'
          ? evaluation.existing_record as MemoryMutationBindingV1<unknown> : binding };
      case 'reject': {
        if (evaluation.error_code === 'MUTATION_OUTCOME_UNKNOWN') {
          await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'recover', reservation_ref: binding.preimage.reservation_ref });
          return { kind: 'recover', binding };
        }
        const out = mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: evaluation.error_code, invocationAuthorized: true, targetAuthorized: true }).structuredContent;
        await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: evaluation.error_code });
        return { kind: 'failure', failure: out };
      }
    }
  }

  async function confirmIfRequired(tool: WriteTool, ctx: MemoryWriteInvocationV1, idempotencyKey: string, binding: MemoryMutationBindingV1<unknown>, digest: Digest, targetRef: string): Promise<ToolResultV1<never> | undefined> {
    if (tool !== 'engram_memory_withdraw' && tool !== 'engram_memory_forget') return undefined;
    // M4 l.563-567: every pre-effect attempt requires the CURRENT verifier
    // verdict. An attached confirmation is durable approval evidence, never a
    // substitute: after expiry or a session change the verifier refuses and
    // the uncommitted reservation cannot execute.
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

  /**
   * Canonical reconciliation right after the engine commit, before completion
   * is recorded (M5 l.708, l.744: completion requires the canonical replay
   * reference, never the reverse). A failed reconciliation never masks the
   * committed effect: the call still succeeds and the same-key retry recovers
   * through the canonical proof.
   */
  async function reconcile(ctx: MemoryWriteInvocationV1, idempotencyKey: string, binding: MemoryMutationBindingV1<unknown>, replayRef: string): Promise<boolean> {
    try {
      const reconciled = await host!.reservation.reconcileCanonicalOutcome(binding.preimage.reservation_ref, replayRef);
      if (!reconciled.ok) {
        await audit(ctx, { tool: 'reconcile', idempotency_key: idempotencyKey, decision: 'reconcile', reservation_ref: binding.preimage.reservation_ref, error_code: reconciled.error_code });
        return false;
      }
    } catch {
      await audit(ctx, { tool: 'reconcile', idempotency_key: idempotencyKey, decision: 'reconcile', reservation_ref: binding.preimage.reservation_ref, error_code: 'STORE_UNAVAILABLE' });
      return false;
    }
    await audit(ctx, { tool: 'reconcile', idempotency_key: idempotencyKey, decision: 'reconcile', reservation_ref: binding.preimage.reservation_ref });
    return true;
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

  async function withFirstEffectGuard<T>(
    tool: WriteTool, ctx: MemoryWriteInvocationV1, idempotencyKey: string,
    decided: Exclude<DecidedMutationV1, { kind: 'failure' }>,
    perform: (guard: MemoryFirstEffectGuardV1) => Promise<T>, targetRef?: string,
  ): Promise<{ result: T } | { failure: ToolResultV1<never> }> {
    let refused: ToolResultV1<never> | undefined;
    let claimed = decided.kind === 'recover';
    const result = await perform(async () => {
      // M4 l.587 / M5 l.702,730: this runs ONLY after canonical proof
      // lookup found no committed result, including an unknown host outcome.
      const versions = decided.binding.policy_versions;
      const stale = versions.tool_name === 'engram_memory_capture'
        ? versions.capture_policy_version !== await host!.policy.capturePolicyVersion()
        : versions.tool_name === 'engram_memory_request_admission'
          ? versions.admission_policy_version !== await host!.policy.admissionPolicyVersion() : false;
      if (stale) {
        refused = failure(tool, ctx, 'POLICY_STALE');
        await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: 'POLICY_STALE' });
        return false;
      }
      if (targetRef !== undefined) refused = await confirmIfRequired(tool, ctx, idempotencyKey, decided.binding, decided.binding.operation_digest, targetRef);
      if (refused === undefined && !claimed) {
        refused = await claim(tool, ctx, idempotencyKey, decided.binding);
        claimed = refused === undefined;
      }
      return refused === undefined;
    });
    return refused === undefined ? { result } : { failure: refused };
  }

  async function complete<T>(tool: EngramMemoryToolName, ctx: MemoryWriteInvocationV1, idempotencyKey: string, binding: MemoryMutationBindingV1<unknown>, output: T, validate: (value: unknown) => { ok: boolean }): Promise<ToolResultV1<T>> {
    if (!validate(output).ok) {
      await audit(ctx, { tool, idempotency_key: idempotencyKey, decision: 'refuse', error_code: 'STORE_UNAVAILABLE' });
      return mapNeutralMemoryErrorToPublic({ tool, auditId: ctx.auditId, code: 'STORE_UNAVAILABLE', invocationAuthorized: true, targetAuthorized: true }).structuredContent as ToolResultV1<T>;
    }
    // M5 l.708: the port refuses a completion without a reconciled canonical
    // replay reference. An unrecorded completion never masks the committed
    // effect: the outcome was just proven by the engine and the same-key
    // retry recovers it (M5 l.710).
    let recorded = false;
    try {
      recorded = (await host!.reservation.recordCompletion(binding.preimage.reservation_ref, output)).ok === true;
    } catch { recorded = false; }
    await audit(ctx, {
      tool, idempotency_key: idempotencyKey, decision: 'complete', reservation_ref: binding.preimage.reservation_ref,
      ...(recorded ? {} : { completion_recorded: false }),
    });
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
    const decided = await decide(tool, ctx, arg.idempotency_key, reserved.preimage, {
      retention: arg.payload.retention, reconciliation: arg.payload.reconciliation,
    });
    if (decided.kind === 'failure') return decided.failure as ToolResultV1<CaptureOutputV1>;
    // M5 l.596: the canonical effect reuses the reservation's once-allocated
    // (source_ref, sequence, idempotency_key) — never a freshly allocated
    // sequence over a reservation bound to an earlier one.
    const stored = decided.binding.preimage;
    const effective = stored.effective_input;
    if (effective.tool_name !== 'engram_memory_capture') return failure(tool, ctx, 'STORE_UNAVAILABLE');
    const target = stored.target;
    if (target.kind !== 'capture_source') return failure(tool, ctx, 'STORE_UNAVAILABLE');
    let ack;
    try {
      const guarded = await withFirstEffectGuard(tool, ctx, arg.idempotency_key, decided, guard => facets.engine.capture({
        schema_version: 2, idempotency_key: stored.idempotency_key, payload: effective.payload, evidence: effective.evidence,
        authorization: ctx.authorization, source_order: { source_ref: target.source_ref, sequence: target.sequence },
        deadline_at: ctx.deadline_at, cancellation_ref: `cancel:${tool}:${stored.idempotency_key}`,
      }, guard));
      if ('failure' in guarded) return guarded.failure as ToolResultV1<CaptureOutputV1>;
      ack = guarded.result;
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
    if (decided.kind === 'failure') return decided.failure as ToolResultV1<RequestAdmissionOutputV1>;
    const admitted = decided.binding.preimage.effective_input;
    if (admitted.tool_name !== 'engram_memory_request_admission') return failure(tool, ctx, 'STORE_UNAVAILABLE');
    let outcome;
    try {
      const guarded = await withFirstEffectGuard(tool, ctx, arg.idempotency_key, decided, guard => facets.engine.requestAdmission({ candidate_id: admitted.candidate_id, authorization: ctx.authorization, deadline_at: ctx.deadline_at }, guard));
      if ('failure' in guarded) return guarded.failure as ToolResultV1<RequestAdmissionOutputV1>;
      outcome = guarded.result;
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
    return complete(tool, ctx, arg.idempotency_key, decided.binding, { outcome: outcome.value, replayed: decided.kind === 'recover' }, validateRequestAdmissionOutputV1);
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
    if (decided.kind === 'failure') return decided.failure as ToolResultV1<WithdrawOutputV1>;
    const adopted = decided.binding.preimage.effective_input;
    if (adopted.tool_name !== 'engram_memory_withdraw') return failure(tool, ctx, 'STORE_UNAVAILABLE');
    let receipt;
    try {
      const guarded = await withFirstEffectGuard(tool, ctx, arg.idempotency_key, decided, guard => facets.engine.transition({
        operation: 'withdraw', candidate_id: adopted.candidate_id, event_id: adopted.event_id,
        reason_ref: adopted.reason_ref, event_anchor: adopted.event_anchor, authorization: ctx.authorization, deadline_at: ctx.deadline_at,
      }, guard), adopted.candidate_id);
      if ('failure' in guarded) return guarded.failure as ToolResultV1<WithdrawOutputV1>;
      receipt = guarded.result;
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
    // M5 l.708: the recorded canonical replay reference never flips. A
    // replay keeps the reconciled reference; only a reservation without one
    // adopts the replay proof's digest.
    const replayRef = decided.binding.canonical_replay_ref ?? receipt.value.transaction_receipt_digest;
    const committedReceipt = { ...receipt.value, transaction_receipt_digest: replayRef };
    const destroyed = await host!.keyCustody.confirmDestroyed(adopted.candidate_id).catch(() => false);
    await reconcile(ctx, arg.idempotency_key, decided.binding, replayRef);
    return complete(tool, ctx, arg.idempotency_key, decided.binding, {
      receipt: committedReceipt, replayed: decided.kind === 'recover', key_destruction: destroyed === true ? 'complete' : 'pending',
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
    if (decided.kind === 'failure') return decided.failure as ToolResultV1<ForgetOutputV1>;
    const adopted = decided.binding.preimage.effective_input;
    if (adopted.tool_name !== 'engram_memory_forget') return failure(tool, ctx, 'STORE_UNAVAILABLE');
    let receipt;
    try {
      const guarded = await withFirstEffectGuard(tool, ctx, arg.idempotency_key, decided, guard => facets.engine.transition({
        operation: 'tombstone', record_id: adopted.record_id, event_id: adopted.event_id,
        reason_ref: adopted.reason_ref, event_anchor: adopted.event_anchor, authorization: ctx.authorization, deadline_at: ctx.deadline_at,
      }, guard), adopted.record_id);
      if ('failure' in guarded) return guarded.failure as ToolResultV1<ForgetOutputV1>;
      receipt = guarded.result;
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
    // M5 l.708: the recorded canonical replay reference never flips (see withdraw).
    const replayRef = decided.binding.canonical_replay_ref ?? receipt.value.transaction_receipt_digest;
    const committedReceipt = { ...receipt.value, transaction_receipt_digest: replayRef };
    const coverage = await host!.coverage.verify(committedReceipt.cursor).catch(() => ({ complete: false as boolean, coverage_digest: undefined }));
    await reconcile(ctx, arg.idempotency_key, decided.binding, replayRef);
    return complete(tool, ctx, arg.idempotency_key, decided.binding, {
      receipt: committedReceipt, replayed: decided.kind === 'recover',
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
