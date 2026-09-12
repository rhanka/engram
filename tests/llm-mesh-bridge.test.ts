import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type {
  GenerateRequest,
  GenerateResponse,
  LlmMesh,
  NormalizedProviderError,
  PreparedRouteAttempt,
  RoutePlan,
  RoutePlanner,
  VerifiedRoutingSubject,
} from "@sentropic/llm-mesh";

import {
  classifyRouteFailure,
  createGraphifyMesh,
  meshTextJsonClient,
} from "../src/llm-mesh-bridge.js";

const tempDirs: string[] = [];

const routingSubject: VerifiedRoutingSubject = {
  principalRef: "principal:test",
  ownerScopeRef: "owner:test",
};

const generateResponse: GenerateResponse = {
  id: "response-1",
  providerId: "openai",
  modelId: "gpt-5.5",
  message: { role: "assistant", content: "{\"ok\":true}" },
  text: "{\"ok\":true}",
  toolCalls: [],
  finishReason: "stop",
  usage: { inputTokens: 12, outputTokens: 4 },
};

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-mesh-bridge-"));
  tempDirs.push(dir);
  return dir;
}

function fakeMesh(generate = vi.fn(async () => generateResponse)): LlmMesh {
  return {
    listProviders: () => [],
    listModels: () => [],
    generate,
    stream: vi.fn(),
  } as unknown as LlmMesh;
}

function routePlan(candidateRefs: readonly string[]): RoutePlan {
  return {
    planRef: "plan-1",
    expiresAt: "2030-01-01T00:00:00.000Z",
    candidateRefs,
    policy: {} as RoutePlan["policy"],
    councilRevision: "council-1",
    diagnostics: candidateRefs.map((candidateRef, index) => ({
      candidateRef,
      diagnosticAccountRef: `account-${index}`,
      requestedModel: "gpt-5.5",
      actualProviderId: "openai",
      actualModelId: "gpt-5.5",
      actualTransportProviderId: "openai",
      reason: "exact",
      cacheContinuityRisk: false,
    })),
  };
}

function routeAttempt(
  generate: PreparedRouteAttempt["generate"],
  events?: string[],
  label = "attempt",
): PreparedRouteAttempt {
  return {
    attemptRef: label,
    generate: vi.fn(async (request) => {
      events?.push(`${label}.generate`);
      return generate(request);
    }),
    stream: vi.fn(),
    recordOutcome: vi.fn(async () => {
      events?.push(`${label}.recordOutcome`);
    }),
    markCommitted: vi.fn(),
    complete: vi.fn(async () => {
      events?.push(`${label}.complete`);
    }),
    releaseCancelled: vi.fn(async () => {
      events?.push(`${label}.releaseCancelled`);
    }),
  } as PreparedRouteAttempt;
}

function routePlanner(
  attempts: readonly PreparedRouteAttempt[],
  events?: string[],
): RoutePlanner {
  return {
    plan: vi.fn(async () => {
      events?.push("plan");
      return routePlan(attempts.map((_, index) => `candidate-${index}`));
    }),
    prepareAttempt: vi.fn(async (_subject, _planRef, _candidateRef, _requestId, attemptIndex) => {
      events?.push(`prepareAttempt.${attemptIndex}`);
      return attempts[attemptIndex]!;
    }),
    describeAffinity: vi.fn(),
    promoteAffinity: vi.fn(),
    rebindAffinity: vi.fn(),
    resetAffinity: vi.fn(),
  } as unknown as RoutePlanner;
}

