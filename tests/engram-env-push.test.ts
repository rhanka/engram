import { describe, expect, it } from "vitest";

import { pushEngramEnv } from "../src/env.js";

describe("pushEngramEnv", () => {
  it("still overrides and restores non-secret pairs", () => {
    const env: NodeJS.ProcessEnv = {};
    const restore = pushEngramEnv("ENGRAM_WHISPER_MODEL", "GRAPHIFY_WHISPER_MODEL", "tiny", env);
    expect(env.ENGRAM_WHISPER_MODEL).toBe("tiny");
    expect(env.GRAPHIFY_WHISPER_MODEL).toBe("tiny");
    restore();
    expect(env.ENGRAM_WHISPER_MODEL).toBeUndefined();
    expect(env.GRAPHIFY_WHISPER_MODEL).toBeUndefined();
  });

  it("refuses secret-carrying keys instead of duplicating them", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(() =>
      pushEngramEnv("ENGRAM_POSTGRES_URL", "GRAPHIFY_POSTGRES_URL", "postgres://x", env),
    ).toThrow(/refuses secret-carrying keys/);
    expect(() =>
      pushEngramEnv("ENGRAM_NEO4J_PASSWORD", "GRAPHIFY_NEO4J_PASSWORD", "s3cret", env),
    ).toThrow(/refuses secret-carrying keys/);
    expect(env.ENGRAM_POSTGRES_URL).toBeUndefined();
    expect(env.GRAPHIFY_POSTGRES_URL).toBeUndefined();
  });
});
