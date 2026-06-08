/**
 * Custom LLM provider registry.
 *
 * Providers are registered in a providers.json file that maps a provider name
 * to its configuration (base_url, default_model, env_key, optional pricing).
 * Two locations are consulted:
 *
 *   1. ~/.graphify/providers.json  — the user's own file; always trusted.
 *   2. ./.graphify/providers.json  — project-local file that travels with the
 *      repo; gated behind GRAPHIFY_ALLOW_LOCAL_PROVIDERS=1 because it controls
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

/** Path to the user's global providers.json (~/.graphify/providers.json). */
export function globalProvidersPath(): string {
  return resolve(join(os.homedir(), ".graphify", "providers.json"));
}

/** Path to the project-local providers.json (./.graphify/providers.json). */
export function localProvidersPath(root?: string): string {
  return resolve(join(root ?? ".", ".graphify", "providers.json"));
}

// ---------------------------------------------------------------------------
// Options interface for testability
// ---------------------------------------------------------------------------

/** Options that override the real filesystem paths and env for testing. */
export interface LoadCustomProvidersOptions {
  /** Override global providers.json path (default: ~/.graphify/providers.json). */
  globalPath?: string;
  /** Override project-local providers.json path (default: ./.graphify/providers.json). */
  localPath?: string;
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
  const globalPath = options.globalPath ?? globalProvidersPath();
  const localPath = options.localPath ?? localProvidersPath();

  const allowLocal =
    ["1", "true", "yes"].includes((env["GRAPHIFY_ALLOW_LOCAL_PROVIDERS"] ?? "").trim().toLowerCase());

  // Warn if a project-local file exists but the opt-in flag is absent.
  if (existsSync(localPath) && !allowLocal) {
    console.warn(
      `[graphify] WARNING: ignoring project-local ${localPath} (custom providers control ` +
        "where your corpus and API key are sent). Set GRAPHIFY_ALLOW_LOCAL_PROVIDERS=1 to load it.",
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
