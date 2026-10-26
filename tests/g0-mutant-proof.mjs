// Node-only mutation proof. Each mutant transforms a source module IN MEMORY
// and executes the committed test callbacks using Vitest's actual matchers.
// Build/import/setup failures are errors, never counted as killed mutants.
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
chai.use(JestChaiExpect); chai.use(JestAsymmetricMatchers);
setState({ assertionCalls: 0, isExpectingAssertions: false }, chai.expect);
const runtimeKey = Symbol.for("g0.committed.callbacks");
let registered;
const suites = [];
globalThis[runtimeKey] = {
  expect: chai.expect,
  describe(name, fn) { suites.push(name); try { fn(); } finally { suites.pop(); } },
  it(name, fn) { registered.push({ name: [...suites, name].join(" > "), fn }); },
};

async function callbacks(mutation) {
  registered = [];
  let hits = 0;
  const result = await build({
    stdin: { contents: ['ontology-guardian-g0.test.ts', 'ontology-guardian-g0-admission.test.ts', 'ontology-guardian-g0-typeproof.test.ts'].map((f) => `import ${JSON.stringify(path.join(root, 'tests', f))};`).join('\n') + `\nexport { ENTRY_COMPLETENESS } from ${JSON.stringify(path.join(root, 'tests/ontology-guardian-g0.test.ts'))};`, resolveDir: root },
    bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
    plugins: [{ name: "g0-memory-mutants", setup(build) {
      build.onResolve({ filter: /^vitest$/ }, () => ({ path: "vitest", namespace: "g0" }));
      build.onLoad({ filter: /.*/, namespace: "g0" }, () => ({ contents: 'export const { describe, it, expect } = globalThis[Symbol.for("g0.committed.callbacks")];', loader: "js" }));
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
  // Unique fragment prevents ESM caching without changing source bytes.
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${mutation?.id ?? 'baseline'}`);
  const failures = [];
  for (const test of registered) { try { await test.fn(); } catch (error) { failures.push({ name: test.name, message: error.message }); } }
  return { count: registered.length, failures, entry: module.ENTRY_COMPLETENESS };
}

const mutations = [];
function mutate(id, file, find, replace) { mutations.push({ id, file, find, replace }); }
mutate("M1", "digests.ts", "    ruleSheets: (input.ruleSheets ?? []).map((p) => ({\n      contentDigest: p.contentDigest,\n      id: p.id,\n      version: p.version,\n    })),", "    ruleSheets: [],");
mutate("M2", "digests.ts", "    base: { contentDigest: input.base.contentDigest, id: input.base.id, version: input.base.version },", "    base: null,");
mutate("M3", "digests.ts", "    entries: input.entries.map((e) => ({ ...e })),", "    entries: input.entries.map((e) => {\n      const rest = { ...(e as Record<string, unknown>) };\n      delete rest[\"childRole\"];\n      return rest;\n    }),");
mutate("M4", "digests.ts", "    entries: input.entries.map((e) => ({ ...e })),", "    entries: input.entries.map((e) => {\n      const rest = { ...(e as Record<string, unknown>) };\n      delete rest[\"role\"];\n      return rest;\n    }),");
mutate("M5", "digests.ts", "    effectiveRuleSet: input.effectiveRuleSet.map((r) => ({\n      classification: r.classification,\n      code: r.code,\n      messageKey: r.messageKey,\n      ruleBody: r.ruleBody,\n      ruleId: r.ruleId,\n      severity: r.severity,\n    })),", "    effectiveRuleSet: input.effectiveRuleSet.map((r) => ({\n      classification: r.classification,\n      code: r.code,\n      messageKey: r.messageKey,\n      ruleBody: r.ruleBody,\n      ruleId: r.ruleId,\n    })),");
mutate("M6", "digests.ts", "      ruleBody: r.ruleBody,", "      ruleBody: JSON.parse(JSON.stringify(r.ruleBody, (k, v) => (k === \"bindings\" ? undefined : v))),");
mutate("M7", "digests.ts", "    portTypes: [...profile.portTypes],", "    portTypes: [...profile.portTypes],\n    themeRef: (profile.themeRef as unknown as string | null | undefined) ?? null,");
mutate("M8", "digests.ts", "    mappingDigest: input.mappingDigest ?? null,", "    mappingDigest: input.mappingDigest ?? null,\n    themeState: (input.themeState as unknown as string | null | undefined) ?? null,");
mutate("M9", "digests.ts", "    severityPolicyDigest: input.severityPolicyDigest,\n  };\n}\n\n/** Guardian-computable scopes (diagram/engram): SHA-256 over P-RESULT bytes. */", "    severityPolicyDigest: input.severityPolicyDigest,\n    catalogMetadata: (input.catalogMetadata as unknown) ?? null,\n  };\n}\n\n/** Guardian-computable scopes (diagram/engram): SHA-256 over P-RESULT bytes. */");
mutate("M10", "digests.ts", "  if (\"entryDigest\" in entry) throw new Error(\"entry-digest-self-embedded\");", "  if (\"entryDigest\" in entry) { void entry; }");
mutate("M11", "digests.ts", "        ? { declarationDigest: op.declarationDigest, newName: op.newName, op: op.op, subject: op.subject }", "        ? { declarationDigest: op.declarationDigest, op: op.op, subject: op.subject }");
mutate("M12", "digests.ts", "    entityTypes: [...profile.entityTypes],", "    entityTypes: [],");
mutate("M12b", "digests.ts", "  return value ?? null;", "  return value ?? 0;");
mutate("M13", "digests.ts", "    layers: input.layers.map((p) => ({ contentDigest: p.contentDigest, id: p.id, version: p.version })),", "    layers: [...input.layers]\n      .sort((a, b) => (a.id < b.id ? -1 : 1))\n      .map((p) => ({ contentDigest: p.contentDigest, id: p.id, version: p.version })),");
mutate("M14", "digests.ts", "export function entryDigestOf(entry: Record<string, unknown>): Digest {\n  if (\"entryDigest\" in entry) throw new Error(\"entry-digest-self-embedded\");\n  return sha256Hex(canonicalBytes(entry));\n}", "export function entryDigestOf(entry: Record<string, unknown>): Digest {\n  if (\"entryDigest\" in entry) throw new Error(\"entry-digest-self-embedded\");\n  return sha256Hex(\n    canonicalBytes(JSON.parse(JSON.stringify(entry, (k, v) => (k === \"owner\" ? undefined : v)))),\n  );\n}");
mutate("D1", "diagnostics.ts", "    throw new Error(`compiled-rule-wrong-phase:${String(id)}`);", "    void id;");
mutate("D2", "diagnostics.ts", "    if (ids.has(id)) throw new Error(`compiled-rule-duplicate:${String(id)}`);", "    void ids; void id;");
mutate("D3", "diagnostics.ts", "  assertValidNativeReport(report);\n  return report.entries.map((entry, index) =>", "  return report.entries.map((entry, index) =>");
mutate("D4", "diagnostics.ts", "  nativeEffectiveSeverity(severity);", "  void severity;");
mutate("A12", "diagnostics.ts", "    for (const b of bindings) assertValidBinding(b);", "    void bindings;");
mutate("A13", "digests.ts", "      throw new Error(\"delta-op-newname-required:rename-with-mapping\");", "      void record;");
mutate("A14", "digests.ts", "      throw new Error(`delta-op-newname-forbidden:${op.op}`);", "      void op;");
mutate("A1", "admission.ts", "      if (pb.corpusAuthority.tag !== PINNED_CORPUS_AUTHORITY_TAG) {\n        return \"bpmn-parity corpusAuthority tag mismatch\";\n      }", "      void pb;");
mutate("A2", "admission.ts", "        if (ruleSheetsApply(entry)) return `${receipt.receiptKind} null selection binding with rule sheets`;", "        void entry;");
mutate("A2b", "admission.ts", "  const digest = receipt.severityPolicyDigest ?? null;\n  if (digest === null) {\n    if (ruleSheetsApply(entry)) return `${kind} null selection binding with rule sheets`;\n    return null;\n  }", "  const digest = receipt.severityPolicyDigest ?? null;\n  if (digest === null) {\n    void entry;\n    return null;\n  }");
mutate("A3", "admission.ts", "    if (seen.has(v.ruleId)) return `receipt ${receiptKind} duplicate verdict for rule ${v.ruleId}`;", "    void seen;");
mutate("A4", "admission.ts", "      return `receipt ${receiptKind} forged off verdict on rule ${v.ruleId}`;", "      void v;");
mutate("A6", "admission.ts", "  if (receipt.proofBindings.severityPolicyDigest !== owner.severityPolicyDigest) {\n    return \"bpmn-parity owner selection digest mismatch\";\n  }", "  void receipt; void owner;");
mutate("A7", "admission.ts", "  if (q === undefined || q.claim !== \"oracle-witness\") {\n    return `receipt ${kind} names transitional-oracle without oracle-witness evidence`;\n  }\n  if (!isDigest(q.parityMatrixDigest)) {\n    return `receipt ${kind} oracle-witness parityMatrixDigest malformed`;\n  }\n  return null;\n}", "  void kind;\n  void q;\n  return null;\n}");
mutate("A9", "admission.ts", "      return `receipt ${kind} carries transition qualification on a retained check`;", "      void receipt;");
mutate("A10", "admission.ts", "    if (receipt.corpusDigest !== entry.corpusDigest) {\n      return `required receipt ${receipt.receiptKind} corpusDigest mismatch`;\n    }", "    void receipt; void entry;");
mutate("A11", "admission.ts", "    const roleProblem = checkRoleWithVerdicts(receipt, requireReference);\n    if (roleProblem !== null) return roleProblem;", "    void receipt; void requireReference;");

// Nine round-3 survivors, isolated at their exact preimage input.
mutate("R3-sheet-digest", "digests.ts", "contentDigest: p.contentDigest,\n      id: p.id", 'contentDigest: "a".repeat(64),\n      id: p.id');
mutate("R3-base-digest", "digests.ts", "contentDigest: input.base.contentDigest", 'contentDigest: "a".repeat(64)');
for (const key of ["code", "messageKey"]) mutate(`R3-result-${key}`, "digests.ts", `${key}: r.${key}`, `${key}: "omitted"`);
mutate("R3-mapping-version", "digests.ts", "version: input.mappingRef.version", 'version: "1.0.0"');
mutate("R3-retired-reason", "digests.ts", "retiredRules: input.retiredRules.map((r) => ({ reason: r.reason, ruleId: r.ruleId }))", 'retiredRules: input.retiredRules.map((r) => ({ reason: "omitted", ruleId: r.ruleId }))');
mutate("R3-mapping-phase", "digests.ts", "entries: input.entries.map((e) => ({ ...e }))", 'entries: input.entries.map((e) => { const { phase, ...rest } = e as any; return rest; })');

for (const [key, replacement] of [["bindings", "[]"], ["compiledRules", "[]"]]) {
  mutate(`native-expected-${key}`, "admission.ts", 'if (canonicalBytes(compiledOptions) !== canonicalBytes(selection.expectedCompiledOptions)) return false;', `if (canonicalBytes({ ...compiledOptions, ${key}: ${replacement} }) !== canonicalBytes({ ...selection.expectedCompiledOptions, ${key}: ${replacement} })) return false;`);
}
mutate("derived-obligations", "admission.ts", "const requiredReceipts = deriveRequirements(entry);", "const requiredReceipts = [];" );
mutate("sheetless-selection-duplication", "admission.ts", "for (const selection of ruleSheetsApply(entry) ? scope.selections : [{}])", "for (const selection of scope.selections)");
mutate("sheet-completeness", "admission.ts", 'if (canonicalBytes(selection.rules.map((r) => r.ruleId)) !== canonicalBytes(ids)) return "incomplete or duplicate selected rules";', 'void ids;');
mutate("sheet-settings-completeness", "admission.ts", 'if (publicSelection.settings.some((s) => !ids.includes(s.rule.replace(/^profile:/, "")))) return "unlisted effective setting";', 'void ids;');
mutate("public-policy-recomputation", "admission.ts", 'if (recomputedSelectionDigest(publicSelection) !== selection.severityPolicyDigest) return "selection digest does not recompute";', 'void publicSelection;');
mutate("public-effective-severity", "admission.ts", 'if (row.severity !== effectiveSeverityOf(row.ruleId, publicSelection.settings, entry)) return "selected severity mismatch";', 'void row;');
mutate("profile-pin-version", "admission.ts", 'if (!isExactVersion(pin.version)) return `${what} floating or unknown version`;', 'void pin;');
mutate("stack-pin-validation", "admission.ts", 'for (const pin of [...entry.stack, ...entry.ruleSheetPins])', 'for (const pin of entry.ruleSheetPins)');
mutate("bijection-evidence", "admission.ts", 'if (typeof receipt.roundTripEvidenceRef !== "string" || receipt.roundTripEvidenceRef.length === 0) return "bpmn-bijection round trip evidence missing";', 'void receipt;');
mutate("theme-expected-evidence", "admission.ts", 'if (canonicalBytes(receipt.semanticDigestsBefore) !== canonicalBytes(entry.themeBefore) || canonicalBytes(receipt.semanticDigestsAfter) !== canonicalBytes(entry.themeAfter)) return "theme-invariance expected evidence mismatch";', 'void receipt;');
mutate("private-owner-reference", "admission.ts", 'if (evidence.ownerReceiptRef !== owner.ownerReceiptRef) return "bpmn-parity owner evidence reference mismatch";', 'void evidence;');
mutate("family-literal", "admission.ts", 'if (receipt.receiptKind === "family-corpus" && receipt.family !== entry.family) return "family-corpus family mismatch";', 'void receipt;');
mutate("native-compiled-closure", "diagnostics.ts", 'if (Object.keys(options).sort().join(",") !== keys.sort().join(",")) throw new Error("compiled-options-fields");', 'void keys;');
mutate("native-rules-array", "diagnostics.ts", 'if (!Array.isArray(options.compiledRules)) throw new Error("compiled-options-rules-not-array");', 'void options;');
mutate("native-bindings-array", "diagnostics.ts", 'if (!Array.isArray(options.bindings)) throw new Error("compiled-options-bindings-not-array");', 'void options;');
mutate("whole-report-json", "diagnostics.ts", "    canonicalBytes(report);", "    void report;" );
mutate("coordinate-nonempty", "diagnostics.ts", 'if (targetId !== null && (typeof targetId !== "string" || targetId.length === 0)) failContract();', 'if (targetId !== null && typeof targetId !== "string") failContract();');

// Each rule-table arm has an independent binding mutation.
mutate("bijection-coverage", "admission.ts", 'if (receipt.descriptorCoverage.covered !== receipt.descriptorCoverage.total)', 'if (false)');
mutate("h2a-source-revision", "admission.ts", 'if (receipt.sourceRevision !== entry.sourceRevision) return "h2a-vocabulary sourceRevision mismatch";', 'void receipt;');
mutate("mem-descriptor-pin", "admission.ts", 'if (receipt.receiptKind === "mem-descriptor" && !pinsEqual([receipt.descriptorPin], [entry.profilePin]))', 'if (false)');
mutate("contract-schema-pin", "admission.ts", 'if (!pinsEqual([receipt.schemaPin], [entry.contractSchemaPin])) return "contract-verdict schemaPin mismatch";', 'void receipt;');
mutate("theme-styled-pin", "admission.ts", 'if (!pinsEqual([receipt.styledProfilePin], [entry.profilePin]))', 'if (false)');
for (const key of ["completeness", "constraints", "portTypes", "profile", "relationTypes"]) {
  const src = fs.readFileSync(path.join(source, 'digests.ts'), 'utf8');
  const match = src.match(new RegExp('    ' + key + ': ([^\\n]+),'));
  assert.ok(match, key);
  mutate('diagram-' + key, 'digests.ts', match[0], '    ' + key + ': null,');
}
for (const key of ["maxEntities", "maxRelations", "maxEndpointsPerRelation"]) mutate('limit-' + key, 'digests.ts', key + ': nullOf(profile.limits.' + key + ')', key + ': null');
for (const key of ["classification", "ruleId"]) mutate('result-' + key, 'digests.ts', '\n      ' + key + ': r.' + key, '\n      ' + key + ': "omitted"');
for (const key of ["chosenMin", "chosenMax", "chosenShape", "parentRole", "childRole", "from", "to", "role", "subject", "ruleId", "readinessPolicy", "chosenSeverity", "relationId"]) mutate('mapping-' + key, 'digests.ts', 'entries: input.entries.map((e) => ({ ...e }))', 'entries: input.entries.map((e) => { const { ' + key + ', ...rest } = e as any; return rest; })');

const baseline = await callbacks();
assert.equal(baseline.failures.length, 0, `pristine committed suite must pass: ${JSON.stringify(baseline.failures.slice(0, 3))}`);
console.log(`BASELINE ${baseline.count} committed callbacks passed`);
function leafPaths(value, path = []) {
  if (Array.isArray(value) && !value.length || value === null || typeof value !== "object") return [path];
  return Object.entries(value).flatMap(([k, v]) => leafPaths(v, [...path, k]));
}
for (const keys of leafPaths(baseline.entry)) {
  mutate('entry-' + keys.join('.'), 'digests.ts', '  return sha256Hex(canonicalBytes(entry));',
    `  const projected = structuredClone(entry); let cursor = projected; const keys = ${JSON.stringify(keys)}; for (const key of keys.slice(0, -1)) cursor = cursor?.[key]; if (cursor) delete cursor[keys.at(-1)]; return sha256Hex(canonicalBytes(projected));`);
}
let killed = 0;
for (const mutation of mutations) {
  const result = await callbacks(mutation);
  assert.equal(result.count, baseline.count, `setup ${mutation.id}: callback inventory changed`);
  if (result.failures.length === 0) { console.error(`SURVIVED ${mutation.id}`); continue; }
  killed++; console.log(`KILLED ${mutation.id}: ${result.failures[0].name}`);
}
console.log(`runtime mutants: ${killed}/${mutations.length} killed by committed callbacks`);
assert.equal(killed, mutations.length, "every runtime mutant must be killed");

// Compiler mutations must invalidate a committed @ts-expect-error proof
// (TS2578). Ordinary source errors are setup errors, not successful kills.
const compilerMutations = [
  ["published-corpus-required", "types.ts", 'readonly lifecycle: "published" | "deprecated" | "superseded"; readonly corpusRef: CorpusRef;', 'readonly lifecycle: "published" | "deprecated" | "superseded"; readonly corpusRef?: CorpusRef;'],
  ["published-digests-required", "types.ts", 'readonly corpusRef: CorpusRef; readonly digests: RecordDigests', 'readonly corpusRef: CorpusRef; readonly digests?: RecordDigests'],
  ["deprecated-reason", "types.ts", 'readonly deprecatedReason: string;', 'readonly deprecatedReason?: string;'],
  ["deprecated-date", "types.ts", 'readonly deprecatedAt: string;', 'readonly deprecatedAt?: string;'],
  ["superseded-successor", "types.ts", 'readonly lifecycle: "superseded"; readonly supersededBy: Pin;', 'readonly lifecycle: "superseded"; readonly supersededBy?: Pin;'],
  ["superseded-migration", "types.ts", 'readonly lifecycle: "superseded"; readonly migrationRef: string', 'readonly lifecycle: "superseded"; readonly migrationRef?: string'],
  ["guardian-code", "types.ts", 'readonly code: GuardianCode;', 'readonly code: string;'],
  ["unknown-skill-tool", "catalog.ts", 'export type SkillToolDescriptor = never;', 'export type SkillToolDescriptor = Record<string, unknown>;'],
  ["artifact-binding", "catalog.ts", 'Extract<ArtifactBinding, { artifactKind: K }>', 'ArtifactBinding'],
  ["preview-required", "application.ts", 'readonly effectiveProfile: unknown;', 'readonly effectiveProfile?: unknown;'],
  ["preview-fields", "application.ts", 'export interface ApplyPreview {', 'export interface ApplyPreview { readonly pins?: unknown;'],
  ["private-preview-closed", "application.ts", 'export type PrivateApplyPreview = never;', 'export type PrivateApplyPreview = unknown;'],
  ["oracle-witness-required", "catalog.ts", 'readonly validatorRole: "transitional-oracle"; readonly transitionQualification:', 'readonly validatorRole: "transitional-oracle"; readonly transitionQualification?:'],
  ["retained-claim-forbidden", "catalog.ts", 'readonly transitionQualification?: never', 'readonly transitionQualification?: TransitionQualification'],
];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "g0-type-proof-"));
try {
  fs.mkdirSync(path.join(scratch, 'src'), { recursive: true });
  fs.cpSync(source, path.join(scratch, 'src/ontology-guardian'), { recursive: true });
  fs.mkdirSync(path.join(scratch, 'tests'));
  fs.copyFileSync(path.join(root, 'tests/ontology-guardian-g0-typeproof.test.ts'), path.join(scratch, 'tests/ontology-guardian-g0-typeproof.test.ts'));
  for (const file of ['tsconfig.json', 'tsconfig.g0-types.json']) fs.copyFileSync(path.join(root, file), path.join(scratch, file));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(scratch, 'node_modules'));
  function tsc(extra = []) {
    return spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', path.join(scratch, 'tsconfig.g0-types.json'), ...extra], { encoding: 'utf8', cwd: scratch });
  }
  const compilerBaseline = tsc();
  assert.equal(compilerBaseline.status, 0, compilerBaseline.stdout + compilerBaseline.stderr);
  const included = tsc(['--listFilesOnly']);
  assert.equal(included.status, 0);
  const proof = path.join(scratch, 'tests/ontology-guardian-g0-typeproof.test.ts');
  assert.ok(included.stdout.split(/\r?\n/).includes(proof), 'the type proof must actually be compiled');
  for (const [id, file, find, replacement] of compilerMutations) {
    const target = path.join(scratch, 'src/ontology-guardian', file), original = fs.readFileSync(target, 'utf8');
    assert.equal(original.split(find).length - 1, 1, `type mutant anchor ${id}`);
    fs.writeFileSync(target, original.replace(find, replacement));
    const result = tsc();
    fs.writeFileSync(target, original);
    assert.notEqual(result.status, 0, `SURVIVED type mutant ${id}`);
    assert.match(result.stdout, /ontology-guardian-g0-typeproof\.test\.ts\(\d+,\d+\): error TS2578/, `type mutant ${id} must be killed by a committed proof`);
    console.log(`KILLED type-${id}`);
  }
  const configFile = path.join(scratch, 'tsconfig.g0-types.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.exclude.push('tests'); fs.writeFileSync(configFile, JSON.stringify(config));
  assert.ok(!tsc(['--listFilesOnly']).stdout.split(/\r?\n/).includes(proof), 'exclusion mutant must remove the proof and fail the inclusion assertion');
  console.log('KILLED type-proof-exclusion');
  console.log(`type mutants: ${compilerMutations.length + 1}/${compilerMutations.length + 1} killed; proof inclusion verified with --listFilesOnly`);
} finally { fs.rmSync(scratch, { recursive: true, force: true }); delete globalThis[runtimeKey]; }
