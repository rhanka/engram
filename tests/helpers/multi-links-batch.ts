import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { bundleProfile } from "../../src/profile-bundle.js";
import { extractDocumentBatch } from "../../src/extraction-batch.js";
import { edge, extraction, node, type Row } from "./multi-links.js";
import type { Extraction } from "../../src/types.js";

export const batchSha = "a".repeat(64);
export function batchFixture(attrs: Row = {}): Extraction {
  return extraction([edge({ source: "n:a", target: "n:b", source_file: "/repo/f.ts", source_location: "L1", derivation_method: "extracted", ...attrs })],
    [node("n:a", { node_type: "Entity", status: "candidate", file_type: "document" }), node("n:b", { node_type: "Entity", status: "candidate", file_type: "document" })]);
}
export async function batchIntake(fragment: Extraction, root?: string): Promise<Extraction> {
  const bundled = bundleProfile(readFileSync(new URL("../fixtures/multi-links/batch-profile.yaml", import.meta.url), "utf8"), {});
  if (!bundled.ok) throw new Error(JSON.stringify(bundled.errors));
  let calls = 0;
  const result = await extractDocumentBatch({
    root,
    document: { docSha: batchSha, sourceFile: "/repo/f.ts", pages: [{ page: 1, text: "Alpha supporting passage" }] },
    profileBundle: bundled.bundle,
    modelPolicy: { provider: "openai", model: "test-model", temperature: 0, maxOutputTokens: 2048, verifierModel: null },
    promptVersion: "L0/v1",
    bounds: { timeoutMs: 5000, maxDocumentBytes: 10000, maxAttempts: 1, maxChunkChars: 10000 },
    client: { provider: "openai", model: "test-model", async generate() { calls++; return { status: "ok", text: JSON.stringify(fragment), tokensIn: 1, tokensOut: 1 }; } },
  } as never);
  expect(calls, "exercise the production chunk intake and merger").toBe(1);
  expect(result.receipt.status, JSON.stringify(result.receipt)).toBe("ok");
  expect(result.extraction).not.toBeNull();
  return result.extraction!;
}
