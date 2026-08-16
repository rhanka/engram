import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const activityDirectory = join(root, "src", "agent-stats");

function activityFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return activityFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("activity evidence boundary", () => {
  it("activity reaches capture only through ActivityEvidenceSource", () => {
    const directLegacyMemoryEdges = activityFiles(activityDirectory)
      .filter((file) => /from\s*["']\.\.\/memory-[^"']+["']/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(root.length + 1));

    expect(
      directLegacyMemoryEdges,
      "activity may reach capture only through ActivityEvidenceSource, never a legacy memory import",
    ).toEqual([]);
  });
});
