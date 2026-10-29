// Ported from OpenERP fa5caab3e33189f11d3309511974b324c3eee3e3, tests/compare-openerp-full-suite.mjs.
// L4 adaptations: no todo allowance; baseline-only failures retained as unresolved.
// Internal evidence tool. Retain complete reports even when the strict comparison fails.
// Usage: node tests/compare-l4-full-suite.mjs BASE.json BRANCH.json SETUP.json OUTPUT.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relative = name => name.replaceAll("\\", "/").match(/(?:^|\/)(tests\/.*)$/)?.[1] ?? name;
const skippedStatuses = new Set(["pending", "skipped", "todo", "disabled"]);

export function normalizeDiagnostic(diagnostic, checkout) {
  // Only the two known checkout prefixes differ incidentally. Keep error text,
  // native module names, source locations, error codes and stack frames intact.
  const sharedRoot = checkout.endsWith("/.baseline") ? path.dirname(checkout) : checkout;
  const normalized = diagnostic.replaceAll(checkout, "<checkout>").replaceAll(sharedRoot, "<checkout>");
  // esbuild prints shared dependency locations relative to cwd: for example
  // ../engram-memory/node_modules on .baseline versus engram-memory/node_modules
  // on the branch. Resolve only those known shared-installation prefixes.
  return normalized.split("\n").map(line => {
    const text = line.trimStart(), indent = line.slice(0, line.length - text.length);
    for (const directory of ["engram-memory/node_modules", "studio/node_modules", "node_modules"]) {
      const prefix = path.relative(checkout, path.join(sharedRoot, directory)) + "/";
      if (text.startsWith(prefix)) return indent + "<checkout>/" + directory + "/" + text.slice(prefix.length);
    }
    return line;
  }).join("\n");
}

export function classifyDiagnostic(diagnostic) {
  const modules = [...new Set(diagnostic.match(/\b(?:better-sqlite3|fs-ext|fs_ext\.node|better_sqlite3\.node)\b/g) ?? [])]
    .map(name => name === "fs_ext.node" ? "fs-ext" : name === "better_sqlite3.node" ? "better-sqlite3" : name);
  const nativeModules = [...new Set(modules)].sort();
  if (nativeModules.length) return { category: "native-addon", modules: nativeModules };
  if (/(?:Cannot find|ENOENT|no such file|build missing|run .npm run build.).*(?:dist\/|memory-substrate)|substrate build missing/i.test(diagnostic)) {
    return { category: "build-prerequisite", modules: [] };
  }
  return { category: "unclassified", modules: [] };
}

export function failureRecords(json, { side, commit, checkout }) {
  const records = [];
  const occurrences = new Map();
  const add = (file, test, kind, diagnostic) => {
    const fileName = relative(file.name);
    const fullName = test?.fullName ?? null;
    const identity = JSON.stringify([fileName, fullName, kind]);
    const occurrence = (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, occurrence);
    const classification = classifyDiagnostic(diagnostic);
    records.push({ identity: JSON.stringify([fileName, fullName, kind, occurrence]), file: fileName,
      fullName, kind, occurrence, side, commit, status: "failed", ...classification,
      cause: normalizeDiagnostic(diagnostic, checkout), diagnostic });
  };
  for (const file of json.testResults) {
    const failed = (file.assertionResults ?? []).filter(test => test.status === "failed");
    for (const test of failed) add(file, test, "assertion", (test.failureMessages ?? []).join("\n"));
    if (file.status === "failed" && failed.length === 0) add(file, null, "suite", file.message ?? "");
  }
  return records.sort((a, b) => a.identity.localeCompare(b.identity));
}

