import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runExtract } from "../src/scrap/extract.js";
import { createScrapMeshClient } from "../src/scrap/mesh-host.js";

const directGenerateTextMock = vi.fn();
vi.mock("ai", () => ({ generateText: (...args: unknown[]) => directGenerateTextMock(...args) }));
vi.mock("@ai-sdk/openai", () => ({
  openai: (model: string) => ({ provider: "openai", model }),
  createOpenAI: () => (model: string) => ({ provider: "openai", model }),
}));

const H1 = "<html><body><p>Acme Canada Inc. Office in Toronto, ON and Bureau in Montreal, QC. Tags: t1 t2 t3 t4 t5 t6.</p></body></html>";
const H2 = "<html><body><p>Beta Corp. Vancouver, BC branch office. Tags: t1 t2 t3 t4 t5 t6.</p></body></html>";
const S1 = createHash("sha256").update(H1).digest("hex");
const S2 = createHash("sha256").update(H2).digest("hex");

function makeDir(mission: Record<string, unknown>, stateRows: Record<string, unknown>[]): string {
  const d = mkdtempSync(join(tmpdir(), "sct02-"));
  mkdirSync(join(d, "snapshots"), { recursive: true });
  writeFileSync(join(d, "snapshots", `${S1}.html`), H1);
  writeFileSync(join(d, "snapshots", `${S2}.html`), H2);
  writeFileSync(join(d, "state.jsonl"), stateRows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(d, "mission.json"), JSON.stringify(mission));
  return d;
}

const okRow = (id: string, shas: string[] = [S1]): Record<string, unknown> => ({
  id,
  url: `http://x/${id}`,
  status: "ok",
  pages: shas.map((sha256, i) => ({ url: `http://x/${id}/${i}`, final_url: `http://x/${id}/${i}`, status: 200, bytes: 1, sha256 })),
});

const readRows = (d: string): any[] =>
  readFileSync(join(d, "results.ndjson"), "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

function stubFacade(completeResult?: unknown): any {
  return {
    createRoutePlanner: (runtime: any) => ({
      plan: async (_subject: any, input: any) => ({
        planRef: "plan-t02",
        expiresAt: "2030-01-01T00:00:00.000Z",
        candidateRefs: ["c1"],
        policy: {},
        councilRevision: "council-t02",
        diagnostics: [{
          candidateRef: "c1",
          diagnosticAccountRef: "acct_t02",
          requestedModel: input.requestedModel,
          actualProviderId: "gemini",
          actualModelId: "gemini-4-hydrogen",
          actualTransportProviderId: "cloud-code",
          reason: "alias",
          cacheContinuityRisk: false,
        }],
      }),
      prepareAttempt: async () => ({
        attemptRef: "attempt-t02",
        generate: (request: any) => runtime.generate({
          ...request,
          auth: { material: { type: "direct-token", token: "stub-seat" }, descriptor: { sourceType: "direct-token" } },
        }),
        stream: (request: any) => runtime.stream(request),
        recordOutcome: async () => {},
        markCommitted: async () => {},
        complete: async () => completeResult,
        releaseCancelled: async () => {},
      }),
    }),
  };
}

function meshDeps(
  handler: (request: any) => Promise<{
    text: string;
    usage?: Record<string, unknown>;
    quota?: Record<string, unknown>;
    providerMetadata?: Record<string, unknown>;
  }>,
  completeResult?: unknown,
) {
  return {
    createMeshClient: async (alias: string) =>
      createScrapMeshClient(alias, {
        facade: stubFacade(completeResult),
        adapterClients: {
          gemini: {
            generate: async (request: any) => {
              const out = await handler(request);
              return {
                id: "stub-resp",
                providerId: "gemini",
                modelId: "gemini-4-hydrogen",
                message: { role: "assistant", content: [{ type: "text", text: out.text }] },
                text: out.text,
                toolCalls: [],
                usage: out.usage ?? { inputTokens: 100, outputTokens: 20, thoughtsTokenCount: 50, totalTokens: 170 },
                finishReason: "stop",
                ...(out.quota ? { quota: out.quota } : {}),
                ...(out.providerMetadata ? { providerMetadata: out.providerMetadata } : {}),
              };
            },
            stream: async () => { throw new Error("stream not used"); },
          },
        } as any,
        ownerScopes: ["owner:test"],
      }),
  };
}

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const orig = console.log;
  const origErr = console.error;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  console.error = () => {};
  try { await fn(); } finally { console.log = orig; console.error = origErr; }
  return logs;
}

