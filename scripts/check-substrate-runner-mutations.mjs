// Class A: prove the installed-closure regressions kill each broken guard.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const target = new URL("./substrate-tarball-acceptance.mjs", import.meta.url);
const original = readFileSync(target, "utf8");
const mutations = [
  ["consumer-root resolution", "createRequire(file).resolve(specifier)", 'createRequire(join(consumerDir, "package.json")).resolve(specifier)', "resolves require"],
  ["ESM resolved as CommonJS", 'edge.condition === "require"', "true", "resolves import"],
  ["expression targets ignored", 'dynamic: !target || !ts.isStringLiteralLike(target)', "dynamic: false", "expression target"],
  ["computed targets allowed", '|| finding.kind === "computed-target"', "", "expression target"],
  ["gypfile metadata ignored", "metadata.gypfile === true", "metadata.gypfile === false", "gypfile"],
];
try {
  for (const [name, from, to, test] of mutations) {
    if (!original.includes(from)) throw new Error(`mutation anchor missing: ${name}`);
    writeFileSync(target, original.replace(from, to));
    const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/memory-substrate-tarball.test.ts", "-t", test], { cwd: root, encoding: "utf8" });
    if (result.status !== 1 || !(result.stdout + result.stderr).includes("AssertionError")) throw new Error(`mutation survived: ${name}\n${result.stdout}\n${result.stderr}`);
    console.log(`KILLED ${name}`);
  }
} finally { writeFileSync(target, original); }
