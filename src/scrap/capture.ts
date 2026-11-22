import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export type ScrapStatus = "ok" | "dns" | "timeout" | "http_4xx" | "http_5xx" | "robots_denied" | "blocked_antibot" | "empty_js_shell";
export interface ScrapPage { url: string; final_url: string; status: number; bytes: number; sha256: string }
export interface ScrapRecord { id: string; url: string; final_url: string; status: ScrapStatus; captured_at: string; pages: ScrapPage[]; robots: "respected" | "overridden" }
export interface CaptureOptions { input: string; out: string; robots?: string; concurrency?: number; retryFailed?: boolean; timeoutMs?: number; gapMs?: number }
type Ctx = CaptureOptions & { t: number; gap: number };
const KW = /contact|about|a-propos|apropos|nous[- ]joindre|location|adresse/i;
const CHAL = /just a moment|attention required|cf-chl|datadome|perimeterx|arkose|__cf_bm|captcha|challenge-platform/i;
const STRONG = /just a moment|attention required|cf-chl/i;
const lastHit: Record<string, number> = {}, robotsCache: Record<string, string[]> = {};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const reg = (h: string): string => h.toLowerCase().split(".").slice(-2).join(".");
const textOf = (h: string): string => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
async function raw(u: string, o: Ctx, n: { c: number }): Promise<{ s: number; b: Buffer; url: string } | { err: string }> {
  let url = u;
  for (let i = 0; i <= 3; i++) {
    if (n.c >= 8) return { err: "cap" }; n.c++;
    const w = new URL(url), wait = (lastHit[w.hostname] ?? 0) + o.gap - Date.now();
    if (wait > 0) await sleep(wait); lastHit[w.hostname] = Date.now();
    const c = new AbortController(), to = setTimeout(() => c.abort(), o.t);
    let r: Response;
    try { r = await fetch(url, { signal: c.signal, redirect: "manual" }); } catch (e) { const m = `${(e as { cause?: unknown }).cause ?? ""} ${e}`; return { err: /abort|timeout|timedout/i.test(m) ? "timeout" : "dns" }; } finally { clearTimeout(to); }
    if ([301, 302, 303, 307, 308].includes(r.status)) { await r.arrayBuffer(); const loc = r.headers.get("location"); if (!loc || i === 3) return { err: "dns" }; url = new URL(loc, url).toString(); continue; }
    return { s: r.status, b: Buffer.from(await r.arrayBuffer()), url };
  }
  return { err: "dns" };
}
async function denied(u: string, o: Ctx, n: { c: number }): Promise<boolean> {
  const w = new URL(u);
  if (!(w.origin in robotsCache)) {
    const rules: string[] = [], r = await raw(`${w.origin}/robots.txt`, o, n);
    if (!("err" in r) && r.s === 200) { let self = false; for (const ln of r.b.toString("utf-8").split("\n")) { const m = ln.match(/^\s*(user-agent|disallow)\s*:\s*(.*?)\s*$/i); if (!m) continue; if (m[1]!.toLowerCase() === "user-agent") self = m[2] === "*" || /wget|engram|crawl|bot|spider/i.test(m[2]!); else if (self && m[2]) rules.push(m[2]); } }
    robotsCache[w.origin] = rules;
  }
  return (robotsCache[w.origin] ?? []).some((d) => d === "/" || w.pathname.startsWith(d));
}
function links(html: string, base: string): string[] {
  const out: string[] = [], bh = reg(new URL(base).hostname);
  for (const m of html.matchAll(/<a\s[^>]*?href=(["'])(.*?)\1[^>]*?>([\s\S]*?)<\/a\s*>/gi)) {
    let a: URL; try { a = new URL(m[2]!, base); } catch { continue; }
    if (a.protocol !== "http:" && a.protocol !== "https:") continue;
    if (reg(a.hostname) !== bh || out.includes(a.toString())) continue;
    if (out.length < 2 && (KW.test(a.pathname) || KW.test(textOf(m[3] ?? "")))) out.push(a.toString());
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
  const home = await raw(url, o, n);
  if ("err" in home) return rec(home.err === "timeout" ? "timeout" : "dns");
  const txt = home.b.toString("utf-8"); put(url, home);
  if (home.s === 403 || home.s === 429 ? CHAL.test(txt) : STRONG.test(txt)) return rec("blocked_antibot", home.url);
  if (home.s >= 500) return rec("http_5xx", home.url);
  if (home.s >= 400) return rec("http_4xx", home.url);
  if (home.s !== 200) return rec("http_5xx", home.url);
  if (/<script/i.test(txt) && textOf(txt).length < 300) return rec("empty_js_shell", home.url);
  for (const l of links(txt, home.url)) { if (st.length >= 3) break; if (!over && await denied(l, o, n)) continue; const r = await raw(l, o, n); if (!("err" in r)) put(l, r); }
  return rec("ok", home.url);
}
export async function runCapture(oc: CaptureOptions): Promise<void> {
  const o: Ctx = { t: oc.timeoutMs ?? 15000, gap: oc.gapMs ?? 1000, ...oc };
  const lines = readFileSync(o.input, "utf-8").split("\n"), first = lines.find((l) => l.trim()) ?? "";
  const csv = /^id\s*,\s*url\s*$/i.test(first.trim()), jobs: { id: string; url: string }[] = [], seen = new Set<string>();
  lines.forEach((ln, ix) => {
    const c = ln.trim(); if (!c) { console.error(`scrap: line ${ix + 1} blank, skipped`); return; }
    if (csv && ln === first) return;
    const ci = c.indexOf(","), id = (csv ? c.slice(0, ci) : c).trim(), url = (csv ? c.slice(ci + 1) : c).trim();
    try { const u = new URL(url); if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("u"); } catch { console.error(`scrap: line ${ix + 1} bad url, skipped`); return; }
    if (seen.has(id) || seen.has(`url:${url}`)) { console.error(`scrap: line ${ix + 1} duplicate, skipped`); return; }
    seen.add(id); seen.add(`url:${url}`); jobs.push({ id, url });
  });
  const done: Record<string, string> = {}, sf = join(o.out, "state.jsonl");
  if (existsSync(sf)) for (const l of readFileSync(sf, "utf-8").split("\n")) { if (!l.trim()) continue; try { const r = JSON.parse(l); done[r.id] = r.status; } catch { /* keep prior */ } }
  const todo = jobs.filter((j) => !(j.id in done) || (o.retryFailed === true && done[j.id] !== "ok"));
  mkdirSync(o.out, { recursive: true }); let i = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, o.concurrency ?? 4), Math.max(todo.length, 1)) }, async () => { while (i < todo.length) { const j = todo[i++]!; appendFileSync(sf, `${JSON.stringify(await one(j.id, j.url, o))}\n`); } }));
}
