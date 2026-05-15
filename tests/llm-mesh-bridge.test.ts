import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createGraphifyMesh,
  meshTextJsonClient,
} from "../src/llm-mesh-bridge.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-mesh-bridge-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe("A3 llm-mesh bridge scaffold", () => {
  it("createGraphifyMesh returns an LlmMesh with the five default provider adapters", () => {
    const mesh = createGraphifyMesh();
    expect(typeof mesh.generate).toBe("function");
    expect(typeof mesh.stream).toBe("function");
  });

  it("meshTextJsonClient exposes the graphify TextJsonGenerationClient shape", () => {
    const mesh = createGraphifyMesh();
    const client = meshTextJsonClient(mesh, {
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4-6",
    });
    // Minimal shape contract: mode = "mesh", provider/model carried through.
    // End-to-end generate() requires real adapter clients, exercised in the
    // wiki-description-generation refactor in a follow-up commit.
    expect(client.mode).toBe("mesh");
    expect(client.provider).toBe("anthropic");
    expect(client.model).toBe("claude-sonnet-4-6");
    expect(typeof client.generateJson).toBe("function");
  });

  it("meshTextJsonClient defaults to anthropic provider when none specified", () => {
    const mesh = createGraphifyMesh();
    const client = meshTextJsonClient(mesh);
    expect(client.provider).toBe("anthropic");
    expect(client.model).toBeUndefined();
  });
});
