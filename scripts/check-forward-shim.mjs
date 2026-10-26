#!/usr/bin/env node
// Forward-shim acceptance (drop-ollama lot, 0.21.2): proves the published
// `@sentropic/graphify` forwarding shim forwards the full consumer surface.
// Node only — no dependency beyond Node builtins, npm and tar.
//
// Packs `@sentropic/engram` and `forward/graphify` exactly as they would be
// published, installs both in an isolated temp consumer (the shim's registry
// dependency is rewired to the freshly packed engram tarball so the check
// never touches the registry for our own packages), then verifies:
//   1. `import("@sentropic/graphify")` exposes `mergeExtractions`;
//   2. `import("@sentropic/graphify/llm-mesh")` exposes `createGraphifyMesh`
//      and `meshTextJsonClient`;
//   3. `require("@sentropic/graphify")` works;
//   4. `tsc --noEmit` compiles a small file importing root and llm-mesh
//      types through `@sentropic/graphify`.
//
// Prerequisite: `npm run build` (the packed engram must contain dist/).
// Exit causes: PACK_FAILED, CHECK_FAILED. Removes its temp dirs itself
// unless KEEP_FORWARD_SHIM_TEMP=1.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shimRoot = join(root, "forward", "graphify");
const npmBin = process.env.FORWARD_SHIM_NPM_BIN ?? "npm";
const tscBin = join(root, "node_modules", "typescript", "bin", "tsc");

const failures = [];
const note = (message) => failures.push(message);

function run(cmd, args, options) {
  // Keep every npm invocation on a private cache: the shared ~/.npm cache
  // may contain root-owned files that make modern npm refuse to run.
  const env = cmd === npmBin
    ? { ...process.env, npm_config_cache: join(tempRoot, "npm-cache") }
    : undefined;
  return execFileSync(cmd, args, { encoding: "utf8", ...(env ? { env } : {}), ...options });
}

