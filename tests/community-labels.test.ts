import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { persistCommunityLabels, resolveCommunityLabels } from "../src/community-labels.js";

const cleanupDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-community-labels-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("community label persistence", () => {
  it("normalizes persisted labels and ignores empty control-only labels", () => {
    const dir = tempDir();
    const labelsPath = join(dir, ".graphify_labels.json");
    writeFileSync(labelsPath, JSON.stringify({
      0: "  Core\r\nRuntime\tServices  ",
      1: "\u0000\u0007",
    }), "utf-8");

    const resolved = resolveCommunityLabels(new Map([
      [0, ["alpha"]],
      [1, ["beta"]],
    ]), { labelsPath });

    expect(resolved.get(0)).toBe("Core Runtime Services");
    expect(resolved.get(1)).toBe("Community 1");

    persistCommunityLabels(new Map([
      [0, "  API\r\nBoundary\t "],
      [1, "Community 1"],
    ]), labelsPath);

    expect(JSON.parse(readFileSync(labelsPath, "utf-8"))).toEqual({
      0: "API Boundary",
      1: "Community 1",
    });
  });
});
