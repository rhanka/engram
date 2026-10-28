// OpenERP lot mutation proof, in the style of the G0 and diagram lots.
// Every runtime mutation executes committed callbacks with Vitest matchers.
// Import/compile/setup errors never count as killed.
import { build, stop } from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as chai from "chai";
import { JestChaiExpect, JestAsymmetricMatchers, setState } from "@vitest/expect";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src/ontology-guardian");
process.env.OPENERP_TESTS_DIR = path.join(root, "tests");
chai.use(JestChaiExpect); chai.use(JestAsymmetricMatchers);
setState({ assertionCalls: 0, isExpectingAssertions: false }, chai.expect);
const runtimeKey = Symbol.for("openerp.committed.callbacks");
let registered;
const suites = [];
globalThis[runtimeKey] = {
  file: "",
  expect: chai.expect,
  describe(name, fn) { suites.push(name); try { fn(); } finally { suites.pop(); } },
  it(name, fn) { registered.push({ file: this.file, name: [...suites, name].join(" > "), fn }); },
};
globalThis[runtimeKey].it = (name, fn) => registered.push({ file: globalThis[runtimeKey].file, name: [...suites, name].join(" > "), fn });
const TEST_FILES = [
  "ontology-guardian-openerp-vectors.test.ts",
  "ontology-guardian-openerp-admission.test.ts",
  "ontology-guardian-openerp-acceptance.test.ts",
  "ontology-guardian-openerp-migrations.test.ts",
  "ontology-guardian-openerp-typeproof.test.ts",
];
async function callbacks(mutation) {
  registered = [];
  let hits = 0;
  const result = await build({ stdin: {
    contents: TEST_FILES.map(file => `import ${JSON.stringify(path.join(root, "tests", file))};`).join("\n"),
    resolveDir: root }, bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
    plugins: [{ name: "openerp-memory-mutants", setup(build) {
      build.onResolve({ filter: /^vitest$/ }, () => ({ path: "vitest", namespace: "openerp" }));
      build.onResolve({ filter: /^yaml$/ }, () => ({ path: "yaml-stub", namespace: "openerp-yaml" }));
      build.onLoad({ filter: /^yaml-stub$/, namespace: "openerp-yaml" }, () => ({ contents: "export const parse = () => { throw new Error('yaml-stub: never called by committed callbacks'); };", loader: "js" }));
      build.onLoad({ filter: /.*/, namespace: "openerp" }, () => ({ contents: 'export const { describe, it, expect } = globalThis[Symbol.for("openerp.committed.callbacks")];', loader: "js" }));
      build.onLoad({ filter: /ontology-guardian-openerp-.+\.test\.ts$/ }, args => ({ contents:
        `globalThis[Symbol.for("openerp.committed.callbacks")].file = ${JSON.stringify(path.basename(args.path))};\n` + fs.readFileSync(args.path, "utf8"), loader: "ts" }));
      build.onLoad({ filter: /ontology-guardian\/.+\.ts$/ }, args => {
        let contents = fs.readFileSync(args.path, "utf8");
        if (mutation && path.basename(args.path) === mutation.file) {
          const count = contents.split(mutation.find).length - 1;
          assert.equal(count, 1, `setup ${mutation.id}: anchor must occur once, got ${count}`);
          contents = contents.replace(mutation.find, mutation.replace); hits++;
        }
        return { contents, loader: "ts" };
      });
    } }],
  });
  if (mutation) assert.equal(hits, 1, `setup ${mutation.id}: module must load`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}#${mutation?.id ?? "baseline"}`);
  void module;
  const failures = [];
  let executed = 0;
  for (const test of registered) {
    executed++;
    try { await test.fn(); } catch (error) { failures.push({ name: test.name, file: test.file, message: error.message }); }
  }
  assert.ok(executed > 0, `empty test selection for ${mutation?.id ?? "baseline"}`);
  return { count: registered.length, executed, failures };
}
const mutations = [];
function mutate(id, file, find, replace) { mutations.push({ id, file, find, replace }); }

mutate("OM1", "openerp-profile.ts",
  'export const OPENERP_CONTENT_DIGEST: Digest = "8c00c51d1132d48dbe7a223f0fb0fb7b7d79fc6894d403b4731ffa265b081e65";',
  'export const OPENERP_CONTENT_DIGEST: Digest = "8c00c51d1132d48dbe7a223f0fb0fb7b7d79fc6894d403b4731ffa265b081e66";');
mutate("OM2", "openerp-mappings.ts",
  '  "0916d8fc11ece323cfaecf2e58d1dbbb483ecbb46fdb645ad7f212172ae02de3",',
  '  "0916d8fc11ece323cfaecf2e58d1dbbb483ecbb46fdb645ad7f212172ae02de4",');
mutate("OM3", "openerp-constraints.ts",
  '    constraint: "bank_transactions_account_provider_fk",',
  '    constraint: "bank_transactions_account_provider_fx",');
