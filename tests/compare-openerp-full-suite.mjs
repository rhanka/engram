// Internal evidence tool. Retain complete reports even when the strict comparison fails.
// Usage: node tests/compare-openerp-full-suite.mjs BASE.json BRANCH.json BASE_TYPES.log BRANCH_TYPES.log BASE_COMMIT [OUTPUT.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relative = name => name.replaceAll("\\", "/").match(/(?:^|\/)(tests\/.*)$/)?.[1] ?? name;
const skippedStatuses = new Set(["pending", "skipped", "todo", "disabled"]);

// Conductor-approved exceptions: exact assertion identities, todo only, one
// occurrence each. These missing G0 operations remain owned by engram.
export const OPENERP_GAP_TODO_ALLOWLIST = [
  {
    file: "tests/ontology-guardian-openerp-admission.test.ts",
    fullName: "§1.3 record closure (FX-OP-03) FX-OP-03 record closure (extra field): missing G0 record-closure validator (GAP-OP-03, owner engram)",
    gap: "GAP-OP-03",
  },
  {
    file: "tests/ontology-guardian-openerp-admission.test.ts",
    fullName: "§1.3 record closure (FX-OP-03) FX-OP-03 record closure (corpusRef unresolved): missing G0 record-closure validator (GAP-OP-03, owner engram)",
    gap: "GAP-OP-03",
  },
  {
    file: "tests/ontology-guardian-openerp-acceptance.test.ts",
    fullName: "FX-OP-04 licence closure (§7) — not-covered (GAP-OP-04) FX-OP-04 pack closure: missing G0 pack licence-closure recomputation with excluded-licence gate (GAP-OP-04, owner engram)",
    gap: "GAP-OP-04",
  },
  {
    file: "tests/ontology-guardian-openerp-acceptance.test.ts",
    fullName: "FX-OP-10 lifecycle stability (§§1.5, 6a) GAP-OP-10: missing G0 catalog/lifecycle full-Pin resolver over RegistryEnvelope entries; deprecated pin remains resolvable",
    gap: "GAP-OP-10",
  },
].map(({ file, fullName, gap }) => Object.freeze({
  identity: JSON.stringify([file, fullName, "assertion"]),
  file, fullName, status: "todo", maxOccurrences: 1, gap, owner: "engram",
}));
Object.freeze(OPENERP_GAP_TODO_ALLOWLIST);

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
  const allowances = new Map(OPENERP_GAP_TODO_ALLOWLIST.map(entry => [entry.identity, {
    entry,
    remaining: Math.max(0, entry.maxOccurrences - baseStatuses.filter(row => row.identity === entry.identity && row.status === entry.status).length),
  }]));
  const allowlistedTodos = [], unexpectedAddedFailuresOrSkips = [];
  for (const row of addedFailuresOrSkips) {
    const allowance = allowances.get(row.identity);
    if (allowance && row.status === allowance.entry.status && allowance.remaining > 0) {
      allowance.remaining--;
      allowlistedTodos.push({ ...row, gap: allowance.entry.gap, owner: allowance.entry.owner });
    } else unexpectedAddedFailuresOrSkips.push(row);
  }
  const causesMatch = isDeepStrictEqual(comparable(baseFailures), comparable(branchFailures));
  const counts = rows => Object.fromEntries(["native-addon", "build-prerequisite", "unclassified"].map(category => [category, rows.filter(row => row.category === category).length]));
  const baseCounts = counts(baseFailures), branchCounts = counts(branchFailures);
  const reasons = [];
  if (unexpectedAddedFailuresOrSkips.length) reasons.push("added failing or skipped identities outside the exact GAP todo allowlist (including duplicate counts)");
  if (!causesMatch) reasons.push("failure identities, categories, modules or normalized causes differ");
  for (const [side, count] of [["base", baseCounts], ["branch", branchCounts]]) {
    if (count["build-prerequisite"]) reasons.push(side + ": build-prerequisite failures");
    if (count.unclassified) reasons.push(side + ": unclassified failures");
  }
  return { passed: reasons.length === 0, reasons, causesMatch, addedFailuresOrSkips,
    todoAllowlist: OPENERP_GAP_TODO_ALLOWLIST, allowlistedTodos, unexpectedAddedFailuresOrSkips,
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

async function main() {
  const [baseFile, branchFile, baseTypeFile, branchTypeFile, baseCommit, outputArg] = process.argv.slice(2);
  assert.ok(baseFile && branchFile && baseTypeFile && branchTypeFile, "complete JSON reports and TypeScript logs are required");
  assert.match(baseCommit ?? "", /^[0-9a-f]{40}$/, "explicit pinned baseline commit is required");
  const outputFile = outputArg ?? path.join(root, "tests/ontology-guardian-openerp-full-suite-comparison.json");
  const compiled = await build({ entryPoints: [path.join(root, "src/ontology-guardian/canonical.ts")], bundle: true, platform: "node", format: "esm", write: false });
  const { canonicalBytes, sha256Hex } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const baseBytes = fs.readFileSync(baseFile), branchBytes = fs.readFileSync(branchFile);
  const base = JSON.parse(baseBytes), branch = JSON.parse(branchBytes);
  const branchCommit = git("rev-parse", "HEAD");
  const comparison = compareReports(base, branch, { baseCommit, branchCommit,
    baseCheckout: path.join(root, ".baseline"), branchCheckout: root });
  const baseTypes = fs.readFileSync(baseTypeFile, "utf8"), branchTypes = fs.readFileSync(branchTypeFile, "utf8");
  const normalizedBaseTypes = normalizeDiagnostic(baseTypes, path.join(root, ".baseline"));
  const normalizedBranchTypes = normalizeDiagnostic(branchTypes, root);
  const fullTypeScript = {
    errors: { base: (baseTypes.match(/error TS/g) ?? []).length, branch: (branchTypes.match(/error TS/g) ?? []).length },
    identicalDiagnostics: normalizedBaseTypes === normalizedBranchTypes,
  };
  if (!fullTypeScript.identicalDiagnostics || fullTypeScript.errors.base || fullTypeScript.errors.branch) {
    comparison.passed = false; comparison.reasons.push("TypeScript diagnostics differ or contain errors");
  }
  const openerpFiles = branch.testResults.filter(file => /\/ontology-guardian-openerp-[^/]+\.test\.ts$/.test(file.name));
  if (openerpFiles.length !== 5 || openerpFiles.some(file => file.status === "failed")) {
    comparison.passed = false; comparison.reasons.push("OpenERP fixture suites missing or failing");
  }
  const evidenceDir = path.join(root, "tests/fixtures/openerp-full-suite-evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const artifacts = {};
  const short = baseCommit.slice(0, 8);
  function retain(name, bytes) {
    const compressed = gzipSync(bytes, { level: 9 });
    const location = path.join(evidenceDir, name);
    fs.writeFileSync(location, compressed);
    artifacts[name] = { path: path.relative(root, location), rawSha256: sha256Hex(bytes),
      compressedSha256: sha256Hex(compressed), rawBytes: bytes.length };
  }
  retain("base-" + short + "-vitest.json.gz", baseBytes);
  retain("branch-" + short + "-vitest.json.gz", branchBytes);
  retain("base-" + short + "-typescript.txt.gz", Buffer.from(baseTypes));
  retain("branch-" + short + "-typescript.txt.gz", Buffer.from(branchTypes));
  const changedFromBase = git("diff", "--name-only", baseCommit).split("\n").filter(Boolean);
  const inputPaths = changedFromBase.filter(file => !file.includes("openerp-full-suite-comparison") && !file.includes("openerp-full-suite-evidence") && !file.endsWith("openerp-mutant-evidence.json"));
  const inputSha256 = Object.fromEntries(inputPaths.map(file => [file, sha256Hex(fs.readFileSync(path.join(root, file)))]));
  assert.equal(sha256Hex(fs.readFileSync(path.join(root, "tests/fixtures/openerp/openerp-ontology.json"))), "dcee5c9da1fdca908e56a049a4af80e289a61beeda14ca9b155993152f2b1213");
  const { statuses: statusRecords, ...decision } = comparison;
  const report = {
    format: "openerp-full-suite-comparison/2", generatedAt: new Date().toISOString(), baseCommit,
    binding: { branch: git("branch", "--show-current"), testedCommit: branchCommit, changedFromBase, inputSha256,
      inputSetSha256: sha256Hex(canonicalBytes(inputSha256)), comparisonToolSha256: sha256Hex(fs.readFileSync(fileURLToPath(import.meta.url))),
      frozenSpec: "SPEC-openerp-ontology-FROZEN-761beb41.md", frozenSpecSha256: "761beb417cc33c9181b0d1a74a8a59ca4350bf7970f99076d4ec5874250bbd93" },
    environment: { node: process.version, nodeBinary: process.execPath, platform: process.platform, arch: process.arch,
      nodeModules: fs.realpathSync(path.join(root, "node_modules")), npmCache: process.env.npm_config_cache },
    scope: "Pinned .baseline detached worktree; one installation shared by symlinks; same Node/environment/npm cache; top-level and engram-memory builds on both sides. See retained setup.json and full command logs.",
    base: summary(base), branch: summary(branch), fullTypeScript, artifacts,
    method: "Each failed assertion, or failed suite without a failed assertion, uses only its own retained diagnostic on its pinned side. No probes or source-token fallback. Identity includes file, fullName, kind and occurrence. Compare category, native modules and complete diagnostic after known absolute/relative checkout and shared-installation path normalization only. Status multisets include skips and todos; only the four exact conductor-approved GAP todo identities are allowed once each.",
    statusEvidence: Object.fromEntries(Object.entries(statusRecords).map(([side, rows]) => [side, { count: rows.length, sha256: sha256Hex(canonicalBytes(rows)) }])),
    ...decision,
  };
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ base: report.base, branch: report.branch, counts: report.counts,
    causesMatch: report.causesMatch, addedFailuresOrSkips: report.addedFailuresOrSkips.length,
    allowlistedTodos: report.allowlistedTodos.length, unexpectedAddedFailuresOrSkips: report.unexpectedAddedFailuresOrSkips.length,
    fullTypeScript, passed: report.passed, reasons: report.reasons }));
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
