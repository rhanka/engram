import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const sha256 = (s: string | Buffer): string => createHash("sha256").update(s).digest("hex");

const T1 = "Acme Canada Inc. office in Toronto Ontario Canada with extra padding words to exceed budget.";
const T2 = "Beta Corp branch in Vancouver British Columbia Canada with extra padding words to exceed budget.";
const H1 = `<html><body><p>${T1}</p></body></html>`;
const H2 = `<html><body><p>${T2}</p></body></html>`;
const S1 = sha256(H1);
const S2 = sha256(H2);

const MISSION = { fields: ["company"], instruction: "Extract company.", tokenCap: 120 };
const MISSION_TEXT = JSON.stringify(MISSION);
const MISSION_DIGEST = sha256(MISSION_TEXT);

function makeCapture(
  missionText: string = MISSION_TEXT,
  stateRows: Record<string, unknown>[] = [],
  snaps: Record<string, string> = { [S1]: H1, [S2]: H2 },
): string {
  const d = mkdtempSync(join(tmpdir(), "scrap-imp-"));
  mkdirSync(join(d, "snapshots"), { recursive: true });
  for (const [s, html] of Object.entries(snaps)) writeFileSync(join(d, "snapshots", `${s}.html`), html);
  writeFileSync(join(d, "state.jsonl"), `${stateRows.map((r) => JSON.stringify(r)).join("\n")}\n`);
  writeFileSync(join(d, "mission.json"), missionText);
  return d;
}

const okRow = (id: string, shas: string[]): Record<string, unknown> => ({
  id,
  url: `http://x/${id}`,
  status: "ok",
  pages: shas.map((sha256, i) => ({ url: `http://x/${id}/${i}`, status: 200, bytes: 1, sha256 })),
});

function stubFacade(completeResult?: unknown): any {
  return {
    createRoutePlanner: (runtime: any) => ({
      plan: async (_s: any, input: any) => ({
        planRef: "plan-t02",
        expiresAt: "2030-01-01T00:00:00.000Z",
        candidateRefs: ["c1"],
        policy: {},
        councilRevision: "council-t02",
        diagnostics: [{
          candidateRef: "c1", diagnosticAccountRef: "acct_t02", requestedModel: input.requestedModel,
          actualProviderId: "gemini", actualModelId: "gemini-4-hydrogen", actualTransportProviderId: "cloud-code",
          reason: "alias", cacheContinuityRisk: false,
        }],
      }),
      prepareAttempt: async () => ({
        attemptRef: "attempt-t02",
        generate: (req: any) => runtime.generate({
          ...req,
          auth: { material: { type: "direct-token", token: "stub-seat" }, descriptor: { sourceType: "direct-token" } },
        }),
        stream: () => { throw new Error("stream not used"); },
        recordOutcome: async () => {}, markCommitted: async () => {}, complete: async () => completeResult,
        releaseCancelled: async () => {},
      }),
    }),
  };
}

function meshDeps(handler: (request: any) => Promise<{ text: string }>, seen: any[]) {
  return {
    createMeshClient: async (alias: string) => createScrapMeshClient(alias, {
      facade: stubFacade(),
      adapterClients: {
        gemini: {
          generate: async (request: any) => {
            seen.push(request);
            const out = await handler(request);
            return {
              id: "stub-resp", providerId: "gemini", modelId: "gemini-4-hydrogen",
              message: { role: "assistant", content: [{ type: "text", text: out.text }] }, text: out.text,
              toolCalls: [], usage: { inputTokens: 100, outputTokens: 20, thoughtsTokenCount: 50, totalTokens: 170 },
              finishReason: "stop",
            };
          },
          stream: async () => { throw new Error("stream not used"); },
        },
      } as any,
      ownerScopes: ["owner:test"],
    }),
  };
}

async function runCli(args: string[]): Promise<{ code: number; err: string; out: string }> {
  const { main } = await import("../src/cli.js");
  const pa = process.argv, pe = process.exit, ce = console.error, cl = console.log;
  const origWrite = process.stdout.write.bind(process.stdout);
  let code = 0;
  const errs: string[] = [], chunks: Buffer[] = [];
  console.log = (() => {}) as any;
  console.error = ((...a: unknown[]) => { errs.push(a.map(String).join(" ")); }) as any;
  (process as any).exit = ((c?: any) => { code = c ?? 0; throw new Error(`__exit__${code}`); }) as any;
  (process.stdout.write as any) = ((c: any, e?: any, cb?: any) => {
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c), (e as any) ?? "utf-8"));
    if (typeof cb === "function") cb();
    return true;
  }) as any;
  process.argv = ["node", "engram", ...args];
  try { await main(); } catch (e) { if (!String(e).includes("__exit__")) throw e; }
  finally {
    process.argv = pa; process.exit = pe; console.error = ce; console.log = cl;
    process.stdout.write = origWrite as any;
  }
  return { code, err: errs.join("\n"), out: Buffer.concat(chunks).toString("utf-8") };
}

