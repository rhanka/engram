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
 *
 * Dispatch is ONE ordered pipeline (`invokeTool`, steps 1-9). Each step
 * either passes a typed value to the next step or fails through the step 9
 * mapping. No domain-shaped value (envelope, audit id, `INVALID_SCHEMA`)
 * exists before step 2 (authentication).
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
} from '@sentropic/mcp-broker/memory';
import { MEMORY_FROZEN_PROFILE_BINDINGS_V1, verifyMemoryFrozenProfileAssetsV1 } from './profiles.js';
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
  type AppMcpProviderManifestWithElicitation,
} from '../mcp/memory/gates.js';
import {
  ENGRAM_MEMORY_WIRE_PROFILE_V1,
  MEMORY_MCP_TOOL_SCHEMA_PROFILE_ID_V1,
  MEMORY_MCP_WIRE_PROFILE_ID_V1,
  validateCaptureInputV1,
  validateForgetInputV1,
  validateGetInputV1,
  validateRequestAdmissionInputV1,
  validateSearchInputV1,
  validateWithdrawInputV1,
} from '../mcp/memory/schemas.js';
import {
  TrustedContextUnavailableProtocolError,
  mapNeutralMemoryErrorToPublic,
  mapUnexpectedDependencyExceptionToPublic,
} from '../mcp/memory/errors.js';
import {
  validateMemoryHostBindingSetV1,
  type MemoryHostBindingSetV1,
} from '../mcp/memory/topology.js';
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

/** The host's immutable compiled dispatch plan, given once at activation. */
export type McpMemoryDispatchPlanV1 =
  ConstructorParameters<typeof CompiledMemoryDispatch>[0]['plan'];

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

/**
 * PW4 staged-activation seam: options for the pure manifest-to-plan builder.
 * The plan is compiled for the bound catalog source (`mcp:engram-memory`)
 * from the frozen provider manifest by default; a caller may pass its own
 * manifest, which must match the frozen L0 tool contract exactly or the
 * builder throws.
 */
export interface ManifestMemoryDispatchPlanOptionsV1 {
  /** Bound catalog source id; only `mcp:engram-memory` is accepted. */
  readonly sourceId?: 'mcp:engram-memory';
  /** Manifest to compile; defaults to the frozen `MEMORY_PROVIDER_MANIFEST`. */
  readonly manifest?: AppMcpProviderManifestWithElicitation;
}

/**
 * Pure, synchronous, store-free builder producing a validated, frozen
 * `McpMemoryDispatchPlanV1` directly from the frozen provider manifest, so
 * `createEngramMemoryProviderV1` can be activated — and its adapter then
 * bound into the broker compiled dispatch — before any registry compile
 * exists. This breaks the registry-compile/provider-activation
 * materialization cycle without any placeholder store or fake plan. Throws
 * `Error` at construction when the source id, provider identity, tool list
 * or any gate boolean drifts from the frozen L0 contract.
 */
