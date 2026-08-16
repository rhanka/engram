import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(root, "src");

describe("legacy memory removal", () => {
  it("no legacy memory export, schema, source-authority header, CLI, or packed file remains", () => {
    const legacySources = readdirSync(sourceDirectory)
      .filter((entry) => /^memory-.*\.ts$/.test(entry))
      .map((entry) => `source:${join("src", entry)}`);
    const publicIndex = readFileSync(join(sourceDirectory, "index.ts"), "utf8");
    const cli = readFileSync(join(sourceDirectory, "cli.ts"), "utf8");
    const artifacts = [
      ...legacySources,
      ...(publicIndex.includes("./memory-") ? ["public-export:src/index.ts"] : []),
      ...(cli.includes('.command("memory")') ? ["legacy-cli:src/cli.ts"] : []),
      ...(existsSync(join(sourceDirectory, "memory-recall.ts"))
        && readFileSync(join(sourceDirectory, "memory-recall.ts"), "utf8").includes("MEMORY_RECALL_SCHEMA")
        ? ["legacy-schema:src/memory-recall.ts"]
        : []),
      ...(existsSync(join(sourceDirectory, "memory-producer-port.ts"))
        && readFileSync(join(sourceDirectory, "memory-producer-port.ts"), "utf8").includes("The agent-memory PORT")
        ? ["source-authority-header:src/memory-producer-port.ts"]
        : []),
    ];

    expect(artifacts, "legacy memory compatibility artifacts must be absent from source and package closure").toEqual([]);
  });
});
