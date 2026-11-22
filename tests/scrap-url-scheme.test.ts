import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertCaptureInvariant, normalizeUrl, runCapture } from "../src/scrap/capture.js";
import { runExtract } from "../src/scrap/extract.js";

const OK_HTML = "<html><body><p>Acme Corp 12 rue des Fleurs Paris France welcome page with enough words.</p></body></html>";

function makeServer(routes: Record<string, string | [number, string]>, hits: Record<string, number> = {}): Promise<{ s: any; host: string; base: string }> {
  return new Promise((resolve) => {
    const s = createServer((req, res) => {
      const u = req.url ?? "/";
      hits[u] = (hits[u] ?? 0) + 1;
      const b = routes[u];
      if (b === undefined) { res.writeHead(404); res.end("not found"); return; }
      const [code, body] = typeof b === "string" ? [200, b] : b;
      res.writeHead(code, { "content-type": "text/html" });
      res.end(body);
    });
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as any).port;
      resolve({ s, host: `127.0.0.1:${port}`, base: `http://127.0.0.1:${port}` });
    });
  });
}

function readState(out: string): any[] {
  return readFileSync(join(out, "state.jsonl"), "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

async function captureLogs<T>(fn: () => Promise<T>): Promise<{ res: T; logs: string[] }> {
  const origLog = console.log;
  const origErr = console.error;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  console.error = () => {};
  try {
    const res = await fn();
    return { res, logs };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scrap capture URL normalization, explicit states and invariant", () => {
  it("normalizes scheme-less hosts, //host form, and uppercase HTTP:// while rejecting garbage URLs", () => {
    expect(normalizeUrl("www.exemple.com")).toEqual({
      ok: true,
      url: "https://www.exemple.com",
      normalizedFrom: "www.exemple.com",
      schemeAdded: true,
    });
    expect(normalizeUrl("www.exemple.com/contact?a=1")).toEqual({
      ok: true,
      url: "https://www.exemple.com/contact?a=1",
      normalizedFrom: "www.exemple.com/contact?a=1",
      schemeAdded: true,
    });
    expect(normalizeUrl("//cdn.exemple.com/info")).toEqual({
      ok: true,
      url: "https://cdn.exemple.com/info",
      normalizedFrom: "//cdn.exemple.com/info",
      schemeAdded: true,
    });
    expect(normalizeUrl("HTTP://example.com/Path")).toEqual({
      ok: true,
      url: "http://example.com/Path",
      schemeAdded: false,
    });
    expect(normalizeUrl("HTTP://EXAMPLE.COM/Path")).toEqual({
      ok: true,
      url: "http://example.com/Path",
      schemeAdded: false,
    });
    expect(normalizeUrl("HTTPS://User:Pass@EXAMPLE.COM:8443/Path?A=B")).toEqual({
      ok: true,
      url: "https://User:Pass@example.com:8443/Path?A=B",
      schemeAdded: false,
    });
    expect(normalizeUrl("WWW.EXEMPLE.COM/Path")).toEqual({
      ok: true,
      url: "https://www.exemple.com/Path",
      normalizedFrom: "WWW.EXEMPLE.COM/Path",
      schemeAdded: true,
    });
    expect(normalizeUrl("https://sub_domain.example.com/p")).toEqual({
      ok: true,
      url: "https://sub_domain.example.com/p",
      schemeAdded: false,
    });
    expect(normalizeUrl("http://_service.example.com/ok")).toEqual({
      ok: true,
      url: "http://_service.example.com/ok",
      schemeAdded: false,
    });
    expect(normalizeUrl("https://example.com/keep")).toEqual({
      ok: true,
      url: "https://example.com/keep",
      schemeAdded: false,
    });
    for (const bad of ["", "not a url", "ftp://example.com", "mailto:a@b.com", "javascript:alert(1)", "n/a", "12345", "http://", "http:///x", "///x", "user@example.com", "www..example.com", "https://www..example.com/", "sub_domain.example.com/p"]) {
      const r = normalizeUrl(bad);
      expect(r.ok, `expected invalid for ${JSON.stringify(bad)}`).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it("captures scheme-less host, //host form and uppercase HTTP://, recording normalized_from when normalized", async () => {
    const srv = await makeServer({ "/upper": OK_HTML });
    const seenHttps: string[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: any, init?: any) => {
      const u = String(input);
      if (u.startsWith("https://exemple.test") || u.startsWith("https://proto.test")) {
        seenHttps.push(u);
        if (u.endsWith("/robots.txt")) return new Response("", { status: 404 });
        return new Response(OK_HTML, { status: 200, headers: { "content-type": "text/html" } });
      }
      return realFetch(input, init);
    });

    const d = mkdtempSync(join(tmpdir(), "sc-url-"));
    const input = join(d, "in.csv");
    const out = join(d, "out");
    writeFileSync(
      input,
      `id,url\ns1,exemple.test/home\ns2,//proto.test/page\ns3,HTTP://${srv.host}/upper\ns4,https://exemple.test/explicit\n`,
    );

    const { res } = await captureLogs(() => runCapture({ input, out, gapMs: 1, timeoutMs: 1000 }));
    const byId = Object.fromEntries(readState(out).map((r) => [r.id, r]));

    expect(byId.s1).toMatchObject({ status: "ok", url: "https://exemple.test/home", normalized_from: "exemple.test/home" });
    expect(byId.s2).toMatchObject({ status: "ok", url: "https://proto.test/page", normalized_from: "//proto.test/page" });
    expect(byId.s3).toMatchObject({ status: "ok", url: `http://${srv.host}/upper` });
    expect(byId.s3.normalized_from).toBeUndefined();
    expect(byId.s4).toMatchObject({ status: "ok", url: "https://exemple.test/explicit" });
    expect(byId.s4.normalized_from).toBeUndefined();
    expect(seenHttps).toContain("https://exemple.test/home");
    expect(seenHttps).toContain("https://proto.test/page");
    expect(res).toEqual({ inputs: 5, states: 4, skipped_blank: 0, skipped_header: 1, by_state: { ok: 4 } });
    srv.s.close();
  });

  it("never drops garbage URLs, empty ids, or duplicate ids; counts blanks & headers and prints per-state summary", async () => {
    const hits: Record<string, number> = {};
    const srv = await makeServer({ "/a": OK_HTML, "/shared": OK_HTML }, hits);
    const d = mkdtempSync(join(tmpdir(), "sc-inv-"));
    const input = join(d, "in.csv");
    const out = join(d, "out");
    writeFileSync(
      input,
      [
        "",
        "id,url",
        `ok1,${srv.base}/a`,
        `ok2,${srv.base}/shared`,
        `ok3,${srv.base}/shared`,
        "bad1,not a url",
        "bad2,ftp://example.com/file",
        "bad3,",
        `,${srv.base}/empty-id`,
        `ok1,${srv.base}/dup-id`,
        "missing_comma_line",
        "",
        `gone1,${srv.base}/404`,
        "",
      ].join("\n"),
    );

    const { res, logs } = await captureLogs(() => runCapture({ input, out, gapMs: 1, timeoutMs: 1000 }));
    const rows = readState(out);

    // 13 lines total (trailing newline is line terminator, not an extra line):
    // 2 blank lines (line 1, line 12), 1 header (line 2), 10 data lines => 10 state rows
    expect(rows.length).toBe(10);
    expect(res.inputs).toBe(13);
    expect(res.skipped_blank).toBe(2);
    expect(res.skipped_header).toBe(1);
    expect(res.states).toBe(10);
    expect(res.inputs).toBe(res.states + res.skipped_blank + res.skipped_header);
    expect(res.by_state).toEqual({ ok: 3, http_4xx: 1, invalid_url: 3, invalid_input: 3 });

    // Different ids sharing the same URL (ok2, ok3) were BOTH captured
    expect(rows.filter((r) => r.id === "ok2" || r.id === "ok3").map((r) => r.status)).toEqual(["ok", "ok"]);

    // Garbage URLs recorded with raw value and reason
    const bad1 = rows.find((r) => r.id === "bad1");
    expect(bad1).toMatchObject({ status: "invalid_url", url: "not a url", raw_url: "not a url" });
    expect(typeof bad1.reason).toBe("string");
    expect(bad1.reason.length).toBeGreaterThan(0);

    const bad2 = rows.find((r) => r.id === "bad2");
    expect(bad2).toMatchObject({ status: "invalid_url", url: "ftp://example.com/file", raw_url: "ftp://example.com/file" });
    expect(bad2.reason).toMatch(/scheme/i);

    const bad3 = rows.find((r) => r.id === "bad3");
    expect(bad3).toMatchObject({ status: "invalid_url", url: "", raw_url: "" });
    expect(bad3.reason).toMatch(/empty/i);

    // Empty id, duplicate id, missing comma => invalid_input with reason
    const emptyId = rows.find((r) => r.status === "invalid_input" && /empty id/i.test(r.reason));
    expect(emptyId).toMatchObject({ id: "", status: "invalid_input" });

    const dupId = rows.find((r) => r.status === "invalid_input" && /duplicate/i.test(r.reason));
    expect(dupId).toMatchObject({ id: "ok1", status: "invalid_input" });
    expect(hits["/dup-id"] ?? 0).toBe(0);

    const noComma = rows.find((r) => r.status === "invalid_input" && /comma/i.test(r.reason));
    expect(noComma).toBeDefined();

    // Run summary printed to stdout with totals per state and skipped counts
    const summaryLine = logs.find((l) => l.includes("scrap capture summary"));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain("inputs=13");
    expect(summaryLine).toContain("states=10");
    expect(summaryLine).toContain("skipped_blank=2");
    expect(summaryLine).toContain("skipped_header=1");
    expect(summaryLine).toContain("ok=3");
    expect(summaryLine).toContain("invalid_url=3");
    expect(summaryLine).toContain("invalid_input=3");
    expect(summaryLine).toContain("http_4xx=1");

    // Duplicate-id invalid_input row must NOT clobber ok1 in extract!
    writeFileSync(join(d, "mission.json"), JSON.stringify({ fields: ["company"], instruction: "Extract company." }));
    const extracted: string[] = [];
    const stubClient = {
      generateJson: async (inp: any) => {
        extracted.push(inp.prompt);
        await inp.validateResponse?.(JSON.stringify({ company: { value: "Acme Corp", quote: "Acme Corp" } }));
        return { audit: {} };
      },
    };
    await captureLogs(() => runExtract({ out, mission: join(d, "mission.json"), model: "openai:gpt-5-mini" }, stubClient));
    const resIds = readFileSync(join(out, "results.ndjson"), "utf-8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.type !== "summary").map((r) => r.id);
    expect(resIds.sort()).toEqual(["ok1", "ok2", "ok3"]);

    srv.s.close();
  });

  it("assertCaptureInvariant fails loudly when inputs != states + skipped_blank + skipped_header", () => {
    expect(() =>
      assertCaptureInvariant({ inputs: 10, states: 7, skipped_blank: 1, skipped_header: 1, by_state: { ok: 7 } }),
    ).toThrow(/scrap capture invariant failed/i);
    expect(() =>
      assertCaptureInvariant({ inputs: 10, states: 8, skipped_blank: 1, skipped_header: 1, by_state: { ok: 6 } }),
    ).toThrow(/scrap capture invariant failed/i);
  });

  it("rerun and --retry-failed pick up stateless ids; invalid_url/invalid_input are final unless the input line changes", async () => {
    const hits: Record<string, number> = {};
    const srv = await makeServer({ "/ok1": OK_HTML, "/new": OK_HTML, "/fixed": OK_HTML, "/flaky": [500, "err"] }, hits);
    const d = mkdtempSync(join(tmpdir(), "sc-rerun-"));
    const input = join(d, "in.csv");
    const out = join(d, "out");
    mkdirSync(out, { recursive: true });

    // Pre-seed state.jsonl missing stateless id `a2` and `bad1` (like post-run-1 of lot B)
    writeFileSync(
      join(out, "state.jsonl"),
      [
        JSON.stringify({ id: "a1", url: `${srv.base}/ok1`, final_url: `${srv.base}/ok1`, status: "ok", captured_at: "2026-11-22T00:00:00Z", pages: [], robots: "respected" }),
        JSON.stringify({ id: "f1", url: `${srv.base}/flaky`, final_url: `${srv.base}/flaky`, status: "http_5xx", captured_at: "2026-11-22T00:00:00Z", pages: [], robots: "respected" }),
      ].join("\n") + "\n",
    );
    writeFileSync(
      input,
      `id,url\na1,${srv.base}/ok1\nf1,${srv.base}/flaky\na2,${srv.base}/new\nbad1,garbage host\n,${srv.base}/noid\n`,
    );

    // Plain rerun picks up stateless a2, bad1, and empty-id; does NOT re-fetch a1 or f1
    const r1 = (await captureLogs(() => runCapture({ input, out, gapMs: 1, timeoutMs: 1000 }))).res;
    expect(r1).toEqual({ inputs: 6, states: 5, skipped_blank: 0, skipped_header: 1, by_state: { ok: 2, http_5xx: 1, invalid_url: 1, invalid_input: 1 } });
    expect(hits["/ok1"] ?? 0).toBe(0);
    expect(hits["/flaky"] ?? 0).toBe(0);
    expect(hits["/new"]).toBe(1);
    const countAfterR1 = readState(out).length;
    expect(countAfterR1).toBe(5);

    // Second plain rerun is strictly idempotent: invalid_url and invalid_input are NOT re-appended
    const r2 = (await captureLogs(() => runCapture({ input, out, gapMs: 1, timeoutMs: 1000 }))).res;
    expect(r2).toEqual(r1);
    expect(readState(out).length).toBe(countAfterR1);

    // --retry-failed retries f1 (http_5xx) and picks up a newly added stateless id, but keeps invalid_url/invalid_input final
    writeFileSync(
      input,
      `id,url\na1,${srv.base}/ok1\nf1,${srv.base}/flaky\na2,${srv.base}/new\nbad1,garbage host\n,${srv.base}/noid\na3,${srv.base}/ok1\n`,
    );
    const r3 = (await captureLogs(() => runCapture({ input, out, gapMs: 1, timeoutMs: 1000, retryFailed: true }))).res;
    expect(r3).toEqual({ inputs: 7, states: 6, skipped_blank: 0, skipped_header: 1, by_state: { ok: 3, http_5xx: 1, invalid_url: 1, invalid_input: 1 } });
    expect(hits["/flaky"]).toBe(1);
    expect(hits["/ok1"]).toBe(1); // from newly added stateless a3 only
    // Only f1 + a3 appended (not bad1, not empty-id, not a1, not a2)
    expect(readState(out).length).toBe(countAfterR1 + 2);

    // Fixing bad1's line AND giving the empty-id line a valid id causes plain rerun to capture both!
    writeFileSync(
      input,
      `id,url\na1,${srv.base}/ok1\nf1,${srv.base}/flaky\na2,${srv.base}/new\nbad1,${srv.base}/fixed\nconstructor,${srv.base}/ok1\na3,${srv.base}/ok1\n`,
    );
    const r4 = (await captureLogs(() => runCapture({ input, out, gapMs: 1, timeoutMs: 1000 }))).res;
    expect(r4).toEqual({ inputs: 7, states: 6, skipped_blank: 0, skipped_header: 1, by_state: { ok: 5, http_5xx: 1 } });
    expect(hits["/fixed"]).toBe(1);
    const tail = readState(out).slice(-2);
    expect(tail.map((r) => [r.id, r.status]).sort()).toEqual([["bad1", "ok"], ["constructor", "ok"]]);

    srv.s.close();
  });

  it("supports --scheme-fallback http on connect/TLS failure but NOT on HTTP 404 or when disabled", async () => {
    // 1. Real plain HTTP server: https:// fails TLS handshake, --scheme-fallback http retries once over http://
    const hits: Record<string, number> = {};
    const srv = await makeServer({ "/landing": OK_HTML }, hits);
    const d1 = mkdtempSync(join(tmpdir(), "sc-fb1-"));
    const in1 = join(d1, "in.csv");
    writeFileSync(in1, `id,url\nh1,${srv.host}/landing\n`);

    // Default (no fallback): fails TLS -> dns, does not serve HTTP
    const outNoFb = join(d1, "no-fb");
    await captureLogs(() => runCapture({ input: in1, out: outNoFb, gapMs: 1, timeoutMs: 1000 }));
    expect(readState(outNoFb)[0]).toMatchObject({
      id: "h1",
      url: `https://${srv.host}/landing`,
      normalized_from: `${srv.host}/landing`,
      status: "dns",
    });

    // With schemeFallback: "http": retries once over http:// and succeeds
    const outFb = join(d1, "with-fb");
    await captureLogs(() => runCapture({ input: in1, out: outFb, gapMs: 1, timeoutMs: 1000, schemeFallback: "http" }));
    const fbRow = readState(outFb)[0];
    expect(fbRow).toMatchObject({
      id: "h1",
      url: `https://${srv.host}/landing`,
      final_url: `http://${srv.host}/landing`,
      normalized_from: `${srv.host}/landing`,
      status: "ok",
    });
    expect(fbRow.pages[0].url).toBe(`http://${srv.host}/landing`);
    expect(hits["/landing"]).toBe(1);
    srv.s.close();

    // 2. Fallback respects robots.txt on the http:// origin
    const deniedSrv = await makeServer({ "/robots.txt": "User-agent: *\nDisallow: /\n", "/landing": OK_HTML });
    const dRob = mkdtempSync(join(tmpdir(), "sc-fbr-"));
    const inRob = join(dRob, "in.csv");
    writeFileSync(inRob, `id,url\nr1,${deniedSrv.host}/landing\n`);
    await captureLogs(() => runCapture({ input: inRob, out: join(dRob, "o"), gapMs: 1, timeoutMs: 1000, schemeFallback: "http" }));
    expect(readState(join(dRob, "o"))[0]).toMatchObject({ id: "r1", status: "robots_denied", normalized_from: `${deniedSrv.host}/landing` });
    deniedSrv.s.close();

    // 3. HTTP 404 & 500 on https:// must NOT trigger http:// fallback, while connect/TLS errors on scheme-less & //host DO
    const fetchedUrls: string[] = [];
    vi.stubGlobal("fetch", async (input: any) => {
      const u = String(input);
      fetchedUrls.push(u);
      if (u.endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (u === "https://only404.test/missing") return new Response("gone", { status: 404 });
      if (u === "https://only500.test/boom") return new Response("boom", { status: 500 });
      if (u === "https://connerr.test/ok" || u === "https://protofb.test/ok") {
        const err: any = new TypeError("fetch failed");
        err.cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
        throw err;
      }
      if (u === "http://connerr.test/ok" || u === "http://protofb.test/ok") {
        return new Response(OK_HTML, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response(OK_HTML, { status: 200, headers: { "content-type": "text/html" } });
    });

    const d2 = mkdtempSync(join(tmpdir(), "sc-fb2-"));
    const in2 = join(d2, "in.csv");
    const out2 = join(d2, "out");
    writeFileSync(in2, "id,url\nf404,only404.test/missing\nf500,only500.test/boom\nfconn,connerr.test/ok\nfproto,//protofb.test/ok\n");
    await captureLogs(() => runCapture({ input: in2, out: out2, gapMs: 1, timeoutMs: 1000, schemeFallback: "http" }));
    const byId = Object.fromEntries(readState(out2).map((r) => [r.id, r]));

    expect(byId.f404).toMatchObject({ status: "http_4xx", url: "https://only404.test/missing", normalized_from: "only404.test/missing" });
    expect(fetchedUrls.some((u) => u.startsWith("http://only404.test"))).toBe(false);

    expect(byId.f500).toMatchObject({ status: "http_5xx", url: "https://only500.test/boom", normalized_from: "only500.test/boom" });
    expect(fetchedUrls.some((u) => u.startsWith("http://only500.test"))).toBe(false);

    expect(byId.fconn).toMatchObject({ status: "ok", url: "https://connerr.test/ok", final_url: "http://connerr.test/ok", normalized_from: "connerr.test/ok" });
    expect(byId.fproto).toMatchObject({ status: "ok", url: "https://protofb.test/ok", final_url: "http://protofb.test/ok", normalized_from: "//protofb.test/ok" });
    expect(fetchedUrls).toContain("https://connerr.test/ok");
    expect(fetchedUrls).toContain("http://connerr.test/ok");
    expect(fetchedUrls).toContain("http://protofb.test/ok");
  });

  it("wires --scheme-fallback through the CLI and rejects invalid modes with exit 2", async () => {
    const { main } = await import("../src/cli.js");
    const srv = await makeServer({ "/p": OK_HTML });
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
    const d = mkdtempSync(join(tmpdir(), "sc-clifb-"));
    writeFileSync(join(d, "in.csv"), `id,url\nc1,${srv.host}/p\n`);
    expect(await cli(["scrap", "capture", "--input", join(d, "in.csv"), "--out", join(d, "bad"), "--scheme-fallback", "ftp"], d)).toBe(2);
    expect(await cli(["scrap", "capture", "--input", join(d, "in.csv"), "--out", join(d, "ok"), "--scheme-fallback", "http"], d)).toBe(0);
    expect(readState(join(d, "ok"))[0]).toMatchObject({ id: "c1", status: "ok", final_url: `http://${srv.host}/p`, normalized_from: `${srv.host}/p` });
    srv.s.close();
  });

  it("captures explicit URLs with underscored subdomains and deduplicates uppercase hosts in plain-list mode", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (input: any) => {
      const u = String(input);
      fetched.push(u);
      if (u.endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response(OK_HTML, { status: 200, headers: { "content-type": "text/html" } });
    });

    const d = mkdtempSync(join(tmpdir(), "sc-min14-"));
    const input = join(d, "plain.txt");
    const out = join(d, "out");
    writeFileSync(
      input,
      "https://sub_domain.example.test/ok\nHTTP://EXAMPLE.TEST/Path\nhttp://example.test/Path\n",
    );

    const { res } = await captureLogs(() => runCapture({ input, out, gapMs: 1, timeoutMs: 1000 }));
    const rows = readState(out);

    expect(res).toEqual({ inputs: 3, states: 3, skipped_blank: 0, skipped_header: 0, by_state: { ok: 2, invalid_input: 1 } });
    expect(rows.find((r) => r.id === "https://sub_domain.example.test/ok")).toMatchObject({ status: "ok" });
    expect(rows.find((r) => r.id === "http://example.test/Path" && r.status === "ok")).toMatchObject({ url: "http://example.test/Path" });
    expect(rows.find((r) => r.status === "invalid_input")).toMatchObject({ id: "http://example.test/Path", reason: "duplicate id" });
    expect(fetched.filter((u) => u === "http://example.test/Path")).toHaveLength(1);
    expect(fetched).toContain("https://sub_domain.example.test/ok");
  });

  it("does not trigger redundant http:// fallback when ENOTFOUND is inside AggregateError.errors", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (input: any) => {
      const u = String(input);
      fetched.push(u);
      if (u.endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (u === "https://agg-dns.test/p") {
        const err: any = new TypeError("fetch failed");
        err.cause = new AggregateError([
          Object.assign(new Error("getaddrinfo ENOTFOUND agg-dns.test"), { code: "ENOTFOUND" }),
          Object.assign(new Error("getaddrinfo EAI_AGAIN agg-dns.test"), { code: "EAI_AGAIN" }),
        ], "");
        throw err;
      }
      if (u === "https://agg-conn.test/p") {
        const err: any = new TypeError("fetch failed");
        err.cause = new AggregateError([
          Object.assign(new Error("connect ECONNREFUSED ::1:443"), { code: "ECONNREFUSED" }),
          Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), { code: "ECONNREFUSED" }),
        ], "");
        throw err;
      }
      return new Response(OK_HTML, { status: 200, headers: { "content-type": "text/html" } });
    });

    const d = mkdtempSync(join(tmpdir(), "sc-agg-"));
    const input = join(d, "in.csv");
    const out = join(d, "out");
    writeFileSync(input, "id,url\ndns1,agg-dns.test/p\nconn1,agg-conn.test/p\n");

    await captureLogs(() => runCapture({ input, out, gapMs: 1, timeoutMs: 1000, schemeFallback: "http" }));
    const byId = Object.fromEntries(readState(out).map((r) => [r.id, r]));

    expect(byId.dns1).toMatchObject({ status: "dns", url: "https://agg-dns.test/p", final_url: "https://agg-dns.test/p" });
    expect(fetched.some((u) => u.startsWith("http://agg-dns.test"))).toBe(false);

    expect(byId.conn1).toMatchObject({ status: "ok", url: "https://agg-conn.test/p", final_url: "http://agg-conn.test/p" });
    expect(fetched).toContain("http://agg-conn.test/p");
  });

  it("deduplicates invalid_input rows by raw_input multiset when lines shift on rerun", async () => {
    const srv = await makeServer({ "/a0": OK_HTML, "/a1": OK_HTML });
    const d = mkdtempSync(join(tmpdir(), "sc-shift-"));
    const input = join(d, "in.csv");
    const out = join(d, "out");

    writeFileSync(
      input,
      `id,url\na1,${srv.base}/a1\n,${srv.base}/noid\na1,${srv.base}/dup\nmissing_comma\n`,
    );
    const r1 = (await captureLogs(() => runCapture({ input, out, gapMs: 1, timeoutMs: 1000 }))).res;
    expect(r1).toEqual({ inputs: 5, states: 4, skipped_blank: 0, skipped_header: 1, by_state: { ok: 1, invalid_input: 3 } });
    expect(readState(out)).toHaveLength(4);

    // Insert 1 new valid line above all invalid_input lines: each shifts by +1 (landing on the previous neighbor's lineNo)
    writeFileSync(
      input,
      `id,url\na0,${srv.base}/a0\na1,${srv.base}/a1\n,${srv.base}/noid\na1,${srv.base}/dup\nmissing_comma\n`,
    );
    const r2 = (await captureLogs(() => runCapture({ input, out, gapMs: 1, timeoutMs: 1000 }))).res;
    expect(r2).toEqual({ inputs: 6, states: 5, skipped_blank: 0, skipped_header: 1, by_state: { ok: 2, invalid_input: 3 } });
    // Only a0 appended; zero duplicate invalid_input rows written
    expect(readState(out)).toHaveLength(5);

    // Adding a second identical empty-id line appends exactly one new invalid_input row, then stays idempotent
    writeFileSync(
      input,
      `id,url\n\na0,${srv.base}/a0\na1,${srv.base}/a1\n,${srv.base}/noid\n,${srv.base}/noid\na1,${srv.base}/dup\nmissing_comma\n`,
    );
    const r3 = (await captureLogs(() => runCapture({ input, out, gapMs: 1, timeoutMs: 1000 }))).res;
    expect(r3).toEqual({ inputs: 8, states: 6, skipped_blank: 1, skipped_header: 1, by_state: { ok: 2, invalid_input: 4 } });
    expect(readState(out)).toHaveLength(6);

    const r4 = (await captureLogs(() => runCapture({ input, out, gapMs: 1, timeoutMs: 1000 }))).res;
    expect(r4).toEqual(r3);
    expect(readState(out)).toHaveLength(6);

    srv.s.close();
  });
});
