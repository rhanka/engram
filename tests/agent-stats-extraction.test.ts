import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerAgentStatsCommands } from "../_extracted/agent-stats-h2a-module/src/cli.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("agent-stats extraction", () => {
  it("leaves the root CLI unregistered and exposes the commands from the h2a staging module", () => {
    const program = new Command();
    registerAgentStatsCommands(program);

    expect(program.commands.map((command) => command.name())).toContain("agent-stats");
    expect(readFileSync(join(root, "src", "cli.ts"), "utf8")).not.toContain('.command("agent-stats")');
  });
});