export function createManifestMemoryDispatchPlanV1(
  options?: ManifestMemoryDispatchPlanOptionsV1,
): McpMemoryDispatchPlanV1 {
  const sourceId = options?.sourceId ?? 'mcp:engram-memory';
  if (sourceId !== 'mcp:engram-memory') {
    throw new Error(
      `createManifestMemoryDispatchPlanV1: unsupported sourceId ${JSON.stringify(sourceId)}; only mcp:engram-memory is bound.`,
    );
  }
  const manifest = options?.manifest ?? MEMORY_PROVIDER_MANIFEST;
  if (manifest.providerId !== ENGRAM_MEMORY_PROVIDER_ID) {
    throw new Error(
      'createManifestMemoryDispatchPlanV1: manifest providerId drifted from the frozen L0 contract.',
    );
  }
  const manifestTools = [...manifest.tools];
  if (manifestTools.length !== ENGRAM_MEMORY_TOOL_DESCRIPTORS.length) {
    throw new Error(
      `createManifestMemoryDispatchPlanV1: manifest lists ${manifestTools.length} tools; the frozen L0 contract exposes ${ENGRAM_MEMORY_TOOL_DESCRIPTORS.length}.`,
    );
  }
  for (const descriptor of ENGRAM_MEMORY_TOOL_DESCRIPTORS) {
    const candidate = manifestTools.find((tool) => tool.name === descriptor.name);
    if (candidate === undefined) {
      throw new Error(
        `createManifestMemoryDispatchPlanV1: manifest tool list drifted from the frozen L0 contract (${descriptor.name} missing).`,
      );
    }
    if (
      !Array.isArray(candidate.requiredScopes) ||
      JSON.stringify([...candidate.requiredScopes]) !== JSON.stringify([...descriptor.requiredScopes]) ||
      !Array.isArray(candidate.requiredClaims) ||
      JSON.stringify([...candidate.requiredClaims]) !== JSON.stringify([...descriptor.requiredClaims])
    ) {
      throw new Error(
        `createManifestMemoryDispatchPlanV1: manifest tool ${descriptor.name} drifted from the frozen L0 scopes/claims.`,
      );
    }
    const gates = (candidate as { gates?: { requiresHumanConfirmation?: unknown; requiresElicitation?: unknown } }).gates;
    if (
      typeof gates?.requiresHumanConfirmation !== 'boolean' ||
      typeof gates?.requiresElicitation !== 'boolean' ||
      gates.requiresHumanConfirmation !== descriptor.gates.requiresHumanConfirmation ||
      gates.requiresElicitation !== descriptor.gates.requiresElicitation
    ) {
      throw new Error(
        `createManifestMemoryDispatchPlanV1: manifest tool ${descriptor.name} gate booleans drifted from the frozen L0 contract.`,
      );
    }
  }
  const descriptorsByName = new Map<string, (typeof ENGRAM_MEMORY_TOOL_DESCRIPTORS)[number]>(
    ENGRAM_MEMORY_TOOL_DESCRIPTORS.map((tool) => [tool.name as string, tool]),
  );
  const providerId = manifest.providerId;
  return Object.freeze({
    resolveTool: (name: string) => {
      const descriptor = descriptorsByName.get(name);
      if (descriptor === undefined) return undefined;
      return Object.freeze({
        providerId,
        capabilityName: descriptor.name,
        requiredScopes: Object.freeze([...descriptor.requiredScopes]),
        requiredClaims: Object.freeze([...descriptor.requiredClaims]),
        entry: Object.freeze({
          gates: Object.freeze({
            requiresHumanConfirmation: descriptor.gates.requiresHumanConfirmation,
            requiresElicitation: descriptor.gates.requiresElicitation,
          }),
        }),
      });
    },
  });
}

export type { MemoryToolName, PublicMemoryErrorCode, ToolResultV1 };
export type { MemoryHostBindingSetV1 };
export type { MemoryReadHostV1, MemoryReadInvocationV1, MemoryReadPageStoreV1 };
export type { MemoryWriteFacetsV1, MemoryWriteHostV1, MemoryWriteInvocationV1 };

