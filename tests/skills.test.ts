import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SKILLS = [
  "../src/skills/skill.md",
  "../src/skills/skill-opencode.md",
  "../src/skills/skill-droid.md",
  "../src/skills/skill-windows.md",
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

  it("keeps the Windows skill usage lines aligned with upstream v0.3.28", () => {
    const content = readFileSync(new URL("../src/skills/skill-windows.md", import.meta.url), "utf-8");

    expect(content).toContain("/graphify <path> --directed");
    expect(content).toContain("/graphify <path> --wiki");
    expect(content).toContain("/graphify <path> --obsidian --obsidian-dir ~/vaults/my-project");
  });
});
