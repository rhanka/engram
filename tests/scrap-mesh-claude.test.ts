import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClaudeCodeCliCapabilities, ClaudeCodeCliEvent, ClaudeCodeCliRunner, ReasoningEffort } from "@sentropic/llm-mesh";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGraphifyMesh, meshTextJsonClient } from "../src/llm-mesh-bridge.js";
import { isExtractUsageError, runExtract } from "../src/scrap/extract.js";

// Offline-only guard: never spawn the real `claude` CLI in tests.
const mockDefaultProbe = vi.fn<() => Promise<ClaudeCodeCliCapabilities>>();
const seatClientCalls: Array<Record<string, unknown>> = [];
vi.mock("@sentropic/llm-mesh/node", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@sentropic/llm-mesh/node")>();
  return {
    ...orig,
    probeClaudeCodeCliCapabilities: () => mockDefaultProbe(),
    createClaudeSeatAnthropicClient: (options: Record<string, unknown>) => {
      seatClientCalls.push(options);
      return orig.createClaudeSeatAnthropicClient(options as any);
    },
  };
});

const VALID_CAPS: ClaudeCodeCliCapabilities = {
  protocol: "claude-code-stream-json-v1",
  cliVersion: "2.1.330",
  source: "engram-scrap-mesh-host",
  qualificationRef: "engram-scrap-extract-v1",
};

const H1 = "<html><body><p>alpha street number one brighton</p></body></html>";
const H2 = "<html><body><p>beta street number two leeds</p></body></html>";

function twoOut(): { d: string; res: string } {
  const d = mkdtempSync(join(tmpdir(), "scclaude-"));
  const s1 = createHash("sha256").update(H1).digest("hex");
  const s2 = createHash("sha256").update(H2).digest("hex");
  mkdirSync(join(d, "snapshots"), { recursive: true });
  writeFileSync(join(d, "snapshots", `${s1}.html`), H1);
  writeFileSync(join(d, "snapshots", `${s2}.html`), H2);
  const page = (sha: string): unknown => ({ url: "http://x/", final_url: "http://x/", status: 200, bytes: 1, sha256: sha });
  writeFileSync(join(d, "state.jsonl"), `${JSON.stringify({ id: "a1", url: "http://x/1", status: "ok", pages: [page(s1)] })}\n${JSON.stringify({ id: "a2", url: "http://x/2", status: "ok", pages: [page(s2)] })}\n`);
  writeFileSync(join(d, "mission.json"), JSON.stringify({ fields: ["f"], instruction: "Extract." }));
  return { d, res: join(d, "results.ndjson") };
}

