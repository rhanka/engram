/**
 * T-C1 regression tests for checkUpdate pending-state honesty.
 *
 * - assistant update emits instructions + no answers → checkUpdate reports pending
 * - after ingest (answers written) → checkUpdate reports current (no unanswered files)
 * - --no-description (opted out, no instructions emitted) → checkUpdate reports current
 * - label instructions unanswered → checkUpdate reports pending
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkUpdate } from "../src/watch.js";
import {
  DESCRIPTION_INSTRUCTIONS_DIR,
} from "../src/node-descriptions.js";
import {
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
