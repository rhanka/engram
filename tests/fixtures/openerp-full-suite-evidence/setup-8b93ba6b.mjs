// Reproduce the binding shared-installation comparison. Node only; no native rebuild.
// Run from the feature worktree: node tests/fixtures/openerp-full-suite-evidence/setup-8b93ba6b.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";

const evidence = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(evidence, "../../..");
const baseline = path.join(root, ".baseline");
const pin = "8b93ba6b834f83fddbcf76091054efea2e188cf1";
const scratch = path.join(root, ".graphify/scratch/openerp-suite");
const env = { ...process.env, ENV: "test-openerp", npm_config_cache: path.join(scratch, "npm-cache") };
fs.mkdirSync(scratch, { recursive: true });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root, env });
const commands = [];
const setup = { format: "openerp-shared-suite-setup/1", baseCommit: pin,
  branchCommit: git("rev-parse", "HEAD").toString().trim(), node: process.version, nodeBinary: process.execPath,
  environmentSha256: hash(JSON.stringify(Object.fromEntries(Object.entries(env).sort()))),
  npmCache: env.npm_config_cache, environment: env.ENV, lockfiles: {}, symlinks: {}, commands };
const setupPath = path.join(evidence, "setup-8b93ba6b.json");
const save = () => fs.writeFileSync(setupPath, JSON.stringify(setup, null, 2) + "\n");
async function run(label, command, args, cwd, allowedFailure = false) {
  console.log(label + ": " + command + " " + args.join(" "));
  const raw = path.join(scratch, label + ".log");
  const fd = fs.openSync(raw, "w");
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", fd, fd] });
    child.once("error", reject);
    child.once("exit", resolve);
  }).finally(() => fs.closeSync(fd));
  const bytes = fs.readFileSync(raw), compressed = gzipSync(bytes, { level: 9 });
  const output = path.join(evidence, label + ".log.gz");
  fs.writeFileSync(output, compressed);
  commands.push({ label, command, args, cwd, exitCode, log: path.relative(root, output),
    rawSha256: hash(bytes), compressedSha256: hash(compressed) });
  save();
  console.log(label + ": exit " + exitCode);
  if (exitCode !== 0 && !allowedFailure) throw new Error(label + " failed; see " + raw);
  return { exitCode, raw };
}

