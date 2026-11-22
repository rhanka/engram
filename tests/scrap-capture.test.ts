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
