import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect } from "vitest";
import { serve } from "../../src/serve.js";
import { tempDir, type Row } from "./multi-links.js";

export async function withMcp(raw: Row, work: (call: (name: string, args?: Row) => Promise<string>) => Promise<void>) {
  const path = join(tempDir(), "graph.json");
  writeFileSync(path, JSON.stringify(raw));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serving = serve(path, serverTransport);
  const client = new Client({ name: "multi-links-L0", version: "0.0.0" });
  try {
    await client.connect(clientTransport);
    await work(async (name, args = {}) => {
      const response = await client.callTool({ name, arguments: args });
      expect(response.isError, JSON.stringify(response)).not.toBe(true);
      return (response.content as Array<{ type: string; text?: string }>).filter(c => c.type === "text").map(c => c.text).join("\n");
    });
  } finally {
    await client.close();
    await clientTransport.close();
    await serving;
  }
}
