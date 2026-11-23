import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runExtract } from "../src/scrap/extract.js";
import { decodeHtmlEntitiesOnce } from "../src/scrap/quote-match.js";
const HTML = "<html><body><p>Visit us at 12 rue des Fleurs, Paris 75002. Phone 01 23 45 67 89.</p></body></html>";
function fakeOut(canned: unknown): any {
  const d = mkdtempSync(join(tmpdir(), "scx-")), sha = createHash("sha256").update(HTML).digest("hex");
  mkdirSync(join(d, "snapshots"), { recursive: true }); writeFileSync(join(d, "snapshots", `${sha}.html`), HTML);
  writeFileSync(join(d, "state.jsonl"), `${JSON.stringify({ id: "a", url: "http://x/", status: "ok", pages: [{ url: "http://x/", final_url: "http://x/", status: 200, bytes: HTML.length, sha256: sha }] })}\n${JSON.stringify({ id: "b", url: "http://y/", status: "dns", pages: [] })}\n`);
  writeFileSync(join(d, "mission.json"), JSON.stringify({ fields: ["street", "city"], instruction: "Extract the address." }));
  // Mimics the real direct client: the JSON answer travels back through
  // validateResponse in memory; no file is ever written.
  const client = { mode: "direct", provider: "test", generateJson: async (input: any) => { await input.validateResponse?.(JSON.stringify(canned)); return { status: "completed", provider: "test", mode: "direct", audit: { usage: { input: 10, output: 5 } } }; } };
  return { d, client };
}
function twoOut(): any {
  const d = mkdtempSync(join(tmpdir(), "scx2-"));
  const h1 = "<html><body><p>alpha street number one brighton</p></body></html>";
  const h2 = "<html><body><p>beta street number two leeds</p></body></html>";
  const s1 = createHash("sha256").update(h1).digest("hex"), s2 = createHash("sha256").update(h2).digest("hex");
  mkdirSync(join(d, "snapshots"), { recursive: true });
  writeFileSync(join(d, "snapshots", `${s1}.html`), h1); writeFileSync(join(d, "snapshots", `${s2}.html`), h2);
  const page = (sha: string): any => ({ url: "http://x/", final_url: "http://x/", status: 200, bytes: 1, sha256: sha });
  writeFileSync(join(d, "state.jsonl"), `${JSON.stringify({ id: "a1", url: "http://x/1", status: "ok", pages: [page(s1)] })}\n${JSON.stringify({ id: "a2", url: "http://x/2", status: "ok", pages: [page(s2)] })}\n`);
  writeFileSync(join(d, "mission.json"), JSON.stringify({ fields: ["f"], instruction: "Extract." }));
  return { d, res: join(d, "results.ndjson") };
}
const row = (d: string): any => JSON.parse(readFileSync(join(d, "results.ndjson"), "utf-8").split("\n")[0]);
const lines = (d: string): any[] => readFileSync(join(d, "results.ndjson"), "utf-8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.type !== "summary");
const run = (t: any, model: string): Promise<void> => runExtract({ out: t.d, mission: join(t.d, "mission.json"), model }, t.client);
describe("scrap extract", () => {
  it("extracts fields with verified quotes, tokens, and skips failed ids", async () => {
    const t = fakeOut({ street: { value: "12 rue des Fleurs", quote: "12 rue des Fleurs" }, city: { value: "Paris", quote: "Paris 75002" } });
    await run(t, "gemini-4-hydrogen");
    expect(row(t.d).fields.street).toEqual({ value: "12 rue des Fleurs", quote: "12 rue des Fleurs", sha256: expect.any(String) });
    expect(row(t.d).tokens).toEqual({ input: 10, output: 5 });
    expect(lines(t.d).length).toBe(1);
  });
  it("nulls fields whose quote is not in the snapshot", async () => {
    const t = fakeOut({ street: { value: "12 rue des Fleurs", quote: "12 rue des Fleurs" }, city: { value: "Lyon", quote: "99 imaginary road" } });
    await run(t, "openai:gpt-5.5");
    expect(row(t.d).fields.city).toEqual({ value: null, quote: null, sha256: null, reason: "unverified_quote" });
  });
  it("leaves missing fields null", async () => {
    const t = fakeOut({ street: { value: "12 rue des Fleurs", quote: "12 rue des Fleurs" } });
    await run(t, "claude-sonnet-4-6");
    expect(row(t.d).fields.city).toEqual({ value: null, quote: null, sha256: null });
  });
  it("maps small-model ids and provider:model, throwing otherwise", async () => {
    const { providerOf } = await import("../src/scrap/extract.js");
    expect(providerOf("o3-mini")).toEqual({ provider: "openai", name: "o3-mini" });
    expect(providerOf("o4-mini")).toEqual({ provider: "openai", name: "o4-mini" });
    expect(providerOf("ministral-8b-latest")).toEqual({ provider: "mistral", name: "ministral-8b-latest" });
    expect(providerOf("codestral-latest")).toEqual({ provider: "mistral", name: "codestral-latest" });
    expect(providerOf("openai:gpt-5-mini")).toEqual({ provider: "openai", name: "gpt-5-mini" });
    expect(() => providerOf("luna-9")).toThrow(/cannot infer provider/);
  });
  it("attributes quotes per page and nulls unquoted non-null values", async () => {
    const h1 = "<html><body><p>alpha beta gamma delta epsilon</p></body></html>";
    const h2 = "<html><body><p>one two three four five six</p></body></html>";
    const s1 = createHash("sha256").update(h1).digest("hex"), s2 = createHash("sha256").update(h2).digest("hex");
    const t = fakeOut({ f1: { value: "beta gamma", quote: "beta gamma" }, f2: { value: "three four", quote: "three four" }, f3: { value: "x", quote: null } });
    mkdirSync(join(t.d, "snapshots"), { recursive: true });
    writeFileSync(join(t.d, "snapshots", `${s1}.html`), h1); writeFileSync(join(t.d, "snapshots", `${s2}.html`), h2);
    writeFileSync(join(t.d, "state.jsonl"), `${JSON.stringify({ id: "a", url: "http://x/", status: "ok", pages: [{ url: "http://x/", final_url: "http://x/", status: 200, bytes: h1.length, sha256: s1 }, { url: "http://x/p2", final_url: "http://x/p2", status: 200, bytes: h2.length, sha256: s2 }] })}\n`);
    writeFileSync(join(t.d, "mission.json"), JSON.stringify({ fields: ["f1", "f2", "f3"], instruction: "Extract." }));
    await run(t, "o3-mini");
    const fields = row(t.d).fields;
    expect(fields.f1).toEqual({ value: "beta gamma", quote: "beta gamma", sha256: s1 });
    expect(fields.f2).toEqual({ value: "three four", quote: "three four", sha256: s2 });
    expect(fields.f3).toEqual({ value: null, quote: null, sha256: null, reason: "unverified_quote" });
  });
  it("dedups state by latest id, skips bad lines and builds the prompt in memory", async () => {
    const { appendFileSync, readdirSync } = await import("node:fs");
    const t = fakeOut({ street: { value: "v", quote: "12 rue des Fleurs" } });
    const first = JSON.parse(readFileSync(join(t.d, "state.jsonl"), "utf-8").split("\n")[0]);
    appendFileSync(join(t.d, "state.jsonl"), `not json\n${JSON.stringify({ id: "a", url: "http://x/", status: "dns", pages: [] })}\n${JSON.stringify({ id: "a", url: "http://x/", status: "ok", pages: first.pages })}\n`);
    let prompts = 0;
    const watching = { mode: "direct", provider: "test", generateJson: async (input: any) => { prompts++; expect(input.outputPath).toBeUndefined(); expect(typeof input.prompt).toBe("string"); await input.validateResponse?.(JSON.stringify({ street: { value: "v", quote: "12 rue des Fleurs" } })); return { status: "completed", provider: "test", mode: "direct", audit: {} }; } };
    await runExtract({ out: t.d, mission: join(t.d, "mission.json"), model: "o3-mini" }, watching as any);
    expect(prompts).toBe(1);
    expect(readdirSync(t.d).filter((f: string) => f.startsWith(".scrap-ex-"))).toEqual([]);
    expect(row(t.d).fields.street.value).toBe("v");
  });
  it("appends each row at once and keeps finished rows when one id fails", async () => {
    const { d, res } = twoOut(), seen: number[] = [];
    const count = (): number => { try { return readFileSync(res, "utf-8").trim().split("\n").filter(Boolean).length; } catch { return 0; } };
    const client = { generateJson: async (input: any) => { seen.push(count()); if (input.prompt.includes("beta street")) throw new Error("provider boom"); await input.validateResponse?.(JSON.stringify({ f: { value: "alpha street", quote: "alpha street number one" } })); return { status: "completed", provider: "test", mode: "direct", audit: {} }; } };
    await runExtract({ out: d, mission: join(d, "mission.json"), model: "openai:gpt-5-mini" }, client as any);
    expect(seen).toEqual([0, 1]);
    expect(lines(d).length).toBe(2);
    expect(lines(d)[0].fields.f.value).toBe("alpha street");
    expect(lines(d)[1]).toMatchObject({ id: "a2", error: "llm_error" });
  });
  it("writes a parse_error row when the model text is not a JSON object", async () => {
    const { d } = twoOut();
    const client = { generateJson: async (input: any) => { await input.validateResponse?.(input.prompt.includes("beta street") ? "[1,2]" : "oops"); return { status: "completed", provider: "test", mode: "direct", audit: {} }; } };
    await runExtract({ out: d, mission: join(d, "mission.json"), model: "openai:gpt-5-mini" }, client as any);
    expect(lines(d).map((r: any) => r.error)).toEqual(["parse_error", "parse_error"]);
  });
  it("writes a write_error row when the snapshot file is missing", async () => {
    const d = mkdtempSync(join(tmpdir(), "scx3-"));
    writeFileSync(join(d, "state.jsonl"), `${JSON.stringify({ id: "gone", url: "http://x/", status: "ok", pages: [{ url: "http://x/", final_url: "http://x/", status: 200, bytes: 3, sha256: "0".repeat(64) }] })}\n`);
    writeFileSync(join(d, "mission.json"), JSON.stringify({ fields: ["f"], instruction: "Extract." }));
    const boom = { generateJson: async () => { throw new Error("must not be called"); } };
    await runExtract({ out: d, mission: join(d, "mission.json"), model: "openai:gpt-5-mini" }, boom as any);
    expect(lines(d)).toEqual([{ id: "gone", url: "http://x/", error: "write_error", error_detail: expect.any(String), fields: null }]);
  });
  it("resumes by skipping ids already in results.ndjson", async () => {
    const t = fakeOut({ street: { value: "v", quote: "12 rue des Fleurs" }, city: { value: "Paris", quote: "Paris 75002" } });
    await run(t, "gemini-4-hydrogen");
    expect(lines(t.d).length).toBe(1);
    let calls = 0;
    const boom = { generateJson: async () => { calls++; throw new Error("must not be called"); } };
    await runExtract({ out: t.d, mission: join(t.d, "mission.json"), model: "gemini-4-hydrogen" }, boom as any);
    expect(calls).toBe(0);
    expect(lines(t.d).length).toBe(1);
  });
  it("aborts before any request when credentials are missing", async () => {
    const { existsSync } = await import("node:fs");
    const t = fakeOut({ street: { value: "v", quote: "12 rue des Fleurs" } });
    const saved = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
    try {
      await expect(runExtract({ out: t.d, mission: join(t.d, "mission.json"), model: "openai:gpt-5-mini" })).rejects.toThrow(/missing credentials.*OPENAI_API_KEY/);
      expect(existsSync(join(t.d, "results.ndjson"))).toBe(false);
    } finally { if (saved !== undefined) process.env.OPENAI_API_KEY = saved; }
  });
  it("cli exits 2 on bad usage, unknown model and missing credentials, 0 on capture and empty extract", async () => {
    const { main } = await import("../src/cli.js");
    const { createServer } = await import("node:http");
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
    expect(await cli(["scrap", "capture"], tmpdir())).toBe(2);
    const s: any = createServer((q: any, r: any) => { r.writeHead(200, { "content-type": "text/html" }); r.end("<html><body><p>Acme 12 rue des Fleurs Paris plus words here</p></body></html>"); });
    await new Promise<void>((res) => s.listen(0, res));
    const dd = mkdtempSync(join(tmpdir(), "scx-cli2-"));
    writeFileSync(join(dd, "in.txt"), `http://127.0.0.1:${(s.address() as any).port}/\n`);
    expect(await cli(["scrap", "capture", "--input", join(dd, "in.txt"), "--out", join(dd, "o")], dd)).toBe(0);
    const d = mkdtempSync(join(tmpdir(), "scx-cli-"));
    writeFileSync(join(d, "m.json"), JSON.stringify({ fields: ["f"], instruction: "i" }));
    mkdirSync(join(d, "o"), { recursive: true });
    expect(await cli(["scrap", "extract", "--out", join(d, "o"), "--mission", join(d, "m.json"), "--model", "luna-9"], d)).toBe(2);
    const e = mkdtempSync(join(tmpdir(), "scx-cli3-"));
    writeFileSync(join(e, "m.json"), JSON.stringify({ fields: ["f"], instruction: "i" }));
    mkdirSync(join(e, "o"), { recursive: true });
    writeFileSync(join(e, "o", "state.jsonl"), `${JSON.stringify({ id: "solo", url: "http://127.0.0.1:1/", status: "dns", pages: [] })}\n`);
    const savedKey = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
    try {
      expect(await cli(["scrap", "extract", "--out", join(e, "o"), "--mission", join(e, "m.json"), "--model", "openai:gpt-5-mini"], e)).toBe(0);
      const sha = createHash("sha256").update("<html><body><p>hi</p></body></html>").digest("hex");
      mkdirSync(join(e, "o", "snapshots"), { recursive: true });
      writeFileSync(join(e, "o", "snapshots", `${sha}.html`), "<html><body><p>hi</p></body></html>");
      writeFileSync(join(e, "o", "state.jsonl"), `${JSON.stringify({ id: "solo", url: "http://127.0.0.1:1/", status: "ok", pages: [{ url: "http://127.0.0.1:1/", final_url: "http://127.0.0.1:1/", status: 200, bytes: 30, sha256: sha }] })}\n`);
      expect(await cli(["scrap", "extract", "--out", join(e, "o"), "--mission", join(e, "m.json"), "--model", "openai:gpt-5-mini"], e)).toBe(2);
    } finally { if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey; }
    s.close();
  });
});

describe("scrap quote entities", () => {
  function entityOut(html: string, missionFields: unknown): { d: string; sha: string } {
    const d = mkdtempSync(join(tmpdir(), "scx-ent-"));
    const sha = createHash("sha256").update(html).digest("hex");
    mkdirSync(join(d, "snapshots"), { recursive: true });
    writeFileSync(join(d, "snapshots", `${sha}.html`), html);
    writeFileSync(join(d, "state.jsonl"), `${JSON.stringify({ id: "a", url: "http://x/", status: "ok", pages: [{ url: "http://x/", final_url: "http://x/", status: 200, bytes: html.length, sha256: sha }] })}\n`);
    writeFileSync(join(d, "mission.json"), JSON.stringify({ fields: missionFields, instruction: "Extract." }));
    return { d, sha };
  }
  function stubClient(canned: unknown): any {
    return { mode: "direct", provider: "test", generateJson: async (input: any) => { await input.validateResponse?.(JSON.stringify(canned)); return { status: "completed", provider: "test", mode: "direct", audit: { usage: { input: 10, output: 5 } } }; } };
  }
  const runEntity = (d: string, canned: unknown): Promise<void> =>
    runExtract({ out: d, mission: join(d, "mission.json"), model: "openai:gpt-5-mini" }, stubClient(canned));

  it("tkm case: record sub-fields sharing an entity-decoded quote stay verified (kills mutant: tkm-amp-entity-dropped)", async () => {
    const html = "<html><body><p>Visit us at 1705 Tech Avenue #1 &amp; 3 Toronto for details.</p></body></html>";
    const mission = [{ name: "biz", kind: "record", max_values: 1, fields: [{ name: "addr" }, { name: "phone" }] }];
    const { d } = entityOut(html, mission);
    const q = "1705 Tech Avenue #1 & 3 Toronto";
    await runEntity(d, { biz: [{ addr: { value: q, quote: q }, phone: { value: q, quote: q } }] });
    const fields = row(d).fields;
    expect(fields.biz.values).toHaveLength(1);
    expect(fields.biz.values[0].addr).toMatchObject({ value: q, quote: q });
    expect(fields.biz.values[0].phone).toMatchObject({ value: q, quote: q });
    expect(fields.biz.unverified_dropped).toBe(0);
    expect(fields.biz.unverified_subfields).toBe(0);
  });
  it("reverse: a raw & page verifies an &amp; quote (kills mutant: reverse-entity-not-decoded)", async () => {
    const html = "<html><body><p>A & B partnership announced today.</p></body></html>";
    const { d } = entityOut(html, ["firm"]);
    const q = "A &amp; B partnership";
    await runEntity(d, { firm: { value: "A & B", quote: q } });
    expect(row(d).fields.firm).toMatchObject({ value: "A & B", quote: q });
  });
  it("decimal reference decodes before the substring test (kills mutant: decimal-ref-undecoded)", async () => {
    const html = "<html><body><p>Welcome to caf&#233; society downtown.</p></body></html>";
    const { d } = entityOut(html, ["place"]);
    const q = "caf\u00e9 society";
    await runEntity(d, { place: { value: "caf\u00e9", quote: q } });
    expect(row(d).fields.place).toMatchObject({ value: "caf\u00e9", quote: q });
  });
  it("hex reference decodes in a multi-value field (kills mutant: hex-ref-undecoded)", async () => {
    const html = "<html><body><p>Deal A &#x26; B closes Monday morning.</p></body></html>";
    const { d } = entityOut(html, [{ name: "items", max_values: 2 }]);
    const q = "A & B closes";
    await runEntity(d, { items: [{ value: "A & B", quote: q }] });
    const fields = row(d).fields;
    expect(fields.items.values).toHaveLength(1);
    expect(fields.items.values[0]).toMatchObject({ value: "A & B", quote: q });
    expect(fields.items.unverified_dropped).toBe(0);
  });
  it("accented named reference decodes (kills mutant: accented-named-ref-undecoded)", async () => {
    const html = "<html><body><p>Visit our caf&eacute; society lounge.</p></body></html>";
    const { d } = entityOut(html, ["place"]);
    const q = "caf\u00e9 society";
    await runEntity(d, { place: { value: "caf\u00e9", quote: q } });
    expect(row(d).fields.place).toMatchObject({ value: "caf\u00e9", quote: q });
  });
  it("double encoding decodes once: decoded quote verifies, double-encoded quote stays dropped (kills mutant: recursive-decode-accepts-double)", async () => {
    const html = "<html><body><p>Eat fish &amp; chips daily here.</p></body></html>";
    const single = entityOut(html, ["meal"]);
    await runEntity(single.d, { meal: { value: "fish & chips", quote: "fish & chips" } });
    expect(row(single.d).fields.meal).toMatchObject({ value: "fish & chips", quote: "fish & chips" });
    const dbl = entityOut(html, ["meal"]);
    await runEntity(dbl.d, { meal: { value: "fish & chips", quote: "fish &amp;amp; chips" } });
    expect(row(dbl.d).fields.meal).toEqual({ value: null, quote: null, sha256: null, reason: "unverified_quote" });
  });
  it("nbsp decodes to U+00A0 then compares as a space (kills mutant: nbsp-not-normalised)", async () => {
    const html = "<html><body><p>Rooms A&nbsp;B available now.</p></body></html>";
    const { d } = entityOut(html, ["room"]);
    const q = "Rooms A B available";
    await runEntity(d, { room: { value: "A B", quote: q } });
    expect(row(d).fields.room).toMatchObject({ value: "A B", quote: q });
  });
  it("a quote differing in a real character stays dropped (kills mutant: entity-decode-masks-real-difference)", async () => {
    const html = "<html><body><p>Visit our caf&eacute; menu today.</p></body></html>";
    const { d } = entityOut(html, ["place"]);
    await runEntity(d, { place: { value: "cafe", quote: "caf\u00e8 menu" } });
    expect(row(d).fields.place).toEqual({ value: null, quote: null, sha256: null, reason: "unverified_quote" });
  });
  it("oelig in a French address verifies (kills mutant: oelig-undecoded)", async () => {
    const html = "<html><body><p>Notre bureau: 12 rue du Sacr&eacute;-C&oelig;ur, Paris.</p></body></html>";
    const { d } = entityOut(html, ["addr"]);
    const q = "12 rue du Sacr\u00e9-C\u0153ur, Paris";
    await runEntity(d, { addr: { value: q, quote: q } });
    expect(row(d).fields.addr).toMatchObject({ value: q, quote: q });
  });
  it("rsquo pins the decoded apostrophe (kills mutant: rsquo-deleted)", async () => {
    const html = "<html><body><p>Visitez l&rsquo;h&ocirc;tel de ville ce soir.</p></body></html>";
    const { d } = entityOut(html, ["note"]);
    const q = "l\u2019h\u00f4tel de ville";
    await runEntity(d, { note: { value: "hotel", quote: q } });
    expect(row(d).fields.note).toMatchObject({ value: "hotel", quote: q });
  });
  it("ndash pins the decoded en dash (kills mutant: ndash-deleted)", async () => {
    const html = "<html><body><p>Direct Paris &ndash; Lyon tous les jours.</p></body></html>";
    const { d } = entityOut(html, ["line"]);
    const q = "Paris \u2013 Lyon";
    await runEntity(d, { line: { value: "Paris-Lyon", quote: q } });
    expect(row(d).fields.line).toMatchObject({ value: "Paris-Lyon", quote: q });
  });
  it("hellip pins the decoded ellipsis (kills mutant: hellip-deleted)", async () => {
    const html = "<html><body><p>Encore plus d&rsquo;offres&hellip; venez voir.</p></body></html>";
    const { d } = entityOut(html, ["teaser"]);
    const q = "d\u2019offres\u2026 venez";
    await runEntity(d, { teaser: { value: "offres", quote: q } });
    expect(row(d).fields.teaser).toMatchObject({ value: "offres", quote: q });
  });
  it("laquo pins the decoded guillemets (kills mutant: laquo-deleted)", async () => {
    const html = "<html><body><p>Il dit &laquo;bonjour&raquo; en entrant.</p></body></html>";
    const { d } = entityOut(html, ["said"]);
    const q = "\u00abbonjour\u00bb en entrant";
    await runEntity(d, { said: { value: "bonjour", quote: q } });
    expect(row(d).fields.said).toMatchObject({ value: "bonjour", quote: q });
  });
  it("a quote that is blank after decoding stays dropped (kills mutant: blank-decoded-quote-verified)", async () => {
    for (const blank of ["&nbsp;", "&#32;", "&#x20;", "&#160;"]) {
      const { d } = entityOut("<html><body><p>Rooms available now for rent downtown.</p></body></html>", ["room"]);
      await runEntity(d, { room: { value: "spacious", quote: blank } });
      expect(row(d).fields.room).toEqual({ value: null, quote: null, sha256: null, reason: "unverified_quote" });
    }
  });
  it("Object.prototype names are left as-is (kills mutant: proto-name-lookup)", async () => {
    for (const name of ["constructor", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf",
      "propertyIsEnumerable", "toLocaleString"]) {
      expect(decodeHtmlEntitiesOnce(`&${name};`)).toBe(`&${name};`);
    }
  });
  it("whitespace runs collapse after decoding (kills mutant: entity-spacing-not-collapsed)", async () => {
    const first = entityOut("<html><body><p>Tel:&nbsp;&nbsp;01 23 45 67 89 listed here.</p></body></html>", ["tel"]);
    await runEntity(first.d, { tel: { value: "01 23 45 67 89", quote: "Tel: 01 23 45 67 89" } });
    expect(row(first.d).fields.tel).toMatchObject({ value: "01 23 45 67 89", quote: "Tel: 01 23 45 67 89" });
    const second = entityOut("<html><body><p>Chambres A&nbsp; B disponibles.</p></body></html>", ["room"]);
    await runEntity(second.d, { room: { value: "A B", quote: "Chambres A B disponibles" } });
    expect(row(second.d).fields.room).toMatchObject({ value: "A B", quote: "Chambres A B disponibles" });
  });
  it("HTML 4.01 blocks beyond Latin-1 decode (kills mutant: html401-table-incomplete)", async () => {
    const cases: Array<[string, string]> = [
      ["OElig", "Œ"], ["oelig", "œ"], ["Scaron", "Š"], ["scaron", "š"], ["Yuml", "Ÿ"],
      ["fnof", "ƒ"], ["circ", "ˆ"], ["tilde", "˜"],
      ["Alpha", "Α"], ["Sigma", "Σ"], ["omega", "ω"], ["sigmaf", "ς"],
      ["thetasym", "ϑ"], ["piv", "ϖ"],
      ["thinsp", " "], ["sbquo", "‚"], ["bdquo", "„"], ["dagger", "†"],
      ["permil", "‰"], ["lsaquo", "‹"], ["rsaquo", "›"], ["oline", "‾"], ["frasl", "⁄"],
      ["image", "ℑ"], ["real", "ℜ"], ["alefsym", "ℵ"],
      ["larr", "←"], ["rArr", "⇒"],
      ["forall", "∀"], ["infin", "∞"], ["le", "≤"], ["supe", "⊇"],
      ["oplus", "⊕"], ["lang", "〈"], ["loz", "◊"], ["spades", "♠"], ["hearts", "♥"],
    ];
    for (const [name, char] of cases) {
      expect(decodeHtmlEntitiesOnce(`&${name};`)).toBe(char);
    }
  });
  it("legacy Windows-1252 numeric references remap (kills mutant: win1252-not-remapped)", async () => {
    const html = "<html><body><p>Bienvenue &agrave; l&#146;&Eacute;glise du C&#156;ur.</p></body></html>";
    const { d } = entityOut(html, ["place"]);
    const q = "l\u2019\u00c9glise du C\u0153ur";
    await runEntity(d, { place: { value: q, quote: q } });
    expect(row(d).fields.place).toMatchObject({ value: q, quote: q });
  });
});
