import { afterEach, describe, expect, it, vi } from "vitest";
import { validateOllamaBaseUrl } from "../src/security.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateOllamaBaseUrl (F-0831-P1 / F3 SSRF)", () => {
  it("fails closed on the 169.254.169.254 cloud-metadata IP", async () => {
    await expect(validateOllamaBaseUrl("http://169.254.169.254")).rejects.toThrow(
      /link-local\/metadata/,
    );
  });

  it("fails closed on any 169.254.x link-local host", async () => {
    await expect(validateOllamaBaseUrl("http://169.254.0.1:11434")).rejects.toThrow(
      /refusing to send the corpus/,
    );
  });

  it("fails closed on metadata.google.internal", async () => {
    await expect(validateOllamaBaseUrl("http://metadata.google.internal")).rejects.toThrow(
      /link-local\/metadata/,
    );
  });

  it("fails closed on 0.0.0.0", async () => {
    await expect(validateOllamaBaseUrl("http://0.0.0.0:11434")).rejects.toThrow(
      /link-local\/metadata/,
    );
  });

  it("fails closed regardless of warn flag", async () => {
    await expect(
      validateOllamaBaseUrl("http://169.254.169.254", { warn: false }),
    ).rejects.toThrow(/link-local\/metadata/);
  });

  it("accepts a loopback host without warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(validateOllamaBaseUrl("http://127.0.0.1:11434")).resolves.toBeUndefined();
    await expect(validateOllamaBaseUrl("http://localhost:11434")).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns but allows a general LAN host (trusted on-prem Ollama)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(validateOllamaBaseUrl("http://10.0.0.5:11434")).resolves.toBeUndefined();
    await expect(validateOllamaBaseUrl("http://192.168.1.20:11434")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("does not warn for a LAN host when warn:false (early gate)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      validateOllamaBaseUrl("http://192.168.1.20:11434", { warn: false }),
    ).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns (does not throw) on an unparseable URL", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(validateOllamaBaseUrl("not a url")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("warns (does not throw) on a non-http(s) scheme", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(validateOllamaBaseUrl("ftp://example.com")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
