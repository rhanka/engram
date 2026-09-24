/**
 * Custom LLM provider registry.
 *
 * Providers are registered in a providers.json file that maps a provider name
 * to its configuration (base_url, default_model, env_key, optional pricing).
 * Two locations are consulted (Engram paths first, legacy `.graphify` paths
 * as read fallbacks; new writes go to the Engram paths):
 *
 *   1. ~/.engram/providers.json  — the user's own file; always trusted.
 *   2. ./.engram/providers.json  — project-local file that travels with the
 *      repo; gated behind ENGRAM_ALLOW_LOCAL_PROVIDERS=1 (legacy
 *      GRAPHIFY_ALLOW_LOCAL_PROVIDERS) because it controls
 *      where the corpus + API key are sent and is a potential exfiltration
 *      channel when a repo is cloned or shared.
 *
 * Every entry's base_url is validated via providerBaseUrlOk() before the
 * provider is accepted. Non-http(s) schemes are rejected; plaintext http to a
 * non-loopback host warns but is allowed (legitimate on-prem LLM gateways).
 *
 * Port of `graphify.llm._load_custom_providers` (upstream a9d6be6) with the
 * base_url validation and project-local gating from upstream e3993e4.
 *
 * Track F-0831-P2a.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import os from "node:os";

import { engramEnv } from "./env.js";
import { providerBaseUrlOk } from "./security.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomProviderConfig {
  base_url: string;
  default_model: string;
  env_key: string;
  pricing?: { input: number; output: number };
  [key: string]: unknown;
}

export type CustomProviderMap = Record<string, CustomProviderConfig>;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Path to the user's global providers.json (~/.engram/providers.json). */
export function globalProvidersPath(): string {
  return resolve(join(os.homedir(), ".engram", "providers.json"));
}

/** Legacy global providers.json path (~/.graphify/providers.json). */
export function legacyGlobalProvidersPath(): string {
  return resolve(join(os.homedir(), ".graphify", "providers.json"));
}

/** Path to the project-local providers.json (./.engram/providers.json). */
export function localProvidersPath(root?: string): string {
  return resolve(join(root ?? ".", ".engram", "providers.json"));
}

/** Legacy project-local providers.json path (./.graphify/providers.json). */
export function legacyLocalProvidersPath(root?: string): string {
  return resolve(join(root ?? ".", ".graphify", "providers.json"));
}

const warnedProviderPaths = new Set<string>();

/** Clear recorded legacy-path warnings (tests only). */
export function clearProviderWarningsForTests(): void {
  warnedProviderPaths.clear();
}

function warnLegacyProvidersPath(used: string, preferred: string): void {
  if (warnedProviderPaths.has(used)) return;
  warnedProviderPaths.add(used);
  console.warn(
    `[engram] using legacy providers file ${used}; move it to ${preferred}`,
  );
}

/**
 * Resolve the providers.json path to read: the Engram path when it exists,
 * else the legacy `.graphify` path (with a one-time warning), else the
 * Engram path (absent — caller treats it as no file).
 */
function resolveProvidersPath(preferred: string, legacy: string): string {
  if (existsSync(preferred)) return preferred;
  if (existsSync(legacy)) {
    warnLegacyProvidersPath(legacy, preferred);
    return legacy;
  }
  return preferred;
}

// ---------------------------------------------------------------------------
// Options interface for testability
// ---------------------------------------------------------------------------

/** Options that override the real filesystem paths and env for testing. */
export interface LoadCustomProvidersOptions {
  /** Override global providers.json path (default: ~/.engram/providers.json). */
  globalPath?: string;
  /** Override project-local providers.json path (default: ./.engram/providers.json). */
  localPath?: string;
  /**
   * Explicit legacy-path overrides. When set, these are probed after the
   * corresponding primary path, mirroring the default legacy fallback.
   */
  legacyGlobalPath?: string;
  legacyLocalPath?: string;
  /** Override environment variable map (default: process.env). */
  env?: NodeJS.ProcessEnv;
}

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

/**
 * Load custom LLM providers from providers.json files.
 *
 * Returns a map of provider name → config. Built-in providers (anthropic,
 * openai, gemini, mistral, cohere, ollama) are never overridden; entries that
 * shadow them are silently dropped.
 */
export function loadCustomProviders(
  options: LoadCustomProvidersOptions = {},
): CustomProviderMap {
  const env = options.env ?? process.env;
  // Explicit primary overrides are honoured verbatim (no fallback probing).
  // Defaults probe the Engram path first, then the legacy `.graphify` path.
  const globalPath = options.globalPath !== undefined
    ? (options.legacyGlobalPath !== undefined
      ? resolveProvidersPath(options.globalPath, options.legacyGlobalPath)
      : options.globalPath)
    : resolveProvidersPath(globalProvidersPath(), options.legacyGlobalPath ?? legacyGlobalProvidersPath());
  const localPath = options.localPath !== undefined
    ? (options.legacyLocalPath !== undefined
      ? resolveProvidersPath(options.localPath, options.legacyLocalPath)
      : options.localPath)
    : resolveProvidersPath(localProvidersPath(), options.legacyLocalPath ?? legacyLocalProvidersPath());

  const allowLocal =
    ["1", "true", "yes"].includes((engramEnv("ENGRAM_ALLOW_LOCAL_PROVIDERS", "GRAPHIFY_ALLOW_LOCAL_PROVIDERS", env) ?? "").trim().toLowerCase());

  // Warn if a project-local file exists but the opt-in flag is absent.
  if (existsSync(localPath) && !allowLocal) {
    console.warn(
      `[engram] WARNING: ignoring project-local ${localPath} (custom providers control ` +
        "where your corpus and API key are sent). Set ENGRAM_ALLOW_LOCAL_PROVIDERS=1 to load it.",
    );
  }

  // Built-in provider names that cannot be overridden.
  const BUILTIN_PROVIDERS = new Set([
    "anthropic",
    "openai",
    "gemini",
    "mistral",
    "cohere",
    "ollama",
  ]);

  const providers: CustomProviderMap = {};

  // Load local first (if opt-in), then global (global wins on name collision,
  // matching upstream behaviour where the last writer of providers[name] wins,
  // and global is processed after local).
  const paths = allowLocal ? [localPath, globalPath] : [globalPath];

  for (const filePath of paths) {
    if (!existsSync(filePath)) continue;
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      // Malformed JSON — skip silently (upstream parity).
      continue;
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) continue;

    for (const [name, cfg] of Object.entries(data as Record<string, unknown>)) {
      if (typeof name !== "string" || typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
        continue;
      }
      if (BUILTIN_PROVIDERS.has(name)) continue;
      // Global wins over local: if we already loaded this name from the local
      // file and now see it in global, overwrite with the trusted global copy.
      const typedCfg = cfg as Record<string, unknown>;
      const baseUrl = String(typedCfg["base_url"] ?? "");
      if (!providerBaseUrlOk(baseUrl, name)) continue;

      const finalCfg: CustomProviderConfig = {
        ...(typedCfg as Omit<CustomProviderConfig, "base_url" | "pricing">),
        base_url: baseUrl,
        default_model: String(typedCfg["default_model"] ?? ""),
        env_key: String(typedCfg["env_key"] ?? ""),
        pricing:
          typeof typedCfg["pricing"] === "object" && typedCfg["pricing"] !== null
            ? (typedCfg["pricing"] as { input: number; output: number })
            : { input: 0, output: 0 },
      };
      providers[name] = finalCfg;
    }
  }

  return providers;
}
