// Retain both complete Vitest JSON reports and compare failure identities.
// Usage: node tests/compare-diagram-full-suite.mjs BASE.json BRANCH.json [BASE_TYPES.log BRANCH_TYPES.log]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseCommit = "618977a86a25c35e426a87f97cb9f3391cd1c654";
const [baseFile, branchFile, baseTypeFile = "/tmp/g2-base-tsc.log", branchTypeFile = "/tmp/g2-branch-tsc.log"] = process.argv.slice(2);
assert.ok(baseFile && branchFile, "two complete JSON reports are required");
const compiled = await build({ entryPoints: [path.join(root, "src/ontology-guardian/canonical.ts")], bundle: true, platform: "node", format: "esm", write: false });
const { canonicalBytes, sha256Hex } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const baseBytes = fs.readFileSync(baseFile), branchBytes = fs.readFileSync(branchFile);
const base = JSON.parse(baseBytes), branch = JSON.parse(branchBytes);
const relative = name => name.slice(name.lastIndexOf("/tests/") + 1);
function projection(result) {
  const failedFiles = result.testResults.filter(file => file.status === "failed");
  const skipped = result.testResults.filter(file => file.assertionResults.length > 0 && file.assertionResults.every(test => ["pending", "skipped", "todo"].includes(test.status)));
  const tests = failedFiles.flatMap(file => file.assertionResults.filter(test => test.status === "failed").map(test => `${relative(file.name)} > ${test.fullName}`)).sort();
  const files = failedFiles.map(file => relative(file.name)).sort();
  return { testFiles: { failed: failedFiles.length, passed: result.testResults.length - failedFiles.length - skipped.length, skipped: skipped.length, total: result.testResults.length },
    tests: { failed: result.numFailedTests, passed: result.numPassedTests, skipped: result.numPendingTests, total: result.numTotalTests }, failingIdentities: { files, tests } };
}
const baseResult = projection(base), branchResult = projection(branch);
assert.equal(canonicalBytes(baseResult.failingIdentities), canonicalBytes(branchResult.failingIdentities), "the branch must introduce zero failed file/test identities");
const diagramFiles = branch.testResults.filter(file => /\/ontology-guardian-diagram-[^/]+\.test\.ts$/.test(file.name));
assert.equal(diagramFiles.length, 9);
assert.ok(diagramFiles.every(file => file.status === "passed"));
const evidenceDir = path.join(root, "tests/fixtures/diagram-full-suite-evidence");
fs.mkdirSync(evidenceDir, { recursive: true });
const artifacts = {};
function retain(name, bytes) {
  const compressed = gzipSync(bytes, { level: 9 });
  const location = path.join(evidenceDir, name);
  fs.writeFileSync(location, compressed);
  artifacts[name] = { path: path.relative(root, location), rawSha256: sha256Hex(bytes), compressedSha256: sha256Hex(compressed), rawBytes: bytes.length };
}
retain("base-vitest.json.gz", baseBytes); retain("branch-vitest.json.gz", branchBytes);
const baseTypes = fs.readFileSync(baseTypeFile, "utf8").replaceAll(".graphify/scratch/g2-base/", "");
const branchTypes = fs.readFileSync(branchTypeFile, "utf8");
assert.equal(baseTypes, branchTypes, "full TypeScript diagnostics must match base");
retain("base-typescript.txt.gz", Buffer.from(baseTypes)); retain("branch-typescript.txt.gz", Buffer.from(branchTypes));
const changedFromBase = git("diff", "--name-only", baseCommit).split("\n").filter(Boolean);
const inputPaths = changedFromBase.filter(file => !file.includes("diagram-full-suite-comparison") && !file.includes("diagram-full-suite-evidence") && !file.endsWith("diagram-mutant-evidence.json") && !file.endsWith("compare-diagram-full-suite.mjs"));
const inputSha256 = Object.fromEntries(inputPaths.map(file => [file, sha256Hex(fs.readFileSync(path.join(root, file)))]));
const modelFile = "tests/llm-mesh-bridge.test.ts";
assert.ok(baseResult.failingIdentities.files.includes(modelFile));
const { failingIdentities, ...baseSummary } = baseResult;
const { failingIdentities: _branchIdentities, ...branchSummary } = branchResult;
const frozenSpecBytes = fs.readFileSync(path.join(root, "tests/fixtures/pinned-sources/corpus/deb64b75e884bfefbdd97de698c899805568271ea1fc521fffe02cbc20288c2f.bytes"));
assert.equal(sha256Hex(frozenSpecBytes), "deb64b75e884bfefbdd97de698c899805568271ea1fc521fffe02cbc20288c2f");
const frozenSpec = frozenSpecBytes.toString("utf8");
const unverifiedRegister = frozenSpec.slice(frozenSpec.indexOf("### 11.2 unverified register"), frozenSpec.indexOf("## Appendix A"))
  .split("\n").filter(line => line.startsWith("| U-")).map(line => {
    const [, id, item, ownerAndEffect] = line.split("|").map(value => value.trim());
    return { id, item, ownerAndEffect, status: "unverified — out of this code-author lot" };
  });
