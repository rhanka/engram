/**
 * MCP-L4 provider adapter over the in-process memory facade.
 *
 * Optional public entry `@sentropic/engram/mcp-memory`. Importing this module
 * loads no provider, opens no store, performs no native build and bootstraps
 * no identity. The factory below requires explicit host-injected ports; every
 * host field (audit, scope, principal, store, policy, deadline, cancellation)
 * comes from the verified host invocation context, never from model arguments
 * and never from a fabricated default.
 *
 * The adapter implements the Sentropic P2 standard
 * `AppConnectorProviderAdapter` (`@sentropic/mcp-platform` 0.4.0) exactly:
 * no custom provider interface. Invocation selection goes through the
 * broker's compiled dispatch (`@sentropic/mcp-broker` 0.1.0); the trusted
 * mutation-envelope bindings are checked with the public broker guard and
 * preserved through dispatch. No code-graph tools. No sibling aliases. Six
 * tools only.
 */

import {
  MEMORY_CONNECTOR_ID as P2_CONNECTOR_ID,
  MEMORY_PROVIDER_ID as P2_PROVIDER_ID,
  MEMORY_TOOLS_PROFILE_ID as P2_TOOLS_PROFILE_ID,
  MEMORY_WIRE_PROFILE_ID as P2_WIRE_PROFILE_ID,
  MemoryTrustedContextError,
  isMemoryToolName,
  requireTrustedInvocationContext,
  type AppConnectorProviderAdapter,
  type MemoryToolName,
  type PublicMemoryErrorCode,
  type StpConnectorContext,
} from '@sentropic/mcp-platform/memory';
import {
  CompiledMemoryDispatch,
  MemoryDispatchRefusal,
  type MemoryDispatchSelectionV1,
} from '@sentropic/mcp-broker/memory';
import type {
  MemoryReadFacetsV1,
} from '../../engram-memory/dist/reads.js';
import type {
  AuthorizationContextV1,
} from '../../engram-memory/dist/contracts/index.js';
import {
  ENGRAM_MEMORY_CONNECTOR_ID,
  ENGRAM_MEMORY_PROVIDER_ID,
  ENGRAM_MEMORY_TOOL_NAMES,
  type ToolFailureV1,
  type ToolResultV1,
} from '../mcp/memory/contracts.js';
import {
  ENGRAM_MEMORY_PROVIDER_MANIFEST,
  ENGRAM_MEMORY_TOOL_DESCRIPTORS,
} from '../mcp/memory/gates.js';
import {
  ENGRAM_MEMORY_WIRE_PROFILE_V1,
  MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1,
  MEMORY_MCP_WIRE_PROFILE_ID_V1,
} from '../mcp/memory/schemas.js';
import {
  TrustedContextUnavailableProtocolError,
  mapNeutralMemoryErrorToPublic,
  mapUnexpectedDependencyExceptionToPublic,
} from '../mcp/memory/errors.js';
import {
  createMemoryReadToolsV1,
  type MemoryReadHostV1,
  type MemoryReadInvocationV1,
  type MemoryReadPageStoreV1,
} from '../memory-tools/reads.js';
import {
  createMemoryWriteToolsV1,
  type MemoryWriteFacetsV1,
  type MemoryWriteHostV1,
  type MemoryWriteInvocationV1,
} from '../memory-tools/writes.js';

// Standard-contract derivations: every public shape comes from the P2
// adapter type, never from a local look-alike.
export type McpMemoryStandardAdapter = AppConnectorProviderAdapter;
export type McpMemoryStandardInvocation =
  Parameters<AppConnectorProviderAdapter['invokeTool']>[0];
export type McpMemoryStandardResult =
  Awaited<ReturnType<AppConnectorProviderAdapter['invokeTool']>>;
export type McpMemoryTenantResolutionInput =
  Parameters<AppConnectorProviderAdapter['resolveTenant']>[0];
export type McpMemoryTenantContext =
  Awaited<ReturnType<AppConnectorProviderAdapter['resolveTenant']>>;
export type McpMemoryCapabilityList =
  Awaited<ReturnType<AppConnectorProviderAdapter['listCapabilities']>>;
export type McpMemoryResourceRequest =
  Parameters<AppConnectorProviderAdapter['readResource']>[0];

