// Every runtime mutation executes committed callbacks with Vitest matchers.
// Import/compile/setup errors never count as killed. Bounded worker batches
// reclaim ESM module caches; each mutation selects the relevant test files.
import { build, stop } from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { createHash } from "node:crypto";
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
  file: "",
  expect: chai.expect,
  describe(name, fn) { suites.push(name); try { fn(); } finally { suites.pop(); } },
  it(name, fn) { registered.push({ file: this.file, name: [...suites, name].join(" > "), fn }); },
};
// The shim exports unbound functions; registration reads the current file
// through the shared runtime rather than depending on a call-site receiver.
globalThis[runtimeKey].it = (name, fn) => registered.push({ file: globalThis[runtimeKey].file, name: [...suites, name].join(" > "), fn });
const TEST_FILES = [
  "ontology-guardian-diagram-vectors.test.ts", "ontology-guardian-diagram-migrations.test.ts",
  "ontology-guardian-diagram-admission.test.ts", "ontology-guardian-diagram-typeproof.test.ts",
  "ontology-guardian-diagram-schemas.test.ts", "ontology-guardian-diagram-corpus.test.ts",
  "ontology-guardian-diagram-native-shapes.test.ts", "ontology-guardian-diagram-recovery.test.ts",
  "ontology-guardian-diagram-acceptance.test.ts",
];
function edit(contents, mutation) {
  if (mutation.kind === "schema") {
    const anchor = "const digest = sha256Hex(canonicalBytes(schema));";
    const inject = `if (id === ${JSON.stringify(mutation.schemaId)}) {
      schema = structuredClone(schema);
      const route = ${JSON.stringify(mutation.path)};
      let node = schema; for (const key of route.slice(0, -1)) node = node[key];
      const key = route.at(-1);
      ${mutation.operation === "required" ? `node[key] = node[key].filter(field => field !== ${JSON.stringify(mutation.field)});` : mutation.operation === "nullable" ? 'node[key] = [node[key], "null"];' : mutation.operation === "replace" ? `node[key] = ${JSON.stringify(mutation.value)};` : mutation.operation === "dependency" ? `delete node[key][${JSON.stringify(mutation.field)}];` : 'delete node[key];'}
    }
    ${anchor}`;
    assert.equal(contents.split(anchor).length - 1, 1, mutation.id);
    return contents.replace(anchor, inject);
  }
  if (mutation.kind === "corpus") {
    const anchor = "export const CORPUS_MANIFEST: readonly CorpusEntry[] = ";
    const end = ";\n\nexport const REQUIRED_CORPUS_IDS";
    assert.equal(contents.split(anchor).length - 1, 1, mutation.id);
    assert.equal(contents.split(end).length - 1, 1, mutation.id);
    return contents.replace(anchor, anchor + "(() => { const entries = ")
      .replace(end, `; entries.find(entry => entry.id === ${JSON.stringify(mutation.entryId)}).sha256 = "0".repeat(64); return entries; })()${end}`);
  }
  if (mutation.kind === "audit") {
    const anchor = "const [kind, ...path] = JSON.parse(auditKey) as string[];";
    assert.equal(contents.split(anchor).length - 1, 1, mutation.id);
    return contents.replace(anchor, anchor + ` if (prefix(${JSON.stringify(mutation.path)}, path)) continue;`);
  }
  assert.equal(contents.split(mutation.find).length - 1, 1, `setup ${mutation.id}: anchor must occur once`);
  return contents.replace(mutation.find, mutation.replace);
}
async function callbacks(mutation) {
  registered = [];
  let hits = 0;
  const result = await build({ stdin: {
    contents: TEST_FILES.map(file => `import ${JSON.stringify(path.join(root, "tests", file))};`).join("\n") +
      `\nexport { GOVERNED_SCHEMAS as schemaInventory } from ${JSON.stringify(path.join(source, "diagram-schemas.ts"))};\nexport { CORPUS_MANIFEST as corpusInventory } from ${JSON.stringify(path.join(source, "diagram-corpus.ts"))};\nexport { LOSSLESS_WITNESS, losslessLeafPaths } from ${JSON.stringify(path.join(root, "tests/ontology-guardian-diagram-recovery.test.ts"))};`,
    resolveDir: root }, bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
    plugins: [{ name: "diagram-memory-mutants", setup(build) {
      build.onResolve({ filter: /^vitest$/ }, () => ({ path: "vitest", namespace: "diagram" }));
      build.onLoad({ filter: /.*/, namespace: "diagram" }, () => ({ contents: 'export const { describe, it, expect } = globalThis[Symbol.for("diagram.committed.callbacks")];', loader: "js" }));
      build.onLoad({ filter: /ontology-guardian-diagram-.+\.test\.ts$/ }, args => ({ contents:
        `globalThis[Symbol.for("diagram.committed.callbacks")].file = ${JSON.stringify(path.basename(args.path))};\n` + fs.readFileSync(args.path, "utf8"), loader: "ts" }));
      build.onLoad({ filter: /ontology-guardian\/.+\.ts$/ }, args => {
        let contents = fs.readFileSync(args.path, "utf8");
        if (mutation && path.basename(args.path) === mutation.file) { contents = edit(contents, mutation); hits++; }
        return { contents, loader: "ts" };
      });
    } }],
  });
  if (mutation) assert.equal(hits, 1, `setup ${mutation.id}: module must load`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}#${mutation?.id ?? "baseline"}`);
  const failures = [];
  let executed = 0;
  for (const test of registered) {
    if (mutation && !mutation.scope.some(scope => test.file.endsWith(scope + ".test.ts"))) continue;
    executed++;
    try { await test.fn(); } catch (error) { failures.push({ name: test.name, file: test.file, message: error.message }); }
  }
  assert.ok(executed > 0, `empty test selection for ${mutation?.id ?? "baseline"}`);
  return { count: registered.length, executed, failures, exports: module };
}
const mutations = [];
function mutate(id, file, find, replace) { mutations.push({ id, file, find, replace }); }