const allRows = (d: string): any[] => readFileSync(join(d, "results.ndjson"), "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const idRows = (d: string): any[] => allRows(d).filter((r) => r.type !== "summary");
const summaryRows = (d: string): any[] => allRows(d).filter((r) => r.type === "summary");

function claudeAuth() {
  return {
    material: {
      type: "account-transport",
      provider: "claude-code",
      accessToken: "stub-claude-seat-token",
      expiresAt: "2030-01-01T00:00:00.000Z",
      metadata: { scopes: ["user:inference"] },
    },
    descriptor: {
      sourceType: "account-transport",
      accountProviderId: "claude-code",
      accountId: "acct_claude_stub",
      metadata: { scopes: ["user:inference"] },
    },
  };
}

function claudeFacade(opts: { actualProviderId?: string; actualModelId?: string; seen?: { plans: number } } = {}): any {
  const actualProviderId = opts.actualProviderId ?? "anthropic";
  return {
    createRoutePlanner: (runtime: any) => ({
      plan: async (_subject: any, input: any) => {
        if (opts.seen) opts.seen.plans++;
        const actualModelId = opts.actualModelId ?? input.requestedModel;
        return {
          planRef: "plan-claude-stub",
          expiresAt: "2030-01-01T00:00:00.000Z",
          candidateRefs: ["c1"],
          policy: {},
          councilRevision: "council-stub",
          diagnostics: [{
            candidateRef: "c1",
            diagnosticAccountRef: "acct_claude_stub",
            requestedModel: input.requestedModel,
            actualProviderId,
            actualModelId,
            actualTransportProviderId: actualProviderId === "anthropic" ? "claude-code" : "codex",
            reason: "exact",
            cacheContinuityRisk: false,
          }],
        };
      },
      prepareAttempt: async () => ({
        attemptRef: "attempt-claude-stub",
        generate: (request: any) => runtime.generate({ ...request, auth: claudeAuth() }),
        stream: (request: any) => runtime.stream(request),
        recordOutcome: async () => {},
        markCommitted: async () => {},
        complete: async () => {},
        releaseCancelled: async () => {},
      }),
    }),
  };
}

function stubClaudeRunner(seenCalls: Array<{ modelId: string; prompt: string }>): ClaudeCodeCliRunner {
  return {
    run({ request }) {
      const prompt = request.messages.flatMap((m) => m.content).map((c) => (c.type === "text" ? c.text : "")).join("\n");
      seenCalls.push({ modelId: request.modelId, prompt });
      const text = prompt.includes("beta street")
        ? JSON.stringify({ f: { value: "beta street", quote: "beta street number two" } })
        : JSON.stringify({ f: { value: "alpha street", quote: "alpha street number one" } });
      async function* stream(): AsyncGenerator<ClaudeCodeCliEvent> {
        yield { type: "text_delta", text };
        yield { type: "result", finishReason: "stop", usage: { inputTokens: 18, outputTokens: 7 } };
      }
      return stream();
    },
  };
}

async function captureLogs(fn: () => Promise<void>): Promise<{ out: string[]; err: string[] }> {
  const origLog = console.log, origErr = console.error;
  const out: string[] = [], err: string[] = [];
  console.log = (...args: unknown[]) => { out.push(args.map(String).join(" ")); };
  console.error = (...args: unknown[]) => { err.push(args.map(String).join(" ")); };
  try { await fn(); } finally { console.log = origLog; console.error = origErr; }
  return { out, err };
}

async function runCli(args: string[], cwd: string): Promise<{ code: number | null; stderr: string[] }> {
  const { main } = await import("../src/cli.js");
  const pa = process.argv, pc = process.cwd(), pe = process.exit, ce = console.error, cl = console.log;
  let code: number | null = 0;
  const stderr: string[] = [];
  console.log = (() => {}) as any;
  console.error = ((...a: unknown[]) => { stderr.push(a.map(String).join(" ")); }) as any;
  (process as any).exit = ((c?: any) => { code = c ?? 0; throw new Error(`__exit__${code}`); }) as any;
  process.argv = ["node", "engram", ...args];
  process.chdir(cwd);
  try { await main(); } catch (e) { if (!String(e).includes("__exit__")) throw e; }
  finally { process.argv = pa; process.chdir(pc); process.exit = pe; console.error = ce; console.log = cl; }
  return { code, stderr };
}

beforeEach(async () => {
  const { resetClaudeCliProbe } = await import("../src/scrap/mesh-host.js");
  resetClaudeCliProbe();
  seatClientCalls.length = 0;
  mockDefaultProbe.mockReset();
  mockDefaultProbe.mockRejectedValue(new Error("test guard: unconfigured claude probe"));
});

describe("scrap mesh Claude seat + cross-family & failover guards", () => {
  it("routes mesh:claude-<catalog-id>-max through ClaudeCodeRuntimeClient + stub runner, forwards effort, and records provider/model", async () => {
    const { SEAT_WIRED, createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
    const seenPlans = { plans: 0 };
    const seenEfforts: Array<ReasoningEffort | undefined> = [];
    const seenCalls: Array<{ modelId: string; prompt: string }> = [];
    const probe = vi.fn(async () => VALID_CAPS);

    const { d } = twoOut();
    await captureLogs(() =>
      runExtract(
        { out: d, mission: join(d, "mission.json"), model: "mesh:claude-opus-5-max" },
        undefined,
        {
          createMeshClient: async (alias: string) =>
            createScrapMeshClient(alias, {
              facade: claudeFacade({ seen: seenPlans }),
              ownerScopes: ["owner:test"],
              probeClaudeCli: probe,
              createClaudeRunner: (opts) => {
                seenEfforts.push(opts.effort);
                return stubClaudeRunner(seenCalls);
              },
            }),
        },
      ),
    );

    expect(probe).toHaveBeenCalledTimes(1);
    expect(SEAT_WIRED.has("anthropic")).toBe(false);
    expect(seenPlans.plans).toBeGreaterThan(0);
    expect(seenEfforts).toEqual(["max"]);
    expect(seenCalls.map((c) => c.modelId)).toEqual(["claude-opus-5", "claude-opus-5"]);

    const rows = idRows(d);
    expect(rows).toHaveLength(2);
    expect(rows[0].fields.f).toEqual({ value: "alpha street", quote: "alpha street number one", sha256: expect.any(String) });
    expect(rows[1].fields.f).toEqual({ value: "beta street", quote: "beta street number two", sha256: expect.any(String) });
    for (const row of rows) {
      expect(row.mesh).toEqual({ provider: "anthropic", model: "claude-opus-5" });
      expect(row.tokens).toEqual({ inputTokens: 18, outputTokens: 7, totalTokens: 25 });
      expect(row.routed_mismatch).toBeUndefined();
    }
    expect(summaryRows(d)[0]).toMatchObject({ ok: 2, failed: 0, routed_mismatches: 0 });

    // Also verifies claude-fable-5-2-max and caches the probe across calls with the same probe fn.
    const fableEfforts: Array<ReasoningEffort | undefined> = [];
    const fableCalls: Array<{ modelId: string; prompt: string }> = [];
    const client = await createScrapMeshClient("claude-fable-5-2-max", {
      facade: claudeFacade(),
      ownerScopes: ["owner:test"],
      probeClaudeCli: probe,
      createClaudeRunner: (opts) => {
        fableEfforts.push(opts.effort);
        return stubClaudeRunner(fableCalls);
      },
    });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(client.provider).toBe("anthropic");
    expect(client.model).toBe("claude-fable-5-2");
    expect(client.effort).toBe("max");
    expect(fableEfforts).toEqual(["max"]);

    // Default production wiring: probes once across preflight + createScrapMeshClient and forwards effort to createClaudeSeatAnthropicClient.
    const { preflightMeshAlias, resetClaudeCliProbe } = await import("../src/scrap/mesh-host.js");
    resetClaudeCliProbe();
    expect(SEAT_WIRED.has("anthropic")).toBe(false);
    mockDefaultProbe.mockResolvedValue(VALID_CAPS);
    await preflightMeshAlias("claude-opus-5-low");
    await createScrapMeshClient("claude-opus-5-low", { facade: claudeFacade(), ownerScopes: ["owner:test"] });
    expect(mockDefaultProbe).toHaveBeenCalledTimes(1);
    expect(SEAT_WIRED.has("anthropic")).toBe(true);
    expect(seatClientCalls).toEqual([{ capabilities: VALID_CAPS, effort: "low" }]);
  });

  it("refuses Claude aliases with exit 2 and the probe reason before any planning when probe fails, keeping SEAT_WIRED without anthropic", async () => {
    const { SEAT_WIRED, createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
    const seenPlans = { plans: 0 };
    const failingProbe = vi.fn(async () => {
      throw new Error("claude CLI probe requires claude 2.1 or newer");
    });

    let err: unknown;
    try {
      await createScrapMeshClient("claude-opus-5-max", {
        facade: claudeFacade({ seen: seenPlans }),
        ownerScopes: ["owner:test"],
        probeClaudeCli: failingProbe,
      });
    } catch (e) {
      err = e;
    }

    expect(failingProbe).toHaveBeenCalledTimes(1);
    expect(seenPlans.plans).toBe(0);
    expect(SEAT_WIRED.has("anthropic")).toBe(false);
    expect(String(err)).toMatch(/claude CLI probe failed.*claude 2\.1 or newer/);
    expect(isExtractUsageError(err)).toBe(true);

    // End-to-end CLI exit 2 with the exact probe failure reason, offline via mocked probe.
    mockDefaultProbe.mockRejectedValueOnce(new Error("claude CLI probe failed to spawn the CLI"));
    const { d } = twoOut();
    const res = await runCli(["scrap", "extract", "--out", d, "--mission", join(d, "mission.json"), "--model", "mesh:claude-opus-5-low"], d);
    expect(res.code).toBe(2);
    expect(res.stderr.join("\n")).toContain("claude CLI probe failed to spawn the CLI");
  });

  it("keeps other providers (gemini, openai, muse, mistral) wired and untouched without probing claude", async () => {
    const { SEAT_WIRED, createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
    for (const p of ["gemini", "openai", "muse", "mistral"] as const) {
      expect(SEAT_WIRED.has(p)).toBe(true);
    }
    const probe = vi.fn(async () => { throw new Error("must not probe claude for gemini"); });
    const seen = { plans: 0 };
    const got = await createScrapMeshClient("gemini-4-hydrogen-high", {
      facade: claudeFacade({ actualProviderId: "gemini", actualModelId: "gemini-4-hydrogen", seen }),
      adapterClients: {
        gemini: {
          generate: async () => ({ id: "r", providerId: "gemini", modelId: "gemini-4-hydrogen", message: { role: "assistant", content: "{}" }, text: "{}", toolCalls: [], finishReason: "stop" }),
          stream: async () => { throw new Error("unused"); },
        },
      } as any,
      ownerScopes: ["owner:test"],
      probeClaudeCli: probe,
    });
    expect(probe).not.toHaveBeenCalled();
    expect(got.provider).toBe("gemini");
    expect(got.model).toBe("gemini-4-hydrogen");
    expect(got.effort).toBe("high");
    expect(seen.plans).toBe(1);
  });

  it("refuses cross-family aliases (e.g. claude-opus-5-5-max -> muse/openai/gemini, or normalizeExactModelId/planner cross-family) with exit 2 naming both before any request", async () => {
    const { createScrapMeshClient, resolveMeshAlias } = await import("../src/scrap/mesh-host.js");
    const probe = vi.fn(async () => VALID_CAPS);
    const seen = { plans: 0 };

    // 1. Built-in 0.38.6 gateway aliases (claude-opus-5-5-max, claude-sonnet-5-5-low, claude-haiku-5-5-low)
    for (const alias of ["claude-opus-5-5-max", "claude-sonnet-5-5-low", "claude-haiku-5-5-low"]) {
      let err: unknown;
      try {
        await createScrapMeshClient(alias, {
          facade: claudeFacade({ seen }),
          ownerScopes: ["owner:test"],
          probeClaudeCli: probe,
        });
      } catch (e) {
        err = e;
      }
      expect(String(err)).toContain(`mesh:${alias}`);
      expect(String(err)).toContain("anthropic");
      expect(String(err)).toMatch(/openai\/gpt-|gemini\/gemini-|muse\/muse-/);
      expect(String(err)).toMatch(/cross-family alias routing/);
      expect(isExtractUsageError(err)).toBe(true);
    }
    expect(probe).not.toHaveBeenCalled();
    expect(seen.plans).toBe(0);

    // 2. CLI exits 2 before probing or planning
    const { d } = twoOut();
    const cliRes = await runCli(["scrap", "extract", "--out", d, "--mission", join(d, "mission.json"), "--model", "mesh:claude-opus-5-5-max"], d);
    expect(cliRes.code).toBe(2);
    expect(cliRes.stderr.join("\n")).toContain("claude-opus-5-5-max");
    expect(cliRes.stderr.join("\n")).toContain("gpt-6.2-sol");
    expect(mockDefaultProbe).not.toHaveBeenCalled();

    // 3. Direct normalizeExactModelId mapping claude-* to a catalog model of another provider family
    expect(() => resolveMeshAlias("claude-opus-5-5-max", { normalize: () => "gpt-6.2-sol" }))
      .toThrow(/mesh:claude-opus-5-5-max.*anthropic.*openai\/gpt-6\.2-sol.*cross-family alias routing/);
    expect(() => resolveMeshAlias("claude-opus-5-5-max", { normalize: () => "gemini-4-neon" }))
      .toThrow(/mesh:claude-opus-5-5-max.*anthropic.*gemini\/gemini-4-neon.*cross-family alias routing/);

    // 4. Route planner returning a cross-family candidate is also refused before any request
    let planErr: unknown;
    try {
      await createScrapMeshClient("claude-opus-5-max", {
        facade: claudeFacade({ actualProviderId: "openai", actualModelId: "gpt-6.2-sol", seen }),
        ownerScopes: ["owner:test"],
        probeClaudeCli: probe,
      });
    } catch (e) {
      planErr = e;
    }
    expect(String(planErr)).toMatch(/mesh:claude-opus-5-max.*anthropic.*openai\/gpt-6\.2-sol.*cross-family alias routing/);
    expect(isExtractUsageError(planErr)).toBe(true);
  });

  it("records routed_mismatch: true with both resolved and routed provider/model on failover and counts it in summary", async () => {
    const { d } = twoOut();
    let callNum = 0;
    const failoverMesh = createGraphifyMesh({
      routingSubject: { principalRef: "p", ownerScopeRef: "owner:test" },
      createRoutePlanner: () => ({
        plan: async () => ({
          planRef: "plan-fo",
          expiresAt: "2030-01-01T00:00:00.000Z",
          candidateRefs: ["c0"],
          policy: {} as any,
          councilRevision: "rev-fo",
          diagnostics: [{
            candidateRef: "c0",
            diagnosticAccountRef: "a0",
            requestedModel: "claude-opus-5",
            actualProviderId: "anthropic",
            actualModelId: "claude-opus-5",
            actualTransportProviderId: "claude-code",
            reason: "exact",
            cacheContinuityRisk: false,
          }],
        }),
        prepareAttempt: async () => ({
          attemptRef: `att-${callNum}`,
          generate: async (req: any) => {
            callNum++;
            const userText = String(req?.messages?.[1]?.content ?? "");
            if (callNum === 1) {
              // First id fails over to openai/gpt-6.2-sol
              const text = JSON.stringify({ f: { value: "alpha street", quote: "alpha street number one" } });
              return { id: "r1", providerId: "openai", modelId: "gpt-6.2-sol", message: { role: "assistant", content: text }, text, toolCalls: [], finishReason: "stop", usage: { inputTokens: 10, outputTokens: 5 } };
            }
            // Second id stays on resolved anthropic/claude-opus-5 (proves mismatch does not bleed)
            const text = userText.includes("beta street")
              ? JSON.stringify({ f: { value: "beta street", quote: "beta street number two" } })
              : JSON.stringify({ f: { value: "alpha street", quote: "alpha street number one" } });
            return { id: "r2", providerId: "anthropic", modelId: "claude-opus-5", message: { role: "assistant", content: text }, text, toolCalls: [], finishReason: "stop", usage: { inputTokens: 10, outputTokens: 5 } };
          },
          stream: async () => { throw new Error("unused"); },
          recordOutcome: async () => {},
          markCommitted: async () => {},
          complete: async () => {},
          releaseCancelled: async () => {},
        }),
      }) as any,
    });
    const client = meshTextJsonClient(failoverMesh, { provider: "anthropic", model: "claude-opus-5" });
    const logs = await captureLogs(() =>
      runExtract(
        { out: d, mission: join(d, "mission.json"), model: "mesh:claude-opus-5-max" },
        undefined,
        { createMeshClient: async () => ({ client, provider: "anthropic", model: "claude-opus-5", effort: "max" }) },
      ),
    );

    const rows = idRows(d);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "a1",
      mesh: { provider: "openai", model: "gpt-6.2-sol" },
      routed_mismatch: true,
      resolved: { provider: "anthropic", model: "claude-opus-5" },
      routed: { provider: "openai", model: "gpt-6.2-sol" },
    });
    expect(rows[1].mesh).toEqual({ provider: "anthropic", model: "claude-opus-5" });
    expect(rows[1].routed_mismatch).toBeUndefined();

    const summary = summaryRows(d)[0];
    expect(summary).toMatchObject({ ok: 2, failed: 0, routed_mismatches: 1 });
    expect(logs.out.find((l) => l.includes("scrap extract summary"))).toContain("routed_mismatches=1");

    // Same-provider different-model failover is also flagged and counted.
    const { d: d2 } = twoOut();
    const sameProvClient = {
      generateJson: async (input: any) => {
        const text = String(input.prompt).includes("beta street")
          ? JSON.stringify({ f: { value: "beta street", quote: "beta street number two" } })
          : JSON.stringify({ f: { value: "alpha street", quote: "alpha street number one" } });
        await input.validateResponse?.(text);
        return { audit: { mesh: true, providerId: "anthropic", modelId: "claude-sonnet-5", usage: { inputTokens: 8, outputTokens: 4 } } };
      },
    };
    const logs2 = await captureLogs(() =>
      runExtract(
        { out: d2, mission: join(d2, "mission.json"), model: "mesh:claude-opus-5-max" },
        undefined,
        { createMeshClient: async () => ({ client: sameProvClient, provider: "anthropic", model: "claude-opus-5", effort: "max" }) },
      ),
    );
    for (const row of idRows(d2)) {
      expect(row).toMatchObject({
        mesh: { provider: "anthropic", model: "claude-sonnet-5" },
        routed_mismatch: true,
        resolved: { provider: "anthropic", model: "claude-opus-5" },
        routed: { provider: "anthropic", model: "claude-sonnet-5" },
      });
    }
    expect(summaryRows(d2)[0]).toMatchObject({ ok: 2, failed: 0, routed_mismatches: 2 });
    expect(logs2.out.find((l) => l.includes("scrap extract summary"))).toContain("routed_mismatches=2");
  });

  it("isolates injected probeClaudeCli from module-global SEAT_WIRED and resets custom probes via resetClaudeCliProbe", async () => {
    const { SEAT_WIRED, preflightMeshAlias, resetClaudeCliProbe } = await import("../src/scrap/mesh-host.js");
    const customPass = vi.fn(async () => VALID_CAPS);
    const customFail = vi.fn(async () => { throw new Error("custom stub failure"); });

    // 1. Passing injected probe does not mutate global SEAT_WIRED.
    expect(SEAT_WIRED.has("anthropic")).toBe(false);
    await preflightMeshAlias("claude-opus-5-low", { probeClaudeCli: customPass });
    expect(customPass).toHaveBeenCalledTimes(1);
    expect(SEAT_WIRED.has("anthropic")).toBe(false);

    // 2. Default host probe passing marks SEAT_WIRED; a subsequent failing injected probe does NOT delete it.
    mockDefaultProbe.mockResolvedValueOnce(VALID_CAPS);
    await preflightMeshAlias("claude-opus-5-low");
    expect(SEAT_WIRED.has("anthropic")).toBe(true);
    await expect(preflightMeshAlias("claude-opus-5-low", { probeClaudeCli: customFail })).rejects.toThrow(/custom stub failure/);
    expect(SEAT_WIRED.has("anthropic")).toBe(true);

    // 3. resetClaudeCliProbe clears both SEAT_WIRED and cached custom probe entries.
    resetClaudeCliProbe();
    expect(SEAT_WIRED.has("anthropic")).toBe(false);
    await preflightMeshAlias("claude-opus-5-low", { probeClaudeCli: customPass });
    expect(customPass).toHaveBeenCalledTimes(2);
    expect(SEAT_WIRED.has("anthropic")).toBe(false);
  });

  it("refuses non-catalog CANONICAL_TARGET_ROUTE_MAPPINGS aliases with cross-family fallbacks after a same-family primary (e.g. claude-sonnet-4-6)", async () => {
    const { createScrapMeshClient, resolveMeshAlias } = await import("../src/scrap/mesh-host.js");
    const probe = vi.fn(async () => VALID_CAPS);
    const seen = { plans: 0 };

    expect(() => resolveMeshAlias("claude-sonnet-4-6"))
      .toThrow(/mesh:claude-sonnet-4-6.*anthropic.*(?:muse|openai|gemini)\/.*cross-family alias routing/);

    let err: unknown;
    try {
      await createScrapMeshClient("claude-sonnet-4-6", {
        facade: claudeFacade({ seen }),
        ownerScopes: ["owner:test"],
        probeClaudeCli: probe,
      });
    } catch (e) {
      err = e;
    }
    expect(String(err)).toContain("mesh:claude-sonnet-4-6");
    expect(String(err)).toContain("cross-family alias routing");
    expect(String(err)).not.toContain("anthropic/claude-sonnet-5");
    expect(isExtractUsageError(err)).toBe(true);
    expect(probe).not.toHaveBeenCalled();
    expect(seen.plans).toBe(0);
  });

  it("increments routed_mismatches when audit has empty attempts or mismatches lastAudit after non-mismatched attempts", async () => {
    // 1. Empty attempts array on a mismatched mesh audit payload (both per-id row and summary count agree).
    const { d: dEmpty } = twoOut();
    let idx = 0;
    const emptyAttemptsClient = {
      generateJson: async (input: any) => {
        idx++;
        const text = String(input.prompt).includes("beta street")
          ? JSON.stringify({ f: { value: "beta street", quote: "beta street number two" } })
          : JSON.stringify({ f: { value: "alpha street", quote: "alpha street number one" } });
        await input.validateResponse?.(text);
        return idx === 1
          ? { audit: { mesh: true, providerId: "openai", modelId: "gpt-6.2-sol", attempts: [], usage: { inputTokens: 8, outputTokens: 4 } } }
          : { audit: { mesh: true, providerId: "anthropic", modelId: "claude-opus-5", attempts: [{ providerId: "anthropic", modelId: "claude-opus-5" }], usage: { inputTokens: 8, outputTokens: 4 } } };
      },
    };
    const logsEmpty = await captureLogs(() =>
      runExtract(
        { out: dEmpty, mission: join(dEmpty, "mission.json"), model: "mesh:claude-opus-5-max" },
        undefined,
        { createMeshClient: async () => ({ client: emptyAttemptsClient, provider: "anthropic", model: "claude-opus-5", effort: "max" }) },
      ),
    );
    expect(idRows(dEmpty)[0]).toMatchObject({
      id: "a1",
      routed_mismatch: true,
      resolved: { provider: "anthropic", model: "claude-opus-5" },
      routed: { provider: "openai", model: "gpt-6.2-sol" },
    });
    expect(idRows(dEmpty)[1].routed_mismatch).toBeUndefined();
    expect(summaryRows(dEmpty)[0]).toMatchObject({ ok: 2, failed: 0, calls_total: 2, routed_mismatches: 1 });
    expect(logsEmpty.out.find((l) => l.includes("scrap extract summary"))).toContain("routed_mismatches=1");

    // 2. Fallback curMismatch branch when attempts list matched resolved but lastAudit itself reports a different routed target.
    const { d: dFallback } = twoOut();
    let fbIdx = 0;
    const fallbackAuditClient = {
      generateJson: async (input: any) => {
        fbIdx++;
        const text = String(input.prompt).includes("beta street")
          ? JSON.stringify({ f: { value: "beta street", quote: "beta street number two" } })
          : JSON.stringify({ f: { value: "alpha street", quote: "alpha street number one" } });
        await input.validateResponse?.(text);
        return fbIdx === 1
          ? { audit: { mesh: true, providerId: "openai", modelId: "gpt-6.2-sol", attempts: [{ providerId: "anthropic", modelId: "claude-opus-5" }], usage: { inputTokens: 8, outputTokens: 4 } } }
          : { audit: { mesh: true, providerId: "anthropic", modelId: "claude-opus-5", attempts: [{ providerId: "anthropic", modelId: "claude-opus-5" }], usage: { inputTokens: 8, outputTokens: 4 } } };
      },
    };
    const logsFallback = await captureLogs(() =>
      runExtract(
        { out: dFallback, mission: join(dFallback, "mission.json"), model: "mesh:claude-opus-5-max" },
        undefined,
        { createMeshClient: async () => ({ client: fallbackAuditClient, provider: "anthropic", model: "claude-opus-5", effort: "max" }) },
      ),
    );
    expect(idRows(dFallback)[0]).toMatchObject({
      id: "a1",
      routed_mismatch: true,
      resolved: { provider: "anthropic", model: "claude-opus-5" },
      routed: { provider: "openai", model: "gpt-6.2-sol" },
    });
    expect(summaryRows(dFallback)[0]).toMatchObject({ ok: 2, failed: 0, routed_mismatches: 1 });
    expect(logsFallback.out.find((l) => l.includes("scrap extract summary"))).toContain("routed_mismatches=1");
  });
});