assert.equal(unverifiedRegister.length, 10);
const report = {
  format: "diagram-full-suite-comparison/2", generatedAt: new Date().toISOString(), baseCommit,
  binding: { branch: git("branch", "--show-current"), testedCommit: git("rev-parse", "HEAD"),
    frozenSpec: "m3/SPEC_EVOL_GD_M3_DIAGRAM_MODEL-FROZEN-deb64b75.md", frozenSpecSha256: "deb64b75e884bfefbdd97de698c899805568271ea1fc521fffe02cbc20288c2f",
    changedFromBase, inputSha256, inputSetSha256: sha256Hex(canonicalBytes(inputSha256)), comparisonToolSha256: sha256Hex(fs.readFileSync(fileURLToPath(import.meta.url))),
    note: "Evidence-only commits may follow; inputSha256 binds the complete changed execution inputs independently of the evidence commit identity." },
  environment: { node: process.version, platform: process.platform, arch: process.arch, nodeModules: fs.realpathSync(path.join(root, "node_modules")), env: "test-g2" },
  scope: "Two complete Vitest runs with --configLoader runner --reporter=json, same dependencies and environment. Base is an isolated detached 618977a8 checkout created inside the ignored worktree scratch directory, with its Git index/history restored before execution.",
  base: baseSummary, branch: { ...branchSummary, diagramTests: { files: diagramFiles.map(file => relative(file.name)).sort(), passed: diagramFiles.reduce((sum, file) => sum + file.assertionResults.filter(test => test.status === "passed").length, 0), failed: 0 } },
  fullTypeScript: { errorsOnEachSide: (branchTypes.match(/error TS/g) ?? []).length, identicalDiagnostics: true },
  failingIdentities, failingIdentitiesSha256: sha256Hex(canonicalBytes(failingIdentities)),
  failingIdentitiesMethod: "G0 RFC 8785 over sorted failed file identities and sorted failed assertion identities (file > fullName); both full JSON reports are retained.",
  classification: {
    nativeOrBuildPrerequisite: { files: failingIdentities.files.filter(file => file !== modelFile), description: "Identical baseline failures: missing fs-ext/better-sqlite3, unbuilt engram-memory/dist and grammars, associated capability/native ABI checks and npm toolchain prerequisites." },
    modelDependencyResolution: { files: [modelFile], description: "Separate baseline failure: model resolution reports Model not found: openai:gpt-5.5 before the expected fail-closed authResolver error." },
  }, artifacts, unverifiedRegister, conclusion: "Identical failure identities on base and branch; zero added failures. Diagram fixtures, migrations and schemas pass. Native semantic/projection/layout execution and production admission remain their named owners' gates.",
};
fs.writeFileSync(path.join(root, "tests/ontology-guardian-diagram-full-suite-comparison.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ base: baseSummary, branch: report.branch, failureIdentitiesMatch: true, fullTypeScriptErrors: report.fullTypeScript.errorsOnEachSide }));
