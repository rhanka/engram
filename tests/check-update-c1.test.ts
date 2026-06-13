/**
 * T-C1 regression tests for checkUpdate pending-state honesty.
 *
 * - assistant update emits instructions + no answers → checkUpdate reports pending
 * - after ingest (answers written) → checkUpdate reports current (no unanswered files)
 * - --no-description (opted out, no instructions emitted) → checkUpdate reports current
 * - label instructions unanswered → checkUpdate reports pending
 *
 * Stale-orphan regression (C1 false-pending fix):
 * - orphan .md + graph fully described → checkUpdate clean (not pending forever)
 * - orphan .md + graph has undescribed nodes → checkUpdate still reports pending
 * - orphan .md + no graph.json (unknown state) → checkUpdate still reports pending
 * - update --no-description with stale .md from prior run → no false pending when
 *   graph is fully described
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkUpdate } from "../src/watch.js";
import {
  cleanDescriptionInstructionDir,
  countUndescribedInGraph,
  DESCRIPTION_INSTRUCTIONS_DIR,
} from "../src/node-descriptions.js";
import {
  cleanLabelInstructionDir,
  LABEL_INSTRUCTIONS_DIR,
  LABEL_INSTRUCTION_FILE,
  LABEL_ANSWER_FILE,
} from "../src/community-labeling.js";

const tempDirs: string[] = [];

function makeTempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-c1-check-update-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, ".graphify"), { recursive: true });
  return dir;
}

/**
 * Write a minimal graph.json to .graphify/graph.json under `root`.
 * `nodes` is an array of attribute objects; nodes without `description` that
 * are code/entity-grounded will be counted as "undescribed".
 */
