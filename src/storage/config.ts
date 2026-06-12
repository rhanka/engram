/**
 * Storage config resolution for PR4.
 *
 * resolveStoreConfig() merges CLI flags > environment variables > YAML config
 * into a GraphStoreConfig ready for resolveGraphStore().
 *
 * Secrets (passwords) come exclusively from environment variables.
 * The YAML `storage:` block is never consulted for secrets.
 * (SPEC_STORAGE_BACKENDS.md, "Secret Handling", "CLI And Config Surface")
 */

import type { GraphStoreConfig } from "./types.js";
import type { NormalizedProjectConfig } from "../types.js";

/**
 * CLI flags that can override env / yaml values. These are the non-secret
 * connection parameters a user may supply on the command line.
 */
export interface StorageCliFlags {
  /** Backend Bolt URI (neo4j) or file path (file). */
  uri?: string;
  /** Target namespace for pushes. */
  namespace?: string;
  /** Database name. */
  database?: string;
  /** User name (non-secret; password must come from env). */
  user?: string;
  /** Spanner project id. */
  project?: string;
  /** Spanner instance id. */
  instance?: string;
  /** SQL schema/keyspace (postgres/pgvector; non-secret). */
  schema?: string;
}

/**
 * Inputs for config resolution. All fields are optional so call sites only
 * pass what they have.
 */
export interface ResolveStoreConfigInput {
  /** CLI flags — highest precedence. */
  cliFlags?: StorageCliFlags;
  /**
   * Environment variable map. Defaults to `process.env` when omitted.
   * Accepting an explicit map makes tests fully hermetic.
   */
  env?: NodeJS.ProcessEnv;
  /** Normalized project config (from graphify.yaml). Lowest precedence. */
  projectConfig?: Pick<NormalizedProjectConfig, "storage">;
}

/**
 * Resolve a GraphStoreConfig for the given backend id from the three-layer
 * precedence chain: CLI flags > env vars > YAML config.
 *
 * @param backendId - The store id (e.g. "neo4j", "file"). When undefined,
 *   GRAPHIFY_STORE is consulted; if that is also absent the returned config
 *   has no backend-specific values.
 * @param input - Sources to merge.
 * @returns A GraphStoreConfig ready for resolveGraphStore().
 */
export function resolveStoreConfig(
  backendId: string | undefined,
  input: ResolveStoreConfigInput,
): GraphStoreConfig {
  const { cliFlags = {}, env = process.env, projectConfig } = input;

  // Determine effective backend id
  const effectiveId = backendId ?? env["GRAPHIFY_STORE"] ?? undefined;

  // Pull yaml mirror for the effective backend (lowest precedence)
  const yamlMirror = findMirror(projectConfig, effectiveId);

  // Build resolved config by merging layers: yaml < env < cli
  const config: GraphStoreConfig = {};

  if (effectiveId === "neo4j" || (!effectiveId && env["GRAPHIFY_NEO4J_URI"])) {
    config.target =
      cliFlags.uri ??
      env["GRAPHIFY_NEO4J_URI"] ??
      yamlMirror?.uri;

    const user = cliFlags.user ?? env["GRAPHIFY_NEO4J_USER"] ?? yamlMirror?.user;
    // Password comes from env only — never from yaml or cliFlags object
    const password = env["GRAPHIFY_NEO4J_PASSWORD"];

    if (user !== undefined || password !== undefined) {
      config.auth = {};
      if (user !== undefined) config.auth.user = user;
      if (password !== undefined) config.auth.password = password;
    }

    config.database =
      cliFlags.database ??
      env["GRAPHIFY_NEO4J_DATABASE"] ??
      yamlMirror?.database;
  } else if (effectiveId === "spanner") {
    // Spanner authenticates through Application Default Credentials (ADC).
    // No password variable by design.
    config.project =
      cliFlags.project ??
      env["GRAPHIFY_SPANNER_PROJECT"] ??
      yamlMirror?.project;

    config.instance =
      cliFlags.instance ??
      env["GRAPHIFY_SPANNER_INSTANCE"] ??
      yamlMirror?.instance;

    config.database =
      cliFlags.database ??
      env["GRAPHIFY_SPANNER_DATABASE"] ??
      yamlMirror?.database;
  } else if (effectiveId === "postgres" || effectiveId === "pgvector") {
    // Postgres / pgvector. The DSN (connectionString) is a secret — it can
    // embed user:password — so it is read from the environment ONLY and never
    // from YAML or a CLI flag object (SPEC_STORAGE_BACKENDS.md, Secret
    // Handling). Schema and SSL are non-secret and may come from env or YAML.
    const connectionString = env["GRAPHIFY_POSTGRES_URL"];
    if (connectionString !== undefined) {
      config.connectionString = connectionString;
    }

    config.schema =
      cliFlags.schema ??
      env["GRAPHIFY_POSTGRES_SCHEMA"] ??
      yamlMirror?.schema;

    const sslRaw = env["GRAPHIFY_POSTGRES_SSL"];
    if (sslRaw !== undefined) {
      config.ssl = sslRaw === "1" || sslRaw.toLowerCase() === "true";
    } else if (yamlMirror?.ssl !== undefined) {
      config.ssl = yamlMirror.ssl;
    }

    // Non-secret embedding config (provider/model/dimension) may come from
    // YAML; the provider API key stays env-only and is never modeled here.
    if (yamlMirror?.embedding !== undefined) {
      config.embedding = yamlMirror.embedding;
    }

    if (yamlMirror?.citySlug !== undefined) {
      config.citySlug = yamlMirror.citySlug;
    }
  } else if (effectiveId === "file" || effectiveId === undefined) {
    // file store or generic: uri becomes target if provided
    if (cliFlags.uri !== undefined) config.target = cliFlags.uri;
  } else {
    // Unknown / future backend — passthrough from yaml and env what we can
    if (cliFlags.uri !== undefined) {
      config.target = cliFlags.uri;
    } else if (yamlMirror?.uri !== undefined) {
      config.target = yamlMirror.uri;
    }
  }

  // Namespace: cli > yaml
  const namespace = cliFlags.namespace ?? yamlMirror?.namespace;
  if (namespace !== undefined) config.namespace = namespace;

  // autoPush from yaml mirror (CLI does not expose autoPush as a flag)
  if (yamlMirror !== undefined) {
    config.autoPush = yamlMirror.autoPush ?? false;
  }

  // mode from yaml mirror
  if (yamlMirror?.mode !== undefined) {
    config.mode = yamlMirror.mode;
  }

  return config;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findMirror(
  projectConfig: Pick<NormalizedProjectConfig, "storage"> | undefined,
  backendId: string | undefined,
): {
  uri?: string;
  user?: string;
  database?: string;
  project?: string;
  instance?: string;
  namespace?: string;
  autoPush?: boolean;
  mode?: "merge" | "replace";
  schema?: string;
  ssl?: boolean;
  citySlug?: string;
  embedding?: { provider?: string; model?: string; dimension?: number };
} | undefined {
  if (!projectConfig?.storage?.mirrors) return undefined;
  if (backendId === undefined) {
    return projectConfig.storage.mirrors[0];
  }
  return projectConfig.storage.mirrors.find((m) => m.backend === backendId);
}
