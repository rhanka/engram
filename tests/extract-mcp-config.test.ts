/**
 * F-0820-0827 M3: MCP (Model Context Protocol) config extractor.
 *
 * Port of upstream safishamsi 2c01a89 (mcp_ingest). Surfaces:
 *   - src/extract.ts: extractMcpConfig, isMcpConfigPath, filename dispatch,
 *     collectFiles inclusion of non-hidden MCP config filenames.
 *   - src/detect.ts: classifyFile returns CODE for MCP config filenames;
 *     MCP_CONFIG_FILENAMES export.
 *
 * Security parity checks: env VALUES never read (only NAMES), 1 MiB cap,
 * args not persisted (only a detected package id).
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractMcpConfig, isMcpConfigPath, collectFiles } from "../src/extract.js";
import { classifyFile, MCP_CONFIG_FILENAMES } from "../src/detect.js";
import { FileType } from "../src/types.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-mcp-"));
  tempDirs.push(dir);
  return dir;
}

function writeConfig(dir: string, name: string, doc: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(doc, null, 2), "utf-8");
  return path;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("isMcpConfigPath — filename recognition", () => {
  it("recognises every contract filename", () => {
    for (const name of [".mcp.json", "claude_desktop_config.json", "mcp.json", "mcp_servers.json"]) {
      expect(isMcpConfigPath(join("/x", name))).toBe(true);
    }
  });
  it("rejects unrelated json files", () => {
    expect(isMcpConfigPath("/x/package.json")).toBe(false);
    expect(isMcpConfigPath("/x/tsconfig.json")).toBe(false);
    expect(isMcpConfigPath("/x/mcp.yaml")).toBe(false);
  });
});

describe("extractMcpConfig — server / command / package / env nodes", () => {
  it("extracts a typical npx + env config into nodes and edges", () => {
    const dir = makeTempDir();
    const path = writeConfig(dir, "mcp.json", {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/data"],
          env: { ALLOWED_DIR: "/data", API_KEY: "sk-secret-do-not-read" },
        },
      },
    });

    const { nodes, edges, error } = extractMcpConfig(path, dir);
    expect(error).toBeUndefined();

    const byKind = (k: string) => nodes.filter((n) => n.node_type === k);
    expect(byKind("mcp_config_file")).toHaveLength(1);
    expect(byKind("mcp_server").map((n) => n.label)).toEqual(["filesystem"]);
    expect(byKind("mcp_command").map((n) => n.label)).toEqual(["npx"]);
    // Package id parsed from args, version stripped (none here), scope kept.
    expect(byKind("mcp_package").map((n) => n.label)).toEqual([
      "@modelcontextprotocol/server-filesystem",
    ]);
    // env: ONLY the NAMES become nodes.
    expect(byKind("env_var").map((n) => n.label).sort()).toEqual(["ALLOWED_DIR", "API_KEY"]);

    // Edge relations: contains / references / requires_env.
    const rel = (r: string) => edges.filter((e) => e.relation === r).length;
    expect(rel("contains")).toBe(1); // file -> server
    expect(rel("references")).toBe(2); // server -> command, server -> package
    expect(rel("requires_env")).toBe(2); // server -> each env var
  });

  it("NEVER reads env VALUES — only the names appear anywhere", () => {
    const dir = makeTempDir();
    const secret = "sk-super-secret-token-value";
    const path = writeConfig(dir, "mcp.json", {
      mcpServers: { s: { command: "node", env: { TOKEN: secret } } },
    });
    const { nodes, edges } = extractMcpConfig(path, dir);
    const blob = JSON.stringify({ nodes, edges });
    expect(blob).toContain("TOKEN");
    expect(blob).not.toContain(secret);
  });

  it("does NOT persist args (paths / positional secrets) as nodes", () => {
    const dir = makeTempDir();
    const path = writeConfig(dir, "mcp.json", {
      mcpServers: { s: { command: "npx", args: ["-y", "mcp-server-fetch", "/home/secret/path"] } },
    });
    const { nodes } = extractMcpConfig(path, dir);
    const labels = nodes.map((n) => n.label);
    expect(labels).not.toContain("/home/secret/path");
    expect(labels).not.toContain("-y");
    // The python-style package IS detected.
    expect(labels).toContain("mcp-server-fetch");
  });

  it("strips the @version suffix from scoped and unscoped npm packages", () => {
    const dir = makeTempDir();
    const path = writeConfig(dir, "mcp.json", {
      mcpServers: {
        a: { command: "npx", args: ["@org/pkg@1.2.3"] },
        b: { command: "npx", args: ["plain-pkg@4.5.6"] },
      },
    });
    const { nodes } = extractMcpConfig(path, dir);
    const pkgs = nodes.filter((n) => n.node_type === "mcp_package").map((n) => n.label).sort();
    // plain-pkg@4.5.6 is not an npm-scoped match and not a -mcp python match,
    // so only the scoped package is detected (version stripped).
    expect(pkgs).toEqual(["@org/pkg"]);
  });

  it("shares command / package / env nodes across servers (global ids)", () => {
    const dir = makeTempDir();
    const path = writeConfig(dir, "mcp.json", {
      mcpServers: {
        a: { command: "npx", args: ["@x/a-mcp"], env: { SHARED: "1" } },
        b: { command: "npx", args: ["@x/b-mcp"], env: { SHARED: "2" } },
      },
    });
    const { nodes } = extractMcpConfig(path, dir);
    // One shared "npx" command, one shared "SHARED" env var, two servers, two pkgs.
    expect(nodes.filter((n) => n.node_type === "mcp_command")).toHaveLength(1);
    expect(nodes.filter((n) => n.node_type === "env_var")).toHaveLength(1);
    expect(nodes.filter((n) => n.node_type === "mcp_server")).toHaveLength(2);
  });

  it("supports the nested {mcp:{servers:{...}}} shape", () => {
    const dir = makeTempDir();
    const path = writeConfig(dir, "mcp.json", {
      mcp: { servers: { only: { command: "node" } } },
    });
    const { nodes, error } = extractMcpConfig(path, dir);
    expect(error).toBeUndefined();
    expect(nodes.filter((n) => n.node_type === "mcp_server").map((n) => n.label)).toEqual(["only"]);
  });

  it("returns an error (not throw) when there is no mcpServers map", () => {
    const dir = makeTempDir();
    const path = writeConfig(dir, "mcp.json", { somethingElse: true });
    const { nodes, edges, error } = extractMcpConfig(path, dir);
    expect(error).toMatch(/no mcpServers map/);
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it("returns an error on malformed JSON (no throw)", () => {
    const dir = makeTempDir();
    const path = join(dir, "mcp.json");
    writeFileSync(path, "{not valid json", "utf-8");
    const { error } = extractMcpConfig(path, dir);
    expect(error).toMatch(/json error/);
  });

  it("returns an error on a non-object root", () => {
    const dir = makeTempDir();
    const path = join(dir, "mcp.json");
    writeFileSync(path, "[1,2,3]", "utf-8");
    const { error } = extractMcpConfig(path, dir);
    expect(error).toMatch(/root is not an object/);
  });

  it("rejects files larger than the 1 MiB cap", () => {
    const dir = makeTempDir();
    const path = join(dir, "mcp.json");
    // 1 MiB + a bit of valid-ish padding.
    const padding = " ".repeat(1_048_577);
    writeFileSync(path, `{"mcpServers":{}}${padding}`, "utf-8");
    const { error } = extractMcpConfig(path, dir);
    expect(error).toMatch(/too large/);
  });

  it("skips non-object server entries silently (no crash)", () => {
    const dir = makeTempDir();
    const path = writeConfig(dir, "mcp.json", {
      mcpServers: { good: { command: "node" }, broken: "not-an-object", alsoBroken: 42 },
    });
    const { nodes, error } = extractMcpConfig(path, dir);
    expect(error).toBeUndefined();
    expect(nodes.filter((n) => n.node_type === "mcp_server").map((n) => n.label)).toEqual(["good"]);
  });

  it("is deterministic: identical input yields identical nodes/edges", () => {
    const dir = makeTempDir();
    const doc = {
      mcpServers: {
        z: { command: "uvx", args: ["mcp-server-time"], env: { TZ: "UTC" } },
        a: { command: "npx", args: ["@m/a-mcp"] },
      },
    };
    const p1 = writeConfig(dir, "mcp.json", doc);
    const r1 = extractMcpConfig(p1, dir);
    const r2 = extractMcpConfig(p1, dir);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

describe("detect.classifyFile — MCP config filenames classified as CODE", () => {
  it("classifies every MCP config filename as CODE", () => {
    for (const name of MCP_CONFIG_FILENAMES) {
      expect(classifyFile(join("/proj", name))).toBe(FileType.CODE);
    }
  });
  it("leaves an ordinary .json file unclassified", () => {
    expect(classifyFile("/proj/data.json")).toBeNull();
  });
});

describe("collectFiles — non-hidden MCP configs picked up; .mcp.json stays hidden", () => {
  it("includes mcp.json / mcp_servers.json / claude_desktop_config.json from a directory walk", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "mcp.json"), "{}", "utf-8");
    writeFileSync(join(dir, "mcp_servers.json"), "{}", "utf-8");
    writeFileSync(join(dir, "claude_desktop_config.json"), "{}", "utf-8");
    writeFileSync(join(dir, "unrelated.json"), "{}", "utf-8"); // must NOT be collected
    writeFileSync(join(dir, ".mcp.json"), "{}", "utf-8"); // hidden — skipped on walk

    const collected = collectFiles(dir).map((p) => p.split("/").pop());
    expect(collected).toContain("mcp.json");
    expect(collected).toContain("mcp_servers.json");
    expect(collected).toContain("claude_desktop_config.json");
    expect(collected).not.toContain("unrelated.json");
    expect(collected).not.toContain(".mcp.json");
  });

  it("collects an explicit .mcp.json single-file target (hidden-file escape hatch)", () => {
    const dir = makeTempDir();
    const hidden = join(dir, ".mcp.json");
    writeFileSync(hidden, "{}", "utf-8");
    expect(collectFiles(hidden)).toEqual([hidden]);
  });
});