mutate("DM1", "diagram-matrix-data.ts", 'o: "association", r: "realization",', 'o: "access", r: "realization",');
mutate("DM2", "diagram-profiles.ts", '{ name: "label", kind: "text", maxLength: 200 },', '{ name: "label", kind: "text", maxLength: 120 },');
mutate("DM3", "diagram-profiles.ts", 'enumeration("accessMode", ["write", "read", "unspecified", "read-write"])', 'enumeration("accessMode", ["write", "read", "read-write"])');
mutate("DM4", "diagram-profiles.ts", 'value: "composite", max: 1', 'value: "composite", max: 2');
mutate("DM5", "diagram-profiles.ts", "integer: true, min: -1, max: 9007199254740991", "integer: true, min: 0, max: 9007199254740991");
mutate("DM6", "diagram-migrations.ts", 'if (raw === "*") return { ok: true, lower: 0, upper: -1 };', 'if (raw === "*") return { ok: true, lower: 1, upper: -1 };');
mutate("DM7", "diagram-migrations.ts", 'if (key === "collapsed" && resolved.effective.container) { delete nextAttrs[key]; continue; }', "if (false) continue;");
mutate("DM8", "diagram-migrations.ts", 'if (!allows(rel.type, srcType, tgtType)) return fail(`relations.${id}.endpoints`, "relationship-matrix-violation");', "void srcType; void tgtType;");
mutate("DM9", "diagram-migrations.ts", "if (!declaredStereotype.extends.some(kind => resolved.effective.chain.includes(kind))) {", "if (false) {");
mutate("DM10", "diagram-registry.ts", "{ from: GENERIC_V1_PIN, supersededBy: GENERIC_V2_PIN, migrationRef: GENERIC_MIGRATION_ID },", "{ from: GENERIC_V1_PIN, supersededBy: GENERIC_V2_PIN, migrationRef: ARCHIMATE_MIGRATION_ID },");
mutate("DM11", "diagram-schemas.ts", 'const DIAGRAM_VALUE_REQUIRED = ["contractPin", "entities", "legends", "categoryTokens"];', 'const DIAGRAM_VALUE_REQUIRED = ["contractPin", "entities", "legends"];');
mutate("DM16", "diagram-profiles.ts", 'pattern: KEY_PATTERN, patternName: "key",', 'patternName: "key",');
mutate("DM17", "diagram-migrations.ts", "if (moveCount > 0 && options.contractPin === undefined) {", "if (false) {");
mutate("DM18", "diagram-migrations.ts", "if (existingText[move.slot] !== undefined && existingText[move.slot] !== move.value) {", "if (false) {");
mutate("DM19", "diagram-migrations.ts", "return Object.keys(attributes).sort().map((key) => [key, attributes[key]!] as [string, MigAttribute]);", "return Object.keys(attributes).map((key) => [key, attributes[key]!] as [string, MigAttribute]);");
mutate("DM20", "diagram-migrations.ts", "return { extends: values };", "return { extends: [] };");
mutate("DM21", "diagram-migrations.ts", 'return formForEntityType(resolved.ok ? resolved.effective.baseId : entity.type);', 'return "container";');
mutate("DM22", "diagram-profiles.ts", '{ kind: "hierarchy", relationType: "contains", hierarchyId: "containment", parentRole: "parent", childRole: "child" },', '{ kind: "hierarchy", relationType: "contains", hierarchyId: "containment", parentRole: "child", childRole: "child" },');
mutate("DM23", "diagram-schemas.ts", 'const ICON_GRAMMAR = { type: "string", minLength: 1, maxLength: 40, pattern: "^[a-z][a-z0-9-]*$" };', 'const ICON_GRAMMAR = { type: "string", minLength: 1, maxLength: 40 };');
mutate("DM24", "diagram-oracle.ts", 'expected: allowed.has(`${relationType}\\0${sourceType}\\0${targetType}`) ? "allowed" : "rejected",', 'expected: allowed.has(`${relationType}\\0${sourceType}\\0${targetType}`) ? "rejected" : "allowed",');
mutate("DM25", "diagram-oracle.ts", '{ input: "1", expected: { ok: true, lower: 1, upper: 1 } },', '{ input: "1", expected: { ok: true, lower: 2, upper: 1 } },');
// Round-3 extension: one mutant per lossless-check path, schema
// constraint, view-scoping rule and corpus manifest entry.
mutate("DM26", "diagram-migrations.ts", 'entities[id] = { ...structuredClone(entity), profile: "archimate@2", type: residualType, attributes: nextAttrs };', 'entities[id] = { ...structuredClone(entity), profile: "archimate@2", type: residualType, attributes: {} };');
mutate("DM27", "diagram-schemas.ts", '["documentId", "schemaVersion", "revision", "profileRefs", "typeDefinitions", "entities", "relations", "ports", "resources", "extensions"]', '["documentId", "schemaVersion", "revision", "profileRefs", "typeDefinitions", "relations", "ports", "resources", "extensions"]');
mutate("DM28", "diagram-migrations.ts", "presentationMoves[`${view.viewId}/${occId}`] = reportSlots;", "presentationMoves[occId] = reportSlots;");
mutate("DM29", "diagram-corpus.ts", "b19967fe65483abdbf0e271f197e13691904e4b087c1542de23c52e2ad4f45c3", "0000000000000000000000000000000000000000000000000000000000000000");
mutate("DM30", "diagram-migrations.ts", "groups[groupId] = { ...(existing ?? { id: groupId }), id: groupId, occurrence: occId, collapsed: true };", "groups[groupId] = { ...(existing ?? { id: groupId }), id: groupId, occurrence: occId, collapsed: false };");
mutate("DM31", "diagram-migrations.ts", "if (own.effective.baseId !== mapped) {", "if (false) {");
mutate("DM12", "diagram-skeletons.ts", '{ kind: "max-entities-of-type", entityType: "container", max: 64 },', '{ kind: "max-entities-of-type", entityType: "container", max: 65 },');
mutate("DM13", "diagram-profiles.ts", "limits: { maxEntities: 100000, maxRelations: 500000, maxEndpointsPerRelation: 8 },", "limits: { maxEntities: 5, maxRelations: 500000, maxEndpointsPerRelation: 8 },");
mutate("DM14", "diagram-migrations.ts", 'if (upper !== -1 && lower > upper) return { ok: false, reason: "multiplicity-invalid" };', "if (upper !== -1 && lower > upper) return { ok: true, lower, upper };");
mutate("DM15", "diagram-registry.ts", 'renderer: "transitional:ds-diagram-core-executor-unqualified",', 'renderer: "ds-diagram-core-executor@1",');
mutate("DM32", "diagram-migrations.ts", "source = transactionSnapshot(source, options.views);", "source = structuredClone(source);");
mutate("DM33", "diagram-migrations.ts", "const shape = checkViewShape(view);", "const shape = null;");
mutate("DM34", "diagram-migrations.ts", "if (loss !== null) {", "if (false) {");
mutate("DM35", "diagram-migrations.ts", "collectLeaves(state, [], out);", "const { domainNote, ...retained } = state; collectLeaves(retained, [], out);");
mutate("DM36", "diagram-migrations.ts", 'const byView = path.length === 1 && path[0] === "views";', "const byView = false;");
mutate("DM37", "diagram-migrations.ts", 'if (!isRecord(definition) || !Array.isArray(definition["attributes"])) return null;', 'if (!isRecord(definition)) return null; if (Array.isArray(definition["attributes"])) return {};');
mutate("DM38", "diagram-migrations.ts", "const resolved = resolveEffectiveType(declaration, definitions, id);", 'const resolved = { ok: true, effective: { baseId: "node", attrs: {}, chain: [], container: false } };');
mutate("DM39", "diagram-migrations.ts", 'if (native === undefined && definition["profile"] !== targetDeclaration["id"]) {', "if (false) {");
mutate("DM40", "diagram-migrations.ts", "nextDefinitions[id] = { ...definition, baseType: mappedBase };", 'nextDefinitions[id] = { ...definition, baseType: "element" };');
mutate("DM41", "diagram-migrations.ts", 'const parents = native !== undefined ? (native["supertypes"] ?? []) : [refinementBaseOf(definition)];', "const parents = native !== undefined ? [] : [refinementBaseOf(definition)];");
mutate("DM42", "diagram-migrations.ts", 'if (!resolved.ok || !resolved.effective.chain.includes("stereotype")) return { invalid: true };', 'if (!resolved.ok || record.type !== "stereotype") return { invalid: true };');
mutate("DM43", "diagram-migrations.ts", "if (!declaredStereotype.extends.some(kind => resolved.effective.chain.includes(kind))) {", "if (!declaredStereotype.extends.includes(entity.type)) {");
mutate("DM44", "diagram-migrations.ts", "const semanticFailure = checkSemanticShape(semantic);", "const semanticFailure = null;");
mutate("DM45", "diagram-migrations.ts", "const schemas: Record<string, unknown> = Object.create(null);", "const schemas: Record<string, unknown> = {};");
mutate("DM46", "diagram-migrations.ts", "const nextAttrs: Record<string, MigAttribute> = structuredClone(entity.attributes) as Record<string, MigAttribute>;\n    const moved", "const nextAttrs: Record<string, MigAttribute> = {};\n    const moved");
mutate("DM47", "diagram-view-shape.ts", "const check = Object.hasOwn(required, key) ? required[key] : Object.hasOwn(optional, key) ? optional[key] : undefined;", "const check = required[key] ?? optional[key];");
mutate("DM48", "diagram-schemas.ts", '  "type-definition-conflict",\n', "");
mutations.at(-1).scope = ["recovery"];

