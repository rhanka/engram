import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { main } from "../src/cli.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-cli-qa-"));
  tempDirs.push(dir);
  return dir;
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

function writeJson(path: string, value: unknown): void {
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

async function runCli(args: string[], cwd: string, options: { interceptExit?: boolean } = {}) {
  const previousArgv = process.argv;
  const previousCwd = process.cwd();
  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;
  const logs: string[] = [];
  const errors: string[] = [];

  console.log = (...items: unknown[]) => { logs.push(items.join(" ")); };
  console.error = (...items: unknown[]) => { errors.push(items.join(" ")); };
  if (options.interceptExit) {
    process.exit = ((code?: string | number | null) => {
      throw new Error(`process.exit ${code ?? 0}`);
    }) as typeof process.exit;
  }

  process.argv = ["node", "graphify", ...args];
  process.chdir(cwd);
  try {
    await main();
    return { logs, errors, exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/^process\.exit (\d+)/);
    if (match) return { logs, errors, exitCode: Number(match[1]) };
    if (options.interceptExit) return { logs, errors: [...errors, message], exitCode: 1 };
    throw error;
  } finally {
    process.chdir(previousCwd);
    process.argv = previousArgv;
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  }
}

function writeGraph(root: string): void {
  writeJson(join(root, "bundle", "graph.json"), {
    directed: false,
    graph: {},
    nodes: [
      {
        id: "a",
        label: "A",
        source_file: "a.md",
        file_type: "document",
        description: "A.",
        citations: [],
        citation_count: 0,
      },
    ],
    links: [],
  });
}

describe("graphify qa CLI", () => {
  it("prints a passing JSON report for an advisory target", async () => {
    const root = tempDir();
    write(root + "/graphify.yaml", [
      "quality:",
      "  targets:",
      "    advisory:",
      "      kind: studio-static-bundle",
      "      bundle_path: bundle",
      "      publication:",
      "        blocking: false",
      "        require_resolved_manifest: false",
      "        data_allowlist:",
      "          - graph.json",
      "      citations:",
      "        display: inline",
      "        inline:",
      "          mode: top_k",
      "          top_k: 8",
      "      graph:",
      "        min_nodes: 1",
      "",
    ].join("\n"));
    writeGraph(root);

    const result = await runCli(["qa", "--target", "advisory"], root);

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.logs.join("\n"));
    expect(report.schema).toBe("graphify_qa_report_v1");
    expect(report.status).toBe("passed");
  });

  it("writes a report and exits non-zero for a failing blocking target", async () => {
    const root = tempDir();
    write(root + "/graphify.yaml", [
      "quality:",
      "  targets:",
      "    public:",
      "      kind: studio-static-bundle",
      "      bundle_path: bundle",
      "      publication:",
      "        blocking: true",
      "        require_resolved_manifest: true",
      "        data_allowlist:",
      "          - graph.json",
      "      citations:",
      "        display: inline",
      "        inline:",
      "          mode: top_k",
      "          top_k: 8",
      "      graph:",
      "        min_nodes: 1",
      "",
    ].join("\n"));
    writeGraph(root);

    const result = await runCli(["qa", "--target", "public", "--write-report"], root, {
      interceptExit: true,
    });

    expect(result.exitCode).toBe(1);
    const reportPath = join(root, "bundle", "quality-qa-report.json");
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, "utf-8"));
    expect(report.status).toBe("failed");
    expect(report.checks.some((check: { id: string }) => check.id === "manifest.required")).toBe(true);
  });
});
