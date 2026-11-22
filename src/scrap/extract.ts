import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createDirectTextJsonClient, directProviderCredentialEnv, parseJsonFromLlmText, type DirectLlmProvider } from "../llm-execution.js";
import { isSeatAcquisitionError } from "../llm-mesh-bridge.js";
export interface MissionField { name: string; max_values?: number }
export interface PriceTable { source: string; as_of: string; per_million: { input: number; output: number; reasoning?: number } }
export interface ExtractOptions { out: string; mission: string; model: string; tokenCap?: number; retryFailed?: boolean }
export interface Mission { fields: (string | MissionField)[]; instruction: string; tokenCap?: number; reasoning_budget_tokens?: number; price_table?: PriceTable }
export type ExtractErrorCode = "missing_credentials" | "llm_error" | "parse_error" | "empty_response" | "write_error";
// Minimal structural client: the real TextJsonGenerationClient satisfies it, and
// stubs mimic the real client by answering through validateResponse in memory.
export interface ExtractClient {
  generateJson(input: { schema: string; prompt: string; maxOutputTokens?: number; validateResponse?: (text: string) => void | Promise<void> }): Promise<{ audit?: unknown; text?: unknown }>;
}
export interface MeshClientDeps {
  createMeshClient?: (alias: string) => Promise<{ client: ExtractClient; effort?: string }>;
}
// Usage errors the CLI maps to exit 2 (bad invocation, unknown model, no
// credentials, no mesh seat): raised before any provider request is made.
export function isExtractUsageError(e: unknown): boolean {
  return /cannot infer provider|missing credentials|unknown mesh alias|no usable mesh seat|no seat executor/.test(String(e));
}
type FieldSpec = { name: string; maxValues: number };
type TokenCounts = { input: number; output: number; reasoning: number; total: number };
const textOf = (h: string): string => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const num = (v: unknown): number | undefined => typeof v === "number" && Number.isFinite(v) ? v : undefined;
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const KNOWN: string[] = ["anthropic", "openai", "gemini", "mistral", "cohere"];
const GUESS: Record<string, DirectLlmProvider> = { claude: "anthropic", gpt: "openai", o1: "openai", o3: "openai", o4: "openai", gemini: "gemini", mistral: "mistral", ministral: "mistral", codestral: "mistral", cohere: "cohere", command: "cohere" };
export function providerOf(model: string): { provider: DirectLlmProvider; name: string } {
  const m = model.match(/^([a-z0-9_-]+)[:/](.+)$/i);
  if (m && KNOWN.includes(m[1]!.toLowerCase())) return { provider: m[1]!.toLowerCase() as DirectLlmProvider, name: m[2]! };
  const g = GUESS[model.split("-")[0]!.toLowerCase()];
  if (g) return { provider: g, name: model };
  throw new Error(`scrap extract: cannot infer provider from model ${JSON.stringify(model)} (use provider:model)`);
}
const specsOf = (m: Mission): FieldSpec[] => m.fields.map((f) => typeof f === "string"
  ? { name: f, maxValues: 1 }
  : { name: f.name, maxValues: Math.min(5, Math.max(1, num(f.max_values) !== undefined ? Math.floor(f.max_values!) : 1)) });
