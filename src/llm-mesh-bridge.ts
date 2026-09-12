/**
 * Bridge between graphify's TextJsonGenerationClient contract and a routed
 * @sentropic/llm-mesh runtime. The host supplies routing identity, planner,
 * adapters, and auth; graphify only executes the resulting capabilities.
 */

import { randomUUID } from "node:crypto";

import {
  createDefaultProviderAdapters,
  createLlmMesh,
  normalizeProviderError,
  StaticProviderRegistry,
  type AuthResolver,
  type GenerateRequest,
  type GenerateResponse,
  type LlmMesh,
  type LlmMeshHooks,
  type NormalizedProviderError,
  type ProviderAdapter,
  type ProviderId,
  type RouteAttemptUsage,
  type RouteFailureClassification,
  type RoutePlan,
  type RoutePlanInput,
  type RoutePlanner,
  type VerifiedRoutingSubject,
} from "@sentropic/llm-mesh";

import type {
  TextJsonGenerationClient,
  TextJsonGenerationInput,
  TextJsonGenerationResult,
} from "./llm-execution.js";

export interface CreateGraphifyMeshOptions {
  /** The non-secret authorization identity this mesh instance is bound to. */
  routingSubject: VerifiedRoutingSubject;
  /**
   * An opaque planner capability assembled by the host at its own account and
   * keyring boundary. Graphify never constructs that boundary itself.
   */
  createRoutePlanner: (
    runtime: Pick<LlmMesh, "generate" | "stream">,
  ) => RoutePlanner;
  hooks?: LlmMeshHooks;
  /**
   * Override or extend the default provider adapter set. Useful for tests
   * (inject a mock adapter) and for environments that already wrap the
   * provider SDKs themselves.
   */
  adapters?: Partial<Record<ProviderId, ProviderAdapter>>;
  /**
   * Resolve auth material for a given request. When omitted, the fail-closed
   * resolver below throws as soon as the runtime tries to resolve auth.
   */
  authResolver?: AuthResolver;
}

/**
 * Default auth resolver that throws a clear error. The graphify host
 * MUST inject its own resolver (env-var lookup, secret manager,
 * Codex transport, etc.) when calling `createGraphifyMesh`. We do
 * not invent a "null" auth because llm-mesh requires AuthResolution
 * shape with material + descriptor — silently faking it would mask
 * misconfiguration.
 */
const requireAuthResolver: AuthResolver = (request) => {
  throw new Error(
    `Graphify mesh: no authResolver configured for provider '${request.providerId}'. ` +
    `Pass createGraphifyMesh({ authResolver }) before calling generate().`,
  );
};