mutate("OM4", "openerp-constraints.ts",
  'export const JOURNAL_SOURCE_KINDS: readonly string[] = ["invoice", "payment", "manual"] as const;',
  'export const JOURNAL_SOURCE_KINDS: readonly string[] = ["invoice", "payment"] as const;');
mutate("OM5", "openerp-constraints.ts",
  'export const DATABASE_IMMUTABLE_ENTITIES: readonly string[] = ["bank_transactions", "audit_events"] as const;',
  'export const DATABASE_IMMUTABLE_ENTITIES: readonly string[] = ["bank_transactions"] as const;');
mutate("OM6", "openerp-constraints.ts",
  '  { subject: "invoices (organization_id, invoice_number)", kind: "unique", scope: "organization_id", enforcement: "database", source: "§2.7 unique" },',
  '  { subject: "invoices (organization_id, invoice_number)", kind: "unique", scope: "organization_id", enforcement: "application", source: "§2.7 unique" },');
mutate("OM7", "openerp-governed.ts",
  "export const EXPECTED_COLUMN_ROWS = 776 as const;",
  "export const EXPECTED_COLUMN_ROWS = 775 as const;");
mutate("OM8", "openerp-registry.ts",
  '  profileRef: { canonicalRef: "openerp@1", contentDigest: OPENERP_CONTENT_DIGEST },',
  '  profileRef: { canonicalRef: "openerp@9", contentDigest: OPENERP_CONTENT_DIGEST },');
mutate("OM9", "openerp-mappings.ts",
  '  if (candidate.level === "field") return { qualified: false, reason: "field-level-blocked" };',
  '  if (candidate.level === "field") return { qualified: true };');
mutate("OM10", "openerp-constraints.ts",
  '  if ((NOT_TENANT_CARRIED_RELATIONS as readonly string[]).includes(relationKey)) return "not-tenant-carried";',
  "  void relationKey;");
mutate("OM11", "openerp-governed.ts",
  "        ...(c.references === undefined ? {} : { references: { entity: c.references.entity, field: c.references.field } }),",
  "        ...(c.references === undefined ? {} : {}),");
mutate("OM12", "openerp-registry.ts",
  '  contentDigest: "da41330ae7318fc723982e7a0e855376cef742a2431259d00b9ec0b8c3b81837",',
  '  contentDigest: "da41330ae7318fc723982e7a0e855376cef742a2431259d00b9ec0b8c3b81838",');
mutate("OM13", "openerp-profile.ts",
  '    if (!["id", "version", "default_language", "node_types", "relation_types"].includes(key)) problems.push("top:" + key);',
  "    void key;");
mutate("OM14", "openerp-profile.ts",
  '    if (keys !== "source,target") problems.push("relation:" + id);',
  "    void id; void keys;");
mutate("OM15", "openerp-governed.ts",
  "      type: c.type,",
  '      type: c.name === "constraint" ? c.type : "fabricated",');
mutate("OM16", "openerp-governed.ts",
  "      if (c.check !== undefined) out.push({ entity: e.entity, field: c.name, check: c.check, notNull: c.notNull });",
  '      if (c.check !== undefined) out.push({ entity: e.entity, field: c.name, check: c.name === "candidate_kind" ? c.check : "fabricated", notNull: c.notNull });');
mutate("OM17", "openerp-constraints.ts",
  '  { column: "invoice_lines.source_type", kind: "invoice_proposal_line", target: "invoice_proposal_lines.id", writer: "billing/invoice-service.ts:228" },',
  '  { column: "invoice_lines.source_type", kind: "invoice_proposal_line", target: "invoices.id", writer: "billing/invoice-service.ts:228" },');
mutate("OM18", "openerp-constraints.ts",
  '    "trigger bank_transactions_immutable_evidence before update or delete",',
  '    "trigger bank_transactions_nonexistent before update or delete",');
mutate("OM19", "openerp-constraints.ts",
  '  gate: "drop consumed_at or split emission from consumption",',
  '  gate: "no schema decision required",');

