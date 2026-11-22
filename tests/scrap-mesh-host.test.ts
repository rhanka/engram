import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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

const lines = (d: string): any[] => readFileSync(join(d, "results.ndjson"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));

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

  it("rejects a catalog alias whose provider has no seat executor in this host", async () => {
    const seen = { plans: 0 };
    const { createScrapMeshClient } = await import("../src/scrap/mesh-host.js");
    await expect(createScrapMeshClient("claude-sonnet-5", {
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
    await expect(runExtract({ out: bare, mission: join(bare, "mission.json"), model: "mesh:claude-sonnet-5" })).rejects.toThrow(/no seat executor/);
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
    expect(await cli(["scrap", "extract", "--out", d, "--mission", join(d, "mission.json"), "--model", "mesh:claude-sonnet-5"], d)).toBe(2);
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
});