const routeIntents = new Set<RoutePlanInput["intent"]>([
  "coding",
  "general",
  "reasoning",
  "fast",
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : undefined;
}

function hasAbortShape(value: unknown, seen = new Set<unknown>()): boolean {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
  if (seen.has(value)) return false;
  seen.add(value);

  const record = value as Record<string, unknown>;
  if (record.name === "AbortError") return true;
  return hasAbortShape(record.cause, seen) || hasAbortShape(record.reason, seen);
}

/**
 * Map a normalized provider failure into the route planner's health taxonomy.
 *
 * Abort identity is checked first because llm-mesh normalization otherwise
 * gives an AbortError the same fields as an arbitrary unknown error. Unknown
 * and absent retry reasons both fail closed as a non-retryable invalid request:
 * without evidence of a provider/transport fault, graphify must not create a
 * fallback storm or penalize a broader provider health scope.
 */
export function classifyRouteFailure(
  error: NormalizedProviderError,
  signal?: AbortSignal,
): RouteFailureClassification {
  const code = error.code?.toLowerCase();
  const statusCode = error.statusCode;

  // `cause` is the only thing that establishes the abort actually caused this
  // failure. An aborted signal merely says an abort happened around the same
  // time, so it decides nothing on its own: a provider 500 that lands just
  // before the caller gives up is still the provider's failure, and hiding it
  // as a cancellation would keep a genuinely unhealthy route looking healthy.
  // The signal therefore only breaks the tie for an error carrying no provider
  // evidence at all — the case normalization cannot distinguish from an abort.
  const carriesProviderEvidence = statusCode !== undefined || code !== undefined;
  if (hasAbortShape(error.cause) || (signal?.aborted && !carriesProviderEvidence)) {
    return {
      reason: "cancelled",
      retryable: false,
      healthScope: "route",
    };
  }

  if (
    error.retryReason === "network" ||
    code === "enotfound" ||
    code === "econnreset" ||
    code === "econnrefused" ||
    code === "fetch_error" ||
    code?.includes("network")
  ) {
    return {
      reason: "network-unavailable",
      retryable: true,
      healthScope: "transport",
    };
  }

  if (
    error.retryReason === "server_error" ||
    error.retryReason === "overloaded" ||
    (typeof statusCode === "number" && statusCode >= 500 && statusCode <= 599)
  ) {
    return {
      reason: "provider-5xx",
      retryable: true,
      healthScope: "provider-model",
    };
  }

  if (
    error.retryReason === "timeout" ||
    statusCode === 408 ||
    code?.includes("timeout") ||
    code === "etimedout"
  ) {
    return {
      reason: "provider-5xx",
      retryable: true,
      healthScope: "provider-model",
    };
  }

  if (
    error.retryReason === "rate_limit" ||
    statusCode === 429 ||
    code?.includes("rate_limit")
  ) {
    return {
      reason: "rate-limited",
      retryable: true,
      ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
      healthScope: "account",
    };
  }

  const requiresReauth = Boolean(
    code?.includes("reauth") ||
    code?.includes("reenroll") ||
    code?.includes("re-enroll"),
  );
  if (requiresReauth) {
    return {
      reason: "reauth-required",
      retryable: false,
      healthScope: "account",
    };
  }

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    code === "unauthorized" ||
    code === "forbidden" ||
    code === "invalid_api_key"
  ) {
    return {
      reason: "auth-failed",
      retryable: false,
      healthScope: "account",
    };
  }

  if (statusCode === 400 || code === "invalid_request") {
    return {
      reason: "invalid-request",
      retryable: false,
      healthScope: "route",
    };
  }

  return {
    reason: "invalid-request",
    retryable: false,
    healthScope: "route",
  };
}

function requestedModel(request: GenerateRequest): string {
  if (request.modelId) return request.modelId;
  if (request.model && typeof request.model === "object") return request.model.modelId;
  if (typeof request.model === "string") {
    const separator = request.model.indexOf(":");
    return separator >= 0 ? request.model.slice(separator + 1) : request.model;
  }
  throw new Error(
    "Graphify mesh: a requested model is required. Pass request.modelId or request.model.",
  );
}

