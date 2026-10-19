// Binding §§4.3, 8.1, 8.3, 8.5: each regression must kill its mutation.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = new URL("../engram-memory/module-storage-memory-store.ts", import.meta.url);
const original = readFileSync(target, "utf8");
const mutations = [
  ["K8 keeps the staged receipt", 'update.kind === "memory-admission-outcomes" && receipt !== undefined', 'update.kind === "mutation-disabled" && receipt !== undefined', "propagates one admission"],
  ["core keeps the staged receipt", "this.core = this.fork(after.value);", "this.core = scratch;", "propagates one admission"],
  ["failed hydration permits stale service", "this.recoveryRequired = true;", "this.recoveryRequired = false;", "recovers the committed expiry"],
  ["concurrent recovery overwrites a commit", "if (this.recoveryInFlight !== undefined) {", "if (this.recoveryInFlight !== undefined && this.closed) {", "recovers the committed expiry"],
];
const build = () => execFileSync("npm", ["--prefix", "engram-memory", "run", "build"], { cwd: root, stdio: "pipe" });
try {
  for (const [name, from, to, test] of mutations) {
    if (!original.includes(from)) throw new Error(`mutation anchor missing: ${name}`);
    writeFileSync(target, original.replaceAll(from, to));
    build();
    const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/memory-substrate.test.ts", "-t", test], { cwd: root, encoding: "utf8" });
    if (result.status !== 1 || !(result.stdout + result.stderr).includes("AssertionError")) {
      throw new Error(`mutation survived or did not reach an assertion: ${name}\n${result.stdout}\n${result.stderr}`);
    }
    console.log(`KILLED ${name}`);
  }
} finally {
  writeFileSync(target, original);
  build();
}
