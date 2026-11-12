import { describe, expect, it } from "vitest";
import {
  normalizeProjectConfig,
  parseProjectConfig,
  validateProjectConfig,
} from "../src/project-config.js";

const baseConfig = {
  version: 1,
  profile: { path: "profiles/app-context/v1/profile.yaml" },
  inputs: { corpus: ["."] },
};

describe("project-config app_context block (Lot L1, §3.4, §6.1)", () => {
  it("applies documented defaults including retention.max_commits_per_repo = 10", () => {
    const normalizedOmitted = normalizeProjectConfig({ ...baseConfig }, "/repo/engram.yaml");
    expect(normalizedOmitted.app_context).toEqual({
      enabled: false,
      retention: { max_commits_per_repo: 10 },
      specs: { include: ["docs/spec/**/*.md"], exclude: [] },
      data_model: {
        default_dialect: "postgres",
        default_schema: "public",
        sql_include: ["**/*.sql"],
        orm_include: [],
      },
      call_graph: { max_hops: 3 },
      ui: { routes: [] },
      http_client_wrappers: [],
      url_helpers: [],
    });

    const normalizedEmpty = normalizeProjectConfig(
      { ...baseConfig, app_context: { enabled: true } },
      "/repo/engram.yaml",
    );
    expect(normalizedEmpty.app_context.enabled).toBe(true);
    expect(normalizedEmpty.app_context.retention.max_commits_per_repo).toBe(10);
    expect(normalizedEmpty.app_context.specs).toEqual({
      include: ["docs/spec/**/*.md"],
      exclude: [],
    });
    expect(normalizedEmpty.app_context.data_model).toEqual({
      default_dialect: "postgres",
      default_schema: "public",
      sql_include: ["**/*.sql"],
      orm_include: [],
    });
    expect(normalizedEmpty.app_context.call_graph.max_hops).toBe(3);
  });

  it("normalizes both local ({ file, local_symbol }) and imported ({ import_from, export_name }) url_helpers and pilot config (§6.1) composed with baseConfig (MAJOR 3)", () => {
    const rawYaml = [
      "version: 1",
      "profile:",
      '  path: "profiles/app-context/v1/profile.yaml"',
      "inputs:",
      '  corpus: ["."]',
      "app_context:",
      "  enabled: true",
      '  spec_map: ".engram/spec-map.yaml"',
      "  retention:",
      "    max_commits_per_repo: 10",
      "  specs:",
      '    include: ["docs/spec/**/*.md"]',
      '    exclude: ["docs/spec/reports/**"]',
      "  data_model:",
      '    default_dialect: "postgres"',
      '    default_schema: "public"',
      '    sql_include: ["api/drizzle/**/*.sql"]',
      '    orm_include: ["api/src/db/schema.ts"]',
      "  call_graph:",
      "    max_hops: 3",
      "  ui:",
      "    routes:",
      '      - pattern: "#/evaluation"',
      '        router_kind: "hash"',
      '        component: "ui/src/lib/components/maps/EvaluationMapView.svelte"',
      "  http_client_wrappers:",
      '    - import_from: "ui/src/lib/net/fetch-with-timeout.ts"',
      '      export_name: "fetchWithTimeout"',
      "      url_arg_index: 0",
      "      options_arg_index: 1",
      '      method_option_path: ["init", "method"]',
      "  url_helpers:",
      '    - file: "ui/src/lib/prospect/prospect-marks-client.ts"',
      '      local_symbol: "apiUrl"',
      "      path_arg_index: 0",
      '      prefix: ""',
      '    - import_from: "ui/src/lib/net/api-url.ts"',
      '      export_name: "buildApiUrl"',
      "      path_arg_index: 0",
      '      prefix: "/api"',
    ].join("\n");

    const parsed = parseProjectConfig(rawYaml, "/repo/engram.yaml");
    expect(validateProjectConfig(parsed)).toEqual([]);

    const normalized = normalizeProjectConfig(parsed, "/repo/engram.yaml");
    expect(normalized.profile).toEqual({
      path: "profiles/app-context/v1/profile.yaml",
      resolvedPath: "/repo/profiles/app-context/v1/profile.yaml",
    });
    expect(normalized.inputs.corpus).toEqual(["/repo"]);
    expect(normalized.app_context).toEqual({
      enabled: true,
      spec_map: ".engram/spec-map.yaml",
      retention: { max_commits_per_repo: 10 },
      specs: {
        include: ["docs/spec/**/*.md"],
        exclude: ["docs/spec/reports/**"],
      },
      data_model: {
        default_dialect: "postgres",
        default_schema: "public",
        sql_include: ["api/drizzle/**/*.sql"],
        orm_include: ["api/src/db/schema.ts"],
      },
      call_graph: { max_hops: 3 },
      ui: {
        routes: [
          {
            pattern: "#/evaluation",
            router_kind: "hash",
            component: "ui/src/lib/components/maps/EvaluationMapView.svelte",
            export_name: "default",
          },
        ],
      },
      http_client_wrappers: [
        {
          import_from: "ui/src/lib/net/fetch-with-timeout.ts",
          export_name: "fetchWithTimeout",
          url_arg_index: 0,
          options_arg_index: 1,
          method_option_path: ["init", "method"],
        },
      ],
      url_helpers: [
        {
          file: "ui/src/lib/prospect/prospect-marks-client.ts",
          local_symbol: "apiUrl",
          path_arg_index: 0,
          prefix: "",
        },
        {
          import_from: "ui/src/lib/net/api-url.ts",
          export_name: "buildApiUrl",
          path_arg_index: 0,
          prefix: "/api",
        },
      ],
    });
  });

  it("preserves legacy profile.path and inputs.corpus validation errors and explicit corpus scope for omitted, empty, and disabled app_context blocks (MAJOR 3)", () => {
    for (const candidate of [
      {},
      { app_context: {} },
      { app_context: { enabled: false } },
      { app_context: { enabled: true } },
    ]) {
      expect(validateProjectConfig(candidate)).toEqual([
        "profile.path is required",
        "inputs.corpus must contain at least one path",
      ]);
      expect(() => normalizeProjectConfig(candidate, "/consumer/engram.yaml")).toThrow(
        /profile\.path is required[\s\S]*inputs\.corpus must contain at least one path/,
      );
    }

    for (const candidate of [
      { profile: { path: "custom/profile.yaml" } },
      { profile: { path: "custom/profile.yaml" }, app_context: {} },
      { profile: { path: "custom/profile.yaml" }, app_context: { enabled: false } },
    ]) {
      expect(validateProjectConfig(candidate)).toEqual([
        "inputs.corpus must contain at least one path",
      ]);
      expect(() => normalizeProjectConfig(candidate, "/consumer/engram.yaml")).toThrow(
        /inputs\.corpus must contain at least one path/,
      );
    }

    const withExplicitScope = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "custom/profile.yaml" },
        inputs: { corpus: ["packages/core"] },
        app_context: { enabled: false },
      },
      "/consumer/engram.yaml",
    );
    expect(withExplicitScope.profile).toEqual({
      path: "custom/profile.yaml",
      resolvedPath: "/consumer/custom/profile.yaml",
    });
    expect(withExplicitScope.inputs.corpus).toEqual(["/consumer/packages/core"]);
    expect(withExplicitScope.app_context.enabled).toBe(false);
  });

  it.each([
    { maxCommits: 1, maxHops: 1, dialect: "sqlite" as const, schema: "main" },
    { maxCommits: 20, maxHops: 6, dialect: "mysql" as const, schema: "analytics" },
  ])(
    "honors valid non-default retention=$maxCommits and call_graph.max_hops=$maxHops (MINOR 2)",
    ({ maxCommits, maxHops, dialect, schema }) => {
      const normalized = normalizeProjectConfig(
        {
          ...baseConfig,
          app_context: {
            enabled: true,
            retention: { max_commits_per_repo: maxCommits },
            call_graph: { max_hops: maxHops },
            data_model: { default_dialect: dialect, default_schema: schema },
          },
        },
        "/repo/engram.yaml",
      );
      expect(normalized.app_context.retention.max_commits_per_repo).toBe(maxCommits);
      expect(normalized.app_context.call_graph.max_hops).toBe(maxHops);
      expect(normalized.app_context.data_model.default_dialect).toBe(dialect);
      expect(normalized.app_context.data_model.default_schema).toBe(schema);
    },
  );

  describe("rejects YAML !!set and !!omap at root and nested configuration objects (MINOR 1)", () => {
    const baseYamlHeader = [
      "version: 1",
      "profile:",
      '  path: "profiles/app-context/v1/profile.yaml"',
      "inputs:",
      '  corpus: ["."]',
    ].join("\n");

    it.each([
      {
        label: "document root !!set",
        yaml: "!!set\n? profile\n? inputs\n",
        expectedError: /profile\.path is required/,
      },
      {
        label: "document root !!omap",
        yaml: "!!omap\n- version: 1\n",
        expectedError: /profile\.path is required/,
      },
      {
        label: "app_context !!set with unknown option",
        yaml: `${baseYamlHeader}\napp_context: !!set {unknown_option: null}\n`,
        expectedError: /app_context must be an object/,
      },
      {
        label: "app_context !!omap with enabled: true",
        yaml: `${baseYamlHeader}\napp_context: !!omap\n  - enabled: true\n`,
        expectedError: /app_context must be an object/,
      },
      {
        label: "app_context.retention !!set",
        yaml: `${baseYamlHeader}\napp_context:\n  retention: !!set {max_commits_per_repo: null}\n`,
        expectedError: /app_context\.retention must be an object/,
      },
      {
        label: "app_context.retention !!omap",
        yaml: `${baseYamlHeader}\napp_context:\n  retention: !!omap\n    - max_commits_per_repo: 5\n`,
        expectedError: /app_context\.retention must be an object/,
      },
      {
        label: "app_context.specs !!set",
        yaml: `${baseYamlHeader}\napp_context:\n  specs: !!set {include: null}\n`,
        expectedError: /app_context\.specs must be an object/,
      },
      {
        label: "app_context.data_model !!set",
        yaml: `${baseYamlHeader}\napp_context:\n  data_model: !!set {default_dialect: null}\n`,
        expectedError: /app_context\.data_model must be an object/,
      },
      {
        label: "app_context.call_graph !!set",
        yaml: `${baseYamlHeader}\napp_context:\n  call_graph: !!set {max_hops: null}\n`,
        expectedError: /app_context\.call_graph must be an object/,
      },
      {
        label: "app_context.ui !!set",
        yaml: `${baseYamlHeader}\napp_context:\n  ui: !!set {routes: null}\n`,
        expectedError: /app_context\.ui must be an object/,
      },
      {
        label: "app_context.ui.routes[0] !!set",
        yaml: `${baseYamlHeader}\napp_context:\n  ui:\n    routes:\n      - !!set {pattern: null}\n`,
        expectedError: /app_context\.ui\.routes\[0\] must be an object/,
      },
      {
        label: "app_context.http_client_wrappers[0] !!set",
        yaml: `${baseYamlHeader}\napp_context:\n  http_client_wrappers:\n    - !!set {import_from: null}\n`,
        expectedError: /app_context\.http_client_wrappers\[0\] must be an object/,
      },
      {
        label: "app_context.url_helpers[0] !!set",
        yaml: `${baseYamlHeader}\napp_context:\n  url_helpers:\n    - !!set {file: null}\n`,
        expectedError: /app_context\.url_helpers\[0\] must be an object/,
      },
    ])("rejects $label", ({ yaml, expectedError }) => {
      const parsed = parseProjectConfig(yaml, "/repo/engram.yaml");
      const errors = validateProjectConfig(parsed);
      expect(errors.some((e) => expectedError.test(e))).toBe(true);
      expect(() => normalizeProjectConfig(parsed, "/repo/engram.yaml")).toThrow(expectedError);
    });
  });

  describe("table-driven invalid app_context option rejections (MINOR 2)", () => {
    it.each([
      {
        label: "retention.max_commits_per_repo = 0 (lower bound)",
        appContext: { retention: { max_commits_per_repo: 0 } },
        expectedError: /retention\.max_commits_per_repo/,
      },
      {
        label: "retention.max_commits_per_repo = -3 (negative)",
        appContext: { retention: { max_commits_per_repo: -3 } },
        expectedError: /retention\.max_commits_per_repo/,
      },
      {
        label: "retention.max_commits_per_repo = 1.5 (fractional)",
        appContext: { retention: { max_commits_per_repo: 1.5 } },
        expectedError: /retention\.max_commits_per_repo/,
      },
      {
        label: "retention.max_commits_per_repo = '10' (wrong type)",
        appContext: { retention: { max_commits_per_repo: "10" as never } },
        expectedError: /retention\.max_commits_per_repo/,
      },
      {
        label: "call_graph.max_hops = 0 (lower bound)",
        appContext: { call_graph: { max_hops: 0 } },
        expectedError: /call_graph\.max_hops/,
      },
      {
        label: "call_graph.max_hops = 7 (upper bound)",
        appContext: { call_graph: { max_hops: 7 } },
        expectedError: /call_graph\.max_hops/,
      },
      {
        label: "call_graph.max_hops = 2.5 (fractional)",
        appContext: { call_graph: { max_hops: 2.5 } },
        expectedError: /call_graph\.max_hops/,
      },
      {
        label: "call_graph.max_hops = '3' (wrong type)",
        appContext: { call_graph: { max_hops: "3" as never } },
        expectedError: /call_graph\.max_hops/,
      },
      {
        label: "data_model.default_dialect = 'oracle' (unknown dialect)",
        appContext: { data_model: { default_dialect: "oracle" as never } },
        expectedError: /data_model\.default_dialect/,
      },
      {
        label: "ui.routes[0].router_kind = 'memory' (unknown router_kind)",
        appContext: {
          ui: {
            routes: [{ pattern: "/x", router_kind: "memory" as never, component: "ui/X.svelte" }],
          },
        },
        expectedError: /router_kind/,
      },
      {
        label: "url_helpers[0] mixing local and imported fields",
        appContext: {
          url_helpers: [
            {
              file: "a.ts",
              local_symbol: "fn",
              import_from: "b.ts",
              export_name: "fn",
              path_arg_index: 0,
            } as never,
          ],
        },
        expectedError: /url_helpers/,
      },
      {
        label: "url_helpers[0] missing local_symbol",
        appContext: {
          url_helpers: [{ file: "a.ts", path_arg_index: 0 } as never],
        },
        expectedError: /url_helpers/,
      },
      {
        label: "url_helpers[0] fractional path_arg_index",
        appContext: {
          url_helpers: [{ file: "a.ts", local_symbol: "fn", path_arg_index: 0.5 }],
        },
        expectedError: /path_arg_index/,
      },
      {
        label: "unknown top-level key inside app_context",
        appContext: { unknown_option: true } as never,
        expectedError: /unknown_option/,
      },
    ])("rejects $label", ({ appContext, expectedError }) => {
      const config = { ...baseConfig, app_context: appContext };
      const errors = validateProjectConfig(config);
      expect(errors.some((e) => expectedError.test(e))).toBe(true);
      expect(() => normalizeProjectConfig(config, "/repo/engram.yaml")).toThrow(expectedError);
    });
  });
});
