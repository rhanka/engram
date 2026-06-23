/**
 * `graphify cite [path]` — end-to-end via the real CLI program. Asserts the
 * command grounds verbatim citations from a corpus source, UNIONS with existing
 * citations, re-aggregates into citation_count + a trimmed inline set +
 * citations.json, supports --dry-run / --only-missing, and never emits a
 * non-verbatim quote.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main } from "../src/cli.js";
import { normalizeForMatch, verifyVerbatim } from "../src/cite-grounding.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const d = tempDirs.pop()!;
    try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

const OCR_MARKDOWN = [
  "---",
  'graphify_source_file: "/abs/paper.pdf"',
  "graphify_conversion: mistral-ocr",
  "---",
  "",
  "# Introduction",
  "",
  "Le système CATIA V5 est au cœur de la conception assistée par ordinateur.",
  "",
  "---",
  "",
  "# Entretien avec Juliette Mattioli",
  "",
  "Juliette Mattioli explique que l'apprentissage automatique transforme l'industrie.",
].join("\n");

function citeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-cite-cli-"));
  tempDirs.push(dir);
  const graphDir = join(dir, ".graphify");
  mkdirSync(join(graphDir, "converted", "pdf"), { recursive: true });
  // Source lives under .graphify/converted/pdf (the always-searched root).
  writeFileSync(join(graphDir, "converted", "pdf", "paper.md"), OCR_MARKDOWN, "utf-8");
  writeFileSync(
    join(graphDir, "graph.json"),
    JSON.stringify({
      directed: false,
      graph: {},
      nodes: [
        { id: "p1", label: "Juliette Mattioli", file_type: "person", source_file: ".graphify/converted/pdf/paper.md", community: 0 },
        { id: "t1", label: "CATIA V5", file_type: "concept", node_type: "technology", source_file: ".graphify/converted/pdf/paper.md", community: 0 },
        { id: "x1", label: "Quetzalcoatl Spaceport", file_type: "concept", source_file: ".graphify/converted/pdf/paper.md", community: 0 },
      ],
      links: [],
      community_labels: { "0": "Aero" },
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

interface GraphNode { id: string; citations?: Array<{ quote?: string; source_file: string; page?: number }>; citation_count?: number }

function readGraph(dir: string): { nodes: GraphNode[] } {
  return JSON.parse(readFileSync(join(dir, ".graphify", "graph.json"), "utf-8")) as { nodes: GraphNode[] };
}

describe("graphify cite", () => {
  it("grounds verbatim citations, sets citation_count + inline set + citations.json", async () => {
    const dir = citeProject();
    const { logs } = await runCli(["cite", dir], dir);

    const graph = readGraph(dir);
    const mattioli = graph.nodes.find((n) => n.id === "p1")!;
    const catia = graph.nodes.find((n) => n.id === "t1")!;
    const fake = graph.nodes.find((n) => n.id === "x1")!;

    // Grounded nodes carry verbatim citations + a count.
    expect(mattioli.citations?.length).toBeGreaterThan(0);
    expect(mattioli.citation_count).toBeGreaterThan(0);
    expect(mattioli.citations?.[0]?.quote).toContain("apprentissage automatique");
    expect(mattioli.citations?.[0]?.page).toBe(2);

    expect(catia.citations?.some((c) => (c.quote ?? "").includes("CATIA"))).toBe(true);

    // The node whose term never appears stays uncited — no fabrication.
    expect(fake.citations ?? []).toHaveLength(0);

    // Anti-hallucination across the whole written graph.
    const norm = normalizeForMatch(OCR_MARKDOWN);
    for (const n of graph.nodes) {
      for (const c of n.citations ?? []) {
        if (typeof c.quote === "string") expect(verifyVerbatim(c.quote, norm)).toBe(true);
      }
    }

    // The Level-2 sidecar was written.
    expect(existsSync(join(dir, ".graphify", "ontology", "citations.json"))).toBe(true);
    const sidecar = JSON.parse(
      readFileSync(join(dir, ".graphify", "ontology", "citations.json"), "utf-8"),
    ) as { schema: string; nodes: Record<string, { count: number; citations: unknown[] }> };
    expect(sidecar.schema).toBe("graphify_ontology_citations_v1");
    expect(sidecar.nodes.p1?.count).toBeGreaterThan(0);

    expect(logs.join("\n")).toMatch(/grounded \d+ verbatim citation/i);
  });

  it("--dry-run reports coverage without writing", async () => {
    const dir = citeProject();
    const before = readFileSync(join(dir, ".graphify", "graph.json"), "utf-8");
    const { logs } = await runCli(["cite", dir, "--dry-run"], dir);
    const after = readFileSync(join(dir, ".graphify", "graph.json"), "utf-8");

    expect(after).toBe(before); // untouched
    expect(existsSync(join(dir, ".graphify", "ontology", "citations.json"))).toBe(false);
    expect(logs.join("\n")).toMatch(/dry-run.*would ground/i);
  });

  it("--only-missing skips already-cited nodes", async () => {
    const dir = citeProject();
    // First pass cites everything groundable.
    await runCli(["cite", dir], dir);
    const firstPass = readGraph(dir);
    const mattioliFirst = firstPass.nodes.find((n) => n.id === "p1")!.citations?.length ?? 0;
    expect(mattioliFirst).toBeGreaterThan(0);

    // Second pass with --only-missing must not change already-cited p1.
    const { logs } = await runCli(["cite", dir, "--only-missing"], dir);
    const secondPass = readGraph(dir);
    const mattioliSecond = secondPass.nodes.find((n) => n.id === "p1")!.citations?.length ?? 0;
    expect(mattioliSecond).toBe(mattioliFirst);
    expect(logs.join("\n")).toMatch(/cite:/i);
  });

  it("--types restricts to the requested node kinds", async () => {
    const dir = citeProject();
    await runCli(["cite", dir, "--types", "person"], dir);
    const graph = readGraph(dir);
    expect((graph.nodes.find((n) => n.id === "p1")!.citations ?? []).length).toBeGreaterThan(0);
    // CATIA (technology) was excluded.
    expect(graph.nodes.find((n) => n.id === "t1")!.citations ?? []).toHaveLength(0);
  });

  it("REGRESSION: --source is truly repeatable — a source only in the FIRST root still grounds", async () => {
    // Two extra source roots. The node's source_file lives ONLY under the first
    // root. Before the collect-function fix, Commander kept only the LAST
    // --source value, so the first root was dropped and the node never grounded.
    const dir = mkdtempSync(join(tmpdir(), "graphify-cite-multisrc-"));
    tempDirs.push(dir);
    const graphDir = join(dir, ".graphify");
    mkdirSync(graphDir, { recursive: true });

    const rootA = join(dir, "rootA");
    const rootB = join(dir, "rootB");
    mkdirSync(rootA, { recursive: true });
    mkdirSync(rootB, { recursive: true });
    // The paper lives ONLY in rootA; rootB has an unrelated file.
    writeFileSync(join(rootA, "paper.md"), OCR_MARKDOWN, "utf-8");
    writeFileSync(join(rootB, "other.md"), "# Unrelated\n\nNothing to see here.\n", "utf-8");

    writeFileSync(
      join(graphDir, "graph.json"),
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "p1", label: "Juliette Mattioli", file_type: "person", source_file: "paper.md", community: 0 },
        ],
        links: [],
        community_labels: { "0": "Aero" },
      }),
      "utf-8",
    );

    // Pass BOTH roots; rootB (the last value) does NOT contain paper.md.
    const { logs } = await runCli(
      ["cite", dir, "--source", rootA, "--source", rootB],
      dir,
    );

    const graph = readGraph(dir);
    const mattioli = graph.nodes.find((n) => n.id === "p1")!;
    // Grounds because rootA (the FIRST --source) is still searched.
    expect(mattioli.citations?.length).toBeGreaterThan(0);
    expect(mattioli.citations?.[0]?.quote).toContain("apprentissage automatique");
    expect(logs.join("\n")).toMatch(/grounded \d+ verbatim citation/i);
  });

  it("rejects an invalid --mode", async () => {
    const dir = citeProject();
    const { errors, exitCode } = await runCli(["cite", dir, "--mode", "bogus"], dir);
    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/--mode must be one of/i);
  });

  it("errors when no graph exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cite-empty-"));
    tempDirs.push(dir);
    const { errors, exitCode } = await runCli(["cite", dir], dir);
    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/no graph found/i);
  });
});