const FIXED = JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Acme Canada Inc." } });

async function promptJson(capture: string, id: string, extra: string[] = []): Promise<any> {
  const r = await runCli(["scrap", "prompt", "--capture", capture, "--mission", join(capture, "mission.json"),
    "--id", id, "--json", ...extra]);
  expect(r.code).toBe(0);
  const j = JSON.parse(r.out.trim());
  return { ...j, promptSha: j.prompt_sha256, snaps: j.snapshot_sha256 };
}

function answerLine(o: Record<string, unknown>): string { return JSON.stringify(o); }

type Hashes = { promptSha: string; snaps: string[] };
function validLine(h: Hashes, raw: string, attempt: 1 | 2 = 1): Record<string, unknown> {
  return {
    id: "p1", attempt, snapshot_sha256: h.snaps, prompt_sha256: h.promptSha,
    model_declared: "carbon", effort_declared: "high", transport: "browser",
    ui: { surface: "gemini.google.com", temporary_chat: true },
    started_at: "2026-11-22T10:00:00Z", finished_at: "2026-11-22T10:01:00Z", raw_response: raw,
  };
}

const LABEL = "gemini-web:carbon-high";

type CliResult = { code: number; err: string; out: string };
async function importCli(out: string, capture: string, from: string, extra: string[] = []): Promise<CliResult> {
  return runCli(["scrap", "import", "--out", out, "--capture", capture, "--mission",
    join(capture, "mission.json"), "--from", from, "--model", LABEL, ...extra]);
}

function writeAnswers(path: string, lines: string[]): void { writeFileSync(path, `${lines.join("\n")}\n`); }

function readResults(out: string): string[] {
  const p = join(out, "results.ndjson");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf-8").split("\n").filter((l) => l.trim());
}

function readResultsRaw(out: string): string | null {
  const p = join(out, "results.ndjson");
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf-8");
}