function normalizedError(
  overrides: Partial<NormalizedProviderError>,
): NormalizedProviderError {
  return {
    providerId: "openai",
    message: "provider request failed",
    retryable: false,
    ...overrides,
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe("graphify llm-mesh bridge", () => {
  it("createGraphifyMesh returns an LlmMesh-shaped routed runtime", () => {
    const planner = routePlanner([]);
    const mesh = createGraphifyMesh({
      routingSubject,
      createRoutePlanner: () => planner,
    });

    expect(typeof mesh.listProviders).toBe("function");
    expect(typeof mesh.listModels).toBe("function");
    expect(typeof mesh.generate).toBe("function");
    expect(typeof mesh.stream).toBe("function");
  });

  it("meshTextJsonClient exposes the graphify TextJsonGenerationClient shape", () => {
    const client = meshTextJsonClient(fakeMesh(), {
      provider: "anthropic",
      model: "claude-sonnet-5",
    });

    expect(client.mode).toBe("mesh");
    expect(client.provider).toBe("anthropic");
    expect(client.model).toBe("claude-sonnet-5");
    expect(typeof client.generateJson).toBe("function");
  });

  it("meshTextJsonClient forwards a flat provider/model selection and maxOutputTokens", async () => {
    const generate = vi.fn(async (_request: GenerateRequest) => generateResponse);
    const client = meshTextJsonClient(fakeMesh(generate), {
      provider: "openai",
      model: "gpt-5.5",
    });

    await client.generateJson({
      schema: "graphify_test_v1",
      prompt: "Return JSON",
      maxOutputTokens: 321,
    });

    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      providerId: "openai",
      modelId: "gpt-5.5",
      maxOutputTokens: 321,
      responseFormat: { type: "json-object" },
    });
    expect(generate.mock.calls[0]?.[0]).not.toHaveProperty("model");
  });

  it("meshTextJsonClient writes the generated JSON to outputPath", async () => {
    const outputPath = join(makeTempDir(), "nested", "result.json");
    const client = meshTextJsonClient(fakeMesh(), {
      provider: "openai",
      model: "gpt-5.5",
    });

    await client.generateJson({
      schema: "graphify_test_v1",
      prompt: "Return JSON",
      outputPath,
    });

    expect(readFileSync(outputPath, "utf-8")).toBe(generateResponse.text);
  });

  it("meshTextJsonClient requires an explicit provider and model", () => {
    const mesh = fakeMesh();

    expect(() => meshTextJsonClient(mesh, {} as never)).toThrow(/provider/i);
    expect(() => meshTextJsonClient(mesh, { provider: "anthropic" } as never)).toThrow(/model/i);
  });

  it("meshTextJsonClient carries a non-anthropic provider without a hardcoded default", () => {
    const client = meshTextJsonClient(fakeMesh(), { provider: "openai", model: "gpt-5.5" });

    expect(client.provider).toBe("openai");
    expect(client.model).toBe("gpt-5.5");
  });

  it("runs plan then prepareAttempt then generate then complete for one candidate", async () => {
    const events: string[] = [];
    const attempt = routeAttempt(async () => generateResponse, events, "candidate-0");
    const planner = routePlanner([attempt], events);
    const mesh = createGraphifyMesh({
      routingSubject,
      createRoutePlanner: () => planner,
    });

    const response = await mesh.generate({
      providerId: "openai",
      modelId: "gpt-5.5",
      messages: [{ role: "user", content: "hello" }],
      metadata: {
        correlationId: "request-1",
        workspaceId: "workspace-1",
        attributes: { intent: "reasoning", affinityKey: "affinity-1" },
      },
    });

    expect(response).toBe(generateResponse);
    expect(events).toEqual([
      "plan",
      "prepareAttempt.0",
      "candidate-0.generate",
      "candidate-0.complete",
    ]);
    expect(planner.plan).toHaveBeenCalledWith(routingSubject, {
      requestedModel: "gpt-5.5",
      intent: "reasoning",
      workspaceId: "workspace-1",
      affinityKey: "affinity-1",
    });
    expect(planner.prepareAttempt).toHaveBeenCalledWith(
      routingSubject,
      "plan-1",
      "candidate-0",
      "request-1",
      0,
    );
    expect(attempt.complete).toHaveBeenCalledWith({
      inputTokens: 12,
      outputTokens: 4,
      estimated: false,
    });
    expect(attempt.recordOutcome).not.toHaveBeenCalled();
  });

  it("records a retryable candidate failure and falls back to the next candidate", async () => {
    const retryableError = { code: "ECONNRESET", message: "connection reset" };
    const first = routeAttempt(async () => {
      throw retryableError;
    }, undefined, "candidate-0");
    const second = routeAttempt(async () => generateResponse, undefined, "candidate-1");
    const planner = routePlanner([first, second]);
    const mesh = createGraphifyMesh({
      routingSubject,
      createRoutePlanner: () => planner,
    });

    await expect(mesh.generate({
      providerId: "openai",
      modelId: "gpt-5.5",
      messages: [{ role: "user", content: "hello" }],
    })).resolves.toBe(generateResponse);

    expect(first.recordOutcome).toHaveBeenCalledWith({
      reason: "network-unavailable",
      retryable: true,
      healthScope: "transport",
    });
    expect(first.complete).not.toHaveBeenCalled();
    expect(second.generate).toHaveBeenCalledOnce();
    expect(second.complete).toHaveBeenCalledOnce();
  });

  it("records a non-retryable failure and rethrows without trying another candidate", async () => {
    const failure = new Error("arbitrary provider failure");
    const first = routeAttempt(async () => {
      throw failure;
    }, undefined, "candidate-0");
    const second = routeAttempt(async () => generateResponse, undefined, "candidate-1");
    const planner = routePlanner([first, second]);
    const mesh = createGraphifyMesh({
      routingSubject,
      createRoutePlanner: () => planner,
    });

    await expect(mesh.generate({
      providerId: "openai",
      modelId: "gpt-5.5",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toBe(failure);

    expect(first.recordOutcome).toHaveBeenCalledWith({
      reason: "invalid-request",
      retryable: false,
      healthScope: "route",
    });
    expect(second.generate).not.toHaveBeenCalled();
  });

  it("releases an abort-shaped failure as cancelled without recording provider health", async () => {
    const abort = Object.assign(new Error("cancelled by caller"), { name: "AbortError" });
    const attempt = routeAttempt(async () => {
      throw abort;
    });
    const planner = routePlanner([attempt]);
    const mesh = createGraphifyMesh({
      routingSubject,
      createRoutePlanner: () => planner,
    });

    await expect(mesh.generate({
      providerId: "openai",
      modelId: "gpt-5.5",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toBe(abort);

    expect(attempt.releaseCancelled).toHaveBeenCalledOnce();
    expect(attempt.recordOutcome).not.toHaveBeenCalled();
  });

  it("uses the fail-closed requireAuthResolver when no authResolver is supplied", async () => {
    let runtime: Pick<LlmMesh, "generate" | "stream">;
    const planner = routePlanner([]);
    planner.plan = vi.fn(async () => routePlan(["candidate-0"]));
    planner.prepareAttempt = vi.fn(async () => routeAttempt((request) => runtime.generate(request)));
    const mesh = createGraphifyMesh({
      routingSubject,
      createRoutePlanner: (createdRuntime) => {
        runtime = createdRuntime;
        return planner;
      },
    });

    await expect(mesh.generate({
      providerId: "openai",
      modelId: "gpt-5.5",
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toThrow("Graphify mesh: no authResolver configured for provider 'openai'");
  });
});

describe("classifyRouteFailure", () => {
  it("checks abort-shaped cause before the conservative no-retryReason default", () => {
    const common = normalizedError({ retryable: false });
    const abortCause = Object.assign(new Error("same normalized shape"), { name: "AbortError" });
    const arbitraryCause = new Error("same normalized shape");

    expect(classifyRouteFailure({ ...common, cause: abortCause })).toEqual({
      reason: "cancelled",
      retryable: false,
      healthScope: "route",
    });
    expect(classifyRouteFailure({ ...common, cause: arbitraryCause })).toEqual({
      reason: "invalid-request",
      retryable: false,
      healthScope: "route",
    });
  });

  it("keeps a provider failure that lands during an abort attributed to the provider", () => {
    const controller = new AbortController();
    controller.abort();

    // The signal says an abort happened around now; the error says the provider
    // returned 500. Only `cause` could show the abort caused this failure, and
    // nothing here does. Calling it `cancelled` would hide a real 5xx from the
    // provider's health scope and leave an unhealthy route looking healthy.
    expect(
      classifyRouteFailure(normalizedError({ statusCode: 500, retryable: true }), controller.signal),
    ).toEqual({
      reason: "provider-5xx",
      retryable: true,
      healthScope: "provider-model",
    });
  });

  it("lets an aborted signal decide only when the error carries no provider evidence", () => {
    const controller = new AbortController();
    controller.abort();

    expect(classifyRouteFailure(normalizedError({ retryable: false }), controller.signal)).toEqual({
      reason: "cancelled",
      retryable: false,
      healthScope: "route",
    });
  });

  it.each(["ENOTFOUND", "ECONNRESET"])(
    "maps network code %s to a retryable transport failure",
    (code) => {
      expect(classifyRouteFailure(normalizedError({ code }))).toEqual({
        reason: "network-unavailable",
        retryable: true,
        healthScope: "transport",
      });
    },
  );

  it("maps the network retry reason to a retryable transport failure", () => {
    expect(classifyRouteFailure(normalizedError({
      retryable: true,
      retryReason: "network",
    }))).toEqual({
      reason: "network-unavailable",
      retryable: true,
      healthScope: "transport",
    });
  });

  it.each([
    normalizedError({ retryable: true, retryReason: "server_error" }),
    normalizedError({ retryable: true, retryReason: "overloaded" }),
    normalizedError({ statusCode: 501 }),
  ])("maps server, overloaded, and 5xx failures to provider-5xx", (error) => {
    expect(classifyRouteFailure(error)).toEqual({
      reason: "provider-5xx",
      retryable: true,
      healthScope: "provider-model",
    });
  });

  it("maps timeout to provider-5xx because the route contract has no timeout reason", () => {
    expect(classifyRouteFailure(normalizedError({
      retryable: true,
      retryReason: "timeout",
    }))).toEqual({
      reason: "provider-5xx",
      retryable: true,
      healthScope: "provider-model",
    });
  });

  it("maps rate limits and preserves retryAfterMs", () => {
    expect(classifyRouteFailure(normalizedError({
      retryable: true,
      retryReason: "rate_limit",
      statusCode: 429,
      retryAfterMs: 2_500,
    }))).toEqual({
      reason: "rate-limited",
      retryable: true,
      retryAfterMs: 2_500,
      healthScope: "account",
    });
  });

  it.each([401, 403])("maps HTTP %s to a non-retryable account auth failure", (statusCode) => {
    expect(classifyRouteFailure(normalizedError({ statusCode }))).toEqual({
      reason: "auth-failed",
      retryable: false,
      healthScope: "account",
    });
  });

  it("maps a re-enrollment signal to reauth-required", () => {
    expect(classifyRouteFailure(normalizedError({
      code: "reenrollment_required",
      statusCode: 401,
    }))).toEqual({
      reason: "reauth-required",
      retryable: false,
      healthScope: "account",
    });
  });

  it("maps HTTP 400 to a non-retryable invalid request", () => {
    expect(classifyRouteFailure(normalizedError({ statusCode: 400 }))).toEqual({
      reason: "invalid-request",
      retryable: false,
      healthScope: "route",
    });
  });

  it("maps retryReason unknown to the conservative non-retryable failure", () => {
    expect(classifyRouteFailure(normalizedError({
      retryable: true,
      retryReason: "unknown",
    }))).toEqual({
      reason: "invalid-request",
      retryable: false,
      healthScope: "route",
    });
  });

  it("maps an absent retryReason to the same conservative non-retryable failure", () => {
    expect(classifyRouteFailure(normalizedError({ retryable: false }))).toEqual({
      reason: "invalid-request",
      retryable: false,
      healthScope: "route",
    });
  });
});
