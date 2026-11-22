import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export type ScrapStatus = "ok" | "dns" | "timeout" | "http_4xx" | "http_5xx" | "robots_denied" | "blocked_antibot" | "empty_js_shell";
export interface ScrapPage { url: string; final_url: string; status: number; bytes: number; sha256: string }
export interface ScrapRecord { id: string; url: string; final_url: string; status: ScrapStatus; captured_at: string; pages: ScrapPage[]; robots: "respected" | "overridden" }
export interface CaptureOptions { input: string; out: string; robots?: string; concurrency?: number; retryFailed?: boolean; timeoutMs?: number; gapMs?: number }
type Ctx = CaptureOptions & { t: number; gap: number; lastHit: Record<string, number>; robotsCache: Record<string, { a: string[]; d: string[] }>; robotsFlight: Record<string, Promise<{ a: string[]; d: string[] }>> };
const KW = /contact|about|[aà][- ]?propos|apropos|nous[- ]joindre|location|adresse/i;
const CHAL = /just a moment|attention required|cf-chl|datadome|perimeterx|arkose|__cf_bm|captcha|challenge-platform/i;
const STRONG = /just a moment|attention required|cf-chl/i;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const reg = (h: string): string => h.toLowerCase();
const textOf = (h: string): string => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
async function raw(u: string, o: Ctx, n: { c: number }): Promise<{ s: number; b: Buffer; url: string } | { err: string }> {
  let url = u;
  for (let i = 0; i <= 3; i++) {
    if (n.c >= 8) return { err: "cap" }; n.c++;
    const w = new URL(url), now = Date.now(), at = Math.max(now, (o.lastHit[w.hostname] ?? 0) + o.gap);
    o.lastHit[w.hostname] = at; const wait = at - now;
    if (wait > 0) await sleep(wait);
    const c = new AbortController(), to = setTimeout(() => c.abort(), o.t);
    try {
      const r = await fetch(url, { signal: c.signal, redirect: "manual" });
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        await r.arrayBuffer();
        const loc = r.headers.get("location");
        if (!loc || i === 3) return { err: "dns" };
        try { url = new URL(loc, url).toString(); } catch { return { err: "dns" }; }
        continue;
      }
      const buf = await r.arrayBuffer();
      return { s: r.status, b: Buffer.from(buf), url };
    } catch (e) { const m = `${(e as { cause?: unknown }).cause ?? ""} ${e}`; return { err: /abort|timeout|timedout/i.test(m) ? "timeout" : "dns" }; } finally { clearTimeout(to); }
  }
  return { err: "dns" };
}
function parseRobots(body: string): { a: string[]; d: string[] } {
  const a: string[] = [], d: string[] = [];
  let self = false, fresh = true;
  for (const rawLn of body.split("\n")) {
    const ln = rawLn.split("#")[0] ?? "";
    const m = ln.match(/^\s*(user-agent|allow|disallow)\s*:\s*(.*?)\s*$/i);
    if (!m) {
      // Any other directive (e.g. Crawl-delay:) ends the User-agent section,
      // so a following User-agent: line starts a new group (RFC 9309).
      if (/^\s*[a-zA-Z][a-zA-Z0-9_-]*\s*:/.test(ln)) fresh = false;
      continue;
    }
    const k = m[1]!.toLowerCase(), v = (m[2] ?? "").trim();
    if (k === "user-agent") {
      if (!fresh) { self = false; fresh = true; }
      const t = v.toLowerCase();
      if (t === "*" || t.includes("engram") || t.includes("wget")) self = true;
      continue;
    }
    fresh = false;
    if (!self || !v) continue;
    if (k === "allow") a.push(v); else d.push(v);
  }
  return { a, d };
}
async function denied(u: string, o: Ctx, n: { c: number }): Promise<boolean> {
  const w = new URL(u);
  let rules = o.robotsCache[w.origin];
  if (!rules) {
    // Share one in-flight fetch per origin: concurrent first-wave workers
    // would otherwise fetch /robots.txt redundantly before the cache fills.
    let flight = o.robotsFlight[w.origin];
    if (!flight) {
      flight = (async (): Promise<{ a: string[]; d: string[] }> => {
        const r = await raw(`${w.origin}/robots.txt`, o, n);
        if (!("err" in r) && r.s === 200) return parseRobots(r.b.toString("utf-8"));
        return { a: [], d: [] };
      })();
      o.robotsFlight[w.origin] = flight;
    }
    rules = o.robotsCache[w.origin] = await flight;
  }
  let best: { len: number; allow: boolean } | null = null;
  for (const d of rules.d) {
    if (d === "/" || w.pathname.startsWith(d)) {
      if (!best || d.length > best.len) best = { len: d.length, allow: false };
    }
  }
  for (const a of rules.a) {
    if (w.pathname.startsWith(a)) {
      // RFC 9309 §2.2.2: on equal-length Allow/Disallow matches, Allow wins.
      if (!best || a.length >= best.len) best = { len: a.length, allow: true };
    }
  }
  return best !== null && !best.allow;
}
function links(html: string, base: string): string[] {
  const out: string[] = [], bh = reg(new URL(base).hostname);
  const home = (() => { try { const u = new URL(base); u.hash = ""; return u.toString(); } catch { return base; } })();
  for (const m of html.matchAll(/<a\s[^>]*?href=(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*?>([\s\S]*?)<\/a\s*>/gi)) {
    const href = m[1] ?? m[2] ?? m[3] ?? "";
    let a: URL; try { a = new URL(href, base); } catch { continue; }
    if (a.protocol !== "http:" && a.protocol !== "https:") continue;
    a.hash = "";
    if (reg(a.hostname) !== bh || out.includes(a.toString())) continue;
    if (a.toString() === home) continue;
    if (out.length < 2 && (KW.test(a.pathname) || KW.test(textOf(m[4] ?? "")))) out.push(a.toString());
  }
  return out;
}
function snap(out: string, b: Buffer): string {
  const sha = createHash("sha256").update(b).digest("hex"), p = join(out, "snapshots", `${sha}.html`);
  if (!existsSync(p)) { mkdirSync(join(out, "snapshots"), { recursive: true }); writeFileSync(p, b); }
  return sha;
}
async function one(id: string, url: string, o: Ctx): Promise<ScrapRecord> {
  const st: ScrapPage[] = [], over = o.robots === "ignore", n = { c: 0 };
  const rec = (status: ScrapStatus, final = url): ScrapRecord => ({ id, url, final_url: final, status, captured_at: new Date().toISOString(), pages: st, robots: over ? "overridden" : "respected" });
  const put = (u: string, r: { s: number; b: Buffer; url: string }): void => { st.push({ url: u, final_url: r.url, status: r.s, bytes: r.b.length, sha256: snap(o.out, r.b) }); };
  if (!over && await denied(url, o, n)) return rec("robots_denied");
  let home: Awaited<ReturnType<typeof raw>>;
  try { home = await raw(url, o, n); } catch { return rec("dns"); }
  if ("err" in home) return rec(home.err === "timeout" ? "timeout" : "dns");
  const txt = home.b.toString("utf-8"); put(url, home);
  if (home.s === 403 || home.s === 429 ? CHAL.test(txt) : STRONG.test(txt)) return rec("blocked_antibot", home.url);
  if (home.s >= 500) return rec("http_5xx", home.url);
  if (home.s >= 400) return rec("http_4xx", home.url);
  if (home.s < 200 || home.s >= 300) return rec("http_5xx", home.url);
  if (/<script/i.test(txt) && textOf(txt).length < 300) return rec("empty_js_shell", home.url);
  for (const l of links(txt, home.url)) { if (st.length >= 3) break; if (!over && await denied(l, o, n)) continue; let r: Awaited<ReturnType<typeof raw>>; try { r = await raw(l, o, n); } catch { continue; } if (!("err" in r)) put(l, r); }
  return rec("ok", home.url);
}
export async function runCapture(oc: CaptureOptions): Promise<void> {
  const o: Ctx = { t: oc.timeoutMs ?? 15000, gap: oc.gapMs ?? 1000, ...oc, lastHit: {}, robotsCache: {}, robotsFlight: {} };
  const lines = readFileSync(o.input, "utf-8").split("\n"), first = lines.find((l) => l.trim()) ?? "";
  const csv = /^id\s*,\s*url\s*$/i.test(first.trim()), jobs: { id: string; url: string }[] = [], seen = new Set<string>();
  lines.forEach((ln, ix) => {
    const c = ln.trim(); if (!c) { console.error(`scrap: line ${ix + 1} blank, skipped`); return; }
    if (csv && ln === first) return;
    const ci = c.indexOf(",");
    if (csv && ci === -1) { console.error(`scrap: line ${ix + 1} bad url, skipped`); return; }
    const id = (csv ? c.slice(0, ci) : c).trim(), url = (csv ? c.slice(ci + 1) : c).trim();
    try { const u = new URL(url); if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("u"); } catch { console.error(`scrap: line ${ix + 1} bad url, skipped`); return; }
    if (seen.has(id) || seen.has(`url:${url}`)) { console.error(`scrap: line ${ix + 1} duplicate, skipped`); return; }
    seen.add(id); seen.add(`url:${url}`); jobs.push({ id, url });
  });
  const done: Record<string, string> = {}, sf = join(o.out, "state.jsonl");
  if (existsSync(sf)) for (const l of readFileSync(sf, "utf-8").split("\n")) { if (!l.trim()) continue; try { const r = JSON.parse(l); done[r.id] = r.status; } catch { /* keep prior */ } }
  const todo = jobs.filter((j) => !(j.id in done) || (o.retryFailed === true && done[j.id] !== "ok"));
  mkdirSync(o.out, { recursive: true }); let i = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, o.concurrency ?? 4), Math.max(todo.length, 1)) }, async () => { while (i < todo.length) { const j = todo[i++]!; let rec: ScrapRecord; try { rec = await one(j.id, j.url, o); } catch { rec = { id: j.id, url: j.url, final_url: j.url, status: "dns", captured_at: new Date().toISOString(), pages: [], robots: o.robots === "ignore" ? "overridden" : "respected" }; } appendFileSync(sf, `${JSON.stringify(rec)}\n`); } }));
}