/** Adapter invocation: the standard envelope plus an optional abort signal. */
export interface McpMemoryInvokeRequest extends McpMemoryStandardInvocation {
  readonly signal?: AbortSignal;
}

export const MEMORY_WIRE_PROFILE_ID = MEMORY_MCP_WIRE_PROFILE_ID_V1;
export const MEMORY_TOOL_SCHEMA_PROFILE_ID = MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1;
export const MEMORY_PROVIDER_ID = ENGRAM_MEMORY_PROVIDER_ID;
export const MEMORY_CONNECTOR_ID = ENGRAM_MEMORY_CONNECTOR_ID;
export const MEMORY_TOOL_NAMES = ENGRAM_MEMORY_TOOL_NAMES;
export const MEMORY_WIRE_PROFILE = ENGRAM_MEMORY_WIRE_PROFILE_V1;
export const MEMORY_PROVIDER_MANIFEST = ENGRAM_MEMORY_PROVIDER_MANIFEST;
export const MEMORY_TOOL_DESCRIPTORS = ENGRAM_MEMORY_TOOL_DESCRIPTORS;

export type { MemoryToolName, PublicMemoryErrorCode, ToolResultV1 };
export type { MemoryReadHostV1, MemoryReadInvocationV1, MemoryReadPageStoreV1 };
export type { MemoryWriteFacetsV1, MemoryWriteHostV1, MemoryWriteInvocationV1 };

export interface McpMemoryProviderOptions {
  readonly readFacets: MemoryReadFacetsV1;
  readonly writeFacets: MemoryWriteFacetsV1;
  readonly readHost: MemoryReadHostV1;
  readonly writeHost: MemoryWriteHostV1;
  readonly policyId: string;
}

/** Typed activation refusal: required ports, versions or bindings missing. */
export class McpMemoryPreflightError extends Error {
  readonly code = 'MCP_MEMORY_PREFLIGHT_FAILED' as const;
  readonly detail: string;
  constructor(detail: string) {
    super(`McpMemoryProvider requires explicit injected host ports: ${detail}`);
    this.name = 'McpMemoryPreflightError';
    this.detail = detail;
  }
}

const PROTOCOL_CODE = -32603;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function readPurposeRef(tool: MemoryToolName, input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  if (tool === 'engram_memory_search' || tool === 'engram_memory_get') {
    return typeof input.purpose_ref === 'string' ? input.purpose_ref : undefined;
  }
  if (tool === 'engram_memory_capture') {
    const payload = input.payload;
    if (isRecord(payload) && typeof payload.purpose_ref === 'string') {
      return payload.purpose_ref;
    }
    return undefined;
  }
  return undefined;
}

function readInputIdempotencyKey(input: unknown): string | undefined {
  if (!isRecord(input) || typeof input.idempotency_key !== 'string') return undefined;
  return input.idempotency_key;
}

