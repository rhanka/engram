/**
 * `graphify` compat bin — thin wrapper over the Engram CLI.
 *
 * Prints ONE stderr deprecation line, then runs the same CLI with the same
 * argv (spawned, so signals/stdio/exit codes pass through untouched).
 * Silenced by `ENGRAM_QUIET_DEPRECATION=1`.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.ENGRAM_QUIET_DEPRECATION !== "1") {
  console.error(
    "graphify: Engram renamed — 'graphify' is a deprecated alias, use 'engram'. " +
      "Set ENGRAM_QUIET_DEPRECATION=1 to silence this notice.",
  );
}

// dist/cli.js sits next to this bundled wrapper.
const cli = join(dirname(fileURLToPath(import.meta.url)), "cli.js");

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
});
if (result.error) {
  console.error("graphify: failed to launch the engram CLI:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
