import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoutePlanError } from "@sentropic/llm-mesh";
import { describe, expect, it } from "vitest";
import { createGraphifyMesh, meshTextJsonClient } from "../src/llm-mesh-bridge.js";
import { isExtractUsageError, runExtract } from "../src/scrap/extract.js";
import { createScrapMeshClient } from "../src/scrap/mesh-host.js";

const P1 =
  "<html><body><p>Acme Canada Inc. Headquarters: 100 King St W, Toronto, ON M5X 1A9. " +
  "Quebec Office: 500 Rue Saint-Jacques, Montreal, QC H2Y 1S1. Tags: t1 t2 t3.</p></body></html>";
const P2 =
  "<html><body><p>Western Branch: 1055 W Georgia St, Vancouver, BC V6E 3P3. " +
  "Atlantic Desk: 1801 Hollis St, Halifax, NS B3J 3N4. " +
  "Prairie Hub: 225 6 Ave SW, Calgary, AB T2P 1N2. " +
  "Capital Office: 50 O'Connor St, Ottawa, ON K1P 6L2.</p></body></html>";
const S1 = createHash("sha256").update(P1).digest("hex");
const S2 = createHash("sha256").update(P2).digest("hex");

const OFFICES_FIELD = {
  name: "offices",
  kind: "record" as const,
  max_values: 3,
  fields: [
    { name: "street", instruction: "Street address of this Canadian office" },
    { name: "city", instruction: "City name of this office" },
    { name: "province", instruction: "Two-letter Canadian province/territory code" },
    { name: "postal_code", instruction: "Canadian postal code (A1A 1A1)" },
  ],
};

function makeDir(mission: Record<string, unknown>, stateRows: Record<string, unknown>[]): string {
  const d = mkdtempSync(join(tmpdir(), "sct03-"));
  mkdirSync(join(d, "snapshots"), { recursive: true });
  writeFileSync(join(d, "snapshots", `${S1}.html`), P1);
  writeFileSync(join(d, "snapshots", `${S2}.html`), P2);
  writeFileSync(join(d, "state.jsonl"), stateRows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(d, "mission.json"), JSON.stringify(mission));
  return d;
}

const okRow = (id: string, shas: string[] = [S1, S2]): Record<string, unknown> => ({
  id,
  url: `http://x/${id}`,
  status: "ok",
  pages: shas.map((sha256, i) => ({
    url: `http://x/${id}/${i}`,
    final_url: `http://x/${id}/${i}`,
    status: 200,
    bytes: 1,
    sha256,
  })),
});

