/**
 * Track A Lot A3 — bridge between graphify's TextJsonGenerationClient
 * contract and @sentropic/llm-mesh's provider-agnostic mesh.
 *
 * The first slice in this commit is intentionally a scaffold:
 *
 * - exposes `createGraphifyMesh(options)` which builds a
 *   StaticProviderRegistry from llm-mesh's default adapters and returns
 *   a configured `LlmMesh` instance ready to be consumed by future
 *   refactors of `wiki-description-generation` mode `mesh`.
 * - exposes `meshTextJsonClient(mesh, options)` which adapts the mesh
 *   to graphify's `TextJsonGenerationClient` so existing wiki
 *   description generation code can call it without knowing about the
 *   underlying mesh.
 *
 * Provider live SDK calls are NOT performed here — the mesh adapters
 * are scaffolds in @sentropic/llm-mesh@0.1.0 and accept injected
 * client implementations through registry overrides. Live wiring will
 * land in a follow-up commit alongside the wiki-description-generation
 * mesh-mode refactor.
 */

import {
  createDefaultProviderAdapters,
  createLlmMesh,
  StaticProviderRegistry,
  type AuthResolver,
  type CreateLlmMeshOptions,
  type GenerateRequest,
  type LlmMesh,
  type LlmMeshHooks,
  type ProviderAdapter,
  type ProviderId,
} from "@sentropic/llm-mesh";

import type {
  TextJsonGenerationClient,
  TextJsonGenerationInput,
  TextJsonGenerationResult,
} from "./llm-execution.js";

export interface CreateGraphifyMeshOptions {
  hooks?: LlmMeshHooks;
  /**
   * Override or extend the default provider adapter set. Useful for tests
   * (inject a mock adapter) and for environments that already wrap the
   * provider SDKs themselves.
   */
  adapters?: Partial<Record<ProviderId, ProviderAdapter>>;
  /**
   * Resolve auth material for a given request. Defaults to a no-op
   * resolver that returns null, leaving the adapter to read its own
   * credential env vars.
   */
  authResolver?: CreateLlmMeshOptions["authResolver"];
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

export function createGraphifyMesh(options: CreateGraphifyMeshOptions = {}): LlmMesh {
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
  return createLlmMesh({
    registry,
    authResolver: options.authResolver ?? requireAuthResolver,
    ...(options.hooks ? { hooks: options.hooks } : {}),
  });
}

export interface MeshTextJsonClientOptions {
  /**
   * The graphify-side LlmExecutionMode marker. Stored on the
   * generation result so consumers can tell mesh-mode apart from
   * direct/assistant/batch in the same audit pipeline.
   */
  mode?: "mesh";
  /** Default provider id used when a request does not pin one. */
  defaultProvider?: ProviderId;
  /** Default model id used when a request does not pin one. */
  defaultModel?: string;
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
  options: MeshTextJsonClientOptions = {},
): TextJsonGenerationClient {
  const provider = options.defaultProvider ?? "anthropic";
  return {
    mode: "mesh",
    provider,
    ...(options.defaultModel ? { model: options.defaultModel } : {}),
    async generateJson(input: TextJsonGenerationInput): Promise<TextJsonGenerationResult> {
      const request: GenerateRequest = {
        model: { providerId: provider, modelId: options.defaultModel ?? "" },
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
        ...(options.defaultModel ? { model: options.defaultModel } : {}),
        ...(input.outputPath ? { outputPath: input.outputPath } : {}),
        audit: {
          mesh: true,
          providerId: provider,
          modelId: options.defaultModel ?? null,
        },
      };
    },
  };
}

