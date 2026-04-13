import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { installClaudeHook } from "../src/cli.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Claude integration contract", () => {
  it("replaces an existing graphify Claude hook instead of keeping stale config", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-claude-hook-reinstall-"));
    tempDirs.push(dir);
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(
      join(dir, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Glob|Grep",
              hooks: [{ type: "command", command: "echo stale graphify hook" }],
            },
            {
              matcher: "Glob|Grep",
              hooks: [{ type: "command", command: "echo unrelated hook" }],
            },
          ],
        },
      }, null, 2),
      "utf-8",
    );

    installClaudeHook(dir);

    const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf-8")) as {
      hooks?: { PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }> };
    };
    const commands = (settings.hooks?.PreToolUse ?? []).flatMap((entry) =>
      (entry.hooks ?? []).map((hook) => hook.command ?? "")
    );

    expect(commands.filter((command) => command.includes("graphify"))).toHaveLength(1);
    expect(commands.some((command) => command.includes("stale graphify hook"))).toBe(false);
    expect(commands.some((command) => command.includes("unrelated hook"))).toBe(true);
  });
});