function check(name, fn) {
  try {
    fn();
    console.log(`forward-shim OK ${name}`);
  } catch (error) {
    note(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const tempRoot = mkdtempSync(join(tmpdir(), "forward-shim-"));
const consumerDir = join(tempRoot, "consumer");
let engramTarball = null;
try {
  for (const required of [
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts",
    "dist/llm-mesh.js",
    "dist/llm-mesh.d.ts",
  ]) {
    if (!existsSync(join(root, required))) {
      throw new Error(`missing built file ${required}; run npm run build first`);
    }
  }
  if (!existsSync(tscBin)) throw new Error(`missing TypeScript at ${tscBin}; run npm install first`);

  const packOne = (cwd) => {
    const output = run(npmBin, ["pack", "--ignore-scripts", "--silent", "--pack-destination", tempRoot], { cwd });
    const name = output.split("\n").map((line) => line.trim()).filter((line) => line.endsWith(".tgz")).pop();
    if (!name) throw new Error(`npm pack printed no tarball name in ${cwd}`);
    return join(tempRoot, name);
  };
  engramTarball = packOne(root);
  const shimTarball = packOne(shimRoot);
  console.log(`forward-shim packed ${engramTarball} + ${shimTarball}`);

  // The packed shim must contain the forwarding files (its `files` list).
  const packedFiles = run("tar", ["-tzf", shimTarball]).split("\n").map((line) => line.trim());
  for (const required of ["package/index.js", "package/index.mjs", "package/index.d.ts", "package/llm-mesh.mjs", "package/llm-mesh.d.ts", "package/bin.js"]) {
    if (!packedFiles.includes(required)) throw new Error(`shim tarball misses ${required}`);
  }
  console.log("forward-shim tarball files ok");

  // Rewire the shim's `@sentropic/engram` dependency to the freshly packed
  // engram tarball (so the consumer tree never resolves our own unpublished
  // version from the registry) and repack: the consumer installs tarballs,
  // which npm copies (a directory install would symlink and break the
  // shim's own `@sentropic/engram` resolution).
  run("tar", ["-xzf", shimTarball, "-C", tempRoot]);
  const shimDir = join(tempRoot, "package");
  const shimManifestPath = join(shimDir, "package.json");
  const shimManifest = JSON.parse(readFileSync(shimManifestPath, "utf8"));
  if (shimManifest.name !== "@sentropic/graphify") throw new Error(`unexpected shim package ${shimManifest.name}`);
  shimManifest.dependencies["@sentropic/engram"] = `file:${engramTarball}`;
  writeFileSync(shimManifestPath, `${JSON.stringify(shimManifest, null, 2)}\n`);
  const rewiredTarball = run(npmBin, ["pack", "--ignore-scripts", "--silent", "--pack-destination", tempRoot], { cwd: shimDir })
    .split("\n").map((line) => line.trim()).filter((line) => line.endsWith(".tgz")).pop();
  if (!rewiredTarball) throw new Error("npm pack printed no tarball name for the rewired shim");
  const rewiredShimTarball = join(tempRoot, rewiredTarball);

  const { mkdirSync } = await import("node:fs");
  mkdirSync(consumerDir, { recursive: true });
  writeFileSync(join(consumerDir, "package.json"), JSON.stringify({
    name: "forward-shim-consumer",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: { "@sentropic/graphify": `file:${rewiredShimTarball}` },
  }, null, 2));
  run(npmBin, ["install", "--no-audit", "--no-fund", "--no-update-notifier"], { cwd: consumerDir, stdio: "pipe" });
  console.log("forward-shim consumer installed");

  check("import(@sentropic/graphify) exposes mergeExtractions", () => {
    const output = run(process.execPath, ["--input-type=module", "-e",
      "import(\"@sentropic/graphify\").then((m) => { if (typeof m.mergeExtractions !== \"function\") throw new Error(\"mergeExtractions missing\"); console.log(\"mergeExtractions:\" + typeof m.mergeExtractions); });",
    ], { cwd: consumerDir });
    if (!output.includes("mergeExtractions:function")) throw new Error(`unexpected output: ${output}`);
  });

  check("import(@sentropic/graphify/llm-mesh) exposes mesh surface", () => {
    const output = run(process.execPath, ["--input-type=module", "-e",
      "import(\"@sentropic/graphify/llm-mesh\").then((m) => { for (const name of [\"createGraphifyMesh\", \"meshTextJsonClient\"]) { if (typeof m[name] !== \"function\") throw new Error(`${name} missing`); } console.log(\"mesh:ok\"); });",
    ], { cwd: consumerDir });
    if (!output.includes("mesh:ok")) throw new Error(`unexpected output: ${output}`);
  });

  check("require(@sentropic/graphify) works", () => {
    const output = run(process.execPath, ["-e",
      "const g = require(\"@sentropic/graphify\"); if (typeof g.mergeExtractions !== \"function\") throw new Error(\"mergeExtractions missing\"); console.log(\"require:ok\");",
    ], { cwd: consumerDir });
    if (!output.includes("require:ok")) throw new Error(`unexpected output: ${output}`);
  });

  check("tsc --noEmit compiles shim root + llm-mesh types", () => {
    writeFileSync(join(consumerDir, "check-types.ts"), [
      "import { mergeExtractions } from \"@sentropic/graphify\";",
      "import type { Extraction } from \"@sentropic/graphify\";",
      "import { createGraphifyMesh, meshTextJsonClient } from \"@sentropic/graphify/llm-mesh\";",
      "import type { GraphifyMesh } from \"@sentropic/graphify/llm-mesh\";",
      "export function shape(extraction: Extraction, mesh: GraphifyMesh | null): void {",
      "  void mergeExtractions; void extraction; void createGraphifyMesh; void meshTextJsonClient; void mesh;",
      "}",
      "",
    ].join("\n"));
    run(process.execPath, [tscBin, "--noEmit", "--strict", "--skipLibCheck",
      "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext",
      "check-types.ts",
    ], { cwd: consumerDir });
  });

  if (failures.length > 0) {
    throw new Error(`CHECK_FAILED\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  }
  console.log("forward-shim acceptance OK");
} catch (error) {
  if (error instanceof Error && failures.length > 0) throw error;
  throw new Error(`PACK_FAILED: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (process.env.KEEP_FORWARD_SHIM_TEMP !== "1") rmSync(tempRoot, { recursive: true, force: true });
}