const allRows = (d: string): any[] =>
  readFileSync(join(d, "results.ndjson"), "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const idRows = (d: string): any[] => allRows(d).filter((r) => r.type !== "summary");
const summaryRows = (d: string): any[] => allRows(d).filter((r) => r.type === "summary");

function stubFacade(completeResult?: unknown): any {
  return {
    createRoutePlanner: (runtime: any) => ({
      plan: async (_subject: any, input: any) => ({
        planRef: "plan-t03",
        expiresAt: "2030-01-01T00:00:00.000Z",
        candidateRefs: ["c1"],
        policy: {},
        councilRevision: "council-t03",
        diagnostics: [{
          candidateRef: "c1",
          diagnosticAccountRef: "acct_t03",
          requestedModel: input.requestedModel,
          actualProviderId: "gemini",
          actualModelId: "gemini-4-hydrogen",
          actualTransportProviderId: "cloud-code",
          reason: "alias",
          cacheContinuityRisk: false,
        }],
      }),
      prepareAttempt: async () => ({
        attemptRef: "attempt-t03",
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
    providerId?: string;
    modelId?: string;
    usage?: Record<string, unknown>;
    quota?: Record<string, unknown>;
    providerMetadata?: Record<string, unknown>;
  }>,
  opts?: { completeResult?: unknown; now?: () => number },
) {
  return {
    ...(opts?.now ? { now: opts.now } : {}),
    createMeshClient: async (alias: string) =>
      createScrapMeshClient(alias, {
        facade: stubFacade(opts?.completeResult),
        adapterClients: {
          gemini: {
            generate: async (request: any) => {
              const out = await handler(request);
              return {
                id: "stub-resp",
                providerId: out.providerId ?? "gemini",
                modelId: out.modelId ?? "gemini-4-hydrogen",
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

describe("scrap tier 0.3", () => {
  it("extracts a 3-office record with one bad sub-field quote: keeps passing sub-fields, nulls and counts the bad one, preserves order and per-page sha256", async () => {
    const d = makeDir(
      { fields: [OFFICES_FIELD], instruction: "Extract up to 3 Canadian offices." },
      [okRow("co1", [S1, S2])],
    );
    let capturedPrompt = "";
    const deps = meshDeps(async (req) => {
      capturedPrompt = String(req.messages[1].content);
      return {
        text: JSON.stringify({
          offices: [
            {
              street: { value: "100 King St W", quote: "100 King St W, Toronto" },
              city: { value: "Toronto", quote: "Toronto, ON M5X 1A9" },
              province: { value: "ON", quote: "Toronto, ON M5X 1A9" },
              postal_code: { value: "M5X 1A9", quote: "Toronto, ON M5X 1A9" },
            },
            {
              street: { value: "500 Rue Saint-Jacques", quote: "500 Rue Saint-Jacques" },
              city: { value: "Montreal", quote: "Montreal, QC H2Y 1S1" },
              province: { value: "QC", quote: "Montreal, QC H2Y 1S1" },
              postal_code: { value: "H9Z 9Z9", quote: "fabricated postal code H9Z 9Z9" },
            },
            {
              street: { value: "1055 W Georgia St", quote: "1055 W Georgia St, Vancouver" },
              city: { value: "Vancouver", quote: "Vancouver, BC V6E 3P3" },
              province: { value: "BC", quote: "Vancouver, BC V6E 3P3" },
              postal_code: { value: "V6E 3P3", quote: "Vancouver, BC V6E 3P3" },
            },
          ],
        }),
      };
    });

    await captureLogs(() =>
      runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" }, undefined, deps),
    );

    expect(capturedPrompt).toContain("offices");
    expect(capturedPrompt).toContain("up to 3");
    expect(capturedPrompt).toContain("street");
    expect(capturedPrompt).toContain("Street address of this Canadian office");
    expect(capturedPrompt).toContain("postal_code");

    const row = idRows(d)[0];
    expect(row.fields.offices).toEqual({
      values: [
        {
          street: { value: "100 King St W", quote: "100 King St W, Toronto", sha256: S1 },
          city: { value: "Toronto", quote: "Toronto, ON M5X 1A9", sha256: S1 },
          province: { value: "ON", quote: "Toronto, ON M5X 1A9", sha256: S1 },
          postal_code: { value: "M5X 1A9", quote: "Toronto, ON M5X 1A9", sha256: S1 },
        },
        {
          street: { value: "500 Rue Saint-Jacques", quote: "500 Rue Saint-Jacques", sha256: S1 },
          city: { value: "Montreal", quote: "Montreal, QC H2Y 1S1", sha256: S1 },
          province: { value: "QC", quote: "Montreal, QC H2Y 1S1", sha256: S1 },
          postal_code: { value: null, quote: null, sha256: null, reason: "unverified_quote" },
        },
        {
          street: { value: "1055 W Georgia St", quote: "1055 W Georgia St, Vancouver", sha256: S2 },
          city: { value: "Vancouver", quote: "Vancouver, BC V6E 3P3", sha256: S2 },
          province: { value: "BC", quote: "Vancouver, BC V6E 3P3", sha256: S2 },
          postal_code: { value: "V6E 3P3", quote: "Vancouver, BC V6E 3P3", sha256: S2 },
        },
      ],
      unverified_dropped: 0,
      unverified_subfields: 1,
    });
  });

  it("drops a record entirely when every sub-field fails verification, counts it in unverified_dropped, and keeps order + max_values ≤ 5 cap", async () => {
    const d = makeDir(
      {
        fields: [
          OFFICES_FIELD,
          {
            name: "branches",
            kind: "record",
            max_values: 9,
            fields: [{ name: "city", instruction: "City name" }],
          },
        ],
        instruction: "Extract offices and branches.",
      },
      [okRow("co2", [S1, S2])],
    );
    let capturedPrompt = "";
    const deps = meshDeps(async (req) => {
      capturedPrompt = String(req.messages[1].content);
      return {
        text: JSON.stringify({
          offices: [
            {
              street: { value: "100 King St W", quote: "100 King St W" },
              city: { value: "Toronto", quote: "Toronto, ON" },
              province: { value: null, quote: null },
              postal_code: { value: null, quote: null },
            },
            {
              // Every non-null sub-field fails verification -> dropped entirely.
              street: { value: "99 Phantom Rd", quote: "99 Phantom Rd" },
              city: { value: "Atlantis", quote: "Atlantis, ZZ" },
              province: { value: null, quote: null },
              postal_code: { value: "Z9Z 9Z9", quote: "" },
            },
            // Non-object malformed record -> dropped entirely.
            "raw-unstructured-office",
            // All-null record -> ignored, not counted in unverified_dropped.
            {
              street: { value: null, quote: null },
              city: { value: null, quote: null },
              province: null,
              postal_code: null,
            },
            {
              street: { value: "1055 W Georgia St", quote: "1055 W Georgia St" },
              city: { value: "Vancouver", quote: "Vancouver, BC" },
              province: { value: "BC", quote: "Vancouver, BC" },
              postal_code: { value: "V6E 3P3", quote: "V6E 3P3" },
            },
          ],
          branches: [
            { city: { value: "Toronto", quote: "Toronto" } },
            { city: { value: "Montreal", quote: "Montreal" } },
            { city: { value: "Vancouver", quote: "Vancouver" } },
            { city: { value: "Halifax", quote: "Halifax" } },
            { city: { value: "Calgary", quote: "Calgary" } },
            { city: { value: "Ottawa", quote: "Ottawa" } },
          ],
        }),
      };
    });

    await captureLogs(() =>
      runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen" }, undefined, deps),
    );

    expect(capturedPrompt).toContain("branches");
    expect(capturedPrompt).toContain("up to 5");
    const row = idRows(d)[0];
    expect(row.fields.offices.values.map((o: any) => o.city.value)).toEqual(["Toronto", "Vancouver"]);
    expect(row.fields.offices.values[0].province).toEqual({ value: null, quote: null, sha256: null });
    expect(row.fields.offices.unverified_dropped).toBe(2);
    expect(row.fields.offices.unverified_subfields).toBe(0);

    // max_values: 9 clamped to 5, keeping order of first 5 verified records
    expect(row.fields.branches.values.map((b: any) => b.city.value)).toEqual([
      "Toronto",
      "Montreal",
      "Vancouver",
      "Halifax",
      "Calgary",
    ]);
    expect(row.fields.branches.unverified_dropped).toBe(0);
    expect(row.fields.branches.unverified_subfields).toBe(0);
  });

  it("supports mixed scalar, multi-value scalar, and record fields in the same mission", async () => {
    const d = makeDir(
      {
        fields: [
          "company",
          { name: "tags", max_values: 3 },
          OFFICES_FIELD,
        ],
        instruction: "Extract company, tags, and Canadian offices.",
      },
      [okRow("mix1", [S1, S2])],
    );
    const deps = meshDeps(async () => ({
      text: JSON.stringify({
        company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." },
        tags: [
          { value: "t1", quote: "t1" },
          { value: "fake-tag", quote: "not in snapshot" },
          { value: "t2", quote: "t2" },
        ],
        offices: [
          {
            street: { value: "100 King St W", quote: "100 King St W" },
            city: { value: "Toronto", quote: "Toronto" },
            province: { value: "ON", quote: "Toronto, ON" },
            postal_code: { value: "M5X 1A9", quote: "M5X 1A9" },
          },
        ],
      }),
    }));

    await captureLogs(() =>
      runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen" }, undefined, deps),
    );

    const row = idRows(d)[0];
    expect(row.fields.company).toEqual({ value: "Acme Canada Inc.", quote: "Acme Canada Inc.", sha256: S1 });
    expect(row.fields.tags).toEqual({
      values: [
        { value: "t1", quote: "t1", sha256: S1 },
        { value: "t2", quote: "t2", sha256: S1 },
      ],
      unverified_dropped: 1,
    });
    expect(row.fields.offices).toEqual({
      values: [
        {
          street: { value: "100 King St W", quote: "100 King St W", sha256: S1 },
          city: { value: "Toronto", quote: "Toronto", sha256: S1 },
          province: { value: "ON", quote: "Toronto, ON", sha256: S1 },
          postal_code: { value: "M5X 1A9", quote: "M5X 1A9", sha256: S1 },
        },
      ],
      unverified_dropped: 0,
      unverified_subfields: 0,
    });
  });

  it("counts every LLM call actually sent across first attempt, repair, and --retry-failed retry per routed provider/model", async () => {
    const d = makeDir(
      { fields: ["company"], instruction: "Extract company." },
      [okRow("a1", [S1]), okRow("a2", [S1]), okRow("a3", [S2])],
    );
    const tRun1 = Date.parse("2026-11-22T10:15:00Z");
    const tRun2 = Date.parse("2026-11-22T11:20:00Z");

    // Run 1:
    // - a1: 1st attempt succeeds (1 call -> gemini/gemini-4-hydrogen)
    // - a2: 1st attempt invalid JSON + repair succeeds (2 calls -> gemini/gemini-4-hydrogen, then openai/gpt-routed-1)
    // - a3: 1st attempt throws provider 500 -> llm_error (1 call -> gemini/gemini-4-hydrogen)
    // Total Run 1 = 4 calls sent.
    let call1 = 0;
    const logs1 = await captureLogs(() =>
      runExtract(
        { out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" },
        undefined,
        meshDeps(
          async () => {
            call1++;
            if (call1 === 1) return { text: JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } }) };
            if (call1 === 2) return { text: '{"company": {"value": "broken' };
            if (call1 === 3) {
              return {
                text: JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } }),
                providerId: "openai",
                modelId: "gpt-routed-1",
              };
            }
            throw new Error("provider 500");
          },
          { now: () => tRun1 },
        ),
      ),
    );

    expect(idRows(d).map((r) => [r.id, r.error ?? "ok"])).toEqual([
      ["a1", "ok"],
      ["a2", "ok"],
      ["a3", "llm_error"],
    ]);
    const s1 = summaryRows(d);
    expect(s1).toHaveLength(1);
    expect(s1[0]).toMatchObject({
      type: "summary",
      ok: 2,
      failed: 1,
      calls_total: 4,
      calls_window_minutes: 60,
      calls_by_model: {
        "gemini/gemini-4-hydrogen": 3,
        "openai/gpt-routed-1": 1,
      },
      calls_by_window: [
        {
          window_start: "2026-11-22T10:00:00Z",
          window_end: "2026-11-22T11:00:00Z",
          calls: 4,
          by_model: {
            "gemini/gemini-4-hydrogen": 3,
            "openai/gpt-routed-1": 1,
          },
        },
      ],
      cost: { api_equivalent: "unknown", seat_quota: "unknown" },
    });
    const line1 = logs1.find((l) => l.includes("scrap extract summary"))!;
    expect(line1).toContain("calls=4");
    expect(line1).toContain("2026-11-22T10:00:00Z=4");

    // Plain rerun ignores summary row and sends 0 calls (does not append another summary row).
    let plainCalls = 0;
    await captureLogs(() =>
      runExtract(
        { out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" },
        undefined,
        meshDeps(async () => { plainCalls++; return { text: "{}" }; }, { now: () => tRun2 }),
      ),
    );
    expect(plainCalls).toBe(0);
    expect(summaryRows(d)).toHaveLength(1);

    // Run 2 (--retry-failed): retries ONLY a3 -> 1st attempt invalid JSON + repair succeeds (2 calls).
    let call2 = 0;
    const logs2 = await captureLogs(() =>
      runExtract(
        { out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high", retryFailed: true },
        undefined,
        meshDeps(
          async () => {
            call2++;
            if (call2 === 1) return { text: "{bad" };
            return { text: JSON.stringify({ company: { value: "Western Branch", quote: "Western Branch" } }) };
          },
          { now: () => tRun2 },
        ),
      ),
    );

    expect(call2).toBe(2);
    expect(idRows(d)).toHaveLength(4);
    const sums = summaryRows(d);
    expect(sums).toHaveLength(2);
    expect(sums[1]).toMatchObject({
      type: "summary",
      ok: 1,
      failed: 0,
      calls_total: 2,
      calls_window_minutes: 60,
      calls_by_model: { "gemini/gemini-4-hydrogen": 2 },
      calls_by_window: [
        {
          window_start: "2026-11-22T11:00:00Z",
          window_end: "2026-11-22T12:00:00Z",
          calls: 2,
          by_model: { "gemini/gemini-4-hydrogen": 2 },
        },
      ],
    });
    const line2 = logs2.find((l) => l.includes("scrap extract summary"))!;
    expect(line2).toContain("calls=2");
    expect(line2).toContain("2026-11-22T11:00:00Z=2");
  });

  it("buckets calls across an hour boundary with a fake clock and honors custom calls_window_minutes", async () => {
    // 1. Default 60-minute window aligned on the hour, crossing 10:59 -> 11:00 -> 11:59 -> 12:00
    const d1 = makeDir(
      { fields: ["company"], instruction: "Extract." },
      [okRow("w1", [S1]), okRow("w2", [S1]), okRow("w3", [S1]), okRow("w4", [S1])],
    );
    const stamps = [
      Date.parse("2026-11-22T10:58:30Z"),
      Date.parse("2026-11-22T10:59:59Z"),
      Date.parse("2026-11-22T11:00:00Z"),
      Date.parse("2026-11-22T12:05:10Z"),
    ];
    let idx = 0;
    const logs1 = await captureLogs(() =>
      runExtract(
        { out: d1, mission: join(d1, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        meshDeps(
          async () => ({ text: JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } }) }),
          { now: () => stamps[idx++]! },
        ),
      ),
    );

    const sum1 = summaryRows(d1)[0];
    expect(sum1.calls_window_minutes).toBe(60);
    expect(sum1.calls_total).toBe(4);
    expect(sum1.calls_by_window).toEqual([
      {
        window_start: "2026-11-22T10:00:00Z",
        window_end: "2026-11-22T11:00:00Z",
        calls: 2,
        by_model: { "gemini/gemini-4-hydrogen": 2 },
      },
      {
        window_start: "2026-11-22T11:00:00Z",
        window_end: "2026-11-22T12:00:00Z",
        calls: 1,
        by_model: { "gemini/gemini-4-hydrogen": 1 },
      },
      {
        window_start: "2026-11-22T12:00:00Z",
        window_end: "2026-11-22T13:00:00Z",
        calls: 1,
        by_model: { "gemini/gemini-4-hydrogen": 1 },
      },
    ]);
    const outLine1 = logs1.find((l) => l.includes("scrap extract summary"))!;
    expect(outLine1).toContain("2026-11-22T10:00:00Z=2");
    expect(outLine1).toContain("2026-11-22T11:00:00Z=1");
    expect(outLine1).toContain("2026-11-22T12:00:00Z=1");

    // 2. Custom calls_window_minutes: 15 (aligned on :00, :15, :30, :45)
    const d2 = makeDir(
      { fields: ["company"], instruction: "Extract.", calls_window_minutes: 15 },
      [okRow("q1", [S1]), okRow("q2", [S1]), okRow("q3", [S1])],
    );
    const qStamps = [
      Date.parse("2026-11-22T10:14:59Z"),
      Date.parse("2026-11-22T10:15:00Z"),
      Date.parse("2026-11-22T10:29:59Z"),
    ];
    let qIdx = 0;
    await captureLogs(() =>
      runExtract(
        { out: d2, mission: join(d2, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        meshDeps(
          async () => ({ text: JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } }) }),
          { now: () => qStamps[qIdx++]! },
        ),
      ),
    );
    const sum2 = summaryRows(d2)[0];
    expect(sum2.calls_window_minutes).toBe(15);
    expect(sum2.calls_by_window).toEqual([
      {
        window_start: "2026-11-22T10:00:00Z",
        window_end: "2026-11-22T10:15:00Z",
        calls: 1,
        by_model: { "gemini/gemini-4-hydrogen": 1 },
      },
      {
        window_start: "2026-11-22T10:15:00Z",
        window_end: "2026-11-22T10:30:00Z",
        calls: 2,
        by_model: { "gemini/gemini-4-hydrogen": 2 },
      },
    ]);
  });

  it("copies cost.seat_quota from llm-mesh when present and records 'unknown' when absent on both per-id and summary rows", async () => {
    const answer = JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } });
    const now = () => Date.parse("2026-11-22T14:05:00Z");

    // Present (from response and from attempt.complete)
    const dPresent = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("sq1", [S1])]);
    await captureLogs(() =>
      runExtract(
        { out: dPresent, mission: join(dPresent, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        meshDeps(async () => ({ text: answer, quota: { remaining: 42, window: "5h" } }), { now }),
      ),
    );
    expect(idRows(dPresent)[0].cost.seat_quota).toEqual({ remaining: 42, window: "5h" });
    expect(summaryRows(dPresent)[0].cost.seat_quota).toEqual({ remaining: 42, window: "5h" });

    // Absent (Gemini seat returning no quota -> "unknown")
    const dAbsent = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("sq2", [S1])]);
    await captureLogs(() =>
      runExtract(
        { out: dAbsent, mission: join(dAbsent, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        meshDeps(async () => ({ text: answer }), { now }),
      ),
    );
    expect(idRows(dAbsent)[0].cost.seat_quota).toBe("unknown");
    expect(summaryRows(dAbsent)[0].cost.seat_quota).toBe("unknown");
  });

  it("stays backward compatible with tier-0 and tier-0.2 mission files and preserves reasoning_budget_tokens", async () => {
    // Tier-0 mission (plain strings + tokenCap)
    const d0 = makeDir(
      { fields: ["company", "city"], instruction: "Extract.", tokenCap: 10000 },
      [okRow("t0", [S1])],
    );
    await captureLogs(() =>
      runExtract(
        { out: d0, mission: join(d0, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        meshDeps(async () => ({
          text: JSON.stringify({
            company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." },
            city: { value: "Toronto", quote: "Toronto" },
          }),
        })),
      ),
    );
    expect(idRows(d0)[0].fields).toEqual({
      company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc.", sha256: S1 },
      city: { value: "Toronto", quote: "Toronto", sha256: S1 },
    });
    expect(summaryRows(d0)[0].calls_total).toBe(1);

    // Tier-0.2 mission (max_values scalar + reasoning_budget_tokens + price_table)
    const seenMaxOut: number[] = [];
    const d02 = makeDir(
      {
        fields: ["company", { name: "tags", max_values: 2 }],
        instruction: "Extract.",
        reasoning_budget_tokens: 4096,
        price_table: { source: "op", as_of: "2026-11-22", per_million: { input: 2, output: 10, reasoning: 10 } },
      },
      [okRow("t02", [S1])],
    );
    await captureLogs(() =>
      runExtract(
        { out: d02, mission: join(d02, "mission.json"), model: "mesh:gemini-4-hydrogen-high" },
        undefined,
        meshDeps(async (req) => {
          seenMaxOut.push(req.maxOutputTokens);
          return {
            text: JSON.stringify({
              company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." },
              tags: [{ value: "t1", quote: "t1" }, { value: "t2", quote: "t2" }],
            }),
            usage: { inputTokens: 1000, outputTokens: 200, thoughtsTokenCount: 500, totalTokens: 1700 },
          };
        }),
      ),
    );
    expect(seenMaxOut).toEqual([2000 + 4096]);
    expect(idRows(d02)[0].fields.tags).toEqual({
      values: [
        { value: "t1", quote: "t1", sha256: S1 },
        { value: "t2", quote: "t2", sha256: S1 },
      ],
      unverified_dropped: 0,
    });
    expect(idRows(d02)[0].cost).toEqual({ currency: "USD", api_equivalent: 0.009, seat_quota: "unknown" });
    expect(summaryRows(d02)[0].cost).toEqual({ currency: "USD", api_equivalent: 0.009, seat_quota: "unknown" });
  });

  it("rejects malformed record field definitions before any LLM call and summarizes calls already sent before mid-run seat deferral", async () => {
    const dBad = makeDir(
      { fields: [{ name: "offices", kind: "record", max_values: 3, fields: [] }], instruction: "Extract." },
      [okRow("bad", [S1])],
    );
    let called = 0;
    await expect(
      runExtract(
        { out: dBad, mission: join(dBad, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        meshDeps(async () => { called++; return { text: "{}" }; }),
      ),
    ).rejects.toThrow(/invalid mission/);
    expect(called).toBe(0);
    expect(isExtractUsageError(new Error('scrap extract: invalid mission record field "offices"'))).toBe(true);

    // Mid-run seat acquisition deferral: call for id1 IS counted and summarized; deferred id2 is NOT counted as a sent call.
    const dDef = makeDir(
      { fields: ["company"], instruction: "Extract." },
      [okRow("d1", [S1]), okRow("d2", [S2])],
    );
    const now = () => Date.parse("2026-11-22T15:30:00Z");
    const base = meshDeps(
      async () => ({ text: JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } }) }),
      { now },
    );
    const flaky = {
      now,
      createMeshClient: async (alias: string) => {
        const inner = await base.createMeshClient(alias);
        return {
          ...inner,
          client: {
            generateJson: async (input: any) => {
              if (String(input.prompt).includes("Western Branch")) {
                throw Object.assign(new Error("Token refresh deferred; retry later"), { code: "no_active_account" });
              }
              return inner.client.generateJson(input);
            },
          },
        };
      },
    };
    await captureLogs(async () => {
      await expect(
        runExtract({ out: dDef, mission: join(dDef, "mission.json"), model: "mesh:gemini-4-hydrogen" }, undefined, flaky),
      ).rejects.toThrow(/Token refresh deferred/);
    });
    expect(idRows(dDef)).toHaveLength(1);
    expect(summaryRows(dDef)).toHaveLength(1);
    expect(summaryRows(dDef)[0]).toMatchObject({
      type: "summary",
      ok: 1,
      failed: 0,
      calls_total: 1,
      calls_by_window: [
        {
          window_start: "2026-11-22T15:00:00Z",
          window_end: "2026-11-22T16:00:00Z",
          calls: 1,
          by_model: { "gemini/gemini-4-hydrogen": 1 },
        },
      ],
    });
  });

  it("verifies cross-page sub-fields within one record, drops unquoted/unknown-key records, rejects unknown kind, and counts direct-mode repair calls", async () => {
    // Unknown field kind fails fast before any LLM call.
    const dKind = makeDir(
      { fields: [{ name: "offices", kind: "records", max_values: 3, fields: [{ name: "city" }] }], instruction: "Extract." },
      [okRow("k1", [S1])],
    );
    await expect(
      runExtract({ out: dKind, mission: join(dKind, "mission.json"), model: "mesh:gemini-4-hydrogen" }, undefined, meshDeps(async () => ({ text: "{}" }))),
    ).rejects.toThrow(/invalid mission/);

    // Cross-page sub-fields in one record + unquoted bare string sub-field + unknown-key object.
    const dRec = makeDir({ fields: [OFFICES_FIELD], instruction: "Extract offices." }, [okRow("xp1", [S1, S2])]);
    const deps = meshDeps(async () => ({
      text: JSON.stringify({
        offices: [
          {
            street: { value: "100 King St W", quote: "100 King St W" }, // from S1
            city: { value: "Vancouver", quote: "Vancouver, BC V6E 3P3" }, // from S2
            province: "BC", // bare string without {value, quote} -> unverified_quote
            postal_code: { value: "V6E 3P3", quote: "V6E 3P3" }, // from S2
          },
          { street: "100 King St W", city: "Toronto" }, // all unquoted bare strings -> dropped
          { bogus: { value: "Toronto", quote: "Toronto" } }, // unknown keys only -> dropped
        ],
      }),
    }));
    await captureLogs(() => runExtract({ out: dRec, mission: join(dRec, "mission.json"), model: "mesh:gemini-4-hydrogen" }, undefined, deps));
    const recField = idRows(dRec)[0].fields.offices;
    expect(recField.values).toHaveLength(1);
    expect(recField.values[0]).toEqual({
      street: { value: "100 King St W", quote: "100 King St W", sha256: S1 },
      city: { value: "Vancouver", quote: "Vancouver, BC V6E 3P3", sha256: S2 },
      province: { value: null, quote: null, sha256: null, reason: "unverified_quote" },
      postal_code: { value: "V6E 3P3", quote: "V6E 3P3", sha256: S2 },
    });
    expect(recField.unverified_dropped).toBe(2);
    expect(recField.unverified_subfields).toBe(1);

    // Direct-mode stub where attempt 0 throws "not valid JSON" and attempt 1 succeeds -> 2 calls counted.
    const dDir = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("dir1", [S1])]);
    let n = 0;
    const directStub = {
      generateJson: async (input: any) => {
        n++;
        if (n === 1) throw new Error("Direct LLM response was not valid JSON: truncated");
        await input.validateResponse?.(JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } }));
        return { audit: { provider: "openai", model: "gpt-5-mini", usage: { inputTokens: 10, outputTokens: 5 } } };
      },
    };
    const now = () => Date.parse("2026-11-22T16:45:00Z");
    await captureLogs(() => runExtract({ out: dDir, mission: join(dDir, "mission.json"), model: "openai:gpt-5-mini" }, directStub, { now }));
    expect(summaryRows(dDir)[0]).toMatchObject({
      type: "summary",
      ok: 1,
      failed: 0,
      calls_total: 2,
      calls_by_model: { "openai/gpt-5-mini": 2 },
      calls_by_window: [
        {
          window_start: "2026-11-22T16:00:00Z",
          window_end: "2026-11-22T17:00:00Z",
          calls: 2,
          by_model: { "openai/gpt-5-mini": 2 },
        },
      ],
    });
  });

  it("counts inner mesh failover attempts, excludes mid-run RoutePlanError, and records prior attempts before seat deferral", async () => {
    const now = () => Date.parse("2026-11-22T17:10:00Z");
    const answer = JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } });

    // 1. Candidate 0 fails after attempt.generate with retryable 503; candidate 1 succeeds on openai/gpt-5.5 -> 2 calls counted.
    const dFailover = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("fo1", [S1])]);
    const failoverPlanner = () => ({
      plan: async () => ({
        planRef: "plan-fo",
        expiresAt: "2030-01-01T00:00:00.000Z",
        candidateRefs: ["c0", "c1"],
        policy: {} as any,
        councilRevision: "rev-fo",
        diagnostics: [
          { candidateRef: "c0", diagnosticAccountRef: "a0", requestedModel: "gemini-4-hydrogen", actualProviderId: "gemini", actualModelId: "gemini-4-hydrogen", actualTransportProviderId: "cloud-code", reason: "alias", cacheContinuityRisk: false },
          { candidateRef: "c1", diagnosticAccountRef: "a1", requestedModel: "gemini-4-hydrogen", actualProviderId: "openai", actualModelId: "gpt-5.5", actualTransportProviderId: "openai", reason: "fallback", cacheContinuityRisk: false },
        ],
      }),
      prepareAttempt: async (_s: any, _p: any, candidateRef: string) => ({
        attemptRef: `att-${candidateRef}`,
        generate: async () => {
          if (candidateRef === "c0") throw { statusCode: 503, retryReason: "server_error", message: "upstream 503", providerId: "gemini", retryable: true };
          return {
            id: "resp-c1",
            providerId: "openai",
            modelId: "gpt-5.5",
            message: { role: "assistant", content: answer },
            text: answer,
            toolCalls: [],
            finishReason: "stop",
            usage: { inputTokens: 20, outputTokens: 10 },
          };
        },
        stream: async () => { throw new Error("unused"); },
        recordOutcome: async () => {},
        markCommitted: async () => {},
        complete: async () => ({ quota: { remaining: 9 } }),
        releaseCancelled: async () => {},
      }),
    }) as any;
    const failoverMesh = createGraphifyMesh({
      routingSubject: { principalRef: "p", ownerScopeRef: "owner:test" },
      createRoutePlanner: failoverPlanner,
    });
    const failoverClient = meshTextJsonClient(failoverMesh, { provider: "gemini", model: "gemini-4-hydrogen" });
    await captureLogs(() =>
      runExtract(
        { out: dFailover, mission: join(dFailover, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        { now, createMeshClient: async () => ({ client: failoverClient, provider: "gemini", model: "gemini-4-hydrogen" }) },
      ),
    );
    expect(idRows(dFailover)).toHaveLength(1);
    expect(summaryRows(dFailover)[0]).toMatchObject({
      type: "summary",
      ok: 1,
      failed: 0,
      calls_total: 2,
      calls_by_model: { "gemini/gemini-4-hydrogen": 1, "openai/gpt-5.5": 1 },
      cost: { seat_quota: { remaining: 9 } },
    });

    // 2. Mid-run RoutePlanError (no-route) on id2 after id1 succeeded with quota -> 0 calls counted for id2, id1 quota preserved.
    const dNoRoute = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("nr1", [S1]), okRow("nr2", [S2])]);
    let planCount = 0;
    const noRouteMesh = createGraphifyMesh({
      routingSubject: { principalRef: "p", ownerScopeRef: "owner:test" },
      createRoutePlanner: () => ({
        plan: async () => {
          planCount++;
          if (planCount === 2) throw new RoutePlanError("No eligible route", "no-route");
          return {
            planRef: "plan-nr",
            expiresAt: "2030-01-01T00:00:00.000Z",
            candidateRefs: ["c0"],
            policy: {} as any,
            councilRevision: "rev-nr",
            diagnostics: [{ candidateRef: "c0", diagnosticAccountRef: "a0", requestedModel: "gemini-4-hydrogen", actualProviderId: "gemini", actualModelId: "gemini-4-hydrogen", actualTransportProviderId: "cloud-code", reason: "alias", cacheContinuityRisk: false }],
          };
        },
        prepareAttempt: async () => ({
          attemptRef: "att-nr",
          generate: async () => ({
            id: "resp-nr",
            providerId: "gemini",
            modelId: "gemini-4-hydrogen",
            message: { role: "assistant", content: answer },
            text: answer,
            toolCalls: [],
            finishReason: "stop",
            usage: { inputTokens: 10, outputTokens: 5 },
          }),
          stream: async () => { throw new Error("unused"); },
          recordOutcome: async () => {},
          markCommitted: async () => {},
          complete: async () => ({ quota: { remaining: 33 } }),
          releaseCancelled: async () => {},
        }),
      }) as any,
    });
    const noRouteClient = meshTextJsonClient(noRouteMesh, { provider: "gemini", model: "gemini-4-hydrogen" });
    await captureLogs(() =>
      runExtract(
        { out: dNoRoute, mission: join(dNoRoute, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        { now, createMeshClient: async () => ({ client: noRouteClient, provider: "gemini", model: "gemini-4-hydrogen" }) },
      ),
    );
    expect(idRows(dNoRoute).map((r) => [r.id, r.error ?? "ok"])).toEqual([["nr1", "ok"], ["nr2", "llm_error"]]);
    expect(summaryRows(dNoRoute)[0]).toMatchObject({
      type: "summary",
      ok: 1,
      failed: 1,
      calls_total: 1,
      calls_by_model: { "gemini/gemini-4-hydrogen": 1 },
      cost: { seat_quota: { remaining: 33 } },
    });

    // 3. Direct stub throwing RoutePlanError on the sole id -> 0 calls counted, no summary row appended.
    const dSoleNoRoute = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("nr0", [S1])]);
    await captureLogs(() =>
      runExtract(
        { out: dSoleNoRoute, mission: join(dSoleNoRoute, "mission.json"), model: "openai:gpt-5-mini" },
        { generateJson: async () => { throw new RoutePlanError("No eligible route", "no-route"); } },
        { now },
      ),
    );
    expect(idRows(dSoleNoRoute)[0]).toMatchObject({ id: "nr0", error: "llm_error" });
    expect(summaryRows(dSoleNoRoute)).toHaveLength(0);

    // 4. Candidate 0 sends a call and fails retryably, then candidate 1 fails prepareAttempt with seat deferral -> 1 call summarized before rethrow.
    const dPriorDef = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("pd1", [S1])]);
    const priorDefMesh = createGraphifyMesh({
      routingSubject: { principalRef: "p", ownerScopeRef: "owner:test" },
      createRoutePlanner: () => ({
        plan: async () => ({
          planRef: "plan-pd",
          expiresAt: "2030-01-01T00:00:00.000Z",
          candidateRefs: ["c0", "c1"],
          policy: {} as any,
          councilRevision: "rev-pd",
          diagnostics: [
            { candidateRef: "c0", diagnosticAccountRef: "a0", requestedModel: "gemini-4-hydrogen", actualProviderId: "gemini", actualModelId: "gemini-4-hydrogen", actualTransportProviderId: "cloud-code", reason: "alias", cacheContinuityRisk: false },
            { candidateRef: "c1", diagnosticAccountRef: "a1", requestedModel: "gemini-4-hydrogen", actualProviderId: "openai", actualModelId: "gpt-5.5", actualTransportProviderId: "openai", reason: "fallback", cacheContinuityRisk: false },
          ],
        }),
        prepareAttempt: async (_s: any, _p: any, candidateRef: string) => {
          if (candidateRef === "c1") throw Object.assign(new Error("Token refresh deferred; retry later"), { code: "no_active_account" });
          return {
            attemptRef: "att-pd0",
            generate: async () => { throw { statusCode: 503, retryReason: "server_error", message: "503", providerId: "gemini", retryable: true }; },
            stream: async () => { throw new Error("unused"); },
            recordOutcome: async () => {},
            markCommitted: async () => {},
            complete: async () => {},
            releaseCancelled: async () => {},
          };
        },
      }) as any,
    });
    const priorDefClient = meshTextJsonClient(priorDefMesh, { provider: "gemini", model: "gemini-4-hydrogen" });
    await captureLogs(async () => {
      await expect(
        runExtract(
          { out: dPriorDef, mission: join(dPriorDef, "mission.json"), model: "mesh:gemini-4-hydrogen" },
          undefined,
          { now, createMeshClient: async () => ({ client: priorDefClient, provider: "gemini", model: "gemini-4-hydrogen" }) },
        ),
      ).rejects.toThrow(/Token refresh deferred/);
    });
    expect(summaryRows(dPriorDef)[0]).toMatchObject({
      type: "summary",
      calls_total: 1,
      calls_by_model: { "gemini/gemini-4-hydrogen": 1 },
    });
  });

  it("rejects whitespace-only quotes as unverified across single scalar, multi-value scalar, and record sub-fields", async () => {
    const d = makeDir(
      {
        fields: [
          "company",
          { name: "tags", max_values: 3 },
          OFFICES_FIELD,
        ],
        instruction: "Extract.",
      },
      [okRow("ws1", [S1])],
    );
    const deps = meshDeps(async () => ({
      text: JSON.stringify({
        company: { value: "Acme Canada Inc.", quote: " " },
        tags: [
          { value: "t1", quote: " " },
          { value: "t2", quote: "\t \n" },
          { value: "t3", quote: "t3" },
        ],
        offices: [
          {
            street: { value: "100 King St W", quote: "100 King St W" },
            city: { value: "Toronto", quote: " " },
            province: { value: "ON", quote: "   " },
            postal_code: { value: "M5X 1A9", quote: "M5X 1A9" },
          },
          {
            street: { value: "500 Rue Saint-Jacques", quote: " " },
            city: { value: "Montreal", quote: "\t" },
            province: { value: null, quote: null },
            postal_code: { value: null, quote: null },
          },
        ],
      }),
    }));
    await captureLogs(() => runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen" }, undefined, deps));
    const row = idRows(d)[0];
    expect(row.fields.company).toEqual({ value: null, quote: null, sha256: null, reason: "unverified_quote" });
    expect(row.fields.tags).toEqual({
      values: [{ value: "t3", quote: "t3", sha256: S1 }],
      unverified_dropped: 2,
    });
    expect(row.fields.offices).toEqual({
      values: [
        {
          street: { value: "100 King St W", quote: "100 King St W", sha256: S1 },
          city: { value: null, quote: null, sha256: null, reason: "unverified_quote" },
          province: { value: null, quote: null, sha256: null, reason: "unverified_quote" },
          postal_code: { value: "M5X 1A9", quote: "M5X 1A9", sha256: S1 },
        },
      ],
      unverified_dropped: 1,
      unverified_subfields: 2,
    });
  });

  it("validates outer MissionField objects/names before LLM calls and trims valid field names", async () => {
    const badMissions: Record<string, unknown>[] = [
      { fields: [{ kind: "record", fields: [{ name: "city" }] }], instruction: "Extract." },
      { fields: [{ name: "   ", max_values: 2 }], instruction: "Extract." },
      { fields: [null], instruction: "Extract." },
      { fields: [123], instruction: "Extract." },
      { fields: ["   "], instruction: "Extract." },
      { fields: "not-an-array", instruction: "Extract." },
    ];
    for (const bad of badMissions) {
      const d = makeDir(bad, [okRow("bad-outer", [S1])]);
      let called = 0;
      let err: unknown;
      try {
        await runExtract(
          { out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen" },
          undefined,
          meshDeps(async () => { called++; return { text: "{}" }; }),
        );
      } catch (e) { err = e; }
      expect(called).toBe(0);
      expect(String(err)).toMatch(/invalid mission/);
      expect(isExtractUsageError(err)).toBe(true);
    }

    // Valid field names with outer whitespace are trimmed in prompt and output keys.
    const dTrim = makeDir(
      {
        fields: [
          " company ",
          { name: " offices ", kind: "record", max_values: 2, fields: [{ name: " city " }] },
        ],
        instruction: "Extract.",
      },
      [okRow("tr1", [S1])],
    );
    let capturedPrompt = "";
    const deps = meshDeps(async (req) => {
      capturedPrompt = String(req.messages[1].content);
      return {
        text: JSON.stringify({
          company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." },
          offices: [{ city: { value: "Toronto", quote: "Toronto" } }],
        }),
      };
    });
    await captureLogs(() => runExtract({ out: dTrim, mission: join(dTrim, "mission.json"), model: "mesh:gemini-4-hydrogen" }, undefined, deps));
    expect(capturedPrompt).toContain("Fields: company, offices (array of up to 2 records with sub-fields: city)");
    expect(idRows(dTrim)[0].fields).toEqual({
      company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc.", sha256: S1 },
      offices: { values: [{ city: { value: "Toronto", quote: "Toronto", sha256: S1 } }], unverified_dropped: 0, unverified_subfields: 0 },
    });
  });

  it("clears summary.cost.seat_quota (and per-id seat_quota on repair) when a later call returns no quota", async () => {
    const answer = JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } });
    const now = () => Date.parse("2026-11-22T18:05:00Z");

    // 1. Call 1 returns quota; Call 2 omits quota -> summary.cost.seat_quota must be "unknown" (not stale Call 1 quota).
    const dDrop = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("q1", [S1]), okRow("q2", [S1])]);
    let n1 = 0;
    await captureLogs(() =>
      runExtract(
        { out: dDrop, mission: join(dDrop, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        meshDeps(async () => {
          n1++;
          return n1 === 1 ? { text: answer, quota: { remaining: 42, window: "5h" } } : { text: answer };
        }, { now }),
      ),
    );
    const rowsDrop = idRows(dDrop);
    expect(rowsDrop[0].cost.seat_quota).toEqual({ remaining: 42, window: "5h" });
    expect(rowsDrop[1].cost.seat_quota).toBe("unknown");
    expect(summaryRows(dDrop)[0].cost.seat_quota).toBe("unknown");

    // 2. Repair attempt within one id: attempt 0 has quota + bad JSON, attempt 1 has no quota + valid JSON -> "unknown" on both row and summary.
    const dRepair = makeDir({ fields: ["company"], instruction: "Extract." }, [okRow("qr1", [S1])]);
    let n2 = 0;
    await captureLogs(() =>
      runExtract(
        { out: dRepair, mission: join(dRepair, "mission.json"), model: "mesh:gemini-4-hydrogen" },
        undefined,
        meshDeps(async () => {
          n2++;
          return n2 === 1 ? { text: "{broken", quota: { remaining: 17, window: "5h" } } : { text: answer };
        }, { now }),
      ),
    );
    expect(idRows(dRepair)[0].cost.seat_quota).toBe("unknown");
    expect(summaryRows(dRepair)[0].cost.seat_quota).toBe("unknown");
  });
});
