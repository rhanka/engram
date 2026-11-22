import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCapture } from "../src/scrap/capture.js";
type R = string | [number, string] | null;
function serve(routes: Record<string, R>, hits: Record<string, number> = {}): any {
  const s = createServer((q, r) => { const u = q.url ?? "/"; hits[u] = (hits[u] ?? 0) + 1; const b = routes[u];
    if (b === undefined || b === null) { if (b === undefined) { r.writeHead(404); r.end("x"); } return; }
    const st = typeof b === "string" ? [200, b] : (b as [number, string]); r.writeHead(st[0], { "content-type": "text/html" }); r.end(st[1]); });
  s.listen(0); return s;
}
const base = (s: any): string => `http://127.0.0.1:${(s.address() as any).port}`;
async function cap(input: string, out: string, extra: Record<string, any> = {}): Promise<any[]> {
  await runCapture({ input, out, gapMs: 5, timeoutMs: 600, ...extra });
  return readFileSync(join(out, "state.jsonl"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
}
function setup(routes: Record<string, R>, body: string, hits: Record<string, number> = {}): any {
  const s = serve(routes, hits), d = mkdtempSync(join(tmpdir(), "sc0-")), f = join(d, "in.txt");
  writeFileSync(f, body.replaceAll("$U", base(s))); return { s, d, f };
}
describe("scrap capture", () => {
  it("fetches home plus contact, collapses blanks and duplicates", async () => {
    const t = setup({ "/": '<html><body><p>Acme 12 rue des Fleurs Paris</p><a href="/contact">Contact</a><a href="/jobs">Jobs</a></body></html>', "/contact": "<html><body><p>Acme 12 rue des Fleurs Paris</p></body></html>" }, "$U/\n\n$U/\n");
    const rows = await cap(t.f, join(t.d, "o"));
    expect(rows.map((r) => r.status)).toEqual(["ok"]);
    expect(rows[0].pages.length).toBe(2); expect(rows[0].pages[1].url).toMatch(/\/contact$/); t.s.close();
  });
  it("respects robots, overrides with the flag, denies a disallowed home", async () => {
    const a = setup({ "/robots.txt": "User-agent: *\nDisallow: /contact\n", "/": '<html><body><p>hello world home page</p><a href="/contact">Contact</a></body></html>', "/contact": "<html><body><p>secret desk</p></body></html>" }, "$U/\n");
    const r1 = (await cap(a.f, join(a.d, "o")))[0];
    expect([r1.pages.length, r1.robots, r1.status]).toEqual([1, "respected", "ok"]);
    const r2 = await cap(a.f, join(a.d, "o2"), { robots: "ignore" });
    expect([r2[0].pages.length, r2[0].robots]).toEqual([2, "overridden"]); a.s.close();
    const b = setup({ "/robots.txt": "User-agent: *\nDisallow: /\n", "/": "<html><body><p>nope</p></body></html>" }, "$U/\n");
    expect((await cap(b.f, join(b.d, "o")))[0].status).toBe("robots_denied"); b.s.close();
  });
  it("classifies 4xx, 5xx, dns, js shells and challenge pages", async () => {
    const js = '<html><head><script src="/a.js"></script></head><body><div id="root"></div></body></html>';
    const ch = "<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>";
    const t = setup({ "/e404": [404, "gone"], "/e500": [500, "boom"], "/js": js, "/ch": [403, ch] }, "");
    writeFileSync(t.f, `id,url\nn404,${base(t.s)}/e404\nn500,${base(t.s)}/e500\nndns,http://127.0.0.1:1/\nnjs,${base(t.s)}/js\nnch,${base(t.s)}/ch\n`);
    const byId: Record<string, string> = {};
    for (const r of await cap(t.f, join(t.d, "o"))) byId[r.id] = r.status;
    expect(byId).toEqual({ n404: "http_4xx", n500: "http_5xx", ndns: "dns", njs: "empty_js_shell", nch: "blocked_antibot" }); t.s.close();
  });
  it("caps pages at 3 and skips cross-host, fragments, home and unmatched links", async () => {
    const hitsB: Record<string, number> = {};
    const other: any = serve({ "/other": "<html><body><p>other</p></body></html>" }, hitsB);
    await new Promise<void>((res) => { try { if (other.listening) res(); else other.on("listening", () => res()); } catch { res(); } });
    const baseB = `http://localhost:${(other.address() as any).port}`;
    const t = setup({ "/": `<html><body><p>Acme 12 rue des Fleurs Paris</p><a href="/">Contact</a><a href="${baseB}/other">Contact</a><a href=/c1#top>À propos</a><a href="/c1#bottom">À propos</a><a href="/c2">Contact</a><a href="/c3">Contact</a><a href="/c4">Contact</a></body></html>`, "/c1": "<html><body><p>one</p></body></html>", "/c2": "<html><body><p>two</p></body></html>", "/c3": "<html><body><p>three</p></body></html>", "/c4": "<html><body><p>four</p></body></html>" }, "$U/\n");
    const rows = await cap(t.f, join(t.d, "o"));
    expect(rows[0].pages.length).toBe(3);
    const urls = rows[0].pages.map((pp: any) => pp.url);
    expect(urls[1]).toMatch(/\/c1$/);
    expect(urls[2]).toMatch(/\/c2$/);
    expect(urls.join(" ")).not.toContain("#");
    expect(urls.every((u: string) => !u.startsWith(baseB))).toBe(true);
    expect(hitsB["/other"] ?? 0).toBe(0);
    t.s.close(); other.close();
  });
  it("caps redirects at 3 and total requests at 8 per id", async () => {
    const hits: Record<string, number> = {};
    const s: any = createServer((q: any, r: any) => {
      const u: string = q.url ?? "/";
      hits[u] = (hits[u] ?? 0) + 1;
      const redir = (to: string): void => { r.writeHead(302, { location: to }); r.end("m"); };
      if (u === "/robots.txt") { r.writeHead(404); r.end("x"); return; }
      if (u === "/r0") return redir("/r1");
      if (u === "/r1") return redir("/r2");
      if (u === "/r2") return redir("/r3");
      if (u === "/r3") return redir("/r4");
      if (u === "/cap0") return redir("/cap1");
      if (u === "/cap1") return redir("/cap2");
      if (u === "/cap2") return redir("/cap3");
      if (u === "/cap3") { r.writeHead(200, { "content-type": "text/html" }); r.end('<html><body><p>Acme 12 rue des Fleurs Paris</p><a href="/d1">Contact</a><a href="/d2">Contact</a></body></html>'); return; }
      if (u === "/d1") return redir("/d1b");
      if (u === "/d1b") return redir("/d1c");
      if (u === "/d1c") return redir("/d1d");
      if (u === "/d2") { r.writeHead(200, { "content-type": "text/html" }); r.end("<html><body><p>d2</p></body></html>"); return; }
      r.writeHead(404); r.end("x");
    });
    await new Promise<void>((res) => s.listen(0, res));
    const port = (s.address() as any).port;
    const d = mkdtempSync(join(tmpdir(), "sc0-"));
    const f = join(d, "in.txt");
    writeFileSync(f, `http://127.0.0.1:${port}/r0\n`);
    expect((await cap(f, join(d, "o1")))[0].status).toBe("dns");
    expect(hits["/r4"] ?? 0).toBe(0);
    const d2 = mkdtempSync(join(tmpdir(), "sc0-"));
    const f2 = join(d2, "in.txt");
    writeFileSync(f2, `http://127.0.0.1:${port}/cap0\n`);
    const row = (await cap(f2, join(d2, "o")))[0];
    expect(row.pages.length).toBeLessThanOrEqual(3);
    expect(hits["/d1d"] ?? 0).toBe(0);
    s.close();
  });
  it("ignores third-party bot groups, strips comments and honors Allow longest-match", async () => {
    const robots = "User-agent: GPTBot\nDisallow: /\nUser-agent: * # all\nDisallow: /contact\nAllow: /contact/free\n";
    const t = setup({ "/robots.txt": robots, "/": '<html><body><p>Acme 12 rue des Fleurs Paris</p><a href="/contact">Contact</a><a href="/contact/free">Contact</a></body></html>', "/contact": "<html><body><p>desk</p></body></html>", "/contact/free": "<html><body><p>free</p></body></html>" }, "$U/\n");
    const row = (await cap(t.f, join(t.d, "o")))[0];
    expect(row.status).toBe("ok");
    expect(row.pages.length).toBe(2);
    expect(row.pages[1].url).toMatch(/\/contact\/free$/); t.s.close();
  });
  it("isolates consecutive User-agent groups so third-party rules do not leak", async () => {
    const robots = "User-agent: *\nDisallow: /contact\nUser-agent: GPTBot\nDisallow: /\n";
    const t = setup({ "/robots.txt": robots, "/": '<html><body><p>Acme 12 rue des Fleurs Paris</p><a href="/contact">Contact</a></body></html>', "/contact": "<html><body><p>desk</p></body></html>" }, "$U/\n");
    const row = (await cap(t.f, join(t.d, "o")))[0];
    expect(row.status).toBe("ok");
    expect(row.pages.length).toBe(1);
    t.s.close();
  });
  it("ends the User-agent section at Crawl-delay so the next group stays separate", async () => {
    const robots = "User-agent: *\nCrawl-delay: 5\nUser-agent: GPTBot\nDisallow: /\n";
    const t = setup({ "/robots.txt": robots, "/": '<html><body><p>Acme 12 rue des Fleurs Paris</p><a href="/contact">Contact</a></body></html>', "/contact": "<html><body><p>desk</p></body></html>" }, "$U/\n");
    const row = (await cap(t.f, join(t.d, "o")))[0];
    expect(row.status).toBe("ok");
    expect(row.pages.length).toBe(2);
    t.s.close();
  });
  it("prefers Allow over Disallow on equal-length rules", async () => {
    const robots = "User-agent: *\nDisallow: /\nUser-agent: engram\nAllow: /\n";
    const t = setup({ "/robots.txt": robots, "/": '<html><body><p>Acme 12 rue des Fleurs Paris</p><a href="/contact">Contact</a></body></html>', "/contact": "<html><body><p>desk</p></body></html>" }, "$U/\n");
    const row = (await cap(t.f, join(t.d, "o")))[0];
    expect(row.status).toBe("ok");
    expect(row.pages.length).toBe(2);
    t.s.close();
  });
  it("fetches robots.txt once per origin under concurrency", async () => {
    const hits: Record<string, number> = {};
    const H = "<html><body><p>Acme 12 rue des Fleurs Paris and enough words</p></body></html>";
    const t = setup({ "/1": H, "/2": H }, "$U/1\n$U/2\n", hits);
    await cap(t.f, join(t.d, "o"), { gapMs: 80, concurrency: 4 });
    expect(hits["/robots.txt"]).toBe(1);
    t.s.close();
  });
  it("spaces per-host requests under concurrency, writes snapshots once and dedups", async () => {
    const { readdirSync } = await import("node:fs");
    const { createHash } = await import("node:crypto");
    const H = "<html><body><p>Acme 12 rue des Fleurs Paris and enough words</p></body></html>"; const t = setup({ "/1": H, "/2": H, "/3": H, "/4": H }, "$U/1\n$U/2\n$U/3\n$U/4\n");
    const t0 = Date.now();
    const rows = await cap(t.f, join(t.d, "o"), { gapMs: 80, concurrency: 4 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(200);
    expect(rows.every((r: any) => r.status === "ok")).toBe(true);
    expect(readdirSync(join(t.d, "o", "snapshots"))).toEqual([`${createHash("sha256").update(H).digest("hex")}.html`]);
    const once = setup({ "/a": "<html><body><p>same body words here plus padding</p></body></html>", "/b": "<html><body><p>same body words here plus padding</p></body></html>" }, "");
    writeFileSync(once.f, `${base(once.s)}/a\n${base(once.s)}/b\n`);
    await cap(once.f, join(once.d, "o"));
    expect(readdirSync(join(once.d, "o", "snapshots")).length).toBe(1);
    t.s.close(); once.s.close();
  });
  it("times out stalled bodies and separates 429 challenge from plain 429", async () => {
    const hits: Record<string, number> = {};
    const t = setup({ "/c": [429, "<html><body>Just a moment cf-chl</body></html>"], "/p": [429, "<html><body>busy</body></html>"] }, "", hits);
    const stall = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); (r as any).flushHeaders?.(); setTimeout(() => { try { r.end("<html><body><p>late</p></body></html>"); } catch { /* closed */ } }, 900); });
    await new Promise<void>((res) => stall.listen(0, res));
    const sp = (stall.address() as any).port;
    writeFileSync(t.f, `http://127.0.0.1:${sp}/s\n${base(t.s)}/c\n${base(t.s)}/p\n`);
    const byId: Record<string, string> = {};
    for (const r of await cap(t.f, join(t.d, "o"), { timeoutMs: 200 })) byId[r.url] = r.status;
    expect(byId[`http://127.0.0.1:${sp}/s`]).toBe("timeout");
    expect(byId[`${base(t.s)}/c`]).toBe("blocked_antibot");
    expect(byId[`${base(t.s)}/p`]).toBe("http_4xx");
    t.s.close(); stall.close();
  });
  it("reruns are idempotent and --retry-failed retries only failures", async () => {
    const hits: Record<string, number> = {};
    const t = setup({ "/": "<html><body><p>fine site with enough visible words here</p></body></html>", "/hang": null }, "$U/\n$U/hang\n$U/gone\n", hits);
    const o = join(t.d, "o");
    expect((await cap(t.f, o)).map((r) => r.status).sort()).toEqual(["http_4xx", "ok", "timeout"]);
    const mark = { ...hits }; await cap(t.f, o); expect(hits).toEqual(mark);
    expect(readFileSync(join(o, "state.jsonl"), "utf-8").trim().split("\n").length).toBe(3);
    await cap(t.f, o, { retryFailed: true });
    expect(hits["/"]).toBe(mark["/"]);
    expect((hits["/hang"] ?? 0) + (hits["/gone"] ?? 0)).toBe((mark["/hang"] ?? 0) + (mark["/gone"] ?? 0) + 2);
    t.s.closeAllConnections(); t.s.close();
  });
});
