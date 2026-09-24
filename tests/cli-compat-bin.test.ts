import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const tsRoot = fileURLToPath(new URL("..", import.meta.url));
const compatBin = join(tsRoot, "dist", "cli-compat.js");
const primaryBin = join(tsRoot, "dist", "cli.js");
const packageVersion = JSON.parse(readFileSync(join(tsRoot, "package.json"), "utf-8")).version as string;

// The built bins only exist after `npm run build`; skip otherwise.
const built = existsSync(compatBin) && existsSync(primaryBin);
const whenBuilt = built ? it : it.skip;

describe("graphify compat bin", () => {
  whenBuilt("prints a deprecation notice and delegates to the engram CLI", () => {
    const result = spawnSync(process.execPath, [compatBin, "--version"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("deprecated alias");
    expect(result.stdout.trim()).toContain(packageVersion);
  });

  whenBuilt("matches the primary bin output", () => {
    const viaCompat = execFileSync(process.execPath, [compatBin, "--version"], {
      encoding: "utf-8",
      env: { ...process.env, ENGRAM_QUIET_DEPRECATION: "1" },
    });
    const viaPrimary = execFileSync(process.execPath, [primaryBin, "--version"], { encoding: "utf-8" });
    expect(viaCompat.trim()).toBe(viaPrimary.trim());
  });

  whenBuilt("stays silent with ENGRAM_QUIET_DEPRECATION=1", () => {
    const result = spawnSync(process.execPath, [compatBin, "--version"], {
      encoding: "utf-8",
      env: { ...process.env, ENGRAM_QUIET_DEPRECATION: "1" },
    });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("deprecated alias");
  });
});
