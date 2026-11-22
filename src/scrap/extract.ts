import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDirectTextJsonClient, type DirectLlmProvider, type TextJsonGenerationClient } from "../llm-execution.js";
export interface ExtractOptions { out: string; mission: string; model: string; tokenCap?: number }
export interface Mission { fields: (string | { name: string })[]; instruction: string; tokenCap?: number }
const textOf = (h: string): string => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const KNOWN: string[] = ["anthropic", "openai", "gemini", "mistral", "cohere"];
const GUESS: Record<string, DirectLlmProvider> = { claude: "anthropic", gpt: "openai", o1: "openai", gemini: "gemini", mistral: "mistral", cohere: "cohere", command: "cohere" };
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
export async function runExtract(oc: ExtractOptions, client?: TextJsonGenerationClient): Promise<void> {
  const mission = JSON.parse(readFileSync(oc.mission, "utf-8")) as Mission;
  const names = mission.fields.map((f) => typeof f === "string" ? f : f.name);
  const cli = client ?? (() => { const pm = providerOf(oc.model); return createDirectTextJsonClient({ provider: pm.provider, model: pm.name }); })();
  const cap = oc.tokenCap ?? mission.tokenCap ?? 24000, rows: string[] = [];
  for (const line of readFileSync(join(oc.out, "state.jsonl"), "utf-8").split("\n")) {
    if (!line.trim()) continue;
    const s = JSON.parse(line);
    if (s.status !== "ok") continue;
    const texts = (s.pages as { sha256: string }[]).map((p) => ({ sha: p.sha256, text: textOf(readFileSync(join(oc.out, "snapshots", `${p.sha256}.html`), "utf-8")) }));
    const prompt = buildPrompt(mission, names, texts.map((t) => t.text).join("\n\n").slice(0, cap));
    const tmp = join(tmpdir(), `scrap-ex-${process.pid}-${Date.now()}.json`);
    const res = await cli.generateJson({ schema: "scrap-extract", prompt, outputPath: tmp, maxOutputTokens: 2000 });
    const got = JSON.parse(readFileSync(tmp, "utf-8")) as Record<string, { value?: unknown; quote?: unknown }>;
    const fields: Record<string, unknown> = {};
    for (const f of names) {
      const e = got[f], q = typeof e?.quote === "string" && e.quote ? e.quote : null;
      const hit = q ? texts.find((t) => t.text.includes(q)) : undefined;
      fields[f] = !e || e.value == null || !q ? { value: null, quote: null, sha256: null } : hit ? { value: e.value, quote: q, sha256: hit.sha } : { value: null, quote: null, sha256: null, reason: "unverified_quote" };
    }
    const audit = res.audit as { usage?: unknown; cost?: unknown }, extra: Record<string, unknown> = {};
    if (audit.usage !== undefined) extra.tokens = audit.usage;
    if (audit.cost !== undefined) extra.cost = audit.cost;
    rows.push(JSON.stringify({ id: s.id, url: s.url, fields, ...extra }));
  }
  mkdirSync(oc.out, { recursive: true }); writeFileSync(join(oc.out, "results.ndjson"), rows.length ? `${rows.join("\n")}\n` : "", "utf-8");
}
