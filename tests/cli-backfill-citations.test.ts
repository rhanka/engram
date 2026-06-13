/**
 * `graphify backfill-citations [path]` — end-to-end via the real CLI program.
 * Asserts the projection writes citation_count + a trimmed inline set +
 * citations.json, prints the LOWER-BOUND caveat, and is a no-op on re-run.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { main } from "../src/cli.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const d = tempDirs.pop()!;
    try { require("node:fs").rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

function legacyGraphProject(citationCount: number): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-backfill-cli-"));
  tempDirs.push(dir);
  const graphDir = join(dir, ".graphify");
  mkdirSync(graphDir, { recursive: true });
  const citations = [];
  for (let i = 0; i < citationCount; i += 1) {
    citations.push({ source_file: `work${i % 10}.txt`, page: i, section: `ch${i % 3}` });
  }
  writeFileSync(
    join(graphDir, "graph.json"),
    JSON.stringify({
      directed: false,
      graph: {},
      nodes: [
        { id: "sherlock", label: "Sherlock", file_type: "document", source_file: "work0.txt", community: 0, citations },
        { id: "bare", label: "Bare", file_type: "document", source_file: "work1.txt", community: 0 },
      ],
      links: [],
      community_labels: { "0": "Mystery" },
    }),
    "utf-8",
  );
  return dir;
}

async function runCli(args: string[], cwd: string) {
  const previousArgv = process.argv;
  const previousCwd = process.cwd();
  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;
  const logs: string[] = [];
  const errors: string[] = [];
  console.log = (...items: unknown[]) => { logs.push(items.join(" ")); };
  console.error = (...items: unknown[]) => { errors.push(items.join(" ")); };
  process.exit = ((code?: string | number | null) => {
    throw new Error(`process.exit ${code ?? 0}`);
  }) as typeof process.exit;
  process.argv = ["node", "graphify", ...args];
  process.chdir(cwd);
  try {
    await main();
    return { logs, errors, exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/^process\.exit (\d+)/);
    if (match) return { logs, errors, exitCode: Number(match[1]) };
    return { logs, errors: [...errors, message], exitCode: 1 };
  } finally {
    process.chdir(previousCwd);
    process.argv = previousArgv;
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  }
}

describe("graphify backfill-citations", () => {
  it("populates fields + store and prints the lower-bound caveat", async () => {
    const dir = legacyGraphProject(20);
    const { logs } = await runCli(["backfill-citations", dir], dir);

    const graph = JSON.parse(readFileSync(join(dir, ".graphify", "graph.json"), "utf-8")) as {
      nodes: Array<{ id: string; citations?: unknown[]; citation_count?: number }>;
    };
    const sherlock = graph.nodes.find((n) => n.id === "sherlock")!;
    expect(sherlock.citation_count).toBe(20);
    expect(sherlock.citations).toHaveLength(8); // default K (mixed/global)

    expect(existsSync(join(dir, ".graphify", "ontology", "citations.json"))).toBe(true);
    const sidecar = JSON.parse(
      readFileSync(join(dir, ".graphify", "ontology", "citations.json"), "utf-8"),
    ) as { nodes: Record<string, { count: number; citations: unknown[] }> };
    expect(sidecar.nodes.sherlock.count).toBe(20);
    expect(sidecar.nodes.sherlock.citations).toHaveLength(20);

    const caveat = logs.join("\n");
    expect(caveat).toMatch(/LOWER BOUND/i);
    expect(caveat).toMatch(/[Rr]e-extract/);
  });

  it("is a no-op on a second run (idempotent)", async () => {
    const dir = legacyGraphProject(20);
    await runCli(["backfill-citations", dir], dir);
    const afterFirst = readFileSync(join(dir, ".graphify", "graph.json"), "utf-8");

    const { logs } = await runCli(["backfill-citations", dir], dir);
    const afterSecond = readFileSync(join(dir, ".graphify", "graph.json"), "utf-8");

    expect(afterSecond).toBe(afterFirst); // graph.json untouched
    expect(logs.join("\n")).toMatch(/nothing to backfill/i);
  });

  it("respects --citations-top-k", async () => {
    const dir = legacyGraphProject(20);
    await runCli(["backfill-citations", dir, "--citations-top-k", "3"], dir);
    const graph = JSON.parse(readFileSync(join(dir, ".graphify", "graph.json"), "utf-8")) as {
      nodes: Array<{ id: string; citations?: unknown[]; citation_count?: number }>;
    };
    const sherlock = graph.nodes.find((n) => n.id === "sherlock")!;
    expect(sherlock.citation_count).toBe(20);
    expect(sherlock.citations).toHaveLength(3);
  });
});