mutate("DM49", "diagram-migrations.ts", 'Object.keys(mapping).length !== 1', 'false');
mutate("DM50", "diagram-migrations.ts", 'const entityTypes = mapping.entityTypes;', 'const entityTypes = mapping;');

function scopeOf(file) {
  if (file === "diagram-view-shape.ts" || file === "diagram-document-shape.ts") return ["native-shapes", "recovery"];
  if (file === "diagram-schemas.ts") return ["schemas", "native-shapes"];
  if (file === "diagram-corpus.ts") return ["corpus"];
  if (file === "diagram-migrations.ts") return ["migrations", "recovery"];
  if (file === "diagram-oracle.ts") return ["vectors", "acceptance"];
  return ["vectors", "admission"];
}
if (!isMainThread) {
  try {
    for (const mutation of workerData.mutations) {
      const result = await callbacks(mutation);
      assert.equal(result.count, workerData.baselineCount, `callback inventory changed: ${mutation.id}`);
      parentPort.postMessage({ id: mutation.id, file: mutation.file, kind: mutation.kind ?? "runtime", path: mutation.path,
        executed: result.executed, killed: result.failures.length > 0, assertion: result.failures[0]?.name, testFile: result.failures[0]?.file });
    }
  } catch (error) { parentPort.postMessage({ setupError: error.stack }); process.exitCode = 1; }
  finally { stop(); parentPort.close(); }
} else {
  const baseline = await callbacks();
  assert.equal(baseline.failures.length, 0, `pristine committed suite must pass: ${JSON.stringify(baseline.failures.slice(0, 8))}`);
  console.log(`BASELINE ${baseline.count} committed callbacks passed`);
  for (const mutation of mutations) mutation.scope ??= scopeOf(mutation.file);
  const schemaMutants = [];
  const keywords = new Set(["type", "required", "additionalProperties", "enum", "const", "$ref", "anyOf", "allOf", "items", "minLength", "maxLength", "minimum", "maximum", "pattern", "minItems", "uniqueItems", "dependentRequired"]);
  for (const { pin, schema } of Object.values(baseline.exports.schemaInventory)) {
    const walk = (node, route = [], propertyMap = false) => {
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        const at = [...route, key];
        if (!propertyMap && keywords.has(key)) {
          const base = { kind: "schema", file: "diagram-schemas.ts", schemaId: pin.id, path: at, scope: ["schemas", "native-shapes"] };
          if (key === "required") for (const field of value) schemaMutants.push({ ...base, operation: "required", field });
          else if (key === "dependentRequired") for (const field of Object.keys(value)) schemaMutants.push({ ...base, operation: "dependency", field });
          else schemaMutants.push({ ...base, operation: key === "type" ? "nullable" : key === "additionalProperties" || key === "uniqueItems" ? "replace" : "delete", value: key === "additionalProperties" ? true : false });
        }
        if (propertyMap) walk(value, at);
        else if (key === "properties" || key === "$defs") walk(value, at, true);
        else if (["anyOf", "allOf"].includes(key)) value.forEach((child, index) => walk(child, [...at, index]));
        else if (["items", "additionalProperties", "if", "then", "else"].includes(key)) walk(value, at);
      }
    }; walk(schema);
  }
  schemaMutants.forEach((mutation, index) => mutation.id = "SC" + (index + 1));
  const corpusMutants = baseline.exports.corpusInventory.map((entry, index) => ({ id: "CP" + (index + 1), kind: "corpus", file: "diagram-corpus.ts", entryId: entry.id, scope: ["corpus"] }));
  const witness = baseline.exports.LOSSLESS_WITNESS;
  const auditMutants = baseline.exports.losslessLeafPaths(witness).map((raw, index) => {
    const route = raw.map(String);
    if (route[0] === "views") { route[1] = witness.views[Number(raw[1])].viewId; if (route.at(-1) === "viewId") route.splice(1); }
    if (route[0] === "typeDefinitions" && route[2] === "attributes") {
      route[3] = witness.typeDefinitions[raw[1]].attributes[Number(raw[3])].name;
      if (route.at(-1) === "name") route.splice(3);
    }
    return { id: "LP" + (index + 1), kind: "audit", file: "diagram-migrations.ts", path: route, sourcePath: raw, scope: ["recovery"] };
  });
  mutations.push(...schemaMutants, ...corpusMutants, ...auditMutants);
  const evidence = [];
  const batches = []; for (let i = 0; i < mutations.length; i += 16) batches.push(mutations.slice(i, i + 16));
  let next = 0;
  async function lane() {
    while (next < batches.length) {
      const batch = batches[next++];
      await new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { mutations: batch, baselineCount: baseline.count } });
        worker.on("message", result => { if (result.setupError) reject(new Error(result.setupError)); else {
          evidence.push(result); if (!result.killed) console.error(`SURVIVED ${result.id} ${JSON.stringify(result.path ?? "")}`);
        } });
        worker.on("error", reject); worker.on("exit", code => code === 0 ? resolve() : reject(new Error(`mutation worker exit ${code}`)));
      });
      console.log(`MUTANTS ${evidence.length}/${mutations.length}; killed ${evidence.filter(row => row.killed).length}`);
    }
  }
  await Promise.all([lane(), lane()]);
  assert.equal(evidence.length, mutations.length, "every mutant must execute");
  const survivors = evidence.filter(row => !row.killed);
  assert.equal(survivors.length, 0, `surviving runtime mutants: ${JSON.stringify(survivors)}`);
  console.log(`runtime mutants: ${evidence.length}/${mutations.length} killed by committed callbacks`);
