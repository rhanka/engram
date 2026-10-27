// Diagram-lot mutation proof, same style as tests/g0-mutant-proof.mjs.
// Each mutant transforms a diagram source module IN MEMORY and executes the
// committed diagram callbacks using Vitest's actual matchers. Build/import/
// setup failures are errors, never counted as killed mutants.
import { build } from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as chai from "chai";
import { JestChaiExpect, JestAsymmetricMatchers, setState } from "@vitest/expect";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src/ontology-guardian");
process.env.DIAGRAM_TESTS_DIR = path.join(root, "tests");
chai.use(JestChaiExpect); chai.use(JestAsymmetricMatchers);
setState({ assertionCalls: 0, isExpectingAssertions: false }, chai.expect);
const runtimeKey = Symbol.for("diagram.committed.callbacks");
let registered;
const suites = [];
globalThis[runtimeKey] = {
  expect: chai.expect,
  describe(name, fn) { suites.push(name); try { fn(); } finally { suites.pop(); } },
  it(name, fn) { registered.push({ name: [...suites, name].join(" > "), fn }); },
};

const TEST_FILES = [
  "ontology-guardian-diagram-vectors.test.ts",
  "ontology-guardian-diagram-migrations.test.ts",
  "ontology-guardian-diagram-admission.test.ts",
  "ontology-guardian-diagram-typeproof.test.ts",
  "ontology-guardian-diagram-schemas.test.ts",
  "ontology-guardian-diagram-corpus.test.ts",
];

