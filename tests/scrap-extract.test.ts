import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runExtract } from "../src/scrap/extract.js";
const HTML = "<html><body><p>Visit us at 12 rue des Fleurs, Paris 75002. Phone 01 23 45 67 89.</p></body></html>";
function fakeOut(canned: unknown): any {
  const d = mkdtempSync(join(tmpdir(), "scx-")), sha = createHash("sha256").update(HTML).digest("hex");
  mkdirSync(join(d, "snapshots"), { recursive: true }); writeFileSync(join(d, "snapshots", `${sha}.html`), HTML);
  writeFileSync(join(d, "state.jsonl"), `${JSON.stringify({ id: "a", url: "http://x/", status: "ok", pages: [{ url: "http://x/", final_url: "http://x/", status: 200, bytes: HTML.length, sha256: sha }] })}\n${JSON.stringify({ id: "b", url: "http://y/", status: "dns", pages: [] })}\n`);
  writeFileSync(join(d, "mission.json"), JSON.stringify({ fields: ["street", "city"], instruction: "Extract the address." }));
  const client = { mode: "direct", provider: "test", generateJson: async (input: any) => { writeFileSync(input.outputPath, JSON.stringify(canned)); return { status: "completed", provider: "test", mode: "direct", audit: { usage: { input: 10, output: 5 } } }; } };
  return { d, client };
}
const row = (d: string): any => JSON.parse(readFileSync(join(d, "results.ndjson"), "utf-8").split("\n")[0]);
const run = (t: any, model: string): Promise<void> => runExtract({ out: t.d, mission: join(t.d, "mission.json"), model }, t.client);
describe("scrap extract", () => {
  it("extracts fields with verified quotes, tokens, and skips failed ids", async () => {
    const t = fakeOut({ street: { value: "12 rue des Fleurs", quote: "12 rue des Fleurs" }, city: { value: "Paris", quote: "Paris 75002" } });
    await run(t, "gemini-4-hydrogen");
    expect(row(t.d).fields.street).toEqual({ value: "12 rue des Fleurs", quote: "12 rue des Fleurs", sha256: expect.any(String) });
    expect(row(t.d).tokens).toEqual({ input: 10, output: 5 });
    expect(readFileSync(join(t.d, "results.ndjson"), "utf-8").trim().split("\n").length).toBe(1);
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
});