// Compiler mutations must invalidate a committed @ts-expect-error proof (TS2578).
const compilerMutations = [
  ["archimate-mapping-wrapper-optional", "diagram-migrations.ts", "readonly entityTypes: Readonly<Record<string, string>>;", "readonly entityTypes?: Readonly<Record<string, string>>;"],
  ["outcome-open", "diagram-migrations.ts", 'export type MigrationOutcome = "ok" | "refused";', 'export type MigrationOutcome = "ok" | "refused" | "partial";'],
  ["binding-version-open", "diagram-profiles.ts", 'readonly compatibilityMatrixVersion: "1";', "readonly compatibilityMatrixVersion: string;"],
  ["report-target-optional", "diagram-migrations.ts", "readonly target: null;", "readonly target: MigDocument | null;"],
  ["refusal-reason-closed", "diagram-migrations.ts", '"relationship-matrix-violation";', '"relationship-matrix-violation" | string;'],
  ["document-entities-optional", "diagram-migrations.ts", "readonly entities: Readonly<Record<string, MigEntity>>;", "readonly entities?: Readonly<Record<string, MigEntity>>;"],
  ["supersession-ref-optional", "diagram-registry.ts", "readonly migrationRef: string;", "readonly migrationRef?: string;"],
  ["native-refinement-dictionary", "diagram-native-types.ts", "readonly attributes: readonly NativeAttributeSchema[];", "readonly attributes: readonly NativeAttributeSchema[] | Record<string, unknown>;"],
  ["native-anchor-string", "diagram-native-types.ts", "readonly anchor: number;", "readonly anchor: number | string;"],
  ["native-reference-valueless", "diagram-native-types.ts", 'readonly kind: "text" | "date" | "enum" | "reference"; readonly value: string', 'readonly kind: "text" | "date" | "enum" | "reference"; readonly value?: string'],
  ["native-view-presentation-optional", "diagram-native-types.ts", "readonly presentation: NativePresentationState;", "readonly presentation?: NativePresentationState;"],
  ["native-semantic-version-optional", "diagram-native-types.ts", "readonly schemaVersion: { readonly major: number; readonly minor: number };", "readonly schemaVersion?: { readonly major: number; readonly minor: number };"],
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

  const sha = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  fs.writeFileSync(path.join(root, "tests/ontology-guardian-diagram-mutant-evidence.json"), JSON.stringify({
    format: "diagram-mutant-proof/2", callbacks: baseline.count, runtimeCount: evidence.length,
    schemaChecks: schemaMutants.length, corpusEntries: corpusMutants.length, losslessPaths: auditMutants.length,
    sourceSha256: Object.fromEntries(fs.readdirSync(source).filter(file => file.startsWith("diagram-")).map(file => [file, sha(path.join(source, file))])),
    testSha256: Object.fromEntries(TEST_FILES.map(file => [file, sha(path.join(root, "tests", file))])),
    corpusIndexSha256: sha(path.join(root, "tests/fixtures/pinned-sources/corpus/index.json")),
    runtime: evidence.sort((a,b) => a.id.localeCompare(b.id)), compiler: compilerMutations.map(([id]) => ({ id, killedBy: "TS2578 in committed type proof" })),
  }, null, 2) + "\n");
  stop();
}