function preflight(options: McpMemoryProviderOptions): void {
  const fail = (detail: string): never => {
    throw new McpMemoryPreflightError(detail);
  };
  if (options === undefined || options === null || typeof options !== 'object') {
    return fail('explicit injected host ports and policyId are required.');
  }
  const { readFacets, writeFacets, readHost, writeHost, policyId } = options;
  if (typeof policyId !== 'string' || policyId.length === 0) {
    return fail('explicit injected host ports and policyId are required.');
  }
  if (P2_PROVIDER_ID !== ENGRAM_MEMORY_PROVIDER_ID) {
    return fail('provider identity forked from the Sentropic platform contract.');
  }
  if (P2_CONNECTOR_ID !== ENGRAM_MEMORY_CONNECTOR_ID) {
    return fail('connector identity forked from the Sentropic platform contract.');
  }
  if (P2_WIRE_PROFILE_ID !== MEMORY_MCP_WIRE_PROFILE_ID_V1) {
    return fail('wire profile forked from the Sentropic platform contract.');
  }
  if (P2_TOOLS_PROFILE_ID !== MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1) {
    return fail('tool-schema profile forked from the Sentropic platform contract.');
  }
  if (ENGRAM_MEMORY_TOOL_DESCRIPTORS.length !== 6) {
    return fail('exactly six memory tools must be exposed.');
  }
  for (const name of ENGRAM_MEMORY_TOOL_NAMES) {
    if (!isMemoryToolName(name)) {
      return fail(`tool ${String(name)} is not a platform memory tool.`);
    }
  }
  if (
    readFacets === undefined || readFacets === null || typeof readFacets !== 'object' ||
    !isNonEmptyString(readFacets.scope_ref) || !isNonEmptyString(readFacets.store_id)
  ) {
    return fail('read facets with scope_ref and store_id are required.');
  }
  if (
    readFacets.recallPort === undefined || readFacets.recallPort === null ||
    (readFacets.recallPort as { version?: unknown }).version !== 3 ||
    typeof (readFacets.recallPort as { recall?: unknown }).recall !== 'function' ||
    readFacets.readPort === undefined || readFacets.readPort === null ||
    (readFacets.readPort as { version?: unknown }).version !== 1 ||
    typeof (readFacets.readPort as { readCurrent?: unknown }).readCurrent !== 'function'
  ) {
    return fail('read facets must provide recallPort v3 and readPort v1.');
  }
  if (
    writeFacets === undefined || writeFacets === null || typeof writeFacets !== 'object' ||
    !isNonEmptyString(writeFacets.scope_ref) || !isNonEmptyString(writeFacets.store_id)
  ) {
    return fail('write facets with scope_ref and store_id are required.');
  }
  const engine = (writeFacets as unknown as { engine?: Record<string, unknown> }).engine;
  if (
    engine === undefined || engine === null || typeof engine !== 'object' ||
    engine.version !== 2 ||
    typeof engine.capture !== 'function' ||
    typeof engine.requestAdmission !== 'function' ||
    typeof engine.transition !== 'function'
  ) {
    return fail('write facets must provide guarded engine v2.');
  }
  if (
    readHost === undefined || readHost === null || typeof readHost !== 'object' ||
    typeof readHost.clock?.now !== 'function' ||
    typeof readHost.authenticate !== 'function' ||
    typeof readHost.authorize !== 'function' ||
    typeof readHost.authorizeContinuation !== 'function' ||
    typeof readHost.pages?.issue !== 'function' ||
    typeof readHost.pages?.load !== 'function' ||
    typeof readHost.pages?.dispose !== 'function'
  ) {
    return fail('read host ports (clock, authenticate, authorize, pages) are required.');
  }
  if (
    writeHost === undefined || writeHost === null || typeof writeHost !== 'object' ||
    typeof writeHost.clock?.now !== 'function' ||
    typeof writeHost.authenticate !== 'function' ||
    typeof writeHost.authorize !== 'function' ||
    typeof writeHost.reservation?.reserveOrLoad !== 'function' ||
    typeof writeHost.reservation?.attachConfirmation !== 'function' ||
    typeof writeHost.reservation?.claimFencedExecution !== 'function' ||
    typeof writeHost.reservation?.reconcileCanonicalOutcome !== 'function' ||
    typeof writeHost.reservation?.recordCompletion !== 'function' ||
    typeof writeHost.audit?.append !== 'function' ||
    typeof writeHost.policy?.capturePolicyVersion !== 'function' ||
    typeof writeHost.policy?.admissionPolicyVersion !== 'function' ||
    typeof writeHost.policy?.retention !== 'object' ||
    typeof writeHost.policy?.reconciliation !== 'object' ||
    typeof writeHost.policy?.anchorKindRef !== 'string' ||
    typeof writeHost.policy?.provenanceDigest !== 'function' ||
    typeof writeHost.policy?.nextSourceOrder !== 'function' ||
    typeof writeHost.confirm !== 'function' ||
    typeof writeHost.keyCustody?.confirmDestroyed !== 'function' ||
    typeof writeHost.coverage?.verify !== 'function'
  ) {
    return fail('write host ports (clock, authenticate, authorize, reservation, audit, policy, confirm, keyCustody, coverage) are required.');
  }
}

function failureResult(
  tool: MemoryToolName,
  auditId: string,
  code: PublicMemoryErrorCode,
): McpMemoryStandardResult {
  const mapped = mapNeutralMemoryErrorToPublic({
    tool,
    auditId,
    code,
    invocationAuthorized: false,
  }).structuredContent as ToolFailureV1;
  return {
    ok: false,
    auditId: mapped.auditId,
    redactionClass: 'high',
    error: {
      code: mapped.error.code,
      message: mapped.error.message,
      retriable: mapped.error.retriable,
    },
  };
}