describe("scrap prompt", () => {
  it("prints the exact seat request message on an over-budget two-page fixture with a superseded row (kills mutants: envelope-divergence, stale-row-selection, budget-cut-mismatch, trailing-newline-added)", async () => {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1]), okRow("p1", [S1, S2])]);
    const seen: any[] = [];
    const quiet = console.log;
    console.log = (() => {}) as any;
    try {
      await runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" },
        undefined, meshDeps(async () => ({ text: FIXED }), seen));
    } finally { console.log = quiet; }
    expect(seen).toHaveLength(1);
    const expected = `${String(seen[0].messages[0].content)}\n\n${String(seen[0].messages[1].content)}`;
    const r = await runCli(["scrap", "prompt", "--capture", d, "--mission", join(d, "mission.json"), "--id", "p1"]);
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    expect(r.out).toBe(expected);
    expect(r.out).toContain("Beta Corp");
    expect(r.out.endsWith("\n")).toBe(false);
  });

  it("--json carries the same message and its hashes (kills mutants: hash-of-wrong-bytes, conductor-derives-hashes, sha-of-state-instead-of-message)", async () => {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1, S2])]);
    const seen: any[] = [];
    const quiet = console.log;
    console.log = (() => {}) as any;
    try {
      await runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" },
        undefined, meshDeps(async () => ({ text: FIXED }), seen));
    } finally { console.log = quiet; }
    const expected = `${String(seen[0].messages[0].content)}\n\n${String(seen[0].messages[1].content)}`;
    const j = await promptJson(d, "p1");
    expect(j).toMatchObject({ id: "p1", attempt: 1, message: expected, mission_digest: MISSION_DIGEST });
    expect(j.snapshot_sha256).toEqual([S1, S2]);
    expect(j.prompt_sha256).toBe(sha256(Buffer.from(expected, "utf-8")));
    const bytes = Buffer.from(expected, "utf-8");
    expect(j.prompt_sha256).toBe(sha256(bytes));
  });

  it("exits 2 with empty stdout for unknown id, non-ok id, missing snapshot and invalid mission (kills mutants: missing-id-prints-empty, non-ok-id-prints-prompt, missing-snapshot-prints-partial, invalid-mission-exit-0)", async () => {
    const badRow = { id: "bad", url: "http://x/bad", status: "dns", pages: [] as unknown[] };
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1]), badRow as Record<string, unknown>]);
    for (const id of ["nope", "bad"]) {
      const r = await runCli(["scrap", "prompt", "--capture", d, "--mission", join(d, "mission.json"), "--id", id]);
      expect(r.code).toBe(2);
      expect(r.out).toBe("");
      expect(r.err.trim().length).toBeGreaterThan(0);
    }
    const dMiss = makeCapture(MISSION_TEXT, [okRow("p1", ["c".repeat(64)])], {});
    const missArgs = ["scrap", "prompt", "--capture", dMiss, "--mission", join(dMiss, "mission.json"), "--id", "p1"];
    const rMiss = await runCli(missArgs);
    expect(rMiss.code).toBe(2);
    expect(rMiss.out).toBe("");
    const dBad = makeCapture("{oops", [okRow("p1", [S1])]);
    const badArgs = ["scrap", "prompt", "--capture", dBad, "--mission", join(dBad, "mission.json"), "--id", "p1"];
    const rBad = await runCli(badArgs);
    expect(rBad.code).toBe(2);
    expect(rBad.out).toBe("");
  });

  it("warns on stderr and hashes the replaced bytes when the budget cut splits a surrogate pair (kills mutants: hash-before-replacement, silent-lone-surrogate)", async () => {
    const emoji = "AB\u{1F600}CDEF";
    const h = sha256(`<html><p>${emoji}</p></html>`);
    const d = makeCapture(JSON.stringify({ fields: ["company"], instruction: "Ex.", tokenCap: 3 }),
      [okRow("p1", [h])], { [h]: `<html><p>${emoji}</p></html>` });
    const r = await runCli(["scrap", "prompt", "--capture", d, "--mission", join(d, "mission.json"), "--id", "p1"]);
    expect(r.code).toBe(0);
    expect(r.err).toMatch(/surrogate/i);
    const j = await promptJson(d, "p1");
    expect(j.prompt_sha256).toBe(sha256(Buffer.from(j.message, "utf-8")));
    expect(sha256(Buffer.from(r.out, "utf-8"))).toBe(j.prompt_sha256);
  });

  it("does not warn for a valid surrogate pair (kills mutant: valid-pair-false-positive)", async () => {
    const emoji = "AB\u{1F600}CDEF";
    const h = sha256(`<html><p>${emoji}</p></html>`);
    const d = makeCapture(JSON.stringify({ fields: ["company"], instruction: "Ex.", tokenCap: 24000 }),
      [okRow("p1", [h])], { [h]: `<html><p>${emoji}</p></html>` });
    const r = await runCli(["scrap", "prompt", "--capture", d, "--mission", join(d, "mission.json"), "--id", "p1"]);
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    expect(r.out).toContain("\u{1F600}");
  });

  it("prompt --repair refuses a --from line with an unknown key and empty stdout (kills mutant: MF5)", async () => {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const j = await promptJson(d, "p1");
    const from = join(d, "unknown-key.jsonl");
    writeAnswers(from, [answerLine({ ...validLine(j, '{"broken":'), zzz: 1 })]);
    const r = await runCli(["scrap", "prompt", "--capture", d, "--mission", join(d, "mission.json"),
      "--id", "p1", "--repair", "--from", from]);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err).toMatch(/unknown key "zzz"/);
  });

  it("prompt --repair prints the second seat request message (kills mutants: repair-envelope-divergence, repair-history-leak, repair-first-prompt-reuse)", async () => {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const truncated = '{"company": {"value": "Acme Canada';
    const seen: any[] = [];
    let n = 0;
    const quiet = console.log;
    console.log = (() => {}) as any;
    try {
      await runExtract({ out: d, mission: join(d, "mission.json"), model: "mesh:gemini-4-hydrogen-high" },
        undefined, meshDeps(async () => ({ text: n++ === 0 ? truncated : FIXED }), seen));
    } finally { console.log = quiet; }
    expect(seen).toHaveLength(2);
    const expected = `${String(seen[1].messages[0].content)}\n\n${String(seen[1].messages[1].content)}`;
    expect(String(seen[1].messages[1].content)).toContain(truncated);
    const j = await promptJson(d, "p1");
    const from = join(d, "answers.jsonl");
    writeAnswers(from, [answerLine({ ...validLine(j, truncated), raw_response: truncated })]);
    const r = await runCli(["scrap", "prompt", "--capture", d, "--mission", join(d, "mission.json"),
      "--id", "p1", "--repair", "--from", from]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(expected);
  });

  it("prompt --repair exits 2 when the first answer parses, is blank, or is absent (kills mutants: repair-on-valid, repair-on-empty, repair-without-source)", async () => {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const j = await promptJson(d, "p1");
    const fromOk = join(d, "a-ok.jsonl");
    writeAnswers(fromOk, [answerLine(validLine(j, FIXED))]);
    const rOk = await runCli(["scrap", "prompt", "--capture", d, "--mission", join(d, "mission.json"),
      "--id", "p1", "--repair", "--from", fromOk]);
    expect(rOk.code).toBe(2);
    expect(rOk.out).toBe("");
    const fromBlank = join(d, "a-blank.jsonl");
    writeAnswers(fromBlank, [answerLine(validLine(j, "   \n  "))]);
    const rBlank = await runCli(["scrap", "prompt", "--capture", d, "--mission", join(d, "mission.json"),
      "--id", "p1", "--repair", "--from", fromBlank]);
    expect(rBlank.code).toBe(2);
    expect(rBlank.out).toBe("");
    const fromOther = join(d, "a-other.jsonl");
    writeAnswers(fromOther, [answerLine({ ...validLine(j, '{"a":'), id: "someone-else" })]);
    const rAbsent = await runCli(["scrap", "prompt", "--capture", d, "--mission", join(d, "mission.json"),
      "--id", "p1", "--repair", "--from", fromOther]);
    expect(rAbsent.code).toBe(2);
    expect(rAbsent.out).toBe("");
  });
});