function statuses(json) {
  // Retain duplicates and all statuses, including todo (Vitest excludes todo
  // from numPendingTests). Suite failures without assertions also have identities.
  return json.testResults.flatMap(file => [
    { identity: JSON.stringify([relative(file.name), null, "suite"]), status: file.status },
    ...(file.assertionResults ?? []).map(test => ({
      identity: JSON.stringify([relative(file.name), test.fullName, "assertion"]), status: test.status,
    })),
  ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function addedAdverseStatuses(base, branch) {
  const available = new Map();
  for (const row of base) {
    const key = JSON.stringify(row);
    available.set(key, (available.get(key) ?? 0) + 1);
  }
  const added = [];
  for (const row of branch) {
    const key = JSON.stringify(row);
    const count = available.get(key) ?? 0;
    if (count) available.set(key, count - 1);
    else if (row.status === "failed" || skippedStatuses.has(row.status)) added.push(row);
  }
  return added;
}

export function compareReports(base, branch, { baseCommit, branchCommit, baseCheckout, branchCheckout }) {
  const baseFailures = failureRecords(base, { side: "base", commit: baseCommit, checkout: baseCheckout });
  const branchFailures = failureRecords(branch, { side: "branch", commit: branchCommit, checkout: branchCheckout });
  const comparable = rows => rows.map(({ identity, category, modules, cause }) => ({ identity, category, modules, cause }));
  const baseStatuses = statuses(base), branchStatuses = statuses(branch);
  const addedFailuresOrSkips = addedAdverseStatuses(baseStatuses, branchStatuses);
  const causesMatch = isDeepStrictEqual(comparable(baseFailures), comparable(branchFailures));
  const counts = rows => Object.fromEntries(["native-addon", "build-prerequisite", "unclassified"].map(category => [category, rows.filter(row => row.category === category).length]));
  const baseCounts = counts(baseFailures), branchCounts = counts(branchFailures);
  const baseByIdentity = new Map(baseFailures.map(row => [row.identity, row]));
  const branchIds = new Set(branchFailures.map(row => row.identity));
  const baselineOnlyFailures = baseFailures.filter(row => !branchIds.has(row.identity)).map(row => ({
    ...row, originalCategory: row.category, category: "unclassified", resolution: "unresolved",
  }));
  const sharedCausesMatch = branchFailures.every(row => isDeepStrictEqual(
    comparable([baseByIdentity.get(row.identity) ?? {}])[0], comparable([row])[0]));
  const identities = [...new Set([...baseStatuses, ...branchStatuses].map(row => row.identity))].sort();
  const histogram = (rows, identity) => rows.filter(row => row.identity === identity).map(row => row.status).sort();
  const statusChanges = identities.map(identity => ({ identity,
    base: histogram(baseStatuses, identity), branch: histogram(branchStatuses, identity),
  })).filter(row => !isDeepStrictEqual(row.base, row.branch));
  const reasons = [];
  if (addedFailuresOrSkips.length) reasons.push("added failing or skipped identities (including duplicate counts)");
  if (!sharedCausesMatch) reasons.push("branch failure identities, categories, modules or normalized causes differ");
  if (branchCounts["build-prerequisite"]) reasons.push("branch: build-prerequisite failures");
  if (branchCounts.unclassified) reasons.push("branch: unclassified failures");
  return { passed: reasons.length === 0, reasons, causesMatch, sharedCausesMatch, addedFailuresOrSkips,
    baselineOnlyFailures, unresolved: baselineOnlyFailures, statusChanges,
    counts: { base: baseCounts, branch: branchCounts },
    failures: { base: baseFailures, branch: branchFailures },
    statuses: { base: baseStatuses, branch: branchStatuses } };
}

function summary(json) {
  const files = json.testResults;
  return {
    testFiles: { failed: files.filter(f => f.status === "failed").length, passed: files.filter(f => f.status === "passed").length,
      skipped: files.filter(f => skippedStatuses.has(f.status)).length, total: files.length },
    tests: { failed: json.numFailedTests, passed: json.numPassedTests, skipped: json.numPendingTests,
      todo: json.numTodoTests ?? 0, total: json.numTotalTests },
  };
}

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
async function main() {
  const [baseFile, branchFile, setupFile, outputFile] = process.argv.slice(2);
  assert.ok(baseFile && branchFile && setupFile && outputFile, "two complete reports, setup and output are required");
  const setup = JSON.parse(fs.readFileSync(setupFile));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const baseCommit = setup.baseCommit, branchCommit = setup.branchCommit;
  assert.match(baseCommit, /^[0-9a-f]{40}$/);
  assert.equal(branchCommit, git("rev-parse", "HEAD"));
  const baseBytes = fs.readFileSync(baseFile), branchBytes = fs.readFileSync(branchFile);
  const base = JSON.parse(baseBytes), branch = JSON.parse(branchBytes);
  const comparison = compareReports(base, branch, { baseCommit, branchCommit,
    baseCheckout: path.join(root, ".baseline"), branchCheckout: root });
  const evidenceDir = path.join(root, "tests/fixtures/l4-full-suite-evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const artifacts = {};
  function retain(name, bytes) {
    const compressed = gzipSync(bytes, { level: 9 });
    const location = path.join(evidenceDir, name);
    fs.writeFileSync(location, compressed);
    artifacts[name] = { path: path.relative(root, location), rawSha256: sha256(bytes),
      compressedSha256: sha256(compressed), rawBytes: bytes.length, compressedBytes: compressed.length };
  }
  retain("base-vitest.json.gz", baseBytes);
  retain("branch-vitest.json.gz", branchBytes);
  retain("setup.json.gz", fs.readFileSync(setupFile));
  for (const log of setup.logs) retain(path.basename(log) + ".gz", fs.readFileSync(path.join(root, log)));
  for (const file of ["tests/compare-l4-full-suite.mjs", "tests/compare-l4-full-suite.self-test.mjs",
    "tests/mcp-memory-l4-disabled-detector.mutants.mjs", "tests/fixtures/l4-disabled-detector-cases.mjs"]) {
    retain(path.basename(file) + ".gz", fs.readFileSync(path.join(root, file)));
  }
  const changedFromBase = git("diff", "--name-only", baseCommit).split("\n").filter(Boolean);
  const inputPaths = changedFromBase.filter(file => !file.includes("l4-full-suite-evidence") &&
    file !== "candidate-validation-carry-0213.json" && fs.existsSync(path.join(root, file)));
  const inputSha256 = Object.fromEntries(inputPaths.sort().map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]));
  const { statuses: statusRecords, ...decision } = comparison;
  const report = {
    format: "l4-full-suite-comparison/1", generatedAt: new Date().toISOString(), baseCommit,
    binding: { branch: git("branch", "--show-current"), testedCommit: branchCommit, changedFromBase, inputSha256,
      inputSetSha256: sha256(JSON.stringify(inputSha256)), comparisonToolSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))) },
    environment: setup.environment, scope: setup.method,
    base: summary(base), branch: summary(branch), artifacts,
    method: "OpenERP comparator port: each failure uses its own diagnostic; key = file/fullName/kind/occurrence. Compare identity, category, modules and diagnostic normalized only for checkout/shared-install paths. Status multisets retain duplicate counts, skips and todos. No added adverse status allowed. Baseline-only failures are retained as unclassified and unresolved per the round-3 design note; strict causesMatch remains visible. Branch unclassified/build-prerequisite failures always fail.",
    statusEvidence: Object.fromEntries(Object.entries(statusRecords).map(([side, rows]) => [side, { count: rows.length, sha256: sha256(JSON.stringify(rows)) }])),
    ...decision,
  };
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(outputFile, bytes);
  retain("comparison.json.gz", bytes);
  console.log(JSON.stringify({ base: report.base, branch: report.branch, counts: report.counts,
    causesMatch: report.causesMatch, sharedCausesMatch: report.sharedCausesMatch,
    addedFailuresOrSkips: report.addedFailuresOrSkips.length, unresolved: report.unresolved,
    passed: report.passed, reasons: report.reasons }));
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
