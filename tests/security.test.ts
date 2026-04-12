import { describe, it, expect } from "vitest";
import { validateUrlSync, sanitizeLabel, validateGraphPath } from "../src/security.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("validateUrlSync", () => {
  it("accepts http URLs", () => {
    expect(validateUrlSync("http://example.com")).toBe("http://example.com");
  });

  it("accepts https URLs", () => {
    expect(validateUrlSync("https://example.com/page")).toBe("https://example.com/page");
  });

  it("rejects file:// URLs", () => {
    expect(() => validateUrlSync("file:///etc/passwd")).toThrow("Blocked URL scheme");
  });

  it("rejects ftp:// URLs", () => {
    expect(() => validateUrlSync("ftp://evil.com")).toThrow("Blocked URL scheme");
  });

  it("rejects data: URLs", () => {
    expect(() => validateUrlSync("data:text/html,<script>")).toThrow("Blocked URL scheme");
  });

  it("blocks cloud metadata endpoints", () => {
    expect(() => validateUrlSync("http://metadata.google.internal/computeMetadata")).toThrow("Blocked cloud metadata");
  });
});

describe("sanitizeLabel", () => {
  it("strips control characters", () => {
    expect(sanitizeLabel("hello\x00world\x1f")).toBe("helloworld");
  });

  it("caps length at 256", () => {
    const long = "a".repeat(300);
    expect(sanitizeLabel(long)).toHaveLength(256);
  });

  it("preserves normal text", () => {
    expect(sanitizeLabel("MyClass")).toBe("MyClass");
  });
});

describe("validateGraphPath", () => {
  const tmpDir = join(tmpdir(), "graphify-test-security-" + Date.now());
  const graphifyOut = join(tmpDir, "graphify-out");

  it("rejects when base directory does not exist", () => {
    expect(() => validateGraphPath("graphify-out/graph.json", join(tmpDir, "nope"))).toThrow("does not exist");
  });

  it("rejects path traversal", () => {
    mkdirSync(graphifyOut, { recursive: true });
    writeFileSync(join(graphifyOut, "graph.json"), "{}");
    expect(() => validateGraphPath("../../../etc/passwd", graphifyOut)).toThrow("escapes");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("accepts valid path inside graphify-out", () => {
    mkdirSync(graphifyOut, { recursive: true });
    writeFileSync(join(graphifyOut, "graph.json"), "{}");
    const result = validateGraphPath(join(graphifyOut, "graph.json"), graphifyOut);
    expect(result).toContain("graph.json");
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