async function callbacks(mutation) {
  registered = [];
  let hits = 0;
  const result = await build({
    stdin: {
      contents: TEST_FILES.map((f) => `import ${JSON.stringify(path.join(root, "tests", f))};`).join("\n"),
      resolveDir: root,
    },
    bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
    plugins: [{ name: "diagram-memory-mutants", setup(build) {
      build.onResolve({ filter: /^vitest$/ }, () => ({ path: "vitest", namespace: "diagram" }));
      build.onLoad({ filter: /.*/, namespace: "diagram" }, () => ({ contents: "export const { describe, it, expect } = globalThis[Symbol.for(\"diagram.committed.callbacks\")];", loader: "js" }));
      build.onLoad({ filter: /ontology-guardian\/.+\.ts$/ }, (args) => {
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
  if (mutation) assert.equal(hits, 1, `setup ${mutation.id}: target module must load`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}#${mutation?.id ?? "baseline"}`);
  void module;
  const failures = [];
  for (const test of registered) { try { await test.fn(); } catch (error) { failures.push({ name: test.name, message: error.message }); } }
  return { count: registered.length, failures };
}

const mutations = [];
function mutate(id, file, find, replace) { mutations.push({ id, file, find, replace }); }

mutate("DM1", "diagram-matrix-data.ts", 'o: "association", r: "realization",', 'o: "access", r: "realization",');
mutate("DM2", "diagram-profiles.ts", '{ name: "label", kind: "text", maxLength: 200 },', '{ name: "label", kind: "text", maxLength: 120 },');
mutate("DM3", "diagram-profiles.ts", 'enumeration("accessMode", ["write", "read", "unspecified", "read-write"])', 'enumeration("accessMode", ["write", "read", "read-write"])');
mutate("DM4", "diagram-profiles.ts", 'value: "composite", max: 1', 'value: "composite", max: 2');
mutate("DM5", "diagram-profiles.ts", "integer: true, min: -1, max: 9007199254740991", "integer: true, min: 0, max: 9007199254740991");
mutate("DM6", "diagram-migrations.ts", 'if (raw === "*") return { ok: true, lower: 0, upper: -1 };', 'if (raw === "*") return { ok: true, lower: 1, upper: -1 };');
mutate("DM7", "diagram-migrations.ts", 'if (key === "collapsed" && resolved.effective.container) continue;', "if (false) continue;");
mutate("DM8", "diagram-migrations.ts", 'if (!allows(rel.type, srcType, tgtType)) return fail(`relations.${id}.endpoints`, "relationship-matrix-violation");', "void srcType; void tgtType;");
mutate("DM9", "diagram-migrations.ts", "if (!declaredStereotype.extends.includes(entity.type)) {", "if (false) {");
mutate("DM10", "diagram-registry.ts", "{ from: GENERIC_V1_PIN, supersededBy: GENERIC_V2_PIN, migrationRef: GENERIC_MIGRATION_ID },", "{ from: GENERIC_V1_PIN, supersededBy: GENERIC_V2_PIN, migrationRef: ARCHIMATE_MIGRATION_ID },");
mutate("DM11", "diagram-schemas.ts", 'const DIAGRAM_VALUE_REQUIRED = ["contractPin", "entities", "legends", "categoryTokens"];', 'const DIAGRAM_VALUE_REQUIRED = ["contractPin", "entities", "legends"];');
mutate("DM16", "diagram-profiles.ts", 'pattern: KEY_PATTERN, patternName: "key",', 'patternName: "key",');
mutate("DM17", "diagram-migrations.ts", "if (moveCount > 0 && options.contractPin === undefined) {", "if (false) {");
mutate("DM18", "diagram-migrations.ts", "if (existingText[move.slot] !== undefined && existingText[move.slot] !== move.value) {", "if (false) {");
mutate("DM19", "diagram-migrations.ts", "return Object.keys(attributes).sort().map((key) => [key, attributes[key]!] as [string, MigAttribute]);", "return Object.keys(attributes).map((key) => [key, attributes[key]!] as [string, MigAttribute]);");
mutate("DM20", "diagram-migrations.ts", "return { extends: values };", "return { extends: [] };");
mutate("DM21", "diagram-migrations.ts", 'form: existing["form"] ?? formForEntityType(source.entities[view.entityOccurrences[occId]!.entity]?.type ?? "node"),', 'form: "container",');
mutate("DM22", "diagram-profiles.ts", '{ kind: "hierarchy", relationType: "contains", hierarchyId: "containment", parentRole: "parent", childRole: "child" },', '{ kind: "hierarchy", relationType: "contains", hierarchyId: "containment", parentRole: "child", childRole: "child" },');
mutate("DM23", "diagram-schemas.ts", 'const ICON_GRAMMAR = { type: "string", minLength: 1, maxLength: 40, pattern: "^[a-z][a-z0-9-]*$" };', 'const ICON_GRAMMAR = { type: "string", minLength: 1, maxLength: 40 };');
mutate("DM24", "diagram-oracle.ts", 'expected: allowed.has(`${relationType}\\0${sourceType}\\0${targetType}`) ? "allowed" : "rejected",', 'expected: allowed.has(`${relationType}\\0${sourceType}\\0${targetType}`) ? "rejected" : "allowed",');
mutate("DM25", "diagram-oracle.ts", '{ input: "1", expected: { ok: true, lower: 1, upper: 1 } },', '{ input: "1", expected: { ok: true, lower: 2, upper: 1 } },');
// Round-3 extension: one mutant per lossless-check path, schema
// constraint, view-scoping rule and corpus manifest entry.
mutate("DM26", "diagram-migrations.ts", "entities[id] = { id, profile: \"archimate@2\", type: mapped, attributes: nextAttrs };", "entities[id] = { id, profile: \"archimate@2\", type: mapped, attributes: {} };");
mutate("DM27", "diagram-schemas.ts", 'required: ["documentId", "revision", "profileRefs", "entities", "relations"],', 'required: ["documentId", "revision", "profileRefs", "relations"],');
mutate("DM28", "diagram-migrations.ts", "presentationMoves[`${view.viewId}/${occId}`] = reportSlots;", "presentationMoves[occId] = reportSlots;");
mutate("DM29", "diagram-corpus.ts", "b19967fe65483abdbf0e271f197e13691904e4b087c1542de23c52e2ad4f45c3", "0000000000000000000000000000000000000000000000000000000000000000");
mutate("DM30", "diagram-migrations.ts", "groups[groupId] = { ...(existing ?? { id: groupId }), id: groupId, occurrence: occId, collapsed: true };", "groups[groupId] = { ...(existing ?? { id: groupId }), id: groupId, occurrence: occId, collapsed: false };");
mutate("DM31", "diagram-migrations.ts", "if (own.effective.baseId !== mapped) {", "if (false) {");
mutate("DM12", "diagram-skeletons.ts", '{ kind: "max-entities-of-type", entityType: "container", max: 64 },', '{ kind: "max-entities-of-type", entityType: "container", max: 65 },');
mutate("DM13", "diagram-profiles.ts", "limits: { maxEntities: 100000, maxRelations: 500000, maxEndpointsPerRelation: 8 },", "limits: { maxEntities: 5, maxRelations: 500000, maxEndpointsPerRelation: 8 },");
mutate("DM14", "diagram-migrations.ts", 'if (upper !== -1 && lower > upper) return { ok: false, reason: "multiplicity-invalid" };', "if (upper !== -1 && lower > upper) return { ok: true, lower, upper };");
mutate("DM15", "diagram-registry.ts", 'renderer: "transitional:ds-diagram-core-executor-unqualified",', 'renderer: "ds-diagram-core-executor@1",');

const baseline = await callbacks();
assert.equal(baseline.failures.length, 0, `pristine committed suite must pass: ${JSON.stringify(baseline.failures.slice(0, 3))}`);
console.log(`BASELINE ${baseline.count} committed callbacks passed`);
let killed = 0;
for (const mutation of mutations) {
  const result = await callbacks(mutation);
  assert.equal(result.count, baseline.count, `setup ${mutation.id}: callback inventory changed`);
  if (result.failures.length === 0) { console.error(`SURVIVED ${mutation.id}`); continue; }
  killed++; console.log(`KILLED ${mutation.id}: ${result.failures[0].name}`);
}
console.log(`runtime mutants: ${killed}/${mutations.length} killed by committed callbacks`);
assert.equal(killed, mutations.length, "every runtime mutant must be killed");

// Compiler mutations must invalidate a committed @ts-expect-error proof (TS2578).
const compilerMutations = [
  ["outcome-open", "diagram-migrations.ts", 'export type MigrationOutcome = "ok" | "refused";', 'export type MigrationOutcome = "ok" | "refused" | "partial";'],
  ["binding-version-open", "diagram-profiles.ts", 'readonly compatibilityMatrixVersion: "1";', "readonly compatibilityMatrixVersion: string;"],
  ["report-target-optional", "diagram-migrations.ts", "readonly target: null;", "readonly target: MigDocument | null;"],
  ["refusal-reason-closed", "diagram-migrations.ts", '"relationship-matrix-violation";', '"relationship-matrix-violation" | string;'],
  ["document-entities-optional", "diagram-migrations.ts", "readonly entities: Readonly<Record<string, MigEntity>>;", "readonly entities?: Readonly<Record<string, MigEntity>>;"],
  ["supersession-ref-optional", "diagram-registry.ts", "readonly migrationRef: string;", "readonly migrationRef?: string;"],
];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-type-proof-"));
try {
  fs.mkdirSync(path.join(scratch, "src"), { recursive: true });
  fs.cpSync(source, path.join(scratch, "src/ontology-guardian"), { recursive: true });
  fs.mkdirSync(path.join(scratch, "tests"));
  fs.copyFileSync(path.join(root, "tests/ontology-guardian-diagram-typeproof.test.ts"), path.join(scratch, "tests/ontology-guardian-diagram-typeproof.test.ts"));
  for (const file of ["tsconfig.json", "tsconfig.diagram-types.json"]) fs.copyFileSync(path.join(root, file), path.join(scratch, file));
  fs.symlinkSync(path.join(root, "node_modules"), path.join(scratch, "node_modules"));
  function tsc(extra = []) {
    return spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", path.join(scratch, "tsconfig.diagram-types.json"), ...extra], { encoding: "utf8", cwd: scratch });
  }
  const compilerBaseline = tsc();
  assert.equal(compilerBaseline.status, 0, compilerBaseline.stdout + compilerBaseline.stderr);
  const included = tsc(["--listFilesOnly"]);
  assert.equal(included.status, 0);
  const proof = path.join(scratch, "tests/ontology-guardian-diagram-typeproof.test.ts");
  assert.ok(included.stdout.split(/\r?\n/).includes(proof), "the type proof must actually be compiled");
  for (const [id, file, find, replacement] of compilerMutations) {
    const target = path.join(scratch, "src/ontology-guardian", file), original = fs.readFileSync(target, "utf8");
    assert.equal(original.split(find).length - 1, 1, `type mutant anchor ${id}`);
    fs.writeFileSync(target, original.replace(find, replacement));
    const result = tsc();
    fs.writeFileSync(target, original);
    assert.notEqual(result.status, 0, `SURVIVED type mutant ${id}`);
    assert.match(result.stdout, /ontology-guardian-diagram-typeproof\.test\.ts\(\d+,\d+\): error TS2578/, `type mutant ${id} must be killed by a committed proof`);
    console.log(`KILLED type-${id}`);
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log("diagram mutant proof: all runtime and compiler mutants killed");