function routePlanInput(request: GenerateRequest): RoutePlanInput {
  const attributes = request.metadata?.attributes;
  const rawIntent = attributes?.intent;
  const rawAffinityKey = attributes?.affinityKey;
  const intent = typeof rawIntent === "string" && routeIntents.has(rawIntent as RoutePlanInput["intent"])
    ? rawIntent as RoutePlanInput["intent"]
    : undefined;
  const workspaceId = request.metadata?.workspaceId?.trim() || undefined;
  const affinityKey = typeof rawAffinityKey === "string" && rawAffinityKey.trim()
    ? rawAffinityKey.trim()
    : undefined;

  return {
    requestedModel: requestedModel(request),
    ...(intent ? { intent } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    ...(affinityKey ? { affinityKey } : {}),
  };
}

function requestProviderId(
  request: GenerateRequest,
  plan: RoutePlan,
  candidateRef: string,
): ProviderId {
  const planned = plan.diagnostics.find((diagnostic) => (
    diagnostic.candidateRef === candidateRef
  ))?.actualProviderId;
  if (planned) return planned as ProviderId;
  if (request.providerId) return request.providerId;
  if (request.model && typeof request.model === "object") return request.model.providerId;
  if (typeof request.model === "string") {
    const [providerId] = request.model.split(":", 1);
    if (providerId) return providerId as ProviderId;
  }

  // A conforming route plan always carries a diagnostic for each candidate.
  // This fallback is used only to give normalizeProviderError a namespace for a
  // malformed injected planner; it never influences routing or auth selection.
  return "local";
}

function isNormalizedProviderError(error: unknown): error is NormalizedProviderError {
  const record = asRecord(error);
  return Boolean(
    record &&
    typeof record.providerId === "string" &&
    typeof record.message === "string" &&
    typeof record.retryable === "boolean",
  );
}

function routeAttemptUsage(response: GenerateResponse): RouteAttemptUsage | undefined {
  const { inputTokens, outputTokens } = response.usage ?? {};
  if (inputTokens === undefined || outputTokens === undefined) return undefined;
  return {
    inputTokens,
    outputTokens,
    estimated: false,
  };
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  return Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
}

/**
 * Build one routed mesh bound to exactly one routing subject. A consumer with N
 * subjects constructs N instances; graphify performs no hidden multiplexing.
 *
 * A standalone host can create a façade with `createLlmMeshFacade({ mode: "cli",
 * configResolver })`, then pass `createRoutePlanner: (runtime) =>
 * facade.createRoutePlanner(runtime)` together with the enrolled account's
 * `ownerScopeRef`. The host likewise supplies its auth resolver; graphify never
 * opens or locates the host's vault.
 */
export function createGraphifyMesh(options: CreateGraphifyMeshOptions): LlmMesh {
  const defaultAdapters = createDefaultProviderAdapters();
  const overrides = options.adapters ?? {};
  // Replace any default adapter by its override match on providerId.
  const merged: ProviderAdapter[] = defaultAdapters.map((adapter) => {
    const override = overrides[adapter.provider.providerId];
    return override ?? adapter;
  });
  // Append overrides for providers that were not in the defaults set.
  for (const [providerId, adapter] of Object.entries(overrides)) {
    if (!adapter) continue;
    if (!merged.some((existing) => existing.provider.providerId === providerId)) {
      merged.push(adapter);
    }
  }
  const registry = new StaticProviderRegistry(merged);
  const runtime = createLlmMesh({
    registry,
    authResolver: options.authResolver ?? requireAuthResolver,
    ...(options.hooks ? { hooks: options.hooks } : {}),
  });
  const planner = options.createRoutePlanner(runtime);

  return {
    listProviders: runtime.listProviders,
    listModels: runtime.listModels,
    async generate(request: GenerateRequest): Promise<GenerateResponse> {
      if (request.signal?.aborted) throw abortReason(request.signal);

      const plan = await planner.plan(
        options.routingSubject,
        routePlanInput(request),
      );
      const requestId = request.metadata?.correlationId?.trim() || randomUUID();

      for (const [attemptIndex, candidateRef] of plan.candidateRefs.entries()) {
        const attempt = await planner.prepareAttempt(
          options.routingSubject,
          plan.planRef,
          candidateRef,
          requestId,
          attemptIndex,
        );

        if (request.signal?.aborted) {
          await attempt.releaseCancelled();
          throw abortReason(request.signal);
        }

        try {
          const response = await attempt.generate(request);
          await attempt.complete(routeAttemptUsage(response));
          return response;
        } catch (error) {
          const normalized = isNormalizedProviderError(error)
            ? error
            : normalizeProviderError(
              requestProviderId(request, plan, candidateRef),
              error,
            );
          const classification = classifyRouteFailure(normalized, request.signal);

          if (classification.reason === "cancelled") {
            await attempt.releaseCancelled();
          } else {
            await attempt.recordOutcome(classification);
          }

          const hasMoreCandidates = attemptIndex + 1 < plan.candidateRefs.length;
          if (!classification.retryable || !hasMoreCandidates) throw error;
        }
      }

      throw new Error("Graphify mesh: route planner returned no candidates");
    },
    async stream(): Promise<never> {
      throw new Error("Graphify mesh: routed streaming is not supported yet");
    },
  };
}

export interface MeshTextJsonClientOptions {
  /**
   * The graphify-side LlmExecutionMode marker. Stored on the
   * generation result so consumers can tell mesh-mode apart from
   * direct/assistant/batch in the same audit pipeline.
   */
  mode?: "mesh";
  /**
   * Provider id the mesh routes to. REQUIRED — graphify embeds no default
   * provider: a silent "anthropic" fallback would misroute the request (wrong
   * keyring entry, wrong audit trail) and hide a caller misconfiguration. The
   * radar-side assembler that owns the keyring picks the provider; graphify only
   * carries it through.
   */
  provider: ProviderId;
  /**
   * Model id the mesh routes to. REQUIRED for the same reason as `provider`: an
   * empty modelId is a silent lie about which model actually ran.
   */
  model: string;
}

/**
 * Wraps an LlmMesh as a TextJsonGenerationClient so existing wiki
 * description generation code can call it without depending on
 * @sentropic/llm-mesh directly.
 *
 * The body builds a minimal GenerateRequest from the
 * TextJsonGenerationInput (system prompt + user prompt = the schema
 * description and prompt graphify already crafts). The mesh routes to
 * the configured provider/model and returns the JSON text in the
 * `outputPath` file when one is provided, mirroring the
 * direct-backend client behaviour so callers do not need a separate
 * code path.
 */
export function meshTextJsonClient(
  mesh: LlmMesh,
  options: MeshTextJsonClientOptions,
): TextJsonGenerationClient {
  // Fail loud, never default: graphify must not invent a provider or model. A
  // silent "anthropic"/"" fallback would misroute to the wrong keyring entry and
  // lie in the audit trail about what actually ran. The radar-side assembler
  // that owns the keyring is the one that picks these.
  if (!options?.provider) {
    throw new Error(
      "meshTextJsonClient: an explicit provider is required — graphify does not default to a provider. Pass { provider, model }.",
    );
  }
  if (!options.model) {
    throw new Error(
      "meshTextJsonClient: an explicit model is required — an empty modelId would misreport which model ran. Pass { provider, model }.",
    );
  }
  const provider = options.provider;
  const model = options.model;
  return {
    mode: "mesh",
    provider,
    model,
    async generateJson(input: TextJsonGenerationInput): Promise<TextJsonGenerationResult> {
      const request: GenerateRequest = {
        providerId: provider,
        modelId: model,
        messages: [
          {
            role: "system",
            content: "You are Graphify's JSON extraction backend. Return only valid JSON matching the requested schema. Do not include Markdown prose outside the JSON object.",
          },
          {
            role: "user",
            content: input.prompt,
          },
        ],
        responseFormat: { type: "json-object" },
        ...(input.maxOutputTokens !== undefined
          ? { maxOutputTokens: input.maxOutputTokens }
          : {}),
      };
      const response = await mesh.generate(request);
      const text = response.text ?? "";
      // Mirror direct-backend behaviour: when an outputPath is provided,
      // graphify-side helpers expect the raw JSON written to disk so the
      // surrounding sidecar wrapper logic can read it back.
      if (input.outputPath) {
        const { writeFileSync } = await import("node:fs");
        const { dirname } = await import("node:path");
        const { mkdirSync } = await import("node:fs");
        mkdirSync(dirname(input.outputPath), { recursive: true });
        writeFileSync(input.outputPath, text, "utf-8");
      }
      return {
        status: "completed",
        provider,
        mode: "mesh",
        model,
        ...(input.outputPath ? { outputPath: input.outputPath } : {}),
        audit: {
          mesh: true,
          providerId: provider,
          modelId: model,
        },
      };
    },
  };
}
