// Class A: public specifier, complete inventory, strict types and locked closure.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const target = new URL("./substrate-installed-acceptance.mjs", import.meta.url);
const original = readFileSync(target, "utf8");
const mutations = [
  ["checkout semantics bypass", 'JSON.stringify(PUBLIC_ENTRY));', 'JSON.stringify(join(repoRoot, "src/memory-substrate/index.ts")));', "broken installed behavior"],
  ["extra public type ignored", 'assert.deepEqual(types.sort(), [...EXPECTED_TYPES].sort(), "installed public type inventory");', "", "extra type"],
  ["strict declaration errors ignored", "const diagnostics = ts.getPreEmitDiagnostics(program);", "const diagnostics = [];", "invalid declaration"],
  ["dependency pin ignored", "actual.version !== expected.version || actual.integrity !== expected.integrity", "false", "pinned closure"],
  ["host ports no longer compiled", '    `export { consumeHost } from "./host-consumer.js";`,', "", "erased crypto port"],
];
try {
  for (const [name, from, to, test] of mutations) {
    if (!original.includes(from)) throw new Error(`mutation anchor missing: ${name}`);
    writeFileSync(target, original.replace(from, to));
    const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/memory-substrate-installed-proof.test.ts", "-t", test], { cwd: root, encoding: "utf8" });
    if (result.status !== 1 || !(result.stdout + result.stderr).includes("AssertionError")) throw new Error(`mutation survived: ${name}\n${result.stdout}\n${result.stderr}`);
    console.log(`KILLED ${name}`);
  }
} finally { writeFileSync(target, original); }
