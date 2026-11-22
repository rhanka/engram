import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export type ScrapStatus = "ok" | "dns" | "timeout" | "http_4xx" | "http_5xx" | "robots_denied" | "blocked_antibot" | "empty_js_shell" | "invalid_url" | "invalid_input";
export type SchemeFallback = "none" | "http";
export interface ScrapPage { url: string; final_url: string; status: number; bytes: number; sha256: string }
export interface ScrapRecord { id: string; url: string; final_url: string; status: ScrapStatus; captured_at: string; pages: ScrapPage[]; robots: "respected" | "overridden"; normalized_from?: string; raw_url?: string; reason?: string; input_line?: number; raw_input?: string }
export interface CaptureOptions { input: string; out: string; robots?: string; concurrency?: number; retryFailed?: boolean; timeoutMs?: number; gapMs?: number; schemeFallback?: SchemeFallback }
export interface CaptureSummary { inputs: number; states: number; skipped_blank: number; skipped_header: number; by_state: Partial<Record<ScrapStatus, number>> }
export type UrlNorm = { ok: true; url: string; normalizedFrom?: string; schemeAdded: boolean } | { ok: false; reason: string };
type Ctx = CaptureOptions & { t: number; gap: number; lastHit: Record<string, number>; robotsCache: Record<string, { a: string[]; d: string[] }>; robotsFlight: Record<string, Promise<{ a: string[]; d: string[] }>> };
const KW = /contact|about|[aà][- ]?propos|apropos|nous[- ]joindre|location|adresse/i;
const CHAL = /just a moment|attention required|cf-chl|datadome|perimeterx|arkose|__cf_bm|captcha|challenge-platform/i;
const STRONG = /just a moment|attention required|cf-chl/i;
const HOST_PORT = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[^\]]+\]|[^/:?#\s]+\.[^/:?#\s]+):\d{1,5}(?:[/?#]|$)/i;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const LABEL_U = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/i;
const FINAL_INVALID: ReadonlySet<string> = new Set(["invalid_url", "invalid_input"]);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const reg = (h: string): string => h.toLowerCase();
const textOf = (h: string): string => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
function validHost(host: string, schemeAdded: boolean, rawHost: string): boolean {
  if (!host) return false;
  if ((host.startsWith("[") && host.endsWith("]")) || host === "localhost") return true;
  if (IPV4.test(host)) return !schemeAdded || IPV4.test(rawHost);
  const labels = (host.endsWith(".") ? host.slice(0, -1) : host).split(".");
  return schemeAdded ? labels.length >= 2 && !/^\d+$/.test(labels[labels.length - 1]!) && labels.every((l) => LABEL.test(l)) : labels.every((l) => LABEL_U.test(l));
}
export function normalizeUrl(raw: string): UrlNorm {
  if (!raw) return { ok: false, reason: "empty url" };
  if (/[\s\\\u0000-\u001f\u007f]/.test(raw)) return { ok: false, reason: "whitespace or invalid characters" };
  let cand = raw, schemeAdded = false;
  if (/^https?:\/\//i.test(raw)) { if (/^https?:\/\/\//i.test(raw)) return { ok: false, reason: "empty host" }; cand = raw.replace(/^https?/i, (s) => s.toLowerCase()); }
  else if (raw.startsWith("//")) { if (raw.startsWith("///")) return { ok: false, reason: "empty host" }; cand = `https:${raw}`; schemeAdded = true; }
  else if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !HOST_PORT.test(raw)) return { ok: false, reason: "unsupported scheme" };
  else { cand = `https://${raw}`; schemeAdded = true; }
  let u: URL; try { u = new URL(cand); } catch { return { ok: false, reason: "malformed url" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "unsupported scheme" };
  if (schemeAdded && (u.username || u.password)) return { ok: false, reason: "userinfo in scheme-less url" };
  const authStart = cand.indexOf("://") + 3, rawAuth = cand.slice(authStart).split(/[/?#]/, 1)[0] ?? "";
  const at = rawAuth.lastIndexOf("@"), hp = at === -1 ? rawAuth : rawAuth.slice(at + 1);
  const rawHost = hp.startsWith("[") ? hp.slice(0, hp.indexOf("]") + 1) : (hp.split(":")[0] ?? "");
  if (!validHost(u.hostname, schemeAdded, rawHost)) return { ok: false, reason: "invalid host" };
  const hostStart = authStart + (at === -1 ? 0 : at + 1);
  const normUrl = cand.slice(0, hostStart) + rawHost.toLowerCase() + cand.slice(hostStart + rawHost.length);
  return { ok: true, url: normUrl, ...(schemeAdded ? { normalizedFrom: raw } : {}), schemeAdded };
}
export function assertCaptureInvariant(s: CaptureSummary): void {
  const sum = Object.values(s.by_state).reduce((a, b) => a + (b ?? 0), 0);
  if (s.states !== sum || s.inputs !== s.states + s.skipped_blank + s.skipped_header)
    throw new Error(`scrap capture invariant failed: inputs=${s.inputs} states=${s.states} sum=${sum} skipped_blank=${s.skipped_blank} skipped_header=${s.skipped_header}`);
}
async function raw(u: string, o: Ctx, n: { c: number }): Promise<{ s: number; b: Buffer; url: string } | { err: string; connectFail?: boolean }> {
  let url = u;
  for (let i = 0; i <= 3; i++) {
    if (n.c >= 8) return { err: "cap" }; n.c++;
    const w = new URL(url), now = Date.now(), at = Math.max(now, (o.lastHit[w.hostname] ?? 0) + o.gap);
    o.lastHit[w.hostname] = at; const wait = at - now;
    if (wait > 0) await sleep(wait);
    const c = new AbortController(), to = setTimeout(() => c.abort(), o.t);
    let gotResp = false;
    try {
      const r = await fetch(url, { signal: c.signal, redirect: "manual" });
      gotResp = true;
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        await r.arrayBuffer();
        const loc = r.headers.get("location");
        if (!loc || i === 3) return { err: "dns" };
        try { url = new URL(loc, url).toString(); } catch { return { err: "dns" }; }
        continue;
      }
      const buf = await r.arrayBuffer();
      return { s: r.status, b: Buffer.from(buf), url };
    } catch (e) {
      const cs = (e as { cause?: { code?: string; errors?: unknown } }).cause;
      const errs = Array.isArray(cs?.errors) ? cs.errors : Array.isArray((e as { errors?: unknown }).errors) ? (e as { errors: unknown[] }).errors : [];
      const sub = errs.map((x) => `${(x as { code?: string })?.code ?? ""} ${(x as { message?: string })?.message ?? x ?? ""}`).join(" ");
      const m = `${cs?.code ?? (e as { code?: string }).code ?? ""} ${cs ?? ""} ${sub} ${e}`;
      return { err: /abort|timeout|timedout/i.test(m) ? "timeout" : "dns", connectFail: i === 0 && !gotResp && !/ENOTFOUND|EAI_AGAIN|EAI_NONAME/i.test(m) };
    } finally { clearTimeout(to); }
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
async function one(id: string, url: string, o: Ctx, normalizedFrom?: string, schemeAdded = false): Promise<ScrapRecord> {
  const st: ScrapPage[] = [], over = o.robots === "ignore", n = { c: 0 };
  const rec = (status: ScrapStatus, final = url): ScrapRecord => ({ id, url, final_url: final, status, captured_at: new Date().toISOString(), pages: st, robots: over ? "overridden" : "respected", ...(normalizedFrom !== undefined ? { normalized_from: normalizedFrom } : {}) });
  const put = (u: string, r: { s: number; b: Buffer; url: string }): void => { st.push({ url: u, final_url: r.url, status: r.s, bytes: r.b.length, sha256: snap(o.out, r.b) }); };
  let cur = url, home: Awaited<ReturnType<typeof raw>>;
  if (!over && await denied(cur, o, n)) return rec("robots_denied");
  try { home = await raw(cur, o, n); } catch { return rec("dns"); }
  if ("err" in home && home.connectFail && o.schemeFallback === "http" && schemeAdded && cur.startsWith("https://")) {
    cur = `http://${cur.slice("https://".length)}`;
    if (!over && await denied(cur, o, n)) return rec("robots_denied", cur);
    try { home = await raw(cur, o, n); } catch { return rec("dns", cur); }
  }
  if ("err" in home) return rec(home.err === "timeout" ? "timeout" : "dns", cur);
  const txt = home.b.toString("utf-8"); put(cur, home);
  if (home.s === 403 || home.s === 429 ? CHAL.test(txt) : STRONG.test(txt)) return rec("blocked_antibot", home.url);
  if (home.s >= 500) return rec("http_5xx", home.url);
  if (home.s >= 400) return rec("http_4xx", home.url);
  if (home.s < 200 || home.s >= 300) return rec("http_5xx", home.url);
  if (/<script/i.test(txt) && textOf(txt).length < 300) return rec("empty_js_shell", home.url);
  for (const l of links(txt, home.url)) { if (st.length >= 3) break; if (!over && await denied(l, o, n)) continue; let r: Awaited<ReturnType<typeof raw>>; try { r = await raw(l, o, n); } catch { continue; } if (!("err" in r)) put(l, r); }
  return rec("ok", home.url);
}
const sameInvalid = (prev: ScrapRecord, rawInput: string, rawUrl: string): boolean => prev.raw_input !== undefined ? prev.raw_input === rawInput : (prev.raw_url ?? prev.url) === rawUrl;
export async function runCapture(oc: CaptureOptions): Promise<CaptureSummary> {
  const o: Ctx = { t: oc.timeoutMs ?? 15000, gap: oc.gapMs ?? 1000, ...oc, lastHit: {}, robotsCache: {}, robotsFlight: {} };
  const rawText = readFileSync(o.input, "utf-8").replace(/^\uFEFF/, "");
  const lines = rawText === "" ? [] : rawText.replace(/\r?\n$/, "").split(/\r?\n/), firstIdx = lines.findIndex((l) => l.trim() !== "");
  const csv = firstIdx !== -1 && /^id\s*,\s*url\s*$/i.test(lines[firstIdx]!.trim()), sf = join(o.out, "state.jsonl"), robots = o.robots === "ignore" ? "overridden" : "respected";
  const doneById = new Map<string, ScrapRecord>(), doneInvRaw = new Map<string, number>(), doneInvKey = new Map<string, number>();
  if (existsSync(sf)) for (const l of readFileSync(sf, "utf-8").split("\n")) {
    if (!l.trim()) continue;
    let r: ScrapRecord; try { r = JSON.parse(l); } catch { continue; }
    if (r.status === "invalid_input") {
      if (r.raw_input !== undefined) doneInvRaw.set(r.raw_input, (doneInvRaw.get(r.raw_input) ?? 0) + 1);
      else { const k = `${r.id ?? ""}\0${r.raw_url ?? r.url ?? ""}`; doneInvKey.set(k, (doneInvKey.get(k) ?? 0) + 1); }
    } else if (typeof r.id === "string") doneById.set(r.id, r);
  }
  const seen = new Set<string>(), todo: { lineNo: number; id: string; url: string; normalizedFrom?: string; schemeAdded: boolean }[] = [];
  const invalidToWrite: { lineNo: number; rec: ScrapRecord }[] = [], lineStates = new Map<number, ScrapStatus>();
  let skippedBlank = 0, skippedHeader = 0;
  const makeInvalid = (lineNo: number, status: "invalid_url" | "invalid_input", id: string, rawUrl: string, reason: string, rawInput: string): ScrapRecord => ({ id, url: rawUrl, final_url: "", status, reason, raw_url: rawUrl, input_line: lineNo, raw_input: rawInput, captured_at: new Date().toISOString(), pages: [], robots });
  const pushInvalidInput = (lineNo: number, id: string, rawUrl: string, reason: string, c: string): void => {
    const nr = doneInvRaw.get(c) ?? 0;
    if (nr > 0) { doneInvRaw.set(c, nr - 1); lineStates.set(lineNo, "invalid_input"); return; }
    const k = `${id}\0${rawUrl}`, nk = doneInvKey.get(k) ?? 0;
    if (nk > 0) { doneInvKey.set(k, nk - 1); lineStates.set(lineNo, "invalid_input"); return; }
    invalidToWrite.push({ lineNo, rec: makeInvalid(lineNo, "invalid_input", id, rawUrl, reason, c) });
  };
  lines.forEach((ln, ix) => {
    const lineNo = ix + 1, c = ln.trim();
    if (!c) { skippedBlank++; return; }
    if (csv && ix === firstIdx) { skippedHeader++; return; }
    let id: string, rawUrl: string, norm: UrlNorm;
    if (csv) {
      const ci = c.indexOf(",");
      if (ci === -1) { pushInvalidInput(lineNo, "", "", "missing comma", c); return; }
      id = c.slice(0, ci).trim(); rawUrl = c.slice(ci + 1).trim();
      if (!id) { pushInvalidInput(lineNo, "", rawUrl, "empty id", c); return; }
      if (seen.has(id)) { pushInvalidInput(lineNo, id, rawUrl, "duplicate id", c); return; }
      seen.add(id); norm = normalizeUrl(rawUrl);
    } else {
      rawUrl = c; norm = normalizeUrl(rawUrl); id = norm.ok ? norm.url : rawUrl;
      if (seen.has(id)) { pushInvalidInput(lineNo, id, rawUrl, "duplicate id", c); return; }
      seen.add(id);
    }
    const prev = doneById.get(id);
    if (!norm.ok) {
      if (prev?.status === "invalid_url" && sameInvalid(prev, c, rawUrl)) lineStates.set(lineNo, "invalid_url");
      else invalidToWrite.push({ lineNo, rec: makeInvalid(lineNo, "invalid_url", id, rawUrl, norm.reason, c) });
      return;
    }
    const needsRun = !prev || (prev.status === "invalid_url" && !sameInvalid(prev, c, rawUrl)) || (o.retryFailed === true && prev.status !== "ok" && !FINAL_INVALID.has(prev.status));
    if (!needsRun) { lineStates.set(lineNo, prev.status); return; }
    todo.push({ lineNo, id, url: norm.url, normalizedFrom: norm.normalizedFrom, schemeAdded: norm.schemeAdded });
  });
  mkdirSync(o.out, { recursive: true });
  for (const inv of invalidToWrite) { appendFileSync(sf, `${JSON.stringify(inv.rec)}\n`); lineStates.set(inv.lineNo, inv.rec.status); }
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, o.concurrency ?? 4), Math.max(todo.length, 1)) }, async () => {
    while (i < todo.length) {
      const j = todo[i++]!; let rec: ScrapRecord;
      try { rec = await one(j.id, j.url, o, j.normalizedFrom, j.schemeAdded); }
      catch { rec = { id: j.id, url: j.url, final_url: j.url, status: "dns", captured_at: new Date().toISOString(), pages: [], robots, ...(j.normalizedFrom !== undefined ? { normalized_from: j.normalizedFrom } : {}) }; }
      appendFileSync(sf, `${JSON.stringify(rec)}\n`); lineStates.set(j.lineNo, rec.status);
    }
  }));
  const by_state: Partial<Record<ScrapStatus, number>> = {};
  for (const st of lineStates.values()) by_state[st] = (by_state[st] ?? 0) + 1;
  const summary: CaptureSummary = { inputs: lines.length, states: lineStates.size, skipped_blank: skippedBlank, skipped_header: skippedHeader, by_state };
  assertCaptureInvariant(summary);
  const parts = Object.entries(by_state).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(`scrap capture summary: inputs=${summary.inputs} states=${summary.states} skipped_blank=${summary.skipped_blank} skipped_header=${summary.skipped_header}${parts ? ` ${parts}` : ""}`);
  return summary;
}