export interface McpMemoryProviderOptions {
  readonly readFacets: MemoryReadFacetsV1;
  readonly writeFacets: MemoryWriteFacetsV1;
  readonly readHost: MemoryReadHostV1;
  readonly writeHost: MemoryWriteHostV1;
  readonly policyId: string;
  /** L0 host-binding contract: ports, frozen profiles/digests, versions. */
  readonly hostBindings: MemoryHostBindingSetV1;
  /** Host's immutable compiled plan, consumed once here, never per request. */
  readonly plan: McpMemoryDispatchPlanV1;
  /** Bound catalog source id (`mcp:engram-memory`). */
  readonly sourceId: string;
  /** Active generation the dispatch is bound to. */
  readonly generation: string;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

/**
 * Derive the domain purpose for compiled selection. Reads and capture carry
 * a caller-supplied `purpose_ref` in their closed input schemas: it must be
 * present and non-empty, otherwise the arguments are invalid. The remaining
 * mutation tools carry no purpose argument, so the verified host binding
 * purpose applies. The selection guard requires the derived purpose to equal
 * the verified binding purpose; a mismatch is a trusted-context refusal.
 */
function readPurposeRef(
  tool: MemoryToolName,
  input: unknown,
  bindingPurpose: unknown,
): string | undefined {
  if (tool === 'engram_memory_search' || tool === 'engram_memory_get') {
    if (!isRecord(input)) return undefined;
    return typeof input.purpose_ref === 'string' ? input.purpose_ref : undefined;
  }
  if (tool === 'engram_memory_capture') {
    if (!isRecord(input)) return undefined;
    const payload = input.payload;
    if (!isRecord(payload)) return undefined;
    return typeof payload.purpose_ref === 'string' ? payload.purpose_ref : undefined;
  }
  return typeof bindingPurpose === 'string' ? bindingPurpose : undefined;
}

function readInputIdempotencyKey(input: unknown): string | undefined {
  if (!isRecord(input) || typeof input.idempotency_key !== 'string') return undefined;
  return input.idempotency_key;
}

/** Closed-schema argument validation per tool (step 4 of the pipeline). */
function isClosedToolInput(tool: MemoryToolName, input: unknown): boolean {
  switch (tool) {
    case 'engram_memory_search':
      return validateSearchInputV1(input).ok;
    case 'engram_memory_get':
      return validateGetInputV1(input).ok;
    case 'engram_memory_capture':
      return validateCaptureInputV1(input).ok;
    case 'engram_memory_request_admission':
      return validateRequestAdmissionInputV1(input).ok;
    case 'engram_memory_withdraw':
      return validateWithdrawInputV1(input).ok;
    case 'engram_memory_forget':
      return validateForgetInputV1(input).ok;
  }
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
  // L0 host-binding contract: every required port, frozen profile/digest and
  // contract version is consumed and validated before any tool is advertised.
  const bindings = (options as { hostBindings?: unknown }).hostBindings;
  const bindingCheck = validateMemoryHostBindingSetV1(bindings);
  if (!bindingCheck.ok) {
    return fail(`invalid L0 host-binding contract: ${bindingCheck.reason}.`);
  }
  for (const [key, expected] of Object.entries(MEMORY_FROZEN_PROFILE_BINDINGS_V1)) {
    if (options.hostBindings.profileBindings[key as keyof typeof MEMORY_FROZEN_PROFILE_BINDINGS_V1] !== expected) {
      return fail(`incompatible frozen profile: ${key}.`);
    }
  }
  if (!verifyMemoryFrozenProfileAssetsV1()) return fail('missing or altered frozen profile assets.');
  const plan = (options as { plan?: unknown }).plan;
  if (
    plan === undefined || plan === null || typeof plan !== 'object' ||
    typeof (plan as { resolveTool?: unknown }).resolveTool !== 'function'
  ) {
    return fail('the host immutable compiled dispatch plan is required.');
  }
  const { sourceId, generation } = options as { sourceId?: unknown; generation?: unknown };
  if (!isNonEmptyString(sourceId)) {
    return fail('the bound catalog source id is required.');
  }
  if (!isNonEmptyString(generation)) {
    return fail('the active generation the dispatch is bound to is required.');
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
    typeof writeHost.policy?.provenanceDigest !== 'function' ||
    typeof writeHost.policy?.nextSourceOrder !== 'function' ||
    typeof writeHost.confirm !== 'function' ||
    typeof writeHost.keyCustody?.confirmDestroyed !== 'function' ||
    typeof writeHost.coverage?.verify !== 'function'
  ) {
    return fail('write host ports (clock, authenticate, authorize, reservation, audit, policy, confirm, keyCustody, coverage) are required.');
  }
  // Null, empty or partial domain policies are refused: a missing policy
  // object (`typeof null === 'object'`) must never pass as a policy.
  const policy = writeHost.policy as unknown as Record<string, unknown>;
  const retention = policy.retention;
  if (
    !isPlainObject(retention) ||
    typeof retention.max_retention_days !== 'number' ||
    !Number.isFinite(retention.max_retention_days) ||
    retention.max_retention_days <= 0 ||
    typeof retention.allow_retain_derivative_rule !== 'boolean'
  ) {
    return fail('write host policy retention must be a complete retention config.');
  }
  const reconciliation = policy.reconciliation;
  if (
    !isPlainObject(reconciliation) ||
    !Array.isArray(reconciliation.consented_family_refs) ||
    reconciliation.consented_family_refs.some((ref) => typeof ref !== 'string' || ref.length === 0)
  ) {
    return fail('write host policy reconciliation must be a complete reconciliation config.');
  }
  if (!isNonEmptyString(policy.anchorKindRef)) {
    return fail('write host policy anchorKindRef (lifecycle kind) is required.');
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

/** Re-read every time: the signal may fire between pipeline steps. */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/**
 * Step 2 authentication context, built from the verified host binding only:
 * selection has not run yet, so no projection exists. Field selection mirrors
 * the projection-derived invocations below, sourced from the same binding.
 */
function buildAuthInvocation(
  verified: StpConnectorContext,
  policyId: string,
): MemoryWriteInvocationV1 {
  const binding = verified.memory?.binding;
  return {
    auditId: verified.auditId,
    authorization: {
      credential: binding?.neutral_credential ?? '',
      ...(binding?.neutral_context_ref !== undefined
        ? { context_ref: binding.neutral_context_ref }
        : {}),
    },
    scope_ref: binding?.scope_ref ?? '',
    store_id: binding?.store_id ?? '',
    principal_namespace: binding?.principal_namespace ?? '',
    principal_id: binding?.principal_id ?? '',
    tenant_id: binding?.tenant_id ?? '',
    transport_attachment_ref: binding?.transport_attachment_ref,
    connector_instance_ref: binding?.connector_instance_ref ?? '',
    agent_id: binding?.agent_id ?? '',
    session_id: binding?.logical_session_ref ?? '',
    generation: binding?.active_generation ?? '',
    deadline_at: binding?.deadline_at ?? '',
  };
}

/**
 * Create the standard memory provider adapter. Activation consumes the L0
 * host-binding contract, the host's immutable compiled plan, the bound
 * source id and generation, and refuses with `McpMemoryPreflightError` when
 * any required facet, host port, version, profile, digest, policy object or
 * binding is missing, null, empty, partial or incompatible. No tool is
 * advertised before this preflight passes: the factory throws, so no adapter
 * (and no dispatch) exists.
 */
export function createEngramMemoryProviderV1(
  options: McpMemoryProviderOptions,
): AppConnectorProviderAdapter {
  preflight(options);
  const { readFacets, writeFacets, readHost, writeHost, policyId, plan, sourceId, generation } = options;
  const readers = createMemoryReadToolsV1({ facets: readFacets, host: readHost });
  const writers = createMemoryWriteToolsV1({ facets: writeFacets, host: writeHost });

  // The compiled dispatch is bound ONCE at activation from the host's
  // immutable plan. It is never rebuilt per request; per-request work is the
  // `select` call inside the pipeline below.
  let dispatch: CompiledMemoryDispatch;

  async function invokeTool(
    req: McpMemoryInvokeRequest,
  ): Promise<McpMemoryStandardResult> {
    // STEP 1 — trusted context, resolved INSIDE the sanitizing boundary. Any
    // throw (missing, malformed, synthetic or unauthenticated context, or an
    // injected resolver failure upstream) becomes the constant trusted-context
    // protocol refusal with no message passthrough.
    let verified: StpConnectorContext;
    try {
      verified = requireTrustedInvocationContext(
        req.ctx as StpConnectorContext | undefined | null,
      );
    } catch {
      throw new MemoryTrustedContextError();
    }
    const toolName = (req as { capabilityRef?: unknown }).capabilityRef;
    if (!isMemoryToolName(toolName)) {
      throw new MemoryDispatchRefusal('unknown_tool', `no memory tool named "${String(toolName)}"`);
    }
    // The verified binding must name this provider: a forged provider,
    // connector or source binding is refused at the trust boundary, before
    // the injected authentication port is contacted (zero auth calls) and
    // before any domain envelope exists.
    const boundIds = verified.memory?.binding;
    if (
      boundIds?.provider_id !== ENGRAM_MEMORY_PROVIDER_ID ||
      boundIds?.connector_id !== ENGRAM_MEMORY_CONNECTOR_ID ||
      boundIds?.selected_source_id !== 'mcp:engram-memory'
    ) {
      throw new MemoryTrustedContextError();
    }
    const tool: MemoryToolName = toolName;
    const signal = (req as { signal?: AbortSignal }).signal;
    // Updated only at the engine canonical commit boundary.
    const execution = { signal, commitPhaseEntered: false };

    try {
      // STEP 2 — authentication with the injected port. Nothing
      // domain-shaped exists before this step: no envelope, no audit id, no
      // `INVALID_SCHEMA`. A refusal (or a throwing authenticator) is the
      // protocol error, never a domain envelope — so a rejecting
      // authenticator records zero domain envelopes.
      try {
        const authInvocation = buildAuthInvocation(verified, policyId);
        const { connector_instance_ref, transport_attachment_ref: _attachment, ...common } = authInvocation;
        const readAuthInvocation: MemoryReadInvocationV1 = {
          ...common, connector_instance_id: connector_instance_ref, policy_id: policyId,
          policy_version: verified.memory!.binding.policy_epoch,
          authorization_epoch: verified.memory!.binding.policy_epoch,
        };
        const authenticated =
          tool === 'engram_memory_search' || tool === 'engram_memory_get'
            ? await readHost.authenticate(
              structuredClone(readAuthInvocation),
              tool,
            )
            : await writeHost.authenticate(
              structuredClone(authInvocation),
              tool as 'engram_memory_capture' | 'engram_memory_request_admission' | 'engram_memory_withdraw' | 'engram_memory_forget',
            );
        if (authenticated !== true) {
          throw new MemoryTrustedContextError();
        }
      } catch (error) {
        if (error instanceof MemoryTrustedContextError) throw error;
        throw new MemoryTrustedContextError();
      }
      if (isAborted(signal)) {
        return failureResult(tool, verified.auditId, 'CANCELLED');
      }

      // STEP 3 — selection from the host's immutable compiled plan (bound at
      // activation). The full selection is kept, including
      // `confirmationRequired` and the stronger host gates. A missing purpose
      // is an argument-validation failure (post-authentication `INVALID_SCHEMA`,
      // never a context error). A malformed envelope idempotency key is also
      // an argument failure, never a context error; every other refusal (a
      // forged source, stale generation, principal/tenant mismatch, missing
      // scope/claim, or an elicitation binding that differs from the verified
      // host binding) stays a typed refusal.
      const purposeRef = verified.memory?.binding?.purpose_ref;
      if (!isNonEmptyString(purposeRef)) {
        return failureResult(tool, verified.auditId, 'INVALID_SCHEMA');
      }
      const inputKey = readInputIdempotencyKey(req.input);
      let selected: ReturnType<CompiledMemoryDispatch['select']>;
      try {
        selected = dispatch.select({
          toolName: tool,
          ctx: verified,
          purposeRef,
          ...(req.idempotencyKey !== undefined || inputKey !== undefined
            ? { idempotencyKey: (req.idempotencyKey ?? inputKey) as string }
            : {}),
          ...(req.elicitationRef !== undefined ? { elicitationRef: req.elicitationRef } : {}),
          expectedPrincipalSub: verified.principal.sub,
          expectedTenantRef: verified.tenantRef,
          expectedSourceId: sourceId,
          expectedGeneration: generation,
        });
      } catch (error) {
        if (
          error instanceof MemoryDispatchRefusal &&
          error.refusalCode === 'source_binding_mismatch' &&
          /envelope idempotency key/i.test(error.message)
        ) {
          return failureResult(tool, verified.auditId, 'INVALID_SCHEMA');
        }
        throw error;
      }
      const projection = selected.projection;
      const auditId: string = selected.auditRef;
      const confirmationRequired = selected.selection.confirmationRequired;
      if (isAborted(signal)) {
        return failureResult(tool, auditId, 'CANCELLED');
      }

      // STEP 4 — argument validation against the closed schema. Invalid
      // arguments give the M6 validation error, never a context error.
      if (!isClosedToolInput(tool, req.input)) {
        return failureResult(tool, auditId, 'INVALID_SCHEMA');
      }

      if (readPurposeRef(tool, req.input, purposeRef) !== purposeRef) {
        throw new MemoryTrustedContextError();
      }

      // STEP 5 — confirmation. Reads expose no confirmation port: under a
      // selected stronger gate they are refused closed (never disclosed
      // without the required gate). Mutation confirmation is enforced inside
      // the facade's first-effect guard (it needs the reservation's operation
      // digest); the invocation below carries the verified selection gate plus
      // the injected elicitation and session bindings unchanged. A refusal is
      // returned before any effect.
      if (confirmationRequired && (tool === 'engram_memory_search' || tool === 'engram_memory_get')) {
        return failureResult(tool, auditId, 'gate_failed');
      }

      // STEP 6 — first-effect guard: the abort signal and the reservation
      // binding are checked before the facade is invoked, so a pre-dispatch
      // abort never dispatches and a conflicting envelope key never effects.
      if (isAborted(signal)) {
        return failureResult(tool, auditId, 'CANCELLED');
      }
      const boundKey = projection.envelope_bindings.idempotency_key;
      if (inputKey !== undefined && boundKey !== undefined && inputKey !== boundKey) {
        return failureResult(tool, auditId, 'DIGEST_CONFLICT');
      }

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
      const elicitationRef = projection.envelope_bindings.elicitation_ref ?? req.elicitationRef;
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
        transport_attachment_ref: projection.session_attachment.transport_attachment_ref,
        generation: projection.routing_provenance.active_generation,
        deadline_at: projection.lifecycle_binding.deadline_at,
        // Injected bindings, never synthesized: the verified elicitation
        // reference, the verified cancellation reference, and the selected
        // stronger confirmation gate travel into the facade, which uses them
        // for the confirmation port, durable attachment and engine refs.
        ...(elicitationRef !== undefined ? { elicitation_ref: elicitationRef } : {}),
        ...(projection.lifecycle_binding.cancellation_ref !== undefined
          ? { cancellation_ref: projection.lifecycle_binding.cancellation_ref }
          : {}),
        ...(confirmationRequired ? { confirmationRequired: true as const } : {}),
      };

      // STEP 7 — await the cancellable facade, preserving observed commit state.
      let outcome: ToolResultV1<unknown>;
      switch (tool) {
        case 'engram_memory_search': outcome = await readers.search(req.input, readInvocation, execution); break;
        case 'engram_memory_get': outcome = await readers.get(req.input, readInvocation, execution); break;
        case 'engram_memory_capture': outcome = await writers.capture(req.input, writeInvocation, execution); break;
        case 'engram_memory_request_admission': outcome = await writers.requestAdmission(req.input, writeInvocation, execution); break;
        case 'engram_memory_withdraw': outcome = await writers.withdraw(req.input, writeInvocation, execution); break;
        case 'engram_memory_forget': outcome = await writers.forget(req.input, writeInvocation, execution); break;
      }

      // STEP 8 — outcome classification. A settled facade envelope already
      // carries its commit knowledge: committed receipts (with pending
      // cleanup where a post-commit port failed), `MUTATION_OUTCOME_UNKNOWN`
      // for indeterminate effects, and pre-commit failures otherwise. It is
      // returned as observed; the abort signal is not re-checked here.
      return successResult(outcome);
    } catch (error) {
      // STEP 9 — mapping. The single exit: protocol and refusal errors
      // propagate (the server maps them to the constant protocol refusal);
      // anything else is sanitized through the M6 total error mapping. An
      // unexpected throw after canonical commit begins may be indeterminate.
      // Definite pre-effect failures retain the precommit mapping.
      if (
        error instanceof MemoryTrustedContextError ||
        error instanceof TrustedContextUnavailableProtocolError ||
        error instanceof MemoryDispatchRefusal
      ) {
        throw error;
      }
      return successResult(
        mapUnexpectedDependencyExceptionToPublic({
          tool,
          commitPhaseEntered: execution.commitPhaseEntered,
          auditId: verified.auditId,
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

  try {
    dispatch = new CompiledMemoryDispatch({
      plan,
      adapters: [adapter],
      sourceId,
      generation,
    });
  } catch (error) {
    throw new McpMemoryPreflightError(
      error instanceof Error ? error.message : 'compiled dispatch refused the activation binding.',
    );
  }

  return adapter;
}

export function protocolError(): { code: number; message: string } {
  return { code: PROTOCOL_CODE, message: 'Trusted invocation context unavailable' };
}

