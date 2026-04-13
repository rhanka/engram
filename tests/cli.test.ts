import { describe, expect, it } from "vitest";

import { getPlatformsToCheck } from "../src/cli.js";

describe("CLI platform-scoped version checks", () => {
  it("checks only the explicitly targeted Claude platform", () => {
    expect(getPlatformsToCheck(["install", "--platform", "claude"])).toEqual(["claude"]);
    expect(getPlatformsToCheck(["claude", "install"])).toEqual(["claude"]);
  });

  it("checks only the explicitly targeted Codex platform", () => {
    expect(getPlatformsToCheck(["install", "--platform", "codex"])).toEqual(["codex"]);
    expect(getPlatformsToCheck(["codex", "install"])).toEqual(["codex"]);
  });

  it("does not warn for unrelated global skills on generic commands", () => {
    expect(getPlatformsToCheck(["hook", "status"])).toEqual([]);
    expect(getPlatformsToCheck(["query", "--graph", "graphify-out/graph.json", "install flow"])).toEqual([]);
  });
});