function successResult(envelope: ToolResultV1<unknown>): McpMemoryStandardResult {
  if (!envelope.ok) {
    const failure = envelope as ToolFailureV1;
    return {
      ok: false,
      auditId: failure.auditId,
      redactionClass: 'high',
      error: {
        code: failure.error.code,
        message: failure.error.message,
        retriable: failure.error.retriable,
      },
    };
  }
  return {
    ok: true,
    output: envelope.output,
    auditId: envelope.auditId,
    redactionClass: 'high',
  };
}

const CANCELLED_MARKER = Symbol('mcp-memory-cancelled');

function isCancelledMarker(value: unknown): boolean {
  return value === CANCELLED_MARKER;
}

/**
 * Await a facade promise while honoring the host cancellation signal. The
 * L0 facades expose no signal parameter (frozen contracts), so cancellation
 * is enforced around them: an abort before dispatch prevents the effect, an
 * abort during dispatch abandons the wait. Mutations stay recoverable through
 * the reservation binding: a same-key retry replays the canonical outcome.
 */
function withCancellation<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) return Promise.reject(CANCELLED_MARKER);
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(CANCELLED_MARKER);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw CANCELLED_MARKER;
}

/**
 * Create the standard memory provider adapter. Activation runs the
 * required-port preflight and refuses with `McpMemoryPreflightError` when any
 * required facet, host port, version, profile or binding is missing or empty.
 */
