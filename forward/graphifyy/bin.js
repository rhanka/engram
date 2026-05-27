#!/usr/bin/env node
// graphifyy has moved to @sentropic/graphify.
// This shim re-runs the new package's CLI with the same arguments, so existing
// `graphifyy`-installed `graphify` commands keep working during migration.
const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");

// Resolve the installed @sentropic/graphify and run its CLI (dist/cli.js sits
// next to the resolved main entry dist/index.cjs).
const entry = require.resolve("@sentropic/graphify");
const cli = join(dirname(entry), "cli.js");

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: "inherit" });
if (result.error) {
  console.error("graphifyy: failed to launch @sentropic/graphify CLI:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
