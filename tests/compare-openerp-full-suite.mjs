// Retain both complete Vitest JSON reports and compare failure identities.
// Usage: node tests/compare-openerp-full-suite.mjs BASE.json BRANCH.json [BASE_TYPES.log BRANCH_TYPES.log]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseCommit = "636fa9d644088db3c9bdb6ade295dec5a8bf1f78";
const [baseFile, branchFile, baseTypeFile = "/tmp/op-base-tsc.log", branchTypeFile = "/tmp/op-branch-tsc.log"] = process.argv.slice(2);
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
const openerpFiles = branch.testResults.filter(file => /\/ontology-guardian-openerp-[^/]+\.test\.ts$/.test(file.name));
assert.equal(openerpFiles.length, 5);
assert.ok(openerpFiles.every(file => file.status === "passed"));
const openerpPassed = openerpFiles.reduce((sum, file) => sum + file.assertionResults.filter(test => test.status === "passed").length, 0);
const evidenceDir = path.join(root, "tests/fixtures/openerp-full-suite-evidence");
fs.mkdirSync(evidenceDir, { recursive: true });
const artifacts = {};
function retain(name, bytes) {
  const compressed = gzipSync(bytes, { level: 9 });
  const location = path.join(evidenceDir, name);
  fs.writeFileSync(location, compressed);
  artifacts[name] = { path: path.relative(root, location), rawSha256: sha256Hex(bytes), compressedSha256: sha256Hex(compressed), rawBytes: bytes.length };
}
retain("base-vitest.json.gz", baseBytes); retain("branch-vitest.json.gz", branchBytes);
const baseTypes = fs.readFileSync(baseTypeFile, "utf8");
const branchTypes = fs.readFileSync(branchTypeFile, "utf8");
assert.equal(baseTypes, branchTypes, "full TypeScript diagnostics must match base");
retain("base-typescript.txt.gz", Buffer.from(baseTypes)); retain("branch-typescript.txt.gz", Buffer.from(branchTypes));
const changedFromBase = git("diff", "--name-only", baseCommit).split("\n").filter(Boolean);
const inputPaths = changedFromBase.filter(file => !file.includes("openerp-full-suite-comparison") && !file.includes("openerp-full-suite-evidence") && !file.endsWith("openerp-mutant-evidence.json") && !file.endsWith("compare-openerp-full-suite.mjs"));
const inputSha256 = Object.fromEntries(inputPaths.map(file => [file, sha256Hex(fs.readFileSync(path.join(root, file)))]));
const { failingIdentities, ...baseSummary } = baseResult;
const { failingIdentities: _branchIdentities, ...branchSummary } = branchResult;
const frozenSpecBytes = fs.readFileSync(path.join(root, "tests/fixtures/openerp/openerp-ontology.json"));
assert.equal(sha256Hex(frozenSpecBytes), "dcee5c9da1fdca908e56a049a4af80e289a61beeda14ca9b155993152f2b1213");
const report = {
  format: "openerp-full-suite-comparison/1", generatedAt: new Date().toISOString(), baseCommit,
  binding: { branch: git("branch", "--show-current"), testedCommit: git("rev-parse", "HEAD"),
    frozenSpec: "SPEC-openerp-ontology-FROZEN-761beb41.md", frozenSpecSha256: "761beb417cc33c9181b0d1a74a8a59ca4350bf7970f99076d4ec5874250bbd93",
    changedFromBase, inputSha256, inputSetSha256: sha256Hex(canonicalBytes(inputSha256)), comparisonToolSha256: sha256Hex(fs.readFileSync(fileURLToPath(import.meta.url))),
    note: "Evidence-only commits may follow; inputSha256 binds the complete changed execution inputs independently of the evidence commit identity." },
  environment: { node: process.version, platform: process.platform, arch: process.arch, nodeModules: fs.realpathSync(path.join(root, "node_modules")), scope: "test-openerp" },
  scope: "Two complete Vitest runs with --configLoader runner --reporter=json, same dependencies and environment. Base is an isolated detached 636fa9d6 checkout inside the ignored .worktrees scratch directory sharing the branch node_modules.",
  base: baseSummary, branch: { ...branchSummary, openerpTests: { files: openerpFiles.map(file => relative(file.name)).sort(), passed: openerpPassed, failed: 0 } },
  fullTypeScript: { errorsOnEachSide: (branchTypes.match(/error TS/g) ?? []).length, identicalDiagnostics: true },
  failingIdentities, failingIdentitiesSha256: sha256Hex(canonicalBytes(failingIdentities)),
  failingIdentitiesMethod: "G0 RFC 8785 over sorted failed file identities and sorted failed assertion identities (file > fullName); both full JSON reports are retained.",
  conclusion: "Identical failure identities on base and branch; zero added failures. Openerp fixtures, vectors, admission, acceptance and migrations pass.",
};
fs.writeFileSync(path.join(root, "tests/ontology-guardian-openerp-full-suite-comparison.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ base: baseSummary, branch: report.branch, failureIdentitiesMatch: true, fullTypeScriptErrors: report.fullTypeScript.errorsOnEachSide }));
