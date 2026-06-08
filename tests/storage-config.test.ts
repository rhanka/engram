/**
 * Tests for PR4: storage: YAML block, env resolution, secret-in-YAML validation.
 * TDD: these tests are written before the implementation.
 */
import { describe, expect, it, afterEach, beforeEach } from "vitest";

import { validateProjectConfig, parseProjectConfig } from "../src/project-config.js";
import { resolveStoreConfig } from "../src/storage/config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    profile: { path: "graphify/ontology-profile.yaml" },
    inputs: { corpus: ["raw"] },
    ...overrides,
  };
}

// Env isolation helpers
const savedEnv: Record<string, string | undefined> = {};
const envKeys = [
  "GRAPHIFY_STORE",
  "GRAPHIFY_NEO4J_URI",
  "GRAPHIFY_NEO4J_USER",
  "GRAPHIFY_NEO4J_PASSWORD",
  "GRAPHIFY_NEO4J_DATABASE",
  "GRAPHIFY_SPANNER_PROJECT",
  "GRAPHIFY_SPANNER_INSTANCE",
  "GRAPHIFY_SPANNER_DATABASE",
];

beforeEach(() => {
  for (const key of envKeys) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

// ---------------------------------------------------------------------------
// Part 1: storage: block in project config validation
// ---------------------------------------------------------------------------

describe("validateProjectConfig – storage block", () => {
  it("accepts a valid storage block with no secret keys", () => {
    const raw = parseProjectConfig(
      [
        "version: 1",
        "profile:",
        "  path: graphify/ontology-profile.yaml",
        "inputs:",
        "  corpus: [raw]",
        "storage:",
        "  mirrors:",
        "    - backend: neo4j",
        "      uri: bolt://localhost:7687",
        "      user: neo4j",
        "      database: graphs",
        "      mode: merge",
        "      autoPush: false",
        "",
      ].join("\n"),
      "graphify.yaml",
    );

    const errors = validateProjectConfig(raw);
    expect(errors.filter((e) => e.includes("storage"))).toHaveLength(0);
  });

  it("rejects a storage mirror with 'password' key — secret must be env", () => {
    const raw = parseProjectConfig(
      [
        "version: 1",
        "profile:",
        "  path: graphify/ontology-profile.yaml",
        "inputs:",
        "  corpus: [raw]",
        "storage:",
        "  mirrors:",
        "    - backend: neo4j",
        "      password: s3cr3t",
        "",
      ].join("\n"),
      "graphify.yaml",
    );

    const errors = validateProjectConfig(raw);
    const secretErrors = errors.filter((e) => e.toLowerCase().includes("secret") || e.toLowerCase().includes("password") || e.toLowerCase().includes("env"));
    expect(secretErrors.length).toBeGreaterThan(0);
    // Message must reference env variable
    expect(secretErrors[0]).toMatch(/GRAPHIFY_/);
  });

  it("rejects a storage mirror with 'token' key", () => {
    const raw = parseProjectConfig(
      [
        "version: 1",
        "profile:",
        "  path: graphify/ontology-profile.yaml",
        "inputs:",
        "  corpus: [raw]",
        "storage:",
        "  mirrors:",
        "    - backend: neo4j",
        "      token: abc123",
        "",
      ].join("\n"),
      "graphify.yaml",
    );

    const errors = validateProjectConfig(raw);
    expect(errors.some((e) => e.toLowerCase().includes("token") || e.toLowerCase().includes("secret") || e.match(/GRAPHIFY_/))).toBe(true);
  });

  it("rejects a storage mirror with 'secret' key", () => {
    const raw = parseProjectConfig(
      [
        "version: 1",
        "profile:",
        "  path: graphify/ontology-profile.yaml",
        "inputs:",
        "  corpus: [raw]",
        "storage:",
        "  mirrors:",
        "    - backend: neo4j",
        "      secret: mysecret",
        "",
      ].join("\n"),
      "graphify.yaml",
    );

    const errors = validateProjectConfig(raw);
    expect(errors.some((e) => e.match(/GRAPHIFY_/))).toBe(true);
  });

  it("rejects a storage mirror with 'credential' key", () => {
    const raw = parseProjectConfig(
      [
        "version: 1",
        "profile:",
        "  path: graphify/ontology-profile.yaml",
        "inputs:",
        "  corpus: [raw]",
        "storage:",
        "  mirrors:",
        "    - backend: neo4j",
        "      credential: val",
        "",
      ].join("\n"),
      "graphify.yaml",
    );

    const errors = validateProjectConfig(raw);
    expect(errors.some((e) => e.match(/GRAPHIFY_/))).toBe(true);
  });

  it("rejects a storage mirror with 'pass' key", () => {
    const raw = parseProjectConfig(
      [
        "version: 1",
        "profile:",
        "  path: graphify/ontology-profile.yaml",
        "inputs:",
        "  corpus: [raw]",
        "storage:",
        "  mirrors:",
        "    - backend: neo4j",
        "      pass: pw",
        "",
      ].join("\n"),
      "graphify.yaml",
    );

    const errors = validateProjectConfig(raw);
    expect(errors.some((e) => e.match(/GRAPHIFY_/))).toBe(true);
  });

  it("rejects an unknown backend id, listing available ids", () => {
    const raw = parseProjectConfig(
      [
        "version: 1",
        "profile:",
        "  path: graphify/ontology-profile.yaml",
        "inputs:",
        "  corpus: [raw]",
        "storage:",
        "  mirrors:",
        "    - backend: unknowndb",
        "",
      ].join("\n"),
      "graphify.yaml",
    );

    const errors = validateProjectConfig(raw);
    const backendErrors = errors.filter((e) => e.includes("backend") || e.includes("unknowndb"));
    expect(backendErrors.length).toBeGreaterThan(0);
    // Must list available ids
    expect(backendErrors[0]).toMatch(/neo4j|file/);
  });

  it("accepts omitted storage block (no config = no error)", () => {
    const raw = parseProjectConfig(
      [
        "version: 1",
        "profile:",
        "  path: graphify/ontology-profile.yaml",
        "inputs:",
        "  corpus: [raw]",
        "",
      ].join("\n"),
      "graphify.yaml",
    );

    const errors = validateProjectConfig(raw);
    expect(errors.filter((e) => e.includes("storage"))).toHaveLength(0);
  });

  it("accepts mirrors array being absent under storage:", () => {
    const raw = parseProjectConfig(
      [
        "version: 1",
        "profile:",
        "  path: graphify/ontology-profile.yaml",
        "inputs:",
        "  corpus: [raw]",
        "storage: {}",
        "",
      ].join("\n"),
      "graphify.yaml",
    );

    const errors = validateProjectConfig(raw);
    expect(errors.filter((e) => e.includes("storage"))).toHaveLength(0);
  });

  it("rejects a non-string mode value", () => {
    const raw = parseProjectConfig(
      [
        "version: 1",
        "profile:",
        "  path: graphify/ontology-profile.yaml",
        "inputs:",
        "  corpus: [raw]",
        "storage:",
        "  mirrors:",
        "    - backend: neo4j",
        "      mode: overwrite",
        "",
      ].join("\n"),
      "graphify.yaml",
    );

    const errors = validateProjectConfig(raw);
    expect(errors.some((e) => e.includes("mode"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Part 2: normalizeProjectConfig — storage field in normalized output
// ---------------------------------------------------------------------------

describe("normalizeProjectConfig – storage field", () => {
  it("preserves autoPush defaulting to false when mirror has no autoPush", async () => {
    const { normalizeProjectConfig } = await import("../src/project-config.js");
    const normalized = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/ontology-profile.yaml" },
        inputs: { corpus: ["raw"] },
        storage: {
          mirrors: [{ backend: "neo4j", uri: "bolt://localhost:7687", user: "neo4j" }],
        },
      } as any,
      "graphify.yaml",
    );

    expect(normalized.storage).toBeDefined();
    expect(normalized.storage!.mirrors).toHaveLength(1);
    expect(normalized.storage!.mirrors[0].autoPush).toBe(false);
    expect(normalized.storage!.mirrors[0].backend).toBe("neo4j");
  });

  it("preserves autoPush: true when explicitly set", async () => {
    const { normalizeProjectConfig } = await import("../src/project-config.js");
    const normalized = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/ontology-profile.yaml" },
        inputs: { corpus: ["raw"] },
        storage: {
          mirrors: [{ backend: "neo4j", autoPush: true }],
        },
      } as any,
      "graphify.yaml",
    );

    expect(normalized.storage!.mirrors[0].autoPush).toBe(true);
  });

  it("returns undefined storage when no storage block", async () => {
    const { normalizeProjectConfig } = await import("../src/project-config.js");
    const normalized = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/ontology-profile.yaml" },
        inputs: { corpus: ["raw"] },
      },
      "graphify.yaml",
    );

    expect(normalized.storage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Part 3: resolveStoreConfig — env/flag/yaml precedence + secret handling
// ---------------------------------------------------------------------------

describe("resolveStoreConfig – env variable mapping", () => {
  it("reads neo4j URI, user, database from env when no yaml or flags", () => {
    process.env.GRAPHIFY_NEO4J_URI = "bolt://envhost:7687";
    process.env.GRAPHIFY_NEO4J_USER = "envuser";
    process.env.GRAPHIFY_NEO4J_DATABASE = "envdb";

    const config = resolveStoreConfig("neo4j", { env: process.env });

    expect(config.target).toBe("bolt://envhost:7687");
    expect(config.auth?.user).toBe("envuser");
    expect(config.database).toBe("envdb");
  });

  it("reads neo4j password from env, never from yaml or flags object", () => {
    process.env.GRAPHIFY_NEO4J_PASSWORD = "envpassword";

    const config = resolveStoreConfig("neo4j", { env: process.env });

    expect(config.auth?.password).toBe("envpassword");
  });

  it("CLI flags override env for neo4j URI", () => {
    process.env.GRAPHIFY_NEO4J_URI = "bolt://envhost:7687";

    const config = resolveStoreConfig("neo4j", {
      env: process.env,
      cliFlags: { uri: "bolt://clihost:7687" },
    });

    expect(config.target).toBe("bolt://clihost:7687");
  });

  it("CLI flags override env for namespace", () => {
    process.env.GRAPHIFY_NEO4J_URI = "bolt://envhost:7687";

    const config = resolveStoreConfig("neo4j", {
      env: process.env,
      cliFlags: { namespace: "cli-ns" },
    });

    expect(config.namespace).toBe("cli-ns");
  });

  it("YAML uri is used when no CLI flag and no env", () => {
    const projectConfig = {
      storage: {
        mirrors: [{ backend: "neo4j", uri: "bolt://yamlhost:7687", user: "yamluser" }],
      },
    };

    const config = resolveStoreConfig("neo4j", { projectConfig: projectConfig as any });

    expect(config.target).toBe("bolt://yamlhost:7687");
    expect(config.auth?.user).toBe("yamluser");
  });

  it("env overrides yaml for URI", () => {
    process.env.GRAPHIFY_NEO4J_URI = "bolt://envhost:7687";

    const projectConfig = {
      storage: {
        mirrors: [{ backend: "neo4j", uri: "bolt://yamlhost:7687", user: "yamluser" }],
      },
    };

    const config = resolveStoreConfig("neo4j", {
      env: process.env,
      projectConfig: projectConfig as any,
    });

    expect(config.target).toBe("bolt://envhost:7687");
  });

  it("CLI flag overrides env which overrides yaml (full precedence chain)", () => {
    process.env.GRAPHIFY_NEO4J_URI = "bolt://envhost:7687";

    const projectConfig = {
      storage: {
        mirrors: [{ backend: "neo4j", uri: "bolt://yamlhost:7687" }],
      },
    };

    const config = resolveStoreConfig("neo4j", {
      env: process.env,
      cliFlags: { uri: "bolt://clihost:7687" },
      projectConfig: projectConfig as any,
    });

    expect(config.target).toBe("bolt://clihost:7687");
  });

  it("spanner maps GRAPHIFY_SPANNER_PROJECT|INSTANCE|DATABASE env vars", () => {
    process.env.GRAPHIFY_SPANNER_PROJECT = "my-project";
    process.env.GRAPHIFY_SPANNER_INSTANCE = "my-instance";
    process.env.GRAPHIFY_SPANNER_DATABASE = "my-database";

    const config = resolveStoreConfig("spanner", { env: process.env });

    expect(config.project).toBe("my-project");
    expect(config.instance).toBe("my-instance");
    expect(config.database).toBe("my-database");
    // Spanner uses ADC — no password field
    expect((config as any).auth?.password).toBeUndefined();
  });

  it("GRAPHIFY_STORE env selects the default backend when backendId is omitted", () => {
    process.env.GRAPHIFY_STORE = "neo4j";
    process.env.GRAPHIFY_NEO4J_URI = "bolt://envhost:7687";

    // resolveStoreConfig without explicit backendId uses GRAPHIFY_STORE
    const config = resolveStoreConfig(undefined, { env: process.env });

    expect(config.target).toBe("bolt://envhost:7687");
  });

  it("autoPush is false by default from normalized mirror config", () => {
    const projectConfig = {
      storage: {
        mirrors: [{ backend: "neo4j", uri: "bolt://host:7687" }],
      },
    };

    const config = resolveStoreConfig("neo4j", { projectConfig: projectConfig as any });

    expect(config.autoPush).toBe(false);
  });

  it("autoPush is true when mirror sets it", () => {
    const projectConfig = {
      storage: {
        mirrors: [{ backend: "neo4j", uri: "bolt://host:7687", autoPush: true }],
      },
    };

    const config = resolveStoreConfig("neo4j", { projectConfig: projectConfig as any });

    expect(config.autoPush).toBe(true);
  });

  it("neo4j database from yaml when not in env", () => {
    const projectConfig = {
      storage: {
        mirrors: [{ backend: "neo4j", uri: "bolt://host:7687", database: "mydb" }],
      },
    };

    const config = resolveStoreConfig("neo4j", { projectConfig: projectConfig as any });

    expect(config.database).toBe("mydb");
  });

  it("namespace from yaml mirror", () => {
    const projectConfig = {
      storage: {
        mirrors: [{ backend: "neo4j", namespace: "yaml-ns" }],
      },
    };

    const config = resolveStoreConfig("neo4j", { projectConfig: projectConfig as any });

    expect(config.namespace).toBe("yaml-ns");
  });

  it("returns empty config object for unknown backend when no env/flags", () => {
    const config = resolveStoreConfig("file", {});
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });
});
