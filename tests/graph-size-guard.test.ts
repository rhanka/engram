import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  GRAPH_JSON_MAX_BYTES,
  assertGraphJsonSize,
  assertGraphJsonFileSize,
} from "../src/graph-size-guard.js";

describe("GRAPH_JSON_MAX_BYTES", () => {
  it("is 512 MiB", () => {
    expect(GRAPH_JSON_MAX_BYTES).toBe(512 * 1024 * 1024);
  });
});

describe("assertGraphJsonSize", () => {
  it("accepts sizes at or below the cap", () => {
    expect(() => assertGraphJsonSize(0, "read")).not.toThrow();
    expect(() => assertGraphJsonSize(GRAPH_JSON_MAX_BYTES, "read")).not.toThrow();
    expect(() => assertGraphJsonSize(1024, "write")).not.toThrow();
  });

  it("rejects sizes above the cap with the upstream-style message (read)", () => {
    const oversize = GRAPH_JSON_MAX_BYTES + 1;
    expect(() => assertGraphJsonSize(oversize, "read")).toThrow(/exceeds.*byte cap/);
    expect(() => assertGraphJsonSize(oversize, "read")).toThrow(String(GRAPH_JSON_MAX_BYTES));
  });

  it("rejects sizes above the cap (write) and mentions write", () => {
    const oversize = GRAPH_JSON_MAX_BYTES + 1;
    expect(() => assertGraphJsonSize(oversize, "write")).toThrow(/exceeds.*byte cap/);
    expect(() => assertGraphJsonSize(oversize, "write")).toThrow(/write/);
  });

  it("includes the offending and cap byte counts in the error", () => {
    const oversize = GRAPH_JSON_MAX_BYTES + 1234;
    try {
      assertGraphJsonSize(oversize, "read");
      throw new Error("expected throw");
    } catch (error) {
      const message = String((error as Error).message);
      expect(message).toContain(String(oversize));
      expect(message).toContain(String(GRAPH_JSON_MAX_BYTES));
    }
  });

  it("allows an explicit path string in the error context", () => {
    const oversize = GRAPH_JSON_MAX_BYTES + 1;
    expect(() =>
      assertGraphJsonSize(oversize, "read", "/tmp/graph.json"),
    ).toThrow(/\/tmp\/graph\.json/);
  });
});

describe("assertGraphJsonFileSize", () => {
  it("returns silently when the path is missing (defer to caller's existence check)", () => {
    const missing = join(tmpdir(), `graphify-missing-${Date.now()}.json`);
    expect(() => assertGraphJsonFileSize(missing, "read")).not.toThrow();
  });

  it("returns silently for a small file", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-size-guard-"));
    try {
      const path = join(dir, "graph.json");
      writeFileSync(path, JSON.stringify({ nodes: [], links: [] }), "utf-8");
      expect(() => assertGraphJsonFileSize(path, "read")).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