export function createEngramMemoryProviderV1(
  options: McpMemoryProviderOptions,
): AppConnectorProviderAdapter {
  preflight(options);
  const { readFacets, writeFacets, readHost, writeHost, policyId } = options;
  const readers = createMemoryReadToolsV1({ facets: readFacets, host: readHost });
  const writers = createMemoryWriteToolsV1({ facets: writeFacets, host: writeHost });

  async function invokeTool(
    req: McpMemoryInvokeRequest,
  ): Promise<McpMemoryStandardResult> {
    // 1. Verified host context first: no domain response of any kind before
    //    the injected context passes the platform trust check.
    const verified: StpConnectorContext = requireTrustedInvocationContext(
      req.ctx as StpConnectorContext | undefined | null,
    );
    const toolName = (req as { capabilityRef?: unknown }).capabilityRef;
    if (!isMemoryToolName(toolName)) {
      throw new MemoryDispatchRefusal('unknown_tool', `no memory tool named "${String(toolName)}"`);
    }
    const tool: MemoryToolName = toolName;
    const auditHint = verified.auditId;

    const invalid = (code: PublicMemoryErrorCode): McpMemoryStandardResult =>
      failureResult(tool, auditHint, code);

    try {
      // 2. Argument validation (purpose is a model argument and must match the
      //    verified host binding): schema failures, never missing-context.
      const purposeRef = readPurposeRef(tool, req.input);
      if (!isNonEmptyString(purposeRef)) {
        return invalid('INVALID_SCHEMA');
      }

      // 3. Compiled selection: exact planned tool, verified source binding,
      //    trusted envelope bindings, generation, principal, tenant, scopes,
      //    claims and confirmation gating. Refuses with a typed
      //    MemoryDispatchRefusal before any provider contact or effect.
      const dispatch = new CompiledMemoryDispatch({
        plan: {
          resolveTool: (name: string) => {
            const descriptor = ENGRAM_MEMORY_TOOL_DESCRIPTORS.find(
              (candidate) => candidate.name === name,
            );
            if (descriptor === undefined) return undefined;
            return {
              providerId: ENGRAM_MEMORY_PROVIDER_ID,
              capabilityName: descriptor.name,
              requiredScopes: descriptor.requiredScopes,
              requiredClaims: descriptor.requiredClaims,
              entry: {
                gates: {
                  requiresHumanConfirmation: descriptor.gates.requiresHumanConfirmation,
                  requiresElicitation: descriptor.gates.requiresElicitation,
                },
              },
            };
          },
        },
        adapters: [adapter],
        sourceId: 'mcp:engram-memory',
        generation: verified.memory?.expectedActiveGeneration ?? '',
      });
      const inputKey = readInputIdempotencyKey(req.input);
      const selected = dispatch.select({
        toolName: tool,
        ctx: verified,
        purposeRef,
        ...(req.idempotencyKey !== undefined || inputKey !== undefined
          ? { idempotencyKey: (req.idempotencyKey ?? inputKey) as string }
          : {}),
        ...(req.elicitationRef !== undefined ? { elicitationRef: req.elicitationRef } : {}),
        expectedPrincipalSub: verified.principal.sub,
        expectedTenantRef: verified.tenantRef,
        expectedSourceId: 'mcp:engram-memory',
        expectedGeneration: verified.memory?.expectedActiveGeneration ?? '',
      });
      const projection = selected.projection;
      const auditId: string = selected.auditRef;
      const selection: MemoryDispatchSelectionV1 = selected.selection;
      void selection;

      const readInvocation: MemoryReadInvocationV1 = {
        auditId,
        authorization: projection.neutral_authorization as AuthorizationContextV1,
        scope_ref: projection.neutral_scope_ref,
        store_id: projection.trusted_context.store_id,
        principal_namespace: projection.neutral_principal.principal_namespace,
        principal_id: projection.neutral_principal.principal_id,
        tenant_id: projection.neutral_principal.tenant_id,
        connector_instance_id: projection.routing_provenance.connector_instance_ref,
        agent_id: projection.agent_id,
        session_id: projection.session_attachment.logical_session_ref,
        generation: projection.routing_provenance.active_generation,
        policy_id: policyId,
        policy_version: projection.routing_provenance.policy_epoch,
        authorization_epoch: projection.trusted_context.policy_epoch ?? projection.routing_provenance.policy_epoch,
        deadline_at: projection.lifecycle_binding.deadline_at,
      };
      const writeInvocation: MemoryWriteInvocationV1 = {
        auditId,
        authorization: projection.neutral_authorization as AuthorizationContextV1,
        scope_ref: projection.neutral_scope_ref,
        store_id: projection.trusted_context.store_id,
        principal_namespace: projection.neutral_principal.principal_namespace,
        principal_id: projection.neutral_principal.principal_id,
        tenant_id: projection.neutral_principal.tenant_id,
        connector_instance_ref: projection.routing_provenance.connector_instance_ref,
        agent_id: projection.agent_id,
        session_id: projection.session_attachment.logical_session_ref,
        generation: projection.routing_provenance.active_generation,
        deadline_at: projection.lifecycle_binding.deadline_at,
      };

      // 4. Injected host authentication before every domain envelope,
      //    including cancellation and idempotency-conflict envelopes. The
      //    abort check runs only after this authentication, so an aborted
      //    call with a rejecting authenticator is refused with -32603 and
      //    never receives a domain envelope.
      const signal = (req as { signal?: AbortSignal }).signal;
      try {
        const authenticated =
          tool === 'engram_memory_search' || tool === 'engram_memory_get'
            ? await readHost.authenticate(structuredClone(readInvocation), tool)
            : await writeHost.authenticate(structuredClone(writeInvocation), tool as 'engram_memory_capture' | 'engram_memory_request_admission' | 'engram_memory_withdraw' | 'engram_memory_forget');
        if (authenticated !== true) {
          throw new MemoryTrustedContextError('host authentication refused');
        }
      } catch (error) {
        if (isCancelledMarker(error)) throw error;
        throw new MemoryTrustedContextError(
          error instanceof MemoryTrustedContextError ? error.message : 'host authentication refused',
        );
      }
      throwIfAborted(signal);

      // 5. Cancellation and idempotency-conflict envelopes only after the
      //    host authentication above.
      if (signal?.aborted === true) {
        return failureResult(tool, auditId, 'CANCELLED');
      }
      const boundKey = projection.envelope_bindings.idempotency_key;
      if (inputKey !== undefined && boundKey !== undefined && inputKey !== boundKey) {
        return failureResult(tool, auditId, 'DIGEST_CONFLICT');
      }

      // 6. Dispatch through the real facades with the cancellation signal
      //    enforced around every await.
      try {
        switch (tool) {
          case 'engram_memory_search': {
            const out = await withCancellation(readers.search(req.input, readInvocation), signal);
            throwIfAborted(signal);
            return successResult(out as ToolResultV1<unknown>);
          }
          case 'engram_memory_get': {
            const out = await withCancellation(readers.get(req.input, readInvocation), signal);
            throwIfAborted(signal);
            return successResult(out as ToolResultV1<unknown>);
          }
          case 'engram_memory_capture': {
            const out = await withCancellation(writers.capture(req.input, writeInvocation), signal);
            throwIfAborted(signal);
            return successResult(out as ToolResultV1<unknown>);
          }
          case 'engram_memory_request_admission': {
            const out = await withCancellation(
              writers.requestAdmission(req.input, writeInvocation),
              signal,
            );
            throwIfAborted(signal);
            return successResult(out as ToolResultV1<unknown>);
          }
          case 'engram_memory_withdraw': {
            const out = await withCancellation(writers.withdraw(req.input, writeInvocation), signal);
            throwIfAborted(signal);
            return successResult(out as ToolResultV1<unknown>);
          }
          case 'engram_memory_forget': {
            const out = await withCancellation(writers.forget(req.input, writeInvocation), signal);
            throwIfAborted(signal);
            return successResult(out as ToolResultV1<unknown>);
          }
        }
      } catch (error) {
        if (isCancelledMarker(error) || signal?.aborted) {
          return failureResult(tool, auditId, 'CANCELLED');
        }
        throw error;
      }
      throw new MemoryDispatchRefusal('unknown_tool', `no memory tool named "${tool}"`);
    } catch (error) {
      if (
        error instanceof MemoryTrustedContextError ||
        error instanceof TrustedContextUnavailableProtocolError ||
        error instanceof MemoryDispatchRefusal
      ) {
        throw error;
      }
      if (isCancelledMarker(error)) {
        return failureResult(tool, auditHint, 'CANCELLED');
      }
      // M6 total mapping, sanitized: no dependency message, path, record
      // body or credential ever escapes. Anything reaching the adapter past
      // the facades failed before the commit phase, so the pre-commit
      // classification applies to reads and mutations alike.
      return successResult(
        mapUnexpectedDependencyExceptionToPublic({
          tool,
          commitPhaseEntered: false,
          auditId: auditHint,
        }).structuredContent as ToolResultV1<unknown>,
      );
    }
  }

  async function resolveTenant(
    ...args: Parameters<AppConnectorProviderAdapter['resolveTenant']>
  ): Promise<McpMemoryTenantContext> {
    const [input] = args;
    if (input === undefined || input === null || typeof input !== 'object') {
      throw new McpMemoryPreflightError('tenant resolution requires core-authoritative input.');
    }
    const { principalSub, tenantRef, connectorInstanceId } = input as {
      principalSub?: unknown;
      tenantRef?: unknown;
      connectorInstanceId?: unknown;
    };
    if (!isNonEmptyString(principalSub) || !isNonEmptyString(tenantRef) || !isNonEmptyString(connectorInstanceId)) {
      throw new McpMemoryPreflightError('tenant resolution narrows core scope, never broadens it.');
    }
    return {
      principalRef: principalSub,
      tenantRef,
      ...(typeof (input as { workspaceRef?: unknown }).workspaceRef === 'string'
        ? { workspaceRef: (input as { workspaceRef: string }).workspaceRef }
        : {}),
      connectorInstanceId,
    };
  }

  async function listCapabilities(
    ...args: Parameters<AppConnectorProviderAdapter['listCapabilities']>
  ): Promise<McpMemoryCapabilityList> {
    const [ctx] = args;
    requireTrustedInvocationContext(ctx as unknown as StpConnectorContext | undefined | null);
    return [...ENGRAM_MEMORY_PROVIDER_MANIFEST.tools];
  }

  async function readResource(
    ...args: Parameters<AppConnectorProviderAdapter['readResource']>
  ): Promise<never> {
    void args;
    throw new MemoryDispatchRefusal('unknown_tool', 'memory provider exposes no resources');
  }

  async function validateSecrets(
    ...args: Parameters<AppConnectorProviderAdapter['validateSecrets']>
  ): Promise<Awaited<ReturnType<AppConnectorProviderAdapter['validateSecrets']>>> {
    void args;
    return [];
  }

  const adapter: AppConnectorProviderAdapter = {
    appId: 'engram',
    connectorId: ENGRAM_MEMORY_CONNECTOR_ID,
    manifest: ENGRAM_MEMORY_PROVIDER_MANIFEST,
    resolveTenant,
    listCapabilities,
    invokeTool: (req) => invokeTool(req as McpMemoryInvokeRequest),
    readResource: (req) => readResource(req as McpMemoryResourceRequest),
    validateSecrets,
  };

  return adapter;
}

export function protocolError(): { code: number; message: string } {
  return { code: PROTOCOL_CODE, message: 'Trusted invocation context unavailable' };
}
