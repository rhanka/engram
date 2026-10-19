// Amendment §5.7: test the packed product, including latent native imports.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const target = new URL("../dist/index.js", import.meta.url);
const original = readFileSync(target, "utf8");
try {
  for (const [name, addition, kind] of [
    ["latent computed native import", '\nimport(["better", "sqlite3"].join("-"));\n', "computed-target"],
    ["latent static native import", '\nimport("pg-native");\n', "forbidden-package"],
  ]) {
    writeFileSync(target, original + addition);
    const result = spawnSync(process.execPath, ["scripts/substrate-tarball-acceptance.mjs"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1, `mutation survived: ${name}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /installed closure refused/);
    assert.ok(result.stderr.includes(kind), result.stderr);
    console.log(`KILLED ${name} in installed tarball`);
  }
} finally { writeFileSync(target, original); }
