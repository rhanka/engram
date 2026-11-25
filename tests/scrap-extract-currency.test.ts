import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isExtractUsageError, runExtract, validPriceTable, type PriceTable } from "../src/scrap/extract.js";

const HTML = "<html><body><p>Acme Canada Inc. 123 Maple St, Toronto, ON.</p></body></html>";
const SHA = createHash("sha256").update(HTML).digest("hex");
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function makeOut(mission: Record<string, unknown>, status: "ok" | "dns" = "ok"): string {
  const d = mkdtempSync(join(tmpdir(), "scx-cur-"));
  dirs.push(d);
  mkdirSync(join(d, "snapshots"), { recursive: true });
  writeFileSync(join(d, "snapshots", `${SHA}.html`), HTML);
  const pages = status === "ok"
    ? [{ url: "http://x/", final_url: "http://x/", status: 200, bytes: HTML.length, sha256: SHA }]
    : [];
  writeFileSync(join(d, "state.jsonl"), `${JSON.stringify({ id: "a1", url: "http://x/", status, pages })}\n`);
  writeFileSync(join(d, "mission.json"), JSON.stringify(mission));
  return d;
}

const readRows = (d: string): Record<string, any>[] =>
  readFileSync(join(d, "results.ndjson"), "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const stubClient = (usage?: Record<string, number>, quota?: Record<string, unknown>) => ({
  client: {
    generateJson: async (input: { validateResponse?: (text: string) => void | Promise<void> }) => {
      await input.validateResponse?.(
        JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } }),
      );
      return {
        status: "completed",
        provider: "test",
        mode: "direct",
        audit: { ...(usage ? { usage } : {}), ...(quota ? { quota } : {}) },
      };
    },
  },
});

async function captureLogs<T>(fn: () => Promise<T>): Promise<T> {
  const orig = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = orig; }
}

async function runCli(args: string[], cwd: string): Promise<number> {
  const { main } = await import("../src/cli.js");
  const pa = process.argv, pc = process.cwd(), pe = process.exit, ce = console.error, cl = console.log;
  let code = 0;
  console.log = () => {};
  console.error = () => {};
  (process as { exit: (c?: number) => never }).exit = ((c?: number) => {
    code = c ?? 0;
    throw new Error(`__exit__${code}`);
  }) as (c?: number) => never;
  process.argv = ["node", "engram", ...args];
  process.chdir(cwd);
  try { await main(); } catch (e) { if (!String(e).includes("__exit__")) throw e; } finally {
    process.argv = pa; process.chdir(pc); process.exit = pe; console.error = ce; console.log = cl;
  }
  return code;
}

