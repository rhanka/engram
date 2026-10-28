// Retain both complete Vitest JSON reports and compare failure identities.
// Usage: node tests/compare-openerp-full-suite.mjs BASE.json BRANCH.json BASE_TYPES.log BRANCH_TYPES.log BASE_COMMIT [OUTPUT.json]
// BASE_COMMIT is the explicit pinned baseline (no hardcoded fallback); OUTPUT defaults to the historical comparison path.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [baseFile, branchFile, baseTypeFile, branchTypeFile, baseCommitArg, outputArg] = process.argv.slice(2);
assert.ok(baseFile && branchFile, "two complete JSON reports are required");
assert.ok(baseTypeFile && branchTypeFile, "two TypeScript logs are required");
assert.ok(baseCommitArg && /^[0-9a-f]{40}$/.test(baseCommitArg), "explicit pinned baseline commit (40 hex) is required");
const baseCommit = baseCommitArg;
const outputFile = outputArg ?? path.join(root, "tests/ontology-guardian-openerp-full-suite-comparison.json");
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
const shortBase = baseCommit.slice(0, 8);
function retain(name, bytes) {
  const compressed = gzipSync(bytes, { level: 9 });
  const location = path.join(evidenceDir, name);
  fs.writeFileSync(location, compressed);
  artifacts[name] = { path: path.relative(root, location), rawSha256: sha256Hex(bytes), compressedSha256: sha256Hex(compressed), rawBytes: bytes.length };
}
const isHistoricalBaseline = baseCommit === "636fa9d644088db3c9bdb6ade295dec5a8bf1f78";
if (isHistoricalBaseline) {
  retain("base-vitest.json.gz", baseBytes); retain("branch-vitest.json.gz", branchBytes);
} else {
  retain(`base-${shortBase}-vitest.json.gz`, baseBytes); retain(`branch-${shortBase}-vitest.json.gz`, branchBytes);
}
const baseTypes = fs.readFileSync(baseTypeFile, "utf8");
const branchTypes = fs.readFileSync(branchTypeFile, "utf8");
assert.equal(baseTypes, branchTypes, "full TypeScript diagnostics must match base");
if (isHistoricalBaseline) {
  retain("base-typescript.txt.gz", Buffer.from(baseTypes)); retain("branch-typescript.txt.gz", Buffer.from(branchTypes));
} else {
  retain(`base-${shortBase}-typescript.txt.gz`, Buffer.from(baseTypes)); retain(`branch-${shortBase}-typescript.txt.gz`, Buffer.from(branchTypes));
}
const changedFromBase = git("diff", "--name-only", baseCommit).split("\n").filter(Boolean);
const inputPaths = changedFromBase.filter(file => !file.includes("openerp-full-suite-comparison") && !file.includes("openerp-full-suite-evidence") && !file.endsWith("openerp-mutant-evidence.json") && !file.endsWith("compare-openerp-full-suite.mjs"));
const inputSha256 = Object.fromEntries(inputPaths.map(file => [file, sha256Hex(fs.readFileSync(path.join(root, file)))]));
const { failingIdentities, ...baseSummary } = baseResult;
const { failingIdentities: _branchIdentities, ...branchSummary } = branchResult;
const frozenSpecBytes = fs.readFileSync(path.join(root, "tests/fixtures/openerp/openerp-ontology.json"));
assert.equal(sha256Hex(frozenSpecBytes), "dcee5c9da1fdca908e56a049a4af80e289a61beeda14ca9b155993152f2b1213");
function probeNativeErrors() {
  const errors = [];
  try {
    execFileSync(process.execPath, ["scripts/check-native-abi.mjs"], { cwd: root, encoding: "utf8", timeout: 120000 });
  } catch (error) {
    const out = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    if (/better-sqlite3|fs-ext|\.node\b|MODULE_MISSING|CAPABILITY_UNAVAILABLE/.test(out)) {
      errors.push({ probe: "check-native-abi", excerpt: out.slice(0, 1000) });
    }
  }
  try {
    const probe = "import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { openFencedSqliteCanonicalMemoryStoreV1 } from './engram-memory/dist/sqlite.js'; const dir = mkdtempSync(join(tmpdir(), 'compare-probe-')); const opened = await openFencedSqliteCanonicalMemoryStoreV1({ filename: join(dir, 'probe.sqlite'), clock: { now: () => '2026-08-16T12:00:00.000Z' }, store_id: 'compare-probe', allow_ephemeral_filesystem_store: true }); console.log(JSON.stringify(opened.error ?? { ok: opened.ok }).slice(0, 1000));";
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", probe], { cwd: root, encoding: "utf8", timeout: 60000 });
    if (/better-sqlite3|fs-ext|fs_ext|\.node\b|CAPABILITY_UNAVAILABLE/.test(out)) {
      errors.push({ probe: "sqlite-open", excerpt: out.slice(0, 1000) });
    }
  } catch (error) {
    const out = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    if (/better-sqlite3|fs-ext|fs_ext|\.node\b|CAPABILITY_UNAVAILABLE/.test(out)) {
      errors.push({ probe: "sqlite-open", excerpt: out.slice(0, 1000) });
    }
  }
  return errors;
}
const nativeProbeErrors = probeNativeErrors();
function nativeGateOfSource(source) {
  if (source.includes("openFencedSqliteCanonicalMemoryStoreV1")) return "openFencedSqliteCanonicalMemoryStoreV1";
  if (source.includes("check-native-abi")) return "check-native-abi";
  if (source.includes("better-sqlite3") || source.includes("fs-ext")) return "native-import";
  return null;
}
function classifyFailures(json) {
  const groups = { nativeAddon: [], buildPrerequisite: [], unclassified: [], nativeAddonEvidence: [] };
  for (const file of json.testResults.filter((f) => f.status === "failed")) {
    const name = relative(file.name);
    const messages = file.assertionResults.filter((t) => t.status === "failed").flatMap((t) => t.failureMessages ?? []).join("\n");
    if (/better-sqlite3|fs-ext|\.node\b|CAPABILITY_UNAVAILABLE/.test(messages)) {
      groups.nativeAddon.push(name);
    } else if (/dist\/memory-substrate|no such file.*dist|ENOENT.*dist|substrate build missing|run `npm run build`|installed.*dist|memory-substrate\.js/.test(messages)) {
      groups.buildPrerequisite.push(name);
    } else {
      let gated = null;
      try {
        const source = fs.readFileSync(path.join(root, name), "utf8");
        gated = nativeGateOfSource(source);
      } catch {}
      const probe = nativeProbeErrors[0] ?? nativeProbeErrors[1] ?? null;
      if (gated !== null && probe !== undefined && probe !== null && /better-sqlite3|fs-ext|fs_ext|\.node\b|CAPABILITY_UNAVAILABLE|MODULE_MISSING/.test(probe.excerpt)) {
        groups.nativeAddon.push(name);
        groups.nativeAddonEvidence.push({ file: name, gate: gated, probe: probe.probe, excerpt: probe.excerpt.slice(0, 300) });
      } else {
        groups.unclassified.push({ file: name, excerpt: messages.slice(0, 500) });
      }
    }
  }
  for (const key of ["nativeAddon", "buildPrerequisite"]) groups[key] = [...new Set(groups[key])].sort();
  groups.nativeAddonEvidence = [...groups.nativeAddonEvidence].sort((a, b) => (a.file < b.file ? -1 : 1));
  groups.unclassified = [...groups.unclassified].sort((a, b) => (a.file < b.file ? -1 : 1));
  return groups;
}
function normalizeCauseGroups(groups) {
  return {
    nativeAddon: [...groups.nativeAddon],
    buildPrerequisite: [...groups.buildPrerequisite],
    unclassified: groups.unclassified.map((u) => u.file),
  };
}
const failureClassification = classifyFailures(branch);
const baseClassification = classifyFailures(base);
assert.deepEqual(
  normalizeCauseGroups(baseClassification),
  normalizeCauseGroups(failureClassification),
  "failure normalized causes must match base",
);
assert.equal(
  failureClassification.buildPrerequisite.length,
  0,
  `build-prerequisite failures must be zero after building dist + engram-memory: ${JSON.stringify(failureClassification.buildPrerequisite)}`,
);
assert.equal(
  failureClassification.unclassified.length,
  0,
  `unclassified failures must be zero: ${JSON.stringify(failureClassification.unclassified.slice(0, 3))}`,
);
const report = {
  format: "openerp-full-suite-comparison/1", generatedAt: new Date().toISOString(), baseCommit,
  binding: { branch: git("branch", "--show-current"), testedCommit: git("rev-parse", "HEAD"),
    frozenSpec: "SPEC-openerp-ontology-FROZEN-761beb41.md", frozenSpecSha256: "761beb417cc33c9181b0d1a74a8a59ca4350bf7970f99076d4ec5874250bbd93",
    changedFromBase, inputSha256, inputSetSha256: sha256Hex(canonicalBytes(inputSha256)), comparisonToolSha256: sha256Hex(fs.readFileSync(fileURLToPath(import.meta.url))),
    note: "Evidence-only commits may follow; inputSha256 binds the complete changed execution inputs independently of the evidence commit identity." },
  environment: { node: process.version, platform: process.platform, arch: process.arch, nodeModules: fs.realpathSync(path.join(root, "node_modules")), scope: "test-openerp" },
  scope: `Two complete Vitest runs with --reporter=json, same dependencies and environment (shared node_modules, top-level dist including memory-substrate.js plus declarations and engram-memory dist built via Node on both sides). Base is the explicit pinned ${baseCommit} checkout inside the ignored .worktrees scratch directory.`,
  base: baseSummary, branch: { ...branchSummary, openerpTests: { files: openerpFiles.map(file => relative(file.name)).sort(), passed: openerpPassed, failed: 0 } },
  fullTypeScript: { errorsOnEachSide: (branchTypes.match(/error TS/g) ?? []).length, identicalDiagnostics: true },
  failingIdentities, failingIdentitiesSha256: sha256Hex(canonicalBytes(failingIdentities)),
  failingIdentitiesMethod: "G0 RFC 8785 over sorted failed file identities and sorted failed assertion identities (file > fullName); both full JSON reports are retained.",
  failureClassification,
  baseFailureClassification: baseClassification,
  failureCause: `${failureClassification.nativeAddon.length} remaining failed files are native-addon (demonstrated error names better-sqlite3/fs-ext/.node/CAPABILITY_UNAVAILABLE); 0 build-prerequisite; 0 unclassified; identical identities and normalized causes on base and branch with zero added failures.`,
  conclusion: "Identical failure identities and normalized causes on base and branch; zero added failures. Openerp fixtures, vectors, admission, acceptance and migrations pass.",
};
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ base: baseSummary, branch: report.branch, failureIdentitiesMatch: true, fullTypeScriptErrors: report.fullTypeScript.errorsOnEachSide }));
