import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyDiagnostic, compareReports } from "./compare-openerp-full-suite.mjs";

const options = { baseCommit: "a".repeat(40), branchCommit: "b".repeat(40),
  baseCheckout: "/fixture/.baseline", branchCheckout: "/fixture" };
function fixture(checkout, diagnostic = "Error: Cannot find module './build/Release/fs_ext.node'") {
  return { testResults: [{ name: checkout + "/tests/example.test.ts", status: "failed", message: "",
    assertionResults: [{ fullName: "opens native store", status: "failed", failureMessages: [diagnostic + "\n    at " + checkout + "/tests/example.test.ts:10:2"] }] }] };
}
const compare = (base, branch) => compareReports(base, branch, options);

test("should accept identical per-failure module diagnostics after checkout-prefix normalization", () => {
  const result = compare(fixture(options.baseCheckout), fixture(options.branchCheckout));
  assert.equal(result.passed, true);
  assert.equal(result.causesMatch, true);
  assert.equal(result.failures.base[0].commit, options.baseCommit);
  assert.deepEqual(result.failures.branch[0].modules, ["fs-ext"]);
});

test("should reject an altered unrelated message while preserving identities and statuses", () => {
  const base = fixture(options.baseCheckout), branch = fixture(options.branchCheckout);
  // A different assertion in the same file still names the native module.
  for (const json of [base, branch]) json.testResults[0].assertionResults.push({
    fullName: "another native failure", status: "failed", failureMessages: ["Error: Cannot find package 'fs-ext'"],
  });
  branch.testResults[0].assertionResults[0].failureMessages = ["Error: unrelated application regression, independent of any native module"];
  const result = compare(base, branch);
  assert.equal(result.passed, false);
  assert.equal(result.causesMatch, false);
  assert.equal(result.counts.branch.unclassified, 1);
  assert.equal(result.counts.branch["native-addon"], 1);
  assert.equal(result.addedFailuresOrSkips.length, 0);
});

test("should reject different causes even within the same native category and module", () => {
  const result = compare(fixture(options.baseCheckout), fixture(options.branchCheckout, "Error: fs-ext ABI mismatch"));
  assert.equal(result.counts.base["native-addon"], 1);
  assert.equal(result.counts.branch["native-addon"], 1);
  assert.equal(result.causesMatch, false);
  assert.equal(result.passed, false);
});

test("should reject changed native modules for the same failure identity", () => {
  const result = compare(fixture(options.baseCheckout), fixture(options.branchCheckout, "Error: Cannot find package 'better-sqlite3'"));
  assert.equal(result.causesMatch, false);
  assert.equal(result.passed, false);
});

test("should keep generic capability codes and unnamed native binaries unclassified", () => {
  for (const diagnostic of ["CAPABILITY_UNAVAILABLE", "MODULE_MISSING", "Error: unknown.node missing", "AssertionError: expected false to be true"]) {
    assert.equal(classifyDiagnostic(diagnostic).category, "unclassified");
    const result = compare(fixture(options.baseCheckout, diagnostic), fixture(options.branchCheckout, diagnostic));
    assert.equal(result.causesMatch, true);
    assert.equal(result.passed, false);
    assert.equal(result.counts.base.unclassified, 1);
    assert.equal(result.counts.branch.unclassified, 1);
  }
});

test("should classify failed suites without assertions from their own retained message", () => {
  const base = fixture(options.baseCheckout), branch = fixture(options.branchCheckout);
  for (const json of [base, branch]) {
    json.testResults[0].assertionResults = [];
    json.testResults[0].message = "Error: Cannot find package 'fs-ext'";
  }
  assert.equal(compare(base, branch).passed, true);
  branch.testResults[0].message = "Error: unrelated suite setup regression";
  const result = compare(base, branch);
  assert.equal(result.passed, false);
  assert.equal(result.failures.branch[0].kind, "suite");
  assert.equal(result.counts.branch.unclassified, 1);
});

test("should reject matching build-prerequisite failures on either pinned side", () => {
  const diagnostic = "Error: Cannot find module './dist/memory-substrate.js'";
  const result = compare(fixture(options.baseCheckout, diagnostic), fixture(options.branchCheckout, diagnostic));
  assert.equal(result.counts.base["build-prerequisite"], 1);
  assert.equal(result.counts.branch["build-prerequisite"], 1);
  assert.equal(result.passed, false);
});

test("should retain duplicate failures and reject an additional occurrence", () => {
  const base = fixture(options.baseCheckout), branch = fixture(options.branchCheckout);
  branch.testResults[0].assertionResults.push(structuredClone(branch.testResults[0].assertionResults[0]));
  const result = compare(base, branch);
  assert.equal(result.passed, false);
  assert.equal(result.failures.branch.length, 2);
  assert.equal(result.failures.branch[1].occurrence, 2);
  assert.equal(result.addedFailuresOrSkips.length, 1);
});

test("should include skipped and todo identities and preserve duplicate counts", () => {
  for (const status of ["pending", "skipped", "todo"]) {
    const base = fixture(options.baseCheckout), branch = fixture(options.branchCheckout);
    const skipped = { fullName: "deferred observable", status, failureMessages: [] };
    base.testResults[0].assertionResults.push(structuredClone(skipped));
    branch.testResults[0].assertionResults.push(structuredClone(skipped));
    assert.equal(compare(base, branch).passed, true);
    branch.testResults[0].assertionResults.push(structuredClone(skipped));
    const result = compare(base, branch);
    assert.equal(result.passed, false);
    assert.equal(result.addedFailuresOrSkips.length, 1);
    assert.equal(result.addedFailuresOrSkips[0].status, status);
  }
});