function writeMinimalGraphJson(
  root: string,
  nodes: Array<Record<string, unknown>>,
): void {
  const graphJson = {
    directed: false,
    multigraph: false,
    graph: {},
    nodes: nodes.map((attrs, i) => ({ key: `n${i}`, attributes: attrs })),
    edges: [],
  };
  writeFileSync(
    join(root, ".graphify", "graph.json"),
    JSON.stringify(graphJson),
    "utf-8",
  );
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("C1: checkUpdate detects unanswered description instruction batches", () => {
  it("reports current when no instruction files exist (no-description opted out)", () => {
    const root = makeTempRoot();
    // No instruction files at all — user ran --no-description or there are no describable nodes.
    const result = checkUpdate(root);
    expect(result.current).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("reports pending when batch .md exists without a .json answer", () => {
    const root = makeTempRoot();
    const descDir = join(root, ".graphify", DESCRIPTION_INSTRUCTIONS_DIR);
    mkdirSync(descDir, { recursive: true });
    writeFileSync(join(descDir, "batch-000.md"), "# Batch 1\n", "utf-8");
    // No batch-000.json → unanswered

    const result = checkUpdate(root);
    expect(result.current).toBe(false);
    expect(result.reasons.some((r) => r.includes("description batch"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("awaiting answers"))).toBe(true);
  });

  it("reports current after all batch .md files have corresponding .json answers (ingest clears)", () => {
    const root = makeTempRoot();
    const descDir = join(root, ".graphify", DESCRIPTION_INSTRUCTIONS_DIR);
    mkdirSync(descDir, { recursive: true });
    writeFileSync(join(descDir, "batch-000.md"), "# Batch 1\n", "utf-8");
    writeFileSync(join(descDir, "batch-000.json"), '{"n1": "desc"}', "utf-8");
    // All answered

    const result = checkUpdate(root);
    expect(result.current).toBe(true);
  });

  it("counts multiple unanswered batches in the reason", () => {
    const root = makeTempRoot();
    const descDir = join(root, ".graphify", DESCRIPTION_INSTRUCTIONS_DIR);
    mkdirSync(descDir, { recursive: true });
    writeFileSync(join(descDir, "batch-000.md"), "# B0\n", "utf-8");
    writeFileSync(join(descDir, "batch-000.json"), "{}", "utf-8"); // answered
    writeFileSync(join(descDir, "batch-001.md"), "# B1\n", "utf-8"); // unanswered
    writeFileSync(join(descDir, "batch-002.md"), "# B2\n", "utf-8"); // unanswered

    const result = checkUpdate(root);
    expect(result.current).toBe(false);
    expect(result.reasons.some((r) => r.includes("2 description batch"))).toBe(true);
  });

  it("recommendedCommand points at fill+re-run when only batches are pending", () => {
    const root = makeTempRoot();
    const descDir = join(root, ".graphify", DESCRIPTION_INSTRUCTIONS_DIR);
    mkdirSync(descDir, { recursive: true });
    writeFileSync(join(descDir, "batch-000.md"), "# B\n", "utf-8");

    const result = checkUpdate(root);
    expect(result.current).toBe(false);
    expect(result.recommendedCommand).toContain("batch-*.json");
    expect(result.recommendedCommand).toContain("graphify update");
  });
});

describe("C1: checkUpdate detects unanswered label instructions", () => {
  it("reports pending when communities.md exists without communities.json", () => {
    const root = makeTempRoot();
    const labelDir = join(root, ".graphify", LABEL_INSTRUCTIONS_DIR);
    mkdirSync(labelDir, { recursive: true });
    writeFileSync(join(labelDir, LABEL_INSTRUCTION_FILE), "# Communities\n", "utf-8");
    // No communities.json

    const result = checkUpdate(root);
    expect(result.current).toBe(false);
    expect(result.reasons.some((r) => r.includes("community label"))).toBe(true);
  });

  it("reports current when communities.json answer is present", () => {
    const root = makeTempRoot();
    const labelDir = join(root, ".graphify", LABEL_INSTRUCTIONS_DIR);
    mkdirSync(labelDir, { recursive: true });
    writeFileSync(join(labelDir, LABEL_INSTRUCTION_FILE), "# Communities\n", "utf-8");
    writeFileSync(join(labelDir, LABEL_ANSWER_FILE), '{"0": "Auth Flow"}', "utf-8");

    const result = checkUpdate(root);
    expect(result.current).toBe(true);
  });

  it("reports both description batches AND label instructions when both are pending", () => {
    const root = makeTempRoot();
    const descDir = join(root, ".graphify", DESCRIPTION_INSTRUCTIONS_DIR);
    const labelDir = join(root, ".graphify", LABEL_INSTRUCTIONS_DIR);
    mkdirSync(descDir, { recursive: true });
    mkdirSync(labelDir, { recursive: true });
    writeFileSync(join(descDir, "batch-000.md"), "# B\n", "utf-8");
    writeFileSync(join(labelDir, LABEL_INSTRUCTION_FILE), "# Communities\n", "utf-8");

    const result = checkUpdate(root);
    expect(result.current).toBe(false);
    // A single combined reason string covering both.
    const combinedReason = result.reasons.join(" ");
    expect(combinedReason).toContain("description batch");
    expect(combinedReason).toContain("community label");
  });
});

describe("C1: --no-description regression — opted-out update does NOT create false pending marker", () => {
  it("no instruction files emitted → checkUpdate stays current (no false pending)", () => {
    // This simulates: user ran `graphify update --no-description --no-label`.
    // No instruction files are emitted → checkUpdate must NOT report pending.
    const root = makeTempRoot();
    // Directories exist but are empty (or don't exist at all).
    const descDir = join(root, ".graphify", DESCRIPTION_INSTRUCTIONS_DIR);
    const labelDir = join(root, ".graphify", LABEL_INSTRUCTIONS_DIR);
    mkdirSync(descDir, { recursive: true });
    mkdirSync(labelDir, { recursive: true });
    // Both dirs exist but have NO .md files → no unanswered instructions.

    const result = checkUpdate(root);
    expect(result.current).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("describePending marker from git hook does NOT interfere with C1 detection", () => {
    // If the git-hook marker is present AND there are unanswered instruction files,
    // we should have separate reasons (or at least not double-count).
    const root = makeTempRoot();
    // Write the git-hook marker.
    writeFileSync(
      join(root, ".graphify", ".graphify_describe_pending"),
      "rebuilt by hook\n",
      "utf-8",
    );
    // Also write an unanswered description batch.
    const descDir = join(root, ".graphify", DESCRIPTION_INSTRUCTIONS_DIR);
    mkdirSync(descDir, { recursive: true });
    writeFileSync(join(descDir, "batch-000.md"), "# B\n", "utf-8");

    const result = checkUpdate(root);
    expect(result.current).toBe(false);
    // Both signals are present; at least one reason must mention the hook marker.
    const allReasons = result.reasons.join(" ");
    expect(allReasons).toContain(".graphify_describe_pending");
  });
});

// ---------------------------------------------------------------------------
// Stale-orphan regression tests (C1 false-pending fix)
// ---------------------------------------------------------------------------

describe("C1 stale-orphan: checkUpdate is clean when graph is fully described", () => {
  it("(R1) orphan batch-*.md present + graph fully described → check-update clean", () => {
    // Scenario: a prior assistant run left batch-000.md, but a later direct-mode
    // run described all nodes. The orphan .md must NOT cause false pending.
    const root = makeTempRoot();
    const descDir = join(root, ".graphify", DESCRIPTION_INSTRUCTIONS_DIR);
    mkdirSync(descDir, { recursive: true });
    // Orphan: instruction file without a corresponding .json answer
    writeFileSync(join(descDir, "batch-000.md"), "# Batch 1\n", "utf-8");

    // Graph has one code node that IS fully described
    writeMinimalGraphJson(root, [
      { type: "code", signature: "function foo()", description: "Foo does bar." },
    ]);

    const result = checkUpdate(root);
    expect(result.current).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("(R2) orphan batch-*.md present + graph has undescribed nodes → still reports pending", () => {
    // The genuine pending case must still fire even with the new guard.
    const root = makeTempRoot();
    const descDir = join(root, ".graphify", DESCRIPTION_INSTRUCTIONS_DIR);
    mkdirSync(descDir, { recursive: true });
    writeFileSync(join(descDir, "batch-000.md"), "# Batch 1\n", "utf-8");

    // Graph has one code node that is NOT yet described
    writeMinimalGraphJson(root, [
      { type: "code", signature: "function bar()" },
    ]);

    const result = checkUpdate(root);
    expect(result.current).toBe(false);
    expect(result.reasons.some((r) => r.includes("description batch"))).toBe(true);
  });

  it("(R3) orphan batch-*.md present + no graph.json (unknown state) → reports pending conservatively", () => {
    // When graph.json doesn't exist the state is unknown; we keep the pending
    // signal rather than silently suppressing it.
    const root = makeTempRoot();
    const descDir = join(root, ".graphify", DESCRIPTION_INSTRUCTIONS_DIR);
    mkdirSync(descDir, { recursive: true });
    writeFileSync(join(descDir, "batch-000.md"), "# Batch 1\n", "utf-8");
    // No graph.json written

    const result = checkUpdate(root);
    expect(result.current).toBe(false);
    expect(result.reasons.some((r) => r.includes("description batch"))).toBe(true);
  });

  it("(R4a) no-description run with stale .md + fully-described graph → no false pending", () => {
    // update --no-description was run (no new instruction files emitted),
    // but a stale batch-000.md from a prior run is still on disk.
    // Graph is fully described → must be clean.
    const root = makeTempRoot();
    const descDir = join(root, ".graphify", DESCRIPTION_INSTRUCTIONS_DIR);
    mkdirSync(descDir, { recursive: true });
    writeFileSync(join(descDir, "batch-000.md"), "# Stale\n", "utf-8");

    writeMinimalGraphJson(root, [
      { type: "code", signature: "function baz()", description: "Baz does quux." },
    ]);

    const result = checkUpdate(root);
    expect(result.current).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("(R4b) stale communities.md + fully-described graph → check-update clean", () => {
    // Orphan label instruction file with a fully-described graph.
    const root = makeTempRoot();
    const labelDir = join(root, ".graphify", LABEL_INSTRUCTIONS_DIR);
    mkdirSync(labelDir, { recursive: true });
    writeFileSync(join(labelDir, LABEL_INSTRUCTION_FILE), "# Communities\n", "utf-8");
    // No communities.json (unanswered)

    // Graph is fully described (all nodes have descriptions)
    writeMinimalGraphJson(root, [
      { type: "code", signature: "function qux()", description: "Qux." },
    ]);

    // communities.md is unanswered, but because the graph has no undescribed nodes
    // the orphan must not produce a false-pending signal.
    const result = checkUpdate(root);
    expect(result.current).toBe(true);
  });
});

describe("C1 ingest lifecycle: cleanDescriptionInstructionDir / cleanLabelInstructionDir", () => {
  it("(R5) cleanDescriptionInstructionDir removes batch-*.md and batch-*.json", () => {
    const root = makeTempRoot();
    const descDir = join(root, ".graphify", DESCRIPTION_INSTRUCTIONS_DIR);
    mkdirSync(descDir, { recursive: true });
    writeFileSync(join(descDir, "batch-000.md"), "# B\n", "utf-8");
    writeFileSync(join(descDir, "batch-000.json"), '{"n1": "desc"}', "utf-8");
    writeFileSync(join(descDir, "batch-001.md"), "# B2\n", "utf-8");

    cleanDescriptionInstructionDir(descDir);

    expect(existsSync(join(descDir, "batch-000.md"))).toBe(false);
    expect(existsSync(join(descDir, "batch-000.json"))).toBe(false);
    expect(existsSync(join(descDir, "batch-001.md"))).toBe(false);
  });

  it("(R5b) cleanLabelInstructionDir removes communities.md and communities.json", () => {
    const root = makeTempRoot();
    const labelDir = join(root, ".graphify", LABEL_INSTRUCTIONS_DIR);
    mkdirSync(labelDir, { recursive: true });
    writeFileSync(join(labelDir, LABEL_INSTRUCTION_FILE), "# Communities\n", "utf-8");
    writeFileSync(join(labelDir, LABEL_ANSWER_FILE), '{"0": "Auth"}', "utf-8");

    cleanLabelInstructionDir(labelDir);

    expect(existsSync(join(labelDir, LABEL_INSTRUCTION_FILE))).toBe(false);
    expect(existsSync(join(labelDir, LABEL_ANSWER_FILE))).toBe(false);
  });

  it("(R5c) cleanDescriptionInstructionDir is safe when dir does not exist", () => {
    const root = makeTempRoot();
    const descDir = join(root, ".graphify", "nonexistent-dir");
    // Must not throw
    expect(() => cleanDescriptionInstructionDir(descDir)).not.toThrow();
  });
});

describe("C1 countUndescribedInGraph", () => {
  it("returns -1 when graph.json does not exist", () => {
    const root = makeTempRoot();
    const graphPath = join(root, ".graphify", "graph.json");
    const count = countUndescribedInGraph(graphPath);
    expect(count).toBe(-1);
  });

  it("returns 0 when all describable nodes have descriptions", () => {
    const root = makeTempRoot();
    writeMinimalGraphJson(root, [
      { type: "code", signature: "fn a()", description: "Does A." },
      { type: "code", signature: "fn b()", description: "Does B." },
    ]);
    const graphPath = join(root, ".graphify", "graph.json");
    expect(countUndescribedInGraph(graphPath)).toBe(0);
  });

  it("returns positive count when describable nodes lack descriptions", () => {
    const root = makeTempRoot();
    writeMinimalGraphJson(root, [
      { type: "code", signature: "fn c()", description: "Has one." },
      { type: "code", signature: "fn d()" }, // no description
      { aliases: ["Entity X"], mentions: ["X"] }, // entity, no description
    ]);
    const graphPath = join(root, ".graphify", "graph.json");
    expect(countUndescribedInGraph(graphPath)).toBe(2);
  });

  it("non-describable nodes (no code/grounding) do not contribute to the count", () => {
    const root = makeTempRoot();
    // Node with no type, no signature, no aliases/mentions/grounding
    writeMinimalGraphJson(root, [{ label: "isolated node" }]);
    const graphPath = join(root, ".graphify", "graph.json");
    expect(countUndescribedInGraph(graphPath)).toBe(0);
  });
});
