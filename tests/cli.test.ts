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

  it("checks only the explicitly targeted Aider and Copilot platforms", () => {
    expect(getPlatformsToCheck(["install", "--platform", "aider"])).toEqual(["aider"]);
    expect(getPlatformsToCheck(["aider", "install"])).toEqual(["aider"]);
    expect(getPlatformsToCheck(["install", "--platform", "copilot"])).toEqual(["copilot"]);
    expect(getPlatformsToCheck(["copilot", "install"])).toEqual(["copilot"]);
  });

  it("checks only the explicitly targeted Gemini platform", () => {
    expect(getPlatformsToCheck(["install", "--platform", "gemini"])).toEqual(["gemini"]);
    expect(getPlatformsToCheck(["gemini", "install"])).toEqual(["gemini"]);
  });

  it("checks only the explicitly targeted upstream v4 assistant platforms", () => {
    expect(getPlatformsToCheck(["install", "--platform", "antigravity"])).toEqual(["antigravity"]);
    expect(getPlatformsToCheck(["antigravity", "install"])).toEqual(["antigravity"]);
    expect(getPlatformsToCheck(["install", "--platform", "hermes"])).toEqual(["hermes"]);
    expect(getPlatformsToCheck(["hermes", "install"])).toEqual(["hermes"]);
    expect(getPlatformsToCheck(["install", "--platform", "kiro"])).toEqual(["kiro"]);
    expect(getPlatformsToCheck(["kiro", "install"])).toEqual(["kiro"]);
    expect(getPlatformsToCheck(["install", "--platform", "vscode-copilot-chat"])).toEqual(["vscode-copilot-chat"]);
    expect(getPlatformsToCheck(["vscode", "install"])).toEqual(["vscode-copilot-chat"]);
  });

  it("does not warn for unrelated global skills on generic commands", () => {
    expect(getPlatformsToCheck(["hook", "status"])).toEqual([]);
    expect(getPlatformsToCheck(["query", "--graph", "graphify-out/graph.json", "install flow"])).toEqual([]);
  });
});
