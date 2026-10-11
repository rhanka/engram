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

  it("repository docs advertise no agent-stats command the CLI does not register", () => {
    // Registered commands come from the CLI source text: src/cli.ts builds its
    // commands with program.command(...), so a static read needs no LLM and no
    // network (same signal as tests/agent-stats-extraction.test.ts). Comments
    // never register a command, and any quote style counts.
    const cliSource = readFileSync(join(root, "src", "cli.ts"), "utf8");
    const cliCode = cliSource
      .replace(/\/\*[\s\S]*?\*\//g, "\n")
      .split("\n")
      .map((line) => line.replace(/(?<!:)\/\/.*$/, ""))
      .join("\n");
    const registeredCommandPattern = /\.command\(\s*["'`]agent-stats(?:\s[^"'`]*?)?["'`]/;
    const registered = registeredCommandPattern.test(cliCode);
    expect(registeredCommandPattern.test('.command("agent-stats [subcommand]")')).toBe(true);
    expect(registeredCommandPattern.test(".command('agent-stats <x>')")).toBe(true);

    const docFiles = ["README.md", "ARCHITECTURE.md"] as const;
    const commandPattern = /\b(engram|graphify)\s+agent-stats\b/;
    // A sentence stating the removal is a notice, not an advertisement.
    const removalNoticePattern =
      /\b(removed|removal|removes?|retired|registers?\s+no|no longer|awaiting relocation|not\s+register|former|historical)\b/i;
    const advertised = docFiles.flatMap((file) =>
      readFileSync(join(root, file), "utf8")
        .replace(/\\\r?\n\s*/g, " ")
        .split("\n")
        .flatMap((line, index) =>
          commandPattern.test(line) && !removalNoticePattern.test(line)
            ? [`${file}:${index + 1}: ${line.trim()}`]
            : [],
        ),
    );
    const staleModuleRows = readFileSync(join(root, "ARCHITECTURE.md"), "utf8")
      .split("\n")
      .flatMap((line, index) =>
        line.includes("src/agent-stats/") ? [`ARCHITECTURE.md:${index + 1}: ${line.trim()}`] : [],
      );

    expect(
      registered,
      "src/cli.ts registers no agent-stats command (D-2=A: removed from this CLI, relocation pending lot F12)",
    ).toBe(false);
    expect(
      [...advertised, ...staleModuleRows],
      "repository docs must not advertise an agent-stats command or module the CLI does not register",
    ).toEqual([]);
  });
});