const baseline = await callbacks();
assert.equal(baseline.failures.length, 0, `pristine committed suite must pass: ${JSON.stringify(baseline.failures.slice(0, 8))}`);
console.log(`BASELINE ${baseline.count} committed callbacks passed`);
const evidence = [];
for (const mutation of mutations) {
  const result = await callbacks(mutation);
  assert.equal(result.count, baseline.count, `callback inventory changed: ${mutation.id}`);
  evidence.push({ id: mutation.id, file: mutation.file, executed: result.executed, killed: result.failures.length > 0, assertion: result.failures[0]?.name, testFile: result.failures[0]?.file });
  if (result.failures.length === 0) console.error(`SURVIVED ${mutation.id}`);
  else console.log(`KILLED ${mutation.id} by ${result.failures[0].file} > ${result.failures[0].name}`);
}
assert.equal(evidence.length, mutations.length, "every mutant must execute");
const survivors = evidence.filter(row => !row.killed);
assert.equal(survivors.length, 0, `surviving runtime mutants: ${JSON.stringify(survivors)}`);
console.log(`runtime mutants: ${evidence.length}/${mutations.length} killed by committed callbacks`);
// Compiler mutations must invalidate a committed @ts-expect-error proof (TS2578).
const compilerMutations = [
  ["enforcement-open", "openerp-constraints.ts",
    'export type ConstraintEnforcement = "database" | "application" | "application-convention" | "unverified";',
    'export type ConstraintEnforcement = "database" | "application" | "application-convention" | "unverified" | string;'],
  ["carrying-open", "openerp-constraints.ts",
    'export type TenantCarried = "tenant-carried-database" | "not-tenant-carried" | "unverified";',
    'export type TenantCarried = "tenant-carried-database" | "not-tenant-carried" | "unverified" | string;'],
  ["coverage-status-open", "openerp-mappings.ts",
    '  readonly status: "unverified";',
    "  readonly status: string;"],
  ["endpoint-target-optional", "openerp-profile.ts",
    "export interface OpenerpRelationEndpoint { readonly key: string; readonly from: string; readonly to: string }",
    "export interface OpenerpRelationEndpoint { readonly key: string; readonly from: string; readonly to?: string }"],
  ["task-question-optional", "openerp-registry.ts",
    "export interface AdmissionTask {\n  readonly field: string;\n  readonly owner: string;\n  readonly question: string;\n}",
    "export interface AdmissionTask {\n  readonly field: string;\n  readonly owner: string;\n  readonly question?: string;\n}"],
  ["column-notnull-optional", "openerp-governed.ts",
    "export interface OpenerpColumnRow {\n  readonly entity: string;\n  readonly name: string;\n  readonly type: string;\n  readonly notNull: boolean;",
    "export interface OpenerpColumnRow {\n  readonly entity: string;\n  readonly name: string;\n  readonly type: string;\n  readonly notNull?: boolean;"],
];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "openerp-type-proof-"));
try {
  fs.mkdirSync(path.join(scratch, "src"), { recursive: true });
  fs.cpSync(path.join(root, "src"), path.join(scratch, "src"), { recursive: true });
  fs.mkdirSync(path.join(scratch, "tests"));
  fs.copyFileSync(path.join(root, "tests/ontology-guardian-openerp-typeproof.test.ts"), path.join(scratch, "tests/ontology-guardian-openerp-typeproof.test.ts"));
  for (const file of ["tsconfig.json", "tsconfig.openerp-types.json"]) fs.copyFileSync(path.join(root, file), path.join(scratch, file));
  fs.symlinkSync(path.join(root, "node_modules"), path.join(scratch, "node_modules"));
  function tsc(extra = []) {
    return spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", path.join(scratch, "tsconfig.openerp-types.json"), ...extra], { encoding: "utf8", cwd: scratch });
  }
  const compilerBaseline = tsc();
  assert.equal(compilerBaseline.status, 0, compilerBaseline.stdout + compilerBaseline.stderr);
  const included = tsc(["--listFilesOnly"]);
  assert.equal(included.status, 0);
  const proof = path.join(scratch, "tests/ontology-guardian-openerp-typeproof.test.ts");
  assert.ok(included.stdout.split(/\r?\n/).includes(proof), "the type proof must actually be compiled");
  for (const [id, file, find, replacement] of compilerMutations) {
    const target = path.join(scratch, "src/ontology-guardian", file), original = fs.readFileSync(target, "utf8");
    assert.equal(original.split(find).length - 1, 1, `type mutant anchor ${id}`);
    fs.writeFileSync(target, original.replace(find, replacement));
    const result = tsc();
    fs.writeFileSync(target, original);
    assert.notEqual(result.status, 0, `SURVIVED type mutant ${id}`);
    assert.match(result.stdout, /ontology-guardian-openerp-typeproof\.test\.ts\(\d+,\d+\): error TS2578/, `type mutant ${id} must be killed by a committed proof`);
    console.log(`KILLED type-${id}`);
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log("openerp mutant proof: all runtime and compiler mutants killed");

const sha = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
fs.writeFileSync(path.join(root, "tests/ontology-guardian-openerp-mutant-evidence.json"), JSON.stringify({
  format: "openerp-mutant-proof/1", callbacks: baseline.count, runtimeCount: evidence.length,
  sourceSha256: Object.fromEntries(fs.readdirSync(source).filter(file => file.startsWith("openerp-")).map(file => [file, sha(path.join(source, file))])),
  testSha256: Object.fromEntries(TEST_FILES.map(file => [file, sha(path.join(root, "tests", file))])),
  fixtureSha256: Object.fromEntries(["openerp-ontology.json", "RETROCESSION-openerp-ontology.md", "export-ontology.mjs", "SHA256SUMS"].map(file => [file, sha(path.join(root, "tests/fixtures/openerp", file))])),
  runtime: evidence.sort((a,b) => a.id.localeCompare(b.id)), compiler: compilerMutations.map(([id]) => ({ id, killedBy: "TS2578 in committed type proof" })),
}, null, 2) + "\n");
stop();
