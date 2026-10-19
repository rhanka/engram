// Binding §§6.4, 8.5, 9.7: deterministic recovery/close interleaving, installed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const target = new URL("../dist/memory-substrate.js", import.meta.url);
const original = readFileSync(target, "utf8");
try {
  for (const [name, from, to] of [
    ["close does not latch", "this.closing = true;", "this.closing = false;"],
    ["close releases fence before recovery ends", "await this.recoveryInFlight;", "await Promise.resolve();"],
  ]) {
    assert.ok(original.includes(from), `mutation anchor missing: ${name}`);
    // The first recoveryInFlight await joins recovery; the last belongs to close.
    const at = original.lastIndexOf(from);
    writeFileSync(target, original.slice(0, at) + to + original.slice(at + from.length));
    const result = spawnSync(process.execPath, ["scripts/substrate-tarball-acceptance.mjs"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1, `mutation survived: ${name}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /AssertionError/);
    assert.match(result.stderr, /hydration fails=true, close=true/);
    console.log(`KILLED ${name} in installed tarball`);
  }
} finally { writeFileSync(target, original); }
