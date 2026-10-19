// Binding §§5.2–5.3, 8.3: corrupt each receipt consumer in the packed product.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const target = new URL("../dist/memory-substrate.js", import.meta.url);
const original = readFileSync(target, "utf8");
try {
  for (const [name, from, to] of [
    ["K7 keeps staged capture receipt", 'if (update.kind === "memory-capture-idempotency")', "if (false)"],
    ["control keeps staged capture receipt", 'if (update.kind === "memory-pending-controls")', "if (false)"],
    ["core keeps staged capture receipt", "this.core = this.fork(after.value);", "this.core = scratch;"],
  ]) {
    assert.ok(original.includes(from), `mutation anchor missing: ${name}`);
    writeFileSync(target, original.replace(from, to));
    const result = spawnSync(process.execPath, ["scripts/substrate-tarball-acceptance.mjs"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1, `mutation survived: ${name}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /AssertionError/);
    assert.match(result.stderr, /propagates one capture receipt/);
    console.log(`KILLED ${name} in installed tarball`);
  }
} finally { writeFileSync(target, original); }
