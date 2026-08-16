import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const graphifyActivityDirectory = join(root, "src", "agent-stats");
const extractedActivityDirectory = join(root, "_extracted", "agent-stats-h2a-module", "src");

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
    const rootActivityFiles = activityFiles(graphifyActivityDirectory);
    const directLegacyMemoryEdges = activityFiles(extractedActivityDirectory)
      .filter((file) => /from\s*["'][^"']*memory-[^"']+["']/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(root.length + 1));

    expect(rootActivityFiles, "Graphify must not retain the h2a activity subsystem").toEqual([]);
    expect(
      directLegacyMemoryEdges,
      "activity may reach capture only through ActivityEvidenceSource, never a legacy memory import",
    ).toEqual([]);
  });
});
