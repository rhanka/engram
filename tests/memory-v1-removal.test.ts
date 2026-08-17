import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(root, "src");

/** All tracked TypeScript sources under a directory, excluding vendored deps and build output. */
function typeScriptSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "dist") return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typeScriptSources(path);
    return entry.isFile() && /\.(ts|mts|cts)$/.test(entry.name) && statSync(path).size > 0 ? [path] : [];
  });
}

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

  it("packed artifact and repository contain no compatibility API after migration", () => {
    // The neutral migration surface must ship, but no legacy compatibility API may
    // survive it — not in the repository sources and not in the packed engine closure.
    const memoryPackage = join(root, "graphify-memory");
    const scanned = [
      ...typeScriptSources(sourceDirectory),
      ...typeScriptSources(memoryPackage),
    ].map((path) => ({ path, text: readFileSync(path, "utf8") }));

    const forbiddenCompatibilityApi = [
      "MEMORY_RECALL_SCHEMA",
      "memory-producer-port",
      "The agent-memory PORT",
      "createAgentMemory",
      "AgentMemoryPort",
      "MemoryProducerPort",
      "recallAgentMemory",
      "createMemoryPortV1",
    ];

    const violations = scanned.flatMap((file) =>
      forbiddenCompatibilityApi
        .filter((identifier) => file.text.includes(identifier))
        .map((identifier) => `${identifier} @ ${file.path.slice(root.length + 1)}`),
    );
    expect(violations, "no legacy compatibility API may remain in the repository or packed engine closure").toEqual([]);

    // Proof the migration surface itself shipped (retained-record migration is L7's closure).
    const packageIndex = readFileSync(join(memoryPackage, "index.ts"), "utf8");
    expect(packageIndex).toContain("migrateRetainedNeutralRecordsV1");

    // The migration entrypoint exists and re-introduces no v1 port symbol.
    const migrationModule = readFileSync(join(memoryPackage, "migration.ts"), "utf8");
    expect(migrationModule).not.toContain("createMemoryPortV1");
    expect(migrationModule).not.toContain("AgentMemory");
  });
});
