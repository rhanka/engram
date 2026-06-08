/**
 * Tests for providerBaseUrlOk (security.ts) and loadCustomProviders
 * (provider-registry.ts) — Track F-0831-P2a, upstream e3993e4.
 *
 * Validation contract (mirrors graphify/llm.py provider_base_url_ok):
 *  - non-http(s) schemes are rejected (file://, gopher://, etc.)
 *  - http to a non-loopback host is allowed but warns
 *  - https to any host is allowed without warning
 *  - project-local .graphify/providers.json is silently skipped without
 *    GRAPHIFY_ALLOW_LOCAL_PROVIDERS=1 (corpus/key exfiltration gate)
 *  - with opt-in the project-local file is honoured
 *  - entries with bad base_url are skipped on load
 *
 * NOTE: the ingest SSRF guard (blocking 169.254.x / private IPs) is
 * deliberately NOT applied here; legitimate on-prem corporate LLM gateways
 * live on private-range IPs. The OLLAMA_BASE_URL guard (PR #93, b2e71c8)
 * already covers that specific path and is the model for this extension.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { providerBaseUrlOk } from "../src/security.js";
import { loadCustomProviders } from "../src/provider-registry.js";

// ---------------------------------------------------------------------------
// providerBaseUrlOk
// ---------------------------------------------------------------------------

describe("providerBaseUrlOk (F-0831-P2a / e3993e4 scheme validation)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts https to an arbitrary host", () => {
    expect(providerBaseUrlOk("https://api.example.com/v1", "ok")).toBe(true);
  });

  it("accepts http to localhost without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(providerBaseUrlOk("http://localhost:11434/v1", "local")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("accepts http to 127.0.0.1 without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(providerBaseUrlOk("http://127.0.0.1:8080/v1", "loopback")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("accepts http to ::1 without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(providerBaseUrlOk("http://[::1]:11434/v1", "ipv6-loopback")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("rejects file:// scheme and returns false", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(providerBaseUrlOk("file:///etc/passwd", "bad")).toBe(false);
    // Should warn about the bad scheme
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/scheme.*file|file.*scheme/i));
  });

  it("rejects gopher:// scheme and returns false", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(providerBaseUrlOk("gopher://x/", "bad2")).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("rejects data: scheme and returns false", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(providerBaseUrlOk("data:text/plain,oops", "data-uri")).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("allows http to a non-loopback host but warns about plaintext egress", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(providerBaseUrlOk("http://example.com/v1", "plain")).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/plaintext|http.*corpus|corpus.*http/i));
  });

  it("allows http to 169.254.169.254 with a warning (no SSRF block — on-prem LLM gateway)", () => {
    // The upstream e3993e4 deliberately omits the ingest SSRF guard.
    // providerBaseUrlOk is NOT the validateOllamaBaseUrl guard — it only
    // checks scheme and warns on plaintext. 169.254.x is just a non-loopback
    // http host → warns, doesn't throw or return false.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(providerBaseUrlOk("http://169.254.169.254/v1", "meta-ip")).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/plaintext|http.*corpus/i));
  });

  it("does not warn when warn:false", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(providerBaseUrlOk("http://example.com/v1", "plain", { warn: false })).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns false and warns for an unparseable URL", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(providerBaseUrlOk("not a url !!!", "broken")).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// loadCustomProviders — project-local gating (GRAPHIFY_ALLOW_LOCAL_PROVIDERS)
// ---------------------------------------------------------------------------

describe("loadCustomProviders (F-0831-P2a / e3993e4 project-local gate)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(
      process.env["RUNNER_TEMP"] ?? "/tmp",
      `graphify-test-providers-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ignores project-local providers.json without opt-in and warns", () => {
    const localPath = join(tmpDir, "local.json");
    writeFileSync(
      localPath,
      JSON.stringify({
        evil: { base_url: "https://attacker.example/v1", default_model: "m", env_key: "K" },
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loaded = loadCustomProviders({
      localPath,
      globalPath: join(tmpDir, "missing-global.json"),
      env: {},
    });

    expect(loaded).not.toHaveProperty("evil");
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/GRAPHIFY_ALLOW_LOCAL_PROVIDERS|ignoring.*project.local/i));
  });

  it("loads project-local providers.json when GRAPHIFY_ALLOW_LOCAL_PROVIDERS=1", () => {
    const localPath = join(tmpDir, "local.json");
    writeFileSync(
      localPath,
      JSON.stringify({
        lab: { base_url: "https://lab.internal/v1", default_model: "m", env_key: "K" },
      }),
    );

    const loaded = loadCustomProviders({
      localPath,
      globalPath: join(tmpDir, "missing-global.json"),
      env: { GRAPHIFY_ALLOW_LOCAL_PROVIDERS: "1" },
    });

    expect(loaded).toHaveProperty("lab");
    expect(loaded["lab"]).toMatchObject({ base_url: "https://lab.internal/v1" });
  });

  it("loads global providers.json without opt-in (global is always trusted)", () => {
    const globalPath = join(tmpDir, "global.json");
    writeFileSync(
      globalPath,
      JSON.stringify({
        mycloud: { base_url: "https://api.mycloud.example/v1", default_model: "m", env_key: "K" },
      }),
    );

    const loaded = loadCustomProviders({
      localPath: join(tmpDir, "missing-local.json"),
      globalPath,
      env: {},
    });

    expect(loaded).toHaveProperty("mycloud");
  });

  it("skips a provider with a non-http(s) base_url during load", () => {
    const globalPath = join(tmpDir, "global.json");
    writeFileSync(
      globalPath,
      JSON.stringify({
        sneaky: { base_url: "file:///etc/passwd", default_model: "m", env_key: "K" },
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loaded = loadCustomProviders({
      localPath: join(tmpDir, "missing-local.json"),
      globalPath,
      env: {},
    });

    expect(loaded).not.toHaveProperty("sneaky");
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/scheme|file:/i));
  });

  it("injects default pricing when absent", () => {
    const globalPath = join(tmpDir, "global.json");
    writeFileSync(
      globalPath,
      JSON.stringify({
        noprice: { base_url: "https://api.example/v1", default_model: "m", env_key: "K" },
      }),
    );

    const loaded = loadCustomProviders({
      localPath: join(tmpDir, "missing-local.json"),
      globalPath,
      env: {},
    });

    expect(loaded["noprice"]).toHaveProperty("pricing");
    expect(loaded["noprice"]!.pricing).toMatchObject({ input: 0, output: 0 });
  });

  it("does not override explicit pricing", () => {
    const globalPath = join(tmpDir, "global.json");
    writeFileSync(
      globalPath,
      JSON.stringify({
        priced: {
          base_url: "https://api.example/v1",
          default_model: "m",
          env_key: "K",
          pricing: { input: 1.5, output: 2.0 },
        },
      }),
    );

    const loaded = loadCustomProviders({
      localPath: join(tmpDir, "missing-local.json"),
      globalPath,
      env: {},
    });

    expect(loaded["priced"]!.pricing).toMatchObject({ input: 1.5, output: 2.0 });
  });

  it("global takes precedence over project-local for the same provider name", () => {
    const localPath = join(tmpDir, "local.json");
    const globalPath = join(tmpDir, "global.json");
    writeFileSync(
      localPath,
      JSON.stringify({
        shared: { base_url: "https://local.example/v1", default_model: "m", env_key: "K" },
      }),
    );
    writeFileSync(
      globalPath,
      JSON.stringify({
        shared: { base_url: "https://global.example/v1", default_model: "m", env_key: "K" },
      }),
    );

    const loaded = loadCustomProviders({
      localPath,
      globalPath,
      env: { GRAPHIFY_ALLOW_LOCAL_PROVIDERS: "1" },
    });

    // Upstream processes local first then global → global overwrites local.
    expect(loaded["shared"]?.base_url).toBe("https://global.example/v1");
  });

  it("accepts GRAPHIFY_ALLOW_LOCAL_PROVIDERS=true (string)", () => {
    const localPath = join(tmpDir, "local.json");
    writeFileSync(
      localPath,
      JSON.stringify({
        trusted: { base_url: "https://trusted.example/v1", default_model: "m", env_key: "K" },
      }),
    );

    const loaded = loadCustomProviders({
      localPath,
      globalPath: join(tmpDir, "missing-global.json"),
      env: { GRAPHIFY_ALLOW_LOCAL_PROVIDERS: "true" },
    });

    expect(loaded).toHaveProperty("trusted");
  });

  it("accepts GRAPHIFY_ALLOW_LOCAL_PROVIDERS=yes (string)", () => {
    const localPath = join(tmpDir, "local.json");
    writeFileSync(
      localPath,
      JSON.stringify({
        trusted2: { base_url: "https://trusted2.example/v1", default_model: "m", env_key: "K" },
      }),
    );

    const loaded = loadCustomProviders({
      localPath,
      globalPath: join(tmpDir, "missing-global.json"),
      env: { GRAPHIFY_ALLOW_LOCAL_PROVIDERS: "yes" },
    });

    expect(loaded).toHaveProperty("trusted2");
  });

  it("handles malformed JSON gracefully (no throw)", () => {
    const globalPath = join(tmpDir, "global.json");
    writeFileSync(globalPath, "{ not valid json !!!");

    expect(() =>
      loadCustomProviders({
        localPath: join(tmpDir, "missing-local.json"),
        globalPath,
        env: {},
      }),
    ).not.toThrow();
  });
});
