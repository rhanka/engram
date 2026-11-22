import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createDirectTextJsonClient, directProviderCredentialEnv, parseJsonFromLlmText, type DirectLlmProvider } from "../llm-execution.js";
export interface ExtractOptions { out: string; mission: string; model: string; tokenCap?: number }
export interface Mission { fields: (string | { name: string })[]; instruction: string; tokenCap?: number }
export type ExtractErrorCode = "missing_credentials" | "llm_error" | "parse_error" | "write_error";
// Minimal structural client: the real TextJsonGenerationClient satisfies it, and
// stubs mimic the real client by answering through validateResponse in memory.
export interface ExtractClient {
  generateJson(input: { schema: string; prompt: string; maxOutputTokens?: number; validateResponse?: (text: string) => void | Promise<void> }): Promise<{ audit?: unknown; text?: unknown }>;
}
const textOf = (h: string): string => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const KNOWN: string[] = ["anthropic", "openai", "gemini", "mistral", "cohere"];
const GUESS: Record<string, DirectLlmProvider> = { claude: "anthropic", gpt: "openai", o1: "openai", o3: "openai", o4: "openai", gemini: "gemini", mistral: "mistral", ministral: "mistral", codestral: "mistral", cohere: "cohere", command: "cohere" };
export function providerOf(model: string): { provider: DirectLlmProvider; name: string } {
  const m = model.match(/^([a-z0-9_-]+)[:/](.+)$/i);
  if (m && KNOWN.includes(m[1]!.toLowerCase())) return { provider: m[1]!.toLowerCase() as DirectLlmProvider, name: m[2]! };
  const g = GUESS[model.split("-")[0]!.toLowerCase()];
  if (g) return { provider: g, name: model };
  throw new Error(`scrap extract: cannot infer provider from model ${JSON.stringify(model)} (use provider:model)`);
}
export function buildPrompt(m: Mission, names: string[], text: string): string {
  return `${m.instruction}\nFields: ${names.join(", ")}\nReturn a JSON object with one entry per field: {"value": string|null, "quote": string|null} where quote is copied verbatim from the page text below.\n\n${text}`;
}
export async function runExtract(oc: ExtractOptions, client?: ExtractClient): Promise<void> {
  const mission = JSON.parse(readFileSync(oc.mission, "utf-8")) as Mission;
  const names = mission.fields.map((f) => typeof f === "string" ? f : f.name);
  const pm = providerOf(oc.model);
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
  const done = new Set<string>();
  if (existsSync(resPath)) for (const line of readFileSync(resPath, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (typeof r.id === "string") done.add(r.id); } catch { /* keep prior */ }
  }
  mkdirSync(oc.out, { recursive: true });
  const todo = [...latest.values()].filter((s) => s.status === "ok" && !done.has(s.id));
  if (todo.length === 0) return;
  // Fail fast with exit 2 (via CLI) before any paid request: without this,
  // the real client would throw inside generateJson per id and poison rows.
  if (!client) {
    const envs = directProviderCredentialEnv(pm.provider);
    if (!envs.some((e) => process.env[e]?.trim())) throw new Error(`scrap extract: missing credentials for ${pm.provider} (missing_credentials); set one of ${envs.join(", ")} before any request`);
  }
  const cli: ExtractClient = client ?? createDirectTextJsonClient({ provider: pm.provider, model: pm.name });
  const fail = (s: { id: string; url: string }, code: ExtractErrorCode, msg: string): void => {
    console.error(`scrap extract: ${s.id} ${code}: ${msg}`);
    try { appendFileSync(resPath, `${JSON.stringify({ id: s.id, url: s.url, error: code, fields: null })}\n`, "utf-8"); }
    catch (e) { console.error(`scrap extract: ${s.id} write_error: cannot append row: ${e instanceof Error ? e.message : String(e)}`); }
  };
  for (const s of todo) {
    let texts: { sha: string; text: string }[];
    try {
      texts = ((s as { pages?: { sha256: string }[] }).pages ?? []).map((p) => ({ sha: p.sha256, text: textOf(readFileSync(join(oc.out, "snapshots", `${p.sha256}.html`), "utf-8")) }));
    } catch (e) { fail(s, "write_error", `snapshot read failed: ${e instanceof Error ? e.message : String(e)}`); continue; }
    const prompt = buildPrompt(mission, names, texts.map((t) => t.text).join("\n\n").slice(0, cap));
    let rawText: string | null = null, res: { audit?: unknown; text?: unknown };
    try {
      // No temp files: the answer comes back through validateResponse in
      // memory (the contract every generating client must honor).
      res = await cli.generateJson({ schema: "scrap-extract", prompt, maxOutputTokens: 2000, validateResponse: (t) => { rawText = t; } });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      fail(s, /missing.*cred|missing_credentials/i.test(m) ? "missing_credentials" : /(not valid JSON|empty or filtered response)/i.test(m) ? "parse_error" : "llm_error", m);
      continue;
    }
    const cand = res.text, text = typeof cand === "string" ? cand : rawText;
    let got: unknown;
    try { got = parseJsonFromLlmText(text); }
    catch (e) { fail(s, "parse_error", e instanceof Error ? e.message : String(e)); continue; }
    if (!got || typeof got !== "object" || Array.isArray(got)) { fail(s, "parse_error", "response is not a JSON object"); continue; }
    const obj = got as Record<string, { value?: unknown; quote?: unknown }>, fields: Record<string, unknown> = {};
    for (const f of names) {
      const e = obj[f], q = typeof e?.quote === "string" && e.quote ? e.quote : null;
      const hit = q ? texts.find((t) => t.text.includes(q)) : undefined;
      if (!e || (e as { value?: unknown }).value == null) fields[f] = { value: null, quote: null, sha256: null };
      else if (!q || !hit) fields[f] = { value: null, quote: null, sha256: null, reason: "unverified_quote" };
      else fields[f] = { value: (e as { value?: unknown }).value, quote: q, sha256: hit.sha };
    }
    const audit = (res as { audit?: unknown }).audit as { usage?: unknown; cost?: unknown } | undefined, extra: Record<string, unknown> = {};
    if (audit?.usage !== undefined) extra.tokens = audit.usage;
    if (audit?.cost !== undefined) extra.cost = audit.cost;
    try { appendFileSync(resPath, `${JSON.stringify({ id: s.id, url: s.url, fields, ...extra })}\n`, "utf-8"); }
    catch (e) { console.error(`scrap extract: ${s.id} write_error: cannot append row: ${e instanceof Error ? e.message : String(e)}`); }
  }
}