describe("scrap import refusals", () => {
  async function setup(): Promise<{ d: string; j: any; out: string }> {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1]), okRow("p2", [S1])]);
    const j = await promptJson(d, "p1");
    const out = mkdtempSync(join(tmpdir(), "scrap-out-"));
    return { d, j, out };
  }

  it("refuses unknown key, missing key, wrong type, non-browser transport and temporary_chat:false, leaving results byte-identical (kills mutants: extra-key-accepted, missing-key-defaulted, type-coerced, seat-transport-accepted, history-chat-accepted)", async () => {
    const { d, j, out } = await setup();
    const base = validLine(j, FIXED);
    const bads: Record<string, unknown>[] = [
      { ...base,zzz: 1 },
      (({ prompt_sha256, ...rest }) => rest)(base as any),
      { ...base, attempt: "1" },
      { ...base, transport: "seat" },
      { ...base, ui: { surface: "gemini.google.com", temporary_chat: false } },
    ];
    for (const [i, bad] of bads.entries()) {
      const from = join(d, `bad-${i}.jsonl`);
      writeAnswers(from, [answerLine(bad as Record<string, unknown>)]);
      const before = readResultsRaw(out);
      const r = await importCli(out, d, from);
      expect(r.code).toBe(2);
      expect(r.err.trim().length).toBeGreaterThan(0);
      expect(readResultsRaw(out)).toBe(before);
    }
  });

  it("refuses unknown id, non-ok id, invalid label and label-declaration mismatch (kills mutants: unknown-id-imported, failed-state-imported, mesh-label-routed, declaration-mismatch-ignored)", async () => {
    const { d, j, out } = await setup();
    const fromUnknown = join(d, "u1.jsonl");
    writeAnswers(fromUnknown, [answerLine({ ...validLine(j, FIXED), id: "ghost" })]);
    expect((await importCli(out, d, fromUnknown)).code).toBe(2);
    const d2 = makeCapture(MISSION_TEXT, [{ id: "p9", url: "http://x/p9", status: "dns", pages: [] }]);
    const j2 = { promptSha: "a".repeat(64), snaps: [] as string[] };
    void j2;
    const fromNotOk = join(d2, "u2.jsonl");
    writeAnswers(fromNotOk, [answerLine({
      ...validLine({ promptSha: "a".repeat(64), snaps: [] }, FIXED), id: "p9",
    })]);
    expect((await importCli(out, d2, fromNotOk)).code).toBe(2);
    expect(readResultsRaw(out)).toBe(null);
    const fromLabel = join(d, "u3.jsonl");
    writeAnswers(fromLabel, [answerLine(validLine(j, FIXED))]);
    const rLabel = await runCli(["scrap", "import", "--out", out, "--capture", d, "--mission",
      join(d, "mission.json"), "--from", fromLabel, "--model", "mesh:gemini-4-hydrogen-high"]);
    expect(rLabel.code).toBe(2);
    const rMismatch = await runCli(["scrap", "import", "--out", out, "--capture", d, "--mission",
      join(d, "mission.json"), "--from", fromLabel, "--model", "gemini-web:carbon-low"]);
    expect(rMismatch.code).toBe(2);
    expect(readResultsRaw(out)).toBe(null);
  });

  it("refuses a run dir with state.jsonl or with an unmarked line (kills mutants: capture-dir-as-run-dir, seat-rows-mixed-in)", async () => {
    const { d, j, out } = await setup();
    const from = join(d, "ok.jsonl");
    writeAnswers(from, [answerLine(validLine(j, FIXED))]);
    writeFileSync(join(out, "state.jsonl"), "{}\n");
    const beforeStateRefusal = readResultsRaw(out);
    expect((await importCli(out, d, from)).code).toBe(2);
    expect(readResultsRaw(out)).toBe(beforeStateRefusal);
    const out2 = mkdtempSync(join(tmpdir(), "scrap-out-"));
    writeFileSync(join(out2, "results.ndjson"),
      `${JSON.stringify({ id: "p1", url: "http://x/p1", fields: {}, whatever: 1 })}\n`);
    const r2 = await importCli(out2, d, from);
    expect(r2.code).toBe(2);
    expect(readFileSync(join(out2, "results.ndjson"), "utf-8")).toContain("whatever");
  });

  it("refuses a second answer for an answered id, a failed id without --retry-failed, an attempt:2 with nothing to repair and a third attempt (kills mutants: double-answer-appended, silent-retry, orphan-repair-appended, third-attempt-appended, third-repair-after-repair-M2)", async () => {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const j = await promptJson(d, "p1");
    const out = mkdtempSync(join(tmpdir(), "scrap-out-"));
    const first = join(d, "first.jsonl");
    writeAnswers(first, [answerLine(validLine(j, FIXED))]);
    expect((await importCli(out, d, first)).code).toBe(0);
    const before = readResultsRaw(out);
    expect(readResults(out)).toHaveLength(2);
    const second = join(d, "second.jsonl");
    const FIXED2 = JSON.stringify({ company: { value: "Acme Canada Inc.", quote: "Toronto" } });
    writeAnswers(second, [answerLine(validLine(j, FIXED2))]);
    const rSecond = await importCli(out, d, second);
    expect(rSecond.code).toBe(2);
    expect(readResultsRaw(out)).toBe(before);
    const orphan = join(d, "orphan.jsonl");
    writeAnswers(orphan, [answerLine(validLine(j, FIXED, 2))]);
    expect((await importCli(out, d, orphan)).code).toBe(2);
    expect(readResultsRaw(out)).toBe(before);
    const third = join(d, "third.jsonl");
    writeAnswers(third, [answerLine({ ...validLine(j, FIXED), attempt: 3 })]);
    expect((await importCli(out, d, third)).code).toBe(2);
    expect(readResultsRaw(out)).toBe(before);
    const d3 = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const j3 = await promptJson(d3, "p1");
    const probe = join(d3, "probe.jsonl");
    writeAnswers(probe, [answerLine(validLine(j3, '{"broken":'))]);
    const j3r = await promptJson(d3, "p1", ["--repair", "--from", probe]);
    const out3 = mkdtempSync(join(tmpdir(), "scrap-out-"));
    const three = join(d3, "three.jsonl");
    writeAnswers(three, [answerLine(validLine(j3, '{"broken":')), answerLine(validLine(j3r, "[[[", 2)), answerLine(validLine(j3r, FIXED, 2))]);
    expect((await importCli(out3, d3, three)).code).toBe(2);
    expect(readResultsRaw(out3)).toBe(null);

    const dF = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const jF = await promptJson(dF, "p1");
    const outF = mkdtempSync(join(tmpdir(), "scrap-out-"));
    const failFirst = join(dF, "fail.jsonl");
    writeAnswers(failFirst, [answerLine(validLine(jF, "not json at all"))]);
    expect((await importCli(outF, dF, failFirst)).code).toBe(0);
    const failRows = readResults(outF).map((l) => JSON.parse(l));
    expect(failRows[0]).toMatchObject({ id: "p1", error: "parse_error" });
    const retry = join(dF, "retry.jsonl");
    writeAnswers(retry, [answerLine(validLine(jF, FIXED))]);
    const beforeRetryRefusal = readResultsRaw(outF);
    const rRetryRefused = await importCli(outF, dF, retry);
    expect(rRetryRefused.code).toBe(2);
    expect(readResultsRaw(outF)).toBe(beforeRetryRefusal);
    const retryOk = await importCli(outF, dF, retry, ["--retry-failed"]);
    expect(retryOk.code).toBe(0);
    expect(readResults(outF).map((l) => JSON.parse(l)).filter((r) => r.type !== "summary")).toHaveLength(2);
  });

  it("refuses a duplicated line in the same file with no file written (kills mutant: MF7)", async () => {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const j = await promptJson(d, "p1");
    const out = mkdtempSync(join(tmpdir(), "scrap-out-"));
    const from = join(d, "dup.jsonl");
    writeAnswers(from, [answerLine(validLine(j, FIXED)), answerLine(validLine(j, FIXED))]);
    const r = await importCli(out, d, from);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/already answered/);
    expect(readResultsRaw(out)).toBe(null);
  });
});