describe("BD-0: PriceTable currency & status", () => {
  it("defaults omitted currency to USD and omitted status to secondary_unverified via validPriceTable", () => {
    const input: PriceTable = { source: " op-sheet ", as_of: " 2026-11-22 ", per_million: { input: 2, output: 10 } };
    expect(validPriceTable(input)).toEqual({
      source: "op-sheet",
      as_of: "2026-11-22",
      currency: "USD",
      status: "secondary_unverified",
      per_million: { input: 2, output: 10 },
    });
    expect(validPriceTable(undefined)).toBeNull();

    const base: PriceTable = { source: "op-sheet", as_of: "2026-11-22", per_million: { input: 2, output: 10 } };
    expect(validPriceTable({ ...base, currency: "CAD" })).toEqual({
      ...base,
      currency: "CAD",
      status: "secondary_unverified",
    });
    expect(validPriceTable({ ...base, status: "primary" })).toEqual({
      ...base,
      currency: "USD",
      status: "primary",
    });
  });

  it("preserves explicit currency CAD and status primary via validPriceTable", () => {
    const cadPrimary: PriceTable = {
      source: "anthropic-tariff",
      as_of: "2026-11-22",
      currency: "CAD",
      status: "primary",
      per_million: { input: 3, output: 15, reasoning: 15 },
    };
    expect(validPriceTable(cadPrimary)).toEqual({
      source: "anthropic-tariff",
      as_of: "2026-11-22",
      currency: "CAD",
      status: "primary",
      per_million: { input: 3, output: 15, reasoning: 15 },
    });
    expect(validPriceTable({ ...cadPrimary, currency: "USD", status: "secondary_unverified" })).toMatchObject({
      currency: "USD",
      status: "secondary_unverified",
    });
  });

  it(
    "stamps cost.currency USD by default on item and summary rows and omits it when price_table is absent",
    async () => {
      const dWithPt = makeOut({
        fields: ["company"],
        instruction: "Extract.",
        price_table: { source: "op", as_of: "2026-11-22", per_million: { input: 2, output: 10, reasoning: 10 } },
      });
      const stub1 = stubClient(
        { inputTokens: 1000, outputTokens: 200, thoughtsTokenCount: 500, totalTokens: 1700 },
        { remaining: 77 },
      );
      await captureLogs(() =>
        runExtract({ out: dWithPt, mission: join(dWithPt, "mission.json"), model: "openai:gpt-5-mini" }, stub1.client),
      );
      const rows1 = readRows(dWithPt);
      const item1 = rows1.find((r) => r.id === "a1")!;
      const sum1 = rows1.find((r) => r.type === "summary")!;
      expect(item1.cost).toEqual({ currency: "USD", api_equivalent: 0.009, seat_quota: { remaining: 77 } });
      expect(sum1.cost).toEqual({ currency: "USD", api_equivalent: 0.009, seat_quota: { remaining: 77 } });

      const dNoPt = makeOut({ fields: ["company"], instruction: "Extract." });
      const stub2 = stubClient({ inputTokens: 100, outputTokens: 20, totalTokens: 120 });
      await captureLogs(() =>
        runExtract({ out: dNoPt, mission: join(dNoPt, "mission.json"), model: "openai:gpt-5-mini" }, stub2.client),
      );
      const rows2 = readRows(dNoPt);
      const item2 = rows2.find((r) => r.id === "a1")!;
      const sum2 = rows2.find((r) => r.type === "summary")!;
      expect(item2.cost).toEqual({ api_equivalent: "unknown", seat_quota: "unknown" });
      expect(sum2.cost).toEqual({ api_equivalent: "unknown", seat_quota: "unknown" });
      expect("currency" in item2.cost).toBe(false);
      expect("currency" in sum2.cost).toBe(false);
    },
  );

  it("stamps cost.currency CAD on both item and summary rows when currency is CAD and status is primary", async () => {
    const d = makeOut({
      fields: ["company"],
      instruction: "Extract.",
      price_table: {
        source: "ca-invoice",
        as_of: "2026-11-22",
        currency: "CAD",
        status: "primary",
        per_million: { input: 2, output: 10 },
      },
    });
    const stub = stubClient({ inputTokens: 1000, outputTokens: 200, totalTokens: 1200 }, { remaining: 50 });
    await captureLogs(() =>
      runExtract({ out: d, mission: join(d, "mission.json"), model: "openai:gpt-5-mini" }, stub.client),
    );
    const rows = readRows(d);
    const item = rows.find((r) => r.id === "a1")!;
    const sum = rows.find((r) => r.type === "summary")!;
    expect(item.cost).toEqual({ currency: "CAD", api_equivalent: 0.004, seat_quota: { remaining: 50 } });
    expect(sum.cost).toEqual({ currency: "CAD", api_equivalent: 0.004, seat_quota: { remaining: 50 } });
  });

  it("stamps cost.currency when price_table is valid and api_equivalent is unknown", async () => {
    const d = makeOut({
      fields: ["company"],
      instruction: "Extract.",
      price_table: {
        source: "ca-invoice",
        as_of: "2026-11-22",
        currency: "CAD",
        per_million: { input: 2, output: 10 },
      },
    });
    const stub = stubClient();
    await captureLogs(() =>
      runExtract({ out: d, mission: join(d, "mission.json"), model: "openai:gpt-5-mini" }, stub.client),
    );
    const rows = readRows(d);
    expect(rows.find((r) => r.id === "a1")!.cost).toEqual({
      currency: "CAD",
      api_equivalent: "unknown",
      seat_quota: "unknown",
    });
    expect(rows.find((r) => r.type === "summary")!.cost).toEqual({
      currency: "CAD",
      api_equivalent: "unknown",
      seat_quota: "unknown",
    });
  });

  it("keeps degrading invalid as_of/source/per_million without throwing", async () => {
    const d = makeOut({
      fields: ["company"],
      instruction: "Extract.",
      price_table: { source: "op", as_of: "", per_million: { input: 2, output: 10 } },
    });
    const stub = stubClient({ inputTokens: 100, outputTokens: 20, totalTokens: 120 });
    await captureLogs(() =>
      runExtract({ out: d, mission: join(d, "mission.json"), model: "openai:gpt-5-mini" }, stub.client),
    );
    const rows = readRows(d);
    expect(rows.find((r) => r.id === "a1")!.cost).toEqual({ api_equivalent: "unknown", seat_quota: "unknown" });
    expect(rows.find((r) => r.type === "summary")!.cost).toEqual({ api_equivalent: "unknown", seat_quota: "unknown" });
  });

  it(
    "refuses invalid currency, invalid status, or non-object price_table before any provider call and exits 2 via CLI",
    async () => {
      const pm = { input: 2, output: 10 };
      const badTables: Array<[string, unknown]> = [
        ["currency EUR", { source: "op", as_of: "2026-11-22", currency: "EUR", per_million: pm }],
        ["lowercase currency usd", { source: "op", as_of: "2026-11-22", currency: "usd", per_million: pm }],
        ["empty currency", { source: "op", as_of: "2026-11-22", currency: "", per_million: pm }],
        ["null currency", { source: "op", as_of: "2026-11-22", currency: null, per_million: pm }],
        ["currency EUR even with empty source", { source: "", as_of: "2026-11-22", currency: "EUR", per_million: pm }],
        ["currency EUR even with empty as_of", { source: "op", as_of: "", currency: "EUR", per_million: pm }],
        ["status verified", { source: "op", as_of: "2026-11-22", status: "verified", per_million: pm }],
        ["empty status", { source: "op", as_of: "2026-11-22", status: "", per_million: pm }],
        ["null status", { source: "op", as_of: "2026-11-22", status: null, per_million: pm }],
        [
          "status verified even with empty source",
          { source: "", as_of: "2026-11-22", status: "verified", per_million: pm },
        ],
        ["status verified even with empty as_of", { source: "op", as_of: "", status: "verified", per_million: pm }],
        ["null price_table", null],
        ["string price_table", "USD"],
        ["array price_table", []],
      ];

      const savedKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try {
        for (const [label, pt] of badTables) {
          expect(() => validPriceTable(pt), label).toThrow();
          try {
            validPriceTable(pt);
          } catch (err) {
            expect(isExtractUsageError(err), `${label}: isExtractUsageError`).toBe(true);
          }

          const d = makeOut({ fields: ["company"], instruction: "Extract.", price_table: pt });
          let providerCalls = 0;
          const neverCalledClient = {
            generateJson: async () => {
              providerCalls++;
              return { status: "completed", text: "{}" };
            },
          };
          let thrown: unknown;
          try {
            await runExtract(
              { out: d, mission: join(d, "mission.json"), model: "openai:gpt-5-mini" },
              neverCalledClient,
            );
          } catch (err) {
            thrown = err;
          }
          expect(thrown, `${label}: runExtract should throw`).toBeDefined();
          expect(isExtractUsageError(thrown), `${label}: runExtract error matches isExtractUsageError`).toBe(true);
          expect(providerCalls, `${label}: zero LLM calls`).toBe(0);
          expect(existsSync(join(d, "results.ndjson")), `${label}: no results.ndjson written`).toBe(false);

          let meshFactoryCalls = 0;
          await expect(
            runExtract(
              { out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen" },
              undefined,
              {
                createMeshClient: async () => {
                  meshFactoryCalls++;
                  return { client: neverCalledClient };
                },
              },
            ),
          ).rejects.toSatisfy((err) => isExtractUsageError(err));
          expect(meshFactoryCalls, `${label}: zero mesh provider calls`).toBe(0);
        }

        // CLI exit code 2 for invalid currency, invalid status, and non-object price_table (even on empty todo)
        for (const pt of [
          { source: "op", as_of: "2026-11-22", currency: "EUR", per_million: pm },
          { source: "op", as_of: "2026-11-22", status: "verified", per_million: pm },
          "bad-price-table",
        ]) {
          const dCli = makeOut({ fields: ["company"], instruction: "Extract.", price_table: pt }, "dns");
          const cliArgs = ["scrap", "extract", "--out", dCli, "--mission", join(dCli, "mission.json"),
            "--model", "openai:gpt-5-mini"];
          expect(await runCli(cliArgs, dCli)).toBe(2);
        }

        // Valid CAD/primary price_table exits 0 when nothing is left to do
        const dOk = makeOut({
          fields: ["company"],
          instruction: "Extract.",
          price_table: {
            source: "op",
            as_of: "2026-11-22",
            currency: "CAD",
            status: "primary",
            per_million: pm,
          },
        }, "dns");
        const okArgs = ["scrap", "extract", "--out", dOk, "--mission", join(dOk, "mission.json"),
          "--model", "openai:gpt-5-mini"];
        expect(await runCli(okArgs, dOk)).toBe(0);
      } finally {
        if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
      }
    },
  );
});