// Stop before creating .baseline if any installation lock differs.
for (const file of ["package-lock.json", "engram-memory/package-lock.json", "studio/package-lock.json"]) {
  const expected = git("show", pin + ":" + file), actual = fs.readFileSync(path.join(root, file));
  assert.ok(expected.equals(actual), file + " differs: STOP");
  setup.lockfiles[file] = { identical: true, sha256: hash(actual) };
}
save();
// The conductor-provided installation is copied, never linked to or rebuilt in
// the sibling checkout. Stop on either lockfile difference before any copy.
const installationSource = "/home/antoinefa/src/graphify-wt-dpadapter";
for (const [label, file] of [["top", "package-lock.json"], ["memory", "engram-memory/package-lock.json"]]) {
  await run("shared-installation-" + label + "-lock-8b93ba6b", "cmp", [path.join(root, file), path.join(installationSource, file)], root);
}
await run("shared-installation-copy-8b93ba6b", "cp", ["-a", path.join(installationSource, "engram-memory/node_modules") + "/.", path.join(root, "engram-memory/node_modules") + "/"], root);
setup.installation = { source: installationSource, method: "cp -a", lockfilesByteIdentical: true, nativeBinaries: {} };
for (const file of ["fs-ext/build/Release/fs_ext.node", "better-sqlite3/build/Release/better_sqlite3.node"]) {
  const location = path.join(root, "engram-memory/node_modules", file);
  assert.ok(fs.lstatSync(location).isFile(), "native binary must be copied, not symlinked: " + file);
  setup.installation.nativeBinaries[file] = { sha256: hash(fs.readFileSync(location)),
    matchesSource: fs.readFileSync(location).equals(fs.readFileSync(path.join(installationSource, "engram-memory/node_modules", file))) };
  assert.ok(setup.installation.nativeBinaries[file].matchesSource);
}
save();
// Studio's build script otherwise installs independently in each checkout.
if (!fs.existsSync(path.join(root, "studio/node_modules/vite-plugin-singlefile"))) {
  await run("shared-studio-install-8b93ba6b", "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], path.join(root, "studio"));
}
// The installed-consumer gate uses npm ci --offline. Seed exactly its
// byte-pinned remote tarballs into the same worktree cache before either run.
const consumerLock = JSON.parse(fs.readFileSync(path.join(root, "scripts/fixtures/substrate-consumer/package-lock.json"), "utf8"));
const tarballs = [...new Set(Object.values(consumerLock.packages).map(pkg => pkg.resolved).filter(url => url?.startsWith("https://")))].sort();
await run("shared-offline-cache-8b93ba6b", "npm", ["cache", "add", ...tarballs, "--ignore-scripts"], root);
assert.ok(!fs.existsSync(baseline), ".baseline already exists; do not overwrite");
let created = false;
try {
  await run("baseline-create-8b93ba6b", "git", ["-c", "core.hooksPath=/dev/null", "worktree", "add", "--detach", baseline, pin], root);
  created = true;
  for (const subdir of ["node_modules", "engram-memory/node_modules", "studio/node_modules"]) {
    const target = path.join(root, subdir), link = path.join(baseline, subdir);
    assert.ok(fs.existsSync(target), "missing shared installation: " + target);
    fs.symlinkSync(target, link, "dir");
    assert.equal(fs.realpathSync(link), fs.realpathSync(target));
    setup.symlinks[subdir] = { baseline: link, target: fs.realpathSync(target) };
  }
  save();
  for (const [side, cwd] of [["base", baseline], ["branch", root]]) {
    await run(side + "-8b93ba6b-native-probe", process.execPath, ["--input-type=module", "-e",
      'import {createRequire} from "node:module"; import path from "node:path"; const require=createRequire(path.join(process.cwd(),"engram-memory/package.json")); const fs=require("fs-ext"); const DB=require("better-sqlite3"); const db=new DB(":memory:"); console.log(JSON.stringify({node:process.version,fsExt:typeof fs.flockSync,sqlite:db.prepare("select 1 as ok").get()})); db.close();'], cwd);
    await run(side + "-8b93ba6b-engram-memory-build", "npm", ["--prefix", "engram-memory", "run", "build"], cwd);
    const topBuild = await run(side + "-8b93ba6b-build", "npm", ["run", "build"], cwd, true);
    if (topBuild.exitCode !== 0) {
      const diagnostic = fs.readFileSync(topBuild.raw, "utf8");
      assert.match(diagnostic, /Cannot find module.*fs_ext\.node/, "unexpected top-level build failure");
      // The native packages remain unchanged and unavailable at runtime. This
      // identical bundling setup on both sides emits the required dist files
      // without attempting to bundle or rebuild a missing native binary.
      await run(side + "-8b93ba6b-native-external-build", process.execPath,
        ["node_modules/tsup/dist/cli-default.js", "--external", "fs-ext", "--external", "better-sqlite3"], cwd);
      await run(side + "-8b93ba6b-studio-build", "npm", ["run", "build:studio"], cwd);
    }
    // The token generator rewrites tracked source as a build side effect.
    // Retain its exact generated bytes; test the pinned source on each side
    // and keep this ontology lot free of unrelated token changes.
    const sourceFile = "src/workspace/tokens-st-css.generated.ts";
    const sourcePath = path.join(cwd, sourceFile);
    const generatedBytes = fs.readFileSync(sourcePath);
    const pinnedBytes = execFileSync("git", ["show", "HEAD:" + sourceFile], { cwd, env });
    const generatedArtifact = path.join(evidence, side + "-8b93ba6b-generated-tokens.ts.gz");
    fs.writeFileSync(generatedArtifact, gzipSync(generatedBytes, { level: 9 }));
    setup.generatedBuildSources ??= {};
    setup.generatedBuildSources[side] = { source: sourceFile, generatedSha256: hash(generatedBytes),
      pinnedSha256: hash(pinnedBytes), artifact: path.relative(root, generatedArtifact), restoredBeforeSuite: true };
    fs.writeFileSync(sourcePath, pinnedBytes);
    save();
    for (const file of ["dist/cli.js", "dist/memory-substrate.js", "dist/memory-substrate.d.ts", "engram-memory/dist/index.js", "engram-memory/dist/sqlite.js"]) {
      assert.ok(fs.statSync(path.join(cwd, file)).size > 0, side + " build missing " + file);
    }
  }
  const reports = {};
  for (const [side, cwd] of [["base", baseline], ["branch", root]]) {
    const report = path.join(scratch, side + "-vitest.json");
    const suite = await run(side + "-8b93ba6b-suite", process.execPath,
      ["node_modules/vitest/vitest.mjs", "run", "--configLoader", "runner", "--reporter=json", "--outputFile=" + report], cwd, true);
    const types = await run(side + "-8b93ba6b-types", process.execPath,
      ["node_modules/typescript/bin/tsc", "--noEmit"], cwd, true);
    reports[side] = { report, types: types.raw, suiteExitCode: suite.exitCode, typeExitCode: types.exitCode };
  }
  const result = await run("comparison-8b93ba6b", process.execPath,
    ["tests/compare-openerp-full-suite.mjs", reports.base.report, reports.branch.report,
      reports.base.types, reports.branch.types, pin, "tests/ontology-guardian-openerp-full-suite-comparison-8b93ba6b.json"], root, true);
  setup.comparisonExitCode = result.exitCode;
  save();
  process.exitCode = result.exitCode;
} finally {
  if (created) {
    await run("baseline-remove-8b93ba6b", "git", ["-c", "core.hooksPath=/dev/null", "worktree", "remove", "--force", baseline], root);
    setup.baselineRemoved = !fs.existsSync(baseline);
    save();
  }
}
