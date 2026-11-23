import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { isExtractUsageError, runExtract } from "../src/scrap/extract.js";

// Offline mesh-host tests: a stub transport/adapter answers canned JSON in
// memory, so no real seat is ever called. The stub plugs in at the adapter
// client edge; alias validation, scope probing, mesh assembly, quote
// verification and receipt recording all run the real code.
const H1 = "<html><body><p>alpha street number one brighton</p></body></html>";
const H2 = "<html><body><p>beta street number two leeds</p></body></html>";
const T1 = "alpha street number one brighton";
const T2 = "beta street number two leeds";

function twoOut(): { d: string; res: string } {
  const d = mkdtempSync(join(tmpdir(), "scmesh-"));
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

const lines = (d: string): any[] => readFileSync(join(d, "results.ndjson"), "utf-8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.type !== "summary");

// Stub adapter client: answers canned JSON keyed by prompt, with usage, like a
// seat transport would (the host never sees a real seat here).
function stubClient() {
  return {
    generate: async (request: any) => {
      const userText = String(request?.messages?.[1]?.content ?? "");
      const text = userText.includes("beta street")
        ? JSON.stringify({ f: { value: "beta street", quote: "beta street number two" } })
        : JSON.stringify({ f: { value: "alpha street", quote: "alpha street number one" } });
      await request?.validateResponse?.(text);
      return {
        id: "stub-resp",
        providerId: "gemini",
        modelId: "gemini-4-hydrogen",
        message: { role: "assistant", content: [{ type: "text", text }] },
        text,
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
        finishReason: "stop",
      };
    },
    stream: async () => { throw new Error("stream not used"); },
  };
}

// Stub route planner behind a fake facade: "ok" plans one candidate, "empty"
// reports no eligible route. prepareAttempt delegates to the mesh runtime so
// the real generate/validate/complete lifecycle runs against the stub client.
function fakeFacade(mode: "ok" | "empty", seen: { plans: number }): any {
  return {
    createRoutePlanner: (runtime: any) => ({
      plan: async (_subject: any, input: any) => {
        seen.plans++;
        if (mode === "empty") throw Object.assign(new Error("No eligible route"), { code: "no-route", name: "RoutePlanError" });
        return {
          planRef: "plan-stub",
          expiresAt: "2030-01-01T00:00:00.000Z",
          candidateRefs: ["c1"],
          policy: {},
          councilRevision: "council-stub",
          diagnostics: [{
            candidateRef: "c1",
            diagnosticAccountRef: "acct_stub",
            requestedModel: input.requestedModel,
            actualProviderId: "gemini",
            actualModelId: "gemini-4-hydrogen",
            actualTransportProviderId: "cloud-code",
            reason: "alias",
            cacheContinuityRisk: false,
          }],
        };
      },
      prepareAttempt: async () => ({
        attemptRef: "attempt-stub",
        // Mirrors the real service routeAttempt: the attempt injects the
        // acquisition auth per request, so the mesh-level authResolver stays
        // fail-closed and is never consulted.
        generate: (request: any) => runtime.generate({
          ...request,
          auth: { material: { type: "direct-token", token: "stub-seat" }, descriptor: { sourceType: "direct-token" } },
        }),
        stream: (request: any) => runtime.stream(request),
        recordOutcome: async () => {},
        markCommitted: async () => {},
        complete: async () => {},
        releaseCancelled: async () => {},
      }),
    }),
  };
}

function meshDeps(mode: "ok" | "empty", seen: { plans: number }) {
  return {
    createMeshClient: async (alias: string) => {
      const { createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
      return createScrapMeshClient(alias, {
        facade: fakeFacade(mode, seen),
        adapterClients: { gemini: stubClient() } as any,
        ownerScopes: ["owner:test"],
      });
    },
  };
}

describe("scrap mesh host", () => {
  it("routes a mesh: alias through the stub seat and records provider/model + usage", async () => {
    const seen = { plans: 0 };
    const { d } = twoOut();
    await runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, meshDeps("ok", seen));
    expect(seen.plans).toBeGreaterThan(0);
    const rows = lines(d);
    expect(rows.length).toBe(2);
    expect(rows[0].fields.f).toEqual({ value: "alpha street", quote: "alpha street number one", sha256: expect.any(String) });
    expect(rows[1].fields.f).toEqual({ value: "beta street", quote: "beta street number two", sha256: expect.any(String) });
    for (const row of rows) {
      expect(row.mesh).toEqual({ provider: "gemini", model: "gemini-4-hydrogen" });
      expect(row.tokens).toEqual({ inputTokens: 10, outputTokens: 5 });
    }
  });

  it("rejects an unknown mesh alias before any planning", async () => {
    const seen = { plans: 0 };
    const { createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
    await expect(createScrapMeshClient("luna-9", {
      facade: fakeFacade("ok", seen),
      adapterClients: { gemini: stubClient() } as any,
      ownerScopes: ["owner:test"],
    })).rejects.toThrow(/unknown mesh alias/);
    expect(seen.plans).toBe(0);
    const { d } = twoOut();
    await expect(runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:luna-9" }, undefined, meshDeps("ok", seen))).rejects.toThrow(/unknown mesh alias/);
    expect(isExtractUsageError(new Error('scrap extract: unknown mesh alias "mesh:luna-9"'))).toBe(true);
  });

  it("rejects when no seat can serve the alias", async () => {
    const seen = { plans: 0 };
    const { d } = twoOut();
    await expect(runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, meshDeps("empty", seen))).rejects.toThrow(/no usable mesh seat/);
    expect(seen.plans).toBeGreaterThan(0);
    expect(isExtractUsageError(new Error("scrap extract: no usable mesh seat for X"))).toBe(true);
  });

  it("names the planner reason (reauth-required) when no seat can serve the alias", async () => {
    const { createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
    const facade = { createRoutePlanner: () => ({ plan: async () => { throw Object.assign(new Error("No eligible route"), {
      name: "RoutePlanError", code: "no-route",
      diagnostics: [{ code: "reauth-required", transportProviderId: "cloud-code", message: "re-authenticate the account" }],
    }); } }) };
    // Kills a mutant that drops the diagnostics from the message.
    await expect(createScrapMeshClient("gemini-4-hydrogen-high", { facade: facade as any, adapterClients: { gemini: stubClient() } as any, ownerScopes: ["owner:test"] }))
      .rejects.toThrow(/no usable mesh seat.*reasons: cloud-code: reauth-required/);
  });

  it("rejects a catalog alias whose provider has no seat executor in this host", async () => {
    const seen = { plans: 0 };
    const { createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
    await expect(createScrapMeshClient("command-a-03-2025", {
      facade: fakeFacade("ok", seen),
      adapterClients: { gemini: stubClient() } as any,
      ownerScopes: ["owner:test"],
    })).rejects.toThrow(/no seat executor/);
    expect(seen.plans).toBe(0);
  });

  it("records the routed response provider/model, not the requested alias", async () => {
    const seen = { plans: 0 };
    const { d } = twoOut();
    const routed = stubClient();
    const prev = routed.generate;
    routed.generate = (async (request: any) => ({ ...(await prev(request)), providerId: "openai", modelId: "gpt-routed-1" })) as any;
    await runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, {
      createMeshClient: async (alias: string) => {
        const { createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
        return createScrapMeshClient(alias, {
          facade: fakeFacade("ok", seen),
          adapterClients: { gemini: routed } as any,
          ownerScopes: ["owner:test"],
        });
      },
    });
    for (const row of lines(d)) expect(row.mesh).toEqual({ provider: "openai", model: "gpt-routed-1" });
  });

  it("aborts on seat-acquisition deferral without poisoning rows, and retries on resume", async () => {
    const deferred = () => Object.assign(new Error("Token refresh deferred; retry later"), { code: "no_active_account", name: "RefreshDeferredError" });
    const seen = { plans: 0 };
    const { d } = twoOut();
    const base = meshDeps("ok", seen);
    const flaky = {
      createMeshClient: async (alias: string) => {
        const inner = await base.createMeshClient(alias);
        return {
          client: {
            generateJson: async (input: any) => {
              if (String(input.prompt).includes("beta street")) throw deferred();
              return (inner as any).client.generateJson(input);
            },
          },
        };
      },
    };
    await expect(runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, flaky)).rejects.toThrow(/Token refresh deferred/);
    const rows = lines(d);
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("a1");
    expect(rows[0].error).toBeUndefined();
    await runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, meshDeps("ok", seen));
    const ok = lines(d).filter((r: any) => !r.error);
    expect(ok.map((r: any) => r.id).sort()).toEqual(["a1", "a2"]);
    expect(ok.filter((r: any) => r.id === "a1").length).toBe(1);
  });

  it("records error_detail on failed rows, skips them on plain resume, and retries them with --retry-failed", async () => {
    const { d } = twoOut();
    const boom = {
      createMeshClient: async () => ({
        client: {
          generateJson: async (input: any) => {
            if (String(input.prompt).includes("beta street")) throw new Error("provider exploded (status 500)");
            await input.validateResponse?.(JSON.stringify({ f: { value: "alpha street", quote: "alpha street number one" } }));
            return { audit: {} };
          },
        },
      }),
    };
    await runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:x" }, undefined, boom as any);
    const rows = lines(d);
    expect(rows.length).toBe(2);
    expect(rows[1]).toMatchObject({ id: "a2", error: "llm_error", error_detail: expect.stringContaining("provider exploded") });
    const seen = { plans: 0 };
    await runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, meshDeps("ok", seen));
    expect(seen.plans).toBe(0);
    expect(lines(d).length).toBe(2);
    await runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high", retryFailed: true }, undefined, meshDeps("ok", seen));
    expect(lines(d).filter((r: any) => !r.error).map((r: any) => r.id).sort()).toEqual(["a1", "a2"]);
  });

  it("rejects unknown mesh aliases even when todo is empty or state.jsonl is missing", async () => {
    const seen = { plans: 0 };
    const full = twoOut();
    await runExtract({ out: full.d, mission: join(full.d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, meshDeps("ok", seen));
    expect(lines(full.d).length).toBe(2);
    await expect(runExtract({ out: full.d, mission: join(full.d, "mission.json"), model: "mesh:luna-9" })).rejects.toThrow(/unknown mesh alias/);
    const bare = mkdtempSync(join(tmpdir(), "scmesh-bare-"));
    writeFileSync(join(bare, "mission.json"), JSON.stringify({ fields: ["f"], instruction: "Extract." }));
    await expect(runExtract({ out: bare, mission: join(bare, "mission.json"), model: "mesh:luna-9" })).rejects.toThrow(/unknown mesh alias/);
    await expect(runExtract({ out: bare, mission: join(bare, "mission.json"), model: "mesh:command-a-03-2025" })).rejects.toThrow(/no seat executor/);
    expect(isExtractUsageError(new Error("scrap extract: no seat executor for X"))).toBe(true);
    expect(seen.plans).toBeGreaterThan(0);
  });

  it("discovers owner scopes from :index/:public records without touching :envelope", async () => {
    const reads: string[] = [];
    const keyring = {
      getSecret: async (key: string) => {
        reads.push(key);
        if (key === "sentropic-llm-mesh:accounts:index") return JSON.stringify(["acc1", "accBad"]);
        if (key === "sentropic-llm-mesh:acc1:public") return JSON.stringify({ account: { ownerScopeRef: "owner:k1" } });
        if (key === "sentropic-llm-mesh:accBad:public") return "junk{{{";
        return null;
      },
      setSecret: async () => {},
      deleteSecret: async () => {},
    };
    const seen = { plans: 0 };
    const { createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
    const got = await createScrapMeshClient("gemini-4-hydrogen-high", {
      facade: fakeFacade("ok", seen),
      adapterClients: { gemini: stubClient() } as any,
      keyring: keyring as any,
    });
    expect(got.ownerScope).toBe("owner:k1");
    expect(reads).toContain("sentropic-llm-mesh:accounts:index");
    expect(reads.some((k) => k.includes(":envelope"))).toBe(false);
  });

  it("surfaces keyring permission errors and honors ENGRAM_MESH_OWNER_SCOPE", async () => {
    const { createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
    const denied = {
      getSecret: async () => { throw Object.assign(new Error("EACCES: permission denied"), { name: "KeyringInsecurePermissionsError" }); },
      setSecret: async () => {},
      deleteSecret: async () => {},
    };
    await expect(createScrapMeshClient("gemini-4-hydrogen-high", {
      facade: fakeFacade("ok", { plans: 0 }),
      adapterClients: { gemini: stubClient() } as any,
      keyring: denied as any,
    })).rejects.toThrow(/EACCES/);
    const corrupt = {
      getSecret: async (k: string) => (k.endsWith(":index") ? "not-json{{{ " : null),
      setSecret: async () => {},
      deleteSecret: async () => {},
    };
    await expect(createScrapMeshClient("gemini-4-hydrogen-high", {
      facade: fakeFacade("ok", { plans: 0 }),
      adapterClients: { gemini: stubClient() } as any,
      keyring: corrupt as any,
    })).rejects.toThrow(/no owner scopes found/);
    const saved = process.env.ENGRAM_MESH_OWNER_SCOPE;
    process.env.ENGRAM_MESH_OWNER_SCOPE = "owner:env";
    try {
      await expect(createScrapMeshClient("gemini-4-hydrogen-high", {
        facade: fakeFacade("empty", { plans: 0 }),
        adapterClients: { gemini: stubClient() } as any,
      })).rejects.toThrow(/owner:env/);
    } finally {
      if (saved === undefined) delete process.env.ENGRAM_MESH_OWNER_SCOPE;
      else process.env.ENGRAM_MESH_OWNER_SCOPE = saved;
    }
  });

  it("cli main exits 2 for unknown mesh aliases and seat-less providers", async () => {
    const { main } = await import("../src/cli.js");
    async function cli(args: string[], cwd: string): Promise<number | null> {
      const pa = process.argv, pc = process.cwd(), pe = process.exit, ce = console.error, cl = console.log;
      let code: number | null = 0;
      console.log = (() => {}) as any; console.error = (() => {}) as any;
      (process as any).exit = ((c?: any) => { code = c ?? 0; throw new Error(`__exit__${code}`); }) as any;
      process.argv = ["node", "engram", ...args]; process.chdir(cwd);
      try { await main(); } catch (e) { if (!String(e).includes("__exit__")) throw e; }
      finally { process.argv = pa; process.chdir(pc); process.exit = pe; console.error = ce; console.log = cl; }
      return code;
    }
    const { d } = twoOut();
    expect(await cli(["scrap", "extract", "--out", d, "--mission", join(d, "mission.json"), "--model", "mesh:luna-9"], d)).toBe(2);
    expect(await cli(["scrap", "extract", "--out", d, "--mission", join(d, "mission.json"), "--model", "mesh:command-a-03-2025"], d)).toBe(2);
  });

  it("leaves the direct path unchanged (no mesh receipt, injected client used)", async () => {
    const { d } = twoOut();
    const client = {
      generateJson: async (input: any) => {
        await input.validateResponse?.(JSON.stringify({ f: { value: "alpha street", quote: "alpha street number one" } }));
        return { status: "completed", provider: "test", mode: "direct", audit: { usage: { input: 1, output: 2 } } };
      },
    };
    await runExtract({ out: d, mission: join(d, "mission.json"), model: "openai:gpt-5-mini" }, client as any);
    const rows = lines(d);
    expect(rows[0].fields.f.value).toBe("alpha street");
    expect(rows[0].mesh).toBeUndefined();
    expect(rows[0].tokens).toEqual({ input: 1, output: 2 });
  });

  it("delegates mesh creation to llm-mesh-core createGraphifyMeshCore through the lazy loader", async () => {
    const { createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
    const { createGraphifyMeshCore } = await import("../src/llm-mesh-core.js");
    const [realMesh, realFacade, realNode] = await Promise.all([
      import("@sentropic/llm-mesh"),
      import("@sentropic/llm-mesh/facade"),
      import("@sentropic/llm-mesh/node"),
    ]);
    let createGraphifyMeshSpy!: ReturnType<typeof vi.fn>;
    let meshTextJsonClientSpy!: ReturnType<typeof vi.fn>;
    const createMeshCoreSpy = vi.fn((primitives: Parameters<typeof createGraphifyMeshCore>[0]) => {
      const core = createGraphifyMeshCore(primitives);
      createGraphifyMeshSpy = vi.fn(core.createGraphifyMesh);
      meshTextJsonClientSpy = vi.fn(core.meshTextJsonClient);
      return {
        ...core,
        createGraphifyMesh: createGraphifyMeshSpy,
        meshTextJsonClient: meshTextJsonClientSpy,
      };
    });
    const seen = { plans: 0 };

    const { d } = twoOut();
    await runExtract(
      { out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" },
      undefined,
      {
        createMeshClient: (alias) => createScrapMeshClient(alias, {
          facade: fakeFacade("ok", seen),
          adapterClients: { gemini: stubClient() } as any,
          ownerScopes: ["owner:test"],
          loadMeshRuntime: async () => ({
            mesh: realMesh,
            facade: realFacade,
            node: realNode,
          }),
          createMeshCore: createMeshCoreSpy,
        }),
      },
    );

    // Kills a mutant where mesh-host bypasses createGraphifyMeshCore or fails to forward the four runtime primitives from the lazy mesh module.
    expect(createMeshCoreSpy).toHaveBeenCalledTimes(1);
    expect(createMeshCoreSpy.mock.calls[0]?.[0]).toEqual({
      createDefaultProviderAdapters: realMesh.createDefaultProviderAdapters,
      createLlmMesh: realMesh.createLlmMesh,
      normalizeProviderError: realMesh.normalizeProviderError,
      StaticProviderRegistry: realMesh.StaticProviderRegistry,
    });
    // Kills a mutant where mesh-host bypasses core.createGraphifyMesh with its own routing loop.
    expect(createGraphifyMeshSpy).toHaveBeenCalledTimes(1);
    const createOpts = createGraphifyMeshSpy.mock.calls[0]?.[0];
    // Kills a mutant that drops routingSubject or configures a non-fail-closed authResolver on the core call.
    expect(createOpts?.routingSubject).toEqual({ principalRef: "engram-scrap-cli", ownerScopeRef: "owner:test" });
    expect(createOpts?.authResolver).toBeUndefined();
    expect(createOpts?.adapters?.gemini).toBeDefined();
    // Kills a mutant where mesh-host bypasses core.meshTextJsonClient.
    expect(meshTextJsonClientSpy).toHaveBeenCalledTimes(1);
    expect(meshTextJsonClientSpy.mock.calls[0]?.[1]).toEqual({
      provider: "gemini",
      model: "gemini-4-hydrogen",
      effort: "high",
    });
    expect(lines(d)).toHaveLength(2);
    expect(lines(d)[0].mesh).toEqual({ provider: "gemini", model: "gemini-4-hydrogen" });
  });

  it("propagates core failure attempts to extract metrics through the shared llm-mesh-errors module without globalThis", async () => {
    const { createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
    const { createGraphifyMeshCore } = await import("../src/llm-mesh-core.js");
    const [realMesh, realFacade, realNode] = await Promise.all([
      import("@sentropic/llm-mesh"),
      import("@sentropic/llm-mesh/facade"),
      import("@sentropic/llm-mesh/node"),
    ]);
    let createGraphifyMeshSpy!: ReturnType<typeof vi.fn>;
    const createMeshCoreSpy = vi.fn((primitives: Parameters<typeof createGraphifyMeshCore>[0]) => {
      const core = createGraphifyMeshCore(primitives);
      createGraphifyMeshSpy = vi.fn(core.createGraphifyMesh);
      return {
        ...core,
        createGraphifyMesh: createGraphifyMeshSpy,
      };
    });
    const frozenErr = Object.freeze(new Error("frozen second-candidate failure"));
    let planCall = 0;
    const failoverFacade = {
      createRoutePlanner: () => ({
        plan: async () => {
          planCall++;
          return {
            planRef: `plan-fail-${planCall}`,
            expiresAt: "2030-01-01T00:00:00.000Z",
            candidateRefs: ["c0", "c1"],
            policy: {} as any,
            councilRevision: "rev-fail",
            diagnostics: [
              {
                candidateRef: "c0",
                diagnosticAccountRef: "a0",
                requestedModel: "gemini-4-hydrogen",
                actualProviderId: "gemini",
                actualModelId: "gemini-4-hydrogen",
                actualTransportProviderId: "cloud-code",
                reason: "exact",
                cacheContinuityRisk: false,
              },
              {
                candidateRef: "c1",
                diagnosticAccountRef: "a1",
                requestedModel: "gemini-4-hydrogen",
                actualProviderId: "openai",
                actualModelId: "gpt-5.5",
                actualTransportProviderId: "openai",
                reason: "fallback",
                cacheContinuityRisk: false,
              },
            ],
          };
        },
        prepareAttempt: async (_s: any, _p: any, candidateRef: string) => ({
          attemptRef: `att-${candidateRef}`,
          generate: async () => {
            if (candidateRef === "c0") {
              throw { providerId: "gemini", statusCode: 503, retryReason: "server_error", retryable: true, message: "upstream 503" };
            }
            throw frozenErr;
          },
          stream: async () => { throw new Error("unused"); },
          recordOutcome: async () => {},
          markCommitted: async () => {},
          complete: async () => {},
          releaseCancelled: async () => {},
        }),
      }),
    };

    const { d } = twoOut();
    const firstLine = readFileSync(join(d, "state.jsonl"), "utf-8").split("\n")[0];
    writeFileSync(join(d, "state.jsonl"), `${firstLine}\n`);

    await runExtract(
      { out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen" },
      undefined,
      {
        now: () => Date.parse("2026-11-22T12:00:00Z"),
        createMeshClient: (alias) => createScrapMeshClient(alias, {
          facade: failoverFacade as any,
          adapterClients: { gemini: stubClient() } as any,
          ownerScopes: ["owner:test"],
          loadMeshRuntime: async () => ({
            mesh: realMesh,
            facade: realFacade,
            node: realNode,
          }),
          createMeshCore: createMeshCoreSpy,
        }),
      },
    );

    const all = readFileSync(join(d, "results.ndjson"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    const summary = all.find((r) => r.type === "summary");
    // Kills a mutant where mesh-host does not execute failures through the shared core factory.
    expect(createMeshCoreSpy).toHaveBeenCalledTimes(1);
    expect(createGraphifyMeshSpy).toHaveBeenCalledTimes(1);
    // Kills a mutant where failure attempts on a frozen error do not reach extract's summary metrics.
    expect(summary?.calls_total).toBe(2);
    expect(summary?.calls_by_model).toEqual({
      "gemini/gemini-4-hydrogen": 1,
      "openai/gpt-5.5": 1,
    });
    expect(summary?.routed_mismatches).toBe(1);
    // Kills a mutant that publishes the attempts WeakMap on globalThis via Symbol.for instead of sharing src/llm-mesh-errors.ts.
    expect(Object.getOwnPropertySymbols(globalThis).some((s) => Symbol.keyFor(s) === "engram.llmMesh.errorAttempts")).toBe(false);
  });

  it("shares mesh attempt records across llm-mesh-bridge and scrap/extract even for frozen errors without static imports", async () => {
    const { createGraphifyMesh, meshTextJsonClient } = await import("../src/llm-mesh-bridge.js");
    const frozenErr = Object.freeze(new Error("frozen upstream failure"));
    const mesh = createGraphifyMesh({
      routingSubject: { principalRef: "p", ownerScopeRef: "owner:test" },
      createRoutePlanner: () => ({
        plan: async () => ({
          planRef: "plan-frz",
          expiresAt: "2030-01-01T00:00:00.000Z",
          candidateRefs: ["c0"],
          policy: {} as any,
          councilRevision: "rev-frz",
          diagnostics: [{
            candidateRef: "c0",
            diagnosticAccountRef: "a0",
            requestedModel: "gemini-4-hydrogen",
            actualProviderId: "gemini",
            actualModelId: "gemini-4-hydrogen",
            actualTransportProviderId: "cloud-code",
            reason: "exact",
            cacheContinuityRisk: false,
          }],
        }),
        prepareAttempt: async () => ({
          attemptRef: "att-frz",
          generate: async () => { throw frozenErr; },
          stream: async () => { throw new Error("unused"); },
          recordOutcome: async () => {},
          markCommitted: async () => {},
          complete: async () => {},
          releaseCancelled: async () => {},
        }),
      }) as any,
    });
    const bridgeClient = meshTextJsonClient(mesh, { provider: "gemini", model: "gemini-4-hydrogen" });
    const { d } = twoOut();
    const firstLine = readFileSync(join(d, "state.jsonl"), "utf-8").split("\n")[0];
    writeFileSync(join(d, "state.jsonl"), `${firstLine}\n`);
    await runExtract(
      { out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen" },
      undefined,
      {
        now: () => Date.parse("2026-11-22T12:00:00Z"),
        createMeshClient: async () => ({ client: bridgeClient, provider: "openai", model: "gpt-fallback" }),
      },
    );
    const all = readFileSync(join(d, "results.ndjson"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    const summary = all.find((r) => r.type === "summary");
    // Kills a mutant that breaks the shared src/llm-mesh-errors.ts WeakMap between llm-mesh-bridge.ts and scrap/extract.ts on non-extensible errors.
    expect(summary?.calls_by_model).toEqual({ "gemini/gemini-4-hydrogen": 1 });
  });

  it("refuses mesh: aliases with a usage error naming @sentropic/llm-mesh when the optional peer is absent, without masking other import failures", async () => {
    const { preflightMeshAlias, createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
    const missingLoader = async () => {
      throw Object.assign(
        new Error("Cannot find package '@sentropic/llm-mesh' imported from /app/dist/cli.js"),
        { code: "ERR_MODULE_NOT_FOUND" },
      );
    };

    let preflightErr: unknown;
    try {
      await preflightMeshAlias("gemini-4-hydrogen-high", { loadMeshRuntime: missingLoader } as any);
    } catch (e) {
      preflightErr = e;
    }
    // Kills a mutant that forgets to name @sentropic/llm-mesh when preflighting with the optional peer absent.
    expect(String(preflightErr)).toContain("@sentropic/llm-mesh");
    // Kills a mutant that omits the optional-peer phrasing from the missing-mesh refusal message.
    expect(String(preflightErr)).toMatch(/optional peer package/i);
    // Kills a mutant that fails to classify the missing-mesh refusal as an extract usage error (exit 2).
    expect(isExtractUsageError(preflightErr)).toBe(true);

    const seen = { plans: 0 };
    let clientErr: unknown;
    try {
      await createScrapMeshClient("gemini-4-hydrogen-high", {
        loadMeshRuntime: missingLoader,
        facade: fakeFacade("ok", seen),
        ownerScopes: ["owner:test"],
      } as any);
    } catch (e) {
      clientErr = e;
    }
    // Kills a mutant that attempts route planning before refusing on absent @sentropic/llm-mesh.
    expect(seen.plans).toBe(0);
    // Kills a mutant that forgets to name @sentropic/llm-mesh in createScrapMeshClient when the peer is absent.
    expect(String(clientErr)).toContain("@sentropic/llm-mesh");
    // Kills a mutant where createScrapMeshClient's missing-mesh refusal is not mapped to exit 2.
    expect(isExtractUsageError(clientErr)).toBe(true);

    const unrelatedLoader = async () => {
      throw new Error("EACCES: unexpected permission failure");
    };
    let unrelatedErr: unknown;
    try {
      await preflightMeshAlias("gemini-4-hydrogen-high", { loadMeshRuntime: unrelatedLoader } as any);
    } catch (e) {
      unrelatedErr = e;
    }
    // Kills a mutant that mislabels non-MODULE_NOT_FOUND import failures as missing @sentropic/llm-mesh.
    expect(String(unrelatedErr)).toContain("EACCES: unexpected permission failure");
    // Kills a mutant that wrongly classifies unrelated import failures as usage errors.
    expect(isExtractUsageError(unrelatedErr)).toBe(false);
  });

  it("does not misreport transitive missing-module errors inside an installed @sentropic/llm-mesh as an absent optional peer", async () => {
    const { preflightMeshAlias } = await import("../src/scrap/mesh-host.js");
    const transitiveCases = [
      {
        label: "transitive package imported from installed mesh",
        err: Object.assign(
          new Error("Cannot find package 'some-transitive-dep' imported from /app/node_modules/@sentropic/llm-mesh/dist/index.js"),
          { code: "ERR_MODULE_NOT_FOUND" },
        ),
        expectedFragment: "some-transitive-dep",
      },
      {
        label: "missing internal file inside installed mesh",
        err: Object.assign(
          new Error("Cannot find module '/app/node_modules/@sentropic/llm-mesh/dist/missing.js' imported from /app/node_modules/@sentropic/llm-mesh/dist/index.js"),
          { code: "ERR_MODULE_NOT_FOUND" },
        ),
        expectedFragment: "dist/missing.js",
      },
      {
        label: "distinct package sharing @sentropic/llm-mesh prefix",
        err: Object.assign(
          new Error("Cannot find package '@sentropic/llm-mesh-extra' imported from /app/dist/cli.js"),
          { code: "ERR_MODULE_NOT_FOUND" },
        ),
        expectedFragment: "@sentropic/llm-mesh-extra",
      },
      {
        label: "failed resolve import whose importer is quoted @sentropic/llm-mesh",
        err: Object.assign(
          new Error('Failed to resolve import "other-dep" from "@sentropic/llm-mesh"'),
          { code: "ERR_MODULE_NOT_FOUND" },
        ),
        expectedFragment: "other-dep",
      },
    ];

    for (const tc of transitiveCases) {
      let got: unknown;
      try {
        await preflightMeshAlias("gemini-4-hydrogen-high", {
          loadMeshRuntime: async () => { throw tc.err; },
        } as any);
      } catch (e) {
        got = e;
      }
      // Kills a mutant that uses bare msg.includes("@sentropic/llm-mesh") and masks transitive or prefix-similar resolution errors as an absent peer.
      expect(String(got), tc.label).toContain(tc.expectedFragment);
      // Kills a mutant that rewrites a transitive resolution failure inside @sentropic/llm-mesh into the missing optional peer refusal.
      expect(String(got), tc.label).not.toMatch(/optional peer package/i);
      // Kills a mutant that misclassifies transitive resolution failures inside @sentropic/llm-mesh as exit-2 usage errors.
      expect(isExtractUsageError(got), tc.label).toBe(false);
    }

    const absentSubpathCases = [
      Object.assign(
        new Error("Cannot find package '@sentropic/llm-mesh/node' imported from /app/dist/cli.js"),
        { code: "ERR_MODULE_NOT_FOUND" },
      ),
      new Error("Failed to load url @sentropic/llm-mesh/facade (resolved id: @sentropic/llm-mesh/facade) in /app/src/scrap/mesh-host.ts"),
      Object.assign(
        new Error("Missing dependency '@sentropic/llm-mesh'"),
        { code: "ERR_MODULE_NOT_FOUND" },
      ),
    ];
    for (const err of absentSubpathCases) {
      let got: unknown;
      try {
        await preflightMeshAlias("gemini-4-hydrogen-high", {
          loadMeshRuntime: async () => { throw err; },
        } as any);
      } catch (e) {
        got = e;
      }
      // Kills a mutant whose specifier matcher fails to recognize missing @sentropic/llm-mesh subpath imports.
      expect(String(got)).toMatch(/optional peer package "@sentropic\/llm-mesh"/i);
      // Kills a mutant that fails to classify absent @sentropic/llm-mesh subpath errors as exit-2 usage errors.
      expect(isExtractUsageError(got)).toBe(true);
    }
  });

  it("uses injected loadMeshRuntime.node for the default Claude CLI probe without bypassing the loader or mutating SEAT_WIRED", async () => {
    const { SEAT_WIRED, createScrapMeshClient, preflightMeshAlias, resetClaudeCliProbe } = await import("../src/scrap/mesh-host.js");
    const [realMesh, realFacade, realNode] = await Promise.all([
      import("@sentropic/llm-mesh"),
      import("@sentropic/llm-mesh/facade"),
      import("@sentropic/llm-mesh/node"),
    ]);
    resetClaudeCliProbe();
    try {
      const injectedCaps = {
        protocol: "claude-code-stream-json-v1" as const,
        cliVersion: "9.9.9-injected-test",
        source: "engram-scrap-mesh-host",
        qualificationRef: "engram-scrap-extract-v1",
      };
      const probeOptsSeen: unknown[] = [];
      const seatClientOptsSeen: unknown[] = [];
      let loaderCalls = 0;

      const injectedLoader = async () => {
        loaderCalls++;
        return {
          mesh: realMesh,
          facade: realFacade,
          node: {
            ...realNode,
            probeClaudeCodeCliCapabilities: async (opts: unknown) => {
              probeOptsSeen.push(opts);
              return injectedCaps;
            },
            createClaudeSeatAnthropicClient: (opts: unknown) => {
              seatClientOptsSeen.push(opts);
              return stubClient() as any;
            },
          },
        };
      };

      const pre = await preflightMeshAlias("claude-opus-5-low", { loadMeshRuntime: injectedLoader });
      // Kills a mutant where defaultClaudeProbe bypasses deps.loadMeshRuntime and ignores injected node.probeClaudeCodeCliCapabilities.
      expect(probeOptsSeen).toEqual([{ source: "engram-scrap-mesh-host", qualificationRef: "engram-scrap-extract-v1" }]);
      // Kills a mutant where preflightMeshAlias does not return the capabilities produced by the injected loader's probe.
      expect(pre.claudeCaps).toEqual(injectedCaps);
      // Kills a mutant where probing via an injected loadMeshRuntime mutates module-global SEAT_WIRED.
      expect(SEAT_WIRED.has("anthropic")).toBe(false);

      const anthropicFacade = {
        createRoutePlanner: (runtime: any) => ({
          plan: async (_subject: any, input: any) => ({
            planRef: "plan-anth",
            expiresAt: "2030-01-01T00:00:00.000Z",
            candidateRefs: ["c1"],
            policy: {},
            councilRevision: "rev-anth",
            diagnostics: [{
              candidateRef: "c1",
              diagnosticAccountRef: "acct_anth",
              requestedModel: input.requestedModel,
              actualProviderId: "anthropic",
              actualModelId: "claude-opus-5",
              actualTransportProviderId: "claude-code",
              reason: "exact",
              cacheContinuityRisk: false,
            }],
          }),
          prepareAttempt: async () => ({
            attemptRef: "att-anth",
            generate: (req: any) => runtime.generate(req),
            stream: (req: any) => runtime.stream(req),
            recordOutcome: async () => {},
            markCommitted: async () => {},
            complete: async () => {},
            releaseCancelled: async () => {},
          }),
        }),
      };

      const loaderCallsBeforeClient = loaderCalls;
      const client = await createScrapMeshClient("claude-opus-5-low", {
        loadMeshRuntime: injectedLoader,
        facade: anthropicFacade as any,
        ownerScopes: ["owner:test"],
      });
      // Kills a mutant where createScrapMeshClient invokes deps.loadMeshRuntime twice instead of once.
      expect(loaderCalls - loaderCallsBeforeClient).toBe(1);
      // Kills a mutant that fails to reuse the cached probe across preflightMeshAlias and createScrapMeshClient for the same loadMeshRuntime.
      expect(probeOptsSeen).toHaveLength(1);
      // Kills a mutant where createScrapMeshClient does not forward the injected probe capabilities to the injected node seat client.
      expect(seatClientOptsSeen).toEqual([{ capabilities: injectedCaps, effort: "low" }]);
      // Kills a mutant where createScrapMeshClient with an injected loadMeshRuntime leaks anthropic into module-global SEAT_WIRED.
      expect(SEAT_WIRED.has("anthropic")).toBe(false);
      // Kills a mutant where createScrapMeshClient resolves the wrong anthropic model metadata with an injected loadMeshRuntime.
      expect({ provider: client.provider, model: client.model, effort: client.effort }).toEqual({
        provider: "anthropic",
        model: "claude-opus-5",
        effort: "low",
      });

      resetClaudeCliProbe();
      await preflightMeshAlias("claude-opus-5-low", { loadMeshRuntime: injectedLoader });
      // Kills a mutant where resetClaudeCliProbe fails to clear cached probes keyed by loadMeshRuntime.
      expect(probeOptsSeen).toHaveLength(2);

      // Explicit probeClaudeCli still overrides loadMeshRuntime.node.probeClaudeCodeCliCapabilities.
      let overrideCalls = 0;
      const overrideCaps = { ...injectedCaps, cliVersion: "9.9.9-override-test" };
      const preOverride = await preflightMeshAlias("claude-opus-5-low", {
        loadMeshRuntime: injectedLoader,
        probeClaudeCli: async () => {
          overrideCalls++;
          return overrideCaps;
        },
      });
      // Kills a mutant where loadMeshRuntime overrides an explicit deps.probeClaudeCli.
      expect(overrideCalls).toBe(1);
      // Kills a mutant that calls injected node.probeClaudeCodeCliCapabilities even when deps.probeClaudeCli is given.
      expect(probeOptsSeen).toHaveLength(2);
      // Kills a mutant where explicit probeClaudeCli capabilities are not returned when loadMeshRuntime is also set.
      expect(preOverride.claudeCaps).toEqual(overrideCaps);

      // Failing injected loader probe surfaces the failure without clearing SEAT_WIRED.
      SEAT_WIRED.add("anthropic");
      let failErr: unknown;
      try {
        await preflightMeshAlias("claude-opus-5-low", {
          loadMeshRuntime: async () => ({
            mesh: realMesh,
            facade: realFacade,
            node: {
              ...realNode,
              probeClaudeCodeCliCapabilities: async () => {
                throw new Error("injected claude probe denied");
              },
            },
          }),
        });
      } catch (e) {
        failErr = e;
      }
      // Kills a mutant where a failing probe from an injected loadMeshRuntime is not reported with the claude CLI probe reason.
      expect(String(failErr)).toMatch(/claude CLI probe failed.*injected claude probe denied/);
      // Kills a mutant where a failing injected loader probe is not classified as an exit-2 usage error.
      expect(isExtractUsageError(failErr)).toBe(true);
      // Kills a mutant where a failing probe via an injected loadMeshRuntime deletes anthropic from module-global SEAT_WIRED.
      expect(SEAT_WIRED.has("anthropic")).toBe(true);
    } finally {
      resetClaudeCliProbe();
    }
  });

  it("keeps src/scrap/extract.ts, src/scrap/mesh-host.ts, and src/llm-mesh-core.ts free of static runtime imports of @sentropic/llm-mesh or src/llm-mesh-bridge.ts", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    for (const relPath of ["src/scrap/extract.ts", "src/scrap/mesh-host.ts", "src/llm-mesh-core.ts"]) {
      const text = readFileSync(resolve(repoRoot, relPath), "utf8");
      const sf = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const staticRuntimeSpecs: string[] = [];
      const dynamicLiteralSpecs: string[] = [];
      const computedDynamic: string[] = [];

      const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const isTypeOnly = Boolean(node.importClause?.isTypeOnly) || (
            Boolean(node.importClause?.namedBindings) &&
            ts.isNamedImports(node.importClause!.namedBindings!) &&
            node.importClause!.namedBindings!.elements.every((el) => el.isTypeOnly) &&
            !node.importClause?.name
          );
          if (!isTypeOnly) staticRuntimeSpecs.push(node.moduleSpecifier.text);
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          if (!node.isTypeOnly) staticRuntimeSpecs.push(node.moduleSpecifier.text);
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const arg = node.arguments[0];
          if (arg && ts.isStringLiteralLike(arg)) dynamicLiteralSpecs.push(arg.text);
          else computedDynamic.push(arg ? arg.getText(sf) : "");
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);

      const forbiddenStatic = staticRuntimeSpecs.filter(
        (spec) => spec === "@sentropic/llm-mesh" || spec.startsWith("@sentropic/llm-mesh/") || spec.endsWith("llm-mesh-bridge.js"),
      );
      // Kills a mutant that re-introduces a top-level static runtime import of @sentropic/llm-mesh or llm-mesh-bridge.js (which esbuild hoists into dist/cli.js).
      expect(forbiddenStatic, `${relPath} must not statically import mesh runtime`).toEqual([]);
      // Kills a mutant that uses a computed non-literal specifier in import(...), which breaks the substrate closure scanner.
      expect(computedDynamic, `${relPath} must not use computed dynamic imports`).toEqual([]);

      if (relPath === "src/scrap/mesh-host.ts") {
        // Kills a mutant that drops one of the three lazy mesh imports or re-adds ../llm-mesh-bridge.js in src/scrap/mesh-host.ts.
        expect([...new Set(dynamicLiteralSpecs)].sort()).toEqual([
          "@sentropic/llm-mesh",
          "@sentropic/llm-mesh/facade",
          "@sentropic/llm-mesh/node",
        ]);
      }
    }
  });

  it("built dist/cli.js without @sentropic/llm-mesh refuses scrap extract --model mesh:... with exit 2 before any request while --version, --help, and direct extract work", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const builtCli = resolve(repoRoot, "dist/cli.js");
    // Kills a mutant where dist/cli.js was not built before verifying the peer-absent CLI behavior.
    expect(existsSync(builtCli)).toBe(true);
    const cliSource = readFileSync(builtCli, "utf8");
    // Kills a mutant where esbuild hoists any static `import ... from "@sentropic/llm-mesh"` into dist/cli.js.
    expect(cliSource).not.toMatch(/\bfrom\s+["']@sentropic\/llm-mesh(?:\/[^"']*)?["']/);

    const sandbox = mkdtempSync(join(tmpdir(), "scmesh-nomesh-cli-"));
    try {
      mkdirSync(join(sandbox, "dist"), { recursive: true });
      mkdirSync(join(sandbox, "node_modules", "@sentropic"), { recursive: true });
      copyFileSync(builtCli, join(sandbox, "dist", "cli.js"));
      copyFileSync(resolve(repoRoot, "package.json"), join(sandbox, "package.json"));

      const repoNodeModules = resolve(repoRoot, "node_modules");
      for (const entry of readdirSync(repoNodeModules)) {
        if (entry === "@sentropic" || entry === ".package-lock.json") continue;
        symlinkSync(join(repoNodeModules, entry), join(sandbox, "node_modules", entry));
      }
      for (const entry of readdirSync(join(repoNodeModules, "@sentropic"))) {
        if (entry === "llm-mesh") continue;
        symlinkSync(
          join(repoNodeModules, "@sentropic", entry),
          join(sandbox, "node_modules", "@sentropic", entry),
        );
      }

      // Kills a mutant in test setup that accidentally leaves @sentropic/llm-mesh resolvable in the peer-absent sandbox.
      expect(existsSync(join(sandbox, "node_modules", "@sentropic", "llm-mesh"))).toBe(false);

      const cliFile = join(sandbox, "dist", "cli.js");
      const versionRes = spawnSync(process.execPath, [cliFile, "--version"], { cwd: sandbox, encoding: "utf8" });
      // Kills a mutant where dist/cli.js crashes at startup without @sentropic/llm-mesh on --version.
      expect(versionRes.status, versionRes.stderr).toBe(0);
      const helpRes = spawnSync(process.execPath, [cliFile, "--help"], { cwd: sandbox, encoding: "utf8" });
      // Kills a mutant where dist/cli.js crashes without @sentropic/llm-mesh on --help.
      expect(helpRes.status, helpRes.stderr).toBe(0);
      expect(helpRes.stdout).toContain("Usage:");

      const { d } = twoOut();
      const meshRes = spawnSync(
        process.execPath,
        [cliFile, "scrap", "extract", "--out", d, "--mission", join(d, "mission.json"), "--model", "mesh:gemini-4-hydrogen-high"],
        { cwd: sandbox, encoding: "utf8" },
      );
      // Kills a mutant where peer-absent `engram scrap extract --model mesh:...` does not exit 2.
      expect(meshRes.status, meshRes.stderr).toBe(2);
      // Kills a mutant where peer-absent `engram scrap extract --model mesh:...` omits naming @sentropic/llm-mesh.
      expect(meshRes.stderr).toContain("@sentropic/llm-mesh");
      // Kills a mutant where peer-absent `engram scrap extract --model mesh:...` creates results.ndjson before refusing.
      expect(existsSync(join(d, "results.ndjson"))).toBe(false);

      const envNoKey = { ...process.env };
      delete envNoKey.OPENAI_API_KEY;
      const directMissingCred = spawnSync(
        process.execPath,
        [cliFile, "scrap", "extract", "--out", d, "--mission", join(d, "mission.json"), "--model", "openai:gpt-5-mini"],
        { cwd: sandbox, encoding: "utf8", env: envNoKey },
      );
      // Kills a mutant where direct `engram scrap extract` fails on missing @sentropic/llm-mesh instead of reaching direct credential preflight.
      expect(directMissingCred.status, directMissingCred.stderr).toBe(2);
      // Kills a mutant where direct extraction does not report missing OPENAI_API_KEY without @sentropic/llm-mesh installed.
      expect(directMissingCred.stderr).toContain("OPENAI_API_KEY");
      // Kills a mutant where direct extraction erroneously blames @sentropic/llm-mesh when the peer is absent.
      expect(directMissingCred.stderr).not.toContain("@sentropic/llm-mesh");

      const emptyDir = mkdtempSync(join(tmpdir(), "scmesh-empty-"));
      try {
        writeFileSync(join(emptyDir, "mission.json"), JSON.stringify({ fields: ["f"], instruction: "Extract." }));
        writeFileSync(join(emptyDir, "state.jsonl"), `${JSON.stringify({ id: "s1", url: "http://x/", status: "dns", pages: [] })}\n`);
        const directOk = spawnSync(
          process.execPath,
          [cliFile, "scrap", "extract", "--out", emptyDir, "--mission", join(emptyDir, "mission.json"), "--model", "openai:gpt-5-mini"],
          { cwd: sandbox, encoding: "utf8", env: envNoKey },
        );
        // Kills a mutant where direct `engram scrap extract` fails to succeed with exit 0 when @sentropic/llm-mesh is absent.
        expect(directOk.status, directOk.stderr).toBe(0);
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("built dist/cli.js with peer present works and propagates failing mesh attempts (extensible and frozen) to metrics, and dist/llm-mesh.js carries attempts on the error across bundle copies", async () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const builtCli = resolve(repoRoot, "dist/cli.js");
    const builtMeshEntry = resolve(repoRoot, "dist/llm-mesh.js");
    expect(existsSync(builtCli)).toBe(true);
    expect(existsSync(builtMeshEntry)).toBe(true);

    // 1. Built dist/cli.js with real installed @sentropic/llm-mesh peer present.
    const { d: presentWork } = twoOut();
    try {
      const verRes = spawnSync(process.execPath, [builtCli, "--version"], { cwd: repoRoot, encoding: "utf8" });
      expect(verRes.status, verRes.stderr).toBe(0);
      const unknownAliasRes = spawnSync(
        process.execPath,
        [builtCli, "scrap", "extract", "--out", presentWork, "--mission", join(presentWork, "mission.json"), "--model", "mesh:luna-9"],
        { cwd: repoRoot, encoding: "utf8" },
      );
      // Kills a mutant where peer-present dist/cli.js fails to resolve @sentropic/llm-mesh or reports missing peer instead of unknown alias.
      expect(unknownAliasRes.status, unknownAliasRes.stderr).toBe(2);
      expect(unknownAliasRes.stderr).toContain("unknown mesh alias");
      expect(unknownAliasRes.stderr).not.toMatch(/optional peer package/i);
    } finally {
      rmSync(presentWork, { recursive: true, force: true });
    }

    // 2. Built dist/cli.js with a stub @sentropic/llm-mesh peer: 2-candidate failing mesh attempt reaches results.ndjson + stdout metrics (both extensible and frozen errors).
    const sandbox = mkdtempSync(join(tmpdir(), "scmesh-fail-cli-"));
    try {
      mkdirSync(join(sandbox, "dist"), { recursive: true });
      mkdirSync(join(sandbox, "node_modules", "@sentropic", "llm-mesh"), { recursive: true });
      copyFileSync(builtCli, join(sandbox, "dist", "cli.js"));
      copyFileSync(resolve(repoRoot, "package.json"), join(sandbox, "package.json"));

      const repoNodeModules = resolve(repoRoot, "node_modules");
      for (const entry of readdirSync(repoNodeModules)) {
        if (entry === "@sentropic" || entry === ".package-lock.json") continue;
        symlinkSync(join(repoNodeModules, entry), join(sandbox, "node_modules", entry));
      }
      for (const entry of readdirSync(join(repoNodeModules, "@sentropic"))) {
        if (entry === "llm-mesh") continue;
        symlinkSync(
          join(repoNodeModules, "@sentropic", entry),
          join(sandbox, "node_modules", "@sentropic", entry),
        );
      }

      const stubPkgDir = join(sandbox, "node_modules", "@sentropic", "llm-mesh");
      writeFileSync(join(stubPkgDir, "package.json"), JSON.stringify({
        name: "@sentropic/llm-mesh",
        version: "0.38.6",
        type: "module",
        exports: {
          ".": "./index.mjs",
          "./facade": "./facade.mjs",
          "./node": "./node.mjs",
        },
      }));
      writeFileSync(join(stubPkgDir, "index.mjs"), [
        'export const modelProfiles = [{ providerId: "gemini", modelId: "gemini-4-hydrogen" }];',
        'export const CANONICAL_TARGET_ROUTE_MAPPINGS = {};',
        'export const normalizeExactModelId = (id) => id.replace(/-(low|medium|high|xhigh|max)$/, "");',
        'export const isRetiredRoutingModelId = () => false;',
        'export class RoutePlanError extends Error { constructor(msg, code) { super(msg); this.name = "RoutePlanError"; this.code = code; } }',
        'export class StaticProviderRegistry { constructor(adapters) { this.adapters = adapters; } }',
        'export const createDefaultProviderAdapters = () => [{ provider: { providerId: "gemini" } }];',
        'export const createLlmMesh = () => ({ listProviders: () => ["gemini"], listModels: () => [], generate: async () => { throw new Error("unused"); }, stream: () => { throw new Error("unused"); } });',
        'export const normalizeProviderError = (providerId, err) => ({ providerId, message: err instanceof Error ? err.message : String(err), retryable: false, statusCode: err && typeof err === "object" ? err.statusCode : undefined, retryReason: err && typeof err === "object" ? err.retryReason : undefined });',
        'export class CloudCodeRuntimeClient {}',
        'export class CodexRuntimeClient {}',
        'export class MuseRuntimeClient {}',
        'export class MistralRuntimeClient {}',
        'export class ClaudeCodeRuntimeClient {}',
      ].join("\n"));
      writeFileSync(join(stubPkgDir, "facade.mjs"), [
        "export function createLlmMeshFacade() {",
        "  return {",
        "    createRoutePlanner: () => ({",
        "      plan: async () => ({",
        '        planRef: "plan-cli-fail",',
        '        expiresAt: "2030-01-01T00:00:00.000Z",',
        '        candidateRefs: ["c0", "c1"],',
        "        policy: {},",
        '        councilRevision: "rev-cli-fail",',
        "        diagnostics: [",
        '          { candidateRef: "c0", diagnosticAccountRef: "a0", requestedModel: "gemini-4-hydrogen", actualProviderId: "gemini", actualModelId: "gemini-4-hydrogen", actualTransportProviderId: "cloud-code", reason: "exact", cacheContinuityRisk: false },',
        '          { candidateRef: "c1", diagnosticAccountRef: "a1", requestedModel: "gemini-4-hydrogen", actualProviderId: "openai", actualModelId: "gpt-5.5", actualTransportProviderId: "openai", reason: "fallback", cacheContinuityRisk: false },',
        "        ],",
        "      }),",
        "      prepareAttempt: async (_subject, _planRef, candidateRef) => ({",
        "        attemptRef: `att-${candidateRef}`,",
        "        generate: async () => {",
        '          if (candidateRef === "c0") throw { providerId: "gemini", statusCode: 503, retryReason: "server_error", retryable: true, message: "upstream 503" };',
        '          const err = new Error(process.env.TEST_FROZEN_ERR === "1" ? "frozen cli terminal failure" : "extensible cli terminal failure");',
        '          throw process.env.TEST_FROZEN_ERR === "1" ? Object.freeze(err) : err;',
        "        },",
        '        stream: async () => { throw new Error("unused"); },',
        "        recordOutcome: async () => {},",
        "        markCommitted: async () => {},",
        "        complete: async () => {},",
        "        releaseCancelled: async () => {},",
        "      }),",
        "    }),",
        "  };",
        "}",
      ].join("\n"));
      writeFileSync(join(stubPkgDir, "node.mjs"), [
        "export class EncryptedFileKeyring { async getSecret() { return null; } async setSecret() {} async deleteSecret() {} }",
        'export const probeClaudeCodeCliCapabilities = async () => { throw new Error("unused"); };',
        'export const createClaudeSeatAnthropicClient = () => { throw new Error("unused"); };',
      ].join("\n"));

      const cliFile = join(sandbox, "dist", "cli.js");
      for (const frozenFlag of ["0", "1"] as const) {
        const { d } = twoOut();
        try {
          const firstLine = readFileSync(join(d, "state.jsonl"), "utf-8").split("\n")[0];
          writeFileSync(join(d, "state.jsonl"), `${firstLine}\n`);
          const run = spawnSync(
            process.execPath,
            [cliFile, "scrap", "extract", "--out", d, "--mission", join(d, "mission.json"), "--model", "mesh:gemini-4-hydrogen-high"],
            {
              cwd: sandbox,
              encoding: "utf8",
              env: {
                ...process.env,
                ENGRAM_MESH_OWNER_SCOPE: "owner:cli-proof",
                TEST_FROZEN_ERR: frozenFlag,
              },
            },
          );
          expect(run.status, run.stderr).toBe(0);
          const rows = readFileSync(join(d, "results.ndjson"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
          const idRow = rows.find((r) => r.id === "a1");
          const summary = rows.find((r) => r.type === "summary");
          // Kills a mutant where failing mesh attempts through built dist/cli.js do not reach results.ndjson metrics.
          expect(idRow).toMatchObject({
            id: "a1",
            error: "llm_error",
            routed_mismatch: true,
            resolved: { provider: "gemini", model: "gemini-4-hydrogen" },
            routed: { provider: "openai", model: "gpt-5.5" },
          });
          expect(summary).toMatchObject({
            type: "summary",
            ok: 0,
            failed: 1,
            calls_total: 2,
            calls_by_model: {
              "gemini/gemini-4-hydrogen": 1,
              "openai/gpt-5.5": 1,
            },
            routed_mismatches: 1,
          });
          expect(run.stdout).toContain("scrap extract summary: ok=0 failed=1");
          expect(run.stdout).toContain("calls=2");
          expect(run.stdout).toContain("routed_mismatches=1");
        } finally {
          rmSync(d, { recursive: true, force: true });
        }
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }

    // 3. Cross-bundle proof: built dist/llm-mesh.js (its own bundled llm-mesh-errors.ts WeakMap) throws an extensible failure error
    // whose non-enumerable `err.audit.attempts` (`mesh: true`) is read by src/llm-mesh-errors.ts and src/scrap/extract.ts.
    const { pathToFileURL } = await import("node:url");
    const builtBridge = await import(pathToFileURL(builtMeshEntry).href) as typeof import("../src/llm-mesh.js");
    const { getMeshErrorAttempts } = await import("../src/llm-mesh-errors.js");
    const terminalErr = new Error("cross-bundle terminal failure");
    const crossMesh = builtBridge.createGraphifyMesh({
      routingSubject: { principalRef: "p", ownerScopeRef: "owner:cross" },
      createRoutePlanner: () => ({
        plan: async () => ({
          planRef: "plan-cross",
          expiresAt: "2030-01-01T00:00:00.000Z",
          candidateRefs: ["c0", "c1"],
          policy: {} as any,
          councilRevision: "rev-cross",
          diagnostics: [
            { candidateRef: "c0", diagnosticAccountRef: "a0", requestedModel: "gemini-4-hydrogen", actualProviderId: "gemini", actualModelId: "gemini-4-hydrogen", actualTransportProviderId: "cloud-code", reason: "exact", cacheContinuityRisk: false },
            { candidateRef: "c1", diagnosticAccountRef: "a1", requestedModel: "gemini-4-hydrogen", actualProviderId: "openai", actualModelId: "gpt-5.5", actualTransportProviderId: "openai", reason: "fallback", cacheContinuityRisk: false },
          ],
        }),
        prepareAttempt: async (_s: any, _p: any, candidateRef: string) => ({
          attemptRef: `att-${candidateRef}`,
          generate: async () => {
            if (candidateRef === "c0") {
              throw { providerId: "gemini", statusCode: 503, retryReason: "server_error", retryable: true, message: "upstream 503" };
            }
            throw terminalErr;
          },
          stream: async () => { throw new Error("unused"); },
          recordOutcome: async () => {},
          markCommitted: async () => {},
          complete: async () => {},
          releaseCancelled: async () => {},
        }),
      }) as any,
    });
    const crossClient = builtBridge.meshTextJsonClient(crossMesh, { provider: "gemini", model: "gemini-4-hydrogen" });

    let caughtCross: unknown;
    try {
      await crossClient.generateJson({ schema: "s", prompt: "p" });
    } catch (e) {
      caughtCross = e;
    }
    expect(caughtCross).toBe(terminalErr);
    // Kills a mutant where built dist/llm-mesh.js stops attaching `err.audit.attempts` on extensible errors for cross-bundle readers.
    expect((caughtCross as { audit?: unknown }).audit).toEqual({
      mesh: true,
      attempts: [
        { providerId: "gemini", modelId: "gemini-4-hydrogen" },
        { providerId: "openai", modelId: "gpt-5.5" },
      ],
    });
    // Kills a mutant where getMeshErrorAttempts in a separate bundle copy fails to read `err.audit.attempts` when its local WeakMap misses.
    expect(getMeshErrorAttempts(caughtCross)).toEqual([
      { providerId: "gemini", modelId: "gemini-4-hydrogen" },
      { providerId: "openai", modelId: "gpt-5.5" },
    ]);

    const { d: crossDir } = twoOut();
    try {
      const firstLine = readFileSync(join(crossDir, "state.jsonl"), "utf-8").split("\n")[0];
      writeFileSync(join(crossDir, "state.jsonl"), `${firstLine}\n`);
      await runExtract(
        { out: crossDir, mission: join(crossDir, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        {
          now: () => Date.parse("2026-11-22T12:00:00Z"),
          createMeshClient: async () => ({ client: crossClient, provider: "gemini", model: "gemini-4-hydrogen" }),
        },
      );
      const all = readFileSync(join(crossDir, "results.ndjson"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
      const summary = all.find((r) => r.type === "summary");
      expect(summary).toMatchObject({
        type: "summary",
        ok: 0,
        failed: 1,
        calls_total: 2,
        calls_by_model: {
          "gemini/gemini-4-hydrogen": 1,
          "openai/gpt-5.5": 1,
        },
        routed_mismatches: 1,
      });
    } finally {
      rmSync(crossDir, { recursive: true, force: true });
    }
  });
});
