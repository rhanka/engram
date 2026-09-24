#!/usr/bin/env node
// @sentropic/graphify is now a deprecated forwarding shim for @sentropic/engram.
// This re-runs the Engram CLI with the same arguments, so existing `graphify`
// commands keep working during migration.
const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");

if (process.env.ENGRAM_QUIET_DEPRECATION !== "1") {
  console.error(
    "graphify: Engram renamed — 'graphify' is a deprecated alias, use 'engram'. " +
      "Set ENGRAM_QUIET_DEPRECATION=1 to silence this notice.",
  );
}

// Resolve the installed @sentropic/engram and run its CLI (dist/cli.js sits
// next to the resolved main entry dist/index.cjs).
const entry = require.resolve("@sentropic/engram");
const cli = join(dirname(entry), "cli.js");

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: "inherit" });
if (result.error) {
  console.error("graphify: failed to launch @sentropic/engram CLI:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
