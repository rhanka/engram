import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runExtract, validPriceTable, type PriceTable } from "../src/scrap/extract.js";

const HTML = "<html><body><p>Acme Canada Inc. 123 Maple St, Toronto, ON.</p></body></html>";
const SHA = createHash("sha256").update(HTML).digest("hex");
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function makeOut(mission: Record<string, unknown>): string {
  const d = mkdtempSync(join(tmpdir(), "scx-cur-"));
  dirs.push(d);
  mkdirSync(join(d, "snapshots"), { recursive: true });
  writeFileSync(join(d, "snapshots", `${SHA}.html`), HTML);
  const pages = [{ url: "http://x/", final_url: "http://x/", status: 200, bytes: HTML.length, sha256: SHA }];
  writeFileSync(join(d, "state.jsonl"), `${JSON.stringify({ id: "a1", url: "http://x/", status: "ok", pages })}\n`);
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
});
