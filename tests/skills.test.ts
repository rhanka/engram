import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SKILLS = [
  "../src/skills/skill.md",
  "../src/skills/skill-opencode.md",
  "../src/skills/skill-droid.md",
  "../src/skills/skill-windows.md",
];

const ALL_SKILL_DOCS = [
  ...SKILLS,
  "../src/skills/skill-claw.md",
  "../src/skills/skill-codex.md",
  "../src/skills/skill-gemini.toml",
  "../src/skills/skill-trae.md",
];

const EXTRACTION_PROMPT_DOCS = [
  "../src/skills/skill.md",
  "../src/skills/skill-codex.md",
  "../src/skills/skill-droid.md",
  "../src/skills/skill-opencode.md",
  "../src/skills/skill-windows.md",
  "../src/skills/skill-gemini.toml",
];

const DISTRIBUTED_SKILL_DOCS = [
  ...ALL_SKILL_DOCS,
  "../src/skills/skill-vscode.md",
  "../src/skills/skill-kiro.md",
];

describe("skill cache examples", () => {
  it("use tuple destructuring for checkSemanticCache", () => {
    for (const relativePath of SKILLS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain(
        "const [cachedNodes, cachedEdges, cachedHyperedges, uncached] = checkSemanticCache(allFiles);",
      );
      expect(content).not.toContain(
        "const { cachedNodes, cachedEdges, cachedHyperedges, uncached } = checkSemanticCache(allFiles);",
      );
    }
  });

  it("documents transcript preparation before semantic extraction", () => {
    for (const relativePath of SKILLS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain("Step 2.5");
      expect(
        content.includes("prepare-semantic-detect")
        || content.includes("prepareSemanticDetection")
        || content.includes("augmentDetectionWithTranscripts"),
      ).toBe(true);
      expect(content).toContain("PDF sidecar");
      expect(content).toContain("assistant vision model");
      expect(content).toContain("PDF-extracted images");
    }
  });

  it("uses the .graphify state contract and lifecycle guidance", () => {
    for (const relativePath of ALL_SKILL_DOCS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain(".graphify/graph.json");
      expect(content).toContain(".graphify/branch.json");
      expect(content).toContain("graphify state prune");
      expect(content).toContain("graphify migrate-state --dry-run");
      expect(content).toContain("git mv -f graphify-out .graphify");
    }
  });

  it("documents portable committed graph artifacts and local lifecycle files", () => {
    for (const relativePath of ALL_SKILL_DOCS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain("graphify portable-check .graphify");
      expect(content).toMatch(/never commit [`"]?\.graphify\/branch\.json[`"]?/);
      expect(content).toContain(".graphify/worktree.json");
      expect(content).toContain(".graphify/cache/");
      expect(content).toContain(
        "git rm --cached .graphify/branch.json .graphify/worktree.json .graphify/needs_update",
      );
      expect(content).toContain("git rm -r --cached .graphify/cache");
      expect(content).toContain("never mutate git state without asking");
      expect(content).toContain("repo-relative paths");
    }
  });

  it("preserves community labels during cleanup guidance", () => {
    for (const relativePath of ALL_SKILL_DOCS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).not.toMatch(/rm -f[^\n]*\.graphify\/\.graphify_labels\.json/);
      expect(content).not.toMatch(/Remove-Item[^\n]*\.graphify\/\.graphify_labels\.json/);
    }
  });

  it("documents rationale as node metadata and keeps call direction explicit", () => {
    for (const relativePath of EXTRACTION_PROMPT_DOCS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain("rationale");
      expect(content).toContain("Do not create a separate rationale node");
      expect(content).toContain("source MUST be the caller");
      expect(content).toContain("target MUST be the callee");
    }
  });

  it("keeps extraction schema file_type examples aligned with concept support", () => {
    for (const relativePath of EXTRACTION_PROMPT_DOCS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain("file_type\":\"code|document|paper|image|concept|rationale");
      expect(content).toContain("\"rationale\":null");
    }
  });

  it("prefers the compact first-hop summary before deep traversal", () => {
    for (const relativePath of ALL_SKILL_DOCS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain("graphify summary --graph .graphify/graph.json");
    }
  });

  it("documents the additive review-delta workflow", () => {
    for (const relativePath of ALL_SKILL_DOCS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain("review-delta");
      expect(content).toContain("impact");
    }
  });

  it("documents the advisory commit recommendation workflow", () => {
    for (const relativePath of ALL_SKILL_DOCS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain("recommend-commits");
      expect(content).toContain("advisory-only");
      expect(content).toContain("do not auto-stage");
    }
  });

  it("documents review analysis and evaluation workflows", () => {
    for (const relativePath of ALL_SKILL_DOCS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain("review-analysis");
      expect(content).toContain("review-eval");
      expect(content).toContain("blast radius");
      expect(content).toContain("multimodal");
      expect(content).toContain("delegated OCR/vision");
    }
  });

  it("documents minimal-context as the first CRG-style review call", () => {
    for (const relativePath of DISTRIBUTED_SKILL_DOCS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain("minimal-context");
      expect(content).toContain("first review call");
      expect(content).toContain("detect-changes");
      expect(content).toContain("affected-flows");
      expect(content).toContain("review-context");
      expect(content).toContain("<=5 graph tool calls");
      expect(content).toContain("<=800");
      expect(content).toContain("stale=true");
    }
  });

  it("documents the configured ontology profile branch in every distributed skill", () => {
    for (const relativePath of [
      ...ALL_SKILL_DOCS,
      "../src/skills/skill-vscode.md",
      "../src/skills/skill-kiro.md",
    ]) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain("Configured Project Profiles");
      expect(content).toContain("graphify.yaml");
      expect(content).toContain(".graphify/config.yaml");
      expect(content).toContain("--config");
      expect(content).toContain("--profile");
      expect(content).toContain("profile activation");
      expect(content).toContain("configured-dataprep");
      expect(content).toContain("profile-prompt");
      expect(content).toContain("profile-validate-extraction");
      expect(content).toContain("profile-report");
      expect(content).toContain("ontology-output");
      expect(content).toContain("image-calibration-samples");
      expect(content).toContain("image-calibration-replay");
      expect(content).toContain("image-batch-export");
      expect(content).toContain("image-batch-import");
      expect(content).toContain("decision: accept_matrix");
      expect(content).toContain("fallback to the existing non-profile workflow");
      expect(content).toContain(".graphify/.graphify_runtime.json");
      expect(content).toContain('"runtime": "typescript"');
    }
  });

  it("keeps the Windows skill usage lines aligned with upstream v0.3.28", () => {
    const content = readFileSync(new URL("../src/skills/skill-windows.md", import.meta.url), "utf-8");

    expect(content).toContain("/graphify <path> --directed");
    expect(content).toContain("/graphify <path> --wiki");
    expect(content).toContain("/graphify <path> --obsidian --obsidian-dir ~/vaults/my-project");
  });
});
