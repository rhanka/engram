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
        || content.includes("augmentDetectionWithTranscripts"),
      ).toBe(true);
      expect(content).toContain("treating as docs");
    }
  });

  it("uses the .graphify state contract and lifecycle guidance", () => {
    for (const relativePath of ALL_SKILL_DOCS) {
      const content = readFileSync(new URL(relativePath, import.meta.url), "utf-8");
      expect(content).toContain(".graphify/graph.json");
      expect(content).toContain(".graphify/branch.json");
      expect(content).toContain("graphify state prune");
      expect(content).not.toContain("graphify-out");
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
    }
  });

  it("keeps the Windows skill usage lines aligned with upstream v0.3.28", () => {
    const content = readFileSync(new URL("../src/skills/skill-windows.md", import.meta.url), "utf-8");

    expect(content).toContain("/graphify <path> --directed");
    expect(content).toContain("/graphify <path> --wiki");
    expect(content).toContain("/graphify <path> --obsidian --obsidian-dir ~/vaults/my-project");
  });
});