export function buildPrompt(m: Mission, names: string[], text: string): string {
  const specs = specsOf(m);
  if (!specs.some((f) => f.maxValues > 1)) {
    return `${m.instruction}\nFields: ${names.join(", ")}\nReturn a JSON object with one entry per field: {"value": string|null, "quote": string|null} where quote is copied verbatim from the page text below.\n\n${text}`;
  }
  const list = specs.map((f) => f.maxValues > 1 ? `${f.name} (array of up to ${f.maxValues})` : f.name).join(", ");
  return `${m.instruction}\nFields: ${list}\nReturn a JSON object with one entry per field: single-value fields as {"value": string|null, "quote": string|null}; multi-value fields as an array of up to max_values objects [{"value": string, "quote": string}] (or [] if none). Every quote must be copied verbatim from the page text below.\n\n${text}`;
}
function usageCounts(raw: unknown): TokenCounts | null {
  if (!isObj(raw)) return null;
  const i = num(raw.inputTokens) ?? num(raw.input) ?? num(raw.promptTokens), o = num(raw.outputTokens) ?? num(raw.output) ?? num(raw.completionTokens);
  const r = num(raw.reasoningTokens) ?? num(raw.thoughtsTokenCount) ?? num(raw.reasoning) ?? 0, t = num(raw.totalTokens) ?? num(raw.total);
  if (i === undefined && o === undefined && t === undefined) return null;
  const inp = i ?? 0, out = o ?? 0;
  return { input: inp, output: out, reasoning: r, total: t ?? (inp + out + r) };
}
function mergeUsage(a: unknown, b: unknown): unknown {
  if (!isObj(a)) return b;
  if (!isObj(b)) return a;
  const out: Record<string, number> = {};
  for (const src of [a, b]) for (const [k, v] of Object.entries(src)) if (num(v) !== undefined) out[k] = (out[k] ?? 0) + (v as number);
  return out;
}
function validPriceTable(pt: unknown): PriceTable | null {
  if (!isObj(pt) || typeof pt.source !== "string" || !pt.source.trim() || typeof pt.as_of !== "string" || !isObj(pt.per_million)) return null;
  const asOf = pt.as_of.trim(), pm = pt.per_million, ok = (v: unknown): v is number => num(v) !== undefined && (v as number) >= 0;
  if (!/\d{4}/.test(asOf) || !Number.isFinite(Date.parse(asOf)) || (/^\d{4}-\d{2}-\d{2}$/.test(asOf) && new Date(asOf).toISOString().slice(0, 10) !== asOf) || !ok(pm.input) || !ok(pm.output) || (pm.reasoning !== undefined && !ok(pm.reasoning))) return null;
  return { source: pt.source.trim(), as_of: asOf, per_million: { input: pm.input, output: pm.output, ...(pm.reasoning !== undefined ? { reasoning: pm.reasoning } : {}) } };
}
function apiEquivalent(pt: PriceTable | null, u: TokenCounts | null): number | "unknown" {
  if (!pt || !u) return "unknown";
  if (u.reasoning > 0 && pt.per_million.reasoning === undefined) return "unknown";
  return Number(((u.input * pt.per_million.input + u.output * pt.per_million.output + u.reasoning * (pt.per_million.reasoning ?? 0)) / 1_000_000).toFixed(9));
}
export async function runExtract(oc: ExtractOptions, client?: ExtractClient, deps?: MeshClientDeps): Promise<void> {
  const mission = JSON.parse(readFileSync(oc.mission, "utf-8")) as Mission;
  const specs = specsOf(mission), names = specs.map((f) => f.name);
  const meshAlias = oc.model.startsWith("mesh:") ? oc.model.slice("mesh:".length) : null;
  const pm = meshAlias === null ? providerOf(oc.model) : null;
  if (meshAlias !== null && !client && !deps?.createMeshClient) await import("./mesh-host.js").then((m) => m.resolveMeshAlias(meshAlias));
  // char budget (UTF-16 code units, not tokens): slice keeps prompts bounded without a tokenizer.
  const cap = oc.tokenCap ?? mission.tokenCap ?? 24000;
  const latest = new Map<string, { status: string; pages?: { sha256: string }[]; id: string; url: string }>();
  for (const line of readFileSync(join(oc.out, "state.jsonl"), "utf-8").split("\n")) {
    if (!line.trim()) continue;
    let s: { id?: string; status?: string } & Record<string, unknown>;
    try { s = JSON.parse(line); } catch { continue; }
    if (typeof s.id !== "string") continue;
    latest.set(s.id, s as { status: string; id: string; url: string });
  }
  const resPath = join(oc.out, "results.ndjson");
  const lastErr = new Map<string, string | null>();
  if (existsSync(resPath)) for (const line of readFileSync(resPath, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (typeof r.id === "string") lastErr.set(r.id, r.error == null ? null : String(r.error)); } catch { /* keep prior */ }
  }
  mkdirSync(oc.out, { recursive: true });
  const todo = [...latest.values()].filter((s) => s.status === "ok" && (!lastErr.has(s.id) || (oc.retryFailed === true && lastErr.get(s.id) !== null)));
  const pt = validPriceTable(mission.price_table);
  const tot: TokenCounts = { input: 0, output: 0, reasoning: 0, total: 0 };
  let totApi = 0, apiKnown = pt !== null, okCount = 0, failCount = 0;
  const logSummary = (): void => console.log(`scrap extract summary: ok=${okCount} failed=${failCount} tokens=in:${tot.input},out:${tot.output},reasoning:${tot.reasoning},total:${tot.total} api_equivalent=${apiKnown ? totApi.toFixed(6) : "unknown"}`);
  if (todo.length === 0) { logSummary(); return; }
  // Fail fast with exit 2 (via CLI) before any paid request: without this,
  // the real client would throw inside generateJson per id and poison rows.
  // Mesh seats need no API key; the host resolves them from local seats.
  let cli: ExtractClient, effort: string | undefined;
  if (client) cli = client;
  else if (meshAlias !== null) {
    const factory = deps?.createMeshClient ?? (async (alias: string) => (await import("./mesh-host.js")).createScrapMeshClient(alias));
    const meshRes = await factory(meshAlias);
    cli = meshRes.client; effort = meshRes.effort;
  } else {
    const envs = directProviderCredentialEnv(pm!.provider);
    if (!envs.some((e) => process.env[e]?.trim())) throw new Error(`scrap extract: missing credentials for ${pm!.provider} (missing_credentials); set one of ${envs.join(", ")} before any request`);
    cli = createDirectTextJsonClient({ provider: pm!.provider, model: pm!.name });
  }
  // @sentropic/llm-mesh 0.38.6 dist/generation.d.ts:24-29 & dist/transport/cloud-code-runtime-client.js:147-162,252:
  // Cloud Code caps thoughts+answer together under maxOutputTokens (other seat transports ignore budgetTokens).
  const reasoningBudget = num(mission.reasoning_budget_tokens) !== undefined && mission.reasoning_budget_tokens! >= 0 ? Math.floor(mission.reasoning_budget_tokens!) : 8192;
  const maxOutputTokens = effort && effort !== "none" ? 2000 + reasoningBudget : 2000;
  const recordUsage = (u: unknown): void => {
    const c = usageCounts(u);
    if (!c) { apiKnown = false; return; }
    tot.input += c.input; tot.output += c.output; tot.reasoning += c.reasoning; tot.total += c.total;
    const eq = apiEquivalent(pt, c);
    if (typeof eq === "number") totApi += eq; else apiKnown = false;
  };
  const fail = (s: { id: string; url: string }, code: ExtractErrorCode, msg: string): void => {
    failCount++;
    console.error(`scrap extract: ${s.id} ${code}: ${msg}`);
    try { appendFileSync(resPath, `${JSON.stringify({ id: s.id, url: s.url, error: code, error_detail: msg, fields: null })}\n`, "utf-8"); }
    catch (e) { console.error(`scrap extract: ${s.id} write_error: cannot append row: ${e instanceof Error ? e.message : String(e)}`); }
  };
  for (const s of todo) {
    let texts: { sha: string; text: string }[];
    try {
      texts = ((s as { pages?: { sha256: string }[] }).pages ?? []).map((p) => ({ sha: p.sha256, text: textOf(readFileSync(join(oc.out, "snapshots", `${p.sha256}.html`), "utf-8")) }));
    } catch (e) { fail(s, "write_error", `snapshot read failed: ${e instanceof Error ? e.message : String(e)}`); continue; }
    const prompt = buildPrompt(mission, names, texts.map((t) => t.text).join("\n\n").slice(0, cap));
    let gotObj: Record<string, unknown> | null = null, lastAudit: Record<string, unknown> | undefined, mergedUsage: unknown, seatQuota: Record<string, unknown> | undefined;
    let parseErr: string | null = null, prevRaw: string | null = null, failed = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const curPrompt = attempt === 0 ? prompt : `${prompt}\n\nYour previous response failed JSON parsing (${parseErr}).\nPrevious response:\n${(prevRaw ?? "").slice(0, 4000)}\n\nReturn ONLY one complete, valid JSON object matching the schema above.`;
      let rawText: string | null = null, res: { audit?: unknown; text?: unknown };
      try {
        // No temp files: the answer comes back through validateResponse in memory.
        res = await cli.generateJson({ schema: "scrap-extract", prompt: curPrompt, maxOutputTokens, validateResponse: (t) => { rawText = t; } });
      } catch (e) {
        if (isSeatAcquisitionError(e)) throw e;
        const eu = isObj(e) ? (isObj(e.audit) ? e.audit.usage : e.usage) : undefined;
        if (eu !== undefined) { recordUsage(eu); mergedUsage = mergeUsage(mergedUsage, eu); }
        const m = e instanceof Error ? e.message : String(e);
        if (/missing.*cred|missing_credentials/i.test(m)) { fail(s, "missing_credentials", m); failed = true; break; }
        if (/empty or filtered response/i.test(m)) { fail(s, "empty_response", m); failed = true; break; }
        if (/not valid JSON/i.test(m) && attempt === 0) { parseErr = m; prevRaw = rawText; continue; }
        fail(s, /not valid JSON/i.test(m) ? "parse_error" : "llm_error", m); failed = true; break;
      }
      const audit = isObj(res.audit) ? res.audit : undefined;
      recordUsage(audit?.usage);
      if (audit) { lastAudit = audit; if (audit.usage !== undefined) mergedUsage = mergeUsage(mergedUsage, audit.usage); if (isObj(audit.quota)) seatQuota = audit.quota; }
      const cand = res.text, text = typeof cand === "string" ? cand : rawText;
      if (text === null || text === undefined || !text.trim()) { fail(s, "empty_response", "LLM returned empty or filtered response"); failed = true; break; }
      let got: unknown;
      try { got = parseJsonFromLlmText(text); }
      catch (e) { const m = e instanceof Error ? e.message : String(e); if (attempt === 0) { parseErr = m; prevRaw = text; continue; } fail(s, "parse_error", m); failed = true; break; }
      if (!isObj(got)) { const m = "response is not a JSON object"; if (attempt === 0) { parseErr = m; prevRaw = text; continue; } fail(s, "parse_error", m); failed = true; break; }
      gotObj = got; break;
    }
    if (failed || !gotObj) continue;
    const fields: Record<string, unknown> = {};
    for (const f of specs) {
      const raw = gotObj[f.name];
      if (f.maxValues > 1) {
        const arr = Array.isArray(raw) ? raw : (raw == null ? [] : [raw]);
        const values: { value: unknown; quote: string; sha256: string }[] = [];
        let dropped = 0;
        for (const item of arr) {
          if (item == null) continue;
          if (!isObj(item) || !("value" in item)) { dropped++; continue; }
          if (item.value == null) continue;
          const q = typeof item.quote === "string" && item.quote ? item.quote : null;
          const hit = q ? texts.find((t) => t.text.includes(q)) : undefined;
          if (!q || !hit) dropped++; else if (values.length < f.maxValues) values.push({ value: item.value, quote: q, sha256: hit.sha });
        }
        fields[f.name] = { values, unverified_dropped: dropped };
      } else {
        const e = isObj(raw) ? raw : undefined, q = typeof e?.quote === "string" && e.quote ? e.quote : null;
        const hit = q ? texts.find((t) => t.text.includes(q)) : undefined;
        if (!e || e.value == null) fields[f.name] = { value: null, quote: null, sha256: null };
        else if (!q || !hit) fields[f.name] = { value: null, quote: null, sha256: null, reason: "unverified_quote" };
        else fields[f.name] = { value: e.value, quote: q, sha256: hit.sha };
      }
    }
    const extra: Record<string, unknown> = {};
    if (mergedUsage !== undefined) extra.tokens = mergedUsage;
    const apiEq = apiEquivalent(pt, usageCounts(mergedUsage));
    if (apiEq === "unknown") apiKnown = false;
    extra.cost = { api_equivalent: apiEq, seat_quota: seatQuota ?? "unknown" };
    if (lastAudit?.mesh === true && typeof lastAudit.providerId === "string" && typeof lastAudit.modelId === "string") {
      extra.mesh = { provider: lastAudit.providerId, model: lastAudit.modelId };
    }
    try { appendFileSync(resPath, `${JSON.stringify({ id: s.id, url: s.url, fields, ...extra })}\n`, "utf-8"); okCount++; }
    catch (e) { failCount++; console.error(`scrap extract: ${s.id} write_error: cannot append row: ${e instanceof Error ? e.message : String(e)}`); }
  }
  logSummary();
}
