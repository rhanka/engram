/**
 * SPEC_GRAPHIFY § "Enrichment Stages" — PHASE 1, RUNTIME finalization.
 *
 * REGRESSION (FIX 1): the runtime `analyze-build` / `finalize-build` paths
 * resolved EXISTING community labels and projected citations, but never ran the
 * salient-label or node-description stages — so a no-key runtime/assistant build
 * emitted neither `label-instructions/` NOR `description-instructions/`. They now
 * route through the shared `finalizeEnrichedGraphBuild` chokepoint exactly like
 * `graphify extract`, so "every finalization path" enriches.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const cleanupDirs: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-runtime-enrich-"));
  cleanupDirs.push(dir);
  return dir;
}

const PROVIDER_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "MISTRAL_API_KEY",
  "COHERE_API_KEY",
];

async function withApiKeysCleared<T>(fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const key of PROVIDER_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function runRuntime(args: string[]): Promise<void> {
  const { main } = await import("../src/skill-runtime.js");
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalErr = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    await main(["node", "skill-runtime", ...args]);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalErr;
  }
}

afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

/** A multi-node CODE extraction so clustering yields a labelable community. */
function writeExtract(stateDir: string, file: string): string {
  const node = (id: string, label: string) => ({
    id,
    label,
    file_type: "code",
    source_file: file,
    source_location: "L1",
  });
  const extractPath = join(stateDir, "extract.json");
  writeFileSync(
    extractPath,
    JSON.stringify({
      nodes: [
        node("alpha_fn", "alpha()"),
        node("beta_fn", "beta()"),
        node("gamma_fn", "gamma()"),
        node("delta_fn", "delta()"),
      ],
      edges: [
        { source: "alpha_fn", target: "beta_fn", relation: "calls", source_file: file },
        { source: "beta_fn", target: "gamma_fn", relation: "calls", source_file: file },
        { source: "gamma_fn", target: "delta_fn", relation: "calls", source_file: file },
        { source: "delta_fn", target: "alpha_fn", relation: "calls", source_file: file },
      ],
      input_tokens: 0,
      output_tokens: 0,
    }),
    "utf-8",
  );
  return extractPath;
}

function writeDetect(stateDir: string, file: string): string {
  const detectPath = join(stateDir, "detect.json");
  writeFileSync(
    detectPath,
    JSON.stringify({
      files: { code: [file], document: [], paper: [], image: [], video: [] },
      total_files: 1,
      total_words: 100,
      needs_graph: false,
      skipped_sensitive: [],
      graphifyignore_patterns: 0,
    }),
    "utf-8",
  );
  return detectPath;
}

describe("runtime analyze-build routes through the shared finalizer (no-key)", () => {
  it("emits BOTH label-instructions/ AND description-instructions/ in a no-key build", async () => {
    await withApiKeysCleared(async () => {
      const root = tempRoot();
      const stateDir = join(root, ".graphify");
      mkdirSync(stateDir, { recursive: true });
      const file = join(root, "src", "sample.ts");
      const extractPath = writeExtract(stateDir, file);
      const detectPath = writeDetect(stateDir, file);
      const graphPath = join(stateDir, "graph.json");

      await runRuntime([
        "analyze-build",
        "--extract", extractPath,
        "--detect", detectPath,
        "--root", root,
        "--graph-out", graphPath,
        "--report-out", join(stateDir, "report.md"),
        "--analysis-out", join(stateDir, "analysis.json"),
      ]);

      // graph.json written through the finalizer (persistGraphWithCitations).
      expect(existsSync(graphPath)).toBe(true);

      // FIX 1 PARITY: both instruction dirs now exist with at least one .md.
      const labelDir = join(stateDir, "label-instructions");
      const descDir = join(stateDir, "description-instructions");
      expect(existsSync(labelDir)).toBe(true);
      expect(existsSync(descDir)).toBe(true);
      expect(readdirSync(descDir).some((f) => f.endsWith(".md"))).toBe(true);
      expect(readdirSync(labelDir).some((f) => f.endsWith(".md"))).toBe(true);

      // No-key → assistant emit; nothing described into graph.json yet.
      const graph = JSON.parse(readFileSync(graphPath, "utf-8")) as {
        nodes: Array<{ id: string; description?: string }>;
      };
      expect(graph.nodes.every((n) => n.description === undefined)).toBe(true);
    });
  });

  it("ingests assistant description answers on the next analyze-build run", async () => {
    await withApiKeysCleared(async () => {
      const root = tempRoot();
      const stateDir = join(root, ".graphify");
      mkdirSync(stateDir, { recursive: true });
      const file = join(root, "src", "sample.ts");
      const extractPath = writeExtract(stateDir, file);
      const detectPath = writeDetect(stateDir, file);
      const graphPath = join(stateDir, "graph.json");

      const args = [
        "analyze-build",
        "--extract", extractPath,
        "--detect", detectPath,
        "--root", root,
        "--graph-out", graphPath,
        "--report-out", join(stateDir, "report.md"),
        "--analysis-out", join(stateDir, "analysis.json"),
      ];

      // Run 1 emits the description-instructions batch.
      await runRuntime(args);
      const descDir = join(stateDir, "description-instructions");

      // Simulate the assistant answering every emitted node.
      writeFileSync(
        join(descDir, "batch-000.json"),
        JSON.stringify({
          alpha_fn: "Alpha entry point.",
          beta_fn: "Beta helper.",
          gamma_fn: "Gamma helper.",
          delta_fn: "Delta helper.",
        }),
        "utf-8",
      );

      // Run 2 ingests the answers and stamps them onto graph.json.
      await runRuntime(args);
      const graph = JSON.parse(readFileSync(graphPath, "utf-8")) as {
        nodes: Array<{ id: string; description?: string }>;
      };
      const byId = new Map(graph.nodes.map((n) => [n.id, n]));
      expect(byId.get("alpha_fn")?.description).toBe("Alpha entry point.");
    });
  });
});