describe("scrap import rows", () => {
  async function setup(): Promise<{ d: string; j: any }> {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1, S2])]);
    return { d, j: await promptJson(d, "p1") };
  }

  it("records snapshot_mismatch for foreign hash and wrong order, and prompt_mismatch (kills mutants: hash-order-insensitive, foreign-snapshot-accepted, prompt-hash-unchecked)", async () => {
    const { d, j } = await setup();
    for (const [name, line] of [
      ["foreign", { ...validLine(j, FIXED), snapshot_sha256: ["f".repeat(64)] }],
      ["order", { ...validLine(j, FIXED), snapshot_sha256: [S2, S1] }],
      ["prompt", { ...validLine(j, FIXED), prompt_sha256: `${j.promptSha.slice(0, 63)}0` }],
    ] as [string, Record<string, unknown>][]) {
      const out = mkdtempSync(join(tmpdir(), "scrap-out-"));
      const from = join(d, `${name}.jsonl`);
      writeAnswers(from, [answerLine(line)]);
      const r = await importCli(out, d, from);
      expect(r.code).toBe(0);
      const rows = readResults(out).map((l) => JSON.parse(l));
      expect(rows[0]).toMatchObject({ id: "p1", fields: null });
      expect(rows[0].error).toBe(name === "prompt" ? "prompt_mismatch" : "snapshot_mismatch");
      expect(String(rows[0].error_detail).length).toBeGreaterThan(0);
    }
  });

  it("repairs across a foreign snapshot hash: attempt:2 still finds its attempt:1 (kills mutant: MF4)", async () => {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const j = await promptJson(d, "p1");
    const probe = join(d, "probe.jsonl");
    writeAnswers(probe, [answerLine(validLine(j, '{"broken":'))]);
    const j2 = await promptJson(d, "p1", ["--repair", "--from", probe]);
    const out = mkdtempSync(join(tmpdir(), "scrap-out-"));
    const from = join(d, "foreign-repair.jsonl");
    writeAnswers(from, [
      answerLine(validLine(j, '{"broken":')),
      answerLine({ ...validLine(j2, FIXED, 2), snapshot_sha256: ["f".repeat(64)] }),
    ]);
    const r = await importCli(out, d, from);
    expect(r.code).toBe(0);
    const rows = readResults(out).map((l) => JSON.parse(l)).filter((x) => x.type !== "summary");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "p1", attempt: 1, error: "parse_error" });
    expect(rows[1]).toMatchObject({ id: "p1", attempt: 2, error: "snapshot_mismatch" });
    const summary = readResults(out).map((l) => JSON.parse(l)).find((x) => x.type === "summary");
    expect(summary).toMatchObject({ ok: 0, failed: 2, attempts_total: 2 });
  });

  it("records the declared prompt_sha256 on a prompt_mismatch row (kills mutant: MF6)", async () => {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const j = await promptJson(d, "p1");
    const declared = "0".repeat(64);
    expect(declared).not.toBe(j.promptSha);
    const out = mkdtempSync(join(tmpdir(), "scrap-out-"));
    const from = join(d, "declared.jsonl");
    writeAnswers(from, [answerLine({ ...validLine(j, FIXED), prompt_sha256: declared })]);
    const r = await importCli(out, d, from);
    expect(r.code).toBe(0);
    const row = JSON.parse(readResults(out)[0]);
    expect(row.error).toBe("prompt_mismatch");
    expect(row.prompt_sha256).toBe(declared);
  });

  it("records empty_response, parse_error for fenced prose and non-objects, and nulls unverified quotes (kills mutants: empty-treated-as-parse-error, prose-around-fence-accepted, non-object-accepted, unverified-quote-kept)", async () => {
    const { d, j } = await setup();
    const cases: [string, string, string][] = [
      ["empty", "   \n  ", "empty_response"],
      ["fence", "see below:\n```json\n{\"company\": 1}\n```\ndone", "parse_error"],
      ["nonobj", "[1, 2]", "parse_error"],
      ["quote", JSON.stringify({ company: { value: "Nope", quote: "not in any snapshot" } }), "ok"],
    ];
    for (const [name, raw, want] of cases) {
      const out = mkdtempSync(join(tmpdir(), "scrap-out-"));
      const from = join(d, `${name}.jsonl`);
      writeAnswers(from, [answerLine(validLine(j, raw))]);
      expect((await importCli(out, d, from)).code).toBe(0);
      const row = JSON.parse(readResults(out)[0]!);
      if (want === "ok") {
        expect(row.fields.company).toEqual({ value: null, quote: null, sha256: null, reason: "unverified_quote" });
      } else {
        expect(row.error).toBe(want);
        expect(row.fields).toBeNull();
      }
    }
  });

  it("writes fields identical to extract for the same answer, marks every line with transport and writes no seat keys (kills mutants: import-normalises-fields, summary-without-marker, seat-keys-copied)", async () => {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const stub = { generateJson: async (input: any) => { input.validateResponse?.(FIXED); return { text: FIXED }; } };
    const quiet = console.log;
    console.log = (() => {}) as any;
    try { await runExtract({ out: d, mission: join(d, "mission.json"), model: "openai:gpt-x" }, stub as any); }
    finally { console.log = quiet; }
    const extractRow = readFileSync(join(d, "results.ndjson"), "utf-8").split("\n")
      .filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.type !== "summary");
    const j = await promptJson(d, "p1");
    const out = mkdtempSync(join(tmpdir(), "scrap-out-"));
    const from = join(d, "ok.jsonl");
    writeAnswers(from, [answerLine(validLine(j, FIXED))]);
    expect((await importCli(out, d, from)).code).toBe(0);
    const lines = readResults(out);
    expect(lines).toHaveLength(2);
    const row = JSON.parse(lines[0]!);
    const summary = JSON.parse(lines[1]!);
    expect(row.fields).toEqual(extractRow.fields);
    expect(row).toMatchObject({ id: "p1", url: "http://x/p1", transport: "browser", transport_label: LABEL });
    expect(row.attempt).toBe(1);
    expect(row.raw_response_sha256).toBe(sha256(FIXED));
    for (const parsed of [row, summary]) {
      expect(parsed.transport).toBe("browser");
      for (const k of ["tokens", "cost", "mesh", "routed", "routed_mismatch", "resolved", "calls_total",
        "calls_by_window", "calls_by_model", "quote_status"]) {
        expect(parsed[k], k).toBeUndefined();
      }
    }
    expect(summary).toMatchObject({ type: "summary", transport_label: LABEL, mission_digest: MISSION_DIGEST,
      ok: 1, failed: 0, attempts_total: 1, source_sha256: sha256(readFileSync(from)) });
  });

  it("appends a valid attempt:2 after a failed attempt:1 and converge reads the second row (kills mutants: repair-row-dropped, converge-reads-first, attempts-total-sums-attempts-M3)", async () => {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const j = await promptJson(d, "p1");
    const out = mkdtempSync(join(tmpdir(), "scrap-out-"));
    const from = join(d, "two.jsonl");
    writeAnswers(from, [answerLine(validLine(j, '{"broken":'))]);
    const j2 = await promptJson(d, "p1", ["--repair", "--from", from]);
    expect(j2.attempt).toBe(2);
    writeAnswers(from, [answerLine(validLine(j, '{"broken":')), answerLine(validLine(j2, FIXED, 2))]);
    expect((await importCli(out, d, from)).code).toBe(0);
    const rows = readResults(out).map((l) => JSON.parse(l)).filter((r) => r.type !== "summary");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ error: "parse_error", attempt: 1 });
    expect(rows[1]).toMatchObject({ attempt: 2 });
    expect(rows[1].fields.company).toEqual({ value: "Acme Canada Inc.", quote: "Acme Canada Inc.", sha256: S1 });
    const summary = readResults(out).map((l) => JSON.parse(l)).find((r) => r.type === "summary");
    expect(summary).toMatchObject({ ok: 1, failed: 1, attempts_total: 2 });
    const dB = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const jB = await promptJson(dB, "p1");
    const runA = mkdtempSync(join(tmpdir(), "scrap-run-"));
    const fromB = join(dB, "b.jsonl");
    writeAnswers(fromB, [answerLine(validLine(jB, FIXED))]);
    expect((await importCli(runA, dB, fromB)).code).toBe(0);
    const { runConverge } = await import("../src/scrap/converge.js");
    const convOut = mkdtempSync(join(tmpdir(), "scrap-conv-"));
    const conv = await runConverge({ runs: [runA, out], mission: join(d, "mission.json"),
      out: convOut, allowTransports: ["browser"] });
    expect(conv.rows[0]!.fields.company).toMatchObject({ verdict: "unanimous", value: "Acme Canada Inc." });
  });

  it("re-import leaves the file byte-identical and --retry-failed appends after a failed row (kills mutants: reimport-duplicates-rows, reimport-duplicates-summary, retry-flag-ignored)", async () => {
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const j = await promptJson(d, "p1");
    const out = mkdtempSync(join(tmpdir(), "scrap-out-"));
    const from = join(d, "two.jsonl");
    writeAnswers(from, [answerLine(validLine(j, '{"broken":'))]);
    const j2 = await promptJson(d, "p1", ["--repair", "--from", from]);
    writeAnswers(from, [answerLine(validLine(j, '{"broken":')), answerLine(validLine(j2, FIXED, 2))]);
    expect((await importCli(out, d, from)).code).toBe(0);
    const snap = readFileSync(join(out, "results.ndjson"), "utf-8");
    expect((await importCli(out, d, from)).code).toBe(0);
    expect(readFileSync(join(out, "results.ndjson"), "utf-8")).toBe(snap);
    const dF = makeCapture(MISSION_TEXT, [okRow("p1", [S1])]);
    const jF = await promptJson(dF, "p1");
    const outF = mkdtempSync(join(tmpdir(), "scrap-out-"));
    const f1 = join(dF, "f1.jsonl");
    writeAnswers(f1, [answerLine(validLine(jF, "[[["))]);
    expect((await importCli(outF, dF, f1)).code).toBe(0);
    const snapF = readFileSync(join(outF, "results.ndjson"), "utf-8");
    const f2 = join(dF, "f2.jsonl");
    writeAnswers(f2, [answerLine(validLine(jF, FIXED))]);
    expect((await importCli(outF, dF, f2, ["--retry-failed"])).code).toBe(0);
    const outFText = readFileSync(join(outF, "results.ndjson"), "utf-8");
    const rows = outFText.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const dataRows = rows.filter((r) => r.type !== "summary");
    expect(dataRows).toHaveLength(2);
    expect(dataRows[1]).toMatchObject({ attempt: 1 });
    expect(dataRows[1].fields.company.value).toBe("Acme Canada Inc.");
    expect(readFileSync(join(outF, "results.ndjson"), "utf-8").length).toBeGreaterThan(snapF.length);
    const { runConverge } = await import("../src/scrap/converge.js");
    const runB = mkdtempSync(join(tmpdir(), "scrap-run-"));
    writeFileSync(join(runB, "results.ndjson"), readFileSync(join(outF, "results.ndjson"), "utf-8"));
    const convOut = mkdtempSync(join(tmpdir(), "scrap-conv-"));
    const conv = await runConverge({ runs: [outF, runB], mission: join(dF, "mission.json"), out: convOut,
      allowTransports: ["browser"] });
    expect(conv.summary.run_transports).toEqual({ [Object.keys(conv.summary.run_transports)[0]!]: "browser",
      [Object.keys(conv.summary.run_transports)[1]!]: "browser" });
    expect(conv.rows[0]!.fields.company).toMatchObject({ verdict: "unanimous", value: "Acme Canada Inc." });
  });

  it("verifies entity-decoded quotes on import (kills mutant: import-entity-unverified)", async () => {
    const html = "<html><body><p>Visit us at 1705 Tech Avenue #1 &amp; 3 Toronto for details.</p></body></html>";
    const h = sha256(html);
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [h])], { [h]: html });
    const j = await promptJson(d, "p1");
    const out = mkdtempSync(join(tmpdir(), "scrap-out-"));
    const q = "1705 Tech Avenue #1 & 3 Toronto";
    const raw = JSON.stringify({ company: { value: "Acme Canada Inc.", quote: q } });
    const from = join(d, "ent.jsonl");
    writeAnswers(from, [answerLine(validLine(j, raw))]);
    expect((await importCli(out, d, from)).code).toBe(0);
    const crow = JSON.parse(readResults(out)[0]!);
    expect(crow.fields.company).toMatchObject({ value: "Acme Canada Inc.", quote: q, sha256: h });
  });

  it("scrap prompt keeps entities undecoded with a pinned hash (kills mutant: textOf-decodes-entities)", async () => {
    const html = "<html><body><p>Visit us at 1705 Tech Avenue #1 &amp; 3 Toronto for details.</p></body></html>";
    const h = sha256(html);
    const d = makeCapture(MISSION_TEXT, [okRow("p1", [h])], { [h]: html });
    const r = await runCli(["scrap", "prompt", "--capture", d, "--mission", join(d, "mission.json"), "--id", "p1"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("#1 &amp; 3 Toronto");
    const j = await promptJson(d, "p1");
    expect(j.message).toBe(r.out);
    expect(j.message).toContain("#1 &amp; 3");
    expect(j.prompt_sha256).toBe("b2bd9c04bc9385600ae362540958f095f1272755204508185814ef2024e1e639");
  });
});
