import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetch, sanitizeLabel, validateGraphPath, validateUrl, validateUrlSync } from "../src/security.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("validateUrl", () => {
  it("blocks direct private IP URLs", async () => {
    await expect(validateUrl("http://127.0.0.1/private")).rejects.toThrow("Blocked private/internal IP");
  });
});

describe("safeFetch", () => {
  it("blocks redirects to private IP targets before following them", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      })
    ));

    await expect(safeFetch("https://example.com/public")).rejects.toThrow("Blocked private/internal IP");
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

  it("returns an empty string for nullish labels", () => {
    expect(sanitizeLabel(null)).toBe("");
    expect(sanitizeLabel(undefined)).toBe("");
  });
});

describe("validateGraphPath", () => {
  const tmpDir = join(tmpdir(), "graphify-test-security-" + Date.now());
  const graphifyOut = join(tmpDir, ".graphify");

  it("rejects when base directory does not exist", () => {
    expect(() => validateGraphPath(".graphify/graph.json", join(tmpDir, "nope"))).toThrow("does not exist");
  });

  it("rejects path traversal", () => {
    mkdirSync(graphifyOut, { recursive: true });
    writeFileSync(join(graphifyOut, "graph.json"), "{}");
    expect(() => validateGraphPath("../../../etc/passwd", graphifyOut)).toThrow("escapes");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("accepts valid path inside graphify state dir", () => {
    mkdirSync(graphifyOut, { recursive: true });
    writeFileSync(join(graphifyOut, "graph.json"), "{}");
    const result = validateGraphPath(join(graphifyOut, "graph.json"), graphifyOut);
    expect(result).toContain("graph.json");
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