describe("scrap tier 0.2", () => {
  it("retry-failed selects only ids whose last row has an error, appends new rows, and never redoes ok rows", async () => {
    const d = makeDir(
      { fields: ["company"], instruction: "Extract company." },
      [okRow("id1", [S1]), okRow("id2", [S1]), okRow("id3", [S2]), okRow("id4", [S1]), { id: "id5", url: "http://x/5", status: "dns", pages: [] }],
    );
    let phase = 1;
    const called: string[] = [];
    const deps = meshDeps(async (req) => {
      const prompt = String(req.messages[1].content);
      const isBeta = prompt.includes("Beta Corp");
      called.push(`p${phase}:${isBeta ? "beta" : "acme"}`);
      if (phase === 1) {
        if (called.length === 1) return { text: JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } }) }; // id1 ok
        if (called.length <= 3) return { text: '{"company": {"value": "broken' }; // id2 parse_error (attempt 1 + repair)
        if (isBeta) throw new Error("provider 500"); // id3 llm_error
        return { text: "" }; // id4 empty_response
      }
      if (phase === 2) {
        if (isBeta) throw new Error("still 500"); // id3 fails again
        return { text: JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } }) }; // id2, id4 succeed
      }
      return { text: JSON.stringify({ company: { value: "Beta Corp.", quote: "Beta Corp." } }) }; // id3 succeeds in phase 3
    });

    await captureLogs(() => runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, deps));
    const r1 = readRows(d);
    expect(r1.map((r) => [r.id, r.error ?? "ok"])).toEqual([
      ["id1", "ok"],
      ["id2", "parse_error"],
      ["id3", "llm_error"],
      ["id4", "empty_response"],
    ]);

    // Plain rerun without --retry-failed is idempotent (0 calls).
    const beforePlain = called.length;
    await captureLogs(() => runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, deps));
    expect(called.length).toBe(beforePlain);
    expect(readRows(d).length).toBe(4);

    // Phase 2: --retry-failed reprocesses id2, id3, id4 only (never id1 or dns id5).
    phase = 2;
    const beforeRetry1 = called.length;
    await captureLogs(() => runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high", retryFailed: true }, undefined, deps));
    expect(called.length - beforeRetry1).toBe(3);
    const r2 = readRows(d);
    expect(r2.length).toBe(7);
    expect(r2.slice(4).map((r) => [r.id, r.error ?? "ok"])).toEqual([
      ["id2", "ok"],
      ["id3", "llm_error"],
      ["id4", "ok"],
    ]);

    // Phase 3: second --retry-failed reprocesses ONLY id3 (id2 and id4 last rows are now ok).
    phase = 3;
    const beforeRetry2 = called.length;
    await captureLogs(() => runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high", retryFailed: true }, undefined, deps));
    expect(called.length - beforeRetry2).toBe(1);
    const r3 = readRows(d);
    expect(r3.length).toBe(8);
    expect(r3[7]).toMatchObject({ id: "id3", fields: { company: { value: "Beta Corp.", quote: "Beta Corp.", sha256: S2 } } });
  });

  it("wires --retry-failed through the CLI scrap extract command", async () => {
    const { main } = await import("../src/cli.js");
    const d = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("id1", [S1])]);
    writeFileSync(join(d, "results.ndjson"), `${JSON.stringify({ id: "id1", url: "http://x/id1", fields: { company: { value: "Acme", quote: "Acme", sha256: S1 } } })}\n`);
    const pa = process.argv, pc = process.cwd(), pe = process.exit, ce = console.error, cl = console.log;
    let code: number | null = 0;
    console.log = (() => {}) as any;
    console.error = (() => {}) as any;
    (process as any).exit = ((c?: any) => { code = c ?? 0; throw new Error(`__exit__${code}`); }) as any;
    process.argv = ["node", "engram", "scrap", "extract", "--out", d, "--mission", join(d, "mission.json"), "--model", "openai:gpt-5-mini", "--retry-failed"];
    process.chdir(d);
    try { await main(); } catch (e) { if (!String(e).includes("__exit__")) throw e; }
    finally { process.argv = pa; process.chdir(pc); process.exit = pe; console.error = ce; console.log = cl; }
    // id1 is already ok, so --retry-failed has nothing to redo and exits 0 without needing credentials.
    expect(code).toBe(0);
    expect(readRows(d).length).toBe(1);
  });

  it("applies output budget arithmetic with effort (default 8192 and custom) and without effort", async () => {
    const seen: { alias: string; maxOutputTokens?: number; effort?: string }[] = [];
    const runBudget = async (alias: string, extraMission: Record<string, unknown> = {}) => {
      const d = makeDir({ fields: ["company"], instruction: "Extract.", ...extraMission }, [okRow("a1", [S1])]);
      const deps = meshDeps(async (req) => {
        seen.push({ alias, maxOutputTokens: req.maxOutputTokens, effort: req.reasoning?.effort });
        return { text: JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } }) };
      });
      await captureLogs(() => runExtract({ out: d, mission: join(d, "mission.json"), model: `mesh:${alias}` }, undefined, deps));
    };

    await runBudget("gemini-4-hydrogen-high");
    await runBudget("gemini-4-hydrogen-high", { reasoning_budget_tokens: 4096 });
    await runBudget("gemini-4-hydrogen");
    await runBudget("gemini-4-hydrogen", { reasoning_budget_tokens: 4096 });

    expect(seen).toEqual([
      { alias: "gemini-4-hydrogen-high", maxOutputTokens: 2000 + 8192, effort: "high" },
      { alias: "gemini-4-hydrogen-high", maxOutputTokens: 2000 + 4096, effort: "high" },
      { alias: "gemini-4-hydrogen", maxOutputTokens: 2000, effort: undefined },
      { alias: "gemini-4-hydrogen", maxOutputTokens: 2000, effort: undefined },
    ]);
  });

  it("performs ONE bounded repair on JSON parse failure (repair success and second failure)", async () => {
    const d1 = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("ok-repair", [S1])]);
    const calls1: { prompt: string; maxOutputTokens?: number }[] = [];
    const truncated = '{"company": {"value": "Acme Canada';
    const deps1 = meshDeps(async (req) => {
      calls1.push({ prompt: String(req.messages[1].content), maxOutputTokens: req.maxOutputTokens });
      if (calls1.length === 1) {
        return { text: truncated, usage: { inputTokens: 100, outputTokens: 20, thoughtsTokenCount: 400, totalTokens: 520 } };
      }
      return {
        text: JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } }),
        usage: { inputTokens: 140, outputTokens: 30, thoughtsTokenCount: 100, totalTokens: 270 },
      };
    });
    await captureLogs(() => runExtract({ out: d1, mission: join(d1, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, deps1));
    expect(calls1.length).toBe(2);
    expect(calls1[1]!.maxOutputTokens).toBe(calls1[0]!.maxOutputTokens);
    expect(calls1[1]!.prompt).toContain(truncated);
    expect(calls1[1]!.prompt).toMatch(/Unterminated string|not valid JSON/i);
    const row1 = readRows(d1)[0];
    expect(row1.error).toBeUndefined();
    expect(row1.fields.company).toEqual({ value: "Acme Canada Inc.", quote: "Acme Canada Inc.", sha256: S1 });
    expect(row1.tokens).toEqual({ inputTokens: 240, outputTokens: 50, thoughtsTokenCount: 500, totalTokens: 790 });

    // Second failure stays parse_error, bounded to 2 total calls.
    const d2 = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("double-fail", [S1])]);
    let calls2 = 0;
    const deps2 = meshDeps(async () => {
      calls2++;
      return { text: '{"company": "still broken' };
    });
    await captureLogs(() => runExtract({ out: d2, mission: join(d2, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, deps2));
    expect(calls2).toBe(2);
    expect(readRows(d2)).toHaveLength(1);
    expect(readRows(d2)[0]).toMatchObject({ id: "double-fail", error: "parse_error", fields: null });
  });

  it("records empty/filtered responses as distinct empty_response and never retries in the same run", async () => {
    const d = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("e1", [S1]), okRow("e2", [S2])]);
    let calls = 0;
    const deps = meshDeps(async (req) => {
      calls++;
      return { text: String(req.messages[1].content).includes("Beta") ? "   \n  " : "" };
    });
    await captureLogs(() => runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, deps));
    expect(calls).toBe(2);
    expect(readRows(d).map((r) => [r.id, r.error])).toEqual([
      ["e1", "empty_response"],
      ["e2", "empty_response"],
    ]);

    // Also when a client throws "LLM returned empty or filtered response" directly:
    const dThrown = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("e3", [S1])]);
    let thrownCalls = 0;
    const directStub = { generateJson: async () => { thrownCalls++; throw new Error("LLM returned empty or filtered response"); } };
    await captureLogs(() => runExtract({ out: dThrown, mission: join(dThrown, "mission.json"), model: "openai:gpt-5-mini" }, directStub));
    expect(thrownCalls).toBe(1);
    expect(readRows(dThrown)[0]).toMatchObject({ id: "e3", error: "empty_response", fields: null });
  });

  it("supports multi-value fields (max_values 3 with one bad quote, cap 5) while keeping single-value shape", async () => {
    const d = makeDir(
      {
        fields: [
          "company",
          { name: "offices", max_values: 3 },
          { name: "tags", max_values: 9 },
        ],
        instruction: "Extract company, Canadian offices, and tags.",
      },
      [okRow("multi1", [S1, S2])],
    );
    let capturedPrompt = "";
    const deps = meshDeps(async (req) => {
      capturedPrompt = String(req.messages[1].content);
      return {
        text: JSON.stringify({
          company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." },
          offices: [
            { value: "Toronto, ON", quote: "Office in Toronto, ON" },
            { value: "Ottawa, ON", quote: "99 Fake Parliament Hill" },
            { value: "Vancouver, BC", quote: "Vancouver, BC branch office" },
          ],
          tags: [
            { value: "t1", quote: "t1" },
            { value: "t2", quote: "t2" },
            { value: "t3", quote: "t3" },
            { value: "t4", quote: "t4" },
            { value: "t5", quote: "t5" },
            { value: "t6", quote: "t6" },
          ],
        }),
      };
    });
    await captureLogs(() => runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen" }, undefined, deps));
    expect(capturedPrompt).toContain("offices (array of up to 3)");
    expect(capturedPrompt).toContain("tags (array of up to 5)");
    const row = readRows(d)[0];
    expect(row.fields.company).toEqual({ value: "Acme Canada Inc.", quote: "Acme Canada Inc.", sha256: S1 });
    expect(row.fields.offices).toEqual({
      values: [
        { value: "Toronto, ON", quote: "Office in Toronto, ON", sha256: S1 },
        { value: "Vancouver, BC", quote: "Vancouver, BC branch office", sha256: S2 },
      ],
      unverified_dropped: 1,
    });
    expect(row.fields.tags.values).toHaveLength(5);
    expect(row.fields.tags.unverified_dropped).toBe(0);
  });

  it("computes cost record with price table present/absent/undated, quota present/absent, and prints summary line", async () => {
    const usage = { inputTokens: 1000, outputTokens: 200, thoughtsTokenCount: 500, totalTokens: 1700 };
    const answer = JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } });

    // 1. Price table present + quota present on response
    const d1 = makeDir(
      {
        fields: ["company"],
        instruction: "Extract.",
        price_table: { source: "operator-pricing", as_of: "2026-11-22", per_million: { input: 2, output: 10, reasoning: 10 } },
      },
      [okRow("c1", [S1]), okRow("c2", [S1])],
    );
    const logs1 = await captureLogs(() =>
      runExtract(
        { out: d1, mission: join(d1, "mission.json"), model: "mesh:gemini-4-hydrogen-high" },
        undefined,
        meshDeps(async () => ({ text: answer, usage, quota: { remaining: 88, window: "5h" } })),
      ),
    );
    const rows1 = readRows(d1);
    // (1000*2 + 200*10 + 500*10) / 1_000_000 = 0.009 per id
    expect(rows1[0].cost).toEqual({ api_equivalent: 0.009, seat_quota: { remaining: 88, window: "5h" } });
    expect(rows1[0].tokens).toEqual(usage);
    const summary1 = logs1.find((l) => l.includes("scrap extract summary"));
    expect(summary1).toBeDefined();
    expect(summary1).toContain("in:2000,out:400,reasoning:1000,total:3400");
    expect(summary1).toContain("api_equivalent=0.018000");

    // 2. Price table absent + quota absent
    const d2 = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("c3", [S1])]);
    const logs2 = await captureLogs(() =>
      runExtract(
        { out: d2, mission: join(d2, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        meshDeps(async () => ({ text: answer, usage })),
      ),
    );
    expect(readRows(d2)[0].cost).toEqual({ api_equivalent: "unknown", seat_quota: "unknown" });
    expect(logs2.find((l) => l.includes("scrap extract summary"))).toContain("api_equivalent=unknown");

    // 3. Undated price table (missing as_of) rejected -> "unknown"; quota via attempt.complete() copied
    const d3 = makeDir(
      {
        fields: ["company"],
        instruction: "Extract.",
        price_table: { source: "operator-pricing", as_of: "", per_million: { input: 2, output: 10, reasoning: 10 } },
      },
      [okRow("c4", [S1])],
    );
    await captureLogs(() =>
      runExtract(
        { out: d3, mission: join(d3, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        meshDeps(async () => ({ text: answer, usage }), { quota: { remaining: 12 } }),
      ),
    );
    expect(readRows(d3)[0].cost).toEqual({ api_equivalent: "unknown", seat_quota: { remaining: 12 } });
  });

  it("stays backward compatible with mission.tier0.json files", async () => {
    const d = makeDir(
      { fields: ["company", { name: "city" }], instruction: "Extract company and city.", tokenCap: 12000 },
      [okRow("t0", [S1])],
    );
    const deps = meshDeps(async () => ({
      text: JSON.stringify({
        company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." },
        city: { value: "Toronto", quote: "not in snapshot" },
      }),
      usage: { inputTokens: 50, outputTokens: 10 },
    }));
    await captureLogs(() => runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen" }, undefined, deps));
    const row = readRows(d)[0];
    expect(row.fields.company).toEqual({ value: "Acme Canada Inc.", quote: "Acme Canada Inc.", sha256: S1 });
    expect(row.fields.city).toEqual({ value: null, quote: null, sha256: null, reason: "unverified_quote" });
    expect(row.tokens).toEqual({ inputTokens: 50, outputTokens: 10 });
    expect(row.cost).toEqual({ api_equivalent: "unknown", seat_quota: "unknown" });
  });

  it("carries truncated text into the repair prompt in direct mode and counts attempt-0 tokens", async () => {
    directGenerateTextMock.mockReset();
    const truncated = '{"company": {"value": "Acme Canada';
    const valid = JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } });
    directGenerateTextMock
      .mockResolvedValueOnce({ text: truncated, finishReason: "length", usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } })
      .mockResolvedValueOnce({ text: valid, finishReason: "stop", usage: { inputTokens: 140, outputTokens: 30, totalTokens: 170 } })
      .mockResolvedValueOnce({ text: '{"company": "still broken', finishReason: "length", usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 } })
      .mockResolvedValueOnce({ text: '{"company": "broken again', finishReason: "length", usage: { inputTokens: 60, outputTokens: 15, totalTokens: 75 } });

    const d = makeDir(
      {
        fields: ["company"],
        instruction: "Extract company.",
        price_table: { source: "op", as_of: "2026-11-22", per_million: { input: 2, output: 10 } },
      },
      [okRow("dir-ok", [S1]), okRow("dir-fail", [S1])],
    );
    const savedKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    let logs: string[] = [];
    try {
      logs = await captureLogs(() => runExtract({ out: d, mission: join(d, "mission.json"), model: "openai:gpt-5-mini" }));
    } finally {
      if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = savedKey;
    }

    expect(directGenerateTextMock).toHaveBeenCalledTimes(4);
    const repairCall = directGenerateTextMock.mock.calls[1]![0] as { prompt: string };
    expect(repairCall.prompt).toContain(truncated);
    expect(repairCall.prompt).toMatch(/not valid JSON/i);

    const rows = readRows(d);
    expect(rows[0]).toMatchObject({
      id: "dir-ok",
      fields: { company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc.", sha256: S1 } },
      tokens: { inputTokens: 240, outputTokens: 50, totalTokens: 290 },
      cost: { api_equivalent: 0.00098, seat_quota: "unknown" },
    });
    expect(rows[1]).toMatchObject({ id: "dir-fail", error: "parse_error", fields: null });

    const summary = logs.find((l) => l.includes("scrap extract summary"));
    // Total tokens across all 4 calls: in=350, out=75, reasoning=0, total=425; api=(350*2+75*10)/1e6=0.001450
    expect(summary).toContain("ok=1 failed=1");
    expect(summary).toContain("tokens=in:350,out:75,reasoning:0,total:425");
    expect(summary).toContain("api_equivalent=0.001450");
  });

  it("counts malformed multi-value scalars in unverified_dropped and verifies quotes before the max_values slice", async () => {
    const d = makeDir(
      {
        fields: [
          { name: "scalar_str", max_values: 3 },
          { name: "scalar_no_val", max_values: 3 },
          { name: "scalar_null", max_values: 3 },
          { name: "offices", max_values: 2 },
          { name: "trailing_bad", max_values: 2 },
        ],
        instruction: "Extract.",
      },
      [okRow("mv-edge", [S1, S2])],
    );
    const deps = meshDeps(async () => ({
      text: JSON.stringify({
        scalar_str: "Toronto, ON",
        scalar_no_val: { quote: "Office in Toronto, ON" },
        scalar_null: { value: null, quote: null },
        offices: [
          { value: "Fake City", quote: "99 Nonexistent Blvd" },
          "raw-string-entry",
          { value: "Toronto, ON", quote: "Office in Toronto, ON" },
          { value: "Montreal, QC", quote: "Bureau in Montreal, QC" },
          { value: "Vancouver, BC", quote: "Vancouver, BC branch office" },
        ],
        trailing_bad: [
          { value: "t1", quote: "t1" },
          { value: "t2", quote: "t2" },
          { value: "bogus", quote: "not in snapshot" },
        ],
      }),
    }));
    await captureLogs(() => runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen" }, undefined, deps));
    const row = readRows(d)[0];
    expect(row.fields.scalar_str).toEqual({ values: [], unverified_dropped: 1 });
    expect(row.fields.scalar_no_val).toEqual({ values: [], unverified_dropped: 1 });
    expect(row.fields.scalar_null).toEqual({ values: [], unverified_dropped: 0 });
    expect(row.fields.offices).toEqual({
      values: [
        { value: "Toronto, ON", quote: "Office in Toronto, ON", sha256: S1 },
        { value: "Montreal, QC", quote: "Bureau in Montreal, QC", sha256: S1 },
      ],
      unverified_dropped: 2,
    });
    expect(row.fields.trailing_bad).toEqual({
      values: [
        { value: "t1", quote: "t1", sha256: S1 },
        { value: "t2", quote: "t2", sha256: S1 },
      ],
      unverified_dropped: 1,
    });
  });

  it("ignores non-plain quota payloads (arrays) on both response and attempt.complete", async () => {
    const answer = JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } });
    const d1 = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("q1", [S1])]);
    await captureLogs(() =>
      runExtract(
        { out: d1, mission: join(d1, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        meshDeps(async () => ({ text: answer, quota: ["bad", "array"] as unknown as Record<string, unknown> })),
      ),
    );
    expect(readRows(d1)[0].cost.seat_quota).toBe("unknown");

    const d2 = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("q2", [S1])]);
    await captureLogs(() =>
      runExtract(
        { out: d2, mission: join(d2, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        meshDeps(async () => ({ text: answer }), { quota: [1, 2, 3] }),
      ),
    );
    expect(readRows(d2)[0].cost.seat_quota).toBe("unknown");
  });

  it("validates price_table.as_of as a real date and prints the run summary even when nothing is left to do", async () => {
    const answer = JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } });
    const usage = { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 };

    for (const badDate of ["not-a-date", "TBD", "1", "2026-13-01", "2026-02-30"]) {
      const d = makeDir(
        {
          fields: ["company"],
          instruction: "Extract.",
          price_table: { source: "op", as_of: badDate, per_million: { input: 2, output: 10 } },
        },
        [okRow("bd", [S1])],
      );
      const logs = await captureLogs(() =>
        runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen" }, undefined, meshDeps(async () => ({ text: answer, usage }))),
      );
      expect(readRows(d)[0].cost.api_equivalent, `bad as_of=${badDate}`).toBe("unknown");
      expect(logs.find((l) => l.includes("scrap extract summary"))).toContain("api_equivalent=unknown");
    }

    // Valid ISO timestamp is accepted.
    const dIso = makeDir(
      {
        fields: ["company"],
        instruction: "Extract.",
        price_table: { source: "op", as_of: "2026-11-22T01:00:00Z", per_million: { input: 2, output: 10 } },
      },
      [okRow("iso", [S1])],
    );
    await captureLogs(() =>
      runExtract({ out: dIso, mission: join(dIso, "mission.json"), model: "mesh:gemini-4-hydrogen" }, undefined, meshDeps(async () => ({ text: answer, usage }))),
    );
    expect(readRows(dIso)[0].cost.api_equivalent).toBe(0.004);

    // Empty todo (all ids already done) still prints summary without needing credentials or LLM calls.
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const logsDone = await captureLogs(() => runExtract({ out: dIso, mission: join(dIso, "mission.json"), model: "openai:gpt-5-mini" }));
      expect(logsDone.find((l) => l.includes("scrap extract summary"))).toBe(
        "scrap extract summary: ok=0 failed=0 tokens=in:0,out:0,reasoning:0,total:0 api_equivalent=0.000000",
      );

      const dNone = makeDir({ fields: ["company"], instruction: "Extract." }, [{ id: "dns1", url: "http://x/1", status: "dns", pages: [] }]);
      const logsNone = await captureLogs(() => runExtract({ out: dNone, mission: join(dNone, "mission.json"), model: "openai:gpt-5-mini" }));
      expect(logsNone.find((l) => l.includes("scrap extract summary"))).toBe(
        "scrap extract summary: ok=0 failed=0 tokens=in:0,out:0,reasoning:0,total:0 api_equivalent=unknown",
      );
    } finally {
      if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
    }
  });
});
